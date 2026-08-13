import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  getVaultBindings,
  requireVaultMember,
} from "../../../../lib/cloudflare";

export const maxDuration = 300;

const MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024;
const MAX_KNOWN_SPEAKERS = 4;

type TrackRow = {
  id: string;
  storage_path: string | null;
};

type VoiceReferenceRow = {
  id: string;
  display_name: string;
  storage_path: string;
  mime_type: string;
};

type DiarizedSegment = {
  start?: number;
  end?: number;
  text?: string;
  speaker?: string;
};

type DiarizedTranscription = {
  text?: string;
  segments?: DiarizedSegment[];
  error?: { message?: string };
};

type CleanupResult = {
  transcript?: unknown;
};

type SecretEnv = CloudflareEnv & {
  OPENAI_API_KEY?: string;
};

type TranscriptSegment = {
  start: number;
  end: number;
  speaker: string | null;
  text: string;
};

type KnownSpeaker = {
  name: string;
  dataUrl: string;
};

function fileNameFromPath(path: string) {
  return path.split("/").pop() || "recording.mp3";
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (
    let offset = 0;
    offset < bytes.length;
    offset += chunkSize
  ) {
    const chunk = bytes.subarray(
      offset,
      Math.min(offset + chunkSize, bytes.length),
    );

    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function arrayBufferToDataUrl(
  buffer: ArrayBuffer,
  contentType: string,
) {
  return `data:${contentType};base64,${bytesToBase64(
    new Uint8Array(buffer),
  )}`;
}

async function loadKnownSpeakers(
  db: D1Database,
  files: R2Bucket,
): Promise<KnownSpeaker[]> {
  const rows = await db
    .prepare(
      `SELECT
         id,
         display_name,
         storage_path,
         mime_type
       FROM voice_references
       ORDER BY display_name COLLATE NOCASE ASC
       LIMIT ?`,
    )
    .bind(MAX_KNOWN_SPEAKERS)
    .all<VoiceReferenceRow>();

  const speakers: KnownSpeaker[] = [];

  for (const row of rows.results) {
    const object = await files.get(row.storage_path);

    if (!object) {
      console.warn(
        `Voice reference file is missing for ${row.display_name}.`,
      );
      continue;
    }

    speakers.push({
      name: row.display_name,
      dataUrl: arrayBufferToDataUrl(
        await object.arrayBuffer(),
        row.mime_type ||
          object.httpMetadata?.contentType ||
          "audio/wav",
      ),
    });
  }

  return speakers;
}

function usableSegments(
  response: DiarizedTranscription,
): TranscriptSegment[] {
  return (response.segments || [])
    .filter(
      (
        segment,
      ): segment is DiarizedSegment & {
        start: number;
        end: number;
        text: string;
      } =>
        Number.isFinite(segment.start) &&
        Number.isFinite(segment.end) &&
        Boolean(segment.text?.trim()),
    )
    .map((segment) => ({
      start: segment.start,
      end: segment.end,
      speaker:
        segment.speaker?.trim() || null,
      text: segment.text.trim(),
    }));
}

function formatSpeakerTranscript(
  segments: TranscriptSegment[],
  fallbackText: string,
  knownSpeakerNames: string[],
) {
  if (!segments.length) {
    return fallbackText.trim();
  }

  const speakerIds = [
    ...new Set(
      segments
        .map((segment) => segment.speaker)
        .filter(
          (
            speaker,
          ): speaker is string =>
            Boolean(speaker),
        ),
    ),
  ];

  if (speakerIds.length <= 1) {
    return segments
      .map((segment) => segment.text)
      .join(" ")
      .trim();
  }

  const knownSet = new Set(
    knownSpeakerNames.map((name) =>
      name.toLocaleLowerCase(),
    ),
  );

  const unknownSpeakerNumbers =
    new Map<string, number>();

  let nextNumber = 1;

  for (const speaker of speakerIds) {
    if (
      knownSet.has(
        speaker.toLocaleLowerCase(),
      )
    ) {
      continue;
    }

    unknownSpeakerNumbers.set(
      speaker,
      nextNumber,
    );

    nextNumber += 1;
  }

  const turns: Array<{
    speaker: string | null;
    text: string;
  }> = [];

  for (const segment of segments) {
    const previous = turns.at(-1);

    if (
      previous?.speaker ===
      segment.speaker
    ) {
      previous.text =
        `${previous.text} ${segment.text}`;
    } else {
      turns.push({
        speaker: segment.speaker,
        text: segment.text,
      });
    }
  }

  return turns
    .map((turn) => {
      if (!turn.speaker) {
        return turn.text;
      }

      if (
        knownSet.has(
          turn.speaker.toLocaleLowerCase(),
        )
      ) {
        return `${turn.speaker}: ${turn.text}`;
      }

      const number =
        unknownSpeakerNumbers.get(
          turn.speaker,
        );

      return number
        ? `Speaker ${number}: ${turn.text}`
        : turn.text;
    })
    .join("\n\n");
}

function removeSpeakerLabels(
  value: string,
) {
  return value
    .replace(
      /(^|\n)\s*(?:Speaker\s+\d+|[^:\n]{1,80})\s*:\s*/gi,
      "$1",
    )
    .trim();
}

function wordTokens(value: string) {
  return (
    value.match(
      /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu,
    ) || []
  ).map((word) =>
    word
      .toLocaleLowerCase()
      .replaceAll("’", "'"),
  );
}

function hasTheSameWords(
  original: string,
  cleaned: string,
) {
  const originalWords =
    wordTokens(
      removeSpeakerLabels(
        original,
      ),
    );

  const cleanedWords =
    wordTokens(
      removeSpeakerLabels(
        cleaned,
      ),
    );

  return (
    originalWords.length ===
      cleanedWords.length &&
    originalWords.every(
      (word, index) =>
        word ===
        cleanedWords[index],
    )
  );
}

function transcriptLabels(
  transcript: string,
) {
  return [
    ...transcript.matchAll(
      /(^|\n)\s*([^:\n]{1,80})\s*:/g,
    ),
  ].map((match) =>
    match[2].trim(),
  );
}

function preservesSpeakerLabels(
  original: string,
  cleaned: string,
) {
  const originalLabels =
    transcriptLabels(original);

  if (!originalLabels.length) {
    return true;
  }

  const cleanedLabels =
    transcriptLabels(cleaned);

  return originalLabels.every(
    (label) =>
      cleanedLabels.includes(label),
  );
}

async function cleanTranscriptFormatting(
  transcript: string,
  openAiKey: string,
) {
  if (!transcript.trim()) {
    return transcript;
  }

  try {
    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${openAiKey}`,
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          model:
            "gpt-4.1-mini",
          temperature: 0,
          response_format: {
            type: "json_object",
          },
          messages: [
            {
              role: "system",
              content: [
                "You are formatting a word-for-word family interview transcript for archival preservation.",
                "The transcript may contain speaker labels such as Bill:, Dan:, Ivy:, Speaker 1:, or Speaker 2:.",
                "Keep every existing speaker label exactly where it belongs.",
                "Do not rename the speakers.",
                "Correct capitalization at the beginning of sentences.",
                "Add or correct periods, commas, question marks, exclamation points, quotation marks, apostrophes, and other normal punctuation.",
                "Correct spacing around punctuation.",
                "Use paragraph breaks between speaker turns.",
                "IMPORTANT: Every spoken word must remain exactly the same and in exactly the same order.",
                "Do not replace words.",
                "Do not rearrange words.",
                "Do not add words.",
                "Do not remove words.",
                "Do not fix grammar by changing words.",
                "Do not remove filler words.",
                "Do not remove repeated words.",
                "Do not summarize.",
                "Do not rewrite awkward speech.",
                "Only punctuation, capitalization, spacing, and paragraph breaks may change.",
                "Return JSON only with transcript as a string.",
              ].join(" "),
            },
            {
              role: "user",
              content: transcript,
            },
          ],
        }),
      },
    );

    const responseBody =
      (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };

    const content =
      responseBody.choices?.[0]
        ?.message?.content;

    if (
      !response.ok ||
      !content
    ) {
      return transcript;
    }

    const parsed =
      JSON.parse(
        content,
      ) as CleanupResult;

    const cleaned =
      typeof parsed.transcript ===
      "string"
        ? parsed.transcript.trim()
        : "";

    if (!cleaned) {
      return transcript;
    }

    if (
      !hasTheSameWords(
        transcript,
        cleaned,
      )
    ) {
      console.warn(
        "Transcript cleanup changed spoken words. Keeping original transcription.",
      );
      return transcript;
    }

    if (
      !preservesSpeakerLabels(
        transcript,
        cleaned,
      )
    ) {
      console.warn(
        "Transcript cleanup changed speaker labels. Keeping original transcription.",
      );
      return transcript;
    }

    return cleaned;
  } catch (error) {
    console.error(
      "Automatic punctuation cleanup failed. Keeping original transcription.",
      error,
    );
    return transcript;
  }
}

async function replaceTranscriptSegments(
  db: D1Database,
  trackId: string,
  segments: TranscriptSegment[],
) {
  await db
    .prepare(
      `DELETE FROM transcript_segments
       WHERE audio_track_id = ?`,
    )
    .bind(trackId)
    .run();

  if (!segments.length) {
    return;
  }

  for (
    let index = 0;
    index < segments.length;
    index += 1
  ) {
    const segment =
      segments[index];

    await db
      .prepare(
        `INSERT INTO transcript_segments (
           id,
           audio_track_id,
           segment_index,
           start_seconds,
           end_seconds,
           speaker_label,
           text
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        trackId,
        index,
        segment.start,
        segment.end,
        segment.speaker,
        segment.text,
      )
      .run();
  }
}

export async function POST(
  request: Request,
) {
  let trackId:
    | string
    | null = null;

  try {
    const member =
      await requireVaultMember(
        request,
      );

    if (!member.isAdmin) {
      return Response.json(
        {
          error:
            "Only a Vault administrator can transcribe recordings.",
        },
        { status: 403 },
      );
    }

    const body =
      (await request.json()) as {
        trackId?: unknown;
      };

    trackId =
      typeof body.trackId ===
      "string"
        ? body.trackId.trim()
        : null;

    if (!trackId) {
      return Response.json(
        {
          error:
            "A recording was not specified.",
        },
        { status: 400 },
      );
    }

    const { db, files } =
      await getVaultBindings();

    const track = await db
      .prepare(
        `SELECT
           id,
           storage_path
         FROM audio_tracks
         WHERE id = ?
           AND trashed_at IS NULL`,
      )
      .bind(trackId)
      .first<TrackRow>();

    if (!track?.storage_path) {
      return Response.json(
        {
          error:
            "This recording is missing its private storage file.",
        },
        { status: 404 },
      );
    }

    const { env } =
      await getCloudflareContext({
        async: true,
      });

    const openAiKey =
      (env as SecretEnv)
        .OPENAI_API_KEY;

    if (!openAiKey) {
      return Response.json(
        {
          error:
            "The transcription service has not been configured yet.",
        },
        { status: 500 },
      );
    }

    await db
      .prepare(
        `UPDATE audio_tracks
         SET transcription_status = 'processing',
             transcription_error = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(track.id)
      .run();

    const audioObject =
      await files.get(
        track.storage_path,
      );

    if (!audioObject) {
      throw new Error(
        "The audio file could not be found in private storage.",
      );
    }

    if (
      audioObject.size >
      MAX_TRANSCRIPTION_BYTES
    ) {
      throw new Error(
        "This file is over 25 MB. Please upload a smaller MP3 or split the recording first.",
      );
    }

    const audio = new Blob(
      [
        await audioObject.arrayBuffer(),
      ],
      {
        type:
          audioObject
            .httpMetadata
            ?.contentType ||
          "application/octet-stream",
      },
    );

    const knownSpeakers =
      await loadKnownSpeakers(
        db,
        files,
      );

    const form =
      new FormData();

    form.append(
      "model",
      "gpt-4o-transcribe-diarize",
    );

    form.append(
      "response_format",
      "diarized_json",
    );

    form.append(
      "chunking_strategy",
      "auto",
    );

    form.append(
      "language",
      "en",
    );

    form.append(
      "file",
      audio,
      fileNameFromPath(
        track.storage_path,
      ),
    );

    for (const speaker of knownSpeakers) {
      form.append(
        "known_speaker_names[]",
        speaker.name,
      );

      form.append(
        "known_speaker_references[]",
        speaker.dataUrl,
      );
    }

    const openAiResponse =
      await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${openAiKey}`,
          },
          body: form,
        },
      );

    const responseBody =
      (await openAiResponse.json()) as
        DiarizedTranscription;

    if (
      !openAiResponse.ok ||
      !responseBody.text
    ) {
      throw new Error(
        responseBody.error
          ?.message ||
          "OpenAI could not transcribe this recording.",
      );
    }

    const segments =
      usableSegments(
        responseBody,
      );

    const rawTranscript =
      formatSpeakerTranscript(
        segments,
        responseBody.text,
        knownSpeakers.map(
          (speaker) => speaker.name,
        ),
      );

    const transcript =
      await cleanTranscriptFormatting(
        rawTranscript,
        openAiKey,
      );

    await replaceTranscriptSegments(
      db,
      track.id,
      segments,
    );

    await db
      .prepare(
        `UPDATE audio_tracks
         SET transcript = ?,
             transcription_status = 'complete',
             transcription_error = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        transcript,
        track.id,
      )
      .run();

    return Response.json({
      transcript,
      segments,
      knownSpeakers:
        knownSpeakers.map(
          (speaker) => speaker.name,
        ),
    });
  } catch (error) {
    if (trackId) {
      try {
        const { db } =
          await getVaultBindings();

        const message =
          error instanceof Error
            ? error.message
            : "Transcription failed.";

        await db
          .prepare(
            `UPDATE audio_tracks
             SET transcription_status = 'failed',
                 transcription_error = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
          )
          .bind(
            message,
            trackId,
          )
          .run();
      } catch (updateError) {
        console.error(
          "Could not save the transcription error.",
          updateError,
        );
      }
    }

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The recording could not be transcribed.",
      },
      { status: 500 },
    );
  }
}

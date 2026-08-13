import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  getVaultBindings,
  requireVaultMember,
} from "../../../../lib/cloudflare";

const MAX_CHUNK_BYTES =
  24 * 1024 * 1024;

const MAX_KNOWN_SPEAKERS = 4;

type SecretEnv = CloudflareEnv & {
  OPENAI_API_KEY?: string;
};

type DiarizedSegment = {
  id?: string;
  start?: number;
  end?: number;
  text?: string;
  speaker?: string;
};

type DiarizedTranscription = {
  text?: string;
  segments?: DiarizedSegment[];
  error?: {
    message?: string;
  };
};

type TranscriptSegment = {
  start: number;
  end: number;
  speaker: string | null;
  text: string;
};

type VoiceReferenceRow = {
  display_name: string;
  storage_path: string;
  mime_type: string;
};

type KnownSpeaker = {
  name: string;
  dataUrl: string;
};

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

  if (
    speakerIds.length <= 1
  ) {
    return segments
      .map(
        (segment) =>
          segment.text,
      )
      .join(" ")
      .trim();
  }

  const knownSet =
    new Set(
      knownSpeakerNames.map(
        (name) =>
          name.toLocaleLowerCase(),
      ),
    );

  const speakerNumbers =
    new Map<string, number>();

  const usedNumbers =
    new Set<number>();

  for (
    const speaker of speakerIds
  ) {
    const knownMatch =
      speaker.match(
        /^Speaker\s+([1-4])$/i,
      );

    if (knownMatch) {
      const number =
        Number(
          knownMatch[1],
        );

      speakerNumbers.set(
        speaker,
        number,
      );

      usedNumbers.add(
        number,
      );
    }
  }

  let nextNumber = 1;

  for (
    const speaker of speakerIds
  ) {
    if (
      knownSet.has(
        speaker.toLocaleLowerCase(),
      ) ||
      speakerNumbers.has(
        speaker,
      )
    ) {
      continue;
    }

    while (
      usedNumbers.has(
        nextNumber,
      )
    ) {
      nextNumber += 1;
    }

    speakerNumbers.set(
      speaker,
      nextNumber,
    );

    usedNumbers.add(
      nextNumber,
    );

    nextNumber += 1;
  }

  const turns: Array<{
    speaker: string | null;
    text: string;
  }> = [];

  for (
    const segment of segments
  ) {
    const previous =
      turns.at(-1);

    if (
      previous?.speaker ===
      segment.speaker
    ) {
      previous.text =
        `${previous.text} ${segment.text}`;
    } else {
      turns.push({
        speaker:
          segment.speaker,
        text:
          segment.text,
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
        speakerNumbers.get(
          turn.speaker,
        );

      return number
        ? `Speaker ${number}: ${turn.text}`
        : turn.text;
    })
    .join("\n\n");
}

function bytesToBase64(
  bytes: Uint8Array,
) {
  let binary = "";

  const chunkSize =
    0x8000;

  for (
    let offset = 0;
    offset < bytes.length;
    offset += chunkSize
  ) {
    const chunk =
      bytes.subarray(
        offset,
        Math.min(
          offset + chunkSize,
          bytes.length,
        ),
      );

    binary +=
      String.fromCharCode(
        ...chunk,
      );
  }

  return btoa(binary);
}

async function fileToDataUrl(
  file: File,
) {
  const bytes =
    new Uint8Array(
      await file.arrayBuffer(),
    );

  const contentType =
    file.type ||
    "audio/wav";

  return `data:${contentType};base64,${bytesToBase64(
    bytes,
  )}`;
}

async function loadSavedVoiceReferences() {
  const {
    db,
    files,
  } =
    await getVaultBindings();

  const rows =
    await db
      .prepare(
        `SELECT
           display_name,
           storage_path,
           mime_type
         FROM voice_references
         ORDER BY display_name COLLATE NOCASE ASC
         LIMIT ?`,
      )
      .bind(
        MAX_KNOWN_SPEAKERS,
      )
      .all<VoiceReferenceRow>();

  const speakers: KnownSpeaker[] =
    [];

  for (
    const row of rows.results
  ) {
    const object =
      await files.get(
        row.storage_path,
      );

    if (!object) {
      console.warn(
        `Voice reference file is missing for ${row.display_name}.`,
      );

      continue;
    }

    const bytes =
      new Uint8Array(
        await object.arrayBuffer(),
      );

    const contentType =
      row.mime_type ||
      object.httpMetadata
        ?.contentType ||
      "audio/wav";

    speakers.push({
      name:
        row.display_name,
      dataUrl:
        `data:${contentType};base64,${bytesToBase64(
          bytes,
        )}`,
    });
  }

  return speakers;
}

export async function POST(
  request: Request,
) {
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

    const form =
      await request.formData();

    const file =
      form.get("file");

    if (
      !(file instanceof File) ||
      file.size === 0
    ) {
      return Response.json(
        {
          error:
            "The transcription chunk is missing.",
        },
        { status: 400 },
      );
    }

    if (
      file.size >
      MAX_CHUNK_BYTES
    ) {
      return Response.json(
        {
          error:
            "This transcription chunk is still too large.",
        },
        { status: 413 },
      );
    }

    const suppliedNames =
      form
        .getAll(
          "knownSpeakerName",
        )
        .filter(
          (
            value,
          ): value is string =>
            typeof value ===
              "string" &&
            Boolean(
              value.trim(),
            ),
        )
        .map((value) =>
          value.trim(),
        );

    const suppliedReferences =
      form
        .getAll(
          "knownSpeakerReference",
        )
        .filter(
          (
            value,
          ): value is File =>
            value instanceof File &&
            value.size > 0,
        );

    if (
      suppliedNames.length !==
      suppliedReferences.length
    ) {
      return Response.json(
        {
          error:
            "Known speaker names and voice samples do not match.",
        },
        { status: 400 },
      );
    }

    const savedSpeakers =
      await loadSavedVoiceReferences();

    const knownSpeakers: KnownSpeaker[] =
      [...savedSpeakers];

    const knownNamesLower =
      new Set(
        knownSpeakers.map(
          (speaker) =>
            speaker.name.toLocaleLowerCase(),
        ),
      );

    for (
      let index = 0;
      index <
        suppliedNames.length &&
      knownSpeakers.length <
        MAX_KNOWN_SPEAKERS;
      index += 1
    ) {
      const name =
        suppliedNames[index];

      if (
        knownNamesLower.has(
          name.toLocaleLowerCase(),
        )
      ) {
        continue;
      }

      knownSpeakers.push({
        name,
        dataUrl:
          await fileToDataUrl(
            suppliedReferences[
              index
            ],
          ),
      });

      knownNamesLower.add(
        name.toLocaleLowerCase(),
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

    const openAiForm =
      new FormData();

    openAiForm.append(
      "model",
      "gpt-4o-transcribe-diarize",
    );

    openAiForm.append(
      "response_format",
      "diarized_json",
    );

    openAiForm.append(
      "chunking_strategy",
      "auto",
    );

    openAiForm.append(
      "language",
      "en",
    );

    openAiForm.append(
      "file",
      file,
      file.name ||
        "transcription-chunk.wav",
    );

    for (
      const speaker of
      knownSpeakers
    ) {
      openAiForm.append(
        "known_speaker_names[]",
        speaker.name,
      );

      openAiForm.append(
        "known_speaker_references[]",
        speaker.dataUrl,
      );
    }

    const response =
      await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${openAiKey}`,
          },
          body:
            openAiForm,
        },
      );

    const result =
      (await response.json()) as
        DiarizedTranscription;

    if (
      !response.ok ||
      !result.text
    ) {
      return Response.json(
        {
          error:
            result.error
              ?.message ||
            "OpenAI could not transcribe this section of the recording.",
        },
        {
          status:
            response.status >= 400
              ? response.status
              : 500,
        },
      );
    }

    const segments =
      usableSegments(
        result,
      );

    const transcript =
      formatSpeakerTranscript(
        segments,
        result.text,
        knownSpeakers.map(
          (speaker) =>
            speaker.name,
        ),
      );

    if (!transcript.trim()) {
      return Response.json(
        {
          error:
            "No speech was detected in this section.",
        },
        { status: 422 },
      );
    }

    return Response.json({
      transcript,
      segments,
      knownSpeakers:
        knownSpeakers.map(
          (speaker) =>
            speaker.name,
        ),
    });
  } catch (error) {
    console.error(
      "Transcription chunk failed.",
      error,
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The transcription chunk could not be processed.",
      },
      { status: 500 },
    );
  }
}

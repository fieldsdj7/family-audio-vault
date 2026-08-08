import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  getVaultBindings,
  requireVaultMember,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

export const maxDuration = 300;

const MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024;

type TrackRow = {
  id: string;
  storage_path: string | null;
};

type DiarizedSegment = {
  text?: string;
  speaker?: string;
};

type DiarizedTranscription = {
  text?: string;
  segments?: DiarizedSegment[];
  error?: { message?: string };
};

type SecretEnv = CloudflareEnv & {
  OPENAI_API_KEY?: string;
};

function fileNameFromPath(path: string) {
  return path.split("/").pop() || "recording.mp3";
}

function formatSpeakerTranscript(response: DiarizedTranscription) {
  const segments = (response.segments || []).filter(
    (segment): segment is DiarizedSegment & { text: string; speaker: string } =>
      Boolean(segment.text?.trim() && segment.speaker),
  );

  const speakers = [...new Set(segments.map((segment) => segment.speaker))];
  if (speakers.length <= 1) {
    return (
      response.text?.trim() ||
      segments.map((segment) => segment.text.trim()).join(" ")
    );
  }

  const speakerNumbers = new Map(
    speakers.map((speaker, index) => [speaker, index + 1]),
  );
  const turns: Array<{ speaker: string; text: string }> = [];

  for (const segment of segments) {
    const text = segment.text.trim();
    const previousTurn = turns.at(-1);

    if (previousTurn?.speaker === segment.speaker) {
      previousTurn.text = `${previousTurn.text} ${text}`;
    } else {
      turns.push({ speaker: segment.speaker, text });
    }
  }

  return turns
    .map(
      (turn) =>
        `Speaker ${speakerNumbers.get(turn.speaker)}: ${turn.text}`,
    )
    .join("\n\n");
}

export async function POST(request: Request) {
  let trackId: string | null = null;

  try {
    const member = await requireVaultMember(request);

    if (!member.isAdmin) {
      return Response.json(
        { error: "Only a Vault administrator can transcribe recordings." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as { trackId?: unknown };
    trackId = typeof body.trackId === "string" ? body.trackId.trim() : null;

    if (!trackId) {
      return Response.json(
        { error: "A recording was not specified." },
        { status: 400 },
      );
    }

    const { db, files } = await getVaultBindings();
    const track = await db
      .prepare(
        `SELECT id, storage_path
         FROM audio_tracks
         WHERE id = ?
           AND trashed_at IS NULL`,
      )
      .bind(trackId)
      .first<TrackRow>();

    if (!track?.storage_path) {
      return Response.json(
        { error: "This recording is missing its private storage file." },
        { status: 404 },
      );
    }

    const { env } = await getCloudflareContext({ async: true });
    const openAiKey = (env as SecretEnv).OPENAI_API_KEY;

    if (!openAiKey) {
      return Response.json(
        { error: "The transcription service has not been configured yet." },
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

    const audioObject = await files.get(track.storage_path);
    if (!audioObject) {
      throw new Error("The audio file could not be found in private storage.");
    }

    if (audioObject.size > MAX_TRANSCRIPTION_BYTES) {
      throw new Error(
        "This file is over 25 MB. Please upload a smaller MP3 or split the recording first.",
      );
    }

    const audio = new Blob([await audioObject.arrayBuffer()], {
      type: audioObject.httpMetadata?.contentType || "application/octet-stream",
    });
    const form = new FormData();
    form.append("model", "gpt-4o-transcribe-diarize");
    form.append("response_format", "diarized_json");
    form.append("chunking_strategy", "auto");
    form.append("file", audio, fileNameFromPath(track.storage_path));

    const openAiResponse = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}` },
        body: form,
      },
    );

    const responseBody =
      (await openAiResponse.json()) as DiarizedTranscription;
    if (!openAiResponse.ok || !responseBody.text) {
      throw new Error(
        responseBody.error?.message ||
          "OpenAI could not transcribe this recording.",
      );
    }

    const transcript = formatSpeakerTranscript(responseBody);
    await db
      .prepare(
        `UPDATE audio_tracks
         SET transcript = ?,
             transcription_status = 'complete',
             transcription_error = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(transcript, track.id)
      .run();

    return Response.json({ transcript });
  } catch (error) {
    if (trackId) {
      try {
        const { db } = await getVaultBindings();
        const message =
          error instanceof Error ? error.message : "Transcription failed.";

        await db
          .prepare(
            `UPDATE audio_tracks
             SET transcription_status = 'failed',
                 transcription_error = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
          )
          .bind(message, trackId)
          .run();
      } catch (updateError) {
        console.error("Could not save the transcription error.", updateError);
      }
    }

    return vaultAccessResponse(error);
  }
}

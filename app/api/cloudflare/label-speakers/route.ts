import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  getVaultBindings,
  requireVaultMember,
  VaultAccessError,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

export const maxDuration = 60;

type TrackRow = {
  id: string;
  transcript: string | null;
};

type SpeakerResult = {
  transcript?: unknown;
  speakerCount?: unknown;
};

type SecretEnv = CloudflareEnv & {
  OPENAI_API_KEY?: string;
};

function withoutSpeakerLabels(value: string) {
  return value
    .replace(/(^|\n)\s*Speaker\s+\d+\s*:\s*/gi, "$1")
    .trim();
}

function wordTokens(value: string) {
  return (
    value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []
  ).map((word) =>
    word.toLocaleLowerCase().replaceAll("’", "'"),
  );
}

function hasTheSameWords(original: string, labeled: string) {
  const originalWords = wordTokens(withoutSpeakerLabels(original));
  const labeledWords = wordTokens(withoutSpeakerLabels(labeled));

  return (
    originalWords.length === labeledWords.length &&
    originalWords.every((word, index) => word === labeledWords[index])
  );
}

export async function POST(request: Request) {
  let trackId: string | null = null;

  try {
    const member = await requireVaultMember(request);

    if (!member.isAdmin) {
      return Response.json(
        { error: "Only a Vault administrator can label speakers." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      trackId?: unknown;
      transcript?: unknown;
    };
    trackId = typeof body.trackId === "string" ? body.trackId.trim() : null;

    if (!trackId) {
      return Response.json(
        { error: "A recording was not specified." },
        { status: 400 },
      );
    }

    const { db } = await getVaultBindings();
    const track = await db
      .prepare(
        `SELECT id, transcript
         FROM audio_tracks
         WHERE id = ?
           AND trashed_at IS NULL`,
      )
      .bind(trackId)
      .first<TrackRow>();

    if (!track) {
      return Response.json(
        { error: "The recording could not be found." },
        { status: 404 },
      );
    }

    const suppliedTranscript =
      typeof body.transcript === "string" ? body.transcript.trim() : "";
    const originalTranscript = suppliedTranscript || track.transcript?.trim() || "";

    if (!originalTranscript) {
      return Response.json(
        {
          error:
            "This recording needs a transcript before speakers can be labeled.",
        },
        { status: 400 },
      );
    }

    const { env } = await getCloudflareContext({ async: true });
    const openAiKey = (env as SecretEnv).OPENAI_API_KEY;
    if (!openAiKey) {
      return Response.json(
        { error: "The speaker-label service has not been configured yet." },
        { status: 500 },
      );
    }

    const openAiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "Separate a word-for-word family interview transcript into speaker turns.",
                "The interviewer usually asks the numbered questions and the family member gives the longer answers.",
                "Use conversational context to assign short phrases such as yes, okay, and follow-up questions.",
                "Do not correct, rewrite, summarize, add, remove, or reorder any spoken words.",
                "Only insert paragraph breaks and labels in the exact form Speaker 1: and Speaker 2:.",
                "Use the same number for each person throughout the entire transcript.",
                "Return JSON only with transcript as a string and speakerCount as a number.",
              ].join(" "),
            },
            { role: "user", content: originalTranscript },
          ],
        }),
      },
    );

    const responseBody = (await openAiResponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    const content = responseBody.choices?.[0]?.message?.content;
    if (!openAiResponse.ok || !content) {
      throw new Error(
        responseBody.error?.message ||
          "OpenAI could not separate the speakers.",
      );
    }

    let parsed: SpeakerResult;
    try {
      parsed = JSON.parse(content) as SpeakerResult;
    } catch {
      throw new Error(
        "OpenAI returned speaker labels in an unexpected format. Please try again.",
      );
    }

    const labeledTranscript =
      typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
    const speakerCount = Number(parsed.speakerCount || 0);
    if (
      !labeledTranscript ||
      speakerCount < 2 ||
      !/Speaker\s+1\s*:/i.test(labeledTranscript) ||
      !/Speaker\s+2\s*:/i.test(labeledTranscript)
    ) {
      throw new Error(
        "OpenAI could not reliably separate two speakers in this transcript.",
      );
    }

    if (!hasTheSameWords(originalTranscript, labeledTranscript)) {
      throw new Error(
        "Speaker labeling tried to change some transcript words, so the original was kept safe. Please try again.",
      );
    }

    await db
      .prepare(
        `UPDATE audio_tracks
         SET transcript = ?,
             transcription_status = 'complete',
             transcription_error = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(labeledTranscript, track.id)
      .run();

    return Response.json({ transcript: labeledTranscript, speakerCount });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speaker labeling failed.";

    if (trackId && !(error instanceof VaultAccessError)) {
      try {
        const { db } = await getVaultBindings();
        await db
          .prepare(
            `UPDATE audio_tracks
             SET transcription_status = 'complete',
                 transcription_error = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
          )
          .bind(message, trackId)
          .run();
      } catch (updateError) {
        console.error("Could not save the speaker-label error.", updateError);
      }
    }

    if (error instanceof VaultAccessError) {
      return vaultAccessResponse(error);
    }

    console.error(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

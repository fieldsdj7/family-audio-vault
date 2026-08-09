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
  speaker_1_name: string | null;
  speaker_2_name: string | null;
};

type SpeakerResult = {
  transcript?: unknown;
  speakerCount?: unknown;
};

type SecretEnv = CloudflareEnv & {
  OPENAI_API_KEY?: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withoutSpeakerLabels(
  value: string,
  speaker1Name: string,
  speaker2Name: string,
) {
  let cleaned = value.replace(
    /(^|\n)\s*Speaker\s+\d+\s*:\s*/gi,
    "$1",
  );

  for (const name of [speaker1Name, speaker2Name]) {
    cleaned = cleaned.replace(
      new RegExp(
        `(^|\\n)\\s*${escapeRegExp(name)}\\s*:\\s*`,
        "gi",
      ),
      "$1",
    );
  }

  return cleaned.trim();
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
  labeled: string,
  speaker1Name: string,
  speaker2Name: string,
) {
  const originalWords = wordTokens(
    withoutSpeakerLabels(
      original,
      speaker1Name,
      speaker2Name,
    ),
  );

  const labeledWords = wordTokens(
    withoutSpeakerLabels(
      labeled,
      speaker1Name,
      speaker2Name,
    ),
  );

  return (
    originalWords.length === labeledWords.length &&
    originalWords.every(
      (word, index) => word === labeledWords[index],
    )
  );
}

function hasExpectedLabels(
  transcript: string,
  speaker1Name: string,
  speaker2Name: string,
) {
  const first = new RegExp(
    `(^|\\n)\\s*${escapeRegExp(speaker1Name)}\\s*:`,
    "i",
  );

  const second = new RegExp(
    `(^|\\n)\\s*${escapeRegExp(speaker2Name)}\\s*:`,
    "i",
  );

  return first.test(transcript) && second.test(transcript);
}

export async function POST(request: Request) {
  let trackId: string | null = null;

  try {
    const member = await requireVaultMember(request);

    if (!member.isAdmin) {
      return Response.json(
        {
          error:
            "Only a Vault administrator can format and label transcripts.",
        },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      trackId?: unknown;
      transcript?: unknown;
      speaker1Name?: unknown;
      speaker2Name?: unknown;
    };

    trackId =
      typeof body.trackId === "string"
        ? body.trackId.trim()
        : null;

    if (!trackId) {
      return Response.json(
        {
          error: "A recording was not specified.",
        },
        { status: 400 },
      );
    }

    const { db } = await getVaultBindings();

    const track = await db
      .prepare(
        `SELECT
           id,
           transcript,
           speaker_1_name,
           speaker_2_name
         FROM audio_tracks
         WHERE id = ?
           AND trashed_at IS NULL`,
      )
      .bind(trackId)
      .first<TrackRow>();

    if (!track) {
      return Response.json(
        {
          error: "The recording could not be found.",
        },
        { status: 404 },
      );
    }

    const suppliedTranscript =
      typeof body.transcript === "string"
        ? body.transcript.trim()
        : "";

    const originalTranscript =
      suppliedTranscript ||
      track.transcript?.trim() ||
      "";

    if (!originalTranscript) {
      return Response.json(
        {
          error:
            "This recording needs a transcript before it can be formatted.",
        },
        { status: 400 },
      );
    }

    const suppliedSpeaker1 =
      typeof body.speaker1Name === "string"
        ? body.speaker1Name.trim()
        : "";

    const suppliedSpeaker2 =
      typeof body.speaker2Name === "string"
        ? body.speaker2Name.trim()
        : "";

    const speaker1Name =
      suppliedSpeaker1 ||
      track.speaker_1_name?.trim() ||
      "";

    const speaker2Name =
      suppliedSpeaker2 ||
      track.speaker_2_name?.trim() ||
      "";

    if (!speaker1Name || !speaker2Name) {
      return Response.json(
        {
          error:
            "Enter names for Speaker 1 and Speaker 2 before formatting the transcript.",
        },
        { status: 400 },
      );
    }

    if (
      speaker1Name.toLocaleLowerCase() ===
      speaker2Name.toLocaleLowerCase()
    ) {
      return Response.json(
        {
          error:
            "Speaker 1 and Speaker 2 must have different names.",
        },
        { status: 400 },
      );
    }

    const { env } = await getCloudflareContext({
      async: true,
    });

    const openAiKey =
      (env as SecretEnv).OPENAI_API_KEY;

    if (!openAiKey) {
      return Response.json(
        {
          error:
            "The transcript-formatting service has not been configured yet.",
        },
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

          response_format: {
            type: "json_object",
          },

          messages: [
            {
              role: "system",
              content: [
                "Format a word-for-word family interview transcript for long-term preservation.",
                `Speaker 1 is ${speaker1Name}.`,
                `Speaker 2 is ${speaker2Name}.`,
                `Label every speaker turn exactly as ${speaker1Name}: or ${speaker2Name}:.`,
                "Use conversational context to determine which person is speaking.",
                "The person asking the interview questions is often Speaker 1, but do not assume that every short phrase belongs to Speaker 1.",
                "Keep each person's identity consistent throughout the transcript.",

                "You MAY correct capitalization at the beginning of sentences.",
                "You MAY add or correct periods, commas, question marks, exclamation points, quotation marks, apostrophes, and other normal punctuation.",
                "You MAY correct spacing around punctuation.",
                "You MAY add paragraph breaks between speaker turns.",

                "You MUST preserve every spoken word in exactly the same order.",
                "Do not substitute one word for another.",
                "Do not add words.",
                "Do not remove words.",
                "Do not remove filler words.",
                "Do not remove repeated words.",
                "Do not rewrite grammar.",
                "Do not summarize.",
                "Do not improve the wording itself.",

                "Capitalization, punctuation, spacing, paragraph breaks, and speaker labels are formatting only.",
                "Return JSON only with transcript as a string and speakerCount as a number.",
              ].join(" "),
            },

            {
              role: "user",
              content: originalTranscript,
            },
          ],
        }),
      },
    );

    const responseBody =
      (await openAiResponse.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
        error?: {
          message?: string;
        };
      };

    const content =
      responseBody.choices?.[0]?.message?.content;

    if (!openAiResponse.ok || !content) {
      throw new Error(
        responseBody.error?.message ||
          "OpenAI could not format the transcript.",
      );
    }

    let parsed: SpeakerResult;

    try {
      parsed = JSON.parse(content) as SpeakerResult;
    } catch {
      throw new Error(
        "OpenAI returned the formatted transcript in an unexpected format. Please try again.",
      );
    }

    const labeledTranscript =
      typeof parsed.transcript === "string"
        ? parsed.transcript.trim()
        : "";

    const speakerCount = Number(
      parsed.speakerCount || 0,
    );

    if (
      !labeledTranscript ||
      speakerCount < 2 ||
      !hasExpectedLabels(
        labeledTranscript,
        speaker1Name,
        speaker2Name,
      )
    ) {
      throw new Error(
        "OpenAI could not reliably separate the two speakers in this transcript.",
      );
    }

    if (
      !hasTheSameWords(
        originalTranscript,
        labeledTranscript,
        speaker1Name,
        speaker2Name,
      )
    ) {
      throw new Error(
        "Transcript formatting tried to change some spoken words, so the original transcript was kept safe. Please try again.",
      );
    }

    await db
      .prepare(
        `UPDATE audio_tracks
         SET transcript = ?,
             speaker_1_name = ?,
             speaker_2_name = ?,
             transcription_status = 'complete',
             transcription_error = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        labeledTranscript,
        speaker1Name,
        speaker2Name,
        track.id,
      )
      .run();

    return Response.json({
      transcript: labeledTranscript,
      speakerCount,
      speaker1Name,
      speaker2Name,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Transcript formatting failed.";

    if (
      trackId &&
      !(error instanceof VaultAccessError)
    ) {
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
        console.error(
          "Could not save the transcript-formatting error.",
          updateError,
        );
      }
    }

    if (error instanceof VaultAccessError) {
      return vaultAccessResponse(error);
    }

    console.error(error);

    return Response.json(
      { error: message },
      { status: 500 },
    );
  }
}

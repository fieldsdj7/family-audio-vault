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

type FormatResult = {
  transcript?: unknown;
};

type SecretEnv = CloudflareEnv & {
  OPENAI_API_KEY?: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function stripKnownLabels(
  value: string,
  speaker1Name: string,
  speaker2Name: string,
) {
  let cleaned = value
    .replace(
      /(^|\n)\s*Speaker\s+1\s*:\s*/gi,
      "$1",
    )
    .replace(
      /(^|\n)\s*Speaker\s+2\s*:\s*/gi,
      "$1",
    );

  for (const name of [
    speaker1Name,
    speaker2Name,
  ]) {
    cleaned = cleaned.replace(
      new RegExp(
        `(^|\\n)\\s*${escapeRegExp(
          name,
        )}\\s*:\\s*`,
        "gi",
      ),
      "$1",
    );
  }

  return cleaned.trim();
}

function hasTheSameWords(
  original: string,
  formatted: string,
  speaker1Name: string,
  speaker2Name: string,
) {
  const originalWords = wordTokens(
    stripKnownLabels(
      original,
      speaker1Name,
      speaker2Name,
    ),
  );

  const formattedWords = wordTokens(
    stripKnownLabels(
      formatted,
      speaker1Name,
      speaker2Name,
    ),
  );

  return (
    originalWords.length ===
      formattedWords.length &&
    originalWords.every(
      (word, index) =>
        word === formattedWords[index],
    )
  );
}

function applySpeakerNames(
  transcript: string,
  speaker1Name: string,
  speaker2Name: string,
) {
  return transcript
    .replace(
      /(^|\n)(\s*)Speaker\s+1\s*:\s*/gi,
      `$1$2${speaker1Name}: `,
    )
    .replace(
      /(^|\n)(\s*)Speaker\s+2\s*:\s*/gi,
      `$1$2${speaker2Name}: `,
    )
    .trim();
}

export async function POST(
  request: Request,
) {
  let trackId: string | null = null;

  try {
    const member =
      await requireVaultMember(request);

    if (!member.isAdmin) {
      return Response.json(
        {
          error:
            "Only a Vault administrator can format and label transcripts.",
        },
        { status: 403 },
      );
    }

    const body =
      (await request.json()) as {
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
          error:
            "A recording was not specified.",
        },
        { status: 400 },
      );
    }

    const { db } =
      await getVaultBindings();

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
          error:
            "The recording could not be found.",
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
            "This recording needs a transcript first.",
        },
        { status: 400 },
      );
    }

    const speaker1Name =
      typeof body.speaker1Name === "string" &&
      body.speaker1Name.trim()
        ? body.speaker1Name.trim()
        : track.speaker_1_name?.trim() ||
          "";

    const speaker2Name =
      typeof body.speaker2Name === "string" &&
      body.speaker2Name.trim()
        ? body.speaker2Name.trim()
        : track.speaker_2_name?.trim() ||
          "";

    if (
      !speaker1Name ||
      !speaker2Name
    ) {
      return Response.json(
        {
          error:
            "Enter names for Speaker 1 and Speaker 2 first.",
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

    /*
     * First do the important part deterministically.
     * No AI is needed to rename existing speaker labels.
     */
    const renamedTranscript =
      applySpeakerNames(
        originalTranscript,
        speaker1Name,
        speaker2Name,
      );

    let finalTranscript =
      renamedTranscript;

    let formattingApplied = false;

    /*
     * Punctuation/capitalization cleanup is optional.
     * If AI changes any spoken words, we simply fall
     * back to the safely renamed transcript.
     */
    const { env } =
      await getCloudflareContext({
        async: true,
      });

    const openAiKey =
      (env as SecretEnv)
        .OPENAI_API_KEY;

    if (openAiKey) {
      try {
        const openAiResponse =
          await fetch(
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
                  type:
                    "json_object",
                },

                messages: [
                  {
                    role: "system",

                    content: [
                      "Clean up the formatting of this word-for-word family interview transcript.",
                      "The speaker names are already correct and must remain exactly as written.",
                      "Do not change which person says any line.",
                      "You may correct sentence capitalization.",
                      "You may add or correct commas, periods, question marks, exclamation points, quotation marks, apostrophes, and spacing.",
                      "You may improve paragraph breaks.",
                      "You must preserve every spoken word in exactly the same order.",
                      "Do not add, remove, substitute, rewrite, summarize, or reorder spoken words.",
                      "Do not remove filler words or repeated words.",
                      "Return JSON only with transcript as a string.",
                    ].join(" "),
                  },

                  {
                    role: "user",
                    content:
                      renamedTranscript,
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
          };

        const content =
          responseBody.choices?.[0]
            ?.message?.content;

        if (
          openAiResponse.ok &&
          content
        ) {
          const parsed =
            JSON.parse(
              content,
            ) as FormatResult;

          const formatted =
            typeof parsed.transcript ===
            "string"
              ? parsed.transcript.trim()
              : "";

          if (
            formatted &&
            hasTheSameWords(
              renamedTranscript,
              formatted,
              speaker1Name,
              speaker2Name,
            )
          ) {
            finalTranscript =
              formatted;

            formattingApplied =
              true;
          }
        }
      } catch (formatError) {
        console.error(
          "Optional transcript formatting failed.",
          formatError,
        );

        /*
         * Keep going.
         * Speaker-name replacement is already safe.
         */
      }
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
        finalTranscript,
        speaker1Name,
        speaker2Name,
        track.id,
      )
      .run();

    return Response.json({
      transcript:
        finalTranscript,

      speakerCount: 2,

      speaker1Name,
      speaker2Name,

      formattingApplied,
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
        const { db } =
          await getVaultBindings();

        await db
          .prepare(
            `UPDATE audio_tracks
             SET transcription_status = 'complete',
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
          "Could not save the transcript-formatting error.",
          updateError,
        );
      }
    }

    if (
      error instanceof
      VaultAccessError
    ) {
      return vaultAccessResponse(
        error,
      );
    }

    console.error(error);

    return Response.json(
      { error: message },
      { status: 500 },
    );
  }
}

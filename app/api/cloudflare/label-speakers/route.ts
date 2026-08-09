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
  speaker: string | null;
  vault_person: string | null;
};

type SpeakerResult = {
  transcript?: unknown;
  speakerCount?: unknown;
};

type SecretEnv = CloudflareEnv & {
  OPENAI_API_KEY?: string;
};

type SpeakerNames = {
  interviewer: string;
  storyteller: string;
  useNames: boolean;
};

/*
 * These are the family relationship names used throughout
 * the Vault and the actual first names we want preserved
 * in readable transcripts.
 */
function relationshipToName(value: string) {
  const normalized = value.trim().toLowerCase();

  if (normalized === "dad") return "Dan";
  if (normalized === "papa") return "Bill";
  if (normalized === "mom") return "Ivy";
  if (normalized === "ivy") return "Ivy";
  if (normalized === "dan") return "Dan";
  if (normalized === "bill") return "Bill";

  return value.trim();
}

function inferSpeakerNames(track: TrackRow): SpeakerNames {
  const speakerText = track.speaker?.trim() || "";

  const parts = speakerText
    .split(/\s+(?:and|&)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  /*
   * If the recording already tells us exactly which
   * two people are speaking, use their actual names.
   */
  if (parts.length === 2) {
    const names = parts.map(relationshipToName);

    /*
     * Papa interviews in this project are normally
     * Dan asking questions and Bill answering them.
     */
    if (
      names.includes("Dan") &&
      names.includes("Bill")
    ) {
      return {
        interviewer: "Dan",
        storyteller: "Bill",
        useNames: true,
      };
    }

    /*
     * Dad + Mom interview.
     */
    if (
      names.includes("Dan") &&
      names.includes("Ivy")
    ) {
      if (track.vault_person === "Mom") {
        return {
          interviewer: "Dan",
          storyteller: "Ivy",
          useNames: true,
        };
      }

      if (track.vault_person === "Dad") {
        return {
          interviewer: "Ivy",
          storyteller: "Dan",
          useNames: true,
        };
      }
    }

    /*
     * Papa + Mom interview.
     */
    if (
      names.includes("Bill") &&
      names.includes("Ivy")
    ) {
      if (track.vault_person === "Papa") {
        return {
          interviewer: "Ivy",
          storyteller: "Bill",
          useNames: true,
        };
      }

      if (track.vault_person === "Mom") {
        return {
          interviewer: "Bill",
          storyteller: "Ivy",
          useNames: true,
        };
      }
    }
  }

  /*
   * We do not guess names when the recording metadata
   * is not clear enough.
   */
  return {
    interviewer: "Speaker 1",
    storyteller: "Speaker 2",
    useNames: false,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withoutSpeakerLabels(
  value: string,
  speakerNames?: SpeakerNames,
) {
  let cleaned = value
    .replace(
      /(^|\n)\s*Speaker\s+\d+\s*:\s*/gi,
      "$1",
    );

  if (speakerNames?.useNames) {
    const names = [
      speakerNames.interviewer,
      speakerNames.storyteller,
    ];

    for (const name of names) {
      cleaned = cleaned.replace(
        new RegExp(
          `(^|\\n)\\s*${escapeRegExp(name)}\\s*:\\s*`,
          "gi",
        ),
        "$1",
      );
    }
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
  speakerNames: SpeakerNames,
) {
  const originalWords = wordTokens(
    withoutSpeakerLabels(
      original,
      speakerNames,
    ),
  );

  const labeledWords = wordTokens(
    withoutSpeakerLabels(
      labeled,
      speakerNames,
    ),
  );

  return (
    originalWords.length ===
      labeledWords.length &&
    originalWords.every(
      (word, index) =>
        word === labeledWords[index],
    )
  );
}

function hasExpectedLabels(
  transcript: string,
  speakerNames: SpeakerNames,
) {
  if (!speakerNames.useNames) {
    return (
      /Speaker\s+1\s*:/i.test(
        transcript,
      ) &&
      /Speaker\s+2\s*:/i.test(
        transcript,
      )
    );
  }

  const interviewerPattern =
    new RegExp(
      `(^|\\n)\\s*${escapeRegExp(
        speakerNames.interviewer,
      )}\\s*:`,
      "i",
    );

  const storytellerPattern =
    new RegExp(
      `(^|\\n)\\s*${escapeRegExp(
        speakerNames.storyteller,
      )}\\s*:`,
      "i",
    );

  return (
    interviewerPattern.test(transcript) &&
    storytellerPattern.test(transcript)
  );
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
            "Only a Vault administrator can label speakers.",
        },
        { status: 403 },
      );
    }

    const body =
      (await request.json()) as {
        trackId?: unknown;
        transcript?: unknown;
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
           speaker,
           vault_person
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
            "This recording needs a transcript before speakers can be labeled.",
        },
        { status: 400 },
      );
    }

    const speakerNames =
      inferSpeakerNames(track);

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
            "The speaker-label service has not been configured yet.",
        },
        { status: 500 },
      );
    }

    const labelInstructions =
      speakerNames.useNames
        ? [
            `The interviewer is ${speakerNames.interviewer}.`,
            `The family member telling the story is ${speakerNames.storyteller}.`,
            `${speakerNames.interviewer} usually asks the questions and short follow-up questions.`,
            `${speakerNames.storyteller} usually gives the longer answers.`,
            `Label every speaker turn exactly as ${speakerNames.interviewer}: or ${speakerNames.storyteller}:.`,
          ].join(" ")
        : [
            "Use Speaker 1: and Speaker 2: as the speaker labels.",
            "Use the same number for each person throughout the entire transcript.",
            "The interviewer usually asks the questions and the family member usually gives the longer answers.",
          ].join(" ");

    const openAiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          "Content-Type":
            "application/json",
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
                labelInstructions,

                "You MAY correct capitalization at the beginning of sentences.",
                "You MAY add or correct periods, commas, question marks, exclamation points, quotation marks, apostrophes, and other normal punctuation.",
                "You MAY add paragraph breaks between speaker turns.",
                "You MAY fix spacing around punctuation.",

                "You MUST preserve every spoken word in exactly the same order.",
                "Do not substitute one word for another.",
                "Do not remove filler words.",
                "Do not remove repeated words.",
                "Do not rewrite grammar.",
                "Do not make sentences sound more polished by changing their wording.",
                "Do not summarize.",
                "Do not add words that were not spoken.",
                "Do not remove words that were spoken.",

                "Capitalization and punctuation are formatting only and may be corrected for readability.",
                "The spoken wording itself must remain word-for-word.",

                "Return JSON only with transcript as a string and speakerCount as a number.",
              ].join(" "),
            },

            {
              role: "user",
              content:
                originalTranscript,
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
      responseBody.choices?.[0]
        ?.message?.content;

    if (
      !openAiResponse.ok ||
      !content
    ) {
      throw new Error(
        responseBody.error?.message ||
          "OpenAI could not format the transcript.",
      );
    }

    let parsed: SpeakerResult;

    try {
      parsed =
        JSON.parse(
          content,
        ) as SpeakerResult;
    } catch {
      throw new Error(
        "OpenAI returned the transcript in an unexpected format. Please try again.",
      );
    }

    const labeledTranscript =
      typeof parsed.transcript ===
      "string"
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
        speakerNames,
      )
    ) {
      throw new Error(
        "OpenAI could not reliably separate the two speakers in this transcript.",
      );
    }

    /*
     * Critical safety check:
     *
     * Punctuation and capitalization may change,
     * but every spoken word must still match
     * word-for-word and remain in the same order.
     */
    if (
      !hasTheSameWords(
        originalTranscript,
        labeledTranscript,
        speakerNames,
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
             transcription_status = 'complete',
             transcription_error = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        labeledTranscript,
        track.id,
      )
      .run();

    return Response.json({
      transcript:
        labeledTranscript,
      speakerCount,
      speakerNames:
        speakerNames.useNames
          ? {
              interviewer:
                speakerNames.interviewer,
              storyteller:
                speakerNames.storyteller,
            }
          : null,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Speaker labeling failed.";

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
          .bind(message, trackId)
          .run();
      } catch (updateError) {
        console.error(
          "Could not save the speaker-label error.",
          updateError,
        );
      }
    }

    if (
      error instanceof VaultAccessError
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

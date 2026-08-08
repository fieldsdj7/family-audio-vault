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
  title: string;
  speaker: string;
  category: string | null;
  vault_person: string;
  transcript: string | null;
};

type StoryResult = {
  title?: unknown;
  story?: unknown;
};

type SecretEnv = CloudflareEnv & {
  OPENAI_API_KEY?: string;
};

function cleanStoryResult(value: StoryResult) {
  return {
    title: typeof value.title === "string" ? value.title.trim() : "",
    story: typeof value.story === "string" ? value.story.trim() : "",
  };
}

export async function POST(request: Request) {
  let trackId: string | null = null;

  try {
    const member = await requireVaultMember(request);

    if (!member.isAdmin) {
      return Response.json(
        { error: "Only a Vault administrator can create family stories." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      trackId?: unknown;
      mode?: unknown;
      currentTitle?: unknown;
      currentStory?: unknown;
    };

    trackId = typeof body.trackId === "string" ? body.trackId.trim() : null;
    if (!trackId) {
      return Response.json(
        { error: "A recording was not specified." },
        { status: 400 },
      );
    }

    const mode = body.mode === "improve" ? "improve" : "create";
    const currentTitle =
      typeof body.currentTitle === "string" ? body.currentTitle.trim() : "";
    const currentStory =
      typeof body.currentStory === "string" ? body.currentStory.trim() : "";

    if (mode === "improve" && !currentStory) {
      return Response.json(
        { error: "There is no current story to improve." },
        { status: 400 },
      );
    }

    const { db } = await getVaultBindings();
    const track = await db
      .prepare(
        `SELECT id, title, speaker, category, vault_person, transcript
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

    if (!track.transcript?.trim()) {
      return Response.json(
        { error: "This recording needs a transcript first." },
        { status: 400 },
      );
    }

    const { env } = await getCloudflareContext({ async: true });
    const openAiKey = (env as SecretEnv).OPENAI_API_KEY;
    if (!openAiKey) {
      return Response.json(
        { error: "The story service has not been configured yet." },
        { status: 500 },
      );
    }

    await db
      .prepare(
        `UPDATE audio_tracks
         SET story_status = 'processing',
             story_error = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(track.id)
      .run();

    const instructions =
      mode === "improve"
        ? [
            "You carefully improve an existing first-person family-memory story.",
            "Preserve the current story's voice, facts, point of view, organization, and wording wherever possible; do not rewrite it from scratch.",
            "Improve only clarity, grammar, flow, awkward wording, and unnecessary repetition.",
            "The reviewed transcript is the factual authority. Correct a detail only when the transcript clearly supports the correction.",
            "Do not add names, dates, motives, dialogue, emotions, descriptions, or events that are not in the transcript.",
            "Do not hide uncertainty: retain bracketed unclear words exactly as written.",
            "Keep the existing title unless a small improvement is clearly helpful.",
            "Return valid JSON only, with exactly two string fields: title and story. Do not include a heading in the story text.",
          ].join(" ")
        : [
            "You turn a spoken family-memory transcript into a careful, readable first-person life-story passage.",
            "Use only facts stated in the transcript. Do not add names, dates, motives, dialogue, emotions, or events that were not said.",
            "Keep the speaker's point of view and meaning. Remove only obvious false starts, repeated fragments, and filler words.",
            "Do not hide uncertainty: retain bracketed unclear words exactly as written.",
            "Write 2 to 6 short, warm book-ready paragraphs. Do not include a heading in the story text.",
            "Return valid JSON only, with exactly two string fields: title and story.",
            "The title should be specific, warm, and 3 to 8 words longâ€”not generic and not made-up.",
          ].join(" ");

    const recordingDetails = [
      `Recording title: ${track.title}`,
      `Speaker: ${track.speaker}`,
      `Legacy book: ${track.vault_person}`,
      `Category: ${track.category || "General"}`,
    ].join("\n");
    const prompt =
      mode === "improve"
        ? `${recordingDetails}\n\nCurrent story title:\n${currentTitle || track.title}\n\nCurrent story to improve:\n${currentStory}\n\nReviewed transcript (factual source):\n${track.transcript}`
        : `${recordingDetails}\n\nReviewed transcript:\n${track.transcript}`;

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
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: instructions },
            { role: "user", content: prompt },
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
        responseBody.error?.message || "OpenAI could not create the story.",
      );
    }

    let parsed: StoryResult;
    try {
      parsed = JSON.parse(content) as StoryResult;
    } catch {
      throw new Error(
        "OpenAI returned a story in an unexpected format. Please try again.",
      );
    }

    const { title, story } = cleanStoryResult(parsed);
    if (!title || !story) {
      throw new Error(
        "OpenAI returned an incomplete story. Please try again.",
      );
    }

    await db
      .prepare(
        `UPDATE audio_tracks
         SET story_title = ?,
             story_chapter = ?,
             story_status = 'complete',
             story_error = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(title, story, track.id)
      .run();

    return Response.json({ title, story });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Story creation failed.";

    if (trackId) {
      try {
        const { db } = await getVaultBindings();
        await db
          .prepare(
            `UPDATE audio_tracks
             SET story_status = 'failed',
                 story_error = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
          )
          .bind(message, trackId)
          .run();
      } catch (updateError) {
        console.error("Could not save the story creation error.", updateError);
      }
    }

    if (error instanceof VaultAccessError) {
      return vaultAccessResponse(error);
    }

    console.error(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

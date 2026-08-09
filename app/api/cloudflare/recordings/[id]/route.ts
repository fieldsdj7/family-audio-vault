import {
  getVaultBindings,
  requireVaultMember,
  vaultAccessResponse,
} from "../../../../../lib/cloudflare";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type RecordingRow = {
  id: string;
};

function optionalText(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  return typeof value === "string"
    ? value.trim() || null
    : undefined;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  try {
    const member =
      await requireVaultMember(request);

    if (!member.isAdmin) {
      return Response.json(
        {
          error:
            "Only a Vault administrator can edit recordings.",
        },
        { status: 403 },
      );
    }

    const { id } = await context.params;

    if (!id.trim()) {
      return Response.json(
        {
          error:
            "A recording ID is required.",
        },
        { status: 400 },
      );
    }

    const body =
      (await request.json()) as {
        transcript?: unknown;
        storyTitle?: unknown;
        storyChapter?: unknown;
        speaker1Name?: unknown;
        speaker2Name?: unknown;
      };

    const transcript =
      optionalText(body.transcript);

    const storyTitle =
      optionalText(body.storyTitle);

    const storyChapter =
      optionalText(body.storyChapter);

    const speaker1Name =
      optionalText(body.speaker1Name);

    const speaker2Name =
      optionalText(body.speaker2Name);

    if (
      (body.transcript !== undefined &&
        transcript === undefined) ||
      (body.storyTitle !== undefined &&
        storyTitle === undefined) ||
      (body.storyChapter !== undefined &&
        storyChapter === undefined) ||
      (body.speaker1Name !== undefined &&
        speaker1Name === undefined) ||
      (body.speaker2Name !== undefined &&
        speaker2Name === undefined)
    ) {
      return Response.json(
        {
          error:
            "Transcript, story, and speaker names must be text.",
        },
        { status: 400 },
      );
    }

    if (
      transcript === undefined &&
      storyTitle === undefined &&
      storyChapter === undefined &&
      speaker1Name === undefined &&
      speaker2Name === undefined
    ) {
      return Response.json(
        {
          error:
            "No recording changes were provided.",
        },
        { status: 400 },
      );
    }

    if (
      storyTitle &&
      storyTitle.length > 300
    ) {
      return Response.json(
        {
          error:
            "The story title is too long.",
        },
        { status: 400 },
      );
    }

    if (
      speaker1Name &&
      speaker1Name.length > 100
    ) {
      return Response.json(
        {
          error:
            "Speaker 1 name is too long.",
        },
        { status: 400 },
      );
    }

    if (
      speaker2Name &&
      speaker2Name.length > 100
    ) {
      return Response.json(
        {
          error:
            "Speaker 2 name is too long.",
        },
        { status: 400 },
      );
    }

    const { db } =
      await getVaultBindings();

    const recording = await db
      .prepare(
        `SELECT id
         FROM audio_tracks
         WHERE id = ?
           AND trashed_at IS NULL`,
      )
      .bind(id)
      .first<RecordingRow>();

    if (!recording) {
      return Response.json(
        {
          error:
            "That recording could not be found.",
        },
        { status: 404 },
      );
    }

    const assignments: string[] = [];

    const values: Array<
      string | null
    > = [];

    if (transcript !== undefined) {
      assignments.push(
        "transcript = ?",
      );

      values.push(transcript);

      assignments.push(
        "transcription_status = ?",
      );

      values.push(
        transcript
          ? "complete"
          : "not_started",
      );
    }

    if (storyTitle !== undefined) {
      assignments.push(
        "story_title = ?",
      );

      values.push(storyTitle);
    }

    if (
      storyChapter !== undefined
    ) {
      assignments.push(
        "story_chapter = ?",
      );

      values.push(storyChapter);

      assignments.push(
        "story_status = ?",
      );

      values.push(
        storyChapter
          ? "complete"
          : "not_started",
      );
    }

    if (
      speaker1Name !== undefined
    ) {
      assignments.push(
        "speaker_1_name = ?",
      );

      values.push(speaker1Name);
    }

    if (
      speaker2Name !== undefined
    ) {
      assignments.push(
        "speaker_2_name = ?",
      );

      values.push(speaker2Name);
    }

    assignments.push(
      "updated_at = datetime('now')",
    );

    await db
      .prepare(
        `UPDATE audio_tracks
         SET ${assignments.join(", ")}
         WHERE id = ?`,
      )
      .bind(
        ...values,
        id,
      )
      .run();

    return Response.json({
      saved: true,
    });
  } catch (error) {
    return vaultAccessResponse(
      error,
    );
  }
}

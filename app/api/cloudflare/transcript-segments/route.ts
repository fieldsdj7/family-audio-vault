import {
  getVaultBindings,
  requireVaultMember,
} from "../../../../lib/cloudflare";

type SegmentInput = {
  start?: unknown;
  end?: unknown;
  speaker?: unknown;
  text?: unknown;
};

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
            "Only a Vault administrator can save transcript timing.",
        },
        { status: 403 },
      );
    }

    const body =
      (await request.json()) as {
        trackId?: unknown;
        segments?: unknown;
      };

    const trackId =
      typeof body.trackId ===
      "string"
        ? body.trackId.trim()
        : "";

    if (!trackId) {
      return Response.json(
        {
          error:
            "A recording was not specified.",
        },
        { status: 400 },
      );
    }

    if (
      !Array.isArray(
        body.segments,
      )
    ) {
      return Response.json(
        {
          error:
            "Transcript segments were not provided.",
        },
        { status: 400 },
      );
    }

    const segments =
      body.segments as SegmentInput[];

    const cleaned =
      segments
        .map(
          (
            segment,
            index,
          ) => {
            const start =
              Number(
                segment.start,
              );

            const end =
              Number(
                segment.end,
              );

            const text =
              typeof segment.text ===
              "string"
                ? segment.text.trim()
                : "";

            const speaker =
              typeof segment.speaker ===
              "string" &&
              segment.speaker.trim()
                ? segment.speaker.trim()
                : null;

            return {
              index,
              start,
              end,
              speaker,
              text,
            };
          },
        )
        .filter(
          (segment) =>
            Number.isFinite(
              segment.start,
            ) &&
            Number.isFinite(
              segment.end,
            ) &&
            segment.start >= 0 &&
            segment.end >
              segment.start &&
            Boolean(
              segment.text,
            ),
        );

    const { db } =
      await getVaultBindings();

    const recording =
      await db
        .prepare(
          `SELECT id
           FROM audio_tracks
           WHERE id = ?
             AND trashed_at IS NULL`,
        )
        .bind(
          trackId,
        )
        .first<{
          id: string;
        }>();

    if (!recording) {
      return Response.json(
        {
          error:
            "That recording could not be found.",
        },
        { status: 404 },
      );
    }

    await db
      .prepare(
        `DELETE FROM transcript_segments
         WHERE audio_track_id = ?`,
      )
      .bind(
        trackId,
      )
      .run();

    for (
      let index = 0;
      index <
      cleaned.length;
      index += 1
    ) {
      const segment =
        cleaned[index];

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

    return Response.json({
      saved: true,
      segmentCount:
        cleaned.length,
    });
  } catch (error) {
    console.error(
      "Transcript segment save failed.",
      error,
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Transcript timing could not be saved.",
      },
      { status: 500 },
    );
  }
}

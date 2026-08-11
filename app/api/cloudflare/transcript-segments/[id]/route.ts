import {
  getVaultBindings,
  requireVaultMember,
} from "../../../../../lib/cloudflare";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type SegmentRow = {
  id: string;
  segment_index: number;
  start_seconds: number;
  end_seconds: number;
  speaker_label: string | null;
  text: string;
};

export async function GET(
  request: Request,
  context: RouteContext,
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
            "Only a Vault administrator can view transcript timing.",
        },
        { status: 403 },
      );
    }

    const { id } =
      await context.params;

    const trackId =
      id.trim();

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

    const result =
      await db
        .prepare(
          `SELECT
             id,
             segment_index,
             start_seconds,
             end_seconds,
             speaker_label,
             text
           FROM transcript_segments
           WHERE audio_track_id = ?
           ORDER BY segment_index ASC`,
        )
        .bind(
          trackId,
        )
        .all<SegmentRow>();

    return Response.json({
      segments:
        result.results || [],
    });
  } catch (error) {
    console.error(
      "Transcript segment load failed.",
      error,
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Transcript timing could not be loaded.",
      },
      { status: 500 },
    );
  }
}

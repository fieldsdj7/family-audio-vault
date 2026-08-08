import {
  getVaultBindings,
  requireVaultMember,
  type VaultPerson,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

type ReviewType = "transcript" | "story";

type ReviewRow = {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: VaultPerson;
  transcript: string | null;
  transcription_status: string;
  story_title: string | null;
  story_chapter: string | null;
  story_status: string;
  transcript_reviewed_at: string | null;
  story_approved_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
};

function isReviewType(value: unknown): value is ReviewType {
  return value === "transcript" || value === "story";
}

async function requireAdministrator(request: Request) {
  const member = await requireVaultMember(request);

  if (!member.isAdmin) {
    return {
      member: null,
      response: Response.json(
        { error: "Only a Vault administrator can manage review status." },
        { status: 403 },
      ),
    };
  }

  return { member, response: null };
}

export async function GET(request: Request) {
  try {
    const access = await requireAdministrator(request);
    if (access.response) return access.response;

    const { db } = await getVaultBindings();
    const recordings = await db
      .prepare(
        `SELECT
           tracks.id,
           tracks.title,
           tracks.speaker,
           tracks.category,
           tracks.vault_person,
           tracks.transcript,
           tracks.transcription_status,
           tracks.story_title,
           tracks.story_chapter,
           tracks.story_status,
           reviews.transcript_reviewed_at,
           reviews.story_approved_at,
           reviews.notes AS review_notes,
           tracks.created_at,
           tracks.updated_at
         FROM audio_tracks AS tracks
         LEFT JOIN audio_track_reviews AS reviews
           ON reviews.audio_track_id = tracks.id
         WHERE tracks.trashed_at IS NULL
           AND tracks.is_split_master = 0
         ORDER BY tracks.created_at DESC`,
      )
      .all<ReviewRow>();

    return Response.json({ recordings: recordings.results });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAdministrator(request);
    if (access.response) return access.response;

    const body = (await request.json()) as {
      recordingId?: unknown;
      reviewType?: unknown;
    };
    const recordingId =
      typeof body.recordingId === "string" ? body.recordingId.trim() : "";

    if (!recordingId) {
      return Response.json(
        { error: "A recording was not specified." },
        { status: 400 },
      );
    }

    if (!isReviewType(body.reviewType)) {
      return Response.json(
        { error: "Choose transcript checked or story approved." },
        { status: 400 },
      );
    }

    const { db } = await getVaultBindings();
    const recording = await db
      .prepare(
        `SELECT id, transcript, story_chapter
         FROM audio_tracks
         WHERE id = ?
           AND trashed_at IS NULL
           AND is_split_master = 0`,
      )
      .bind(recordingId)
      .first<{
        id: string;
        transcript: string | null;
        story_chapter: string | null;
      }>();

    if (!recording) {
      return Response.json(
        { error: "That recording could not be found." },
        { status: 404 },
      );
    }

    if (body.reviewType === "transcript" && !recording.transcript?.trim()) {
      return Response.json(
        { error: "Create the transcript before marking it checked." },
        { status: 409 },
      );
    }

    if (body.reviewType === "story" && !recording.story_chapter?.trim()) {
      return Response.json(
        { error: "Create the family story before approving it." },
        { status: 409 },
      );
    }

    const reviewField =
      body.reviewType === "transcript"
        ? "transcript_reviewed_at"
        : "story_approved_at";

    await db
      .prepare(
        `INSERT INTO audio_track_reviews (
           audio_track_id,
           ${reviewField},
           updated_at
         ) VALUES (?, datetime('now'), datetime('now'))
         ON CONFLICT(audio_track_id) DO UPDATE SET
           ${reviewField} = datetime('now'),
           updated_at = datetime('now')`,
      )
      .bind(recording.id)
      .run();

    const review = await db
      .prepare(
        `SELECT transcript_reviewed_at, story_approved_at, notes
         FROM audio_track_reviews
         WHERE audio_track_id = ?`,
      )
      .bind(recording.id)
      .first<{
        transcript_reviewed_at: string | null;
        story_approved_at: string | null;
        notes: string | null;
      }>();

    return Response.json({
      saved: true,
      review: {
        recordingId: recording.id,
        transcriptReviewedAt: review?.transcript_reviewed_at ?? null,
        storyApprovedAt: review?.story_approved_at ?? null,
        notes: review?.notes ?? null,
      },
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

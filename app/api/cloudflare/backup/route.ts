import {
  getVaultBindings,
  requireVaultMember,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

type TrackRow = {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: string;
  question_id: string | null;
  storage_path: string | null;
  audio_url: string | null;
  transcript: string | null;
  transcription_status: string;
  transcription_error: string | null;
  story_title: string | null;
  story_chapter: string | null;
  story_status: string;
  story_error: string | null;
  source_track_id: string | null;
  clip_start_seconds: number | null;
  clip_end_seconds: number | null;
  split_notes: string | null;
  is_split_master: number;
  trashed_at: string | null;
  trashed_by: string | null;
  created_at: string;
  updated_at: string;
  speaker_1_name?: string | null;
  speaker_2_name?: string | null;
};

type PhotoRow = {
  id: string;
  audio_track_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type BackupRecordRequest = {
  recordingCount?: number;
  audioFileCount?: number;
  missingAudioCount?: number;
  backupSizeBytes?: number;
};

export async function GET(
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
            "Only a Vault administrator can create a full backup.",
        },
        { status: 403 },
      );
    }

    const { db } =
      await getVaultBindings();

    const [
      tracksResult,
      reviewsResult,
      questionsResult,
      photosResult,
      membersResult,
      accessResult,
      backupsResult,
    ] = await Promise.all([
      db
        .prepare(
          `SELECT *
           FROM audio_tracks
           ORDER BY created_at ASC`,
        )
        .all<TrackRow>(),

      db
        .prepare(
          `SELECT *
           FROM audio_track_reviews
           ORDER BY audio_track_id ASC`,
        )
        .all(),

      db
        .prepare(
          `SELECT *
           FROM questions
           ORDER BY question_number ASC`,
        )
        .all(),

      db
        .prepare(
          `SELECT *
           FROM story_photos
           ORDER BY
             audio_track_id ASC,
             sort_order ASC,
             created_at ASC`,
        )
        .all<PhotoRow>(),

      db
        .prepare(
          `SELECT *
           FROM vault_members
           ORDER BY email ASC`,
        )
        .all(),

      db
        .prepare(
          `SELECT *
           FROM vault_access
           ORDER BY
             member_email ASC,
             vault_person ASC`,
        )
        .all(),

      db
        .prepare(
          `SELECT *
           FROM vault_backup_history
           ORDER BY
             created_at ASC,
             id ASC`,
        )
        .all(),
    ]);

    const tracks =
      tracksResult.results;

    const photos =
      photosResult.results;

    const audioFiles =
      tracks
        .filter(
          (track) =>
            !!track.storage_path?.trim() &&
            track.is_split_master === 0,
        )
        .map((track) => ({
          trackId:
            track.id,

          title:
            track.title,

          storagePath:
            track.storage_path as string,

          downloadUrl:
            `/api/cloudflare/audio/${track.id}`,
        }));

    const photoFiles =
      photos.map(
        (photo) => ({
          photoId:
            photo.id,

          audioTrackId:
            photo.audio_track_id,

          storagePath:
            photo.storage_path,

          downloadUrl:
            `/api/cloudflare/photo/${photo.id}`,

          caption:
            photo.caption,

          sortOrder:
            photo.sort_order,
        }),
      );

    return Response.json({
      createdAt:
        new Date().toISOString(),

      createdBy:
        member.email,

      metadata: {
        audioTracks:
          tracks,

        audioTrackReviews:
          reviewsResult.results,

        questions:
          questionsResult.results,

        storyPhotos:
          photos,

        vaultMembers:
          membersResult.results,

        vaultAccess:
          accessResult.results,

        backupHistory:
          backupsResult.results,
      },

      files: {
        audio:
          audioFiles,

        photos:
          photoFiles,
      },
    });
  } catch (error) {
    return vaultAccessResponse(
      error,
    );
  }
}

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
            "Only a Vault administrator can record a full backup.",
        },
        { status: 403 },
      );
    }

    const body =
      (await request.json()) as
        BackupRecordRequest;

    const recordingCount =
      Number(
        body.recordingCount,
      );

    const audioFileCount =
      Number(
        body.audioFileCount,
      );

    const missingAudioCount =
      Number(
        body.missingAudioCount,
      );

    const backupSizeBytes =
      Number(
        body.backupSizeBytes,
      );

    if (
      !Number.isFinite(
        recordingCount,
      ) ||
      !Number.isFinite(
        audioFileCount,
      ) ||
      !Number.isFinite(
        missingAudioCount,
      ) ||
      !Number.isFinite(
        backupSizeBytes,
      ) ||
      recordingCount < 0 ||
      audioFileCount < 0 ||
      missingAudioCount < 0 ||
      backupSizeBytes <= 0
    ) {
      return Response.json(
        {
          error:
            "The backup details were incomplete or invalid.",
        },
        { status: 400 },
      );
    }

    const { db } =
      await getVaultBindings();

    const result =
      await db
        .prepare(
          `INSERT INTO vault_backup_history (
             created_by,
             recording_count,
             audio_file_count,
             missing_audio_count,
             backup_size_bytes
           )
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          member.email,
          Math.floor(
            recordingCount,
          ),
          Math.floor(
            audioFileCount,
          ),
          Math.floor(
            missingAudioCount,
          ),
          Math.floor(
            backupSizeBytes,
          ),
        )
        .run();

    return Response.json({
      success: true,

      backupId:
        result.meta
          .last_row_id ??
        null,
    });
  } catch (error) {
    return vaultAccessResponse(
      error,
    );
  }
}

import {
  getVaultBindings,
  requireVaultMember,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

type CountRow = {
  total_recordings: number;
  active_recordings: number;
  trashed_recordings: number;
  split_masters: number;
  transcript_count: number;
  story_count: number;
};

type SimpleCountRow = {
  count: number;
};

type StoredAudioRow = {
  id: string;
  title: string;
  storage_path: string;
};

type StoredPhotoRow = {
  id: string;
  storage_path: string;
};

type BackupRow = {
  id: number;
  created_at: string;
  created_by: string;
  recording_count: number;
  audio_file_count: number;
  missing_audio_count: number;
  backup_size_bytes: number | null;
};

async function requireAdministrator(request: Request) {
  const member = await requireVaultMember(request);

  if (!member.isAdmin) {
    return {
      member: null,
      response: Response.json(
        { error: "Only a Vault administrator can view Vault Health." },
        { status: 403 },
      ),
    };
  }

  return { member, response: null };
}

async function listStoredObjects(files: R2Bucket) {
  const objects: Array<{ key: string; size: number }> = [];
  let cursor: string | undefined;

  do {
    const page = await files.list({ cursor, limit: 1000 });
    objects.push(
      ...page.objects.map((object) => ({
        key: object.key,
        size: object.size,
      })),
    );
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return objects;
}

export async function GET(request: Request) {
  try {
    const access = await requireAdministrator(request);
    if (access.response) return access.response;

    const { db, files } = await getVaultBindings();
    const [
      recordingCounts,
      questionCount,
      memberCount,
      audioRows,
      photoRows,
      backups,
      storedObjects,
    ] = await Promise.all([
      db
        .prepare(
          `SELECT
             COUNT(*) AS total_recordings,
             SUM(CASE WHEN trashed_at IS NULL THEN 1 ELSE 0 END) AS active_recordings,
             SUM(CASE WHEN trashed_at IS NOT NULL THEN 1 ELSE 0 END) AS trashed_recordings,
             SUM(CASE WHEN is_split_master = 1 THEN 1 ELSE 0 END) AS split_masters,
             SUM(CASE WHEN length(trim(COALESCE(transcript, ''))) > 0 THEN 1 ELSE 0 END) AS transcript_count,
             SUM(CASE WHEN length(trim(COALESCE(story_chapter, ''))) > 0 THEN 1 ELSE 0 END) AS story_count
           FROM audio_tracks`,
        )
        .first<CountRow>(),
      db.prepare("SELECT COUNT(*) AS count FROM questions").first<SimpleCountRow>(),
      db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM vault_members
           WHERE is_active = 1`,
        )
        .first<SimpleCountRow>(),
      db
        .prepare(
          `SELECT id, title, storage_path
           FROM audio_tracks
           WHERE storage_path IS NOT NULL
             AND length(trim(storage_path)) > 0`,
        )
        .all<StoredAudioRow>(),
      db
        .prepare(
          `SELECT id, storage_path
           FROM story_photos
           WHERE length(trim(storage_path)) > 0`,
        )
        .all<StoredPhotoRow>(),
      db
        .prepare(
          `SELECT
             id,
             created_at,
             created_by,
             recording_count,
             audio_file_count,
             missing_audio_count,
             backup_size_bytes
           FROM vault_backup_history
           ORDER BY created_at DESC, id DESC
           LIMIT 10`,
        )
        .all<BackupRow>(),
      listStoredObjects(files),
    ]);

    const storedObjectKeys = new Set(storedObjects.map((object) => object.key));
    const referencedPaths = new Set([
      ...audioRows.results.map((recording) => recording.storage_path),
      ...photoRows.results.map((photo) => photo.storage_path),
    ]);
    const uniqueAudioPaths = new Set(
      audioRows.results.map((recording) => recording.storage_path),
    );
    const missingAudio = audioRows.results
      .filter((recording) => !storedObjectKeys.has(recording.storage_path))
      .map((recording) => ({
        recordingId: recording.id,
        title: recording.title,
      }));
    const missingPhotos = photoRows.results
      .filter((photo) => !storedObjectKeys.has(photo.storage_path))
      .map((photo) => ({ photoId: photo.id }));
    const orphanedObjects = storedObjects
      .filter((object) => !referencedPaths.has(object.key))
      .map((object) => ({ key: object.key, sizeBytes: object.size }));
    const totalStorageBytes = storedObjects.reduce(
      (total, object) => total + object.size,
      0,
    );
    const counts = recordingCounts ?? {
      total_recordings: 0,
      active_recordings: 0,
      trashed_recordings: 0,
      split_masters: 0,
      transcript_count: 0,
      story_count: 0,
    };

    return Response.json({
      checkedAt: new Date().toISOString(),
      healthy:
        missingAudio.length === 0 &&
        missingPhotos.length === 0,
      collection: {
        totalRecordings: Number(counts.total_recordings) || 0,
        activeRecordings: Number(counts.active_recordings) || 0,
        trashedRecordings: Number(counts.trashed_recordings) || 0,
        splitMasters: Number(counts.split_masters) || 0,
        transcripts: Number(counts.transcript_count) || 0,
        stories: Number(counts.story_count) || 0,
        questions: Number(questionCount?.count) || 0,
        activeMembers: Number(memberCount?.count) || 0,
      },
      storage: {
        objectCount: storedObjects.length,
        totalBytes: totalStorageBytes,
        referencedAudioFileCount: uniqueAudioPaths.size,
        referencedPhotoCount: photoRows.results.length,
        missingAudio,
        missingPhotos,
        orphanedObjects,
      },
      backups: backups.results.map((backup) => ({
        id: backup.id,
        createdAt: backup.created_at,
        createdBy: backup.created_by,
        recordingCount: backup.recording_count,
        audioFileCount: backup.audio_file_count,
        missingAudioCount: backup.missing_audio_count,
        sizeBytes: backup.backup_size_bytes,
      })),
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

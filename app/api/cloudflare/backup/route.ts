import JSZip from "jszip";

import {
  getVaultBindings,
  requireVaultMember,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

export const maxDuration = 300;

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

function safeFilePart(value: string) {
  return (value || "untitled")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

function fileExtension(path: string) {
  const cleanPath = path.split("?")[0];
  const fileName = cleanPath.split("/").pop() || "";
  const dot = fileName.lastIndexOf(".");

  if (dot < 0 || dot === fileName.length - 1) {
    return "audio";
  }

  return fileName.slice(dot + 1).toLowerCase();
}

export async function GET(request: Request) {
  try {
    const member = await requireVaultMember(request);

    if (!member.isAdmin) {
      return Response.json(
        { error: "Only a Vault administrator can create a full backup." },
        { status: 403 },
      );
    }

    const { db, files } = await getVaultBindings();

    const [
      tracksResult,
      reviewsResult,
      questionsResult,
      photosResult,
      membersResult,
      accessResult,
      previousBackupsResult,
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
           ORDER BY audio_track_id ASC, sort_order ASC, created_at ASC`,
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
           ORDER BY member_email ASC, vault_person ASC`,
        )
        .all(),

      db
        .prepare(
          `SELECT *
           FROM vault_backup_history
           ORDER BY created_at ASC, id ASC`,
        )
        .all(),
    ]);

    const tracks = tracksResult.results;
    const photos = photosResult.results;
    const createdAt = new Date().toISOString();

    const zip = new JSZip();

    zip.file(
      "START-HERE.txt",
      [
        "FIELDS FAMILY VAULT — FULL BACKUP",
        "",
        `Backup created: ${createdAt}`,
        `Created by: ${member.email}`,
        "",
        "This ZIP is intended to preserve the family archive even if the website",
        "is no longer available.",
        "",
        "WHAT IS INCLUDED",
        "",
        "audio/",
        "  Original audio files stored in Cloudflare R2.",
        "",
        "transcripts/",
        "  Readable word-for-word transcript files.",
        "",
        "stories/",
        "  Readable family-story files.",
        "",
        "photos/",
        "  Story photographs currently stored in the Vault.",
        "",
        "metadata/",
        "  Complete database information in JSON format.",
        "",
        "IMPORTANT",
        "",
        "Split-answer entries may point to the same original audio recording.",
        "The backup stores each unique original audio file once while preserving",
        "all split information and relationships in metadata/audio_tracks.json.",
        "",
        "Nothing in the live Vault was removed or changed by creating this backup.",
      ].join("\n"),
    );

    zip.file(
      "metadata/audio_tracks.json",
      JSON.stringify(tracks, null, 2),
    );

    zip.file(
      "metadata/audio_track_reviews.json",
      JSON.stringify(reviewsResult.results, null, 2),
    );

    zip.file(
      "metadata/questions.json",
      JSON.stringify(questionsResult.results, null, 2),
    );

    zip.file(
      "metadata/story_photos.json",
      JSON.stringify(photos, null, 2),
    );

    zip.file(
      "metadata/vault_members.json",
      JSON.stringify(membersResult.results, null, 2),
    );

    zip.file(
      "metadata/vault_access.json",
      JSON.stringify(accessResult.results, null, 2),
    );

    zip.file(
      "metadata/vault_backup_history.json",
      JSON.stringify(previousBackupsResult.results, null, 2),
    );

    const missingAudio: Array<{
      recordingId: string;
      title: string;
      storagePath: string;
    }> = [];

    const audioFiles = new Map<string, string>();
    let audioFileCount = 0;

    for (let index = 0; index < tracks.length; index += 1) {
      const track = tracks[index];

      const date = new Date(track.created_at);
      const datePart = Number.isNaN(date.getTime())
        ? "unknown-date"
        : date.toISOString().slice(0, 10);

      const baseName =
        `${String(index + 1).padStart(3, "0")}-` +
        `${datePart}-${safeFilePart(track.title)}`;

      zip.file(
        `transcripts/${baseName}.txt`,
        [
          `Title: ${track.title}`,
          `Vault: ${track.vault_person}`,
          `Speaker: ${track.speaker}`,
          `Category: ${track.category || "General"}`,
          `Created: ${track.created_at}`,
          `Question ID: ${track.question_id || "None"}`,
          `Source Track ID: ${track.source_track_id || "None"}`,
          `Clip Start: ${
            track.clip_start_seconds === null
              ? "None"
              : `${track.clip_start_seconds} seconds`
          }`,
          `Clip End: ${
            track.clip_end_seconds === null
              ? "None"
              : `${track.clip_end_seconds} seconds`
          }`,
          "",
          track.transcript || "[No transcript saved]",
        ].join("\n"),
      );

      if (track.story_title || track.story_chapter) {
        zip.file(
          `stories/${baseName}.txt`,
          [
            `Title: ${track.story_title || track.title}`,
            `Source recording: ${track.title}`,
            `Vault: ${track.vault_person}`,
            `Created: ${track.created_at}`,
            "",
            track.story_chapter || "[No family story saved]",
          ].join("\n"),
        );
      }

      const storagePath = track.storage_path?.trim();

      if (!storagePath) {
        continue;
      }

      if (audioFiles.has(storagePath)) {
        continue;
      }

      const object = await files.get(storagePath);

      if (!object) {
        missingAudio.push({
          recordingId: track.id,
          title: track.title,
          storagePath,
        });

        continue;
      }

      const extension = fileExtension(storagePath);
      const audioName =
        `${String(audioFileCount + 1).padStart(3, "0")}-` +
        `${safeFilePart(track.title)}.${extension}`;

      zip.file(
        `audio/${audioName}`,
        await object.arrayBuffer(),
      );

      audioFiles.set(storagePath, `audio/${audioName}`);
      audioFileCount += 1;
    }

    const missingPhotos: Array<{
      photoId: string;
      storagePath: string;
    }> = [];

    let photoFileCount = 0;

    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index];

      const object = await files.get(photo.storage_path);

      if (!object) {
        missingPhotos.push({
          photoId: photo.id,
          storagePath: photo.storage_path,
        });

        continue;
      }

      const extension = fileExtension(photo.storage_path);

      const photoName =
        `${String(index + 1).padStart(3, "0")}-` +
        `${safeFilePart(photo.id)}.${extension}`;

      zip.file(
        `photos/${photoName}`,
        await object.arrayBuffer(),
      );

      photoFileCount += 1;
    }

    zip.file(
      "metadata/audio-file-map.json",
      JSON.stringify(
        Object.fromEntries(audioFiles),
        null,
        2,
      ),
    );

    zip.file(
      "metadata/backup-report.json",
      JSON.stringify(
        {
          createdAt,
          createdBy: member.email,
          recordingCount: tracks.length,
          uniqueAudioFilesIncluded: audioFileCount,
          photoFilesIncluded: photoFileCount,
          missingAudio,
          missingPhotos,
        },
        null,
        2,
      ),
    );

    if (missingAudio.length > 0 || missingPhotos.length > 0) {
      zip.file(
        "MISSING-FILES.txt",
        [
          "FIELDS FAMILY VAULT — MISSING FILE REPORT",
          "",
          "The database information for these items is included in the backup,",
          "but the corresponding file could not be found in Cloudflare R2.",
          "",
          "MISSING AUDIO",
          "",
          ...(missingAudio.length
            ? missingAudio.map(
                (item) =>
                  `${item.title} | ${item.recordingId} | ${item.storagePath}`,
              )
            : ["None"]),
          "",
          "MISSING PHOTOS",
          "",
          ...(missingPhotos.length
            ? missingPhotos.map(
                (item) => `${item.photoId} | ${item.storagePath}`,
              )
            : ["None"]),
        ].join("\n"),
      );
    }

    const zipData = await zip.generateAsync({
      type: "arraybuffer",
      compression: "DEFLATE",
      compressionOptions: {
        level: 6,
      },
    });

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
        tracks.length,
        audioFileCount,
        missingAudio.length,
        zipData.byteLength,
      )
      .run();

    const fileDate = createdAt.slice(0, 10);

    return new Response(zipData, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition":
          `attachment; filename="fields-family-vault-backup-${fileDate}.zip"`,
        "Content-Length": String(zipData.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

import JSZip from "jszip";

import {
  getVaultBindings,
  requireVaultMember,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

export const maxDuration = 300;

type AudioTrackRow = {
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
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);

  return cleaned || "untitled";
}

function extensionFromPath(path: string) {
  const fileName = path.split("/").pop() || "";
  const dot = fileName.lastIndexOf(".");

  if (dot < 0 || dot === fileName.length - 1) {
    return "bin";
  }

  return fileName.slice(dot + 1).split("?")[0] || "bin";
}

async function addR2ObjectToZip(
  zip: JSZip,
  files: R2Bucket,
  storagePath: string,
  destination: string,
) {
  const object = await files.get(storagePath);

  if (!object) {
    return false;
  }

  const bytes = await object.arrayBuffer();
  zip.file(destination, bytes);

  return true;
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
      questionsResult,
      progressResult,
      recordingLinksResult,
      reviewsResult,
      membersResult,
      accessResult,
      photosResult,
    ] = await Promise.all([
      db.prepare("SELECT * FROM audio_tracks ORDER BY created_at ASC").all<AudioTrackRow>(),
      db.prepare("SELECT * FROM questions ORDER BY question_number ASC").all(),
      db.prepare("SELECT * FROM question_progress").all(),
      db.prepare("SELECT * FROM question_recordings").all(),
      db.prepare("SELECT * FROM audio_track_reviews").all(),
      db.prepare("SELECT * FROM vault_members ORDER BY email ASC").all(),
      db.prepare("SELECT * FROM vault_access ORDER BY member_email ASC").all(),
      db
        .prepare(
          `SELECT
             id,
             audio_track_id,
             storage_path,
             caption,
             sort_order,
             created_at,
             updated_at
           FROM story_photos
           ORDER BY audio_track_id, sort_order, created_at`,
        )
        .all<PhotoRow>(),
    ]);

    const tracks = tracksResult.results;
    const photos = photosResult.results;

    const zip = new JSZip();

    const createdAt = new Date().toISOString();

    zip.file(
      "README.txt",
      [
        "Fields Family Audio Vault — Full Backup",
        "",
        `Created: ${createdAt}`,
        `Created by: ${member.email}`,
        "",
        "This archive was created from the Cloudflare version of the Fields Family Vault.",
        "",
        "It contains:",
        "- Original audio files stored in Cloudflare R2",
        "- Saved photographs stored in Cloudflare R2",
        "- Word-for-word transcripts",
        "- Family stories",
        "- Recording metadata",
        "- Questions and question progress",
        "- Recording/question relationships",
        "- Review information",
        "- Vault member/access information",
        "",
        "The original files in the live Vault were not changed or removed.",
        "",
        "Folders:",
        "- audio/        Original recordings",
        "- photos/       Story photographs",
        "- transcripts/  Word-for-word transcripts",
        "- stories/      Family-story text",
        "- metadata/     Complete Vault data in JSON format",
      ].join("\n"),
    );

    zip.file(
      "metadata/audio_tracks.json",
      JSON.stringify(tracks, null, 2),
    );

    zip.file(
      "metadata/questions.json",
      JSON.stringify(questionsResult.results, null, 2),
    );

    zip.file(
      "metadata/question_progress.json",
      JSON.stringify(progressResult.results, null, 2),
    );

    zip.file(
      "metadata/question_recordings.json",
      JSON.stringify(recordingLinksResult.results, null, 2),
    );

    zip.file(
      "metadata/audio_track_reviews.json",
      JSON.stringify(reviewsResult.results, null, 2),
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
      "metadata/story_photos.json",
      JSON.stringify(photos, null, 2),
    );

    const missingAudio: Array<{
      recordingId: string;
      title: string;
      storagePath: string;
    }> = [];

    const copiedAudioPaths = new Set<string>();
    let audioFileCount = 0;

    for (let index = 0; index < tracks.length; index += 1) {
      const track = tracks[index];

      const date = new Date(track.created_at);
      const datePart = Number.isNaN(date.getTime())
        ? "unknown-date"
        : date.toISOString().slice(0, 10);

      const baseName = `${String(index + 1).padStart(3, "0")}-${datePart}-${safeFilePart(track.title)}`;

      zip.file(
        `transcripts/${baseName}.txt`,
        [
          `Title: ${track.title}`,
          `Vault: ${track.vault_person}`,
          `Speaker: ${track.speaker}`,
          `Category: ${track.category || "General"}`,
          `Created: ${track.created_at}`,
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
            "",
            track.story_chapter || "[No family story saved]",
          ].join("\n"),
        );
      }

      const storagePath = track.storage_path?.trim();

      if (!storagePath || copiedAudioPaths.has(storagePath)) {
        continue;
      }

      copiedAudioPaths.add(storagePath);

      const extension = extensionFromPath(storagePath);
      const destination = `audio/${baseName}.${extension}`;

      const copied = await addR2ObjectToZip(
        zip,
        files,
        storagePath,
        destination,
      );

      if (copied) {
        audioFileCount += 1;
      } else {
        missingAudio.push({
          recordingId: track.id,
          title: track.title,
          storagePath,
        });
      }
    }

    const missingPhotos: Array<{
      photoId: string;
      storagePath: string;
    }> = [];

    let photoFileCount = 0;

    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index];
      const extension = extensionFromPath(photo.storage_path);

      const destination =
        `photos/${String(index + 1).padStart(3, "0")}-${safeFilePart(photo.id)}.${extension}`;

      const copied = await addR2ObjectToZip(
        zip,
        files,
        photo.storage_path,
        destination,
      );

      if (copied) {
        photoFileCount += 1;
      } else {
        missingPhotos.push({
          photoId: photo.id,
          storagePath: photo.storage_path,
        });
      }
    }

    zip.file(
      "metadata/backup_report.json",
      JSON.stringify(
        {
          createdAt,
          createdBy: member.email,
          recordingCount: tracks.length,
          uniqueReferencedAudioFiles: copiedAudioPaths.size,
          audioFilesIncluded: audioFileCount,
          photoFilesIncluded: photoFileCount,
          missingAudio,
          missingPhotos,
        },
        null,
        2,
      ),
    );

    const zipBytes = await zip.generateAsync({
      type: "uint8array",
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
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        member.email,
        tracks.length,
        audioFileCount,
        missingAudio.length,
        zipBytes.byteLength,
      )
      .run();

    const fileDate = createdAt.slice(0, 10);

    return new Response(zipBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition":
          `attachment; filename="fields-family-vault-backup-${fileDate}.zip"`,
        "Content-Length": String(zipBytes.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

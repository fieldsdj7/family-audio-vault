import { strToU8, Zip, ZipPassThrough } from "fflate";

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

function safeFilePart(value: string) {
  return (value || "untitled")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

function fileExtension(path: string, fallback = "bin") {
  const cleanPath = path.split("?")[0];
  const fileName = cleanPath.split("/").pop() || "";
  const dot = fileName.lastIndexOf(".");

  if (dot < 0 || dot === fileName.length - 1) {
    return fallback;
  }

  return fileName.slice(dot + 1).toLowerCase();
}

function addTextFile(zip: Zip, name: string, contents: string) {
  const file = new ZipPassThrough(name);
  zip.add(file);
  file.push(strToU8(contents), true);
}

async function streamR2ObjectIntoZip(
  zip: Zip,
  zipPath: string,
  body: ReadableStream<Uint8Array>,
  waitForOutput: () => Promise<void>,
) {
  const entry = new ZipPassThrough(zipPath);

  zip.add(entry);

  const reader = body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        entry.push(new Uint8Array(0), true);
        await waitForOutput();
        break;
      }

      if (value && value.byteLength > 0) {
        entry.push(value, false);

        // Wait until the current ZIP output has been handed to the
        // response stream before reading more from R2. This prevents
        // large backups from accumulating in Worker memory.
        await waitForOutput();
      }
    }
  } finally {
    reader.releaseLock();
  }
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
    const fileDate = createdAt.slice(0, 10);

    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();

    let writeChain: Promise<void> = Promise.resolve();
    let backupSizeBytes = 0;
    let zipError: Error | null = null;

    const zip = new Zip((error, data) => {
      if (error) {
        zipError =
          error instanceof Error
            ? error
            : new Error("ZIP creation failed.");

        return;
      }

      if (!data || data.byteLength === 0) {
        return;
      }

      backupSizeBytes += data.byteLength;

      writeChain = writeChain.then(async () => {
        await writer.write(data);
      });
    });

    const waitForOutput = async () => {
      await writeChain;

      if (zipError) {
        throw zipError;
      }
    };

    void (async () => {
      try {
        addTextFile(
          zip,
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
            "The backup stores each unique audio file once while preserving",
            "recording relationships and database information in metadata.",
            "",
            "Nothing in the live Vault was removed or changed by creating this backup.",
          ].join("\n"),
        );

        addTextFile(
          zip,
          "metadata/audio_tracks.json",
          JSON.stringify(tracks, null, 2),
        );

        addTextFile(
          zip,
          "metadata/audio_track_reviews.json",
          JSON.stringify(reviewsResult.results, null, 2),
        );

        addTextFile(
          zip,
          "metadata/questions.json",
          JSON.stringify(questionsResult.results, null, 2),
        );

        addTextFile(
          zip,
          "metadata/story_photos.json",
          JSON.stringify(photos, null, 2),
        );

        addTextFile(
          zip,
          "metadata/vault_members.json",
          JSON.stringify(membersResult.results, null, 2),
        );

        addTextFile(
          zip,
          "metadata/vault_access.json",
          JSON.stringify(accessResult.results, null, 2),
        );

        addTextFile(
          zip,
          "metadata/vault_backup_history.json",
          JSON.stringify(previousBackupsResult.results, null, 2),
        );

        await waitForOutput();

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

          addTextFile(
            zip,
            `transcripts/${baseName}.txt`,
            [
              `Title: ${track.title}`,
              `Vault: ${track.vault_person}`,
              `Speaker: ${track.speaker}`,
              `Speaker 1: ${track.speaker_1_name || "Not specified"}`,
              `Speaker 2: ${track.speaker_2_name || "Not specified"}`,
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
            addTextFile(
              zip,
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

          await waitForOutput();

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

          const extension = fileExtension(storagePath, "audio");

          const audioName =
            `${String(audioFileCount + 1).padStart(3, "0")}-` +
            `${safeFilePart(track.title)}.${extension}`;

          const zipPath = `audio/${audioName}`;

          await streamR2ObjectIntoZip(
            zip,
            zipPath,
            object.body,
            waitForOutput,
          );

          audioFiles.set(storagePath, zipPath);
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

          const extension = fileExtension(photo.storage_path, "image");

          const photoName =
            `${String(index + 1).padStart(3, "0")}-` +
            `${safeFilePart(photo.id)}.${extension}`;

          await streamR2ObjectIntoZip(
            zip,
            `photos/${photoName}`,
            object.body,
            waitForOutput,
          );

          photoFileCount += 1;
        }

        addTextFile(
          zip,
          "metadata/audio-file-map.json",
          JSON.stringify(Object.fromEntries(audioFiles), null, 2),
        );

        addTextFile(
          zip,
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
          addTextFile(
            zip,
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

        await waitForOutput();

        zip.end();

        await waitForOutput();

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
            backupSizeBytes,
          )
          .run();

        await writer.close();
      } catch (error) {
        console.error("Full vault backup failed:", error);

        try {
          zip.terminate();
        } catch {
          // ZIP may already have finished.
        }

        try {
          await writer.abort(error);
        } catch {
          // Response stream may already be closed.
        }
      }
    })();

    return new Response(stream.readable, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition":
          `attachment; filename="fields-family-vault-backup-${fileDate}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

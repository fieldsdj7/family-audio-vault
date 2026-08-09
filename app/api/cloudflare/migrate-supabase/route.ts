import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  getVaultBindings,
  requireVaultMember,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

type SupabaseTrack = {
  id: string;
  title: string | null;
  speaker: string | null;
  category: string | null;
  vault_person: string | null;
  storage_path: string | null;
  audio_url: string | null;
  transcript: string | null;
  transcription_status: string | null;
  transcription_error: string | null;
  story_title: string | null;
  story_chapter: string | null;
  story_status: string | null;
  story_error: string | null;
  source_track_id: string | null;
  clip_start_seconds: number | null;
  clip_end_seconds: number | null;
  split_notes: string | null;
  is_split_master: number | boolean | null;
  trashed_at: string | null;
  trashed_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function encodedStoragePath(path: string) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function extensionFromTrack(track: SupabaseTrack) {
  const source =
    track.storage_path ||
    track.audio_url ||
    "";

  const clean = source.split("?")[0];
  const extension = clean.split(".").pop()?.toLowerCase();

  if (
    extension &&
    /^[a-z0-9]{1,8}$/.test(extension)
  ) {
    return extension;
  }

  return "audio";
}

function contentTypeForExtension(extension: string) {
  switch (extension) {
    case "m4a":
    case "mp4":
      return "audio/mp4";

    case "mp3":
      return "audio/mpeg";

    case "wav":
      return "audio/wav";

    case "ogg":
    case "oga":
      return "audio/ogg";

    case "webm":
      return "audio/webm";

    default:
      return "application/octet-stream";
  }
}

async function requireAdministrator(request: Request) {
  const member = await requireVaultMember(request);

  if (!member.isAdmin) {
    return {
      member: null,
      response: Response.json(
        {
          error:
            "Only a Vault administrator can run the Supabase migration.",
        },
        { status: 403 },
      ),
    };
  }

  return {
    member,
    response: null,
  };
}

async function loadSupabaseTracks(
  supabaseUrl: string,
  serviceRoleKey: string,
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/audio_tracks?select=*&order=created_at.asc`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Could not read Supabase recordings: ${response.status} ${text}`,
    );
  }

  return (await response.json()) as SupabaseTrack[];
}

async function fetchSupabaseAudio(
  track: SupabaseTrack,
  supabaseUrl: string,
  serviceRoleKey: string,
) {
  if (track.storage_path) {
    const path = encodedStoragePath(
      track.storage_path,
    );

    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/audio-files/${path}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Could not download "${track.title || track.id}" from Supabase Storage (${response.status}).`,
      );
    }

    return response;
  }

  if (track.audio_url) {
    const response = await fetch(track.audio_url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Could not download legacy audio for "${track.title || track.id}" (${response.status}).`,
      );
    }

    return response;
  }

  throw new Error(
    `"${track.title || track.id}" has no saved audio location.`,
  );
}

export async function GET(request: Request) {
  try {
    const access =
      await requireAdministrator(request);

    if (access.response) {
      return access.response;
    }

    const context =
      await getCloudflareContext({
        async: true,
      });

    const env = context.env as unknown as {
      NEXT_PUBLIC_SUPABASE_URL?: string;
      SUPABASE_SERVICE_ROLE_KEY?: string;
    };

    const supabaseUrl =
      env.NEXT_PUBLIC_SUPABASE_URL?.trim();

    const serviceRoleKey =
      env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json(
        {
          error:
            "The Supabase runtime migration variables are not configured.",
        },
        { status: 500 },
      );
    }

    const tracks = await loadSupabaseTracks(
      supabaseUrl,
      serviceRoleKey,
    );

    const summary = {
      total: tracks.length,
      Papa: tracks.filter(
        (track) => track.vault_person === "Papa",
      ).length,
      Dad: tracks.filter(
        (track) => track.vault_person === "Dad",
      ).length,
      Mom: tracks.filter(
        (track) => track.vault_person === "Mom",
      ).length,
      withTranscript: tracks.filter(
        (track) => !!track.transcript?.trim(),
      ).length,
      withStory: tracks.filter(
        (track) => !!track.story_chapter?.trim(),
      ).length,
      trashed: tracks.filter(
        (track) => !!track.trashed_at,
      ).length,
    };

    return Response.json({
      ready: true,
      summary,
      recordings: tracks.map((track) => ({
        id: track.id,
        title: track.title,
        vaultPerson: track.vault_person,
        hasAudio:
          !!track.storage_path ||
          !!track.audio_url,
        hasTranscript:
          !!track.transcript?.trim(),
        hasStory:
          !!track.story_chapter?.trim(),
        trashed: !!track.trashed_at,
      })),
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const access =
      await requireAdministrator(request);

    if (access.response || !access.member) {
      return access.response;
    }

    const body = (await request.json()) as {
      confirm?: unknown;
    };

    if (body.confirm !== "COPY SUPABASE TO CLOUDFLARE") {
      return Response.json(
        {
          error:
            'Migration was not confirmed. Send confirm: "COPY SUPABASE TO CLOUDFLARE".',
        },
        { status: 400 },
      );
    }

    const context =
      await getCloudflareContext({
        async: true,
      });

    const env = context.env as unknown as {
      NEXT_PUBLIC_SUPABASE_URL?: string;
      SUPABASE_SERVICE_ROLE_KEY?: string;
    };

    const supabaseUrl =
      env.NEXT_PUBLIC_SUPABASE_URL?.trim();

    const serviceRoleKey =
      env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json(
        {
          error:
            "The Supabase runtime migration variables are not configured.",
        },
        { status: 500 },
      );
    }

    const { db, files } =
      await getVaultBindings();

    const sourceTracks =
      await loadSupabaseTracks(
        supabaseUrl,
        serviceRoleKey,
      );

    const copied: Array<{
      id: string;
      title: string;
      storagePath: string;
    }> = [];

    const skipped: Array<{
      id: string;
      title: string;
      reason: string;
    }> = [];

    const failed: Array<{
      id: string;
      title: string;
      error: string;
    }> = [];

    /*
     * Parents first. This makes it safer to restore
     * source_track_id relationships afterward.
     */
    const tracks = [...sourceTracks].sort(
      (a, b) =>
        Number(!!a.source_track_id) -
        Number(!!b.source_track_id),
    );

    for (const track of tracks) {
      const title =
        track.title?.trim() ||
        "Untitled recording";

      try {
        const existing = await db
          .prepare(
            `SELECT id
             FROM audio_tracks
             WHERE id = ?`,
          )
          .bind(track.id)
          .first<{ id: string }>();

        if (existing) {
          skipped.push({
            id: track.id,
            title,
            reason:
              "Recording already exists in Cloudflare.",
          });

          continue;
        }

        const audioResponse =
          await fetchSupabaseAudio(
            track,
            supabaseUrl,
            serviceRoleKey,
          );

        const extension =
          extensionFromTrack(track);

        /*
         * Every migrated recording gets its own
         * Cloudflare R2 object.
         */
        const storagePath =
          `recordings/${track.id}.${extension}`;

        await files.put(
          storagePath,
          audioResponse.body,
          {
            httpMetadata: {
              contentType:
                audioResponse.headers.get(
                  "content-type",
                ) ||
                contentTypeForExtension(
                  extension,
                ),
            },
            customMetadata: {
              migratedFrom: "supabase",
              migratedBy:
                access.member.email,
              originalStoragePath:
                track.storage_path || "",
            },
          },
        );

        try {
          await db
            .prepare(
              `INSERT INTO audio_tracks (
                 id,
                 title,
                 speaker,
                 category,
                 vault_person,
                 question_id,
                 storage_path,
                 transcript,
                 transcription_status,
                 transcription_error,
                 story_title,
                 story_chapter,
                 story_status,
                 story_error,
                 source_track_id,
                 clip_start_seconds,
                 clip_end_seconds,
                 split_notes,
                 is_split_master,
                 trashed_at,
                 trashed_by,
                 created_at,
                 updated_at
               )
               VALUES (
                 ?, ?, ?, ?, ?,
                 NULL,
                 ?, ?, ?, ?,
                 ?, ?, ?, ?,
                 NULL,
                 ?, ?, ?,
                 ?, ?, ?,
                 COALESCE(?, datetime('now')),
                 COALESCE(?, datetime('now'))
               )`,
            )
            .bind(
              track.id,
              title,
              track.speaker?.trim() ||
                "Unknown",
              track.category?.trim() ||
                "General",
              track.vault_person ===
                "Papa" ||
                track.vault_person ===
                  "Mom"
                ? track.vault_person
                : "Dad",
              storagePath,
              track.transcript,
              track.transcript?.trim()
                ? "complete"
                : track.transcription_status ||
                    "not_started",
              track.transcription_error,
              track.story_title,
              track.story_chapter,
              track.story_chapter?.trim()
                ? "complete"
                : track.story_status ||
                    "not_started",
              track.story_error,
              track.clip_start_seconds,
              track.clip_end_seconds,
              track.split_notes,
              track.is_split_master
                ? 1
                : 0,
              track.trashed_at,
              track.trashed_by,
              track.created_at,
              track.updated_at,
            )
            .run();
        } catch (databaseError) {
          await files.delete(storagePath);
          throw databaseError;
        }

        copied.push({
          id: track.id,
          title,
          storagePath,
        });
      } catch (error) {
        failed.push({
          id: track.id,
          title,
          error:
            error instanceof Error
              ? error.message
              : "Unknown migration error.",
        });
      }
    }

    /*
     * Restore split-source relationships only
     * after all rows have been created.
     */
    for (const track of tracks) {
      if (!track.source_track_id) {
        continue;
      }

      try {
        const sourceExists = await db
          .prepare(
            `SELECT id
             FROM audio_tracks
             WHERE id = ?`,
          )
          .bind(track.source_track_id)
          .first<{ id: string }>();

        const childExists = await db
          .prepare(
            `SELECT id
             FROM audio_tracks
             WHERE id = ?`,
          )
          .bind(track.id)
          .first<{ id: string }>();

        if (sourceExists && childExists) {
          await db
            .prepare(
              `UPDATE audio_tracks
               SET source_track_id = ?
               WHERE id = ?`,
            )
            .bind(
              track.source_track_id,
              track.id,
            )
            .run();
        }
      } catch (error) {
        failed.push({
          id: track.id,
          title:
            track.title ||
            "Untitled recording",
          error:
            `Recording copied, but its split-source link could not be restored: ${
              error instanceof Error
                ? error.message
                : "Unknown error"
            }`,
        });
      }
    }

    return Response.json({
      migrationComplete:
        failed.length === 0,
      sourceRecordingCount:
        sourceTracks.length,
      copiedCount: copied.length,
      skippedCount: skipped.length,
      failedCount: failed.length,
      copied,
      skipped,
      failed,
      supabaseChanged: false,
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

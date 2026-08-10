import {
  getVaultBindings,
  requireVaultMember,
  type VaultPerson,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

type TrashAction =
  | "trash"
  | "restore"
  | "permanent";

type RecordingRow = {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: VaultPerson;
  storage_path: string | null;
  transcript: string | null;
  story_chapter: string | null;
  created_at: string;
  trashed_at: string | null;
};

type PhotoRow = {
  storage_path: string;
};

function isTrashAction(
  value: unknown,
): value is TrashAction {
  return (
    value === "trash" ||
    value === "restore" ||
    value === "permanent"
  );
}

async function requireAdministrator(
  request: Request,
) {
  const member =
    await requireVaultMember(
      request,
    );

  if (!member.isAdmin) {
    return {
      member: null,

      response:
        Response.json(
          {
            error:
              "Only a Vault administrator can manage Trash.",
          },
          {
            status: 403,
          },
        ),
    };
  }

  return {
    member,
    response: null,
  };
}

export async function GET(
  request: Request,
) {
  try {
    const access =
      await requireAdministrator(
        request,
      );

    if (access.response) {
      return access.response;
    }

    const { db } =
      await getVaultBindings();

    const recordings =
      await db
        .prepare(
          `SELECT
             id,
             title,
             speaker,
             category,
             vault_person,
             storage_path,
             transcript,
             story_chapter,
             created_at,
             trashed_at
           FROM audio_tracks
           WHERE trashed_at IS NOT NULL
           ORDER BY trashed_at DESC`,
        )
        .all<RecordingRow>();

    return Response.json({
      recordings:
        recordings.results,
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
    const access =
      await requireAdministrator(
        request,
      );

    if (
      access.response ||
      !access.member
    ) {
      return access.response;
    }

    const body =
      (await request.json()) as {
        recordingId?: unknown;
        trackId?: unknown;
        action?: unknown;
      };

    const rawId =
      typeof body.recordingId ===
      "string"
        ? body.recordingId
        : typeof body.trackId ===
            "string"
          ? body.trackId
          : "";

    const recordingId =
      rawId.trim();

    if (!recordingId) {
      return Response.json(
        {
          error:
            "A recording was not specified.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !isTrashAction(
        body.action,
      )
    ) {
      return Response.json(
        {
          error:
            "That Trash action is not available.",
        },
        {
          status: 400,
        },
      );
    }

    const {
      db,
      files,
    } =
      await getVaultBindings();

    const recording =
      await db
        .prepare(
          `SELECT
             id,
             title,
             speaker,
             category,
             vault_person,
             storage_path,
             transcript,
             story_chapter,
             created_at,
             trashed_at
           FROM audio_tracks
           WHERE id = ?`,
        )
        .bind(
          recordingId,
        )
        .first<RecordingRow>();

    if (!recording) {
      return Response.json(
        {
          error:
            "That recording could not be found.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      body.action ===
      "trash"
    ) {
      if (
        recording.trashed_at
      ) {
        return Response.json(
          {
            error:
              "This recording is already in Trash.",
          },
          {
            status: 409,
          },
        );
      }

      await db
        .prepare(
          `UPDATE audio_tracks
           SET trashed_at = datetime('now'),
               trashed_by = ?,
               updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(
          access.member.email,
          recording.id,
        )
        .run();

      return Response.json({
        trashed: true,
        success: true,
      });
    }

    if (
      body.action ===
      "restore"
    ) {
      if (
        !recording.trashed_at
      ) {
        return Response.json(
          {
            error:
              "This recording is not in Trash.",
          },
          {
            status: 409,
          },
        );
      }

      await db
        .prepare(
          `UPDATE audio_tracks
           SET trashed_at = NULL,
               trashed_by = NULL,
               updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(
          recording.id,
        )
        .run();

      return Response.json({
        restored: true,
        success: true,
      });
    }

    if (
      !recording.trashed_at
    ) {
      return Response.json(
        {
          error:
            "Move this recording to Trash before permanently removing it.",
        },
        {
          status: 409,
        },
      );
    }

    const linkedRecording =
      await db
        .prepare(
          `SELECT id
           FROM audio_tracks
           WHERE source_track_id = ?
           LIMIT 1`,
        )
        .bind(
          recording.id,
        )
        .first<{
          id: string;
        }>();

    if (linkedRecording) {
      return Response.json(
        {
          error:
            "This recording has split recordings linked to it. Remove those recordings first.",
        },
        {
          status: 409,
        },
      );
    }

    const photos =
      await db
        .prepare(
          `SELECT storage_path
           FROM story_photos
           WHERE audio_track_id = ?`,
        )
        .bind(
          recording.id,
        )
        .all<PhotoRow>();

    const storagePaths = [
      recording.storage_path,

      ...photos.results.map(
        (photo) =>
          photo.storage_path,
      ),
    ].filter(
      (
        path,
      ): path is string =>
        Boolean(path),
    );

    if (
      storagePaths.length >
      0
    ) {
      await files.delete(
        storagePaths,
      );
    }

    await db
      .prepare(
        `DELETE FROM audio_tracks
         WHERE id = ?`,
      )
      .bind(
        recording.id,
      )
      .run();

    return Response.json({
      permanentlyDeleted:
        true,
      success: true,
    });
  } catch (error) {
    return vaultAccessResponse(
      error,
    );
  }
}

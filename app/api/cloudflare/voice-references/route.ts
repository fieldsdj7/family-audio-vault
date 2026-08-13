import {
  getVaultBindings,
  requireVaultMember,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

const MAX_VOICE_BYTES = 20 * 1024 * 1024;

type VoiceReferenceRow = {
  id: string;
  display_name: string;
  storage_path: string;
  mime_type: string;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
};

async function requireAdministrator(request: Request) {
  const member = await requireVaultMember(request);

  if (!member.isAdmin) {
    return {
      member: null,
      response: Response.json(
        {
          error:
            "Only a Vault administrator can manage voice references.",
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

function textField(form: FormData, name: string) {
  const value = form.get(name);

  return typeof value === "string"
    ? value.trim()
    : "";
}

function extensionForAudio(file: File) {
  const nameExtension = file.name
    .split(".")
    .pop()
    ?.toLowerCase();

  if (
    nameExtension &&
    /^[a-z0-9]{2,5}$/.test(nameExtension)
  ) {
    return nameExtension;
  }

  switch (file.type.toLowerCase()) {
    case "audio/mpeg":
      return "mp3";

    case "audio/mp4":
    case "audio/x-m4a":
      return "m4a";

    case "audio/wav":
    case "audio/x-wav":
      return "wav";

    case "audio/webm":
      return "webm";

    case "audio/ogg":
      return "ogg";

    default:
      return "audio";
  }
}

export async function GET(request: Request) {
  try {
    const access =
      await requireAdministrator(request);

    if (access.response) {
      return access.response;
    }

    const { db } =
      await getVaultBindings();

    const references = await db
      .prepare(
        `SELECT
           id,
           display_name,
           storage_path,
           mime_type,
           duration_seconds,
           created_at,
           updated_at
         FROM voice_references
         ORDER BY display_name COLLATE NOCASE ASC, created_at ASC`,
      )
      .all<VoiceReferenceRow>();

    return Response.json({
      references: references.results,
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

export async function POST(request: Request) {
  let uploadedPath: string | null = null;

  try {
    const access =
      await requireAdministrator(request);

    if (
      access.response ||
      !access.member
    ) {
      return access.response;
    }

    const form =
      await request.formData();

    const file =
      form.get("file");

    const displayName =
      textField(
        form,
        "displayName",
      );

    const durationSecondsRaw =
      textField(
        form,
        "durationSeconds",
      );

    const durationSeconds =
      durationSecondsRaw
        ? Number(durationSecondsRaw)
        : null;

    if (!displayName) {
      return Response.json(
        {
          error:
            "Enter the speaker's name.",
        },
        { status: 400 },
      );
    }

    if (displayName.length > 100) {
      return Response.json(
        {
          error:
            "The speaker name is too long.",
        },
        { status: 400 },
      );
    }

    if (
      !(file instanceof File) ||
      file.size === 0
    ) {
      return Response.json(
        {
          error:
            "Choose an audio sample to upload.",
        },
        { status: 400 },
      );
    }

    if (
      !file.type
        .toLowerCase()
        .startsWith("audio/")
    ) {
      return Response.json(
        {
          error:
            "The selected file must be audio.",
        },
        { status: 400 },
      );
    }

    if (
      file.size >
      MAX_VOICE_BYTES
    ) {
      return Response.json(
        {
          error:
            "Voice samples must be smaller than 20 MB.",
        },
        { status: 413 },
      );
    }

    if (
      durationSeconds !== null &&
      (!Number.isFinite(durationSeconds) ||
        durationSeconds < 2 ||
        durationSeconds > 10)
    ) {
      return Response.json(
        {
          error:
            "Use a clean voice sample between 2 and 10 seconds.",
        },
        { status: 400 },
      );
    }

    const {
      db,
      files,
    } =
      await getVaultBindings();

    const existing = await db
      .prepare(
        `SELECT
           id,
           storage_path
         FROM voice_references
         WHERE lower(display_name) = lower(?)
         LIMIT 1`,
      )
      .bind(displayName)
      .first<{
        id: string;
        storage_path: string;
      }>();

    const referenceId =
      existing?.id ||
      crypto.randomUUID();

    const extension =
      extensionForAudio(file);

    uploadedPath =
      `voice-references/${referenceId}.${extension}`;

    await files.put(
      uploadedPath,
      file.stream(),
      {
        httpMetadata: {
          contentType:
            file.type ||
            "application/octet-stream",
        },

        customMetadata: {
          displayName,
          uploadedBy:
            access.member.email,
          originalFilename:
            file.name,
        },
      },
    );

    try {
      if (existing) {
        await db
          .prepare(
            `UPDATE voice_references
             SET
               display_name = ?,
               storage_path = ?,
               mime_type = ?,
               duration_seconds = ?,
               updated_at = datetime('now')
             WHERE id = ?`,
          )
          .bind(
            displayName,
            uploadedPath,
            file.type ||
              "application/octet-stream",
            durationSeconds,
            referenceId,
          )
          .run();

        if (
          existing.storage_path !==
          uploadedPath
        ) {
          await files.delete(
            existing.storage_path,
          );
        }
      } else {
        await db
          .prepare(
            `INSERT INTO voice_references (
               id,
               display_name,
               storage_path,
               mime_type,
               duration_seconds
             )
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            referenceId,
            displayName,
            uploadedPath,
            file.type ||
              "application/octet-stream",
            durationSeconds,
          )
          .run();
      }
    } catch (databaseError) {
      await files.delete(
        uploadedPath,
      );

      throw databaseError;
    }

    return Response.json(
      {
        reference: {
          id:
            referenceId,
          display_name:
            displayName,
          storage_path:
            uploadedPath,
          mime_type:
            file.type ||
            "application/octet-stream",
          duration_seconds:
            durationSeconds,
        },
      },
      {
        status:
          existing
            ? 200
            : 201,
      },
    );
  } catch (error) {
    if (uploadedPath) {
      try {
        const { files } =
          await getVaultBindings();

        await files.delete(
          uploadedPath,
        );
      } catch {
        // Best-effort cleanup only.
      }
    }

    return vaultAccessResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const access =
      await requireAdministrator(request);

    if (access.response) {
      return access.response;
    }

    const body =
      (await request.json()) as {
        referenceId?: unknown;
      };

    const referenceId =
      typeof body.referenceId ===
      "string"
        ? body.referenceId.trim()
        : "";

    if (!referenceId) {
      return Response.json(
        {
          error:
            "A voice reference was not specified.",
        },
        { status: 400 },
      );
    }

    const {
      db,
      files,
    } =
      await getVaultBindings();

    const reference = await db
      .prepare(
        `SELECT
           id,
           storage_path
         FROM voice_references
         WHERE id = ?`,
      )
      .bind(referenceId)
      .first<{
        id: string;
        storage_path: string;
      }>();

    if (!reference) {
      return Response.json(
        {
          error:
            "That voice reference could not be found.",
        },
        { status: 404 },
      );
    }

    await files.delete(
      reference.storage_path,
    );

    await db
      .prepare(
        `DELETE FROM voice_references
         WHERE id = ?`,
      )
      .bind(reference.id)
      .run();

    return Response.json({
      deleted: true,
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

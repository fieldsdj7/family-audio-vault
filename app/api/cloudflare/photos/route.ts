import {
  getVaultBindings,
  requireVaultMember,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

type PhotoRow = {
  id: string;
  audio_track_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
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
            "Only a Vault administrator can manage story photos.",
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

function extensionForPhoto(file: File) {
  const nameExtension = file.name
    .split(".")
    .pop()
    ?.toLowerCase();

  if (
    nameExtension &&
    /^[a-z0-9]{2,5}$/.test(nameExtension)
  ) {
    return nameExtension === "jpeg"
      ? "jpg"
      : nameExtension;
  }

  switch (file.type.toLowerCase()) {
    case "image/jpeg":
      return "jpg";

    case "image/png":
      return "png";

    case "image/webp":
      return "webp";

    case "image/gif":
      return "gif";

    case "image/heic":
      return "heic";

    case "image/heif":
      return "heif";

    default:
      return "image";
  }
}

export async function GET(request: Request) {
  try {
    const access =
      await requireAdministrator(request);

    if (access.response) {
      return access.response;
    }

    const recordingId =
      new URL(request.url).searchParams
        .get("recordingId")
        ?.trim() || "";

    if (!recordingId) {
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

    const recording = await db
      .prepare(
        `SELECT id
         FROM audio_tracks
         WHERE id = ?
           AND trashed_at IS NULL
           AND is_split_master = 0`,
      )
      .bind(recordingId)
      .first<{ id: string }>();

    if (!recording) {
      return Response.json(
        {
          error:
            "That recording could not be found.",
        },
        { status: 404 },
      );
    }

    const photos = await db
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
         WHERE audio_track_id = ?
         ORDER BY sort_order ASC, created_at ASC`,
      )
      .bind(recordingId)
      .all<PhotoRow>();

    return Response.json({
      photos: photos.results,
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

    const recordingId =
      textField(
        form,
        "recordingId",
      );

    const caption =
      textField(
        form,
        "caption",
      );

    if (!recordingId) {
      return Response.json(
        {
          error:
            "A recording was not specified.",
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
            "Choose a photo to upload.",
        },
        { status: 400 },
      );
    }

    if (
      !file.type
        .toLowerCase()
        .startsWith("image/")
    ) {
      return Response.json(
        {
          error:
            "The selected file must be an image.",
        },
        { status: 400 },
      );
    }

    if (
      file.size >
      MAX_PHOTO_BYTES
    ) {
      return Response.json(
        {
          error:
            "Photos must be smaller than 20 MB.",
        },
        { status: 413 },
      );
    }

    if (
      caption.length > 1000
    ) {
      return Response.json(
        {
          error:
            "The photo caption is too long.",
        },
        { status: 400 },
      );
    }

    const {
      db,
      files,
    } =
      await getVaultBindings();

    const recording = await db
      .prepare(
        `SELECT id
         FROM audio_tracks
         WHERE id = ?
           AND trashed_at IS NULL
           AND is_split_master = 0`,
      )
      .bind(recordingId)
      .first<{ id: string }>();

    if (!recording) {
      return Response.json(
        {
          error:
            "That recording could not be found.",
        },
        { status: 404 },
      );
    }

    const lastPhoto = await db
      .prepare(
        `SELECT sort_order
         FROM story_photos
         WHERE audio_track_id = ?
         ORDER BY sort_order DESC
         LIMIT 1`,
      )
      .bind(recordingId)
      .first<{
        sort_order: number;
      }>();

    const sortOrder =
      (lastPhoto?.sort_order ?? -1) +
      1;

    const photoId =
      crypto.randomUUID();

    const extension =
      extensionForPhoto(file);

    uploadedPath =
      `story-photos/${recordingId}/${photoId}.${extension}`;

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
          audioTrackId:
            recordingId,

          uploadedBy:
            access.member.email,

          originalFilename:
            file.name,
        },
      },
    );

    try {
      await db
        .prepare(
          `INSERT INTO story_photos (
             id,
             audio_track_id,
             storage_path,
             caption,
             sort_order
           )
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          photoId,
          recordingId,
          uploadedPath,
          caption || null,
          sortOrder,
        )
        .run();
    } catch (databaseError) {
      await files.delete(
        uploadedPath,
      );

      throw databaseError;
    }

    return Response.json(
      {
        photo: {
          id: photoId,
          audio_track_id:
            recordingId,
          storage_path:
            uploadedPath,
          caption:
            caption || null,
          sort_order:
            sortOrder,
        },
      },
      { status: 201 },
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

export async function PATCH(request: Request) {
  try {
    const access =
      await requireAdministrator(request);

    if (access.response) {
      return access.response;
    }

    const body =
      (await request.json()) as {
        photoId?: unknown;
        caption?: unknown;
        sortOrder?: unknown;
      };

    const photoId =
      typeof body.photoId ===
      "string"
        ? body.photoId.trim()
        : "";

    if (!photoId) {
      return Response.json(
        {
          error:
            "A photo was not specified.",
        },
        { status: 400 },
      );
    }

    const caption =
      body.caption === undefined
        ? undefined
        : typeof body.caption ===
            "string"
          ? body.caption.trim() ||
            null
          : null;

    const sortOrder =
      body.sortOrder === undefined
        ? undefined
        : Number(
            body.sortOrder,
          );

    if (
      body.caption !== undefined &&
      body.caption !== null &&
      typeof body.caption !==
        "string"
    ) {
      return Response.json(
        {
          error:
            "The caption must be text.",
        },
        { status: 400 },
      );
    }

    if (
      typeof caption ===
        "string" &&
      caption.length > 1000
    ) {
      return Response.json(
        {
          error:
            "The photo caption is too long.",
        },
        { status: 400 },
      );
    }

    if (
      sortOrder !== undefined &&
      (!Number.isInteger(
        sortOrder,
      ) ||
        sortOrder < 0)
    ) {
      return Response.json(
        {
          error:
            "The photo order must be a whole number of zero or greater.",
        },
        { status: 400 },
      );
    }

    if (
      caption === undefined &&
      sortOrder === undefined
    ) {
      return Response.json(
        {
          error:
            "No photo changes were provided.",
        },
        { status: 400 },
      );
    }

    const { db } =
      await getVaultBindings();

    const existing = await db
      .prepare(
        `SELECT id
         FROM story_photos
         WHERE id = ?`,
      )
      .bind(photoId)
      .first<{ id: string }>();

    if (!existing) {
      return Response.json(
        {
          error:
            "That photo could not be found.",
        },
        { status: 404 },
      );
    }

    const assignments: string[] =
      [];

    const values: Array<
      string | number | null
    > = [];

    if (
      caption !== undefined
    ) {
      assignments.push(
        "caption = ?",
      );

      values.push(caption);
    }

    if (
      sortOrder !== undefined
    ) {
      assignments.push(
        "sort_order = ?",
      );

      values.push(sortOrder);
    }

    assignments.push(
      "updated_at = datetime('now')",
    );

    await db
      .prepare(
        `UPDATE story_photos
         SET ${assignments.join(
           ", ",
         )}
         WHERE id = ?`,
      )
      .bind(
        ...values,
        photoId,
      )
      .run();

    return Response.json({
      saved: true,
    });
  } catch (error) {
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
        photoId?: unknown;
      };

    const photoId =
      typeof body.photoId ===
      "string"
        ? body.photoId.trim()
        : "";

    if (!photoId) {
      return Response.json(
        {
          error:
            "A photo was not specified.",
        },
        { status: 400 },
      );
    }

    const {
      db,
      files,
    } =
      await getVaultBindings();

    const photo = await db
      .prepare(
        `SELECT
           id,
           storage_path
         FROM story_photos
         WHERE id = ?`,
      )
      .bind(photoId)
      .first<{
        id: string;
        storage_path: string;
      }>();

    if (!photo) {
      return Response.json(
        {
          error:
            "That photo could not be found.",
        },
        { status: 404 },
      );
    }

    await files.delete(
      photo.storage_path,
    );

    await db
      .prepare(
        `DELETE FROM story_photos
         WHERE id = ?`,
      )
      .bind(photo.id)
      .run();

    return Response.json({
      deleted: true,
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

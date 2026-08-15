import {
  getVaultBindings,
  type VaultPerson,
  vaultAccessResponse,
} from "../../../../../../lib/cloudflare";

const MAX_AUDIO_BYTES = 95 * 1024 * 1024;

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type StorytellerRequestRow = {
  id: string;
  vault_person: VaultPerson;
  question_id: string;
  recipient_name: string | null;
  status: "pending" | "submitted" | "revoked" | "expired";
  expires_at: string | null;
  question_number: number;
  question_text: string;
};

function bytesToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token);

  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes,
  );

  return bytesToHex(digest);
}

function storageExtension(file: File) {
  const extension =
    file.name.split(".").pop()?.toLowerCase();

  return extension &&
    /^[a-z0-9]{1,10}$/.test(extension)
    ? extension
    : "audio";
}

function fallbackSpeaker(
  vaultPerson: VaultPerson,
) {
  if (vaultPerson === "Papa") {
    return "Bill";
  }

  if (vaultPerson === "Dad") {
    return "Dan";
  }

  return "Ivy";
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  let uploadedPath: string | null = null;

  try {
    const { token } =
      await context.params;

    const cleanToken =
      token.trim();

    if (
      !cleanToken ||
      cleanToken.length < 32
    ) {
      return Response.json(
        {
          error:
            "This Storyteller link is invalid.",
        },
        {
          status: 404,
        },
      );
    }

    const tokenHash =
      await hashToken(cleanToken);

    const { db, files } =
      await getVaultBindings();

    const requestRow =
      await db
        .prepare(
          `SELECT
             sr.id,
             sr.vault_person,
             sr.question_id,
             sr.recipient_name,
             sr.status,
             sr.expires_at,
             q.question_number,
             q.question_text
           FROM storyteller_requests sr
           INNER JOIN questions q
             ON q.id = sr.question_id
           WHERE sr.token_hash = ?`,
        )
        .bind(tokenHash)
        .first<StorytellerRequestRow>();

    if (!requestRow) {
      return Response.json(
        {
          error:
            "This Storyteller link is invalid.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      requestRow.status === "submitted"
    ) {
      return Response.json(
        {
          error:
            "This Storyteller question has already been answered.",
        },
        {
          status: 410,
        },
      );
    }

    if (
      requestRow.status === "revoked"
    ) {
      return Response.json(
        {
          error:
            "This Storyteller request has been cancelled.",
        },
        {
          status: 410,
        },
      );
    }

    if (
      requestRow.status === "expired"
    ) {
      return Response.json(
        {
          error:
            "This Storyteller link has expired.",
        },
        {
          status: 410,
        },
      );
    }

    if (requestRow.expires_at) {
      const expiresAt =
        Date.parse(
          requestRow.expires_at,
        );

      if (
        Number.isFinite(expiresAt) &&
        expiresAt <= Date.now()
      ) {
        await db
          .prepare(
            `UPDATE storyteller_requests
             SET status = 'expired',
                 updated_at = datetime('now')
             WHERE id = ?
               AND status = 'pending'`,
          )
          .bind(requestRow.id)
          .run();

        return Response.json(
          {
            error:
              "This Storyteller link has expired.",
          },
          {
            status: 410,
          },
        );
      }
    }

    const form =
      await request.formData();

    const file =
      form.get("file");

    if (
      !(file instanceof File) ||
      file.size === 0
    ) {
      return Response.json(
        {
          error:
            "No recording was received.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      file.size >
      MAX_AUDIO_BYTES
    ) {
      return Response.json(
        {
          error:
            "The recording must be smaller than 95 MB.",
        },
        {
          status: 413,
        },
      );
    }

    const id =
      crypto.randomUUID();

    uploadedPath =
      `recordings/${id}.${storageExtension(file)}`;

    const speaker =
      requestRow.recipient_name?.trim() ||
      fallbackSpeaker(
        requestRow.vault_person,
      );

    const title =
      `Q${requestRow.question_number}: ${requestRow.question_text}`.slice(
        0,
        200,
      );

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
          originalName:
            file.name.slice(
              0,
              500,
            ),
          uploadedBy:
            "Storyteller",
          storytellerRequestId:
            requestRow.id,
        },
      },
    );

    await db.batch([
      db
        .prepare(
          `INSERT INTO audio_tracks (
             id,
             title,
             speaker,
             category,
             vault_person,
             question_id,
             storage_path,
             transcription_status
           )
           VALUES (?, ?, ?, 'General', ?, ?, ?, 'queued')`,
        )
        .bind(
          id,
          title,
          speaker.slice(
            0,
            120,
          ),
          requestRow.vault_person,
          requestRow.question_id,
          uploadedPath,
        ),
      db
        .prepare(
          `UPDATE storyteller_requests
           SET status = 'submitted',
               submitted_at = datetime('now'),
               recording_id = ?,
               updated_at = datetime('now')
           WHERE id = ?
             AND status = 'pending'`,
        )
        .bind(
          id,
          requestRow.id,
        ),
    ]);

    return Response.json(
      {
        recording: {
          id,
          title,
          speaker,
          vault_person:
            requestRow.vault_person,
          question_id:
            requestRow.question_id,
          transcription_status:
            "queued",
        },
        submitted: true,
      },
      {
        status: 201,
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
      } catch (
        cleanupError
      ) {
        console.error(
          "Could not remove an incomplete Storyteller upload.",
          cleanupError,
        );
      }
    }

    return vaultAccessResponse(
      error,
    );
  }
}

import {
  getVaultBindings,
  type VaultPerson,
  vaultAccessResponse,
} from "../../../../../lib/cloudflare";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type StorytellerPublicRow = {
  id: string;
  vault_person: VaultPerson;
  recipient_name: string | null;
  status: "pending" | "submitted" | "revoked" | "expired";
  expires_at: string | null;
  question_number: number;
  question_text: string;
};

function bytesToHex(
  buffer: ArrayBuffer,
) {
  return Array.from(
    new Uint8Array(buffer),
  )
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
}

async function hashToken(
  token: string,
) {
  const bytes =
    new TextEncoder().encode(
      token,
    );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      bytes,
    );

  return bytesToHex(
    digest,
  );
}

function vaultDisplayName(
  person: VaultPerson,
) {
  if (person === "Papa") {
    return "Papa";
  }

  if (person === "Dad") {
    return "Dad";
  }

  return "Mom";
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
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
      await hashToken(
        cleanToken,
      );

    const { db } =
      await getVaultBindings();

    const requestRow =
      await db
        .prepare(
          `SELECT
             sr.id,
             sr.vault_person,
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
        .bind(
          tokenHash,
        )
        .first<StorytellerPublicRow>();

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
      requestRow.status ===
      "revoked"
    ) {
      return Response.json(
        {
          error:
            "This Storyteller request has been cancelled.",
          status:
            "revoked",
        },
        {
          status: 410,
        },
      );
    }

    if (
      requestRow.status ===
      "submitted"
    ) {
      return Response.json(
        {
          error:
            "This Storyteller question has already been answered.",
          status:
            "submitted",
        },
        {
          status: 410,
        },
      );
    }

    if (
      requestRow.expires_at
    ) {
      const expiresAt =
        Date.parse(
          requestRow.expires_at,
        );

      if (
        Number.isFinite(
          expiresAt,
        ) &&
        expiresAt <=
          Date.now()
      ) {
        await db
          .prepare(
            `UPDATE storyteller_requests
             SET status = 'expired',
                 updated_at = datetime('now')
             WHERE id = ?
               AND status = 'pending'`,
          )
          .bind(
            requestRow.id,
          )
          .run();

        return Response.json(
          {
            error:
              "This Storyteller link has expired.",
            status:
              "expired",
          },
          {
            status: 410,
          },
        );
      }
    }

    if (
      requestRow.status ===
      "expired"
    ) {
      return Response.json(
        {
          error:
            "This Storyteller link has expired.",
          status:
            "expired",
        },
        {
          status: 410,
        },
      );
    }

    return Response.json({
      request: {
        vaultPerson:
          requestRow.vault_person,
        vaultDisplayName:
          vaultDisplayName(
            requestRow.vault_person,
          ),
        recipientName:
          requestRow.recipient_name,
        questionNumber:
          requestRow.question_number,
        questionText:
          requestRow.question_text,
        status:
          requestRow.status,
        expiresAt:
          requestRow.expires_at,
      },
    });
  } catch (error) {
    return vaultAccessResponse(
      error,
    );
  }
}

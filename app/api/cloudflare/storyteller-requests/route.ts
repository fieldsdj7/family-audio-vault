import {
  getVaultBindings,
  requireVaultMember,
  type VaultPerson,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

type CreateStorytellerRequestBody = {
  vaultPerson?: unknown;
  questionId?: unknown;
  recipientName?: unknown;
  recipientEmail?: unknown;
  recipientPhone?: unknown;
  expiresAt?: unknown;
};

type RevokeStorytellerRequestBody = {
  id?: unknown;
};

type StorytellerRequestRow = {
  id: string;
  vault_person: VaultPerson;
  question_id: string;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  status: "pending" | "submitted" | "revoked" | "expired";
  expires_at: string | null;
  revoked_at: string | null;
  submitted_at: string | null;
  recording_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  question_number: number;
  question_text: string;
};

function cleanText(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function optionalText(value: unknown) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function isVaultPerson(
  value: string,
): value is VaultPerson {
  return (
    value === "Papa" ||
    value === "Dad" ||
    value === "Mom"
  );
}

function bytesToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) =>
      byte.toString(16).padStart(2, "0"),
    )
    .join("");
}

async function hashToken(token: string) {
  const bytes =
    new TextEncoder().encode(token);

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      bytes,
    );

  return bytesToHex(digest);
}

function createSecureToken() {
  const bytes =
    new Uint8Array(32);

  crypto.getRandomValues(bytes);

  let binary = "";

  for (const byte of bytes) {
    binary +=
      String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function requireAdministrator(
  request: Request,
) {
  const member =
    await requireVaultMember(request);

  if (!member.isAdmin) {
    return {
      member: null,
      response: Response.json(
        {
          error:
            "Only a Vault administrator can manage Storyteller requests.",
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
      await requireAdministrator(request);

    if (access.response) {
      return access.response;
    }

    const { db } =
      await getVaultBindings();

    const requests =
      await db
        .prepare(
          `SELECT
             sr.id,
             sr.vault_person,
             sr.question_id,
             sr.recipient_name,
             sr.recipient_email,
             sr.recipient_phone,
             sr.status,
             sr.expires_at,
             sr.revoked_at,
             sr.submitted_at,
             sr.recording_id,
             sr.created_by,
             sr.created_at,
             sr.updated_at,
             q.question_number,
             q.question_text
           FROM storyteller_requests sr
           INNER JOIN questions q
             ON q.id = sr.question_id
           ORDER BY sr.created_at DESC`,
        )
        .all<StorytellerRequestRow>();

    return Response.json({
      requests:
        requests.results,
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

export async function POST(
  request: Request,
) {
  try {
    const access =
      await requireAdministrator(request);

    if (
      access.response ||
      !access.member
    ) {
      return access.response;
    }

    const body =
      (await request.json()) as
        CreateStorytellerRequestBody;

    const vaultPerson =
      cleanText(body.vaultPerson);

    const questionId =
      cleanText(body.questionId);

    const recipientName =
      optionalText(body.recipientName);

    const recipientEmail =
      optionalText(body.recipientEmail);

    const recipientPhone =
      optionalText(body.recipientPhone);

    const expiresAt =
      optionalText(body.expiresAt);

    if (
      !isVaultPerson(vaultPerson)
    ) {
      return Response.json(
        {
          error:
            "Choose Papa, Dad, or Mom for this Storyteller request.",
        },
        {
          status: 400,
        },
      );
    }

    if (!questionId) {
      return Response.json(
        {
          error:
            "Choose a Story Question first.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      recipientName &&
      recipientName.length > 120
    ) {
      return Response.json(
        {
          error:
            "The recipient name is too long.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      recipientEmail &&
      recipientEmail.length > 320
    ) {
      return Response.json(
        {
          error:
            "The recipient email is too long.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      recipientPhone &&
      recipientPhone.length > 50
    ) {
      return Response.json(
        {
          error:
            "The recipient phone number is too long.",
        },
        {
          status: 400,
        },
      );
    }

    if (expiresAt) {
      const parsed =
        Date.parse(expiresAt);

      if (
        !Number.isFinite(parsed)
      ) {
        return Response.json(
          {
            error:
              "The expiration date is invalid.",
          },
          {
            status: 400,
          },
        );
      }
    }

    const { db } =
      await getVaultBindings();

    const question =
      await db
        .prepare(
          `SELECT
             id,
             question_number,
             question_text
           FROM questions
           WHERE id = ?`,
        )
        .bind(questionId)
        .first<{
          id: string;
          question_number: number;
          question_text: string;
        }>();

    if (!question) {
      return Response.json(
        {
          error:
            "The selected Story Question could not be found.",
        },
        {
          status: 404,
        },
      );
    }

    const token =
      createSecureToken();

    const tokenHash =
      await hashToken(token);

    const requestId =
      crypto.randomUUID();

    await db
      .prepare(
        `INSERT INTO storyteller_requests (
           id,
           token_hash,
           vault_person,
           question_id,
           recipient_name,
           recipient_email,
           recipient_phone,
           status,
           expires_at,
           created_by
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .bind(
        requestId,
        tokenHash,
        vaultPerson,
        questionId,
        recipientName,
        recipientEmail,
        recipientPhone,
        expiresAt,
        access.member.email,
      )
      .run();

    const origin =
      new URL(request.url).origin;

    const storytellerUrl =
      `${origin}/storyteller/${token}`;

    return Response.json(
      {
        request: {
          id:
            requestId,
          vaultPerson,
          questionId,
          questionNumber:
            question.question_number,
          questionText:
            question.question_text,
          recipientName,
          recipientEmail,
          recipientPhone,
          status:
            "pending",
          expiresAt,
        },
        storytellerUrl,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

export async function DELETE(
  request: Request,
) {
  try {
    const access =
      await requireAdministrator(request);

    if (
      access.response ||
      !access.member
    ) {
      return access.response;
    }

    const body =
      (await request.json()) as
        RevokeStorytellerRequestBody;

    const id =
      cleanText(body.id);

    if (!id) {
      return Response.json(
        {
          error:
            "The Storyteller request ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    const { db } =
      await getVaultBindings();

    const existing =
      await db
        .prepare(
          `SELECT
             id,
             status
           FROM storyteller_requests
           WHERE id = ?`,
        )
        .bind(id)
        .first<{
          id: string;
          status: string;
        }>();

    if (!existing) {
      return Response.json(
        {
          error:
            "That Storyteller request could not be found.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      existing.status === "submitted"
    ) {
      return Response.json(
        {
          error:
            "A submitted Storyteller request cannot be revoked.",
        },
        {
          status: 409,
        },
      );
    }

    await db
      .prepare(
        `UPDATE storyteller_requests
         SET status = 'revoked',
             revoked_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(id)
      .run();

    return Response.json({
      revoked: true,
      id,
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

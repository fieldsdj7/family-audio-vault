import { getCloudflareContext } from "@opennextjs/cloudflare";

export type VaultPerson = "Papa" | "Dad" | "Mom";

export type VaultMember = {
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  allowedVaults: VaultPerson[];
};

type MemberRow = {
  email: string;
  display_name: string | null;
  is_admin: number;
};

type AccessRow = {
  vault_person: VaultPerson;
};

export class VaultAccessError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "VaultAccessError";
    this.status = status;
  }
}

export async function getVaultBindings() {
  const { env } = await getCloudflareContext({ async: true });

  if (!env.DB || !env.VAULT_FILES) {
    throw new Error("The Cloudflare D1 and R2 bindings are not available.");
  }

  return {
    db: env.DB,
    files: env.VAULT_FILES,
  };
}

export async function requireVaultMember(request: Request): Promise<VaultMember> {
  const email = request.headers
    .get("cf-access-authenticated-user-email")
    ?.trim()
    .toLowerCase();

  if (!email) {
    throw new VaultAccessError("Sign in is required.", 401);
  }

  const { db } = await getVaultBindings();
  const member = await db
    .prepare(
      `SELECT email, display_name, is_admin
       FROM vault_members
       WHERE email = ? COLLATE NOCASE
         AND is_active = 1`
    )
    .bind(email)
    .first<MemberRow>();

  if (!member) {
    throw new VaultAccessError(
      "This email address has not been added to the family vault.",
      403
    );
  }

  const access = member.is_admin
    ? { results: [{ vault_person: "Papa" }, { vault_person: "Dad" }, { vault_person: "Mom" }] }
    : await db
        .prepare(
          `SELECT vault_person
           FROM vault_access
           WHERE member_email = ? COLLATE NOCASE
           ORDER BY CASE vault_person
             WHEN 'Papa' THEN 1
             WHEN 'Dad' THEN 2
             WHEN 'Mom' THEN 3
           END`
        )
        .bind(email)
        .all<AccessRow>();

  return {
    email: member.email,
    displayName: member.display_name,
    isAdmin: member.is_admin === 1,
    allowedVaults: access.results.map((row) => row.vault_person as VaultPerson),
  };
}

export function vaultAccessResponse(error: unknown) {
  if (error instanceof VaultAccessError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error(error);
  return Response.json(
    { error: "The family vault could not be opened." },
    { status: 500 }
  );
}

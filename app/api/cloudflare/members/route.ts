import {
  getVaultBindings,
  requireVaultMember,
  type VaultPerson,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

const VAULT_PEOPLE: VaultPerson[] = ["Papa", "Dad", "Mom"];

type MemberRow = {
  email: string;
  display_name: string | null;
  is_admin: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type AccessRow = {
  member_email: string;
  vault_person: VaultPerson;
};

function normalizedEmail(value: unknown) {
  if (typeof value !== "string") return "";

  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
    ? email
    : "";
}

function normalizedDisplayName(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;

  const name = value.trim();
  if (!name) return null;
  return name.length <= 100 ? name : undefined;
}

function isVaultPerson(value: unknown): value is VaultPerson {
  return VAULT_PEOPLE.includes(value as VaultPerson);
}

function normalizedVaults(value: unknown) {
  if (!Array.isArray(value) || !value.every(isVaultPerson)) return null;
  return VAULT_PEOPLE.filter((person) => value.includes(person));
}

async function requireAdministrator(request: Request) {
  const member = await requireVaultMember(request);

  if (!member.isAdmin) {
    return {
      member: null,
      response: Response.json(
        { error: "Only a Vault administrator can manage family access." },
        { status: 403 },
      ),
    };
  }

  return { member, response: null };
}

async function readMembers() {
  const { db } = await getVaultBindings();
  const [members, access] = await Promise.all([
    db
      .prepare(
        `SELECT email, display_name, is_admin, is_active, created_at, updated_at
         FROM vault_members
         ORDER BY is_active DESC, is_admin DESC, display_name, email`,
      )
      .all<MemberRow>(),
    db
      .prepare(
        `SELECT member_email, vault_person
         FROM vault_access
         ORDER BY CASE vault_person
           WHEN 'Papa' THEN 1
           WHEN 'Dad' THEN 2
           WHEN 'Mom' THEN 3
         END`,
      )
      .all<AccessRow>(),
  ]);

  const accessByEmail = new Map<string, VaultPerson[]>();
  for (const row of access.results) {
    const email = row.member_email.toLowerCase();
    accessByEmail.set(email, [
      ...(accessByEmail.get(email) ?? []),
      row.vault_person,
    ]);
  }

  return members.results.map((member) => ({
    email: member.email,
    displayName: member.display_name,
    isAdmin: member.is_admin === 1,
    isActive: member.is_active === 1,
    allowedVaults:
      member.is_admin === 1
        ? VAULT_PEOPLE
        : (accessByEmail.get(member.email.toLowerCase()) ?? []),
    createdAt: member.created_at,
    updatedAt: member.updated_at,
  }));
}

export async function GET(request: Request) {
  try {
    const access = await requireAdministrator(request);
    if (access.response) return access.response;

    return Response.json({ members: await readMembers() });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAdministrator(request);
    if (access.response || !access.member) return access.response;

    const body = (await request.json()) as {
      email?: unknown;
      displayName?: unknown;
      isAdmin?: unknown;
      isActive?: unknown;
      allowedVaults?: unknown;
    };
    const email = normalizedEmail(body.email);
    const displayName = normalizedDisplayName(body.displayName);
    const isAdmin = body.isAdmin;
    const isActive = body.isActive;
    const requestedVaults = normalizedVaults(body.allowedVaults);

    if (!email) {
      return Response.json(
        { error: "Enter a valid email address." },
        { status: 400 },
      );
    }

    if (displayName === undefined) {
      return Response.json(
        { error: "The display name must be 100 characters or fewer." },
        { status: 400 },
      );
    }

    if (typeof isAdmin !== "boolean" || typeof isActive !== "boolean") {
      return Response.json(
        { error: "Choose whether this member is active and an administrator." },
        { status: 400 },
      );
    }

    if (!requestedVaults) {
      return Response.json(
        { error: "Choose only Papa, Dad, or Mom Vault access." },
        { status: 400 },
      );
    }

    const allowedVaults = isAdmin ? VAULT_PEOPLE : requestedVaults;
    if (isActive && !isAdmin && allowedVaults.length === 0) {
      return Response.json(
        { error: "An active family member needs access to at least one Vault." },
        { status: 400 },
      );
    }

    const { db } = await getVaultBindings();
    const current = await db
      .prepare(
        `SELECT is_admin, is_active
         FROM vault_members
         WHERE email = ? COLLATE NOCASE`,
      )
      .bind(email)
      .first<{ is_admin: number; is_active: number }>();

    if (
      current?.is_admin === 1 &&
      current.is_active === 1 &&
      (!isAdmin || !isActive)
    ) {
      const otherAdministrators = await db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM vault_members
           WHERE is_admin = 1
             AND is_active = 1
             AND email <> ? COLLATE NOCASE`,
        )
        .bind(email)
        .first<{ count: number }>();

      if (!otherAdministrators || otherAdministrators.count < 1) {
        return Response.json(
          { error: "Add another active administrator before changing the last one." },
          { status: 409 },
        );
      }
    }

    if (
      email === access.member.email.toLowerCase() &&
      (!isAdmin || !isActive)
    ) {
      return Response.json(
        { error: "You cannot remove your own administrator access while signed in." },
        { status: 409 },
      );
    }

    const statements = [
      db
        .prepare(
          `INSERT INTO vault_members (
             email,
             display_name,
             is_admin,
             is_active,
             updated_at
           ) VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(email) DO UPDATE SET
             display_name = excluded.display_name,
             is_admin = excluded.is_admin,
             is_active = excluded.is_active,
             updated_at = datetime('now')`,
        )
        .bind(email, displayName, isAdmin ? 1 : 0, isActive ? 1 : 0),
      db
        .prepare("DELETE FROM vault_access WHERE member_email = ? COLLATE NOCASE")
        .bind(email),
      ...allowedVaults.map((person) =>
        db
          .prepare(
            `INSERT INTO vault_access (member_email, vault_person)
             VALUES (?, ?)`,
          )
          .bind(email, person),
      ),
    ];

    await db.batch(statements);

    const members = await readMembers();
    const member = members.find(
      (item) => item.email.toLowerCase() === email,
    );

    return Response.json(
      { member },
      { status: current ? 200 : 201 },
    );
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

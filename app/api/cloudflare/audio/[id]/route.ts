import {
  getVaultBindings,
  requireVaultMember,
  type VaultPerson,
  vaultAccessResponse,
} from "../../../../../lib/cloudflare";

type AudioRow = {
  storage_path: string | null;
  vault_person: VaultPerson;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

const R2_BUCKET_NAME = "family-audio-vault-files";
const R2_ACCOUNT_ID = "df9e74cde1afebdc705f24c403b336f4";
const SIGNED_URL_SECONDS = 15 * 60;

function encodeR2Path(value: string) {
  return value
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

async function hmac(
  key: ArrayBuffer,
  value: string,
) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(value),
  );
}

function amzDate(date: Date) {
  return date
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "");
}

async function createPresignedGetUrl(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
  storagePath: string,
) {
  const now = new Date();
  const requestDate = amzDate(now);
  const shortDate = requestDate.slice(0, 8);
  const region = "auto";
  const service = "s3";

  const host =
    `${R2_BUCKET_NAME}.${accountId}.r2.cloudflarestorage.com`;

  const canonicalUri =
    `/${encodeR2Path(storagePath)}`;

  const credentialScope =
    `${shortDate}/${region}/${service}/aws4_request`;

  const params: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    [
      "X-Amz-Credential",
      `${accessKeyId}/${credentialScope}`,
    ],
    ["X-Amz-Date", requestDate],
    ["X-Amz-Expires", String(SIGNED_URL_SECONDS)],
    ["X-Amz-SignedHeaders", "host"],
  ];

  const canonicalQuery = params
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    requestDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n");

  const encoder = new TextEncoder();

  const secretBytes =
    encoder.encode(
      `AWS4${secretAccessKey}`,
    );

  const dateKey = await hmac(
    secretBytes.buffer.slice(
      secretBytes.byteOffset,
      secretBytes.byteOffset +
        secretBytes.byteLength,
    ) as ArrayBuffer,
    shortDate,
  );

  const regionKey = await hmac(dateKey, region);
  const serviceKey = await hmac(regionKey, service);
  const signingKey = await hmac(
    serviceKey,
    "aws4_request",
  );

  const signature = toHex(
    await hmac(signingKey, stringToSign),
  );

  const finalQuery = [
    ...params,
    ["X-Amz-Signature", signature] as [string, string],
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  return `https://${host}${canonicalUri}?${finalQuery}`;
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  try {
    const member = await requireVaultMember(request);
    const { id } = await context.params;

    if (!id.trim()) {
      return Response.json(
        { error: "A recording ID is required." },
        { status: 400 },
      );
    }

    const { db } = await getVaultBindings();

    const audio = await db
      .prepare(
        `SELECT storage_path, vault_person
         FROM audio_tracks
         WHERE id = ?
           AND trashed_at IS NULL`,
      )
      .bind(id)
      .first<AudioRow>();

    if (!audio) {
      return Response.json(
        { error: "That recording was not found." },
        { status: 404 },
      );
    }

    if (
      !member.allowedVaults.includes(
        audio.vault_person,
      )
    ) {
      return Response.json(
        {
          error:
            "You do not have access to that recording.",
        },
        { status: 403 },
      );
    }

    if (!audio.storage_path) {
      return Response.json(
        {
          error:
            "The audio file has not been copied to Cloudflare yet.",
        },
        { status: 404 },
      );
    }

    const accessKeyId =
      process.env.R2_ACCESS_KEY_ID?.trim();

    const secretAccessKey =
      process.env.R2_SECRET_ACCESS_KEY?.trim();

    if (
      !accessKeyId ||
      !secretAccessKey
    ) {
      return Response.json(
        {
          error:
            "Direct private audio access has not been fully configured.",
        },
        { status: 500 },
      );
    }

    const signedUrl =
      await createPresignedGetUrl(
        R2_ACCOUNT_ID,
        accessKeyId,
        secretAccessKey,
        audio.storage_path,
      );

    return Response.redirect(
      signedUrl,
      302,
    );
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

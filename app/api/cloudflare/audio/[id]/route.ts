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

function fallbackContentType(storagePath: string) {
  const extension = storagePath.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "m4a":
      return "audio/mp4";
    case "mp3":
      return "audio/mpeg";
    case "ogg":
    case "oga":
      return "audio/ogg";
    case "wav":
      return "audio/wav";
    case "webm":
      return "audio/webm";
    default:
      return "application/octet-stream";
  }
}

function rangeHeaders(object: R2ObjectBody, headers: Headers) {
  if (!object.range) {
    headers.set("content-length", object.size.toString());
    return 200;
  }

  let start: number;
  let length: number;

  if ("suffix" in object.range) {
    length = Math.min(object.range.suffix, object.size);
    start = object.size - length;
  } else {
    start = object.range.offset ?? 0;
    length = object.range.length ?? object.size - start;
  }

  const end = start + length - 1;
  headers.set("content-length", length.toString());
  headers.set("content-range", `bytes ${start}-${end}/${object.size}`);
  return 206;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const member = await requireVaultMember(request);
    const { id } = await context.params;

    if (!id.trim()) {
      return Response.json(
        { error: "A recording ID is required." },
        { status: 400 },
      );
    }

    const { db, files } = await getVaultBindings();
    const audio = await db
      .prepare(
        `SELECT storage_path, vault_person
         FROM audio_tracks
         WHERE id = ?
           AND trashed_at IS NULL
           AND is_split_master = 0`,
      )
      .bind(id)
      .first<AudioRow>();

    if (!audio) {
      return Response.json(
        { error: "That recording was not found." },
        { status: 404 },
      );
    }

    if (!member.allowedVaults.includes(audio.vault_person)) {
      return Response.json(
        { error: "You do not have access to that recording." },
        { status: 403 },
      );
    }

    if (!audio.storage_path) {
      return Response.json(
        { error: "The audio file has not been copied to Cloudflare yet." },
        { status: 404 },
      );
    }

    const object = await files.get(audio.storage_path, {
      range: request.headers,
    });

    if (!object) {
      return Response.json(
        { error: "The audio file could not be found in storage." },
        { status: 404 },
      );
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("accept-ranges", "bytes");
    headers.set("cache-control", "private, no-store");
    headers.set("content-type", headers.get("content-type") ?? fallbackContentType(audio.storage_path));
    headers.set("etag", object.httpEtag);

    const status = rangeHeaders(object, headers);
    return new Response(object.body, { status, headers });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

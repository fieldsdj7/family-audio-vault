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

function contentTypeForPath(
  storagePath: string,
  storedType: string | null,
) {
  const extension =
    storagePath
      .split(".")
      .pop()
      ?.toLowerCase();

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
      return (
        storedType ||
        "application/octet-stream"
      );
  }
}

function applyRangeHeaders(
  object: R2ObjectBody,
  headers: Headers,
  requestedRange: boolean,
) {
  if (
    !requestedRange ||
    !object.range
  ) {
    headers.set(
      "content-length",
      object.size.toString(),
    );

    return 200;
  }

  const range =
    object.range as {
      offset?: number;
      length?: number;
      suffix?: number;
    };

  let start = 0;
  let length =
    object.size;

  if (
    typeof range.suffix ===
    "number"
  ) {
    length =
      Math.min(
        range.suffix,
        object.size,
      );

    start =
      object.size -
      length;
  } else {
    start =
      typeof range.offset ===
      "number"
        ? range.offset
        : 0;

    length =
      typeof range.length ===
      "number"
        ? range.length
        : object.size -
          start;
  }

  const end =
    Math.min(
      start +
        length -
        1,
      object.size -
        1,
    );

  const actualLength =
    end -
    start +
    1;

  headers.set(
    "content-length",
    actualLength.toString(),
  );

  headers.set(
    "content-range",
    `bytes ${start}-${end}/${object.size}`,
  );

  return 206;
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  try {
    const member =
      await requireVaultMember(
        request,
      );

    const { id } =
      await context.params;

    if (!id.trim()) {
      return Response.json(
        {
          error:
            "A recording ID is required.",
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

    const audio =
      await db
        .prepare(
          `SELECT
             storage_path,
             vault_person
           FROM audio_tracks
           WHERE id = ?
             AND trashed_at IS NULL`,
        )
        .bind(id)
        .first<AudioRow>();

    if (!audio) {
      return Response.json(
        {
          error:
            "That recording was not found.",
        },
        {
          status: 404,
        },
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
        {
          status: 403,
        },
      );
    }

    if (
      !audio.storage_path
    ) {
      return Response.json(
        {
          error:
            "The audio file has not been copied to Cloudflare yet.",
        },
        {
          status: 404,
        },
      );
    }

    const rangeHeader =
      request.headers.get(
        "range",
      );

    const object =
      await files.get(
        audio.storage_path,
        rangeHeader
          ? {
              range:
                request.headers,
            }
          : undefined,
      );

    if (
      !object ||
      !("body" in object)
    ) {
      return Response.json(
        {
          error:
            "The audio file could not be found in storage.",
        },
        {
          status: 404,
        },
      );
    }

    const headers =
      new Headers();

    object.writeHttpMetadata(
      headers,
    );

    headers.set(
      "accept-ranges",
      "bytes",
    );

    headers.set(
      "cache-control",
      "private, no-store",
    );

    headers.set(
      "content-type",
      contentTypeForPath(
        audio.storage_path,
        headers.get(
          "content-type",
        ),
      ),
    );

    headers.set(
      "etag",
      object.httpEtag,
    );

    const status =
      applyRangeHeaders(
        object,
        headers,
        Boolean(
          rangeHeader,
        ),
      );

    return new Response(
      object.body,
      {
        status,
        headers,
      },
    );
  } catch (error) {
    return vaultAccessResponse(
      error,
    );
  }
}

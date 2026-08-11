import {
  getVaultBindings,
  requireVaultMember,
  vaultAccessResponse,
} from "../../../../../lib/cloudflare";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
) {
  try {
    const member =
      await requireVaultMember(request);

    if (!member.isAdmin) {
      return Response.json(
        {
          error:
            "Only a Vault administrator can view story photos here.",
        },
        { status: 403 },
      );
    }

    const { id } =
      await context.params;

    if (!id.trim()) {
      return Response.json(
        {
          error:
            "A photo ID is required.",
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
      .bind(id)
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

    const object =
      await files.get(
        photo.storage_path,
      );

    if (!object) {
      return Response.json(
        {
          error:
            "The photo file is missing from storage.",
        },
        { status: 404 },
      );
    }

    const headers =
      new Headers();

    object.writeHttpMetadata(
      headers,
    );

    headers.set(
      "Cache-Control",
      "private, max-age=300",
    );

    headers.set(
      "Content-Disposition",
      "inline",
    );

    return new Response(
      object.body,
      {
        status: 200,
        headers,
      },
    );
  } catch (error) {
    return vaultAccessResponse(
      error,
    );
  }
}

import {
  getVaultBindings,
  requireVaultMember,
  type VaultPerson,
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
           photos.id,
           photos.storage_path,
           tracks.vault_person
         FROM story_photos AS photos
         INNER JOIN audio_tracks AS tracks ON tracks.id = photos.audio_track_id
         WHERE photos.id = ?
           AND tracks.trashed_at IS NULL
           AND tracks.is_split_master = 0`,
      )
      .bind(id)
      .first<{
        id: string;
        storage_path: string;
        vault_person: VaultPerson;
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

    if (!member.allowedVaults.includes(photo.vault_person)) {
      return Response.json(
        { error: "You do not have access to that recording." },
        { status: 403 },
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
      "private, no-store",
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

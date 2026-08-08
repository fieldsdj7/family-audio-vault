import {
  getVaultBindings,
  requireVaultMember,
  type VaultPerson,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

const MAX_AUDIO_BYTES = 95 * 1024 * 1024;

function textField(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isVaultPerson(value: string): value is VaultPerson {
  return value === "Papa" || value === "Dad" || value === "Mom";
}

function storageExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension && /^[a-z0-9]{1,10}$/.test(extension) ? extension : "audio";
}

export async function POST(request: Request) {
  let uploadedPath: string | null = null;

  try {
    const member = await requireVaultMember(request);

    if (!member.isAdmin) {
      return Response.json(
        { error: "Only a Vault administrator can upload recordings." },
        { status: 403 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    const title = textField(form, "title");
    const speaker = textField(form, "speaker");
    const category = textField(form, "category") || "General";
    const vaultPerson = textField(form, "vaultPerson");
    const storyChapter = textField(form, "storyChapter") || null;
    const questionId = textField(form, "questionId") || null;

    if (!(file instanceof File) || file.size === 0) {
      return Response.json(
        { error: "Choose an audio file to upload." },
        { status: 400 },
      );
    }

    if (!title || !speaker) {
      return Response.json(
        { error: "A title and speaker are required." },
        { status: 400 },
      );
    }

    if (!isVaultPerson(vaultPerson)) {
      return Response.json(
        { error: "Choose Papa, Dad, or Mom for the recording." },
        { status: 400 },
      );
    }

    if (file.size > MAX_AUDIO_BYTES) {
      return Response.json(
        { error: "The audio file must be smaller than 95 MB." },
        { status: 413 },
      );
    }

    if (title.length > 200 || speaker.length > 120 || category.length > 120) {
      return Response.json(
        { error: "One of the recording details is too long." },
        { status: 400 },
      );
    }

    const { db, files } = await getVaultBindings();

    if (questionId) {
      const question = await db
        .prepare("SELECT id FROM questions WHERE id = ?")
        .bind(questionId)
        .first<{ id: string }>();

      if (!question) {
        return Response.json(
          { error: "The selected question could not be found." },
          { status: 400 },
        );
      }
    }

    const id = crypto.randomUUID();
    uploadedPath = `recordings/${id}.${storageExtension(file)}`;

    await files.put(uploadedPath, file.stream(), {
      httpMetadata: {
        contentType: file.type || "application/octet-stream",
      },
      customMetadata: {
        originalName: file.name.slice(0, 500),
        uploadedBy: member.email,
      },
    });

    await db
      .prepare(
        `INSERT INTO audio_tracks (
           id,
           title,
           speaker,
           category,
           vault_person,
           question_id,
           storage_path,
           story_chapter,
           transcription_status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued')`,
      )
      .bind(
        id,
        title,
        speaker,
        category,
        vaultPerson,
        questionId,
        uploadedPath,
        storyChapter,
      )
      .run();

    return Response.json(
      {
        recording: {
          id,
          title,
          speaker,
          category,
          vault_person: vaultPerson,
          question_id: questionId,
          story_chapter: storyChapter,
          transcription_status: "queued",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedPath) {
      try {
        const { files } = await getVaultBindings();
        await files.delete(uploadedPath);
      } catch (cleanupError) {
        console.error("Could not remove an incomplete R2 upload.", cleanupError);
      }
    }

    return vaultAccessResponse(error);
  }
}

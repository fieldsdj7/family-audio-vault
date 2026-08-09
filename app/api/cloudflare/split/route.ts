import {
  getVaultBindings,
  requireVaultMember,
  type VaultPerson,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

const MAX_CLIP_BYTES = 95 * 1024 * 1024;

type SourceRecordingRow = {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: VaultPerson;
  storage_path: string | null;
  transcript: string | null;
  created_at: string;
};

function textField(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(form: FormData, name: string) {
  const value = textField(form, name);
  return value || null;
}

function numberField(form: FormData, name: string) {
  const value = Number(textField(form, name));
  return Number.isFinite(value) ? value : Number.NaN;
}

function formatTime(seconds: number) {
  const wholeSeconds = Math.floor(seconds);

  return `${Math.floor(wholeSeconds / 60)}:${String(
    wholeSeconds % 60,
  ).padStart(2, "0")}`;
}

async function requireAdministrator(request: Request) {
  const member = await requireVaultMember(request);

  if (!member.isAdmin) {
    return {
      member: null,
      response: Response.json(
        { error: "Only a Vault administrator can split recordings." },
        { status: 403 },
      ),
    };
  }

  return { member, response: null };
}

export async function GET(request: Request) {
  try {
    const access = await requireAdministrator(request);
    if (access.response) return access.response;

    const { db } = await getVaultBindings();

    const recordings = await db
      .prepare(
        `SELECT
           id,
           title,
           speaker,
           category,
           vault_person,
           storage_path,
           transcript,
           created_at
         FROM audio_tracks
         WHERE trashed_at IS NULL
           AND source_track_id IS NULL
         ORDER BY created_at DESC`,
      )
      .all<SourceRecordingRow>();

    return Response.json({
      recordings: recordings.results,
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

export async function POST(request: Request) {
  let uploadedPath: string | null = null;

  try {
    const access = await requireAdministrator(request);

    if (access.response || !access.member) {
      return access.response;
    }

    const form = await request.formData();

    const clip = form.get("clip");
    const sourceRecordingId = textField(form, "sourceRecordingId");
    const startSeconds = numberField(form, "startSeconds");
    const endSeconds = numberField(form, "endSeconds");
    const title = optionalText(form, "title");
    const transcript = optionalText(form, "transcript");
    const notes = optionalText(form, "notes");
    const questionId = optionalText(form, "questionId");

    if (!sourceRecordingId) {
      return Response.json(
        { error: "Choose the original recording first." },
        { status: 400 },
      );
    }

    if (
      !(clip instanceof File) ||
      clip.size === 0
    ) {
      return Response.json(
        { error: "The clipped audio file is required." },
        { status: 400 },
      );
    }

    if (clip.size > MAX_CLIP_BYTES) {
      return Response.json(
        { error: "The clipped audio file must be smaller than 95 MB." },
        { status: 413 },
      );
    }

    if (
      !Number.isInteger(startSeconds) ||
      startSeconds < 0 ||
      !Number.isInteger(endSeconds) ||
      endSeconds <= startSeconds
    ) {
      return Response.json(
        {
          error:
            "Enter a valid start and end time. The end must be after the start.",
        },
        { status: 400 },
      );
    }

    if ((title?.length ?? 0) > 200 || (notes?.length ?? 0) > 2000) {
      return Response.json(
        { error: "The title or split notes are too long." },
        { status: 400 },
      );
    }

    const { db, files } = await getVaultBindings();

    const source = await db
      .prepare(
        `SELECT
           id,
           title,
           speaker,
           category,
           vault_person,
           storage_path,
           transcript,
           created_at
         FROM audio_tracks
         WHERE id = ?
           AND trashed_at IS NULL
           AND source_track_id IS NULL`,
      )
      .bind(sourceRecordingId)
      .first<SourceRecordingRow>();

    if (!source) {
      return Response.json(
        { error: "The original recording could not be found." },
        { status: 404 },
      );
    }

    if (!source.storage_path) {
      return Response.json(
        {
          error:
            "The original audio file has not been copied to Cloudflare yet.",
        },
        { status: 409 },
      );
    }

    if (questionId) {
      const question = await db
        .prepare(
          `SELECT id
           FROM questions
           WHERE id = ?`,
        )
        .bind(questionId)
        .first<{ id: string }>();

      if (!question) {
        return Response.json(
          { error: "The selected question could not be found." },
          { status: 400 },
        );
      }
    }

    const recordingId = crypto.randomUUID();

    const recordingTitle =
      title ||
      `${source.title} (${formatTime(startSeconds)}–${formatTime(
        endSeconds,
      )})`;

    uploadedPath = `recordings/${recordingId}.wav`;

    await files.put(
      uploadedPath,
      clip.stream(),
      {
        httpMetadata: {
          contentType: "audio/wav",
        },
        customMetadata: {
          sourceRecordingId: source.id,
          uploadedBy: access.member.email,
          clipStartSeconds: String(startSeconds),
          clipEndSeconds: String(endSeconds),
        },
      },
    );

    await db.batch([
      db
        .prepare(
          `INSERT INTO audio_tracks (
             id,
             title,
             speaker,
             category,
             vault_person,
             question_id,
             storage_path,
             transcript,
             transcription_status,
             source_track_id,
             clip_start_seconds,
             clip_end_seconds,
             split_notes
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          recordingId,
          recordingTitle,
          source.speaker,
          source.category || "General",
          source.vault_person,
          questionId,
          uploadedPath,
          transcript,
          transcript ? "complete" : "not_started",
          source.id,
          startSeconds,
          endSeconds,
          notes,
        ),

      db
        .prepare(
          `UPDATE audio_tracks
           SET is_split_master = 1,
               updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(source.id),
    ]);

    return Response.json(
      {
        recording: {
          id: recordingId,
          title: recordingTitle,
          speaker: source.speaker,
          category: source.category || "General",
          vault_person: source.vault_person,
          question_id: questionId,
          storage_path: uploadedPath,
          source_track_id: source.id,
          clip_start_seconds: startSeconds,
          clip_end_seconds: endSeconds,
          transcript,
          split_notes: notes,
          transcription_status: transcript
            ? "complete"
            : "not_started",
        },
        originalPreserved: true,
        physicalAudioClip: true,
      },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedPath) {
      try {
        const { files } = await getVaultBindings();
        await files.delete(uploadedPath);
      } catch (cleanupError) {
        console.error(
          "Could not remove an incomplete split audio file.",
          cleanupError,
        );
      }
    }

    return vaultAccessResponse(error);
  }
}

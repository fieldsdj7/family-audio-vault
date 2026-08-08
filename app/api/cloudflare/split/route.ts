import {
  getVaultBindings,
  requireVaultMember,
  type VaultPerson,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

type SourceRecordingRow = {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: VaultPerson;
  storage_path: string | null;
  transcript: string | null;
  is_split_master: number;
  created_at: string;
};

function optionalText(value: unknown) {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value.trim() || null : undefined;
}

function formatTime(seconds: number) {
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
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
           is_split_master,
           created_at
         FROM audio_tracks
         WHERE trashed_at IS NULL
           AND source_track_id IS NULL
         ORDER BY created_at DESC`,
      )
      .all<SourceRecordingRow>();

    return Response.json({ recordings: recordings.results });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAdministrator(request);
    if (access.response) return access.response;

    const body = (await request.json()) as {
      sourceRecordingId?: unknown;
      startSeconds?: unknown;
      endSeconds?: unknown;
      title?: unknown;
      transcript?: unknown;
      notes?: unknown;
      questionId?: unknown;
    };
    const sourceRecordingId =
      typeof body.sourceRecordingId === "string"
        ? body.sourceRecordingId.trim()
        : "";
    const startSeconds =
      typeof body.startSeconds === "number" ? body.startSeconds : Number.NaN;
    const endSeconds =
      typeof body.endSeconds === "number" ? body.endSeconds : Number.NaN;
    const title = optionalText(body.title);
    const transcript = optionalText(body.transcript);
    const notes = optionalText(body.notes);
    const questionId = optionalText(body.questionId);

    if (!sourceRecordingId) {
      return Response.json(
        { error: "Choose the original recording first." },
        { status: 400 },
      );
    }

    if (
      !Number.isInteger(startSeconds) ||
      startSeconds < 0 ||
      !Number.isInteger(endSeconds) ||
      endSeconds <= startSeconds
    ) {
      return Response.json(
        { error: "Enter a valid start and end time. The end must be after the start." },
        { status: 400 },
      );
    }

    if (title === undefined || transcript === undefined || notes === undefined || questionId === undefined) {
      return Response.json(
        { error: "Split recording details must be text." },
        { status: 400 },
      );
    }

    if ((title?.length ?? 0) > 200 || (notes?.length ?? 0) > 2000) {
      return Response.json(
        { error: "The title or split notes are too long." },
        { status: 400 },
      );
    }

    const { db } = await getVaultBindings();
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
           is_split_master,
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
        { error: "The original audio file has not been copied to Cloudflare yet." },
        { status: 409 },
      );
    }

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

    const recordingId = crypto.randomUUID();
    const recordingTitle =
      title ||
      `${source.title} (${formatTime(startSeconds)}â€“${formatTime(endSeconds)})`;

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
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          recordingId,
          recordingTitle,
          source.speaker,
          source.category || "General",
          source.vault_person,
          questionId,
          source.storage_path,
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
          source_track_id: source.id,
          clip_start_seconds: startSeconds,
          clip_end_seconds: endSeconds,
          transcript,
          split_notes: notes,
          transcription_status: transcript ? "complete" : "not_started",
        },
        originalPreserved: true,
      },
      { status: 201 },
    );
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

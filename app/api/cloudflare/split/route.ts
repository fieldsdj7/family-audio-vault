import {
  getVaultBindings,
  requireVaultMember,
  type VaultPerson,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

const MAX_CLIP_BYTES = 24 * 1024 * 1024;

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

type SplitUpdateBody = {
  recordingId?: unknown;
  title?: unknown;
  transcript?: unknown;
  notes?: unknown;
  questionId?: unknown;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function formatTime(seconds: number) {
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function validRecordingId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
        `SELECT id, title, speaker, category, vault_person, storage_path,
                transcript, created_at
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

export async function PUT(request: Request) {
  let uploadedPath: string | null = null;

  try {
    const access = await requireAdministrator(request);
    if (access.response || !access.member) return access.response;

    const url = new URL(request.url);
    const sourceRecordingId = cleanText(url.searchParams.get("sourceRecordingId"));
    const recordingId = cleanText(url.searchParams.get("recordingId"));
    const startSeconds = finiteNumber(url.searchParams.get("startSeconds"));
    const endSeconds = finiteNumber(url.searchParams.get("endSeconds"));

    if (!sourceRecordingId || !recordingId || !validRecordingId(recordingId)) {
      return Response.json(
        { error: "The split upload information is incomplete." },
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

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("audio/wav")) {
      return Response.json(
        { error: "The split upload must be a WAV audio file." },
        { status: 415 },
      );
    }

    const clipBuffer = await request.arrayBuffer();

    if (clipBuffer.byteLength === 0) {
      return Response.json({ error: "The split audio file is missing." }, { status: 400 });
    }

    if (clipBuffer.byteLength > MAX_CLIP_BYTES) {
      return Response.json(
        { error: "This audio section is too large to save safely in one split. Choose a shorter section." },
        { status: 413 },
      );
    }

    const { db, files } = await getVaultBindings();

    const source = await db
      .prepare(
        `SELECT id, title, speaker, category, vault_person, storage_path,
                transcript, created_at
         FROM audio_tracks
         WHERE id = ?
           AND trashed_at IS NULL
           AND source_track_id IS NULL`,
      )
      .bind(sourceRecordingId)
      .first<SourceRecordingRow>();

    if (!source) {
      return Response.json({ error: "The original recording could not be found." }, { status: 404 });
    }

    if (!source.storage_path) {
      return Response.json(
        { error: "The original audio file has not been copied to Cloudflare yet." },
        { status: 409 },
      );
    }

    const existingTrack = await db
      .prepare(`SELECT id FROM audio_tracks WHERE id = ?`)
      .bind(recordingId)
      .first<{ id: string }>();

    if (existingTrack) {
      return Response.json({ error: "That split recording already exists." }, { status: 409 });
    }

    uploadedPath = `recordings/${recordingId}.wav`;

    await files.put(uploadedPath, clipBuffer, {
      httpMetadata: { contentType: "audio/wav" },
      customMetadata: {
        sourceRecordingId: source.id,
        uploadedBy: access.member.email,
        clipStartSeconds: String(startSeconds),
        clipEndSeconds: String(endSeconds),
      },
    });

    const recordingTitle =
      `${source.title} (${formatTime(startSeconds)}–${formatTime(endSeconds)})`;

    await db.batch([
      db
        .prepare(
          `INSERT INTO audio_tracks (
             id, title, speaker, category, vault_person, storage_path,
             transcription_status, source_track_id, clip_start_seconds,
             clip_end_seconds
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          recordingId,
          recordingTitle,
          source.speaker,
          source.category || "General",
          source.vault_person,
          uploadedPath,
          "not_started",
          source.id,
          startSeconds,
          endSeconds,
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

    const sourceSegments =
      await db
        .prepare(
          `SELECT
             segment_index,
             start_seconds,
             end_seconds,
             speaker_label,
             text
           FROM transcript_segments
           WHERE audio_track_id = ?
             AND end_seconds > ?
             AND start_seconds < ?
           ORDER BY segment_index`,
        )
        .bind(
          source.id,
          startSeconds,
          endSeconds,
        )
        .all<{
          segment_index: number;
          start_seconds: number;
          end_seconds: number;
          speaker_label: string | null;
          text: string;
        }>();

    if (
      sourceSegments.results.length >
      0
    ) {
      const segmentStatements =
        sourceSegments.results.map(
          (
            segment,
            index,
          ) => {
            const shiftedStart =
              Math.max(
                0,
                segment.start_seconds -
                  startSeconds,
              );

            const shiftedEnd =
              Math.max(
                shiftedStart,
                Math.min(
                  endSeconds,
                  segment.end_seconds,
                ) -
                  startSeconds,
              );

            return db
              .prepare(
                `INSERT INTO transcript_segments (
                   id,
                   audio_track_id,
                   segment_index,
                   start_seconds,
                   end_seconds,
                   speaker_label,
                   text
                 )
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                crypto.randomUUID(),
                recordingId,
                index,
                shiftedStart,
                shiftedEnd,
                segment.speaker_label,
                segment.text,
              );
          },
        );

      await db.batch(
        segmentStatements,
      );
    }

    uploadedPath = null;

    return Response.json(
      {
        recording: { id: recordingId, title: recordingTitle },
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
        console.error("Could not remove an incomplete split audio file.", cleanupError);
      }
    }

    return vaultAccessResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAdministrator(request);
    if (access.response || !access.member) return access.response;

    const body = (await request.json()) as SplitUpdateBody;

    const recordingId = cleanText(body.recordingId);
    const title = optionalText(body.title);
    const transcript = optionalText(body.transcript);
    const notes = optionalText(body.notes);
    const questionId = optionalText(body.questionId);

    if (!recordingId || !validRecordingId(recordingId)) {
      return Response.json(
        { error: "The split recording ID is missing or invalid." },
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

    const existing = await db
      .prepare(
        `SELECT id, title
         FROM audio_tracks
         WHERE id = ?
           AND source_track_id IS NOT NULL
           AND trashed_at IS NULL`,
      )
      .bind(recordingId)
      .first<{ id: string; title: string }>();

    if (!existing) {
      return Response.json(
        { error: "The saved split recording could not be found." },
        { status: 404 },
      );
    }

    if (questionId) {
      const question = await db
        .prepare(`SELECT id FROM questions WHERE id = ?`)
        .bind(questionId)
        .first<{ id: string }>();

      if (!question) {
        return Response.json(
          { error: "The selected question could not be found." },
          { status: 400 },
        );
      }
    }

    const finalTitle = title || existing.title;

    await db
      .prepare(
        `UPDATE audio_tracks
         SET title = ?,
             question_id = ?,
             transcript = ?,
             transcription_status = ?,
             split_notes = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        finalTitle,
        questionId,
        transcript,
        transcript ? "complete" : "not_started",
        notes,
        recordingId,
      )
      .run();

    return Response.json({
      recording: { id: recordingId, title: finalTitle },
      transcriptSaved: !!transcript,
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

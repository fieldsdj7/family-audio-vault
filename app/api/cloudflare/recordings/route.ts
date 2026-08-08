import {
  getVaultBindings,
  requireVaultMember,
  type VaultPerson,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

type RecordingRow = {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: VaultPerson;
  question_id: string | null;
  question_number: number | null;
  question_text: string | null;
  transcript: string | null;
  transcription_status: string;
  story_title: string | null;
  story_chapter: string | null;
  story_status: string;
  source_track_id: string | null;
  clip_start_seconds: number | null;
  clip_end_seconds: number | null;
  created_at: string;
  updated_at: string;
};

function isVaultPerson(value: string | null): value is VaultPerson {
  return value === "Papa" || value === "Dad" || value === "Mom";
}

export async function GET(request: Request) {
  try {
    const member = await requireVaultMember(request);
    const requestedVault = new URL(request.url).searchParams.get("vault");
    let vaults = member.allowedVaults;

    if (requestedVault !== null) {
      if (!isVaultPerson(requestedVault)) {
        return Response.json(
          { error: "That vault name is not valid." },
          { status: 400 },
        );
      }

      if (!member.allowedVaults.includes(requestedVault)) {
        return Response.json(
          { error: "You do not have access to that vault." },
          { status: 403 },
        );
      }

      vaults = [requestedVault];
    }

    if (vaults.length === 0) {
      return Response.json({ recordings: [] });
    }

    const placeholders = vaults.map(() => "?").join(", ");
    const { db } = await getVaultBindings();
    const recordings = await db
      .prepare(
        `SELECT
           tracks.id,
           tracks.title,
           tracks.speaker,
           tracks.category,
           tracks.vault_person,
           tracks.question_id,
           questions.question_number,
           questions.question_text,
           tracks.transcript,
           tracks.transcription_status,
           tracks.story_title,
           tracks.story_chapter,
           tracks.story_status,
           tracks.source_track_id,
           tracks.clip_start_seconds,
           tracks.clip_end_seconds,
           tracks.created_at,
           tracks.updated_at
         FROM audio_tracks AS tracks
         LEFT JOIN questions
           ON questions.id = tracks.question_id
         WHERE tracks.vault_person IN (${placeholders})
           AND tracks.trashed_at IS NULL
           AND tracks.is_split_master = 0
         ORDER BY tracks.created_at DESC`,
      )
      .bind(...vaults)
      .all<RecordingRow>();

    return Response.json({ recordings: recordings.results });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

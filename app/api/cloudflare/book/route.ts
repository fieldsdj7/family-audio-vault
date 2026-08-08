import {
  getVaultBindings,
  requireVaultMember,
  type VaultPerson,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

type BookStoryRow = {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: VaultPerson;
  question_number: number | null;
  question_text: string | null;
  story_title: string | null;
  story_chapter: string;
  story_approved_at: string | null;
  photo_count: number;
  created_at: string;
  updated_at: string;
};

function isVaultPerson(value: string | null): value is VaultPerson {
  return value === "Papa" || value === "Dad" || value === "Mom";
}

export async function GET(request: Request) {
  try {
    const member = await requireVaultMember(request);

    if (!member.isAdmin) {
      return Response.json(
        { error: "Only a Vault administrator can open Book Builder." },
        { status: 403 },
      );
    }

    const requestedVault = new URL(request.url).searchParams.get("vault");
    if (requestedVault !== null && !isVaultPerson(requestedVault)) {
      return Response.json(
        { error: "That vault name is not valid." },
        { status: 400 },
      );
    }

    const { db } = await getVaultBindings();
    const vaultFilter = requestedVault ? "AND tracks.vault_person = ?" : "";
    const statement = db.prepare(
      `SELECT
         tracks.id,
         tracks.title,
         tracks.speaker,
         tracks.category,
         tracks.vault_person,
         questions.question_number,
         questions.question_text,
         tracks.story_title,
         tracks.story_chapter,
         reviews.story_approved_at,
         COUNT(photos.id) AS photo_count,
         tracks.created_at,
         tracks.updated_at
       FROM audio_tracks AS tracks
       LEFT JOIN questions
         ON questions.id = tracks.question_id
       LEFT JOIN audio_track_reviews AS reviews
         ON reviews.audio_track_id = tracks.id
       LEFT JOIN story_photos AS photos
         ON photos.audio_track_id = tracks.id
       WHERE tracks.trashed_at IS NULL
         AND tracks.is_split_master = 0
         AND length(trim(COALESCE(tracks.story_chapter, ''))) > 0
         ${vaultFilter}
       GROUP BY
         tracks.id,
         tracks.title,
         tracks.speaker,
         tracks.category,
         tracks.vault_person,
         questions.question_number,
         questions.question_text,
         tracks.story_title,
         tracks.story_chapter,
         reviews.story_approved_at,
         tracks.created_at,
         tracks.updated_at
       ORDER BY
         CASE tracks.vault_person
           WHEN 'Papa' THEN 1
           WHEN 'Dad' THEN 2
           WHEN 'Mom' THEN 3
         END,
         COALESCE(NULLIF(trim(tracks.category), ''), 'Uncategorized') COLLATE NOCASE,
         tracks.created_at,
         tracks.id`,
    );
    const stories = requestedVault
      ? await statement.bind(requestedVault).all<BookStoryRow>()
      : await statement.all<BookStoryRow>();

    const chapters = new Map<
      string,
      {
        vaultPerson: VaultPerson;
        chapterTitle: string;
        stories: Array<{
          id: string;
          recordingTitle: string;
          storyTitle: string;
          speaker: string;
          questionNumber: number | null;
          questionText: string | null;
          story: string;
          approvedAt: string | null;
          photoCount: number;
          createdAt: string;
          updatedAt: string;
        }>;
      }
    >();

    for (const story of stories.results) {
      const chapterTitle = story.category?.trim() || "Uncategorized";
      const key = `${story.vault_person}\u0000${chapterTitle.toLowerCase()}`;
      const chapter = chapters.get(key) ?? {
        vaultPerson: story.vault_person,
        chapterTitle,
        stories: [],
      };

      chapter.stories.push({
        id: story.id,
        recordingTitle: story.title,
        storyTitle: story.story_title?.trim() || story.title,
        speaker: story.speaker,
        questionNumber: story.question_number,
        questionText: story.question_text,
        story: story.story_chapter,
        approvedAt: story.story_approved_at,
        photoCount: Number(story.photo_count) || 0,
        createdAt: story.created_at,
        updatedAt: story.updated_at,
      });
      chapters.set(key, chapter);
    }

    const outline = [...chapters.values()];
    const approvedStoryCount = stories.results.filter(
      (story) => Boolean(story.story_approved_at),
    ).length;
    const photoCount = stories.results.reduce(
      (total, story) => total + (Number(story.photo_count) || 0),
      0,
    );

    return Response.json({
      outline,
      summary: {
        chapterCount: outline.length,
        storyCount: stories.results.length,
        approvedStoryCount,
        needsApprovalCount: stories.results.length - approvedStoryCount,
        photoCount,
        readyToExport:
          stories.results.length > 0 &&
          approvedStoryCount === stories.results.length,
      },
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

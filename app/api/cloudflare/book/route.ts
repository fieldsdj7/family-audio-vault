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
  created_at: string;
  updated_at: string;
};

type PhotoRow = {
  id: string;
  audio_track_id: string;
  caption: string | null;
  sort_order: number;
};

type BookPartTitle =
  | "Early Life"
  | "Mid Life"
  | "Later Life & Reflection"
  | "General";

const BOOK_PART_ORDER: BookPartTitle[] = [
  "Early Life",
  "Mid Life",
  "Later Life & Reflection",
  "General",
];

function isVaultPerson(
  value: string | null,
): value is VaultPerson {
  return (
    value === "Papa" ||
    value === "Dad" ||
    value === "Mom"
  );
}

function bookPartForCategory(
  category: string | null,
): BookPartTitle {
  const value =
    category?.trim();

  if (value === "Early Life") {
    return "Early Life";
  }

  if (value === "Mid Life") {
    return "Mid Life";
  }

  if (
    value ===
    "Later Life & Reflection"
  ) {
    return "Later Life & Reflection";
  }

  return "General";
}

function partOrder(
  partTitle: BookPartTitle,
) {
  const index =
    BOOK_PART_ORDER.indexOf(
      partTitle,
    );

  return index >= 0
    ? index
    : BOOK_PART_ORDER.length;
}

export async function GET(
  request: Request,
) {
  try {
    const member =
      await requireVaultMember(
        request,
      );

    if (!member.isAdmin) {
      return Response.json(
        {
          error:
            "Only a Vault administrator can open Book Builder.",
        },
        { status: 403 },
      );
    }

    const requestedVault =
      new URL(
        request.url,
      ).searchParams.get(
        "vault",
      );

    if (
      requestedVault !== null &&
      !isVaultPerson(
        requestedVault,
      )
    ) {
      return Response.json(
        {
          error:
            "That vault name is not valid.",
        },
        { status: 400 },
      );
    }

    const { db } =
      await getVaultBindings();

    const vaultFilter =
      requestedVault
        ? "AND tracks.vault_person = ?"
        : "";

    const statement =
      db.prepare(
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
           tracks.created_at,
           tracks.updated_at
         FROM audio_tracks AS tracks
         LEFT JOIN questions
           ON questions.id = tracks.question_id
         LEFT JOIN audio_track_reviews AS reviews
           ON reviews.audio_track_id = tracks.id
         WHERE tracks.trashed_at IS NULL
           AND tracks.is_split_master = 0
           AND length(
             trim(
               COALESCE(
                 tracks.story_chapter,
                 ''
               )
             )
           ) > 0
           ${vaultFilter}
         ORDER BY
           CASE tracks.vault_person
             WHEN 'Papa' THEN 1
             WHEN 'Dad' THEN 2
             WHEN 'Mom' THEN 3
           END,
           tracks.created_at,
           tracks.id`,
      );

    const stories =
      requestedVault
        ? await statement
            .bind(
              requestedVault,
            )
            .all<BookStoryRow>()
        : await statement
            .all<BookStoryRow>();

    const storyIds =
      stories.results.map(
        (story) =>
          story.id,
      );

    const photosByTrack =
      new Map<
        string,
        Array<{
          id: string;
          caption: string | null;
          sortOrder: number;
        }>
      >();

    if (storyIds.length) {
      const placeholders =
        storyIds
          .map(() => "?")
          .join(", ");

      const photoRows =
        await db
          .prepare(
            `SELECT
               id,
               audio_track_id,
               caption,
               sort_order
             FROM story_photos
             WHERE audio_track_id IN (${placeholders})
             ORDER BY
               audio_track_id,
               sort_order,
               created_at`,
          )
          .bind(
            ...storyIds,
          )
          .all<PhotoRow>();

      for (
        const photo of
        photoRows.results
      ) {
        const current =
          photosByTrack.get(
            photo.audio_track_id,
          ) || [];

        current.push({
          id:
            photo.id,

          caption:
            photo.caption,

          sortOrder:
            photo.sort_order,
        });

        photosByTrack.set(
          photo.audio_track_id,
          current,
        );
      }
    }

    const parts =
      new Map<
        string,
        {
          vaultPerson: VaultPerson;
          partTitle: BookPartTitle;
          chapterTitle: BookPartTitle;
          stories: Array<{
            id: string;
            recordingTitle: string;
            storyTitle: string;
            speaker: string;
            questionNumber:
              | number
              | null;
            questionText:
              | string
              | null;
            story: string;
            approvedAt:
              | string
              | null;
            photoCount: number;
            photos: Array<{
              id: string;
              caption:
                | string
                | null;
              sortOrder: number;
            }>;
            createdAt: string;
            updatedAt: string;
            storedCategory:
              | string
              | null;
          }>;
        }
      >();

    for (
      const story of
      stories.results
    ) {
      const partTitle =
        bookPartForCategory(
          story.category,
        );

      const key =
        `${story.vault_person}\u0000${partTitle.toLowerCase()}`;

      const part =
        parts.get(key) ?? {
          vaultPerson:
            story.vault_person,

          partTitle,

          chapterTitle:
            partTitle,

          stories: [],
        };

      const photos =
        photosByTrack.get(
          story.id,
        ) || [];

      part.stories.push({
        id:
          story.id,

        recordingTitle:
          story.title,

        storyTitle:
          story.story_title
            ?.trim() ||
          story.title,

        speaker:
          story.speaker,

        questionNumber:
          story.question_number,

        questionText:
          story.question_text,

        story:
          story.story_chapter,

        approvedAt:
          story.story_approved_at,

        photoCount:
          photos.length,

        photos,

        createdAt:
          story.created_at,

        updatedAt:
          story.updated_at,

        storedCategory:
          story.category,
      });

      parts.set(
        key,
        part,
      );
    }

    const vaultOrder:
      Record<
        VaultPerson,
        number
      > = {
        Papa: 1,
        Dad: 2,
        Mom: 3,
      };

    const outline =
      [...parts.values()].sort(
        (a, b) => {
          const vaultDifference =
            vaultOrder[
              a.vaultPerson
            ] -
            vaultOrder[
              b.vaultPerson
            ];

          if (
            vaultDifference !== 0
          ) {
            return vaultDifference;
          }

          return (
            partOrder(
              a.partTitle,
            ) -
            partOrder(
              b.partTitle,
            )
          );
        },
      );

    const approvedStoryCount =
      stories.results.filter(
        (story) =>
          Boolean(
            story.story_approved_at,
          ),
      ).length;

    const photoCount =
      [...photosByTrack.values()]
        .reduce(
          (
            total,
            photos,
          ) =>
            total +
            photos.length,
          0,
        );

    const legacyCategoryCount =
      stories.results.filter(
        (story) => {
          const category =
            story.category?.trim();

          return (
            Boolean(category) &&
            category !==
              "General" &&
            category !==
              "Early Life" &&
            category !==
              "Mid Life" &&
            category !==
              "Later Life & Reflection"
          );
        },
      ).length;

    return Response.json({
      outline,

      summary: {
        partCount:
          outline.length,

        chapterCount:
          stories.results.length,

        storyCount:
          stories.results.length,

        approvedStoryCount,

        needsApprovalCount:
          stories.results.length -
          approvedStoryCount,

        photoCount,

        legacyCategoryCount,

        readyToExport:
          stories.results.length >
            0 &&
          approvedStoryCount ===
            stories.results.length &&
          legacyCategoryCount === 0,
      },
    });
  } catch (error) {
    return vaultAccessResponse(
      error,
    );
  }
}

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

  /*
   * General is the fallback.
   *
   * Older legacy categories such as Childhood,
   * Military & Work, Faith, etc. are not changed
   * in the database. Until they are manually
   * reassigned in Story Studio, Book Builder
   * places them under General.
   */
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
           AND length(
             trim(
               COALESCE(
                 tracks.story_chapter,
                 ''
               )
             )
           ) > 0
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

          /*
           * Keep chapterTitle temporarily for
           * compatibility with the current
           * Book Builder page. The page will
           * be updated next to use partTitle.
           */
          chapterTitle:
            partTitle,

          stories: [],
        };

      part.stories.push({
        id:
          story.id,

        recordingTitle:
          story.title,

        /*
         * Each story title is now the
         * candidate chapter title inside
         * its major book part.
         */
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
          Number(
            story.photo_count,
          ) || 0,

        createdAt:
          story.created_at,

        updatedAt:
          story.updated_at,

        /*
         * Preserve the actual database
         * category so the UI can identify
         * old legacy labels that still
         * need manual cleanup.
         */
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
      stories.results.reduce(
        (
          total,
          story,
        ) =>
          total +
          (Number(
            story.photo_count,
          ) || 0),
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
        /*
         * A Book Part is now different
         * from a chapter.
         */
        partCount:
          outline.length,

        /*
         * Each completed story is currently
         * a candidate chapter. Later, Book
         * Builder can combine or reorganize
         * these during manuscript creation.
         */
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

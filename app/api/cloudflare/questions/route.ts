import {
  getVaultBindings,
  requireVaultMember,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

type QuestionRow = {
  id: string;
  question_number: number;
  question_text: string;
  created_at: string;
  updated_at: string;
};

async function requireAdministrator(request: Request) {
  const member = await requireVaultMember(request);

  if (!member.isAdmin) {
    return {
      member: null,
      response: Response.json(
        { error: "Only a Vault administrator can manage questions." },
        { status: 403 },
      ),
    };
  }

  return { member, response: null };
}

function questionNumberFrom(value: unknown) {
  if (typeof value !== "number") return null;
  if (!Number.isInteger(value)) return null;
  if (value <= 0) return null;

  return value;
}

function questionTextFrom(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

async function getQuestion(db: D1Database, id: string) {
  return db
    .prepare(
      `SELECT
         id,
         question_number,
         question_text,
         created_at,
         updated_at
       FROM questions
       WHERE id = ?`,
    )
    .bind(id)
    .first<QuestionRow>();
}

export async function GET(request: Request) {
  try {
    await requireVaultMember(request);

    const { db } = await getVaultBindings();

    const questions = await db
      .prepare(
        `SELECT
           id,
           question_number,
           question_text,
           created_at,
           updated_at
         FROM questions
         ORDER BY question_number ASC`,
      )
      .all<QuestionRow>();

    return Response.json({ questions: questions.results });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAdministrator(request);
    if (access.response) return access.response;

    const body = (await request.json()) as {
      questionNumber?: unknown;
      questionText?: unknown;
    };

    const questionNumber = questionNumberFrom(body.questionNumber);
    const questionText = questionTextFrom(body.questionText);

    if (questionNumber === null) {
      return Response.json(
        { error: "Question number must be a positive whole number." },
        { status: 400 },
      );
    }

    if (!questionText) {
      return Response.json(
        { error: "Question text is required." },
        { status: 400 },
      );
    }

    const { db } = await getVaultBindings();

    const duplicate = await db
      .prepare(
        `SELECT id
         FROM questions
         WHERE question_number = ?`,
      )
      .bind(questionNumber)
      .first<{ id: string }>();

    if (duplicate) {
      return Response.json(
        { error: `Question ${questionNumber} already exists.` },
        { status: 409 },
      );
    }

    const id = crypto.randomUUID();

    await db
      .prepare(
        `INSERT INTO questions (
           id,
           question_number,
           question_text
         )
         VALUES (?, ?, ?)`,
      )
      .bind(id, questionNumber, questionText)
      .run();

    const question = await getQuestion(db, id);

    return Response.json(
      {
        message: "Question added.",
        question,
      },
      { status: 201 },
    );
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAdministrator(request);
    if (access.response) return access.response;

    const body = (await request.json()) as {
      id?: unknown;
      questionNumber?: unknown;
      questionText?: unknown;
    };

    const id = typeof body.id === "string" ? body.id.trim() : "";
    const questionNumber = questionNumberFrom(body.questionNumber);
    const questionText = questionTextFrom(body.questionText);

    if (!id) {
      return Response.json(
        { error: "A question was not specified." },
        { status: 400 },
      );
    }

    if (questionNumber === null) {
      return Response.json(
        { error: "Question number must be a positive whole number." },
        { status: 400 },
      );
    }

    if (!questionText) {
      return Response.json(
        { error: "Question text is required." },
        { status: 400 },
      );
    }

    const { db } = await getVaultBindings();

    const existing = await getQuestion(db, id);

    if (!existing) {
      return Response.json(
        { error: "That question could not be found." },
        { status: 404 },
      );
    }

    const duplicate = await db
      .prepare(
        `SELECT id
         FROM questions
         WHERE question_number = ?
           AND id <> ?`,
      )
      .bind(questionNumber, id)
      .first<{ id: string }>();

    if (duplicate) {
      return Response.json(
        { error: `Question ${questionNumber} already exists.` },
        { status: 409 },
      );
    }

    await db
      .prepare(
        `UPDATE questions
         SET question_number = ?,
             question_text = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(questionNumber, questionText, id)
      .run();

    const question = await getQuestion(db, id);

    return Response.json({
      message: "Question updated.",
      question,
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await requireAdministrator(request);
    if (access.response) return access.response;

    const body = (await request.json()) as {
      id?: unknown;
    };

    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return Response.json(
        { error: "A question was not specified." },
        { status: 400 },
      );
    }

    const { db } = await getVaultBindings();

    const existing = await getQuestion(db, id);

    if (!existing) {
      return Response.json(
        { error: "That question could not be found." },
        { status: 404 },
      );
    }

    await db
      .prepare(
        `DELETE FROM questions
         WHERE id = ?`,
      )
      .bind(id)
      .run();

    return Response.json({
      message: "Question deleted.",
      deletedQuestion: existing,
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

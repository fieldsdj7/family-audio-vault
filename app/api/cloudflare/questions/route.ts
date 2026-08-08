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

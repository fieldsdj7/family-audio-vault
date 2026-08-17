import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  getVaultBindings,
  requireVaultMember,
  type VaultPerson,
  VaultAccessError,
  vaultAccessResponse,
} from "../../../../lib/cloudflare";

export const maxDuration = 60;

type TranscriptSourceRow = {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: VaultPerson;
  question_number: number | null;
  question_text: string | null;
  transcript: string;
  story_title: string | null;
  story_chapter: string | null;
  created_at: string;
};

type BiographyAnalysisRow = {
  id: string;
  vault_person: VaultPerson;
  status: "draft" | "ready" | "error";
  source_recording_count: number;
  analysis_json: string | null;
  analysis_error: string | null;
  created_at: string;
  updated_at: string;
};

type SecretEnv = CloudflareEnv & {
  OPENAI_API_KEY?: string;
};

type BiographyAnalysis = {
  subject?: unknown;
  sourceRecordingCount?: unknown;
  overview?: unknown;
  people?: unknown;
  places?: unknown;
  timeline?: unknown;
  themes?: unknown;
  repeatedMemories?: unknown;
  contradictions?: unknown;
  proposedParts?: unknown;
  proposedChapters?: unknown;
  notesForBiographer?: unknown;
};

function isVaultPerson(value: unknown): value is VaultPerson {
  return value === "Papa" || value === "Dad" || value === "Mom";
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanObjectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          !Array.isArray(item),
      )
    : [];
}

function cleanAnalysis(value: BiographyAnalysis) {
  return {
    subject: cleanString(value.subject),
    sourceRecordingCount:
      typeof value.sourceRecordingCount === "number" &&
      Number.isFinite(value.sourceRecordingCount)
        ? Math.max(0, Math.floor(value.sourceRecordingCount))
        : 0,
    overview: cleanString(value.overview),
    people: cleanObjectArray(value.people),
    places: cleanObjectArray(value.places),
    timeline: cleanObjectArray(value.timeline),
    themes: cleanObjectArray(value.themes),
    repeatedMemories: cleanObjectArray(value.repeatedMemories),
    contradictions: cleanObjectArray(value.contradictions),
    proposedParts: cleanObjectArray(value.proposedParts),
    proposedChapters: cleanObjectArray(value.proposedChapters),
    notesForBiographer: cleanStringArray(value.notesForBiographer),
  };
}

function parseStoredAnalysis(row: BiographyAnalysisRow | null) {
  if (!row) return null;

  let analysis: unknown = null;
  if (row.analysis_json) {
    try {
      analysis = JSON.parse(row.analysis_json);
    } catch {
      analysis = null;
    }
  }

  return {
    id: row.id,
    vaultPerson: row.vault_person,
    status: row.status,
    sourceRecordingCount: row.source_recording_count,
    analysis,
    error: row.analysis_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  try {
    const member = await requireVaultMember(request);

    if (!member.isAdmin) {
      return Response.json(
        { error: "Only a Vault administrator can open Biography Analysis." },
        { status: 403 },
      );
    }

    const requestedVault = new URL(request.url).searchParams.get("vault");

    if (!isVaultPerson(requestedVault)) {
      return Response.json(
        { error: "Choose Papa, Dad, or Mom for Biography Analysis." },
        { status: 400 },
      );
    }

    const { db } = await getVaultBindings();

    const row = await db
      .prepare(
        `SELECT id, vault_person, status, source_recording_count,
                analysis_json, analysis_error, created_at, updated_at
         FROM biography_analyses
         WHERE vault_person = ?
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1`,
      )
      .bind(requestedVault)
      .first<BiographyAnalysisRow>();

    return Response.json({ analysis: parseStoredAnalysis(row) });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}

export async function POST(request: Request) {
  let analysisId: string | null = null;

  try {
    const member = await requireVaultMember(request);

    if (!member.isAdmin) {
      return Response.json(
        { error: "Only a Vault administrator can create Biography Analysis." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as { vaultPerson?: unknown };

    if (!isVaultPerson(body.vaultPerson)) {
      return Response.json(
        { error: "Choose Papa, Dad, or Mom for Biography Analysis." },
        { status: 400 },
      );
    }

    const vaultPerson = body.vaultPerson;
    const { db } = await getVaultBindings();

    const sources = await db
      .prepare(
        `SELECT tracks.id, tracks.title, tracks.speaker, tracks.category,
                tracks.vault_person, questions.question_number,
                questions.question_text, tracks.transcript,
                tracks.story_title, tracks.story_chapter, tracks.created_at
         FROM audio_tracks AS tracks
         LEFT JOIN questions ON questions.id = tracks.question_id
         WHERE tracks.trashed_at IS NULL
           AND tracks.is_split_master = 0
           AND tracks.vault_person = ?
           AND length(trim(COALESCE(tracks.transcript, ''))) > 0
         ORDER BY COALESCE(questions.question_number, 999999),
                  tracks.created_at, tracks.id`,
      )
      .bind(vaultPerson)
      .all<TranscriptSourceRow>();

    if (!sources.results.length) {
      return Response.json(
        {
          error:
            "There are no completed transcripts in this Vault yet. Biography Analysis needs at least one transcript.",
        },
        { status: 400 },
      );
    }

    const { env } = await getCloudflareContext({ async: true });
    const openAiKey = (env as SecretEnv).OPENAI_API_KEY;

    if (!openAiKey) {
      return Response.json(
        { error: "The biography analysis service has not been configured yet." },
        { status: 500 },
      );
    }

    analysisId = crypto.randomUUID();

    await db
      .prepare(
        `INSERT INTO biography_analyses (
           id, vault_person, status, source_recording_count,
           analysis_json, analysis_error
         ) VALUES (?, ?, 'draft', ?, NULL, NULL)`,
      )
      .bind(analysisId, vaultPerson, sources.results.length)
      .run();

    const sourceDocuments = sources.results
      .map((source, index) => {
        const details = [
          `SOURCE ${index + 1}`,
          `Recording ID: ${source.id}`,
          `Recording title: ${source.title}`,
          `Speaker(s): ${source.speaker}`,
          `Book part/category: ${source.category || "General"}`,
          source.question_number
            ? `Question: Q${source.question_number}${
                source.question_text ? ` — ${source.question_text}` : ""
              }`
            : "Question: not linked",
          `Recorded/added: ${source.created_at}`,
        ];

        if (source.story_title?.trim()) {
          details.push(`Saved story title: ${source.story_title.trim()}`);
        }

        if (source.story_chapter?.trim()) {
          details.push(
            `Existing edited story (secondary reference only):\n${source.story_chapter.trim()}`,
          );
        }

        details.push(
          `FULL TRANSCRIPT — factual source:\n${source.transcript.trim()}`,
        );

        return details.join("\n");
      })
      .join("\n\n==============================\n\n");

    const instructions = [
      "You are a careful archival biographer analyzing a collection of oral-history transcripts for a future family biography.",
      "The FULL TRANSCRIPTS are the factual authority. Existing edited stories are secondary references for tone and readability only.",
      "Never invent, infer as fact, or silently reconcile names, dates, relationships, motives, dialogue, emotions, locations, or events.",
      "When multiple recordings discuss the same subject, combine their supported details into one memory cluster and cite every relevant recording ID.",
      "Prefer the richer version of a repeated memory only when it adds details without contradicting another source; retain unique supported details from all compatible sources.",
      "If two credible sources conflict, do not choose one. Put the conflict in contradictions with the recording IDs and explain exactly what differs.",
      "A repeated mention is not automatically a contradiction. Distinguish additional detail, paraphrase, and genuine disagreement.",
            "Build a biography-oriented map, not a question-by-question outline. Proposed chapters should group related memories the way a human biographer would.",
      "Prefer a smaller number of broader, substantial biography chapters over many narrow chapters.",
      "Treat minor topics as sections or subtopics inside a broader chapter unless the source collection contains enough distinct material to justify a full standalone chapter.",
      "When the source collection is still incomplete, be conservative about splitting topics into separate chapters. Favor flexible working chapters that can absorb additional memories later.",
      "Avoid creating separate chapters for closely related childhood topics such as siblings, farm life, school, friends, play, injuries, and early challenges when they would read more naturally as sections within a broader childhood chapter.",
      "A proposed chapter should normally draw from multiple recordings or cover a meaningful span of life or theme. Do not create a chapter merely because one interview answer exists.",
      "The proposed outline is a working biography structure, not a final table of contents. It should be expected to evolve as more recordings are added.",
      "Aim for a broadly chronological structure when the sources support chronology, but allow thematic chapters where that produces a better biography.",
      "Do not make every recording its own chapter.",
      "Each proposed chapter must list the recording IDs that contain source material for it.",
      "Each people/place/timeline/theme/repeated-memory item should include relevant source recording IDs whenever possible.",
      "Return valid JSON only.",
      "Use exactly these top-level fields: subject, sourceRecordingCount, overview, people, places, timeline, themes, repeatedMemories, contradictions, proposedParts, proposedChapters, notesForBiographer.",
      "people: array of objects with name, relationshipOrRole, details, sourceRecordingIds.",
      "places: array of objects with name, details, sourceRecordingIds.",
      "timeline: array of objects with dateOrLifeStage, event, confidence, sourceRecordingIds.",
      "themes: array of objects with theme, details, sourceRecordingIds.",
      "repeatedMemories: array of objects with topic, combinedDetails, sourceRecordingIds, notes.",
      "contradictions: array of objects with topic, versions, sourceRecordingIds, reviewNeeded.",
      "proposedParts: array of objects with title, purpose, proposedChapterTitles.",
      "proposedChapters: array of objects with title, partTitle, purpose, keyMaterial, sourceRecordingIds, chronologyNotes.",
      "notesForBiographer: array of short strings identifying gaps, follow-up opportunities, or cautions.",
    ].join(" ");

    const prompt = [
      `Legacy book: ${vaultPerson}`,
      `Number of transcript sources: ${sources.results.length}`,
      "",
      "Analyze the complete source collection below and create a biography source map and proposed structure.",
      "",
      sourceDocuments,
    ].join("\n");

    const openAiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: instructions },
            { role: "user", content: prompt },
          ],
        }),
      },
    );

    const responseBody = (await openAiResponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    const content = responseBody.choices?.[0]?.message?.content;

    if (!openAiResponse.ok || !content) {
      throw new Error(
        responseBody.error?.message ||
          "OpenAI could not analyze the biography sources.",
      );
    }

    let parsed: BiographyAnalysis;
    try {
      parsed = JSON.parse(content) as BiographyAnalysis;
    } catch {
      throw new Error(
        "OpenAI returned the biography analysis in an unexpected format. Please try again.",
      );
    }

    const analysis = cleanAnalysis(parsed);

    if (!analysis.overview || !analysis.proposedChapters.length) {
      throw new Error(
        "OpenAI returned an incomplete biography analysis. Please try again.",
      );
    }

    analysis.subject = analysis.subject || vaultPerson;
    analysis.sourceRecordingCount = sources.results.length;

    await db
      .prepare(
        `UPDATE biography_analyses
         SET status = 'ready',
             source_recording_count = ?,
             analysis_json = ?,
             analysis_error = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        sources.results.length,
        JSON.stringify(analysis),
        analysisId,
      )
      .run();

    return Response.json({
      analysis: {
        id: analysisId,
        vaultPerson,
        status: "ready",
        sourceRecordingCount: sources.results.length,
        analysis,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Biography analysis failed.";

    if (analysisId) {
      try {
        const { db } = await getVaultBindings();
        await db
          .prepare(
            `UPDATE biography_analyses
             SET status = 'error',
                 analysis_error = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
          )
          .bind(message, analysisId)
          .run();
      } catch (updateError) {
        console.error(
          "Could not save the biography analysis error.",
          updateError,
        );
      }
    }

    if (error instanceof VaultAccessError) {
      return vaultAccessResponse(error);
    }

    console.error(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

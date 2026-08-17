"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle,
  GitMerge,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

type VaultPerson =
  | "Papa"
  | "Dad"
  | "Mom";

type SourceItem = {
  sourceRecordingIds?: string[];
  [key: string]: unknown;
};

type BiographyAnalysisData = {
  subject?: string;
  sourceRecordingCount?: number;
  overview?: string;
  people?: SourceItem[];
  places?: SourceItem[];
  timeline?: SourceItem[];
  themes?: SourceItem[];
  repeatedMemories?: SourceItem[];
  contradictions?: SourceItem[];
  proposedParts?: SourceItem[];
  proposedChapters?: SourceItem[];
  notesForBiographer?: string[];
};

type StoredAnalysis = {
  id: string;
  vaultPerson: VaultPerson;
  status:
    | "draft"
    | "ready"
    | "error";
  sourceRecordingCount: number;
  analysis:
    | BiographyAnalysisData
    | null;
  error:
    | string
    | null;
  createdAt: string;
  updatedAt: string;
};

const vaults: Array<{
  name: VaultPerson;
  displayName: string;
}> = [
  {
    name: "Papa",
    displayName:
      "Papa — Bill",
  },
  {
    name: "Dad",
    displayName:
      "Dad — Dan",
  },
  {
    name: "Mom",
    displayName:
      "Mom — Ivy",
  },
];

function textValue(
  value: unknown,
) {
  return typeof value ===
    "string"
    ? value
    : "";
}

function stringList(
  value: unknown,
) {
  return Array.isArray(value)
    ? value.filter(
        (
          item,
        ): item is string =>
          typeof item ===
          "string",
      )
    : [];
}

function sourceIds(
  item: SourceItem,
) {
  return Array.isArray(
    item.sourceRecordingIds,
  )
    ? item.sourceRecordingIds.filter(
        (
          value,
        ): value is string =>
          typeof value ===
          "string",
      )
    : [];
}

function AnalysisCard({
  title,
  children,
}: {
  title: string;
  children:
    React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-stone-300 bg-[#fffaf0] p-5 shadow-sm sm:p-6">
      <h2 className="font-serif text-2xl text-stone-900">
        {title}
      </h2>

      <div className="mt-4">
        {children}
      </div>
    </section>
  );
}

export default function BiographyAnalysisPage() {
  const [
    checkingAccess,
    setCheckingAccess,
  ] =
    useState(true);

  const [
    isAdmin,
    setIsAdmin,
  ] =
    useState(false);

  const [
    vaultPerson,
    setVaultPerson,
  ] =
    useState<VaultPerson>(
      "Papa",
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    analyzing,
    setAnalyzing,
  ] =
    useState(false);

  const [
    stored,
    setStored,
  ] =
    useState<StoredAnalysis | null>(
      null,
    );

  const [
    message,
    setMessage,
  ] =
    useState<{
      type:
        | "success"
        | "error";
      text: string;
    } | null>(null);

  useEffect(() => {
    void start();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadAnalysis(
        vaultPerson,
      );
    }
  }, [
    vaultPerson,
    isAdmin,
  ]);

  const analysis =
    stored?.analysis ||
    null;

  const chapterCount =
    useMemo(
      () =>
        analysis
          ?.proposedChapters
          ?.length || 0,
      [analysis],
    );

  const repeatedCount =
    useMemo(
      () =>
        analysis
          ?.repeatedMemories
          ?.length || 0,
      [analysis],
    );

  const contradictionCount =
    useMemo(
      () =>
        analysis
          ?.contradictions
          ?.length || 0,
      [analysis],
    );

  async function start() {
    setCheckingAccess(
      true,
    );

    try {
      const response =
        await fetch(
          "/api/cloudflare/member",
          {
            cache:
              "no-store",
          },
        );

      const data =
        (await response.json()) as {
          member?: {
            isAdmin: boolean;
          };
        };

      setIsAdmin(
        response.ok &&
          !!data.member
            ?.isAdmin,
      );
    } catch {
      setIsAdmin(false);
    } finally {
      setCheckingAccess(
        false,
      );
    }
  }

  async function loadAnalysis(
    person: VaultPerson,
  ) {
    setLoading(true);

    try {
      const response =
        await fetch(
          `/api/cloudflare/biography-analysis?vault=${encodeURIComponent(
            person,
          )}`,
          {
            cache:
              "no-store",
          },
        );

      const data =
        (await response.json()) as {
          analysis?: StoredAnalysis | null;
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Biography Analysis could not be loaded.",
        );
      }

      setStored(
        data.analysis ||
          null,
      );
    } catch (error) {
      setStored(null);

      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Biography Analysis could not be loaded.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function runAnalysis() {
    const confirmed =
      window.confirm(
        `Analyze all completed ${vaultPerson} transcripts together?\n\nThis may take up to about a minute and will create a new proposed biography map. It will not change any recordings, transcripts, or stories.`,
      );

    if (!confirmed) {
      return;
    }

    setAnalyzing(true);
    setMessage(null);

    try {
      const response =
        await fetch(
          "/api/cloudflare/biography-analysis",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                vaultPerson,
              }),
          },
        );

      const data =
        (await response.json()) as {
          analysis?: StoredAnalysis;
          error?: string;
        };

      if (
        !response.ok ||
        !data.analysis
      ) {
        throw new Error(
          data.error ||
            "Biography Analysis could not be created.",
        );
      }

      setStored(
        data.analysis,
      );

      setMessage({
        type: "success",
        text:
          "Biography Analysis is ready. Review the proposed structure and repeated-memory groups below.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Biography Analysis could not be created.",
      });
    } finally {
      setAnalyzing(false);
    }
  }

  if (checkingAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5]">
        <Loader2 className="h-7 w-7 animate-spin text-[#a66b27]" />
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] p-5">
        <div className="w-full max-w-md rounded-3xl border border-stone-300 bg-[#fffaf0] p-8 text-center shadow-xl">
          <ShieldCheck className="mx-auto h-10 w-10 text-[#a66b27]" />

          <h1 className="mt-4 font-serif text-3xl text-stone-900">
            Biography Analysis is private
          </h1>

          <p className="mt-3 text-sm text-stone-600">
            Only Vault administrators can analyze the family biography.
          </p>

          <a
            href="/project-tools"
            className="mt-6 inline-flex rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white"
          >
            Return to Project Tools
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f0e5] p-4 text-stone-800 sm:p-5 md:p-10">
      <div className="mx-auto w-full max-w-5xl">
        <a
          href="/project-tools"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-[#8a561f]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Project Tools
        </a>

        <header className="mt-6 border-b border-stone-300 pb-7">
          <p className="text-xs font-semibold uppercase tracking-[.22em] text-[#a66b27]">
            Fields Family Vault
          </p>

          <h1 className="mt-2 flex items-center gap-3 font-serif text-3xl text-stone-900 sm:text-4xl md:text-5xl">
            <Sparkles className="h-8 w-8 shrink-0 text-[#a66b27]" />
            Biography Analysis
          </h1>

          <p className="mt-3 max-w-3xl leading-relaxed text-stone-600">
            Analyze all of one person's full transcripts together so overlapping memories can be combined into a biography instead of becoming separate repetitive chapters.
          </p>
        </header>

        <section className="mt-8">
          <p className="text-sm font-semibold">
            Choose a biography
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {vaults.map(
              (vault) => (
                <button
                  key={
                    vault.name
                  }
                  type="button"
                  onClick={() => {
                    setVaultPerson(
                      vault.name,
                    );
                    setMessage(
                      null,
                    );
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${
                    vaultPerson ===
                    vault.name
                      ? "border-[#b57931] bg-[#f4e7cf]"
                      : "border-stone-300 bg-[#fffaf0] hover:border-[#b57931]"
                  }`}
                >
                  <span className="font-serif text-lg text-stone-900">
                    {
                      vault.displayName
                    }
                  </span>
                </button>
              ),
            )}
          </div>
        </section>

        {message && (
          <div
            className={`mt-7 flex gap-2 rounded-xl border p-4 text-sm ${
              message.type ===
              "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {message.type ===
            "success" ? (
              <CheckCircle className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}

            {
              message.text
            }
          </div>
        )}

        <section className="mt-8 rounded-3xl border border-stone-300 bg-[#fffaf0] p-5 shadow-sm sm:p-6 md:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">
                Source Analysis
              </p>

              <h2 className="mt-2 font-serif text-3xl text-stone-900">
                {
                  vaults.find(
                    (vault) =>
                      vault.name ===
                      vaultPerson,
                  )
                    ?.displayName
                }
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
                This reads completed transcripts as source documents. It does not rewrite or alter your recordings.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void runAnalysis()
              }
              disabled={
                analyzing
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white disabled:bg-stone-400 sm:w-auto"
            >
              {analyzing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : stored ? (
                <RefreshCw className="h-5 w-5" />
              ) : (
                <Sparkles className="h-5 w-5" />
              )}

              {analyzing
                ? "Analyzing all transcripts…"
                : stored
                  ? "Run New Analysis"
                  : "Analyze All Transcripts"}
            </button>
          </div>

          {loading && (
            <div className="mt-6 flex items-center gap-2 rounded-xl bg-stone-100 p-4 text-sm text-stone-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading saved analysis…
            </div>
          )}

          {!loading &&
            !stored && (
              <div className="mt-6 rounded-2xl border border-dashed border-stone-300 p-6 text-center">
                <BookOpen className="mx-auto h-8 w-8 text-[#a66b27]" />

                <p className="mt-3 font-semibold text-stone-800">
                  No biography analysis has been created yet.
                </p>

                <p className="mt-2 text-sm text-stone-600">
                  When you're ready, analyze all completed transcripts for this Vault.
                </p>
              </div>
            )}

          {!loading &&
            stored && (
              <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl bg-stone-100 p-4">
                  <p className="text-2xl font-semibold">
                    {
                      stored.sourceRecordingCount
                    }
                  </p>
                  <p className="text-xs text-stone-600">
                    Transcript sources
                  </p>
                </div>

                <div className="rounded-2xl bg-stone-100 p-4">
                  <p className="text-2xl font-semibold">
                    {
                      chapterCount
                    }
                  </p>
                  <p className="text-xs text-stone-600">
                    Proposed chapters
                  </p>
                </div>

                <div className="rounded-2xl bg-stone-100 p-4">
                  <p className="text-2xl font-semibold">
                    {
                      repeatedCount
                    }
                  </p>
                  <p className="text-xs text-stone-600">
                    Repeated memories
                  </p>
                </div>

                <div className="rounded-2xl bg-stone-100 p-4">
                  <p className="text-2xl font-semibold">
                    {
                      contradictionCount
                    }
                  </p>
                  <p className="text-xs text-stone-600">
                    Possible conflicts
                  </p>
                </div>
              </div>
            )}
        </section>

        {analysis && (
          <div className="mt-8 space-y-6">
            <AnalysisCard title="Biography Overview">
              <p className="leading-relaxed text-stone-700">
                {
                  analysis.overview ||
                  "No overview was returned."
                }
              </p>
            </AnalysisCard>

            <AnalysisCard title="Proposed Book Parts">
              <div className="space-y-3">
                {(analysis.proposedParts || []).map(
                  (
                    part,
                    index,
                  ) => (
                    <div
                      key={
                        index
                      }
                      className="rounded-2xl border border-stone-200 bg-white p-4"
                    >
                      <p className="font-serif text-xl text-stone-900">
                        {textValue(
                          part.title,
                        ) ||
                          `Part ${index + 1}`}
                      </p>

                      {textValue(
                        part.purpose,
                      ) && (
                        <p className="mt-2 text-sm leading-relaxed text-stone-600">
                          {textValue(
                            part.purpose,
                          )}
                        </p>
                      )}

                      {stringList(
                        part.proposedChapterTitles,
                      ).length >
                        0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {stringList(
                            part.proposedChapterTitles,
                          ).map(
                            (
                              title,
                            ) => (
                              <span
                                key={
                                  title
                                }
                                className="rounded-full bg-[#f4e7cf] px-3 py-1 text-xs font-semibold text-[#76502a]"
                              >
                                {
                                  title
                                }
                              </span>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
            </AnalysisCard>

            <AnalysisCard title="Proposed Chapters">
              <div className="space-y-4">
                {(analysis.proposedChapters || []).map(
                  (
                    chapter,
                    index,
                  ) => (
                    <article
                      key={
                        index
                      }
                      className="rounded-2xl border border-stone-200 bg-white p-5"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#a66b27]">
                        Proposed Chapter{" "}
                        {index + 1}
                      </p>

                      <h3 className="mt-2 font-serif text-2xl text-stone-900">
                        {textValue(
                          chapter.title,
                        )}
                      </h3>

                      {textValue(
                        chapter.partTitle,
                      ) && (
                        <p className="mt-1 text-sm font-semibold text-[#80542a]">
                          {textValue(
                            chapter.partTitle,
                          )}
                        </p>
                      )}

                      {textValue(
                        chapter.purpose,
                      ) && (
                        <p className="mt-3 leading-relaxed text-stone-700">
                          {textValue(
                            chapter.purpose,
                          )}
                        </p>
                      )}

                      {textValue(
                        chapter.keyMaterial,
                      ) && (
                        <p className="mt-3 text-sm leading-relaxed text-stone-600">
                          <span className="font-semibold">
                            Material:
                          </span>{" "}
                          {textValue(
                            chapter.keyMaterial,
                          )}
                        </p>
                      )}

                      <p className="mt-3 text-xs text-stone-500">
                        Sources:{" "}
                        {sourceIds(
                          chapter,
                        ).length
                          ? sourceIds(
                              chapter,
                            ).length
                          : 0}{" "}
                        recording(s)
                      </p>
                    </article>
                  ),
                )}
              </div>
            </AnalysisCard>

            <AnalysisCard title="Repeated & Overlapping Memories">
              {(analysis.repeatedMemories || []).length ? (
                <div className="space-y-3">
                  {(analysis.repeatedMemories || []).map(
                    (
                      memory,
                      index,
                    ) => (
                      <div
                        key={
                          index
                        }
                        className="rounded-2xl border border-stone-200 bg-white p-4"
                      >
                        <div className="flex items-start gap-3">
                          <GitMerge className="mt-1 h-5 w-5 shrink-0 text-[#a66b27]" />

                          <div>
                            <p className="font-semibold text-stone-900">
                              {textValue(
                                memory.topic,
                              ) ||
                                "Repeated memory"}
                            </p>

                            {textValue(
                              memory.combinedDetails,
                            ) && (
                              <p className="mt-2 text-sm leading-relaxed text-stone-700">
                                {textValue(
                                  memory.combinedDetails,
                                )}
                              </p>
                            )}

                            <p className="mt-2 text-xs text-stone-500">
                              Uses{" "}
                              {sourceIds(
                                memory,
                              ).length}{" "}
                              source recording(s)
                            </p>
                          </div>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <p className="text-sm text-stone-600">
                  No repeated-memory groups were identified.
                </p>
              )}
            </AnalysisCard>

            <AnalysisCard title="Possible Contradictions">
              {(analysis.contradictions || []).length ? (
                <div className="space-y-3">
                  {(analysis.contradictions || []).map(
                    (
                      item,
                      index,
                    ) => (
                      <div
                        key={
                          index
                        }
                        className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
                      >
                        <p className="font-semibold text-amber-950">
                          {textValue(
                            item.topic,
                          ) ||
                            "Possible conflict"}
                        </p>

                        {Array.isArray(
                          item.versions,
                        ) && (
                          <div className="mt-2 space-y-2 text-sm text-amber-900">
                            {item.versions.map(
                              (
                                version,
                                versionIndex,
                              ) => (
                                <p
                                  key={
                                    versionIndex
                                  }
                                >
                                  {typeof version ===
                                  "string"
                                    ? version
                                    : JSON.stringify(
                                        version,
                                      )}
                                </p>
                              ),
                            )}
                          </div>
                        )}

                        <p className="mt-2 text-xs text-amber-800">
                          Review needed from{" "}
                          {sourceIds(
                            item,
                          ).length}{" "}
                          source recording(s)
                        </p>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-emerald-800">
                  <CheckCircle className="h-4 w-4" />
                  No possible contradictions were identified.
                </div>
              )}
            </AnalysisCard>

            {(analysis.people || []).length >
              0 && (
              <AnalysisCard title="People Identified">
                <div className="grid gap-3 sm:grid-cols-2">
                  {(analysis.people || []).map(
                    (
                      person,
                      index,
                    ) => (
                      <div
                        key={
                          index
                        }
                        className="rounded-2xl border border-stone-200 bg-white p-4"
                      >
                        <div className="flex items-start gap-3">
                          <Users className="mt-1 h-4 w-4 shrink-0 text-[#a66b27]" />

                          <div>
                            <p className="font-semibold text-stone-900">
                              {textValue(
                                person.name,
                              )}
                            </p>

                            {textValue(
                              person.relationshipOrRole,
                            ) && (
                              <p className="mt-1 text-xs font-semibold text-[#80542a]">
                                {textValue(
                                  person.relationshipOrRole,
                                )}
                              </p>
                            )}

                            {textValue(
                              person.details,
                            ) && (
                              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                                {textValue(
                                  person.details,
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </AnalysisCard>
            )}

            {(analysis.places || []).length >
              0 && (
              <AnalysisCard title="Places Identified">
                <div className="grid gap-3 sm:grid-cols-2">
                  {(analysis.places || []).map(
                    (
                      place,
                      index,
                    ) => (
                      <div
                        key={
                          index
                        }
                        className="rounded-2xl border border-stone-200 bg-white p-4"
                      >
                        <div className="flex items-start gap-3">
                          <MapPin className="mt-1 h-4 w-4 shrink-0 text-[#a66b27]" />

                          <div>
                            <p className="font-semibold text-stone-900">
                              {textValue(
                                place.name,
                              )}
                            </p>

                            {textValue(
                              place.details,
                            ) && (
                              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                                {textValue(
                                  place.details,
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </AnalysisCard>
            )}

            {(analysis.notesForBiographer || []).length >
              0 && (
              <AnalysisCard title="Notes for the Biography">
                <div className="space-y-2">
                  {(analysis.notesForBiographer || []).map(
                    (
                      note,
                      index,
                    ) => (
                      <p
                        key={
                          index
                        }
                        className="rounded-xl bg-stone-100 p-3 text-sm leading-relaxed text-stone-700"
                      >
                        {
                          note
                        }
                      </p>
                    ),
                  )}
                </div>
              </AnalysisCard>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  ShieldCheck,
} from "lucide-react";

type VaultPerson = "Papa" | "Dad" | "Mom";

type BookStory = {
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
};

type BookChapter = {
  vaultPerson: VaultPerson;
  chapterTitle: string;
  stories: BookStory[];
};

type BookResponse = {
  outline?: BookChapter[];

  summary?: {
    chapterCount: number;
    storyCount: number;
    approvedStoryCount: number;
    needsApprovalCount: number;
    photoCount: number;
    readyToExport: boolean;
  };

  error?: string;
};

const vaults: Array<{
  name: VaultPerson;
  displayName: string;
  bookTitle: string;
}> = [
  {
    name: "Papa",
    displayName: "Papa — Bill",
    bookTitle: "Papa's Life",
  },
  {
    name: "Dad",
    displayName: "Dad — Dan",
    bookTitle: "Dad's Life",
  },
  {
    name: "Mom",
    displayName: "Mom — Ivy",
    bookTitle: "Mom's Life",
  },
];

export default function BookBuilderPage() {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const [vaultPerson, setVaultPerson] =
    useState<VaultPerson>("Papa");

  const [outline, setOutline] = useState<BookChapter[]>([]);

  const [summary, setSummary] =
    useState<BookResponse["summary"]>(undefined);

  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [approvingId, setApprovingId] =
    useState<string | null>(null);

  const [openChapters, setOpenChapters] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    void start();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadBook(vaultPerson);
    }
  }, [vaultPerson, isAdmin]);

  async function start() {
    setCheckingAccess(true);

    try {
      const response = await fetch("/api/cloudflare/member", {
        cache: "no-store",
      });

      const data = (await response.json()) as {
        member?: {
          isAdmin: boolean;
        };
      };

      setIsAdmin(
        response.ok &&
          !!data.member?.isAdmin,
      );
    } catch {
      setIsAdmin(false);
    } finally {
      setCheckingAccess(false);
    }
  }

  async function loadBook(person: VaultPerson) {
    setLoading(true);

    try {
      const response = await fetch(
        `/api/cloudflare/book?vault=${encodeURIComponent(person)}`,
        {
          cache: "no-store",
        },
      );

      const data = (await response.json()) as BookResponse;

      if (!response.ok) {
        throw new Error(
          data.error || "The book could not be loaded.",
        );
      }

      const nextOutline = data.outline || [];

      setOutline(nextOutline);
      setSummary(data.summary);

      setOpenChapters((current) => {
        const expanded = { ...current };

        nextOutline.forEach((chapter) => {
          if (
            expanded[chapter.chapterTitle] === undefined
          ) {
            expanded[chapter.chapterTitle] = true;
          }
        });

        return expanded;
      });
    } catch (error) {
      setOutline([]);
      setSummary(undefined);

      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "The book could not be loaded.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function approveStory(story: BookStory) {
    const confirmed = window.confirm(
      `Approve “${story.storyTitle}” for the book?\n\nThis marks the current family story as approved.`,
    );

    if (!confirmed) return;

    setApprovingId(story.id);
    setMessage(null);

    try {
      const response = await fetch(
        "/api/cloudflare/reviews",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            recordingId: story.id,
            reviewType: "story",
          }),
        },
      );

      const result = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error ||
            "The story could not be approved.",
        );
      }

      await loadBook(vaultPerson);

      setMessage({
        type: "success",
        text: `“${story.storyTitle}” is approved for the book.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "The story could not be approved.",
      });
    } finally {
      setApprovingId(null);
    }
  }

  function toggleChapter(title: string) {
    setOpenChapters((current) => ({
      ...current,
      [title]: !current[title],
    }));
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
            Book Builder is private
          </h1>

          <p className="mt-3 text-sm text-stone-600">
            Only Vault administrators can build the family books.
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

  const selectedVault =
    vaults.find((vault) => vault.name === vaultPerson) ||
    vaults[0];

  return (
    <main className="min-h-screen bg-[#f6f0e5] p-5 text-stone-800 md:p-10">
      <div className="mx-auto max-w-5xl">
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

          <h1 className="mt-2 flex items-center gap-3 font-serif text-4xl text-stone-900 md:text-5xl">
            <BookOpen className="h-9 w-9 text-[#a66b27]" />
            Book Builder
          </h1>

          <p className="mt-3 max-w-3xl text-stone-600">
            Review and approve the finished family stories as they
            will be organized into each legacy book.
          </p>
        </header>

        <section className="mt-8">
          <p className="text-sm font-semibold">
            Choose a legacy book
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {vaults.map((vault) => (
              <button
                key={vault.name}
                type="button"
                onClick={() => {
                  setVaultPerson(vault.name);
                  setMessage(null);
                }}
                className={`rounded-2xl border p-4 text-left transition ${
                  vaultPerson === vault.name
                    ? "border-[#b57931] bg-[#f4e7cf]"
                    : "border-stone-300 bg-[#fffaf0] hover:border-[#b57931]"
                }`}
              >
                <span className="font-serif text-lg text-stone-900">
                  {vault.displayName}
                </span>

                <span className="mt-1 block text-xs text-stone-600">
                  {vault.bookTitle}
                </span>
              </button>
            ))}
          </div>
        </section>

        {message && (
          <div
            className={`mt-7 flex gap-2 rounded-xl border p-4 text-sm ${
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}

            {message.text}
          </div>
        )}

        {loading ? (
          <section className="mt-10 rounded-3xl border border-stone-300 bg-[#fffaf0] p-10 text-center">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#a66b27]" />

            <p className="mt-3 text-stone-600">
              Building the book outline…
            </p>
          </section>
        ) : (
          <>
            <section className="mt-8 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">
                    Current Book
                  </p>

                  <h2 className="mt-2 font-serif text-3xl text-stone-900">
                    {selectedVault.bookTitle}
                  </h2>

                  <p className="mt-1 text-sm text-stone-600">
                    {selectedVault.displayName}
                  </p>
                </div>

                {summary?.readyToExport ? (
                  <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800">
                    <CheckCircle className="h-4 w-4" />
                    Ready for export
                  </span>
                ) : (
                  <span className="inline-flex w-fit items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900">
                    <AlertCircle className="h-4 w-4" />
                    Still being built
                  </span>
                )}
              </div>

              {summary && (
                <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-2xl bg-stone-100 p-4">
                    <p className="text-2xl font-semibold">
                      {summary.chapterCount}
                    </p>
                    <p className="text-xs text-stone-600">
                      Chapters
                    </p>
                  </div>

                  <div className="rounded-2xl bg-stone-100 p-4">
                    <p className="text-2xl font-semibold">
                      {summary.storyCount}
                    </p>
                    <p className="text-xs text-stone-600">
                      Stories
                    </p>
                  </div>

                  <div className="rounded-2xl bg-stone-100 p-4">
                    <p className="text-2xl font-semibold">
                      {summary.approvedStoryCount}
                    </p>
                    <p className="text-xs text-stone-600">
                      Approved
                    </p>
                  </div>

                  <div className="rounded-2xl bg-stone-100 p-4">
                    <p className="text-2xl font-semibold">
                      {summary.needsApprovalCount}
                    </p>
                    <p className="text-xs text-stone-600">
                      Need approval
                    </p>
                  </div>

                  <div className="rounded-2xl bg-stone-100 p-4">
                    <p className="text-2xl font-semibold">
                      {summary.photoCount}
                    </p>
                    <p className="text-xs text-stone-600">
                      Photos
                    </p>
                  </div>
                </div>
              )}
            </section>

            {!outline.length ? (
              <section className="mt-8 rounded-3xl border border-dashed border-stone-300 bg-[#fffaf0] p-10 text-center">
                <BookOpen className="mx-auto h-9 w-9 text-[#a66b27]" />

                <h2 className="mt-4 font-serif text-2xl text-stone-900">
                  No finished stories yet
                </h2>

                <p className="mt-2 text-stone-600">
                  Stories will appear here after they are created in
                  Story Studio.
                </p>
              </section>
            ) : (
              <section className="mt-8 space-y-6">
                {outline.map((chapter, chapterIndex) => {
                  const open =
                    openChapters[chapter.chapterTitle] ?? true;

                  return (
                    <div
                      key={`${chapter.vaultPerson}-${chapter.chapterTitle}`}
                      className="overflow-hidden rounded-3xl border border-stone-300 bg-[#fffaf0] shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          toggleChapter(chapter.chapterTitle)
                        }
                        className="flex w-full items-center gap-4 border-b border-stone-200 px-6 py-5 text-left md:px-8"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e8d4ae] font-serif text-[#76502a]">
                          {chapterIndex + 1}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold uppercase tracking-[.16em] text-[#a66b27]">
                            Chapter {chapterIndex + 1}
                          </span>

                          <span className="mt-1 block font-serif text-2xl text-stone-900">
                            {chapter.chapterTitle}
                          </span>

                          <span className="mt-1 block text-sm text-stone-500">
                            {chapter.stories.length}{" "}
                            {chapter.stories.length === 1
                              ? "story"
                              : "stories"}
                          </span>
                        </span>

                        {open ? (
                          <ChevronDown className="h-5 w-5 text-stone-500" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-stone-500" />
                        )}
                      </button>

                      {open && (
                        <div className="space-y-6 p-6 md:p-8">
                          {chapter.stories.map((story, storyIndex) => (
                            <article
                              key={story.id}
                              className="rounded-2xl border border-stone-200 bg-white p-5 md:p-6"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#a66b27]">
                                    Story {storyIndex + 1}
                                  </p>

                                  <h3 className="mt-2 font-serif text-2xl text-stone-900">
                                    {story.storyTitle}
                                  </h3>

                                  {story.questionNumber && (
                                    <p className="mt-2 text-sm font-semibold text-[#80542a]">
                                      Q{story.questionNumber}
                                      {story.questionText
                                        ? ` — ${story.questionText}`
                                        : ""}
                                    </p>
                                  )}

                                  <p className="mt-2 text-sm text-stone-500">
                                    Recording: {story.recordingTitle}
                                  </p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {story.approvedAt ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                                      <CheckCircle className="h-3.5 w-3.5" />
                                      Approved
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900">
                                      Needs approval
                                    </span>
                                  )}

                                  {story.photoCount > 0 && (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700">
                                      <ImageIcon className="h-3.5 w-3.5" />
                                      {story.photoCount}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="mt-5 border-t border-stone-200 pt-5">
                                <p className="whitespace-pre-line font-serif text-lg leading-relaxed text-stone-700">
                                  {story.story}
                                </p>
                              </div>

                              <div className="mt-6 flex flex-wrap gap-3">
                                {!story.approvedAt && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void approveStory(story)
                                    }
                                    disabled={approvingId === story.id}
                                    className="inline-flex items-center gap-2 rounded-xl bg-[#3b4536] px-4 py-2 text-sm font-semibold text-white disabled:bg-stone-400"
                                  >
                                    {approvingId === story.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Check className="h-4 w-4" />
                                    )}

                                    {approvingId === story.id
                                      ? "Approving…"
                                      : "Approve Story"}
                                  </button>
                                )}

                                <a
                                  href={`/admin?trackId=${encodeURIComponent(
                                    story.id,
                                  )}`}
                                  className="inline-flex rounded-xl border border-stone-300 bg-[#fffaf0] px-4 py-2 text-sm font-semibold text-stone-700 hover:border-[#a66b27]"
                                >
                                  Open in Story Studio
                                </a>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

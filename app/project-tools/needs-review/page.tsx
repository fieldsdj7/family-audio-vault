'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';

type VaultPerson = 'Papa' | 'Dad' | 'Mom';

type Recording = {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: VaultPerson;
  question_id?: string | null;
  question_number?: number | null;
  question_text?: string | null;
  transcript: string | null;
  transcription_status: string | null;
  story_title: string | null;
  story_chapter: string | null;
  story_status: string | null;
  created_at: string;
};

type Filter =
  | 'needs_attention'
  | 'needs_transcription'
  | 'needs_story'
  | 'complete'
  | 'all';

const people: {
  value: VaultPerson;
  label: string;
}[] = [
  { value: 'Papa', label: 'Papa' },
  { value: 'Dad', label: 'Dad' },
  { value: 'Mom', label: 'Mom / Ivy' },
];

function isTranscribed(recording: Recording) {
  return (
    recording.transcription_status === 'complete' &&
    !!recording.transcript?.trim()
  );
}

function hasStory(recording: Recording) {
  return (
    recording.story_status === 'complete' &&
    !!recording.story_chapter?.trim()
  );
}

function personFromUrl(): VaultPerson {
  if (typeof window === 'undefined') return 'Dad';

  const value =
    new URLSearchParams(window.location.search).get('person');

  if (
    value === 'Papa' ||
    value === 'Dad' ||
    value === 'Mom'
  ) {
    return value;
  }

  return 'Dad';
}

export default function NeedsReviewPage() {
  const [checkingAccess, setCheckingAccess] =
    useState(true);

  const [isAdmin, setIsAdmin] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [recordings, setRecordings] =
    useState<Recording[]>([]);

  const [person, setPerson] =
    useState<VaultPerson>('Dad');

  const [filter, setFilter] =
    useState<Filter>('needs_attention');

  const [message, setMessage] =
    useState<string | null>(null);

  useEffect(() => {
    const initialPerson = personFromUrl();
    setPerson(initialPerson);

    void start();
  }, []);

  async function start() {
    setCheckingAccess(true);
    setLoading(true);

    try {
      const memberResponse = await fetch(
        '/api/cloudflare/member',
        {
          cache: 'no-store',
        },
      );

      const memberData =
        (await memberResponse.json()) as {
          member?: {
            isAdmin: boolean;
          };
          error?: string;
        };

      if (
        !memberResponse.ok ||
        !memberData.member
      ) {
        setIsAdmin(false);
        return;
      }

      if (!memberData.member.isAdmin) {
        setIsAdmin(false);
        return;
      }

      setIsAdmin(true);

      const recordingsResponse =
        await fetch(
          '/api/cloudflare/recordings',
          {
            cache: 'no-store',
          },
        );

      const recordingsData =
        (await recordingsResponse.json()) as {
          recordings?: Recording[];
          error?: string;
        };

      if (!recordingsResponse.ok) {
        throw new Error(
          recordingsData.error ||
            'Could not load the recordings.',
        );
      }

      setRecordings(
        recordingsData.recordings || [],
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not load the Needs Review list.',
      );
    } finally {
      setCheckingAccess(false);
      setLoading(false);
    }
  }

  function selectPerson(value: VaultPerson) {
    setPerson(value);
    setFilter('needs_attention');

    const url = new URL(
      window.location.href,
    );

    url.searchParams.set(
      'person',
      value,
    );

    window.history.replaceState(
      {},
      '',
      url,
    );
  }

  const personRecordings =
    useMemo(
      () =>
        recordings.filter(
          (recording) =>
            recording.vault_person ===
            person,
        ),
      [recordings, person],
    );

  const counts = useMemo(() => {
    const needsTranscription =
      personRecordings.filter(
        (recording) =>
          !isTranscribed(recording),
      ).length;

    const needsStory =
      personRecordings.filter(
        (recording) =>
          isTranscribed(recording) &&
          !hasStory(recording),
      ).length;

    const complete =
      personRecordings.filter(
        (recording) =>
          isTranscribed(recording) &&
          hasStory(recording),
      ).length;

    const needsAttention =
      personRecordings.filter(
        (recording) =>
          !isTranscribed(recording) ||
          !hasStory(recording),
      ).length;

    return {
      needsTranscription,
      needsStory,
      complete,
      needsAttention,
    };
  }, [personRecordings]);

  const visibleRecordings =
    useMemo(() => {
      return personRecordings.filter(
        (recording) => {
          const transcribed =
            isTranscribed(recording);

          const storyComplete =
            hasStory(recording);

          if (
            filter ===
            'needs_transcription'
          ) {
            return !transcribed;
          }

          if (filter === 'needs_story') {
            return (
              transcribed &&
              !storyComplete
            );
          }

          if (filter === 'complete') {
            return (
              transcribed &&
              storyComplete
            );
          }

          if (
            filter ===
            'needs_attention'
          ) {
            return (
              !transcribed ||
              !storyComplete
            );
          }

          return true;
        },
      );
    }, [
      personRecordings,
      filter,
    ]);

  if (
    checkingAccess ||
    loading
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] text-stone-700">
        <Loader2 className="h-7 w-7 animate-spin text-[#a66b27]" />
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] p-5 text-stone-800">
        <div className="w-full max-w-md rounded-3xl border border-stone-300 bg-[#fffaf0] p-8 text-center shadow-xl">
          <ShieldCheck className="mx-auto h-10 w-10 text-[#a66b27]" />

          <h1 className="mt-4 font-serif text-3xl text-stone-900">
            Needs Review is private
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Only Vault administrators
            can view this work list.
          </p>

          <a
            href="/"
            className="mt-6 inline-flex rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white hover:bg-[#293127]"
          >
            Return to the vault
          </a>
        </div>
      </main>
    );
  }

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
            <AlertCircle className="h-9 w-9 text-[#a66b27]" />

            {person === 'Mom'
              ? 'Mom / Ivy'
              : person}{' '}
            Needs Review
          </h1>

          <p className="mt-3 max-w-2xl text-stone-600">
            See which recordings still
            need a word-for-word transcript
            or family story.
          </p>
        </header>

        {message && (
          <div className="mt-7 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {message}
          </div>
        )}

        <section className="mt-7">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">
            Choose a vault
          </p>

          <div className="flex flex-wrap gap-2">
            {people.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  selectPerson(
                    option.value,
                  )
                }
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
                  person === option.value
                    ? 'bg-[#3b4536] text-white'
                    : 'border border-stone-300 bg-white text-stone-700 hover:border-[#a66b27]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() =>
              setFilter(
                'needs_attention',
              )
            }
            className={`rounded-2xl border p-4 text-left ${
              filter ===
              'needs_attention'
                ? 'border-[#a66b27] bg-[#fbf3e3]'
                : 'border-stone-300 bg-[#fffaf0]'
            }`}
          >
            <p className="text-sm font-semibold text-stone-700">
              Needs attention
            </p>

            <p className="mt-1 font-serif text-3xl text-stone-900">
              {counts.needsAttention}
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setFilter(
                'needs_transcription',
              )
            }
            className={`rounded-2xl border p-4 text-left ${
              filter ===
              'needs_transcription'
                ? 'border-[#a66b27] bg-[#fbf3e3]'
                : 'border-stone-300 bg-[#fffaf0]'
            }`}
          >
            <p className="text-sm font-semibold text-stone-700">
              Needs transcript
            </p>

            <p className="mt-1 font-serif text-3xl text-stone-900">
              {counts.needsTranscription}
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setFilter(
                'needs_story',
              )
            }
            className={`rounded-2xl border p-4 text-left ${
              filter ===
              'needs_story'
                ? 'border-[#a66b27] bg-[#fbf3e3]'
                : 'border-stone-300 bg-[#fffaf0]'
            }`}
          >
            <p className="text-sm font-semibold text-stone-700">
              Needs story
            </p>

            <p className="mt-1 font-serif text-3xl text-stone-900">
              {counts.needsStory}
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setFilter('complete')
            }
            className={`rounded-2xl border p-4 text-left ${
              filter === 'complete'
                ? 'border-[#a66b27] bg-[#fbf3e3]'
                : 'border-stone-300 bg-[#fffaf0]'
            }`}
          >
            <p className="text-sm font-semibold text-stone-700">
              Complete
            </p>

            <p className="mt-1 font-serif text-3xl text-stone-900">
              {counts.complete}
            </p>
          </button>
        </section>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() =>
              setFilter('all')
            }
            className="text-sm font-semibold text-stone-600 hover:text-[#8a561f]"
          >
            Show all{' '}
            {person === 'Mom'
              ? 'Mom / Ivy'
              : person}{' '}
            recordings
          </button>
        </div>

        <section className="mt-7 space-y-3">
          {visibleRecordings.map(
            (recording) => {
              const transcribed =
                isTranscribed(recording);

              const storyComplete =
                hasStory(recording);

              return (
                <article
                  key={recording.id}
                  className="rounded-2xl border border-stone-300 bg-[#fffaf0] p-5 shadow-sm"
                >
                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#a66b27]">
                    {recording.question_number
                      ? `Question ${recording.question_number}`
                      : recording.category ||
                        'Recording'}
                  </p>

                  <h2 className="mt-2 font-serif text-xl text-stone-900">
                    {recording.question_text ||
                      recording.title}
                  </h2>

                  {recording.question_text &&
                    recording.title !==
                      recording.question_text && (
                      <p className="mt-1 text-sm text-stone-500">
                        {recording.title}
                      </p>
                    )}

                  <p className="mt-2 text-sm text-stone-500">
                    {recording.speaker}
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div
                      className={`rounded-xl border p-3 ${
                        transcribed
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-amber-200 bg-amber-50'
                      }`}
                    >
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        {transcribed ? (
                          <CheckCircle className="h-4 w-4 text-emerald-700" />
                        ) : (
                          <FileText className="h-4 w-4 text-amber-700" />
                        )}

                        Transcript
                      </p>

                      <p className="mt-1 text-sm">
                        {transcribed
                          ? 'Complete'
                          : 'Needs transcription'}
                      </p>
                    </div>

                    <div
                      className={`rounded-xl border p-3 ${
                        storyComplete
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-amber-200 bg-amber-50'
                      }`}
                    >
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        {storyComplete ? (
                          <CheckCircle className="h-4 w-4 text-emerald-700" />
                        ) : (
                          <Sparkles className="h-4 w-4 text-amber-700" />
                        )}

                        Family story
                      </p>

                      <p className="mt-1 text-sm">
                        {storyComplete
                          ? 'Complete'
                          : 'Needs story'}
                      </p>
                    </div>
                  </div>

                  {!transcribed && (
                    <a
                      href={`/admin?trackId=${recording.id}`}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#3b4536] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#293127]"
                    >
                      <FileText className="h-4 w-4" />
                      Create Transcript
                    </a>
                  )}

                  {transcribed &&
                    !storyComplete && (
                      <a
                        href={`/admin?trackId=${recording.id}`}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#80542a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#65431f]"
                      >
                        <Sparkles className="h-4 w-4" />
                        Create Story
                      </a>
                    )}

                  {transcribed &&
                    storyComplete && (
                      <a
                        href={`/admin?trackId=${recording.id}`}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:border-[#a66b27]"
                      >
                        <Wrench className="h-4 w-4" />
                        Open in Story Studio
                      </a>
                    )}
                </article>
              );
            },
          )}

          {!visibleRecordings.length && (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-[#fffaf0] p-8 text-center">
              <CheckCircle className="mx-auto h-8 w-8 text-[#3b4536]" />

              <p className="mt-3 font-semibold text-stone-800">
                {person === 'Mom'
                  ? 'Mom / Ivy'
                  : person}{' '}
                has nothing in this view.
              </p>

              <p className="mt-1 text-sm text-stone-600">
                Choose another status above
                or switch to another vault.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

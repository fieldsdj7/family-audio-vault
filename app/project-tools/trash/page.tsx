'use client';

import { useEffect, useState } from 'react';

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

type Track = {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: string | null;
  created_at: string;
  trashed_at: string | null;
  transcript: string | null;
  story_chapter: string | null;
};

function personName(
  person: string | null,
) {
  if (person === 'Papa') {
    return 'Papa — Bill';
  }

  if (person === 'Dad') {
    return 'Dad — Dan';
  }

  if (person === 'Mom') {
    return 'Mom — Ivy';
  }

  return person || 'Unknown';
}

async function readJson<T>(
  response: Response,
): Promise<T> {
  const contentType =
    response.headers.get(
      'content-type',
    ) || '';

  if (
    !contentType.includes(
      'application/json',
    )
  ) {
    throw new Error(
      `The server returned an unexpected response (${response.status}).`,
    );
  }

  return response.json() as Promise<T>;
}

export default function TrashPage() {
  const [
    checkingAccess,
    setCheckingAccess,
  ] = useState(true);

  const [
    isAdmin,
    setIsAdmin,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    tracks,
    setTracks,
  ] = useState<Track[]>([]);

  const [
    workingId,
    setWorkingId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    message,
    setMessage,
  ] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    void start();
  }, []);

  async function start() {
    setCheckingAccess(true);

    try {
      const response =
        await fetch(
          '/api/cloudflare/member',
          {
            cache: 'no-store',
          },
        );

      const data =
        await readJson<{
          member?: {
            isAdmin: boolean;
          };
        }>(response);

      const allowed =
        response.ok &&
        !!data.member?.isAdmin;

      setIsAdmin(allowed);

      if (allowed) {
        await loadTrash();
      } else {
        setLoading(false);
      }
    } catch {
      setIsAdmin(false);
      setLoading(false);
    } finally {
      setCheckingAccess(false);
    }
  }

  async function loadTrash() {
    setLoading(true);

    try {
      const response =
        await fetch(
          '/api/cloudflare/trash',
          {
            cache: 'no-store',
          },
        );

      const data =
        await readJson<{
          recordings?: Track[];
          tracks?: Track[];
          error?: string;
        }>(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Could not load Trash.',
        );
      }

      const nextTracks =
        data.recordings ||
        data.tracks ||
        [];

      setTracks(nextTracks);
    } catch (error) {
      setTracks([]);

      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Could not load Trash.',
      });
    } finally {
      setLoading(false);
    }
  }

  async function perform(
    track: Track,
    action:
      | 'restore'
      | 'permanent',
  ) {
    const permanent =
      action === 'permanent';

    const displayPerson =
      personName(
        track.vault_person,
      );

    const prompt = permanent
      ? `Permanently remove “${track.title}”?\n\nThis erases its original audio, transcript, family story, and linked organizing information. This cannot be undone.`
      : `Restore “${track.title}” to the ${displayPerson} Vault?\n\nIts audio, transcript, story, and links will return exactly as they were.`;

    if (
      !window.confirm(prompt)
    ) {
      return;
    }

    if (
      permanent &&
      !window.confirm(
        'This is permanent. Remove this recording forever?',
      )
    ) {
      return;
    }

    setWorkingId(
      `${track.id}-${action}`,
    );

    setMessage(null);

    try {
      const response =
        await fetch(
          '/api/cloudflare/trash',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              trackId: track.id,
              action,
            }),
          },
        );

      const result =
        await readJson<{
          error?: string;
          restored?: boolean;
          permanentlyDeleted?: boolean;
          success?: boolean;
        }>(response);

      if (!response.ok) {
        throw new Error(
          result.error ||
            'The change could not be saved.',
        );
      }

      setTracks(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              track.id,
          ),
      );

      setMessage({
        type: 'success',

        text: permanent
          ? `“${track.title}” was permanently removed.`
          : `“${track.title}” was restored to the ${displayPerson} Vault.`,
      });
    } catch (error) {
      setMessage({
        type: 'error',

        text:
          error instanceof Error
            ? error.message
            : 'The change could not be saved.',
      });
    } finally {
      setWorkingId(null);
    }
  }

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
            Trash is private
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Only Vault administrators can restore or permanently remove recordings.
          </p>

          <a
            href="/"
            className="mt-6 inline-flex rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white"
          >
            Return to the Vault
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
            <Trash2 className="h-9 w-9 text-[#a66b27]" />
            Trash & Restore
          </h1>

          <p className="mt-3 max-w-2xl text-stone-600">
            Removing a recording hides it from the family Vault but keeps its original audio, transcript, story, and information here until you decide what to do.
          </p>
        </header>

        {message && (
          <div
            className={`mt-7 flex gap-2 rounded-xl border p-4 text-sm ${
              message.type ===
              'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {message.type ===
            'success' ? (
              <CheckCircle className="h-5 w-5 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0" />
            )}

            {message.text}
          </div>
        )}

        <section className="mt-8 rounded-3xl border border-[#ddc79f] bg-[#fbf3e3] p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">
            Recovery first
          </p>

          <h2 className="mt-2 font-serif text-3xl text-stone-900">
            {tracks.length === 0
              ? 'Trash is empty'
              : `${tracks.length} ${
                  tracks.length === 1
                    ? 'recording'
                    : 'recordings'
                } in Trash`}
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            Restore puts everything back. Permanent removal is deliberately separate and asks twice before anything is erased forever.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          {tracks.map(
            (track) => {
              const restoring =
                workingId ===
                `${track.id}-restore`;

              const deleting =
                workingId ===
                `${track.id}-permanent`;

              return (
                <article
                  key={track.id}
                  className="rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm"
                >
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#a66b27]">
                        {personName(
                          track.vault_person,
                        )}
                        {' · '}
                        moved to Trash{' '}
                        {track.trashed_at
                          ? new Date(
                              track.trashed_at,
                            ).toLocaleDateString()
                          : ''}
                      </p>

                      <h2 className="mt-2 font-serif text-2xl text-stone-900">
                        {track.title}
                      </h2>

                      <p className="mt-2 text-sm text-stone-600">
                        {track.speaker}
                        {' · '}
                        {track.category ||
                          'General'}
                        {' · '}
                        Added{' '}
                        {new Date(
                          track.created_at,
                        ).toLocaleDateString()}
                      </p>

                      <p className="mt-3 text-sm text-stone-600">
                        {track.transcript?.trim()
                          ? 'Transcript saved'
                          : 'No transcript'}
                        {' · '}
                        {track.story_chapter?.trim()
                          ? 'Family story saved'
                          : 'No family story'}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void perform(
                            track,
                            'restore',
                          )
                        }
                        disabled={
                          !!workingId
                        }
                        className="inline-flex items-center gap-2 rounded-xl bg-[#3b4536] px-3 py-2 text-sm font-semibold text-white disabled:bg-stone-400"
                      >
                        {restoring ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4" />
                        )}

                        {restoring
                          ? 'Restoring…'
                          : 'Restore'}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void perform(
                            track,
                            'permanent',
                          )
                        }
                        disabled={
                          !!workingId
                        }
                        className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 disabled:opacity-60"
                      >
                        {deleting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}

                        {deleting
                          ? 'Removing…'
                          : 'Permanently remove'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            },
          )}

          {tracks.length ===
            0 && (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-[#fffaf0] p-10 text-center">
              <CheckCircle className="mx-auto h-9 w-9 text-emerald-700" />

              <h2 className="mt-3 font-serif text-2xl text-stone-900">
                Nothing needs recovery
              </h2>

              <p className="mt-2 text-sm text-stone-600">
                When an administrator moves a recording to Trash, it will appear here instead of being erased.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

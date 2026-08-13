'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Headphones,
  Loader2,
  Mic2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-react';

type VoiceReference = {
  id: string;
  display_name: string;
  storage_path: string;
  mime_type: string;
  duration_seconds: number | null;
  created_at?: string;
  updated_at?: string;
};

type Message = {
  type: 'success' | 'error';
  text: string;
};

async function readAudioDuration(
  file: File,
) {
  return new Promise<number>(
    (resolve, reject) => {
      const url =
        URL.createObjectURL(file);

      const audio =
        document.createElement('audio');

      let settled = false;

      const cleanup = () => {
        audio.removeAttribute('src');
        audio.load();
        URL.revokeObjectURL(url);
      };

      const finish = (
        value: number,
      ) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      const fail = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(
          new Error(
            'The length of that audio sample could not be read.',
          ),
        );
      };

      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        if (
          Number.isFinite(
            audio.duration,
          )
        ) {
          finish(audio.duration);
        } else {
          fail();
        }
      };
      audio.onerror = fail;
      audio.src = url;
      audio.load();

      window.setTimeout(
        fail,
        15000,
      );
    },
  );
}

function formatDuration(
  seconds: number | null,
) {
  if (
    seconds === null ||
    !Number.isFinite(seconds)
  ) {
    return 'Length not stored';
  }

  return `${seconds.toFixed(1)} sec`;
}

export default function VoiceReferencesPage() {
  const [checkingAccess, setCheckingAccess] =
    useState(true);
  const [isAdmin, setIsAdmin] =
    useState(false);

  const [references, setReferences] =
    useState<VoiceReference[]>([]);
  const [loading, setLoading] =
    useState(false);

  const [displayName, setDisplayName] =
    useState('');
  const [file, setFile] =
    useState<File | null>(null);
  const [fileInputKey, setFileInputKey] =
    useState(0);
  const [sampleDuration, setSampleDuration] =
    useState<number | null>(null);
  const [checkingDuration, setCheckingDuration] =
    useState(false);
  const [uploading, setUploading] =
    useState(false);
  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState<Message | null>(null);

  useEffect(() => {
    void start();
  }, []);

  const sortedReferences =
    useMemo(
      () =>
        [...references].sort(
          (a, b) =>
            a.display_name.localeCompare(
              b.display_name,
            ),
        ),
      [references],
    );

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
        (await response.json()) as {
          member?: {
            isAdmin?: boolean;
          };
        };

      const allowed =
        response.ok &&
        !!data.member?.isAdmin;

      setIsAdmin(allowed);

      if (allowed) {
        await loadReferences();
      }
    } catch {
      setIsAdmin(false);
    } finally {
      setCheckingAccess(false);
    }
  }

  async function loadReferences() {
    setLoading(true);

    try {
      const response =
        await fetch(
          '/api/cloudflare/voice-references',
          {
            cache: 'no-store',
          },
        );

      const data =
        (await response.json()) as {
          references?: VoiceReference[];
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Voice references could not be loaded.',
        );
      }

      setReferences(
        data.references || [],
      );
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Voice references could not be loaded.',
      });
    } finally {
      setLoading(false);
    }
  }

  async function chooseFile(
    selected: File | null,
  ) {
    setFile(selected);
    setSampleDuration(null);
    setMessage(null);

    if (!selected) {
      return;
    }

    setCheckingDuration(true);

    try {
      const duration =
        await readAudioDuration(
          selected,
        );

      setSampleDuration(
        duration,
      );

      if (
        duration < 2 ||
        duration > 10
      ) {
        setMessage({
          type: 'error',
          text:
            `This sample is ${duration.toFixed(
              1,
            )} seconds long. Use a clean voice sample between 2 and 10 seconds.`,
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'The audio sample could not be checked.',
      });
    } finally {
      setCheckingDuration(false);
    }
  }

  async function uploadReference() {
    const name =
      displayName.trim();

    if (!name) {
      setMessage({
        type: 'error',
        text:
          "Enter the speaker's name.",
      });
      return;
    }

    if (!file) {
      setMessage({
        type: 'error',
        text:
          'Choose a voice sample.',
      });
      return;
    }

    if (
      sampleDuration === null ||
      !Number.isFinite(
        sampleDuration,
      )
    ) {
      setMessage({
        type: 'error',
        text:
          'Wait for the sample length to finish checking.',
      });
      return;
    }

    if (
      sampleDuration < 2 ||
      sampleDuration > 10
    ) {
      setMessage({
        type: 'error',
        text:
          'Use a clean voice sample between 2 and 10 seconds.',
      });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const form =
        new FormData();

      form.append(
        'displayName',
        name,
      );

      form.append(
        'durationSeconds',
        String(sampleDuration),
      );

      form.append(
        'file',
        file,
        file.name,
      );

      const response =
        await fetch(
          '/api/cloudflare/voice-references',
          {
            method: 'POST',
            body: form,
          },
        );

      const data =
        (await response.json()) as {
          reference?: VoiceReference;
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
            'The voice reference could not be saved.',
        );
      }

      setMessage({
        type: 'success',
        text:
          `${name}'s voice reference was saved. Uploading another sample with the same name will replace this one.`,
      });

      setDisplayName('');
      setFile(null);
      setSampleDuration(null);
      setFileInputKey(
        (key) => key + 1,
      );

      await loadReferences();
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'The voice reference could not be saved.',
      });
    } finally {
      setUploading(false);
    }
  }

  async function deleteReference(
    reference: VoiceReference,
  ) {
    const confirmed =
      window.confirm(
        `Delete the saved voice reference for ${reference.display_name}?\n\nThis only deletes the short reference sample. It does not delete any recordings or transcripts.`,
      );

    if (!confirmed) {
      return;
    }

    setDeletingId(
      reference.id,
    );
    setMessage(null);

    try {
      const response =
        await fetch(
          '/api/cloudflare/voice-references',
          {
            method: 'DELETE',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              referenceId:
                reference.id,
            }),
          },
        );

      const data =
        (await response.json()) as {
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
            'The voice reference could not be deleted.',
        );
      }

      setMessage({
        type: 'success',
        text:
          `${reference.display_name}'s voice reference was deleted.`,
      });

      await loadReferences();
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'The voice reference could not be deleted.',
      });
    } finally {
      setDeletingId(null);
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
            Admin access is limited
          </h1>

          <p className="mt-3 text-sm text-stone-600">
            Only Vault administrators can manage saved voice references.
          </p>

          <a
            href="/"
            className="mt-6 inline-flex rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white"
          >
            Return to the vault
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f0e5] p-5 text-stone-800 md:p-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href="/project-tools"
            className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-[#8a561f]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Project Tools
          </a>

          <a
            href="/admin"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#8a561f]"
          >
            <Wrench className="h-4 w-4" />
            Story Studio
          </a>
        </div>

        <header className="mt-6 border-b border-stone-300 pb-7">
          <p className="text-xs font-semibold uppercase tracking-[.22em] text-[#a66b27]">
            Project Tools
          </p>

          <h1 className="mt-2 font-serif text-4xl text-stone-900 md:text-5xl">
            Voice References
          </h1>

          <p className="mt-3 text-stone-600">
            Save a short, clean sample of a regular speaker so future
            transcriptions can recognize that person by voice.
          </p>
        </header>

        {message && (
          <div
            className={`mt-6 flex gap-3 rounded-xl border p-4 text-sm ${
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

        <section className="mt-8 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
          <div className="flex items-center gap-2">
            <Mic2 className="h-5 w-5 text-[#a66b27]" />

            <h2 className="font-serif text-2xl text-stone-900">
              Add a Speaker
            </h2>
          </div>

          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Use a <strong>2–10 second</strong> clip with only that person
            speaking. Avoid music, background TV, overlapping voices,
            long silence, or another person talking in the same clip.
            About 5–8 seconds of clear speech is ideal.
          </div>

          <div className="mt-6">
            <label className="mb-1.5 block text-sm font-semibold">
              Speaker name
            </label>

            <input
              value={displayName}
              onChange={(event) =>
                setDisplayName(
                  event.target.value,
                )
              }
              placeholder="Example: Bill"
              className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]"
            />
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center gap-2">
              <Headphones className="h-4 w-4 text-[#a66b27]" />

              <label className="text-sm font-semibold">
                Voice sample
              </label>
            </div>

            <input
              key={fileInputKey}
              type="file"
              accept="audio/*"
              onChange={(event) =>
                void chooseFile(
                  event.target.files?.[0] ||
                    null,
                )
              }
              className="w-full rounded-xl border border-dashed border-stone-400 bg-white px-4 py-3"
            />

            {file && (
              <div className="mt-3 rounded-xl bg-stone-100 p-3 text-sm text-stone-600">
                <p>
                  <span className="font-semibold text-stone-800">
                    {file.name}
                  </span>
                </p>

                <p className="mt-1">
                  {checkingDuration
                    ? 'Checking sample length…'
                    : sampleDuration !==
                        null
                      ? `Length: ${sampleDuration.toFixed(
                          1,
                        )} seconds`
                      : 'Length unavailable'}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              void uploadReference()
            }
            disabled={
              uploading ||
              checkingDuration ||
              !displayName.trim() ||
              !file ||
              sampleDuration === null ||
              sampleDuration < 2 ||
              sampleDuration > 10
            }
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3.5 font-semibold text-white disabled:bg-stone-400"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Upload className="h-5 w-5" />
            )}

            {uploading
              ? 'Saving voice reference…'
              : 'Save Voice Reference'}
          </button>

          <p className="mt-3 text-xs text-stone-500">
            If a reference with the same speaker name already exists,
            this upload replaces the old sample.
          </p>
        </section>

        <section className="mt-10 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">
                Saved Speakers
              </p>

              <h2 className="mt-2 font-serif text-3xl text-stone-900">
                Voice Library
              </h2>

              <p className="mt-2 text-sm text-stone-600">
                These references will be available to the transcription system.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadReferences()
              }
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  loading
                    ? 'animate-spin'
                    : ''
                }`}
              />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="mt-6 flex items-center gap-2 rounded-xl bg-stone-100 p-4 text-sm text-stone-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading voice references…
            </div>
          ) : sortedReferences.length ? (
            <div className="mt-6 space-y-3">
              {sortedReferences.map(
                (reference) => (
                  <div
                    key={reference.id}
                    className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-serif text-xl text-stone-900">
                        {reference.display_name}
                      </p>

                      <p className="mt-1 text-sm text-stone-500">
                        {formatDuration(
                          reference.duration_seconds,
                        )}
                        {' · '}
                        {reference.mime_type ||
                          'audio'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void deleteReference(
                          reference,
                        )
                      }
                      disabled={
                        deletingId ===
                        reference.id
                      }
                      className="inline-flex w-fit items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
                    >
                      {deletingId ===
                      reference.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}

                      Delete
                    </button>
                  </div>
                ),
              )}
            </div>
          ) : (
            <p className="mt-6 rounded-xl bg-stone-100 p-4 text-sm text-stone-500">
              No voice references have been saved yet.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

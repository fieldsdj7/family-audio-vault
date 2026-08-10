'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Database,
  Download,
  FileAudio,
  FileText,
  Gauge,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

type HealthResponse = {
  checkedAt: string;
  healthy: boolean;

  collection: {
    totalRecordings: number;
    activeRecordings: number;
    trashedRecordings: number;
    splitMasters: number;
    transcripts: number;
    stories: number;
    questions: number;
    activeMembers: number;
  };

  storage: {
    objectCount: number;
    totalBytes: number;
    referencedAudioFileCount: number;
    referencedPhotoCount: number;
    missingAudio: string[];
    missingPhotos: string[];
    orphanedObjects: string[];
  };

  backups: Array<{
    id: number;
    createdAt: string;
    createdBy: string;
    recordingCount: number;
    audioFileCount: number;
    missingAudioCount: number;
    sizeBytes: number;
  }>;
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = [
    'B',
    'KB',
    'MB',
    'GB',
    'TB',
  ];

  const index = Math.min(
    Math.floor(
      Math.log(bytes) /
        Math.log(1024),
    ),
    units.length - 1,
  );

  const value =
    bytes /
    1024 ** index;

  return `${value.toFixed(
    index === 0
      ? 0
      : value >= 10
        ? 1
        : 2,
  )} ${units[index]}`;
}

function formatDate(value: string) {
  if (!value) return 'Unknown';

  const normalized =
    value.includes('T')
      ? value
      : `${value.replace(' ', 'T')}Z`;

  const date =
    new Date(normalized);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return date.toLocaleString();
}

export default function VaultHealthPage() {
  const [checkingAccess, setCheckingAccess] =
    useState(true);

  const [isAdmin, setIsAdmin] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [backingUp, setBackingUp] =
    useState(false);

  const [health, setHealth] =
    useState<HealthResponse | null>(null);

  const [message, setMessage] =
    useState<{
      type: 'success' | 'error';
      text: string;
    } | null>(null);

  useEffect(() => {
    void start();
  }, []);

  async function start() {
    setCheckingAccess(true);

    try {
      const memberResponse =
        await fetch(
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
        };

      const allowed =
        memberResponse.ok &&
        !!memberData.member?.isAdmin;

      setIsAdmin(allowed);

      if (allowed) {
        await loadHealth();
      }
    } catch {
      setIsAdmin(false);
    } finally {
      setCheckingAccess(false);
    }
  }

  async function loadHealth() {
    setLoading(true);
    setMessage(null);

    try {
      const response =
        await fetch(
          '/api/cloudflare/health',
          {
            cache: 'no-store',
          },
        );

      const data =
        (await response.json()) as
          | HealthResponse
          | {
              error?: string;
            };

      if (
        !response.ok ||
        !('collection' in data)
      ) {
        throw new Error(
          'error' in data &&
          data.error
            ? data.error
            : 'Could not check Vault health.',
        );
      }

      setHealth(data);
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Could not check Vault health.',
      });
    } finally {
      setLoading(false);
    }
  }

  async function downloadBackup() {
    setBackingUp(true);
    setMessage(null);

    try {
      const response =
        await fetch(
          '/api/cloudflare/backup',
        );

      if (!response.ok) {
        const result =
          (await response
            .json()
            .catch(
              () => null,
            )) as {
            error?: string;
          } | null;

        throw new Error(
          result?.error ||
            'The backup could not be created.',
        );
      }

      const blob =
        await response.blob();

      const disposition =
        response.headers.get(
          'content-disposition',
        ) || '';

      const match =
        disposition.match(
          /filename="?([^"]+)"?/i,
        );

      const filename =
        match?.[1] ||
        `fields-family-vault-backup-${new Date()
          .toISOString()
          .slice(0, 10)}.zip`;

      const url =
        URL.createObjectURL(
          blob,
        );

      const link =
        document.createElement(
          'a',
        );

      link.href = url;
      link.download =
        filename;

      document.body.appendChild(
        link,
      );

      link.click();
      link.remove();

      window.setTimeout(
        () =>
          URL.revokeObjectURL(
            url,
          ),
        1000,
      );

      setMessage({
        type: 'success',
        text:
          'Full Vault backup created and downloaded.',
      });

      await loadHealth();
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'The backup could not be created.',
      });
    } finally {
      setBackingUp(false);
    }
  }

  const warningCount =
    useMemo(() => {
      if (!health) return 0;

      return (
        health.storage
          .missingAudio.length +
        health.storage
          .missingPhotos.length +
        health.storage
          .orphanedObjects.length
      );
    }, [health]);

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
            Vault Health is private
          </h1>

          <p className="mt-3 text-sm text-stone-600">
            Only Vault administrators can view storage health and backups.
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
    <main className="min-h-screen bg-[#f6f0e5] p-5 text-stone-800 md:p-10">
      <div className="mx-auto max-w-6xl">
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
            <Gauge className="h-9 w-9 text-[#a66b27]" />
            Vault Health & Backups
          </h1>

          <p className="mt-3 max-w-2xl text-stone-600">
            Check the collection, verify private storage, and create a complete downloadable backup.
          </p>
        </header>

        {message && (
          <div
            className={`mt-7 flex gap-3 rounded-xl border p-4 text-sm ${
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
              <AlertTriangle className="h-5 w-5 shrink-0" />
            )}

            {message.text}
          </div>
        )}

        <section className="mt-7 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() =>
              void loadHealth()
            }
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                loading
                  ? 'animate-spin'
                  : ''
              }`}
            />
            Refresh Health
          </button>

          <button
            type="button"
            onClick={() =>
              void downloadBackup()
            }
            disabled={
              backingUp ||
              loading
            }
            className="inline-flex items-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3 text-sm font-semibold text-white disabled:bg-stone-400"
          >
            {backingUp ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}

            {backingUp
              ? 'Creating Full Backup…'
              : 'Download Full Vault Backup'}
          </button>
        </section>

        {loading && !health ? (
          <div className="mt-10 flex items-center justify-center rounded-2xl border border-stone-300 bg-[#fffaf0] p-12">
            <Loader2 className="h-7 w-7 animate-spin text-[#a66b27]" />
          </div>
        ) : health ? (
          <>
            <section
              className={`mt-7 rounded-2xl border p-5 ${
                health.healthy &&
                warningCount === 0
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-amber-200 bg-amber-50'
              }`}
            >
              <div className="flex items-start gap-3">
                {health.healthy &&
                warningCount === 0 ? (
                  <CheckCircle className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />
                )}

                <div>
                  <h2 className="font-serif text-2xl text-stone-900">
                    {health.healthy &&
                    warningCount === 0
                      ? 'Vault looks healthy'
                      : 'Vault needs attention'}
                  </h2>

                  <p className="mt-1 text-sm text-stone-600">
                    Last checked:{' '}
                    {formatDate(
                      health.checkedAt,
                    )}
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-7">
              <h2 className="font-serif text-2xl text-stone-900">
                Collection
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  icon={FileAudio}
                  label="Active recordings"
                  value={
                    health.collection
                      .activeRecordings
                  }
                />

                <StatCard
                  icon={FileText}
                  label="Transcripts"
                  value={
                    health.collection
                      .transcripts
                  }
                />

                <StatCard
                  icon={Sparkles}
                  label="Stories"
                  value={
                    health.collection
                      .stories
                  }
                />

                <StatCard
                  icon={Database}
                  label="Questions"
                  value={
                    health.collection
                      .questions
                  }
                />
              </div>
            </section>

            <section className="mt-8">
              <h2 className="font-serif text-2xl text-stone-900">
                Storage
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  icon={HardDrive}
                  label="Storage used"
                  value={formatBytes(
                    health.storage
                      .totalBytes,
                  )}
                />

                <StatCard
                  icon={FileAudio}
                  label="Stored objects"
                  value={
                    health.storage
                      .objectCount
                  }
                />

                <StatCard
                  icon={FileAudio}
                  label="Referenced audio"
                  value={
                    health.storage
                      .referencedAudioFileCount
                  }
                />

                <StatCard
                  icon={AlertTriangle}
                  label="Storage warnings"
                  value={
                    warningCount
                  }
                />
              </div>
            </section>

            <section className="mt-8 rounded-2xl border border-stone-300 bg-[#fffaf0] p-5">
              <h2 className="font-serif text-2xl text-stone-900">
                Storage safeguards
              </h2>

              <div className="mt-5 space-y-4">
                <HealthLine
                  label="Missing audio files"
                  items={
                    health.storage
                      .missingAudio
                  }
                />

                <HealthLine
                  label="Missing photos"
                  items={
                    health.storage
                      .missingPhotos
                  }
                />

                <HealthLine
                  label="Orphaned storage objects"
                  items={
                    health.storage
                      .orphanedObjects
                  }
                />
              </div>
            </section>

            <section className="mt-8">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-serif text-2xl text-stone-900">
                    Backup history
                  </h2>

                  <p className="mt-1 text-sm text-stone-600">
                    Each successful full backup is recorded here.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {health.backups.length ? (
                  health.backups.map(
                    (backup) => (
                      <article
                        key={
                          backup.id
                        }
                        className="rounded-2xl border border-stone-300 bg-[#fffaf0] p-5"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-semibold text-stone-900">
                              {formatDate(
                                backup.createdAt,
                              )}
                            </p>

                            <p className="mt-1 text-sm text-stone-600">
                              Created by{' '}
                              {
                                backup.createdBy
                              }
                            </p>
                          </div>

                          <div className="text-sm text-stone-600 sm:text-right">
                            <p>
                              {
                                backup.recordingCount
                              }{' '}
                              recordings ·{' '}
                              {
                                backup.audioFileCount
                              }{' '}
                              audio files
                            </p>

                            <p className="mt-1">
                              {formatBytes(
                                backup.sizeBytes,
                              )}
                              {' · '}
                              {
                                backup.missingAudioCount
                              }{' '}
                              missing audio
                            </p>
                          </div>
                        </div>
                      </article>
                    ),
                  )
                ) : (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-[#fffaf0] p-8 text-center">
                    <Download className="mx-auto h-8 w-8 text-[#a66b27]" />

                    <p className="mt-3 font-semibold text-stone-800">
                      No backups have been recorded yet.
                    </p>

                    <p className="mt-1 text-sm text-stone-600">
                      Use Download Full Vault Backup above to create the first one.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gauge;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-stone-300 bg-[#fffaf0] p-5">
      <Icon className="h-5 w-5 text-[#a66b27]" />

      <p className="mt-3 text-sm font-semibold text-stone-600">
        {label}
      </p>

      <p className="mt-1 font-serif text-3xl text-stone-900">
        {value}
      </p>
    </div>
  );
}

function HealthLine({
  label,
  items,
}: {
  label: string;
  items: string[];
}) {
  const okay =
    items.length === 0;

  return (
    <div
      className={`rounded-xl border p-4 ${
        okay
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-amber-200 bg-amber-50'
      }`}
    >
      <div className="flex items-center gap-2">
        {okay ? (
          <CheckCircle className="h-5 w-5 text-emerald-700" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-700" />
        )}

        <p className="font-semibold text-stone-800">
          {label}:{' '}
          {items.length}
        </p>
      </div>

      {!!items.length && (
        <div className="mt-3 space-y-1 text-xs text-stone-600">
          {items.map(
            (item) => (
              <p
                key={item}
                className="break-all"
              >
                {item}
              </p>
            ),
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  strToU8,
  Zip,
  ZipPassThrough,
} from 'fflate';

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

type BackupTrack = {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: string;
  question_id: string | null;
  storage_path: string | null;
  audio_url: string | null;
  transcript: string | null;
  transcription_status: string;
  transcription_error: string | null;
  story_title: string | null;
  story_chapter: string | null;
  story_status: string;
  story_error: string | null;
  source_track_id: string | null;
  clip_start_seconds: number | null;
  clip_end_seconds: number | null;
  split_notes: string | null;
  is_split_master: number;
  trashed_at: string | null;
  trashed_by: string | null;
  created_at: string;
  updated_at: string;
  speaker_1_name?: string | null;
  speaker_2_name?: string | null;
};

type BackupManifest = {
  createdAt: string;
  createdBy: string;

  metadata: {
    audioTracks: BackupTrack[];
    audioTrackReviews: unknown[];
    questions: unknown[];
    storyPhotos: unknown[];
    vaultMembers: unknown[];
    vaultAccess: unknown[];
    backupHistory: unknown[];
  };

  files: {
    audio: Array<{
      trackId: string;
      title: string;
      storagePath: string;
      downloadUrl: string;
    }>;

    photos: Array<{
      photoId: string;
      audioTrackId: string;
      storagePath: string;
      caption: string | null;
      sortOrder: number;
    }>;
  };
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

function safeFilePart(value: string) {
  return (value || 'untitled')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

function vaultFolderName(
  person: string | null | undefined,
) {
  if (person === 'Papa') {
    return 'Papa - Bill';
  }

  if (person === 'Dad') {
    return 'Dad - Dan';
  }

  if (person === 'Mom') {
    return 'Mom - Ivy';
  }

  return safeFilePart(
    person || 'Unknown',
  );
}

function fileExtension(
  path: string,
  fallback = 'audio',
) {
  const cleanPath =
    path.split('?')[0];

  const fileName =
    cleanPath.split('/').pop() || '';

  const dot =
    fileName.lastIndexOf('.');

  if (
    dot < 0 ||
    dot === fileName.length - 1
  ) {
    return fallback;
  }

  return fileName
    .slice(dot + 1)
    .toLowerCase();
}

function addTextFile(
  zip: Zip,
  name: string,
  text: string,
) {
  const entry =
    new ZipPassThrough(name);

  zip.add(entry);

  entry.push(
    strToU8(text),
    true,
  );
}

async function addResponseToZip(
  zip: Zip,
  name: string,
  response: Response,
) {
  if (!response.body) {
    throw new Error(
      `Could not read ${name}.`,
    );
  }

  const entry =
    new ZipPassThrough(name);

  zip.add(entry);

  const reader =
    response.body.getReader();

  while (true) {
    const {
      done,
      value,
    } = await reader.read();

    if (done) {
      entry.push(
        new Uint8Array(0),
        true,
      );

      break;
    }

    if (
      value &&
      value.byteLength > 0
    ) {
      entry.push(
        value,
        false,
      );
    }
  }
}

async function parseJsonResponse<T>(
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
    const text =
      await response.text();

    throw new Error(
      response.ok
        ? 'The server returned an unexpected response.'
        : `Server error ${response.status}: ${
            text
              .replace(/<[^>]*>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 160) ||
            response.statusText
          }`,
    );
  }

  return response.json() as Promise<T>;
}

export default function VaultHealthPage() {
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
    backingUp,
    setBackingUp,
  ] = useState(false);

  const [
    backupProgress,
    setBackupProgress,
  ] = useState('');

  const [
    health,
    setHealth,
  ] =
    useState<HealthResponse | null>(
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
      const memberResponse =
        await fetch(
          '/api/cloudflare/member',
          {
            cache: 'no-store',
          },
        );

      const memberData =
        await parseJsonResponse<{
          member?: {
            isAdmin: boolean;
          };
        }>(memberResponse);

      const allowed =
        memberResponse.ok &&
        !!memberData.member
          ?.isAdmin;

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

    try {
      const response =
        await fetch(
          '/api/cloudflare/health',
          {
            cache: 'no-store',
          },
        );

      const data =
        await parseJsonResponse<
          | HealthResponse
          | {
              error?: string;
            }
        >(response);

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

  async function recordCompletedBackup({
    recordingCount,
    audioFileCount,
    missingAudioCount,
    backupSizeBytes,
  }: {
    recordingCount: number;
    audioFileCount: number;
    missingAudioCount: number;
    backupSizeBytes: number;
  }) {
    const response =
      await fetch(
        '/api/cloudflare/backup',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            recordingCount,
            audioFileCount,
            missingAudioCount,
            backupSizeBytes,
          }),
        },
      );

    const result =
      await parseJsonResponse<{
        success?: boolean;
        error?: string;
      }>(response);

    if (
      !response.ok ||
      !result.success
    ) {
      throw new Error(
        result.error ||
          'The backup was created, but its history entry could not be recorded.',
      );
    }
  }

  async function downloadBackup() {
    setBackingUp(true);
    setMessage(null);

    setBackupProgress(
      'Preparing backup…',
    );

    try {
      const manifestResponse =
        await fetch(
          '/api/cloudflare/backup',
          {
            cache: 'no-store',
          },
        );

      const manifest =
        await parseJsonResponse<
          | BackupManifest
          | {
              error?: string;
            }
        >(manifestResponse);

      if (
        !manifestResponse.ok ||
        !('metadata' in manifest)
      ) {
        throw new Error(
          'error' in manifest &&
          manifest.error
            ? manifest.error
            : 'The backup manifest could not be created.',
        );
      }

      if (
        manifest.files.photos.length >
        0
      ) {
        throw new Error(
          'This Vault contains story photos. Photo-file backup support must be enabled before a complete backup can be created.',
        );
      }

      const zipChunks:
        Uint8Array[] = [];

      let zipError:
        Error | null = null;

      let zipFinished:
        (() => void) | null =
        null;

      const zipFinishedPromise =
        new Promise<void>(
          (resolve) => {
            zipFinished =
              resolve;
          },
        );

      const zip =
        new Zip(
          (
            error,
            data,
            final,
          ) => {
            if (error) {
              zipError =
                error instanceof
                Error
                  ? error
                  : new Error(
                      'ZIP creation failed.',
                    );

              zipFinished?.();

              return;
            }

            if (
              data &&
              data.byteLength > 0
            ) {
              zipChunks.push(data);
            }

            if (final) {
              zipFinished?.();
            }
          },
        );

      addTextFile(
        zip,
        'START-HERE.txt',
        [
          'FIELDS FAMILY VAULT — FULL BACKUP',
          '',
          `Backup created: ${manifest.createdAt}`,
          `Created by: ${manifest.createdBy}`,
          '',
          'This ZIP is intended to preserve the family archive even if the website',
          'is no longer available.',
          '',
          'WHAT IS INCLUDED',
          '',
          'audio/',
          '  Original audio files organized by family member.',
          '',
          'transcripts/',
          '  Readable word-for-word transcript files organized by family member.',
          '',
          'stories/',
          '  Readable family-story files organized by family member.',
          '',
          'metadata/',
          '  Complete database information in JSON format.',
          '',
          'FAMILY MEMBER LABELS',
          '',
          'Papa - Bill',
          'Dad - Dan',
          'Mom - Ivy',
          '',
          'Nothing in the live Vault was removed or changed by creating this backup.',
        ].join('\n'),
      );

      addTextFile(
        zip,
        'metadata/audio_tracks.json',
        JSON.stringify(
          manifest.metadata
            .audioTracks,
          null,
          2,
        ),
      );

      addTextFile(
        zip,
        'metadata/audio_track_reviews.json',
        JSON.stringify(
          manifest.metadata
            .audioTrackReviews,
          null,
          2,
        ),
      );

      addTextFile(
        zip,
        'metadata/questions.json',
        JSON.stringify(
          manifest.metadata
            .questions,
          null,
          2,
        ),
      );

      addTextFile(
        zip,
        'metadata/story_photos.json',
        JSON.stringify(
          manifest.metadata
            .storyPhotos,
          null,
          2,
        ),
      );

      addTextFile(
        zip,
        'metadata/vault_members.json',
        JSON.stringify(
          manifest.metadata
            .vaultMembers,
          null,
          2,
        ),
      );

      addTextFile(
        zip,
        'metadata/vault_access.json',
        JSON.stringify(
          manifest.metadata
            .vaultAccess,
          null,
          2,
        ),
      );

      addTextFile(
        zip,
        'metadata/vault_backup_history.json',
        JSON.stringify(
          manifest.metadata
            .backupHistory,
          null,
          2,
        ),
      );

      const tracks =
        manifest.metadata
          .audioTracks;

      for (
        let index = 0;
        index < tracks.length;
        index += 1
      ) {
        const track =
          tracks[index];

        const date =
          new Date(
            track.created_at,
          );

        const datePart =
          Number.isNaN(
            date.getTime(),
          )
            ? 'unknown-date'
            : date
                .toISOString()
                .slice(0, 10);

        const baseName =
          `${String(
            index + 1,
          ).padStart(
            3,
            '0',
          )}-` +
          `${datePart}-${safeFilePart(
            track.title,
          )}`;

        const vaultFolder =
          vaultFolderName(
            track.vault_person,
          );

        addTextFile(
          zip,
          `transcripts/${vaultFolder}/${baseName}.txt`,
          [
            `Title: ${track.title}`,
            `Vault: ${track.vault_person}`,
            `Speaker: ${track.speaker}`,
            `Speaker 1: ${
              track.speaker_1_name ||
              'Not specified'
            }`,
            `Speaker 2: ${
              track.speaker_2_name ||
              'Not specified'
            }`,
            `Category: ${
              track.category ||
              'General'
            }`,
            `Created: ${track.created_at}`,
            `Question ID: ${
              track.question_id ||
              'None'
            }`,
            `Source Track ID: ${
              track.source_track_id ||
              'None'
            }`,
            `Clip Start: ${
              track.clip_start_seconds ===
              null
                ? 'None'
                : `${track.clip_start_seconds} seconds`
            }`,
            `Clip End: ${
              track.clip_end_seconds ===
              null
                ? 'None'
                : `${track.clip_end_seconds} seconds`
            }`,
            '',
            track.transcript ||
              '[No transcript saved]',
          ].join('\n'),
        );

        if (
          track.story_title ||
          track.story_chapter
        ) {
          addTextFile(
            zip,
            `stories/${vaultFolder}/${baseName}.txt`,
            [
              `Title: ${
                track.story_title ||
                track.title
              }`,
              `Source recording: ${track.title}`,
              `Vault: ${track.vault_person}`,
              `Created: ${track.created_at}`,
              '',
              track.story_chapter ||
                '[No family story saved]',
            ].join('\n'),
          );
        }
      }

      const seenStorage =
        new Set<string>();

      let includedAudio =
        0;

      const missingAudio:
        string[] = [];

      for (
        let index = 0;
        index <
        manifest.files.audio
          .length;
        index += 1
      ) {
        const file =
          manifest.files.audio[
            index
          ];

        if (
          seenStorage.has(
            file.storagePath,
          )
        ) {
          continue;
        }

        seenStorage.add(
          file.storagePath,
        );

        const fileTrack =
          tracks.find(
            (track) =>
              track.id ===
              file.trackId,
          );

        const audioVaultFolder =
          vaultFolderName(
            fileTrack
              ?.vault_person,
          );

        setBackupProgress(
          `Downloading audio ${
            index + 1
          } of ${
            manifest.files
              .audio.length
          }…`,
        );

        const response =
          await fetch(
            file.downloadUrl,
            {
              cache:
                'no-store',
            },
          );

        if (!response.ok) {
          missingAudio.push(
            `${file.title} | ${file.trackId} | ${file.storagePath}`,
          );

          continue;
        }

        const extension =
          fileExtension(
            file.storagePath,
          );

        const audioName =
          `${String(
            includedAudio + 1,
          ).padStart(
            3,
            '0',
          )}-` +
          `${safeFilePart(
            file.title,
          )}.${extension}`;

        await addResponseToZip(
          zip,
          `audio/${audioVaultFolder}/${audioName}`,
          response,
        );

        includedAudio +=
          1;
      }

      addTextFile(
        zip,
        'metadata/backup-report.json',
        JSON.stringify(
          {
            createdAt:
              manifest.createdAt,
            createdBy:
              manifest.createdBy,
            recordingCount:
              tracks.length,
            uniqueAudioFilesIncluded:
              includedAudio,
            missingAudio,
            photoFilesIncluded:
              0,
          },
          null,
          2,
        ),
      );

      if (
        missingAudio.length >
        0
      ) {
        addTextFile(
          zip,
          'MISSING-FILES.txt',
          [
            'FIELDS FAMILY VAULT — MISSING FILE REPORT',
            '',
            'The database information for these recordings is included,',
            'but the corresponding audio file could not be downloaded.',
            '',
            'MISSING AUDIO',
            '',
            ...missingAudio,
          ].join('\n'),
        );
      }

      setBackupProgress(
        'Finishing ZIP file…',
      );

      zip.end();

      await zipFinishedPromise;

      if (zipError) {
        throw zipError;
      }

      const blob =
        new Blob(
          zipChunks as BlobPart[],
          {
            type:
              'application/zip',
          },
        );

      if (
        blob.size === 0
      ) {
        throw new Error(
          'The backup ZIP was empty.',
        );
      }

      const fileDate =
        manifest.createdAt.slice(
          0,
          10,
        );

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
        `fields-family-vault-backup-${fileDate}.zip`;

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
        5000,
      );

      setBackupProgress(
        'Recording backup history…',
      );

      let historyRecorded =
        true;

      try {
        await recordCompletedBackup({
          recordingCount:
            tracks.length,

          audioFileCount:
            includedAudio,

          missingAudioCount:
            missingAudio.length,

          backupSizeBytes:
            blob.size,
        });
      } catch {
        historyRecorded =
          false;
      }

      await loadHealth();

      if (historyRecorded) {
        setMessage({
          type: 'success',
          text:
            `Full Vault backup created successfully. ${includedAudio} audio files were included and the backup was added to Backup History.`,
        });
      } else {
        setMessage({
          type: 'success',
          text:
            `The full Vault backup downloaded successfully with ${includedAudio} audio files, but its Backup History entry could not be recorded.`,
        });
      }
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
      setBackupProgress('');
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
              ? backupProgress ||
                'Creating Full Backup…'
              : 'Download Full Vault Backup'}
          </button>
        </section>

        {loading &&
        !health ? (
          <div className="mt-10 flex items-center justify-center rounded-2xl border border-stone-300 bg-[#fffaf0] p-12">
            <Loader2 className="h-7 w-7 animate-spin text-[#a66b27]" />
          </div>
        ) : health ? (
          <>
            <section
              className={`mt-7 rounded-2xl border p-5 ${
                health.healthy &&
                warningCount ===
                  0
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-amber-200 bg-amber-50'
              }`}
            >
              <div className="flex items-start gap-3">
                {health.healthy &&
                warningCount ===
                  0 ? (
                  <CheckCircle className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />
                )}

                <div>
                  <h2 className="font-serif text-2xl text-stone-900">
                    {health.healthy &&
                    warningCount ===
                      0
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
                    Each successfully completed full backup is recorded here.
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
                      Use Download Full Vault Backup above to create one.
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

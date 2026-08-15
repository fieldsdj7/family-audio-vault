'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Film,
  FolderOpen,
  HardDrive,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }
}

type VideoFile = {
  name: string;
  path: string;
  size: number;
  lastModified: number;
  extension: string;
};

const VIDEO_EXTENSIONS = new Set([
  '3gp',
  'avi',
  'flv',
  'm2ts',
  'm4v',
  'mkv',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'mts',
  'ts',
  'vob',
  'webm',
  'wmv',
]);

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, index);

  return `${value.toFixed(index >= 3 ? 2 : 1)} ${units[index]}`;
}

function formatDate(timestamp: number) {
  if (!timestamp) return 'Unknown';

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

async function scanDirectory(
  directory: FileSystemDirectoryHandle,
  relativePath = '',
): Promise<VideoFile[]> {
  const videos: VideoFile[] = [];

  for await (const entry of directory.values()) {
    if (entry.kind === 'directory') {
      const childPath = relativePath
        ? `${relativePath}\\${entry.name}`
        : entry.name;

      const childVideos = await scanDirectory(entry, childPath);
      videos.push(...childVideos);
      continue;
    }

    const extension = entry.name.includes('.')
      ? entry.name.split('.').pop()?.toLowerCase() ?? ''
      : '';

    if (!VIDEO_EXTENSIONS.has(extension)) {
      continue;
    }

    try {
      const file = await entry.getFile();

      videos.push({
        name: file.name,
        path: relativePath
          ? `${relativePath}\\${file.name}`
          : file.name,
        size: file.size,
        lastModified: file.lastModified,
        extension,
      });
    } catch {
      // Skip individual files that Windows/browser cannot read.
    }
  }

  return videos;
}

export default function VideoVaultPage() {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [folderName, setFolderName] = useState('');
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState('');
  const [scanComplete, setScanComplete] = useState(false);

  const totalSize = useMemo(
    () => videos.reduce((sum, video) => sum + video.size, 0),
    [videos],
  );

  const sortedVideos = useMemo(
    () =>
      [...videos].sort((a, b) =>
        a.path.localeCompare(b.path, undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
      ),
    [videos],
  );

  async function selectFolder() {
    setMessage('');
    setScanComplete(false);

    if (!window.showDirectoryPicker) {
      setMessage(
        'This browser does not support direct folder scanning. Please open the Video Vault in Google Chrome or Microsoft Edge on your PC.',
      );
      return;
    }

    try {
      const directory = await window.showDirectoryPicker();

      setFolderName(directory.name);
      setVideos([]);
      setScanning(true);

      const foundVideos = await scanDirectory(directory);

      setVideos(foundVideos);
      setScanComplete(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setMessage(
        'The folder could not be scanned. No files were changed. Try choosing the folder again.',
      );
    } finally {
      setScanning(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f0e5] p-5 text-stone-800 md:p-10">
      <div className="mx-auto max-w-6xl">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-[#8a561f]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to the Vault
        </a>

        <header className="mt-6 border-b border-stone-300 pb-7">
          <p className="text-xs font-semibold uppercase tracking-[.22em] text-[#a66b27]">
            Fields Family Vault
          </p>

          <div className="mt-2 flex items-center gap-3">
            <Film className="h-9 w-9 text-[#8a561f]" />

            <h1 className="font-serif text-4xl text-stone-900 md:text-5xl">
              Video Vault
            </h1>
          </div>

          <p className="mt-3 max-w-3xl text-stone-600">
            Scan family video folders on your computer or attached portable
            drives. This first version only reads the files. Nothing is
            uploaded, moved, renamed, copied, or deleted.
          </p>
        </header>

        <section className="mt-8 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <HardDrive className="h-7 w-7 text-[#8a561f]" />

                <h2 className="font-serif text-2xl text-stone-900">
                  Scan a video folder
                </h2>
              </div>

              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
                Choose any folder on your PC or one of your attached portable
                drives. The scanner will also look through all folders inside
                the folder you select.
              </p>
            </div>

            <button
              type="button"
              onClick={selectFolder}
              disabled={scanning}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-5 py-3 font-semibold text-white transition hover:bg-[#293127] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {scanning ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <FolderOpen className="h-5 w-5" />
                  Select Video Folder
                </>
              )}
            </button>
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />

            <p>
              <strong>Read-only test:</strong> this page cannot currently
              change anything on either portable hard drive.
            </p>
          </div>

          {message && (
            <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              {message}
            </div>
          )}
        </section>

        {(scanning || scanComplete) && (
          <section className="mt-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-stone-300 bg-[#fffaf0] p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Folder
                </p>

                <p className="mt-2 break-words font-semibold text-stone-900">
                  {folderName || '—'}
                </p>
              </div>

              <div className="rounded-2xl border border-stone-300 bg-[#fffaf0] p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Videos found
                </p>

                <p className="mt-2 text-3xl font-semibold text-stone-900">
                  {videos.length.toLocaleString()}
                </p>
              </div>

              <div className="rounded-2xl border border-stone-300 bg-[#fffaf0] p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Total video size
                </p>

                <p className="mt-2 text-3xl font-semibold text-stone-900">
                  {formatBytes(totalSize)}
                </p>
              </div>
            </div>

            {scanComplete && (
              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-green-800">
                <CheckCircle2 className="h-5 w-5" />
                Scan complete. No files were changed.
              </div>
            )}
          </section>
        )}

        {scanComplete && videos.length === 0 && (
          <section className="mt-6 rounded-3xl border border-stone-300 bg-[#fffaf0] p-8 text-center">
            <Film className="mx-auto h-10 w-10 text-stone-400" />

            <h2 className="mt-3 font-serif text-2xl text-stone-900">
              No recognized videos found
            </h2>

            <p className="mt-2 text-sm text-stone-600">
              Try selecting a different folder or a folder higher up on the
              drive.
            </p>
          </section>
        )}

        {sortedVideos.length > 0 && (
          <section className="mt-8">
            <div className="mb-4">
              <h2 className="font-serif text-2xl text-stone-900">
                Videos found
              </h2>

              <p className="mt-1 text-sm text-stone-600">
                The date shown below is currently the file&apos;s Windows/browser
                modified date. We will add true embedded recording-date
                detection in the next stage.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-stone-300 bg-[#fffaf0] shadow-sm">
              <div className="hidden grid-cols-[minmax(0,1fr)_120px_190px] gap-4 border-b border-stone-300 bg-[#efe5d4] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-stone-600 md:grid">
                <span>Video</span>
                <span>Size</span>
                <span>File date</span>
              </div>

              <div className="max-h-[650px] divide-y divide-stone-200 overflow-y-auto">
                {sortedVideos.map((video, index) => (
                  <div
                    key={`${video.path}-${index}`}
                    className="grid gap-2 px-5 py-4 md:grid-cols-[minmax(0,1fr)_120px_190px] md:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="break-all font-medium text-stone-900">
                        {video.name}
                      </p>

                      <p className="mt-1 break-all text-xs text-stone-500">
                        {video.path}
                      </p>
                    </div>

                    <div>
                      <span className="text-xs font-semibold uppercase text-stone-400 md:hidden">
                        Size:{' '}
                      </span>

                      <span className="text-sm text-stone-700">
                        {formatBytes(video.size)}
                      </span>
                    </div>

                    <div>
                      <span className="text-xs font-semibold uppercase text-stone-400 md:hidden">
                        File date:{' '}
                      </span>

                      <span className="text-sm text-stone-700">
                        {formatDate(video.lastModified)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  BookOpen,
  Calendar,
  Download,
  Headphones,
  Loader2,
  LogOut,
  Pause,
  Play,
  ShieldCheck,
  Tag,
  Trash2,
  User,
  Volume2,
} from "lucide-react";

type VaultName =
  | "Papa"
  | "Dad"
  | "Mom";

interface AudioTrack {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: VaultName;
  created_at: string;
  question_number?: number | null;
  question_text?: string | null;
  transcript?: string | null;

  story_chapter?: string | null;
  story_title?: string | null;

  storage_path?: string | null;

  source_track_id?: string | null;

  clip_start_seconds?: number | null;
  clip_end_seconds?: number | null;
}

type MemberResponse = {
  member?: {
    email: string;
    displayName?: string | null;
    isAdmin: boolean;
    allowedVaults: string[];
  };

  error?: string;
};

type RecordingsResponse = {
  recordings?: AudioTrack[];
  error?: string;
};

const vaults: {
  name: VaultName;
  displayName: string;
  title: string;
}[] = [
  {
    name: "Papa",
    displayName: "Papa — Bill",
    title: "Papa's Life",
  },
  {
    name: "Dad",
    displayName: "Dad — Dan",
    title: "Dad's Life",
  },
  {
    name: "Mom",
    displayName: "Mom — Ivy",
    title: "Mom's Life",
  },
];

function vaultDisplayName(
  person: VaultName,
) {
  return (
    vaults.find(
      (vault) =>
        vault.name === person,
    )?.displayName || person
  );
}

function formatAudioTime(
  seconds: number,
) {
  const safe =
    Math.max(
      0,
      Math.floor(
        Number.isFinite(seconds)
          ? seconds
          : 0,
      ),
    );

  return `${Math.floor(
    safe / 60,
  )}:${String(
    safe % 60,
  ).padStart(2, "0")}`;
}

function formatTotalAudioTime(
  seconds: number,
) {
  const totalSeconds =
    Math.max(
      0,
      Math.round(seconds),
    );

  const hours =
    Math.floor(
      totalSeconds / 3600,
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60,
    );

  if (hours > 0) {
    return `${hours} hr ${minutes} min`;
  }

  return `${minutes} min`;
}

function audioDurationFromUrl(
  url: string,
) {
  return new Promise<number>(
    (resolve) => {
      const audio =
        document.createElement(
          "audio",
        );

      let settled = false;

      const finish = (
        value: number,
      ) => {
        if (settled) return;

        settled = true;

        audio.removeAttribute(
          "src",
        );

        audio.load();

        resolve(
          Number.isFinite(
            value,
          )
            ? value
            : 0,
        );
      };

      audio.preload =
        "metadata";

      audio.onloadedmetadata =
        () =>
          finish(
            audio.duration,
          );

      audio.onerror =
        () => finish(0);

      audio.src = url;
      audio.load();

      window.setTimeout(
        () => finish(0),
        15000,
      );
    },
  );
}

async function readJson<T>(
  response: Response,
): Promise<T> {
  const contentType =
    response.headers.get(
      "content-type",
    ) || "";

  if (
    !contentType.includes(
      "application/json",
    )
  ) {
    throw new Error(
      `The server returned an unexpected response (${response.status}).`,
    );
  }

  return response.json() as Promise<T>;
}

function VaultAudioPlayer({
  track,
  isPlaying,
  onPlay,
  onPause,
}: {
  track: AudioTrack;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
}) {
  const audioRef =
    useRef<HTMLAudioElement | null>(
      null,
    );

  const [
    currentSeconds,
    setCurrentSeconds,
  ] = useState(0);

  const [
    playableDuration,
    setPlayableDuration,
  ] = useState(0);

  const clipStart =
    Math.max(
      0,
      track.clip_start_seconds ||
        0,
    );

  const clipEnd =
    typeof track.clip_end_seconds ===
      "number" &&
    track.clip_end_seconds >
      clipStart
      ? track.clip_end_seconds
      : null;

  function prepareAudio() {
    const audio =
      audioRef.current;

    if (!audio) return;

    const actualEnd =
      clipEnd
        ? Math.min(
            clipEnd,
            audio.duration,
          )
        : audio.duration;

    setPlayableDuration(
      Math.max(
        0,
        actualEnd -
          clipStart,
      ),
    );

    audio.currentTime =
      Math.min(
        clipStart,
        audio.duration ||
          clipStart,
      );

    if (isPlaying) {
      void audio.play();
    }
  }

  function updatePosition() {
    const audio =
      audioRef.current;

    if (!audio) return;

    const actualEnd =
      clipEnd
        ? Math.min(
            clipEnd,
            audio.duration,
          )
        : audio.duration;

    const duration =
      Math.max(
        0,
        actualEnd -
          clipStart,
      );

    setPlayableDuration(
      duration,
    );

    setCurrentSeconds(
      Math.min(
        Math.max(
          0,
          audio.currentTime -
            clipStart,
        ),
        duration,
      ),
    );

    if (
      clipEnd &&
      audio.currentTime >=
        actualEnd - 0.05
    ) {
      audio.pause();

      audio.currentTime =
        actualEnd;

      setCurrentSeconds(
        duration,
      );
    }
  }

  async function togglePlayback() {
    const audio =
      audioRef.current;

    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    if (
      playableDuration > 0 &&
      currentSeconds >=
        playableDuration -
          0.05
    ) {
      audio.currentTime =
        clipStart;

      setCurrentSeconds(0);
    }

    await audio.play();
  }

  function seek(
    nextSeconds: number,
  ) {
    const audio =
      audioRef.current;

    if (!audio) return;

    const bounded =
      Math.max(
        0,
        Math.min(
          nextSeconds,
          playableDuration,
        ),
      );

    audio.currentTime =
      clipStart + bounded;

    setCurrentSeconds(
      bounded,
    );
  }

  return (
    <div className="mt-7 w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-stone-200 bg-white p-3 sm:p-4">
      <audio
        ref={audioRef}
        key={track.id}
        src={`/api/cloudflare/audio/${track.id}`}
        preload="metadata"
        onLoadedMetadata={
          prepareAudio
        }
        onTimeUpdate={
          updatePosition
        }
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onPause}
      />

      <div className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3 gap-y-3 sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:gap-x-4">
        <button
          type="button"
          onClick={() =>
            void togglePlayback()
          }
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#3b4536] text-white hover:bg-[#293127]"
          aria-label={
            isPlaying
              ? "Pause recording"
              : "Play recording"
          }
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 fill-current" />
          ) : (
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          )}
        </button>

        <input
          type="range"
          min="0"
          max={
            playableDuration ||
            0
          }
          step="0.1"
          value={Math.min(
            currentSeconds,
            playableDuration ||
              0,
          )}
          onChange={(
            event,
          ) =>
            seek(
              Number(
                event.target
                  .value,
              ),
            )
          }
          className="block w-full min-w-0 max-w-full accent-[#80542a]"
          aria-label="Recording position"
        />

        <span className="col-span-2 justify-self-center whitespace-nowrap text-xs tabular-nums text-stone-600 sm:col-span-1 sm:justify-self-end sm:text-sm">
          {formatAudioTime(
            currentSeconds,
          )}{" "}
          /{" "}
          {formatAudioTime(
            playableDuration,
          )}
        </span>
      </div>

      {track.source_track_id && (
        <p className="mt-3 text-xs text-stone-500">
          This answer plays only
          its saved section of the
          original recording.
        </p>
      )}
    </div>
  );
}

export default function Home() {
  const [
    tracks,
    setTracks,
  ] =
    useState<AudioTrack[]>(
      [],
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    checkingAccess,
    setCheckingAccess,
  ] = useState(true);

  const [
    accessError,
    setAccessError,
  ] = useState("");

  const [
    isAdmin,
    setIsAdmin,
  ] = useState(false);

  const [
    selectedTrack,
    setSelectedTrack,
  ] =
    useState<AudioTrack | null>(
      null,
    );

  const [
    isPlaying,
    setIsPlaying,
  ] = useState(false);

  const [
    activeCategory,
    setActiveCategory,
  ] = useState("All");

  const [
    activePerson,
    setActivePerson,
  ] =
    useState<VaultName>(
      "Dad",
    );

  const [
    trashingTrackId,
    setTrashingTrackId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    downloadingTrackId,
    setDownloadingTrackId,
  ] =
    useState<string | null>(
      null,
    );

  const durationCacheRef =
    useRef<Map<string, number>>(
      new Map(),
    );

  const [
    totalAudioSeconds,
    setTotalAudioSeconds,
  ] = useState(0);

  const [
    loadingTotalAudioTime,
    setLoadingTotalAudioTime,
  ] = useState(false);

  const [
    accessibleVaults,
    setAccessibleVaults,
  ] =
    useState<VaultName[]>(
      [],
    );

  const availableVaults =
    vaults.filter((vault) =>
      accessibleVaults.includes(
        vault.name,
      ),
    );

  const currentVault =
    availableVaults.find(
      (vault) =>
        vault.name ===
        activePerson,
    ) ||
    availableVaults[0];

  const personTracks =
    tracks.filter(
      (track) =>
        accessibleVaults.includes(
          track.vault_person,
        ) &&
        track.vault_person ===
          activePerson,
    );

  const categories = [
    "All",

    ...Array.from(
      new Set(
        personTracks.map(
          (track) =>
            track.category ||
            "General",
        ),
      ),
    ),
  ];

  const filteredTracks =
    activeCategory ===
    "All"
      ? personTracks
      : personTracks.filter(
          (track) =>
            (track.category ||
              "General") ===
            activeCategory,
        );

  useEffect(() => {
    void start();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function calculateTotalAudioTime() {
      if (!personTracks.length) {
        setTotalAudioSeconds(0);
        setLoadingTotalAudioTime(
          false,
        );
        return;
      }

      setLoadingTotalAudioTime(
        true,
      );

      let total = 0;

      for (
        const track of
        personTracks
      ) {
        if (cancelled) {
          return;
        }

        const clippedDuration =
          typeof track.clip_start_seconds ===
            "number" &&
          typeof track.clip_end_seconds ===
            "number" &&
          track.clip_end_seconds >
            track.clip_start_seconds
            ? Math.max(
                0,
                track.clip_end_seconds -
                  track.clip_start_seconds,
              )
            : null;

        if (
          clippedDuration !==
          null
        ) {
          total +=
            clippedDuration;
          continue;
        }

        const cached =
          durationCacheRef.current.get(
            track.id,
          );

        if (
          cached !== undefined
        ) {
          total += cached;
          continue;
        }

        const duration =
          await audioDurationFromUrl(
            `/api/cloudflare/audio/${track.id}`,
          );

        durationCacheRef.current.set(
          track.id,
          duration,
        );

        total += duration;
      }

      if (!cancelled) {
        setTotalAudioSeconds(
          total,
        );

        setLoadingTotalAudioTime(
          false,
        );
      }
    }

    void calculateTotalAudioTime();

    return () => {
      cancelled = true;
    };
  }, [
    activePerson,
    tracks,
  ]);

  async function start() {
    setCheckingAccess(true);
    setAccessError("");

    try {
      const memberResponse =
        await fetch(
          "/api/cloudflare/member",
          {
            cache:
              "no-store",
          },
        );

      const member =
        await readJson<MemberResponse>(
          memberResponse,
        );

      if (
        !memberResponse.ok ||
        !member.member
      ) {
        throw new Error(
          member.error ||
            "Your Vault access could not be verified.",
        );
      }

      const permitted =
        member.member.allowedVaults
          .filter(
            (
              value,
            ): value is VaultName =>
              value ===
                "Papa" ||
              value ===
                "Dad" ||
              value ===
                "Mom",
          );

      setIsAdmin(
        member.member
          .isAdmin,
      );

      setAccessibleVaults(
        permitted,
      );

      const initialPerson =
        permitted.includes(
          activePerson,
        )
          ? activePerson
          : permitted[0];

      if (!initialPerson) {
        setTracks([]);
        setSelectedTrack(
          null,
        );
        setLoading(false);
        return;
      }

      setActivePerson(
        initialPerson,
      );

      await fetchTracks(
        initialPerson,
        permitted,
      );
    } catch (error) {
      setAccessError(
        error instanceof Error
          ? error.message
          : "Your Vault access could not be verified.",
      );

      setAccessibleVaults(
        [],
      );

      setTracks([]);
      setSelectedTrack(
        null,
      );

      setLoading(false);
    } finally {
      setCheckingAccess(
        false,
      );
    }
  }

  async function fetchTracks(
    preferredPerson: VaultName,
    permittedVaults = accessibleVaults,
  ) {
    setLoading(true);

    try {
      const response =
        await fetch(
          "/api/cloudflare/recordings",
          {
            cache:
              "no-store",
          },
        );

      const data =
        await readJson<RecordingsResponse>(
          response,
        );

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Could not load the recordings.",
        );
      }

      const recordings =
        (data.recordings ||
          []).filter(
          (track) =>
            permittedVaults.includes(
              track.vault_person,
            ),
        );

      setTracks(
        recordings,
      );

      const firstAvailable =
        recordings.find(
          (track) =>
            track.vault_person ===
            preferredPerson,
        ) || null;

      setSelectedTrack(
        firstAvailable,
      );

      setIsPlaying(false);
    } catch (error) {
      console.error(
        "Could not load recordings:",
        error,
      );

      setTracks([]);
      setSelectedTrack(
        null,
      );
    } finally {
      setLoading(false);
    }
  }

  function chooseVault(
    person: VaultName,
  ) {
    setActivePerson(person);
    setActiveCategory(
      "All",
    );

    setSelectedTrack(
      tracks.find(
        (track) =>
          track.vault_person ===
          person,
      ) || null,
    );

    setIsPlaying(false);
  }

  async function trashTrack(
    track: AudioTrack,
  ) {
    const confirmed =
      window.confirm(
        `Move “${track.title}” to Trash?\n\nIt will disappear from the family Vault, but its audio, transcript, story, and links will be kept safely until you restore it or permanently remove it later.`,
      );

    if (!confirmed) {
      return;
    }

    setTrashingTrackId(
      track.id,
    );

    try {
      const response =
        await fetch(
          "/api/cloudflare/trash",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              trackId:
                track.id,
              action:
                "trash",
            }),
          },
        );

      const result =
        await readJson<{
          error?: string;
          success?: boolean;
        }>(response);

      if (!response.ok) {
        throw new Error(
          result.error ||
            "The recording could not be moved to Trash.",
        );
      }

      const remaining =
        tracks.filter(
          (item) =>
            item.id !==
            track.id,
        );

      setTracks(
        remaining,
      );

      if (
        selectedTrack?.id ===
        track.id
      ) {
        setSelectedTrack(
          remaining.find(
            (item) =>
              item.vault_person ===
              activePerson,
          ) || null,
        );
      }

      setIsPlaying(false);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "The recording could not be moved to Trash.",
      );
    } finally {
      setTrashingTrackId(
        null,
      );
    }
  }

  async function downloadTrack(
    track: AudioTrack,
  ) {
    setDownloadingTrackId(
      track.id,
    );

    try {
      const response =
        await fetch(
          `/api/cloudflare/audio/${track.id}`,
          {
            cache:
              "no-store",
          },
        );

      if (!response.ok) {
        throw new Error(
          "The audio file could not be downloaded.",
        );
      }

      const blob =
        await response.blob();

      const extension =
        track.storage_path
          ?.split("?")[0]
          .split(".")
          .pop() ||
        "audio";

      const safeTitle =
        (
          track.title ||
          "recording"
        )
          .replace(
            /[<>:"/\\|?*\u0000-\u001f]/g,
            " ",
          )
          .replace(
            /\s+/g,
            " ",
          )
          .trim();

      const url =
        URL.createObjectURL(
          blob,
        );

      const link =
        document.createElement(
          "a",
        );

      link.href = url;

      link.download =
        `${safeTitle}.${extension}`;

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
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "The audio file could not be downloaded.",
      );
    } finally {
      setDownloadingTrackId(
        null,
      );
    }
  }

  function selectTrack(
    track: AudioTrack,
  ) {
    setSelectedTrack(
      track,
    );

    setIsPlaying(true);
  }

  function handleSignOut() {
    window.location.assign(
      "/cdn-cgi/access/logout",
    );
  }

  if (checkingAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] text-stone-700">
        <Loader2 className="h-7 w-7 animate-spin text-[#a66b27]" />
      </main>
    );
  }

  if (accessError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] p-5 text-stone-800">
        <div className="w-full max-w-md rounded-3xl border border-stone-300 bg-[#fffaf0] p-8 text-center shadow-xl">
          <AlertCircle className="mx-auto h-10 w-10 text-rose-700" />

          <h1 className="mt-4 font-serif text-3xl text-stone-900">
            Vault access could not be verified
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            {accessError}
          </p>

          <button
            type="button"
            onClick={() =>
              window.location.reload()
            }
            className="mt-6 rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!currentVault) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] p-5 text-stone-800">
        <div className="w-full max-w-md rounded-3xl border border-stone-300 bg-[#fffaf0] p-8 text-center shadow-xl">
          <ShieldCheck className="mx-auto h-10 w-10 text-[#a66b27]" />

          <h1 className="mt-4 font-serif text-3xl text-stone-900">
            No Vault access yet
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            This account has not been assigned to a family Vault.
          </p>

          <button
            type="button"
            onClick={
              handleSignOut
            }
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#f6f0e5] text-stone-800">
      <div className="grid min-h-screen w-full min-w-0 max-w-full lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="w-full min-w-0 max-w-full overflow-hidden border-b border-stone-800 bg-[#20221e] px-4 py-5 text-stone-100 sm:px-5 sm:py-6 lg:border-b-0 lg:border-r">
          <div className="flex min-w-0 items-center justify-center gap-3 text-center lg:justify-start lg:text-left">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#c98b3c] text-[#20221e]">
              <BookOpen className="h-5 w-5" />
            </div>

            <div>
              <p className="font-serif text-lg leading-none">
                Fields Family Vault
              </p>

              <p className="mt-1 text-xs text-stone-400">
                Stories worth keeping
              </p>
            </div>
          </div>

          <nav className="mt-6 flex w-full min-w-0 flex-wrap justify-center gap-2 lg:mt-8 lg:block lg:space-y-2">
            {availableVaults.map(
              (vault) => (
                <button
                  key={
                    vault.name
                  }
                  type="button"
                  onClick={() =>
                    chooseVault(
                      vault.name,
                    )
                  }
                  className={`flex min-w-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition sm:gap-3 sm:px-4 sm:py-3 lg:w-full ${
                    activePerson ===
                    vault.name
                      ? "bg-white/10 font-medium text-white"
                      : "text-stone-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Headphones className="h-4 w-4 text-[#d8a95f]" />

                  {
                    vault.displayName
                  }
                </button>
              ),
            )}

            {isAdmin && (
              <a
                href="/admin"
                className="flex min-w-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-stone-300 transition hover:bg-white/10 hover:text-white sm:gap-3 sm:px-4 sm:py-3 lg:w-full"
              >
                <ShieldCheck className="h-4 w-4 text-[#d8a95f]" />
                Admin Upload
              </a>
            )}
          </nav>

          <div className="mt-10 hidden border-t border-white/10 pt-6 lg:block">
            <p className="font-serif text-lg text-stone-200">
              A family legacy, kept in their own words.
            </p>

            <p className="mt-3 text-sm leading-relaxed text-stone-400">
              Listen to the voices, stories, and memories that made our family who we are.
            </p>

            <p className="mt-6 border-l-2 border-[#d8a95f] pl-4 font-serif text-lg leading-relaxed text-stone-200">
              “A people without knowledge of their past is like a tree without roots.”
            </p>
          </div>
        </aside>

        <section className="w-full min-w-0 max-w-full px-3 py-5 sm:px-5 md:p-10">
          <div className="mx-auto w-full min-w-0 max-w-5xl">
            <header className="flex min-w-0 flex-col items-center gap-4 border-b border-stone-300 pb-7 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#a66b27]">
                  Our Family Legacy
                </p>

                <h1 className="mt-2 break-words font-serif text-3xl text-stone-900 sm:text-4xl md:text-5xl">
                  {vaultDisplayName(
                    currentVault.name,
                  )}
                </h1>

                <p className="mt-1 break-words font-serif text-lg text-stone-600 sm:text-xl">
                  {
                    currentVault.title
                  }
                </p>

                <p className="mt-3 max-w-xl text-stone-600">
                  A living collection of stories, memories, and the voice we never want to forget.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  handleSignOut
                }
                className="inline-flex w-fit items-center gap-2 rounded-full border border-stone-400 bg-[#fffaf0] px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-[#a66b27] hover:text-[#8a561f]"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </header>

            <section className="mt-8 w-full min-w-0 max-w-full overflow-hidden rounded-3xl bg-[#5b4837] shadow-lg">
              <div className="grid md:grid-cols-[1.05fr_.95fr]">
                <div className="flex min-h-[240px] min-w-0 flex-col justify-between p-5 text-[#fffaf0] sm:p-7 md:min-h-[280px] md:p-10">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#e3bb77]">
                      The Legacy Book
                    </p>

                    <h2 className="mt-4 max-w-md break-words font-serif text-3xl leading-tight sm:text-4xl md:text-5xl">
                      The stories that shaped a life.
                    </h2>

                    <p className="mt-5 max-w-md leading-relaxed text-stone-200">
                      Every recording is a piece of family history, preserved for children, grandchildren, and the ones still to come.
                    </p>
                  </div>

                  <div className="mt-8 flex min-w-0 items-start gap-3 text-sm text-stone-200">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d8a95f]/60">
                      <Headphones className="h-4 w-4 text-[#e3bb77]" />
                    </span>

                    <div className="min-w-0">
                      <p>
                        {
                          personTracks.length
                        }{" "}
                        {personTracks.length ===
                        1
                          ? "recording"
                          : "recordings"}{" "}
                        preserved
                      </p>

                      <p className="mt-1 text-stone-300">
                        {loadingTotalAudioTime
                          ? "Calculating total audio time…"
                          : `${formatTotalAudioTime(
                              totalAudioSeconds,
                            )} total audio`}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="relative hidden items-center justify-center overflow-hidden bg-[#c38a45] p-10 md:flex">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,.25),_transparent_60%)]" />

                  <div className="relative flex h-48 w-36 rotate-[-5deg] flex-col justify-between rounded-r-md border border-[#6d4824] bg-[#f5dfb1] p-5 shadow-2xl">
                    <BookOpen className="h-8 w-8 text-[#80542a]" />

                    <div>
                      <p className="font-serif text-xl leading-tight text-[#54371f]">
                        {vaultDisplayName(
                          currentVault.name,
                        )}
                      </p>

                      <div className="mt-4 h-px bg-[#9e7140]" />

                      <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-[#80542a]">
                        Family stories
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {selectedTrack ? (
              <section className="mt-10 w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-stone-300 bg-[#fffaf0] p-4 shadow-sm sm:p-6 md:p-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">
                      Now Listening
                    </p>

                    <h2 className="mt-2 break-words font-serif text-2xl text-stone-900 sm:text-3xl">
                      {
                        selectedTrack.title
                      }
                    </h2>

                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-600">
                      <span className="flex items-center gap-2">
                        <User className="h-4 w-4 text-[#a66b27]" />
                        {
                          selectedTrack.speaker
                        }
                      </span>

                      <span className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-[#a66b27]" />

                        {new Date(
                          selectedTrack.created_at,
                        ).toLocaleDateString()}
                      </span>

                      <span className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-[#a66b27]" />

                        {selectedTrack.category ||
                          "General"}
                      </span>
                    </div>
                  </div>

                  <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-2 sm:w-auto sm:justify-start sm:gap-3">
                    {!selectedTrack.source_track_id && (
                      <button
                        type="button"
                        onClick={() =>
                          void downloadTrack(
                            selectedTrack,
                          )
                        }
                        disabled={
                          downloadingTrackId ===
                          selectedTrack.id
                        }
                        className="inline-flex items-center gap-2 rounded-xl border border-[#d1af77] bg-[#fff7e8] px-3 py-2 text-sm font-semibold text-[#744b1e] transition hover:bg-[#f8e6c2] disabled:opacity-60"
                      >
                        <Download className="h-4 w-4" />

                        {downloadingTrackId ===
                        selectedTrack.id
                          ? "Preparing…"
                          : "Download audio"}
                      </button>
                    )}

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() =>
                          void trashTrack(
                            selectedTrack,
                          )
                        }
                        disabled={
                          trashingTrackId ===
                          selectedTrack.id
                        }
                        className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />

                        {trashingTrackId ===
                        selectedTrack.id
                          ? "Moving…"
                          : "Move to Trash"}
                      </button>
                    )}
                  </div>
                </div>

                <VaultAudioPlayer
                  key={
                    selectedTrack.id
                  }
                  track={
                    selectedTrack
                  }
                  isPlaying={
                    isPlaying
                  }
                  onPlay={() =>
                    setIsPlaying(
                      true,
                    )
                  }
                  onPause={() =>
                    setIsPlaying(
                      false,
                    )
                  }
                />

                {selectedTrack.transcript && (
                  <div className="mt-7 border-t border-stone-200 pt-7">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">
                      Word-for-word transcript
                    </p>

                    <p className="mt-3 break-words whitespace-pre-line leading-relaxed text-stone-700">
                      {
                        selectedTrack.transcript
                      }
                    </p>
                  </div>
                )}

                {selectedTrack.story_chapter && (
                  <div className="mt-7 border-t border-stone-200 pt-7">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">
                      Family Story
                    </p>

                    <h3 className="mt-2 font-serif text-2xl text-stone-900">
                      {selectedTrack.story_title ||
                        selectedTrack.title}
                    </h3>

                    <p className="mt-3 break-words whitespace-pre-line font-serif text-lg leading-relaxed text-stone-700">
                      {
                        selectedTrack.story_chapter
                      }
                    </p>
                  </div>
                )}
              </section>
            ) : (
              <section className="mt-10 rounded-3xl border border-dashed border-stone-300 bg-[#fffaf0] p-10 text-center">
                <Headphones className="mx-auto h-8 w-8 text-[#a66b27]" />

                <h2 className="mt-4 font-serif text-2xl text-stone-900">
                  {loading
                    ? "Opening the Vault…"
                    : "No stories have been added yet."}
                </h2>

                {!loading && (
                  <p className="mt-2 text-stone-600">
                    The first recording will become the beginning of this legacy book.
                  </p>
                )}
              </section>
            )}

            {categories.length >
              1 && (
              <section className="mt-10">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">
                  Explore by chapter
                </p>

                <div className="mt-3 flex flex-wrap justify-center gap-2 pb-2 sm:justify-start">
                  {categories.map(
                    (
                      category,
                    ) => (
                      <button
                        key={
                          category
                        }
                        type="button"
                        onClick={() =>
                          setActiveCategory(
                            category,
                          )
                        }
                        className={`max-w-full rounded-full px-4 py-2 text-sm font-medium transition ${
                          activeCategory ===
                          category
                            ? "bg-[#3b4536] text-white"
                            : "border border-stone-300 bg-[#fffaf0] text-stone-700 hover:border-[#a66b27]"
                        }`}
                      >
                        {
                          category
                        }
                      </button>
                    ),
                  )}
                </div>
              </section>
            )}

            <section className="mt-10 pb-10">
              <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">
                    The Collection
                  </p>

                  <h2 className="mt-2 font-serif text-3xl text-stone-900">
                    Recorded Memories
                  </h2>
                </div>

                <span className="text-sm text-stone-500">
                  {
                    filteredTracks.length
                  }{" "}
                  found
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {filteredTracks.map(
                  (
                    track,
                    index,
                  ) => (
                    <button
                      key={
                        track.id
                      }
                      type="button"
                      onClick={() =>
                        selectTrack(
                          track,
                        )
                      }
                      className={`group flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-2xl border p-3 text-left transition sm:gap-4 sm:p-4 md:p-5 ${
                        selectedTrack?.id ===
                        track.id
                          ? "border-[#b57931] bg-[#f4e7cf]"
                          : "border-stone-300 bg-[#fffaf0] hover:border-[#b57931] hover:shadow-sm"
                      }`}
                    >
                     <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8d4ae] font-serif text-sm text-[#76502a]">
  {track.question_number
    ? `Q${track.question_number}`
    : String(index + 1).padStart(2, "0")}
</span>

                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-serif text-lg text-stone-900 sm:text-xl">
                          {
                            track.title
                          }
                        </span>

                        <span className="mt-1 block break-words text-xs text-stone-600 sm:text-sm">
                          {
                            track.speaker
                          }{" "}
                          ·{" "}
                          {new Date(
                            track.created_at,
                          ).toLocaleDateString()}
                        </span>
                      </span>

                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-700 transition group-hover:border-[#a66b27] group-hover:text-[#8a561f]">
                        <Volume2 className="h-4 w-4" />
                      </span>
                    </button>
                  ),
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

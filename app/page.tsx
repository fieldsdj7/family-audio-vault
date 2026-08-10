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
    <div className="mt-7 rounded-2xl border border-stone-200 bg-white p-4">
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

      <div className="flex items-center gap-4">
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
          className="min-w-0 flex-1 accent-[#80542a]"
          aria-label="Recording position"
        />

        <span className="shrink-0 text-sm tabular-nums text-stone-600">
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
    <main className="min-h-screen overflow-x-hidden bg-[#f6f0e5] text-stone-800">
      <div className="grid min-h-screen min-w-0 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="min-w-0 overflow-hidden border-b border-stone-800 bg-[#20221e] px-5 py-6 text-stone-100 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3">
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

          <nav className="mt-8 flex max-w-full min-w-0 gap-2 overflow-x-auto lg:block lg:space-y-2">
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
                  className={`flex w-auto shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm transition lg:w-full lg:whitespace-normal ${
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
                className="flex w-auto shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm text-stone-300 transition hover:bg-white/10 hover:text-white lg:w-full lg:whitespace-normal"
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

        <section className="p-5 md:p-10">
          <div className="mx-auto max-w-5xl">
            <header className="flex flex-col gap-4 border-b border-stone-300 pb-7 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#a66b27]">
                  Our Family Legacy
                </p>

                <h1 className="mt-2 font-serif text-4xl text-stone-900 md:text-5xl">
                  {vaultDisplayName(
                    currentVault.name,
                  )}
                </h1>

                <p className="mt-1 font-serif text-xl text-stone-600">
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

            <section className="mt-8 overflow-hidden rounded-3xl bg-[#5b4837] shadow-lg">
              <div className="grid md:grid-cols-[1.05fr_.95fr]">
                <div className="flex min-h-[280px] flex-col justify-between p-7 text-[#fffaf0] md:p-10">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#e3bb77]">
                      The Legacy Book
                    </p>

                    <h2 className="mt-4 max-w-md font-serif text-4xl leading-tight md:text-5xl">
                      The stories that shaped a life.
                    </h2>

                    <p className="mt-5 max-w-md leading-relaxed text-stone-200">
                      Every recording is a piece of family history, preserved for children, grandchildren, and the ones still to come.
                    </p>
                  </div>

                  <div className="mt-8 flex items-center gap-3 text-sm text-stone-200">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8a95f]/60">
                      <Headphones className="h-4 w-4 text-[#e3bb77]" />
                    </span>

                    <span>
                      {
                        personTracks.length
                      }{" "}
                      {personTracks.length ===
                      1
                        ? "recording"
                        : "recordings"}{" "}
                      preserved
                    </span>
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
              <section className="mt-10 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">
                      Now Listening
                    </p>

                    <h2 className="mt-2 font-serif text-3xl text-stone-900">
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

                  <div className="flex flex-wrap items-center gap-3">
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

                    <p className="mt-3 whitespace-pre-line leading-relaxed text-stone-700">
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

                    <p className="mt-3 whitespace-pre-line font-serif text-lg leading-relaxed text-stone-700">
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

                <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
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
                        className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
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
              <div className="flex items-end justify-between gap-4">
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
                      className={`group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition md:p-5 ${
                        selectedTrack?.id ===
                        track.id
                          ? "border-[#b57931] bg-[#f4e7cf]"
                          : "border-stone-300 bg-[#fffaf0] hover:border-[#b57931] hover:shadow-sm"
                      }`}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8d4ae] font-serif text-lg text-[#76502a]">
                        {String(
                          index +
                            1,
                        ).padStart(
                          2,
                          "0",
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-serif text-xl text-stone-900">
                          {
                            track.title
                          }
                        </span>

                        <span className="mt-1 block text-sm text-stone-600">
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

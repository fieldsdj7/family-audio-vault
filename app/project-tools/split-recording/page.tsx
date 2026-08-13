"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Clock3,
  FileAudio,
  Link2,
  Loader2,
  Scissors,
  ShieldCheck,
} from "lucide-react";

type VaultPerson =
  | "Papa"
  | "Dad"
  | "Mom";

type Track = {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: VaultPerson;
  storage_path: string | null;
  transcript: string | null;
  created_at: string;
};

type Question = {
  id: string;
  question_number: number;
  question_text: string;
};

function vaultDisplayName(
  person: VaultPerson,
) {
  if (person === "Papa") {
    return "Papa — Bill";
  }

  if (person === "Dad") {
    return "Dad — Dan";
  }

  return "Mom — Ivy";
}

function formatTime(
  seconds: number,
) {
  const safeSeconds =
    Math.max(
      0,
      Math.floor(
        Number.isFinite(seconds)
          ? seconds
          : 0,
      ),
    );

  return `${Math.floor(
    safeSeconds / 60,
  )}:${String(
    safeSeconds % 60,
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

function writeString(
  view: DataView,
  offset: number,
  value: string,
) {
  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    view.setUint8(
      offset + index,
      value.charCodeAt(index),
    );
  }
}

function audioBufferToSpeechWav(
  buffer: AudioBuffer,
  startSeconds: number,
  endSeconds: number,
) {
  const targetSampleRate =
    16000;

  const safeStart =
    Math.max(
      0,
      Math.min(
        startSeconds,
        buffer.duration,
      ),
    );

  const safeEnd =
    Math.max(
      safeStart,
      Math.min(
        endSeconds,
        buffer.duration,
      ),
    );

  const durationSeconds =
    safeEnd -
    safeStart;

  if (
    durationSeconds <= 0
  ) {
    throw new Error(
      "The selected clip does not contain any audio.",
    );
  }

  const outputSamples =
    Math.max(
      1,
      Math.floor(
        durationSeconds *
          targetSampleRate,
      ),
    );

  const dataSize =
    outputSamples * 2;

  const output =
    new ArrayBuffer(
      44 + dataSize,
    );

  const view =
    new DataView(
      output,
    );

  writeString(
    view,
    0,
    "RIFF",
  );

  view.setUint32(
    4,
    36 + dataSize,
    true,
  );

  writeString(
    view,
    8,
    "WAVE",
  );

  writeString(
    view,
    12,
    "fmt ",
  );

  view.setUint32(
    16,
    16,
    true,
  );

  view.setUint16(
    20,
    1,
    true,
  );

  view.setUint16(
    22,
    1,
    true,
  );

  view.setUint32(
    24,
    targetSampleRate,
    true,
  );

  view.setUint32(
    28,
    targetSampleRate * 2,
    true,
  );

  view.setUint16(
    32,
    2,
    true,
  );

  view.setUint16(
    34,
    16,
    true,
  );

  writeString(
    view,
    36,
    "data",
  );

  view.setUint32(
    40,
    dataSize,
    true,
  );

  const sourceRate =
    buffer.sampleRate;

  const channelData =
    Array.from(
      {
        length:
          buffer.numberOfChannels,
      },
      (_, channel) =>
        buffer.getChannelData(
          channel,
        ),
    );

  let offset = 44;

  for (
    let sample = 0;
    sample < outputSamples;
    sample += 1
  ) {
    const sourceTime =
      safeStart +
      sample /
        targetSampleRate;

    const sourceFrame =
      Math.min(
        buffer.length - 1,
        Math.floor(
          sourceTime *
            sourceRate,
        ),
      );

    let value = 0;

    for (
      let channel = 0;
      channel <
      channelData.length;
      channel += 1
    ) {
      value +=
        channelData[
          channel
        ][sourceFrame] ||
        0;
    }

    value /=
      Math.max(
        1,
        channelData.length,
      );

    value =
      Math.max(
        -1,
        Math.min(
          1,
          value,
        ),
      );

    view.setInt16(
      offset,
      value < 0
        ? value *
          0x8000
        : value *
          0x7fff,
      true,
    );

    offset += 2;
  }

  return output;
}

async function createAudioClip(
  sourceId: string,
  startSeconds: number,
  endSeconds: number,
) {
  const response =
    await fetch(
      `/api/cloudflare/audio/${sourceId}`,
      {
        cache:
          "no-store",
      },
    );

  if (!response.ok) {
    throw new Error(
      "The original recording could not be opened for splitting.",
    );
  }

  const sourceData =
    await response.arrayBuffer();

  const audioContext =
    new AudioContext();

  try {
    const decoded =
      await audioContext.decodeAudioData(
        sourceData.slice(0),
      );

    const wavData =
      audioBufferToSpeechWav(
        decoded,
        startSeconds,
        endSeconds,
      );

    return new File(
      [wavData],
      `split-${sourceId}-${startSeconds}-${endSeconds}.wav`,
      {
        type:
          "audio/wav",
      },
    );
  } finally {
    await audioContext.close();
  }
}

export default function SplitRecordingPage() {
  const audioRef =
    useRef<HTMLAudioElement | null>(
      null,
    );

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
    saving,
    setSaving,
  ] = useState(false);

  const [
    tracks,
    setTracks,
  ] =
    useState<Track[]>([]);

  const [
    questions,
    setQuestions,
  ] =
    useState<Question[]>([]);

  const [
    sourceId,
    setSourceId,
  ] = useState("");

  const [
    duration,
    setDuration,
  ] = useState(0);

  const [
    playingSeconds,
    setPlayingSeconds,
  ] = useState(0);

  const [
    jumpTime,
    setJumpTime,
  ] = useState("");

  const [
    startSeconds,
    setStartSeconds,
  ] = useState("0");

  const [
    endSeconds,
    setEndSeconds,
  ] = useState("");

  const [
    title,
    setTitle,
  ] = useState("");

  const [
    transcript,
    setTranscript,
  ] = useState("");

  const [
    notes,
    setNotes,
  ] = useState("");

  const [
    questionId,
    setQuestionId,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState<{
    type:
      | "success"
      | "error";
    text: string;
  } | null>(null);

  const selectedSource =
    tracks.find(
      (track) =>
        track.id ===
        sourceId,
    ) || null;

  useEffect(() => {
    void start();
  }, []);

  async function start() {
    setCheckingAccess(true);

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
        await readJson<{
          member?: {
            isAdmin: boolean;
          };
        }>(response);

      const allowed =
        response.ok &&
        !!data.member
          ?.isAdmin;

      setIsAdmin(
        allowed,
      );

      if (allowed) {
        await loadData();
      } else {
        setLoading(false);
      }
    } catch {
      setIsAdmin(false);
      setLoading(false);
    } finally {
      setCheckingAccess(
        false,
      );
    }
  }

  async function loadData() {
    setLoading(true);

    try {
      const [
        tracksResponse,
        questionsResponse,
      ] =
        await Promise.all([
          fetch(
            "/api/cloudflare/split",
            {
              cache:
                "no-store",
            },
          ),

          fetch(
            "/api/cloudflare/questions",
            {
              cache:
                "no-store",
            },
          ),
        ]);

      const tracksData =
        await readJson<{
          recordings?: Track[];
          error?: string;
        }>(
          tracksResponse,
        );

      const questionsData =
        await readJson<{
          questions?: Question[];
          error?: string;
        }>(
          questionsResponse,
        );

      if (
        !tracksResponse.ok
      ) {
        throw new Error(
          tracksData.error ||
            "Could not load recordings.",
        );
      }

      if (
        !questionsResponse.ok
      ) {
        throw new Error(
          questionsData.error ||
            "Could not load questions.",
        );
      }

      setTracks(
        tracksData.recordings ||
          [],
      );

      setQuestions(
        questionsData.questions ||
          [],
      );
    } catch (error) {
      setMessage({
        type: "error",

        text:
          error instanceof Error
            ? error.message
            : "Could not load Split Recording.",
      });
    } finally {
      setLoading(false);
    }
  }

  function chooseSource(
    nextId: string,
  ) {
    setSourceId(
      nextId,
    );

    setDuration(0);
    setPlayingSeconds(0);
    setJumpTime("");
    setStartSeconds("0");
    setEndSeconds("");
    setTitle("");
    setNotes("");
    setQuestionId("");
    setMessage(null);

    const track =
      tracks.find(
        (item) =>
          item.id ===
          nextId,
      );

    setTranscript(
      track?.transcript ||
        "",
    );
  }

  function parseJumpTime(
    value: string,
  ) {
    const trimmed =
      value.trim();

    if (!trimmed) {
      return Number.NaN;
    }

    if (
      /^\d+$/.test(
        trimmed,
      )
    ) {
      return Number(
        trimmed,
      );
    }

    const parts =
      trimmed
        .split(":")
        .map((part) =>
          Number(part),
        );

    if (
      parts.some(
        (part) =>
          !Number.isFinite(
            part,
          ),
      )
    ) {
      return Number.NaN;
    }

    if (
      parts.length === 2
    ) {
      const [
        minutes,
        seconds,
      ] = parts;

      if (
        seconds < 0 ||
        seconds >= 60
      ) {
        return Number.NaN;
      }

      return (
        minutes * 60 +
        seconds
      );
    }

    if (
      parts.length === 3
    ) {
      const [
        hours,
        minutes,
        seconds,
      ] = parts;

      if (
        minutes < 0 ||
        minutes >= 60 ||
        seconds < 0 ||
        seconds >= 60
      ) {
        return Number.NaN;
      }

      return (
        hours * 3600 +
        minutes * 60 +
        seconds
      );
    }

    return Number.NaN;
  }

  async function jumpToTime() {
    const audio =
      audioRef.current;

    if (!audio) {
      setMessage({
        type: "error",
        text:
          "The audio player is not ready yet.",
      });
      return;
    }

    const seconds =
      parseJumpTime(
        jumpTime,
      );

    if (
      !Number.isFinite(
        seconds,
      ) ||
      seconds < 0
    ) {
      setMessage({
        type: "error",
        text:
          "Enter a time like 6:38, 15:00, 1:02:15, or a number of seconds.",
      });
      return;
    }

    const safeSeconds =
      duration > 0
        ? Math.min(
            seconds,
            duration,
          )
        : seconds;

    audio.currentTime =
      safeSeconds;

    setPlayingSeconds(
      safeSeconds,
    );

    setMessage(null);

    try {
      await audio.play();
    } catch {
      // Jump still succeeds if the browser blocks autoplay.
    }
  }

  function captureTime(
    kind:
      | "start"
      | "end",
  ) {
    const seconds =
      Math.floor(
        audioRef.current
          ?.currentTime ||
          0,
      );

    if (
      kind === "start"
    ) {
      setStartSeconds(
        String(seconds),
      );
    } else {
      setEndSeconds(
        String(seconds),
      );
    }
  }

  async function createAnswer(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!selectedSource) {
      setMessage({
        type: "error",
        text:
          "Choose the original recording first.",
      });

      return;
    }

    const start =
      Number(
        startSeconds,
      );

    const end =
      Number(
        endSeconds,
      );

    if (
      !Number.isInteger(
        start,
      ) ||
      start < 0 ||
      !Number.isInteger(
        end,
      ) ||
      end <= start
    ) {
      setMessage({
        type: "error",

        text:
          "Enter a valid start and end time. The end must be after the start.",
      });

      return;
    }

    if (
      duration > 0 &&
      end >
        Math.ceil(
          duration,
        )
    ) {
      setMessage({
        type: "error",

        text:
          "The end time cannot be after the end of the recording.",
      });

      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      setMessage({
        type: "success",
        text:
          "Creating the physical audio clip…",
      });

      const clip =
        await createAudioClip(
          selectedSource.id,
          start,
          end,
        );

      if (
        clip.size >
        24 *
          1024 *
          1024
      ) {
        throw new Error(
          "This audio section is too large to save safely in one split. Choose a shorter section.",
        );
      }

      const form =
        new FormData();

      form.append(
        "clip",
        clip,
      );

      form.append(
        "sourceRecordingId",
        selectedSource.id,
      );

      form.append(
        "startSeconds",
        String(start),
      );

      form.append(
        "endSeconds",
        String(end),
      );

      form.append(
        "title",
        title.trim(),
      );

      form.append(
        "transcript",
        transcript.trim(),
      );

      form.append(
        "notes",
        notes.trim(),
      );

      form.append(
        "questionId",
        questionId,
      );

      const response =
        await fetch(
          "/api/cloudflare/split",
          {
            method:
              "POST",
            body: form,
          },
        );

      const result =
        await readJson<{
          recording?: {
            id: string;
            title: string;
          };

          physicalAudioClip?: boolean;
          originalPreserved?: boolean;
          error?: string;
        }>(response);

      if (
        !response.ok ||
        !result.recording
      ) {
        throw new Error(
          result.error ||
            "The separate answer could not be created.",
        );
      }

      let storyCreated =
        false;

      if (
        transcript.trim()
      ) {
        const storyResponse =
          await fetch(
            "/api/cloudflare/story",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  trackId:
                    result.recording
                      .id,
                  mode:
                    "create",
                }),
            },
          );

        storyCreated =
          storyResponse.ok;
      }

      setMessage({
        type: "success",

        text:
          transcript.trim()
            ? storyCreated
              ? "Separate answer created with its own physical audio file, transcript, and family story. The original recording remains untouched."
              : "Separate answer and transcript created with its own physical audio file. The family story can be created later in Story Studio."
            : "Separate answer created with its own physical audio file. The original recording remains untouched.",
      });

      setStartSeconds(
        "0",
      );

      setEndSeconds("");
      setTitle("");

      setTranscript(
        selectedSource.transcript ||
          "",
      );

      setNotes("");
      setQuestionId("");

      await loadData();
    } catch (error) {
      setMessage({
        type: "error",

        text:
          error instanceof Error
            ? error.message
            : "The separate answer could not be created.",
      });
    } finally {
      setSaving(false);
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
            Split Recording is private
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Only Vault administrators can create separate answer recordings.
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
      <div className="mx-auto max-w-4xl">
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
            <Scissors className="h-9 w-9 text-[#a66b27]" />
            Split Recording
          </h1>

          <p className="mt-3 max-w-3xl text-stone-600">
            Turn one longer recording into separate answers. Each answer receives its own physical audio file while the original recording remains unchanged.
          </p>
        </header>

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

            {message.text}
          </div>
        )}

        <section className="mt-8 rounded-3xl border border-[#ddc79f] bg-[#fbf3e3] p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">
            Original stays safe
          </p>

          <h2 className="mt-2 font-serif text-2xl text-stone-900">
            Each answer becomes a real audio file
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            Choose the beginning and end while listening. Your browser copies only that section into a new WAV file. The original recording is never shortened or overwritten.
          </p>
        </section>

        <form
          onSubmit={
            createAnswer
          }
          className="mt-8 space-y-7"
        >
          <section className="rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
            <label className="mb-1.5 block text-sm font-semibold">
              1. Choose the original recording
            </label>

            <select
              value={
                sourceId
              }
              onChange={(
                event,
              ) =>
                chooseSource(
                  event
                    .target
                    .value,
                )
              }
              className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]"
              required
            >
              <option value="">
                Choose a recording…
              </option>

              {tracks.map(
                (track) => (
                  <option
                    key={
                      track.id
                    }
                    value={
                      track.id
                    }
                  >
                    {vaultDisplayName(
                      track.vault_person,
                    )}{" "}
                    ·{" "}
                    {
                      track.title
                    }
                  </option>
                ),
              )}
            </select>

            {selectedSource && (
              <>
                <p className="mt-3 flex items-center gap-2 text-sm text-stone-600">
                  <Link2 className="h-4 w-4 text-[#a66b27]" />
                  Every answer created here stays linked to “
                  {selectedSource.title}
                  .”
                </p>

                <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-4">
                  <audio
                    ref={
                      audioRef
                    }
                    controls
                    src={`/api/cloudflare/audio/${selectedSource.id}`}
                    className="w-full"
                    onLoadedMetadata={() =>
                      setDuration(
                        audioRef
                          .current
                          ?.duration ||
                          0,
                      )
                    }
                    onTimeUpdate={() =>
                      setPlayingSeconds(
                        audioRef
                          .current
                          ?.currentTime ||
                          0,
                      )
                    }
                  />

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium text-stone-700">
                      Current position:{" "}
                      {formatTime(
                        playingSeconds,
                      )}
                    </span>

                    <div className="flex items-center gap-2">
                      <input
                        value={
                          jumpTime
                        }
                        onChange={(
                          event,
                        ) =>
                          setJumpTime(
                            event
                              .target
                              .value,
                          )
                        }
                        onKeyDown={(
                          event,
                        ) => {
                          if (
                            event.key ===
                            "Enter"
                          ) {
                            event.preventDefault();
                            void jumpToTime();
                          }
                        }}
                        placeholder="6:38"
                        className="w-24 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                        aria-label="Jump to time"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          void jumpToTime()
                        }
                        className="rounded-lg border border-stone-300 bg-[#fffaf0] px-3 py-2 font-semibold text-stone-700 hover:border-[#a66b27]"
                      >
                        Jump
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        captureTime(
                          "start",
                        )
                      }
                      className="rounded-lg border border-stone-300 bg-[#fffaf0] px-3 py-2 font-semibold text-stone-700 hover:border-[#a66b27]"
                    >
                      Use as start
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        captureTime(
                          "end",
                        )
                      }
                      className="rounded-lg border border-stone-300 bg-[#fffaf0] px-3 py-2 font-semibold text-stone-700 hover:border-[#a66b27]"
                    >
                      Use as end
                    </button>

                    {duration >
                      0 && (
                      <span className="text-stone-500">
                        Full recording:{" "}
                        {formatTime(
                          duration,
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold">
                  2. Start time (seconds)
                </label>

                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={
                    startSeconds
                  }
                  onChange={(
                    event,
                  ) =>
                    setStartSeconds(
                      event
                        .target
                        .value,
                    )
                  }
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
                />

                <p className="mt-1 text-xs text-stone-500">
                  {formatTime(
                    Number(
                      startSeconds,
                    ),
                  )}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold">
                  End time (seconds)
                </label>

                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={
                    endSeconds
                  }
                  onChange={(
                    event,
                  ) =>
                    setEndSeconds(
                      event
                        .target
                        .value,
                    )
                  }
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
                />

                <p className="mt-1 text-xs text-stone-500">
                  {formatTime(
                    Number(
                      endSeconds,
                    ),
                  )}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <label className="mb-1.5 block text-sm font-semibold">
                3. Answer title
              </label>

              <input
                value={
                  title
                }
                onChange={(
                  event,
                ) =>
                  setTitle(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="Example: How Papa met Grandma"
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
              />

              <p className="mt-1 text-xs text-stone-500">
                If left blank, the Vault will create a title from the original recording and selected time range.
              </p>
            </div>

            <div className="mt-5">
              <label className="mb-1.5 block text-sm font-semibold">
                Transcript for this answer
              </label>

              <textarea
                rows={8}
                value={
                  transcript
                }
                onChange={(
                  event,
                ) =>
                  setTranscript(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="Keep only the words spoken during this answer."
                className="w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 leading-relaxed"
              />

              {selectedSource?.transcript && (
                <p className="mt-2 text-xs leading-relaxed text-amber-800">
                  The original transcript was copied here so no words are lost. Before creating the answer, remove everything that belongs to the other questions.
                </p>
              )}
            </div>

            <div className="mt-5">
              <label className="mb-1.5 block text-sm font-semibold">
                Notes
              </label>

              <textarea
                rows={3}
                value={
                  notes
                }
                onChange={(
                  event,
                ) =>
                  setNotes(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="Optional notes about this split."
                className="w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3"
              />
            </div>
          </section>

          <section className="rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
            <p className="text-sm font-semibold">
              4. Link to a Story Question
            </p>

            <p className="mt-1 text-sm text-stone-600">
              Optional. Choose the question this answer belongs to.
            </p>

            <select
              value={
                questionId
              }
              onChange={(
                event,
              ) =>
                setQuestionId(
                  event
                    .target
                    .value,
                )
              }
              className="mt-4 w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
            >
              <option value="">
                Not linked to a question
              </option>

              {questions.map(
                (
                  question,
                ) => (
                  <option
                    key={
                      question.id
                    }
                    value={
                      question.id
                    }
                  >
                    {
                      question.question_number
                    }
                    .{" "}
                    {
                      question.question_text
                    }
                  </option>
                ),
              )}
            </select>
          </section>

          <button
            type="submit"
            disabled={
              saving
            }
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3.5 font-semibold text-white hover:bg-[#293127] disabled:bg-stone-400"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <FileAudio className="h-5 w-5" />
            )}

            {saving
              ? "Creating physical audio clip…"
              : "Create Separate Answer"}
          </button>
        </form>

        <section className="mt-8 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 text-sm leading-relaxed text-stone-600 shadow-sm">
          <p className="flex items-center gap-2 font-semibold text-stone-800">
            <Clock3 className="h-4 w-4 text-[#a66b27]" />
            How splitting works
          </p>

          <p className="mt-2">
            The selected section is copied into its own WAV file and stored separately. The original recording remains intact as the master recording, so nothing is lost if you later need to create another answer from it.
          </p>
        </section>
      </div>
    </main>
  );
}

"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  BookHeart,
  CheckCircle2,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Send,
  Square,
} from "lucide-react";

type PublicRequest = {
  vaultPerson:
    | "Papa"
    | "Dad"
    | "Mom";
  vaultDisplayName: string;
  recipientName: string | null;
  questionNumber: number;
  questionText: string;
  status: string;
  expiresAt: string | null;
};

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

function preferredMimeType() {
  if (
    typeof MediaRecorder ===
    "undefined"
  ) {
    return "";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];

  for (
    const candidate of candidates
  ) {
    if (
      MediaRecorder.isTypeSupported(
        candidate,
      )
    ) {
      return candidate;
    }
  }

  return "";
}

function extensionForMimeType(
  mimeType: string,
) {
  if (
    mimeType.includes(
      "mp4",
    )
  ) {
    return "m4a";
  }

  if (
    mimeType.includes(
      "ogg",
    )
  ) {
    return "ogg";
  }

  if (
    mimeType.includes(
      "webm",
    )
  ) {
    return "webm";
  }

  return "audio";
}

function formatSeconds(
  totalSeconds: number,
) {
  const minutes =
    Math.floor(
      totalSeconds / 60,
    );

  const seconds =
    totalSeconds % 60;

  return `${minutes}:${String(
    seconds,
  ).padStart(2, "0")}`;
}

export default function StorytellerPage({
  params,
}: PageProps) {
  const [
    token,
    setToken,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    requestData,
    setRequestData,
  ] =
    useState<PublicRequest | null>(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    recorderState,
    setRecorderState,
  ] = useState<
    | "idle"
    | "recording"
    | "paused"
    | "ready"
    | "submitting"
    | "submitted"
  >("idle");

  const [
    recordingSeconds,
    setRecordingSeconds,
  ] = useState(0);

  const [
    audioUrl,
    setAudioUrl,
  ] = useState("");

  const [
    recorderError,
    setRecorderError,
  ] = useState("");

  const mediaRecorderRef =
    useRef<MediaRecorder | null>(
      null,
    );

  const streamRef =
    useRef<MediaStream | null>(
      null,
    );

  const chunksRef =
    useRef<Blob[]>([]);

  const blobRef =
    useRef<Blob | null>(
      null,
    );

  const timerRef =
    useRef<ReturnType<
      typeof setInterval
    > | null>(null);

  useEffect(() => {
    void loadToken();

    return () => {
      stopTimer();
      stopTracks();

      if (audioUrl) {
        URL.revokeObjectURL(
          audioUrl,
        );
      }
    };
  }, []);

  function stopTimer() {
    if (
      timerRef.current
    ) {
      clearInterval(
        timerRef.current,
      );

      timerRef.current =
        null;
    }
  }

  function stopTracks() {
    streamRef.current
      ?.getTracks()
      .forEach(
        (track) =>
          track.stop(),
      );

    streamRef.current =
      null;
  }

  async function loadToken() {
    try {
      const resolved =
        await params;

      const nextToken =
        resolved.token;

      setToken(
        nextToken,
      );

      const response =
        await fetch(
          `/api/public/storyteller/${encodeURIComponent(
            nextToken,
          )}`,
          {
            cache:
              "no-store",
          },
        );

      const data =
        (await response.json()) as {
          request?: PublicRequest;
          error?: string;
        };

      if (
        !response.ok ||
        !data.request
      ) {
        throw new Error(
          data.error ||
            "This Storyteller request could not be opened.",
        );
      }

      setRequestData(
        data.request,
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "This Storyteller request could not be opened.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function startRecording() {
    setRecorderError("");

    if (
      !navigator.mediaDevices
        ?.getUserMedia ||
      typeof MediaRecorder ===
        "undefined"
    ) {
      setRecorderError(
        "This browser does not support recording from the microphone. Try opening the link in Safari, Chrome, or Edge on your phone or computer.",
      );
      return;
    }

    try {
      if (audioUrl) {
        URL.revokeObjectURL(
          audioUrl,
        );

        setAudioUrl("");
      }

      blobRef.current =
        null;

      chunksRef.current =
        [];

      setRecordingSeconds(
        0,
      );

      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            audio: true,
          },
        );

      streamRef.current =
        stream;

      const mimeType =
        preferredMimeType();

      const recorder =
        mimeType
          ? new MediaRecorder(
              stream,
              {
                mimeType,
              },
            )
          : new MediaRecorder(
              stream,
            );

      mediaRecorderRef.current =
        recorder;

      recorder.ondataavailable =
        (event) => {
          if (
            event.data.size >
            0
          ) {
            chunksRef.current.push(
              event.data,
            );
          }
        };

      recorder.onstop =
        () => {
          stopTimer();
          stopTracks();

          const finalType =
            recorder.mimeType ||
            mimeType ||
            "audio/webm";

          const blob =
            new Blob(
              chunksRef.current,
              {
                type:
                  finalType,
              },
            );

          blobRef.current =
            blob;

          const nextUrl =
            URL.createObjectURL(
              blob,
            );

          setAudioUrl(
            nextUrl,
          );

          setRecorderState(
            "ready",
          );
        };

      recorder.onerror =
        () => {
          stopTimer();
          stopTracks();

          setRecorderState(
            "idle",
          );

          setRecorderError(
            "Recording stopped because the browser reported a microphone error.",
          );
        };

      recorder.start(
        1000,
      );

      setRecorderState(
        "recording",
      );

      timerRef.current =
        setInterval(() => {
          setRecordingSeconds(
            (value) =>
              value + 1,
          );
        }, 1000);
    } catch (recordError) {
      stopTimer();
      stopTracks();

      setRecorderState(
        "idle",
      );

      setRecorderError(
        recordError instanceof Error
          ? recordError.message
          : "The microphone could not be opened.",
      );
    }
  }

  function pauseRecording() {
    const recorder =
      mediaRecorderRef.current;

    if (
      !recorder ||
      recorder.state !==
        "recording"
    ) {
      return;
    }

    recorder.pause();
    stopTimer();

    setRecorderState(
      "paused",
    );
  }

  function resumeRecording() {
    const recorder =
      mediaRecorderRef.current;

    if (
      !recorder ||
      recorder.state !==
        "paused"
    ) {
      return;
    }

    recorder.resume();

    setRecorderState(
      "recording",
    );

    timerRef.current =
      setInterval(() => {
        setRecordingSeconds(
          (value) =>
            value + 1,
        );
      }, 1000);
  }

  function finishRecording() {
    const recorder =
      mediaRecorderRef.current;

    if (
      !recorder ||
      recorder.state ===
        "inactive"
    ) {
      return;
    }

    stopTimer();

    recorder.stop();
  }

  function recordAgain() {
    stopTimer();
    stopTracks();

    const recorder =
      mediaRecorderRef.current;

    if (
      recorder &&
      recorder.state !==
        "inactive"
    ) {
      recorder.stop();
    }

    mediaRecorderRef.current =
      null;

    blobRef.current =
      null;

    chunksRef.current =
      [];

    setRecordingSeconds(
      0,
    );

    if (audioUrl) {
      URL.revokeObjectURL(
        audioUrl,
      );

      setAudioUrl("");
    }

    setRecorderError("");
    setRecorderState(
      "idle",
    );
  }

  async function submitAnswer() {
    if (
      !blobRef.current ||
      !token
    ) {
      return;
    }

    setRecorderState(
      "submitting",
    );

    setRecorderError("");

    try {
      const blob =
        blobRef.current;

      const mimeType =
        blob.type ||
        "audio/webm";

      const extension =
        extensionForMimeType(
          mimeType,
        );

      const file =
        new File(
          [
            blob,
          ],
          `storyteller-answer.${extension}`,
          {
            type:
              mimeType,
          },
        );

      const form =
        new FormData();

      form.append(
        "file",
        file,
      );

      const response =
        await fetch(
          `/api/public/storyteller/${encodeURIComponent(
            token,
          )}/submit`,
          {
            method:
              "POST",
            body:
              form,
          },
        );

      const data =
        (await response.json()) as {
          submitted?: boolean;
          error?: string;
        };

      if (
        !response.ok ||
        !data.submitted
      ) {
        throw new Error(
          data.error ||
            "The recording could not be submitted.",
        );
      }

      stopTracks();

      setRecorderState(
        "submitted",
      );
    } catch (submitError) {
      setRecorderState(
        "ready",
      );

      setRecorderError(
        submitError instanceof Error
          ? submitError.message
          : "The recording could not be submitted.",
      );
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] px-5 text-stone-700">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#a66b27]" />
          <p className="mt-3 text-sm">
            Opening your Storyteller question…
          </p>
        </div>
      </main>
    );
  }

  if (
    error ||
    !requestData
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] p-5 text-stone-800">
        <div className="w-full max-w-lg rounded-3xl border border-rose-200 bg-[#fffaf0] p-8 text-center shadow-xl">
          <AlertCircle className="mx-auto h-10 w-10 text-rose-600" />

          <h1 className="mt-4 font-serif text-3xl text-stone-900">
            This link cannot be used
          </h1>

          <p className="mt-3 leading-relaxed text-stone-600">
            {error}
          </p>

          <p className="mt-5 text-sm text-stone-500">
            Ask the person who sent you this question for a new Storyteller link.
          </p>
        </div>
      </main>
    );
  }

  if (
    recorderState ===
    "submitted"
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] p-5 text-stone-800">
        <div className="w-full max-w-lg rounded-3xl border border-emerald-200 bg-[#fffaf0] p-8 text-center shadow-xl">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />

          <h1 className="mt-4 font-serif text-4xl text-stone-900">
            Thank you
          </h1>

          <p className="mt-3 leading-relaxed text-stone-600">
            Your story has been safely sent to the Fields Family Vault.
          </p>

          <p className="mt-5 text-sm text-stone-500">
            You can close this page now.
          </p>
        </div>
      </main>
    );
  }

  const isRecording =
    recorderState ===
    "recording";

  const isPaused =
    recorderState ===
    "paused";

  const isReady =
    recorderState ===
    "ready";

  const isSubmitting =
    recorderState ===
    "submitting";

  return (
    <main className="min-h-screen bg-[#f6f0e5] px-5 py-8 text-stone-800 md:py-14">
      <div className="mx-auto max-w-2xl">
        <header className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#efe0c4]">
            <BookHeart className="h-7 w-7 text-[#8a561f]" />
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-[.22em] text-[#a66b27]">
            Fields Family Vault
          </p>

          <h1 className="mt-2 font-serif text-4xl text-stone-900 md:text-5xl">
            Storyteller
          </h1>

          <p className="mt-3 text-stone-600">
            A family memory is waiting for you.
          </p>
        </header>

        <section className="mt-8 rounded-3xl border border-[#ddc79f] bg-[#fffaf0] p-6 shadow-xl md:p-9">
          {requestData.recipientName && (
            <p className="text-lg text-stone-700">
              Hi{" "}
              <span className="font-semibold text-stone-900">
                {requestData.recipientName}
              </span>
              ,
            </p>
          )}

          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            You have been invited to record an answer for the{" "}
            <span className="font-semibold text-stone-800">
              {requestData.vaultDisplayName}
            </span>{" "}
            family story collection.
          </p>

          <div className="mt-7 rounded-2xl border border-stone-200 bg-white p-5 md:p-6">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">
              Your question
            </p>

            <p className="mt-3 font-serif text-2xl leading-relaxed text-stone-900 md:text-3xl">
              {requestData.questionText}
            </p>
          </div>

          <div className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="flex items-center gap-2 font-semibold text-emerald-900">
              <CheckCircle2 className="h-5 w-5" />
              No account or password needed
            </p>

            <p className="mt-2 text-sm leading-relaxed text-emerald-800">
              This private link is only for answering the question above. It does not give access to the rest of the Family Vault.
            </p>
          </div>

          {recorderError && (
            <div className="mt-6 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {recorderError}
            </div>
          )}

          {(isRecording ||
            isPaused) && (
            <div className="mt-7 rounded-2xl border border-[#ddc79f] bg-[#fbf3e3] p-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">
                {isPaused
                  ? "Recording paused"
                  : "Recording"}
              </p>

              <p className="mt-2 font-serif text-4xl text-stone-900">
                {formatSeconds(
                  recordingSeconds,
                )}
              </p>
            </div>
          )}

          {isReady &&
            audioUrl && (
              <div className="mt-7 rounded-2xl border border-stone-200 bg-white p-5">
                <p className="font-semibold text-stone-900">
                  Listen before you submit
                </p>

                <p className="mt-1 text-sm text-stone-500">
                  Recorded{" "}
                  {formatSeconds(
                    recordingSeconds,
                  )}
                </p>

                <audio
                  controls
                  src={audioUrl}
                  className="mt-4 w-full"
                />
              </div>
            )}

          <div className="mt-7 space-y-3">
            {recorderState ===
              "idle" && (
              <button
                type="button"
                onClick={() =>
                  void startRecording()
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-5 py-4 font-semibold text-white hover:bg-[#293127]"
              >
                <Mic className="h-5 w-5" />
                Start Recording
              </button>
            )}

            {isRecording && (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={pauseRecording}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-4 font-semibold text-stone-700"
                >
                  <Pause className="h-5 w-5" />
                  Pause
                </button>

                <button
                  type="button"
                  onClick={finishRecording}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-5 py-4 font-semibold text-white hover:bg-[#293127]"
                >
                  <Square className="h-5 w-5" />
                  Finish
                </button>
              </div>
            )}

            {isPaused && (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={resumeRecording}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-4 font-semibold text-stone-700"
                >
                  <Play className="h-5 w-5" />
                  Resume
                </button>

                <button
                  type="button"
                  onClick={finishRecording}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-5 py-4 font-semibold text-white hover:bg-[#293127]"
                >
                  <Square className="h-5 w-5" />
                  Finish
                </button>
              </div>
            )}

            {isReady && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={recordAgain}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-4 font-semibold text-stone-700"
                  >
                    <RotateCcw className="h-5 w-5" />
                    Record Again
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void submitAnswer()
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-5 py-4 font-semibold text-white hover:bg-[#293127]"
                  >
                    <Send className="h-5 w-5" />
                    Submit Answer
                  </button>
                </div>
              </>
            )}

            {isSubmitting && (
              <button
                type="button"
                disabled
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-400 px-5 py-4 font-semibold text-white"
              >
                <Loader2 className="h-5 w-5 animate-spin" />
                Sending your story…
              </button>
            )}
          </div>

          <p className="mt-5 text-center text-xs leading-relaxed text-stone-500">
            Your browser will ask for microphone permission the first time you record.
          </p>
        </section>
      </div>
    </main>
  );
}

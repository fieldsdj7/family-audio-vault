"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { supabase } from "../../../lib/supabaseClient";

type Track = {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: "Papa" | "Dad" | "Mom" | null;
  storage_path: string | null;
  audio_url: string | null;
  transcript: string | null;
  is_split_master: boolean | null;
};

type Question = {
  id: string;
  card_number: number | null;
  question_text: string;
};

function getStoragePath(track: Track) {
  if (track.storage_path) return track.storage_path;
  return track.audio_url?.split("/audio-files/")[1] || null;
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(
    0,
    Math.floor(Number.isFinite(seconds) ? seconds : 0),
  );
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export default function SplitRecordingPage() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [playingSeconds, setPlayingSeconds] = useState(0);
  const [startSeconds, setStartSeconds] = useState("0");
  const [endSeconds, setEndSeconds] = useState("");
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [notes, setNotes] = useState("");
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const selectedSource = tracks.find((track) => track.id === sourceId) || null;

  async function loadData() {
    setLoading(true);
    const [tracksResult, questionsResult] = await Promise.all([
      supabase
        .from("audio_tracks")
        .select(
          "id, title, speaker, category, vault_person, storage_path, audio_url, transcript, is_split_master",
        )
        .is("trashed_at", null)
        .is("source_track_id", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("question_cards")
        .select("id, card_number, question_text")
        .order("card_number", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
    ]);

    if (tracksResult.error || questionsResult.error) {
      setMessage({
        type: "error",
        text:
          tracksResult.error?.message ||
          questionsResult.error?.message ||
          "Could not load Split Recording.",
      });
    } else {
      setTracks((tracksResult.data || []) as Track[]);
      setQuestions((questionsResult.data || []) as Question[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    async function start() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setCheckingAccess(false);
        setLoading(false);
        return;
      }
      const { data: admin } = await supabase
        .from("vault_admins")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      setIsAdmin(!!admin);
      setCheckingAccess(false);
      if (admin) await loadData();
      else setLoading(false);
    }
    void start();
  }, []);

  async function chooseSource(nextId: string) {
    setSourceId(nextId);
    setAudioUrl("");
    setDuration(0);
    setPlayingSeconds(0);
    setStartSeconds("0");
    setEndSeconds("");
    setTitle("");
    setTranscript("");
    setNotes("");
    setQuestionIds([]);
    setMessage(null);
    const track = tracks.find((item) => item.id === nextId);
    if (!track) return;
    const storagePath = getStoragePath(track);
    if (!storagePath) {
      setMessage({
        type: "error",
        text: "This older recording has no audio file path to split.",
      });
      return;
    }
    const { data, error } = await supabase.storage
      .from("audio-files")
      .createSignedUrl(storagePath, 60 * 60);
    if (error || !data?.signedUrl) {
      setMessage({
        type: "error",
        text: error?.message || "Could not open this recording.",
      });
      return;
    }
    setAudioUrl(data.signedUrl);
  }

  function captureTime(kind: "start" | "end") {
    const seconds = Math.floor(audioRef.current?.currentTime || 0);
    if (kind === "start") setStartSeconds(String(seconds));
    else setEndSeconds(String(seconds));
  }

  async function createAnswer(event: FormEvent) {
    event.preventDefault();
    if (!selectedSource) {
      setMessage({
        type: "error",
        text: "Choose the original recording first.",
      });
      return;
    }
    const start = Number(startSeconds);
    const end = Number(endSeconds);
    if (
      !Number.isInteger(start) ||
      start < 0 ||
      !Number.isInteger(end) ||
      end <= start
    ) {
      setMessage({
        type: "error",
        text: "Enter a valid start and end time. The end must be after the start.",
      });
      return;
    }
    const storagePath = getStoragePath(selectedSource);
    if (!storagePath) {
      setMessage({
        type: "error",
        text: "This original recording has no usable audio file path.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);
    const { data: answer, error: answerError } = await supabase
      .from("audio_tracks")
      .insert({
        title:
          title.trim() ||
          `${selectedSource.title} (${formatTime(start)}–${formatTime(end)})`,
        speaker: selectedSource.speaker,
        category: selectedSource.category || "General",
        vault_person: selectedSource.vault_person || "Dad",
        storage_path: storagePath,
        source_track_id: selectedSource.id,
        clip_start_seconds: start,
        clip_end_seconds: end,
        transcript: transcript.trim() || null,
        split_notes: notes.trim() || null,
        transcription_status: transcript.trim() ? "complete" : "not_started",
      })
      .select("id")
      .single();

    if (answerError || !answer) {
      setSaving(false);
      setMessage({
        type: "error",
        text: answerError?.message || "Could not save the answer entry.",
      });
      return;
    }
    const [masterResult, linksResult] = await Promise.all([
      supabase
        .from("audio_tracks")
        .update({ is_split_master: true })
        .eq("id", selectedSource.id),
      questionIds.length
        ? supabase.from("question_card_recordings").insert(
            questionIds.map((question_card_id) => ({
              question_card_id,
              audio_track_id: answer.id,
            })),
          )
        : Promise.resolve({ error: null }),
    ]);
    setSaving(false);
    if (masterResult.error || linksResult.error) {
      setMessage({
        type: "error",
        text: `The answer was created, but ${masterResult.error?.message || linksResult.error?.message}. Please do not create it again; refresh and check the collection first.`,
      });
      return;
    }
    setMessage({
      type: "success",
      text: "Answer entry created. The original recording is still untouched and remains available here as the master.",
    });
    setStartSeconds("0");
    setEndSeconds("");
    setTitle("");
    setTranscript("");
    setNotes("");
    setQuestionIds([]);
  }

  if (checkingAccess || loading)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] text-stone-700">
        <Loader2 className="h-7 w-7 animate-spin text-[#a66b27]" />
      </main>
    );
  if (!isAdmin)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] p-5 text-stone-800">
        <div className="w-full max-w-md rounded-3xl border border-stone-300 bg-[#fffaf0] p-8 text-center shadow-xl">
          <ShieldCheck className="mx-auto h-10 w-10 text-[#a66b27]" />
          <h1 className="mt-4 font-serif text-3xl text-stone-900">
            Split Recording is private
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Only vault administrators can create answer entries.
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
            Turn one long recording into separate, playable answer entries. This
            never changes the master audio file: each answer simply plays a
            saved time range from it.
          </p>
        </header>
        {message && (
          <div
            className={`mt-7 flex gap-2 rounded-xl border p-4 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
          >
            {message.type === "success" ? (
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
            Make an answer entry, not a risky edit
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            Choose the beginning and end while you listen, then save the
            question’s own title and transcript section. The original remains
            the master copy and can never be shortened by this tool.
          </p>
        </section>
        <form onSubmit={createAnswer} className="mt-8 space-y-7">
          <section className="rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
            <label className="mb-1.5 block text-sm font-semibold">
              1. Choose the original recording
            </label>
            <select
              value={sourceId}
              onChange={(e) => void chooseSource(e.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]"
              required
            >
              <option value="">Choose a recording…</option>
              {tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.vault_person === "Mom"
                    ? "Mom / Ivy"
                    : track.vault_person || "Dad"}{" "}
                  · {track.title}
                  {track.is_split_master ? " · master already has answers" : ""}
                </option>
              ))}
            </select>
            {selectedSource && (
              <p className="mt-3 flex items-center gap-2 text-sm text-stone-600">
                <Link2 className="h-4 w-4 text-[#a66b27]" />
                Every answer made here will stay linked to “
                {selectedSource.title}.”
              </p>
            )}
            {audioUrl && (
              <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-4">
                <audio
                  ref={audioRef}
                  controls
                  src={audioUrl}
                  className="w-full"
                  onLoadedMetadata={() =>
                    setDuration(audioRef.current?.duration || 0)
                  }
                  onTimeUpdate={() =>
                    setPlayingSeconds(audioRef.current?.currentTime || 0)
                  }
                />
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium text-stone-700">
                    Current position: {formatTime(playingSeconds)}
                  </span>
                  <button
                    type="button"
                    onClick={() => captureTime("start")}
                    className="rounded-lg border border-stone-300 bg-[#fffaf0] px-3 py-2 font-semibold text-stone-700 hover:border-[#a66b27]"
                  >
                    Use as start
                  </button>
                  <button
                    type="button"
                    onClick={() => captureTime("end")}
                    className="rounded-lg border border-stone-300 bg-[#fffaf0] px-3 py-2 font-semibold text-stone-700 hover:border-[#a66b27]"
                  >
                    Use as end
                  </button>
                  {duration > 0 && (
                    <span className="text-stone-500">
                      Full recording: {formatTime(duration)}
                    </span>
                  )}
                </div>
              </div>
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
                  value={startSeconds}
                  onChange={(e) => setStartSeconds(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
                />
                <p className="mt-1 text-xs text-stone-500">
                  {formatTime(Number(startSeconds))}
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
                  value={endSeconds}
                  onChange={(e) => setEndSeconds(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
                />
                <p className="mt-1 text-xs text-stone-500">
                  {formatTime(Number(endSeconds))}
                </p>
              </div>
            </div>
            <div className="mt-5">
              <label className="mb-1.5 block text-sm font-semibold">
                3. Answer title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Example: How Papa met Grandma"
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
              />
            </div>
            <div className="mt-5">
              <label className="mb-1.5 block text-sm font-semibold">
                Transcript for this answer
              </label>
              <textarea
                rows={8}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Paste or type only the words spoken during this time range. You can add it later, too."
                className="w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 leading-relaxed"
              />
            </div>
            <div className="mt-5">
              <label className="mb-1.5 block text-sm font-semibold">
                Notes
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything to remember about this answer or how it fits with the question card."
                className="w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3"
              />
            </div>
          </section>
          <section className="rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
            <p className="text-sm font-semibold">4. Link question card(s)</p>
            <p className="mt-1 text-sm text-stone-600">
              Optional. This answer can be connected to one or more cards now,
              or later in the Question Tracker.
            </p>
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-stone-300 bg-white p-3">
              {questions.length ? (
                questions.map((question) => (
                  <label
                    key={question.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-stone-50"
                  >
                    <input
                      type="checkbox"
                      checked={questionIds.includes(question.id)}
                      onChange={(e) =>
                        setQuestionIds((current) =>
                          e.target.checked
                            ? [...current, question.id]
                            : current.filter((id) => id !== question.id),
                        )
                      }
                      className="mt-1 h-4 w-4 accent-[#80542a]"
                    />
                    <span className="text-sm">
                      <span className="font-semibold text-stone-800">
                        {question.card_number
                          ? `Card ${question.card_number}`
                          : "Unnumbered card"}
                      </span>
                      <span className="ml-2 text-stone-600">
                        {question.question_text}
                      </span>
                    </span>
                  </label>
                ))
              ) : (
                <p className="p-2 text-sm text-stone-500">
                  No question cards have been added yet.
                </p>
              )}
            </div>
          </section>
          <button
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3.5 font-semibold text-white hover:bg-[#293127] disabled:bg-stone-400"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <FileAudio className="h-5 w-5" />
            )}
            {saving ? "Saving answer entry…" : "Create separate answer entry"}
          </button>
        </form>
        <section className="mt-8 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 text-sm leading-relaxed text-stone-600 shadow-sm">
          <p className="flex items-center gap-2 font-semibold text-stone-800">
            <Clock3 className="h-4 w-4 text-[#a66b27]" />
            Future edit note
          </p>
          <p className="mt-2">
            This first version uses simple timestamps, which is safer than
            altering audio. Later, timestamped transcripts can make choosing the
            exact words even quicker without changing the answer entries already
            created.
          </p>
        </section>
      </div>
    </main>
  );
}

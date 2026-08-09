'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle,
  Copy,
  Download,
  FileAudio,
  Headphones,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Tag,
  Upload,
  UserRound,
  Wrench,
} from 'lucide-react';

type VaultPerson = 'Papa' | 'Dad' | 'Mom';

type AudioTrack = {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: VaultPerson;
  question_id?: string | null;
  question_number?: number | null;
  question_text?: string | null;
  created_at: string;
  transcript?: string | null;
  story_title?: string | null;
  story_chapter?: string | null;
  transcription_status?: string | null;
  story_status?: string | null;
  storage_path?: string | null;
  source_track_id?: string | null;
  clip_start_seconds?: number | null;
  clip_end_seconds?: number | null;
};

type Question = {
  id: string;
  question_number: number;
  question_text: string;
};

const vaults: {
  name: VaultPerson;
  title: string;
}[] = [
  { name: 'Papa', title: "Papa's Life" },
  { name: 'Dad', title: "Dad's Life" },
  { name: 'Mom', title: "Mom's Life" },
];

export default function AdminUpload() {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [title, setTitle] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [vaultPerson, setVaultPerson] =
    useState<VaultPerson>('Dad');
  const [category, setCategory] = useState('General');
  const [questionId, setQuestionId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);

  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [transcriptDraft, setTranscriptDraft] = useState('');
  const [storyTitleDraft, setStoryTitleDraft] = useState('');
  const [storyDraft, setStoryDraft] = useState('');

  const [savingEditor, setSavingEditor] = useState(false);
  const [reTranscribing, setReTranscribing] = useState(false);
  const [labelingSpeakers, setLabelingSpeakers] = useState(false);
  const [creatingStory, setCreatingStory] = useState(false);

  const [storyAction, setStoryAction] =
    useState<'create' | 'improve'>('create');

  const [editorMessage, setEditorMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [backingUp, setBackingUp] = useState(false);

  const editorAudioRef = useRef<HTMLAudioElement | null>(null);

  const selectedTrack =
    tracks.find((track) => track.id === selectedTrackId) || null;

  useEffect(() => {
    void start();
  }, []);

  async function start() {
    setCheckingAccess(true);

    try {
      const response = await fetch('/api/cloudflare/member', {
        cache: 'no-store',
      });

      const data = (await response.json()) as {
        member?: {
          isAdmin: boolean;
        };
      };

      const allowed =
        response.ok && !!data.member?.isAdmin;

      setIsAdmin(allowed);

      if (allowed) {
        await Promise.all([
          fetchTracks(),
          fetchQuestions(),
        ]);
      }
    } catch {
      setIsAdmin(false);
    } finally {
      setCheckingAccess(false);
    }
  }

  function requestedTrackId() {
    if (typeof window === 'undefined') return '';

    return (
      new URLSearchParams(window.location.search).get('trackId') || ''
    );
  }

  async function fetchQuestions() {
    try {
      const response = await fetch('/api/cloudflare/questions', {
        cache: 'no-store',
      });

      const data = (await response.json()) as {
        questions?: Question[];
      };

      if (response.ok) {
        setQuestions(data.questions || []);
      }
    } catch {
      // Questions are optional during upload.
    }
  }

  async function fetchTracks(preferredId?: string) {
    setLoadingTracks(true);

    try {
      const response = await fetch('/api/cloudflare/recordings', {
        cache: 'no-store',
      });

      const data = (await response.json()) as {
        recordings?: AudioTrack[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error || 'Could not load the recordings.',
        );
      }

      const nextTracks = data.recordings || [];
      setTracks(nextTracks);

      const requested =
        preferredId ||
        requestedTrackId() ||
        selectedTrackId;

      const nextTrack =
        nextTracks.find((track) => track.id === requested) ||
        nextTracks[0] ||
        null;

      setSelectedTrackId(nextTrack?.id || '');
      setTranscriptDraft(nextTrack?.transcript || '');
      setStoryTitleDraft(nextTrack?.story_title || '');
      setStoryDraft(nextTrack?.story_chapter || '');
    } catch (error) {
      setEditorMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Could not load the recordings.',
      });
    } finally {
      setLoadingTracks(false);
    }
  }

  function chooseTrack(id: string) {
    const track =
      tracks.find((item) => item.id === id) || null;

    setSelectedTrackId(id);
    setTranscriptDraft(track?.transcript || '');
    setStoryTitleDraft(track?.story_title || '');
    setStoryDraft(track?.story_chapter || '');
    setEditorMessage(null);

    const url = new URL(window.location.href);
    url.searchParams.set('trackId', id);
    window.history.replaceState({}, '', url);
  }

  async function saveEditor() {
    if (!selectedTrack) return;

    setSavingEditor(true);
    setEditorMessage(null);

    try {
      const response = await fetch(
        `/api/cloudflare/recordings/${selectedTrack.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transcript: transcriptDraft,
            storyTitle: storyTitleDraft,
            storyChapter: storyDraft,
          }),
        },
      );

      const result = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error || 'Your changes could not be saved.',
        );
      }

      setEditorMessage({
        type: 'success',
        text: 'Your transcript and story changes were saved.',
      });

      await fetchTracks(selectedTrack.id);
    } catch (error) {
      setEditorMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Your changes could not be saved.',
      });
    } finally {
      setSavingEditor(false);
    }
  }

  async function copyTranscript() {
    if (!transcriptDraft.trim()) return;

    try {
      await navigator.clipboard.writeText(transcriptDraft);

      setEditorMessage({
        type: 'success',
        text: 'Transcript copied.',
      });
    } catch {
      setEditorMessage({
        type: 'error',
        text:
          'Your browser would not allow copying. Select the text and press Ctrl+C.',
      });
    }
  }

  async function requestSpeakerLabels(
    trackId: string,
    transcript?: string,
  ) {
    const response = await fetch(
      '/api/cloudflare/label-speakers',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trackId,
          transcript,
        }),
      },
    );

    const result = (await response.json()) as {
      error?: string;
      transcript?: string;
      speakerCount?: number;
    };

    if (!response.ok || !result.transcript) {
      throw new Error(
        result.error || 'The speakers could not be labeled.',
      );
    }

    return result;
  }

  async function reTranscribe() {
    if (!selectedTrack) return;

    setReTranscribing(true);
    setEditorMessage(null);

    try {
      const response = await fetch(
        '/api/cloudflare/transcribe',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            trackId: selectedTrack.id,
          }),
        },
      );

      const result = (await response.json()) as {
        error?: string;
        transcript?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error || 'The transcript could not be created.',
        );
      }

      let speakerMessage = '';

      if (result.transcript?.trim()) {
        try {
          const labeled = await requestSpeakerLabels(
            selectedTrack.id,
            result.transcript,
          );

          speakerMessage =
            ` It was separated into ${labeled.speakerCount || 2} speakers.`;
        } catch {
          speakerMessage =
            ' The transcript was saved, but automatic speaker labeling was not completed.';
        }
      }

      setEditorMessage({
        type: 'success',
        text:
          `A fresh word-for-word transcript was created.${speakerMessage}`,
      });

      await fetchTracks(selectedTrack.id);
    } catch (error) {
      setEditorMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'The transcript could not be created.',
      });
    } finally {
      setReTranscribing(false);
    }
  }

  async function labelExistingTranscript() {
    if (!selectedTrack || !transcriptDraft.trim()) return;

    setLabelingSpeakers(true);
    setEditorMessage(null);

    try {
      const result = await requestSpeakerLabels(
        selectedTrack.id,
        transcriptDraft,
      );

      setTranscriptDraft(result.transcript || '');

      setEditorMessage({
        type: 'success',
        text:
          `The transcript was separated into ${result.speakerCount || 2} speakers without changing its words.`,
      });

      await fetchTracks(selectedTrack.id);
    } catch (error) {
      setEditorMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'The speakers could not be labeled.',
      });
    } finally {
      setLabelingSpeakers(false);
    }
  }

  async function createStory(
    mode: 'create' | 'improve' = 'create',
  ) {
    if (!selectedTrack || !transcriptDraft.trim()) {
      setEditorMessage({
        type: 'error',
        text:
          'This recording needs a transcript before a story can be created.',
      });
      return;
    }

    if (mode === 'improve' && !storyDraft.trim()) {
      setEditorMessage({
        type: 'error',
        text: 'There is no current story to improve yet.',
      });
      return;
    }

    setStoryAction(mode);
    setCreatingStory(true);
    setEditorMessage(null);

    try {
      // Save any transcript corrections before asking AI
      // to create the story.
      const saveTranscriptResponse = await fetch(
        `/api/cloudflare/recordings/${selectedTrack.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transcript: transcriptDraft,
          }),
        },
      );

      const savedTranscript =
        (await saveTranscriptResponse.json()) as {
          error?: string;
        };

      if (!saveTranscriptResponse.ok) {
        throw new Error(
          savedTranscript.error ||
            'The transcript could not be saved first.',
        );
      }

      const response = await fetch('/api/cloudflare/story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trackId: selectedTrack.id,
          mode,
          currentTitle: storyTitleDraft,
          currentStory: storyDraft,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error || 'The family story could not be created.',
        );
      }

      setEditorMessage({
        type: 'success',
        text:
          mode === 'improve'
            ? 'The current story was improved. Read it over and save any final edits.'
            : 'The family story is ready. Read it over and make any changes you want.',
      });

      await fetchTracks(selectedTrack.id);
    } catch (error) {
      setEditorMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'The family story could not be created.',
      });
    } finally {
      setCreatingStory(false);
    }
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();

    if (!file || !title.trim() || !speaker.trim()) {
      setMessage({
        type: 'error',
        text:
          'Please add a title, speaker, and audio file.',
      });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const form = new FormData();

      form.append('file', file);
      form.append('title', title.trim());
      form.append('speaker', speaker.trim());
      form.append('category', category);
      form.append('vaultPerson', vaultPerson);
      form.append('storyChapter', '');
      form.append('questionId', questionId);

      const uploadResponse = await fetch(
        '/api/cloudflare/upload',
        {
          method: 'POST',
          body: form,
        },
      );

      const uploadResult = (await uploadResponse.json()) as {
        error?: string;
        recording?: {
          id?: string;
        };
        id?: string;
      };

      if (!uploadResponse.ok) {
        throw new Error(
          uploadResult.error || 'The recording could not be saved.',
        );
      }

      const newTrackId =
        uploadResult.recording?.id || uploadResult.id || '';

      if (!newTrackId) {
        throw new Error(
          'The recording was saved, but its new ID was not returned.',
        );
      }

      setTranscribing(true);
      setMessage({
        type: 'success',
        text:
          'Recording saved. Creating the word-for-word transcript now…',
      });

      const transcriptionResponse = await fetch(
        '/api/cloudflare/transcribe',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            trackId: newTrackId,
          }),
        },
      );

      const transcriptionResult =
        (await transcriptionResponse.json()) as {
          error?: string;
          transcript?: string;
        };

      if (!transcriptionResponse.ok) {
        setMessage({
          type: 'error',
          text:
            `The recording was safely saved, but the transcript could not be created: ${
              transcriptionResult.error || 'Unknown error'
            }`,
        });

        await fetchTracks(newTrackId);
        return;
      }

      if (transcriptionResult.transcript?.trim()) {
        try {
          await requestSpeakerLabels(
            newTrackId,
            transcriptionResult.transcript,
          );
        } catch {
          // The original transcript remains safely saved.
        }
      }

      setMessage({
        type: 'success',
        text:
          `Saved to ${vaultPerson}'s Vault and transcribed successfully.`,
      });

      setTitle('');
      setSpeaker('');
      setVaultPerson('Dad');
      setCategory('General');
      setQuestionId('');
      setFile(null);
      setFileInputKey((key) => key + 1);

      await fetchTracks(newTrackId);
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'The audio could not be uploaded.',
      });
    } finally {
      setUploading(false);
      setTranscribing(false);
    }
  }

  async function downloadFullVaultBackup() {
    setBackingUp(true);

    try {
      const response = await fetch('/api/cloudflare/backup');

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        throw new Error(
          result?.error || 'The backup could not be created.',
        );
      }

      const blob = await response.blob();

      const disposition =
        response.headers.get('content-disposition') || '';

      const match = disposition.match(/filename="?([^"]+)"?/i);

      const filename =
        match?.[1] ||
        `fields-family-vault-backup-${new Date()
          .toISOString()
          .slice(0, 10)}.zip`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
            Only Vault administrators can add or change recordings.
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
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-[#8a561f]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Fields Family Vault
          </a>

          <a
            href="/project-tools"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#8a561f]"
          >
            <Wrench className="h-4 w-4" />
            Project Tools
          </a>
        </div>

        <header className="mt-6 border-b border-stone-300 pb-7">
          <p className="text-xs font-semibold uppercase tracking-[.22em] text-[#a66b27]">
            Add to the collection
          </p>

          <h1 className="mt-2 font-serif text-4xl text-stone-900 md:text-5xl">
            Preserve a Memory
          </h1>

          <p className="mt-3 text-stone-600">
            Save the original recording, create its transcript, and
            build the family story.
          </p>
        </header>

        <section className="mt-8 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
          {message && (
            <div
              className={`mb-6 flex gap-3 rounded-xl border p-4 text-sm ${
                message.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle className="h-5 w-5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0" />
              )}

              {message.text}
            </div>
          )}

          <form onSubmit={handleUpload} className="space-y-7">
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[#a66b27]" />
                <label className="text-sm font-semibold">
                  Belongs in which legacy book? *
                </label>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {vaults.map((vault) => (
                  <button
                    key={vault.name}
                    type="button"
                    onClick={() => setVaultPerson(vault.name)}
                    className={`rounded-2xl border p-4 text-left ${
                      vaultPerson === vault.name
                        ? 'border-[#b57931] bg-[#f4e7cf]'
                        : 'border-stone-300 bg-white'
                    }`}
                  >
                    <span className="flex items-center gap-2 font-serif text-lg">
                      <Headphones className="h-4 w-4 text-[#a66b27]" />
                      {vault.name}
                    </span>

                    <span className="mt-1 block text-xs text-stone-600">
                      {vault.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold">
                Recording title *
              </label>

              <input
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Example: How Dad Met Mom"
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]"
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-[#a66b27]" />
                  <label className="text-sm font-semibold">
                    Speaker / people heard *
                  </label>
                </div>

                <input
                  required
                  value={speaker}
                  onChange={(event) => setSpeaker(event.target.value)}
                  placeholder="Example: Dad and Dan"
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <Tag className="h-4 w-4 text-[#a66b27]" />
                  <label className="text-sm font-semibold">
                    Chapter / category
                  </label>
                </div>

                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
                >
                  <option>General</option>
                  <option>Childhood</option>
                  <option>Love & Marriage</option>
                  <option>Military & Work</option>
                  <option>Faith</option>
                  <option>Holidays & Family</option>
                  <option>Life Lessons</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold">
                Story question{' '}
                <span className="font-normal text-stone-500">
                  (optional)
                </span>
              </label>

              <select
                value={questionId}
                onChange={(event) => setQuestionId(event.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
              >
                <option value="">Not linked to a question</option>

                {questions.map((question) => (
                  <option key={question.id} value={question.id}>
                    {question.question_number}. {question.question_text}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <FileAudio className="h-4 w-4 text-[#a66b27]" />
                <label className="text-sm font-semibold">
                  Original audio file *
                </label>
              </div>

              <input
                key={fileInputKey}
                type="file"
                accept="audio/*"
                required
                onChange={(event) =>
                  setFile(event.target.files?.[0] || null)
                }
                className="w-full rounded-xl border border-dashed border-stone-400 bg-white px-4 py-3"
              />

              {file && (
                <p className="mt-2 text-sm text-stone-600">
                  Ready to upload:{' '}
                  <span className="font-medium">{file.name}</span>
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3.5 font-semibold text-white disabled:bg-stone-400"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {transcribing
                    ? 'Transcribing recording…'
                    : 'Saving memory…'}
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  Save to {vaultPerson}&apos;s Vault
                </>
              )}
            </button>
          </form>
        </section>

        <section className="mt-10 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">
            Backup & Preserve
          </p>

          <h2 className="mt-2 font-serif text-3xl text-stone-900">
            Download Full Vault Backup
          </h2>

          <p className="mt-2 text-sm text-stone-600">
            Creates one ZIP containing the original audio,
            transcripts, stories, and Vault metadata.
          </p>

          <button
            type="button"
            onClick={() => void downloadFullVaultBackup()}
            disabled={backingUp}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#3b4536] px-5 py-3 font-semibold text-white disabled:bg-stone-400"
          >
            {backingUp ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Download className="h-5 w-5" />
            )}

            {backingUp
              ? 'Creating backup…'
              : 'Download Full Vault Backup'}
          </button>
        </section>

        <section className="mt-10 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-3 border-b border-stone-200 pb-6 sm:flex-row sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">
                Story Studio
              </p>

              <h2 className="mt-2 font-serif text-3xl text-stone-900">
                Transcripts & family stories
              </h2>
            </div>

            <button
              type="button"
              onClick={() => void fetchTracks(selectedTrackId)}
              className="inline-flex w-fit items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  loadingTracks ? 'animate-spin' : ''
                }`}
              />
              Refresh
            </button>
          </div>

          {editorMessage && (
            <div
              className={`mt-6 flex gap-3 rounded-xl border p-4 text-sm ${
                editorMessage.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {editorMessage.type === 'success' ? (
                <CheckCircle className="h-5 w-5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0" />
              )}

              {editorMessage.text}
            </div>
          )}

          {!tracks.length && !loadingTracks ? (
            <p className="mt-6 rounded-xl bg-stone-100 p-4 text-sm text-stone-600">
              Upload your first recording above, then it will appear
              here.
            </p>
          ) : (
            <div className="mt-6 space-y-6">
              <div>
                <label className="mb-1.5 block text-sm font-semibold">
                  Choose a recording
                </label>

                <select
                  value={selectedTrackId}
                  onChange={(event) => chooseTrack(event.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
                >
                  {tracks.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.vault_person} · {track.title} ·{' '}
                      {new Date(track.created_at).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>

              {selectedTrack && (
                <>
                  <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
                    <span className="font-semibold text-stone-800">
                      {selectedTrack.speaker}
                    </span>{' '}
                    · {selectedTrack.category || 'General'} · Transcript:{' '}
                    <span className="font-medium">
                      {selectedTrack.transcription_status ||
                        'not started'}
                    </span>{' '}
                    · Story:{' '}
                    <span className="font-medium">
                      {selectedTrack.story_status || 'not started'}
                    </span>
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-[#f8f3e9] p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Headphones className="h-4 w-4 text-[#a66b27]" />
                      <p className="text-sm font-semibold">
                        Listen while you work
                      </p>
                    </div>

                    <audio
                      ref={editorAudioRef}
                      key={selectedTrack.id}
                      controls
                      preload="metadata"
                      src={`/api/cloudflare/audio/${selectedTrack.id}`}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <label className="text-sm font-semibold">
                        Word-for-word transcript
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void copyTranscript()}
                          disabled={!transcriptDraft.trim()}
                          className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
                        >
                          <Copy className="h-4 w-4" />
                          Copy
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void labelExistingTranscript()
                          }
                          disabled={
                            labelingSpeakers ||
                            reTranscribing ||
                            creatingStory ||
                            !transcriptDraft.trim()
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
                        >
                          {labelingSpeakers ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserRound className="h-4 w-4" />
                          )}

                          {labelingSpeakers
                            ? 'Labeling…'
                            : 'Label speakers'}
                        </button>

                        <button
                          type="button"
                          onClick={() => void reTranscribe()}
                          disabled={
                            reTranscribing ||
                            labelingSpeakers ||
                            creatingStory
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
                        >
                          {reTranscribing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}

                          {reTranscribing
                            ? 'Re-transcribing…'
                            : 'Re-transcribe'}
                        </button>
                      </div>
                    </div>

                    <textarea
                      rows={12}
                      value={transcriptDraft}
                      onChange={(event) =>
                        setTranscriptDraft(event.target.value)
                      }
                      placeholder="The transcript will appear here."
                      className="w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 leading-relaxed"
                    />
                  </div>

                  <div className="border-t border-stone-200 pt-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">
                          Family Story
                        </p>

                        <p className="mt-1 text-sm text-stone-600">
                          Create a story from the transcript or improve
                          the story already saved.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void createStory('create')}
                          disabled={
                            creatingStory ||
                            reTranscribing ||
                            !transcriptDraft.trim()
                          }
                          className="inline-flex items-center gap-2 rounded-xl bg-[#80542a] px-4 py-3 text-sm font-semibold text-white disabled:bg-stone-400"
                        >
                          {creatingStory &&
                          storyAction === 'create' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}

                          {creatingStory &&
                          storyAction === 'create'
                            ? 'Creating story…'
                            : storyDraft
                              ? 'Create a New Story'
                              : 'Create Story with AI'}
                        </button>

                        <button
                          type="button"
                          onClick={() => void createStory('improve')}
                          disabled={
                            creatingStory ||
                            reTranscribing ||
                            !transcriptDraft.trim() ||
                            !storyDraft.trim()
                          }
                          className="inline-flex items-center gap-2 rounded-xl border border-[#80542a] bg-white px-4 py-3 text-sm font-semibold text-[#65431f] disabled:opacity-50"
                        >
                          <Wrench className="h-4 w-4" />
                          Improve Current Story
                        </button>
                      </div>
                    </div>

                    <div className="mt-5">
                      <label className="mb-1.5 block text-sm font-semibold">
                        Story title
                      </label>

                      <input
                        value={storyTitleDraft}
                        onChange={(event) =>
                          setStoryTitleDraft(event.target.value)
                        }
                        className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
                      />
                    </div>

                    <div className="mt-5">
                      <label className="mb-1.5 block text-sm font-semibold">
                        Book-style story
                      </label>

                      <textarea
                        rows={12}
                        value={storyDraft}
                        onChange={(event) =>
                          setStoryDraft(event.target.value)
                        }
                        className="w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 font-serif leading-relaxed"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void saveEditor()}
                    disabled={
                      savingEditor ||
                      creatingStory ||
                      reTranscribing
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3.5 font-semibold text-white disabled:bg-stone-400"
                  >
                    {savingEditor ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Save className="h-5 w-5" />
                    )}

                    {savingEditor
                      ? 'Saving changes…'
                      : 'Save transcript and story changes'}
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

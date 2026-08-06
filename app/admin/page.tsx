'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import JSZip from 'jszip';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle,
  Copy,
  FileAudio,
  Headphones,
  Loader2,
  Lock,
  LogOut,
  ShieldCheck,
  Sparkles,
  Save,
  RefreshCw,
  Tag,
  Upload,
  UserRound,
    Download,
    Wrench,
} from 'lucide-react';

const vaults = [
  { name: 'Papa', title: "Papa's Life" },
  { name: 'Dad', title: "Dad's Life" },
  { name: 'Mom', title: "Mom's Life" },
];

type AudioTrack = {
  id: string;
  title: string;
  speaker: string;
  category: string;
  vault_person?: string | null;
  created_at: string;
  transcript?: string | null;
  story_title?: string | null;
  story_chapter?: string | null;
  transcription_status?: string | null;
  storage_path?: string | null;
  audio_url?: string | null;
  source_track_id?: string | null;
  clip_start_seconds?: number | null;
  clip_end_seconds?: number | null;
};

function getStoragePath(track: AudioTrack) {
  if (track.storage_path) return track.storage_path;

  // Supports recordings uploaded before the private-storage change.
  const marker = '/audio-files/';
  const oldPath = track.audio_url?.split(marker)[1];
  return oldPath || null;
}

export default function AdminUpload() {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  const [title, setTitle] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [vaultPerson, setVaultPerson] = useState('Dad');
  const [category, setCategory] = useState('General');
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [storyChapter, setStoryChapter] = useState('');

  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [transcriptDraft, setTranscriptDraft] = useState('');
  const [storyTitleDraft, setStoryTitleDraft] = useState('');
  const [storyDraft, setStoryDraft] = useState('');
  const [savingEditor, setSavingEditor] = useState(false);
  const [reTranscribing, setReTranscribing] = useState(false);
  const [labelingSpeakers, setLabelingSpeakers] = useState(false);
  const [creatingStory, setCreatingStory] = useState(false);
  const [editorMessage, setEditorMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editorAudioUrl, setEditorAudioUrl] = useState('');
  const [editorAudioLoading, setEditorAudioLoading] = useState(false);
  const [editorAudioError, setEditorAudioError] = useState('');
  const editorAudioRef = useRef<HTMLAudioElement | null>(null);
const [backingUp, setBackingUp] = useState(false);
const [backupMessage, setBackupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) || null;
  const editorClipStart = Math.max(0, selectedTrack?.clip_start_seconds || 0);
  const editorClipEnd =
    typeof selectedTrack?.clip_end_seconds === 'number' &&
    selectedTrack.clip_end_seconds > editorClipStart
      ? selectedTrack.clip_end_seconds
      : null;

  useEffect(() => {
    async function checkAccess() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setIsAuthenticated(!!session);

      if (!session) {
        setIsAdmin(false);
        setCheckingAccess(false);
        return;
      }

      const { data, error } = await supabase
        .from('vault_admins')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      setIsAdmin(!!data && !error);
      setCheckingAccess(false);
    }

    void checkAccess();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void checkAccess();
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isAdmin) void fetchTracks();
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;

    async function loadEditorAudio() {
      setEditorAudioUrl('');
      setEditorAudioError('');

      const track = tracks.find((item) => item.id === selectedTrackId);
      if (!track) {
        setEditorAudioLoading(false);
        return;
      }

      setEditorAudioLoading(true);
      const storagePath = getStoragePath(track);

      if (storagePath) {
        const { data, error } = await supabase.storage
          .from('audio-files')
          .createSignedUrl(storagePath, 60 * 60);

        if (cancelled) return;
        if (error || !data?.signedUrl) {
          setEditorAudioError(error?.message || 'Could not open this recording.');
        } else {
          setEditorAudioUrl(data.signedUrl);
        }
      } else if (track.audio_url) {
        if (!cancelled) setEditorAudioUrl(track.audio_url);
      } else if (!cancelled) {
        setEditorAudioError('No audio file is connected to this recording.');
      }

      if (!cancelled) setEditorAudioLoading(false);
    }

    void loadEditorAudio();
    return () => {
      cancelled = true;
    };
  }, [selectedTrackId, tracks]);

  function prepareEditorAudio() {
    const audio = editorAudioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(editorClipStart, audio.duration || editorClipStart);
  }

  function keepEditorAudioInsideClip() {
    const audio = editorAudioRef.current;
    if (!audio) return;

    if (audio.currentTime < editorClipStart) {
      audio.currentTime = editorClipStart;
    }

    if (editorClipEnd && audio.currentTime >= editorClipEnd - 0.05) {
      audio.pause();
      audio.currentTime = editorClipStart;
    }
  }

  function startEditorAudioInsideClip() {
    const audio = editorAudioRef.current;
    if (!audio) return;
    if (
      audio.currentTime < editorClipStart ||
      (editorClipEnd && audio.currentTime >= editorClipEnd - 0.05)
    ) {
      audio.currentTime = editorClipStart;
    }
  }

  async function fetchTracks(preferredId?: string) {
    setLoadingTracks(true);
    const { data, error } = await supabase
      .from('audio_tracks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setEditorMessage({ type: 'error', text: 'Could not load the recordings.' });
      setLoadingTracks(false);
      return;
    }

    const nextTracks = (data || []) as AudioTrack[];
    setTracks(nextTracks);
    const nextId = preferredId || selectedTrackId || nextTracks[0]?.id || '';
    const nextTrack = nextTracks.find((track) => track.id === nextId) || nextTracks[0] || null;
    setSelectedTrackId(nextTrack?.id || '');
    setTranscriptDraft(nextTrack?.transcript || '');
    setStoryTitleDraft(nextTrack?.story_title || '');
    setStoryDraft(nextTrack?.story_chapter || '');
    setLoadingTracks(false);
  }

  function chooseTrack(id: string) {
    const track = tracks.find((item) => item.id === id) || null;
    setSelectedTrackId(id);
    setTranscriptDraft(track?.transcript || '');
    setStoryTitleDraft(track?.story_title || '');
    setStoryDraft(track?.story_chapter || '');
    setEditorMessage(null);
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError('');
    setResetMessage('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoginError('That email or password did not work. Please try again.');
    }
  }

  async function handlePasswordReset() {
    setLoginError('');
    setResetMessage('');

    if (!email) {
      setLoginError('Enter your email address first, then click Forgot password.');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setLoginError(error.message);
      return;
    }

    setResetMessage('Password-reset email sent. Check your inbox.');
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setEmail('');
    setPassword('');
  }

  async function saveEditor() {
    if (!selectedTrack) return;
    setSavingEditor(true);
    setEditorMessage(null);
    const { error } = await supabase
      .from('audio_tracks')
      .update({
        transcript: transcriptDraft.trim() || null,
        story_title: storyTitleDraft.trim() || null,
        story_chapter: storyDraft.trim() || null,
      })
      .eq('id', selectedTrack.id);
    setSavingEditor(false);
    if (error) {
      setEditorMessage({ type: 'error', text: error.message });
      return;
    }
    setEditorMessage({ type: 'success', text: 'Your changes were saved.' });
    await fetchTracks(selectedTrack.id);
  }

  async function copyTranscript() {
    if (!transcriptDraft.trim()) return;
    try {
      await navigator.clipboard.writeText(transcriptDraft);
      setEditorMessage({ type: 'success', text: 'Transcript copied.' });
    } catch {
      setEditorMessage({ type: 'error', text: 'Your browser would not allow copying. Select the text and press Ctrl+C.' });
    }
  }

  async function reTranscribe() {
    if (!selectedTrack) return;
    setReTranscribing(true);
    setEditorMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ trackId: selectedTrack.id }),
        signal: AbortSignal.timeout(55_000),
      });

      const result = await response.json().catch(() => null) as {
        error?: string;
        transcript?: string;
      } | null;
      if (!response.ok) {
        throw new Error(result?.error || 'The transcription service timed out. Please try again.');
      }

      const labeled = await requestSpeakerLabels(session?.access_token || '', result?.transcript || '');
      setEditorMessage({
        type: 'success',
        text: `A fresh word-for-word transcript was created and separated into ${labeled.speakerCount} speakers. Review it, then save if you make edits.`,
      });
      await fetchTracks(selectedTrack.id);
    } catch (error) {
      const text =
        error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
          ? 'The transcription took too long. Please try again.'
          : error instanceof Error
            ? error.message
            : 'The transcript could not be created.';
      setEditorMessage({ type: 'error', text });
    } finally {
      setReTranscribing(false);
    }
  }

  async function requestSpeakerLabels(accessToken: string, transcript: string) {
    const response = await fetch('/api/label-speakers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ trackId: selectedTrack?.id, transcript }),
      signal: AbortSignal.timeout(55_000),
    });
    const result = await response.json().catch(() => null) as {
      error?: string;
      transcript?: string;
      speakerCount?: number;
    } | null;
    if (!response.ok || !result?.transcript) {
      throw new Error(result?.error || 'The speaker-label service timed out. Please try again.');
    }
    return { transcript: result.transcript, speakerCount: result.speakerCount || 2 };
  }

  async function labelExistingTranscript() {
    if (!selectedTrack || !transcriptDraft.trim()) return;
    setLabelingSpeakers(true);
    setEditorMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const result = await requestSpeakerLabels(session?.access_token || '', transcriptDraft);
      setTranscriptDraft(result.transcript);
      setEditorMessage({
        type: 'success',
        text: `The existing transcript was separated into ${result.speakerCount} speakers without changing its words.`,
      });
      await fetchTracks(selectedTrack.id);
    } catch (error) {
      setEditorMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'The speakers could not be labeled.',
      });
    } finally {
      setLabelingSpeakers(false);
    }
  }

  async function createStory() {
    if (!selectedTrack || !transcriptDraft.trim()) {
      setEditorMessage({ type: 'error', text: 'This recording needs a transcript before a story can be created.' });
      return;
    }
    setCreatingStory(true);
    setEditorMessage(null);
    const { error: saveTranscriptError } = await supabase
      .from('audio_tracks')
      .update({ transcript: transcriptDraft.trim(), transcription_status: 'complete', transcription_error: null })
      .eq('id', selectedTrack.id);
    if (saveTranscriptError) {
      setCreatingStory(false);
      setEditorMessage({ type: 'error', text: saveTranscriptError.message });
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ trackId: selectedTrack.id }),
    });
    const result = (await response.json()) as { error?: string };
    setCreatingStory(false);
    if (!response.ok) {
      setEditorMessage({ type: 'error', text: result.error || 'The family story could not be created.' });
      return;
    }
    setEditorMessage({ type: 'success', text: 'The AI story and title are ready. Read it over and make any changes you want before saving.' });
    await fetchTracks(selectedTrack.id);
  }

    function safeFilePart(value: string) {
    return (value || 'untitled')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90);
  }

  function saveBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadFullVaultBackup() {
    setBackingUp(true);
    setBackupMessage(null);

    try {
      const { data, error } = await supabase
        .from('audio_tracks')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const backupTracks = (data || []) as AudioTrack[];
      const zip = new JSZip();
      const missingAudio: string[] = [];
      const index: Array<Record<string, string | null>> = [];

      zip.file(
        'README.txt',
        [
          'Fields Family Vault Backup',
          `Created: ${new Date().toLocaleString()}`,
          '',
          'This backup contains the original audio recordings, word-for-word transcripts,',
          'book-style family stories, and an index of the saved vault information.',
          '',
          'Folders:',
          '- audio: original recordings',
          '- transcripts: editable word-for-word transcripts',
          '- stories: book-style stories created from reviewed transcripts',
          '- metadata: an index file for the entire collection',
        ].join('\n')
      );

      for (let i = 0; i < backupTracks.length; i += 1) {
        const track = backupTracks[i];
        const date = new Date(track.created_at);
        const datePart = Number.isNaN(date.getTime())
          ? 'unknown-date'
          : date.toISOString().slice(0, 10);
        const baseName = `${String(i + 1).padStart(3, '0')}-${datePart}-${safeFilePart(track.title)}`;

        setBackupMessage({
          type: 'success',
          text: `Collecting recording ${i + 1} of ${backupTracks.length}… Keep this page open until the download starts.`,
        });

        zip.file(
          `transcripts/${baseName}.txt`,
          [
            `Title: ${track.title}`,
            `Vault: ${track.vault_person || 'Not specified'}`,
            `Speaker: ${track.speaker || 'Not specified'}`,
            `Category: ${track.category || 'General'}`,
            `Recorded: ${date.toLocaleString()}`,
            '',
            track.transcript || '[No transcript saved]',
          ].join('\n')
        );

        if (track.story_chapter || track.story_title) {
          zip.file(
            `stories/${baseName}.txt`,
            [
              `Title: ${track.story_title || track.title}`,
              `Source recording: ${track.title}`,
              `Vault: ${track.vault_person || 'Not specified'}`,
              `Recorded: ${date.toLocaleString()}`,
              '',
              track.story_chapter || '[No book-style story saved]',
            ].join('\n')
          );
        }

        const audioFileName = `${baseName}.${(track.storage_path || track.audio_url || 'audio').split('.').pop()?.split('?')[0] || 'audio'}`;

        index.push({
          id: track.id,
          title: track.title || null,
          vault_person: track.vault_person || null,
          speaker: track.speaker || null,
          category: track.category || null,
          created_at: track.created_at || null,
          transcript_status: track.transcription_status || null,
          transcript_file: `transcripts/${baseName}.txt`,
          story_title: track.story_title || null,
          story_file: track.story_chapter || track.story_title ? `stories/${baseName}.txt` : null,
          audio_file: `audio/${audioFileName}`,
        });

        let audioBlob: Blob | null = null;

        if (track.storage_path) {
          const { data: fileData, error: fileError } = await supabase.storage
            .from('audio-files')
            .download(track.storage_path);

          if (fileError) {
            missingAudio.push(`${track.title}: ${fileError.message}`);
          } else {
            audioBlob = fileData;
          }
        } else if (track.audio_url) {
          const response = await fetch(track.audio_url);
          if (!response.ok) {
            missingAudio.push(`${track.title}: Could not download legacy audio file.`);
          } else {
            audioBlob = await response.blob();
          }
        } else {
          missingAudio.push(`${track.title}: No audio-file location was saved.`);
        }

        if (audioBlob) {
          zip.file(`audio/${audioFileName}`, audioBlob);
        }
      }

      zip.file('metadata/vault-index.json', JSON.stringify(index, null, 2));

      if (missingAudio.length > 0) {
        zip.file(
          'MISSING-AUDIO-FILES.txt',
          [
            'These recordings were included as transcripts/stories, but their audio file could not be added:',
            '',
            ...missingAudio,
          ].join('\n')
        );
      }

      setBackupMessage({
        type: 'success',
        text: 'Building your ZIP file now…',
      });

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      const today = new Date().toISOString().slice(0, 10);
      saveBlob(zipBlob, `fields-family-vault-backup-${today}.zip`);

      setBackupMessage({
        type: 'success',
        text: missingAudio.length
          ? 'Backup downloaded. See MISSING-AUDIO-FILES.txt inside the ZIP for items that need attention.'
          : 'Full vault backup downloaded successfully.',
      });
    } catch (err: unknown) {
      setBackupMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'The backup could not be created.',
      });
    } finally {
      setBackingUp(false);
    }
  }
  async function handleUpload(e: FormEvent) {
    e.preventDefault();

    if (!file || !title || !speaker) {
      setMessage({
        type: 'error',
        text: 'Please add a title, speaker, and audio file.',
      });
      return;
    }

    setUploading(true);
    setMessage(null);

    const extension = file.name.split('.').pop()?.toLowerCase() || 'audio';
    const filePath = `recordings/${crypto.randomUUID()}.${extension}`;
    let fileWasUploaded = false;
    let recordingWasSaved = false;

    try {
      const { error: uploadError } = await supabase.storage
        .from('audio-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;
      fileWasUploaded = true;

      const { data: savedTrack, error: dbError } = await supabase
        .from('audio_tracks')
        .insert([
          {
            title,
            speaker,
            category,
            vault_person: vaultPerson,
            storage_path: filePath,
            story_chapter: storyChapter || null,
            transcription_status: 'queued',
          },
        ])
        .select('id')
        .single();

      if (dbError) throw dbError;
      recordingWasSaved = true;

      setTranscribing(true);
      setMessage({ type: 'success', text: 'Saved. Creating the word-for-word transcript now…' });

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const transcriptionResponse = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ trackId: savedTrack.id }),
      });

      const transcriptionResult = (await transcriptionResponse.json()) as { error?: string };
      if (!transcriptionResponse.ok) {
        setMessage({
          type: 'error',
          text: `The recording was saved, but the transcript could not be created: ${transcriptionResult.error || 'Unknown error'}`,
        });
        return;
      }

      const freshTranscript = (transcriptionResult as { transcript?: string }).transcript || '';
      try {
        await fetch('/api/label-speakers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token || ''}`,
          },
          body: JSON.stringify({ trackId: savedTrack.id, transcript: freshTranscript }),
        });
      } catch {
        // The word-for-word transcript is still saved if optional speaker labeling fails.
      }

      setMessage({ type: 'success', text: `Saved to ${vaultPerson}'s vault and transcribed.` });
      setTitle('');
      setSpeaker('');
      setVaultPerson('Dad');
      setCategory('General');
      setFile(null);
      setFileInputKey((key) => key + 1);
      setStoryChapter('');
    } catch (err: unknown) {









      
      if (fileWasUploaded && !recordingWasSaved) {
        await supabase.storage.from('audio-files').remove([filePath]);
      }

      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to upload audio.',
      });
    } finally {
      setUploading(false);
      setTranscribing(false);
    }
  }

  if (checkingAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] text-stone-700">
        <Loader2 className="h-7 w-7 animate-spin text-[#a66b27]" />
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] p-5 text-stone-800">
        <div className="w-full max-w-md overflow-hidden rounded-3xl border border-stone-300 bg-[#fffaf0] shadow-xl">
          <div className="bg-[#20221e] p-8 text-center text-stone-100">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#c98b3c] text-[#20221e]">
              <Lock className="h-5 w-5" />
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#e3bb77]">
              Fields Family Vault
            </p>
            <h1 className="mt-2 font-serif text-3xl">Admin Sign In</h1>
            <p className="mt-3 text-sm leading-relaxed text-stone-300">
              Sign in to preserve another family memory.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5 p-7">
            {loginError && (
              <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {loginError}
              </div>
            )}
            {resetMessage && (
              <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <CheckCircle className="h-4 w-4 shrink-0" />
                {resetMessage}
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Email address</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-800 outline-none focus:border-[#a66b27] focus:ring-2 focus:ring-[#d8a95f]/40" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-800 outline-none focus:border-[#a66b27] focus:ring-2 focus:ring-[#d8a95f]/40" />
            </div>
            <button type="submit" className="w-full rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white transition hover:bg-[#293127]">Sign In</button>
            <button type="button" onClick={handlePasswordReset} className="w-full text-sm font-medium text-[#8a561f] hover:underline">Forgot password?</button>
          </form>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] p-5 text-stone-800">
        <div className="w-full max-w-md rounded-3xl border border-stone-300 bg-[#fffaf0] p-8 text-center shadow-xl">
          <ShieldCheck className="mx-auto h-10 w-10 text-[#a66b27]" />
          <h1 className="mt-4 font-serif text-3xl text-stone-900">Upload access is limited</h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            This account can listen to family recordings, but it is not allowed to add or change them.
          </p>
          <button onClick={handleSignOut} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white hover:bg-[#293127]">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f0e5] p-5 text-stone-800 md:p-10">
      <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
  <a href="/" className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-[#8a561f]">
    <ArrowLeft className="h-4 w-4" /> Back to Fields Family Vault
  </a>

  <div className="flex items-center gap-3">
    <a
      href="/project-tools"
      className="inline-flex items-center gap-2 text-sm font-semibold text-[#8a561f] transition hover:text-[#65431f]"
    >
      <Wrench className="h-4 w-4" /> Project Tools
    </a>

    <button onClick={handleSignOut} className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-[#8a561f]">
      <LogOut className="h-4 w-4" /> Sign out
    </button>
  </div>
</div>

        <header className="mt-6 border-b border-stone-300 pb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#a66b27]">Add to the collection</p>
          <h1 className="mt-2 font-serif text-4xl text-stone-900 md:text-5xl">Preserve a Memory</h1>
          <p className="mt-3 max-w-xl text-stone-600">Add the original recording now. Transcripts and family stories can be added later without losing the real voice behind them.</p>
        </header>

        <section className="mt-8 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
          {message && (
            <div className={`mb-6 flex items-center gap-3 rounded-xl border p-4 text-sm ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
              {message.type === 'success' ? <CheckCircle className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
              {message.text}
            </div>
          )}

          <form onSubmit={handleUpload} className="space-y-7">
            <div>
              <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-[#a66b27]" /><label className="text-sm font-semibold">Belongs in which legacy book? *</label></div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {vaults.map((vault) => (
                  <button key={vault.name} type="button" onClick={() => setVaultPerson(vault.name)} className={`rounded-2xl border p-4 text-left transition ${vaultPerson === vault.name ? 'border-[#b57931] bg-[#f4e7cf] shadow-sm' : 'border-stone-300 bg-white hover:border-[#b57931]'}`}>
                    <span className="flex items-center gap-2 font-serif text-lg text-stone-900"><Headphones className="h-4 w-4 text-[#a66b27]" />{vault.name}</span>
                    <span className="mt-1 block text-xs text-stone-600">{vault.title}</span>
                  </button>
                ))}
              </div>
            </div>

            <div><label className="mb-1.5 block text-sm font-semibold">Story title *</label><input type="text" required placeholder="Example: How Dad Met Mom" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27] focus:ring-2 focus:ring-[#d8a95f]/40" /></div>

            <div className="grid gap-5 md:grid-cols-2">
              <div><div className="mb-1.5 flex items-center gap-2"><UserRound className="h-4 w-4 text-[#a66b27]" /><label className="text-sm font-semibold">Speaker / people heard *</label></div><input type="text" required placeholder="Example: Dad and Dan" value={speaker} onChange={(e) => setSpeaker(e.target.value)} className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27] focus:ring-2 focus:ring-[#d8a95f]/40" /></div>
              <div><div className="mb-1.5 flex items-center gap-2"><Tag className="h-4 w-4 text-[#a66b27]" /><label className="text-sm font-semibold">Chapter / category</label></div><select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27] focus:ring-2 focus:ring-[#d8a95f]/40"><option value="General">General</option><option value="Childhood">Childhood</option><option value="Love & Marriage">Love & Marriage</option><option value="Military & Work">Military & Work</option><option value="Faith">Faith</option><option value="Holidays & Family">Holidays & Family</option><option value="Life Lessons">Life Lessons</option></select></div>
            </div>

            <div><div className="mb-1.5 flex items-center gap-2"><FileAudio className="h-4 w-4 text-[#a66b27]" /><label className="text-sm font-semibold">Original audio file *</label></div><input key={fileInputKey} type="file" accept="audio/*" required onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full rounded-xl border border-dashed border-stone-400 bg-white px-4 py-3 text-sm text-stone-600 file:mr-4 file:rounded-lg file:border-0 file:bg-[#e8d4ae] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#65431f] hover:file:bg-[#dfc28e]" />{file && <p className="mt-2 text-sm text-stone-600">Ready to upload: <span className="font-medium">{file.name}</span></p>}</div>

            <div><label className="mb-1.5 block text-sm font-semibold">Story chapter or notes <span className="font-normal">(optional)</span></label><textarea rows={5} placeholder="Add notes now, or paste in the reviewed transcript or finished family story later." value={storyChapter} onChange={(e) => setStoryChapter(e.target.value)} className="w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27] focus:ring-2 focus:ring-[#d8a95f]/40" /></div>

            <button type="submit" disabled={uploading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3.5 font-semibold text-white transition hover:bg-[#293127] disabled:bg-stone-400">{uploading ? <><Loader2 className="h-5 w-5 animate-spin" />{transcribing ? 'Transcribing recording…' : 'Saving memory…'}</> : <><Upload className="h-5 w-5" />Save to {vaultPerson}&apos;s Vault</>}</button>
          </form>
        </section>

                <section className="mt-10 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">Backup & Preserve</p>
          <h2 className="mt-2 font-serif text-3xl text-stone-900">Download Full Vault Backup</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
            Creates one ZIP file with every original audio recording, transcript, family story, and a readable index. Keep the page open while it gathers the files.
          </p>

          {backupMessage && (
            <div className={`mt-5 flex gap-3 rounded-xl border p-4 text-sm ${backupMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
              {backupMessage.type === 'success' ? <CheckCircle className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
              {backupMessage.text}
            </div>
          )}

          <button
            type="button"
            onClick={() => void downloadFullVaultBackup()}
            disabled={backingUp}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#3b4536] px-5 py-3 font-semibold text-white transition hover:bg-[#293127] disabled:cursor-not-allowed disabled:bg-stone-400"
          >
            {backingUp ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
            {backingUp ? 'Creating backup…' : 'Download Full Vault Backup'}
          </button>
        </section>
        <section className="mt-10 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-3 border-b border-stone-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">Story Studio</p><h2 className="mt-2 font-serif text-3xl text-stone-900">Transcripts & family stories</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-600">Edit the exact transcript, copy it, make a fresh transcription, or turn it into a readable story. The audio file is never changed.</p></div>
            <button type="button" onClick={() => void fetchTracks()} className="inline-flex w-fit items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:border-[#a66b27]"><RefreshCw className={`h-4 w-4 ${loadingTracks ? 'animate-spin' : ''}`} />Refresh</button>
          </div>

          {editorMessage && <div className={`mt-6 flex gap-3 rounded-xl border p-4 text-sm ${editorMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{editorMessage.type === 'success' ? <CheckCircle className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}{editorMessage.text}</div>}

          {tracks.length === 0 && !loadingTracks ? <p className="mt-6 rounded-xl bg-stone-100 p-4 text-sm text-stone-600">Upload your first recording above, then it will appear here for transcription and story work.</p> : <div className="mt-6 space-y-6">
            <div><label className="mb-1.5 block text-sm font-semibold">Choose a recording</label><select value={selectedTrackId} onChange={(e) => chooseTrack(e.target.value)} className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27] focus:ring-2 focus:ring-[#d8a95f]/40">{tracks.map((track) => <option key={track.id} value={track.id}>{track.vault_person || 'Dad'} · {track.title} · {new Date(track.created_at).toLocaleDateString()}</option>)}</select></div>

            {selectedTrack && <>
              <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm text-stone-600"><span className="font-semibold text-stone-800">{selectedTrack.speaker}</span> · {selectedTrack.category || 'General'} · Transcript status: <span className="font-medium">{selectedTrack.transcription_status || 'not started'}</span></div>

              <div className="rounded-2xl border border-stone-200 bg-[#f8f3e9] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Headphones className="h-4 w-4 text-[#a66b27]" />
                  <p className="text-sm font-semibold text-stone-800">Listen while you correct the transcript</p>
                </div>
                {editorAudioLoading ? (
                  <div className="flex items-center gap-2 text-sm text-stone-600">
                    <Loader2 className="h-4 w-4 animate-spin" /> Opening recording…
                  </div>
                ) : editorAudioError ? (
                  <div className="flex items-start gap-2 text-sm text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {editorAudioError}
                  </div>
                ) : editorAudioUrl ? (
                  <>
                    <audio
                      ref={editorAudioRef}
                      key={`${selectedTrack.id}-${editorAudioUrl}`}
                      controls
                      preload="metadata"
                      src={editorAudioUrl}
                      className="w-full"
                      onLoadedMetadata={prepareEditorAudio}
                      onPlay={startEditorAudioInsideClip}
                      onSeeking={keepEditorAudioInsideClip}
                      onTimeUpdate={keepEditorAudioInsideClip}
                    />
                    {selectedTrack.source_track_id && editorClipEnd && (
                      <p className="mt-2 text-xs text-stone-500">
                        This player will play only this answer&apos;s saved section of the original recording.
                      </p>
                    )}
                  </>
                ) : null}
              </div>

              <div><div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><label className="text-sm font-semibold">Word-for-word transcript</label><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void copyTranscript()} disabled={!transcriptDraft.trim()} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"><Copy className="h-4 w-4" />Copy</button><button type="button" onClick={() => void labelExistingTranscript()} disabled={labelingSpeakers || reTranscribing || creatingStory || !transcriptDraft.trim()} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50">{labelingSpeakers ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}{labelingSpeakers ? 'Labeling…' : 'Label speakers'}</button><button type="button" onClick={() => void reTranscribe()} disabled={reTranscribing || labelingSpeakers || creatingStory} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50">{reTranscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{reTranscribing ? 'Re-transcribing…' : 'Re-transcribe'}</button></div></div><textarea rows={12} value={transcriptDraft} onChange={(e) => setTranscriptDraft(e.target.value)} placeholder="The transcript will appear here after transcription finishes." className="w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 leading-relaxed outline-none focus:border-[#a66b27] focus:ring-2 focus:ring-[#d8a95f]/40" /></div>

              <div className="border-t border-stone-200 pt-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">Family Story</p><p className="mt-1 text-sm text-stone-600">AI uses only the reviewed transcript to make a first-person, book-ready story. It does not invent facts.</p></div><button type="button" onClick={() => void createStory()} disabled={creatingStory || reTranscribing || !transcriptDraft.trim()} className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#80542a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#65431f] disabled:cursor-not-allowed disabled:bg-stone-400">{creatingStory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{creatingStory ? 'Creating story…' : storyDraft ? 'Create a new story' : 'Create Story'}</button></div><div className="mt-5"><label className="mb-1.5 block text-sm font-semibold">Story title</label><input value={storyTitleDraft} onChange={(e) => setStoryTitleDraft(e.target.value)} placeholder="AI will suggest a title" className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27] focus:ring-2 focus:ring-[#d8a95f]/40" /></div><div className="mt-5"><label className="mb-1.5 block text-sm font-semibold">Book-style story</label><textarea rows={12} value={storyDraft} onChange={(e) => setStoryDraft(e.target.value)} placeholder="Create Story will put a readable, reviewable story here." className="w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 font-serif leading-relaxed outline-none focus:border-[#a66b27] focus:ring-2 focus:ring-[#d8a95f]/40" /></div></div>

              <button type="button" onClick={() => void saveEditor()} disabled={savingEditor || creatingStory || reTranscribing} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3.5 font-semibold text-white hover:bg-[#293127] disabled:cursor-not-allowed disabled:bg-stone-400">{savingEditor ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}{savingEditor ? 'Saving changes…' : 'Save transcript and story changes'}</button>
            </>}
          </div>}
        </section>
      </div>
    </main>
  );
}

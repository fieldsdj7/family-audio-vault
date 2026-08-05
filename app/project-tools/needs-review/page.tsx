'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  ClipboardList,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';

type VaultPerson = 'Papa' | 'Dad' | 'Mom';
type TrackReview = {
  transcript_reviewed_at: string | null;
  story_approved_at: string | null;
  notes: string | null;
};
type Track = {
  id: string;
  title: string;
  speaker: string;
  vault_person: string | null;
  category: string | null;
  created_at: string;
  transcript: string | null;
  story_chapter: string | null;
  transcription_status: string | null;
  audio_track_reviews: TrackReview[];
};
type Question = {
  id: string;
  card_number: number | null;
  question_text: string;
  question_card_progress: { vault_person: VaultPerson; status: string }[];
};

function personName(person: string | null) {
  return person === 'Mom' ? 'Mom / Ivy' : person || 'Dad';
}

export default function NeedsReviewPage() {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function loadData() {
    setLoading(true);
    const [tracksResult, questionsResult] = await Promise.all([
      supabase
        .from('audio_tracks')
        .select('id, title, speaker, vault_person, category, created_at, transcript, story_chapter, transcription_status, audio_track_reviews(transcript_reviewed_at, story_approved_at, notes)')
        .order('created_at', { ascending: false }),
      supabase
        .from('question_cards')
        .select('id, card_number, question_text, question_card_progress(vault_person, status)')
        .order('card_number', { ascending: true, nullsFirst: false }),
    ]);
    if (tracksResult.error || questionsResult.error) {
      setMessage({ type: 'error', text: tracksResult.error?.message || questionsResult.error?.message || 'Could not load the review list.' });
    } else {
      setTracks((tracksResult.data || []) as Track[]);
      setQuestions((questionsResult.data || []) as Question[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    async function start() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setCheckingAccess(false);
        setLoading(false);
        return;
      }
      const { data: admin } = await supabase
        .from('vault_admins')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      const allowed = !!admin;
      setIsAdmin(allowed);
      setCheckingAccess(false);
      if (allowed) await loadData();
      else setLoading(false);
    }
    void start();
  }, []);

  const questionItems = useMemo(
    () => questions.flatMap((question) => question.question_card_progress
      .filter((progress) => progress.status === 'needs_review')
      .map((progress) => ({ question, person: progress.vault_person }))),
    [questions]
  );
  const trackItems = useMemo(() => tracks.flatMap((track) => {
    const review = track.audio_track_reviews[0];
    const items: { track: Track; kind: 'missingTranscript' | 'reviewTranscript' | 'missingStory' | 'approveStory' }[] = [];
    if (!track.transcript?.trim()) items.push({ track, kind: 'missingTranscript' });
    else if (!review?.transcript_reviewed_at) items.push({ track, kind: 'reviewTranscript' });
    if (!track.story_chapter?.trim()) items.push({ track, kind: 'missingStory' });
    else if (!review?.story_approved_at) items.push({ track, kind: 'approveStory' });
    return items;
  }), [tracks]);

  async function markReviewed(track: Track, field: 'transcript_reviewed_at' | 'story_approved_at') {
    setSavingId(`${track.id}-${field}`);
    setMessage(null);
    const existing = track.audio_track_reviews[0];
    const { error } = await supabase.from('audio_track_reviews').upsert({
      audio_track_id: track.id,
      transcript_reviewed_at: existing?.transcript_reviewed_at || null,
      story_approved_at: existing?.story_approved_at || null,
      notes: existing?.notes || null,
      [field]: new Date().toISOString(),
    });
    setSavingId(null);
    if (error) setMessage({ type: 'error', text: error.message });
    else {
      setMessage({ type: 'success', text: field === 'transcript_reviewed_at' ? 'Transcript marked as checked.' : 'Family story marked as approved.' });
      await loadData();
    }
  }

  if (checkingAccess || loading) return <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] text-stone-700"><Loader2 className="h-7 w-7 animate-spin text-[#a66b27]" /></main>;
  if (!isAdmin) return <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] p-5 text-stone-800"><div className="w-full max-w-md rounded-3xl border border-stone-300 bg-[#fffaf0] p-8 text-center shadow-xl"><ShieldCheck className="mx-auto h-10 w-10 text-[#a66b27]" /><h1 className="mt-4 font-serif text-3xl text-stone-900">Needs Review is private</h1><p className="mt-3 text-sm leading-relaxed text-stone-600">Only vault administrators can review and organize the collection.</p><a href="/" className="mt-6 inline-flex rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white hover:bg-[#293127]">Return to the vault</a></div></main>;

  const total = questionItems.length + trackItems.length;
  const itemInfo = {
    missingTranscript: { label: 'Transcript missing', detail: 'Open Admin Upload to create or re-create the word-for-word transcript.', icon: FileText },
    reviewTranscript: { label: 'Check transcript', detail: 'Read the word-for-word transcript, correct anything needed, then mark it checked here.', icon: FileText },
    missingStory: { label: 'Family story missing', detail: 'Open Admin Upload when you are ready to create a readable family story from the reviewed transcript.', icon: Sparkles },
    approveStory: { label: 'Approve family story', detail: 'Read the story in Admin Upload, make any changes you want, then approve it here.', icon: Sparkles },
  };

  return <main className="min-h-screen bg-[#f6f0e5] p-5 text-stone-800 md:p-10"><div className="mx-auto max-w-5xl">
    <a href="/project-tools" className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-[#8a561f]"><ArrowLeft className="h-4 w-4" />Back to Project Tools</a>
    <header className="mt-6 border-b border-stone-300 pb-7"><p className="text-xs font-semibold uppercase tracking-[.22em] text-[#a66b27]">Fields Family Vault</p><h1 className="mt-2 flex items-center gap-3 font-serif text-4xl text-stone-900 md:text-5xl"><AlertCircle className="h-9 w-9 text-[#a66b27]" />Needs Review</h1><p className="mt-3 max-w-2xl text-stone-600">One private work list for the pieces that still need attention. Checking or approving an item only records its review status; it never changes the original audio.</p></header>
    {message && <div className={`mt-7 flex gap-2 rounded-xl border p-4 text-sm ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{message.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}{message.text}</div>}
    <section className="mt-8 rounded-3xl border border-[#ddc79f] bg-[#fbf3e3] p-6 shadow-sm md:p-8"><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">Current work list</p><h2 className="mt-2 font-serif text-3xl text-stone-900">{total === 0 ? 'Everything is caught up' : `${total} ${total === 1 ? 'item' : 'items'} need attention`}</h2><p className="mt-2 text-sm leading-relaxed text-stone-600">Items disappear from this list as you finish them. A recording can appear more than once when it needs more than one thing.</p></section>
    <section className="mt-8"><div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-[#a66b27]" /><h2 className="font-serif text-2xl text-stone-900">Question cards</h2></div><div className="mt-4 space-y-3">{questionItems.map(({ question, person }) => <article key={`${question.id}-${person}`} className="rounded-2xl border border-stone-300 bg-[#fffaf0] p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#a66b27]">{question.card_number ? `Card ${question.card_number}` : 'Unnumbered card'} · {personName(person)}</p><h3 className="mt-2 font-serif text-xl text-stone-900">{question.question_text}</h3><p className="mt-3 text-sm text-stone-600">This question is marked “Needs review” for {personName(person)}.</p><a href="/project-tools/question-tracker" className="mt-4 inline-flex rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:border-[#a66b27]">Open Question Tracker</a></article>)}{!questionItems.length && <p className="rounded-2xl border border-dashed border-stone-300 bg-[#fffaf0] p-5 text-sm text-stone-600">No question cards are currently marked Needs review.</p>}</div></section>
    <section className="mt-9"><div className="flex items-center gap-2"><FileText className="h-5 w-5 text-[#a66b27]" /><h2 className="font-serif text-2xl text-stone-900">Recordings and stories</h2></div><div className="mt-4 space-y-3">{trackItems.map(({ track, kind }) => { const info = itemInfo[kind]; const Icon = info.icon; const isMarkable = kind === 'reviewTranscript' || kind === 'approveStory'; const field = kind === 'reviewTranscript' ? 'transcript_reviewed_at' : 'story_approved_at'; const saving = savingId === `${track.id}-${field}`; return <article key={`${track.id}-${kind}`} className="rounded-2xl border border-stone-300 bg-[#fffaf0] p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#a66b27]"><Icon className="h-4 w-4" />{info.label}</p><h3 className="mt-2 font-serif text-xl text-stone-900">{track.title}</h3><p className="mt-2 text-sm text-stone-600">{personName(track.vault_person)} · {track.speaker} · {track.category || 'General'}</p><p className="mt-3 text-sm leading-relaxed text-stone-600">{info.detail}</p></div><div className="flex shrink-0 flex-wrap gap-2">{isMarkable && <button type="button" onClick={() => void markReviewed(track, field)} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#3b4536] px-3 py-2 text-sm font-semibold text-white hover:bg-[#293127] disabled:bg-stone-400">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}{kind === 'reviewTranscript' ? 'Mark checked' : 'Approve story'}</button>}<a href="/admin" className="inline-flex rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:border-[#a66b27]">Open Admin Upload</a></div></div></article>; })}{!trackItems.length && <p className="rounded-2xl border border-dashed border-stone-300 bg-[#fffaf0] p-5 text-sm text-stone-600">No recording or story work is waiting right now.</p>}</div></section>
  </div></main>;
}

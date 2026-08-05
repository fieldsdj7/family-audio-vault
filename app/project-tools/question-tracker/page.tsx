'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  ClipboardList,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

type QuestionStatus =
  | 'not_started'
  | 'recorded'
  | 'transcribed'
  | 'needs_review'
  | 'story_reviewed'
  | 'finished';

type QuestionCard = {
  id: string;
  card_number: number | null;
  question_text: string;
  status: QuestionStatus;
  notes: string | null;
  question_card_recordings: { audio_track_id: string }[];
};

type Track = {
  id: string;
  title: string;
  vault_person: string | null;
  created_at: string;
};

const statusOptions: { value: QuestionStatus; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'recorded', label: 'Recorded' },
  { value: 'transcribed', label: 'Transcribed' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'story_reviewed', label: 'Story reviewed' },
  { value: 'finished', label: 'Finished' },
];

function statusLabel(status: QuestionStatus) {
  return statusOptions.find((option) => option.value === status)?.label || 'Not started';
}

export default function QuestionTrackerPage() {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cards, setCards] = useState<QuestionCard[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [filter, setFilter] = useState<'all' | QuestionStatus>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [status, setStatus] = useState<QuestionStatus>('not_started');
  const [notes, setNotes] = useState('');
  const [linkedTrackIds, setLinkedTrackIds] = useState<string[]>([]);

  const visibleCards = useMemo(
    () => cards.filter((card) => filter === 'all' || card.status === filter),
    [cards, filter]
  );

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

  async function loadData() {
    setLoading(true);
    const [cardsResult, tracksResult] = await Promise.all([
      supabase
        .from('question_cards')
        .select('id, card_number, question_text, status, notes, question_card_recordings(audio_track_id)')
        .order('card_number', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabase
        .from('audio_tracks')
        .select('id, title, vault_person, created_at')
        .order('created_at', { ascending: false }),
    ]);
    if (cardsResult.error || tracksResult.error) {
      setMessage({ type: 'error', text: cardsResult.error?.message || tracksResult.error?.message || 'Could not load the tracker.' });
    } else {
      setCards((cardsResult.data || []) as QuestionCard[]);
      setTracks((tracksResult.data || []) as Track[]);
    }
    setLoading(false);
  }

  function resetEditor() {
    setEditingId(null);
    setCardNumber('');
    setQuestionText('');
    setStatus('not_started');
    setNotes('');
    setLinkedTrackIds([]);
  }

  function editCard(card: QuestionCard) {
    setEditingId(card.id);
    setCardNumber(card.card_number?.toString() || '');
    setQuestionText(card.question_text);
    setStatus(card.status);
    setNotes(card.notes || '');
    setLinkedTrackIds(card.question_card_recordings.map((link) => link.audio_track_id));
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveCard(event: FormEvent) {
    event.preventDefault();
    if (!questionText.trim()) {
      setMessage({ type: 'error', text: 'Please enter the question first.' });
      return;
    }
    const parsedNumber = cardNumber.trim() ? Number(cardNumber) : null;
    if (parsedNumber !== null && (!Number.isInteger(parsedNumber) || parsedNumber < 1)) {
      setMessage({ type: 'error', text: 'Card number must be a whole number, or leave it blank.' });
      return;
    }

    setSaving(true);
    setMessage(null);
    const payload = {
      card_number: parsedNumber,
      question_text: questionText.trim(),
      status,
      notes: notes.trim() || null,
    };
    const cardResult = editingId
      ? await supabase.from('question_cards').update(payload).eq('id', editingId).select('id').single()
      : await supabase.from('question_cards').insert(payload).select('id').single();

    if (cardResult.error || !cardResult.data) {
      setSaving(false);
      setMessage({ type: 'error', text: cardResult.error?.message || 'Could not save this question.' });
      return;
    }

    const questionId = cardResult.data.id;
    const removeResult = await supabase
      .from('question_card_recordings')
      .delete()
      .eq('question_card_id', questionId);
    if (removeResult.error) {
      setSaving(false);
      setMessage({ type: 'error', text: removeResult.error.message });
      return;
    }
    if (linkedTrackIds.length) {
      const linkResult = await supabase.from('question_card_recordings').insert(
        linkedTrackIds.map((audio_track_id) => ({ question_card_id: questionId, audio_track_id }))
      );
      if (linkResult.error) {
        setSaving(false);
        setMessage({ type: 'error', text: linkResult.error.message });
        return;
      }
    }
    setSaving(false);
    setMessage({ type: 'success', text: editingId ? 'Question updated.' : 'Question added to the tracker.' });
    resetEditor();
    await loadData();
  }

  if (checkingAccess || loading) return <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] text-stone-700"><Loader2 className="h-7 w-7 animate-spin text-[#a66b27]" /></main>;
  if (!isAdmin) return <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] p-5 text-stone-800"><div className="w-full max-w-md rounded-3xl border border-stone-300 bg-[#fffaf0] p-8 text-center shadow-xl"><ShieldCheck className="mx-auto h-10 w-10 text-[#a66b27]" /><h1 className="mt-4 font-serif text-3xl text-stone-900">Question Tracker is private</h1><p className="mt-3 text-sm leading-relaxed text-stone-600">Only vault administrators can organize question cards.</p><a href="/" className="mt-6 inline-flex rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white hover:bg-[#293127]">Return to the vault</a></div></main>;

  return <main className="min-h-screen bg-[#f6f0e5] p-5 text-stone-800 md:p-10"><div className="mx-auto max-w-5xl">
    <a href="/project-tools" className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-[#8a561f]"><ArrowLeft className="h-4 w-4" />Back to Project Tools</a>
    <header className="mt-6 border-b border-stone-300 pb-7"><p className="text-xs font-semibold uppercase tracking-[.22em] text-[#a66b27]">Fields Family Vault</p><h1 className="mt-2 flex items-center gap-3 font-serif text-4xl text-stone-900 md:text-5xl"><ClipboardList className="h-9 w-9 text-[#a66b27]" />Question Tracker</h1><p className="mt-3 max-w-2xl text-stone-600">Add cards as you find them. A question can be linked to more than one recording, and none of this changes the original audio.</p></header>
    <section className="mt-8 rounded-3xl border border-[#ddc79f] bg-[#fbf3e3] p-6 shadow-sm md:p-8"><h2 className="font-serif text-2xl text-stone-900">{editingId ? 'Edit question' : 'Add a question'}</h2><form onSubmit={saveCard} className="mt-5 space-y-5">
      {message && <div className={`flex gap-2 rounded-xl border p-3 text-sm ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{message.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}{message.text}</div>}
      <div className="grid gap-5 md:grid-cols-[150px_1fr_190px]"><div><label className="mb-1.5 block text-sm font-semibold">Card number</label><input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} inputMode="numeric" placeholder="Optional" className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]" /></div><div><label className="mb-1.5 block text-sm font-semibold">Question *</label><input required value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Type the question from the card" className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]" /></div><div><label className="mb-1.5 block text-sm font-semibold">Status</label><select value={status} onChange={(e) => setStatus(e.target.value as QuestionStatus)} className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div></div>
      <div><label className="mb-1.5 block text-sm font-semibold">Notes</label><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Example: Asked together with question #12 in the same recording." className="w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]" /></div>
      <div><p className="text-sm font-semibold">Linked recording(s)</p><p className="mt-1 text-sm text-stone-600">Optional. Check every recording that answers this card.</p><div className="mt-3 max-h-52 space-y-2 overflow-y-auto rounded-xl border border-stone-300 bg-white p-3">{tracks.length ? tracks.map((track) => <label key={track.id} className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-stone-50"><input type="checkbox" checked={linkedTrackIds.includes(track.id)} onChange={(e) => setLinkedTrackIds((ids) => e.target.checked ? [...ids, track.id] : ids.filter((id) => id !== track.id))} className="mt-1 h-4 w-4 accent-[#80542a]" /><span className="text-sm"><span className="font-semibold text-stone-800">{track.title}</span><span className="ml-2 text-stone-500">{track.vault_person || 'Dad'} · {new Date(track.created_at).toLocaleDateString()}</span></span></label>) : <p className="p-2 text-sm text-stone-500">No recordings have been added yet.</p>}</div></div>
      <div className="flex flex-wrap gap-3"><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white hover:bg-[#293127] disabled:bg-stone-400">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add question'}</button>{editingId && <button type="button" onClick={resetEditor} className="rounded-xl border border-stone-300 bg-white px-4 py-3 font-semibold text-stone-700">Cancel</button>}</div>
    </form></section>
    <section className="mt-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">Your cards</p><h2 className="mt-2 font-serif text-3xl text-stone-900">{cards.length} {cards.length === 1 ? 'question' : 'questions'} tracked</h2></div><select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | QuestionStatus)} className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm"><option value="all">All statuses</option>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><div className="mt-5 space-y-3">{visibleCards.map((card) => <article key={card.id} className="rounded-2xl border border-stone-300 bg-[#fffaf0] p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#a66b27]">{card.card_number ? `Card ${card.card_number}` : 'Unnumbered card'} · {statusLabel(card.status)}</p><h3 className="mt-2 font-serif text-xl text-stone-900">{card.question_text}</h3>{card.notes && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-600">{card.notes}</p>}{card.question_card_recordings.length > 0 && <p className="mt-3 text-sm font-medium text-stone-700">{card.question_card_recordings.length} linked {card.question_card_recordings.length === 1 ? 'recording' : 'recordings'}</p>}</div><button type="button" onClick={() => editCard(card)} className="w-fit rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:border-[#a66b27]">Edit</button></div></article>)}{!visibleCards.length && <p className="rounded-2xl border border-dashed border-stone-300 bg-[#fffaf0] p-8 text-center text-stone-600">No questions are in this view yet. Add the first card above whenever you are ready.</p>}</div></section>
  </div></main>;
}

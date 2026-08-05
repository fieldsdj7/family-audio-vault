'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle,
  Download,
  Headphones,
  Loader2,
  Lock,
  LogOut,
  Play,
  ShieldCheck,
  Tag,
  Trash2,
  User,
  Volume2,
} from 'lucide-react';

interface AudioTrack {
  id: string;
  title: string;
  speaker: string;
  category: string;
  audio_url?: string | null;
  storage_path?: string | null;
  created_at: string;
  transcript?: string;
  story_chapter?: string;
  story_title?: string | null;
  vault_person?: string;
  playback_url?: string;
}

type VaultName = 'Papa' | 'Dad' | 'Mom';

const vaults = [
  { name: 'Papa' as VaultName, title: "Papa's Life" },
  { name: 'Dad' as VaultName, title: "Dad's Life" },
  { name: 'Mom' as VaultName, title: "Mom's Life" },
];

function getStoragePath(track: AudioTrack) {
  if (track.storage_path) return track.storage_path;

  // Supports recordings that were uploaded before the private-vault change.
  const marker = '/audio-files/';
  const oldPath = track.audio_url?.split(marker)[1];
  return oldPath || null;
}

export default function Home() {
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingLogin, setCheckingLogin] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [activePerson, setActivePerson] = useState('Dad');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [trashingTrackId, setTrashingTrackId] = useState<string | null>(null);
  const [downloadingTrackId, setDownloadingTrackId] = useState<string | null>(null);
  const [accessibleVaults, setAccessibleVaults] = useState<VaultName[]>([]);

  const availableVaults = vaults.filter((vault) => accessibleVaults.includes(vault.name));
  const currentVault = availableVaults.find((vault) => vault.name === activePerson) || availableVaults[0];
  const personTracks = tracks.filter(
    (track) =>
      accessibleVaults.includes((track.vault_person || 'Dad') as VaultName) &&
      (track.vault_person || 'Dad') === activePerson
  );
  const categories = [
    'All',
    ...Array.from(new Set(personTracks.map((track) => track.category || 'General'))),
  ];
  const filteredTracks =
    activeCategory === 'All'
      ? personTracks
      : personTracks.filter((track) => track.category === activeCategory);

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        await loadVaultForUser(session.user.id);
      }

      setIsAuthenticated(!!session);
      setCheckingLogin(false);
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setCheckingLogin(true);
      setIsAuthenticated(!!session);

      if (session) {
        await loadVaultForUser(session.user.id);
      } else {
        setIsAdmin(false);
        setAccessibleVaults([]);
        setTracks([]);
        setSelectedTrack(null);
      }

      setCheckingLogin(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadVaultForUser(userId: string) {
    const { data: adminRecord } = await supabase
      .from('vault_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    const userIsAdmin = !!adminRecord;
    setIsAdmin(userIsAdmin);

    let permittedVaults: VaultName[] = vaults.map((vault) => vault.name);

    if (!userIsAdmin) {
      const { data, error } = await supabase
        .from('vault_access')
        .select('vault_person')
        .eq('user_id', userId);

      permittedVaults = error
        ? []
        : (data || [])
            .map((access) => access.vault_person as VaultName)
            .filter((name): name is VaultName => vaults.some((vault) => vault.name === name));
    }

    setAccessibleVaults(permittedVaults);

    const nextActivePerson = permittedVaults.includes(activePerson as VaultName)
      ? (activePerson as VaultName)
      : permittedVaults[0];

    if (!nextActivePerson) {
      setTracks([]);
      setSelectedTrack(null);
      setLoading(false);
      return;
    }

    setActivePerson(nextActivePerson);
    setActiveCategory('All');
    await fetchTracks(nextActivePerson);
  }

  async function fetchTracks(preferredPerson: VaultName) {
    setLoading(true);

    const { data, error } = await supabase
      .from('audio_tracks')
      .select('*')
      .is('trashed_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tracks:', error);
      setTracks([]);
      setSelectedTrack(null);
      setLoading(false);
      return;
    }

    const tracksWithSecureLinks = await Promise.all(
      (data || []).map(async (track: AudioTrack) => {
        const storagePath = getStoragePath(track);
        if (!storagePath) return track;

        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('audio-files')
          .createSignedUrl(storagePath, 60 * 60);

        if (signedUrlError) {
          console.error(`Could not create playback link for ${track.id}:`, signedUrlError);
          return track;
        }

        return { ...track, playback_url: signedUrlData.signedUrl };
      })
    );

    setTracks(tracksWithSecureLinks);
    const firstAvailableTrack = tracksWithSecureLinks.find(
      (track) => (track.vault_person || 'Dad') === preferredPerson
    );
    setSelectedTrack(firstAvailableTrack || null);
    setLoading(false);
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError('');
    setResetMessage('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setLoginError('That email or password did not work. Please try again.');
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

  async function trashTrack(track: AudioTrack) {
    const confirmed = window.confirm(
      `Move “${track.title}” to Trash?\n\nIt will disappear from the family vault, but its audio, transcript, story, and links will be kept safely until you restore it or permanently remove it later.`
    );
    if (!confirmed) return;

    setTrashingTrackId(track.id);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch('/api/delete-track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ trackId: track.id, action: 'trash' }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || 'The recording could not be moved to Trash.');
      }

      const remainingTracks = tracks.filter((item) => item.id !== track.id);
      setTracks(remainingTracks);
      setSelectedTrack((current) =>
        current?.id === track.id
          ? remainingTracks.find((item) => (item.vault_person || 'Dad') === activePerson) || null
          : current
      );
      setIsPlaying(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'The recording could not be moved to Trash.');
    } finally {
      setTrashingTrackId(null);
    }
  }

  async function downloadTrack(track: AudioTrack) {
    const storagePath = getStoragePath(track);
    if (!storagePath) {
      window.alert('This older recording does not have a downloadable audio file linked to it.');
      return;
    }

    setDownloadingTrackId(track.id);

    try {
      const { data, error } = await supabase.storage
        .from('audio-files')
        .createSignedUrl(storagePath, 60, { download: true });

      if (error || !data?.signedUrl) {
        throw new Error(error?.message || 'The audio file could not be prepared for download.');
      }

      window.location.assign(data.signedUrl);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : 'The audio file could not be downloaded.'
      );
    } finally {
      setDownloadingTrackId(null);
    }
  }

  function selectTrack(track: AudioTrack) {
    setSelectedTrack(track);
    setIsPlaying(true);
  }

  if (checkingLogin) {
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
            <h1 className="mt-2 font-serif text-3xl">Family Sign In</h1>
            <p className="mt-3 text-sm leading-relaxed text-stone-300">
              A private collection of voices, stories, and memories.
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

  if (!currentVault) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] p-5 text-stone-800">
        <div className="w-full max-w-md rounded-3xl border border-stone-300 bg-[#fffaf0] p-8 text-center shadow-xl">
          <Lock className="mx-auto h-10 w-10 text-[#a66b27]" />
          <h1 className="mt-4 font-serif text-3xl text-stone-900">No vault access yet</h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            This account has not been assigned to a family vault. Please ask an administrator to add access.
          </p>
          <button
            onClick={handleSignOut}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white hover:bg-[#293127]"
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
      <div className="grid min-w-0 min-h-screen lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="min-w-0 overflow-hidden border-b border-stone-800 bg-[#20221e] px-5 py-6 text-stone-100 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#c98b3c] text-[#20221e]"><BookOpen className="h-5 w-5" /></div>
            <div><p className="font-serif text-lg leading-none">Fields Family Vault</p><p className="mt-1 text-xs text-stone-400">Stories worth keeping</p></div>
          </div>
          {/* FUTURE EDIT NOTE: the mobile tab row intentionally scrolls inside this nav.
              Keep max-w-full, min-w-0, and the button shrink settings so the whole page stays phone-width. */}
          <nav className="mt-8 flex max-w-full min-w-0 gap-2 overflow-x-auto lg:block lg:space-y-2">
            {availableVaults.map((vault) => (
              <button key={vault.name} onClick={() => { setActivePerson(vault.name); setActiveCategory('All'); setSelectedTrack(tracks.find((track) => (track.vault_person || 'Dad') === vault.name) || null); setIsPlaying(false); }} className={`flex w-auto shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm transition lg:w-full lg:whitespace-normal ${activePerson === vault.name ? 'bg-white/10 font-medium text-white' : 'text-stone-300 hover:bg-white/10 hover:text-white'}`}>
                <Headphones className="h-4 w-4 text-[#d8a95f]" />{vault.name}
              </button>
            ))}
            {isAdmin && (
              <a href="/admin" className="flex w-auto shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm text-stone-300 transition hover:bg-white/10 hover:text-white lg:w-full lg:whitespace-normal">
                <ShieldCheck className="h-4 w-4 text-[#d8a95f]" />Admin Upload
              </a>
            )}
          </nav>
          <div className="mt-10 hidden border-t border-white/10 pt-6 lg:block">
            <p className="font-serif text-lg text-stone-200">A family legacy, kept in their own words.</p>
            <p className="mt-3 text-sm leading-relaxed text-stone-400">Listen to the voices, stories, and memories that made our family who we are.</p>
            <p className="mt-6 border-l-2 border-[#d8a95f] pl-4 font-serif text-lg leading-relaxed text-stone-200">“A people without knowledge of their past is like a tree without roots.”</p>
          </div>
        </aside>

        <section className="p-5 md:p-10"><div className="mx-auto max-w-5xl">
          <header className="flex flex-col gap-4 border-b border-stone-300 pb-7 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#a66b27]">Our Family Legacy</p><h1 className="mt-2 font-serif text-4xl text-stone-900 md:text-5xl">{currentVault.title}</h1><p className="mt-3 max-w-xl text-stone-600">A living collection of stories, memories, and the voice we never want to forget.</p></div>
            <button onClick={handleSignOut} className="inline-flex w-fit items-center gap-2 rounded-full border border-stone-400 bg-[#fffaf0] px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-[#a66b27] hover:text-[#8a561f]"><LogOut className="h-4 w-4" />Sign out</button>
          </header>
          <section className="mt-8 overflow-hidden rounded-3xl bg-[#5b4837] shadow-lg"><div className="grid md:grid-cols-[1.05fr_.95fr]"><div className="flex min-h-[280px] flex-col justify-between p-7 text-[#fffaf0] md:p-10"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#e3bb77]">The Legacy Book</p><h2 className="mt-4 max-w-md font-serif text-4xl leading-tight md:text-5xl">The stories that shaped a life.</h2><p className="mt-5 max-w-md leading-relaxed text-stone-200">Every recording is a piece of family history, preserved for children, grandchildren, and the ones still to come.</p></div><div className="mt-8 flex items-center gap-3 text-sm text-stone-200"><span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8a95f]/60"><Headphones className="h-4 w-4 text-[#e3bb77]" /></span><span>{personTracks.length} {personTracks.length === 1 ? 'recording' : 'recordings'} preserved</span></div></div><div className="relative hidden items-center justify-center overflow-hidden bg-[#c38a45] p-10 md:flex"><div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,.25),_transparent_60%)]" /><div className="relative flex h-48 w-36 rotate-[-5deg] flex-col justify-between rounded-r-md border border-[#6d4824] bg-[#f5dfb1] p-5 shadow-2xl"><BookOpen className="h-8 w-8 text-[#80542a]" /><div><p className="font-serif text-2xl leading-tight text-[#54371f]">{currentVault.title}</p><div className="mt-4 h-px bg-[#9e7140]" /><p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-[#80542a]">Family stories</p></div></div></div></div></section>

          {selectedTrack ? <section className="mt-10 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">Now Listening</p><h2 className="mt-2 font-serif text-3xl text-stone-900">{selectedTrack.title}</h2><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-600"><span className="flex items-center gap-2"><User className="h-4 w-4 text-[#a66b27]" />{selectedTrack.speaker}</span><span className="flex items-center gap-2"><Calendar className="h-4 w-4 text-[#a66b27]" />{new Date(selectedTrack.created_at).toLocaleDateString()}</span><span className="flex items-center gap-2"><Tag className="h-4 w-4 text-[#a66b27]" />{selectedTrack.category || 'General'}</span></div></div><div className="flex flex-wrap items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#c98b3c] text-[#342519]"><Play className="ml-0.5 h-5 w-5 fill-current" /></div>{getStoragePath(selectedTrack) && <button type="button" onClick={() => void downloadTrack(selectedTrack)} disabled={downloadingTrackId === selectedTrack.id} className="inline-flex items-center gap-2 rounded-xl border border-[#d1af77] bg-[#fff7e8] px-3 py-2 text-sm font-semibold text-[#744b1e] transition hover:bg-[#f8e6c2] disabled:cursor-not-allowed disabled:opacity-60"><Download className="h-4 w-4" />{downloadingTrackId === selectedTrack.id ? 'Preparing…' : 'Download audio'}</button>}{isAdmin && <button type="button" onClick={() => void trashTrack(selectedTrack)} disabled={trashingTrackId === selectedTrack.id} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"><Trash2 className="h-4 w-4" />{trashingTrackId === selectedTrack.id ? 'Moving…' : 'Move to Trash'}</button>}</div></div>{selectedTrack.playback_url ? <audio key={selectedTrack.id} controls autoPlay={isPlaying} className="mt-7 w-full" src={selectedTrack.playback_url} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} /> : <p className="mt-7 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">This recording could not be opened. Please refresh the page and try again.</p>}{selectedTrack.transcript && <div className="mt-7 border-t border-stone-200 pt-7"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">Word-for-word transcript</p><p className="mt-3 whitespace-pre-line leading-relaxed text-stone-700">{selectedTrack.transcript}</p></div>}{selectedTrack.story_chapter && <div className="mt-7 border-t border-stone-200 pt-7"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">Family Story</p><h3 className="mt-2 font-serif text-2xl text-stone-900">{selectedTrack.story_title || selectedTrack.title}</h3><p className="mt-3 whitespace-pre-line font-serif text-lg leading-relaxed text-stone-700">{selectedTrack.story_chapter}</p></div>}</section> : <section className="mt-10 rounded-3xl border border-dashed border-stone-300 bg-[#fffaf0] p-10 text-center"><Headphones className="mx-auto h-8 w-8 text-[#a66b27]" /><h2 className="mt-4 font-serif text-2xl text-stone-900">{loading ? 'Opening the vault…' : 'No stories have been added yet.'}</h2>{!loading && <p className="mt-2 text-stone-600">The first recording will become the beginning of this legacy book.</p>}</section>}

          {categories.length > 1 && <section className="mt-10"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">Explore by chapter</p><div className="mt-3 flex gap-2 overflow-x-auto pb-2">{categories.map((category) => <button key={category} onClick={() => setActiveCategory(category)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${activeCategory === category ? 'bg-[#3b4536] text-white' : 'border border-stone-300 bg-[#fffaf0] text-stone-700 hover:border-[#a66b27]'}`}>{category}</button>)}</div></section>}
          <section className="mt-10 pb-10"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">The Collection</p><h2 className="mt-2 font-serif text-3xl text-stone-900">Recorded Memories</h2></div><span className="text-sm text-stone-500">{filteredTracks.length} found</span></div><div className="mt-5 space-y-3">{filteredTracks.map((track, index) => <button key={track.id} onClick={() => selectTrack(track)} className={`group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition md:p-5 ${selectedTrack?.id === track.id ? 'border-[#b57931] bg-[#f4e7cf]' : 'border-stone-300 bg-[#fffaf0] hover:border-[#b57931] hover:shadow-sm'}`}><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8d4ae] font-serif text-lg text-[#76502a]">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 flex-1"><span className="block truncate font-serif text-xl text-stone-900">{track.title}</span><span className="mt-1 block text-sm text-stone-600">{track.speaker} · {new Date(track.created_at).toLocaleDateString()}</span></span><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-700 transition group-hover:border-[#a66b27] group-hover:text-[#8a561f]"><Volume2 className="h-4 w-4" /></span></button>)}</div></section>
        </div></section>
      </div>
    </main>
  );
}

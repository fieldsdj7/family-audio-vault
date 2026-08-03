'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle,
  FileAudio,
  Headphones,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Tag,
  Upload,
  UserRound,
} from 'lucide-react';

const vaults = [
  { name: 'Papa', title: "Papa's Life" },
  { name: 'Dad', title: "Dad's Life" },
  { name: 'Mom', title: "Mom's Life" },
];

export default function AdminUpload() {
  const [checkingLogin, setCheckingLogin] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setIsAuthenticated(!!session);
      setCheckingLogin(false);
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      setCheckingLogin(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError('');
    setResetMessage('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

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

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `recordings/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('audio-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('audio-files')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase.from('audio_tracks').insert([
        {
          title,
          speaker,
          category,
          vault_person: vaultPerson,
          audio_url: urlData.publicUrl,
          story_chapter: storyChapter || null,
        },
      ]);

      if (dbError) throw dbError;

      setMessage({
        type: 'success',
        text: `Saved to ${vaultPerson}'s vault.`,
      });

      setTitle('');
      setSpeaker('');
      setVaultPerson('Dad');
      setCategory('General');
      setFile(null);
      setFileInputKey((key) => key + 1);
      setStoryChapter('');
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to upload audio.';

      setMessage({
        type: 'error',
        text: errorMessage,
      });
    } finally {
      setUploading(false);
    }
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
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-800 outline-none focus:border-[#a66b27] focus:ring-2 focus:ring-[#d8a95f]/40"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-800 outline-none focus:border-[#a66b27] focus:ring-2 focus:ring-[#d8a95f]/40"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white transition hover:bg-[#293127]"
            >
              Sign In
            </button>

            <button
              type="button"
              onClick={handlePasswordReset}
              className="w-full text-sm font-medium text-[#8a561f] hover:underline"
            >
              Forgot password?
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f0e5] p-5 text-stone-800 md:p-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-[#8a561f]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Fields Family Vault
          </a>

          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-[#8a561f]"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>

        <header className="mt-6 border-b border-stone-300 pb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#a66b27]">
            Add to the collection
          </p>
          <h1 className="mt-2 font-serif text-4xl text-stone-900 md:text-5xl">
            Preserve a Memory
          </h1>
          <p className="mt-3 max-w-xl text-stone-600">
            Add the original recording now. Transcripts and family stories can be
            added later without losing the real voice behind them.
          </p>
        </header>

        <section className="mt-8 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
          {message && (
            <div
              className={`mb-6 flex items-center gap-3 rounded-xl border p-4 text-sm ${
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
                    className={`rounded-2xl border p-4 text-left transition ${
                      vaultPerson === vault.name
                        ? 'border-[#b57931] bg-[#f4e7cf] shadow-sm'
                        : 'border-stone-300 bg-white hover:border-[#b57931]'
                    }`}
                  >
                    <span className="flex items-center gap-2 font-serif text-lg text-stone-900">
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
                Story title *
              </label>
              <input
                type="text"
                required
                placeholder="Example: How Dad Met Mom"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27] focus:ring-2 focus:ring-[#d8a95f]/40"
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
                  type="text"
                  required
                  placeholder="Example: Dad and Dan"
                  value={speaker}
                  onChange={(e) => setSpeaker(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27] focus:ring-2 focus:ring-[#d8a95f]/40"
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
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27] focus:ring-2 focus:ring-[#d8a95f]/40"
                >
                  <option value="General">General</option>
                  <option value="Childhood">Childhood</option>
                  <option value="Love & Marriage">Love & Marriage</option>
                  <option value="Military & Work">Military & Work</option>
                  <option value="Faith">Faith</option>
                  <option value="Holidays & Family">Holidays & Family</option>
                  <option value="Life Lessons">Life Lessons</option>
                </select>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <FileAudio className="h-4 w-4 text-[#a66b27]" />
                <label className="text-sm font-semibold">Original audio file *</label>
              </div>
              <input
                key={fileInputKey}
                type="file"
                accept="audio/*"
                required
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full rounded-xl border border-dashed border-stone-400 bg-white px-4 py-3 text-sm text-stone-600 file:mr-4 file:rounded-lg file:border-0 file:bg-[#e8d4ae] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#65431f] hover:file:bg-[#dfc28e]"
              />
              {file && (
                <p className="mt-2 text-sm text-stone-600">
                  Ready to upload: <span className="font-medium">{file.name}</span>
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold">
                Story chapter or notes <span className="font-normal">(optional)</span>
              </label>
              <textarea
                rows={5}
                placeholder="Add notes now, or paste in the reviewed transcript or finished family story later."
                value={storyChapter}
                onChange={(e) => setStoryChapter(e.target.value)}
                className="w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27] focus:ring-2 focus:ring-[#d8a95f]/40"
              />
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3.5 font-semibold text-white transition hover:bg-[#293127] disabled:bg-stone-400"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Saving memory…
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
      </div>
    </main>
  );
}

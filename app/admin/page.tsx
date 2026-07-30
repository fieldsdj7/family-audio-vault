'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Upload,
} from 'lucide-react';

const ADMIN_USER_ID = '77841301-e8c3-4502-919e-350bc0ca0aa7';

type Notice = {
  type: 'success' | 'error';
  text: string;
};

export default function AdminUpload() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [title, setTitle] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [category, setCategory] = useState('General');
  const [file, setFile] = useState<File | null>(null);
  const [storyChapter, setStoryChapter] = useState('');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<Notice | null>(null);

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setIsAuthorized(session?.user.id === ADMIN_USER_ID);
      setCheckingSession(false);
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthorized(session?.user.id === ADMIN_USER_ID);
      setCheckingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoginError(error.message);
      setLoggingIn(false);
      return;
    }

    if (data.user.id !== ADMIN_USER_ID) {
      await supabase.auth.signOut();
      setLoginError('This account is not allowed to access the upload portal.');
    }

    setLoggingIn(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setMessage(null);
    setPassword('');
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();

    if (!file || !title || !speaker) {
      setMessage({
        type: 'error',
        text: 'Please fill in all required fields and select an audio file.',
      });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const fileExtension = file.name.split('.').pop() || 'audio';
      const fileName = `${Date.now()}.${fileExtension}`;
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
          audio_url: urlData.publicUrl,
          story_chapter: storyChapter || null,
        },
      ]);

      if (dbError) throw dbError;

      setMessage({
        type: 'success',
        text: 'Audio track successfully saved to the vault!',
      });
      setTitle('');
      setSpeaker('');
      setCategory('General');
      setFile(null);
      setStoryChapter('');
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to upload audio.';

      console.error('Upload error:', err);
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setUploading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
      </main>
    );
  }

  if (!isAuthorized) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-200 text-center space-y-6">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Admin Sign In
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Sign in with your Supabase admin account to upload recordings.
            </p>
          </div>

          {loginError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm flex items-center gap-2 text-left">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
              />
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
            >
              {loggingIn ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <LogIn className="w-5 h-5" />
              )}
              Sign In
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-200 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              📤 Upload Audio Memory
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Add a new voice recording to your family audio vault.
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="shrink-0 flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>

        {message && (
          <div
            className={`p-4 rounded-xl flex items-center gap-3 text-sm ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Story Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g., How Grandpa Met Grandma"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Speaker Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Grandpa John"
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 bg-white"
              >
                <option value="General">General</option>
                <option value="Childhood">Childhood</option>
                <option value="Love & Marriage">Love & Marriage</option>
                <option value="Career & Advice">Career & Advice</option>
                <option value="Holidays & Family">Holidays & Family</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Audio File (.mp3, .m4a, .wav) *
            </label>
            <input
              type="file"
              accept="audio/*"
              required
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full px-4 py-2 rounded-xl border border-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 text-slate-600 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Story Chapter / Notes (Optional)
            </label>
            <textarea
              rows={4}
              placeholder="Paste a transcript, AI storybook summary, or notes here..."
              value={storyChapter}
              onChange={(e) => setStoryChapter(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
            />
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Uploading...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" /> Save to Audio Vault
              </>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}

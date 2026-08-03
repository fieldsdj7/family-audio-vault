
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { AlertCircle, CheckCircle, Loader2, Lock } from 'lucide-react';

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function prepareReset() {
      const code = new URL(window.location.href).searchParams.get('code');

      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }

      setReady(true);
    }

    prepareReset();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage('');
    setMessage('');

    if (password.length < 8) {
      setErrorMessage('Please use at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('The two passwords do not match.');
      return;
    }

    setSaving(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMessage(error.message);
      setSaving(false);
      return;
    }

    setMessage('Password updated. You can now sign in to the admin page.');
    setSaving(false);
  }

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
          <h1 className="mt-2 font-serif text-3xl">Choose a New Password</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-7">
          {errorMessage && (
            <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorMessage}
            </div>
          )}

          {message && (
            <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle className="h-4 w-4 shrink-0" />
              {message}
            </div>
          )}

          {!ready ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-7 w-7 animate-spin text-[#a66b27]" />
            </div>
          ) : (
            <>
              <input
                type="password"
                required
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]"
              />

              <input
                type="password"
                required
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]"
              />

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white hover:bg-[#293127] disabled:bg-stone-400"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save New Password
              </button>

              {message && (
                <a
                  href="/admin"
                  className="block text-center text-sm font-medium text-[#8a561f] hover:underline"
                >
                  Go to Admin Sign In
                </a>
              )}
            </>
          )}
        </form>
      </div>
    </main>
  );
}

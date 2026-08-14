'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  ClipboardCopy,
  ClipboardList,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';

type Question = {
  id: string;
  question_number: number;
  question_text: string;
  created_at?: string;
  updated_at?: string;
};

type MemberResponse = {
  member?: {
    email: string;
    displayName: string;
    isAdmin: boolean;
    allowedVaults: string[];
  };
  error?: string;
};

type VaultPerson = 'Papa' | 'Dad' | 'Mom';

type StorytellerCreateResponse = {
  request?: {
    id: string;
    vaultPerson: VaultPerson;
    questionId: string;
    questionNumber: number;
    questionText: string;
    recipientName: string | null;
    recipientEmail: string | null;
    recipientPhone: string | null;
    status: string;
    expiresAt: string | null;
  };
  storytellerUrl?: string;
  error?: string;
};

export default function QuestionTrackerPage() {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [questionNumber, setQuestionNumber] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [search, setSearch] = useState('');

  const [sendingQuestion, setSendingQuestion] = useState<Question | null>(null);
  const [storytellerVaultPerson, setStorytellerVaultPerson] =
    useState<VaultPerson>('Papa');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [creatingStoryteller, setCreatingStoryteller] = useState(false);
  const [storytellerUrl, setStorytellerUrl] = useState('');
  const [storytellerError, setStorytellerError] = useState('');
  const [copied, setCopied] = useState(false);

  const visibleQuestions = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return questions;

    return questions.filter((question) => {
      return (
        String(question.question_number).includes(term) ||
        question.question_text.toLowerCase().includes(term)
      );
    });
  }, [questions, search]);

  useEffect(() => {
    void start();
  }, []);

  async function start() {
    setCheckingAccess(true);
    setLoading(true);

    try {
      const memberResponse = await fetch('/api/cloudflare/member', {
        cache: 'no-store',
      });

      const memberData = (await memberResponse.json()) as MemberResponse;

      if (!memberResponse.ok || !memberData.member) {
        setIsAdmin(false);
        return;
      }

      const allowed = memberData.member.isAdmin;
      setIsAdmin(allowed);

      if (allowed) {
        await loadQuestions();
      }
    } catch {
      setIsAdmin(false);
    } finally {
      setCheckingAccess(false);
      setLoading(false);
    }
  }

  async function loadQuestions() {
    try {
      const response = await fetch('/api/cloudflare/questions', {
        cache: 'no-store',
      });

      const data = (await response.json()) as {
        questions?: Question[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || 'Could not load the questions.');
      }

      setQuestions(data.questions || []);
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Could not load the questions.',
      });
    }
  }

  function resetEditor() {
    setEditingId(null);
    setQuestionNumber('');
    setQuestionText('');
  }

  function editQuestion(question: Question) {
    setEditingId(question.id);
    setQuestionNumber(String(question.question_number));
    setQuestionText(question.question_text);
    setMessage(null);

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  function openStoryteller(question: Question) {
    setSendingQuestion(question);
    setStorytellerVaultPerson('Papa');
    setRecipientName('');
    setRecipientEmail('');
    setRecipientPhone('');
    setStorytellerUrl('');
    setStorytellerError('');
    setCopied(false);
  }

  function closeStoryteller() {
    if (creatingStoryteller) return;

    setSendingQuestion(null);
    setStorytellerUrl('');
    setStorytellerError('');
    setCopied(false);
  }

  async function createStorytellerRequest() {
    if (!sendingQuestion) return;

    setCreatingStoryteller(true);
    setStorytellerError('');
    setStorytellerUrl('');
    setCopied(false);

    try {
      const response = await fetch('/api/cloudflare/storyteller-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vaultPerson: storytellerVaultPerson,
          questionId: sendingQuestion.id,
          recipientName: recipientName.trim() || null,
          recipientEmail: recipientEmail.trim() || null,
          recipientPhone: recipientPhone.trim() || null,
        }),
      });

      const data = (await response.json()) as StorytellerCreateResponse;

      if (!response.ok || !data.storytellerUrl) {
        throw new Error(
          data.error || 'Could not create the Storyteller link.',
        );
      }

      setStorytellerUrl(data.storytellerUrl);
    } catch (error) {
      setStorytellerError(
        error instanceof Error
          ? error.message
          : 'Could not create the Storyteller link.',
      );
    } finally {
      setCreatingStoryteller(false);
    }
  }

  async function copyStorytellerLink() {
    if (!storytellerUrl) return;

    try {
      await navigator.clipboard.writeText(storytellerUrl);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2500);
    } catch {
      setStorytellerError(
        'The browser could not copy the link automatically. Select the link below and copy it manually.',
      );
    }
  }

  async function saveQuestion(event: FormEvent) {
    event.preventDefault();

    const parsedNumber = Number(questionNumber);

    if (!Number.isInteger(parsedNumber) || parsedNumber < 1) {
      setMessage({
        type: 'error',
        text: 'Question number must be a whole number greater than zero.',
      });
      return;
    }

    if (!questionText.trim()) {
      setMessage({
        type: 'error',
        text: 'Please enter the question.',
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/cloudflare/questions', {
        method: editingId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          editingId
            ? {
                id: editingId,
                questionNumber: parsedNumber,
                questionText: questionText.trim(),
              }
            : {
                questionNumber: parsedNumber,
                questionText: questionText.trim(),
              },
        ),
      });

      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || 'Could not save the question.');
      }

      setMessage({
        type: 'success',
        text: editingId ? 'Question updated.' : 'Question added.',
      });

      resetEditor();
      await loadQuestions();
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Could not save the question.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuestion(question: Question) {
    const confirmed = window.confirm(
      `Delete question #${question.question_number}?\n\n${question.question_text}`,
    );

    if (!confirmed) return;

    setDeletingId(question.id);
    setMessage(null);

    try {
      const response = await fetch('/api/cloudflare/questions', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: question.id,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || 'Could not delete the question.');
      }

      if (editingId === question.id) {
        resetEditor();
      }

      setMessage({
        type: 'success',
        text: 'Question deleted.',
      });

      await loadQuestions();
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Could not delete the question.',
      });
    } finally {
      setDeletingId(null);
    }
  }

  if (checkingAccess || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] text-stone-700">
        <Loader2 className="h-7 w-7 animate-spin text-[#a66b27]" />
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] p-5 text-stone-800">
        <div className="w-full max-w-md rounded-3xl border border-stone-300 bg-[#fffaf0] p-8 text-center shadow-xl">
          <ShieldCheck className="mx-auto h-10 w-10 text-[#a66b27]" />

          <h1 className="mt-4 font-serif text-3xl text-stone-900">
            Question Tracker is private
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Only Vault administrators can organize the question list.
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
  }

  return (
    <main className="min-h-screen bg-[#f6f0e5] p-5 text-stone-800 md:p-10">
      <div className="mx-auto max-w-5xl">
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
            <ClipboardList className="h-9 w-9 text-[#a66b27]" />
            Question Tracker
          </h1>

          <p className="mt-3 max-w-2xl text-stone-600">
            Keep a simple backup list of the story questions as you add them.
          </p>
        </header>

        <section className="mt-8 rounded-3xl border border-[#ddc79f] bg-[#fbf3e3] p-6 shadow-sm md:p-8">
          <h2 className="font-serif text-2xl text-stone-900">
            {editingId ? 'Edit question' : 'Add a question'}
          </h2>

          <form onSubmit={saveQuestion} className="mt-5 space-y-5">
            {message && (
              <div
                className={`flex gap-2 rounded-xl border p-3 text-sm ${
                  message.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-800'
                }`}
              >
                {message.type === 'success' ? (
                  <CheckCircle className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}

                {message.text}
              </div>
            )}

            <div className="grid gap-5 md:grid-cols-[170px_1fr]">
              <div>
                <label className="mb-1.5 block text-sm font-semibold">
                  Question number
                </label>

                <input
                  required
                  value={questionNumber}
                  onChange={(event) => setQuestionNumber(event.target.value)}
                  inputMode="numeric"
                  placeholder="Example: 1"
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold">
                  Question
                </label>

                <input
                  required
                  value={questionText}
                  onChange={(event) => setQuestionText(event.target.value)}
                  placeholder="Type the question from the card"
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white hover:bg-[#293127] disabled:bg-stone-400"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingId ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}

                {saving
                  ? 'Saving…'
                  : editingId
                    ? 'Save changes'
                    : 'Add question'}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={resetEditor}
                  className="rounded-xl border border-stone-300 bg-white px-4 py-3 font-semibold text-stone-700"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="mt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">
                Question list
              </p>

              <h2 className="mt-2 font-serif text-3xl text-stone-900">
                {questions.length}{' '}
                {questions.length === 1 ? 'question' : 'questions'} saved
              </h2>
            </div>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search questions"
              className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#a66b27] sm:max-w-xs"
            />
          </div>

          <div className="mt-5 space-y-3">
            {visibleQuestions.map((question) => (
              <article
                key={question.id}
                className="rounded-2xl border border-stone-300 bg-[#fffaf0] p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#a66b27]">
                      Question {question.question_number}
                    </p>

                    <h3 className="mt-2 font-serif text-xl text-stone-900">
                      {question.question_text}
                    </h3>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openStoryteller(question)}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#d7bd8b] bg-[#fbf3e3] px-3 py-2 text-sm font-semibold text-[#7a4a19] hover:border-[#a66b27] hover:bg-[#f6e6c8]"
                    >
                      <Send className="h-4 w-4" />
                      Send Question
                    </button>

                    <button
                      type="button"
                      onClick={() => editQuestion(question)}
                      className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:border-[#a66b27]"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>

                    <button
                      type="button"
                      disabled={deletingId === question.id}
                      onClick={() => void deleteQuestion(question)}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      {deletingId === question.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}

                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}

            {!visibleQuestions.length && (
              <p className="rounded-2xl border border-dashed border-stone-300 bg-[#fffaf0] p-8 text-center text-stone-600">
                {search.trim()
                  ? 'No questions match your search.'
                  : 'No questions have been added yet.'}
              </p>
            )}
          </div>
        </section>
      </div>

      {sendingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-[#ddc79f] bg-[#fffaf0] shadow-2xl">
            <div className="flex items-start justify-between border-b border-stone-200 p-5 md:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">
                  Storyteller
                </p>

                <h2 className="mt-1 font-serif text-3xl text-stone-900">
                  Send a question
                </h2>
              </div>

              <button
                type="button"
                onClick={closeStoryteller}
                disabled={creatingStoryteller}
                aria-label="Close"
                className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-5 md:p-6">
              <div className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[.15em] text-[#a66b27]">
                  Question {sendingQuestion.question_number}
                </p>

                <p className="mt-2 font-serif text-xl leading-relaxed text-stone-900">
                  {sendingQuestion.question_text}
                </p>
              </div>

              {!storytellerUrl ? (
                <>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">
                      Save answer in which Vault?
                    </label>

                    <select
                      value={storytellerVaultPerson}
                      onChange={(event) =>
                        setStorytellerVaultPerson(
                          event.target.value as VaultPerson,
                        )
                      }
                      className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]"
                    >
                      <option value="Papa">Papa — Bill</option>
                      <option value="Dad">Dad — Dan</option>
                      <option value="Mom">Mom — Ivy</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">
                      Recipient name
                      <span className="ml-1 font-normal text-stone-500">
                        optional
                      </span>
                    </label>

                    <input
                      value={recipientName}
                      onChange={(event) => setRecipientName(event.target.value)}
                      placeholder="Example: Michael"
                      className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold">
                        Email
                        <span className="ml-1 font-normal text-stone-500">
                          optional
                        </span>
                      </label>

                      <input
                        type="email"
                        value={recipientEmail}
                        onChange={(event) =>
                          setRecipientEmail(event.target.value)
                        }
                        placeholder="name@example.com"
                        className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-semibold">
                        Phone
                        <span className="ml-1 font-normal text-stone-500">
                          optional
                        </span>
                      </label>

                      <input
                        type="tel"
                        value={recipientPhone}
                        onChange={(event) =>
                          setRecipientPhone(event.target.value)
                        }
                        placeholder="555-555-5555"
                        className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]"
                      />
                    </div>
                  </div>

                  <p className="rounded-xl bg-[#f6f0e5] p-3 text-sm leading-relaxed text-stone-600">
                    For now, the Vault will create a private link for you to copy
                    into your normal text message or email. It will not send
                    anything automatically.
                  </p>

                  {storytellerError && (
                    <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {storytellerError}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void createStorytellerRequest()}
                    disabled={creatingStoryteller}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-5 py-3.5 font-semibold text-white hover:bg-[#293127] disabled:bg-stone-400"
                  >
                    {creatingStoryteller ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Link2 className="h-5 w-5" />
                    )}

                    {creatingStoryteller
                      ? 'Creating private link…'
                      : 'Create Storyteller Link'}
                  </button>
                </>
              ) : (
                <>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="flex items-center gap-2 font-semibold text-emerald-900">
                      <CheckCircle className="h-5 w-5" />
                      Storyteller link created
                    </p>

                    <p className="mt-2 text-sm leading-relaxed text-emerald-800">
                      Copy this link and send it to the person who will answer
                      the question.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">
                      Private recording link
                    </label>

                    <textarea
                      readOnly
                      value={storytellerUrl}
                      rows={3}
                      onFocus={(event) => event.currentTarget.select()}
                      className="w-full resize-none rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none"
                    />
                  </div>

                  {storytellerError && (
                    <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {storytellerError}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void copyStorytellerLink()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-5 py-3.5 font-semibold text-white hover:bg-[#293127]"
                  >
                    {copied ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <ClipboardCopy className="h-5 w-5" />
                    )}

                    {copied ? 'Copied!' : 'Copy Link'}
                  </button>

                  <button
                    type="button"
                    onClick={closeStoryteller}
                    className="w-full rounded-xl border border-stone-300 bg-white px-5 py-3 font-semibold text-stone-700 hover:border-[#a66b27]"
                  >
                    Done
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

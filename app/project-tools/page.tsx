'use client';

import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  ClipboardList,
  FileWarning,
  Gauge,
  Loader2,
  Scissors,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

type ToolCard = {
  title: string;
  description: string;
  icon: LucideIcon;
  status: string;
};

const tools: ToolCard[] = [
  {
    title: 'Question Tracker',
    description:
      'Track all 150 question cards, see what has been recorded, what still needs review, and which answers are finished.',
    icon: ClipboardList,
    status: 'Planned next',
  },
  {
    title: 'Needs Review',
    description:
      'One simple list for recordings that need a transcript checked, a family story reviewed, or more information added.',
    icon: FileWarning,
    status: 'Planned',
  },
  {
    title: 'Trash & Restore',
    description:
      'Replace permanent deletion with a safe holding area, so a recording can be restored if something is removed by mistake.',
    icon: Trash2,
    status: 'Planned',
  },
  {
    title: 'Split Recording',
    description:
      'Keep one original recording safe while separating multiple short question answers into their own organized entries.',
    icon: Scissors,
    status: 'Planned',
  },
  {
    title: 'Book Builder',
    description:
      'Organize finished stories into chapters, review a book outline, and later create a printable family book.',
    icon: BookOpen,
    status: 'Planned',
  },
  {
    title: 'Vault Health & Backups',
    description:
      'See storage use, backup reminders, the OpenAI transcription-cost link, and other safeguards for the collection.',
    icon: Gauge,
    status: 'Planned',
  },
];

export default function ProjectToolsPage() {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

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

  if (checkingAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] text-stone-700">
        <Loader2 className="h-7 w-7 animate-spin text-[#a66b27]" />
      </main>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] p-5 text-stone-800">
        <div className="w-full max-w-md rounded-3xl border border-stone-300 bg-[#fffaf0] p-8 text-center shadow-xl">
          <ShieldCheck className="mx-auto h-10 w-10 text-[#a66b27]" />
          <h1 className="mt-4 font-serif text-3xl text-stone-900">
            Project Tools are private
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Sign in with an approved admin account to manage the family project.
          </p>
          <a
            href="/admin"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white hover:bg-[#293127]"
          >
            <ArrowLeft className="h-4 w-4" />
            Go to Admin Upload
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f0e5] p-5 text-stone-800 md:p-10">
      <div className="mx-auto max-w-5xl">
        <a
          href="/admin"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-[#8a561f]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin Upload
        </a>

        <header className="mt-6 border-b border-stone-300 pb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#a66b27]">
            Fields Family Vault
          </p>
          <h1 className="mt-2 flex items-center gap-3 font-serif text-4xl text-stone-900 md:text-5xl">
            <Wrench className="h-9 w-9 text-[#a66b27]" />
            Project Tools
          </h1>
          <p className="mt-3 max-w-2xl text-stone-600">
            Your private control center for organizing, protecting, and eventually turning
            the family memories into a book. The family-facing vault stays simple.
          </p>
        </header>

        <section className="mt-8 rounded-3xl border border-[#ddc79f] bg-[#fbf3e3] p-6 shadow-sm md:p-8">
          <h2 className="font-serif text-2xl text-stone-900">What is ready now</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            Uploading, transcripts, family stories, individual audio downloads, and the full
            vault ZIP backup remain on the Admin Upload page. The tools below are our planned
            next additions.
          </p>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2">
          {tools.map((tool) => {
            const Icon = tool.icon;

            return (
              <article
                key={tool.title}
                className="rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f1dfbd] text-[#8a561f]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
                    {tool.status}
                  </span>
                </div>

                <h2 className="mt-5 font-serif text-2xl text-stone-900">{tool.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">
                  {tool.description}
                </p>
              </article>
            );
          })}
        </section>

        <section className="mt-8 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 text-sm leading-relaxed text-stone-600 shadow-sm md:p-8">
          <p className="font-semibold text-stone-800">Future edit note</p>
          <p className="mt-2">
            When a tool is built, its card will become a button that opens its own workspace.
            Keeping the larger tools on separate pages prevents the Admin Upload page from
            becoming crowded or hard to use.
          </p>
        </section>
      </div>
    </main>
  );
}

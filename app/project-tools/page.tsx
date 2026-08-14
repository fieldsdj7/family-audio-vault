'use client';

import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';

import {
  ArrowLeft,
  BookOpen,
  ClipboardList,
  FileWarning,
  Gauge,
  Loader2,
  Mic2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

type ToolCard = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

const readyCards: ToolCard[] = [
  {
    href: '/project-tools/question-tracker',
    title: 'Question Tracker',
    description:
      'Keep a simple backup list of the family interview questions as you add them.',
    icon: ClipboardList,
  },
  {
    href: '/project-tools/needs-review',
    title: 'Needs Review',
    description:
      'See which recordings still need a transcript or family story, separated by Papa, Dad, and Mom.',
    icon: FileWarning,
  },
  {
    href: '/project-tools/trash',
    title: 'Trash & Restore',
    description:
      'Recover a recording removed by mistake or permanently remove it after confirmation.',
    icon: Trash2,
  },
  {
    href: '/project-tools/vault-health',
    title: 'Vault Health & Backups',
    description:
      'Check recording and storage health, see backup history, and download a complete Vault backup.',
    icon: Gauge,
  },
  {
    href: '/project-tools/book-builder',
    title: 'Book Builder',
    description:
      'Organize finished stories into chapters, review the book outline, and prepare the family history book.',
    icon: BookOpen,
  },
  {
    href: '/project-tools/voice-references',
    title: 'Voice References',
    description:
      'Save short voice samples for regular speakers so future transcriptions can recognize them by voice.',
    icon: Mic2,
  },
];

export default function ProjectToolsPage() {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void checkAccess();
  }, []);

  async function checkAccess() {
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

      setIsAdmin(response.ok && !!data.member?.isAdmin);
    } catch {
      setIsAdmin(false);
    } finally {
      setCheckingAccess(false);
    }
  }

  if (checkingAccess) {
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
            Project Tools are private
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Only approved Vault administrators can use the family project tools.
          </p>

          <a
            href="/"
            className="mt-6 inline-flex rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white hover:bg-[#293127]"
          >
            Return to the Vault
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
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-[#8a561f]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </a>

        <header className="mt-6 border-b border-stone-300 pb-7">
          <p className="text-xs font-semibold uppercase tracking-[.22em] text-[#a66b27]">
            Fields Family Vault
          </p>

          <h1 className="mt-2 font-serif text-4xl text-stone-900 md:text-5xl">
            Project Tools
          </h1>

          <p className="mt-3 max-w-2xl text-stone-600">
            Your private control center for organizing, protecting,
            and turning the family memories into a book.
            The family-facing Vault stays simple.
          </p>
        </header>

        <section className="mt-8">
          <h2 className="font-serif text-2xl text-stone-900">
            Ready now
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {readyCards.map((tool) => {
              const Icon = tool.icon;

              return (
                <a
                  key={tool.href}
                  href={tool.href}
                  className="group rounded-2xl border border-stone-300 bg-[#fffaf0] p-5 shadow-sm transition hover:border-[#a66b27] hover:shadow-md"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-[#f1e3ca] p-3">
                      <Icon className="h-6 w-6 text-[#8a561f]" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                          Ready
                        </span>
                      </div>

                      <h3 className="mt-3 font-serif text-xl text-stone-900">
                        {tool.title}
                      </h3>

                      <p className="mt-2 text-sm leading-relaxed text-stone-600">
                        {tool.description}
                      </p>

                      <p className="mt-4 text-sm font-semibold text-[#8a561f]">
                        Open {tool.title} →
                      </p>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </section>

        <section className="mt-9 rounded-2xl border border-stone-300 bg-[#fffaf0] p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#3b4536]" />

            <div>
              <p className="font-semibold text-stone-800">
                Safety note
              </p>

              <p className="mt-1 text-sm leading-relaxed text-stone-600">
                These tools are private to Vault administrators.
                Original recordings remain preserved in private Cloudflare storage.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

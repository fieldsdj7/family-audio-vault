"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  AlertCircle,
  BookHeart,
  CheckCircle2,
  Loader2,
  Mic,
} from "lucide-react";

type PublicRequest = {
  vaultPerson:
    | "Papa"
    | "Dad"
    | "Mom";
  vaultDisplayName: string;
  recipientName: string | null;
  questionNumber: number;
  questionText: string;
  status: string;
  expiresAt: string | null;
};

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default function StorytellerPage({
  params,
}: PageProps) {
  const [
    token,
    setToken,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    requestData,
    setRequestData,
  ] =
    useState<PublicRequest | null>(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState("");

  useEffect(() => {
    void loadToken();
  }, []);

  async function loadToken() {
    try {
      const resolved =
        await params;

      const nextToken =
        resolved.token;

      setToken(
        nextToken,
      );

      const response =
        await fetch(
          `/api/public/storyteller/${encodeURIComponent(
            nextToken,
          )}`,
          {
            cache:
              "no-store",
          },
        );

      const data =
        (await response.json()) as {
          request?: PublicRequest;
          error?: string;
        };

      if (
        !response.ok ||
        !data.request
      ) {
        throw new Error(
          data.error ||
            "This Storyteller request could not be opened.",
        );
      }

      setRequestData(
        data.request,
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "This Storyteller request could not be opened.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] px-5 text-stone-700">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#a66b27]" />
          <p className="mt-3 text-sm">
            Opening your Storyteller question…
          </p>
        </div>
      </main>
    );
  }

  if (
    error ||
    !requestData
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] p-5 text-stone-800">
        <div className="w-full max-w-lg rounded-3xl border border-rose-200 bg-[#fffaf0] p-8 text-center shadow-xl">
          <AlertCircle className="mx-auto h-10 w-10 text-rose-600" />

          <h1 className="mt-4 font-serif text-3xl text-stone-900">
            This link cannot be used
          </h1>

          <p className="mt-3 leading-relaxed text-stone-600">
            {error}
          </p>

          <p className="mt-5 text-sm text-stone-500">
            Ask the person who sent you this question for a new Storyteller link.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f0e5] px-5 py-8 text-stone-800 md:py-14">
      <div className="mx-auto max-w-2xl">
        <header className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#efe0c4]">
            <BookHeart className="h-7 w-7 text-[#8a561f]" />
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-[.22em] text-[#a66b27]">
            Fields Family Vault
          </p>

          <h1 className="mt-2 font-serif text-4xl text-stone-900 md:text-5xl">
            Storyteller
          </h1>

          <p className="mt-3 text-stone-600">
            A family memory is waiting for you.
          </p>
        </header>

        <section className="mt-8 rounded-3xl border border-[#ddc79f] bg-[#fffaf0] p-6 shadow-xl md:p-9">
          {requestData.recipientName && (
            <p className="text-lg text-stone-700">
              Hi{" "}
              <span className="font-semibold text-stone-900">
                {requestData.recipientName}
              </span>
              ,
            </p>
          )}

          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            You have been invited to record an answer for the{" "}
            <span className="font-semibold text-stone-800">
              {requestData.vaultDisplayName}
            </span>{" "}
            family story collection.
          </p>

          <div className="mt-7 rounded-2xl border border-stone-200 bg-white p-5 md:p-6">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">
              Your question
            </p>

            <p className="mt-3 font-serif text-2xl leading-relaxed text-stone-900 md:text-3xl">
              {requestData.questionText}
            </p>
          </div>

          <div className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="flex items-center gap-2 font-semibold text-emerald-900">
              <CheckCircle2 className="h-5 w-5" />
              No account or password needed
            </p>

            <p className="mt-2 text-sm leading-relaxed text-emerald-800">
              This private link is only for answering the question above. It does not give access to the rest of the Family Vault.
            </p>
          </div>

          <button
            type="button"
            disabled
            className="mt-7 inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-stone-300 px-5 py-4 font-semibold text-stone-600"
          >
            <Mic className="h-5 w-5" />
            Recording coming next
          </button>

          <p className="mt-3 text-center text-xs leading-relaxed text-stone-500">
            We are testing that your private question opens correctly before enabling microphone recording.
          </p>
        </section>
      </div>
    </main>
  );
}

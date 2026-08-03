'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  BookOpen,
  Calendar,
  Headphones,
  Play,
  Tag,
  User,
  Volume2,
} from 'lucide-react';

interface AudioTrack {
  id: string;
  title: string;
  speaker: string;
  category: string;
  audio_url: string;
  created_at: string;
  transcript?: string;
  story_chapter?: string;
}

export default function Home() {
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrack, setSelectedTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    fetchTracks();
  }, []);

  async function fetchTracks() {
    setLoading(true);

    const { data, error } = await supabase
      .from('audio_tracks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tracks:', error);
    } else if (data) {
      setTracks(data);
      if (data.length > 0) setSelectedTrack(data[0]);
    }

    setLoading(false);
  }

  const categories = [
    'All',
    ...Array.from(new Set(tracks.map((track) => track.category || 'General'))),
  ];

  const filteredTracks =
    activeCategory === 'All'
      ? tracks
      : tracks.filter((track) => track.category === activeCategory);

  function selectTrack(track: AudioTrack) {
    setSelectedTrack(track);
    setIsPlaying(true);
  }

  return (
    <main className="min-h-screen bg-[#f6f0e5] text-stone-800">
      <div className="grid min-h-screen lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="border-b border-stone-800 bg-[#20221e] px-5 py-6 text-stone-100 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#c98b3c] text-[#20221e]">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="font-serif text-lg leading-none">Family Vault</p>
              <p className="mt-1 text-xs text-stone-400">Stories worth keeping</p>
            </div>
          </div>

          <nav className="mt-8 flex gap-2 overflow-x-auto lg:block lg:space-y-2">
            <a
              href="/"
              className="flex shrink-0 items-center gap-3 rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-white"
            >
              <Headphones className="h-4 w-4 text-[#d8a95f]" />
              Dad&apos;s Life
            </a>

            <a
              href="/admin"
              className="flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm text-stone-300 transition hover:bg-white/10 hover:text-white"
            >
              <BookOpen className="h-4 w-4 text-[#d8a95f]" />
              Admin Upload
            </a>
          </nav>

          <div className="mt-10 hidden border-t border-white/10 pt-6 lg:block">
            <p className="font-serif text-lg text-stone-200">
              A family legacy, kept in their own words.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-stone-400">
              Listen to the voices, stories, and memories that made our family
              who we are.
            </p>
          </div>
        </aside>

        <section className="p-5 md:p-10">
          <div className="mx-auto max-w-5xl">
            <header className="flex flex-col gap-4 border-b border-stone-300 pb-7 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#a66b27]">
                  Our Family Legacy
                </p>
                <h1 className="mt-2 font-serif text-4xl text-stone-900 md:text-5xl">
                  Dad&apos;s Life
                </h1>
                <p className="mt-3 max-w-xl text-stone-600">
                  A living collection of stories, memories, and the voice we
                  never want to forget.
                </p>
              </div>

              <a
                href="/admin"
                className="inline-flex w-fit items-center gap-2 rounded-full border border-stone-400 bg-[#fffaf0] px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-[#a66b27] hover:text-[#8a561f]"
              >
                <BookOpen className="h-4 w-4" />
                Admin
              </a>
            </header>

            <section className="mt-8 overflow-hidden rounded-3xl bg-[#5b4837] shadow-lg">
              <div className="grid md:grid-cols-[1.05fr_.95fr]">
                <div className="flex min-h-[280px] flex-col justify-between p-7 text-[#fffaf0] md:p-10">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#e3bb77]">
                      The Legacy Book
                    </p>
                    <h2 className="mt-4 max-w-md font-serif text-4xl leading-tight md:text-5xl">
                      The stories that made him who he is.
                    </h2>
                    <p className="mt-5 max-w-md leading-relaxed text-stone-200">
                      Every recording is a piece of family history, preserved
                      for children, grandchildren, and the ones still to come.
                    </p>
                  </div>

                  <div className="mt-8 flex items-center gap-3 text-sm text-stone-200">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8a95f]/60">
                      <Headphones className="h-4 w-4 text-[#e3bb77]" />
                    </span>
                    <span>
                      {tracks.length} {tracks.length === 1 ? 'recording' : 'recordings'}{' '}
                      preserved
                    </span>
                  </div>
                </div>

                <div className="relative hidden items-center justify-center overflow-hidden bg-[#c38a45] p-10 md:flex">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,.25),_transparent_60%)]" />
                  <div className="relative flex h-48 w-36 rotate-[-5deg] flex-col justify-between rounded-r-md border border-[#6d4824] bg-[#f5dfb1] p-5 shadow-2xl">
                    <BookOpen className="h-8 w-8 text-[#80542a]" />
                    <div>
                      <p className="font-serif text-2xl leading-tight text-[#54371f]">
                        Dad&apos;s
                        <br />
                        Life
                      </p>
                      <div className="mt-4 h-px bg-[#9e7140]" />
                      <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-[#80542a]">
                        Family stories
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {selectedTrack ? (
              <section className="mt-10 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">
                      Now Listening
                    </p>
                    <h2 className="mt-2 font-serif text-3xl text-stone-900">
                      {selectedTrack.title}
                    </h2>

                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-600">
                      <span className="flex items-center gap-2">
                        <User className="h-4 w-4 text-[#a66b27]" />
                        {selectedTrack.speaker}
                      </span>
                      <span className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-[#a66b27]" />
                        {new Date(selectedTrack.created_at).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-[#a66b27]" />
                        {selectedTrack.category || 'General'}
                      </span>
                    </div>
                  </div>

                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#c98b3c] text-[#342519]">
                    <Play className="ml-0.5 h-5 w-5 fill-current" />
                  </div>
                </div>

                <audio
                  key={selectedTrack.id}
                  controls
                  autoPlay={isPlaying}
                  className="mt-7 w-full"
                  src={selectedTrack.audio_url}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />

                {selectedTrack.story_chapter && (
                  <div className="mt-7 border-t border-stone-200 pt-7">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">
                      Family Story
                    </p>
                    <p className="mt-3 whitespace-pre-line font-serif text-lg leading-relaxed text-stone-700">
                      {selectedTrack.story_chapter}
                    </p>
                  </div>
                )}
              </section>
            ) : (
              <section className="mt-10 rounded-3xl border border-dashed border-stone-300 bg-[#fffaf0] p-10 text-center">
                <Headphones className="mx-auto h-8 w-8 text-[#a66b27]" />
                <h2 className="mt-4 font-serif text-2xl text-stone-900">
                  {loading ? 'Opening the vault…' : 'No stories have been added yet.'}
                </h2>
                {!loading && (
                  <p className="mt-2 text-stone-600">
                    The first recording will become the beginning of this legacy book.
                  </p>
                )}
              </section>
            )}

            {categories.length > 1 && (
              <section className="mt-10">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">
                  Explore by chapter
                </p>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setActiveCategory(category)}
                      className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                        activeCategory === category
                          ? 'bg-[#3b4536] text-white'
                          : 'border border-stone-300 bg-[#fffaf0] text-stone-700 hover:border-[#a66b27]'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-10 pb-10">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">
                    The Collection
                  </p>
                  <h2 className="mt-2 font-serif text-3xl text-stone-900">
                    Recorded Memories
                  </h2>
                </div>
                <span className="text-sm text-stone-500">
                  {filteredTracks.length} found
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {filteredTracks.map((track, index) => (
                  <button
                    key={track.id}
                    onClick={() => selectTrack(track)}
                    className={`group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition md:p-5 ${
                      selectedTrack?.id === track.id
                        ? 'border-[#b57931] bg-[#f4e7cf]'
                        : 'border-stone-300 bg-[#fffaf0] hover:border-[#b57931] hover:shadow-sm'
                    }`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8d4ae] font-serif text-lg text-[#76502a]">
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-serif text-xl text-stone-900">
                        {track.title}
                      </span>
                      <span className="mt-1 block text-sm text-stone-600">
                        {track.speaker} ·{' '}
                        {new Date(track.created_at).toLocaleDateString()}
                      </span>
                    </span>

                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-700 transition group-hover:border-[#a66b27] group-hover:text-[#8a561f]">
                      <Volume2 className="h-4 w-4" />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

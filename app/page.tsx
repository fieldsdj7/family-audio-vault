'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Play, Pause, Volume2, Calendar, User, Tag } from 'lucide-react';

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
  const [activeCategory, setActiveCategory] = useState<string>('All');

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
      if (data.length > 0) {
        setSelectedTrack(data[0]);
      }
    }
    setLoading(false);
  }

  const categories = ['All', ...Array.from(new Set(tracks.map((t) => t.category || 'General')))];

  const filteredTracks = activeCategory === 'All'
    ? tracks
    : tracks.filter((t) => t.category === activeCategory);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="text-center py-6 border-b border-slate-200">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            🎙️ Family Voice Vault
          </h1>
          <p className="text-slate-500 mt-2">
            Preserving spoken memories & stories for future generations.
          </p>
        </header>

        {/* Audio Player Card (Active Track) */}
        {selectedTrack ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                  {selectedTrack.category || 'General'}
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-2">
                  {selectedTrack.title}
                </h2>
                <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4" /> {selectedTrack.speaker}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" /> {new Date(selectedTrack.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Built-in HTML5 Audio Element */}
            <div className="pt-2">
              <audio
                key={selectedTrack.id}
                controls
                autoPlay={isPlaying}
                className="w-full"
                src={selectedTrack.audio_url}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            </div>

            {/* Optional AI Storybook Chapter View */}
            {selectedTrack.story_chapter && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                <h3 className="font-semibold text-slate-900 mb-2">📖 Storybook Chapter</h3>
                <p className="text-slate-600 leading-relaxed whitespace-pre-line text-sm md:text-base bg-slate-50 p-4 rounded-xl">
                  {selectedTrack.story_chapter}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 text-center text-slate-500 border border-slate-200">
            {loading ? 'Loading audio vault...' : 'No audio stories found yet.'}
          </div>
        )}

        {/* Category Filters */}
        {categories.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <Tag className="w-4 h-4 text-slate-400 shrink-0" />
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  activeCategory === cat
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Audio Track List */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">All Recordings</h3>
          {filteredTracks.map((track) => (
            <div
              key={track.id}
              onClick={() => {
                setSelectedTrack(track);
                setIsPlaying(true);
              }}
              className={`p-4 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                selectedTrack?.id === track.id
                  ? 'border-indigo-500 bg-indigo-50/50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="space-y-1">
                <h4 className="font-medium text-slate-900">{track.title}</h4>
                <p className="text-xs text-slate-500">
                  {track.speaker} • {new Date(track.created_at).toLocaleDateString()}
                </p>
              </div>
              <button className="p-2 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200">
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

      </div>
    </main>
  );
}
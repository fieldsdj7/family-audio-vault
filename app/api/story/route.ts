import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Track = {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: string | null;
  transcript: string | null;
};

type StoryResult = { title?: string; story?: string };

function cleanStoryResult(value: StoryResult) {
  return {
    title: typeof value.title === 'string' ? value.title.trim() : '',
    story: typeof value.story === 'string' ? value.story.trim() : '',
  };
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;

  if (!token) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!url || !serviceRoleKey || !openAiKey) {
    return NextResponse.json({ error: 'The story service has not been configured yet.' }, { status: 500 });
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return NextResponse.json({ error: 'Your sign-in has expired.' }, { status: 401 });

  const { data: admin } = await supabase
    .from('vault_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) return NextResponse.json({ error: 'Only the vault administrator can create family stories.' }, { status: 403 });

  const body = (await request.json()) as { trackId?: string };
  if (!body.trackId) return NextResponse.json({ error: 'A recording was not specified.' }, { status: 400 });

  const { data: track, error: trackError } = await supabase
    .from('audio_tracks')
    .select('id, title, speaker, category, vault_person, transcript')
    .eq('id', body.trackId)
    .single<Track>();
  if (trackError || !track) return NextResponse.json({ error: 'The recording could not be found.' }, { status: 404 });
  if (!track.transcript?.trim()) return NextResponse.json({ error: 'This recording needs a transcript first.' }, { status: 400 });

  await supabase
    .from('audio_tracks')
    .update({ story_status: 'processing', story_error: null })
    .eq('id', track.id);

  try {
    const instructions = [
      'You turn a spoken family-memory transcript into a careful, readable first-person life-story passage.',
      'Use only facts stated in the transcript. Do not add names, dates, motives, dialogue, emotions, or events that were not said.',
      'Keep the speaker\'s point of view and meaning. Remove only obvious false starts, repeated fragments, and filler words.',
      'Do not hide uncertainty: retain bracketed unclear words exactly as written.',
      'Write 2 to 6 short, warm book-ready paragraphs. Do not include a heading in the story text.',
      'Return valid JSON only, with exactly two string fields: title and story.',
      'The title should be specific, warm, and 3 to 8 words long—not generic and not made-up.',
    ].join(' ');

    const prompt = `Recording title: ${track.title}\nSpeaker: ${track.speaker}\nLegacy book: ${track.vault_person || 'Dad'}\nCategory: ${track.category || 'General'}\n\nTranscript:\n${track.transcript}`;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: prompt },
        ],
      }),
    });
    const responseBody = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    const content = responseBody.choices?.[0]?.message?.content;
    if (!response.ok || !content) throw new Error(responseBody.error?.message || 'OpenAI could not create the story.');

    let parsed: StoryResult;
    try {
      parsed = JSON.parse(content) as StoryResult;
    } catch {
      throw new Error('OpenAI returned a story in an unexpected format. Please try again.');
    }
    const { title, story } = cleanStoryResult(parsed);
    if (!title || !story) throw new Error('OpenAI returned an incomplete story. Please try again.');

    const { error: updateError } = await supabase
      .from('audio_tracks')
      .update({ story_title: title, story_chapter: story, story_status: 'complete', story_error: null })
      .eq('id', track.id);
    if (updateError) throw updateError;

    return NextResponse.json({ title, story });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Story creation failed.';
    await supabase
      .from('audio_tracks')
      .update({ story_status: 'failed', story_error: message })
      .eq('id', track.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

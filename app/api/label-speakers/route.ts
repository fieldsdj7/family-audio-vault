import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Track = {
  id: string;
  transcript: string | null;
};

type SpeakerResult = {
  transcript?: string;
  speakerCount?: number;
};

function withoutSpeakerLabels(value: string) {
  return value.replace(/(^|\n)\s*Speaker\s+\d+\s*:\s*/gi, '$1').trim();
}

function wordTokens(value: string) {
  return (value.match(/[\p{L}\p{N}]+(?:['â€™][\p{L}\p{N}]+)*/gu) || [])
    .map((word) => word.toLocaleLowerCase().replaceAll('â€™', "'"));
}

function hasTheSameWords(original: string, labeled: string) {
  const originalWords = wordTokens(withoutSpeakerLabels(original));
  const labeledWords = wordTokens(withoutSpeakerLabels(labeled));
  return originalWords.length === labeledWords.length
    && originalWords.every((word, index) => word === labeledWords[index]);
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
    return NextResponse.json({ error: 'The speaker-label service has not been configured yet.' }, { status: 500 });
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
  if (!admin) {
    return NextResponse.json({ error: 'Only the vault administrator can label speakers.' }, { status: 403 });
  }

  const body = (await request.json()) as { trackId?: string; transcript?: string };
  if (!body.trackId) return NextResponse.json({ error: 'A recording was not specified.' }, { status: 400 });

  const { data: track, error: trackError } = await supabase
    .from('audio_tracks')
    .select('id, transcript')
    .eq('id', body.trackId)
    .single<Track>();
  if (trackError || !track) return NextResponse.json({ error: 'The recording could not be found.' }, { status: 404 });

  const originalTranscript = (body.transcript || track.transcript || '').trim();
  if (!originalTranscript) {
    return NextResponse.json({ error: 'This recording needs a transcript before speakers can be labeled.' }, { status: 400 });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'Separate a word-for-word family interview transcript into speaker turns.',
              'The interviewer usually asks the numbered questions and the family member gives the longer answers.',
              'Use conversational context to assign short phrases such as yes, okay, and follow-up questions.',
              'Do not correct, rewrite, summarize, add, remove, or reorder any spoken words.',
              'Only insert paragraph breaks and labels in the exact form Speaker 1: and Speaker 2:.',
              'Use the same number for each person throughout the entire transcript.',
              'Return JSON only with transcript as a string and speakerCount as a number.',
            ].join(' '),
          },
          { role: 'user', content: originalTranscript },
        ],
      }),
      signal: AbortSignal.timeout(50_000),
    });

    const responseBody = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    const content = responseBody.choices?.[0]?.message?.content;
    if (!response.ok || !content) {
      throw new Error(responseBody.error?.message || 'OpenAI could not separate the speakers.');
    }

    let parsed: SpeakerResult;
    try {
      parsed = JSON.parse(content) as SpeakerResult;
    } catch {
      throw new Error('OpenAI returned speaker labels in an unexpected format. Please try again.');
    }

    const labeledTranscript = parsed.transcript?.trim() || '';
    const speakerCount = Number(parsed.speakerCount || 0);
    if (!labeledTranscript || speakerCount < 2 || !/Speaker\s+1\s*:/i.test(labeledTranscript) || !/Speaker\s+2\s*:/i.test(labeledTranscript)) {
      throw new Error('OpenAI could not reliably separate two speakers in this transcript.');
    }
    if (!hasTheSameWords(originalTranscript, labeledTranscript)) {
      throw new Error('Speaker labeling tried to change some transcript words, so the original was kept safe. Please try again.');
    }

    const { error: updateError } = await supabase
      .from('audio_tracks')
      .update({
        transcript: labeledTranscript,
        transcription_status: 'complete',
        transcription_error: null,
      })
      .eq('id', track.id);
    if (updateError) throw updateError;

    return NextResponse.json({ transcript: labeledTranscript, speakerCount });
  } catch (error) {
    const message =
      error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
        ? 'Speaker labeling took too long. Please try again.'
        : error instanceof Error
          ? error.message
          : 'Speaker labeling failed.';

    await supabase
      .from('audio_tracks')
      .update({ transcription_status: 'complete', transcription_error: message })
      .eq('id', track.id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

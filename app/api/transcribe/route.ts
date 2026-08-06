import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Track = {
  id: string;
  storage_path: string | null;
};

type DiarizedSegment = {
  text?: string;
  speaker?: string;
};

type DiarizedTranscription = {
  text?: string;
  segments?: DiarizedSegment[];
  error?: { message?: string };
};

function fileNameFromPath(path: string) {
  return path.split('/').pop() || 'recording.mp3';
}

function formatSpeakerTranscript(response: DiarizedTranscription) {
  const segments = (response.segments || []).filter(
    (segment): segment is DiarizedSegment & { text: string; speaker: string } =>
      Boolean(segment.text?.trim() && segment.speaker)
  );

  const speakers = [...new Set(segments.map((segment) => segment.speaker))];
  if (speakers.length <= 1) return response.text?.trim() || segments.map((segment) => segment.text.trim()).join(' ');

  const speakerNumbers = new Map(speakers.map((speaker, index) => [speaker, index + 1]));
  const turns: Array<{ speaker: string; text: string }> = [];

  for (const segment of segments) {
    const text = segment.text.trim();
    const previousTurn = turns.at(-1);

    if (previousTurn?.speaker === segment.speaker) {
      previousTurn.text = `${previousTurn.text} ${text}`;
    } else {
      turns.push({ speaker: segment.speaker, text });
    }
  }

  return turns
    .map((turn) => `Speaker ${speakerNumbers.get(turn.speaker)}: ${turn.text}`)
    .join('\n\n');
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;

  if (!token) {
    return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  if (!url || !serviceRoleKey || !openAiKey) {
    return NextResponse.json(
      { error: 'The transcription service has not been configured yet.' },
      { status: 500 }
    );
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: 'Your sign-in has expired.' }, { status: 401 });
  }

  const { data: admin } = await supabase
    .from('vault_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!admin) {
    return NextResponse.json({ error: 'Only the vault administrator can transcribe recordings.' }, { status: 403 });
  }

  const body = (await request.json()) as { trackId?: string };
  if (!body.trackId) {
    return NextResponse.json({ error: 'A recording was not specified.' }, { status: 400 });
  }

  const { data: track, error: trackError } = await supabase
    .from('audio_tracks')
    .select('id, storage_path')
    .eq('id', body.trackId)
    .single<Track>();

  if (trackError || !track?.storage_path) {
    return NextResponse.json({ error: 'This recording is missing its private storage path.' }, { status: 404 });
  }

  await supabase
    .from('audio_tracks')
    .update({ transcription_status: 'processing', transcription_error: null })
    .eq('id', track.id);

  try {
    const { data: audio, error: downloadError } = await supabase.storage
      .from('audio-files')
      .download(track.storage_path);

    if (downloadError || !audio) throw new Error(downloadError?.message || 'Could not open the audio file.');

    // OpenAI file transcription accepts files up to 25 MB.
    if (audio.size > 25 * 1024 * 1024) {
      throw new Error('This file is over 25 MB. Please upload a smaller MP3 or split the recording first.');
    }

    const form = new FormData();
    form.append('model', 'gpt-4o-transcribe-diarize');
    form.append('response_format', 'diarized_json');
    form.append('chunking_strategy', 'auto');
    form.append('file', audio, fileNameFromPath(track.storage_path));

    const openAiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}` },
      body: form,
    });

    const responseBody = await openAiResponse.json() as DiarizedTranscription;
    if (!openAiResponse.ok || !responseBody.text) {
      throw new Error(responseBody.error?.message || 'OpenAI could not transcribe this recording.');
    }

    const transcript = formatSpeakerTranscript(responseBody);

    const { error: updateError } = await supabase
      .from('audio_tracks')
      .update({
        transcript,
        transcription_status: 'complete',
        transcription_error: null,
      })
      .eq('id', track.id);

    if (updateError) throw updateError;

    return NextResponse.json({ transcript });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transcription failed.';
    await supabase
      .from('audio_tracks')
      .update({ transcription_status: 'failed', transcription_error: message })
      .eq('id', track.id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

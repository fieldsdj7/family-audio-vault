import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type Track = {
  id: string;
  storage_path: string | null;
  audio_url: string | null;
  trashed_at: string | null;
};

function getStoragePath(track: Track) {
  if (track.storage_path) return track.storage_path;

  // Supports recordings uploaded before the private-vault change.
  const marker = '/audio-files/';
  return track.audio_url?.split(marker)[1] || null;
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
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'The deletion service is not configured.' }, { status: 500 });
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
    return NextResponse.json(
      { error: 'Only the vault administrator can delete recordings.' },
      { status: 403 }
    );
  }

  const body = (await request.json()) as {
    trackId?: string;
    action?: 'trash' | 'restore' | 'permanent';
  };
  if (!body.trackId) {
    return NextResponse.json({ error: 'A recording was not specified.' }, { status: 400 });
  }
  const action = body.action || 'trash';
  if (!['trash', 'restore', 'permanent'].includes(action)) {
    return NextResponse.json({ error: 'That action is not available.' }, { status: 400 });
  }

  const { data: track, error: trackError } = await supabase
    .from('audio_tracks')
    .select('id, storage_path, audio_url, trashed_at')
    .eq('id', body.trackId)
    .single<Track>();
  if (trackError || !track) {
    return NextResponse.json({ error: 'That recording could not be found.' }, { status: 404 });
  }

  if (action === 'trash') {
    if (track.trashed_at) {
      return NextResponse.json({ error: 'This recording is already in Trash.' }, { status: 409 });
    }
    const { error: trashError } = await supabase
      .from('audio_tracks')
      .update({ trashed_at: new Date().toISOString(), trashed_by: user.id })
      .eq('id', track.id);
    if (trashError) {
      return NextResponse.json({ error: trashError.message }, { status: 500 });
    }
    return NextResponse.json({ trashed: true });
  }

  if (action === 'restore') {
    if (!track.trashed_at) {
      return NextResponse.json({ error: 'This recording is not in Trash.' }, { status: 409 });
    }
    const { error: restoreError } = await supabase
      .from('audio_tracks')
      .update({ trashed_at: null, trashed_by: null })
      .eq('id', track.id);
    if (restoreError) {
      return NextResponse.json({ error: restoreError.message }, { status: 500 });
    }
    return NextResponse.json({ restored: true });
  }

  if (!track.trashed_at) {
    return NextResponse.json(
      { error: 'Move this recording to Trash before permanently removing it.' },
      { status: 409 }
    );
  }

  const storagePath = getStoragePath(track);
  if (storagePath) {
    const { error: storageError } = await supabase.storage
      .from('audio-files')
      .remove([storagePath]);
    if (storageError) {
      return NextResponse.json(
        { error: `The audio file could not be permanently removed: ${storageError.message}` },
        { status: 500 }
      );
    }
  }

  const { error: deleteError } = await supabase
    .from('audio_tracks')
    .delete()
    .eq('id', track.id);
  if (deleteError) {
    return NextResponse.json(
      { error: 'The audio file was removed, but its vault entry could not be removed. Please refresh the page.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ permanentlyDeleted: true });
}

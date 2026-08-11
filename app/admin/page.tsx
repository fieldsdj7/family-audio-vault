'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle,
  Copy,
  Download,
  FileAudio,
  Headphones,
  ImagePlus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Tag,
  Upload,
  UserRound,
  Wrench,
} from 'lucide-react';

type VaultPerson = 'Papa' | 'Dad' | 'Mom';

type AudioTrack = {
  id: string;
  title: string;
  speaker: string;
  category: string | null;
  vault_person: VaultPerson;
  question_id?: string | null;
  question_number?: number | null;
  question_text?: string | null;
  created_at: string;
  transcript?: string | null;
  story_title?: string | null;
  story_chapter?: string | null;
  transcription_status?: string | null;
  story_status?: string | null;
  speaker_1_name?: string | null;
  speaker_2_name?: string | null;
  storage_path?: string | null;
  source_track_id?: string | null;
  clip_start_seconds?: number | null;
  clip_end_seconds?: number | null;
};

type Question = {
  id: string;
  question_number: number;
  question_text: string;
};

type StoryPhoto = {
  id: string;
  audio_track_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

const vaults: {
  name: VaultPerson;
  displayName: string;
  title: string;
}[] = [
  {
    name: 'Papa',
    displayName: 'Papa — Bill',
    title: "Papa's Life",
  },
  {
    name: 'Dad',
    displayName: 'Dad — Dan',
    title: "Dad's Life",
  },
  {
    name: 'Mom',
    displayName: 'Mom — Ivy',
    title: "Mom's Life",
  },
];

function vaultDisplayName(
  person: VaultPerson,
) {
  return (
    vaults.find(
      (vault) =>
        vault.name === person,
    )?.displayName || person
  );
}

function writeWavString(
  view: DataView,
  offset: number,
  value: string,
) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(
      offset + index,
      value.charCodeAt(index),
    );
  }
}

function findQuietBoundary(
  buffer: AudioBuffer,
  targetSeconds: number,
) {
  const searchRadiusSeconds = 12;
  const windowSeconds = 0.25;
  const stepSeconds = 0.1;
  const sampleStride = 32;

  const searchStart = Math.max(
    1,
    targetSeconds - searchRadiusSeconds,
  );

  const searchEnd = Math.min(
    buffer.duration - 1,
    targetSeconds + searchRadiusSeconds,
  );

  let bestTime = targetSeconds;
  let bestLevel = Number.POSITIVE_INFINITY;

  for (
    let time = searchStart;
    time <= searchEnd;
    time += stepSeconds
  ) {
    const startFrame = Math.floor(
      time * buffer.sampleRate,
    );

    const endFrame = Math.min(
      buffer.length,
      Math.floor(
        (time + windowSeconds) * buffer.sampleRate,
      ),
    );

    let total = 0;
    let samples = 0;

    for (
      let frame = startFrame;
      frame < endFrame;
      frame += sampleStride
    ) {
      let mixed = 0;

      for (
        let channel = 0;
        channel < buffer.numberOfChannels;
        channel += 1
      ) {
        mixed += Math.abs(
          buffer.getChannelData(channel)[frame] || 0,
        );
      }

      total += mixed / buffer.numberOfChannels;
      samples += 1;
    }

    const level =
      samples > 0
        ? total / samples
        : Number.POSITIVE_INFINITY;

    if (level < bestLevel) {
      bestLevel = level;
      bestTime = time + windowSeconds / 2;
    }
  }

  return bestTime;
}

function createMonoTranscriptionWav(
  buffer: AudioBuffer,
  startSeconds: number,
  endSeconds: number,
  chunkNumber: number,
) {
  const targetSampleRate = 16000;

  const durationSeconds = Math.max(
    0,
    endSeconds - startSeconds,
  );

  const outputSamples = Math.max(
    1,
    Math.floor(
      durationSeconds * targetSampleRate,
    ),
  );

  const dataSize =
    outputSamples * 2;

  const output =
    new ArrayBuffer(
      44 + dataSize,
    );

  const view =
    new DataView(output);

  writeWavString(
    view,
    0,
    'RIFF',
  );

  view.setUint32(
    4,
    36 + dataSize,
    true,
  );

  writeWavString(
    view,
    8,
    'WAVE',
  );

  writeWavString(
    view,
    12,
    'fmt ',
  );

  view.setUint32(
    16,
    16,
    true,
  );

  view.setUint16(
    20,
    1,
    true,
  );

  view.setUint16(
    22,
    1,
    true,
  );

  view.setUint32(
    24,
    targetSampleRate,
    true,
  );

  view.setUint32(
    28,
    targetSampleRate * 2,
    true,
  );

  view.setUint16(
    32,
    2,
    true,
  );

  view.setUint16(
    34,
    16,
    true,
  );

  writeWavString(
    view,
    36,
    'data',
  );

  view.setUint32(
    40,
    dataSize,
    true,
  );

  const channelData =
    Array.from(
      {
        length: buffer.numberOfChannels,
      },
      (_, channel) =>
        buffer.getChannelData(channel),
    );

  const sourceRate =
    buffer.sampleRate;

  let offset = 44;

  for (
    let sample = 0;
    sample < outputSamples;
    sample += 1
  ) {
    const sourceTime =
      startSeconds +
      sample / targetSampleRate;

    const sourceFrame = Math.min(
      buffer.length - 1,
      Math.floor(
        sourceTime * sourceRate,
      ),
    );

    let value = 0;

    for (
      let channel = 0;
      channel < channelData.length;
      channel += 1
    ) {
      value +=
        channelData[channel][sourceFrame] || 0;
    }

    value /=
      Math.max(
        1,
        channelData.length,
      );

    value = Math.max(
      -1,
      Math.min(
        1,
        value,
      ),
    );

    view.setInt16(
      offset,
      value < 0
        ? value * 0x8000
        : value * 0x7fff,
      true,
    );

    offset += 2;
  }

  return new File(
    [output],
    `transcription-part-${chunkNumber}.wav`,
    {
      type: 'audio/wav',
    },
  );
}

async function transcribeLongRecording(
  trackId: string,
  onProgress: (message: string) => void,
) {
  onProgress(
    'Preparing the long recording…',
  );

  const audioResponse = await fetch(
    `/api/cloudflare/audio/${trackId}`,
    {
      cache: 'no-store',
    },
  );

  if (!audioResponse.ok) {
    throw new Error(
      'The original recording could not be opened for long transcription.',
    );
  }

  const sourceData =
    await audioResponse.arrayBuffer();

  const audioContext =
    new AudioContext();

  try {
    const decoded =
      await audioContext.decodeAudioData(
        sourceData.slice(0),
      );

    const targetChunkSeconds =
      6 * 60;

    const boundaries: number[] = [
      0,
    ];

    for (
      let target = targetChunkSeconds;
      target < decoded.duration;
      target += targetChunkSeconds
    ) {
      boundaries.push(
        findQuietBoundary(
          decoded,
          target,
        ),
      );
    }

    boundaries.push(
      decoded.duration,
    );

    const transcripts: string[] =
      [];

    const totalChunks =
      boundaries.length - 1;

    for (
      let index = 0;
      index < totalChunks;
      index += 1
    ) {
      onProgress(
        `Transcribing section ${index + 1} of ${totalChunks}…`,
      );

      const chunk =
        createMonoTranscriptionWav(
          decoded,
          boundaries[index],
          boundaries[index + 1],
          index + 1,
        );

      if (
        chunk.size >
        24 * 1024 * 1024
      ) {
        throw new Error(
          `Transcription section ${index + 1} is unexpectedly too large.`,
        );
      }

      const form =
        new FormData();

      form.append(
        'file',
        chunk,
      );

      const response =
        await fetch(
          '/api/cloudflare/transcribe-chunk',
          {
            method: 'POST',
            body: form,
          },
        );

      const result =
        (await response.json()) as {
          error?: string;
          transcript?: string;
        };

      if (
        !response.ok ||
        !result.transcript?.trim()
      ) {
        throw new Error(
          result.error ||
            `Section ${index + 1} could not be transcribed.`,
        );
      }

      transcripts.push(
        result.transcript.trim(),
      );
    }

    const combinedTranscript =
      transcripts.join(
        '\n\n',
      );

    onProgress(
      'Saving the complete transcript…',
    );

    const saveResponse =
      await fetch(
        `/api/cloudflare/recordings/${trackId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            transcript:
              combinedTranscript,
          }),
        },
      );

    const saveResult =
      (await saveResponse.json()) as {
        error?: string;
      };

    if (!saveResponse.ok) {
      throw new Error(
        saveResult.error ||
          'The completed long transcript could not be saved.',
      );
    }

    return combinedTranscript;
  } finally {
    await audioContext.close();
  }
}

async function transcribeRecording(
  trackId: string,
  onProgress: (message: string) => void,
) {
  onProgress(
    'Transcribing recording…',
  );

  const response = await fetch(
    '/api/cloudflare/transcribe',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json',
      },
      body: JSON.stringify({
        trackId,
      }),
    },
  );

  const result =
    (await response.json()) as {
      error?: string;
      transcript?: string;
    };

  if (response.ok) {
    if (!result.transcript?.trim()) {
      throw new Error(
        'The transcription finished without returning any transcript.',
      );
    }

    return result.transcript;
  }

  const errorMessage =
    result.error ||
    'The transcript could not be created.';

  if (
    !errorMessage
      .toLowerCase()
      .includes(
        'over 25 mb',
      )
  ) {
    throw new Error(
      errorMessage,
    );
  }

  return transcribeLongRecording(
    trackId,
    onProgress,
  );
}

export default function AdminUpload() {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [title, setTitle] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [vaultPerson, setVaultPerson] =
    useState<VaultPerson>('Dad');

  const [category, setCategory] = useState('General');
  const [questionId, setQuestionId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState('');

  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [allTracks, setAllTracks] = useState<AudioTrack[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);

  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [transcriptDraft, setTranscriptDraft] = useState('');
  const [storyTitleDraft, setStoryTitleDraft] = useState('');
  const [storyDraft, setStoryDraft] = useState('');
  const [speaker1Name, setSpeaker1Name] = useState('');
  const [speaker2Name, setSpeaker2Name] = useState('');
  const [editorQuestionId, setEditorQuestionId] = useState('');

  const [photos, setPhotos] = useState<StoryPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingPhotoId, setSavingPhotoId] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [movingPhotoId, setMovingPhotoId] = useState<string | null>(null);

  const [savingEditor, setSavingEditor] = useState(false);
  const [reTranscribing, setReTranscribing] = useState(false);
  const [labelingSpeakers, setLabelingSpeakers] =
    useState(false);
  const [creatingStory, setCreatingStory] = useState(false);

  const [storyAction, setStoryAction] =
    useState<'create' | 'improve'>('create');

  const [editorMessage, setEditorMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const editorAudioRef = useRef<HTMLAudioElement | null>(null);

  const visibleTracks = allTracks.filter(
    (track) => track.vault_person === vaultPerson,
  );

  const selectedTrack =
    visibleTracks.find(
      (track) => track.id === selectedTrackId,
    ) || null;

  useEffect(() => {
    void start();
  }, []);

  useEffect(() => {
    if (isAdmin && selectedTrackId) {
      void loadPhotos(selectedTrackId);
    } else {
      setPhotos([]);
    }
  }, [isAdmin, selectedTrackId]);

  async function start() {
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

      const allowed =
        response.ok && !!data.member?.isAdmin;

      setIsAdmin(allowed);

      if (allowed) {
        await Promise.all([
          fetchTracks(),
          fetchQuestions(),
        ]);
      }
    } catch {
      setIsAdmin(false);
    } finally {
      setCheckingAccess(false);
    }
  }

  function requestedTrackId() {
    if (typeof window === 'undefined') return '';

    return (
      new URLSearchParams(window.location.search).get('trackId') ||
      ''
    );
  }

  async function fetchQuestions() {
    try {
      const response = await fetch(
        '/api/cloudflare/questions',
        {
          cache: 'no-store',
        },
      );

      const data = (await response.json()) as {
        questions?: Question[];
      };

      if (response.ok) {
        setQuestions(data.questions || []);
      }
    } catch {
      // Question linking is optional.
    }
  }

  function loadTrackIntoEditor(track: AudioTrack | null) {
    setSelectedTrackId(track?.id || '');
    setTranscriptDraft(track?.transcript || '');
    setStoryTitleDraft(track?.story_title || '');
    setStoryDraft(track?.story_chapter || '');
    setSpeaker1Name(track?.speaker_1_name || '');
    setSpeaker2Name(track?.speaker_2_name || '');
    setEditorQuestionId(track?.question_id || '');
  }

  async function fetchTracks(preferredId?: string) {
    setLoadingTracks(true);

    try {
      const response = await fetch(
        '/api/cloudflare/recordings',
        {
          cache: 'no-store',
        },
      );

      const data = (await response.json()) as {
        recordings?: AudioTrack[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error || 'Could not load the recordings.',
        );
      }

      const nextTracks = data.recordings || [];
      setAllTracks(nextTracks);

      const requested =
        preferredId ||
        requestedTrackId() ||
        selectedTrackId;

      const requestedTrack =
        nextTracks.find(
          (track) => track.id === requested,
        ) || null;

      if (requestedTrack) {
        setVaultPerson(requestedTrack.vault_person);
        loadTrackIntoEditor(requestedTrack);
        return;
      }

      const firstForCurrentVault =
        nextTracks.find(
          (track) => track.vault_person === vaultPerson,
        ) || null;

      loadTrackIntoEditor(firstForCurrentVault);
    } catch (error) {
      setEditorMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Could not load the recordings.',
      });
    } finally {
      setLoadingTracks(false);
    }
  }

  function chooseVault(value: VaultPerson) {
    setVaultPerson(value);
    setEditorMessage(null);

    const firstTrack =
      allTracks.find(
        (track) => track.vault_person === value,
      ) || null;

    loadTrackIntoEditor(firstTrack);

    const url = new URL(window.location.href);

    if (firstTrack) {
      url.searchParams.set('trackId', firstTrack.id);
    } else {
      url.searchParams.delete('trackId');
    }

    window.history.replaceState({}, '', url);
  }

  function chooseTrack(id: string) {
    const track =
      allTracks.find(
        (item) =>
          item.id === id &&
          item.vault_person === vaultPerson,
      ) || null;

    loadTrackIntoEditor(track);
    setEditorMessage(null);

    const url = new URL(window.location.href);

    if (track) {
      url.searchParams.set('trackId', track.id);
    } else {
      url.searchParams.delete('trackId');
    }

    window.history.replaceState({}, '', url);
  }

  async function loadPhotos(recordingId: string) {
    setLoadingPhotos(true);

    try {
      const response = await fetch(
        `/api/cloudflare/photos?recordingId=${encodeURIComponent(
          recordingId,
        )}`,
        {
          cache: 'no-store',
        },
      );

      const data = (await response.json()) as {
        photos?: StoryPhoto[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error || 'Could not load the story photos.',
        );
      }

      setPhotos(
        (data.photos || []).sort(
          (a, b) => a.sort_order - b.sort_order,
        ),
      );
    } catch (error) {
      setEditorMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Could not load the story photos.',
      });
      setPhotos([]);
    } finally {
      setLoadingPhotos(false);
    }
  }

  async function uploadStoryPhoto() {
    if (!selectedTrack || !photoFile) {
      setEditorMessage({
        type: 'error',
        text: 'Choose a photo before uploading.',
      });
      return;
    }

    setUploadingPhoto(true);
    setEditorMessage(null);

    try {
      const form = new FormData();
      form.append('file', photoFile);
      form.append('recordingId', selectedTrack.id);
      form.append('caption', photoCaption.trim());

      const response = await fetch(
        '/api/cloudflare/photos',
        {
          method: 'POST',
          body: form,
        },
      );

      const result = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error || 'The photo could not be uploaded.',
        );
      }

      setPhotoFile(null);
      setPhotoCaption('');
      setPhotoInputKey((key) => key + 1);

      await loadPhotos(selectedTrack.id);

      setEditorMessage({
        type: 'success',
        text: 'Photo added to this family story.',
      });
    } catch (error) {
      setEditorMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'The photo could not be uploaded.',
      });
    } finally {
      setUploadingPhoto(false);
    }
  }

  function updatePhotoCaption(photoId: string, caption: string) {
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === photoId
          ? { ...photo, caption }
          : photo,
      ),
    );
  }

  async function savePhotoCaption(photo: StoryPhoto) {
    setSavingPhotoId(photo.id);
    setEditorMessage(null);

    try {
      const response = await fetch(
        '/api/cloudflare/photos',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            photoId: photo.id,
            caption: photo.caption || '',
          }),
        },
      );

      const result = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error || 'The photo caption could not be saved.',
        );
      }

      setEditorMessage({
        type: 'success',
        text: 'Photo caption saved.',
      });
    } catch (error) {
      setEditorMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'The photo caption could not be saved.',
      });
    } finally {
      setSavingPhotoId(null);
    }
  }

  async function movePhoto(photo: StoryPhoto, direction: 'up' | 'down') {
    const ordered = [...photos].sort(
      (a, b) => a.sort_order - b.sort_order,
    );

    const index = ordered.findIndex(
      (item) => item.id === photo.id,
    );

    const otherIndex =
      direction === 'up'
        ? index - 1
        : index + 1;

    if (
      index < 0 ||
      otherIndex < 0 ||
      otherIndex >= ordered.length
    ) {
      return;
    }

    const other = ordered[otherIndex];

    setMovingPhotoId(photo.id);
    setEditorMessage(null);

    try {
      const [firstResponse, secondResponse] = await Promise.all([
        fetch('/api/cloudflare/photos', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            photoId: photo.id,
            sortOrder: other.sort_order,
          }),
        }),
        fetch('/api/cloudflare/photos', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            photoId: other.id,
            sortOrder: photo.sort_order,
          }),
        }),
      ]);

      const firstResult = (await firstResponse.json()) as {
        error?: string;
      };
      const secondResult = (await secondResponse.json()) as {
        error?: string;
      };

      if (!firstResponse.ok || !secondResponse.ok) {
        throw new Error(
          firstResult.error ||
            secondResult.error ||
            'The photo order could not be changed.',
        );
      }

      if (selectedTrack) {
        await loadPhotos(selectedTrack.id);
      }
    } catch (error) {
      setEditorMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'The photo order could not be changed.',
      });
    } finally {
      setMovingPhotoId(null);
    }
  }

  async function deleteStoryPhoto(photo: StoryPhoto) {
    const confirmed = window.confirm(
      'Permanently remove this photo from the story?\n\nThe image file will also be deleted from private Cloudflare storage.',
    );

    if (!confirmed) return;

    setDeletingPhotoId(photo.id);
    setEditorMessage(null);

    try {
      const response = await fetch(
        '/api/cloudflare/photos',
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            photoId: photo.id,
          }),
        },
      );

      const result = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error || 'The photo could not be removed.',
        );
      }

      if (selectedTrack) {
        await loadPhotos(selectedTrack.id);
      }

      setEditorMessage({
        type: 'success',
        text: 'Photo removed from this story.',
      });
    } catch (error) {
      setEditorMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'The photo could not be removed.',
      });
    } finally {
      setDeletingPhotoId(null);
    }
  }

  async function saveSpeakerNames(trackId: string) {
    const response = await fetch(
      `/api/cloudflare/recordings/${trackId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          speaker1Name,
          speaker2Name,
        }),
      },
    );

    const result = (await response.json()) as {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(
        result.error ||
          'The speaker names could not be saved.',
      );
    }
  }

  async function saveEditor() {
    if (!selectedTrack) return;

    setSavingEditor(true);
    setEditorMessage(null);

    try {
      const response = await fetch(
        `/api/cloudflare/recordings/${selectedTrack.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transcript: transcriptDraft,
            storyTitle: storyTitleDraft,
            storyChapter: storyDraft,
            speaker1Name,
            speaker2Name,
            questionId: editorQuestionId,
          }),
        },
      );

      const result = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error ||
            'Your changes could not be saved.',
        );
      }

      setEditorMessage({
        type: 'success',
        text:
          'Story Question, speaker names, transcript, and story changes were saved.',
      });

      await fetchTracks(selectedTrack.id);
    } catch (error) {
      setEditorMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Your changes could not be saved.',
      });
    } finally {
      setSavingEditor(false);
    }
  }

  async function copyTranscript() {
    if (!transcriptDraft.trim()) return;

    try {
      await navigator.clipboard.writeText(transcriptDraft);

      setEditorMessage({
        type: 'success',
        text: 'Transcript copied.',
      });
    } catch {
      setEditorMessage({
        type: 'error',
        text:
          'Your browser would not allow copying. Select the text and press Ctrl+C.',
      });
    }
  }

  async function requestSpeakerLabels(
    trackId: string,
    transcript: string,
  ) {
    const response = await fetch(
      '/api/cloudflare/label-speakers',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trackId,
          transcript,
          speaker1Name: speaker1Name.trim(),
          speaker2Name: speaker2Name.trim(),
        }),
      },
    );

    const result = (await response.json()) as {
      error?: string;
      transcript?: string;
      speakerCount?: number;
    };

    if (!response.ok || !result.transcript) {
      throw new Error(
        result.error ||
          'The transcript could not be formatted and labeled.',
      );
    }

    return result;
  }

  async function reTranscribe() {
    if (!selectedTrack) return;

    const trackId = selectedTrack.id;

    setReTranscribing(true);
    setTranscriptionProgress('');
    setEditorMessage(null);

    try {
      const transcript =
        await transcribeRecording(
          trackId,
          (progress) => {
            setTranscriptionProgress(
              progress,
            );

            setEditorMessage({
              type: 'success',
              text: progress,
            });
          },
        );

      setTranscriptDraft(
        transcript,
      );

      await fetchTracks(
        trackId,
      );

      setEditorMessage({
        type: 'success',
        text:
          'The word-for-word transcript is complete. Confirm Speaker 1 and Speaker 2, then click Format & Label Transcript.',
      });
    } catch (error) {
      setEditorMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'The transcript could not be created.',
      });
    } finally {
      setReTranscribing(false);
      setTranscriptionProgress('');
    }
  }

  async function labelExistingTranscript() {
    if (!selectedTrack || !transcriptDraft.trim()) return;

    if (!speaker1Name.trim() || !speaker2Name.trim()) {
      setEditorMessage({
        type: 'error',
        text:
          'Enter the names for Speaker 1 and Speaker 2 before formatting the transcript.',
      });
      return;
    }

    setLabelingSpeakers(true);
    setEditorMessage(null);

    try {
      await saveSpeakerNames(selectedTrack.id);

      const result = await requestSpeakerLabels(
        selectedTrack.id,
        transcriptDraft,
      );

      setTranscriptDraft(result.transcript || '');

      await fetchTracks(selectedTrack.id);

      setEditorMessage({
        type: 'success',
        text:
          `Transcript formatted and labeled as ${speaker1Name.trim()} and ${speaker2Name.trim()} without changing the spoken words.`,
      });
    } catch (error) {
      setEditorMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'The transcript could not be formatted and labeled.',
      });
    } finally {
      setLabelingSpeakers(false);
    }
  }

  async function createStory(
    mode: 'create' | 'improve' = 'create',
  ) {
    if (!selectedTrack || !transcriptDraft.trim()) {
      setEditorMessage({
        type: 'error',
        text:
          'This recording needs a transcript before a story can be created.',
      });
      return;
    }

    if (mode === 'improve' && !storyDraft.trim()) {
      setEditorMessage({
        type: 'error',
        text: 'There is no current story to improve yet.',
      });
      return;
    }

    setStoryAction(mode);
    setCreatingStory(true);
    setEditorMessage(null);

    try {
      const saveTranscriptResponse = await fetch(
        `/api/cloudflare/recordings/${selectedTrack.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transcript: transcriptDraft,
            speaker1Name,
            speaker2Name,
          }),
        },
      );

      const savedTranscript =
        (await saveTranscriptResponse.json()) as {
          error?: string;
        };

      if (!saveTranscriptResponse.ok) {
        throw new Error(
          savedTranscript.error ||
            'The transcript could not be saved first.',
        );
      }

      const response = await fetch(
        '/api/cloudflare/story',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            trackId: selectedTrack.id,
            mode,
            currentTitle: storyTitleDraft,
            currentStory: storyDraft,
          }),
        },
      );

      const result = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error ||
            'The family story could not be created.',
        );
      }

      setEditorMessage({
        type: 'success',
        text:
          mode === 'improve'
            ? 'The current story was improved. Read it over and save any final edits.'
            : 'The family story is ready. Read it over and make any changes you want.',
      });

      await fetchTracks(selectedTrack.id);
    } catch (error) {
      setEditorMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'The family story could not be created.',
      });
    } finally {
      setCreatingStory(false);
    }
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();

    if (!file || !title.trim() || !speaker.trim()) {
      setMessage({
        type: 'error',
        text:
          'Please add a title, speaker, and audio file.',
      });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const form = new FormData();

      form.append('file', file);
      form.append('title', title.trim());
      form.append('speaker', speaker.trim());
      form.append('category', category);
      form.append('vaultPerson', vaultPerson);
      form.append('storyChapter', '');
      form.append('questionId', questionId);

      const uploadResponse = await fetch(
        '/api/cloudflare/upload',
        {
          method: 'POST',
          body: form,
        },
      );

      const uploadResult =
        (await uploadResponse.json()) as {
          error?: string;
          recording?: {
            id?: string;
          };
          id?: string;
        };

      if (!uploadResponse.ok) {
        throw new Error(
          uploadResult.error ||
            'The recording could not be saved.',
        );
      }

      const newTrackId =
        uploadResult.recording?.id ||
        uploadResult.id ||
        '';

      if (!newTrackId) {
        throw new Error(
          'The recording was saved, but its new ID was not returned.',
        );
      }

      setTranscribing(true);

      setMessage({
        type: 'success',
        text:
          'Recording saved. Creating the word-for-word transcript now…',
      });

      try {
        await transcribeRecording(
          newTrackId,
          (progress) => {
            setTranscriptionProgress(
              progress,
            );

            setMessage({
              type: 'success',
              text:
                `Recording saved safely. ${progress}`,
            });
          },
        );
      } catch (transcriptionError) {
        setMessage({
          type: 'error',
          text:
            `The recording was safely saved, but the transcript could not be created: ${
              transcriptionError instanceof Error
                ? transcriptionError.message
                : 'Unknown error'
            }`,
        });

        await fetchTracks(newTrackId);
        return;
      }

      await fetchTracks(newTrackId);

      setMessage({
        type: 'success',
        text:
          `Saved to the ${vaultDisplayName(
            vaultPerson,
          )} Vault and transcribed. Enter Speaker 1 and Speaker 2 in Story Studio to format and label the transcript.`,
      });

      setTitle('');
      setSpeaker('');
      setCategory('General');
      setQuestionId('');
      setFile(null);
      setFileInputKey((key) => key + 1);
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'The audio could not be uploaded.',
      });
    } finally {
      setUploading(false);
      setTranscribing(false);
      setTranscriptionProgress('');
    }
  }

  if (checkingAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5]">
        <Loader2 className="h-7 w-7 animate-spin text-[#a66b27]" />
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e5] p-5">
        <div className="w-full max-w-md rounded-3xl border border-stone-300 bg-[#fffaf0] p-8 text-center shadow-xl">
          <ShieldCheck className="mx-auto h-10 w-10 text-[#a66b27]" />

          <h1 className="mt-4 font-serif text-3xl text-stone-900">
            Admin access is limited
          </h1>

          <p className="mt-3 text-sm text-stone-600">
            Only Vault administrators can add or change recordings.
          </p>

          <a
            href="/"
            className="mt-6 inline-flex rounded-xl bg-[#3b4536] px-4 py-3 font-semibold text-white"
          >
            Return to the vault
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f0e5] p-5 text-stone-800 md:p-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-[#8a561f]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Fields Family Vault
          </a>

          <a
            href="/project-tools"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#8a561f]"
          >
            <Wrench className="h-4 w-4" />
            Project Tools
          </a>
        </div>

        <header className="mt-6 border-b border-stone-300 pb-7">
          <p className="text-xs font-semibold uppercase tracking-[.22em] text-[#a66b27]">
            Add to the collection
          </p>

          <h1 className="mt-2 font-serif text-4xl text-stone-900 md:text-5xl">
            Preserve a Memory
          </h1>

          <p className="mt-3 text-stone-600">
            Save the original recording, create its transcript, and
            build the family story.
          </p>
        </header>

        <section className="mt-8 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
          {message && (
            <div
              className={`mb-6 flex gap-3 rounded-xl border p-4 text-sm ${
                message.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle className="h-5 w-5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0" />
              )}

              {message.text}
            </div>
          )}

          <form onSubmit={handleUpload} className="space-y-7">
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[#a66b27]" />
                <label className="text-sm font-semibold">
                  Belongs in which legacy book? *
                </label>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {vaults.map((vault) => (
                  <button
                    key={vault.name}
                    type="button"
                    onClick={() => chooseVault(vault.name)}
                    className={`rounded-2xl border p-4 text-left ${
                      vaultPerson === vault.name
                        ? 'border-[#b57931] bg-[#f4e7cf]'
                        : 'border-stone-300 bg-white'
                    }`}
                  >
                    <span className="flex items-center gap-2 font-serif text-lg">
                      <Headphones className="h-4 w-4 text-[#a66b27]" />
                      {vault.displayName}
                    </span>

                    <span className="mt-1 block text-xs text-stone-600">
                      {vault.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold">
                Recording title *
              </label>

              <input
                required
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                placeholder="Example: How Dad Met Mom"
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]"
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-[#a66b27]" />
                  <label className="text-sm font-semibold">
                    Speaker / people heard *
                  </label>
                </div>

                <input
                  required
                  value={speaker}
                  onChange={(event) =>
                    setSpeaker(event.target.value)
                  }
                  placeholder="Example: Dan and Bill"
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-[#a66b27]"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <Tag className="h-4 w-4 text-[#a66b27]" />
                  <label className="text-sm font-semibold">
                    Chapter / category
                  </label>
                </div>

                <select
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value)
                  }
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
                >
                  <option>General</option>
                  <option>Childhood</option>
                  <option>Love & Marriage</option>
                  <option>Military & Work</option>
                  <option>Faith</option>
                  <option>Holidays & Family</option>
                  <option>Life Lessons</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold">
                Story question{' '}
                <span className="font-normal text-stone-500">
                  (optional)
                </span>
              </label>

              <select
                value={questionId}
                onChange={(event) =>
                  setQuestionId(event.target.value)
                }
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
              >
                <option value="">
                  Not linked to a question
                </option>

                {questions.map((question) => (
                  <option
                    key={question.id}
                    value={question.id}
                  >
                    {question.question_number}.{' '}
                    {question.question_text}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <FileAudio className="h-4 w-4 text-[#a66b27]" />
                <label className="text-sm font-semibold">
                  Original audio file *
                </label>
              </div>

              <input
                key={fileInputKey}
                type="file"
                accept="audio/*"
                required
                onChange={(event) =>
                  setFile(event.target.files?.[0] || null)
                }
                className="w-full rounded-xl border border-dashed border-stone-400 bg-white px-4 py-3"
              />

              {file && (
                <p className="mt-2 text-sm text-stone-600">
                  Ready to upload:{' '}
                  <span className="font-medium">
                    {file.name}
                  </span>
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3.5 font-semibold text-white disabled:bg-stone-400"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {transcribing
                    ? transcriptionProgress || 'Transcribing recording…'
                    : 'Saving memory…'}
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  Save to {vaultDisplayName(vaultPerson)} Vault
                </>
              )}
            </button>
          </form>
        </section>

        <section className="mt-10 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">
            Backup & Preserve
          </p>

          <h2 className="mt-2 font-serif text-3xl text-stone-900">
            Full Vault Backup
          </h2>

          <p className="mt-2 text-sm text-stone-600">
            Full backups are created from Vault Health & Backups,
            where the collection and storage can also be checked first.
          </p>

          <a
            href="/project-tools/vault-health"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#3b4536] px-5 py-3 font-semibold text-white"
          >
            <Download className="h-5 w-5" />
            Open Vault Health & Backups
          </a>
        </section>

        <section className="mt-10 rounded-3xl border border-stone-300 bg-[#fffaf0] p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-3 border-b border-stone-200 pb-6 sm:flex-row sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#a66b27]">
                Story Studio
              </p>

              <h2 className="mt-2 font-serif text-3xl text-stone-900">
                {vaultDisplayName(vaultPerson)} Transcripts & Stories
              </h2>

              <p className="mt-2 text-sm text-stone-600">
                Only recordings from this Vault are shown here.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void fetchTracks(selectedTrackId)
              }
              className="inline-flex w-fit items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  loadingTracks ? 'animate-spin' : ''
                }`}
              />
              Refresh
            </button>
          </div>

          {editorMessage && (
            <div
              className={`mt-6 flex gap-3 rounded-xl border p-4 text-sm ${
                editorMessage.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {editorMessage.type === 'success' ? (
                <CheckCircle className="h-5 w-5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0" />
              )}

              {editorMessage.text}
            </div>
          )}

          {!visibleTracks.length && !loadingTracks ? (
            <p className="mt-6 rounded-xl bg-stone-100 p-4 text-sm text-stone-600">
              No recordings have been added to the{' '}
              {vaultDisplayName(vaultPerson)} Vault yet.
            </p>
          ) : (
            <div className="mt-6 space-y-6">
              <div>
                <label className="mb-1.5 block text-sm font-semibold">
                  Choose a recording
                </label>

                <select
                  value={selectedTrackId}
                  onChange={(event) =>
                    chooseTrack(event.target.value)
                  }
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
                >
                  {visibleTracks.map((track) => (
                    <option
                      key={track.id}
                      value={track.id}
                    >
                      {track.title} ·{' '}
                      {new Date(
                        track.created_at,
                      ).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>

              {selectedTrack && (
                <>
                  <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
                    <span className="font-semibold text-stone-800">
                      {selectedTrack.speaker}
                    </span>{' '}
                    · {selectedTrack.category || 'General'} ·
                    Transcript:{' '}
                    <span className="font-medium">
                      {selectedTrack.transcription_status ||
                        'not started'}
                    </span>{' '}
                    · Story:{' '}
                    <span className="font-medium">
                      {selectedTrack.story_status ||
                        'not started'}
                    </span>
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-[#f8f3e9] p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Headphones className="h-4 w-4 text-[#a66b27]" />

                      <p className="text-sm font-semibold">
                        Listen while you work
                      </p>
                    </div>

                    <audio
                      ref={editorAudioRef}
                      key={selectedTrack.id}
                      controls
                      preload="metadata"
                      src={`/api/cloudflare/audio/${selectedTrack.id}`}
                      className="w-full"
                    />
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-[#f8f3e9] p-4">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-[#a66b27]" />

                      <p className="text-sm font-semibold">
                        Story Question
                      </p>
                    </div>

                    <p className="mt-1 text-sm text-stone-600">
                      Link this existing recording to the question it answers.
                    </p>

                    <select
                      value={editorQuestionId}
                      onChange={(event) =>
                        setEditorQuestionId(event.target.value)
                      }
                      className="mt-4 w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
                    >
                      <option value="">
                        Not linked to a question
                      </option>

                      {questions.map((question) => (
                        <option
                          key={question.id}
                          value={question.id}
                        >
                          {question.question_number}.{' '}
                          {question.question_text}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-[#f8f3e9] p-4">
                    <div className="flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-[#a66b27]" />

                      <p className="text-sm font-semibold">
                        Who is speaking?
                      </p>
                    </div>

                    <p className="mt-1 text-sm text-stone-600">
                      Enter the actual names used in this recording.
                      These names are remembered for this recording only.
                    </p>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold">
                          Speaker 1
                        </label>

                        <input
                          value={speaker1Name}
                          onChange={(event) =>
                            setSpeaker1Name(event.target.value)
                          }
                          placeholder="Example: Dan"
                          className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-sm font-semibold">
                          Speaker 2
                        </label>

                        <input
                          value={speaker2Name}
                          onChange={(event) =>
                            setSpeaker2Name(event.target.value)
                          }
                          placeholder="Example: Bill"
                          className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
                        />
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-stone-500">
                      If somebody else asks the questions on another
                      recording, just enter their name for that recording.
                    </p>
                  </div>

                  <div>
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <label className="text-sm font-semibold">
                        Word-for-word transcript
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void copyTranscript()
                          }
                          disabled={
                            !transcriptDraft.trim()
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
                        >
                          <Copy className="h-4 w-4" />
                          Copy
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void labelExistingTranscript()
                          }
                          disabled={
                            labelingSpeakers ||
                            reTranscribing ||
                            creatingStory ||
                            !transcriptDraft.trim() ||
                            !speaker1Name.trim() ||
                            !speaker2Name.trim()
                          }
                          className="inline-flex items-center gap-2 rounded-lg bg-[#80542a] px-3 py-2 text-sm font-semibold text-white disabled:bg-stone-400"
                        >
                          {labelingSpeakers ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserRound className="h-4 w-4" />
                          )}

                          {labelingSpeakers
                            ? 'Formatting & labeling…'
                            : 'Format & Label Transcript'}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void reTranscribe()
                          }
                          disabled={
                            reTranscribing ||
                            labelingSpeakers ||
                            creatingStory
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
                        >
                          {reTranscribing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}

                          {reTranscribing
                            ? transcriptionProgress || 'Transcribing…'
                            : transcriptDraft.trim()
                              ? 'Re-transcribe'
                              : 'Create transcript'}
                        </button>
                      </div>
                    </div>

                    <textarea
                      rows={12}
                      value={transcriptDraft}
                      onChange={(event) =>
                        setTranscriptDraft(
                          event.target.value,
                        )
                      }
                      placeholder="The transcript will appear here."
                      className="w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 leading-relaxed"
                    />
                  </div>

                  <div className="border-t border-stone-200 pt-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">
                          Family Story
                        </p>

                        <p className="mt-1 text-sm text-stone-600">
                          Create a story from the transcript or
                          improve the story already saved.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void createStory('create')
                          }
                          disabled={
                            creatingStory ||
                            reTranscribing ||
                            !transcriptDraft.trim()
                          }
                          className="inline-flex items-center gap-2 rounded-xl bg-[#80542a] px-4 py-3 text-sm font-semibold text-white disabled:bg-stone-400"
                        >
                          {creatingStory &&
                          storyAction === 'create' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}

                          {creatingStory &&
                          storyAction === 'create'
                            ? 'Creating story…'
                            : storyDraft
                              ? 'Create a New Story'
                              : 'Create Story with AI'}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void createStory('improve')
                          }
                          disabled={
                            creatingStory ||
                            reTranscribing ||
                            !transcriptDraft.trim() ||
                            !storyDraft.trim()
                          }
                          className="inline-flex items-center gap-2 rounded-xl border border-[#80542a] bg-white px-4 py-3 text-sm font-semibold text-[#65431f] disabled:opacity-50"
                        >
                          <Wrench className="h-4 w-4" />
                          Improve Current Story
                        </button>
                      </div>
                    </div>

                    <div className="mt-5">
                      <label className="mb-1.5 block text-sm font-semibold">
                        Story title
                      </label>

                      <input
                        value={storyTitleDraft}
                        onChange={(event) =>
                          setStoryTitleDraft(
                            event.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
                      />
                    </div>

                    <div className="mt-5">
                      <label className="mb-1.5 block text-sm font-semibold">
                        Book-style story
                      </label>

                      <textarea
                        rows={12}
                        value={storyDraft}
                        onChange={(event) =>
                          setStoryDraft(
                            event.target.value,
                          )
                        }
                        className="w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 font-serif leading-relaxed"
                      />
                    </div>
                  </div>

                  <div className="border-t border-stone-200 pt-6">
                    <div className="flex items-center gap-2">
                      <ImagePlus className="h-4 w-4 text-[#a66b27]" />

                      <p className="text-sm font-semibold">
                        Story Photos
                      </p>
                    </div>

                    <p className="mt-1 text-sm text-stone-600">
                      Attach photos to this story for the family book.
                      Add a caption now or edit it later.
                    </p>

                    <div className="mt-4 rounded-2xl border border-stone-200 bg-[#f8f3e9] p-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-sm font-semibold">
                            Photo
                          </label>

                          <input
                            key={photoInputKey}
                            type="file"
                            accept="image/*"
                            onChange={(event) =>
                              setPhotoFile(
                                event.target.files?.[0] || null,
                              )
                            }
                            className="w-full rounded-xl border border-dashed border-stone-400 bg-white px-4 py-3"
                          />
                        </div>

                        <div>
                          <label className="mb-1.5 block text-sm font-semibold">
                            Caption
                          </label>

                          <input
                            value={photoCaption}
                            onChange={(event) =>
                              setPhotoCaption(event.target.value)
                            }
                            placeholder="Example: Bill with his brothers, 1952"
                            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          void uploadStoryPhoto()
                        }
                        disabled={
                          uploadingPhoto ||
                          !photoFile
                        }
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#80542a] px-4 py-3 text-sm font-semibold text-white disabled:bg-stone-400"
                      >
                        {uploadingPhoto ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ImagePlus className="h-4 w-4" />
                        )}

                        {uploadingPhoto
                          ? 'Uploading photo…'
                          : 'Add Photo to Story'}
                      </button>
                    </div>

                    {loadingPhotos ? (
                      <div className="mt-4 flex items-center gap-2 rounded-xl bg-stone-100 p-4 text-sm text-stone-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading story photos…
                      </div>
                    ) : photos.length ? (
                      <div className="mt-5 space-y-4">
                        {photos.map((photo, index) => (
                          <div
                            key={photo.id}
                            className="overflow-hidden rounded-2xl border border-stone-200 bg-white"
                          >
                            <div className="grid gap-4 p-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                              <div className="overflow-hidden rounded-xl bg-stone-100">
                                <img
                                  src={`/api/cloudflare/photo/${photo.id}`}
                                  alt={
                                    photo.caption?.trim() ||
                                    `Story photo ${index + 1}`
                                  }
                                  className="h-44 w-full object-contain"
                                />
                              </div>

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#a66b27]">
                                    Photo {index + 1}
                                  </p>

                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      title="Move photo up"
                                      onClick={() =>
                                        void movePhoto(photo, 'up')
                                      }
                                      disabled={
                                        index === 0 ||
                                        movingPhotoId !== null
                                      }
                                      className="rounded-lg border border-stone-300 bg-white p-2 text-stone-600 disabled:opacity-40"
                                    >
                                      <ArrowUp className="h-4 w-4" />
                                    </button>

                                    <button
                                      type="button"
                                      title="Move photo down"
                                      onClick={() =>
                                        void movePhoto(photo, 'down')
                                      }
                                      disabled={
                                        index === photos.length - 1 ||
                                        movingPhotoId !== null
                                      }
                                      className="rounded-lg border border-stone-300 bg-white p-2 text-stone-600 disabled:opacity-40"
                                    >
                                      <ArrowDown className="h-4 w-4" />
                                    </button>

                                    <button
                                      type="button"
                                      title="Delete photo"
                                      onClick={() =>
                                        void deleteStoryPhoto(photo)
                                      }
                                      disabled={
                                        deletingPhotoId === photo.id
                                      }
                                      className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700 disabled:opacity-50"
                                    >
                                      {deletingPhotoId === photo.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </button>
                                  </div>
                                </div>

                                <label className="mt-3 block text-sm font-semibold">
                                  Caption
                                </label>

                                <textarea
                                  rows={3}
                                  value={photo.caption || ''}
                                  onChange={(event) =>
                                    updatePhotoCaption(
                                      photo.id,
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Describe this photo for the family book."
                                  className="mt-1.5 w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm"
                                />

                                <button
                                  type="button"
                                  onClick={() =>
                                    void savePhotoCaption(photo)
                                  }
                                  disabled={
                                    savingPhotoId === photo.id
                                  }
                                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-[#fffaf0] px-3 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50"
                                >
                                  {savingPhotoId === photo.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Save className="h-4 w-4" />
                                  )}

                                  {savingPhotoId === photo.id
                                    ? 'Saving caption…'
                                    : 'Save Caption'}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 rounded-xl bg-stone-100 p-4 text-sm text-stone-500">
                        No photos are attached to this story yet.
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void saveEditor()
                    }
                    disabled={
                      savingEditor ||
                      creatingStory ||
                      reTranscribing ||
                      labelingSpeakers
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3.5 font-semibold text-white disabled:bg-stone-400"
                  >
                    {savingEditor ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Save className="h-5 w-5" />
                    )}

                    {savingEditor
                      ? 'Saving changes…'
                      : 'Save speaker names, transcript and story'}
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

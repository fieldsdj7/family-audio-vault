import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  requireVaultMember,
} from "../../../../lib/cloudflare";

const MAX_CHUNK_BYTES =
  24 * 1024 * 1024;

type SecretEnv = CloudflareEnv & {
  OPENAI_API_KEY?: string;
};

type DiarizedSegment = {
  id?: string;
  start?: number;
  end?: number;
  text?: string;
  speaker?: string;
};

type DiarizedTranscription = {
  text?: string;
  segments?: DiarizedSegment[];
  error?: {
    message?: string;
  };
};

type TranscriptSegment = {
  start: number;
  end: number;
  speaker: string | null;
  text: string;
};

function usableSegments(
  response: DiarizedTranscription,
): TranscriptSegment[] {
  return (response.segments || [])
    .filter(
      (
        segment,
      ): segment is DiarizedSegment & {
        start: number;
        end: number;
        text: string;
      } =>
        Number.isFinite(
          segment.start,
        ) &&
        Number.isFinite(
          segment.end,
        ) &&
        Boolean(
          segment.text?.trim(),
        ),
    )
    .map((segment) => ({
      start:
        segment.start,
      end:
        segment.end,
      speaker:
        segment.speaker?.trim() ||
        null,
      text:
        segment.text.trim(),
    }));
}

function formatSpeakerTranscript(
  segments: TranscriptSegment[],
  fallbackText: string,
) {
  if (!segments.length) {
    return fallbackText.trim();
  }

  const speakerIds = [
    ...new Set(
      segments
        .map(
          (segment) =>
            segment.speaker,
        )
        .filter(
          (
            speaker,
          ): speaker is string =>
            Boolean(speaker),
        ),
    ),
  ];

  if (
    speakerIds.length <= 1
  ) {
    return segments
      .map(
        (segment) =>
          segment.text,
      )
      .join(" ")
      .trim();
  }

  const speakerNumbers =
    new Map(
      speakerIds.map(
        (
          speaker,
          index,
        ) => [
          speaker,
          index + 1,
        ],
      ),
    );

  const turns: Array<{
    speaker: string | null;
    text: string;
  }> = [];

  for (const segment of segments) {
    const previous =
      turns.at(-1);

    if (
      previous?.speaker ===
      segment.speaker
    ) {
      previous.text =
        `${previous.text} ${segment.text}`;
    } else {
      turns.push({
        speaker:
          segment.speaker,
        text:
          segment.text,
      });
    }
  }

  return turns
    .map((turn) => {
      if (!turn.speaker) {
        return turn.text;
      }

      const number =
        speakerNumbers.get(
          turn.speaker,
        );

      return number
        ? `Speaker ${number}: ${turn.text}`
        : turn.text;
    })
    .join("\n\n");
}

export async function POST(
  request: Request,
) {
  try {
    const member =
      await requireVaultMember(
        request,
      );

    if (!member.isAdmin) {
      return Response.json(
        {
          error:
            "Only a Vault administrator can transcribe recordings.",
        },
        { status: 403 },
      );
    }

    const form =
      await request.formData();

    const file =
      form.get("file");

    if (
      !(file instanceof File) ||
      file.size === 0
    ) {
      return Response.json(
        {
          error:
            "The transcription chunk is missing.",
        },
        { status: 400 },
      );
    }

    if (
      file.size >
      MAX_CHUNK_BYTES
    ) {
      return Response.json(
        {
          error:
            "This transcription chunk is still too large.",
        },
        { status: 413 },
      );
    }

    const { env } =
      await getCloudflareContext({
        async: true,
      });

    const openAiKey =
      (env as SecretEnv)
        .OPENAI_API_KEY;

    if (!openAiKey) {
      return Response.json(
        {
          error:
            "The transcription service has not been configured yet.",
        },
        { status: 500 },
      );
    }

    const openAiForm =
      new FormData();

    openAiForm.append(
      "model",
      "gpt-4o-transcribe-diarize",
    );

    openAiForm.append(
      "response_format",
      "diarized_json",
    );

    openAiForm.append(
      "chunking_strategy",
      "auto",
    );

    openAiForm.append(
      "language",
      "en",
    );

    openAiForm.append(
      "file",
      file,
      file.name ||
        "transcription-chunk.wav",
    );

    const response =
      await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${openAiKey}`,
          },

          body:
            openAiForm,
        },
      );

    const result =
      (await response.json()) as
        DiarizedTranscription;

    if (
      !response.ok ||
      !result.text
    ) {
      return Response.json(
        {
          error:
            result.error?.message ||
            "OpenAI could not transcribe this section of the recording.",
        },
        {
          status:
            response.status >= 400
              ? response.status
              : 500,
        },
      );
    }

    const segments =
      usableSegments(
        result,
      );

    const transcript =
      formatSpeakerTranscript(
        segments,
        result.text,
      );

    if (!transcript.trim()) {
      return Response.json(
        {
          error:
            "No speech was detected in this section.",
        },
        { status: 422 },
      );
    }

    return Response.json({
      transcript,
      segments,
    });
  } catch (error) {
    console.error(
      "Transcription chunk failed.",
      error,
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The transcription chunk could not be processed.",
      },
      { status: 500 },
    );
  }
}

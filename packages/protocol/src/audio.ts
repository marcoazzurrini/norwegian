// Recorded audio: the build script asks which files a voice already has, and uploads the rest.
import * as v from "valibot";

/** A recording's path under /audio/: a voice name, then the hash of the spoken text. */
export const AUDIO_FILE = /^[a-z0-9-]{1,40}\/[0-9a-f]{20}\.mp3$/u;

export const AudioListRequestSchema = v.object({
  voice: v.pipe(v.string(), v.regex(/^[a-z0-9-]{1,40}$/u)),
});

export type AudioListRequest = v.InferOutput<typeof AudioListRequestSchema>;

/** The names of every recording of one voice. */
export const AudioListResponseSchema = v.array(v.string());

export type AudioListResponse = v.InferOutput<typeof AudioListResponseSchema>;

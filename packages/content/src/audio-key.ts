// Names of the recorded audio files. Shared by the app and scripts/build-audio.ts.

/** The words actually spoken: blanks in phrases such as "se ___ ut" are left out. */
export const spokenText = (text: string) =>
  text.replaceAll(/_+/gu, " ").replaceAll(/\s+/gu, " ").trim();

const cache = new Map<string, string>();

/** File name for a text: the start of its SHA-256 hash, so any text maps to a safe, stable name. */
export const audioKey = async (text: string): Promise<string> => {
  const spoken = spokenText(text);
  const known = cache.get(spoken);

  if (known !== undefined) {
    return known;
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(spoken)
  );

  const key = [...new Uint8Array(digest).slice(0, 10)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  cache.set(spoken, key);

  return key;
};

export const audioPath = (voice: string, key: string) =>
  `/audio/${voice}/${key}.mp3`;

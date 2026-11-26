// The names of the recordings must never change: the files in storage are found by these names.
import { expect, test } from "bun:test";

import { audioKey, audioPath, spokenText } from "./index";

test("spokenText leaves out blanks and extra spaces", () => {
  expect(spokenText("se ___ ut")).toBe("se ut");
  expect(spokenText("  ha   det bra ")).toBe("ha det bra");
  expect(spokenText("___ år gammel")).toBe("år gammel");
});

test("audioKey is the start of the SHA-256 hash of the spoken text", async () => {
  // Worked out separately with: printf 'hei' | shasum -a 256
  expect(await audioKey("hei")).toBe("f9d1af62d004d4da6489");
});

test("audioKey names a text by what is spoken", async () => {
  expect(await audioKey("se ___ ut")).toBe("eb730cd277495dda0e94");
  expect(await audioKey("se ___ ut")).toBe(await audioKey("se ut"));
});

test("audioPath places a recording under its voice", () => {
  expect(audioPath("mia", "f9d1af62d004d4da6489")).toBe(
    "/audio/mia/f9d1af62d004d4da6489.mp3"
  );
});

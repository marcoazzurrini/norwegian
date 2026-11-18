import { describe, expect, test } from "bun:test";

import { audioKey, audioPath, recordedVoices } from "@norsk/content";

import { createSpeech } from "./index";
import type { SpeechHost, SpeechSettings, Utterance, Voice } from "./index";

const DAY = 86_400_000;

const voice = (name: string, lang: string, localService = true): Voice => ({
  lang,
  localService,
  name,
  voiceURI: `uri:${name}`,
});

const NORA = voice("Nora", "nb-NO");
const HENRIK = voice("Henrik", "no_NO");
const ONLINE = voice("Anna (online)", "nb-NO", false);
const ALVA = voice("Alva", "sv-SE");

/** Lets everything that only waits for an answer already given run to its end. */
const settle = async (): Promise<void> => {
  await Bun.sleep(0);
};

/** The path of the recording that is played for a text when nothing picks the voice. */
const recordingOf = async (text: string): Promise<string> => {
  const [first] = recordedVoices;

  if (first === undefined || recordedVoices.length !== 1) {
    throw new Error("These tests are written for one recorded voice");
  }

  return audioPath(first, await audioKey(text));
};

/** Something a test waits at until it is opened. */
interface Gate {
  open: () => void;
  passed: Promise<void>;
}

const shut = (): void => {
  // A gate opens through the function that replaces this one.
};

const gate = (): Gate => {
  let open = shut;

  // oxlint-disable-next-line promise/avoid-new -- the test decides when this promise resolves, which only a new promise allows
  const passed = new Promise<void>((resolve) => {
    open = resolve;
  });

  return {
    open: () => {
      open();
    },
    passed,
  };
};

type Answer = "found" | "missing" | "no connection";

/** A browser that plays nothing and remembers what it was asked to play. */
const createStage = () => {
  const settings: SpeechSettings = { rate: 0.9, voice: null };
  const fetched: string[] = [];
  const played: { url: string; rate: number }[] = [];
  const said: Utterance[] = [];
  const answers = new Map<string, Answer>();
  /** Requests that wait until the test lets them through, by path. */
  const held = new Map<string, Gate>();
  const listeners = new Set<() => void>();
  /** The end of the file that plays, and of the text that is said. */
  const ends = { file: gate(), text: gate() };
  const voices: Voice[] = [NORA, HENRIK];

  const stage = {
    canPlayFiles: true,
    canSpeak: true,
    cancels: 0,
    /** Ends the file that plays or the text that is said, as when it has been heard to its end. */
    end: (): void => {
      ends.file.open();
      ends.text.open();
    },
    fetched,
    /** Requests for this path wait until `release` is called. */
    hold: (path: string): void => {
      held.set(path, gate());
    },
    now: 0,
    pauses: 0,
    played,
    release: (path: string): void => {
      held.get(path)?.open();
      held.delete(path);
    },
    said,
    serve: (path: string, answer: Answer): void => {
      answers.set(path, answer);
    },
    settings,
    voices,
    voicesChanged: (): void => {
      for (const listener of listeners) {
        listener();
      }
    },
  };

  /** Starts a sound that lasts until it is ended. Nobody waits for the one before any longer. */
  const lasting = async (kind: keyof typeof ends): Promise<void> => {
    ends[kind] = gate();
    await ends[kind].passed;
  };

  const host: SpeechHost = {
    fetch: async (path) => {
      fetched.push(path);

      await held.get(path)?.passed;

      const answer = answers.get(path) ?? "found";

      if (answer === "no connection") {
        throw new TypeError("Failed to fetch");
      }

      return answer === "found"
        ? new Response("mp3")
        : new Response(null, { status: 404 });
    },

    now: () => stage.now,
    objectUrl: () => `blob:${fetched.at(-1)}`,

    player: () =>
      stage.canPlayFiles
        ? {
            pause: () => {
              stage.pauses += 1;
              ends.file.open();
            },
            play: async (url, rate) => {
              played.push({ rate, url });
              // As in the browser, the file before is replaced without a word: its call stays open.
              await lasting("file");
            },
          }
        : null,

    synthesis: () =>
      stage.canSpeak
        ? {
            cancel: () => {
              stage.cancels += 1;
              ends.text.open();
            },
            onVoicesChange: (listener) => {
              listeners.add(listener);

              return () => {
                listeners.delete(listener);
              };
            },
            say: async (utterance) => {
              said.push(utterance);
              await lasting("text");
            },
            voices: () => [ALVA, ...stage.voices],
          }
        : null,
  };

  return { speech: createSpeech({ host, settings: () => settings }), stage };
};

describe("a text with a recording", () => {
  test("is played from its file, and the browser's voice stays silent", async () => {
    const { speech, stage } = createStage();
    const path = await recordingOf("et hus");
    const speaking = speech.speak("et hus");

    await settle();

    expect(stage.fetched).toEqual([path]);
    expect(stage.played).toEqual([{ rate: 1, url: `blob:${path}` }]);
    expect(stage.said).toEqual([]);

    stage.end();
    await speaking;
  });

  test("resolves only when the file has been heard to its end", async () => {
    const { speech, stage } = createStage();
    let heard = false;

    const speaking = (async () => {
      await speech.speak("et hus");
      heard = true;
    })();

    await settle();

    expect(heard).toBe(false);

    stage.end();
    await speaking;

    expect(heard).toBe(true);
  });

  test("is fetched once, however often it is played", async () => {
    const { speech, stage } = createStage();

    const first = speech.speak("et hus");

    await settle();
    stage.end();
    await first;

    const second = speech.speak("et hus");

    await settle();
    stage.end();
    await second;

    expect(stage.fetched).toHaveLength(1);
    expect(stage.played).toHaveLength(2);
  });

  test("has the same file with and without the blanks of a phrase", async () => {
    const { speech, stage } = createStage();
    const speaking = speech.speak("se ___ ut");

    await settle();

    expect(stage.fetched).toEqual([await recordingOf("se ut")]);

    stage.end();
    await speaking;
  });

  test("keeps its file from one day to the next while there is one recorded voice", async () => {
    const { speech, stage } = createStage();
    const path = await recordingOf("et hus");

    stage.now = 400 * DAY;

    const speaking = speech.speak("et hus", { voiceIndex: 3 });

    await settle();

    expect(stage.fetched).toEqual([path]);

    stage.end();
    await speaking;
  });

  test("silences the browser's voice before it plays", async () => {
    const { speech, stage } = createStage();
    const speaking = speech.speak("et hus");

    await settle();

    expect(stage.cancels).toBe(1);

    stage.end();
    await speaking;
  });
});

describe("the speed of a recording", () => {
  test("is the normal one at the setting made for the browser's voices", async () => {
    const { speech, stage } = createStage();

    stage.settings.rate = 0.9;

    const speaking = speech.speak("et hus");

    await settle();

    expect(stage.played[0]?.rate).toBe(1);

    stage.end();
    await speaking;
  });

  test("follows the setting, read when the text is spoken", async () => {
    const { speech, stage } = createStage();

    stage.settings.rate = 0.45;

    const speaking = speech.speak("et hus");

    await settle();

    expect(stage.played[0]?.rate).toBe(0.5);

    stage.end();
    await speaking;
  });

  test("can be given for one text", async () => {
    const { speech, stage } = createStage();
    const speaking = speech.speak("et hus", { rate: 0.6 });

    await settle();

    expect(stage.played[0]?.rate).toBeCloseTo(0.6 / 0.9, 10);

    stage.end();
    await speaking;
  });
});

describe("a text without a recording", () => {
  const cases: [string, Answer][] = [
    ["the server has no file", "missing"],
    ["the file cannot be fetched", "no connection"],
  ];

  test.each(cases)(
    "is said by the browser's voice when %s",
    async (_, answer) => {
      const { speech, stage } = createStage();

      stage.serve(await recordingOf("et hus"), answer);

      const speaking = speech.speak("et hus");

      await settle();

      expect(stage.played).toEqual([]);
      expect(stage.said).toEqual([
        { lang: "no_NO", rate: 0.9, text: "et hus", voice: HENRIK },
      ]);

      stage.end();
      await speaking;
    }
  );

  test("is said by the browser's voice where audio files cannot be played", async () => {
    const { speech, stage } = createStage();

    stage.canPlayFiles = false;

    const speaking = speech.speak("et hus");

    await settle();

    expect(stage.fetched).toEqual([]);
    expect(stage.said.map((utterance) => utterance.text)).toEqual(["et hus"]);

    stage.end();
    await speaking;
  });

  test("is asked for again the next time: a missing file is not remembered", async () => {
    const { speech, stage } = createStage();
    const path = await recordingOf("et hus");

    stage.serve(path, "missing");

    const first = speech.speak("et hus");

    await settle();
    stage.end();
    await first;
    stage.serve(path, "found");

    const second = speech.speak("et hus");

    await settle();

    expect(stage.played).toEqual([{ rate: 1, url: `blob:${path}` }]);

    stage.end();
    await second;
  });

  test("resolves at once where nothing can make a sound", async () => {
    const { speech, stage } = createStage();

    stage.canPlayFiles = false;
    stage.canSpeak = false;

    await speech.speak("et hus");

    expect(stage.said).toEqual([]);
    expect(speech.voices()).toEqual([]);
  });
});

/** A stage where no text has a recording, so the browser's voice says everything. */
const createSilentServer = () => {
  const made = createStage();

  made.stage.canPlayFiles = false;

  return made;
};

describe("the browser's voice", () => {
  test("says the text without the blanks of a phrase", async () => {
    const { speech, stage } = createSilentServer();
    const speaking = speech.speak("  se ___ ut,\n ikke  sant ");

    await settle();

    expect(stage.said[0]?.text).toBe("se ut, ikke sant");

    stage.end();
    await speaking;
  });

  test("is the one chosen in the settings", async () => {
    const { speech, stage } = createSilentServer();

    stage.settings.voice = NORA.voiceURI;

    const speaking = speech.speak("et hus");

    await settle();

    expect(stage.said[0]).toMatchObject({ lang: "nb-NO", voice: NORA });

    stage.end();
    await speaking;
  });

  test("is the first Norwegian one when the chosen voice is not on this device", async () => {
    const { speech, stage } = createSilentServer();

    stage.settings.voice = "uri:Gone";

    const speaking = speech.speak("et hus");

    await settle();

    expect(stage.said[0]?.voice).toBe(HENRIK);

    stage.end();
    await speaking;
  });

  test("changes from one index to the next, and round again", async () => {
    const { speech, stage } = createSilentServer();

    stage.settings.voice = NORA.voiceURI;

    const speakings = [0, 1, 2].map(async (voiceIndex) => {
      await speech.speak("et hus", { voiceIndex });
    });

    await settle();

    expect(stage.said.map((utterance) => utterance.voice)).toEqual([
      HENRIK,
      NORA,
      HENRIK,
    ]);

    stage.end();
    await Promise.all(speakings);
  });

  test("speaks at the speed of the setting, or at the one given for a text", async () => {
    const { speech, stage } = createSilentServer();

    stage.settings.rate = 1.1;

    const usual = speech.speak("et hus");
    const slow = speech.speak("et hus", { rate: 0.6 });

    await settle();

    expect(stage.said.map((utterance) => utterance.rate)).toEqual([1.1, 0.6]);

    stage.end();
    await Promise.all([usual, slow]);
  });

  test("speaks Norwegian with the browser's default voice when it has no Norwegian one", async () => {
    const { speech, stage } = createSilentServer();

    stage.voices = [];

    const speaking = speech.speak("et hus", { voiceIndex: 2 });

    await settle();

    expect(stage.said[0]).toMatchObject({ lang: "nb-NO", voice: null });

    stage.end();
    await speaking;
  });
});

describe("one sound at a time", () => {
  test("a new recording takes the place of the one that plays, which ends", async () => {
    const { speech, stage } = createStage();
    const first = speech.speak("et hus");

    await settle();

    const second = speech.speak("en bil");

    await settle();

    expect(stage.played.map((clip) => clip.url)).toEqual([
      `blob:${await recordingOf("et hus")}`,
      `blob:${await recordingOf("en bil")}`,
    ]);
    // The player takes the new file in place of the old one; nothing else stops the old one.
    expect(stage.pauses).toBe(0);

    stage.end();
    await second;
    // The first call is left open, as the player leaves it.
    expect(
      await Promise.race([
        first.then(() => "closed"),
        Bun.sleep(0).then(() => "open"),
      ])
    ).toBe("open");
  });

  test("a recording that arrives after a newer text was asked for is not played", async () => {
    const { speech, stage } = createStage();
    const slow = await recordingOf("et hus");

    stage.hold(slow);

    const first = speech.speak("et hus");

    await settle();

    const second = speech.speak("en bil");

    await settle();
    stage.release(slow);
    await first;

    expect(stage.played.map((clip) => clip.url)).toEqual([
      `blob:${await recordingOf("en bil")}`,
    ]);
    expect(stage.said).toEqual([]);

    stage.end();
    await second;
  });

  test("the browser's voice stops what it says before it says the next text", async () => {
    const { speech, stage } = createSilentServer();
    const first = speech.speak("et hus");

    await settle();

    const second = speech.speak("en bil");

    await first;
    await settle();

    expect(stage.cancels).toBe(2);
    expect(stage.said.map((utterance) => utterance.text)).toEqual([
      "et hus",
      "en bil",
    ]);

    stage.end();
    await second;
  });

  test("stopping ends the recording that plays and what the browser says", async () => {
    const { speech, stage } = createStage();
    const speaking = speech.speak("et hus");

    await settle();
    speech.stopSpeaking();
    await speaking;

    expect(stage.pauses).toBe(1);
    expect(stage.cancels).toBe(2);
  });

  test("stopping keeps a recording that is still on its way from starting", async () => {
    const { speech, stage } = createStage();
    const slow = await recordingOf("et hus");

    stage.hold(slow);

    const speaking = speech.speak("et hus");

    await settle();
    speech.stopSpeaking();
    stage.release(slow);
    await speaking;

    expect(stage.played).toEqual([]);
    expect(stage.said).toEqual([]);
  });
});

describe("the list of voices", () => {
  test("holds the Norwegian voices only: those on the device first, then by name", () => {
    const { speech, stage } = createStage();

    stage.voices = [ONLINE, NORA, HENRIK];

    expect(speech.voices()).toEqual([HENRIK, NORA, ONLINE]);
  });

  test("tells its listeners when the browser has loaded its voices, until they stop listening", () => {
    const { speech, stage } = createStage();
    let calls = 0;

    const stop = speech.onVoicesChange(() => {
      calls += 1;
    });

    stage.voicesChanged();
    stop();
    stage.voicesChanged();

    expect(calls).toBe(1);
  });

  test("has nothing to listen to where the browser cannot speak", () => {
    const { speech, stage } = createStage();

    stage.canSpeak = false;

    const stop = speech.onVoicesChange(() => {
      throw new Error("There is no list that could change");
    });

    stage.voicesChanged();
    stop();

    expect(speech.voices()).toEqual([]);
  });
});

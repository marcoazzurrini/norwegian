// The one voice of the app: Norwegian audio at the speed and with the voice the learner chose.
import { createSpeech } from "@norsk/speech";
import type { Voice } from "@norsk/speech";
import { useVoices as useVoicesOf } from "@norsk/speech/react";

import { learner } from "./learner";

const speech = createSpeech({ settings: learner.settings });

export const { speak, stopSpeaking } = speech;

/** The Norwegian voices of this browser. */
export const useVoices = (): readonly Voice[] => useVoicesOf(speech);

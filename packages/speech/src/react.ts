// The React hook for the list of voices.
import { useEffect, useState } from "react";

import type { Speech, Voice } from "./index";

/** The voices of the browser that speak the language of the course. Some browsers load them late, so the list starts empty and fills in. */
export const useVoices = (speech: Speech): readonly Voice[] => {
  const [voices, setVoices] = useState<readonly Voice[]>([]);

  useEffect(() => {
    const update = (): void => {
      setVoices(speech.voices());
    };

    update();

    return speech.onVoicesChange(update);
  }, [speech]);

  return voices;
};

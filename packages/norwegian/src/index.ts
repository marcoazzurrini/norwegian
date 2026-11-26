// The Norwegian course: Bokmål from zero, as the files in text/ describe it.
//
// The curriculum is built from those files by scripts/build-content.ts. This module only
// hands it to the app in the form every course has.
import { createCourse } from "@norsk/course";

import audio from "./audio.json";
// The .js is spelled out so every tool picks the same file: see curriculum-data.d.ts.
import curriculum from "./curriculum-data.js";
import { meta } from "./meta";

export const course = createCourse({ curriculum, meta, voices: audio.voices });

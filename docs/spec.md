# Norwegian learning app: spec

Status: draft 1, 2026-11-17. Target: Bokmål, Urban East Norwegian pronunciation, from zero to B1.

Decided: explanations are in English; session length varies and is chosen at the start of each session (5, 15, 25 or 40 minutes), with blocks scaled to fit and review taking priority when time is short; the app is for personal use only; answers are typed at first.

Word testing: the scheduled test is always a meaning cue followed by typed Norwegian. The cue is the English word by default, with a short disambiguating hint where English is ambiguous ("know (a fact)" for *vite*). Concrete nouns may use an image. Later stages use a Norwegian sentence with a gap. Recognition (Norwegian to meaning) appears once, at first exposure. Comprehension is not scheduled with its own cards: it is credited from production passes, stories and listening.

## 1. What the research says

Evidence tags: **strong**, **mixed**, **weak**, **vendor** (claimed by the company that sells it, no controlled study).

### Memory and practice

| Finding | Evidence | Consequence for the app |
|---|---|---|
| Retrieving an answer beats re-reading it. | strong | Every item is tested within a minute of being shown. |
| Spaced reviews beat massed reviews. | strong | FSRS schedules every item. |
| FSRS predicts recall better than SM-2 and Duolingo's HLR. | strong (727M Anki reviews) | Use `ts-fsrs` (MIT), desired retention 0.90, tunable 0.85 to 0.92. |
| Recall beats recognition. Multiple choice can teach the wrong options. | mixed to strong | Multiple choice only at first exposure. After that, typed or spoken recall. |
| You get the skill you practise. English to Norwegian builds production and transfers to comprehension better than the reverse. | strong | Track two memories per item: *understand* and *produce*. |
| Deliberate word study is far faster per hour than picking words up from input (77% vs 13 to 17% immediate recall). | strong | Teach words directly. Use input to consolidate, not to introduce. |
| Learning related words together (colours, days) causes cross-confusion. | mixed | Never introduce two items from one set in one session. |
| Interleaving helps confusable rules but hurts word lists. | mixed | Mix grammar patterns in review. Do not shuffle unrelated new words. |
| A single example sentence adds nothing over a word pair. Varied sentences across reviews teach usage. | mixed | Rotate sentences. Never tie an item to one fixed sentence. |
| Explicit grammar teaching beats implicit (d = 1.13 vs 0.54). The practice does most of the work, not the explanation. | strong | Rule in three lines or fewer, then practice. |
| Prompts that make you self-correct beat being handed the answer. | strong | On an error: hint and second attempt first, then the answer. |
| Reading needs 95 to 98% known words. | strong | Generate texts from the learner's known items only. |
| Training sound contrasts with many voices generalises and lasts months. One voice does not. | strong | Minimal-pair drills use several voices. |
| Pronunciation teaching works (d about 0.8). | strong | Sounds come first, in stage 0. |
| 87% of app learners quit within a year. Initial motivation does not predict who stays. | strong | Short sessions, capped load, easy re-entry after a break, no streak punishment. |
| There is no proven "N new items per day". Review load is the limit. | weak | Cap daily review time. Derive the new-item rate from it. |

Beliefs the evidence does not support: "N exposures and you know it", "input alone is enough", "delay speaking", "streaks improve learning", "the 85% rule" as a recall target.

### Math Academy and Khan Academy

Math Academy's model (vendor, but the mechanism is published):

- **Two graphs.** *Prerequisite* edges decide what unlocks. *Encompassing* edges decide where review credit flows. An advanced topic encompasses a simpler one if practising it also exercises the simpler one. Each encompassing edge has a weight from 0 to 1.
- **Fractional implicit repetition.** Passing an advanced task gives partial review credit to the topics it encompasses. Failing a simple topic penalises the topics that encompass it. Early credit (memory still high) is discounted.
- **Repetition compression.** Pick the task whose implicit credit clears the most due reviews. Never delay a due review to wait for a better cover.
- **Lessons.** Worked example, then 2 to 5 questions, per knowledge point. After two failures at one point, review its prerequisites.

Khan Academy uses coarse levels (familiar, proficient, mastered). Each question maps to one skill, with no fractional credit. Math Academy's model is the better base.

### The key caveat for "one sentence reviews many words"

No study shows that recalling a sentence strengthens every word in it. Retrieval theory predicts that only what is actually retrieved benefits. Words carried by context get exposure, not retrieval.

Design answer: **credit follows evidence**. A typed English-to-Norwegian sentence makes the learner retrieve every word, form and word-order choice, and the typed answer shows exactly which token failed. So production sentences can carry full credit. A cloze credits only the blank. Reading or listening gives *understand* credit only.

## 2. Learning model

### Items (atoms)

| Type | Example | Notes |
|---|---|---|
| Sound | y vs i, kj vs skj, tone 1 vs tone 2 | Trained by minimal pairs |
| Word | *hus* (et), house | Lemma with gender, forms, IPA, tone |
| Form | *huset*, *husene* | Word plus a grammar pattern |
| Chunk | *ha det bra* | Learned whole |
| Pattern | definite suffix, V2 inversion | Grammar |

Each item holds two FSRS memories: **understand** (Norwegian to meaning) and **produce** (meaning to Norwegian). *Understand* is a prerequisite of *produce*.

### Chunks (formulaic sequences)

A chunk is an item with its own memory, tested like a word: meaning cue, then the whole chunk typed.

| Kind | Example | Notes |
|---|---|---|
| Fixed formula | *ha det bra*, *takk for sist* | Often cannot be translated word for word |
| Frame with a slot | *Jeg vil gjerne ha ___*, *Kan jeg få ___?* | The slot takes any known noun, so one frame carries many word reviews |
| Collocation | *ta en dusj*, *gå på jobb* | The verb choice differs from English |
| Verb plus preposition | *vente på*, *se på* | Prepositions are learned inside chunks, not alone |

Rules:

- A chunk is taught whole. It does **not** need its words or its grammar as prerequisites. *Hva heter du?* comes in week one, long before question word order is taught.
- When the grammar pattern is taught later, known chunks are used as its first examples. The learner already says the pattern correctly and now sees why.
- A chunk gives review credit to a component word only if that word is also a learned item.
- A chunk is graded as one unit. A wrong word inside it fails the chunk, not the word.
- About one new item in four is a chunk during A1.

Source: no open list of Norwegian chunks exists. Mine frequent 2 to 5 word sequences from the subtitle corpus, filter them by hand, and add the functional phrases named in the A1 and A2 can-do descriptors (greetings, ordering, asking the way).

### Carriers

Sentences, dialogues and short texts are not items. They are **carriers**: review tasks that exercise several items at once. A carrier is eligible only if every item in it is already learned, except at most one item that the task is teaching.

### Credit rules

1. **Direct review** of an item: normal FSRS update. This is the ground truth.
2. **Carrier passed**: each item the learner had to retrieve gets a review. The credit is scaled by the edge weight and discounted when the item's recall probability is still high.
3. **Carrier failed**: token-level diff of the typed answer finds the failing items. Only those items lapse. Correct tokens still get credit.
4. **Listening or reading carrier**: *understand* credit only.
5. An item that has failed twice inside carriers gets a direct review next.

### Compression ladder

As an item's stability grows, its reviews move to larger carriers.

| Stability | Review vehicle |
|---|---|
| New | Direct card, both directions |
| Days | Chunk or 3 to 5 word sentence |
| Weeks | Full sentence, typed or spoken |
| Months | Dialogue turn, dictation, story with questions |

This is the compression: 40 due items can be cleared by about 8 sentences.

### Task selection

1. Collect due items (recall probability below desired retention).
2. Choose carriers by greedy cover: maximise the summed weight of due items cleared per second of expected effort.
3. Review leftovers directly.
4. If review time remains in budget, unlock new items from the frontier of the prerequisite graph, ordered by frequency and usefulness.
5. Keep similar items apart, both new and in review.

### After a break

Do not show a backlog. Run a short adaptive check (10 to 15 carriers) that propagates credit and penalties through the graph, then resume.

## 3. Presenting new material

### A word or chunk (about 40 seconds)

1. **Hear and see**: audio plays, then spelling, meaning, gender, and one short example. For English cognates, say so. Flag false friends.
2. **Notice**: one line on a spelling or sound trap, only if there is one (*de* is said "di").
3. **Recall**: type the Norwegian from the English. New items are shown in groups of up to three, and only then typed back, so that other items sit between seeing a word and recalling it.
4. **Recall again** later in the same session at growing gaps: about 1 minute, 4 minutes, end of session.

### A grammar pattern (about 3 minutes)

1. Two or three contrasting examples, built from known words. The changing part is highlighted.
2. The rule, in three lines or fewer.
3. **Process**: comprehension items where the form must be read to answer ("one house or the house?").
4. **Produce**: typed items, with hint and retry on error.
5. Mixed into review from the next session, interleaved with confusable patterns.

### Session shape (25 minutes)

| Block | Minutes | Content |
|---|---|---|
| Sounds | 2 | Minimal pairs, several voices |
| Review | 8 | Compressed carriers, then leftovers |
| New | 8 | One pattern or 6 to 10 words and chunks |
| Input | 5 | Mini story or dialogue at 95 to 98% known words, read while listening, then shadow one line |
| Recall again | 2 | Today's new items |

Every block can be stopped early. The app shows hours studied against the level estimates below.

## 4. Curriculum

Hours are estimates for a solo learner: A1 80 to 120, A2 200 to 250, B1 400 to 500 (cumulative). At 25 minutes a day, A1 takes about 7 months.

Vocabulary order: frequency in spoken Norwegian (subtitle corpus), cognates first, function words early, chunks as first-class items. Target: 2,000 lemmas by B1.

### Stage 0: sounds (about 4 hours, continues as a daily 2-minute drill)

- Nine vowels, long and short: i, y, e, ø, æ, a, o, u, å. The letter *o* is often [uː]. The letter *u* is [ʉ].
- Length: *tak* vs *takk*.
- Hard contrasts: y / i / u, ø, kj [ç] vs skj [ʃ].
- Retroflexes: rt, rd, rn, rl, rs.
- Silent letters: *det*, *god*, *og*, *hva*, *jeg*.
- Pitch accent: perception first (*bønder* vs *bønner*), production later.

### A1 (built: 379 words and forms, 61 chunks)

| Unit | Theme | Patterns |
|---|---|---|
| 1 Hei! | Greetings, who you are | Present tense; *ikke*; yes/no questions; question words |
| 2 Hjemme | Things and people | *en / ei / et*; the definite ending |
| 3 Mat og kafé | Food, ordering | *vil, kan, må*; *å* before a verb |
| 4 Familie | Family, numbers | Plural; possessives (*bilen min*); definite plural |
| 5 Dagen min | Daily life, the clock, weekdays | Verb in second place |
| 6 I byen | Town, directions, travel | *meg, deg, ham*; orders (*kom!*) |
| 7 Å beskrive | Describing things and people | Adjective agreement |
| 8 I går | The past | Past tense; irregular past forms as words |
| 9 Har gjort | Work, health | Perfect; *at, fordi, hvis* |
| 10 Planer | Plans, weather, invitations | *skal*; *det* as subject |

The order follows NTNU's "Norwegian on the Web" where the two differed. Weekdays, numbers and colours are spread over several lessons to avoid mixing them up.

### A2 (about 1,200 lemmas, not written yet)

Double definiteness (*den store bilen*); reflexive pronouns and *sin*; word order with *ikke* in subordinate clauses; comparison; *da* versus *når*; time prepositions; strong participles.

### B1 (about 2,000 lemmas, not written yet)

Relative clauses with *som*; s-passive and *bli*-passive; pluperfect; particle verbs and adverb placement; indirect speech; compounds; conditionals.

Hard for most learners and given extra interleaved practice: V2 inversion, double definiteness, subordinate word order, *sin*, prepositions.

## 5. Content sources

| Layer | Source | Licence |
|---|---|---|
| Frequency | OpenSubtitles word list (hermitdave), lemmatised with Norsk Ordbank, cross-checked with the Kelly list | CC BY-SA 4.0 |
| Forms and gender | Norsk Ordbank | CC BY 4.0 |
| English glosses | Wiktionary via kaikki.org | CC BY-SA 4.0 |
| IPA, length, tone | NB Uttale, `e_written` | CC0 |
| Sentences and stories | Generated to fit known items, validated against Norsk Ordbank; reviewed by sampling | Own |
| Audio | Pre-generated neural TTS, at least three voices (Azure Pernille, Finn, Iselin); Piper as offline fallback | Check Azure storage terms before any public release |
| Speech check | NB-Whisper | Apache 2.0 |
| Sequencing reference | NTNU "Norwegian on the Web", *Læreplan i norsk for voksne innvandrere* | Mirror the order only; do not copy content |

Risk: generated sentences can be unnatural. Mitigation: validate every token against Norsk Ordbank, prefer short sentences, and add a "report this sentence" button.

## 6. Features

### Version 1

- **Today**: one "Start" button, the session blocks, time left, items due, honest progress in hours and items.
- **Lesson**: word, chunk and pattern presentation as in section 3.
- **Review**: typed sentence production with token-level grading, cloze, listening dictation, direct cards. Hint and retry on error.
- **Sounds**: minimal-pair drill with several voices.
- **Story**: generated mini text with audio, tap a word for its meaning, comprehension questions.
- **Map**: the knowledge graph. Shows locked, ready, learning and stable items, and what a selected item encompasses.
- **Item page**: forms, IPA, audio, memory strength for *understand* and *produce*, sentences seen.
- **Settings**: daily minutes, desired retention, typing or speaking answers, text size.
- Offline first. Installable PWA. Desktop and phone layouts. Keyboard shortcuts on desktop.

### Later

Spoken answers checked with NB-Whisper; shadowing with recording; import of real text with known-word highlighting; FSRS parameter fitting from direct reviews.

### Readability requirements

Atkinson Hyperlegible font. Body text 18px or larger. Line length under 60 characters. Left-aligned. Generous line and letter spacing. One task per screen. No timers that count down on screen during recall. Colour is never the only signal.

## 7. What is built (2026-11-17)

Built and tested:

- Curriculum for stage 0 and A1: 10 units, 69 lessons, 379 words and forms, 61 chunks, 20 patterns, 647 sentences, 20 stories, 25 sound pairs.
- Every sentence and story is checked by `scripts/build-content.ts`: each word must be a taught item or a name, and no sentence may use an item taught in a later unit.
- The learning engine (FSRS-6 through `ts-fsrs`, token-level grading, compressed reviews, session flow), with tests.
- All screens of the design, on desktop and phone, installable and usable offline.

Differences from the plan above, and known gaps:

| Topic | Planned | Built | Why |
|---|---|---|---|
| Levels | To B1 | A1 only | A2 and B1 are outlined in section 4 but not written. |
| Unit order | As in section 4 | Checked against NTNU "Norwegian on the Web" and adjusted: object pronouns earlier, adjectives before the past tense, double definiteness and comparison moved to A2. | The NTNU order differed from the first draft. |
| Audio | Pre-generated, three neural voices | The browser's own Norwegian voice | No cloud voice account was set up. macOS and iOS have one voice, "Nora". The sound drill therefore has one speaker on those devices, which weakens ear training. |
| Word melody (tone 1 and 2) | Perception drill | Shown on the item page only | Computer voices do not produce tone reliably. |
| Sentences per item | At least three | Many items appear in only one or two sentences | These items are reviewed mostly on their own cards. More sentences would raise compression. |
| Sentence quality | Sampled review | Written by an AI model, checked by rule only | No native speaker has read them. Some may be stiff. |
| Images as cues | For concrete nouns | Not built | |
| After a long break | Short adaptive check | Not built | A backlog of 40 or more due items pauses new material instead. |
| Sync between devices | Later | Built: Cloudflare Worker and D1, one sync key | Two devices that both study offline at the same moment can lose a little study-time count |
| First review after learning | Inside a short sentence | On the item's own card | An item moves into sentences once its stability reaches 3 days. This keeps one clean, context-free check before compression starts. |

## 8. Open questions

1. Which cloud voice service to use for pre-generated audio, if any.
2. Whether a native speaker can review the sentences.

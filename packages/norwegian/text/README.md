# Curriculum source files of the Norwegian course

`bun scripts/build-content.ts` reads these files, checks them, adds forms and pronunciation from the raw data, and writes `src/curriculum.json`.

## Unit files (`units/uNN.txt`)

```
# unit 2 | Hjemme | Things at home | level: A1
## lesson Home | needs: gender
w hus | noun et | house
w snakke | verb | to speak
w er | verb | am / is / are | lemma=være | only
f gikk | verb | went (on foot) | lemma=gå
c ha det bra | goodbye
p definite | Saying "the" | needs: gender
rule: One to three lines.
ex: en bil > bilen | the car
q: huset | *the house | a house

## sentences
s Jeg har et hus. | I have a house.
s I dag jobber jeg. | Today I am working. | +v2 | alt: Jeg jobber i dag.

## story På kafeen | At the café
Ida: Hei! | Hi!
? What does Tom order? | *coffee | tea | water
```

- The first line of a unit names its level. The levels are listed in `levels.txt`, in the order they are learned. Units of one level stay together: after a unit of A2, no unit of A1 may follow.
- `w` is a word. It matches every inflected form of its lemma, unless `only` is set.
- `f` is a single irregular form, taught as its own item. It always matches only itself.
- `c` is a chunk. `___` marks a slot.
- A chunk that is a verb phrase is marked `verb`: `c stå opp | to get up | verb`. It is shown with "å" (å stå opp), like a verb, and may be typed with or without it.
- A word marked `no-example` may go without an example sentence: `w ja | interj | yes | no-example`. See "Example sentences" below.
- Give each item one meaning. A word or chunk with two unrelated meanings is written once for each, with `sense=name`: `w bli | verb | to become | sense=become` and `w bli | verb | to stay | sense=stay`. The meaning written first keeps the plain id.
- In a sentence or a story, a word with several meanings must name the one meant: `Vi ble{stay} hjemme.` The build fails without it.
- `p` is a grammar pattern. `needs:` lists the pattern ids it depends on.
- A lesson needs the previous lesson unless `needs:` names pattern ids or lesson titles.
- Noun gender is `en`, `ei`, `et` or `pl` (plural only).
- In a sentence, `word{pos}` picks one item when a spelling is ambiguous, for example `så{verb}`.
- `+tag` adds a pattern the checker cannot detect. `-tag` removes a detected one.
- `alt:` lists other accepted answers, separated by `;`.

## Example sentences

A new word is shown with one example sentence. The build chooses it from `## sentences` and writes its id into the item.

- The example may use the word itself and everything taught before it: the earlier lessons, and the lines above it in its own lesson. The order of the lines in a lesson is the order in which they are taught.
- The word must stand outside every chunk. "Jeg heter Anna." is the chunk `jeg heter ___`, so it is no example of `hete`.
- Of several sentences that fit, the shortest is chosen, and of two equally short the one written first.
- The build fails for a word without an example. Write a sentence for it, or move its line down in the lesson. The first words of the course cannot have one, because there is nothing to build a sentence from: mark those `no-example`.
- A chunk gets an example in the same way when a sentence shows it with at least one more word. A chunk without one is not an error.

## Rules for sentences

1. Every word must be an item taught in this unit or earlier, or a name from `names.txt`.
2. Keep sentences short: 3 to 8 words in units 1 to 5, up to 10 later.
3. Each item of the unit appears in at least three different sentences.
4. English must be natural, and must lead to exactly one obvious Norwegian sentence. Add `alt:` for any other correct answer.

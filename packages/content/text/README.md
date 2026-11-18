# Curriculum source files

`bun scripts/build-content.ts` reads these files, checks them, adds forms and pronunciation from the raw data, and writes `src/curriculum.json`.

## Unit files (`units/uNN.txt`)

```
# unit 2 | Hjemme | Things at home
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

- `w` is a word. It matches every inflected form of its lemma, unless `only` is set.
- `f` is a single irregular form, taught as its own item. It always matches only itself.
- `c` is a chunk. `___` marks a slot.
- `p` is a grammar pattern. `needs:` lists the pattern ids it depends on.
- A lesson needs the previous lesson unless `needs:` names pattern ids or lesson titles.
- Noun gender is `en`, `ei`, `et` or `pl` (plural only).
- In a sentence, `word{pos}` picks one item when a spelling is ambiguous, for example `så{verb}`.
- `+tag` adds a pattern the checker cannot detect. `-tag` removes a detected one.
- `alt:` lists other accepted answers, separated by `;`.

## Rules for sentences

1. Every word must be an item taught in this unit or earlier, or a name from `names.txt`.
2. Keep sentences short: 3 to 8 words in units 1 to 5, up to 10 later.
3. Each item of the unit appears in at least three different sentences.
4. English must be natural, and must lead to exactly one obvious Norwegian sentence. Add `alt:` for any other correct answer.

# Curriculum source files of the Spanish course

The course teaches the Spanish of Spain to speakers of Italian. Meanings, rules and story questions are written in Italian.

`bun scripts/build-content.ts` reads these files, checks them, adds the forms of each word from the raw data, and writes `src/curriculum.json`.

## What sets the content

- The level is A1 as the _Plan Curricular del Instituto Cervantes_ describes it: the present tense only, no past and no imperative. A sentence with a form outside the present tense does not build.
- Words are chosen inside the themes of that plan, and ordered by how often they occur in speech (subtitle counts).
- Grammar that works as in Italian gets a short rule. Grammar that differs gets its own pattern: `ser-estar`, `hay`, `muy-mucho`, `gustar`, `possessive`, `al-del`, `usted`.

## Unit files (`units/uNN.txt`)

```
# unit 2 | La gente | Persone, numeri, età e lavoro | level: A1
## lesson Il plurale | needs: articles
w libro | noun el | libro
w agua | noun el | acqua | fem
w gafas | noun las | occhiali
w levantarse | verb | alzarsi
f soy | verb | (io) sono | lemma=ser
c me llamo ___ | mi chiamo ___
p plural | Il plurale | needs: articles
rule: One to three lines.
ex: el amigo > los amigos | l'amico > gli amici
q: los chicos | *i ragazzi | il ragazzo

## sentences
s Tengo dos libros. | Ho due libri.
s Trabajo{verb} en una oficina. | Lavoro in un ufficio.
s Ese chico es mi primo. | Quel ragazzo è mio cugino. | alt: Aquel chico es mi primo.

## story En clase | In classe
Lucía: ¡Hola! | Ciao!
? Dove abita Marco? | *a Madrid | a Roma
```

- The first line of a unit names its level. The levels are listed in `levels.txt`, in the order they are learned.
- `w` is a word. It matches every taught form of its lemma, unless `only` is set. A verb has its infinitive and its present tense.
- `f` is a single irregular form, taught as its own item. It always matches only itself.
- `c` is a chunk. `___` marks a slot. A verb in a chunk may be inflected (`tener hambre` matches "tengo hambre"), and "de" also matches "del".
- A noun is written with its article: `el`, `la`, or `los` / `las` for a noun that only has a plural. `fem` marks a feminine noun that takes "el".
- A verb written with "se" is reflexive. It is looked up without the "se", and its table shows the pronouns.
- The articles and "al" / "del" are not items. They belong to the patterns `articles` and `al-del`.
- A word marked `no-example` may go without an example sentence. Only words of the first unit may.
- Give each item one meaning. A word with two unrelated meanings is written once for each, with `sense=name`.
- `p` is a grammar pattern. `needs:` lists the pattern ids it depends on. The prompt of a `q:` line is Spanish, and so is the first field of an `ex:` line: both are checked like sentences.
- A lesson needs the previous lesson unless `needs:` names pattern ids or lesson titles.
- In a sentence, `word{pos}` picks one item when a spelling belongs to two: `trabajo{verb}`, `trabajo{noun}`. The build warns until the choice is written.
- `+tag` adds a pattern the checker cannot detect. `-tag` removes a detected one.
- `alt:` lists other accepted answers, separated by `;`.

## Forms (`forms.txt`)

The forms of a word come from UniMorph. `forms.txt` holds the forms of the words UniMorph lacks, and replaces those it has. The build warns about a word that is in neither.

## Example sentences

A new word is shown with one example sentence. The build chooses it from `## sentences`.

- The example may use the word itself and everything taught before it: the earlier lessons, and the lines above it in its own lesson.
- The word must stand outside every chunk.
- Of several sentences that fit, the shortest is chosen, and of two equally short the one written first.
- The build fails for a word without an example. Write a sentence for it, or move its line down in the lesson.

## Rules for sentences

1. Every word must be an item taught in this unit or earlier, an article, or a name from `names.txt`.
2. Keep sentences short: up to 10 words.
3. The Italian must be natural, and must lead to one obvious Spanish sentence. Add `alt:` for any other correct answer.
4. Write a subject pronoun in Spanish only where the Italian has one.

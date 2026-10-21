/**
 * The words on the Croky Cup screens (intro, info, end), all in one place so other languages can be
 * added later. The in-game banners (GOAL!, SAVED!) and tips are still in src/main.ts and src/ui/coach.ts.
 */
export const TEXTS = {
  lang: 'nl',
  title: 'Croky Cup',
  tagline: "Scoor 5 penalty's!",
  play: 'Speel nu',
  info: 'Info',
  infoTitle: 'Zo speel je',
  infoRows: [
    ['Mikken', 'Beweeg je muis over het doel. Op je gsm druk je waar de bal heen moet.'],
    ['Schieten', 'Hou ingedrukt en laat los als de balk in de gouden zone staat.'],
    ['Effect', 'Sleep naar links of rechts terwijl je ingedrukt houdt, dan draait de bal om de keeper heen.'],
    ['Toetsenbord', 'Pijltjes om te mikken, spatie ingedrukt houden om te schieten, ← → voor effect.'],
    ['Doel', "Je krijgt 5 penalty's. Scoor ze alle 5!"],
  ] as const,
  back: 'Terug',
  close: 'Sluiten',
  score: (goals: number, shots: number) => `${goals} van de ${shots} gescoord`,
  endTitle: (goals: number, shots: number) =>
    goals === shots ? 'Perfect!' : goals >= Math.ceil(shots / 2) ? 'Goed gedaan!' : 'Volgende keer beter!',
  best: (goals: number) => `Je record: ${goals}`,
  newBest: 'Nieuw record!',
  again: 'Speel opnieuw',
  menu: 'Menu',
  scoreLabel: (goals: number, taken: number, shots: number) =>
    `${goals} goals, ${taken} van ${shots} penalty's genomen`,
};

/**
 * The words on the Croky Cup screens (intro, end), all in one place so other languages can be
 * added later. The in-game banners (GOAL!, SAVED!) and tips are still in src/main.ts and src/ui/coach.ts.
 */
export const TEXTS = {
  lang: 'nl',
  title: 'Croky Cup',
  play: 'Speel nu & Win',
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

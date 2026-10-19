/**
 * The crowd: copies of Glenn's crowd person standing in the stands.
 * Sizes are in metres; colours are CSS hex strings (sRGB, as a colour picker shows them).
 */
export interface CrowdSettings {
  /** Draw the crowd. */
  crowd: boolean;
  /**
   * Heights of the stand steps the rows stand on, measured in the stadium model. Each row stands
   * on its step right behind the step's barrier, and the corner stairs are kept free on every row.
   * Left out: the wide walkway at 1.70 m, where the corner stairs come down, and the narrow top step
   * at 3.30 m, which has no barrier.
   */
  rowHeights: number[];
  /** Distance between neighbouring people in a row, centre to centre. */
  spacing: number;
  /** Space kept free between a person and anything of the stadium (barriers, walls, stairs, step edges). */
  clearance: number;
  /** 0..1: how much people's sizes differ from each other (0.05 = up to 5% bigger or smaller). */
  sizeVariation: number;
  /** Most a person is turned away from facing the pitch straight on, either way, in degrees. */
  turn: number;
  /** The shirt colour in the person's texture; every person gets a shirt colour from `shirtColors` in its place. */
  shirtColor: string;
  /** Shirt colours, picked at random for each person. Leave it empty to keep the texture's own shirt colour. */
  shirtColors: string[];
  /** Any whole number. The same seed always gives the same crowd. */
  seed: number;
}

export const CROWD_SETTINGS: CrowdSettings = {
  crowd: true,
  rowHeights: [0.45, 0.86, 2.1, 2.5, 2.9],
  spacing: 0.84,
  clearance: 0.02,
  sizeVariation: 0.05,
  turn: 8,
  shirtColor: '#1123eb',
  shirtColors: ['#1123eb', '#e63946', '#f4c430', '#ffffff', '#2a9d8f', '#ff7f50', '#6c398b', '#ff4fa3', '#1f2a44', '#8ecae6'],
  seed: 3,
};

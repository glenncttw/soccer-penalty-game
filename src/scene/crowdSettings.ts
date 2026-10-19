/**
 * The placeholder crowd: simple tubes standing in the stands until the real crowd is made.
 * Sizes are in metres; colours are CSS hex strings (sRGB, as a colour picker shows them).
 */
export interface CrowdSettings {
  /** Draw the crowd. */
  crowd: boolean;
  /**
   * Heights of the stand steps the rows stand on, measured in the stadium model. Each row stands
   * on its step right behind the step's barrier. Left out: the wide walkway at 1.70 m, where the
   * corner stairs come down, and the narrow top step at 3.30 m, which has no barrier.
   */
  rowHeights: number[];
  /** Radius of a tube. */
  radius: number;
  /** Height of a tube, from its feet to the top of its round head. */
  height: number;
  /** 0..1: how much tube heights differ from each other. */
  heightVariation: number;
  /** Distance between neighbouring tubes in a row, centre to centre. */
  spacing: number;
  /** Space kept free between a tube and anything of the stadium (barriers, walls, stairs, step edges). */
  clearance: number;
  /** Shirt colours, picked at random for each tube. */
  colors: string[];
  /** Any whole number. The same seed always gives the same crowd. */
  seed: number;
}

export const CROWD_SETTINGS: CrowdSettings = {
  crowd: true,
  rowHeights: [0.45, 0.86, 2.1, 2.5, 2.9],
  radius: 0.14,
  height: 0.85,
  heightVariation: 0.15,
  spacing: 0.42,
  clearance: 0.02,
  colors: ['#e63946', '#1d4ed8', '#f4c430', '#ffffff', '#2a9d8f', '#ff7f50', '#6c398b', '#ff4fa3', '#1f2a44', '#8ecae6'],
  seed: 3,
};

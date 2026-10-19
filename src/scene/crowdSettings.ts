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
  /** Distance between neighbouring people in a row, centre to centre, on average. */
  spacing: number;
  /** 0..1: how much the distance to the next person differs from `spacing`, either way (0.25 = 25%). */
  spacingJitter: number;
  /** How far back from the front of their step a person may like to stand, at most, where the step has room. */
  depthJitter: number;
  /** 0..1: share of spots left empty, so the rows aren't one even line. */
  gaps: number;
  /** Space kept free between a person and anything of the stadium (barriers, walls, stairs, step edges). */
  clearance: number;
  /** 0..1: how much people's sizes differ from each other (0.05 = up to 5% bigger or smaller). */
  sizeVariation: number;
  /** Most a person is turned away from facing the pitch straight on, either way, in degrees (where there's room). */
  turn: number;
  /** Make the crowd move: everyone sways and looks around a little, and some raise their arms now and then. */
  motion: boolean;
  /** How high a person bounces while cheering, in metres. */
  bob: number;
  /** Bounces per second. */
  bobSpeed: number;
  /** How far a person sways (turns) left and right, in degrees. */
  sway: number;
  /** How far a person looks left and right, in degrees. */
  headTurn: number;
  /** How far a person nods, in degrees. */
  headNod: number;
  /** 0..1: share of people who raise their arms now and then. */
  cheerShare: number;
  /** About how often a cheering person raises their arms, in seconds. */
  cheerEvery: number;
  /** How far the arms go up, out to the sides, when cheering: 0 = hanging down, 180 = straight up, in degrees. */
  armRaise: number;
  /** How far the raised arms lean forward, in degrees. */
  armForward: number;
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
  spacingJitter: 0.25,
  depthJitter: 0.3,
  gaps: 0.08,
  clearance: 0.02,
  sizeVariation: 0.05,
  turn: 20,
  motion: true,
  bob: 0.04,
  bobSpeed: 2.2,
  sway: 6,
  headTurn: 18,
  headNod: 6,
  cheerShare: 0.5,
  cheerEvery: 4,
  armRaise: 150,
  armForward: 20,
  shirtColor: '#1123eb',
  shirtColors: [
    '#1123eb',
    '#e63946',
    '#f4c430',
    '#ffffff',
    '#2a9d8f',
    '#ff7f50',
    '#6c398b',
    '#ff4fa3',
    '#1f2a44',
    '#8ecae6',
  ],
  seed: 3,
};

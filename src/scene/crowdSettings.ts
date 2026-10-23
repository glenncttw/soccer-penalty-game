/**
 * The crowd: copies of Glenn's crowd person standing in the stands, each with one of the head
 * pieces (hair or a hat) and their own skin, hair and shirt colours.
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
  /** Seconds the crowd takes to react, at most (each person a bit sooner or later). */
  reactDelay: number;
  /** Seconds they shout after a goal before their faces go back to rest. */
  goalShout: number;
  /** 0..1: share of people who shout with their mouths wide open after a goal (the rest grin). */
  shoutShare: number;
  /** Seconds they look disappointed after a save. */
  saveSulk: number;
  /** 0..1: share of people who frown after a save (a few others smile: they're for the keeper). */
  frownShare: number;
  /** 0..1: how much each person smiles at rest, at most (everyone a bit differently). */
  restSmile: number;
  /** About how many seconds between Mexican waves while you aim or wait (each gap a bit shorter or longer). */
  waveEvery: number;
  /**
   * Seconds per jump. After a goal they keep jumping until the next shot: through the banner, the wipe and the
   * whole replay.
   */
  jumpTime: number;
  /** How high they jump, in metres, at most (each person a bit differently). */
  jumpHeight: number;
  /** Seconds a Mexican wave takes from one end of the stands to the other. A goal or a save stops it. */
  waveLap: number;
  /** How many times it goes round. */
  waveLaps: number;
  /** How wide the wave is, as a share of the stands' length. */
  waveWidth: number;
  /** How far people rise as the wave passes, in metres. */
  waveRise: number;
  /**
   * The head pieces (files in public/assets/crowd/, made to fit the body in crowd_base.glb), and
   * how often each is picked compared with the others. Neighbours in a row get different ones
   * where they can.
   */
  heads: { file: string; share: number }[];
  /** Shirt colours, picked at random for each person; the shorts, shoes and hats get the same colour. */
  shirtColors: string[];
  /** Skin colours, picked at random for each person. */
  skinColors: string[];
  /** Hair colours, picked at random for each person. */
  hairColors: string[];
  /** The socks', soles' and collars' colour. */
  sockColor: string;
  /** The ponytail tie's colour. */
  accentColor: string;
  /** Any whole number. The same seed always gives the same crowd. */
  seed: number;
}

export const CROWD_SETTINGS: CrowdSettings = {
  crowd: true,
  rowHeights: [0.45, 0.86, 2.1, 2.5, 2.9],
  spacing: 0.66,
  spacingJitter: 0.05,
  depthJitter: 0.3,
  gaps: 0,
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
  reactDelay: 0.35,
  goalShout: 3,
  shoutShare: 0.75,
  saveSulk: 2,
  frownShare: 0.6,
  restSmile: 0.3,
  waveEvery: 15,
  jumpTime: 0.45,
  jumpHeight: 0.22,
  waveLap: 3,
  waveLaps: 2,
  waveWidth: 0.08,
  waveRise: 0.2,
  heads: [
    { file: 'hp_hair_short.glb', share: 1 },
    { file: 'hp_cap.glb', share: 1 },
    { file: 'hp_ponytail.glb', share: 1 },
    { file: 'hp_buckethat.glb', share: 1 },
    { file: 'hp_hair_long.glb', share: 1 },
  ],
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
  // Glenn's five characters' own colours (crowd_manifest.json), and a few darker skin tones and hair colours.
  skinColors: ['#f8a767', '#fcbf85', '#feca92', '#fbac6b', '#fdc58d', '#d08b56', '#a86a3f', '#7b4a2b'],
  hairColors: ['#6f2e12', '#5c322b', '#985435', '#8a2e0e', '#925235', '#2b1a12', '#c99a4e'],
  sockColor: '#f0f0ee',
  accentColor: '#6d3c26',
  seed: 3,
};

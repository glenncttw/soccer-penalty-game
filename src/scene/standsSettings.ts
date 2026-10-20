/** The colour of the stands. Colours are CSS hex strings (sRGB, as a colour picker shows them). */
export interface StandsSettings {
  /**
   * The colour of the stands' concrete (walls, steps, stairs) where the sun shines on it. Their
   * shade and shadows keep their own darkness, in the same colour.
   */
  wallColor: string;
}

export const STANDS_SETTINGS: StandsSettings = {
  wallColor: '#dec4c7',
};

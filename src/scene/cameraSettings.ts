/**
 * Where the gameplay camera stands and what it sees when it is at rest. Sizes
 * are in metres, measured from the ball's spot and the grass, so they keep
 * working if the stadium model changes.
 *
 * On top of this rest view the game still pushes in while you charge a shot,
 * sways with the mouse and shakes on impacts (see gameCamera.ts). Aiming always
 * follows the camera, so any values here keep the aim on the right spot.
 *
 * Blender's camera (CAM_Gameplay_Main) is height 0.94, distanceBehindBall 3.63,
 * targetHeight 0.47, fov 32.76; "Use Blender camera" in the settings editor
 * loads it.
 */
export interface CameraSettings {
  /** How high the camera is above the grass. Lower feels more like standing over the ball. */
  height: number;
  /** How far behind the ball the camera stands. Closer makes the ball bigger next to the goal. */
  distanceBehindBall: number;
  /**
   * The camera looks straight ahead at this height on the goal line. Lower tilts the
   * camera down, which moves the goal up the screen and shows more grass in front of the ball.
   */
  targetHeight: number;
  /**
   * How much the camera sees from top to bottom, in degrees, on a 16:9 screen. Smaller
   * zooms in. Wider screens see more at the sides; screens held upright see more
   * from top to bottom, so the whole goal still fits.
   */
  fov: number;
  /**
   * Slides the whole picture up (+) or down (-), as a share of the screen height,
   * without tilting the camera, so the posts stay upright. 0 = centred.
   */
  verticalShift: number;
}

/** The game's camera, tuned to the stylised reference picture. */
export const CAMERA_SETTINGS: CameraSettings = {
  height: 0.9,
  distanceBehindBall: 3.4,
  targetHeight: 0.58,
  fov: 32.5,
  verticalShift: 0,
};

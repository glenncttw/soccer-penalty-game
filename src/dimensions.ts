// Ball properties that are not part of the stadium model. Pitch, goal and ball
// placement come from the imported stadium; see src/worldConfig.ts.
export const BALL_MASS = 0.43; // kg

// Radius used for the drag and curl forces. It stays at the size the shot feel
// was tuned for, independent of the stadium ball's (bigger) visual radius.
export const AERO_RADIUS = 0.11;

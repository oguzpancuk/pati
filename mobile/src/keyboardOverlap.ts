/** A view's vertical extent in window coordinates, as `measureInWindow` reports it (points). */
export type WindowSpan = { y: number; height: number };

/** The keyboard's frame as React Native's keyboard events report it (`endCoordinates`). */
export type KeyboardFrame = { screenY: number; height: number };

/**
 * How many points of a view the keyboard covers: the bottom padding that
 * lifts whatever is pinned to the view's bottom edge (a composer) onto the
 * keyboard's top edge.
 *
 * Both rectangles are in window coordinates, so nothing about where the view
 * sits — under a stack header, above a tab bar, inside a sheet — has to be
 * known or guessed; RN's KeyboardAvoidingView needs that distance passed in
 * as `keyboardVerticalOffset`, and two hard-coded guesses at it are what
 * item K (2026-09-15) was.
 */
export function keyboardOverlap(view: WindowSpan, keyboard: KeyboardFrame | null): number {
  if (!keyboard || keyboard.height <= 0) return 0;
  // With "Prefer Cross-Fade Transitions" on, iOS reports the frame at
  // screenY 0. No iPhone keyboard starts at the top of the window, and RN's
  // own KeyboardAvoidingView ignores that frame too.
  if (keyboard.screenY <= 0) return 0;
  // measureInWindow answers with no arguments for a view it cannot find, and
  // with a zero rectangle for one that is off the window (a screen the stack
  // has detached); neither is a view the keyboard can cover.
  if (!Number.isFinite(view.y) || !Number.isFinite(view.height) || view.height <= 0) return 0;
  return Math.max(0, view.y + view.height - keyboard.screenY);
}

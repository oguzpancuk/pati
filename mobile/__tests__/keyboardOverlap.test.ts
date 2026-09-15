import { keyboardOverlap } from '../src/keyboardOverlap';

// iPhone 17 Pro on iOS 26.5, measured from the simulator screenshot of the
// bug: a pushed tab-stack screen spans y 116 (62 pt safe area + the 54 pt
// navigation bar) to 795 (the 79 pt tab bar's top edge); the keyboard with
// its suggestion row starts at 539.
const SCREEN = { y: 116, height: 795 - 116 };
const KEYBOARD = { screenY: 539, height: 874 - 539 };

describe('keyboardOverlap', () => {
  it('pads by exactly the covered part, so the bottom edge lands on the keyboard', () => {
    const overlap = keyboardOverlap(SCREEN, KEYBOARD);
    expect(overlap).toBe(256);
    expect(SCREEN.y + SCREEN.height - overlap).toBe(KEYBOARD.screenY);
  });

  it('is what the hard-coded offset of 88 missed by the header difference', () => {
    // RN's KeyboardAvoidingView: frame.y + frame.height - (screenY - offset),
    // with the frame relative to the stack's content view (y 0).
    const withOffset88 = Math.max(0, 0 + SCREEN.height - (KEYBOARD.screenY - 88));
    expect(keyboardOverlap(SCREEN, KEYBOARD) - withOffset88).toBe(SCREEN.y - 88);
  });

  it('answers 0 for a view that ends above the keyboard', () => {
    expect(keyboardOverlap({ y: 200, height: 300 }, KEYBOARD)).toBe(0);
  });

  it('answers 0 once the keyboard frame has moved off the window', () => {
    expect(keyboardOverlap(SCREEN, { screenY: 874, height: 335 })).toBe(0);
  });

  it('answers 0 without a keyboard, or for a zero-height one (hardware keyboard)', () => {
    expect(keyboardOverlap(SCREEN, null)).toBe(0);
    expect(keyboardOverlap(SCREEN, { screenY: 874, height: 0 })).toBe(0);
  });

  it('ignores the screenY 0 frame iOS reports with cross-fade transitions on', () => {
    expect(keyboardOverlap(SCREEN, { screenY: 0, height: 335 })).toBe(0);
  });

  it('answers 0 for a view measureInWindow could not place', () => {
    // Detached from the window: a zero rectangle.
    expect(keyboardOverlap({ y: 0, height: 0 }, KEYBOARD)).toBe(0);
    // Not found: the callback runs with no arguments.
    expect(
      keyboardOverlap(
        { y: undefined as unknown as number, height: undefined as unknown as number },
        KEYBOARD
      )
    ).toBe(0);
  });
});

/**
 * KeyboardInsetView's wiring, which keyboardOverlap.test.ts does not reach:
 * the view keeps the keyboard frame an event carries, measures itself, and
 * turns the overlap into bottom padding only when the measurement answers,
 * animated on the keyboard's own timing (item K review, 2026-09-15).
 *
 * measureInWindow is a stand-in that answers when the test says so, with the
 * frame the arithmetic assumes. Whether iOS reports that frame under the
 * native stack is the simulator's check, not something jest can observe.
 */
import React from 'react';
import {
  EmitterSubscription,
  Keyboard,
  KeyboardEvent,
  LayoutAnimation,
  LayoutChangeEvent,
  MeasureInWindowOnSuccessCallback,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import KeyboardInsetView from '../src/components/ui/KeyboardInsetView';

// iPhone 17 Pro on iOS 26.5, as in keyboardOverlap.test.ts: a pushed
// tab-stack screen from y 116 to the tab bar at 795; the keyboard at 539.
const SCREEN = { y: 116, height: 795 - 116 };
const WINDOW_HEIGHT = 874;

function keyboardAt(screenY: number, duration = 250): KeyboardEvent {
  const height = WINDOW_HEIGHT - 539;
  return {
    duration,
    easing: 'keyboard',
    endCoordinates: { screenX: 0, screenY, width: 402, height },
    startCoordinates: { screenX: 0, screenY: WINDOW_HEIGHT, width: 402, height },
    isEventFromThisApp: true,
  };
}

describe('KeyboardInsetView', () => {
  let onKeyboard: ((event: KeyboardEvent) => void) | null;
  let pending: MeasureInWindowOnSuccessCallback[];
  let remove: jest.Mock;
  let configureNext: jest.SpyInstance;

  beforeEach(() => {
    onKeyboard = null;
    pending = [];
    remove = jest.fn();
    jest.spyOn(Keyboard, 'addListener').mockImplementation((eventType, listener) => {
      if (eventType === 'keyboardWillChangeFrame') onKeyboard = listener;
      // why: the component only calls remove(); a real EmitterSubscription
      // needs an emitter this test has no use for.
      return { remove } as unknown as EmitterSubscription;
    });
    // The preset's View mock is a class whose prototype carries the native
    // methods, so the ref the component measures through lands here.
    jest.spyOn(View.prototype, 'measureInWindow').mockImplementation((callback) => {
      pending.push(callback);
    });
    configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function render(): ReactTestRenderer {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        <KeyboardInsetView style={{ flex: 1 }}>
          <Text>composer</Text>
        </KeyboardInsetView>
      );
    });
    return renderer as ReactTestRenderer;
  }

  const root = (renderer: ReactTestRenderer) => renderer.root.findByType(View);
  const paddingBottom = (renderer: ReactTestRenderer) =>
    StyleSheet.flatten(root(renderer).props.style).paddingBottom;

  function emit(event: KeyboardEvent) {
    act(() => onKeyboard?.(event));
  }

  function answer(frame: { y: number; height: number }) {
    const callbacks = pending.splice(0);
    act(() => callbacks.forEach((callback) => callback(0, frame.y, 402, frame.height)));
  }

  it('pads by the covered part when the measurement answers, on the keyboard timing', () => {
    const renderer = render();
    emit(keyboardAt(539));

    // The event alone moves nothing: the view has asked where it is.
    expect(pending).toHaveLength(1);
    expect(paddingBottom(renderer)).toBeUndefined();

    answer(SCREEN);
    expect(paddingBottom(renderer)).toBe(256);
    expect(configureNext).toHaveBeenCalledWith({
      duration: 250,
      update: { duration: 250, type: 'keyboard' },
    });
  });

  it('drops the padding when the keyboard leaves', () => {
    const renderer = render();
    emit(keyboardAt(539));
    answer(SCREEN);
    emit(keyboardAt(WINDOW_HEIGHT));
    answer(SCREEN);
    expect(paddingBottom(renderer)).toBeUndefined();
  });

  it('measures again on its own layout against the last keyboard, without an animation', () => {
    const renderer = render();
    emit(keyboardAt(539));
    // A view the window cannot place yet answers with a zero rectangle.
    answer({ y: 0, height: 0 });
    expect(paddingBottom(renderer)).toBeUndefined();
    configureNext.mockClear();

    const layout = { x: 0, y: 0, width: 402, height: SCREEN.height };
    act(() => {
      root(renderer).props.onLayout({ nativeEvent: { layout } } as LayoutChangeEvent);
    });
    answer(SCREEN);
    expect(paddingBottom(renderer)).toBe(256);
    expect(configureNext).not.toHaveBeenCalled();
  });

  it('unsubscribes on unmount and ignores a measurement that answers afterwards', () => {
    const renderer = render();
    emit(keyboardAt(539));
    act(() => renderer.unmount());
    expect(remove).toHaveBeenCalledTimes(1);

    answer(SCREEN);
    expect(configureNext).not.toHaveBeenCalled();
  });

  it('does nothing on Android, where adjustResize shrinks the window instead', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const renderer = render();
    expect(Keyboard.addListener).not.toHaveBeenCalled();
    expect(root(renderer).props.onLayout).toBeUndefined();
  });
});

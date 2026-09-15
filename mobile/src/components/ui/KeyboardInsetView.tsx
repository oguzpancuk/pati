import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardEvent,
  LayoutAnimation,
  Platform,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import { keyboardOverlap, type KeyboardFrame } from '../../keyboardOverlap';

type Props = {
  /**
   * Must give the view a frame its content does not size (`flex: 1`): the
   * padding goes inside that frame, and a view that grew with its padding
   * would measure a deeper overlap every time.
   */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * A screen root that pads its bottom by exactly the part of it the iOS
 * keyboard covers, so a composer pinned to its bottom rides on the keyboard.
 *
 * Why not RN's KeyboardAvoidingView: it compares its layout frame, which is
 * relative to its parent, with the keyboard's window position, so it must be
 * told the parent's distance from the window top (`keyboardVerticalOffset`).
 * The two composers guessed 88 and 90. Under a native-stack header on an
 * iPhone 17 Pro with iOS 26.5 that distance is 116 (62 pt safe area + a
 * 54 pt bar), so the composer stopped 28 pt short and the keyboard covered
 * its lower half (item K, 2026-09-15). `useHeaderHeight()` would not have
 * fixed it: native-stack 6 estimates 44 + (inset − 5) = 101 without asking
 * the native bar, and the bar's height changes between iOS releases.
 *
 * So this view measures itself in window coordinates whenever the keyboard
 * frame changes (and on its own layout changes), and the header, the tab bar
 * under the screen and the presentation style are all already in the number.
 * The measurement answers one native round trip after the event, so the
 * padding starts that much later than RN's view would start it, then runs
 * with the keyboard's own duration and curve.
 *
 * Android does nothing here: the activity is `adjustResize`, so the window
 * itself shrinks above the keyboard.
 */
export default function KeyboardInsetView({ style, children }: Props) {
  const ref = useRef<View>(null);
  const keyboard = useRef<KeyboardFrame | null>(null);
  const applied = useRef(0);
  const alive = useRef(true);
  const [inset, setInset] = useState(0);

  const remeasure = useCallback((event?: KeyboardEvent) => {
    const view = ref.current;
    if (!view) return;
    view.measureInWindow((_x, y, _width, height) => {
      if (!alive.current) return;
      const next = keyboardOverlap({ y, height }, keyboard.current);
      if (next === applied.current) return;
      applied.current = next;
      if (event && event.duration > 0) {
        // The same animation RN's KeyboardAvoidingView schedules; UIKit's
        // minimum accepted duration is 10 ms.
        const duration = Math.max(event.duration, 10);
        LayoutAnimation.configureNext({
          duration,
          update: { duration, type: LayoutAnimation.Types[event.easing] ?? 'keyboard' },
        });
      }
      setInset(next);
    });
  }, []);

  useEffect(() => {
    alive.current = true;
    if (Platform.OS !== 'ios') return undefined;
    const subscription = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      keyboard.current = event.endCoordinates;
      remeasure(event);
    });
    return () => {
      alive.current = false;
      subscription.remove();
    };
  }, [remeasure]);

  return (
    <View
      ref={ref}
      style={[style, inset > 0 ? { paddingBottom: inset } : null]}
      onLayout={Platform.OS === 'ios' ? () => remeasure() : undefined}
    >
      {children}
    </View>
  );
}

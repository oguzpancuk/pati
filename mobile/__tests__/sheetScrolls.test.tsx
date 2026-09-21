/**
 * A ScrollView must have no pressable ancestor inside a sheet or modal.
 *
 * On iOS (old architecture, which this app ships), RCTScrollView switches
 * its pan recognizer off whenever the current JS responder is one of its
 * native ancestors (`_shouldDisableScrollInteraction`). A drag that starts on
 * plain content bubbles to the nearest Pressable, that Pressable becomes the
 * responder, and the scroll dies. profile/Sheet.tsx was built that way — a
 * backdrop Pressable around a no-op card Pressable around the body — and App
 * Review rejected 1.0 (2) on it: the settings sheet would not scroll, so
 * "Hesabımı sil" could not be reached (2026-09-18, guidelines 4 and 5.1.1(v)).
 * The same bug had been "fixed" once before, on 2026-09-11, by a change that
 * did nothing; nobody could tell, because nothing checked.
 *
 * Whether the native scroll works is the simulator's check. What jest CAN
 * hold is the shape that breaks it: walk up from every ScrollView and refuse
 * any ancestor that handles a press or claims the responder.
 */
import React from 'react';
import { ScrollView, Text } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import Sheet from '../src/components/profile/Sheet';

jest.mock('../src/components/brand', () => ({ Icon: () => null }));

jest.mock('../src/theme', () => {
  // why: any style or colour key resolves to something; the test reads none.
  const anything: any = new Proxy({}, { get: () => anything });
  return {
    hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
    makeStyles: () => () => anything,
    radius: anything,
    spacing: anything,
    useTheme: () => ({ name: 'light', colors: anything }),
  };
});

// why `any`: only children reach the host component.
jest.mock('../src/components/ui/Text', () => {
  const { Text: RNText } = jest.requireActual('react-native');
  return { __esModule: true, default: ({ children }: any) => <RNText>{children}</RNText> };
});

const RESPONDER_PROPS = [
  'onPress',
  'onLongPress',
  'onStartShouldSetResponder',
  'onStartShouldSetResponderCapture',
  'onMoveShouldSetResponder',
  'onMoveShouldSetResponderCapture',
];

function pressableAncestors(node: ReactTestInstance): string[] {
  const found: string[] = [];
  for (let at = node.parent; at; at = at.parent) {
    const claimed = RESPONDER_PROPS.filter((prop) => typeof at!.props[prop] === 'function');
    if (claimed.length > 0) {
      const name = typeof at.type === 'string' ? at.type : at.type.displayName || at.type.name;
      found.push(`${name}(${claimed.join(',')})`);
    }
  }
  return found;
}

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

describe('profile/Sheet', () => {
  it('puts no pressable ancestor above its own ScrollView', () => {
    const tree = render(
      <Sheet visible onClose={() => {}} title="Ayarlar">
        <Text>body</Text>
      </Sheet>
    );
    const scrollers = tree.root.findAllByType(ScrollView);
    expect(scrollers).toHaveLength(1);
    expect(pressableAncestors(scrollers[0])).toEqual([]);
  });

  it('puts no pressable ancestor above a body that scrolls itself', () => {
    const tree = render(
      <Sheet visible onClose={() => {}} title="Bildirimler" fill scroll={false}>
        <ScrollView testID="own-scroller">
          <Text>row</Text>
        </ScrollView>
      </Sheet>
    );
    const own = tree.root.findAllByType(ScrollView);
    expect(own).toHaveLength(1);
    expect(pressableAncestors(own[0])).toEqual([]);
  });

  it('still closes from the backdrop, which is a sibling behind the card', () => {
    const onClose = jest.fn();
    const tree = render(
      <Sheet visible onClose={onClose} title="Ayarlar">
        <Text>body</Text>
      </Sheet>
    );
    // The backdrop is the one pressable that is not inside the card: it is
    // not an ancestor of the ScrollView and not the labelled close button.
    const backdrop = tree.root
      .findAll((n) => typeof n.props.onPress === 'function' && n.props.accessible === false)
      .find((n) => n.props.accessibilityLabel !== 'Kapat');
    expect(backdrop).toBeDefined();
    act(() => backdrop!.props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

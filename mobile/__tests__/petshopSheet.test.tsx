/**
 * The petshop card a tapped pin opens: it prints what the admin entered,
 * leaves out what was not, and its two action rows dial and open the link.
 * Whether the native dialer answers is the device's check; what jest holds
 * is the address each row hands to Linking.
 */
import React from 'react';
import { Linking, Pressable, Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import PetshopSheet from '../src/components/PetshopSheet';
import type { Petshop } from '../src/api/petshops';

jest.mock('../src/components/brand', () => ({ Icon: () => null }));

jest.mock('../src/theme', () => {
  // why: any style or colour key resolves to something; the test reads none.
  const anything: any = new Proxy({}, { get: () => anything });
  return {
    makeStyles: () => () => anything,
    radius: anything,
    spacing: anything,
    useTheme: () => ({ name: 'light', colors: anything }),
  };
});

// why `any`: only children and the press handler reach the host components.
jest.mock('../src/components/ui', () => {
  const RN = jest.requireActual('react-native');
  return {
    Text: ({ children }: any) => <RN.Text>{children}</RN.Text>,
    Button: ({ title, onPress }: any) => (
      <RN.Pressable onPress={onPress}>
        <RN.Text>{title}</RN.Text>
      </RN.Pressable>
    ),
  };
});

const shop: Petshop = {
  id: 7,
  name: 'Moda Pet Shop',
  address: 'Moda Cd. No: 112, Kadıköy',
  phone: '+90 (216) 555-12-34',
  opening_hours: 'Her gün 09:00–21:00',
  website_url: 'https://www.instagram.com/modapetshop/',
  location: { type: 'Point', coordinates: [29.02655, 40.98535] },
};

function texts(tree: ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((t) => [].concat(t.props.children).join(''));
}

async function pressRow(tree: ReactTestRenderer, label: string) {
  const row = tree.root
    .findAllByType(Pressable)
    .find((p) => p.props.accessibilityLabel?.startsWith(`${label}:`));
  if (!row) throw new Error(`no "${label}" row`);
  // onPress is async (Linking.openURL is awaited inside).
  await act(async () => {
    await row.props.onPress();
  });
}

describe('PetshopSheet', () => {
  let openURL: jest.SpyInstance;
  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });
  afterEach(() => openURL.mockRestore());

  it('shows the listing and dials the phone as a tel: link', async () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PetshopSheet shop={shop} onClose={() => {}} />);
    });
    expect(texts(tree)).toEqual(
      expect.arrayContaining([
        'Moda Pet Shop',
        'Moda Cd. No: 112, Kadıköy',
        'Her gün 09:00–21:00',
        '+90 (216) 555-12-34',
        'instagram.com/modapetshop',
      ])
    );
    await pressRow(tree, 'Ara');
    expect(openURL).toHaveBeenCalledWith('tel:+902165551234');
    await pressRow(tree, 'Aç');
    expect(openURL).toHaveBeenLastCalledWith('https://www.instagram.com/modapetshop/');
  });

  it('leaves out the rows the admin did not fill', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <PetshopSheet
          shop={{ ...shop, address: null, phone: null, opening_hours: null, website_url: null }}
          onClose={() => {}}
        />
      );
    });
    expect(texts(tree)).toEqual(['petshop', 'Moda Pet Shop', 'Kapat']);
  });
});

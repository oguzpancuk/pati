import {
  linkLabel,
  PETSHOP_THEMES,
  petshopMarkerKey,
  petshopMarkerSvg,
  telHref,
} from '../src/map/petshopMarker';
import { PETSHOP_MARKER_IMAGES } from '../src/map/markers';

describe('telHref', () => {
  it('keeps the digits and a leading plus only', () => {
    expect(telHref('+90 (216) 555-12-34')).toBe('tel:+902165551234');
    expect(telHref(' 0216 555 12 34 ')).toBe('tel:02165551234');
    expect(telHref('444 1 234')).toBe('tel:4441234');
  });
});

describe('linkLabel', () => {
  it('prints the address without its scheme, www. or trailing slash', () => {
    expect(linkLabel('https://www.instagram.com/modapet/')).toBe('instagram.com/modapet');
    expect(linkLabel('http://modapet.com.tr')).toBe('modapet.com.tr');
  });
});

describe('the petshop marker images', () => {
  it('exist for every theme under the key the map asks for', () => {
    // The generator writes PETSHOP_MARKER_IMAGES from the same keys: a
    // theme without its PNG would draw no pin at all on mobile.
    expect(Object.keys(PETSHOP_MARKER_IMAGES).sort()).toEqual(
      PETSHOP_THEMES.map(petshopMarkerKey).sort()
    );
  });

  it('are the brand orange, not the care green', () => {
    expect(petshopMarkerSvg('light')).toContain('#E05E2B');
    expect(petshopMarkerSvg('light')).not.toContain('#34A853');
  });
});

/**
 * Keeps the two halves of the iOS Google configuration in step.
 *
 * The SDK is configured with a client id at runtime, but the reversed form of
 * that same id must be a URL scheme in Info.plist at BUILD time. When they
 * disagree, Google's SDK raises an Objective-C exception that release builds
 * do not catch — the app terminates on the first tap. `googleAvailable()`
 * only compares the server's id to the compiled-in one; nothing at runtime
 * can see Info.plist, so the pairing was held together by prose until this
 * test (review finding).
 */
import fs from 'fs';
import path from 'path';
import { IOS_GOOGLE_CLIENT_ID } from '../src/googleClientId';

const PLIST = path.join(__dirname, '..', 'ios', 'StrayMobile', 'Info.plist');
const SUFFIX = '.apps.googleusercontent.com';
const SCHEME_PREFIX = 'com.googleusercontent.apps.';

function reversedClientId(clientId: string): string {
  return SCHEME_PREFIX + clientId.slice(0, -SUFFIX.length);
}

/**
 * The schemes iOS actually routes on: every <string> inside a
 * CFBundleURLSchemes array. Searching the whole file would accept a scheme
 * pasted under LSApplicationQueriesSchemes, which looks right and still
 * crashes (review finding).
 */
function declaredUrlSchemes(plist: string): string[] {
  const schemes: string[] = [];
  const key = /<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/g;
  for (let m = key.exec(plist); m; m = key.exec(plist)) {
    for (const s of m[1].matchAll(/<string>(.*?)<\/string>/g)) schemes.push(s[1].trim());
  }
  return schemes;
}

it('pairs the compiled-in Google client id with its Info.plist URL scheme', () => {
  const schemes = declaredUrlSchemes(fs.readFileSync(PLIST, 'utf8'));

  // The app's own scheme must always be there — proof this test is reading
  // the right part of the file rather than passing on an empty list.
  expect(schemes).toContain('pati');

  if (!IOS_GOOGLE_CLIENT_ID) {
    // Google sign-in is not built into this binary, so the scheme must not be
    // there either: a stray one means someone did half the change.
    expect(schemes.some((s) => s.startsWith(SCHEME_PREFIX))).toBe(false);
    return;
  }

  expect(IOS_GOOGLE_CLIENT_ID.endsWith(SUFFIX)).toBe(true);
  expect(schemes).toContain(reversedClientId(IOS_GOOGLE_CLIENT_ID));
});

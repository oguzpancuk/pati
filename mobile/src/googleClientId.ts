/**
 * The Google iOS client id THIS BUILD was compiled for — or null when the app
 * was built without Google sign-in.
 *
 * It exists because two halves of the same setting live in different places:
 * the client id the SDK is configured with arrives from the server at
 * runtime, while the reversed form of the same id must sit in
 * `ios/PatiMobile/Info.plist` as a URL scheme at BUILD time. If the two ever
 * disagree, Google's SDK raises an Objective-C exception that release builds
 * do not catch — the app terminates on the first tap, and a Fly secret alone
 * could cause that on an already-shipped binary.
 *
 * So the app refuses to show the Google button on iOS unless the id the
 * server reports is exactly this one. Changing it means changing Info.plist
 * in the same commit and shipping a new build.
 */
export const IOS_GOOGLE_CLIENT_ID: string | null =
  '223239218396-o34fhrm0v2f23ev4o18g9pc5v6517fvn.apps.googleusercontent.com';

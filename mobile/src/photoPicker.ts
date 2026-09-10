import type { ImageLibraryOptions } from 'react-native-image-picker';

/**
 * What every "pick from the library" call passes.
 *
 * `compatible` makes PHPicker hand us a JPEG rather than the asset's native
 * representation. The default is `automatic`, which is Apple's discretion —
 * and today it does transcode: a HEIC placed in the simulator's library and
 * picked through this app arrived at the server as a decodable JPEG
 * (measured 2026-09-10, iOS 26.5). But the server now REFUSES a file it
 * cannot decode, in order not to publish a photo's GPS EXIF, and sharp's
 * prebuilt binary cannot read HEIC. So an iOS version where `automatic`
 * chose the native representation would turn add-animal and avatar upload
 * into a hard 400 for every iPhone shooting in High Efficiency.
 *
 * This turns the measured behaviour into a contract. The camera path needs
 * nothing: react-native-image-picker writes camera captures through
 * `CGImageDestinationCreateWithData(..., kUTTypeJPEG, ...)` regardless.
 *
 * **iOS only.** The option maps to a PHPicker setting and Android ignores
 * it: there, `Utils.shouldResizeImage` is false without `maxWidth` or
 * `quality`, so a library HEIF is forwarded untouched and meets the
 * server's 400. That is a clear, actionable error rather than a silent
 * leak, and Android cameras default to JPEG, so it is a known limit rather
 * than a hole — closing it means forcing a device-side re-encode, which is
 * a change to what every Android upload sends and deserves its own look
 * (review finding, 2026-09-10).
 */
export const LIBRARY_PICKER: ImageLibraryOptions = {
  mediaType: 'photo',
  assetRepresentationMode: 'compatible',
};

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
 */
export const LIBRARY_PICKER: ImageLibraryOptions = {
  mediaType: 'photo',
  assetRepresentationMode: 'compatible',
};

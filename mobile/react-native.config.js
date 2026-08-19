module.exports = {
  // `npx react-native-asset` links the fonts in this folder into the iOS and
  // Android projects. File names match the PostScript names exactly
  // (Nunito-Regular etc.) because Android reads the font family from the
  // file name and iOS from the PostScript name; matching both lets a single
  // fontFamily value work.
  assets: ['./assets/fonts'],
};

module.exports = {
  // `npx react-native-asset` bu klasördeki fontları iOS ve Android projelerine
  // bağlar. Dosya adları PostScript adlarıyla birebir aynı (Nunito-Regular vb.)
  // çünkü Android font ailesini dosya adından, iOS ise PostScript adından
  // okuyor; ikisinin eşleşmesi tek bir fontFamily değeri kullanmamızı sağlıyor.
  assets: ['./assets/fonts'],
};

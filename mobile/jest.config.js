module.exports = {
  preset: 'react-native',
  // The preset transpiles only react-native itself; react-native-permissions'
  // jest mock (used by __tests__/location.test.ts for the real
  // PERMISSIONS/RESULTS values) ships as ESM.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-permissions)/)',
  ],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
};

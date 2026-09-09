// The React Native template's config, which this project has been missing:
// `npm run lint` is listed in CLAUDE.md as a command, but ESLint found no
// configuration and exited 2 on every run, so the lint rung of the
// verification ladder had never actually run here (night run, 2026-09-10).
//
// Formatting is prettier's job through `npm run format`, on prettier's own
// defaults. @react-native's config also runs prettier as a lint RULE, with
// the template's settings rather than this project's — the two disagree on
// nearly every file, which is a disagreement about configuration, not a
// finding about the code. Turned off so lint reports what lint is for.
module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['node_modules/', 'ios/', 'android/', 'src/map/markers/'],
  rules: {
    'prettier/prettier': 'off',
    // Guard clauses are written on one line throughout this codebase
    // (`if (!x) return;`). 172 warnings saying so is not a finding, it is
    // a house style the template disagrees with.
    curly: 'off',
  },
};

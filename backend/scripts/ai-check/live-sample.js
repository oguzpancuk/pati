/**
 * Sends real photos to the real model and prints what it says — the
 * accuracy check no fake can do (ADR-0005). Needs ANTHROPIC_API_KEY in the
 * environment or backend/.env; costs real money per call.
 *
 *   node scripts/ai-check/live-sample.js care food  photo.jpg [more.jpg …]
 *   node scripts/ai-check/live-sample.js care water photo.jpg [more.jpg …]
 *   node scripts/ai-check/live-sample.js match new.jpg cand1.jpg [cand2.jpg …]
 *
 * `care` runs the food/water check on each photo with the given claim;
 * `match` compares the first photo with the rest as if they were the cover
 * photos of nearby registered animals. Read the verdicts, decide whether
 * the prompts in src/utils/ai.js need tuning, and record the result in
 * docs/NOTES.md.
 */
require('dotenv').config();
const path = require('path');
const ai = require('../../src/utils/ai');

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  if (!ai.isConfigured()) {
    console.error('ANTHROPIC_API_KEY is not set — nothing to sample');
    process.exit(1);
  }
  console.log(`model: ${ai.MODEL}`);

  if (mode === 'care') {
    const [claim, ...files] = rest;
    if (!['food', 'water'].includes(claim) || files.length === 0) return usage();
    for (const file of files) {
      const result = await ai.checkCarePhoto(path.resolve(file), claim);
      console.log(
        `${path.basename(file)}: ${result.verdict}` +
          (result.subject ? ` (${result.subject})` : '') +
          (result.reason ? ` — ${result.reason}` : '') +
          ` [${result.ms} ms]`
      );
    }
    return;
  }

  if (mode === 'match') {
    const [newPhoto, ...candidates] = rest;
    if (!newPhoto || candidates.length === 0) return usage();
    const started = Date.now();
    const verdicts = await ai.compareAnimalPhotos(
      path.resolve(newPhoto),
      candidates.map((file, i) => ({ id: i + 1, filePath: path.resolve(file) })),
      'cat'
    );
    if (!verdicts) {
      console.log('no answer (see the [ai:match] line above)');
      return;
    }
    candidates.forEach((file, i) => {
      console.log(`${path.basename(file)}: ${verdicts.get(i + 1) ?? 'no verdict'}`);
    });
    console.log(`[${Date.now() - started} ms]`);
    return;
  }
  usage();
}

function usage() {
  console.error('usage: live-sample.js care <food|water> <photo…> | match <new> <candidate…>');
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

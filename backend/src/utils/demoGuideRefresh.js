/**
 * The timer that keeps the guide (demo) areas alive.
 *
 * The map's green fades in 4/6 hours (food/water); the guide data's month of
 * history cannot keep the map green. With DEMO_GUIDE_REFRESH=1 the server
 * adds a few fresh food/water actions on behalf of guide users at boot and
 * then hourly (see scripts/seed-guides.js#refreshGuides).
 *
 * On Fly the machine sleeps without traffic (auto_stop). That is deliberately
 * fine: if the machine is asleep, nobody is looking at the map; the first
 * request wakes it and the boot-time refresh greets them with a green map.
 */
const { refreshGuides } = require('../../scripts/seed-guides');

const INTERVAL_MS = 60 * 60 * 1000;
const BOOT_DELAY_MS = 15 * 1000; // don't race migrate/health at startup

function startDemoGuideRefresh() {
  if (process.env.DEMO_GUIDE_REFRESH !== '1') return;

  const run = async () => {
    try {
      const n = await refreshGuides({ quiet: true });
      if (n > 0) console.log(`[guide-refresh] added ${n} fresh food/water actions`);
    } catch (err) {
      // Demo dressing must never take the app down: log and wait for the next tick.
      console.error('[guide-refresh] failed:', err.message);
    }
  };

  setTimeout(run, BOOT_DELAY_MS);
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref(); // don't keep the process alive on shutdown
}

module.exports = { startDemoGuideRefresh };

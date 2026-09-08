require('dotenv').config();
const app = require('./app');
const { startDemoGuideRefresh } = require('./utils/demoGuideRefresh');
const { describeTransport } = require('./utils/mailer');
const { describeAi } = require('./utils/ai');
const { startPendingSweeper } = require('./config/upload');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`pati API listening on port ${PORT}`);
  // A production deploy without RESEND_API_KEY silently registers accounts
  // unverified, as before this feature; the release log should say so.
  console.log(`mail: ${describeTransport()}`);
  // Likewise without GEMINI_API_KEY: photos are accepted unchecked and
  // matching is field-only, exactly as before ADR-0005.
  console.log(`ai: ${describeAi()}`);
});

// Hourly refresh keeping the guide (demo) areas alive on the map;
// enabled only with DEMO_GUIDE_REFRESH=1.
startDemoGuideRefresh();

// Photos the add-animal match step screened but no create ever redeemed
// (ADR-0005 amendment): swept at boot and every few minutes.
startPendingSweeper();

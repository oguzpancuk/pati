require('dotenv').config();
const app = require('./app');
const { startDemoGuideRefresh } = require('./utils/demoGuideRefresh');
const { describeTransport } = require('./utils/mailer');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`pati API listening on port ${PORT}`);
  // A production deploy without RESEND_API_KEY silently registers accounts
  // unverified, as before this feature; the release log should say so.
  console.log(`mail: ${describeTransport()}`);
});

// Hourly refresh keeping the guide (demo) areas alive on the map;
// enabled only with DEMO_GUIDE_REFRESH=1.
startDemoGuideRefresh();

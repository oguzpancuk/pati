require('dotenv').config();
const app = require('./app');
const { startDemoGuideRefresh } = require('./utils/demoGuideRefresh');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`pati API listening on port ${PORT}`);
});

// Hourly refresh keeping the guide (demo) areas alive on the map;
// enabled only with DEMO_GUIDE_REFRESH=1.
startDemoGuideRefresh();

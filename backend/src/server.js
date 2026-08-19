require('dotenv').config();
const app = require('./app');
const { startDemoTazele } = require('./utils/demoTazele');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`pati API listening on port ${PORT}`);
});

// Rehber (demo) bölgelerinin haritasını canlı tutan saatlik tazeleme;
// yalnızca DEMO_REHBER_TAZELE=1 ile açılır.
startDemoTazele();

// Einstiegspunkt: Port kommt aus der Umgebungsvariable PORT (Cloud-tauglich),
// sonst 3000. Es gibt keine fest verdrahteten Adressen im Code.

import { networkInterfaces } from 'node:os';
import { startServer } from './server.js';

const port = Number(process.env.PORT) || 3000;

startServer(port).then((server) => {
  console.log(`\n🃏 Political Correct Fighters – Server läuft auf Port ${server.port}`);
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
  if (addresses.length > 0) {
    console.log('   Im WLAN erreichbar unter:');
    for (const a of addresses) console.log(`   → http://${a}:${server.port}`);
  }
  console.log('   (Diese Adresse tragen beide Handys im Spiel-Client ein.)\n');
});

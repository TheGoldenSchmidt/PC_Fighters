// Lokale Browser-Abnahme ohne gespeicherte private Partien zu verändern.
import { startServer } from '../../packages/server/src/server.js';
startServer(3105, { persistPath: null, accessCredentials: null })
  .then(server => console.log(`Alpha-Vorschau: http://localhost:${server.port}`));

// Fester iframe-Viewport für die lokale Hochformat-Abnahme, kein Touch-Emulator.
import { createServer } from 'node:http';
createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><html lang="de"><meta charset="utf-8"><title>Alpha – Hochformatprüfung</title><style>body{margin:0;background:#303640}iframe{display:block;width:390px;height:844px;border:0}</style><iframe title="Alpha in 390 × 844" src="http://localhost:3105/"></iframe></html>');
}).listen(3106, '127.0.0.1', () => console.log('Hochformatprüfung: http://127.0.0.1:3106'));

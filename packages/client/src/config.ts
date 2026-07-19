// Zentrale Adress-Auflösung.
//
// Zwei Betriebsarten:
// - CLOUD (fertiger Production-Build): Der Spielserver liefert die Seite selbst
//   aus. Client und Server teilen sich dieselbe Adresse – niemand muss eine
//   Serveradresse eintippen. Alles läuft über window.location.
// - LOKAL (Entwicklung): Der Vite-Client (Port 5173) und der Server (Port 3000)
//   laufen getrennt; die Serveradresse wird auf dem Startbildschirm gewählt.

/** true, wenn der Client als fertiger Cloud-Build läuft (Server = gleiche Herkunft). */
export const isCloud = import.meta.env.PROD;

/** Standard-Serveradresse (Host[:Port]) für Verbindungsaufbau und /info. */
export function defaultServerHost(): string {
  return isCloud ? window.location.host : `${window.location.hostname}:3000`;
}

function stripHost(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^wss?:\/\//, '')
    .replace(/\/+$/, '');
}

/** Host[:Port] → WebSocket-URL (wss auf HTTPS, sonst ws; lokal Port 3000 ergänzt). */
export function toWsUrl(input: string): string {
  const secure = window.location.protocol === 'https:';
  let s = stripHost(input);
  if (!s.includes(':') && !secure) s += ':3000';
  return `${secure ? 'wss' : 'ws'}://${s}`;
}

/** Host[:Port] → /info-URL (gleiche Protokoll-Logik wie die WebSocket-Adresse). */
export function toInfoUrl(input: string): string {
  const secure = window.location.protocol === 'https:';
  let s = stripHost(input);
  if (!s.includes(':') && !secure) s += ':3000';
  return `${secure ? 'https' : 'http'}://${s}/info`;
}

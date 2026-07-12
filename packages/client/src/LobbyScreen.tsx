// Lobby: Raum-Code groß anzeigen + QR-Code, mit dem der zweite Spieler
// Seite UND Raum-Code in einem Schritt bekommt.

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { Topic } from '@pcf/engine';

interface Props {
  roomCode: string;
  serverAddress: string;
  topic: Topic | null;
  onCancel: () => void;
}

export function LobbyScreen({ roomCode, serverAddress, topic, onCancel }: Props) {
  const [qr, setQr] = useState<string | null>(null);

  const joinUrl =
    `${window.location.origin}${window.location.pathname}` +
    `?server=${encodeURIComponent(serverAddress)}&room=${roomCode}`;

  useEffect(() => {
    QRCode.toDataURL(joinUrl, { width: 240, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [joinUrl]);

  const isLocalhost = /localhost|127\.0\.0\.1/.test(window.location.hostname);

  return (
    <div className="screen lobby-screen">
      <h1>Warte auf Gegner …</h1>
      {topic && (
        <p className="topic-tag">
          Schauplatz: {topic.emoji} <strong>{topic.name}</strong>
        </p>
      )}
      <p>Raum-Code für den zweiten Spieler:</p>
      <div className="room-code">{roomCode}</div>
      {qr && (
        <>
          <img className="qr" src={qr} alt={`QR-Code zum Beitreten: ${joinUrl}`} />
          <p className="hint">
            QR-Code mit dem anderen Handy scannen – Adresse und Raum-Code werden automatisch
            ausgefüllt.
          </p>
        </>
      )}
      {isLocalhost && (
        <p className="hint error-hint">
          Achtung: Du bist über „localhost" verbunden. Damit ein zweites Gerät beitreten kann,
          öffne die Seite über die WLAN-Adresse deines Rechners (z. B. http://192.168.x.x:5173) –
          sie steht im Terminal des Servers.
        </p>
      )}
      <button className="secondary" onClick={onCancel}>
        Abbrechen
      </button>
    </div>
  );
}

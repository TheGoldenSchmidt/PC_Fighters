// Gemeinsame Arena-Architektur: niedrige Tribünen, Banden und Eckstandarten.
// Alle Maße folgen den DOM-Feldankern; die Kampfbahnen bleiben frei.
import * as THREE from 'three';
import type { FieldMetrics } from './environments3d';

/** Feine Steinstruktur ohne Bilddownload; wiederholbar und deterministisch. */
export function createArenaFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#c1c3c6';
    ctx.fillRect(0, 0, 256, 256);
    let seed = 731;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 3200; i++) {
      ctx.fillStyle = random() > 0.5 ? 'rgba(255,255,255,.09)' : 'rgba(22,30,40,.08)';
      ctx.fillRect(random() * 256, random() * 256, 1 + random() * 3, 1 + random() * 2);
    }
    ctx.strokeStyle = 'rgba(35,43,55,.18)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, 254, 254);
    ctx.beginPath();
    ctx.moveTo(0, 128); ctx.lineTo(256, 128);
    ctx.moveTo(128, 0); ctx.lineTo(128, 128);
    ctx.moveTo(64, 128); ctx.lineTo(64, 256);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(20, 20);
  return texture;
}

/** Weiches Licht statt einer am Horizont sichtbaren rechteckigen Fläche. */
export function createArenaGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,.7)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,.25)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createArenaStage() {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x445268, roughness: 0.88 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x202c3b, roughness: 0.8, metalness: 0.15 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc49a57, roughness: 0.4, metalness: 0.65 });
  const teams = [0xcd796e, 0x7acccc].map(color => new THREE.MeshStandardMaterial({
    color, roughness: 0.8, side: THREE.DoubleSide
  }));
  const lamp = new THREE.MeshBasicMaterial({ color: 0xffdfaa });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const bannerShape = new THREE.Shape();
  bannerShape.moveTo(-0.24, 0);
  bannerShape.lineTo(0.24, 0);
  bannerShape.lineTo(0.24, -0.6);
  bannerShape.lineTo(0, -0.78);
  bannerShape.lineTo(-0.24, -0.6);
  bannerShape.closePath();
  const bannerGeo = new THREE.ShapeGeometry(bannerShape);

  function mesh(parent: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material,
    pos: [number, number, number], size: [number, number, number]) {
    const part = new THREE.Mesh(geo, mat);
    part.position.set(...pos);
    part.scale.set(...size);
    part.castShadow = true;
    part.receiveShadow = true;
    parent.add(part);
    return part;
  }

  const wings = [-1, 1].map(side => {
    const wing = new THREE.Group();
    group.add(wing);
    // Stufen steigen nach außen an. Die Innenkante bleibt bewusst niedrig.
    for (let row = 0; row < 3; row++) {
      const x = side * (0.18 + row * 0.32);
      const h = 0.18 + row * 0.14;
      mesh(wing, box, row % 2 ? dark : stone, [x, h / 2, 0], [0.34, h, 1]);
      mesh(wing, box, brass, [x, h + 0.012, 0], [0.035, 0.025, 1]);
    }
    return wing;
  });

  const corners = Array.from({ length: 4 }, (_, i) => {
    const post = new THREE.Group();
    group.add(post);
    mesh(post, cylinder, dark, [0, 0.09, 0], [0.25, 0.18, 0.25]);
    mesh(post, cylinder, brass, [0, 0.76, 0], [0.04, 1.4, 0.04]);
    mesh(post, box, brass, [0, 1.42, 0], [0.64, 0.045, 0.055]);
    mesh(post, bannerGeo, teams[i < 2 ? 0 : 1], [0, 1.4, 0], [1, 1, 1]);
    mesh(post, cylinder, lamp, [0, 1.58, 0], [0.075, 0.1, 0.075]);
    // Messingraute als gemeinsames Arena-Wappen.
    const crest = mesh(post, box, brass, [0, 1.13, 0.016], [0.13, 0.13, 0.028]);
    crest.rotation.z = Math.PI / 4;
    return post;
  });

  const endCaps = [0, 1].map(() => {
    const cap = new THREE.Group();
    group.add(cap);
    // Mittiger Durchgang zur Bank und Basis.
    for (const side of [-1, 1]) {
      mesh(cap, box, dark, [side * 0.345, 0.065, 0], [0.31, 0.13, 0.22]);
      mesh(cap, box, brass, [side * 0.345, 0.14, 0], [0.31, 0.025, 0.1]);
    }
    return cap;
  });

  const ringMat = new THREE.MeshBasicMaterial({ color: 0xd3b67f, transparent: true, opacity: 0.14, depthWrite: false });
  const ringGeo = new THREE.RingGeometry(0.94, 1, 64);
  const seal = new THREE.Mesh(ringGeo, ringMat);
  seal.rotation.x = -Math.PI / 2;
  group.add(seal);

  return {
    group,
    layout(m: FieldMetrics) {
      const s = Math.max(0.15, Math.min(m.scale, m.laneStep * 0.52));
      const left = m.leftX - m.laneStep * 0.68;
      const right = m.rightX + m.laneStep * 0.68;
      const far = m.farZ - m.laneStep * 0.52;
      const near = m.nearZ + m.laneStep * 0.32;
      const length = Math.max(0.1, near - far);
      wings.forEach((wing, i) => {
        wing.position.set(i ? right : left, 0, (far + near) / 2);
        wing.scale.set(s, s, length);
      });
      corners.forEach((post, i) => {
        post.position.set(i % 2 ? right + s * 0.35 : left - s * 0.35, 0, i < 2 ? far : near);
        post.scale.setScalar(s);
      });
      endCaps.forEach((cap, i) => {
        cap.position.set((left + right) / 2, 0, i ? near : far);
        cap.scale.set(right - left, s, s);
      });
      seal.position.set((left + right) / 2, 0.008, (m.farZ + m.nearZ) / 2);
      seal.scale.setScalar(Math.min((right - left) * 0.24, length * 0.36));
    },
    dispose() {
      [box, cylinder, bannerGeo, ringGeo].forEach(g => g.dispose());
      [stone, dark, brass, ...teams, lamp, ringMat].forEach(m => m.dispose());
    }
  };
}

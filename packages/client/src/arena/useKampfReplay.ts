// Kampf-Abspielung: aus Server-Ereignissen wird eine Animation.
//
// Der Server schickt nach dem Kampf den fertigen Zustand PLUS strukturierte
// Ereignisse. Dieser Hook zeigt weiter den ALTEN Stand (`shownView`) und
// spielt die Ereignisse Lane fuer Lane ab – Projektil fliegt, Schaden
// erscheint, Sterbeanimation, naechste Lane – und schaltet erst danach auf den
// Serverzustand um.
//
// Die `else if`-Kette in `runReplay` hat bewusst KEINEN Auffang-Zweig: eine
// Ereignisart, die niemand beansprucht, faellt still aus der Animation (der
// Zustand springt trotzdem). Neue Ereignisart in der Engine = neuer Zweig hier.

import { useEffect, useRef, useState } from 'react';
import type {
  AttackEvent,
  CheerleaderPowerEvent,
  CheerleaderSacrificeEvent,
  ClientView,
  DeathEvent,
  LogEvent,
  PlayerIndex,
  SpellEvent
} from '@pcf/engine';
import {
  BANNER_MS,
  DEATH_MS,
  EMPTY_FX,
  IMPACT_MS,
  LANE_PAUSE_MS,
  POWER_MS,
  PROJECTILE_MS,
  SHIELD_BLOCK_MS,
  SHIELD_MS,
  SPELL_MS,
  type FxBaseImpact,
  type FxImpact,
  type FxProjectile,
  type FxSpell,
  type FxState
} from './fx';

/**
 * @param view Die neueste Serversicht. Aenderungen daran starten die
 *   Abspielung; `shownView` hinkt waehrenddessen absichtlich hinterher.
 */
export function useKampfReplay(view: ClientView, speed = 1) {
  const [shownView, setShownViewState] = useState<ClientView>(view);
  const [isReplaying, setIsReplaying] = useState(false);
  const [fx, setFx] = useState<FxState>(EMPTY_FX);
  const [moveFx, setMoveFx] = useState<Record<number, number>>({});
  const [banner, setBanner] = useState<{ key: number; text: string } | null>(null);

  const shownViewRef = useRef(view);
  const latestViewRef = useRef(view);
  const queueRef = useRef<LogEvent[]>([]);
  const runningRef = useRef(false);
  const cancelledRef = useRef(false);
  const lastLogId = useRef<number | null>(null);
  const moveTimer = useRef<number | null>(null);
  const bannerTimer = useRef<number | null>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  /** Zeigt kurz ein großes Phasen-Banner in der Bildschirmmitte. */
  const showBanner = (text: string) => {
    setBanner({ key: Date.now(), text });
    if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setBanner(null), BANNER_MS);
  };

  /**
   * Neue Sicht anzeigen. Vergleicht vorher die Lanes: Kreaturen, die die
   * Lane gewechselt haben (fliegend, Hetzjagd), bekommen eine sichtbare
   * Lauf-Animation statt einfach an der neuen Position aufzutauchen.
   */
  const setShown = (v: ClientView) => {
    const prev = shownViewRef.current;
    const moved: Record<number, number> = {};
    for (const side of [0, 1] as PlayerIndex[]) {
      const prevLane = new Map<number, number>();
      prev.board[side].forEach((c, i) => {
        if (c) prevLane.set(c.uid, i);
      });
      v.board[side].forEach((c, i) => {
        if (!c) return;
        const from = prevLane.get(c.uid);
        if (from !== undefined && from !== i) moved[c.uid] = from - i;
      });
    }
    if (Object.keys(moved).length > 0) {
      setMoveFx(moved);
      if (moveTimer.current) window.clearTimeout(moveTimer.current);
      moveTimer.current = window.setTimeout(() => setMoveFx({}), 600);
    }
    shownViewRef.current = v;
    setShownViewState(v);
  };

  useEffect(() => {
    if (isReplaying) showBanner('⚔️ Kampf!');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReplaying]);

  // Neue Kampf-Events sammeln und die Abspielung starten.
  useEffect(() => {
    latestViewRef.current = view;
    const maxId = view.log.length > 0 ? view.log[view.log.length - 1].id : -1;
    if (lastLogId.current === null) {
      // Erster Zustand (auch nach Reconnect): alte Einträge nicht nachspielen.
      lastLogId.current = maxId;
      setShown(view);
      return;
    }
    const fresh = view.log.filter((e) => e.id > lastLogId.current! && e.event);
    lastLogId.current = Math.max(lastLogId.current, maxId);

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      queueRef.current = [];
      setFx(EMPTY_FX);
      setIsReplaying(false);
      setShown(view);
      return;
    }

    if (fresh.length === 0) {
      if (!runningRef.current) setShown(view);
      return;
    }
    queueRef.current.push(...fresh.map((e) => e.event!));
    if (!runningRef.current) void runReplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    // Wichtig: beim (Re-)Mount zurücksetzen – Reacts StrictMode mountet im
    // Dev-Modus doppelt, sonst bliebe das Abbruch-Flag dauerhaft gesetzt.
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  async function runReplay() {
    runningRef.current = true;
    setIsReplaying(true);
    const sleep = (ms: number) =>
      new Promise<void>((r) => window.setTimeout(r, ms / Math.max(1, speedRef.current)));

    while (queueRef.current.length > 0 && !cancelledRef.current) {
      const ev = queueRef.current.shift()!;

      if (ev.kind === 'attack') {
        // Gleichzeitige Angriffe derselben Lane zusammen abspielen
        const group: AttackEvent[] = [ev];
        while (
          queueRef.current[0]?.kind === 'attack' &&
          (queueRef.current[0] as AttackEvent).lane === ev.lane
        ) {
          group.push(queueRef.current.shift() as AttackEvent);
        }

        const board = shownViewRef.current.board;
        const projectiles: FxProjectile[] = group.map((g, i) => {
          const attackerCreature = board[g.attacker][g.lane];
          return {
            key: `p-${g.lane}-${g.attacker}-${Date.now()}-${i}`,
            lane: g.lane,
            attacker: g.attacker,
            toBase: g.toBase,
            emoji:
              attackerCreature?.projectile ??
              (attackerCreature?.abilities.some((a) => a.kind === 'gift') ? '☠️' : '💥')
          };
        });
        setFx((f) => ({ ...f, activeLane: ev.lane, projectiles }));
        await sleep(PROJECTILE_MS);
        if (cancelledRef.current) break;

        // Einschlag: Schaden sichtbar auf die angezeigte Lage anwenden
        const next = structuredClone(shownViewRef.current);
        const impacts: FxImpact[] = [];
        const baseImpacts: FxBaseImpact[] = [];
        group.forEach((g, i) => {
          const defender: PlayerIndex = g.attacker === 0 ? 1 : 0;
          if (g.toBase) {
            next.players[defender].base -= g.damage;
            // Bei einem vom Schild geblockten Treffer ist damage 0 – dann keine
            // "-0"-Schadenszahl zeigen, das übernimmt der Schild-Effekt.
            if (g.damage > 0) {
              baseImpacts.push({ key: `b-${g.lane}-${i}-${Date.now()}`, side: defender, damage: g.damage });
            }
          } else {
            const target = next.board[defender][g.lane];
            if (target) target.health = Math.max(0, target.health - g.damage);
            impacts.push({ key: `i-${g.lane}-${i}-${Date.now()}`, lane: g.lane, side: defender, damage: g.damage });
          }
        });
        setShown(next);
        setFx((f) => ({ ...f, projectiles: [], impacts, baseImpacts }));
        await sleep(IMPACT_MS);
        setFx((f) => ({ ...f, impacts: [], baseImpacts: [] }));
        await sleep(LANE_PAUSE_MS);
      } else if (ev.kind === 'death') {
        // Tode derselben Lane (gleichzeitiger Kampf) gemeinsam abspielen
        const deaths: DeathEvent[] = [ev];
        while (
          queueRef.current[0]?.kind === 'death' &&
          (queueRef.current[0] as DeathEvent).lane === ev.lane
        ) {
          deaths.push(queueRef.current.shift() as DeathEvent);
        }
        setFx((f) => ({
          ...f,
          activeLane: ev.lane,
          dying: [...f.dying, ...deaths.map((d) => ({ lane: d.lane, owner: d.owner }))]
        }));
        await sleep(DEATH_MS);
        if (cancelledRef.current) break;
        const next = structuredClone(shownViewRef.current);
        for (const d of deaths) next.board[d.owner][d.lane] = null;
        setShown(next);
        setFx((f) => ({
          ...f,
          dying: f.dying.filter((x) => !deaths.some((d) => d.lane === x.lane && d.owner === x.owner))
        }));
      } else if (ev.kind === 'schild') {
        // Basis-Schild: Ladebalken auf den Stand aus dem Event setzen. Was der
        // Block bewirkt, folgt gleich als eigenes Cheerleader-Ereignis.
        const next = structuredClone(shownViewRef.current);
        next.players[ev.owner].schild = ev.stand;
        setShown(next);
        setFx((f) => ({ ...f, shield: { owner: ev.owner, blockiert: Boolean(ev.blockiert) } }));
        if (ev.blockiert) showBanner('🛡️ Angriff geblockt!');
        await sleep(ev.blockiert ? SHIELD_BLOCK_MS : SHIELD_MS);
        if (cancelledRef.current) break;
        setFx((f) => ({ ...f, shield: null }));
        await sleep(LANE_PAUSE_MS);
      } else if (ev.kind === 'spell') {
        // Zauber-Effekte einer Aktionskarte: alle direkt aufeinanderfolgenden
        // Spell-Events gemeinsam zeigen (z. B. Beschwörung mehrerer Tokens).
        const spellEvents: SpellEvent[] = [ev];
        while (queueRef.current[0]?.kind === 'spell') {
          spellEvents.push(queueRef.current.shift() as SpellEvent);
        }
        const spells: FxSpell[] = spellEvents.map((s, i) => ({
          key: `s-${s.lane}-${i}-${Date.now()}`,
          lane: s.lane,
          effect: s.effect,
          faction: s.faction
        }));
        // Neuen Serverzustand direkt zeigen: beschworene Kreatur erscheint,
        // Buff-Zahlen/Lane-Wechsel werden sichtbar – parallel zum Effekt.
        setShown(latestViewRef.current);
        setFx((f) => ({ ...f, activeLane: ev.lane, spells }));
        await sleep(SPELL_MS);
        if (cancelledRef.current) break;
        setFx((f) => ({ ...f, spells: [] }));
        await sleep(LANE_PAUSE_MS);
      } else if (ev.kind === 'cheerleaderSacrifice') {
        const sacrifice: CheerleaderSacrificeEvent = ev;
        const item = {
          key: `c-${sacrifice.owner}-${sacrifice.slot}-${Date.now()}`,
          owner: sacrifice.owner,
          slot: sacrifice.slot,
          cardId: sacrifice.cardId
        };
        setFx((current) => ({ ...current, sacrifices: [item] }));
        await sleep(1250);
        if (cancelledRef.current) break;
        const next = structuredClone(shownViewRef.current);
        if (next.players[sacrifice.owner].cheerleaders[sacrifice.slot] === sacrifice.cardId) {
          next.players[sacrifice.owner].cheerleaders[sacrifice.slot] = null;
        }
        setShown(next);
        setFx((current) => ({ ...current, sacrifices: [] }));
        await sleep(LANE_PAUSE_MS);
      } else if (ev.kind === 'cheerleaderPower') {
        // Kommt immer direkt nach dem Opfer: erst leert sich der Bankplatz,
        // dann wirkt die Kraft. Die Lage wird hier BEWUSST nicht auf den
        // Serverstand gezogen – was die Kraft anrichtet, kommt gleich als
        // eigene Angriffs- und Sterbe-Events bzw. am Ende der Abspielung.
        //
        // Kein Lane-Bezug mehr: Ein Schild-Block passiert an der Basis, und
        // alle Kräfte wirken auf das Feld als Ganzes. Der Effekt liegt deshalb
        // über der ganzen Arena statt auf einer Lane.
        const power: CheerleaderPowerEvent = ev;
        setFx((current) => ({
          ...current,
          power: {
            key: `k-${power.owner}-${Date.now()}`,
            owner: power.owner,
            kraft: power.kraft
          }
        }));
        showBanner(`📣 ${power.kraft}!`);
        await sleep(POWER_MS);
        if (cancelledRef.current) break;
        setFx((current) => ({ ...current, power: null }));
        await sleep(LANE_PAUSE_MS);
      }
    }

    setFx(EMPTY_FX);
    setShown(latestViewRef.current);
    runningRef.current = false;
    setIsReplaying(false);
  }
  return { shownView, isReplaying, fx, moveFx, banner, showBanner };
}

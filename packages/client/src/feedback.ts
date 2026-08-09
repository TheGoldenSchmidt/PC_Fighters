export type FeedbackCue =
  | 'card'
  | 'attack'
  | 'impact'
  | 'base'
  | 'shield'
  | 'power'
  | 'win'
  | 'lose';

let context: AudioContext | null = null;

function tone(frequency: number, duration: number, gain = 0.035, delay = 0) {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  context ??= new AudioContextClass();
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(frequency, start);
  volume.gain.setValueAtTime(0.0001, start);
  volume.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(volume).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export function playFeedback(cue: FeedbackCue, sound: boolean, haptics: boolean) {
  if (sound) {
    if (cue === 'card') tone(420, 0.08);
    if (cue === 'attack') tone(250, 0.09);
    if (cue === 'impact') tone(120, 0.12, 0.05);
    if (cue === 'base') tone(78, 0.22, 0.06);
    if (cue === 'shield') {
      tone(520, 0.18, 0.045);
      tone(820, 0.22, 0.035, 0.08);
    }
    if (cue === 'power') {
      tone(330, 0.18, 0.04);
      tone(660, 0.3, 0.04, 0.12);
    }
    if (cue === 'win') {
      tone(392, 0.16, 0.04);
      tone(523, 0.18, 0.04, 0.13);
      tone(659, 0.32, 0.045, 0.28);
    }
    if (cue === 'lose') {
      tone(220, 0.18, 0.04);
      tone(165, 0.35, 0.045, 0.16);
    }
  }
  if (haptics && navigator.vibrate) {
    const pattern = cue === 'shield' ? [35, 30, 70] : cue === 'base' ? [90] : cue === 'impact' ? [35] : [18];
    navigator.vibrate(pattern);
  }
}

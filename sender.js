import { encodeBits } from './simulation.js';

const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const cache = new WeakMap();

// Map displayed characters to the exact UTF-8 bit offsets used by the transmitter.
// Grapheme segmentation keeps combining marks and joined emoji together.
export function characterSequence(text) {
  const segments = segmenter ? Array.from(segmenter.segment(text), s => s.segment) : Array.from(text);
  let startBit = 0, startText = 0;
  return segments.map(text => {
    const bits = encodeBits(text);
    const character = { text, bits, startBit, endBit: startBit + bits.length,
      startText, endText: startText + text.length };
    startBit = character.endBit;
    startText = character.endText;
    return character;
  });
}

export function senderPosition(channel) {
  let entry = cache.get(channel);
  if (!entry || entry.text !== channel.text) {
    entry = { text: channel.text, characters: characterSequence(channel.text) };
    cache.set(channel, entry);
  }
  if (!entry.characters.length) return null;
  const bitIndex = channel.lastSent?.bitIndex ?? 0;
  let lo = 0, hi = entry.characters.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (entry.characters[mid].endBit <= bitIndex) lo = mid + 1;
    else hi = mid;
  }
  const character = entry.characters[lo];
  return { character, characterIndex: lo, characterCount: entry.characters.length,
    bit: channel.lastSent ? bitIndex - character.startBit : null };
}

export function visibleCharacters(text) {
  return text.replace(/ /g, '␠').replace(/\r\n/g, '↵').replace(/\n/g, '↵')
    .replace(/\r/g, '␍').replace(/\t/g, '⇥')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ch =>
      ch.charCodeAt(0) === 127 ? '␡' : String.fromCharCode(0x2400 + ch.charCodeAt(0)));
}

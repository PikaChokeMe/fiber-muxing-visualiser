import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, encodeBits } from '../simulation.js';
import { characterSequence, senderPosition, visibleCharacters } from '../sender.js';

test('sender highlight tracks the emitted bit, including the final bit before a character change', () => {
  const sim = new Simulation(); const ch = sim.add('he');
  assert.equal(senderPosition(ch).bit, null);
  assert.equal(senderPosition(ch).character.bits, '01101000');
  sim.advance(2);
  assert.equal(senderPosition(ch).character.text, 'h');
  assert.equal(senderPosition(ch).bit, 1);
  sim.advance(6);
  assert.equal(senderPosition(ch).character.text, 'h');
  assert.equal(senderPosition(ch).bit, 7);
  sim.advance(1);
  assert.equal(senderPosition(ch).character.text, 'e');
  assert.equal(senderPosition(ch).bit, 0);
  assert.equal(senderPosition(ch).character.bits, '01100101');
  sim.advance(7);
  assert.equal(ch.cursor, 0);
  assert.equal(senderPosition(ch).character.text, 'e');
  assert.equal(senderPosition(ch).bit, 7);
  sim.advance(1);
  assert.equal(senderPosition(ch).character.text, 'h');
  assert.equal(senderPosition(ch).bit, 0);
});

test('emoji and combined graphemes map to exact UTF-8 bit offsets', () => {
  const message = 'Aé🐈e\u0301👩‍🚀Z';
  const characters = characterSequence(message);
  assert.deepEqual(characters.map(c => c.text), ['A','é','🐈','e\u0301','👩‍🚀','Z']);
  assert.equal(characters.map(c => c.bits).join(''), encodeBits(message));
  const sim = new Simulation(); const ch = sim.add(message);
  for (const character of characters) {
    for (let bit = 0; bit < character.bits.length; bit++) {
      sim.advance(1);
      const current = senderPosition(ch);
      assert.equal(current.character.text, character.text);
      assert.equal(current.bit, bit);
      assert.equal(Number(current.character.bits[bit]), ch.lastSent.bit);
    }
  }
});

test('editing and restarting clears the sender highlight without touching emitted data', () => {
  const sim = new Simulation(); const ch = sim.add('hello'); sim.advance(2);
  const pulses = [...ch.pulses];
  sim.edit(ch.id, {text:'猫'});
  assert.equal(senderPosition(ch).character.text, '猫');
  assert.equal(senderPosition(ch).bit, null);
  assert.deepEqual(ch.pulses, pulses);
  sim.advance(1); assert.equal(senderPosition(ch).bit, 0);
  sim.restart(); assert.equal(senderPosition(ch).bit, null);
  sim.edit(ch.id, {text:''}); assert.equal(senderPosition(ch), null);
});

test('spaces and control characters have visible labels without altering encoded bits', () => {
  assert.equal(visibleCharacters(' \t\r\n\x00'), '␠⇥↵␀');
  assert.equal(characterSequence(' ')[0].bits, '00100000');
  assert.equal(characterSequence('\n')[0].bits, '00001010');
});

test('4096 bits/s preserves counts and the exact latest sender position', () => {
  const sim = new Simulation({rate:4096}); const ch = sim.add('he🐈');
  for(let i=0;i<600;i++) sim.advance(1/60);
  assert.equal(sim.sent,40960); assert.equal(sim.received,24576);
  const bitIndex=(40960-1)%ch.bits.length;
  const position=senderPosition(ch);
  assert.equal(position.character.startBit+position.bit,bitIndex);
  assert.equal(Number(position.character.bits[position.bit]),ch.lastSent.bit);
});

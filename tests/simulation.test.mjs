import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, Receiver, encodeBits, byteLabel } from '../simulation.js';

test('UTF-8 encoding uses whole bytes and MSB-first ordering', () => {
  assert.equal(encodeBits('H'), '01001000');
  assert.equal(encodeBits('é'), '1100001110101001');
  assert.equal(encodeBits('🐈').length, 32);
  assert.equal(byteLabel(0), 'NUL');
  assert.equal(byteLabel(32), 'SPACE');
});

test('a provisional @ becomes H before H is confirmed', () => {
  const sim = new Simulation(); const ch = sim.add('H', 630);
  sim.advance(4.99); assert.equal(ch.receiver.totalBits, 0);
  sim.advance(2.01); assert.equal(ch.receiver.partial, '010');
  assert.equal(ch.receiver.provisional, '@'); assert.equal(ch.receiver.text, '');
  sim.advance(2); assert.equal(ch.receiver.provisional, 'H');
  assert.equal(ch.receiver.text, '');
  sim.advance(3); assert.equal(ch.receiver.text, 'H');
  assert.equal(ch.receiver.provisional, '');
});

test('editing preserves in-flight payload, wavelength and arrival; reset occurs at new first bit', () => {
  const sim = new Simulation(); const ch = sim.add('H', 630);
  sim.advance(3.1); const alreadySent = [...ch.pulses];
  sim.edit(ch.id, { text: 'A', wavelength: 460 });
  assert.deepEqual(ch.pulses, alreadySent);
  assert.ok(alreadySent.every(p => p.wavelength === 630 && Object.isFrozen(p)));
  sim.advance(3.9); assert.equal(ch.receiver.partial, '010');
  assert.equal(ch.receiver.provisional, '@');
  assert.equal(ch.receiver.sequence, 1);
  sim.advance(1); assert.equal(ch.receiver.sequence, 2);
  assert.equal(ch.receiver.partial, '0'); assert.equal(ch.receiver.text, '');
  assert.equal(ch.receiver.history.filter(h => h.boundary).length, 2);
  assert.equal(ch.pulses.find(p => p.sentAt === 4).wavelength, 460);
});

test('rapid edits cause only actually transmitted sequence starts to arrive', () => {
  const sim = new Simulation(); const ch = sim.add('h', 630);
  sim.advance(1); sim.edit(ch.id, { text: 'he' });
  sim.advance(1); sim.edit(ch.id, { text: 'hel' });
  sim.edit(ch.id, { text: 'hell' }); sim.edit(ch.id, { text: 'hello' });
  sim.advance(5);
  assert.deepEqual(ch.receiver.history.filter(p => p.boundary).length, 3);
  assert.equal(ch.receiver.sequence, 5);
});

test('short messages loop independently and receiver clears on arrival, retaining ribbon history', () => {
  const sim = new Simulation({ rate: 8 }); const a = sim.add('A', 630), b = sim.add('BC', 460);
  sim.advance(5); assert.equal(a.receiver.text, 'A'); assert.equal(b.receiver.text, 'B');
  sim.advance(.125); assert.equal(a.receiver.text, ''); assert.equal(a.receiver.partial, '0');
  assert.equal(a.receiver.loop, 2); assert.equal(b.receiver.loop, 1);
  assert.equal(b.receiver.text, 'B'); assert.equal(a.receiver.totalBits, 9);
});

test('multibyte characters arrive intact, without prematurely committing replacement characters', () => {
  const sim = new Simulation({ rate: 8 }); const ch = sim.add('é🐈', 530);
  sim.advance(5); assert.equal(ch.receiver.text, ''); assert.equal(ch.receiver.waitingUTF8, true);
  sim.advance(1); assert.equal(ch.receiver.text, 'é');
  sim.advance(3); assert.equal(ch.receiver.text, 'é');
  sim.advance(1); assert.equal(ch.receiver.text, 'é🐈');
});

test('an edit resets pending UTF-8 decoder state only on arrival', () => {
  const sim = new Simulation({ rate: 8 }); const ch = sim.add('🐈', 530);
  sim.advance(1); sim.edit(ch.id, {text:'H'});
  sim.advance(4); assert.equal(ch.receiver.waitingUTF8, true);
  sim.advance(1); assert.equal(ch.receiver.text, 'H');
  assert.ok(!ch.receiver.text.includes('�'));
});

test('speed changes leave previously emitted pulses intact', () => {
  const sim = new Simulation(); const ch = sim.add('Hello', 630);
  sim.advance(2.5); const pulses = [...ch.pulses];
  sim.setRate(8); sim.advance(.5);
  assert.deepEqual(ch.pulses.slice(0,2), pulses);
  assert.equal(pulses[0].arrivesAt, 5); assert.equal(pulses[1].arrivesAt, 6);
  assert.equal(ch.receiver.totalBits, 0);
});

test('deleting a channel drains already sent bits; blank text sends nothing', () => {
  const sim = new Simulation(); const ch = sim.add('H',630); sim.add('',530);
  sim.advance(2); sim.remove(ch.id); sim.advance(4);
  assert.equal(sim.sent,2); assert.equal(sim.received,2); assert.equal(ch.receiver.partial,'01');
  sim.advance(2); assert.ok(!sim.channels.includes(ch));
});

test('simulation is deterministic across frame sizes and bounds retained history', () => {
  const a = new Simulation({rate:256}), b = new Simulation({rate:256});
  const ca = a.add('Hello 🐈',630), cb = b.add('Hello 🐈',630);
  a.advance(20); for(let i=0;i<1200;i++) b.advance(1/60);
  assert.equal(a.sent,b.sent); assert.equal(a.received,b.received);
  assert.equal(ca.receiver.text,cb.receiver.text); assert.equal(ca.receiver.partial,cb.receiver.partial);
  assert.ok(ca.receiver.history.length<=100); assert.ok(ca.pulses.length<1400);
  assert.throws(()=>a.advance(-1));
});

test('a sample along the fiber reads an earlier emitted signal', () => {
  const sim = new Simulation(); const ch = sim.add('H',630); sim.advance(4);
  assert.equal(sim.signalAt(ch,sim.time-2).bit,1);
  assert.equal(sim.signalAt(ch,sim.time-3).bit,0);
});

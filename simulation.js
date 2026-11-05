const encoder = new TextEncoder();

export function encodeBits(text) {
  return Array.from(encoder.encode(text), b => b.toString(2).padStart(8, '0')).join('');
}

const controlNames = ['NUL','SOH','STX','ETX','EOT','ENQ','ACK','BEL','BS','TAB','LF','VT','FF','CR','SO','SI','DLE','DC1','DC2','DC3','DC4','NAK','SYN','ETB','CAN','EM','SUB','ESC','FS','GS','RS','US'];
export function byteLabel(value) {
  if (value < 32) return controlNames[value];
  if (value === 32) return 'SPACE';
  if (value === 127) return 'DEL';
  if (value > 127) return '0x' + value.toString(16).toUpperCase().padStart(2, '0');
  return String.fromCharCode(value);
}

export function readableText(text) {
  return text.replace(/[\x00-\x1f\x7f]/g, ch => '⟨' + byteLabel(ch.charCodeAt(0)) + '⟩');
}

export class Receiver {
  constructor() {
    this.history = [];
    this.totalBits = 0;
    this.reset();
    this.sequence = null;
    this.lastArrival = null;
  }
  reset() {
    this.text = '';
    this.partial = '';
    this.byteBits = '';
    this.lastByte = null;
    this.bytesReceived = 0;
    this.bitsReceived = 0;
    this.decoder = new TextDecoder('utf-8');
    this.waitingUTF8 = false;
  }
  accept(pulse) {
    if (pulse.start) {
      this.reset();
      this.sequence = pulse.sequence;
      this.loop = pulse.loop;
      this.messageBytes = pulse.messageBytes;
      this.history.push({ boundary: true });
    }
    this.partial += pulse.bit;
    this.byteBits = this.partial;
    this.totalBits++;
    this.bitsReceived++;
    this.lastArrival = pulse.arrivesAt;
    this.history.push({ bit: pulse.bit });
    this.history = this.history.slice(-100);
    if (this.partial.length === 8) {
      this.lastByte = parseInt(this.partial, 2);
      const decoded = this.decoder.decode(Uint8Array.of(this.lastByte), { stream: true });
      this.text += decoded;
      this.waitingUTF8 = !decoded;
      this.bytesReceived++;
      this.partial = '';
    }
  }
  get provisional() {
    return this.partial ? byteLabel(parseInt(this.partial.padEnd(8, '0'), 2)) : '';
  }
}

export class Simulation {
  constructor({ rate = 1, transit = 4 } = {}) {
    this.rate = rate;
    this.transit = transit;
    this.time = 0;
    this.nextEmit = 1/rate;
    this.channels = [];
    this.pending = [];
    this.nextId = 1;
    this.sent = 0;
    this.received = 0;
  }
  add(text = '', wavelength = 530) {
    const channel = { id: this.nextId++, text, wavelength, active: true,
      bits: encodeBits(text), cursor: 0, sequence: 1, loop: 1,
      pulses: [], receiver: new Receiver(), transmitted: 0, lastSent: null };
    this.channels.push(channel);
    return channel;
  }
  edit(id, changes) {
    const ch = this.channels.find(c => c.id === id);
    if (!ch || !ch.active) return;
    Object.assign(ch, changes);
    ch.bits = encodeBits(ch.text);
    ch.cursor = 0;
    ch.sequence++;
    ch.loop = 1;
    ch.lastSent = null;
    // Already emitted pulses and receiver state are deliberately untouched.
  }
  remove(id) {
    const ch = this.channels.find(c => c.id === id);
    if (ch) ch.active = false; // Keep its pulses and receiver until they drain.
  }
  setRate(rate) {
    if (!Number.isFinite(rate) || rate <= 0) return;
    const remainingFraction = Math.max(0, Math.min(1, (this.nextEmit - this.time)*this.rate));
    this.rate = rate;
    this.nextEmit = this.time + remainingFraction/rate;
  }
  emit(at) {
    for (const ch of this.channels) {
      if (!ch.active || !ch.bits.length) continue;
      const pulse = Object.freeze({ id: ch.id, bit: Number(ch.bits[ch.cursor]),
        start: ch.cursor === 0, sequence: ch.sequence, loop: ch.loop,
        wavelength: ch.wavelength, sentAt: at, arrivesAt: at + this.transit,
        duration: 1/this.rate, bitIndex: ch.cursor, messageBytes: ch.bits.length/8 });
      ch.pulses.push(pulse);
      ch.lastSent = pulse;
      this.pending.push(pulse);
      ch.transmitted++;
      this.sent++;
      ch.cursor++;
      if (ch.cursor === ch.bits.length) {
        ch.cursor = 0;
        ch.sequence++;
        ch.loop++;
      }
    }
  }
  advance(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Time must move forward.');
    const target = this.time + seconds;
    while (this.nextEmit <= target + 1e-9) {
      this.emit(this.nextEmit);
      this.nextEmit += 1/this.rate;
    }
    let consumed = 0;
    while (consumed < this.pending.length && this.pending[consumed].arrivesAt <= target + 1e-9) {
      const pulse = this.pending[consumed++];
      this.channels.find(c => c.id === pulse.id)?.receiver.accept(pulse);
      this.received++;
    }
    if (consumed) this.pending.splice(0, consumed);
    this.time = target;
    for (const ch of this.channels) {
      ch.pulses = ch.pulses.filter(p => p.arrivesAt + p.duration + 0.2 >= target);
    }
    this.channels = this.channels.filter(ch => ch.active || ch.pulses.length);
  }
  restart() {
    this.time = 0;
    this.nextEmit = 1/this.rate;
    this.pending = [];
    this.sent = this.received = 0;
    this.channels = this.channels.filter(ch => ch.active);
    for (const ch of this.channels) {
      ch.pulses = [];
      ch.cursor = 0;
      ch.sequence++;
      ch.loop = 1;
      ch.transmitted = 0;
      ch.lastSent = null;
      ch.receiver = new Receiver();
    }
  }
  signalAt(ch, emittedTime) {
    let lo = 0, hi = ch.pulses.length - 1, index = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ch.pulses[mid].sentAt <= emittedTime + 1e-9) { index = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    const pulse = ch.pulses[index];
    return pulse && emittedTime < pulse.sentAt + pulse.duration - 1e-9 ? pulse : null;
  }
}

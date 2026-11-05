import { Simulation, readableText, byteLabel } from './simulation.js';
import { displayColor, signalXYZ, sumXYZ, swatch, isInvisible } from './color.js';

const $ = selector => document.querySelector(selector);
const rates = [1, 2, 4, 8, 16, 32, 64, 128, 256];
const defaults = [
  { text: 'Hello world', wavelength: 630 },
  { text: 'A cat is fine too desu desu desu', wavelength: 460 },
  { text: "This town ain’t big enough for the two of us", wavelength: 530 }
];
const storageKey = 'lumen-playground-v1';
let saved;
try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch { /* Private browsing can disable storage. */ }
const sim = new Simulation({ rate: rates.includes(saved?.rate) ? saved.rate : 1 });
const initial = Array.isArray(saved?.channels) ? saved.channels.filter(c => typeof c.text === 'string' && Number.isFinite(c.wavelength) && c.wavelength >= 200 && c.wavelength <= 1600) : defaults;
initial.forEach(c => sim.add(c.text, c.wavelength));
let playing = true;
let falseColor = saved?.falseColor === true;
let expanded = saved?.expanded === true;
let structure = '!';
let lastFrame = null;
let lastUI = -1;
let noticeTimer;
const senderNodes = new Map();
const receiverNodes = new Map();
const laneNodes = new Map();
const colorCache = new Map();
const xyzCache = new Map();

function colorFor(nm) {
  if (!colorCache.has(nm)) colorCache.set(nm, swatch(nm));
  return colorCache.get(nm);
}
function xyzFor(nm) {
  const key = `${nm}:${falseColor}`;
  if (!xyzCache.has(key)) xyzCache.set(key, signalXYZ(nm, falseColor));
  return xyzCache.get(key);
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({ channels: sim.channels.filter(c => c.active).map(({ text, wavelength }) => ({ text, wavelength })), rate: sim.rate, falseColor, expanded })); } catch { /* Simulation still works without storage. */ }
}
function notice(text) {
  $('#notice').textContent = text;
  $('#notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $('#notice').hidden = true, 2600);
}
function createSender(ch) {
  const card = document.createElement('article');
  card.className = 'channel-card';
  card.dataset.channel = ch.id;
  card.innerHTML = `<div class="card-top"><span class="channel-label"><i class="channel-dot"></i>CHANNEL ${String(ch.id).padStart(2, '0')}</span><span class="channel-meta byte-count"></span><button class="remove-button" aria-label="Remove channel ${ch.id}" title="Stop sending; allow in-flight bits to arrive">×</button></div><textarea class="message-input" aria-label="Message for channel ${ch.id}" spellcheck="false" placeholder="Give this wavelength something to say…"></textarea><div class="wave-control"><span class="swatch" aria-hidden="true"></span><label for="wave-${ch.id}">λ</label><input class="wavelength-input" id="wave-${ch.id}" type="number" min="200" max="1600" step="1" aria-label="Wavelength in nanometers for channel ${ch.id}"><label for="wave-${ch.id}">nm</label><span class="hex"></span></div><div class="spectrum" aria-hidden="true"><span class="spectrum-marker"></span></div><div class="card-bottom"><span class="wave-note"></span><span class="tx-progress"></span></div>`;
  const input = card.querySelector('textarea');
  input.value = ch.text;
  input.addEventListener('input', () => { sim.edit(ch.id, { text: input.value }); persist(); updateUI(); });
  const wave = card.querySelector('.wavelength-input');
  wave.value = ch.wavelength;
  wave.addEventListener('input', () => {
    const value = wave.valueAsNumber;
    if (Number.isFinite(value) && value >= 200 && value <= 1600) {
      sim.edit(ch.id, { wavelength: value }); persist(); updateUI();
    }
  });
  wave.addEventListener('blur', () => { wave.value = ch.wavelength; });
  card.querySelector('.remove-button').addEventListener('click', () => {
    sim.remove(ch.id); persist(); syncStructure(); updateUI();
    notice('Channel stopped. Already-sent bits will finish their journey.');
  });
  return card;
}
function createReceiver(ch) {
  const card = document.createElement('article');
  card.className = 'receiver-card';
  card.dataset.channel = ch.id;
  card.innerHTML = `<div class="card-top"><span class="channel-label"><i class="channel-dot"></i>CHANNEL ${String(ch.id).padStart(2, '0')}</span><span class="channel-meta rx-status">LISTENING</span></div><div class="received-text"><span class="confirmed"></span><span class="provisional" title="Provisional byte: unreceived bits are filled with zeros"></span><span class="placeholder">Waiting for the first bit…</span></div><div class="bit-ribbon" aria-label="Received binary stream"></div><div class="receiver-bottom"><span class="byte-preview">········</span><span class="rx-progress">0 / 8 bits</span></div>`;
  return card;
}
function syncStructure() {
  const signature = sim.channels.map(c => c.id + ':' + c.active).join(',');
  if (signature === structure) return;
  structure = signature;
  for (const [id, node] of senderNodes) {
    if (!sim.channels.some(c => c.id === id && c.active)) { node.remove(); senderNodes.delete(id); }
  }
  for (const [id, node] of receiverNodes) {
    if (!sim.channels.some(c => c.id === id)) { node.remove(); receiverNodes.delete(id); laneNodes.get(id)?.remove(); laneNodes.delete(id); }
  }
  $('#senders').querySelector('.empty-state')?.remove();
  $('#receivers').querySelector('.empty-state')?.remove();
  for (const ch of sim.channels) {
    if (ch.active && !senderNodes.has(ch.id)) {
      const node = createSender(ch); senderNodes.set(ch.id, node); $('#senders').append(node);
    }
    if (!receiverNodes.has(ch.id)) {
      const node = createReceiver(ch); receiverNodes.set(ch.id, node); $('#receivers').append(node);
      const lane = document.createElement('div'); lane.className = 'lane';
      lane.innerHTML = '<span class="lane-label"></span><canvas role="img"></canvas>';
      laneNodes.set(ch.id, lane); $('#component-lanes').append(lane);
    }
  }
  if (!senderNodes.size) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    empty.textContent = 'An empty fiber. Add a wavelength and send your first words.'; $('#senders').append(empty);
  }
  if (!receiverNodes.size) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    empty.textContent = 'Your messages will appear here, one arriving bit at a time.'; $('#receivers').append(empty);
  }
}
function updateUI() {
  syncStructure();
  const active = sim.channels.filter(c => c.active);
  const sending = active.filter(c => c.bits.length);
  $('#channel-count').textContent = active.length + (active.length === 1 ? ' channel' : ' channels');
  $('#aggregate').innerHTML = `${sending.length * sim.rate} <small>bit/s</small>`;
  $('#footer-stats').textContent = `${sim.sent.toLocaleString()} bits sent · ${sim.received.toLocaleString()} bits received`;
  for (const ch of sim.channels) {
    const color = colorFor(ch.wavelength).hex;
    const sender = senderNodes.get(ch.id);
    if (sender) {
      sender.style.setProperty('--channel', color);
      sender.style.setProperty('--spectral-pos', `${Math.max(0, Math.min(100, (ch.wavelength-380)/400*100))}%`);
      sender.querySelector('.byte-count').textContent = ch.bits.length/8 + ' B';
      sender.querySelector('.hex').textContent = color.toUpperCase();
      const duplicate = active.some(c => c.id !== ch.id && c.wavelength === ch.wavelength);
      const note = sender.querySelector('.wave-note');
      note.textContent = duplicate ? 'Duplicate λ · ideal channel' : isInvisible(ch.wavelength) ? (ch.wavelength < 380 ? 'UV' : 'IR') + ' · false-color swatch' : 'Visible · display mapped';
      note.classList.toggle('warning', duplicate || isInvisible(ch.wavelength));
      sender.querySelector('.tx-progress').textContent = ch.bits.length ? `bit ${ch.cursor} / ${ch.bits.length}` : 'idle';
    }
    const receiver = receiverNodes.get(ch.id), rx = ch.receiver;
    receiver.style.setProperty('--channel', color);
    receiver.classList.toggle('draining', !ch.active);
    receiver.querySelector('.rx-status').textContent = !ch.active ? 'DRAINING' : rx.sequence === null ? 'LISTENING' : `LOOP ${rx.loop}`;
    const text = readableText(rx.text);
    const confirmed = receiver.querySelector('.confirmed');
    if (confirmed.textContent !== text) {
      confirmed.textContent = text;
      const box = receiver.querySelector('.received-text'); box.scrollTop = box.scrollHeight;
    }
    const preview = receiver.querySelector('.provisional');
    preview.textContent = rx.provisional;
    preview.hidden = !rx.partial;
    preview.classList.toggle('control', rx.provisional.length > 1);
    const placeholder = receiver.querySelector('.placeholder');
    placeholder.hidden = !!(text || rx.partial);
    placeholder.textContent = rx.sequence === null ? 'Waiting for the first bit…' : rx.waitingUTF8 ? 'Receiving a UTF-8 character…' : '';
    const ribbon = receiver.querySelector('.bit-ribbon');
    if (ribbon.dataset.count !== String(rx.totalBits)) {
      ribbon.dataset.count = rx.totalBits;
      ribbon.replaceChildren(...rx.history.map(item => {
        const span = document.createElement('span');
        if (item.boundary) { span.className = 'boundary'; span.title = 'Start of a new sequence'; }
        else { span.textContent = item.bit; span.className = item.bit ? 'one' : 'zero'; }
        return span;
      }));
    }
    receiver.querySelector('.byte-preview').textContent = rx.byteBits.padEnd(8, '·');
    receiver.querySelector('.rx-progress').textContent = rx.partial ? `${rx.partial.length} / 8 bits${rx.waitingUTF8 ? ' · UTF-8' : ''}` : rx.lastByte !== null ? `${byteLabel(rx.lastByte)} · ${rx.bytesReceived}/${rx.messageBytes} B` : '0 / 8 bits';
    const lane = laneNodes.get(ch.id);
    lane.querySelector('.lane-label').textContent = `${String(ch.id).padStart(2,'0')} · ${ch.wavelength} nm`;
    lane.querySelector('canvas').setAttribute('aria-label', `Individual bit stream for channel ${ch.id}, ${ch.wavelength} nanometers`);
  }
}

function setPlaying(value) {
  playing = value; lastFrame = null;
  document.body.classList.toggle('paused', !playing);
  $('#play-text').textContent = playing ? 'Pause' : 'Play';
  $('#play-icon').textContent = playing ? 'Ⅱ' : '▶';
  $('#play').setAttribute('aria-label', playing ? 'Pause simulation' : 'Play simulation');
  $('#run-status').textContent = playing ? 'SIMULATION LIVE' : 'SIMULATION PAUSED';
}
$('#play').addEventListener('click', () => setPlaying(!playing));
$('#step').addEventListener('click', () => { setPlaying(false); sim.advance(1/sim.rate); updateUI(); draw(); });
$('#restart').addEventListener('click', () => { sim.restart(); updateUI(); draw(); notice('Demonstration restarted.'); });
$('#speed').value = rates.indexOf(sim.rate);
function updateSpeedLabel() { $('#speed-value').innerHTML = `${sim.rate} <small>${sim.rate === 1 ? 'bit' : 'bits'}/s per channel</small>`; }
updateSpeedLabel();
$('#speed').addEventListener('input', event => { sim.setRate(rates[Number(event.target.value)]); updateSpeedLabel(); updateUI(); persist(); });
$('#add-channel').addEventListener('click', () => {
  const palette = [590, 490, 410, 650, 550, 700, 380, 1550];
  const wavelength = palette.find(nm => !sim.channels.some(c => c.active && c.wavelength === nm)) ?? 380 + Math.floor(Math.random()*400);
  const ch = sim.add('', wavelength); syncStructure(); updateUI(); persist();
  senderNodes.get(ch.id).querySelector('textarea').focus();
});
function updateExpanded() {
  $('#components').hidden = !expanded;
  $('#expand').setAttribute('aria-expanded', String(expanded));
  $('#expand').innerHTML = `${expanded ? 'Combined view' : 'Separate view'} <span aria-hidden="true">${expanded ? '−' : '＋'}</span>`;
}
$('#expand').addEventListener('click', () => { expanded = !expanded; updateExpanded(); persist(); draw(); });
updateExpanded();
$('#false-color').checked = falseColor;
$('#false-color').addEventListener('change', event => { falseColor = event.target.checked; persist(); draw(); });
$('#about-open').addEventListener('click', () => $('#about').showModal());
$('#about').addEventListener('click', event => { if (event.target === $('#about')) { const rect = $('#about').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('#about').close(); } });
$('#reset-defaults').addEventListener('click', () => {
  $('#reset-dialog').showModal();
});
$('#reset-cancel').addEventListener('click', () => $('#reset-dialog').close());
$('#reset-confirm').addEventListener('click', () => {
  $('#reset-dialog').close();
  sim.channels = []; sim.nextId = 1; defaults.forEach(c => sim.add(c.text, c.wavelength)); sim.setRate(1); sim.restart();
  senderNodes.forEach(n => n.remove()); senderNodes.clear();
  receiverNodes.forEach(n => n.remove()); receiverNodes.clear();
  laneNodes.forEach(n => n.remove()); laneNodes.clear(); structure = '!';
  $('#speed').value = 0; updateSpeedLabel(); syncStructure(); updateUI(); persist(); draw();
});
document.addEventListener('visibilitychange', () => { lastFrame = null; });

function canvasContext(canvas) {
  const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w*dpr) || canvas.height !== Math.round(h*dpr)) { canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr); }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0,0,w,h);
  return { ctx, w, h };
}
function line(ctx, x1,y1,x2,y2,color,width=1) {
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function rounded(ctx,x,y,w,h,r,fill,stroke) {
  ctx.beginPath(); ctx.roundRect(x,y,w,h,r); if(fill){ctx.fillStyle=fill;ctx.fill();} if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
}
function label(ctx,text,x,y,color='#8294ac',size=10,align='center') {
  ctx.font=`${size}px "Cascadia Code", Consolas, monospace`; ctx.textAlign=align; ctx.fillStyle=color;ctx.fillText(text,x,y);
}
function mixedAt(emittedTime) {
  const pulses = sim.channels.map(ch => sim.signalAt(ch, emittedTime)).filter(p => p?.bit === 1);
  return { ...displayColor(sumXYZ(pulses.map(p => xyzFor(p.wavelength)))), count: pulses.filter(p => falseColor || !isInvisible(p.wavelength)).length };
}
function draw() {
  const {ctx,w,h} = canvasContext($('#fiber')); if(!w || !h) return;
  const centerY = h*.49;
  const boxW = Math.max(35, Math.min(48, w*.105));
  const muxX = w*.18, demuxX = w*.82;
  const startX = muxX + boxW/2, endX = demuxX-boxW/2, length=endX-startX;
  const n = sim.channels.length;
  label(ctx,'MULTIPLEX',muxX,centerY-49,'#5d728c',8);
  label(ctx,'DEMULTIPLEX',demuxX,centerY-49,'#5d728c',8);
  for(let i=0;i<n;i++) {
    const ch = sim.channels[i];
    const anchorY = n===1 ? centerY : 70 + i * (h-145)/Math.max(1,n-1);
    const col = colorFor(ch.wavelength).hex;
    const latest = sim.signalAt(ch, sim.time), arrived = sim.signalAt(ch, sim.time-sim.transit);
    const path = (reverse,bright) => {
      ctx.beginPath();
      if(!reverse) {ctx.moveTo(0,anchorY);ctx.bezierCurveTo(muxX*.65,anchorY,muxX*.45,centerY,muxX-boxW/2,centerY);}
      else {ctx.moveTo(demuxX+boxW/2,centerY);ctx.bezierCurveTo(w-(muxX*.45),centerY,w-(muxX*.65),anchorY,w,anchorY);}
      ctx.strokeStyle=bright ? displayColor(xyzFor((reverse ? arrived : latest).wavelength)).hex : '#334358';
      ctx.globalAlpha=bright? .85 : .5;ctx.lineWidth=bright?2:1;ctx.stroke();ctx.globalAlpha=1;
    };
    path(false,!!latest?.bit);path(true,!!arrived?.bit);
    if(n <= 12) {
      label(ctx,String(ch.id).padStart(2,'0'),12,anchorY-8,col,8,'left');
      label(ctx,arrived ? String(arrived.bit) : '·',w-12,anchorY-8,arrived?.bit?col:'#536a85',10,'right');
    }
  }
  rounded(ctx,startX,centerY-13,length,26,13,'#090f19','#2b3a4f');
  const sampleCount=Math.max(1,Math.round(length/3));
  const step=length/sampleCount;
  // A slice at position x represents what was emitted transit*x seconds ago.
  for(let i=0;i<sampleCount;i++) {
    const fraction=(i+.5)/sampleCount;
    const mix=mixedAt(sim.time-fraction*sim.transit);
    if(mix.brightness===0) continue;
    ctx.fillStyle=mix.hex;ctx.globalAlpha=.055;ctx.fillRect(startX+i*step,centerY-25,step+0.5,50);
    ctx.globalAlpha=.12;ctx.fillRect(startX+i*step,centerY-13,step+0.5,26);
    ctx.globalAlpha=1;ctx.fillRect(startX+i*step,centerY-3.5,step+0.5,7);
  }
  ctx.globalAlpha=1;
  // Empty slots and sequence boundaries remain visible without inventing light for zeros.
  const unique=new Map();
  for(const ch of sim.channels) for(const p of ch.pulses) {
    const f=(sim.time-p.sentAt)/sim.transit;
    if(f>=0 && f<=1) {const key=p.sentAt.toFixed(7);const old=unique.get(key);unique.set(key,{f,start:p.start||old?.start});}
  }
  if(unique.size<=45) for(const {f,start} of unique.values()) {
    const x=startX+f*length;
    line(ctx,x,centerY-8,x,centerY+8,start?'#b9c9db99':'#59718d50',1);
    if(start && unique.size<14) {ctx.beginPath();ctx.moveTo(x-2,centerY-19);ctx.lineTo(x+2,centerY-19);ctx.lineTo(x,centerY-15);ctx.fillStyle='#a9bbce';ctx.fill();}
  }
  const probeX=(startX+endX)/2;
  line(ctx,probeX,centerY+19,probeX,centerY+45,'#5b6f88',1);
  ctx.beginPath();ctx.arc(probeX,centerY+48,2,0,Math.PI*2);ctx.fillStyle='#8ba2ba';ctx.fill();
  label(ctx,'MIDPOINT',probeX,centerY+66,'#6c829b',8);
  label(ctx,'4 SECOND JOURNEY →',w/2,centerY-74,'#7a8da4',9);
  for(const [x,text] of [[muxX,'MUX'],[demuxX,'DEMUX']]) {
    rounded(ctx,x-boxW/2,centerY-31,boxW,62,8,'#182432','#40516a');
    rounded(ctx,x-boxW/2+5,centerY-25,boxW-10,50,5,null,'#25364b');
    label(ctx,text,x,centerY+3,'#c5d4e5',text==='MUX'?11:9);
    for(let j=-1;j<=1;j++) {ctx.fillStyle='#6a7d96';ctx.fillRect(x+j*5-1,centerY+17,2,2);}
  }
  if(!n) label(ctx,'Add a channel to fill the fiber.',w/2,centerY+106,'#879bb2',10);
  else label(ctx,'Separate wavelengths. Simultaneous journeys.',w/2,h-58,'#576b84',9);
  const probe=mixedAt(sim.time-sim.transit/2);
  $('#probe-swatch').style.background=probe.hex;
  $('#probe-color').textContent=probe.hex.toUpperCase();
  $('#probe-active').textContent=probe.count ? `${probe.count} wavelength${probe.count===1?'':'s'} on` : 'No active light';
  if(expanded) for(const ch of sim.channels) {
    const {ctx:lc,w:lw,h:lh}=canvasContext(laneNodes.get(ch.id).querySelector('canvas'));
    rounded(lc,0,lh/2-3,lw,6,3,'#0a111c','#26364a');
    for(const p of ch.pulses) {
      const right=(sim.time-p.sentAt)/sim.transit*lw;
      const left=(sim.time-p.sentAt-p.duration)/sim.transit*lw;
      const x=Math.max(0,left), end=Math.min(lw,right);
      if(end<=x) continue;
      const color=p.bit?displayColor(xyzFor(p.wavelength)).hex:'#334459';
      rounded(lc,x,lh/2-5,Math.max(1,end-x-1),10,2,p.bit?color:'#111c29',p.bit?null:color);
      if(end-x>12) label(lc,String(p.bit),(x+end)/2,lh/2+3,p.bit?'#09111c':'#a6b6ca',8);
      if(p.start && right>=0 && right<=lw) line(lc,right,1,right,lh-1,'#d2e0ef',1);
    }
  }
}

function frame(timestamp) {
  if(lastFrame !== null && playing && !document.hidden) sim.advance(Math.max(0,(timestamp-lastFrame)/1000));
  lastFrame = timestamp;
  if(timestamp-lastUI>65) {updateUI();lastUI=timestamp;}
  draw();
  requestAnimationFrame(frame);
}
syncStructure();updateUI();draw();
requestAnimationFrame(frame);

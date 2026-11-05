// CIE 1931 2° data: CIE (2019), DOI 10.25039/CIE.DS.xvudnb9b.
// The bundled data and its JS representation are CC BY-SA 4.0; see data/README.md.
import { CMF } from './data/cie1931.js';

export function wavelengthXYZ(nm) {
  if (!Number.isFinite(nm) || nm < 360 || nm > 830) return [0, 0, 0];
  const index = nm - 360, low = Math.floor(index), f = index - low;
  return CMF[low].map((v, c) => v + ((CMF[Math.min(low + 1, 470)][c]) - v) * f);
}

export function linearRGB(xyz) {
  const [x, y, z] = xyz;
  return [3.24096994*x - 1.53738318*y - 0.49861076*z,
    -0.96924364*x + 1.87596750*y + 0.04155506*z,
    0.05563008*x - 0.20397696*y + 1.05697151*z];
}

export function rgbXYZ([r, g, b]) {
  return [0.4123908*r + 0.3575843*g + 0.1804808*b,
    0.2126390*r + 0.7151687*g + 0.0721923*b,
    0.0193308*r + 0.1191948*g + 0.9505322*b];
}

export const isInvisible = nm => nm < 380 || nm > 780;
export function signalXYZ(nm, falseColor = false) {
  // A declared visualization convention, not a claim of a sharp physiological cutoff.
  if (isInvisible(nm)) return falseColor
    ? rgbXYZ(nm < 380 ? [0.38, 0.04, 1] : [1, 0.12, 0.025])
    : [0, 0, 0];
  return wavelengthXYZ(nm);
}

export function sumXYZ(values) {
  return values.reduce((sum, xyz) => sum.map((v, i) => v + xyz[i]), [0, 0, 0]);
}

export function displayColor(xyz, exposure = 0.62) {
  // Sum in XYZ BEFORE display conversion. Fixed exposure; no per-frame normalization.
  // Negative primaries are clipped; a common highlight scale preserves positive RGB ratios.
  const raw = linearRGB(xyz).map(v => v * exposure);
  const scale = Math.max(1, ...raw);
  const rgb = raw.map(v => Math.max(0, v) / scale).map(v =>
    Math.round(255 * (v <= 0.0031308 ? 12.92*v : 1.055*v**(1/2.4) - 0.055)));
  return { rgb, hex: '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join(''),
    mapped: raw.some(v => v < -0.00001 || v > 1), brightness: Math.max(...rgb)/255 };
}

export function swatch(nm) {
  return displayColor(signalXYZ(nm, true));
}

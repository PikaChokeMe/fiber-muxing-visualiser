import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { wavelengthXYZ, sumXYZ, linearRGB, displayColor, signalXYZ } from '../color.js';

test('official CIE dataset matches published MD5 checksum', () => {
  const data=readFileSync(new URL('../data/CIE_xyz_1931_2deg.csv',import.meta.url));
  assert.equal(createHash('md5').update(data).digest('hex'),'17cca777db64b17170f06f67ce9d3ab7');
});
test('1 nm data and interpolation preserve different nearby wavelengths', () => {
  assert.equal(wavelengthXYZ(555)[1],1);
  assert.notDeepEqual(wavelengthXYZ(600),wavelengthXYZ(601));
  assert.deepEqual(wavelengthXYZ(600.5), wavelengthXYZ(600).map((v,i)=>(v+wavelengthXYZ(601)[i])/2));
});
test('mixtures are additive in XYZ and independent of channel order', () => {
  const red=wavelengthXYZ(630),blue=wavelengthXYZ(460);
  assert.deepEqual(sumXYZ([red,blue]),sumXYZ([blue,red]));
  const one=linearRGB(red),two=linearRGB(sumXYZ([red,red]));
  two.forEach((v,i)=>assert.ok(Math.abs(v-2*one[i])<1e-10));
  assert.equal(displayColor([0,0,0]).hex,'#000000');
  const mix=displayColor(sumXYZ([red,blue]));
  assert.ok(mix.rgb[0]>mix.rgb[1] && mix.rgb[2]>mix.rgb[1]);
});
test('invisible channels are dark unless explicitly false-colored', () => {
  assert.deepEqual(signalXYZ(1550,false),[0,0,0]);
  assert.deepEqual(signalXYZ(300,false),[0,0,0]);
  assert.notEqual(displayColor(signalXYZ(1550,true)).hex,'#000000');
});

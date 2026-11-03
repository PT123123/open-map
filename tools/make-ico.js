// 生成 Windows .ico 图标（PNG-in-ICO，256x256，Vista+ 支持）
'use strict';
const fs = require('fs');
const zlib = require('zlib');

// ---------- PNG 编码（与 make-icons.js 相同实现） ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngEncode(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 绘制（青绿渐变 + 白色定位针，与 app 图标一致） ----------
function lerp(a, b, t) { return a + (b - a) * t; }
function inPin(x, y) {
  const dx = x - 256, dy = y - 205;
  const d2 = dx * dx + dy * dy;
  if (d2 <= 82 * 82) return d2 > 36 * 36;
  if (y >= 245 && y <= 400) return Math.abs(dx) <= 68 * (400 - y) / 155;
  return false;
}
function render(size) {
  const s = size / 512;
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const t = py / size;
      let r = lerp(0x14, 0x0f, t), g = lerp(0xb8, 0x76, t), b = lerp(0xa6, 0x6e, t);
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          if (inPin((px + (sx + 0.5) / SS) / s, (py + (sy + 0.5) / SS) / s)) hit++;
        }
      }
      const a = hit / (SS * SS);
      r = lerp(r, 255, a); g = lerp(g, 255, a); b = lerp(b, 255, a);
      const i = (py * size + px) * 4;
      rgba[i] = Math.round(r); rgba[i + 1] = Math.round(g); rgba[i + 2] = Math.round(b); rgba[i + 3] = 255;
    }
  }
  return pngEncode(size, size, rgba);
}

// ---------- ICO 封装 ----------
const SIZE = 256;
const png = render(SIZE);
const ico = Buffer.alloc(6 + 16 + png.length);
ico.writeUInt16LE(0, 0);           // reserved
ico.writeUInt16LE(1, 2);           // type: icon
ico.writeUInt16LE(1, 4);           // count
ico[6] = 0;                        // width (0 = 256)
ico[7] = 0;                        // height
ico[8] = 0;                        // colors
ico[9] = 0;                        // reserved
ico.writeUInt16LE(1, 10);          // planes
ico.writeUInt16LE(32, 12);         // bpp
ico.writeUInt32LE(png.length, 14); // bytes in resource
ico.writeUInt32LE(22, 18);         // offset
png.copy(ico, 22);

fs.writeFileSync('C:/Users/ted/Desktop/map/lanpub/map.ico', ico);
console.log('OK map.ico', (ico.length / 1024).toFixed(1) + 'KB');

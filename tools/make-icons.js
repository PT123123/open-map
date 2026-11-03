// 生成应用图标 PNG（纯 Node，无第三方依赖）
// 图案：青绿渐变背景 + 白色地图定位针
'use strict';
const fs = require('fs');
const zlib = require('zlib');

// ---------- PNG 编码 ----------
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
    raw[y * stride] = 0; // filter: none
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
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 绘制 ----------
function lerp(a, b, t) { return a + (b - a) * t; }

// 512 设计稿坐标
function inPin(x, y) {
  const dx = x - 256, dy = y - 205;
  const d2 = dx * dx + dy * dy;
  if (d2 <= 82 * 82) return d2 > 36 * 36;          // 圆环（中空圆孔）
  if (y >= 245 && y <= 400) {                       // 尾部圆锥
    const half = 68 * (400 - y) / 155;
    return Math.abs(dx) <= half;
  }
  return false;
}

function render(size) {
  const s = size / 512;
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3; // 3x3 超采样抗锯齿
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // 背景：垂直渐变 #14b8a6 -> #0f766e
      const t = py / size;
      let r = lerp(0x14, 0x0f, t), g = lerp(0xb8, 0x76, t), b = lerp(0xa6, 0x6e, t);

      // 定位针（超采样）
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / s;
          const y = (py + (sy + 0.5) / SS) / s;
          if (inPin(x, y)) hit++;
        }
      }
      const a = hit / (SS * SS);
      r = lerp(r, 255, a); g = lerp(g, 255, a); b = lerp(b, 255, a);

      const i = (py * size + px) * 4;
      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = 255;
    }
  }
  return pngEncode(size, size, rgba);
}

const OUT = {
  'C:/Users/ted/Desktop/map/desktop/icon.png': 512,
  'C:/Users/ted/Desktop/map/mobile/icons/icon-512.png': 512,
  'C:/Users/ted/Desktop/map/mobile/icons/icon-192.png': 192,
  'C:/Users/ted/Desktop/map/mobile/icons/apple-touch-icon.png': 180,
  'C:/Users/ted/Desktop/map/web/favicon.png': 64,
};

for (const [file, size] of Object.entries(OUT)) {
  const buf = render(size);
  fs.writeFileSync(file, buf);
  console.log('OK', file, size + 'x' + size, (buf.length / 1024).toFixed(1) + 'KB');
}
console.log('全部图标生成完成');

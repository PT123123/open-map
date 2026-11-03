// 修复 Windows 版 aapt2 的 bug：zip 条目名中的 "\" 改回 "/"
// 名字等长替换，zip 所有偏移不变；在 zipalign/apksigner 之前执行
'use strict';
const fs = require('fs');

const apk = process.argv[2];
if (!apk) { console.error('用法: node fix-asset-paths.js <apk路径>'); process.exit(1); }
const buf = fs.readFileSync(apk);

// 定位 End of Central Directory
let eocd = -1;
for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
  if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) throw new Error('未找到 EOCD');

const cdOffset = buf.readUInt32LE(eocd + 16);
const entries = buf.readUInt16LE(eocd + 10);
let p = cdOffset;
let fixed = 0;

for (let i = 0; i < entries; i++) {
  if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('中央目录损坏 @' + p);
  const nameLen = buf.readUInt16LE(p + 28);
  const extraLen = buf.readUInt16LE(p + 30);
  const commentLen = buf.readUInt16LE(p + 32);
  const localOff = buf.readUInt32LE(p + 42);
  const nameStart = p + 46;

  let hasBackslash = false;
  for (let j = 0; j < nameLen; j++) if (buf[nameStart + j] === 0x5c) { hasBackslash = true; break; }
  if (hasBackslash) {
    // 中央目录中的条目名
    for (let j = 0; j < nameLen; j++) if (buf[nameStart + j] === 0x5c) buf[nameStart + j] = 0x2f;
    // 对应的本地文件头中的条目名
    if (buf.readUInt32LE(localOff) === 0x04034b50) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lNameStart = localOff + 30;
      for (let j = 0; j < lNameLen; j++) if (buf[lNameStart + j] === 0x5c) buf[lNameStart + j] = 0x2f;
    }
    fixed++;
  }
  p = nameStart + nameLen + extraLen + commentLen;
}

fs.writeFileSync(apk, buf);
console.log('已修复 ' + fixed + ' 个条目的路径分隔符（共 ' + entries + ' 条）');

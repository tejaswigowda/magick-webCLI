/*
 * zip-writer.js
 * Minimal dependency-free ZIP writer (STORE method only, no compression).
 * Good enough for bundling already-compressed images (PNG/JPEG/WebP/...)
 * into a single "Download All" archive entirely client-side.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() >> 1) & 0x1F);
  const day = (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0xF) << 5) | (date.getDate() & 0x1F);
  return { time, day };
}

function writeUint32LE(view, offset, value) { view.setUint32(offset, value, true); }
function writeUint16LE(view, offset, value) { view.setUint16(offset, value, true); }

/**
 * @param {{name: string, bytes: Uint8Array}[]} entries
 * @returns {Blob} a application/zip blob
 */
export function createZip(entries) {
  const encoder = new TextEncoder();
  const { time, day } = dosDateTime();
  const chunks = [];
  const centralRecords = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.bytes;
    const crc = crc32(data);

    const localHeader = new ArrayBuffer(30);
    const lv = new DataView(localHeader);
    writeUint32LE(lv, 0, 0x04034b50);
    writeUint16LE(lv, 4, 20);
    writeUint16LE(lv, 6, 0);
    writeUint16LE(lv, 8, 0); // STORE
    writeUint16LE(lv, 10, time);
    writeUint16LE(lv, 12, day);
    writeUint32LE(lv, 14, crc);
    writeUint32LE(lv, 18, data.length);
    writeUint32LE(lv, 22, data.length);
    writeUint16LE(lv, 26, nameBytes.length);
    writeUint16LE(lv, 28, 0);

    chunks.push(new Uint8Array(localHeader), nameBytes, data);

    centralRecords.push({ nameBytes, crc, size: data.length, offset, time, day });
    offset += 30 + nameBytes.length + data.length;
  }

  const centralStart = offset;
  for (const rec of centralRecords) {
    const central = new ArrayBuffer(46);
    const cv = new DataView(central);
    writeUint32LE(cv, 0, 0x02014b50);
    writeUint16LE(cv, 4, 20);
    writeUint16LE(cv, 6, 20);
    writeUint16LE(cv, 8, 0);
    writeUint16LE(cv, 10, 0);
    writeUint16LE(cv, 12, rec.time);
    writeUint16LE(cv, 14, rec.day);
    writeUint32LE(cv, 16, rec.crc);
    writeUint32LE(cv, 20, rec.size);
    writeUint32LE(cv, 24, rec.size);
    writeUint16LE(cv, 28, rec.nameBytes.length);
    writeUint16LE(cv, 30, 0);
    writeUint16LE(cv, 32, 0);
    writeUint16LE(cv, 34, 0);
    writeUint16LE(cv, 36, 0);
    writeUint32LE(cv, 38, 0);
    writeUint32LE(cv, 42, rec.offset);

    chunks.push(new Uint8Array(central), rec.nameBytes);
    offset += 46 + rec.nameBytes.length;
  }

  const centralSize = offset - centralStart;
  const end = new ArrayBuffer(22);
  const ev = new DataView(end);
  writeUint32LE(ev, 0, 0x06054b50);
  writeUint16LE(ev, 4, 0);
  writeUint16LE(ev, 6, 0);
  writeUint16LE(ev, 8, centralRecords.length);
  writeUint16LE(ev, 10, centralRecords.length);
  writeUint32LE(ev, 12, centralSize);
  writeUint32LE(ev, 16, centralStart);
  writeUint16LE(ev, 20, 0);
  chunks.push(new Uint8Array(end));

  return new Blob(chunks, { type: 'application/zip' });
}

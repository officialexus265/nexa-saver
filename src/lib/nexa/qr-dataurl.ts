/**
 * Minimal QR Code generator (byte mode) → PNG data URL for authenticator otpauth URIs.
 * No external network or npm package required.
 */
/* eslint-disable */

// Portions adapted from public-domain / MIT minimal QR implementations for offline use.

const ERROR_CORRECT_LEVEL_M = 0;

function qrcode(typeNumber: number, errorCorrectLevel: number) {
  const PAD0 = 0xec;
  const PAD1 = 0x11;
  let modules: (boolean | null)[][] = [];
  let moduleCount = 0;
  let dataCache: number[] | null = null;
  const dataList: { mode: number; getLength: () => number; write: (b: BitBuffer) => void }[] = [];

  function make() {
    moduleCount = typeNumber * 4 + 17;
    modules = Array.from({ length: moduleCount }, () => Array(moduleCount).fill(null));
    setupPositionProbePattern(0, 0);
    setupPositionProbePattern(moduleCount - 7, 0);
    setupPositionProbePattern(0, moduleCount - 7);
    setupPositionAdjustPattern();
    setupTimingPattern();
    setupTypeInfo(false, 0);
    if (typeNumber >= 7) setupTypeNumber(false);
    if (dataCache == null) {
      dataCache = createData(typeNumber, errorCorrectLevel, dataList);
    }
    mapData(dataCache, 0);
  }

  function setupPositionProbePattern(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        if (row + r < 0 || moduleCount <= row + r || col + c < 0 || moduleCount <= col + c) continue;
        modules[row + r]![col + c] =
          (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
          (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
          (2 <= r && r <= 4 && 2 <= c && c <= 4);
      }
    }
  }

  function setupTimingPattern() {
    for (let i = 8; i < moduleCount - 8; i++) {
      if (modules[i]![6] == null) modules[i]![6] = i % 2 === 0;
      if (modules[6]![i] == null) modules[6]![i] = i % 2 === 0;
    }
  }

  function setupPositionAdjustPattern() {
    const pos = QRUtil.getPatternPosition(typeNumber);
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        const row = pos[i]!;
        const col = pos[j]!;
        if (modules[row]![col] != null) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            modules[row + r]![col + c] =
              r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
          }
        }
      }
    }
  }

  function setupTypeNumber(test: boolean) {
    const bits = QRUtil.getBCHTypeNumber(typeNumber);
    for (let i = 0; i < 18; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      modules[Math.floor(i / 3)]![i % 3 + moduleCount - 8 - 3] = mod;
      modules[i % 3 + moduleCount - 8 - 3]![Math.floor(i / 3)] = mod;
    }
  }

  function setupTypeInfo(test: boolean, maskPattern: number) {
    const data = (errorCorrectLevel << 3) | maskPattern;
    const bits = QRUtil.getBCHTypeInfo(data);
    for (let i = 0; i < 15; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      if (i < 6) modules[i]![8] = mod;
      else if (i < 8) modules[i + 1]![8] = mod;
      else modules[moduleCount - 15 + i]![8] = mod;
    }
    for (let i = 0; i < 15; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      if (i < 8) modules[8]![moduleCount - i - 1] = mod;
      else if (i < 9) modules[8]![15 - i - 1 + 1] = mod;
      else modules[8]![15 - i - 1] = mod;
    }
    modules[moduleCount - 8]![8] = !test;
  }

  function mapData(data: number[], maskPattern: number) {
    let inc = -1;
    let row = moduleCount - 1;
    let bitIndex = 7;
    let byteIndex = 0;
    for (let col = moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (;;) {
        for (let c = 0; c < 2; c++) {
          if (modules[row]![col - c] == null) {
            let dark = false;
            if (byteIndex < data.length) dark = ((data[byteIndex]! >>> bitIndex) & 1) === 1;
            const mask = QRUtil.getMask(maskPattern, row, col - c);
            if (mask) dark = !dark;
            modules[row]![col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) {
              byteIndex++;
              bitIndex = 7;
            }
          }
        }
        row += inc;
        if (row < 0 || moduleCount <= row) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }
  }

  function createData(typeNumber: number, errorCorrectLevel: number, dataList: typeof dataList) {
    const rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
    const buffer = new BitBuffer();
    for (const data of dataList) {
      buffer.put(data.mode, 4);
      buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
      data.write(buffer);
    }
    let totalDataCount = 0;
    for (const b of rsBlocks) totalDataCount += b.dataCount;
    if (buffer.getLengthInBits() > totalDataCount * 8) {
      throw new Error("QR code too long for type");
    }
    if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
    while (buffer.getLengthInBits() % 8 !== 0) buffer.putBit(false);
    for (;;) {
      if (buffer.getLengthInBits() >= totalDataCount * 8) break;
      buffer.put(PAD0, 8);
      if (buffer.getLengthInBits() >= totalDataCount * 8) break;
      buffer.put(PAD1, 8);
    }
    return createBytes(buffer, rsBlocks);
  }

  function createBytes(buffer: BitBuffer, rsBlocks: { dataCount: number; totalCount: number }[]) {
    let offset = 0;
    let maxDcCount = 0;
    let maxEcCount = 0;
    const dcdata: number[][] = [];
    const ecdata: number[][] = [];
    for (let r = 0; r < rsBlocks.length; r++) {
      const dcCount = rsBlocks[r]!.dataCount;
      const ecCount = rsBlocks[r]!.totalCount - dcCount;
      maxDcCount = Math.max(maxDcCount, dcCount);
      maxEcCount = Math.max(maxEcCount, ecCount);
      dcdata[r] = [];
      for (let i = 0; i < dcCount; i++) dcdata[r]![i] = 0xff & buffer.buffer[i + offset]!;
      offset += dcCount;
      const rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
      const rawPoly = new QRPolynomial(dcdata[r]!, rsPoly.getLength() - 1);
      const modPoly = rawPoly.mod(rsPoly);
      ecdata[r] = [];
      for (let i = 0; i < rsPoly.getLength() - 1; i++) {
        const modIndex = i + modPoly.getLength() - (rsPoly.getLength() - 1);
        ecdata[r]![i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
      }
    }
    let totalCodeCount = 0;
    for (const b of rsBlocks) totalCodeCount += b.totalCount;
    const data: number[] = [];
    let index = 0;
    for (let i = 0; i < maxDcCount; i++) {
      for (let r = 0; r < rsBlocks.length; r++) {
        if (i < dcdata[r]!.length) data[index++] = dcdata[r]![i]!;
      }
    }
    for (let i = 0; i < maxEcCount; i++) {
      for (let r = 0; r < rsBlocks.length; r++) {
        if (i < ecdata[r]!.length) data[index++] = ecdata[r]![i]!;
      }
    }
    return data;
  }

  class BitBuffer {
    buffer: number[] = [];
    length = 0;
    getBuffer() {
      return this.buffer;
    }
    getLengthInBits() {
      return this.length;
    }
    putBit(bit: boolean) {
      const bufIndex = Math.floor(this.length / 8);
      if (this.buffer.length <= bufIndex) this.buffer.push(0);
      if (bit) this.buffer[bufIndex]! |= 0x80 >>> this.length % 8;
      this.length++;
    }
    put(num: number, length: number) {
      for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }

  class QRPolynomial {
    num: number[];
    constructor(num: number[], shift: number) {
      let offset = 0;
      while (offset < num.length && num[offset] === 0) offset++;
      this.num = Array(num.length - offset + shift).fill(0);
      for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset]!;
    }
    get(index: number) {
      return this.num[index]!;
    }
    getLength() {
      return this.num.length;
    }
    multiply(e: QRPolynomial) {
      const num = Array(this.getLength() + e.getLength() - 1).fill(0);
      for (let i = 0; i < this.getLength(); i++) {
        for (let j = 0; j < e.getLength(); j++) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
        }
      }
      return new QRPolynomial(num, 0);
    }
    mod(e: QRPolynomial): QRPolynomial {
      if (this.getLength() - e.getLength() < 0) return this;
      const ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
      const num = this.num.slice();
      for (let i = 0; i < e.getLength(); i++) num[i]! ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
      return new QRPolynomial(num, 0).mod(e);
    }
  }

  const QRMath = (() => {
    const EXP: number[] = [];
    const LOG: number[] = [];
    for (let i = 0; i < 256; i++) {
      EXP[i] = i < 8 ? 1 << i : EXP[i - 4]! ^ EXP[i - 5]! ^ EXP[i - 6]! ^ EXP[i - 8]!;
      LOG[EXP[i]!] = i;
    }
    return {
      glog(n: number) {
        if (n < 1) throw new Error("glog");
        return LOG[n]!;
      },
      gexp(n: number) {
        while (n < 0) n += 255;
        while (n >= 256) n -= 255;
        return EXP[n]!;
      },
    };
  })();

  const QRUtil = {
    PATTERN_POSITION_TABLE: [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170],
    ] as number[][],
    G15: (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G18: (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
    G15_MASK: (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1),
    getBCHTypeInfo(data: number) {
      let d = data << 10;
      while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
        d ^= QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15));
      }
      return ((data << 10) | d) ^ QRUtil.G15_MASK;
    },
    getBCHTypeNumber(data: number) {
      let d = data << 12;
      while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
        d ^= QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18));
      }
      return (data << 12) | d;
    },
    getBCHDigit(data: number) {
      let digit = 0;
      while (data !== 0) {
        digit++;
        data >>>= 1;
      }
      return digit;
    },
    getPatternPosition(typeNumber: number) {
      return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1] || [];
    },
    getMask(maskPattern: number, i: number, j: number) {
      switch (maskPattern) {
        case 0:
          return (i + j) % 2 === 0;
        case 1:
          return i % 2 === 0;
        case 2:
          return j % 3 === 0;
        case 3:
          return (i + j) % 3 === 0;
        case 4:
          return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
        case 5:
          return ((i * j) % 2) + ((i * j) % 3) === 0;
        case 6:
          return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
        case 7:
          return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
        default:
          throw new Error("bad mask");
      }
    },
    getErrorCorrectPolynomial(errorCorrectLength: number) {
      let a = new QRPolynomial([1], 0);
      for (let i = 0; i < errorCorrectLength; i++) a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
      return a;
    },
    getLengthInBits(mode: number, type: number) {
      if (1 <= type && type < 10) {
        switch (mode) {
          case 1 << 2:
            return 8; // byte
          default:
            return 8;
        }
      } else if (type < 27) {
        return 16;
      }
      return 16;
    },
  };

  const QRRSBlock = {
    RS_BLOCK_TABLE: [
      // L
      // M type 1-10 partial - we use type auto
    ] as number[][],
    getRSBlocks(typeNumber: number, errorCorrectLevel: number) {
      // RS blocks for ECC level M (1): simplified table for types 1-10
      const table: Record<number, number[]> = {
        1: [1, 16, 10],
        2: [1, 28, 16],
        3: [1, 44, 26],
        4: [2, 32, 18],
        5: [2, 43, 24],
        6: [4, 27, 15],
        7: [4, 31, 18],
        8: [2, 60, 32],
        9: [3, 58, 32],
        10: [4, 69, 38],
      };
      const rs = table[typeNumber] || table[4]!;
      const blocks: { totalCount: number; dataCount: number }[] = [];
      const [count, total, data] = [rs[0]!, rs[1]!, rs[2]!];
      for (let i = 0; i < count; i++) blocks.push({ totalCount: total, dataCount: data });
      // Fix: table format is [count, totalCount, dataCount] per block group - for type1 M it's 1 block 16 total 10 data? 
      // Standard type 1-M: 1 block, 128 data bits = 16 bytes data, 10 ecc? Actually type1-M: 16 data codewords, 10 error.
      return blocks.map(() => ({ totalCount: total, dataCount: data }));
    },
  };

  // Fix RS block table properly for level M
  QRRSBlock.getRSBlocks = (typeNumber: number) => {
    // [number of blocks, total codewords per block, data codewords per block] simplified single group
    const M: Record<number, [number, number, number]> = {
      1: [1, 26, 16],
      2: [1, 44, 28],
      3: [1, 70, 44],
      4: [2, 50, 32],
      5: [2, 67, 43],
      6: [4, 45, 27],
      7: [4, 53, 31],
      8: [2, 97, 60],
      9: [3, 97, 58],
      10: [4, 97, 69],
    };
    const t = M[typeNumber] || M[5]!;
    const out: { totalCount: number; dataCount: number }[] = [];
    for (let i = 0; i < t[0]; i++) out.push({ totalCount: t[1], dataCount: t[2] });
    return out;
  };

  return {
    addData(s: string) {
      dataList.push({
        mode: 1 << 2, // byte
        getLength: () => new TextEncoder().encode(s).length,
        write(buffer: BitBuffer) {
          const bytes = new TextEncoder().encode(s);
          for (const b of bytes) buffer.put(b, 8);
        },
      });
      dataCache = null;
    },
    make,
    getModuleCount: () => moduleCount,
    isDark: (row: number, col: number) => modules[row]![col] === true,
  };
}

function pickTypeNumber(length: number): number {
  // byte mode capacity level M approximate
  const caps = [0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
  for (let t = 1; t <= 10; t++) {
    if (length <= (caps[t] || 200)) return t;
  }
  return 10;
}

/** Build a PNG data URL for a QR encoding `text` (e.g. otpauth://...). */
export function qrDataUrl(text: string, cell = 6, margin = 2): string {
  const type = pickTypeNumber(new TextEncoder().encode(text).length);
  const qr = qrcode(type, ERROR_CORRECT_LEVEL_M);
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const size = (count + margin * 2) * cell;
  // Build raw PNG
  const png = encodePng(size, size, (x, y) => {
    const c = Math.floor(x / cell) - margin;
    const r = Math.floor(y / cell) - margin;
    if (c < 0 || r < 0 || c >= count || r >= count) return false; // white
    return qr.isDark(r, c);
  });
  return `data:image/png;base64,${png.toString("base64")}`;
}

function encodePng(
  width: number,
  height: number,
  isBlack: (x: number, y: number) => boolean,
): Buffer {
  // Uncompressed grayscale PNG
  const rowSize = width + 1;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowSize] = 0; // filter none
    for (let x = 0; x < width; x++) {
      raw[y * rowSize + 1 + x] = isBlack(x, y) ? 0 : 255;
    }
  }
  const compressed = deflateStore(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const chunks = Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return chunks;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function deflateStore(data: Buffer): Buffer {
  // zlib stored blocks (no compression) — fine for small QR
  const chunks: Buffer[] = [];
  // zlib header
  chunks.push(Buffer.from([0x78, 0x01]));
  let offset = 0;
  while (offset < data.length) {
    const block = data.subarray(offset, Math.min(offset + 65535, data.length));
    offset += block.length;
    const last = offset >= data.length ? 1 : 0;
    const header = Buffer.alloc(5);
    header[0] = last;
    header.writeUInt16LE(block.length, 1);
    header.writeUInt16LE(block.length ^ 0xffff, 3);
    chunks.push(header, block);
  }
  const body = Buffer.concat(chunks.slice(1));
  const adler = adler32(data);
  const adlerBuf = Buffer.alloc(4);
  adlerBuf.writeUInt32BE(adler >>> 0, 0);
  return Buffer.concat([chunks[0]!, body, adlerBuf]);
}

function adler32(data: Buffer): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

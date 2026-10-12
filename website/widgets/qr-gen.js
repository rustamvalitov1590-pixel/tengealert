// TengeAlert Zero-Dependency QR Code Generator
// ISO/IEC 18004 QR Code Model 2 (Byte Mode, Error Correction Level M)
// 100% Offline, Pure Vanilla JS, No external CDN or npm packages required.

(function(global) {
  'use strict';

  // Galois Field GF(256) math
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    EXP[i + 255] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x & 128 ? 0x11d : 0);
  }

  function gfMul(x, y) {
    if (x === 0 || y === 0) return 0;
    return EXP[LOG[x] + LOG[y]];
  }

  function rsGenPoly(n) {
    let poly = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= gfMul(poly[j], EXP[i]);
        next[j + 1] ^= poly[j];
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, nEC) {
    const gen = rsGenPoly(nEC);
    const res = new Uint8Array(data.length + nEC);
    res.set(data);
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          res[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return res.slice(data.length);
  }

  // Version specs for Level M:
  const VERSIONS_M = [
    null,
    { ver: 1, size: 21, totalCW: 26, ecCW: 10, blocks: 1, align: [] },
    { ver: 2, size: 25, totalCW: 44, ecCW: 16, blocks: 1, align: [6, 18] },
    { ver: 3, size: 29, totalCW: 70, ecCW: 26, blocks: 1, align: [6, 22] },
    { ver: 4, size: 33, totalCW: 100, ecCW: 18, blocks: 2, align: [6, 26] },
    { ver: 5, size: 37, totalCW: 134, ecCW: 24, blocks: 2, align: [6, 30] },
    { ver: 6, size: 41, totalCW: 172, ecCW: 16, blocks: 4, align: [6, 34] },
    { ver: 7, size: 45, totalCW: 196, ecCW: 18, blocks: 4, align: [6, 22, 38] },
    { ver: 8, size: 49, totalCW: 242, ecCW: 22, blocks: 4, align: [6, 24, 42] }
  ];

  function getVersion(len) {
    for (let v = 1; v < VERSIONS_M.length; v++) {
      const info = VERSIONS_M[v];
      const dataCW = info.totalCW - (info.ecCW * info.blocks);
      if (len + 2 <= dataCW) return info;
    }
    return VERSIONS_M[VERSIONS_M.length - 1];
  }

  function encodeData(text, info) {
    const bytes = new TextEncoder().encode(text);
    const dataCW = info.totalCW - (info.ecCW * info.blocks);
    const bitBuffer = [];

    function pushBits(val, len) {
      for (let i = len - 1; i >= 0; i--) {
        bitBuffer.push((val >>> i) & 1);
      }
    }

    // Byte mode indicator: 0100
    pushBits(0b0100, 4);
    // Character count (8 bits for ver 1-9)
    pushBits(bytes.length, 8);
    // Data bytes
    for (let i = 0; i < bytes.length; i++) {
      pushBits(bytes[i], 8);
    }

    // Terminator (up to 4 zeroes)
    const maxBits = dataCW * 8;
    const termLen = Math.min(4, maxBits - bitBuffer.length);
    pushBits(0, termLen);

    // Byte align
    while (bitBuffer.length % 8 !== 0) {
      bitBuffer.push(0);
    }

    // Pad bytes 0xEC, 0x11
    const pad = [0xEC, 0x11];
    let padIdx = 0;
    while (bitBuffer.length < maxBits) {
      pushBits(pad[padIdx % 2], 8);
      padIdx++;
    }

    // Convert to bytes
    const cw = [];
    for (let i = 0; i < bitBuffer.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) {
        b = (b << 1) | bitBuffer[i + j];
      }
      cw.push(b);
    }

    // Split into blocks and compute EC
    const blockSize = Math.floor(cw.length / info.blocks);
    const dataBlocks = [];
    const ecBlocks = [];

    for (let b = 0; b < info.blocks; b++) {
      const start = b * blockSize;
      const end = (b === info.blocks - 1) ? cw.length : start + blockSize;
      const blockData = cw.slice(start, end);
      dataBlocks.push(blockData);
      ecBlocks.push(rsEncode(blockData, info.ecCW));
    }

    // Interleave
    const finalCW = [];
    const maxBlockLen = Math.max(...dataBlocks.map(b => b.length));
    for (let i = 0; i < maxBlockLen; i++) {
      for (let b = 0; b < info.blocks; b++) {
        if (i < dataBlocks[b].length) finalCW.push(dataBlocks[b][i]);
      }
    }
    for (let i = 0; i < info.ecCW; i++) {
      for (let b = 0; b < info.blocks; b++) {
        finalCW.push(ecBlocks[b][i]);
      }
    }

    return finalCW;
  }

  function createMatrix(info, codewords) {
    const size = info.size;
    const matrix = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    const reserved = Array.from({ length: size }, () => new Uint8Array(size).fill(0));

    // Finder patterns
    function addFinder(r0, c0) {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isBlack = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          matrix[r0 + r][c0 + c] = isBlack ? 1 : 0;
          reserved[r0 + r][c0 + c] = 1;
        }
      }
      // Separators
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const row = r0 + r, col = c0 + c;
          if (row >= 0 && row < size && col >= 0 && col < size) {
            reserved[row][col] = 1;
            if (matrix[row][col] === -1) matrix[row][col] = 0;
          }
        }
      }
    }

    addFinder(0, 0);
    addFinder(0, size - 7);
    addFinder(size - 7, 0);

    // Alignment patterns (for ver >= 2)
    if (info.align && info.align.length > 0) {
      const coords = info.align;
      for (const r of coords) {
        for (const c of coords) {
          if (reserved[r][c]) continue;
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const isB = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
              matrix[r + dr][c + dc] = isB ? 1 : 0;
              reserved[r + dr][c + dc] = 1;
            }
          }
        }
      }
    }

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      if (!reserved[6][i]) {
        matrix[6][i] = (i % 2 === 0) ? 1 : 0;
        reserved[6][i] = 1;
      }
      if (!reserved[i][6]) {
        matrix[i][6] = (i % 2 === 0) ? 1 : 0;
        reserved[i][6] = 1;
      }
    }

    // Dark module
    matrix[size - 8][8] = 1;
    reserved[size - 8][8] = 1;

    // Reserve format info areas
    for (let i = 0; i < 9; i++) {
      reserved[8][i] = 1;
      reserved[i][8] = 1;
    }
    for (let i = 0; i < 8; i++) {
      reserved[8][size - 1 - i] = 1;
      reserved[size - 1 - i][8] = 1;
    }

    // Place codewords zigzag
    const bitList = [];
    for (const cw of codewords) {
      for (let i = 7; i >= 0; i--) {
        bitList.push((cw >>> i) & 1);
      }
    }

    let bitIdx = 0;
    let upward = true;
    for (let right = size - 1; right > 0; right -= 2) {
      if (right === 6) right--; // Skip vertical timing column
      const cols = [right, right - 1];
      const rows = [];
      if (upward) {
        for (let r = size - 1; r >= 0; r--) rows.push(r);
      } else {
        for (let r = 0; r < size; r++) rows.push(r);
      }

      for (const r of rows) {
        for (const c of cols) {
          if (!reserved[r][c]) {
            const bit = bitIdx < bitList.length ? bitList[bitIdx++] : 0;
            // Mask 0: (row + col) % 2 === 0
            const mask = ((r + c) % 2 === 0) ? 1 : 0;
            matrix[r][c] = bit ^ mask;
          }
        }
      }
      upward = !upward;
    }

    // Format info (Level M, Mask 0): standard format bits 0x5412
    const formatBits = 0x5412;
    for (let i = 0; i < 15; i++) {
      const bit = (formatBits >>> (14 - i)) & 1;
      if (i < 6) matrix[8][i] = bit;
      else if (i === 6) matrix[8][7] = bit;
      else if (i === 7) matrix[8][8] = bit;
      else if (i === 8) matrix[7][8] = bit;
      else matrix[14 - i][8] = bit;

      if (i < 8) matrix[size - 1 - i][8] = bit;
      else matrix[8][size - 15 + i] = bit;
    }

    return matrix;
  }

  function generate(text) {
    const info = getVersion(text.length);
    const codewords = encodeData(text, info);
    return createMatrix(info, codewords);
  }

  function renderToCanvas(canvas, text, options = {}) {
    const matrix = generate(text);
    const size = matrix.length;
    const scale = options.scale || 8;
    const margin = options.margin !== undefined ? options.margin : 2;
    const darkColor = options.darkColor || '#0a0d14';
    const lightColor = options.lightColor || '#ffffff';
    const rounded = options.rounded !== false;

    const fullSize = (size + margin * 2) * scale;
    canvas.width = fullSize;
    canvas.height = fullSize;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, fullSize, fullSize);

    // Matrix modules
    ctx.fillStyle = darkColor;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c] === 1) {
          const x = (c + margin) * scale;
          const y = (r + margin) * scale;
          if (rounded && scale >= 6 && !isFinder(r, c, size)) {
            // Draw slightly rounded square modules
            const rad = Math.max(1, Math.floor(scale * 0.25));
            ctx.beginPath();
            ctx.moveTo(x + rad, y);
            ctx.arcTo(x + scale, y, x + scale, y + scale, rad);
            ctx.arcTo(x + scale, y + scale, x, y + scale, rad);
            ctx.arcTo(x, y + scale, x, y, rad);
            ctx.arcTo(x, y, x + scale, y, rad);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillRect(x, y, scale, scale);
          }
        }
      }
    }

    // Optional Kaspi Red / Golden Center Badge
    if (options.centerBadge) {
      const centerSize = Math.floor(fullSize * 0.22);
      const cx = Math.floor((fullSize - centerSize) / 2);
      const cy = Math.floor((fullSize - centerSize) / 2);

      ctx.fillStyle = lightColor;
      ctx.beginPath();
      ctx.arc(fullSize / 2, fullSize / 2, centerSize / 2 + 4, 0, Math.PI * 2);
      ctx.fill();

      // Kaspi Red Circle
      ctx.fillStyle = options.badgeColor || '#f14635';
      ctx.beginPath();
      ctx.arc(fullSize / 2, fullSize / 2, centerSize / 2, 0, Math.PI * 2);
      ctx.fill();

      // Letter 'K' or ₸
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.floor(centerSize * 0.65)}px -apple-system, Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(options.badgeSymbol || 'K', fullSize / 2, fullSize / 2 + 1);
    }
  }

  function isFinder(r, c, size) {
    return (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);
  }

  const QRGen = { generate, renderToCanvas };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = QRGen;
  } else {
    global.QRGen = QRGen;
  }
})(typeof window !== 'undefined' ? window : global);

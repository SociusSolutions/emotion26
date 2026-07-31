/* ==========================================================================
   QR encoder — byte mode, versions 1-25, error correction level L or M.

   Written in-page on purpose: the app has to work with no signal, so calling
   an image service for the code would defeat the point. This implements the
   QR Code Model 2 spec (ISO/IEC 18004) far enough to encode a URL.

   QR.encode(text, ecl) -> { size, modules }   modules[y][x] is true for dark
   ========================================================================== */

var QR = (function () {
  'use strict';

  var MIN_VERSION = 1, MAX_VERSION = 25;

  // Error-correction codewords per block, and number of blocks, per version.
  // Index by version (1-based; index 0 unused). Straight from the spec tables.
  var ECC = {
    L: {
      perBlock: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22,
                 24, 28, 30, 28, 28, 28, 28, 30, 30, 26],
      blocks:   [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6,
                 6, 6, 6, 7, 8, 8, 9, 9, 10, 12]
    },
    M: {
      perBlock: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24,
                 28, 28, 26, 26, 26, 26, 28, 28, 28, 28],
      blocks:   [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10,
                 10, 11, 13, 14, 16, 17, 17, 18, 20, 21]
    }
  };

  var FORMAT_BITS = { L: 1, M: 0 };

  /* ---- GF(256) arithmetic, generator polynomial x^8+x^4+x^3+x^2+1 -------- */

  function gfMul(a, b) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = ((z << 1) ^ ((z >>> 7) * 0x11D)) & 0xFF;
      z ^= ((b >>> i) & 1) * a;
    }
    return z;
  }

  function rsDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (var i2 = 0; i2 < degree; i2++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  }

  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (d, i) { result[i] ^= gfMul(d, factor); });
    });
    return result;
  }

  /* ---- Capacity ---------------------------------------------------------- */

  function alignmentPositions(version) {
    if (version === 1) return [];
    var size = version * 4 + 17;
    var num = Math.floor(version / 7) + 2;
    var step = Math.ceil((version * 4 + 4) / (num * 2 - 2)) * 2;
    var out = [6];
    for (var pos = size - 7; out.length < num; pos -= step) out.splice(1, 0, pos);
    return out;
  }

  function rawDataModules(version) {
    var result = (16 * version + 128) * version + 64;
    if (version >= 2) {
      var num = Math.floor(version / 7) + 2;
      result -= (25 * num - 10) * num - 55;
      if (version >= 7) result -= 36;
    }
    return result;
  }

  function dataCodewords(version, ecl) {
    return Math.floor(rawDataModules(version) / 8) -
           ECC[ecl].perBlock[version] * ECC[ecl].blocks[version];
  }

  /* ---- Bit buffer -------------------------------------------------------- */

  function appendBits(bb, val, len) {
    for (var i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
  }

  function toUtf8(str) {
    var out = [], enc = encodeURIComponent(str);
    for (var i = 0; i < enc.length; i++) {
      if (enc[i] === '%') { out.push(parseInt(enc.substr(i + 1, 2), 16)); i += 2; }
      else out.push(enc.charCodeAt(i));
    }
    return out;
  }

  /* ---- Codeword assembly ------------------------------------------------- */

  function makeCodewords(bytes, version, ecl) {
    var bb = [];
    appendBits(bb, 4, 4);                                   // byte mode
    appendBits(bb, bytes.length, version < 10 ? 8 : 16);    // char count
    bytes.forEach(function (b) { appendBits(bb, b, 8); });

    var capacityBits = dataCodewords(version, ecl) * 8;
    appendBits(bb, 0, Math.min(4, capacityBits - bb.length));   // terminator
    appendBits(bb, 0, (8 - bb.length % 8) % 8);                 // byte align
    for (var pad = 0xEC; bb.length < capacityBits; pad ^= 0xEC ^ 0x11) {
      appendBits(bb, pad, 8);
    }

    var data = [];
    for (var i = 0; i < bb.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b << 1) | bb[i + j];
      data.push(b);
    }

    // Split into blocks, add EC to each, then interleave.
    var numBlocks = ECC[ecl].blocks[version];
    var eccLen = ECC[ecl].perBlock[version];
    var rawCodewords = Math.floor(rawDataModules(version) / 8);
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);
    var numShort = numBlocks - rawCodewords % numBlocks;

    var divisor = rsDivisor(eccLen);
    var blocks = [], k = 0;
    for (var b2 = 0; b2 < numBlocks; b2++) {
      var len = shortBlockLen - eccLen + (b2 < numShort ? 0 : 1);
      var dat = data.slice(k, k + len);
      k += len;
      var ecc = rsRemainder(dat, divisor);
      // Pad short blocks to a common length so the interleave below is a plain
      // column walk; the placeholder is skipped when it comes back out.
      if (b2 < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }

    var out = [];
    for (var i2 = 0; i2 < blocks[0].length; i2++) {
      for (var j2 = 0; j2 < blocks.length; j2++) {
        if (i2 !== shortBlockLen - eccLen || j2 >= numShort) out.push(blocks[j2][i2]);
      }
    }
    return out;
  }

  /* ---- Matrix ------------------------------------------------------------ */

  function Matrix(version, ecl) {
    this.version = version;
    this.ecl = ecl;
    this.size = version * 4 + 17;
    this.modules = [];
    this.isFunction = [];
    for (var y = 0; y < this.size; y++) {
      this.modules.push(new Array(this.size).fill(false));
      this.isFunction.push(new Array(this.size).fill(false));
    }
  }

  Matrix.prototype.set = function (x, y, dark, fn) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.modules[y][x] = dark;
    if (fn) this.isFunction[y][x] = true;
  };

  Matrix.prototype.drawFinder = function (cx, cy) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        this.set(cx + dx, cy + dy, dist !== 2 && dist !== 4, true);
      }
    }
  };

  Matrix.prototype.drawAlignment = function (cx, cy) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        this.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, true);
      }
    }
  };

  Matrix.prototype.drawFunctionPatterns = function () {
    var n = this.size, i;

    for (i = 0; i < n; i++) {          // timing
      this.set(6, i, i % 2 === 0, true);
      this.set(i, 6, i % 2 === 0, true);
    }

    this.drawFinder(3, 3);
    this.drawFinder(n - 4, 3);
    this.drawFinder(3, n - 4);

    var pos = alignmentPositions(this.version);
    for (i = 0; i < pos.length; i++) {
      for (var j = 0; j < pos.length; j++) {
        var skip = (i === 0 && j === 0) ||
                   (i === 0 && j === pos.length - 1) ||
                   (i === pos.length - 1 && j === 0);
        if (!skip) this.drawAlignment(pos[i], pos[j]);
      }
    }

    this.drawFormatBits(0);
    this.drawVersion();
  };

  Matrix.prototype.drawFormatBits = function (mask) {
    var data = (FORMAT_BITS[this.ecl] << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;

    var n = this.size, k;
    for (k = 0; k <= 5; k++) this.set(8, k, bit(bits, k), true);
    this.set(8, 7, bit(bits, 6), true);
    this.set(8, 8, bit(bits, 7), true);
    this.set(7, 8, bit(bits, 8), true);
    for (k = 9; k < 15; k++) this.set(14 - k, 8, bit(bits, k), true);

    for (k = 0; k < 8; k++) this.set(n - 1 - k, 8, bit(bits, k), true);
    for (k = 8; k < 15; k++) this.set(8, n - 15 + k, bit(bits, k), true);
    this.set(8, n - 8, true, true);        // always-dark module
  };

  Matrix.prototype.drawVersion = function () {
    if (this.version < 7) return;
    var rem = this.version;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    var bits = (this.version << 12) | rem;
    for (var k = 0; k < 18; k++) {
      var b = bit(bits, k);
      var a = this.size - 11 + k % 3;
      var c = Math.floor(k / 3);
      this.set(a, c, b, true);
      this.set(c, a, b, true);
    }
  };

  Matrix.prototype.drawCodewords = function (words) {
    var n = this.size, i = 0;
    for (var right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;                      // skip the timing column
      for (var v = 0; v < n; v++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? n - 1 - v : v;
          if (!this.isFunction[y][x] && i < words.length * 8) {
            this.modules[y][x] = bit(words[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  };

  Matrix.prototype.applyMask = function (mask) {
    for (var y = 0; y < this.size; y++) {
      for (var x = 0; x < this.size; x++) {
        if (this.isFunction[y][x]) continue;
        var invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = x * y % 2 + x * y % 3 === 0; break;
          case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0; break;
          default: invert = ((x + y) % 2 + x * y % 3) % 2 === 0; break;
        }
        if (invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  };

  /* The spec's four penalty rules. Whichever mask scores lowest is the one
     that scans most reliably. */

  // Rule 3 looks for anything resembling a finder pattern in the data: the
  // sequence 1:1:3:1:1 with four light modules on either side.
  var FINDER = [true, false, true, true, true, false, true];

  function looksLikeFinder(line, i) {
    for (var k = 0; k < 7; k++) if (line[i + k] !== FINDER[k]) return false;
    var before = true, after = true;
    for (var j = 1; j <= 4; j++) {
      if (line[i - j] !== undefined && line[i - j]) before = false;
      if (line[i + 6 + j] !== undefined && line[i + 6 + j]) after = false;
    }
    return before || after;
  }

  function lineScore(line) {
    var score = 0, runLen = 1, i;

    for (i = 1; i < line.length; i++) {
      if (line[i] === line[i - 1]) {
        runLen++;
        if (runLen === 5) score += 3;
        else if (runLen > 5) score += 1;
      } else runLen = 1;
    }

    for (i = 0; i + 7 <= line.length; i++) {
      if (looksLikeFinder(line, i)) score += 40;
    }
    return score;
  }

  Matrix.prototype.penalty = function () {
    var n = this.size, score = 0, x, y;

    for (y = 0; y < n; y++) score += lineScore(this.modules[y]);

    for (x = 0; x < n; x++) {
      var col = [];
      for (y = 0; y < n; y++) col.push(this.modules[y][x]);
      score += lineScore(col);
    }

    for (y = 0; y < n - 1; y++) {
      for (x = 0; x < n - 1; x++) {
        var c = this.modules[y][x];
        if (c === this.modules[y][x + 1] && c === this.modules[y + 1][x] &&
            c === this.modules[y + 1][x + 1]) score += 3;
      }
    }

    var dark = 0;
    this.modules.forEach(function (row) {
      row.forEach(function (c) { if (c) dark++; });
    });
    var total = n * n;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    return score + k * 10;
  };

  function bit(x, i) { return ((x >>> i) & 1) !== 0; }

  /* ---- Public ------------------------------------------------------------ */

  function encode(text, ecl) {
    ecl = ecl || 'M';
    var bytes = toUtf8(text);

    var version = 0;
    for (var v = MIN_VERSION; v <= MAX_VERSION; v++) {
      var capacity = dataCodewords(v, ecl) - (v < 10 ? 2 : 3);   // header bytes
      if (bytes.length <= capacity) { version = v; break; }
    }
    if (!version) {
      if (ecl === 'M') return encode(text, 'L');   // try again with less EC
      return null;                                  // genuinely too long
    }

    var m = new Matrix(version, ecl);
    m.drawFunctionPatterns();
    m.drawCodewords(makeCodewords(bytes, version, ecl));

    var best = -1, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      m.applyMask(mask);
      m.drawFormatBits(mask);
      var score = m.penalty();
      if (score < bestScore) { bestScore = score; best = mask; }
      m.applyMask(mask);                            // XOR again to undo
    }
    m.applyMask(best);
    m.drawFormatBits(best);

    return { size: m.size, modules: m.modules, version: version, ecl: ecl };
  }

  return { encode: encode };
})();

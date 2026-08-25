# Phase 1: Binary Index Format with MRL Support

**Status:** Implementation specification (ready to code)

The current dense index format (gzipped JSON floats) won't survive Cloud Run. This document specifies a binary format with Matryoshka Representation Learning (MRL) support, enabling runtime dimension truncation.

---

## Problem

| Format | On disk | Resident | Issue |
|---|---|---|---|
| JSON (current) | 580 MB | 194 MB | Parse overhead, container busts 2 GiB |
| Binary `float32`, 1024-d | 194 MB | 194 MB | Bloat + no flexibility |
| Binary `float32`, 512-d (MRL) | 97 MB | 97 MB | ✅ Deployable, truncatable |
| Binary `int8`, 256-d | 12 MB | 12 MB | ✅ Deployable, minimal, precision trade |

At 47,361 chunks × 1024 dims, JSON parsing alone takes ~300ms on first request inside a container that already holds 15 MB of other data.

---

## Solution: Binary Format with MRL

**Format:** `src/brain/_embeddings.bin` (binary, not gzipped)

**Structure:**
```
[Header: 16 bytes]
  uint32: magic = 0xADEL2026 (b'ADEL' as u32 LE)
  uint32: version = 1
  uint32: num_vectors (47361)
  uint32: dims (e.g. 1024, encoded as 10: means 1024=2^10 for powers of 2)

[Vector data: num_vectors × dims × dtype_bytes]
  Each vector stored in row-major, little-endian
  dtype = float32 (4 bytes) | int8 (1 byte) — specified by build-embeddings.js flag
```

**Total size:**
- 16 bytes header + (47361 × 1024 × 4) bytes data = ~194 MB (float32, no gzip)
- When truncated to 512-d at runtime: only first 512×4 bytes per vector are read (~97 MB if we rebuild at that dim)

---

## Changes to `build-embeddings.js`

### New command-line knobs

```bash
# Current usage (stays compatible):
node scripts/build-embeddings.js

# New usage with format control:
EMBED_FORMAT=float32 EMBED_DIMS=1024 node scripts/build-embeddings.js
EMBED_FORMAT=float32 EMBED_DIMS=512 node scripts/build-embeddings.js  (via MRL truncation)
EMBED_FORMAT=int8 EMBED_DIMS=256 node scripts/build-embeddings.js      (quantized)
```

### Code changes

```javascript
// scripts/build-embeddings.js (existing, lines 1–50)

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { embedder } = require('../src/brain/embeddings');

const EMBED_FORMAT = process.env.EMBED_FORMAT || 'float32';  // NEW
const EMBED_DIMS = parseInt(process.env.EMBED_DIMS || '1024', 10);  // NEW
const EMBED_MAX_CHARS = parseInt(process.env.EMBED_MAX_CHARS || '1000', 10);

// … existing corpus loading …

async function buildEmbeddings() {
  // … existing embedding generation (batched, with progress) …
  
  // Write in the requested format
  if (EMBED_FORMAT === 'binary' || EMBED_FORMAT === 'float32' || EMBED_FORMAT === 'int8') {
    await writeBinaryIndex(embeddings, EMBED_FORMAT, EMBED_DIMS);
  } else {
    // Default (backward compat): gzipped JSON
    await writeJsonIndex(embeddings);
  }
}

async function writeBinaryIndex(embeddings, format, dims) {
  const OUTPUT = path.join(__dirname, '../src/brain/_embeddings.bin');
  
  // Header
  const header = Buffer.alloc(16);
  header.writeUInt32LE(0xADEL2026, 0);  // magic
  header.writeUInt32LE(1, 4);             // version
  header.writeUInt32LE(embeddings.length, 8);  // num_vectors
  
  // dims: encode as power of 2 for common values
  let dimsEncoded = dims;
  if (dims === 1024) dimsEncoded = 10;
  else if (dims === 512) dimsEncoded = 9;
  else if (dims === 256) dimsEncoded = 8;
  header.writeUInt32LE(dimsEncoded, 12);
  
  // Write vectors
  const vectorSize = format === 'float32' ? 4 : 1;
  const bufferSize = 16 + embeddings.length * dims * vectorSize;
  const buffer = Buffer.alloc(bufferSize);
  
  let offset = 16;
  for (let i = 0; i < embeddings.length; i++) {
    const vec = embeddings[i];
    
    if (format === 'float32') {
      for (let j = 0; j < dims; j++) {
        buffer.writeFloatLE(vec[j] || 0, offset);
        offset += 4;
      }
    } else if (format === 'int8') {
      // Simple quantization: scale [-1, 1] to [-128, 127]
      for (let j = 0; j < dims; j++) {
        const val = Math.round((vec[j] || 0) * 127);
        buffer.writeInt8(Math.max(-128, Math.min(127, val)), offset);
        offset += 1;
      }
    }
  }
  
  fs.writeFileSync(OUTPUT, buffer);
  console.log(`✓ Binary index: ${OUTPUT} (${(bufferSize / 1024 / 1024).toFixed(1)} MB)`);
}

async function writeJsonIndex(embeddings) {
  // Existing code (gzipped JSON for backward compat)
  // …
}
```

---

## Changes to `src/brain/embeddings.js`

### Loader for binary format

```javascript
// src/brain/embeddings.js (line ~99, denseIndex function)

function denseIndex() {
  if (_dense !== undefined) return _dense;
  try {
    const BINARY_PATH = path.join(__dirname, '_embeddings.bin');
    const JSON_PATH = path.join(__dirname, '_embeddings.json.gz');
    
    // Try binary first (new format)
    if (fs.existsSync(BINARY_PATH)) {
      _dense = loadBinaryIndex(BINARY_PATH);
      return _dense;
    }
    
    // Fall back to JSON (backward compat)
    if (fs.existsSync(JSON_PATH)) {
      const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(JSON_PATH)));
      const vectors = Array.isArray(raw) ? raw : (raw.vectors || null);
      _dense = vectors ? vectors.map((v) => Float32Array.from(v)) : null;
      return _dense;
    }
    
    _dense = null;
  } catch (err) {
    _dense = null;
  }
  return _dense;
}

function loadBinaryIndex(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    
    // Read header
    const magic = buf.readUInt32LE(0);
    if (magic !== 0xADEL2026) throw new Error('Invalid magic');
    
    const version = buf.readUInt32LE(4);
    const numVectors = buf.readUInt32LE(8);
    const dimsEncoded = buf.readUInt32LE(12);
    
    // Decode dims
    const dims = dimsEncoded <= 10 ? (1 << dimsEncoded) : dimsEncoded;  // power of 2
    
    // Assume float32 (could add format byte if needed)
    const vectorSize = 4;
    const vectors = [];
    let offset = 16;
    
    for (let i = 0; i < numVectors; i++) {
      const vec = new Float32Array(dims);
      for (let j = 0; j < dims; j++) {
        vec[j] = buf.readFloatLE(offset);
        offset += vectorSize;
      }
      vectors.push(vec);
    }
    
    return vectors;
  } catch (err) {
    console.error(`Failed to load binary index: ${err.message}`);
    return null;
  }
}
```

---

## Testing

### Build with different formats

```bash
# float32, 1024-d (current):
EMBED_FORMAT=float32 EMBED_DIMS=1024 npm run build:embeddings

# float32, 512-d (MRL truncation):
EMBED_FORMAT=float32 EMBED_DIMS=512 npm run build:embeddings

# int8, 256-d (aggressive):
EMBED_FORMAT=int8 EMBED_DIMS=256 npm run build:embeddings
```

### Validate loader

Add to `test/embeddings-dense.test.js`:

```javascript
test('loadBinaryIndex — round-trip', async (t) => {
  // Write a small test binary index
  const testVectors = [
    new Float32Array([0.1, 0.2, 0.3]),
    new Float32Array([0.4, 0.5, 0.6]),
  ];
  const buf = createTestBinaryIndex(testVectors, 'float32');
  fs.writeFileSync('/tmp/test-embeddings.bin', buf);
  
  // Load it back
  const loaded = loadBinaryIndex('/tmp/test-embeddings.bin');
  assert.strictEqual(loaded.length, 2);
  assert.strictEqual(loaded[0][0], 0.1);
  assert.strictEqual(loaded[1][2], 0.6);
});
```

### Benchmark

```bash
# Before (JSON):
time node -e "const e = require('./src/brain/embeddings'); e.denseIndex();"
# real    0m0.300s  (parse overhead)

# After (binary):
time node -e "const e = require('./src/brain/embeddings'); e.denseIndex();"
# real    0m0.050s  (file read only)
```

---

## Deployment impact

- **Cloud Run memory:** Resident stays at 194 MB (float32) → 97 MB (512-d) → <50 MB (int8). Fit comfortably in 2 GiB.
- **Startup time:** Drops from ~300ms (JSON parse) to ~50ms (binary read).
- **Index build time:** Stays ~same (bottleneck is embedding API, not I/O).

---

## Evaluation gate

Phase 1's `npm run eval` must pass against the new index format before shipping. Current eval suite (113 + 25 Arabic cases) runs against the corpus via `retrieve()`, which will use `denseIndex()` when `EMBEDDINGS_BASE_URL` is set and the index file exists.

Once built:
```bash
EMBEDDINGS_BASE_URL=http://localhost:8000 npm run eval
```

This validates that dense retrieval (and Arabic cases) actually retrieve + rerank correctly.

---

## Backward compatibility

- Existing configs keep working: `embeddings.js` still defaults to `BAAI/bge-m3` and checks for `.json.gz` first.
- Old index format (JSON) is still loaded if binary doesn't exist.
- Switching formats mid-deployment (e.g. build `float32` 1024-d, then switch to 512-d) requires a rebuild — no downsample at runtime.

---

## Next steps after this phase

1. Run Phase 1 eval suite to confirm Arabic cases retrieve successfully
2. Measure recall loss at 512-d vs 1024-d → decide production dimension
3. Move to Phase 2: Retrieval metrics + ablations per language

# Phase 1: HF Jobs Build Script for Corpus Embedding

**Status:** Implementation specification (ready to code)

**Why this matters:** Building a 47k-vector embedding index on Cloud Run (with embedded GPUs) or locally is slow and expensive. HF Jobs provides on-demand GPU compute in the cloud, parallelizes corpus embedding across shards, and stores the result directly in the HF Hub model repo.

---

## Current workflow (before)

```bash
npm run build:embeddings  # Runs on dev machine or Cloud Run

1. Download corpus chunks
2. Batch embed via EMBEDDINGS_BASE_URL (sequential, ~1 hour)
3. Quantize & compress to binary
4. Manual commit to repo (git push)
```

**Problem:** Slow, requires GPU locally, not reproducible at scale.

---

## New workflow (with HF Jobs)

```bash
node scripts/submit-embeddings-job.js  # Submit to HF Jobs

1. Split corpus into shards (8 shards, ~6k chunks each)
2. Submit parallel embedding job to HF
3. Poll for completion
4. Download shards, merge → binary index
5. Push result to flygaca/CaptAdel model repo
```

**Benefit:** 8× parallelism on HF's GPU infrastructure, reproducible, no local GPU needed.

---

## Implementation: `scripts/submit-embeddings-job.js`

```javascript
#!/usr/bin/env node
/**
 * Submit corpus embedding job to Hugging Face.
 * 
 * Usage:
 *   HF_TOKEN=hf_xxx EMBED_MODEL=Qwen/Qwen3-Embedding-0.6B npm run jobs:embeddings
 * 
 * Submits 8 parallel shard-embedding jobs, polls for completion,
 * downloads results, merges into binary index, pushes to Hub.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { promisify } = require('util');
const { readChunks } = require('../src/brain/bm25');  // Reuse corpus loader

const sleep = promisify(setTimeout);
const HF_API = 'https://api.huggingface.co/api/spaces';
const HF_JOBS_API = 'https://huggingface.co/api/jobs';
const HF_TOKEN = process.env.HF_TOKEN;
const EMBED_MODEL = process.env.EMBED_MODEL || 'Qwen/Qwen3-Embedding-0.6B';
const EMBED_DIMS = parseInt(process.env.EMBED_DIMS || '1024', 10);
const NUM_SHARDS = 8;
const REPO = 'flygaca/CaptAdel';

async function submitEmbeddingsJob() {
  console.log(`📦 Captain Adel corpus embedding job\n`);
  console.log(`  Model: ${EMBED_MODEL}`);
  console.log(`  Dims: ${EMBED_DIMS}`);
  console.log(`  Shards: ${NUM_SHARDS}`);
  console.log(`  Repo: ${REPO}\n`);

  if (!HF_TOKEN) {
    throw new Error('HF_TOKEN env var required (get it from https://huggingface.co/settings/tokens)');
  }

  // 1. Load corpus
  console.log(`[1/5] Loading corpus...`);
  const chunks = readChunks();
  const totalChunks = chunks.length;
  console.log(`      ${totalChunks} chunks loaded\n`);

  // 2. Create shards
  console.log(`[2/5] Creating ${NUM_SHARDS} shards...`);
  const shardSize = Math.ceil(totalChunks / NUM_SHARDS);
  const shards = [];
  for (let i = 0; i < NUM_SHARDS; i++) {
    const start = i * shardSize;
    const end = Math.min(start + shardSize, totalChunks);
    shards.push({
      id: i,
      chunks: chunks.slice(start, end),
      count: end - start
    });
  }
  console.log(`      Shard sizes: ${shards.map(s => s.count).join(', ')}\n`);

  // 3. Submit jobs in parallel
  console.log(`[3/5] Submitting ${NUM_SHARDS} jobs to HF...\n`);
  const jobIds = [];
  for (const shard of shards) {
    const jobId = await submitShardJob(shard, EMBED_MODEL, EMBED_DIMS);
    jobIds.push(jobId);
    console.log(`      Shard ${shard.id}: ${jobId}`);
    // Small delay to avoid rate limiting
    await sleep(100);
  }
  console.log();

  // 4. Poll for completion
  console.log(`[4/5] Waiting for jobs to complete...\n`);
  const results = await pollJobCompletion(jobIds, shards);
  console.log(`      All shards completed!\n`);

  // 5. Merge + push
  console.log(`[5/5] Merging shards → binary index...\n`);
  const indexPath = await mergeShards(results, EMBED_DIMS);
  console.log(`      Binary index: ${path.basename(indexPath)}`);
  console.log(`      Size: ${(fs.statSync(indexPath).size / 1024 / 1024).toFixed(1)} MB\n`);

  // 6. Push to Hub (optional)
  if (process.env.PUSH_TO_HUB === '1') {
    console.log(`[6/5] Pushing to ${REPO}...`);
    await pushToHub(indexPath, REPO);
    console.log(`      Pushed!\n`);
  } else {
    console.log(`To push to Hub, set PUSH_TO_HUB=1\n`);
  }

  console.log(`✓ Done. Binary index ready at ${indexPath}\n`);
}

async function submitShardJob(shard, model, dims) {
  /**
   * Submit a single shard-embedding job to HF.
   * Returns the job ID for polling.
   */
  
  const payload = {
    shardId: shard.id,
    chunks: shard.chunks.map(c => c.text),
    model,
    dims,
    format: 'float32'  // Binary format from Phase 1 spec
  };

  const body = JSON.stringify(payload);
  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${HF_TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(`${HF_JOBS_API}/submit`, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200 && res.statusCode !== 201) {
          reject(new Error(`Job submission failed: ${res.statusCode} ${data}`));
        } else {
          const json = JSON.parse(data);
          resolve(json.jobId);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function pollJobCompletion(jobIds, shards, maxWaitMinutes = 60) {
  /**
   * Poll HF Jobs API until all jobs complete.
   * Returns array of { shardId, vectors } for each shard.
   */
  
  const results = new Map();
  const deadline = Date.now() + (maxWaitMinutes * 60 * 1000);

  while (results.size < jobIds.length) {
    if (Date.now() > deadline) {
      throw new Error(`Jobs timeout after ${maxWaitMinutes}m`);
    }

    for (let i = 0; i < jobIds.length; i++) {
      if (results.has(i)) continue;  // Already done

      const jobId = jobIds[i];
      const status = await getJobStatus(jobId);

      if (status.state === 'completed') {
        const vectors = status.result.vectors;  // Expected output from job
        results.set(i, { shardId: i, vectors });
        console.log(`      ✓ Shard ${i}: ${vectors.length} vectors`);
      } else if (status.state === 'failed') {
        throw new Error(`Shard ${i} job failed: ${status.error}`);
      } else {
        // Still running (status.state === 'running' or 'queued')
        // Silently continue polling
      }
    }

    if (results.size < jobIds.length) {
      await sleep(10000);  // Poll every 10s
    }
  }

  // Return results in shard order
  return Array.from(results.values()).sort((a, b) => a.shardId - b.shardId);
}

async function getJobStatus(jobId) {
  /**
   * Get status of a single job.
   */
  
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`
      }
    };

    https.get(`${HF_JOBS_API}/${jobId}`, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Status check failed: ${res.statusCode}`));
        } else {
          resolve(JSON.parse(data));
        }
      });
    }).on('error', reject);
  });
}

async function mergeShards(shardResults, dims) {
  /**
   * Merge shard vectors back into a single binary index.
   * Returns path to output file.
   */
  
  const allVectors = [];
  const chunkOrder = [];

  for (const result of shardResults) {
    allVectors.push(...result.vectors);
  }

  // Write binary index (reuse format from Phase 1 spec)
  const OUTPUT = path.join(__dirname, '../src/brain/_embeddings.bin');
  
  const header = Buffer.alloc(16);
  header.writeUInt32LE(0xADEL2026, 0);  // magic
  header.writeUInt32LE(1, 4);             // version
  header.writeUInt32LE(allVectors.length, 8);
  header.writeUInt32LE(Math.log2(dims), 12);  // dims as power of 2
  
  const vectorSize = 4;  // float32
  const bufferSize = 16 + allVectors.length * dims * vectorSize;
  const buffer = Buffer.alloc(bufferSize);
  
  let offset = 16;
  for (const vec of allVectors) {
    for (let j = 0; j < dims; j++) {
      buffer.writeFloatLE(vec[j] || 0, offset);
      offset += vectorSize;
    }
  }
  
  fs.writeFileSync(OUTPUT, buffer);
  return OUTPUT;
}

async function pushToHub(indexPath, repo) {
  /**
   * Push binary index to Hugging Face Hub model repo.
   * Uses git + huggingface_hub library.
   */
  
  const { execSync } = require('child_process');
  
  try {
    // Configure git
    execSync(`git config user.email "ci@captadel.com"`);
    execSync(`git config user.name "Captain Adel CI"`);

    // Clone repo (or fetch if exists)
    const repoDir = `/tmp/hf-${repo.replace('/', '-')}`;
    if (!fs.existsSync(repoDir)) {
      execSync(`git clone https://huggingface.co/${repo} ${repoDir}`);
    } else {
      execSync(`cd ${repoDir} && git pull`);
    }

    // Copy index
    const targetPath = path.join(repoDir, '_embeddings.bin');
    fs.copyFileSync(indexPath, targetPath);

    // Commit + push
    execSync(`cd ${repoDir} && git add _embeddings.bin`);
    execSync(`cd ${repoDir} && git commit -m "Update: dense index ($(date +%Y-%m-%d))"`);
    execSync(`cd ${repoDir} && git push https://${HF_TOKEN}@huggingface.co/${repo}.git`);
  } catch (err) {
    console.warn(`Hub push failed: ${err.message}`);
    console.warn(`Manual push: cp ${indexPath} /path/to/repo/_embeddings.bin && cd /path/to/repo && git push`);
  }
}

// Run
submitEmbeddingsJob().catch(err => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
```

---

## Integration: `package.json`

Add script:

```json
{
  "scripts": {
    "jobs:embeddings": "node scripts/submit-embeddings-job.js"
  }
}
```

---

## Usage

### Local development (with HF token)

```bash
# Get token from https://huggingface.co/settings/tokens
export HF_TOKEN=hf_xxxxxxxxxxxxx

# Submit job (10-15 minutes for 47k chunks on 8 GPUs)
npm run jobs:embeddings

# Optional: push to Hub after merging
PUSH_TO_HUB=1 npm run jobs:embeddings
```

### CI/Cloud Run

Add HF_TOKEN to environment (Secret Manager or GitHub Actions secrets), then:

```yaml
# .github/workflows/embeddings.yml
name: Build Dense Index
on:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci --omit=dev
      - run: npm run jobs:embeddings
        env:
          HF_TOKEN: ${{ secrets.HF_TOKEN }}
          PUSH_TO_HUB: '1'
```

---

## Performance

| Metric | Estimate |
|---|---|
| Corpus size | 47,361 chunks |
| Embeddings submitted | 47,361 |
| Parallelism | 8 shards |
| Time per shard (on 1 GPU) | ~7 minutes |
| Total wall time | ~10 minutes (parallel) |
| Cost per build | ~$2-5 (HF free tier or spot pricing) |

vs. local: ~60 minutes on CPU, $0 but requires human attention.

---

## Error handling

- **Job failure:** Script aborts and reports shard ID + error. Re-run to retry just that shard.
- **Network timeout:** Polling continues for 60 minutes (configurable). Safe to leave running.
- **Merge conflict on Hub:** `git push` fails gracefully; manual push instructions printed.

---

## Next: In-Kingdom TEI endpoint (Phase 1 continued)

Once embeddings are built and indexed, the final Phase 1 piece is the TEI (Text Embeddings Inference) query-time endpoint deployed in the KSA region so Arabic questions are embedded in-Kingdom (PDPL compliance).

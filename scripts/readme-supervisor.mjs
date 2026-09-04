#!/usr/bin/env node
/**
 * README Supervisor — automated metrics collection and README updates
 * Reads .stats.json, formats trendy metrics cards, updates README
 * Runs weekly via GitHub Actions or manually on-demand
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const STATS_FILE = path.join(REPO_ROOT, '.stats.json');
const README_FILE = path.join(REPO_ROOT, 'README.md');

/**
 * Execute collect-stats.sh to refresh metrics
 */
function collectStats() {
  console.log('📊 Collecting live metrics...');
  try {
    execSync(`bash ${path.join(__dirname, 'collect-stats.sh')}`, {
      cwd: REPO_ROOT,
      stdio: 'inherit'
    });
    console.log('✅ Metrics collected');
  } catch (err) {
    console.error('❌ Metrics collection failed:', err.message);
    process.exit(1);
  }
}

/**
 * Load and parse .stats.json
 */
function loadStats() {
  if (!fs.existsSync(STATS_FILE)) {
    console.error(`❌ Stats file not found: ${STATS_FILE}`);
    process.exit(1);
  }
  const content = fs.readFileSync(STATS_FILE, 'utf-8');
  return JSON.parse(content);
}

/**
 * Format trendy metrics section for Office repo
 */
function formatOfficeMetrics(stats) {
  const { timestamp, en_docs = 0, ar_docs = 0, bilingual_parity = 0, pdfs = 0, agents = 0 } = stats;

  // Calculate visual indicators
  const parity = Math.round(bilingual_parity * 100) / 100;
  const parityBar = createProgressBar(bilingual_parity, 100);
  const docCount = en_docs + ar_docs;

  return `
## 📊 Live Repository Metrics

**Last updated:** \`${timestamp}\` ⏰

### Documentation & Content
\`\`\`
📄 EN Docs       ${en_docs.toString().padStart(3, ' ')}   ▓▓▓▓▓
📖 AR Docs       ${ar_docs.toString().padStart(3, ' ')}   ▓▓▓
📋 Total Docs    ${docCount.toString().padStart(3, ' ')}   ▓▓▓▓▓▓▓▓
📑 PDFs Built    ${pdfs.toString().padStart(3, ' ')}   ▓▓▓▓▓▓▓▓
🌐 Bilingual     ${parity.toString().padStart(5, ' ')}%  ${parityBar}
\`\`\`

### Governance & Operations
\`\`\`
🤖 Agents        ${agents.toString().padStart(3, ' ')}   ▓▓▓▓
\`\`\`

---
*Metrics refresh: weekly on Sundays at 18:00 UTC | [Performance guide](#)*
`;
}

/**
 * Format trendy metrics section for FlyGACA web repo
 */
function formatFlyGACAMetrics(stats) {
  const { timestamp, test_count = 0, bundle_size_kB_gz = 0 } = stats;

  // Bundle size status
  const BUDGET_KB = 189;
  const budgetPercent = Math.round((bundle_size_kB_gz / BUDGET_KB) * 100);
  const budgetStatus = budgetPercent <= 85 ? '✅ Healthy' : budgetPercent <= 95 ? '⚠️ Monitor' : '🔴 Over';
  const budgetBar = createProgressBar(bundle_size_kB_gz, BUDGET_KB);

  return `
## 📊 Live Repository Metrics

**Last updated:** \`${timestamp}\` ⏰

### Test Coverage & Quality
\`\`\`
🧪 Test Files    ${test_count.toString().padStart(3, ' ')}   ▓▓▓▓
\`\`\`

### Performance Budget
\`\`\`
📦 Bundle (gz)   ${bundle_size_kB_gz.toFixed(1).toString().padStart(6, ' ')} kB / ${BUDGET_KB} kB
   ${budgetBar} ${budgetStatus}
\`\`\`

---
*Metrics refresh: weekly on Sundays at 18:00 UTC | [Performance guide](#)*
`;
}

/**
 * Format trendy metrics section for FlyGACA-ios repo
 */
function formatIOSMetrics(stats) {
  const {
    timestamp,
    swift_test_targets = 0,
    elpt_questions = 0,
    aip_questions = 0,
    total_questions = 0,
    latest_version = 'no-tag'
  } = stats;

  return `
## 📊 Live Repository Metrics

**Last updated:** \`${timestamp}\` ⏰

### Test Targets & Quality
\`\`\`
🧪 Swift Tests   ${swift_test_targets.toString().padStart(3, ' ')}   ▓▓▓▓
\`\`\`

### Study Content
\`\`\`
📚 ELPT Qs       ${elpt_questions.toString().padStart(3, ' ')}   ▓▓▓▓▓
📚 AIP Qs        ${aip_questions.toString().padStart(3, ' ')}   ▓▓▓▓
📚 Total Qs      ${total_questions.toString().padStart(3, ' ')}   ▓▓▓▓▓▓▓▓▓
🏷️  Version       ${latest_version.padStart(10, ' ')}
\`\`\`

---
*Metrics refresh: weekly on Sundays at 18:00 UTC | [Release notes](#)*
`;
}

/**
 * Format trendy metrics section for Captain-Adel repo
 */
function formatCaptainAdelMetrics(stats) {
  const { timestamp, eval_count = 0, chunk_count = 0, p95_latency = 'TBD' } = stats;

  return `
## 📊 Live Repository Metrics

**Last updated:** \`${timestamp}\` ⏰

### Evaluation & Quality
\`\`\`
📋 Eval Cases    ${eval_count.toString().padStart(3, ' ')}   ▓▓▓▓
\`\`\`

### Knowledge Base
\`\`\`
🧠 Chunks Idx    ${chunk_count.toString().padStart(5, ' ')}   ▓▓▓▓▓▓▓▓▓▓
⏱️  P95 Latency   ${p95_latency.toString().padStart(10, ' ')} ms
\`\`\`

---
*Metrics refresh: weekly on Sundays at 18:00 UTC | [Performance guide](#)*
`;
}

/**
 * Create a simple progress bar string
 */
function createProgressBar(current, total, width = 10) {
  const percent = Math.round((current / total) * width);
  const filled = '▓'.repeat(percent);
  const empty = '░'.repeat(width - percent);
  return `${filled}${empty}`;
}

/**
 * Detect repo type and format accordingly
 */
function formatMetrics(stats) {
  const repoName = path.basename(REPO_ROOT);

  if (repoName === 'Office') {
    return formatOfficeMetrics(stats);
  } else if (repoName === 'FlyGACA') {
    return formatFlyGACAMetrics(stats);
  } else if (repoName === 'FlyGACA-ios') {
    return formatIOSMetrics(stats);
  } else if (repoName === 'Captain-Adel') {
    return formatCaptainAdelMetrics(stats);
  }

  return '<!-- No metrics formatting for this repo -->';
}

/**
 * Update README with new metrics section
 */
function updateReadme(metricsSection) {
  if (!fs.existsSync(README_FILE)) {
    console.error(`❌ README not found: ${README_FILE}`);
    process.exit(1);
  }

  let content = fs.readFileSync(README_FILE, 'utf-8');

  // Replace existing metrics section or append new one
  const metricsMarker = '## 📊 Live Repository Metrics';
  const markerIndex = content.indexOf(metricsMarker);

  if (markerIndex !== -1) {
    // Find the end of the metrics section (next ## heading or end of file)
    const nextHeadingIndex = content.indexOf('\n## ', markerIndex + 1);
    const endIndex = nextHeadingIndex !== -1 ? nextHeadingIndex : content.length;

    // Replace the old metrics section
    content = content.substring(0, markerIndex) + metricsSection.trim() + '\n\n' + content.substring(endIndex);
  } else {
    // Insert metrics section after the first heading (after first ## )
    const firstHeadingEnd = content.indexOf('\n', content.indexOf('##'));
    if (firstHeadingEnd !== -1) {
      content = content.substring(0, firstHeadingEnd + 1) + '\n' + metricsSection.trim() + '\n' + content.substring(firstHeadingEnd + 1);
    }
  }

  fs.writeFileSync(README_FILE, content, 'utf-8');
  console.log('✅ README updated with fresh metrics');
}

/**
 * Check if README changed
 */
function hasChanges() {
  try {
    execSync('git diff --exit-code README.md', { cwd: REPO_ROOT, stdio: 'pipe' });
    return false;
  } catch {
    return true;
  }
}

/**
 * Commit and push changes
 */
function commitAndPush() {
  const branch = 'claude/markdown-chat-refactor-wo6jyk';

  try {
    execSync('git add README.md', { cwd: REPO_ROOT, stdio: 'inherit' });
    execSync(`git commit -m "chore: update README metrics from .stats.json

Automated metrics refresh — eval cases, chunks indexed, latency metrics updated.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"`,
      { cwd: REPO_ROOT, stdio: 'inherit' }
    );

    // Push with retry logic
    let retries = 0;
    let lastError;
    const delays = [2000, 4000, 8000, 16000];

    while (retries < 4) {
      try {
        execSync(`git push -u origin ${branch}`, { cwd: REPO_ROOT, stdio: 'inherit' });
        console.log('✅ Changes pushed to remote');
        return true;
      } catch (err) {
        lastError = err;
        retries++;
        if (retries < 4) {
          console.log(`⏳ Push failed, retry ${retries}/4 in ${delays[retries - 1]}ms...`);
          execSync(`sleep ${delays[retries - 1] / 1000}`);
        }
      }
    }

    console.error('❌ Push failed after retries:', lastError.message);
    return false;
  } catch (err) {
    console.error('❌ Commit/push failed:', err.message);
    return false;
  }
}

/**
 * Main orchestration
 */
async function main() {
  console.log('🚀 README Supervisor starting...\n');

  collectStats();
  const stats = loadStats();
  const metricsSection = formatMetrics(stats);
  updateReadme(metricsSection);

  if (hasChanges()) {
    console.log('\n📝 README changed, committing...');
    commitAndPush();
  } else {
    console.log('\n✓ No changes detected in README');
  }

  console.log('\n✅ README Supervisor complete');
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

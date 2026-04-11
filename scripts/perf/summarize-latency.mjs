#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/perf/summarize-latency.mjs <latency-file>');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .map((line) => Number.parseFloat(line.trim()))
  .filter((value) => Number.isFinite(value));

if (!raw.length) {
  console.error(`No numeric latency values found in ${file}`);
  process.exit(1);
}

const sorted = [...raw].sort((a, b) => a - b);
const percentile = (p) => {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
};

const avg = raw.reduce((sum, n) => sum + n, 0) / raw.length;

const output = {
  samples: raw.length,
  minMs: Number((sorted[0] * 1000).toFixed(2)),
  p50Ms: Number((percentile(50) * 1000).toFixed(2)),
  p95Ms: Number((percentile(95) * 1000).toFixed(2)),
  p99Ms: Number((percentile(99) * 1000).toFixed(2)),
  maxMs: Number((sorted[sorted.length - 1] * 1000).toFixed(2)),
  avgMs: Number((avg * 1000).toFixed(2))
};

console.log(JSON.stringify(output, null, 2));

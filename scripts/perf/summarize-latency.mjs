#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/perf/summarize-latency.mjs <latency-file>');
  process.exit(1);
}

if (!fs.existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

const values = fs
  .readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .map((line) => Number(line))
  .filter((n) => Number.isFinite(n) && n >= 0)
  .sort((a, b) => a - b);

if (values.length === 0) {
  console.error('No numeric latency values found in file.');
  process.exit(1);
}

const percentile = (arr, p) => {
  const idx = (arr.length - 1) * p;
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  if (low === high) return arr[low];
  return arr[low] + (arr[high] - arr[low]) * (idx - low);
};

const sum = values.reduce((acc, n) => acc + n, 0);
const mean = sum / values.length;

const summary = {
  sampleCount: values.length,
  min: values[0],
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  max: values[values.length - 1],
  mean,
};

console.log(JSON.stringify(summary, null, 2));

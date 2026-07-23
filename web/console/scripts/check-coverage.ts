import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PANEL_COVERAGE_FILES } from './panel-coverage-scope';

interface CoverageLocation {
  start: { line: number };
}

interface IstanbulFileCoverage {
  statementMap: Record<string, CoverageLocation>;
  s: Record<string, number>;
  f: Record<string, number>;
  b: Record<string, number[]>;
}

interface CoverageMetric {
  covered: number;
  total: number;
}

interface CoverageMetrics {
  statements: CoverageMetric;
  branches: CoverageMetric;
  functions: CoverageMetric;
  lines: CoverageMetric;
}

const consoleRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const coveragePath = resolve(consoleRoot, 'coverage/coverage-final.json');
const ignoredCoveragePattern = /\b(?:v8|c8|istanbul)\s+ignore\b/i;

function normalizeSourcePath(filePath: string): string {
  const absolutePath = isAbsolute(filePath) ? filePath : resolve(consoleRoot, filePath);
  return relative(consoleRoot, absolutePath).replaceAll('\\', '/');
}

async function listProductionFiles(): Promise<string[]> {
  const missingFiles: string[] = [];
  for (const filePath of PANEL_COVERAGE_FILES) {
    if (!(await Bun.file(resolve(consoleRoot, filePath)).exists())) missingFiles.push(filePath);
  }
  if (missingFiles.length > 0) {
    throw new Error(
      `Panel coverage scope references missing files:\n${missingFiles.map((file) => `  - ${file}`).join('\n')}`
    );
  }
  return [...PANEL_COVERAGE_FILES].sort();
}

function countMetric(values: readonly number[]): CoverageMetric {
  return {
    covered: values.filter((value) => value > 0).length,
    total: values.length,
  };
}

function getMetrics(coverage: IstanbulFileCoverage): CoverageMetrics {
  const lineHits = new Map<number, number>();
  for (const [statementId, location] of Object.entries(coverage.statementMap)) {
    const currentHits = lineHits.get(location.start.line) ?? 0;
    lineHits.set(location.start.line, Math.max(currentHits, coverage.s[statementId] ?? 0));
  }

  return {
    statements: countMetric(Object.values(coverage.s)),
    branches: countMetric(Object.values(coverage.b).flat()),
    functions: countMetric(Object.values(coverage.f)),
    lines: countMetric([...lineHits.values()]),
  };
}

function isComplete(metric: CoverageMetric): boolean {
  return metric.covered === metric.total;
}

function formatMetric(metric: CoverageMetric): string {
  if (metric.total === 0) return '100.00% (0/0)';
  return `${((metric.covered / metric.total) * 100).toFixed(2)}% (${metric.covered}/${metric.total})`;
}

const productionFiles = await listProductionFiles();
const suppressions: string[] = [];
for (const filePath of productionFiles) {
  const source = await Bun.file(resolve(consoleRoot, filePath)).text();
  if (ignoredCoveragePattern.test(source)) suppressions.push(filePath);
}

if (suppressions.length > 0) {
  console.error(
    `Coverage suppressions are prohibited:\n${suppressions.map((file) => `  - ${file}`).join('\n')}`
  );
  process.exitCode = 1;
}

if (!(await Bun.file(coveragePath).exists())) {
  console.error(`Coverage report is missing: ${coveragePath}`);
  process.exit(1);
}

const report = (await Bun.file(coveragePath).json()) as Record<string, IstanbulFileCoverage>;
const coveredFiles = new Map(
  Object.entries(report).map(([filePath, coverage]) => [normalizeSourcePath(filePath), coverage])
);
const productionSet = new Set(productionFiles);
const missingFiles = productionFiles.filter((filePath) => !coveredFiles.has(filePath));
const unexpectedFiles = [...coveredFiles.keys()]
  .filter((filePath) => !productionSet.has(filePath))
  .sort();

if (missingFiles.length > 0) {
  console.error(
    `Production files missing from coverage:\n${missingFiles.map((file) => `  - ${file}`).join('\n')}`
  );
  process.exitCode = 1;
}
if (unexpectedFiles.length > 0) {
  console.error(
    `Unexpected files in coverage:\n${unexpectedFiles.map((file) => `  - ${file}`).join('\n')}`
  );
  process.exitCode = 1;
}

const incompleteFiles: string[] = [];
const aggregate: CoverageMetrics = {
  statements: { covered: 0, total: 0 },
  branches: { covered: 0, total: 0 },
  functions: { covered: 0, total: 0 },
  lines: { covered: 0, total: 0 },
};

for (const filePath of productionFiles) {
  const coverage = coveredFiles.get(filePath);
  if (!coverage) continue;

  const metrics = getMetrics(coverage);
  for (const metricName of Object.keys(aggregate) as Array<keyof CoverageMetrics>) {
    aggregate[metricName].covered += metrics[metricName].covered;
    aggregate[metricName].total += metrics[metricName].total;
  }

  if (Object.values(metrics).some((metric) => !isComplete(metric))) {
    incompleteFiles.push(
      `${filePath}: ${Object.entries(metrics)
        .map(([name, metric]) => `${name} ${formatMetric(metric)}`)
        .join(', ')}`
    );
  }
}

if (incompleteFiles.length > 0) {
  console.error(
    `Files below exact 100% coverage:\n${incompleteFiles.map((file) => `  - ${file}`).join('\n')}`
  );
  process.exitCode = 1;
}

const incompleteAggregate = Object.values(aggregate).some((metric) => !isComplete(metric));
if (incompleteAggregate) {
  console.error(
    `Aggregate coverage is below exact 100%: ${Object.entries(aggregate)
      .map(([name, metric]) => `${name} ${formatMetric(metric)}`)
      .join(', ')}`
  );
  process.exitCode = 1;
}

if (process.exitCode !== 1) {
  console.log(`Coverage census passed: ${productionFiles.length} production files at exact 100%.`);
}

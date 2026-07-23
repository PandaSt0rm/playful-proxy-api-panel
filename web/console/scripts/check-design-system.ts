import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type DesignSystemViolationCode =
  | 'backdrop'
  | 'blur'
  | 'duplicate-selector'
  | 'floating-surface'
  | 'gradient'
  | 'inline-style'
  | 'legacy-token'
  | 'radius'
  | 'shadow'
  | 'transition-all';

export interface DesignSystemViolation {
  code: DesignSystemViolationCode;
  filePath: string;
  line: number;
  declaration: string;
}

interface SourceBlock {
  header: string;
  start: number;
  end: number;
}

const legacyTokenPattern =
  /--(?:bg(?:-[\w-]+)?|text(?:-[\w-]+)?|border(?:-[\w-]+)?|primary(?:-[\w-]+)?|floating(?:-[\w-]+)?|glass(?:-[\w-]+)?|shadow(?:-[\w-]+)?|radius(?:-[\w-]+)?|(?:success|warning|error|danger|info|quota-medium)-color|warning-(?:bg|border|text)|(?:success|failure|count)-badge-[\w-]+|accent-tertiary|focus-offset)/g;
const intrinsicCircleSelectorPattern =
  /(?:^|[\s>+~,.#:&])((?:loading[-_])?spinner|status[-_]?dot|health[-_]?dot|dirty[-_]?dot|radio[-_]?dot)(?:$|[\s>+~,.#:&[])/i;
const duplicateSelectorPattern =
  /(?:^|[\s>+~,])\.(?:pill|status-badge|global-switch)(?:$|[\s>+~,.#:[{])/;
const floatingSelectorPattern = /\.(?:floating|glass)[\w-]*/i;

function getLine(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function normalizeDeclaration(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/;$/, '');
}

function findBlocks(source: string): SourceBlock[] {
  const blocks: SourceBlock[] = [];
  const stack: Array<{ header: string; start: number }> = [];
  let segmentStart = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') {
      const header = source.slice(segmentStart, index).trim();
      stack.push({ header, start: index });
      segmentStart = index + 1;
    } else if (character === '}') {
      const block = stack.pop();
      if (block) blocks.push({ ...block, end: index });
      segmentStart = index + 1;
    } else if (character === ';') {
      segmentStart = index + 1;
    }
  }

  return blocks;
}

function getSelectorPath(blocks: readonly SourceBlock[], index: number): string {
  return blocks
    .filter(({ start, end }) => start < index && end > index)
    .sort((left, right) => left.start - right.start)
    .map(({ header }) => header)
    .join(' ');
}

function pushViolation(
  violations: DesignSystemViolation[],
  filePath: string,
  source: string,
  index: number,
  code: DesignSystemViolationCode,
  declaration: string
): void {
  violations.push({
    code,
    filePath,
    line: getLine(source, index),
    declaration: normalizeDeclaration(declaration),
  });
}

export function scanDesignSystemSource(filePath: string, source: string): DesignSystemViolation[] {
  const violations: DesignSystemViolation[] = [];
  const blocks = findBlocks(source);

  for (const match of source.matchAll(legacyTokenPattern)) {
    pushViolation(violations, filePath, source, match.index, 'legacy-token', match[0]);
  }

  const declarationPattern = /([\w-]+)\s*:\s*([^;]+);/g;
  for (const match of source.matchAll(declarationPattern)) {
    const [declaration, property, rawValue] = match;
    const value = rawValue.trim();
    const selectorPath = getSelectorPath(blocks, match.index);

    if (property === 'border-radius') {
      const isSquare = value === '0' || value === '$radius-square';
      const isNamedCircle =
        value === '$radius-circle' && intrinsicCircleSelectorPattern.test(selectorPath);
      const isMappingConnection =
        value === '$radius-circle' &&
        filePath === 'src/components/modelAlias/ModelMappingDiagram.module.scss' &&
        /(?:^|\s)\.dot(?:\s|$)/.test(selectorPath);
      if (!isSquare && !isNamedCircle && !isMappingConnection) {
        pushViolation(violations, filePath, source, match.index, 'radius', declaration);
      }
    }

    if ((property === 'box-shadow' || property === 'text-shadow') && value !== 'none') {
      pushViolation(violations, filePath, source, match.index, 'shadow', declaration);
    }

    if (property === 'backdrop-filter' || property === '-webkit-backdrop-filter') {
      pushViolation(violations, filePath, source, match.index, 'backdrop', declaration);
    }

    if (property === 'filter') {
      if (/drop-shadow\s*\(/.test(value)) {
        pushViolation(violations, filePath, source, match.index, 'shadow', declaration);
      }
      if (/blur\s*\(/.test(value)) {
        pushViolation(violations, filePath, source, match.index, 'blur', declaration);
      }
    }

    if (property === 'transition' && /(?:^|,)\s*all(?:\s|$)/.test(value)) {
      pushViolation(violations, filePath, source, match.index, 'transition-all', declaration);
    }
  }

  for (const match of source.matchAll(/\b(?:linear|radial)-gradient\s*\(/g)) {
    const selectorPath = getSelectorPath(blocks, match.index);
    const isDashboardDataRule =
      filePath === 'src/pages/DashboardPage.module.scss' &&
      /(?:^|\s)\.trendPanel(?:\s|$)/.test(selectorPath);
    if (!isDashboardDataRule) {
      pushViolation(violations, filePath, source, match.index, 'gradient', match[0]);
    }
  }

  for (const match of source.matchAll(/\b(?:boxShadow|borderRadius)\s*:/g)) {
    pushViolation(violations, filePath, source, match.index, 'inline-style', match[0]);
  }

  for (const block of blocks) {
    if (duplicateSelectorPattern.test(block.header)) {
      pushViolation(
        violations,
        filePath,
        source,
        block.start - block.header.length,
        'duplicate-selector',
        block.header
      );
    }
    if (floatingSelectorPattern.test(block.header)) {
      pushViolation(
        violations,
        filePath,
        source,
        block.start - block.header.length,
        'floating-surface',
        block.header
      );
    }
  }

  return violations.sort(
    (left, right) => left.line - right.line || left.code.localeCompare(right.code)
  );
}

async function listProductionSources(consoleRoot: string): Promise<string[]> {
  const sources: string[] = [];
  const glob = new Bun.Glob('src/**/*.{scss,ts,tsx}');

  for await (const filePath of glob.scan({ cwd: consoleRoot, onlyFiles: true })) {
    const normalizedPath = relative(consoleRoot, resolve(consoleRoot, filePath)).replaceAll(
      '\\',
      '/'
    );
    if (
      normalizedPath.startsWith('src/test/') ||
      normalizedPath.endsWith('.d.ts') ||
      /\.(?:test|spec)\.(?:ts|tsx)$/.test(normalizedPath)
    ) {
      continue;
    }
    sources.push(normalizedPath);
  }

  return sources.sort();
}

async function main(): Promise<void> {
  const consoleRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const violations: DesignSystemViolation[] = [];
  const sources = await listProductionSources(consoleRoot);

  for (const filePath of sources) {
    const source = await Bun.file(resolve(consoleRoot, filePath)).text();
    violations.push(...scanDesignSystemSource(filePath, source));
  }

  if (violations.length > 0) {
    console.error(
      `Route Foundry design-system violations (${violations.length}):\n${violations
        .map(
          ({ filePath, line, code, declaration }) =>
            `  - ${filePath}:${line} [${code}] ${declaration}`
        )
        .join('\n')}`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Route Foundry design-system check passed: ${sources.length} production sources.`);
}

if (
  import.meta.url.startsWith('file:') &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}

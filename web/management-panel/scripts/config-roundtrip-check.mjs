import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { parse as parseYaml } from 'yaml';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const server = await createServer({
  appType: 'custom',
  configFile: false,
  logLevel: 'error',
  optimizeDeps: {
    entries: [],
    noDiscovery: true,
  },
  root,
  resolve: {
    alias: {
      '@': path.join(root, 'src'),
      react: path.join(root, 'scripts/react-hook-shim.mjs'),
    },
  },
  server: {
    middlewareMode: true,
  },
});

const visualFixture = `
host: 127.0.0.1
port: 8317
remote-management:
  allow-remote: true
  secret-key: local-secret
  disable-control-panel: false
  disable-auto-update-panel: true
  panel-github-repository: PandaSt0rm/playful-proxy-api-panel
pprof:
  enable: true
  addr: 127.0.0.1:6060
proxy-url: http://proxy-old.local:7890
error-logs-max-files: 7
request-log: true
usage-statistics-enabled: true
usage-statistics-path: data/usage.jsonl
usage-statistics-flush-interval-seconds: 15
redis-usage-queue-retention-seconds: 600
disable-cooling: true
auth-auto-refresh-workers: 3
passthrough-headers: true
disable-image-generation: chat
enable-gemini-cli-endpoint: true
upstream-concurrency:
  default: 8
  providers:
    codex: 2
    claude: 4
  queue-timeout-seconds: 30
antigravity-signature-cache-enabled: true
antigravity-signature-bypass-strict: true
claude-header-defaults:
  user-agent: claude-cli/1.2.3
  package-version: 1.2.3
  runtime-version: node-v22
  os: linux
  arch: x64
  timeout: 45s
  stabilize-device-profile: true
codex-header-defaults:
  user-agent: codex-cli/0.10.0
  beta-features: responses
`;

function assertVisualRoundTrip(useVisualConfig, resetHookState) {
  resetHookState();
  const initialHook = useVisualConfig();
  assert.deepEqual(initialHook.loadVisualValuesFromYaml(visualFixture), { ok: true });

  const loadedHook = useVisualConfig();
  assert.equal(loadedHook.visualValues.rmDisableAutoUpdatePanel, true);
  assert.equal(loadedHook.visualValues.errorLogsMaxFiles, '7');
  assert.equal(loadedHook.visualValues.requestLog, true);
  assert.equal(loadedHook.visualValues.usageStatisticsEnabled, true);
  assert.equal(loadedHook.visualValues.usageStatisticsFlushIntervalSeconds, '15');
  assert.equal(loadedHook.visualValues.redisUsageQueueRetentionSeconds, '600');
  assert.equal(loadedHook.visualValues.disableCooling, true);
  assert.equal(loadedHook.visualValues.authAutoRefreshWorkers, '3');
  assert.equal(loadedHook.visualValues.pprofEnable, true);
  assert.equal(loadedHook.visualValues.pprofAddr, '127.0.0.1:6060');
  assert.equal(loadedHook.visualValues.passthroughHeaders, true);
  assert.equal(loadedHook.visualValues.disableImageGeneration, 'chat');
  assert.equal(loadedHook.visualValues.enableGeminiCliEndpoint, true);
  assert.equal(loadedHook.visualValues.upstreamConcurrency.defaultLimit, '8');
  assert.deepEqual(
    loadedHook.visualValues.upstreamConcurrency.providerLimits.map((entry) => ({
      provider: entry.provider,
      limit: entry.limit,
    })),
    [
      { provider: 'claude', limit: '4' },
      { provider: 'codex', limit: '2' },
    ]
  );
  assert.equal(loadedHook.visualValues.upstreamConcurrency.queueTimeoutSeconds, '30');
  assert.equal(loadedHook.visualValues.antigravitySignatureCacheEnabled, true);
  assert.equal(loadedHook.visualValues.antigravitySignatureBypassStrict, true);
  assert.equal(loadedHook.visualValues.claudeHeaderDefaults.userAgent, 'claude-cli/1.2.3');
  assert.equal(loadedHook.visualValues.claudeHeaderDefaults.stabilizeDeviceProfile, true);
  assert.equal(loadedHook.visualValues.codexHeaderDefaults.betaFeaturesText, 'responses');

  loadedHook.setVisualValues({ proxyUrl: 'http://proxy-new.local:7890' });
  const dirtyHook = useVisualConfig();
  const updatedYaml = dirtyHook.applyVisualChangesToYaml(visualFixture);
  const parsed = parseYaml(updatedYaml);

  assert.equal(parsed['proxy-url'], 'http://proxy-new.local:7890');
  assert.equal(parsed['remote-management']['disable-auto-update-panel'], true);
  assert.equal(parsed.pprof.enable, true);
  assert.equal(parsed.pprof.addr, '127.0.0.1:6060');
  assert.equal(parsed['error-logs-max-files'], 7);
  assert.equal(parsed['request-log'], true);
  assert.equal(parsed['usage-statistics-enabled'], true);
  assert.equal(parsed['usage-statistics-path'], 'data/usage.jsonl');
  assert.equal(parsed['usage-statistics-flush-interval-seconds'], 15);
  assert.equal(parsed['redis-usage-queue-retention-seconds'], 600);
  assert.equal(parsed['disable-cooling'], true);
  assert.equal(parsed['auth-auto-refresh-workers'], 3);
  assert.equal(parsed['passthrough-headers'], true);
  assert.equal(parsed['disable-image-generation'], 'chat');
  assert.equal(parsed['enable-gemini-cli-endpoint'], true);
  assert.equal(parsed['upstream-concurrency'].default, 8);
  assert.deepEqual(parsed['upstream-concurrency'].providers, { codex: 2, claude: 4 });
  assert.equal(parsed['upstream-concurrency']['queue-timeout-seconds'], 30);
  assert.equal(parsed['antigravity-signature-cache-enabled'], true);
  assert.equal(parsed['antigravity-signature-bypass-strict'], true);
  assert.equal(parsed['claude-header-defaults']['user-agent'], 'claude-cli/1.2.3');
  assert.equal(parsed['claude-header-defaults']['stabilize-device-profile'], true);
  assert.equal(parsed['codex-header-defaults']['beta-features'], 'responses');
}

function assertProviderRoundTrip(transformers, providers, providerUtils) {
  const gemini = transformers.normalizeGeminiKeyConfig({
    'api-key': 'gemini-key',
    'disable-cooling': false,
    'auth-index': 'runtime-index',
    'x-extra': 'preserve',
  });
  const serializedGemini = providers.serializeGeminiKey(gemini);
  assert.equal(serializedGemini['api-key'], 'gemini-key');
  assert.equal(serializedGemini['disable-cooling'], false);
  assert.equal(serializedGemini['x-extra'], 'preserve');
  assert.equal(Object.hasOwn(serializedGemini, 'auth-index'), false);

  const claude = transformers.normalizeProviderKeyConfig({
    'api-key': 'claude-key',
    'disable-cooling': true,
    'experimental-cch-signing': false,
    'auth-index': 'runtime-index',
    cloak: {
      mode: 'stealth',
      'strict-mode': true,
      'sensitive-words': ['secret'],
      'cache-user-id': true,
      'x-extra': 'preserve',
    },
  });
  const serializedClaude = providers.serializeProviderKey(claude);
  assert.equal(serializedClaude['disable-cooling'], true);
  assert.equal(serializedClaude['experimental-cch-signing'], false);
  assert.deepEqual(serializedClaude.cloak['sensitive-words'], ['secret']);
  assert.equal(serializedClaude.cloak['cache-user-id'], true);
  assert.equal(serializedClaude.cloak['x-extra'], 'preserve');
  assert.equal(Object.hasOwn(serializedClaude, 'auth-index'), false);

  const openai = transformers.normalizeOpenAIProvider({
    name: 'local-openai',
    'base-url': 'http://openai.local/v1',
    'disable-cooling': false,
    'auth-index': 'runtime-index',
    'api-key-entries': [
      {
        'api-key': 'openai-key',
        'auth-index': 'entry-runtime-index',
        'x-extra': 'preserve-entry',
      },
    ],
    models: [
      {
        name: 'o4-mini',
        alias: 'fast',
        'x-extra': 'preserve-model',
        thinking: {
          min: 0,
          max: 4096,
          zero_allowed: true,
          dynamic_allowed: false,
          levels: ['low', 'high'],
        },
      },
    ],
  });
  const serializedOpenAI = providers.serializeOpenAIProvider(openai);
  assert.equal(serializedOpenAI['disable-cooling'], false);
  assert.equal(Object.hasOwn(serializedOpenAI, 'auth-index'), false);
  assert.equal(Object.hasOwn(serializedOpenAI['api-key-entries'][0], 'auth-index'), false);
  assert.equal(serializedOpenAI['api-key-entries'][0]['x-extra'], 'preserve-entry');
  assert.equal(serializedOpenAI.models[0]['x-extra'], 'preserve-model');
  assert.deepEqual(serializedOpenAI.models[0].thinking, {
    min: 0,
    max: 4096,
    zero_allowed: true,
    dynamic_allowed: false,
    levels: ['low', 'high'],
  });

  const ampcode = transformers.normalizeAmpcodeConfig({
    'restrict-management-to-localhost': true,
    'model-mappings': [{ from: '^gpt-(.*)$', to: 'openai:$1', regex: true }],
  });
  assert.equal(ampcode.restrictManagementToLocalhost, true);
  assert.deepEqual(ampcode.modelMappings, [{ from: '^gpt-(.*)$', to: 'openai:$1', regex: true }]);
  assert.deepEqual(
    providerUtils.entriesToAmpcodeMappings(
      providerUtils.ampcodeMappingsToEntries(ampcode.modelMappings)
    ),
    [{ from: '^gpt-(.*)$', to: 'openai:$1', regex: true }]
  );
}

function assertProviderConcurrencyHelpers(concurrency) {
  const config = {
    default: 5,
    providers: {
      codex: 2,
      'local-openai': 1,
      claude: 0,
    },
  };

  assert.deepEqual(concurrency.getEffectiveProviderConcurrency(config, 'codex'), {
    source: 'provider',
    limit: 2,
  });
  assert.deepEqual(concurrency.getEffectiveProviderConcurrency(config, 'local-openai'), {
    source: 'provider',
    limit: 1,
  });
  assert.deepEqual(concurrency.getEffectiveProviderConcurrency(config, 'claude'), {
    source: 'provider',
    limit: 0,
  });
  assert.deepEqual(concurrency.getEffectiveProviderConcurrency(config, 'gemini'), {
    source: 'default',
    limit: 5,
  });
  assert.deepEqual(concurrency.getEffectiveProviderConcurrency(undefined, 'gemini'), {
    source: 'unlimited',
  });
}

try {
  const reactShim = await server.ssrLoadModule('/scripts/react-hook-shim.mjs');
  const visual = await server.ssrLoadModule('/src/hooks/useVisualConfig.ts');
  const transformers = await server.ssrLoadModule('/src/services/api/transformers.ts');
  const providers = await server.ssrLoadModule('/src/services/api/providers.ts');
  const providerUtils = await server.ssrLoadModule('/src/components/providers/utils.ts');
  const concurrency = await server.ssrLoadModule('/src/utils/upstreamConcurrency.ts');

  assertVisualRoundTrip(visual.useVisualConfig, reactShim.resetHookState);
  assertProviderRoundTrip(transformers, providers, providerUtils);
  assertProviderConcurrencyHelpers(concurrency);

  console.log('config round-trip checks passed');
} finally {
  await server.close();
}

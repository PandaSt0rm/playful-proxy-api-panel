import { describe, it, expect, beforeEach } from 'vitest';
import { useQuotaStore } from './useQuotaStore';
import type {
  AntigravityQuotaState,
  ClaudeQuotaState,
  CodexQuotaState,
  GeminiCliQuotaState,
  KimiQuotaState,
  XaiQuotaState,
  ZaiQuotaState,
} from '@/types';

const emptyState = {
  antigravityQuota: {},
  claudeQuota: {},
  codexQuota: {},
  geminiCliQuota: {},
  kimiQuota: {},
  zaiQuota: {},
  xaiQuota: {},
};

const claudeState: ClaudeQuotaState = { status: 'success', windows: [] };
const antigravityState: AntigravityQuotaState = { status: 'success', groups: [] };
const codexState: CodexQuotaState = { status: 'success' } as CodexQuotaState;
const geminiState: GeminiCliQuotaState = { status: 'success' } as GeminiCliQuotaState;
const kimiState: KimiQuotaState = { status: 'success' } as KimiQuotaState;
const zaiState: ZaiQuotaState = { status: 'success' } as ZaiQuotaState;
const xaiState: XaiQuotaState = { status: 'success', rows: [] };

describe('useQuotaStore', () => {
  beforeEach(() => {
    useQuotaStore.setState({ ...emptyState });
  });

  describe('value-based updates', () => {
    it('replaces antigravityQuota with the provided record', () => {
      const next = { 'acct-1': antigravityState };

      useQuotaStore.getState().setAntigravityQuota(next);

      expect(useQuotaStore.getState().antigravityQuota).toEqual(next);
    });

    it('replaces claudeQuota with the provided record', () => {
      const next = { 'acct-1': claudeState };

      useQuotaStore.getState().setClaudeQuota(next);

      expect(useQuotaStore.getState().claudeQuota).toEqual(next);
    });

    it('replaces codexQuota with the provided record', () => {
      const next = { 'acct-1': codexState };

      useQuotaStore.getState().setCodexQuota(next);

      expect(useQuotaStore.getState().codexQuota).toEqual(next);
    });

    it('replaces geminiCliQuota with the provided record', () => {
      const next = { 'acct-1': geminiState };

      useQuotaStore.getState().setGeminiCliQuota(next);

      expect(useQuotaStore.getState().geminiCliQuota).toEqual(next);
    });

    it('replaces kimiQuota with the provided record', () => {
      const next = { 'acct-1': kimiState };

      useQuotaStore.getState().setKimiQuota(next);

      expect(useQuotaStore.getState().kimiQuota).toEqual(next);
    });

    it('replaces zaiQuota with the provided record', () => {
      const next = { 'acct-1': zaiState };

      useQuotaStore.getState().setZaiQuota(next);

      expect(useQuotaStore.getState().zaiQuota).toEqual(next);
    });

    it('replaces xaiQuota with the provided record', () => {
      const next = { 'acct-1': xaiState };

      useQuotaStore.getState().setXaiQuota(next);

      expect(useQuotaStore.getState().xaiQuota).toEqual(next);
    });
  });

  describe('functional updates', () => {
    it('receives the previous claudeQuota and merges in a new entry', () => {
      useQuotaStore.setState({ claudeQuota: { existing: claudeState } });

      useQuotaStore.getState().setClaudeQuota((prev) => ({
        ...prev,
        added: { status: 'loading', windows: [] },
      }));

      expect(useQuotaStore.getState().claudeQuota).toEqual({
        existing: claudeState,
        added: { status: 'loading', windows: [] },
      });
    });

    it('passes the empty record as the previous value when no state was set', () => {
      let received: Record<string, AntigravityQuotaState> | null = null;

      useQuotaStore.getState().setAntigravityQuota((prev) => {
        received = prev;
        return prev;
      });

      expect(received).toEqual({});
    });

    it('leaves other provider slices untouched when one slice is updated', () => {
      useQuotaStore.setState({ kimiQuota: { keep: kimiState } });

      useQuotaStore.getState().setClaudeQuota({ 'acct-1': claudeState });

      expect(useQuotaStore.getState().kimiQuota).toEqual({ keep: kimiState });
    });
  });

  describe('clearQuotaCache', () => {
    it('resets every provider slice to an empty record', () => {
      useQuotaStore.setState({
        antigravityQuota: { a: antigravityState },
        claudeQuota: { a: claudeState },
        codexQuota: { a: codexState },
        geminiCliQuota: { a: geminiState },
        kimiQuota: { a: kimiState },
        zaiQuota: { a: zaiState },
        xaiQuota: { a: xaiState },
      });

      useQuotaStore.getState().clearQuotaCache();

      expect(useQuotaStore.getState()).toMatchObject(emptyState);
    });
  });
});

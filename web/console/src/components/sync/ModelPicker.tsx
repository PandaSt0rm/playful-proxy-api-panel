/**
 * Grouped, searchable model picker used by the sync profile form for both
 * the "Active model" (single-select) and "Model filter" (multi-select)
 * controls. Renders a trigger button with a portal-positioned popover so it
 * works correctly inside a Modal.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { IconChevronDown, IconSearch, IconX, IconCheck } from '@/components/ui/icons';
import type { ModelGroup } from './modelGrouping';
import styles from './sync.module.scss';

type SingleProps = {
  mode: 'active';
  value: string;
  onChange: (value: string) => void;
};

type MultiProps = {
  mode: 'filter-list';
  values: string[];
  onChange: (values: string[]) => void;
};

type ModelPickerProps = (SingleProps | MultiProps) & {
  groups: ModelGroup[];
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  emptyHint?: string;
  searchPlaceholder?: string;
  triggerId?: string;
};

const POPOVER_OFFSET = 6;
const POPOVER_MAX_HEIGHT = 360;
const POPOVER_MIN_HEIGHT = 200;
const VIEWPORT_MARGIN = 8;
const Z_INDEX = 2020;

function resolvePopoverStyle(anchor: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.max(280, Math.min(rect.width, viewportWidth - VIEWPORT_MARGIN * 2));
  const left = Math.min(
    Math.max(rect.left, VIEWPORT_MARGIN),
    Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN)
  );
  const spaceBelow = viewportHeight - rect.bottom - POPOVER_OFFSET - VIEWPORT_MARGIN;
  const spaceAbove = rect.top - POPOVER_OFFSET - VIEWPORT_MARGIN;
  const openDown = spaceBelow >= POPOVER_MIN_HEIGHT || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(
    POPOVER_MIN_HEIGHT,
    Math.min(POPOVER_MAX_HEIGHT, openDown ? spaceBelow : spaceAbove)
  );
  return openDown
    ? {
        position: 'fixed',
        top: rect.bottom + POPOVER_OFFSET,
        left,
        width,
        maxHeight,
        zIndex: Z_INDEX,
      }
    : {
        position: 'fixed',
        bottom: viewportHeight - rect.top + POPOVER_OFFSET,
        left,
        width,
        maxHeight,
        zIndex: Z_INDEX,
      };
}

export function ModelPicker(props: ModelPickerProps) {
  const {
    groups,
    loading,
    disabled,
    placeholder,
    ariaLabel,
    emptyHint,
    searchPlaceholder,
    triggerId,
  } = props;

  const generatedId = useId();
  const buttonId = triggerId ?? `model-picker-${generatedId}`;
  const popoverId = `${buttonId}-popover`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const isOpen = open && !disabled;

  const openPopover = useCallback(() => {
    if (disabled) return;
    setQuery('');
    setOpen(true);
  }, [disabled]);

  const closePopover = useCallback(() => {
    setOpen(false);
  }, []);

  const togglePopover = useCallback(() => {
    if (disabled) return;
    if (open) {
      closePopover();
    } else {
      openPopover();
    }
  }, [disabled, open, openPopover, closePopover]);

  // Position the popover when opened, reposition on resize/scroll.
  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      setPopoverStyle(resolvePopoverStyle(triggerRef.current));
    }
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const handle = () => updatePosition();
    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, true);
    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
    };
  }, [isOpen, updatePosition]);

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      closePopover();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, closePopover]);

  // Focus the search input when opening for fast keyboard-first filtering.
  useEffect(() => {
    if (!isOpen) return;
    const id = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [isOpen]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return groups;
    return groups
      .map((g) => ({
        ...g,
        models: g.models.filter(
          (m) => m.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.models.length > 0);
  }, [groups, query]);

  const selectedSet = useMemo(() => {
    if (props.mode === 'filter-list') return new Set(props.values);
    return new Set<string>();
  }, [props]);

  const triggerLabel = useMemo(() => {
    if (props.mode === 'active') {
      return props.value || placeholder || 'Select model';
    }
    if (props.values.length === 0) {
      return placeholder || 'Add models';
    }
    return `${props.values.length} model${props.values.length === 1 ? '' : 's'} selected`;
  }, [props, placeholder]);

  const isPlaceholderText =
    (props.mode === 'active' && !props.value) ||
    (props.mode === 'filter-list' && props.values.length === 0);

  const commit = useCallback(
    (modelId: string) => {
      if (props.mode === 'active') {
        props.onChange(modelId);
        closePopover();
        return;
      }
      const next = new Set(props.values);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      props.onChange(Array.from(next));
    },
    [props, closePopover]
  );

  const removeChip = useCallback(
    (modelId: string) => {
      if (props.mode !== 'filter-list') return;
      props.onChange(props.values.filter((v) => v !== modelId));
    },
    [props]
  );

  const clearAll = useCallback(() => {
    if (props.mode === 'filter-list') props.onChange([]);
    else props.onChange('');
  }, [props]);

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      openPopover();
    }
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePopover();
      triggerRef.current?.focus();
    }
  };

  const popover =
    isOpen && popoverStyle ? (
      <div
        ref={popoverRef}
        id={popoverId}
        className={styles.modelPickerPopover}
        role="dialog"
        aria-label={ariaLabel}
        style={popoverStyle}
      >
        <div className={styles.modelPickerSearch}>
          <span className={styles.modelPickerSearchIcon} aria-hidden="true">
            <IconSearch size={14} />
          </span>
          <input
            ref={searchRef}
            type="search"
            className={styles.modelPickerSearchInput}
            placeholder={searchPlaceholder ?? 'Search models'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
          />
        </div>

        <div className={styles.modelPickerBody}>
          {loading ? (
            <div className={styles.modelPickerEmpty}>Loading…</div>
          ) : filteredGroups.length === 0 ? (
            <div className={styles.modelPickerEmpty}>{emptyHint ?? 'No models found'}</div>
          ) : (
            filteredGroups.map((g) => (
              <div key={g.key} className={styles.modelGroup}>
                <div className={styles.modelGroupTitle}>
                  <span>{g.label}</span>
                  {g.sublabel && <span className={styles.modelGroupSublabel}>{g.sublabel}</span>}
                </div>
                <ul className={styles.modelGroupList}>
                  {g.models.map((m) => {
                    const active = props.mode === 'active' ? props.value === m : selectedSet.has(m);
                    return (
                      <li key={m}>
                        <button
                          type="button"
                          className={`${styles.modelRow} ${active ? styles.modelRowActive : ''}`}
                          onClick={() => commit(m)}
                          role={props.mode === 'filter-list' ? 'checkbox' : 'option'}
                          aria-checked={props.mode === 'filter-list' ? active : undefined}
                          aria-selected={props.mode === 'active' ? active : undefined}
                        >
                          {props.mode === 'filter-list' && (
                            <span
                              className={`${styles.modelRowCheckbox} ${active ? styles.modelRowCheckboxActive : ''}`}
                              aria-hidden="true"
                            >
                              {active && <IconCheck size={12} />}
                            </span>
                          )}
                          <span className={styles.modelRowId}>{m}</span>
                          {props.mode === 'active' && active && (
                            <span className={styles.modelRowCheck} aria-hidden="true">
                              <IconCheck size={14} />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        {props.mode === 'filter-list' && props.values.length > 0 && (
          <div className={styles.modelPickerFooter}>
            <button type="button" className={styles.modelPickerClearLink} onClick={clearAll}>
              Clear all
            </button>
            <span className={styles.modelPickerCount}>{props.values.length} selected</span>
          </div>
        )}
      </div>
    ) : null;

  return (
    <div className={styles.modelPickerWrap}>
      <button
        ref={triggerRef}
        id={buttonId}
        type="button"
        className={`${styles.modelPickerTrigger} ${isPlaceholderText ? styles.modelPickerTriggerPlaceholder : ''}`}
        onClick={togglePopover}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? popoverId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <span className={styles.modelPickerTriggerText}>{triggerLabel}</span>
        <span className={styles.modelPickerTriggerIcon} aria-hidden="true">
          <IconChevronDown size={14} />
        </span>
      </button>

      {props.mode === 'filter-list' && props.values.length > 0 && (
        <div className={styles.modelChipRow}>
          {props.values.map((v) => (
            <span key={v} className={styles.modelChip}>
              <span className={styles.modelChipLabel}>{v}</span>
              <button
                type="button"
                className={styles.modelChipRemove}
                onClick={() => removeChip(v)}
                aria-label={`Remove ${v}`}
                disabled={disabled}
              >
                <IconX size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {popover &&
        (typeof document === 'undefined' ? popover : createPortal(popover, document.body))}
    </div>
  );
}

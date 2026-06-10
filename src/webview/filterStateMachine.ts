/**
 * Pure state-machine helpers for the top-bar filter dropdowns (Priority /
 * Type / Status). Kept free of DOM access and of the `vscode` API so the
 * transitions and label formatting can be unit-tested directly under mocha.
 *
 * The dropdown markup hosts two kinds of rows:
 *   - **Preset rows** (data-preset="all" | "active") whose checked state is
 *     *derived* from the selection — clicking one drives a state transition
 *     but the row itself is not a filter value.
 *   - **Value rows** whose checked state IS the source of truth for which
 *     values pass through getFilteredCards.
 *
 * Inclusive-multiselect semantics:
 *   - selected = []                   → "None" (no issues match the filter)
 *   - selected = full universe        → "All"   (the All preset is checked)
 *   - selected = active subset (Status only) → "Active" (the Active preset is checked)
 *   - any other subset                → that explicit subset is the filter
 */

export interface FilterUniverse {
  /** Human-facing label prefix, e.g. "Status". */
  prefix: string;
  /** The complete set of selectable values for this filter. */
  allValues: readonly string[];
  /** Optional preset subset (Status only). */
  activeValues?: readonly string[];
  /** Pretty-format a single value for the label, e.g. "in_progress" → "In Progress". */
  formatValue: (value: string) => string;
}

export type FilterTarget =
  | { kind: 'preset'; preset: 'all' | 'active' }
  | { kind: 'individual'; value: string };

/** Set-equality on string arrays, order-independent and duplicate-tolerant. */
export function selectionEquals(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) { return false; }
  for (const v of sa) {
    if (!sb.has(v)) { return false; }
  }
  return true;
}

/**
 * Compute the new selection array after the user clicks a row in the dropdown.
 *
 * State-machine transitions:
 *   - Click "All" while All-checked     → []                  (clears)
 *   - Click "All" while All-unchecked   → [...allValues]      (selects all)
 *   - Click "Active" while Active-checked → [...allValues]    (switches to All)
 *   - Click "Active" while Active-unchecked → [...activeValues]
 *   - Click individual value:
 *       - if currently selected         → remove it
 *       - if not selected               → add it (preserving universe order)
 *
 * Returns a fresh array. The current array is not mutated.
 */
export function nextFilterSelection(
  current: readonly string[],
  target: FilterTarget,
  universe: FilterUniverse
): string[] {
  if (target.kind === 'preset') {
    if (target.preset === 'all') {
      if (selectionEquals(current, universe.allValues)) { return []; }
      return [...universe.allValues];
    }
    // Active preset: only meaningful when activeValues is defined.
    if (!universe.activeValues) {
      return [...current];
    }
    if (selectionEquals(current, universe.activeValues)) {
      return [...universe.allValues];
    }
    return [...universe.activeValues];
  }
  // Individual value toggle.
  const value = target.value;
  const set = new Set(current);
  if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
  }
  // Re-emit in universe order so the result is deterministic across callers
  // that round-trip through arrays (e.g., persistence and tests).
  return universe.allValues.filter(v => set.has(v));
}

/**
 * Compute the human-facing label string from the current selection.
 *
 * Ordering of checks: empty → universe-all → active-subset → single →
 * arbitrary-multi. The single-value case takes priority over the "N selected"
 * fallback so the user sees the actual filter value when only one is on.
 */
export function computeFilterLabel(
  selected: readonly string[],
  universe: FilterUniverse
): string {
  if (selected.length === 0) {
    return `${universe.prefix}: None`;
  }
  if (selectionEquals(selected, universe.allValues)) {
    return `${universe.prefix}: All`;
  }
  if (universe.activeValues && selectionEquals(selected, universe.activeValues)) {
    return `${universe.prefix}: Active`;
  }
  if (selected.length === 1) {
    return `${universe.prefix}: ${universe.formatValue(selected[0])}`;
  }
  return `${universe.prefix}: ${selected.length} selected`;
}

/**
 * Whether the given preset row should appear checked for the current
 * selection. The webview uses this when re-deriving preset checkboxes after
 * any selection change (whether driven by a click or by restoring persisted
 * state).
 */
export function isPresetChecked(
  selected: readonly string[],
  preset: 'all' | 'active',
  universe: FilterUniverse
): boolean {
  if (preset === 'all') {
    return selectionEquals(selected, universe.allValues);
  }
  if (!universe.activeValues) { return false; }
  return selectionEquals(selected, universe.activeValues);
}

/**
 * Pretty-format a status value for the single-value label case.
 * Exposed for reuse by tests and by the webview's label callsite.
 */
export function formatStatusValue(value: string): string {
  return value
    .split('_')
    .map(part => part.length === 0 ? part : part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Pretty-format a type value: lowercase issue type → title-cased.
 */
export function formatTypeValue(value: string): string {
  if (value.length === 0) { return value; }
  return value[0].toUpperCase() + value.slice(1);
}

/**
 * Pretty-format a priority value: numeric string → "P{n}".
 */
export function formatPriorityValue(value: string): string {
  return `P${value}`;
}

/**
 * Pure helpers for the Tree view: build a displayed parent/child hierarchy
 * from a flat card list, then flatten it into renderable rows with
 * connector-line structure. Kept free of DOM access and of the `vscode`
 * API so the construction, filtering, sorting, and connector logic can be
 * unit-tested directly under mocha.
 *
 * Structure derives from each card's `parent` pointer only; `children`
 * arrays on cards are intentionally ignored, which makes duplicate or
 * dangling child references harmless. A card is a top-level row when it
 * has no parent, when its parent id is not present in the input set
 * (orphan rule), or when its parent edge was severed to break a cycle.
 *
 * Filtering follows the "matches plus full ancestor chains" rule: the
 * displayed tree contains every matched card plus all of its ancestors,
 * with non-matching ancestors flagged so the renderer can de-emphasize
 * them as context rows.
 */

export interface TreeCardInput {
  id: string;
  title?: string;
  parent?: { id: string; title?: string } | null;
  updated_at?: string;
  created_at?: string;
  priority?: number;
}

export interface TreeSortSpec {
  id: 'updated_at' | 'priority' | 'title' | 'created_at';
  dir: 'asc' | 'desc';
}

export const DEFAULT_TREE_SORT: TreeSortSpec = { id: 'updated_at', dir: 'desc' };

/** A node in the displayed tree (filters + ancestor-chain rule applied). */
export interface TreeNode {
  id: string;
  /** 0 = top-level row. */
  depth: number;
  /** False when this node is only included as ancestor context. */
  matches: boolean;
  /** True when any strict descendant matches (drives auto-expand). */
  descendantMatch: boolean;
  /** Displayed children only, sibling-sorted. */
  children: TreeNode[];
}

/** One flat renderable row produced by flattenVisibleRows. */
export interface TreeRow {
  id: string;
  depth: number;
  /**
   * Connector structure for the row, one entry per ancestor level below
   * the root level: true = that ancestor has a later displayed sibling
   * (render a vertical passthrough guide), false = blank spacer. Always
   * empty for depth 0 and depth 1 rows (top-level rows are flush and
   * contribute no guide column of their own).
   */
  guides: boolean[];
  /** Last displayed sibling under its parent (elbow vs tee joiner). */
  isLast: boolean;
  /** Has displayed children (drives caret presence). */
  hasChildren: boolean;
  /** Effective expansion used for this render. */
  expanded: boolean;
  matches: boolean;
}

/** Default per-node expansion: top-level rows expanded, deeper collapsed. */
export function defaultExpanded(depth: number): boolean {
  return depth === 0;
}

/**
 * Resolve each card's effective parent edge: the raw `parent.id` when it
 * points at another card in the input set, severed for self-parents,
 * orphans, and cycle-closing edges. Cards are processed in ascending id
 * order so cycle breaks are deterministic regardless of input order.
 */
function resolveParents(byId: Map<string, TreeCardInput>): Map<string, string | undefined> {
  const rawParent = (id: string): string | undefined => {
    const p = byId.get(id)?.parent?.id;
    return p && p !== id && byId.has(p) ? p : undefined;
  };

  const severed = new Set<string>();
  const resolved = new Set<string>();
  const sortedIds = [...byId.keys()].sort();
  for (const start of sortedIds) {
    if (resolved.has(start)) { continue; }
    const chain: string[] = [];
    const chainSet = new Set<string>();
    let cur: string | undefined = start;
    while (cur !== undefined && !resolved.has(cur)) {
      if (chainSet.has(cur)) {
        // The previous chain entry's parent edge closes a cycle — sever it.
        severed.add(chain[chain.length - 1]);
        break;
      }
      chain.push(cur);
      chainSet.add(cur);
      cur = severed.has(cur) ? undefined : rawParent(cur);
    }
    for (const id of chain) { resolved.add(id); }
  }

  const effective = new Map<string, string | undefined>();
  for (const id of byId.keys()) {
    effective.set(id, severed.has(id) ? undefined : rawParent(id));
  }
  return effective;
}

function makeComparator(
  byId: Map<string, TreeCardInput>,
  sort: TreeSortSpec
): (a: string, b: string) => number {
  const dirMul = sort.dir === 'asc' ? 1 : -1;
  return (aId, bId) => {
    const a = byId.get(aId);
    const b = byId.get(bId);
    let cmp = 0;
    switch (sort.id) {
      case 'priority':
        // Default to medium priority, matching getSortedCards.
        cmp = (a?.priority ?? 2) - (b?.priority ?? 2);
        break;
      case 'title':
        cmp = (a?.title || '').toLowerCase().localeCompare((b?.title || '').toLowerCase());
        break;
      case 'created_at':
        cmp = new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime();
        break;
      case 'updated_at':
      default:
        cmp = new Date(a?.updated_at || 0).getTime() - new Date(b?.updated_at || 0).getTime();
        break;
    }
    if (cmp !== 0) { return cmp * dirMul; }
    // Stable, direction-independent tie-break so sibling order (and with it
    // the connector structure) is deterministic.
    return aId < bId ? -1 : aId > bId ? 1 : 0;
  };
}

/**
 * Build the displayed tree from a flat card list.
 *
 * @param cards      Every loaded card (typically cardCache.values()).
 * @param matchedIds Ids that pass the active filters + search. Cards outside
 *                   this set appear only as ancestor context of a match.
 * @param sort       Sibling sort spec, applied at every level independently.
 * @returns Sorted top-level nodes of the displayed tree.
 */
export function buildDisplayTree(
  cards: readonly TreeCardInput[],
  matchedIds: ReadonlySet<string>,
  sort: TreeSortSpec
): TreeNode[] {
  const byId = new Map<string, TreeCardInput>();
  for (const card of cards) {
    if (card && typeof card.id === 'string' && card.id.length > 0) {
      byId.set(card.id, card);
    }
  }
  const parentOf = resolveParents(byId);

  // Displayed set = matches plus every ancestor of a match.
  const displayed = new Set<string>();
  for (const id of matchedIds) {
    let cur: string | undefined = id;
    while (cur !== undefined && byId.has(cur) && !displayed.has(cur)) {
      displayed.add(cur);
      cur = parentOf.get(cur);
    }
  }

  // Group displayed ids under their displayed parent (ancestor inclusion
  // guarantees a displayed card's parent is displayed too).
  const childIds = new Map<string | undefined, string[]>();
  for (const id of displayed) {
    const parent = parentOf.get(id);
    const key = parent !== undefined && displayed.has(parent) ? parent : undefined;
    const list = childIds.get(key);
    if (list) { list.push(id); } else { childIds.set(key, [id]); }
  }

  const comparator = makeComparator(byId, sort);
  const build = (id: string, depth: number): TreeNode => {
    const kids = (childIds.get(id) || []).sort(comparator).map(k => build(k, depth + 1));
    return {
      id,
      depth,
      matches: matchedIds.has(id),
      descendantMatch: kids.some(k => k.matches || k.descendantMatch),
      children: kids
    };
  };
  return (childIds.get(undefined) || []).sort(comparator).map(id => build(id, 0));
}

/**
 * Flatten the displayed tree into renderable rows, honoring expansion.
 *
 * A node's children are emitted when the node is expanded, or — while a
 * filter is active — when any descendant matches. The auto-expand keeps the
 * "every matching issue renders" invariant without mutating stored
 * expansion state; collapsed branches with no matches stay hidden.
 *
 * @param roots        Output of buildDisplayTree.
 * @param isExpanded   Expansion lookup, e.g. overrides[id] ?? defaultExpanded(depth).
 * @param filterActive Whether a filter or search currently narrows the board.
 */
export function flattenVisibleRows(
  roots: readonly TreeNode[],
  isExpanded: (id: string, depth: number) => boolean,
  filterActive: boolean
): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (node: TreeNode, guides: boolean[], isLast: boolean): void => {
    const expanded = node.children.length > 0
      && (isExpanded(node.id, node.depth) || (filterActive && node.descendantMatch));
    rows.push({
      id: node.id,
      depth: node.depth,
      guides,
      isLast,
      hasChildren: node.children.length > 0,
      expanded,
      matches: node.matches
    });
    if (!expanded) { return; }
    // Top-level rows are flush and contribute no guide column; deeper rows
    // add one segment for themselves when recursing into their children.
    const childGuides = node.depth === 0 ? [] : [...guides, !isLast];
    node.children.forEach((child, i) => {
      walk(child, childGuides, i === node.children.length - 1);
    });
  };
  roots.forEach((root, i) => walk(root, [], i === roots.length - 1));
  return rows;
}

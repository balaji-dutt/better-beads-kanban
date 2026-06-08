/**
 * Pure helper that turns a card's relationship fields into a compact list of
 * badge descriptors for the Kanban card row. Kept free of DOM access and of
 * the `vscode` API so it can be unit-tested directly under mocha.
 *
 * Ordering mirrors the detail dialog's Structure section
 * (Blocked By -> Blocks -> Children) so the card surface is consistent with
 * the dialog. Parent is intentionally not represented here -- the card has a
 * dedicated title-rich `.cardParent` line above the title.
 */

export interface RelationshipLike {
  id?: string;
  title?: string;
}

export interface CardLike {
  blocked_by?: RelationshipLike[];
  blocks?: RelationshipLike[];
  children?: RelationshipLike[];
  blocked_by_count?: number;
}

export interface CardRelationshipBadge {
  text: string;
  cls: string;
  title: string;
}

const BLOCKED_BY_GLYPH = '⛔'; // no entry
const BLOCKS_GLYPH = '→';     // rightwards arrow
const CHILDREN_GLYPH = '⤷';   // arrow pointing downwards then curving right

function joinTitles(deps: RelationshipLike[]): string {
  return deps
    .map(d => (d.title || d.id || '').toString().trim())
    .filter(t => t.length > 0)
    .map(t => `• ${t}`)
    .join('\n');
}

export function buildRelationshipBadges(card: CardLike): CardRelationshipBadge[] {
  const out: CardRelationshipBadge[] = [];

  const blockedBy = Array.isArray(card.blocked_by) ? card.blocked_by : [];
  if (blockedBy.length > 0) {
    out.push({
      text: `${BLOCKED_BY_GLYPH} ${blockedBy.length}`,
      cls: 'badge-rel-blocked-by',
      title: `Blocked by:\n${joinTitles(blockedBy)}`
    });
  } else if ((card.blocked_by_count || 0) > 0) {
    const n = card.blocked_by_count as number;
    out.push({
      text: `blocked:${n}`,
      cls: 'badge-blocked',
      title: `Blocked by ${n} issue${n === 1 ? '' : 's'} (titles not loaded)`
    });
  }

  const blocks = Array.isArray(card.blocks) ? card.blocks : [];
  if (blocks.length > 0) {
    out.push({
      text: `${BLOCKS_GLYPH} ${blocks.length}`,
      cls: 'badge-rel-blocks',
      title: `Blocks:\n${joinTitles(blocks)}`
    });
  }

  const children = Array.isArray(card.children) ? card.children : [];
  if (children.length > 0) {
    out.push({
      text: `${CHILDREN_GLYPH} ${children.length}`,
      cls: 'badge-rel-children',
      title: `Children:\n${joinTitles(children)}`
    });
  }

  return out;
}

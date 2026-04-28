import { describe, expect, test } from 'bun:test';
import {
  buildPartyTagsValuesSql,
  normalizePartyTagPayload,
  type PartyTag,
} from './party-tags';

describe('normalizePartyTagPayload', () => {
  test('accepts NAS API payloads with a tags array', () => {
    const tags = normalizePartyTagPayload({
      tags: [
        { filer_id: '00040542', party: 'DEMOCRAT', tagged_at: '2026-01-01T00:00:00Z' },
        { filer_id: '00019652', party: 'REPUBLICAN', tagged_at: '2026-01-01T00:00:00Z' },
      ],
    });

    expect(tags).toEqual([
      { filer_id: '00040542', party: 'DEMOCRAT', tagged_at: '2026-01-01T00:00:00Z' },
      { filer_id: '00019652', party: 'REPUBLICAN', tagged_at: '2026-01-01T00:00:00Z' },
    ]);
  });

  test('filters invalid parties and malformed records', () => {
    const tags = normalizePartyTagPayload({
      tags: [
        { filer_id: '00040542', party: 'DEMOCRAT' },
        { filer_id: '00000000', party: 'Y' },
        { filer_id: '', party: 'REPUBLICAN' },
      ],
    });

    expect(tags).toEqual([
      { filer_id: '00040542', party: 'DEMOCRAT' },
    ]);
  });
});

describe('buildPartyTagsValuesSql', () => {
  test('escapes filer ids and parties for DuckDB VALUES', () => {
    const tags: PartyTag[] = [
      { filer_id: "00'1", party: 'DEMOCRAT' },
    ];

    expect(buildPartyTagsValuesSql(tags)).toBe("('00''1', 'DEMOCRAT')");
  });

  test('returns null when there are no usable tags', () => {
    expect(buildPartyTagsValuesSql([])).toBeNull();
  });
});

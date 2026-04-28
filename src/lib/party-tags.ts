export interface PartyTag {
  filer_id: string;
  party: PartyOption;
  tagged_at?: string;
  name?: string | null;
  source?: string;
}

export const PARTY_OPTIONS = [
  'REPUBLICAN',
  'DEMOCRAT',
  'LIBERTARIAN',
  'GREEN',
  'INDEPENDENT',
] as const;

export type PartyOption = typeof PARTY_OPTIONS[number];

const PARTY_SET = new Set<string>(PARTY_OPTIONS);
const DEFAULT_PARTY_TAGS_API_URL = 'https://tec-party-tags.joshuaru.sh';
const STATIC_PARTY_TAGS_URL = '/party_tags.json';

let partyTagsPromise: Promise<PartyTag[]> | null = null;

function getPartyTagsApiBase(): string {
  const configured = import.meta.env.PUBLIC_PARTY_TAGS_API_URL || DEFAULT_PARTY_TAGS_API_URL;
  return configured.replace(/\/+$/, '');
}

function isPartyOption(party: string): party is PartyOption {
  return PARTY_SET.has(party);
}

function normalizePartyTag(row: unknown): PartyTag | null {
  if (!row || typeof row !== 'object') return null;

  const record = row as Record<string, unknown>;
  const filerId = typeof record.filer_id === 'string' ? record.filer_id.trim() : '';
  const party = typeof record.party === 'string' ? record.party.trim().toUpperCase() : '';

  if (!filerId || !isPartyOption(party)) return null;

  const tag: PartyTag = {
    filer_id: filerId,
    party,
  };

  if (typeof record.tagged_at === 'string') tag.tagged_at = record.tagged_at;
  if (typeof record.name === 'string') tag.name = record.name;
  if (typeof record.source === 'string') tag.source = record.source;

  return tag;
}

export function normalizePartyTagPayload(payload: unknown): PartyTag[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { tags?: unknown }).tags)
      ? (payload as { tags: unknown[] }).tags
      : [];

  const tagsByFiler = new Map<string, PartyTag>();
  for (const row of rows) {
    const tag = normalizePartyTag(row);
    if (tag && !tagsByFiler.has(tag.filer_id)) {
      tagsByFiler.set(tag.filer_id, tag);
    }
  }

  return [...tagsByFiler.values()];
}

async function fetchPartyTagsFrom(url: string): Promise<PartyTag[]> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Party tags request failed with ${response.status}`);
  }

  return normalizePartyTagPayload(await response.json());
}

export async function getAllPartyTags(): Promise<PartyTag[]> {
  if (!partyTagsPromise) {
    partyTagsPromise = fetchPartyTagsFrom(`${getPartyTagsApiBase()}/party-tags`)
      .catch(async (error) => {
        console.warn('Falling back to static party tags:', error);
        return fetchPartyTagsFrom(STATIC_PARTY_TAGS_URL);
      });
  }

  return partyTagsPromise;
}

export async function getPartyTag(filerId: string): Promise<PartyTag | null> {
  const tags = await getAllPartyTags();
  return tags.find((tag) => tag.filer_id === filerId) || null;
}

export async function submitPartyTag(
  filerId: string,
  party: PartyOption,
  name?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${getPartyTagsApiBase()}/party-tags`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filer_id: filerId, party, name }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = typeof payload.error === 'string'
        ? payload.error
        : `Party tag server returned ${response.status}`;
      return { success: false, error: message };
    }

    const [tag] = normalizePartyTagPayload({ tags: [payload.tag ?? payload] });
    if (tag) {
      const existing = await getAllPartyTags().catch(() => []);
      partyTagsPromise = Promise.resolve([
        tag,
        ...existing.filter((item) => item.filer_id !== tag.filer_id),
      ]);
    } else {
      partyTagsPromise = null;
    }

    return { success: true };
  } catch (error) {
    console.error('Error submitting party tag:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Party tag server is unavailable',
    };
  }
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export function buildPartyTagsValuesSql(tags: PartyTag[]): string | null {
  const values = normalizePartyTagPayload({ tags })
    .map((tag) => `('${escapeSqlLiteral(tag.filer_id)}', '${escapeSqlLiteral(tag.party)}')`);

  return values.length > 0 ? values.join(',\n          ') : null;
}

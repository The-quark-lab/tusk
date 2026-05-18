/**
 * Airtable importer — fetches table field schema via our server-side proxy at /api/airtable-proxy.
 * The user's Personal Access Token is passed per-request and never stored server-side.
 */
import { FormField, FormFieldType } from '@/types/form';

interface AirtableField {
  id: string;
  name: string;
  type: string;
  options?: {
    choices?: { name?: string }[];
  };
}

interface AirtableTable {
  id: string;
  name: string;
  fields: AirtableField[];
}

/** Fetch all tables for a base. Returns table list for user to pick from. */
export async function fetchAirtableTables(
  pat: string,
  baseId: string,
): Promise<AirtableTable[]> {
  const res = await fetch(`/api/airtable-proxy?baseId=${encodeURIComponent(baseId)}`, {
    headers: { 'x-airtable-pat': pat },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } })?.error?.message ||
        `Airtable API error: ${res.status}`,
    );
  }

  const data = (await res.json()) as { tables?: AirtableTable[] };
  return data.tables ?? [];
}

/** Map Airtable field types to Tusk FormFieldType. */
function mapAirtableType(airtableType: string): FormFieldType {
  const map: Record<string, FormFieldType> = {
    singleLineText: 'text',
    email: 'text',
    phoneNumber: 'text',
    number: 'text',
    currency: 'text',
    percent: 'text',
    autoNumber: 'text',
    formula: 'text',
    multilineText: 'textarea',
    richText: 'textarea',
    longText: 'textarea',
    singleSelect: 'dropdown',
    multipleSelects: 'checkbox',
    checkbox: 'confirmation',
    rating: 'rating',
    url: 'url',
    attachment: 'screenshot',
  };
  return map[airtableType] ?? 'text';
}

/** Convert an Airtable table's fields to Tusk FormField[]. */
export function importFromAirtableTable(
  table: AirtableTable,
): { title: string; fields: FormField[] } {
  const fields: FormField[] = table.fields
    .filter((f) => {
      // Skip computed/lookup fields that don't make sense as form inputs
      const skip = ['createdTime', 'lastModifiedTime', 'createdBy', 'lastModifiedBy', 'lookup', 'rollup', 'count', 'multipleLookupValues'];
      return !skip.includes(f.type);
    })
    .map((f) => {
      const type = mapAirtableType(f.type);
      const options =
        (f.type === 'singleSelect' || f.type === 'multipleSelects')
          ? (f.options?.choices ?? []).map((c) => c.name ?? '').filter(Boolean)
          : undefined;

      return {
        id: f.id,
        type,
        label: f.name,
        required: false,
        isPrivate: false,
        options,
      };
    });

  return { title: table.name, fields };
}

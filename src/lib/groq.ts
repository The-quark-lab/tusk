/**
 * Groq client — all requests proxied through /api/groq to keep the API key server-side.
 */
import { FormField, FormFieldType } from '@/types/form';

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are Tusk AI — a helpful assistant that creates decentralized forms for the Sui/Walrus ecosystem.
Your job is to have a SHORT conversation (2-3 exchanges max) to understand what the user needs, then generate form fields.

Rules:
- Ask ONE clarifying question at a time.
- Keep replies concise and friendly.
- After 2-3 exchanges, if you have enough info, include the exact text "READY_TO_GENERATE" at the end of your message.
- Never generate fields during the conversation — only signal readiness.
- Always confirm the form purpose, key fields needed, and whether any fields should be private/encrypted.`;

const FIELD_GENERATION_PROMPT = `Based on our conversation, generate a JSON array of form fields.
Each field must follow this exact schema:
{
  "id": "<unique 8-char alphanumeric>",
  "type": "<one of: text|textarea|dropdown|checkbox|rating|url|screenshot|video|confirmation>",
  "label": "<question text>",
  "required": <true|false>,
  "isPrivate": <true|false>,
  "placeholder": "<optional hint text>",
  "options": ["Option 1", "Option 2"]  // only for dropdown or checkbox types
}
Return ONLY the JSON array, no other text.`;

async function callGroq(messages: GroqMessage[], jsonMode = false): Promise<string> {
  const body: Record<string, unknown> = {
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.7,
    max_tokens: 2048,
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
    body.temperature = 0.2;
  }

  const res = await fetch('/api/groq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq API error: ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/** Send a chat message to Groq and get the assistant reply. */
export async function chatWithGroq(messages: GroqMessage[]): Promise<string> {
  return callGroq([{ role: 'system', content: SYSTEM_PROMPT }, ...messages]);
}

/** Generate FormField[] from the completed conversation. */
export async function generateFormFields(
  conversation: GroqMessage[],
  formTitle: string,
): Promise<FormField[]> {
  const messages: GroqMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversation,
    {
      role: 'user',
      content: `${FIELD_GENERATION_PROMPT}\n\nForm title: "${formTitle}"`,
    },
  ];

  const raw = await callGroq(messages, true);

  // Parse — model returns { fields: [...] } or raw array
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('AI returned invalid JSON. Please try again.');
  }

  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.fields)
    ? ((parsed as Record<string, unknown>).fields as unknown[])
    : [];

  const validTypes: FormFieldType[] = [
    'text', 'textarea', 'dropdown', 'checkbox', 'rating', 'url', 'screenshot', 'video', 'confirmation',
  ];

  return arr
    .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
    .map((f) => ({
      id: String(f.id || Math.random().toString(36).substr(2, 8)),
      type: validTypes.includes(f.type as FormFieldType) ? (f.type as FormFieldType) : 'text',
      label: String(f.label || 'Untitled question'),
      required: Boolean(f.required),
      isPrivate: Boolean(f.isPrivate),
      placeholder: f.placeholder ? String(f.placeholder) : undefined,
      options: Array.isArray(f.options) ? (f.options as string[]) : undefined,
    }));
}

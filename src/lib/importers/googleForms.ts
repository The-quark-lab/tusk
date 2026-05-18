/**
 * Google Forms importer.
 * Uses Google Identity Services (GIS) for browser-side OAuth token flow.
 * No redirect — returns a one-time access token scoped to forms.body.readonly.
 */
import { FormField, FormFieldType } from '@/types/form';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }): { requestAccessToken(): void };
        };
      };
    };
  }
}

/** Load the GIS script if not already loaded. */
function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script.'));
    document.head.appendChild(script);
  });
}

/** Prompt user for Google OAuth token scoped to Forms readonly. Returns access token. */
export async function getGoogleAccessToken(): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured.');

  await loadGisScript();

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/forms.body.readonly',
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error || 'No access token received.'));
        } else {
          resolve(response.access_token);
        }
      },
    });
    client.requestAccessToken();
  });
}

/** Extract formId from a Google Forms URL. */
export function extractGoogleFormId(url: string): string | null {
  const match = url.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

interface GFormItem {
  itemId?: string;
  title?: string;
  questionItem?: {
    question?: {
      questionId?: string;
      required?: boolean;
      textQuestion?: { paragraph?: boolean };
      choiceQuestion?: { type?: string; options?: { value?: string }[] };
      scaleQuestion?: { low?: number; high?: number };
      fileUploadQuestion?: unknown;
      dateQuestion?: unknown;
      timeQuestion?: unknown;
      rowQuestion?: unknown;
    };
  };
  pageBreakItem?: unknown;
  imageItem?: unknown;
  videoItem?: unknown;
}

/** Fetch form schema from Google Forms API and map to Tusk FormField[]. */
export async function importFromGoogleForms(
  formId: string,
  accessToken: string,
): Promise<{ title: string; description: string; fields: FormField[] }> {
  const res = await fetch(`https://forms.googleapis.com/v1/forms/${formId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } })?.error?.message ||
        `Google Forms API error: ${res.status}`,
    );
  }

  const form = (await res.json()) as {
    info?: { title?: string; description?: string };
    items?: GFormItem[];
  };

  const title = form.info?.title || 'Imported Form';
  const description = form.info?.description || '';
  const fields: FormField[] = [];

  for (const item of form.items ?? []) {
    const q = item.questionItem?.question;
    if (!q) continue;

    const id = q.questionId || Math.random().toString(36).substr(2, 8);
    const label = item.title || 'Question';
    const required = q.required ?? false;

    let type: FormFieldType = 'text';
    let options: string[] | undefined;

    if (q.textQuestion) {
      type = q.textQuestion.paragraph ? 'textarea' : 'text';
    } else if (q.choiceQuestion) {
      const ct = q.choiceQuestion.type;
      if (ct === 'DROP_DOWN') type = 'dropdown';
      else if (ct === 'CHECKBOX') type = 'checkbox';
      else type = 'dropdown'; // RADIO → dropdown
      options = (q.choiceQuestion.options ?? []).map((o) => o.value ?? '').filter(Boolean);
    } else if (q.scaleQuestion) {
      type = 'rating';
    } else if (q.fileUploadQuestion) {
      type = 'screenshot';
    }

    fields.push({ id, type, label, required, isPrivate: false, options });
  }

  return { title, description, fields };
}

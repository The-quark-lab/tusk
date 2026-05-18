/**
 * localStorage cache for forms — read-through only, never authoritative.
 * Walrus + Sui are the source of truth.
 */
import { FormSchema } from "@/types/form";

const FORMS_CACHE_KEY = "walrusforms:formscache";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) || "");
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/** Get locally-cached forms (used for instant display while Walrus loads). */
export function getStoredForms(): FormSchema[] {
  return readJson<FormSchema[]>(FORMS_CACHE_KEY, []);
}

/**
 * Upsert a form in the local cache.
 * Always refresh from Walrus/Sui after loading — this is only for
 * preventing a blank flash on first render.
 */
export function updateStoredForm(form: FormSchema) {
  const forms = getStoredForms();
  const next = [form, ...forms.filter((f) => f.id !== form.id)];
  writeJson(FORMS_CACHE_KEY, next);
}

/** Replace the entire cache with the authoritative list from Walrus. */
export function setStoredFormsCache(forms: FormSchema[]) {
  writeJson(FORMS_CACHE_KEY, forms);
}

/** Remove a form from the local cache (e.g. after deletion). */
export function removeStoredForm(id: string) {
  const forms = getStoredForms().filter((f) => f.id !== id);
  writeJson(FORMS_CACHE_KEY, forms);
}

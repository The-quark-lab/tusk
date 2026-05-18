export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'dropdown'
  | 'checkbox'
  | 'rating'
  | 'url'
  | 'screenshot'
  | 'video'
  | 'confirmation';

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  allowCustomOption?: boolean;
  isPrivate?: boolean;
}

export interface FormSchema {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
  creator: string;
  bountyAmount?: string;
  schemaBlobId?: string;
  manifestBlobId?: string;
  /** Sui shared object ID of the on-chain Form record */
  formObjectId?: string;
  createdAt?: number;
  txDigest?: string;
  ephemeralKey?: string;
}

export interface ManifestEntry {
  submitter: string;
  responseBlobId: string;
  timestamp: number;
  isEncrypted: boolean;
}

/** Per-submission admin metadata stored as a Walrus blob. */
export interface AdminMeta {
  status: 'Pending' | 'In Progress' | 'Resolved';
  priority: 'Low' | 'Medium' | 'High';
  notes: string;
  updatedAt: number;
}

/** Map of responseBlobId → AdminMeta, uploaded as a single Walrus blob per form. */
export type AdminMetaStore = Record<string, AdminMeta>;

/** Entry in the global forms index blob on Walrus. */
export interface FormsIndexEntry {
  id: string;
  title: string;
  creator: string;
  schemaBlobId: string;
  manifestBlobId: string;
  formObjectId: string;
}


const AGGREGATOR_URL = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';
const PUBLISHER_URL = process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space';

export interface WalrusStoreResponse {
  newlyCreated?: {
    blobObject: {
      id: string;
      blobId: string;
      storage: { id: string; startEpoch: number; endEpoch: number; storageSize: number };
    };
    cost: number;
  };
  alreadyCertified?: {
    blobId: string;
    eventId: string;
    cost: number;
  };
}

export async function uploadToWalrus(data: unknown, epochs = 53, retries = 3): Promise<string> {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  const blob = new Blob([body], { type: 'application/json' });
  const isBrowser = typeof window !== 'undefined';

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const url = isBrowser 
        ? `/api/walrus?epochs=${epochs}` 
        : `${PUBLISHER_URL}/v1/blobs?epochs=${epochs}`;

      const response = await fetch(url, {
        method: 'PUT',
        body: blob,
      });

      if (!response.ok) {
        throw new Error(`Walrus upload failed: ${response.status} ${response.statusText}`);
      }

      const result: WalrusStoreResponse = await response.json();

      if (result.newlyCreated) {
        return result.newlyCreated.blobObject.blobId;
      }
      if (result.alreadyCertified) {
        return result.alreadyCertified.blobId;
      }

      throw new Error('Walrus upload succeeded but no blobId in response');
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`Walrus upload attempt ${attempt} failed, retrying...`, err);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw new Error("Walrus upload unreachable");
}

export async function downloadFromWalrus<T>(blobId: string, retries = 3): Promise<T> {
  const isBrowser = typeof window !== 'undefined';

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const url = isBrowser 
        ? `/api/walrus?blobId=${blobId}` 
        : `${AGGREGATOR_URL}/v1/blobs/${blobId}`;

      const response = await fetch(url);

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Walrus download failed: ${response.status} ${text}`);
      }

      const text = await response.text();
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`Walrus download attempt ${attempt} failed, retrying...`, err);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw new Error("Walrus download unreachable");
}

export async function uploadMediaToWalrus(file: File | Blob, epochs = 53, retries = 3): Promise<string> {
  const isBrowser = typeof window !== 'undefined';

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const url = isBrowser 
        ? `/api/walrus?epochs=${epochs}` 
        : `${PUBLISHER_URL}/v1/blobs?epochs=${epochs}`;

      const response = await fetch(url, {
        method: 'PUT',
        body: file,
      });

      if (!response.ok) {
        throw new Error(`Walrus media upload failed: ${response.status} ${response.statusText}`);
      }

      const result: WalrusStoreResponse = await response.json();

      if (result.newlyCreated) {
        return result.newlyCreated.blobObject.blobId;
      }
      if (result.alreadyCertified) {
        return result.alreadyCertified.blobId;
      }

      throw new Error('Walrus media upload succeeded but no blobId in response');
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`Walrus media upload attempt ${attempt} failed, retrying...`, err);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw new Error("Walrus media upload unreachable");
}

/**
 * Upload an AdminMetaStore (map of responseBlobId → {status, notes, priority})
 * as a Walrus blob. Returns the new blobId.
 */
export async function uploadAdminMeta(
  store: import('@/types/form').AdminMetaStore,
  epochs = 53,
): Promise<string> {
  return uploadToWalrus(store, epochs);
}

/**
 * Download and parse an AdminMetaStore blob from Walrus.
 * Returns an empty object if the blobId is empty or download fails.
 */
export async function downloadAdminMeta(
  blobId: string,
): Promise<import('@/types/form').AdminMetaStore> {
  if (!blobId) return {};
  try {
    return await downloadFromWalrus<import('@/types/form').AdminMetaStore>(blobId);
  } catch (err) {
    console.warn('downloadAdminMeta failed, returning empty store:', err);
    return {};
  }
}

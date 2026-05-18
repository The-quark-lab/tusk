/**
 * Sui on-chain integration helpers.
 *
 * NOTE: For React components, use `useSuiClient()` from @mysten/dapp-kit
 * and pass the client to the functions below.
 * The standalone `suiRpcFetch` helper is used in non-hook contexts (e.g. middleware).
 */

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";

const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID || "0x0";
const MODULE = "walrus_forms";

/** The shared FormsRegistry object ID — populated after first deploy */
export const REGISTRY_OBJECT_ID =
  process.env.NEXT_PUBLIC_REGISTRY_OBJECT_ID || "";

const RPC_URL = getJsonRpcFullnodeUrl("testnet");
const suiClient = new SuiJsonRpcClient({ url: RPC_URL });

// ---- Types ----

export interface SuiFormFields {
  creator: string;
  title: string;
  description: string;
  schema_blob_id: string;
  manifest_blob_id: string;
  admin_meta_blob_id: string;
  is_active: boolean;
}

// ---- On-chain reads ----

/** Fetch the current fields for a Form object from Sui */
export async function getFormObject(formObjectId: string): Promise<SuiFormFields | null> {
  try {
    const res = await suiClient.getObject({ id: formObjectId, options: { showContent: true } });
    if (res.data?.content?.dataType !== "moveObject") return null;
    const fields = res.data.content.fields as Record<string, unknown>;
    return {
      creator: String(fields.creator ?? ""),
      title: String(fields.title ?? ""),
      description: String(fields.description ?? ""),
      schema_blob_id: String(fields.schema_blob_id ?? ""),
      manifest_blob_id: String(fields.manifest_blob_id ?? ""),
      admin_meta_blob_id: String(fields.admin_meta_blob_id ?? ""),
      is_active: Boolean(fields.is_active ?? true),
    };
  } catch (err) {
    console.error("getFormObject failed:", err);
    return null;
  }
}

/** Fetch the registry_blob_id from the FormsRegistry singleton */
export async function getRegistryBlobId(): Promise<string> {
  if (!REGISTRY_OBJECT_ID) return "";
  try {
    const res = await suiClient.getObject({ id: REGISTRY_OBJECT_ID, options: { showContent: true } });
    if (res.data?.content?.dataType !== "moveObject") return "";
    const fields = res.data.content.fields as Record<string, unknown>;
    return String(fields.registry_blob_id ?? "");
  } catch (err) {
    console.error("getRegistryBlobId failed:", err);
    return "";
  }
}

/** After a create_form transaction, find the newly-created Form object ID */
export async function getFormObjectIdFromDigest(digest: string): Promise<string | null> {
  try {
    const tx = await suiClient.waitForTransaction({
      digest,
      options: { showObjectChanges: true },
    });
    
    const changes = tx.objectChanges;
    if (!Array.isArray(changes)) return null;
    const created = changes.find(
      (c) =>
        c.type === "created" &&
        typeof c.objectType === "string" &&
        (c.objectType as string).endsWith("::walrus_forms::Form"),
    );
    if (created && typeof created.objectId === "string") return created.objectId;
    // If not found by exact type, also check if there's a shared object that matches
    const shared = changes.find(
      (c) =>
        c.type === "created" &&
        typeof c.objectType === "string" &&
        (c.objectType as string).includes("::walrus_forms::Form") &&
        !(c.objectType as string).includes("FormAdminCap")
    );
    if (shared && typeof shared.objectId === "string") return shared.objectId;
    return null;
  } catch (err) {
    console.error("getFormObjectIdFromDigest failed:", err);
    return null;
  }
}

// ---- Transaction builders ----

/** Update a Form's manifest_blob_id on Sui */
export function buildUpdateManifestTx(
  formObjectId: string,
  newManifestBlobId: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE}::update_manifest`,
    arguments: [tx.object(formObjectId), tx.pure.string(newManifestBlobId)],
  });
  return tx;
}

/** Update a Form's admin_meta_blob_id on Sui */
export function buildUpdateAdminMetaTx(
  formObjectId: string,
  newAdminMetaBlobId: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE}::update_admin_meta`,
    arguments: [tx.object(formObjectId), tx.pure.string(newAdminMetaBlobId)],
  });
  return tx;
}

/** Create a new form and atomically update the registry blob pointer */
export function buildCreateFormTx(opts: {
  title: string;
  description: string;
  schemaBlobId: string;
  manifestBlobId: string;
  newRegistryBlobId: string;
  ephemeralAddress: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE}::create_form`,
    arguments: [
      tx.pure.string(opts.title),
      tx.pure.string(opts.description),
      tx.pure.string(opts.schemaBlobId),
      tx.pure.string(opts.manifestBlobId),
      tx.object(REGISTRY_OBJECT_ID),
      tx.pure.string(opts.newRegistryBlobId),
    ],
  });

  // Split 0.01 SUI to fund the ephemeral key for submissions
  const [coin] = tx.splitCoins(tx.gas, [10_000_000]);
  tx.transferObjects([coin], opts.ephemeralAddress);

  return tx;
}

/** Update the global registry blob ID */
export function buildSetRegistryTx(newRegistryBlobId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE}::set_registry`,
    arguments: [tx.object(REGISTRY_OBJECT_ID), tx.pure.string(newRegistryBlobId)],
  });
  return tx;
}

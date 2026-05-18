"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { FormPlayer } from "@/components/FormPlayer/FormPlayer";
import { FormBuilder } from "@/components/FormBuilder/FormBuilder";
import { AdminDashboard } from "@/components/AdminDashboard/AdminDashboard";
import { AiFormBuilder } from "@/components/AiFormBuilder/AiFormBuilder";
import { FormSchema, ManifestEntry, FormsIndexEntry, FormField } from "@/types/form";
import { encryptWithSeal } from "@/lib/seal";
import { uploadMediaToWalrus, uploadToWalrus, downloadFromWalrus } from "@/lib/walrus";
import { getStoredForms, updateStoredForm, setStoredFormsCache } from "@/lib/storage";
import {
  getFormObject,
  getRegistryBlobId,
  buildUpdateManifestTx,
} from "@/lib/sui";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { toast } from "sonner";
import {
  FileText,
  ShieldCheck,
  Zap,
  ArrowRight,
  BarChart3,
  Award,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { clsx } from "clsx";
import styles from "./page.module.css";

type ViewState = "landing" | "builder" | "player" | "admin" | "shared" | "ai-builder";

export default function Home() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecuteAsync } = useSignAndExecuteTransaction();

  const [view, setView] = useState<ViewState>("landing");
  // forms is populated from Walrus registry; localStorage is a read-through cache only
  const [forms, setForms] = useState<FormSchema[]>(() => getStoredForms());
  const [activeFormId, setActiveFormId] = useState<string>("");
  const [loadingForm, setLoadingForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [justCreatedForm, setJustCreatedForm] = useState<FormSchema | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [ephemeralKey, setEphemeralKey] = useState<string | null>(null);
  const [aiFields, setAiFields] = useState<{ fields: FormField[]; title: string } | null>(null);

  // ---- Load forms from Walrus registry on mount ----
  const refreshFormsFromRegistry = useCallback(async () => {
    try {
      const registryBlobId = await getRegistryBlobId();
      if (!registryBlobId) return;
      const index = await downloadFromWalrus<FormsIndexEntry[]>(registryBlobId);
      if (!Array.isArray(index)) return;
      const currentCache = getStoredForms();
      // For each index entry, build a FormSchema, preserving fields and ephemeralKey from cache if available
      const schemas: FormSchema[] = index.map((entry) => {
        const cached = currentCache.find((f) => f.id === entry.id);
        return {
          id: entry.id,
          title: entry.title,
          creator: entry.creator,
          fields: cached?.fields || [],
          schemaBlobId: entry.schemaBlobId,
          manifestBlobId: entry.manifestBlobId,
          formObjectId: entry.formObjectId,
          ephemeralKey: cached?.ephemeralKey,
        };
      });
      setForms(schemas);
      setStoredFormsCache(schemas);
    } catch (err) {
      console.warn("Could not load forms registry from Walrus:", err);
      // Fall back to localStorage cache
      setForms(getStoredForms());
    }
  }, []);

  useEffect(() => {
    refreshFormsFromRegistry();
  }, [refreshFormsFromRegistry]);

  // ---- Handle share URL on mount ----
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const formObjId = params.get("formObj"); // new format: ?formObj=<suiObjectId>&blob=<schemaBlobId>
    const blobId = params.get("blob");
    const formId = params.get("form"); // legacy fallback
    const urlManifestBlobId = params.get("manifest"); // legacy fallback
    const kParam = params.get("k");

    if (kParam) setEphemeralKey(kParam);

    if (!formObjId && !blobId && !formId) return;

    // Check local cache first for instant display
    const cachedForms = getStoredForms();
    const cached = formObjId
      ? cachedForms.find((f) => f.formObjectId === formObjId)
      : cachedForms.find((f) => f.id === formId);

    if (cached) {
      setActiveFormId(cached.id);
      setView("player");
      // Still re-fetch in background to get latest manifestBlobId from Sui
      if (cached.formObjectId) {
        getFormObject(cached.formObjectId).then((onChain) => {
          if (onChain?.manifest_blob_id && onChain.manifest_blob_id !== cached.manifestBlobId) {
            const updated = { ...cached, manifestBlobId: onChain.manifest_blob_id };
            updateStoredForm(updated);
            setForms((prev) => prev.map((f) => f.id === cached.id ? updated : f));
          }
        });
      }
      return;
    }

    if (blobId || formObjId) {
      setLoadingForm(true);
      setFormError(null);

      (async () => {
        try {
          let resolvedBlobId = blobId || "";
          let manifestBlobId = urlManifestBlobId || "";
          const resolvedFormObjId = formObjId || "";

          // Resolve missing blob details directly from Sui if formObjId is available
          if (resolvedFormObjId) {
            const onChain = await getFormObject(resolvedFormObjId);
            if (onChain) {
              if (onChain.schema_blob_id) resolvedBlobId = onChain.schema_blob_id;
              if (onChain.manifest_blob_id) manifestBlobId = onChain.manifest_blob_id;
            }
          }

          if (!resolvedBlobId) {
            throw new Error("Could not resolve Form Schema Blob ID from Sui.");
          }

          const { downloadFromWalrus } = await import('@/lib/walrus');
          const schema = await downloadFromWalrus<FormSchema>(resolvedBlobId);

          if (!manifestBlobId && schema.manifestBlobId) {
            manifestBlobId = schema.manifestBlobId;
          }

          if (!manifestBlobId) {
            throw new Error("Form is incomplete — missing submission manifest. The form creator may need to re-create it.");
          }

          const fullSchema: FormSchema = {
            ...schema,
            schemaBlobId: resolvedBlobId,
            manifestBlobId,
            formObjectId: resolvedFormObjId || undefined,
          };

          updateStoredForm(fullSchema);
          setForms((prev) => {
            const filtered = prev.filter((f) => f.id !== fullSchema.id);
            return [fullSchema, ...filtered];
          });
          setActiveFormId(schema.id);
          setView("player");
        } catch (err) {
          console.error("Failed to load form from Walrus:", err);
          setFormError(err instanceof Error ? err.message : "Failed to load form from Walrus.");
        } finally {
          setLoadingForm(false);
        }
      })();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeForm = forms.find((f) => f.id === activeFormId) || null;

  // Refresh forms when switching to admin view
  useEffect(() => {
    if (view === "admin") {
      refreshFormsFromRegistry();
    }
  }, [view, refreshFormsFromRegistry]);

  const handleSavedForm = (schema: FormSchema) => {
    updateStoredForm(schema);
    setForms((prev) => [schema, ...prev.filter((f) => f.id !== schema.id)]);
    setActiveFormId(schema.id);
    setJustCreatedForm(schema);
    setView("shared");
  };

  // ---- Submit handler — fully Walrus-native ----
  const handleSubmit = async (data: Record<string, unknown>, formSchema?: FormSchema) => {
    const form = formSchema || activeForm;
    if (!form) {
      toast.error("No active form.");
      throw new Error("No active form");
    }

    // Always read the authoritative manifestBlobId from Sui if formObjectId is available
    let currentManifestBlobId = form.manifestBlobId || "";
    if (form.formObjectId) {
      const onChain = await getFormObject(form.formObjectId);
      if (onChain?.manifest_blob_id) currentManifestBlobId = onChain.manifest_blob_id;
    }

    if (!currentManifestBlobId) {
      toast.error("Form is not configured for submissions — missing manifest blob.");
      throw new Error("Form is missing manifest blob — cannot accept submissions.");
    }

    // Process fields: upload media, encrypt private fields
    const processedResponses: Record<string, unknown> = {};
    let hasEncryptedFields = false;

    for (const field of form.fields) {
      const value = data[field.id];
      if (value instanceof File || value instanceof Blob) {
        processedResponses[field.id] = {
          type: value.type,
          blobId: await uploadMediaToWalrus(value),
          name: value instanceof File ? value.name : `${field.type}-recording.webm`,
        };
      } else if (field.isPrivate && value !== undefined && value !== "") {
        hasEncryptedFields = true;
        processedResponses[field.id] = await encryptWithSeal(JSON.stringify(value), {
          type: "address",
          value: form.creator,
        });
      } else {
        processedResponses[field.id] = value;
      }
    }

    // Upload response blob (no sensitive data stored in localStorage)
    const responseBlobId = await uploadToWalrus({
      formId: form.id,
      responses: processedResponses,
      submittedAt: Date.now(),
    });

    const entry: ManifestEntry = {
      submitter: "anonymous",
      responseBlobId,
      timestamp: Date.now(),
      isEncrypted: hasEncryptedFields,
    };

    // Read-after-write manifest update loop on Walrus
    let appended = false;
    while (!appended) {
      const manifest = await downloadFromWalrus<ManifestEntry[]>(currentManifestBlobId);
      manifest.push(entry);
      const newManifestBlobId = await uploadToWalrus(manifest);
      const verified = await downloadFromWalrus<ManifestEntry[]>(newManifestBlobId);
      appended = verified.some((e) => e.responseBlobId === responseBlobId);
      currentManifestBlobId = newManifestBlobId;
      if (!appended) console.warn("Manifest race detected, retrying...");
    }

    // Update Sui Form object's manifest_blob_id (requires wallet or ephemeral key)
    if (form.formObjectId) {
      try {
        const tx = buildUpdateManifestTx(form.formObjectId, currentManifestBlobId);
        
        const keyToUse = ephemeralKey || form.ephemeralKey;
        if (keyToUse) {
          // Silent background transaction using the funded ephemeral key
          const ephemKey = Ed25519Keypair.fromSecretKey(keyToUse);
          const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("testnet") });
          await client.signAndExecuteTransaction({ transaction: tx, signer: ephemKey });
          console.log("Manifest pointer updated on Sui via ephemeral key.");
        } else {
          // Fallback to connected wallet (e.g. for the admin)
          await signAndExecuteAsync({ transaction: tx });
          console.log("Manifest pointer updated on Sui via connected wallet.");
        }
      } catch (err) {
        console.warn("Could not update manifest on Sui:", err);
        toast.error("Submission failed: Could not update on-chain pointer.");
        throw err;
      }
    }

    // Update local cache with new manifestBlobId
    const updatedForm = { ...form, manifestBlobId: currentManifestBlobId };
    updateStoredForm(updatedForm);
    setForms((prev) => prev.map((f) => f.id === form.id ? updatedForm : f));
  };

  // ---- Loading / error states ----
  if (loadingForm) {
    return (
      <div className={styles.container}>
        <div className={styles.bgGlow} />
        <main className={styles.main}>
          <p style={{ textAlign: "center", color: "var(--text-secondary)", paddingTop: "4rem" }}>
            Loading form from Walrus...
          </p>
        </main>
      </div>
    );
  }

  if (formError) {
    return (
      <div className={styles.container}>
        <div className={styles.bgGlow} />
        <main className={styles.main}>
          <div style={{ textAlign: "center", paddingTop: "4rem", maxWidth: 480, margin: "0 auto" }}>
            <h2 style={{ color: "var(--text-primary)", marginBottom: "1rem" }}>Could not load form</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", whiteSpace: "pre-wrap" }}>
              {formError}
            </p>
            <Button onClick={() => { setFormError(null); setView("landing"); }}>
              Back to Home
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (view === "player") {
    if (!activeForm) {
      return (
        <div className={styles.container}>
          <div className={styles.bgGlow} />
          <main className={styles.main}>
            <p style={{ textAlign: "center", color: "var(--text-secondary)", paddingTop: "4rem" }}>
              Form not found.
            </p>
          </main>
        </div>
      );
    }
    return (
      <FormPlayer
        schema={activeForm}
        onSubmit={handleSubmit}
        onBack={() => setView("landing")}
      />
    );
  }

  if (view === "ai-builder") {
    return (
      <AiFormBuilder
        onBack={() => setView("builder")}
        onFieldsGenerated={(fields, title) => {
          setAiFields({ fields, title });
          setView("builder");
        }}
      />
    );
  }

  if (view === "builder") {
    return (
      <FormBuilder
        onSaved={handleSavedForm}
        onBack={() => setView("landing")}
        onOpenAiBuilder={() => setView("ai-builder")}
        initialFields={aiFields?.fields}
        initialTitle={aiFields?.title}
      />
    );
  }

  if (view === "shared" && justCreatedForm) {
    // New URL format: ?formObj=<suiObjectId>&blob=<schemaBlobId>&k=<ephemeralKey>
    const shareUrl = justCreatedForm.formObjectId
      ? `${window.location.origin}?formObj=${justCreatedForm.formObjectId}&blob=${justCreatedForm.schemaBlobId}${justCreatedForm.ephemeralKey ? `&k=${encodeURIComponent(justCreatedForm.ephemeralKey)}` : ''}`
      : `${window.location.origin}?form=${justCreatedForm.id}&blob=${justCreatedForm.schemaBlobId}&manifest=${justCreatedForm.manifestBlobId}${justCreatedForm.ephemeralKey ? `&k=${encodeURIComponent(justCreatedForm.ephemeralKey)}` : ''}`;

    return (
      <div className={styles.container}>
        <div className={styles.bgGlow} />
        <main className={styles.main}>
          <motion.div
            className={styles.shareScreen}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className={styles.shareIcon}><Check size={32} /></div>
            <h1 className="text-gradient">Form Created!</h1>
            <p className={styles.shareDesc}>
              Your form &ldquo;{justCreatedForm.title}&rdquo; is stored on Walrus and registered on Sui.
            </p>

            <div className={styles.shareLinkBox}>
              <input
                className={styles.shareLinkInput}
                type="text"
                readOnly
                value={shareUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }}
              >
                {linkCopied ? <Check size={14} /> : <Copy size={14} />}
                {linkCopied ? "Copied" : "Copy"}
              </Button>
            </div>

            <p className={styles.shareHint}>
              Share this link to collect responses. The manifest pointer is stored on Sui — anyone opening this link always gets the latest submissions.
            </p>

            <div className={styles.shareActions}>
              <Button onClick={() => setView("admin")}>
                <BarChart3 size={16} /> Admin Dashboard
              </Button>
              <Button variant="outline" onClick={() => setView("landing")}>
                Back Home
              </Button>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  if (view === "admin") {
    return (
      <AdminDashboard
        forms={forms}
        selectedFormId={activeFormId}
        onSelectForm={setActiveFormId}
        onBack={() => setView("landing")}
        onFormsRefresh={refreshFormsFromRegistry}
        onCreateNew={() => setView("builder")}
        connectedAddress={account?.address}
      />
    );
  }

  // ---- Landing page ----
  return (
    <div className={styles.container}>
      <div className={styles.bgGlow} />

      <nav className={styles.nav}>
        <div className={styles.logo}>
          <img src="/tusk-icon.svg" alt="Tusk" className={styles.logoIcon} />
          <span className={styles.logoText}>Tusk</span>
        </div>
        <div className={styles.navLinks}>
          <a href="#features">Features</a>
          <button className={styles.navBtn} onClick={() => setView("admin")}>Dashboard</button>
          <Button variant="glass" size="sm" onClick={() => setView("admin")}>Launch App</Button>
        </div>
      </nav>

      <main className={styles.main}>
        <motion.header
          className={styles.hero}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <div className={styles.badge}>
            <Award size={14} className={styles.badgeIcon} />
            Built for Walrus Sessions Round 2
          </div>

          <h1 className="text-gradient">
            The Future of <br />
            <span>Decentralized Feedback</span>
          </h1>

          <p className={styles.description}>
            Create premium, conversational forms powered by Walrus storage
            and Seal encryption. Secure, incentivized, and fully on-chain.
          </p>

          <div className={styles.ctaGroup}>
            <Button size="lg" className={styles.primaryCta} onClick={() => setView("builder")}>
              Create a Form <ArrowRight size={18} />
            </Button>
            <Button variant="outline" size="lg" onClick={() => setView("admin")}>
              View Dashboard
            </Button>
          </div>
        </motion.header>

        <section id="features" className={styles.features}>
          <motion.div
            className={styles.featureGrid}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, staggerChildren: 0.1 }}
          >
            <FeatureCard icon={<Zap className={styles.iconBlue} />} title="Typeform UX" description="Beautiful, conversational interface that converts better than traditional forms." />
            <FeatureCard icon={<ShieldCheck className={styles.iconGreen} />} title="Seal Protected" description="Field-level encryption ensures sensitive data is only visible to authorized eyes." />
            <FeatureCard icon={<FileText className={styles.iconPurple} />} title="Walrus Native" description="Store everything from schemas to high-res video uploads on decentralized storage." />
            <FeatureCard icon={<BarChart3 className={styles.iconOrange} />} title="Actionable Insights" description="CRM-style admin dashboard to track, prioritize, and manage feedback." />
          </motion.div>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>&copy; 2026 Tusk. Built for the Sui Ecosystem.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <motion.div
      className={clsx("glass", styles.featureCard)}
      whileHover={{ y: -5, borderColor: "var(--accent-secondary)" }}
    >
      <div className={styles.featureIcon}>{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </motion.div>
  );
}

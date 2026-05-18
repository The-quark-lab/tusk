"use client";

import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart3,
  MessageSquare,
  Download,
  ShieldAlert,
  Award,
  ChevronRight,
  ArrowLeft,
  Link,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import styles from './AdminDashboard.module.css';
import { clsx } from 'clsx';
import { FormSchema, ManifestEntry, AdminMeta, AdminMetaStore } from '@/types/form';
import { decryptWithSeal } from '@/lib/seal';
import { downloadFromWalrus } from '@/lib/walrus';
import { uploadAdminMeta, downloadAdminMeta } from '@/lib/walrus';
import { getFormObject, buildUpdateAdminMetaTx } from '@/lib/sui';
import { toast } from 'sonner';
import { ConnectButton, useSignAndExecuteTransaction } from '@mysten/dapp-kit';

interface EnrichedEntry extends ManifestEntry {
  adminMeta: AdminMeta;
}

interface AdminDashboardProps {
  forms: FormSchema[];
  selectedFormId: string;
  onSelectForm: (id: string) => void;
  onBack: () => void;
  onFormsRefresh: () => Promise<void>;
}

const DEFAULT_META: AdminMeta = {
  status: 'Pending',
  priority: 'Medium',
  notes: '',
  updatedAt: 0,
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  forms,
  selectedFormId,
  onSelectForm,
  onBack,
  onFormsRefresh,
}) => {
  const { mutateAsync: signAndExecuteAsync } = useSignAndExecuteTransaction();

  const [manifestEntries, setManifestEntries] = useState<ManifestEntry[]>([]);
  const [adminMetaStore, setAdminMetaStore] = useState<AdminMetaStore>({});
  const [adminMetaBlobId, setAdminMetaBlobId] = useState<string>('');
  const [manifestLoading, setManifestLoading] = useState(false);
  const [selectedBlobId, setSelectedBlobId] = useState<string | null>(null);
  const [responseData, setResponseData] = useState<Record<string, unknown> | null>(null);
  const [savingMeta, setSavingMeta] = useState(false);
  const [localNotes, setLocalNotes] = useState<string>('');

  const selectedForm = forms.find((f) => f.id === selectedFormId) || forms[0] || null;

  // ---- Load manifest + admin meta from Walrus when form changes ----
  const loadFormData = useCallback(async (form: FormSchema) => {
    setManifestLoading(true);
    setSelectedBlobId(null);
    setResponseData(null);
    setManifestEntries([]);
    setAdminMetaStore({});
    setAdminMetaBlobId('');

    try {
      // Always read manifestBlobId from Sui Form object (authoritative)
      let manifestBlobId = form.manifestBlobId || '';
      if (form.formObjectId) {
        const onChain = await getFormObject(form.formObjectId);
        if (onChain?.manifest_blob_id) manifestBlobId = onChain.manifest_blob_id;

        // Also load admin meta blob ID from Sui
        if (onChain?.admin_meta_blob_id) {
          setAdminMetaBlobId(onChain.admin_meta_blob_id);
          const meta = await downloadAdminMeta(onChain.admin_meta_blob_id);
          setAdminMetaStore(meta);
        }
      }

      if (manifestBlobId) {
        const entries = await downloadFromWalrus<ManifestEntry[]>(manifestBlobId);
        setManifestEntries(Array.isArray(entries) ? entries : []);
      }
    } catch (err) {
      console.error('Failed to load form data:', err);
      toast.error('Failed to load submissions from Walrus.');
    } finally {
      setManifestLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedForm) loadFormData(selectedForm);
  }, [selectedForm?.id, selectedForm?.formObjectId, loadFormData]);

  // ---- Load individual response blob when selected ----
  useEffect(() => {
    if (!selectedBlobId || !selectedForm) {
      setResponseData(null);
      return;
    }
    let cancelled = false;
    downloadFromWalrus<Record<string, unknown>>(selectedBlobId)
      .then(async (data) => {
        if (cancelled) return;
        const rawResponses = (data?.responses as Record<string, unknown>) || data;
        const decrypted: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(rawResponses)) {
          if (typeof val === 'string' && val.startsWith('SEAL_ENCRYPTED:')) {
            try {
              decrypted[key] = JSON.parse(await decryptWithSeal(val));
            } catch {
              decrypted[key] = '[Encrypted — unable to decrypt]';
            }
          } else {
            decrypted[key] = val;
          }
        }
        if (!cancelled) setResponseData(decrypted);
      })
      .catch((err) => {
        console.error('Failed to load response:', err);
        if (!cancelled) setResponseData(null);
      });
    return () => { cancelled = true; };
  }, [selectedBlobId, selectedForm]);

  // Sync localNotes when selected entry changes
  useEffect(() => {
    if (selectedBlobId) {
      setLocalNotes(adminMetaStore[selectedBlobId]?.notes || '');
    }
  }, [selectedBlobId, adminMetaStore]);

  const enrichedEntries: EnrichedEntry[] = manifestEntries.map((entry) => ({
    ...entry,
    adminMeta: adminMetaStore[entry.responseBlobId] ?? { ...DEFAULT_META },
  }));

  const selectedEntry = manifestEntries.find((e) => e.responseBlobId === selectedBlobId) || null;

  const formatDate = (ts: number) =>
    new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(ts);

  // ---- Save admin meta to Walrus + update Sui pointer ----
  const saveAdminMeta = async (newStore: AdminMetaStore) => {
    if (!selectedForm?.formObjectId) {
      toast.error('Cannot save: form has no on-chain object ID.');
      return;
    }
    setSavingMeta(true);
    try {
      const newBlobId = await uploadAdminMeta(newStore);
      const tx = buildUpdateAdminMetaTx(selectedForm.formObjectId, newBlobId);
      await signAndExecuteAsync({ transaction: tx });
      setAdminMetaBlobId(newBlobId);
      setAdminMetaStore(newStore);
      toast.success('Admin metadata saved to Walrus.');
    } catch (err) {
      console.error('Failed to save admin meta:', err);
      toast.error('Failed to save metadata. Make sure your wallet is connected.');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleStatusChange = async (responseBlobId: string, status: AdminMeta['status']) => {
    const current = adminMetaStore[responseBlobId] ?? { ...DEFAULT_META };
    const updated: AdminMetaStore = {
      ...adminMetaStore,
      [responseBlobId]: { ...current, status, updatedAt: Date.now() },
    };
    await saveAdminMeta(updated);
  };

  const handleSaveNotes = async () => {
    if (!selectedBlobId) return;
    const current = adminMetaStore[selectedBlobId] ?? { ...DEFAULT_META };
    const updated: AdminMetaStore = {
      ...adminMetaStore,
      [selectedBlobId]: { ...current, notes: localNotes, updatedAt: Date.now() },
    };
    await saveAdminMeta(updated);
  };

  const handleExport = () => {
    if (!selectedForm) return;
    const rows = enrichedEntries.map((e) => ({
      submitter: e.submitter,
      timestamp: formatDate(e.timestamp),
      status: e.adminMeta.status,
      priority: e.adminMeta.priority,
      encrypted: e.isEncrypted,
      responseBlobId: e.responseBlobId,
    }));
    const headers = Object.keys(rows[0] || {}).join(',');
    const csv = [
      headers,
      ...rows.map((r) =>
        Object.values(r).map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selectedForm.title.replaceAll(' ', '-').toLowerCase()}-submissions.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Submissions exported as CSV');
  };

  const handleShareForm = () => {
    if (!selectedForm) return;
    // Use new URL format with Sui formObjectId and ephemeralKey; fallback to legacy if not available
    const shareUrl = selectedForm.formObjectId
      ? `${window.location.origin}?formObj=${selectedForm.formObjectId}&blob=${selectedForm.schemaBlobId}${selectedForm.ephemeralKey ? `&k=${encodeURIComponent(selectedForm.ephemeralKey)}` : ''}`
      : `${window.location.origin}?form=${selectedForm.id}&blob=${selectedForm.schemaBlobId}&manifest=${selectedForm.manifestBlobId}${selectedForm.ephemeralKey ? `&k=${encodeURIComponent(selectedForm.ephemeralKey)}` : ''}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success('Form link copied to clipboard!');
  };

  return (
    <div className={styles.dashboard}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <button className={styles.backBtn} onClick={onBack} type="button">
            <ArrowLeft size={16} /> Back
          </button>
          <h2>Admin Dashboard</h2>
          <p>Walrus-native form management</p>
          <div className={styles.walletRow}>
            <ConnectButton />
          </div>
        </div>
        <nav className={styles.formNav}>
          {forms.length === 0 ? (
            <div className={styles.connectPromptSidebar}>
              <BarChart3 size={24} />
              <p>No forms found. Create one to get started.</p>
              <Button variant="outline" size="sm" onClick={onFormsRefresh}>
                <RefreshCw size={14} /> Refresh
              </Button>
            </div>
          ) : (
            forms.map((form) => (
              <button
                key={form.id}
                className={clsx(styles.formTab, selectedFormId === form.id && styles.activeTab)}
                onClick={() => {
                  onSelectForm(form.id);
                  setSelectedBlobId(null);
                  setResponseData(null);
                }}
              >
                <BarChart3 size={18} />
                <div className={styles.formTabInfo}>
                  <span className={styles.formTabTitle}>{form.title}</span>
                  <span className={styles.formTabSub}>{form.creator.slice(0, 8)}…</span>
                </div>
              </button>
            ))
          )}
        </nav>
      </aside>

      {/* Main panel */}
      <main className={styles.main}>
        {!selectedForm ? (
          <div className={styles.emptyState}>
            <BarChart3 size={48} />
            <p>Select a form to view submissions</p>
          </div>
        ) : (
          <>
            <div className={styles.header}>
              <div className={styles.headerInfo}>
                <h1>{selectedForm.title}</h1>
                <div className={styles.badge}>Active</div>
              </div>
              <div className={styles.headerActions}>
                <Button variant="outline" size="sm" onClick={() => loadFormData(selectedForm)}>
                  <RefreshCw size={14} /> Sync
                </Button>
                <Button variant="outline" size="sm" onClick={handleShareForm}><Link size={14} /> Share</Button>
                <Button variant="outline" size="sm" onClick={handleExport}><Download size={14} /> Export CSV</Button>
              </div>
            </div>

            <div className={styles.tableContainer}>
              {manifestLoading ? (
                <div className={styles.emptyState}><p>Loading submissions from Walrus…</p></div>
              ) : enrichedEntries.length === 0 ? (
                <div className={styles.emptyState}>
                  <MessageSquare size={32} />
                  <p>No submissions yet.</p>
                </div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Submitter</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Security</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedEntries.map((entry) => (
                      <tr
                        key={entry.responseBlobId}
                        className={clsx(selectedBlobId === entry.responseBlobId && styles.activeRow)}
                      >
                        <td><code className={styles.address}>{entry.submitter}</code></td>
                        <td>{formatDate(entry.timestamp)}</td>
                        <td>
                          <select
                            className={styles.statusSelect}
                            value={entry.adminMeta.status}
                            onChange={(e) =>
                              handleStatusChange(entry.responseBlobId, e.target.value as AdminMeta['status'])
                            }
                            disabled={savingMeta}
                          >
                            <option>Pending</option>
                            <option>In Progress</option>
                            <option>Resolved</option>
                          </select>
                        </td>
                        <td>
                          {entry.isEncrypted ? (
                            <span className={styles.secureBadge}><ShieldAlert size={12} /> Encrypted</span>
                          ) : (
                            <span className={styles.publicBadge}>Public</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.rowButton}
                            onClick={() => { setSelectedBlobId(entry.responseBlobId); setResponseData(null); }}
                            aria-label="Open submission"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>

      {/* Detail panel */}
      <aside className={styles.detailPanel}>
        {selectedEntry ? (
          <div className={styles.detailContent}>
            <div className={styles.detailHeader}>
              <h3>Submission Details</h3>
              <div className={styles.subActions}>
                <button aria-label="Award submitter"><Award size={18} /></button>
              </div>
            </div>

            <div className={styles.detailBody}>
              <div className={styles.dataGroup}>
                <label>Submitter</label>
                <p className={styles.address}>{selectedEntry.submitter}</p>
              </div>
              <div className={styles.dataGroup}>
                <label>Timestamp</label>
                <p>{formatDate(selectedEntry.timestamp)}</p>
              </div>

              {selectedEntry.isEncrypted && !responseData ? (
                <div className={styles.encryptedNotice}>
                  <ShieldAlert size={24} />
                  <h4>Secure Data</h4>
                  <p>Decrypting via Seal…</p>
                </div>
              ) : responseData ? (
                <div className={styles.responseData}>
                  {Object.entries(responseData).map(([key, val]) => {
                    if (key === 'formId' || key === 'submittedAt') return null;
                    const fieldLabel = selectedForm?.fields.find((f) => f.id === key)?.label || key;
                    return (
                      <div key={key} className={styles.dataItem}>
                        <label>{fieldLabel}</label>
                        <p>{typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <p>Loading response from Walrus…</p>
                </div>
              )}

              <div className={styles.notesSection}>
                <label htmlFor="internal-notes">Internal Notes</label>
                <textarea
                  id="internal-notes"
                  placeholder="Leave a note for the team..."
                  value={localNotes}
                  onChange={(e) => setLocalNotes(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveNotes}
                  isLoading={savingMeta}
                >
                  Save Notes to Walrus
                </Button>
              </div>
            </div>

            <div className={styles.detailFooter}>
              <Button
                fullWidth
                variant="secondary"
                isLoading={savingMeta}
                onClick={() => handleStatusChange(selectedEntry.responseBlobId, 'Resolved')}
              >
                Mark as Resolved
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.detailEmpty}>
            <MessageSquare size={48} />
            <p>Select a submission to view details</p>
          </div>
        )}
      </aside>
    </div>
  );
};

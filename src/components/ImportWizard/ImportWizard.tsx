"use client";

import React, { useState } from 'react';
import { X, FileText, Table2, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/types/form';
import {
  getGoogleAccessToken,
  extractGoogleFormId,
  importFromGoogleForms,
} from '@/lib/importers/googleForms';
import {
  fetchAirtableTables,
  importFromAirtableTable,
} from '@/lib/importers/airtable';
import styles from './ImportWizard.module.css';

interface ImportWizardProps {
  onImported: (fields: FormField[], title: string, description?: string) => void;
  onClose: () => void;
}

type Tab = 'google' | 'airtable';

export const ImportWizard: React.FC<ImportWizardProps> = ({ onImported, onClose }) => {
  const [tab, setTab] = useState<Tab>('google');

  // Google Forms state
  const [googleUrl, setGoogleUrl] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googlePreview, setGooglePreview] = useState<{ title: string; description: string; fields: FormField[] } | null>(null);

  // Airtable state
  const [pat, setPat] = useState('');
  const [baseId, setBaseId] = useState('');
  const [airtableLoading, setAirtableLoading] = useState(false);
  const [airtableError, setAirtableError] = useState<string | null>(null);
  const [tables, setTables] = useState<{ id: string; name: string; fields: { id: string; name: string; type: string }[] }[]>([]);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [airtablePreview, setAirtablePreview] = useState<{ title: string; fields: FormField[] } | null>(null);

  // ---- Google Forms handlers ----
  const handleGoogleImport = async () => {
    setGoogleError(null);
    setGooglePreview(null);

    const formId = extractGoogleFormId(googleUrl);
    if (!formId) {
      setGoogleError('Could not extract a form ID from that URL. Make sure it is a Google Forms link.');
      return;
    }

    setGoogleLoading(true);
    try {
      const token = await getGoogleAccessToken();
      const result = await importFromGoogleForms(formId, token);
      setGooglePreview(result);
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  // ---- Airtable handlers ----
  const handleFetchTables = async () => {
    setAirtableError(null);
    setTables([]);
    setAirtablePreview(null);
    setSelectedTableId('');

    if (!pat || !baseId) {
      setAirtableError('Please fill in both your Personal Access Token and Base ID.');
      return;
    }
    setAirtableLoading(true);
    try {
      const result = await fetchAirtableTables(pat, baseId);
      setTables(result as { id: string; name: string; fields: { id: string; name: string; type: string }[] }[]);
    } catch (err) {
      setAirtableError(err instanceof Error ? err.message : 'Failed to fetch tables.');
    } finally {
      setAirtableLoading(false);
    }
  };

  const handleSelectTable = (tableId: string) => {
    setSelectedTableId(tableId);
    const table = tables.find((t) => t.id === tableId);
    if (table) {
      const preview = importFromAirtableTable(table as Parameters<typeof importFromAirtableTable>[0]);
      setAirtablePreview(preview);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>Import Form</h2>
          <p>Pull an existing form into Tusk to store responses on Walrus.</p>
          <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tabBtn} ${tab === 'google' ? styles.activeTab : ''}`}
            onClick={() => setTab('google')}
            type="button"
          >
            <FileText size={15} /> Google Forms
          </button>
          <button
            className={`${styles.tabBtn} ${tab === 'airtable' ? styles.activeTab : ''}`}
            onClick={() => setTab('airtable')}
            type="button"
          >
            <Table2 size={15} /> Airtable
          </button>
        </div>

        <div className={styles.tabContent}>
          {tab === 'google' && (
            <div className={styles.section}>
              <p className={styles.hint}>
                Paste the URL of a Google Form you own. You&apos;ll be prompted to sign in with Google to authorize read access.
              </p>
              <div className={styles.inputRow}>
                <input
                  className={styles.input}
                  type="url"
                  placeholder="https://docs.google.com/forms/d/..."
                  value={googleUrl}
                  onChange={(e) => setGoogleUrl(e.target.value)}
                />
                <Button onClick={handleGoogleImport} isLoading={googleLoading} type="button">
                  {googleLoading ? <Loader2 size={15} className={styles.spin} /> : 'Connect & Import'}
                </Button>
              </div>

              {googleError && (
                <div className={styles.errorBox}>
                  <AlertTriangle size={14} /> {googleError}
                </div>
              )}

              {googlePreview && (
                <div className={styles.preview}>
                  <div className={styles.previewHeader}>
                    <CheckCircle2 size={16} className={styles.successIcon} />
                    <strong>{googlePreview.title}</strong>
                    <span className={styles.fieldCount}>{googlePreview.fields.length} fields</span>
                  </div>
                  <div className={styles.fieldList}>
                    {googlePreview.fields.map((f) => (
                      <div key={f.id} className={styles.fieldRow}>
                        <span className={styles.fieldType}>{f.type}</span>
                        <span className={styles.fieldLabel}>{f.label}</span>
                        {f.required && <span className={styles.requiredTag}>required</span>}
                      </div>
                    ))}
                  </div>
                  <Button
                    fullWidth
                    onClick={() => { onImported(googlePreview.fields, googlePreview.title, googlePreview.description); onClose(); }}
                  >
                    Import {googlePreview.fields.length} Fields into Builder
                  </Button>
                </div>
              )}
            </div>
          )}

          {tab === 'airtable' && (
            <div className={styles.section}>
              <p className={styles.hint}>
                Enter your Airtable Personal Access Token and Base ID to fetch the table&apos;s field schema.
                <a
                  href="https://airtable.com/create/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.link}
                > Create a token ↗</a>
              </p>

              <label className={styles.fieldLabel}>Personal Access Token</label>
              <input
                className={styles.input}
                type="password"
                placeholder="pat..."
                value={pat}
                onChange={(e) => setPat(e.target.value)}
              />

              <label className={styles.fieldLabel} style={{ marginTop: '0.75rem' }}>Base ID</label>
              <input
                className={styles.input}
                type="text"
                placeholder="appXXXXXXXXXXXXXX"
                value={baseId}
                onChange={(e) => setBaseId(e.target.value)}
              />
              <p className={styles.hint} style={{ marginTop: '0.25rem' }}>
                Found in your Airtable URL: airtable.com/<strong>appXXXX</strong>/...
              </p>

              <Button onClick={handleFetchTables} isLoading={airtableLoading} type="button" style={{ marginTop: '0.75rem' }}>
                Fetch Tables
              </Button>

              {airtableError && (
                <div className={styles.errorBox}>
                  <AlertTriangle size={14} /> {airtableError}
                </div>
              )}

              {tables.length > 0 && (
                <div className={styles.tableSelect}>
                  <label className={styles.fieldLabel}>Select a table</label>
                  <select
                    className={styles.select}
                    value={selectedTableId}
                    onChange={(e) => handleSelectTable(e.target.value)}
                  >
                    <option value="">-- Choose a table --</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {airtablePreview && (
                <div className={styles.preview}>
                  <div className={styles.previewHeader}>
                    <CheckCircle2 size={16} className={styles.successIcon} />
                    <strong>{airtablePreview.title}</strong>
                    <span className={styles.fieldCount}>{airtablePreview.fields.length} fields</span>
                  </div>
                  <div className={styles.fieldList}>
                    {airtablePreview.fields.map((f) => (
                      <div key={f.id} className={styles.fieldRow}>
                        <span className={styles.fieldType}>{f.type}</span>
                        <span className={styles.fieldLabel}>{f.label}</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    fullWidth
                    onClick={() => { onImported(airtablePreview.fields, airtablePreview.title); onClose(); }}
                  >
                    Import {airtablePreview.fields.length} Fields into Builder
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

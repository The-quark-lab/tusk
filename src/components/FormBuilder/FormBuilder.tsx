"use client";

import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Settings,
  Shield,
  Save,
  ArrowLeft,
  Type,
  AlignLeft,
  List,
  Star,
  Link as LinkIcon,
  Video,
  Camera,
  CheckCircle2,
  Sparkles,
  Download,
  Palette,
  Blocks,
} from 'lucide-react';
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { uploadToWalrus } from '@/lib/walrus';
import { updateStoredForm, getStoredForms } from '@/lib/storage';
import {
  buildCreateFormTx,
  getFormObjectIdFromDigest,
  getRegistryBlobId,
  REGISTRY_OBJECT_ID,
} from '@/lib/sui';
import { toast } from 'sonner';
import { FormSchema, FormField, FormFieldType, FormsIndexEntry, FormTheme, DEFAULT_THEME } from '@/types/form';
import { Button } from '@/components/ui/Button';
import { ThemePanel } from './ThemePanel';
import { ImportWizard } from '@/components/ImportWizard/ImportWizard';
import styles from './FormBuilder.module.css';
import { clsx } from 'clsx';

const MODULE_NAME = 'walrus_forms';
void MODULE_NAME;

interface FormBuilderProps {
  onSaved: (schema: FormSchema) => void;
  onBack: () => void;
  onOpenAiBuilder?: () => void;
  initialTitle?: string;
  initialFields?: FormField[];
}

type SidebarTab = 'blocks' | 'theme';

export const FormBuilder: React.FC<FormBuilderProps> = ({
  onSaved,
  onBack,
  onOpenAiBuilder,
  initialTitle,
  initialFields,
}) => {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecuteAsync } = useSignAndExecuteTransaction();

  const [title, setTitle] = useState(initialTitle || 'My New Form');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<FormField[]>(initialFields || []);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('blocks');
  const [theme, setTheme] = useState<FormTheme>({ ...DEFAULT_THEME });
  const [showImport, setShowImport] = useState(false);

  const handleSave = async () => {
    if (fields.length === 0) {
      toast.error("Please add at least one field.");
      return;
    }
    if (!account) {
      toast.error("Connect your Sui wallet to save forms on-chain.");
      return;
    }
    if (!REGISTRY_OBJECT_ID) {
      toast.error("Registry object ID not configured. Add NEXT_PUBLIC_REGISTRY_OBJECT_ID to .env.local.");
      return;
    }

    setIsSaving(true);
    try {
      const schemaId = crypto.randomUUID();
      const schema: FormSchema = {
        id: schemaId,
        title,
        description,
        fields,
        creator: account.address,
        createdAt: Date.now(),
        theme,
      };

      toast.loading("Uploading manifest to Walrus...", { id: 'save' });
      const manifestBlobId = await uploadToWalrus([], 53);

      toast.loading("Uploading schema to Walrus...", { id: 'save' });
      const schemaWithManifest = { ...schema, manifestBlobId };
      const schemaBlobId = await uploadToWalrus(schemaWithManifest, 53);

      // Build the updated forms index for the registry
      toast.loading("Reading forms registry from Walrus...", { id: 'save' });
      let existingIndex: FormsIndexEntry[] = [];
      const currentRegistryBlobId = await getRegistryBlobId();
      if (currentRegistryBlobId) {
        try {
          const { downloadFromWalrus } = await import('@/lib/walrus');
          existingIndex = await downloadFromWalrus<FormsIndexEntry[]>(currentRegistryBlobId);
        } catch {
          existingIndex = [];
        }
      }

      const placeholderEntry: FormsIndexEntry = {
        id: schemaId,
        title,
        creator: account.address,
        schemaBlobId,
        manifestBlobId,
        formObjectId: '',
      };
      const newIndex = [placeholderEntry, ...existingIndex.filter(e => e.id !== schemaId)];
      toast.loading("Uploading forms index to Walrus...", { id: 'save' });
      const newRegistryBlobId = await uploadToWalrus(newIndex, 53);

      // Generate ephemeral keypair to embed in the share URL
      const ephemKey = new Ed25519Keypair();
      const ephemeralAddress = ephemKey.toSuiAddress();
      const ephemeralKey = ephemKey.getSecretKey();

      toast.loading("Registering on Sui...", { id: 'save' });
      const tx = buildCreateFormTx({
        title,
        description: description || '',
        schemaBlobId,
        manifestBlobId,
        newRegistryBlobId,
        ephemeralAddress,
      });

      const result = await signAndExecuteAsync({ transaction: tx });
      const txDigest = result.digest;

      toast.loading("Confirming on-chain...", { id: 'save' });
      const formObjectId = await getFormObjectIdFromDigest(txDigest);

      if (formObjectId) {
        const finalEntry: FormsIndexEntry = { ...placeholderEntry, formObjectId };
        const finalIndex = [finalEntry, ...existingIndex.filter(e => e.id !== schemaId)];
        const finalRegistryBlobId = await uploadToWalrus(finalIndex, 53);

        const { buildSetRegistryTx } = await import('@/lib/sui');
        const regTx = buildSetRegistryTx(finalRegistryBlobId);
        await signAndExecuteAsync({ transaction: regTx });
      }

      const savedSchema: FormSchema = {
        ...schema,
        schemaBlobId,
        manifestBlobId,
        formObjectId: formObjectId ?? undefined,
        txDigest,
        ephemeralKey,
        theme,
      };

      updateStoredForm(savedSchema);
      toast.success("Form saved on Walrus and registered on Sui!", { id: 'save' });
      onSaved(savedSchema);
    } catch (error) {
      console.error("Save failed:", error);
      toast.error(`Failed to save form: ${error instanceof Error ? error.message : String(error)}`, { id: 'save' });
    } finally {
      setIsSaving(false);
    }
  };

  const createStarterForm = () => {
    setTitle("Walrus Sessions Feedback");
    setDescription("Share product feedback with optional private evidence for the team.");
    setFields([
      {
        id: Math.random().toString(36).substr(2, 9),
        type: "rating",
        label: "How useful was this session?",
        required: true,
      },
      {
        id: Math.random().toString(36).substr(2, 9),
        type: "textarea",
        label: "What should the team improve next?",
        required: true,
        placeholder: "Be specific about the workflow, docs, or product area.",
      },
      {
        id: Math.random().toString(36).substr(2, 9),
        type: "screenshot",
        label: "Attach a screenshot if it helps explain the issue",
        isPrivate: true,
      },
      {
        id: Math.random().toString(36).substr(2, 9),
        type: "confirmation",
        label: "I consent to this feedback being reviewed by the form admins",
        required: true,
      },
    ]);
  };

  const addField = (type: FormFieldType) => {
    const newField: FormField = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      label: `New ${type} question`,
      required: false,
      isPrivate: false,
      options: type === 'dropdown' ? ['Option 1', 'Option 2'] : undefined,
    };
    setFields([...fields, newField]);
    setActiveFieldId(newField.id);
  };

  const removeField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
    if (activeFieldId === id) setActiveFieldId(null);
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...fields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= fields.length) return;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    setFields(newFields);
  };

  const handleImported = (importedFields: FormField[], importedTitle: string, importedDesc?: string) => {
    setFields(importedFields);
    setTitle(importedTitle);
    if (importedDesc) setDescription(importedDesc);
    toast.success(`Imported ${importedFields.length} fields from "${importedTitle}"`);
  };

  return (
    <>
      {showImport && (
        <ImportWizard
          onImported={handleImported}
          onClose={() => setShowImport(false)}
        />
      )}

      <div className={styles.builder}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <button className={styles.backBtn} onClick={onBack} type="button">
              <ArrowLeft size={16} /> Back
            </button>

            {/* Sidebar tab switcher */}
            <div className={styles.sidebarTabs}>
              <button
                type="button"
                className={clsx(styles.sidebarTabBtn, sidebarTab === 'blocks' && styles.activeSidebarTab)}
                onClick={() => setSidebarTab('blocks')}
              >
                <Blocks size={14} /> Blocks
              </button>
              <button
                type="button"
                className={clsx(styles.sidebarTabBtn, sidebarTab === 'theme' && styles.activeSidebarTab)}
                onClick={() => setSidebarTab('theme')}
              >
                <Palette size={14} /> Theme
              </button>
            </div>
          </div>

          {sidebarTab === 'blocks' ? (
            <>
              <div className={styles.quickActions}>
                {onOpenAiBuilder && (
                  <button type="button" className={styles.quickBtn} onClick={onOpenAiBuilder}>
                    <Sparkles size={14} /> AI Builder
                  </button>
                )}
                <button type="button" className={styles.quickBtn} onClick={() => setShowImport(true)}>
                  <Download size={14} /> Import
                </button>
              </div>

              <p className={styles.sidebarSub}>Click to add to your form</p>
              <div className={styles.toolGrid}>
                <ToolButton icon={<Type size={18} />} label="Text" onClick={() => addField('text')} />
                <ToolButton icon={<AlignLeft size={18} />} label="Long Text" onClick={() => addField('textarea')} />
                <ToolButton icon={<List size={18} />} label="Dropdown" onClick={() => addField('dropdown')} />
                <ToolButton icon={<Star size={18} />} label="Rating" onClick={() => addField('rating')} />
                <ToolButton icon={<Camera size={18} />} label="Screenshot" onClick={() => addField('screenshot')} />
                <ToolButton icon={<Video size={18} />} label="Video" onClick={() => addField('video')} />
                <ToolButton icon={<LinkIcon size={18} />} label="URL" onClick={() => addField('url')} />
                <ToolButton icon={<CheckCircle2 size={18} />} label="Confirm" onClick={() => addField('confirmation')} />
              </div>
            </>
          ) : (
            <ThemePanel theme={theme} onChange={setTheme} />
          )}
        </aside>

        <main className={styles.editor}>
          <div className={styles.header}>
            <div className={styles.topHeader}>
              <label className={styles.titleLabel}>
                <span>Form title</span>
                <input
                  className={styles.titleInput}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Form Title"
                />
              </label>
              <ConnectButton />
            </div>
            <label className={styles.descLabel}>
              <span>Description</span>
              <textarea
                className={styles.descInput}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description..."
              />
            </label>
          </div>

          <div className={styles.fieldList}>
            {fields.length === 0 ? (
              <div className={styles.emptyState}>
                <Plus size={48} />
                <p>Start by adding a field from the sidebar</p>
                <Button variant="outline" onClick={createStarterForm} type="button">
                  Use Feedback Template
                </Button>
              </div>
            ) : (
              fields.map((field, index) => (
                <div
                  key={field.id}
                  className={clsx(styles.fieldItem, activeFieldId === field.id && styles.active)}
                >
                  <div className={styles.fieldHeader}>
                    <span className={styles.fieldIndex}>{index + 1}</span>
                    <span className={styles.fieldType}>{field.type}</span>
                    <div className={styles.fieldActions}>
                      <button type="button" onClick={() => setActiveFieldId(field.id)}>Edit</button>
                      <button type="button" onClick={() => moveField(index, 'up')} disabled={index === 0} aria-label="Move field up"><ChevronUp size={16} /></button>
                      <button type="button" onClick={() => moveField(index, 'down')} disabled={index === fields.length - 1} aria-label="Move field down"><ChevronDown size={16} /></button>
                      <button type="button" onClick={() => removeField(field.id)} className={styles.deleteBtn} aria-label="Delete field"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <label className={styles.fieldLabel} htmlFor={`field-${field.id}`}>
                    <span>Question text</span>
                    <input
                      id={`field-${field.id}`}
                      className={styles.labelInput}
                      value={field.label}
                      onChange={(e) => updateField(field.id, { label: e.target.value })}
                      onFocus={() => setActiveFieldId(field.id)}
                      placeholder="Enter question text..."
                    />
                  </label>
                </div>
              ))
            )}
          </div>
        </main>

        <aside className={styles.properties}>
          {activeFieldId ? (
            <div className={styles.propsContent}>
              <h3>Question Settings</h3>
              <div className={styles.propGroup}>
                <label>Placeholder</label>
                <input
                  type="text"
                  value={fields.find(f => f.id === activeFieldId)?.placeholder || ''}
                  onChange={(e) => updateField(activeFieldId, { placeholder: e.target.value })}
                />
              </div>

              {fields.find(f => f.id === activeFieldId)?.type === 'dropdown' && (
                <div className={styles.propGroup}>
                  <label>Options</label>
                  <div className={styles.optionsList}>
                    {fields.find(f => f.id === activeFieldId)?.options?.map((option, idx) => (
                      <div key={idx} className={styles.optionItem}>
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...(fields.find(f => f.id === activeFieldId)?.options || [])];
                            newOptions[idx] = e.target.value;
                            updateField(activeFieldId, { options: newOptions });
                          }}
                        />
                        <button
                          onClick={() => {
                            const newOptions = (fields.find(f => f.id === activeFieldId)?.options || []).filter((_, i) => i !== idx);
                            updateField(activeFieldId, { options: newOptions });
                          }}
                          className={styles.removeOption}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const currentOptions = fields.find(f => f.id === activeFieldId)?.options || [];
                        updateField(activeFieldId, { options: [...currentOptions, `Option ${currentOptions.length + 1}`] });
                      }}
                    >
                      <Plus size={14} /> Add Option
                    </Button>
                  </div>
                  <label className={clsx(styles.toggle, styles.mt1)}>
                    <input
                      type="checkbox"
                      checked={fields.find(f => f.id === activeFieldId)?.allowCustomOption || false}
                      onChange={(e) => updateField(activeFieldId, { allowCustomOption: e.target.checked })}
                    />
                    Allow &quot;Other&quot; (Custom Option)
                  </label>
                </div>
              )}

              <div className={styles.propToggles}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={fields.find(f => f.id === activeFieldId)?.required || false}
                    onChange={(e) => updateField(activeFieldId, { required: e.target.checked })}
                  />
                  Required
                </label>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={fields.find(f => f.id === activeFieldId)?.isPrivate || false}
                    onChange={(e) => updateField(activeFieldId, { isPrivate: e.target.checked })}
                  />
                  <Shield size={14} /> Private (Seal)
                </label>
              </div>
            </div>
          ) : (
            <div className={styles.propsEmpty}>
              <Settings size={32} />
              <p>Select a question to edit its properties</p>
            </div>
          )}

          <div className={styles.footer}>
            <Button
              fullWidth
              onClick={handleSave}
              isLoading={isSaving}
              type="button"
            >
              <Save size={18} /> {isSaving ? 'Saving to Walrus...' : 'Save Form'}
            </Button>
          </div>
        </aside>
      </div>
    </>
  );
};

function ToolButton({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button className={styles.toolBtn} onClick={onClick}>
      <div className={styles.toolIcon}>{icon}</div>
      <span>{label}</span>
    </button>
  );
}

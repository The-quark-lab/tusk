"use client";

import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { FormTheme, DEFAULT_THEME } from '@/types/form';
import { uploadMediaToWalrus } from '@/lib/walrus';
import styles from './ThemePanel.module.css';

interface ThemePanelProps {
  theme: FormTheme;
  onChange: (theme: FormTheme) => void;
}

const FONTS: FormTheme['fontFamily'][] = ['Inter', 'Outfit', 'DM Sans', 'Space Grotesk'];
const BUTTON_STYLES: FormTheme['buttonStyle'][] = ['rounded', 'pill', 'sharp'];
const BG_TYPES: FormTheme['backgroundType'][] = ['solid', 'gradient', 'image'];

const PRESET_ACCENTS = [
  '#7c3aed', '#2563eb', '#059669', '#dc2626',
  '#d97706', '#db2777', '#0891b2', '#4f46e5',
];

export const ThemePanel: React.FC<ThemePanelProps> = ({ theme, onChange }) => {
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);

  const update = (partial: Partial<FormTheme>) => onChange({ ...theme, ...partial });

  const handleCoverUpload = async (file: File) => {
    setUploadingCover(true);
    try {
      const blobId = await uploadMediaToWalrus(file);
      update({ coverImageBlobId: blobId });
    } finally {
      setUploadingCover(false);
    }
  };

  const handleBgUpload = async (file: File) => {
    setUploadingBg(true);
    try {
      const blobId = await uploadMediaToWalrus(file);
      update({ backgroundImageBlobId: blobId, backgroundType: 'image' });
    } finally {
      setUploadingBg(false);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <label className={styles.sectionLabel}>Accent Color</label>
        <div className={styles.presets}>
          {PRESET_ACCENTS.map((color) => (
            <button
              key={color}
              type="button"
              className={styles.colorDot}
              style={{
                background: color,
                outline: theme.accentColor === color ? `2px solid ${color}` : 'none',
                outlineOffset: 2,
              }}
              onClick={() => update({ accentColor: color })}
              aria-label={color}
            />
          ))}
          <input
            type="color"
            value={theme.accentColor}
            onChange={(e) => update({ accentColor: e.target.value })}
            className={styles.colorPicker}
            title="Custom accent color"
          />
        </div>
      </div>

      <div className={styles.section}>
        <label className={styles.sectionLabel}>Background</label>
        <div className={styles.tabs}>
          {BG_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.tab} ${theme.backgroundType === t ? styles.activeTab : ''}`}
              onClick={() => update({ backgroundType: t })}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {theme.backgroundType === 'solid' && (
          <div className={styles.colorPickerWrapper}>
            <input
              type="color"
              value={theme.backgroundColor}
              onChange={(e) => update({ backgroundColor: e.target.value })}
              className={styles.colorPicker}
            />
            <span className={styles.colorValue}>{theme.backgroundColor}</span>
          </div>
        )}

        {theme.backgroundType === 'gradient' && (
          <div className={styles.gradientRow}>
            <input
              type="color"
              value={theme.backgroundColor}
              onChange={(e) => {
                const start = e.target.value;
                const end = theme.backgroundGradient?.match(/#[a-fA-F0-9]{6}/g)?.[1] || '#1a0533';
                onChange({
                  ...theme,
                  backgroundColor: start,
                  backgroundGradient: `135deg, ${start} 0%, ${end} 100%`
                });
              }}
              className={styles.colorPicker}
              title="Gradient start"
            />
            <span className={styles.gradientArrow}>→</span>
            <input
              type="color"
              value={theme.backgroundGradient?.match(/#[a-fA-F0-9]{6}/g)?.[1] || '#1a0533'}
              onChange={(e) => {
                const start = theme.backgroundColor;
                update({ backgroundGradient: `135deg, ${start} 0%, ${e.target.value} 100%` });
              }}
              className={styles.colorPicker}
              title="Gradient end"
            />
          </div>
        )}

        {theme.backgroundType === 'image' && (
          <label className={styles.uploadBtn}>
            {uploadingBg ? 'Uploading...' : (
              <><Upload size={14} /> {theme.backgroundImageBlobId ? 'Change image' : 'Upload image'}</>
            )}
            <input
              type="file"
              accept="image/*"
              disabled={uploadingBg}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBgUpload(f); }}
            />
          </label>
        )}
      </div>

      <div className={styles.section}>
        <label className={styles.sectionLabel}>Cover Image</label>
        <label className={styles.uploadBtn}>
          {uploadingCover ? 'Uploading...' : (
            <><Upload size={14} /> {theme.coverImageBlobId ? 'Change cover' : 'Upload cover'}</>
          )}
          <input
            type="file"
            accept="image/*"
            disabled={uploadingCover}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f); }}
          />
        </label>
        {theme.coverImageBlobId && (
          <p className={styles.hint}>Cover uploaded ✓</p>
        )}
      </div>

      <div className={styles.section}>
        <label className={styles.sectionLabel}>Font</label>
        <div className={styles.optionRow}>
          {FONTS.map((f) => (
            <button
              key={f}
              type="button"
              className={`${styles.optionBtn} ${theme.fontFamily === f ? styles.activeOption : ''}`}
              style={{ fontFamily: f }}
              onClick={() => update({ fontFamily: f })}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <label className={styles.sectionLabel}>Button Style</label>
        <div className={styles.optionRow}>
          {BUTTON_STYLES.map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.optionBtn} ${theme.buttonStyle === s ? styles.activeOption : ''}`}
              onClick={() => update({ buttonStyle: s })}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <label className={styles.sectionLabel}>Form Brand Name</label>
        <input
          type="text"
          className={styles.textInput}
          placeholder="e.g. Acme Feedback"
          value={theme.logoText || ''}
          onChange={(e) => update({ logoText: e.target.value })}
        />
      </div>

      <button
        type="button"
        className={styles.resetBtn}
        onClick={() => onChange({ ...DEFAULT_THEME })}
      >
        Reset to default
      </button>
    </div>
  );
};

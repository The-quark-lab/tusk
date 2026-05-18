"use client";

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FormSchema, FormField } from '@/types/form';
import { Button } from '@/components/ui/Button';
import { ChevronRight, ChevronLeft, Check, Upload, Video, Square } from 'lucide-react';
import styles from './FormPlayer.module.css';

const AGGREGATOR_URL = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';

interface FormPlayerProps {
  schema: FormSchema;
  onSubmit: (data: Record<string, unknown>, formSchema: FormSchema) => Promise<void> | void;
  onBack?: () => void;
}

export const FormPlayer: React.FC<FormPlayerProps> = ({ schema, onSubmit, onBack }) => {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [direction, setDirection] = useState(1);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Build CSS custom properties from the form's theme
  const themeVars = useMemo(() => {
    const t = schema.theme;
    if (!t) return {};
    const vars: React.CSSProperties & Record<string, string> = {
      '--player-accent': t.accentColor,
      '--player-font': t.fontFamily,
    };
    if (t.backgroundType === 'solid') {
      vars['--player-bg'] = t.backgroundColor;
    } else if (t.backgroundType === 'gradient') {
      vars['--player-bg'] = `linear-gradient(${t.backgroundGradient || `135deg, ${t.backgroundColor} 0%, #1a0533 100%`})`;
    } else if (t.backgroundType === 'image' && t.backgroundImageBlobId) {
      vars['--player-bg'] = `url(${AGGREGATOR_URL}/v1/blobs/${t.backgroundImageBlobId}) center/cover no-repeat`;
    }
    if (t.buttonStyle === 'pill') vars['--player-btn-radius'] = '999px';
    else if (t.buttonStyle === 'sharp') vars['--player-btn-radius'] = '4px';
    else vars['--player-btn-radius'] = '10px';
    return vars;
  }, [schema.theme]);

  const coverBlobId = schema.theme?.coverImageBlobId;

  const totalFields = schema.fields.length;
  const progress = currentIndex === -1 ? 0 : ((currentIndex + 1) / totalFields) * 100;
  const currentField = currentIndex >= 0 ? schema.fields[currentIndex] : null;

  const validateCurrent = () => {
    if (!currentField?.required) return true;
    const value = responses[currentField.id];
    const isMissing =
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0) ||
      value === false;

    if (isMissing) {
      setError("This question is required.");
      return false;
    }

    setError("");
    return true;
  };

  const handleNext = () => {
    if (currentIndex >= 0 && !validateCurrent()) return;

    if (currentIndex < totalFields - 1) {
      setDirection(1);
      setCurrentIndex(currentIndex + 1);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError("");

    try {
      await onSubmit(responses, schema);
      setIsComplete(true);
    } catch (err) {
      console.error(err);
      setError("Submission failed. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (currentIndex > -1) {
      setDirection(-1);
      setCurrentIndex(currentIndex - 1);
    }
  };

  const updateResponse = (fieldId: string, value: unknown) => {
    setResponses(prev => ({ ...prev, [fieldId]: value }));
  };

  return (
    <div className={styles.container} style={themeVars as React.CSSProperties}>
      {coverBlobId && (
        <div
          className={styles.cover}
          style={{ backgroundImage: `url(${AGGREGATOR_URL}/v1/blobs/${coverBlobId})` }}
        />
      )}
      <div className={styles.progressBar} style={{ width: `${progress}%`, background: schema.theme?.accentColor || undefined }} />
      
      {schema.theme?.logoText && (
        <header className={styles.brandHeader}>
          <span className={styles.brandLogoText}>{schema.theme.logoText}</span>
        </header>
      )}

      <div className={styles.content}>
        <AnimatePresence mode="wait" custom={direction}>
          {isComplete ? (
            <motion.div
              key="complete"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              className={styles.slide}
            >
              <span className={styles.successIcon}><Check size={28} /></span>
              <h1>Submission stored</h1>
              <p className={styles.description}>Your response is saved for the form admins.</p>
              {onBack && <Button size="lg" onClick={onBack}>Back to app</Button>}
            </motion.div>
          ) : currentIndex === -1 ? (
            <motion.div
              key="welcome"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              className={styles.slide}
            >
              <h1 className="text-gradient">{schema.title}</h1>
              {schema.description && <p className={styles.description}>{schema.description}</p>}
              <div className={styles.controls}>
                {onBack && <Button variant="secondary" size="lg" onClick={onBack}>Back</Button>}
                <Button size="lg" onClick={handleNext}>
                  Start <ChevronRight size={18} />
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={schema.fields[currentIndex].id}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              className={styles.slide}
            >
              <span className={styles.fieldNumber}>Question {currentIndex + 1} of {totalFields}</span>
              <h2 className={styles.label}>
                {schema.fields[currentIndex].label}
                {schema.fields[currentIndex].required && <span className={styles.required}>*</span>}
              </h2>
              
              <div className={styles.inputWrapper}>
                <FieldRenderer 
                  field={schema.fields[currentIndex]} 
                  value={responses[schema.fields[currentIndex].id]} 
                  onChange={(val) => updateResponse(schema.fields[currentIndex].id, val)}
                  onEnter={handleNext}
                />
                {error && <p className={styles.errorText}>{error}</p>}
              </div>

              <div className={styles.controls}>
                <Button variant="secondary" onClick={handleBack}>
                  <ChevronLeft size={18} /> Back
                </Button>
                <Button onClick={handleNext} isLoading={isSubmitting}>
                  {currentIndex === totalFields - 1 ? 'Submit' : 'Next'} <ChevronRight size={18} />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const variants = {
  enter: (direction: number) => ({
    y: direction > 0 ? 50 : -50,
    opacity: 0,
  }),
  center: {
    y: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    y: direction < 0 ? 50 : -50,
    opacity: 0,
  }),
};

function FieldRenderer({ field, value, onChange, onEnter }: { 
  field: FormField, 
  value: unknown, 
  onChange: (val: unknown) => void,
  onEnter: () => void 
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      onEnter();
    }
  };

  switch (field.type) {
    case 'text':
    case 'url':
      return (
        <input 
          type={field.type === 'url' ? 'url' : 'text'} 
          className={styles.textInput} 
          placeholder={field.placeholder || (field.type === 'url' ? "https://..." : "Type your answer here...")}
          value={typeof value === "string" ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      );
    case 'textarea':
      return (
        <textarea 
          className={styles.textarea} 
          placeholder={field.placeholder || "Type your answer here..."}
          value={typeof value === "string" ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          autoFocus
        />
      );
    case 'screenshot':
      return (
        <label className={styles.uploadBox}>
          <Upload size={24} />
          <span>{value instanceof File ? value.name : "Upload screenshot"}</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onChange(e.target.files?.[0] || null)}
          />
        </label>
      );
    case 'video':
      return <VideoInput value={value instanceof File || value instanceof Blob ? value : undefined} onChange={onChange} />;
    case 'dropdown': {
      const options = field.options || [];
      const showOther = field.allowCustomOption;
      const stringValue = typeof value === "string" ? value : "";
      const isOtherSelected = stringValue && !options.includes(stringValue);
      
      return (
        <div className={styles.choiceWrapper}>
          {options.map((opt, idx) => (
            <button 
              key={idx}
              className={clsx(styles.choiceBtn, stringValue === opt && styles.activeChoice)}
              onClick={() => onChange(opt)}
            >
              <span className={styles.choiceKey}>{String.fromCharCode(65 + idx)}</span>
              {opt}
            </button>
          ))}
          {showOther && (
            <div className={styles.otherWrapper}>
              <button 
                className={clsx(styles.choiceBtn, isOtherSelected && styles.activeChoice)}
                onClick={() => onChange(isOtherSelected ? '' : 'Other...')}
              >
                <span className={styles.choiceKey}>{String.fromCharCode(65 + options.length)}</span>
                Other
              </button>
              {isOtherSelected && (
                <input 
                  type="text"
                  className={styles.otherInput}
                  placeholder="Please specify..."
                  value={stringValue === 'Other...' ? '' : stringValue}
                  onChange={(e) => onChange(e.target.value)}
                  autoFocus
                />
              )}
            </div>
          )}
        </div>
      );
    }
    case 'checkbox':
    case 'confirmation':
      return (
        <button 
          className={clsx(styles.confirmBtn, value === true && styles.activeConfirm)}
          onClick={() => onChange(!value)}
        >
          <div className={styles.checkbox}>
            {value === true && <Check size={20} />}
          </div>
          <span>{field.label}</span>
        </button>
      );
    case 'rating':
      return (
        <div className={styles.ratingWrapper}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button 
              key={star}
              className={clsx(styles.star, (typeof value === "number" ? value : 0) >= star && styles.activeStar)}
              onClick={() => onChange(star)}
            >
              ★
            </button>
          ))}
        </div>
      );
    default:
      return (
        <div className={styles.placeholderBox}>
          <p>Input type <strong>{field.type}</strong> will be implemented with Walrus/Seal integration.</p>
        </div>
      );
  }
}

import { clsx } from 'clsx';

function VideoInput({ value, onChange }: { value: File | Blob | undefined, onChange: (val: File | Blob | null) => void }) {
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      onChange(new Blob(chunks, { type: "video/webm" }));
      setRecording(false);
      setRecorder(null);
    };

    mediaRecorder.start();
    setRecorder(mediaRecorder);
    setRecording(true);
  };

  return (
    <div className={styles.videoTools}>
      <label className={styles.uploadBox}>
        <Upload size={24} />
        <span>{value instanceof File ? value.name : value ? "Screen recording ready" : "Upload video"}</span>
        <input
          type="file"
          accept="video/*"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
        />
      </label>
      {recording ? (
        <Button type="button" variant="secondary" onClick={() => recorder?.stop()}>
          <Square size={16} /> Stop recording
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={startRecording}>
          <Video size={16} /> Record screen
        </Button>
      )}
    </div>
  );
}

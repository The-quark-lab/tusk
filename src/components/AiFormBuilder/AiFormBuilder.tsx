"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, ArrowLeft, Zap, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/types/form';
import { GroqMessage, chatWithGroq, generateFormFields } from '@/lib/groq';
import styles from './AiFormBuilder.module.css';

interface AiFormBuilderProps {
  onFieldsGenerated: (fields: FormField[], title: string) => void;
  onBack: () => void;
}

type Stage = 'chatting' | 'confirming' | 'generating' | 'done';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const INITIAL_MESSAGE: ChatMessage = {
  role: 'assistant',
  content: "Hi! I'm Tusk AI 🐘 Tell me what kind of form you'd like to create and I'll help you build it. What's it for?",
};

export const AiFormBuilder: React.FC<AiFormBuilderProps> = ({ onFieldsGenerated, onBack }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [stage, setStage] = useState<Stage>('chatting');
  const [formTitle, setFormTitle] = useState('AI Generated Form');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const groqMessages: GroqMessage[] = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const reply = await chatWithGroq(groqMessages);

      // Extract title hint from conversation if present
      const titleMatch = reply.match(/(?:form|called|titled?)[:\s]+["']?([^"'\n,]+)["']?/i);
      if (titleMatch) setFormTitle(titleMatch[1].trim());

      const isReady = reply.includes('READY_TO_GENERATE');
      const cleanReply = reply.replace('READY_TO_GENERATE', '').trim();

      setMessages((prev) => [...prev, { role: 'assistant', content: cleanReply }]);
      if (isReady) setStage('confirming');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    setStage('generating');
    setError(null);
    try {
      const groqMessages: GroqMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const fields = await generateFormFields(groqMessages, formTitle);
      setStage('done');
      onFieldsGenerated(fields, formTitle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed. Please try again.');
      setStage('chatting');
    }
  };

  const handleReset = () => {
    setMessages([INITIAL_MESSAGE]);
    setStage('chatting');
    setInput('');
    setError(null);
    setFormTitle('AI Generated Form');
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack} type="button">
          <ArrowLeft size={16} /> Back
        </button>
        <div className={styles.headerTitle}>
          <Sparkles size={18} className={styles.sparkle} />
          <span>AI Form Builder</span>
        </div>
        <button className={styles.resetBtn} onClick={handleReset} type="button" title="Start over">
          <RotateCcw size={15} />
        </button>
      </div>

      <div className={styles.messages}>
        {messages.map((msg, i) => (
          <div key={i} className={`${styles.bubble} ${styles[msg.role]}`}>
            {msg.role === 'assistant' && (
              <div className={styles.avatar}>
                <Sparkles size={12} />
              </div>
            )}
            <div className={styles.bubbleText}>{msg.content}</div>
          </div>
        ))}

        {isLoading && (
          <div className={`${styles.bubble} ${styles.assistant}`}>
            <div className={styles.avatar}><Sparkles size={12} /></div>
            <div className={styles.typing}>
              <span /><span /><span />
            </div>
          </div>
        )}

        {error && (
          <div className={styles.errorBanner}>{error}</div>
        )}

        <div ref={endRef} />
      </div>

      {stage === 'confirming' && (
        <div className={styles.confirmBanner}>
          <Zap size={16} />
          <span>Ready to generate your form!</span>
          <div className={styles.confirmActions}>
            <Button size="sm" onClick={handleGenerate}>Generate Form</Button>
            <Button size="sm" variant="outline" onClick={() => setStage('chatting')}>
              Keep Chatting
            </Button>
          </div>
        </div>
      )}

      {stage === 'generating' && (
        <div className={styles.generatingBanner}>
          <Sparkles size={16} className={styles.spinIcon} />
          <span>Generating your form fields…</span>
        </div>
      )}

      {stage === 'chatting' && (
        <div className={styles.inputRow}>
          <input
            className={styles.input}
            type="text"
            placeholder="Describe your form..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            disabled={isLoading}
            autoFocus
          />
          <Button
            size="sm"
            onClick={sendMessage}
            isLoading={isLoading}
            disabled={!input.trim()}
            type="button"
          >
            <Send size={15} />
          </Button>
        </div>
      )}
    </div>
  );
};

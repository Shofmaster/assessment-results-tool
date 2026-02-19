import { useState, useRef } from 'react';
import { FiX, FiUpload } from 'react-icons/fi';
import { Button, GlassCard } from './ui';
import type { AuditorQuestionAnswer } from '../types/auditSimulation';
import { useDefaultClaudeModel } from '../hooks/useConvexData';
import { DocumentExtractor } from '../services/documentExtractor';

const MAX_DOC_CHARS = 18000;

export interface AuditorQuestionModalProps {
  open: boolean;
  agentName: string;
  question: string;
  onAnswer: (answer: AuditorQuestionAnswer) => void;
  onClose: () => void;
}

export default function AuditorQuestionModal({
  open,
  agentName,
  question,
  onAnswer,
  onClose,
}: AuditorQuestionModalProps) {
  const [textInput, setTextInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const defaultModel = useDefaultClaudeModel();
  const extractor = useRef(new DocumentExtractor()).current;

  if (!open) return null;

  const handleYes = () => {
    onAnswer({ type: 'yes', value: '' });
    onClose();
  };

  const handleNo = () => {
    onAnswer({ type: 'no', value: '' });
    onClose();
  };

  const handleTextSubmit = () => {
    const trimmed = textInput.trim();
    if (trimmed) {
      onAnswer({ type: 'text', value: trimmed });
      onClose();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const text = await extractor.extractText(buffer, file.name, file.type || '', defaultModel);
      const value = `${file.name}:\n\n${text.substring(0, MAX_DOC_CHARS)}`;
      onAnswer({ type: 'document', value });
      onClose();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Failed to extract text from document');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <GlassCard padding="xl" className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-xl font-display font-bold text-white">
            Question from {agentName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <p className="text-white/90 mb-6 whitespace-pre-wrap">{question}</p>

        <div className="flex flex-wrap gap-2 mb-4">
          <Button variant="success" size="md" onClick={handleYes}>
            Yes
          </Button>
          <Button variant="destructive" size="md" onClick={handleNo}>
            No
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Or type your response
            </label>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Enter your answer..."
              rows={3}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-sky-light resize-y"
            />
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={handleTextSubmit}
              disabled={!textInput.trim()}
            >
              Submit text
            </Button>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Or upload a document
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="secondary"
              size="md"
              icon={<FiUpload className="w-4 h-4" />}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Extracting...' : 'Choose file'}
            </Button>
            {uploadError && (
              <p className="mt-2 text-sm text-red-400">{uploadError}</p>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

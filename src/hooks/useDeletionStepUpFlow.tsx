import { useRef, useState, useCallback } from 'react';
import { useQuery } from './useConvexQueryNoThrow';
import { api } from '../../convex/_generated/api';
import type { DeletionStepUp } from '../types/deletionStepUp';
import DeletionStepUpModal from '../components/DeletionStepUpModal';

export class DeletionPinRequiredError extends Error {
  constructor() {
    super('DELETION_PIN_REQUIRED');
    this.name = 'DeletionPinRequiredError';
  }
}

type Resolver = {
  exec: (stepUp: DeletionStepUp) => Promise<void>;
  cancel: () => void;
};

/**
 * Wrap destructive Convex calls with a PIN/password step-up modal.
 * Render `deletionStepUpModal` once near the root of your component tree.
 */
export function useDeletionStepUpFlow() {
  const pinStatus = useQuery(api.deletionStepUp.hasDeletionPin);
  const [open, setOpen] = useState(false);
  const resolverRef = useRef<Resolver | null>(null);

  const runWithStepUp = useCallback(
    async (fn: (stepUp: DeletionStepUp) => Promise<void>): Promise<void> => {
      if (pinStatus === undefined) {
        throw new Error('Still loading security settings — try again in a moment.');
      }
      if (!pinStatus.configured) {
        throw new DeletionPinRequiredError();
      }
      return await new Promise<void>((resolve, reject) => {
        let settled = false;
        resolverRef.current = {
          exec: async (stepUp) => {
            await fn(stepUp);
            if (!settled) {
              settled = true;
              resolverRef.current = null;
              setOpen(false);
              resolve();
            }
          },
          cancel: () => {
            if (!settled) {
              settled = true;
              resolverRef.current = null;
              setOpen(false);
              reject(new Error('cancelled'));
            }
          },
        };
        setOpen(true);
      });
    },
    [pinStatus],
  );

  const handleClose = () => {
    resolverRef.current?.cancel();
  };

  const handleComplete = async (stepUp: DeletionStepUp) => {
    const r = resolverRef.current;
    if (!r) return;
    await r.exec(stepUp);
  };

  const deletionStepUpModal = (
    <DeletionStepUpModal open={open} onClose={handleClose} onComplete={handleComplete} />
  );

  return {
    deletionPinConfigured: pinStatus?.configured === true,
    deletionPinLoading: pinStatus === undefined,
    runWithStepUp,
    deletionStepUpModal,
  };
}

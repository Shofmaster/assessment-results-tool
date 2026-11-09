import { toast } from 'sonner';

/** Surface (rather than swallow) workspace-preference persistence failures. */
export const toastSettingsSaveFailed = () =>
  toast.error('Could not save your workspace preference — it may reset on reload.', {
    id: 'workspace-pref-save',
  });

import { describe, expect, it } from 'vitest';
import { validateForm337ForGenerate } from '../../services/form337Validation';
import type { Form337Input } from '../../services/form337Service';

const blankForm = {
  title: ' ',
  unitType: 'airframe',
  aircraft: { nationalityRegistration: '', serialNumber: '' },
  owner: { name: '' },
  workItems: [{ description: '', approvedData: '  ' }],
} as unknown as Form337Input;

describe('validateForm337ForGenerate', () => {
  it('reports one friendly message per missing required field', () => {
    const result = validateForm337ForGenerate(blankForm);
    expect(result.ok).toBe(false);
    expect(result.messages).toEqual([
      'Title is required',
      'Aircraft nationality & registration is required',
      'Aircraft serial number is required',
      'Owner name is required',
      'Each work item needs a description',
      'Each work item needs an approved-data / regulatory basis',
    ]);
  });

  it('asks for at least one work item', () => {
    const result = validateForm337ForGenerate({ ...blankForm, workItems: [] } as Form337Input);
    expect(result.messages).toContain('Add at least one work item');
  });

  it('passes a complete form', () => {
    const result = validateForm337ForGenerate({
      ...blankForm,
      title: 'Install STC',
      aircraft: { nationalityRegistration: 'N123AB', serialNumber: '42' },
      owner: { name: 'Jane Owner' },
      workItems: [{ description: 'Installed antenna', approvedData: 'STC SA01234CH', weightChange: 'No change' }],
    } as unknown as Form337Input);
    expect(result).toEqual({ ok: true, messages: [], warnings: [] });
  });
});

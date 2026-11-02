'use client';

/**
 * Manager-only dialog to correct a return's counts. A reason is required, and
 * the API stores it with the before and after values in the audit trail.
 *
 * Features: F8 corrections with audit trail (spec §4 "Access and audit history").
 */

import { useState, type FormEvent } from 'react';
import { formatCount, monthLabel, type ApiClient, type DealershipReturn } from '@debonaire/shared';
import { toApiError } from '@/lib/api';
import { validateCorrectionForm, type CorrectionFormValues, type FieldErrors } from '@/lib/validation';
import { Field } from './Field';
import { Modal } from './Modal';

interface CorrectionDialogProps {
  client: ApiClient;
  target: DealershipReturn;
  onClose: () => void;
  onCorrected: (updated: DealershipReturn) => void;
}

export function CorrectionDialog({ client, target, onClose, onCorrected }: CorrectionDialogProps) {
  const [values, setValues] = useState<CorrectionFormValues>({
    enquiries: String(target.enquiries),
    sales: String(target.sales),
    reason: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (field: keyof CorrectionFormValues) => (value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors(({ [field]: _removed, ...rest }) => rest);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }

    const clientErrors = validateCorrectionForm(values, target);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const updated = await client.correctReturn(target.id, {
        enquiries: Number(values.enquiries),
        sales: Number(values.sales),
        reason: values.reason.trim(),
      });
      onCorrected(updated);
    } catch (thrown) {
      const error = toApiError(thrown);
      setErrors(error.fields);
      setFormError(error.isNetworkError ? 'We couldn’t reach the server. Please try again.' : error.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={`Correct return: ${target.dealershipName}, ${monthLabel(target.month)}`} onClose={onClose}>
      <p className="card-intro">
        Currently {formatCount(target.enquiries)} enquiries and {formatCount(target.sales)} sales. The change and your
        reason are kept in the return’s history.
      </p>

      {formError && (
        <div className="alert alert-error" role="alert">
          <p>{formError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate aria-busy={saving}>
        <div className="form-grid">
          <Field id="correct-enquiries" label="Enquiries" error={errors.enquiries}>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={values.enquiries}
              onChange={(e) => set('enquiries')(e.target.value)}
            />
          </Field>
          <Field id="correct-sales" label="Completed sales" error={errors.sales}>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={values.sales}
              onChange={(e) => set('sales')(e.target.value)}
            />
          </Field>
        </div>
        <div style={{ marginTop: 16 }}>
          <Field id="correct-reason" label="Reason for correction" error={errors.reason} hint="Saved in the audit history">
            <textarea
              className="textarea"
              maxLength={500}
              value={values.reason}
              onChange={(e) => set('reason')(e.target.value)}
            />
          </Field>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save correction'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

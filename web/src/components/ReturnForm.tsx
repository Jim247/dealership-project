'use client';

/**
 * "Submit a return" form. It posts to the PHP API and shows success,
 * validation or duplicate feedback.
 *
 * Duplicate protection on the client (spec §4):
 *  - The submit button is disabled and an in-flight guard ignores double clicks.
 *  - Each submission attempt carries an Idempotency-Key. If the response is
 *    lost and the user presses Submit again with the same data, the same key
 *    is sent and the API replays the original success, so no duplicate is
 *    created and the user is not shown a false error. Editing the data starts
 *    a new attempt with a new key.
 *
 * Features: F10 entry form, F7 idempotency, F9 dealer locked to own dealership.
 */

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  currentMonth,
  formatCount,
  formatRate,
  monthLabel,
  type ApiClient,
  type ApiError,
  type Dealership,
  type DealershipReturn,
  type Identity,
  type NewReturn,
} from '@debonaire/shared';
import { newIdempotencyKey, toApiError } from '@/lib/api';
import { validateReturnForm, type FieldErrors, type ReturnFormValues } from '@/lib/validation';
import { Field } from './Field';

interface ReturnFormProps {
  client: ApiClient;
  identity: Identity;
  dealerships: Dealership[];
  onSubmitted: (saved: DealershipReturn) => void;
  /** Injected in tests to freeze "the current month". */
  now?: () => Date;
}

type Feedback = { kind: 'success' | 'error'; title: string; details: string[] } | null;

const FORM_FIELDS = ['dealershipId', 'month', 'enquiries', 'sales'];

export function ReturnForm({ client, identity, dealerships, onSubmitted, now = () => new Date() }: ReturnFormProps) {
  const ownDealership = identity.role === 'dealer' ? identity.dealershipId : null;

  const [values, setValues] = useState<ReturnFormValues>({
    dealershipId: ownDealership ?? '',
    month: '',
    enquiries: '',
    sales: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [submitting, setSubmitting] = useState(false);

  /** The current submission attempt: its idempotency key and the exact payload it was for. */
  const attempt = useRef<{ key: string; payload: string } | null>(null);
  /** Guards against a second click landing before React re-renders the disabled button. */
  const inFlight = useRef(false);

  const latestMonth = currentMonth(now());

  const update = (field: keyof ReturnFormValues) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = event.target.value;
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors(({ [field]: _removed, ...rest }) => rest);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) {
      return;
    }

    const clientErrors = validateReturnForm(values, latestMonth);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setFeedback({ kind: 'error', title: 'Please fix the highlighted fields.', details: [] });
      return;
    }

    const payload: NewReturn = {
      dealershipId: values.dealershipId,
      month: values.month,
      enquiries: Number(values.enquiries),
      sales: Number(values.sales),
    };

    // Same data as the last unconfirmed attempt? Reuse its key, so a retry is safe.
    const payloadSignature = JSON.stringify(payload);
    if (attempt.current?.payload !== payloadSignature) {
      attempt.current = { key: newIdempotencyKey(), payload: payloadSignature };
    }

    inFlight.current = true;
    setSubmitting(true);
    setErrors({});
    setFeedback(null);

    try {
      const { data, replayed } = await client.submitReturn(payload, attempt.current.key);
      attempt.current = null;

      setValues((previous) => ({ ...previous, month: '', enquiries: '', sales: '' }));
      setFeedback({
        kind: 'success',
        title: `Return saved for ${data.dealershipName}, ${monthLabel(data.month)}.`,
        details: [
          `${formatCount(data.enquiries)} enquiries, ${formatCount(data.sales)} sales, conversion rate ${formatRate(data.conversionRate)}.`,
          ...(replayed
            ? ['Your earlier attempt had already been saved, so this retry did not create a duplicate.']
            : []),
        ],
      });
      onSubmitted(data);
    } catch (thrown) {
      const error = toApiError(thrown);
      setErrors(pickFormFields(error.fields));
      setFeedback(describeError(error, identity));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="card" aria-labelledby="submit-heading">
      <h2 id="submit-heading">Submit a return</h2>
      <p className="card-intro">
        Enter one month&apos;s enquiries and completed sales.
      </p>

      {feedback && (
        <div
          className={`alert ${feedback.kind === 'success' ? 'alert-success' : 'alert-error'}`}
          role={feedback.kind === 'success' ? 'status' : 'alert'}
        >
          <strong>{feedback.title}</strong>
          {feedback.details.map((detail) => (
            <p key={detail}>{detail}</p>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <div className="form-grid">
          <Field
            id="return-dealership"
            label="Dealership"
            error={errors.dealershipId}
            hint={ownDealership ? 'You can only submit for your own dealership.' : undefined}
          >
            <select
              className="select"
              value={values.dealershipId}
              onChange={update('dealershipId')}
              disabled={ownDealership !== null}
            >
              {ownDealership === null && <option value="">Choose a dealership</option>}
              {dealerships.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>

          <Field id="return-month" label="Reporting month" error={errors.month} hint={`YYYY-MM, up to ${latestMonth}`}>
            <input
              className="input"
              type="month"
              max={latestMonth}
              placeholder="YYYY-MM"
              value={values.month}
              onChange={update('month')}
            />
          </Field>

          <Field id="return-enquiries" label="Enquiries" error={errors.enquiries}>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={values.enquiries}
              onChange={update('enquiries')}
            />
          </Field>

          <Field id="return-sales" label="Completed sales" error={errors.sales} hint="Cannot exceed enquiries">
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={values.sales}
              onChange={update('sales')}
            />
          </Field>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit return'}
          </button>
        </div>
      </form>
    </section>
  );
}

/** Keeps only the errors that belong to a visible field. The rest are shown in the alert. */
function pickFormFields(fields: FieldErrors): FieldErrors {
  return Object.fromEntries(Object.entries(fields).filter(([field]) => FORM_FIELDS.includes(field)));
}

function describeError(error: ApiError, identity: Identity): Feedback {
  const otherFieldMessages = Object.entries(error.fields)
    .filter(([field]) => !FORM_FIELDS.includes(field))
    .map(([, message]) => message);

  if (error.isNetworkError) {
    return {
      kind: 'error',
      title: 'We couldn’t reach the server.',
      details: [
        'Your return may or may not have been saved. Press “Submit return” again to retry. It is safe: a retry cannot create a duplicate.',
      ],
    };
  }

  switch (error.status) {
    case 409:
      return {
        kind: 'error',
        title: 'This return has already been submitted.',
        details: [
          error.message,
          identity.role === 'manager'
            ? 'Use “Correct” on that row in the returns table below.'
            : 'Only managers can correct a return. Please contact your manager if the figures are wrong.',
        ],
      };
    case 422:
      return { kind: 'error', title: 'Please fix the highlighted fields.', details: otherFieldMessages };
    case 403:
      return { kind: 'error', title: 'You can’t submit this return.', details: [error.message] };
    default:
      return { kind: 'error', title: 'Something went wrong. Your return was not saved.', details: [error.message] };
  }
}

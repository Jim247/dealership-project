/**
 * Client-side checks that mirror the API's rules.
 *
 * These exist only to give instant feedback. The PHP API repeats every check
 * and is the authority (spec §4 "Client manipulation"). The messages
 * deliberately match the server's, so the user sees the same wording whichever
 * side catches a problem.
 *
 * Features: F10 form feedback, F8 correction form.
 */

import { isValidMonth } from '@debonaire/shared';

export const MAX_COUNT = 1_000_000;

export type FieldErrors = Record<string, string>;

export interface ReturnFormValues {
  dealershipId: string;
  month: string;
  enquiries: string;
  sales: string;
}

export interface CorrectionFormValues {
  enquiries: string;
  sales: string;
  reason: string;
}

/** Parses a whole-number count typed into a field, or explains what is wrong with it. */
export function parseCount(raw: string, label: string): { value: number } | { error: string } {
  const text = raw.trim();
  if (text === '') {
    return { error: `${label} is required.` };
  }
  if (text.startsWith('-')) {
    return { error: `${label} cannot be negative.` };
  }
  if (!/^\d+$/.test(text)) {
    return { error: `${label} must be a whole number.` };
  }
  const value = Number(text);
  if (value > MAX_COUNT) {
    return { error: `${label} cannot be more than 1,000,000.` };
  }
  return { value };
}

function checkCounts(enquiriesRaw: string, salesRaw: string, errors: FieldErrors): { enquiries?: number; sales?: number } {
  const enquiries = parseCount(enquiriesRaw, 'Enquiries');
  const sales = parseCount(salesRaw, 'Sales');

  if ('error' in enquiries) errors.enquiries = enquiries.error;
  if ('error' in sales) errors.sales = sales.error;

  if ('value' in enquiries && 'value' in sales && sales.value > enquiries.value) {
    errors.sales = `Sales (${sales.value}) cannot be more than enquiries (${enquiries.value}), because sales are conversions of those enquiries.`;
  }

  return {
    enquiries: 'value' in enquiries ? enquiries.value : undefined,
    sales: 'value' in sales ? sales.value : undefined,
  };
}

export function validateReturnForm(values: ReturnFormValues, latestMonth: string): FieldErrors {
  const errors: FieldErrors = {};

  if (values.dealershipId === '') {
    errors.dealershipId = 'Dealership is required.';
  }

  if (values.month === '') {
    errors.month = 'Month is required.';
  } else if (!isValidMonth(values.month)) {
    errors.month = 'Month must be in YYYY-MM format, e.g. 2026-03.';
  } else if (values.month > latestMonth) {
    errors.month = `Month cannot be in the future. The latest month you can report is ${latestMonth}.`;
  }

  checkCounts(values.enquiries, values.sales, errors);
  return errors;
}

export function validateCorrectionForm(
  values: CorrectionFormValues,
  current: { enquiries: number; sales: number },
): FieldErrors {
  const errors: FieldErrors = {};
  const { enquiries, sales } = checkCounts(values.enquiries, values.sales, errors);

  if (values.reason.trim() === '') {
    errors.reason = 'A reason is required for every correction.';
  } else if (values.reason.trim().length > 500) {
    errors.reason = 'Reason must be 500 characters or fewer.';
  }

  if (Object.keys(errors).length === 0 && enquiries === current.enquiries && sales === current.sales) {
    errors.enquiries = 'These figures match the current return, so there is nothing to correct.';
  }

  return errors;
}

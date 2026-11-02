/**
 * Covers F8 the manager correction dialog and the audit history view.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@debonaire/shared';
import { CorrectionDialog } from '@/components/CorrectionDialog';
import { HistoryDialog } from '@/components/HistoryDialog';
import { aReturn, mockClient } from './helpers';

const TARGET = aReturn({ id: 42, dealershipName: 'Harbour Cars', month: '2026-06', enquiries: 14, sales: 3 });

function renderDialog() {
  const client = mockClient();
  const onCorrected = vi.fn();
  const onClose = vi.fn();
  render(<CorrectionDialog client={client} target={TARGET} onClose={onClose} onCorrected={onCorrected} />);
  return { client, onCorrected, onClose, user: userEvent.setup() };
}

describe('CorrectionDialog', () => {
  it('opens as a labelled dialog pre-filled with the current figures', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Correct return: Harbour Cars, June 2026' })).toBeInTheDocument();
    expect(screen.getByLabelText('Enquiries')).toHaveValue(14);
    expect(screen.getByLabelText('Enquiries')).toHaveFocus();
  });

  it('sends the corrected counts with a trimmed reason', async () => {
    const { client, onCorrected, user } = renderDialog();
    const updated = { ...TARGET, enquiries: 16, sales: 4 };
    client.correctReturn.mockResolvedValue(updated);

    await user.clear(screen.getByLabelText('Enquiries'));
    await user.type(screen.getByLabelText('Enquiries'), '16');
    await user.clear(screen.getByLabelText('Completed sales'));
    await user.type(screen.getByLabelText('Completed sales'), '4');
    await user.type(screen.getByLabelText('Reason for correction'), '  Two web enquiries were missed ');
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    expect(client.correctReturn).toHaveBeenCalledWith(42, { enquiries: 16, sales: 4, reason: 'Two web enquiries were missed' });
    expect(onCorrected).toHaveBeenCalledWith(updated);
  });

  it('requires a reason and a real change before calling the API', async () => {
    const { client, user } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    expect(client.correctReturn).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Reason for correction')).toHaveAccessibleDescription(
      expect.stringContaining('A reason is required'),
    );

    await user.type(screen.getByLabelText('Reason for correction'), 'No real change');
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    expect(client.correctReturn).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Enquiries')).toHaveAccessibleDescription(expect.stringContaining('nothing to correct'));
  });

  it('shows errors returned by the API', async () => {
    const { client, onCorrected, user } = renderDialog();
    client.correctReturn.mockRejectedValue(new ApiError(403, 'forbidden', 'Only managers can correct a return.'));

    await user.clear(screen.getByLabelText('Enquiries'));
    await user.type(screen.getByLabelText('Enquiries'), '20');
    await user.type(screen.getByLabelText('Reason for correction'), 'Fix');
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Only managers can correct a return.');
    expect(onCorrected).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const { onClose, user } = renderDialog();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});

describe('HistoryDialog', () => {
  it('lists the submission and each correction with its reason', async () => {
    const client = mockClient();
    client.getAudit.mockResolvedValue([
      { id: 1, action: 'created', actorRole: 'seed', actorDealershipId: null, before: null, after: { enquiries: 14, sales: 3 }, reason: null, createdAt: '2026-07-03T09:30:00Z' },
      { id: 2, action: 'corrected', actorRole: 'manager', actorDealershipId: null, before: { enquiries: 14, sales: 3 }, after: { enquiries: 16, sales: 4 }, reason: 'Two web enquiries were missed', createdAt: '2026-11-15T12:00:00Z' },
    ]);

    render(<HistoryDialog client={client} target={TARGET} onClose={vi.fn()} />);

    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Submitted by sample data');
    expect(items[0]).toHaveTextContent('14 enquiries, 3 sales');
    expect(items[1]).toHaveTextContent('Corrected by a manager');
    expect(items[1]).toHaveTextContent('Enquiries 14 → 16, sales 3 → 4');
    expect(items[1]).toHaveTextContent('Reason: Two web enquiries were missed');
    expect(client.getAudit).toHaveBeenCalledWith(42, expect.any(AbortSignal));
  });
});

/**
 * Covers F10 the entry form: success, validation and duplicate feedback,
 * the pending state, safe retries (F7) and the dealer lock (F9).
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type Identity } from '@debonaire/shared';
import { ReturnForm } from '@/components/ReturnForm';
import { aReturn, DEALERSHIPS, deferred, mockClient } from './helpers';

const NOW = () => new Date('2026-11-15T12:00:00Z');

function renderForm(identity: Identity = { role: 'manager' }) {
  const client = mockClient();
  const onSubmitted = vi.fn();
  render(<ReturnForm client={client} identity={identity} dealerships={DEALERSHIPS} onSubmitted={onSubmitted} now={NOW} />);
  return { client, onSubmitted, user: userEvent.setup() };
}

async function fillValidReturn(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Dealership'), 'RVA');
  // jsdom sanitises month inputs keystroke by keystroke, so set the whole value at once.
  fireEvent.change(screen.getByLabelText('Reporting month'), { target: { value: '2026-10' } });
  await user.type(screen.getByLabelText('Enquiries'), '131');
  await user.type(screen.getByLabelText('Completed sales'), '27');
}

describe('ReturnForm', () => {
  it('submits to the API and shows a success message', async () => {
    const { client, onSubmitted, user } = renderForm();
    const saved = aReturn({ dealershipId: 'RVA', dealershipName: 'Riverside Autos', enquiries: 131, sales: 27, conversionRate: 20.61 });
    client.submitReturn.mockResolvedValue({ data: saved, replayed: false });

    await fillValidReturn(user);
    await user.click(screen.getByRole('button', { name: 'Submit return' }));

    expect(client.submitReturn).toHaveBeenCalledWith(
      { dealershipId: 'RVA', month: '2026-10', enquiries: 131, sales: 27 },
      expect.any(String),
    );
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Return saved for Riverside Autos, October 2026.');
    expect(status).toHaveTextContent('131 enquiries, 27 sales, conversion rate 20.61%.');
    expect(onSubmitted).toHaveBeenCalledWith(saved);
    expect(screen.getByLabelText('Enquiries')).toHaveValue(null);
  });

  it('shows server validation messages next to the right fields', async () => {
    const { client, onSubmitted, user } = renderForm();
    client.submitReturn.mockRejectedValue(
      new ApiError(422, 'validation_failed', 'Fix the fields.', {
        sales: 'Sales (27) cannot be more than enquiries (20), because sales are conversions of those enquiries.',
      }),
    );

    await fillValidReturn(user);
    await user.click(screen.getByRole('button', { name: 'Submit return' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Please fix the highlighted fields.');
    const sales = screen.getByLabelText('Completed sales');
    expect(sales).toHaveAttribute('aria-invalid', 'true');
    expect(sales).toHaveAccessibleDescription(expect.stringContaining('cannot be more than enquiries'));
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('shows the useful duplicate message and how to fix it', async () => {
    const { client, user } = renderForm();
    client.submitReturn.mockRejectedValue(
      new ApiError(409, 'duplicate_return', 'Riverside Autos already has a return for October 2026 (submitted 3 Nov 2026).'),
    );

    await fillValidReturn(user);
    await user.click(screen.getByRole('button', { name: 'Submit return' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This return has already been submitted.');
    expect(alert).toHaveTextContent('Riverside Autos already has a return for October 2026');
    expect(alert).toHaveTextContent('Use “Correct” on that row');
  });

  it('catches obvious mistakes before calling the API', async () => {
    const { client, user } = renderForm();

    await user.selectOptions(screen.getByLabelText('Dealership'), 'RVA');
    fireEvent.change(screen.getByLabelText('Reporting month'), { target: { value: '2026-12' } });
    await user.type(screen.getByLabelText('Enquiries'), '5');
    await user.type(screen.getByLabelText('Completed sales'), '9');
    await user.click(screen.getByRole('button', { name: 'Submit return' }));

    expect(client.submitReturn).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Reporting month')).toHaveAccessibleDescription(expect.stringContaining('cannot be in the future'));
    expect(screen.getByLabelText('Completed sales')).toHaveAccessibleDescription(expect.stringContaining('cannot be more than enquiries'));
  });

  it('lists every missing field at once', async () => {
    const { client, user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Submit return' }));

    expect(client.submitReturn).not.toHaveBeenCalled();
    for (const label of ['Dealership', 'Reporting month', 'Enquiries', 'Completed sales']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
    }
  });

  it('disables the button while submitting so a double click sends one request', async () => {
    const { client, user } = renderForm();
    const pending = deferred<{ data: ReturnType<typeof aReturn>; replayed: boolean }>();
    client.submitReturn.mockReturnValue(pending.promise);

    await fillValidReturn(user);
    await user.dblClick(screen.getByRole('button', { name: 'Submit return' }));

    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled();
    expect(client.submitReturn).toHaveBeenCalledTimes(1);

    pending.resolve({ data: aReturn(), replayed: false });
    expect(await screen.findByRole('button', { name: 'Submit return' })).toBeEnabled();
  });

  it('retries a lost submission with the same idempotency key, and a changed one with a new key', async () => {
    const { client, user } = renderForm();
    client.submitReturn.mockRejectedValueOnce(new ApiError(0, 'network_error', 'Could not reach the API.'));

    await fillValidReturn(user);
    await user.click(screen.getByRole('button', { name: 'Submit return' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('a retry cannot create a duplicate');

    client.submitReturn.mockResolvedValueOnce({ data: aReturn(), replayed: true });
    await user.click(screen.getByRole('button', { name: 'Submit return' }));

    const [firstKey, retryKey] = client.submitReturn.mock.calls.map((call) => call[1]);
    expect(retryKey).toBe(firstKey);
    expect(await screen.findByRole('status')).toHaveTextContent('did not create a duplicate');

    // A fresh submission of different data gets a fresh key.
    client.submitReturn.mockResolvedValueOnce({ data: aReturn(), replayed: false });
    fireEvent.change(screen.getByLabelText('Reporting month'), { target: { value: '2026-09' } });
    await user.type(screen.getByLabelText('Enquiries'), '10');
    await user.type(screen.getByLabelText('Completed sales'), '1');
    await user.click(screen.getByRole('button', { name: 'Submit return' }));

    expect(client.submitReturn.mock.calls[2]![1]).not.toBe(firstKey);
  });

  it('locks a dealer to their own dealership', () => {
    renderForm({ role: 'dealer', dealershipId: 'NGM' });

    const select = screen.getByLabelText('Dealership');
    expect(select).toBeDisabled();
    expect(select).toHaveValue('NGM');
    expect(within(select).queryByText('Choose a dealership')).not.toBeInTheDocument();
  });

  it('tells a dealer that only managers can correct a duplicate', async () => {
    const { client, user } = renderForm({ role: 'dealer', dealershipId: 'NGM' });
    client.submitReturn.mockRejectedValue(new ApiError(409, 'duplicate_return', 'Northgate Motors already has a return.'));

    fireEvent.change(screen.getByLabelText('Reporting month'), { target: { value: '2026-10' } });
    await user.type(screen.getByLabelText('Enquiries'), '10');
    await user.type(screen.getByLabelText('Completed sales'), '1');
    await user.click(screen.getByRole('button', { name: 'Submit return' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Only managers can correct a return');
  });
});

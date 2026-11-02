/**
 * Covers F11 the review panel: table and server totals, loading, empty and
 * failed states, refresh after submission, filters, and the F8 / F9
 * role-specific behaviour.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type Identity, type ReturnsReport } from '@debonaire/shared';
import { ReturnsPanel } from '@/components/ReturnsPanel';
import { aReport, aReturn, DEALERSHIPS, deferred, mockClient } from './helpers';

const JULY = aReport(
  [
    aReturn({ id: 2, dealershipId: 'HBC', dealershipName: 'Harbour Cars', month: '2026-07', enquiries: 0, sales: 0, conversionRate: null }),
    aReturn({ id: 3, month: '2026-07', enquiries: 389, sales: 88, conversionRate: 22.62 }),
    aReturn({ id: 4, dealershipId: 'RVA', dealershipName: 'Riverside Autos', month: '2026-07', enquiries: 1140, sales: 29, conversionRate: 2.54 }),
  ],
  { returnCount: 3, totalEnquiries: 1529, totalSales: 117, conversionRate: 7.65 },
);

const EMPTY = aReport([], { returnCount: 0, totalEnquiries: 0, totalSales: 0, conversionRate: null }, { from: '2026-08', to: '2026-08' });

function tile(label: string): string {
  return within(screen.getByRole('region', { name: 'Totals' })).getByText(label).nextElementSibling!.textContent!;
}

describe('ReturnsPanel', () => {
  it('shows a loading state until the first response arrives', async () => {
    const pending = deferred<ReturnsReport>();
    const client = mockClient();
    client.listReturns.mockReturnValue(pending.promise);
    render(<ReturnsPanel client={client} identity={{ role: 'manager' }} dealerships={DEALERSHIPS} refreshKey={0} onChanged={vi.fn()} />);

    expect(screen.getByText('Loading returns…')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await act(async () => pending.resolve(JULY));

    expect(screen.queryByText('Loading returns…')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders the rows and the server totals, formatted', async () => {
    const client = mockClient();
    client.listReturns.mockResolvedValue(JULY);
    render(<ReturnsPanel client={client} identity={{ role: 'manager' }} dealerships={DEALERSHIPS} refreshKey={0} onChanged={vi.fn()} />);

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(tile('Returns')).toBe('3');
    expect(tile('Total enquiries')).toBe('1,529');
    expect(tile('Total sales')).toBe('117');
    expect(tile('Conversion rate')).toBe('7.65%');

    const harbour = screen.getByRole('row', { name: /Harbour Cars/ });
    expect(harbour).toHaveTextContent('N/A');
    expect(screen.getByRole('row', { name: /Riverside Autos/ })).toHaveTextContent('1,140');
  });

  it('shows an empty state, with zero totals and N/A, for a period with no returns', async () => {
    const client = mockClient();
    client.listReturns.mockResolvedValue(EMPTY);
    render(<ReturnsPanel client={client} identity={{ role: 'manager' }} dealerships={DEALERSHIPS} refreshKey={0} onChanged={vi.fn()} />);

    expect(await screen.findByText('No returns for this period.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(tile('Total enquiries')).toBe('0');
    expect(tile('Conversion rate')).toBe('N/A');
    expect(screen.getByText(/Totals for 2026-08/)).toBeInTheDocument();
  });

  it('shows a clear error with a working retry when the request fails', async () => {
    const client = mockClient();
    client.listReturns
      .mockRejectedValueOnce(new ApiError(0, 'network_error', 'Could not reach the Debonaire API.'))
      .mockResolvedValueOnce(JULY);
    render(<ReturnsPanel client={client} identity={{ role: 'manager' }} dealerships={DEALERSHIPS} refreshKey={0} onChanged={vi.fn()} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We couldn’t load the returns.');
    expect(screen.queryByRole('region', { name: 'Totals' })).not.toBeInTheDocument();

    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(client.listReturns).toHaveBeenCalledTimes(2);
  });

  it('reloads when the dashboard signals a new submission', async () => {
    const client = mockClient();
    client.listReturns.mockResolvedValue(JULY);
    const props = { client, identity: { role: 'manager' } as Identity, dealerships: DEALERSHIPS, onChanged: vi.fn() };
    const view = render(<ReturnsPanel {...props} refreshKey={0} />);
    await screen.findByRole('table');

    view.rerender(<ReturnsPanel {...props} refreshKey={1} />);

    await vi.waitFor(() => expect(client.listReturns).toHaveBeenCalledTimes(2));
  });

  it('keeps showing the previous figures, marked as updating, while reloading', async () => {
    const client = mockClient();
    const reload = deferred<ReturnsReport>();
    client.listReturns.mockResolvedValueOnce(JULY).mockReturnValueOnce(reload.promise);
    const props = { client, identity: { role: 'manager' } as Identity, dealerships: DEALERSHIPS, onChanged: vi.fn() };
    const view = render(<ReturnsPanel {...props} refreshKey={0} />);
    await screen.findByRole('table');

    view.rerender(<ReturnsPanel {...props} refreshKey={1} />);

    expect(await screen.findByText('Updating…')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    await act(async () => reload.resolve(JULY));
    expect(screen.queryByText('Updating…')).not.toBeInTheDocument();
  });

  it('sends the chosen period and dealership to the API', async () => {
    const client = mockClient();
    client.listReturns.mockResolvedValue(JULY);
    render(<ReturnsPanel client={client} identity={{ role: 'manager' }} dealerships={DEALERSHIPS} refreshKey={0} onChanged={vi.fn()} />);
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-06' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09' } });
    await userEvent.setup().selectOptions(screen.getByLabelText('Dealership'), 'NGM');

    await vi.waitFor(() =>
      expect(client.listReturns).toHaveBeenLastCalledWith({ from: '2026-06', to: '2026-09', dealershipId: 'NGM' }, expect.any(AbortSignal)),
    );
  });

  it('shows an invalid filter next to the inputs instead of as an outage', async () => {
    const client = mockClient();
    client.listReturns.mockRejectedValue(
      new ApiError(422, 'validation_failed', 'The report filter is not valid.', { to: 'The end month cannot be before the start month.' }),
    );
    render(<ReturnsPanel client={client} identity={{ role: 'manager' }} dealerships={DEALERSHIPS} refreshKey={0} onChanged={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Please check the filter.');
    expect(screen.getByLabelText('To')).toHaveAccessibleDescription('The end month cannot be before the start month.');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('gives managers Correct and History actions', async () => {
    const client = mockClient();
    client.listReturns.mockResolvedValue(JULY);
    render(<ReturnsPanel client={client} identity={{ role: 'manager' }} dealerships={DEALERSHIPS} refreshKey={0} onChanged={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Correct Northgate Motors, July 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'History for Northgate Motors, July 2026' })).toBeInTheDocument();
  });

  it('shows a dealer only their own scope, with no dealership filter or manager actions', async () => {
    const client = mockClient();
    client.listReturns.mockResolvedValue(aReport([aReturn()], { returnCount: 1, totalEnquiries: 431, totalSales: 104, conversionRate: 24.13 }, { dealershipId: 'NGM' }));
    render(
      <ReturnsPanel client={client} identity={{ role: 'dealer', dealershipId: 'NGM' }} dealerships={DEALERSHIPS} refreshKey={0} onChanged={vi.fn()} />,
    );

    await screen.findByRole('table');
    expect(screen.getByText('Showing returns for Northgate Motors.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Dealership')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Correct/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Totals for All months · Northgate Motors/)).toBeInTheDocument();
  });
});

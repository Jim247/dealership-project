/**
 * Covers F15 on the page: the share link, the saved code, the "Enter access
 * code" screen, and coming back to it when the API refuses the code. Also
 * checks that a local run without demo mode never asks for a code.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@debonaire/shared';
import { AccessCodeGate, type CodeCheck } from '@/components/AccessCodeGate';
import { AccessCodeProvider, useAccessCode } from '@/lib/access';

const STORAGE_KEY = 'debonaire.accessCode';

/** Stands in for the dashboard: shows the code it would send, and can play the API refusing it. */
function Probe() {
  const { clientOptions } = useAccessCode();
  return (
    <div>
      <p>Dashboard using code: {clientOptions.accessCode ?? 'none'}</p>
      <button
        type="button"
        onClick={() => clientOptions.onAccessCodeRejected(new ApiError(401, 'invalid_access_code', 'Not valid.'))}
      >
        API refuses the code
      </button>
      <button
        type="button"
        onClick={() => clientOptions.onAccessCodeRejected(new ApiError(401, 'access_code_required', 'Needed.'))}
      >
        API asks for a code
      </button>
    </div>
  );
}

function renderPage({ demoMode = true, check = vi.fn<(code: string) => Promise<CodeCheck>>() } = {}) {
  render(
    <AccessCodeProvider demoMode={demoMode}>
      <AccessCodeGate check={check}>
        <Probe />
      </AccessCodeGate>
    </AccessCodeProvider>,
  );
  return { check, user: userEvent.setup() };
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  window.localStorage.clear();
});

describe('access code on the page (F15)', () => {
  it('asks for the code straight away in demo mode when none is saved', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Enter your access code' })).toBeInTheDocument();
    expect(screen.queryByText(/Dashboard using code/)).not.toBeInTheDocument();
  });

  it('never asks on a local run without demo mode', () => {
    renderPage({ demoMode: false });

    expect(screen.getByText('Dashboard using code: none')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Enter your access code' })).not.toBeInTheDocument();
  });

  it('uses a code saved in this browser', () => {
    window.localStorage.setItem(STORAGE_KEY, 'saved-code');

    renderPage();

    expect(screen.getByText('Dashboard using code: saved-code')).toBeInTheDocument();
  });

  it('takes the code from a share link, saves it and removes it from the address bar', () => {
    window.history.replaceState(null, '', '/?code=from-link&tab=2#returns');

    renderPage();

    expect(screen.getByText('Dashboard using code: from-link')).toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('from-link');
    expect(window.location.search).toBe('?tab=2');
    expect(window.location.hash).toBe('#returns');
  });

  it('a share link replaces an older saved code', () => {
    window.localStorage.setItem(STORAGE_KEY, 'old-code');
    window.history.replaceState(null, '', '/?code=new-code');

    renderPage();

    expect(screen.getByText('Dashboard using code: new-code')).toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('new-code');
  });

  it('accepts a typed code once the API confirms it', async () => {
    const check = vi.fn<(code: string) => Promise<CodeCheck>>().mockResolvedValue('ok');
    const { user } = renderPage({ check });

    await user.type(screen.getByLabelText('Access code'), '  typed-code  ');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(check).toHaveBeenCalledWith('typed-code');
    expect(await screen.findByText('Dashboard using code: typed-code')).toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('typed-code');
  });

  it('says so when a typed code is wrong, and stays on the screen', async () => {
    const check = vi.fn<(code: string) => Promise<CodeCheck>>().mockResolvedValue('invalid');
    const { user } = renderPage({ check });

    await user.type(screen.getByLabelText('Access code'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("That access code isn't valid.");
    expect(screen.queryByText(/Dashboard using code/)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('explains a slow wake-up while checking, and an unreachable API', async () => {
    let finish: (result: CodeCheck) => void = () => {};
    const check = vi.fn<(code: string) => Promise<CodeCheck>>(() => new Promise((resolve) => (finish = resolve)));
    const { user } = renderPage({ check });

    await user.type(screen.getByLabelText('Access code'), 'any');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('up to a minute');

    await act(async () => finish('unreachable'));

    expect(screen.getByRole('alert')).toHaveTextContent('The reporting service is not responding.');
  });

  it('asks for the code when the field is left empty, without calling the API', async () => {
    const { check, user } = renderPage();

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Enter the access code.')).toBeInTheDocument();
    expect(check).not.toHaveBeenCalled();
  });

  it('goes back to the screen, and forgets the code, when the API refuses it', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'changed-since');
    const { user } = renderPage();

    await user.click(screen.getByRole('button', { name: 'API refuses the code' }));

    expect(screen.getByRole('alert')).toHaveTextContent("That access code isn't valid.");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('goes back to the screen when a local run turns out to need a code', async () => {
    const { user } = renderPage({ demoMode: false });

    await user.click(screen.getByRole('button', { name: 'API asks for a code' }));

    expect(screen.getByRole('heading', { name: 'Enter your access code' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

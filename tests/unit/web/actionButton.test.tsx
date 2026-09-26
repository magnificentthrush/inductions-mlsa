// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionButton } from '../../../src/components/ActionButton.tsx';
import { ActionProvider } from '../../../src/components/ActionProvider.tsx';
import { ToastProvider } from '../../../src/components/Toasts.tsx';
import { ApiError } from '../../../src/lib/api.ts';

function renderButton(action: () => Promise<unknown>, onSettled = vi.fn(), confirm?: string) {
  render(
    <ToastProvider>
      <ActionProvider onSettled={onSettled}>
        <ActionButton action={action} confirm={confirm}>Send in</ActionButton>
      </ActionProvider>
    </ToastProvider>,
  );
  return { button: screen.getByRole('button', { name: 'Send in' }), onSettled };
}

describe('ActionButton', () => {
  afterEach(() => vi.restoreAllMocks());

  it('runs once on a double click and stays disabled until the action finishes', async () => {
    let finish!: () => void;
    const action = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { button, onSettled } = renderButton(action);

    fireEvent.click(button);
    fireEvent.click(button);
    expect(action).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).toBeDisabled());

    finish();
    await waitFor(() => expect(button).toBeEnabled());
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("shows the server's message when the action fails, then reloads", async () => {
    const { button, onSettled } = renderButton(() => Promise.reject(new ApiError('Panel 2 is busy')));
    await userEvent.click(button);
    expect(await screen.findByText('Panel 2 is busy')).toBeInTheDocument();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('asks first when a confirmation is set, and does nothing if cancelled', async () => {
    const action = vi.fn(async () => {});
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { button } = renderButton(action, vi.fn(), 'Delete Panel 3?');
    await userEvent.click(button);
    expect(window.confirm).toHaveBeenCalledWith('Delete Panel 3?');
    expect(action).not.toHaveBeenCalled();
  });
});

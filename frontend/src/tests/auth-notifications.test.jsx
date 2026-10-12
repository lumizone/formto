// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); });

function Account() {
  const { user, login, loading } = useAuth();
  return <>
    <button disabled={loading} onClick={() => login('test-user', 'test-password')}>Sign in</button>
    <span data-testid="session">{user?.id ?? 'signed-out'}</span>
    <span>{user?.notify_email}</span>
    <span>{user?.smtp_config?.host}</span>
  </>;
}

it('loads saved notification settings immediately after signing in', async () => {
  localStorage.clear();
  axios.post.mockResolvedValue({ data: { token: 'dummy-token', user: { id: 'test-user' } } });
  axios.get.mockResolvedValue({ data: { user: {
    id: 'test-user', notify_email: 'recipient@example.com',
    smtp_config: { host: 'smtp.example.com', pass: '••••••••' },
  } } });
  render(<AuthProvider><Account /></AuthProvider>);
  await waitFor(() => expect(screen.getByRole('button').disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('recipient@example.com')).toBeTruthy();
  expect(screen.getByText('smtp.example.com')).toBeTruthy();
  expect(axios.get).toHaveBeenCalledWith('/api/auth/me', {
    headers: { Authorization: 'Bearer dummy-token' },
  });
});

it.each([
  ['network failure', new Error('Network Error')],
  ['timeout', { code: 'ECONNABORTED' }],
  ['server error', { response: { status: 503 } }],
  ['forbidden response', { response: { status: 403 } }],
  ['missing profile', { response: { status: 404 } }],
])('preserves a successful login after a profile %s', async (_name, error) => {
  axios.post.mockResolvedValue({ data: { token: 'dummy-token', user: { id: 'test-user' } } });
  axios.get.mockRejectedValue(error);
  render(<AuthProvider><Account /></AuthProvider>);
  await waitFor(() => expect(screen.getByRole('button').disabled).toBe(false));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign in' })); });
  expect(axios.get).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('session').textContent).toBe('test-user');
  expect(localStorage.getItem('formto_token')).toBe('dummy-token');
});

it('clears a successful login when the profile explicitly rejects authentication', async () => {
  axios.post.mockResolvedValue({ data: { token: 'dummy-token', user: { id: 'test-user' } } });
  axios.get.mockRejectedValue({ response: { status: 401 } });
  render(<AuthProvider><Account /></AuthProvider>);
  await waitFor(() => expect(screen.getByRole('button').disabled).toBe(false));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign in' })); });
  expect(axios.get).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('session').textContent).toBe('signed-out');
  expect(localStorage.getItem('formto_token')).toBeNull();
});

it.each([
  ['network failure', new Error('Network Error'), 'dummy-token'],
  ['authentication rejection', { response: { status: 401 } }, null],
])('handles a stored session after a profile %s', async (_name, error, expectedToken) => {
  localStorage.setItem('formto_token', 'dummy-token');
  axios.get.mockRejectedValue(error);
  render(<AuthProvider><Account /></AuthProvider>);
  await waitFor(() => expect(screen.getByRole('button').disabled).toBe(false));
  expect(localStorage.getItem('formto_token')).toBe(expectedToken);
});

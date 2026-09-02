/**
 * @format
 */

import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { AuthProvider, useAuth } from '../src/context/AuthContext';

jest.mock('../src/api/auth', () => ({
  login: jest.fn(async (email: string) => ({
    user: { id: 1, name: 'Test User', email, role: 'user' },
    token: 'fake-token',
  })),
  register: jest.fn(),
  socialLogin: jest.fn(async (provider: string) => ({
    user: { id: 2, name: 'Provider User', email: `${provider}@example.com`, role: 'user' },
    token: 'fake-provider-token',
    created: true,
  })),
}));

function Probe() {
  const { user, isLoading, login, loginWithProvider, logout } = useAuth();
  (Probe as any).api = { login, loginWithProvider, logout };
  if (isLoading) {
    return <Text>loading</Text>;
  }
  return <Text>{user ? `logged-in:${user.email}` : 'logged-out'}</Text>;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

it('starts logged out, logs in, then logs out', async () => {
  let root: ReturnType<typeof create>;
  await act(async () => {
    root = create(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
  });
  await flush();

  expect(root!.toJSON()).toEqual(expect.objectContaining({ children: ['logged-out'] }));

  await act(async () => {
    await (Probe as any).api.login('test@example.com', 'password123');
  });

  expect(root!.toJSON()).toEqual(
    expect.objectContaining({ children: ['logged-in:test@example.com'] })
  );

  await act(async () => {
    await (Probe as any).api.logout();
  });

  expect(root!.toJSON()).toEqual(expect.objectContaining({ children: ['logged-out'] }));
});

// Apple/Google sign in through a different call but must land in exactly the
// same session state — the app has no notion of a "provider user" anywhere
// past this point.
it('signs in through a provider and stores that session', async () => {
  let root: ReturnType<typeof create>;
  await act(async () => {
    root = create(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
  });
  await flush();

  await act(async () => {
    await (Probe as any).api.loginWithProvider('apple', 'identity-token', 'Ada Lovelace');
  });

  const socialLogin = require('../src/api/auth').socialLogin;
  expect(socialLogin).toHaveBeenCalledWith('apple', 'identity-token', 'Ada Lovelace');
  expect(root!.toJSON()).toEqual(
    expect.objectContaining({ children: ['logged-in:apple@example.com'] })
  );

  await act(async () => {
    await (Probe as any).api.logout();
  });
  expect(root!.toJSON()).toEqual(expect.objectContaining({ children: ['logged-out'] }));
});

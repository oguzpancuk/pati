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
}));

function Probe() {
  const { user, isLoading, login, logout } = useAuth();
  (Probe as any).api = { login, logout };
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

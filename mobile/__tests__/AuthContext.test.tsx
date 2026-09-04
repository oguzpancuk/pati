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
  register: jest.fn(async (name: string, email: string) => ({
    user: { id: 3, name, email, role: 'user', email_verification_pending: true },
    token: 'fake-pending-token',
    verificationRequired: true,
    codeSent: true,
  })),
  verifyEmail: jest.fn(async (code: string) => {
    if (code !== '123456') {
      throw Object.assign(new Error('Kod hatalı'), { response: { data: { error: 'Kod hatalı' } } });
    }
    return {
      user: {
        id: 3,
        name: 'Yeni Üye',
        email: 'new@example.com',
        role: 'user',
        email_verification_pending: false,
      },
    };
  }),
  resendVerificationCode: jest.fn(async () => ({ codeSent: true, email: 'new@example.com' })),
  socialLogin: jest.fn(async (provider: string) => ({
    user: { id: 2, name: 'Provider User', email: `${provider}@example.com`, role: 'user' },
    token: 'fake-provider-token',
    created: true,
  })),
}));

function Probe() {
  const { user, isLoading, login, register, loginWithProvider, logout, verifyEmail, codeSent } =
    useAuth();
  (Probe as any).api = { login, register, loginWithProvider, logout, verifyEmail };
  if (isLoading) {
    return <Text>loading</Text>;
  }
  if (!user) return <Text>logged-out</Text>;
  // The navigator makes the same distinction: pending means the code
  // screen, not the app.
  if (user.email_verification_pending) return <Text>{`pending:${user.email}:${codeSent}`}</Text>;
  return <Text>{`logged-in:${user.email}`}</Text>;
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
  // The fourth argument is the link password, absent on a plain sign-in.
  expect(socialLogin).toHaveBeenCalledWith('apple', 'identity-token', 'Ada Lovelace', undefined);
  expect(root!.toJSON()).toEqual(
    expect.objectContaining({ children: ['logged-in:apple@example.com'] })
  );

  await act(async () => {
    await (Probe as any).api.logout();
  });
  expect(root!.toJSON()).toEqual(expect.objectContaining({ children: ['logged-out'] }));
});

// Registration by e-mail lands in the pending state (the code screen), and
// the typed code — not a second login — is what turns it into a session.
it('holds an e-mail registration in the pending state until the code is verified', async () => {
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
    await (Probe as any).api.register('Yeni Üye', 'new@example.com', 'parola1234');
  });
  expect(root!.toJSON()).toEqual(
    expect.objectContaining({ children: ['pending:new@example.com:true'] })
  );

  // A wrong code leaves the state exactly where it was.
  await act(async () => {
    await expect((Probe as any).api.verifyEmail('000000')).rejects.toThrow('Kod hatalı');
  });
  expect(root!.toJSON()).toEqual(
    expect.objectContaining({ children: ['pending:new@example.com:true'] })
  );

  await act(async () => {
    await (Probe as any).api.verifyEmail('123456');
  });
  expect(root!.toJSON()).toEqual(
    expect.objectContaining({ children: ['logged-in:new@example.com'] })
  );
});

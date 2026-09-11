import React from 'react';
import { Alert } from 'react-native';
import type { FriendshipStatus } from '../../api/users';
import { Button } from '../ui';

export type FriendshipButtonProps = {
  status: FriendshipStatus;
  busy?: boolean;
  onAdd: () => void;
  onAccept: () => void;
  onRemove: () => void;
};

/**
 * The one control on someone else's profile, in the slot where your own
 * profile carries bell / arkadaşlar / ayarlar (owner, 2026-09-11). Its label
 * follows the friendship state; "Arkadaşsınız" is not a dead end — tapping
 * offers to end the friendship.
 */
export default function FriendshipButton({
  status,
  busy = false,
  onAdd,
  onAccept,
  onRemove,
}: FriendshipButtonProps) {
  if (status === 'self') return null;

  if (status === 'pending_sent') {
    return <Button title="İstek gönderildi" variant="secondary" size="sm" disabled />;
  }
  if (status === 'pending_received') {
    return <Button title="İsteği kabul et" size="sm" loading={busy} onPress={onAccept} />;
  }
  if (status === 'friends') {
    return (
      <Button
        title="Arkadaşsınız"
        variant="secondary"
        size="sm"
        loading={busy}
        onPress={() =>
          Alert.alert('Arkadaşsınız', 'Arkadaşlıktan çıkmak istiyor musun?', [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Arkadaşlıktan çık', style: 'destructive', onPress: onRemove },
          ])
        }
      />
    );
  }
  return <Button title="Arkadaş ekle" size="sm" loading={busy} onPress={onAdd} />;
}

import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { BlockedUser, fetchMyBlocks, unblockUser } from '../../api/users';
import DemoChip from '../DemoChip';
import { Avatar, Button, Text } from '../ui';
import { makeStyles, spacing } from '../../theme';

/**
 * The people you blocked, inside the settings sheet (App Store guideline
 * 1.2; ROADMAP "App Store readiness", R3). A section rather than a sheet of
 * its own: only one sheet is open at a time (owner, 2026-09-11), and the
 * list is short — blocking is rare. It loads itself when the sheet mounts
 * it, so the sheet's other props stay as they are. Web renders the same
 * section (components/profile/BlockedUsersSection).
 */
export default function BlockedUsersSection() {
  const styles = useStyles();
  const [users, setUsers] = useState<BlockedUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyBlocks()
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function confirmUnblock(user: BlockedUser) {
    Alert.alert(
      'Engeli kaldır',
      `${user.name} yeniden arkadaşlık isteği gönderebilir ve yorumları görünür. Arkadaşlık kendiliğinden geri gelmez.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Engeli kaldır',
          onPress: async () => {
            setBusyId(user.id);
            try {
              await unblockUser(user.id);
              setUsers((prev) => (prev ? prev.filter((u) => u.id !== user.id) : prev));
            } catch (err: any) {
              Alert.alert('Kaldırılamadı', err?.response?.data?.error ?? 'Bir hata oluştu');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  }

  return (
    <>
      <Text variant="micro" style={styles.label}>
        engellediklerim
      </Text>
      {failed ? (
        <Text variant="caption">Liste yüklenemedi.</Text>
      ) : users === null ? (
        <Text variant="caption">Yükleniyor…</Text>
      ) : users.length === 0 ? (
        <Text variant="caption">Kimseyi engellemedin.</Text>
      ) : (
        users.map((user) => (
          <View key={user.id} style={styles.row}>
            <Avatar uri={user.avatar_url} name={user.name} size={32} />
            <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
              {user.name}
            </Text>
            <DemoChip visible={user.is_demo === true} />
            <Button
              title="engeli kaldır"
              variant="ghost"
              size="sm"
              loading={busyId === user.id}
              onPress={() => confirmUnblock(user)}
            />
          </View>
        ))
      )}
    </>
  );
}

const useStyles = makeStyles(() => ({
  label: { marginTop: spacing.lg, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  name: { flex: 1 },
}));

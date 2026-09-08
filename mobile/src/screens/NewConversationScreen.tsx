import React, { useEffect, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { fetchMyFriendships, FriendshipEntry } from '../api/users';
import { createGroup, openDirectConversation } from '../api/messages';
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  LoadingState,
  Screen,
  Text,
} from '../components/ui';
import { Icon } from '../components/brand';
import { makeStyles, radius, spacing, useTheme } from '../theme';

type Mode = 'direct' | 'group';

/**
 * Start a conversation. Only friends are offered — the server refuses
 * anyone else — so the screen is the friend list with two moods: tap one
 * for a DM, or name a group and tick several.
 */
export default function NewConversationScreen({ navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [mode, setMode] = useState<Mode>('direct');
  const [friends, setFriends] = useState<FriendshipEntry[] | null>(null);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchMyFriendships()
      .then((data) => setFriends(data.friends))
      .catch(() => setFriends([]));
  }, []);

  function openConversation(id: number, title: string) {
    // Replace, so "back" from the conversation lands on the inbox, not here.
    navigation.replace('Conversation', { conversationId: id, title });
  }

  async function startDirect(friend: FriendshipEntry) {
    setBusy(true);
    try {
      const { id } = await openDirectConversation(friend.id);
      openConversation(id, friend.name);
    } catch (err: any) {
      Alert.alert('Olmadı', err?.response?.data?.error ?? 'Sohbet açılamadı');
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: number) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submitGroup() {
    const trimmed = name.trim();
    if (!trimmed) return Alert.alert('Ad gerekli', 'Gruba bir ad ver.');
    if (picked.length === 0) return Alert.alert('Üye gerekli', 'En az bir arkadaşını ekle.');
    setBusy(true);
    try {
      const { id } = await createGroup(trimmed, picked);
      openConversation(id, trimmed);
    } catch (err: any) {
      Alert.alert('Olmadı', err?.response?.data?.error ?? 'Grup kurulamadı');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <View style={styles.top}>
        <View style={styles.modes}>
          <Chip label="Birebir" selected={mode === 'direct'} onPress={() => setMode('direct')} />
          <Chip label="Grup" selected={mode === 'group'} onPress={() => setMode('group')} />
        </View>
        {mode === 'group' ? (
          <Input
            label="grup adı"
            placeholder="Mahalle kedileri"
            value={name}
            onChangeText={setName}
            maxLength={80}
            autoCorrect={false}
          />
        ) : null}
        <Text variant="micro" style={styles.hint}>
          {mode === 'direct' ? 'bir arkadaşını seç' : 'arkadaşlarını ekle'}
        </Text>
      </View>
      {friends === null ? (
        <LoadingState />
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const selected = mode === 'group' && picked.includes(item.id);
            return (
              <Card
                variant="flat"
                padding="md"
                style={[styles.row, selected && styles.rowSelected]}
                onPress={() => (mode === 'direct' ? !busy && startDirect(item) : toggle(item.id))}
              >
                <Avatar uri={item.avatar_url} name={item.name} size={40} />
                <Text variant="bodyStrong" style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                {mode === 'group' ? (
                  <View style={[styles.tick, selected && styles.tickOn]}>
                    {selected ? <Icon name="check" size={14} color={colors.textOnBrand} /> : null}
                  </View>
                ) : (
                  <Icon name="chevronRight" size={18} color={colors.textSubtle} />
                )}
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              emoji="👋"
              title="Henüz arkadaşın yok"
              description="Mesajlaşmak için önce arkadaş ekle."
              actionTitle="Arkadaş bul"
              onAction={() => navigation.navigate('FindFriends')}
            />
          }
        />
      )}
      {mode === 'group' ? (
        <View style={styles.footer}>
          <Button
            title={picked.length ? `Grubu oluştur (${picked.length})` : 'Grubu oluştur'}
            onPress={submitGroup}
            loading={busy}
            disabled={!name.trim() || picked.length === 0}
            fullWidth
          />
        </View>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  top: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  modes: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  hint: { marginBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  rowSelected: { borderColor: c.brand, backgroundColor: c.brandTint },
  name: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  tick: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: { backgroundColor: c.brand, borderColor: c.brand },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.background,
  },
}));

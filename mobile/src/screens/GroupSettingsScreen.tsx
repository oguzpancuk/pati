import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { fetchMyFriendships, FriendshipEntry } from '../api/users';
import {
  addMember,
  ConversationDetail,
  fetchConversation,
  leaveGroup,
  Member,
  promoteMember,
  removeMember,
  renameGroup,
} from '../api/messages';
import {
  Avatar,
  Button,
  Card,
  Input,
  LoadingState,
  SectionHeader,
  Tag,
  Text,
} from '../components/ui';
import { Icon } from '../components/brand';
import { makeStyles, spacing, useTheme } from '../theme';

/**
 * A group's name and members. Admins rename, add their own friends, promote
 * and remove; everyone can leave. The server is the authority on every
 * rule — this screen only hides what would be refused.
 */
export default function GroupSettingsScreen({ route, navigation }: any) {
  const conversationId: number = route.params.conversationId;
  const styles = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const myId = user?.id;
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [friends, setFriends] = useState<FriendshipEntry[] | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchConversation(conversationId);
      setDetail(d);
      setName(d.name);
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? 'Grup bulunamadı', [
        { text: 'Tamam', onPress: () => navigation.goBack() },
      ]);
    }
  }, [conversationId, navigation]);

  useEffect(() => {
    load();
  }, [load]);

  const isAdmin = detail?.role === 'admin';

  function fail(title: string, err: any) {
    Alert.alert(title, err?.response?.data?.error ?? 'Tekrar dene');
  }

  async function saveName() {
    const trimmed = name.trim();
    if (!detail || !trimmed || trimmed === detail.name) return;
    setSaving(true);
    try {
      await renameGroup(conversationId, trimmed);
      setDetail({ ...detail, name: trimmed });
    } catch (err) {
      fail('Ad değiştirilemedi', err);
    } finally {
      setSaving(false);
    }
  }

  function applyMembers(members: Member[]) {
    setDetail((prev) => (prev ? { ...prev, members } : prev));
  }

  function memberActions(m: Member) {
    if (!isAdmin || m.id === myId || !detail) return;
    const actions: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (m.role !== 'admin') {
      actions.push({
        text: 'Yönetici yap',
        onPress: () =>
          promoteMember(conversationId, m.id).then(applyMembers, (err) => fail('Olmadı', err)),
      });
      actions.push({
        text: 'Gruptan çıkar',
        style: 'destructive',
        onPress: () =>
          removeMember(conversationId, m.id).then(applyMembers, (err) => fail('Olmadı', err)),
      });
    }
    if (actions.length === 0) return;
    actions.push({ text: 'Vazgeç', style: 'cancel' });
    Alert.alert(m.name, m.role === 'admin' ? 'Yönetici' : 'Üye', actions);
  }

  async function openAdd() {
    setAdding(true);
    if (friends === null) {
      try {
        setFriends((await fetchMyFriendships()).friends);
      } catch {
        setFriends([]);
      }
    }
  }

  async function add(friend: FriendshipEntry) {
    try {
      applyMembers(await addMember(conversationId, friend.id));
    } catch (err) {
      fail('Eklenemedi', err);
    }
  }

  function confirmLeave() {
    Alert.alert('Gruptan ayrıl', 'Bu gruptan ayrılmak istediğine emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Ayrıl',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveGroup(conversationId);
            // Leaving invalidates this screen AND the conversation behind
            // it, so the way out is to pop past both — back to wherever the
            // conversation was opened from (DESIGN §8). `navigate('Tabs')`
            // would pop every pushed screen under it instead, dropping a
            // profile or an animal the user was standing on. A deep link
            // straight to this screen has no conversation beneath, so only
            // this one is popped.
            const routes = navigation.getState().routes;
            const beneath = routes[routes.length - 2];
            navigation.pop(beneath?.name === 'Conversation' ? 2 : 1);
          } catch (err) {
            fail('Ayrılamadın', err);
          }
        },
      },
    ]);
  }

  if (!detail) return <LoadingState />;

  const memberIds = new Set(detail.members.map((m) => m.id));
  const candidates = (friends ?? []).filter((f) => !memberIds.has(f.id));

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Input
        label="grup adı"
        value={name}
        onChangeText={setName}
        editable={isAdmin}
        maxLength={80}
        hint={isAdmin ? undefined : 'Adı yalnızca yöneticiler değiştirebilir'}
      />
      {isAdmin && name.trim() && name.trim() !== detail.name ? (
        <Button title="Adı kaydet" size="sm" onPress={saveName} loading={saving} />
      ) : null}

      <SectionHeader
        title={`üyeler · ${detail.members.length}`}
        actionLabel={isAdmin && !adding ? 'arkadaş ekle' : undefined}
        onAction={isAdmin ? openAdd : undefined}
        divider
      />
      {detail.members.map((m) => (
        <Card
          key={m.id}
          variant="flat"
          padding="md"
          style={styles.row}
          onPress={
            isAdmin && m.id !== myId && m.role !== 'admin' ? () => memberActions(m) : undefined
          }
        >
          <Avatar uri={m.avatar_url} name={m.name} size={40} />
          <Text variant="bodyStrong" style={styles.name} numberOfLines={1}>
            {m.name}
            {m.id === myId ? ' (sen)' : ''}
          </Text>
          {m.role === 'admin' ? <Tag label="yönetici" tone="brand" /> : null}
          {isAdmin && m.id !== myId && m.role !== 'admin' ? (
            <Icon name="chevronRight" size={18} color={colors.textSubtle} />
          ) : null}
        </Card>
      ))}

      {adding ? (
        <>
          <SectionHeader
            title="arkadaş ekle"
            actionLabel="kapat"
            onAction={() => setAdding(false)}
            divider
          />
          {friends === null ? (
            <LoadingState />
          ) : candidates.length === 0 ? (
            <Text variant="caption" style={styles.note}>
              Eklenecek arkadaşın kalmadı.
            </Text>
          ) : (
            candidates.map((f) => (
              <Card
                key={f.id}
                variant="flat"
                padding="md"
                style={styles.row}
                onPress={() => add(f)}
              >
                <Avatar uri={f.avatar_url} name={f.name} size={40} />
                <Text variant="bodyStrong" style={styles.name} numberOfLines={1}>
                  {f.name}
                </Text>
                <Icon name="plus" size={18} color={colors.brand} />
              </Card>
            ))
          )}
        </>
      ) : null}

      <View style={styles.leave}>
        <Button title="Gruptan ayrıl" variant="danger" onPress={confirmLeave} fullWidth />
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  flex: { flex: 1, backgroundColor: c.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  name: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  note: { marginBottom: spacing.md },
  leave: { marginTop: spacing.xl },
}));

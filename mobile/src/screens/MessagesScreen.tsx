import React, { useCallback, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ConversationSummary, fetchConversations, POLL_INTERVAL_MS } from '../api/messages';
import { Avatar, Button, Card, EmptyState, LoadingState, Screen, Text } from '../components/ui';
import { Icon } from '../components/brand';
import { makeStyles, radius, spacing, useTheme } from '../theme';

/** "14:05" today, "3 Eyl" otherwise — the inbox needs a glance, not a date. */
export function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function preview(c: ConversationSummary) {
  if (!c.lastMessage) return c.kind === 'group' ? `${c.memberCount} üye` : 'Henüz mesaj yok';
  if (c.lastMessage.deleted) return 'Mesaj silindi';
  const who = c.kind === 'group' && c.lastMessage.senderName ? `${c.lastMessage.senderName}: ` : '';
  return `${who}${c.lastMessage.body ?? ''}`;
}

/** The fourth tab: every conversation by recency with its unread count, polled while in front. */
export default function MessagesScreen({ navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setConversations(await fetchConversations());
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Sohbetler yüklenemedi');
    }
  }, []);

  // Poll only while this tab is in front: the timer starts on focus and
  // stops on blur, so a background tab costs nothing.
  useFocusEffect(
    useCallback(() => {
      load();
      timer.current = setInterval(load, POLL_INTERVAL_MS);
      return () => {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
      };
    }, [load])
  );

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <View style={styles.titleCol}>
          <Text variant="title">Mesajlar</Text>
          <Text variant="caption">Arkadaşlarınla ve gruplarınla</Text>
        </View>
        <Button
          title="Yeni"
          size="sm"
          icon={<Icon name="plus" size={16} color={colors.textOnBrand} />}
          onPress={() => navigation.navigate('NewConversation')}
        />
      </View>
      {conversations === null ? (
        <LoadingState />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const unread = item.unreadCount > 0;
            return (
              <Card
                variant="flat"
                padding="md"
                style={styles.row}
                onPress={() =>
                  navigation.navigate('Conversation', { conversationId: item.id, title: item.name })
                }
              >
                {item.kind === 'group' ? (
                  <View style={styles.groupAvatar}>
                    <Icon name="users" size={20} color={colors.brand} />
                  </View>
                ) : (
                  <Avatar uri={item.otherUser?.avatar_url} name={item.name} size={44} />
                )}
                <View style={styles.body}>
                  <View style={styles.titleRow}>
                    <Text
                      variant={unread ? 'subheading' : 'bodyStrong'}
                      style={styles.name}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    {item.lastMessage ? (
                      <Text variant="caption" color={unread ? 'brand' : 'textSubtle'}>
                        {formatWhen(item.lastMessage.createdAt)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.titleRow}>
                    <Text
                      variant="caption"
                      color={unread ? 'text' : 'textMuted'}
                      style={styles.preview}
                      numberOfLines={1}
                    >
                      {preview(item)}
                    </Text>
                    {unread ? (
                      <View style={styles.unread}>
                        <Text variant="captionStrong" color="textOnBrand" style={styles.unreadText}>
                          {item.unreadCount > 99 ? '99+' : item.unreadCount}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon name="chat" size={34} color={colors.brand} />}
              title={error ? 'Yüklenemedi' : 'Henüz sohbet yok'}
              description={
                error ?? 'Bir arkadaşına yaz ya da mahallenin gönüllüleriyle bir grup kur.'
              }
              actionTitle={error ? 'Tekrar dene' : 'Yeni sohbet'}
              onAction={error ? load : () => navigation.navigate('NewConversation')}
            />
          }
        />
      )}
    </Screen>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  titleCol: { flex: 1, marginRight: spacing.md },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  groupAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: c.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, marginLeft: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  name: { flex: 1, marginRight: spacing.sm },
  preview: { flex: 1, marginRight: spacing.sm },
  unread: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: c.brand,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { fontSize: 11, lineHeight: 14 },
}));

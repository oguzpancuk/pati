import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  AppNotification,
  fetchNotifications,
  markNotificationsRead,
  notificationTitle,
} from '../api/notifications';
import { CareAlertEntry, markCareAlertsRead, readCareAlertLog } from '../careAlertLog';
import { Icon } from '../components/brand';
import { Avatar, EmptyState, LoadingState, LoadMoreButton, Screen, Text } from '../components/ui';
import { makeStyles, radius, spacing, useTheme } from '../theme';

const PAGE = 30;

// One list, two sources: the server's rows (animal events) and the
// device's own food/water alerts (careAlertLog). Merged newest first; the
// device entries carry no animal to open.
type Row =
  | { key: string; source: 'server'; at: string; unread: boolean; item: AppNotification }
  | { key: string; source: 'device'; at: string; unread: boolean; item: CareAlertEntry };

function toRows(server: AppNotification[], device: CareAlertEntry[]): Row[] {
  const rows: Row[] = [
    ...server.map<Row>((n) => ({
      key: `s${n.id}`,
      source: 'server',
      at: n.created_at,
      unread: !n.read_at,
      item: n,
    })),
    ...device.map<Row>((e) => ({
      key: `d${e.id}`,
      source: 'device',
      at: e.createdAt,
      unread: !e.readAt,
      item: e,
    })),
  ];
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotificationsScreen({ navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [server, setServer] = useState<AppNotification[]>([]);
  const [device, setDevice] = useState<CareAlertEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const [page, log] = await Promise.all([
        fetchNotifications({ limit: PAGE }),
        readCareAlertLog(),
      ]);
      setServer(page.notifications);
      setTotal(page.total);
      setDevice(log);
      // Opening the inbox reads it, the way a chat does; the rows keep
      // their unread mark for this visit so the new ones stand out.
      if (page.unreadCount > 0) markNotificationsRead().catch(() => {});
      if (log.some((e) => !e.readAt)) markCareAlertsRead().catch(() => {});
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await fetchNotifications({ limit: PAGE, offset: server.length });
      setServer((prev) => [
        ...prev,
        ...page.notifications.filter((n) => !prev.some((p) => p.id === n.id)),
      ]);
      setTotal(page.total);
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? 'Bir hata oluştu');
    } finally {
      setLoadingMore(false);
    }
  }

  const rows = toRows(server, device);

  if (loading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon={<Icon name="bell" size={28} color={colors.brand} />}
            title="Henüz bildirim yok"
            description="Takip ettiğin ya da bakım verdiğin hayvanlara yorum, görülme, sağlık veya aşı kaydı eklendiğinde ya da biri bakım vermeye başladığında burada görürsün."
          />
        }
        ListFooterComponent={
          <LoadMoreButton
            remaining={total - server.length}
            loading={loadingMore}
            onPress={loadMore}
            label="Önceki bildirimleri yükle"
            style={styles.more}
          />
        }
        renderItem={({ item: row }) => {
          if (row.source === 'device') {
            return (
              <View style={[styles.row, row.unread && styles.rowUnread]}>
                <View style={styles.bellWrap}>
                  <Icon name="bell" size={18} color={colors.brand} />
                </View>
                <View style={styles.body}>
                  <Text variant="bodyStrong">{row.item.title}</Text>
                  <Text variant="caption">{row.item.body}</Text>
                  <Text variant="micro" style={styles.time}>
                    {formatDate(row.item.createdAt)}
                  </Text>
                </View>
              </View>
            );
          }
          const n = row.item;
          return (
            <Pressable
              style={[styles.row, row.unread && styles.rowUnread]}
              disabled={!n.animal_id}
              onPress={() =>
                n.animal_id && navigation.navigate('AnimalProfile', { animalId: n.animal_id })
              }
            >
              <Avatar uri={n.actor_avatar_url} name={n.payload.actorName} size={36} />
              <View style={styles.body}>
                <Text variant="bodyStrong">{notificationTitle(n)}</Text>
                {n.payload.text ? (
                  <Text variant="caption" numberOfLines={2}>
                    {n.payload.text}
                  </Text>
                ) : null}
                <Text variant="micro" style={styles.time}>
                  {formatDate(n.created_at)}
                </Text>
              </View>
              {n.animal_id ? (
                <Icon name="chevronRight" size={18} color={colors.textSubtle} />
              ) : null}
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  rowUnread: { backgroundColor: c.brandTint, borderColor: c.brandSoft },
  bellWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
  },
  body: { flex: 1 },
  time: { marginTop: 2 },
  more: { marginTop: spacing.sm },
}));

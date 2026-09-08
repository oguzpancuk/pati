import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  applyPoll,
  ConversationDetail,
  deleteMessage,
  fetchConversation,
  fetchMessages,
  markConversationRead,
  Message,
  POLL_INTERVAL_MS,
  reportMessage,
  sendMessage,
} from '../api/messages';
import { REPORT_REASONS, ReportReason } from '../reportReasons';
import { Avatar, Button, Chip, LoadingState, Text } from '../components/ui';
import { Icon } from '../components/brand';
import { fonts, hitSlop, makeStyles, radius, spacing, useTheme } from '../theme';

const PAGE = 50;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * One conversation: the newest page, older pages as you scroll up, a
 * 5-second poll while the app is in front (ROADMAP P6 item 4 — no push in
 * this batch). Long-press a bubble to delete it (yours, or any as a group
 * admin) or report it.
 */
export default function ConversationScreen({ route, navigation }: any) {
  const conversationId: number = route.params.conversationId;
  const styles = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const myId = user?.id;
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState<Message | null>(null);
  // Cursors for the poll: the newest id we hold and the server's clock at
  // the last answer. Refs, so the timer callback never closes over a stale
  // render.
  const lastId = useRef<number | null>(null);
  const since = useRef<string | null>(null);
  const loadingOlder = useRef(false);
  const loaded = useRef(false);

  const loadDetail = useCallback(async () => {
    try {
      const d = await fetchConversation(conversationId);
      setDetail(d);
      navigation.setOptions({ title: d.name });
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? 'Sohbet bulunamadı', [
        { text: 'Tamam', onPress: () => navigation.goBack() },
      ]);
    }
  }, [conversationId, navigation]);

  const loadLatest = useCallback(async () => {
    const page = await fetchMessages(conversationId, { limit: PAGE });
    setMessages(page.messages);
    setHasMore(page.hasMore);
    lastId.current = page.messages.length ? page.messages[page.messages.length - 1].id : null;
    since.current = page.now;
    // Opening the screen is reading it; the inbox badge clears on return.
    markConversationRead(conversationId).catch(() => {});
  }, [conversationId]);

  const poll = useCallback(async () => {
    try {
      const page = await fetchMessages(conversationId, {
        after: lastId.current ?? undefined,
        since: since.current ?? undefined,
        limit: PAGE,
      });
      since.current = page.now;
      if (page.messages.length || page.deleted.length) {
        setMessages((prev) => applyPoll(prev ?? [], page));
      }
      if (page.messages.length) {
        lastId.current = page.messages[page.messages.length - 1].id;
        markConversationRead(conversationId).catch(() => {});
      }
    } catch {
      // A failed poll is retried by the next tick; nothing to show.
    }
  }, [conversationId]);

  // Everything below is focus-gated: a screen pushed on top (group
  // settings, a profile) must neither poll nor mark messages read on the
  // user's behalf, and coming back re-reads the header so a rename or a
  // changed member list shows at once (review findings). The first focus
  // loads the newest page; later ones catch up with one poll.
  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setInterval> | null = null;
      const start = () => {
        if (!timer) timer = setInterval(poll, POLL_INTERVAL_MS);
      };
      const stop = () => {
        if (timer) clearInterval(timer);
        timer = null;
      };
      loadDetail();
      if (loaded.current) {
        poll();
      } else {
        loadLatest()
          .then(() => {
            loaded.current = true;
          })
          .catch((err: any) =>
            Alert.alert('Yüklenemedi', err?.response?.data?.error ?? 'Mesajlar alınamadı')
          );
      }
      start();
      // A backgrounded app stops the timer and catches up with one poll on
      // return (the `after` cursor makes it cheap).
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          start();
          poll();
        } else {
          stop();
        }
      });
      return () => {
        stop();
        sub.remove();
      };
    }, [loadDetail, loadLatest, poll])
  );

  useLayoutEffect(() => {
    if (!detail) return;
    navigation.setOptions({
      headerRight: () =>
        detail.kind === 'group' ? (
          <Pressable
            hitSlop={hitSlop}
            onPress={() => navigation.navigate('GroupSettings', { conversationId })}
            accessibilityLabel="Grup ayarları"
          >
            <Icon name="users" size={22} color={colors.brand} />
          </Pressable>
        ) : detail.otherUser ? (
          <Pressable
            hitSlop={hitSlop}
            onPress={() => navigation.navigate('PublicProfile', { userId: detail.otherUser!.id })}
          >
            <Avatar uri={detail.otherUser.avatar_url} name={detail.otherUser.name} size={30} />
          </Pressable>
        ) : null,
    });
  }, [detail, navigation, conversationId, colors.brand]);

  async function loadOlder() {
    if (!hasMore || loadingOlder.current || !messages?.length) return;
    loadingOlder.current = true;
    try {
      const page = await fetchMessages(conversationId, { before: messages[0].id, limit: PAGE });
      setMessages((prev) => page.messages.concat(prev ?? []));
      setHasMore(page.hasMore);
    } catch {
      // Scrolling up again retries.
    } finally {
      loadingOlder.current = false;
    }
  }

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const sent = await sendMessage(conversationId, body);
      setDraft('');
      setMessages((prev) =>
        (prev ?? []).some((m) => m.id === sent.id) ? prev! : [...(prev ?? []), sent]
      );
      // The cursor stays where the last poll left it: advancing it to the
      // sent id would skip a reply that landed in between. The poll dedups
      // the echo and pulls anything missed (review finding).
      poll();
    } catch (err: any) {
      Alert.alert('Gönderilemedi', err?.response?.data?.error ?? 'Tekrar dene');
    } finally {
      setSending(false);
    }
  }

  function onLongPress(m: Message) {
    if (m.deleted) return;
    const mine = !!myId && m.sender?.id === myId;
    const admin = detail?.kind === 'group' && detail.role === 'admin';
    const actions: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (mine || admin) {
      actions.push({
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMessage(m.id);
            setMessages((prev) =>
              (prev ?? []).map((x) =>
                x.id === m.id ? { ...x, body: null, deleted: true, deletedBySender: mine } : x
              )
            );
          } catch (err: any) {
            Alert.alert('Silinemedi', err?.response?.data?.error ?? 'Tekrar dene');
          }
        },
      });
    }
    if (!mine) actions.push({ text: 'Şikayet et', onPress: () => setReporting(m) });
    if (actions.length === 0) return;
    actions.push({ text: 'Vazgeç', style: 'cancel' });
    Alert.alert('Mesaj', m.body ?? undefined, actions);
  }

  const isGroup = detail?.kind === 'group';
  // Inverted list: index 0 is the newest, which keeps the view pinned to the
  // bottom without scroll gymnastics; "older" loads at the visual top.
  const data = messages ? [...messages].reverse() : [];

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {messages === null ? (
        <LoadingState />
      ) : (
        <FlatList
          data={data}
          inverted
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.6}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => {
            const mine = !!myId && item.sender?.id === myId;
            // Show the sender above the first bubble of a run (visually,
            // the previous item is the older one at index + 1).
            const older = data[index + 1];
            const showName = isGroup && !mine && older?.sender?.id !== item.sender?.id;
            return (
              <View style={[styles.line, mine ? styles.lineMine : styles.lineTheirs]}>
                {showName ? (
                  <Text variant="micro" style={styles.sender}>
                    {item.sender?.name ?? 'silinmiş kullanıcı'}
                  </Text>
                ) : null}
                <Pressable
                  onLongPress={() => onLongPress(item)}
                  delayLongPress={300}
                  style={[
                    styles.bubble,
                    mine ? styles.bubbleMine : styles.bubbleTheirs,
                    item.deleted && styles.bubbleDeleted,
                  ]}
                >
                  {item.deleted ? (
                    <Text variant="caption" color="textSubtle" style={styles.deletedText}>
                      {item.deletedBySender === false
                        ? 'Yönetici bu mesajı sildi'
                        : 'Bu mesaj silindi'}
                    </Text>
                  ) : (
                    <Text variant="body" color="text">
                      {item.body}
                    </Text>
                  )}
                  <Text variant="caption" color="textSubtle" style={styles.time}>
                    {formatTime(item.createdAt)}
                  </Text>
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="caption" center>
                {isGroup ? 'Gruba ilk mesajı sen yaz.' : 'İlk mesajı sen yaz.'}
              </Text>
            </View>
          }
        />
      )}
      <View style={styles.composer}>
        {detail && !detail.canSend ? (
          <Text variant="caption" center style={styles.blocked}>
            Artık arkadaş değilsiniz; yeni mesaj gönderilemez.
          </Text>
        ) : (
          <View style={styles.composerRow}>
            <TextInput
              style={styles.input}
              placeholder="Mesaj yaz…"
              placeholderTextColor={colors.textSubtle}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={2000}
              editable={!!detail}
            />
            <Pressable
              onPress={submit}
              disabled={!draft.trim() || sending}
              hitSlop={hitSlop}
              accessibilityLabel="Gönder"
              style={[styles.send, (!draft.trim() || sending) && styles.sendOff]}
            >
              <Icon name="chevronRight" size={20} color={colors.textOnBrand} />
            </Pressable>
          </View>
        )}
      </View>
      {reporting ? (
        <ReportMessageModal message={reporting} onClose={() => setReporting(null)} />
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** The report sheet for a message; mirrors components/ReportSheet, which only knows /reports targets. */
function ReportMessageModal({ message, onClose }: { message: Message; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await reportMessage(message.id, reason, details.trim() || undefined);
      setDone(true);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Gönderilemedi, tekrar dene.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={() => !busy && onClose()}>
        <Pressable style={styles.card} onPress={() => {}}>
          {done ? (
            <>
              <Text variant="body" center style={styles.doneText}>
                Şikayetin alındı; en kısa sürede incelenecek. Teşekkürler.
              </Text>
              <Button title="Tamam" onPress={onClose} fullWidth />
            </>
          ) : (
            <>
              <Text variant="micro" center>
                şikayet
              </Text>
              <Text variant="heading" center style={styles.title}>
                Sorun ne?
              </Text>
              <Text variant="caption" center style={styles.sub}>
                Şikayetin yalnızca moderasyon ekibine gider.
              </Text>
              <View style={styles.chips}>
                {REPORT_REASONS.map((r) => (
                  <Chip
                    key={r.key}
                    label={r.label}
                    selected={reason === r.key}
                    onPress={() => setReason(r.key)}
                  />
                ))}
              </View>
              <TextInput
                style={styles.reportInput}
                placeholder="Açıklama (isteğe bağlı)"
                placeholderTextColor={colors.textSubtle}
                value={details}
                onChangeText={setDetails}
                multiline
                maxLength={1000}
              />
              {error ? (
                <Text variant="caption" color="danger" center style={styles.error}>
                  {error}
                </Text>
              ) : null}
              <Button
                title="Şikayeti gönder"
                onPress={submit}
                loading={busy}
                disabled={!reason}
                fullWidth
              />
              <Button title="Vazgeç" variant="ghost" onPress={onClose} disabled={busy} fullWidth />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  flex: { flex: 1, backgroundColor: c.background },
  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  line: { marginBottom: spacing.sm, maxWidth: '82%' },
  lineMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  lineTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  sender: { marginBottom: 2, marginLeft: spacing.sm },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.xs + 2,
    borderWidth: 1,
  },
  bubbleMine: { backgroundColor: c.brandTint, borderColor: c.brandSoft },
  bubbleTheirs: { backgroundColor: c.surfaceAlt, borderColor: c.border },
  bubbleDeleted: { backgroundColor: c.surface, borderStyle: 'dashed' },
  deletedText: { fontFamily: fonts.medium },
  time: { alignSelf: 'flex-end', marginTop: 2, fontSize: 10.5, lineHeight: 14 },
  empty: { paddingVertical: spacing.xl, transform: [{ scaleY: -1 }] },
  composer: {
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end' },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm + 2,
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 20,
    color: c.text,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: c.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  sendOff: { backgroundColor: c.disabled },
  blocked: { paddingVertical: spacing.sm },
  backdrop: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.xl,
    ...shadow.modal,
  },
  title: { marginTop: 2 },
  sub: { marginBottom: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  reportInput: {
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: radius.input,
    padding: spacing.md,
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
    fontFamily: fonts.medium,
    fontSize: 14.5,
    lineHeight: 20,
    color: c.text,
  },
  error: { marginBottom: spacing.sm },
  doneText: { marginVertical: spacing.lg },
}));

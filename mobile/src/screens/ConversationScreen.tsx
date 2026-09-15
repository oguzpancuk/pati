import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Modal,
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
  Quote,
  quoteOf,
  reportMessage,
  sendMessage,
  withDeleted,
} from '../api/messages';
import { REPORT_REASONS, ReportReason } from '../reportReasons';
import { Avatar, Button, Chip, KeyboardInsetView, LoadingState, Text } from '../components/ui';
import { Icon } from '../components/brand';
import { fonts, hitSlop, makeStyles, radius, spacing, useTheme } from '../theme';

const PAGE = 50;
const AVATAR = 28;
const FLASH_MS = 1500;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * One conversation: the newest page, older pages as you scroll up, a
 * 5-second poll while the app is in front (ROADMAP P6 item 4 — no push in
 * this batch). Long-press a bubble to reply to it (the quote shows above
 * the composer and, once sent, above the bubble; tapping a quote jumps to
 * its source), delete it (yours, or any as a group admin) or report it.
 * The sender's avatar sits beside the first bubble of a run (P7 items 6–7).
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
  // The quote the next send will carry; cleared on send, cancel, or when
  // the source is deleted under it (the server would refuse it anyway).
  const [replyTo, setReplyTo] = useState<Quote | null>(null);
  // The bubble a quote tap just scrolled to, outlined for a moment; the
  // timestamp restarts the timer when the same quote is tapped again.
  const [flash, setFlash] = useState<{ id: number; at: number } | null>(null);
  const flashId = flash?.id ?? null;
  // One retry per failed scrollToIndex, never a loop.
  const scrollRetried = useRef(false);
  const listRef = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);
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
    // Marked read AFTER the page, never before. The server stamps
    // `last_read_at = now()`, so anything that arrives in between is shown
    // on screen and still counted unread — the badge would then hold a
    // number for a message the user demonstrably saw. Backing out early no
    // longer leaves the badge stale either: the read publishes the total it
    // earned, and the tab badge follows that instead of its own poll.
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

  useEffect(() => {
    if (replyTo && messages?.some((m) => m.id === replyTo.id && m.deleted)) setReplyTo(null);
  }, [messages, replyTo]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  useLayoutEffect(() => {
    if (!detail) return;
    navigation.setOptions({
      headerRight: () =>
        // One round header control (owner, P8 item 4): a surface disc with
        // a hairline, the glyph centred. The styles object changes identity
        // on a theme flip (makeStyles caches per theme name) and sits in the
        // deps below, so the header re-renders with the right disc colour.
        detail.kind === 'group' ? (
          <Pressable
            hitSlop={hitSlop}
            onPress={() => navigation.navigate('GroupSettings', { conversationId })}
            accessibilityLabel="Grup ayarları"
            style={styles.headButton}
          >
            <Icon name="users" size={20} color={colors.brand} />
          </Pressable>
        ) : detail.otherUser ? (
          <Pressable
            hitSlop={hitSlop}
            onPress={() => navigation.navigate('PublicProfile', { userId: detail.otherUser!.id })}
            style={styles.headButton}
          >
            <Avatar uri={detail.otherUser.avatar_url} name={detail.otherUser.name} size={30} />
          </Pressable>
        ) : null,
    });
  }, [detail, navigation, conversationId, colors.brand, styles.headButton]);

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
      const sent = await sendMessage(conversationId, body, replyTo?.id);
      setDraft('');
      setReplyTo(null);
      setMessages((prev) =>
        (prev ?? []).some((m) => m.id === sent.id)
          ? prev!
          : [...(prev ?? []), sent].sort((a, b) => a.id - b.id)
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
    // A system line has no sender to reply to, delete or report; it renders
    // without a Pressable, and this is the second lock on that door.
    if (m.deleted || m.kind === 'system') return;
    const mine = !!myId && m.sender?.id === myId;
    const admin = detail?.kind === 'group' && detail.role === 'admin';
    const actions: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (detail?.canSend) {
      actions.push({
        text: 'Yanıtla',
        onPress: () => {
          setReplyTo(quoteOf(m));
          inputRef.current?.focus();
        },
      });
    }
    if (mine || admin) {
      actions.push({
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMessage(m.id);
            setMessages((prev) => withDeleted(prev ?? [], [{ id: m.id, deletedBySender: mine }]));
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

  // A quote tap scrolls to its source when it is loaded; a source further
  // up than the pages fetched so far is left alone (the owner's spec).
  function jumpTo(id: number) {
    const index = data.findIndex((m) => m.id === id);
    if (index < 0) return;
    scrollRetried.current = false;
    listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    setFlash({ id, at: Date.now() });
  }

  return (
    <KeyboardInsetView style={styles.flex}>
      {messages === null ? (
        <LoadingState />
      ) : (
        <FlatList
          ref={listRef}
          data={data}
          inverted
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.6}
          keyboardShouldPersistTaps="handled"
          // Rows are not measured up front; land near the target, then
          // retry once — a second failure leaves the list where it is.
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
            if (scrollRetried.current) return;
            scrollRetried.current = true;
            setTimeout(
              () => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }),
              120
            );
          }}
          renderItem={({ item, index }) => {
            // The conversation's own lines (demo note 12): centred, muted,
            // no avatar, no bubble — and no long press, so neither the
            // reply, the delete nor the report sheet can reach one.
            if (item.kind === 'system') {
              return (
                <View style={styles.systemLine}>
                  <Text variant="caption" color="textMuted" center>
                    {item.body}
                  </Text>
                </View>
              );
            }
            const mine = !!myId && item.sender?.id === myId;
            // The avatar (and, in a group, the name) marks the first bubble
            // of a run; the rest of the run indents to stay aligned.
            // Visually the previous item is the older one at index + 1.
            const older = data[index + 1];
            const firstOfRun = older?.sender?.id !== item.sender?.id;
            const showName = isGroup && !mine && firstOfRun;
            const avatar = firstOfRun ? (
              <Avatar
                uri={item.sender?.avatar_url}
                name={item.sender?.name}
                size={AVATAR}
                style={mine ? styles.avatarMine : styles.avatarTheirs}
              />
            ) : (
              <View style={styles.avatarGap} />
            );
            return (
              <View style={[styles.line, mine ? styles.lineMine : styles.lineTheirs]}>
                {mine ? null : avatar}
                <View style={[styles.column, mine ? styles.columnMine : styles.columnTheirs]}>
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
                      flashId === item.id && styles.bubbleFlash,
                    ]}
                  >
                    {item.replyTo ? (
                      <Pressable
                        onPress={() => jumpTo(item.replyTo!.id)}
                        onLongPress={() => onLongPress(item)}
                        delayLongPress={300}
                        style={styles.quote}
                        accessibilityLabel="Alıntılanan mesaja git"
                      >
                        <Text variant="micro" color="brand" numberOfLines={1}>
                          {item.replyTo.sender?.name ?? 'silinmiş kullanıcı'}
                        </Text>
                        <Text
                          variant="caption"
                          color={item.replyTo.deleted ? 'textSubtle' : 'textMuted'}
                          numberOfLines={2}
                        >
                          {item.replyTo.deleted ? 'Bu mesaj silindi' : item.replyTo.excerpt}
                        </Text>
                      </Pressable>
                    ) : null}
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
                {mine ? avatar : null}
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
          <>
            {replyTo ? (
              <View style={styles.replyBar}>
                <View style={styles.replyBarText}>
                  <Text variant="micro" color="brand" numberOfLines={1}>
                    {replyTo.sender?.name ?? 'silinmiş kullanıcı'} · yanıtlanıyor
                  </Text>
                  <Text variant="caption" color="textMuted" numberOfLines={1}>
                    {replyTo.excerpt}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setReplyTo(null)}
                  hitSlop={hitSlop}
                  accessibilityLabel="Alıntıyı kaldır"
                >
                  <Icon name="close" size={18} color={colors.textSubtle} />
                </Pressable>
              </View>
            ) : null}
            <View style={styles.composerRow}>
              <TextInput
                ref={inputRef}
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
          </>
        )}
      </View>
      {reporting ? (
        <ReportMessageModal message={reporting} onClose={() => setReporting(null)} />
      ) : null}
    </KeyboardInsetView>
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
  headButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadow.float,
  },
  flex: { flex: 1, backgroundColor: c.background },
  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
    maxWidth: '86%',
  },
  lineMine: { alignSelf: 'flex-end' },
  lineTheirs: { alignSelf: 'flex-start' },
  column: { flexShrink: 1 },
  columnMine: { alignItems: 'flex-end' },
  columnTheirs: { alignItems: 'flex-start' },
  avatarTheirs: { marginRight: spacing.sm, marginTop: 2 },
  avatarMine: { marginLeft: spacing.sm, marginTop: 2 },
  avatarGap: { width: AVATAR + spacing.sm },
  // The pill lives on the wrapping View, never on the Text: a pill radius
  // plus `overflow: 'hidden'` on an iOS <Text> clips the line away entirely,
  // which is how the group system message shipped invisible on mobile while
  // rendering fine on web (QA, 2026-09-12).
  systemLine: {
    alignSelf: 'center',
    maxWidth: '86%',
    marginVertical: spacing.sm,
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
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
  bubbleFlash: { borderColor: c.brand },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: c.brand,
    backgroundColor: c.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
    maxWidth: '100%',
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: c.brand,
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  replyBarText: { flex: 1, marginRight: spacing.sm },
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

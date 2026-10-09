import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Camera, MapView, MarkerView } from '@maplibre/maplibre-react-native';
import { mapStyles } from '../map/styles';
import {
  addAnimalComment,
  addHealthRecord,
  addVaccination,
  AnimalComment,
  AnimalDetail,
  fetchAnimal,
  fetchAnimalComments,
  followAnimal,
  HealthRecord,
  HealthRecordStatus,
  HealthRecordType,
  leaveCare,
  markHealthRecordRecovered,
  reopenHealthRecord,
  unfollowAnimal,
} from '../api/animals';
import { bumpLadderValue, headerBadges, setLadderValue } from '../animalBadges';
import { animalPhotoSlots, PHOTO_GRID_COLUMNS } from '../animalPhotoSlots';
import AdBanner from '../components/AdBanner';
import AnimalAvatar from '../components/AnimalAvatar';
import AnimalBadgeLadderModal from '../components/AnimalBadgeLadderModal';
import AnimalLocationSheet from '../components/AnimalLocationSheet';
import { BadgeSymbol } from '../components/badges';
import DemoChip from '../components/DemoChip';
import ReportLink, { ReportSheet } from '../components/ReportSheet';
import { useAuth } from '../context/AuthContext';
import { useBadgeAwards } from '../context/BadgeAwardContext';
import {
  Avatar,
  Button,
  Card,
  Chip,
  ChoiceField,
  Input,
  LoadingState,
  LoadMoreButton,
  Screen,
  SectionHeader,
  Tag,
  Text,
} from '../components/ui';
import { Icon } from '../components/brand';
import { mergeById } from '../paging';
import { conditionsFor, VACCINE_TYPES } from '../taxonomy';
import { fonts, hitSlop, makeStyles, radius, spacing, useTheme } from '../theme';

const RECORD_TYPE_LABELS: Record<HealthRecordType, string> = {
  illness: 'Hastalık',
  injury: 'Yaralanma',
};

// Status colors from the theme tones: red = awaiting intervention, orange =
// ongoing, green = closed.
const STATUS_META: Record<
  HealthRecordStatus,
  { label: string; tone: 'danger' | 'warning' | 'success' }
> = {
  not_started: { label: 'Tedaviye başlanmadı', tone: 'danger' },
  in_treatment: { label: 'Tedavi sürüyor', tone: 'warning' },
  recovered: { label: 'İyileşti', tone: 'success' },
};

const RECORD_TYPE_OPTIONS: HealthRecordType[] = ['illness', 'injury'];

function recordLabel(record: HealthRecord): string {
  return `${RECORD_TYPE_LABELS[record.record_type]}: ${record.description}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Chat is a summary on the profile: only the last 3 comments at open (the
// profile mustn't stretch and bury the health/vaccine sections); "load
// earlier comments" prepends pages of 20.
const COMMENT_PREVIEW = 3;
const COMMENT_PAGE = 20;
// Vaccinations and health records arrive complete with the profile (short
// lists); their cards are tall (status tag, "recovered" button) so more than
// 2 folds away — even 3 cards pushed the chat below the screen.
const RECORD_PREVIEW = 2;
// The carer rows are compact (avatar + name), but a well-known animal can
// have dozens; five is a glance, the rest sit behind "load more".
const CARER_PREVIEW = 5;

export default function AnimalProfileScreen({ route, navigation }: any) {
  const styles = useStyles();
  const { name: themeName, colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  // Three square tiles a row (animalPhotoSlots); the gutter is the small
  // spacing step.
  const tileSize = Math.floor(
    (windowWidth - spacing.lg * 2 - spacing.sm * (PHOTO_GRID_COLUMNS - 1)) / PHOTO_GRID_COLUMNS
  );
  const { celebrate } = useBadgeAwards();
  const { user } = useAuth();
  const myId = user?.id;
  const { animalId } = route.params;
  // When viewed from the add-animal flow as "is this the animal?", a
  // decision bar replaces the comment box. The decision returns to AddAnimal
  // via a param; location update and care-list insertion happen there, in
  // one place.
  const matchReview: boolean = !!route.params?.matchReview;
  // The server's decision for this candidate (matchHit): with it the
  // confirm reports a sighting and makes the user a carer; without it the
  // bar only opens the profile, unless the viewer already is a carer (see
  // confirmReports). photoChecked tells the hint apart.
  const matchHit: boolean = !!route.params?.matchHit;
  const photoChecked: boolean = route.params?.photoChecked !== false;
  const [animal, setAnimal] = useState<AnimalDetail | null>(null);
  const [comments, setComments] = useState<AnimalComment[]>([]);
  const [draft, setDraft] = useState('');
  // The health record a comment attaches to: lets comments like "gave the
  // medication for this illness" pin to the record. Vaccinations have no chat.
  const [linkedRecord, setLinkedRecord] = useState<HealthRecord | null>(null);
  const [sending, setSending] = useState(false);
  // The composer is content at the end of the chat, not a bar pinned over
  // the page (owner, 2026-09-15), so the screen scrolls it into view itself:
  // nothing but the content padding is below it (the animal's report moved
  // to the header), so the end of the scroll is always a place where it
  // shows. A sent comment's new row pushes it down (and the reload can
  // shorten the list above it); the bump runs the scroll once that render is
  // committed.
  const scrollRef = useRef<ScrollView>(null);
  const [composerReveal, setComposerReveal] = useState(0);
  useEffect(() => {
    if (composerReveal > 0) scrollRef.current?.scrollToEnd({ animated: true });
  }, [composerReveal]);
  // iOS: the focus-time scroll (on the field below) only reaches the end if
  // the scroll view already has its keyboard inset. A keyboard that comes up
  // after that scroll has run (the software keyboard shown while the field
  // already has focus, as when a hardware keyboard goes away) finds the page
  // at the inset-less end, and RN's native handler then brings only the
  // caret line to the keyboard's top edge. UIKit posts did-show after the
  // will-change-frame that sets the inset, so this scroll reaches the real
  // end whichever came first.
  const composerFocused = useRef(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      if (composerFocused.current) scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => subscription.remove();
  }, []);
  // The badge ladder (P7 item 3) opens from a header chip; the tapped key
  // is the highlighted row.
  const [ladderKey, setLadderKey] = useState<string | null>(null);

  const [recordModalVisible, setRecordModalVisible] = useState(false);
  // Bumped whenever a record/vaccine modal session starts or ends, so a save
  // that resolves late can tell whether it is still looking at its own modal.
  const dialogSession = useRef(0);
  const [recordType, setRecordType] = useState<HealthRecordType>('illness');
  const [recordDescription, setRecordDescription] = useState<string | null>(null);
  const [savingRecord, setSavingRecord] = useState(false);

  const [vaccineModalVisible, setVaccineModalVisible] = useState(false);
  const [vaccineType, setVaccineType] = useState<string | null>(null);
  const [vaccineNote, setVaccineNote] = useState('');
  const [savingVaccine, setSavingVaccine] = useState(false);

  // Tapping a health record lists only the comments bound to that record.
  const [logRecord, setLogRecord] = useState<HealthRecord | null>(null);
  const [logComments, setLogComments] = useState<AnimalComment[]>([]);
  const [commentTotal, setCommentTotal] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [visibleVaccinations, setVisibleVaccinations] = useState(RECORD_PREVIEW);
  const [visibleRecords, setVisibleRecords] = useState(RECORD_PREVIEW);
  const [visibleCarers, setVisibleCarers] = useState(CARER_PREVIEW);
  const [followBusy, setFollowBusy] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  // The last-seen thumbnail opens a real, pannable map (demo item 8).
  const [locationOpen, setLocationOpen] = useState(false);
  // The animal's report sheet, opened from the header flag. `?report=1`
  // (dev/QA deep link) opens it once the profile has loaded.
  const [reportOpen, setReportOpen] = useState<boolean>(!!route.params?.report);

  // "kedi profili" / "köpek profili" (P6 item 6): the species is known only
  // after the load, so the stack's default title stands until then.
  const species = animal?.species;
  useEffect(() => {
    if (species)
      navigation.setOptions({ title: species === 'cat' ? 'kedi profili' : 'köpek profili' });
  }, [navigation, species]);

  // Reporting the animal is the header's right-hand control (owner,
  // 2026-09-15): at the page's end it sat under the comment composer, which
  // is where the page should end. A flag in the round header disc the
  // conversation screen uses, its glyph in the muted text colour rather than
  // the brand's: there without asking to be pressed, yet above the 3:1 a
  // glyph that is the control's only sign needs (the old link's subtle
  // colour is not, on white). Not offered before the profile has
  // loaded, nor in match review, which hides every secondary action so the
  // decision bar is the only one. The styles object changes identity on a
  // theme flip (makeStyles caches per theme name), so it sits in the deps.
  const loaded = animal !== null;
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        loaded && !matchReview ? (
          <Pressable
            hitSlop={hitSlop}
            onPress={() => setReportOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Şikayet et"
            style={styles.headButton}
          >
            <Icon name="flag" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null,
    });
  }, [navigation, loaded, matchReview, colors.textMuted, styles.headButton]);

  const load = useCallback(async () => {
    try {
      const [detail, commentPage] = await Promise.all([
        fetchAnimal(animalId),
        fetchAnimalComments(animalId, { limit: COMMENT_PREVIEW }),
      ]);
      setAnimal(detail);
      setComments(commentPage.comments);
      setCommentTotal(commentPage.total);
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bilinmeyen hata');
    }
  }, [animalId]);

  // Chat opens newest-first: the last page on screen, older ones behind the
  // button. Earlier pages are *prepended* so chronology stays intact.
  async function handleLoadOlderComments() {
    setLoadingOlder(true);
    try {
      const page = await fetchAnimalComments(animalId, {
        limit: COMMENT_PAGE,
        offset: comments.length,
      });
      setComments((prev) => mergeById(prev, page.comments, 'start'));
      setCommentTotal(page.total);
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setLoadingOlder(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // "Takip et" toggles without a condition; optimistic, the server's count
  // replaces the guess (or the flip is undone on failure).
  async function handleToggleFollow() {
    if (!animal || followBusy) return;
    const wasFollowing = animal.isFollowing;
    setFollowBusy(true);
    setAnimal({
      ...animal,
      isFollowing: !wasFollowing,
      followerCount: animal.followerCount + (wasFollowing ? -1 : 1),
      badgeLadder: bumpLadderValue(animal.badgeLadder, 'followed', wasFollowing ? -1 : 1),
    });
    try {
      const state = wasFollowing ? await unfollowAnimal(animalId) : await followAnimal(animalId);
      setAnimal((prev) =>
        prev
          ? {
              ...prev,
              isFollowing: state.following,
              followerCount: state.followerCount,
              badgeLadder: setLadderValue(prev.badgeLadder, 'followed', state.followerCount),
            }
          : prev
      );
    } catch (err: any) {
      setAnimal((prev) =>
        prev
          ? {
              ...prev,
              isFollowing: wasFollowing,
              followerCount: animal.followerCount,
              badgeLadder: animal.badgeLadder,
            }
          : prev
      );
      Alert.alert('Olmadı', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setFollowBusy(false);
    }
  }

  /**
   * "bakım veriyorsun" pressed again is the door out (owner, 2026-09-16).
   * It asks first, because leaving takes the records, the chat and the
   * photo tile away and coming back means another photo; what the leaver
   * already wrote stays on the animal. The profile is reloaded rather than
   * patched: the carer row also carries the follow, the two counts, the
   * carer list and the animal's own badge ladder.
   */
  function handleLeaveCare() {
    if (!animal || leaveBusy) return;
    const who = animal.name ?? (animal.species === 'cat' ? 'bu kedi' : 'bu köpek');
    Alert.alert(
      'Bakımı bırak',
      `${who} için bakıcılığı bırakacaksın. Sağlık ve aşı kaydı ekleyemez, sohbete yazamaz ve haberleri alamazsın. Yazdıkların ve eklediğin fotoğraflar kalır. Yeniden bakıcı olmak için yeni bir fotoğraf çekmen gerekir.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Bırak', style: 'destructive', onPress: leaveCareNow },
      ]
    );
  }

  async function leaveCareNow() {
    setLeaveBusy(true);
    try {
      await leaveCare(animalId);
      await load();
    } catch (err: any) {
      Alert.alert('Olmadı', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setLeaveBusy(false);
    }
  }

  /**
   * Every person named on this profile is a door to their profile (demo
   * item 7) — everyone except you. Your own name is plain text: tapping
   * through to a stranger's-eye view of yourself (third-person Turkish —
   * "Bakım verdiği hayvanlar", "Henüz yorum yapmamış.") is the odd outcome,
   * your own profile is one tab tap away, and web says the same (owner,
   * 2026-09-11; the two clients used to disagree here).
   *
   * It is always a push, never a jump to the profile tab: switching tabs
   * abandons the stack the reader is standing in and leaves no way back to
   * the animal (DESIGN.md §8). `push`, not `navigate`, so a chain like
   * profile → animal → the same person keeps its history instead of
   * unwinding to the screen already in the stack.
   */
  function isSelf(userId: number | null | undefined) {
    return typeof userId === 'number' && userId === myId;
  }

  function openProfile(userId: number | null | undefined) {
    if (typeof userId !== 'number' || isSelf(userId)) return;
    navigation.push('PublicProfile', { userId });
  }

  /** A person's name inside a caption line: a link, or plain text for you. */
  function personName(userId: number | null | undefined, name: string) {
    if (isSelf(userId)) return <Text variant="caption">{name}</Text>;
    return (
      <Text
        variant="caption"
        color="brand"
        onPress={() => openProfile(userId)}
        suppressHighlighting
      >
        {name}
      </Text>
    );
  }

  function openCarePhotos() {
    if (!animal) return;
    navigation.navigate('CarePhotos', {
      animalId,
      species: animal.species,
      name: animal.name,
      carer: animal.isCarer,
    });
  }

  async function handleSend() {
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    try {
      const created = await addAnimalComment(animalId, body, linkedRecord?.id);
      setDraft('');
      setLinkedRecord(null);
      await load();
      setComposerReveal((n) => n + 1);
      celebrate(created);
    } catch (err: any) {
      Alert.alert('Gönderilemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setSending(false);
    }
  }

  async function handleSaveRecord() {
    const description = recordDescription?.trim();
    if (!description) {
      Alert.alert('Eksik bilgi', 'Listeden seç ya da "Diğer" ile kendin yaz.');
      return;
    }
    // Hardware back no longer refuses mid-save, so the modal can be closed and
    // reopened while this request is out. Without the token the answer would
    // close the NEW modal and wipe what was typed into it — the lost record
    // the old refusal existed to prevent, in a narrower window.
    const session = ++dialogSession.current;
    setSavingRecord(true);
    try {
      const created = await addHealthRecord(animalId, recordType, description);
      if (session === dialogSession.current) {
        setRecordDescription(null);
        setRecordType('illness');
        setRecordModalVisible(false);
      }
      await load();
      celebrate(created);
    } catch (err: any) {
      Alert.alert('Eklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setSavingRecord(false);
    }
  }

  async function handleSaveVaccination() {
    const type = vaccineType?.trim();
    if (!type) {
      Alert.alert('Eksik bilgi', 'Aşı türünü seç ya da "Diğer" ile kendin yaz.');
      return;
    }
    // See handleSaveRecord: the answer may arrive after this modal was closed
    // and another opened.
    const session = ++dialogSession.current;
    setSavingVaccine(true);
    try {
      const created = await addVaccination(animalId, {
        vaccineType: type,
        note: vaccineNote.trim() || undefined,
      });
      if (session === dialogSession.current) {
        setVaccineType(null);
        setVaccineNote('');
        setVaccineModalVisible(false);
      }
      await load();
      celebrate(created);
    } catch (err: any) {
      Alert.alert('Eklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setSavingVaccine(false);
    }
  }

  async function handleOpenLog(record: HealthRecord) {
    try {
      // Record chat is short (single topic); one full page is enough.
      const data = await fetchAnimalComments(animalId, { healthRecordId: record.id, limit: 100 });
      setLogComments(data.comments);
      setLogRecord(record);
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? 'Bir hata oluştu');
    }
  }

  function handleMarkRecovered(record: HealthRecord) {
    Alert.alert(
      'İyileşti olarak işaretle',
      `"${record.description}" kaydı kapanacak ve bu kayda artık yorum eklenemeyecek. Emin misin?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İyileşti',
          onPress: async () => {
            try {
              const updated = await markHealthRecordRecovered(animalId, record.id);
              // If selected as the comment target, deselect: a closed
              // record takes no comments.
              setLinkedRecord((prev) => (prev?.id === record.id ? null : prev));
              await load();
              celebrate(updated);
            } catch (err: any) {
              Alert.alert(
                'İşaretlenemedi',
                err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu'
              );
            }
          },
        },
      ]
    );
  }

  function handleReopen(record: HealthRecord) {
    Alert.alert(
      'İyileşti işaretini geri al',
      `"${record.description}" kaydı yeniden açılacak ve yorumlara izin verilecek. Emin misin?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Geri al',
          onPress: async () => {
            try {
              await reopenHealthRecord(animalId, record.id);
              await load();
            } catch (err: any) {
              Alert.alert(
                'Geri alınamadı',
                err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu'
              );
            }
          },
        },
      ]
    );
  }

  if (!animal) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const displayName = animal.name ?? (animal.species === 'cat' ? 'Kedi' : 'Köpek');
  // A carer's confirm reports too, hit or not: the server lets a carer
  // report a sighting and add photos without one, so "Bu o" must not drop
  // the photos a carer took in the flow (B1 follow-up).
  const confirmReports = matchHit || animal.isCarer;
  const latitude = animal.location.coordinates[1];
  const longitude = animal.location.coordinates[0];
  // Under the health-record dialogs an area-targeted ad is placed by where
  // the animal lives, not by where the person happens to be typing.
  const animalPlace = { lat: latitude, lng: longitude };
  // Recovered records are closed; the server rejects comments on them too,
  // so they never appear in the selectable list.
  const openRecords = animal.healthRecords.filter((r) => r.status !== 'recovered');
  // Match review offers one decision, so its grid adds nothing.
  const photoSlots = animalPhotoSlots(animal.photos.length, animal.isCarer && !matchReview);

  return (
    <View style={styles.flex}>
      <Screen scroll scrollRef={scrollRef} automaticallyAdjustKeyboardInsets>
        {/* The photos open the profile (owner, 2026-09-09 — the avatar is
            gone with them): square tiles, three a row, each with its like
            count; a tap opens the swipeable viewer. A carer's next cell is
            the "fotoğraf ekle" tile (owner, 2026-09-15: the slot, not a
            button), and the last row fills with dashed "fotoğraf"
            placeholders — even an empty profile invites. The cell counts
            come from animalPhotoSlots, shared with the web page. */}
        <View style={styles.photoGrid}>
          {animal.photos.slice(0, photoSlots.shown).map((photo, i) => (
            <Pressable
              key={photo.id}
              style={[styles.photoTile, { width: tileSize, height: tileSize }]}
              onPress={() =>
                navigation.navigate('AnimalPhotos', { animalId, photos: animal.photos, index: i })
              }
              accessibilityLabel={`Fotoğraf ${i + 1}, ${photo.like_count ?? 0} beğeni`}
            >
              <Image source={{ uri: photo.url }} style={styles.photoImage} />
              {i === photoSlots.shown - 1 && photoSlots.more > 0 ? (
                <View style={styles.photoMore}>
                  <Text variant="heading" style={styles.photoMoreText}>
                    +{photoSlots.more}
                  </Text>
                </View>
              ) : null}
              <View style={styles.likeBadge}>
                <Icon
                  name="heart"
                  size={12}
                  color={photo.liked_by_me ? colors.brand : colors.textOnBrand}
                />
                <Text variant="micro" style={styles.likeBadgeText}>
                  {photo.like_count ?? 0}
                </Text>
              </View>
            </Pressable>
          ))}
          {photoSlots.add && (
            /* The placeholder's frame, made a door: the brand-coloured
               camera and label tell it apart from the inert cells. It
               opens the care screen in carer mode, as "bakım ver" does
               for everyone else. */
            <Pressable
              style={({ pressed }) => [
                styles.photoTile,
                styles.photoPlaceholder,
                styles.photoAdd,
                pressed && styles.photoAddPressed,
                { width: tileSize, height: tileSize },
              ]}
              onPress={openCarePhotos}
              accessibilityRole="button"
              accessibilityLabel="Fotoğraf ekle"
            >
              <Icon name="camera" size={22} color={colors.brand} />
              <Text variant="micro" color="brand" center style={styles.photoAddLabel}>
                fotoğraf ekle
              </Text>
            </Pressable>
          )}
          {Array.from({ length: photoSlots.placeholders }).map((_, i) => (
            <View
              key={`ph-${i}`}
              style={[
                styles.photoTile,
                styles.photoPlaceholder,
                { width: tileSize, height: tileSize },
              ]}
            >
              <Text variant="micro" color="textSubtle">
                fotoğraf
              </Text>
            </View>
          ))}
        </View>

        {/* Identity under the photos (owner, 2026-09-09): no avatar — the
            gallery above is the animal's face — a name row with the
            follower/carer pair, one descriptive line (pattern, colour and
            markings as a sentence) and the badge chips. */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <View style={styles.nameRow}>
              <View style={styles.nameWrap}>
                <Text variant="title" numberOfLines={1} style={styles.name}>
                  {displayName}
                </Text>
                <DemoChip visible={animal.is_demo === true} />
              </View>
              {/* The audience (P7 item 5, placed by the P8 review): the
                  follower/carer pair right-aligned on the name's line. */}
              <Text variant="body" style={styles.counts}>
                {animal.followerCount} takipçi · {animal.carerCount} bakıcı
              </Text>
            </View>
            <Text variant="caption">
              {[
                animal.color ?? 'Rengi belirtilmemiş',
                animal.breed ?? 'Türü belirtilmemiş',
                animal.markings,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {/* The animal's two highest badges (P6 item 5, P7 item 3): the
                owner's name, the tier as the medallion colour; a tap opens
                the whole ladder. */}
            {animal.badges.length > 0 && (
              <View style={styles.badgeRow}>
                {headerBadges(animal.badges).map((badge) => (
                  <Pressable
                    key={badge.key}
                    style={styles.badgeChip}
                    onPress={() => setLadderKey(badge.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`${badge.label} rozeti, kademeleri gör`}
                  >
                    <BadgeSymbol symbol={badge.symbol} tier={badge.tier} size={18} />
                    <Text variant="micro" numberOfLines={1}>
                      {badge.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Follow vs. care (P6 item 8): "takip et" has no condition and
            toggles; "bakım ver" is the camera-photo step, after which the
            carer view (records, chat) opens. Hidden in match review — the
            decision bar below is the only action there. A carer adds
            photos from the grid's add tile above, not from a button here. */}
        {!matchReview && (
          <View style={styles.actionRow}>
            <Button
              title={animal.isFollowing ? 'takip ediliyor' : 'takip et'}
              variant={animal.isFollowing ? 'success' : 'secondary'}
              size="sm"
              onPress={handleToggleFollow}
              loading={followBusy}
              icon={
                <Icon
                  name="bell"
                  size={16}
                  color={animal.isFollowing ? colors.onSuccess : colors.brand}
                />
              }
              style={styles.actionButton}
            />
            {animal.isCarer ? (
              /* The state keeps the button's outline (P7 item 4): the
                 success variant's green ring and text. Pressed again it is
                 the way out of caring (owner, 2026-09-16) — which is why it
                 is a button now and not a label. */
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.carerState,
                  pressed && styles.carerStatePressed,
                ]}
                onPress={handleLeaveCare}
                disabled={leaveBusy}
                accessibilityRole="button"
                accessibilityState={{ disabled: leaveBusy }}
                accessibilityLabel="Bakım veriyorsun"
                accessibilityHint="Bakımı bırakmak için dokun"
              >
                <Icon name="check" size={16} color={colors.onSuccess} />
                <Text variant="button" style={styles.carerStateText}>
                  {leaveBusy ? 'bırakılıyor…' : 'bakım veriyorsun'}
                </Text>
              </Pressable>
            ) : (
              <Button
                title="bakım ver"
                size="sm"
                onPress={openCarePhotos}
                icon={<Icon name="camera" size={16} color={colors.textOnBrand} />}
                style={styles.actionButton}
              />
            )}
          </View>
        )}

        {/* Who cares for this animal (demo item 7): the rows are doors to
            the people, which is what the "N bakıcı" count above promises. */}
        <SectionHeader title="Bakıcılar" style={styles.sectionTop} />
        {animal.carers.length === 0 ? (
          <Card variant="flat" style={styles.block}>
            <Text variant="caption">Henüz bakıcı yok. İlk bakıcı sen ol.</Text>
          </Card>
        ) : (
          animal.carers.slice(0, visibleCarers).map((carer) => {
            const isOwnRow = isSelf(carer.id);
            const row = (
              <>
                <Avatar uri={carer.avatar_url} name={carer.name} size={34} />
                <Text variant="bodyStrong" numberOfLines={1} style={styles.carerName}>
                  {carer.name}
                </Text>
                {/* Same chip the comment authors below wear: the showcase
                    world writes carer rows too, so a bot can be met here. */}
                <DemoChip visible={carer.is_demo === true} />
                {/* No chevron on your own row: it is not a door. */}
                {!isOwnRow && <Icon name="chevronRight" size={16} color={colors.textSubtle} />}
              </>
            );
            return isOwnRow ? (
              <View key={carer.id} style={styles.carerRow}>
                {row}
              </View>
            ) : (
              <Pressable
                key={carer.id}
                style={styles.carerRow}
                onPress={() => openProfile(carer.id)}
                accessibilityRole="button"
                accessibilityLabel={`${carer.name} profilini aç`}
              >
                {row}
              </Pressable>
            );
          })
        )}
        <LoadMoreButton
          remaining={animal.carers.length - visibleCarers}
          onPress={() => setVisibleCarers(animal.carers.length)}
        />

        <SectionHeader title="En son görüldüğü yer" style={styles.sectionTop} />
        {/* The thumbnail is the affordance (demo item 8): a tap opens the
            same spot as a pannable map in a sheet. The tap target is an
            overlay, not the MapView itself — a MapView swallows touches
            even with scroll and zoom turned off. */}
        <View style={styles.miniMapWrapper}>
          <MapView
            style={styles.miniMap}
            mapStyle={mapStyles[themeName]}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            // No map draws the credit any more; it is one line in the
            // profile's settings sheet (demo note 15, map/attribution.ts).
            attributionEnabled={false}
          >
            <Camera defaultSettings={{ centerCoordinate: [longitude, latitude], zoomLevel: 16 }} />
            <MarkerView coordinate={[longitude, latitude]} anchor={{ x: 0.5, y: 0.5 }}>
              <AnimalAvatar
                species={animal.species}
                breed={animal.breed}
                photoUrl={animal.cover_thumb_url}
                size={32}
              />
            </MarkerView>
          </MapView>
          <Pressable
            style={styles.miniMapTap}
            onPress={() => setLocationOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="En son görüldüğü yeri haritada aç"
          >
            <View style={styles.miniMapHint}>
              <Icon name="crosshair" size={13} color={colors.textOnBrand} />
              <Text variant="micro" style={styles.miniMapHintText}>
                haritada aç
              </Text>
            </View>
          </Pressable>
        </View>
        <Text variant="caption" style={styles.seenAt}>
          {formatDate(animal.location_updated_at)}
        </Text>

        {/* Vaccinations above health records: on the street, "is this animal
            vaccinated" comes before its illness history (rabies risk, can it
            be approached). The cards aren't tappable — vaccines have no
            chat, being one-off, verifiable events. */}
        <SectionHeader
          title="Aşı kayıtları"
          actionLabel={animal.isCarer ? '+ aşı ekle' : undefined}
          onAction={animal.isCarer ? () => setVaccineModalVisible(true) : undefined}
          style={styles.sectionTop}
        />
        {/* Nothing yet is a line, not a card (owner, 2026-09-16): an empty
            hairline box under a section header read as a text field waiting
            to be filled in. */}
        {animal.vaccinations.length === 0 ? (
          <Text variant="caption" style={styles.emptyRecords}>
            Henüz aşı kaydı yok.
          </Text>
        ) : (
          animal.vaccinations.slice(0, visibleVaccinations).map((vaccination) => (
            <Card key={vaccination.id} variant="flat" padding="md" style={styles.block}>
              <View style={styles.recordHeader}>
                <Text variant="bodyStrong" style={styles.recordType} numberOfLines={2}>
                  {vaccination.vaccine_type}
                </Text>
                {vaccination.vet_verified && <Tag label="veteriner onaylı" tone="success" />}
              </View>
              {vaccination.note ? (
                <Text variant="body" style={styles.recordDesc}>
                  {vaccination.note}
                </Text>
              ) : null}
              <Text variant="caption">
                {formatDate(vaccination.administered_at)}
                {vaccination.recorded_by_name ? ' · ' : ''}
                {vaccination.recorded_by_name
                  ? personName(vaccination.recorded_by, vaccination.recorded_by_name)
                  : null}
              </Text>
              {vaccination.next_due_at ? (
                <Text variant="caption">Sonraki doz: {formatDate(vaccination.next_due_at)}</Text>
              ) : null}
            </Card>
          ))
        )}

        <LoadMoreButton
          remaining={animal.vaccinations.length - visibleVaccinations}
          onPress={() => setVisibleVaccinations(animal.vaccinations.length)}
        />

        <SectionHeader
          title="Sağlık kayıtları"
          actionLabel={animal.isCarer ? '+ kayıt ekle' : undefined}
          onAction={animal.isCarer ? () => setRecordModalVisible(true) : undefined}
          style={styles.sectionTop}
        />
        {animal.healthRecords.length === 0 ? (
          <Text variant="caption" style={styles.emptyRecords}>
            Henüz kayıt yok.
          </Text>
        ) : (
          animal.healthRecords.slice(0, visibleRecords).map((record) => {
            const status = STATUS_META[record.status];
            return (
              <Card
                key={record.id}
                variant="flat"
                padding="md"
                style={styles.block}
                onPress={() => handleOpenLog(record)}
              >
                <View style={styles.recordHeader}>
                  <Text variant="bodyStrong" style={styles.recordType} numberOfLines={2}>
                    {RECORD_TYPE_LABELS[record.record_type]}
                    {record.vet_verified ? ' · Veteriner onaylı' : ''}
                  </Text>
                  <Tag label={status.label} tone={status.tone} />
                </View>
                <Text variant="body" style={styles.recordDesc}>
                  {record.description}
                </Text>
                <Text variant="caption">
                  {record.recorded_by_name
                    ? personName(record.recorded_by, record.recorded_by_name)
                    : null}
                  {record.recorded_by_name ? ' · ' : ''}
                  {record.comment_count} yorum · dokunarak kayıtları gör
                </Text>
                {record.status === 'recovered' && record.recovered_by_name && (
                  <Text variant="caption">
                    {personName(record.recovered_by, record.recovered_by_name)} iyileşti olarak
                    işaretledi
                  </Text>
                )}
                {/* An action phrasing on a quiet outline: the old solid-green
                    "iyileşti" read as a status tag, not a button, and was
                    easy to take for the record's state. */}
                {animal.isCarer && record.status !== 'recovered' && (
                  <Button
                    title="iyileşti olarak işaretle"
                    size="sm"
                    variant="secondary"
                    onPress={() => handleMarkRecovered(record)}
                    style={styles.recoverButton}
                  />
                )}
                {/* Mis-taps happen and premature calls surface late; any
                    carer can reopen (state is derived, nothing else desyncs). */}
                {animal.isCarer && record.status === 'recovered' && (
                  <Button
                    title="geri al"
                    size="sm"
                    variant="ghost"
                    onPress={() => handleReopen(record)}
                    style={styles.recoverButton}
                  />
                )}
              </Card>
            );
          })
        )}

        <LoadMoreButton
          remaining={animal.healthRecords.length - visibleRecords}
          onPress={() => setVisibleRecords(animal.healthRecords.length)}
        />

        <SectionHeader title="Sohbet" style={styles.sectionTop} />
        {/* The chat is the carers' room (owner decision, 2026-09-08):
            followers read it; the door in sits at the top of the section
            instead of a sticky bar (P8 review). */}
        {!matchReview && !animal.isCarer && (
          <Card variant="flat" padding="md" style={styles.doorCard}>
            <Text variant="caption" center style={styles.doorText}>
              Yorum yazmak bakıcılara açık. Yeni bir fotoğrafla sen de katıl.
            </Text>
            <Button
              title="bakım ver"
              size="sm"
              onPress={openCarePhotos}
              icon={<Icon name="camera" size={16} color={colors.textOnBrand} />}
              fullWidth
            />
          </Card>
        )}
        <LoadMoreButton
          remaining={commentTotal - comments.length}
          loading={loadingOlder}
          onPress={handleLoadOlderComments}
          label="Önceki yorumları yükle"
          style={styles.olderComments}
        />
        {comments.length === 0 ? (
          <Card variant="flat" style={styles.block}>
            <Text variant="caption">Henüz yorum yok. İlk yorumu sen yap.</Text>
          </Card>
        ) : (
          comments.map((comment) => (
            <View key={comment.id} style={styles.commentRow}>
              {isSelf(comment.user_id) ? (
                <Avatar uri={comment.avatar_url} name={comment.user_name} size={34} />
              ) : (
                <Pressable
                  onPress={() => openProfile(comment.user_id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${comment.user_name} profilini aç`}
                >
                  <Avatar uri={comment.avatar_url} name={comment.user_name} size={34} />
                </Pressable>
              )}
              <View style={styles.commentBody}>
                <View style={styles.commentHead}>
                  <Text
                    variant="bodyStrong"
                    numberOfLines={1}
                    style={styles.commentAuthor}
                    onPress={
                      isSelf(comment.user_id) ? undefined : () => openProfile(comment.user_id)
                    }
                    suppressHighlighting
                  >
                    {comment.user_name}
                  </Text>
                  <DemoChip visible={comment.user_is_demo === true} />
                  <Text variant="micro">{formatDate(comment.created_at)}</Text>
                  <ReportLink targetType="comment" targetId={comment.id} />
                </View>
                {comment.health_record_type && (
                  <Text variant="captionStrong" color="brand" style={styles.commentTag}>
                    {RECORD_TYPE_LABELS[comment.health_record_type]}:{' '}
                    {comment.health_record_description}
                  </Text>
                )}
                <Text variant="body">{comment.body}</Text>
              </View>
            </View>
          ))
        )}

        {/* The comment row (handoff): a cream input next to the gradient send
            button. It belongs to the chat and scrolls away with it (owner,
            2026-09-15): pinned under the page, it sat over every section
            above the chat. */}
        {!matchReview && animal.isCarer ? (
          <View>
            {openRecords.length > 0 && (
              <ScrollView
                horizontal
                style={styles.tagRow}
                contentContainerStyle={styles.tagRowContent}
                showsHorizontalScrollIndicator={false}
                // A nested scroll view answers taps by its own rule: without
                // this, the first tap on a chip only closes the keyboard,
                // and inside the page that also drops the keyboard inset
                // under the composer.
                keyboardShouldPersistTaps="handled"
              >
                <Chip
                  label="genel"
                  selected={!linkedRecord}
                  onPress={() => setLinkedRecord(null)}
                />
                {openRecords.map((record) => (
                  <Chip
                    key={record.id}
                    label={recordLabel(record)}
                    selected={linkedRecord?.id === record.id}
                    onPress={() => setLinkedRecord(record)}
                  />
                ))}
              </ScrollView>
            )}
            <View style={styles.composerRow}>
              <TextInput
                style={styles.composerInput}
                placeholder="Yorum yaz…"
                placeholderTextColor={colors.textSubtle}
                value={draft}
                onChangeText={setDraft}
                // iOS: the keyboard inset scrolls a multiline field's caret
                // rect to the keyboard's top edge, not the field
                // (RCTBaseTextInputView), which can leave the field's lower
                // padding and the send button under the keyboard. The end of
                // the scroll shows the whole row; the keyboardDidShow listener
                // above repeats it once the inset is in place. Android's
                // window resize keeps a focused field on screen by itself.
                onFocus={
                  Platform.OS === 'ios'
                    ? () => {
                        composerFocused.current = true;
                        scrollRef.current?.scrollToEnd({ animated: true });
                      }
                    : undefined
                }
                onBlur={
                  Platform.OS === 'ios'
                    ? () => {
                        composerFocused.current = false;
                      }
                    : undefined
                }
                multiline
              />
              <Button
                title="Gönder"
                size="sm"
                onPress={handleSend}
                disabled={sending || !draft.trim()}
                loading={sending}
              />
            </View>
          </View>
        ) : null}
      </Screen>

      {/* The match review's decision stays pinned under the page: it is the
          one thing the review is for (the composer above is not offered
          there). */}
      {matchReview ? (
        <View style={styles.reviewBar}>
          <Text variant="caption" center style={styles.reviewHint}>
            {!confirmReports
              ? 'Eklemek istediğin hayvan bu mu? Bakıcısı olmak için profilden "bakım ver".'
              : photoChecked
              ? 'Eklemek istediğin hayvan bu mu?'
              : 'Eklemek istediğin hayvan bu mu? Fotoğraf kontrol edilemedi; konumu güncellersin.'}
          </Text>
          <View style={styles.reviewRow}>
            <Button
              title="Geri dön"
              variant="secondary"
              onPress={() => navigation.goBack()}
              style={styles.reviewButton}
            />
            <Button
              title={confirmReports ? 'Bu o — eşleştir' : 'Bu o — profili aç'}
              onPress={() =>
                navigation.navigate('AddAnimal', {
                  confirmedAnimalId: animalId,
                  confirmedSighting: confirmReports,
                })
              }
              icon={<Icon name="check" size={18} color={colors.textOnBrand} />}
              style={styles.reviewButton}
            />
          </View>
        </View>
      ) : null}

      {/* A sheet is not a page (DESIGN §8): Android's hardware back closes
          it instead of leaving the animal profile. */}
      <Modal
        visible={recordModalVisible}
        transparent
        animationType="fade"
        // Hardware back is the OS's own way out and never locks, even mid-save
        // — the same rule ReportSheet and DeleteAccountModal follow, and the
        // same one web's twin follows. Closing does not cancel the request,
        // which is what already happens when the screen is backgrounded.
        onRequestClose={() => {
          dialogSession.current += 1;
          setRecordModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text variant="heading" style={styles.modalTitle}>
              Sağlık kaydı ekle
            </Text>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.chipRow}>
                {RECORD_TYPE_OPTIONS.map((option) => (
                  <Chip
                    key={option}
                    label={RECORD_TYPE_LABELS[option]}
                    selected={recordType === option}
                    onPress={() => {
                      setRecordType(option);
                      // The title list changes with the type; switching
                      // from illness to injury invalidates the old pick.
                      setRecordDescription(null);
                    }}
                  />
                ))}
              </View>
              <ChoiceField
                label={recordType === 'illness' ? 'HASTALIK' : 'YARALANMA'}
                options={conditionsFor(recordType)}
                value={recordDescription}
                onChange={setRecordDescription}
                otherPlaceholder="Ne olduğunu kısaca yaz"
                maxLength={200}
              />

              {/* People entering illness/injury records may be looking for
                  a vet; that's why the ad sits here. */}
              <AdBanner slot="vet_health_record" visible={recordModalVisible} near={animalPlace} />
            </ScrollView>
            <Button
              title="Kaydet"
              onPress={handleSaveRecord}
              loading={savingRecord}
              fullWidth
              style={styles.modalPrimary}
            />
            <Button
              title="Vazgeç"
              variant="ghost"
              onPress={() => {
                dialogSession.current += 1;
                setRecordModalVisible(false);
              }}
              disabled={savingRecord}
              fullWidth
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={vaccineModalVisible}
        transparent
        animationType="fade"
        // Hardware back is the OS's own way out and never locks, even mid-save
        // — the same rule ReportSheet and DeleteAccountModal follow, and the
        // same one web's twin follows. Closing does not cancel the request,
        // which is what already happens when the screen is backgrounded.
        onRequestClose={() => {
          dialogSession.current += 1;
          setVaccineModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text variant="heading" style={styles.modalTitle}>
              Aşı kaydı ekle
            </Text>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <ChoiceField
                label="aşı türü"
                options={VACCINE_TYPES}
                value={vaccineType}
                onChange={setVaccineType}
              />
              <Input
                label="not (isteğe bağlı)"
                value={vaccineNote}
                onChangeText={setVaccineNote}
                multiline
              />
              <AdBanner slot="vet_health_record" visible={vaccineModalVisible} near={animalPlace} />
            </ScrollView>
            <Button
              title="Kaydet"
              onPress={handleSaveVaccination}
              loading={savingVaccine}
              fullWidth
              style={styles.modalPrimary}
            />
            <Button
              title="Vazgeç"
              variant="ghost"
              onPress={() => {
                dialogSession.current += 1;
                setVaccineModalVisible(false);
              }}
              disabled={savingVaccine}
              fullWidth
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={!!logRecord}
        transparent
        animationType="slide"
        onRequestClose={() => setLogRecord(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text variant="heading" style={styles.modalTitle}>
              {logRecord ? recordLabel(logRecord) : ''}
            </Text>
            <ScrollView style={styles.modalScroll}>
              {logComments.length === 0 ? (
                <Text variant="caption">
                  Bu kayıtla ilgili henüz yorum yok. Sohbette bu kaydı seçerek yorum yapabilirsin.
                </Text>
              ) : (
                logComments.map((comment) => (
                  <View key={comment.id} style={styles.logRow}>
                    <View style={styles.commentHead}>
                      <Text
                        variant="bodyStrong"
                        numberOfLines={1}
                        style={styles.commentAuthor}
                        // A sheet is not a page (DESIGN §8): the record log
                        // closes on the way out, otherwise it would sit over
                        // the profile we just pushed.
                        onPress={
                          isSelf(comment.user_id)
                            ? undefined
                            : () => {
                                setLogRecord(null);
                                openProfile(comment.user_id);
                              }
                        }
                        suppressHighlighting
                      >
                        {comment.user_name}
                      </Text>
                      <DemoChip visible={comment.user_is_demo === true} />
                      <Text variant="micro">{formatDate(comment.created_at)}</Text>
                    </View>
                    <Text variant="body">{comment.body}</Text>
                  </View>
                ))
              )}
            </ScrollView>
            <Button
              title="Kapat"
              onPress={() => setLogRecord(null)}
              fullWidth
              style={styles.modalPrimary}
            />
          </View>
        </View>
      </Modal>
      <ReportSheet
        visible={reportOpen && !matchReview}
        onClose={() => setReportOpen(false)}
        targetType="animal"
        targetId={animal.id}
      />
      <AnimalBadgeLadderModal
        visible={ladderKey !== null}
        onClose={() => setLadderKey(null)}
        steps={animal.badgeLadder}
        focusKey={ladderKey}
        animalName={displayName}
      />
      <AnimalLocationSheet
        visible={locationOpen}
        onClose={() => setLocationOpen(false)}
        species={animal.species}
        breed={animal.breed}
        photoUrl={animal.cover_thumb_url}
        latitude={latitude}
        longitude={longitude}
        updatedAtLabel={formatDate(animal.location_updated_at)}
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  olderComments: { marginBottom: spacing.sm },
  flex: { flex: 1, backgroundColor: c.background },
  header: { marginTop: spacing.md, marginBottom: spacing.lg },
  headerText: { flex: 1 },
  // The pair sits right of the name while both fit; a long name pushes it
  // onto its own line underneath (wrap happens before shrink), so the name
  // is never squeezed to a few characters and the pair never breaks.
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: spacing.sm,
  },
  name: { flexShrink: 1 },
  nameWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  // Black, 17/23 and the NAME's weight (medium — owner, 2026-09-09): the
  // audience reads as a peer of the name, not as a footnote under it.
  counts: { flexShrink: 0, fontFamily: fonts.medium, fontSize: 17, lineHeight: 23, color: c.text },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  badgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: spacing.sm,
    paddingLeft: 2,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    // The first section adds its own top margin; xl here on top of that
    // left a hole under the pair once the photos moved above the header.
    marginBottom: spacing.xs,
  },
  actionButton: { flex: 1 },
  // Mirrors Button's `success` variant at size sm (pill, 1pt ring).
  carerState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.success,
    backgroundColor: c.surface,
  },
  carerStatePressed: { backgroundColor: c.successSoft },
  carerStateText: { color: c.onSuccess, fontSize: 13, lineHeight: 18 },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  // The "+N" veil on the last hero tile.
  photoMore: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoMoreText: { color: c.textOnBrand },
  photoTile: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: c.cream,
  },
  photoImage: { width: '100%', height: '100%' },
  likeBadge: {
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: c.overlay,
  },
  likeBadgeText: { color: c.textOnBrand },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.borderDashed,
  },
  // A carer's add tile (animalPhotoSlots): the placeholder frame with the
  // camera over its label.
  photoAdd: { gap: spacing.xs, paddingHorizontal: spacing.xs },
  photoAddPressed: { backgroundColor: c.brandTint },
  // With micro's 2.5 pt tracking "fotoğraf ekle" adds up to 99.4 pt
  // (Quicksand SemiBold advances), more than the 99 pt a 375 pt phone's tile
  // leaves it, so it would break onto a second line there. Web's tile tracks
  // 0.8 (0.08em of 10 px); at that it adds up to 77.3 pt, inside the 80 pt
  // even a 320 pt phone leaves.
  photoAddLabel: { letterSpacing: 0.8 },
  sectionTop: { marginTop: spacing.xl },
  seenAt: { marginTop: spacing.sm },
  carerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  carerName: { flex: 1 },
  miniMapWrapper: {
    height: 168,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.border,
  },
  miniMap: { flex: 1 },
  // The whole thumbnail is the button; the pill only says so.
  miniMapTap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: spacing.sm,
  },
  miniMapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: c.overlay,
  },
  miniMapHintText: { color: c.textOnBrand },
  block: { marginBottom: spacing.sm },
  emptyRecords: { marginTop: spacing.xs, marginBottom: spacing.sm },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  recordType: { flexShrink: 1 },
  recordDesc: { marginTop: spacing.xs },
  recoverButton: { marginTop: spacing.md },
  doorCard: { marginBottom: spacing.md },
  doorText: { marginBottom: spacing.md },
  // The header's report control: the conversation screen's round header
  // disc (owner, P8 item 4), so the header's right slot has one shape.
  headButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    // Without it iOS paints the Pressable's square bounds behind the round
    // disc (seen on the simulator); the conversation header's disc has it.
    overflow: 'hidden',
    ...shadow.float,
  },
  commentRow: { flexDirection: 'row', marginBottom: spacing.lg },
  commentBody: { flex: 1, marginLeft: spacing.md },
  commentHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  commentAuthor: { flexShrink: 1 },
  commentTag: { marginTop: 2, marginBottom: 2 },
  // The match review's pinned decision bar.
  reviewBar: {
    borderTopWidth: 1,
    borderTopColor: c.border,
    padding: spacing.md,
    backgroundColor: c.surface,
  },
  reviewHint: { marginBottom: spacing.sm },
  reviewRow: { flexDirection: 'row', gap: spacing.sm },
  reviewButton: { flex: 1 },
  tagRow: { marginBottom: spacing.sm },
  tagRowContent: { gap: spacing.sm, paddingRight: spacing.sm },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  // The comment row (handoff): a cream input next to the gradient send
  // button.
  composerInput: {
    flex: 1,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.input,
    paddingHorizontal: spacing.lg - 2,
    paddingVertical: spacing.md - 2,
    maxHeight: 100,
    fontFamily: fonts.medium,
    fontSize: 14.5,
    color: c.text,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '82%',
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.xl,
    ...shadow.modal,
  },
  modalTitle: { marginBottom: spacing.lg },
  modalScroll: { flexGrow: 0 },
  modalInput: {
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: radius.input,
    padding: spacing.md,
    minHeight: 84,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
    fontFamily: fonts.medium,
    fontSize: 14.5,
    color: c.text,
  },
  modalPrimary: { marginTop: spacing.lg },
  logRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
}));

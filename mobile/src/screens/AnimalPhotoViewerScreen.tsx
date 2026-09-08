import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Image, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimalPhoto, likeAnimalPhoto, unlikeAnimalPhoto } from '../api/animals';
import { Icon } from '../components/brand';
import { Text } from '../components/ui';
import { makeStyles, minTouch, spacing, useTheme } from '../theme';

/**
 * The full-screen photo viewer (P6 item 7): swipe between the animal's
 * photos, like each one once. Opened from the profile's grid with the
 * photos it already has — no second fetch; the profile reloads on focus,
 * so a like made here shows in the grid on the way back.
 */
export default function AnimalPhotoViewerScreen({ route, navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { animalId, index: initialIndex = 0 } = route.params as {
    animalId: number;
    photos: AnimalPhoto[];
    index?: number;
  };
  const [photos, setPhotos] = useState<AnimalPhoto[]>(route.params.photos ?? []);
  const [index, setIndex] = useState(initialIndex);
  const busyRef = useRef<Set<number>>(new Set());

  // why: FlatList's ViewToken type is not exported by RN 0.74's public
  // index; only `index` is read here.
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    const first = viewableItems[0];
    if (first && typeof first.index === 'number') setIndex(first.index);
  }).current;

  const toggleLike = useCallback(
    async (photo: AnimalPhoto) => {
      // One request per photo at a time: a double tap must not send a like
      // and an unlike that race and land in the wrong order.
      if (busyRef.current.has(photo.id)) return;
      busyRef.current.add(photo.id);
      const liked = !!photo.liked_by_me;
      // Optimistic: the heart flips at once; the server's count replaces
      // the guess (or the flip is undone on failure).
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photo.id
            ? { ...p, liked_by_me: !liked, like_count: (p.like_count ?? 0) + (liked ? -1 : 1) }
            : p
        )
      );
      try {
        const state = liked
          ? await unlikeAnimalPhoto(animalId, photo.id)
          : await likeAnimalPhoto(animalId, photo.id);
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photo.id ? { ...p, liked_by_me: state.liked, like_count: state.likeCount } : p
          )
        );
      } catch {
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photo.id ? { ...p, liked_by_me: liked, like_count: photo.like_count } : p
          )
        );
      } finally {
        busyRef.current.delete(photo.id);
      }
    },
    [animalId]
  );

  const current = photos[index];

  return (
    <View style={styles.root}>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(item) => String(item.id)}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <View style={{ width, height }}>
            <Image source={{ uri: item.url }} style={styles.photo} resizeMode="contain" />
          </View>
        )}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
          hitSlop={12}
          accessibilityLabel="Kapat"
        >
          <Icon name="close" size={22} color={colors.textOnBrand} />
        </Pressable>
        <Text variant="captionStrong" style={styles.counter}>
          {photos.length ? `${index + 1} / ${photos.length}` : ''}
        </Text>
        <View style={styles.iconButton} />
      </View>

      {current && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.meta}>
            {current.uploaded_by_name ? (
              <Text variant="caption" style={styles.metaText} numberOfLines={1}>
                {current.uploaded_by_name}
              </Text>
            ) : null}
            <Text variant="micro" style={styles.metaText}>
              {formatDate(current.created_at)}
            </Text>
          </View>
          <Pressable
            onPress={() => toggleLike(current)}
            style={styles.likeButton}
            accessibilityLabel={current.liked_by_me ? 'Beğeniyi geri al' : 'Beğen'}
            accessibilityState={{ selected: !!current.liked_by_me }}
          >
            <Icon
              name="heart"
              size={26}
              color={current.liked_by_me ? colors.brand : colors.textOnBrand}
            />
            <Text variant="bodyStrong" style={styles.likeCount}>
              {current.like_count ?? 0}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

const useStyles = makeStyles(({ colors: c }) => ({
  // why: the one hex outside src/theme — the viewer ground is pure black
  // in both themes (photos read best on it, the bars sit on the photo),
  // and no palette token means "black regardless of theme".
  root: { flex: 1, backgroundColor: '#000000' },
  photo: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  iconButton: {
    width: minTouch,
    height: minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: { color: c.textOnBrand },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  meta: { flex: 1, marginRight: spacing.md },
  metaText: { color: c.textOnBrand },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: minTouch,
    paddingHorizontal: spacing.md,
  },
  likeCount: { color: c.textOnBrand },
}));

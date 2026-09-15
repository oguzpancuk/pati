import React from 'react';
import { FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import type { ProfileAnimal } from '../../api/users';
import { CARER_GALLERY, carerCardWidth } from '../../carerGallery';
import AnimalAvatar from '../AnimalAvatar';
import DemoChip from '../DemoChip';
import { Card, SectionHeader, Text } from '../ui';
import { makeStyles, radius, spacing } from '../../theme';

// The strip runs to the screen's edges while its first card still lines up
// with the header above: both profiles render it inside Screen's gutter,
// which is the same 16pt.
const { gap: CARD_GAP, gutter: GUTTER } = CARER_GALLERY;

export type CarerGalleryProps = {
  title: string;
  animals: ProfileAnimal[];
  /** Every animal this person cares for, not just the loaded pages. */
  total: number;
  loadingMore?: boolean;
  loadFailed?: boolean;
  /** Asks for the next page; the gallery calls it as its end comes near. */
  onEndReached: () => void;
  onOpenAnimal: (animalId: number) => void;
  emptyText: string;
  style?: React.ComponentProps<typeof View>['style'];
};

/**
 * The animals someone cares for, as a horizontally scrolling gallery of
 * portrait cards. Carers and comments used to be two identical stacks of
 * rows (owner, 2026-09-11: "aynı görünüyorlar"); they are told apart by
 * SHAPE now — a gallery here, speech bubbles there.
 *
 * Every animal is reachable by scrolling alone (owner, 2026-09-15: no
 * "tümünü gör"): the next page is requested a screen-width before the end,
 * and a card at the tail says how many are still on their way.
 */
export default function CarerGallery({
  title,
  animals,
  total,
  loadingMore = false,
  loadFailed = false,
  onEndReached,
  onOpenAnimal,
  emptyText,
  style,
}: CarerGalleryProps) {
  const styles = useStyles();
  const remaining = total - animals.length;
  // The strip bleeds to the window's edges, so its width is the window's.
  const cardWidth = carerCardWidth(useWindowDimensions().width);
  const cardSize = { width: cardWidth };

  return (
    <View style={style}>
      <SectionHeader title={title} />
      {animals.length === 0 ? (
        <Card variant="flat">
          <Text variant="caption">{emptyText}</Text>
        </Card>
      ) : (
        <FlatList
          horizontal
          data={animals}
          keyExtractor={(animal) => String(animal.id)}
          showsHorizontalScrollIndicator={false}
          style={styles.list}
          contentContainerStyle={styles.strip}
          // Cards come to rest on the gutter, so the right edge always cuts
          // through the next one: the part that peeks is the cue to scroll.
          snapToInterval={cardWidth + CARD_GAP}
          // One screen-width ahead: a short first page that does not fill
          // the strip counts as "at the end" and asks for more straight away.
          onEndReachedThreshold={1}
          onEndReached={onEndReached}
          ItemSeparatorComponent={Gap}
          renderItem={({ item: animal }) => (
            <Pressable
              style={({ pressed }) => [styles.card, cardSize, pressed && styles.pressed]}
              onPress={() => onOpenAnimal(animal.id)}
              accessibilityRole="button"
            >
              <AnimalAvatar
                species={animal.species}
                breed={animal.breed}
                photoUrl={animal.cover_thumb_url}
                size={84}
              />
              <Text
                variant="captionStrong"
                color="text"
                center
                numberOfLines={1}
                style={styles.name}
              >
                {animal.name ?? (animal.species === 'cat' ? 'Kedi' : 'Köpek')}
              </Text>
              <Text variant="micro" center numberOfLines={1}>
                {animal.breed ?? 'türü belirtilmemiş'}
              </Text>
              <DemoChip visible={animal.is_demo === true} />
            </Pressable>
          )}
          ListFooterComponent={
            remaining > 0 ? (
              <TailCard
                width={cardWidth}
                remaining={remaining}
                loading={loadingMore}
                failed={loadFailed}
                onRetry={onEndReached}
              />
            ) : null
          }
        />
      )}
    </View>
  );
}

function Gap() {
  const styles = useStyles();
  return <View style={styles.gap} />;
}

/**
 * The animals not loaded yet, in the footprint of a card. It is not a "show
 * more": scrolling brings them. Only a failed page makes it a button, since
 * a strip too short to scroll would otherwise have no way to try again.
 */
function TailCard({
  width,
  remaining,
  loading,
  failed,
  onRetry,
}: {
  width: number;
  remaining: number;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const styles = useStyles();
  if (failed && !loading) {
    return (
      <Pressable
        style={({ pressed }) => [styles.card, styles.tail, { width }, pressed && styles.pressed]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={`Yüklenemedi, tekrar dene. ${remaining} hayvan daha var.`}
      >
        <Text variant="captionStrong" color="brand" center>
          tekrar dene
        </Text>
        <Text variant="micro" center>
          {`+${remaining}`}
        </Text>
      </Pressable>
    );
  }
  return (
    <View
      style={[styles.card, styles.tail, { width }]}
      accessible
      accessibilityLabel={loading ? 'Yükleniyor' : `${remaining} hayvan daha`}
    >
      <Text variant="captionStrong" color="text" center>
        {`+${remaining}`}
      </Text>
      {loading && (
        <Text variant="micro" center>
          yükleniyor…
        </Text>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  list: { marginHorizontal: -GUTTER },
  strip: { paddingHorizontal: GUTTER, paddingVertical: 2 },
  gap: { width: CARD_GAP },
  card: {
    alignItems: 'center',
    gap: 2,
  },
  pressed: { opacity: 0.7 },
  name: { marginTop: spacing.sm },
  tail: {
    marginLeft: CARD_GAP,
    justifyContent: 'center',
    height: 84,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    alignSelf: 'flex-start',
  },
}));

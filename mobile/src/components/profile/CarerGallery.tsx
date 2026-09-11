import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { ProfileAnimal } from '../../api/users';
import AnimalAvatar from '../AnimalAvatar';
import DemoChip from '../DemoChip';
import { Card, SectionHeader, Text } from '../ui';
import { makeStyles, radius, spacing } from '../../theme';

export type CarerGalleryProps = {
  title: string;
  animals: ProfileAnimal[];
  /** Every animal this person cares for, not just the loaded page. */
  total: number;
  loadingMore?: boolean;
  onLoadMore: () => void;
  onOpenAnimal: (animalId: number) => void;
  emptyText: string;
  style?: React.ComponentProps<typeof View>['style'];
};

/**
 * The animals someone cares for, as a horizontally scrolling gallery of
 * portrait cards. Carers and comments used to be two identical stacks of
 * rows (owner, 2026-09-11: "aynı görünüyorlar"); they are told apart by
 * SHAPE now — a gallery here, speech bubbles there.
 */
export default function CarerGallery({
  title,
  animals,
  total,
  loadingMore = false,
  onLoadMore,
  onOpenAnimal,
  emptyText,
  style,
}: CarerGalleryProps) {
  const styles = useStyles();
  const remaining = total - animals.length;

  return (
    <View style={style}>
      <SectionHeader title={title} />
      {animals.length === 0 ? (
        <Card variant="flat">
          <Text variant="caption">{emptyText}</Text>
        </Card>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
        >
          {animals.map((animal) => (
            <Pressable
              key={animal.id}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
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
          ))}
          {/* The gallery's own "see all": one more card that loads the next
              page, so the affordance stays inside the strip. */}
          {remaining > 0 && (
            <Pressable
              style={({ pressed }) => [styles.card, styles.moreCard, pressed && styles.pressed]}
              onPress={onLoadMore}
              disabled={loadingMore}
              accessibilityRole="button"
            >
              <Text variant="captionStrong" color="brand" center>
                {loadingMore ? 'yükleniyor…' : 'tümünü gör'}
              </Text>
              <Text variant="micro" center>
                {`+${remaining}`}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  strip: { gap: spacing.md, paddingRight: spacing.lg, paddingVertical: 2 },
  card: {
    width: 104,
    alignItems: 'center',
    gap: 2,
  },
  pressed: { opacity: 0.7 },
  name: { marginTop: spacing.sm },
  moreCard: {
    justifyContent: 'center',
    height: 84,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    alignSelf: 'flex-start',
  },
}));

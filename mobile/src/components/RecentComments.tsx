import React from 'react';
import { Pressable, View } from 'react-native';
import type { UserComment } from '../api/users';
import AnimalAvatar from './AnimalAvatar';
import Card from './ui/Card';
import SectionHeader from './ui/SectionHeader';
import Text from './ui/Text';
import { makeStyles, radius, spacing } from '../theme';

interface Props {
  comments: UserComment[];
  total: number;
  title: string;
  emptyText: string;
  onSeeAll: () => void;
  onOpenAnimal: (animalId: number) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * The recent-comments summary on the profile, as SPEECH BUBBLES: the
 * animal's small face on the left, the comment inside the bubble, the animal
 * and the date as its caption. Carers and comments used to be two identical
 * stacks of rows (owner, 2026-09-11); the shape is what tells them apart now
 * — a gallery there, bubbles here. "see all" opens the full list.
 */
export default function RecentComments({
  comments,
  total,
  title,
  emptyText,
  onSeeAll,
  onOpenAnimal,
}: Props) {
  const styles = useStyles();
  return (
    <View>
      <SectionHeader
        title={title}
        actionLabel={total > 0 ? `Tümünü gör (${total})` : undefined}
        onAction={total > 0 ? onSeeAll : undefined}
      />

      {comments.length === 0 ? (
        <Card variant="flat" style={styles.empty}>
          <Text variant="caption">{emptyText}</Text>
        </Card>
      ) : (
        comments.map((comment) => (
          <Pressable
            key={comment.id}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => onOpenAnimal(comment.animal_id)}
            accessibilityRole="button"
          >
            <AnimalAvatar
              species={comment.animal_species}
              breed={comment.animal_breed}
              photoUrl={comment.animal_thumb_url}
              size={32}
            />
            <View style={styles.body}>
              <View style={styles.bubble}>
                <Text variant="caption" color="textBody" numberOfLines={3}>
                  {comment.body}
                </Text>
              </View>
              <Text variant="micro" numberOfLines={1} style={styles.caption}>
                {`${
                  comment.animal_name ?? (comment.animal_species === 'cat' ? 'Kedi' : 'Köpek')
                } · ${formatDate(comment.created_at)}`}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  empty: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  pressed: { opacity: 0.8 },
  body: { flex: 1, marginLeft: spacing.sm },
  // The square corner nearest the avatar is the bubble's tail; the rest is
  // fully rounded, like the chat bubbles in a conversation.
  bubble: {
    alignSelf: 'flex-start',
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
    borderTopLeftRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  caption: { marginTop: spacing.xs, marginLeft: spacing.xs },
}));

import React from 'react';
import { View } from 'react-native';
import type { UserComment } from '../api/users';
import AnimalAvatar from './AnimalAvatar';
import Card from './ui/Card';
import SectionHeader from './ui/SectionHeader';
import Text from './ui/Text';
import { makeStyles, spacing } from '../theme';

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

/** The recent-comments summary on the profile; "see all" opens the full list. */
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
          <Card
            key={comment.id}
            variant="flat"
            padding="md"
            style={styles.row}
            onPress={() => onOpenAnimal(comment.animal_id)}
          >
            <AnimalAvatar species={comment.animal_species} breed={comment.animal_breed} size={36} />
            <View style={styles.body}>
              <View style={styles.metaRow}>
                <Text variant="bodyStrong" style={styles.animalName} numberOfLines={1}>
                  {comment.animal_name ?? (comment.animal_species === 'cat' ? 'Kedi' : 'Köpek')}
                </Text>
                <Text variant="micro" style={styles.date}>
                  {formatDate(comment.created_at)}
                </Text>
              </View>
              <Text variant="caption" numberOfLines={2} style={styles.text}>
                {comment.body}
              </Text>
            </View>
          </Card>
        ))
      )}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  empty: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', marginBottom: spacing.sm },
  body: { flex: 1, marginLeft: spacing.md },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  animalName: { flexShrink: 1 },
  date: { marginLeft: spacing.sm },
  text: { marginTop: 2 },
}));

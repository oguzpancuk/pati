import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { UserComment } from '../api/users';
import AnimalAvatar from './AnimalAvatar';

interface Props {
  comments: UserComment[];
  total: number;
  title: string;
  emptyText: string;
  onSeeAll: () => void;
  onOpenAnimal: (animalId: number) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

/** Profilde gösterilen son yorumlar özeti; "Tümünü gör" tam listeye götürür. */
export default function RecentComments({
  comments,
  total,
  title,
  emptyText,
  onSeeAll,
  onOpenAnimal,
}: Props) {
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {total > 0 && (
          <TouchableOpacity onPress={onSeeAll}>
            <Text style={styles.link}>Tümünü gör ({total})</Text>
          </TouchableOpacity>
        )}
      </View>

      {comments.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        comments.map((comment) => (
          <TouchableOpacity
            key={comment.id}
            style={styles.row}
            onPress={() => onOpenAnimal(comment.animal_id)}
          >
            <AnimalAvatar
              species={comment.animal_species}
              photoUrl={comment.animal_photo_url}
              size={36}
            />
            <View style={styles.body}>
              <View style={styles.metaRow}>
                <Text style={styles.animalName}>
                  {comment.animal_name ?? (comment.animal_species === 'cat' ? 'Kedi' : 'Köpek')}
                </Text>
                <Text style={styles.date}>{formatDate(comment.created_at)}</Text>
              </View>
              <Text style={styles.text} numberOfLines={2}>
                {comment.body}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginTop: 8, marginBottom: 8 },
  link: { color: '#2e7d32', fontWeight: '600' },
  empty: { color: '#555', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  body: { flex: 1, marginLeft: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  animalName: { fontWeight: '600', flexShrink: 1 },
  date: { color: '#888', fontSize: 11, marginLeft: 8 },
  text: { color: '#444', marginTop: 2, fontSize: 13, lineHeight: 18 },
});

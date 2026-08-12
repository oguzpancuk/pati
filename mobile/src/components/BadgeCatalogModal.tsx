import React from 'react';
import { Button, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { UserBadges } from '../api/users';
import {
  BADGE_CATEGORIES,
  BADGE_LABELS,
  CATEGORY_LABELS,
  TIER_EMOJI,
  TIER_ORDER,
  TIER_REQUIREMENT_DAYS,
  tierDescription,
} from '../badges';

interface Props {
  visible: boolean;
  onClose: () => void;
  // Kullanıcının mevcut rozetleri verilirse kazanılanlar işaretlenir; verilmezse
  // katalog salt bilgilendirme amaçlı gösterilir.
  badges?: UserBadges;
}

export default function BadgeCatalogModal({ visible, onClose, badges }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Rozetler</Text>
          <Text style={styles.subtitle}>
            Her kategoride üst üste kaç gün aksiyon aldığınıza göre kazanılır. Bir kez
            kazanılan rozet kalıcıdır.
          </Text>

          <ScrollView style={styles.scroll}>
            {BADGE_CATEGORIES.map((category) => {
              const earnedTier = badges?.[category]?.tier ?? null;
              const earnedIndex = earnedTier ? TIER_ORDER.indexOf(earnedTier) : -1;

              return (
                <View key={category} style={styles.categoryBlock}>
                  <Text style={styles.categoryTitle}>{CATEGORY_LABELS[category]}</Text>
                  {TIER_ORDER.map((tier, index) => {
                    const earned = index <= earnedIndex;
                    return (
                      <View key={tier} style={[styles.row, earned && styles.rowEarned]}>
                        <Text style={styles.emoji}>{TIER_EMOJI[tier]}</Text>
                        <View style={styles.rowText}>
                          <Text style={styles.badgeName}>
                            {BADGE_LABELS[category][tier]}
                            {earned ? ' ✓' : ''}
                          </Text>
                          <Text style={styles.badgeDesc}>{tierDescription(category, tier)}</Text>
                        </View>
                        <Text style={styles.days}>
                          {TIER_REQUIREMENT_DAYS[tier]}
                          {'\n'}gün
                        </Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>

          <Button title="Kapat" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#666', textAlign: 'center', marginTop: 6, marginBottom: 12, fontSize: 12 },
  scroll: { marginBottom: 12 },
  categoryBlock: { marginBottom: 16 },
  categoryTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 6,
  },
  rowEarned: { backgroundColor: '#e8f5e9', borderColor: '#2e7d32' },
  emoji: { fontSize: 24, marginRight: 10 },
  rowText: { flex: 1 },
  badgeName: { fontWeight: '600' },
  badgeDesc: { color: '#666', fontSize: 12, marginTop: 2 },
  days: { color: '#888', fontSize: 11, textAlign: 'center' },
});

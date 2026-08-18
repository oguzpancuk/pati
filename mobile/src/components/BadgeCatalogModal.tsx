import React, { useMemo, useState } from 'react';
import { Button, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Badge } from '../api/users';
import {
  badgeGroup,
  badgeProgressText,
  badgeTitle,
  GROUP_DESCRIPTIONS,
  GROUP_LABELS,
  sortBadges,
  TIER_EMOJI,
  TIER_LABELS,
  TIER_ORDER,
  TIER_POINTS,
  type BadgeGroup,
} from '../badges';

interface Props {
  visible: boolean;
  onClose: () => void;
  badges: Badge[];
  // Seçim modu yalnızca kendi profilinde açılır; başkasının profilinde katalog
  // salt görüntüleme olarak çalışır.
  selectable?: boolean;
  featuredKeys?: string[];
  maxFeatured?: number;
  onSaveFeatured?: (keys: string[]) => Promise<void> | void;
}

const GROUP_ORDER: BadgeGroup[] = ['streak', 'breed', 'count'];

export default function BadgeCatalogModal({
  visible,
  onClose,
  badges,
  selectable = false,
  featuredKeys = [],
  maxFeatured = 3,
  onSaveFeatured,
}: Props) {
  const [selection, setSelection] = useState<string[]>(featuredKeys);
  const [saving, setSaving] = useState(false);

  // Modal her açıldığında mevcut seçimle başlasın.
  const featuredSignature = featuredKeys.join('|');
  const initialSelection = useMemo(() => featuredKeys, [featuredSignature]);
  React.useEffect(() => {
    setSelection(initialSelection);
  }, [initialSelection, visible]);

  const grouped = useMemo(() => {
    const map: Record<BadgeGroup, Badge[]> = { streak: [], breed: [], count: [] };
    for (const badge of badges) map[badgeGroup(badge)].push(badge);
    for (const key of GROUP_ORDER) map[key] = sortBadges(map[key]);
    return map;
  }, [badges]);

  const earnedCount = badges.filter((b) => b.tier).length;

  function toggle(badge: Badge) {
    if (!badge.tier) return;
    setSelection((prev) => {
      if (prev.includes(badge.key)) return prev.filter((k) => k !== badge.key);
      if (prev.length >= maxFeatured) return prev;
      return [...prev, badge.key];
    });
  }

  async function handleSave() {
    if (!onSaveFeatured) return;
    setSaving(true);
    try {
      await onSaveFeatured(selection);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Rozetler</Text>
          <Text style={styles.subtitle}>
            {selectable
              ? `Profilinizde gösterilecek en fazla ${maxFeatured} rozet seçin (${selection.length}/${maxFeatured}).`
              : `${earnedCount} rozet kazanıldı. Kademeler: ${TIER_ORDER.map(
                  (t) => `${TIER_EMOJI[t]} ${TIER_LABELS[t]} ${TIER_POINTS[t]}p`
                ).join(' · ')}`}
          </Text>

          <ScrollView style={styles.scroll}>
            {GROUP_ORDER.map((group) => (
              <View key={group} style={styles.groupBlock}>
                <Text style={styles.groupTitle}>{GROUP_LABELS[group]}</Text>
                <Text style={styles.groupDesc}>{GROUP_DESCRIPTIONS[group]}</Text>
                {grouped[group].length === 0 ? (
                  <Text style={styles.emptyText}>
                    Bu kategoride henüz bir rozet yolunda değilsiniz.
                  </Text>
                ) : (
                  grouped[group].map((badge) => {
                    const selected = selection.includes(badge.key);
                    const disabled =
                      selectable && !badge.tier
                        ? true
                        : selectable && !selected && selection.length >= maxFeatured;
                    return (
                      <TouchableOpacity
                        key={badge.key}
                        style={[
                          styles.row,
                          badge.tier ? styles.rowEarned : styles.rowLocked,
                          selected && styles.rowSelected,
                        ]}
                        onPress={() => toggle(badge)}
                        disabled={!selectable || disabled}
                      >
                        <Text style={styles.emoji}>
                          {badge.tier ? TIER_EMOJI[badge.tier] : '🔒'}
                        </Text>
                        <View style={styles.rowText}>
                          <Text style={styles.badgeName}>
                            {badgeTitle(badge)}
                            {selected ? ' ✓' : ''}
                          </Text>
                          <Text style={styles.badgeDesc}>{badgeProgressText(badge)}</Text>
                        </View>
                        <Text style={styles.points}>{badge.points}p</Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            ))}
          </ScrollView>

          {selectable && onSaveFeatured ? (
            <>
              <View style={styles.saveButton}>
                <Button title={saving ? 'Kaydediliyor...' : 'Kaydet'} onPress={handleSave} disabled={saving} />
              </View>
              <Button title="Vazgeç" color="#c62828" onPress={onClose} disabled={saving} />
            </>
          ) : (
            <Button title="Kapat" onPress={onClose} />
          )}
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
  groupBlock: { marginBottom: 16 },
  groupTitle: { fontSize: 16, fontWeight: '600' },
  groupDesc: { color: '#888', fontSize: 11, marginBottom: 8 },
  emptyText: { color: '#888', fontSize: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
  rowEarned: { backgroundColor: '#fff', borderColor: '#ddd' },
  rowLocked: { backgroundColor: '#fafafa', borderColor: '#eee', opacity: 0.7 },
  rowSelected: { backgroundColor: '#e8f5e9', borderColor: '#2e7d32' },
  emoji: { fontSize: 24, marginRight: 10 },
  rowText: { flex: 1 },
  badgeName: { fontWeight: '600' },
  badgeDesc: { color: '#666', fontSize: 12, marginTop: 2 },
  points: { color: '#888', fontSize: 11 },
  saveButton: { marginBottom: 10 },
});

import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import type { Badge } from '../api/users';
import {
  badgeGroup,
  badgeProgressText,
  badgeTitle,
  GROUP_DESCRIPTIONS,
  GROUP_LABELS,
  sortBadges,
  TIER_LABELS,
  TIER_ORDER,
  TIER_POINTS,
  tierLadderText,
  withCatalogPlaceholders,
  type BadgeGroup,
} from '../badges';
import Button from './ui/Button';
import Text from './ui/Text';
import Icon from './brand/Icon';
import { BadgeSymbol } from './badges';
import { makeStyles, radius, spacing, useTheme } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  badges: Badge[];
  // Selection mode opens only on your own profile; on someone else's the
  // catalog is read-only.
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
  const styles = useStyles();
  const { colors } = useTheme();
  const [selection, setSelection] = useState<string[]>(featuredKeys);
  const [saving, setSaving] = useState(false);

  // Start from the current selection every time the modal opens.
  const featuredSignature = featuredKeys.join('|');
  const initialSelection = useMemo(() => featuredKeys, [featuredSignature]);
  React.useEffect(() => {
    setSelection(initialSelection);
  }, [initialSelection, visible]);

  const grouped = useMemo(() => {
    const map: Record<BadgeGroup, Badge[]> = {
      streak: [],
      breed: [],
      count: [],
    };
    // The catalog shows every obtainable badge, so breed badges the server
    // didn't send (no progress yet) appear as locked placeholders.
    for (const badge of withCatalogPlaceholders(badges)) map[badgeGroup(badge)].push(badge);
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
          <Text variant="title" center>
            Rozetler
          </Text>
          <Text variant="caption" center style={styles.subtitle}>
            {selectable
              ? `Profilinde gösterilecek en fazla ${maxFeatured} rozet seç (${selection.length}/${maxFeatured}).`
              : `${earnedCount} rozet kazanıldı. Kademeler: ${TIER_ORDER.map(
                  (t) => `${TIER_LABELS[t]} ${TIER_POINTS[t]}p`
                ).join(' · ')}`}
          </Text>

          <ScrollView style={styles.scroll}>
            {GROUP_ORDER.map((group) => (
              <View key={group} style={styles.groupBlock}>
                <Text variant="subheading">{GROUP_LABELS[group]}</Text>
                <Text variant="caption" style={styles.groupDesc}>
                  {GROUP_DESCRIPTIONS[group]}
                </Text>
                {grouped[group].length === 0 ? (
                  <Text variant="caption">Bu kategoride henüz bir rozet yolunda değilsin.</Text>
                ) : (
                  grouped[group].map((badge) => {
                    const selected = selection.includes(badge.key);
                    const disabled =
                      selectable && !badge.tier
                        ? true
                        : selectable && !selected && selection.length >= maxFeatured;
                    return (
                      <Pressable
                        key={badge.key}
                        style={[
                          styles.row,
                          badge.tier ? styles.rowEarned : styles.rowLocked,
                          selected && styles.rowSelected,
                        ]}
                        onPress={() => toggle(badge)}
                        disabled={!selectable || disabled}
                      >
                        <View style={styles.symbol}>
                          <BadgeSymbol symbol={badge.symbol} tier={badge.tier} size={36} />
                        </View>
                        <View style={styles.rowText}>
                          <Text variant="bodyStrong">{badgeTitle(badge)}</Text>
                          <Text variant="caption">{badgeProgressText(badge)}</Text>
                          {/* Every tier's threshold, so the whole ladder is
                              browsable before any of it is earned. */}
                          <Text variant="micro" color="textSubtle" style={styles.rowLadder}>
                            {tierLadderText(badge)}
                          </Text>
                        </View>
                        {selected ? (
                          <Icon name="check" size={18} color={colors.brand} strokeWidth={2.4} />
                        ) : (
                          <Text variant="micro">{badge.points}P</Text>
                        )}
                      </Pressable>
                    );
                  })
                )}
              </View>
            ))}
          </ScrollView>

          {selectable && onSaveFeatured ? (
            <>
              <Button title="Kaydet" onPress={handleSave} loading={saving} fullWidth />
              <Button
                title="Vazgeç"
                variant="ghost"
                onPress={onClose}
                disabled={saving}
                fullWidth
                style={styles.secondary}
              />
            </>
          ) : (
            <Button title="Kapat" onPress={onClose} fullWidth />
          )}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  backdrop: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '86%',
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.modal,
  },
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.lg },
  scroll: { marginBottom: spacing.lg },
  groupBlock: { marginBottom: spacing.xl },
  groupDesc: { marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  rowEarned: { backgroundColor: c.surface, borderColor: c.border },
  rowLocked: {
    backgroundColor: c.surfaceAlt,
    borderColor: c.border,
    opacity: 0.65,
  },
  rowSelected: { backgroundColor: c.brandTint, borderColor: c.brand },
  symbol: { marginRight: spacing.md },
  rowText: { flex: 1, marginRight: spacing.sm },
  rowLadder: { marginTop: 2 },
  secondary: { marginTop: spacing.xs },
}));

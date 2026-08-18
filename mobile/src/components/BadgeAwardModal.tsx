import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import type { BadgeAward } from '../api/users';
import { TIER_EMOJI, TIER_LABELS } from '../badges';
import Button from './ui/Button';
import Text from './ui/Text';
import { makeStyles, radius, spacing } from '../theme';

interface Props {
  award: BadgeAward | null;
  remaining: number;
  onDismiss: () => void;
}

function rankLine(award: BadgeAward): string {
  if (award.rankAfter === null) return 'Sıralama hesaplanıyor';
  // İlk rozette karşılaştırılacak bir önceki sıralama yok.
  if (award.rankBefore === null) return `${award.rankAfter}. sıradasın`;
  if (award.rankBefore === award.rankAfter) return `${award.rankAfter}. sırada kaldın`;
  const climbed = award.rankBefore - award.rankAfter;
  return climbed > 0
    ? `${award.rankBefore}. → ${award.rankAfter}. · ${climbed} sıra yükseldin`
    : `${award.rankBefore}. → ${award.rankAfter}.`;
}

export default function BadgeAwardModal({ award, remaining, onDismiss }: Props) {
  const styles = useStyles();
  if (!award) return null;

  const leveledUp =
    award.levelBefore !== null && award.levelAfter !== null && award.levelAfter > award.levelBefore;
  const climbed =
    award.rankBefore !== null && award.rankAfter !== null && award.rankAfter < award.rankBefore;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text variant="micro" color="brand">
            YENİ ROZET KAZANDIN!
          </Text>

          <View style={styles.medallion}>
            <Text style={styles.medallionEmoji}>{TIER_EMOJI[award.tier]}</Text>
          </View>

          <Text variant="title" center style={styles.title}>
            {TIER_LABELS[award.tier]} {award.label}
          </Text>
          <Text variant="bodyStrong" color="brand">
            +{award.pointsAwarded} puan
          </Text>

          {leveledUp && (
            <View style={styles.levelUp}>
              <Text variant="captionStrong" color="onWarning">
                Seviye atladın: {award.levelBefore} → {award.levelAfter}
              </Text>
            </View>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text variant="micro">SIRALAMA</Text>
              <Text
                variant="captionStrong"
                center
                color={climbed ? 'success' : 'text'}
                style={styles.statValue}
              >
                {rankLine(award)}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statBox}>
              <Text variant="micro">TOPLAM PUAN</Text>
              <Text variant="captionStrong" center color="text" style={styles.statValue}>
                {award.pointsBefore !== null && award.pointsBefore !== award.pointsAfter
                  ? `${award.pointsBefore} → ${award.pointsAfter}`
                  : `${award.pointsAfter ?? 0}`}
              </Text>
            </View>
          </View>

          <Button
            title={remaining > 0 ? `Sıradaki rozet (${remaining})` : 'Harika!'}
            onPress={onDismiss}
            fullWidth
            size="lg"
            style={styles.button}
          />
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
    maxWidth: 380,
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.modal,
  },
  medallion: {
    width: 100,
    height: 100,
    borderRadius: radius.pill,
    backgroundColor: c.brandTint,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  medallionEmoji: { fontSize: 52, lineHeight: 62 },
  title: { marginTop: spacing.lg, marginBottom: spacing.xs },
  levelUp: {
    backgroundColor: c.warningSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginTop: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: spacing.xl,
    width: '100%',
  },
  statBox: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.sm },
  divider: { width: StyleSheet.hairlineWidth, backgroundColor: c.border },
  statValue: { marginTop: spacing.xs },
  button: { marginTop: spacing.xl },
}));

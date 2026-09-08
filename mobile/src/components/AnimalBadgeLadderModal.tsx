import React from 'react';
import { Modal, ScrollView, View } from 'react-native';
import {
  stepLadderText,
  stepNextText,
  stepProgressText,
  stepTierText,
  type AnimalBadgeStep,
} from '../animalBadges';
import { TIER_LABELS, TIER_ORDER } from '../badges';
import Button from './ui/Button';
import Text from './ui/Text';
import { BadgeSymbol } from './badges';
import { makeStyles, radius, spacing } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The profile's `badgeLadder`: every key, earned or not. */
  steps: AnimalBadgeStep[];
  /** The chip that opened the modal; its row is highlighted. */
  focusKey?: string | null;
  animalName: string;
}

/**
 * The animal's badge ladder (P7 item 3): the same bronze→diamond ladder
 * as the human catalog (BadgeCatalogModal), read-only — an animal earns
 * its badges from what the neighbourhood does, nobody selects them. Every
 * key is listed so the whole ladder is browsable before any of it is
 * earned, with the count, the distance to the next tier and the
 * thresholds.
 */
export default function AnimalBadgeLadderModal({
  visible,
  onClose,
  steps,
  focusKey,
  animalName,
}: Props) {
  const styles = useStyles();
  const earned = steps.filter((s) => s.tier).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text variant="title" center>
            Rozetler
          </Text>
          <Text variant="caption" center style={styles.subtitle}>
            {`${animalName} ${earned} rozet kazandı. Kademeler: ${TIER_ORDER.map(
              (t) => TIER_LABELS[t]
            ).join(' · ')} — her biri sayıyla yükselir.`}
          </Text>

          <ScrollView style={styles.scroll}>
            {steps.map((step) => {
              const next = stepNextText(step);
              return (
                <View
                  key={step.key}
                  style={[
                    styles.row,
                    step.tier ? styles.rowEarned : styles.rowLocked,
                    step.key === focusKey && styles.rowFocused,
                  ]}
                >
                  <View style={styles.symbol}>
                    <BadgeSymbol symbol={step.symbol} tier={step.tier} size={36} />
                  </View>
                  <View style={styles.rowText}>
                    <Text variant="bodyStrong">{step.label}</Text>
                    <Text variant="caption">
                      {stepTierText(step)} · {stepProgressText(step)}
                    </Text>
                    {next ? (
                      <Text variant="caption" color="brand">
                        {next}
                      </Text>
                    ) : null}
                    {/* Every tier's threshold, so the whole ladder is
                        browsable before any of it is earned. */}
                    <Text variant="micro" color="textSubtle" style={styles.rowLadder}>
                      {stepLadderText(step)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <Button title="Kapat" onPress={onClose} fullWidth />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  rowEarned: { backgroundColor: c.surface, borderColor: c.border },
  rowLocked: { backgroundColor: c.surfaceAlt, borderColor: c.border, opacity: 0.65 },
  rowFocused: { backgroundColor: c.brandTint, borderColor: c.brand, opacity: 1 },
  symbol: { marginRight: spacing.md },
  rowText: { flex: 1, marginRight: spacing.sm },
  rowLadder: { marginTop: 2 },
}));

import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { BadgeAward } from '../api/users';
import { TIER_EMOJI, TIER_LABELS } from '../badges';

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
  if (!award) return null;

  const leveledUp =
    award.levelBefore !== null && award.levelAfter !== null && award.levelAfter > award.levelBefore;
  const climbed =
    award.rankBefore !== null && award.rankAfter !== null && award.rankAfter < award.rankBefore;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>Yeni rozet kazandın!</Text>

          <View style={styles.medallion}>
            <Text style={styles.medallionEmoji}>{TIER_EMOJI[award.tier]}</Text>
          </View>

          <Text style={styles.title}>
            {TIER_LABELS[award.tier]} {award.label}
          </Text>
          <Text style={styles.points}>+{award.pointsAwarded} puan</Text>

          {leveledUp && (
            <View style={styles.levelUp}>
              <Text style={styles.levelUpText}>
                Seviye atladın: {award.levelBefore} → {award.levelAfter}
              </Text>
            </View>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Sıralama</Text>
              <Text style={[styles.statValue, climbed && styles.statValueUp]}>
                {rankLine(award)}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Toplam puan</Text>
              <Text style={styles.statValue}>
                {award.pointsBefore !== null && award.pointsBefore !== award.pointsAfter
                  ? `${award.pointsBefore} → ${award.pointsAfter}`
                  : `${award.pointsAfter ?? 0}`}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.button} onPress={onDismiss}>
            <Text style={styles.buttonText}>
              {remaining > 0 ? `Sıradaki rozet (${remaining})` : 'Harika!'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  kicker: {
    color: '#2e7d32',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  medallion: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  medallionEmoji: { fontSize: 52 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 14,
    textAlign: 'center',
  },
  points: { fontSize: 15, color: '#2e7d32', fontWeight: '600', marginTop: 4 },
  levelUp: {
    backgroundColor: '#fff3e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
  },
  levelUpText: { color: '#ef6c00', fontWeight: '700', fontSize: 13 },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 20,
    marginBottom: 4,
    width: '100%',
  },
  statBox: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  divider: { width: 1, backgroundColor: '#eee' },
  statLabel: { color: '#888', fontSize: 11, marginBottom: 4 },
  statValue: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  statValueUp: { color: '#2e7d32' },
  button: {
    backgroundColor: '#2e7d32',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 22,
    alignSelf: 'stretch',
  },
  buttonText: { color: '#fff', fontWeight: '700', textAlign: 'center', fontSize: 15 },
});

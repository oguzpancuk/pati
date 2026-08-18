import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Button from './Button';
import { spacing } from '../../theme';

type Props = {
  /** Henüz yüklenmemiş kayıt sayısı; 0 ise buton hiç çizilmez. */
  remaining: number;
  loading?: boolean;
  onPress: () => void;
  /** Varsayılan "Daha fazla göster"; sohbette "Önceki yorumları yükle" gibi. */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Sayfalı listelerin ortak "devamını getir" düğmesi. Profil ekranları
 * ScrollView olduğu için sonsuz kaydırma yerine açık bir düğme kullanıyoruz:
 * kullanıcı sayfanın nerede bittiğini görsün, "kaç tane daha var" bilgisini
 * alsın. FlatList'li tam liste ekranları ise onEndReached ile kendisi yüklüyor.
 */
export default function LoadMoreButton({ remaining, loading, onPress, label, style }: Props) {
  if (remaining <= 0) return null;
  return (
    <Button
      title={`${label ?? 'Daha fazla göster'} (${remaining})`}
      variant="ghost"
      size="sm"
      loading={loading}
      onPress={onPress}
      fullWidth
      style={[{ marginTop: spacing.xs }, style]}
    />
  );
}

import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import CartoonAvatar from './CartoonAvatar';
import Button from '../ui/Button';
import Chip from '../ui/Chip';
import Text from '../ui/Text';
import { AVATAR_VARIANTS, variantFromValue, type AvatarVariant } from '../../avatars';
import { makeStyles, radius, spacing } from '../../theme';

type Props = {
  visible: boolean;
  /** The user's current `avatar_url`; for marking the selected avatar. */
  currentValue: string | null;
  onClose: () => void;
  onSelect: (key: string) => Promise<void> | void;
  /** When the "upload photo" button is pressed; the modal closes. */
  onUploadPhoto: () => void;
  saving?: boolean;
};

const GROUPS = [
  { key: 'female' as const, label: 'Kadın' },
  { key: 'male' as const, label: 'Erkek' },
];

/**
 * Built-in avatar selection.
 *
 * Instead of assigning a random face to users without a photo, we let them
 * choose: a randomly assigned face doesn't represent the person and can be
 * off-putting when unchangeable. The photo-upload path stays open from the
 * same screen.
 */
export default function AvatarPickerModal({
  visible,
  currentValue,
  onClose,
  onSelect,
  onUploadPhoto,
  saving = false,
}: Props) {
  const styles = useStyles();
  const current = variantFromValue(currentValue);
  const [group, setGroup] = useState<AvatarVariant['group']>(current?.group ?? 'female');
  const shown = AVATAR_VARIANTS.filter((v) => v.group === group);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text variant="title" center>
            Avatarını seç
          </Text>
          <Text variant="caption" center style={styles.subtitle}>
            İstersen kendi fotoğrafını da yükleyebilirsin.
          </Text>

          <View style={styles.groupRow}>
            {GROUPS.map((g) => (
              <Chip
                key={g.key}
                label={g.label}
                selected={group === g.key}
                onPress={() => setGroup(g.key)}
              />
            ))}
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
            {shown.map((variant) => {
              const selected = current?.key === variant.key;
              return (
                <Pressable
                  key={variant.key}
                  onPress={() => onSelect(variant.key)}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Avatar ${variant.key}`}
                  style={[styles.item, selected && styles.itemSelected]}
                >
                  <CartoonAvatar variant={variant} size={62} />
                </Pressable>
              );
            })}
          </ScrollView>

          <Button
            title="Kendi fotoğrafımı yükle"
            variant="secondary"
            onPress={onUploadPhoto}
            disabled={saving}
            fullWidth
          />
          <Button
            title="Kapat"
            variant="ghost"
            onPress={onClose}
            disabled={saving}
            fullWidth
            style={styles.close}
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
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: c.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    maxHeight: '88%',
    ...shadow.modal,
  },
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.lg },
  groupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  scroll: { flexGrow: 0, marginBottom: spacing.lg },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
  },
  item: {
    padding: 4,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  itemSelected: { borderColor: c.brand, backgroundColor: c.brandTint },
  close: { marginTop: spacing.xs },
}));

import React from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../brand';
import { Card, Text } from '../ui';
import { makeStyles, spacing, useTheme } from '../../theme';

export type RowButtonProps = {
  icon: IconName;
  label: string;
  /** The value on the right, before the chevron (e.g. "12 kayıt"). */
  value?: string;
  onPress: () => void;
};

/** A full-width row that opens a sheet: icon, label, value, chevron. */
export default function RowButton({ icon, label, value, onPress }: RowButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Card variant="flat" padding="md" style={styles.row} onPress={onPress}>
      <Icon name={icon} size={20} color={colors.brand} />
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {label}
        </Text>
      </View>
      {value ? (
        <Text variant="caption" color="textSubtle">
          {value}
        </Text>
      ) : null}
      <Icon name="chevronRight" size={18} color={colors.textSubtle} />
    </Card>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1 },
}));

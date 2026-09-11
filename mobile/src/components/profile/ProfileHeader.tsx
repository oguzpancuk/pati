import React from 'react';
import { Pressable, View } from 'react-native';
import DemoChip from '../DemoChip';
import { Avatar, Text } from '../ui';
import { makeStyles, spacing } from '../../theme';

export type ProfileHeaderProps = {
  avatarUrl: string | null;
  name: string;
  /** Under the name: your e-mail on your own profile, the join date on someone else's. */
  secondary: string;
  /** Showcase account: marked with the same chip as everywhere else. */
  demo?: boolean;
  /** The orange micro line (only your own profile: "dokun, avatarını seç"). */
  hint?: string;
  onPressAvatar?: () => void;
  /**
   * Top-right controls: the bell / friends / gear row on your own profile,
   * the single friendship button on someone else's. Right-aligned on its own
   * line so the name keeps the full width on both.
   */
  actions?: React.ReactNode;
};

/** The profile header, identical on your own profile and on someone else's. */
export default function ProfileHeader({
  avatarUrl,
  name,
  secondary,
  demo = false,
  hint,
  onPressAvatar,
  actions,
}: ProfileHeaderProps) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
      <View style={styles.identity}>
        <Pressable onPress={onPressAvatar} disabled={!onPressAvatar}>
          <Avatar uri={avatarUrl} name={name} size={60} />
        </Pressable>
        <View style={styles.text}>
          <View style={styles.nameWrap}>
            <Text variant="title" numberOfLines={1} style={styles.name}>
              {name}
            </Text>
            <DemoChip visible={demo} />
          </View>
          <Text variant="caption" numberOfLines={1}>
            {secondary}
          </Text>
          {hint ? (
            <Pressable onPress={onPressAvatar} disabled={!onPressAvatar}>
              <Text variant="micro" color="brand" style={styles.hint}>
                {hint}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  header: { marginBottom: spacing.xl },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  identity: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1, marginLeft: spacing.lg },
  nameWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1 },
  hint: { marginTop: spacing.sm - 2 },
}));

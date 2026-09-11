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
   * the single friendship button on someone else's. They sit on the identity
   * row itself, right-aligned and centred against the avatar — on their own
   * line above it they floated toward the top of the screen with a band of
   * nothing under them (owner, 2026-09-11).
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
      <View style={styles.identity}>
        <Pressable onPress={onPressAvatar} disabled={!onPressAvatar}>
          <Avatar uri={avatarUrl} name={name} size={52} />
        </Pressable>
        <View style={styles.text}>
          {/* The name has the row to itself. Sharing it with the demo chip
              cost roughly sixty points of width and truncated even a short
              name to "Can…" once the controls joined the row. */}
          <Text variant="title" numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.secondaryRow}>
            <Text variant="caption" numberOfLines={1} style={styles.secondary}>
              {secondary}
            </Text>
            <DemoChip visible={demo} />
          </View>
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      {/* Full width under the row, not inside the name column: beside the
          controls it wrapped onto a second line. */}
      {hint ? (
        <Pressable onPress={onPressAvatar} disabled={!onPressAvatar}>
          <Text variant="micro" color="brand" style={styles.hint}>
            {hint}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  header: { marginBottom: spacing.xl },
  // On the identity row, not above it: centred against the avatar so the
  // controls read as part of the same block as the name and the photo.
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.md,
  },
  identity: { flexDirection: 'row', alignItems: 'center' },
  // The name gives way, not the controls: it truncates at one line and the
  // buttons keep their touch targets.
  text: { flex: 1, minWidth: 0, marginLeft: spacing.md },
  secondaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  secondary: { flexShrink: 1 },
  hint: { marginTop: spacing.sm },
}));

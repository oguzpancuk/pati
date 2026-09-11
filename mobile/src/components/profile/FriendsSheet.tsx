import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { FriendshipEntry } from '../../api/users';
import DemoChip from '../DemoChip';
import { Icon } from '../brand';
import { Avatar, Button, Card, LoadMoreButton, Text } from '../ui';
import { hitSlop, makeStyles, spacing, useTheme } from '../../theme';
import Sheet from './Sheet';

const FRIEND_PAGE = 20;
const FRIEND_PREVIEW = 8;

export type FriendsSheetProps = {
  visible: boolean;
  onClose: () => void;
  incoming: FriendshipEntry[];
  friends: FriendshipEntry[];
  onAccept: (entry: FriendshipEntry) => void;
  onRemove: (entry: FriendshipEntry) => void;
  onOpenUser: (userId: number) => void;
  onFindFriends: () => void;
};

/**
 * Arkadaşlar as a sheet over the profile (owner, 2026-09-11): incoming
 * requests first — they are the only rows that need an answer — then the
 * friend list. "arkadaş bul" sits in the sheet header, where the section's
 * link used to be.
 */
export default function FriendsSheet({
  visible,
  onClose,
  incoming,
  friends,
  onAccept,
  onRemove,
  onOpenUser,
  onFindFriends,
}: FriendsSheetProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [visibleFriends, setVisibleFriends] = useState(FRIEND_PREVIEW);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Arkadaşlarım"
      action={
        <Pressable onPress={onFindFriends} hitSlop={hitSlop} accessibilityRole="button">
          <Text variant="captionStrong" color="brand">
            arkadaş bul
          </Text>
        </Pressable>
      }
    >
      {incoming.length > 0 && (
        <>
          <Text variant="micro" style={styles.subLabel}>
            gelen istekler
          </Text>
          {incoming.map((entry) => (
            <Card key={entry.friendship_id} variant="flat" padding="md" style={styles.block}>
              <Pressable onPress={() => onOpenUser(entry.id)}>
                <View style={styles.nameWrap}>
                  <Avatar uri={entry.avatar_url} name={entry.name} size={36} />
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.nameShrink}>
                    {entry.name}
                  </Text>
                  <DemoChip visible={entry.is_demo === true} />
                </View>
              </Pressable>
              <View style={styles.actions}>
                <Button title="Kabul et" size="sm" onPress={() => onAccept(entry)} />
                <Button title="Reddet" size="sm" variant="ghost" onPress={() => onRemove(entry)} />
              </View>
            </Card>
          ))}
          <Text variant="micro" style={styles.subLabel}>
            arkadaşlarım
          </Text>
        </>
      )}

      {friends.length === 0 ? (
        <Card variant="flat" style={styles.block}>
          <Text variant="caption">Henüz arkadaşın yok.</Text>
        </Card>
      ) : (
        friends.slice(0, visibleFriends).map((item) => (
          <Card
            key={item.friendship_id}
            variant="flat"
            padding="md"
            style={styles.friendRow}
            onPress={() => onOpenUser(item.id)}
          >
            <Avatar uri={item.avatar_url} name={item.name} size={36} />
            <Text variant="bodyStrong" style={styles.friendName} numberOfLines={1}>
              {item.name}
            </Text>
            <DemoChip visible={item.is_demo === true} />
            <Icon name="chevronRight" size={18} color={colors.textSubtle} />
          </Card>
        ))
      )}
      <LoadMoreButton
        remaining={friends.length - visibleFriends}
        onPress={() => setVisibleFriends((n) => n + FRIEND_PAGE)}
      />
    </Sheet>
  );
}

const useStyles = makeStyles(() => ({
  subLabel: { marginBottom: spacing.sm },
  block: { marginBottom: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  // The name shrinks, the chip does not: a long free-text name would push
  // the chip past the card's right edge otherwise.
  nameWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameShrink: { flexShrink: 1 },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  friendName: { flex: 1 },
}));

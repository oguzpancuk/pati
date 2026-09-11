import React from 'react';
import { NotificationList } from '../components/profile';
import { Screen } from '../components/ui';
import { makeStyles, spacing } from '../theme';

/**
 * The notification inbox as a screen — deep links and push open it. The list
 * itself is `components/profile/NotificationList`, the same one the profile's
 * bell sheet renders: item 2's whole point (owner, 2026-09-11) was ONE list,
 * and a verbatim copy here is exactly the drift it was meant to prevent.
 */
export default function NotificationsScreen({ navigation }: any) {
  const styles = useStyles();
  return (
    <Screen padded={false}>
      <NotificationList
        onOpenAnimal={(animalId) => navigation.navigate('AnimalProfile', { animalId })}
        // The sheet sits inside the sheet's own padding; a screen brings its
        // own. The list keeps its bottom inset for the tab bar.
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
}));

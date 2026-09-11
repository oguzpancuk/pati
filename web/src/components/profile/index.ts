/**
 * The pieces both profiles are built from. Your own profile and someone
 * else's render the same skeleton (owner, 2026-09-11) — extracting it here
 * is what keeps the two from drifting apart again.
 *
 * The stylesheet is imported once, here, so every consumer gets it.
 */
import '../../styles/profile.css';

export { Sheet, useSheetDismiss } from './Sheet';
export { ProfileHeader, HeaderIconButton } from './ProfileHeader';
export { NotificationList } from './NotificationList';
export { NotificationsSheet } from './NotificationsSheet';
export { FriendsSheet } from './FriendsSheet';
export { BellIcon, UsersIcon, GearIcon, CloseIcon, CareIcon } from './icons';

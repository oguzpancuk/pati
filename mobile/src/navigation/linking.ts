/**
 * Which `pati://` path opens which screen, in which tab.
 *
 * Its own module, with nothing React in it, so a test can assert what a path
 * resolves to by calling `getStateFromPath` — no simulator, no navigator tree.
 * Deep links broke twice while this structure moved and both defects were
 * mechanical; see mobile/__tests__/deepLinks.test.ts.
 */
import type { LinkingOptions } from '@react-navigation/native';
// Type-only, so nothing is imported at runtime and there is no cycle with
// index.tsx, which imports the value from here.
import type { MainTabParamList } from './index';

export const linkingConfig: NonNullable<LinkingOptions<MainTabParamList>['config']> = {
  screens: {
    // `initialRouteName` per tab is load-bearing, not decoration: without
    // it a link builds that tab's stack with the linked screen as its ONLY
    // route — no back chevron, and the tab's own home unreachable for the
    // session (review, 2026-09-12). A destination exists in every tab's
    // stack so it can be pushed from wherever the reader is; a link has to
    // pick one, so each path names the tab it belongs to.
    Map: { initialRouteName: 'MapHome', screens: { MapHome: 'map' } },
    Animals: {
      initialRouteName: 'AnimalsHome',
      screens: {
        AnimalsHome: 'animals',
        // ?matchReview=1 / ?report=1
        AnimalProfile: { path: 'animal/:animalId', parse: { animalId: Number } },
        AddAnimal: 'add-animal',
        CarePhotos: { path: 'animal/:animalId/care', parse: { animalId: Number } }, // ?species=cat
      },
    },
    Messages: {
      initialRouteName: 'MessagesHome',
      screens: {
        MessagesHome: 'messages',
        NewConversation: 'messages/new',
        Conversation: {
          path: 'conversation/:conversationId',
          parse: { conversationId: Number },
        },
        GroupSettings: {
          path: 'conversation/:conversationId/settings',
          parse: { conversationId: Number },
        },
      },
    },
    Profile: {
      initialRouteName: 'ProfileHome',
      screens: {
        ProfileHome: 'profile',
        Notifications: 'notifications',
        PublicProfile: { path: 'user/:userId', parse: { userId: Number } },
        FindFriends: 'friends',
        Leaderboard: 'leaderboard',
        UserComments: 'comments',
      },
    },
  },
};

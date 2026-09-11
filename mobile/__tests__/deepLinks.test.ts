import { getStateFromPath } from '@react-navigation/native';
import { linkingConfig } from '../src/navigation/linking';

/**
 * Deep links have broken twice while the navigation structure moved, and both
 * times the defect was mechanical: a path resolving into a tab whose stack had
 * no screen underneath it. `getStateFromPath` is pure, so the shape a link
 * produces can be asserted without booting anything.
 */
const config = linkingConfig as any;

function resolve(path: string) {
  const state = getStateFromPath(path, config) as any;
  const tab = state.routes[0];
  const stack = tab.state?.routes ?? [];
  return { tab: tab.name, screens: stack.map((r: any) => r.name), params: stack[stack.length - 1]?.params };
}

describe('pati:// deep links', () => {
  it('opens an animal inside the animals tab, with its list underneath', () => {
    const { tab, screens, params } = resolve('animal/12');
    expect(tab).toBe('Animals');
    // The list first: without it there is no back chevron and the tab's own
    // screen is unreachable for the session.
    expect(screens).toEqual(['AnimalsHome', 'AnimalProfile']);
    expect(params).toEqual({ animalId: 12 });
  });

  it.each([
    ['map', 'Map', ['MapHome']],
    ['animals', 'Animals', ['AnimalsHome']],
    ['messages', 'Messages', ['MessagesHome']],
    ['profile', 'Profile', ['ProfileHome']],
    ['add-animal', 'Animals', ['AnimalsHome', 'AddAnimal']],
    ['animal/7/care', 'Animals', ['AnimalsHome', 'CarePhotos']],
    ['messages/new', 'Messages', ['MessagesHome', 'NewConversation']],
    ['conversation/3', 'Messages', ['MessagesHome', 'Conversation']],
    ['conversation/3/settings', 'Messages', ['MessagesHome', 'GroupSettings']],
    ['notifications', 'Profile', ['ProfileHome', 'Notifications']],
    ['user/5', 'Profile', ['ProfileHome', 'PublicProfile']],
    ['friends', 'Profile', ['ProfileHome', 'FindFriends']],
    ['leaderboard', 'Profile', ['ProfileHome', 'Leaderboard']],
    ['comments', 'Profile', ['ProfileHome', 'UserComments']],
  ])('%s lands in %s on top of its tab home', (path, tab, screens) => {
    expect(resolve(path)).toMatchObject({ tab, screens });
  });

  it('parses the numeric params rather than leaving them strings', () => {
    expect(resolve('user/5').params).toEqual({ userId: 5 });
    expect(resolve('conversation/3').params).toEqual({ conversationId: 3 });
  });
});

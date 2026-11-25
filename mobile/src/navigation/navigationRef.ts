import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './RootNavigator';

/**
 * Root-level navigation ref. Screens nested inside the bottom-tab navigator use
 * this to reset the whole stack (e.g. after login or sign-out) so the user can
 * never navigate "back" into the dashboard while logged out.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function resetTo(route: keyof RootStackParamList): void {
  if (navigationRef.isReady()) {
    navigationRef.reset({ index: 0, routes: [{ name: route }] });
  }
}

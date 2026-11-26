import { AppRegistry } from 'react-native';
import { registerRootComponent } from 'expo';
import App from './App';

// Global error handler to catch and log any startup errors cleanly
if (typeof ErrorUtils !== 'undefined') {
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error('[GlobalError]', error, isFatal);
    if (originalHandler) {
      originalHandler(error, false);
    }
  });
}

// Register for Android native MainActivity (which expects 'homeworkout')
AppRegistry.registerComponent('homeworkout', () => App);

// Register for Expo CLI, dev tools, and web (which expect 'main')
registerRootComponent(App);

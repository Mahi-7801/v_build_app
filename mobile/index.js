import { AppRegistry } from 'react-native';
import { registerRootComponent } from 'expo';
import App from './App';

// Register for Android native MainActivity (which expects 'homeworkout')
AppRegistry.registerComponent('homeworkout', () => App);

// Register for Expo CLI, dev tools, and web (which expect 'main')
registerRootComponent(App);

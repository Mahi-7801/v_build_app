import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, Platform } from 'react-native';
import { colors } from '../theme/colors';
import { radius } from '../theme/theme';
import { Icon, IconName } from '../components/Icon';
import { useAppStore } from '../store/useAppStore';
import { label } from '../i18n/labels';
import { navigationRef } from './navigationRef';

import HomeScreen from '../screens/HomeScreen';
import WorkoutListScreen from '../screens/WorkoutListScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import AuthScreen from '../screens/AuthScreen';
import WorkoutDetailScreen from '../screens/WorkoutDetailScreen';
import ExerciseDetailScreen from '../screens/ExerciseDetailScreen';
import ExploreListScreen from '../screens/ExploreListScreen';
import WorkoutPlayerScreen from '../screens/WorkoutPlayerScreen';
import ResultScreen from '../screens/ResultScreen';
import ProScreen from '../screens/ProScreen';
import AdminScreen from '../screens/AdminScreen';
import CustomWorkoutBuilderScreen from '../screens/CustomWorkoutBuilderScreen';
import {
  WorkoutSettingsScreen, GeneralSettingsScreen, VoiceOptionsScreen, SuggestFeaturesScreen,
} from '../screens/SettingsSubScreens';

export type MainTabParamList = {
  Home: undefined;
  Workouts: undefined;
  Progress: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Main: undefined;
  Onboarding: undefined;
  Auth: undefined;
  WorkoutDetail: { workoutId?: number; planCode?: string; planId?: number };
  ExerciseDetail: { exerciseId?: number; actionId?: number; name?: string };
  ExploreList: { listId: number; title: string };
  Player: { planId: number; planCode: string; title: string; items: any[] };
  Result: {
    durationSec: number;
    calories: number;
    exercisesDone: number;
    exercisesTotal: number;
    sessionId: number | null;
    title: string;
    pointsEarned?: number;
  };
  Pro: undefined;
  Admin: undefined;
  CustomWorkoutBuilder: undefined;
  WorkoutSettings: undefined;
  GeneralSettings: undefined;
  VoiceOptions: undefined;
  SuggestFeatures: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function TabBarIcon({ name, color, size, focused }: { name: IconName; color: string; size: number; focused?: boolean }) {
  return (
    <View style={{
      width: 44, height: 30, borderRadius: radius.sm,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: focused ? '#EAF0FF' : 'transparent',
    }}>
      <Icon name={name} size={size} color={color} />
    </View>
  );
}

function MainTabs() {
  const lang = useAppStore((s) => s.lang);
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.divider,
          height: Platform.OS === 'ios' ? 82 : 62,
          paddingBottom: Platform.OS === 'ios' ? 20 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen}
        options={{ title: label(lang, 'home'), tabBarIcon: ({ color, size, focused }) => <TabBarIcon name="home" color={color} size={size} focused={focused} /> }} />
      <Tab.Screen name="Workouts" component={WorkoutListScreen}
        options={{ title: label(lang, 'workouts'), tabBarIcon: ({ color, size, focused }) => <TabBarIcon name="dumbbell" color={color} size={size} focused={focused} /> }} />
      <Tab.Screen name="Progress" component={HistoryScreen}
        options={{ title: label(lang, 'progress'), tabBarIcon: ({ color, size, focused }) => <TabBarIcon name="history" color={color} size={size} focused={focused} /> }} />
      <Tab.Screen name="Settings" component={SettingsScreen}
        options={{ title: label(lang, 'settings'), tabBarIcon: ({ color, size, focused }) => <TabBarIcon name="settings" color={color} size={size} focused={focused} /> }} />
    </Tab.Navigator>
  );
}

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.canvas,
    card: colors.white,
    text: colors.text,
    border: colors.border,
  },
};

export function RootNavigator({ initialRoute }: { initialRoute: keyof RootStackParamList }) {
  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} />
        <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
        <Stack.Screen name="ExploreList" component={ExploreListScreen} />
        <Stack.Screen name="Player" component={WorkoutPlayerScreen} />
        <Stack.Screen name="Result" component={ResultScreen} />
        <Stack.Screen name="Pro" component={ProScreen} />
        <Stack.Screen name="Admin" component={AdminScreen} />
        <Stack.Screen name="CustomWorkoutBuilder" component={CustomWorkoutBuilderScreen} />
        <Stack.Screen name="WorkoutSettings" component={WorkoutSettingsScreen} />
        <Stack.Screen name="GeneralSettings" component={GeneralSettingsScreen} />
        <Stack.Screen name="VoiceOptions" component={VoiceOptionsScreen} />
        <Stack.Screen name="SuggestFeatures" component={SuggestFeaturesScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

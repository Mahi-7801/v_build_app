import React, { useEffect } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

/** Subtle fade + rise animation for screen content. */
export function ScreenEnter({ children, style }: { children: React.ReactNode; style?: any }) {
  const fade = React.useRef(new Animated.Value(0)).current;
  const rise = React.useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 360, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 360, useNativeDriver: true }),
    ]).start();
  }, [fade, rise]);

  return (
    <Animated.View style={[style, { opacity: fade, transform: [{ translateY: rise }] }]}>
      {children}
    </Animated.View>
  );
}

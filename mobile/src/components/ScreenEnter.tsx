import React, { useEffect } from 'react';
import { Animated, Platform } from 'react-native';

/** Subtle fade + rise animation for screen content. */
export function ScreenEnter({ children, style }: { children: React.ReactNode; style?: any }) {
  const fade = React.useRef(new Animated.Value(0)).current;
  const rise = React.useRef(new Animated.Value(8)).current;

  useEffect(() => {
    const useNativeDriver = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver }),
      Animated.timing(rise, { toValue: 0, duration: 160, useNativeDriver }),
    ]).start();
  }, [fade, rise]);

  return (
    <Animated.View style={[style, { opacity: fade, transform: [{ translateY: rise }] }]}>
      {children}
    </Animated.View>
  );
}

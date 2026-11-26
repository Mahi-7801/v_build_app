import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

/**
 * Neutral artwork for exercises that have no animation. It deliberately does
 * NOT reuse a character image from another exercise (which looked like a
 * random, wrong picture on IDs such as 34).
 */
export function ExercisePlaceholder({ size = 120, glyph = '◆', style, badge }: {
  size?: number; glyph?: string; style?: StyleProp<ViewStyle>; badge?: boolean;
}) {
  return (
    <View style={[styles.box, { width: size, height: size }, style]}>
      <View style={[styles.circle, badge && styles.circleAnimated]}>
        <Text style={[styles.glyph, { fontSize: Math.max(14, size * 0.34) }]}>
          {badge ? '▶' : glyph}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: '76%', height: '76%', borderRadius: 999,
    backgroundColor: '#EAF0FF', borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  glyph: { color: colors.primary, fontWeight: '800' },
  circleAnimated: { backgroundColor: '#FFF0D6', borderColor: colors.pro },
});

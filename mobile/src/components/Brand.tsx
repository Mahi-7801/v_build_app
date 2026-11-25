import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './LocalizedText';
import { colors } from '../theme/colors';
import { GradientBox } from '../onboarding/design';

/**
 * Premium athletic V BUILD brand identity lockup.
 * Clean, bold, and modern across all screens.
 */
export function Brand({
  size = 28, light = false, centered = false,
}: {
  size?: number; light?: boolean; centered?: boolean;
}) {
  const badgeSize = Math.round(size * 1.1);
  const badgeRadius = Math.max(6, Math.round(badgeSize * 0.28));
  const textColor = light ? '#FFFFFF' : colors.text;
  const accentColor = light ? 'rgba(255,255,255,0.85)' : colors.primary;

  return (
    <View style={[styles.wrap, centered && styles.centered]}>
      <View style={styles.row}>
        {/* Monogram Emblem */}
        <GradientBox
          radius={badgeRadius}
          colors={light ? ['#3D7BFF', '#004AFF'] : [colors.primaryLight, colors.primary]}
          style={{ width: badgeSize, height: badgeSize }}
        >
          <View style={styles.markCopy}>
            <Text style={[styles.v, { fontSize: Math.round(badgeSize * 0.65) }]}>V</Text>
          </View>
        </GradientBox>

        {/* Wordmark */}
        <View style={styles.word}>
          <Text style={[styles.brandWord, { fontSize: Math.round(size * 0.88), color: textColor }]}>
            BUILD
          </Text>
        </View>
      </View>

      {/* Modern athletic accent bar */}
      <View
        style={[
          styles.accentBar,
          {
            backgroundColor: accentColor,
            width: Math.round(badgeSize * 1.7),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'flex-start',
  },
  centered: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  markCopy: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  v: {
    color: '#FFFFFF',
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  word: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandWord: {
    fontWeight: '900',
    letterSpacing: 2,
  },
  accentBar: {
    height: 3,
    borderRadius: 2,
    marginTop: 5,
  },
});

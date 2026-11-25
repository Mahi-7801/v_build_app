import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from './LocalizedText';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme/colors';
import { typography } from '../theme/theme';
import { Icon, IconName } from './Icon';

interface Props {
  /** 0..1 */
  progress: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  children?: React.ReactNode;
}

export function TimerRing({ progress, size = 128, stroke = 10, label, sublabel, children }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={colors.primary} strokeWidth={stroke} fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        {children || (
          <>
            <Text style={styles.label}>{label}</Text>
            {!!sublabel && <Text style={styles.sub}>{sublabel}</Text>}
          </>
        )}
      </View>
    </View>
  );
}

export function RoundButton({
  icon, onPress, color = colors.primary, size = 56, disabled,
}: {
  icon: IconName; onPress?: () => void; color?: string; size?: number; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.round,
        { backgroundColor: color, width: size, height: size, borderRadius: size / 2 },
        disabled && styles.disabled,
      ]}
    >
      <Icon name={icon} size={size * 0.42} color={colors.white} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  label: { ...typography.h1, color: colors.text },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  round: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
});

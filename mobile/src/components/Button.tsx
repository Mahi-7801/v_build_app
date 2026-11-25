import React from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator, StyleProp, ViewStyle } from 'react-native';
import { Text } from './LocalizedText';
import { colors } from '../theme/colors';
import { radius, spacing, typography, shadows } from '../theme/theme';

interface Props {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'dark' | 'outline' | 'premium';
  size?: 'md' | 'lg' | 'sm';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}

/** Flat, squared-off buttons with crisp borders and clear press feedback. */
export function Button({
  title, onPress, variant = 'primary', size = 'lg', disabled, loading, icon, style, full,
}: Props) {
  const solid = variant === 'primary' || variant === 'secondary' || variant === 'dark' || variant === 'premium';
  const background =
    variant === 'primary' ? colors.primary :
    variant === 'secondary' ? colors.primaryLight :
    variant === 'dark' ? colors.dark :
    variant === 'premium' ? '#F0A500' :
    'transparent';
  const textColor = solid ? colors.white : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: background },
        size === 'lg' && styles.lg,
        size === 'sm' && styles.sm,
        full && styles.full,
        variant === 'outline' && styles.outline,
        variant === 'ghost' && styles.ghost,
        variant === 'premium' && styles.premium,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={textColor} size="small" />
        ) : (
          <>
            {icon}
            <Text style={[styles.text, { color: textColor }, size === 'sm' && styles.textSm]}>{title}</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    ...shadows.button,
  },
  lg: { height: 52, paddingHorizontal: spacing.lg },
  sm: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  full: { width: '100%' },
  outline: { borderColor: colors.primary, backgroundColor: colors.white },
  ghost: { backgroundColor: 'transparent', borderColor: colors.border, ...(shadows.card as any) },
  premium: { borderColor: '#FFD580' },
  content: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingHorizontal: spacing.md,
  },
  text: { ...typography.button, letterSpacing: 0.2 },
  textSm: { fontSize: 13 },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.97 }], borderColor: 'rgba(255,255,255,0.9)', opacity: 0.92 },
});

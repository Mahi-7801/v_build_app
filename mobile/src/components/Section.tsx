import React from 'react';
import { View, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { Text } from './LocalizedText';
import { colors } from '../theme/colors';
import { radius, spacing, typography, shadows } from '../theme/theme';
import { Icon, IconName } from './Icon';

interface Props {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  icon?: IconName;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Section({ title, subtitle, action, onAction, icon, children, style }: Props) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          {icon && <Icon name={icon} size={18} color={colors.primary} />}
          <Text style={styles.title}>{title}</Text>
        </View>
        {!!action && (
          <TouchableOpacity onPress={onAction} activeOpacity={0.8}>
            <Text style={styles.action}>{action}</Text>
          </TouchableOpacity>
        )}
      </View>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {children}
    </View>
  );
}

export function StatCard({ value, label, icon }: { value: string; label: string; icon?: IconName }) {
  return (
    <View style={[styles.stat, shadows.card]}>
      {icon && <Icon name={icon} size={18} color={colors.primary} />}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xxl },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.h3, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 0, marginBottom: spacing.md },
  action: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  stat: {
    flex: 1, backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center', gap: 4,
  },
  statValue: { ...typography.h2, color: colors.text },
  statLabel: { ...typography.tiny, color: colors.textSecondary, textTransform: 'uppercase' },
});

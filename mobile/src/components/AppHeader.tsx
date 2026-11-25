import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from './LocalizedText';
import { Icon } from './Icon';
import { Brand } from './Brand';

/** Dark navy top bar matching the current Home Workout app. */
export function AppHeader({
  title, subtitle, showBrand = false, right, onMenu,
}: {
  title?: string;
  subtitle?: string;
  showBrand?: boolean;
  right?: React.ReactNode;
  onMenu?: () => void;
}) {
  return (
    <View style={styles.bar}>
      <TouchableOpacity onPress={onMenu} style={styles.side} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Icon name="filter" size={21} color="#FFFFFF" />
      </TouchableOpacity>
      <View style={styles.center}>
        {showBrand && <Brand size={19} light centered />}
        {!!title && <Text style={styles.title}>{title}</Text>}
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#21272B',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: { width: 30, alignItems: 'flex-start' },
  right: { alignItems: 'flex-end' },
  center: { flex: 1, alignItems: 'center' },
  title: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 1, marginTop: 4 },
  subtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 },
});

import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from './LocalizedText';
import type { ImageSourcePropType } from 'react-native';
import { C } from '../onboarding/design';

/** Large photo card with dark overlay and bold white title, like the real app. */
export const PhotoWorkoutCard = React.memo(function PhotoWorkoutCard({
  title, minutes, level, image, price, pro, onPress,
}: {
  title: string;
  minutes?: string;
  level?: string;
  image: ImageSourcePropType;
  price?: string;
  pro?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={styles.card}>
      <Image source={image} resizeMode="cover" style={styles.image} />
      <View style={styles.shade} />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <View style={styles.meta}>
          {!!minutes && <Text style={styles.minutes}>{minutes}</Text>}
          {!!level && <Text style={styles.bolt}>⚡ {level}</Text>}
          {!!price && <Text style={styles.price}>{price}</Text>}
          {!!pro && <Text style={styles.price}>PRO</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    height: 150, borderRadius: 14, overflow: 'hidden',
    marginHorizontal: 16, marginBottom: 12, backgroundColor: '#E8EAF0',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  image: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  shade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,12,25,0.45)' },
  body: { flex: 1, padding: 16, justifyContent: 'space-between' },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: 0.4, maxWidth: '80%' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  minutes: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },
  bolt: { color: '#FFD34E', fontSize: 12, fontWeight: '800' },
  price: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', backgroundColor: 'rgba(0,74,255,0.75)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
});

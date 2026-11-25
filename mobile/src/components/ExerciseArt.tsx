import React from 'react';
import { Image, View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { characterFor, characterXml } from '../data/characterArt';

/** Base implementation; Metro resolves `.native.tsx` / `.web.tsx` at runtime. */
interface Props {
  actionId?: number | null;
  size?: number;
  glyph?: string;
  style?: StyleProp<ViewStyle>;
}

export function ExerciseArt({ actionId, size = 120, style }: Props) {
  const rawXml = characterXml(actionId);
  const xml = rawXml && !/NaN|Infinity|undefined/.test(rawXml) ? rawXml : null;
  return (
    <View style={[{ width: size, height: size }, style as any]}>
      {xml ? <SvgXml xml={xml} width="100%" height="100%" />
        : <Image source={characterFor(actionId)} resizeMode="contain" style={styles.image} />}
    </View>
  );
}

export const Fallback = ExerciseArt;

const styles = StyleSheet.create({ image: { width: '100%', height: '100%' } });

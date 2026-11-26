import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { characterXml } from '../data/characterArt';
import { ExercisePlaceholder } from './ExercisePlaceholder';

/** Base implementation; Metro resolves `.native.tsx` / `.web.tsx` at runtime. */
interface Props {
  actionId?: number | null;
  uri?: string | null;
  size?: number;
  glyph?: string;
  style?: StyleProp<ViewStyle>;
}

export function ExerciseArt({ actionId, size = 120, glyph, style }: Props) {
  const rawXml = characterXml(actionId);
  const xml = rawXml && !/NaN|Infinity|undefined/.test(rawXml) ? rawXml : null;
  return (
    <View style={[{ width: size, height: size }, style as any]}>
      {xml ? <SvgXml xml={xml} width="100%" height="100%" />
        : <ExercisePlaceholder size={size} glyph={glyph} />}
    </View>
  );
}

export const Fallback = ExercisePlaceholder;

import React from 'react';
import { Image, View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { resolveAssetUrl } from '../api/client';
import { characterXml } from '../data/characterArt';
import { CHARACTER_GIFS } from '../data/characterGifs';
import { ExercisePlaceholder } from './ExercisePlaceholder';

/** Web: real animated character artwork from the original APK. */
interface Props {
  actionId?: number | null;
  uri?: string | null;
  size?: number;
  glyph?: string;
  style?: StyleProp<ViewStyle>;
}

export const ExerciseArt = React.memo(function ExerciseArt({ actionId, uri, size = 120, glyph, style }: Props) {
  const id = Math.abs(Math.trunc(Number(actionId) || 0));
  const resolvedUri = uri && /^(https?:\/\/|\/api\/|file:\/\/|data:)/i.test(uri.trim()) ? resolveAssetUrl(uri.trim()) : null;
  if (resolvedUri && /\.(gif|png|jpe?g|webp)(\?|$)/i.test(resolvedUri)) {
    return <View style={[{ width: size, height: size }, style as any]}>
      <Image source={{ uri: resolvedUri }} resizeMode="contain" style={styles.image} />
    </View>;
  }
  const gif = CHARACTER_GIFS[String(id)];
  if (gif) {
    return (
      <View style={[{ width: size, height: size }, style as any]}>
        <Image source={gif} resizeMode="contain" style={styles.image} />
      </View>
    );
  }
  const rawXml = characterXml(actionId);
  const xml = rawXml && !/NaN|Infinity|undefined/.test(rawXml) ? rawXml : null;
  return (
    <View style={[{ width: size, height: size }, style as any]}>
      {xml ? <SvgXml xml={xml} width="100%" height="100%" />
        : <ExercisePlaceholder size={size} glyph={glyph} badge={!!uri} />}
    </View>
  );
});

export function Fallback({ size = 120, glyph = '◆', style }: {
  size?: number; glyph?: string; style?: StyleProp<ViewStyle>;
}) {
  return <ExercisePlaceholder size={size} glyph={glyph} style={style} />;
}

const styles = StyleSheet.create({ image: { width: '100%', height: '100%' } });

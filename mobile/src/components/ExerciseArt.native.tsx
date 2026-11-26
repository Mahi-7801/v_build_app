import React, { useEffect, useState } from 'react';
import { Image, StyleProp, View, ViewStyle } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { SvgXml } from 'react-native-svg';
import { API_BASE_URL, resolveAssetUrl } from '../api/client';
import { characterXml } from '../data/characterArt';
import { CHARACTER_GIFS } from '../data/characterGifs';
import { ExercisePlaceholder } from './ExercisePlaceholder';

interface Props {
  actionId?: number | null;
  /** Admin-supplied Lottie JSON / GIF URL for a custom exercise. */
  uri?: string | null;
  size?: number;
  glyph?: string;
  style?: StyleProp<ViewStyle>;
}

/** Neutral tile when no animation exists. */
function NoAnimation({ uri, size, glyph, style }: Props) {
  return <ExercisePlaceholder size={size} glyph={glyph} style={style} badge={!!uri} />;
}

/**
 * Reliable Expo Go detection across modern SDKs:
 * `appOwnership` is deprecated (`null` in SDK 50+ StoreClient), while
 * `executionEnvironment === ExecutionEnvironment.StoreClient` catches Expo Go.
 */
let isExpoGo = true;
try {
  isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    || Constants.appOwnership === 'expo'
    || !Constants.executionEnvironment;
} catch { /* stay safe */ }

let LottieView: any = null;
if (!isExpoGo) {
  try { LottieView = require('lottie-react-native').default; } catch { LottieView = null; }
}

/** Ignore internal APK paths like `workout/actions/12/...`; only accept real URLs or `/api/...` paths. */
function getPlayableUri(uri?: string | null): string | null {
  const raw = String(uri || '').trim();
  if (!raw || !/^(https?:\/\/|\/api\/|file:\/\/|data:)/i.test(raw)) return null;
  return resolveAssetUrl(raw);
}

export const ExerciseArt = React.memo(function ExerciseArt({ actionId, uri, size = 120, glyph, style }: Props) {
  const [failed, setFailed] = useState(false);
  const id = Math.abs(Math.trunc(Number(actionId) || 0));
  const resolvedUri = getPlayableUri(uri);

  useEffect(() => { setFailed(false); }, [resolvedUri, id]);

  // 1) Uploaded GIF/image animations play directly from the resolved server URL.
  if (resolvedUri && !failed && /\.(gif|png|jpe?g|webp)(\?|$)/i.test(resolvedUri)) {
    return (
      <Image
        source={{ uri: resolvedUri }}
        resizeMode="contain"
        style={[{ width: size, height: size }, style as any]}
        onError={() => setFailed(true)}
      />
    );
  }

  // 2) Uploaded Lottie JSON URLs play via Lottie on native builds.
  if (resolvedUri && !failed && LottieView && !isExpoGo && /\.json(\?|$)/i.test(resolvedUri)) {
    return (
      <LottieView
        key={resolvedUri}
        source={{ uri: resolvedUri }}
        autoPlay
        loop
        resizeMode="contain"
        style={[{ width: size, height: size }, style as any]}
        onError={() => setFailed(true)}
      />
    );
  }

  // 3) Bundled 8 KB animated GIFs work instantaneously in Expo Go AND native lists.
  const gif = CHARACTER_GIFS[String(id)];
  if (gif && (isExpoGo || size <= 80 || !LottieView || failed)) {
    return <Image source={gif} resizeMode="contain" style={[{ width: size, height: size }, style as any]} />;
  }

  // 4) Native standalone build with large hero/player: play server Lottie JSON if available.
  if (LottieView && !isExpoGo && !failed && id) {
    return (
      <LottieView
        key={id}
        source={{ uri: `${API_BASE_URL}/exercises/${id}/lottie` }}
        autoPlay
        loop
        resizeMode="contain"
        style={[{ width: size, height: size }, style as any]}
        onError={() => setFailed(true)}
      />
    );
  }

  // 5) Fallback static SVG for the 17 action IDs without bundled GIFs.
  const rawXml = characterXml(id);
  const xml = rawXml && !/NaN|Infinity|undefined/.test(rawXml) ? rawXml : null;
  if (xml) {
    return (
      <View style={[{ width: size, height: size }, style as any]}>
        <SvgXml xml={xml} width="100%" height="100%" />
      </View>
    );
  }

  return <NoAnimation uri={resolvedUri} size={size} glyph={glyph} style={style} />;
});

export function Fallback({ size = 120, glyph = '◆', style }: {
  size?: number; glyph?: string; style?: StyleProp<ViewStyle>;
}) {
  return <ExercisePlaceholder size={size} glyph={glyph} style={style} />;
}

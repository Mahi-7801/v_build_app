import React, { useEffect, useState } from 'react';
import { Image, Platform, StyleProp, View, ViewStyle } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { SvgXml } from 'react-native-svg';
import { API_BASE_URL, resolveAssetUrl } from '../api/client';
import { characterXml } from '../data/characterArt';
import { CHARACTER_GIFS } from '../data/characterGifs';
import { BUNDLED_LOTTIE_IDS } from '../data/bundledLottieIds';
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
  const [uriFailed, setUriFailed] = useState(false);
  const [lottieFailed, setLottieFailed] = useState(false);
  const id = Math.abs(Math.trunc(Number(actionId) || 0));
  const resolvedUri = getPlayableUri(uri);

  useEffect(() => {
    setUriFailed(false);
    setLottieFailed(false);
  }, [resolvedUri, id]);

  // 1) Uploaded GIF/image animations play directly from the resolved server URL.
  if (resolvedUri && !uriFailed && /\.(gif|png|jpe?g|webp)(\?|$)/i.test(resolvedUri)) {
    return (
      <Image
        source={{ uri: resolvedUri }}
        resizeMode="contain"
        style={[{ width: size, height: size }, style as any]}
        onError={() => setUriFailed(true)}
      />
    );
  }

  // 2) Uploaded Lottie JSON URLs play via Lottie on native builds.
  if (resolvedUri && !uriFailed && LottieView && !isExpoGo && /\.json(\?|$)/i.test(resolvedUri)) {
    return (
      <LottieView
        key={resolvedUri}
        source={{ uri: resolvedUri }}
        autoPlay
        loop
        enableMergePathsAndroidForKitKatAndAbove
        resizeMode="contain"
        style={[{ width: size, height: size }, style as any]}
        onAnimationFailure={() => setUriFailed(true)}
      />
    );
  }

  const gif = CHARACTER_GIFS[String(id)];
  const hasBundledLottie =
    Platform.OS === 'android'
    && !isExpoGo
    && !!LottieView
    && !lottieFailed
    && BUNDLED_LOTTIE_IDS.has(id);

  // 3) Android standalone build: play bundled offline Lottie JSON for heroes, player, and Lottie-only IDs.
  if (hasBundledLottie && (size > 80 || !gif)) {
    return (
      <LottieView
        key={`local-${id}`}
        source={`lottie/${id}.json`}
        autoPlay
        loop
        enableMergePathsAndroidForKitKatAndAbove
        resizeMode="contain"
        style={[{ width: size, height: size }, style as any]}
        onAnimationFailure={() => setLottieFailed(true)}
      />
    );
  }

  // 4) Bundled 8 KB animated GIFs work instantaneously in Expo Go, native lists, and as fallback.
  if (gif) {
    return <Image source={gif} resizeMode="contain" style={[{ width: size, height: size }, style as any]} />;
  }

  // 5) Non-Android standalone build: try remote server Lottie JSON if available.
  if (LottieView && !isExpoGo && Platform.OS !== 'android' && !lottieFailed && id) {
    return (
      <LottieView
        key={id}
        source={{ uri: `${API_BASE_URL}/exercises/${id}/lottie` }}
        autoPlay
        loop
        resizeMode="contain"
        style={[{ width: size, height: size }, style as any]}
        onAnimationFailure={() => setLottieFailed(true)}
      />
    );
  }

  // 6) Fallback static SVG for action IDs without bundled GIFs/Lotties.
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

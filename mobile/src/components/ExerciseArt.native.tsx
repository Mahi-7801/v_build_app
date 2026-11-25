import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import Constants from 'expo-constants';
import { characterFor, characterXml } from '../data/characterArt';
import { API_BASE_URL } from '../api/client';
import { CHARACTER_GIFS } from '../data/characterGifs';

interface Props {
  actionId?: number | null;
  size?: number;
  glyph?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Real Home Workout v1.8.2 character artwork.
 * - Native builds: plays the actual Lottie animation from the app's own server.
 * - Expo Go: Lottie is not bundled there and crashes on import, so it renders
 *   the same artwork as a static SVG frame with a gentle animation.
 */
let isExpoGo = true;
try { isExpoGo = Constants.appOwnership === 'expo'; } catch { /* stay safe */ }

let LottieView: any = null;
if (!isExpoGo) {
  try { LottieView = require('lottie-react-native').default; } catch { LottieView = null; }
}

export function ExerciseArt({ actionId, size = 120, glyph, style }: Props) {
  const [lottieFailed, setLottieFailed] = useState(false);
  const id = Math.abs(Math.trunc(Number(actionId) || 0));

  // Expo Go: play the real app's artwork as an animated GIF (no native Lottie).
  if (isExpoGo) {
    const gif = CHARACTER_GIFS[String(id)];
    if (gif) {
      return <Image source={gif} resizeMode="contain" style={[{ width: size, height: size }, style as any]} />;
    }
  }

  if (LottieView && id && !lottieFailed) {
    return (
      <LottieView
        key={id}
        source={{ uri: `${API_BASE_URL}/exercises/${id}/lottie` }}
        autoPlay
        loop
        resizeMode="contain"
        style={[{ width: size, height: size }, style as any]}
        onError={() => setLottieFailed(true)}
      />
    );
  }
  return <Artwork actionId={actionId} size={size} glyph={glyph} style={style} />;
}

export function Fallback({ size = 120, glyph = '◆', style }: Omit<Props, 'actionId'>) {
  return <Artwork size={size} glyph={glyph} style={style} />;
}

function Artwork({ actionId, size = 120, style }: Props) {
  const breathe = useRef(new Animated.Value(0)).current;
  const turn = useRef(new Animated.Value(-3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 0, duration: 1000, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(turn, { toValue: 3, duration: 2000, useNativeDriver: true }),
          Animated.timing(turn, { toValue: -3, duration: 2000, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, turn]);

  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.05] });
  const rotate = turn.interpolate({ inputRange: [-3, 3], outputRange: ['-3deg', '3deg'] });
  const rawXml = characterXml(actionId);
  const xml = rawXml && !/NaN|Infinity|undefined/.test(rawXml) ? rawXml : null;

  return (
    <View style={[styles.holder, { width: size, height: size }, style]}>
      <Animated.View style={[styles.art, { transform: [{ scale }, { rotate }] }]}>
        {xml ? <SvgXml xml={xml} width="100%" height="100%" />
          : <Image source={characterFor(actionId)} resizeMode="contain" style={styles.image} />}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  holder: { alignItems: 'center', justifyContent: 'center' },
  art: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
});

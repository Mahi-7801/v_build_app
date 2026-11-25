import React, { useEffect, useRef } from 'react';
import {
  View, StyleSheet, Animated, Dimensions, StatusBar, Image,
} from 'react-native';
import { Text } from '../components/LocalizedText';
import { Icon } from '../components/Icon';
import { GradientBox } from '../onboarding/design';
import { IMG } from '../onboarding/images';

const { width: SW, height: SH } = Dimensions.get('screen');

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(26)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.spring(slide, { toValue: 0, friction: 7, tension: 50, useNativeDriver: true }),
      Animated.timing(progress, { toValue: 1, duration: 1300, useNativeDriver: false }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => onDone());
    }, 1500);
    return () => clearTimeout(timer);
  }, [fade, slide, progress, onDone]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {/* Soft blue ambient glow, white login-style canvas */}
      <View style={styles.glowTop} pointerEvents="none" />
      <View style={styles.glowBottom} pointerEvents="none" />

      <Animated.View style={[styles.screen, { opacity: fade, transform: [{ translateY: slide }] }]}>
        {/* Active brand wordmark */}
        <View style={styles.brandRow}>
          <Text style={styles.brandV}>V</Text>
          <View style={styles.slash} />
          <Text style={styles.brandBuild}>BUILD</Text>
        </View>
        <View style={styles.pill}>
          <Icon name="crown" size={12} color="#D97706" />
          <Text style={styles.pillText}>PREMIUM FITNESS</Text>
        </View>

        {/* Hero: real app's male character from "let's get to know you" */}
        <View style={styles.hero}>
          <Text style={styles.kicker}>LET&apos;S GET TO KNOW YOU</Text>
          <Text style={styles.title}>Your fitness journey{'\n'}starts here</Text>
          <Image source={IMG.genderMale} resizeMode="contain" style={styles.maleImage} />
          <View style={styles.chips}>
            <View style={styles.chip}><Icon name="dumbbell" size={13} color="#004AFF" /><Text style={styles.chipText}>No equipment</Text></View>
            <View style={styles.chip}><Icon name="target" size={13} color="#004AFF" /><Text style={styles.chipText}>Personal plan</Text></View>
            <View style={styles.chip}><Icon name="flame" size={13} color="#004AFF" /><Text style={styles.chipText}>Track progress</Text></View>
          </View>
        </View>

        {/* Login-style bottom card */}
        <View style={styles.bottomCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>PREPARING YOUR DAILY WORKOUT...</Text>
            <Text style={styles.statusPct}>{'\u2728'}</Text>
          </View>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressBar, {
              width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }]} />
          </View>
          <GradientBox radius={20} style={styles.ctaBox}>
            <View style={styles.cta}>
              <Text style={styles.ctaText}>GET STARTED</Text>
              <Icon name="chevron" size={18} color="#FFFFFF" />
            </View>
          </GradientBox>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    width: '100%', height: '100%', backgroundColor: '#FFFFFF', zIndex: 999,
  },
  glowTop: {
    position: 'absolute', top: -SW * 0.45, right: -SW * 0.25,
    width: SW * 0.95, height: SW * 0.95, borderRadius: SW * 0.5,
    backgroundColor: '#EEF4FF', opacity: 0.75,
  },
  glowBottom: {
    position: 'absolute', bottom: -SH * 0.18, left: -SW * 0.28,
    width: SW * 0.8, height: SW * 0.8, borderRadius: SW * 0.5,
    backgroundColor: '#F3F7FF', opacity: 0.7,
  },
  screen: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 46, paddingBottom: 30 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandV: { color: '#004AFF', fontSize: 38, fontWeight: '900', letterSpacing: 1 },
  slash: { width: 4, height: 28, borderRadius: 2, backgroundColor: '#F59E0B', transform: [{ rotate: '18deg' }] },
  brandBuild: { color: '#0F172A', fontSize: 38, fontWeight: '900', letterSpacing: 3 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8,
    backgroundColor: '#FFFBEB', paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 16, borderWidth: 1, borderColor: '#FDE68A',
  },
  pillText: { color: '#B45309', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
  kicker: { color: '#004AFF', fontSize: 11, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  title: { color: '#0F172A', fontSize: 26, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center', marginTop: 8 },
  maleImage: { width: SW * 0.72, height: SH * 0.38, maxHeight: 320, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 2 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  chipText: { color: '#475569', fontSize: 11, fontWeight: '800' },
  bottomCard: {
    width: '100%', backgroundColor: '#FFFFFF', borderRadius: 22,
    padding: 18, borderWidth: 1, borderColor: '#E8EDF5',
    shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusText: { color: '#64748B', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  statusPct: { color: '#F59E0B', fontSize: 14 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#E9EEF6', overflow: 'hidden', marginTop: 10 },
  progressBar: { height: '100%', borderRadius: 3, backgroundColor: '#004AFF' },
  ctaBox: { height: 52, marginTop: 14 },
  cta: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 1.4 },
});

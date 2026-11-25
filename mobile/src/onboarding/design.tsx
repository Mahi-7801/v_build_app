import React from 'react';
import { View, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Image, Animated } from 'react-native';
import { Text } from '../components/LocalizedText';
import type { ImageSourcePropType } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Icon, type IconName } from '../components/Icon';

/** Shared design system for the onboarding flow (React Native port of the
 *  "React + Tailwind, mobile-first, max-width 420px" spec). */
/** Palette recovered from Home Workout v1.8.2's own resources:
 *  color/blue_4b80ed, blue_1c34cf, guide_bg, guide_text_black, guide_text_gray. */
export const C = {
  blue1: '#4B80ED',
  blue2: '#1C34CF',
  mainBlue: '#004AFF',
  white: '#FFFFFF',
  canvas: '#F9F9FE',
  border: '#E8E9EE',
  heading: '#0D0722',
  body: '#625A5C',
  lavender: '#EEF1FB',
  peach: '#FFD7B5',
  peachText: '#8A4B10',
  track: '#E8E9EE',
};

let seq = 0;

const OUTER_STYLE_KEYS = new Set([
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical',
  'position', 'top', 'bottom', 'left', 'right',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf',
  'zIndex', 'elevation',
  'shadowColor', 'shadowOffset', 'shadowOpacity', 'shadowRadius',
]);

/** SVG-backed linear gradient box. Wraps arbitrary children. */
export function GradientBox({
  colors = [C.blue1, C.blue2], radius = 0, style, children,
}: {
  colors?: [string, string] | string[];
  radius?: number;
  style?: any;
  children?: React.ReactNode;
}) {
  const id = React.useRef(`og${seq++}`).current;
  const flat = StyleSheet.flatten(style) || {};

  const outerStyle: Record<string, any> = {};
  const innerStyle: Record<string, any> = {};

  for (const [k, v] of Object.entries(flat)) {
    if (OUTER_STYLE_KEYS.has(k)) {
      outerStyle[k] = v;
    } else {
      innerStyle[k] = v;
    }
  }

  if (flat.flex !== undefined) {
    outerStyle.flex = flat.flex;
    innerStyle.flex = flat.flex;
  }
  if (flat.flexGrow !== undefined) {
    outerStyle.flexGrow = flat.flexGrow;
    innerStyle.flexGrow = flat.flexGrow;
  }
  if (flat.width !== undefined) {
    outerStyle.width = flat.width;
    innerStyle.width = '100%';
  }
  if (flat.height !== undefined) {
    outerStyle.height = flat.height;
    innerStyle.height = '100%';
  }

  const [layout, setLayout] = React.useState<{ width: number; height: number } | null>(() => {
    if (typeof flat.width === 'number' && typeof flat.height === 'number') {
      return { width: flat.width, height: flat.height };
    }
    return null;
  });

  const onLayout = React.useCallback((e: any) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setLayout((prev) => {
        if (prev && prev.width === width && prev.height === height) return prev;
        return { width, height };
      });
    }
  }, []);

  const w = layout?.width ?? (typeof flat.width === 'number' ? flat.width : 0);
  const h = layout?.height ?? (typeof flat.height === 'number' ? flat.height : 0);

  const startColor = colors[0] || C.blue1;
  const endColor = colors[1] || colors[0] || C.blue2;

  return (
    <View style={outerStyle}>
      <View
        onLayout={onLayout}
        style={[
          {
            borderRadius: radius,
            overflow: 'hidden',
            backgroundColor: startColor,
          },
          innerStyle,
        ]}
      >
        {w > 0 && h > 0 ? (
          <Svg
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={startColor} />
                <Stop offset="1" stopColor={endColor} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={w} height={h} rx={radius} ry={radius} fill={`url(#${id})`} />
          </Svg>
        ) : null}
        {children}
      </View>
    </View>
  );
}

export function TopNav({
  step, total, onBack, onSkip, showBack = true,
}: {
  step: number; total: number; onBack: () => void; onSkip: () => void; showBack?: boolean;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (step / total) * 100)) : 0;
  return (
    <View style={styles.topNav}>
      <TouchableOpacity
        onPress={onBack} disabled={!showBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[styles.navSide, { opacity: showBack ? 1 : 0 }]}
      >
        <Icon name="back" size={22} color={C.heading} />
      </TouchableOpacity>
      <View style={styles.progressTrack}>
        <GradientBox radius={4} style={{ width: `${pct}%`, height: 5 }} />
      </View>
      {/* Skip removed: every answer is required to generate the plan/report. */}
      <View style={styles.navSide} />
    </View>
  );
}

export function ScreenShell({
  step, total, title, subtitle, centered, onBack, onSkip, cta, onNext, children, ctaDisabled,
}: {
  step: number;
  total: number;
  title: string;
  subtitle?: string;
  centered?: boolean;
  onBack: () => void;
  onSkip: () => void;
  cta?: string;
  onNext: () => void;
  children: React.ReactNode;
  ctaDisabled?: boolean;
}) {
  const fade = React.useRef(new Animated.Value(0)).current;
  const rise = React.useRef(new Animated.Value(14)).current;
  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start();
  }, [fade, rise]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.bgGlow} pointerEvents="none">
        <GradientBox radius={140} style={{ width: 280, height: 280, opacity: 0.07 }} />
      </View>
      <TopNav step={step} total={total} onBack={onBack} onSkip={onSkip} />
      <Animated.View style={{ flex: 1, opacity: fade, transform: [{ translateY: rise }] }}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.h1, centered && styles.centerText]}>{title}</Text>
          {!!subtitle && <Text style={[styles.subtitle, centered && styles.centerText]}>{subtitle}</Text>}
          {children}
        </ScrollView>
      </Animated.View>
      <View style={styles.footer}>
        <GradientBox radius={28} style={[styles.ctaBox, ctaDisabled && styles.ctaBoxDisabled]}>
          <TouchableOpacity onPress={onNext} disabled={ctaDisabled} activeOpacity={0.9} style={styles.cta}>
            <Text style={styles.ctaText}>{cta || 'NEXT'}</Text>
          </TouchableOpacity>
        </GradientBox>
      </View>
    </SafeAreaView>
  );
}

function LeadVisual({
  emoji, image, icon, iconImage, selected,
}: {
  emoji?: string; image?: ImageSourcePropType; icon?: IconName;
  iconImage?: ImageSourcePropType; selected: boolean;
}) {
  if (image) {
    return <Image source={image} resizeMode="cover" style={[styles.thumb, selected && styles.thumbSelected]} />;
  }
  return (
    <View style={[styles.lead, selected && styles.leadSelected]}>
      {iconImage ? (
        <Image source={iconImage} resizeMode="contain" style={styles.emojiImg} />
      ) : icon ? (
        <Icon name={icon} size={20} color={selected ? C.white : C.blue2} />
      ) : (
        <Text style={styles.emoji}>{emoji}</Text>
      )}
    </View>
  );
}

export function SelectCard({
  emoji, image, icon, iconImage, label, sub, selected, onPress, showCheck = true, height, compact,
}: {
  emoji?: string;
  image?: ImageSourcePropType;
  icon?: IconName;
  iconImage?: ImageSourcePropType;
  label: string;
  sub?: string;
  selected: boolean;
  onPress: () => void;
  showCheck?: boolean;
  height?: number;
  compact?: boolean;
}) {
  const pop = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    Animated.sequence([
      Animated.timing(pop, { toValue: 0.965, duration: 90, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
  }, [selected, pop]);

  const content = (
    <View style={[styles.card, compact ? styles.cardCompact : null, height ? { height } : null, !selected && styles.cardUnselected]}>
      <LeadVisual emoji={emoji} image={image} icon={icon} iconImage={iconImage} selected={selected} />
      <View style={styles.cardCopy}>
        <Text style={[styles.cardLabel, selected && styles.selectedText]}>{label}</Text>
        {!!sub && <Text style={[styles.cardSub, selected && styles.selectedSub]}>{sub}</Text>}
      </View>
      {showCheck && (
        <View style={[styles.check, selected && styles.checkSelected]}>
          {selected && <Icon name="check" size={14} color={C.blue2} strokeWidth={3} />}
        </View>
      )}
    </View>
  );
  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={styles.cardTouch}>
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        {selected ? <GradientBox radius={16}>{content}</GradientBox> : content}
      </Animated.View>
    </TouchableOpacity>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function PillToggle({
  options, value, onChange,
}: {
  options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <View style={styles.toggle}>
      {options.map((o) => (
        <TouchableOpacity key={o} onPress={() => onChange(o)} style={styles.toggleItem}>
          {value === o ? (
            <GradientBox radius={12} style={styles.toggleOn}>
              <Text style={styles.toggleOnText}>{o}</Text>
            </GradientBox>
          ) : (
            <View style={styles.toggleOff}><Text style={styles.toggleOffText}>{o}</Text></View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas },
  bgGlow: { position: 'absolute', top: -140, right: -110, opacity: 1 },
  scroll: { flex: 1 },
  content: { width: '100%', maxWidth: 420, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 24 },
  centerText: { textAlign: 'center' },

  topNav: {
    width: '100%', maxWidth: 420, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10,
  },
  navSide: { width: 42, height: 32, justifyContent: 'center' },
  skip: { color: C.body, fontSize: 14, fontWeight: '600' },
  progressTrack: { flex: 1, height: 5, borderRadius: 4, backgroundColor: C.track, overflow: 'hidden' },

  h1: { color: C.heading, fontSize: 26, fontWeight: '800', lineHeight: 33, letterSpacing: -0.6, marginTop: 22, marginBottom: 10 },
  subtitle: { color: C.body, fontSize: 14, lineHeight: 21, marginBottom: 26 },

  footer: { width: '100%', maxWidth: 420, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },
  ctaBox: {
    height: 56,
    shadowColor: C.blue2, shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  ctaBoxDisabled: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
  cta: { height: 56, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: C.white, fontSize: 16, fontWeight: '800', letterSpacing: 1.2 },

  cardTouch: { marginBottom: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 16, padding: 16, minHeight: 78,
  },
  cardCompact: { minHeight: 62, paddingVertical: 10 },
  cardUnselected: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    shadowColor: '#16181D', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  cardCopy: { flex: 1 },
  cardLabel: { color: C.heading, fontSize: 16, fontWeight: '700' },
  cardSub: { color: C.body, fontSize: 12, marginTop: 4 },
  selectedText: { color: C.white },
  selectedSub: { color: 'rgba(255,255,255,0.85)' },
  lead: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: '#EEF3FF',
    alignItems: 'center', justifyContent: 'center',
  },
  leadSelected: { backgroundColor: 'rgba(255,255,255,0.22)' },
  emoji: { fontSize: 21 },
  emojiImg: { width: 30, height: 30 },
  thumb: { width: 56, height: 56, borderRadius: 12 },
  thumbSelected: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)' },
  check: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  checkSelected: { backgroundColor: C.white, borderColor: C.white },

  sectionLabel: { color: C.heading, fontSize: 14, fontWeight: '700', marginTop: 20, marginBottom: 12 },
  toggle: { flexDirection: 'row', backgroundColor: '#F4F5F9', borderRadius: 14, padding: 3, width: 132 },
  toggleItem: { flex: 1 },
  toggleOn: { height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  toggleOnText: { color: C.white, fontWeight: '800', fontSize: 13 },
  toggleOff: { height: 34, alignItems: 'center', justifyContent: 'center' },
  toggleOffText: { color: C.body, fontWeight: '700', fontSize: 13 },
});

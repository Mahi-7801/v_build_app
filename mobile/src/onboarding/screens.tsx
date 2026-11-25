import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Image, TouchableOpacity, ScrollView, Animated, Dimensions, LayoutChangeEvent, type ScrollViewInstance } from 'react-native';
import { Text } from '../components/LocalizedText';
import Svg, { Circle, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { C, GradientBox, ScreenShell, SelectCard, SectionLabel, PillToggle } from './design';
import type { IconName } from '../components/Icon';
import { IMG } from './images';
import type { StepProps, OnboardingAnswers } from './answers';
import { buildLocalPlan } from './plan';

const { width: SW } = Dimensions.get('window');

/* ------------------------------------------------------------------ */
/* Gender (before the 8 numbered steps)                                */
/* ------------------------------------------------------------------ */
export function GenderScreen({ answers, set, onNext, onBack, onSkip, onLogin }: StepProps) {
  return (
    <ScreenShell
      step={0} total={8} title="Let's get to know you"
      subtitle="Tell us your gender and we'll build a plan made for your body."
      onBack={onBack} onSkip={onSkip} onNext={onNext} cta="NEXT" ctaDisabled={!answers.gender}
    >
      <View style={s.genderRow}>
        {(['male', 'female'] as const).map((g) => {
          const active = answers.gender === g;
          return (
            <TouchableOpacity
              key={g} activeOpacity={0.9} onPress={() => set({ gender: g })}
              style={[s.genderCard, active && s.genderCardActive]}
            >
              <Image
                source={g === 'male' ? IMG.genderMale : IMG.genderFemale}
                resizeMode="cover"
                style={s.genderImage}
              />
              <View style={s.genderBadge}>
                <Text style={[s.genderBadgeText, active && s.genderBadgeTextOn]}>{g.toUpperCase()}</Text>
              </View>
              {active && (
                <View style={s.genderCheck}><Text style={s.genderCheckText}>✓</Text></View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={s.genderHint}>You can change this any time in Settings.</Text>
      {!!onLogin && (
        <TouchableOpacity onPress={onLogin} style={s.genderLogin}>
          <Text style={s.genderLoginText}>Already have an account? <Text style={s.genderLoginBold}>LOG IN</Text></Text>
        </TouchableOpacity>
      )}
    </ScreenShell>
  );
}

/* ------------------------------------------------------------------ */
/* STEP 1 — Focus Area                                                 */
/* ------------------------------------------------------------------ */
const AREAS = ['Full Body', 'Arm', 'Chest', 'Abs', 'Leg'];
const AREA_ICONS: Record<string, import('../components/Icon').IconName> = {
  'Full Body': 'workout', Arm: 'dumbbell', Chest: 'muscle', Abs: 'target', Leg: 'walking',
};
// Fractions are relative to the *displayed image* (the full-body photo is
// 420x900). Positions follow the figure: head, crossed arms, chest, abs, legs.
const DOT_POS: Record<string, { x: number; y: number }> = {
  'Full Body': { x: 0.50, y: 0.12 },
  Arm: { x: 0.62, y: 0.33 },
  Chest: { x: 0.50, y: 0.28 },
  Abs: { x: 0.50, y: 0.41 },
  Leg: { x: 0.38, y: 0.72 },
};
type Box = { x: number; y: number; width: number; height: number };

export function FocusAreaScreen({ answers, set, onNext, onBack, onSkip }: StepProps) {
  const [cards, setCards] = useState<Record<string, Box>>({});
  const [img, setImg] = useState<Box | null>(null);
  // The full-body photos are 420x900. Start with that exact size so the
  // marker math is correct on first layout, then verify with getSize.
  const [srcSize, setSrcSize] = useState({ w: 420, h: 900 });

  const bodySource = answers.gender === 'female' ? IMG.bodyFemale : IMG.bodyMale;
  useEffect(() => {
    const src = Image.resolveAssetSource(bodySource);
    if (src?.width && src?.height) {
      setSrcSize({ w: src.width, h: src.height });
    } else if (src?.uri) {
      Image.getSize(src.uri, (w, h) => setSrcSize({ w, h }), () => {});
    }
  }, [bodySource]);

  // `resizeMode="contain"` letterboxes the photo, so the markers must be
  // positioned against the image's real on-screen rectangle, not the wrapper.
  const imgRect = img
    ? (() => {
        const scale = Math.min(img.width / srcSize.w, img.height / srcSize.h);
        const w = srcSize.w * scale;
        const h = srcSize.h * scale;
        return {
          x: img.x + (img.width - w) / 2,
          y: img.y + (img.height - h) / 2,
          width: w,
          height: h,
        };
      })()
    : null;

  const toggle = (area: string) => {
    const has = answers.focusAreas.includes(area);
    const next = has
      ? answers.focusAreas.filter((a) => a !== area)
      : [...answers.focusAreas, area];
    set({ focusAreas: next });
  };
  return (
    <ScreenShell
      step={1} total={8} title="Please choose your focus area"
      onBack={onBack} onSkip={onSkip} onNext={onNext} cta="NEXT" ctaDisabled={answers.focusAreas.length === 0}
    >
      <View style={s.focusRow}>
        <View style={s.focusList}>
          {AREAS.map((area) => (
            <View
              key={area}
              onLayout={(e: LayoutChangeEvent) => setCards((p) => ({ ...p, [area]: e.nativeEvent.layout }))}
            >
              <SelectCard
                icon={AREA_ICONS[area]} label={area} compact
                selected={answers.focusAreas.includes(area)} onPress={() => toggle(area)}
              />
            </View>
          ))}
        </View>
        <View
          style={s.focusImageWrap}
          onLayout={(e: LayoutChangeEvent) => setImg(e.nativeEvent.layout)}
        >
          <Image source={bodySource} resizeMode="contain" style={s.focusImage} />
          <View style={s.focusImageOverlay} pointerEvents="none">
            <View style={s.focusPill}><Text style={s.focusPillText}>TAP A BODY PART</Text></View>
          </View>
        </View>

        {!!imgRect && (
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
            {Object.keys(DOT_POS).map((area) => {
              const cb = cards[area];
              const dot = DOT_POS[area];
              if (!cb) return null;
              const on = answers.focusAreas.includes('Full Body') || answers.focusAreas.includes(area);
              return (
                <Line
                  key={`l-${area}`}
                  x1={imgRect.x + imgRect.width * dot.x}
                  y1={imgRect.y + imgRect.height * dot.y}
                  x2={cb.x + cb.width - 2}
                  y2={cb.y + cb.height / 2}
                  stroke={on ? C.blue2 : '#B9C0D0'}
                  strokeWidth={on ? 2 : 1.2}
                  strokeDasharray="3 4"
                />
              );
            })}
            {Object.keys(DOT_POS).map((area) => {
              const dot = DOT_POS[area];
              const on = answers.focusAreas.includes('Full Body') || answers.focusAreas.includes(area);
              return (
                <Circle
                  key={`d-${area}`}
                  cx={imgRect.x + imgRect.width * dot.x}
                  cy={imgRect.y + imgRect.height * dot.y}
                  r={on ? 6 : 5}
                  fill={on ? C.blue2 : C.white}
                  stroke={on ? C.white : C.blue2}
                  strokeWidth={2}
                />
              );
            })}
          </Svg>
        )}
      </View>
    </ScreenShell>
  );
}

/* ------------------------------------------------------------------ */
/* STEP 2 — Main Goals                                                 */
/* ------------------------------------------------------------------ */
export function MainGoalsScreen({ answers, set, onNext, onBack, onSkip }: StepProps) {
  const goals = [
    { id: 'lose_weight', label: 'Lose Weight', image: IMG.goalLoseWeight },
    { id: 'build_muscle', label: 'Build Muscle', image: IMG.goalBuildMuscle },
    { id: 'keep_fit', label: 'Keep Fit', image: IMG.goalKeepFit },
  ];
  return (
    <ScreenShell
      step={2} total={8} title={"What are your\nmain goals?"}
      onBack={onBack} onSkip={onSkip} onNext={onNext} cta="NEXT" ctaDisabled={!answers.goal}
    >
      {goals.map((g) => (
        <SelectCard
          key={g.id} image={g.image} label={g.label} height={90}
          selected={answers.goal === g.id} onPress={() => set({ goal: g.id })}
        />
      ))}
    </ScreenShell>
  );
}

/* ------------------------------------------------------------------ */
/* STEP 3 — Motivation                                                 */
/* ------------------------------------------------------------------ */
export function MotivationScreen({ answers, set, onNext, onBack, onSkip }: StepProps) {
  const items = [
    { icon: 'smile' as const, label: 'Feel confident' },
    { icon: 'heartPulse' as const, label: 'Release stress' },
    { icon: 'heart' as const, label: 'Improve health' },
    { icon: 'lightning' as const, label: 'Boost energy' },
  ];
  return (
    <ScreenShell
      step={3} total={8} title={"What motivates you\nthe most?"}
      onBack={onBack} onSkip={onSkip} onNext={onNext} cta="NEXT" ctaDisabled={!answers.motivation}
    >
      {items.map((i) => (
        <SelectCard
          key={i.label} icon={i.icon} label={i.label}
          selected={answers.motivation === i.label}
          onPress={() => set({ motivation: i.label })}
        />
      ))}
    </ScreenShell>
  );
}

/* ------------------------------------------------------------------ */
/* STEP 4 — Push-up Test                                               */
/* ------------------------------------------------------------------ */
export function PushupTestScreen({ answers, set, onNext, onBack, onSkip }: StepProps) {
  const items = [
    { id: 'beginner', icon: 'beginner' as const, label: 'Beginner', sub: '0–15 push-ups' },
    { id: 'intermediate', icon: 'intermediate' as const, label: 'Intermediate', sub: '16–39 push-ups' },
    { id: 'advanced', icon: 'advanced' as const, label: 'Advanced', sub: 'At least 40' },
  ];
  return (
    <ScreenShell
      step={4} total={8} title={'How many push-ups can\nyou do at one time?'}
      onBack={onBack} onSkip={onSkip} onNext={onNext} cta="NEXT" ctaDisabled={!answers.pushupLevel}
    >
      {items.map((i) => (
        <SelectCard
          key={i.id} icon={i.icon} label={i.label} sub={i.sub}
          selected={answers.pushupLevel === i.id}
          onPress={() => set({ pushupLevel: i.id })}
        />
      ))}
    </ScreenShell>
  );
}

/* ------------------------------------------------------------------ */
/* STEP 5 — Body Concerns                                              */
/* ------------------------------------------------------------------ */
export function BodyConcernsScreen({ answers, set, onNext, onBack, onSkip }: StepProps) {
  const parts: Array<{ label: string; icon: IconName }> = [
    { label: 'Lower back', icon: 'lowerBack' },
    { label: 'Shoulder', icon: 'shoulder' },
    { label: 'Ankle', icon: 'ankle' },
    { label: 'Wrist', icon: 'wrist' },
  ];
  const toggle = (label: string) => set({
    concerns: answers.concerns.includes(label)
      ? answers.concerns.filter((c) => c !== label)
      : [...answers.concerns, label],
  });
  return (
    <ScreenShell
      step={5} total={8} title={'Any discomfort or\nconcerns with your\nbody?'}
      onBack={onBack} onSkip={onSkip} onNext={onNext} cta="NEXT" ctaDisabled={answers.concerns.length === 0}
    >
      <View style={s.infoBanner}>
        <Image source={IMG.discomfort} resizeMode="contain" style={s.infoIcon} />
        <Text style={s.infoText}>
          This helps us focus on areas needing extra care and customize your fitness journey.
        </Text>
      </View>
      <View style={s.cutoffHint}><View style={s.cutoffCard} /></View>
      <Text style={s.scrollHint}>Scroll to see all areas</Text>
      {parts.map((p) => (
        <SelectCard
          key={p.label} icon={p.icon} label={p.label} compact
          selected={answers.concerns.includes(p.label)} onPress={() => toggle(p.label)}
        />
      ))}
    </ScreenShell>
  );
}

/* ------------------------------------------------------------------ */
/* STEP 6 — Activity Level                                             */
/* ------------------------------------------------------------------ */
export function ActivityLevelScreen({ answers, set, onNext, onBack, onSkip }: StepProps) {
  const items = [
    { icon: 'sedentary' as const, label: 'Sedentary' },
    { icon: 'walking' as const, label: 'Lightly active' },
    { icon: 'running' as const, label: 'Moderately active' },
    { icon: 'veryActive' as const, label: 'Very active' },
  ];
  return (
    <ScreenShell
      step={6} total={8} title={"What's your activity level?"}
      onBack={onBack} onSkip={onSkip} onNext={onNext} cta="NEXT" ctaDisabled={!answers.activityLevel}
    >
      {items.map((i) => (
        <SelectCard
          key={i.label} icon={i.icon} label={i.label}
          selected={answers.activityLevel === i.label}
          onPress={() => set({ activityLevel: i.label })}
        />
      ))}
    </ScreenShell>
  );
}

/* ------------------------------------------------------------------ */
/* STEP 7 — Weekly Goal                                                */
/* ------------------------------------------------------------------ */
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

export function WeeklyGoalScreen({ answers, set, onNext, onBack, onSkip }: StepProps) {
  const [open, setOpen] = useState(false);
  return (
    <ScreenShell
      step={7} total={8} title="Set your weekly goal"
      subtitle="We recommend training at least 3 days weekly for a better result."
      onBack={onBack} onSkip={onSkip} onNext={onNext} cta="NEXT" ctaDisabled={!answers.weeklyDays}
    >
      <SectionLabel>Weekly training days</SectionLabel>
      <View style={s.daysGrid}>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <TouchableOpacity key={d} onPress={() => set({ weeklyDays: d })} style={s.dayCell}>
            {answers.weeklyDays === d ? (
              <GradientBox radius={14} style={s.dayOn}><Text style={s.dayOnText}>{d}</Text></GradientBox>
            ) : (
              <View style={s.dayOff}><Text style={s.dayOffText}>{d}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.divider} />

      <SectionLabel>First day of week</SectionLabel>
      <TouchableOpacity onPress={() => setOpen(!open)} style={s.dropdown}>
        <Text style={s.dropdownText}>{answers.firstDayOfWeek}</Text>
        <Text style={[s.chevron, open && s.chevronOpen]}>⌄</Text>
      </TouchableOpacity>
      {open && (
        <View style={s.dropdownList}>
          {DAYS.map((d) => (
            <TouchableOpacity
              key={d}
              onPress={() => { set({ firstDayOfWeek: d }); setOpen(false); }}
              style={s.dropdownRow}
            >
              <Text style={[s.dropdownRowText, answers.firstDayOfWeek === d && s.dropdownRowTextOn]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScreenShell>
  );
}

/* ------------------------------------------------------------------ */
/* STEP 8 — Body Metrics (with draggable rulers)                       */
/* ------------------------------------------------------------------ */
const PAD = 200;
const PX = 6;

function Ruler({
  min, max, value, onChange, labelEvery = 10,
}: {
  min: number; max: number; value: number; onChange: (v: number) => void; labelEvery?: number;
}) {
  const ref = useRef<ScrollViewInstance>(null);
  // On mount and whenever the unit changes (new min/max), line the ruler up
  // with the current value. Deliberately not keyed on `value` so dragging
  // doesn't fight the user's scroll position.
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ x: (value - min) * PX, animated: false });
    }, 40);
    return () => clearTimeout(t);
  }, [min, max]); // eslint-disable-line react-hooks/exhaustive-deps
  const units = [];
  for (let u = min; u <= max; u++) units.push(u);
  return (
    <View style={s.rulerWrap}>
      <ScrollView
        ref={ref} horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ width: PAD * 2 + units.length * PX, height: 70 }}
        onScroll={(e) => {
          const raw = min + Math.round(e.nativeEvent.contentOffset.x / PX);
          const v = Math.max(min, Math.min(max, raw));
          if (v !== value) onChange(v);
        }}
        scrollEventThrottle={16}
      >
        {units.map((u) => {
          const major = u % labelEvery === 0;
          return (
            <View key={u} style={[s.tick, { left: PAD + (u - min) * PX, height: major ? 18 : 9 }]}>
              {major && <Text style={s.tickLabel}>{u}</Text>}
            </View>
          );
        })}
      </ScrollView>
      <View style={s.indicator} pointerEvents="none"><View style={s.indicatorLine} /></View>
    </View>
  );
}

export function BodyMetricsScreen({ answers, set, onNext, onBack, onSkip }: StepProps) {
  const isLbs = answers.weightUnit === 'lbs';
  const weightDisplay = isLbs ? answers.weight.toFixed(1) : (answers.weight / 2.20462).toFixed(1);
  const isFt = answers.heightUnit === 'ft';
  const cm = Math.round(answers.heightInches * 2.54);
  const heightDisplay = isFt
    ? `${Math.floor(answers.heightInches / 12)} ft ${answers.heightInches % 12} in`
    : `${cm} cm`;

  const changeWeightUnit = (u: string) => {
    if (u === answers.weightUnit) return;
    set({
      weightUnit: u as 'kg' | 'lbs',
      weight: u === 'lbs' ? Math.round(answers.weight / 2.20462) : Math.round(answers.weight * 2.20462),
    });
  };
  const changeHeightUnit = (u: string) => {
    if (u === answers.heightUnit) return;
    set({
      heightUnit: u as 'cm' | 'ft',
      heightInches: u === 'ft' ? Math.round(answers.heightInches) : Math.round(answers.heightInches),
    });
  };

  return (
    <ScreenShell
      step={8} total={8} title="Let us know you better"
      subtitle="Let us know you better to help boost your workout results"
      onBack={onBack} onSkip={onSkip} onNext={onNext} cta="GET MY PLAN"
    >
      <SectionLabel>Weight</SectionLabel>
      <View style={s.metricHead}>
        <Text style={s.metricLabel}>Weight</Text>
        <PillToggle options={['kg', 'lbs']} value={answers.weightUnit} onChange={changeWeightUnit} />
      </View>
      <View style={s.metricValue}>
        <Text style={s.metricNumber}>{weightDisplay}</Text>
        <Text style={s.metricUnit}>{answers.weightUnit}</Text>
      </View>
      <Ruler
        min={isLbs ? 88 : 40} max={isLbs ? 440 : 200} value={answers.weight}
        onChange={(v) => set({ weight: v })} labelEvery={isLbs ? 20 : 10}
      />

      <SectionLabel>Height</SectionLabel>
      <View style={s.metricHead}>
        <Text style={s.metricLabel}>Height</Text>
        <PillToggle options={['cm', 'ft']} value={answers.heightUnit} onChange={changeHeightUnit} />
      </View>
      <View style={s.metricValue}>
        <Text style={s.metricNumber}>{heightDisplay}</Text>
      </View>
      <Ruler
        min={isFt ? 48 : 120} max={isFt ? 84 : 220} value={isFt ? answers.heightInches : cm}
        onChange={(v) => set({ heightInches: isFt ? v : Math.round(v / 2.54) })}
        labelEvery={isFt ? 6 : 10}
      />
    </ScreenShell>
  );
}

/* ------------------------------------------------------------------ */
/* SCREEN 9 — Generating Plan (no top nav)                             */
/* ------------------------------------------------------------------ */
export function GeneratingPlanScreen({
  answers, ready, plan, onNext,
}: {
  answers: import('./answers').OnboardingAnswers;
  ready: boolean;
  plan: any;
  onNext: () => void;
}) {
  const [pct, setPct] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = anim.addListener(({ value }) => setPct(Math.round(value)));
    Animated.timing(anim, { toValue: 90, duration: 2600, useNativeDriver: false }).start();
    return () => {
      anim.removeListener(id);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Only finish once the AI plan has actually arrived.
  useEffect(() => {
    if (!ready) return;
    Animated.timing(anim, { toValue: 100, duration: 500, useNativeDriver: false }).start(({ finished }) => {
      if (finished) timer.current = setTimeout(onNext, 600);
    });
  }, [ready, anim, onNext]);

  const R = 86;
  const CIRC = 2 * Math.PI * R;
  const inches = answers.heightInches;
  const bodyText = `${Math.floor(inches / 12)}ft ${inches % 12}in, ${answers.weight.toFixed(1)}${answers.weightUnit}`;
  const levelLabels: Record<string, string> = {
    beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced',
  };
  const levelText = levelLabels[answers.pushupLevel || 'beginner'] || 'Beginner';

  return (
    <View style={s.genRoot}>
      <View style={s.genContent}>
        <Text style={s.genTitle}>GENERATING THE PLAN{'\n'}FOR YOU</Text>
        <Text style={s.genSub}>
          {ready ? 'AI finished analysing your answers.' : 'AI is analysing your 10 answers...'}
        </Text>

        <View style={s.ringWrap}>
          <Svg width={200} height={200}>
            <Defs>
              <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={C.blue1} />
                <Stop offset="1" stopColor={C.blue2} />
              </LinearGradient>
            </Defs>
            <Circle cx="100" cy="100" r={R} stroke="#E8E9EE" strokeWidth="12" fill="none" />
            <Circle
              cx="100" cy="100" r={R} stroke="url(#ringGrad)" strokeWidth="12" fill="none"
              strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct / 100)}
              strokeLinecap="round" transform="rotate(-90 100 100)"
            />
          </Svg>
          <View style={s.ringLabel}><Text style={s.ringPct}>{pct}%</Text></View>
        </View>

        <View style={s.checklist}>
          <View style={s.checkRow}>
            <View style={s.checkDone}><Text style={s.checkDoneText}>✓</Text></View>
            <Text style={s.checkText}>Analyze your body: <Text style={s.checkValue}>{bodyText}</Text></Text>
          </View>
          <View style={s.checkRow}>
            <View style={s.checkDone}><Text style={s.checkDoneText}>✓</Text></View>
            <Text style={s.checkText}>Match your fitness level: <Text style={s.checkValue}>{levelText}</Text></Text>
          </View>
          <View style={[s.checkRow, !ready && s.checkPending]}>
            {ready
              ? <View style={s.checkDone}><Text style={s.checkDoneText}>✓</Text></View>
              : <View style={s.checkDot} />}
            <Text style={s.checkText}>
              Build your plan: <Text style={s.checkValue}>{plan?.title || 'AI is writing it...'}</Text>
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* SCREEN 10 — Plan Ready (no top nav)                                 */
/* ------------------------------------------------------------------ */
export function PlanReadyScreen({
  plan, answers, onFinish,
}: { plan: any; answers: OnboardingAnswers; onFinish: () => void }) {
  // Every value below comes from the user's answers — no hard-coded placeholders.
  const local = buildLocalPlan(answers);
  const stats: Array<{ icon: any; label: string; value: string }> =
    (plan?.stats?.length ? plan.stats : local.stats).map((st: any, i: number) => ({
      icon: [IMG.statTime, IMG.statLevel, IMG.statTarget, IMG.statEquip][i % 4],
      label: st.label,
      value: String(st.value),
    }));
  const exercises: any[] = plan?.exercises?.length ? plan.exercises : local.exercises;
  const report = plan?.report?.assessment ? plan.report : local.report;
  const weekly: any[] = plan?.weeklySchedule?.length ? plan.weeklySchedule : local.weeklySchedule;
  return (
    <View style={s.readyRoot}>
      <ScrollView contentContainerStyle={s.readyContent} showsVerticalScrollIndicator={false}>
        <View style={s.readyAvatar}>
          <Image source={IMG.coach} resizeMode="contain" style={s.readyAvatarImg} />
        </View>
        <Text style={s.readyTitle}>Your plan is ready!</Text>
        <Text style={s.readySub}>{plan?.subtitle || local.subtitle}</Text>

        <View style={s.planCard}>
          <Image source={IMG.planCardBg} resizeMode="cover" style={s.planCardBg} />
          <View style={s.planCardShade} />
          <View style={s.planCardBody}>
            <View style={s.planBadge}>
              <Text style={s.planBadgeText}>
                {plan?.generatedBy === 'groq' ? 'AI CUSTOMIZED FOR YOU' : 'CUSTOMIZED FOR YOU'}
              </Text>
            </View>
            <Text style={s.planTitle}>{plan?.title || local.title}</Text>
            <View style={s.planStats}>
              {stats.map((st, i) => (
                <View key={`${st.label}-${i}`} style={s.statChip}>
                  <Image source={st.icon} resizeMode="contain" style={s.statIcon} />
                  <View style={s.statCopy}>
                    <Text style={s.statLabel}>{st.label}</Text>
                    <Text style={s.statValue}>{st.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {(plan?.summary || local.summary) &&
          <Text style={s.planSummary}>{plan?.summary || local.summary}</Text>}

        {exercises.length > 0 && (
          <View style={s.aiSection}>
            <Text style={s.aiHeading}>Exercises for you</Text>
            {exercises.map((ex, i) => (
              <View key={`${ex.name}-${i}`} style={s.exerciseRow}>
                <View style={s.exerciseNum}><Text style={s.exerciseNumText}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.exerciseName}>{ex.name}</Text>
                  <Text style={s.exerciseMeta}>{ex.sets ? `${ex.sets} sets · ` : ''}{ex.reps || ''}</Text>
                  {!!ex.note && <Text style={s.exerciseNote}>{ex.note}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        {weekly.length > 0 && (
          <View style={s.aiSection}>
            <Text style={s.aiHeading}>Your week</Text>
            {weekly.map((d: any, i: number) => (
              <View key={`${d.day}-${i}`} style={s.exerciseRow}>
                <View style={s.exerciseNum}><Text style={s.exerciseNumText}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.exerciseName}>{d.day}</Text>
                  <Text style={s.exerciseMeta}>{d.focus}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {!!report.assessment && (
          <View style={s.aiSection}>
            <Text style={s.aiHeading}>Your AI report</Text>
            <Text style={s.reportText}>{report.assessment}</Text>
            {!!report.strengths?.length && (
              <>
                <Text style={s.reportSubHeading}>Strengths</Text>
                {report.strengths.map((x: string, i: number) => <Text key={i} style={s.reportBullet}>• {x}</Text>)}
              </>
            )}
            {!!report.focusPoints?.length && (
              <>
                <Text style={s.reportSubHeading}>Focus areas</Text>
                {report.focusPoints.map((x: string, i: number) => <Text key={i} style={s.reportBullet}>• {x}</Text>)}
              </>
            )}
            {!!report.recommendations?.length && (
              <>
                <Text style={s.reportSubHeading}>Recommendations</Text>
                {report.recommendations.map((x: string, i: number) => <Text key={i} style={s.reportBullet}>• {x}</Text>)}
              </>
            )}
          </View>
        )}
      </ScrollView>
      <View style={s.readyFooter}>
        <GradientBox radius={28} style={s.ctaBox}>
          <TouchableOpacity onPress={onFinish} activeOpacity={0.9} style={s.cta}><Text style={s.ctaText}>START NOW</Text></TouchableOpacity>
        </GradientBox>
        <TouchableOpacity onPress={onFinish}><Text style={s.homeLink}>Go to homepage</Text></TouchableOpacity>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
const s = StyleSheet.create({
  genderRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  genderCard: {
    flex: 1, height: 340, borderRadius: 22, overflow: 'hidden',
    backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent',
  },
  genderCardActive: {
    borderWidth: 3, borderColor: C.blue1,
    shadowColor: C.blue2, shadowOpacity: 0.3, shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  genderImage: { width: '100%', height: '100%' },
  genderBadge: { position: 'absolute', bottom: 14, left: 12, right: 12, alignItems: 'center', paddingVertical: 10, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.94)' },
  genderBadgeText: { color: C.heading, fontWeight: '800', fontSize: 13, letterSpacing: 1 },
  genderBadgeTextOn: { color: C.blue2 },
  genderCheck: { position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 13, backgroundColor: C.blue2, alignItems: 'center', justifyContent: 'center' },
  genderCheckText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  genderHint: { textAlign: 'center', color: C.body, fontSize: 12, marginTop: 18 },
  genderLogin: { marginTop: 22, alignItems: 'center', paddingVertical: 12 },
  genderLoginText: { color: C.body, fontSize: 14 },
  genderLoginBold: { color: C.blue2, fontWeight: '800' },

  focusRow: { flexDirection: 'row', gap: 12, marginTop: 8, alignItems: 'stretch' },
  focusList: { width: '55%' },
  focusImageWrap: { width: '45%', height: 420, borderRadius: 16, overflow: 'hidden', backgroundColor: '#F4F5F9', borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  focusImage: { width: '100%', height: 420 },
  focusImageOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 10, alignItems: 'center' },
  focusPill: { backgroundColor: 'rgba(22,24,29,0.72)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  focusPillText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },

  infoBanner: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: C.lavender, borderRadius: 16, padding: 16, marginTop: 4, marginBottom: 14 },
  infoIcon: { width: 26, height: 26 },
  infoText: { flex: 1, color: C.body, fontSize: 13, lineHeight: 19 },
  cutoffHint: { height: 14, marginHorizontal: 8, overflow: 'hidden', opacity: 0.65 },
  cutoffCard: { height: 78, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', marginTop: -64 },
  scrollHint: { color: C.body, fontSize: 11, marginBottom: 12, textAlign: 'center' },

  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  dayCell: { width: '21%' },
  dayOn: { height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  dayOff: { height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff' },
  dayOnText: { color: '#fff', fontSize: 19, fontWeight: '800' },
  dayOffText: { color: C.heading, fontSize: 19, fontWeight: '700' },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 22 },
  dropdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 16, height: 56 },
  dropdownText: { color: C.heading, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  chevron: { fontSize: 24, color: C.body, lineHeight: 24 },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  dropdownList: { borderWidth: 1, borderColor: C.border, borderRadius: 14, marginTop: 6, overflow: 'hidden' },
  dropdownRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F2F5' },
  dropdownRowText: { color: C.body, fontSize: 14, fontWeight: '600' },
  dropdownRowTextOn: { color: C.blue2, fontWeight: '800' },

  metricHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricLabel: { color: C.body, fontSize: 14, fontWeight: '600' },
  metricValue: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginTop: 14 },
  metricNumber: { color: C.blue2, fontSize: 40, fontWeight: '800' },
  metricUnit: { color: C.blue2, fontSize: 18, fontWeight: '700' },
  rulerWrap: { height: 70, marginTop: 4, marginBottom: 6 },
  tick: { position: 'absolute', bottom: 24, width: 1, backgroundColor: '#C9CEDB' },
  tickLabel: { position: 'absolute', bottom: 20, left: -10, color: C.body, fontSize: 10 },
  indicator: { position: 'absolute', left: SW / 2 - 20, top: 0, bottom: 0, width: 2, alignItems: 'center' },
  indicatorLine: { width: 2, height: 46, backgroundColor: C.blue2, borderRadius: 1 },

  genRoot: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  genContent: { width: '100%', maxWidth: 420, alignItems: 'center', paddingHorizontal: 24 },
  genTitle: { textAlign: 'center', color: C.heading, fontSize: 22, fontWeight: '800', letterSpacing: 0.6, lineHeight: 28 },
  genSub: { textAlign: 'center', color: C.body, fontSize: 14, marginTop: 10 },
  ringWrap: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center', marginTop: 36 },
  ringLabel: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringPct: { color: C.heading, fontSize: 40, fontWeight: '800' },
  checklist: { width: '100%', marginTop: 40, gap: 18 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkDone: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.blue2, alignItems: 'center', justifyContent: 'center' },
  checkDoneText: { color: '#fff', fontWeight: '800' },
  checkDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#B9C0D0', marginHorizontal: 7 },
  checkText: { color: C.heading, fontSize: 14, flex: 1 },
  checkValue: { fontWeight: '800' },
  checkPending: { opacity: 0.45 },

  readyRoot: { flex: 1, backgroundColor: C.canvas },
  readyContent: { width: '100%', maxWidth: 420, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 20, alignItems: 'center' },
  readyAvatar: { width: 108, height: 108, borderRadius: 54, overflow: 'hidden', marginTop: 26, backgroundColor: '#EEF1FB', alignItems: 'center', justifyContent: 'center' },
  readyAvatarImg: { width: '100%', height: '100%' },
  readyTitle: { color: C.heading, fontSize: 26, fontWeight: '800', marginTop: 20, textAlign: 'center' },
  readySub: { color: C.body, fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 24, textAlign: 'center' },
  planCard: {
    width: '100%', height: 340, borderRadius: 24, overflow: 'hidden',
    shadowColor: C.blue2, shadowOpacity: 0.25, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  planCardBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  planCardShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,40,120,0.18)' },
  planCardBody: { flex: 1, padding: 18, justifyContent: 'space-between' },
  planBadge: { alignSelf: 'flex-start', backgroundColor: C.peach, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  planBadgeText: { color: C.peachText, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  planTitle: { color: '#fff', fontSize: 28, fontWeight: '800', lineHeight: 34, letterSpacing: -0.5, maxWidth: 220, textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  planStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statChip: {
    width: '47%', minHeight: 58, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  statIcon: { width: 22, height: 22, tintColor: '#FFFFFF' },
  statCopy: { flex: 1 },
  statLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10 },
  statValue: { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 2 },
  planSummary: { color: C.body, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 18 },
  aiSection: { width: '100%', marginTop: 26, backgroundColor: C.white, borderRadius: 20, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  aiHeading: { color: C.heading, fontSize: 17, fontWeight: '800', marginBottom: 12 },
  exerciseRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F1F5' },
  exerciseNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  exerciseNumText: { color: C.blue2, fontSize: 13, fontWeight: '800' },
  exerciseName: { color: C.heading, fontSize: 14, fontWeight: '700' },
  exerciseMeta: { color: C.blue2, fontSize: 12, fontWeight: '700', marginTop: 2 },
  exerciseNote: { color: C.body, fontSize: 12, marginTop: 3 },
  reportText: { color: C.body, fontSize: 13, lineHeight: 19 },
  reportSubHeading: { color: C.heading, fontSize: 13, fontWeight: '800', marginTop: 14, marginBottom: 4 },
  reportBullet: { color: C.body, fontSize: 13, lineHeight: 19 },

  readyFooter: { width: '100%', maxWidth: 420, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 10, paddingTop: 8, alignItems: 'center', gap: 12 },
  ctaBox: { width: '100%', height: 56 },
  cta: { height: 56, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 1.2 },
  homeLink: { color: C.blue2, fontSize: 14, textDecorationLine: 'underline', fontWeight: '600' },
});

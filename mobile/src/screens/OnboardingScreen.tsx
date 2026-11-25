import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { resetTo } from '../navigation/navigationRef';
import { aiApi } from '../api/client';
import {
  DEFAULT_ANSWERS, type OnboardingAnswers, type StepProps,
} from '../onboarding/answers';
import { buildLocalPlan } from '../onboarding/plan';
import {
  GenderScreen, FocusAreaScreen, MainGoalsScreen, MotivationScreen, PushupTestScreen,
  BodyConcernsScreen, ActivityLevelScreen, WeeklyGoalScreen, BodyMetricsScreen,
  GeneratingPlanScreen, PlanReadyScreen,
} from '../onboarding/screens';

type Phase = 'gender' | 'steps' | 'generating' | 'ready';

const STEP_SCREENS: Array<(p: StepProps) => React.ReactElement> = [
  FocusAreaScreen,
  MainGoalsScreen,
  MotivationScreen,
  PushupTestScreen,
  BodyConcernsScreen,
  ActivityLevelScreen,
  WeeklyGoalScreen,
  BodyMetricsScreen,
];

export default function OnboardingScreen() {
  const finish = useAppStore((s) => s.finishOnboarding);
  const [phase, setPhase] = useState<Phase>('gender');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>(DEFAULT_ANSWERS);
  const [plan, setPlan] = useState<any>(null);
  const [aiDone, setAiDone] = useState(false);
  const finishing = useRef(false);

  // A complete plan built from every answer is available immediately, so the
  // user never sees generic placeholder data while the AI is working.
  const localPlan = useMemo(() => buildLocalPlan(answers), [answers]);
  const shownPlan = plan || localPlan;

  // Ask the server for the AI plan. The Groq key stays server-side. If the
  // request fails for any reason, the answer-based local plan remains in use.
  useEffect(() => {
    if (phase !== 'generating') return;
    let active = true;
    setAiDone(false);
    aiApi.generate(answers)
      .then((res) => {
        const data = res?.data;
        if (!active || !data?.title || !Array.isArray(data.exercises) || !data.exercises.length) return;
        setPlan(data);
      })
      .catch(() => { /* keep the complete on-device plan */ })
      .finally(() => { if (active) setAiDone(true); });
    return () => { active = false; };
  }, [phase, answers]);

  // Device back button / gesture: step back through the questions instead of
  // leaving onboarding. The generating and ready screens cannot be bypassed.
  useEffect(() => {
    const onBack = () => {
      if (phase === 'gender') return true;
      if (phase === 'steps') {
        if (step > 0) setStep(step - 1);
        else setPhase('gender');
        return true;
      }
      return true; // generating / ready
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [phase, step]);

  const set = (patch: Partial<OnboardingAnswers>) =>
    setAnswers((prev) => ({ ...prev, ...patch }));

  // Gender is its own phase; its NEXT must move into the 8 numbered steps.
  const genderNext = () => setPhase('steps');
  const next = () => {
    if (step < STEP_SCREENS.length - 1) setStep(step + 1);
    else setPhase('generating');
  };
  const back = () => {
    if (phase === 'steps' && step === 0) setPhase('gender');
    else if (step > 0) setStep(step - 1);
  };

  const finishAll = async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      const goalMap: Record<string, string> = {
        lose_weight: 'lose_weight',
        build_muscle: 'build_muscle',
        keep_fit: 'stay_fit',
      };
      const diffMap: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 };
      await finish({
        gender: answers.gender || 'other',
        goal: goalMap[answers.goal || ''] || 'stay_fit',
        difficulty: diffMap[answers.pushupLevel || ''] || 1,
        focusAreas: answers.focusAreas,
        mainGoal: answers.goal || undefined,
        motivation: answers.motivation || undefined,
        pushupLevel: answers.pushupLevel || undefined,
        concerns: answers.concerns,
        activityLevel: answers.activityLevel || undefined,
        weeklyDays: answers.weeklyDays,
        firstDayOfWeek: answers.firstDayOfWeek,
        weightKg: answers.weightUnit === 'kg'
          ? answers.weight
          : Math.round((answers.weight / 2.20462) * 10) / 10,
        heightCm: Math.round(answers.heightInches * 2.54),
      });
      // An account is still required before the dashboard opens.
      resetTo('Auth');
    } finally {
      finishing.current = false;
    }
  };

  const common: StepProps = { answers, set, onNext: next, onBack: back, onSkip: finishAll };
  const genderProps: StepProps = {
    ...common,
    onNext: genderNext,
    onLogin: () => resetTo('Auth'),
  };

  if (phase === 'gender') return <GenderScreen {...genderProps} />;
  if (phase === 'generating') {
    return (
      <GeneratingPlanScreen
        answers={answers}
        ready={aiDone}
        plan={shownPlan}
        onNext={() => setPhase('ready')}
      />
    );
  }
  if (phase === 'ready') return <PlanReadyScreen plan={shownPlan} answers={answers} onFinish={finishAll} />;

  const Screen = STEP_SCREENS[step];
  return <Screen {...common} />;
}

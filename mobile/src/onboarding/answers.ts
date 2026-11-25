export interface OnboardingAnswers {
  gender: 'male' | 'female' | null;
  focusAreas: string[];
  goal: string | null;
  motivation: string | null;
  pushupLevel: string | null;
  concerns: string[];
  activityLevel: string | null;
  weeklyDays: number;
  firstDayOfWeek: string;
  weight: number;
  weightUnit: 'kg' | 'lbs';
  heightInches: number;
  heightUnit: 'cm' | 'ft';
}

export const DEFAULT_ANSWERS: OnboardingAnswers = {
  // Nothing preselected: NEXT stays disabled until the user chooses on each step.
  gender: null,
  focusAreas: [],
  goal: null,
  motivation: null,
  pushupLevel: null,
  concerns: [],
  activityLevel: null,
  weeklyDays: 0,
  firstDayOfWeek: 'SUNDAY',
  weight: 165,
  weightUnit: 'lbs',
  heightInches: 69,
  heightUnit: 'ft',
};

export type StepProps = {
  answers: OnboardingAnswers;
  set: (patch: Partial<OnboardingAnswers>) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  /** Optional shortcut shown on the first screen for returning users. */
  onLogin?: () => void;
};

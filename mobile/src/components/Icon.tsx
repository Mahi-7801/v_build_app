import React from 'react';
import {
  Home, Dumbbell, History, Settings, ArrowLeft, ChevronRight, Play, Pause,
  SkipForward, Check, X, Flame, Clock, Heart, Star, Crown, Bell, User, LogOut,
  Search, SlidersHorizontal, Share2, Plus, Minus, Info, Trophy, Bone,
  Accessibility, Footprints, Hand, Smile, HeartPulse, Zap, Armchair,
  PersonStanding, Activity, ChartNoAxesColumn, BarChart3,
  ChartColumnIncreasing, Target, Scale, Calendar, Award, Lock, Eye, EyeOff,
  type LucideIcon,
} from 'lucide-react-native';

export type IconName =
  | 'home' | 'workout' | 'history' | 'settings' | 'back' | 'chevron'
  | 'play' | 'pause' | 'skip' | 'check' | 'close' | 'flame' | 'clock'
  | 'dumbbell' | 'heart' | 'star' | 'crown' | 'bell' | 'user' | 'logout'
  | 'search' | 'filter' | 'share' | 'plus' | 'minus' | 'info' | 'trophy'
  | 'lowerBack' | 'shoulder' | 'ankle' | 'wrist'
  | 'smile' | 'heartPulse' | 'lightning' | 'sedentary' | 'walking' | 'running'
  | 'veryActive' | 'beginner' | 'intermediate' | 'advanced'
  | 'target' | 'scale' | 'muscle' | 'calendar' | 'award'
  | 'lock' | 'eye' | 'eyeOff';

/** Library-backed icons (lucide). Shared by every screen and onboarding step. */
const ICONS: Record<IconName, LucideIcon> = {
  home: Home,
  workout: Dumbbell,
  history: History,
  settings: Settings,
  back: ArrowLeft,
  chevron: ChevronRight,
  play: Play,
  pause: Pause,
  skip: SkipForward,
  check: Check,
  close: X,
  flame: Flame,
  clock: Clock,
  dumbbell: Dumbbell,
  heart: Heart,
  star: Star,
  crown: Crown,
  bell: Bell,
  user: User,
  logout: LogOut,
  search: Search,
  filter: SlidersHorizontal,
  share: Share2,
  plus: Plus,
  minus: Minus,
  info: Info,
  trophy: Trophy,
  lowerBack: Bone,
  shoulder: Accessibility,
  ankle: Footprints,
  wrist: Hand,
  smile: Smile,
  heartPulse: HeartPulse,
  lightning: Zap,
  sedentary: Armchair,
  walking: PersonStanding,
  running: Footprints,
  veryActive: Activity,
  beginner: ChartNoAxesColumn,
  intermediate: BarChart3,
  advanced: ChartColumnIncreasing,
  target: Target,
  scale: Scale,
  muscle: Dumbbell,
  calendar: Calendar,
  award: Award,
  lock: Lock,
  eye: Eye,
  eyeOff: EyeOff,
};

/** Media glyphs look better filled rather than outlined. */
const FILLED = new Set<IconName>(['play', 'pause', 'skip']);

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color = '#1C212C', strokeWidth = 2 }: Props) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      width={size}
      height={size}
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      fill={FILLED.has(name) ? color : 'none'}
    />
  );
}

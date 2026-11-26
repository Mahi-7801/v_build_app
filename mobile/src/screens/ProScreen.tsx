import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, Linking, AppState } from 'react-native';
import { Text } from '../components/LocalizedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme/colors';
import { radius, spacing, typography, shadows } from '../theme/theme';
import { Icon, IconName } from '../components/Icon';
import { Button } from '../components/Button';
import { Brand } from '../components/Brand';
import { C, GradientBox } from '../onboarding/design';
import { useAppStore } from '../store/useAppStore';
import { subscriptionsApi } from '../api/client';
import { formatMoney, formatPoints } from '../points';

const FEATURES: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'dumbbell', title: 'All premium workouts', body: 'Unlock every plan, including Broad Shoulders and advanced HIIT.' },
  { icon: 'star', title: 'Personalized plans', body: 'Adaptive difficulty based on your level and goals.' },
  { icon: 'clock', title: 'Advanced analytics', body: 'Track calories, streaks and exercise history in detail.' },
  { icon: 'bell', title: 'Smart reminders', body: 'Never miss a session with scheduled workout reminders.' },
  { icon: 'crown', title: 'No interruptions', body: 'An ad-free training experience.' },
  { icon: 'award', title: 'Unlimited plans', body: 'Save and follow as many workout plans as you like.' },
  { icon: 'flame', title: 'Fire-point rewards', body: 'Earn points on every workout and unlock member-only prices.' },
  { icon: 'play', title: 'Exercise animations', body: 'Watch proper form with animated exercise demonstrations.' },
  { icon: 'heartPulse', title: 'Detailed progress', body: 'Full history, exercise stats and body-metric tracking.' },
  { icon: 'target', title: 'Priority support', body: 'Get help faster with dedicated member support.' },
];

export default function ProScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, refreshUser, refreshConfig, pointsTarget, proDiscountPercent, proPriceCents, supportEmail, supportAddress, paymentCurrency } = useAppStore();
  const [busy, setBusy] = React.useState(false);
  const [awaitingPayment, setAwaitingPayment] = React.useState(false);
  const [payStatus, setPayStatus] = React.useState<{
    tone: 'error' | 'info' | 'success'; title: string; message: string; url?: string;
  } | null>(null);

  // Always derive the price from the admin-editable config so a price changed
  // in Admin Settings shows up for existing users without re-login.
  const points = Number(user?.points || 0);
  const hasFireReward = points >= pointsTarget;
  const discount = hasFireReward ? proDiscountPercent : 0;
  const priceCents = hasFireReward
    ? Math.round(proPriceCents * (100 - proDiscountPercent) / 100)
    : proPriceCents;
  const priceText = formatMoney(priceCents / 100, paymentCurrency);
  const monthlyText = formatMoney(priceCents / 100 / 12, paymentCurrency);

  // Refresh pricing when the PRO screen opens and when the app returns from background.
  useFocusEffect(React.useCallback(() => { refreshConfig(); }, [refreshConfig]));
  React.useEffect(() => {
    const onForeground = (state: string) => { if (state === 'active') refreshConfig(); };
    const subscription = AppState.addEventListener('change', onForeground);
    return () => subscription.remove();
  }, [refreshConfig]);

  /** Called when the browser returns to the app (or while polling) after checkout. */
  const confirmPayment = React.useCallback(async (manualCheck = false) => {
    try {
      const { data } = await subscriptionsApi.status();
      if (data.isPro) {
        setAwaitingPayment(false);
        setPayStatus({
          tone: 'success',
          title: 'Payment complete',
          message: 'PRO is active. All premium workouts are unlocked.',
        });
        await refreshUser();
        Alert.alert('Payment complete', 'PRO is active. All premium workouts are unlocked.');
        nav.goBack();
        return true;
      }
      if (manualCheck) {
        setPayStatus({
          tone: 'info',
          title: 'Waiting for confirmation',
          message: 'Payment has not been confirmed yet. Finish checkout in the opened tab, then tap Check Status.',
        });
      }
    } catch { /* keep waiting */ }
    return false;
  }, [nav, refreshUser]);

  React.useEffect(() => {
    if (!awaitingPayment) return;
    const onState = (state: string) => { if (state === 'active') confirmPayment(); };
    const subscription = AppState.addEventListener('change', onState);
    const onFocus = () => { confirmPayment(); };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
    }
    const poll = setInterval(() => {
      if (Platform.OS === 'web' || AppState.currentState === 'active') confirmPayment();
    }, 6000);
    return () => {
      subscription.remove();
      clearInterval(poll);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
      }
    };
  }, [awaitingPayment, confirmPayment]);

  const subscribe = async () => {
    setPayStatus(null);
    if (!user) {
      setPayStatus({ tone: 'info', title: 'Sign in required', message: 'Please sign in before subscribing.' });
      Alert.alert('Sign in required', 'Please sign in before subscribing.');
      nav.navigate('Auth');
      return;
    }
    setBusy(true);
    try {
      // Secret Razorpay keys are used only on the server. The app gets a public
      // hosted checkout URL and completes payment in the device browser.
      const { data } = await subscriptionsApi.createPaymentLink();
      if (!data?.url) throw new Error('no_checkout_url');
      setAwaitingPayment(true);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        const canOpen = await Linking.canOpenURL(data.url);
        if (canOpen) await Linking.openURL(data.url);
      }
      setPayStatus({
        tone: 'info',
        title: 'Complete your payment',
        message: 'Finish checkout in the opened browser tab. PRO unlocks automatically once confirmed.',
        url: data.url,
      });
      Alert.alert(
        'Complete your payment',
        'Finish the payment in your browser. PRO unlocks automatically once Razorpay confirms it.'
      );
    } catch (e: any) {
      const message = e?.response?.data?.message
        || 'Payment is not available yet. Ask the admin to add Razorpay keys in Settings.';
      setPayStatus({ tone: 'error', title: 'Payment unavailable', message });
      Alert.alert('Payment unavailable', message);
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="close" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.crownWrap}>
            <Icon name="crown" size={38} color={colors.pro} />
          </View>
          <View style={styles.brandRow}>
            <Brand size={26} centered />
            <View style={styles.proTag}>
              <Text style={styles.proTagText}>PRO</Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>Take your training to the next level</Text>
          <Text style={styles.heroSub}>
            Get full access to all workouts, smart timers, personalized adaptive plans, and in-depth performance analytics.
          </Text>
        </View>

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Icon name={f.icon} size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureBody}>{f.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {!user?.is_pro ? (
          <View style={styles.planCard}>
            <View style={styles.planTop}>
              <Text style={styles.planName}>Yearly</Text>
              <View style={styles.saveChip}>
                <Text style={styles.saveText}>
                  {discount > 0 ? `${proDiscountPercent}% FIRE REWARD` : 'SAVE 50%'}
                </Text>
              </View>
            </View>
            {discount > 0 && <Text style={styles.oldPrice}>{formatMoney(proPriceCents / 100, paymentCurrency)}</Text>}
            <Text style={[styles.price, discount > 0 && { marginTop: 2 }]}>
              {priceText}<Text style={styles.per}>/year</Text>
            </Text>
            <Text style={styles.priceSub}>
              {discount > 0
                ? `${proDiscountPercent}% off applied from your ${formatPoints(points)} fire points`
                : `Just ${monthlyText} per month`}
            </Text>
            {discount === 0 && (
              <View style={styles.pointsProgress}>
                <View style={styles.pointsTrack}>
                  <View style={[styles.pointsFill, { width: `${Math.min(100, points / pointsTarget * 100)}%` }]} />
                </View>
                <Text style={styles.pointsHint}>
                  {formatPoints(points)} / {formatPoints(pointsTarget)} fire points · reach 5,000 for {proDiscountPercent}% off
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.membershipBanner}>
            <View style={styles.membershipRow}>
              <Icon name="crown" size={18} color="#7A4B00" />
              <Text style={styles.membershipTitle}>PRO MEMBERSHIP ACTIVE</Text>
            </View>
            <Text style={styles.membershipSub}>
              All premium routines, advanced statistics, and personalized training plans are fully unlocked on this account.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {!!payStatus && (
          <View style={[
            styles.statusBanner,
            payStatus.tone === 'error' ? styles.statusBannerErr
              : payStatus.tone === 'success' ? styles.statusBannerOk
              : styles.statusBannerInfo,
          ]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusBannerTitle}>{payStatus.title}</Text>
              <Text style={styles.statusBannerMsg}>{payStatus.message}</Text>
              {!!payStatus.url && (
                <View style={styles.statusActions}>
                  <TouchableOpacity
                    onPress={() => (Platform.OS === 'web' && typeof window !== 'undefined'
                      ? window.open(payStatus.url!, '_blank', 'noopener,noreferrer')
                      : Linking.openURL(payStatus.url!))}
                    style={styles.statusBtn}
                  >
                    <Text style={styles.statusBtnText}>Open checkout</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmPayment(true)} style={styles.statusBtnOutline}>
                    <Text style={styles.statusBtnOutlineText}>Check status</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={() => setPayStatus(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
        {user?.is_pro ? (
          <GradientBox radius={20} style={styles.activeCard} colors={['#FFB020', '#FF8A00']}>
            <View style={styles.activeCrown}>
              <Icon name="crown" size={28} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.activeTitleRow}>
                <Text style={styles.activeTitle}>PRO ACTIVE</Text>
                <View style={styles.activeCheck}>
                  <Icon name="check" size={12} color="#FF8A00" strokeWidth={3} />
                </View>
              </View>
              <Text style={styles.activeSub}>All premium workouts unlocked</Text>
              <Text style={styles.activePlan}>Yearly membership · Full access</Text>
            </View>
          </GradientBox>
        ) : (
          <Button
            title="Unlock PRO"
            onPress={subscribe}
            loading={busy}
            full
            icon={<Icon name="crown" size={18} color={colors.white} />}
          />
        )}
        <TouchableOpacity
          onPress={() => nav.goBack()}
          style={styles.maybe}
          hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
        >
          <Text style={styles.maybeText}>Maybe later</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Linking.openURL(`mailto:${supportEmail || 'support@vbuild.app'}?subject=PRO%20support`).catch(() => {})}
          style={styles.support}
        >
          <Icon name="info" size={15} color={colors.primary} />
          <Text style={styles.supportText}>Priority support — {supportEmail || 'contact us'}</Text>
        </TouchableOpacity>
        {!!supportAddress && <Text style={styles.supportAddress}>{supportAddress}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  crownWrap: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#FFF8E7',
    borderWidth: 2,
    borderColor: '#FFE8B3',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.pro,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.md,
  },
  proTag: {
    backgroundColor: colors.pro,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  proTagText: {
    color: '#7A4B00',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  heroTitle: {
    ...typography.h2,
    fontSize: 22,
    color: colors.text,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  heroSub: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  features: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  feature: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadows.card,
  },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EAF0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  featureBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 3,
  },
  planCard: {
    marginTop: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.card,
  },
  planTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planName: {
    ...typography.h3,
    color: colors.text,
  },
  saveChip: {
    backgroundColor: '#FFF0D6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  saveText: {
    ...typography.tiny,
    color: colors.pro,
    fontWeight: '800',
  },
  oldPrice: {
    ...typography.body,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
    marginTop: spacing.md,
  },
  price: {
    ...typography.h1,
    color: colors.primary,
    marginTop: spacing.md,
  },
  per: {
    ...typography.body,
    color: colors.textSecondary,
  },
  priceSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pointsProgress: { marginTop: spacing.md },
  pointsTrack: { height: 7, borderRadius: 4, backgroundColor: '#F0F1F5', overflow: 'hidden' },
  pointsFill: { height: 7, borderRadius: 4, backgroundColor: '#FF9A3D' },
  pointsHint: { ...typography.tiny, color: colors.textMuted, marginTop: 6 },
  membershipBanner: {
    marginTop: spacing.xl,
    backgroundColor: '#FFF8E7',
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: '#FFE4B3',
    ...shadows.card,
  },
  membershipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  membershipTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#7A4B00',
    letterSpacing: 0.8,
  },
  membershipSub: {
    fontSize: 12,
    lineHeight: 18,
    color: '#8A5800',
    marginTop: 6,
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    shadowColor: '#FF8A00',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  activeCrown: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  activeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeTitle: {
    color: C.white,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  activeCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeSub: {
    color: C.white,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  activePlan: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  maybe: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  maybeText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  support: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  supportText: { ...typography.tiny, color: colors.primary, fontWeight: '800' },
  supportAddress: {
    ...typography.tiny, color: colors.textMuted,
    textAlign: 'center', paddingBottom: 6, lineHeight: 15,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 11,
    marginBottom: 10,
  },
  statusBannerErr: { backgroundColor: '#FFE9E9', borderColor: '#FFD0D0' },
  statusBannerInfo: { backgroundColor: '#EAF0FF', borderColor: '#C8D8FF' },
  statusBannerOk: { backgroundColor: '#E7F8EF', borderColor: '#BCEFD3' },
  statusBannerTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  statusBannerMsg: { color: colors.textSecondary, fontSize: 11, marginTop: 2, lineHeight: 16 },
  statusActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  statusBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 },
  statusBtnText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  statusBtnOutline: {
    backgroundColor: colors.white, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary,
    paddingHorizontal: 11, paddingVertical: 6,
  },
  statusBtnOutlineText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
});

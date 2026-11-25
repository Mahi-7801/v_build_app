import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, BackHandler } from 'react-native';
import { Text } from '../components/LocalizedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { apiMessage } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { resetTo } from '../navigation/navigationRef';
import { C, GradientBox } from '../onboarding/design';
import { Brand } from '../components/Brand';

export default function AuthScreen() {
  const login = useAppStore((s) => s.login);
  const register = useAppStore((s) => s.register);
  const profile = useAppStore((s) => s.profile);
  const signedOut = useAppStore((s) => s.signedOut);
  const [mode, setMode] = useState<'login' | 'register'>(profile.name ? 'register' : 'login');
  const [email, setEmail] = useState(profile.name ? '' : 'demo@homeworkout.app');
  const [password, setPassword] = useState(profile.name ? '' : 'workout123');
  const [name, setName] = useState(profile.name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // After a manual sign-out the login screen is the root, so back does nothing.
  // During first-run onboarding it still returns to the questions.
  useEffect(() => {
    const onBack = () => {
      if (!signedOut) resetTo('Onboarding');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [signedOut]);

  const submit = async () => {
    setError('');
    if (mode === 'register' && !name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, name.trim());
      // The configured admin account opens the control panel; everyone else
      // lands on the normal user dashboard.
      resetTo(useAppStore.getState().user?.is_admin ? 'Admin' : 'Main');
    } catch (e) {
      setError(apiMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {!signedOut && (
            <TouchableOpacity onPress={() => resetTo('Onboarding')} style={styles.back} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="back" size={22} color={C.heading} />
            </TouchableOpacity>
          )}
          <View style={styles.hero}>
            <GradientBox radius={22} style={styles.mark}><Icon name="dumbbell" size={34} color={C.white} /></GradientBox>
            <Brand size={26} centered />
            <Text style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</Text>
            <Text style={styles.sub}>
              {mode === 'login'
                ? 'Sign in to continue your training and track progress.'
                : 'Start your fitness journey — it only takes a minute.'}
            </Text>
          </View>

          <View style={styles.segment}>
            <TouchableOpacity
              onPress={() => { setMode('login'); setError(''); }}
              style={styles.segmentItem}
            >
              {mode === 'login'
                ? <GradientBox radius={14} style={styles.segmentOn}><Text style={styles.segmentOnText}>LOG IN</Text></GradientBox>
                : <View style={styles.segmentOff}><Text style={styles.segmentOffText}>LOG IN</Text></View>}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setMode('register'); setError(''); }}
              style={styles.segmentItem}
            >
              {mode === 'register'
                ? <GradientBox radius={14} style={styles.segmentOn}><Text style={styles.segmentOnText}>SIGN UP</Text></GradientBox>
                : <View style={styles.segmentOff}><Text style={styles.segmentOffText}>SIGN UP</Text></View>}
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            {mode === 'register' && (
              <Field icon="user" placeholder="Your name" value={name} onChange={setName} autoCapitalize="words" />
            )}
            <Field icon="user" placeholder="Email address" value={email} onChange={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <Field icon="lock" placeholder="Password" value={password} onChange={setPassword} secure />
            {!!error && <View style={styles.errorBox}><Text style={styles.error}>{error}</Text></View>}

            <GradientBox radius={28} style={[styles.ctaBox, busy && styles.ctaBusy]}>
              <TouchableOpacity onPress={submit} disabled={busy} activeOpacity={0.9} style={styles.cta}>
                <Text style={styles.ctaText}>{busy ? 'PLEASE WAIT…' : mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}</Text>
              </TouchableOpacity>
            </GradientBox>

            {mode === 'login' && (
              <View style={styles.demo}>
                <Text style={styles.demoLabel}>DEMO ACCOUNT</Text>
                <Text style={styles.demoText}>demo@homeworkout.app · workout123</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  icon, placeholder, value, onChange, secure, autoCapitalize, keyboardType,
}: {
  icon: any; placeholder: string; value: string; onChange: (v: string) => void;
  secure?: boolean; autoCapitalize?: any; keyboardType?: any;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={styles.field}>
      <View style={styles.fieldIcon}><Icon name={icon} size={19} color={C.blue2} /></View>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={C.body}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure && !revealed}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
      />
      {secure && (
        <TouchableOpacity
          onPress={() => setRevealed((v) => !v)}
          style={styles.fieldIcon}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
        >
          <Icon name={revealed ? 'eyeOff' : 'eye'} size={19} color={C.blue2} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas },
  flex: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 28 },
  back: { alignSelf: 'flex-start', padding: 6, marginBottom: 12 },
  hero: { alignItems: 'center' },
  mark: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 14 },
  brandOne: { color: C.heading, fontSize: 24, fontWeight: '800', letterSpacing: 1 },
  brandTwo: { color: C.blue2, fontSize: 24, fontWeight: '400', letterSpacing: 1 },
  title: { color: C.heading, fontSize: 25, fontWeight: '800', letterSpacing: -0.5, marginTop: 12, textAlign: 'center' },
  sub: { color: C.body, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },

  segment: { flexDirection: 'row', backgroundColor: '#EDF0F7', borderRadius: 16, padding: 4, marginTop: 28 },
  segmentItem: { flex: 1 },
  segmentOn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  segmentOnText: { color: C.white, fontSize: 13, fontWeight: '800', letterSpacing: 0.8 },
  segmentOff: { height: 44, alignItems: 'center', justifyContent: 'center' },
  segmentOffText: { color: C.body, fontSize: 13, fontWeight: '700', letterSpacing: 0.8 },

  form: { marginTop: 26, gap: 14 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.white, borderWidth: 1, borderColor: '#E5E7EF',
    borderRadius: 16, paddingHorizontal: 14, height: 58,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  fieldIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, color: C.heading, fontSize: 15, fontWeight: '600' },
  errorBox: { backgroundColor: '#FDECEC', borderRadius: 12, padding: 12 },
  error: { color: '#C0392B', fontSize: 13, fontWeight: '600' },

  ctaBox: { height: 56, marginTop: 8, shadowColor: C.blue2, shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  ctaBusy: { opacity: 0.6 },
  cta: { height: 56, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: C.white, fontSize: 15, fontWeight: '800', letterSpacing: 1.2 },

  demo: { alignItems: 'center', marginTop: 22, padding: 14, borderRadius: 14, backgroundColor: C.white },
  demoLabel: { color: C.body, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  demoText: { color: C.heading, fontSize: 13, fontWeight: '700', marginTop: 4 },
});

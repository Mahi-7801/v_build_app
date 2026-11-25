import React from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from './LocalizedText';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/theme';

type State = { error: Error | null };

/** Shows a readable error instead of a silent white screen. */
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.kicker}>APP ERROR</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Text style={styles.hint}>Send this message to your developer if it keeps happening.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => this.setState({ error: null })}>
            <Text style={styles.btnText}>RETRY</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white, justifyContent: 'center' },
  content: { padding: spacing.xl },
  kicker: { ...typography.tiny, color: colors.danger, fontWeight: '900', letterSpacing: 1.2 },
  title: { ...typography.h2, color: colors.text, marginTop: 8 },
  message: {
    ...typography.caption, color: colors.text, backgroundColor: '#FFF1F1',
    borderRadius: radius.lg, padding: spacing.md, marginTop: 16,
  },
  hint: { ...typography.tiny, color: colors.textMuted, marginTop: 12 },
  btn: { backgroundColor: colors.primary, borderRadius: radius.pill, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  btnText: { ...typography.bodyBold, color: colors.white },
});

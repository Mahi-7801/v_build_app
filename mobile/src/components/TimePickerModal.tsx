import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, Modal, TouchableOpacity,
} from 'react-native';
import { Text } from './LocalizedText';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/theme';
import { Icon } from './Icon';

const SIZE = 244;
const CENTER = SIZE / 2;
const MARKER_RADIUS = 88;

type Mode = 'hour' | 'minute';

const pad = (n: number) => String(n).padStart(2, '0');

function parseTime(value: string) {
  const [h, m] = value.split(':').map(Number);
  return {
    hour: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 0,
    minute: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
  };
}

/** Analog clock face used to pick a time without typing it. */
export function TimePickerModal({
  visible, initialTime, onClose, onConfirm,
}: {
  visible: boolean;
  initialTime: string;
  onClose: () => void;
  onConfirm: (time: string) => void;
}) {
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);
  const [mode, setMode] = useState<Mode>('hour');

  useEffect(() => {
    if (!visible) return;
    const parsed = parseTime(initialTime);
    setHour(parsed.hour);
    setMinute(parsed.minute);
    setMode('hour');
  }, [visible, initialTime]);

  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const isPM = hour >= 12;
  const handValue = mode === 'hour' ? hour12 : minute / 5;
  const markers = mode === 'hour'
    ? Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))
    : Array.from({ length: 12 }, (_, i) => ({ value: i * 5, label: pad(i * 5) }));
  const selectedValue = mode === 'hour' ? hour12 : minute;

  const pick = (value: number) => {
    if (mode === 'hour') {
      const base = isPM ? 12 : 0;
      setHour(base + (value % 12));
      setMode('minute');
    } else {
      setMinute(value);
    }
  };

  const setPeriod = (pm: boolean) => setHour((pm ? 12 : 0) + (hour % 12));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.head}>
            <View style={styles.headIcon}><Icon name="clock" size={18} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>WORKOUT REMINDER</Text>
              <Text style={styles.title}>Choose a time</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.close}>
              <Icon name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.display}>
            <TouchableOpacity onPress={() => setMode('hour')} style={[styles.displayPart, mode === 'hour' && styles.displayPartOn]}>
              <Text style={[styles.displayText, mode === 'hour' && styles.displayTextOn]}>{pad(hour12)}</Text>
            </TouchableOpacity>
            <Text style={styles.colon}>:</Text>
            <TouchableOpacity onPress={() => setMode('minute')} style={[styles.displayPart, mode === 'minute' && styles.displayPartOn]}>
              <Text style={[styles.displayText, mode === 'minute' && styles.displayTextOn]}>{pad(minute)}</Text>
            </TouchableOpacity>
            <View style={styles.period}>
              <TouchableOpacity onPress={() => setPeriod(false)} style={[styles.periodBtn, !isPM && styles.periodBtnOn]}>
                <Text style={[styles.periodText, !isPM && styles.periodTextOn]}>AM</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPeriod(true)} style={[styles.periodBtn, isPM && styles.periodBtnOn]}>
                <Text style={[styles.periodText, isPM && styles.periodTextOn]}>PM</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.summary}>
            Selected: {pad(hour12)}:{pad(minute)} {isPM ? 'PM' : 'AM'} (24h: {pad(hour)}:{pad(minute)})
          </Text>

          <View style={styles.dial}>
            <View style={styles.dialRing} />
            <View
              style={[
                styles.hand,
                { transform: [{ rotate: `${handValue * 30}deg` }] },
              ]}
            />
            <View style={styles.centerCap}>
              <Text style={styles.centerText}>{mode === 'hour' ? hour12 : pad(minute)}</Text>
            </View>
            {markers.map((marker) => {
              const angle = ((marker.value % 12) * 30 - 90) * Math.PI / 180;
              const left = CENTER + MARKER_RADIUS * Math.cos(angle);
              const top = CENTER + MARKER_RADIUS * Math.sin(angle);
              const active = selectedValue === marker.value;
              return (
                <TouchableOpacity
                  key={marker.label}
                  onPress={() => pick(marker.value)}
                  style={[
                    styles.marker,
                    { left: left - 19, top: top - 19 },
                    active && styles.markerOn,
                  ]}
                >
                  <Text style={[styles.markerText, active && styles.markerTextOn]}>{marker.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.fineRow}>
            <Text style={styles.fineHint}>Fine tune minutes</Text>
            <View style={styles.fineButtons}>
              <TouchableOpacity style={styles.fineBtn} onPress={() => setMinute((minute + 59) % 60)}>
                <Text style={styles.fineBtnText}>-1</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.fineBtn} onPress={() => setMinute((minute + 1) % 60)}>
                <Text style={styles.fineBtnText}>+1</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onConfirm(`${pad(hour)}:${pad(minute)}`)}
              style={styles.save}
            >
              <Text style={styles.saveText}>SET TIME</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,16,32,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.white, borderRadius: 22, padding: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#EAF0FF', alignItems: 'center', justifyContent: 'center' },
  kicker: { ...typography.tiny, color: colors.primary, fontWeight: '900', letterSpacing: 1.2 },
  title: { ...typography.h3, color: colors.text, marginTop: 2 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },

  display: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: 16 },
  displayPart: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.md },
  displayPartOn: { backgroundColor: '#EAF0FF' },
  displayText: { fontSize: 36, fontWeight: '900', color: colors.text, minWidth: 48, textAlign: 'center' },
  displayTextOn: { color: colors.primary },
  colon: { fontSize: 30, fontWeight: '900', color: colors.textMuted, marginTop: -4 },
  period: { marginLeft: 8, gap: 4 },
  periodBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: colors.canvas },
  periodBtnOn: { backgroundColor: colors.primary },
  periodText: { fontSize: 10, fontWeight: '900', color: colors.textMuted },
  periodTextOn: { color: colors.white },

  summary: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },
  dial: { width: SIZE, height: SIZE, alignSelf: 'center', marginTop: 10, position: 'relative' },
  dialRing: {
    ...StyleSheet.absoluteFill, borderRadius: SIZE / 2,
    backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border,
  },
  hand: {
    position: 'absolute', left: CENTER - 1.5, top: CENTER - 84,
    width: 3, height: 84, borderRadius: 2, backgroundColor: colors.primary,
    transformOrigin: '50% 100%',
  },
  centerCap: {
    position: 'absolute', left: CENTER - 26, top: CENTER - 26,
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.primary,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  centerText: { fontSize: 18, fontWeight: '900', color: colors.primary },
  marker: {
    position: 'absolute', width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  markerOn: { backgroundColor: colors.primary },
  markerText: { fontSize: 13, fontWeight: '800', color: colors.textSecondary },
  markerTextOn: { color: colors.white },

  fineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  fineHint: { ...typography.caption, color: colors.textSecondary },
  fineButtons: { flexDirection: 'row', gap: 8 },
  fineBtn: { minWidth: 40, height: 32, borderRadius: radius.sm, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  fineBtnText: { ...typography.bodyBold, color: colors.primary },

  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancel: { flex: 1, height: 46, borderRadius: radius.pill, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...typography.bodyBold, color: colors.textMuted },
  save: { flex: 1.4, height: 46, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: colors.white, fontWeight: '900', letterSpacing: 1 },
});

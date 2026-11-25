import React from 'react';
import {
  View, StyleSheet, Modal, TouchableOpacity, Animated,
} from 'react-native';
import { Text } from './LocalizedText';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/theme';
import { Icon } from './Icon';

export type SelectOption = { label: string; value: string | number };

/** Calendar-style dropdown for preference rows (goal / difficulty / units). */
export function SelectModal({
  visible, title, options, selected, onSelect, onClose,
}: {
  visible: boolean;
  title: string;
  options: SelectOption[];
  selected: string | number;
  onSelect: (value: string | number) => void;
  onClose: () => void;
}) {
  const pop = React.useRef(new Animated.Value(0.9)).current;
  React.useEffect(() => {
    if (visible) {
      pop.setValue(0.9);
      Animated.spring(pop, { toValue: 1, friction: 7, useNativeDriver: true }).start();
    }
  }, [visible, pop]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, { transform: [{ scale: pop }] }]}>
          <View style={styles.head}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.close}>
              <Icon name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.options}>
            {options.map((o) => (
              <TouchableOpacity
                key={String(o.value)}
                onPress={() => { onSelect(o.value); onClose(); }}
                style={[styles.option, selected === o.value && styles.optionActive]}
              >
                <Text style={[styles.optionText, selected === o.value && styles.optionTextActive]}>
                  {o.label}
                </Text>
                {selected === o.value && <Icon name="check" size={17} color={colors.primary} strokeWidth={3} />}
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,16,32,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.white, borderRadius: 22, padding: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { ...typography.h3, color: colors.text },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  options: { gap: 8 },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.canvas, borderRadius: radius.md,
    paddingVertical: 13, paddingHorizontal: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  optionActive: { backgroundColor: '#EAF0FF', borderColor: colors.primary },
  optionText: { ...typography.bodyBold, color: colors.textSecondary },
  optionTextActive: { color: colors.primary },
  cancel: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
  cancelText: { ...typography.bodyBold, color: colors.textMuted },
});

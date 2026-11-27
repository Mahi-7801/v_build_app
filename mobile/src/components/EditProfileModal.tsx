import React from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Alert, Image, ActivityIndicator } from 'react-native';
import { Text } from './LocalizedText';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/theme';
import { Icon } from './Icon';
import { usersApi, apiMessage, resolveAssetUrl } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { resetTo } from '../navigation/navigationRef';
import type { User } from '../types';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export function EditProfileModal({
  visible, onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { user, setUser, refreshUser } = useAppStore();
  const u = user as User | null;
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [avatar, setAvatar] = React.useState('');
  const [previewError, setPreviewError] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      setName(u?.display_name || '');
      setEmail(u?.email || '');
      setPhone(u?.phone || '');
      setAvatar(u?.avatar_url || '');
      setPreviewError(false);
    }
  }, [visible, u]);

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo access to pick a profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.55,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      let b64 = (asset.base64 || '').replace(/\s+/g, '');
      if (!b64 && asset.uri) {
        try {
          b64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } catch {
          b64 = '';
        }
      }
      if (!b64) {
        Alert.alert('Upload failed', 'Could not read image data from your gallery. Try a JPG or PNG photo.');
        return;
      }
      const approxBytes = Math.floor((b64.length * 3) / 4);
      if (approxBytes > MAX_IMAGE_BYTES) {
        Alert.alert('Image too large', 'Please pick a photo smaller than 3 MB.');
        return;
      }
      const rawMime = String(asset.mimeType || '').toLowerCase();
      const mime = rawMime === 'image/png' ? 'image/png'
        : rawMime === 'image/webp' ? 'image/webp'
        : rawMime === 'image/gif' ? 'image/gif'
        : 'image/jpeg';
      setPreviewError(false);
      setAvatar(`data:${mime};base64,${b64}`);
    } catch (e) {
      Alert.alert('Could not open gallery', apiMessage(e));
    }
  };

  const save = async () => {
    if (!u) {
      Alert.alert('Sign in required', 'Sign in to save and sync your profile photo and details.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => { onClose(); resetTo('Auth'); } },
      ]);
      return;
    }
    if (!name.trim()) return Alert.alert('Name required', 'Please enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return Alert.alert('Email', 'Enter a valid email address.');
    setBusy(true);
    try {
      const nextAvatar = avatar.trim() || null;
      const { data } = await usersApi.updateMe({
        display_name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        avatar_url: nextAvatar,
      });
      if (data?.user) {
        await setUser(data.user);
      }
      await refreshUser();
      Alert.alert('Saved', 'Your profile was updated.');
      onClose();
    } catch (e) {
      Alert.alert('Could not save', apiMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const avatarPreviewUri = !previewError && avatar
    ? (resolveAssetUrl(avatar) || avatar)
    : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>Edit profile</Text>
            <TouchableOpacity onPress={onClose} style={styles.close}>
              <Icon name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.photoSection}>
            <View style={styles.photoHeader}>
              <Text style={styles.sectionLabel}>PROFILE PHOTO</Text>
              {!!avatar && (
                <TouchableOpacity onPress={() => { setAvatar(''); setPreviewError(false); }}>
                  <Text style={styles.removePhoto}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity activeOpacity={0.85} onPress={pickPhoto} style={styles.photoRow}>
              {avatarPreviewUri ? (
                <Image
                  source={{ uri: avatarPreviewUri }}
                  style={styles.avatar}
                  onError={() => setPreviewError(true)}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarText}>{name.charAt(0).toUpperCase() || 'U'}</Text>
                </View>
              )}
              <View style={styles.photoCopy}>
                <Text style={styles.photoTitle}>{avatar ? 'Change photo' : 'Add a photo'}</Text>
                <Text style={styles.photoSub}>Tap to upload from your gallery</Text>
              </View>
              <View style={styles.photoArrow}><Icon name="chevron" size={16} color={colors.primary} /></View>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <Field label="Name" value={name} onChange={setName} placeholder="Your name" />
          <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          <Field label="Phone" value={phone} onChange={setPhone} placeholder="+1 555 000 0000" keyboardType="phone-pad" />

          <TouchableOpacity style={styles.save} onPress={save} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>SAVE CHANGES</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label, value, onChange, placeholder, keyboardType, autoCapitalize,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
  keyboardType?: any; autoCapitalize?: any;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.field}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,16,32,0.5)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing.xxl },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { ...typography.h2, color: colors.text },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  photoSection: {
    backgroundColor: colors.canvas, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: 4,
  },
  photoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  removePhoto: { color: colors.danger, fontSize: 11, fontWeight: '800' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#EAF0FF' },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontSize: 24, fontWeight: '800' },
  photoCopy: { flex: 1 },
  photoTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  photoSub: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  photoArrow: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#EAF0FF', alignItems: 'center', justifyContent: 'center',
  },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 16 },
  fieldWrap: { marginBottom: 12 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  field: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, height: 48, color: colors.text, fontSize: 14 },
  save: { backgroundColor: colors.primary, borderRadius: radius.pill, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  saveText: { color: colors.white, fontWeight: '800', letterSpacing: 1 },
});

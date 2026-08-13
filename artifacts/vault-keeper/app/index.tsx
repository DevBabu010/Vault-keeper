import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { AutoLockOption, Category, VaultEntry, VaultSettings } from '@/lib/vault';
import { useVault } from '@/context/VaultContext';

type IconName = keyof typeof Feather.glyphMap;
type Tab = 'vault' | 'generator' | 'settings';
type FormMode = 'add' | 'edit' | null;

const categories: Category[] = [
  'Personal',
  'Work',
  'Social',
  'Banking',
  'Shopping',
  'Other',
];

const autoLockOptions: { value: AutoLockOption; label: string }[] = [
  { value: 'immediate', label: 'Immediately' },
  { value: '1m', label: '1 minute' },
  { value: '5m', label: '5 minutes' },
  { value: '15m', label: '15 minutes' },
  { value: '30m', label: '30 minutes' },
];

function iconForCategory(category: Category): IconName {
  const map: Record<Category, IconName> = {
    Personal: 'user',
    Work: 'briefcase',
    Social: 'users',
    Banking: 'credit-card',
    Shopping: 'shopping-bag',
    Other: 'grid',
  };
  return map[category];
}

async function generatePassword(
  length: number,
  options: Pick<VaultSettings, 'uppercase' | 'lowercase' | 'numbers' | 'symbols'>,
) {
  const groups = [
    options.uppercase ? 'ABCDEFGHJKLMNPQRSTUVWXYZ' : '',
    options.lowercase ? 'abcdefghijkmnopqrstuvwxyz' : '',
    options.numbers ? '23456789' : '',
    options.symbols ? '!@#$%^&*()-_=+' : '',
  ].filter(Boolean);
  const fallback = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const pool = groups.join('') || fallback;
  const required = groups.map((group) => group[0]).filter(Boolean);
  const bytes = await Crypto.getRandomBytesAsync(Math.max(length, required.length) * 2);
  let result = required.join('');
  for (let i = result.length; i < length; i += 1) {
    result += pool[bytes[i] % pool.length];
  }
  return result
    .split('')
    .sort((a, b) => bytes[a.charCodeAt(0) % bytes.length] - bytes[b.charCodeAt(0) % bytes.length])
    .join('');
}

function strengthFor(password: string) {
  if (password.length >= 16 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password)) {
    return { label: 'Strong', color: '#B7FF48', progress: 1 };
  }
  if (password.length >= 11 && /[A-Za-z]/.test(password) && /\d/.test(password)) {
    return { label: 'Medium', color: '#F4C95D', progress: 0.66 };
  }
  return { label: 'Weak', color: '#FF6F7E', progress: 0.33 };
}

function GlassCard({
  children,
  style,
  active = false,
}: {
  children: React.ReactNode;
  style?: object;
  active?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.glassCard, { backgroundColor: colors.card, borderColor: active ? colors.primary : colors.border }, style]}>
      <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.glassInner}>{children}</View>
    </View>
  );
}

function IconButton({
  icon,
  onPress,
  label,
  variant = 'ghost',
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  variant?: 'ghost' | 'primary';
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityLabel={label}
      testID={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: variant === 'primary' ? colors.primary : colors.secondary,
          borderColor: variant === 'primary' ? colors.primary : colors.border,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <Feather name={icon} size={18} color={variant === 'primary' ? colors.primaryForeground : colors.text} />
    </Pressable>
  );
}

function PrimaryButton({
  children,
  onPress,
  icon,
  secondary = false,
  destructive = false,
}: {
  children: React.ReactNode;
  onPress: () => void;
  icon?: IconName;
  secondary?: boolean;
  destructive?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        {
          backgroundColor: secondary ? colors.secondary : destructive ? colors.destructive : colors.primary,
          borderColor: secondary ? colors.border : 'transparent',
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      {icon ? <Feather name={icon} size={17} color={secondary ? colors.text : destructive ? colors.destructiveForeground : colors.primaryForeground} /> : null}
      <Text style={[styles.primaryButtonText, { color: secondary ? colors.text : destructive ? colors.destructiveForeground : colors.primaryForeground }]}>{children}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secure = false,
  multiline = false,
  right,
  autoCapitalize = 'sentences',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secure?: boolean;
  multiline?: boolean;
  right?: React.ReactNode;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[styles.inputShell, { backgroundColor: colors.secondary, borderColor: focused ? colors.primary : colors.border }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry={secure}
          multiline={multiline}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, { color: colors.text }, multiline && styles.multilineInput]}
        />
        {right}
      </View>
    </View>
  );
}

function BrandMark({ size = 54 }: { size?: number }) {
  const colors = useColors();
  return (
    <LinearGradient colors={['#D8FF7A', colors.primary, '#6AAE4B']} style={[styles.brandMark, { width: size, height: size, borderRadius: size / 2 }]}>
      <Feather name="shield" size={size * 0.43} color={colors.primaryForeground} />
    </LinearGradient>
  );
}

function SetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setup } = useVault();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (password.length < 8) return setError('Use at least 8 characters for your master password.');
    if (password !== confirm) return setError('The passwords do not match.');
    await setup(password);
  };
  return (
    <ScreenBackground>
      <KeyboardAwareScrollViewCompat contentContainerStyle={[styles.centerContent, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}>
        <BrandMark size={70} />
        <Text style={styles.eyebrow}>PRIVATE BY DESIGN</Text>
        <Text style={styles.brandTitle}>VAULT KEEPER</Text>
        <Text style={styles.heroSubtitle}>Your passwords. Secure. Private.</Text>
        <GlassCard style={styles.authCard}>
          <Text style={styles.cardTitle}>Create your vault</Text>
          <Text style={[styles.cardCopy, { color: colors.mutedForeground }]}>Create a master password to protect your vault. It never leaves this device.</Text>
          <Field label="MASTER PASSWORD" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secure={!show} autoCapitalize="none" right={<IconButton icon={show ? 'eye-off' : 'eye'} label="Toggle password visibility" onPress={() => setShow((value) => !value)} />} />
          <Field label="CONFIRM MASTER PASSWORD" value={confirm} onChangeText={setConfirm} placeholder="Enter it again" secure={!show} autoCapitalize="none" />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <PrimaryButton onPress={() => void submit()} icon="arrow-right">CREATE VAULT</PrimaryButton>
          <View style={styles.securityNote}><Feather name="lock" size={14} color={colors.primary} /><Text style={[styles.securityNoteText, { color: colors.mutedForeground }]}>Encrypted with secure device storage</Text></View>
        </GlassCard>
      </KeyboardAwareScrollViewCompat>
    </ScreenBackground>
  );
}

function LockScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { unlock, biometricUnlock, biometricAvailable, error, clearError, settings } = useVault();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  return (
    <ScreenBackground>
      <KeyboardAwareScrollViewCompat contentContainerStyle={[styles.centerContent, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}>
        <BrandMark size={70} />
        <Text style={styles.eyebrow}>WELCOME BACK</Text>
        <Text style={styles.brandTitle}>VAULT KEEPER</Text>
        <Text style={styles.heroSubtitle}>Your vault is locked</Text>
        <GlassCard style={styles.authCard}>
          <View style={styles.lockIcon}><Feather name="lock" size={21} color={colors.primary} /></View>
          <Text style={styles.cardTitle}>Unlock your vault</Text>
          <Text style={[styles.cardCopy, { color: colors.mutedForeground }]}>Use your master password to access your encrypted credentials.</Text>
          <Field label="MASTER PASSWORD" value={password} onChangeText={(value) => { clearError(); setPassword(value); }} placeholder="Enter your master password" secure={!show} autoCapitalize="none" right={<IconButton icon={show ? 'eye-off' : 'eye'} label="Toggle password visibility" onPress={() => setShow((value) => !value)} />} />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <PrimaryButton onPress={() => void unlock(password).then((success) => { if (success) setPassword(''); })} icon="unlock">UNLOCK VAULT</PrimaryButton>
          {biometricAvailable && settings.biometricEnabled ? <Pressable onPress={() => void biometricUnlock()} style={({ pressed }) => [styles.biometricButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Feather name="maximize" size={16} color={colors.primary} /><Text style={[styles.biometricText, { color: colors.text }]}>USE BIOMETRIC</Text></Pressable> : null}
        </GlassCard>
      </KeyboardAwareScrollViewCompat>
    </ScreenBackground>
  );
}

function ScreenBackground({ children, onTouchStart }: { children: React.ReactNode; onTouchStart?: () => void }) {
  return (
    <LinearGradient colors={['#071014', '#0A181D', '#071014']} style={styles.background} onTouchStart={onTouchStart}>
      <View style={styles.ambientGlowTop} />
      <View style={styles.ambientGlowBottom} />
      {children}
    </LinearGradient>
  );
}

function Header({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      {onBack ? <IconButton icon="arrow-left" label="Go back" onPress={onBack} /> : <BrandMark size={42} />}
      <View style={styles.headerText}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
      {!onBack ? <View style={styles.headerStatus}><View style={[styles.statusDot, { backgroundColor: colors.primary }]} /><Text style={[styles.statusText, { color: colors.mutedForeground }]}>SECURE</Text></View> : null}
    </View>
  );
}

function VaultScreen({
  onAdd,
  onEdit,
  showToast,
}: {
  onAdd: () => void;
  onEdit: (entry: VaultEntry) => void;
  showToast: (message: string) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { entries, deleteEntry, settings } = useVault();
  const [search, setSearch] = useState('');
  const [revealed, setRevealed] = useState<string[]>([]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => [entry.name, entry.username, entry.url].some((value) => value.toLowerCase().includes(needle)));
  }, [entries, search]);

  const copyPassword = async (password: string) => {
    await Clipboard.setStringAsync(password);
    showToast('Password copied');
    setTimeout(() => void Clipboard.setStringAsync(''), 45000);
  };

  const confirmDelete = (entry: VaultEntry) => {
    Alert.alert('Delete entry?', `Remove ${entry.name} from your vault?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteEntry(entry.id).then(() => showToast('Entry deleted')) },
    ]);
  };

  return (
    <ScreenBackground>
      <Header title="Vault Keeper" subtitle="Your secure password vault" />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 104 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={filtered.length > 0}
        ListHeaderComponent={
          <View>
            <View style={[styles.searchShell, { backgroundColor: colors.secondary, borderColor: colors.border }]}><Feather name="search" size={17} color={colors.mutedForeground} /><TextInput value={search} onChangeText={setSearch} placeholder="Search passwords..." placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.text }]} autoCapitalize="none" /></View>
            <PrimaryButton onPress={onAdd} icon="plus">ADD PASSWORD</PrimaryButton>
            <View style={styles.sectionRow}><Text style={styles.sectionTitle}>{search ? 'SEARCH RESULTS' : 'YOUR CREDENTIALS'}</Text><Text style={[styles.resultCount, { color: colors.mutedForeground }]}>{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</Text></View>
          </View>
        }
        ListEmptyComponent={
          <GlassCard style={styles.emptyCard}>
            <View style={styles.emptyIcon}><Feather name="shield" size={24} color={colors.primary} /></View>
            <Text style={styles.emptyTitle}>{search ? 'No matches found' : 'Your vault is empty'}</Text>
            <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>{search ? 'Try another website, username, or URL.' : 'Add your first password to start protecting your accounts.'}</Text>
            {!search ? <PrimaryButton onPress={onAdd} icon="plus">ADD PASSWORD</PrimaryButton> : null}
          </GlassCard>
        }
        renderItem={({ item }) => {
          const isRevealed = revealed.includes(item.id);
          return (
            <Pressable onPress={() => onEdit(item)} style={({ pressed }) => [styles.entryCardPressable, { opacity: pressed ? 0.82 : 1 }]}>
              <GlassCard>
                <View style={styles.entryTop}>
                  <View style={[styles.siteIcon, { backgroundColor: colors.secondary }]}><Text style={[styles.siteIconText, { color: colors.primary }]}>{item.name.slice(0, 1).toUpperCase()}</Text></View>
                  <View style={styles.entryNameWrap}><Text style={styles.entryName} numberOfLines={1}>{item.name}</Text><Text style={[styles.entryUsername, { color: colors.mutedForeground }]} numberOfLines={1}>{item.username || 'No username added'}</Text></View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </View>
                <View style={styles.entryBottom}>
                  <View style={styles.passwordPreview}><Text style={[styles.passwordText, { color: colors.text }]}>{isRevealed ? item.password : '••••••••••••'}</Text></View>
                  <View style={styles.entryActions}>
                    <IconButton icon={isRevealed ? 'eye-off' : 'eye'} label={`${isRevealed ? 'Hide' : 'Show'} ${item.name} password`} onPress={() => setRevealed((ids) => isRevealed ? ids.filter((id) => id !== item.id) : [...ids, item.id])} />
                    <IconButton icon="copy" label={`Copy ${item.name} password`} onPress={() => void copyPassword(item.password)} />
                    <IconButton icon="trash-2" label={`Delete ${item.name}`} onPress={() => confirmDelete(item)} />
                  </View>
                </View>
                <View style={styles.entryMeta}><View style={[styles.categoryPill, { backgroundColor: colors.secondary, borderColor: colors.border }]}><Feather name={iconForCategory(item.category)} size={12} color={colors.primary} /><Text style={[styles.categoryText, { color: colors.mutedForeground }]}>{item.category}</Text></View>{item.url ? <Text style={[styles.urlText, { color: colors.mutedForeground }]} numberOfLines={1}>{item.url.replace(/^https?:\/\//, '')}</Text> : null}</View>
              </GlassCard>
            </Pressable>
          );
        }}
      />
      <Text style={[styles.encryptionFootnote, { color: colors.mutedForeground }]}>Secure storage {settings.biometricEnabled ? '• biometric unlock on' : '• master password protected'}</Text>
    </ScreenBackground>
  );
}

function GeneratorScreen({
  showToast,
  onUsePassword,
}: {
  showToast: (message: string) => void;
  onUsePassword: (password: string) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useVault();
  const [password, setPassword] = useState('');
  const strength = strengthFor(password);
  const regenerate = async () => setPassword(await generatePassword(settings.generatorLength, settings));
  useEffect(() => { void regenerate(); }, []);
  const copy = async () => {
    await Clipboard.setStringAsync(password);
    showToast('Password copied');
    setTimeout(() => void Clipboard.setStringAsync(''), 45000);
  };
  const toggle = (key: 'uppercase' | 'lowercase' | 'numbers' | 'symbols') => void updateSettings({ [key]: !settings[key] });
  return (
    <ScreenBackground>
      <Header title="Password Generator" subtitle="Create strong credentials offline" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 104 }} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.generatedCard} active>
          <View style={styles.generatedHeader}><View><Text style={styles.smallLabel}>GENERATED PASSWORD</Text><Text style={styles.generatedPassword} selectable>{password}</Text></View><View style={[styles.strengthBadge, { borderColor: strength.color }]}><View style={[styles.strengthDot, { backgroundColor: strength.color }]} /><Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text></View></View>
          <View style={[styles.strengthTrack, { backgroundColor: colors.secondary }]}><View style={[styles.strengthFill, { width: `${strength.progress * 100}%`, backgroundColor: strength.color }]} /></View>
          <View style={styles.generatedActions}><PrimaryButton onPress={() => void regenerate()} icon="refresh-cw" secondary>REGENERATE</PrimaryButton><IconButton icon="copy" label="Copy generated password" onPress={() => void copy()} variant="primary" /><IconButton icon="check" label="Use generated password" onPress={() => onUsePassword(password)} /></View>
        </GlassCard>
        <View style={styles.sectionRow}><Text style={styles.sectionTitle}>GENERATOR SETTINGS</Text><Text style={[styles.resultCount, { color: colors.mutedForeground }]}>{settings.generatorLength} characters</Text></View>
        <GlassCard>
          <View style={styles.lengthRow}><View><Text style={styles.settingTitle}>Password length</Text><Text style={[styles.settingSubtitle, { color: colors.mutedForeground }]}>Choose from 8 to 32 characters</Text></View><Text style={[styles.lengthValue, { color: colors.primary }]}>{settings.generatorLength}</Text></View>
          <View style={styles.lengthControls}><IconButton icon="minus" label="Decrease password length" onPress={() => void updateSettings({ generatorLength: Math.max(8, settings.generatorLength - 1) })} /><View style={[styles.lengthTrack, { backgroundColor: colors.secondary }]}><View style={[styles.lengthFill, { width: `${((settings.generatorLength - 8) / 24) * 100}%`, backgroundColor: colors.primary }]} /></View><IconButton icon="plus" label="Increase password length" onPress={() => void updateSettings({ generatorLength: Math.min(32, settings.generatorLength + 1) })} /></View>
          {([['uppercase', 'Uppercase letters', 'A-Z'], ['lowercase', 'Lowercase letters', 'a-z'], ['numbers', 'Numbers', '0-9'], ['symbols', 'Symbols', '!@#']] as const).map(([key, label, hint]) => <View style={styles.toggleRow} key={key}><View><Text style={styles.settingTitle}>{label}</Text><Text style={[styles.settingSubtitle, { color: colors.mutedForeground }]}>{hint}</Text></View><Switch value={settings[key]} onValueChange={() => toggle(key)} trackColor={{ false: colors.secondary, true: '#5D8C35' }} thumbColor={settings[key] ? colors.primary : '#8AA49F'} /></View>)}
        </GlassCard>
        <View style={styles.localOnly}><Feather name="wifi-off" size={15} color={colors.primary} /><Text style={[styles.localOnlyText, { color: colors.mutedForeground }]}>Generated locally. Nothing is sent anywhere.</Text></View>
      </ScrollView>
    </ScreenBackground>
  );
}

function SettingsScreen({ showToast }: { showToast: (message: string) => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, lock, biometricAvailable, changeMasterPassword } = useVault();
  const [showLockOptions, setShowLockOptions] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const autoLockLabel = autoLockOptions.find((option) => option.value === settings.autoLock)?.label ?? '5 minutes';
  const submitChange = async () => {
    if (next.length < 8) return setPasswordError('Use at least 8 characters.');
    if (next !== confirm) return setPasswordError('The new passwords do not match.');
    const changed = await changeMasterPassword(current, next);
    if (!changed) return setPasswordError('Current master password is not correct.');
    setCurrent(''); setNext(''); setConfirm(''); setPasswordError(''); setShowChangePassword(false); showToast('Master password updated');
  };
  return (
    <ScreenBackground>
      <Header title="Settings" subtitle="Security, preferences, and control" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 104 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>SECURITY</Text>
        <GlassCard>
          <SettingRow icon="key" title="Change master password" subtitle="Update the password that protects your vault" onPress={() => setShowChangePassword(true)} />
          <SettingRow icon="maximize" title="Biometric unlock" subtitle={biometricAvailable ? 'Use your device biometrics to unlock faster' : 'No enrolled biometric found on this device'} trailing={<Switch disabled={!biometricAvailable} value={settings.biometricEnabled} onValueChange={(value) => void updateSettings({ biometricEnabled: value })} trackColor={{ false: colors.secondary, true: '#5D8C35' }} thumbColor={settings.biometricEnabled ? colors.primary : '#8AA49F'} />} />
          <SettingRow icon="clock" title="Auto lock" subtitle={autoLockLabel} onPress={() => setShowLockOptions((value) => !value)} />
          {showLockOptions ? <View style={styles.optionList}>{autoLockOptions.map((option) => <Pressable key={option.value} onPress={() => { void updateSettings({ autoLock: option.value }); setShowLockOptions(false); }} style={[styles.optionRow, { borderColor: colors.border }]}><Text style={styles.settingTitle}>{option.label}</Text>{settings.autoLock === option.value ? <Feather name="check" size={17} color={colors.primary} /> : null}</Pressable>)}</View> : null}
          <SettingRow icon="lock" title="Lock vault now" subtitle="Require authentication immediately" onPress={lock} />
        </GlassCard>
        <Text style={styles.sectionTitle}>APPEARANCE</Text>
        <GlassCard>
          <SettingRow icon="moon" title="Dark mode" subtitle="Always use the Vault Keeper dark theme" trailing={<Switch value trackColor={{ false: colors.secondary, true: '#5D8C35' }} thumbColor={colors.primary} onValueChange={() => showToast('Dark mode is always on for your security workspace')} />} />
        </GlassCard>
        <Text style={styles.sectionTitle}>ABOUT</Text>
        <GlassCard>
          <SettingRow icon="shield" title="Vault Keeper" subtitle="Version 1.0.0 · Local-only password manager" />
          <SettingRow icon="info" title="Privacy & security" subtitle="Your vault never leaves this device" />
        </GlassCard>
      </ScrollView>
      <Modal visible={showChangePassword} transparent animationType="slide" onRequestClose={() => setShowChangePassword(false)}>
        <View style={styles.modalBackdrop}><GlassCard style={styles.modalCard}><View style={styles.modalHeader}><Text style={styles.cardTitle}>Change master password</Text><IconButton icon="x" label="Close change password" onPress={() => setShowChangePassword(false)} /></View><Text style={[styles.cardCopy, { color: colors.mutedForeground }]}>Your vault remains on this device while the unlock password changes.</Text><Field label="CURRENT PASSWORD" value={current} onChangeText={setCurrent} secure autoCapitalize="none" /><Field label="NEW PASSWORD" value={next} onChangeText={setNext} secure autoCapitalize="none" /><Field label="CONFIRM NEW PASSWORD" value={confirm} onChangeText={setConfirm} secure autoCapitalize="none" />{passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}<PrimaryButton onPress={() => void submitChange()} icon="check">SAVE NEW PASSWORD</PrimaryButton></GlassCard></View>
      </Modal>
    </ScreenBackground>
  );
}

function SettingRow({
  icon,
  title,
  subtitle,
  onPress,
  trailing,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
}) {
  const colors = useColors();
  const content = <><View style={[styles.settingIcon, { backgroundColor: colors.secondary }]}><Feather name={icon} size={17} color={colors.primary} /></View><View style={styles.settingCopy}><Text style={styles.settingTitle}>{title}</Text><Text style={[styles.settingSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text></View>{trailing ?? (onPress ? <Feather name="chevron-right" size={17} color={colors.mutedForeground} /> : null)}</>;
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => [styles.settingRow, { opacity: pressed ? 0.7 : 1 }]}>{content}</Pressable> : <View style={styles.settingRow}>{content}</View>;
}

function EntryFormScreen({
  entry,
  initialPassword = '',
  onBack,
  onSaved,
  showToast,
}: {
  entry?: VaultEntry;
  initialPassword?: string;
  onBack: () => void;
  onSaved: () => void;
  showToast: (message: string) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addEntry, updateEntry, deleteEntry } = useVault();
  const [name, setName] = useState(entry?.name ?? '');
  const [username, setUsername] = useState(entry?.username ?? '');
  const [password, setPassword] = useState(entry?.password ?? initialPassword);
  const [url, setUrl] = useState(entry?.url ?? '');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [category, setCategory] = useState<Category>(entry?.category ?? 'Personal');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!name.trim()) return setError('Add a website or app name.');
    if (!password) return setError('Add a password or generate one.');
    const input = { name: name.trim(), username: username.trim(), password, url: url.trim(), notes: notes.trim(), category };
    if (entry) await updateEntry(entry.id, input); else await addEntry(input);
    showToast(entry ? 'Entry updated' : 'Password saved');
    onSaved();
  };
  const generate = async () => setPassword(await generatePassword(18, { uppercase: true, lowercase: true, numbers: true, symbols: true }));
  const remove = () => {
    if (!entry) return;
    Alert.alert('Delete entry?', `Remove ${entry.name} from your vault?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void deleteEntry(entry.id).then(() => { showToast('Entry deleted'); onSaved(); }) }]);
  };
  return (
    <ScreenBackground>
      <Header title={entry ? 'Edit password' : 'Add password'} subtitle={entry ? 'Keep this credential up to date' : 'Save a credential securely'} onBack={onBack} />
      <KeyboardAwareScrollViewCompat contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
        <GlassCard>
          <Field label="WEBSITE / APP NAME" value={name} onChangeText={setName} placeholder="e.g. Google" />
          <Field label="USERNAME / EMAIL" value={username} onChangeText={setUsername} placeholder="you@example.com" autoCapitalize="none" />
          <Field label="PASSWORD" value={password} onChangeText={setPassword} placeholder="Enter a password" secure={!showPassword} autoCapitalize="none" right={<View style={styles.fieldActions}><IconButton icon={showPassword ? 'eye-off' : 'eye'} label="Toggle entry password visibility" onPress={() => setShowPassword((value) => !value)} /><IconButton icon="zap" label="Generate entry password" onPress={() => void generate()} /></View>} />
          <Field label="WEBSITE URL" value={url} onChangeText={setUrl} placeholder="https://example.com" autoCapitalize="none" />
          <Text style={styles.fieldLabel}>CATEGORY</Text>
          <View style={styles.categoryGrid}>{categories.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.categoryChoice, { backgroundColor: category === item ? colors.primary : colors.secondary, borderColor: category === item ? colors.primary : colors.border }]}><Feather name={iconForCategory(item)} size={13} color={category === item ? colors.primaryForeground : colors.mutedForeground} /><Text style={[styles.categoryChoiceText, { color: category === item ? colors.primaryForeground : colors.mutedForeground }]}>{item}</Text></Pressable>)}</View>
          <Field label="NOTES" value={notes} onChangeText={setNotes} placeholder="Optional notes" multiline />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <PrimaryButton onPress={() => void save()} icon="check">{entry ? 'SAVE CHANGES' : 'SAVE PASSWORD'}</PrimaryButton>
          {entry ? <PrimaryButton onPress={remove} icon="trash-2" destructive>DELETE ENTRY</PrimaryButton> : null}
        </GlassCard>
        <View style={styles.localOnly}><Feather name="lock" size={15} color={colors.primary} /><Text style={[styles.localOnlyText, { color: colors.mutedForeground }]}>Sensitive fields are kept in secure device storage.</Text></View>
      </KeyboardAwareScrollViewCompat>
    </ScreenBackground>
  );
}

function BottomNav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const items: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'vault', label: 'Vault', icon: 'shield' },
    { id: 'generator', label: 'Generator', icon: 'zap' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];
  return (
    <View style={[styles.bottomNavWrap, { paddingBottom: insets.bottom + 10 }]}>
      <BlurView intensity={48} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.bottomNav}>{items.map((item) => { const active = tab === item.id; return <Pressable key={item.id} onPress={() => onChange(item.id)} style={({ pressed }) => [styles.navItem, { opacity: pressed ? 0.7 : 1 }]}><View style={[styles.navIcon, active && { backgroundColor: colors.primary }]}><Feather name={item.icon} size={18} color={active ? colors.primaryForeground : colors.mutedForeground} /></View><Text style={[styles.navLabel, { color: active ? colors.primary : colors.mutedForeground }]}>{item.label}</Text></Pressable>; })}</View>
    </View>
  );
}

function MainApp() {
  const colors = useColors();
  const { unlocked, lock, settings } = useVault();
  const [tab, setTab] = useState<Tab>('vault');
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingEntry, setEditingEntry] = useState<VaultEntry | undefined>();
  const [prefillPassword, setPrefillPassword] = useState('');
  const [toast, setToast] = useState('');
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string) => { setToast(message); setTimeout(() => setToast(''), 2400); };
  const resetLockTimer = () => {
    if (lockTimer.current) clearTimeout(lockTimer.current);
    if (!unlocked || settings.autoLock === 'immediate') return;
    const timeout = ({ '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000 }[settings.autoLock] ?? 300000);
    lockTimer.current = setTimeout(lock, timeout);
  };
  useEffect(() => {
    resetLockTimer();
    return () => { if (lockTimer.current) clearTimeout(lockTimer.current); };
  }, [lock, settings.autoLock, unlocked]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') lock();
      else resetLockTimer();
    });
    return () => subscription.remove();
  }, [lock, settings.autoLock, unlocked]);
  if (formMode) return <EntryFormScreen key={editingEntry?.id ?? 'new'} entry={editingEntry} initialPassword={prefillPassword} onBack={() => { setFormMode(null); setEditingEntry(undefined); setPrefillPassword(''); }} onSaved={() => { setFormMode(null); setEditingEntry(undefined); setPrefillPassword(''); }} showToast={showToast} />;
  return (
    <ScreenBackground onTouchStart={resetLockTimer}>
      {tab === 'vault' ? <VaultScreen onAdd={() => { setEditingEntry(undefined); setFormMode('add'); }} onEdit={(entry) => { setEditingEntry(entry); setFormMode('edit'); }} showToast={showToast} /> : null}
      {tab === 'generator' ? <GeneratorScreen showToast={showToast} onUsePassword={(password) => { setTab('vault'); setEditingEntry(undefined); setPrefillPassword(password); setFormMode('add'); showToast('Password ready to use'); }} /> : null}
      {tab === 'settings' ? <SettingsScreen showToast={showToast} /> : null}
      <BottomNav tab={tab} onChange={setTab} />
      {toast ? <View style={[styles.toast, { backgroundColor: colors.primary }]}><Feather name="check" size={15} color={colors.primaryForeground} /><Text style={[styles.toastText, { color: colors.primaryForeground }]}>{toast}</Text></View> : null}
    </ScreenBackground>
  );
}

export default function Index() {
  const { ready, hasVault, unlocked } = useVault();
  if (!ready) return <ScreenBackground><View style={styles.loading}><BrandMark size={62} /><Text style={styles.loadingText}>Securing your workspace…</Text></View></ScreenBackground>;
  if (!hasVault) return <SetupScreen />;
  if (!unlocked) return <LockScreen />;
  return <MainApp />;
}

const styles = StyleSheet.create({
  background: { flex: 1, minHeight: '100%' },
  ambientGlowTop: { position: 'absolute', width: 260, height: 260, borderRadius: 180, backgroundColor: '#183B26', opacity: 0.34, top: -120, right: -100 },
  ambientGlowBottom: { position: 'absolute', width: 240, height: 240, borderRadius: 180, backgroundColor: '#113735', opacity: 0.26, bottom: -130, left: -90 },
  centerContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: '#8AA49F', fontFamily: 'Inter_500Medium', fontSize: 13, letterSpacing: 0.4 },
  brandMark: { alignItems: 'center', justifyContent: 'center', shadowColor: '#B7FF48', shadowOpacity: 0.38, shadowRadius: 20, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  eyebrow: { color: '#B7FF48', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 2.6, marginTop: 22 },
  brandTitle: { color: '#F5FBF8', fontFamily: 'Inter_700Bold', fontSize: 27, letterSpacing: 2.2, marginTop: 8 },
  heroSubtitle: { color: '#8AA49F', fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 8 },
  authCard: { width: '100%', maxWidth: 430, marginTop: 30 },
  glassCard: { overflow: 'hidden', borderWidth: 1, borderRadius: 22, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  glassInner: { padding: 18 },
  cardTitle: { color: '#F5FBF8', fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: -0.4 },
  cardCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 18 },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { color: '#8AA49F', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginBottom: 7 },
  inputShell: { minHeight: 50, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
  input: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, paddingVertical: 12 },
  multilineInput: { minHeight: 82, textAlignVertical: 'top' },
  inputIconButton: { marginLeft: 8 },
  iconButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  primaryButton: { minHeight: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, borderWidth: 1, marginTop: 7 },
  primaryButtonText: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.1 },
  securityNote: { flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  securityNoteText: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  errorText: { color: '#FF6F7E', fontFamily: 'Inter_500Medium', fontSize: 12, marginBottom: 10, lineHeight: 17 },
  lockIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#1B322D', alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  biometricButton: { height: 48, borderRadius: 14, borderWidth: 1, marginTop: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  biometricText: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.1 },
  header: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 74 },
  headerText: { flex: 1 },
  headerTitle: { color: '#F5FBF8', fontFamily: 'Inter_700Bold', fontSize: 23, letterSpacing: -0.6 },
  headerSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 },
  headerStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 6 },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.3 },
  searchShell: { height: 49, borderRadius: 15, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 9, marginBottom: 11 },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 25, marginBottom: 11 },
  sectionTitle: { color: '#8AA49F', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.4 },
  resultCount: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  emptyCard: { alignItems: 'center', paddingVertical: 28 },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#172B2A', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { color: '#F5FBF8', fontFamily: 'Inter_700Bold', fontSize: 17 },
  emptyCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 260, marginTop: 7, marginBottom: 13 },
  entryCardPressable: { borderRadius: 22 },
  entryTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  siteIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  siteIconText: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  entryNameWrap: { flex: 1 },
  entryName: { color: '#F5FBF8', fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  entryUsername: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 },
  entryBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 17, gap: 10 },
  passwordPreview: { flex: 1 },
  passwordText: { fontFamily: 'Inter_500Medium', fontSize: 14, letterSpacing: 1.5 },
  entryActions: { flexDirection: 'row', gap: 6 },
  entryMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15 },
  categoryPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  categoryText: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  urlText: { fontFamily: 'Inter_400Regular', fontSize: 11, flex: 1 },
  encryptionFootnote: { position: 'absolute', bottom: 82, alignSelf: 'center', fontFamily: 'Inter_400Regular', fontSize: 10 },
  generatedCard: { marginTop: 4 },
  generatedHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  smallLabel: { color: '#8AA49F', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  generatedPassword: { color: '#F5FBF8', fontFamily: 'Inter_600SemiBold', fontSize: 21, letterSpacing: 0.7, marginTop: 9 },
  strengthBadge: { height: 29, borderRadius: 9, borderWidth: 1, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  strengthDot: { width: 6, height: 6, borderRadius: 6 },
  strengthLabel: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  strengthTrack: { height: 5, borderRadius: 5, marginTop: 20, overflow: 'hidden' },
  strengthFill: { height: 5, borderRadius: 5 },
  generatedActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  lengthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingTitle: { color: '#F5FBF8', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  settingSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, marginTop: 3 },
  lengthValue: { fontFamily: 'Inter_700Bold', fontSize: 24 },
  lengthControls: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14, marginBottom: 7 },
  lengthTrack: { flex: 1, height: 5, borderRadius: 5, overflow: 'hidden' },
  lengthFill: { height: 5, borderRadius: 5 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 },
  localOnly: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginVertical: 9 },
  localOnlyText: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  settingRow: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  settingCopy: { flex: 1 },
  optionList: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#2A4748', paddingVertical: 3, marginVertical: 2 },
  optionRow: { minHeight: 42, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 17 },
  categoryChoice: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  categoryChoiceText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  fieldActions: { flexDirection: 'row', gap: 6 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)', padding: 12 },
  modalCard: { maxHeight: '92%', marginBottom: 0 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  bottomNavWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, overflow: 'hidden', borderTopWidth: 1, borderTopColor: '#2A4748', paddingTop: 8, backgroundColor: 'rgba(7,16,20,0.78)' },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around' },
  navItem: { alignItems: 'center', minWidth: 78, gap: 4 },
  navIcon: { width: 35, height: 27, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  toast: { position: 'absolute', bottom: 100, alignSelf: 'center', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 7, shadowColor: '#B7FF48', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  toastText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
});
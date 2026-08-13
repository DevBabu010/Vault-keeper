import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  AutoLockOption,
  Category,
  createSalt,
  defaultSettings,
  hashMasterPassword,
  newEntry,
  readMetadata,
  readVault,
  saveMetadata,
  saveVault,
  VaultEntry,
  VaultSettings,
} from '@/lib/vault';

type EntryInput = Omit<VaultEntry, 'id' | 'createdAt' | 'updatedAt'>;

type VaultContextValue = {
  ready: boolean;
  hasVault: boolean;
  unlocked: boolean;
  entries: VaultEntry[];
  settings: VaultSettings;
  biometricAvailable: boolean;
  error: string | null;
  setup: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<boolean>;
  biometricUnlock: () => Promise<boolean>;
  lock: () => void;
  addEntry: (input: EntryInput) => Promise<void>;
  updateEntry: (id: string, input: EntryInput) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<VaultSettings>) => Promise<void>;
  changeMasterPassword: (
    currentPassword: string,
    nextPassword: string,
  ) => Promise<boolean>;
  clearError: () => void;
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [hasVault, setHasVault] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [settings, setSettings] = useState<VaultSettings>(defaultSettings);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const metadata = await readMetadata();
        if (!mounted) return;
        setHasVault(Boolean(metadata));
        if (Platform.OS !== 'web') {
          const hardware = await LocalAuthentication.hasHardwareAsync();
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          if (mounted) setBiometricAvailable(hardware && enrolled);
        }
      } catch {
        if (mounted) setError('Secure storage is unavailable on this device.');
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setup = useCallback(async (password: string) => {
    const salt = await createSalt();
    const verifier = await hashMasterPassword(password, salt);
    await saveMetadata({ salt, verifier });
    await saveVault([], defaultSettings);
    setHasVault(true);
    setEntries([]);
    setSettings(defaultSettings);
    setUnlocked(true);
    setError(null);
  }, []);

  const unlock = useCallback(async (password: string) => {
    const metadata = await readMetadata();
    if (!metadata) return false;
    const verifier = await hashMasterPassword(password, metadata.salt);
    if (verifier !== metadata.verifier) {
      setError('That master password is not correct.');
      return false;
    }
    const stored = await readVault();
    setEntries(stored.entries);
    setSettings(stored.settings);
    setUnlocked(true);
    setError(null);
    return true;
  }, []);

  const biometricUnlock = useCallback(async () => {
    if (!biometricAvailable || Platform.OS === 'web') return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock your Vault Keeper vault',
      promptDescription: 'Use your device biometric to continue.',
      cancelLabel: 'Use password',
      disableDeviceFallback: false,
    });
    if (!result.success) return false;
    const stored = await readVault();
    setEntries(stored.entries);
    setSettings(stored.settings);
    setUnlocked(true);
    setError(null);
    return true;
  }, [biometricAvailable]);

  const lock = useCallback(() => {
    setEntries([]);
    setUnlocked(false);
  }, []);

  const persist = useCallback(
    async (nextEntries: VaultEntry[], nextSettings: VaultSettings) => {
      await saveVault(nextEntries, nextSettings);
      setEntries(nextEntries);
      setSettings(nextSettings);
    },
    [],
  );

  const addEntry = useCallback(
    async (input: EntryInput) => {
      const entry = newEntry(input);
      await persist([entry, ...entries], settings);
    },
    [entries, persist, settings],
  );

  const updateEntry = useCallback(
    async (id: string, input: EntryInput) => {
      const nextEntries = entries.map((entry) =>
        entry.id === id
          ? { ...entry, ...input, updatedAt: new Date().toISOString() }
          : entry,
      );
      await persist(nextEntries, settings);
    },
    [entries, persist, settings],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      await persist(
        entries.filter((entry) => entry.id !== id),
        settings,
      );
    },
    [entries, persist, settings],
  );

  const updateSettings = useCallback(
    async (patch: Partial<VaultSettings>) => {
      await persist(entries, { ...settings, ...patch });
    },
    [entries, persist, settings],
  );

  const changeMasterPassword = useCallback(
    async (currentPassword: string, nextPassword: string) => {
      const metadata = await readMetadata();
      if (!metadata) return false;
      const currentVerifier = await hashMasterPassword(
        currentPassword,
        metadata.salt,
      );
      if (currentVerifier !== metadata.verifier) {
        setError('Current master password is not correct.');
        return false;
      }
      const salt = await createSalt();
      const verifier = await hashMasterPassword(nextPassword, salt);
      await saveMetadata({ salt, verifier });
      setError(null);
      return true;
    },
    [],
  );

  const value = useMemo(
    () => ({
      ready,
      hasVault,
      unlocked,
      entries,
      settings,
      biometricAvailable,
      error,
      setup,
      unlock,
      biometricUnlock,
      lock,
      addEntry,
      updateEntry,
      deleteEntry,
      updateSettings,
      changeMasterPassword,
      clearError: () => setError(null),
    }),
    [
      ready,
      hasVault,
      unlocked,
      entries,
      settings,
      biometricAvailable,
      error,
      setup,
      unlock,
      biometricUnlock,
      lock,
      addEntry,
      updateEntry,
      deleteEntry,
      updateSettings,
      changeMasterPassword,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used inside VaultProvider');
  return context;
}

export type { EntryInput, AutoLockOption, Category };

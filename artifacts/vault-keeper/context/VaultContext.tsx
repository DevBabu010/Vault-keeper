import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
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
import { BackupPayload } from '@/lib/backup';

type EntryInput = Omit<VaultEntry, 'id' | 'createdAt' | 'updatedAt'>;

type VaultContextValue = {
  ready: boolean;
  hasVault: boolean;
  unlocked: boolean;
  entries: VaultEntry[];
  settings: VaultSettings;
  biometricAvailable: boolean;
  appIsActive: boolean;
  setDocumentPickerLockSuppressed: (suppressed: boolean) => void;
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
  restoreBackup: (
    payload: BackupPayload,
    mode: 'replace' | 'merge',
  ) => Promise<number>;
  clearError: () => void;
};

const VaultContext = createContext<VaultContextValue | null>(null);

function biometricDebug(...values: unknown[]): void {
  if (__DEV__) console.log(...values);
}

function restoreDebug(...values: unknown[]): void {
  if (__DEV__) console.log(...values);
}

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [hasVault, setHasVault] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [settings, setSettings] = useState<VaultSettings>(defaultSettings);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [appIsActive, setAppIsActive] = useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );
  const [error, setError] = useState<string | null>(null);
  const documentPickerLockSuppressed = useRef(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        biometricDebug('[BIOMETRIC] app launched');
        const metadata = await readMetadata();
        // Read only the persisted preferences during startup. Entries stay empty
        // until the user has authenticated.
        const stored = metadata ? await readVault() : null;
        if (!mounted) return;
        setHasVault(Boolean(metadata));
        if (!stored) biometricDebug('[BIOMETRIC] preference enabled:', false);
        if (stored) {
          setSettings(stored.settings);
          biometricDebug('[BIOMETRIC] preference enabled:', stored.settings.biometricEnabled);
          biometricDebug('[BIOMETRIC] vault locked');
        }
        if (Platform.OS !== 'web') {
          const hardware = await LocalAuthentication.hasHardwareAsync();
          biometricDebug('[BIOMETRIC] hardware available:', hardware);
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          biometricDebug('[BIOMETRIC] enrolled:', enrolled);
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

  const lock = useCallback(() => {
    setEntries([]);
    setUnlocked((wasUnlocked) => {
      if (wasUnlocked) biometricDebug('[BIOMETRIC] vault locked');
      return false;
    });
  }, []);

  const setDocumentPickerLockSuppressed = useCallback((suppressed: boolean) => {
    documentPickerLockSuppressed.current = suppressed;
    restoreDebug(
      suppressed
        ? '[RESTORE] document picker session started'
        : '[RESTORE] document picker session ended',
    );
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const active = nextState === 'active';
      setAppIsActive(active);
      if (!active && documentPickerLockSuppressed.current) {
        restoreDebug('[RESTORE] AppState changed for document picker; lock suppressed');
        return;
      }
      if (!active && settings.autoLock === 'immediate') lock();
    });
    return () => subscription.remove();
  }, [lock, settings.autoLock]);

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
    biometricDebug('[BIOMETRIC] requesting authentication');
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock your Vault Keeper vault',
      promptDescription: 'Use your device biometric to continue.',
      cancelLabel: 'Use password',
      disableDeviceFallback: false,
    });
    if (!result.success) {
      biometricDebug('[BIOMETRIC] authentication failed');
      return false;
    }
    biometricDebug('[BIOMETRIC] authentication success');
    const stored = await readVault();
    setEntries(stored.entries);
    setSettings(stored.settings);
    setUnlocked(true);
    biometricDebug('[BIOMETRIC] vault unlocked');
    setError(null);
    return true;
  }, [biometricAvailable]);

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

  const restoreBackup = useCallback(
    async (payload: BackupPayload, mode: 'replace' | 'merge') => {
      restoreDebug(
        '[RESTORE] restore mode:',
        mode,
        'existing entries:',
        entries.length,
        'backup entries:',
        payload.entries.length,
      );
      restoreDebug('[RESTORE] authentication state before persistence:', unlocked);
      const nextSettings: VaultSettings = {
        ...settings,
        ...payload.settings,
        biometricEnabled: payload.settings.biometricEnabled && biometricAvailable,
      };
      if (mode === 'replace') {
        await persist(payload.entries, nextSettings);
        restoreDebug('[RESTORE] in-memory vault state updated:', payload.entries.length);
        restoreDebug('[RESTORE] authentication state after persistence:', unlocked);
        return payload.entries.length;
      }
      const existingKeys = new Set(
        entries.map((entry) =>
          `${entry.name}|${entry.username}|${entry.url}`.trim().toLowerCase(),
        ),
      );
      const additions = payload.entries.filter((entry) => {
        const key = `${entry.name}|${entry.username}|${entry.url}`
          .trim()
          .toLowerCase();
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
      await persist([...entries, ...additions], nextSettings);
      restoreDebug(
        '[RESTORE] in-memory vault state updated:',
        entries.length + additions.length,
      );
      restoreDebug('[RESTORE] authentication state after persistence:', unlocked);
      return additions.length;
    },
    [biometricAvailable, entries, persist, settings, unlocked],
  );

  const value = useMemo(
    () => ({
      ready,
      hasVault,
      unlocked,
      entries,
      settings,
      biometricAvailable,
      appIsActive,
      setDocumentPickerLockSuppressed,
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
      restoreBackup,
      clearError: () => setError(null),
    }),
    [
      ready,
      hasVault,
      unlocked,
      entries,
      settings,
      biometricAvailable,
      appIsActive,
      setDocumentPickerLockSuppressed,
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
      restoreBackup,
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

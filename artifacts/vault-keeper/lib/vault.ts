import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

export type Category =
  | 'Personal'
  | 'Work'
  | 'Social'
  | 'Banking'
  | 'Shopping'
  | 'Other';

export type AutoLockOption = 'immediate' | '1m' | '5m' | '15m' | '30m';

export type VaultEntry = {
  id: string;
  name: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  category: Category;
  createdAt: string;
  updatedAt: string;
};

export type VaultSettings = {
  biometricEnabled: boolean;
  autoLock: AutoLockOption;
  generatorLength: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
};

type VaultMetadata = {
  salt: string;
  verifier: string;
};

const METADATA_KEY = 'vault-keeper.metadata.v1';
const VAULT_KEY = 'vault-keeper.vault.v1';

export const defaultSettings: VaultSettings = {
  biometricEnabled: false,
  autoLock: '5m',
  generatorLength: 18,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
};

export async function hashMasterPassword(
  password: string,
  salt: string,
): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${password}`,
  );
}

export async function createSalt(): Promise<string> {
  return Crypto.randomUUID();
}

export async function readMetadata(): Promise<VaultMetadata | null> {
  const raw = await SecureStore.getItemAsync(METADATA_KEY);
  return raw ? (JSON.parse(raw) as VaultMetadata) : null;
}

export async function saveMetadata(metadata: VaultMetadata): Promise<void> {
  await SecureStore.setItemAsync(METADATA_KEY, JSON.stringify(metadata));
}

export async function readVault(): Promise<{
  entries: VaultEntry[];
  settings: VaultSettings;
}> {
  const raw = await SecureStore.getItemAsync(VAULT_KEY);
  if (!raw) return { entries: [], settings: defaultSettings };
  const stored = JSON.parse(raw) as Partial<{
    entries: VaultEntry[];
    settings: VaultSettings;
  }>;
  return {
    entries: stored.entries ?? [],
    settings: { ...defaultSettings, ...stored.settings },
  };
}

export async function saveVault(
  entries: VaultEntry[],
  settings: VaultSettings,
): Promise<void> {
  await SecureStore.setItemAsync(
    VAULT_KEY,
    JSON.stringify({ entries, settings }),
  );
}

export function newEntry(
  values: Omit<VaultEntry, 'id' | 'createdAt' | 'updatedAt'>,
): VaultEntry {
  const now = new Date().toISOString();
  return {
    ...values,
    id: Crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
}

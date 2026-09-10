import { gcm } from '@noble/ciphers/aes';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToUtf8, utf8ToBytes } from '@noble/hashes/utils';
import { deriveKeyAsync as deriveNativePbkdf2Key } from '@workspace/expo-pbkdf2';
import * as Crypto from 'expo-crypto';
import {
  AutoLockOption,
  Category,
  defaultSettings,
  VaultEntry,
  VaultSettings,
} from '@/lib/vault';

const MAGIC = 'VAULT_KEEPER_BACKUP';
const VERSION = 1;
const KDF_ITERATIONS = 600_000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const NONCE_LENGTH = 12;
const PASSWORD_VERIFIER_CONTEXT = utf8ToBytes(
  'Vault Keeper backup password verifier v1',
);
const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function backupDebug(...values: unknown[]): void {
  if (__DEV__) console.log(...values);
}

export type BackupPayload = {
  entries: VaultEntry[];
  settings: VaultSettings;
};

type BackupHeader = {
  magic: typeof MAGIC;
  version: typeof VERSION;
  kdf: {
    name: 'PBKDF2-HMAC-SHA256';
    iterations: number;
    keyLength: number;
  };
  salt: string;
  nonce: string;
  passwordVerifier?: string;
};

type BackupFile = BackupHeader & {
  ciphertext: string;
};

export class BackupError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_FORMAT'
      | 'INCORRECT_PASSWORD'
      | 'INVALID_PAYLOAD',
  ) {
    super(code);
    this.name = 'BackupError';
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  try {
    const binary = globalThis.atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new BackupError('INVALID_FORMAT');
  }
}

function headerForFile(
  salt: Uint8Array,
  nonce: Uint8Array,
  passwordVerifier: string,
): BackupHeader {
  return {
    magic: MAGIC,
    version: VERSION,
    kdf: {
      name: 'PBKDF2-HMAC-SHA256',
      iterations: KDF_ITERATIONS,
      keyLength: KEY_LENGTH,
    },
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
    passwordVerifier,
  };
}

async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  backupDebug('[BACKUP] starting key derivation');
  const start = Date.now();
  const encodedKey = await deriveNativePbkdf2Key(
    password,
    bytesToBase64(salt),
    KDF_ITERATIONS,
    KEY_LENGTH,
  );
  const key = base64ToBytes(encodedKey);
  if (key.length !== KEY_LENGTH) throw new Error('Invalid derived key length.');
  backupDebug('[BACKUP] PBKDF2 duration:', Date.now() - start, 'ms');
  backupDebug('[BACKUP] key derivation completed');
  return key;
}

function passwordVerifier(key: Uint8Array): Uint8Array {
  return hmac(sha256, key, PASSWORD_VERIFIER_CONTEXT);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function isVaultEntry(value: unknown): value is VaultEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<VaultEntry>;
  const categories: Category[] = [
    'Personal',
    'Work',
    'Social',
    'Banking',
    'Shopping',
    'Other',
  ];
  return (
    typeof entry.id === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.username === 'string' &&
    typeof entry.password === 'string' &&
    typeof entry.url === 'string' &&
    typeof entry.notes === 'string' &&
    typeof entry.category === 'string' &&
    categories.includes(entry.category as Category) &&
    typeof entry.createdAt === 'string' &&
    typeof entry.updatedAt === 'string'
  );
}

function isVaultSettings(value: unknown): value is VaultSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<VaultSettings>;
  const autoLockOptions: AutoLockOption[] = [
    'immediate',
    '1m',
    '5m',
    '15m',
    '30m',
  ];
  return (
    typeof settings.biometricEnabled === 'boolean' &&
    typeof settings.autoLock === 'string' &&
    autoLockOptions.includes(settings.autoLock as AutoLockOption) &&
    typeof settings.generatorLength === 'number' &&
    Number.isInteger(settings.generatorLength) &&
    settings.generatorLength >= 4 &&
    settings.generatorLength <= 128 &&
    typeof settings.uppercase === 'boolean' &&
    typeof settings.lowercase === 'boolean' &&
    typeof settings.numbers === 'boolean' &&
    typeof settings.symbols === 'boolean'
  );
}

function headerBytes(header: BackupHeader): Uint8Array {
  return utf8ToBytes(JSON.stringify(header));
}

export async function createEncryptedBackup(
  payload: BackupPayload,
  backupPassword: string,
): Promise<string> {
  backupDebug('[BACKUP] salt generation started');
  const salt = await Crypto.getRandomBytesAsync(SALT_LENGTH);
  backupDebug('[BACKUP] salt generated');
  backupDebug('[BACKUP] nonce generation started');
  const nonce = await Crypto.getRandomBytesAsync(NONCE_LENGTH);
  backupDebug('[BACKUP] nonce generated');
  const key = await deriveKey(backupPassword, salt);
  const header = headerForFile(
    salt,
    nonce,
    bytesToBase64(passwordVerifier(key)),
  );
  const serializedVault = JSON.stringify({
    schema: 1,
    entries: payload.entries,
    settings: { ...defaultSettings, ...payload.settings },
  });
  backupDebug('[BACKUP] vault serialized');
  const plaintext = utf8ToBytes(serializedVault);
  const ciphertext = gcm(key, nonce, headerBytes(header)).encrypt(plaintext);
  backupDebug('[BACKUP] encryption completed');
  const backup: BackupFile = {
    ...header,
    ciphertext: bytesToBase64(ciphertext),
  };
  const serializedBackup = JSON.stringify(backup);
  backupDebug('[BACKUP] backup serialization completed');
  return serializedBackup;
}

export async function decryptEncryptedBackup(
  serializedBackup: string,
  backupPassword: string,
): Promise<BackupPayload> {
  let backup: Partial<BackupFile>;
  try {
    backupDebug('[RESTORE] parsing backup');
    backup = JSON.parse(serializedBackup) as Partial<BackupFile>;
    backupDebug('[RESTORE] backup JSON parsed');
  } catch {
    throw new BackupError('INVALID_FORMAT');
  }

  if (
    backup.magic !== MAGIC ||
    backup.version !== VERSION ||
    backup.kdf?.name !== 'PBKDF2-HMAC-SHA256' ||
    backup.kdf.iterations !== KDF_ITERATIONS ||
    backup.kdf.keyLength !== KEY_LENGTH ||
    typeof backup.salt !== 'string' ||
    typeof backup.nonce !== 'string' ||
    typeof backup.ciphertext !== 'string'
  ) {
    throw new BackupError('INVALID_FORMAT');
  }
  backupDebug('[RESTORE] backup validation passed');

  const salt = base64ToBytes(backup.salt);
  const nonce = base64ToBytes(backup.nonce);
  if (salt.length !== SALT_LENGTH || nonce.length !== NONCE_LENGTH) {
    throw new BackupError('INVALID_FORMAT');
  }

  let key: Uint8Array;
  try {
    backupDebug('[RESTORE] starting key derivation');
    key = await deriveKey(backupPassword, salt);
    backupDebug('[RESTORE] key derivation completed');
  } catch {
    throw new BackupError('INCORRECT_PASSWORD');
  }

  let verifierMatches = true;
  if (backup.passwordVerifier !== undefined) {
    if (typeof backup.passwordVerifier !== 'string') {
      throw new BackupError('INVALID_FORMAT');
    }
    verifierMatches = bytesEqual(
      passwordVerifier(key),
      base64ToBytes(backup.passwordVerifier),
    );
    if (verifierMatches) backupDebug('[RESTORE] password verification passed');
  }

  let plaintext: Uint8Array;
  try {
    backupDebug('[RESTORE] starting decrypt');
    const header: BackupHeader = {
      magic: backup.magic,
      version: backup.version,
      kdf: backup.kdf,
      salt: backup.salt,
      nonce: backup.nonce,
      ...(backup.passwordVerifier === undefined
        ? {}
        : { passwordVerifier: backup.passwordVerifier }),
    };
    plaintext = gcm(key, nonce, headerBytes(header)).decrypt(
      base64ToBytes(backup.ciphertext),
    );
    backupDebug('[RESTORE] decrypt completed');
  } catch {
    throw new BackupError(
      verifierMatches ? 'INVALID_FORMAT' : 'INCORRECT_PASSWORD',
    );
  }

  if (!verifierMatches) throw new BackupError('INVALID_FORMAT');

  try {
    const payload = JSON.parse(bytesToUtf8(plaintext)) as Partial<BackupPayload> & {
      schema?: unknown;
    };
    if (
      payload.schema !== 1 ||
      !Array.isArray(payload.entries) ||
      !payload.entries.every(isVaultEntry) ||
      !isVaultSettings(payload.settings)
    ) {
      throw new BackupError('INVALID_PAYLOAD');
    }
    backupDebug('[RESTORE] decrypted vault validation passed');
    return {
      entries: payload.entries,
      settings: payload.settings,
    };
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError('INVALID_PAYLOAD');
  }
}

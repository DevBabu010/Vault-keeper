import { requireNativeModule } from 'expo-modules-core';

type VaultKeeperPbkdf2Module = {
  deriveKeyAsync(
    password: string,
    saltBase64: string,
    iterations: number,
    keyLength: number,
  ): Promise<string>;
};

const nativeModule = requireNativeModule<VaultKeeperPbkdf2Module>(
  'VaultKeeperPbkdf2',
);

export function deriveKeyAsync(
  password: string,
  saltBase64: string,
  iterations: number,
  keyLength: number,
): Promise<string> {
  return nativeModule.deriveKeyAsync(
    password,
    saltBase64,
    iterations,
    keyLength,
  );
}

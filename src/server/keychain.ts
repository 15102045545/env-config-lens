export interface KeychainReference {
  service: string;
  account: string;
}

export function hasCompleteKeychainReference(input: {
  keychainService?: string;
  keychainAccount?: string;
}): input is { keychainService: string; keychainAccount: string } {
  return Boolean(input.keychainService && input.keychainAccount);
}

export function buildFindGenericPasswordArgs(reference: KeychainReference) {
  return ["find-generic-password", "-w", "-s", reference.service, "-a", reference.account];
}

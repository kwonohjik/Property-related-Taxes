/**
 * 백업 파일 암호화 — AES-GCM + PBKDF2(SHA-256), 비밀번호 기반.
 *
 * 계획서: docs/00-pm/local-first-storage-backup.plan.md §4-5 (Phase 2)
 * ⚠️ 비밀번호 분실 시 복구 불가(서버에 키 미보관 — 로컬 일원화 원칙).
 *
 * Web Crypto API(crypto.subtle) — 브라우저 + Node webcrypto(테스트) 공용.
 */

import type { BackupFile } from "./backup-export";

export const ENCRYPTED_BACKUP_FORMAT = "korean-tax-calc-backup-encrypted" as const;
const ENCRYPTED_BACKUP_VERSION = 1 as const;
const PBKDF2_ITERATIONS = 200_000;
const SALT_BYTES = 16;
const IV_BYTES = 12; // AES-GCM 권장 96-bit

export interface EncryptedBackupFile {
  format: typeof ENCRYPTED_BACKUP_FORMAT;
  version: typeof ENCRYPTED_BACKUP_VERSION;
  kdf: "PBKDF2";
  hash: "SHA-256";
  /** PBKDF2 반복 횟수 */
  iterations: number;
  /** base64 */
  salt: string;
  /** base64 (AES-GCM nonce) */
  iv: string;
  /** base64 (AES-GCM 암호문 + 인증 태그) */
  ciphertext: string;
}

// ── base64 ↔ bytes ──────────────────────────────
function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deriveKey(
  password: string,
  salt: BufferSource,
  iterations: number,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** BackupFile → 암호화 파일. 매 호출마다 salt·iv 무작위. */
export async function encryptBackup(
  backup: BackupFile,
  password: string,
): Promise<EncryptedBackupFile> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(backup));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return {
    format: ENCRYPTED_BACKUP_FORMAT,
    version: ENCRYPTED_BACKUP_VERSION,
    kdf: "PBKDF2",
    hash: "SHA-256",
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(cipherBuf)),
  };
}

/**
 * 암호화 파일 → 복호화된 raw 객체(JSON.parse 결과).
 * 호출 측은 결과를 validateBackup으로 검증해야 한다.
 * 잘못된 비밀번호·손상 파일이면 throw(AES-GCM 인증 실패).
 */
export async function decryptBackup(
  enc: EncryptedBackupFile,
  password: string,
): Promise<unknown> {
  const salt = b64ToBytes(enc.salt);
  const iv = b64ToBytes(enc.iv);
  const key = await deriveKey(password, salt, enc.iterations);
  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      b64ToBytes(enc.ciphertext),
    );
  } catch {
    throw new Error("복호화에 실패했습니다. 비밀번호를 확인해 주세요.");
  }
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

/** 가져온 객체가 암호화 백업 형식인지 판정(복호화 전 분기용). */
export function isEncryptedBackupShape(raw: unknown): raw is EncryptedBackupFile {
  if (raw === null || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    o.format === ENCRYPTED_BACKUP_FORMAT &&
    typeof o.salt === "string" &&
    typeof o.iv === "string" &&
    typeof o.ciphertext === "string" &&
    typeof o.iterations === "number"
  );
}

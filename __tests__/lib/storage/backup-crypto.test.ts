/**
 * Pre-Do anchor — 백업 파일 AES-GCM 암호화(선택 기능).
 *
 * 계획서: docs/00-pm/local-first-storage-backup.plan.md §4-5 (Phase 2 암호화)
 * AES-GCM + PBKDF2(SHA-256). 비밀번호 분실 시 복구 불가.
 */

import { describe, it, expect } from "vitest";
import {
  encryptBackup,
  decryptBackup,
  isEncryptedBackupShape,
} from "@/lib/storage/backup-crypto";
import type { BackupFile } from "@/lib/storage/backup-export";

function sampleBackup(): BackupFile {
  return {
    format: "korean-tax-calc-backup",
    version: 1,
    dbVersion: 6,
    exportedAt: "2026-06-25T00:00:00.000Z",
    userProfile: null,
    clients: [],
    calculations: [
      {
        id: "id-1",
        userId: "local-user" as BackupFile["calculations"][number]["userId"],
        taxType: "property",
        title: "암호화 테스트",
        inputData: { addr: "서울", amount: 100 },
        resultData: { totalPayable: 50 },
        taxLawVersion: "2026-06-01",
        linkedCalculationId: null,
        clientId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

describe("backup-crypto — AES-GCM 암복호화", () => {
  it("round-trip: 암호화 후 같은 비밀번호로 복호화하면 원본 복원", async () => {
    const backup = sampleBackup();
    const enc = await encryptBackup(backup, "비밀번호1234");
    expect(enc.format).toBe("korean-tax-calc-backup-encrypted");
    expect(typeof enc.salt).toBe("string");
    expect(typeof enc.iv).toBe("string");
    expect(typeof enc.ciphertext).toBe("string");

    const decrypted = await decryptBackup(enc, "비밀번호1234");
    expect(decrypted).toEqual(backup);
  });

  it("암호문에 평문 민감정보가 노출되지 않음", async () => {
    const enc = await encryptBackup(sampleBackup(), "pw");
    const blob = JSON.stringify(enc);
    expect(blob).not.toContain("서울");
    expect(blob).not.toContain("암호화 테스트");
  });

  it("잘못된 비밀번호 → 복호화 실패(throw)", async () => {
    const enc = await encryptBackup(sampleBackup(), "correct-pw");
    await expect(decryptBackup(enc, "wrong-pw")).rejects.toThrow();
  });

  it("매 암호화마다 salt·iv가 달라짐(같은 입력·비밀번호여도)", async () => {
    const a = await encryptBackup(sampleBackup(), "pw");
    const b = await encryptBackup(sampleBackup(), "pw");
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("isEncryptedBackupShape: 암호화 파일 판정", async () => {
    const enc = await encryptBackup(sampleBackup(), "pw");
    expect(isEncryptedBackupShape(enc)).toBe(true);
    expect(isEncryptedBackupShape(sampleBackup())).toBe(false);
    expect(isEncryptedBackupShape(null)).toBe(false);
    expect(isEncryptedBackupShape({ format: "korean-tax-calc-backup-encrypted" })).toBe(false);
  });
});

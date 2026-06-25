/**
 * 이력 백업 — Import 검증 (Zod + 악성 JSON 방어).
 *
 * 계획서: docs/00-pm/local-first-storage-backup.plan.md §4-4
 * - 형식·버전·필수 필드 검증
 * - 프로토타입 오염(__proto__·constructor·prototype) 키 제거
 * - 크기 제한(레코드 수·필드 바이트)
 */

import { z } from "zod";
import { db } from "./db";
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupFile } from "./backup-export";

const LOCAL_TAX_TYPES = [
  "transfer",
  "inheritance",
  "gift",
  "acquisition",
  "property",
  "comprehensive_property",
  "stock_transfer",
  "stock_valuation",
] as const;

const MAX_RECORDS = 10_000;
const MAX_FIELD_BYTES = 1_000_000; // 레코드당 inputData/resultData JSON 1MB

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** 프로토타입 오염 위험 키를 재귀 제거 (JSON.parse 산출물 — object/array/primitive만). */
function stripDangerous(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripDangerous);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>)) {
      if (DANGEROUS_KEYS.has(k)) continue;
      out[k] = stripDangerous((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

const recordObject = z
  .record(z.string(), z.unknown())
  .transform((v) => stripDangerous(v) as Record<string, unknown>)
  .refine(
    (v) => JSON.stringify(v).length <= MAX_FIELD_BYTES,
    { message: "필드 크기 초과(1MB)" },
  );

const calculationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  taxType: z.enum(LOCAL_TAX_TYPES),
  title: z.string(),
  inputData: recordObject,
  resultData: recordObject,
  taxLawVersion: z.string(),
  linkedCalculationId: z.string().nullable(),
  clientId: z.string().nullable(),
  contentHash: z.string().optional(),
  inputHash: z.string().optional(),
  businessKey: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const clientSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  birthDate: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  memo: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const userProfileSchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    birthDate: z.string().nullable(),
    mode: z.enum(["taxpayer", "professional"]),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .nullable();

function backupSchema() {
  return z.object({
    format: z.literal(BACKUP_FORMAT),
    version: z.literal(BACKUP_VERSION),
    // 미래 dbVersion(앱보다 높음) 차단 — 현 앱이 모르는 스키마
    dbVersion: z.number().int().min(1).max(db.verno),
    exportedAt: z.string(),
    userProfile: userProfileSchema,
    clients: z.array(clientSchema),
    calculations: z.array(calculationSchema).max(MAX_RECORDS, "레코드 수 초과(최대 10,000건)"),
  });
}

export type BackupValidationResult =
  | { ok: true; data: BackupFile }
  | { ok: false; error: string };

/** 가져온 JSON(unknown)을 검증·정제. 실패 시 사용자 안내 메시지 반환. */
export function validateBackup(raw: unknown): BackupValidationResult {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, error: "백업 파일 형식이 올바르지 않습니다." };
  }
  const parsed = backupSchema().safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join(".") || "(루트)";
    return {
      ok: false,
      error: `백업 파일 검증 실패: ${path} — ${first?.message ?? "알 수 없는 오류"}`,
    };
  }
  return { ok: true, data: parsed.data as BackupFile };
}

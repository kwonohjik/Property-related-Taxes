/**
 * 이력 백업 — Export (로컬 IndexedDB → JSON).
 *
 * 백업 대상: userProfile · clients · calculations (완료된 이력만).
 * 제외: reverseGeocodeCache · rtmsSalesCache (캐시, TTL 재생성) · sessionStorage 폼.
 *
 * 계획서: docs/00-pm/local-first-storage-backup.plan.md §4-1·§4-2·§4-3
 */

import { db } from "./db";
import { getCurrentUserId } from "./current-user";
import type { UserId } from "./constants";
import type { UserProfile, Client, CalculationRecord } from "./types";

export const BACKUP_FORMAT = "korean-tax-calc-backup" as const;
export const BACKUP_VERSION = 1 as const;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  /** 백업 스키마 버전 (해시 알고리즘 변경 시만 증가). */
  version: typeof BACKUP_VERSION;
  /** 앱 Dexie 버전 — 복원 호환성 검증용. */
  dbVersion: number;
  /** ISO 8601 스탬프. */
  exportedAt: string;
  userProfile: UserProfile | null;
  clients: Client[];
  calculations: CalculationRecord[];
}

/**
 * 현재 사용자의 백업 파일 객체 생성.
 * 캐시 테이블은 포함하지 않는다(재생성 가능).
 */
export async function buildBackup(
  uid: UserId = getCurrentUserId(),
): Promise<BackupFile> {
  const [userProfile, clients, calculations] = await Promise.all([
    db.userProfile.get(uid),
    db.clients.where("userId").equals(uid).toArray(),
    db.calculations.where("userId").equals(uid).toArray(),
  ]);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    dbVersion: db.verno,
    exportedAt: new Date().toISOString(),
    userProfile: userProfile ?? null,
    clients,
    calculations,
  };
}

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
import type { UserProfile, Client, CalculationRecord, LocalTaxType } from "./types";

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
 * 백업 범위 필터.
 * - ids: 특정 레코드만(단건/선택 내보내기 — 우선 적용).
 * - taxType / clientId: 세목·의뢰인 필터(clientId=null이면 미지정 레코드만).
 * 필터가 있으면 clients는 포함된 calculations가 참조하는 것만(참조 무결성 + PII 최소화).
 */
export interface BackupFilter {
  taxType?: LocalTaxType;
  clientId?: string | null;
  ids?: string[];
}

/**
 * 현재 사용자의 백업 파일 객체 생성.
 * 캐시 테이블은 포함하지 않는다(재생성 가능).
 * filter 미지정 시 전체(미사용 client 포함). 지정 시 관련 client만.
 */
export async function buildBackup(
  uid: UserId = getCurrentUserId(),
  filter?: BackupFilter,
): Promise<BackupFile> {
  const [userProfile, allClients, allCalculations] = await Promise.all([
    db.userProfile.get(uid),
    db.clients.where("userId").equals(uid).toArray(),
    db.calculations.where("userId").equals(uid).toArray(),
  ]);

  let calculations = allCalculations;
  let clients = allClients;

  if (filter) {
    if (filter.ids) {
      const idSet = new Set(filter.ids);
      calculations = allCalculations.filter((r) => idSet.has(r.id));
    } else {
      if (filter.taxType) {
        calculations = calculations.filter((r) => r.taxType === filter.taxType);
      }
      if (filter.clientId !== undefined) {
        calculations = calculations.filter(
          (r) => (r.clientId ?? null) === filter.clientId,
        );
      }
    }
    // 참조 무결성 + PII 최소화 — 포함된 계산이 참조하는 client만
    const usedClientIds = new Set(
      calculations.map((c) => c.clientId).filter(Boolean) as string[],
    );
    clients = allClients.filter((c) => usedClientIds.has(c.id));
  }

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

/**
 * 양도세 감면 분류 정정 마이그레이션 (Phase 1 산출물, 활성화는 Phase 2~)
 *
 * 배경:
 * - 2026-05-06 매핑 감사로 §99의3 = 신축주택(미분양 X) 분류 오류 확정
 *   (`docs/02-design/features/transfer-reduction-mapping-audit.md`)
 * - 사용자 결정사항 #3: 기존 이력 자동변환
 *
 * 변환 규칙:
 * - `type: "unsold_housing"` 인 reduction 항목을:
 *   - 자산 취득일이 2001.5.23~2003.6.30 → `type: "new_99_3"` (실제는 §99의3 신축)
 *   - 그 외 (대부분의 케이스, 특히 2009.2.12~2010.2.11) → `type: "unsold_98_3"` (정확한 §98의3 미분양)
 * - `type: "long_term_rental"` → `type: "rental_97_3"` (등록일 기반 추가 분기는 Phase 2)
 * - `type: "new_housing"` → `type: "new_99"` (시기 분기는 Phase 2)
 *
 * 활성화 절차 (Phase 2 진입 시):
 * 1. lib/storage/db.ts 에 version(4) 추가
 * 2. `.upgrade(tx => migrateReductionReclassification(tx))` 호출
 * 3. 사용자에게 1회 토스트 안내
 *
 * **현재 (Phase 1)**: 본 함수는 export 되었지만 db.ts에 통합되지 않음. 회귀 위험 0.
 */

import type { Transaction } from "dexie";

interface CalcRecordPartial {
  inputData?: {
    assets?: Array<{
      acquisitionDate?: string | Date;
      reductions?: Array<{ type: string; [key: string]: unknown }>;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const D = (s: string) => new Date(s + "T00:00:00");

const NEW_99_3_START = D("2001-05-23");
const NEW_99_3_END = D("2003-06-30");

function isInNew993Period(acqDate: string | Date | undefined): boolean {
  if (!acqDate) return false;
  const d = typeof acqDate === "string" ? new Date(acqDate) : acqDate;
  return d >= NEW_99_3_START && d <= NEW_99_3_END;
}

/**
 * Dexie upgrade 트랜잭션에서 호출하여 calculations 테이블의 reduction type을 정정.
 * @returns 변환된 레코드 수 (UI 토스트용)
 */
export async function migrateReductionReclassification(tx: Transaction): Promise<number> {
  let transformed = 0;
  await tx
    .table("calculations")
    .toCollection()
    .modify((r: CalcRecordPartial) => {
      const assets = r.inputData?.assets;
      if (!Array.isArray(assets)) return;
      for (const asset of assets) {
        const reductions = asset.reductions;
        if (!Array.isArray(reductions)) continue;
        for (const red of reductions) {
          if (red.type === "unsold_housing") {
            red.type = isInNew993Period(asset.acquisitionDate) ? "new_99_3" : "unsold_98_3";
            transformed += 1;
          } else if (red.type === "long_term_rental") {
            red.type = "rental_97_3";
            transformed += 1;
          } else if (red.type === "new_housing") {
            red.type = "new_99";
            transformed += 1;
          }
        }
      }
    });
  return transformed;
}

/**
 * 변환 사유 안내 메시지 (UI 토스트).
 */
export const MIGRATION_NOTICE_MESSAGE =
  "감면 조문 매핑 정정 (2026-05-06): §99의3은 신축주택 감면이며 미분양주택 감면이 아닙니다. 기존 이력은 자산 취득일을 기준으로 §99의3(신축) 또는 §98의3(미분양)으로 자동 분류되었습니다.";

// ============================================================================
// P2-1: 사용자 이력 영향 카운트 도구
// ============================================================================

export interface ReductionReclassificationImpact {
  /** 마이그레이션 영향 받는 calculations 레코드 수 */
  affectedRecordCount: number;
  /** 변환된 reduction 항목 수 (id별) */
  byType: {
    unsold_housing_to_new_99_3: number;   // §99의3 신축으로 자동 분류
    unsold_housing_to_unsold_98_3: number; // §98의3 미분양으로 자동 분류
    long_term_rental_to_rental_97_3: number;
    new_housing_to_new_99: number;
  };
  /** 변환 합계 */
  totalTransformed: number;
}

/**
 * 마이그레이션 영향 사전 산정 — db.ts v4 활성화 전·후 비교용.
 * 실제 변환은 수행하지 않고 카운트만 반환 (read-only).
 *
 * @example
 * import { db } from "@/lib/storage/db";
 * const impact = await analyzeReductionReclassificationImpact(db);
 * console.log(`영향 레코드: ${impact.affectedRecordCount}건, 변환 항목: ${impact.totalTransformed}개`);
 */
export async function analyzeReductionReclassificationImpact(
  db: { calculations: { toArray: () => Promise<CalcRecordPartial[]> } },
): Promise<ReductionReclassificationImpact> {
  const records = await db.calculations.toArray();
  const impact: ReductionReclassificationImpact = {
    affectedRecordCount: 0,
    byType: {
      unsold_housing_to_new_99_3: 0,
      unsold_housing_to_unsold_98_3: 0,
      long_term_rental_to_rental_97_3: 0,
      new_housing_to_new_99: 0,
    },
    totalTransformed: 0,
  };

  for (const r of records) {
    const assets = r.inputData?.assets;
    if (!Array.isArray(assets)) continue;
    let recordAffected = false;
    for (const asset of assets) {
      const reductions = asset.reductions;
      if (!Array.isArray(reductions)) continue;
      for (const red of reductions) {
        if (red.type === "unsold_housing") {
          if (isInNew993Period(asset.acquisitionDate)) {
            impact.byType.unsold_housing_to_new_99_3 += 1;
          } else {
            impact.byType.unsold_housing_to_unsold_98_3 += 1;
          }
          impact.totalTransformed += 1;
          recordAffected = true;
        } else if (red.type === "long_term_rental") {
          impact.byType.long_term_rental_to_rental_97_3 += 1;
          impact.totalTransformed += 1;
          recordAffected = true;
        } else if (red.type === "new_housing") {
          impact.byType.new_housing_to_new_99 += 1;
          impact.totalTransformed += 1;
          recordAffected = true;
        }
      }
    }
    if (recordAffected) impact.affectedRecordCount += 1;
  }

  return impact;
}

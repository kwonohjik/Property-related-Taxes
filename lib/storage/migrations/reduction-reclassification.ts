/**
 * 양도세 감면 분류 정정 마이그레이션 (Phase 1 산출물 — Phase 2에서 `db.ts` version(4)에 통합됨)
 *
 * 배경:
 * - 2026-05-06 매핑 감사로 §99의3 = 신축주택(미분양 X) 분류 오류 확정
 *   (`docs/02-design/features/transfer-reduction-mapping-audit.md`)
 * - 사용자 결정사항 #3: 기존 이력 자동변환
 *
 * 변환 규칙:
 * - `type: "unsold_housing"` 인 reduction 항목을 (NH-73 · Q-17 — **계약일 축**, 조특법 §99의3①·§98의3①은 둘 다 «계약 체결일» 기준이다):
 *   - 자산 매매계약일(`assetContractDate`)이 2001.5.23~2003.6.30 → `type: "new_99_3"` (실제는 §99의3 신축)
 *   - 자산 매매계약일이 2009.2.12~2010.2.11 → `type: "unsold_98_3"` (정확한 §98의3 미분양)
 *   - 계약일이 없거나 두 시한 밖(옛 기록은 대부분 계약일 칸이 없다) → 취득일로 **가능한 조문만** 가리고 그 조문의 기본 폼으로 옮긴다.
 *     계약일은 취득일(또는 그 전)이므로 취득일이 2009.2.12. 전이면 §98의3은 불가능하다 → §99의3(계약일 ≤ 2003.6.30. 가능).
 *     취득일이 2009.2.12. 이후(또는 없음)면 §98의3. 계약일 칸은 비워 두고 ⑧이 묻는다(없는 사실을 만들지 않는다) —
 *     종전에는 2003.7.1.~2009.2.11. 취득분이 불가능한 §98의3으로 가서 계약일 2003년 입력이 «기간 밖»이 되어 감면이 사라졌다(35,280,000 사례).
 * - `type: "long_term_rental"` → `type: "rental_97_3"` (등록일 기반 추가 분기는 Phase 2)
 * - `type: "new_housing"` → `type: "new_99"` (시기 분기는 Phase 2)
 *
 * 통합 위치: `lib/storage/db.ts`의 `this.version(4)…upgrade(async (tx) => { await migrateReductionReclassification(tx); })`
 * — IndexedDB가 v4 미만인 브라우저에서 1회 실행된다. (종전 헤더의 「db.ts에 통합되지 않음」은 v4 통합 뒤 갱신되지 않은 문구였다 — NH-79.)
 */

import type { Transaction } from "dexie";

interface CalcRecordPartial {
  inputData?: {
    assets?: Array<{
      acquisitionDate?: string | Date;
      /** 자산-수준 매매계약일(Round 9, 2026-05-06) — 감면 조문 이관의 계약일 축 */
      assetContractDate?: string | Date;
      reductions?: Array<{ type: string; [key: string]: unknown }>;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const D = (s: string) => new Date(s + "T00:00:00");

const NEW_99_3_START = D("2001-05-23");
const NEW_99_3_END = D("2003-06-30");
/** 조특법 §98의3① 계약 체결 기간(거주자) — `transfer-reductions/unsold-hybrid-p3.ts` `UNSOLD_98_3_PERIOD_FROM_RESIDENT`·`UNSOLD_98_3_PERIOD_TO`와 같다. */
const UNSOLD_98_3_START = D("2009-02-12");
const UNSOLD_98_3_END = D("2010-02-11");

/** 문자열은 기준일(`D` — 로컬 자정)과 같은 축으로 읽는다. `new Date("2003-06-30")`은 UTC 자정이라 UTC보다 빠른 시간대(KST)에서 종료일 당일분이 기간 밖으로 갈렸다. */
function toLocalDate(value: string | Date | undefined): Date | undefined {
  if (!value) return undefined;
  const d = typeof value === "string" ? D(value.slice(0, 10)) : value;
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * 레거시 신축·미분양 단순 감면 타입 → 조문 ID. 이력(아래 Dexie upgrade)과 세션 복원
 * (`lib/stores/legacy-housing-reduction.ts`)이 **같은 규칙**을 쓴다.
 *
 * `unsold_housing`은 **계약일 축**으로 가른다(NH-73): 계약일이 §99의3 기간이면 `new_99_3`, §98의3 기간이면 `unsold_98_3`.
 * 계약일이 없거나 두 기간 밖이면 취득일로 가능한 조문만 고른다 — 계약일은 취득일을 넘을 수 없으므로 취득일이 2009.2.12. 전이면
 * §98의3은 불가능해 `new_99_3`, 그 이후(또는 취득일 없음)면 `unsold_98_3`이다. 이 경우 계약일은 ⑧이 묻는다.
 */
export function reclassifiedLegacyHousingType(
  type: "new_housing" | "unsold_housing",
  acquisitionDate: string | Date | undefined,
  contractDate?: string | Date,
): "new_99" | "new_99_3" | "unsold_98_3" {
  if (type === "new_housing") return "new_99";
  const contract = toLocalDate(contractDate);
  if (contract) {
    if (contract >= NEW_99_3_START && contract <= NEW_99_3_END) return "new_99_3";
    if (contract >= UNSOLD_98_3_START && contract <= UNSOLD_98_3_END) return "unsold_98_3";
  }
  const acquisition = toLocalDate(acquisitionDate);
  return acquisition && acquisition < UNSOLD_98_3_START ? "new_99_3" : "unsold_98_3";
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
            red.type = reclassifiedLegacyHousingType("unsold_housing", asset.acquisitionDate, asset.assetContractDate);
            transformed += 1;
          } else if (red.type === "long_term_rental") {
            red.type = "rental_97_3";
            transformed += 1;
          } else if (red.type === "new_housing") {
            red.type = reclassifiedLegacyHousingType("new_housing", asset.acquisitionDate);
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
  "감면 조문 매핑 정정 (2026-05-06): §99의3은 신축주택 감면이며 미분양주택 감면이 아닙니다. 기존 이력은 매매계약일(없으면 취득일로 가능한 조문)을 기준으로 §99의3(신축) 또는 §98의3(미분양)으로 자동 분류되었습니다.";

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
          if (reclassifiedLegacyHousingType("unsold_housing", asset.acquisitionDate, asset.assetContractDate) === "new_99_3") {
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

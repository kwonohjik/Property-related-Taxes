/**
 * gift-burdened-stock-unlisted.ts — 증여 부담부 주식(비상장·환산) §165④ 보충적 평가 입력의
 * ④ body 구성과 ⑧ 필수 판정 (B23, 2026-09-30).
 *
 * 비상장 환산취득가 = 양도가액(채무인수액) × 취득기준시가 ÷ 양도기준시가 (소득세법 시행령
 * §176의2②·§165④). 두 기준시가는 §165④ 평가액이므로 1주당 순손익가치·순자산가치가 없으면
 * 엔진은 양도기준시가 0 → **취득가액 0**으로 계산한다(종전: 세액 199,500,000 — 입력 칸 자체가 없었다).
 *
 * 규칙은 주식 마법사 ⑧(`validateUnlistedSimpleFields`·동일 사업연도 토글)의 거울이다 —
 * 부담부증여 경로는 간이(simple) 입력만 받고 액면가(§99①4 후단) 토글이 없다.
 *   - 순자산가치(양도·취득)는 항상 필수
 *   - 순손익가치(양도·취득)는 §165④3 순자산 단독 사유가 없을 때 필수
 *   - 동일 사업연도 토글(소칙 §81④1호) ON이면 전전사업연도 순자산(+ 사유 없으면 순손익) 필수
 * 0·음수는 적법한 값이다(결손·자본잠식) — 「존재」만 본다.
 */

import type { BurdenedGiftStockTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

type UnlistedFields = Pick<
  BurdenedGiftStockTransferTaxInput,
  | "transferYearNetIncomePerShare"
  | "transferYearNetAssetPerShare"
  | "acquisitionYearNetIncomePerShare"
  | "acquisitionYearNetAssetPerShare"
  | "netAssetOnlyReason"
  | "unlistedSameBizYearToggle"
  | "prePriorYearNetIncomePerShare"
  | "prePriorYearNetAssetPerShare"
  | "priorBizYearMonths"
>;

/**
 * ④ — 비상장·환산 분기에서 stock-transfer body에 얹을 필드.
 * 미입력(undefined)은 싣지 않는다 — 0으로 채우면 ⑫의 「미입력」 차단을 우회한다.
 */
export function buildBurdenedUnlistedValuationFields(
  bgt: UnlistedFields,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const sameBizYear = bgt.unlistedSameBizYearToggle === true;
  const numeric = [
    "transferYearNetIncomePerShare",
    "transferYearNetAssetPerShare",
    "acquisitionYearNetIncomePerShare",
    "acquisitionYearNetAssetPerShare",
    // §81④1호 입력은 토글 ON일 때만 싣는다 — OFF인데 남은 값(화면에 없는 칸)이
    // ⑫ 범위 검사에 걸려 ⑧은 통과·서버는 400인 막다른 길이 되지 않게 한다.
    ...(sameBizYear
      ? (["prePriorYearNetIncomePerShare", "prePriorYearNetAssetPerShare", "priorBizYearMonths"] as const)
      : []),
  ] as const;
  for (const k of numeric) {
    const v = bgt[k];
    if (v !== undefined) out[k] = v;
  }
  if (bgt.netAssetOnlyReason) out.netAssetOnlyReason = bgt.netAssetOnlyReason;
  // 주식 마법사 ④와 같이 boolean을 항상 싣는다 (stale 이력의 undefined는 OFF).
  out.unlistedSameBizYearToggle = sameBizYear;
  return out;
}

/** ⑧ — 누락된 입력의 화면 라벨 목록(순서 = 화면 순서). 비어 있으면 통과. */
export function missingBurdenedUnlistedValuationInputs(bgt: UnlistedFields): string[] {
  const niSkip = !!bgt.netAssetOnlyReason;
  const missing: string[] = [];
  if (!niSkip && bgt.transferYearNetIncomePerShare === undefined)
    missing.push("양도일(증여일) 직전 사업연도 1주당 순손익가치");
  if (bgt.transferYearNetAssetPerShare === undefined)
    missing.push("양도일(증여일) 직전 사업연도 1주당 순자산가치");
  if (!niSkip && bgt.acquisitionYearNetIncomePerShare === undefined)
    missing.push("취득일 직전 사업연도 1주당 순손익가치");
  if (bgt.acquisitionYearNetAssetPerShare === undefined)
    missing.push("취득일 직전 사업연도 1주당 순자산가치");
  if (bgt.unlistedSameBizYearToggle === true) {
    if (!niSkip && bgt.prePriorYearNetIncomePerShare === undefined)
      missing.push("전전사업연도 1주당 순손익가치");
    if (bgt.prePriorYearNetAssetPerShare === undefined)
      missing.push("전전사업연도 1주당 순자산가치");
    // ⑫ `priorBizYearMonths: z.number().int().min(1).max(12)` — 범위 밖이면 서버가 400을 낸다.
    const m = bgt.priorBizYearMonths;
    if (m !== undefined && (!Number.isInteger(m) || m < 1 || m > 12))
      missing.push("직전 사업연도 월수(1~12 정수)");
  }
  return missing;
}

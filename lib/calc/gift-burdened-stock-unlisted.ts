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
 *   - 순손익가치(양도·취득)는 그 평가 시점에 §165④3 순자산 단독 사유가 없을 때 필수
 *   - 동일 사업연도 토글(소칙 §81④1호) ON이면 전전사업연도 순자산(+ 사유 없으면 순손익) 필수
 * 0·음수는 적법한 값이다(결손·자본잠식) — 입력 누락은 「존재」만 본다. 다만 그 값으로 잰 양도기준시가가
 * 0 이하이면 환산 산식의 분모가 0이라 따로 막는다(`burdenedTransferStdNonPositiveError`).
 */

import { toOptionalDate } from "@/lib/api/date-coerce";
import { isNetAssetOnlyReasonInEra } from "@/lib/tax-engine/stock-transfer/net-asset-only-basis";
import {
  isSection165_4EraUnsupported,
  isTransferSupplementaryNonPositive,
} from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import type { BurdenedGiftStockTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

type UnlistedFields = Pick<
  BurdenedGiftStockTransferTaxInput,
  | "transferYearNetIncomePerShare"
  | "transferYearNetAssetPerShare"
  | "acquisitionYearNetIncomePerShare"
  | "acquisitionYearNetAssetPerShare"
  | "netAssetOnlyReason"
  | "acquisitionNetAssetOnlyReason"
  | "unlistedSameBizYearToggle"
  | "prePriorYearNetIncomePerShare"
  | "prePriorYearNetAssetPerShare"
  | "priorBizYearMonths"
>;

/**
 * 취득 당시 평가의 §165④3 사유 — 키가 없는 종전 레코드는 양도 사유를 따른다(종전 의미 = 양측).
 * `null`은 사용자가 고른 «없음»이다. ⑤·④·⑧이 모두 이 함수를 거친다.
 */
export function burdenedAcquisitionReason(
  bgt: Pick<BurdenedGiftStockTransferTaxInput, "netAssetOnlyReason" | "acquisitionNetAssetOnlyReason">,
): BurdenedGiftStockTransferTaxInput["netAssetOnlyReason"] {
  return bgt.acquisitionNetAssetOnlyReason === undefined
    ? bgt.netAssetOnlyReason
    : (bgt.acquisitionNetAssetOnlyReason ?? undefined);
}

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
  const acqReason = burdenedAcquisitionReason(bgt);
  if (acqReason) out.acquisitionNetAssetOnlyReason = acqReason;
  // 주식 마법사 ④와 같이 boolean을 항상 싣는다 (stale 이력의 undefined는 OFF).
  out.unlistedSameBizYearToggle = sameBizYear;
  return out;
}

/** ⑧ — 누락된 입력의 화면 라벨 목록(순서 = 화면 순서). 비어 있으면 통과. */
export function missingBurdenedUnlistedValuationInputs(bgt: UnlistedFields): string[] {
  // 평가 시점마다 따로 — 전전연도는 보정 대상인 양도 기준시가와 같은 기준
  const niSkip = !!bgt.netAssetOnlyReason;
  const niSkipAcq = !!burdenedAcquisitionReason(bgt);
  const missing: string[] = [];
  if (!niSkip && bgt.transferYearNetIncomePerShare === undefined)
    missing.push("양도일(증여일) 직전 사업연도 1주당 순손익가치");
  if (bgt.transferYearNetAssetPerShare === undefined)
    missing.push("양도일(증여일) 직전 사업연도 1주당 순자산가치");
  if (!niSkipAcq && bgt.acquisitionYearNetIncomePerShare === undefined)
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

/**
 * ⑧ — §165④ 양도일(증여일) 연혁. ⑫(`refineSingleModeRequiredInputs`)와 같은 조건·문구다.
 *
 * 이 경로는 비상장·환산이라 §165④3 사유를 양측 모두 읽는다(`netAssetOnlyReasonSidesRead`의 «추정 모드 비상장» 행).
 * 증여일이 없거나 해석되지 않으면 막지 않는다(날짜는 1단계 필수 입력이 따로 잡는다).
 * 사유를 고른 뒤 증여일을 고쳐 연혁이 어긋나면 ⑫가 합산 호출 전체를 400으로 돌려 JSON 그대로 배너에 나왔다.
 */
export function burdenedUnlistedEraError(
  bgt: Pick<BurdenedGiftStockTransferTaxInput, "netAssetOnlyReason" | "acquisitionNetAssetOnlyReason">,
  giftDate: string | undefined,
): string | null {
  const td = toOptionalDate(giftDate);
  if (!td) return null;
  if (isSection165_4EraUnsupported(td)) return UNLISTED_MESSAGES.SECTION_165_4_ERA_UNSUPPORTED;
  if (
    !isNetAssetOnlyReasonInEra(bgt.netAssetOnlyReason ?? undefined, td) ||
    !isNetAssetOnlyReasonInEra(burdenedAcquisitionReason(bgt), td)
  )
    return UNLISTED_MESSAGES.NET_ASSET_ONLY_REASON_ERA;
  return null;
}

/**
 * ⑧ — Q-4b: 양도기준시가(1주당 보충평가액)가 0 이하면 환산 산식의 분모가 0이다. ⑫(`refineSingleModeRequiredInputs`)와
 * 같은 술어·문구다. 종전에는 ⑧이 통과시키고 ⑫만 400을 내, 합산 호출이 전체 실패하며 배너에 JSON이 그대로 나왔다.
 *
 * 입력이 비어 있으면 필수 오류가 따로 뜨므로 여기서는 보지 않고, 2000.4.2. 이전은 연혁 오류가 먼저다
 * (`burdenedUnlistedEraError`) — 값을 재지 않는다. 이 경로는 비상장·환산이라 ⑫의 `scope === "both"`와 같다.
 */
export function burdenedTransferStdNonPositiveError(
  bgt: Pick<
    BurdenedGiftStockTransferTaxInput,
    "netAssetOnlyReason" | "transferYearNetIncomePerShare" | "transferYearNetAssetPerShare" | "isHeavyRealEstateForValuation"
  >,
  giftDate: string | undefined,
): string | null {
  const td = toOptionalDate(giftDate);
  if (!td || isSection165_4EraUnsupported(td)) return null;
  const na = bgt.transferYearNetAssetPerShare;
  const ni = bgt.transferYearNetIncomePerShare;
  const niSkip = !!bgt.netAssetOnlyReason;
  if (na === undefined || (!niSkip && ni === undefined)) return null;
  return isTransferSupplementaryNonPositive(ni ?? 0, na, bgt.isHeavyRealEstateForValuation === true, td, niSkip)
    ? UNLISTED_MESSAGES.TRANSFER_STD_NON_POSITIVE
    : null;
}

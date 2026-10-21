/**
 * 토지/건물 분리(§166⑥) 입력 검증의 «양도시 기준시가·개별주택가격·감정평가가액» 구간 — `validateSplitDirectInputs`(`transfer-tax-validate-split.ts`)에서 분리했다(800줄 정책).
 * 순서·문구는 분리 전과 같다(V7 → V7-H → V8 → V8-b). 호출부가 `landMode`/`buildingMode`·`saleAxisInput`을 넘긴다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { saleStdPriceWaivedByEra } from "./sale-split-100-3-era";
import { needsSaleStdPart, ownerSplitHousingNeedsTransferTotal, resolveLandStdAtTransfer } from "./transfer-tax-split-acq-mode";
import type { PartAcqMode } from "@/lib/tax-engine/transfer-tax-split-acq-price";
import { partDonorEstimated } from "./transfer-land-part-cause";
import { fieldError } from "./transfer-tax-validate-field";

/** 빈 문자열·0 → undefined (API 변환 `parseAmount(...) || undefined`과 동일 규약) */
export function opt(v: string | undefined): number | undefined {
  const n = parseAmount(v ?? "");
  return n > 0 ? n : undefined;
}

export function validateSaleStdAndAppraisal(
  asset: AssetForm,
  label: string,
  formTransferDate: string | undefined,
  /** 부담부증여가 아니다 — 양도가액 구분·양도시 기준시가 파트 칸을 렌더하고 ④가 싣는다 */
  saleAxisInput: boolean,
  landMode: PartAcqMode,
  buildingMode: PartAcqMode,
  opts?: { isNonPrimary?: boolean },
): string | null {
  // ── V7. 양도시 기준시가 — **파트별** 필수 (2026-07-30 파트 배치) ────────────────────
  // 종전에는 한쪽 파트만 환산이어도 양쪽을 요구했다. 기준시가 카드가 "쓰는 섹션 아래"로 이동한
  // 뒤에는 그 요구가 **입력 칸 없는 차단**이 된다 — 구분양도 + 토지만 환산이면 건물 양도시
  // 기준시가 칸이 화면에 없다(계획서 §5.5). 노출 술어와 같은 함수로 파트별로 판정한다.
  // 메시지는 `양도시 기준시가` 연속 토큰을 유지한다 — 기존 anchor 4곳이 그 부분문자열에 의존한다
  // (transfer-tax-validate-split.test.ts:78,86,537,550).
  // 양도일 2016.1.1. 전 + 구분 기재 + 환산 파트 없음이면 이 값은 어디에도 쓰이지 않아 필수를 풀어 준다(계획서 Q-2 · `saleStdPriceWaivedByEra`).
  // P6 — 증여자 취득가액을 모르는 파트 이월과세 파트는 «환산 파트»로 센다: 분모(양도시 기준시가)가 계산에 쓰이고 ⑫도 연혁 면제 없이 요구한다(⑧↔⑫ 정합).
  //   `landMode`/`buildingMode`는 수증자 쪽 방식이라(이월과세에서는 정규화 사본이 `actual` 고정) 증여자 환산을 세지 못한다 → 같은 술어(`partDonorEstimated`)로 보정한다.
  const donorEst = partDonorEstimated(asset, opts);
  const stdWaived = saleStdPriceWaivedByEra({
    transferDate: formTransferDate,
    saleSplitMode: asset.saleSplitMode,
    landMode: donorEst.land ? "estimated" : landMode,
    buildingMode: donorEst.building ? "estimated" : buildingMode,
  });
  if (saleAxisInput && !stdWaived && needsSaleStdPart("land") && resolveLandStdAtTransfer(asset) == null) {
    const saleLandMsg = `${label}: 일괄양도 안분·환산취득가 계산에는 양도시 기준시가 중 토지분(㎡당 공시지가 × 면적)이 필요합니다 (소득세법 §99①1호 가목).`;
    // 단가가 있으면 면적이 빈 것이다(`resolveLandStdAtTransfer` = 단가 × 면적, 또는 총액)
    if (opt(asset.standardPricePerSqmAtTransfer) != null) return fieldError("transferArea", saleLandMsg);
    return fieldError("standardPricePerSqmAtTransfer", saleLandMsg);
  }
  if (saleAxisInput && !stdWaived && needsSaleStdPart("building") && opt(asset.buildingStandardPriceAtTransfer) == null) {
    return fieldError("buildingStandardPriceAtTransfer", `${label}: 일괄양도 안분·환산취득가 계산에는 양도시 기준시가 중 건물분이 필요합니다 — 「건물 기준시가 계산」으로 산정해 입력하세요 (소득세법 §99①1호 나목).`);
  }

  // ── V7-H. 양도시 개별주택가격 — 주택 소유자 분리 + 환산 파트 (S3-1 D-1 ⓑ) ──────────────
  // 환산취득가액의 분모도 취득시와 같은 비례 척도(양도시 개별주택가격 × 가목 ÷ (가목 + 나목))다. 값이 없으면 엔진이
  // 던지므로(`calcSplitAcquisitionPrice`) 여기서 필드 오류로 먼저 알린다. 노출 술어와 같은 leaf를 쓴다.
  if (ownerSplitHousingNeedsTransferTotal(asset) && opt(asset.standardPriceAtTransfer) == null) {
    return fieldError(
      "standardPriceAtTransfer",
      `${label}: 개별주택가격으로 환산취득가액을 구하려면 양도시 개별주택가격이 필요합니다 — 취득시와 같은 방식으로 양도시 토지 기준시가·건물 기준시가 비율로 나눕니다 (소득세법 §99①1호 가목·나목·시행령 §164⑤·§166⑥).`,
    );
  }

  // ── V8. 양도시 감정평가가액 — 3필드 all-or-nothing (부가령 §64①1호 단서) ────────────────
  // 감정평가가액은 안분 basis **서열 1순위**다. 불완전 입력이 조용히 기준시가로 후퇴하면 사용자는
  // 자기가 넣은 값이 안 쓰인 사실을 모른다. 엔진이 사유(`appraisalRejected`)를 남기기는 하지만,
  // **입력 시점에 막는 것**이 먼저다(자동 fallback 금지 — `feedback_no_silent_apportion_fallback`).
  //
  // ⚠️ `saleSplitMode`와 **무관하게** 적용한다 — 일괄양도(안분)에서도 basis가 되기 때문이다.
  //    여기를 구분양도로 좁히면 일괄양도에서 불완전 감정가액이 그대로 통과한다.
  const landApp = opt(asset.landAppraisalAtTransfer);
  const buildingApp = opt(asset.buildingAppraisalAtTransfer);
  const anyAppraisal = landApp != null || buildingApp != null;
  /**
   * 🔴 **감정일자는 요구하지 않는다**(2026-08-06 · Q-9 확정 — 계획서 §21).
   *
   * 종전에는 시기 요건(유효 창) 판정에 필요해서 필수로 받았다. 그 판정을 폐지했으므로 일자는
   * **선택 입력**이 됐다(기록·신고서 참고용). 요건 충족 여부는 사용자 책임이다.
   *
   * ⚠️ 반면 「양쪽 모두」는 **그대로 요구한다** — 법령 판단이 아니라 **비율을 내려면 두 값이
   *    필요하다**는 산술적 필요조건이기 때문이다.
   */
  if (anyAppraisal && (landApp == null || buildingApp == null)) {
    const appraisalPairMsg = `${label}: 양도시 감정평가가액은 토지·건물 양쪽 모두 필요합니다 — 한쪽만 입력하면 그 파트를 평가하지 않은 것으로 보아 기준시가 비율로 안분합니다 (부가가치세법 시행령 §64①1호 단서).`;
    if (landApp == null) return fieldError("landAppraisalAtTransfer", appraisalPairMsg);
    return fieldError("buildingAppraisalAtTransfer", appraisalPairMsg);
  }

  /**
   * V8-b **「감정평가」 모드를 골랐으면 금액이 있어야 한다** (2026-08-07 3-way 통합).
   *
   * 엔진 스위치는 모드가 아니라 **값의 유무**다(`transfer-tax-api-split.ts:75`). 모드만 고르고
   * 금액을 비우면 basis 서열에서 감정평가가 빠져 **조용히 기준시가로 안분**된다 — 사용자는
   * 자기가 고른 방식이 안 쓰인 사실을 모른다(자동 fallback 금지).
   *
   * ⚠️ 위 V8은 「한쪽만 입력」을 막고, 여기서는 「둘 다 빈 채로 모드만 선택」을 막는다.
   */
  if (asset.saleSplitMode === "appraisal" && !anyAppraisal) {
    return fieldError("landAppraisalAtTransfer", `${label}: 「감정평가」를 선택했으면 토지·건물 감정평가가액을 입력하세요 — 비워두면 양도시 기준시가 비율로 안분됩니다 (부가가치세법 시행령 §64①1호 단서).`);
  }


  return null;
}

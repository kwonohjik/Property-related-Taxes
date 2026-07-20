/**
 * 겸용주택 상속 취득가액 (소득세법 시행령 §163⑨ 엔진 정합) — 800줄 정책 분리.
 *
 * `transfer-tax-mixed-use-helpers.ts`(802줄 실측)에 인라인 추가 시 900줄대 진입 확정이라
 * 별도 leaf 파일로 분리. helpers.ts 는 이 파일의 함수를 호출만 한다.
 *
 * 법령 근거 (계획서 §3 KoreanLaw 검증 재사용):
 *   소령 §163⑨ 본문 — 상속·증여 자산은 상속개시일 현재 상증법 §60~66 평가액을
 *     취득당시 실지거래가액으로 본다("환산"이 아닌 "실지거래가액 의제" — 단일 값 fallback, max 아님).
 *   소령 §163⑨2호 — 개별주택가격 미공시 상속주택 취득가액 =
 *     max(① 상증법 §60~66 평가액, ② §164⑤~⑦ 가액). 미공시 시에만 명시적으로 "max" 비교.
 *
 * 설계 문서: docs/02-design/features/transfer-mixed-use-inheritance-acquisition.engine.design.md
 */

import type { MixedUseAssetInput } from "./types/transfer-mixed-use.types";
import type { PreHousingDisclosureResult } from "./types/transfer.types";

/** 상속 취득가액 산정 상세 — 산식 표시용 echo (housing·commercial 공용). */
export interface InheritedAcquisitionDetail {
  /** 사용자 입력 신고가액(housingInheritedValue/commercialInheritedValue). 미입력 null. */
  reportedValue: number | null;
  /** 자동 후보 — 비-PHD: acquisitionStandardPrice 기반 보충적평가 합계. PHD: §164⑦ 환산(P_A_est, 미스케일). */
  standardPriceCandidate: number;
  /** 채택된 후보. 공시(비-PHD)는 fallback이므로 reportedValue 있으면 항상 "reported".
   *  미공시(PHD)는 max 비교 결과. */
  selected: "reported" | "standard_price";
}

/** §163⑨ 본문 — 공시(비-PHD) 주택분. fallback(??), max 아님. */
export function resolveHousingInheritedAcqDirect(
  asset: MixedUseAssetInput,
): { estimatedAcq: number; detail: InheritedAcquisitionDetail } {
  const reported = asset.housingInheritedValue ?? null;
  const stdCandidate = asset.acquisitionStandardPrice.housingPrice ?? 0;
  if (reported === null && stdCandidate <= 0) {
    throw new Error(
      "상속 취득: 주택분 상속개시일 평가액 정보가 없습니다. " +
        "상속세 신고가액 또는 취득시(상속개시일) 개별주택가격을 입력하세요.",
    );
  }
  return {
    estimatedAcq: reported ?? stdCandidate,
    detail: {
      reportedValue: reported,
      standardPriceCandidate: stdCandidate,
      selected: reported !== null ? "reported" : "standard_price",
    },
  };
}

/** §163⑨2호 — 미공시(PHD) 주택분 = max(신고가액, §164⑦ 환산). 토지/건물 분리까지 반환. */
export function resolveHousingInheritedAcqPhd(
  asset: MixedUseAssetInput,
  phd: PreHousingDisclosureResult,
): {
  estimatedAcq: number;
  landAcqPrice: number;
  buildingAcqPrice: number;
  detail: InheritedAcquisitionDetail;
} {
  const reported = asset.housingInheritedValue ?? null;
  const stdCandidate = phd.estimatedHousingPriceAtAcquisition; // P_A_est, 미스케일(양도가 무관)
  const estimatedAcq = Math.max(reported ?? 0, stdCandidate);
  const selected: "reported" | "standard_price" =
    reported !== null && reported >= stdCandidate ? "reported" : "standard_price";

  // 토지/건물 분리 — PHD 내부 취득시 미스케일 비율(landHousingAtAcquisition/P_A_est) 재사용.
  // phd.landHousingAtAcquisition + phd.buildingHousingAtAcquisition === P_A_est 항상 성립(Step5).
  const landRatio = stdCandidate > 0 ? phd.landHousingAtAcquisition / stdCandidate : 0.5;
  const landAcqPrice = Math.floor(estimatedAcq * landRatio);
  const buildingAcqPrice = estimatedAcq - landAcqPrice;

  return {
    estimatedAcq,
    landAcqPrice,
    buildingAcqPrice,
    detail: { reportedValue: reported, standardPriceCandidate: stdCandidate, selected },
  };
}

/** §163⑨ 본문 — 상가분(토지+건물 합계). fallback. */
export function resolveCommercialInheritedAcq(
  asset: MixedUseAssetInput,
  acqTotalStd: number,
): { estimatedAcqPrice: number; detail: InheritedAcquisitionDetail } {
  const reported = asset.commercialInheritedValue ?? null;
  if (reported === null && acqTotalStd <= 0) {
    throw new Error(
      "상속 취득: 상가분 상속개시일 평가액 정보가 없습니다. " +
        "상속세 신고가액 또는 취득시(상속개시일) 상가건물 기준시가+개별공시지가를 입력하세요.",
    );
  }
  return {
    estimatedAcqPrice: reported ?? acqTotalStd,
    detail: {
      reportedValue: reported,
      standardPriceCandidate: acqTotalStd,
      selected: reported !== null ? "reported" : "standard_price",
    },
  };
}

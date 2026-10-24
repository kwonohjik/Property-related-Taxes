/**
 * 「환산 개별주택가격 계산해 채우기」 — 소득세법 시행령 §164⑦ 산식 결과를 «취득 당시 기준시가» 칸에 채우는 **계산 보조** 순수 함수.
 *
 * ## 무엇이고 무엇이 아닌가
 *
 * - 대상: 취득가액을 **실거래가·감정가액·매매사례가액**으로 정하는 **주택**(비환산). 취득일로 거르지 않는다 — 취득 당시 그 주택의 가격이 공시되기 전인지는
 *   사용자가 입력한 최초 고시일과 비교해 `computeConvertedHousingPrice` 가 가른다(취득일 ≥ 최초 고시일이면 계산을 거부).
 *   이 방식에서는 §164⑦ 3-시점 환산(PHD)이 성립하지 않는다(`phdAcqMethodEstimated`). 대신 개산공제 base(영 §163⑥2호 가목 — «취득당시의 라목 가액»)가
 *   곧 §164⑦ 산식 결과이므로, 사용자가 «취득시 기준시가» 칸에 그 값을 입력한다. 이 모듈은 그 값을 **계산해 주는 보조 도구**다.
 * - **전송·요구 없음**: 보조 입력(기존 `phd*` 칸)은 ④ 가 보내지 않고(`phdFlagEffective` false) ⑧ 도 요구하지 않는다. 엔진으로 가는 것은
 *   사용자가 확인한 `standardPriceAtAcq` 한 칸뿐이다 — 숨은/보조 입력 = 미전송 = 미요구(3중 패턴).
 * - **자동 갱신 없음**: 호출부는 버튼 클릭 시 **한 번** `onChange` 로 채운다. useEffect → store 미러링 금지.
 *
 * ## 산식은 엔진 함수를 그대로 쓴다
 *
 * `calcPreHousingDisclosureGain` 의 `estimatedHousingPriceAtAcquisition`(= floor(최초 고시 주택가격 × 취득 당시 합계 ÷ 최초 고시 당시 합계))를
 * 재사용한다 — 면적 곱셈의 부동소수·절사 위치가 환산 경로(PHD)와 같아야 «버튼 결과 = 엔진 환산값»이 성립한다. 양도시 인자는 이 값에 쓰이지 않아 0 을 넘긴다.
 * 입력 매핑은 ④(`buildPreHousingDisclosurePayload`)와 같다 — 면적은 `acquisitionArea`, 취득시 토지 ㎡당 가액은 1990.8.30. 이전이면 §164④ 등급가액 환산 fallback.
 *
 * 용어: §164⑦ 결과는 **«환산 개별주택가격»**이다(«추정값»·«법정 값» 등 법령에 없는 조어 금지).
 * 계획서: docs/00-pm/phd-appraisal-dead-end.plan.md §9.2
 */
import { parseAmount } from "@/lib/calc/number-parse";
import { isPhdEligible } from "@/lib/calc/phd-eligibility";
import { phdAcqMethodEstimated, phdToggleCauseReachable } from "@/lib/calc/phd-toggle-scope";
import { landCauseMixActive } from "@/lib/calc/transfer-land-part-cause";
import { derivePre1990PlainHousePhdLandPricePerSqmAtAcq } from "@/lib/calc/transfer-pre1990-phd-bridge";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { calcPreHousingDisclosureGain } from "@/lib/tax-engine/transfer-tax-pre-housing-disclosure";
import { classifySameAdjustmentPeriod } from "@/lib/tax-engine/same-adjustment-period-std-price";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 이 자산·방식에서 «환산 개별주택가격 계산해 채우기» 보조가 **열리는가** (취득시 기준시가 칸이 있는 곳에서만 호출부가 렌더한다). */
export function phdFillAssistVisible(asset: AssetForm): boolean {
  if (asset.assetKind !== "housing") return false;
  // 상속·증여·신축 취득원인 · 토지 원인 혼합은 PHD 토글이 닿지 않는 범위 — 이 보조의 범위 밖
  if (!phdToggleCauseReachable(asset) || landCauseMixActive(asset)) return false;
  // 환산이면 PHD 3-시점 토글이 대신한다 — 두 카드가 함께 뜨지 않게 한다(같은 leaf 의 부정).
  // 이 leaf 는 겸용주택·이월과세(자기 패널·자기 게이트)에서도 true 라 그 둘도 여기서 함께 제외된다.
  // 취득일 조건은 두지 않는다 — 신축 직후 취득처럼 그 주택(공동주택은 단지)의 첫 공시가 늦으면 2005.4.30. 뒤 취득이어도 환산이 필요하다.
  // 적용 가능 여부(취득일 < 입력한 최초 고시일)는 계산 시점의 `isPhdEligible`(`computeConvertedHousingPrice`)이 가른다.
  return !phdAcqMethodEstimated(asset);
}

export type ConvertedHousingPriceResult =
  | {
      ok: true;
      /** 환산 개별주택가격 = floor(최초 고시 주택가격 × 취득 당시 합계 ÷ 최초 고시 당시 합계) — 엔진 `estimatedHousingPriceAtAcquisition` */
      value: number;
      firstDisclosureHousingPrice: number;
      /** 취득 당시 토지+건물 기준시가 합계 */
      sumAtAcquisition: number;
      /** 최초 고시 당시 토지+건물 기준시가 합계 */
      sumAtFirstDisclosure: number;
    }
  | {
      ok: false;
      /** 채워야 할 칸 라벨 */
      missing: string[];
      /** 칸은 찼으나 산식을 적용할 수 없는 사유 */
      blocked?: "not_eligible" | "same_sum";
    };

/** 입력 칸(`phd*` + 토지 면적)으로 §164⑦ 환산 개별주택가격을 계산한다. 값이 모자라거나 적용할 수 없으면 `ok:false` — **0 으로 대입하지 않는다**(자동 안분·침묵 fallback 금지). */
export function computeConvertedHousingPrice(asset: AssetForm, transferDate: string): ConvertedHousingPriceResult {
  const missing: string[] = [];
  const firstDate = asset.phdFirstDisclosureDate;
  const firstPrice = parseAmount(asset.phdFirstDisclosureHousingPrice);
  const area = parseFloat(asset.acquisitionArea) || 0;
  // 1990.8.30. 이전 취득 — 개별공시지가가 없어 §164④ 등급가액 환산이 가목 가액을 채운다(④·⑧과 같은 파생 함수)
  const landAtAcq =
    parseAmount(asset.phdLandPricePerSqmAtAcq) || (derivePre1990PlainHousePhdLandPricePerSqmAtAcq(asset, transferDate) ?? 0);
  const buildingAtAcq = parseAmount(asset.phdBuildingStdPriceAtAcq);
  const landAtFirst = parseAmount(asset.phdLandPricePerSqmAtFirst);
  const buildingAtFirst = parseAmount(asset.phdBuildingStdPriceAtFirst);

  if (!firstDate) missing.push("최초 고시일");
  if (!(firstPrice > 0)) missing.push("최초 고시 주택가격");
  if (!(area > 0)) missing.push("토지 면적(① 기본정보)");
  if (!(landAtAcq > 0)) missing.push("취득시 토지 단위 공시지가");
  if (!(buildingAtAcq > 0)) missing.push("취득시 건물 기준시가");
  if (!(landAtFirst > 0)) missing.push("최초공시일 토지 단위 공시지가");
  if (!(buildingAtFirst > 0)) missing.push("최초공시일 건물 기준시가");
  if (missing.length > 0) return { ok: false, missing };

  // §164⑦ 적용가능 게이트 — 취득 당시 이미 고시분이 있으면 3-시점 산식 대상이 아니다(⑧·PreHousingDisclosureSection 과 같은 단일 소스)
  if (!isPhdEligible(asset.acquisitionDate, firstDate)) return { ok: false, missing: [], blocked: "not_eligible" };

  const gain = calcPreHousingDisclosureGain(0, {
    firstDisclosureDate: toOptionalDate(firstDate) as Date,
    firstDisclosureHousingPrice: firstPrice,
    landArea: area,
    landPricePerSqmAtAcquisition: landAtAcq,
    buildingStdPriceAtAcquisition: buildingAtAcq,
    landPricePerSqmAtFirstDisclosure: landAtFirst,
    buildingStdPriceAtFirstDisclosure: buildingAtFirst,
    // 양도시 인자는 환산 개별주택가격(= 취득시 주택가격)에 쓰이지 않는다
    transferHousingPrice: 0,
    landPricePerSqmAtTransfer: 0,
    buildingStdPriceAtTransfer: 0,
  });

  // §164⑦ 산식 괄호 단서(§164⑧ 준용) — 두 합계가 같고 취득연도 다음 연도 말일 이전 최초 고시면 준용 산정이 필요한데 입력 칸이 없다.
  // 환산(PHD) 경로의 ⑧ 이 같은 조건을 차단한다(`transfer-tax-validate-acquisition.ts` A11) — 여기서도 값을 만들지 않는다.
  if (
    classifySameAdjustmentPeriod({
      standardPriceAtAcquisition: gain.sumAtAcquisition,
      standardPriceAtTransfer: gain.sumAtFirstDisclosure,
      acquisitionDate: toOptionalDate(asset.acquisitionDate) as Date,
      transferDate: toOptionalDate(firstDate) as Date,
    }) === "clause_1"
  )
    return { ok: false, missing: [], blocked: "same_sum" };

  return {
    ok: true,
    value: gain.estimatedHousingPriceAtAcquisition,
    firstDisclosureHousingPrice: firstPrice,
    sumAtAcquisition: gain.sumAtAcquisition,
    sumAtFirstDisclosure: gain.sumAtFirstDisclosure,
  };
}

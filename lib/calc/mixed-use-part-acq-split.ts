/**
 * 겸용주택 **별개 취득 파트 모델**(B1) — UI 어댑터 (⑤ 노출 · ④ 전송 · ⑧ 필수 · ⑥ 사이드바가 **같은 함수**를 부른다).
 *
 * 설계: `docs/02-design/features/mixed-use-separate-acq-per-part.ui.design.md` §2.1·§5.1.
 *
 * 판정 규칙은 엔진 leaf(`lib/tax-engine/mixed-use-part-acq.ts` — `mixedPartAcqNeeds`·`collectMixedPartAcqIssues`·
 * `isMixedExpenseDeclared`)에만 있다. 이 파일은 **폼 문자열 → leaf 인자 변환**만 한다 — 규칙을 다시 쓰지 않는다
 * (엔진·⑫ Zod·⑧이 같은 leaf라 UI 통과 ↔ 서버 차단 모순이 없다).
 *
 * ## 모델 전환 = 「날짜가 후보를 만들고, 토글이 모델을 고른다」
 *   후보 = 겸용 ∧ 매매 ∧ 「취득일 다름」 chip ON ∧ 두 날짜 입력 ∧ 서로 다름
 *   파트 모델 = 후보 ∧ `mixedAcqPerPartMode === true`
 * `mixedAcqPerPartMode`는 **`=== true`로만** 읽는다(접근부 가드 — 구 이력·stale 저장본의 undefined는 총액 모델).
 *
 * ⚠️ 이 파일의 파생은 전부 **읽기 전용**이다 — `useEffect → store` 미러링으로 쓰지 않는다(무한 루프 정책).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { areMixedAcqDatesSeparate } from "@/lib/tax-engine/mixed-use-acq-date";
import {
  isMixedExpenseDeclared,
  mixedPartAcqNeedsOf,
  type MixedPartAcqSource,
} from "@/lib/tax-engine/mixed-use-part-acq";
import type {
  MixedPartAcqNeeds,
  MixedSeparateAcquisition,
} from "@/lib/tax-engine/types/transfer-mixed-use-part-acq.types";
import { effectivePartAcqMode, separateAcqPartsSum, type PartAcqMode } from "./transfer-tax-split-acq-mode";

type PartAcqFields = Pick<
  AssetForm,
  | "assetKind"
  | "isMixedUseHouse"
  | "acquisitionCause"
  | "hasSeperateLandAcquisitionDate"
  | "landAcquisitionDate"
  | "acquisitionDate"
  | "mixedAcqPerPartMode"
  | "landAcqMode"
  | "buildingAcqMode"
  | "useEstimatedAcquisition"
  | "isAppraisalAcquisition"
  | "isSalesCaseAcquisition"
>;

/** 파트 모델 후보 — 겸용 ∧ 매매 ∧ 「취득일 다름」 chip ∧ 두 날짜 서로 다름. 토글 행의 노출 조건. */
export function isMixedUsePerPartCandidate(a: PartAcqFields): boolean {
  return (
    a.assetKind === "housing" &&
    a.isMixedUseHouse === true &&
    a.acquisitionCause === "purchase" &&
    a.hasSeperateLandAcquisitionDate === true &&
    areMixedAcqDatesSeparate(a.landAcquisitionDate, a.acquisitionDate)
  );
}

/** 파트 모델 — ⑤ 파트 블록 노출 · ④ `separateAcquisition` 전송 · ⑧ 파트 검증 · ⑥ 사이드바 파트 합계의 **단일 술어**. */
export function isMixedUsePerPartAcq(a: PartAcqFields): boolean {
  return isMixedUsePerPartCandidate(a) && a.mixedAcqPerPartMode === true;
}

/**
 * 파트별 유효 취득 모드 — `""`(미선택)이면 자산 전체 레거시 3플래그에서 파생(표시 폴백, store에 쓰지 않는다).
 * ⑤ 라디오 값 · ④ 전송 · ⑧ 검증 · ⑥ 합계가 이 함수 하나를 본다.
 */
export function mixedPartModes(a: PartAcqFields): { land: PartAcqMode; building: PartAcqMode } {
  return {
    land: effectivePartAcqMode(a.landAcqMode, a),
    building: effectivePartAcqMode(a.buildingAcqMode, a),
  };
}

/** 환산 파트가 있는가 — PHD(§164⑦)는 이 때만 의미가 있다(엔진 X-7). */
export function mixedAnyPartEstimated(a: PartAcqFields): boolean {
  const m = mixedPartModes(a);
  return m.land === "estimated" || m.building === "estimated";
}

/** 실거래가 파트가 있는가 — 주택분·상가분 실제 필요경비 카드의 노출 조건(엔진은 actual 파트만 경비를 가산한다). */
export function mixedAnyPartActual(a: PartAcqFields): boolean {
  const m = mixedPartModes(a);
  return m.land === "actual" || m.building === "actual";
}

/**
 * **PHD 실효값** — 파트 모델이면 `usePreHousingDisclosure ∧ 환산 파트 있음`, 총액 모델이면 저장값 그대로.
 *
 * 파트 모델에서 환산 파트가 없으면 PHD는 소비처가 없다(엔진 X-7이 막는다) — 저장값은 남기되(환산 복귀 시 복원)
 * ④는 보내지 않고 ⑤는 칸을 숨기고 ⑧은 요구하지 않는다. ⑤·④·⑧이 모두 이 함수를 본다.
 */
export function mixedUsePhdEffective(a: PartAcqFields & Pick<AssetForm, "usePreHousingDisclosure">): boolean {
  if (isMixedUsePerPartAcq(a)) return a.usePreHousingDisclosure === true && mixedAnyPartEstimated(a);
  return a.usePreHousingDisclosure === true;
}

/** S-2 — 건물 실거래가 파트 ∧ 「용도별 계약액이 구분돼 있음」 토글 ON. ⑤ 노출 · ④ 전송 · ⑧ 필수가 같은 술어. */
export function mixedBuildingContractActive(a: PartAcqFields & Pick<AssetForm, "mixedAcqBuildingContractSplit">): boolean {
  return isMixedUsePerPartAcq(a) && mixedPartModes(a).building === "actual" && a.mixedAcqBuildingContractSplit === true;
}

/** 건물 취득가액 총액 — 파트 모드가 실가·감정이면 `buildingAcquisitionPrice`, 매매사례면 `buildingSalesCaseValue`. */
function buildingTotalOf(a: PartAcqFields & Pick<AssetForm, "buildingAcquisitionPrice" | "buildingSalesCaseValue">): number {
  const m = mixedPartModes(a).building;
  if (m === "actual" || m === "appraisal") return parseAmount(a.buildingAcquisitionPrice);
  if (m === "salesCase") return parseAmount(a.buildingSalesCaseValue);
  return 0;
}

/**
 * 「상가건물 계약액 = 건물 취득가액 − 주택건물 계약액」 — **표시 전용** 도출(store에 쓰지 않는다).
 * 조건 불충족(토글 OFF·계약액 ≤ 0·총액 이상)이면 `null`.
 */
export function mixedBuildingContractCommercialDerived(
  a: PartAcqFields &
    Pick<AssetForm, "mixedAcqBuildingContractSplit" | "mixedAcqHousingBuildingContractPrice" | "buildingAcquisitionPrice" | "buildingSalesCaseValue">,
): number | null {
  if (!mixedBuildingContractActive(a)) return null;
  const total = buildingTotalOf(a);
  const contract = parseAmount(a.mixedAcqHousingBuildingContractPrice);
  if (!(contract > 0) || !(total > 0) || contract >= total) return null;
  return total - contract;
}

type SourceFields = PartAcqFields &
  Pick<
    AssetForm,
    | "landAcquisitionPrice"
    | "buildingAcquisitionPrice"
    | "landSalesCaseValue"
    | "buildingSalesCaseValue"
    | "mixedAcqBuildingContractSplit"
    | "mixedAcqHousingBuildingContractPrice"
    | "mixedHousingActualExpense"
    | "mixedCommercialActualExpense"
    | "capitalExpenditure"
    | "hasPartialUsageChange"
    | "partialChangeDirection"
    | "transferCause"
    | "usePreHousingDisclosure"
    | "phdBuildingStdPriceAtAcq"
  >;

type Share = (v: number | undefined) => number | undefined;
const identityShare: Share = (v) => v;

/**
 * ④ `mixedUse.separateAcquisition` 조립 — **활성 모드의 값만** 싣는다(stale 차단). 절대금액 5종은 `share()`로 지분 스케일.
 * 파트 모델이 아니면 `undefined`(키 자체를 보내지 않는다 — trigger = 객체 존재).
 */
export function buildMixedSeparateAcquisition(a: SourceFields, share: Share = identityShare): MixedSeparateAcquisition | undefined {
  if (!isMixedUsePerPartAcq(a)) return undefined;
  const m = mixedPartModes(a);
  const sep: MixedSeparateAcquisition = { landMode: m.land, buildingMode: m.building };
  const pos = (s: string | undefined): number | undefined => {
    const n = parseAmount(s ?? "");
    return n > 0 ? share(n) : undefined;
  };
  if (m.land === "actual" || m.land === "appraisal") {
    const v = pos(a.landAcquisitionPrice);
    if (v !== undefined) sep.landAcquisitionPrice = v;
  } else if (m.land === "salesCase") {
    const v = pos(a.landSalesCaseValue);
    if (v !== undefined) sep.landSalesCaseValue = v;
  }
  if (m.building === "actual" || m.building === "appraisal") {
    const v = pos(a.buildingAcquisitionPrice);
    if (v !== undefined) sep.buildingAcquisitionPrice = v;
  } else if (m.building === "salesCase") {
    const v = pos(a.buildingSalesCaseValue);
    if (v !== undefined) sep.buildingSalesCaseValue = v;
  }
  if (mixedBuildingContractActive(a)) {
    const v = pos(a.mixedAcqHousingBuildingContractPrice);
    if (v !== undefined) sep.housingBuildingContractPrice = v;
  }
  return sep;
}

/**
 * 엔진 leaf(`mixedPartAcqNeedsOf`·`collectMixedPartAcqIssues`)에 넘기는 **엔진 입력 형태** — ④가 실제로 싣는 값과 같은 파생이다.
 *
 *  · U-2: 파트 모델 ∧ 매매이면 실비 카드(`mixedHousingActualExpense`·`mixedCommercialActualExpense`)가 엔진의
 *    `housingInheritedExpense`·`commercialInheritedExpense`다. 실가 파트가 없으면 카드가 숨으므로 싣지 않는다.
 *  · U-4: 총액 플래그(`useActualAcquisition`·`useAppraisalSalesAcquisition`·`acquisitionActualTotalPrice`)는 싣지 않는다.
 *  · PHD는 **실효값**(환산 파트 있을 때만) — 건물 PHD 값은 S-2 나목 비율의 나목이다(U-3: 건물 취득일 기준).
 *
 * 파트 모델이 아니면 `undefined`.
 */
export function mixedPartAcqSourceOf(a: SourceFields, share: Share = identityShare): MixedPartAcqSource | undefined {
  const sep = buildMixedSeparateAcquisition(a, share);
  if (!sep) return undefined;
  const anyActual = mixedAnyPartActual(a);
  const pos = (s: string | undefined): number | undefined => {
    const n = parseAmount(s ?? "");
    return n > 0 ? share(n) : undefined;
  };
  const phd = mixedUsePhdEffective(a);
  return {
    separateAcquisition: sep,
    landAcquisitionDate: a.landAcquisitionDate || a.acquisitionDate,
    buildingAcquisitionDate: a.acquisitionDate,
    partialUsageChange:
      a.hasPartialUsageChange && a.partialChangeDirection ? { direction: a.partialChangeDirection } : undefined,
    transferCause: a.transferCause,
    usePreHousingDisclosure: phd,
    preHousingDisclosure: phd ? { buildingStdPriceAtAcquisition: parseAmount(a.phdBuildingStdPriceAtAcq) } : undefined,
    capitalExpenditure: pos(a.capitalExpenditure),
    housingInheritedExpense: anyActual ? pos(a.mixedHousingActualExpense) : undefined,
    commercialInheritedExpense: anyActual ? pos(a.mixedCommercialActualExpense) : undefined,
  };
}

/** `mixedPartAcqNeeds` — **취득시 H·B0·나목·상가 취득시 기준시가의 노출·필수·전송** 단일 술어. 파트 모델이 아니면 `undefined`(기존 술어 불변). */
export function mixedPartAcqNeedsOfForm(a: SourceFields): MixedPartAcqNeeds | undefined {
  const src = mixedPartAcqSourceOf(a);
  return src ? mixedPartAcqNeedsOf(src) : undefined;
}

/** 취득측 경비 선언 — H 필수 사유 문구(⑤ hint · ⑧ 메시지)를 켜는 같은 술어. U-1 정의(양도비 제외). */
export function mixedExpenseDeclaredOfForm(a: SourceFields): boolean {
  const src = mixedPartAcqSourceOf(a);
  return src ? isMixedExpenseDeclared(src) : false;
}

/**
 * 사이드바 취득가액 합계(⑥) — 파트 모델의 파트 값 합. **환산 파트가 있으면 `pending`**(결과 도착 후 엔진값 — 부분합 오독 방지).
 * `separateAcqPartsSum`을 쓰되 `selfOwns`는 `both`로 고정한다 — 겸용은 소유 분리 대상이 아니고(self-owns-scope) stale 값이 파트를 지우면 안 된다.
 */
export function mixedPartAcqSum(a: SourceFields): { sum: number; pending: boolean } {
  const m = mixedPartModes(a);
  return separateAcqPartsSum({
    selfOwns: "both",
    landAcqMode: m.land,
    buildingAcqMode: m.building,
    landAcquisitionPrice: a.landAcquisitionPrice,
    buildingAcquisitionPrice: a.buildingAcquisitionPrice,
    landSalesCaseValue: a.landSalesCaseValue,
    buildingSalesCaseValue: a.buildingSalesCaseValue,
  });
}

/**
 * 겸용 결과의 **표시 취득가액** — 결과 카드 어댑터·사이드바가 같은 값을 쓰는 단일 소스.
 *
 * B1 파트 모델은 실제로 차감되는 값(echo 4부분 합 — §97②2호 단서가 나목을 채택한 파트는 0)이다.
 * `estimatedAcquisitionPrice`는 단서 판정 **전** 합이라, 그것을 쓰면 단서 나목 채택 시
 * 「양도가액 − 취득가액 − 필요경비 = 양도차익」이 깨지고 사이드바만 다른 값을 말한다.
 * 총액 모델(echo 없음)은 종전 그대로 주택분 + 상가분 `estimatedAcquisitionPrice`.
 */
export function mixedUseDisplayedAcqPrice(b: MixedUseGainBreakdown): number {
  const sep = b.separateAcquisition;
  return sep
    ? Object.values(sep.parts).reduce((sum, x) => sum + x.acquisitionPrice, 0)
    : b.housingPart.estimatedAcquisitionPrice + b.commercialPart.estimatedAcquisitionPrice;
}

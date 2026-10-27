import { parseAmount } from "@/lib/calc/number-parse";
import { validateCarryoverHouseholdFact } from "./transfer-tax-validate-carryover-household";
import { isPhdEligible } from "./phd-eligibility";
import { isPhdApartment, phdAcqDisclosedPriceName, phdClause, phdDisclosedPriceName } from "./phd-housing-term";
import { carryoverEstimationModeSupported } from "./phd-toggle-scope";
import { carryoverPhdMode } from "./phd-toggle-scope";
import { validateSplitDirectInputs } from "./transfer-tax-validate-split";
import { isSplitValidationActive } from "./transfer-tax-validate-split";
import { validateSplitCarryoverParts } from "./transfer-tax-validate-split-carryover";
import { effectiveSelfOwns } from "./self-owns-scope";
import { effectiveCarryoverDonorSplit } from "./transfer-land-part-cause";
import { effectiveBuildingCarryoverMix } from "./transfer-land-part-cause";
import { fieldError } from "./transfer-tax-validate-field";
import { validateDonorBuilt } from "./transfer-tax-validate-donor-built";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

/**
 * ⑧ **이월과세(증여)** 취득 검증 — `validateAssetAcquisition`에서 분리했다(800줄 정책 — 파트 이월과세 분기를 더하면 한계를 넘는다).
 * 동작은 분리 전과 같다: `carryover_gift` 자산은 일반 취득 검증을 건너뛰고 이 함수의 결과(첫 오류 또는 null)로 끝난다.
 *
 * P2 C(증여자 토지·건물 취득일 상이)는 맨 앞에서 `validateSplitCarryoverInputs`로 가른다 — 자산 전체 1벌 입력 규칙(증여자 취득가액 1칸·환산)과
 * 요구 칸이 달라서 같은 분기에 섞으면 «화면에 없는 칸을 요구»하게 된다.
 * P4 B(건물만 이월과세 + 토지 매매)도 같은 이유로 맨 앞에서 분리 검증(`validateSplitDirectInputs` — 첫 줄 `validateLandPartCause`가 B 이월과세 칸을 건다)으로 보낸다.
 * 함께 양도 자산이어도 보낸다 — 그 자리는 leaf S0가 «토지는 다른 원인으로 취득» 토글로 막는다(④는 키를 싣지 않는다).
 */
export function validateCarryoverAsset(
  asset: AssetForm,
  label: string,
  formTransferDate: string | undefined,
  ctx: { isNonPrimaryAsset: boolean; form?: TransferFormData },
): string | null {
  if (effectiveCarryoverDonorSplit(asset, { isNonPrimary: ctx.isNonPrimaryAsset })) {
    // 파트 입력(화면 위→아래) → 양도가액 구분·양도시 기준시가·파트 자본적지출(축 A).
    return (
      validateSplitCarryoverParts(asset, label, formTransferDate, { hasCompanions: (ctx.form?.assets?.length ?? 0) > 1 }) ??
      validateSplitDirectInputs(asset, label, formTransferDate)
    );
  }
  if (effectiveBuildingCarryoverMix(asset))
    return validateSplitDirectInputs(asset, label, formTransferDate, { isNonPrimary: ctx.isNonPrimaryAsset, hasCompanions: (ctx.form?.assets?.length ?? 0) > 1 });
  const c = asset.carryover;

  // (a) 가업상속공제 최우선 차단 (§97조의2 ④)
  if (c?.exclusionDeclared?.isFamilyBusinessInheritedAsset === true) {
    return `${label}: 가업상속공제 적용 자산은 현재 버전에서 지원하지 않습니다. 세무사에게 수동 계산을 의뢰하세요 (소득세법 §97조의2 ④).`;
  }

  if (!c) return fieldError("carryover.giftRegistryDate", `${label}: 이월과세 증여 정보를 입력하세요.`);

  // (b) 필수 날짜 필드
  if (!c.giftRegistryDate) return fieldError("carryover.giftRegistryDate", `${label}: 증여 등기접수일을 입력하세요.`);
  if (!c.donorAcquisitionDate) return fieldError("carryover.donorAcquisitionDate", `${label}: 증여자 취득일을 입력하세요.`);

  // (b-2) 날짜 순서 — 증여자 취득 → 증여 등기 → 양도 (gift/inheritance 원인과 동일 수준 차단)
  if (c.donorAcquisitionDate >= c.giftRegistryDate)
    return fieldError("carryover.donorAcquisitionDate", `${label}: 증여자 취득일은 증여 등기접수일보다 이전이어야 합니다.`);
  if (formTransferDate && c.giftRegistryDate >= formTransferDate)
    return fieldError("carryover.giftRegistryDate", `${label}: 증여 등기접수일은 양도일보다 이전이어야 합니다.`);

  // (b-3a) §97조의2 ① 본문 — 대상은 **배우자·직계존비속뿐**이다.
  // 그 외 관계는 이월과세 자체가 성립하지 않으므로 취득원인을 바꿔야 한다.
  if (c.donorRelation === "other")
    return fieldError("acquisitionCause", `${label}: 이월과세는 배우자 또는 직계존비속으로부터 증여받은 경우에만 적용됩니다 (「소득세법」 제97조의2 제1항). 취득 원인을 "증여"로 변경하세요.`);

  // (b-3) §97조의2 ① 관계요건 — 사망을 선언했으면 관계가 있어야 판정이 갈린다.
  //
  // ⚠️ 관계를 **단독으로 필수화하지 않는다**. 구형 sessionStorage에는 이 필드가 없어
  //    필수화하면 기존 이월과세 입력이 전부 차단된다
  //    (memory `feedback_blocking_validation_full_e2e_regression`).
  //    사망 미선언이면 관계는 판정에 영향이 없다(`isCarryoverRelationExcluded`).
  if (c.donorDeceased && !c.donorRelation)
    return fieldError("carryover.donorRelation", `${label}: 증여자와의 관계를 선택하세요 (소득세법 §97조의2 ①).`);

  // (c) 비교과세 B 시나리오 취득가
  if (parseAmount(c.giftDateValuation) <= 0)
    return fieldError("carryover.giftDateValuation", `${label}: 증여 당시 평가액을 입력하세요.`);

  // (d) 취득가액 — 환산 미사용 시 직접 입력 필수. 부담부증여는 「당초 증여자」 블록이 받는다(⑤ 칸 없음 · ④ 미전송 · ⑫ 면제 — `validateBurdenedGiftAsset`이 요구).
  if (asset.transferType !== "burdened_gift" && !c.useEstimatedAcquisition && parseAmount(c.donorAcquisitionPrice) <= 0) {
    return fieldError("carryover.donorAcquisitionPrice", `${label}: 증여자 취득가액을 입력하세요. (환산취득가 사용 시 토글 켜기)`);
  }

  // (e) 환산 사용 시 모드 선택 필수 + 모드별 필수 필드 검증
  if (c.useEstimatedAcquisition) {
    // 환산 모드 미선택 차단
    if (!c.estimationMode) {
      return fieldError("carryover.estimationMode", `${label}: 환산 방식(일반 기준시가/개별주택가격 미공시/공동주택 최초고시 전)을 선택하세요.`);
    }

    // 함께 양도 자산(컴패니언)은 일반 기준시가 환산만 — ⑤ 옵션 노출·술어(`carryoverEstimationModeSupported`)와 같다. ④가 컴패니언에는 PHD 를 싣지 않아 통과시키면 취득가액 0(PR-0c).
    if (!carryoverEstimationModeSupported(asset.assetKind, c.estimationMode, { isNonPrimary: ctx.isNonPrimaryAsset }))
      return fieldError("carryover.estimationMode", `${label}: 함께 양도 자산의 이월과세는 「일반 기준시가 환산」만 지원합니다 — 환산 방식을 「일반 기준시가 환산」으로 선택하세요 (개별주택가격 미공시·공동주택 최초고시 전 방식은 함께 양도 자산의 계산에 반영되지 않습니다).`);

    if (c.estimationMode === "general") {
      // 일반 기준시가 환산 — donorStandardPrice* 2개 필수
      if (parseAmount(c.donorStandardPriceAtAcquisition) <= 0)
        return fieldError("carryover.donorStandardPriceAtAcquisition", `${label}: 취득시 기준시가를 입력하세요.`);
      if (parseAmount(c.donorStandardPriceAtTransfer) <= 0)
        return fieldError("carryover.donorStandardPriceAtTransfer", `${label}: 양도시 기준시가를 입력하세요.`);
    } else if (c.estimationMode === "phd") {
      // PHD §164⑦ — asset 수준 phdFirstDisclosureDate 등 필수
      if (!asset.phdFirstDisclosureDate) return fieldError("phdFirstDisclosureDate", `${label}: 최초 고시일을 입력하세요.`);
      // §164⑦ 게이트 — 이월과세는 증여자 취득가액 기준: 비교일 = 증여자 취득일
      if (!isPhdEligible(c.donorAcquisitionDate, asset.phdFirstDisclosureDate))
        return fieldError("phdFirstDisclosureDate", `${label}: 증여자 취득일(의제취득일 1985-01-01 반영)이 최초 고시일 이후입니다. 취득 당시 ${phdAcqDisclosedPriceName(isPhdApartment(asset))}이 고시되어 있으므로 3-시점 환산(${phdClause(isPhdApartment(asset))}) 대상이 아닙니다 — 일반 기준시가 환산을 선택하세요.`);
      if (parseAmount(asset.phdFirstDisclosureHousingPrice) <= 0)
        return fieldError("phdFirstDisclosureHousingPrice", `${label}: 최초 고시 ${phdDisclosedPriceName(isPhdApartment(asset))}을 입력하세요.`);
      const transferPrice =
        parseAmount(asset.phdTransferHousingPrice) || parseAmount(asset.standardPriceAtTransfer);
      if (transferPrice <= 0) return fieldError("phdTransferHousingPrice", `${label}: 양도시 ${phdDisclosedPriceName(isPhdApartment(asset))}을 입력하세요.`);
    } else if (c.estimationMode === "apd") {
      // APD — PHD와 동일 경로(preHousingDisclosure)를 사용하므로 같은 필드 검증
      if (!asset.phdFirstDisclosureDate) return fieldError("phdFirstDisclosureDate", `${label}: 최초 고시일(공동주택 최초공시일)을 입력하세요.`);
      // §164⑦ 게이트 — 비교일 = 증여자 취득일 (phd 모드와 동일)
      if (!isPhdEligible(c.donorAcquisitionDate, asset.phdFirstDisclosureDate))
        // APD는 공동주택 경로 — 처음 매겨진 가격이 국세청장 고시(§164⑥)일 수도 국토교통부장관 공시(§164⑦)일 수도 있다
        return fieldError("phdFirstDisclosureDate", `${label}: 증여자 취득일(의제취득일 1985-01-01 반영)이 최초 고시일 이후입니다. 취득 당시 ${phdAcqDisclosedPriceName(true)}이 고시되어 있으므로 3-시점 환산(${phdClause(true)}) 대상이 아닙니다 — 일반 기준시가 환산을 선택하세요.`);
      if (parseAmount(asset.phdFirstDisclosureHousingPrice) <= 0)
        return fieldError("phdFirstDisclosureHousingPrice", `${label}: 최초공시 공동주택가격을 입력하세요.`);
      const transferPrice =
        parseAmount(asset.phdTransferHousingPrice) || parseAmount(asset.standardPriceAtTransfer);
      if (transferPrice <= 0) return fieldError("phdTransferHousingPrice", `${label}: 양도시 공동주택가격을 입력하세요.`);
    }
  }

  // (e-2) 증여자 신축·증축 §114조의2 — 환산(일반 기준시가) 입력 다음 순서(화면 순서와 같다). 범위 밖 stale 은 요구하지 않는다.
  const donorBuiltErr = validateDonorBuilt(asset, label, formTransferDate, { isNonPrimaryAsset: ctx.isNonPrimaryAsset });
  if (donorBuiltErr) return donorBuiltErr;

  // (f) 음수 차단
  if (parseAmount(c.donorCapitalExpenditure) < 0)
    return fieldError("carryover.donorCapitalExpenditure", `${label}: 증여자 자본적지출은 음수일 수 없습니다.`);
  if (parseAmount(c.giftTaxAmount) < 0)
    return fieldError("carryover.giftTaxAmount", `${label}: 증여세 상당액은 음수일 수 없습니다.`);

  // (f-2) §164⑦ PHD·APD 환산 donor × 자본적지출 — 엔진은 시나리오 A를 3시점 분리 경로로 계산하는데, 그 경로는 파트 칸(`landDirectExpenses`·
  //   `buildingDirectExpenses`)만 읽고 자산 단위 자본적지출·증여자 자본적지출은 읽지 않는다(계획서 `carryover-phd-owner-split-residuals.plan.md` F1 — 사용자 결정
  //   「차단·안내」). 자동 안분은 하지 않는다. 증여자 자본적지출은 ④가 2024-01-01 전 양도면 보내지 않으므로(`transfer-tax-api-carryover.ts`) 같은 기준으로만 막는다.
  //   ⑫ `refinePrimaryAcquisitionInputs`와 같은 조건. 분리 검증이 도는 자산(소유자 분리 등)의 수증자 자본적지출은 아래 (h)가 파트 칸으로 보낸다(PHD 경로가 읽는다).
  if (carryoverPhdMode(asset) && asset.transferType !== "burdened_gift") {
    if ((formTransferDate ?? "") >= "2024-01-01" && parseAmount(c.donorCapitalExpenditure) > 0)
      return fieldError("carryover.donorCapitalExpenditure", `${label}: 개별주택가격 미공시(공동주택 최초고시 전) 환산으로 증여자 취득가액을 구하는 이월과세에서는 증여자 자본적지출을 계산에 반영하지 못합니다 — 3시점 환산은 토지분·건물분으로 나눠 계산하는데 자본적지출은 안분 대상이 아니라(소득세법 §100② 후문) 귀속 파트를 알아야 하고, 증여자 자본적지출은 파트로 나눠 받는 칸이 없습니다. 칸을 비우세요 (§97②2호 — 환산취득가액은 자본적지출·양도비와 비교해 큰 쪽을 필요경비로 합니다)`);
    if (!isSplitValidationActive(asset) && parseAmount(asset.capitalExpenditure) > 0)
      return fieldError("capitalExpenditure", `${label}: 개별주택가격 미공시(공동주택 최초고시 전) 환산으로 증여자 취득가액을 구하는 이월과세에서는 자산 전체 자본적지출을 계산에 반영하지 못합니다 — 3시점 환산은 토지분·건물분으로 나눠 계산하는데 자본적지출은 안분 대상이 아니라(소득세법 §100② 후문) 귀속 파트를 알아야 합니다. 칸을 비우세요 (§97②2호 — 환산취득가액은 자본적지출·양도비와 비교해 큰 쪽을 필요경비로 합니다)`);
  }

  // (g) 결정 #33·#34·#38-6 — 증여자와 계속 같은 세대인가(필수 사실 질문) — `validateCarryoverHouseholdFact` 참조.
  const householdErr = validateCarryoverHouseholdFact(asset, c, label);
  if (householdErr) return householdErr;

  // (h) 토지·건물 소유자 분리(`selfOwns≠both`) — 신축 분기·일반 취득 꼬리와 같은 분리 검증 전체.
  //     이월과세는 `NonPurchaseSplitInputsBlock`이 취득시 기준시가·양도시 기준시가를 받는 호스트인데(화면에 칸이 있다),
  //     종전엔 아래 `return null`이 그 규칙을 통째로 건너뛰어 ⑧ 통과 → ⑫ 400(`standardPricePerSqmAtAcquisition` 등 5필드)이었다.
  //     게이트는 ④ `isSplitPayloadActive`의 소유 축과 같은 술어(`effectiveSelfOwns`) — 분리가 아니면 `null`(회귀 0).
  //     첫 줄이 `validateLandPartCause`(엔진·⑫와 같은 leaf)이고 칸 순서는 취득시 → 양도시 → 파트별이다.
  if ((effectiveSelfOwns(asset) ?? "both") !== "both") {
    return validateSplitDirectInputs(asset, label, formTransferDate, { isNonPrimary: ctx.isNonPrimaryAsset });
  }

  // carryover_gift 검증 완료 — 일반 취득 검증 스킵
  return null;
}

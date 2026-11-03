/**
 * §155⑳1호·§154⑩ 거주주택 **자신의** 거주 2년·보유 2년 상태 — ⑧(`validateRentalHousingException`)과 ⑤ 카드
 * (`RentalHousingExceptionSection` 「거주주택 요건 충족 상태」)가 함께 쓰는 단일 leaf.
 *
 * 종전에는 카드가 Step4 거주 개월·보유 연수만 보고 ✓/✗를 그려, ⑧·엔진이 더하는 값(완공APT 분리 거주 · 증여·상속 전 동일세대 통산)과
 * 푸는 사유(상생임대 · §154① 단서)를 빠뜨렸다 — 엔진이 비과세로 끝낸 입력에도 「✗ 미충족 — 일반 양도소득세로 계산됩니다」를 띄웠다
 * (`docs/00-pm/rhe-e1-notice-and-card-verdict-mismatch.plan.md` B · 실측 M1·M2·M4). 판정 순서는 ⑧ 그대로다.
 */
import type { MergeRentalState } from "@/lib/calc/merge-rental-carveout-form";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { deriveResidencePeriodMonths } from "@/lib/stores/calc-wizard-asset-residence";
import { isPreLifetimeLimitRegime } from "@/lib/tax-engine/data/rental-155-20-era";
import { buildRedevelopmentPayload } from "./transfer-tax-api-redev";
import { landContributedOriginalApt } from "./redev-field-scope";
import { resolveAptResidenceMonths } from "@/lib/tax-engine/redevelopment-lthd";
import { calculateHoldingPeriod } from "@/lib/tax-engine/tax-utils";
import { RENTAL_RESIDENCE_PROVISO_REASONS } from "@/lib/tax-engine/legal-codes/transfer";
import { PHRP_154_10_HOLDING_PROVISO_REASONS } from "@/lib/tax-engine/legal-codes/transfer";
import { PHRP_154_10_RESIDENCE_PROVISO_REASONS } from "@/lib/tax-engine/legal-codes/transfer";
import { consolidateResidenceMonths } from "@/lib/tax-engine/one-house/residence-months";
import { giftHouseholdPriorResidenceMonths } from "@/lib/tax-engine/one-house/gift-household-basis";
import { calcGiftHouseholdBasis } from "./effective-regulated-at-acquisition";
import { buildSameHouseholdInheritancePayload } from "./transfer-tax-api-helpers";
import { isUsageConversionActive } from "@/lib/stores/calc-wizard-asset-usage-conversion";

export interface RentalResidenceRequirementFacts {
  /** §155의3① 상생임대주택 — ⑧과 같은 술어(`qualifiesWinWinRental`) 결과. 모르면 false. */
  winWinResidenceExempt?: boolean;
  /** 거주주택 취득 당시 조정대상지역(§154⑩ 종전규정 분기) — ⑧과 같은 실효값. */
  wasRegulatedAtAcquisition?: boolean;
  /** ④가 싣는 §154① 단서 사유(`effectiveProvisoReason`). */
  provisoReason?: string;
  /**
   * 그 사유의 **성립 범위** — 엔진과 같은 함수(`resolveExemptionProviso`)의 결과("both" 보유·거주 / "residence_only" 거주만 /
   * null 불성립). 넘기면(⑤ 카드) 성립한 범위만 푼다 — 사유를 고르기만 하고 성립하지 않으면 엔진은 과세하는데 카드가 ✓를 띄웠다
   * (리뷰 게이트 2026-11-03 재현: 1호 임차 거주 12개월). 넘기지 않으면(⑧) 종전처럼 사유만 본다.
   */
  provisoScope?: "both" | "residence_only" | null;
  /** 합가 × ⑳ 상대 쪽 임대(0061) 문항 상태. */
  mergeRental?: MergeRentalState;
}

export type RentalResidenceWaiver = "pre_regime_not_regulated" | "merge_waived" | "win_win" | "proviso";

export interface RentalResidenceRequirementStatus {
  isStandalone154_10: boolean;
  /** §154⑩ 단독 경로 + 2019.2.12 전 취득(종전규정) — §154① 원칙(조정 취득일 때만 일반 거주 2년). */
  preRegime154_10: boolean;
  /** 거주 2년을 무엇으로 세는가 — B(종전규정 아님)는 등록 이후 거주기간, 그 밖은 전체 거주 + 동일세대 통산. */
  residenceAxis: "post_registration" | "total";
  /** 본인 전체 거주 개월(완공APT는 재개발 카드 분리 입력 통산). B의 「등록 이후 > 전체」 모순 검사에 쓴다. */
  ownMonths: number;
  /** 증여·상속 전 동일세대 거주 통산 개월(`total` 축에서만 더한다). */
  priorMonths: number;
  /** 거주 축의 개월 — `post_registration`이면 등록 이후 거주, `total`이면 본인 + 통산. */
  residenceMonths: number;
  /** 거주 2년을 보지 않는 사유(있으면 충족). */
  residenceWaiver?: RentalResidenceWaiver;
  residenceMet: boolean;
  /** §154① 단서 사유가 보유 2년을 푼다(성립은 엔진 판정). */
  holdingWaivedByProviso: boolean;
  /** 취득일·양도일이 있으면 §95④ 보유기간. */
  holding?: { years: number; months: number; days: number };
  holdingMet: boolean;
}

/**
 * 완공APT의 §155⑳1호 거주 개월 — 엔진 번역(`translateRedevAptForHousingJudgment`)과 같은 leaf(`resolveAptResidenceMonths`)에
 * ④가 실제로 싣는 재개발 값(`buildRedevelopmentPayload`)을 넣는다. Step4 값만 보면 재개발 카드의 분리 입력(종전 12 + 신축 12)을
 * 0으로 읽어 엔진은 충족인데 ⑧만 막는다(계획서 redev-apt-rental-residence-155-20.plan.md §10 실측).
 * 토지 출자 원조합원의 세대원 건물 통산(#12)도 엔진처럼 더한다.
 */
function redevAptResidenceMonths(asset: AssetForm, step4Months: number): number {
  const p = buildRedevelopmentPayload(asset);
  const landContributed = landContributedOriginalApt(asset);
  return (
    resolveAptResidenceMonths({
      isSuccessorMember: p.isSuccessorMember === true || landContributed,
      successorGiftSameHousehold: p.isSuccessorMember === true ? p.successorGiftSameHousehold : undefined,
      priorHouseResidenceMonths: p.priorHouseResidenceMonths,
      newHouseResidenceMonths: p.newHouseResidenceMonths,
      residencePeriodMonths: step4Months,
    }) + (landContributed ? (p.householdBuilding?.residenceMonths ?? 0) : 0)
  );
}

/**
 * §155⑳1호 거주요건에 더하는 **증여·상속 전 동일세대 거주 개월** — 엔진 `resolveExemptionRequirementResidenceMonths`에서 본인 거주를 뺀 몫과 같다
 * (별건 ⑥ · 서면-2022-부동산-2643 · 서면-2016-부동산-3992). 판정식 사본을 만들지 않고 엔진 leaf에 ④와 같은 사실을 넣는다:
 * 상속은 `buildSameHouseholdInheritancePayload`(④ 단건)를 `consolidateResidenceMonths`에, 증여는 ④와 같은 basis(`calcGiftHouseholdBasis`)를
 * `giftHouseholdPriorResidenceMonths`에. 용도변경 주택은 엔진이 상속 통산을 하지 않는다(`resolveExemptionResidenceMonths`) — 같은 게이트.
 * 입력된 개월만 통산한다(미답 = 0 — 사용자 결정 2026-10-19 Q-2). §155⑳은 첫 자산만 선언한다(`canDeclareRentalHousingException`).
 */
function rentalResidencePriorHouseholdMonths(asset: AssetForm, assetIndex: number): number {
  const inheritance = isUsageConversionActive(asset)
    ? 0
    : consolidateResidenceMonths(0, { acquisitionCause: asset.acquisitionCause, ...buildSameHouseholdInheritancePayload(asset) });
  return inheritance + giftHouseholdPriorResidenceMonths(calcGiftHouseholdBasis(asset, { isPrimary: assetIndex === 0 }));
}

export function rentalResidenceRequirementStatus(
  rh: AssetForm["rentalHousingException"],
  asset: AssetForm,
  assetIndex: number,
  transferDate: string | undefined,
  facts: RentalResidenceRequirementFacts = {},
): RentalResidenceRequirementStatus {
  const { winWinResidenceExempt = false, wasRegulatedAtAcquisition = false, provisoReason, provisoScope, mergeRental } = facts;
  const scopeWaives = (needs: "both" | "any") =>
    provisoScope === undefined || (needs === "both" ? provisoScope === "both" : provisoScope !== null);
  const isStandalone154_10 = rh.scenario === "B" && rh.rentalUnits.length === 0;
  /**
   * §154⑩ 표준 경로(I-5)의 취득 시기별 분기 — `isPreLifetimeLimitRegime`가 단일 소스(엔진
   * `checkPhrp154_10Eligibility`와 같은 leaf). 2019.2.12 전 취득(「종전규정」)이면 §155⑳1호
   * 괄호를 쓰지 않고 §154① 원칙(조정대상지역 취득 시에만 거주 2년, 일반 거주기간)을 쓴다.
   */
  const acq = asset.acquisitionDate ? new Date(asset.acquisitionDate) : undefined;
  const preRegime154_10 =
    isStandalone154_10 && acq && !Number.isNaN(acq.getTime())
      ? isPreLifetimeLimitRegime(acq, rh.residenceTransitionUnderAddendum === true, rh.residenceTransitionBasis)
      : false;

  // interval 모드는 residencePeriodMonthsAsset(raw)를 sync하지 않으므로 도출값 사용 — 엔진 deriveResidencePeriodMonths와 동일 소스.
  const step4Months = deriveResidencePeriodMonths(asset, transferDate ?? "", "") || 0;
  // 완공APT는 엔진이 재개발 카드의 분리 입력(종전·신축 거주 통산 — 부동산납세과-827)으로 센다 — 같은 leaf로 맞춘다.
  const ownMonths = asset.assetKind === "redevelopment_apt" ? redevAptResidenceMonths(asset, step4Months) : step4Months;
  // 별건 ⑥ — 거주요건(2년)은 증여·상속 전 동일세대 거주를 통산한 값으로 본다(엔진 `judgeRentalHousingEligibility`와 같은 leaf).
  const priorMonths = rentalResidencePriorHouseholdMonths(asset, assetIndex);

  const residenceAxis = rh.scenario === "B" && !preRegime154_10 ? "post_registration" : "total";
  // OH-15 — B의 §155⑳1호 거주요건은 등록 이후 거주기간이다(본인 전체 거주와 비교하므로 통산값을 쓰지 않는다).
  const residenceMonths =
    residenceAxis === "post_registration" ? parseInt(rh.postRegistrationResidenceMonths ?? "", 10) || 0 : ownMonths + priorMonths;

  // §154⑩ 단독 경로 — §154⑩이 「제1항을 적용」하므로 §154① 단서 사유가 종전규정 거주(1호~5호)·보유(1호~3호)를 푼다(V-R3 (a)).
  const residenceWaivedByProviso =
    isStandalone154_10 && !!provisoReason && PHRP_154_10_RESIDENCE_PROVISO_REASONS.has(provisoReason) && scopeWaives("any");
  let residenceWaiver: RentalResidenceWaiver | undefined;
  if (preRegime154_10) {
    if (!wasRegulatedAtAcquisition) residenceWaiver = "pre_regime_not_regulated";
    else if (winWinResidenceExempt) residenceWaiver = "win_win";
    else if (residenceWaivedByProviso) residenceWaiver = "proviso";
  } else if (residenceAxis === "post_registration") {
    if (winWinResidenceExempt) residenceWaiver = "win_win";
  } else if (mergeRental === "waived") residenceWaiver = "merge_waived";
  else if (winWinResidenceExempt) residenceWaiver = "win_win";

  // 보유 2년 — §154⑩ 표준 경로도 포함(재기산하지 않는다). 엔진과 같은 함수(§154⑤ → 법 §95④ 초일 산입).
  const holdingWaivedByProviso =
    !!provisoReason &&
    (isStandalone154_10 ? PHRP_154_10_HOLDING_PROVISO_REASONS : RENTAL_RESIDENCE_PROVISO_REASONS).has(provisoReason) &&
    scopeWaives("both");
  const trn = transferDate ? new Date(transferDate) : undefined;
  const holding =
    acq && trn && Number.isFinite(acq.getTime()) && Number.isFinite(trn.getTime()) ? calculateHoldingPeriod(acq, trn) : undefined;

  return {
    isStandalone154_10,
    preRegime154_10,
    residenceAxis,
    ownMonths,
    priorMonths,
    residenceMonths,
    residenceWaiver,
    residenceMet: residenceWaiver !== undefined || residenceMonths >= 24,
    holdingWaivedByProviso,
    holding: holding && { years: holding.years, months: holding.months, days: holding.days },
    holdingMet: holdingWaivedByProviso || (holding !== undefined && holding.years >= 2),
  };
}

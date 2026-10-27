/**
 * 부담부증여(burdened gift) API 변환 헬퍼.
 *
 * AssetForm의 bg* 필드 + propertyType별 기준시가 필드 → 엔진 BurdenedGiftInfo로 변환.
 * 14개 동기화 지점 ⑬ — callTransferTaxAPI body spread (TypeScript 미감지 영역).
 *
 * Phase 2 (2026-05-12): assetKind 분기로 housing·land·building·general_building 4종 지원.
 * 근거: 디자인 문서 `transfer-tax-burdened-gift-phase2.engine.design.md` Step 2.5.
 */

// ⚠️ `transfer-tax-api-helpers`가 이 파일을 import하므로 **원 위치에서 직접** 가져온다
//    (helpers 경유 re-export를 쓰면 순환 import가 된다).
import { bgHouseSplitInfoPatch, bgHouseSplitMode } from "./bg-house-split";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { safeMultiplyThenDivide } from "@/lib/tax-engine/tax-utils";
import { scaleBurdenedGiftInfo } from "@/lib/tax-engine/burdened-gift-valuation";
import { computeSangjeungbeopValuation } from "@/lib/tax-engine/burdened-gift-valuation";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { parseAmount } from "@/lib/calc/number-parse";
import {
  deriveMemberRightsValue,
  deriveRightValuationTotal,
} from "./burdened-gift-right-valuation";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { bgPresumedInputKind, isBgPresumedMethod } from "./burdened-gift-presumed-acquisition";
import { selfBuiltActive } from "./self-built-scope";
import { buildDonorBuiltBgExtensionAppraisal, buildDonorBuiltBgPayload, type BgDonorBuiltPayload } from "./transfer-tax-api-donor-built-bg";
import {
  isMixedBurdenedGift,
  isMixedBgDeemedPath,
  mixedAcqStdTotal,
  mixedBgDebtAttribution,
  mixedBgHousingAppraisal,
  mixedTransferStdTotal,
} from "./burdened-gift-mixed-use-scope";
import { isBgPreDeemedAsset } from "./bg-pre-deemed";
import { effectiveGbLandPriceAtAcq } from "./transfer-pre1990-gb-bridge";
import { gbBgMarketPreDeemedParts } from "./gb-pre-deemed";
import { bgAnyCarryover, bgCarryoverPartsPayload } from "./bg-carryover-parts";
import { gbBgGiftValuationByPart } from "./gb-bg-gift-tax-return";
import { gbBgGiftTaxedValueByPart } from "./gb-bg-gift-tax-return";
import { gbBgSplitsGiftValuation } from "./gb-bg-gift-tax-return";
import { isBgSuccessorRight } from "./transfer-successor-right";
import { successorRightAcquisitionTotal } from "./transfer-successor-right";

export interface BurdenedGiftInfoPayload {
  valuationMode: "sangjeungbeop_standard" | "sangjeungbeop_market";
  lendingDepositTotal: number;
  mortgageDebtAmount: number;
  /**
   * 신고(증여계약) 단위 B를 자산가액 비율로 재배분한 이 카드의 채무액 —
   * 컴패니언(다른 물건) 함께 부담부증여 전용. 산정은 `apportionCompanionBurdenedGiftDebt`.
   */
  assumedDebtOverride?: number;
  annualRentTotal: number;
  mortgageSetAmount?: number;
  marketValueAtTransfer?: number;
  /** 시가 평가의 토지분·건물분 평가액 — 주택·건물 토지·건물 취득일 다름에서만(`bgHouseSplitActive`). */
  marketValueByPart?: { land: number; building: number };
  marketValueAtAcquisition?: number;
  /** [신설] 취득가액 산정방식 (K-4 실지·K-5 환산·K-6 매매사례가액·K-7 감정가액, 시가 모드). */
  acquisitionMethod?: "actual" | "converted" | "salesCase" | "appraisal";
  /** [신설] K-4 실지취득가액 — 토지. */
  actualLandAcquisitionPrice?: number;
  /** [신설] K-4 실지취득가액 — 건물. */
  actualBuildingAcquisitionPrice?: number;
  /** [신설] K-4 실지취득가액 — 단일자산. */
  actualAcquisitionTotal?: number;
  /** K-6 매매사례가액·K-7 감정가액(취득 당시) — 토지. 두 방식이 칸을 공유한다. */
  presumedLandAcquisitionPrice?: number;
  /** K-6/K-7 — 건물. */
  presumedBuildingAcquisitionPrice?: number;
  /** K-6/K-7 — 단일자산 총액. */
  presumedAcquisitionTotal?: number;
  /** K-7 × 증축 5년 이내 — 증축한 부분의 감정가액(§114조의2① 가산세 base, 물건 전체 기준·채무 안분 전). */
  presumedExtensionAppraisalValue?: number;
  /** 증여재산 평가용 양도시 건물 기준시가 (상증법 §61 — 층별 가감율 적용). */
  giftBuildingStdPriceAtTransfer?: number;
  /**
   * 조합원입주권 평가 명세 (상증법 §61③ · 상증령 §51② · 상증칙 §16③).
   * 평가액 **총액**은 `buildingStdPriceAtTransfer`가 담는다 — 이 객체는 구성 내역이다.
   */
  rightValuation?: {
    memberRightsValue: number;
    paidInstallments: number;
    premium: number;
  };
  // Phase 3: 증여세 통합 입력
  donorRelation?:
    | "spouse"
    | "lineal_ascendant_adult"
    | "lineal_ascendant_minor"
    | "lineal_descendant"
    | "other_relative";
  isMinorDonee?: boolean;
  isGenerationSkip?: boolean;
  isFiledOnTime?: boolean;
  priorGiftsWithin10Years?: Array<{
    giftDate: string;
    giftAmount: number;
    giftTaxPaid: number;
    computedTax?: number;
    giftTaxBase?: number;
  }>;
  /** 양도시 토지 기준시가 (housing·building 시 0, 합산은 land+building) */
  landStdPriceAtTransfer: number;
  /** 양도시 건물 기준시가. housing 시 주택 단일 공시가격 통째로. land 시 0. */
  buildingStdPriceAtTransfer: number;
  /** 취득시 토지 기준시가 (A 산정용 — §159①1호 괄호 단서 기준시가 모드) */
  landStdPriceAtAcquisition: number;
  /** 취득시 건물 기준시가. housing 시 주택 단일 공시가격 통째로. land 시 0. */
  buildingStdPriceAtAcquisition: number;
  /**
   * ⑫ 겸용주택 × 부담부증여 전용 — 인수 채무의 주택/상가 귀속(국세청 부동산거래관리과-119). 겸용이 아니면 키 자체를 싣지 않는다
   * (비겸용에 실리면 ⑫ `refineMixedUseBurdenedGift`가 거부한다). 귀속 입력이 덜 끝났으면 undefined — 엔진 MB-13이 막는다(기본값 없음).
   */
  debtAttribution?: { housing: number; commercial: number; unallocated: number };
  /** ⑫ 겸용 × 시가 모드 전용 — 구분 감정평가 유무 선언(부가가치세법 시행령 §64①1호 단서, G-13). 미선언이면 undefined(MB-17). */
  housingAppraisal?: { exists: boolean; housingValue?: number };
  /**
   * 이월과세(§97의2①1호) — **당초 증여자** 취득 당시 값 한 벌. 위 필드들은 **양도인** 기준이다.
   * 이월과세 취득원인이 아니면 undefined.
   */
  carryoverDonorBasis?: {
    landStdPriceAtAcquisition?: number;
    buildingStdPriceAtAcquisition?: number;
    actualLandAcquisitionPrice?: number;
    actualBuildingAcquisitionPrice?: number;
    actualAcquisitionTotal?: number;
    marketValueAtAcquisition?: number;
    /** K-6/K-7 × 이월과세 — 당초 증여자의 취득 당시 매매사례가액·감정가액. */
    presumedLandAcquisitionPrice?: number;
    presumedBuildingAcquisitionPrice?: number;
    presumedAcquisitionTotal?: number;
    /** 당초 증여자가 신축·증축한 건물(§114조의2 가산세, PR-4) — 토글 ON + K-5/K-7 일 때만 */
    donorBuilt?: BgDonorBuiltPayload;
    /** 증여받은 파트 — 일반건물 분리 ON만(미전송 = 둘 다 · `bgCarryoverPartsPayload`). 엔진은 이 파트에만 당초 증여자 값을 쓴다. */
    parts?: { land: boolean; building: boolean };
    /** 둘 다 이월과세 — 토지분·건물분 증여세 과세가액(평가액 − 인수채무 · 증여세 상당액 배분 비율 · `gbBgGiftTaxedValueByPart`). 평가액이 둘 다 차고 합이 양수일 때만 싣는다. */
    giftValuationByPart?: { land: number; building: number };
    /** 둘 다 이월과세 — 당초 증여자의 건물 취득일(시나리오 A 건물 기산일 · 계획서 `gb-bg-donor-building-acquisition-date.plan.md` Q-1 a). 분리 ON 건물 블록 · 분리 OFF 건물분 칸이 같은 키다. */
    buildingDonorAcquisitionDate?: string;
  };
}

/**
 * 「당초 증여자」 취득 당시 값 한 벌을 폼에서 뽑는다 (D-7b).
 *
 * 빈 문자열은 `undefined`로 떨어뜨린다 — **0과 미입력은 다르다**. 건물이 없는 토지 자산은
 * 사용자가 `0`을 명시해야 하고, 그때는 `parseAmount`가 0을 돌려주므로 `undefined`가 아니다.
 * (`?? undefined`가 아니라 빈 문자열 검사인 이유 — `parseAmount("") || undefined`로 쓰면
 *  사용자가 입력한 **0이 미입력으로 둔갑**한다.)
 */
function buildCarryoverDonorBasis(
  primary: AssetForm,
): BurdenedGiftInfoPayload["carryoverDonorBasis"] {
  const raw = gbBgGiftValuationByPart(primary);
  // 비율 = 영 §163의2②2호 자산별 증여세 과세가액(평가액 − 당초 증여 때 인수한 채무 · `carryover-gift-tax-numerator-net.plan.md` §4.2). 한 파트가 채무로 0이면 그 파트 몫도 0이다.
  const byPart = raw && raw.land > 0 && raw.building > 0 ? gbBgGiftTaxedValueByPart(primary) : undefined;
  // 비율에만 쓰므로 지분 축소 전 값 그대로다. 평가액 한쪽이라도 비면 싣지 않는다 — ⑧이 막고, 직접 호출은 엔진이 양도가액 비율로 나눈다.
  // 당초 증여자의 건물 취득일 — 둘 다 이월과세일 때만. 비면 싣지 않는다(⑧이 막는다 · 토지 날짜로 채우지 않는다).
  // 주택·건물 이월과세 토글 C(당초 증여자가 토지·건물을 다른 날 취득)도 같은 키다(설계서 `bg-house-building-split.design.md` §5.2).
  const houseSplitC = bgHouseSplitMode(primary) === "carryover";
  const buildingDonorDate = gbBgSplitsGiftValuation(primary) || houseSplitC ? primary.buildingCarryover?.donorAcquisitionDate : undefined;
  const basis = {
    ...buildBothPartsDonorBasis(primary),
    ...(byPart && byPart.land + byPart.building > 0 ? { giftValuationByPart: byPart } : {}),
    ...(buildingDonorDate ? { buildingDonorAcquisitionDate: buildingDonorDate } : {}),
  };
  // 주택·건물 토글 C — 당초 증여자 실지취득가액도 토지·건물 두 칸이 정본이다(총액 칸 미전송). 토글이 꺼져 있으면 파트 칸의 남은 값을 싣지 않는다.
  if (primary.assetKind === "housing" || primary.assetKind === "building")
    return houseSplitC
      ? { ...basis, actualAcquisitionTotal: undefined }
      : { ...basis, actualLandAcquisitionPrice: undefined, actualBuildingAcquisitionPrice: undefined };
  const parts = bgCarryoverPartsPayload(primary);
  if (!parts) return basis;
  if (parts.land && parts.building) return { ...basis, parts };
  /**
   * 한 파트만 증여받았다(계획서 `gb-bg-part-carryover-calc.plan.md` §4.4) — 증여받지 않은 파트의 당초 증여자 칸은 화면에 없다(⑤).
   * 남은 값을 싣지 않는다. 총액 칸(K-4 총액·legacy 시가·K-6/K-7 총액)도 일반건물 화면에는 없다 — 엔진은 한 파트만이면 총액을 거부한다(Q-4).
   */
  return {
    ...basis,
    ...(parts.land ? {} : { landStdPriceAtAcquisition: undefined, actualLandAcquisitionPrice: undefined, presumedLandAcquisitionPrice: undefined }),
    ...(parts.building ? {} : { buildingStdPriceAtAcquisition: undefined, actualBuildingAcquisitionPrice: undefined, presumedBuildingAcquisitionPrice: undefined }),
    actualAcquisitionTotal: undefined,
    presumedAcquisitionTotal: undefined,
    marketValueAtAcquisition: undefined,
    parts,
  };
}

/** 토지·건물 두 파트의 당초 증여자 값 — 증여받은 파트로 거르기 전. */
function buildBothPartsDonorBasis(
  primary: AssetForm,
): NonNullable<BurdenedGiftInfoPayload["carryoverDonorBasis"]> {
  const num = (v: string | undefined) =>
    v !== undefined && v !== "" ? parseAmount(v) : undefined;
  return {
    landStdPriceAtAcquisition: num(primary.bgCoDonorLandStdPriceAtAcq),
    buildingStdPriceAtAcquisition: num(primary.bgCoDonorBuildingStdPriceAtAcq),
    actualLandAcquisitionPrice: num(primary.bgCoDonorActualAcquisitionLand),
    /**
     * 토지 자산에는 건물 부분이 없다 — 토지 칸이 입력되면 건물은 **0**(B1, 2026-09-30).
     * 화면에 건물 칸이 없어 비워 두면 엔진 게이트(`assertCarryoverDonorBasis` K-4 「분리 2칸 또는 총액」)가
     * 던진다. 위 토지 자산 기준시가 변환(`buildingStdPriceAt*: 0`)과 같은 사실을 싣는 것이지 fallback이 아니다.
     */
    actualBuildingAcquisitionPrice:
      primary.assetKind === "land"
        ? num(primary.bgCoDonorActualAcquisitionLand) !== undefined
          ? 0
          : undefined
        : num(primary.bgCoDonorActualAcquisitionBuilding),
    actualAcquisitionTotal: num(primary.bgCoDonorActualAcquisitionTotal),
    marketValueAtAcquisition: num(primary.bgCoDonorMarketValueAtAcquisition),
    ...buildCoDonorPresumed(primary),
    // 당초 증여자 신축·증축(§114조의2, PR-4) — 토글 ON + 환산(K-5)·감정(K-7)일 때만. 양도인 본인 신축(`isSelfBuilt`)과 다른 축이다.
    ...(() => {
      const donorBuilt = buildDonorBuiltBgPayload(primary);
      return donorBuilt ? { donorBuilt } : {};
    })(),
  };
}

/**
 * 이월과세 × K-6/K-7 — **당초 증여자**의 매매사례가액·감정가액. 방식이 아니면 비운다.
 * 자산 종류의 입력 형태에 맞는 칸만 싣는다(양도인 쪽 `buildPresumedAcquisition`과 같은 `bgPresumedInputKind`) —
 * 엔진 STEP 4가 분리 칸이 하나라도 있으면 총액을 무시하므로 stale 칸이 새면 안 된다.
 */
function buildCoDonorPresumed(
  primary: AssetForm,
): Pick<
  NonNullable<BurdenedGiftInfoPayload["carryoverDonorBasis"]>,
  "presumedLandAcquisitionPrice" | "presumedBuildingAcquisitionPrice" | "presumedAcquisitionTotal"
> {
  if (!isBgPresumedMethod(primary.bgAcquisitionMethod)) return {};
  const num = (v: string | undefined) =>
    v !== undefined && v !== "" ? parseAmount(v) : undefined;
  switch (bgPresumedInputKind(primary)) {
    case "split":
      return {
        presumedLandAcquisitionPrice: num(primary.bgCoDonorPresumedAcquisitionLand),
        presumedBuildingAcquisitionPrice: num(primary.bgCoDonorPresumedAcquisitionBuilding),
      };
    case "land":
      return { presumedLandAcquisitionPrice: num(primary.bgCoDonorPresumedAcquisitionLand) };
    default:
      return { presumedAcquisitionTotal: num(primary.bgCoDonorPresumedAcquisitionTotal) };
  }
}

/**
 * K-7 × 증축 — 증축한 부분의 감정가액(§114조의2① 가산세 base). 감정가액이고 신축·증축 축이 살아 있는 **증축**일 때만 싣는다.
 * 이월과세는 싣지 않는다(양도인이 신축·증축한 자가 아니고 엔진이 그 조합을 막는다 — 계획서 §3). 빈 문자열은 undefined(0과 미입력은 다르다).
 */
function buildExtensionAppraisal(
  primary: AssetForm,
): Pick<BurdenedGiftInfoPayload, "presumedExtensionAppraisalValue"> {
  if (
    primary.bgAcquisitionMethod !== "appraisal" ||
    primary.acquisitionCause === "carryover_gift" ||
    !selfBuiltActive(primary) ||
    primary.buildingType !== "extension" ||
    !primary.bgPresumedExtensionAppraisal
  ) {
    return {};
  }
  return { presumedExtensionAppraisalValue: parseAmount(primary.bgPresumedExtensionAppraisal) };
}

/**
 * K-7 × **당초 증여자** 증축 — 증축한 부분의 감정가액(§114조의2① 가산세 base, PR-4). 양도인 본인 신축 축(`buildExtensionAppraisal`)과 상호배타다 —
 * 이월과세 취득원인에서는 `selfBuiltActive`가 꺼져 위 함수가 비고, 이쪽은 `donorBuiltBgActive`(= 이월과세 + 당초 증여자 신축 토글)일 때만 값을 싣는다.
 */
function donorBuiltExtensionAppraisal(primary: AssetForm): Pick<BurdenedGiftInfoPayload, "presumedExtensionAppraisalValue"> {
  const v = buildDonorBuiltBgExtensionAppraisal(primary);
  return v === undefined ? {} : { presumedExtensionAppraisalValue: v };
}

/**
 * K-4 실지취득가액 칸을 읽는 조합인가 — 실지 방식이거나, **이월과세 × K-6/K-7**(양도인 쪽 시나리오 B는
 * 증여받은 자산이라 증여일 상증법 평가액이 실지거래가액이다 — 소령 §163⑨).
 */
function usesActualAcquisitionFields(primary: AssetForm): boolean {
  return (
    primary.bgAcquisitionMethod === "actual" ||
    (primary.acquisitionCause === "carryover_gift" && isBgPresumedMethod(primary.bgAcquisitionMethod))
  );
}

/** K-6/K-7 금액 3칸 → payload. 방식이 아니면 전부 undefined. */
function buildPresumedAcquisition(
  primary: AssetForm,
): Pick<
  BurdenedGiftInfoPayload,
  "presumedLandAcquisitionPrice" | "presumedBuildingAcquisitionPrice" | "presumedAcquisitionTotal"
> {
  // 이월과세는 당초 증여자 값(`carryoverDonorBasis.presumed*`)만 쓴다 — 양도인 칸의 stale 값을 싣지 않는다.
  if (!isBgPresumedMethod(primary.bgAcquisitionMethod) || primary.acquisitionCause === "carryover_gift") return {};
  const num = (v: string | undefined) =>
    v !== undefined && v !== "" ? parseAmount(v) : undefined;
  switch (bgPresumedInputKind(primary)) {
    case "split":
      return {
        presumedLandAcquisitionPrice: num(primary.bgPresumedAcquisitionLand),
        presumedBuildingAcquisitionPrice: num(primary.bgPresumedAcquisitionBuilding),
      };
    case "land":
      return { presumedLandAcquisitionPrice: num(primary.bgPresumedAcquisitionLand) };
    default:
      return { presumedAcquisitionTotal: num(primary.bgPresumedAcquisitionTotal) };
  }
}

/**
 * Phase 2: assetKind 분기로 propertyType별 기준시가 도출.
 * - general_building: gb* 필드 (토지/건물 분리)
 * - housing/building: standardPriceAtTransfer / standardPriceAtAcq (단일 공시가격)
 * - land: standardPriceAtTransfer / standardPriceAtAcq 또는 개별공시지가×면적
 *
 * 호출 조건: primary.transferType === "burdened_gift" (acquisitionCause === "burdened_gift" 레거시도 normalize에서 이전됨)
 */
/**
 * 🔴 **축 B 전용** 채무 안분 비율 — 축 A와 **반대**다.
 *
 * `scaleBurdenedGiftInfo`(엔진)는 §159의 A·C(평가액·기준시가)만 줄이고 **B(채무)는 그대로** 둔다.
 * 축 A(공유 소유)에서는 그것이 옳다 — 공유자마다 **별개 증여계약**이라 인수채무는 **사실**이고
 * 사용자가 지분 인수분을 직접 입력한다.
 *
 * 그런데 **축 B(같은 물건 지분 분할 취득)** 는 갑 한 사람의 **하나의 증여계약**이고 tranche는
 * 세법상 계산 단위일 뿐이다. §159①1호의 **B/C(채무비율)는 물건 단위 하나**여야 하는데,
 * A만 줄이면 담보평가 항이 **절대금액**이라 C가 채무로 clamp돼 B/C가 1을 넘는다:
 *
 * | 카드 | A | C = max(보충적, 담보) | B | B/C |
 * |---|---|---|---|---|
 * | 60% | 6억 | max(6억, **6억**) | **6억** | **1.0** 🔴 (정답 0.6) |
 * | 40% | 4억 | max(4억, **6억**) | **6억** | **1.5** 🔴 |
 *
 * 실측: 미안분 시 결정세액 **187,374,000원**(정답 64,600,360의 **2.9배**).
 *
 * ⇒ 축 B에서는 채무·보증금·임대료·저당설정액도 **×지분율**로 안분한다. 이는
 *   **자동 안분 fallback이 아니다** — 「미입력을 추정」하는 것이 아니라 「하나의 값을 §159 산식이
 *   요구하는 계산 단위로 나누는 것」이다(`feedback_no_silent_apportion_fallback`이 막는 것은 전자).
 *
 * ⚠️ 같은 필드가 축에 따라 반대로 처리된다(`feedback_rename_same_name_two_axes`) —
 *    공통 헬퍼로 통합하지 말 것. 축 판정은 **호출부**가 넘긴다.
 *
 * @param debtScaleRatio 축 B일 때 지분율(0<r<1). 미전달·1.0이면 축 A/단독 — 완전 무변경.
 */
/**
 * `buildBurdenedGiftInfo`의 양도일 인자 — 일반건물만 넘긴다(1990.8.30. 전 토지 등급 환산값 · PR-7b-2 G-3). 겸용은 호출부마다 종전대로 둔다.
 * 엔진 §159는 info의 취득시 기준시가를 읽으므로 카드 info·물건 전체 info(표시 전용)가 같은 값이어야 한다.
 */
export const gbBgInfoTransferDate = (asset: AssetForm, transferDate: string | undefined): string | undefined =>
  asset.assetKind === "general_building" ? transferDate : undefined;

export function buildBurdenedGiftInfo(
  primary: AssetForm,
  debtScaleRatio?: number,
  /** 겸용·일반건물 취득시 기준시가의 1990.8.30. 이전 토지 환산 fallback에 쓰는 양도일(폼-전역). 그 밖의 자산은 쓰지 않는다. */
  transferDate?: string,
): BurdenedGiftInfoPayload {
  const scaleDebt =
    debtScaleRatio !== undefined && debtScaleRatio > 0 && debtScaleRatio < 1;
  /** 채무 성분 전용 — 평가액·기준시가에는 쓰지 않는다(엔진 `scaleBurdenedGiftInfo` 소관). */
  const d = (v: number): number => (scaleDebt ? applyRatio(v, debtScaleRatio!) : v);
  // 의제취득일 전 상속·증여 토지·주택·상가·건물 — §159①1호 A를 엔진이 STEP 0.45 결과(3자 max·의제취득일 기준시가)로 정한다(계획서
  // inheritance-pre-deemed-clause-b-revisit.plan.md §18). ⑤가 산정방식 라디오·방식별 금액 칸을 숨기므로 남은 값을 싣지 않는다.
  const preDeemed = isBgPreDeemedAsset(primary);
  const common = {
    valuationMode: (primary.bgValuationMode || "sangjeungbeop_standard") as
      | "sangjeungbeop_standard"
      | "sangjeungbeop_market",
    lendingDepositTotal: d(parseAmount(primary.bgLendingDepositTotal) || 0),
    mortgageDebtAmount: d(parseAmount(primary.bgMortgageDebtAmount) || 0),
    annualRentTotal: d(parseAmount(primary.bgAnnualRentTotal) || 0),
    mortgageSetAmount: primary.bgMortgageSetAmount
      ? d(parseAmount(primary.bgMortgageSetAmount))
      : undefined,
    marketValueAtTransfer: primary.bgMarketValueAtTransfer
      ? parseAmount(primary.bgMarketValueAtTransfer)
      : undefined,
    marketValueAtAcquisition: primary.bgMarketValueAtAcquisition
      ? parseAmount(primary.bgMarketValueAtAcquisition)
      : undefined,
    // K-4/K-5 취득가액 산정방식 (시가 모드). 미선택 시 undefined → 엔진 backward-compat.
    acquisitionMethod: preDeemed ? undefined : primary.bgAcquisitionMethod || undefined,
    actualLandAcquisitionPrice:
      !preDeemed && usesActualAcquisitionFields(primary) && primary.bgActualAcquisitionLand
        ? parseAmount(primary.bgActualAcquisitionLand) || undefined
        : undefined,
    actualBuildingAcquisitionPrice:
      !preDeemed && usesActualAcquisitionFields(primary) && primary.bgActualAcquisitionBuilding
        ? parseAmount(primary.bgActualAcquisitionBuilding) || undefined
        : undefined,
    actualAcquisitionTotal:
      !preDeemed && usesActualAcquisitionFields(primary) && primary.bgActualAcquisitionTotal
        ? parseAmount(primary.bgActualAcquisitionTotal) || undefined
        : undefined,
    /**
     * K-6 매매사례가액·K-7 감정가액 — 그 방식일 때만 싣는다(K-4와 같은 게이팅).
     * **자산 종류의 입력 형태에 맞는 칸만** 싣는다(⑤ 입력 블록·⑧ 「금액 필수」와 같은 `bgPresumedInputKind`):
     * 엔진 STEP 4가 분리 칸이 하나라도 있으면 총액을 무시하므로, 자산 종류를 바꾸고 남은 stale 칸이 새면 안 된다.
     * **0과 미입력은 다르다** — 빈 문자열만 undefined로 떨어뜨린다(`parseAmount("") || undefined`로 쓰면 입력한 0이 둔갑한다).
     */
    ...(preDeemed ? {} : buildPresumedAcquisition(primary)),
    ...buildExtensionAppraisal(primary),
    ...donorBuiltExtensionAppraisal(primary),
    // 증여재산 평가용 건물 기준시가 (층별 가감율 적용 — 미입력 시 양도세용 값 fallback)
    giftBuildingStdPriceAtTransfer: primary.bgGiftBuildingStdPriceAtTransfer
      ? parseAmount(primary.bgGiftBuildingStdPriceAtTransfer)
      : undefined,
    /**
     * 이월과세(§97의2①1호) — 「당초 증여자」 취득 당시 값 한 벌 (D-7b).
     *
     * 이월과세 취득원인일 때만 싣는다 — 일반건물은 토지·건물 중 한 파트라도(`bgAnyCarryover`). ❌ 값이 없다고 **양도인 값으로 대신하지 않는다** —
     * 시나리오 A = B가 되어 §97의2가 조용히 무력화된다(엔진 `assertCarryoverDonorBasis`가
     * fail-fast로 막고, ⑧ validate가 그 앞에서 사용자에게 알린다).
     */
    carryoverDonorBasis: bgAnyCarryover(primary) ? buildCarryoverDonorBasis(primary) : undefined,
    // Phase 3: 증여세 통합 입력 (빈 문자열·미선택 시 undefined로 → 엔진 default 사용)
    donorRelation: primary.bgDonorRelation ? primary.bgDonorRelation : undefined,
    isMinorDonee: primary.bgIsMinorDonee || undefined,
    isGenerationSkip: primary.bgIsGenerationSkip || undefined,
    isFiledOnTime: primary.bgIsFiledOnTime === false ? false : undefined,
    // Phase 3 후속: 10년 이내 사전증여 (giftDate·giftAmount 필수, giftTaxPaid 0 허용)
    priorGiftsWithin10Years:
      primary.bgPriorGifts && primary.bgPriorGifts.length > 0
        ? primary.bgPriorGifts
            .filter((p) => p.giftDate && parseAmount(p.giftAmount) > 0)
            .map((p) => ({
              giftDate: p.giftDate,
              giftAmount: parseAmount(p.giftAmount) || 0,
              giftTaxPaid: parseAmount(p.giftTaxPaid) || 0,
              // §58 Phase A — 당시 산출세액·과세표준 (미입력 시 undefined → §58 미적용, validate에서 강제)
              computedTax: parseAmount(p.computedTax) || undefined,
              giftTaxBase: parseAmount(p.giftTaxBase) || undefined,
            }))
        : undefined,
  };

  /**
   * ── 겸용주택 × 부담부증여 (설계 UI R2 §4·§6.2 · 엔진 R4 §3.5) ──
   *
   * 기준시가는 **합계**를 건물 슬롯에 싣는다(housing 관행). 엔진은 이 4필드를 계산에 쓰지 않고 `MixedUseAssetInput`에서 4부분을 재파생하되
   * **양도시 합**은 재파생 Σ와 대조한다(MB-12) — 합 계산은 표시·⑧과 같은 leaf(`mixedTransferStdTotal`)다.
   *
   * 🔴 엔진 ⑫는 아래 키가 **존재하면 거부**한다(MB-12, strip이 아니다): 분리 실지/추계(토지·건물), `carryoverDonorBasis`, `rightValuation`,
   *    `assumedDebtOverride`, `presumedExtensionAppraisalValue`, `giftBuildingStdPriceAtTransfer`. 자산 종류를 바꾸며 남은 stale 값이
   *    새면 HTTP 400이므로 **명시적으로 비운다**. 취득가액은 총액(`actualAcquisitionTotal`·`presumedAcquisitionTotal`)만 싣는다.
   */
  if (isMixedBurdenedGift(primary)) {
    const attr = mixedBgDebtAttribution(primary);
    const {
      actualLandAcquisitionPrice: _al, actualBuildingAcquisitionPrice: _ab,
      presumedLandAcquisitionPrice: _pl, presumedBuildingAcquisitionPrice: _pb,
      presumedExtensionAppraisalValue: _pe, giftBuildingStdPriceAtTransfer: _gb, carryoverDonorBasis: _cd,
      ...allowed
    } = common;
    void _al; void _ab; void _pl; void _pb; void _pe; void _gb; void _cd;
    return {
      ...allowed,
      // 증여자 상속·증여 취득(시가 평가) — 평가액이 취득가액이라 산정방식·총액이 없다(⑤가 라디오·총액 칸을 숨긴다 · 숨은 값 미전송 · PR-7b-7a).
      ...(isMixedBgDeemedPath(primary) ? { acquisitionMethod: undefined, actualAcquisitionTotal: undefined, presumedAcquisitionTotal: undefined } : {}),
      landStdPriceAtTransfer: 0,
      buildingStdPriceAtTransfer: mixedTransferStdTotal(primary).total,
      landStdPriceAtAcquisition: 0,
      buildingStdPriceAtAcquisition: mixedAcqStdTotal(primary, transferDate ?? "").total,
      ...(attr.issues.length === 0
        ? { debtAttribution: { housing: attr.housing, commercial: attr.commercial, unallocated: attr.unallocated } }
        : {}),
      ...(mixedBgHousingAppraisal(primary) ? { housingAppraisal: mixedBgHousingAppraisal(primary) } : {}),
    };
  }

  // ── general_building: 사례 34 패턴 (Phase 1 그대로) ──
  if (primary.assetKind === "general_building") {
    const landArea = parseFloat(primary.gbLandArea) || 0;
    const landStdAtTransfer = (parseAmount(primary.gbTransferLandPricePerSqm) || 0) * landArea;
    // 1990.8.30. 전 상속·증여 토지는 등급 환산값(⑤ display fallback·⑧과 같은 leaf · PR-7b-2 G-3). 엔진 §159는 이 info 값을 읽는다(route 인자가 아니다).
    const landStdAtAcquisition = effectiveGbLandPriceAtAcq(primary, transferDate ?? "") * landArea;
    // 의제취득일 전 상속·증여 파트(시가 평가) — §159가 그 파트만 3자 max를 한다(Q-28 · PR-7b-6). 두 파트 다면 산정방식이 없고(⑤가 라디오를 숨긴다 · ⑫ 면제),
    // 한 파트면 그 파트의 방식별 금액 칸이 숨는다 — 남은 값을 싣지 않는다(엔진은 그 파트에서 읽지 않지만 총액·분리 판정에 끼지 않게).
    const pre = gbBgMarketPreDeemedParts(primary);
    const gbPartOmit = {
      ...(pre.land && pre.building ? { acquisitionMethod: undefined } : {}),
      ...(pre.land ? { actualLandAcquisitionPrice: undefined, presumedLandAcquisitionPrice: undefined } : {}),
      ...(pre.building ? { actualBuildingAcquisitionPrice: undefined, presumedBuildingAcquisitionPrice: undefined } : {}),
    };
    return {
      ...common,
      ...gbPartOmit,
      landStdPriceAtTransfer: Math.floor(landStdAtTransfer),
      buildingStdPriceAtTransfer: parseAmount(primary.gbTransferBuildingValue) || 0,
      landStdPriceAtAcquisition: Math.floor(landStdAtAcquisition),
      buildingStdPriceAtAcquisition: parseAmount(primary.gbAcqBuildingValue) || 0,
    };
  }

  // ── land: 토지만 (개별공시지가 × 면적 또는 standardPriceAt*) ──
  if (primary.assetKind === "land") {
    // standardPriceAtTransfer 가 입력되어 있으면 우선 사용 (사용자 명시 입력)
    // 그 외 standardPricePerSqmAt* × 면적으로 자동 계산
    const transferArea = parseFloat(primary.transferArea) || 0;
    const acqArea = parseFloat(primary.acquisitionArea) || 0;
    const landStdAtTransfer =
      parseAmount(primary.standardPriceAtTransfer) ||
      (parseAmount(primary.standardPricePerSqmAtTransfer) || 0) * transferArea;
    const landStdAtAcquisition =
      parseAmount(primary.standardPriceAtAcq) ||
      (parseAmount(primary.standardPricePerSqmAtAcq) || 0) * acqArea;
    return {
      ...common,
      landStdPriceAtTransfer: Math.floor(landStdAtTransfer),
      buildingStdPriceAtTransfer: 0,
      landStdPriceAtAcquisition: Math.floor(landStdAtAcquisition),
      buildingStdPriceAtAcquisition: 0,
    };
  }

  /**
   * ── 조합원입주권: 상증법 §61③ 평가 (2026-09-08) ──
   *
   * 🔴 **평가액 총액을 `buildingStdPriceAtTransfer`에 싣는다** — 단일자산 3종 관행과 동일.
   *    `rightValuation`에만 넣고 std 4필드를 0으로 두면 엔진에서 세 값이 동시에 0이 된다:
   *      · `sangjeungbeopValuation.supplementary` = **양도가액 안분 분모** → `transferDenominator === 0`
   *        가드 발동 → 양도가액 land·building 모두 0 → **세액 0**(침묵)
   *      · `wholePropertySupplementary` = 12억 판정 분모
   *    `rightValuation`은 **구성 내역**(표시·자기일관 검증)이다.
   *
   * 취득가액은 **K-4 전용**이다 — §61③ 평가는 §159①1호 A괄호의 열거(§61①②⑤·§66)에 없어
   * 괄호가 발동하지 않고, §166①1호가 쓰는 취득가액이 「기존건물과 그 부수토지의 취득가액」
   * (= 종전 부동산 실지취득가액)이다. ⇒ 취득시 기준시가 2필드는 **0으로 보낸다**(쓰지 않는다).
   */
  if (primary.assetKind === "right_to_move_in") {
    const rightTotal = deriveRightValuationTotal(primary);
    return {
      ...common,
      landStdPriceAtTransfer: 0,
      buildingStdPriceAtTransfer: rightTotal,
      landStdPriceAtAcquisition: 0,
      buildingStdPriceAtAcquisition: 0,
      // D-2: K-4 고정. 시가 모드에서 사용자가 「환산」을 골라 뒀어도 입주권에는 그 경로가 없다.
      acquisitionMethod: "actual" as const,
      // 승계조합원은 승계 블록 2칸(승계취득가액 + 추가분담금)이 실지취득가액이다 — 「종전 부동산」 칸은 원조합원 전용(`isBgSuccessorRight`).
      actualAcquisitionTotal: isBgSuccessorRight(primary)
        ? successorRightAcquisitionTotal(primary)
        : parseAmount(primary.bgActualAcquisitionTotal) || 0,
      rightValuation: {
        memberRightsValue: deriveMemberRightsValue(primary),
        paidInstallments: parseAmount(primary.bgRightPaidInstallments) || 0,
        premium: parseAmount(primary.bgRightPremium) || 0,
      },
    };
  }

  // ── housing / building / commercial_building / redevelopment_apt: 단일 공시가격(주택공시가격·건물기준시가·호별고시가 통합) ──
  // 토지·건물 분리 없이 buildingStdPrice 자리에 통째로 넣어 엔진 sum에서 그대로 사용.
  // F-3 (2026-05-12): commercial_building도 단일 기준시가 fallback 패턴 적용.
  //   cb*·호별고시가는 환산취득가(useEstimatedAcquisition) 전용 — 부담부증여 모드에서는 사용자가
  //   standardPriceAtTransfer / standardPriceAtAcq에 상증법 §61 평가액 직접 입력.
  const single = {
    ...common,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: parseAmount(primary.standardPriceAtTransfer) || 0,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: parseAmount(primary.standardPriceAtAcq) || 0,
  };
  // 주택·건물 × 토지·건물 취득일 다름 — 파트 값으로 덮는다(같은 날이면 파트 칸의 남은 값을 비운다 · `bgHouseSplitInfoPatch`).
  return { ...single, ...bgHouseSplitInfoPatch(primary) };
}

// ============================================================
// 컴패니언(다른 물건) 함께 부담부증여 — 신고 단위 채무 재배분 (소령 §159①②)
// ============================================================

/** 자산별 상증법 평가액 Aᵢ와 그 승자. ⑧ 게이트와 ④가 **같은 leaf**를 쓴다. */
export interface CompanionBurdenedGiftValuation {
  /** Aᵢ — 상증법 §60~§66 Max 평가액 (지분 축소 후). */
  value: number;
  /** Max의 승자. `supplementary`가 아니면 ⑧이 차단한다 (아래 주석). */
  selectedMode: "supplementary" | "mortgage" | "rental";
}

/**
 * 자산별 Aᵢ 산정 — **엔진과 같은 함수**로 계산한다.
 *
 * `scaleBurdenedGiftInfo`(지분 축소) → `computeSangjeungbeopValuation`(Max)은 엔진
 * STEP 0.48이 타는 경로 그대로다. ④가 규칙을 다시 쓰면 두 소스가 갈라진다.
 *
 * 채무는 축소하지 않는다 — 축 A 규약상 사용자가 **지분 인수분**을 입력한다.
 */
export function companionBurdenedGiftValuations(
  infos: BurdenedGiftInfoPayload[],
  ratios: number[],
): CompanionBurdenedGiftValuation[] {
  return infos.map((info, i) => {
    const r = ratios[i];
    const scaled = scaleBurdenedGiftInfo(
      info as unknown as BurdenedGiftInfo,
      r !== undefined && r < 1 ? r : undefined,
    );
    const v = computeSangjeungbeopValuation(
      scaled.landStdPriceAtTransfer,
      scaled.buildingStdPriceAtTransfer,
      scaled,
    );
    return { value: v.max, selectedMode: v.selectedMode };
  });
}

/**
 * 컴패니언(다른 물건) 함께 부담부증여 — **신고 단위 채무 B를 자산가액 비율로 재배분**.
 *
 * ## 왜 재배분인가 (소령 §159 — KoreanLaw 실측 mst=286211)
 *
 * §159①은 `양도가액 = A × B/C`·`취득가액 = A × B/C`인데 **A만 자산별이고 B·C는
 * 증여계약 단위**다. 자산 간 배분은 A가 이미 수행한다. 그런데 엔진은 카드마다 §159를
 * 독립 계산하고 카드 안에서는 A = C이므로, 카드에 그 물건의 채무를 그대로 실으면
 *
 *     양도가액ᵢ = Aᵢ × Bᵢ/Cᵢ = Bᵢ
 *
 * 가 되어 **각 카드가 자기 채무 전액을 양도가액으로 잡는다**. 실측: 물건 2건에 총채무
 * 4억을 각각 전액 실었더니 차익 합계가 388,000,000 — 정본 194,000,000의 **정확히 2배**.
 *
 * ⇒ Bᵢ = B × Aᵢ/ΣA 를 실으면 `debtRatioᵢ = Bᵢ/Cᵢ = B/ΣA = B/C`로 **신고 단위 단일 비율이
 * 보존**된다. 실측 121,250,000 + 72,750,000 = 194,000,000 (단건 참조와 자산별로도 일치).
 *
 * §159②(과세대상·비과세 자산 동시 증여 시 `채무액 = 총채무 × 자산가액/총자산가액`)가
 * **자산가액 비율 안분**이 입법자가 채택한 규범임을 직접 확인해 준다.
 *
 * ⛔ **기각된 설계 재제안 금지** — 「담보채권액이 max인 자산은 안분에서 빼고 그 물건에
 *    귀속시킨다」. 그 자산만 Bⱼ/Cⱼ ≠ B/C가 되어 §159①의 단일 비율을 깬다. 근저당이
 *    물건별로 설정된다는 사실은 맞지만, §159②는 담보가 어디 붙었든 자산가액 비율로
 *    나눈다는 태도를 이미 취하고 있다.
 *
 * ## 절사
 *
 * `safeMultiplyThenDivide`로 정수 보존하고 **마지막 자산이 잔액을 흡수**한다
 * (`ΣBᵢ = B` 불변식 — 흡수하지 않으면 총채무가 몇 원 사라진다).
 *
 * @param infos  자산별 `buildBurdenedGiftInfo` 결과 (채무 미안분).
 * @param ratios 자산별 지분율 (`getOwnershipRatio` — 순환 import 회피로 호출측이 넘긴다).
 * @returns overrides[i] = Bᵢ. ΣA가 0이면 undefined(계산 불가 — 배분 근거가 없다).
 */
export function apportionCompanionBurdenedGiftDebt(
  infos: BurdenedGiftInfoPayload[],
  ratios: number[],
): number[] | undefined {
  const valuations = companionBurdenedGiftValuations(infos, ratios);
  const totalValuation = valuations.reduce((s, v) => s + v.value, 0);
  if (totalValuation <= 0) return undefined;
  const totalDebt = infos.reduce(
    (s, i) => s + i.lendingDepositTotal + i.mortgageDebtAmount,
    0,
  );
  const overrides = valuations.map((v) =>
    safeMultiplyThenDivide(totalDebt, v.value, totalValuation),
  );
  // 잔액 흡수 — 마지막 자산 전용.
  const allocated = overrides.slice(0, -1).reduce((s, v) => s + v, 0);
  overrides[overrides.length - 1] = totalDebt - allocated;
  return overrides;
}

/**
 * 컴패니언 함께 부담부증여 — **증여세 1회 산정용 합산 info**.
 *
 * 카드별 breakdown을 합치면 증여재산공제가 N번 차감되고 누진이 갈라진다
 * (축 B에서 −19,400,000원 실측). ⇒ M-0.5가 이 info로 §159를 **1회** 계산한다.
 *
 * 🔑 **성분 단순 합이 ΣAᵢ와 일치하려면 모든 자산의 승자가 `supplementary`여야 한다**
 *    (Σmax ≠ max(Σ성분)). 그 조건은 ⑧ `collectStepIssues`가 강제한다 —
 *    담보평가·임대평가가 max인 자산이 섞이면 **명시 차단**한다.
 *
 * 계약 단위 값(관계·미성년·세대생략·기한내신고·사전증여)은 **primary 것을 쓴다** —
 * 하나의 증여계약이므로 자산별로 다를 수 없다.
 */
export function buildCompanionBurdenedGiftWholeInfo(
  infos: BurdenedGiftInfoPayload[],
  ratios: number[],
): BurdenedGiftInfoPayload {
  const scaled = infos.map((info, i) => {
    const r = ratios[i];
    return scaleBurdenedGiftInfo(
      info as unknown as BurdenedGiftInfo,
      r !== undefined && r < 1 ? r : undefined,
    ) as unknown as BurdenedGiftInfoPayload;
  });
  const sum = (pick: (p: BurdenedGiftInfoPayload) => number): number =>
    scaled.reduce((s, p) => s + pick(p), 0);
  /** 일부 자산만 값이 있으면 그 합, 전부 미입력이면 undefined(0과 미입력은 다르다). */
  const sumOptional = (
    pick: (p: BurdenedGiftInfoPayload) => number | undefined,
  ): number | undefined =>
    scaled.some((p) => pick(p) !== undefined)
      ? scaled.reduce((s, p) => s + (pick(p) ?? 0), 0)
      : undefined;
  const primary = infos[0];
  return {
    ...primary,
    // 자산별 합산 — 평가·기준시가
    landStdPriceAtTransfer: sum((p) => p.landStdPriceAtTransfer),
    buildingStdPriceAtTransfer: sum((p) => p.buildingStdPriceAtTransfer),
    landStdPriceAtAcquisition: sum((p) => p.landStdPriceAtAcquisition),
    buildingStdPriceAtAcquisition: sum((p) => p.buildingStdPriceAtAcquisition),
    giftBuildingStdPriceAtTransfer: sumOptional((p) => p.giftBuildingStdPriceAtTransfer),
    marketValueAtTransfer: sumOptional((p) => p.marketValueAtTransfer),
    marketValueAtAcquisition: sumOptional((p) => p.marketValueAtAcquisition),
    // 자산별 합산 — 채무·임대
    lendingDepositTotal: sum((p) => p.lendingDepositTotal),
    mortgageDebtAmount: sum((p) => p.mortgageDebtAmount),
    annualRentTotal: sum((p) => p.annualRentTotal),
    mortgageSetAmount: sumOptional((p) => p.mortgageSetAmount),
    // 신고 단위 B 그대로 — override는 카드용이라 여기서는 쓰지 않는다.
    assumedDebtOverride: undefined,
  };
}

/**
 * 전 자산이 부담부증여인 **묶음**(축 B 지분 분할 취득 · 함께 부담부증여)의 총 양도가액 placeholder.
 *
 * 부담부증여의 양도가액은 §159가 채무 안분으로 정하므로 폼의 「총 양도가액」(`contractTotalPrice`) 칸은 비어 있는 것이 정상이다
 * (⑧이 검증을 면제한다 — `transfer-tax-validate.ts` `allBurdenedGift`). 그런데 ⑫ Zod는 `totalSalePrice`·`primaryActualSalePrice`·
 * 컴패니언 `totalPropertyTransferPrice`를 양수로만 받아, 빈 칸을 0으로 실으면 새 폼이 전부 400이었다(1h-G1-14 별건 · 결정 #28).
 * 단건이 채무 합계를 `transferPrice` placeholder로 싣는 것과 같은 규약이다 — 값은 엔진 STEP 0.48이 §159로 다시 계산하므로
 * 양수이기만 하면 된다. 입력한 총 양도가액이 있으면 그 값을 그대로 쓴다.
 *
 * 축 B는 각 카드가 같은 물건의 채무 전체(100%)를 입력하므로 주 자산 채무 하나를, 함께양도(다른 물건)는 자산별 채무의 합을 쓴다.
 */
export function burdenedGiftBundleTotalSalePrice(
  assets: ReadonlyArray<Pick<AssetForm, "transferType" | "bgLendingDepositTotal" | "bgMortgageDebtAmount">>,
  formContractTotalPrice: number,
  isAxisB: boolean,
): number {
  if (formContractTotalPrice > 0) return formContractTotalPrice;
  if (assets.length < 2 || !assets.every((a) => a.transferType === "burdened_gift")) return formContractTotalPrice;
  const debt = (a: (typeof assets)[number]) => (parseAmount(a.bgLendingDepositTotal) || 0) + (parseAmount(a.bgMortgageDebtAmount) || 0);
  return isAxisB ? debt(assets[0]) : assets.reduce((sum, a) => sum + debt(a), 0);
}

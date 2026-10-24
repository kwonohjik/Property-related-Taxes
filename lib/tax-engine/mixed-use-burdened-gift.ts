/**
 * 겸용주택 × 부담부증여 (소령 §159) — **엔진 seam**.
 *
 * 설계: docs/02-design/features/transfer-burdened-gift-mixed-use.engine.design.md (R4) §3.1A·§3.2.
 *
 * ## 구조 (B1 `applyMixedPartAcq` 선례)
 * 겸용 엔진을 «채무 귀속으로 덮어쓴 주택/상가 양도가액(B_h', B_c')»로 돌리면 양도가액 4부분 안분·보유기간·장특·비과세·중과·세율은
 * 기존 정본이 그대로 계산한다(`transfer-tax-mixed-use.ts`가 `apportionment`를 덮어쓴다). 모자라는 것이 이 파일이 하는 일이다:
 *
 *  - 취득가액·개산공제·실비에 **부분별 채무비율** `B_side'/C_side`를 곱한다 (주택 2부분 `B_h'/C_h`, 상가 2부분 `B_c'/C_c`).
 *  - 양도 없는 쪽(`B'=0`)은 전부 0 (`transferred:false`).
 *  - §97②2호 단서(K-5 환산 한정 가목·나목 택일)를 다시 판정한다 — 개산공제가 B/C로 줄어 가목이 달라진다.
 *  - 증여세(수증자)는 `buildBurdenedGiftGiftTax`(단건과 같은 함수).
 *
 * ## 절사 순서 (G-12)
 * 양도가액 = 채무 상당액의 체인 안분(합 = B_side') · 취득가액 = 4부분 분해(법 §100②) **후** 부분마다 `floor(A_i × B'/C)`.
 *
 * 순수 함수다(DB·Date 변환 없음). 판정·준비는 `mixed-use-burdened-gift-prepare.ts`(클라이언트도 호출) 소관이다.
 */
import { BURDENED_GIFT_TRANSFER } from "./legal-codes/burdened-gift";
import { MIXED_USE_BURDENED_GIFT } from "./legal-codes/burdened-gift-mixed-use";
import { estimatedDeductionRate } from "./legal-codes";
import { computeEstimatedDeduction, safeMultiplyThenDivide } from "./tax-utils";
import { buildBurdenedGiftGiftTax } from "./burdened-gift-gift-tax";
import { burdenedGiftSurchargeSuspendedNotice } from "./burdened-gift-eligibility";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { analyzeMixedBurdenedGift, type MixedBgPrepared, type MixedBgSource } from "./mixed-use-burdened-gift-prepare";
import type { HousingGainSplit } from "./transfer-tax-mixed-use-housing";
import type { CommercialGainSplit } from "./transfer-tax-mixed-use-commercial";
import type { MixedUseAssetInput, MixedUseStep } from "./types/transfer-mixed-use.types";
import type {
  MixedUseBurdenedGiftBreakdown,
  MixedUseBurdenedGiftPart,
  MixedUsePartKey,
} from "./types/mixed-use-burdened-gift.types";
import type { TransferBurdenedGiftAcquisitionMethodUsed } from "./types/transfer-burdened-gift.types";

/** 엔진 진입 가드 + 준비 — 이슈가 있으면 `INVALID_INPUT`으로 throw (⑫·⑧과 같은 collector 결과). */
export function prepareMixedBurdenedGiftOrThrow(src: MixedBgSource): MixedBgPrepared {
  const { issues, prepared } = analyzeMixedBurdenedGift(src);
  if (issues.length > 0 || !prepared) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `[burdened_gift/겸용주택 ${issues[0]?.code ?? ""}] ${issues[0]?.message ?? "부담부증여 입력을 확인하세요."}`,
    );
  }
  return prepared;
}

/** 엔진 asset에 BG 모드가 정한 값을 덮어쓴다 — 취득 경로 플래그는 BG 모드가 정본이다. */
export function applyBurdenedGiftAssetOverrides(asset: MixedUseAssetInput, bg: MixedBgPrepared): MixedUseAssetInput {
  const o = bg.assetOverrides;
  return {
    ...asset,
    useActualAcquisition: o.useActualAcquisition,
    useAppraisalSalesAcquisition: o.useAppraisalSalesAcquisition,
    acquisitionByInheritance: o.acquisitionByInheritance,
    acquisitionByGift: o.acquisitionByGift,
    acquisitionActualTotalPrice: o.acquisitionActualTotalPrice,
    totalPropertyTransferPrice: o.totalPropertyTransferPrice,
  };
}

const KEYS: readonly MixedUsePartKey[] = ["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"];

export interface MixedBgApplied {
  housing: HousingGainSplit;
  commercial: CommercialGainSplit;
  housingAcqTotal: number;
  proviso?: { estimatedSide: number; directSide: number; chosen: "estimated" | "direct" };
  breakdown: MixedUseBurdenedGiftBreakdown;
  /** 결과 `warnings`에 싣는 고지 */
  notices: string[];
}

export function applyMixedBurdenedGift(args: {
  asset: MixedUseAssetInput;
  bg: MixedBgPrepared;
  transferDate: Date;
  /** `transferPrice:=B_side'`로 돌린 split (양도가액·보유기간·basis·취득 경로 A_i가 여기서 나온다) */
  est: { housing: HousingGainSplit; commercial: CommercialGainSplit };
  /** 공통 경비 split(`swapToDirect=true`) — K-5 + 실비 선언일 때만 호출된다 */
  expThunk: () => { housing: HousingGainSplit; commercial: CommercialGainSplit };
  /** 주택분 상속·증여 취득가액이 평가액(reported)·§164 가액(standard_price) 중 무엇인가 — 결과 라벨 echo(`deemedBasis`)용 */
  housingDeemedSelected?: "reported" | "standard_price";
}): MixedBgApplied {
  const { asset, bg, transferDate, est } = args;
  const sideOf = (k: MixedUsePartKey) => (k.startsWith("housing") ? "housing" : "commercial") as "housing" | "commercial";
  const num = { housing: bg.debt.housingDebt, commercial: bg.debt.commercialDebt };
  const den = { housing: bg.value.housing, commercial: bg.value.commercial };
  /** 부분별 채무비율 적용 — floor(x × B'/C). 양도 없는 쪽은 0 */
  const scale = (x: number, k: MixedUsePartKey) => {
    const s = sideOf(k);
    return num[s] === 0 || den[s] === 0 ? 0 : safeMultiplyThenDivide(x, num[s], den[s]);
  };

  const g = (k: MixedUsePartKey) => {
    switch (k) {
      case "housingLand": return { t: est.housing.landTransferPrice, acq: est.housing.landAcqPrice, ded: est.housing.landAppraisalDed, basis: est.housing.landStdPriceAtAcq ?? 0 };
      case "housingBuilding": return { t: est.housing.buildingTransferPrice, acq: est.housing.buildingAcqPrice, ded: est.housing.buildingAppraisalDed, basis: est.housing.buildingStdPriceAtAcq ?? 0 };
      case "commercialLand": return { t: est.commercial.landTransferPrice, acq: est.commercial.landAcqPrice, ded: est.commercial.landAppraisalDed, basis: est.commercial.landStdPriceAtAcq ?? 0 };
      case "commercialBuilding": return { t: est.commercial.buildingTransferPrice, acq: est.commercial.buildingAcqPrice, ded: est.commercial.buildingAppraisalDed, basis: est.commercial.buildingStdPriceAtAcq ?? 0 };
    }
  };

  const rate = estimatedDeductionRate(asset.isUnregistered);
  const lump = (k: MixedUsePartKey) => computeEstimatedDeduction(scale(g(k).basis, k), rate);

  const acq = {} as Record<MixedUsePartKey, number>;
  const ded = {} as Record<MixedUsePartKey, number>;
  const beforeSwap: Partial<Record<MixedUsePartKey, number>> = {};
  let lumpRate: number | undefined;
  let proviso: MixedBgApplied["proviso"];

  for (const k of KEYS) {
    const e = g(k);
    switch (bg.acqPath) {
      case "standard": // K-1~K-3 (괄호 발동) — 취득시 기준시가 × B'/C, 개산공제
        acq[k] = scale(e.basis, k);
        ded[k] = lump(k);
        lumpRate = rate;
        break;
      case "converted": // K-5 — 환산은 est가 이미 B' 몫 위에서 계산(×B/C 없음), 개산공제만 스케일
        acq[k] = e.acq;
        ded[k] = lump(k);
        lumpRate = rate;
        break;
      case "salesCase":
      case "appraisal": // K-6/K-7 — 추계가액 × B'/C, 개산공제만(실비 미반영)
        acq[k] = scale(e.acq, k);
        ded[k] = lump(k);
        lumpRate = rate;
        break;
      default: // "actual" · "deemed" — 실지거래가액(의제) × B'/C, 실비 × B'/C (개산공제 아님)
        acq[k] = scale(e.acq, k);
        ded[k] = scale(e.ded, k);
    }
  }

  // §97②2호 단서 — K-5(환산취득가액) 한정 가목(환산+개산공제) < 나목(자본적지출+양도비)이면 나목. 동률은 본문.
  const provisoDeclared = asset.capitalExpenditure !== undefined || asset.transferExpense !== undefined;
  if (bg.acqPath === "converted" && provisoDeclared) {
    const exp = args.expThunk();
    const directOf = (k: MixedUsePartKey) =>
      scale(
        k === "housingLand" ? exp.housing.landAppraisalDed
          : k === "housingBuilding" ? exp.housing.buildingAppraisalDed
          : k === "commercialLand" ? exp.commercial.landAppraisalDed
          : exp.commercial.buildingAppraisalDed,
        k,
      );
    const estimatedSide = KEYS.reduce((n, k) => n + acq[k] + ded[k], 0);
    const directSide = KEYS.reduce((n, k) => n + directOf(k), 0);
    const chosen: "estimated" | "direct" = directSide > estimatedSide ? "direct" : "estimated";
    proviso = { estimatedSide, directSide, chosen };
    if (chosen === "direct") {
      for (const k of KEYS) {
        beforeSwap[k] = acq[k];
        acq[k] = 0;
        ded[k] = directOf(k);
      }
      lumpRate = undefined;
    }
  }

  const gain = (k: MixedUsePartKey) => g(k).t - acq[k] - ded[k];
  const housing: HousingGainSplit = {
    ...est.housing,
    landAcqPrice: acq.housingLand,
    buildingAcqPrice: acq.housingBuilding,
    landAppraisalDed: ded.housingLand,
    buildingAppraisalDed: ded.housingBuilding,
    landGain: gain("housingLand"),
    buildingGain: gain("housingBuilding"),
    totalGain: gain("housingLand") + gain("housingBuilding"),
  };
  const commercial: CommercialGainSplit = {
    ...est.commercial,
    estimatedAcqPrice: acq.commercialLand + acq.commercialBuilding,
    landAcqPrice: acq.commercialLand,
    buildingAcqPrice: acq.commercialBuilding,
    landAppraisalDed: ded.commercialLand,
    buildingAppraisalDed: ded.commercialBuilding,
    landGain: gain("commercialLand"),
    buildingGain: gain("commercialBuilding"),
    totalGain: gain("commercialLand") + gain("commercialBuilding"),
  };

  const method: TransferBurdenedGiftAcquisitionMethodUsed =
    bg.acqPath === "standard" ? "standard_price" : bg.acqPath === "deemed" ? "actual" : bg.acqPath;

  const stdT: Record<MixedUsePartKey, number> = {
    housingLand: bg.transferStd.hl, housingBuilding: bg.transferStd.hb,
    commercialLand: bg.transferStd.cl, commercialBuilding: bg.transferStd.cb,
  };
  const hs = bg.transferStd.hl + bg.transferStd.hb;
  const cs = bg.transferStd.cl + bg.transferStd.cb;
  const perPart = {} as Record<MixedUsePartKey, MixedUseBurdenedGiftPart>;
  for (const k of KEYS) {
    const s = sideOf(k);
    // A_i — 시가 모드는 시가 총액의 쪽(주택/상가) 몫을 그 쪽 기준시가 비례로 나눈 값, 기준시가 모드는 basis 자체
    const sideStd = s === "housing" ? hs : cs;
    perPart[k] = {
      sangjeungbeopValue: bg.value.isMarket && sideStd > 0 ? safeMultiplyThenDivide(den[s], stdT[k], sideStd) : stdT[k],
      stdPriceAtAcquisition: g(k).basis,
      stdPriceAtTransfer: stdT[k],
      transferPrice: g(k).t,
      acquisitionPrice: acq[k],
      estimatedDeduction: ded[k],
      ...(lumpRate !== undefined ? { estimatedDeductionRate: lumpRate } : {}),
      acquisitionMethod: method,
      ...(beforeSwap[k] !== undefined ? { acquisitionBeforeSwap: beforeSwap[k] } : {}),
      ...(bg.acqPath === "deemed" ? { acquisitionBeforeRatio: g(k).acq } : {}),
      transferred: num[s] > 0,
    };
  }

  const mainText = asset.residentialFloorArea > asset.nonResidentialFloorArea;
  const gratuitousPortion = bg.value.whole - bg.debt.total;
  const giftTax = buildBurdenedGiftGiftTax({
    info: bg.info,
    giftDate: transferDate,
    giftValuationMax: bg.value.whole,
    assumedDebtAmount: bg.debt.total,
    gratuitousPortion,
  });

  const breakdown: MixedUseBurdenedGiftBreakdown = {
    assumedDebtAmount: bg.debt.total,
    sangjeungbeopValuation: bg.valuation,
    giftValuation: bg.valuation,
    gratuitousPortion,
    taxpayer: "donor",
    acquisitionMethodUsed: method,
    ...(bg.acqPath === "deemed"
      ? {
          deemedCause: bg.assetOverrides.acquisitionByGift ? ("gift" as const) : ("inheritance" as const),
          deemedBasis: {
            housing: args.housingDeemedSelected === "standard_price" ? ("standard" as const) : ("reported" as const),
            commercial: est.commercial.inheritedAcquisitionDetail?.selected === "standard_price" ? ("standard" as const) : ("reported" as const),
            housingPhd: asset.usePreHousingDisclosure === true,
          },
        }
      : {}),
    ...(proviso ? { necessaryExpenseSwap: proviso } : {}),
    giftTax,
    perPart,
    highValue: {
      applicable: bg.debt.housingDebt > 0,
      judgmentBase: mainText ? bg.value.whole : bg.value.housing,
      prorationBase: bg.value.housing,
      basis: mainText ? "whole_building_C" : "housing_part_C",
    },
    debtAttribution: {
      housing: bg.debt.housing,
      commercial: bg.debt.commercial,
      unallocated: bg.debt.unallocated,
      unallocatedToHousing: bg.debt.unallocatedToHousing,
      unallocatedToCommercial: bg.debt.unallocatedToCommercial,
      housingDebt: bg.debt.housingDebt,
      commercialDebt: bg.debt.commercialDebt,
      housingRatio: den.housing === 0 ? 0 : num.housing / den.housing,
      commercialRatio: den.commercial === 0 ? 0 : num.commercial / den.commercial,
      housingGiftValue: bg.value.housing,
      commercialGiftValue: bg.value.commercial,
    },
  };

  // ── 고지 — 확인 필요 사항은 숨기지 않는다 ──
  const notices: string[] = [
    `12억원 고가주택 판정·안분은 양도로 보는 채무액이 아니라 증여가액(${bg.value.whole.toLocaleString("ko-KR")}원)을 기준으로 했습니다(국심2007서2099 등 — 겸용주택을 직접 다룬 해석례는 확인되지 않아 확인이 필요합니다).`,
    `채무 귀속은 입력하신 사실 선언(임대차계약서의 임차 대상·근저당 설정 대상 등 증빙 필요)에 따랐습니다 — ${MIXED_USE_BURDENED_GIFT.DEBT_ATTRIBUTION_RULING}.`,
    "증여세 평가에 쓰는 상가건물 기준시가는 양도세 기준시가와 같다고 보았습니다.",
  ];
  if (bg.debt.unallocated > 0) {
    notices.push("구분이 분명하지 않은 채무는 주택·상가 증여가액 비율로 나누었습니다 — 이 안분은 국세청 해석례가 직접 답하지 않아 확인이 필요합니다.");
  }
  if (bg.value.isMarket && !bg.value.separateAppraisal) {
    notices.push(`주택·상가로 구분된 감정평가가액이 없다고 보아 시가를 양도시 기준시가 비율로 주택·상가에 나누었습니다(${MIXED_USE_BURDENED_GIFT.VAT_DECREE_APPORTION_64_1} 본문).`);
  }
  if (bg.value.separateAppraisal) {
    notices.push(`입력하신 주택분 감정평가가액 비율로 시가를 주택·상가에 나누었습니다(${MIXED_USE_BURDENED_GIFT.VAT_DECREE_APPORTION_64_1} 단서). 단서의 감정평가가액은 공급시기가 속하는 과세기간의 직전 과세기간 개시일부터 공급시기가 속하는 과세기간 종료일까지 감정평가법인등이 평가한 것으로 한정됩니다 — 양도소득세에서 이 공급시기를 증여일로 읽는 것은 법령(소득세법 시행령 §166⑥)이 명시하지 않아 확인이 필요합니다.`);
  }
  if (mainText) {
    notices.push("주택 연면적이 주택 외 부분보다 커 건물 전부를 주택으로 보는 경우(소령 §154③ 본문)에도 채무 귀속에 따라 양도로 보는 부분을 나누어 계산했습니다 — 이 경우를 직접 다룬 해석례는 확인되지 않아 확인이 필요합니다.");
  }
  return { housing, commercial, housingAcqTotal: acq.housingLand + acq.housingBuilding, proviso, breakdown, notices };
}

/** 표시용 step — 계산 과정 맨 앞에 한 줄 */
export function buildMixedBurdenedGiftStep(bg: MixedBgPrepared): MixedUseStep {
  return {
    id: "step-0-burdened-gift",
    title: "부담부증여 양도로 보는 부분 (소령 §159)",
    legalBasis: BURDENED_GIFT_TRANSFER.VALUATION_159,
    values: [
      { label: "인수 채무 합계", value: bg.debt.total },
      { label: "증여가액(주택 + 상가)", value: bg.value.whole },
      { label: "주택으로 보는 채무액 / 주택 증여가액", value: `${bg.debt.housingDebt.toLocaleString("ko-KR")} / ${bg.value.housing.toLocaleString("ko-KR")}` },
      { label: "상가로 보는 채무액 / 상가 증여가액", value: `${bg.debt.commercialDebt.toLocaleString("ko-KR")} / ${bg.value.commercial.toLocaleString("ko-KR")}` },
    ],
  };
}

/** 다주택 중과 한시 배제 고지 — 주택 양도가 있고 유예가 실제로 적용된 결과에서만(1h-G1-11) */
export function mixedBurdenedGiftSurchargeNotice(
  bg: MixedBgPrepared,
  surcharge: { isSurchargeCase: boolean; isSuspended: boolean; effectiveHouseCount: number },
): string | undefined {
  return bg.debt.housingDebt > 0 && surcharge.isSurchargeCase && surcharge.isSuspended
    ? burdenedGiftSurchargeSuspendedNotice(surcharge.effectiveHouseCount)
    : undefined;
}

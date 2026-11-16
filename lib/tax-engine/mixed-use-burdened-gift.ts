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
import { applyRatio, computeEstimatedDeduction, safeMultiplyThenDivide } from "./tax-utils";
import { buildBurdenedGiftGiftTax } from "./burdened-gift-gift-tax";
import { MARKET_COLLATERAL_STANDARD_ACQUISITION_NOTICE } from "./burdened-gift-valuation";
import { bgParenthesisEraNotice } from "./burdened-gift-valuation";
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

/** 겸용 × 공유지분 부담부증여 고지 — 직접 해석례가 없다(2026-11-17 국세청 해석례 검색 「겸용주택 부담부증여 공유지분」 0건). */
export const MIXED_BG_SHARE_NOTICE =
  "겸용주택 공유지분 부담부증여는 직접 다룬 해석례가 확인되지 않았습니다. 「소득세법 시행령」 제156조 제1항의 «면적 비율»을 지분율로 읽어 12억원 고가주택 판정·안분 가액을 물건 전체로 환산했고, " +
  "증여가액·채무비율·취득가액은 지분 증여가액 기준으로 계산했습니다 — 확인이 필요합니다.";

/** 겸용 × 함께 양도 부담부증여 고지 — 채무 재배분·귀속·증여세 1회. */
export const MIXED_BG_BUNDLE_NOTICE =
  "함께 양도(여러 물건) 묶음 안의 겸용주택 부담부증여입니다 — 신고 단위 채무를 자산가액(증여가액) 비율로 재배분한 몫을 이 겸용주택의 인수 채무로 보았고(「소득세법 시행령」 제159조 제1항·제2항의 단일 채무비율), " +
  "그 채무는 구분 불분명으로 보아 주택·상가 증여가액 비율로 나누었습니다. 증여세는 증여계약 전체로 한 번 계산합니다. 이 묶음 안 겸용주택의 귀속·재배분은 직접 다룬 해석례가 확인되지 않아 확인이 필요합니다.";

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

  // 양도시 쪽 기준시가 합계(주택 = 개별주택가격 · 상가 = 토지 + 건물) — ③ 후보 분모 · 결과 echo
  const hs = bg.transferStd.hl + bg.transferStd.hb;
  const cs = bg.transferStd.cl + bg.transferStd.cb;
  const rate = estimatedDeductionRate(asset.isUnregistered);
  // 공유지분 — 취득시 기준시가(basis)는 물건 전체 값이라 지분분으로 줄여 ×B′/C(지분 증여가액)와 스케일을 맞춘다(단독 소유면 그대로).
  const basisOf = (k: MixedUsePartKey) => (bg.shareRatio === undefined ? g(k).basis : applyRatio(g(k).basis, bg.shareRatio));
  const lump = (k: MixedUsePartKey) => computeEstimatedDeduction(scale(basisOf(k), k), rate);

  const acq = {} as Record<MixedUsePartKey, number>;
  const ded = {} as Record<MixedUsePartKey, number>;
  const beforeSwap: Partial<Record<MixedUsePartKey, number>> = {};
  const beforeRatio: Partial<Record<MixedUsePartKey, number>> = {};
  let lumpRate: number | undefined;
  let proviso: MixedBgApplied["proviso"];

  for (const k of KEYS) {
    const e = g(k);
    switch (bg.acqPath) {
      case "standard": // K-1~K-3 (괄호 발동) — 취득시 기준시가 × B'/C, 개산공제
        acq[k] = scale(basisOf(k), k);
        ded[k] = lump(k);
        lumpRate = rate;
        break;
      case "converted": // K-5 — 환산은 est가 이미 B' 몫 위에서 계산(×B/C 없음), 개산공제만 스케일
        acq[k] = e.acq;
        ded[k] = lump(k);
        lumpRate = rate;
        break;
      case "converted_pre_deemed": {
        // 의제취득일 전 상속·증여 ③(환산취득가액 · 소령 §176조의2④) — 양도가액은 증여가액의 쪽 몫(C_h·C_c)이다(Q-36).
        //   ③ = C_side × 이 부분 의제취득일 기준시가 ÷ 그 쪽 양도시 기준시가 → 채무비율 × B'/C. 개산공제(§163⑥)는 기준시가 × B'/C.
        const s = sideOf(k);
        const sideT = s === "housing" ? hs : cs;
        beforeRatio[k] = sideT > 0 ? safeMultiplyThenDivide(den[s], e.basis, sideT) : 0;
        acq[k] = scale(beforeRatio[k]!, k);
        ded[k] = lump(k);
        lumpRate = rate;
        break;
      }
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
  if ((bg.acqPath === "converted" || bg.acqPath === "converted_pre_deemed") && provisoDeclared) {
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
    bg.acqPath === "standard" ? "standard_price" : bg.acqPath === "deemed" ? "actual" : bg.acqPath === "converted_pre_deemed" ? "converted" : bg.acqPath;

  const stdT: Record<MixedUsePartKey, number> = {
    housingLand: bg.transferStd.hl, housingBuilding: bg.transferStd.hb,
    commercialLand: bg.transferStd.cl, commercialBuilding: bg.transferStd.cb,
  };
  const perPart = {} as Record<MixedUsePartKey, MixedUseBurdenedGiftPart>;
  for (const k of KEYS) {
    const s = sideOf(k);
    // A_i — 시가 모드·담보/임대 승은 증여가액의 쪽(주택/상가) 몫을 그 쪽 기준시가 비례로 나눈 값, 기준시가 모드 보충적평가는 basis 자체
    const sideStd = s === "housing" ? hs : cs;
    const splitSide = bg.value.isMarket || bg.value.selectedMode !== "supplementary";
    perPart[k] = {
      sangjeungbeopValue: splitSide && sideStd > 0
        ? safeMultiplyThenDivide(den[s], stdT[k], sideStd)
        : bg.shareRatio === undefined ? stdT[k] : applyRatio(stdT[k], bg.shareRatio),
      stdPriceAtAcquisition: g(k).basis,
      stdPriceAtTransfer: stdT[k],
      transferPrice: g(k).t,
      acquisitionPrice: acq[k],
      estimatedDeduction: ded[k],
      ...(lumpRate !== undefined ? { estimatedDeductionRate: lumpRate } : {}),
      acquisitionMethod: method,
      ...(beforeSwap[k] !== undefined ? { acquisitionBeforeSwap: beforeSwap[k] } : {}),
      ...(bg.acqPath === "deemed" ? { acquisitionBeforeRatio: g(k).acq } : {}),
      ...(beforeRatio[k] !== undefined ? { acquisitionBeforeRatio: beforeRatio[k] } : {}),
      transferred: num[s] > 0,
    };
  }

  const mainText = asset.residentialFloorArea > asset.nonResidentialFloorArea;
  const gratuitousPortion = bg.value.whole - bg.debt.total;
  // 함께 양도 묶음 — 증여세는 계약 단위 1회(`aggregated.burdenedGift`)라 자산별로 계산하지 않는다(카드별로 쪼개면 증여재산공제가 N번 차감된다 · Q-7).
  const giftTax = bg.inBundle
    ? undefined
    : buildBurdenedGiftGiftTax({
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
    ...(bg.shareRatio !== undefined ? { ownershipRatio: bg.shareRatio } : {}),
    acquisitionMethodUsed: method,
    ...(bg.value.collateralForcedStdInMarketMode ? { acquisitionStdForcedByCollateral: true as const } : {}),
    ...(bg.acqPath === "converted_pre_deemed"
      ? {
          deemedCause: asset.acquisitionCause === "gift" ? ("gift" as const) : ("inheritance" as const),
          deemedBasis: { housing: "converted" as const, commercial: "converted" as const, housingPhd: asset.usePreHousingDisclosure === true },
        }
      : {}),
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
    ...(bg.preDeemed ? { acquisitionStdAtDeemedDate: true as const } : {}),
    ...(proviso ? { necessaryExpenseSwap: proviso } : {}),
    giftTax,
    perPart,
    highValue: {
      applicable: bg.debt.housingDebt > 0,
      judgmentBase: mainText ? bg.value.wholeJudgment : bg.value.housingJudgment,
      prorationBase: bg.value.housingJudgment,
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
    ...(bg.shareRatio !== undefined ? [MIXED_BG_SHARE_NOTICE] : []),
    ...(bg.inBundle ? [MIXED_BG_BUNDLE_NOTICE] : []),
    `12억원 고가주택 판정·안분은 양도로 보는 채무액이 아니라 ${bg.shareRatio !== undefined ? "물건 전체 " : ""}증여가액(${bg.value.wholeJudgment.toLocaleString("ko-KR")}원)을 기준으로 했습니다(국심2007서2099 등 — 겸용주택을 직접 다룬 해석례는 확인되지 않아 확인이 필요합니다).`,
    `채무 귀속은 입력하신 사실 선언(임대차계약서의 임차 대상·근저당 설정 대상 등 증빙 필요)에 따랐습니다 — ${MIXED_USE_BURDENED_GIFT.DEBT_ATTRIBUTION_RULING}.`,
    "증여세 평가에 쓰는 상가건물 기준시가는 양도세 기준시가와 같다고 보았습니다.",
  ];
  if (bg.debt.unallocated > 0) {
    notices.push(
      bg.value.selectedMode === "mortgage"
        ? "구분이 분명하지 않은 채무는 증여일 현재 주택·상가 기준시가 비율로 나누었습니다 — 이 안분은 국세청 해석례가 직접 답하지 않아 확인이 필요합니다."
        : "구분이 분명하지 않은 채무는 주택·상가 증여가액 비율로 나누었습니다 — 이 안분은 국세청 해석례가 직접 답하지 않아 확인이 필요합니다.",
    );
  }
  if (bg.value.selectedMode === "mortgage") {
    notices.push(
      `증여가액이 담보채권액 평가(「상속세 및 증여세법」 제66조)로 정해졌습니다. 이 평가액을 주택·상가로 나누는 기준은 법령에 없고 이를 직접 다룬 해석례도 확인되지 않아, ` +
        "주택·상가 각 부분의 증여가액을 그 부분에 귀속된 채무에 구분이 분명하지 않은 채무의 기준시가 비율 몫을 더한 금액으로 보았습니다(각 부분의 채무비율 1). 확인이 필요합니다.",
    );
  } else if (bg.value.selectedMode === "rental") {
    notices.push(
      `증여가액이 임대료 환산 평가(「상속세 및 증여세법」 제61조 제5항)로 정해졌습니다. 이 평가액을 주택·상가로 나누는 기준은 법령에 없고 이를 직접 다룬 해석례도 확인되지 않아, ` +
        "증여일 현재 주택·상가 기준시가 비율로 나누어 부분별로 「소득세법 시행령」 제159조 제1항을 적용했습니다. 확인이 필요합니다.",
    );
  }
  if (bg.value.debtFloor && bg.value.selectedMode !== "mortgage") {
    const [up, other] = bg.value.debtFloor === "housing" ? ["주택", "상가"] : ["상가", "주택"];
    notices.push(
      `${up}분으로 보는 채무액이 ${up}분의 기준시가 비율 몫보다 커서 ${up}분 증여가액을 그 채무액으로 보고 ${other}분 증여가액은 증여가액 전체에서 뺀 금액으로 보았습니다` +
        "(보증금·담보 채권은 그 부분 평가액의 하한 — 「상속세 및 증여세법」 제66조). 이를 직접 다룬 해석례는 확인되지 않아 확인이 필요합니다.",
    );
  }
  if (bg.value.collateralForcedStdInMarketMode) notices.push(MARKET_COLLATERAL_STANDARD_ACQUISITION_NOTICE);
  const eraNotice = bgParenthesisEraNotice(method, bg.value.selectedMode, transferDate);
  if (eraNotice) notices.push(eraNotice);
  if (bg.value.isMarket && !bg.value.separateAppraisal && !bg.value.collateralForcedStdInMarketMode) {
    notices.push(`주택·상가로 구분된 감정평가가액이 없다고 보아 시가를 양도시 기준시가 비율로 주택·상가에 나누었습니다(${MIXED_USE_BURDENED_GIFT.VAT_DECREE_APPORTION_64_1} 본문).`);
  }
  if (bg.value.separateAppraisal) {
    notices.push(`입력하신 주택분 감정평가가액 비율로 시가를 주택·상가에 나누었습니다(${MIXED_USE_BURDENED_GIFT.VAT_DECREE_APPORTION_64_1} 단서). 단서의 감정평가가액은 공급시기가 속하는 과세기간의 직전 과세기간 개시일부터 공급시기가 속하는 과세기간 종료일까지 감정평가법인등이 평가한 것으로 한정됩니다 — 양도소득세에서 이 공급시기를 증여일로 읽는 것은 법령(소득세법 시행령 §166⑥)이 명시하지 않아 확인이 필요합니다.`);
  }
  if (mainText) {
    notices.push("주택 연면적이 주택 외 부분보다 커 건물 전부를 주택으로 보는 경우(소령 §154③ 본문)에도 채무 귀속에 따라 양도로 보는 부분을 나누어 계산했습니다 — 이 경우를 직접 다룬 해석례는 확인되지 않아 확인이 필요합니다.");
  }
  // 묶음 안 겸용은 서브엔진 결과(`warnings`)가 합산에 닿지 않는다(파트 카드만 합산) — 고지를 명세에 싣고 route가 집계 경고로 올린다.
  return {
    housing, commercial, housingAcqTotal: acq.housingLand + acq.housingBuilding, proviso, notices,
    breakdown: bg.inBundle ? { ...breakdown, bundleNotices: notices } : breakdown,
  };
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

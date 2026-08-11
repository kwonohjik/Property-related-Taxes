/**
 * 주식 양도소득세 — 비상장주식 보충적 평가 모듈 (PR-2 완전 구현)
 *
 * 소득세법 시행령 §165④1:
 *   가중평균 = (1주당 순손익가치 × 3 + 1주당 순자산가치 × 2) ÷ 5
 *   단서: 가중평균 < 순자산가치 × 80% 시 → max(가중평균, 순자산가치 × 80%)
 *
 * 시행령 §165④3 가~라목: 순자산가치 단독 평가 (80% 하한 미적용)
 * 시행령 §165⑤: 부동산과다보유법인 가중치 반전 (순손익 2/5 + 순자산 3/5)
 *
 * 입력값 규약 (PR-2 정정 확정):
 *   netIncomePerShare = 1주당 순손익가치 (= 1주당 순손익액 ÷ 10% 이미 반영한 값)
 *   netAssetPerShare  = 1주당 순자산가치
 *   → 엔진에서 ÷10% 재적용 금지 (PR-1 인계 사항 정정)
 *
 * 시기별 평가 연혁 (§165④ 개정 이력):
 *   1998년 이하  : 순자산가치 단독
 *   1999~2000   : 가중평균 (손익 5/5? → 당시 시행령 구조)
 *   2001~2003   : 순손익 × 3 + 순자산 × 2 (5분의)
 *   2004~2007.2.27: 순손익 × 3 + 순자산 × 2 (현행과 동일 분모)
 *   2007.2.28~  : 현행 (§165④1 본칙 + 단서 80%)
 *
 * ※ 취득 후 상장 환산비율 계산(분자·분모)에는 80% 하한 미적용
 *    (환산비율 분자·분모는 stock-valuation-post-listing.ts에서 처리)
 */

import type { StockTransferInput } from "./types/stock-transfer.types";
import {
  STOCK,
  STOCK_FLOOR_80_PCT,
  STOCK_LOSS_GAIN_DISCOUNT_RATE,
} from "@/lib/tax-engine/legal-codes/stock";
import { calcAccrualMonths, apply81_4Accrual } from "./apply-81-4-accrual";
// §165④ 가중치·80% 하한 연혁은 §165⑤(취득후상장)·validate·UI 프리뷰와 **공용 정본**이다.
// 여기에 사본을 두면 같은 조문이 두 곳에서 갈린다. [[feedback_ui_engine_dual_truth_avoidance]]
import { getValuationWeights } from "./valuation-165-4-basis";

// ============================================================
// 평가 결과 타입
// ============================================================

export interface UnlistedValuationResult {
  /** 1주당 최종 평가액 (80% 하한 적용 후) */
  perShareValue: number;
  /** 취득기준시가 총액 (개산공제 계산 기준) */
  acquisitionStdPriceTotal: number;
  /** 환산취득가 총액 = 양도가 × (취득기준시가 / 양도기준시가) */
  totalAcquisitionPrice: number;
  /** 평가 방법 — [사례 49] "acq_face_value_only" 추가 (취득만 액면가 + 양도 §165④) */
  method: "weighted_avg" | "net_asset_only" | "face_value" | "acq_face_value_only";
  /**
   * [사례 49 — DR-1·M-2] 80% 하한 적용 후 양도기준시가 (환산 분모·UI 표시용).
   *   분자(액면가)는 input.acqFaceValuePerShare에서 그대로 조회.
   *   E-5 정정: float ratio 필드 제거 — 분자·분모 분리.
   */
  transferStdPriceAfterFloor?: number;
  /** 80% 하한 적용 여부 (§165④1 단서) — **양도**기준시가 */
  netAssetFloorApplied: boolean;
  /** 80% 하한값 (netAssetFloorApplied=true 시) */
  netAssetFloorValue?: number;
  /**
   * 80% 하한 적용 여부 — **취득**기준시가 (2026-08-09 신설).
   *
   * 양도측(`netAssetFloorApplied`)과 **독립적으로** 발동한다. 취득연도는 저수익이었으나
   * 양도연도는 수익이 났다면 취득측만 참이 된다. 표시 계층이 「하한 발동」을 양도측만 보고
   * 판단하면 그 경우를 놓친다.
   */
  acquisitionNetAssetFloorApplied?: boolean;
  /** 1주당 가중평균값 (floor 전) */
  weightedAvgRaw?: number;
  /** 1주당 순손익가치 */
  netIncomeValue?: number;
  /** 1주당 순자산가치 */
  netAssetValue?: number;
  /** 순자산 단독 사유 (netAssetOnlyReason 전달) */
  netAssetOnlyReason?: StockTransferInput["netAssetOnlyReason"];
  /**
   * [B-4 §165⑨ 본체] 양도·취득 기준시가 동일 → §81④ 1호 월할 보정 발동 시 echo (미발동 undefined).
   */
  section1659Detail?: {
    prior: number;
    prePrior: number;
    holdingMonths: number;
    priorBizYearMonths: number;
    adjusted: number;
  };
  warnings: string[];
  appliedRules: string[];
}

// ============================================================
// 시기별 평가 연혁 — 양도일 기준 (§165④ 개정 이력)
// ============================================================

// 연혁 게이트(`getValuationWeights`)는 `valuation-165-4-basis.ts`로 이관했다 — §165⑤ 경로와
// 공용이다. 사본을 되살리지 말 것.

// ============================================================
// 가중평균 1주당 평가액 계산
// ============================================================

/**
 * 비상장 1주당 가중평균 계산
 *
 * netIncomeValue = 1주당 순손익가치 (= 1주당 순손익액 ÷ 10% 이미 반영)
 * netAssetValue  = 1주당 순자산가치
 *
 * 현행(2007.2.28.~): (ni × 3 + na × 2) ÷ 5
 * 가중치 반전(부동산과다보유): (ni × 2 + na × 3) ÷ 5
 */
function calcWeightedAvgPerShare(
  netIncomeValue: number,
  netAssetValue: number,
  niWeight: number,
  naWeight: number,
): number {
  return (netIncomeValue * niWeight + netAssetValue * naWeight) / 5;
}

// ============================================================
// 메인: 비상장 보충적 평가 (양도·취득 기준시가)
// ============================================================

/**
 * 비상장 보충적 평가
 *
 * transferPrice: 양도가액 (교환 합계 또는 실가)
 * shareCount: 주식수
 * transferDate: 양도일 (시기별 평가 연혁 분기 기준)
 *
 * 반환:
 *   - acquisitionStdPriceTotal: 취득기준시가 총액 (개산공제 기준)
 *   - totalAcquisitionPrice: 환산취득가 (양도가 × 취득기준시가 / 양도기준시가)
 */
export function calcUnlistedValuation(
  input: StockTransferInput,
  transferPrice: number,
): UnlistedValuationResult {
  const {
    shareCount,
    transferDate,
    bookLost,
    faceValuePerShare,
    netAssetOnlyReason,
    isHeavyRealEstateForValuation,
  } = input;
  const isHeavyRE = input.isHeavyRealEstateForValuation;
  const acqFaceValueOnly = input.acqFaceValueOnly === true;
  const acqFaceValuePerShare = input.acqFaceValuePerShare ?? 0;

  const warnings: string[] = [];
  const appliedRules: string[] = [STOCK.ENFORCEMENT_DECREE_165_4_1_WEIGHTED_AVG];

  // ──────────────────────────────────────────────────────────
  // [사례 49] 취득시 장부분실 액면가 + 양도시 §165④ 보충 평가 (§99①4 후단)
  //   activate: acqFaceValueOnly === true && acqFaceValuePerShare > 0
  //   양도기준시가는 §165④1 가중평균 본칙 + 80% 하한 (NA 단독 사유 시 단독)
  //   취득기준시가 = 액면가 × 주식수 (§163⑥4 개산공제 1% 자동 — calcEstimatedDeductionBase가 처리)
  //   환산취득가 = 양도가 × (액면가 / 양도기준시가) — BigInt overflow 안전
  // ──────────────────────────────────────────────────────────
  if (acqFaceValueOnly && acqFaceValuePerShare > 0) {
    const niPerShare = input.transferYearNetIncomePerShare ?? 0;
    const naPerShare = input.transferYearNetAssetPerShare ?? 0;
    const isNetAssetOnly = !!netAssetOnlyReason;

    // STEP 1: 양도기준시가 §165④1 — **양도일 시기별 연혁**을 따른다.
    //
    // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): 이 분기만 현행 3:2와 80% 하한을
    // 하드코딩해 MAIN 경로(`:292` getValuationWeights)와 **같은 함수 안에서 서로 다른 법을**
    // 적용하고 있었다. 연혁 모델은 이미 `getValuationWeights`에 있다:
    //   · ~1998.12.31.  순자산 단독 (3:2 아님)
    //   · 1999.1.1.~2007.2.27.  3:2 가중평균, **80% 하한 없음**
    //   · 2007.2.28.~  3:2 + 80% 하한(§165④1 단서)
    // 하드코딩 탓에 2007.2.28. 이전 양도에 하한이 잘못 걸려 양도기준시가↑ → 환산취득가↓ →
    // **세액 과대**였다.
    const hist = getValuationWeights(transferDate);
    // 1999년 전은 순자산 단독이라 부동산과다보유 반전도 의미가 없다(niWeight=0).
    const useNetAssetOnly = isNetAssetOnly || hist.niWeight === 0;
    const niW = isHeavyRE ? hist.naWeight : hist.niWeight;
    const naW = isHeavyRE ? hist.niWeight : hist.naWeight;
    const weighted = useNetAssetOnly
      ? naPerShare
      : Math.floor((niPerShare * niW + naPerShare * naW) / 5);

    // STEP 2: 80% 하한 (가중평균 케이스만) — §165④1 단서.
    // MAIN 경로(아래 hasFloor80 분기)와 동일하게 `floor80 > weighted`만으로 판정한다.
    // 결손법인(순손익가치 음수 → weighted ≤ 0)에서도 하한(na×0.8)이 발동해야 하므로
    // `weighted > 0` 가드를 두지 않는다(두면 0 반환 → MAIN과 dual-truth).
    // all-zero(ni=0·na=0): floor80=0, `0 > 0`=false → 미발동 → 후속 ≤0 가드가 처리(동작 불변).
    let transferStdPerShare = weighted;
    let floor80Applied = false;
    // 하한은 2007.2.28. 이후 양도에만 존재한다(hist.hasFloor80) — MAIN 경로와 동일 게이팅.
    if (!useNetAssetOnly && hist.hasFloor80) {
      const floor80 = Math.floor(naPerShare * 0.8);
      if (floor80 > weighted) {
        transferStdPerShare = floor80;
        floor80Applied = true;
      }
    }

    const acquisitionStdPriceTotal = acqFaceValuePerShare * shareCount;
    appliedRules.push(STOCK.SECTION_99_1_4_BACK_BOOK_LOST_AT_ACQ);
    if (floor80Applied) appliedRules.push(STOCK.SECTION_165_4_1_FLOOR_80);

    // STEP 3: division by zero 가드 [DM-1]
    if (transferStdPerShare <= 0) {
      warnings.push(
        niPerShare === 0 && naPerShare === 0
          ? "양도연도 NI/NA 모두 미입력 — 환산취득가 산출 불가. validate에서 사전 차단 필요"
          : "양도기준시가가 0 이하 — 환산취득가 산출 불가",
      );
      return {
        perShareValue: 0,
        acquisitionStdPriceTotal,
        totalAcquisitionPrice: 0,
        method: "acq_face_value_only",
        netAssetFloorApplied: floor80Applied,
        transferStdPriceAfterFloor: 0,
        warnings,
        appliedRules,
      };
    }

    // STEP 4: 환산취득가 BigInt 안전 = 양도가 × (액면가 / 양도기준시가)
    const totalAcquisitionPrice = Math.floor(
      Number(
        (BigInt(transferPrice) * BigInt(acqFaceValuePerShare)) /
          BigInt(transferStdPerShare),
      ),
    );

    return {
      perShareValue: transferStdPerShare,
      acquisitionStdPriceTotal,
      totalAcquisitionPrice,
      method: "acq_face_value_only",
      netAssetFloorApplied: floor80Applied,
      transferStdPriceAfterFloor: transferStdPerShare,
      netAssetFloorValue: floor80Applied ? transferStdPerShare : undefined,
      weightedAvgRaw: weighted,
      netIncomeValue: niPerShare,
      netAssetValue: naPerShare,
      netAssetOnlyReason,
      warnings,
      appliedRules,
    };
  }

  // ──────────────────────────────────────────────────────────
  // 장부분실 + 액면가 (§99①4)
  // bookLost = true → acquisitionMode="face_value"에서 호출됨
  // ──────────────────────────────────────────────────────────
  if (bookLost && faceValuePerShare) {
    const perShareValue = faceValuePerShare;
    const acquisitionStdPriceTotal = perShareValue * shareCount;

    // 환산취득가 계산 — 액면가 취득기준시가 / 양도기준시가(보충평가) 방식은 별도 계산 필요
    // 단, 사례 49: acquisitionMode="face_value"에서는 직접 취득가 = face_value × shareCount가 아님
    // 올바른 계산: 환산취득가 = 양도가 × (액면가 / 양도기준시가)
    // 양도기준시가는 별도로 입력받아야 하나, face_value 모드의 경우
    // 엔진 STEP 2에서 calcUnlistedValuation 호출 → transferPrice와 함께 전달됨
    // 여기서는 취득기준시가 총액만 반환하고, 환산취득가는 호출부에서 계산

    appliedRules.push(STOCK.SECTION_99_1_4_FACE_VALUE);

    return {
      perShareValue,
      acquisitionStdPriceTotal,
      totalAcquisitionPrice: acquisitionStdPriceTotal, // 호출부에서 환산 재계산
      method: "face_value",
      netAssetFloorApplied: false,
      warnings,
      appliedRules,
    };
  }

  // ──────────────────────────────────────────────────────────
  // 양도일 1주당 평가액 (양도기준시가) — 시기별 연혁 분기
  // ──────────────────────────────────────────────────────────
  const weights = getValuationWeights(transferDate);

  // 양도일 직전 사업연도 입력값
  const transferNi = input.transferYearNetIncomePerShare ?? 0;
  const transferNa = input.transferYearNetAssetPerShare ?? 0;

  // 취득일 직전 사업연도 입력값 (취득기준시가)
  const acquisitionNi = input.acquisitionYearNetIncomePerShare ?? 0;
  const acquisitionNa = input.acquisitionYearNetAssetPerShare ?? 0;

  // ──────────────────────────────────────────────────────────
  // 순자산 단독 평가 4사유 (§165④3 가~라목)
  // 80% 하한 미적용 (케이스 27)
  // ──────────────────────────────────────────────────────────
  if (netAssetOnlyReason) {
    let ruleRef: string;
    switch (netAssetOnlyReason) {
      case "liquidation_or_owner_death":
        ruleRef = STOCK.ENFORCEMENT_DECREE_165_4_3_GA_LIQUIDATION;
        break;
      case "no_business_or_short_or_closed":
        ruleRef = STOCK.ENFORCEMENT_DECREE_165_4_3_NA_PRE_BUSINESS;
        break;
      case "stock_holding_company":
        ruleRef = STOCK.ENFORCEMENT_DECREE_165_4_3_DA_HOLDING_CO;
        break;
      case "remaining_term_under_3y":
        ruleRef = STOCK.ENFORCEMENT_DECREE_165_4_3_RA_REMAINING_3Y;
        break;
      default:
        ruleRef = STOCK.ENFORCEMENT_DECREE_165_4_3_GA_LIQUIDATION;
    }
    appliedRules.push(ruleRef);

    // 양도기준시가 = 순자산 단독
    const transferStdPricePerShare = Math.floor(transferNa);
    // 취득기준시가 = 순자산 단독 (이월과세면 **증여자 취득 당시** 값으로 대체 — §97의2①1호)
    const acquisitionStdPricePerShare =
      input.acquisitionStdPriceOverridePerShare ?? Math.floor(acquisitionNa);
    const acquisitionStdPriceTotal = acquisitionStdPricePerShare * shareCount;

    if (transferStdPricePerShare <= 0) {
      warnings.push("양도일 순자산 단독 평가액이 0 이하입니다.");
      return {
        perShareValue: 0,
        acquisitionStdPriceTotal: 0,
        totalAcquisitionPrice: 0,
        method: "net_asset_only",
        netAssetFloorApplied: false,
        netAssetOnlyReason,
        warnings,
        appliedRules,
      };
    }

    // 환산취득가 = 양도가 × 취득기준시가 / 양도기준시가
    const totalAcquisitionPrice = Math.floor(
      (transferPrice * acquisitionStdPricePerShare) / transferStdPricePerShare,
    );

    return {
      perShareValue: acquisitionStdPricePerShare,
      acquisitionStdPriceTotal,
      totalAcquisitionPrice,
      method: "net_asset_only",
      netAssetFloorApplied: false, // §165④3 단독 사유 — 80% 하한 미적용
      netAssetOnlyReason,
      netIncomeValue: transferNi,
      netAssetValue: transferNa,
      warnings,
      appliedRules,
    };
  }

  // ──────────────────────────────────────────────────────────
  // 가중평균 — 현행 or 시기별
  // ──────────────────────────────────────────────────────────

  // 가중치 반전 (부동산과다보유법인 §165⑤)
  const niWeight = isHeavyRealEstateForValuation ? 2 : weights.niWeight;
  const naWeight = isHeavyRealEstateForValuation ? 3 : weights.naWeight;

  if (isHeavyRealEstateForValuation) {
    // 2026-07-29 정정(#591 감사 R7 — 라벨 전용, 세액 불변): 부동산과다보유 가중치 반전의
    //   근거는 §165④1(법 §94①4 다목) 괄호이지 **취득후상장 규정 §165⑤이 아니다**.
    //   같은 파일 `:650` 주석이 이미 "§165④1 괄호"로 옳게 적고 있어 내부 불일치였다.
    appliedRules.push(STOCK.ENFORCEMENT_DECREE_165_4_1_WEIGHTED_AVG + "가중치반전");
    appliedRules.push("부동산과다보유가중치반전");
  }

  // 1998 이하 순자산 단독 연혁 분기 (getValuationWeights에서 niWeight=0, naWeight=5로 처리)
  if (weights.niWeight === 0 && weights.naWeight === 5 && !isHeavyRealEstateForValuation) {
    appliedRules.push("시기별평가1998이하순자산단독");
  }

  // ─── 양도기준시가 (양도일 직전 사업연도 기준) ───
  let transferWeightedRaw: number;
  if (niWeight === 0) {
    // 1998 이하 연혁: 순자산 단독
    transferWeightedRaw = transferNa;
  } else {
    transferWeightedRaw = calcWeightedAvgPerShare(transferNi, transferNa, niWeight, naWeight);
  }

  // 80% 하한 적용 (현행 §165④1 단서)
  let transferStdPricePerShare: number;
  let netAssetFloorApplied = false;
  let netAssetFloorValue: number | undefined;

  if (weights.hasFloor80 && !isHeavyRealEstateForValuation) {
    // 가중치 반전(부동산과다보유) 시 80% 하한은 별도 검토 — PR-2 범위에서 본칙 적용
    const floor80 = transferNa * STOCK_FLOOR_80_PCT;
    if (floor80 > transferWeightedRaw) {
      netAssetFloorApplied = true;
      netAssetFloorValue = Math.floor(floor80);
      transferStdPricePerShare = Math.floor(floor80);
      appliedRules.push("80%하한");
      appliedRules.push(STOCK.ENFORCEMENT_DECREE_165_4_1_FLOOR_80);
    } else {
      transferStdPricePerShare = Math.floor(transferWeightedRaw);
    }
  } else if (weights.hasFloor80 && isHeavyRealEstateForValuation) {
    // 부동산과다보유 가중치 반전 + 80% 하한: 반전 가중치 가중평균이 순자산 80% 미만인 경우
    const floor80 = transferNa * STOCK_FLOOR_80_PCT;
    if (floor80 > transferWeightedRaw) {
      netAssetFloorApplied = true;
      netAssetFloorValue = Math.floor(floor80);
      transferStdPricePerShare = Math.floor(floor80);
      appliedRules.push("80%하한");
    } else {
      transferStdPricePerShare = Math.floor(transferWeightedRaw);
    }
  } else {
    transferStdPricePerShare = Math.floor(transferWeightedRaw);
  }

  if (transferStdPricePerShare <= 0) {
    warnings.push("양도기준시가가 0 이하입니다. 보충적 평가 불가.");
    return {
      perShareValue: 0,
      acquisitionStdPriceTotal: 0,
      totalAcquisitionPrice: 0,
      method: "weighted_avg",
      netAssetFloorApplied: false,
      warnings,
      appliedRules,
    };
  }

  // ─── 취득기준시가 (취득일 직전 사업연도 기준) ───
  //
  // 가중치·80% 하한 **모두** 양도기준시가와 같은 규칙을 적용한다.
  //
  // 🔴 **2026-08-09 정정 — 종전에는 하한을 양도측에만 걸었다**(주석: "80% 하한은 양도기준시가에만").
  //    그 취급에는 **확인된 근거가 0건**이었다. 코드 주석 → 계획서(「80% 하한 관행」) →
  //    설계서가 서로를 인용하는 **자기참조 루프**였고, 도메인 최초 커밋부터 그대로였다.
  //
  //    반면 §165④1호 단서는 「**그 가중평균한 가액이** … 적은 경우에는 … **평가액으로 한다**」로
  //    양도/취득을 가르지 않는다. §165④1호는 「1주당 가액의 평가」 방법 **전체**이고,
  //    가·나목이 「**양도일 또는 취득일**이 속하는 사업연도…」라 **양쪽 다 이 방법으로 평가**한다.
  //    ⇒ 단서는 그 평가방법의 일부다. **근거가 필요한 것은 「적용한다」가 아니라 「취득측은 뺀다」는 예외**다.
  //
  //    확증 3중: ① 위임 조문(법 §99①4호 **후단**)이 같은 문장에서 「**취득 당시의 기준시가**」를 다룬다
  //             ② §165④1호 가·나목이 「양도일 또는 취득일」 병렬
  //             ③ §165⑤이 「취득 당시의 기준시가는 **제4항에도 불구하고**…」라며 예외를 두고 그 안에서
  //                「취득일 현재의 **제4항에 따른 평가액**」이라 쓴다 — 예외를 둔다는 것 자체가
  //                **원칙적으로 취득 기준시가도 ④(하한 포함)로 평가**함을 전제한다.
  //    조세심판례도 같은 환산 산식에서 「하나의 산식에서 동일한 자산을 2가지의 서로 다른 기준에 의하여
  //    평가하는 것은 타당하지 아니하다」고 배척했다(국심1997경1195 외 5건·참조 국심1996부1246).
  //
  //    ⚠️ **직접 예규는 확보하지 못했다**(국세청 집행기준 99-165에도 하한 자체가 등장하지 않는다 —
  //       단 같은 문서가 상증법 §54① 단서의 하한도 언급하지 않으므로 **침묵은 배제의 근거가 아니다**).
  //       반대 근거는 문언·심판례·집행기준 어디에도 0건이다. 반대 해석이 나오면 재검토할 것.
  //
  // ⚠️ 연혁 게이팅은 `weights.hasFloor80`(= **양도일** 기준)이다. 가중치(niWeight·naWeight)가 이미
  //    양도일 기준으로 양쪽에 동일 적용되고 있으므로 하한만 취득일 기준으로 가르면 오히려 어긋난다.
  let acquisitionWeightedRaw: number;
  if (niWeight === 0) {
    acquisitionWeightedRaw = acquisitionNa;
  } else {
    acquisitionWeightedRaw = calcWeightedAvgPerShare(acquisitionNi, acquisitionNa, niWeight, naWeight);
  }

  let acquisitionStdPricePerShare = Math.floor(acquisitionWeightedRaw);
  let acquisitionNetAssetFloorApplied = false;
  if (weights.hasFloor80) {
    const acqFloor80 = acquisitionNa * STOCK_FLOOR_80_PCT;
    if (acqFloor80 > acquisitionWeightedRaw) {
      acquisitionStdPricePerShare = Math.floor(acqFloor80);
      acquisitionNetAssetFloorApplied = true;
      appliedRules.push("80%하한(취득기준시가)");
    }
  }
  /**
   * §97의2①1호 — 이월과세면 취득기준시가는 **증여자 취득 당시**의 것이다.
   * 보충평가·80% 하한을 모두 마친 **뒤에** 덮어쓴다 — 증여자 값은 이미 확정된 사실이라
   * 수증자 취득연도의 순손익·순자산으로 재가공할 대상이 아니기 때문이다.
   * 분모(양도기준시가)는 이월과세와 무관하므로 그대로 둔다.
   */
  if (input.acquisitionStdPriceOverridePerShare !== undefined) {
    acquisitionStdPricePerShare = input.acquisitionStdPriceOverridePerShare;
    acquisitionNetAssetFloorApplied = false;
  }
  const acquisitionStdPriceTotal = acquisitionStdPricePerShare * shareCount;

  // ─── [B-4 §165⑨ 본체] 양도·취득 기준시가 동일 시 §81④ 1호 월할 보정 ───
  // 양도 당시 기준시가 == 취득 당시 기준시가(= 동일 사업연도 취득·양도)인 경우,
  // 양도 당시 기준시가를 §81④ 월할 상승분으로 교체(취득 당시 기준시가는 불변).
  // 보정 대상은 환산 분모(transferStd)뿐 — 분자(acqStd)·개산공제 base 불변.
  let appliedTransferStd = transferStdPricePerShare;
  let section1659Detail: UnlistedValuationResult["section1659Detail"];
  const equalStd =
    transferStdPricePerShare === acquisitionStdPricePerShare && transferStdPricePerShare > 0;

  if (equalStd && input.unlistedSameBizYearToggle === true) {
    const hasPrePrior =
      typeof input.prePriorYearNetIncomePerShare === "number" &&
      typeof input.prePriorYearNetAssetPerShare === "number";
    if (hasPrePrior) {
      // 전전 사업연도 평가 — 본 경로의 연혁 가중치(niWeight·naWeight) 그대로 (prior와 일관)
      const prePrior = Math.floor(
        niWeight === 0
          ? input.prePriorYearNetAssetPerShare!
          : calcWeightedAvgPerShare(
              input.prePriorYearNetIncomePerShare!,
              input.prePriorYearNetAssetPerShare!,
              niWeight,
              naWeight,
            ),
      );
      const holdingMonths = calcAccrualMonths(input.acquisitionDate, transferDate); // 본체: 양도일 종점
      const priorBizYearMonths = input.priorBizYearMonths ?? 12;
      const { adjusted } = apply81_4Accrual(
        transferStdPricePerShare,
        prePrior,
        holdingMonths,
        priorBizYearMonths,
      );
      if (adjusted > 0) {
        appliedTransferStd = adjusted;
        appliedRules.push(STOCK.ENFORCEMENT_DECREE_165_9_MAIN);
        appliedRules.push(STOCK.ENFORCEMENT_RULE_81_4_MONTHLY_ACCRUAL);
        section1659Detail = {
          prior: transferStdPricePerShare,
          prePrior,
          holdingMonths,
          priorBizYearMonths,
          adjusted,
        };
      } else {
        warnings.push("§81④ 보정 평가액이 0 이하입니다. 보정 미적용.");
      }
    }
    // 전전연도 미입력은 validate에서 차단 — 엔진 도달 시 보정 미적용(방어)
  } else if (equalStd && input.unlistedSameBizYearToggle !== true) {
    // M-3: 동일 기준시가이나 동일 사업연도 아님(§81④ 2호) — 보정 없음
    warnings.push(
      "§165⑨ — 양도·취득 기준시가가 동일하나 동일 사업연도 취득·양도가 아닙니다(§81④ 2호). 양도차익이 0 이하일 수 있습니다.",
    );
  }

  // ─── 환산취득가 = 양도가 × (취득기준시가 / 보정 후 양도기준시가) ───
  // 정수 정밀도: 곱셈 먼저 (overflow 방지는 BigInt 사용)
  let totalAcquisitionPrice: number;
  if (acquisitionStdPricePerShare === 0 || appliedTransferStd === 0) {
    totalAcquisitionPrice = 0;
    warnings.push("취득기준시가 또는 양도기준시가가 0입니다. 환산취득가 = 0.");
  } else {
    // BigInt로 overflow 방지
    const numerator = BigInt(transferPrice) * BigInt(acquisitionStdPricePerShare);
    const denominator = BigInt(appliedTransferStd);
    totalAcquisitionPrice = Number(numerator / denominator);
  }

  return {
    perShareValue: acquisitionStdPricePerShare,
    acquisitionStdPriceTotal,
    totalAcquisitionPrice,
    method: "weighted_avg",
    netAssetFloorApplied,
    netAssetFloorValue,
    acquisitionNetAssetFloorApplied,
    weightedAvgRaw: transferWeightedRaw,
    netIncomeValue: transferNi,
    netAssetValue: transferNa,
    section1659Detail,
    warnings,
    appliedRules,
  };
}

// ============================================================
// 개산공제 기준시가 총액 계산 헬퍼 (§163⑥4)
// ============================================================

/**
 * 개산공제 = 취득당시 기준시가 × 1%
 *
 * 비상장 보충적 평가: 취득기준시가 총액 = acquisitionStdPriceTotal
 * 액면가: 취득기준시가 총액 = faceValuePerShare × shareCount
 *
 * ★ PR-2 정정: estimatedBase = 취득기준시가 총액 (환산취득가 아님)
 */
export function calcEstimatedDeductionBase(
  acquisitionMode: StockTransferInput["acquisitionMode"],
  acquisitionStdPriceTotal: number,
  faceValuePerShare: number | undefined,
  shareCount: number,
): number {
  if (acquisitionMode === "face_value") {
    return (faceValuePerShare ?? 0) * shareCount;
  }
  return acquisitionStdPriceTotal;
}

// ============================================================
// 비상장 장부분실 액면가 취득가 + 환산취득가 분리 헬퍼
// ============================================================

/**
 * 비상장 장부분실 액면가 환산취득가
 *
 * §99①4: 장부분실 시 취득기준시가 = 액면가
 * 환산취득가 = 양도가 × (액면가 / 양도기준시가)
 *
 * 양도기준시가 = calcUnlistedValuation()에서 반환된 transferStdPricePerShare
 *
 * 사례 49 anchor:
 *   양도가 = 6,000,000,000
 *   액면가 = 12,500
 *   양도기준시가 = 160,000 (80% 하한 적용 후)
 *   → 환산취득가 = 6,000,000,000 × 12,500 / 160,000 = 468,750,000
 */
export function calcFaceValueTransferEstimated(
  transferPrice: number,
  faceValuePerShare: number,
  transferStdPricePerShare: number,
): number {
  if (transferStdPricePerShare <= 0) return 0;
  const numerator = BigInt(transferPrice) * BigInt(faceValuePerShare);
  const denominator = BigInt(transferStdPricePerShare);
  return Number(numerator / denominator);
}

/**
 * 비상장 장부분실 시 양도기준시가 계산
 * (액면가는 취득기준시가 — 양도기준시가는 별도 보충 평가 필요)
 *
 * 사례 49: isHeavyRealEstateForValuation=false, niPerShare=30,000, naPerShare=200,000
 * weighted = 30,000×3/5 + 200,000×2/5 = 98,000
 * floor80  = 200,000×0.80 = 160,000
 * → max(98,000, 160,000) = 160,000 (80% 하한 발동)
 */
export function calcTransferStdPriceForFaceValue(
  input: StockTransferInput,
): { perShare: number; netAssetFloorApplied: boolean; netAssetFloorValue?: number } {
  const { transferDate, isHeavyRealEstateForValuation } = input;
  const transferNi = input.transferYearNetIncomePerShare ?? 0;
  const transferNa = input.transferYearNetAssetPerShare ?? 0;

  const weights = getValuationWeights(transferDate);
  const niWeight = isHeavyRealEstateForValuation ? 2 : weights.niWeight;
  const naWeight = isHeavyRealEstateForValuation ? 3 : weights.naWeight;

  let weightedRaw: number;
  if (niWeight === 0) {
    weightedRaw = transferNa;
  } else {
    weightedRaw = calcWeightedAvgPerShare(transferNi, transferNa, niWeight, naWeight);
  }

  if (weights.hasFloor80) {
    const floor80 = transferNa * STOCK_FLOOR_80_PCT;
    if (floor80 > weightedRaw) {
      return {
        perShare: Math.floor(floor80),
        netAssetFloorApplied: true,
        netAssetFloorValue: Math.floor(floor80),
      };
    }
  }

  return { perShare: Math.floor(weightedRaw), netAssetFloorApplied: false };
}

// ============================================================
// [C-1] 취득일 거래정지 — 취득시 1주당 보충평가 단독 산출
// ============================================================

export interface AcquisitionSideSupplementaryResult {
  /** 취득시 1주당 보충평가액 (floor) — 80% 하한 미적용 (양측 경로 분자 관행 :422-423 일관) */
  perShare: number;
  /** floor 전 가중평균 raw (NA 단독 시 NA 그대로) */
  weightedRaw: number;
  /** 비타입 문자열 규칙 (호출부 warnings로 전달 — calcUnlistedValuation 호출부 패턴) */
  appliedRules: string[];
  warnings: string[];
}

/**
 * [C-1] 취득시 1주당 §165④ 보충평가 단독 산출 (취득일 거래정지 전용)
 *
 * 소령 §165③ 후문 "양도일ㆍ취득일 이전 1개월" — 취득일 이전 1개월 거래정지·관리종목 시
 * 취득시 기준시가만 §99①4 → §165④ 보충 평가로 대체 (양도시는 1개월 종가평균 유지).
 * §165⑤ 비적용 판정(계산식이 상장일 기반 취득 후 상장 전제).
 *
 * - 가중치 연혁: getValuationWeights(transferDate) — 양측 경로(calcUnlistedValuation)와 동일 (양도시점 과세)
 * - netAssetOnlyReason 시 취득연도 NA 단독 (§165④3 — 양측 경로와 동일 규율)
 * - isHeavyRealEstateForValuation 시 2:3 반전 (§165④1 괄호)
 * - 80% 하한 미적용 — 분자(취득기준시가) 관행 일관
 */
export function calcAcquisitionStdPerShareSupplementary(
  input: StockTransferInput,
): AcquisitionSideSupplementaryResult {
  const { transferDate, netAssetOnlyReason, isHeavyRealEstateForValuation } = input;
  const acquisitionNi = input.acquisitionYearNetIncomePerShare ?? 0;
  const acquisitionNa = input.acquisitionYearNetAssetPerShare ?? 0;

  const warnings: string[] = [];
  const appliedRules: string[] = [
    STOCK.ENFORCEMENT_DECREE_165_3_TRADING_HALT,
  ];

  // 순자산 단독 평가 4사유 (§165④3 가~라목) — 취득측 NA 단독
  if (netAssetOnlyReason) {
    let ruleRef: string;
    switch (netAssetOnlyReason) {
      case "liquidation_or_owner_death":
        ruleRef = STOCK.ENFORCEMENT_DECREE_165_4_3_GA_LIQUIDATION;
        break;
      case "no_business_or_short_or_closed":
        ruleRef = STOCK.ENFORCEMENT_DECREE_165_4_3_NA_PRE_BUSINESS;
        break;
      case "stock_holding_company":
        ruleRef = STOCK.ENFORCEMENT_DECREE_165_4_3_DA_HOLDING_CO;
        break;
      case "remaining_term_under_3y":
        ruleRef = STOCK.ENFORCEMENT_DECREE_165_4_3_RA_REMAINING_3Y;
        break;
      default:
        ruleRef = STOCK.ENFORCEMENT_DECREE_165_4_3_GA_LIQUIDATION;
    }
    appliedRules.push(ruleRef);
    return {
      perShare: Math.floor(acquisitionNa),
      weightedRaw: acquisitionNa,
      appliedRules,
      warnings,
    };
  }

  // 가중평균 — 양측 경로와 동일 산식 (연혁 분기 + 부동산과다보유 반전)
  appliedRules.push(STOCK.ENFORCEMENT_DECREE_165_4_1_WEIGHTED_AVG);
  const weights = getValuationWeights(transferDate);
  const niWeight = isHeavyRealEstateForValuation ? 2 : weights.niWeight;
  const naWeight = isHeavyRealEstateForValuation ? 3 : weights.naWeight;
  if (isHeavyRealEstateForValuation) {
    appliedRules.push("부동산과다보유가중치반전");
  }

  const weightedRaw =
    niWeight === 0
      ? acquisitionNa
      : calcWeightedAvgPerShare(acquisitionNi, acquisitionNa, niWeight, naWeight);

  if (weightedRaw <= 0) {
    warnings.push("취득시 보충평가액이 0 이하 — 취득연도 순손익·순자산가치를 확인하세요");
  }

  return {
    perShare: Math.floor(weightedRaw),
    weightedRaw,
    appliedRules,
    warnings,
  };
}

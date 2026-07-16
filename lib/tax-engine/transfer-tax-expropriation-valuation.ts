/**
 * 공익수용 환산취득가액 — 양도당시 기준시가 차감 특례 (**소득세법 시행령 §164⑨ 1호**)
 *
 * 취득가 불명(환산) 자산이 협의매수·수용된 경우, 환산 분모(양도당시 기준시가)를
 * min[기준시가 ㎡당, 보상 ㎡당가액, 보상산정 기초 기준시가] × 면적 으로 낮춘다(취득가액↑·차익↓).
 *
 * §164⑨ 원문은 "차액을 차감"이나 전개하면 min[]과 동치다:
 *   m = min(보상액, 보상기초),  m < A 이면 A − (A − m) = m,  m ≥ A 이면 차감 없음
 *   ∴ 양도당시 기준시가 = min(A, 보상액, 보상기초)
 *
 * ⚠️ **근거 정정(2026-07-16)**: 종전 주석은 이 특례를 "집행기준 99-164-12"로 인용하고 **토지 전용**
 *    이라 단정했으나, 둘 다 사실이 아니다.
 *    - 집행기준은 국세청 **행정규칙**이고, 법령 근거는 **시행령 §164⑨**이다(MST 286211 원문 확인).
 *    - §164⑨은 법 §99①1호 **"가목부터 라목까지"** — 토지(가)·건물(나)·오피스텔/상업용 건물(다)·
 *      주택(라) **전부**가 대상이다. 하위 행정규칙이 시행령의 범위를 축소할 수 없다.
 *    ⇒ 이 함수는 **자산 종류를 판정한다**(게이트 5조건 중 1) — `expropriation-scope.ts` 단일 소스 위임.
 *      UI·validate도 같은 파일의 진입점을 쓴다(3층 명시, 계획 Q4·Q7).
 *
 * ⚠️ **§164⑨ 2호(공매·강제경매·저당권실행 경매 → min[기준시가, 공매·경락가액]) 미구현** — 계획 P4.
 *
 * 순수 함수 — 게이트 미충족 시 null(현행 총액 유지, 회귀0).
 * 계획: docs/02-design/features/expropriation-valuation-164-9-scope-expansion.plan.md
 */

import type { TransferTaxInput } from "./types/transfer.types";
import {
  isExprValuationEligiblePropertyType,
  EXPR_VALUATION_MIN_TRANSFER_DATE,
} from "./expropriation-scope";

/** 산출근거 — Map 금지(JSON 소실), Record로 노출 */
export interface ExpropriationValuationDetail {
  /** 원/㎡ 3후보 */
  perSqmCandidates: { standard: number; compensation: number; basis: number };
  /** 적용값 = min(3) */
  chosenPerSqm: number;
  /** 양도 면적 (㎡) */
  area: number;
  /** 환산 분모(총액) = chosenPerSqm × area (floor) */
  denominator: number;
}

export interface ExpropriationValuationParams {
  /**
   * 자산 종류 — §164⑨은 법 §99①1호 **가목~라목**만 대상(§99①2호 권리는 제외).
   * 판정은 `expropriation-scope.ts` 단일 소스 위임.
   *
   * ⚠️ **필수(optional 아님)** — optional로 두면 신규 호출부가 빠뜨려도 tsc가 못 잡고
   *    게이트가 조용히 부적격 처리해 **특례가 소리 없이 죽는다**. 이 특례는 이미
   *    "호출부가 1곳뿐이라 5개 경로가 우회"한 전례가 있다(계획 §3-0) — 같은 실수를 타입으로 막는다.
   */
  propertyType: TransferTaxInput["propertyType"];
  useEstimatedAcquisition?: boolean;
  transferCause?: "general" | "public_expropriation";
  transferDate: Date;
  /** 양도시 기준시가 (원/㎡) */
  standardPricePerSqmAtTransfer?: number;
  /** 양도 면적 (㎡) */
  transferArea?: number;
  /** 보상가액 (원/㎡) */
  compensationPerSqm?: number;
  /** 보상산정 기초 기준시가 (원/㎡) */
  compensationBasisStdPrice?: number;
}

/**
 * 특례 적용 하한 — 양도(수용) 시점 기준.
 *
 * ⚠️ **근거 정정(2026-07-16)**: 종전 주석은 이 날짜를 "집행기준 99-164-12 시행 기준일"이라 했으나
 *    집행기준은 국세청 **행정규칙**이고, 법령 근거는 시행령 §164⑨이다. 종전 근거 표기는 폐기한다.
 *
 * **이 날짜를 유지하는 이유 (보수적 선택)**:
 *   이 모듈이 구현한 **3후보 min[]**은 §164⑨의 **현행 문언**(1호 "보상액과 보상액 산정의 기초가 되는
 *   기준시가 **중 적은 금액**" = 2후보 + 기준시가 자신)에 대응한다. **과거 시점 문언은 확인하지 못했다**
 *   (아래 ⚠️). 확인되지 않은 구법에 현행 3후보 모델을 적용하는 것은 위험하므로, **현행 문언이 확실히
 *   적용되는 구간으로 한정**한다.
 *
 * ⇒ 2009.02.04 이전 양도분은 **미지원**이다 — 이는 "특례가 없다"는 판단이 **아니라** "구법 문언을
 *   확인하지 못해 지원하지 않는다"는 뜻이다(정합이 아니라 **알려진 갭**). 계획 §11-X3(별건).
 *
 * ⚠️ **미검증 (추정 금지 — 확인되면 이 주석을 갱신할 것)**:
 *   1. **이 날짜 자체의 법령 근거** — §164⑨의 신설·개정 시점을 법제처 원문으로 **확인하지 못했다**.
 *      과거 시점 조회(`efYd`)·연혁 MST 조회가 모두 NOT_FOUND다.
 *   2. **부칙 적용례** — "이 영 시행 후 최초로 양도하는 분부터" 등 문언 미확보. 양도일 기준 게이트가
 *      자연스러운 해석이나 **원문 미검증**이다.
 *   3. **과거 시점 문언의 대상·후보 구조** — 미확인.
 *
 * ✅ **원문 확인됨**: 현행 §164⑨(법제처 MST 286211) — 대상은 법 §99①1호 **"가목부터 라목까지"**
 *    (토지·건물·오피스텔/상업용 건물·주택 **전부**), 1호 수용(3후보 min[]), 2호 공매·경락(미구현 — 계획 P4).
 */
const MIN_TRANSFER_DATE = new Date(EXPR_VALUATION_MIN_TRANSFER_DATE);

export function applyExpropriationValuation(
  p: ExpropriationValuationParams,
): { denominator: number; detail: ExpropriationValuationDetail } | null {
  const perSqm = p.standardPricePerSqmAtTransfer ?? 0;
  const comp = p.compensationPerSqm ?? 0;
  const basis = p.compensationBasisStdPrice ?? 0;
  const area = p.transferArea ?? 0;

  // 게이트 (5조건 AND) — 미충족 시 null(현행 총액 유지)
  // ⚠️ 자산종류 축은 UI·validate와 **동일 소스**(expropriation-scope.ts)를 쓴다 — 여기서
  //    목록을 재구현하면 3층 드리프트가 재발한다(계획 Q4·Q7).
  if (
    !isExprValuationEligiblePropertyType(p.propertyType) ||
    // 주택(라목)은 개별주택가격이 **총액**이라 per-sqm 트랙 대상이 아니다 → 총액 트랙
    // (`applyHousingExpropriationValuation`) 전용. land→housing 전환 시 stale per-sqm 값이
    // 주택 총액 트랙을 침묵 shadowing하는 것을 원천 차단(코드리뷰 2026-07-16).
    p.propertyType === "housing" ||
    !p.useEstimatedAcquisition ||
    p.transferCause !== "public_expropriation" ||
    p.transferDate < MIN_TRANSFER_DATE ||
    perSqm <= 0 ||
    comp <= 0 ||
    basis <= 0 ||
    area <= 0
  ) {
    return null;
  }

  const chosenPerSqm = Math.min(perSqm, comp, basis);
  // 면적 반올림 UI 일치(feedback_area_rounding_consistency) 후 곱, floor
  const area2 = parseFloat(area.toFixed(2));
  const denominator = Math.floor(chosenPerSqm * area2);

  return {
    denominator,
    detail: {
      perSqmCandidates: { standard: perSqm, compensation: comp, basis },
      chosenPerSqm,
      area: area2,
      denominator,
    },
  };
}

// ============================================================
// §164⑨ 2호 — 공매·경락 (총액 2후보). 1호와 배타(N3).
// ============================================================

/**
 * §164⑨ 2호 산출근거 — Record로 노출(Map 금지, JSON 소실).
 *
 * 1호(`ExpropriationValuationDetail`)와 **다른 타입**: 2호는 총액 2후보라 원/㎡·면적 개념이 없다.
 */
export interface AuctionValuationDetail {
  /** 양도당시 기준시가 총액 (법 §99①1호 가~라목 가액) */
  standardTotal: number;
  /** 그 공매 또는 경락가액 (낙찰 총액) */
  auctionPrice: number;
  /** 적용값 = min(기준시가 총액, 공매·경락가액) */
  chosen: number;
  /** 환산 분모(총액) = chosen */
  denominator: number;
}

export interface AuctionValuationParams {
  /** 자산 종류 — §164⑨은 법 §99①1호 가~라목만 대상(§99①2호 권리 제외). 필수(1호와 동일 이유). */
  propertyType: TransferTaxInput["propertyType"];
  useEstimatedAcquisition?: boolean;
  /** §164⑨2호 대상(공매·경락). 1호(transferCause)와 배타. */
  isAuctionTransfer?: boolean;
  transferDate: Date;
  /** 양도당시 기준시가 총액 (원) */
  standardTotalAtTransfer?: number;
  /** 공매·경락가액 (총액, 원) */
  auctionPrice?: number;
}

/**
 * §164⑨ 2호 공매·경락 특례 — 양도당시 기준시가 총액을 min(기준시가, 공매·경락가액)으로 낮춘다.
 *
 * 2호 유도: 후보가 "그 공매 또는 경락가액" **하나**뿐("중 적은 금액" 문언 없음) →
 *   차액 = A − min(A, 공매경락)  ⇒  양도당시 기준시가 = min(A, 공매경락)  (2후보).
 *
 * 순수 함수 — 게이트 미충족 시 null(현행 총액 유지). 게이트는 1호와 동일(적격 자산·환산·2009.02.04)
 * 하되 **`isAuctionTransfer`**로 진입(수용 아님). 1호와 배타는 호출부가 보장(exprVal 우선).
 */
export function applyAuctionValuation(
  p: AuctionValuationParams,
): { denominator: number; detail: AuctionValuationDetail } | null {
  const standardTotal = p.standardTotalAtTransfer ?? 0;
  const auction = p.auctionPrice ?? 0;

  if (
    !isExprValuationEligiblePropertyType(p.propertyType) ||
    !p.useEstimatedAcquisition ||
    !p.isAuctionTransfer ||
    p.transferDate < MIN_TRANSFER_DATE ||
    standardTotal <= 0 ||
    auction <= 0
  ) {
    return null;
  }

  const chosen = Math.min(standardTotal, auction);
  return {
    denominator: chosen,
    detail: { standardTotal, auctionPrice: auction, chosen, denominator: chosen },
  };
}

// ============================================================
// §164⑨ 1호 — 주택(라목) 총액 트랙. 개별주택가격은 총액이라 원/㎡ 분해가 없다.
// ============================================================

/**
 * 주택 §164⑨ 1호 산출근거 (총액 3후보) — Record(Map 금지).
 * per-sqm 1호(`ExpropriationValuationDetail`)와 **다른 타입**: 주택은 원/㎡·면적 개념이 없다.
 */
export interface HousingExpropriationValuationDetail {
  /** 개별주택가격·공동주택가격 총액 (법 §99①1호 라목 가액) */
  standardTotal: number;
  /** 보상액 총액 */
  compensationTotal: number;
  /** 보상액 산정의 기초가 되는 기준시가 총액 */
  compensationBasisTotal: number;
  /** 적용값 = min(3) */
  chosen: number;
  /** 환산 분모(총액) = chosen */
  denominator: number;
}

export interface HousingExpropriationValuationParams {
  /** 자산 종류 — 주택(라목, propertyType==="housing")만 이 총액 트랙 진입. 필수. */
  propertyType: TransferTaxInput["propertyType"];
  useEstimatedAcquisition?: boolean;
  /** 양도원인 — 수용(1호). 2호(공매·경락)와 배타. */
  transferCause?: "general" | "public_expropriation";
  transferDate: Date;
  /** 개별주택가격·공동주택가격 총액 (원) */
  standardTotalAtTransfer?: number;
  /** 보상액 총액 (원) */
  compensationTotal?: number;
  /** 보상액 산정 기초 기준시가 총액 (원) */
  compensationBasisTotal?: number;
}

/**
 * 주택 §164⑨ 1호 특례(총액 3후보) — 양도당시 기준시가 총액을
 * min(개별주택가격, 보상액, 보상기초 기준시가)으로 낮춘다.
 *
 * per-sqm 1호는 주택에서 `perSqm<=0`/`area<=0` 게이트로 자연히 막히므로(주택은 총액) 배타는 자동.
 * 순수 함수 — 게이트 미충족 시 null(현행 총액 유지).
 */
export function applyHousingExpropriationValuation(
  p: HousingExpropriationValuationParams,
): { denominator: number; detail: HousingExpropriationValuationDetail } | null {
  const standardTotal = p.standardTotalAtTransfer ?? 0;
  const comp = p.compensationTotal ?? 0;
  const basis = p.compensationBasisTotal ?? 0;

  if (
    p.propertyType !== "housing" ||
    !p.useEstimatedAcquisition ||
    p.transferCause !== "public_expropriation" ||
    p.transferDate < MIN_TRANSFER_DATE ||
    standardTotal <= 0 ||
    comp <= 0 ||
    basis <= 0
  ) {
    return null;
  }

  const chosen = Math.min(standardTotal, comp, basis);
  return {
    denominator: chosen,
    detail: { standardTotal, compensationTotal: comp, compensationBasisTotal: basis, chosen, denominator: chosen },
  };
}

// ============================================================
// 통합 진입점 — 환산 분모(양도시 기준시가) 확정 (1호·2호 배타)
// ============================================================

/**
 * 환산취득가 분모(양도당시 기준시가)를 §164⑨ 특례로 확정한다 — 단건 경로 공용.
 *
 * **1호(수용) 우선, 없으면 2호(공매·경락), 없으면 현행 총액**(N3 배타를 여기서 보장).
 * 미충족 시 `input.standardPriceAtTransfer`(현행) 반환 → 회귀 0.
 */
export function resolveConversionDenominatorAtTransfer(input: TransferTaxInput): {
  denominator: number;
  expropriationValuationDetail?: ExpropriationValuationDetail;
  housingExpropriationValuationDetail?: HousingExpropriationValuationDetail;
  auctionValuationDetail?: AuctionValuationDetail;
} {
  // 1호 per-sqm (토지·건물) — 주택은 perSqm/area 게이트로 자연 배제
  const exprVal = applyExpropriationValuation({
    propertyType: input.propertyType,
    useEstimatedAcquisition: input.useEstimatedAcquisition,
    transferCause: input.transferCause,
    transferDate: input.transferDate,
    standardPricePerSqmAtTransfer: input.standardPricePerSqmAtTransfer,
    transferArea: input.transferArea,
    compensationPerSqm: input.compensationPerSqm,
    compensationBasisStdPrice: input.compensationBasisStdPrice,
  });
  // 1호 주택 총액(라목) — per-sqm 1호가 발동하지 않은 경우에만(자산종류 배타)
  const housingExpr = exprVal
    ? null
    : applyHousingExpropriationValuation({
        propertyType: input.propertyType,
        useEstimatedAcquisition: input.useEstimatedAcquisition,
        transferCause: input.transferCause,
        transferDate: input.transferDate,
        standardTotalAtTransfer: input.standardPriceAtTransfer,
        compensationTotal: input.housingCompensationTotal,
        compensationBasisTotal: input.housingCompensationBasisTotal,
      });
  // 2호 공매·경락 — 1호(per-sqm·주택 총액)가 모두 미발동한 경우에만(N3 배타)
  const auctionVal = exprVal || housingExpr
    ? null
    : applyAuctionValuation({
        propertyType: input.propertyType,
        useEstimatedAcquisition: input.useEstimatedAcquisition,
        isAuctionTransfer: input.isAuctionTransfer,
        transferDate: input.transferDate,
        standardTotalAtTransfer: input.standardPriceAtTransfer,
        auctionPrice: input.auctionPrice,
      });
  return {
    denominator:
      exprVal?.denominator ??
      housingExpr?.denominator ??
      auctionVal?.denominator ??
      (input.standardPriceAtTransfer ?? 0),
    expropriationValuationDetail: exprVal?.detail,
    housingExpropriationValuationDetail: housingExpr?.detail,
    auctionValuationDetail: auctionVal?.detail,
  };
}

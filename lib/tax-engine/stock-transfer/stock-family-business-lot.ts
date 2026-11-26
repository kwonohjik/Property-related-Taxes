/**
 * 주식 양도 — 가업상속공제 자산 취득가액 특례(소득세법 §97의2④)의 **취득 lot 단위** 계산 leaf
 *
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7.7 (L-a ~ L-g)
 *
 * 단건(`stock-family-business.ts`)은 종목 전체를 한 번에 의제하지만, lot 경로는 **매도에 배정된 주식수(m)** 마다
 * sub-lot 취득원가를 따로 낸다 — 가업 lot이 일부만 팔리거나 두 매도에 나뉘어 팔릴 수 있어서다.
 *
 *   buyCost(m) = ⌊(피상속인 1주당 × m + capex(m)) × n ÷ d⌋ + ⌊평가 1주당 × m × (d − n) ÷ d⌋
 *   capex(m)   = ⌊자본적지출 총액 × m ÷ lot 주식수⌋          — 기존 lot 자본적지출 배정(`accrueLotCarryoverExpense`, V-11)과 같다
 *
 * m = lot 전체이면 단건과 같은 값이다(단건 ≡ lot 1개 전량 양도). 1주당으로 나누면 항별 절사가 사라지므로
 * sub-lot은 **총액**(`buyCost`)을 따로 들고, 1주당 값은 표시용이다.
 *
 * 이동평균은 가업 lot의 **정확한 1주당 단가(유리수)**를 가격 트랙에 넣는다(Q-12) — 정수로 먼저 절사하면
 * 평균이 1원 낮아져 그 1원이 매도 주식수만큼 곱해진다(`moving-avg-exact-rational.anchor.test.ts`와 같은 이유).
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음.
 */

import type { AcquisitionLot } from "./types/stock-transfer.types";
import type {
  StockFamilyBusinessLotEcho,
  StockFamilyBusinessLotSummary,
} from "./types/stock-family-business.types";
import { basisToFraction, familyBusinessRateBasisError, type FamilyBusinessRateBasis } from "../family-business-applied-rate";
import { isFamilyBusinessCgtEra, isFamilyBusinessAssetScopeDecreeEra } from "../data/family-business-cgt-era";
import { STOCK_FAMILY_BUSINESS } from "../legal-codes/stock-family-business";
import { frac, type Frac } from "./exact-fraction";

const isPosInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
const isNonNegInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** 엔진 진입 throw 공통 접두 — 단건과 같다 */
export function fbFail(msg: string): never {
  throw new Error(`가업상속공제(${STOCK_FAMILY_BUSINESS.IMPUTED_ACQUISITION_PRICE}) — ${msg}`);
}

/**
 * 법정량 종류가 **양도일** 시대와 맞는지 — 어긋나면 문구, 맞으면 null.
 * 구 ③(공제금액 ÷ 가업상속 재산가액)은 2026.2.26.까지, 신 ③2호(법인 총자산가액)는 2026.2.27.부터다(부칙 대통령령 제36129호 §10).
 * 단건과 lot이 같은 함수를 쓴다.
 */
export function fbBasisEraError(basis: FamilyBusinessRateBasis, transferDate: Date): string | null {
  const newDecree = isFamilyBusinessAssetScopeDecreeEra(transferDate);
  if (newDecree === (basis.kind === "corporate_business_assets")) return null;
  return newDecree
    ? `양도일이 2026.2.27. 이후이면 적용률은 법인 총자산가액과 사업무관자산가액으로 계산합니다(${STOCK_FAMILY_BUSINESS.APPLIED_RATE_CORPORATE_ASSETS}).`
    : "양도일이 2026.2.26. 이전이면 적용률은 가업상속공제금액과 가업상속 재산가액으로 계산합니다(구 소득세법 시행령 §163의2③).";
}

/** G-1 — 상속개시일(lot 취득일)이 2014.1.1. 이후인 가업 lot만 특례가 걸린다(부칙 법률 제12169호 §12) */
export function isActiveFbLot(lot: AcquisitionLot): boolean {
  return lot.familyBusinessInheritance !== undefined && isFamilyBusinessCgtEra(lot.acquisitionDate);
}

/**
 * lot 입력 불변식(L-a) — 위반이면 throw. route는 ⑨⑩⑫가 먼저 막고, 엔진 직접 호출에서 조용히 틀린 값을 내지 않게 한다.
 * lot이 `familyBusinessInheritance`를 갖지 않으면 아무것도 하지 않는다.
 */
export function assertFbLotInput(lot: AcquisitionLot): void {
  const fb = lot.familyBusinessInheritance;
  if (!fb) return;
  const tag = `매수 lot(${lot.id ?? "?"})`;
  if (lot.acquisitionCause !== "inheritance") fbFail(`${tag} — 취득원인이 상속인 lot에만 적용합니다.`);
  if (!isPosInt(lot.shareCount)) fbFail(`${tag} — 주식수는 0보다 큰 정수여야 합니다.`);
  if (!isNonNegInt(lot.perShareAcquisitionPrice)) fbFail(`${tag} — 상속개시일 평가액(1주당)은 0 이상의 원 단위 금액이어야 합니다.`);
  if (!isPosInt(fb.decedentAcquisitionPricePerShare)) fbFail(`${tag} — 피상속인의 1주당 취득가액은 0보다 큰 원 단위 금액이어야 합니다.`);
  if (fb.decedentCapitalExpenditure !== undefined && !isNonNegInt(fb.decedentCapitalExpenditure))
    fbFail(`${tag} — 피상속인 자본적지출은 0 이상의 원 단위 금액이어야 합니다.`);
  const basisError = familyBusinessRateBasisError(fb.fbRateBasis, undefined);
  if (basisError) fbFail(`${tag} — ${basisError}`);
}

/** lot 1주당 정확 단가의 분자·분모 재료 — 정수 BigInt */
function lotFractionParts(lot: AcquisitionLot) {
  const fb = lot.familyBusinessInheritance!;
  const { numerator, denominator } = basisToFraction(fb.fbRateBasis);
  return {
    n: BigInt(numerator),
    d: BigInt(denominator),
    perD: BigInt(fb.decedentAcquisitionPricePerShare),
    capex: BigInt(fb.decedentCapitalExpenditure ?? 0),
    value: BigInt(lot.perShareAcquisitionPrice),
    shares: BigInt(lot.shareCount),
    rate: numerator / denominator,
  };
}

export interface FbSubLotCost {
  /** sub-lot 의제 취득원가 총액 */
  buyCost: number;
  /** 표시용 1주당 = ⌊buyCost ÷ m⌋ */
  perShare: number;
  decedentPart: number;
  valuationPart: number;
  capex: number;
}

/**
 * 가업 lot에서 m주가 배정된 sub-lot의 의제 취득원가. 활성 가업 lot(G-1 통과)이 아니면 undefined — 호출부는 종전 경로를 탄다.
 * 적용률 법정량 시대는 **그 매도의 양도일**(`saleDate`)로 판정하고 어긋나면 throw한다(L-b).
 */
export function fbSubLotCost(lot: AcquisitionLot, m: number, saleDate: Date): FbSubLotCost | undefined {
  if (!isActiveFbLot(lot) || m <= 0) return undefined;
  assertFbLotInput(lot);
  const eraError = fbBasisEraError(lot.familyBusinessInheritance!.fbRateBasis, saleDate);
  if (eraError) {
    fbFail(`매수 lot(${lot.id ?? "?"})이 배정된 매도(${saleDate.toISOString().slice(0, 10)})와 적용률 법정량 종류가 맞지 않습니다 — ${eraError}`);
  }
  const p = lotFractionParts(lot);
  const bm = BigInt(m);
  const capex = p.capex > 0n ? (p.capex * bm) / p.shares : 0n;
  const term1 = ((p.perD * bm + capex) * p.n) / p.d;
  const term2 = (p.value * bm * (p.d - p.n)) / p.d;
  const buyCost = term1 + term2;
  return {
    buyCost: Number(buyCost),
    perShare: Number(buyCost / bm),
    decedentPart: Number(p.perD * bm),
    valuationPart: Number(p.value * bm),
    capex: Number(capex),
  };
}

/**
 * 가업 lot의 **정확한 1주당 단가**(유리수) — 이동평균 가격 트랙용(L-d).
 *   [(피상속인 1주당 × S + capex) × n + 평가 1주당 × S × (d − n)] ÷ (d × S),  S = lot 주식수
 * 적용률 법정량 시대는 호출부가 그 매도의 양도일로 `assertFbEraForSale`을 먼저 건다.
 */
export function fbLotUnitPrice(lot: AcquisitionLot): Frac {
  const p = lotFractionParts(lot);
  return frac((p.perD * p.shares + p.capex) * p.n + p.value * p.shares * (p.d - p.n), p.d * p.shares);
}

/** 이동평균 풀에 가업 lot이 들어간 매도 — 그 매도의 양도일로 법정량 시대를 확인한다(L-b) */
export function assertFbEraForSale(lot: AcquisitionLot, saleDate: Date): void {
  assertFbLotInput(lot);
  const eraError = fbBasisEraError(lot.familyBusinessInheritance!.fbRateBasis, saleDate);
  if (eraError) {
    fbFail(`매수 lot(${lot.id ?? "?"})이 포함된 이동평균 매도(${saleDate.toISOString().slice(0, 10)})와 적용률 법정량 종류가 맞지 않습니다 — ${eraError}`);
  }
}

// ============================================================
// 배정 요약 누적기 — 매칭 3종이 공유한다(sub-lot이 만들어지는 모든 지점에서 한 번씩)
// ============================================================

interface FbLotAcc {
  shares: number;
  decedentPart: number;
  valuationPart: number;
  capex: number;
  buyCost: number;
}

export interface FbAcc {
  pooled: boolean;
  byLot: Map<AcquisitionLot, FbLotAcc>;
}

export const newFbAcc = (pooled: boolean): FbAcc => ({ pooled, byLot: new Map() });

/** 매칭 3종 공용 — 활성 가업 lot이면 요약에 더한다(이동평균은 FIFO 물량 트랙에서 부른다) */
export function addFb(acc: FbAcc, lot: AcquisitionLot, m: number, cost: FbSubLotCost): void {
  const cur = acc.byLot.get(lot) ?? { shares: 0, decedentPart: 0, valuationPart: 0, capex: 0, buyCost: 0 };
  cur.shares += m;
  cur.decedentPart += cost.decedentPart;
  cur.valuationPart += cost.valuationPart;
  cur.capex += cost.capex;
  cur.buyCost += cost.buyCost;
  acc.byLot.set(lot, cur);
}

/** 가업 lot이 하나도 배정되지 않았으면 undefined */
export function buildFbSummary(acc: FbAcc): StockFamilyBusinessLotSummary | undefined {
  if (acc.byLot.size === 0) return undefined;
  const lots: StockFamilyBusinessLotEcho[] = [];
  for (const [lot, v] of acc.byLot) {
    const fb = lot.familyBusinessInheritance!;
    const { numerator, denominator } = basisToFraction(fb.fbRateBasis);
    lots.push({
      ...(lot.id !== undefined ? { lotId: lot.id } : {}),
      ...v,
      appliedRate: numerator / denominator,
      appliedRateBasis: fb.fbRateBasis,
      decedentAcquisitionPricePerShare: fb.decedentAcquisitionPricePerShare,
    });
  }
  const sum = (k: "shares" | "decedentPart" | "valuationPart" | "capex" | "buyCost") => lots.reduce((s, l) => s + l[k], 0);
  return {
    pooled: acc.pooled,
    shares: sum("shares"),
    decedentPart: sum("decedentPart"),
    valuationPart: sum("valuationPart"),
    capex: sum("capex"),
    buyCost: sum("buyCost"),
    lots,
  };
}

/** 이동평균 선택 시 고지 — 가업상속 주식과 다른 주식의 단가가 평균에 섞인다(Q-12) */
export const FB_MOVING_AVG_NOTICE =
  `이동평균법은 가업상속 주식(${STOCK_FAMILY_BUSINESS.IMPUTED_ACQUISITION_PRICE} 의제 취득가액)과 다른 주식의 단가를 평균한다 — 가업상속공제 주식의 구분 관리 여부 확인 필요.`;

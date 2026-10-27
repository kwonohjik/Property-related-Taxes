/**
 * 이월과세(소득세법 §97의2) × 당초 증여 때 인수한 채무 부분(매입분) — 시나리오 A **조각 규칙** (순수 leaf).
 *
 * 당초 증여가 부담부증여였고 수증자(지금의 양도자)가 채무를 인수했으면, 시나리오 A에서 자산을 둘로 나눈다.
 * - 증여분(1 − r): 당초 증여자 기준 — 증여자 취득가액 × (1 − r) · 증여자 취득일 · 증여세 상당액 · 증여자 자본적지출(전액).
 * - 매입분(r): 취득가액 = 채무 · 취득일 = 증여 등기접수일. 「소득세법」 제88조 제1호 후단(부담부증여 채무액 부분은 양도) ·
 *   「소득세법 시행령」 제162조 제1항 제5호(증여 취득시기 = 증여를 받은 날). 나누는 비율(r = 채무 ÷ 증여 당시 평가액)은 법문에 없고 사용자 결정이다.
 * 양도가액·양도자 본인 자본적지출·양도비는 r로 나눈다(곱셈은 증여분, 매입분은 「전체 − 증여분」 — 합이 원값).
 *
 * 매입분은 **이월과세 B 시나리오 입력 빌더(`buildInputB`)로 만든다** — 세대 통산(`giftHouseholdBasis`)·주택수 제외 취득일 같은 B 쪽 규칙이 따로 복제되지 않는다
 * (손조립하면 증여분만 1세대1주택 비과세로 판정되는 조합이 격자 180셋 중 24건 나왔다).
 *
 * 설계서 `docs/02-design/features/carryover-gift-debt-purchased-part.engine.design.md` §3.
 * Layer 2 순수 함수 — DB 호출 없음. 집계 파생 단위(`transfer-tax-aggregate-debt-units.ts`)가 쓴다.
 */

import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { safeMultiplyThenDivide } from "./tax-utils";
import { purchasedPartIdOf } from "./general-building-share-id";
import { buildInputB } from "./transfer-tax-carryover-inputs";
import type { TransferTaxInput } from "./types/transfer.types";
import type { CarryoverTaxationInput } from "./types/transfer-carryover.types";
import type { TransferTaxItemInput } from "./types/transfer-aggregate.types";

/** r = debt ÷ valuation. `keep`은 (1 − r)의 분자(valuation − debt). */
export interface CarryoverDebtShare {
  debt: number;
  valuation: number;
  keep: number;
}

const WIRE_PATH = "carryoverTaxation.giftAssumedDebt";

function invalid(message: string): never {
  throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, message, { path: WIRE_PATH });
}

/**
 * 채무 입력 → 비율. `null` = 조각 없음(채무 0·미입력 — 현행 세액 그대로).
 * 채무 > 평가액 · 평가액 ≤ 0 · 음수·비정수 → INVALID_INPUT.
 */
export function carryoverDebtShareOf(
  ct: Pick<CarryoverTaxationInput, "giftAssumedDebt" | "giftDateValuation"> | undefined,
): CarryoverDebtShare | null {
  const debt = ct?.giftAssumedDebt;
  if (debt === undefined || debt === null || debt === 0) return null;
  const valuation = ct!.giftDateValuation;
  if (!Number.isInteger(debt) || debt < 0) invalid("당초 증여 때 인수한 채무는 0 이상의 정수여야 합니다.");
  if (!(valuation > 0)) invalid("당초 증여 때 인수한 채무를 나누려면 증여 당시 평가액이 필요합니다.");
  if (debt > valuation) invalid("당초 증여 때 인수한 채무가 증여 당시 평가액보다 큽니다.");
  return { debt, valuation, keep: valuation - debt };
}

/** 카드 → 증여분·매입분. `gift`는 r = 1(`keep === 0`)이면 없고, 그때 매입분이 원 카드 id를 쓴다. */
export interface CarryoverDebtPieces {
  gift?: TransferTaxItemInput;
  purchased: TransferTaxItemInput;
}

export function splitCarryoverDebtPieces(card: TransferTaxItemInput, share: CarryoverDebtShare): CarryoverDebtPieces {
  const ct = card.carryoverTaxation;
  if (!ct) invalid("이월과세 서브객체가 없는 카드는 나눌 수 없습니다.");
  const whole = card.totalPropertyTransferPrice ?? card.transferPrice;

  /** 증여분 몫 — floor(x × keep ÷ valuation). 곱이 2^53을 넘으면 BigInt로 계산한다. */
  const cut = (x: number): number => safeMultiplyThenDivide(x, share.keep, share.valuation);
  const cutOpt = (x: number | undefined): number | undefined => (x === undefined ? undefined : cut(x));
  /** 매입분 몫 = 전체 − 증여분 (undefined는 undefined 유지 — §97②2호 단서 swap 활성 조건이 `capitalExpenditure !== undefined`) */
  const rest = (x: number | undefined): number | undefined => (x === undefined ? undefined : x - cut(x));

  const giftPrice = cut(card.transferPrice);
  const purchasedPrice = card.transferPrice - giftPrice;
  if (purchasedPrice <= 0 || (share.keep > 0 && giftPrice <= 0)) invalid("조각의 양도가액이 0원 이하입니다 — 양도가액과 채무 비율을 확인하세요.");

  const baseId = card.propertyId;
  const baseLabel = card.propertyLabel ?? "";
  const purchased = {
    ...buildInputB(
      {
        ...card,
        transferPrice: purchasedPrice,
        totalPropertyTransferPrice: whole,
        expenses: rest(card.expenses ?? 0),
        capitalExpenditure: rest(card.capitalExpenditure),
        transferExpense: rest(card.transferExpense),
      } as unknown as TransferTaxInput,
      ct,
    ),
    acquisitionPrice: share.debt,
    propertyId: share.keep === 0 ? baseId : purchasedPartIdOf(baseId),
    propertyLabel: `${baseLabel}(매입분)`,
    // 1세대1주택 단위(집 카드 1장 전제)는 증여분 카드가 이어받는다 — 매입분은 단위에 끼지 않는다.
    oneHouseUnitRole: undefined,
  } as unknown as TransferTaxItemInput;
  if (share.keep === 0) return { purchased };

  const estimated = ct.useEstimatedAcquisition === true;
  const gift: TransferTaxItemInput = {
    ...card,
    propertyLabel: `${baseLabel}(증여분)`,
    transferPrice: giftPrice,
    totalPropertyTransferPrice: whole,
    expenses: cut(card.expenses ?? 0),
    capitalExpenditure: cutOpt(card.capitalExpenditure),
    transferExpense: cutOpt(card.transferExpense),
    // 증여자 환산: 취득가액은 양도가 × 취득시 ÷ 양도시 기준시가라 비율이 보존되고, 개산공제(취득시 기준시가 × 3%)만 증여분 몫으로 줄어든다.
    ...(estimated
      ? { standardPriceAtAcquisition: cutOpt(card.standardPriceAtAcquisition), standardPriceAtTransfer: cutOpt(card.standardPriceAtTransfer) }
      : {}),
    carryoverTaxation: {
      ...ct,
      donorAcquisitionPrice: cutOpt(ct.donorAcquisitionPrice),
      giftDateValuation: share.keep,
      giftAssumedDebt: undefined,
    },
  };
  return { gift, purchased };
}

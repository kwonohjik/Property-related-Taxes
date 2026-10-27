/**
 * ⑭ 주택 split 파트 이월과세 — 와이어(증여 사건 1벌 + 파트 N벌) → 엔진 input(`landCarryoverTaxation`·`buildingCarryoverTaxation`) 합성기. 순수.
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.engine.design.md §1.4
 *
 * UI(④)는 「사건 + 파트」로 보내고 엔진은 「파트마다 완결된 객체」(`CarryoverTaxationInput`)를 읽는다. 그 간극을 여기서 메운다 —
 * 일반건물이 같은 이유로 `composeGbCarryover`(`general-building-entry.ts`)를 둔 선례를 따른다.
 *
 * 🔑 **Date 변환은 여기서만 한다**(⑭ 규약). 문자열이 엔진에 닿으면 `Date < string` 침묵 false로 §97의2③ 기간 비교·§95④ 단서 기산이 오작동한다.
 *
 * 🔑 증여세 상당액은 영 §163의2②로 **안분**한다(`apportionGiftTax`: 산출세액 × 파트 평가액 ÷ 과세가액, floor). 한도(그 파트 양도차익)는
 *    여기서 걸지 않는다 — 양도차익은 해결자(`calcSplitCarryoverScenarios`)만 안다. 파트 평가액(`giftDateValuation`)은 기존
 *    `landAcquisitionPrice`·`buildingAcquisitionPrice`가 정본이며 안분 분자와 미적용(B) 취득가액을 겸한다.
 */
import { toDate } from "@/lib/api/date-coerce";
import { toEngineDonorBuilt } from "@/lib/api/donor-built-engine-input";
import type { DonorBuiltWire } from "@/lib/api/transfer-tax-schema-donor-built";
import { apportionGiftTax } from "./carryover-gift-tax-apportion";
import { giftTaxedValue } from "./carryover-gift-tax-apportion";
import type { CarryoverTaxationInput } from "./types/transfer-carryover.types";
import type { TransferTaxInput } from "./types/transfer.types";

interface SplitCarryoverWireEvent {
  giftRegistryDate: string;
  giftTaxCalculated: number;
  giftTaxBase: number;
  donorRelation?: "spouse" | "lineal" | "other";
  donorDeceased?: boolean;
  exclusionDeclared?: CarryoverTaxationInput["exclusionDeclared"];
  // P5 §97의2②2호 — 1세대1주택 판정 사실. 건물(주택)이 이월과세일 때만(B·C) 건물 파트에 싣는다(⑫가 A의 stray를 막는다).
  donorSameHouseholdContinuous?: boolean;
  donorHouseholdHoldingStartDate?: string;
  donorPriorHouseholdResidenceMonths?: number;
  donorRejoinedAfterDivorce?: boolean;
  /** 배우자 예외 — 주택 통째 증여(C)만(⑫가 한 파트만이면 막는다) */
  spouseGiftOneHouseAtGiftDate?: boolean;
}

interface SplitCarryoverWirePart {
  donorAcquisitionDate: string;
  /** 실가 입력 — 환산(`useEstimatedAcquisition`)이면 없다(⑫ refine이 상호배타를 강제) */
  donorAcquisitionPrice?: number;
  /** P6 — 증여자 취득가액을 모를 때 환산취득가액(분자 = `donorStandardPriceAtAcquisition`) */
  useEstimatedAcquisition?: boolean;
  /** 환산 분자 — 증여자 취득 당시 그 파트 기준시가 총액(지분 스케일 없음) */
  donorStandardPriceAtAcquisition?: number;
  donorCapitalExpenditure?: number;
  /** 당초 증여 때 이 파트에 담보된 채무로서 인수한 금액 — 영 §163의2②2호 분자에서만 뺀다(B 취득가액은 파트 평가액 그대로 · `carryover-gift-tax-numerator-net.plan.md`) */
  giftAssumedDebt?: number;
  /**
   * PR-3 — 증여자가 신축·증축한 건물(§114조의2 가산세). 건물 파트만 받는다 — 토지 파트에 오면 엔진이 거부한다(⑫도 막는다).
   * 일체 주택 안분(`housing`)은 split 파트에 필요 없다(파트별 기준시가가 이미 나뉘어 있다).
   */
  donorBuilt?: Omit<DonorBuiltWire, "housing">;
}

export interface SplitCarryoverWire {
  carryoverGiftEvent?: SplitCarryoverWireEvent;
  landCarryoverPart?: SplitCarryoverWirePart;
  buildingCarryoverPart?: SplitCarryoverWirePart;
  /** 파트 평가액 정본 — 안분 분자 + 미적용(B) 취득가액 */
  landAcquisitionPrice?: number;
  buildingAcquisitionPrice?: number;
}

type ComposedSplitCarryover = Pick<
  TransferTaxInput,
  "carryoverGiftEvent" | "landCarryoverTaxation" | "buildingCarryoverTaxation"
>;

export function composeSplitCarryover(d: SplitCarryoverWire): ComposedSplitCarryover {
  const ev = d.carryoverGiftEvent;
  if (!ev) return {}; // 사건 없는 파트 서브객체는 ⑫(leaf S1)가 이미 막았다 — 직접 호출이면 파트 일반으로 둔다(키 부재 = 일반)
  const giftRegistryDate = toDate(ev.giftRegistryDate, "carryoverGiftEvent.giftRegistryDate");

  const compose = (
    part: SplitCarryoverWirePart | undefined,
    giftDateValuation: number | undefined,
    path: string,
  ): CarryoverTaxationInput | undefined => {
    if (!part) return undefined;
    const valuation = giftDateValuation ?? 0;
    // P6 — 파트 환산: 가액 대신 분자를 싣는다(상호배타는 ⑫ refine이 이미 강제했다 — 직접 호출이면 환산이 이긴다).
    const estimated = part.useEstimatedAcquisition === true;
    return {
      giftRegistryDate,
      donorAcquisitionDate: toDate(part.donorAcquisitionDate, `${path}.donorAcquisitionDate`),
      donorAcquisitionPrice: estimated ? undefined : part.donorAcquisitionPrice,
      useEstimatedAcquisition: estimated,
      ...(estimated ? { donorStandardPriceAtAcquisition: part.donorStandardPriceAtAcquisition } : {}),
      // 영 §163의2② 전단 — 한도 前 값. 한도는 해결자가 그 파트 양도차익으로 건다. 분자(2호)는 평가액 − 당초 증여 때 인수한 채무다.
      giftTaxAmount: apportionGiftTax({ giftTaxCalculated: ev.giftTaxCalculated, giftTaxBase: ev.giftTaxBase }, giftTaxedValue(valuation, part.giftAssumedDebt)),
      donorCapitalExpenditure: part.donorCapitalExpenditure,
      ...(part.donorBuilt ? { donorBuilt: toEngineDonorBuilt(part.donorBuilt, `${path}`) } : {}),
      giftDateValuation: valuation,
      ...(part.giftAssumedDebt ? { giftAssumedDebt: part.giftAssumedDebt } : {}),
      // §97의2① 관계요건 — 증여 사건의 사실이라 두 파트에 같은 값이 실린다.
      donorRelation: ev.donorRelation,
      donorDeceased: ev.donorDeceased,
      exclusionDeclared: ev.exclusionDeclared,
    };
  };

  const land = compose(d.landCarryoverPart, d.landAcquisitionPrice, "landCarryoverPart");
  const composed = compose(d.buildingCarryoverPart, d.buildingAcquisitionPrice, "buildingCarryoverPart");
  // 세대 사실·배우자 예외는 주택(건물) 보유의 사실이다 — 1세대1주택 판정(`giftHouseholdBasis`)이 건물 파트에서만 읽는다(P5-Q3·Q4).
  const building = composed && {
    ...composed,
    donorSameHouseholdContinuous: ev.donorSameHouseholdContinuous,
    donorHouseholdHoldingStartDate: ev.donorHouseholdHoldingStartDate
      ? toDate(ev.donorHouseholdHoldingStartDate, "carryoverGiftEvent.donorHouseholdHoldingStartDate")
      : undefined,
    donorPriorHouseholdResidenceMonths: ev.donorPriorHouseholdResidenceMonths,
    donorRejoinedAfterDivorce: ev.donorRejoinedAfterDivorce,
    spouseGiftOneHouseAtGiftDate: ev.spouseGiftOneHouseAtGiftDate,
  };
  if (!land && !building) return {};
  return {
    // 증여 사건 echo — 계산에는 쓰이지 않는다(파트 서브객체가 사건 사실을 이미 싣는다)
    carryoverGiftEvent: { giftRegistryDate, giftTaxCalculated: ev.giftTaxCalculated, giftTaxBase: ev.giftTaxBase },
    ...(land ? { landCarryoverTaxation: land } : {}),
    ...(building ? { buildingCarryoverTaxation: building } : {}),
  };
}

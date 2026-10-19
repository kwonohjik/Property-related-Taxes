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
import { apportionGiftTax } from "./carryover-gift-tax-apportion";
import type { CarryoverTaxationInput } from "./types/transfer-carryover.types";
import type { TransferTaxInput } from "./types/transfer.types";

interface SplitCarryoverWireEvent {
  giftRegistryDate: string;
  giftTaxCalculated: number;
  giftTaxBase: number;
  donorRelation?: "spouse" | "lineal" | "other";
  donorDeceased?: boolean;
  exclusionDeclared?: CarryoverTaxationInput["exclusionDeclared"];
}

interface SplitCarryoverWirePart {
  donorAcquisitionDate: string;
  donorAcquisitionPrice: number;
  donorCapitalExpenditure?: number;
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
    return {
      giftRegistryDate,
      donorAcquisitionDate: toDate(part.donorAcquisitionDate, `${path}.donorAcquisitionDate`),
      donorAcquisitionPrice: part.donorAcquisitionPrice,
      useEstimatedAcquisition: false, // 파트 환산은 없다(I-4) — 증여자 취득가액이 필수다
      // 영 §163의2② 전단 — 한도 前 값. 한도는 해결자가 그 파트 양도차익으로 건다.
      giftTaxAmount: apportionGiftTax({ giftTaxCalculated: ev.giftTaxCalculated, giftTaxBase: ev.giftTaxBase }, valuation),
      donorCapitalExpenditure: part.donorCapitalExpenditure,
      giftDateValuation: valuation,
      // §97의2① 관계요건 — 증여 사건의 사실이라 두 파트에 같은 값이 실린다.
      donorRelation: ev.donorRelation,
      donorDeceased: ev.donorDeceased,
      exclusionDeclared: ev.exclusionDeclared,
    };
  };

  const land = compose(d.landCarryoverPart, d.landAcquisitionPrice, "landCarryoverPart");
  const building = compose(d.buildingCarryoverPart, d.buildingAcquisitionPrice, "buildingCarryoverPart");
  if (!land && !building) return {};
  return {
    // 증여 사건 echo — 계산에는 쓰이지 않는다(파트 서브객체가 사건 사실을 이미 싣는다)
    carryoverGiftEvent: { giftRegistryDate, giftTaxCalculated: ev.giftTaxCalculated, giftTaxBase: ev.giftTaxBase },
    ...(land ? { landCarryoverTaxation: land } : {}),
    ...(building ? { buildingCarryoverTaxation: building } : {}),
  };
}

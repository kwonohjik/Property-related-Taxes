/**
 * 토지가 **사업용·비사업용 초과분 2장**으로 갈릴 때의 이월과세 입력 안분.
 *
 * ## 왜 필요한가
 *
 * 「소득세법」 제104조의3의 초과분 중과는 **하나의 토지**를 세율 목적으로 둘로 나눈 것이지
 * 별개 자산이 되는 것이 아니다. 그런데 두 카드가 각각 단건 엔진을 타므로, 이월과세 입력을
 * **그대로 복사해 주면 금액이 2배**가 된다 — 취득가액(시나리오 A)·증여 당시 평가액(B)·
 * 증여세 상당액이 전부.
 *
 * 실측(종전): 증여자 취득가 5천만·증여 당시 평가 2억·증여세 5천만을 두 카드가 **각각 전액**
 * 받아 합계가 1억·4억·1억이 됐다. 결정세액 18,449,094 vs 올바른 27,155,520 — **과소 8,706,426**.
 *
 * ## 안분 기준
 *
 * 같은 분기에서 양도가액·취득가액·필요경비를 나누는 `apportionLandByBusinessArea`와
 * **같은 술어·같은 인자**를 쓴다. 다른 기준을 쓰면 카드 안에서 분자와 분모가 갈린다
 * (메모리 `feedback_shared_predicate_argument_parity`).
 *
 * 🔑 **비사업용 카드는 잔액을 흡수한다** — 각각 floor하면 합이 입력보다 작아진다
 *    (메모리 `feedback_floor_residual_absorption`). 그래서 `nbl = 전체 − 사업용`이다.
 *
 * ⚠️ **한도(영 §163의2② 후단)는 여기서 손대지 않는다.** 한도는 「**해당 자산**에 대한
 *    양도차익」이고(국세청 **사전-2025-법규재산-0366**), 단건 엔진이 카드별로 이미 적용한다.
 */

import { apportionLandByBusinessArea } from "./general-building-area-apportion";
import type { CarryoverTaxationInput } from "./types/transfer-carryover.types";

/**
 * @param ct           토지 이월과세 입력 (없으면 둘 다 undefined)
 * @param businessArea 사업용 인정면적
 * @param totalArea    토지 전체 면적
 */
export function splitLandCarryover(
  ct: CarryoverTaxationInput | undefined,
  businessArea: number,
  totalArea: number,
): {
  business: CarryoverTaxationInput | undefined;
  nbl: CarryoverTaxationInput | undefined;
} {
  if (!ct) return { business: undefined, nbl: undefined };

  const cut = (v: number) => apportionLandByBusinessArea(v, businessArea, totalArea);

  const bizDonorAcq = cut(ct.donorAcquisitionPrice ?? 0);
  const bizValuation = cut(ct.giftDateValuation);
  const bizGiftTax = cut(ct.giftTaxAmount);
  const bizCapex = cut(ct.donorCapitalExpenditure ?? 0);

  // ⚠️ `undefined`는 「입력 없음」이라 0과 의미가 다르다(환산 경로 분기) — 그대로 남긴다.
  return {
    business: {
      ...ct,
      ...(ct.donorAcquisitionPrice === undefined ? {} : { donorAcquisitionPrice: bizDonorAcq }),
      ...(ct.donorCapitalExpenditure === undefined ? {} : { donorCapitalExpenditure: bizCapex }),
      giftDateValuation: bizValuation,
      giftTaxAmount: bizGiftTax,
    },
    nbl: {
      ...ct,
      ...(ct.donorAcquisitionPrice === undefined
        ? {}
        : { donorAcquisitionPrice: ct.donorAcquisitionPrice - bizDonorAcq }),
      ...(ct.donorCapitalExpenditure === undefined
        ? {}
        : { donorCapitalExpenditure: ct.donorCapitalExpenditure - bizCapex }),
      giftDateValuation: ct.giftDateValuation - bizValuation,
      giftTaxAmount: ct.giftTaxAmount - bizGiftTax,
    },
  };
}

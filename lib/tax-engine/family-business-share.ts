/**
 * 지분 양도 × 가업상속공제 자산(「소득세법」 §97의2④) — 물건 전체 입력을 양도 지분분으로 줄인다.
 *
 * 화면·API는 피상속인 취득가액·상속개시일 평가액·피상속인 자본적지출을 **물건 전체(100%) 기준**으로 받는다
 * (같은 카드의 양도가액·취득가액·양도비와 같은 단위 — 계획서 `transfer-fb-share.engine.plan.md` 최종 결정 Q-1).
 * §97의2④1호 «피상속인의 취득가액»·2호 «상속개시일 현재 해당 자산가액»은 양도한 지분에 대응하는 몫이므로
 * 세 금액에만 지분율을 곱한다. 적용률(소령 §163의2③ — 상속인 단위)·상속개시일은 그대로 둔다.
 *
 * 절사: 항목별 `applyRatio` 선절사(Q-3) — 이 저장소의 지분 적용 단일 규약. 이렇게 하면 «지분 r 카드»가
 * «입력을 `applyRatio(·, r)`한 100% 단건»과 비트 동일하다.
 */
import { applyRatio } from "./tax-utils";
import { TRANSFER } from "./legal-codes";
import type { FamilyBusinessInheritanceTransferInput } from "./types/transfer.types";

export interface FamilyBusinessWholeInput {
  decedentAcquisitionPrice: number;
  inheritanceMarketValue: number;
  decedentCapitalExpenditure?: number;
}

export interface FamilyBusinessShareScaled {
  /** 이후 모든 산식이 쓰는 입력 — 지분이 아니면(r ≥ 1 · 미지정) 입력 객체 그대로 */
  fb: FamilyBusinessInheritanceTransferInput;
  /** 지분율 < 1일 때만 */
  ownershipRatio?: number;
  /** 줄이기 전 물건 전체 입력 — 지분율 < 1일 때만 */
  whole?: FamilyBusinessWholeInput;
}

export function scaleFamilyBusinessInheritanceByShare(
  fb: FamilyBusinessInheritanceTransferInput,
  ownershipRatio: number | undefined,
): FamilyBusinessShareScaled {
  if (ownershipRatio === undefined || !(ownershipRatio < 1)) return { fb };
  const capex = fb.decedentCapitalExpenditure;
  const whole: FamilyBusinessWholeInput = {
    decedentAcquisitionPrice: fb.decedentAcquisitionPrice,
    inheritanceMarketValue: fb.inheritanceMarketValue,
    ...(capex ? { decedentCapitalExpenditure: capex } : {}),
  };
  return {
    fb: {
      ...fb,
      decedentAcquisitionPrice: applyRatio(fb.decedentAcquisitionPrice, ownershipRatio),
      inheritanceMarketValue: applyRatio(fb.inheritanceMarketValue, ownershipRatio),
      ...(capex ? { decedentCapitalExpenditure: applyRatio(capex, ownershipRatio) } : {}),
    },
    ownershipRatio,
    whole,
  };
}

/** 지분 × 가업상속 «확인 필요» 고지(Q-6) — 지분 양도에 §97의2④를 지분 비율로 적용한 직접 해석례는 찾지 못했다(계획서 §1.4). */
export const FB_SHARE_SCALE_NOTICE = `${TRANSFER.CARRYOVER_FAMILY_BUSINESS} 의제 취득가액 — 피상속인 취득가액·상속개시일 평가액·자본적지출(물건 전체 기준 입력)에 양도 지분율을 곱해 계산했습니다. 지분 양도에 이 특례를 적용한 해석례를 찾지 못했으므로 확인이 필요합니다.`;

/**
 * V8-3 / E-5 — 지분율을 곱한 상속개시일 평가액이 0원 이하인가(극소 지분·극소 평가액). 일반 §97 재귀의 취득가액이 0이 되어 양도차익이 폭증한다.
 * 서버가 계산할 수 있는 사실이라 ⑧(화면)과 ⑫(직접 API)가 같은 술어로 막는다(⑧↔⑫ 대칭 · 최종 결정 E-5).
 */
export function familyBusinessShareMarketValueVanishes(
  fb: Pick<FamilyBusinessInheritanceTransferInput, "inheritanceMarketValue">,
  ownershipRatio: number | undefined,
): boolean {
  if (ownershipRatio === undefined || !(ownershipRatio < 1) || !(fb.inheritanceMarketValue > 0)) return false;
  return applyRatio(fb.inheritanceMarketValue, ownershipRatio) <= 0;
}

export const FB_SHARE_MARKET_VALUE_ZERO_MESSAGE =
  "가업상속공제 — 지분율을 곱한 상속개시일 평가액이 0원입니다. 금액(물건 전체 기준)과 지분율을 확인하세요.";

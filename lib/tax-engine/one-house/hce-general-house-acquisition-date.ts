import type { TransferTaxInput } from "../types/transfer.types";
import { resolveHouseCountExclusionAcqDate } from "../transfer-tax-carryover-inputs";
import { resolveHouseCountExclusionDate } from "./gift-household-basis";
import { sameHouseholdInheritanceHoldingStart } from "./same-household-inheritance-start";
import { householdBuildingCarryover, isLandContributedOriginalApt } from "./redev-apt-judgment-input";

/**
 * §99의4①·§98의9①의 「그 주택 취득 전에 보유하던 다른 주택」 판정용 일반주택 취득일 — STEP 0.9·STEP 0.5 공용 (D4-05 · 결정 #33).
 * 다주택 중과 판정 메뉴 route가 계산기와 같은 값을 쓰도록 export한다(계획서 §4.1 단계 9). 근거는 `transfer-tax-precalc.ts` 호출부 주석.
 * §155④⑤ × ⑳ 합가 상대 쪽 임대 경로의 3중첩 가드(`merge-rental-carveout.ts`)도 이 날짜로 주택 수 제외를 본다 — leaf로 둔 이유(2026-11 리뷰 D-72).
 */
export function resolveHceGeneralHouseAcquisitionDate(input: TransferTaxInput): Date {
  return (
    input.houseCountExclusionAcquisitionDate ??
    // #12 — 토지만 출자한 원조합원 신축주택의 취득시기는 사용승인서 교부일이다(영 §162①4호). 비과세 판정 번역과 같은 날짜로 맞춘다.
    //   세대원 건물 출자 통산이면 그 건물 취득일 — §155① 종전주택 취득일과 같은 날짜(Q-B2 사용자 결정 2026-10-26).
    (isLandContributedOriginalApt(input)
      ? (householdBuildingCarryover(input.redevelopment!)?.holdingStart ?? input.redevelopment!.completionDate!)
      : input.carryoverTaxation
        ? resolveHouseCountExclusionAcqDate(input, input.carryoverTaxation)
        : // 동일세대 상속은 「1세대」가 보유한 날 — 피상속인과 동일세대로 보유하기 시작한 날(기준-2017-0222: 같은 세대원 간 이전은 이전한 사람의 취득일 기준).
          (sameHouseholdInheritanceHoldingStart(input) ?? resolveHouseCountExclusionDate(input.acquisitionDate, input.giftHouseholdBasis)))
  );
}

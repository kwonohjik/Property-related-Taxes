/**
 * 보유 주택 명부 행 편집 창(`HouseEntryEditor`)의 **판정 메뉴 노출 범위** (S14a-9).
 *
 * 1세대1주택 비과세 판정 route(`app/api/calc/one-house-exemption/route.ts`)는 중과 엔진을 부르지 않는다.
 * 「소득세법 시행령」 §167의3①(주택 수 산정에서 빼는 호)·§167의10①(중과 배제 열거)은 모두 법 제104조제7항 —
 * 다주택 **중과**의 범위를 정하는 조문이라, 그 칸(조특법 감면주택 5호 칩·준공후미분양 칩·준공일 칸·④ 특수 배제 사유)은
 * 판정 결론에 닿지 않는다. 같은 미분양주택 사실을 ① 5호 칩으로 넣으면 사유 없이 과세, ⑥ 주택 수 제외(조특법
 * §98의2④ 등 — 「소득세법」 §89①3호를 적용할 때 소유주택으로 보지 아니한다)로 넣으면 비과세가 되는데도 5호 칩에는
 * 「조특법 감면」 배지까지 붙었다. 판정 메뉴에는 비과세 축의 입력 경로(⑤·⑥)만 둔다.
 *
 * ## 🔑 ④만은 「담긴 값이 있으면」 연다
 *
 * 5호 칩·준공후미분양·준공일은 켜져 있어도 ⑧·⑫가 요구하는 칸이 없다 — 숨겨도 막다른 길이 생기지 않는다.
 * ④는 다르다. ⑫ `refineHouseExclusionInputs`가 `isUnavoidableReason`이 켜진 행의 거주기간·취득 당시 기준시가를,
 * ⑧(`house-row-required-issues.ts` `houseUnavoidableIssue`)이 그 거울을 요구한다. 칸을 숨긴 뒤 **이미 켜진 값이 남은
 * 저장 상태**(세션 복원·이력 재개)를 만나면 사용자가 끌 화면이 없는데 ⑧이 막는다 — `HousesListSection`의 중과 배제
 * 섹션 게이트(「담긴 값이 있으면 연다」)와 같은 규칙이다. 새 행·값이 없는 행에서는 열지 않는다.
 */
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

type SpecialExclusionFacts = Pick<
  HouseEntry,
  | "isUnavoidableReason"
  | "isLitigationHousing"
  | "isRedevelopmentZone"
  | "isPopulationDeclineArea"
>;

/** ④ 특수 배제 사유 카드가 소유한 사실 중 하나라도 켜져 있는가. */
export function houseEntryHasSpecialExclusionFacts(house: SpecialExclusionFacts): boolean {
  return (
    house.isUnavoidableReason === true ||
    house.isLitigationHousing === true ||
    house.isRedevelopmentZone === true ||
    house.isPopulationDeclineArea === true
  );
}

/** 행 편집 창에 ④ 특수 배제 사유 카드를 그릴지 — 중과 입력을 연 화면은 항상, 닫은 화면(1주택 판정 메뉴)은 담긴 값이 있을 때만. */
export function houseEntrySpecialExclusionVisible(house: SpecialExclusionFacts, hideSurchargeInputs: boolean): boolean {
  return !hideSurchargeInputs || houseEntryHasSpecialExclusionFacts(house);
}

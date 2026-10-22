/**
 * anchor: 판정 메뉴별 입력 화면 플래그 (`lib/calc/judgment-menu-flags.ts`) — 다주택 중과 판정 메뉴 P0.
 *
 * 계획서: docs/00-pm/multi-house-surcharge-judgment-menu.plan.md §5.3 · §8 P0
 *
 * P0은 동작 불변 리팩터다. 종전 1주택 판정 화면의 값은 이렇게 정해졌다:
 *   - Step2가 `hideGracePeriod`·`hideSellingHouseExclusion`·`hideSpouseOwned`·`judgmentMenu`를 true로 넘겼다.
 *   - `HousesListSection`이 편집 창에 `taxIncentiveRentalEnabled={!hideSellingHouseExclusion}`(= false),
 *     `householdGiftEnabled={hideSellingHouseExclusion}`(= true)를 추론해 넘겼다.
 *   - 편집 창의 중과 전용 입력은 `judgmentMenu`(= true)로 닫혔다 → 이제 `hideSurchargeInputs`.
 * 계산기는 아무것도 넘기지 않았다 → 3호 칸 열림 · 증여 질문 닫힘 · 중과 입력 열림(각 prop의 기본값).
 *
 * 화면 동작 자체는 기존 테스트가 지킨다(착수 전 mutation 실측 — 프록시 두 줄을 각각 뒤집으면
 * `tax-incentive-rental-3ho-inputs.test.tsx`·`one-house-contested-dual-view.anchor.test.tsx`가 실패).
 */
import { describe, it, expect } from "vitest";
import { judgmentMenuFlags } from "@/lib/calc/judgment-menu-flags";

describe("judgmentMenuFlags", () => {
  it("one_house — P0 전 1주택 판정 화면의 값과 같다", () => {
    expect(judgmentMenuFlags("one_house")).toEqual({
      hideGracePeriod: true,
      hideSellingHouseExclusion: true,
      hideSpouseOwned: true,
      judgmentMenu: true,
      hideSurchargeInputs: true,
      taxIncentiveRentalEnabled: false,
      householdGiftEnabled: true,
    });
  });

  it("surcharge — 판정 메뉴 문맥은 유지하고 중과 축 입력은 모두 연다", () => {
    expect(judgmentMenuFlags("surcharge")).toEqual({
      hideGracePeriod: false,
      hideSellingHouseExclusion: false,
      hideSpouseOwned: false,
      judgmentMenu: true,
      hideSurchargeInputs: false,
      taxIncentiveRentalEnabled: true,
      householdGiftEnabled: true,
    });
  });
});

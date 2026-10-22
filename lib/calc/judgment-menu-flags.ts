/**
 * 판정 메뉴별 입력 화면 플래그 — 1세대1주택 비과세 판정과 다주택 중과 판정이 같은 단계 화면(`HouseCountExemptionInputs`
 * → `HousesListSection` → `HouseEntryEditor`)을 쓰면서 열고 닫는 칸이 다르다. 그 차이를 **이 표 한 곳**에 둔다.
 *
 * 호출부가 이 값을 개별 prop으로 풀어 넘기고, 하위 컴포넌트는 메뉴를 추론하지 않는다 — 한 플래그에서 다른 축을
 * 추론하면 메뉴가 늘어날 때 조합이 나오지 않는다(`feedback_ui_mode_flag_not_domain_semantics`). 종전에는
 * `HousesListSection`이 `taxIncentiveRentalEnabled`·`householdGiftEnabled`를 `hideSellingHouseExclusion`에서 추론했다.
 *
 * 계획서: docs/00-pm/multi-house-surcharge-judgment-menu.plan.md §5.3 (P0).
 */

export type JudgmentMenu = "one_house" | "surcharge";

export interface JudgmentMenuFlags {
  /** 중과 경과조치(§167의3①12의2 나·다목) 섹션 숨김 */
  hideGracePeriod: boolean;
  /** 양도 주택 전용 중과배제 섹션 숨김 */
  hideSellingHouseExclusion: boolean;
  /** 「양도일 현재 배우자 쪽 보유」 질문(§167의3⑨·§167의4⑤) 숨김 */
  hideSpouseOwned: boolean;
  /** 판정 메뉴 문맥(머리말·확인 토글 없음 · 목록 미입력 = 없음) */
  judgmentMenu: boolean;
  /** 명부 행의 중과 전용 입력(5호·준공후미분양·준공일·소형신축 경고·④ 특수 배제)과 「조특법 감면」 배지 숨김 */
  hideSurchargeInputs: boolean;
  /** 명부 행의 §167의3①3호 감면임대 칸 */
  taxIncentiveRentalEnabled: boolean;
  /** 명부 행의 P4 양론 C1 「동일세대원에게 증여」 질문 */
  householdGiftEnabled: boolean;
}

const FLAGS: Record<JudgmentMenu, JudgmentMenuFlags> = {
  // 비과세 판정 route는 중과 엔진을 부르지 않는다 — 중과 축 입력은 닫는다(종전 상수 그대로).
  one_house: {
    hideGracePeriod: true,
    hideSellingHouseExclusion: true,
    hideSpouseOwned: true,
    judgmentMenu: true,
    hideSurchargeInputs: true,
    taxIncentiveRentalEnabled: false,
    householdGiftEnabled: true,
  },
  // 중과 판정은 중과 축 입력을 모두 연다. 비과세 결론 요약(쟁점 카드 포함)도 보이므로 증여 질문도 둔다.
  surcharge: {
    hideGracePeriod: false,
    hideSellingHouseExclusion: false,
    hideSpouseOwned: false,
    judgmentMenu: true,
    hideSurchargeInputs: false,
    taxIncentiveRentalEnabled: true,
    householdGiftEnabled: true,
  },
};

export function judgmentMenuFlags(menu: JudgmentMenu): JudgmentMenuFlags {
  return FLAGS[menu];
}

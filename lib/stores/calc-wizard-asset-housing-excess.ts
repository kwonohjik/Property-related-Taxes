/**
 * HousingExcessFormSlice — 같은 날 취득 주택의 **배율 초과 부수토지 분리**(#17) 카드(`HousingExcessSplitCard`)가 받는 자산 단위 입력 중
 * 기준시가 5칸 밖의 값. 노출·전송·검증 술어는 `lib/calc/housing-excess-split.ts`(자본적지출)·`housing-excess-acq-contract.ts`(계약서 구분금액)다.
 */
export interface HousingExcessFormSlice {
  /**
   * 같은 날 취득 주택의 배율 초과분 분리(#17)에서 자산 전체 자본적지출 중 **토지분** (원, 100% 기준) — 건물분은 전체 − 토지분.
   * 「소득세법」 §100② 후문은 자본적지출을 안분 대상으로 열거하지 않아 귀속 파트를 받는다(자동 안분 금지). 빈 값 = 미입력(⑧ 차단).
   */
  housingExcessLandCapex: string;
  /**
   * 취득 당시 **계약서 토지 금액·건물 금액**(#17-6, 원, 100% 기준 — 이 경로는 지분이 아니다). 둘 다 비면 종전대로 취득시 기준시가 비율로 안분한다.
   * 입력하면 둘 다 필수이고 합이 취득가액과 같아야 한다(⑧). 키가 없는 옛 저장분 = 비움.
   */
  acqContractLandPrice?: string;
  acqContractBuildingPrice?: string;
  /**
   * 영 §166⑧1호 「다른 법령에서 정하는 바에 따라 토지와 건물 등의 가액을 구분한 경우」 해당 신고 — 양도일 2025.1.1. 이후에만 묻는다.
   * 꺼짐(기본) = 해당 없음 = §100③ 30% 판정 적용. 영 §166⑧2호(철거 후 토지만 사용)는 주택 양도 경로에 해당하지 않아 묻지 않는다.
   */
  acqContractOtherLaw?: boolean;
}

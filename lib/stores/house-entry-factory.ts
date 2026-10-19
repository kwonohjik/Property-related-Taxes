import type { HouseEntry } from "./calc-wizard-asset-nbl";

/**
 * 명부(다른 보유 주택) 새 행의 기본값 — 화면 「+ 주택 추가」(`HousesListSection`)와 AI 추출 결과 합치기
 * (`lib/one-house-ai/merge-form.ts`)가 같은 값을 쓴다. 한쪽만 바꾸면 추출해 넣은 행과 직접 추가한 행의 기본값이 갈린다.
 */
export function createHouseEntry(id: string): HouseEntry {
  return {
    id,
    region: "capital",
    acquisitionDate: "",
    officialPrice: "",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    acquisitionPrice: "",
    exclusiveArea: "",
    isUnsoldNewHouse: false,
    completionDate: "",
    isSpouseOwned: false,
    isCoInherited: false,
    // `decedentSameHouseholdAtInheritance`는 **미리 답하지 않는다**(S14a-1) — 피상속인 세대는 요건 사실이라(§155② 단서·§155⑦1호·조특법 §71의2①)
    // 「모름」이 곧 불성립이다. 팩토리가 `false`를 넣으면 「+ 주택 추가」로 만든 행만 그 질문을 건너뛴다.
    // #42-2부터 미답은 「모름」과 같이 읽는다(`lib/calc/decedent-household.ts` — 종전엔 `undefined`를 `false`와 같이 다뤄 답하지 않아도 특례가 적용됐다).
    isRankingDisqualifiedInheritedHouse: false,
  };
}

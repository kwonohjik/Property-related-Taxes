/**
 * D2 ⑧이 칸으로 이동시킬 수 있는 field 목록 — **화면에 `data-field`로 실재해야 하는** 앵커(D2-2 점검).
 *
 * 격자 테스트(`transfer-land-part-cause.d2-2.grid.test.ts`)가 「⑧이 막은 field ∈ 이 목록」을, 렌더 테스트
 * (`…d2.predo.render.test.tsx` C11)가 「이 목록 ⊆ D2 렌더의 `data-field` 합집합」을 단언한다 — 두 테스트가 이 목록으로 묶인다.
 */
export const D2_UI_ANCHORS = [
  "landAcquisitionCause", // Y1 구조 규칙 이동 칸(토글 래퍼)
  "landAcquisitionDate", // Y2 · Q-4
  "acquisitionDate", // Y4 · 건물 날짜 필수
  "decedentAcquisitionDate", // 상속 — 건물 피상속인
  "decedentCohabitationHoldingStartDate", // 동일세대 시작일
  "landAcquisitionPrice", // Y9 · V1
  "buildingAcquisitionPrice", // Y9 · V1
  "landSalesCaseValue", // 토지 매매사례 V1
  "landDirectExpenses", // 자산 단위 자본적지출 안내 이동
  "buildingDirectExpenses",
] as const;

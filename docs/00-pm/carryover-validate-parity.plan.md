# 이월과세(§97의2) ⑧ ↔ ⑫ 정합 결함 2건 (H-5 · H-6)

출처: `docs/00-pm/transfer-split-part-carryover.plan.md` §11.1(UI 설계 단계 실측). 별건 선행 버그픽스.
규칙: 같은 입력에서 **⑧ 차단 ⇔ ⑫ 400**, 오류는 **화면에 있는 칸**으로 이동 (`feedback_fe8_vs_12_parity_grid`).

## H-5 — 이월과세 호스트 × 토지·건물 소유자 분리

| | |
|---|---|
| 실측 | housing · `acquisitionCause: carryover_gift` · `selfOwns: building_only`/`land_only` · 안분 칸 비움 → ⑧ `collectStepIssues(0)` **0건** ↔ ⑫ **400**(`standardPricePerSqmAtAcquisition`·`acquisitionArea`·`standardPriceAtAcquisition`·`landStandardPriceAtTransfer`·`buildingStandardPriceAtTransfer`) |
| 원인 | `transfer-tax-validate-acquisition.ts` 이월과세 분기 끝의 `return null`이 소유자 분리 규칙(`validateSplitDirectInputs`)을 통째로 건너뜀. 신축 분기(`:403`)와 일반 취득 꼬리(`:770`)는 이미 위임한다 |
| 수정 | 분기 끝에서 `effectiveSelfOwns(asset) !== "both"`이면 `validateSplitDirectInputs(asset, label, formTransferDate)`로 위임. 게이트는 ④ `isSplitPayloadActive`의 소유 축과 같은 술어. 분리가 아니면 종전과 같다(회귀 0) |
| 칸 | 이월과세 호스트는 `NonPurchaseSplitInputsBlock`(취득시 기준시가) + 양도가액 축(양도시 기준시가)을 렌더한다 — E2E field-jump 2건으로 포커스 도달 확인 |

## H-6 — 일반건물 이월과세 환산 방식 phd·apd

| | |
|---|---|
| 실측 ① | GB 토지/건물 이월과세 `estimationMode: phd`·`apd` + `donorStandardPriceAtAcquisition` 비움 → ⑧이 모드 무관하게 기준시가를 요구(`transfer-tax-validate-gb-carryover.ts`), 그 칸은 general 분기에만 렌더(`CarryoverEstimationSection`) → **막다른 길** |
| 실측 ② | ④ `buildGbCarryoverPayload`는 `estimationMode`를 싣지 않는다. 엔진(`applyCarryoverEstimationBasis`)·⑫(`refineGbCarryover`)도 `donorStandardPriceAtAcquisition` 하나만 읽는다. phd/apd를 고르고 PHD 3-시점 10칸을 전부 채워도 route 응답이 general과 **바이트 단위로 동일**(md5 일치) → 고른 방식이 계산에 반영되지 않는다 |
| 실측 ③ | PHD 칸을 일부만 채우면 ④ `buildPreHousingDisclosurePayload`가 최상위 `preHousingDisclosure`를 실어(`carryoverPhdMode`) ⑫가 `landPricePerSqm* > 0`으로 400 — ⑧은 GB에서 그 칸을 검사하지 않는다 (UI 통과→400) |
| 판단 | 정책 선택이 아니라 **엔진이 지원하지 않는 옵션의 노출**이다 — 엔진은 ‘지원 방식 하나’만 있고 화면이 둘을 더 열어 놓았다. GB에서 phd/apd를 **지원**하게 만드는 것은 별개의 신규 기능(엔진 + ⑫ + ④)이라 이 PR 범위 밖. 그래서 옵션을 숨긴다 |
| 수정 | 단일 술어 `carryoverEstimationModeSupported(assetKind, mode)`(`phd-toggle-scope.ts`) — 일반건물은 `general`만. ⑤ `CarryoverEstimationSection`: 옵션·PHD 패널을 술어로 거름(세션 잔재 phd/apd는 라디오 비선택). ⑧ `validateGbCarryover`: 잔재 phd/apd면 `*.estimationMode` 칸(화면에 있음)으로 「일반 기준시가 환산을 선택하세요」. ④ `carryoverPhdMode`: 일반건물이면 false(PHD 전송 차단) |
| ⑧≡⑫ | general: ⑧≡⑫ 정확히 일치. phd/apd·미선택: ⑧만 막는다(⑫는 payload에 모드가 없어 통과) — 의도된 UI 전용 규칙. **⑫ 400 ⇒ ⑧ 차단**은 격자로 고정 |
| 주택 | 주택 등 다른 자산종류는 세 방식 모두 종전대로(회귀 0) |

## 검증

- `__tests__/calc/carryover-validate-parity.anchor.test.ts` — H-5 격자(자산 2 × 소유 3 × 칸 채움 12상태 = 72셀: ⑧ 차단 ⇔ ⑫ 400, ⑧ 칸 ∈ ⑫ 오류 키) + H-6 격자(파트 2 × 방식 4 × 기준시가 2 × PHD 2)
- `__tests__/components/carryover-gb-estimation-modes.anchor.test.tsx` — ⑤ 옵션·패널·앵커
- E2E field-jump 케이스 3건 추가(`validation-field-jump-cases-acq.ts`·`-gb.ts`)
- 뮤테이션: 위임 제거 · ⑧ 모드 검사 제거 · ⑤ 필터 제거 · ⑤ 패널 게이트 제거 · ④ 가드 제거 — 각각 해당 anchor가 실패

## 남긴 것 (이 PR 범위 밖)

- GB 이월과세에서 PHD/APD를 **지원**하려면 엔진·⑫·④ 신규 구현이 필요하다(필요성은 사용자 판단).
- GB 일반 기준시가 패널은 「양도시 기준시가」 칸(`carryover.donorStandardPriceAtTransfer`)도 보여 주지만 GB 엔진은 읽지 않는다(엔진이 아는 값 사용) — 별건.

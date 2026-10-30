# 승계 입주권 × 이월과세 검증 — 실측

- 작성: 2026-10-30 · 상태: ✅ 실측 #2754 · 구현(§5 — Q-1~Q-4 a)
- 출발점: `redev-carryover-validation-scope.plan.md` §4·§7(Q-4 범위 밖으로 남긴 승계 입주권).
- 측정 도구: 클라이언트 ⑧(`validateStepDetailed` 0~3단계) → ④(`callTransferTaxAPI` body 캡처) → route `POST` vitest 프로브 · 화면 칸은 Playwright 프로브(세션 저장소 시드 → `[data-field]` 수집 → 「계산하기」 → 오류 배너). 세율은 mock. 프로브는 커밋하지 않는다.
- 시료: 승계 입주권(`isSuccessorRightToMoveIn` · 관리처분 인가 2020-01-10) · 증여 등기일 2023-06-01 · 증여자 취득 2021-01-01 · 직계존비속 · 증여 당시 평가액 300,000,000 · 양도 2026-02-16 · 양도가액 1,300,000,000 · 승계취득가액 400,000,000 · 추가분담금 0. ② 실가 = 증여자 취득가액 100,000,000 / ② 환산 = 일반 기준시가(증여자 취득시 100,000,000 · 양도시 500,000,000). 함께 양도는 토지(매매) + 같은 입주권(1,100,000,000). 부담부증여는 범위 밖.

## 1. 화면 칸 (Playwright)

| 취득원인 | 화면 `[data-field]` (취득 관련) |
|---|---|
| 매매 | `acquisitionDate` · `successorRightAcqPrice` · `successorRightAddedContribution` |
| 증여 | `acquisitionDate` · `donorAcquisitionDate` · `fixedAcquisitionPrice` · `successorRightAcqPrice` · `successorRightAddedContribution` |
| 이월과세 | 이월과세 블록(`carryover.giftRegistryDate` · `donorAcquisitionDate` · `donorAcquisitionPrice` 또는 `estimationMode` · `giftTaxAmount` · `donorCapitalExpenditure` · `giftDateValuation` · `donorRelation`) · `successorRightAcqPrice` · `successorRightAddedContribution` — **`acquisitionDate` 없음** |

## 2. 결과

- **G-1 취득일 막다른 길** — ⑧ `validateSuccessorRightAsset`(`transfer-tax-validate-successor-right.ts:48`)이 원값 `acquisitionDate`를 요구한다 → 이월과세 새 입력은 「조합원입주권 승계취득일을 입력하세요」로 계산 불가(주 자산·함께 양도 · POST 없음). ④는 증여 등기일(2023-06-01)을 보낸다. 원조합원 재개발(#2752 F-1)과 같은 구조다.
- **G-2 승계취득가액·추가분담금** — 이월과세여도 ⑧이 승계취득가액을 요구한다(`:78` 실가 분기 — 빈칸이면 「승계취득가액을 입력하세요」). 계산에는 쓰이지 않는다: 승계취득가액 1 · 400,000,000 · 900,000,000 · 추가분담금 0 · 50,000,000 → 결정세액 모두 472,935,000(② 실가) · 400,485,000(② 환산). A 취득가액 = 증여자 취득가액(100,000,000 · 환산 260,000,000) · B 취득가액 = 증여 당시 평가액(300,000,000). ④는 `acquisitionPrice` = 승계취득가액 + 추가분담금을 싣지만 이월과세 계산이 덮는다. 수증자가 증여 뒤 낸 추가분담금이 A·B 어디에도 들어가지 않는 것이 맞는지는 확인 필요(법령·해석례 미조사).
- **G-3 주 자산 ⑧ 통과 → ⑫ 400** — ⑧이 이월과세 칸을 보지 않는다(`transfer-tax-validate-acquisition.ts:281` 승계 분기). ⑫는 와이어에 `redevelopment` 객체가 없어 `ownValuation`이 아니라 `refineCarryoverTaxation` 전체를 건다. 결함 7종 × ② 2값 = 14칸 중 400 12(증여 등기일 빈칸 · 증여자 취득일 ≥ 증여일 · 사망+관계 빈칸 · 평가액 빈칸 · 가업상속 · ② 환산 방식 미선택의 기준시가 2칸) · 200 2(정상 실가 · 관계 그 외 — B 383,010,000). ② 환산은 방식 미선택 · general 기준시가 빈칸 · phd · apd 모두 400(`standardPriceAtAcquisition`·`standardPriceAtTransfer`) — 화면은 주 자산 입주권에 phd·apd를 연다(`carryoverEstimationModeSupported` — 일반건물만 general로 제한 · `phd-toggle-scope.ts:136`). PHD 칸을 채운 계산은 측정하지 않았다.
- **G-4 함께 양도 — 조용히 값이 바뀐다** — ② 환산 + (방식 미선택 · general 기준시가 빈칸 · phd · apd) → ⑧ 통과 · ⑩ 200 · 입주권 A 취득가액 0(A 429,060,000 > B 300,060,000 → A 채택) · 합계 결정세액 463,035,000(기준시가를 넣으면 A 취득가액 220,000,000 · 364,950,000). 비재개발 컴패니언 이월과세는 ⑧이 general만·기준시가 2칸을 요구해 막는다. 결함 7종 중 6종(정상 제외)은 400(`companionAssets.0.carryoverTaxation.*`).

## 3. 결정 대기

- **Q-1 (G-1)** (a) ⑧ 승계 분기의 취득일 빈칸·인가일 비교를 ④와 같은 leaf(`primaryAcquisitionDateOf` — 원값 → 증여 등기일)로 읽는다 · (b) 이월과세에도 취득일 칸을 띄운다. 권장 (a) — #2752와 같다.
- **Q-2 (G-3·G-4)** 승계 입주권 × 이월과세(비부담부증여)의 취득가액 검증을 (a) `validateCarryoverAsset` 전체(증여 사건 칸 · 증여자 취득가액 · 환산 방식과 칸 · 함께 양도 general만 · 음수·채무·세대)로 바꾼다 — 비재개발 이월과세·⑫와 같은 규칙 · (b) 승계 검증은 그대로 두고 증여 사건 칸(head·tail)만 더한다(G-4 남음). 권장 (a).
- **Q-3 (phd·apd)** 승계 입주권 주 자산의 이월과세 환산 방식을 (a) general만 연다(⑤ 옵션 · ⑧ 같은 술어) — 입주권이 §164⑦ 「공시되기 전에 취득한 주택」 환산 대상인지와 PHD 계산 결과를 확인하지 않았으므로 막는 쪽 · (b) 열어 두고 PHD 계산을 실측한 뒤 정한다. 권장 (a).
- **Q-4 (G-2)** (a) 이월과세에서는 승계취득가액 칸을 숨기고 ⑧도 요구하지 않는다 + 추가분담금이 0보다 크면 ⑧이 「이월과세 계산에 반영되지 않는다」로 막는다(법령 확인 전 계산 거절) · (b) 승계취득가액 칸만 숨기고 추가분담금은 그대로(계산에 안 들어감) · (c) 추가분담금을 A·B에 넣는 엔진 변경 — 법령·해석례 확인 먼저. 권장 (a).

## 4. 남은 확인

- 실제 세율로 같은 격자 · 부담부증여 승계 입주권 × 이월과세 · PHD 칸을 채운 승계 입주권 주 자산 계산 — 확인 필요.

## 5. 구현 (2026-10-30 · 사용자 결정 「권장 사항으로」 — Q-1~Q-4 a)

- **술어** `isCarryoverSuccessorRight`(`transfer-successor-right.ts`) = 승계 입주권 × `carryover_gift` × 부담부증여 아님. ⑤·⑧·④·⑥이 이 하나를 읽는다.
- **Q-1** `validateSuccessorRightAsset`의 취득일 빈칸·인가일 비교가 `primaryAcquisitionDateOf`(원값 → 증여 등기일)를 읽는다. 매매·증여는 원값 그대로라 종전과 같다.
- **Q-2** ⑧ 승계 분기 — 위 술어면 승계 취득가액 방식 검증(승계취득가액·추계 칸)을 건너뛰고 `validateCarryoverAsset` 전체를 건다(증여 사건 칸 · 증여자 취득가액 · 환산 방식과 칸 · 함께 양도 general만 · 음수·채무).
- **Q-3** `carryoverEstimationModeSupported` — `right_to_move_in`은 general만(⑤ 옵션 · ⑧ · ④ `carryoverPhdMode`가 같은 술어). 주 자산 phd·apd 잔재는 ⑧ 「이 자산의 이월과세는 「일반 기준시가 환산」만 지원합니다」(종전 문구는 함께 양도 전용이라 주 자산 분기를 따로 뒀다).
- **Q-4** ⑤ `SuccessorRightAcquisitionBlock` — 이월과세면 산정 방식 라디오·승계취득가액·추계 칸·미리보기를 숨기고 안내(`carryover-successor-right-note`)와 추가분담금 칸만 둔다. 추가분담금 > 0이면 ⑧이 「현재 버전에서 계산에 반영하지 못합니다」로 거절한다.
- **남은 승계 산정 방식 플래그(측정 중 발견)** — 라디오를 숨기면 고칠 곳이 없는 잔재가 된다. 종전에도 이월과세 결과를 바꿨다(주 자산 매매사례·감정 잔재 + ② 실가 472,935,000 → 299,010,000 · 환산 잔재 ⑫ 400 — 화면에서는 ⑧ 승계 추계 칸 요구가 먼저였다). ④ 진입 사본 `withCarryoverSuccessorRightActual`이 세 플래그를 끄고, `successorRightEstimationMode`도 이월과세를 actual로 읽는다(부담부증여와 같은 방식). 함께 양도 매매사례 차단(`transfer-tax-validate.ts` 「첫 번째 자산에서만」)도 이 술어를 건너뛴다.
- **⑥ 사이드바** `directAcqRaw` — 이월과세 승계 입주권은 숨은 승계취득가액을 보이지 않는다(0 · 계산 후 확정 — 재개발 이월과세와 같다).

### 5.1 측정 (수정 후)

- G-1: 주 자산·함께 양도 취득일 빈칸 → ⑧ 통과 · 200(주 자산 472,935,000 — 취득일을 채운 것과 같다).
- G-2: 승계취득가액 빈칸 → ⑧ 통과 · 472,935,000 · 400,485,000(② 환산) · 추가분담금 50,000,000 → ⑧ 차단.
- G-3: 주 자산 결함 9종(증여 사건 칸 5 · 증여자 취득가액 · 방식 미선택 · general 기준시가 빈칸 · phd) 모두 ⑧ 차단.
- G-4: 함께 양도 general 기준시가 빈칸 · phd · apd · 방식 미선택 → ⑧ 차단(종전 463,035,000으로 계산). 정상 general 364,950,000.
- 잔재 플래그: 주 자산 매매사례·감정·환산 잔재 × ② 실가·환산 → ⑧ 통과 · 472,935,000 · 400,485,000(잔재 없는 값과 같다). 함께 양도 잔재는 종전과 같은 세액이고 매매사례 잔재의 ⑧ 차단이 풀렸다.

### 5.2 검증

- anchor 33(`__tests__/components/successor-right-carryover-validation.anchor.test.tsx` — 수정 전 29 실패) · 뮤테이션 15종 전부 KILLED.
- E2E `e2e/successor-right-carryover-validation.spec.ts` SR-E1(취득일·승계취득가액 빈칸 계산) · SR-E2(⑤ 칸) · SR-E3(함께 양도 기준시가 빈칸 ⑧).

### 5.3 남은 것

- 추가분담금을 이월과세 A·B에 넣어야 하는지 — 법령·해석례 미조사(지금은 계산 거절).
- 비승계 이월과세 자산의 남은 자산 단위 산정 방식 플래그 · 함께 양도 ⑩이 환산 기준시가 없이 200을 내는 것(⑧이 먼저 막는다) — 측정하지 않음.

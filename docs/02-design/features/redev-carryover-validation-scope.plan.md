# 재개발 × 이월과세 검증 범위 — ⑧↔⑫ 격자 실측

- 작성: 2026-10-30 · 상태: 📏 실측(계획 전 — 사용자 결정 Q-1~Q-4 대기)
- 출발점: `redev-carryover-residue-bundle.plan.md` §5 첫 줄(재개발 주 자산 ⑫가 `refineCarryoverTaxation`을 받지 않고, ⑧ 재개발 분기도 `validateCarryoverAsset`를 타지 않는다).
- 측정 도구: 클라이언트 ⑧(`validateStepDetailed` 0~3단계) → ④(`callTransferTaxAPI` body 캡처) → route `POST` vitest 프로브. 화면 칸 유무는 Playwright 프로브(세션 저장소 시드 → 단계별 `[data-field]` 수집 → 「계산하기」). 세율은 mock(실제 Supabase 세율 미측정). 프로브는 커밋하지 않는다.
- 시료: 입주권(종전 주택 · 인가일 2024-01-10 · 권리가액 900,000,000 · 청산금 납부 200,000,000 · §166③ 인가일 500,000,000 · 취득당시 20,000,000) / 완공 아파트(같은 값 + 준공 2025-09-01) · 증여 등기일 2023-06-01 · 증여자 취득 2012-01-01 · 직계존비속 · 증여 당시 평가액 300,000,000 · 양도 2026-02-16 · 양도가액 1,300,000,000. 함께 양도는 토지(매매 2015 · 100,000,000 → 200,000,000) + 같은 재개발 자산(1,100,000,000). ② 「환산취득가 사용」 ON(§166③) / OFF(증여자 취득가액 100,000,000).
- 범위: 원조합원(입주권·완공 아파트) × 부담부증여 아님. 승계 입주권은 §4에 따로 적는다. 부담부증여는 측정하지 않았다.

## 1. 화면 경로 막다른 길 — 취득일 (F-1)

| 시료 | 화면의 `acquisitionDate` 칸 | ⑧ | ④ 전송 |
|---|---|---|---|
| 입주권 · 취득원인 매매 | 있음 | (다른 칸 요구) | — |
| 입주권 · 취득원인 증여 | 있음 | (다른 칸 요구) | — |
| 입주권 · 이월과세 · 취득일 빈칸 | **없음**(4단계 모두) | 「자산: 취득일을 입력하세요.」 · POST 없음 | 증여 등기일 |
| 완공 아파트 · 이월과세 · 취득일 빈칸 | **없음** | 같은 문구 · POST 없음 | 증여 등기일 |
| 함께 양도(토지 + 입주권 이월과세) · 취득일 빈칸 | 칸 1개(토지 — 매매) | 「자산 2: 취득일을 입력하세요.」 · POST 없음 | 증여 등기일 |

- 원인: ⑧ 재개발 분기가 원값 `asset.acquisitionDate`를 요구한다(`lib/calc/transfer-tax-validate-acquisition.ts:307`). ④는 이월과세에서 `carryoverAcquisitionDateFallback`(`lib/calc/transfer-tax-api-carryover.ts:188` — 원값 → 증여 등기일)을 보낸다. 비재개발 이월과세는 `validateCarryoverAsset`(`transfer-tax-validate-carryover-asset.ts:27`)으로 가서 원값을 요구하지 않는다.
- 새로 입력한 재개발 이월과세 자산(`makeDefaultAsset`의 취득일 = 빈칸)은 계산할 수 없다. 매매·증여에서 넣은 취득일이 남아 있을 때만 통과한다.
- 남은 취득일(route 실측, 입주권·완공 아파트 × ② 환산·실가): 2010-01-01 · 2020-01-01 · 2023-06-01은 세액이 증여 등기일 값과 같다(322,607,280 · 302,370,000 · 299,010,000 · 299,010,000). 인가일 뒤 값(2024-06-01)은 ⑧이 「인가일은 취득일 이후여야 합니다」(`transfer-tax-validate-redev.ts:299`)로 막는다 — 고칠 취득일 칸이 화면에 없다.

## 2. 주 자산 격자 — ⑧ 통과 · route 200 · 값이 바뀐다 (F-2)

`acquisitionDate`를 증여 등기일로 채운 body(= §1의 남은 값 경로 · route 직접 호출). 결함 14종 × 입주권·완공 아파트 × ② 2값 = 56칸: ⑧ 차단 4(D4 — `acquisitionDate` 칸 규칙) · ⑧ 통과 52(200: 46 · 400: 6).

| # | 입력 | ⑧ | ⑫ | 결과(입주권 ② 환산 · 실가 / 완공 아파트 ② 환산 · 실가) | 비재개발 ⑧ |
|---|---|---|---|---|---|
| D0 | 정상 | 통과 | 200 | 322,607,280 · 302,370,000 / 299,010,000 · 299,010,000 | — |
| D1 | 증여 등기일 빈칸 | 통과 | 200 | ④가 `carryoverTaxation`을 싣지 않는다(`transfer-tax-api-carryover.ts:99`) → 이월과세 명세 없음 · 411,465,000 · 427,935,000 / 411,465,000 · 427,935,000 | 차단 |
| D2 | 증여자 취득일 빈칸 | 통과 | 200 | D1과 같다 | 차단 |
| D3 | 증여자 취득일 2023-07-01(≥ 증여 등기일) | 통과 | 입주권 200 · 완공 아파트 400(`donorHouseholdHoldingStartDate` — 세대 질문 규칙) | 입주권 A 채택 411,465,000 · 383,010,000 | 차단 |
| D5 | 관계 「그 외」 | 통과 | 200 | B 채택 299,010,000(4칸) — 주 자산 「그 외」는 엔진이 이월과세 미적용으로 판정한다(`refineCarryoverTaxation` `rejectOtherRelation=false` · `transfer-tax-schema-companion-refines.ts:321`) | 차단(「취득 원인을 "증여"로 변경」) |
| D6 | 증여자 사망 · 관계 빈칸 | 통과 | 200 | D0과 같다 | 차단 |
| D7 | 증여 당시 평가액 빈칸 | 통과 | 200 | B 채택(B 취득가액 0) 427,935,000(4칸) | 차단 |
| D8 | 가업상속공제 적용 자산 | 통과 | 200 | B 채택 299,010,000(입주권) · D0과 같음(완공 아파트) | 차단(「지원하지 않습니다」) |
| D9 | 인수채무 토글 ON · 50,000,000 | 통과 | 200 | D0과 같다(채무 무시). 화면은 「이 자산에서는 … 나누어 계산하지 못합니다 — 이 토글을 끄세요」(재개발은 `APPLY_KINDS` 밖 · `carryover-gift-assumed-debt.ts:65`) | 차단 |
| D10 | 관계 빈칸 | 통과 | 200 | D0과 같다 | (사망 아니면 통과) |
| D11 | 같은 세대 질문 빈칸 | 통과 | 200 | D0과 같다(이 시료 — 1세대1주택 판정 없음). 질문은 완공 아파트만 뜬다(`housing-like-asset.ts:83`) | 차단 |
| D12 | 증여자 신축 ON | 통과 | 200 | D0과 같다 — 재개발은 질문 대상이 아니다(`donor-built-scope.ts:30`) | 해당 없음 |
| D13 | 증여세 상당액 −1 | 통과 | 400(Zod `>= 0`) | — · 화면 칸이 음수를 받는지는 확인 필요 | 차단 |

- 원인: ⑧ 재개발 분기(`transfer-tax-validate-acquisition.ts:285~309`)는 §166 검증과 증여자 취득가액(#2747) 다음 `return null`로 끝나 이월과세 검증(`:328`)에 닿지 않는다. ⑫ `refinePrimaryAcquisitionInputs`의 이월과세 블록은 자체 평가 자산(`ownValuation` — 재개발 포함 · `transfer-tax-schema-required-refines.ts:295·302`)을 건너뛴다.
- 값이 바뀌는 칸 18개: D1·D2(8 — 이월과세 미적용) · D3 입주권(2) · D5 입주권(2) · D7(4) · D8 입주권(2). D5는 설계상 미적용이다(비재개발 ⑧은 막는다).

## 3. 함께 양도 격자 — ⑧ 통과 → ⑫ 400 (F-3)

같은 56칸: ⑧ 차단 4(D4) · ⑧ 통과 → 400 32 · 200 20(D0·D9~D12).

- 400 경로: D1·D2 `companionAssets.0.carryoverTaxation`(필수) · D3 `…donorAcquisitionDate`(입주권) · `…donorHouseholdHoldingStartDate`(완공 아파트) · D5·D6 `…donorRelation` · D7 `…giftDateValuation` · D8 `…exclusionDeclared` · D13 `…giftTaxAmount`. 컴패니언 arm은 자산 종류와 무관하게 `refineCarryoverTaxation(…, rejectOtherRelation=true)`를 건다(`transfer-tax-schema-companion-refines.ts:172`).
- 칸은 모두 이월과세 블록에 있다(D11은 완공 아파트만) — 막다른 길은 아니고 계산 후 JSON 오류 배너다.

## 4. 승계조합원

- **승계 입주권**(`isSuccessorRightToMoveIn`) — ⑧은 `validateSuccessorRightAsset`(`transfer-tax-validate-acquisition.ts:278`)로 가 이월과세 검증이 없다. ⑫는 와이어에 `redevelopment` 객체가 없어 `ownValuation`이 아니라 주 자산도 `refineCarryoverTaxation`을 받는다. 28칸(결함 7종 × ② 2값 × 주·함께): ⑧ 통과 → 400 24 · 200 4(주 자산 D0 실가 · D5 실가(B 채택 383,010,000) · 함께 양도 D0 2칸). 주 자산 ② 환산 D0도 400(`standardPriceAtAcquisition` · `standardPriceAtTransfer` — 환산 방식 미선택 시료). 화면 취득일 칸 유무(F-1과 같은 막다른 길인지)는 확인 필요.
- **승계 완공 아파트**(`redevIsSuccessorMember: "yes"`) — ⑧이 이월과세 취득원인을 막는다(「승계조합원은 취득원인이 매매·증여·상속 중 하나여야 합니다」 · `transfer-tax-validate-redev.ts:326`). 화면 경로 밖이다(route 직접 호출 결과는 이 문서 범위 밖).

## 5. 결정 대기

- **Q-1 (F-1 취득일)** (a) ⑧ 재개발 분기의 취득일 판정(빈칸·인가일 비교·양도일 비교)을 ④와 같은 leaf(`primaryAcquisitionDateOf` · `transfer-tax-api-carryover.ts:201` — 원값 → 증여 등기일)로 읽는다 · (b) 이월과세 재개발 자산에 취득일 칸을 띄운다. 권장 (a) — 비재개발 이월과세 화면과 같고(취득일 칸 없음) ④·엔진이 이미 증여 등기일을 쓴다.
- **Q-2 (F-2 ⑧)** 재개발 분기 끝에서 이월과세 사건 검증을 건다 — (a) `validateCarryoverAsset`에서 환산 방식·PHD·증여자 신축·소유자 분리 등 재개발에 없는 칸 규칙을 뺀 공용 부분(가업상속 · 날짜 2칸·순서 · 관계 「그 외」 · 사망+관계 · 평가액 · 음수 · 인수채무 · 세대 질문)을 leaf로 떼어 양쪽이 부른다 · (b) 재개발 분기에 필요한 규칙만 따로 쓴다. 권장 (a).
- **Q-3 (F-2·F-3 ⑫)** 주 자산 재개발에도 `carryoverTaxation` 필수 + `refineCarryoverTaxation(…, rejectOtherRelation=false)`(비재개발 주 자산과 같다)를 건다. 함께 양도(F-3)는 Q-2만으로 ⑧이 같은 칸을 먼저 막는다. 부담부증여·승계 입주권 재개발은 이 블록 밖(종전 그대로)으로 둘지 함께 볼지 — 부담부증여는 측정하지 않았다.
- **Q-4 (§4 승계 입주권)** 같은 공용 leaf를 `validateSuccessorRightAsset` 이월과세 경로에도 걸지 · 이번 범위 밖으로 둘지.

## 6. 남은 확인

- 실제 Supabase 세율로 같은 격자(세액 수치) — 확인 필요.
- 부담부증여 재개발 × 이월과세(사건 칸은 건물 블록 · `carryoverDonorBasis`) — 측정하지 않음.
- D13 음수 칸이 화면에서 들어가는지 · 승계 입주권 이월과세의 화면 취득일 칸 — 확인 필요.

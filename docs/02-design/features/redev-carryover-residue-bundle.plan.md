# 재개발 원조합원 × 이월과세 잔여 묶음 — phd/apd 저장값 · ⑫ 증여자 취득가액 · 명세서 문구 2건

- 작성: 2026-10-30 · 상태: ✅ 계획+구현(세액 불변 — 화면 경로 기준)
- 출발점: `redev-carryover-estimation-toggle-sync.plan.md` §7.2·§7.3·§6(route 직접 호출 ⑫). 사용자 요청(2026-10-30) — §7.5의 「7.2 phd/apd 막다른 길 + 화면 밖 증여자 취득가액 미차단」·「명세서 문구 2건」.
- 측정 도구: 클라이언트 ⑧(`validateStepDetailed`) → ④(`callTransferTaxAPI`) → route `POST` vitest 프로브 · 명세서 빌더 직접 호출. 세율은 mock(실제 Supabase 세율 미측정). 범위는 `isRedevCarryoverDonorBasis`(원조합원 재개발 자산 × 이월과세 × 부담부증여 아님 × 승계 아님)와 같다.

## 1. 현황 (실측 · master `37d1a22c6`)

| # | 증상 | 원인 |
|---|---|---|
| A-1 | 이월과세 환산 방식 「phd」·「apd」와 그 칸이 저장된 재개발 자산(증여자 2012 · 공시 후) — ⑧ 통과 · 서버 400 `preHousingDisclosure.firstDisclosureDate`. #2736부터 그 패널(방식·칸)이 재개발에서 숨어 고칠 곳이 없다 | ④ `phdPayloadActive` → `carryoverPhdMode`(`lib/calc/phd-toggle-scope.ts`)가 재개발을 제외하지 않는다. 재개발 엔진은 `preHousingDisclosure`를 쓰지 않는다(공시 전 증여자 시료에서 실어도 PHD 칸 없는 시료와 같은 값 — #2738 §7.2) |
| A-2 | 화면을 거치지 않은 호출에서 주 자산 재개발 이월과세 「환산취득가 사용」 OFF · 증여자 취득가액 빈칸 → 200 · A 인가 전 분 취득가액 0(입주권 334,290,000 · 완공 아파트 299,926,363). ⑧은 #2736부터 막는다 | ⑫ `refinePrimaryAcquisitionInputs`의 이월과세 블록이 자체 평가 자산(`ownValuation` — 재개발 포함)을 건너뛴다 → `refineCarryoverTaxation` 전체가 재개발 주 자산에 적용되지 않는다. 컴패니언은 이미 400이다 |
| B-1 | 단건 명세서 인가 전 분 — 이월과세 A 채택이어도 「실제 취득가액 = 100,000,000 (실가 모드)」·「§166③ — 권리가액 × 취득 당시 기준시가」(토지 출자 「취득기준시가」) | `buildRedevAcquisitionFormula`·`applyLandContribOverrides`가 이월과세 여부를 받지 않는다 |
| B-2 | 함께 양도 명세서 자산별 취득가액 — 「증여자 취득 당시 환산취득가 236,000,000」(값은 §166③ 36,000,000 + 청산금 분 200,000,000의 합) | `buildGbAcquisitionFormulaCore` 이월과세 A 분기가 재개발 분할 구조를 모른다 |

## 2. 설계

- **A-1** `carryoverPhdMode`가 `isRedevCarryoverDonorBasis`면 false — ④가 `preHousingDisclosure`를 싣지 않는다. 같은 술어를 읽는 `carryoverPurchasedPartScope`는 재개발 종류를 그보다 앞에서 「자산 종류」로 돌려 영향이 없다. 승계조합원은 범위 밖(종전 그대로 — 이월과세 패널도 그대로 보인다).
- **A-2** ⑫ 주 자산 — 재개발 이월과세(부담부증여 · 승계조합원 · 승계 입주권 제외)에서 `carryoverTaxation.useEstimatedAcquisition`이 아니고 `donorAcquisitionPrice`가 양수가 아니면 400 `carryoverTaxation.donorAcquisitionPrice`. ⑧ 재개발 분기(`redevPreApprovalAcqMode` = `carryover_donor`)와 같은 규칙만 더한다. 재개발 주 자산이 `refineCarryoverTaxation`의 나머지 검증(관계·날짜·증여세 등)을 받지 않는 것은 그대로 둔다 — ⑧도 재개발 분기에서 `validateCarryoverAsset`를 타지 않아 함께 넓히려면 ⑧↔⑫ 격자 대조가 필요하다(§5).
- **B-1** `RedevAxis`에 `carryoverDonor`(결과의 이월과세 A 채택). 인가 전 분 실가 → 「증여자 취득가액 = N (이월과세 — 「소득세법」 §97의2①1호)」, 환산 → 「권리가액 × **증여자** 취득 당시 기준시가」, 토지 출자 라벨 → 「권리가액 × 증여자 취득 당시 기준시가」. B 채택(증여 당시 평가액)·매매는 종전 문구.
- **B-2** 이월과세 A 채택 + `redevelopmentDetail` 있음 → 「증여자 취득 당시 기준 취득가액 N — §166 분할 합(인가 전 분 {§166③ 환산 | 증여자 취득가액} M 포함) · 이월과세 §97의2① (증여자 취득가액 승계)」. 값은 바뀌지 않는다.

## 3. 측정 (구현 후 · mock)

- A-1: 입주권 phd·apd · 완공 아파트 phd + PHD 칸(증여자 2012) → `preHousingDisclosure` 미전송 · 200 · 322,607,280(방식 미선택과 같다 · 완공 아파트 B 299,010,000). 공시 전 증여자(2000) phd 시료는 종전과 같은 300,849,600.
- A-2: body에서 증여자 취득가액을 빼면 입주권·완공 아파트 400(종전 200) · 증여자 취득가액 있으면 302,370,000 · 「환산취득가 사용」이면 빈칸이어도 322,607,280 · 승계조합원·부담부증여 body는 이 규칙 밖 · 컴패니언은 종전부터 400.
- 저장 입력 격자 96조합(#2738 §7.4와 같은 격자)을 #2736 직후 결과와 대조: 달라진 16조합은 모두 ⑧이 `carryover.donorAcquisitionPrice`로 이미 막는 입력이고 route만 200 → 400이다. 화면 경로에서 「⑧ 통과 → 새 400」은 0.
- B-1·B-2: §1 표의 문구가 §2대로 바뀐다(값 불변 — 236,000,000 · 36,000,000 · 100,000,000).

## 4. 검증

- anchor 16(`__tests__/components/redev-carryover-residue-bundle.anchor.test.tsx` — 수정 전 소스에서 11건 실패, 통과 5건은 불변 가드: ⑧ 기존 차단 · 증여자 취득가액 있는 계산 · 승계·부담부증여 규칙 밖 · 컴패니언 기존 400 · B 채택·매매 문구) · 뮤테이션 15종 전부 KILLED.
- 전체 vitest 44,146 통과 · tsc 0 · eslint 경고 375(기준선 그대로).
- E2E RB-E1(phd 저장값 계산) · RB-E2(단건 「증여자 취득가액」) · RB-E3(함께 양도 「§166 분할 합」) — `e2e/redev-carryover-residue-bundle.spec.ts` 3회 연속 통과 · 수정 전 소스에서 셋 다 실패 · 관련 기존 E2E 24건 통과.
- 스크린샷 라이트·다크·375px(명세서 취득가액 행 펼침).

## 5. 남은 것

- 재개발 주 자산 ⑫가 `refineCarryoverTaxation`(관계 「그 외」·가업상속공제·날짜·증여세 등)을 받지 않는다 — ⑧ 재개발 분기도 `validateCarryoverAsset`를 타지 않는다. 넓히려면 ⑧↔⑫ 격자 대조가 먼저다(측정하지 않음).
- B 채택 단건 명세서의 「실제 취득가액 = 300,000,000 (실가 모드)」는 증여 당시 평가액이다 — 이번 범위 밖(문구 그대로).
- 청산금 수령 완공 아파트(동시신고) 인가 전 분 「종전 취득가액(실가 또는 §166③ 환산)」 문구는 이월과세 표기 없음 — 범위 밖.

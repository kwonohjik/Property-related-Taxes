# 승계조합원 완공 아파트 — 취득가액 필수 · 엔진 오류 코드 (V-4 후속)

> **출처**: `companion-redev-166-3-required.plan.md` V-4 · §8 범위 밖 — 「승계조합원 엔진 throw(`redevelopment-successor.ts:79`)도 같은 `TaxRateNotFoundError`(500)」
> **깊이**: L2 — 세액이 바뀌는 경로는 없다. 종전 500(계산 불가)이던 입력이 경로 있는 400이 되고, 증여 승계는 화면 ⑧이 먼저 막는다. 정상 입력의 세액 불변.

## 1. 실측 (수정 전 · route probe)

시료(E2-01 anchor와 같은 값): 인가 2016-02-20 · 입주권 승계취득 2020-04-15 · 준공 2022-12-02 · 2023-02-16 양도 920,000,000 · 승계취득가액 450,000,000 → 산출세액 327,250,000. 「⑧」은 화면 검증 오류 칸.

| 행 | 입력 | ⑧ | 응답 |
|---|---|---|---|
| M0 | 주 자산 매매 정상 | — | 200 · 327,250,000 |
| M1 | 주 자산 매매 · 취득가액 비움 | fixedAcquisitionPrice | **500** TAX_RATE_NOT_FOUND |
| M2 | API 취득가액 0 · 평가액 0 | — | **500** |
| M3 | API 취득가액 키 삭제 | — | 400 acquisitionPrice(필수 키) |
| **G1** | **주 자산 증여 승계 · 증여 신고가액 비움** | **통과** | **500 — 화면 경로** |
| C1~C3 | 컴패니언 매매 비움·0·삭제 | (C1만) fixedAcquisitionPrice | 400 `companionAssets.0.fixedAcquisitionPrice` |
| CG1 | 컴패니언 증여 비움 | **통과** | 400 — 「⑧ 통과인데 400」 |
| I1 | 상속 승계 · 입력 없음 | — | 400 decedentAcquisitionDate(기존 상속 원천 검사) |
| B0·B1 | 부담부증여 승계 · API 취득가액 0 · 평가액 0 | fixedAcquisitionPrice(아래 §5) | 200(엔진은 §159 경로) |

- **원인** — 엔진은 `actualAcquisitionPrice > 0 ? 그 값 : rightsValue > 0 ? 평가액 : throw`(`redevelopment-successor.ts`)다. 컴패니언 ⑫는 매매·증여 `fixedAcquisitionPrice`를 이미 요구한다(`transfer-tax-schema-companion-refines.ts:102-125`). 주 자산 ⑫에는 같은 검사가 없다. ⑧ 승계 취득가액 분기(`transfer-tax-validate-redev.ts` E2-01)는 **매매만** 본다 — 증여 신고가액 칸(`CompanionAcqGiftBlock.tsx:100` = `fixedAcquisitionPrice`)은 렌더되지만 비워도 통과한다.

## 2. 설계

1. **엔진** — throw를 `TaxCalculationError(INVALID_INPUT)`로(#2574 형제 엔진 3곳과 같은 정책 · `lib/api/tax-error-response.ts`). 메시지 불변.
2. **⑫ 주 자산** `refinePrimaryAcquisitionInputs` — `isSuccessorMember` ∧ 취득원인 매매·증여 ∧ 부담부증여 아님 ∧ `inheritedAcquisition` 없음 ∧ `acquisitionPrice ≤ 0` ∧ `rightsValue ≤ 0` → `acquisitionPrice` 이슈. 평가액·`inheritedAcquisition` 조건은 엔진 판정 그대로(어느 하나가 있으면 엔진이 계산한다 — E2-01 A-2 · 리뷰 게이트 지적 1).
3. **⑧ 증여 분기** — 승계 ∧ 증여 ∧ 부담부증여 아님 ∧ `fixedAcquisitionPrice ≤ 0` → 그 칸. 부담부증여는 §159가 취득가액을 정하고 증여 블록이 칸을 렌더하지 않는다(`isBurdenedGift`) — 제외.

신규 필드 없음. ④ · ⑤ · ⑬ · ⑭ 변경 없음.

## 3. 결정

- 범위 결정 게이트 없음 — #2574에서 승인된 정책(입력 결함 = 400 · ⑫는 엔진 판정 그대로 · ⑧ ↔ ⑫ 같은 칸)을 같은 구조에 적용한다.
- 상속 승계는 제외 — STEP 0.45 `inheritedAcquisition`이 취득가액을 만들고, 원천이 없으면 기존 상속 검사가 400으로 막는다(I1).

## 4. 테스트

- 신규 anchor `__tests__/api/transfer.route.redev-successor-acq-price-required.anchor.test.ts` 8건(S-1a~d · S-2a~b · S-3a~b).
- E2-01 anchor A-3에 오류 코드 `INVALID_INPUT` 단언 추가.
- 구현 후 mutation(각 변형마다 의도한 anchor만 실패):

| P | 무력화 | 실패한 anchor |
|---|---|---|
| P-1 | ⑫ 신규 규칙 | S-1a · S-1b · S-2a |
| P-2 | ⑧ 증여 분기 | S-2a · S-2b |
| P-3 | 엔진 오류 코드 되돌림 | A-3 |
| P-4 | ⑫ 평가액 조건 제거(과차단) | S-1c |
| P-5 | ⑫ 부담부증여 제외 제거(과차단) | S-3b |
| P-6 | ⑫ `inheritedAcquisition` 예외 제거(과차단) | S-1d |

## 5. 범위 밖 · 별건

- **부담부증여 × 승계조합원 × 매매 — ⑧ 막다른 길(기존)**: ⑧ E2-01 매매 분기가 부담부증여에도 `fixedAcquisitionPrice`를 요구하는데, 부담부증여는 상단 취득가액 영역을 렌더하지 않는다(`CompanionAcqPurchaseBlock.tsx:376`). 실지취득가액(`bgActualAcquisitionTotal`)을 채워도 ⑧이 막는다(B0 — 수정 전·후 같음). 엔진은 같은 입력을 200으로 계산한다. 규칙을 풀면 그동안 화면에서 계산할 수 없던 부담부증여 승계조합원 경로가 열리므로, **그 세액이 맞는지 확인한 뒤** 별건으로 다룬다. 화면에서 실제로 그 상태에 도달하는지(승계 토글 + 부담부증여 조합)도 확인 필요. → 계획서 `redev-successor-bg-acq-method.plan.md`(화면 도달 실측 ✅ · 리뷰 게이트 C-3 평가액 우회와 함께).

## 6. 구현 결과 (2026-10-26)

- 수정 후 probe: M1·M2 → 400 `acquisitionPrice` · G1 → ⑧ 「증여 신고가액」 + 400 · CG1 → ⑧ 같은 칸 + 400 · 정상 행(M0·G0·C0) 값 불변 · B1 200(제외 축 유지) · I1 불변.
- 전체 vitest 42,385건 실패 0(리뷰 반영 전) · tsc 0 · 변경 파일 lint 0.

### 리뷰 게이트(acquisition-cost-review) 반영

- FAIL 없음. 지적 1(⑫ 과차단 — API 직접 호출 한정): 매매·증여 승계라도 `inheritedAcquisition`(post-deemed `reportedValue`)이 있으면 엔진 STEP 0.45가 취득가액을 만들어 계산하는데(route 실측 200 · 327,250,000), 초안 ⑫가 400을 냈다. ⇒ 예외 추가 · S-1d · P-6. 화면 경로는 ④가 증여 신고가액 칸 하나에서 두 값을 만들어 그 상태가 되지 않는다.
- 범위 밖으로 남긴 지적: ⑫는 `rightsValue > 0`을 충족으로 본다(엔진 fallback 그대로). 화면 경로는 ④가 승계 시 `rightsValue = fixedAcquisitionPrice`로 싣는다(`transfer-tax-api-redev.ts:93-106`)라 같은 값이지만, API로 임의의 평가액을 보내면 엔진이 §166④1호 관리처분 평가액을 승계취득가액 자리에 쓴다 — 엔진 fallback 자체의 문제라 별건(확인 필요).
- 법령 체인: §97①1호 가목 · 시행령 §163⑨는 리뷰가 `.legal-cache` 원문으로 확인(KoreanLaw MCP 502로 최신 시행본 재확인은 못 함 — 확인 필요).


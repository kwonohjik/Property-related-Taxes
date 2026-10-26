# 재개발·재건축 §166③ 환산 입력 — 컴패니언 500 · 분자 비움 조용한 오답 (계획서)

> **세목**: 양도소득세 — 「소득세법 시행령」 §166③(재개발·재건축 종전 부동산 환산취득가액 = 평가액 × 취득당시 기준시가 ÷ 관리처분계획등 인가일 기준시가)
> **출처**: `inheritance-pre-deemed-bg-pr7b.plan.md:349` 별건 — 「컴패니언 ⑫에 §166③ 분모 검사가 없다 · 매매 K-5 컴패니언은 서버 500」
> **깊이**: L3 — 엔진 오류 응답과 ⑫ 검사가 바뀌고, 지금 200으로 틀린 세액을 내는 API 요청이 400이 된다. 화면 경로는 ⑧이 이미 막아 세액 변화 없음
> **워크트리**: `Property-related-Taxes-k5c` (master `d50944d30`)

## 0. 이미 정해진 것 (재제안 금지)

- E1-07(2026-08-26): §166③ 분모가 없으면 엔진이 던진다(종전 취득가액 0으로 성공). 그 앞에서 ⑫가 400으로 막는 것이 정본이다(`transfer-tax-schema-refines.ts:471-481` 주석).
- 승계조합원은 §166 안분을 건너뛰어 분모를 요구하지 않는다(⑫ `:484` · ⑧ 같은 축).
- 단독주택 출자 2-point 분기(`isHousingContribEstimatedAxes` — housing · right · receive · 환산)는 D가 아니라 전용 2칸을 쓴다.
- Q-8 a(PR-2): 의제취득일 전 상속 재개발 종전자산의 ③ = §166③이고, 엔진은 환산 모드에서만 쓴다.
- 엔진 입력 결함 응답 정책(`lib/api/tax-error-response.ts` — 2026-09-30): 호출자 입력의 결함은 `INVALID_INPUT` → **400**, 그 밖의 코드(세율 누락 등)는 500. ⑫ refine은 정확한 경로를 싣고 이 매핑은 안전망이다.
- 다건 route는 컴패니언을 거부한다(`transfer-tax-schema-multi-refines.ts:87`) — 컴패니언 검사는 단건 스키마 루프 하나다.

## 1. 법령

새로 인용하는 조문이 없다. 문구는 기존 ⑫·⑧이 쓰는 「§166③ 분자·분모」 표기를 그대로 쓴다.

## 2. 현행 실측 (probe · mock 세율 · master `d50944d30`)

시료(PR-7b-4 anchor와 같은 값): 재개발 완공 아파트 · 2026-02-16 양도 · 인가 2009-10-23 · 평가액 219,218,500 · 인가일 개별주택가격(D) 132,000,000 · 취득당시 개별주택가격(분자) 85,034,988 → §166③ 141,221,534. 함께 양도는 매매 주택(주 자산) + 재개발(컴패니언). 「⑧」은 화면 검증 오류 칸, 「응답」은 route.

### 2.1 컴패니언 — 분모(D)를 비우면 500

| 시료 | ⑧ | 응답 |
|---|---|---|
| C0 부담부증여 시가 · 매매 K-5(환산) · 정상 | 통과 | 200 · 컴패니언 13,023,566 · 묶음 31,552,700 |
| **C1** 같음 · D·분자 비움 | D 칸 | **500** `TAX_RATE_NOT_FOUND` 「redev-split: managementDisposalHousingPrice(D) must be > 0」 |
| **C1a** D만 비움 | D 칸 | **500** |
| **S1** 일반 양도 · 매매 환산 컴패니언 · D 비움 | D 칸 | **500** |
| **A1** API · 컴패니언 토지 출자 · 개별공시지가 2칸 없음 | — | **500** 「…landStdPriceAtAcq·landStdPriceAtApproval must be > 0」 |
| **A3** API · 컴패니언 D = 0 | — | **500** |
| C2 매매 K-4(실지) 컴패니언 · D 비움 | 통과 | 200 · 9,245,083(환산이 아니라 D를 쓰지 않는다 — 정상) |

- **원인** — ⑫ §166③ 검사(`transfer-tax-schema-refines.ts:440-511`)는 `addPropertyRefines` 안에 있어 **주 자산만** 본다. 컴패니언 루프(`transfer-tax-schema.ts:163-180`)는 이 검사를 부르지 않는다. 엔진은 D가 없으면 `TaxRateNotFoundError`를 던지고(`redevelopment-split.ts:218` · 형제 `redevelopment-land-contribution.ts:130` · `redevelopment-housing-contribution.ts:156·161`) route가 그 코드를 500으로 응답한다(`tax-error-response.ts` — `INVALID_INPUT`만 400).
- 메모리 기록(「매매 K-5 컴패니언」)보다 넓다 — 일반 양도 환산 컴패니언(S1)과 토지 출자(A1)도 같다.

### 2.2 분자(취득당시 개별주택가격)를 비우면 200 · 조용한 오답 — 주 자산도 같다

| 시료 | ⑧ | 응답 | 정상 입력 |
|---|---|---|---|
| **P3** 부담부증여 K-5 **주 자산** · 분자만 비움 | 분자 칸 | 200 · **26,042,413** | 13,023,566 |
| **P4** 일반 양도 환산 **주 자산** · 분자만 비움 | 분자 칸 | 200 · **94,081,180** | 55,836,614 |
| C1b 부담부증여 K-5 컴패니언 · 분자만 비움 | 분자 칸 | 200 · 26,042,413 | 13,023,566 |
| S1b 일반 양도 환산 컴패니언 · 분자만 비움 | 분자 칸 | 200 · 묶음 178,282,239 | — |
| A4 API · 컴패니언 분자 0 | — | 200 · 150,081,180 | 109,824,857 |

- **원인** — 엔진은 분자를 `P_A = acquisitionHousingPrice ?? 0`(`redevelopment-valuation.ts:198`, 최초공시일 전 단서가 성립하지 않을 때)으로 두고 `평가액 × 0 ÷ D = 0`을 오류 없이 반환한다(`:202`). ⑫는 분모만 본다(`transfer-tax-schema-refines.ts:500-509`). ⑧은 분자를 요구한다(`transfer-tax-validate-redev.ts:436`) — 화면 경로는 닿지 않는다.
- P4의 94,081,180은 E1-07 주석이 「분모 없으면 취득가액 0」으로 실측해 둔 값(`redevelopment-split.ts:211`)과 같다 — 분모에서 막은 같은 결함이 분자 쪽에 남아 있다.

### 2.3 부담부증여는 `useEstimatedAcquisition`이 아니라 §159 산정방식으로 환산한다 — 주 자산도 500

| 시료(API — 정상 주 자산 본문 변형) | 응답 |
|---|---|
| M0 부담부증여 K-5 주 자산 · 정상 | 200 · 13,023,566 |
| M3 `useEstimatedAcquisition: false` · 정상 | 200 · 13,023,566(엔진이 같은 §166③을 쓴다) |
| **M1** `useEstimatedAcquisition: false` · D 삭제 | **500** |
| **M2** `useEstimatedAcquisition: false` · 분자 삭제 | 200 · **26,042,413** |

- **원인** — 엔진은 부담부증여 재개발의 §166③ 여부를 `acquisitionMethodUsed === "converted"`로 정하고(`transfer-tax-burdened-gift-step.ts:103-107` `redevSec166Conversion`), 하류에 `useEstimatedAcquisition: redevSec166Conversion`을 넘긴다(`:195`). ⑫는 본문 `useEstimatedAcquisition`만 본다(`transfer-tax-schema-refines.ts:483`). 화면 ④는 주 자산에 `true`를 싣지만 컴패니언 본문에는 `false`로 실린다(probe C0 — `burdenedGiftInfo.acquisitionMethod: "converted"`).

### 2.4 의제취득일 전 컴패니언 — D를 비우면 ③ 없이 200

| 시료 | ⑧ | 응답 | §166③ 있을 때 |
|---|---|---|---|
| C3 부담부증여 시가 · 1980 상속 · ① 1억 · D·분자 비움 | D 칸 | 200 · 16,242,413(① 채택) | 13,023,566(③ 채택) |
| C4 같음 · ① 2억 | D 칸 | 200 · 9,245,083 | 9,245,083 |

- 주 자산은 같은 입력이 400이다(PR-7b-4 M-5 — ④가 `useEstimatedAcquisition: true`를 싣고 위 ⑫가 D를 요구). 컴패니언은 그 ⑫가 없어 ③이 조용히 빠진다.

## 3. 설계

### 3.1 ⑫ — §166③ 검사를 공용 함수로 옮기고 컴패니언에서도 부른다

`addPropertyRefines`의 §166③ 블록(`transfer-tax-schema-refines.ts:440-511`)을 새 파일 `transfer-tax-schema-redev-166-3-refines.ts`의 `refineRedevelopment166_3Inputs(data, ctx, prefix = [])`로 옮긴다(경로에 prefix). 주 자산은 그 자리에서, 컴패니언은 루프(`transfer-tax-schema.ts:169` 다음)에서 부른다. 2-point·토지 출자·주택 D 세 갈래와 승계조합원 제외는 그대로다.

### 3.2 ⑫ — 환산 신호에 부담부증여 산정방식을 더한다

`환산 = useEstimatedAcquisition === true ∨ (transferType === "burdened_gift" ∧ burdenedGiftInfo.acquisitionMethod === "converted")`. 후자는 엔진 `redevSec166Conversion`의 본문 쪽 대응이다(Q-2). 2-point 분기 판정은 종전대로 `useEstimatedAcquisition`만 본다 — 부담부증여의 §166③ 전환은 `redevelopment_apt`에만 켜진다(`:104`).

### 3.3 ⑫ — 분자도 요구한다

주택 갈래(토지 출자 아님 · 2-point 아님 · 승계조합원 아님 · 환산)에서 엔진의 P_A가 0이 되면 `redevelopment.acquisitionHousingPrice` 경로로 400:

```
P_A > 0 ⇔ acquisitionHousingPrice > 0
        ∨ (최초공시일 전 취득 ∧ §164⑦ 본문 입력 6칸 — 최초공시 주택가격·토지면적·㎡당 단가 2·건물 기준시가 2)   ← 엔진 canApplyPreDisclosureMain(`redevelopment-valuation.ts:159-166` — 최초공시일 전 취득 ∧ 6칸)과 같은 조건
```

⑧은 같은 갈래에서 분자 칸(또는 §164⑦ 본문 7칸)을 이미 요구한다 — ⑫가 ⑧보다 넓어지지 않는다(Q-1).

### 3.4 엔진 — 입력 결함 throw를 `INVALID_INPUT`으로 · 분자 트립와이어

- §166③ 입력 결함 throw 4곳(`redevelopment-split.ts:218` · `redevelopment-land-contribution.ts:130` · `redevelopment-housing-contribution.ts:156·161`)을 `TaxRateNotFoundError`(500) → `TaxCalculationError(INVALID_INPUT)`(400)로 바꾼다. ⑫가 놓친 조합이 있어도 500 대신 400이 된다(Q-3).
- `redevelopment-split.ts` Step A에서 `valuationResult.meta.numerator`(P_A) ≤ 0이면 같은 방식으로 던진다 — 분모와 같은 대칭. ⑫가 먼저 막으므로 화면·정상 API 경로에서는 닿지 않는다.
- 의제취득일 전 ③ 계산(`resolvePreDeemedRedevelopment166_3Price`)은 바꾸지 않는다 — 그 경로는 null이면 ③ 후보를 0으로 두는 3자 max 비교라 던지지 않는 것이 맞고, 입력 요구는 3.1이 한다.

### 3.5 14 동기화 지점

신규 필드 없음. ⑫(3.1~3.3) · 엔진 오류 응답(3.4)만. ④⑤⑧ · ⑬⑭ 변경 없음 — 화면 경로는 ⑧이 이미 막는다.

## 4. 결정 질문

| # | 쟁점 | 선택지 | 권장 |
|---|---|---|---|
| **Q-1** | 분자(취득당시 개별주택가격)도 ⑫에서 요구하는가 | (a) 요구 — 주 자산·컴패니언 · (b) 분모만(원 기록 범위) | **(a)** — 분자를 비우면 주 자산도 200으로 틀린 세액이다(P4 55,836,614 → 94,081,180). E1-07이 분모에서 막은 「취득가액 0으로 성공」과 같은 결함이다. 조건은 엔진 P_A 판정 그대로라 ⑧보다 넓지 않다 |
| **Q-2** | 부담부증여 산정방식 「환산」을 환산 신호로 보는가 | (a) 본다(3.2) · (b) `useEstimatedAcquisition`만 | **(a)** — 엔진이 그 신호로 §166③을 쓴다(M3 — `useEstimatedAcquisition: false`여도 13,023,566). (b)면 컴패니언 부담부증여 K-5(C1)는 막지만 본문 `useEstimatedAcquisition`이 false인 요청은 계속 500·오답(M1·M2)이다 |
| **Q-3** | 엔진 §166③ 입력 결함 오류의 응답 코드 | (a) `INVALID_INPUT`(400) · (b) 종전 `TaxRateNotFoundError`(500) 유지 | **(a)** — `tax-error-response.ts` 정책이 「호출자 입력의 결함 = 400」이다. 세율 누락이 아닌데 `TAX_RATE_NOT_FOUND`로 응답하던 것도 바로잡힌다. 대가: E1-07 anchor 3건의 단언 `toThrow(TaxRateNotFoundError)`를 `TaxCalculationError` + 코드 `INVALID_INPUT`로 바꾼다(같은 「던진다」를 더 좁게 단언) |

## 5. PR

한 PR: ⑫(3.1~3.3) + 엔진(3.4) + anchor. 취득가액 로직이라 커밋 전 `acquisition-cost-review` 게이트.

## 6. 검증 계획

### 착수 전 안전망 실측 (mutation probe — 실행함)

| P | 변경 | 결과 |
|---|---|---|
| P-0 | 3.1~3.4 초안(이 계획서 그대로)을 적용 | probe 31행: 500 6행(C1·C1a·S1·A1·A3·M1) → 정확한 경로의 400 · 조용한 오답 8행(P3·P4·C1b·S1b·A4·M2 · 의제 C3·C4) → 400 · 정상·실지(C0·C2·P0·P5·S0·A0·M0·M3) 값 그대로. **전체 vitest 42,335건 중 실패 3건** — 모두 E1-07 anchor의 `toThrow(TaxRateNotFoundError)`(Q-3 대가 그대로) |

⇒ 컴패니언 미검사·분자 미검사를 지키는 테스트는 0건이다(안전망 0). 고친 뒤 동작을 고정할 신규 anchor가 필수다.

### 신규 anchor (`__tests__/api/transfer.route.companion-redev-166-3-required.anchor.test.ts` — 폼 → ⑧ → ④ → ⑫ → Route)

- **R-1** 컴패니언 분모 — C1·C1a(부담부증여 K-5) · S1(일반 양도 환산) · A1(토지 출자) · A3(D 0): 400 + `companionAssets.0.redevelopment.{managementDisposalHousingPrice|landStdPriceAtAcq}`(종전 500).
- **R-2** 분자 — P3·P4(주 자산) · C1b·S1b(컴패니언) · A4: 400 + `…redevelopment.acquisitionHousingPrice`(종전 200 · 틀린 세액).
- **R-3** 부담부증여 신호 — M1·M2(`useEstimatedAcquisition: false`): 400(종전 500 · 오답) · M3 정상 200 13,023,566.
- **R-4** 의제 컴패니언 — C3·C4: 400(종전 200 · ③ 누락).
- **R-5** 막지 않음 — 정상 C0(13,023,566 · 31,552,700) · 실지 C2(9,245,083) · 최초공시일 전 §164⑦ 본문 입력만 있고 분자 칸이 빈 주 자산·컴패니언(200 — 엔진이 P_A를 만든다) · 승계조합원.
- **R-6** 엔진 — §166③ 입력 결함 throw가 `TaxCalculationError` · 코드 `INVALID_INPUT`(E1-07 3건 정정) · 분자 0 throw.

### 구현 후 mutation

| P | 무력화 | 실패해야 할 anchor |
|---|---|---|
| P-1 | 컴패니언 루프 호출 제거 | R-1 · R-2 컴패니언 · R-4 |
| P-2 | 분자 검사 제거 | R-2 |
| P-3 | 부담부증여 신호 제거 | R-3 · R-1 C1(컴패니언 본문 `useEstimatedAcquisition: false`) |
| P-4 | §164⑦ 본문 성립 조건 제거(분자 칸만 봄) | R-5 최초공시일 전 |
| P-5 | 승계조합원 제외 제거 | R-5 승계조합원 |
| P-6 | 오류 코드 `TaxRateNotFoundError` 복원 | R-6 |
| P-7 | 엔진 분자 트립와이어 제거 | R-6 분자 0 |

### ⑧ ↔ route 격자

컴패니언·주 자산 × (부담부증여 K-5 · K-4 · 의제 · 일반 양도 환산 · 실지) × (정상 · D 비움 · 분자 비움 · 둘 다 비움)을 수정 전·후 같은 시료로 돌려 「⑧ 통과인데 400」 0 · 500 0 · 「⑧ 막는데 200」 감소를 확인한다.

### 그 밖

- 전체 vitest · tsc · `npx eslint . | grep -E "✖|problems"`.
- E2E: 재개발·부담부증여·함께 양도 spec(PR CI 12샤드).

## 7. 자가 검토 (plan-design-self-review-loop v4 · L3)

### 미검증 레지스터

| ID | 항목 | 검증 방법 | 상태 |
|---|---|---|---|
| V-1 | 단독주택 출자 2-point(입주권 양도 · 청산금 수령) 컴패니언도 같은 공백인가 | API로 컴패니언 재개발 아파트 본문을 `subject: right`로 바꿔 봤다(A2·A2b·A2c) — 칸 유무와 관계없이 세액이 같아(176,160,000) 엔진이 그 분기를 타지 않았다. 실제 모양(입주권 컴패니언)은 시료를 만들지 않았다 | ⏳ 설계 영향 없음 — 3.1이 주 자산과 같은 검사를 그대로 부른다. 구현 때 입주권 컴패니언 시료로 확정 |
| V-2 | 다건 route에도 같은 공백이 있는가 | 다건은 컴패니언을 거부한다(`transfer-tax-schema-multi-refines.ts:87`) · 주 자산은 `addPropertyRefines`가 다건에서도 돈다(`transfer-tax-schema.ts:383`) | ✅ 해당 없음 |
| V-3 | ⑫ 분자 검사가 ⑧보다 넓어지는 조합이 있는가 | ⑧은 같은 갈래에서 분자 칸 또는 §164⑦ 본문 7칸을 요구한다(`transfer-tax-validate-redev.ts:410-439`). ⑫는 엔진 P_A > 0만 본다 — ⑧ 통과 입력은 P_A > 0이다. P-0 전체 실패 0(E1-07 제외) | ✅ |
| V-4 | 승계조합원 엔진 throw(`redevelopment-successor.ts:79` — 같은 `TaxRateNotFoundError`)도 입력 결함인가 | 메시지가 「취득가액을 확인할 수 없습니다」(입력 결함)다. ⑫·⑧이 먼저 막는다고 주석에 있다 | ⏳ 범위 밖(§8) — 같은 정책을 적용할지는 별건 |

### 검토 표

| # | 카테고리 | 우선순위 | 위치 | 문제 | 정정 |
|---|---|---|---|---|---|
| 1 | 누락 | High | 원 기록(`…bg-pr7b.plan.md:349`) | 「매매 K-5 컴패니언」만 적혀 있었다 — 일반 양도 환산·토지 출자 컴패니언도 500(S1·A1) | §2.1 범위 확대 |
| 2 | 누락 | High | §2.2 | 분자 비움은 주 자산도 조용한 오답(P3·P4) — 컴패니언만의 문제가 아니다 | Q-1 · 3.3 |
| 3 | 누락 | High | §2.3 | 부담부증여 주 자산도 본문 신호를 바꾸면 500(M1) | Q-2 · 3.2 |
| 4 | 정책위반 | Medium | 엔진 4곳 | 입력 결함인데 `TAX_RATE_NOT_FOUND` 500 — `tax-error-response.ts` 정책과 어긋난다 | Q-3 · 3.4 |
| 5 | 개선 | Low | 3.4 | 의제 ③ 경로까지 던지게 하면 3자 max 비교가 깨진다 | 그 경로는 바꾸지 않음 |
| 6 | 오류 | Low | 이 계획서 §0·§2·§7 | 자기 인용 줄 번호 오차 4건(E1-07 주석 · 사례 44 실측 줄 · 다건 스키마 호출 줄 · ⑧ PHD 판정 줄 — 1~2줄) | 실측으로 정정 |

### 초판 판정 정정

- 메모리·원 기록은 「컴패니언 ⑫에 §166③ **분모** 검사가 없다 · 매매 K-5 컴패니언 500」이었다. **불완전했다** — 같은 검사가 (1) 컴패니언 전체에 없고(일반 양도·토지 출자 포함), (2) 분자를 보지 않아 주 자산도 조용한 오답이며, (3) 부담부증여 주 자산은 엔진과 다른 환산 신호로 판정한다. ⇒ 범위를 「§166③ 입력 검사를 엔진 판정과 같게 · 주 자산·컴패니언 공용」으로 넓힌다.

## 8. 범위 밖

- 승계조합원 엔진 throw의 오류 코드(V-4).
- 일반 양도 의제취득일 전 상속 재개발 컴패니언에서 ⑧은 D를 요구하는데 엔진은 환산 모드가 아니면 §166③을 쓰지 않아 200(probe S3 — 「⑧ 막는데 200」 방향 · 세액 오류 없음).
- 컴패니언 부담부증여 K-5 본문의 `useEstimatedAcquisition`이 주 자산(true)과 다르게 false로 실리는 ④ 차이 — 엔진은 산정방식으로 판정해 세액 영향 없음. 3.2가 ⑫에서 흡수한다.

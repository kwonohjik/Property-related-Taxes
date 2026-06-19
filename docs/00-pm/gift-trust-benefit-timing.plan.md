# 신탁이익의 증여(§33) — 원본·수익 증여시기 분리 (증여일 단일 고정 버그 수정)

> worktree: `.claude/worktrees/gift-trust-timing` (feat/gift-trust-timing ← origin/master `ae81842f`, DEV 3006 / E2E 3106)
> 법령 인용은 KoreanLaw MCP 본문 실측(2026-06-19, 상증법 mst 276123 / 상증령 283637 / 상증칙 284609). 코드 file:line은 fresh 트리 실측.

## 1. 배경 · 버그 요지

신탁이익의 증여(§33) 결과 화면(이미지)은 **증여일을 단일 날짜(2023-01-03) 하나로 고정**하고, 그 한 날을 기준으로 원본권(800,000,000)과 수익권(현가합 197,183,628)을 합산해 증여재산가액(997,183,628)을 산정한다.

그러나 §33①은 **원본을 받을 권리(1호)와 수익을 받을 권리(2호)를 각각 별개의 증여로** 보며, 증여일은 "원본 또는 수익이 **실제 지급되는 날** 등"(§25①)이다. **원본 지급시기와 수익 지급시기는 일반적으로 다르므로**(예: 수익은 매년, 원본은 신탁 종료 시), 증여시기를 단일 날짜로 묶는 것은 법령 위반이다.

또한 현재 엔진은 `giftDate`·`giftTimingType`을 **계산에 전혀 사용하지 않고** 수익 할인 연수를 회차 인덱스(n=0,1,2…)로만 계산한다. UI도 "증여시기 … **산식에는 영향 없음**"이라 명시(`shared.tsx:491`).

## 2. 현재 구현 (실측)

### 엔진 — `lib/tax-engine/gift-deemed/trust-benefit.ts`
- `calcTrustBenefit(input)`: `giftDate`·`giftTimingType`을 **참조하지 않음**.
- 수익권 현가: `trustIncomePV(afterTaxIncome, n) = floor(R × 100ⁿ / 103ⁿ)`, `n = 회차 인덱스(0..installments-1)` (L48–58). → 평가기준일=첫 수익시기, 수익 연 1회 지급을 암묵 가정.
- `beneficiaryType`별(L61–66): `same` = `incomeRight + principal` / `diff_principal` = `max(0, principal − incomeRight)` / `diff_income` = `incomeRight`.
- 원본권 = `principal`(신탁재산 가액) 무조건 평가기준일 현재값으로 취급.

### 타입 — `lib/tax-engine/gift-deemed/types.ts:51` `TrustBenefitInput`
- `beneficiaryType` · `trustPropertyValue` · `yieldRate?` · `withholdingRate` · `installments`(회차 수) · `surrenderValue?` · **`giftTimingType?`**(actual·decedent_death·agreed·first_installment) — `giftTimingType`은 엔진 미사용.

### UI — `components/calc/deemed-gift/shared.tsx`
- `TrustBenefitFields`(L442): 수익자 유형 라디오 · 신탁재산 가액 · 수익률 확정 토글 · 원천징수세율 · **"수익 지급 횟수(연)" = `tbInstallments`**(L475) · 해지 일시금 · **증여시기 라디오 `tbGiftTiming`**(L482, 4지) + "**산식에는 영향 없음**"(L491).
- 증여일은 `DeemedFormState.giftDate`(공통) 단일 — 모달 상단 1개(`DeemedDetailModal`).

### API — `lib/calc/gift-deemed-api.ts:17` `trust_benefit` case
- `giftTimingType: form.tbGiftTiming` 전달하나 엔진 미사용. `installments` 회차 수만 의미.

### Zod — `lib/validators/gift-deemed-input.ts` `trustBenefitSchema`
- `installments: int().positive` · `giftTimingType` enum optional.

## 3. 법령 근거 (KoreanLaw 본문 실측)

### 상증법 §33 (신탁이익의 증여)
> ① … 다음 각 호의 어느 하나에 해당하는 경우에는 **원본 또는 수익이 수익자에게 실제 지급되는 날 등 대통령령으로 정하는 날을 증여일**로 하여 … 1. **원본을 받을 권리**를 소유하게 한 경우에는 수익자가 그 원본을 받은 경우 / 2. **수익을 받을 권리**를 소유하게 한 경우에는 수익자가 그 수익을 받은 경우
> ③ … **여러 차례로 나누어 원본과 수익을 받는 경우**에 대한 증여재산가액 계산방법 … 은 대통령령으로 정한다.

→ **원본권·수익권은 별개 증여**, 증여일은 각각 실제 지급일.

### 상증령 §25 (신탁이익의 계산방법 등)
> ① "실제 지급되는 날 등"이란 다음 각 호를 **제외하고는 실제 지급되는 날**: 1. 수익자 수령 전 위탁자 사망 → **위탁자 사망일** / 2. 약정일까지 미지급 → **약정일** / 3. **여러 차례 나누어 지급 → 최초로 지급된 날**(단, 가. 계약일에 원본·수익 미확정 / 나. 위탁자가 해지·수익자 지정변경·잔여재산 귀속 등 **실질 지배·통제** 시 → **실제 지급된 날**).
> ② … 여러 차례 나누어 지급받는 경우의 신탁이익은 **제1항에 따른 증여시기를 기준으로 §61을 준용**하여 평가.

→ 증여시기(평가기준일) = 5분기: 실제지급일 / 사망일 / 약정일 / 분할최초지급일 / 분할단서 실제지급일.

### 상증령 §61 (신탁의 이익을 받을 권리의 평가)
> ① … 다만, **평가기준일 현재** 철회·해지·취소 일시금이 더 크면 그 일시금. 1. **동일수익자** = 평가기준일 현재 신탁재산 가액 / 2. **다른수익자**: 가. 원본권 = 신탁재산 가액 − 나목 합계액 / 나. 수익권 = **평가기준일 현재** 장래 각 연도 수익금을 원천징수상당액 고려해 현가합.
> ② 나목 계산 시 **수익시기가 정해지지 않은 경우** 평가기준일~수익시기 연수는 §62 2호·3호 준용 = **20년 또는 기대여명**.

→ 평가는 **평가기준일(=증여시기) 현재**. 할인 연수 = 평가기준일~각 수익시기. 수익시기 미정 → 20년/기대여명.

### 상증칙 §19의2 (신탁 평가 이자율) — 본문 실측
> ① 영 §61①2호나목 "이자율" = **연 1,000분의 30**(3%). ② 수익률 **미확정 시** = 원본 × 1,000분의 30. ③ 영 §62①1호 이자율 = 연 1,000분의 30.

### 상증령 §62 (정기금 평가) — §61② 준용 대상 본문 실측
> 1. **유기정기금**: 잔존기간 각 연도 정기금 / (1+이자율)ⁿ 합계. **단, 1년분의 20배 초과 불가**. 2. **무기정기금**: 1년분 × **20배**. 3. **종신정기금**: 성별·연령별 **기대여명 연수(소수점 버림)**까지 각 연도 정기금 합계.

→ §61②이 준용하는 것은 §62 **2호·3호의 "연수"**(무기=20년 상당 / 종신=기대여명 floor). **§62 1호의 20배 상한 cap은 §61에 미준용**(연수만 차용) → 신탁 수익권 PV에 20배 cap 미적용.

## 4. 버그 분석

| # | 심각도 | 버그 | 법령 위반 | 코드 |
|---|---|---|---|---|
| **B1** | High | `giftTimingType` 계산 미반영(장식) | §25① 증여시기 5분기가 평가기준일을 결정해야 함 | `trust-benefit.ts` 전체 — giftTimingType 미참조 |
| **B2** | High | 원본권·수익권을 **단일 증여일**로 합산 | §33①1호·2호는 별개 증여(원본 지급일 ≠ 수익 지급일) | `trust-benefit.ts:61–66` `incomeRight + principal` 단일 |
| **B3** | Medium | 수익 할인 연수 = 회차 인덱스 고정(0,1,2) | §61②·§25② — 평가기준일~각 수익시기 실제 연수여야. 평가기준일과 첫 수익시기 불일치 시 오차 | `trust-benefit.ts:48–58` `n = 회차 인덱스` |
| **B4** | Medium | **수익시기 미정(§61②) 미구현** — 20년/기대여명 | §61② 명문 | (구현 부재, 기존 deferred 항목) |

> 비고(D2 분리 확정): 교재 p.557의 997M은 **원본권 증여(800M) + 수익권 증여(197M) 분리 2건의 합**(사용자 확인). 현행 `same` 단일 합산은 **증여시기 분리를 표현 못 하는 것이 버그의 본질** — 합계 금액은 보존하되 §5처럼 2건 분리 산출로 재정의.

## 5. 수정 모델 설계 (권장)

### 5.1 평가기준일(증여시기) 도출 — §25① (B1)
`giftTimingType` → 평가기준일을 **각 권리별로** 결정:
- `actual` 실제지급일 / `decedent_death` 위탁자 사망일 / `agreed` 약정일 / `first_installment` 분할 최초지급일(§25①3호 본문) / (신규) `split_actual` 분할 단서(가·나목) 실제지급일.
- 엔진은 **타입이 아니라 도출된 평가기준일(날짜·연수)** 를 받아야 한다.

### 5.2 원본권·수익권 증여시기 분리 (B2) — **D2 분리 확정**
- **수익권 증여**: 증여시기 = 수익 최초지급일(또는 각 회차) → §61①2호나목 현가합.
- **원본권 증여**: 증여시기 = 원본 실제 지급일(예: 신탁 종료) → §61①1호(원본권=신탁재산 가액)/2호가목(=신탁재산−수익권).
- **항상 별개 증여 2건으로 산출**(증여시기·증여재산가액 분리). 교재도 분리(사용자 확인). 표시 합계는 참고용.
- `beneficiaryType`: `diff_income`=수익권만 / `diff_principal`=원본권만 / `same`=**원본권+수익권 2건 분리**(동일인이 둘 다 수령하되 시기 별개).
- 원본·수익 증여시기가 우연히 같아도 항목은 분리 유지(합계만 동일).

### 5.3 수익권 할인 연수 일반화 (B3·B4)
- 각 수익연도 k의 할인 연수 `nₖ = (수익시기ₖ − 수익권 평가기준일)`(연). 연 1회·평가기준일=첫수익시기면 `nₖ = 0,1,2…`(현행 = 특수케이스, anchor 보존).
- **수익시기 미정**(§61②→§62): 정기금 유형별 연수 —
  - **유기정기금**(`installments` 명시): 입력 회차 수.
  - **무기정기금**(`perpetual`): §62 2호 → **20년**.
  - **종신정기금**(`lifetime`): §62 3호 → **기대여명 연수(소수점 버림 floor)**. → **2023 생명표 테이블 재사용(D3)**, 단 §62 3호는 floor(상속세 §20③ 장애인공제 ceil과 **라운딩 상이** — floor 적용).
- **20배 cap 미적용**: §62 1호 유기정기금의 "1년분 20배 상한"은 §61이 연수만 준용하므로 신탁 수익권 PV에 적용하지 않음.

### 5.4 §61① 단서 일시금 — 분리 시 적용 단위 (D2)
- §61① 단서의 일시금은 **신탁계약 철회·해지·취소 = 신탁 전체 해지** 시 받는 금액 → **분리 2건의 합계(deemedGiftValue)와 비교 Max**(권리별 아님). 현행 엔진의 전체 Max와 동일(하위호환). 일시금 적용 시 분리 표시는 합계로 대체하고 그 취지를 표기.
- (정정: 초안의 "권리별 Max"는 §61① 단서가 전체 해지 일시금이라는 점에서 부정확 → 전체 합계 Max로 확정.)

### 5.5 정수·BigInt
- 기존 `trustIncomePV`(BigInt `100ⁿ/103ⁿ` floor) 재사용. `n`만 인덱스→실제 연수로 일반화.

## 6. 입력 모델 변경 (D1~D4 확정)

**D4 — 신탁 전용 증여일 입력**: 신탁이익은 공통 `giftDate`를 쓰지 않고 신탁 폼 내부(모달)에 아래를 분리 입력. (다른 의제 유형은 공통 `giftDate` 유지.)

`TrustBenefitInput`(types.ts) + `DeemedFormState`(shared.tsx, `tb*`) 추가:
- **`incomeGiftDate`**(수익권 증여시기, §25①) — 분할이면 최초지급일.
- **`principalGiftDate`**(원본권 증여시기, §25①) — 원본 실제 지급일(예: 신탁 종료). `same`/`diff_principal`일 때 필수.
- **`incomeIntervalYears`**(회차 간 연수, 기본 1). 각 회차 평가기준일로부터 실제지급일 개별 입력(`incomeReceiptYears?: number[]`)은 Phase2(D1).
- **`incomeAnnuityType`**(`finite` 유기 / `perpetual` 무기 / `lifetime` 종신) — §61②→§62 연수 분기. `finite`=`installments` / `perpetual`=20년 / `lifetime`=기대여명.
- **`expectedRemainingYears?`**(종신 기대여명) — **D3: 미입력 시 2023 생명표 테이블 조회**(`lib/tax-engine/data/life-expectancy-2023.ts` 재사용), 성별·연령 입력 필요. §62 3호 **floor**(소수점 버림 — §20③ ceil과 다름). 성별·연령 미상이면 무기 20년 안내.
- `giftTimingType` → 평가기준일 도출 규칙으로 승격(장식 제거). `incomeGiftDate`·`principalGiftDate`가 timing type에 따라 의미(실제지급일/사망일/약정일/최초지급일) 결정.

→ 엔진 시그니처: `calcTrustBenefit`가 **원본권 평가기준일 + 수익권 평가기준일 + 회차 간격 + (미정 시)2023 기대여명/20년**을 받아 §61 준용, **원본권·수익권 2건 분리** 반환.

## 7. 14 동기화 지점

엔진 input **확장**(신규 필드) + **result 확장**(2건 분리) → 8 클라이언트 + 6 API 전수:
- ① `DeemedFormState`(tb 신규 필드) · ② `INITIAL_DEEMED` · ③ (persist 미사용) · ④ `gift-deemed-api.ts` trust_benefit 매핑 · ⑤ `TrustBenefitFields`(증여일 분리·정기금 유형·미정 토글·간격) · ⑥ 사이드바 N/A · ⑦ `DeemedGiftResultView`(원본권/수익권 증여시기 분리 표시) · ⑧ `gift-deemed-validate.ts`(정기금 유형·기대여명·분리 증여일).
- **result 타입(`DeemedGiftResult`) 확장**: 현재 `deemedGiftValue` **단일**(types.ts:37) → 신탁은 원본권·수익권 2건이 별개 증여시기이므로 **`subGifts?: { right: "principal"|"income"; giftDate; value; lawRef }[]`** 추가. `deemedGiftValue`=합계(하위호환), 표시·prefill은 subGifts 사용.
- ⑨⑩(컴패니언 N/A) · ⑫ `trustBenefitSchema`(신규 필드) · ⑬ buildDeemedGiftInput body · ⑭ route handler(Date 변환 — `incomeGiftDate`·`principalGiftDate`는 `coerceDates` 대상).
- **Date 직렬화 함정**(CLAUDE.md): 신규 날짜 필드는 `lib/api/date-coerce.ts` `coerceDates`로 route에서 변환 필수(⑭).

## 8. anchor

- **A1 (회귀 보존 — D2 분리 반영)**: 동일수익자·원본8억·수익률10%·원천15.4%·3회차·연1회 → **수익권 증여 = 197,183,628**(PV 회차 [67,680,000 / 65,708,737 / 63,794,891]) + **원본권 증여 = 800,000,000**, 합계 **997,183,628**(교재 p.557). 분리 2건의 각 값·합계 모두 고정. (기존 단일 anchor는 합계로 보존되나, 엔진은 2건 분리 반환.)
- **A2 (증여시기 분리)**: 원본 증여시기 ≠ 수익 증여시기 → 원본권 증여(증여시기 X·800M)·수익권 증여(증여시기 Y·197M)가 **별개 항목**으로 산출(각 증여일 명시).
- **A3 (B3 일반화)**: 첫 수익시기가 평가기준일보다 늦은 경우(예: nₖ = 1,2,3) 할인이 인덱스가 아닌 실제 연수 반영.
- **A4 (§61② 무기)**: `perpetual` → §62 2호 **20년** 현가합.
- **A5 (§61② 종신)**: `lifetime`·성별·연령 → §62 3호 **기대여명 floor** 연수 현가합(2023표).
- **A6 (§61① 단서)**: `surrenderValue` > 합계 → 일시금으로 대체(subGifts 합계 축약).
- 교재/집행기준 추가 예제 확보 시 원단위 `toBe()` 고정(`feedback_pdf_example_test_anchoring`).

## 9. E2E

- 기존 `e2e/gift-deemed-trust-benefit.spec.ts` TB-UI-1(997M)·TB-UI-2(토글) — 회귀 보존(모달 흐름 유지).
- 신규: 원본·수익 증여시기 분리 입력 → 분리 증여재산가액 표시(TT-1), 수익시기 미정(§61②) 20년/기대여명(TT-2).

## 10. 스코프 결정 (확정 — 2026-06-19 사용자)

- **D1 = 이번 PR 구현**: 5.1 giftTimingType 결선 + 5.2 원본/수익 증여시기 분리 + 5.3 할인 연수 일반화 + 5.4 §61② 미정(20년/기대여명) 전부 이번 PR. **per-회차 개별 실제지급일(§25①3호 단서 가·나목)** 정밀 입력만 Phase2 유지.
- **D2 = 분리 (확정)**: 원본권 증여·수익권 증여를 **별개 증여(별개 증여시기·별개 증여재산가액)** 로 산출. **교재 예제도 분리되어 있음**(사용자 확인) → §61①1호 "동일수익자=신탁재산 가액"은 원본권 평가액(신탁재산 가액)을 뜻하고, 수익권은 별도 §61①2호나목 현가합으로 분리. 동일수익자(`same`)도 원본권+수익권 **2건 분리**(합계만 표시용). 추가 판례 검증 불요.
- **D3 = 2023 기대여명 테이블 재사용**: §61②→§62 3호 기대여명은 상속세 기존 테이블(2023 생명표, [[project_inheritance_personal_deduction_20]]) 재사용. 미입력·미정 기본 20년.
- **D4 = 신탁 전용 증여일 입력**: 신탁이익만 공통 `giftDate`를 쓰지 않고 **신탁 폼 내부에 원본권 증여시기·수익권 증여시기를 분리 입력**(다른 의제 유형은 공통 `giftDate` 유지). 모달 구조(PR #298) 내 신탁 전용 영역.

### D2 분리에 따른 결과·연결 구조 (Do 시 확정)
- `DeemedGiftResult`(trust)는 **원본권 증여·수익권 증여 2건**을 itemize(각 증여시기·증여재산가액). 표시 합계 = 두 건 합.
- 증여세 연결(`buildGiftWizardPrefill`): 동일수익자 2건(서로 다른 증여시기)을 마법사에 어떻게 넘길지 — (i) 2건 분리 prefill vs (ii) 우선 큰 건/합계 1건. 마법사가 단일 증여 입력이면 **표시·이관은 분리, 합산은 사용자가 각 증여시기로 별도 신고** 안내. (Do 진입 시 prefill 구조 확정 — `feedback_silent_omission_full_input_enforcement` 준용.)

## 11. 작업 순서 (Do)

1. **Pre-Do anchor**: A1(997M 회귀) + A2(증여시기 분리) 실패 테스트 우선 작성 → 실패 확인.
2. 법령 상수(`legal-codes/inheritance-gift.ts` GIFT.TRUST_*) — §25 증여시기 상수 추가.
3. 타입(`TrustBenefitInput`) + 엔진(`trust-benefit.ts`) — 평가기준일/연수 일반화 + 원본/수익 분리 + §61②.
4. 14지점(④⑤⑦⑧⑫⑬⑭) — UI 증여일 분리·수익시기 미정 토글, API/Zod/route Date 변환.
5. 결과뷰 — 원본권/수익권 증여시기 분리 행.
6. anchor(A1~A4) + 회귀 vitest + E2E(E2E_PORT=3106).
7. `tsc`/`lint`/전체 `npm test` → ship.

## 12. 검증 기준
- [ ] A1 997,183,628 회귀 보존(원본권 800M + 수익권 197M 분리 합)
- [ ] giftTimingType → 입력 날짜(평가기준일) 실제 반영(B1 해소)
- [ ] 원본·수익 증여시기 분리 2건 산출(B2) · `subGifts`
- [ ] 할인 연수 = 실제 연수(B3) · §62 무기20년/종신 기대여명 floor(B4)
- [ ] 신탁 공통 giftDate 검증 skip(분기) · union superRefine 조건 · `coerceDates`(⑭)
- [ ] 14지점 · `tsc` 0 · 전체 `npm test` · E2E green

## 13. 자가 검토 이력 (13단계 루프 — 정정 15건)

**STEP 1~4 계획서 검토×2** (7건): #1 기대여명 §62 floor vs §20 ceil · #2 §62 무기20년/종신 분기 · #3 §62 20배 cap §61 미준용 · #4 `DeemedGiftResult` subGifts 타입 부재 · #5 칙§19의2 인용 보강 · #6(§3 보강) · **#7(ripple) §61① 단서 일시금 = 전체 합계 Max(권리별 아님 — 초안 정정)**.

**STEP 5 엔진설계 생성 → STEP 6~9 검토×2** (4건): #8 `same`=원본+수익(997M)은 §61①1호 문언과 상이 → D2 교재 가정 명시 · #9 기존 `trust-benefit.test.ts` 갱신 · #10 `incomeAnnuityType` optional+`?? finite` 하위호환 · #11 `getLifeExpectancyByGender` 반환형 Do 시 확인.

**STEP 10~11 통합 비교** (1건): #12 계획서 anchor A5(종신)·A6(일시금) 누락 → 설계와 동기화.

**STEP 12 UI설계 생성 → STEP 13 검토** (3건): #13 신탁 공통 giftDate 숨김 시 `validateDeemedInput` L8 오차단 → 신탁 skip 분기 · #14 discriminatedUnion 브랜치 superRefine 불가 → union-level superRefine · #15 `tbGiftTiming` = §25① 라벨(메타), per-right type Phase2.

**통합 정합축**(§10): Input·subGifts·§62 연수·일시금 Max·20배 미적용·997M 가정·anchor A1~A6 — 전부 ✓. **Critical/High 잔존 0**(#1·#2·#4·#8·#9·#13·#14 전부 반영). 추정 잔여: #11(getLifeExpectancy 반환형) Do 시 확인 1건.

> 산출물 3종 디스크 존재: `docs/00-pm/gift-trust-benefit-timing.plan.md` · `docs/02-design/features/gift-trust-benefit-timing.{engine,ui}.design.md`.

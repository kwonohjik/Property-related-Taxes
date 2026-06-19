# 신탁이익의 증여 (§33) — 증여 의제 유형 추가 작업 계획서

> 작성일: 2026-06-19 · 브랜치: `feat/gift-trust-benefit` (worktree `.claude/worktrees/gift-trust-benefit`, slot 4)
> 기준 커밋: `b260f546` (origin/master)
> 검증: KoreanLaw 본문 §33·상증령 §25·§61·상증칙 §19의2 직접 확인(2026-06-19, 현행 시행). 계산사례 anchor는 교재 PDF(이미지 5·6) 원단위.
> 워크플로: `pdf-case-replica-workflow` + `plan-design-self-review-loop` + 14지점 동기화.

## 0. Context

증여 의제 유형 목록(`DeemedTypeSelector`, 현재 19종 §34~§45의5)에 **신탁이익의 증여(상증법 §33)**를 추가하고, 상증령 §61 평가방법(원본·수익 권리별 현재가치)을 구현한다. 가장 이른 증여 의제 조문(§33)인데 현재 누락 상태 — 본 작업으로 보강.

- 신규 유형 1종(`trust_benefit`) + 엔진(`trust-benefit.ts`) + 입력 폼 + 결과.
- 핵심 난이도: **증여시기 4분기(§25①)** × **평가 3분기(§61① 1호/2호가목/2호나목)** + **해지일시금 Max(§61① 단서)** + **수익률 확정/미확정(칙 §19의2②)** + **여러 차례 분할 지급(§33③·§25② → §61 준용 현재가치 합)**.

---

## 1. 법령 근거 (KoreanLaw 본문 검증 완료)

### §33 신탁이익의 증여 (상증법, 현행 20260102)
- 위탁자가 **타인을 수익자로 지정** → 원본/수익이 실제 지급되는 날 등(대통령령)을 **증여일**로, 신탁이익 받을 권리 가액 = 수익자 증여재산가액.
- ①1호: 원본 받을 권리 소유 → 원본 받은 경우 / ①2호: 수익 받을 권리 소유 → 수익 받은 경우.
- ③: 여러 차례 나누어 원본·수익 받는 경우 계산방법 = 대통령령.

### 상증령 §25 신탁이익의 계산방법 등 (증여시기)
①: 증여일 = 원칙 **실제 지급일**. 예외:
- 1호: 수익자 받기 전 위탁자 사망 → **위탁자 사망일**
- 2호: 약정일까지 미지급 → **약정일**
- 3호: **여러 차례 분할 지급 → 최초 지급일**. 단 (가)계약일 원본·수익 미확정 or (나)위탁자가 해지권·수익자지정변경권·잔여재산귀속권 보유 등 **신탁재산 실질지배·통제** 시 → **실제 지급일**.
②: 여러 차례 분할 시 신탁이익 = ①의 증여시기 기준 **§61 준용** 평가.

### 상증령 §61 신탁이익을 받을 권리의 평가
① 평가액 = 다음 각 호 — **단, 해지·철회·취소 일시금 > 각호 평가액이면 일시금**(Max):
- 1호(원본·수익 수익자 **동일**): 평가기준일 현재 상증법 평가 신탁재산 가액.
- 2호(**다름**):
  - 가목(원본 받을 권리): 신탁재산 가액 − 나목 합계액.
  - 나목(수익 받을 권리): 추산 장래 각 연도 수익금에 원천징수세액상당액 고려한 **현재가치 합계** = Σ (각 연도 수익 − 원천징수) / (1+이자율)^n.
② 수익시기 미정 시 연수 = §62 준용(20년 또는 기대여명).

### 상증칙 §19의2 신탁이익·정기금 평가
- ①: §61①2호나목 **이자율 = 연 1,000분의 30 (3%)**.
- ②: 수익률 **미확정** 시 장래 수익금 = **원본 × 1,000분의 30(3%)** (※수익률 확정 시 실제 수익률 사용).

---

## 2. ★ 케이스 매트릭스 (행≥1 — Do 진입 게이트)

### A. 평가 분기 (§61①)
| # | 시나리오 | 법령 | anchor 출처 | 상태 |
|---|---|---|---|---|
| TB-1 | 원본·수익 동일 수익자 — 단일 신탁재산 가액 | §61①1호 | (교재 단순) | ☐ |
| TB-2 | 수익자 다름 — 수익 권리 현재가치 합 | §61①2호나목 | 이미지6 수익 197,183,628 | ☐ |
| TB-3 | 수익자 다름 — 원본 권리(신탁재산−수익권) | §61①2호가목 | 파생 anchor | ☐ |
| TB-4 | 해지일시금 > 평가액 → 일시금 (Max 단서) | §61① 단서 | 경계 anchor | ☐ |
| TB-5 | 수익률 미확정 → 원본×3% 추산 | 칙 §19의2② | 파생 anchor | ☐ |
| TB-6 | 수익시기 미정 → §62 준용 20년 | §61② | (Phase2) | ☐ 보류 |

### B. 증여시기 분기 (§25①)
| # | 시나리오 | 법령 | 증여일 | 상태 |
|---|---|---|---|---|
| TB-D1 | 일반 실제 지급 | §25① 본문 | 실제 지급일 | ☐ |
| TB-D2 | 위탁자 사망 | §25①1호 | 사망일 | ☐ |
| TB-D3 | 약정일 미지급 | §25①2호 | 약정일 | ☐ |
| TB-D4 | 여러 차례 분할 (위탁자 미지배) | §25①3호 본문 | **최초 지급일** | ☐ (계산사례) |
| TB-D5 | 분할 + 위탁자 실질지배·통제 | §25①3호 나목 | 실제 지급일 | ☐ |

### C. 통합 계산사례 anchor (이미지 5·6 — 원단위 toBe 동결)
신탁계약: 위탁자=모, 원본·수익 수익자=자(**동일**), 원본 8억, 2025.1.3~2028.1.3(3년), 수익률 10%(확정), 원천징수 15.4%, 위탁자 실질지배·통제 안 함.
- 증여시기 = **2026.1.3** (최초 분할지급일, §25①3호 본문)
- 세후 연수익 = 800,000,000 × 10% × (1 − 0.154) = **67,680,000**
- 수익¹ (2026.1.3, **n=0** 증여시기·미할인) = 67,680,000 × 100⁰/103⁰ = **67,680,000**
- 수익² (2027.1.3, **n=1**) = 67,680,000 × 100/103 = **65,708,737** (floor)
- 수익³ (2028.1.3, **n=2**) = 67,680,000 × 100²/103² = **63,794,891** (floor)
- 수익 소계 = **197,183,628**
- 원본 (2028.1.3) = **800,000,000** (신탁재산 가액)
- **총 증여재산가액 = 997,183,628** (= 197,183,628 + 800,000,000)

> ⚠️ 해석 포인트(Do anchor가 확정): 동일 수익자(§61①1호)는 본칙상 "신탁재산 가액"이나, **여러 차례 분할 지급(§33③·§25②)** 이면 §61 준용하여 **각 회차(수익 n회 + 원본)의 증여시기 기준 현재가치 합**으로 계산(교재 이미지6). 원본은 신탁재산 가액 그대로(미할인), 수익은 PV 할인. 단일 일시지급이면 §61①1호 단순형. 본 anchor가 분할 산식을 동결한다.

---

## 3. 엔진 설계 (`lib/tax-engine/gift-deemed/trust-benefit.ts` 신규)

### 입력 타입 (`types.ts` `DeemedGiftInput` 유니온에 추가)
```ts
export interface TrustBenefitInput {
  /** §61① 수익자 구성 — 원본·수익 동일/상이 */
  beneficiaryType: "same" | "diff_principal" | "diff_income";
  /** 평가기준일(증여시기) 현재 상증법 평가 신탁재산 가액(원본) */
  trustPropertyValue: number;
  /** 신탁수익률 — 확정 시 실제 율, 미확정이면 undefined → 칙§19의2② 원본×3% */
  yieldRate?: { numer: number; denom: number };
  /** 원천징수세율 (예: 15.4% = {154,1000}) */
  withholdingRate: { numer: number; denom: number };
  /** 분할 지급 횟수(=계약기간 연수) — 현가합 항 수, 연차 n=0..installments-1 (n=0=증여시기 미할인) */
  installments: number;
  /** 해지·철회·취소 일시금 (Max 비교, 미입력 0) */
  surrenderValue?: number;
  /** §25① 증여시기 분기 echo (표시 전용): actual/decedent_death/agreed/first_installment */
  giftTimingType?: "actual" | "decedent_death" | "agreed" | "first_installment";
  // Phase2: incomeTimingUndetermined?(§61② 수익시기 미정 → §62 준용 20년) — 계산사례 확정기간이라 제외
}
```

### 알고리즘 (정수 연산 — §37 현가합 모델 + BigInt PV)
**모델: `free-realestate-use.ts:22-28`** (§37 5년 현가합) — `applyRateFraction`(분수 정수곱) + 1/(1+r)ⁿ 정수경로(§37은 10ⁿ/11ⁿ=1/1.1ⁿ). 신탁은 r=3% → **100ⁿ/103ⁿ**. 단 신탁은 장기(n 큼) 가능 → **PV는 BigInt 거듭제곱**(§37의 Number `safeMultiplyThenDivide`는 n≥8서 `103⁸>MAX_SAFE_INTEGER` 정밀도 손실).
```
세후 연수익 R = applyRateFraction(trustPropertyValue, yieldNumer, yieldDenom)   // 원본×수익률
              R = R − applyRateFraction(R, withhNumer, withhDenom)            // − 원천징수
  · yieldRate 미확정 → {numer:30, denom:1000} (칙 §19의2② 원본×3%)
수익권 평가 = Σ_{n=0}^{installments-1} Number(BigInt(R) × 100ⁿ / 103ⁿ)  // BigInt, n=0=증여시기 미할인
  · n=0: 100⁰/103⁰ = 1 → R 그대로 (계산사례 수익¹ 67,680,000). BigInt 나눗셈=양수 floor
신탁이익 (이 수익자분) = beneficiaryType별 직접 분기:
  · "same"           → 수익권평가 + trustPropertyValue          // 둘 다 수령 (계산사례 997,183,628)
  · "diff_income"    → 수익권평가                                // 수익만 수령
  · "diff_principal" → trustPropertyValue − 수익권평가           // 원본만 §61①2호가목 (수익권은 他수익자분)
평가액 = Max(신탁이익, surrenderValue ?? 0)    ← §61① 단서
```
- **연차 인덱스 0-based**: 증여시기(최초지급일)에 받는 첫 회차 = n=0(미할인). §37(n=1..5)과 다름 — 계산사례 수익¹(2026.1.3=증여시기)이 67,680,000 미할인이 이를 확정.
- **1원 오차**: `safeMultiplyThenDivide`는 floor — 교재가 floor와 일치(65,708,737·63,794,891). `bigint-round-half-up` 불요(§37과 동일 정책).
- 동일 수익자(계산사례)도 §25②(분할 지급) → **각 증여 event별 §61 준용**: 수익 증여(최초지급일, PV합) + 원본 증여(만기, 신탁재산 가액). §61①1호 "신탁재산 가액"은 원본권 평가에 적용, 수익권은 별도 PV합 → 합산 997,183,628.
- `DeemedGiftResult` 재사용: `deemedGiftValue`=평가액, `breakdown`=회차별 PV 행(formula-display-builder), `legalBasis`=GIFT.TRUST_BENEFIT.

### 법령 상수 (`legal-codes/inheritance-gift.ts` GIFT.*)
- `GIFT.TRUST_BENEFIT = "상증법 §33"`, `GIFT.TRUST_BENEFIT_VALUATION = "상증령 §61"`, `GIFT.TRUST_BENEFIT_RATE = "상증칙 §19의2"`. (기존 GIFT 상수 패턴 확인 후 추가)

---

## 4. 14지점 동기화

| # | 지점 | 위치 | 작업 |
|---|---|---|---|
| 타입 | `DeemedGiftType` 유니온 | `gift-deemed/types.ts:9` | `\| "trust_benefit"` 추가 |
| 유니온 | `DeemedGiftInput` | `types.ts:238` | `({type:"trust_benefit"} & TrustBenefitInput)` |
| 엔진 | 신규 모듈 | `gift-deemed/trust-benefit.ts` | `calcTrustBenefit(input)` |
| 라우터 | dispatch | `gift-deemed/router.ts` | `case "trust_benefit"` |
| ① 폼옵션 | `TYPE_OPTIONS` | `deemed-gift/shared.tsx:330` | `{value:"trust_benefit", label:"신탁이익의 증여", description:"상증법 §33 — 원본·수익 권리 현재가치(령§61)", testId:...}` |
| ② 라벨맵 | (shared.tsx:300~) | 〃 | `trust_benefit: {label, law:"상증법 §33"}` |
| ⑤ 입력폼 | `DeemedInputFields` switch | `shared.tsx:374` + `*-forms.tsx` | `TrustBenefitFields` (수익자구성 라디오·원본·수익률·원천징수·기간·해지일시금) |
| ⑦ 결과 | `DeemedGiftResultView` | 공통 | breakdown 회차별 PV — 추가 작업 최소 |
| ⑫ Zod | gift-deemed 입력 스키마 | **`lib/validators/gift-deemed-input.ts`** `deemedGiftInputSchema`(discriminatedUnion) | `trustBenefitSchema = z.object({type: z.literal("trust_benefit"), ...})` 추가 후 union에 push (누락 시 침묵 strip) |
| ⑭ Route | 엔진 input 매핑 | `app/api/calc/gift-deemed/route.ts:42` | `deemedGiftInputSchema.safeParse(body)` → `calcDeemedGift`. 추가 변환 거의 없음(날짜는 증여시기 연차만, UI에서 installments 전달) |

> ⚠️ Zod 제약 (gift-deemed-input.ts:4-5): **각 브랜치는 순수 `z.object`** — `superRefine`은 ZodEffects라 discriminatedUnion 불가. `trustBenefitSchema`는 순수 object로 작성, 교차검증은 엔진/validate에서.
> router(`gift-deemed/router.ts:24` switch)·forms(`shared.tsx:374` switch + 신규 `TrustBenefitFields`)는 STEP 5 설계 문서에서 구체화.

---

## 5. Pre-Do anchor (강제 — `pre-do-anchor-verification`)
1. **TB-2/계산사례 (최우선)**: 위 §2-C 입력 → `calcTrustBenefit().deemedGiftValue` = 997,183,628, breakdown 수익¹²³ = 67,680,000·65,708,737·63,794,891·소계 197,183,628·원본 800,000,000. 원단위 `toBe()`. 현재 엔진 미구현 → 실패 확보.
2. **PV floor 일치 검증**: 65,708,737·63,794,891이 floor로 재현되는지(반올림 아님) — 분수 BigInt 거듭제곱 헬퍼 단위 anchor.

---

## 6. 리스크·미검증 (Do 단계 확정)
- **동일 수익자 분할 vs 단순**: §61①1호 단순형(신탁재산 가액)과 §25②분할(PV 합)의 적용 경계 — 계산사례는 분할 PV합. 단일 일시지급 케이스 anchor로 양쪽 구분 동결.
- **원본 미할인 여부**: 계산사례에서 원본 800M 미할인(신탁재산 가액). 원본 받을 권리도 만기 PV 할인해야 하는지 — 교재는 미할인 → 교재 따름(법령 정확성 우선, §61①1호 "평가기준일 현재 신탁재산 가액").
- **이자율 거듭제곱 1원 오차**: `bigint-round-half-up` vs floor — TB-2 anchor가 floor 일치 확인 후 정책 동결.
- **Zod/route/forms 파일 미독** — Do grep 확정. `gift-deemed` 자체 API 스키마·결과뷰 breakdown 렌더 패턴.
- **2열 그리드 배치**: 23종으로 늘어나면 홀수 → 마지막 1개 단독. `RadioCardGroup columns={2}`(feat/gift-2col) 머지 후 자동 적용.
- **수익시기 미정(§61②·§62 준용 20년/기대여명)**: Phase2 — 계산사례는 확정 기간(3년)이라 Phase1 제외.

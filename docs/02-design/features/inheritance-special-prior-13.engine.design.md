# inheritance-special-prior-13 엔진 설계서
# 조특법 §30의5⑧⑨·§30의6⑤ — 창업자금·가업승계 특례의 상속세 §13 연계

> 작성: 2026-06-11
> 브랜치: feat/inh-special-13 (worktree)
> 선행: PR #120 — PriorGift.specialTreatmentType 필드 신설 (증여 스트림 소비 완료)
> 법령 MST: 조특법 286597 (시행 2026-06-02) · 상증법 276123 (시행 2026-01-02)
> 법령 검증: KoreanLaw MCP 직접 조회 완료 (2026-06-11)

---

## 1. 법문 원문 (직접 인용 — 추정 없음)

### 조특법 §30의5⑧ (창업자금 상속 가산)
> "창업자금은 「상속세 및 증여세법」 제3조의2제1항을 적용할 때 상속재산에 가산하는 증여재산으로 본다."

해석: 창업자금은 상증법 §3의2①의 상속재산 가산 증여재산으로 의제됨.

### 조특법 §30의5⑨ (§13 기간 무관 가산 + §24 분모 제외)
> "창업자금은 「상속세 및 증여세법」 제13조제1항제1호를 적용할 때 **증여받은 날부터 상속개시일까지의 기간과 관계없이** 상속세 과세가액에 가산하되,
> 같은 법 **제24조제3호를 적용할 때에는 상속세 과세가액에 가산한 증여재산가액으로 보지 아니한다**."

해석:
- §13①1호 10년 cutoff 무시 → 기간 무관 과세가액 가산
- §24 3호 공제한도 분모에서는 제외 (공제 한도 유리화)

### 조특법 §30의5⑩ (§28 특례세액 공제)
> "창업자금에 대한 증여세액에 대하여 「상속세 및 증여세법」 제28조를 적용하는 경우에는
> 같은 조 제2항에도 불구하고 **상속세 산출세액에서 창업자금에 대한 증여세액을 공제**한다.
> 이 경우 공제할 증여세액이 상속세 산출세액보다 많은 경우 그 차액에 상당하는 증여세액은 환급하지 아니한다."

해석:
- 일반 §28①의 "안분 한도" 없이 창업자금 증여세액을 산출세액에서 직접 전액 공제
- 단, 공제 후 음수 불가 (환급 없음)

### 조특법 §30의6⑤ (가업승계 준용)
> "제1항에 따른 주식등의 증여에 관하여는 제30조의5제8항부터 제13항까지의 규정을 준용한다.
> 이 경우 '창업자금'은 '주식등'으로 본다."

해석: ⑧⑨⑩ 모두 가업승계 주식("family_business")에 동일하게 적용됨.

---

## 2. 현행 갭 (실측 file:line — 추정 없음)

| # | 갭 | 현행 코드 위치 | 실측 근거 |
|---|---|---|---|
| G1 | §13①1호 10년 cutoff만 적용 — specialTreatmentType 무시 | `inheritance-gift-common.ts:403` `isWithin13Cutoff()` | grep 확인: 함수 내부에 specialTreatmentType 분기 없음 |
| G2 | `aggregatePriorGiftsForInheritance` — 특례 prior도 동일 cutoff 적용 | `inheritance-gift-common.ts:421-443` | isWithin13Cutoff 호출 단일 분기만 |
| G3 | `cutoffFilteredGifts` — STEP 4.5에서 isWithin13Cutoff만 필터 | `inheritance-tax.ts:245-247` | 필터 단일 조건 확인 |
| G4 | `computePriorGiftDeductionForLimit` — §24 3호 분모에 특례 prior 포함 | `deductions/inheritance-deduction-limit.ts:136` | isWithin13Cutoff 필터만, specialTreatmentType 분기 없음 |
| G5 | `calcGiftTaxCredit` — §28① 일반 안분으로 처리(§30의5⑩ 별도 산식 미적용) | `inheritance-gift-tax-credit.ts:60-144` | §10 "안분 한도 없이 직접 공제" 미구현 |

---

## 3. 케이스 매트릭스

### 3.1 §13 가산 × specialTreatmentType × 기간 조합

| Case | specialTreatmentType | 증여일 | 상속개시일 | 경과 | 현행 동작 | 기대 동작 |
|---|---|---|---|---|---|---|
| C-1 일반 prior, 8년 | undefined | 2016-01-01 | 2024-01-01 | 8년 (상속인) | 가산 ✓ | 가산 ✓ (무변경) |
| C-2 일반 prior, 12년 | undefined | 2012-01-01 | 2024-01-01 | 12년 (상속인) | 제외 ✓ | 제외 ✓ (무변경) |
| C-3 일반 prior, 4년 비상속인 | undefined | 2020-01-01 | 2024-01-01 | 4년 (비상속인) | 가산 ✓ | 가산 ✓ (무변경) |
| C-4 일반 prior, 6년 비상속인 | undefined | 2018-01-01 | 2024-01-01 | 6년 (비상속인) | 제외 ✓ | 제외 ✓ (무변경) |
| **C-5 특례, 8년** | "startup" | 2016-01-01 | 2024-01-01 | 8년 | 가산 ✓ | 가산 ✓ (무변경이지만 §30의5⑨로 근거 명확화) |
| **C-6 특례, 12년** | "startup" | 2012-01-01 | 2024-01-01 | 12년 | **제외 ✗ (현행 버그)** | **기간 무관 가산 ✓ (§30의5⑨)** |
| **C-7 특례, 15년** | "startup" | 2009-01-01 | 2024-01-01 | 15년 | **제외 ✗** | **기간 무관 가산 ✓** |
| **C-8 가업, 12년** | "family_business" | 2012-01-01 | 2024-01-01 | 12년 | **제외 ✗** | **기간 무관 가산 ✓ (§30의6⑤ 준용)** |

### 3.2 §24 3호 분모 포함/제외

| Case | specialTreatmentType | §24 분모(netPriorGiftDeducted) 포함 여부 | 현행 | 기대 |
|---|---|---|---|---|
| D-1 일반 prior | undefined | 포함 | 포함 ✓ | 포함 ✓ (무변경) |
| **D-2 특례 prior** | "startup" / "family_business" | 제외해야 함 | **포함 ✗** | **제외 ✓ (§30의5⑨ 단서)** |
| D-3 혼합 (일반+특례) | 각각 | 일반만 포함 | **전체 포함 ✗** | **일반만 포함 ✓** |

§24 3호 단서: 과세가액 > 5억 시에만 분모 차감. 이 게이트는 특례 여부와 무관하게 동일 적용.

### 3.3 §28 증여세액공제 — 일반 vs 특례

| Case | specialTreatmentType | 현행 공제 방식 | 기대 공제 방식 |
|---|---|---|---|
| E-1 일반 prior | undefined | §28① 안분 한도 | §28① 안분 한도 ✓ (무변경) |
| **E-2 특례 prior** | "startup" | §28① 안분 한도 (오류) | §30의5⑩ — 산출세액에서 직접 전액 공제 (안분 없음) |
| **E-3 특례 prior** | "family_business" | §28① 안분 한도 (오류) | §30의6⑤→§30의5⑩ 준용 — 동일 |
| **E-4 혼합** | 각각 | 전체 §28① 안분 | 일반분: §28① 안분 / 특례분: §30의5⑩ 직접 |

### 3.4 일반 prior 기존 동작 보존 — 회귀 방어 매트릭스

| 케이스 | 특례 필드 유무 | 기존 테스트 | 변경 후 동작 |
|---|---|---|---|
| 배우자+자녀 기본, prior 없음 | 없음 | 855개 현행 통과 | 무변경 보장 |
| 배우자공제 분자 cutoff (section13-cutoff-day-precision) | 없음 | CUTOFF-B1~B3 통과 | specialTreatmentType=undefined 시 동일 경로 |
| §24 한도 분모 일반 prior | 없음 | deduction-limit 테스트 | specialTreatmentType=undefined → 기존 포함 로직 동일 |
| §28 안분 한도 일반 prior | 없음 | credit 테스트 | specialTreatmentType=undefined → 기존 안분 로직 동일 |

---

## 4. 엔진 설계 — 변경 위치 및 방식

### 4.1 `isWithin13Cutoff` 확장 (inheritance-gift-common.ts:403)

**설계 원칙**: 기존 함수 시그니처 **보존**. 특례 prior는 항상 true 반환으로 기간 무관 가산.

```typescript
// 현행
export function isWithin13Cutoff(gift: PriorGift, deathDate: string): boolean {
  const giftDate = new Date(gift.giftDate);
  const limitYears = gift.isHeir ? 10 : 5;
  const boundary = subYears(new Date(deathDate), limitYears);
  return !isBefore(giftDate, boundary);
}

// 변경 후 — specialTreatmentType 분기 추가
export function isWithin13Cutoff(gift: PriorGift, deathDate: string): boolean {
  // §30의5⑨·§30의6⑤: 특례 prior는 기간 무관 가산 (cutoff 적용 안 함)
  if (gift.specialTreatmentType !== undefined) return true;
  // 일반 prior: 기존 10년/5년 cutoff 동일
  const giftDate = new Date(gift.giftDate);
  const limitYears = gift.isHeir ? 10 : 5;
  const boundary = subYears(new Date(deathDate), limitYears);
  return !isBefore(giftDate, boundary);
}
```

**영향**: `aggregatePriorGiftsForInheritance`, `cutoffFilteredGifts`, `calcGiftTaxCredit`(§28 eligible 필터), `computePriorGiftDeductionForLimit` 모두 이 함수를 경유하므로 **단일 수정**으로 G1~G3 일괄 해결.

**일반 prior 보존 증명**: `specialTreatmentType === undefined` 분기는 기존 코드와 **동일 경로** — 회귀 없음.

### 4.2 `computePriorGiftDeductionForLimit` §24 3호 분모 특례 제외 (inheritance-deduction-limit.ts:136)

§24 3호 단서: 특례 prior는 "가산한 증여재산가액으로 보지 아니함" → 분모에서 제외.

```typescript
// 변경 후 — specialTreatmentType 있는 prior는 §24 분모 계산에서 skip
for (const g of preGifts) {
  if (!isWithin13Cutoff(g, deathDate)) continue;  // 4.1 변경으로 특례 prior는 이미 통과
  // §30의5⑨ 단서: 특례 prior는 §24 3호 분모 대상에서 제외
  if (g.specialTreatmentType !== undefined) continue;
  // 이하 기존 로직 동일
  if (g.giftTaxBase !== undefined) { ... }
  else if (g.doneeRelation) { ... }
}
```

**영향 범위**: `applyDeductionLimit`의 `totalPriorGiftAmount` 파라미터는 G5 공제한도 분모 계산에서 호출됨.
- `inheritance-tax.ts:441` — `computePriorGiftDeductionForLimit(preGifts, input.deathDate)` → 특례 제외 자동 적용
- `deductionLimitParams.priorGiftDeductionTotal` 변경됨 → §24 ceiling 상승 → 공제한도 넓어짐

### 4.3 `calcGiftTaxCredit` §28 vs §30의5⑩ 분리 (inheritance-gift-tax-credit.ts)

§30의5⑩: 특례 prior의 증여세액은 "안분 없이 산출세액에서 직접 공제, 초과환급 불가".

**설계**: `calcInheritanceTaxCredits` 내부에서 eligible prior를 일반/특례로 분리 후 별도 처리.

```typescript
// inheritance-gift-tax-credit.ts:212 부근
const allPriorGifts = creditInput.priorGifts ?? [];
const eligiblePriorGifts = deathDate
  ? allPriorGifts.filter((gift) => isWithin13Cutoff(gift, deathDate))
  : allPriorGifts;

// 일반 prior — §28① 안분 한도
const normalPriorGifts = eligiblePriorGifts.filter(
  (g) => g.specialTreatmentType === undefined
);
const { creditAmount: giftTaxCredit, breakdown: giftBreakdown } =
  calcGiftTaxCredit(normalPriorGifts, totalComputedTax, taxBase ?? 0, taxableEstateValue);

// 특례 prior — §30의5⑩ 직접 공제 (안분 없음, 초과환급 불가)
const specialPriorGifts = eligiblePriorGifts.filter(
  (g) => g.specialTreatmentType !== undefined
);
const specialTaxPaid = specialPriorGifts.reduce((s, g) => s + g.giftTaxPaid, 0);
// 한도: 산출세액 − 일반 §28 공제분 (remainingTax)
const specialTaxCredit = Math.min(specialTaxPaid, Math.max(0, totalComputedTax - giftTaxCredit));
```

**결과 반영**: `specialTreatmentCredit` 필드(현행 항상 0) → 실제값으로 갱신.

### 4.4 변경 대상 파일 요약

| 파일 | 변경 내용 | 영향 범위 |
|---|---|---|
| `lib/tax-engine/inheritance-gift-common.ts` | `isWithin13Cutoff` — specialTreatmentType 분기 추가 (+4줄) | G1·G2·G3 동시 해결 |
| `lib/tax-engine/deductions/inheritance-deduction-limit.ts` | `computePriorGiftDeductionForLimit` — 특례 prior skip | G4 해결 |
| `lib/tax-engine/inheritance-gift-tax-credit.ts` | §28 eligible prior 분리 + §30의5⑩ 직접 공제 | G5 해결 |

**14개 동기화 지점 영향**:
- 이번 변경은 **엔진 내부 로직 수정** — 신규 입력 필드 없음 (specialTreatmentType은 PR #120에서 이미 추가됨)
- ①~⑦ UI 지점: 무변경 (필드는 이미 존재)
- ⑧ validation: 무변경 (신규 필드 없음)
- ⑨~⑭ API/Zod: 무변경 (Zod에 이미 specialTreatmentType optional 정의)
- **신규 result 필드**: `specialTreatmentCredit` 값 변화 → ⑦ 결과뷰에서 이미 처리 중 (현행 0 → 실제값)

---

## 5. §28⑩ 기납부 특례세액 — priorSpecialTaxPaid 재사용 여부

`PriorGift.priorSpecialTaxPaid`: 증여세 엔진에서 특례 스트림 이전 회차 납부세액 기납부 공제용.

상속세 §28/§30의5⑩ 맥락에서:
- 상속세 엔진에서 사용하는 필드는 `giftTaxPaid` (증여 당시 납부한 세액) → §30의5⑩ 공제 분자
- `priorSpecialTaxPaid`는 증여세 엔진 전용 (특례 스트림 2차 이상 합산 시 기납부 차감)
- 상속세 경로에서 `priorSpecialTaxPaid`는 **사용하지 않음** — `giftTaxPaid`로 충분

**결론**: 별도 필드 추가 불필요. 기존 `giftTaxPaid`를 §30의5⑩ 공제액으로 사용.

---

## 6. 상속 회귀 영향 분석

### 6.1 specialTreatmentType=undefined 경우 — 완전 무변경

`isWithin13Cutoff`의 첫 번째 분기: `if (gift.specialTreatmentType !== undefined) return true;`
- undefined인 일반 prior는 이 분기를 통과 않음 → **기존 10년/5년 로직 100% 동일**

`computePriorGiftDeductionForLimit`의 skip 조건: `if (g.specialTreatmentType !== undefined) continue;`
- undefined인 일반 prior는 skip 없음 → **기존 §24 분모 계산 100% 동일**

`calcInheritanceTaxCredits`의 분리: `normalPriorGifts = eligiblePriorGifts.filter(g => g.specialTreatmentType === undefined)`
- 특례 prior 없을 때 `normalPriorGifts === eligiblePriorGifts` → **기존 §28① 로직 100% 동일**

### 6.2 영향 테스트 디렉터리

회귀가 0이어야 하는 기존 테스트:
- `__tests__/tax-engine/inheritance/section13-cutoff-day-precision.test.ts` — isWithin13Cutoff 일(日) 단위 경계 (CUTOFF-A1~C3)
- `__tests__/tax-engine/inheritance/prior-gift-taxbase-manual.test.ts` — GTB-01~04
- `__tests__/tax-engine/inheritance/deduction-detail-accordion.test.ts` — §24 한도 상세
- `__tests__/tax-engine/inheritance/` 전체 855개 테스트

신규 케이스 필요 테스트:
- C-6 특례 12년: specialTreatmentType="startup", 12년 전 증여 → 가산 확인
- D-2 §24 분모 제외: 특례 prior 있을 때 ceiling 상승 확인
- E-2 §30의5⑩ 직접 공제: 안분 없이 전액 공제 확인

---

## 7. Pre-Do Anchor 설계

### 파일: `__tests__/tax-engine/inheritance-gift/inheritance-special-prior-13-anchor.test.ts`

#### (a) C-6: 특례 prior 12년 전 → 기간 무관 가산

**시나리오**:
- 상속개시일: 2024-01-01
- 창업자금 증여: 2012-01-01 (12년 전, 일반 §13①1호 10년 cutoff 도과)
- 증여금액: 300,000,000원
- 상속재산: 1,000,000,000원
- 상속인: 자녀 1명 (isHeir=true)

**현행 동작 (버그)**:
- `isWithin13Cutoff` → false (12년 > 10년)
- `priorGiftAggregated` = 0 (미가산)
- `taxableEstateValue` = 1,000,000,000

**기대 동작 (구현 후)**:
- `isWithin13Cutoff` → true (specialTreatmentType="startup" 무조건)
- `priorGiftAggregated` = 300,000,000
- `taxableEstateValue` = 1,300,000,000

#### (b) D-2: §24 분모 특례 제외 → ceiling 상승

**시나리오** (위 a와 동일 입력):
- 과세가액 5억 초과 → §24 3호 단서 적용됨
- 일반 §24 분모 계산: totalPriorGiftAmount = 300M (특례 포함)
- 증여재산공제 가정 = 0 (giftTaxBase 미설정, doneeRelation 미설정)
- 현행: ceiling = 1,300M - 300M = 1,000M
- 기대: ceiling = 1,300M - 0 = 1,300M (특례 제외 → 분모 0)

#### (c) E-2: §30의5⑩ 직접 공제 (안분 없음)

**시나리오**:
- 상속재산: 2,000,000,000
- 창업자금 증여 12년 전: 300,000,000, 납부세액 28,500,000원 (10% 세율에서 5억 공제 후)
- 상속인: 자녀 1명
- 일괄공제: 500,000,000
- 과세표준: 1,800,000,000 (단순 가정)
- 산출세액 계산 필요 (누진세율 적용)
- §28① 안분 한도: (giftTaxBase 가정 / taxBase) × computedTax
- §30의5⑩ 직접 공제: min(giftTaxPaid, max(0, computedTax))

**현행**: §28① 안분 한도 적용 (한도가 낮을 수 있음)
**기대**: 직접 전액 공제

#### (d) 일반 prior 기존 무변경 확인 — CUTOFF-B3 재현

기존 `section13-cutoff-day-precision.test.ts:CUTOFF-B3` 케이스에서
specialTreatmentType을 명시적으로 undefined로 설정 후 동일 결과 확인.

---

## 8. anchor 현행값 측정표 (Pre-Do 실행 결과 — 2026-06-11 실측 완료)

모든 수치는 probe 테스트로 실측 후 anchor 파일에 고정됨 (`inheritance-special-prior-13-anchor.test.ts`).

| anchor ID | 측정 항목 | 현행값 (버그 상태, 실측) | 기대값 (구현 후) |
|---|---|---|---|
| SP-C6-1 | isWithin13Cutoff("startup", 12년) | **false** (버그) | true |
| SP-C6-2 | isWithin13Cutoff("family_business", 12년) | **false** (버그) | true |
| SP-C6-priorGiftAggregated | 12년 특례 prior 가산 | **0** | 300,000,000 |
| SP-C6-taxableEstateValue | 12년 특례 과세가액 | **995,000,000** | 1,295,000,000 |
| SP-C6-finalTax | 12년 특례 최종세액 | **86,330,000** | 163,445,000 |
| SP-D2-limitCeiling | §24 ceiling (특례 prior 포함) | **undefined** (별도 필드 없음) | 구현 후 측정 필요 |
| SP-E2-giftTaxCredit | §28 일반 공제 | 0 | 0 (일반 prior 없음) |
| SP-E2-specialTreatmentCredit | §30의5⑩ 직접 공제 | **0** (미구현) | 10,000,000 |
| SP-REG-finalTax | 일반 prior 8년 (회귀 방어) | **110,095,000** | 110,095,000 (무변경) |
| SP-REG2-finalTax | prior 없음 기준선 | **86,330,000** | 86,330,000 (무변경) |

**anchor 테스트 실행 결과**: 20/20 통과 (2026-06-11)
**기존 회귀 확인**: 855/855 통과 (무변경)

### §24 limitCeiling 필드 확인 필요

실측 결과 `deductionDetail.limitCeiling = undefined` — 이 필드가 deductionDetail에 직접 노출되지 않음.
Do 단계에서 `applyDeductionLimit`의 `ceilingDetail.ceiling`이 result에 어떻게 반영되는지 확인 후
적절한 검증 필드 결정.

---

## 9. 구현 시 주의사항

1. **isWithin13Cutoff 변경은 단일 파일 수정** — `inheritance-gift-common.ts` 1개 함수만. 증여세 엔진(`aggregatePriorGiftsForGift`)은 별도 함수를 사용하므로 영향 없음.

2. **증여세 엔진 회귀 없음** — `gift-prior-aggregation.ts:116-120`에서 이미 specialTreatmentType 분기를 별도로 구현. inheritance-gift-common의 변경이 gift 경로에 전파되지 않음. (aggregatePriorGiftsForInheritance와 aggregatePriorGiftsForGift 별도 함수 확인 필요)

3. **§24 3호 단서 게이트 유지** — 과세가액 ≤ 5억인 경우 §24 3호 자체가 미적용. 특례 제외 로직도 이 게이트 안에 있음. 코드 순서 주의: SECTION24_GIFT_DEDUCTION_THRESHOLD 체크 후 특례 제외.

4. **§30의5⑩ 음수 방지** — `Math.max(0, ...)` 필수. `specialTaxCredit = Math.min(specialTaxPaid, Math.max(0, remainingAfterNormalCredit))`.

5. **800줄 정책** — `inheritance-gift-tax-credit.ts` 현행 줄수 확인 후 초과 시 분리.

6. **법령코드 상수** — `lib/tax-engine/legal-codes/inheritance-gift.ts`에 §30의5⑨⑩ 상수 추가 필요. 문자열 리터럴 금지.

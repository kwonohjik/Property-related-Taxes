# Engine Design — 증여세 §57① 단서 + §53의2 기공제 누적

**작성일**: 2026-06-11
**Worktree**: `.claude/worktrees/fix-gift-57-53-2`
**법령 기준**: 상속세및증여세법 §57① (20260102 시행) / §53의2①②③ (현행)

---

## 1. 갭 개요 + Pre-Do Anchor 실측 결과

### 1.1 현행값 → 기대값 표

| 앵커 ID | 시나리오 | 현행값 | 기대값 | 법령 근거 |
|--------|---------|--------|--------|---------|
| A-1 | donorGroup=B + 단서 플래그 없음 → 300M 증여, 과세표준 250M | `additionalGenerationSkipSurcharge = 12,000,000` (30% 할증) | 단서 플래그 존재 시 `= 0` | §57① 단서 |
| A-2 | GiftTaxInput에 `isSubstituteGift` 필드 없음 | `@ts-expect-error` + 플래그 무시 | 필드 추가 후 엔진 인식 | §57① 단서 |
| B-1 | 기공제 6천만 + 당회차 혼인 1억 신청, `calcMarriageBirthDeduction` 직접 | `deduction = 100,000,000` (전액) | `deduction = 40,000,000` (잔여) | §53의2③ |
| B-2 | GiftDeductionInput에 `priorUsedMarriageBirthDeduction` 없음 | `@ts-expect-error` + 필드 무시 | 필드 추가 후 잔여 계산 | §53의2③ |
| B-3 | calcGiftDeductions 통합 경로, 기공제 6천만, 혼인 1억 | `marriageBirthDeduction = 100,000,000` | `marriageBirthDeduction = 40,000,000` | §53의2③ |

앵커 파일: `__tests__/tax-engine/inheritance-gift/pre-do-anchor-gift-57-53-2.test.ts`
실행 결과: 5 passed (모두 현행 값으로 통과 — Do 후 기대값으로 변경 필요)

---

## 2. 갭 A — §57① 단서: 최근친 직계비속 사망 시 할증 배제

### 2.1 법문

```
상증법 §57① (시행 20260102):
"수증자가 증여자의 자녀가 아닌 직계비속인 경우에는 제56조에 따라 산출한 세액에
 제1호 또는 제2호의 금액을 가산한다.
 다만, 증여자의 최근친(最近親)인 직계비속이 사망하여 그 사망자의 최근친인 직계비속이
 증여받은 경우에는 그러하지 아니하다."
```

의미: 조부(증여자) → 손자(수증자). 부(父)가 이미 사망하여 조부의 최근친 직계비속이 없고,
그 사망한 부의 최근친인 손자가 증여받은 경우 → 할증 배제.

### 2.2 현행 문제

`lib/tax-engine/inheritance-gift-common.ts:272`:
```ts
if (donorGroup !== "B" || computedTax <= 0) {
  return { detail: null, additionalSurcharge: 0, breakdown: [] };
}
// 이하 무조건 30%/40% 할증 계산
```
`donorGroup === "B"` 이면 단서 조건 체크 없이 무조건 할증 적용.

### 2.3 비교: 상속세 §27 단서 구현

`lib/tax-engine/inheritance-generation-skip.ts:118`:
```ts
if (heir.isSubstituteInheritance) {
  rows.push({ ..., rate: 0, surcharge: 0, excludedBySubstitution: true });
  continue;
}
```
`Heir.isSubstituteInheritance?: boolean` 필드로 단서 배제를 per-heir로 처리.

### 2.4 케이스 매트릭스 — 갭 A

| # | donorGroup | isSubstituteGift | isMinorDonee | 증여가액 > 20억 | 기대 surchargeRate | 기대 additionalSurcharge |
|---|-----------|-----------------|-------------|----------------|-------------------|------------------------|
| A-M1 | A (부모) | false | any | any | N/A | 0 (donorGroup≠B) |
| A-M2 | B (조부모) | false | false | false | 0.30 | `computedTax × 30%` |
| A-M3 | B (조부모) | false | true | true (>20억) | 0.40 | `computedTax × 40%` |
| A-M4 | B (조부모) | false | true | false (≤20억) | 0.30 | `computedTax × 30%` |
| **A-M5** | **B (조부모)** | **true** | **false** | **any** | **배제** | **0** |
| **A-M6** | **B (조부모)** | **true** | **true** | **any** | **배제** | **0** |
| A-M7 | C~G | false | any | any | N/A | 0 (donorGroup≠B) |

**A-M5·A-M6이 현행 미구현** — Do 대상.

### 2.5 신규 입력 필드 설계

**파일**: `lib/tax-engine/types/inheritance-gift.types.ts`
**위치**: `GiftTaxInput` 인터페이스 내 `isGenerationSkip` 근처

```ts
/**
 * §57① 단서 — 최근친 직계비속 사망 + 그 사망자 최근친이 증여받은 경우 할증 배제.
 * true 시 donorGroup=B이어도 할증 미적용.
 * 상속세 Heir.isSubstituteInheritance와 동일 개념의 증여세 버전.
 */
isSubstituteGift?: boolean;
```

기본값: undefined(false 동작) — 기존 동작 100% 보존.

### 2.6 엔진 처리 방침 — generationSkipDetail 처리

`calcGiftGenerationSkipSurchargeWithLimit` 함수 시그니처 추가:

```ts
export function calcGiftGenerationSkipSurchargeWithLimit(
  computedTax: number,
  donorGroup: DonorGroup,
  isMinorDonee: boolean,
  currentGiftValue: number,
  priorAggregation: PriorAggregationResult,
  aggregatedTaxBase: number,
  isSubstituteGift?: boolean,  // 신규 파라미터 — optional, 기본 false
): { detail: GenerationSkipSurchargeDetail | null; ... }
```

단서 게이트 위치 (기존 donorGroup 체크 직후):

```ts
// §57① 단서: 최근친 직계비속 사망 → 할증 전액 배제
if (isSubstituteGift) {
  return { detail: null, additionalSurcharge: 0, breakdown: [{
    label: "§57① 단서 적용 — 최근친 직계비속 사망 (할증 배제)",
    amount: 0,
    lawRef: GIFT.GENERATION_SKIP_PROVISO,
  }]};
}
```

**`detail: null` 처리**: 기존 코드에서 `generationSkipSurchargeDetail` 표시 게이트는 `!== null` 조건으로 UI 출력을 막음 (memory: project_inheritance_section27_substitute 참조).
단서 적용 시 `detail = null` + `breakdown`에 배제 사유 1줄 echo → UI는 breakdown에서 읽어 "§57① 단서 적용" 표시.

### 2.7 법령 상수 추가

**파일**: `lib/tax-engine/legal-codes/inheritance-gift.ts`

```ts
// GIFT 객체 내 추가:
/** 상증법 §57① 단서 — 최근친 직계비속 사망 시 할증 배제 */
GENERATION_SKIP_PROVISO: "상증법 §57① 단서",
```

### 2.8 영향 범위 확인

`computeGenerationSkipSurcharge` (상속세, `inheritance-generation-skip.ts`)와 `calcGiftGenerationSkipSurchargeWithLimit` (증여세, `inheritance-gift-common.ts`)는 **완전히 분리된 함수**. 상속세 경로는 `Heir.isSubstituteInheritance` 필드로 이미 구현됨.

갭 A 변경이 상속세 경로에 영향을 주는 경로:

| 파일 | `computeGenerationSkipSurcharge` 호출 여부 | 영향 |
|------|-----------------------------------------|-----|
| `inheritance-tax.ts:568` | 상속세 전용 호출 | 없음 |
| `gift-tax.ts:182` | `calcGiftGenerationSkipSurchargeWithLimit` 호출 | 신규 파라미터 전달 필요 |
| `inheritance-gift-common.ts:259` | 함수 정의 (증여세) | 단서 게이트 추가 |

**상속세(`inheritance-tax.ts`) 경로는 `calcGiftGenerationSkipSurchargeWithLimit`를 전혀 호출하지 않음** — 갭 A 변경이 상속세 계산에 영향 없음.

---

## 3. 갭 B — §53의2 기공제 누적 차감 부재

### 3.1 법문

```
상증법 §53의2:
①  직계존속으로부터 혼인에 따른 증여를 받은 경우 1억원 이하 공제
    다만, 제1항 또는 제2항의 규정에 따라 이미 공제받았거나 받을 금액을
    합한 금액이 1억원을 초과하는 경우 그 초과분은 공제하지 아니한다.
②  직계존속으로부터 자녀 출산에 따른 증여를 받은 경우 동일 방식
③  제1항·제2항의 공제는 수증자별로 합산하여 1억원을 한도로 한다.
```

핵심: **수증자별 합산 1억 한도** — 10년 윈도우 아닌 수증자 통산.

### 3.2 현행 문제

`lib/tax-engine/deductions/gift-deductions.ts:116 calcMarriageBirthDeduction`:
```ts
const marriage = Math.max(0, Math.min(marriageExemption ?? 0, MARRIAGE_BIRTH_MAX)); // 1억 캡
const birth = Math.max(0, Math.min(birthExemption ?? 0, MARRIAGE_BIRTH_MAX));       // 1억 캡
const combinedMax = Math.min(marriage + birth, MARRIAGE_BIRTH_MAX);                  // 합산 1억 캡
```
당회차 입력만으로 1억 캡 적용. **기과거 공제액 차감 입력 경로 없음**.

`GiftDeductionInput` 인터페이스에 기공제 입력 필드 부재:
```ts
interface GiftDeductionInput {
  donorRelation: DonorRelation;
  marriageExemption?: number;
  birthExemption?: number;
  priorUsedDeduction?: number;  // §53 관계공제 기사용 (별도 필드)
  // priorUsedMarriageBirthDeduction?: number  ← 없음
}
```

### 3.3 재사용 후보: `lib/calc/prior-gift-marriage-birth-cap.ts`

`makeMarriageBirthCapper()`는 상속세 경로(§24 분자, §19 배우자, `derivePriorGiftTaxBase`) 전용.
동일 doneeId 기반 누적 캡을 Map으로 관리.

증여세 단건 계산에서는 capper 패턴이 아닌 **단순 잔여 계산** 방식이 적합:
```
remainingMBDeduction = max(0, 1억 - priorUsedMarriageBirthDeduction)
effectiveMBDeduction = min(당회차신청, remainingMBDeduction)
```

### 3.4 케이스 매트릭스 — 갭 B

| # | donorRelation | priorUsedMB | 당회차 혼인 | 당회차 출산 | 기대 공제액 |
|---|--------------|------------|-----------|-----------|-----------|
| B-M1 | lineal_ascendant_adult | 0 | 0 | 0 | 0 |
| B-M2 | lineal_ascendant_adult | 0 | 50,000,000 | 0 | 50,000,000 |
| B-M3 | lineal_ascendant_adult | 0 | 100,000,000 | 0 | 100,000,000 |
| B-M4 | lineal_ascendant_adult | 0 | 60,000,000 | 60,000,000 | 100,000,000 (합산 캡) |
| **B-M5** | **lineal_ascendant_adult** | **60,000,000** | **100,000,000** | **0** | **40,000,000** |
| **B-M6** | **lineal_ascendant_adult** | **100,000,000** | **100,000,000** | **0** | **0** (소진) |
| **B-M7** | **lineal_ascendant_adult** | **60,000,000** | **50,000,000** | **50,000,000** | **40,000,000** (합산 캡 이후 잔여) |
| B-M8 | lineal_ascendant_minor | 0 | 50,000,000 | 0 | 50,000,000 (미성년도 §53의2 적용) |
| B-M9 | spouse | 0 | 100,000,000 | 0 | 0 (§53의2 배우자 비적격) |
| B-M10 | lineal_descendant | 0 | 100,000,000 | 0 | 0 (§53의2 직계비속 비적격) |
| B-M11 | other_relative | 0 | 100,000,000 | 0 | 0 (비적격) |

**B-M5·B-M6·B-M7이 현행 미구현** — Do 대상.

### 3.5 경계값 상세 계산 (B-M7)

```
priorUsedMB = 60,000,000
당회차: 혼인 50,000,000 + 출산 50,000,000 = 100,000,000

잔여 한도 = max(0, 100,000,000 - 60,000,000) = 40,000,000
당회차 합산 신청 = min(50M + 50M, 1억) = 100,000,000

실공제 = min(100,000,000신청, 40,000,000잔여) = 40,000,000
```

### 3.6 신규 입력 필드 설계

**파일**: `lib/tax-engine/types/inheritance-gift.types.ts`
**위치**: `GiftDeductionInput` 인터페이스

```ts
export interface GiftDeductionInput {
  donorRelation: DonorRelation;
  marriageExemption?: number;
  birthExemption?: number;
  /** 10년 이내 동일인(동일 관계 그룹)에 대한 기사용 §53 관계공제 합산 */
  priorUsedDeduction?: number;
  /**
   * §53의2③ 수증자 통산 기공제액 (혼인+출산 합산 한도 1억).
   * 과거 증여에서 이미 적용된 §53의2 공제 누계액.
   * 미입력(undefined) 시 0 — 기존 동작 보존.
   */
  priorUsedMarriageBirthDeduction?: number;
}
```

### 3.7 엔진 수정 — `calcMarriageBirthDeduction`

```ts
export function calcMarriageBirthDeduction(
  donorRelation: DonorRelation,
  grossGiftValue: number,
  marriageExemption?: number,
  birthExemption?: number,
  priorUsedMarriageBirthDeduction?: number,  // 신규 파라미터
): { deduction: number; breakdown: CalculationStep[] }
```

잔여 한도 계산 (기존 `combinedMax` 계산 직전 삽입):

```ts
const priorUsedMB = priorUsedMarriageBirthDeduction ?? 0;
const remainingMBLimit = Math.max(0, MARRIAGE_BIRTH_MAX - priorUsedMB);

// 기존: const combinedMax = Math.min(marriage + birth, MARRIAGE_BIRTH_MAX);
const combinedMax = Math.min(marriage + birth, remainingMBLimit);
```

breakdown 라벨 추가 (기공제 > 0인 경우만):
```ts
// priorUsedMB > 0 시 breakdown에 추가:
{ label: "§53의2③ 기사용 공제 (수증자 통산)", amount: -priorUsedMB, lawRef: GIFT.MARRIAGE_CUMULATIVE_LIMIT }
{ label: "잔여 공제 가능액", amount: remainingMBLimit }
```

### 3.8 법령 상수 추가

**파일**: `lib/tax-engine/legal-codes/inheritance-gift.ts`

```ts
// GIFT 객체 내 추가:
/** 상증법 §53의2③ — 혼인·출산공제 수증자별 합산 1억 한도 통산 */
MARRIAGE_CUMULATIVE_LIMIT: "상증법 §53의2 ③",
```

### 3.9 호출 경로 업데이트

`calcGiftDeductions` (통합 공제 함수):
```ts
const { deduction: marriageBirthDeduction, breakdown: mbBreakdown } =
  calcMarriageBirthDeduction(
    input.donorRelation,
    grossGiftValue,
    input.marriageExemption,
    input.birthExemption,
    input.priorUsedMarriageBirthDeduction,  // 신규 전달
  );
```

---

## 4. 14개 동기화 지점 — 엔진 측 책임

이번 변경은 **엔진 레이어 수정**. 클라이언트 8개 지점(⑤⑥⑦)은 UI 시니어 범위.

| 지점 | 파일 | 갭 A | 갭 B |
|-----|------|------|------|
| ①폼 상태 | store | `isSubstituteGift?: boolean` 추가 | `priorUsedMarriageBirthDeduction?: number` 추가 |
| ②initial | store 초기값 | `isSubstituteGift: false` | `priorUsedMarriageBirthDeduction: 0` |
| ③normalize | normalize 함수 | `isSubstituteGift: x ?? false` | `priorUsedMarriageBirthDeduction: x ?? 0` |
| ④API 변환 | `lib/calc/gift-tax-api.ts` | body에 `isSubstituteGift` | body에 `priorUsedMarriageBirthDeduction` |
| ⑤UI 위젯 | GiftTaxForm | 단서 toggle (ToggleCard) | CurrencyInput 기공제 |
| ⑥사이드바 | 합계 | (영향 없음) | (영향 없음) |
| ⑦결과 카드 | ResultCard | 단서 적용 echo (breakdown) | 기공제·잔여 공제 표시 |
| ⑧validation | `lib/calc/gift-validate.ts` | isSubstituteGift boolean | priorUsedMB ≥ 0 체크 |
| ⑨Zod enum | route.ts | `isSubstituteGift: z.boolean().optional()` | `priorUsedMarriageBirthDeduction: z.number().min(0).optional()` |
| ⑩Zod companion | route.ts | (없음) | (없음) |
| ⑪acquisitionDate fallback | route.ts | (해당없음) | (해당없음) |
| ⑫Zod 입력객체 | route.ts GiftTaxInputSchema | 동일 `isSubstituteGift` | 동일 필드 |
| ⑬callAPI body spread | `lib/calc/gift-tax-api.ts` | spread에 포함 확인 | spread에 포함 확인 |
| ⑭Route → 엔진 매핑 | `app/api/calc/gift/route.ts` | `isSubstituteGift: body.isSubstituteGift` | `priorUsedMarriageBirthDeduction` 전달 |

**엔진 측 직접 담당** (Do 단계 범위): 타입(①②③ 스토어 타입) + Zod ⑨⑫ + Route ⑭ + 순수 엔진 함수.

---

## 5. 구현 순서 (Do 단계)

### Phase 1: 법령 상수 추가 (법령 코드 먼저)
- `lib/tax-engine/legal-codes/inheritance-gift.ts` 에 `GIFT.GENERATION_SKIP_PROVISO` + `GIFT.MARRIAGE_CUMULATIVE_LIMIT` 추가

### Phase 2: 타입 확장
- `lib/tax-engine/types/inheritance-gift.types.ts`
  - `GiftTaxInput.isSubstituteGift?: boolean` 추가
  - `GiftDeductionInput.priorUsedMarriageBirthDeduction?: number` 추가

### Phase 3: 엔진 수정
- `lib/tax-engine/inheritance-gift-common.ts:calcGiftGenerationSkipSurchargeWithLimit`
  - 파라미터 `isSubstituteGift?: boolean` 추가
  - 단서 게이트 삽입
- `lib/tax-engine/deductions/gift-deductions.ts:calcMarriageBirthDeduction`
  - 파라미터 `priorUsedMarriageBirthDeduction?: number` 추가
  - 잔여 계산 로직 삽입
  - `calcGiftDeductions` 호출부 업데이트

### Phase 4: Orchestrator/Route 연결
- `lib/tax-engine/gift-tax.ts:182` — `calcGiftGenerationSkipSurchargeWithLimit` 호출부에 `input.isSubstituteGift` 전달
- `app/api/calc/gift/route.ts` — Zod 스키마 + 매핑 업데이트

### Phase 5: 앵커 테스트 수정
- `pre-do-anchor-gift-57-53-2.test.ts` — 기대값으로 expect 변경 + @ts-expect-error 제거

### Phase 6: 회귀 검증
- `npx vitest run __tests__/tax-engine/inheritance-gift/` 전체 통과 확인
- `npx tsc --noEmit` 0건

---

## 6. 기존 동작 100% 보존 원칙

- `isSubstituteGift` 미입력(undefined) → `false` 동작 → 현행과 동일
- `priorUsedMarriageBirthDeduction` 미입력(undefined) → `0` 동작 → 현행과 동일
- 두 필드 모두 optional이므로 기존 GiftTaxInput 생성 코드 수정 불필요
- `case-2-generation-skip.test.ts` 등 기존 테스트 무변경 통과 필수

---

## 7. 상속세 경로 영향 없음 확인

`computeGenerationSkipSurcharge` 호출처 전수:
```
lib/tax-engine/inheritance-tax.ts:568  — 상속세 전용, calcGiftGenerationSkipSurchargeWithLimit 호출 안 함
lib/tax-engine/gift-tax.ts:182         — 증여세, calcGiftGenerationSkipSurchargeWithLimit 호출
lib/tax-engine/inheritance-gift-common.ts:259 — 함수 정의 (증여세)
```

상속세 § 27 단서는 `Heir.isSubstituteInheritance` 경로로 완전히 분리 구현됨.
갭 A(`GiftTaxInput.isSubstituteGift`) 변경이 `inheritance-tax.ts` 에 어떤 방식으로도 도달하지 않음.

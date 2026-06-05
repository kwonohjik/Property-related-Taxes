# 상속세 「그 밖의 인적공제」(§20) 보완 — 엔진 설계

- **작성일**: 2026-06-05
- **worktree**: `personal-deduction-enhancement`
- **단일 출처**: `docs/00-pm/inheritance-personal-deduction-enhancement.plan.md` (KoreanLaw·probe 7건 검증 완료)
- **범위**: P0(G1·G2·G3) + P2(G6·G7·G8) — P1 동거가족(G4·G5)은 별도 설계서
- **법령 근거**: 상증법 §20 (mst 276123, 시행 2026-01-02) · 시행령 §18 (mst 283637) — KoreanLaw 본문 축자 확인

---

## Context

현행 「그 밖의 인적공제」(§20) 엔진은 다음 3가지 법령 위반 오류를 포함한다.

1. **G1**: 미성년자공제 연령기준 20세 → 법령은 19세 (§20①2호 "19세")
2. **G2**: 연로자공제(§20①3호)에서 자녀·배우자 미제외 → 이중공제 발생
3. **G3**: 장애인공제(§20①4호) 성별 미구분 · 2023 통계청 생명표 불일치 · dead code 잔류

그 결과 모든 상속 계산에서 인적공제가 과다·부정확하게 산출된다 (probe 7건 실측 확인).

---

## ★ 케이스 인벤토리 (필수 — 행 ≥ 1)

| # | 시나리오 | 법령 근거 | 기대값 (원) | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|------------|------------|-----------|------|
| C1 | 미성년 자녀 만11세 (2014-01-01, 상속 2025-01-01) | §20①2호·③ | 자녀5천만+미성년**8**천만 = **1.3억** | 계획서 §4 C1 | `pre-do-personal-deduction.test.ts` | ★ Pre-Do |
| C2 | 성년 자녀 2명 | §20①1호 | 1억 | 계획서 C2 | `inheritance-deductions.test.ts` D1 | ☑ 기존 통과 |
| C3 | **65세↑ 자녀 1명** (1959생, 상속 2025-01-01) | §20①3호 "배우자 제외" + ①후단 1호↔3호 합산불가 | 자녀5천만+연로자**0** = **5천만** | 계획서 §4 C3 | `pre-do-personal-deduction.test.ts` | ★ Pre-Do |
| C4 | **65세↑ 배우자** (1959생, 상속 2025-01-01) | §20①3호 "상속인(배우자는 제외한다)" | 연로자**0** | 계획서 §4 C4 | `pre-do-personal-deduction.test.ts` | ★ Pre-Do |
| C5 | 65세↑ 직계존속 부 1명 (1955생) | §20①3호 (배우자·자녀 아님 → 정상 대상) | 연로자5천만 | 계획서 C5 | `inheritance-deductions.test.ts` D5 | ☑ 기존 통과 |
| C6 | 장애인 성년자녀 **남 40세** (1985-01-01, 남) | §20①4호 "성별·연령별", §20③ 1년미만 올림 | 자녀5천만+장애인**4.2억** (42×1천만) = **4.7억** | 계획서 §4 C6 · 2023생명표 남40=41.6→42 | `pre-do-personal-deduction.test.ts` | ★ Pre-Do |
| C7 | 장애인 성년자녀 **여 40세** (1985-01-01, 여) | 동상 | 자녀5천만+장애인**4.8억** (48×1천만) = **5.3억** | 계획서 C7 · 2023생명표 여40=47.2→48 | `inheritance-deductions.test.ts` (Do) | ☐ TODO |
| C8 | 장애 **배우자** 여 50세 (1975-01-01, 여) | §20①4호 "상속인 및 동거가족" — 배우자도 대상, 4호+§19 합산 가능 | 장애인 **3.8억** (여50 raw 37.6→ceil 38 × 1천만) | 계획서 C8 · PDF p.333 여50=37.6 | `inheritance-deductions.test.ts` (Do) | ☐ TODO |
| C9 | 미성년+장애 손자 남5세, **동거가족** | §20①2호·4호 합산 가능 | 미성년**1.4억** ((19-5)×1천만) + 장애**7.6억** (76×1천만) = **9억** | 계획서 §4 C9 · 2023생명표 남5=75.8→76 | P1 `cohabitantDependents` (별도 설계서) | ☐ P1 (계산 anchor는 P0에서 relation="other" heirs[]로 선검증 가능) |
| C10 | PDF 종합사례: 손자2 (계획서 §1.5) **동거가족** | §20①2호·③·4호 | 미성년3.2억+장애7.6억 = **10.8억** | PDF p.334 종합사례 직접 | P1 `cohabitantDependents` (별도 설계서) | ☐ P1 (통합 anchor) |
| C11 | 자녀 없는 상속 (일괄공제 §21 자동 적용) | §21① | 5억 일괄공제 | 기존 회귀 | `inheritance-deductions.test.ts` | ☑ 기존 통과 |
| C12 | 배우자 단독상속 → §21② 일괄 배제 | §21② | 기초2억+인적 | 기존 `lumpSumExcludedBySpouseSoleHeir` | `inheritance-deductions.test.ts` | ☑ 기존 통과 |

> Pre-Do anchor: C1·C3·C4·C6 4건 → 현행에서 실패 확인 후 Do 단계 진입.
> C7·C8은 P0 Do(생명표 전사 후) anchor. **C9·C10은 동거가족 입력모델(P1, 옵션 B `cohabitantDependents`) 의존** — 단, 계산 로직(2호+4호 합산·성별 기대여명)은 P0에서 relation="other" heirs[] anchor로 선검증 가능.

---

## 법령 근거 (KoreanLaw mst 확인)

### §20 ①2호·3호·4호·③ (mst 276123, 2026-01-02 시행)

```
제20조(그 밖의 인적공제) ①
  2. 상속인(배우자는 제외한다) 및 동거가족 중 미성년자(태아를 포함한다)에 대해서는
     1천만원에 19세가 될 때까지의 연수를 곱하여 계산한 금액
  3. 상속인(배우자는 제외한다) 및 동거가족 중 65세 이상인 사람에 대해서는 5천만원
  4. 상속인 및 동거가족 중 장애인에 대해서는 1천만원에
     성별·연령별 기대여명의 연수를 곱하여 계산한 금액
③ 제1항제2호 및 제4호를 적용할 때 1년 미만의 기간은 1년으로 한다.
```

**중복공제(상호배제) 규칙 — §20① 후단**:
- 1호(자녀) + 2호(미성년) → **합산 가능** (미성년 자녀)
- 4호(장애인) + 1·2·3호 또는 §19(배우자) → **항상 합산 가능**
- 1호(자녀) + 3호(연로자) → **합산 불가** (65세↑ 자녀 = 자녀공제만)
- §19(배우자) + 3호(연로자) → **합산 불가** (배우자는 2·3호 대상 제외)

### §18③ 장애인 정의 (시행령 mst 283637)

소득세법 시행령 §107① 각 호: 장애인복지법 장애인 / 국가유공자 상이자 / 항시 치료 중증환자.

---

## 신규 타입 명세

### 1. `Heir.gender` 추가 (P0 G3-a)

```typescript
// lib/tax-engine/types/inheritance-gift.types.ts
export interface Heir {
  // ... 기존 필드
  /**
   * 성별 — 장애인공제(§20①4호) 성별·연령별 기대여명 계산용.
   * 장애인(isDisabled===true) 시 필수. 미입력 시 엔진 차단 (자동추정 금지 — feedback_no_silent_apportion_fallback).
   * 미성년자·연로자공제는 성별 불필요.
   */
  gender?: "male" | "female";
  // ... 기존 필드 유지
}
```

### 2. `PersonalDeductionDetail` 신규 (P2 G7 — echo 패턴)

> **위치 통일 (EN-2)**: `lib/tax-engine/types/inheritance-deduction-detail.types.ts` — 기존 `CohabitDeductionDetail`·`FinancialDeductionDetail` 등과 동거. UI 설계서 §3.1과 일치.
> **구조 통일 (EN-1·EN-9)**: UI 소비 계약과 동일한 **flat** 구조. 엔진은 **데이터 필드만** 반환하고, 산식 문자열(`formula`)은 **UI가 한국어로 조립** (변수약어·`floor()` 금지 정책). → dual-truth 제거.

```typescript
// lib/tax-engine/types/inheritance-deduction-detail.types.ts
export interface PersonalDeductionDetail {
  /** ① 자녀공제 (§20①1호) */
  childCount: number;
  childDeduction: number;          // childCount × 5,000만원

  /** ② 미성년자공제 (§20①2호) */
  minorPerHeir: Array<{
    heirId: string;
    name?: string;                 // 표시용 (id 직접 노출 금지 — feedback_no_internal_id_in_result)
    age: number;                   // 만 나이 (floor)
    remainingYears: number;        // 19 − age (§20③ 올림 반영)
    deduction: number;             // remainingYears × 1,000만원
  }>;
  minorDeduction: number;          // minorPerHeir 합계

  /** ③ 연로자공제 (§20①3호, 배우자·자녀 제외) */
  elderCount: number;
  elderDeduction: number;          // elderCount × 5,000만원

  /** ④ 장애인공제 (§20①4호) */
  disabledPerHeir: Array<{
    heirId: string;
    name?: string;
    gender: "male" | "female" | undefined;
    age: number;                   // 만 나이 (floor)
    lifeExpectancy: number;        // 성별·연령별 기대여명 (Math.ceil, §20③)
    deduction: number;             // lifeExpectancy × 1,000만원
  }>;
  disabledDeduction: number;       // disabledPerHeir 합계

  total: number;                   // 4종 합계
}
```

### 3. `InheritanceDeductionResult`에 optional echo 추가

```typescript
// InheritanceDeductionResult (기존 타입)에 추가:
personalDeductionDetail?: PersonalDeductionDetail;
```

> echo 패턴: 엔진 산식 변경 없음. 기존 `calcPersonalDeductions` 반환값에서 detail 필드 추가만.

### 4. `isFetus` optional 플래그 (P2 G6)

```typescript
// Heir 인터페이스에 추가:
/**
 * 태아 여부 — §20①1호·2호 "태아를 포함한다".
 * 자녀공제(1호): isFetus=true → count 포함.
 * 미성년자공제(2호): 태아 = 출생 전 → 만 0세 간주, 잔여연수 19 × 1천만 = 1.9억 (시행령 §18②).
 * 신고기한 내 임신 확인 서류 제출 요건.
 */
isFetus?: boolean;
```

> **구현 주의 (EN-6 모순 해소)**: 현행 `calcMinorDeduction`은 `if (!heir.birthDate) continue;`로 birthDate 없는 heir를 **skip**한다. 태아는 birthDate가 없으므로 그대로면 미성년공제 0 → 위 "1.9억"과 모순. **`isFetus===true`이면 age=0으로 분기**하여 (19−0)×1천만=1.9억 적용하도록 명시 구현 필요. (G6은 P2 선택 — 미구현 시 태아는 자녀공제 5천만만, 미성년 0으로 **보수적 처리하고 문서화**.)

> 계모자·적모서자 제외(PDF 해석사례 재삼46014-100)는 Do 단계에서 주석 문서화만 (relation 기반 구분 없이 child 카운트 현행 유지 — 변경 위험 낮음).

---

## 함수 시그니처 변경 명세

### 변경 1: `calcMinorDeduction` (G1)

```typescript
// 현행 (tax-utils.ts:208, personal-deduction-calc.ts:119)
if (age >= 20) return 0;
return Math.max(0, 20 - age) * 10_000_000;

// 변경 후
// §20①2호 "19세가 될 때까지의 연수" — 민법 §4 성년 19세 (2013-07-01~)
// §20③ "1년 미만의 기간은 1년으로 한다" → Math.floor(differenceInYears) 자동 충족 (ceiling 효과)
//   예: 만 11세 9개월 = differenceInYears = 11 → 19-11 = 8 (1년 미만 1년 올림 포함됨)
if (age >= 19) return 0;
return Math.max(0, 19 - age) * 10_000_000;
```

**영향 범위**:
- `lib/tax-engine/tax-utils.ts` L208~209: `20 → 19` 2곳
- `lib/tax-engine/deductions/personal-deduction-calc.ts` L119: 주석 "(20 - 연령)" → "(19 - 연령)"
- `lib/tax-engine/deductions/personal-deduction-calc.ts` L146: 라벨 문자열 `(20-${age})` → `(19-${age})`

### 변경 2: `calcElderDeduction` (G2)

```typescript
// 현행 (personal-deduction-calc.ts:177)
const elderHeirs = heirs.filter((h) => {
  if (!h.birthDate) return false;
  const age = differenceInYears(base, new Date(h.birthDate));
  return age >= ELDER_AGE_THRESHOLD;
});

// 변경 후
// §20①3호: "상속인(배우자는 제외한다) 및 동거가족 중 65세 이상인 사람"
// §20① 후단: 1호(자녀)에 해당하는 사람이 3호에도 해당하는 경우 합산 불가
//   → 배우자(spouse) 및 자녀(child)는 연로자공제 대상에서 제외
const elderHeirs = heirs.filter((h) => {
  if (!h.birthDate) return false;
  if (h.relation === "spouse" || h.relation === "child") return false; // G2 핵심
  const age = differenceInYears(base, new Date(h.birthDate));
  return age >= ELDER_AGE_THRESHOLD;
});
```

**영향 범위**:
- `lib/tax-engine/deductions/personal-deduction-calc.ts` L177~182: 필터 조건 추가

### 변경 3: `getLifeExpectancyByGender` 신규 (G3-b) + `getLifeExpectancy` 대체

```typescript
// 신규 함수 (personal-deduction-calc.ts 또는 data/life-expectancy-2023.ts에서 import)
// 통계청 2023년 생명표 (2024.12 발표) — PDF p.333~334
export function getLifeExpectancyByGender(
  gender: "male" | "female",
  age: number,  // 만 나이 (floor)
): number {
  const clamped = Math.max(0, Math.min(100, Math.floor(age)));
  const table = gender === "male" ? LIFE_EXPECTANCY_MALE_2023 : LIFE_EXPECTANCY_FEMALE_2023;
  const raw = table[clamped] ?? table[100]; // 100세 이상은 100세 값
  // §20③: 1년 미만의 기간은 1년으로 한다
  return Math.ceil(raw);
}
```

**영향 범위**:
- **신규 파일**: `lib/tax-engine/data/life-expectancy-2023.ts` (800줄 정책 준수 — 200행 테이블은 별도 data 파일)
- `personal-deduction-calc.ts`: `getLifeExpectancy` 대체 → `getLifeExpectancyByGender` 사용
- `calcDisabledDeduction`: `heir.gender` 필수 확인 + gender 미입력 시 예외 throw (자동추정 금지)

### 변경 4: `calcDisabledDeduction` (G3-b + gender 필수화)

```typescript
// 변경 후
export function calcDisabledDeduction(
  heirs: Heir[],
  baseDate: string,
): DisabledDeductionResult {
  const base = new Date(baseDate);
  const perHeir: DisabledDeductionResult["perHeir"] = [];

  for (const heir of heirs) {
    if (!heir.isDisabled) continue;

    if (!heir.gender) {
      // §20①4호 "성별·연령별 기대여명" — 성별 미입력 시 계산 불가 (자동추정 금지).
      // 1차 게이트는 validation(⑧). 엔진 backstop은 raw Error 금지 → TaxCalculationError 사용
      //   (route.ts가 TaxCalculationError를 400으로 catch — raw Error는 500 유발). (EN-5)
      throw new TaxCalculationError(
        `장애인공제(§20①4호): 상속인 성별 미입력 — 성별·연령별 기대여명 산정 불가.`,
      );
    }

    let lifeExpectancy: number;
    if (heir.birthDate) {
      const age = differenceInYears(base, new Date(heir.birthDate));
      lifeExpectancy = getLifeExpectancyByGender(heir.gender, age); // Math.ceil 포함
    } else {
      lifeExpectancy = 0;
    }
    // ...
  }
}
```

### 변경 5: `calcDisabledPersonalDeduction` dead code 제거 (G3-c)

```typescript
// lib/tax-engine/tax-utils.ts:217~227 — 제거 대상
// import 라인 (personal-deduction-calc.ts:18)에서도 제거
// ESLint --fix 함정 주의: import 라인 분리 (calcMinorPersonalDeduction 별도 라인)
```

---

## 생명표 데이터 구조 (G3-b)

### 파일: `lib/tax-engine/data/life-expectancy-2023.ts`

- **출처**: 통계청 「2023년 생명표」(2024.12 발표) — PDF p.333(남·여 0~23세, 51~74세) + p.334(24~50세, 75~100세이상)
- **단위**: raw 기대여명 (소수점 포함) — `Math.ceil`은 `getLifeExpectancyByGender`에서 적용
- **커버리지**: 0~100세 (100세 이상은 100세 값으로 clamp)
- **검증 anchor** (계획서 §1.4):
  - 남 5세 raw=75.8 → ceil=76 ✓
  - 여 5세 raw=81.6 → ceil=82 ✓
  - 남 40세 raw=41.6 → ceil=42 ✓
  - 여 40세 raw=47.2 → ceil=48 ✓
  - 남 0세 raw=80.6 → ceil=81 ✓
  - 여 0세 raw=86.4 → ceil=87 ✓

```typescript
// lib/tax-engine/data/life-expectancy-2023.ts
/**
 * 통계청 2023년 생명표 — 성별·연령별 기대여명 (소수점, 단위: 년)
 * 출처: 통계청, 2024년 12월 발표, PDF p.333~334
 * 법령 근거: 상증법 §20①4호 "성별·연령별 기대여명"
 *
 * ※ Math.ceil은 getLifeExpectancyByGender()에서 적용 (§20③ 1년미만 1년 올림)
 * ※ Do 단계에서 PDF 전수 전사 필요 (남/여 0~100세, 각 101행)
 */

export const LIFE_EXPECTANCY_MALE_2023: Record<number, number> = {
  0: 80.6,
  1: 79.9,
  // ... Do 단계에서 PDF p.333~334 전수 전사
  5: 75.8,
  // ...
  40: 41.6,
  // ...
  100: /* Do 단계 확인 */,
};

export const LIFE_EXPECTANCY_FEMALE_2023: Record<number, number> = {
  0: 86.4,
  1: 85.7,
  // ... Do 단계에서 PDF p.333~334 전수 전사
  5: 81.6,
  // ...
  40: 47.2,
  // ...
  100: /* Do 단계 확인 */,
};
```

> Do 단계: PDF p.333~334 남/여 0~100세이상 전수 전사. 각 테이블 101행 × 2 = 202행. 800줄 정책 내 처리 가능 (`lib/tax-engine/data/life-expectancy-2023.ts` 단독 파일).

---

## 계산 알고리즘 (단계별)

### STEP 1. `calcChildrenDeduction` (변경 없음)

`relation === "child"` 카운트 × 5천만원. isFetus 플래그 추가 (G6) — Do 단계에서 선택적 구현.

### STEP 2. `calcMinorDeduction` (G1 변경)

0. **배우자 제외** (relation==="spouse" → continue) — §20①2호 "상속인(배우자는 제외한다)". **태아(isFetus)** → age=0 분기((19−0)×1천만). [Do 환류: 설계 초안 대비 배우자 제외 명시 추가]
1. 각 heir의 `birthDate` 확인
2. `differenceInYears(baseDate, birthDate)` = 만 나이 floor
3. `age >= 19` → 공제 0 (변경: 20 → 19)
4. `(19 - age) × 1,000만원` — §20③ 1년미만 1년 자동 포함 (differenceInYears floor 특성)

### STEP 3. `calcElderDeduction` (G2 변경)

1. 대상 필터: `relation !== "spouse" && relation !== "child"` 추가 (G2)
2. `age >= 65` 확인
3. 대상자 count × 5천만원

### STEP 4. `calcDisabledDeduction` (G3 변경)

1. `heir.isDisabled === true` 필터
2. `heir.gender` 필수 확인 → 미입력 시 throw
3. `differenceInYears` 만 나이
4. `getLifeExpectancyByGender(gender, age)` = `Math.ceil(raw)` (§20③)
5. 기대여명 × 1,000만원

### STEP 5. `calcPersonalDeductions` (합산, 변경 없음)

4종 합계 + PersonalDeductionDetail echo 추가 (G7).

---

## Silent fallback / 자동 안분 금지

| 필드 | 정책 |
|---|---|
| `Heir.gender` (장애 ON 시) | **필수 입력 + 차단** — 성별 자동추정(남/여 평균 등) 절대 금지 (`feedback_no_silent_apportion_fallback`) |
| `Heir.birthDate` (장애 ON 시) | 미입력 시 `lifeExpectancy = 0` (현행 유지 — 0원 공제) — validation에서 warn |
| 미성년자 연령 | differenceInYears floor 산식이 §20③ 올림 자동 포함 — 별도 올림 처리 불필요 |

---

## dead code 제거 계획

| 대상 | 위치 | 제거 내용 |
|---|---|---|
| `calcDisabledPersonalDeduction` | `lib/tax-engine/tax-utils.ts:217~227` | `(78-age)` 단순식 함수 전체 |
| import 참조 | `lib/tax-engine/deductions/personal-deduction-calc.ts:18` | `calcDisabledPersonalDeduction` import 라인 |
| `LIFE_EXPECTANCY_TABLE` | `personal-deduction-calc.ts:41~61` | 성별 무구분 구 테이블 — `getLifeExpectancyByGender`로 대체 후 제거 |
| `getLifeExpectancy` | `personal-deduction-calc.ts:67~70` | 성별 무구분 구 함수 — export 제거 (테스트 import 갱신 필요) |

> ESLint --fix 함정: `import { calcMinorPersonalDeduction, calcDisabledPersonalDeduction }` 한 라인이면 eslint --fix가 unused `calcDisabledPersonalDeduction` 제거 시 `calcMinorPersonalDeduction`까지 제거할 수 있음. 반드시 **별도 라인** 분리 후 제거.

---

## 테스트 정정 계획 (G8 — anchor_correction_legal_priority)

법령 위반 anchor를 유지하면 잘못된 산식을 영구 잠금 — 법령 정합값으로 재산정.

| 테스트 ID | 현행 anchor (버그 고정) | 변경 후 anchor (법령 정합) | 변경 사유 |
|---|---|---|---|
| D3 | `totalDeduction: 90_000_000` (만11세, 20세기준) | **`80_000_000`** (만11세, 19세기준: (19-11)×1천만) | G1: 20→19 |
| D3-bis | `totalDeduction: 100_000_000` (만10세, 20세기준) | **`90_000_000`** (만10세: (19-10)×1천만) | G1 동일 |
| D4 | "20세 이상이면 0" — `birthDate: "2000-01-01"` 만25세 | 설명 "**19세 이상이면 0**"으로 변경 (값은 25세라 0 동일). + **만19/만18 경계 anchor 신규** | G1 경계 검증 누락 보완 (EN-7) |
| D7 | `getLifeExpectancy(40) === 44` | **`getLifeExpectancyByGender("male", 40) === 42`** (남40=41.6→42) | G3: 성별 도입 + 2023생명표 |
| D8 | `totalDeduction: 440_000_000` (40세→44×1천만, 성별 미구분) | **`420_000_000`** (남40→42×1천만) | G3 동일 |
| D9 | `minorDeduction: 90_000_000` (20세기준 만11세) | **`80_000_000`** (19세기준); 전체 `total: 290_000_000` → **`280_000_000`** | G1 파급 |

> D4 상세: birthDate "2000-01-01", baseDate "2025-01-01" → 만 25세 → ≥19이므로 0. **신규 경계 anchor 필수**: birthDate "2006-01-01"(만19세)→0, "2007-01-01"(만18세)→1천만 (§20①2호 "19세가 될 때까지" 경계).

---

## 14개 동기화 지점 매핑 (gender 신규 필드)

`gender` 필드만 신규. 나머지 기존 필드는 이미 동기화됨.

| 지점 | 위치 | 작업 |
|---|---|---|
| ① 폼 상태 | `HeirComposition` Heir 입력 | `gender` 장애 ON 시 RadioCardGroup 노출 |
| ② initial | Heir 생성 기본 | `gender: undefined` |
| ③ normalize | sessionStorage 호환 | `gender?: "male"\|"female"` optional 통과 |
| ④ API 변환 | `inheritance-api.ts:81` | `heirs: input.heirs` spread 자동 ✅ |
| ⑤ UI 위젯 | `HeirComposition.tsx` 장애 토글 직후 | 성별 RadioCardGroup (UI 시니어 담당) |
| ⑥ 사이드바 | 인적공제 합계 | gender 영향 시 갱신 |
| ⑦ 결과 카드 | `DeductionBreakdownSection` | `PersonalDeductionDetail` echo (G7) |
| ⑧ validation | `inheritance-validate.ts` | 장애+gender 미입력 → 차단 오류 |
| ⑫ Zod | `property-valuation-input.ts:475` 인근 | **`gender: z.enum(["male","female"]).optional()`** — 미추가 시 strip |
| ⑬⑭ route | `route.ts:81` cast | spread/cast 자동 ✅ |

---

## 테스트 약속

- Pre-Do anchor 4건 (`pre-do-personal-deduction.test.ts`): C1·C3·C4·C6 현행 실패 확인 후 Do 진입. **Do 완료 후 이 throwaway 파일 삭제** — C1·C3·C4·C6을 `inheritance-deductions.test.ts`로 이관(법령 정합 통과값 + `getLifeExpectancyByGender` 사용). (`getLifeExpectancy` export 제거로 pre-do C6a는 컴파일 불가 → 이관 필수. X-1)
- Do 단계 신규 anchor: C7·C8·C9·C10 (생명표 전사 완료 후)
- 기존 anchor 재산정: D3·D3-bis·D7·D8·D9 (법령 정합값 — 위 표 참조)
- PDF 예시값: `toBe()` 원단위 anchor (`feedback_pdf_example_test_anchoring`)
- 회귀 방지: D1·D2·D5·D6·D10~D17+ 기존 통과 케이스 100% 유지

---

## UI 통합 위임

UI 측 명세는 별도 `inheritance-personal-deduction.ui.design.md` (작성 예정 — Do 단계).

- 성별 입력: 장애 토글 ON 직후 RadioCardGroup (§20①4호 "성별·연령별")
- 결과 표시: `PersonalDeductionDetail` 4종 ▼펼침 (echo 패턴, 엔진 산식 변경 0)
- 검증 메시지: "장애인 성별을 입력해주세요 (§20①4호 성별·연령별 기대여명 기준)"
- 14개 동기화 지점 ⑤⑥⑦⑧⑫는 UI 시니어 책임

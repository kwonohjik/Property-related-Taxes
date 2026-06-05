# 상속세 동거가족 인적공제 모델링 (§20 P1) — 엔진 설계

- **작성일**: 2026-06-05
- **worktree**: `personal-deduction-enhancement`
- **단일 출처**: `docs/00-pm/inheritance-personal-deduction-enhancement.plan.md` §3 G4·G5
- **범위**: P1 — 비상속인 동거가족 입력 모델링 + legatee over-inclusion(G5) 차단
- **선행 조건**: P0 구현(G1·G2·G3) 완료 후 진행
- **법령 근거**: 상증법 §20 (mst 276123) · 시행령 §18① (mst 283637) — KoreanLaw 본문 축자 확인

---

## Context

현행 `calcPersonalDeductions(input.heirs, baseDate)`는 `heirs[]`만 순회하여 인적공제를 산정한다.

문제:
- **G4**: 비상속인 동거가족(부양 손자·장인·장모·형제 등)은 heirs[]에 등록 경로가 없어 미성년·연로자·장애인공제 누락 가능
- **G5**: legatee(비상속인 수유자)·corporate(영리법인)도 heirs[]에 포함되어 인적공제 대상 자동 순회 — 동거가족 아닌 미성년 legatee에 공제 오적용 위험

§20 법문: "상속인 **+ 동거가족**" 대상 → 현행은 상속인만 처리.

---

## 법령 근거

### §20① 대상 범위 (mst 276123)

```
2호: "상속인(배우자는 제외한다) 및 동거가족 중 미성년자"
3호: "상속인(배우자는 제외한다) 및 동거가족 중 65세 이상인 사람"
4호: "상속인 및 동거가족 중 장애인"
```

### 시행령 §18① 동거가족 정의 (mst 283637)

```
① 법 §20①에서 "동거가족"이란 상속개시일 현재 피상속인이 사실상 부양하는
   직계존비속(배우자의 직계존속을 포함한다)·형제자매를 말한다.
```

**포함**: 손자·손녀 (직계비속), 부·모 (직계존속), 조부모 (직계존속), 장인·장모 (배우자의 직계존속), 형제자매  
**불포함**: 처남·처제·시동생 (배우자의 형제자매 — 시행령 §18① 열거 외), 사위·며느리

### 인적공제 대상 정리

| 구분 | 미성년(2호) | 연로자(3호) | 장애인(4호) |
|---|---|---|---|
| 상속인 (배우자 제외) | ○ | ○ | ○ |
| 배우자 | ✗ | ✗ | ○ |
| 동거가족 (시령 §18①) | ○ | ○ | ○ |
| legatee (비상속인 수유자) | **✗** | **✗** | **✗** |
| corporate (영리법인) | **✗** | **✗** | **✗** |
| isHeir===false (상속포기) | ○ | ○ | ○ |

> isHeir===false (상속포기자): **인적공제 대상 확정 (CD-B)** — 상속 포기 등으로 상속받지 않아도 인적공제 대상(**상증기준 20-18-6**, PDF p.329 ②). 상속개시일 기준 상속인 지위 보유 → ○ (요확인 해소). 단, 옵션 B에서는 상속포기자가 heirs[]에 `isHeir:false`로 남아도 `calcPersonalDeductions`의 상속인 필터(legatee·corporate만 제외)에 포함되므로 정합.

---

## 옵션 비교: A vs B

### 옵션 A — `isHeir: false` + `isCohabitantDependent: true` (Heir 배열에 통합)

동거가족을 기존 `heirs[]`에 추가하되 `isHeir: false`(상속권 없음)와 `isCohabitantDependent: true` 플래그로 구분.

```typescript
// Heir 인터페이스 추가
isCohabitantDependent?: boolean; // 시령 §18① 동거가족 — 상속인 아님
// (기존) isHeir?: boolean; // false = 상속포기·비상속인

// 입력 예시: 부양 손자 (동거가족)
{
  id: "grandchild-1",
  relation: "other",       // 또는 "child" 여부 검토 (손자는 child 아님)
  name: "손자A",
  birthDate: "2017-03-04",
  isDisabled: true,
  gender: "male",
  isHeir: false,
  isCohabitantDependent: true,
}
```

**오염 분석 (실측 기반):**

| 함수 | isHeir 필터 존재 | 오염 위험 |
|---|---|---|
| `computeLegalShares` (정의 `inheritance-legal-share.ts:33`, 필터 `:38`) | `isHeir !== false` 명시 필터 ✅ (실측 확인) | **오염 없음** |
| `calcSpouseDeduction` → `calcLegalShareRatios` (`tax-utils.ts:177~193`) | **필터 없음** ✗ | **오염 있음** — isHeir:false 동거가족이 포함되면 배우자 법정상속분 비율 감소 |
| `isSpouseSoleHeir` 판정 (`inheritance-deductions.ts:550~554`) | `relation !== "legatee" && !== "corporate"` 필터 (isHeir 미사용) | **오염 있음** — isHeir:false동거가족이 있으면 "배우자 단독" 판정 방해 가능 |
| `calcPersonalDeductions` (`personal-deduction-calc.ts:271`) | 필터 없음 | 동거가족 포함 목적이므로 의도적 포함 |
| allocation (`inheritance-allocation.ts:352`) | `computeLegalShares` 경유 ✅ | 오염 없음 |
| 세대생략 판정 (`inheritance-generation-skip.ts`) | `computeLegalShares` 경유 ✅ | 오염 없음 |

**장점**:
- 단일 데이터 구조 — 기존 `heirs[]` 그대로 사용, 별도 입력 UI 최소화
- `calcPersonalDeductions`에 동거가족 자동 포함 (플래그 조건 추가만)

**단점**:
- `calcLegalShareRatios`(tax-utils.ts)에 `isHeir !== false` 필터 추가 수정 필요 — 미수정 시 배우자공제 오염
- `isSpouseSoleHeir` 판정에도 `isCohabitantDependent !== true` 조건 추가 필요
- 두 군데 이상 수정 → 누락 시 silent 오류 위험

### 옵션 B — 별도 `cohabitantDependents[]` 배열 신설

인적공제 전용 동거가족을 별도 배열로 분리.

```typescript
// InheritanceDeductionInput에 추가
cohabitantDependents?: {
  id: string;
  name?: string;
  birthDate?: string;
  isDisabled?: boolean;
  gender?: "male" | "female";
  relation: "lineal_ascendant" | "lineal_descendant" | "sibling"; // 시령 §18①
}[];
```

**오염 분석:**

| 함수 | 오염 위험 |
|---|---|
| `computeLegalShares` | **오염 없음** — 별도 배열이므로 heirs[]에 영향 없음 |
| `calcLegalShareRatios` | **오염 없음** — 동일 이유 |
| `isSpouseSoleHeir` 판정 | **오염 없음** |
| `calcPersonalDeductions` | 명시 인자 변경 필요: `(heirs, dependents, baseDate)` |

**장점**:
- heirs[] 오염 원천 차단 — 기존 함수 수정 0
- 의미 분리 명확 (상속인 vs 부양가족)
- legatee G5 문제도 별도로 해결 가능 (heirs[]에서 legatee 필터링)

**단점**:
- 신규 입력 배열 → 14개 동기화 지점에서 추가 배열 대응 필요 (Zod·API·route·UI)
- `calcPersonalDeductions` 시그니처 변경 (downstream 영향 있으나 소규모)

---

## 권고: **옵션 B (별도 배열)**

### 권고 근거

1. **오염 차단 확실성**: 옵션 A는 `calcLegalShareRatios`(tax-utils.ts:177)와 `isSpouseSoleHeir`(inheritance-deductions.ts:550)에 수정을 반드시 동반해야 한다. 두 군데 중 하나라도 누락하면 배우자공제·§21② 판정이 silent 오염된다. 옵션 B는 heirs[] 전혀 미변경.

2. **의미 정합성**: 시행령 §18①의 "동거가족"은 **상속인이 아닌 부양 직계존비속·형제자매**다. 이들을 `isHeir:false`로 heirs[]에 넣는 것은 개념상 혼재(상속포기자와 동거가족이 같은 필드로 구분됨).

3. **legatee G5 동시 해결**: 별도 배열로 분리하면 `calcPersonalDeductions`가 `[...activeHeirs, ...cohabitantDependents]`를 받아 인적공제를 계산하되, legatee·corporate는 `activeHeirs` 필터에서 제외하면 G5도 함께 해소된다.

4. **기존 함수 수정 최소화**: `calcPersonalDeductions`의 시그니처 변경 1건만으로 족하다. `calcLegalShareRatios`·`calcSpouseDeduction`·`isSpouseSoleHeir`는 무변경.

### 권고 구현 방향

```typescript
// InheritanceDeductionInput 확장
cohabitantDependents?: CohabitantDependent[]; // 시령 §18① 동거가족

// CohabitantDependent 타입
export interface CohabitantDependent {
  id: string;
  name?: string;
  birthDate?: string;
  isDisabled?: boolean;
  gender?: "male" | "female";
  /** 시령 §18① 제한: 직계존비속(배우자의 직계존속 포함)·형제자매만 */
  relation: "lineal_ascendant" | "lineal_descendant" | "sibling";
}

// calcPersonalDeductions 시그니처 변경
export function calcPersonalDeductions(
  heirs: Heir[],           // 상속인 (legatee·corporate 제외 필터 G5 추가)
  baseDate: string,
  cohabitantDependents?: CohabitantDependent[],  // 동거가족 (옵션B)
): PersonalDeductionSummary { ... }

// 인적공제 대상 합산
const personalTargets: PersonalTarget[] = [
  // 상속인 (legatee·corporate 제외 — G5)
  ...heirs
    .filter(h => h.relation !== "legatee" && h.relation !== "corporate")
    .map(h => ({ ...h, isCohabitant: false })),
  // 동거가족
  ...(cohabitantDependents ?? []).map(d => ({ ...d, isCohabitant: true })),
];
```

> **relation 매핑 (CD-C)**: `lineal_descendant`는 손자·손녀용 **신규 값** (HeirRelation엔 없음 — `CohabitantDependent`는 별도 타입이므로 신규 enum 허용). 장인·장모(배우자의 직계존속)는 `lineal_ascendant`로 매핑(시령 §18① "배우자의 직계존속을 포함"). 처남·처제·시동생은 §18① 열거 외 → 입력 대상 아님.

---

## G5 legatee over-inclusion 해소

옵션 B 채택 시 `calcPersonalDeductions` 내부에서 heirs 필터 추가:

```typescript
// 인적공제 대상: 상속인(legatee·corporate 제외) + 동거가족
const activeHeirs = heirs.filter(
  h => h.relation !== "legatee" && h.relation !== "corporate"
);
```

이로써 비상속인 수유자(legatee, 예: 손녀)가 미성년자·장애인공제 대상에서 제외됨.

---

## ★ 케이스 인벤토리

| # | 시나리오 | 법령 근거 | 기대값 | 상태 |
|---|---------|----------|--------|------|
| CD-1 | 동거가족 손자 남5세 장애 (C9) | §20①2호·4호 + 시령 §18① | 미성년1.4억+장애7.6억=9억 | ☐ TODO (P0 완료 후) |
| CD-2 | 동거가족 장인(배우자 직계존속) 66세 | §20①3호 + 시령 §18① "배우자의 직계존속 포함" | 연로자5천만 | ☐ TODO |
| CD-3 | legatee 손녀 미성년 → 공제 대상 외 | G5 — legatee는 동거가족 아님 | 미성년공제 0 | ☐ TODO |
| CD-4 | 동거가족 형제 20세 (미성년 아님) | §20①2호 — 19세 이상 | 공제 0 | ☐ TODO |
| CD-5 | 동거가족 + 상속인 혼재 — 연로자 중복 카운트 방지 | §20①3호 | 중복 없이 단수 카운트 | ☐ TODO |

---

## 후속 분기 (Q2 결정 이후 Do)

P1 구현은 P0 구현 완료 후 진행:

1. `CohabitantDependent` 타입 정의
2. `InheritanceDeductionInput.cohabitantDependents` 추가
3. `calcPersonalDeductions` 시그니처 + 내부 필터 수정
4. UI: 별도 "동거가족 추가" 섹션 (HeirComposition 하단 또는 별도 단계)
5. Zod: `cohabitantDependents` 배열 스키마 추가 (⑫ 동기화 지점)
6. 14지점 전수 동기화

---

## 제약

- P0 완료 전 P1 착수 금지 (P0 결과가 `calcPersonalDeductions` 시그니처에 영향)
- `calcLegalShareRatios`·`calcSpouseDeduction`·`computeLegalShares` 수정 불필요 (옵션 B 선택)
- `calcPersonalDeductions` 3rd 인자 `cohabitantDependents?`는 **optional** → P0의 2-arg 호출부(`inheritance-deductions.ts:539`) **무변경** (하위호환, CD-D)
- 동거가족은 `InheritanceDeductionInput`에만 추가 — `Heir` 타입 오염 없음

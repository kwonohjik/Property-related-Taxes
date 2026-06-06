# 상속세 동거가족 인적공제 모델링 (§20 P1) — 엔진 설계

- **작성일**: 2026-06-05 (P1 본트랙 착수 — 자가검토 루프 갱신)
- **worktree**: `personal-deduction-enhancement`
- **단일 출처**: `docs/00-pm/inheritance-personal-deduction-enhancement.plan.md` §3 G4·G5 / §5 Phase 4 / §8 Q2
- **범위**: P1 — 비상속인 동거가족 입력 모델링 + legatee over-inclusion(G5) 차단
- **선행 조건**: P0+P2 **완료**(PR #26, `d062db4`, 6587 PASS) — `calcPersonalDeductions(heirs, baseDate)` 2-arg 확정. **충족 → 착수.**
- **법령 근거**: 상증법 §20 (mst 276123) · 시행령 §18①③ (mst 283637) — KoreanLaw 본문 축자 (계획서 §1.3)
- **설계 결정**: **옵션 B 확정** (계획서 §8 Q2) — 별도 `cohabitantDependents[]` 배열, heirs[] 오염 0

---

## Context

현행 `calcPersonalDeductions(input.heirs, baseDate)`(실측 `inheritance-deductions.ts:539`, 2-arg)는 `heirs[]`만 순회하여 인적공제를 산정한다.

문제:
- **G4**: 비상속인 동거가족(부양 손자·장인·장모·형제 등)은 heirs[]에 등록 경로가 없어 미성년·연로자·장애인공제 누락 가능.
- **G5**: legatee(비상속인 수유자)·corporate(영리법인)도 heirs[]에 포함되어 인적공제 대상으로 자동 순회 — 동거가족 아닌 미성년 legatee에 공제 오적용 위험.

§20 법문: "상속인 **+ 동거가족**" 대상 → 현행은 상속인만 처리, 게다가 legatee/corporate 미배제.

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

**포함**: 손자·손녀(직계비속), 부·모·조부모(직계존속), 장인·장모(배우자의 직계존속), 형제자매
**불포함**: 처남·처제·시동생(배우자의 형제자매 — §18① 열거 외), 사위·며느리

### 시행령 §18③ 장애인 범위 (P-7)

동거가족 장애인도 「소득세법 시행령」 §107① 각 호(장애인복지법 장애인 / 국가유공자 상이자 / 항시 치료 중증환자) 기준 — 상속인 장애인과 동일. `CohabitantDependent.isDisabled`에 동일 적용.

### 인적공제 대상 정리

| 구분 | 자녀(1호) | 미성년(2호) | 연로자(3호) | 장애인(4호) |
|---|:---:|:---:|:---:|:---:|
| 상속인 (배우자 제외) | child만 ○ | ○ | ○(spouse·child 제외) | ○ |
| 배우자 | ✗ | ✗ | ✗ | ○ |
| 동거가족 (시령 §18①) | ✗(자녀 아님) | ○ | ○ | ○ |
| legatee (비상속인 수유자) | **✗** | **✗** | **✗** | **✗** |
| corporate (영리법인) | **✗** | **✗** | **✗** | **✗** |
| isHeir===false (상속포기) | ○ | ○ | ○ | ○ |

> isHeir===false (상속포기자): **인적공제 대상**(상증기준 20-18-6, PDF p.329 ②). 상속개시일 기준 상속인 지위 보유 → ○. 옵션 B에서는 상속포기자가 heirs[]에 `isHeir:false`로 남아도 `calcPersonalDeductions`의 상속인 필터(legatee·corporate만 제외)에 포함되므로 정합.

---

## 옵션 비교: A vs B (실측 오염 분석)

### 옵션 A — `isHeir: false` + `isCohabitantDependent: true` (Heir 배열 통합)

동거가족을 기존 `heirs[]`에 추가하되 플래그로 구분.

**오염 분석 (실측):**

| 함수 | isHeir 필터 | 오염 |
|---|---|---|
| `computeLegalShares` (`inheritance-legal-share.ts:33`, 필터 `:34~38` `h.isHeir !== false`) | 명시 필터 ✅ (실측) | **오염 없음** |
| `calcLegalShareRatios` (`tax-utils.ts:177~193`) | **필터 없음** ✗ (실측: `unit = relation==="spouse"?1.5:1`, 전 heir 무필터 순회) | **오염 있음** — isHeir:false 동거가족 혼입 시 배우자 법정상속분 비율 감소 |
| `isSpouseSoleHeir` (`inheritance-deductions.ts:550~554` `realHeirs = relation!==legatee && !==corporate`) | legatee/corporate만 제외, isHeir 미사용 | **오염 있음** — isHeir:false 동거가족이 realHeirs에 포함 → `every(spouse)` 깨져 §21② 판정 방해 |
| `calcPersonalDeductions` (`personal-deduction-calc.ts:305`) | 필터 없음 | 동거가족 포함 목적이므로 의도적 |

> 옵션 A는 `calcLegalShareRatios`·`isSpouseSoleHeir` **두 곳에 isHeir/isCohabitantDependent 필터 추가 수정 필수**. 하나라도 누락 시 배우자공제·§21②가 silent 오염. **채택 안 함.**

### 옵션 B — 별도 `cohabitantDependents[]` 배열 (채택)

| 함수 | 오염 |
|---|---|
| `computeLegalShares` / `calcLegalShareRatios` / `isSpouseSoleHeir` | **오염 없음** — 별도 배열, heirs[] 무변경 |
| `calcPersonalDeductions` | 시그니처 3-arg 변경 + 호출부 :539 3-arg 전달 (2곳) |

**채택 근거**: heirs[] 전혀 미변경(오염 원천 차단) + 의미 분리(상속인 vs 부양가족) + G5 동시 해결.

---

## 권고 구현 방향 (옵션 B)

### input 타입 — `CohabitantDependent` (신규)

```typescript
// types/inheritance-gift.types.ts (HeirRelation 인근)
export interface CohabitantDependent {
  id: string;
  name?: string;
  birthDate?: string;          // YYYY-MM-DD
  isDisabled?: boolean;
  gender?: "male" | "female";  // 장애인(isDisabled) 시 필수 — §20①4호 성별·연령별 기대여명
  /**
   * 시령 §18① 제한: 직계존비속(배우자의 직계존속 포함)·형제자매.
   * - lineal_ascendant: 부·모·조부모·장인·장모(배우자 직계존속 포함)
   * - lineal_descendant: 손자·손녀 (HeirRelation엔 없는 신규 값 — CohabitantDependent 전용)
   * - sibling: 형제자매
   */
  relation: "lineal_ascendant" | "lineal_descendant" | "sibling";
}

// InheritanceDeductionInput (827~) 에 추가
cohabitantDependents?: CohabitantDependent[];
```

### 엔진 시그니처 변경 (2곳, P-2)

```typescript
// personal-deduction-calc.ts
export function calcPersonalDeductions(
  heirs: Heir[],
  baseDate: string,
  cohabitantDependents?: CohabitantDependent[],   // 신규 3rd (optional → 하위호환)
): PersonalDeductionSummary

// 호출부 inheritance-deductions.ts:539 (P-2 — 무변경이면 동거가족 미반영)
const personalResult = calcPersonalDeductions(
  input.heirs,
  baseDate,                          // = input.deathDate (§20 상속개시일 현재, P-10)
  input.cohabitantDependents,
);
```

### 정규화 어댑터 (P-3 핵심) — `CohabitantDependent → Heir`

`calcChildren/Minor/Elder/Disabled`는 `Heir[]` 인자. `CohabitantDependent.relation`의 `lineal_descendant`는 HeirRelation(실측 591-599)에 **없어** 직접 전달 시 타입 불일치 → 내부 정규화.

```typescript
function toPersonalHeir(d: CohabitantDependent): Heir {
  return {
    id: d.id,
    name: d.name,
    birthDate: d.birthDate,
    isDisabled: d.isDisabled,
    gender: d.gender,
    // relation 매핑: 손자녀(lineal_descendant)는 자녀공제·연로자 child제외 회피 위해 "other"
    relation: d.relation === "lineal_descendant" ? "other" : d.relation,
  };
}
```

| CohabitantDependent.relation | → Heir.relation | 자녀(1호) | 미성년(2호) | 연로자(3호) | 장애(4호) |
|---|---|:---:|:---:|:---:|:---:|
| lineal_descendant (손자) | `other` | ✗(child 아님) | ○ | ○(spouse·child 아님) | ○ |
| lineal_ascendant (부·장인) | `lineal_ascendant` | ✗ | ○ | ○ | ○ |
| sibling (형제) | `sibling` | ✗ | ○ | ○ | ○ |

> `other`·`lineal_ascendant`·`sibling` 모두 HeirRelation에 존재(실측 591-599) → 정규화 후 `Heir`로 안전 캐스팅. 동거가족엔 spouse·child가 없으므로 각 calc 함수의 기존 필터(미성년: spouse제외 / 연로자: spouse·child제외 / 자녀: child만)와 자동 정합.

### 알고리즘 (정규화 → G5 필터 → 합산 → detail echo)

```typescript
export function calcPersonalDeductions(heirs, baseDate, cohabitantDependents) {
  // G5: legatee·corporate는 인적공제 대상 아님 (realHeirs와 동일 패턴 inheritance-deductions.ts:551)
  const activeHeirs = heirs.filter(
    (h) => h.relation !== "legatee" && h.relation !== "corporate",
  );
  // 동거가족 정규화
  const normalized = (cohabitantDependents ?? []).map(toPersonalHeir);
  const cohabitantIds = new Set(normalized.map((d) => d.id));
  const targets = [...activeHeirs, ...normalized];

  const child = calcChildrenDeduction(targets);        // 동거가족 relation≠child → 0
  const minor = calcMinorDeduction(targets, baseDate);
  const elder = calcElderDeduction(targets, baseDate);
  const disabled = calcDisabledDeduction(targets, baseDate);

  // detail echo — perHeir에 isCohabitant 마커 부착 (heirId 역추적, R-4)
  const detail: PersonalDeductionDetail = {
    ...,
    minorPerHeir: minor.perHeir.map((r) => ({ ...r, isCohabitant: cohabitantIds.has(r.heirId) })),
    disabledPerHeir: disabled.perHeir.map((r) => ({ ...r, isCohabitant: cohabitantIds.has(r.heirId) })),
    ...,
  };
}
```

> **calc 함수(calcMinor/Elder/Disabled) 시그니처 무변경** — `targets: Heir[]` 그대로 받음. isCohabitant는 `calcPersonalDeductions`가 detail 조립 시 `cohabitantIds`로 부착 → calc 함수 result 타입 영향 최소.

### result 타입 — `PersonalDeductionDetail` 확장 (R-4)

```typescript
// types/inheritance-deduction-detail.types.ts:254~
minorPerHeir: Array<{ heirId; name?; age; remainingYears; deduction; isCohabitant?: boolean }>;
disabledPerHeir: Array<{ heirId; name?; gender; age; lifeExpectancy; deduction; isCohabitant?: boolean }>;
```

---

## G5 legatee over-inclusion 해소

현행 `calcPersonalDeductions`는 무필터 → legatee/corporate heir에 birthDate·isDisabled 있으면 미성년·장애공제 적용 중. P1에서 `activeHeirs` 필터로 제외 → 비상속인 수유자(예: 미성년 손녀 legatee)가 인적공제 대상에서 빠짐(CD-3·C9c).

**회귀 점검(P-5)**: 기존 legatee 포함 테스트(`comprehensive-case-pdf`·`asset-heir-allocation-anchor` 등) 영향 — `npm test` 전수. (실측: comprehensive-case-pdf legatee 500M은 §24 한도 분자 차감에만 사용, 인적공제 미수령 추정.)

---

## ★ 케이스 인벤토리

| # | 시나리오 | 입력 | 자녀 | 미성년 | 연로자 | 장애 | 합계 | 법령 | 상태 |
|---|---------|------|---:|---:|---:|---:|---:|------|------|
| CD-1/C9 | 동거가족 손자 남5세 장애 | `lineal_descendant`, 2017-03-04생, male, 장애, 상속 2023-01-01 | 0 | 1.4억 | 0 | 7.6억 | **9억** | §20①2·4호+시령§18① | ☐ |
| CD-2/C9b | 동거가족 장인 66세 | `lineal_ascendant`, 1959생 | 0 | 0 | 5천만 | 0 | **5천만** | §20①3호+§18①"배우자 직계존속" | ☐ |
| CD-3/C9c | legatee 손녀 미성년(만10) | `legatee` heir, 2015생 | 0 | **0** | 0 | 0 | **0** | G5 — legatee 대상 외 | ☐ |
| CD-4 | 동거가족 형제 만20세 | `sibling`, birthDate 만20 | 0 | **0** | 0 | 0 | 0 | §20①2호 19세 경계 | ☐ |
| CD-5 | 동거가족+상속인 연로 각각 카운트 | 직계존속 heir 66 + 동거가족 형제 66 (서로 다른 2명) | 0 | 0 | 1억(2명) | 0 | 1억 | §20①3호 — 별도 배열이라 자동 분리 카운트(E-1) | ☐ |
| CD-6/C10 | PDF 종합사례 손자2 | C9 + 손자(2021-05-05, 1년7개월) | 0 | 3.2억 | 0 | 7.6억 | **10.8억** | 통합 anchor §1.5 | ☐ |

> CD-1·CD-3·CD-6이 핵심 anchor. CD-3은 G5(legatee 배제), CD-6은 통합(미성년 2명 3.2억 = 손자1 1.4억 + 손자2 1.8억).

---

## 14 동기화 지점 (P1 — `cohabitantDependents`)

| 지점 | 위치 | 작업 |
|---|---|---|
| ① 폼 상태 | `inheritance/shared.ts` form | `cohabitantDependents?: CohabitantDependent[]` (3-state) |
| ② initial | form factory | undefined (OFF) |
| ③ normalize | sessionStorage 호환 | optional |
| ④ API 변환 | `InheritanceTaxForm.tsx:348` deductionInput + `inheritance-api.ts:82` spread | deductionInput에 추가 → spread 자동 |
| ⑤ UI 위젯 | (UI 설계서 확정) | 동거가족 카드 |
| ⑥ 사이드바 | 인적공제 합계 | 동거가족 포함 |
| ⑦ 결과 카드 | `PersonalDeductionDetailCard` | isCohabitant 행 구분 |
| ⑧ validation | `inheritance-validate.ts:308~` | 장애+gender 차단(동거가족), relation 필수 |
| ⑫ Zod | `property-valuation-input.ts:657` `inheritanceDeductionInputSchema` | `cohabitantDependents: z.array(...).optional()` **(strip 방지)** |
| ⑬⑭ route | `route.ts:83` deductionInput cast | spread/cast 자동 ✅ |

> P1 신규 배열은 `deductionInput` 하위 → ④⑬⑭ 자동. **⑫·⑤·⑦·⑧이 핵심 작업.** (CD-D 정정: heir top-level과 달리 route 명시 매핑 불필요.)

---

## 제약

- `calcLegalShareRatios`·`calcSpouseDeduction`·`computeLegalShares`·`isSpouseSoleHeir` **무변경** (옵션 B).
- `calcPersonalDeductions` 3rd 인자 optional → P0의 다른 2-arg 호출부(있다면) 하위호환. **단 :539는 3-arg 전달 필수**(동거가족 반영, P-2 — CD-D "무변경" 주장 폐기).
- 동거가족 나이 기준일 = `input.deathDate`(§20 상속개시일 현재, P-10) — 상속인과 동일 baseDate.
- `Heir` 타입 무변경 — 동거가족은 `InheritanceDeductionInput.cohabitantDependents`에만 추가.
- `Heir.isCohabitant`(기존, §23의2 동거주택공제용)와 `PersonalDeductionDetail.*.isCohabitant`(신규, 동거가족 인적공제 마커)는 **의미 다름** — 혼동 주의.
- **result 타입 변경 범위(E-2)**: `MinorDeductionResult.perHeir`·`DisabledDeductionResult.perHeir`(calc 함수 반환)는 **무변경**. `isCohabitant`는 `PersonalDeductionDetail.{minor,disabled}PerHeir`(echo)에만 추가 — `calcPersonalDeductions`가 `cohabitantIds.has(heirId)`로 부착. calc 함수 시그니처·반환 타입 무변경.
- **같은 인물 이중 등록(E-1)**: 동거가족은 비상속인이므로 상속인(heirs)과 배타적 — 같은 사람을 양쪽에 등록하면 이중 카운트. UI가 별도 입력이라 사용자 책임이나, validation에서 heir.id ↔ cohabitantDependent.id 중복 시 안내 권장(차단까진 불요).

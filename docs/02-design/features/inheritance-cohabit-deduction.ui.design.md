# 동거주택 상속공제(§23의2) 시기구분 정밀화 — UI 설계

> 엔진 설계: `inheritance-cohabit-deduction.engine.design.md`
> 계획서: `docs/00-pm/inheritance-cohabit-deduction-gap-plan.md` (Phase 1 = G1)
> 작성: 2026-06-07

## Context

엔진 Phase 1(G1)은 동거주택공제 율·한도를 상속개시일 기준 시기구분(0 / 40%·5억 / 80%·5억 / 100%·6억)으로 교체한다. **신규 입력 필드가 0개**이므로 UI 변경은 **결과 카드 라벨 동적화 1건(⑦)** 으로 국한된다. 현재 결과 카드 `CohabitDeductionDetailCard`는 한도·공제율을 **정적 문자열로 하드코딩**(`"6억 최고한도"` 등)하여, 2016~2019 상속분(한도 5억)에서 값(5억)과 라벨("6억")이 어긋나는 표시 모순이 발생한다.

---

## 14개 동기화 지점 — 실측 영향 (신규 input 0)

본 변경은 엔진 input 타입 무변경 → 클라이언트 8지점 중 **⑦만 영향**, API/Route 6지점 **전부 무영향**.

| # | 지점 | 영향 | 사유 |
|---|---|---|---|
| ① 폼 상태 | — | 무 | 신규 필드 없음. deathDate 기존 존재 |
| ② initial | — | 무 | 〃 |
| ③ normalize | — | 무 | 〃 |
| ④ API 변환 | — | 무 | `lib/calc/inheritance-*-api.ts` — deathDate 기존 전달 |
| ⑤ UI 입력 위젯 | — | 무 | 입력 폼 변경 없음 |
| ⑥ 사이드바 합계 | — | 무 | 동거주택공제는 사이드바 합계 미표시(엔진 result 후 결과 카드만) |
| **⑦ 결과 카드** | **O** | `CohabitDeductionDetailCard` 라벨 3곳 동적화 | 본 작업 유일 대상 |
| ⑧ Validation | — | 무 | 신규 필수 필드 없음 |
| ⑨~⑭ API/Route/Zod | — | 무 | input 타입 무변경 |

---

## 결과 카드 설계 (⑦) — `CohabitDeductionDetailCard`

**파일**: `components/calc/results/deduction-breakdown/CohabitDeductionDetailCard.tsx`
**단일 카드로 양 경로 커버**: 일반 경로·Phase E directAmount 경로 모두 `cohabitDeductionDetail`을 빌드 → `DeductionBreakdownSection.tsx:140`이 동일 카드에 전달. **한 곳 수정으로 두 경로 모두 정합**.

### 정정 대상 (값은 이미 동적, 라벨만 정적 → 동적화)

| 위치 | 현행 (정적) | 정정 (동적) | 비고 |
|---|---|---|---|
| `:52` | `` `공제율 ${(rate*100).toFixed(0)}% (2020.1.1. 이후: 100%)` `` | `` `공제율 ${(rate*100).toFixed(0)}%` `` | "(2020.1.1. 이후: 100%)" 정적 안내문 **제거** — 시기별 율이 이미 rate에 반영되어 오해 유발 |
| `:56` | `"6억 최고한도"` | `` `${(detail.cap/100_000_000).toFixed(0)}억 최고한도` `` | cap=5억/6억 동적 (0억 = pre-2009 엣지) |
| `:61` | `` `Min(공시가격 × ${(rate*100).toFixed(0)}%, 6억)` `` | `` `Min(공시가격 × ${(rate*100).toFixed(0)}%, ${(detail.cap/100_000_000).toFixed(0)}억)` `` | 한도 동적 |

### 표시 예시 (ASCII)

**2018년 상속, 주택 8억 (한도 5억 적용 — 수정 후)**:
```
동거주택 공제 (§23의2)                              500,000,000  ▼
  ┌────────────────────────────────────────────────────────┐
  │ 동거주택 공시가격 (평가액)              800,000,000        │
  │ 공제율 80%                              640,000,000        │   ← rate 동적
  │ 5억 최고한도                            500,000,000        │   ← cap 동적 (was "6억")
  │ ─────────────────────────────────────────────────────── │
  │ Min(공시가격 × 80%, 5억)                500,000,000        │   ← "5억" 동적 (was "6억")
  └────────────────────────────────────────────────────────┘
```

**2024년 상속, 주택 8억 (한도 6억 — 회귀 보존)**:
```
  │ 공제율 100%                             800,000,000        │
  │ 6억 최고한도                            600,000,000        │
  │ Min(공시가격 × 100%, 6억)               600,000,000        │
```

### 금액 칸 정렬
- 기존 `DetailRow`/`SubTotalRow`(`shared.tsx`) 사용 — `value`는 `formatKRW()` 통과. 실측상 공용 컴포넌트는 `font-mono`만 적용(`shared.tsx:35,:89,:127`), `tabular-nums`·명시 `text-right`는 미적용(라벨 좌/값 우 flex justify-between 레이아웃).
- **본 변경은 라벨 텍스트 3곳만 수정**(행 추가·금액 컬럼 신설 없음) → 정렬 개선은 범위 외. (개선 희망 시 `amount-column-align` 스킬로 별도 작업 — 본 PDCA 비포함)

### "원" 단위 표기
- `formatKRW` 기존 사용 — 결과 정책 준수(끝 "원" 미표기 확인은 기존 컴포넌트 책임, 본 변경 무관).

---

## 입력 위젯 (⑤) — 변경 없음

- 동거주택 상속공제 입력은 기존 2개 토글로 유지 (본 변경 무관, 회귀만 확인):
  - `HeirComposition.tsx:368` — `isCohabitant` 토글(자녀 한정, violet)
  - `EstateBodyRealEstate.tsx:387` — `isCohabitantHouse` 자산 토글(violet, 1세대1주택 단일선택)
- 상속개시일(`deathDate`)은 기존 Step 입력 — 시기구분의 입력 소스이나 **신규 위젯 아님**.

---

## Validation (⑧) — 변경 없음

- 신규 필수 필드 없음. 기존 validation 유지.
- UI 통과 ↔ validate 차단 모순 없음(필드 무변경).

---

## E2E 시나리오 (`e2e/inheritance-cohabit-deduction.spec.ts`)

| ID | 시나리오 | 기대 |
|---|---|---|
| E2E-1 | 상속개시일 2018-06-01 + 동거주택(자녀 동거 체크) 공시가격 8억 → 계산 | 결과 카드 "5억 최고한도" + 공제 5억 표시 |
| E2E-2 | 상속개시일 2024-06-01 + 동거주택 8억 → 계산 | "6억 최고한도" + 공제 6억 (회귀) |

- worktree 시 `E2E_PORT=3100` (memory `feedback_e2e_worktree_port_isolation`).
- "브라우저 확인" = spec 통과로 충족(memory `feedback_browser_verify_with_playwright`).

---

## 7대 사용자 동기화 지점 점검

- [x] DateInput — deathDate 기존(type="date" 미사용)
- [x] CurrencyInput/DecimalInput — 결과 카드는 입력 위젯 없음(표시만)
- [x] 결과 산식 한국어·약어 금지 — `Min(공시가격 × N%, K억)` 한국어 풀어쓰기 유지
- [x] "원" 단위 미표기 — formatKRW 기존
- [x] 내부 id 노출 없음 — 해당 없음
- [x] 금액 칸 정렬 — 공용 DetailRow 기존
- [x] 토글 가시성 — 입력 토글 변경 없음(기존 violet ToggleCard 유지)

---

## 작업 분담

- **엔진 시니어**(`inheritance-gift-tax-senior`): `cohabitRateAndCap` + 일반/Phase E 경로 교체 + anchor CH-RATE-1~8.
- **UI 시니어**(`inheritance-gift-tax-ui-senior`): `CohabitDeductionDetailCard` 라벨 3곳 동적화 + E2E 2건. (엔진 detail.cap/detail.rate가 이미 동적이므로 라벨 바인딩만)
- 충돌 없음: 엔진은 `inheritance-deductions.ts`, UI는 `CohabitDeductionDetailCard.tsx` — 파일 분리.

---

---

# Phase 2~3 UI 설계 — 동거주택공제 요건 입력 강화 + 별지 신고서

> 추가 작성: 2026-06-07
> 범위: G5(상속인 범위 확대) + G3(동거기간 입력) + G6(주택판정 안내) + G4(부수토지 면적한도) + G8(동거주택 상속공제신고서)
> 계획서 참조: `docs/00-pm/inheritance-cohabit-deduction-gap-plan.md` §6 Phase 2 스케치
> Phase 1은 머지 완료 (2026-06-07, `086620e`)

---

## 0. 실측 기준점 (Design 단계 확인 완료)

| 파일 | 줄수 | 관련 부분 |
|---|---|---|
| `components/calc/HeirComposition.tsx` | **619줄** | `showCohabitant = heir.relation === "child"` (:139), 동거주택 ToggleCard (:384~393) |
| `components/calc/inheritance/steps.tsx` | **780줄** | HeirComposition 호출 (:152), 동거주택 공시가격 입력 (:434~) — **800줄 초과 위험, 신규 블록 인라인 추가 금지** |
| `components/calc/inheritance/shared.ts` | 289줄 | `cohabitHouseStdPrice` / `cohabitDirectAmount` 폼 필드 (:54, :60) |
| `lib/tax-engine/types/inheritance-gift.types.ts` | — | `Heir.isCohabitant?: boolean` (:642), `HeirRelation` 7종 (:605) |
| `lib/validators/property-valuation-input.ts` | — | `heirSchema.isCohabitant: z.boolean().optional()` (:421) |
| `CohabitDeductionDetailCard.tsx` | 69줄 | Phase 1 이미 `detail.cap/rate` 동적화 완료 |

**HeirRelation 현행 7종** (실측):
`"spouse" | "child" | "lineal_ascendant" | "sibling" | "other" | "legatee" | "corporate"`

`"lineal_descendant"` 는 **`HeirRelation`에 없음** — `CohabitantDependent.relation`(별도 배열)에만 존재.
→ G5 구현 시 `HeirRelation`에 `"lineal_descendant"` 추가하거나, 기존 `"other"` 관계에서 `isCohabitant` 노출 조건을 deathDate 기반 연혁 분기로 확대하는 두 경로가 있음.

---

## 1. 핵심 정책 결정 (Design 단계 확정)

### 1-1. G5 상속인 관계 범위 확대 방식

**결정: `HeirRelation`에 `"lineal_descendant"` 추가 (손자녀 등 직계비속)**

이유:
- 현행 `HEIR_RELATIONS` 배열에 인적공제·협의분할 등 공통 처리가 모두 `HeirRelation` enum 기반
- `CohabitantDependent` 배열의 `"lineal_descendant"` 와 동일 값이지만 역할이 다름(상속인 vs 부양가족) — 혼동 방지를 위해 주석 명시 필수
- `"other"` 관계 재사용 시 다른 기타 상속인과 구분 불가 → 신규 값이 더 명확

**연혁 분기**:
- `2014~2021`: 직계비속(`child` + `lineal_descendant`) 한정
- `2022.1.1.~`: 직계비속 + 대습상속된 직계비속의 배우자(`lineal_descendant_spouse_substitute`)

단, 대습상속 배우자는 §27 `isSubstituteInheritance` + 별도 관계 플래그가 복잡해짐 →
**Phase 2 범위**: `lineal_descendant` 추가 + 2022~ 대습 배우자는 `isCohabitant` 노출 조건 확대(배우자 `spouse`에서 `isSubstituteInheritance === true` 이면서 deathDate >= 2022인 경우)로 처리.

### 1-2. G3 동거기간 입력 방식

**결정: `cohabitStartDate` (DateInput, YYYY-MM-DD) — 사용자 확정**

동거 연수 preview는 `useMemo`로 순수 계산 (엔진 미경유, UI 표시 전용):
```
동거연수 = floor(deathDate - cohabitStartDate 연수) - 미성년기간 - cohabitExcludedYears
```
10년 미만 시 rose 경고 배지 표시. 자동 차단(공제 배제) 아님.

### 1-3. G4 부수토지 면적한도 입력 노출 조건

**결정: 아파트(공동주택)는 미노출, 단독주택에서만 노출**

- 공동주택가격에는 부수토지가 이미 포함 → 면적 한도 적용 의미 없음
- `isCohabitantHouse === true`인 자산의 `category === "real_estate"` + 단독주택 유형 판별 필요
- **엔진 시니어에게 필드명 확정 위임 필요** (현재 엔진에 부수토지 한도 로직 미구현)

### 1-4. G8 동거주택 상속공제신고서 별지 서식

**결정: `besshi-form-replica` 패턴 차용, `CohabitHousingBesshiSection.tsx` 신규 파일**

기존 `DeductionBesshiFormsSection.tsx`(부표3·별지5호·별지1호 오케스트레이터)와 분리.
상속세 결과뷰(`InheritanceTaxResultView.tsx`)에 재사용 연결.

---

## 2. 신규 FormData 필드 (①②③ 동기화)

### 2-1. `Heir` 타입 확장 (엔진 타입 — 엔진 시니어 결정 필요)

현행 `Heir` 인터페이스에 추가 필요한 optional 필드:

```typescript
// lib/tax-engine/types/inheritance-gift.types.ts
interface Heir {
  // ... 기존 필드 ...

  // Phase 2 — G3 동거기간 입력 (§23의2①1호 10년 요건)
  /**
   * 동거시작일 (YYYY-MM-DD). isCohabitant === true 시 의미 있음.
   * 엔진은 동거연수 자동판정에 사용. UI도 useMemo preview에 사용.
   * 미입력 시 엔진: 10년 요건 충족으로 간주(사용자 책임) — validation 경고만.
   */
  cohabitStartDate?: string;

  /**
   * 부득이 사유 차감 연수 (§23의2② · §20의2② · §9의2 — 징집·취학·근무·질병).
   * 동거기간에 산입되지 않는 연수를 직접 입력. optional, 소수점 허용.
   */
  cohabitExcludedYears?: number;
}
```

**★ 엔진 시니어 확인 사항**: `cohabitStartDate` / `cohabitExcludedYears` 를 엔진 input 타입에 추가할지, UI 전용(validation 경고만)으로 유지할지. 엔진이 동거연수를 자동 판정해 공제를 차단하면 엔진 필드 필수, 경고만이면 폼 전용 가능.

### 2-2. `InheritanceTaxFormData` 확장 (components/calc/inheritance/shared.ts)

```typescript
// G5 — lineal_descendant 관계는 HeirRelation enum 확장으로 처리 (heirs[] 구조 변경 없음)

// G4 — 부수토지 면적한도 입력 (단독주택 해당 시만 노출)
// 엔진 시니어 필드명 확정 후 추가:
// cohabitAncillaryLandArea?: string;    // 부수토지 면적 (㎡, DecimalInput)
// cohabitBuildingFootprint?: string;    // 건물정착면적 (㎡, DecimalInput)
// cohabitLandAreaZone?: "urban_metro" | "urban_suburban" | "rural_small" | "other"; // 지역구분
```

### 2-3. INITIAL_FORM 추가 값

```typescript
// Phase 2 신규 필드 — Heir 레벨이므로 heirs[] 내부에 자연스럽게 optional
// INITIAL_FORM 자체 변경 불필요 (Heir factory가 없고 generateHeirId 후 { id, relation }만 생성)
```

### 2-4. normalize fallback (③)

`normalize-restored-form-dates.ts` (기존 `components/calc/inheritance/normalize-restored-form-dates.ts`)에:
```typescript
// heirs 배열 내 cohabitStartDate가 string인지 확인 (sessionStorage 복원 후 Date 변환 방지)
// — date-coerce.ts 패턴: coerceDate는 route handler에서만, 클라이언트는 string 유지
```

---

## 3. API 변환 (④) — `lib/calc/inheritance-api.ts`

`heirSchema` (Zod, `lib/validators/property-valuation-input.ts`)에 신규 필드 추가:

```typescript
// ⑫ Zod heirSchema 추가
cohabitStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식").optional(),
cohabitExcludedYears: z.number().min(0).max(20).optional(),
```

API 변환 함수(`lib/calc/inheritance-api.ts` 또는 `route.ts` ⑭ spread) 에서:
- `heirs: parsedData.heirs as InheritanceTaxInput["heirs"]` — 이미 spread 패턴으로 전달되므로 Zod 스키마에 필드만 추가하면 자동 포함됨
- ⑬ body spread: 현행 `heirs` 객체 전체가 `InheritanceTaxInput["heirs"]`로 cast되므로 Heir 타입 확장 후 자동 포함

**G5 `HeirRelation` 확장**:
```typescript
// heirSchema.relation enum 확장
relation: z.enum([
  "spouse",
  "child",
  "lineal_ascendant",
  "sibling",
  "other",
  "legatee",
  "corporate",
  "lineal_descendant",          // ← 신규 (G5)
]),
```

**G4 부수토지** (엔진 필드 확정 후):
```typescript
// deductionInput 내부 또는 별도 필드로 추가 (엔진 시니어 결정 후 반영)
```

---

## 4. UI 입력 위젯 상세 (⑤)

### 4-1. G5 — `showCohabitant` 조건 확대 (HeirComposition.tsx)

**현행** (`:139`):
```typescript
const showCohabitant = heir.relation === "child";
```

**변경 후**:
```typescript
const showCohabitant = (
  heir.relation === "child" ||
  heir.relation === "lineal_descendant" ||
  // 2022.1.1.~ : 대습상속 직계비속 배우자 (배우자 관계 + isSubstituteInheritance ON)
  (heir.relation === "spouse" && heir.isSubstituteInheritance === true && (deathDate ?? "") >= "2022-01-01")
);
```

**`changeHeirRelation` 정합 동반 수정**:
```typescript
// 현행 :100
if (newRelation !== "child") next.isCohabitant = undefined;
// 변경 후 — lineal_descendant도 동거주택 허용
if (newRelation !== "child" && newRelation !== "lineal_descendant") {
  // spouse인 경우는 isSubstituteInheritance 유지 (§27 배제 목적 겸용)
  if (newRelation !== "spouse") next.isCohabitant = undefined;
}
```

**연혁 안내 배지** (deathDate 기준):
- `deathDate < "2014-01-01"`: 직계비속·배우자 모두 해당 → `showCohabitant = heir.relation === "child" || heir.relation === "lineal_descendant" || heir.relation === "spouse"`
- `"2014-01-01" <= deathDate < "2022-01-01"`: 직계비속만 → `showCohabitant = heir.relation === "child" || heir.relation === "lineal_descendant"`
- `deathDate >= "2022-01-01"`: 직계비속 + 대습 배우자

**연혁 비교표**:

| 상속개시일 | 자녀(child) | 직계비속(lineal_descendant) | 대습 배우자(spouse+substitute) |
|---|---|---|---|
| 2009~2013 | O | O | O |
| 2014~2021 | O | O | X |
| 2022.1.1.~ | O | O | O |

**`HeirRelation` 타입 신규 값** (`inheritance-gift.types.ts`):
```typescript
export type HeirRelation =
  | "spouse"
  | "child"
  | "lineal_ascendant"
  | "sibling"
  | "other"
  | "legatee"
  | "corporate"
  | "lineal_descendant"; // Phase 2 신규 — 직계비속(손자녀) §23의2 G5
```

`HEIR_RELATION_LABELS`, `RELATION_ICONS`, `RELATION_HINTS`, `HEIR_RELATIONS` 배열에 `"lineal_descendant"` 항목 추가 필요 (`heir-relation-meta.ts`).

**800줄 정책**: `HeirComposition.tsx`는 현재 619줄. `showCohabitant` 조건 수정 4줄 + `changeHeirRelation` 정합 수정 2줄 = +6줄로 최소화. **동거기간 입력 블록은 반드시 별도 컴포넌트로 분리**.

### 4-2. G3 — `CohabitRequirementBlock.tsx` 신규 컴포넌트

**파일**: `components/calc/inheritance/CohabitRequirementBlock.tsx`

**노출 조건**: `heir.isCohabitant === true` (동거주택 ToggleCard ON) 시 토글 children으로 렌더.

**컴포넌트 구조**:

```tsx
interface CohabitRequirementBlockProps {
  heir: Heir;
  deathDate?: string;  // 동거연수 preview 계산용
  onUpdate: (patch: Partial<Heir>) => void;
}

// 내부 레이아웃
// [섹션 1 — sky] 동거기간 확인 (§23의2①1호)
//   ① cohabitStartDate — DateInput (동거시작일)
//      hint: "주민등록 무관 실제 동거 시작일 (재조세-575)"
//   ② cohabitExcludedYears — DecimalInput, optional, 소수점 허용
//      hint: "징집·취학(초중등 제외)·근무상 형편·1년 이상 질병요양 기간 (§23의2② · 상증칙 §9의2). 국외 대학원은 제외(재조세-434)"
//   ③ 동거연수 미리보기 — useMemo 계산값 표시
//      - 미성년 제외 (2016.1.1.~ 상속): heir.birthDate + deathDate 로 미성년 기간 계산
//      - rose 배지: 동거연수 < 10년

// [섹션 2 — violet] 1세대1주택 요건 (§23의2①2호)
//   안내 텍스트만: "피상속인과 상속인이 상속개시일로부터 소급 10년 이상 계속하여 1세대를 구성하며 1주택 보유"
//   예외 8개 안내 (상증령 §20의2①1~8호): 간략 텍스트

// [섹션 3 — emerald] 무주택 요건 (§23의2①3호)
//   안내 텍스트만: "상속개시일 현재 무주택자이거나 피상속인과 공동 1세대1주택자"
```

**동거연수 preview 계산 (useMemo)**:

```typescript
const previewYears = useMemo(() => {
  if (!heir.cohabitStartDate || !deathDate) return null;

  // 1. 기본 연수 (연도 차이, floor)
  const baseYears = differenceInYears(new Date(deathDate), new Date(heir.cohabitStartDate));

  // 2. 미성년 제외 (2016.1.1.~ 상속 + heir.birthDate 있을 때만)
  let minorYears = 0;
  if (heir.birthDate && (deathDate ?? "") >= "2016-01-01") {
    const adultDate = addYears(new Date(heir.birthDate), 19); // 만 19세 성인
    if (adultDate > new Date(heir.cohabitStartDate)) {
      const exclusionEnd = adultDate < new Date(deathDate) ? adultDate : new Date(deathDate);
      const exclusionStart = new Date(heir.cohabitStartDate);
      minorYears = Math.max(0, differenceInYears(exclusionEnd, exclusionStart));
    }
  }

  // 3. 부득이 사유 차감
  const excluded = heir.cohabitExcludedYears ?? 0;

  return Math.max(0, baseYears - minorYears - excluded);
}, [heir.cohabitStartDate, heir.birthDate, heir.cohabitExcludedYears, deathDate]);
```

**rose 경고 배지** (자동 차단 아님 — 자동 안분 fallback 금지 정책 준수):
```tsx
{previewYears !== null && previewYears < 10 && (
  <div className="flex items-center gap-1.5 rounded-md bg-rose-50 border border-rose-200 px-3 py-2">
    <span className="text-rose-600 text-xs font-medium">
      예상 동거연수 {previewYears}년 — 10년 미만입니다.
      실제 요건 충족 여부는 사실관계에 따라 확인하세요.
    </span>
  </div>
)}
```

**HeirComposition.tsx에서 호출 방식** (동거주택 ToggleCard children에 삽입):
```tsx
<ToggleCard
  tone="violet"
  title="동거주택 상속공제 해당"
  description={/* G6 안내 포함 — 하단 4-3 참조 */}
  checked={heir.isCohabitant ?? false}
  onCheckedChange={(v) => set({ isCohabitant: v, cohabitStartDate: v ? heir.cohabitStartDate : undefined, cohabitExcludedYears: v ? heir.cohabitExcludedYears : undefined })}
>
  {heir.isCohabitant && (
    <CohabitRequirementBlock
      heir={heir}
      deathDate={deathDate}
      onUpdate={set}
    />
  )}
</ToggleCard>
```

### 4-3. G6 — 동거주택 토글 description 및 안내 카드

**현행 description** (`HeirComposition.tsx:388`):
```
"피상속인·상속인 10년 이상 동거, 무주택자 요건 등 (§23의2) — 공시가격의 80%, 최대 6억"
```

**Phase 2 변경** (동적화 + G6 안내 추가):

토글 description은 간결하게 유지하고, 하위 CohabitRequirementBlock에 안내 카드 추가:

```tsx
// description (동적 — deathDate, cohabitRateAndCap 호출 또는 간략 안내)
description="피상속인과 상속인이 10년 이상 동거, 무주택자 요건 (§23의2). 공제율·한도는 상속개시일에 따라 달라집니다."
```

**CohabitRequirementBlock 내 G6 안내 카드** (sky tone):
```tsx
<div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 text-xs text-sky-700 space-y-1">
  <p className="font-semibold">주택 판정 기준 (§23의2 — 예규·유권해석)</p>
  <ul className="space-y-0.5 list-disc list-inside">
    <li>겸용주택: 주택면적 > 주택 외 면적인 경우 전체를 주택으로 봄 (재산-89)</li>
    <li>상시주거용 오피스텔: 적용 가능 (법규재산 2013-411)</li>
    <li>조합원입주권·분양권: 원칙 미적용 (단, 1세대1주택 멸실 후 다른 주택 없으면 인정 — 재산-237)</li>
  </ul>
</div>
```

### 4-4. G4 — 부수토지 면적한도 입력 블록 (단독주택 해당 시)

**엔진 시니어 미설계 상태 → 이 섹션은 엔진 시니어 설계 수령 후 상세화**

UI 배치 예시 (Step 4 공제 섹션, 동거주택 공시가격 입력 하단):

```tsx
{/* G4 — 단독주택 대형 토지 해당 시만 노출 */}
{showAncillaryLandLimit && (
  <CohabitAncillaryLandBlock
    form={form}
    deathDate={form.deathDate}
    onChange={(v) => set(v)}
  />
)}
```

**`showAncillaryLandLimit` 노출 조건** (엔진 시니어 확인 필요):
- `isCohabitantHouse` 자산이 단독주택(별도 유형 플래그 필요) AND deathDate >= "2011-01-01" (면적한도 최초 도입)

**엔진에 전달 필요한 필드 (가정 — 엔진 시니어 확인 전)**:
```typescript
// Heir 또는 deductionInput 내
cohabitAncillaryLandArea?: number;    // 부수토지 면적 (㎡)
cohabitBuildingFootprint?: number;    // 건물정착면적 (㎡)
cohabitLandAreaZone?:
  | "urban_metro"       // 도시지역 수도권 주거·상업·공업 (3배)
  | "urban_suburban"    // 수도권 녹지 또는 수도권 밖 도시 (5배)
  | "other";            // 그 밖 (10배)
```

**RadioCardGroup 레이아웃 (지역구분)**:
```tsx
<RadioCardGroup
  name={`cohabit-land-zone-${heir.id}`}
  tone="sky"
  layout="inline"
  value={heir.cohabitLandAreaZone ?? ""}
  onChange={(v) => onUpdate({ cohabitLandAreaZone: v as CohabitLandAreaZone })}
  options={[
    { value: "urban_metro", label: "수도권 주거·상업·공업지역 (3배)" },
    { value: "urban_suburban", label: "수도권 녹지·비수도권 도시 (5배)" },
    { value: "other", label: "그 밖의 지역 (10배)" },
  ]}
/>
```

---

## 5. 사이드바 합계 (⑥)

동거주택공제는 기존과 동일하게 사이드바 합계 미표시(엔진 result 후 결과 카드에서만 확인).

단, Phase 2에서 동거연수 preview(useMemo)가 10년 미만일 경우 사이드바에 rose 경고 배지 추가 여부 → **현재는 미추가(결과 카드 내 표시로 충분)**.

---

## 6. 결과 카드 (⑦) — Phase 2~3 추가 표시

### 6-1. 동거연수 표시 (엔진이 cohabitStartDate 소비 시)

엔진 시니어가 `CohabitDeductionDetail`에 `actualYears?: number` 필드를 추가하면,
`CohabitDeductionDetailCard`에 행 추가:

```tsx
{detail.actualYears !== undefined && (
  <DetailRow
    label="동거기간 (미성년·부득이사유 제외)"
    value={`${detail.actualYears}년`}
  />
)}
{detail.actualYears !== undefined && detail.actualYears < 10 && (
  <DetailRow
    label="※ 요건 미충족 주의 (10년 미만)"
    value=""
    muted
  />
)}
```

**★ 엔진 시니어 확인**: `CohabitDeductionDetail` 에 `actualYears` 추가 여부 + 10년 미만 시 공제를 0으로 처리할지 경고만 할지.

### 6-2. G4 부수토지 면적한도 적용 표시

엔진이 면적한도 초과분을 차감하면 결과 카드에:
```
  │ 부수토지 한도 초과 차감 (도시지역 × 3배 초과분)   − X원  │
```
`CohabitDeductionDetail.ancillaryLandLimitReduction?: number` 필드 추가 (엔진 시니어 결정).

---

## 7. Validation (⑧) — Phase 2 신규 검증

`lib/calc/inheritance-validate.ts` 에 추가:

```typescript
// G3 — cohabitStartDate 입력 경고 (차단 아님)
for (const heir of input.heirs ?? []) {
  if (heir.isCohabitant && !heir.cohabitStartDate) {
    warnings.push({
      field: `heirs[${heir.id}].cohabitStartDate`,
      message: "동거주택 상속공제 요건 확인을 위해 동거시작일 입력을 권장합니다.",
      level: "warning", // 차단 아님
    });
  }
}

// G5 — lineal_descendant 관계 추가 시 HeirRelation enum 갱신 확인
// Zod heirSchema.relation enum에 "lineal_descendant" 추가 필요 → ⑫ 지점

// G4 — 부수토지 면적한도: 3필드 모두 입력 또는 모두 미입력 체크
if (heir.cohabitAncillaryLandArea !== undefined || heir.cohabitBuildingFootprint !== undefined) {
  if (!heir.cohabitAncillaryLandArea || !heir.cohabitBuildingFootprint || !heir.cohabitLandAreaZone) {
    errors.push({
      field: `heirs[${heir.id}].cohabitAncillaryLandArea`,
      message: "부수토지 면적한도 계산 시 3개 필드(부수토지 면적·건물정착면적·지역구분) 모두 입력 필요",
    });
  }
}
```

**정책 준수**: 자동 안분 fallback 금지. `cohabitStartDate` 미입력은 경고(warning)로만 처리. 10년 미만이어도 엔진이 자동 차단하지 않고 사용자 책임으로 넘김.

---

## 8. G8 — 동거주택 상속공제신고서 (별지 서식, Phase 3)

### 8-1. 서식 구성 (법령 조회 필요 — Do 단계 전 KoreanLaw MCP 확인)

**서식명**: 동거주택 상속공제신고서 (상증법 시행규칙 별지 서식 — 번호 미확인, Do 단계 전 KoreanLaw `get_annexes` 호출 필수)

**예상 칸 구성** (계획서 §1-7 기준, 실제 서식 확인 후 동결):

| 행 번호 | 항목 | 데이터 소스 |
|---|---|---|
| ① | 피상속인 성명·주민등록번호 | `input.decedentName` / 신규 필드 필요 |
| ② | 상속인 성명·주민등록번호·주소 | `heir.name` / `heir.residentNumber` |
| ③ | 상속 주택 소재지 | 자산 카드 주소 (EstateItem.address 등) |
| ④ | 동거기간 (시작일~상속개시일) | `heir.cohabitStartDate` ~ `input.deathDate` |
| ⑤ | 미성년 제외 기간 | 계산값 |
| ⑥ | 부득이 사유 차감 기간 | `heir.cohabitExcludedYears` |
| ⑦ | 실 동거기간 | 계산값 |
| ⑧ | 주택 공시가격 | `input.cohabitHouseStdPrice` |
| ⑨ | 담보 채무 | `input.cohabitSecuredDebt` |
| ⑩ | 공제액 계산 | result.deductionDetail.cohabitDeductionDetail |

**★ 실제 서식 번호와 칸 구성은 Do 단계 진입 전 `KoreanLaw.get_annexes("상속세 및 증여세법 시행규칙")` 호출하여 서식 번호·칸 동결 필수. 위 표는 계획 초안 — 구현 시 수정 가능.**

### 8-2. 컴포넌트 구조

```
components/calc/inheritance/
└── cohabit-besshi/                          (신규 디렉터리)
    ├── CohabitHousingBesshiSection.tsx      (오케스트레이터, ~200줄)
    ├── CohabitHousingBesshiTable.tsx        (서식 표 렌더, ~200줄)
    ├── CohabitHousingBesshiPdfDownload.tsx  (PDF 버튼, ~100줄)
    └── cohabit-besshi-constants.ts          (칸 번호·testid 동결, ~50줄)
```

**`besshi-form-replica` 패턴 준수**:
- 각 칸에 `data-testid="cohabit-besshi-row-{행번호}"` 동결 (Do 단계 진입 전 testid 목록 확정)
- Tailwind utility 직접 적용 (shadcn/ui 스타일 미사용 — PDF/print 호환)
- print 자동 펼침: `print:block` CSS
- `BesshiRow` 공용 컴포넌트 재사용 (금액 칸 `text-right font-mono tabular-nums`)

**상속세 결과뷰 연결**:
- `InheritanceTaxResultView.tsx` 에서 `cohabitDeductionDetail`이 있을 때 `CohabitHousingBesshiSection` 조건부 렌더
- `DeductionBesshiFormsSection.tsx`와는 **별도 섹션** (기존 오케스트레이터 수정 최소화)

---

## 9. 14개 동기화 지점 — Phase 2~3 영향 매핑

| # | 지점 | Phase 2 영향 | Phase 3(G4/G8) 영향 |
|---|---|---|---|
| ① 폼 상태 | O — `Heir.cohabitStartDate?` / `Heir.cohabitExcludedYears?` 추가 | O — `cohabitAncillaryLandArea?` 등 G4 필드 |
| ② initial | — (Heir factory 없음, optional 자동) | — |
| ③ normalize | O — `normalize-restored-form-dates.ts` : cohabitStartDate string 보존 확인 | O — G4 필드 |
| ④ API 변환 | O — heirs spread에 자동 포함 (Zod 스키마 추가 필수) | O |
| ⑤ UI 위젯 | **O 주요** — `showCohabitant` 확대 + `CohabitRequirementBlock` 신규 | O — `CohabitAncillaryLandBlock` 신규 |
| ⑥ 사이드바 | — (기존 미표시 유지) | — |
| ⑦ 결과 카드 | O — `actualYears` echo 표시 (엔진 시니어 결정 후) | O — 면적한도 차감 표시 / G8 별지 추가 |
| ⑧ Validation | O — `cohabitStartDate` warning 추가 | O — G4 3필드 완전성 검사 |
| ⑨ Zod enum(메인) | O — `heirSchema.relation` enum에 `"lineal_descendant"` 추가 | O — G4 zone enum |
| ⑩ Zod enum(컴패니언) | — | — |
| ⑪ acqDate fallback | — | — |
| ⑫ Zod 입력 객체 | O — `heirSchema`에 `cohabitStartDate` / `cohabitExcludedYears` | O — G4 필드 |
| ⑬ body spread | — (heirs 전체 cast 방식, 자동 포함) | — |
| ⑭ Route handler 매핑 | — (heirs cast 방식 유지) | O — G4가 deductionInput 하위면 명시 매핑 필요 |

**⑫⑬⑭ 주의**: TS 미감지 침묵 strip 위험. `heirSchema`에 필드 추가 + `inheritance-gift.types.ts`의 `Heir` 타입 확장이 동시에 이루어져야 함.

---

## 10. 800줄 정책 준수 계획

| 파일 | 현재 줄수 | Phase 2 변경 | 예상 줄수 | 대응 |
|---|---|---|---|---|
| `HeirComposition.tsx` | 619줄 | `showCohabitant` +4줄 / `changeHeirRelation` +2줄 / ToggleCard children 연결 ~5줄 | ~630줄 | 안전 (CohabitRequirementBlock 분리로 인라인 최소화) |
| `steps.tsx` | **780줄** | G4 블록 조건부 렌더 ~10줄 | ~790줄 | **주의** — G4 블록은 별도 `CohabitAncillaryLandBlock` 컴포넌트 분리 필수. steps.tsx에 인라인 추가 금지 |
| `CohabitRequirementBlock.tsx` | 신규 | G3 + G6 | ~150줄 | 분리 컴포넌트 |
| `CohabitAncillaryLandBlock.tsx` | 신규 | G4 | ~80줄 | 분리 컴포넌트 |
| `cohabit-besshi/` | 신규 | G8 | 4파일 ~550줄 합계 | 디렉터리 분리 |

---

## 11. 노출 조건 매트릭스 (showCohabitant)

| 관계 | 2009~2013 | 2014~2021 | 2022.1.1.~ |
|---|---|---|---|
| `child` | O | O | O |
| `lineal_descendant` (손자녀) | O | O | O |
| `spouse` (대습 배우자, isSubstituteInheritance=true) | O | X | O |
| `spouse` (일반 배우자) | X | X | X |
| `lineal_ascendant`, `sibling`, `other`, `legatee`, `corporate` | X | X | X |

deathDate 미입력 시 fallback: 최신 연혁(2022~) 기준 적용 (가장 넓은 범위).

---

## 12. E2E 시나리오 (Phase 2~3 추가)

| ID | 시나리오 | 기대 |
|---|---|---|
| E2E-3 | 상속인 관계=손자녀(lineal_descendant) + isCohabitant ON + cohabitStartDate 14년 전 | 동거주택 ToggleCard 노출 + 동거연수 preview 14년 표시 |
| E2E-4 | cohabitStartDate 5년 전 입력 | rose 경고 배지 "예상 동거연수 5년 — 10년 미만" 표시 |
| E2E-5 | deathDate 2022-06-01 + 배우자(spouse) + isSubstituteInheritance=true | 동거주택 토글 노출 |
| E2E-6 | deathDate 2018-06-01 + 배우자(spouse) | 동거주택 토글 미노출 (2022 이전 대습 배우자 미해당) |
| E2E-G8 | 동거주택 공제 적용 계산 후 신고서 섹션 렌더 | `CohabitHousingBesshiSection` 표시 + 서식 칸 값 매핑 확인 |

---

## 13. 엔진 시니어에게 확인 필요한 사항 (Do 진입 전 필수)

| # | 질문 | 영향 |
|---|---|---|
| EN-1 | `Heir.cohabitStartDate` / `Heir.cohabitExcludedYears` 를 엔진 타입에 추가할지 여부 | ① 폼 타입·⑫ Zod·⑭ route 동기화 여부 결정 |
| EN-2 | 동거연수 10년 미만 시 엔진이 공제를 자동 0 처리할지, UI 경고만으로 남길지 | 결과 카드 표시 분기 + validation 로직 결정 |
| EN-3 | `CohabitDeductionDetail` 에 `actualYears?: number` 추가 여부 | ⑦ 결과 카드 표시 |
| EN-4 | G4 부수토지 면적한도 — 필드명 확정 (`cohabitAncillaryLandArea` 등) 및 Heir vs deductionInput 중 어디에 배치할지 | ① ④ ⑫ ⑭ 동기화 |
| EN-5 | G4 `CohabitDeductionDetail.ancillaryLandLimitReduction?: number` 추가 여부 | ⑦ 결과 카드 |
| EN-6 | G5 `lineal_descendant` 을 `InheritanceTaxInput` 엔진 타입 레벨에서 `HeirRelation`에 추가할지 | ① 타입·⑨ Zod enum 동기화 |

---

## 14. 가정 필드명 목록 (엔진 시니어 확인 전 UI 가정값)

본 설계에서 UI가 **가정**한 엔진 측 필드명 — 엔진 시니어가 다른 이름으로 정할 경우 Do 단계에서 교체:

| UI 가정 필드명 | 위치 | 설명 |
|---|---|---|
| `Heir.cohabitStartDate` | `inheritance-gift.types.ts` | 동거시작일 (YYYY-MM-DD) |
| `Heir.cohabitExcludedYears` | 동상 | 부득이 사유 차감 연수 |
| `Heir.cohabitAncillaryLandArea` | 동상 (또는 deductionInput) | 부수토지 면적 (㎡) |
| `Heir.cohabitBuildingFootprint` | 동상 | 건물정착면적 (㎡) |
| `Heir.cohabitLandAreaZone` | 동상 | 지역구분 enum |
| `CohabitDeductionDetail.actualYears` | deduction-detail.types.ts | 엔진 계산 동거연수 |
| `CohabitDeductionDetail.ancillaryLandLimitReduction` | 동상 | 부수토지 한도 초과 차감액 |

---

## 15. 작업 분담 (Phase 2~3)

| 역할 | 담당 | 작업 |
|---|---|---|
| 엔진 시니어 | `inheritance-gift-tax-senior` | EN-1~6 결정 + `Heir` 타입 확장 + `calcCohabitationDeduction` 동거연수 판정 로직 추가 + 부수토지 면적한도 엔진 |
| UI 시니어 | `inheritance-gift-tax-ui-senior` (본 에이전트) | 엔진 타입 확정 수령 후 ① ~ ⑧ + ⑨ ⑫ 동기화 구현 + `CohabitRequirementBlock` + 별지 서식 |
| KoreanLaw 검증 | Do 단계 전 | 별지 서식 번호·칸 구성 + §23의2 연혁 재확인 |

**순서**: 엔진 시니어 EN-1~6 결정 → UI 시니어 ⑤ 위젯 구현 → ①④⑫ 동기화 → ⑦ 결과 카드 → G8 별지 서식 → ⑧ validation → anchor + E2E.

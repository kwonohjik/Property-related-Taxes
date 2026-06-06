# 상속세 「그 밖의 인적공제」(§20) — UI 설계 명세

- **작성일**: 2026-06-05
- **워크트리 / 브랜치**: `personal-deduction-enhancement` / `worktree-personal-deduction-enhancement`
- **계획서 단일 출처**: `docs/00-pm/inheritance-personal-deduction-enhancement.plan.md`
- **범위**: P0 엔진 수정 + P2 결과 표시 (P1 동거가족 UI는 별도 설계서 — `inheritance-cohabitant-dependent.ui.design.md`)
- **UI 코드 수정 대상**: 이 문서는 설계 명세. production 코드 수정은 Do 단계에서 수행.

> **검증 원칙**: 모든 파일:line 인용은 worktree 실독 후 확정. 추정 0.

---

## 1. 변경 개요

### 1.1 신규 필드: `Heir.gender: "male" | "female"`

장애인공제(§20①4호)는 **성별·연령별 기대여명**을 요구한다. 현행 `Heir` 타입에 `gender` 필드가 없어 성별 입력 경로 자체가 존재하지 않는다. 이를 추가한다.

- **노출 조건**: 장애인 토글(`isDisabled === true`) ON 시에만 노출. 비장애인에게는 표시하지 않는다.
- **필수성**: 장애인 ON + `gender` 미입력 → validation 오류로 차단(자동추정 금지 정책).
- **위치**: `HeirComposition.tsx` 장애인 ToggleCard 직후.
- **컴포넌트**: `RadioCardGroup` (tone=violet, layout="inline" — 남/여 2옵션). `<input type="radio">` 신규 작성 금지.

### 1.2 결과 표시 분해 (G7): "인적공제 합계" 단일 줄 → ▼펼침 4종 분해

현행 `DeductionBreakdownSection.tsx:85` "인적공제 합계 (§20)" 단일 줄만 표시. 엔진이 반환하는 4종 공제 상세를 `PersonalDeductionDetail` echo 패턴으로 표시한다.

---

## 2. 성별 입력 위젯 설계 (G3-UI)

### 2.1 배치 위치

```
HeirComposition.tsx 장애인 토글 영역 (현행 :331-340):

{/* 장애인 여부 — 자연인 전용 */}
{!isCorporate && (
  <ToggleCard tone="violet" ... checked={heir.isDisabled} ... />
)}

↓ 장애인 토글 ToggleCard 종료 바로 다음 삽입 ↓

{/* 장애인 성별 입력 — 장애인 ON 시에만 노출 (§20①4호 성별·연령별 기대여명) */}
{!isCorporate && heir.isDisabled === true && (
  <div className="ml-4 mt-1 rounded-lg border border-violet-200 bg-violet-50/40 dark:border-violet-700 dark:bg-violet-900/20 p-3 space-y-1.5">
    <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
      장애인 성별 (§20①4호 — 성별·연령별 기대여명 기준)
    </p>
    <RadioCardGroup
      tone="violet"
      layout="inline"
      value={heir.gender ?? ""}
      onChange={(v) => set({ gender: v as "male" | "female" })}
      options={[
        { value: "male", label: "남성" },
        { value: "female", label: "여성" },
      ]}
    />
    {/* gender 미입력 경고 — validation 오류 전 즉시 안내 */}
    {!heir.gender && (
      <p className="text-[11px] text-violet-600 dark:text-violet-400">
        성별을 선택해야 장애인공제 기대여명을 계산합니다.
      </p>
    )}
  </div>
)}
```

### 2.2 UI 원칙 체크리스트

| 원칙 | 적용 내용 |
|---|---|
| `RadioCardGroup` 필수 | native `<input type="radio">` 신규 금지 — `RadioCardGroup` 사용 |
| 미선택도 tone 배경 유지 | `RadioCardGroup` 컴포넌트가 자동 처리 — 남성/여성 모두 `violet` 배경 항상 유지 |
| OFF 상태에도 tone | 장애인 OFF = `gender` 위젯 자체를 숨김. 보이는 위젯은 항상 tone 유지 |
| `FieldCard` 미사용 이유 | 라디오 옵션 2개는 `RadioCardGroup` 단독으로 충분. 별도 `FieldCard` 래핑 불필요 |
| `SelectOnFocusProvider` | radio는 제외 타입 — 별도 `onFocus` 추가 불필요 |

### 2.3 장애인 OFF → gender 초기화

장애인 토글을 OFF로 변경할 때 `gender` 값을 `undefined`로 초기화한다:

```tsx
onCheckedChange={(v) => set({ isDisabled: v, gender: v ? heir.gender : undefined })}
```

이유: 비장애인 heir에 성별 데이터가 잔류하면 store에 의미없는 값이 남고,
후속 장애인 ON 시 이전 성별이 유지되어 사용자가 인지하지 못한 채 통과될 수 있다.
단, OFF→ON 재활성화 시 성별을 재선택하도록 undefined가 맞다.

---

## 3. 결과 표시 분해 (G7): `PersonalDeductionDetailCard` 설계

### 3.1 신규 타입: `PersonalDeductionDetail`

위치: `lib/tax-engine/types/inheritance-deduction-detail.types.ts` (기존 파일에 추가)

```typescript
/**
 * §20 그 밖의 인적공제 4종 계산 근거 detail.
 * 엔진이 이미 계산한 값을 result에 echo — 신규 계산 없음.
 * Do 단계에서 calcPersonalDeductions() 반환값을 구조화.
 */
export interface PersonalDeductionDetail {
  /** ① 자녀공제 (§20①1호) */
  childCount: number;
  childDeduction: number;   // childCount × 5,000만원

  /** ② 미성년자공제 (§20①2호) */
  minorPerHeir: Array<{
    heirId: string;
    name?: string;          // 표시용 (feedback_no_internal_id_in_result — id 직접 노출 금지)
    age: number;            // 만 나이 (상속개시일 기준)
    remainingYears: number; // 19 − age (§20①2호 기준, §20③ 올림 적용)
    deduction: number;      // remainingYears × 1,000만원
  }>;
  minorDeduction: number;   // perHeir 합계

  /** ③ 연로자공제 (§20①3호) */
  elderCount: number;
  elderDeduction: number;   // elderCount × 5,000만원

  /** ④ 장애인공제 (§20①4호) */
  disabledPerHeir: Array<{
    heirId: string;
    name?: string;          // 표시용 (id 노출 금지)
    gender: "male" | "female" | undefined;
    age: number;            // 만 나이
    lifeExpectancy: number; // 성별·연령별 기대여명 (Math.ceil 올림 적용, §20③)
    deduction: number;      // lifeExpectancy × 1,000만원
  }>;
  disabledDeduction: number; // perHeir 합계

  /** 합계 */
  total: number;
}
```

### 3.2 `InheritanceDeductionResult`에 detail 필드 추가

위치: `lib/tax-engine/types/inheritance-gift.types.ts:954` 인근 (기존 detail 필드 목록 끝에 추가)

```typescript
/** ② §20 인적공제 4종 계산 근거 detail */
personalDeductionDetail?: PersonalDeductionDetail;
```

### 3.3 `PersonalDeductionDetailCard` 컴포넌트 명세

신규 파일: `components/calc/results/deduction-breakdown/PersonalDeductionDetailCard.tsx`

```tsx
"use client";

/**
 * PersonalDeductionDetailCard — ② 인적공제 4종 펼침 (§20)
 * 소비: result.deductionDetail.personalDeductionDetail
 * 패턴: CohabitDeductionDetailCard / LumpSumDetailCard 동일 구조
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { PersonalDeductionDetail } from "@/lib/tax-engine/types/inheritance-deduction-detail.types";
import { DetailTable, DetailRow, SubTotalRow, ExpandButton } from "./shared";

interface Props {
  detail?: PersonalDeductionDetail;
  triggerLabel: string;
  triggerValue: string;
  // [Do 환류] heirs prop 제거 — 엔진이 detail.minorPerHeir[].name·disabledPerHeir[].name를
  //   직접 echo하므로, 카드는 detail.name?.trim() || 관계라벨로 표시 (id 노출 0,
  //   feedback_no_internal_id_in_result 충족). 별도 heirs 매칭 불필요.
}
```

#### 3.4 펼침 표 산식 (한국어 풀어쓰기)

아래는 `open && detail` 시 `DetailTable` 내부 렌더 명세. 변수 약어·`floor()` 금지.

**① 자녀공제** (childCount > 0 시만 표시):
```
DetailRow: "자녀공제 {childCount}명 × 5,000만원" | formatKRW(childDeduction)
```

**② 미성년자공제** (minorPerHeir.length > 0 시만 표시):
```
// 각 heir별 1행
DetailRow (indent): "{이름 또는 '미성년 상속인'} (만 {age}세): (19 − {age})년 × 1,000만원" | formatKRW(deduction)
// 소계
SubTotalRow: "미성년자공제 합계" | formatKRW(minorDeduction)
```

**③ 연로자공제** (elderCount > 0 시만 표시):
```
DetailRow: "연로자공제 {elderCount}명 × 5,000만원 (65세 이상, 배우자·자녀 제외)" | formatKRW(elderDeduction)
```

**④ 장애인공제** (disabledPerHeir.length > 0 시만 표시):
```
// 각 heir별 1행
DetailRow (indent): "{이름}: {gender === 'male' ? '남성' : '여성'} 만{age}세 기대여명 {lifeExpectancy}년 × 1,000만원" | formatKRW(deduction)
// 소계
SubTotalRow: "장애인공제 합계" | formatKRW(disabledDeduction)
```

**합계 (항상 마지막)**:
```
SubTotalRow (tone="blue"): "인적공제 합계 (§20)" | formatKRW(total)
```

**주석 (하단 안내)**:
```
// 1년 미만 올림 기준 안내 (§20③)
<div className="px-3 py-1.5 text-[11px] text-muted-foreground">
  ※ 미성년자·장애인 연수는 1년 미만을 1년으로 올림 적용 (상증법 §20③)
</div>
```

#### 3.5 이름 표시 정책 (feedback_no_internal_id_in_result)

- `heir.name?.trim()` 이 있으면 사용.
- 없으면 `{관계라벨} (미성년)` 또는 `{관계라벨} (장애인)` 형태로 표시.
- `heirId` 자체를 화면에 노출하지 않는다.
- `heirs` prop에서 `id` 매칭으로 name을 resolve.

### 3.6 `DeductionBreakdownSection.tsx` 수정 명세

위치: `components/calc/results/deduction-breakdown/DeductionBreakdownSection.tsx:84-87`

현행:
```tsx
<Row
  label="인적공제 합계 (§20)"
  value={formatKRW(dd.personalDeductionTotal)}
/>
```

변경 후:
```tsx
<PersonalDeductionDetailCard
  detail={dd.personalDeductionDetail}
  triggerLabel="인적공제 합계 (§20)"
  triggerValue={formatKRW(dd.personalDeductionTotal)}
  heirs={heirs}
/>
```

- `PersonalDeductionDetailCard` import 추가.
- `detail` 이 undefined이면 기존 단일 Row처럼 펼침 버튼 없이 표시됨 (`ExpandButton`이 `detail && ...` 조건부 렌더이므로 자동 처리).

### 3.7 동거가족 확장 가능성

P1(동거가족 UI, 별도 설계서)이 구현되면 `minorPerHeir`·`disabledPerHeir`·`elderCount`에 동거가족 항목도 포함된다. `PersonalDeductionDetail` 타입은 이미 heirs 배열이 아닌 결과 배열을 받으므로 구조 변경 없이 확장된다.

---

## 4. 14개 동기화 지점 매핑표 (gender 신규 필드 기준)

| 지점 | 위치 | 파일:line (실측) | 내용 | 위험도 |
|---|---|---|---|---|
| **① 폼 상태 타입** | `Heir` 인터페이스 | `lib/tax-engine/types/inheritance-gift.types.ts:609` 인근 (isDisabled 아래) | `gender?: "male" \| "female"` 추가 | 누락 시 TS 오류 |
| **② initial value** | Heir 생성 초기값 | `HeirComposition.tsx:503` `handleAdd` — `{ id: generateHeirId(), relation }`만 생성 (실측) | gender **optional → 자동 undefined**, 명시 init 불필요 | 낮음 (optional) |
| **③ normalize fallback** | sessionStorage 복원 | `lib/stores/calc-wizard-migration.ts` 또는 heir 생성 normalize | `gender: heir.gender` (optional 통과) | 낮음 — optional이라 자동 통과 |
| **④ API 변환** | `lib/calc/inheritance-api.ts:81` | `:81` `heirs: input.heirs` | **spread 자동 통과** ✅ — gender가 Heir에 있으면 자동 포함 | ✅ |
| **⑤ UI 위젯** | `HeirComposition.tsx:340` 인근 | 장애인 ToggleCard(`:331-340`) 직후 | 성별 `RadioCardGroup` 위젯 | 이 문서 §2 |
| **⑥ 사이드바 합계** | 인적공제 합계 표시 | 사이드바 selector (store) | gender는 표시 금액에 간접 영향(기대여명) — 엔진 결과값 반영으로 자동 | 낮음 |
| **⑦ 결과 카드** | `DeductionBreakdownSection.tsx:85` | `:84-87` Row → PersonalDeductionDetailCard | `PersonalDeductionDetail` 펼침 표시 | 이 문서 §3 |
| **⑧ validation** | `lib/calc/inheritance-validate.ts` | `validateInheritanceTaxInput` 함수 | 장애인 ON + gender 미입력 → 오류 차단 | **고위험** — 미구현 시 UI 통과, 엔진 gender=undefined로 도달 |
| **⑨ Zod enum (메인)** | route handler 스키마 | — | 상속세 route의 최상위 discriminatedUnion — heir 배열 내부 (⑫ 경유) | ⑫에 의존 |
| **⑩ Zod enum (컴패니언)** | — | — | 상속세 companion refine — 해당 없음 | — |
| **⑪ acquisitionDate fallback** | — | — | 해당 없음 | — |
| **⑫ Zod heir 스키마** | `lib/validators/property-valuation-input.ts:460~485` | `:475` `isDisabled: z.boolean().optional()` 아래 | `gender: z.enum(["male","female"]).optional()` 추가 | **최우선 위험** — 누락 시 gender 침묵 strip |
| **⑬ fetch body spread** | `lib/calc/inheritance-api.ts:81` | `:81` `heirs: input.heirs` | spread 자동 ✅ | ✅ |
| **⑭ route handler 엔진 매핑** | `app/api/calc/inheritance/route.ts:81` | `heirs: parsedData.heirs as …` cast | Zod 통과 후 자동 ✅ | ⑫ 통과 후 ✅ |

### 4.1 핵심 위험 지점 상세

#### ⑫ Zod heir 스키마 (`property-valuation-input.ts:475` 인근) — 최우선 위험

현행 `heirSchema`:
```typescript
export const heirSchema = z.object({
  ...
  isDisabled: z.boolean().optional(),  // :475
  isCohabitant: z.boolean().optional(),
  ...
```

**추가 필요**:
```typescript
  isDisabled: z.boolean().optional(),
  /** §20①4호 장애인공제 성별·연령별 기대여명 (feedback_api_zod_schema_sync ⑫) */
  gender: z.enum(["male", "female"]).optional(),  // ← 이 줄 누락 시 침묵 strip
  isCohabitant: z.boolean().optional(),
```

누락 시 영향: `gender: "male"` → JSON fetch body에 포함 → Zod `z.object()` 의 기본 `.strip()` 동작으로 **gender 필드 제거** → route handler에 `gender: undefined` 도달 → 엔진에 성별 없이 기대여명 계산 → 법령 위반 결과.

TypeScript가 감지하지 않는다 (Zod strip은 런타임). `⑫`는 반드시 수동 grep 점검 필요.

#### ⑧ Validation — 장애인 ON + gender 미입력 차단

`lib/calc/inheritance-validate.ts`의 `validateInheritanceTaxInput` 함수에 다음 로직 추가 필요:

```typescript
// ⑧ 장애인 heir의 성별 입력 필수 (§20①4호 성별·연령별 기대여명)
// feedback_no_silent_apportion_fallback: 자동추정 금지, 미입력 = 검증 오류
for (const heir of input.heirs) {
  if (heir.isDisabled === true && !heir.gender) {
    const name = heir.name?.trim() || `상속인 (${heir.relation})`;
    return `${name} — 장애인공제(§20①4호)에 성별 입력이 필요합니다. 장애인 성별을 선택해 주세요.`;
  }
}
```

위치: `heirs.length === 0` 체크 이후, estate 루프 이전.

**⑧ 정책 준수 점검**:
- API에 fallback 없음 (gender는 spread 자동 — 변환 없음) → validate fallback도 없음. 일관.
- UI 통과 조건: gender 선택됨 → validation 통과 → 모순 없음.
- UI 미선택: 경고 문구 즉시 노출 + validation 차단 2중. 일관.

---

## 5. 미성년·연로자 결과 표시 산식 명세

엔진 수정(G1·G2)에 따른 결과 표시 변화.

### 5.1 미성년자공제 산식 변경 (G1: 20세 → 19세)

현행 `personal-deduction-calc.ts:146`:
```typescript
label: `미성년자공제 (만${r.age}세): (20-${r.age}) × 1,000만원`,
```

변경 후 (엔진 Do 단계):
```typescript
label: `미성년자공제 (만${r.age}세): (19-${r.age})년 × 1,000만원`,
```

UI 결과 카드에서는 `PersonalDeductionDetail.minorPerHeir[].remainingYears`를 통해 `(19 − {age})년 × 1,000만원`으로 표시.

### 5.2 연로자공제 라벨 변경 (G2: 배우자·자녀 제외 명시)

`PersonalDeductionDetailCard` 내:
```
"연로자공제 {elderCount}명 × 5,000만원 (65세 이상, 배우자·자녀 제외)"
```

"배우자·자녀 제외" 라벨 추가로 사용자가 §20①3호 후단 중복배제를 검증 가능.

### 5.3 장애인공제 성별·기대여명 산식

현행: `장애인공제: 기대여명 ${r.lifeExpectancy}년 × 1,000만원`
변경 후 (엔진 Do 단계 PersonalDeductionDetail 구조화 후): 각 heir별 성별·기대여명 표시.

---

## 6. 단계별 흐름 (Do 단계 참고)

```
[엔진 Do 단계]
① Heir 타입 gender 추가 (types/inheritance-gift.types.ts)
② LIFE_EXPECTANCY_TABLE 남/여 분리 (data/life-expectancy-2023.ts 별도 파일)
③ getLifeExpectancyByGender(gender, age) 신규 함수
④ calcDisabledDeduction — heir.gender 사용
⑤ calcMinorDeduction — 20→19 수정
⑥ calcElderDeduction — spouse·child 배제 필터 추가
⑦ PersonalDeductionDetail 타입 신규 (inheritance-deduction-detail.types.ts)
⑧ InheritanceDeductionResult에 personalDeductionDetail? 추가
⑨ calcPersonalDeductions 반환에 personalDeductionDetail 조립

[UI Do 단계 (엔진 완료 후 시퀀셜)]
⑤ HeirComposition.tsx — gender RadioCardGroup 추가 (§2)
⑥ 사이드바 — 자동 반영 (변경 없음)
⑦ PersonalDeductionDetailCard.tsx 신규 (§3.3)
   DeductionBreakdownSection.tsx Row→PersonalDeductionDetailCard 교체 (§3.6)
⑧ inheritance-validate.ts — 장애인+gender 미입력 차단 (§4.1)
⑫ heirSchema — gender z.enum 추가 (§4.1)
```

---

## 7. Validation 정책 요약

| 케이스 | UI 동작 | validate 동작 | 일관성 |
|---|---|---|---|
| 장애인 OFF | gender 위젯 숨김 | gender 검증 미실행 | ✅ |
| 장애인 ON + gender 선택 | 위젯 정상 | 통과 | ✅ |
| 장애인 ON + gender 미선택 | 즉시 경고 문구 노출 | "성별 입력 필요" 오류 반환 | ✅ |
| 비장애인 heir | gender undefined | 검증 미실행 | ✅ |

---

## 8. 공용 컴포넌트 준수 선언

| 규칙 | 이 설계의 적용 |
|---|---|
| `DateInput` | 해당 없음 (날짜 신규 없음) |
| `CurrencyInput` + `parseAmount` | 결과 표시에 `formatKRW()` 사용 |
| `DecimalInput` | 해당 없음 |
| `FieldCard` | 성별 위젯은 `RadioCardGroup` 단독 (2-option 단순 선택) |
| `ToggleCard` | 장애인 토글 기존 유지. 성별은 RadioCardGroup |
| `RadioCardGroup` | 성별 입력에 사용. `layout="inline"`, `tone="violet"` |
| native radio 금지 | RadioCardGroup만 사용 |
| OFF도 tone 배경 유지 | RadioCardGroup 컴포넌트 자동 처리 |
| 포커스 시 전체 선택 | `SelectOnFocusProvider` 전역 적용 — radio는 제외 타입, 추가 불필요 |
| 800줄 정책 | `PersonalDeductionDetailCard` 신규 파일. `DeductionBreakdownSection` 줄 수 확인 필요 (현재 198줄 — 여유) |
| 결과 산식 한국어 풀어쓰기 | §3.4 상세 명세 준수 |
| 금액 칸 `text-right font-mono tabular-nums` | `DetailRow` / `SubTotalRow` 컴포넌트가 `font-mono` 자동 적용 |

---

## 9. 테스트 시나리오 (Do 단계 anchor 전제)

| # | 시나리오 | UI 입력 | 결과 검증 포인트 |
|---|---|---|---|
| C1 | 미성년 자녀 만11세 (2014-01-01) | child, birthDate, 장애X | 미성년 공제 (19−11)×1천만=8천만 표시 |
| C3 | 65세 자녀 | child, 1959년생, 장애X | 연로자 공제 0, 자녀 공제 5천만만 표시 |
| C4 | 65세 배우자 | spouse, 1959년생, 장애X | 연로자·미성년 위젯 미노출 (배우자는 §20① 적용 외) |
| C6 | 장애 남성 자녀 40세 | child, 1985년생, 장애ON, 성별=남 | 기대여명 42년 표시, 공제 4.2억 |
| C7 | 장애 여성 자녀 40세 | child, 1985년생, 장애ON, 성별=여 | 기대여명 48년 표시, 공제 4.8억 |
| V1 | 장애 ON + 성별 미선택 | child, 장애ON, 성별 미선택 | validation 오류 "성별 입력 필요" |
| V2 | 장애 OFF | child, 장애OFF | 성별 위젯 미노출, validation 통과 |

---

## 10. P1 동거가족 UI 연동 계획 (별도 설계서 예고)

P1 별도 설계서(`inheritance-cohabitant-dependent.ui.design.md`)에서 다룰 내용:
- 동거가족 입력 방식 선택 (옵션 A: `isHeir=false` Heir vs 옵션 B: 별도 배열)
- 동거가족 미성년/연로자/장애인 해당 시 `PersonalDeductionDetail.minorPerHeir`·`elderCount`·`disabledPerHeir`에 자동 포함 (타입 구조 변경 없음 — 엔진 반환값 포함으로 자동)
- `HeirComposition.tsx` 동거가족 입력 섹션 신규

---

## 11. Do 단계 완료 조건 자가 점검 (참조용)

- [ ] `Heir.gender` 타입 추가 (①)
- [ ] `INITIAL_HEIR` gender: undefined (②)
- [ ] normalize optional 통과 확인 (③)
- [ ] API spread 자동 (④) — 변경 없음
- [ ] 성별 RadioCardGroup 위젯 (⑤)
- [ ] 사이드바 자동 반영 확인 (⑥)
- [ ] `PersonalDeductionDetailCard` 신규 + `DeductionBreakdownSection` Row 교체 (⑦)
- [ ] `inheritance-validate.ts` 장애+gender 차단 (⑧)
- [ ] ⑫ `heirSchema` gender `z.enum` 추가 (⑫) — grep 점검 필수
- [ ] ⑬⑭ route 자동 ✅ 확인
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/inheritance-deductions.test.ts` 통과
- [ ] E2E spec 통과 (`E2E_PORT=3100`)
- [ ] 브라우저 수동 확인 또는 미수행 명시

# 상속세 동거가족 인적공제 (§20 P1) — UI 설계

- **작성일**: 2026-06-05
- **단일 출처**: 엔진 설계서 `inheritance-cohabitant-dependent.engine.design.md` + 계획서 §5
- **범위**: 동거가족 입력 위젯 + 결과 구분 표시 + validation + 14지점 UI 축(①②③⑤⑥⑦⑧)
- **재사용**: `HeirComposition.tsx` 입력 패턴(DateInput·RadioCardGroup·gender·isDisabled) — 신규 위젯 최소화

---

## 1. 사용자 시나리오

1. 사용자가 Step 0(상속인 구성)에서 상속인을 입력한다.
2. 상속인 카드 **하단**에 "동거가족(부양가족)" 별도 카드가 있다. 기본은 **접힘(미입력=3-state OFF)**.
3. "+ 동거가족 추가"를 누르면 관계(직계비속/직계존속/형제자매)·생년월일·장애·성별 입력 행이 추가된다.
4. 미성년·연로자·장애 동거가족이 인적공제에 반영된다(자녀공제 제외). legatee/corporate는 인적공제에서 제외된다.
5. 결과 화면 "그 밖의 인적공제 (§20)" 펼침에 동거가족 행이 **(동거가족)** 배지로 구분 표시된다.

---

## 2. 입력 위치 결정

| 후보 | 장점 | 단점 | 판정 |
|---|---|---|---|
| **Step 0 HeirComposition 하단 별도 카드** | 입력 성격이 "인물+생년월일+장애+성별"로 상속인과 동일 → 위젯 재사용·인접 자연스러움 | §20 공제와 시각적 거리 | **채택** |
| Step 4 공제 섹션 | §20 공제와 인접 | 인물 카드 패턴이 공제(금액) 섹션과 이질적, deathDate 의존 | 미채택 |

> **채택: Step 0 하단**. 근거: 동거가족은 상속인과 동일한 인적 입력 구조 → `HeirComposition` 위젯·`changeHeirRelation` 패턴 차용. `deathDate`(나이 기준)는 Step 0에서 이미 입력됨.

---

## 3. 위젯 ASCII

```
┌─ 👨‍👩‍👧 동거가족 (인적공제 대상 부양가족) ─────── §20·시령§18① ─┐
│ ℹ️ 상속인이 아니지만 피상속인이 상속개시일 현재 사실상 부양한       │
│    직계존비속(배우자의 직계존속 포함)·형제자매. 미성년·연로자·       │
│    장애인공제 대상 (자녀공제는 제외). 수유자·영리법인은 대상 아님.   │
│                                                                  │
│  ── 동거가족 미입력 (카드 접힘, 3-state OFF) ──                    │
│                                  [ + 동거가족 추가 ]              │
└──────────────────────────────────────────────────────────────────┘

  ▼ 추가 후 (cohabitantDependents = [...])

┌─ 👨‍👩‍👧 동거가족 (인적공제 대상 부양가족) ─────── §20·시령§18① ─┐
│  [1] 관계  ◉ 직계비속(손자녀)  ○ 직계존속(부모·조부모·장인·장모)   │
│           ○ 형제자매                                  [🗑 삭제]   │
│      성명(선택) [____________]                                    │
│      생년월일   [2017-03-04]   (만 5세 — 미성년·연로 판별용)       │
│      ☑ 장애인 →  성별  ◉ 남  ○ 여   ⚠️ 장애 시 필수(§20①4호)      │
│                                                                  │
│                                  [ + 동거가족 추가 ]              │
└──────────────────────────────────────────────────────────────────┘
```

- **관계 RadioCardGroup** (`name` 필수 — TS2741 [[project_inheritance_personal_deduction_20]]):
  - `lineal_descendant` "직계비속(손자녀)"
  - `lineal_ascendant` "직계존속(부모·조부모·장인·장모)"
  - `sibling` "형제자매"
  - (시령 §18① 열거 외 처남·처제·시동생은 옵션 부재 — 입력 차단)
- **생년월일**: `DateInput` (type="date" 금지 [[feedback_date_input]]).
- **장애인**: `ToggleCard`/체크 → ON 시 **성별 RadioCardGroup** 노출(남/여). 미선택도 tone 유지 [[feedback_toggle_card_visibility]].
- **삭제**: rose-600 [[feedback_dialog_data_discard_confirm]] (행 단위 삭제는 즉시, 전체 비우면 카드 접힘).

---

## 4. FormData·동기화 (UI 축 ①②③⑤⑥⑦⑧)

### ① 폼 상태 — `inheritance/shared.ts`

```typescript
// InheritanceWizardForm
cohabitantDependents?: CohabitantDependent[];   // 3-state: undefined(OFF) / [](ON 빈) / [...](ON 데이터)
```

> **3-state** [[feedback_three_state_optional_mode_toggle]]: "추가" 첫 클릭 시 `[]`→`[{신규}]`. length>0 derive 금지.

### ② initial / ③ normalize

```typescript
// factory
cohabitantDependents: undefined,
// normalize: optional 그대로 (배열이면 각 항목 id 보존)
```

### ④ API 변환 — `InheritanceTaxForm.tsx:348`

```typescript
const deductionInput: InheritanceDeductionInput = {
  ...,
  cohabitantDependents: form.cohabitantDependents,   // 신규 — inheritance-api.ts:82 spread 자동
};
```

### ⑤ UI 위젯 (U-4)

신규 `CohabitantDependentSection.tsx` — Step 0(`steps.tsx`)의 `<HeirComposition>` 렌더 **하단**에 배치(HeirComposition은 **단일 heir** 컴포넌트라 배열 관리 불가 → 외부 별도 섹션). 배열 단위 추가/삭제. `onChange(next: CohabitantDependent[]) → set({ cohabitantDependents: next })`.

내부 행 위젯은 HeirComposition 패턴 재사용(실측):
- 관계: `RadioCardGroup name={`cohabitant-relation-${d.id}`}` (3옵션)
- 생년월일: `DateInput`
- 장애: `ToggleCard tone="violet"` (L334 패턴) → `onCheckedChange={(v)=>update({isDisabled:v, gender:v?d.gender:undefined})}` (OFF 시 gender clear)
- 성별: 장애 ON 시 `RadioCardGroup name={`cohabitant-gender-${d.id}`}` (U-5 — heir `gender-${id}`와 충돌 방지)

### ⑥ 사이드바 합계 (U-3)

인적공제 합계에 동거가족 포함 — `computeInheritanceSummary`(실측 존재 `lib/stores/inheritance-summary.ts:121`) result 도착 후 엔진 `personalDeduction.total` 사용(동거가족 이미 합산됨). 입력 추정 단계에서는 동거가족 미반영(엔진 계산 후 정확값).

### ⑦ 결과 카드 — `PersonalDeductionDetailCard`

```
그 밖의 인적공제 (§20)                                   10.8억
 ├ 자녀공제 0명                                              0
 ├ 미성년자공제
 │   김일 (만5세) (19−5)×1천만        [동거가족]          1.4억
 │   김이 (만1세) (19−1)×1천만        [동거가족]          1.8억
 └ 장애인공제
     김일 (남 만5세) 기대여명 76년×1천만 [동거가족]        7.6억
```

- `minorPerHeir`/`disabledPerHeir`의 `isCohabitant === true` 행에 **`[동거가족]` 배지**(sky/violet tone).
- 이름 (U-1·U-2): `PersonalDeductionDetailCard`는 `detail.{minor,disabled}PerHeir[].name`을 **직접 echo**(실측 L55·L79 — heirId→이름 매칭 안 함) → 동거가족 `name`이 detail에 echo되면 자동 표시. name 없을 때 fallback을 `isCohabitant` 분기: 상속인 "미성년/장애인 상속인" / 동거가족 **"동거가족"** [[feedback_no_internal_id_in_result]] (heirId 노출 없음). L55·L79 라벨 수정 대상.

### ⑧ validation — `inheritance-validate.ts`

```typescript
// 기존 상속인 장애 검증(308~312)과 동일 패턴을 동거가족에도
for (const d of input.cohabitantDependents ?? []) {
  if (d.isDisabled === true && !d.gender)
    return `${d.name?.trim() || "동거가족"}의 성별을 입력하세요. (장애인공제 §20①4호)`;
}
```

- `relation`은 타입상 필수(RadioCardGroup 기본 선택 보장).
- `birthDate` 미입력 → 해당 공제 0(상속인과 동일 정책, 차단 아님). 장애 시 gender만 필수(상속인 정책 추종 — birthDate 필수화 불일치 회피).
- UI 통과 ↔ validate 동기화 [[feedback_validation_sync_8th_point]]: 장애 ON+gender 미선택을 UI에서 막고 validate에서도 차단(이중).

---

## 5. 결과/사이드바 정책

- 동거가족만 있고 상속인 인적공제 0이어도 §20 합계에 표시.
- "원" 단위 표기 금지 [[feedback_no_won_suffix]]. 금액 칸 우측정렬·tabular-nums (amount-column-align).
- 산식 한국어 풀어쓰기 [[feedback_result_view_korean_formula]] — `(19−5)×1,000만원`, `기대여명 76년×1,000만원`.

---

## 6. 적용 정책 메모

- [[mirror-pattern]] — cohabitantDependents fallback은 display prop + API/validate 3중, useEffect 미러링 금지.
- [[feedback_three_state_optional_mode_toggle]] — undefined/[]/[...] 3-state.
- [[feedback_no_internal_id_in_result]] — 결과 id 노출 금지, name||라벨.
- [[feedback_select_on_focus]] — 성명 입력 onFocus 전체선택.
- [[project_inheritance_personal_deduction_20]] — RadioCardGroup `name` 필수.

---

## 7. STEP 6 실측 해소 결과 (R2-1)

- `PersonalDeductionDetailCard` 이름 표시 = `detail.{minor,disabled}PerHeir[].name` **직접 echo**(L55·L79, heirId 매칭 없음) → 동거가족 name 자동 표시, fallback만 isCohabitant 분기. **구현(R2-2)**: L55 `${r.name?.trim() || (r.isCohabitant ? "동거가족" : "미성년 상속인")}` + `[동거가족]` 배지 span / L79 동일(장애인). ✅ 해소
- `computeInheritanceSummary` 존재 `lib/stores/inheritance-summary.ts:121` — 인적공제 합계 result echo. ✅ 해소
- HeirComposition gender 위젯 = `ToggleCard tone="violet"`(L334) + `RadioCardGroup name=gender-${id}`(L349) — 동거가족 카드에 동일 패턴 재사용. ✅ 해소

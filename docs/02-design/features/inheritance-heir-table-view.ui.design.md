# UI Design — 상속인·수유자 구성 테이블 뷰 개편

> 작성일: 2026-06-10  
> 갱신: 2026-06-10 — 인라인 편집 카드 → Dialog 모달 전환 (사용자 확정: "행 클릭 → 모달, 라디오 제거")  
> 연계: `inheritance-heir-table-view.plan.md`  
> 구현 대상: `components/calc/HeirComposition.tsx` 리팩터 + `HeirTableView.tsx` 신설  
> 참조 파일 (실측):
> - `components/calc/HeirComposition.tsx` (722줄 전체)
> - `components/calc/inheritance/steps.tsx:138-164` (Step0 섹션②)
> - `components/calc/inheritance/shared.ts:44` (`heirs: Heir[]`)
> - `lib/tax-engine/inheritance-gift-common.ts:38-42` (`isForProfitCorporate`)
> - `lib/tax-engine/types/inheritance-gift.types.ts:666-749` (HeirRelation·Heir 인터페이스)
> - `components/calc/inheritance/heir-relation-meta.ts` (HEIR_RELATION_LABELS)

---

## 1. 전체 뷰 구조

```
[섹션 ② violet 카드] 상속인·수유자 구성
  ┌─────────────────────────────────────────────────────────┐
  │ [HeirTableView] 요약 테이블  (행 클릭 → 모달 오픈)     │
  │   종류    | 관계   | 이름   | 생년월일·성별 | 특이사항 | ✎│
  │   상속인  | 배우자 | 홍길동 | 1975-03-01·여 | 동거주택 | ✎│
  │   상속인  | 자녀   | 홍길순 | 2010-07-15·여 | 미성년   | ✎│
  │   수유자  | —      | 홍길복 | 미입력        |          | ✎│
  ├─────────────────────────────────────────────────────────┤
  │ [+ 상속인 추가] 버튼                                    │
  └─────────────────────────────────────────────────────────┘

  ↓ 행 클릭 또는 추가 직후 자동 오픈 ↓

  ┌──────────────── [Dialog 모달] ──────────────────────────┐
  │ 헤더: "상속인 편집"                                      │
  ├─────────────────────────────────────────────────────────┤
  │ max-h-[80vh] overflow-y-auto                            │
  │ [HeirEditor] — 실시간 onUpdate 반영                     │
  │   (이름·주민번호·생년월일·세대생략·대습·장애인·동거 등)  │
  ├─────────────────────────────────────────────────────────┤
  │                                          [닫기 버튼]     │
  └─────────────────────────────────────────────────────────┘
```

**라디오 컬럼 제거 (사용자 확정)**: 첫 컬럼 라디오를 제거하고 행 전체 클릭으로 모달을 오픈한다. 맨 우측에 `✎` 편집 아이콘 힌트만 표시. 행 하이라이트(selected)는 모달이 열린 동안 유지.

**정정 #11 (사용자 확정 — 제거)**: 상단 요약 칩(`HeirSummary`)은 **제거**한다. 기존 `HeirSummary`는 `HEIR_RELATIONS` 5종만 카운트해 수유자·법인이 누락되며, 테이블이 전체 구성을 종류·관계까지 한눈에 보여주므로 칩이 중복이다. `HeirSummary` 함수(`:604-625`)·호출부(`:677`)를 삭제한다.

---

## 2. 컴포넌트 분해

### 2.1 상태 위치

`HeirComposition` 로컬 상태 2개 추가 (기존 `showAddPanel` 유지).

```typescript
// HeirComposition.tsx 내부
const [selectedHeirId, setSelectedHeirId] = useState<string | null>(null);
const [showAddPanel, setShowAddPanel] = useState(false);          // 기존
const [addStep, setAddStep] = useState<"kind" | "relation" | null>(null);  // 2단계 picker
const [pendingKind, setPendingKind] = useState<HeirKind | null>(null);     // 종류 선택 임시값
```

`selectedHeirId`는 `HeirComposition`이 소유하고 `HeirTableView`·`HeirEditor` 양쪽에 prop으로 전달한다. Zustand store에 넣지 않는다(UI 전용 ephemeral 상태).

### 2.2 신설 컴포넌트 — `HeirTableView`

파일: `components/calc/HeirTableView.tsx`

```typescript
interface HeirTableViewProps {
  heirs: Heir[];
  selectedHeirId: string | null;
  onSelect: (id: string) => void;
  deathDate?: string;
}
```

내부에서 `isForProfitCorporate` (`lib/tax-engine/inheritance-gift-common.ts:38`)를 import해 종류 파생.  
`deriveHeirKind(heir): HeirKind` 순수 함수를 파일 내부에 정의한다.

### 2.3 기존 컴포넌트 재사용

| 기존 컴포넌트 | 변경 여부 | 비고 |
|---|---|---|
| `HeirEditor` (line 138-519) | 재사용 (무변경) | selectedHeirId로 선택된 Heir만 표시 |
| `RelationPickerGrid` (line 562-598) | 재사용 (**편집 카드 "관계 변경" 전용**) | **정정 #2**: 추가 흐름에는 사용 금지(SPECIAL_RELATIONS 포함). 추가 상속인 관계 단계는 `PersonRelationPicker`(신규 4종) |
| `RelationButton` (line 531-555) | 재사용 | `PersonRelationPicker`·`RelationPickerGrid` 양쪽에서 재사용 |
| `HeirSummary` (line 604-625) | **삭제 (정정 #6 — 사용자 확정)** | 함수(`:604-625`)·호출부(`:677`) 삭제. 테이블이 전체 구성 대체 |
| `changeHeirRelation` (line 67-122) | 재사용 (무변경) | 편집 카드 내부 "관계 변경" 용도 |
| `SubstituteHeirPanel` (별도 파일) | **import 경로 변경 (정정 #3·#4)** | `generateSubstituteGroupId`를 공용 헬퍼로 이동 → 내부 함수 1개 import로 교체. "무변경" 아님 |

---

## 3. 종류·관계 파생 헬퍼 설계

### 3.1 `HeirKind`(테이블 표시) vs `AddKind`(추가 picker) — 2개 타입 구분

**중요(정정 #5)**: 테이블 "종류 컬럼 표시"용 6값과 추가 picker "종류 선택"용 5값은 **다른 타입**이다. 혼동 금지.

```typescript
// HeirTableView.tsx 내부 — 테이블 종류 컬럼 표시 (6값, 영리/비영리 분리)
type HeirKind =
  | "heir"           // 상속인 (법정상속인)
  | "legatee"        // 수유자
  | "substitute"     // 대습상속인
  | "for_profit_corp"    // 영리법인
  | "non_profit_corp"    // 비영리법인
  | "other";         // 기타

// HeirComposition.tsx 내부 — 추가 picker 1단계 종류 선택 (5값, 법인 통합)
// 영리/비영리는 추가 후 편집 카드 토글로 분기(사용자 확정 — 법인 통합 5종)
type AddKind =
  | "heir"        // → 2단계 관계 선택(4종)으로
  | "legatee"     // → relation="legatee" 즉시 추가
  | "substitute"  // → relation="other" + subst- 그룹 즉시 발급
  | "corporate"   // → relation="corporate" 즉시 추가(isForProfit 미설정=영리 기본)
  | "other";      // → relation="other" 즉시 추가
```

### 3.2 `deriveHeirKind` 순수 함수

```typescript
// HeirTableView.tsx 내부 — single-source-engine-helper 정책
// isForProfitCorporate 는 lib/tax-engine/inheritance-gift-common.ts:38 import
import { isForProfitCorporate } from "@/lib/tax-engine/inheritance-gift-common";

function deriveHeirKind(heir: Heir): HeirKind {
  if (heir.relation === "legatee") return "legatee";
  if (heir.relation === "corporate") {
    return isForProfitCorporate(heir) ? "for_profit_corp" : "non_profit_corp";
  }
  if (heir.substituteGroupId !== undefined) return "substitute";  // other + 대습
  if (heir.relation === "other") return "other";
  // spouse | child | lineal_ascendant | sibling
  return "heir";
}
```

**주의**: `isSubstituteInheritance`(legatee §27 단서)는 종류 판정에 사용하지 않는다. 대습상속인은 `substituteGroupId` 존재 여부만으로 판정한다(실측: `types:732` 필드 정의 확인).

### 3.3 종류 라벨 매핑 (정적 Record — `feedback_tailwind_static_tone_mapping` 준수)

```typescript
const HEIR_KIND_LABELS: Record<HeirKind, string> = {
  heir: "상속인",
  legatee: "수유자",
  substitute: "대습상속인",
  for_profit_corp: "영리법인",
  non_profit_corp: "비영리법인",
  other: "기타",
};
```

### 3.4 관계 컬럼 표시 로직

```typescript
function deriveRelationDisplay(heir: Heir): string {
  const kind = deriveHeirKind(heir);
  switch (kind) {
    case "heir":
      return HEIR_RELATION_LABELS[heir.relation]; // 배우자·자녀·직계존속·형제자매
    case "legatee":
      // 세대생략 수유자면 "손자녀(세대생략)", 아니면 "—"
      return heir.isGenerationSkipBeneficiary ? "손자녀 (세대생략)" : "—";
    case "substitute": {
      // 피대습자 기준 표시 — substituteForRelation 활용
      const baseLabel =
        heir.substituteForRelation === "child" ? "자녀 대습"
        : heir.substituteForRelation === "sibling" ? "형제자매 대습"
        : "대습";
      // substituteAncestorName 있으면 "故 {name} 갈음" 추가
      return heir.substituteAncestorName
        ? `${baseLabel} (故 ${heir.substituteAncestorName})`
        : baseLabel;
    }
    case "for_profit_corp":
    case "non_profit_corp":
      return "법인";
    case "other":
    default:
      return "—";
  }
}
```

---

## 4. 테이블 컬럼 스펙

| 컬럼 | 내용 | 너비 | 비고 |
|---|---|---|---|
| 라디오 | `<input type="radio">` — `role="radio"` aria | 36px | 라디오 그룹명 `heir-selector` |
| 종류 | `HEIR_KIND_LABELS[deriveHeirKind(heir)]` | 80px | text-xs |
| 관계 | `deriveRelationDisplay(heir)` | 120px | text-xs |
| 이름 | `heir.name?.trim() \|\| CATEGORY_FALLBACK_LABEL[heir.relation]` | 100px | heir-id 노출 금지 |
| 생년월일·성별 | 주민번호 파싱값 우선, 없으면 `heir.birthDate` fallback, 없으면 "미입력" | 140px | parsedRrn 재사용. **정정 #19**: 주민번호 미입력 자연인(법인 제외) 행은 "미입력"을 amber 경고 톤으로 표시 — `inheritance-validate.ts:344` 차단 사유를 테이블에서 즉시 식별 |
| 특이사항 | 배지 목록 (§4 참고) | — | flex wrap |

### CATEGORY_FALLBACK_LABEL (이름 미입력 fallback)

```typescript
const CATEGORY_FALLBACK_LABEL: Record<HeirRelation, string> = {
  spouse: "(배우자)",
  child: "(자녀)",
  lineal_ascendant: "(직계존속)",
  sibling: "(형제자매)",
  other: "(기타)",
  legatee: "(수유자)",
  corporate: "(법인)",
};
```

**heir-id 노출 금지** (`feedback_no_internal_id_in_result` 정책): `heir-${...}` 형태 id 표시 금지.

---

## 5. 배지 매핑

테이블의 "특이사항" 컬럼에 표시하는 배지 목록. 해당하는 것만 렌더.

| 배지 텍스트 | 조건 | tone 색 |
|---|---|---|
| 장애인 | `heir.isDisabled === true` | violet |
| 동거주택 | `heir.isCohabitant === true` | violet |
| 세대생략 | `heir.isGenerationSkipBeneficiary === true` | rose |
| 대습 §1001 | `heir.substituteGroupId !== undefined` | amber |
| 영리법인 | `deriveHeirKind(heir) === "for_profit_corp"` | sky |
| 비영리법인 | `deriveHeirKind(heir) === "non_profit_corp"` | sky |
| 미성년 | **(정정 #1)** `heir.birthDate && deathDate && differenceInYears(new Date(deathDate), new Date(heir.birthDate)) < 19` — 상속개시일 기준. `deathDate`·`birthDate` 미입력 시 배지 미표시 | rose |

**정정 #1**: `isMinorFromRrn` 헬퍼는 **존재하지 않는다**(grep 0건). `parseResidentNumber`(`lib/calc/resident-number.ts:62`)는 `birthDate`·`gender`만 반환하며 미성년 여부를 판정하지 않는다. 미성년은 **상속개시일(`deathDate`) 기준** 만 19세 미만(민법 §4)으로, `HeirComposition.tsx:183-193`의 `autoIsMinor`(`differenceInYears(death, birth) < 19`)와 동일 산식을 재사용한다. 이를 위해 `HeirTableView`/`HeirTableRow`는 `deathDate` prop을 받는다(§8.1).

**정정 #10**: `legatee` + `isSubstituteInheritance`(§27 손자 대습, `HeirComposition.tsx:333-341`)는 `substituteGroupId`가 없어 "대습 §1001" 배지가 표시되지 않는다. 이는 **의도된 동작** — 해당 행은 종류 컬럼에 "수유자"로 분류되며, 대습 배지(`substituteGroupId` 기준)는 `relation="other"` 실제 상속인 대습에만 부여한다.

배지 컴포넌트: `<span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-{tone}-100 text-{tone}-700">` — Tailwind 동적 클래스 금지, Record 정적 매핑 사용(`feedback_tailwind_static_tone_mapping`).

---

## 6. 상태 흐름도

### 6.1 추가 흐름 (2단계 picker)

```
[+ 상속인 추가] 클릭
    → addStep = "kind", showAddPanel = true
    → [종류 선택 UI 표시]
        ├─ 상속인 선택 → addStep = "relation", pendingKind = "heir"
        │   → [관계 선택 UI] (정정 #2: HEIR_PERSON_RELATIONS 4종 전용 그리드
        │       = spouse·child·lineal_ascendant·sibling. RelationPickerGrid 재사용 금지)
        │       → 관계 선택 → handleAdd(relation) → 신규 Heir 생성
        │                    → selectedHeirId = newHeir.id (자동 선택)
        │                    → addStep = null, showAddPanel = false
        ├─ 수유자 선택 → handleAdd("legatee") → 자동 선택
        ├─ 법인 선택  → handleAdd("corporate") → 자동 선택 (isForProfit 미설정=영리 기본)
        ├─ 대습상속인 선택 → handleAddSubstitute()
        │   (정정 #3·#4: relation="other" + substituteGroupId = generateSubstituteGroupId()
        │    [subst- 컨벤션 공용 헬퍼] 즉시 발급 → 테이블 즉시 "대습상속인" 표시 +
        │    편집 카드 SubstituteHeirPanel 토글 자동 ON. 2단계 관계 선택 없음 —
        │    피대습자 순위·역할은 편집 카드 SubstituteHeirPanel에서 입력)
        └─ 기타 선택 → handleAdd("other")

[취소] → addStep = null, showAddPanel = false
```

**정정 #2 — `HEIR_PERSON_RELATIONS` 4종 신설 필요**: 기존 `HEIR_RELATIONS`(`heir-relation-meta.ts:31-37`)는 **`other`를 포함한 5종**이고, `RelationPickerGrid`(`HeirComposition.tsx:562-598`)는 `HEIR_RELATIONS` + `SPECIAL_RELATIONS`(legatee·corporate)를 **모두** 렌더한다. 따라서 "상속인" 종류 선택 후 관계 단계에서 이를 그대로 쓰면 수유자·법인·기타 버튼이 다시 노출되어 2단계 분리가 무의미해진다. 상속인 관계 단계 전용으로 `HEIR_PERSON_RELATIONS = ["spouse","child","lineal_ascendant","sibling"]` 4종 상수를 `heir-relation-meta.ts`에 추가하고 신규 4종 그리드를 렌더한다.

**정정 #3·#4 — 대습 그룹 id 공용 헬퍼**: `substituteGroupId` 발급은 `generateHeirId()`(=`heir-` 형식)가 아니라 `subst-` 컨벤션을 따라야 한다(`SubstituteHeirPanel.tsx:17-19` `generateSubstituteGroupId`). 추가 흐름에서 즉시 발급하려면 이 함수를 공용 헬퍼(`heir-relation-meta.ts` 또는 신규 `lib/calc/substitute-group-id.ts`)로 이동하고 `SubstituteHeirPanel`·`HeirComposition` 양쪽이 import한다. → **`SubstituteHeirPanel` "무변경"이 아니라 "import 경로 변경"으로 §2.3·§비범위 정정**(single-source-engine-helper).

**종류 선택 UI 항목** (addStep === "kind"):

```
┌────────────┬────────────┬────────────┐
│  상속인    │  수유자    │  대습상속인 │
│ (관계 추가) │ (legatee)  │ (other+그룹) │
├────────────┬────────────┬────────────┤
│  영리법인  │  기타      │            │
│ (corporate) │  (other)  │            │
└────────────┴────────────┴────────────┘
```

비영리법인은 "영리법인 추가 → 편집 카드에서 영리법인 토글 OFF"로 진입한다(추가 시 영리가 기본). 종류 picker에 비영리법인 별도 버튼 불필요.

### 6.2 선택·편집 흐름 (모달 전환 후)

```
테이블 행 클릭 (또는 Enter/Space 키보드)
    → handleSelect(heir.id)
    → selectedHeirId = heir.id
    → showAddPanel = false, addStep = null, pendingKind = null  ← 정정 #8: 추가 패널 강제 종료
    → Dialog open=true (selectedHeirId !== null) → 모달 오픈
    → HeirEditor 해당 Heir로 로드

HeirEditor 내부 수정 (모달 내)
    → handleUpdate(index, updated) (기존 로직 그대로)
    → heirs 배열 갱신 → 모달 닫지 않고 실시간 반영
    → 모달 외부 테이블도 자동 반영

HeirEditor 내부 "삭제" 버튼 클릭
    → handleRemove(index)
    → selectedHeirId = null  → Dialog open=false → 모달 자동 닫힘

모달 "닫기" 버튼 또는 ESC / 배경 클릭
    → onOpenChange(false) → setSelectedHeirId(null)
    → 모달 닫힘. 데이터 유지 (폐기 확인 불필요 — 실시간 반영)
```

### 6.3 관계 변경 흐름 (편집 카드 내부)

현재 `HeirEditor` 내부 "종류 변경" 버튼 → **"관계 변경"으로 명칭만 변경** (기능 동일). `changingRelation` 로컬 상태 + `RelationPickerGrid` 기존 로직 유지.

```
[관계 변경] 클릭 (편집 카드 헤더)
    → changingRelation = true
    → RelationPickerGrid 표시 (기존 동작)
    → 선택 → changeHeirRelation(heir, newRelation) → onUpdate
    → changingRelation = false
    → 테이블 종류·관계 컬럼 자동 갱신
```

### 6.4 `other` 내 기타↔대습상속인 상호 전환 (정정 #13)

`relation="other"`인 행은 "기타"·"대습상속인" 두 종류를 오갈 수 있다. 편집 카드의 `SubstituteHeirPanel`(`:399-406`, `isSubstituteEligible = relation==="other"`)이 두 종류 공통으로 노출되며:

```
"기타"로 추가 (substituteGroupId 없음)
    → 편집 카드 SubstituteHeirPanel 토글 ON
    → substituteGroupId 발급 → deriveHeirKind = "substitute"
    → 테이블 종류 "기타" → "대습상속인" 자동 전환

"대습상속인"으로 추가 (substituteGroupId 있음, 토글 자동 ON)
    → SubstituteHeirPanel 토글 OFF
    → substituteGroupId 제거 → deriveHeirKind = "other"
    → 테이블 종류 "대습상속인" → "기타" 자동 전환
```

이는 `substituteGroupId` 단일 진실에 따른 일관 동작이다. `deriveHeirKind`가 매 렌더 파생하므로 별도 동기화 코드 불필요.

---

## 7. 2단계 추가 picker 상세 설계

### 7.1 종류 선택 단계 (addStep === "kind")

`RelationButton`과 유사한 `KindButton` 컴포넌트를 `HeirComposition.tsx` 내부에 인라인으로 정의한다(별도 파일 불필요, 3개 함수 내 재사용 없음).

```tsx
// 종류 선택 그리드
<div className="border border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg p-4 space-y-3">
  <p className="text-xs font-medium text-gray-600">종류 선택 (1단계)</p>
  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
    <KindButton kind="heir" label="상속인" icon="👥" onPick={...} />
    <KindButton kind="legatee" label="수유자" icon="📜" onPick={...} />
    <KindButton kind="substitute" label="대습상속인" icon="🔄" onPick={...} />
    <KindButton kind="corporate" label="법인" icon="🏢" onPick={...} />
    <KindButton kind="other" label="기타" icon="👤" onPick={...} />
  </div>
  <button onClick={() => setAddStep(null)} className="text-xs text-gray-400">취소</button>
</div>
```

**정정 #12 — `KindButton` `onPick` 분기 매핑** (`AddKind` → 동작):

| `AddKind` | onPick 동작 |
|---|---|
| `heir` | `setAddStep("relation")`, `setPendingKind("heir")` → 2단계 관계 선택(4종) |
| `legatee` | `handleAdd("legatee")` 즉시 추가 + 자동 선택 |
| `corporate` | `handleAdd("corporate")` 즉시 추가(isForProfit 미설정=영리 기본) |
| `substitute` | `handleAddSubstitute()` 즉시 추가(relation="other" + `subst-` 그룹 발급) |
| `other` | `handleAdd("other")` 즉시 추가 |

`KindButton` props: `{ kind: AddKind; label: string; icon: string; onPick: (k: AddKind) => void }`.

### 7.2 관계 선택 단계 (addStep === "relation") — 상속인 전용

**정정 #2**: 관계 선택 단계는 `pendingKind === "heir"`일 때**만** 진입한다. 대습상속인·수유자·법인·기타는 1단계에서 즉시 추가되므로 관계 선택 단계가 없다.

```tsx
// addStep === "relation" 일 때 (pendingKind === "heir" 전용)
// HEIR_PERSON_RELATIONS 4종(spouse·child·lineal_ascendant·sibling) 그리드 — RelationPickerGrid 재사용 금지
<PersonRelationPicker onPick={handleAdd} />   // 신규 4종 그리드
```

`PersonRelationPicker`는 `RelationButton`(기존, `:531-555`)을 `HEIR_PERSON_RELATIONS` 4종에 대해 렌더하는 경량 컴포넌트. `RelationPickerGrid`(SPECIAL_RELATIONS 포함)를 쓰지 않는다.

**대습상속인 추가 — `handleAddSubstitute()`** (정정 #3·#4, 인자 없음):
- `relation = "other"` 로 Heir 생성
- `substituteGroupId = generateSubstituteGroupId()` (**`subst-` 공용 헬퍼** — `generateHeirId` 아님) 즉시 발급 → 단독 그룹으로 시작
- `substituteForRelation`·`substituteRole`은 **여기서 설정하지 않는다** — 편집 카드의 `SubstituteHeirPanel`(`:399-406`)에서 사용자가 입력(기존 단일 진실 유지, 중복 입력 방지)
- 추가 직후 `selectedHeirId = newHeir.id` → 편집 카드 자동 로드 → `SubstituteHeirPanel` 토글이 `substituteGroupId` 존재로 자동 ON 상태

**검증 의존성 (정정 #18)**: 추가 직후 `substituteForRelation`·`substituteRole`이 미입력이면 `validateSubstituteHeirs`(`lib/calc/inheritance-validate-substitute.ts`)가 계산을 **차단**한다("원래순위/역할을 선택하세요"). `inheritance-legal-share.ts:125,142`는 `substituteForRelation`이 없는 `substituteGroupId` 보유 heir를 normal·대습 그룹 양쪽에서 제외하므로, validate 차단이 없으면 법정상속분 누락이 발생한다 — **validate가 안전장치**다. 따라서 추가 즉시 편집 카드를 열어(E-1) 순위·역할 입력을 유도하는 것이 필수 UX다.

---

## 8. `HeirTableView.tsx` 컴포넌트 상세 명세

파일: `components/calc/HeirTableView.tsx`

### 8.0 import 목록 (정정 #15)

```typescript
import type { Heir, HeirRelation } from "@/lib/tax-engine/types/inheritance-gift.types";
import { isForProfitCorporate } from "@/lib/tax-engine/inheritance-gift-common";  // 종류 파생(single-source)
import { HEIR_RELATION_LABELS } from "@/components/calc/inheritance/heir-relation-meta";
import { parseResidentNumber } from "@/lib/calc/resident-number";  // 생년월일·성별 표시
import { differenceInYears } from "date-fns";  // 미성년 배지(정정 #1)
```

### 8.1 Props

```typescript
interface HeirTableViewProps {
  heirs: Heir[];
  selectedHeirId: string | null;
  onSelect: (id: string) => void;
  deathDate?: string;  // 미성년 자동 판정용
}
```

### 8.2 렌더 구조 (모달 전환 후 — 라디오 컬럼 제거)

```tsx
<div className="overflow-x-auto" role="group" aria-label="상속인·수유자 목록">
  <table className="w-full text-xs border-collapse">
    <thead>
      <tr className="border-b border-gray-200 dark:border-gray-700">
        {/* 라디오 컬럼 제거 */}
        <th className="py-2 text-left pl-3">종류</th>
        <th className="py-2 text-left pl-2">관계</th>
        <th className="py-2 text-left pl-2">이름</th>
        <th className="py-2 text-left pl-2">생년월일·성별</th>
        <th className="py-2 text-left pl-2">특이사항</th>
        <th className="w-8 py-2 text-right pr-3 text-[10px]">편집</th>
      </tr>
    </thead>
    <tbody>
      {heirs.map((heir) => (
        <HeirTableRow
          key={heir.id}
          heir={heir}
          isSelected={heir.id === selectedHeirId}
          onSelect={() => onSelect(heir.id)}
          deathDate={deathDate}
        />
      ))}
    </tbody>
  </table>
</div>
```

### 8.3 `HeirTableRow` 내부 컴포넌트 (모달 전환 후)

선택된 행: `bg-violet-50/70 dark:bg-violet-900/20` 배경 (모달 열린 동안 하이라이트 유지).  
미선택 행: `hover:bg-gray-50 dark:hover:bg-gray-800/30` hover.

```tsx
<tr
  role="button"
  tabIndex={0}
  onClick={onSelect}
  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
  aria-label={`${nameDisplay} 편집`}
  className={isSelected ? "cursor-pointer bg-violet-50/70 ..." : "cursor-pointer hover:bg-gray-50 ..."}
  data-testid={`heir-table-row-${heir.id}`}
>
  {/* 라디오 컬럼 없음 */}
  <td className="pl-3 py-1.5 whitespace-nowrap">{HEIR_KIND_LABELS[kind]}</td>
  <td className="pl-2 py-1.5 text-gray-600">{relationDisplay}</td>
  <td className="pl-2 py-1.5 font-medium">{nameDisplay}</td>
  <td className="pl-2 py-1.5 font-mono text-gray-500">{birthGenderDisplay}</td>
  <td className="pl-2 py-1.5">
    <div className="flex flex-wrap gap-1">{badges}</div>
  </td>
  {/* 편집 아이콘 힌트 */}
  <td className="pr-3 py-1.5 text-right text-gray-300 text-xs select-none">✎</td>
</tr>
```

### 8.4 가로 스크롤

테이블은 `HorizontalScrollContainer` 대신 `overflow-x-auto` 직접 사용. 좁은 화면에서 테이블이 스크롤됨.  
단, macOS 가로 스크롤 autohide 이슈(`feedback_macos_scrollbar_autohide_workaround`)가 확인되면 `HorizontalScrollContainer`로 교체.

---

## 9. 접근성 (ARIA) — 모달 전환 후

- 테이블 `role="group"` + `aria-label="상속인·수유자 목록"`
- 각 행 `role="button"` + `tabIndex={0}` + `aria-label="{이름 또는 fallback} 편집"` — 클릭 가능 시각 신호
- 키보드: `Enter` / `Space` 로 행 선택 → 모달 오픈. `onKeyDown`에서 `e.preventDefault()` 후 `onSelect()` 호출
- Dialog 모달: BaseUI `DialogPrimitive.Root`가 포커스 트랩(modal=true 기본) + ESC 닫기 자동 처리
- 닫기 버튼 `type="button"` — submit 이벤트 버블링 방지

```tsx
// HeirTableRow — 행 role="button" 패턴
<tr
  role="button"
  tabIndex={0}
  onClick={onSelect}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  }}
  aria-label={`${nameDisplay} 편집`}
  className="cursor-pointer ..."
>

// HeirComposition.tsx — Dialog 래핑
<Dialog
  open={selectedHeirId !== null}
  onOpenChange={(open) => { if (!open) setSelectedHeirId(null); }}
>
  <DialogContent className="sm:max-w-lg w-full p-0" showCloseButton={false}>
    <DialogHeader className="px-4 pt-4 pb-0">
      <DialogTitle>상속인 편집</DialogTitle>
    </DialogHeader>
    <div className="max-h-[80vh] overflow-y-auto px-4 pb-4 pt-3">
      {selectedHeir && <HeirEditor ... />}
    </div>
    <div className="border-t px-4 py-3 flex justify-end">
      <button type="button" onClick={() => setSelectedHeirId(null)}>닫기</button>
    </div>
  </DialogContent>
</Dialog>
```

---

## 10. 편집 카드 로드 규칙

```typescript
// HeirComposition.tsx 내부
const selectedIndex = heirs.findIndex((h) => h.id === selectedHeirId);
const selectedHeir = selectedIndex >= 0 ? heirs[selectedIndex] : null;

// 행 선택 (정정 #8: 추가 패널 강제 종료)
const handleSelect = (id: string) => {
  setSelectedHeirId(id);
  setShowAddPanel(false);
  setAddStep(null);
  setPendingKind(null);
};

// 추가 후 자동 선택 (상속인 — 관계 2단계 완료 시)
const handleAdd = (relation: HeirRelation) => {
  const newHeir: Heir = { id: generateHeirId(), relation };
  onChange([...heirs, newHeir]);
  setSelectedHeirId(newHeir.id);  // 추가 후 자동 선택
  setShowAddPanel(false);
  setAddStep(null);
  setPendingKind(null);
};

// 대습상속인 추가 (정정 #3·#4: subst- 그룹 즉시 발급)
const handleAddSubstitute = () => {
  const newHeir: Heir = {
    id: generateHeirId(),
    relation: "other",
    substituteGroupId: generateSubstituteGroupId(),  // 공용 헬퍼(subst- 컨벤션)
  };
  onChange([...heirs, newHeir]);
  setSelectedHeirId(newHeir.id);
  setShowAddPanel(false);
  setAddStep(null);
  setPendingKind(null);
};

// 삭제 후 선택 해제
const handleRemove = (index: number) => {
  const removedId = heirs[index].id;
  onChange(heirs.filter((_, i) => i !== index));
  if (selectedHeirId === removedId) setSelectedHeirId(null);  // 선택 해제
};
```

**삭제 후 인접 행 자동 선택은 하지 않는다.** 사용자가 명시적으로 다음 행을 선택하도록 하여 의도치 않은 데이터 수정을 방지한다.

---

## 11. HeirEditor 헤더 변경 사항 (모달 전환 후)

HeirEditor는 모달 내부에 렌더된다. "관계 변경" 버튼·삭제 버튼은 모달 내 편집 카드(HeirEditor) 헤더에 기존과 동일하게 유지.

```tsx
// HeirEditor.tsx 헤더 (무변경 — 기존 "관계 변경" 버튼 그대로)
<button ... data-testid={`heir-change-relation-${index}`}>
  관계 변경
</button>
<button type="button" onClick={onRemove}>
  삭제
</button>
```

삭제 버튼 클릭 시: `handleRemove(selectedIndex)` → `selectedHeirId = null` → Dialog 자동 닫힘.

**정정 #7 — 명칭·기능 의미 충돌 주의**: 이 버튼이 띄우는 `RelationPickerGrid`는 법정상속인 5종뿐 아니라 **수유자·법인(SPECIAL_RELATIONS) 종류 전환까지** 포함한다. 즉 라벨은 "관계 변경"이지만 실제로는 종류(상속인↔수유자↔법인) 변경도 수행한다. 본 개편의 관계/종류 2축 구분 취지와 부분 충돌하나, `changeHeirRelation`이 종류 전환 시 정합성 필드 정리를 단일 함수로 처리하므로 **기능은 그대로 유지**하고 라벨만 "관계 변경"으로 둔다.

**정정 #9**: 테이블 행에 별도 삭제 버튼 추가하지 않는다. 삭제는 모달 내 편집 카드 헤더에서만 수행.

---

## 12. 전역 UI 규칙 반영 확인

| 규칙 | 적용 여부 | 비고 |
|---|---|---|
| `SelectOnFocusProvider` 전역 등록 | 자동 적용 | 개별 `onFocus` 추가 불필요 |
| `EnterKeyNavigationProvider` | 자동 적용 | 테이블 내 input은 표준 라디오 — Enter 이동 적용 안 됨(라디오 네이티브) |
| `ToggleCard`/`RadioCardGroup` | 편집 카드 내부 기존 그대로 | 테이블 라디오는 내비게이션용이므로 RadioCardGroup 미사용(표시 목적 아님) |
| OFF 상태 tone 배경 유지 | 편집 카드 기존 그대로 | |
| `DateInput` 사용 | 편집 카드 기존 그대로 | |
| heir-id 노출 금지 | CATEGORY_FALLBACK_LABEL 사용 | `feedback_no_internal_id_in_result` |
| Tailwind 정적 색조 매핑 | BADGE_TONE_MAP Record 사용 | `feedback_tailwind_static_tone_mapping` |
| 800줄 정책 | `HeirTableView.tsx` 분리 (~250줄 예상) | `HeirComposition.tsx` 분리 후 ≤600줄 예상 |

---

## 13. 배지 정적 tone 매핑

```typescript
// HeirTableView.tsx 내부
const BADGE_TONE_CLASSES: Record<string, string> = {
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
};

// 사용 예
<span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full ${BADGE_TONE_CLASSES.violet}`}>
  장애인
</span>
```

---

## 14. 800줄 분할 계획 (구체)

현재 `HeirComposition.tsx` = 722줄.  
`HeirTableView.tsx` 추가 시 HeirComposition이 확장되어 800줄 초과 우려.

**분할 전략**:

```
components/calc/
├── HeirComposition.tsx        # 오케스트레이터 — 예상 ~350줄
│   exports: HeirComposition (기존 public API 100% 유지)
│   포함: generateHeirId, handleAdd/Update/Remove, 상태 관리,
│         HeirSummary(작음), AddPanel(2단계 picker), 편집 카드 layout
├── HeirTableView.tsx          # [신설] 테이블 전용 — 예상 ~250줄
│   exports: HeirTableView
│   포함: HeirTableRow, deriveHeirKind, deriveRelationDisplay,
│         HEIR_KIND_LABELS, CATEGORY_FALLBACK_LABEL, BADGE_TONE_CLASSES
├── (PersonRelationPicker는 HeirComposition.tsx 내부 인라인 — 정정 #14, ~20줄 경량)
└── (HeirEditor는 HeirComposition.tsx 내부 유지 또는 HeirEditor.tsx 분리)
```

`HeirEditor`(현재 138-519줄, 381줄)를 분리 추출하면 `HeirComposition.tsx`가 ~200줄로 줄고 `HeirEditor.tsx` ~400줄이 된다. 단, `HeirEditor.tsx` 분리 시 `HeirCompositionProps`의 `onUpdate`/`onRemove` 콜백 시그니처를 props로 드릴링해야 하므로 800줄 초과가 확인될 때만 분리한다.

**800줄 체크 시점**: Do 단계 완료 직전 `wc -l HeirComposition.tsx` 확인 후 초과 시 즉시 분리.

---

## 15. `steps.tsx` 변경 최소화

`steps.tsx:151` (실측):

```tsx
// 현재
<HeirComposition heirs={form.heirs} onChange={setHeirs} deathDate={form.deathDate} />

// 변경 없음 — HeirComposition public API 동일 유지
// HeirCompositionTableView 라는 별도 컴포넌트를 만들지 않고
// 기존 HeirComposition 내부에서 테이블 뷰로 교체
```

`steps.tsx` 변경 사항: 없음.

---

## 16. 자가 점검 체크리스트 (Do 완료 전 필수)

- [ ] `deriveHeirKind`가 `isForProfitCorporate`를 `lib/tax-engine/inheritance-gift-common.ts`에서 import함 (직접 재구현 금지)
- [ ] 테이블 이름 컬럼에 heir-id(`heir-${...}`) 노출 없음
- [ ] 추가 직후 `selectedHeirId = newHeir.id` 자동 선택 동작
- [ ] 삭제 후 `selectedHeirId = null` 처리 (인접 자동 선택 없음)
- [ ] "종류 변경" → "관계 변경" 버튼 텍스트 변경 완료
- [ ] 테이블 우측 수정/삭제 버튼 없음 (삭제는 편집 카드 안에서만)
- [ ] Tailwind 동적 색조 클래스 없음 (Record 정적 매핑 사용)
- [ ] `HeirComposition.tsx` ≤800줄 확인
- [ ] `HeirTableView.tsx` ≤800줄 확인
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/inheritance-tax/` 통과
- [ ] 브라우저: 상속인 추가(종류→관계 2단계) → 테이블 표시 → 라디오 선택 → 편집 카드 로드 → 수정 → 테이블 반영 → 삭제 → 선택 해제 전 흐름 수동 확인

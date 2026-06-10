# 동거가족 테이블+모달 뷰 전환 — UI 설계

**작성일**: 2026-06-10  
**범위**: 순수 UI 리팩터 (엔진·타입·`personal-deduction-calc.ts` 무변경)  
**관련**: `project_heir_composition_table_modal_view.md` (상속인 테이블 패턴 재적용)

---

## 1. 배경

Step 0의 동거가족(인적공제 대상 부양가족 §20·시령§18①) 입력이 카드 나열 방식이었음.  
상속인(`HeirComposition`) 테이블+모달 패턴을 동일하게 적용해 UX 일관성을 확보.

---

## 2. 엔진 무변경 근거

- `CohabitantDependent` 타입: `id·name?·birthDate?·isDisabled?·gender?·relation` — 변경 없음
- `toPersonalHeir`, `calcPersonalDeductions` — 변경 없음
- FormState `cohabitantDependents: CohabitantDependent[] | undefined` — 변경 없음
- API 변환·validate — 변경 없음

---

## 3. 컴포넌트 구조

```
CohabitantDependentSection (리팩터)
  ├── 헤더 + "+ 동거가족 추가" 버튼
  ├── 안내문 (§20·시령§18①)
  ├── CohabitantTableView  ← 신설 (deps.length > 0 시만 렌더)
  │     └── CohabitantTableRow × N  (role="button", 클릭→onSelect)
  └── Dialog (open = selectedDepId !== null)
        ├── DialogHeader "동거가족 편집"
        ├── DepEditor (관계·성명·생년월일·장애인+성별)  ← 기존 카드 내용 이동
        └── footer "닫기" 버튼
```

---

## 4. 테이블 컬럼 스펙

| 컬럼 | 내용 | 비고 |
|---|---|---|
| 관계 | RELATION_LABELS[dep.relation] | 직계비속·직계존속·형제자매 3값 |
| 이름 | `dep.name?.trim() \|\| "(동거가족)"` | id 노출 금지 |
| 생년월일·성별 | birthDate + gender 라벨 | 미입력 → amber "미입력" 배지 |
| 특이사항 | 장애인(violet)·미성년(amber)·연로자(sky) 배지 | age 파생 (differenceInYears) |
| 편집 | "✎" 힌트 아이콘 | 클릭 영역은 행 전체 |

---

## 5. 3-state 보존

| 상태 | `value` | `deps` | 동작 |
|---|---|---|---|
| OFF | `undefined` | `[]` (fallback) | 테이블 미표시, 빈 안내문 |
| ON 빈 | `[]` | `[]` | 테이블 미표시, 빈 안내문 |
| ON 데이터 | `[...]` | `[...]` | 테이블 표시 |

- `add` → deps push(기본 lineal_descendant) + `setSelectedDepId(newDep.id)` → 모달 자동 오픈
- `remove` → `next.length === 0 ? undefined : next` (OFF 복귀)

---

## 6. 모달 흐름

```
행 클릭 → handleSelect(id) → selectedDepId = id → Dialog open
추가 버튼 → handleAdd() → deps push → selectedDepId = newDep.id → Dialog open (자동)
닫기 클릭 / ESC → onOpenChange(false) → selectedDepId = null → Dialog close
삭제(모달 내) → handleRemove(id) → selectedDepId = null → Dialog close
```

- 모달: `max-h-[80vh] overflow-y-auto` — 긴 폼 스크롤
- 저장/취소·폐기확인 불필요 — 실시간 onChange 반영

---

## 7. 접근성

- `<tr role="button" tabIndex={0} aria-label="{이름} 편집">` — 키보드 Enter/Space 트리거
- `data-testid="cohabitant-table-row-${dep.id}"` — E2E 선택용
- Dialog: shadcn 기본 접근성 (focus trap, ESC 닫힘)

---

## 8. 파일 목록 및 줄수 목표

| 파일 | 역할 | 목표 줄수 |
|---|---|---|
| `components/calc/CohabitantTableView.tsx` | 테이블 신설 | ≤180 |
| `components/calc/inheritance/CohabitantDependentSection.tsx` | 리팩터 | ≤220 |

---

## 9. E2E 시나리오

1. 동거가족 추가 → 테이블 행 표시 확인
2. 행 클릭 → 모달 오픈 확인
3. 모달에서 관계·생년월일 편집 → 닫기 → 테이블 반영 확인
4. 모달에서 삭제 → 모달 닫힘 · 3-state OFF(테이블 미표시) 확인
5. Enter/Space 키보드 트리거 확인

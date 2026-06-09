# UI 설계 — 협의분할 직접 입력 (비영리법인 노출·기본값 제거·2열 배치)

> 계획서: `docs/01-plan/inheritance-heir-allocation-nonprofit-default-layout.plan.md`
> 엔진 설계: `inheritance-heir-allocation-nonprofit-default-layout.engine.design.md`
> 대상: `HeirAllocationInput.tsx`(5곳 재사용) + `HeirAllocationToggleSection.tsx` + `handleChipClick.ts`

## 1. 목표 / 비목표 (UI)

**목표**:
1. 비영리법인 수유자를 협의분할 목록에 노출(영리법인만 제외) — 엔진 `isForProfitCorporate` 공용.
2. 토글/칩 ON 시 **아무도 미선택**(빈 배열). 1명 선택 시 평가액 전액 자동, 다수·금액 편집.
3. 1행 1명 → **2열 그리드**, 선택 시 금액·면적 입력칸을 칩 **아래**.

**비목표**: 엔진 result 타입·결과뷰 컴포넌트 코드 변경(데이터 흐름만), 영리법인 면제 표시, §16 체크리스트.

## 2. 사용자 시나리오

| # | 상황 | 기대 |
|---|---|---|
| S1 | Step0에서 비영리법인(법인+영리법인 토글 OFF) 등록 후 자산 협의분할 펼침 | 비영리법인 칩이 목록에 보임(영리법인은 안 보임) |
| S2 | 협의분할 토글 ON | 아무 칩도 선택 안 됨·금액칸 없음·"미입력 시 법정상속분 자동배분" 안내 |
| S3 | 칩 1개 클릭 | 그 칩 ✓·금액칸이 칩 아래 등장·평가액 전액 자동입력 |
| S4 | 칩 추가 클릭 | 잔여금액 자동입력, 각 금액 자유 편집 |
| S5 | 화면 — 상속인 4~6명 | 2열 배치로 세로 길이 절반 |
| S6 | 결과 화면 | 비영리법인 열에 finalTax·분배액 정상 표시(엔진 정정 효과) |

## 3. 위젯 명세 — 레이아웃 (이슈3)

### 3.1 Before (현행 `HeirAllocationInput.tsx:195-245`)
```
[✓ 자녀(김첫째)]  [  200,000,000  ]        ← 1행 1명, 금액 인라인 우측
[+ 배우자(한배우자)]
[+ 자녀(김둘째)]
[+ 수유자(김손자)]
[+ 기타(윤며느리)]
```
`<div className="space-y-1.5">` → `distributableHeirs.map` 각 행 `flex flex-wrap items-center gap-2`(칩+금액 가로).

### 3.2 After (2열 그리드 + 금액 칩 아래)
```
┌─────────────────────────┬─────────────────────────┐
│ [✓ 자녀(김첫째)]         │ [+ 배우자(한배우자)]     │
│   [ 200,000,000 ]        │                          │   ← 선택 칸만 금액칸(칩 아래)
├─────────────────────────┼─────────────────────────┤
│ [+ 자녀(김둘째)]         │ [+ 수유자(김손자)]       │
├─────────────────────────┼─────────────────────────┤
│ [+ 비영리법인(△△재단)]  │ [+ 기타(윤며느리)]       │   ← 비영리법인 노출(이슈1)
└─────────────────────────┴─────────────────────────┘
```
- 컨테이너: `grid grid-cols-1 sm:grid-cols-2 gap-2 items-start`(모바일 1열·sm↑ 2열). `items-start` — 선택 셀이 금액칸으로 길어져도 행 상단 정렬(높이 불균형 방지, 정정 #13).
- 셀: `flex flex-col gap-1.5`(칩 상단 → 선택 시 금액 → 면적 **수직 스택**, 정정 #12). 반폭 셀이라 가로 배치 대신 세로 스택으로 확정.
- 칩: 기존 `aria-pressed`·tone 유지(변경 없음).
- 금액칸: `CurrencyInput hideUnit`(기존), 셀 폭 채움 `w-full`(기존 `max-w-[200px]` 제거 — 셀이 이미 절반폭. `min-w-[140px]`는 유지 가능).
- 면적칸(showAreaInput, 자산-수준만): 금액 **아래** 수직 스택(`w-full` 또는 기존 `w-24` 유지). 채무·추정상속(showAreaInput=false)은 면적칸 없음.
- **Task2 연속성**: 이름은 셀당 1회(칩에만) — Task2 "통합 행(이름 1회)" 의도 유지. 2열은 행→셀 전환일 뿐 name-once 불변.

## 4. 위젯 명세 — 필터·기본값 (이슈1·2)

### 4.1 비영리법인 노출 (이슈1)
```ts
// HeirAllocationInput.tsx
import { isForProfitCorporate } from "@/lib/tax-engine/inheritance-gift-common";

export function hasDistributableHeir(heirs: Heir[]): boolean {
  return heirs.some((h) => !isForProfitCorporate(h));   // 영리법인만 제외
}
// :96
const distributableHeirs = heirs.filter((h) => !isForProfitCorporate(h));
```
- `heirShortLabel`(:67) corporate → "법인" 매핑 유지. 비영리법인은 "법인 (△△재단)"으로 표시(입력 위젯). 영리법인은 목록 제외이므로 "법인" 라벨 = 비영리법인 단일 의미(혼동 없음).
- **OOS 관찰(정정 #14, low-pri)**: 결과뷰 `EstateAllocationTable:91`은 `heirShortLabel` 아닌 `h.name ?? h.relation` 직접 사용 → 비영리법인에 회사명 미입력 시 "corporate"(영문) 노출 가능. 영리법인도 동일한 pre-existing 동작. 본 task 범위 밖(별도 라벨 개선 과제). Step0에서 법인 회사명 입력 권장.

### 4.2 기본값 제거 (이슈2 — Option X)
```ts
// HeirAllocationInput.tsx:40 — 시그니처 유지, body만 변경
export function buildInitialHeirAllocations(
  heirs: Heir[],
  _effectiveValuation?: number,   // 호출 호환 위해 유지(미사용 — _ prefix)
): HeirAllocation[] {
  return [];   // 이슈2: 전액 자동배정 제거 — ON 시 아무도 미선택
}
```
- `HeirAllocationToggleSection.tsx:58` · `handleChipClick.ts:94` 호출 **무변경**(body가 [] 반환).
- `handleChipClick.ts:88` 주석 "첫 자연인 amount:0 1행으로 시작" → "빈 배열로 시작" 갱신.
- 선택 동작: 기존 `toggleHeir`(:98-111) 유지 — 첫 선택 시 `remaining = expectedTotal − 0 = 전액`, 추가 시 잔여, `updateAmount` 자유 편집. **코드 변경 없음**(초기값만 빈 배열).
- 전체 해제: `toggleHeir` 마지막 해제 → `undefined`(OFF) 유지(R-1 결정).

## 5. 동기화 지점 (UI 8개)

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | `EstateItem.heirAllocations` | 무변경(기존 필드) |
| ② initial | — | 무변경 |
| ③ normalize | — | 무변경 |
| ④ API 변환 | `heirAllocations` 직렬화 | 무변경 |
| ⑤ **UI 위젯** | `HeirAllocationInput` 필터·2열·초기값 | **본 작업** |
| ⑥ 사이드바 합계 | `computeInheritanceSummary` | 무변경(분배는 평가 합계 불변). 단 `estimatedTax`(:187 Σ perHeir.finalTax)는 비영리법인 finalTax 자동 포함 — 엔진 정정 효과(코드 무변경) |
| ⑦ **결과 카드** | `EstateAllocationTable:86` `heirs.map` | **무변경**(corporate 필터 없음 — 실측). 비영리법인 열 `h.name ?? h.relation`로 자동 렌더. 엔진 finalTax·categoryBreakdown 반영 |
| ⑧ Validation | `validateEstateItemAllocations`(:140) 외 | 무변경. `[]`(ON 빈) → `:141` null 통과 |

## 6. 접근성 / UX

- 칩: `aria-pressed={selected}`(기존) 유지 — 2열 전환과 무관.
- 그리드: `grid-cols-1 sm:grid-cols-2` — 모바일 가독성 보존(1열), 데스크톱 압박 경감(2열).
- 포커스 전체선택: `SelectOnFocusProvider` 전역(CurrencyInput) — 추가 불요.
- 빈 상태(S2): 기존 "미입력 시 법정상속분 자동배분" 안내(:188-192) 유지 — ON 빈 배열과 의미 정합.

## 7. testid / 테스트 anchor (UI)

기존 `heir-allocation-input`·`heir-allocation-rows` testid 유지. anchor(계획 §9 U-1~U-3):
- **U-1**: 비영리법인(corporate+isForProfit=false) heirs → `distributableHeirs` 포함·영리법인 제외(렌더 칩 개수/라벨).
- **U-2**: 토글 ON → `heirAllocations === []`(미선택). 칩 1개 클릭 → 전액(`expectedTotal`). 칩-자동-ON 경로 동일.
- **U-3**: 2열 그리드 — `heir-allocation-rows` 컨테이너 className `grid-cols`(또는 셀 구조) 검증. 기존 `heir-allocation-unified-row.test.tsx` 갱신(통합 행 → 그리드 셀).

E2E: 상속세 협의분할 경로(비영리법인 등록 → 협의분할 ON → 미선택 확인 → 칩 클릭 → 전액 → 결과 열 표시).

## 8. 회귀 가드
- 채무 `DebtAllocationInput`·추정상속 `PresumedInheritanceInput`·인라인 `EstateChipInlineExpand` 모두 동일 위젯 → 2열·비영리법인·빈 초기값 일관 적용(blast radius 정합).
- 기존 `heir-allocation-unified-row.test.tsx`·`estate-stock-chips-header.test.tsx`·DebtAllocation 테스트 통과.

## 9. DoD (UI)
- [ ] 비영리법인 노출·영리법인 제외(U-1).
- [ ] 토글/칩 ON 빈 배열·선택 시 전액·편집(U-2).
- [ ] 2열 그리드·금액칸 칩 아래(U-3).
- [ ] 결과뷰 비영리법인 열 정상(데이터 흐름).
- [ ] `tsc` 0 + U-1~U-3 + 전체 `npm test` + E2E.

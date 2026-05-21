# 채무·공과·장례비 협의분할 입력 토글 활성화 계획

## 1. 배경 (Problem Statement)

상속세 마법사 Step 2 (`components/calc/inheritance/steps.tsx:140-220`)의 amber ToggleCard
"채무·공과·장례비 협의분할 입력 (Phase A0)"이 **항상 OFF로 고정되어 활성화되지 않음**.

### 사용자 증상
- 토글 우측 Switch를 클릭해도 OFF 상태가 유지됨 (Switch thumb이 우측으로 이동하지 않음)
- 협의분할 입력 패널(`DebtAllocationInput`)이 렌더되지 않고, 항상 단일금액 입력 (장례비/공과금+채무 합계)만 노출

## 2. 근본 원인 (Root Cause)

`steps.tsx:141` 의 derive 로직:

```ts
const usesDebtItems = form.debtItems.length > 0;  // ← 토글 표시 상태
```

- 토글 ON 클릭 시 `set({ debtItems: [], ... })` — 빈 배열로 초기화 (`steps.tsx:159-164`)
- 빈 배열이라 `length === 0` → `usesDebtItems = false` → Switch가 다시 OFF로 보임
- 사용자가 항목을 추가할 진입점(`DebtAllocationInput`)이 렌더되지 않으니 영구히 빈 배열 유지
- 코드 주석 자체도 이 문제를 인지(`steps.tsx:165`): "초기화 직후 빈 배열이라 토글이 다시 OFF로 보일 수 있음"

### "OFF로 보임"이 아니라 **OFF가 사실** — 모드 의도가 폼 상태에 저장되지 않음

`debtItems.length > 0`는 "협의분할 모드 ON" 의 신호로 부적절. 모드 의도와 데이터 보유를 동일 슬롯에 묶은 설계 결함.

## 3. 해결 방안 (Design)

### 방안 A (권장): `useDebtAllocation: boolean` 모드 플래그 분리

폼 상태에 명시 플래그를 추가하고, 데이터(`debtItems[]`)와 모드 의도를 분리.

#### 변경 지점 (14 동기화 지점 부분 적용 — Phase A0 폼 필드 추가)

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| ① | FormState 타입 | `components/calc/inheritance/shared.ts` (또는 store) | `useDebtAllocation: boolean` 추가 |
| ② | initial value | 동상 INITIAL_FORM | `useDebtAllocation: false` |
| ③ | normalize fallback | 동상 normalize (있으면) | `useDebtAllocation: data.useDebtAllocation ?? (data.debtItems?.length > 0)` (legacy 마이그레이션) |
| ④ | API 변환 | `lib/calc/inheritance-tax-api.ts` (해당 시) | 변환 불필요 — `debtItems` 자체만 엔진에 전달 (OFF 시 빈 배열) |
| ⑤ | UI 입력 위젯 | `components/calc/inheritance/steps.tsx:141-170` | `usesDebtItems` → `form.useDebtAllocation` 치환 |
| ⑥ | 사이드바 합계 | (해당 없음) | — |
| ⑦ | 결과 카드 | (해당 없음) | — |
| ⑧ | Validation | `lib/calc/inheritance-validate.ts` (해당 시) | OFF 모드일 때 `funeralExpense`/`debts` 입력 인식, ON 모드일 때 `debtItems` 검증 |

#### Step 2 컴포넌트 수정 (steps.tsx)

```tsx
// Before
const usesDebtItems = form.debtItems.length > 0;
<ToggleCard
  checked={usesDebtItems}
  onCheckedChange={(v) => {
    if (v) set({ debtItems: [], funeralExpense: "", funeralIncludesBongan: false, debts: "" });
    else set({ debtItems: [] });
  }}
/>
{usesDebtItems ? <DebtAllocationInput ... /> : <단일금액입력 .../>}

// After
<ToggleCard
  checked={form.useDebtAllocation}
  onCheckedChange={(v) => {
    if (v) {
      // 모드 진입: 단일금액 필드 초기화 + 협의분할 데이터 보존(있으면)
      set({
        useDebtAllocation: true,
        funeralExpense: "",
        funeralIncludesBongan: false,
        debts: "",
      });
    } else {
      // 모드 이탈: 협의분할 데이터 폐기
      set({ useDebtAllocation: false, debtItems: [] });
    }
  }}
/>
{form.useDebtAllocation ? <DebtAllocationInput ... /> : <단일금액입력 .../>}
```

#### 엔진 입력 매핑 (route handler 또는 API 변환)

엔진은 `debtItems`가 비어있으면 legacy `debts`/`funeralExpense`를 사용하는 기존 우선순위 유지. 모드 플래그는 UI 전용 — 엔진에 전달 불필요.

다만 ON + 빈 항목 상태(`useDebtAllocation: true && debtItems.length === 0`)에서 엔진이 legacy 0으로 떨어지지 않도록 **validation에서 차단**(⑧).

### 방안 B (대안): "+ 첫 항목 추가" 버튼을 ToggleCard 펼침에 표시 (모드 플래그 없이)

ON 클릭 시 즉시 빈 항목 1개를 추가(`debtItems: [createEmptyDebtItem()]`).

- 장점: 폼 필드 추가 없음
- 단점: 토글이 본질적으로 "데이터 추가 액션"이 되어 의미 왜곡. 토글 OFF 시 입력했던 데이터가 즉시 사라져 데이터 손실 위험 (Undo 없음). 사용자가 "잠깐 ON 해보기"가 불가능.

→ **방안 A 채택**

## 4. 구현 순서 (Do)

1. **shared.ts 또는 inheritance store** — `useDebtAllocation: boolean` 필드 추가 (① ② ③)
2. **steps.tsx Step2** — derive 제거 + `form.useDebtAllocation` 직접 사용 + onCheckedChange 재작성 (⑤)
3. **legacy sessionStorage 마이그레이션** — normalize에서 `debtItems.length > 0`인 기존 사용자는 `useDebtAllocation = true`로 자동 승격 (③)
4. **validation 분기** (⑧) — ON 모드일 때 빈 `debtItems[]` 차단 (오류: "협의분할 항목을 1개 이상 추가하세요")
5. **회귀 확인** — `npx tsc --noEmit` + 상속세 anchor + 브라우저 수동 (토글 ON → DebtAllocationInput 노출 → 항목 추가 → 결과 계산 → 토글 OFF → 데이터 폐기 확인)

## 5. 위험 (Risk)

- **sessionStorage 마이그레이션 누락 시** 기존 협의분할 사용자가 OFF 상태로 보임 → ③ normalize 필수
- **데이터 폐기 확인 다이얼로그 미적용 시** OFF 클릭 한 번으로 입력 손실 — Phase A0 범위 외 후속 PR 고려 (현 디자인에도 동일 위험 존재하므로 본 PR 회귀 아님)

## 6. 정책 메모리 참조

- [feedback_useeffect_store_mirror_forbidden] — useEffect로 동기화 금지. onCheckedChange 직접 set
- [feedback_validation_sync_8th_point] — UI 통과↔validate 차단 모순 방지 (⑧ 적용)
- [feedback_store_default_vs_ui_display_fallback] — 3중 일관성: factory default (`useDebtAllocation: false`) = normalize 빈값 처리 = UI 직접 사용

## 7. Definition of Done

- [ ] `form.useDebtAllocation` 추가 (FormState · INITIAL_FORM · normalize 3곳)
- [ ] steps.tsx Step2 `usesDebtItems` derive 제거 → `form.useDebtAllocation` 치환
- [ ] ON 클릭 시 Switch thumb이 우측으로 이동하고 OFF로 되돌아오지 않음 (육안)
- [ ] ON 상태에서 `DebtAllocationInput` 패널 노출, 항목 추가/삭제 정상 동작
- [ ] OFF 클릭 시 `debtItems = []` 폐기 + 단일금액 입력 노출
- [ ] sessionStorage legacy(`debtItems.length > 0` 보유자) 자동 ON 마이그레이션
- [ ] Validation: ON + 빈 항목 차단
- [ ] `npx tsc --noEmit` 0건, 상속세 anchor 회귀 0건
- [ ] 브라우저 수동 확인 (Network 탭 request body 신규 필드 없음 — UI 전용)

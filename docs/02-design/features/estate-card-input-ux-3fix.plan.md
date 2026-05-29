# estate-card-input-ux-3fix — 상속 자산 카드 입력 UX 3건 수정 계획 (v2)

> 사용자 피드백(2026-05-29) 3건. v1 작성 후 11단계 자가 검토([[feedback_11step_self_review_workflow]])로
> 코드 실측 정정 10건 반영한 v2.
>
> 대상 컴포넌트:
> - `components/calc/inheritance/HeirAllocationToggleSection.tsx` (Issue 1·2)
> - `components/calc/inheritance/HeirAllocationInput.tsx` (Issue 2)
> - `components/calc/inheritance/estate-card/handleChipClick.ts` (Issue 1)
> - `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx` (Issue 3)
> - `components/calc/inheritance/estate-card/variants/EstateBodyDeposit.tsx` (Issue 3 검토 — 보류)
>
> **변경 없음(v1 오류 정정)**:
> - `chip-config.ts` — 협의분할 칩에 disabled 필드 없음. 칩 자체는 항상 클릭 가능.

---

## v1 → v2 정정 사항 (11단계 검토 결과)

| # | v1 단정 | 실측 사실 | 영향 |
|---|---|---|---|
| C-1 | "칩 disabled 동기화 필요" | `chip-config.ts` 칩에 disabled 필드 없음. 칩은 항상 클릭 가능 | Issue 1 변경 범위 축소 — chip-config 변경 0 |
| C-2 | handleChipClick 동작 미언급 | line 87-94: 평가액 0 또는 자연인 0이면 `buildInitialHeirAllocations` 호출 안 함. 단순 펼침만 | Issue 1 실제 막힘 지점은 ToggleCard disabled + handleChipClick `eff > 0` 가드 |
| C-3 | "잔여 자동 채움" → DebtAllocationInput도 영향 | DebtAllocation은 채무 분할용. "잔여 자동"이 자동 안분과 구분되는 정책 정당화 필요 | Issue 2 — 토글 클릭은 사용자 명시 액션이므로 자동 안분 fallback 정책 위반 아님(명세 추가) |
| C-4 | EstateBodyDeposit Issue 3 적용 검토 누락 | Deposit variant는 본체 1필드(임대보증금)만 — advanced 토글 불요 | Issue 3 부동산 variant 전용 |
| C-5 | §14 자동공제 토글 위치 결정 회피 | `mortgageAmount > 0`이면 advanced 닫혀도 §14 토글 표시 → 사용자 혼란 | **결정: §14 자동공제 토글을 advanced 토글 children 안쪽으로 이동** |
| C-6 | useState 자동 ON — collapse 후 동기화 | Shell collapse는 outer hidden, EstateBody는 unmount되지 않음. 초기 mount 1회만 평가가 의도 맞음 | OK — 명세 추가 |
| C-7 | 합계 배지 동작 명세 부족 | `expectedTotal === 0`이면 `matched=true` → rose 경고 안 뜸. 사용자가 합계 0/0이 매칭됐다고 오해 가능 | 평가액 0 시 "(평가액 미입력)" 회색 배지 명시 |
| C-8 | 테스트 경로 추정 | 실제 구조: `__tests__/components/calc/inheritance/*.test.tsx`. 협의분할은 `__tests__/tax-engine/inheritance-gift/asset-heir-allocation-anchor.test.ts` 존재 | anchor 위치 정정 |
| C-9 | Issue 1 해법 재검토 | 사용자 진술 "평가금액이 입력되어야 협의분할이 체크가능" — 현행 `eff > 0` 가드가 자동 ON 차단. 평가액 0이어도 클릭은 됨 | **사용자 진짜 의도 = "한 화면에서 평가액과 협의분할 둘 다 입력하고 싶음"** → Issue 1 해법을 "패널 안에 평가액 입력 안내+포커스" 추가로 보강 |
| C-10 | "기준시가만 디폴트 노출" Issue 3 | 실제 부동산 평가 우선순위는 시가 > 감정가 > 기준시가 (상증법 §60①). 기본 노출을 기준시가 단독으로 하면 사용자가 시가/감정가 입력 경로를 인지 못 함 | advanced 토글의 카드 description에 "시가·감정가가 있는 경우 우선 적용됩니다" 명시 + 시각적 안내 강화 |

---

## Issue 1 — 평가액 입력 전이라도 협의분할 토글 활성화 (정정판)

### 현행 동작 (실측)

1. **칩 (chip-config.ts)**: disabled 필드 없음. 평가액 0이어도 칩 클릭 가능
2. **칩 클릭 핸들러 (handleChipClick.ts:84-100)**:
   - `willOpen && heirAllocations === undefined && heirs && hasDistributableHeir(heirs) && eff > 0` 모두 만족 시에만 `buildInitialHeirAllocations` 호출
   - **평가액 0이면 자동 ON 안 함**. 단순 펼침만
3. **펼침 패널 (HeirAllocationToggleSection.tsx:41)**: `isDisabled = !canDistribute || effectiveValuation === 0`
   - 평가액 0이면 ToggleCard 자체가 disabled → 사용자가 토글 못 켬

### 사용자 진짜 의도

> "평가금액이 입력되어야 협의분할이 체크가능한데, 금액을 입력하고 다시 위로 올라가서 체크하는 것이 불편"

→ 카드 본체(스크롤 아래)의 평가액 입력 ↔ 카드 상단 칩의 협의분할이 분리되어 있어 왕복 스크롤.

### 변경

**A. ToggleCard 활성 조건 완화** (`HeirAllocationToggleSection.tsx`):

```ts
// before
const isDisabled = !canDistribute || effectiveValuation === 0;
const disabledReason = !canDistribute
  ? "Step 0에서 상속인·수유자(자연인)를 먼저 등록하세요"
  : "평가액을 먼저 입력하세요";

// after
const isDisabled = !canDistribute;
const disabledReason = "Step 0에서 상속인·수유자(자연인)를 먼저 등록하세요";
```

**B. handleChipClick 자동 ON 가드 완화** (`handleChipClick.ts:89`):

```ts
// before
if (hasDistributableHeir(heirs) && eff > 0) {

// after
if (hasDistributableHeir(heirs)) {
  // eff 0이면 첫 상속인 amount: 0으로 1행 생성 → Issue 2 잔여 자동 채움이 후속 보충
```

**C. 패널 안 평가액 미입력 안내 + 합계 배지** (`HeirAllocationInput.tsx`):

- 현행: `expectedTotal === 0`이면 `matched=true`로 평가 → 배지 비표시 (line 82)
- 변경: `hasInput && expectedTotal === 0`이면 회색 배지 `(평가액 미입력 — 카드 본체에서 시가·감정가·기준시가 입력)` 표시
- `expectedTotal > 0`이면 현행대로 emerald(matched) 또는 rose(mismatch)

**D. chip-config 변경 0**: 칩 라벨은 현행대로 (`allocations.length === 0`이면 "협의분할 (미입력)" amber).

### Acceptance (수정)

- AC-1: heirs 1명 등록 + 평가액 0 상태에서 협의분할 칩 클릭 → 칩 펼침 + ToggleCard 활성 + 자동 ON되어 첫 상속인 1행(금액 0) + "(평가액 미입력)" 회색 안내
- AC-2: 같은 상태에서 카드 본체 시가 입력 후(다시 위로 스크롤 불요) — 사이드바·합계가 즉시 갱신, 칩 라벨 "협의분할" sky로 자동 전환
- AC-3: 평가액 입력 → 합계 ≠ 평가액 → rose 경고로 자연스럽게 가이드 (사용자가 amount input 수정)
- AC-4 (out of scope 검토): 평가액=0 + 칩 패널 펼침 + Issue 2 잔여 자동 채움 → 시가 후속 입력 시 자동 보충하지 **않음**(자동 안분 정책). 사용자가 amount input 수정 또는 "단독 상속 자동 입력" 버튼 사용

---

## Issue 2 — 협의분할 추가 상속인 amount 자동 채움 (잔여 분배)

### 현행

`HeirAllocationInput.tsx:88-96` `toggleHeir` 추가 분기:

```ts
} else {
  onChange([...allocs, { heirId: heir.id, amount: 0 }]);
}
```

→ 토글 ON 후 배우자 자동 채움 → 사용자가 배우자 해제 → 자녀 추가 시 자녀 amount=0.

### 변경

```ts
} else {
  const currentSum = allocs.reduce((s, a) => s + a.amount, 0);
  const remaining = Math.max(0, expectedTotal - currentSum);
  onChange([...allocs, { heirId: heir.id, amount: remaining }]);
}
```

### 자동 안분 정책과의 관계 (정책 점검)

[[feedback_no_silent_apportion_fallback]] — 자동 안분 fallback 금지. 사용자 미입력 필드에 엔진/UI가 임의 안분 금지.

본 변경은 **사용자 명시 액션(토글 칩 클릭) 시 즉시 단발 채움**. 다음 모두 충족:

1. 사용자 의도 명확 (체크박스 클릭 = 분배 대상에 추가)
2. 결과가 폼 데이터에 그대로 노출 (CurrencyInput value로 즉시 수정 가능)
3. 엔진이 미입력값을 silent 채우는 케이스 없음 (toggleHeir는 UI 핸들러)
4. `buildInitialHeirAllocations`(토글 ON 진입)와 동일한 패턴

→ 정책 위반 아님. 다만 코드 주석으로 명시 필요.

### DebtAllocationInput·PresumedInheritanceInput 영향

두 컴포넌트 모두 `HeirAllocationInput`을 재사용 → 같은 동작 적용. 채무 분할에서도:

- 사용자가 채무 1건의 협의분할 칩 클릭 → 잔여 자동 (자연스러움)
- 정책상 채무도 "법정 안분" 기본 → 사용자가 명시 ON한 시점에는 동일하게 잔여 분배 합리적

→ 동일 동작 유지. 별도 분기 불요.

### Acceptance

- AC-5: heirs=[배우자, 장남, 차남], expectedTotal=300,000,000, 토글 ON → 배우자에게 300,000,000
- AC-6: 배우자 해제 → allocs=[], 장남 토글 ON → 장남 300,000,000
- AC-7: 장남 유지, 차남 토글 ON → 차남 0 (잔여 0). 장남 200,000,000 수정 후 차남 다시 ON → 차남 100,000,000
- AC-8: 자동 채움 후 input 클릭 → SelectOnFocusProvider로 전체 선택, 즉시 덮어쓰기
- AC-9: expectedTotal=0 + 토글 ON + 추가 상속인 → amount=0 (Math.max 가드)

### 회귀 주의

- `buildInitialHeirAllocations`(토글 ON 진입)와 `toggleHeir`(개별 칩 추가) 동작이 동일 의도(잔여 분배)로 정렬
- DebtAllocationInput·PresumedInheritanceInput·HeirAllocationToggleSection 3개 사용처 동일 동작

---

## Issue 3 — 부동산 본체 입력 옵션 항목 토글 숨김 (정정판)

### 현행

`EstateBodyRealEstate.tsx`는 7개 FieldCard 항상 노출:

1. 소재지 검색 (필수)
2. 별칭 (선택)
3. 평가 우선순위 안내 (`PRIORITY_HINT`)
4. 시가 (옵션)
5. 감정평가액 (옵션)
6. 기준시가 (보충적 평가)
7. 임대보증금 (옵션, apartment·building만)
8. 저당권 (옵션)
9. (외곽) §14 자동공제 ToggleCard — `showCollateralDeductToggle` prop이 true이고 `mortgageAmount > 0`일 때

대부분 케이스는 6번만 입력. 4·5·7·8은 특수 케이스.

### 변경 — advanced 토글 묶음

**기본 노출(상시)**:
- 소재지·별칭·우선순위 안내 — 유지
- **기준시가** (6번) — 유지

**ToggleCard tone="amber" `title="시가·감정가·임대보증금·저당권 입력"`** (기준시가 카드 바로 아래):

```tsx
<ToggleCard
  tone="amber"
  title="시가·감정가·임대보증금·저당권 입력"
  description="해당 사항이 있는 경우에만 ON — 시가·감정가가 있으면 기준시가보다 우선 적용됩니다 (상증법 §60①)"
  checked={advancedOpen}
  onCheckedChange={setAdvancedOpen}
>
  <시가 FieldCard />
  <감정평가액 FieldCard />
  {showLeaseDeposit && <임대보증금 FieldCard />}
  <저당권 FieldCard />

  {/* §14 자동공제도 advanced 내부로 이동 — 저당권 입력 근접 [C-5] */}
  {showCollateralDeductToggle && (
    <ToggleCard tone="amber" size="sm" title="이 담보채무를 §14 부채로 자동 공제" ... />
  )}
</ToggleCard>
```

### 자동 ON (데이터 보존)

```tsx
const hasAdvancedValue =
  (item.marketValue ?? 0) > 0 ||
  (item.appraisedValue ?? 0) > 0 ||
  (item.leaseDeposit ?? 0) > 0 ||
  (item.mortgageAmount ?? 0) > 0;
const [advancedOpen, setAdvancedOpen] = useState(hasAdvancedValue);
```

- variant local state (`addrValue`·`standardPricePerSqm`와 동일 패턴) [C-6]
- Shell collapse는 outer hidden — EstateBody는 unmount 안 됨, mount 1회만 평가가 의도 맞음
- 사용자가 카드 펼쳐 advanced ON → 시가 입력 → advanced OFF로 닫음 → store의 marketValue 유지

### 토글 OFF 시 데이터 처리

**비파괴**: 토글 OFF 시 store 값 유지(숨김만). 다시 ON 시 그대로 노출.

- [[feedback_three_state_optional_mode_toggle]] 3-state 정책과 충돌 없음 — 본 토글은 가시성-only, 데이터 형태(`number | undefined`) 변화 0
- `useEffect → store` 미러링 0 — onChange 이벤트만 사용

### EstateBodyDeposit 영향 검토 [C-4]

`EstateBodyDeposit.tsx`는 본체 입력 1필드(임대보증금)만. advanced 토글 불요. **변경 없음**.

### Acceptance

- AC-10: 부동산 카드 신규 추가(빈 값) → advanced OFF, 4·5·7·8 비노출, 카드 컴팩트
- AC-11: advanced 토글 ON → 4개 FieldCard 펼침
- AC-12: 시가 1,000,000 입력 → advanced OFF 클릭 → store의 marketValue 유지 (재 ON 시 그대로)
- AC-13: 시가 입력된 자산 카드 재 mount → advanced 자동 ON
- AC-14: `cat === apartment | building`에서만 임대보증금 표시 (`showLeaseDeposit` 현행 유지)
- AC-15: 저당권 입력 → 같은 advanced 내부에 §14 자동공제 ToggleCard 표시 [C-5]
- AC-16: 저당권 입력 + advanced OFF → §14 자동공제 토글도 함께 숨김 (외곽 표시 0 — 사용자 혼란 차단)

### §14 자동공제 결과 영향 검토 [C-5]

- `deriveCollateralDebts`는 `mortgageAmount + leaseDeposit + deductSecuredClaimAsDebt` 기준으로 5곳에서 사용 (engine·store·suggest·validate·steps)
- advanced OFF로 입력란 숨겨도 store 값 유지 → `deriveCollateralDebts` 결과 영향 0 (의도)
- 사용자가 advanced OFF 상태에서 §14 공제가 결과에 반영된 걸 보고 혼란할 수 있음 → 결과 카드 산식에 이미 "담보채권액 §14 공제"가 명시되어 있어 추적 가능 (현행 결과 카드 변경 불요)

---

## Definition of Done — 14개 동기화 지점

엔진 input·result 변경 **없음** (UI 가시성·UI 핸들러 전용).

| # | 지점 | 변경 | 비고 |
|---|---|---|---|
| ① | FormData/AssetForm | — | heirAllocations·marketValue·appraisedValue·leaseDeposit·mortgageAmount 기존 필드만 사용 |
| ② | initial value | — | — |
| ③ | normalize | — | — |
| ④ | API 변환 | — | — |
| ⑤ | UI 입력 위젯 | ✅ | HeirAllocationToggleSection·HeirAllocationInput·handleChipClick·EstateBodyRealEstate |
| ⑥ | 사이드바 합계 | — | — |
| ⑦ | 결과 카드 산식 | — | — |
| ⑧ | Validation | — | (검토) `inheritance-validate.ts`에 heirAllocations 합계 검증 있는지 확인 → expectedTotal=0 케이스도 동일 통과(현행 유지) |
| ⑨~⑭ | API/Zod/Route | — | — |

---

## Pre-Do anchor (2건)

### 1. `__tests__/components/calc/inheritance/heir-allocation-zero-valuation.test.tsx` (신규, Issue 1·2)

- AC-1: 평가액 0 + heirs=[배우자] + 칩 클릭 → ToggleCard 활성 + heirAllocations=[{spouse, 0}]
- AC-5: 평가액 300M + 토글 ON → 배우자 amount=300M
- AC-7: 평가액 300M + 장남 200M + 차남 추가 → 차남 amount=100M
- AC-9: 평가액 0 + 추가 → amount=0 (음수 가드)

### 2. `__tests__/components/calc/inheritance/estate-body-realestate-advanced.test.tsx` (신규, Issue 3)

- AC-10: 빈 자산 카드 → 시가/감정가/저당권 input 미노출
- AC-11: advanced ON → 4개 input 노출
- AC-13: marketValue=1000 사전 세팅 → 자동 ON
- AC-15: mortgageAmount=500 → §14 자동공제 토글 advanced 내부에 표시

anchor 실패 시 즉시 환류, 디자인 수정.

---

## QA 체크리스트

- [ ] `npx tsc --noEmit` 0건
- [ ] `npm run test:inheritance` 회귀 0건
- [ ] HeirAllocationInput 사용처 3개 영향 검증:
  - `HeirAllocationToggleSection` (자산 카드 협의분할)
  - `DebtAllocationInput` (채무 분할)
  - `PresumedInheritanceInput` (간주상속 분할)
- [ ] e2e: 평가액 0 → 협의분할 칩 → 패널 펼침 + 안내 → 평가액 입력 → 칩 라벨 자동 전환
- [ ] e2e: 부동산 카드 → advanced 토글 ON/OFF → 데이터 보존 확인
- [ ] CLAUDE.md `feedback_useeffect_store_mirror_forbidden` — useEffect store 동기화 0건 확인
- [ ] CLAUDE.md `feedback_no_silent_apportion_fallback` — 자동 분배는 사용자 명시 액션(토글 칩 클릭) 시점만, 엔진 silent fallback 0건
- [ ] CLAUDE.md `feedback_three_state_optional_mode_toggle` — advanced 토글은 가시성-only, 데이터 형태 변화 0
- [ ] 브라우저 수동 확인 + Playwright e2e 작성([[feedback_browser_verify_with_playwright]])

---

## Out of scope

- 자산 카드 collapse/expand 구조 (EstateChipInlineExpand 현행 유지)
- 협의분할 칩 시각 디자인 (chip-config 변경 0)
- 부동산 외 variant (Simple·Deposit) — 본체 항목이 적어 advanced 토글 불요
- 평가액 입력의 카드 상단 이동 (큰 구조 변경 — 별도 plan)

---

## 11단계 검토 보고서 — 5 카테고리/4 우선순위 매트릭스

| 카테고리 | 발견 건수 | 정정 반영 | 우선순위 분포 |
|---|---|---|---|
| 단정 오류 | 4 (C-1·C-2·C-9·C-10) | ✅ v2에 반영 | 🔴 2 🟡 2 |
| 누락 | 3 (C-4·C-5·C-7) | ✅ v2에 반영 | 🔴 1 🟡 2 |
| 정책 모순 | 1 (C-3) | ✅ 정당화 명세 | 🟡 1 |
| 추정 경로 | 1 (C-8 테스트 위치) | ✅ 정정 | 🟢 1 |
| 결정 회피 | 1 (C-5 §14 위치) | ✅ "advanced 내부" 결정 | 🔴 1 |

**🔴 Critical 4건 모두 v2에 정정 반영**. 🟡 4건 정책/명세 추가. 🟢 1건 경로 정정.

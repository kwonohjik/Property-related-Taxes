# 자산 카드 3개 토글 자동 노출 — UI 디자인 명세

> **계획서**: [`docs/00-pm/asset-toggle-auto-visibility.plan.md`](../../00-pm/asset-toggle-auto-visibility.plan.md)
> **대상**: `components/calc/PropertyValuationForm.tsx`(ItemEditor) + `StockValuationForm.tsx` + `DeemedCategorySection.tsx`
> **작성일**: 2026-05-22

---

## 1. 사용자 시나리오

### S1. 토지 자산 추가 (가장 흔한 시나리오)
1. "+ 상속재산 추가" → 일반 상속재산 → 🏔 토지 선택
2. 자산 카드 펼침:
   - DeemedCategorySection (퇴직금 옵션 자동 숨김)
   - FarmingCategorySection (기본 노출)
   - FamilyBusinessCategorySection (기본 노출)
   - **▼ 더 많은 적용 옵션 보기 (1)** ← 펼침 링크 (§22만 hidden_exp)
3. 사용자 펼침 클릭 → FinancialDeductionChip 노출 + sky 안내 배지 "ⓘ 부동산은 §22 금융재산공제 원칙적 미적용"

### S2. 현금 자산 추가
1. "+ 상속재산 추가" → 일반 상속재산 → 💵 현금 선택
2. 자산 카드:
   - DeemedCategorySection (4 옵션 모두 노출)
   - **펼침 링크 없음** (3개 토글 모두 hidden_permanent)
3. 사용자에게 "현금은 어떤 공제도 적용 불가" 신호 — 잘못 선택했다면 자산 삭제

### S3. 신탁재산 + 부동산 (동적 분기)
1. "+ 상속재산 추가" → **신탁재산 (§9)** → 🏔 토지 선택 (1단계 필터링은 7개 모두 노출 — `DEEMED_ALLOWED_CATEGORIES.trust`)
2. ItemEditor에서 `deemedCategory="trust"` prefilled
3. **trust override 발동** → §22 토글이 `hidden_exp`에서 `default`로 동적 승격
   - 영농: hidden_perm (회귀 0 — 본질 미적용 유지)
   - 가업: hidden_exp (펼침 카운트 +1)
   - §22: **default** (trust override) — 토글은 노출, 기본 OFF (trustType 미선택)
4. trustType 라디오에서 "금전신탁" 선택 → §22 토글 자동 ON (`resolveFinancialEligibility` 우선순위 2)

### S4. 기존 입력 자산 — 회귀 시나리오
1. sessionStorage에 `item.farmingCategory="rice_paddy"` 저장된 cash 자산 (legacy)
2. ItemEditor 진입 → 활성 우선 정책으로 farming `hidden_perm` → `default` 승격
3. 사용자가 OFF 해제 시 → 다음 렌더에서 `hidden_perm` 적용 (회귀 0)

### S5. 펼침 후 ON 입력
1. 토지 자산에서 펼침 → §22 토글 노출 → 사용자가 ON 체크
2. `setShowExpanded(true)` 유지 + `isFinancialOverride=true`
3. 자산 카드 다시 접었다 펼침 → 펼침 상태 유지 (state) + ON 유지

---

## 2. 컴포넌트 트리

```
ItemEditor (PropertyValuationForm 내부 function — 기존 line 318~ 영역)
├ AssetHeader (카테고리 아이콘·라벨·삭제 버튼) — 기존
├ 평가 입력 영역 — 기존 (카테고리별 분기)
│   ├ real_estate_*: AddressSearch + StandardPriceInput + marketValue·appraisedValue (CurrencyInput)
│   ├ cash·financial·other: name + amount (CurrencyInput)
│   └ deposit: leaseDeposit (CurrencyInput)
├ EstimatedValuePreview — 기존
├ DeemedCategorySection — ★ 수정
│   ├ props.item, props.onUpdate (기존)
│   ├ props.retirementOptionVisibility={visibility.deemedRetirementOption} ← 신규
│   └ "retirement" 옵션 조건부 필터링
├ {visibility.farming === "default"} → FarmingCategorySection — 기존, 조건 추가
├ {visibility.familyBusiness === "default"} → FamilyBusinessCategorySection — 기존, 조건 추가
├ CorporateNonBusinessAssetsSection — 기존 (corporate_stock 자산만)
├ {visibility.financialDeduction === "default"} → FinancialDeductionChip — 기존, 조건 추가
├ ★ 신규: <ExpandableToggleArea
│     visibility={visibility}
│     item={item}
│     onUpdate={onUpdate}
│     showExpanded={showExpanded}
│     onToggle={setShowExpanded}
│   />
│   ├ 펼침 링크 (hiddenExpandableCount > 0일 때만 노출)
│   └ 펼침 영역:
│       ├ {visibility.farming === "hidden_expandable"} → 안내 배지 + FarmingCategorySection
│       ├ {visibility.familyBusiness === "hidden_expandable"} → 안내 배지 + FamilyBusinessCategorySection
│       └ {visibility.financialDeduction === "hidden_expandable"} → 안내 배지(사유 분기) + FinancialDeductionChip
└ HeirAllocationToggleSection — 기존 (협의분할)
```

`ExpandableToggleArea`는 800줄 정책 트리거 시 별도 파일 분리 권장 (`components/calc/inheritance/ExpandableToggleArea.tsx`). 그 외에는 ItemEditor 내 inline 렌더.

**ItemEditor 카테고리 변경 가능 여부** (코드 검증 결과 — 2026-05-22):
- 현재 ItemEditor는 카테고리 변경 UI 없음 (자산 추가 시 결정, 변경 불가). 카테고리 잘못 선택 시 삭제 후 재추가.
- 따라서 §7 "카테고리 변경" 엣지 케이스는 sessionStorage migration 시나리오에 한정.

---

## 3. 시각 디자인

### 3-1. 펼침 링크

| 상태 | 디자인 |
|---|---|
| 접힘 (default) | `▼ 더 많은 적용 옵션 보기 ({N}개)` <br> `text-xs text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-300` |
| 펼침 | `▲ 적용 옵션 접기` <br> 동일 스타일 |
| N=0 | 미노출 (DOM 자체 없음) |

배치: ItemEditor 카드 하단 (협의분할 위, 결과 미리보기 아래). 좌측 정렬, padding `py-2`.

### 3-2. 안내 배지 (펼침 시 토글 상단)

`feedback_section_card_numbering` 컬러 가이드 적용. **현 매트릭스에서 hidden_expandable 발생 케이스만 명시** (영농은 hidden_expandable 케이스 없음 — 모두 default 또는 hidden_permanent).

| 토글 | hidden_exp 카테고리 | tone | 안내 문구 |
|---|---|---|---|
| FamilyBusinessCategorySection | `real_estate_apartment` | `amber` | `ⓘ 주거용 아파트는 §15⑤2호 나목 사업무관자산 원칙. 단, 임대법인 보유 + 임직원 5년 이상 무상임대(국민주택 또는 기준시가 6억 이하)는 사업용 인정 가능` |
| FamilyBusinessCategorySection | `financial` | `amber` | `ⓘ §15⑤2호 마목 "영업활동과 직접 관련 없는" 주식·채권·금융상품은 사업무관자산. 영업관련 운영자금 등은 사용자 override 가능` |
| FinancialDeductionChip | `real_estate_*` | `emerald` | `ⓘ 부동산은 §19① 미열거 — 원칙적 §22 미적용 (단, 부동산신탁 → 금전신탁 전환분은 §19① 적용)` |
| FinancialDeductionChip | `deposit` | `emerald` | `ⓘ §19① "금융회사등이 취급" 한정 — 전세보증금 사인간 직접채권 미열거 (해석례 따라 사용자 override 가능)` |
| FinancialDeductionChip | `other` | `emerald` | `ⓘ §19① 열거 항목(예금·신탁·보험금·주식·채권 등) 해당 여부 확인 후 토글` |

**영농 토글**: 매트릭스상 hidden_expandable 케이스 0 — 안내 배지 노출 시점 없음. (미래 정책 변경 시 sky tone 적용 예약)

**구조 — 정적 tone 매핑 강제** (memory `feedback_tailwind_static_tone_mapping` 준수, 동적 클래스 금지):

```typescript
const HINT_TONE_CLASSES: Record<"sky" | "amber" | "emerald", {
  container: string;
  text: string;
}> = {
  sky:     { container: "rounded-md border border-sky-200 bg-sky-50/40 dark:bg-sky-950/20 dark:border-sky-800 p-2 mb-1",     text: "text-[11px] text-sky-800 dark:text-sky-200" },
  amber:   { container: "rounded-md border border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-800 p-2 mb-1", text: "text-[11px] text-amber-800 dark:text-amber-200" },
  emerald: { container: "rounded-md border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-800 p-2 mb-1", text: "text-[11px] text-emerald-800 dark:text-emerald-200" },
};
```

사용:
```tsx
<div className={HINT_TONE_CLASSES[tone].container} role="note">
  <span className={HINT_TONE_CLASSES[tone].text}>ⓘ {hintText}</span>
</div>
<FarmingCategorySection item={item} onUpdate={onUpdate} />
```

### 3-3. DeemedCategorySection 라디오 필터링

- `retirementOptionVisibility === "hidden"` 시 4번째 옵션 "퇴직금 등 (§10)" 라디오 자체 미렌더
- DOM 차감으로 가로 3-칸 그리드 자동 재배치
- **활성 우선 정책**: 이미 `item.deemedCategory === "retirement"` 상태에서 resolver는 자동으로 `visible` 반환 (§3-1 우선순위 1) → 옵션 유지
- 발동 시나리오 (`retirementOptionVisibility === "visible"` + `category === real_estate_*`): sessionStorage migration된 legacy 자산 또는 자산 추가 패널 1단계에서 퇴직금 prefilled로 부동산 선택 (인터뷰 결정 4의 잘못된 입력 케이스)
- 이때 amber 배지 노출: `⚠️ 부동산 카테고리에 §10 퇴직금 선택 — 분류 재확인 권장 (§10 퇴직금은 본질상 금전 수령권)`

---

## 4. 14개 동기화 지점 (해당 항목)

| # | 지점 | 적용 여부 | 처리 |
|---|---|:---:|---|
| ① | FormData 타입 | — | 신규 폼 필드 없음 |
| ② | initial value | — | — |
| ③ | normalize fallback | — | — |
| ④ | API 변환 | — | 엔진 input 무변경 |
| ⑤ | UI 입력 위젯 | ✅ | ItemEditor visibility 분기 + 펼침 state |
| ⑥ | 사이드바 합계 | — | — |
| ⑦ | 결과 카드 산식 | — | 엔진 result 무변경 |
| ⑧ | Validation | — | 엔진 validate 무변경 |
| ⑨~⑭ | Zod·Route | — | 엔진 무변경 |

**동기화 부담 최소**: UI ⑤만 신규, 엔진·API·validate 무변경. 회귀 위험 극소.

추가 신규 지점 (UI 정책 모듈):
| #' | 지점 | 위치 |
|---|---|---|
| U1 | 정책 함수 | `lib/calc/asset-toggle-visibility.ts` |
| U2 | DeemedCategorySection prop | `retirementOptionVisibility` |
| U3 | PropertyValuationForm/ItemEditor visibility 분기 | 4 토글 × 3-state |
| U4 | StockValuationForm 동일 패턴 | 주식 폼 카드 |
| U5 | 단위 테스트 | `__tests__/calc/asset-toggle-visibility.test.ts` 48 anchor |

---

## 5. 접근성 (a11y)

- 펼침 링크 `<button aria-expanded={showExpanded} aria-controls="expandable-toggles-{itemId}">`
- 펼침 영역 `<div id="expandable-toggles-{itemId}">`
- 안내 배지 `role="note"` (screen reader가 ⓘ 정보임을 인식)
- 활성 우선 정책 안내 배지(retirement amber 등) `role="alert"` (변경 직후만)

---

## 6. 다크모드

| 요소 | Light | Dark |
|---|---|---|
| 펼침 링크 | `text-gray-500 hover:text-indigo-600` | `text-gray-400 hover:text-indigo-300` |
| 안내 배지 sky | `bg-sky-50/40 text-sky-800 border-sky-200` | `bg-sky-950/20 text-sky-200 border-sky-800` |
| 안내 배지 amber | `bg-amber-50/40 text-amber-800 border-amber-200` | `bg-amber-950/20 text-amber-200 border-amber-800` |
| 안내 배지 emerald | `bg-emerald-50/40 text-emerald-800 border-emerald-200` | `bg-emerald-950/20 text-emerald-200 border-emerald-800` |

memory `feedback_tailwind_static_tone_mapping` 적용 — 정적 클래스 매핑 객체.

---

## 7. 엣지 케이스

| 케이스 | 동작 |
|---|---|
| 자산 카테고리는 추가 시 결정·변경 불가 (코드 검증 — 2026-05-22) | 카테고리 변경 엣지 없음. 사용자는 자산 삭제 후 재추가 |
| sessionStorage migration: 기존 ON 자산 | 활성 우선 정책 자동 `default` 승격 (회귀 0). hidden_permanent도 무력화 |
| 신탁 trust + trustType 미선택 | §22 toggle 노출 + 기본 OFF + 기존 DeemedCategorySection amber 배지 "신탁 유형 미선택" 활용 |
| 신탁 trust + cash_trust | §22 toggle 노출 + 기본 ON (`resolveFinancialEligibility` 우선순위 2) |
| 신탁 trust + real_estate | §22 toggle 노출 + 기본 OFF (사용자 override 가능, emerald 안내 배지) |
| 펼침 후 ON 입력 → 자산 추가 다음 | 활성 토글은 다음 진입 시도 `default` 자동 노출 보장 (활성 우선 정책) |
| deemedCategory 변경 (일반 → 보험금/신탁/퇴직금) | resolver 재계산 → trust override 재평가, 활성 우선 정책으로 retirement 옵션 visible 유지. 펼침 state는 ItemEditor 라이프사이클 유지 (자산 ID 동일) |
| deemedCategory 변경 (퇴직금 → 일반) + 부동산 카테고리 | retirementOptionVisibility는 `hidden`이지만 활성 우선 무력화 해제. **단, deemedCategory를 일반으로 변경한 시점에 retirement 선택값은 이미 undefined** — 자동으로 hidden 반영. 회귀 0 |
| corporate_stock 자산 + deemedCategory="retirement" | 활성 우선으로 retirement 옵션 visible 강제. CorporateNonBusinessAssetsSection도 정상 노출 |

---

## 8. 단위 테스트 anchor (48개)

### 8-1. 기본 매트릭스 (36 = 9 카테고리 × 4 dimension)

각 카테고리에 대해 `farming` / `familyBusiness` / `financialDeduction` / `deemedRetirementOption` 4-tuple 검증.

```typescript
describe("resolveAssetToggleVisibility", () => {
  test.each([
    ["real_estate_land",      "default",     "default",     "hidden_expandable", "hidden"],
    ["real_estate_building",  "default",     "default",     "hidden_expandable", "hidden"],
    ["real_estate_apartment", "hidden_permanent", "hidden_expandable", "hidden_expandable", "hidden"],
    ["cash",                  "hidden_permanent", "hidden_permanent", "hidden_permanent", "visible"],
    ["financial",             "hidden_permanent", "hidden_expandable", "default",     "visible"],
    ["deposit",               "hidden_permanent", "hidden_permanent", "hidden_expandable", "visible"],
    ["listed_stock",          "default",     "default",     "default",     "visible"],
    ["unlisted_stock",        "default",     "default",     "default",     "visible"],
    ["other",                 "default",     "default",     "hidden_expandable", "visible"],
  ])("%s 카테고리 기본 매트릭스", (cat, farming, fb, fin, ret) => {
    const result = resolveAssetToggleVisibility({ id: "x", category: cat, name: "" });
    expect(result).toEqual({ farming, familyBusiness: fb, financialDeduction: fin, deemedRetirementOption: ret });
  });
});
```

### 8-2. 활성 우선 override (8)
- cash + farmingCategory="rice_paddy" → farming `default` 승격
- cash + familyBusinessCategory="business_land" → familyBusiness `default` 승격
- cash + isFinancialAssetForDeduction=true → financialDeduction `default` 승격
- real_estate_apartment + farmingCategory="rice_paddy" → farming `default` 승격 (hidden_perm 무력화)
- real_estate_land + deemedCategory="retirement" → deemedRetirementOption `visible` 승격
- financial + familyBusinessCategory="business_land" → familyBusiness `default` 승격
- deposit + isFinancialAssetForDeduction=true → financialDeduction `default` (기존 코드 default true와 일관)
- other + farmingCategory="fishery" → farming `default` 유지

### 8-3. 신탁 override (4)
- cash + deemedCategory="trust" + trustType=undefined → financialDeduction `default` (override) + 기본 OFF
- cash + deemedCategory="trust" + trustType="cash_trust" → financialDeduction `default` + 기본 ON
- real_estate_apartment + deemedCategory="trust" + trustType="real_estate" → financialDeduction `default` (override) + 기본 OFF
- real_estate_land + deemedCategory="trust" + trustType="cash_trust" → financialDeduction `default` + 기본 ON

---

## 9. Plan ↔ Design 일관성 점검 (10단계 통합 비교 — 2026-05-22)

| 계획서 위치 | 디자인 위치 | 일치 |
|---|---|---|
| §1-1 영농 `real_estate_apartment` hidden_perm | §8-1 row 3 col 2 | ✅ |
| §1-1 영농 `financial` hidden_perm | §8-1 row 5 col 2 | ✅ |
| §1-2 가업 `financial` hidden_exp (재정정) | §8-1 row 5 col 3 | ✅ |
| §1-2 가업 `real_estate_apartment` hidden_exp + 안내 강화 | §3-2 amber 행 1 + §8-1 row 3 col 3 | ✅ |
| §1-3 §22 `deposit` hidden_exp (재정정) | §3-2 emerald 행 2 + §8-1 row 6 col 4 | ✅ |
| §1-3 §22 `real_estate_*` hidden_exp | §3-2 emerald 행 1 + §8-1 row 1·2·3 col 4 | ✅ |
| §1-3 §22 `other` hidden_exp | §3-2 emerald 행 3 + §8-1 row 9 col 4 | ✅ |
| §1-4 부동산 §10 hidden(라디오) | §3-3 + §8-1 col 5 | ✅ |
| §3-1 우선순위 1 활성 우선 (hidden_perm 무력화) | §1 S4·§7·§8-2 | ✅ |
| §3-1 우선순위 2 trust override (모든 카테고리) | §1 S3·§7·§8-3 | ✅ |
| §3-1 + §1-3 보충 trust override 매트릭스 | §8-3 4 anchor | ✅ |
| §4 ⑤ 48 anchor (9 × 4 + 동적 4 + 활성 8) | §8-1 9행 + §8-2 8 + §8-3 4 | ✅ |
| §5 4(+1) 커밋 분할 | §10 5단계 | ✅ |
| §7-1 #1 deposit default 후속 분리 | §3-2 emerald 행 2 "해석례 따라 사용자 override 가능" | ✅ |
| §7-1 #4 §15⑤2호 임직원 무상임대 단서 | §3-2 amber 행 1 안내 문구 인용 | ✅ |
| 인터뷰 결정 2 신탁 §22 항상 노출 | §3-1 우선순위 2 + §7 신탁 케이스 3행 | ✅ |
| 인터뷰 결정 3 현금 3개 모두 숨김 | §1 S2 + §8-1 row 4 | ✅ |
| 인터뷰 결정 4 부동산 §10 퇴직금 옵션만 숨김 | §3-3 + §8-1 col 5 row 1·2·3 | ✅ |

---

## 10. 작업 순서 (Do Phase)

1. **Commit 1**: `lib/calc/asset-toggle-visibility.ts` + `__tests__/calc/asset-toggle-visibility.test.ts` 48 anchor — 단독 통과
2. **Commit 2**: PropertyValuationForm ItemEditor visibility 분기 + 펼침 state + 안내 배지 (가장 큰 변경)
3. **Commit 3**: StockValuationForm 동일 패턴 (작은 변경)
4. **Commit 4**: DeemedCategorySection retirementOptionVisibility prop
5. **(선택) Commit 5**: ExpandableToggleArea 분리 (800줄 정책 트리거 시)

각 커밋 후 `npx tsc --noEmit` 0건 확인.

---

## 11. 브라우저 수동 확인 시나리오

- [ ] 토지 자산 추가 → 영농·가업 default 노출, §22 펼침 카운트 (1)
- [ ] 펼침 → §22 노출 + emerald 안내 배지
- [ ] 현금 자산 추가 → 펼침 링크 자체 미노출 (3개 모두 hidden_perm)
- [ ] 신탁재산 분류 + 토지 추가 → §22 default 노출, trustType 미선택 시 OFF
- [ ] trustType=cash_trust 선택 → §22 자동 ON
- [ ] DeemedCategorySection: 토지 자산은 퇴직금 옵션 라디오에서 자동 숨김
- [ ] 다크모드 토글 → 안내 배지 색상 적절

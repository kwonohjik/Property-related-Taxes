# 상속세 추가공제 estate 자동도출·자동채움 (v3) — UI 설계

> 계획서: [`../../00-pm/inheritance-additional-deduction-autofill-v3.plan.md`](../../00-pm/inheritance-additional-deduction-autofill-v3.plan.md)
> 엔진 설계: [`inheritance-additional-deduction-autofill-v3.engine.design.md`](inheritance-additional-deduction-autofill-v3.engine.design.md)
> 선행 v2(orphan): `inheritance-additional-deduction-autofill.ui.design.md`
> 정책: `[[mirror-pattern]]` · `[[feedback_store_default_vs_ui_display_fallback]]` · `[[feedback_select_on_focus]]` · `[[feedback_toggle_card_visibility]]`

## Context

Step4 5개 칸을 estate 자산 카드 데이터에서 **가시적으로 자동채움**(칸의 `value`에 도출값 표시, 편집 시 override). 동거주택은 자산 카드에 '동거주택' 체크박스 신설. 실제 렌더는 `steps.tsx` Step4(orphan `step4-5.tsx` 아님).

---

## 사용자 시나리오

| 시나리오 | 흐름 | UI 동작 |
|---|---|---|
| A. 동거주택 체크→자동채움 | 자산 카드(주택) → advanced 토글 → '동거주택' 체크 → Step4 | 동거주택 공시가격 칸에 그 주택 `standardPrice`(gross) 표시 + AutoSuggestBadge(산식·출처) |
| B. 동거 자녀 없음 | 상속인에 동거 자녀 없음 → 자산 카드 | '동거주택' ToggleCard `disabled` + 사유 |
| C. 영농 분류→자동채움 | 자산 카드 farmingCategory 지정 → Step4 | 영농상속재산가액 칸에 도출 합 표시 + 배지 |
| D. override | Step4 자동채움 칸에 직접 입력 | 사용자값 우선(store write) + 배지 "자동값으로 되돌리기" |
| E. 강제 배제 | 자동채움 칸에 `0` 입력 | 공제 0(엔진 ??0). 비우면 auto 재표시이므로 `0` 명시 |
| F. 복수 주택 | 주택 A '동거주택' 체크 후 B 체크 | A 자동 해제(단일선택) |

---

## UI 명세

### 1. 자산 카드 '동거주택' 체크박스 — `EstateBodyRealEstate.tsx`
- 위치: `RealEstateAdvancedFields` ToggleCard children 내부(§14 자동공제 아래, 214행 묶음).
- `ToggleCard` tone="violet"(거주·자격), title "동거주택 공제 대상 (§23의2)", `checked={item.isCohabitantHouse ?? false}`, `onCheckedChange={(v)=>onUpdate({...item, isCohabitantHouse: v || undefined})}`.
- `data-testid="cohabit-house-toggle-{item.id}"`.
- 노출 조건: 주택 카테고리(real_estate_apartment/building) + `hasCohabitantChild`.
- `disabled={!hasCohabitantChild}` + `disabledReason="상속인 구성에서 자녀 동거(isCohabitant) 여부 확인"`.

### 2. prop 배선 — `VariantBodyProps` / `ItemEditor` / `PropertyValuationForm`
- **`VariantBodyProps`(`variants/types.ts:12`)에 `hasCohabitantChild: boolean` 추가** (showCollateralDeductToggle와 동일 부모-계산 prop, **non-optional → 주입 누락 TS 감지**).
- 도출·주입 = **`ItemEditor`**(`PropertyValuationForm:132,144` heirs 보유): `const hasCohabitantChild = heirs?.some(h => h.relation==="child" && h.isCohabitant===true) ?? false` → VariantBody에 전달.
- **단일선택(상호배타)** = **`PropertyValuationForm`** `onUpdate` 인터셉트: 한 주택 isCohabitantHouse=true 설정 시 다른 주택 isCohabitantHouse 해제(items 배열 보유 레벨).

### 3. Step4 display fallback 자동채움 — `steps.tsx` Step4 (360-393)
- import: `useMemo`, `suggestSpouseActualAmount`·`suggestNetFinancialAssets`·`suggestFarmingAssetValue`·`deriveCohabitHouseStdPrice`, `AutoSuggestBadge`(`AutoSuggestBadge.tsx` 재사용).
- **도출값 prop 수령(3중 일치)**: `InheritanceTaxForm`이 `buildInput`에서 쓰는 `auto` 값을 `useMemo`로 끌어올려 Step4에 prop 전달(UI display = API autoOrManual = validate 동일 `auto`).
- 각 CurrencyInput: `value={form.x !== "" ? form.x : (auto > 0 ? String(auto) : "")}`, `onChange={(v)=>set({x:v})}`.
  - 동거주택 공시가격: `auto = derive.value`(**gross standardPrice**, E-1 — securedDebt 미차감). 차감은 엔진·결과카드.
- 위에 AutoSuggestBadge(reason·breakdown ▼·되돌리기). Phase E `cohabitDirectAmount`는 배지 없음(직접입력).
- 영농: `form.farming` 활성이어도 배지 표시(D3, 모드 무관). 배지 reason "자격자 분배 자동 산정".
- `data-testid` 각 칸 부여(E2E).

### 4. hint 정정 (E-2)
- 동거주택 공시가격 hint "공시가 **80%**, 최대 6억"은 **2020.1.1.~ 100% 개정 미반영**(엔진 `cohabitShareRate`는 deathDate 정확). → "공시가 100%(2020.1.1.~)·이전 80%, 최대 6억 — 담보채무 차감 후"로 정정.

### 5. orphan 처리
- `AutoSuggestBadge.tsx`(컴포넌트)는 재사용. **`step4-5.tsx`(orphan step)만 삭제**(이관 후).

---

## 14 동기화 지점 (UI측)

| # | 지점 | isCohabitantHouse | 5칸 자동채움 |
|---|---|---|---|
| ① 폼상태 | EstateItem(엔진 타입) | `shared.ts` FormState(42-50) 기존 string | — |
| ② initial | undefined | INITIAL_FORM(90-97) "" 기존 | — |
| ③ normalize | undefined fallback | 기존 | — |
| ④ API 변환 | estateItems spread 자동 | buildInput autoOrManual 2필드(cohabit·farming) + `cohabitSecuredDebt` 주입 | — |
| ⑤ UI 위젯 | EstateBodyRealEstate ToggleCard + ItemEditor 주입 | Step4 display fallback + AutoSuggestBadge | — |
| ⑥ 사이드바 | 영향 없음(공제는 결과 후 반영) | 영향 없음 | — |
| ⑦ 결과카드 | — | `CohabitDeductionDetailCard`(DeductionBreakdownSection:126)에 `detail.securedDebt`(191) 표시(담보채무 차감 노출) | — |
| ⑧ validate | 순수 플래그(검증 없음) | `form.x===""` & `auto>0`이면 통과(미입력 오류 차단 금지, 3중 fallback) | — |

---

## Silent fallback / 정책 정합

- display fallback은 `value` prop 표시만, store 불변 — `useEffect→store` 금지(`[[mirror-pattern]]`). `auto` 값은 단일 함수 호출 prop 공유(3중 일치).
- 동거주택 체크·farmingCategory 분류는 사용자 명시 액션 → 자동 안분 fallback 금지 위반 아님.
- `0` 입력 = 공제 포기(엔진 ??0). 비우기 ≠ 0(비우면 auto 재표시) — 시나리오 E.

---

## 테스트 약속 (UI/E2E)

- **Anchor C(E2E)**: `e2e/inheritance-cohabit-autofill.spec.ts` — 자산 카드 `cohabit-house-toggle-{id}` 체크 → Step4 동거주택 칸에 gross standardPrice 표시 + 편집 override + `0` 강제배제.
- 동거주택 칸 표시값 = **gross 공시가격**(E-1), 결과카드에 securedDebt 차감 노출.

---

## 엔진 위임

- `EstateItem.isCohabitantHouse`·`InheritanceDeductionInput.cohabitSecuredDebt` 타입, `deriveCohabitHouseStdPrice`(value=gross), `calcCohabitationDeduction` securedDebt 매개변수화, §19 mixed-allocation 수정은 engine.design.md.

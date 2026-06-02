# 상속세 — 추가 공제 입력란 estate 기반 자동도출·가시적 자동채움 (Plan v3)

> 작성일: 2026-06-02
> 선행: [`inheritance-additional-deduction-autofill.plan.md`](inheritance-additional-deduction-autofill.plan.md) (v2, 2026-05-21) — 자동채움 UI를 `step4-5.tsx`에 구현했으나 **해당 파일이 프로덕션 import 0건 orphan**으로 사장됨. v3는 이를 살아있는 `steps.tsx`로 이관하고, 사용자 요구(가시적 자동채움 + 동거주택/영농 estate 자동도출)를 반영해 재설계한다.
> 대상: `lib/tax-engine/types/inheritance-gift.types.ts` · `lib/calc/inheritance-deduction-suggest.ts` · `lib/tax-engine/deductions/inheritance-deductions.ts` · `lib/validators/property-valuation-input.ts` · `components/calc/InheritanceTaxForm.tsx` · `components/calc/inheritance/steps.tsx` · `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx` · `.../variants/types.ts`
> 정책: `[[mirror-pattern]]` · `[[feedback_store_default_vs_ui_display_fallback]]` · `[[feedback_no_silent_apportion_fallback]]` · `[[feedback_useeffect_store_mirror_forbidden]]` · `[[single-source-engine-helper]]` · `[[feedback_validation_sync_8th_point]]` · `[[korean-law-citation-verify]]`
> 작성 주체: `inheritance-gift-tax-senior` + `inheritance-gift-tax-ui-senior` 병렬 Plan → 오케스트레이터 reconcile

---

## 0. 배경 — 왜 이 작업인가

상속세 마법사 Step4 "추가 공제 입력 (선택)"의 5개 칸은 **대부분 사용자가 이미 자산 카드에 입력한 데이터에서 도출 가능**한데도 별도 수동 입력을 요구한다. 코드 추적 결과:

| 필드 | 현행 빈값 거동 | estate 자동도출 여부 |
|---|---|---|
| `spouseActualAmount` §19 | API `autoOrManual`로 협의분할 자동주입 → 없으면 엔진 법정상속분 | △ (협의분할 한정, mixed-allocation 갭 有) |
| `netFinancialAssets` §22 | API `autoOrManual`로 금융자산 자동주입 | ✅ 완전 |
| `cohabitHouseStdPrice` §23의2 | **undefined → 공제 0** (autoOrManual 미적용) | ❌ 없음 (자산 카드에 `standardPrice` 있는데 미연동) |
| `cohabitDirectAmount` Phase E | undefined → stdPrice 경로 폴백 | ❌ (요건 우회 escape hatch — 자동도출 대상 아님) |
| `farmingAssetValue` §18의3 | **undefined → 공제 0** (autoOrManual 미적용) | ❌ 없음 (`farmingCategory` 분류했는데 미연동) |

→ §19·§22는 이미 자동(단 UI에 안 보임), §23의2·§18의3은 **자동도출이 끊겨 있어** 비우면 침묵으로 공제 0. 가업상속공제(§18의2)가 `family-business.ts`(`deriveFamilyBusinessValue` 정의 127·사용 210, `finalValue = manualValue ?? autoDerivedValue` 212)에서 estate를 자동 합산하는 것과 **비대칭**(영농엔 그 대응물 부재). [R-4 실측]

**사용자 확정 요구**:
1. 5개 칸을 **estate 자산 카드 데이터에서 자동도출**해 더 이상 수동 재입력이 필요 없게 한다.
2. 칸을 **숨기지 않고**, 도출값을 **칸에 가시적으로 자동채움**(편집 시 override).
3. 동거주택은 **자산 카드에 '동거주택' 체크박스**를 추가해(이미 저장된 `standardPrice` 재사용), 체크만으로 §23의2에 자동 흐름.

---

## 1. 핵심 설계 결정 (확정 — reconcile 완료)

### D1. 자동채움 = **display fallback on `value` prop** (badge-클릭 아님)

칸의 `value`에 도출값을 직접 표시한다. store(`form.{field}`)는 불변(빈 문자열 유지) — `useEffect → store` 자동쓰기 **절대 금지**(`[[mirror-pattern]]`).

```
value = form.field !== "" ? form.field : (auto > 0 ? String(auto) : "")
onChange = (v) => set({ field: v })   // 사용자 편집 시에만 store write = override
```

- 사용자 눈에는 "자동으로 채워진 칸"으로 보이고, 덮어쓰면 override.
- 엔진 도달은 `buildInput()`의 `autoOrManual(form.field, auto)`가 담당(이미 §19·§22 적용, §23의2·§18의3로 확장).
- **3중 일치 강제**(`[[feedback_store_default_vs_ui_display_fallback]]`): UI display fallback의 `auto` 값 = `buildInput` autoOrManual의 `auto` 값 = validate fallback의 `auto` 값. **동일 도출 함수 단일 호출 결과를 prop으로 공유**(`InheritanceTaxForm`에서 계산해 `Step4`에 내려줌). UI 표시 ≠ 엔진 전달 불일치 차단.
- `AutoSuggestBadge`는 **보조 표시**로 유지(산식 ▼ 펼침 + 출처 + override 시 "자동값으로 되돌리기" 버튼). 칸 자동채움은 badge 클릭과 무관.

> v2/UI 시니어의 "badge [채우기] 클릭으로만 채움" 방식은 사용자 요구("자동으로 채워주기")와 불일치하여 **기각**. display fallback이 `[[feedback_no_silent_apportion_fallback]]` 위반이 아닌 근거: 사용자가 명시 입력·체크·분류한 데이터의 도출이며, 빈값을 면적·시점비율로 임의 안분하는 것이 아님.

### D2. 동거주택 = EstateItem 신규 플래그 `isCohabitantHouse` + **단일 선택**

자산 카드(주택)에서 '동거주택' 체크 → 그 자산의 `standardPrice − 담보채무`를 §23의2 base로 자동도출. §23의2는 **1세대 1주택 동거주택**이므로 **상호배타 단일 선택**(새 주택 체크 시 이전 주택 자동 해제). `deriveCohabitHouseStdPrice`는 체크된 단일 자산을 사용.

> 엔진(single)·UI(복수 합산) 입장 충돌 → **단일 선택으로 확정**(§23의2 1세대1주택 요건).

### D3. 영농 = `suggestFarmingAssetValue` 재사용 + autoOrManual **항상 적용**

`farmingAssetValue`는 정밀화 모드(`form.farming` 有)든 legacy든 **항상 자산가액 입력**(엔진 `inheritance-deductions.ts:634` `_calcFarmingDeduction(input.farmingAssetValue ?? 0, input.farming, ...)` — `farming` 객체는 자격 판정만, 자산가액은 스칼라). 기존 `suggestFarmingAssetValue`(`qualifiedHeirIds` 분배 인식)를 그대로 단일 진실로 쓰고, `buildInput`에서 `autoOrManual(form.farmingAssetValue, suggestFarmingAssetValue(items, form.farming).value)` **모드 무관 항상 적용**.

> UI 시니어의 "legacy(form.farming===undefined)일 때만 autoOrManual" 조건은 정밀화 모드 자동채움을 깨므로 **기각**.

### D4. Phase E `cohabitDirectAmount` 유지 (override 전용)

요건 우회 직접지정 escape hatch. 자동채움 대상 아님(AutoSuggestBadge 없음). 라벨/위치만 정리.

### D5. 단일 진실 위치 = `lib/calc/inheritance-deduction-suggest.ts`

4개 도출 함수(`suggestSpouseActualAmount`·`suggestNetFinancialAssets`·`deriveCohabitHouseStdPrice`(신규)·`suggestFarmingAssetValue`)를 UI 표시·`buildInput` autoOrManual·validate가 **동일 함수 재사용**(`[[single-source-engine-helper]]`). 엔진 내부 도출(가업 패턴) 대신 lib/calc 통일 — UI 재사용성 + 2-레이어(엔진=순수 계산) 정합.

---

## 2. 필드별 자동도출 매트릭스

| 칸 | 도출 함수 (단일 진실) | 도출 산식 | autoOrManual | UI display fallback | override |
|---|---|---|---|---|---|
| 배우자 실제상속액 §19 | `suggestSpouseActualAmount` (기존, **mixed-allocation 수정**) | Σ배우자 협의분할 배분 − 승계채무 (집행기준 19-17-1) | 기존 적용 | **신규(value 표시)** | 인라인 |
| 순 금융재산 §22 | `suggestNetFinancialAssets` (기존) | Σ금융적격자산 − Σ금융채무 − 담보금융저당 | 기존 적용 | **신규(value 표시)** | 인라인 |
| 동거주택 공시가격 §23의2 | `deriveCohabitHouseStdPrice` (**신규**) | isCohabitantHouse 단일 주택 `standardPrice`(**gross**) + securedDebt 별도(엔진 단일차감, E-1) | **신규 적용** | **신규(value 표시)** | 인라인 |
| 동거주택 직접입력 Phase E | (없음) | — | 미적용 | 없음(직접입력) | 그대로 |
| 영농상속재산가액 §18의3 | `suggestFarmingAssetValue` (기존) | ΣfarmingCategory 자산 − 담보, 자격자 분배 한정 | **신규 적용(모드 무관)** | **신규(value 표시)** | 인라인 |

---

## 3. 엔진/API 변경 (엔진 시니어 선처리)

### 3-1. 타입 — `lib/tax-engine/types/inheritance-gift.types.ts`
- **EstateItem 신규**: `isCohabitantHouse?: boolean` (line 201 인접 — `isFamilyBusinessAsset`(201)·`mortgageAmount`(179) 부근). JSDoc: §23의2 동거주택 단일 지정. [R-3 실측: isFamilyBusinessAsset=201, farmingCategory=258]
- **InheritanceDeductionInput 신규**: `cohabitSecuredDebt?: number` (§23의2① 담보채무 — 현행 엔진 0 하드코딩 해소용).

### 3-2. 신규 헬퍼 — `lib/calc/inheritance-deduction-suggest.ts` (547줄 → ~590줄, 안전)
```
deriveCohabitHouseStdPrice(estateItems, heirs): { value, securedDebt, isApplicable, reason, breakdown, notes }
```
- `isCohabitantHouse === true` 자산 필터. **[R-6/R-7]** 복수면 `isApplicable=false` + 경고("동거주택 1건만 선택")로 자동도출 포기(결정성 위해 "첫 번째 임의 선택" 금지). UI 단일선택(D2)이 신규 입력은 단건 보장하나, **legacy 저장 이력**에 복수 isCohabitantHouse가 있을 수 있어 방어 유지.
- `standardPrice` 없으면 isApplicable=false.
- `securedDebt = item.mortgageAmount ?? 0` (§23의2① 저당만, 임대보증금 제외 — **확인 필요**, §5 참조).
- ⚠️ **[E-1]** `value = standardPrice` (**gross 공시가격**), `securedDebt`는 별도 반환. 엔진 `calcCohabitationDeduction`(deductions.ts:294)이 `base = stdPrice − securedDebt` **단일 차감** — derive가 또 빼면 이중차감.
- `hasCohabitantChild` 보조 체크(없으면 notes 경고).

### 3-3. §23의2① securedDebt 엔진 연동 — `inheritance-deductions.ts`
- `calcCohabitationDeduction(input.cohabitHouseStdPrice ?? 0, input.cohabitSecuredDebt ?? 0, baseDate)` (627행 securedDebt 0 하드코딩 → 매개변수화). 엔진 순수성 유지(estate 직접 호출 안 함, buildInput이 `deriveCohabitHouseStdPrice`로 도출해 주입).
- ⚠️ **[R-5a — §14 상호작용]** securedDebt 소스 `EstateItem.mortgageAmount`(types:179)는 **§14①3호 부채공제(`mortgageAmount + leaseDeposit`)에도 사용되는 opt-in 필드**(§14 자동공제 토글 ON 시 입력). §23의2①(동거주택 **공제 base** 축소)과 §14(**과세가액** 축소)는 차감 대상 단계가 달라 **이중공제 아님**(전자는 공제액을 줄여 보수적, 후자는 과세가액 감소). 단 동일 mortgageAmount를 두 경로가 참조하므로, §23의2① 차감 범위(저당만 vs +임대보증금)는 §14 정의와 정합되게 KoreanLaw 검증 후 확정(§11-1).

### 3-4. §19 mixed-allocation 수정 — `suggestSpouseActualAmount` (510행)
- 협의분할 입력 자산 수(`allocated`) vs 전체(`total`) 집계.
- `0 < allocated < total` → `isApplicable=false` + **강한 경고**("일부 자산(X/Y건)만 협의분할 입력 — 전체 협의분할 입력 또는 §19 직접 입력 필요") → 잘못된 auto-fill 방지.
- `allocated === total` → 현행 로직. `allocated === 0` → 현행(isApplicable=false).
- **엔진 변경 없음** — `calcSpouseDeduction`의 `?? legalShareAmount`(169).
- ⚠️ **[R-1 정정]** isApplicable=false는 **잘못된 auto-fill만 방지**하지 과대공제를 차단하지 못한다: undefined → 엔진 `?? legalShareAmount`가 **법정상속분 전액**을 적용하고, §19②=min(실제,법정)에서 실제<법정이면 이 fallback이 **과대공제**(납세자 유리·법령 부정확). 이 legal-share fallback over-deduction은 **기존 엔진 거동**이며 본 작업 scope 외 — `[[feedback_no_silent_apportion_fallback]]` 정합 차원에서 **별도 트랙으로 확인 필요**(부분 협의분할 시 §19 수동입력을 강제할지 결정). 본 작업은 "잘못된 auto-fill 방지 + 경고"까지만 책임.

### 3-5. Zod — `lib/validators/property-valuation-input.ts`
- `baseItemSchema`에 `isCohabitantHouse: z.boolean().optional()` (⑨·⑫).
- `inheritanceDeductionInputSchema`에 `cohabitSecuredDebt: z.number().nonnegative().optional()`.

### 3-6. (별도 트랙 — scope 외, 기록만)
- §22 `phaseDFinancialRows`(`inheritance-tax.ts:408-459`) 담보 금융저당 차감 누락 → 표시 rows ≠ 공제 base dual-truth.
- ⚠️ **[R-9 정정]** "§22 `"0"` 입력 재폴백 함정"은 **실측상 미존재**. `autoOrManual`(`InheritanceTaxForm.tsx:302-303`)은 `raw === ""`를 **먼저** 판정하므로, `raw === "0"`이면 else-branch `parseAmount("0") || undefined = undefined`를 반환(auto 재폴백 안 함) → 엔진 `?? 0` → 공제 0(정상 배제). 검증 에이전트의 "재폴백" 분석이 오류였음(`[[feedback_numeric_impact_verify_before_bug_claim]]`). **UX 노트**: 칸을 비우면(`""`) display fallback이 auto를 재표시하므로, 강제 배제는 `0`을 **입력**해야 함(비우기 ≠ 0).

---

## 4. UI 변경 (UI 시니어 — 엔진 인터페이스 수령 후)

### 4-1. 자산 카드 '동거주택' 체크박스 — `EstateBodyRealEstate.tsx` (379줄 → ~395줄)
- 배치: `RealEstateAdvancedFields` ToggleCard children 내부(§14 자동공제 아래). 거주·자격 = **advanced 맥락**.
- `ToggleCard` tone="violet", title "동거주택 공제 대상 (§23의2)", `checked={item.isCohabitantHouse ?? false}`, `onCheckedChange`.
- **단일 선택(D2)**: 다른 주택의 `isCohabitantHouse` 자동 해제(상호배타). 구현 위치 = **`PropertyValuationForm`**(items 배열 전체 보유 레벨)의 `onUpdate` 인터셉트 — 한 주택 체크 시 sibling 주택 isCohabitantHouse=false.
- 노출 조건: 주택 카테고리 + `hasCohabitantChild`. **[R-2 정정]** `VariantBodyProps`(`variants/types.ts:12`)는 현재 `item·onUpdate·valuationDate·showCollateralDeductToggle·mode`만 보유(**heirs 없음** 실측). → `VariantBodyProps`에 `hasCohabitantChild: boolean` 추가(`showCollateralDeductToggle`와 동일 부모-계산 prop 패턴). 도출·주입 적기는 **`ItemEditor`**(`PropertyValuationForm:132,144`에서 이미 `heirs` 보유·heirs 의존 도출 수행 중) — `PropertyValuationForm`이 아님. (resolveAssetToggleVisibility에 Heir[] 인자 추가는 3개 호출처 변경이라 회피.)
- 동거 자녀 없으면 `disabled` + `disabledReason`("상속인 구성에서 자녀 동거 여부 확인").
- **testid** **[R-11]**: ToggleCard `data-testid="cohabit-house-toggle-{item.id}"` (E2E 동거주택 체크 검증).

### 4-2. Step4 display fallback 자동채움 — `steps.tsx` Step4 (536줄 → ~600줄)
- import 추가: `useMemo`, 4개 suggest 함수, `AutoSuggestBadge`.
- **도출값을 prop으로 수령**(3중 일치): `InheritanceTaxForm`이 `spouseAuto/netFinAuto/cohabitAuto/farmingAuto`를 계산(이미 `buildInput`에서 일부 계산 — `useMemo`로 끌어올려 Step4에 prop 전달). Step4 자체 재계산 금지(불일치 방지).
- 각 CurrencyInput: `value = form.x !== "" ? form.x : (auto>0 ? String(auto) : "")`. 위에 AutoSuggestBadge(출처·산식·되돌리기).
- Phase E(`cohabitDirectAmount`)는 badge 없음.
- 영농: `form.farming` 활성이어도 autoOrManual 적용(D3) — 배지에 "자격자 분배 자동 산정" 표기.

### 4-3. orphan `step4-5.tsx` 처리
- **[R-10 명확화]** 삭제 대상은 **`step4-5.tsx`(orphan step) 단일 파일**뿐. `AutoSuggestBadge.tsx`(`components/calc/inheritance/AutoSuggestBadge.tsx`)는 **별도 재사용 컴포넌트**(orphan 아님) → 살아있는 `steps.tsx`가 직접 import.
- useMemo derive + AutoSuggestBadge 배치를 `steps.tsx` Step4로 이관. 동거주택 후보칩(step4-5:132-187)은 D2 체크박스로 대체(이관 불필요). 이관 완료 후 **`step4-5.tsx`만 삭제**.

### 4-4. 결과 카드(⑦)·사이드바(⑥)
- 결과: `cohabitDeductionDetail.securedDebt` 표시 추가(CohabitDeductionDetailCard). 나머지는 엔진 결과 자동 반영(변경 없음).
- 사이드바: 공제는 결과 도착 후 반영(현행 유지, 변경 없음).

---

## 5. 14 동기화 지점

| # | 지점 | isCohabitantHouse | cohabitHouseStdPrice autoOrManual | farmingAssetValue autoOrManual | 담당 |
|---|---|---|---|---|---|
| ① 폼상태 | shared.ts / EstateItem | EstateItem 신규 | 기존 string | 기존 string | 엔진(타입)·UI |
| ② initial | — | undefined | "" | "" | — |
| ③ normalize | — | undefined fallback | — | — | UI |
| ④ API 변환 | estateItems spread 자동 + **`deductionInput.cohabitSecuredDebt = cohabit.securedDebt` 추가** [R-5b] | **`parseAmount→autoOrManual`** | **`parseAmount→autoOrManual`(모드무관)** | UI(타입 후) |
| ⑤ UI 위젯 | EstateBodyRealEstate ToggleCard | Step4 display fallback+badge | Step4 display fallback+badge | UI |
| ⑥ 사이드바 | 없음 | 없음 | 없음 | — |
| ⑦ 결과카드 | 엔진 반영 | securedDebt 표시 | 엔진 반영 | UI |
| ⑧ validate | 순수 플래그(검증 없음) | **fallback 인식 경고**(차단 아님) | **fallback 인식 경고** | 엔진 |
| ⑨ Zod estateItem | **`isCohabitantHouse`** | — | — | 엔진 |
| ⑫ Zod deductionInput | **`cohabitSecuredDebt`** | (기존) | (기존) | 엔진 |
| ⑬ body spread | inheritance-api.ts deductionInput 통째 — 자동 | — | — | 확인 |
| ⑭ route 매핑 | deductionInput cast — 자동 | — | — | 확인 |

> ⑧ 강제: `[[feedback_validation_sync_8th_point]]` — `form.x===""` & `auto>0`이면 validate가 "자산 카드에서 자동 도출됨"으로 통과(미입력 오류 차단 금지). UI 통과 ↔ validate 차단 모순 방지.

---

## 6. 케이스 인벤토리 (Design 전 행≥1 강제 — 13행)

| # | 케이스 | 입력 | 기대 auto | autoOrManual 결과 | override |
|---|---|---|---|---|---|
| C-1 | 동거주택 단일 (stdPrice 5억, 담보 0) | isCohabitantHouse=true | cohabitAuto=5억 | form="" → 5억 | 불필요 |
| C-2 | 동거주택+담보 (5억, mortgage 1억) | isCohabitantHouse=true | value=**5억(gross)**, securedDebt=1억 | 엔진 base 4억·deduction 4억 | 불필요 |
| C-3 | 동거주택 복수 체크 시도 | 2건 | UI 단일선택→1건만 유지 | 유지 1건 | — |
| C-4 | 동거주택 override (3억 직접) | form="300000000", auto=4억 | 3억(사용자 우선) | 3억 | 필요(명시) |
| C-5 | 미체크 (Heir.isCohabitant만) | isCohabitantHouse 없음 | auto=0 | undefined → 공제 0 | 체크 필요 |
| F-1 | 영농 단일 (10억, 담보 0) | farmingCategory | 10억 | 10억 | 불필요 |
| F-2 | 영농 복수 (3건 합) | 3건 | 합계 | 합계 | 불필요 |
| F-3 | 영농 자격자 분배분 (배분7억/전체10억) | qualifiedHeirIds | 7억 | 7억 | 불필요 |
| F-4 | 어업권 면허제외 (fishingLicenseExcluded) | 마을어업 | 제외(0) | undefined | 직접입력 |
| F-5 | 영농 자격 미충족 | farming.eligible=false | 배지 비활성 | undefined | 자격 보완 |
| S-1 | §19 전부 협의분할 | 3건 모두 배분 | 배우자 배분 합 | 합 | 불필요 |
| S-2 | §19 일부 협의분할 (2/3건) | allocated<total | **isApplicable=false** | undefined → 법정상속분 ⚠️**실제<법정 시 과대공제**(R-1, 기존 엔진 거동·별도 트랙) | **강한 경고**·전체입력/수동입력 유도 |
| S-3 | §19 협의분할 전무 | 없음 | isApplicable=false | undefined → 법정상속분(통상 정답) | 불필요(엔진 자동) |

---

## 7. Pre-Do anchor (Do 진입 전 RED 확보 — `[[pre-do-anchor-verification]]`)

- **Anchor A** (`__tests__/.../suggest-cohabit-derive.test.ts` 신규): C-2 — `deriveCohabitHouseStdPrice([{...standardPrice:5억, isCohabitantHouse:true, mortgageAmount:1억}], [동거자녀]).value === 400_000_000` & isApplicable. (함수 미존재 → TS 컴파일 RED.)
- **Anchor B** (`suggest-spouse-mixed-allocation.test.ts` 신규): S-2 — 3건 중 1건만 heirAllocations(배우자 2억) → `suggestSpouseActualAmount(...).isApplicable === false`. (현행은 isApplicable=true·value=2억 반환 → 즉시 RED, mixed-allocation 버그 실증.)
- **Anchor C (E2E/UI)** **[R-12]** (`e2e/inheritance-cohabit-autofill.spec.ts` 신규): 핵심 요구(가시적 자동채움) 검증 — 자산 카드에서 주택 동거주택 체크(`cohabit-house-toggle-{id}`) → Step4 동거주택 공시가격 칸에 도출값이 **표시**되는지 + 편집 시 override되는지. (display fallback이 동작하지 않으면 RED.)

---

## 8. 작업 순서 (엔진 선처리 → UI, `[[feedback_pdca_session_efficiency]]`)

1. 엔진: Anchor A·B 작성 → RED 확보
2. 엔진: 타입(`isCohabitantHouse`·`cohabitSecuredDebt`) + Zod(⑨⑫)
3. 엔진: `deriveCohabitHouseStdPrice` 구현 → Anchor A GREEN
4. 엔진: `suggestSpouseActualAmount` mixed-allocation 수정 → Anchor B GREEN
5. 엔진: `calcCohabitationDeduction` securedDebt 매개변수화 + ⑧ validate fallback 경고
6. 엔진: `tsc --noEmit` 0 → UI 인터페이스 전달(`deriveCohabitHouseStdPrice` 시그니처·`cohabitSecuredDebt`·autoOrManual 연결법·`VariantBodyProps.hasCohabitantChild`)
7. UI: `buildInput` autoOrManual 2필드 확장(④) + **`deductionInput.cohabitSecuredDebt` 추가**(R-5b) + 도출값 useMemo 끌어올려 Step4 prop
8. UI: `EstateBodyRealEstate` 동거주택 ToggleCard(testid) + **`ItemEditor`에서 hasCohabitantChild 도출·주입**(R-2, heirs 보유) + **`PropertyValuationForm` onUpdate에서 단일선택 sibling 해제**(items 배열 보유)
9. UI: Step4 display fallback + AutoSuggestBadge(⑤) + orphan step4-5 이관·삭제
10. UI: 결과카드 securedDebt(⑦)
11. Check: `ui-engine-sync-checker` + `npm test` + E2E(`e2e/*.spec.ts`) + 브라우저(Playwright)

---

## 9. 리스크·정책 정합

- **mirror-pattern**: display fallback은 `value` prop 표시만, store 불변. `useEffect→store` 금지 재확인. autoOrManual은 계산 시점 1회.
- **3중 불일치**: UI display·API autoOrManual·validate가 **동일 `auto` 값**(단일 함수 호출 prop 공유)을 쓰도록 강제.
- **자동 안분 fallback 금지**: 사용자 명시 체크/분류 데이터 도출이며 임의 안분 아님 — 위반 아님.
- **800줄**: 대상 파일 모두 변경 후 600줄 이내. types 파일(1156줄)은 타입 정의 예외 유지.
- **silent strip**: `VariantBodyProps`에 `hasCohabitantChild` 누락 시 항상 disabled — 단 `hasCohabitantChild: boolean`(optional 아님)로 추가하면 TS가 주입 누락을 감지(ItemEditor 미주입 시 컴파일 오류). **[R-8 검증완료]** `resolveActiveUnlistedValuation`(`unlisted-valuation-mode.ts:31-48`)은 `unlisted_stock`만 처리·`unlistedStockValuationV2`만 strip·부동산 무변경 → `isCohabitantHouse` **strip 영향 없음**(probe 불필요).

---

## 10. 법령 근거 (확인 필요 명시 — `[[korean-law-citation-verify]]`)

| 공제 | 조문 | 상수 | 검증 |
|---|---|---|---|
| §19 배우자 | 상증법 §19②④ — min(실제,법정), 5억~30억 | `INH.SPOUSE_DEDUCTION` | 엔진 기구현 |
| §22 금융 | 상증법 §22① / 상증령 §19① | `INH.FINANCIAL_DEDUCTION` | v2 KoreanLaw 검증 완료(mst 276123/283637) |
| §23의2 동거주택 | 상증법 §23의2① — "해당 주택·부수토지에 **담보된** 피상속인 채무액을 뺀 가액" ×100%, 한도 6억 / 시행령 **§20의2**(동거주택 인정 범위·1세대1주택·일시적 2주택 8호) | `INH.COHABIT_DEDUCTION` | ✅ **KoreanLaw 검증 완료(2026-06-02, mst 276123/283637)**: 담보채무 = **저당 등 담보권 설정 채무(`mortgageAmount`)만**, 일반 임대보증금은 "담보된 채무" 아님 → **제외**(계획 설계 정확). 시행령 조문 = §20의2(추정 §21의3 정정). 부수토지 가액 포함(소득법 §89①3호) |
| §18의3 영농 | 상증법 §18의3① / 상증령 §16⑤ — 한도 30억 | `INH.FARMING_DEDUCTION` | 엔진 기구현(2026-05-21 검증) |

---

## 11. 미해결·후속

1. ✅ **[해소]** §23의2① 담보채무 범위 — KoreanLaw 검증 완료(2026-06-02): **저당(담보권) 채무만, 임대보증금 제외**. `deriveCohabitHouseStdPrice`의 `securedDebt = item.mortgageAmount ?? 0` 확정(§3-2). 시행령 §20의2(§21의3 아님). **추가 고려**: 부수토지 가액(소득법 §89①3호)도 동거주택 base에 포함 — `standardPrice`가 주택+부수토지 합산 공시가인지 확인(주택 단독이면 부수토지 별도 합산 필요, Design에서 검토).
2. §22 phaseDFinancialRows 담보저당 차감 누락 dual-truth — 별도 트랙.
3. orphan `step4-5.tsx`의 `suggestFamilyBusinessValue`·`suggestPriorGiftDeductionTotal` 배지(가업·사전증여) 이관 — 본 작업 후속 Phase.
4. `cohabitDirectAmount` Phase E 라벨/위치 정리 — 본 작업 포함 또는 후속.

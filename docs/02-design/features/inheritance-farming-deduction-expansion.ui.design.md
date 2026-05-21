# 영농상속공제 정밀화 (UI Design)

> 작성일: 2026-05-21
> 계획서: [`docs/00-pm/inheritance-farming-deduction-expansion.plan.md`](../../00-pm/inheritance-farming-deduction-expansion.plan.md) v2.2
> 대상 마법사: 상속세 — Step1(estateItems 영농 분류) + Step4(영농 요건·자산 자동 채움)
> 정책 참조: 계획서 §4 + `[[besshi-form-replica]]` · `[[formula-display-builder]]` · `[[feedback_tailwind_static_tone_mapping]]` · `[[mirror-pattern]]`

## 0. 디자인 범위

본 디자인 문서는 계획서 §1~§10을 UI 명세로 구체화. 산식·법령 근거는 계획서 §1-2 참조.

### 0-1. 신규/수정 파일 (계획서 §7 Phase 매핑)

| 파일 | 변경 | PR (계획서 §9) |
|---|---|---|
| `lib/tax-engine/types/inheritance-gift.types.ts` | EstateItem.farmingCategory + FarmingInheritanceInput + FarmingDeductionDetail | PR-1 (F-1) |
| `lib/tax-engine/deductions/inheritance-deductions.ts` | calcFarmingDeduction 갱신 + evaluateFarmingEligibility 신규 | PR-1 (F-2) |
| `lib/validators/property-valuation-input.ts` | estateItemSchema에 farmingCategory + farmingInputSchema 신규 | PR-1 (F-1, ⑨⑫) |
| `app/api/calc/inheritance/route.ts` | inheritanceInputSchema.deductionInput.farming optional | PR-1 (⑨) |
| `__tests__/tax-engine/inheritance/farming-deduction.test.ts` | anchor 16건 (FD-1~16) | PR-1 |
| `lib/calc/inheritance-deduction-suggest.ts` | suggestFarmingAssetValue 신규 | PR-2 (F-3) |
| `__tests__/lib/calc/farming-suggest.test.ts` | anchor 6건 (FS-1~6) | PR-2 |
| `components/calc/inheritance/FarmingCategorySection.tsx` | 신규 — EstateItem 카드 내 영농 분류 라디오 + hint | PR-3 (F-4) |
| `components/calc/PropertyValuationForm.tsx` | FarmingCategorySection 통합 (DeemedCategorySection 옆) | PR-3 (F-4) |
| `components/calc/StockValuationForm.tsx` | corporate_stock 분류만 노출 간소화 통합 | PR-3 (F-4) |
| `components/calc/inheritance/FarmingEligibilitySection.tsx` | 신규 — Step4 요건 입력 ToggleCard 그룹 | PR-4 (F-5) |
| `components/calc/inheritance/step4-5.tsx` | FarmingEligibilitySection + AutoSuggestBadge 통합 | PR-4 (F-5) |
| `components/calc/inheritance/shared.ts` | FormState.farming 신규 + INITIAL_FORM | PR-4 (F-5) |
| `components/calc/InheritanceTaxForm.tsx` | buildInput.deductionInput.farming 명시 매핑 | PR-4 (F-5, ④) |
| `lib/calc/inheritance-api.ts` | buildInput body spread 점검 (변경 없음 — deductionInput 통째 spread 보장만) | PR-4 (⑬ 확인) |
| `components/calc/results/InheritanceTaxResultView.tsx` | farmingDetail 4-way 분기 표시 (FarmingDeductionDetailRow 신규) | PR-4 (F-6) |

## 1. 케이스 매트릭스 (모든 분기 enumerate)

### 1-1. FarmingCategorySection (R1 패턴 — EstateItem 카드 통합)

| Case | category | farmingCategory | 노출 hint | suggest 합산 포함 |
|---|---|---|---|---|
| FC-1 | real_estate_land | undefined | "비영농 자산 (default)" | ✗ |
| FC-2 | real_estate_land | farmland | "농지법 §2①가 농지" | ✓ |
| FC-3 | real_estate_land | pasture | "초지법 §5 초지조성허가" | ✓ |
| FC-4 | real_estate_land | forest_land | "보전산지 + 산림경영계획 인가 + 5년 이상 조림" | ✓ |
| FC-5 | real_estate_land | salt_field | "소금산업진흥법 §2③ 염전" | ✓ |
| FC-6 | real_estate_building | agricultural_building | "농업·임업·축산업·어업용 창고·축사 등 (건폐율 환산 면적 한정)" | ✓ |
| FC-7 | other | fishing_vessel | "어선법 §2①" | ✓ |
| FC-8 | other | fishing_right | "어업권·양식업권 (마을어업·협동양식업 제외)" | ✓ |
| FC-9 | listed_stock | corporate_stock | "법인 영농 — §15⑤2호 사업무관자산 차감 후 가액 입력 권장" | ✓ |
| FC-10 | unlisted_stock | corporate_stock | 동상 + §22② 최대주주 제외 안내 | ✓ |
| FC-11 | financial | (불가) | 라디오 자체 노출 안 함 | — |

**제약**: 금융·현금 카테고리(`financial`·`cash`·`deposit`)는 영농 자산 불가 → FarmingCategorySection 미렌더.

### 1-2. FarmingEligibilitySection (Step4 — 요건 입력)

| Case | 시나리오 | 결과 |
|---|---|---|
| FE-1 | type=undefined (form.farming=undefined) | "요건 미평가 (legacy)" 배지 + 자동 채움 비활성 |
| FE-2 | type=personal + 모든 요건 ✓ | eligible=true · cappedDeduction = min(자산, 30억) |
| FE-3 | type=personal + decedentEightYearFarming=false | eligible=false · "§16②1호가" |
| FE-4 | type=personal + 거주지 미충족 | "§16②1호나" (자산 유형별 분기 안내) |
| FE-5 | type=personal + heirIsAdult=false | "§16③ 18세 이상" |
| FE-6 | type=personal + heirTwoYearFarming=false + decedentEarlyDeath=true | 2년 요건 면제 (충족) |
| FE-7 | type=personal + heirTwoYearFarming=false + decedentEarlyDeath=false | "§16③1호가" |
| FE-8 | hasDisqualifyingIncome=true | "§16⑭" (후계자 트랙도 적용) |
| FE-9 | hasTaxFraudConviction=true | early return · "§18의3⑥" 단독 reason (본 PR은 §18의3⑥1호 "확정 결정 전" 케이스로 단순화 — 공제 배제만. 2호 "공제 후 사후 추징"은 F-7에서 처리) |
| FE-10 | type=corporate + 모든 요건 ✓ | eligible=true |
| FE-11 | type=corporate + heirCorporateOfficer=false | "§16③2호나" |
| FE-12 | isDesignatedSuccessor=true + 18세 미충족 | 후계자 트랙 — 충족 |
| FE-13 | isDesignatedSuccessor=true + 피상속인 8년 미충족 | "§16②1호가" (피상속인 요건은 별개) |
| FE-14 | isDesignatedSuccessor=true + hasDisqualifyingIncome=true | "§16⑭" (후계자 트랙에도 적용) |

### 1-3. AutoSuggestBadge — 영농상속재산가액

| Case | estateItems | farmingAssetValue 현재값 | 표시 |
|---|---|---|---|
| FS-1 | 농지 5억 + 초지 2억 | "" | 제안 7억, "채우기" 버튼 |
| FS-2 | 농지 5억 + 저당 1억 | "" | 제안 4억 |
| FS-3 | farmingCategory 미지정 | "" | isApplicable=false, 미렌더 |
| FS-4 | 농지 5억 + 사용자 입력 5억 | "500,000,000" | "자동 채움 적용됨" + 되돌리기 |
| FS-5 | 농지 5억 + 사용자 입력 8억 | "800,000,000" | amber "현재값 다름" + "제안값으로 변경" |
| FS-6 | 농지 35억 (단일) | "" | 제안 35억 (한도 적용 전), UI 안내 "30억 cap 자동 적용" |

### 1-4. 결과 카드 farmingDetail (4-way 분기)

| 분기 | 조건 | 표시 |
|---|---|---|
| RD-1 | evaluated=true + eligible=true + cappedDeduction>0 | emerald: "영농자산 25억 ≤ 한도 30억 → 25억 공제" |
| RD-2 | evaluated=true + eligible=true + cappedDeduction=0 (자산 0) | gray: "영농 자산 미입력" |
| RD-3 | evaluated=true + eligible=false + appliedAssetValue>0 | **amber**: "입력 자산 5억 — 자격 미충족으로 공제 0원" + reasons 목록 |
| RD-4 | evaluated=true + eligible=false + appliedAssetValue=0 | gray: "자격 미충족 + 자산 미입력" |
| RD-5 | evaluated=false (legacy) | **violet**: "요건 미평가 (legacy 모드). Step4에서 영농 요건 입력 권장" |

## 2. UI 컴포넌트 명세

### 2-1. `FarmingCategorySection` (EstateItem 카드 통합)

위치: PropertyValuationForm·StockValuationForm 카드 내부, DeemedCategorySection 아래.

```
┌─ 영농상속 자산 분류 (§16⑤) — emerald-50/40 ───────────┐
│ ◉ 비영농 자산                                            │
│ ○ 농지        ○ 초지        ○ 산림지                    │
│ ○ 어선        ○ 어업권·양식업권                          │
│ ○ 농업용 건축물 + 부속토지   ○ 염전                     │
│ ○ 법인 주식 (법인 영농)                                  │
│                                                          │
│ [선택 시 hint 카드 — emerald-100/60]                     │
│ ⓘ 농지법 §2①가 농지 — 영농상속공제 §18의3 대상           │
└──────────────────────────────────────────────────────────┘
```

#### 데이터 흐름
- `RadioCardGroup<FarmingCategory | "none">` (8 + 1 option, **layout="stack"** — 9개 옵션이 inline은 가로 폭 초과)
- "비영농" 선택 = `farmingCategory: undefined`
- 그 외 선택 = `farmingCategory: <value>`

#### 카테고리 호환 가드
- `financial`·`cash`·`deposit`: 컴포넌트 자체 미렌더 (영농 자산 아님)
- `real_estate_*`·`other`: 모든 farmingCategory 선택 가능 (corporate_stock 제외)
- `listed_stock`·`unlisted_stock`: **corporate_stock만 노출**, 다른 옵션은 disabled + disabledReason "법인 주식은 corporate_stock 분류만 가능"
- 사용자가 EstateItem.category를 변경할 때 기존 farmingCategory가 호환 안 되면 **자동 undefined로 reset + 안내 토스트** ("카테고리 변경으로 영농 분류가 해제되었습니다 — 재선택 필요")

#### Tailwind 정적 매핑 (`[[feedback_tailwind_static_tone_mapping]]`)
```typescript
const FARMING_TONE = {
  card: "border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-800",
  hint: "bg-emerald-100/60 dark:bg-emerald-900/30",
  // 다크모드 변형 포함 정적 객체
};
```

### 2-2. `FarmingEligibilitySection` (Step4 요건 입력)

위치: Step4 farmingAssetValue 입력 위.

```
┌─ 영농상속공제 §18의3 요건 (선택) — violet 카드 ─────────┐
│ ☐ 요건 입력 활성화 (체크 시 아래 항목 노출)              │
│                                                          │
│ [영농 유형]                                              │
│ ◉ 개인 영농 (소득세법)   ○ 법인 영농 (법인세법)         │
│                                                          │
│ [피상속인 요건 §16②]                                     │
│ ☐ 8년 이상 직접 영농 종사 (질병·수용 1년 인정)           │
│ ☐ 거주지 충족                                            │
│   ⓘ 농지·초지·산림지 자산이 있는 경우:                   │
│      농지등 소재 시·군·구·연접·30km 이내                 │
│   ⓘ 어선·어업권 자산이 있는 경우:                        │
│      선적지·어장 연안 시·군·구·연접·30km 이내            │
│ [법인 모드일 때만 표시]                                  │
│ ☐ 법인 8년 경영 + 최대주주 50%+ 유지                     │
│                                                          │
│ [상속인 요건 §16③]                                       │
│ ☐ 영농·영어·임업후계자 (재정경제부령) — 별도 트랙        │
│   ⓘ 체크 시 아래 18세·2년·거주 요건 자동 면제            │
│ ☐ 18세 이상                                              │
│ ☐ 2년 이상 직접 영농 종사 (개인) / 법인 종사 (법인)      │
│ ☐ 거주지 충족 (피상속인과 동일 분기)                     │
│ ☐ 피상속인 65세 미만 사망 (2년 요건 면제)                │
│ [법인 모드일 때만]                                       │
│ ☐ 신고기한 내 임원 + 2년 내 대표이사 취임 예정           │
│                                                          │
│ [영농 부정 §16⑭ — 후계자 트랙 포함]                      │
│ ☐ 사업소득+총급여 3,700만 이상 과세기간 존재             │
│                                                          │
│ [조세포탈·회계부정 §18의3⑥]                              │
│ ☐ 조세포탈·회계부정 형 확정 (공제 배제)                  │
│   ⓘ §15⑲ 1호 조세범 §3① 벌금 / 2호 외감법 §39① (자산 5% 이상) │
└──────────────────────────────────────────────────────────┘
```

#### Props
```typescript
interface FarmingEligibilitySectionProps {
  farming: FarmingInheritanceInput | undefined;
  estateItems: EstateItem[];  // 거주지 자산 유형별 동적 안내용
  onChange: (farming: FarmingInheritanceInput | undefined) => void;
}
```

#### 상태 관리 (3-state — `[[feedback_three_state_optional_mode_toggle]]`)
- `farming === undefined`: 활성화 토글 OFF → **하단 폼 전체 미렌더** (legacy 모드. 토글만 표시)
- 토글 ON 클릭 → `onChange({ type: "personal", decedentEightYearFarming: false, ... })` 빈 객체 초기화 + 하단 폼 렌더
- 토글 OFF 클릭 → 데이터 손실 경고 Dialog (`[[feedback_dialog_data_discard_confirm]]`) → 확인 시 `onChange(undefined)`

#### 미충족 미리보기 (실시간)
ToggleCard 그룹 하단에 useMemo로 `evaluateFarmingEligibility(form.farming)` 결과 노출:
- `eligible=true`: emerald 배지 "✓ 모든 요건 충족"
- `eligible=false`: amber 카드 + reasons 목록

(엔진 결과와 동일 함수 import — `[[single-source-engine-helper]]`)

#### 거주지 자산 유형별 동적 안내 (개인 영농 전용)
```typescript
// 법인 영농(corporate)은 §16②2호로 거주 요건 없음 → 거주지 hint 자체 미렌더
const showResidenceHint = farming.type === "personal";

const hasLandAsset = showResidenceHint && estateItems.some(i =>
  ["farmland", "pasture", "forest_land", "agricultural_building", "salt_field"].includes(i.farmingCategory ?? "")
);
const hasFishingAsset = showResidenceHint && estateItems.some(i =>
  ["fishing_vessel", "fishing_right"].includes(i.farmingCategory ?? "")
);
// 두 hint 카드 노출은 각 boolean 따라 분기. type=corporate 시 거주지 체크박스 자체 미노출
```

#### corporate 모드 차이
- 거주지 체크박스·hint 미렌더
- 추가 필드: `decedentCorporateMet`·`heirCorporateOfficer` 노출
- 상속인 18세·2년 종사·후계자·hasDisqualifyingIncome은 동일하게 노출

### 2-3. AutoSuggestBadge — 영농상속재산가액 (기존 컴포넌트 재사용)

Step4 farmingAssetValue CurrencyInput 직전:

```tsx
// single-source: 엔진 헬퍼 직접 import (UI에서 재구현 금지)
import { evaluateFarmingEligibility } from "@/lib/tax-engine/deductions/inheritance-deductions";
import { suggestFarmingAssetValue } from "@/lib/calc/inheritance-deduction-suggest";

const suggestFarming = useMemo(
  () => suggestFarmingAssetValue(allEstateItems),
  [allEstateItems],
);
// 자격 미충족 시 자동 채움 권하지 않음 — 사용자가 의도적으로 수동 입력해야
const showSuggest =
  form.farming === undefined ||  // legacy 모드는 채움 허용
  evaluateFarmingEligibility(form.farming).eligible;  // 평가 충족 시만

{showSuggest && (
  <AutoSuggestBadge
    suggestion={suggestFarming}
    currentValue={form.farmingAssetValue}
    onApply={(v) => set({ farmingAssetValue: v })}
    label="영농상속재산가액"
  />
)}
{!showSuggest && (
  <div className="rounded-md border border-amber-200 bg-amber-50/40 p-2 text-[11px] text-amber-700 dark:text-amber-300 dark:bg-amber-950/20 dark:border-amber-800">
    ⚠️ 자격 미충족 상태 — 자동 채움이 비활성화됐습니다. 위 요건을 충족하거나 수동으로 입력하세요.
  </div>
)}
<CurrencyInput
  label="영농상속재산가액 (§23)"
  value={form.farmingAssetValue}
  ...
/>
```

### 2-4. 결과 카드 — `FarmingDeductionDetailRow`

위치: `InheritanceTaxResultView` §23 farmingDeduction Row 직후.

```tsx
function FarmingDeductionDetailRow({ detail }: { detail?: FarmingDeductionDetail }) {
  if (!detail) return null;

  // RD-5: legacy
  if (!detail.evaluated) {
    return (
      <div className="mx-4 my-2 rounded-md border border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-800 p-2">
        <p className="text-[11px] text-violet-700 dark:text-violet-300">
          ⓘ 요건 미평가 (legacy 모드). Step4에서 영농 요건 입력 권장.
        </p>
      </div>
    );
  }

  // RD-3: 미충족 + 사용자 입력 존재
  if (!detail.eligible && detail.appliedAssetValue > 0) {
    return (
      <div className="mx-4 my-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-2 space-y-1">
        <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
          ⚠️ 입력 자산 {formatKRW(detail.appliedAssetValue)} — 자격 미충족으로 공제 0원
        </p>
        <ul className="space-y-0.5 text-[10px] text-amber-700 dark:text-amber-300 list-disc pl-4">
          {detail.ineligibleReasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </div>
    );
  }

  // RD-2/4: gray (자산 0 또는 자격 미충족 + 입력 없음)
  if (detail.cappedDeduction === 0) {
    return (
      <div className="mx-4 my-2 text-[11px] text-gray-500 dark:text-gray-400">
        ⓘ {detail.eligible ? "영농 자산 미입력" : "자격 미충족 + 자산 미입력"}
      </div>
    );
  }

  // RD-1: 정상
  const capped = detail.appliedAssetValue > 3_000_000_000;
  return (
    <div className="mx-4 my-2 text-[11px] text-gray-600 dark:text-gray-400">
      ⓘ 영농자산 {formatKRW(detail.appliedAssetValue)}
      {capped && ` (30억 한도 적용 → ${formatKRW(detail.cappedDeduction)})`}
    </div>
  );
}
```

## 3. Step별 UI 통합 순서

### 3-1. Step1 (상속재산 입력)

기존 PropertyValuationForm·StockValuationForm 카드 내부 순서:
1. 카테고리 선택 (기존)
2. 자산명 (기존)
3. 평가액 (기존)
4. **간주상속재산 분류 (§8·§9·§10) — 기존 DeemedCategorySection**
5. **영농상속 자산 분류 (§16⑤) — 신규 FarmingCategorySection**  ⬅️
6. §22 금융재산공제 (기존 FinancialDeductionChip)
7. 협의분할 (기존 HeirAllocationToggleSection)

### 3-2. Step4 (공제)

```
1. HeirComposition (기존)
2. 추가 공제 입력 (선택) 헤더
3. 배우자 실제 상속액 [AutoSuggestBadge]
4. 순 금융재산 [AutoSuggestBadge]
5. 동거주택 후보 [라디오]
6. 동거주택 공시가격
7. 동거주택공제 직접 입력 (Phase E)
8. ── 영농상속공제 §18의3 ── ⬅️ 신규 그룹 헤더 (영농 자산 0건이어도 노출 — 사용자가 자산 분류 누락 catch)
   - 그룹 카드 하단에 `estateItems.some(i => i.farmingCategory)`=false 시 안내: "Step1에서 영농 자산에 분류를 지정해야 자동 채움이 활성화됩니다"
9. [FarmingEligibilitySection] ⬅️ 신규 (영농 자산 0건이어도 토글 자체는 노출, 미사용 시 OFF)
10. [AutoSuggestBadge — 영농상속재산가액] ⬅️ 신규 (영농 자산 0건 + farming.type=undefined 시 isApplicable=false로 미렌더)
11. 영농상속재산가액 §23 (기존, label 갱신)
12. 가업상속재산가액 [AutoSuggestBadge] (기존)
13. ... (이하 기존)
```

## 4. 14지점 동기화 (UI 측 책임 — 계획서 §5와 매핑)

| 지점 | 파일 | 변경 |
|---|---|---|
| ① 폼 타입 | `shared.ts` FormState | `farming?: FarmingInheritanceInput` 신규 |
| ② initial | `shared.ts` INITIAL_FORM | `farming: undefined` (3-state) |
| ③ normalize | `lib/stores/calc-wizard-migration.ts` | farming undefined 유지 |
| ④ API 변환 | `InheritanceTaxForm.buildInput` | `deductionInput.farming: form.farming` **명시 매핑 추가** (현재 deductionInput은 명시 매핑 패턴이라 누락 시 침묵 strip). 본 매핑 추가 시 ⑬⑭는 자동 통과 (이미 deductionInput 통째 spread) |
| ⑤ UI 위젯 | 신규 컴포넌트 2개 + 통합 | FarmingCategorySection + FarmingEligibilitySection + AutoSuggestBadge + FarmingDeductionDetailRow |
| ⑥ 사이드바 | `InheritanceSidebar` | 영농 자산 합 분리 표시 (옵션) |
| ⑦ 결과 카드 | `InheritanceTaxResultView` | farmingDetail 4-way 분기 표시 |
| ⑧ validation | `lib/calc/inheritance-validate.ts` | farming 활성 시 type 필수만 강제, 그 외 optional |
| ⑨ Zod 메인 | `app/api/calc/inheritance/route.ts` | farmingInputSchema + deductionInput.farming |
| ⑩ Zod 컴패니언 | — | 본 PR 해당 없음 (nested) |
| ⑪ acquisitionDate fallback | — | 해당 없음 (상속세) |
| ⑫ Zod 입력 객체 | `property-valuation-input.ts` baseItemSchema | `farmingCategory: z.enum([...]).optional()` 추가 |
| ⑬ callInheritanceTaxAPI body | `lib/calc/inheritance-api.ts` | deductionInput 통째 spread 확인 (이미 spread — 변경 없음) |
| ⑭ Route handler | `route.ts` | farming spread 보장 (이미 spread — 변경 없음) |

## 5. 색상·tone 가이드

| UI 요소 | tone | 의미 |
|---|---|---|
| FarmingCategorySection | emerald | 공제·세제 혜택 (deemed와 직교) |
| FarmingEligibilitySection 카드 | violet | 자격·거주·관계 정보 (DeemedCategorySection 패턴) |
| 결과 RD-1 (정상 공제) | emerald | 공제 적용 |
| 결과 RD-3 (자격 미충족 + 입력 존재) | amber | 경고 |
| 결과 RD-5 (legacy 미평가) | violet | 안내 |
| 미충족 사유 목록 | amber 텍스트 | 경고 세부 |

다크모드 변형 모두 정적 매핑 (`[[feedback_tailwind_static_tone_mapping]]`).

## 6. 접근성 / 인쇄

- 모든 ToggleCard·RadioCardGroup 키보드 접근 (기본 보장)
- FarmingDeductionDetailRow 인쇄 시 펼침 상태 유지 (조건부 렌더이므로 print-only CSS 불필요)
- 거주지 자산 유형별 안내는 `<aside role="note">` 시맨틱

## 7. 사용자 시나리오 (대표 3건)

### 시나리오 A — 단순 농지 (개인 영농)
1. Step1: 토지 자산 입력 → FarmingCategorySection "농지" 선택
2. 평가액 5억 입력
3. Step4: FarmingEligibilitySection "요건 입력 활성화" → 개인 영농 선택
4. 피상속인 8년 ✓ / 거주지 ✓ / 상속인 18세 ✓ / 2년 ✓ / 거주 ✓ 체크
5. AutoSuggestBadge "5억" 채우기 → 결과 RD-1 "5억 공제"

### 시나리오 B — 후계자 트랙 (미성년)
1. Step1: 농지 자산 10억 + farmingCategory=farmland
2. Step4: 영농 유형 personal, 피상속인 요건 모두 ✓
3. "영농·영어·임업후계자" 체크 → 18세·2년·거주 회색 비활성 표시
4. AutoSuggestBadge 10억 채우기 → 결과 RD-1 "10억 공제" (FE-12)

### 시나리오 C — 자격 미충족 (사용자가 미리 입력 후 요건 미충족 발견)
1. Step1: 농지 5억 입력 + farmingCategory="farmland"
2. Step4: 영농 요건 활성화 토글 OFF 상태에서 farmingAssetValue 5억 미리 수동 입력 (legacy 모드)
3. Step4 결과 카드 RD-5 violet "요건 미평가" 안내 → 사용자가 토글 ON
4. 활성화 후 피상속인 8년 ✓·거주지 ✓·상속인 18세 ✓·2년 종사 ✗ (실제 미충족 발견)
5. 자격 미평가 미리보기 amber "§16③1호가" → AutoSuggestBadge 비활성 (자동 채움 차단)
6. 결과 RD-3 amber "입력 자산 5억 — 자격 미충족으로 공제 0원" + reasons

## 8. 유효성 검증

| 케이스 | 검증 | 동작 |
|---|---|---|
| farming.type=undefined | Step 진행 가능 (legacy) | 안내만 |
| farming.type 있는데 모든 boolean=false | Step 진행 가능, 결과 미충족 다수 | 미리보기 amber |
| `farmingCategory` 미설정 자산만 + farming 활성 | 자동 채움 isApplicable=false | 사용자 수동 입력 또는 자산 분류 변경 안내 |
| corporate type + listed_stock 자산만 corporate_stock 분류 안 됨 | Step1 안내 카드 | "법인 영농은 주식에 corporate_stock 분류 필요" |

## 9. Pre-Do anchor (우선 실행)

계획서 §6 Pre-Do anchor 3건 + UI 1건:
- FD-7 (65세 미만 사망 예외 — early return·reasons 누락 검증)
- FD-9 (조세포탈 우선 배제 — 다른 사유 평가 차단)
- FS-2 (담보채무 차감 §16⑤ 단서)
- **UI**: FC-9·FC-10 (corporate_stock + listed/unlisted 호환 가드)

실패 시 디자인 환류 — 본 문서 §1 케이스 매트릭스·§2 컴포넌트 시그니처 갱신.

## 10. 범위 외 (후속 PR — 계획서 §10 동기화)

- F-7 5년 사후관리 + 이자상당액 + 정당사유 7종 시뮬레이터
- F-8 §15⑤2호 사업무관자산 5종 자동 차감 + 별도 입력 폼
- §16② 단서 (영농상속 후 최대주주 사망)
- 거주지 30km 자동 검증 (Vworld 좌표)
- 영농 종사 상속인 일부 → heirAllocations 연계 부분 공제

# 영농상속공제 후속 작업 (F-4~F-8) UI Design

> 작성일: 2026-05-21
> 계획서: [`docs/00-pm/inheritance-farming-followup.plan.md`](../../00-pm/inheritance-farming-followup.plan.md)
> 선행 토대: 커밋 `670bfec` (엔진·타입·Zod·suggest·anchor 26건 완료)
> 대상: **PR-A** (F-4·F-5·F-6 UI 통합 — 본 디자인 주 범위) + F-7·F-8·F-9 설계 개요
> 정책: `[[mirror-pattern]]` · `[[feedback_dialog_data_discard_confirm]]` · `[[feedback_tailwind_static_tone_mapping]]` · `[[feedback_three_state_optional_mode_toggle]]` · `[[single-source-engine-helper]]` · `[[print-only-css-toggle]]`

## 0. 디자인 범위 (PR-A)

### 0-1. 신규/수정 파일 (PR 매핑)

| 파일 | 변경 | PR | Phase |
|---|---|---|---|
| `components/calc/inheritance/FarmingCategorySection.tsx` | 신규 — 9-옵션 RadioCardGroup + hint + 호환 가드 | PR-A | F-4 |
| `components/calc/PropertyValuationForm.tsx` | FarmingCategorySection 통합 (DeemedCategorySection 아래) | PR-A | F-4 |
| `components/calc/StockValuationForm.tsx` | corporate_stock 분기 통합 (ListedStockEditor·UnlistedStockEditor 양쪽) | PR-A | F-4 |
| `components/calc/inheritance/FarmingEligibilitySection.tsx` | 신규 — 3-state 토글 + 6섹션 ToggleCard + 미리보기 useMemo | PR-A | F-5 |
| `components/calc/inheritance/step4-5.tsx` | FarmingEligibilitySection + AutoSuggestBadge + CurrencyInput 통합 | PR-A | F-5 |
| `components/calc/inheritance/shared.ts` | FormState.farming + INITIAL_FORM | PR-A | F-5 |
| `components/calc/InheritanceTaxForm.tsx` | buildInput.farming = form.farming 정식 매핑 | PR-A | F-5 |
| `components/calc/results/InheritanceTaxResultView.tsx` | FarmingDeductionDetailRow 4-way 분기 (인라인) | PR-A | F-6 |
| `__tests__/components/calc/inheritance/farming-section.test.tsx` | 신규 — RTL 5건 (FC-1/9/11 · FE-1/6) | PR-A | F-4·F-5 |

### 0-2. 영향 외 파일 (이미 670bfec 완료)
- `lib/tax-engine/types/inheritance-farming.types.ts` (타입)
- `lib/tax-engine/deductions/inheritance-deductions.ts` (엔진)
- `lib/calc/inheritance-deduction-suggest.ts` (suggest)
- `lib/validators/property-valuation-input.ts` (Zod)

## 1. 케이스 매트릭스

### 1-1. FarmingCategorySection (F-4) — FC-1~11

| Case | category | farmingCategory | UI 노출 | hint |
|---|---|---|---|---|
| FC-1 | real_estate_land | undefined (비영농 default) | "비영농 자산" 선택됨 + 그 외 7 옵션 활성 | (없음) |
| FC-2 | real_estate_land | farmland | "농지" 선택 | "농지법 §2①가" |
| FC-3 | real_estate_land | pasture | "초지" 선택 | "초지법 §5" |
| FC-4 | real_estate_land | forest_land | "산림지" 선택 | "보전산지 + 5년 조림" |
| FC-5 | real_estate_land | salt_field | "염전" | "소금산업진흥법 §2③" |
| FC-6 | real_estate_building | agricultural_building | "농업용 건축물" | "건폐율 환산 면적 한정" |
| FC-7 | other | fishing_vessel | "어선" | "어선법 §2①" |
| FC-8 | other | fishing_right | "어업권·양식업권" | "마을어업·협동양식업 제외" |
| FC-9 | listed_stock | corporate_stock | **8 옵션 중 corporate_stock만 활성**, 나머지 disabled+reason | "법인 영농 — §15⑤2호 사업무관자산 차감 후 가액 입력" |
| FC-10 | unlisted_stock | corporate_stock | 동상 (FC-9) | 동상 |
| FC-11 | financial | (해당 없음) | **컴포넌트 자체 미렌더** | — |

**카테고리 변경 시 자동 reset** (사용자 변경 트리거):
- `real_estate_*` ↔ `listed_stock`: 기존 farmingCategory가 새 카테고리에 호환 안 되면 undefined로 reset + 토스트 안내 "카테고리 변경으로 영농 분류가 해제됨"
- **처리 위치**: `PropertyValuationForm`·`StockValuationForm`의 category onChange 핸들러 (FarmingCategorySection은 받아쓰기만):
  ```tsx
  // PropertyValuationForm category Select onChange
  onChange={(newCategory) => {
    const incompatibleForNew =
      newCategory === "financial" || newCategory === "cash" || newCategory === "deposit"
        ? "all"
        : newCategory === "listed_stock" || newCategory === "unlisted_stock"
          ? "non-corporate"
          : "corporate-only";
    let nextFarmingCategory = item.farmingCategory;
    if (incompatibleForNew === "all") nextFarmingCategory = undefined;
    else if (incompatibleForNew === "non-corporate" && item.farmingCategory !== "corporate_stock")
      nextFarmingCategory = undefined;
    else if (incompatibleForNew === "corporate-only" && item.farmingCategory === "corporate_stock")
      nextFarmingCategory = undefined;
    if (nextFarmingCategory !== item.farmingCategory) {
      toast.info("카테고리 변경으로 영농 분류가 해제됨 — 재선택 필요");
    }
    onUpdate({ ...item, category: newCategory, farmingCategory: nextFarmingCategory });
  }}
  ```

### 1-2. FarmingEligibilitySection (F-5) — FE-1~14

| Case | 시나리오 | 결과 |
|---|---|---|
| FE-1 | farming=undefined (legacy) | 토글 OFF + 하단 폼 미렌더 |
| FE-2 | personal + 전 요건 ✓ | 미리보기 emerald "✓ 모든 요건 충족" |
| FE-3 | personal + 8년 미충족 | amber "§16②1호가" |
| FE-4 | personal + 거주지 미충족 | amber "§16②1호나" |
| FE-5 | 17세 (heirIsAdult=false) | amber "§16③ 18세" |
| FE-6 | 2년 미충족 + 65세 미만 사망 | emerald (면제 적용) |
| FE-7 | 2년 미충족 + 65세 미만 사망 미체크 | amber "§16③1호가" |
| FE-8 | hasDisqualifyingIncome=true | amber "§16⑭" |
| FE-9 | hasTaxFraudConviction=true | amber "§18의3⑥" (단독 reason) |
| FE-10 | corporate + 전 요건 ✓ | emerald |
| FE-11 | corporate + heirCorporateOfficer=false | amber "§16③2호나" |
| FE-12 | 후계자 + 18세 미충족 | emerald (트랙 면제) |
| FE-13 | 후계자 + 피상속인 8년 미충족 | amber "§16②1호가" |
| FE-14 | 후계자 + hasDisqualifyingIncome=true | amber "§16⑭" |

### 1-3. AutoSuggestBadge 활성 조건 (F-5)

| 조건 | 배지 노출 |
|---|---|
| farming=undefined (legacy) | ON — suggest 자동 채움 허용 |
| farming + eligible=true | ON |
| farming + eligible=false | **OFF** + amber 안내 "자격 미충족 — 자동 채움 비활성" |
| isApplicable=false (영농 자산 0건) | OFF |

### 1-4. FarmingDeductionDetailRow (F-6) — RD-1~5

| 분기 | 조건 | 색조 | 표시 |
|---|---|---|---|
| RD-1 | evaluated=true + eligible=true + cappedDeduction>0 | emerald | "영농자산 X원 ≤ 30억 → N억 공제" |
| RD-1b | evaluated=true + eligible=true + appliedAssetValue>30억 | emerald + 30억 cap 안내 | "영농자산 35억 → 30억 한도 적용 → 30억 공제" |
| RD-2 | evaluated=true + eligible=true + cappedDeduction=0 (자산 0) | gray | "영농 자산 미입력" |
| RD-3 | evaluated=true + eligible=false + appliedAssetValue>0 | **amber 경고** | "입력 자산 X원 — 자격 미충족 (공제 0원)" + reasons 목록 |
| RD-4 | evaluated=true + eligible=false + appliedAssetValue=0 | gray | "자격 미충족 + 자산 미입력" |
| RD-5 | evaluated=false (legacy) | **violet 안내** | "요건 미평가 (legacy 모드). Step4에서 영농 요건 입력 권장" |

## 2. UI 컴포넌트 명세

### 2-1. `FarmingCategorySection` (F-4)

```tsx
"use client";

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

type FarmingCategory = NonNullable<EstateItem["farmingCategory"]>;

const FARMING_CATEGORY_OPTIONS: Array<{
  value: FarmingCategory | "none";
  label: string;
  description?: string;
  hint?: string;
}> = [
  { value: "none", label: "비영농 자산", description: "기본값" },
  { value: "farmland", label: "농지", description: "농지법 §2①가" },
  { value: "pasture", label: "초지", description: "초지법 §5 초지조성허가" },
  { value: "forest_land", label: "산림지", description: "보전산지 + 산림경영계획 + 5년 조림" },
  { value: "fishing_vessel", label: "어선", description: "어선법 §2①" },
  { value: "fishing_right", label: "어업권·양식업권", description: "마을어업·협동양식업 제외" },
  { value: "agricultural_building", label: "농업용 건축물", description: "건폐율 환산 면적 한정" },
  { value: "salt_field", label: "염전", description: "소금산업진흥법 §2③" },
  { value: "corporate_stock", label: "법인 영농 주식", description: "§15⑤2호 사업무관자산 차감 권장" },
];

export interface FarmingCategorySectionProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
}

export function FarmingCategorySection({ item, onUpdate }: FarmingCategorySectionProps) {
  // 카테고리 호환 가드
  const incompatible: Array<FarmingCategory | "none"> = [];
  if (item.category === "financial" || item.category === "cash" || item.category === "deposit") {
    return null;  // FC-11 미렌더
  }
  if (item.category === "listed_stock" || item.category === "unlisted_stock") {
    // corporate_stock만 가능
    incompatible.push("farmland", "pasture", "forest_land", "fishing_vessel",
                       "fishing_right", "agricultural_building", "salt_field");
  } else {
    // real_estate_* / other: corporate_stock 제외
    incompatible.push("corporate_stock");
  }

  const options = FARMING_CATEGORY_OPTIONS.map((opt) => ({
    ...opt,
    disabled: incompatible.includes(opt.value),
    hint: incompatible.includes(opt.value)
      ? "현재 자산 카테고리와 호환되지 않음"
      : opt.description,
  }));

  const current = item.farmingCategory ?? "none";

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-800 p-3 space-y-2">
      <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
        영농상속 자산 분류 (§18의3 + 시행령 §16⑤)
      </p>
      <RadioCardGroup<FarmingCategory | "none">
        name={`farming-${item.id}`}
        layout="stack"
        tone="emerald"
        value={current}
        options={options}
        onChange={(v) =>
          onUpdate({
            ...item,
            farmingCategory: v === "none" ? undefined : v,
          })
        }
      />
      {/* 선택된 hint 강조 카드 (옵션 description 외에 본법 인용) */}
      {item.farmingCategory && (
        <p className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-100/60 dark:bg-emerald-900/30 rounded p-2">
          ⓘ {options.find((o) => o.value === item.farmingCategory)?.description}
        </p>
      )}
    </div>
  );
}
```

### 2-2. `FarmingEligibilitySection` (F-5)

**파일**: `components/calc/inheritance/FarmingEligibilitySection.tsx` 신규 (~250줄 예상)

**구조**:
- 최상단: 활성화 ToggleCard (3-state 진입)
- 활성 시: 영농 유형 RadioCardGroup (personal/corporate)
- 피상속인 요건 그룹 (ToggleCard × 2~3)
- 상속인 요건 그룹 (ToggleCard × 4~6)
- 영농 부정 §16⑭ + 조세포탈 §18의3⑥ 각 1
- 미리보기 카드 (useMemo evaluateFarmingEligibility)

**Dialog 데이터 폐기 패턴**:
```tsx
const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);

const handleToggleOff = () => {
  if (!farming) return;
  if (isEmptyFarming(farming)) {
    onChange(undefined);  // 즉시
    return;
  }
  setIsDiscardDialogOpen(true);  // 데이터 있을 때만 confirm
};

const handleToggleOn = () => {
  onChange(EMPTY_FARMING);
};
```

**`isEmptyFarming` 헬퍼 정의** (`FarmingEligibilitySection.tsx` 내부):
```tsx
const EMPTY_FARMING: FarmingInheritanceInput = {
  type: "personal",  // 기본값
  decedentEightYearFarming: false,
  decedentResidenceMet: false,
  heirIsAdult: false,
  heirTwoYearFarming: false,
  heirResidenceMet: false,
};

function isEmptyFarming(f: FarmingInheritanceInput): boolean {
  // type 변경만(personal ↔ corporate)은 데이터 없음으로 간주 — 사용자가 유형만 바꾸고 닫으면 confirm 없이 종료
  return (
    f.decedentEightYearFarming === false &&
    f.decedentResidenceMet === false &&
    f.decedentCorporateMet === undefined &&
    f.heirIsAdult === false &&
    f.heirTwoYearFarming === false &&
    f.heirResidenceMet === false &&
    f.decedentEarlyDeath === undefined &&
    f.heirCorporateOfficer === undefined &&
    f.isDesignatedSuccessor === undefined &&
    f.hasDisqualifyingIncome === undefined &&
    f.hasTaxFraudConviction === undefined
  );
}
```

→ ON 직후 즉시 OFF 클릭 + type 변경만 한 경우도 confirm 없이 종료. 사용자가 boolean 항목 1개라도 토글한 후 OFF는 confirm 노출.

**거주지 자산 유형별 동적 안내** (personal 전용):
```tsx
const showLandResidenceHint = farming?.type === "personal" && estateItems.some(i =>
  ["farmland", "pasture", "forest_land", "agricultural_building", "salt_field"].includes(i.farmingCategory ?? "")
);
const showFishingResidenceHint = farming?.type === "personal" && estateItems.some(i =>
  ["fishing_vessel", "fishing_right"].includes(i.farmingCategory ?? "")
);
```

거주지 ToggleCard description에 동적 텍스트:
- 둘 다 true → "농지등 30km + 어선 선적지·연안 30km"
- land만 → "농지등 소재지·연접·30km"
- fishing만 → "어선 선적지·어장 연안·30km"
- 둘 다 false → "Step1에서 영농 자산 분류 필요"

**미리보기 위치**: 활성화 토글이 ON 상태일 때 폼 모든 ToggleCard 그룹 직후, 컴포넌트 최하단. farming=undefined(legacy) 시 미렌더.

```tsx
const evalResult = useMemo(
  () => (farming ? evaluateFarmingEligibility(farming) : null),
  [farming],
);

{evalResult && (
  evalResult.eligible ? (
    <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-2">
      <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
        ✓ 모든 요건 충족
      </p>
    </div>
  ) : (
    <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 space-y-1">
      <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
        ⚠️ 자격 미충족
      </p>
      <ul className="text-[10px] text-amber-700 dark:text-amber-300 list-disc pl-4">
        {evalResult.reasons.map((r, i) => <li key={i}>{r}</li>)}
      </ul>
    </div>
  )
)}
```

### 2-3. Step4 통합 (F-5)

`step4-5.tsx` — 가업상속재산가액 입력 직전 위치:

```tsx
// 영농 자동 채움
const suggestFarming = useMemo(
  () => suggestFarmingAssetValue(allEstateItems),
  [allEstateItems],
);
const farmingEligible = useMemo(
  () => (form.farming ? evaluateFarmingEligibility(form.farming).eligible : true),
  [form.farming],
);
const showFarmingSuggest = farmingEligible;

<div className="space-y-3">
  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
    ── 영농상속공제 (§18의3) ──
  </h3>
  <FarmingEligibilitySection
    farming={form.farming}
    estateItems={allEstateItems}
    onChange={(v) => set({ farming: v })}
  />
  {showFarmingSuggest ? (
    <AutoSuggestBadge
      suggestion={suggestFarming}
      currentValue={form.farmingAssetValue}
      onApply={(v) => set({ farmingAssetValue: v })}
      label="영농상속재산가액"
    />
  ) : suggestFarming.isApplicable ? (
    <div className="rounded-md border border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-800 p-2">
      <p className="text-[11px] text-amber-700 dark:text-amber-300">
        ⚠️ 자격 미충족 — 자동 채움이 비활성화됐습니다. 요건을 충족하거나 수동 입력하세요.
      </p>
    </div>
  ) : null}
  <CurrencyInput
    label="영농상속재산가액 (§18의3)"
    value={form.farmingAssetValue}
    onChange={(v) => set({ farmingAssetValue: v })}
    hint="농지·초지·산림지·어선·어업권·농업용 건축물·염전 등 — 최대 30억 (§18의3①)"
    placeholder="없으면 빈칸"
  />
</div>
```

### 2-4. `FarmingDeductionDetailRow` (F-6)

InheritanceTaxResultView §23 farmingDeduction Row 직후 (FinancialDeductionCountRow 패턴):

```tsx
function FarmingDeductionDetailRow({
  detail,
}: {
  detail?: FarmingDeductionDetail;
}) {
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

  // RD-2/4: gray
  if (detail.cappedDeduction === 0) {
    return (
      <div className="mx-4 my-2 text-[11px] text-gray-500 dark:text-gray-400">
        ⓘ {detail.eligible ? "영농 자산 미입력" : "자격 미충족 + 자산 미입력"}
      </div>
    );
  }

  // RD-1·RD-1b: 정상
  const capped = detail.appliedAssetValue > 3_000_000_000;
  return (
    <div className="mx-4 my-2 text-[11px] text-gray-600 dark:text-gray-400">
      ⓘ 영농자산 {formatKRW(detail.appliedAssetValue)}
      {capped && ` (30억 한도 적용 → ${formatKRW(detail.cappedDeduction)})`}
    </div>
  );
}
```

호출 위치 (Row + Detail 통합 조건):
```tsx
const showFarmingSection =
  result.deductionDetail.farmingDeduction > 0 ||  // RD-1·RD-1b
  result.deductionDetail.farmingDetail !== undefined;  // RD-2·RD-3·RD-4·RD-5 (detail 존재)

{showFarmingSection && (
  <>
    {result.deductionDetail.farmingDeduction > 0 && (
      <Row
        label="영농상속 공제 (§18의3)"
        value={formatKRW(result.deductionDetail.farmingDeduction)}
      />
    )}
    <FarmingDeductionDetailRow detail={result.deductionDetail.farmingDetail} />
  </>
)}
```

**규칙**:
- `farmingDeduction > 0` (RD-1·RD-1b): Row + Detail 모두 표시
- `farmingDeduction = 0` + `farmingDetail` 존재 (RD-2~5): Row 미표시 + Detail만 (사용자 혼란 차단 — "공제 0원" 텍스트는 Detail 자체가 명시)
- `farmingDetail` 미존재 (엔진 갱신 전 케이스): 양쪽 미표시 (기존 동작 호환)

## 3. 14지점 동기화 (PR-A)

| 지점 | 변경 | 상태 |
|---|---|---|
| ① 폼 타입 | shared.ts FormState.farming | F-5 |
| ② initial | INITIAL_FORM.farming = undefined | F-5 |
| ③ normalize | sessionStorage 마이그 — farming undefined 유지 (boolean·enum optional 자동 통과) | F-5 |
| ④ API 변환 | buildInput.farming = form.farming 정식 매핑 (현재 undefined 자리만) | F-5 |
| ⑤ UI 위젯 | FarmingCategorySection + FarmingEligibilitySection + FarmingDeductionDetailRow + AutoSuggestBadge 재사용 | F-4·F-5·F-6 |
| ⑥ 사이드바 | 영농 자산 합 (옵션 — 본 PR 미포함) | — |
| ⑦ 결과 카드 | FarmingDeductionDetailRow 5-way 분기 (RD-1·RD-1b·RD-2·RD-3·RD-4·RD-5) + Row/Detail 통합 조건 | F-6 |
| ⑧ validation | farming 활성 시 type 필수만 강제, 그 외 optional boolean (`inheritance-validate.ts`에 차단 추가 안 함) | F-5 |
| ⑨~⑭ | 변경 없음 (이미 670bfec 완료) | — |

## 4. 색상·tone 가이드

| UI 요소 | tone | 의미 |
|---|---|---|
| FarmingCategorySection | emerald | 영농 자산 = 공제 혜택 |
| FarmingEligibilitySection 카드 | violet | 자격·거주·관계 (DeemedCategorySection 패턴) |
| 미리보기 충족 | emerald | OK |
| 미리보기 미충족 | amber | 경고 |
| AutoSuggestBadge 자격 미충족 안내 | amber | 자동 채움 비활성 |
| RD-1 정상 공제 | emerald (그러나 본 카드는 gray 사용 — 단순 보조 정보) | 정상 안내 |
| RD-3 자격 미충족 + 입력 존재 | amber | 강한 경고 |
| RD-5 legacy 미평가 | violet | 권유 |

다크모드 정적 매핑 강제 (`[[feedback_tailwind_static_tone_mapping]]`).

## 5. 사용자 시나리오

### A — 단순 개인 영농 (FE-2 + RD-1)
1. Step1: 농지 자산 입력 → FarmingCategorySection "농지" 선택
2. 평가액 5억 입력
3. Step4: 영농 요건 토글 ON → 빈 객체 초기화
4. 영농 유형 "개인" 선택, 피상속인 8년·거주 ✓, 상속인 18세·2년·거주 ✓
5. 미리보기 emerald "✓ 모든 요건 충족"
6. AutoSuggestBadge "5억" 채우기
7. 결과 RD-1 "영농자산 5억 → 5억 공제"

### B — 후계자 미성년 (FE-12 + RD-1)
1. Step1: 농지 10억 + farmingCategory=farmland
2. Step4: 영농 유형 personal, 피상속인 요건 모두 ✓
3. "영농·영어·임업후계자" 토글 ON
4. 18세·2년·거주 회색 비활성 표시
5. 미리보기 emerald
6. AutoSuggestBadge 10억 채우기 → 결과 RD-1

### C — 자격 미충족 + 입력 보존 (FE-3 + RD-3)
1. Step1: 농지 5억 + farmingCategory=farmland
2. Step4: 토글 ON, 피상속인 8년 ✗ (체크 안 함)
3. 미리보기 amber "§16②1호가"
4. AutoSuggestBadge → amber "자격 미충족 — 자동 채움 비활성"
5. 사용자가 5억 수동 입력 (자기 의지)
6. 결과 RD-3 amber "입력 자산 5억 — 자격 미충족으로 공제 0원" + reasons

### D — Legacy 모드 (FE-1 + RD-5)
1. Step4: 영농 요건 토글 OFF (default)
2. 사용자가 farmingAssetValue 5억 직접 입력
3. 결과 RD-5 violet "요건 미평가 (legacy)" 안내

## 6. 접근성 / 인쇄

- 모든 RadioCardGroup·ToggleCard 키보드 접근 (기본 보장)
- FarmingDeductionDetailRow 조건부 렌더이므로 인쇄 시 펼침 상태 유지
- Dialog 데이터 폐기 — focus trap·ESC·외부 클릭 (`[[feedback_dialog_data_discard_confirm]]`)
- 미리보기 reasons 목록 — `<ul>` 시맨틱

## 7. Pre-Do anchor (우선 실행)

엔진 anchor 이미 통과 (670bfec). UI 단위 anchor:
- **FC-9** (corporate_stock 외 옵션 disabled)
- **FE-1 → FE-12 토글 ON 흐름** (3-state 안정성)
- **RD-3** (자격 미충족 + 사용자 입력 보존 UI)

실패 시 디자인 환류 — §2 컴포넌트 시그니처 갱신.

## 8. 800줄 정책 영향

| 파일 | 현재 | PR-A 후 예상 |
|---|---|---|
| step4-5.tsx | 232 | ~290 (+58) ✅ |
| FarmingEligibilitySection.tsx | 0 | ~250 (신규) ✅ |
| FarmingCategorySection.tsx | 0 | ~100 (신규) ✅ |
| PropertyValuationForm.tsx | ~580 | +5줄 (FarmingCategorySection import + 1 호출) ✅ |
| StockValuationForm.tsx | ~480 | +10줄 (corporate_stock 분기 안내) ✅ |
| InheritanceTaxResultView.tsx | ~400 | +40줄 (FarmingDeductionDetailRow inline) ✅ |

전 파일 800줄 미만 유지.

## 9. F-7·F-8·F-9 UI 개요 (별도 PR)

### F-7 PostMgmt UI
- **위치**: `app/calc/inheritance-postmgmt/page.tsx` 별도 페이지 신규 (Step5 추가는 본 마법사 800줄·복잡도 증가 차단). 메인 마법사 결과 카드에서 "사후관리 시뮬레이터 →" 링크 추가
- **이유**: 사후관리는 상속 5년 후 발생 — 본 마법사 1회 계산과 시간축 분리. 결과 보존 후 별도 진입 자연스러움
- 입력 폼: violation 라디오 + violationDate + filingDeadline (메인 마법사 deathDate에서 자동 +6개월) + determinedTax + interestRate + justifiedReason (violation ∈ {asset_disposed, farming_ceased}일 때만 활성)
- 결과 카드: recaptureAmount + interestAmount + totalRecapture + reportDeadline + breakdown 펼침
- 데이터 흐름: 메인 마법사 result.deductionDetail.farmingDeduction을 originalDeduction 사전 입력 (querystring 또는 sessionStorage)

### F-8 CorporateNonBusinessAssetsSection
- 위치: StockValuationForm·PropertyValuationForm 카드 내부 — `FarmingCategorySection`/`isFamilyBusinessAsset` 직후
- 조건부 렌더: `farmingCategory==="corporate_stock"` OR `isFamilyBusinessAsset===true`
- 5 CurrencyInput + 1 totalAssets + 자동 비율 useMemo

### F-9 §16② 단서 토글
- 위치: FarmingEligibilitySection 내부 corporate 모드 전용
- ToggleCard: "본 상속이 직전 영농상속 최대주주(상속받지 않은 자) 사망에 의한 상속" (rare 케이스)

## 10. 범위 외 (계획서 §10)

- F-10 거주지 Vworld 자동화 (별도 PR-E)
- F-11 상속인 일부 분리 공제 (별도 PR-F)

# 상속세 마법사 — 추가 공제 입력 자동 채움 + 간주상속재산 입력 (Plan v2)

> 작성일: 2026-05-21 (v2 개정)
> 대상 파일: `components/calc/inheritance/step4-5.tsx`(Step4) · `components/calc/inheritance/steps.tsx`(Step1/Step2) · `components/calc/inheritance/DebtAllocationInput.tsx` · `lib/tax-engine/types/inheritance-gift.types.ts`
> 관련 엔진: `lib/tax-engine/deductions/gift-deductions.ts` · `lib/tax-engine/inheritance-tax.ts`
> 정책 참조: `[[single-source-engine-helper]]` · `[[feedback_no_silent_apportion_fallback]]` · `[[feedback_useeffect_store_mirror_forbidden]]` · `[[mirror-pattern]]` · `[[feedback_explicit_prop_mapping_strip]]` · `[[feedback_three_state_optional_mode_toggle]]` · `[[korean-law-citation-verify]]`

## 1. 배경 및 v2 추가 요구사항

v1은 Step4 "추가 공제 입력 (선택)" 9개 필드의 자동 채움만 다뤘다. v2는 사용자 피드백으로 **선행 데이터 입력 구조 자체를 §22(금융재산공제) 정합으로 재설계**한다.

### 1-1. 신규 요구 3건

| # | 요구 | 영향 영역 |
|---|---|---|
| R1 | 금융재산(예금·주식·유가증권·채권) 입력 시 **§22 금융재산공제 대상 여부 체크박스** 추가 | EstateItem 신규 필드 + Step1 UI |
| R2 | 채무 입력 시 **금융재산에서 차감할 부채인지 체크박스** 추가 | DebtItem 신규 필드 + Step2 UI · DebtAllocationInput |
| R3 | 상속재산 입력 메뉴에 **간주상속재산(보험금·신탁자산·퇴직금) §10** 추가 | EstateItem `deemedCategory` UI 노출 + Step1 신규 분류 카드 |

### 1-2. 법령 정합 (KoreanLaw MCP 2026-05-21 검증 완료 ✅)

**§22 금융재산상속공제 (본법 mst=276123, 시행 2026-01-02)**
- 순금융재산 = 대통령령으로 정하는 금융재산 − 대통령령으로 정하는 금융채무
- 공제액: 순금융재산 > 2천만 → max(20%, 2천만), **한도 2억**. ≤ 2천만 → 전액 공제
- **§22② 제외**: 대통령령으로 정하는 최대주주·최대출자자 보유주식 + 상속세 신고기한까지 미신고 차명 금융재산
  - **최대주주 정의 (상증령 §19②)**: 주주등 1인과 그의 특수관계인의 보유주식등을 합하여 그 보유주식등의 합계가 가장 많은 경우의 해당 주주등 1인과 그의 특수관계인 모두

**금융재산 정의 — 상증령 §19 ① (mst=283637)**
- 금융회사등이 취급하는: 예금·적금·부금·계금·출자금·**신탁재산(금전신탁만)**·보험금·공제금·주식·채권·수익증권·출자지분·어음 등의 금전·유가증권
- + 재정경제부령으로 정하는 것 (시행규칙 별도 확인 — 후속)

**금융채무 정의 — 상증령 §19 ④**
- **§10① 1호로 입증된 금융회사등에 대한 채무만** (사적채무·담보 사적채무는 §22 차감 대상 아님)
- 금융회사등 = 금융실명법 §2 1호 (상증령 §10②)

**간주상속재산 — 본법 §8 / §9 / §10**
- §8 보험금: 피상속인이 보험계약자인 생명·손해보험 (실질 납부자 포함 §8②)
- §9 신탁재산: 피상속인 신탁재산 (§33① 수증자 분 제외)
- §10 퇴직금 등: 퇴직금·퇴직수당·공로금·연금. **국민연금·공무원연금·군인연금·산재 유족급여 제외 (1~6호)**

**§22와 §8·§9·§10 교집합**
- 보험금 (§8 간주상속) ∩ (§19① 보험금) → §22 default true
- 신탁재산 (§9 간주상속) ∩ (§19① 금전신탁만) → **금전신탁만** default true. 부동산·증권신탁은 default false
- 퇴직금 (§10 간주상속) — §19① 미열거 → **§22 default false** ✓

**기존 타입 활용**: `EstateItem.deemedCategory?: "retirement" | "insurance" | "trust"` 이미 존재. UI 입력 메뉴만 부재 → 추가만 필요 (엔진 분기 0).

## 2. 데이터 모델 변경

### 2-1. `EstateItem` 신규 필드 (R1·R3)

```typescript
export interface EstateItem {
  // ... (기존 필드 유지)

  // ===== R1: §22 금융재산공제 대상 여부 =====
  /**
   * §22 금융재산공제 대상 여부 (사용자 명시 체크).
   * 우선순위: 명시값(true/false) > deemedCategory override > 카테고리 default
   * - undefined: 자동 추론
   *     • deemedCategory==="insurance" → true (§19① 보험금)
   *     • deemedCategory==="trust" → false (§19①은 금전신탁만, 안전 default)
   *     • deemedCategory==="retirement" → false (§19① 미열거)
   *     • 그 외 카테고리: financial/listed_stock/unlisted_stock/deposit → true / 나머지 false
   * - true: 명시 포함 (예: 신탁이 금전신탁임을 사용자 체크)
   * - false: 명시 제외 (예: financial이지만 §22② 차명·미신고)
   * 안전 default 정책: 모호한 경우(특히 신탁) false 채택 — 사용자가 명시적으로 포함 체크 필요.
   */
  isFinancialAssetForDeduction?: boolean;

  // ===== R3: 간주상속재산 (§8 보험금 / §9 신탁 / §10 퇴직금) =====
  // deemedCategory?: "retirement" | "insurance" | "trust"; (기존 필드 활용 — UI 노출만 추가)

  // ===== R3-보강: 신탁 유형 (선택) =====
  /**
   * 신탁 유형 — deemedCategory==="trust"일 때만 의미.
   * §19① "금전신탁만" 정합 위해 필요. UI에서 라디오로 선택.
   * - "cash_trust": 금전신탁 → §22 default true
   * - "real_estate" | "security" | "other": §22 default false
   * 미입력 시 보수적으로 false (§22 미적용).
   */
  trustType?: "cash_trust" | "real_estate" | "security" | "other";
}
```

- **3-state 의도** (`[[feedback_three_state_optional_mode_toggle]]`): undefined=카테고리 기본 / true·false=사용자 명시. UI는 3-state 라디오 또는 "기본 적용" + ToggleCard 1단계.

### 2-2. `DebtItem` 신규 필드 (R2)

```typescript
export interface DebtItem {
  // ... (기존 필드 유지)

  /**
   * §22 순금융재산 산식의 차감 채무 여부 (사용자 명시 체크).
   * 법령: 상증령 §19④ — "§10① 1호로 입증된 금융회사등에 대한 채무"만 차감 가능.
   * 따라서 본 플래그는 DebtCategory==="financial"일 때만 의미 있음.
   * - undefined: 카테고리 기본값 추론 (category==="financial" → true / 그 외 → false 강제)
   * - true: 명시 — §10① 1호 입증 완료
   * - false: 명시 제외 — financial 카테고리지만 입증 미비 등
   * UI: category !== "financial"이면 체크박스 disabled + disabledReason 표시.
   * 주의: 본 플래그는 §22 순금융 계산에만 영향. 채무 본래의 과세가액 차감(§14)은 그대로 작동.
   */
  isFinancialDebtForDeduction?: boolean;
}
```

### 2-3. `AssetCategory` 검토 (R3)

기존 `AssetCategory`는 보험금·신탁·퇴직금 별도 enum이 없고 `deemedCategory`로 표시 분류만 한다. **본 계획은 enum 확장 안 함**. 사용자가 카테고리는 `cash`·`financial`·`other` 등으로 선택하고 `deemedCategory`로 간주분류 표시.

**대안 검토** (Plan 토론용):
- A안 (현행 유지): `AssetCategory`는 그대로. UI Step1에 "간주상속재산 (§10)" 그룹 카드 분리 + 입력 시 `deemedCategory` 자동 부여
- B안 (enum 확장): `AssetCategory`에 `deemed_insurance`·`deemed_trust`·`deemed_retirement` 추가. 평가 분기·legacy 마이그 부담

→ **A안 채택**: 회귀 위험 0. UI 입력 카드만 분리하여 명확성 확보.

## 3. 필드별 자동입력 가능성 매트릭스 (v2 갱신)

| # | 필드 | 도출 소스 (v2) | 자동화 등급 | 비고 |
|---|---|---|---|---|
| 1 | 배우자 실제 상속액 | 협의분할 spouse 분배 합 | ★★ 부분 | v1과 동일 |
| 2 | **순 금융재산** | `Σ(resolveFinancialEligibility=true EstateItem 평가액)` − `Σ(resolveFinancialDebt=true DebtItem 금액)` | **조건부 ★★★** (사용자 체크 정확성에 의존) | v1 산식 폐기. 안전 default + 사용자 명시 체크 기반. R1·R2 입력 누락·오체크 시 결과 오류 가능 → AutoSuggestBadge에 "자산 N건·채무 M건 기준" 카운트 노출로 사용자가 자가 검증 |
| 3 | 동거주택 공시가격 | 주택 후보 라디오 선택 | ★★ 부분 | v1과 동일 |
| 4 | 동거주택공제 직접 입력 | — | ✗ 불가 | |
| 5 | 영농상속재산가액 | `AssetCategory` 확장 선행 | ✗ 보류 | 본 계획 범위 외 |
| 6 | 가업상속재산가액 | `isFamilyBusinessAsset` 합산 | ★★★ 완전 | v1과 동일 |
| 7 | 가업상속공제 직접 입력 | — | ✗ 불가 | |
| 8 | 상속외자 유증 금액 | `heirAllocations` 중 legatee/corporate 분배 합 | ★★★ 완전 | v1과 동일 |
| 9 | 사전증여 증여재산공제 합계 | `calcRelationDeduction` 헬퍼 그룹별 호출 | ★★★ 완전 | v1과 동일 |

### 3-1. 순 금융재산 산식 변경 핵심

**v1 (단순 카테고리 매칭, 폐기)**: `category === "financial"` 합 − `mortgageAmount` 합
- 한계: 상장주식·채권은 `listed_stock`·`other` 카테고리지만 §22 대상. mortgageAmount는 자산-수준 저당이지 §22 금융채무가 아님.

**v2 (사용자 명시 체크, 채택)**: `isFinancialAssetForDeduction === true` 합 − `isFinancialDebtForDeduction === true` 합
- 카테고리 기본값(`undefined`)일 때만 매핑 추론: financial·deposit·listed_stock·unlisted_stock=true / 나머지=false
- 사용자 체크가 카테고리 기본값을 override
- 결정적 + 사용자 의사 반영 + §22 정의 변동(시행령 개정) 시 카테고리 매핑만 수정

## 4. UX 원칙 (강제) — v1 유지 + 추가

### 4-1. 자동 덮어쓰기 금지 (`[[feedback_no_silent_apportion_fallback]]`)
- v1과 동일

### 4-2. `useEffect → store` 미러링 금지 (`[[mirror-pattern]]`)
- v1과 동일

### 4-3. 단일 진실 헬퍼 재사용 (`[[single-source-engine-helper]]`)
- v1과 동일

### 4-4. 신규: 체크박스 default 표시 정책

- 자산·채무 입력 시 §22 체크박스 옆에 **카테고리 기본값 배지** 노출 ("기본 적용" / "기본 제외").
- 사용자가 체크박스를 토글하면 "사용자 지정" 배지로 전환. undefined → true/false 명시.
- "기본값으로 되돌리기" 버튼 (체크박스 토글 후만 노출).

### 4-5. 신규: 명시 prop strip 차단 (`[[feedback_explicit_prop_mapping_strip]]`)

`EstateItem`·`DebtItem` 신규 필드 추가 시 다음 위치 grep 전수 점검:
- `GiftTaxForm`·`InheritanceTaxForm` 명시 매핑
- `lib/calc/inheritance-tax-api.ts` 변환
- 결과 화면 자산 표 렌더 (`isFamilyBusinessAsset` 패턴 참조)
- sessionStorage 마이그레이션 (`undefined` 정상 처리)

spread 우선 + 필요 시 명시 매핑에 신규 필드 추가.

## 5. 구현 범위 (Phase 순서 갱신)

| Phase | 범위 | 우선순위 | 의존 | 비고 |
|---|---|---|---|---|
| ~~A-0~~ | ~~§19 KoreanLaw MCP 검증~~ | **✅ 완료** | — | 정정 4건 반영 |
| A-1 | R1 — `EstateItem.isFinancialAssetForDeduction` + `trustType` + Step1 입력 위젯 + sessionStorage 마이그 | 높음 | A-3과 동시 (deemedCategory default 매핑 의존) | R2·R3과 1 PR 묶음 가능 |
| A-2 | R2 — `DebtItem.isFinancialDebtForDeduction` + Step2/DebtAllocationInput 위젯 | 높음 | — | R1과 함께 PR |
| A-3 | R3 — Step1 간주상속재산 그룹 카드 + `deemedCategory` 입력 (보험금/신탁/퇴직금) + trustType 조건부 라디오 | 높음 | A-1 default 매핑 정의 필요 | R1·R2와 1 PR |
| A-4 | #2 순 금융재산 — `suggestNetFinancialAssets` + AutoSuggestBadge | 높음 | **A-1·A-2·A-3 모두 선행 필수** | |
| A-5 | #9 사전증여 증여재산공제 합계 — `suggestPriorGiftDeductionTotal` (엔진 헬퍼 재사용) | 높음 | A-1·A-2·A-3 무관 | 병렬 진행 가능 |
| A-6 | #6 가업상속재산가액 — `suggestFamilyBusinessValue` | 중간 | — | `isFamilyBusinessAsset` 기존 필드 활용 |
| A-7 | #8 상속외자 유증 금액 — `suggestLegateeAmountNonHeir` (협의분할 한정) | 중간 | heirAllocations 데이터 존재 시만 | |
| A-8 | #1 배우자 실제 상속액 — `suggestSpouseActualAmount` (협의분할 한정) | 낮음 | 엔진 fallback 존재 | |
| A-9 | #3 동거주택 공시가격 — 후보 라디오 UX | 낮음 | — | |

**의존 그래프**:
```
A-3 (deemedCategory 입력)
  ↓ default 매핑 정의
A-1 (R1 체크박스)  A-2 (R2 체크박스)
  ↓                 ↓
  └──── A-4 (순 금융재산 자동) ────┘
A-5·A-6·A-7·A-8·A-9 — 독립 진행
```

영농상속(#5)·직접 입력(#4·#7)은 본 계획 대상 외.

## 6. 구현 세부

### 6-1. R1 — 금융재산공제 대상 체크박스 (Step1)

EstateItem 입력 카드에 `category` 선택 직후 §22 체크박스 노출:

```tsx
// components/calc/inheritance/EstateItemForm.tsx (가칭)
<div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2 space-y-1">
  <div className="flex items-center justify-between">
    <label className="text-xs font-medium text-emerald-800">
      §22 금융재산공제 대상
    </label>
    <CategoryDefaultBadge category={item.category} />  {/* "기본 적용" / "기본 제외" */}
  </div>
  <ToggleCard
    tone="emerald" size="sm" variant="chip"
    title={resolveFinancialEligibility(item) ? "공제 대상으로 포함" : "공제 대상 제외"}
    checked={resolveFinancialEligibility(item)}
    onCheckedChange={(v) => updateItem({ isFinancialAssetForDeduction: v })}
  />
  {item.isFinancialAssetForDeduction !== undefined && (
    <button className="text-[10px] text-emerald-700 underline"
      onClick={() => updateItem({ isFinancialAssetForDeduction: undefined })}>
      기본값으로 되돌리기
    </button>
  )}
</div>
```

`resolveFinancialEligibility(item)`은 `lib/calc/financial-deduction-resolver.ts` (신규):
```typescript
// 법령: 상증령 §19① — 금융회사등이 취급하는 예금·적금·부금·계금·출자금·신탁재산(금전신탁만)·
// 보험금·공제금·주식·채권·수익증권·출자지분·어음 + 시행규칙 정하는 것
const CATEGORY_DEFAULT: Partial<Record<AssetCategory, boolean>> = {
  financial: true,        // 예금·적금·부금·채권·수익증권 등
  deposit: true,          // 전세보증금 반환채권 — 금융회사 예치인 경우 (사용자 override로 미세조정)
  listed_stock: true,     // §22② 최대주주 보유분은 별도 제외
  unlisted_stock: true,   // §22② 최대주주 보유분은 별도 제외
  // cash·real_estate_*·other → default false
};
export function resolveFinancialEligibility(item: EstateItem): boolean {
  // 우선순위 1: 사용자 명시값
  if (item.isFinancialAssetForDeduction !== undefined) return item.isFinancialAssetForDeduction;
  // 우선순위 2: deemedCategory override
  // §8 보험금 — §19① 보험금 명시 → default true
  if (item.deemedCategory === "insurance") return true;
  // §9 신탁재산 — §19① "금전신탁만" 정합. trustType="cash_trust"만 true, 그 외 false (안전 default)
  if (item.deemedCategory === "trust") return item.trustType === "cash_trust";
  // §10 퇴직금 — §19① 미열거 → default false
  if (item.deemedCategory === "retirement") return false;
  // 우선순위 3: 카테고리 default
  return CATEGORY_DEFAULT[item.category] ?? false;
}
```

**평가액 도출** (`getValuatedAmount`): 평가 엔진 결과(`PropertyValuationResult.valuatedAmount`)가 폼 상태에 캐시되어 있으면 우선 사용. 없으면 폴백 `marketValue ?? standardPrice ?? appraisedValue ?? (listedStockAvgPrice × listedStockShares) ?? 0`. 비상장주식은 `evaluateUnlistedStock`(가칭 — 실제 평가 엔진 함수명 확인 필요) 호출 결과를 사용. → **엔진 헬퍼 import** (`[[single-source-engine-helper]]`). 디자인 단계에서 정확 헬퍼 경로 동결.

**§22② 최대주주 제외**: `unlistedStockData`에서 보유지분율을 도출하거나 별도 `isMajorShareholderStock?: boolean` 필드 추가 검토 — **본 계획 후속 PR**. 현재는 사용자 체크박스 override로 처리.

### 6-2. R2 — 부채 금융채무 체크박스 (Step2)

`DebtAllocationInput.tsx`의 각 DebtItem 카드에 추가:

```tsx
<ToggleCard tone="rose" size="sm" variant="chip"
  title="§22 순금융재산 차감 채무"
  description="§10① 1호 입증된 금융회사등 채무 (상증령 §19④)"
  checked={resolveFinancialDebt(debt)}
  onCheckedChange={(v) => updateDebt({ isFinancialDebtForDeduction: v })}
  disabled={debt.category !== "financial"}
  disabledReason="§22 금융채무는 금융회사등에 대한 채무로 한정 (상증령 §19④). 사적채무·공과금·장례비는 §22 차감 대상 아님"
/>
```

`resolveFinancialDebt(debt)`:
```typescript
export function resolveFinancialDebt(debt: DebtItem): boolean {
  // 법령: 상증령 §19④ — financial 카테고리 외에는 강제 false (override 불가)
  if (debt.category !== "financial") return false;
  if (debt.isFinancialDebtForDeduction !== undefined) return debt.isFinancialDebtForDeduction;
  return true;  // financial 카테고리 default true
}
```

legacy `form.debts` 문자열(undefined debtItems 모드)은 §22 차감 대상에서 **항상 제외** — 사용자가 debtItems 모드로 전환해야 §22 적용 안내 카드 노출.

### 6-3. R3 — 간주상속재산 입력 (Step1)

Step1에 신규 그룹 카드 추가 (기존 `estateItems` 입력 영역 하단):

```tsx
<SectionHeader title="간주상속재산 (§8·§9·§10)" tone="violet"
  description="보험금·신탁재산·퇴직금 — 본래상속재산과 합산되어 과세" />
<DeemedInheritanceList items={form.estateItems.filter(i => i.deemedCategory)}
  onAdd={(category) => addEstateItem({
    category: category === "insurance" ? "cash" : "other",
    deemedCategory: category,
    // §19① 매핑 (KoreanLaw MCP 검증 완료)
    // 보험금·신탁 default true / 퇴직금 default false
  })}
/>
```

조문별 매핑 (1차 정정 반영):
- **보험금 (§8 본법, insurance)** → 카테고리 `cash` + §22 default **true** (상증령 §19① 보험금 명시)
  - UI 안내: "피상속인이 보험계약자인 생명·손해보험 (§8①). 실질 납부자도 포함 (§8②)"
- **신탁재산 (§9 본법, trust)** → 카테고리 `other` + **trustType 라디오 노출** + §22 default **trustType="cash_trust"일 때만 true** (안전 default false)
  - UI 안내: "§22 금융재산공제는 **금전신탁만 적용** (상증령 §19①)"
  - UI 안내: "신탁 유형 선택 — 금전신탁(§22 적용) / 부동산신탁·증권신탁·기타(§22 미적용)"
  - UI 안내: "§33① 수증자 분 신탁이익은 상속재산 제외 (§9① 단서)"
- **퇴직금 (§10 본법, retirement)** → 카테고리 `cash` + §22 default **false**
  - UI 안내: "**제외 항목**: 국민연금·공무원연금·사립학교교직원연금·군인연금 유족급여, 산재 유족보상, 업무상 사망 유족보상금 (§10 1~6호)"

`addEstateItem` 초기값:
```typescript
{
  category: deemedCat === "insurance" || deemedCat === "retirement" ? "cash" : "other",
  deemedCategory: deemedCat,
  // R3-보강: trust 선택 시 trustType은 undefined로 초기화 — 사용자가 라디오에서 명시 선택
  trustType: deemedCat === "trust" ? undefined : undefined,  // (명시적으로 undefined 유지)
  // isFinancialAssetForDeduction undefined → resolveFinancialEligibility가 default 도출
}
```

평가는 기존 PropertyValuationForm 경로 재사용 (시가·보충적 평가 모두 사용 가능). 입력 위젯만 분리.

**결과 카드 영향**: 기존 `deemedCategory` 분리 노출 코드가 이미 존재 (타입 주석 "결과 카드 분리 노출용"). UI 입력만 추가하므로 결과 화면 변경 0 또는 라벨 확인만.

### 6-4. 자동 채움 헬퍼 (Step4)

`lib/calc/inheritance-deduction-suggest.ts` (v1 계획 유지, 시그니처 갱신):

```typescript
export function suggestNetFinancialAssets(
  estateItems: EstateItem[],
  debtItems: DebtItem[] | undefined
): DeductionSuggestion {
  const eligibleAssets = estateItems.filter(resolveFinancialEligibility);
  const eligibleDebts = (debtItems ?? []).filter(resolveFinancialDebt);
  const assets = eligibleAssets.reduce((sum, i) => sum + getValuatedAmount(i), 0);
  const debts = eligibleDebts.reduce((sum, d) => sum + d.amount, 0);
  const value = Math.max(0, assets - debts);
  return {
    value,
    reason: "§22 대상 금융재산 − 금융채무",
    breakdown: [
      `금융자산 합계: ${formatKrw(assets)}원 (${eligibleAssets.length}건)`,
      `금융채무 합계: ${formatKrw(debts)}원 (${eligibleDebts.length}건)`,
      `순 금융재산: ${formatKrw(value)}원`,
    ],
    isApplicable: assets > 0 || debts > 0,
  };
}
```

- `getValuatedAmount(item)`은 `marketValue ?? standardPrice ?? appraisedValue ?? listedStockAvgPrice * listedStockShares ?? 0` 패턴. 단, 평가 엔진 결과(`PropertyValuationResult`)가 이미 계산된 경우 그 값을 우선. → **엔진 헬퍼 import** (`[[single-source-engine-helper]]`)
- 사용자가 debtItems OFF 모드(legacy `form.debts`)면 debts=0으로 처리 + AutoSuggestBadge에 "💡 채무도 §22 적용하려면 부채 협의분할 모드를 켜세요" 안내

## 7. 14지점 동기화 검토 (v2)

> 본 표의 ①~⑭ 컨벤션은 CLAUDE.md의 양도세 14지점 정의에서 차용. 상속세 영역은 일부 지점(⑪ acquisitionDate fallback)이 해당 없음 — 양도세 자산 컨벤션이므로 본 계획에서는 "해당 없음" 표시.

| 지점 | R1·R2·R3 변경 | 자동 채움 헬퍼 |
|---|---|---|
| ① 폼 타입 | `EstateItem`·`DebtItem` 신규 필드 3개 (`isFinancialAssetForDeduction`·`trustType`·`isFinancialDebtForDeduction`) | 변경 없음 |
| ② initial | EstateItem·DebtItem factory에 `undefined` 명시 (`createInitialEstateItem`·`createInitialDebtItem`) | 변경 없음 |
| ③ normalize | sessionStorage 마이그 — `lib/stores/calc-wizard-migration.ts` 또는 `components/calc/inheritance/shared.ts`의 `normalizeEstateItem`/`normalizeDebtItem`에서 신규 필드 `undefined` 기본값 유지 | 변경 없음 |
| ④ API 변환 | `lib/calc/inheritance-tax-api.ts` (또는 InheritanceTaxForm `buildInput`) — spread 점검 + 명시 매핑 grep (`feedback_explicit_prop_mapping_strip`) | 변경 없음 |
| ⑤ UI 위젯 | EstateItemForm + DebtAllocationInput 체크박스 + Step1 간주상속재산 그룹 카드 + Step4 AutoSuggestBadge × 6 | **6곳 추가** |
| ⑥ 사이드바 | 변경 없음 (엔진 input 동일) | 변경 없음 |
| ⑦ 결과 카드 | `components/calc/results/InheritanceTaxResultView.tsx` (또는 `components/calc/inheritance/InheritanceSidebar.tsx`) — `deemedCategory` 분리 표시 라벨 확인. 신규 trust 항목 라벨 보강 | 변경 가능성 검토 |
| ⑧ validation | EstateItem·DebtItem 신규 필드는 optional boolean → validation 영향 0. trustType은 deemedCategory==="trust"일 때만 의미 (cross-field 강제 안 함, UI 안내로 처리) | 변경 없음 |
| ⑨ Zod enum 메인 | `app/api/calc/inheritance/route.ts` 또는 `lib/api/schemas/` — estateItemSchema에 `isFinancialAssetForDeduction: z.boolean().optional()` + `trustType: z.enum([...]).optional()` 추가 | 변경 없음 |
| ⑩ Zod enum 컴패니언 | DebtItem schema (만약 별도 schema 분리 시) — `isFinancialDebtForDeduction: z.boolean().optional()` 추가. `addPropertyRefines` 검토 | 변경 없음 |
| ⑪ acquisitionDate fallback | 본 계획 무관 (양도세 전용 지점) | 해당 없음 |
| ⑫ Zod 입력 객체 정의 | inheritanceInputSchema의 estateItems·debtItems 배열 element 스키마에 신규 필드 추가. **누락 시 TS 미감지로 침묵 strip** — grep 필수 | **위험 ★★★** |
| ⑬ callInheritanceTaxAPI body spread | `lib/calc/inheritance-tax-api.ts`의 callInheritanceTaxAPI body 구성 시 estateItems·debtItems 명시 매핑이 있으면 신규 필드 누락 → 침묵 strip | **위험 ★★★** |
| ⑭ Route handler 엔진 input 매핑 | `app/api/calc/inheritance/route.ts`의 엔진 호출 input 매핑에서 estateItems·debtItems spread 확인. Date 변환 해당 없음 (boolean·enum 필드만 추가). spread 보장 시 변경 없음 | 위험 ★ (⑫⑬가 spread면 ⑭ 자동 통과) |

**주의**: `[[feedback_explicit_prop_mapping_strip]]` — `inheritance-tax-api.ts`에 명시 매핑이 있으면 신규 필드 추가 누락 시 침묵 strip. spread 패턴으로 전환 또는 명시 매핑 grep 전수 추가.

## 8. 테스트 (anchor)

### 8-1. `__tests__/lib/calc/financial-deduction-resolver.test.ts` (신규)

| Anchor | 시나리오 | 기대 |
|---|---|---|
| FDR-1 | `category="financial"`, undefined | `resolveFinancialEligibility = true` (§19① 예금·적금·채권) |
| FDR-2 | `category="real_estate_land"`, undefined | `false` |
| FDR-3 | `category="financial"`, isFinancialAssetForDeduction=true (명시) | `true` (명시값 = default 일치) |
| FDR-4 | `category="financial"`, isFinancialAssetForDeduction=false | `false` (사용자 override — §22② 차명 미신고 등) |
| FDR-5 | `category="cash"`, deemedCategory="insurance" | `true` (§19① 보험금) |
| FDR-6 | `category="cash"`, deemedCategory="retirement" | `false` (§19① 미열거) |
| FDR-7 | `category="other"`, deemedCategory="trust", trustType=undefined | **`false`** (안전 default — trustType 미입력) |
| FDR-7b | `category="other"`, deemedCategory="trust", trustType="cash_trust" | `true` (§19① 금전신탁 명시) |
| FDR-7c | `category="other"`, deemedCategory="trust", trustType="real_estate" | `false` (§19① 미열거) |
| FDR-7d | `category="other"`, deemedCategory="trust", trustType="security" | `false` (§19① 미열거) |
| FDR-7e | `category="other"`, deemedCategory="trust", trustType="other" | `false` (§19① 미열거) |
| FDR-8 | `category="other"`, deemedCategory="trust", trustType="real_estate", isFinancialAssetForDeduction=true | `true` (명시값 우선) |
| FDR-9 | `category="listed_stock"`, undefined | `true` (§19① 주식) |
| FDD-1 | `DebtItem.category="financial"`, undefined | `resolveFinancialDebt = true` (§19④ 금융회사등 채무) |
| FDD-2 | `category="personal"`, undefined | `false` (§19④ 제외) |
| FDD-3 | `category="personal"`, isFinancialDebtForDeduction=true | **`false`** (override 불가 — §19④ 정의 강제) |
| FDD-4 | `category="funeral"` | `false` (체크박스 disabled) |
| FDD-5 | `category="financial"`, isFinancialDebtForDeduction=false | `false` (사용자 명시 제외 — 입증 미비) |

### 8-2. `__tests__/lib/calc/inheritance-deduction-suggest.test.ts` (신규)

| Anchor | 시나리오 |
|---|---|
| ADS-1 | 순 금융재산 — 예금 5천만(default true) + 부동산 10억(default false) → 5천만 |
| ADS-2 | 순 금융재산 — 예금 5천만 + **금융기관 대출 3천만(financial 카테고리)** → 2천만 (§19④ 정합) |
| ADS-2b | 순 금융재산 — 예금 5천만 + 사적채무 3천만(personal 카테고리) → 5천만 (§19④ 제외, override 불가) |
| ADS-3 | 순 금융재산 — 보험금 2억(insurance, §19① 포함) + 퇴직금 1억(retirement, §19① 제외) → 2억 |
| ADS-4 | 순 금융재산 — 채무가 자산보다 큼 → 0 (음수 차단) |
| ADS-5 | 순 금융재산 — debtItems undefined (legacy 모드) → debts=0 + 안내 메시지 |
| ADS-6 | 사전증여 공제 — 배우자 회차 1건 6억 → 6억 |
| ADS-7 | 사전증여 공제 — 직계비속 회차 2건 합 5천만 한도 |
| ADS-8 | 가업상속 — isFamilyBusinessAsset=true 2건 합산 |
| ADS-9 | 상속외자 유증 — legatee 분배 합 (heir 분배 제외) |
| ADS-10 | 배우자 실제 상속액 — 협의분할 spouse 분배 합 (협의 없으면 isApplicable=false) |

**Pre-Do anchor** (`[[pre-do-anchor-verification]]`):
- FDR-5·FDR-6 (deemedCategory override) — R3 통합과 R1 의도 충돌 검증
- ADS-2 (사용자 override 우선) — R1·R2 핵심 산식 검증
- ADS-7 (10년 한도 누적) — 엔진 헬퍼 호환 검증

## 9. 위험 요소

| 위험 | 대응 |
|---|---|
| ~~§22 금융재산·금융채무 정의 인용 추정~~ | ✅ **2026-05-21 KoreanLaw MCP 검증 완료**. §19①·④ 본문 반영 |
| EstateItem·DebtItem 신규 boolean 필드가 명시 매핑에서 침묵 strip (⑫⑬⑭ TS 미감지) | `[[feedback_explicit_prop_mapping_strip]]` — spread 전환 강제 + `lib/calc/inheritance-tax-api.ts`·`app/api/calc/inheritance/route.ts`·Zod schema 3곳 grep 전수 |
| 사용자 체크박스 default 변경 직후 채워둔 자동 제안값이 stale | AutoSuggestBadge가 EstateItem·DebtItem 변경 시 useMemo 재계산. "현재값과 제안값 차이" 경고 배지 추가 |
| 간주상속재산 입력 카드와 일반 `estateItems` 카드 중복 노출 위험 | Step1 필터로 일반/간주 분리 표시. 추가 시 `deemedCategory` 자동 부여 강제 |
| 퇴직금 §22 default false인데 일부 퇴직금성 금융상품은 §22 대상일 가능성 | 체크박스 override 가능. 기본값은 §19① 미열거 보수적 해석 |
| 음수 순 금융재산 처리 (채무 > 자산) | `Math.max(0, assets - debts)` 강제 + 안내 |
| debtItems OFF 모드(legacy debts 문자열)에서 R2 적용 불가 | suggestNetFinancialAssets에서 debts=0 처리 + 안내 카드 ("협의분할 모드 전환 권유") |
| **신규**: 신탁수익권 평가 — `category="other"` + `deemedCategory="trust"`로 입력 시 PropertyValuationForm이 신탁 특수 평가(§65) 분기 미지원 가능 | 본 계획은 입력 UI만 추가. 평가는 사용자가 시가/감정/표준가 직접 입력. 신탁 평가 자동화는 후속 PR |
| **신규**: 사용자가 R1 체크박스 누락(default false인 신탁·수익증권 등) → §22 공제 누락 | UI 안내 카드 강조 + AutoSuggestBadge에 "포함 자산 N건/제외 자산 M건" 카운트로 검증 유도 |
| **신규**: `trustType` 필드가 deemedCategory="trust"가 아닐 때 불필요 입력 가능 | UI에서 trust 선택 시에만 trustType 라디오 노출 (조건부 렌더). store에는 잔존 가능하나 엔진 무시 |

## 10. PDCA 다음 단계

1. ~~**Plan 게이트 (A-0)**: KoreanLaw MCP로 상증령 §19 원문 확인~~ → ✅ **2026-05-21 완료**. 정정 4건 본문 §1-2·§2-2·§6.1·§6.2·§6.3·§8.1·§8.2 모두 반영. 시행규칙 §X (§19① "그 밖에 재정경제부령이 정하는 것") 후속 확인 권장
2. **Design**: `docs/02-design/features/inheritance-additional-deduction-autofill.engine.design.md`
   - 케이스 매트릭스 (FDR-1~6 + FDD-1~4 + ADS-1~10)
   - Pre-Do anchor 3건 (FDR-5·ADS-2·ADS-7) 우선 실행 → 디자인 환류
   - 14지점 동기화 표 (R1·R2·R3 × 각 지점)
3. **Do**: PR 5건 분할
   - PR-1: A-0 검증 결과 반영 + 타입·factory·normalize (R1·R2·R3 신규 필드 **3개**: `isFinancialAssetForDeduction`·`trustType`·`isFinancialDebtForDeduction`)
   - PR-2: Step1 R1 체크박스 + Step1 R3 간주상속재산 카드
   - PR-3: Step2/DebtAllocationInput R2 체크박스
   - PR-4: `financial-deduction-resolver.ts` + `inheritance-deduction-suggest.ts` + AutoSuggestBadge
   - PR-5: Step4 6개 필드 AutoSuggestBadge 통합
4. **Check**: `ui-engine-sync-checker` (14지점) + `tax-qa-lead` (회귀) + 브라우저 수동 검증 (R1·R2·R3 입력 → Step4 자동 채움 → 결과 정합)
5. **Act**: 회귀 anchor 통과 + 메모리 `feedback_auto_suggest_no_overwrite`·`feedback_user_check_overrides_category_default` 등재

## 11. 범위 외 (후속 PR)

- 영농상속재산가액 자동화 (#5) — `AssetCategory`에 `farmland`·`pasture` 추가 선행
- 동거주택 자동 1:1 매핑 — Step4에 사용자가 estateItems 중 동거주택 1건을 라디오로 선택 (별도 EstateItem 필드 미추가). 향후 자동화 강화 시 `EstateItem.isCohabitHouse?: boolean` 추가 검토
- 직접 입력(Phase E) 자동 토글 — 자동 제안 채움 후 직접 입력 모드 전환
- 결과 화면 "📊 자동 도출" 배지 노출
- 간주상속재산 보험금 평가 특례 (§4 ②·상증령 §4) 별도 UI — 본 계획은 입력만, 평가 분기는 후속

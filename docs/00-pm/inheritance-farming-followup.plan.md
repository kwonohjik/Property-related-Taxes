# 영농상속공제 후속 작업 (F-4~F-8) — Plan

> 작성일: 2026-05-21
> 선행: [`inheritance-farming-deduction-expansion.plan.md`](inheritance-farming-deduction-expansion.plan.md) (메인) + 커밋 `670bfec` (F-1·F-2·F-3 토대 완료)
> 대상: F-4·F-5·F-6 (UI 통합) + F-7 (사후관리) + F-8 (사업무관자산)
> 정책 참조: `[[mirror-pattern]]` · `[[feedback_dialog_data_discard_confirm]]` · `[[feedback_tailwind_static_tone_mapping]]` · `[[korean-law-citation-verify]]` · `[[pre-do-anchor-verification]]`

## 0. 현황 — 토대 완료 (커밋 670bfec)

### 0-1. 완료
| 항목 | 산출물 |
|---|---|
| 타입 | EstateItem.farmingCategory(8종) + FarmingInheritanceInput + FarmingDeductionDetail |
| 엔진 | evaluateFarmingEligibility + calcFarmingDeduction (farming 파라미터) |
| FARMING_MAX | 20억 → 30억 정정 (§18의3①) |
| Zod | estateItemSchema + farmingInheritanceInputSchema + deductionInput.farming |
| 도출 | suggestFarmingAssetValue (담보 차감 + 30억 안내) |
| API | buildInput.farming=undefined spread (UI 도입 전 자리만) |
| Anchor | FD-1~16 + 단위 4 + FS-1~6 = 26건 |

### 0-2. 남은 항목 (본 계획서)

| Phase | 범위 | 우선순위 | 의존 |
|---|---|---|---|
| F-4 | FarmingCategorySection (Step1 EstateItem 카드) | 높음 | 완료된 타입·Zod |
| F-5 | FarmingEligibilitySection (Step4 요건 입력) + form.farming 통합 + AutoSuggestBadge | 높음 | F-4 |
| F-6 | InheritanceTaxResultView §23 행 4-way 분기 + FarmingDeductionDetailRow | 중간 | **독립** — `result.deductionDetail.farmingDetail` 이미 엔진 result에 노출 (670bfec). F-5와 병렬 진행 가능. UI 시각 검증은 F-5 통합 후 권장 |
| F-7 | 5년 사후관리 + 이자상당액 + 정당사유 7종 + 6개월 신고 | 낮음 | 별도 sprint (F-2까지 안정 후) |
| F-8 | §15⑤2호 사업무관자산 5종 자동 차감 | 낮음 | 별도 sprint (가업상속공제 §18의2와 공통) |

---

## 1. F-4·F-5·F-6 UI 통합 (PR 권장 1건)

### 1-1. F-4 FarmingCategorySection

**위치**: `components/calc/inheritance/FarmingCategorySection.tsx` 신규.
**통합**: PropertyValuationForm·StockValuationForm 카드 내부, DeemedCategorySection 아래.

**Props**:
```typescript
interface FarmingCategorySectionProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
}
```

**UI**:
- RadioCardGroup<FarmingCategory | "none"> layout="stack" (9 options)
- "비영농" = farmingCategory undefined
- 카테고리 호환 가드:
  - `financial`·`cash`·`deposit`: 컴포넌트 자체 미렌더
  - `real_estate_*`·`other`: farmland~salt_field 7종 선택 가능 (corporate_stock 제외)
  - `listed_stock`·`unlisted_stock`: corporate_stock만 노출, 나머지 disabled
- 카테고리 변경 시 호환 안 되면 자동 reset + 토스트 안내

**hint 카드** (선택 시 동적):
- farmland: "농지법 §2①가 농지"
- pasture: "초지법 §5 초지조성허가"
- forest_land: "보전산지 + 산림경영계획 인가 + 5년 이상 조림"
- fishing_vessel: "어선법 §2①"
- fishing_right: "어업권·양식업권 (마을어업·협동양식업 제외)"
- agricultural_building: "농업·임업·축산업·어업용 — 건폐율 환산 면적 한정"
- salt_field: "소금산업진흥법 §2③ 염전"
- corporate_stock: "법인 영농 — §15⑤2호 사업무관자산 차감 후 가액 입력 권장 (F-8 후속)"

**Tailwind 정적 매핑** (`[[feedback_tailwind_static_tone_mapping]]`):
- emerald-50/40 + dark:emerald-950/20 dark:emerald-800

**케이스 매트릭스 (FC-1~11)** — 메인 디자인 §1-1 참조.

### 1-2. F-5 FarmingEligibilitySection + Step4 통합

**위치**: `components/calc/inheritance/FarmingEligibilitySection.tsx` 신규 + `step4-5.tsx` 통합.

**Props**:
```typescript
interface FarmingEligibilitySectionProps {
  farming: FarmingInheritanceInput | undefined;
  estateItems: EstateItem[];  // 거주지 자산 유형별 동적 안내용
  onChange: (farming: FarmingInheritanceInput | undefined) => void;
}
```

**상태 관리 (3-state)**:
- `farming === undefined`: 활성화 토글 OFF → 하단 폼 미렌더 (legacy 모드)
- **토글 ON 클릭 (undefined → 객체)**: 즉시 `onChange({ type: "personal", ...all false })` 빈 객체 초기화 (Dialog 불필요)
- **토글 OFF 클릭 (객체 → undefined)**: 입력값이 빈 객체와 다르면 **Dialog 데이터 폐기 확인** (`[[feedback_dialog_data_discard_confirm]]`) → 확인 시만 `onChange(undefined)`. 빈 객체와 동일하면 즉시 undefined.

**섹션 구조**:
- 영농 유형 라디오 (personal / corporate)
- 피상속인 요건 ToggleCard 그룹 (personal: 8년·거주지 / corporate: 법인 8년·50%+)
- 상속인 요건 ToggleCard 그룹 (후계자 + 18세·2년·거주·65세 미만 사망 / corporate: 임원·대표이사)
- §16⑭ 영농 부정 토글
- §18의3⑥ 조세포탈 토글

**거주지 자산 유형별 동적 안내** (personal 전용):
```typescript
const showResidenceHint = farming.type === "personal";
const hasLandAsset = showResidenceHint && estateItems.some(i =>
  ["farmland", "pasture", "forest_land", "agricultural_building", "salt_field"].includes(i.farmingCategory ?? "")
);
const hasFishingAsset = showResidenceHint && estateItems.some(i =>
  ["fishing_vessel", "fishing_right"].includes(i.farmingCategory ?? "")
);
```

**미리보기 카드** (실시간 자격 평가):
- `evaluateFarmingEligibility(farming)` useMemo 호출 (`[[single-source-engine-helper]]`)
- eligible=true → emerald "✓ 모든 요건 충족"
- eligible=false → amber 카드 + reasons 목록

**FormState 갱신** (`components/calc/inheritance/shared.ts`):
```typescript
export interface FormState {
  // ...
  farming?: FarmingInheritanceInput;
}
INITIAL_FORM.farming = undefined;
```

**Step4 통합 순서**:
1. (기존) 배우자 실제 상속액 ~ 동거주택공제 직접 입력
2. **── 영농상속공제 §18의3 ── (신규 그룹 헤더)**
3. FarmingEligibilitySection (영농 자산 0건이어도 토글 노출)
4. AutoSuggestBadge — 영농상속재산가액
   - **자격 미충족 시 자동 채움 비활성** + amber 안내 카드
   - `evaluateFarmingEligibility(form.farming).eligible` 또는 farming=undefined 시만 활성
5. CurrencyInput 영농상속재산가액 §23 (label 갱신: "영농상속재산가액 (§18의3)")
6. (기존) 가업상속재산가액 이하

**buildInput.farming spread 정정**:
현재 `farming: undefined` 자리만 차지. F-5에서 `farming: form.farming` 정식 매핑.

### 1-3. F-6 결과 카드 4-way 분기

**위치**: `InheritanceTaxResultView.tsx` §23 farmingDeduction Row 직후 + `FarmingDeductionDetailRow` 컴포넌트.

**4-way 분기** (메인 디자인 §1-4 RD-1~5):

| 분기 | 조건 | 표시 |
|---|---|---|
| RD-1 | evaluated=true + eligible=true + cappedDeduction>0 | emerald: "영농자산 X원 ≤ 30억 → N억 공제" (30억 cap 시 안내) |
| RD-2 | evaluated=true + eligible=true + cappedDeduction=0 | gray: "영농 자산 미입력" |
| RD-3 | evaluated=true + eligible=false + appliedAssetValue>0 | **amber 경고**: "입력 자산 N억 — 자격 미충족 (공제 0원)" + reasons 목록 |
| RD-4 | evaluated=true + eligible=false + appliedAssetValue=0 | gray: "자격 미충족 + 자산 미입력" |
| RD-5 | evaluated=false | **violet 안내**: "요건 미평가 (legacy 모드). Step4에서 영농 요건 입력 권장" |

**필요 props**:
- 이미 `result.deductionDetail.farmingDetail`이 result에 노출됨 (커밋 670bfec)
- InheritanceTaxResultView에 추가 props 불필요

### 1-4. PR-3 (UI 통합) 14지점

| 지점 | 변경 |
|---|---|
| ① 폼 타입 | shared.ts FormState.farming |
| ② initial | INITIAL_FORM.farming = undefined |
| ③ normalize | sessionStorage 마이그 — farming undefined 유지 |
| ④ API 변환 | buildInput.farming = form.farming (현재 undefined → form 값) |
| ⑤ UI 위젯 | FarmingCategorySection·FarmingEligibilitySection·AutoSuggestBadge·FarmingDeductionDetailRow |
| ⑥ 사이드바 | 영농 자산 합 표시 (옵션 — InheritanceSidebar) |
| ⑦ 결과 카드 | FarmingDeductionDetailRow 4-way 분기 |
| ⑧ validation | farming 활성 시 type 필수, 그 외 optional boolean (강제 X — UI 안내) |
| ⑨ Zod 메인 | 완료 (커밋 670bfec) |
| ⑩~⑭ | 변경 없음 (이미 완료) |

### 1-5. UI Anchor

`__tests__/components/calc/inheritance/farming-section.test.tsx` 신규 (간단 RTL):
- FC-1 (비영농 default)
- FC-9 (listed_stock + corporate_stock only)
- FC-11 (financial → 미렌더)
- FE-1 (legacy 토글 OFF)
- FE-6 (65세 사망 면제 미리보기)

전체 UI E2E는 Playwright 수동 (브라우저 검증).

---

## 2. F-7 사후관리 추징 (별도 PR — 독립 sprint)

### 2-0. UI 위치 결정 (디자인 §9 반영)
- **별도 페이지**: `app/calc/inheritance-postmgmt/page.tsx` 신규
- **이유**: 사후관리는 상속 5년 후 발생 — 본 마법사(1회 계산)와 시간축 분리. 본 마법사 800줄·복잡도 추가 차단
- **진입**: 메인 마법사 결과 카드에서 "사후관리 시뮬레이터 →" 링크
- **데이터 흐름**: result.deductionDetail.farmingDeduction을 originalDeduction 사전 입력 (querystring 또는 sessionStorage)

### 2-1. 범위
§18의3④ + §18의3⑥2호 사후 추징 시뮬레이터.

### 2-2. 법령 정밀 인용 (KoreanLaw MCP 확인 완료, 본 PR 진입 전 재검증 권장)

**§18의3④ — 5년 내 사후관리 위반**:
1. 영농상속재산 처분
2. 영농 종사 중단

**§16⑦ 추징율**: "100분의 100" — 5년 내 위반 시 일률 100%.

**§16⑧ 이자상당액**:
```
이자상당액 = 결정세액 × (신고기한 다음날 ~ 사유 발생일) × (국세기본법 시행령 §43의3② 이자율 / 365)
```

**§18의3⑦ 신고 의무**: 사유 발생일이 속하는 달의 말일부터 **6개월 이내** 신고 + 자진납부.

**§16⑥ 정당한 사유 (추징 면제) 7종**:
1. 상속인 사망
2. 「해외이주법」에 따른 해외이주
3. 「공익사업법」 수용·협의매수
4. 국가·지자체 양도·증여
5. 영농상 농지 교환·분합·대토
6. 법인주식 처분 중 일정 사유 (물납 §73, §15⑧3호 사유) — 최대주주 유지 조건
7. §16⑥1~6호 유사 사유 (재정경제부령)

**§18의3⑥ 조세포탈·회계부정 사후 추징** (§16⑨ → §15⑲ 인용):
- §15⑲1호 조세포탈: 조세범처벌법 §3① 벌금형
- §15⑲2호 회계부정: 외감법 §39① 벌금형 + 재무제표 변경금액 자산 5% 이상

### 2-3. 신규 타입

```typescript
export interface FarmingPostMgmtInput {
  /**
   * 사후관리 위반 사유.
   * - asset_disposed / farming_ceased: §18의3④ (5년 내 위반)
   * - tax_fraud_conviction / accounting_fraud: §18의3⑥2호 (5년 무관, 시점 무한정)
   */
  violation: "asset_disposed" | "farming_ceased" | "tax_fraud_conviction" | "accounting_fraud";
  /** 사유 발생일 (ISO date) */
  violationDate: string;
  /** 상속세 신고기한 (= 상속개시일 + 6개월, §67) — 이자상당액 기산일 산정용 */
  filingDeadline: string;
  /** 사유 발생 시점의 결정세액 */
  determinedTax: number;
  /** 국세기본법 §43의3② 이자율 (소수, 예: 0.029 = 연 2.9%) */
  interestRate: number;
  /**
   * 정당한 사유 §16⑥ 7종 — **§18의3④ violation에만 적용**.
   * violation==="tax_fraud_conviction"·"accounting_fraud"는 §18의3⑥2호 별도 트랙이라
   * 정당사유 면제 미적용 (UI에서 disabled).
   */
  justifiedReason?:
    | "heir_death"
    | "overseas_relocation"
    | "expropriation"
    | "government_transfer"
    | "land_exchange"
    | "corporate_stock_disposal"  // 최대주주 유지 + 물납·§15⑧3호
    | "other_similar";
  /** [corporate_stock_disposal] 최대주주 유지 여부 */
  maintainsMajorShareholder?: boolean;
}

export interface FarmingPostMgmtResult {
  /** 추징 대상 여부 */
  recaptureRequired: boolean;
  /** 추징 면제 사유 (정당사유 인정) */
  exemptedBy?: FarmingPostMgmtInput["justifiedReason"];
  /** 추징세액 = 공제받은 금액 × 100% (§16⑦) */
  recaptureAmount: number;
  /** 이자상당액 */
  interestAmount: number;
  /** 합계 */
  totalRecapture: number;
  /** 신고 기한 (사유 발생일 속하는 달 말일 + 6개월) */
  reportDeadline: string;
  breakdown: CalculationStep[];
}
```

### 2-4. 핵심 함수

```typescript
export function calcFarmingPostMgmt(
  originalDeduction: number,  // calcFarmingDeduction의 cappedDeduction
  input: FarmingPostMgmtInput,
): FarmingPostMgmtResult;
```

산식:
1. **정당사유 매칭** (violation ∈ {asset_disposed, farming_ceased} + justifiedReason 인정):
   - `recaptureRequired=false`, `exemptedBy=justifiedReason` 설정
   - `recaptureAmount=0`, `interestAmount=0`, `totalRecapture=0`
   - `reportDeadline`은 그대로 계산 (참고용)
   - breakdown에 면제 사유 명시
2. **추징 적용** (정당사유 없음 또는 §18의3⑥ 트랙):
   - 추징세액 = originalDeduction × 100% (§16⑦)
   - 이자상당액 = floor(determinedTax × days(filingDeadline+1 ~ violationDate) × interestRate / 365)
     - 일수 계산: `differenceInDays(violationDate, addDays(filingDeadline, 1))` (date-fns)
     - **정수 연산 — BigInt 단일 floor**: `Number(BigInt(determinedTax) * BigInt(days) * BigInt(round(interestRate × 1e8)) / BigInt(365 × 1e8))`. `applyRate` 다중 호출 시 floor 두 번 발생 — 정밀도 손실 회피
   - totalRecapture = recaptureAmount + interestAmount
3. **신고기한**: `endOfMonth(violationDate) + 6개월` (§18의3⑦)

### 2-5. Anchor (FP-1~10)

| Anchor | 시나리오 |
|---|---|
| FP-1 | violation=asset_disposed + 5년 내 — 추징 100% + 이자 |
| FP-2 | violation=farming_ceased + 5년 내 — 추징 100% |
| FP-3 | violation=asset_disposed + justifiedReason=heir_death → 면제 |
| FP-4 | violation=asset_disposed + justifiedReason=expropriation → 면제 |
| FP-5 | violation=asset_disposed + justifiedReason=land_exchange → 면제 |
| FP-6 | violation=asset_disposed + justifiedReason=corporate_stock_disposal + maintainsMajorShareholder=true → 면제 |
| FP-7 | violation=asset_disposed + corporate_stock_disposal + maintainsMajorShareholder=false → 추징 |
| FP-8 | 5년 경과 후 처분 — UI 검증으로 차단 (엔진 입력 검증) |
| FP-9 | violation=tax_fraud_conviction + justifiedReason 무시 → 추징 (§18의3⑥2호 별도 트랙) |
| FP-10 | 이자상당액 계산 정확성 — 윤년 + 일수 경계 (filingDeadline+1 시작 inclusive) |

### 2-6. 위험 요소
- §16⑥7호 "재정경제부령" 유사 사유 — 별도 시행규칙 추적 필요
- 국세기본법 §43의3② 이자율 — 시점별 개정 (사용자가 직접 입력 권장)
- 5년 카운트 시점 — "상속개시일부터 5년" 정확 일수 (윤년 포함)
- 정당사유 6호 §15⑧3호 인용 8개 분기 (합병·분할·유상증자·사망·국가증여·상장요건·무상감자·법원결정) — 본 PR은 boolean 단순화

---

## 3. F-8 사업무관자산 자동 차감 (별도 PR — 가업상속과 공통)

### 3-1. 범위
§16⑤2호 법인 영농 + §15⑤2호 가업상속 공통 — 주식 영농상속 가액의 사업무관자산 비율 차감.

### 3-2. 산식 (시행령 §15⑤2호 + §16⑤2호 인용)

```
businessAssets = max(0, totalAssets − sumOfNonBusiness)  // 음수 clamp
영농상속 가액 = floor(주식 평가가액 × businessAssets / totalAssets)
```

**경계 처리**:
- totalAssets = 0: ratio 정의 불가 → 호출 측에서 사전 검증 (UI 경고). 본 함수는 ratio=0 반환
- sumOfNonBusiness ≥ totalAssets: businessAssets=0 → adjustedValue=0
- 음수 입력값: 각 필드에 Math.max(0, x) 사전 clamp

사업무관자산 5종:
- 가. 비사업용토지 (소득세법 §104조의3)
- 나. 임대부동산 + 임대 주택 (단서: 국민주택 또는 기준시가 6억 이하 + 5년 이상 무상임대 임직원용 제외)
- 다. 임직원 외 대여금 (단서: 임직원 학자금·전세금 제외)
- 라. 과다보유현금 (5년 평균 200% 초과분, 요구불예금·만기 3개월 이내 금융상품 포함)
- 마. 영업무관 주식·채권·금융상품 (라목 제외)

### 3-3. 신규 타입

```typescript
export interface CorporateNonBusinessAssets {
  /** 가. 비사업용토지 */
  nonBusinessLand?: number;
  /** 나. 임대부동산 (단서 제외 후 순액) */
  rentedRealEstate?: number;
  /** 다. 임직원 외 대여금 */
  externalLoans?: number;
  /** 라. 과다보유현금 (5년 평균 × 200% 초과분만) */
  excessCash?: number;
  /** 마. 영업무관 금융상품 */
  nonOperatingFinancial?: number;
}

// EstateItem 확장
export interface EstateItem {
  // ...
  /** 법인 영농 주식 평가용 — 사업무관자산 자동 차감 (corporate_stock + 가업상속 공통) */
  corporateNonBusinessAssets?: CorporateNonBusinessAssets;
  /** 법인 총자산 (사업무관자산 비율 계산 분모) */
  corporateTotalAssets?: number;
}
```

### 3-4. 핵심 함수 (`lib/tax-engine/property-valuation-stock.ts` 또는 신규 모듈)

```typescript
export function calcCorporateStockFarmingValue(
  stockValue: number,
  totalAssets: number,
  nonBusinessAssets: CorporateNonBusinessAssets,
): { adjustedValue: number; ratio: number; sumOfNonBusiness: number };
```

산식 정수 연산:
- `sumOfNonBusiness = Σ(nonBusinessAssets) (정수)`
- `businessAssets = max(0, totalAssets − sumOfNonBusiness)`
- `ratio = businessAssets / totalAssets` (BigInt 사용 권장 — 큰 법인 자산)
- `adjustedValue = floor(stockValue × businessAssets / totalAssets)` — BigInt 곱셈

### 3-5. UI
EstateItem 카드 위치 (corporate_stock farmingCategory 선택 시):
- **위치**: `StockValuationForm`의 ListedStockEditor·UnlistedStockEditor 내부 — `FarmingCategorySection` 직후 + `FinancialDeductionChip` 직전
- **컴포넌트**: `CorporateNonBusinessAssetsSection.tsx` 신규 (가업상속과 공유)
- 조건부 렌더: `item.farmingCategory === "corporate_stock"` OR (별도 트랙) `item.isFamilyBusinessAsset === true`
- 5개 CurrencyInput (가~마) + 1개 totalAssets + 자동 비율 미리보기 (useMemo)
- amber 안내: "임대부동산 단서·과다현금 5년 평균 등은 사용자가 직접 차감 후 입력"

### 3-6. Anchor (FNB-1~8)
| Anchor | 시나리오 |
|---|---|
| FNB-1 | 사업무관자산 0 → adjustedValue=stockValue |
| FNB-2 | 비사업용토지 50% → adjustedValue=stockValue×0.5 |
| FNB-3 | 5종 모두 입력 (합 30%) → 70% 적용 |
| FNB-4 | 사업무관자산>총자산 → adjustedValue=0 (Math.max clamp) |
| FNB-5 | BigInt 정밀도 (1조 × 1조 곱) — Number 한계 초과 안전 |
| FNB-6 | 가업상속과 공통 — 동일 헬퍼 호출 결과 일치 (§15·§16 양쪽) |
| FNB-7 | nonBusinessAssets 미입력 (undefined) → stockValue 그대로 |
| FNB-8 | totalAssets=0 → ratio=0, adjustedValue=0 (UI 사전 경고) |

**UI anchor** (별도, FNB-UI-*): `__tests__/components/calc/CorporateNonBusinessAssetsSection.test.tsx`
- FNB-UI-1: EstateItem 입력 변경 → useMemo 재계산
- FNB-UI-2: corporate_stock 미선택 시 컴포넌트 미렌더

### 3-7. 위험 요소
- §15⑤2호 가. "비사업용토지" — 별도 판정 엔진 필요 (`lib/tax-engine/non-business-land/`) 연동
- 나. 임대부동산 단서 5년 무상임대 임직원용 — 사용자 차감 후 입력 권장
- 라. 과다보유현금 5년 평균 — 5년 평균 자동 계산 안 함, 사용자 입력
- 본 PR은 사용자가 정제된 5종 합을 직접 입력 (자동 분류는 후속)

---

## 4. F-9·F-10·F-11 (메인 계획서 §10 후속)

### F-9: §16② 단서 — 영농상속 후 최대주주 사망 시 적용 배제

**정확 의미**: "영농상속이 이루어진 후에 영농상속 당시 최대주주등(영농상속을 받은 상속인은 제외한다)의 사망으로 상속이 개시되는 경우는 적용하지 아니한다" (§16② 단서).

→ **별개 상속 사건의 영농상속공제 적용 배제**. 본 계산이 "두 번째 상속"인 경우 입력으로 받음.

- 입력 (FarmingInheritanceInput 확장):
  - `isSecondaryAfterFarmingInheritance?: boolean` — "본 상속이 직전 영농상속의 당시 최대주주(상속받지 않은 자) 사망에 의한 상속인가" 여부
- 평가 (evaluateFarmingEligibility):
  - true → 단독 reason `"§16② 단서 — 영농상속 후 최대주주 사망 (적용 배제)"` early return
  - 단 corporate 트랙에만 적용 (§16② 2호 단서)
- UI: corporate 모드에서만 ToggleCard 노출

### F-10: 거주지 자동 검증
- Vworld 좌표 API + Haversine 직선거리 30km
- estateItems의 농지 좌표 vs 피상속인·상속인 주소 좌표
- 현재 사용자 체크박스 → 자동 boolean

### F-11: 영농 종사 상속인 일부 분리 공제
- heirAllocations 연계 — 영농 종사 상속인의 분배분만 영농상속재산가액 합산
- 시행령 §16⑤ "제3항의 요건을 갖춘 상속인이 받거나 받을 상속재산"

---

## 5. PR 분할 권장

| PR | 범위 | 예상 작업량 | 의존 강도 |
|---|---|---|---|
| **PR-A** | F-4 + F-5 + F-6 (UI 통합 — 3건 동시) | 중-대 | **강 의존** — F-5의 form.farming 추가가 F-6 결과 카드 데이터 흐름 필수. F-4 farmingCategory 분류가 F-5 거주지 동적 안내 트리거. 단일 PR 권장 |
| PR-A 대안 | F-4 단독 → F-5+F-6 분리 | 중 + 중 | 분리 시 F-4 단독은 사용자 가치 낮음 (자동 채움 미작동). 권장 안 함 |
| PR-B | F-7 사후관리 (별도 sprint) | 중 | 독립 (엔진 토대 완료) |
| PR-C | F-8 사업무관자산 (가업상속과 공통) | 대 | §15⑤2호 가업상속 공통 — 가업상속공제 PRD 진입 시 동시 |
| PR-D | F-9 §16② 단서 | 소 | 독립 |
| PR-E | F-10 거주지 자동화 (Vworld) | 대 | F-4·F-5 안정화 후 |
| PR-F | F-11 상속인 일부 분리 | 중 | heirAllocations 토대 활용 |

**우선순위**: PR-A → (사용자 검증 후) PR-B → 나머지는 사용자 요청 시.

**800줄 정책 영향**:
- `step4-5.tsx` 현재 232줄 → FarmingEligibilitySection 신규 분리 + Step4 +60줄 정도 → 안전 (~292줄)
- `FarmingEligibilitySection.tsx` 예상 ~250줄 (요건 입력 그룹 6종)
- `InheritanceTaxResultView.tsx` 현재 약 400줄 → FarmingDeductionDetailRow inline 추가 시 +40줄
- 모두 800줄 정책 준수

## 6. 위험 요소 — 통합

| 위험 | 대응 |
|---|---|
| UI 통합 시 800줄 정책 — step4-5.tsx 232줄 → FarmingEligibilitySection 추가로 위반 위험 | FarmingEligibilitySection 별도 파일 분리 (~200줄) + step4-5.tsx 추가 +30줄 정도. 정책 준수 |
| F-7 정당사유 6호 §15⑧3호 인용 — 8개 분기 자동 판정 어려움 | boolean 1개로 단순화 + UI 상세 안내. 자동 판정은 후속 |
| F-8 §104조의3 비사업용토지 판정 — 기존 엔진 호출 | `lib/tax-engine/non-business-land/engine.ts` 재사용. 주식 영농상속 전용 어댑터 신규 |
| F-7 이자율 §43의3② — 시점별 개정 | 사용자 직접 입력 강제. 기본값 시점별 가이드 표 노출 |
| 가업상속공제 §18의2와 영농상속 §18의3 — 일부 사용자 혼동 (조문 번호 swap) | 결과 카드 라벨 명확화 (§18의3 = 영농, §18의2 = 가업) + 메인 계획서 §1-1 정정 이력 |

## 7. PDCA 다음 단계

1. PR-A (UI 통합) 진입 — F-4·F-5·F-6 동시
2. F-7·F-8은 사용자 검증 후 별도 sprint
3. F-9·F-10·F-11은 최우선순위 낮음

다음 작업으로 PR-A 진입 권장.

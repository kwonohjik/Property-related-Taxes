# 종합부동산세 과세연도별 세법 지원 — UI 설계 문서

> 작성일: 2026-06-11
> 담당: comprehensive-tax-ui-senior
> 연관 파일:
>   - `app/calc/comprehensive-tax/page.tsx`
>   - `lib/stores/comprehensive-wizard-store.ts`
>   - `lib/validators/comprehensive-input.ts`
>   - `components/calc/results/ComprehensiveTaxResultView.tsx`
>   - `app/api/calc/comprehensive/route.ts`

---

## 0. 현황 실측 요약 (read-only 조사 결과)

### 0.1 과세연도 입력 — 현행 UX 문제점

`app/calc/comprehensive-tax/page.tsx` Step1Basic (line 121~134):

```
<input type="text" inputMode="numeric"
  value={formData.assessmentYear}
  onChange={... .replace(/\D/g, "").slice(0, 4)}
  placeholder="2024"
/>
```

**실측 문제**:
- 자유 텍스트(숫자 4자리 직접 타이핑)로 임의 연도 입력 가능 → 지원 범위 밖 연도 입력 시 엔진 파라미터 불일치
- 연도 변경 시 적용 세법(기본공제·세율·공정시장가액비율·세부담상한)이 달라짐을 사용자에게 전혀 안내하지 않음
- 연도를 바꿔도 기존 result가 invalidate되지 않음 → 구 결과 표시 유지

### 0.2 세부담상한 300% — 완전 제거 확인

`a31a279` 커밋에서 `isMultiHouseInAdjustedArea` 를 9곳에서 완전 삭제:
- `lib/tax-engine/types/comprehensive.types.ts`: `capRate: number // 1.5 (구 다주택 300% 삭제됨)` 주석
- `lib/tax-engine/comprehensive-tax-helpers.ts`: `applyTaxCap` 단일 150% 상한만 존재
- `lib/validators/comprehensive-input.ts`: `isMultiHouseInAdjustedArea` 필드 없음
- `lib/stores/comprehensive-wizard-store.ts`: `ComprehensiveFormData` 에 해당 필드 없음
- `app/calc/comprehensive-tax/page.tsx`: Step5TaxCap에 해당 UI 없음

**현행 엔진 파라미터 (2023년~, 현행 고정값)**:

| 항목 | 현행 상수 | 위치 |
|---|---|---|
| 기본공제 (일반) | 9억 | `COMPREHENSIVE_CONST.BASIC_DEDUCTION_GENERAL` |
| 기본공제 (1세대1주택) | 12억 | `COMPREHENSIVE_CONST.BASIC_DEDUCTION_ONE_HOUSE` |
| 공정시장가액비율 (주택분) | 0.60 (60%) | `COMPREHENSIVE_CONST.FAIR_MARKET_RATIO_HOUSING` |
| 공정시장가액비율 (토지분) | 1.00 (100%) | `COMPREHENSIVE_CONST.AGGREGATE/SEPARATE_FAIR_MARKET_RATIO` |
| 세부담상한 | 1.50 (150%) | `COMPREHENSIVE_CONST.TAX_CAP_RATE_GENERAL` |
| 주택분 세율 | 7단계 누진 (0.5%~2.7%) | `HOUSING_BRACKETS` (하드코딩) |

### 0.3 2022 귀속 기준 세법과 현행 차이 (엔진 미구현 — 연도별 파라미터 필요)

아래는 법령 개정 이력 기준 파라미터 차이 (현행 엔진에 반영 안 됨):

| 귀속연도 | 기본공제 일반 | 기본공제 1세대1주택 | 공정시장가액비율 | 세부담상한 (다주택) | 세부담상한 (일반) |
|---|---|---|---|---|---|
| 2021 | 6억 | 11억 | 95% | 조정2주택+/3주택+ 300% | 150% |
| 2022 | 6억 | 11억 | **60%** (토지 100%) | 조정2주택+/3주택+ 300% | 150% |
| 2023 | 9억 | 12억 | 60% | 삭제 (150% 단일) | 150% |
| 2024 | 9억 | 12억 | 60% | — | 150% |
| 2025 | 9억 | 12억 | 60% | — | 150% |

**핵심 차이**:
1. 기본공제: 2022 이전 6억/11억 → 2023+ 9억/12억
2. 공정시장가액비율(주택분): 2021=95%, 2022·2023+=60% (토지분은 2022+ 100%) — STEP 13 정정: 초안의 '2022 주택 100%'는 오류, 사례1 (9.5억−6억)×60% 실측
3. 세부담상한: 2022까지 조정대상지역 2주택+ 300% (§10②) → 2023 삭제 (150% 단일)
4. 세율 구간: 2022 이전은 다주택 중과세율 분리 존재 (1세대1주택 0.5%~2.0%, 다주택 1.2%~6.0%) → 2023+ 통합 단일 세율 (0.5%~2.7%)

**확인 필요** (엔진 시니어 요청 항목 섹션에 기재): 2021~2022 세율 구간 정확한 값은 법령 확인 후 `getComprehensiveParams(year)` 에서 산출 예정.

### 0.4 결과뷰 현황

`ComprehensiveTaxResultView.tsx` 의 현행 고정 텍스트들:

```tsx
// line 164: 기본공제 — 연도 미반영 하드코딩
label={`기본공제 (${result.isOneHouseOwner ? "1세대1주택 12억" : "일반 9억"})`}

// line 171: 과세표준
label={`공정시장가액비율 적용 (${formatRate(result.fairMarketRatio)})`}

// line 334: 세부담상한 (line 266~273)
label={`세부담 상한 (${formatRate(taxCap.capRate)} = ${formatKRW(taxCap.capAmount)})`}
```

`result.basicDeduction` / `result.fairMarketRatio` / `taxCap.capRate` 가 echo되므로 엔진이 연도별 값을 반환하면 결과뷰는 자동으로 올바른 값을 표시할 수 있음. 단, 텍스트 라벨의 하드코딩된 금액 표기("9억", "12억")는 수정 필요.

---

## 1. 요구사항 분석 — 케이스 매트릭스

| # | 과세연도 | 조정대상지역 2주택+ | 주요 파라미터 차이 | isMultiHouseInAdjustedArea 노출 |
|---|---|---|---|---|
| A | 2023+ | 해당 없음 | 기본공제 9억/12억, FMR 60%, 상한 150% | 숨김 |
| B | 2022 | 아니오 | 기본공제 6억/11억, FMR 60%, 상한 150% (3주택+면 자동 중과세율·300%) | 표시 (OFF 유지) |
| C | 2022 | 예 | 기본공제 6억/11억, FMR 60%, 상한 300% | 표시 (ON) |
| D | 2021 | 아니오 | 기본공제 6억/11억, FMR 95%, 상한 150% | 표시 (OFF 유지) |
| E | 2021 | 예 | 기본공제 6억/11억, FMR 95%, 상한 300% | 표시 (ON) |

**표시 조건 요약**: `assessmentYear < 2023` 일 때만 `isMultiHouseInAdjustedArea` ToggleCard 노출.

---

## 2. 설계 — 7개 동기화 지점

### 2.1 ① FormData 타입 변경

파일: `lib/stores/comprehensive-wizard-store.ts`

```typescript
// 현행 ComprehensiveFormData
assessmentYear: string;  // 유지 (Select/RadioCardGroup 값과 호환)

// 신규 추가
isMultiHouseInAdjustedArea: boolean;  // 조정대상지역 2주택+ (연도 < 2023 일때만 유효)
```

**설계 이유**: `assessmentYear < 2023` 조건은 UI 레이어에서 파생(노출 조건)하고, 실제 값은 store에서 보존한다. 연도 전환 시 값은 store에 남아있어도 무방 — API/엔진이 `assessmentYear`와 함께 사용하므로 2023+ 연도에서 해당 필드가 true여도 엔진의 `getComprehensiveParams(year)` 가 capRate를 150%로 고정하면 된다.

### 2.2 ② Initial Value

```typescript
const defaultFormData: ComprehensiveFormData = {
  assessmentYear: String(new Date().getFullYear()),
  // ... 기존 필드 ...
  isMultiHouseInAdjustedArea: false,  // 신규 추가
};
```

`makeProperty()` 는 변경 없음.

### 2.3 ③ Normalize Fallback

sessionStorage에서 복원 시 `isMultiHouseInAdjustedArea` 가 없으면 `false` fallback:

```typescript
// lib/stores/calc-wizard-migration.ts 또는 store 내 persist 설정에서
isMultiHouseInAdjustedArea: stored.isMultiHouseInAdjustedArea ?? false,
```

### 2.4 ④ API 변환

파일: `app/calc/comprehensive-tax/page.tsx` 의 `callComprehensiveApi()` 함수 (현재 `lib/calc/` 분리 파일 없음 — page.tsx 내부)

```typescript
const body = {
  assessmentYear: parseInt(formData.assessmentYear) || new Date().getFullYear(),
  isOneHouseOwner: formData.isOneHouseOwner,
  birthDate: formData.birthDate || undefined,
  acquisitionDate: formData.acquisitionDate || undefined,
  previousYearTotalTax: ...,
  properties,
  landAggregate,
  landSeparate,
  // 신규 추가
  isMultiHouseInAdjustedArea: formData.isMultiHouseInAdjustedArea,
};
```

**주의**: `isMultiHouseInAdjustedArea` 는 `assessmentYear < 2023` 일 때만 의미있다. API body에는 항상 포함하되 엔진에서 연도 판단.

### 2.5 ⑤ UI 입력 위젯

#### 2.5.1 Step1Basic — 과세연도 입력 개선

**현행**: `<input type="text" inputMode="numeric" placeholder="2024">` (자유 입력)

**개선**: RadioCardGroup (2021~2025) + 선택 연도별 세법 hint 카드

```
┌──────────────────────────────────────────────────┐
│ 과세연도 *                                         │
│                                                    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│ │  2021    │ │  2022    │ │  2023    │           │
│ │(선택)    │ │(선택)    │ │          │           │
│ └──────────┘ └──────────┘ └──────────┘           │
│ ┌──────────┐ ┌──────────┐                         │
│ │  2024    │ │  2025    │                         │
│ │[현재★]  │ │          │                         │
│ └──────────┘ └──────────┘                         │
│                                                    │
│ ┌─ amber 안내카드 (연도별 세법 요약) ─────────────┐│
│ │ 2024 귀속 기준 적용 세법:                       ││
│ │  • 기본공제: 일반 9억 / 1세대1주택 12억          ││
│ │  • 공정시장가액비율: 60%                         ││
│ │  • 세부담 상한: 150%                            ││
│ │  • 세율: 단일 누진 (0.5%~2.7%, 7단계)          ││
│ └─────────────────────────────────────────────────┘│
│                                                    │
│ 과세기준일: 2024-06-01 (종합부동산세법 §16①)       │
└──────────────────────────────────────────────────┘
```

**지원 연도**: 2021~2025 (5개). 향후 연도 추가 시 `SUPPORTED_YEARS` 상수만 수정.

**구현 패턴**:

```tsx
// 지원 연도 상수 (엔진 단일 진실에 맞춰 엔진 시니어가 SUPPORTED_YEARS export 시 import)
const SUPPORTED_YEARS = [2021, 2022, 2023, 2024, 2025];

// 연도별 세법 요약 (엔진의 getComprehensiveParams(year) 결과를 display에 활용)
// → 엔진 시니어에게 getComprehensiveParams(year) 결과를 UI에서 import할 수 있도록 요청
// → 의존 전까지는 UI에서 별도 YEAR_PARAMS_DISPLAY 정적 매핑 사용 (아래 참조)

type YearDisplayParams = {
  basicDeductionGeneral: number;       // 원
  basicDeductionOneHouse: number;      // 원
  fairMarketRatioHousing: number;      // 0~1
  taxCapRate: number;                  // 1.5 또는 3.0
  hasMultiHouseCap: boolean;           // 2022 이전: true
  rateDescription: string;             // "단일 0.5%~2.7%" 등
};

// ⚠️ UI 자체 재구현 금지 (feedback_ui_engine_dual_truth_avoidance)
// → 엔진이 getComprehensiveParams(year) export 후 import로 교체 예정
// → 그 전까지 아래 정적 매핑은 임시 display-only (API 전송값은 assessmentYear만)
const YEAR_DISPLAY_PARAMS: Record<number, YearDisplayParams> = {
  2021: {
    basicDeductionGeneral: 600_000_000,
    basicDeductionOneHouse: 1_100_000_000,
    fairMarketRatioHousing: 0.95,
    taxCapRate: 1.5,
    hasMultiHouseCap: true,
    rateDescription: "일반(2주택 이하) 0.6%~3.0% / 다주택(조정2주택·3주택+) 1.2%~6.0%",
  },
  2022: {
    basicDeductionGeneral: 600_000_000,
    basicDeductionOneHouse: 1_100_000_000,
    fairMarketRatioHousing: 0.60,  // STEP 13 정정 — 초안 1.00 오류 (사례1 ×60% 실측)
    taxCapRate: 1.5,
    hasMultiHouseCap: true,
    rateDescription: "일반(2주택 이하) 0.6%~3.0% / 다주택(조정2주택·3주택+) 1.2%~6.0%",
  },
  2023: {
    basicDeductionGeneral: 900_000_000,
    basicDeductionOneHouse: 1_200_000_000,
    fairMarketRatioHousing: 0.60,
    taxCapRate: 1.5,
    hasMultiHouseCap: false,
    rateDescription: "2주택 이하 0.5%~2.7% / 3주택 이상 12억 초과 중과 2.0%~5.0% (§9①2호 — 자동 적용)",
  },
  2024: {
    basicDeductionGeneral: 900_000_000,
    basicDeductionOneHouse: 1_200_000_000,
    fairMarketRatioHousing: 0.60,
    taxCapRate: 1.5,
    hasMultiHouseCap: false,
    rateDescription: "2주택 이하 0.5%~2.7% / 3주택 이상 12억 초과 중과 2.0%~5.0% (§9①2호 — 자동 적용)",
  },
  2025: {
    basicDeductionGeneral: 900_000_000,
    basicDeductionOneHouse: 1_200_000_000,
    fairMarketRatioHousing: 0.60,
    taxCapRate: 1.5,
    hasMultiHouseCap: false,
    rateDescription: "2주택 이하 0.5%~2.7% / 3주택 이상 12억 초과 중과 2.0%~5.0% (§9①2호 — 자동 적용)",
  },
};
```

**RadioCardGroup 설정**:
- `tone="sky"` (일반 정보 — CLAUDE.md 규칙)
- `layout="inline"` (연도 5개 = 짧은 숫자 라벨)
- 선택된 연도 옆에 `[현재]` 배지 (currentYear와 일치 시)

**연도 변경 onChange 처리**:

```tsx
// onChange — useEffect → store 미러링 금지 (memory 정책)
// 단순 값 변경 + result invalidate + 조건부 필드 가시성은 파생(컴포넌트 내 조건부 렌더)
function handleYearChange(year: string) {
  updateFormData({
    assessmentYear: year,
    // 연도 변경 시 result 무효화는 페이지 레벨에서 처리
  });
  // result invalidate: 페이지 레벨 setResult(null) 호출 필요
  // → page.tsx의 updateFormData를 wrapping하는 handleUpdateFormData 헬퍼로 처리
  //   또는 store의 updateFormData를 intercepting해 result 초기화 포함
}
```

**연도 변경 시 result 무효화 설계**:

```tsx
// page.tsx에서 formData 변경 시 result 무효화
// 방안: store의 updateFormData를 override하는 로컬 헬퍼 (useEffect 아님)
function handleFormUpdate(data: Partial<ComprehensiveFormData>) {
  updateFormData(data);
  if (result !== null) {
    setResult(null); // 연도 변경 포함 모든 폼 변경 시 기존 결과 무효화
  }
}
```

**주의**: 기존 모든 `updateFormData` 호출을 `handleFormUpdate`로 교체하면 모든 Step에서 폼 수정 시 result가 초기화된다. Step1 연도 변경만 대상으로 하려면 `assessmentYear` 변경 시에만 조건 처리. 정책 결정 필요 (아래 권장 사항 참조).

> **권장 정책**: 과세연도 변경만 result 무효화 (다른 필드는 재계산 버튼이 명시적). Step1Basic에서 assessmentYear onChange 시에만 setResult(null).

#### 2.5.2 Step5TaxCap — `isMultiHouseInAdjustedArea` 조건부 ToggleCard

**조건**: `parseInt(formData.assessmentYear) < 2023` 일 때만 노출.

```
Step5TaxCap (과세연도 2022일 때 예시):
┌──────────────────────────────────────────────────────┐
│ ┌─ rose ToggleCard ─────────────────────────────────┐│
│ │ 조정대상지역 2주택 이상                           OFF││
│ │ 세부담 상한 300% 적용 (종합부동산세법 §10② 구법)     ││
│ │                                                    ││
│ │ ON 시 안내:                                        ││
│ │  "2022 귀속 기준 조정대상지역 2주택 이상 보유자는    ││
│ │   세부담 상한이 전년도 세액의 300%입니다. (§10②)     ││
│ │   2023년부터 해당 조항이 삭제되어 150%로 단일화됨."  ││
│ └────────────────────────────────────────────────────┘│
│                                                      │
│ 전년도 총세액 (선택)                                 │
│ ┌────────────────────────────────────────────────────┐│
│ │ CurrencyInput (hint: 종부세+재산세 합계, 농특세 제외)││
│ └────────────────────────────────────────────────────┘│
│                                                      │
│ ┌─ 세부담 상한 계산 안내 ──────────────────────────┐  │
│ │ 상한액 = 전년도 세액 × 300% (조정대상지역 2주택+)  │  │ ← 연도/조건에 따라 동적
│ │ 또는:                                             │  │
│ │ 상한액 = 전년도 세액 × 150% (일반)               │  │
│ └───────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘

과세연도 2023+ 일 때:
┌──────────────────────────────────────────────────────┐
│ [isMultiHouseInAdjustedArea ToggleCard 숨김]         │
│                                                      │
│ 전년도 총세액 (선택)                                 │
│ ...                                                  │
│ ┌─ 세부담 상한 계산 안내 ──────────────────────────┐  │
│ │ 상한액 = 전년도 세액 × 150% (종합부동산세법 §10)  │  │
│ └───────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

**ToggleCard 설정**:
- `tone="rose"` (지역·지정 정보)
- `variant="card"` (기본)
- children: 연도별 조항 설명 (§10② 구법 명시)

**3-state 노출 정책** (memory `feedback_ui_toggle_auto_visibility_policy`):
- `assessmentYear >= 2023`: `hidden_permanent` — ToggleCard 아예 렌더하지 않음
- `assessmentYear < 2023`: 항상 노출 (default OFF / 사용자가 ON 선택)

**구현**:

```tsx
const year = parseInt(formData.assessmentYear) || new Date().getFullYear();
const showMultiHouseCap = year < 2023;

// Step5TaxCap JSX
{showMultiHouseCap && (
  <ToggleCard
    tone="rose"
    title="조정대상지역 2주택 이상"
    description="세부담 상한 300% 적용 (종합부동산세법 §10② 구법 — 2022 귀속 이전)"
    checked={formData.isMultiHouseInAdjustedArea}
    onCheckedChange={(v) => updateFormData({ isMultiHouseInAdjustedArea: v })}
  >
    <p className="text-xs text-rose-700">
      2022 귀속(과세기준일 2022-06-01)까지 적용된 조항입니다.
      2023년부터 조항이 삭제되어 일반 150% 상한으로 단일화됩니다.
    </p>
  </ToggleCard>
)}
```

### 2.6 ⑥ 사이드바 합계

현재 종합부동산세 마법사는 `WizardSidebar` 미사용 (page.tsx에 사이드바 없음). 사이드바 관련 변경 없음.

### 2.7 ⑦ 결과 카드 산식 표시

**변경 대상**: `ComprehensiveTaxResultView.tsx`

#### 2.7.1 HousingTaxBaseSection — 기본공제 금액 동적 표시

현행 하드코딩:
```tsx
label={`기본공제 (${result.isOneHouseOwner ? "1세대1주택 12억" : "일반 9억"})`}
```

**개선**: result의 `basicDeduction` 값을 포맷해 표시 (엔진 echo 활용 — 연도에 무관히 정확):

```tsx
label={`기본공제 (${result.isOneHouseOwner ? "1세대1주택" : "일반"} ${formatKRW(result.basicDeduction)})`}
```

이렇게 하면 엔진이 연도별로 6억/9억/11억/12억을 반환해도 결과뷰가 자동으로 올바른 값 표시.

#### 2.7.2 HousingTaxSection — 세부담상한 capRate 동적 표시

현행:
```tsx
label={`세부담 상한 (${formatRate(taxCap.capRate)} = ${formatKRW(taxCap.capAmount)})`}
note={taxCap.isApplied ? "상한 적용됨" : "상한 미도달"}
```

이미 `taxCap.capRate`를 echo하고 있으므로, 엔진이 2022 연도에 3.0을 반환하면 "300%" 자동 표시. 추가 수정 불필요.

**단, 설명 텍스트 (현행 Step5TaxCap)는 수정 필요**:

현행:
```tsx
<p>상한액 = 전년도 세액 × 150% (종합부동산세법 §10)</p>
```

개선 — 연도에 따라 조건부:
```tsx
{showMultiHouseCap ? (
  <p>상한액 = 전년도 세액 × {formData.isMultiHouseInAdjustedArea ? "300%" : "150%"}</p>
) : (
  <p>상한액 = 전년도 세액 × 150% (종합부동산세법 §10)</p>
)}
```

#### 2.7.3 결과뷰 하단 적용 세법 정보 표시 (신규)

현행 결과뷰 하단:
```tsx
<p>과세기준일: {result.assessmentDate}</p>
<p>적용 법령 기준일: {result.appliedLawDate}</p>
```

**개선**: 과세연도별 적용 파라미터 요약 표시 (엔진 echo 기반):

```tsx
<div className="text-xs text-muted-foreground space-y-0.5">
  <p>과세기준일: {result.assessmentDate}</p>
  <p>적용 기본공제: 일반 {formatKRW(result.basicDeduction)} / ...</p>
  <p>공정시장가액비율: {formatRate(result.fairMarketRatio)}</p>
  <p>세부담 상한: {formatRate(result.taxCap?.capRate ?? 1.5)}</p>
  <p>적용 법령: {result.appliedLawDate}</p>
</div>
```

**단, 이 섹션은 엔진이 연도별 파라미터를 result에 echo하는 시점에 정확히 표시 가능**. 현행 result는 이미 `fairMarketRatio`, `basicDeduction`, `taxCap.capRate`를 포함하므로 추가 echo 없이도 표시 가능.

---

## 3. Zod 스키마 / Route 변경 — ⑨⑩⑫⑬⑭ 지점

### 3.1 ⑨ Zod 입력 스키마 (`lib/validators/comprehensive-input.ts`)

신규 필드 추가:

```typescript
// comprehensiveTaxInputSchema 에 추가
isMultiHouseInAdjustedArea: z.boolean().optional(),
```

`optional()` 로 처리 — 2023+ 연도 요청에서 전송하지 않아도 통과. 엔진에서 `assessmentYear >= 2023` 시 무시.

### 3.2 ⑫ Zod 입력 객체 정의 (Zod strip 방지)

현재 `ComprehensiveTaxInputSchema` 에 `isMultiHouseInAdjustedArea` 가 없으므로 API body에 포함해도 Zod가 strip함. 스키마에 추가 필수.

### 3.3 ⑬ callComprehensiveApi body spread

`page.tsx` 의 body 객체에 `isMultiHouseInAdjustedArea` 추가 (위 ④ 지점과 동일).

### 3.4 ⑭ Route handler 엔진 input 매핑

`app/api/calc/comprehensive/route.ts` 의 `toEngineInput()` 함수:

```typescript
return {
  // ... 기존 필드 ...
  assessmentYear: schema.assessmentYear,
  previousYearTotalTax: schema.previousYearTotalTax,
  isMultiHouseInAdjustedArea: schema.isMultiHouseInAdjustedArea, // 신규
  landAggregate: schema.landAggregate,
  landSeparate: schema.landSeparate,
  targetDate: schema.targetDate,
};
```

`ComprehensiveTaxInput` 타입에도 `isMultiHouseInAdjustedArea?: boolean` 추가 필요 (엔진 시니어 담당).

### 3.5 ⑧ Validation (`lib/calc/comprehensive-validate.ts`)

현재 `lib/calc/comprehensive-validate.ts` 파일이 없음 — step 검증 로직이 `page.tsx` 에 인라인으로 없음(각 step 버튼 클릭 시 즉시 다음으로 넘어감).

validation 추가 시 정책:
- `isMultiHouseInAdjustedArea`: optional (미입력 = false와 동일). validation 차단 불필요.
- `assessmentYear`: `SUPPORTED_YEARS` 범위 검증 추가 권장.

---

## 4. 14개 동기화 지점 영향 목록

이번 변경에서 영향받는 지점:

| 지점 | 위치 | 변경 내용 | 담당 |
|---|---|---|---|
| ① FormData 타입 | `lib/stores/comprehensive-wizard-store.ts` | `isMultiHouseInAdjustedArea: boolean` 추가 | UI |
| ② initial value | 동상 | `isMultiHouseInAdjustedArea: false` | UI |
| ③ normalize fallback | 동상 (persist partialize) | `?? false` fallback | UI |
| ④ API 변환 | `page.tsx` callComprehensiveApi | `isMultiHouseInAdjustedArea` body 추가 | UI |
| ⑤ UI 입력 위젯 | `page.tsx` Step1Basic, Step5TaxCap | RadioCardGroup 연도 선택 + 조건부 ToggleCard | UI |
| ⑥ 사이드바 | 해당 없음 | 변경 없음 | — |
| ⑦ 결과 카드 | `ComprehensiveTaxResultView.tsx` | 기본공제 라벨 동적화, 세법 요약 표시 | UI |
| ⑧ validation | 인라인 (현재 없음) | 연도 범위 검증 추가 권장 | UI |
| ⑨ Zod enum | `lib/validators/comprehensive-input.ts` | `isMultiHouseInAdjustedArea` optional boolean | UI/API |
| ⑩ Zod companion | 해당 없음 | 변경 없음 | — |
| ⑪ acquisitionDate fallback | route.ts | 변경 없음 | — |
| ⑫ Zod 입력 객체 정의 | `lib/validators/comprehensive-input.ts` | strip 방지 필드 추가 (⑨와 동일) | UI/API |
| ⑬ API body spread | `page.tsx` | `isMultiHouseInAdjustedArea` 추가 | UI |
| ⑭ Route handler 엔진 input 매핑 | `app/api/calc/comprehensive/route.ts` | `toEngineInput()` 에 필드 전달 | API |

**엔진 시니어 담당 (UI 담당 외)**:
- `ComprehensiveTaxInput` 타입에 `isMultiHouseInAdjustedArea?: boolean` 추가
- `getComprehensiveParams(year)` 구현 및 엔진 내부 적용
- `applyTaxCap()` 에서 year + isMultiHouseInAdjustedArea 결합하여 capRate 결정

---

## 5. 엔진 시니어에게 요청할 항목

### 5.1 필수 요청 (UI 구현 차단 항목)

1. **`getComprehensiveParams(year: number): ComprehensiveYearParams` 함수 구현 및 export**
   - 반환 타입 예시:
     ```typescript
     interface ComprehensiveYearParams {
       basicDeductionGeneral: number;     // 6억 or 9억
       basicDeductionOneHouse: number;    // 11억 or 12억
       fairMarketRatioHousing: number;    // 0.60, 0.95, 1.00
       taxCapRateGeneral: number;         // 1.5
       taxCapRateMultiHouseAdjusted: number; // 3.0 (year < 2023만 유효)
       housingBracketsGeneral: ComprehensiveBracket[]; // 일반(2주택 이하) — 엔진 설계 flat 필드명\n       housingBracketsMulti: ComprehensiveBracket[];   // 다주택 — 현행 3주택+ 포함 필수
       supportedYears: readonly number[]; // [2021, 2022, 2023, 2024, 2025]
     }
     ```
   - UI는 이 함수를 import해 `YEAR_DISPLAY_PARAMS` 정적 매핑 대신 사용 (dual-truth 방지)

2. **`ComprehensiveTaxInput` 타입에 `isMultiHouseInAdjustedArea?: boolean` 추가**
   - 파일: `lib/tax-engine/types/comprehensive.types.ts`

3. **`applyTaxCap()` 시그니처 확장** — 엔진 설계 최종안(STEP 11)과 동기:
   ```typescript
   // 4번째 인자 capRate 추가 (기본 1.5 — 기존 3-인자 호출 회귀 0).
   // 상한율 결정(연도·다주택)은 호출부(comprehensive-tax.ts)가 isMultiHouseRate로 수행.
   applyTaxCap(comprehensiveTax, totalPropertyTax, previousYearTotalTax, capRate?)
   ```

4. **`ComprehensiveYearParams` 에서 연도별 세율 구간 (`housingBrackets`) 제공**
   - 2022 이전은 다주택/1세대1주택 세율이 분리됨 — 입력 시 주택 수 추가 정보 필요 여부 판단 필요
   - UI가 세율 구간을 직접 구현하지 않도록 엔진 단일 진실 유지

5. **`result.assessmentYear` echo 추가** (현재 `ComprehensiveTaxResult`에 없음)
   - `assessmentYear: number` 를 result에 포함하면 결과뷰에서 조건부 텍스트 판단에 사용 가능

### 5.2 선택 요청 (UI 구현 후 품질 개선용)

6. **`SUPPORTED_YEARS` 상수 export**
   - `lib/tax-engine/comprehensive-tax.ts` 또는 `legal-codes/comprehensive.ts` 에서 export
   - UI의 RadioCardGroup 옵션 배열과 단일 진실

7. **2022 귀속 다주택 세율 구간 법령 검증**
   - 2022 이전 다주택 중과세율 (§9③④ 구법) 의 정확한 bracket 값 확인 및 엔진 구현
   - UI는 결과뷰에서 적용 세율을 echo만 하므로 엔진이 정확히 계산하면 자동 반영

---

## 6. 과세연도 RadioCardGroup ASCII 위젯 상세

```
Step 1 — 기본 정보

과세연도 *
────────────────────────────────────────────

[ 2021 ] [ 2022 ] [ 2023 ] [ 2024 ★현재 ] [ 2025 ]
  sky      sky      sky      sky selected    sky
 off      off      off      on             off

 → layout="inline", tone="sky"
 → 현재연도 배지: bg-sky-200 text-sky-800 텍스트 "[현재]"

────────────────────────────────────────────
┌─ amber FieldCard "선택 연도의 적용 세법" ─────────────┐
│ 2024 귀속 적용 기준                                    │
│  기본공제: 일반 9억원 / 1세대1주택 12억원              │
│  공정시장가액비율 (주택분): 60%                        │
│  세율: 단일 누진 0.5%~2.7% (7단계, 종합부동산세법 §9①)│
│  세부담 상한: 전년도 세액의 150% (§10)                 │
└────────────────────────────────────────────────────────┘
                        ↓ 2022 선택 시

┌─ amber FieldCard "선택 연도의 적용 세법" ─────────────┐
│ 2022 귀속 적용 기준 (개정 전 구법)                     │
│  기본공제: 일반 6억원 / 1세대1주택 11억원              │
│  공정시장가액비율 (주택분): 60%                        │
│  세율: 일반 0.6%~3.0% / 다주택 1.2%~6.0%             │
│  세부담 상한: 150% (조정대상지역 2주택+ 300% §10②)    │
└────────────────────────────────────────────────────────┘

과세기준일: 2022-06-01 (종합부동산세법 §16①)
```

---

## 7. Step5TaxCap 연도별 분기 전체 화면 흐름

```
══ 과세연도 2022, isMultiHouseInAdjustedArea=true 선택 시 ══

Step 5: 세부담 상한

┌─ rose ToggleCard [ON] ──────────────────────────────────┐
│ ● 조정대상지역 2주택 이상                                │
│   세부담 상한 300% 적용 (구 §10② — 2022 귀속 이전)      │
│                                                          │
│   2022 귀속(과세기준일 2022-06-01)까지 조정대상지역     │
│   2주택 이상 보유자에게 적용된 규정입니다.               │
│   2023년부터 해당 조항이 삭제되어 150%로 단일화됩니다.   │
└──────────────────────────────────────────────────────────┘

전년도 총세액 (선택)
[         종부세 + 재산세 합계 (농특세 제외)         ]

┌─ 세부담 상한 안내 ───────────────────────────────────┐
│ 상한액 = 전년도 세액 × 300%                          │
│ 당해 종부세가 상한액을 초과하면: 상한액 − 재산세       │
│ = 확정 종부세 결정세액                                │
└──────────────────────────────────────────────────────┘


══ 과세연도 2023+, 또는 2022이지만 isMultiHouseInAdjustedArea=false ══

Step 5: 세부담 상한

[isMultiHouseInAdjustedArea ToggleCard 숨김 또는 OFF]

전년도 총세액 (선택)
[         종부세 + 재산세 합계 (농특세 제외)         ]

┌─ 세부담 상한 안내 ───────────────────────────────────┐
│ 상한액 = 전년도 세액 × 150% (종합부동산세법 §10)      │
│ 당해 종부세가 상한액을 초과하면: 상한액 − 재산세       │
│ = 확정 종부세 결정세액                                │
└──────────────────────────────────────────────────────┘
```

---

## 8. 결과뷰 연도별 산식 표시 — 변경 전후 비교

### 현행 (고정 텍스트)

```
기본공제 (1세대1주택 12억)  -1,200,000,000
공제 후 금액                 300,000,000
공정시장가액비율 적용 (60%)  180,000,000  [만원 미만 절사]
```

### 개선 (연도 echo 기반 동적 표시)

```
// 2024 귀속 (현행 동일)
기본공제 (1세대1주택 1,200,000,000원)  -1,200,000,000
공제 후 금액                              300,000,000
공정시장가액비율 적용 (60%)              180,000,000  [만원 미만 절사]

// 2022 귀속 (엔진이 연도별 값 반환 시)
기본공제 (1세대1주택 1,100,000,000원)  -1,100,000,000
공제 후 금액                              400,000,000
공정시장가액비율 적용 (100%)             400,000,000  [만원 미만 절사]
```

**기술 구현**: `result.basicDeduction` 과 `result.fairMarketRatio` 를 그대로 formatKRW/formatRate 로 표시. 현행 코드가 이미 이 패턴 일부를 따르고 있어 수정 최소화.

---

## 9. 정책 결정 항목 (13단계 검토에서 확정)

1. ~~2022 이전 다주택 세율 분리 — 주택 수 입력 필요 여부~~ → **해소 (STEP 13)**: 주택 수는 엔진이 `aggregationExclusion.includedCount`로 **자동 도출** — 입력 불필요. UI 입력은 `isMultiHouseInAdjustedArea`(조정대상지역 2주택, ≤2022만 노출) 하나뿐. 3주택 이상 중과는 연도 무관 자동 적용(현행 §9①2호 포함). ToggleCard description에 "3주택 이상은 주택 수로 자동 적용됩니다 — 이 토글은 조정대상지역 **2주택** 보유 시에만 켜세요" 안내 추가.

2. **지원 연도 범위**: 2021~현행(default). 2020 이전은 미지원 — 엔진 warnings + UI Select가 사전 차단 (silent fallback 금지).

3. **연도 변경 시 result 무효화**: 과세연도 변경만 `setResult(null)` (다른 필드는 명시적 재계산 버튼). 확정.

4. **YEAR_DISPLAY_PARAMS 임시 매핑**: ~~엔진 구현 전 임시 사용~~ → **폐기 (STEP 13)**: Do 순서상 엔진(Phase A·B)이 UI(Phase D)보다 선행하므로 처음부터 `getComprehensiveParams(year)` import (dual-truth 원천 차단). 본 문서의 YEAR_DISPLAY_PARAMS 코드 블록은 표시 항목 참고용으로만 유지.

### 9-1. 결과뷰 다주택 중과 표시 (STEP 13 추가 — 엔진 echo `isMultiHouseRateApplied` 연동)

`result.isMultiHouseRateApplied === true`일 때 주택분 세율 행에 배지:
- ≤2022: "다주택 중과세율 적용 (조정대상지역 2주택 또는 3주택 이상 — 구 §9①3호)"
- 2023+: "3주택 이상 중과세율 적용 (§9①2호 — 12억 초과 구간)"

---

## 10. Definition of Done (UI 담당 — 7개 지점)

- [ ] `ComprehensiveFormData`에 `isMultiHouseInAdjustedArea: boolean` 추가
- [ ] `defaultFormData`에 `isMultiHouseInAdjustedArea: false` 추가
- [ ] sessionStorage normalize에 `?? false` fallback
- [ ] `callComprehensiveApi` body에 `isMultiHouseInAdjustedArea` 포함
- [ ] Step1Basic: `<input type="text">` → RadioCardGroup (2021~2025) + 세법 hint 카드
- [ ] Step1Basic: 연도 변경 시 `setResult(null)` 호출
- [ ] Step5TaxCap: `parseInt(assessmentYear) < 2023` 조건부 ToggleCard
- [ ] Step5TaxCap: 세부담상한 안내 텍스트 연도별 동적화
- [ ] `ComprehensiveTaxResultView`: `basicDeduction` 라벨 동적화 (`formatKRW(result.basicDeduction)`)
- [ ] Zod 스키마에 `isMultiHouseInAdjustedArea: z.boolean().optional()`
- [ ] `toEngineInput()` 에 `isMultiHouseInAdjustedArea` 전달
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/comprehensive-*` 회귀 통과
- [ ] E2E (memory `feedback_browser_verify_with_playwright` — 수동 확인 금지, spec으로 충족):
  - CPT-YA-E2E-1: 2022 선택 + 사례1 입력(공시 9.5억) → 결과 산출세액 1,260,000·결정 756,000 텍스트 검증
  - CPT-YA-E2E-2: 2022 선택 → Step5 조정대상지역 ToggleCard 노출 / 2024 선택 → 미노출
  - CPT-YA-E2E-3: 2022 + 사례9 (3주택 합산 29억) → 다주택 중과 배지 + 28,080,000 검증
  - worktree: `E2E_PORT=3100 npx playwright test e2e/comprehensive-tax-year-aware.spec.ts`

**엔진 시니어 구현 완료 후 추가 작업**:
- [ ] `YEAR_DISPLAY_PARAMS` 정적 매핑 → `getComprehensiveParams(year)` import 교체
- [ ] `ComprehensiveTaxInput` 타입에 `isMultiHouseInAdjustedArea` 있는지 확인
- [ ] 결과뷰 하단 적용 세법 요약 섹션 (result.assessmentYear echo 시)

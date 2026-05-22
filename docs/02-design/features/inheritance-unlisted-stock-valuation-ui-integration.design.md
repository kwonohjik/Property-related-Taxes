# 비상장주식 평가 후속 UI 14지점 통합 디자인 문서 (v3)

> **Status**: Design v3 — 11단계 자가검토 통과 (1차 10건 + 2차 6건 + 통합비교 4건 = 20건 정정)
> **계획서 동기화**: plan v3 (`evaluationDeltaRows` 단일 통합 배열, 12 섹션 순서, anchor 5건 cross-link)
> **계획서**: [`inheritance-unlisted-stock-valuation-ui-integration.plan.md`](../../00-pm/inheritance-unlisted-stock-valuation-ui-integration.plan.md)
> **본 디자인 범위**: PR-E·F·M·N·Q 5건의 UI 14지점 + 컴포넌트 명세 + StoryBoard
> **Date**: 2026-05-22

---

## 0. 디자인 원칙

1. **단일 진실 (Engine Type)**: UI는 `EstateItem.unlistedStockValuationV2: UnlistedStockValuationInput` 엔진 타입 직접 read/write. 별도 FormState 없음
2. **3중 패턴 강제**: UI display fallback ↔ API 변환 ↔ validate 동일 fallback 적용
3. **useEffect → store 미러링 금지**: cross-field 자동 동기화는 onChange / useMemo
4. **명시 입력 강제**: 자동 판정 모드(auto)는 입력 필수, validate에서 차단
5. **800줄 정책**: 신규/확장 컴포넌트 800줄 근접 시 sibling 분리
6. **enum exact 비교**: substring 매칭 금지

---

## 1. 폼 상태 구조 (단일 진실 — UnlistedStockValuationInput 확장)

### 1-1. 엔진 입력 타입 확장 (선행 PR `0f4c42b`에서 신규 헬퍼 export 완료 — UI 통합 시 입력 타입 확장 동반)

```typescript
// lib/tax-engine/types/unlisted-stock-valuation.types.ts (확장)

export interface UnlistedStockValuationInput {
  // 기존 필드 (commit 0f4c42b까지)
  corpName: string;
  totalShares: number;
  ownedShares: number;
  isRealEstateHeavy: boolean;
  isMaxShareholder: boolean;
  // ...

  // ===== PR-N 신규 (평가차액 행 단위) =====
  // 본 필드는 netAssetValueRaw 하위로 들어감
  // netAssetValueRaw에 assetDeltaRows / liabilityDeltaRows optional 추가

  // ===== PR-E 신규 (§22② 자동 도출 3-state) =====
  /**
   * §22② 추가공제 제외 자동 도출 모드.
   * - "auto": ownedShares/totalShares 비율 자동 판정 (deriveSection22MajorShareholder)
   * - "manual_on": 사용자 명시 ON
   * - "manual_off": 사용자 명시 OFF
   * default "auto" — UI 첫 진입 시 자동 모드.
   *
   * ※ 이 필드는 §22② 추가공제 제외용. §63③ 할증평가(isMaxShareholder)와는 다른 개념.
   */
  section22MajorShareholderMode?: "auto" | "manual_on" | "manual_off";

  // ===== PR-F 신규 (§54⑤ 부동산과다 자동 판정 3-state) =====
  /**
   * §54⑤ 부동산과다보유법인 자동 판정 모드.
   * "auto": totalAssetsForJudgment / realEstateAssetsForJudgment 비율 자동 판정
   * "manual_on" / "manual_off": isRealEstateHeavy 직접 override
   */
  realEstateHeavyMode?: "auto" | "manual_on" | "manual_off";
  /** §54⑤ 자동 판정용 자산총액 (재무상태표상). manual 모드 시 미사용. */
  totalAssetsForJudgment?: number;
  /** §54⑤ 자동 판정용 부동산 자산 합계 (소법 §94①4호다목). manual 모드 시 미사용. */
  realEstateAssetsForJudgment?: number;
}

// netAssetValueRaw 확장
export interface UnlistedNetAssetCalculation {
  // 기존 필드 (commit 0f4c42b까지) — 총액 입력
  bsTotalAssets: number;
  assetValuationDelta: number;
  // ...
  otherProvision: number;  // ⑮ PR-Q (이미 존재)
  insuranceReservePolicy?: number;       // PR-M (이미 존재 optional)
  insuranceExtraordinaryReserve?: number; // PR-M (이미 존재 optional)
  insuranceSurrenderReserve?: number;     // PR-M (이미 존재 optional)

  // ===== PR-N 신규 (행 단위 입력, optional — 미입력 시 총액 fallback) =====
  /**
   * 평가차액 자산·부채 행 단위 입력 (3쪽 5.평가차액).
   * 자산·부채는 `category` 필드로 단일 배열에 통합 저장 (DO2 정정).
   * 미입력 시 `assetValuationDelta` 총액 사용 (3중 패턴 fallback).
   *
   * ★ DC3·DO1 정정: 엔진 net-asset-calc.ts는 `assetValuationDelta` 1개 총액 필드만 사용.
   *    PR-N 통합 시 엔진 진입점 unlisted-orchestrator.ts:113에서 `resolveEvaluationDelta()`를 호출하여
   *    자산·부채 행 단위 합계의 **차액(① − ②)** 을 `assetValuationDelta`에 주입.
   *    별도 부채 평가차액 필드 신설 X — 자산·부채 차액이 자산총액 가산 단일 항목으로 흡수되는 것이
   *    별지 양식 2쪽 4.가.② "평가차액"의 정확한 의미와 일치.
   */
  evaluationDeltaRows?: EvaluationDeltaRow[];
}
```

### 1-2. EvaluationDeltaRow 타입 (신규 헬퍼에서 import)

```typescript
// lib/tax-engine/property-valuation/evaluation-delta.ts (이미 commit 0f4c42b에 존재)

export interface EvaluationDeltaRow {
  rowId: string;            // UI key (crypto.randomUUID())
  category: "asset" | "liability";
  accountName: string;       // 계정과목 (자유 입력)
  evaluationAmount: number;  // 상증법 평가액
  bookAmount: number;        // 재무상태표 금액
  // delta(차액)는 derive — UI에서 useMemo로 계산
}
```

### 1-3. 필드명 마이그레이션 (계획서 §0 정책 — 엔진 타입 우선)

| 기존 (ValuationDeltaTable.tsx) | 신규 (engine) | 작업 |
|---|---|---|
| `evaluatedValue` | `evaluationAmount` | rename + 사용처 grep |
| `bookValue` | `bookAmount` | rename + 사용처 grep |
| `accountName` | `accountName` | 그대로 |

---

## 2. UI 컴포넌트 명세

### 2-1. MajorShareholderStockToggle (PR-E 신규)

**위치**: `components/calc/inheritance/unlisted-stock-v2/MajorShareholderStockToggle.tsx`

```tsx
// DI1 정정 — onChange 시그니처 통일 (patch 객체 패턴)
interface MajorShareholderStockToggleProps {
  mode: "auto" | "manual_on" | "manual_off";
  ownedShares: number;
  totalShares: number;
  onChange: (patch: { section22MajorShareholderMode: "auto" | "manual_on" | "manual_off" }) => void;
}
```

**렌더 구조**:
```
┌─ §22② 최대주주 추가공제 제외 ──────────────────── [§22② LawLink] ┐
│ ⓘ 추가공제 자동 판정은 §22② 전용 — §63③ 할증평가는 별도            │
│                                                                   │
│ [◉ 자동 판정 (보유지분율 기준)]                                   │
│ [○ 수동: 최대주주 해당 ON]                                        │
│ [○ 수동: 최대주주 해당 OFF]                                       │
│                                                                   │
│ ┌─ 자동 판정 미리보기 ─────────────────────────────────────────┐ │
│ │ 보유지분율 = 26,000 / 50,000 = 52.00%                       │ │
│ │ → §22② 최대주주 해당 (violet 배지)                          │ │
│ └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**내부 로직**:
- `useMemo`로 `deriveSection22MajorShareholder({ ownedShares, totalShares })` 호출
- 미리보기 카드는 mode === "auto" 시만 표시
- mode === "manual_on" 시: violet 배지 "수동: 최대주주 해당" (자동 결과 무시)
- mode === "manual_off" 시: slate 배지 "수동: 비대주주"

### 2-2. RealEstateHeavyToggle (PR-F 신규)

**위치**: `components/calc/inheritance/unlisted-stock-v2/RealEstateHeavyToggle.tsx`

```tsx
interface RealEstateHeavyToggleProps {
  mode: "auto" | "manual_on" | "manual_off";
  totalAssetsForJudgment: number;
  realEstateAssetsForJudgment: number;
  onChange: (patch: Partial<{
    realEstateHeavyMode: "auto" | "manual_on" | "manual_off";
    totalAssetsForJudgment: number;
    realEstateAssetsForJudgment: number;
  }>) => void;
}
```

**렌더 구조**:
```
┌─ §54⑤ 부동산과다보유법인 판정 ────────────── [§54① LawLink] ┐
│ ⓘ 가중치 반전: 일반 (순손익×3+순자산×2)/5  vs  부동산과다 (순손익×2+순자산×3)/5 │
│                                                                │
│ [◉ 자동 판정 (자산 비율 기준)]                                 │
│ [○ 수동: 부동산과다 ON]                                        │
│ [○ 수동: 부동산과다 OFF]                                       │
│                                                                │
│ -- 자동 모드 시만 표시 --                                      │
│ 자산총액           [ 2,476,889,520 ]원                         │
│ 부동산 자산 합계   [   400,550,000 ]원 (소법 §94①4호다목)      │
│                                                                │
│ ┌─ 비율 미리보기 ───────────────────────────────────────────┐ │
│ │ 부동산 비율 = 400,550,000 / 2,476,889,520 = 16.17%       │ │
│ │ → 일반법인 (50% 미만, slate 배지)                         │ │
│ │  ※ 부동산 ≥ 50%일 때 rose 배지로 부동산과다보유법인 표시 │ │
│ └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

**내부 로직**: `useMemo`로 `judgeIsRealEstateHeavy(...)` 호출.

### 2-3. ValuationDeltaTable (PR-N 기존 → input-capable 확장)

**위치**: `components/calc/inheritance/unlisted-stock-v2/ValuationDeltaTable.tsx`

**현재 상태**: display-only (props로 `assetDelta`/`liabilityDelta` 총액만 수신)

**확장 후 props**:
```tsx
interface ValuationDeltaTableProps {
  /**
   * 행 단위 입력 모드 (default false — 총액 fallback).
   * DO3 정정: UI 로컬 상태 X — `evaluationDeltaRows`가 1개 이상 존재하면 자동으로 inputMode=true.
   * 사용자가 "행 단위 입력 모드" 토글로 행 추가/삭제하며, 빈 배열로 되돌리면 자동 OFF.
   */
  inputMode: boolean;
  /**
   * 자산·부채 행 통합 배열 (`category` 필드로 분리, DO2 정정).
   * UI에서는 `rows.filter(r => r.category === "asset")` 등으로 섹션 분리 표시.
   */
  evaluationDeltaRows: EvaluationDeltaRow[];
  /** 총액 fallback (행 미입력 시 표시·사용) */
  fallbackAssetDelta: number;
  /** 행 변경 콜백 (DI1 정정 — 통일된 patch 패턴) */
  onRowsChange: (rows: EvaluationDeltaRow[]) => void;
  /** 입력 모드 토글 변경 */
  onInputModeChange: (next: boolean) => void;
}
```

**렌더 구조 (inputMode=true)**:
```
┌─ 5.평가차액 (별지 부표3 3쪽) ─────────────────────────────┐
│ [ ] 행 단위 입력 모드 (총액 직접 입력 → toggle)            │
│                                                            │
│ ▼ 자산 평가차액                                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 계정과목      │ 상증법 평가액  │ 재무상태표  │ 차액   │×│ │
│ │ [미수이자  ] │ [ 5,744,770 ] │ [5,300,000]│ 444,770│×│ │
│ │ [매출채권  ] │ [299,050,000 ] │ [298,534,500]│515,500│×│ │
│ │ ...                                                    │ │
│ │ ─────────────────────────────────────────────────────  │ │
│ │ ① 합계                                       107,324,150│ │
│ │ [+ 자산 행 추가]                                       │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ ▼ 부채 평가차액                                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ [외화채무  ] │ [185,335,800 ] │ [200,560,000] │△15,224,200│×│ │
│ │ ...                                                    │ │
│ │ ② 합계                                        15,775,800│ │
│ │ [+ 부채 행 추가]                                       │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ ┌─ 평가차액 (① − ②) ────────────────────  91,548,350 ─┐ │
│ │ → 2쪽 4.가.② 기재값                                    │ │
│ └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

**음수 차액 표시**: `delta < 0` 시 `△{|delta|.toLocaleString()}` (rose-600).

**행 추가/삭제 UX**:
- 행 추가: `rowId = crypto.randomUUID()` + 빈 행 push
- 행 삭제: `× 버튼` (rose tone)
- 행 수 max: 자산 50 / 부채 30 (계획서 §6 정책)

**800줄 정책**: 본 컴포넌트 600줄 근접 시 `AssetDeltaRows.tsx` + `LiabilityDeltaRows.tsx` sibling 분리.

**Sibling 분리 시 props 인터페이스** (DO6 정정):
```tsx
interface DeltaRowsSectionProps {
  /** 본 섹션의 category 필터 (asset 또는 liability) */
  category: "asset" | "liability";
  /** 전체 통합 배열에서 본 섹션만 필터링한 행 */
  rows: EvaluationDeltaRow[];
  /** 행 변경 콜백 — 부모는 전체 통합 배열에서 본 섹션을 교체하여 onRowsChange 호출 */
  onSectionRowsChange: (sectionRows: EvaluationDeltaRow[]) => void;
  /** 최대 행 수 (자산 50 / 부채 30) */
  maxRows: number;
}
```

**inputMode 우선순위** (DM3 정정):
- `inputMode === true` AND `evaluationDeltaRows.length === 0`: 빈 표 + "행 추가" 버튼 표시
- `inputMode === false` AND `evaluationDeltaRows.length > 0`: 사용자가 명시 OFF한 경우 — 행은 보존하되 비활성 + 안내 "토글 ON 시 입력값 반영"
- `inputMode === false` AND `evaluationDeltaRows.length === 0`: 총액 fallback 모드 (기본)
- 기본 정책: `inputMode`는 사용자 토글 명시 상태 그대로 보존 (자동 derive X — feedback_three_state_optional_mode_toggle 패턴)

### 2-4. NetAssetCalculationTable (PR-M·Q 기존 확장)

**위치**: `components/calc/inheritance/unlisted-stock-v2/NetAssetCalculationTable.tsx`

**기존 동작**: 별지 2쪽 4.순자산가액 ⑨~⑱ 부채 필드 입력.

**확장 작업**:
1. **⑮ 충당금 확정분 라벨 정정** (PR-Q):
   ```
   기존: "⑮ 기타 (충당금 중 평가기준일 현재 비용으로 확정된 것 등)"
   신규: "⑮ 기타 (충당금 중 평가기준일 현재 비용으로 확정된 것)" [§17의2 4호 단서 가 LawLink]
   ```

2. **보험법인 토글 + 3 필드** (PR-M):
   ```
   ┌─ 보험사업·보험회사 여부 ─────────────────── [§17의2 4호 단서 나·다] ┐
   │ [ ] 보험사업·보험회사 (해당 시 책임준비금 등 부채 가산)              │
   │                                                                       │
   │ -- 토글 ON 시만 표시 --                                               │
   │ 책임준비금 (§30① / 보험업법 §120)        [          0 ]원             │
   │ 비상위험준비금 (§31①)                    [          0 ]원             │
   │ 해약환급금준비금 (§32①)                  [          0 ]원             │
   └───────────────────────────────────────────────────────────────────────┘
   ```

### 2-5. UnlistedStockV2Card (orchestrator 확장)

**위치**: `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx`

**기존 동작**: 9개 sibling 컴포넌트 통합. `UnlistedStockValuationInput` 직접 read/write.

**확장 작업**:
1. `MajorShareholderStockToggle` + `RealEstateHeavyToggle` 신규 import 및 배치
2. `ValuationDeltaTable` props 확장 (inputMode·assetRows·liabilityRows·onChange)
3. 자동 판정 결과 echo 카드 (useMemo로 헬퍼 직접 호출 — engine result echo 필드 없이)

**섹션 순서** (DM1 정정 — 입력 의존성 순서):

```
[Section 1: 평가대상 비상장법인] — 기존 CorporateInfoSection
[Section 2: 순자산만 평가 사유] — 기존 (5종 라디오)
[Section 3: 부동산과다 자동 판정] — 🆕 RealEstateHeavyToggle (PR-F)
[Section 4: 평가차액 (3쪽)] — 🔧 ValuationDeltaTable 확장 (PR-N)
  ※ 3쪽 → 2쪽 의존성: 3쪽 평가차액이 2쪽 자산총액 ②에 흡수.
   양식 페이지 순서(2→3)와 다르나 사용자 입력 의존성 순서(3 먼저 → 2 자동 도출).
[Section 5: 순자산가액 (2쪽)] — 🔧 NetAssetCalculationTable 확장 (PR-M·Q)
  ※ 평가차액 ②는 Section 4에서 자동 도출된 값을 read-only 표시.
[Section 6: 1주당 순자산가액] — 기존 (③ ÷ 발행주식)
[Section 7: 영업권 (5쪽)] — 기존 GoodwillCalculationTable
[Section 8: 1주당 순손익가액 (6쪽)] — 기존 FiscalYearAdjustmentTable
[Section 9: 자본금 변동] — 기존 CapitalChangeTable
[Section 10: 최대주주 §22② 자동 판정] — 🆕 MajorShareholderStockToggle (PR-E)
[Section 11: 결과 카드] — 🔧 PerShareValuationResultCard 확장 (DO7 정정)
  ※ 본 PR 기존 카드에 PR-E·F 자동 판정 결과 echo 라인 2 추가:
    - "§22② 최대주주 자동 판정: ON / OFF (보유지분율 N%)"
    - "§54⑤ 부동산과다 자동 판정: ON / OFF (부동산 비율 N%)"
  ※ useMemo로 헬퍼 직접 호출 — engine result 확장 없이 표시.
[Section 12: 별지 양식 미리보기] — 기존 BesshiForm4Buppyo3PrintView
```

### 2-6. BesshiForm4Buppyo3PrintView (PR-N 확장)

**기존 동작**: 별지 부표3 6쪽 양식 미리보기/인쇄.

**확장 작업**:
- 3쪽 5.평가차액 섹션에 행 단위 렌더링 (assetRows/liabilityRows derive 표시)
- 행 미입력 시 fallback: 총액만 표시 (현재 동작 보존)
- 음수 차액은 `△` 부호 (양식 표기 정합)

### 2-7. InheritanceSidebar + computeInheritanceSummary 확장 (선택)

**위치**: `components/calc/inheritance/InheritanceSidebar.tsx` + `lib/stores/inheritance-summary.ts`

**확장 작업**: 비상장주식 자산에 평가차액·자동 판정 결과 노출 (선택). 현재 사이드바는 비상장주식 평가액만 표시.

---

## 3. API 변환 매트릭스

### 3-1. lib/calc/inheritance-api.ts (④⑬)

```typescript
// 본 PR-UI 통합 시 추가 변환 로직 (DC1 정정 — section22 모드는 body에 spread 안 함)

function buildUnlistedStockV2Body(
  formInput: UnlistedStockValuationInput,
): UnlistedStockValuationInput {
  return {
    ...formInput,
    // ===== PR-N: 행 단위 입력 spread (3중 패턴) =====
    netAssetValueRaw: {
      ...formInput.netAssetValueRaw,
      // 행 단위는 통합 배열로 그대로 전달
      // 엔진 진입점 unlisted-orchestrator.ts:113 에서 resolveEvaluationDelta() 호출
      evaluationDeltaRows: formInput.netAssetValueRaw.evaluationDeltaRows,
    },

    // ===== PR-E: §22② 모드는 API body에 spread 안 함 (DC1 정정) =====
    // §22②는 추가공제 제외 결정용 — 별도 EstateItem.isMajorShareholderStock 필드로 처리.
    // 본 PR-UI 통합 범위에서는 UI useMemo 표시 + EstateItem 자동 채움까지.
    // 엔진은 §22② 모드 자체를 모르며, isMaxShareholder는 §63③ 할증평가 용 그대로 사용.

    // ===== PR-F: 자동 모드 시 isRealEstateHeavy 도출 =====
    isRealEstateHeavy:
      formInput.realEstateHeavyMode === "auto"
        ? judgeIsRealEstateHeavy({
            totalAssets: formInput.totalAssetsForJudgment ?? 0,
            realEstateAssets: formInput.realEstateAssetsForJudgment ?? 0,
          }).isRealEstateHeavy
        : formInput.realEstateHeavyMode === "manual_on"
          ? true
          : formInput.realEstateHeavyMode === "manual_off"
            ? false
            : formInput.isRealEstateHeavy, // legacy fallback
  };
}
```

### 3-2. lib/calc/inheritance-validate.ts (⑧)

```typescript
function validateUnlistedStockV2(item: EstateItem): ValidationError[] {
  const errs: ValidationError[] = [];
  const v2 = item.unlistedStockValuationV2;
  if (!v2) return errs;

  // PR-F 자동 모드 시 totalAssetsForJudgment·realEstateAssetsForJudgment 필수
  if (v2.realEstateHeavyMode === "auto") {
    if (!(v2.totalAssetsForJudgment > 0)) {
      errs.push({ field: "totalAssetsForJudgment", message: "자동 판정 시 자산총액 입력 필수" });
    }
  }

  // PR-N 행 단위 입력 시 각 행 accountName 필수
  v2.netAssetValueRaw.assetDeltaRows?.forEach((row, idx) => {
    if (!row.accountName.trim()) {
      errs.push({ field: `assetDeltaRows.${idx}.accountName`, message: "계정과목 입력 필수" });
    }
  });

  // PR-M 보험 토글 ON 시 최소 1 필드 (warning만)
  // ...

  return errs;
}
```

### 3-3. lib/validators/unlisted-stock-valuation-v2.schema.ts (⑨⑩⑫)

```typescript
const evaluationDeltaRowSchema = z.object({
  rowId: z.string(),
  category: z.enum(["asset", "liability"]),
  accountName: z.string().min(1, "계정과목 필수"),
  evaluationAmount: z.number().nonnegative(),
  bookAmount: z.number().nonnegative(),
});

const modeSchema = z.enum(["auto", "manual_on", "manual_off"]);

// netAssetValueRaw 확장 (S2 정정 — 단일 배열 통합)
const netAssetValueRawSchema = z.object({
  // 기존 필드
  // ...
  evaluationDeltaRows: z
    .array(evaluationDeltaRowSchema)
    .max(80) // 자산 50 + 부채 30 합산 한도
    .optional()
    .superRefine((rows, ctx) => {
      if (!rows) return;
      const assetCount = rows.filter((r) => r.category === "asset").length;
      const liabilityCount = rows.filter((r) => r.category === "liability").length;
      if (assetCount > 50) ctx.addIssue({ code: "custom", message: "자산 행 50개 초과 불가" });
      if (liabilityCount > 30) ctx.addIssue({ code: "custom", message: "부채 행 30개 초과 불가" });
    }),
});

// UnlistedStockValuationInput 확장
const unlistedStockValuationV2Schema = z.object({
  // 기존 필드
  // ...
  section22MajorShareholderMode: modeSchema.optional(),
  realEstateHeavyMode: modeSchema.optional(),
  totalAssetsForJudgment: z.number().nonnegative().optional(),
  realEstateAssetsForJudgment: z.number().nonnegative().optional(),
});

// refines (⑩)
unlistedStockValuationV2Schema.superRefine((data, ctx) => {
  if (data.realEstateHeavyMode === "auto") {
    if (!(data.totalAssetsForJudgment && data.totalAssetsForJudgment > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["totalAssetsForJudgment"],
        message: "§54⑤ 자동 판정 시 자산총액 입력 필수",
      });
    }
  }
});
```

### 3-4. app/api/calc/inheritance/route.ts + app/api/calc/gift/route.ts (⑭)

```typescript
// Route handler 자체 변경 X — 엔진 진입점이 자기완결적 처리.
// DC2·DM2 정정: 엔진 본체 1줄 수정 위치·내용 명확화

// lib/tax-engine/property-valuation/unlisted-orchestrator.ts:113
//
// 기존:
//   const netAssetResult = calcNetAssetTotal(input.netAssetValueRaw);
//
// 신규:
//   const deltaResolved = resolveEvaluationDelta({
//     assetDeltaRows: input.netAssetValueRaw.evaluationDeltaRows?.filter(r => r.category === "asset"),
//     liabilityDeltaRows: input.netAssetValueRaw.evaluationDeltaRows?.filter(r => r.category === "liability"),
//     assetEvaluationDeltaTotal: input.netAssetValueRaw.assetValuationDelta, // 총액 fallback
//   });
//   const netAssetResult = calcNetAssetTotal({
//     ...input.netAssetValueRaw,
//     // 자산·부채 차액의 net = 자산 합계 − 부채 합계 = 별지 양식 가.평가차액 (DC3·DO1 정정)
//     // 이 값이 자산총액 가산 항목 ② 에 흡수됨
//     assetValuationDelta: deltaResolved.evaluationDelta,
//   });
//
// 즉 행 단위 입력 시 evaluationDelta (자산 − 부채) 가 단일 차액으로 도출되어
// 별지 양식 2쪽 4.가.② "평가차액" 항목과 1:1 매핑. 부채 평가차액 별도 필드 신설 X.
```

---

## 4. UI 사용자 시나리오 (StoryBoard)

### 시나리오 1: 사례 6 풀 입력 (PR-N + PR-E + PR-F + PR-M·Q 통합)

```
[Flow 1] 평가대상 입력 (Section 1·2)
  → 법인명·자본금·발행주식 50,000·평가기준일 2024-01-20

[Flow 2] §54⑤ 부동산과다 자동 판정 (Section 3 — PR-F)
  → 모드 "auto" 선택 (default)
  → totalAssetsForJudgment 2,476,889,520 입력
  → realEstateAssetsForJudgment 400,550,000 입력
  → 비율 16.17% → slate 배지 "일반법인"
  → isRealEstateHeavy=false 자동 도출

[Flow 3] 평가차액 행 단위 입력 (Section 5 — PR-N)
  → "행 단위 입력 모드" 토글 ON
  → 자산 8행 + 부채 3행 입력 (계획서 §5-1 시나리오 표)
  → ① 자산 합계 = 107,324,150 (자동)
  → ② 부채 합계 = 15,775,800 (자동)
  → 평가차액 = 91,548,350 (자동)

[Flow 4] 순자산가액 입력 (Section 6 — PR-M·Q)
  → 일반 부채 9~14 입력
  → ⑮ 충당금 확정분 라벨 확인 (PR-Q)
  → 보험법인 토글 OFF (사례 6은 일반법인)
  → 영업권 포함 전 순자산 489,351,700 자동 도출

[Flow 5] 자본금·순손익 입력 (Section 8·9) — 기존 동작
  → 6쪽 7.순손익액 사업연도별 22항목 입력
  → 가중평균 1,166 자동 → ⑤ 11,660

[Flow 6] §22② 자동 판정 (Section 10 — PR-E)
  → 모드 "auto"
  → ownedShares 26,000 / totalShares 50,000 → 52% violet 배지
  → §22② 최대주주 해당 자동 도출
  → DI3 정정: 본 PR-UI 통합 범위는 자동 판정 결과를 결과 카드에 echo 라인 표시까지만.
    EstateItem.isMajorShareholderStock 자동 채움 + 다른 EstateItem의 §22 추가공제 cross-cutting은
    별도 PR (가칭 PR-E2)로 분리 — 본 PR은 평가 시점 자동 판정 UX만 제공.

[Flow 7] 결과 카드 확인 (Section 11)
  → ⑥ 1주당 평가액 = 10,910 (max((9,787×2+11,660×3)/5, 9,787×80%))
  → ⑦ 비최대주주 = 10,910
  → ⑧ 최대주주 = 13,092 (×120%)
  → 상속재산가액 = 13,092 × 26,000 = 340,392,000

[Flow 8] 별지 미리보기 (Section 12)
  → 1·2·3·5·6쪽 자동 렌더링
  → 3쪽 행 단위 표 정합 확인
```

### 시나리오 2: 부동산과다 수동 override (PR-F manual mode)

```
[Flow 1·2] 평가대상 + 부동산과다
  → 모드 "manual_on" 선택 (사용자 명시)
  → 자산 입력 필드 비활성 (자동 판정 우회)
  → isRealEstateHeavy=true 수동 적용
  → 1주당 평가액 산식 (⑤×2 + ④×3)/5 자동 반전
```

### 시나리오 3: 보험법인 + 충당금 확정분 (PR-M·Q)

```
[Flow 4 변형] 순자산가액 입력 — 보험법인
  → "보험사업·보험회사" 토글 ON
  → 책임준비금 200,000,000 / 비상위험 50,000,000 / 해약환급 80,000,000 입력
  → 부채총액 +330M (§17의2 4호 단서 나·다)
  → 일반 충당금 ⑮ 70,000,000 (PR-Q, §17의2 4호 단서 가 — 모든 법인)
  → 부채 가산 +70M 추가
```

---

## 5. validation 매트릭스

| PR | 검증 항목 | 시점 | 차단/경고 |
|---|---|---|---|
| PR-E | `section22MajorShareholderMode === "auto"` + `ownedShares·totalShares` 미입력 | submit | 차단 |
| PR-F | `realEstateHeavyMode === "auto"` + `totalAssetsForJudgment` 미입력 | submit | 차단 |
| PR-F | `realEstateHeavyMode === "auto"` + `realEstateAssetsForJudgment` 미입력 | submit | 차단 |
| PR-N | 행 단위 입력 + `accountName` 빈 문자열 | submit | 차단 |
| PR-N | 행 수 > 50 (자산) / > 30 (부채) | input 시점 | 차단 (UI에서 추가 버튼 비활성) |
| PR-N | 행 단위 + 총액(`assetValuationDelta`) 동시 입력 (DO4 정정) | submit | 통과 (행 단위 우선 정책) — 단 결과 카드에 "행 단위 입력 사용 / 총액 무시" 안내 |
| PR-M | 보험 토글 ON + 3 필드 모두 0 | submit | 경고 |
| PR-Q | (없음 — `otherProvision` optional, default 0) | — | — |

---

## 6. anchor (UI 통합 단계 신규)

본 UI 통합 PR은 **엔진 변경 최소** (PR-N에 한해 진입점 1줄 수정). 신규 anchor 5건:

| anchor ID | 검증 | 파일 (DO5 정정 — 위치 결정) |
|---|---|---|
| UI-N-1 | `resolveEvaluationDelta()` 엔진 진입점 통합 — 행 단위 입력 → 평가차액 자동 도출 (자산 합 − 부채 합) | **신규** `__tests__/tax-engine/property-valuation/orchestrator-evaluation-delta.test.ts` (entry point 통합 검증) |
| UI-N-2 | 행 미입력 시 총액 `assetValuationDelta` fallback (회귀, 사례 6 동일 결과) | 동일 |
| UI-EF-1 | API 변환 `realEstateHeavyMode="auto"` + 자산 입력 → `isRealEstateHeavy` 자동 도출 | **신규** `__tests__/calc/inheritance-api-pr-ef.test.ts` |
| UI-EF-2 | API 변환 `manual_on` → true override (자산 입력 무시) | 동일 |
| UI-VAL-1 | validate `realEstateHeavyMode="auto"` + 자산 미입력 → 차단 | **신규** `__tests__/calc/inheritance-validate-pr-ef.test.ts` |

---

## 6-1. Phase별 작업량 (계획서 §3 동기화)

| Phase | 작업 | 일수 |
|---|---|---|
| A | 사전 조사 (stores·9 컴포넌트 review) | 0.5 |
| B | PR-Q + PR-M (라벨·토글) | 0.3~0.5 |
| C | PR-E + PR-F (Toggle 컴포넌트 2개 신규) | 2 |
| D | PR-N (ValuationDeltaTable 확장 + 엔진 1줄 수정) | 1.5~2 |
| E | 통합 검증 (사례 6 풀 입력 + 회귀 + sync-checker) | 0.5 |
| **합계** | | **4.8~5.5** |

## 7. Definition of Done

- [ ] 신규 컴포넌트 2개 (`MajorShareholderStockToggle`·`RealEstateHeavyToggle`)
- [ ] 기존 컴포넌트 4개 확장 (`ValuationDeltaTable` input-capable / `NetAssetCalculationTable` 보험 토글 / `UnlistedStockV2Card` orchestrator / `BesshiForm4Buppyo3PrintView` 행 단위)
- [ ] 타입 확장: `UnlistedStockValuationInput`에 3 신규 필드 (`section22MajorShareholderMode` + `realEstateHeavyMode` + 2 자산 필드) + `UnlistedNetAssetCalculation`에 `assetDeltaRows`·`liabilityDeltaRows`·`liabilityValuationDelta` optional
- [ ] Zod schema 정합 (refines + max 50/30 행 한도)
- [ ] API 변환 3중 패턴 (UI display ↔ API ↔ validate)
- [ ] 엔진 진입점 `unlisted-orchestrator.ts:113` 1줄 수정 (resolveEvaluationDelta 호출) + engine.design.md 갱신
- [ ] 사례 6 풀 입력 브라우저 수동 검증 (Network 탭 신규 필드 송신 확인)
- [ ] 회귀 0건 (4,024 PASS 기준 유지) + 신규 anchor 5건
- [ ] `npm run typecheck` 0
- [ ] ui-engine-sync-checker 0 누락
- [ ] 800줄 정책 위반 0

---

## 8. 참고 자료

- 계획서 v2: [`inheritance-unlisted-stock-valuation-ui-integration.plan.md`](../../00-pm/inheritance-unlisted-stock-valuation-ui-integration.plan.md)
- 후속 디자인 v3 (엔진+anchor 단계): [`inheritance-unlisted-stock-valuation-followup.design.md`](./inheritance-unlisted-stock-valuation-followup.design.md)
- 본 PR 엔진 design: [`inheritance-unlisted-stock-valuation.engine.design.md`](./inheritance-unlisted-stock-valuation.engine.design.md)
- 본 PR UI design (선행): [`inheritance-unlisted-stock-valuation.ui.design.md`](./inheritance-unlisted-stock-valuation.ui.design.md)
- 정책 메모리: `feedback_mirror_pattern`, `feedback_useeffect_store_mirror_forbidden`, `feedback_silent_omission_full_input_enforcement`, `feedback_three_state_optional_mode_toggle`, `feedback_dialog_data_discard_confirm`, `feedback_explicit_prop_mapping_strip`, `feedback_store_default_vs_ui_display_fallback`, `feedback_800line_split_export_preservation`, `feedback_enum_substring_match_forbidden`

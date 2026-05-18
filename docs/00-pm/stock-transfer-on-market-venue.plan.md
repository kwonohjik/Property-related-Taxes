# 주식 양도세 — 장내·장외 거래 구분 추가 계획서

> 버그 수정 + UX 개선 PR. 상장 비대주주 비과세(§94①3 가목 1) 단서)의 핵심 조건인 "장내 거래"를 명시 입력으로 받아 silent 비과세 분류 차단.
> 작성일 2026-05-18 · 대상 도메인 `lib/tax-engine/stock-transfer/`

## 1. 배경 — 현재 버그

### 1.1 법령 — 소득세법 §94①3 가목 (재검토 — KoreanLaw MCP 미검증, Phase A에서 확인 필수)

> 본문: "「자본시장과 금융투자업에 관한 법률」 제8조의2제4항제1호에 따른 증권시장에 상장된 주식등 중 다음의 어느 하나에 해당하는 것". 증권시장 = 한국거래소 운영 KOSPI·KOSDAQ·KONEX 3개.
> 단서: "주권상장법인의 대주주가 양도하는 것" + "증권시장에서의 거래에 의하지 아니하고 양도하는 것".

| 가목 분기 | 조건 | 과세 여부 |
|---|---|---|
| 가목 1) **장내** | KOSPI·KOSDAQ·KONEX 증권시장 **장내거래** + **비대주주** | **비과세** (본문 미해당 — 가목 1) 단서 모두 통과 시) |
| 가목 1) **단서①** | KOSPI·KOSDAQ·KONEX **장내거래** + **대주주** | 과세 (§104①11) |
| 가목 1) **단서②** | KOSPI·KOSDAQ·KONEX **장외거래** (대주주·비대주주 무관) | **과세** (§104①11) |
| 가목 2) | K-OTC 등 협회중개시장 거래 (실제론 marketType="unlisted" + isKOTCTrading=true 조합) | 별도 분기 (§103②2호, K-OTC 비대주주·중소·벤처 비과세 별도) |

> ★ **Pre-Do 필수 검증**: KoreanLaw MCP로 §94①3 가목 본문·단서 원문, §157④ 코넥스 대주주 임계, §103②2호 정확 인용 확인. 사례 39 [[feedback_korean_law_82_vs_81_2_drift]] 패턴.

→ 같은 상장주식이라도 **거래소 밖**(블록딜·대량매매·장후거래·개인 간 양도·증여성 양도 등)은 **비대주주여도 과세**.

### 1.2 현재 앱 동작

`lib/tax-engine/stock-transfer/stock-classification.ts:115-122`:

```ts
// 1. 상장 비대주주 장내거래 → 비과세
if (
  (marketType === "kospi" || marketType === "kosdaq" || marketType === "konex") &&
  !isMajor &&
  !isKOTCTrading
) {
  return { isExempt: true, reason: "non_major_in_market" };
}
```

- `isKOTCTrading=false` 만 검증 → **K-OTC 아닌 모든 장외거래도 silent 비과세**.
- 사용자가 "장내 거래"임을 명시하지 않았는데도 자동으로 비과세 분기 진입.
- 결과 카드(`StockTransferTaxResultView.tsx:157-216`)는 `acquisitionPrice=0` 하드코드(별도 PR `9e43c29`에서 정보용 echo로 일부 수정).

### 1.3 영향 범위

- 코스피·코스닥·코넥스 + 비대주주 + 비K-OTC 케이스 전부 → 장내·장외 무관 비과세 처리.
- 신고서 양식·PDF·이력 저장도 모두 "비과세"로 일관 → 사용자가 장외 양도분을 신고할 때 잘못된 가이드.

## 2. 목표

1. **장내/장외 거래 구분 입력 필드 신설** — 사용자가 명시할 때만 비과세 분기 진입.
2. **장외 거래 시 과세 흐름 전 단계 계산** — 양도가→취득가→필요경비→양도소득금액→기본공제→과세표준→세율(§104①11 가목)→산출세액→가산세→지방소득세까지 모두 산출.
3. **장내 거래 시에도 산출세액까지 정보용 계산** — 결과 페이지에 "장내 거래로 §94①3 가목 단서에 따라 비과세 (최종 납부세액 0)" 안내와 함께 전체 계산 결과 표시.
4. **회귀 보호** — 기존 273개 stock-transfer anchor + 신규 anchor로 장내/장외 양 분기 보장.

## 3. 인터뷰 (사용자 미응답 → 권장안 채택)

> 사용자 요청: "인터뷰 필요하면 인터뷰 진행 후 계획서 작성". AskUserQuestion 시도했으나 진행 중단 → 권장안으로 본 계획서 확정. 사용자가 다른 선택 원하면 즉시 plan 갱신.

| # | 결정사항 | 권장안 | 대안 (사용자 변경 가능) |
|---|---|---|---|
| Q1 | UI 배치 | **Step 1 시장·대주주 카드 그룹** — KOSPI/KOSDAQ/KONEX + 비대주주일 때만 조건부 노출 | Step 2 양도가액 카드 상단 / Step 1 신규 "거래 형태" 단독 카드 |
| Q2 | Default 값 | **`onMarket = true` (장내) 기본 + 명시 toggle** — 회귀 0 보장. 사용자 토글 OFF 시 장외 과세 진입 | `false` 기본·필수 입력 강제 (UX 부담 ↑ 회귀 우려) |
| Q3 | 장외 분류·세율 | **신규 enum `listed_off_market_non_major` 신설 + 세율 함수는 `listed_otc_non_major`와 공유** | `listed_otc_non_major` 단순 재사용 (라벨 혼동·신고서 분류 오기 위험으로 권장 변경) |
| Q4 | 비과세 결과 표시 | **전체 계산 + 마지막에 비과세 처리** — 양도차익·과세표준·산출세액 모두 표시, 최종 납부세액만 0. 사용자가 시뮬레이션 가능 | 현행 비과세 카드 + 정보용 취득가액만 (PR `9e43c29` 수준) |

## 4. 설계

### 4.1 데이터 모델

#### 4.1.1 신규 Input 필드 — `lib/tax-engine/stock-transfer/types/stock-transfer.types.ts`

```ts
/**
 * 장내 거래 여부 (소득세법 §94①3 가목 1) 단서).
 *
 * - true: 거래소 장내 거래 — 비대주주 + 상장 3시장 시 §94①3 가목 단서 비과세.
 * - false: 장외 거래(블록딜·대량매매·시간외·개인간 양도·증여성 양도 등) — 비대주주여도 과세.
 *
 * KOSPI/KOSDAQ/KONEX + 비대주주 케이스만 의미 있음.
 * 대주주·비상장·K-OTC·기타자산은 무시(분기 미적용).
 *
 * @default true (기존 동작 유지)
 */
isOnMarketTransaction?: boolean;
```

#### 4.1.2 FormData 필드 — `lib/stores/calc-wizard-stock-store.ts`

```ts
isOnMarketTransaction: boolean;  // factory default: true
```

- `migrateLegacyForm`에서 `undefined`인 기존 sessionStorage → `true` 마이그레이션 (회귀 0).

#### 4.1.3 taxCategory 확장 (Q3 재검토 — 신규 enum 추가)

```ts
// types/stock-transfer.types.ts:334 ~ taxCategory union에 추가
export type StockTaxCategory =
  | "listed_major"
  | "listed_non_major_in_market"
  | "listed_otc_non_major"        // 기존 — K-OTC 거래 (marketType=unlisted + isKOTCTrading)
  | "listed_off_market_non_major" // ★ NEW — KOSPI/KOSDAQ/KONEX 장외 비대주주
  | "unlisted_major"
  | ...
```

**enum 분리 사유**:
- `listed_otc_non_major` 정의 = K-OTC 거래소 분류. 장외 비대주주를 같은 enum에 묶으면 신고서·이력·통계에서 K-OTC로 오분류.
- `appliedSection94`도 분기 필요: K-OTC = `"①3가2)"` / 장외 비대주주 = `"①3가1)"` (가목 1)호 본문 적용).
- 세율 함수(`applyStockTaxRate`)는 두 enum이 동일 분기로 라우팅(§104①11 가목 일반세율). 라벨·신고서만 분리.

**[[feedback_enum_substring_match_forbidden]] 준수**: `taxCategory.includes("non_major")` 등 substring 매칭 금지. 헬퍼 `isListedNonMajorTaxable(c)` 추출.

### 4.2 엔진 로직 변경

#### 4.2.1 `stock-classification.ts:judgeExemption` — 비과세 조건 강화

```ts
function judgeExemption(input, isMajor) {
  // 1. 상장 비대주주 장내거래 → 비과세 (§94①3 가목 1) 단서)
  if (
    (marketType === "kospi" || marketType === "kosdaq" || marketType === "konex") &&
    !isMajor &&
    !isKOTCTrading &&
    input.isOnMarketTransaction !== false   // ★ NEW: false면 장외 과세
  ) {
    return { isExempt: true, reason: "non_major_in_market" };
  }
  // K-OTC 분기는 그대로
  ...
}
```

#### 4.2.2 `stock-classification.ts:classifySection94` — 장외 비대주주 분류

```ts
// §94①3 분류 (KOSPI/KOSDAQ/KONEX 비대주주 분기)
if (isMajor) { /* listed_major */ }
if (isKOTCTrading) {
  // 주의: marketType=kospi/kosdaq/konex + isKOTCTrading=true 조합은 모순 (K-OTC는 비상장 협회중개시장).
  // 현행 코드는 marketType이 상장이어도 isKOTCTrading=true면 listed_otc_non_major 진입 → 데이터 정합 가드 필요.
  // 본 PR 범위 밖이나 validate에 cross-field 차단 추가 후속 PR 권장.
  return { taxCategory: "listed_otc_non_major", ... };
}
if (input.isOnMarketTransaction === false) {
  // ★ NEW: 장외 비대주주 → 과세 (가목 1) 본문 적용, 단서 미해당)
  return {
    taxCategory: "listed_off_market_non_major", // 신규 enum
    appliedSection94: "①3가1)",
    section94_2Applied: false,
    basicDeductionGroup: "stock",
  };
}
// 장내 비대주주 → 비과세 (분류는 listed_non_major_in_market, 가목 1) 단서 통과)
return {
  taxCategory: "listed_non_major_in_market",
  appliedSection94: "①3가1)",
  section94_2Applied: false,
  basicDeductionGroup: "stock",
};
```

#### 4.2.3 `stock-transfer-tax.ts` — 비과세 분기에서도 전체 계산

현행: STEP 1 직후 `buildExemptResult` 조기 반환 (`stock-transfer-tax.ts:74-77`). 직전 PR `9e43c29`에서 `computeInformationalAcquisition`을 호출해 취득가액·평가 상세만 echo 추가.

**신규 동작**:
- **장외 (과세)**: `classification.isExempt = false` → 일반 흐름 그대로.
- **장내 (비과세)**: 조기 반환 폐지 → STEP 1~11 전부 실행하되, STEP 12 결과 조립 시 `applyExemptZeroing` 헬퍼로 최종 세액만 0 강제. `calculatedTax`·`taxBase`·`transferIncome` 등 중간 산식값은 모두 echo.

```ts
// 기존 stock-transfer-tax.ts:74-77 (PR 9e43c29):
if (classification.isExempt) {
  return buildExemptResult(input, classification);  // 조기 반환 (정보용 echo만)
}

// 신규:
// (조기 반환 제거 — STEP 2~11 정상 실행)
const result = finalizeStockTax(...); // STEP 12

if (classification.isExempt) {
  // applyExemptZeroing(result, classification) — sibling 헬퍼 분리 (800줄 정책)
  return applyExemptZeroing(result, classification);
}
return result;
```

**`applyExemptZeroing` 사양** (`lib/tax-engine/stock-transfer/apply-exempt-zeroing.ts` 신규):

```ts
export function applyExemptZeroing(
  result: StockTransferResult,
  classification: ReturnType<typeof classifyStockTransfer>,
): StockTransferResult {
  return {
    ...result,
    isExempt: true,
    exemptReason: classification.exemptReason,
    // 최종 세액 분기만 0
    finalTax: 0,
    localIncomeTax: 0,
    underReportPenalty: 0,
    latePaymentPenalty: 0,
    electronicFilingCredit: 0,
    // 중간 산식값(transferPrice·acquisitionPrice·transferIncome·basicDeduction·
    // taxBase·calculatedTax·appliedRate·valuationDetail·postListingDetail 등)은 보존
    // 정보용으로 결과 카드에 노출
  };
}
```

**기존 `buildExemptResult` 처리**:
- 폐지하지 않고 **deprecated 표시**. 신규 흐름이 안정화되면 후속 PR에서 제거.
- `computeInformationalAcquisition`은 그대로 활용 — `applyExemptZeroing` 내부에서는 이미 STEP 3로 계산된 값을 사용하므로 별도 호출 불필요. **다만 STEP 1 후 조기 종료가 가능한 edge case**(`marketType="other_asset"` + `isExempt=true` 같은 미래 분기)를 대비해 두 경로 모두 살림.

### 4.3 UI 변경

#### 4.3.1 입력 폼 — Step 1 시장·대주주 카드 그룹

`components/calc/stock-transfer/MarketTypeBlock.tsx` (또는 동등 위치):

```tsx
{/* KOSPI/KOSDAQ/KONEX + 비대주주 일 때만 노출 */}
{(marketType === "kospi" || marketType === "kosdaq" || marketType === "konex") &&
 !isComputedMajor &&
 !isKOTCTrading && (
  <ToggleCard
    checked={form.isOnMarketTransaction}
    onCheckedChange={(v) => onChange({ isOnMarketTransaction: v })}
    title="거래소 장내 거래 (§94①3 가목 1) 단서)"
    description={
      form.isOnMarketTransaction
        ? "장내 거래 — 비대주주 비과세 적용. 산출세액까지 정보용 표시."
        : "장외 거래(블록딜·대량매매·개인간 양도 등) — 비대주주여도 과세."
    }
    tone="emerald"
  />
)}
```

#### 4.3.2 결과 카드 — `StockTransferTaxResultView.tsx` 분기

```tsx
if (result.isExempt) {
  // 변경: 비과세 안내 카드 + 전체 계산 결과 표 + 최종 0 강조
  return (
    <div>
      <ExemptHeaderCard /* 비과세 사유 안내 */ />
      <FullCalcResultTable /* 양도가·취득가·필요경비·양도차익·기본공제·과표·산출세액 echo */ />
      <FinalZeroBanner>
        장내 거래로 §94①3 가목 단서에 따라 비과세.
        산출세액 {calculatedTax} → 최종 납부세액 0.
      </FinalZeroBanner>
      <StockFilingFormTable result={result} /* 신고서 표 — 비과세 사유 강조 */ />
      <PostListingDetailCard /> {/* 환산 산식 펼침 */}
      <MajorShareholderResultCard />
    </div>
  );
}
```

#### 4.3.3 신고서 양식 표 변경

- 23행 "적용 세율" → 비과세여도 실세율 표시 (예: "20% (§104①11 가목·비대주주)") + 별도 행에 "비과세 사유" 라인 추가.
- 32행 "최종 납부세액" 0 강조 + 비과세 사유 footer.

### 4.4 Validation

`lib/calc/stock-transfer-tax-validate.ts`:

- `isOnMarketTransaction`은 항상 default 있으므로 필수 검증 불요.
- 단, **isOnMarketTransaction=false인데 marketType이 unlisted/other_asset·K-OTC인 경우** 사용자 혼란 방지를 위해 warning 또는 자동 무시.

## 5. 14 동기화 지점

| # | 지점 | 변경 | 위치 |
|---|---|---|---|
| ① | 폼 상태 타입 | `isOnMarketTransaction: boolean` | `lib/stores/calc-wizard-stock-store.ts` `StockTransferFormData` |
| ② | initial value | `true` | `INITIAL_STOCK_FORM_DATA` |
| ③ | normalize fallback | `normalizeStockForm` `value ?? true` | 동상 |
| ④ | API 변환 | `body.isOnMarketTransaction = form.isOnMarketTransaction` | `lib/calc/stock-transfer-tax-api.ts` |
| ⑤ | UI 위젯 | ToggleCard 조건부 노출 | `components/calc/stock-transfer/MarketTypeBlock.tsx` (또는 신규 컴포넌트) |
| ⑥ | 사이드바 합계 | 변경 없음 (boolean) | — |
| ⑦ | 결과 카드 | 비과세 분기 전면 개편 (전체 계산 표시 + 최종 0) | `StockTransferTaxResultView.tsx`, `StockFilingFormTable.tsx` |
| ⑧ | Validation | 별도 검증 불요 (default 있음) | — |
| ⑨ | Zod enum 메인 | 변경 없음 (boolean) | — |
| ⑩ | Zod enum 컴패니언 | — | — |
| ⑪ | 자산-수준 fallback | — | — |
| ⑫ | **Zod 입력 객체 정의** | `isOnMarketTransaction: z.boolean().optional().default(true)` | `lib/api/stock-transfer-tax-schema.ts` |
| ⑬ | **callStockTransferTaxAPI body spread** | `body.isOnMarketTransaction = form.isOnMarketTransaction` 매핑 | `lib/calc/stock-transfer-tax-api.ts` |
| ⑭ | **Route handler 엔진 input 매핑** | `isOnMarketTransaction: coerced.isOnMarketTransaction` (단건 + buildEngineInput 두 곳) | `app/api/calc/stock-transfer/route.ts` |

## 6. 케이스 매트릭스 (anchor 필수)

| ID | marketType | isMajor | isOnMarket | isKOTC | 기대 결과 |
|---|---|---|---|---|---|
| **OM-1** | kospi | false | **true** | false | **비과세** (현행 동작 보존) — 산출세액 echo + finalTax=0. taxCategory=`listed_non_major_in_market` |
| **OM-2** | kospi | false | **false** | false | **과세** — taxCategory=`listed_off_market_non_major`, §104①11 가목 일반 20% (중소 10%), 산출세액 > 0 |
| **OM-3** | kosdaq | true | true | false | 과세 (대주주 — `listed_major`) — 회귀 |
| **OM-4** | kosdaq | true | false | false | 과세 (대주주 + 장외 — `listed_major` 그대로) — 회귀, isOnMarket 무관 |
| **OM-5** | konex | false | true | false | 비과세 (코넥스 비대주주 장내, KoreanLaw Phase A 검증 필요) — 회귀 |
| **OM-6** | konex | false | false | false | 과세 (코넥스 비대주주 장외, `listed_off_market_non_major`) — **신규** |
| **OM-7** | unlisted | false | (무시) | true | K-OTC + 비대주주 — 기존 `listed_otc_non_major` 분기 보존. isOnMarketTransaction 무시. 회귀 |
| **OM-8** | unlisted + 중소·중견 | false | (무시) | true | K-OTC 중소·중견 소액주주 — 기존 `kotc_sme_mid` 비과세 보존. 회귀 |
| **OM-9** | unlisted | false | (무시) | false | 비상장 비대주주 — isOnMarketTransaction 영향 없음. 회귀 |
| **OM-10** | other_asset | true | (무시) | false | 기타자산 — 영향 없음. 회귀 |
| **OM-11** | kospi | true | true | false | 대주주 장내 — `listed_major` 과세. isOnMarket 무관 (가목 1) 단서① 적용). 회귀 |
| **OM-12** | kospi (cross) | false | false | false | 부동산과다 + §94①4 라 → §94② 우선 `other_asset_heavy_re`. isOnMarket 영향 없음 |

> **모순 조합 차단**: marketType=kospi/kosdaq/konex + isKOTCTrading=true 조합은 정의상 불가(K-OTC는 비상장 협회중개시장). 본 PR은 enum 분리만 진행하고 cross-field validation은 후속 PR로 분리.

**Pre-Do anchor 1건 우선 작성**: OM-2 (장외 비대주주 산출세액 정확값) — 사례 데이터 입력 + 양도연도 세율표 직접 계산.

## 7. 작업 단계 (PDCA Do)

1. **타입·스토어·마이그레이션 (시퀀셜)** — types/store/migration 한 묶음. anchor 0 (회귀 정상).
2. **엔진 — judgeExemption + classifySection94 분기 추가** — OM-2/OM-5/OM-7 3건 anchor 우선.
3. **엔진 — 전체 계산 후 zero-out 패턴** — `applyExemptZeroing` 헬퍼 분리 (800줄 정책). OM-1 echo anchor + 기존 비과세 회귀 anchor 갱신.
4. **API/Zod/Route ⑫⑬⑭** — 단건 + buildEngineInput 두 곳 매핑.
5. **UI — ToggleCard** (Step 1) + 결과 카드 분기 개편 + 신고서 표 23행 라벨.
6. **anchor 10건 + 회귀 273개 통과** — `__tests__/tax-engine/stock-transfer/on-market-venue.test.ts` 신규.
7. **브라우저 수동 확인** — OM-1/OM-2/OM-7 3 케이스 골든 패스.
8. **PostListingDetailCard 노출 조건 점검** — 비과세 분기에도 환산 산식 표시(현재 PR 보존).

## 8. 리스크 & 결정 보류

- **R-1 silent 비과세 차단의 회귀 위험**: default `true`로 기존 동작 보존. sessionStorage 마이그레이션에서 `undefined → true` 강제 → 로컬 이력 호환.
- **R-2 신고서 양식 라벨**: 장외 과세 분기에서 `listed_otc_non_major` 라벨을 그대로 쓰면 사용자가 "K-OTC 거래"로 오해 가능. UI에서 `isKOTCTrading` 분기로 라벨 분기 필요.
- **R-3 결과 카드 산식 표시**: 비과세인데 산출세액 줄을 표시하면 "내야 할 세금이 있다"로 오해 위험. **emerald 톤 + "정보용 (실제 납부 0)" 명시** 의무.
- **R-4 PDF·이력 저장**: `result.calculatedTax > 0 && result.finalTax = 0` 조합이 처음 등장 — `lib/pdf/HistoryPdfDocument.tsx`도 분기 라벨 추가.
- **R-5 §94②와의 상호작용**: 부동산과다 등 §94①4 동시 충족 시 §94② 우선 — 신규 분기와 충돌 없음(기존 분류 그대로).
- **보류**: 신규 enum `listed_off_market_non_major` vs 재사용 — 현 권장안은 재사용. 사용자 추가 결정 시 enum 분리로 전환 가능.

## 9. Definition of Done

- [ ] **Pre-Do**: KoreanLaw MCP로 §94①3 가목 본문·단서, §157④, §103②2호 원문 검증 (Phase A)
- [ ] **Pre-Do**: OM-2 산출세액 anchor 우선 작성·실행 (양도연도 §55·§104①11 가목 누진공제 직접 계산)
- [ ] taxCategory enum `listed_off_market_non_major` 추가 + `isListedNonMajorTaxable()` 헬퍼 (substring 매칭 금지 정책)
- [ ] 14 동기화 지점 ⑫⑬⑭ 포함 전부 수정 (Zod `.optional().default(true)`)
- [ ] anchor 12건(OM-1~12) 전체 통과 + Pre-Do OM-2 우선
- [ ] 기존 stock-transfer 273 회귀 통과
- [ ] `npx tsc --noEmit` 0 errors
- [ ] 결과 카드 비과세 분기에서 산출세액·과세표준·양도차익 모두 표시 + emerald 안내문 + 최종 0 강조
- [ ] 신고서 양식 표 23행 적용세율(예: "20% — 비과세로 미적용"), 32행 비과세 사유 라벨 추가
- [ ] sessionStorage 마이그레이션 `undefined → true` 명시 (회귀 0 확인)
- [ ] PR `9e43c29` `computeInformationalAcquisition` 유지 (조기 종료 edge case 대비)
- [ ] 브라우저 수동 확인 (OM-1/OM-2/OM-6/OM-8 골든 패스)
- [ ] memory 업데이트 — `project_stock_transfer_on_market_venue.md` + feedback 신규 정책 (장내·장외 명시 입력 + silent 비과세 차단)

## 10. 후속 PR 후보

- 장외 거래 세부 유형(블록딜·시간외·대량매매·개인간) 라디오 — UX 명확화
- 신고서 양식 OCR 라벨 정밀화 — "장외" 도장 자동 표시
- K-OTC 비과세 분기와의 cross-cutting anchor (OM-7·OM-8 확장)

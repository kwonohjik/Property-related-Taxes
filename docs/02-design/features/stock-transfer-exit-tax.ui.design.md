# 국외전출세·해외주식 양도소득세 — UI 설계

> 작성일: 2026-05-19
> 법령 기준: 소득세법 2026.4.21. 시행 / 시행령 2026.4.23. 시행
> 코드 구현: 0 (설계 문서 전용)
> 엔진 디자인 참조: `docs/02-design/features/stock-transfer-exit-tax.engine.design.md`
> 계획서 참조: `docs/00-pm/stock-transfer-exit-tax-foreign-stock.plan.md`

---

## 1. 사용자 시나리오

### 1.1 페르소나 A — 해외주식 양도자 (PR-4A)

- 미국 주식(애플, 테슬라 등)을 매도한 거주자
- 거주 기간 5년 이상 (§118의2 납세의무 충족 확인 필요)
- 달러 기준 매매가·취득가 보유, 기준환율 수동 입력
- 미국 자본이득세(CGT)를 납부한 경우 §118의6 공제 또는 필요경비 산입 선택

**사용 흐름**: 종목 추가 → 해외주식 선택 → 거주기간 입력 → 통화/환율/단가 입력 → 외국납부세액 유무 → 계산 → 결과 카드에서 환율 산식 확인

### 1.2 페르소나 B — 국외전출자 (PR-4B)

- 5년 이상 거주 대주주가 해외 이민·장기체류 결정
- 출국일 기준으로 보유 주식 간주양도 처리
- 납부유예 신청 여부, 실제 양도 후 경정청구 계획

**사용 흐름**: 국외전출세 탭 진입 → 거주기간·출국일·대주주 확인 → 보유 종목 다건 입력 → 출국일 시가 입력 → 납부방법 선택(즉시/유예) → 결과 카드 + 신고 안내

---

## 2. 마법사 단계 매핑

### 2.1 PR-4A 해외주식 — 기존 마법사 통합

기존 4단계 마법사에 **"해외주식" 시장 옵션 추가**.

**Step 1 — 종목 목록**: `marketType` RadioCardGroup에 "해외주식 (§94①3 다목)" 추가
- 선택 시 종목 카드 내부에 `ForeignStockBlock` 렌더링 (거주기간·국가·통화·환율·단가)
- 거주기간 5년 미만 입력 시 즉시 rose 경고 카드: "5년 이상 거주자만 납세의무가 있습니다 (§118의2)"

**Step 2 — 평가**: 해외주식은 `acquisitionMode` 라디오 ("실가" / "시가 산정(§178의3)")
- `acquisitionMode="market_price"` 선택 시 amber FieldCard: "§178의3②2호 — 양도일·취득일 이전 1개월 평균가격 입력"
- `acquisitionMode="actual"` 시 통화·환율·단가 입력

**Step 3 — 신고·공제**: 외국납부세액 ToggleCard + 공제방법 RadioCardGroup

**Step 4 — 결과**: `ForeignStockResultCard` — 환율 산식 + 외국납부세액공제 분리 표시

### 2.2 PR-4B 국외전출세 — 별도 탭 (권고)

국외전출세는 기존 마법사와 흐름이 근본적으로 달라 **별도 탭** 또는 **상단 모드 선택 카드** 권고.

**제안 UI 흐름 (별도 탭)**:
```
[주식 양도 탭] | [국외전출세 탭]
  ↓
탭 선택: 국외전출세
  Step 1: 요건 확인 — 거주기간, 출국일, 대주주 판정
  Step 2: 보유 종목 입력 — ExitTaxHoldingsMatrix (다건)
  Step 3: 출국일 시가 + 납부방법 선택
  Step 4: 결과 + 신고 안내 (보유현황 신고 기한 강조)
```

---

## 3. 14개 동기화 지점 사전 명세

### ① 폼 상태 타입 (StockTransferFormData 확장 또는 별도 store)

**PR-4A 추가 필드** (`StockAssetForm` 자산-수준에 추가):

```typescript
// --- 해외주식 전용 필드 ---
yearsResidentInKorea: string;          // DecimalInput (만 년 — "7")
isListedForeignCorp: boolean;          // true: §157의3①1호 외국법인
countryCode: string;                   // "US" | "JP" | "GB" | "HK" | "CN" | "OTHER"
transferCurrencyCode: string;          // "USD" | "JPY" | "EUR" | "HKD" | "CNY" | "GBP" | "OTHER"
perShareTransferPriceForeign: string;  // DecimalInput (외화 소수점 가능)
transferExchangeRate: string;          // ExchangeRateInput (소수점 2자리: "1350.50")
acquisitionCurrencyCode: string;
perShareAcquisitionPriceForeign: string;
acquisitionExchangeRate: string;
acquisitionModeFS: "actual" | "market_price"; // 해외주식 전용 취득모드 (기존 acquisitionMode와 충돌 방지)
capitalExpenditureForeign: string;     // CurrencyInput (외화 원단위·소수점 가능 — DecimalInput 사용)
transferCostForeign: string;
hasForeignTax: boolean;
foreignTaxPaidForeign: string;
foreignTaxCurrencyCode: string;
foreignTaxExchangeRate: string;
foreignTaxMethod: "credit" | "expense";
```

**PR-4B 폼 상태** (`ExitTaxFormData` — 별도 폼 또는 StockTransferFormData.exitTax 서브객체):

```typescript
interface ExitTaxFormData {
  // 요건
  yearsResidentLast10: string;         // "8"
  departureDate: string;               // "YYYY-MM-DD"
  isMajorShareholder: boolean;
  // 보유 종목 (다건 매트릭스)
  holdings: ExitTaxHoldingForm[];
  // 납부유예
  deferralRequested: boolean;
  deferralReason: "none" | "study_abroad" | "other_10yr";
  // 경정청구용 (납부유예 후 실양도)
  actualTransferDate: string;
  actualTransferPricePerShare: string;
  // 외국납부세액
  foreignTaxPaid: string;
  foreignTaxExclusionReason: "none" | "credit_allowed" | "step_up";
  domesticSourceTaxWithheld: string;
  // 신고
  hasFiledHoldingsReport: boolean;
}

interface ExitTaxHoldingForm {
  id: string;
  stockName: string;
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted";
  shareCount: string;
  acquisitionDate: string;             // "YYYY-MM-DD"
  perShareAcquisitionPrice: string;
  departureDayValuationMode: "market_price" | "prior_year_std" | "unlisted_sample" | "unlisted_std";
  departureDayMarketPrice: string;
  priorYearEndMonthAvg: string;
  unlistedSamplePrice: string;
  unlistedStdPricePerShare: string;
}
```

### ② initial 기본값

```typescript
// StockAssetForm 추가 initial 값
yearsResidentInKorea: "",
isListedForeignCorp: true,
countryCode: "US",
transferCurrencyCode: "USD",
perShareTransferPriceForeign: "",
transferExchangeRate: "",
acquisitionCurrencyCode: "USD",
perShareAcquisitionPriceForeign: "",
acquisitionExchangeRate: "",
acquisitionModeFS: "actual",
capitalExpenditureForeign: "",
transferCostForeign: "",
hasForeignTax: false,
foreignTaxPaidForeign: "",
foreignTaxCurrencyCode: "USD",
foreignTaxExchangeRate: "",
foreignTaxMethod: "credit",

// ExitTaxFormData initial
const INITIAL_EXIT_TAX_FORM: ExitTaxFormData = {
  yearsResidentLast10: "",
  departureDate: "",
  isMajorShareholder: false,
  holdings: [],
  deferralRequested: false,
  deferralReason: "none",
  actualTransferDate: "",
  actualTransferPricePerShare: "",
  foreignTaxPaid: "",
  foreignTaxExclusionReason: "none",
  domesticSourceTaxWithheld: "",
  hasFiledHoldingsReport: false,
};

// ExitTaxHoldingForm initial (신규 행 추가 시)
function createEmptyExitTaxHolding(): ExitTaxHoldingForm {
  return {
    id: nanoid(),
    stockName: "",
    marketType: "kospi",
    shareCount: "",
    acquisitionDate: "",
    perShareAcquisitionPrice: "",
    departureDayValuationMode: "market_price",
    departureDayMarketPrice: "",
    priorYearEndMonthAvg: "",
    unlistedSamplePrice: "",
    unlistedStdPricePerShare: "",
  };
}
```

**3중 패턴 강제** (`feedback_store_default_vs_ui_display_fallback`): factory default = normalize 빈문자 처리 = UI 명시값. `value={form.transferCurrencyCode || "USD"}` 패턴 금지 — factory default "USD" 유지.

### ③ normalize 변환 (`calc-wizard-stock-normalize.ts`)

```typescript
// 해외주식 분기 추가
if (asset.marketType === "foreign_stock") {
  return {
    ...asset,
    yearsResidentInKorea: asset.yearsResidentInKorea ?? "",
    isListedForeignCorp: asset.isListedForeignCorp ?? true,
    countryCode: asset.countryCode ?? "US",
    transferCurrencyCode: asset.transferCurrencyCode ?? "USD",
    acquisitionCurrencyCode: asset.acquisitionCurrencyCode ?? "USD",
    acquisitionModeFS: asset.acquisitionModeFS ?? "actual",
    foreignTaxMethod: asset.foreignTaxMethod ?? "credit",
    foreignTaxExclusionReason: asset.foreignTaxExclusionReason ?? "none",
    // ... 나머지 문자열 필드 ""로 normalize
  };
}
// ExitTaxFormData normalize
function normalizeExitTaxHolding(h: Partial<ExitTaxHoldingForm>): ExitTaxHoldingForm {
  return {
    id: h.id ?? nanoid(),
    stockName: h.stockName ?? "",
    marketType: h.marketType ?? "kospi",
    shareCount: h.shareCount ?? "",
    acquisitionDate: h.acquisitionDate ?? "",
    perShareAcquisitionPrice: h.perShareAcquisitionPrice ?? "",
    departureDayValuationMode: h.departureDayValuationMode ?? "market_price",
    departureDayMarketPrice: h.departureDayMarketPrice ?? "",
    priorYearEndMonthAvg: h.priorYearEndMonthAvg ?? "",
    unlistedSamplePrice: h.unlistedSamplePrice ?? "",
    unlistedStdPricePerShare: h.unlistedStdPricePerShare ?? "",
  };
}
```

### ④ API 변환 (`lib/calc/stock-transfer-tax-api.ts`)

```typescript
// PR-4A: 해외주식 변환 (buildForeignStockEngineInput)
export function buildForeignStockEngineInput(
  asset: StockAssetForm,
  form: StockTransferFormData,
): ForeignStockInput {
  return {
    yearsResidentInKorea: parseDecimal(asset.yearsResidentInKorea),
    isListedForeignCorp: asset.isListedForeignCorp,
    stockName: asset.securityName,
    countryCode: asset.countryCode,
    shareCount: parseDecimal(asset.shareCount),
    transferDate: new Date(form.transferDate),    // ⑭ route 측에서 toDate() 재변환
    transferPriceMode: asset.transferPriceMode,
    perShareTransferPriceForeign: asset.transferPriceMode === "per_share"
      ? parseDecimal(asset.perShareTransferPriceForeign) : undefined,
    transferCurrencyCode: asset.transferCurrencyCode,
    transferExchangeRate: parseDecimal(asset.transferExchangeRate),
    acquisitionDate: new Date(asset.acquisitionDate),
    acquisitionMode: asset.acquisitionModeFS,
    perShareAcquisitionPriceForeign: asset.acquisitionModeFS === "actual"
      ? parseDecimal(asset.perShareAcquisitionPriceForeign) : undefined,
    acquisitionCurrencyCode: asset.acquisitionCurrencyCode,
    acquisitionExchangeRate: parseDecimal(asset.acquisitionExchangeRate),
    capitalExpenditureForeign: parseDecimal(asset.capitalExpenditureForeign),
    transferCostForeign: parseDecimal(asset.transferCostForeign),
    hasForeignTax: asset.hasForeignTax,
    foreignTaxPaidForeign: asset.hasForeignTax
      ? parseDecimal(asset.foreignTaxPaidForeign) : undefined,
    foreignTaxCurrencyCode: asset.hasForeignTax ? asset.foreignTaxCurrencyCode : undefined,
    foreignTaxExchangeRate: asset.hasForeignTax
      ? parseDecimal(asset.foreignTaxExchangeRate) : undefined,
    foreignTaxMethod: asset.foreignTaxMethod,
    isElectronicFiling: form.isElectronicFiling,
  };
}

// PR-4B: 국외전출세 변환 (buildExitTaxEngineInput)
export function buildExitTaxEngineInput(
  form: ExitTaxFormData,
): ExitTaxInput {
  return {
    yearsResidentLast10: parseDecimal(form.yearsResidentLast10),
    departureDate: new Date(form.departureDate),  // ⑭ route toDate()
    isMajorShareholder: form.isMajorShareholder,
    holdings: form.holdings.map(h => ({
      id: h.id,
      stockName: h.stockName,
      marketType: h.marketType,
      shareCount: parseDecimal(h.shareCount),
      acquisitionDate: new Date(h.acquisitionDate), // ⑭ route 배열 map toDate()
      perShareAcquisitionPrice: parseDecimal(h.perShareAcquisitionPrice),
      departureDayValuationMode: h.departureDayValuationMode,
      departureDayMarketPrice: h.departureDayValuationMode === "market_price"
        ? parseDecimal(h.departureDayMarketPrice) : undefined,
      priorYearEndMonthAvg: h.departureDayValuationMode === "prior_year_std"
        ? parseDecimal(h.priorYearEndMonthAvg) : undefined,
      unlistedSamplePrice: h.departureDayValuationMode === "unlisted_sample"
        ? parseDecimal(h.unlistedSamplePrice) : undefined,
      unlistedStdPricePerShare: h.departureDayValuationMode === "unlisted_std"
        ? parseDecimal(h.unlistedStdPricePerShare) : undefined,
    })),
    deferralRequested: form.deferralRequested,
    deferralReason: form.deferralReason,
    actualTransferDate: form.actualTransferDate ? new Date(form.actualTransferDate) : undefined,
    actualTransferPricePerShare: form.actualTransferPricePerShare
      ? parseDecimal(form.actualTransferPricePerShare) : undefined,
    foreignTaxPaid: form.foreignTaxPaid ? parseDecimal(form.foreignTaxPaid) : undefined,
    foreignTaxExclusionReason: form.foreignTaxExclusionReason,
    domesticSourceTaxWithheld: form.domesticSourceTaxWithheld
      ? parseDecimal(form.domesticSourceTaxWithheld) : undefined,
    hasFiledHoldingsReport: form.hasFiledHoldingsReport,
  };
}
```

### ⑤ UI 위젯 — 신규 컴포넌트

#### ForeignStockBlock.tsx (`components/calc/stock-transfer/ForeignStockBlock.tsx`)

tone: sky (신고·공제 섹션과 구분. 거주기간·국가 = 자격 확인 성격 → violet 도 가능)

```
[섹션 1: 납세의무 확인] (violet tone)
  ● 거주기간: DecimalInput ("국내 거주 만 년 수 — 소수 불필요") + FieldCard hint "양도일까지 5년 이상 국내 주소·거소 거주자만 납세의무 있습니다 (§118의2)"
  → 5년 미만 입력 시 rose 경고 배너: "납세의무 없음 — 5년 이상 거주자만 §94①3다목 과세 대상입니다"

[섹션 2: 자산 정보] (rose tone)
  ● 국가 선택: Select (미국/일본/영국/홍콩/중국/기타)
  ● 주식 구분: RadioCardGroup ("외국법인 발행 주식 (§157의3①1호)" / "후속 PR 이관" — DR 선택 시 안내 카드)

[섹션 3: 양도 정보] (emerald tone)
  ● 통화: Select (USD/JPY/EUR/HKD/CNY/GBP/기타)
  ● 양도단가: DecimalInput (외화, 소수점 2자리 이상 가능) + 단위 라벨 "[통화코드]"
  ● 양도일 환율: ExchangeRateInput (원/[통화] — 소수점 2자리. hint: "한국은행 홈페이지 고시 기준환율")
  ● (useMemo 미리보기) 원화 양도가액 = 주수 × 단가 × 환율

[섹션 4: 취득 정보] (amber tone)
  ● 취득모드 라디오: "실가" / "시가 산정 (§178의3)"
  ● 실가 선택 시: 취득통화 Select + 취득단가 DecimalInput + 취득환율 ExchangeRateInput
  ● 시가 산정 선택 시: amber FieldCard "§178의3②2호: 상증법§63 준용 — 양도일·취득일 이전 1개월 평균가액 입력" + DecimalInput
  ● (useMemo) 원화 취득가액 미리보기

[섹션 5: 필요경비] (amber tone)
  ● 자본적지출: DecimalInput (외화) + 환율 자동 연계 (취득환율 기준 — 실지출일 환율 입력 옵션 추가 검토)
  ● 양도비: DecimalInput (외화)

[섹션 6: 외국납부세액] (sky tone)
  ● 외국납부세액 유무: ToggleCard (hasForeignTax)
  ● 활성 시:
    - 세액 (외화): DecimalInput
    - 통화: Select
    - 납세일 환율: ExchangeRateInput
    - 공제방법: RadioCardGroup ("세액공제 (§118의6①)" / "필요경비 산입 (§118의6②)")
```

#### ExitTaxBlock.tsx (`components/calc/stock-transfer/ExitTaxBlock.tsx`)

tone: violet (자격 확인) + amber (보유 종목) + sky (납부방법)

```
[섹션 1: §118의9 요건 확인] (violet tone)
  ● 거주기간 (10년 중): DecimalInput ("출국일 전 10년 중 국내 거주 합계 년수")
    → 5년 미만: rose 경고 "국외전출세 납세의무 없습니다 (§118의9①1호)"
  ● 출국일: DateInput
  ● 대주주 여부: ToggleCard — 직전 연도말 기준 (§178의8 → §167의8 준용)
    - 비상장: 지분 4% 이상 또는 시총 10억 이상 (벤처 40억)
    - 상장: 시총 50억 이상 또는 지분율 해당
    → 비대주주: rose 경고 "국외전출세 납세의무 없습니다 (§118의9①2호)"

[섹션 2: 보유 종목 (다건)] (amber tone)
  ● ExitTaxHoldingsMatrix — 행 추가/삭제 (AcquisitionLotsMatrix 패턴)
    컬럼: 종목명 / 시장 Select / 주수 / 취득일 DateInput / 취득단가(원) CurrencyInput
          / 출국일 시가 산정 모드 Select / 시가 입력 (모드별)
  ● 출국일 시가 모드별 입력:
    - "출국일 거래가액 (§178의9①)": CurrencyInput (주당)
    - "§99①3 기준시가 (상장)": CurrencyInput
    - "매매사례가액 (비상장, 전후 각 3개월)": CurrencyInput
    - "§99①4 기준시가 (비상장 매매사례 없음)": CurrencyInput

[섹션 3: 납부방법] (sky tone)
  ● 납부방법 라디오: "즉시 납부" / "납부유예 신청 (§118의16)"
  ● 납부유예 선택 시:
    - 유예사유 Select: "일반 (5년)" / "국외유학·파견 등 (10년)"
    - sky FieldCard: "납세담보 제공 또는 납세관리인 지정 필요. 5년 내 미양도 시 5년째 말일+3개월 이내 납부."
    - amber FieldCard: "납부유예 기간 이자상당액은 실제 납부 시 별도 계산 필요."

[섹션 4: 경정청구 (납부유예 후 실양도)] (emerald tone — 납부유예 선택 시만 표시)
  ● 실양도일: DateInput
  ● 실양도 단가 (원/주): CurrencyInput
  ● 외국납부세액 (원화): CurrencyInput
  ● 외국납부세액공제 배제 사유: RadioCardGroup
    - "배제 사유 없음 (공제 적용)"
    - "외국정부가 출국세 산출세액에 대해 세액공제 허용 (§118의13②1호)"
    - "외국정부가 취득가액을 출국일 시가로 조정 (§118의13②2호)"
  ● §118의14 비거주자 원천징수 세액: CurrencyInput (해당 시)

[섹션 5: 보유현황 신고] (sky tone)
  ● 보유현황 신고 완료 여부: ToggleCard (hasFiledHoldingsReport)
  ● 미신고 시: amber 경고 "보유현황을 출국일 전날까지 신고하지 않으면 액면금액의 2% 가산세가 부과됩니다 (§118의15)"
    + CurrencyInput (주당 액면금액 입력)
```

#### ExchangeRateInput.tsx (`components/calc/stock-transfer/ExchangeRateInput.tsx`)

```typescript
// DecimalInput 래퍼 — 소수점 2자리, 전체 선택 onFocus (SelectOnFocusProvider 자동 적용)
// 단위 suffix 표시: "원 / USD" (통화코드 prop)
// hint: "한국은행 홈페이지 www.bok.or.kr > 기준환율 조회"
interface ExchangeRateInputProps {
  value: string;
  onChange: (v: string) => void;
  currencyCode: string;   // "USD" | "JPY" | ...
  label?: string;
}
```

### ⑥ 사이드바 합계

```typescript
// PR-4A: ForeignStockSummary (computeStockTransferSummary 내 분기 추가)
if (asset.marketType === "foreign_stock" && asset.transferExchangeRate && asset.perShareTransferPriceForeign) {
  const transferKrw = parseDecimal(asset.shareCount) *
    parseDecimal(asset.perShareTransferPriceForeign) *
    parseDecimal(asset.transferExchangeRate);
  // → 사이드바에 "해외주식 양도가액 (환산)" 항목으로 표시
}

// PR-4B: ExitTaxSidebar (별도 사이드바 컴포넌트 또는 메타 표시)
// - deferredTaxAmount: 납부유예 선택 시 "유예 세액" 표시
// - 즉시납부 선택 시 "산출세액 + 지방소득세" 표시
// - API 결과 도착 전: 보유 종목별 간주양도가액 합계만 표시 (입력값으로 계산 가능)
```

### ⑦ 결과 카드 (`StockTransferTaxResultView.tsx` 내 분기 추가)

#### PR-4A ForeignStockResultCard

```
[해외주식 양도소득세 계산 결과] (§94①3다목)

양도가액: [주수]주 × [외화단가] [통화] × [환율] = [transferPriceKrw]
취득가액: [주수]주 × [취득단가] [통화] × [취득환율] = [acquisitionPriceKrw]
필요경비:
  자본적지출 [외화] × [환율] = [capitalExpenditureKrw]
  양도비 [외화] × [환율] = [transferCostKrw]
  (외국납부세액 필요경비 산입 선택 시) 외국납부세액 [외화] × [납세환율] = [foreignTaxExpenseKrw]
양도차익: [transferPriceKrw] − [acquisitionPriceKrw] − [necessaryExpensesKrw] = [transferGain]
기본공제: 2,500,000 (§118의7) ← 장기보유특별공제 미적용 (§118의8)
과세표준: [taxBase]

산출세액: [taxBase] × §55①세율 (6~45% 8구간) = [incomeTax] <!-- 세율 환각 정정 2026-05-19 R3 -->

(외국납부세액 공제 선택 시)
외국납부세액공제:
  납부세액 [외화] × [납세환율] = [foreignTaxPaidKrw]
  공제한도: [incomeTax] (단일 국외자산)
  적용 공제: min([foreignTaxPaidKrw], [foreignTaxCreditLimit]) = [foreignTaxCreditApplied]

지방소득세: floor10(([incomeTax] − [foreignTaxCreditApplied]) × 10%) = [localIncomeTax]
최종 납부세액: [finalTax] + [finalLocalTax]
```

**표기 규칙**:
- 숫자 끝 "원" 단위 표기 금지 (`feedback_no_won_suffix`)
- 변수 약어 금지, 한국어 풀어쓰기
- `floor10()` 묵시 처리 — 결과 카드에 표기 불필요

#### PR-4B ExitTaxResultCard

```
[국외전출세 계산 결과] (§118의9~§118의16)

[종목별]
  [종목명] ([시장]): [주수]주 × [출국일 시가/주] = [departureDayValue]
  취득가액: [주수]주 × [취득단가/주] = [acquisitionCost]
  양도차익: [departureDayValue] − [acquisitionCost] = [holdingGain]

합산 양도차익: [totalTransferGain]
기본공제: 2,500,000 (§118의10④)
과세표준: [taxBase]
산출세액: §118의11 → §104①11가목2) 적용 (20%/25%) = [incomeTax] <!-- 세율 환각 정정 2026-05-19 R3 -->
지방소득세: [localIncomeTax]

(납부유예 선택 시)
납부유예: [deferralYears]년 (§118의16)
유예 세액: [deferredTaxAmount]
납부유예 이자상당액: 실제 납부 시 별도 계산 필요 (시행령 §178의11)

(경정청구 결과 — 실양도 입력 시)
조정공제 (§118의12):
  출국일 양도가 − 실양도가 = [realTransferLoss]
  [incomeTax] × [realTransferLoss] / [totalGain] = [adjustmentDeduction]
외국납부세액공제 (§118의13): [foreignTaxCreditApplied]
비거주자 세액공제 (§118의14): [domesticTaxCreditApplied]
경정 후 최종 세액: [finalTaxAfterAdjustment]

(보유현황 미신고 시)
보유현황 미신고 가산세 (§118의15): 액면금액 합계 × 2% = [holdingsReportPenalty]
```

### ⑧ validation (`lib/calc/stock-transfer-tax-validate.ts` → 분리 후 `validate-foreign.ts`)

```typescript
// PR-4A 검증 규칙
function validateForeignStock(asset: StockAssetForm): ValidationError[] {
  const errors: ValidationError[] = [];

  // 거주기간 — 자동 안분 fallback 금지, 미입력 차단
  if (!asset.yearsResidentInKorea) errors.push("거주기간을 입력하세요 (만 년 수)");
  const years = parseDecimal(asset.yearsResidentInKorea);
  if (years < 5) errors.push("5년 이상 거주자만 §94①3다목 납세의무가 있습니다 (§118의2)");

  // 환율 — 미입력 차단 (자동 조회 없음)
  if (!asset.transferExchangeRate || parseDecimal(asset.transferExchangeRate) <= 0)
    errors.push("양도일 기준환율을 입력하세요 (원/[통화])");
  if (!asset.acquisitionExchangeRate || parseDecimal(asset.acquisitionExchangeRate) <= 0)
    errors.push("취득일 기준환율을 입력하세요 (원/[통화])");

  // 취득모드별 검증
  if (asset.acquisitionModeFS === "actual" && !asset.perShareAcquisitionPriceForeign)
    errors.push("취득단가(외화)를 입력하세요");

  // 외국납부세액 — hasForeignTax=true 시 필수
  if (asset.hasForeignTax) {
    if (!asset.foreignTaxPaidForeign) errors.push("외국납부세액을 입력하세요");
    if (!asset.foreignTaxExchangeRate || parseDecimal(asset.foreignTaxExchangeRate) <= 0)
      errors.push("납세일 환율을 입력하세요");
  }

  return errors;
}

// PR-4B 검증 규칙
function validateExitTax(form: ExitTaxFormData): ValidationError[] {
  const errors: ValidationError[] = [];
  const years = parseDecimal(form.yearsResidentLast10);

  if (!form.yearsResidentLast10) errors.push("거주기간을 입력하세요");
  if (years < 5) errors.push("5년 이상 거주자만 국외전출세 납세의무가 있습니다 (§118의9①1호)");
  if (!form.isMajorShareholder) errors.push("직전 연도말 기준 대주주만 납세의무가 있습니다 (§118의9①2호)");
  if (!form.departureDate) errors.push("출국일을 입력하세요");
  if (form.holdings.length === 0) errors.push("보유 종목을 최소 1건 입력하세요");

  form.holdings.forEach((h, i) => {
    if (!h.stockName) errors.push(`종목 ${i + 1}: 종목명 필수`);
    if (!h.shareCount || parseDecimal(h.shareCount) <= 0) errors.push(`종목 ${i + 1}: 주수 필수`);
    if (!h.acquisitionDate) errors.push(`종목 ${i + 1}: 취득일 필수`);
    if (!h.perShareAcquisitionPrice) errors.push(`종목 ${i + 1}: 취득단가 필수`);
    // 출국일 시가 모드별 필수 입력 검증
    const modeRequired: Record<ExitTaxHoldingForm["departureDayValuationMode"], keyof ExitTaxHoldingForm> = {
      market_price: "departureDayMarketPrice",
      prior_year_std: "priorYearEndMonthAvg",
      unlisted_sample: "unlistedSamplePrice",
      unlisted_std: "unlistedStdPricePerShare",
    };
    const reqField = modeRequired[h.departureDayValuationMode];
    if (!h[reqField]) errors.push(`종목 ${i + 1}: 출국일 시가(${h.departureDayValuationMode}) 입력 필수`);
  });

  if (form.deferralRequested && form.actualTransferDate) {
    // 경정청구 입력 시 실양도 단가 필수
    if (!form.actualTransferPricePerShare) errors.push("실양도 단가를 입력하세요 (경정청구용)");
  }

  return errors;
}
```

**⑧ 3중 패턴 강제**: API 변환의 `acquisitionModeFS ?? "actual"` fallback = validate의 `asset.acquisitionModeFS === "actual"` 조건 = factory default `"actual"` 일치.

### ⑨ Zod enum 메인

```typescript
// app/api/calc/stock-transfer/route.ts discriminatedUnion 추가
// PR-4A
z.object({ taxCategory: z.literal("foreign_stock"), ...ForeignStockInputSchema })
// PR-4B
z.object({ taxCategory: z.literal("exit_tax"), ...ExitTaxInputSchema })
```

### ⑩ Zod enum 컴패니언 + refine

```typescript
// addStockRefines 함수에 추가
.superRefine((d, ctx) => {
  if (d.taxCategory === "foreign_stock") {
    if (d.transferExchangeRate <= 0) ctx.addIssue({ ... });
    if (d.acquisitionExchangeRate <= 0) ctx.addIssue({ ... });
    if (d.hasForeignTax && !d.foreignTaxPaidForeign) ctx.addIssue({ ... });
  }
  if (d.taxCategory === "exit_tax") {
    if (d.holdings.length === 0) ctx.addIssue({ ... });
    if (d.yearsResidentLast10 < 5) ctx.addIssue({ ... });
  }
})
```

### ⑪ 자산-수준 acquisitionDate fallback

```typescript
// route.ts 내 acquisitionDate fallback 로직
// PR-4A: ForeignStockInput.acquisitionDate 필수 — fallback 없음, 미입력 시 Zod 차단
// PR-4B: ExitTaxHolding[].acquisitionDate 배열 map 별도 처리
//   holdings = parsed.holdings.map(h => ({
//     ...h,
//     acquisitionDate: toDate(h.acquisitionDate, `holdings[${i}].acquisitionDate`),
//   }))
```

**배열 내 Date 처리 주의**: `coerceDates(parsed, ["departureDate", "actualTransferDate"])` 평면 처리로는 `holdings[]` 내부 `acquisitionDate` 미변환 → 별도 배열 map 필수 <!-- 검토 정정 2026-05-19: R2-04 계승 -->

### ⑫ Zod 입력 객체 정의

엔진 디자인 §6 참조. 필드 목록 요약:

- `ForeignStockInputSchema`: 20개 필드, `superRefine` 2개 조건
- `ExitTaxHoldingSchema`: 11개 필드
- `ExitTaxInputSchema`: 12개 최상위 필드 + `holdings` 배열

**TS 미감지 위험**: Zod schema에 신규 필드 누락 시 침묵 stripping — 필드 추가 시 schema grep 필수.

### ⑬ `callStockTransferTaxAPI` body spread

```typescript
// lib/calc/stock-transfer-tax-api.ts
async function callStockTransferTaxAPI(input: ForeignStockInput | ExitTaxInput | ...) {
  const body = {
    taxCategory: input.taxCategory,
    // PR-4A spread
    ...(input.taxCategory === "foreign_stock" ? {
      yearsResidentInKorea: input.yearsResidentInKorea,
      transferExchangeRate: input.transferExchangeRate,
      acquisitionExchangeRate: input.acquisitionExchangeRate,
      foreignTaxPaidForeign: input.foreignTaxPaidForeign,
      foreignTaxExchangeRate: input.foreignTaxExchangeRate,
      foreignTaxMethod: input.foreignTaxMethod,
      // ... 모든 ForeignStockInput 필드
    } : {}),
    // PR-4B spread
    ...(input.taxCategory === "exit_tax" ? {
      yearsResidentLast10: input.yearsResidentLast10,
      departureDate: input.departureDate,
      holdings: input.holdings,       // 배열 포함
      deferralRequested: input.deferralRequested,
      foreignTaxExclusionReason: input.foreignTaxExclusionReason,
      // ... 모든 ExitTaxInput 필드
    } : {}),
  };
  return fetch("/api/calc/stock-transfer", { method: "POST", body: JSON.stringify(body) });
}
```

**⑬ 누락 위험**: PR-4A `foreignTaxExchangeRate`, PR-4B `foreignTaxExclusionReason` 같은 선택적 필드 body spread 누락 시 침묵 stripping — 체크리스트 필수.

### ⑭ Route handler 엔진 input 매핑 + Date 변환

```typescript
// app/api/calc/stock-transfer/route.ts
if (parsed.taxCategory === "foreign_stock") {
  const input: ForeignStockInput = {
    ...parsed,
    transferDate: toDate(parsed.transferDate, "transferDate"),
    acquisitionDate: toDate(parsed.acquisitionDate, "acquisitionDate"),
    actualTransferDate: parsed.actualTransferDate
      ? toOptionalDate(parsed.actualTransferDate) : undefined,
  };
  result = calculateForeignStock(input);
}

if (parsed.taxCategory === "exit_tax") {
  const input: ExitTaxInput = {
    ...parsed,
    departureDate: toDate(parsed.departureDate, "departureDate"),
    actualTransferDate: parsed.actualTransferDate
      ? toOptionalDate(parsed.actualTransferDate) : undefined,
    holdings: parsed.holdings.map((h, i) => ({  // 배열 내 Date 별도 map
      ...h,
      acquisitionDate: toDate(h.acquisitionDate, `holdings[${i}].acquisitionDate`),
    })),
  };
  result = calculateExitTax(input);
}
```

---

## 4. 신규 컴포넌트 목록

| 컴포넌트 | 경로 | 역할 | 800줄 정책 |
|---|---|---|---|
| `ForeignStockBlock.tsx` | `components/calc/stock-transfer/` | 해외주식 전용 6섹션 입력 | 예상 350~450줄. 초과 시 `ForeignStockExpenseSection`·`ForeignTaxSection` 분리 |
| `ExitTaxBlock.tsx` | 동상 | 국외전출세 전용 5섹션 입력 | 예상 400~500줄. 초과 시 `ExitTaxHoldingsSection`·`ExitTaxDeferralSection` 분리 |
| `ExchangeRateInput.tsx` | 동상 | 환율 입력 (소수점 2자리 + 통화 suffix) | ~50줄 |
| `ExitTaxHoldingsMatrix.tsx` | 동상 | 보유 종목 다건 입력 (AcquisitionLotsMatrix 패턴) | 예상 200~300줄 |
| `ForeignStockResultCard.tsx` | `components/calc/results/` | 해외주식 결과 산식 | ~200줄 |
| `ExitTaxResultCard.tsx` | 동상 | 국외전출세 결과 산식 + 경정청구 | ~250줄 |

---

## 5. 공통 UI 정책 준수

| 정책 | 적용 방법 |
|---|---|
| DateInput 필수 (`feedback_date_input`) | 출국일·취득일·실양도일 모두 `DateInput` 사용. `type="date"` 신규 작성 금지 |
| DecimalInput (`feedback_decimal_input`) | 거주기간·환율·외화 단가·외화 세액 → `DecimalInput` + `parseDecimal`. `CurrencyInput` 대신 |
| SelectOnFocus | `SelectOnFocusProvider` 전역 적용 중 — 별도 처리 불필요 |
| ToggleCard/RadioCardGroup | 외국납부세액 토글·취득모드·공제방법 라디오 모두 공용 컴포넌트 사용. OFF도 tone 배경 유지 |
| 결과 숫자 "원" 단위 생략 (`feedback_no_won_suffix`) | 모든 결과 카드 숫자 끝 "원" 표기 금지 |
| 결과 산식 한국어 (`feedback_result_view_korean_formula`) | "양도가액 = 1,000주 × 150 USD × 1,350" 형식. 변수 약어 금지 |
| 자동 안분 fallback 금지 (`feedback_no_silent_apportion_fallback`) | 환율·외화 단가 미입력 → validation 차단. placeholder "자동 입력" 금지 |
| useEffect 미러링 금지 (`feedback_useeffect_store_mirror_forbidden`) | 환율 × 단가 = 원화 환산은 useMemo로만. store.set() 호출 금지 |
| 중립 표현 (`feedback_tax_calculation_principle`) | "절세" "유리" "불리" 표현 금지. 결과는 법령 계산 결과만 표시 |

---

## 6. 3중 패턴 적용 필드 (`feedback_store_default_vs_ui_display_fallback`)

| 필드 | factory default | normalize | UI 사용 |
|---|---|---|---|
| `acquisitionModeFS` | `"actual"` | `?? "actual"` | `value={asset.acquisitionModeFS}` (fallback 제거) |
| `foreignTaxMethod` | `"credit"` | `?? "credit"` | `value={asset.foreignTaxMethod}` |
| `foreignTaxExclusionReason` | `"none"` | `?? "none"` | `value={form.foreignTaxExclusionReason}` |
| `deferralReason` | `"none"` | `?? "none"` | `value={form.deferralReason}` |
| `transferCurrencyCode` | `"USD"` | `?? "USD"` | `value={asset.transferCurrencyCode}` |
| `countryCode` | `"US"` | `?? "US"` | `value={asset.countryCode}` |
| `departureDayValuationMode` | `"market_price"` | `?? "market_price"` | `value={holding.departureDayValuationMode}` |

---

## 7. 자체 검토 항목

두 디자인 문서를 처음부터 재검토하여 발견한 누락·모순:

### 검토 정정 목록

| # | 발견 내용 | 정정 위치 | 심각도 |
|---|---|---|---|
| UI-01 | ForeignStockBlock의 "양도가액 총액 직접입력 모드 (transferPriceMode=total)" 관련 폼 필드 누락 — `totalTransferPriceForeign` 필드가 ①폼 상태 타입에는 있으나 ⑤UI 위젯 섹션 3에서 입력 위젯 미서술 | §3.①, §4 ForeignStockBlock 섹션 3 | IMPORTANT |
| UI-02 | ExitTaxHoldingsMatrix 신규 행 추가 시 auto 1행 추가 정책(기존 AcquisitionLotsMatrix 패턴) — 빈 배열 초기 렌더 시 1행 자동 추가 여부 명시 없음. → holdings 초기값 `[]`로 두고 "종목 추가" 버튼 클릭으로만 추가 (auto 추가 아님 — 국외전출 종목은 사용자가 명시 필요) | §3.②, ExitTaxHoldingsMatrix | IMPORTANT |
| UI-03 | §5 공통 UI 정책 LawArticleModal 배지 언급 없음 — §118의7·§118의9·§118의16 같은 핵심 조문에 FieldCard trailing 배지 추가 권고 | §5 | NON-CRITICAL |
| UI-04 | ExchangeRateInput 소수점 자리수 불일치 — 엔진 디자인 §5.2에서 "소수점 2자리 (원/달러: 1350.50)"로 명시, UI 디자인 §4 ExchangeRateInput에서도 "소수점 2자리"로 일치. 그러나 JPY 환율은 소수점이 필요없거나 4자리까지 필요할 수 있음 (예: 9.2543원/엔). → 소수점 최대 4자리로 상향. 계획서 "DecimalInput(소수 4자리)" 원문과 정합 | §4 ExchangeRateInput, §3.⑤ | IMPORTANT |
| UI-05 | PR-4B ExitTax 별도 탭 경우 store 분리 여부 미명시 — 기존 `calc-wizard-stock-store.ts`에 통합할지 별도 `calc-wizard-exit-tax-store.ts`로 분리할지. → 별도 store 권고 (국외전출세는 마법사 흐름 자체가 다름, partialize 제외 필드도 다름) | §3.① | IMPORTANT |
| UI-06 | ~~결과 카드 §118의11 세율 미확정 마커~~ → **세율 확정 완료(R3)**. amber 배너 불필요. 산식 라벨 §104①11가목2) 20%/25%로 확정 표기 <!-- 세율 환각 정정 2026-05-19 R3 --> | §3.⑦ ExitTaxResultCard | ~~IMPORTANT~~ → 완료 |
| UI-07 | ⑥ 사이드바: PR-4B 결과 도착 전 보유종목 간주양도가 합산 표시 — 계산 로직 상 입력만으로 가능한 항목 명시. → `sum(holding.departureDayMarketPrice × holding.shareCount)` useMemo 사이드바 노출 (API 결과 전) | §3.⑥ | NON-CRITICAL |
| UI-08 | `acquisitionModeFS` 필드명이 기존 `acquisitionMode` (국내주식용)와 혼동 가능 — store에서 동일 자산에 두 필드 공존 시 타입 오염. → `StockAssetForm` 조건부 타입 분기 또는 명확한 주석으로 용도 구분 명시 | §3.① | IMPORTANT |

**자체 검토 발견·정정 총계: IMPORTANT 6건, NON-CRITICAL 2건 = 총 8건**

### 라운드 3 — 세율 anchor 환각 정정 + cross-doc 정합 (2026-05-19) <!-- cross-check 정정 2026-05-19 -->

| # | 분류 | 발견 내용 | 정정 위치 |
|---|---|---|---|
| R3-01 | CRITICAL 정정 | ForeignStockResultCard 산식 라벨 "§55①세율 (6~45% 8구간)" 확정 표기 | §3.⑦ |
| R3-02 | CRITICAL 정정 | ExitTaxResultCard 산식 라벨 "§118의11→§104①11가목2) 20%/25%" 확정 표기 | §3.⑦ |
| R3-03 | IMPORTANT 완료 | UD-05 "세율 미확정 amber 배너" → 세율 확정으로 불필요. 해당 항목 완료 처리 | §7 UD-05 |
| R3-04 | cross-check | 엔진 디자인 §9.1 FS-anchor-01 산출세액(20,865,500) ↔ UI 결과 카드 산식 일치 확인 ✅ | cross-doc |
| R3-05 | cross-check | 엔진 디자인 §9.2 ET-anchor-01 산출세액(734,375,000) ↔ UI 결과 카드 산식 일치 확인 ✅ | cross-doc |
| R3-06 | cross-check | 계획서 §7.3 결과 카드 예시 ↔ UI 디자인 §3.⑦ ForeignStockResultCard 산식 구조 일치 ✅ | cross-doc |
| R3-07 | cross-check | 신규 파일 경로 3문서 일치 확인: `foreign-stock.ts`·`exit-tax.ts`·`ForeignStockBlock.tsx`·`ExitTaxBlock.tsx`·`ExchangeRateInput.tsx` ✅ | cross-doc |
| R3-08 | cross-check | §178의5 환율 규정 인용 3문서 동일 문구("수령·지출일 현재 외국환거래법 기준환율 또는 재정환율") ✅ | cross-doc |
| R3-09 | cross-check | 케이스 매트릭스 23행(FS-01~10 + ET-01~13) — plan §3 ↔ engine §3 행 수 일치. FS-02 후속 PR 이관 양쪽 동일 ✅ | cross-doc |
| R3-10 | cross-check | `taxCategory` enum 확장(foreign_stock·exit_tax) — plan §5.1 ↔ engine §5.1 ↔ ui §3.⑨ 일치 ✅ | cross-doc |

**라운드 3 정정: CRITICAL 2건, IMPORTANT 1건, cross-check 7건 = 총 10건**

---

## 검토 이력

### UI 디자인 자체 검토 (2026-05-19)

| 번호 | 분류 | 대상 | 발견 내용 | 정정 위치 | 심각도 |
|---|---|---|---|---|---|
| UD-01 | IMPORTANT | ⑤ ForeignStockBlock 섹션 3 | `totalTransferPriceForeign` 입력 위젯 누락 | §4 ForeignStockBlock 섹션 3 | IMPORTANT |
| UD-02 | IMPORTANT | ExitTaxHoldingsMatrix 초기화 정책 | auto 1행 추가 vs 빈 상태 + 추가 버튼 미명시 → 빈 상태로 확정 | §3.② | IMPORTANT |
| UD-03 | IMPORTANT | ExchangeRateInput 소수점 자리수 | 2자리 → 4자리 상향 (JPY 등 소액 환율 대응, 계획서 원문과 정합) | §4 ExchangeRateInput | IMPORTANT |
| UD-04 | IMPORTANT | PR-4B store 분리 여부 | 별도 store 권고로 확정 | §3.① | IMPORTANT |
| UD-05 | ~~IMPORTANT~~ → **완료** | 결과 카드 세율 확정 — amber 배너 불필요. §104①11가목2) 20%/25% 확정 표기 <!-- 세율 환각 정정 2026-05-19 R3 --> | §3.⑦ | 완료 |
| UD-06 | IMPORTANT | `acquisitionModeFS` 네이밍 혼동 | 명확한 주석·용도 구분 명시 | §3.① | IMPORTANT |
| UD-07 | NON-CRITICAL | §118의 조문 LawArticleModal 배지 | 핵심 조문 배지 추가 권고 | §5 | NON-CRITICAL |
| UD-08 | NON-CRITICAL | 사이드바 간주양도가 useMemo 항목 | 명시 추가 | §3.⑥ | NON-CRITICAL |

**계획서 ↔ UI 디자인 정합 점검 요약**:

| 계획서 항목 | UI 디자인 반영 여부 |
|---|---|
| 환율 소수 4자리 (계획서 §7.1) | ✅ UD-03 정정으로 4자리 확정 |
| 통화 선택 USD/JPY/EUR 등 | ✅ §3.⑤ ForeignStockBlock 섹션 2·3 |
| 외국납부세액 공제방법 RadioCardGroup | ✅ §3.⑤ 섹션 6 |
| 국외전출세 별도 탭 권고 | ✅ §2.2 |
| ExitTaxHoldingsMatrix (AcquisitionLotsMatrix 패턴) | ✅ §4 |
| 결과 산식 한국어 + "원" 단위 생략 | ✅ §3.⑦ |
| 거주기간 5년 미만 → rose 경고 차단 | ✅ §3.⑤ ForeignStockBlock 섹션 1 + §3.⑧ |
| §118의13②1호·2호 배제 사유 UI | ✅ §3.⑤ ExitTaxBlock 섹션 4 RadioCardGroup |
| holdings[] 배열 Date 배열 map | ✅ §3.⑭ |
| FS-02 DR 후속 PR — UI 안내 카드 | ✅ §3.⑤ ForeignStockBlock 섹션 2 |

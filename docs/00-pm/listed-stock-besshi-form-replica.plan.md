# 상장주식 평가조서(갑·을) 서식 100% 재현 계획서

> **목표**: 사용자 첨부 이미지(국세청 상장주식 평가조서 갑·을 두 페이지)의 모든 칸·라벨·번호(①~⑱)·일자별 종가 표(좌측 5열×31행 + 우측 5열×31행)·소계/일수/종가합계/종가평균 행을, 화면 결과뷰와 react-pdf 출력 양쪽 모두 픽셀에 가깝게 재현. 비상장 별지부표3 재현(`project_unlisted_stock_besshi_2025_revision`) 패턴을 그대로 차용.
>
> **법령 근거** (KoreanLaw MCP로 본칙·시행령 확인 — Plan/Design 단계 산출물):
> - 상증법 §63①1호 가목 — 상장주식 평가: 평가기준일 이전·이후 각 2개월 종가평균
> - 상증법 §63②3호 — 상장법인 증자·합병 신주(미상장) 평가: 가목 평가액 − 배당차액
> - 상증령 §52의2 ① — 평균액 산정 방식
> - 상증령 §52의2 ② — **증자·합병이 평가기준일 전후 2개월 이내인 경우 평가기간을 신주 발행일·합병일부터 평가기준일 후 2개월까지로 변경** (케이스 3·4 분기 핵심). 이 분기는 `/api/kiwoom/valuation-2month` Zod 스키마에 **optional `startOverrideDate`(`capitalIncreaseDate`·`mergerDate` 중 D±2월 이내)** 파라미터를 추가하여 client에서 전달, server는 `buildTwoMonthSurroundingSlots` 대신 `[startOverrideDate, D + 2월]` 구간 slot 생성 (Phase C에 포함)
> - 상증령 §52의2 ③ — 거래정지·관리종목 본 평가 미적용
> - 상증령 §52의2 ④ — 거래일 분모 (공휴일·토요일 제외)
> - 상증법 §63③ + 상증령 §53④·§53⑧ — 최대주주 등 할증률 20%(`isMaxShareholder=true`이고 `companySize="large"` 일 때만 적용, 중소·중견기업·9사유 배제)
> - 상증규 §18② — 배당차액 산식: **1주당 액면가 × 직전기 배당률 × (배당기산일~평가기준일 일수) ÷ 365** (윤년에도 365 고정 — KoreanLaw 본칙 라벨 확정값)
>
> 본 계획은 [[korean-law-citation-verify]] 정책에 따라 **각 조문 라벨·산식을 Do 진입 전 KoreanLaw MCP로 재검증**한 뒤 확정한다. 가목·다목·§52의2 ②항·§53⑧ 9사유의 위임 체인 추적은 Pre-Do 단계 첫 산출물.

---

## 1. 현황 점검 (실측 — file:line 인용)

### 1-1. 엔진 — 이미 구현된 부분
- `lib/tax-engine/property-valuation-stock.ts:62-164` — `evaluateListedStock(item)` 전후 2개월 평균(`listedStockAvgPrice`) × 보유 주식 수(`listedStockShares`). §63②3호 분기(`isCapitalIncreaseUnlistedShare`) 완료.
- `lib/tax-engine/types/inheritance-gift.types.ts:73-86` — `EstateItem.listedStockAvgPrice`·`listedStockShares`·`listedStockCode`·`listedStockDividendDifference`·`isCapitalIncreaseUnlistedShare`·`dividendBaseDateSameAsListed` 존재.
- `lib/tax-engine/property-valuation/max-shareholder-premium.ts:35-116` — **비상장 전용** `calcMaxShareholderPremium({finalPerShareValue, isMaxShareholder, companySize})` 모듈. premium=0.20 large 한정.
- `lib/kiwoom/averages.ts:172-228` — `twoMonthSurroundingAvg({quotes, valuationDateIso, tradingHalt, adminIssue})` → `{slotDates, closingPrices, weekendLabels, tradingDays, sum, average, tradingHalt, adminIssue}`.
- `lib/kiwoom/calendar.ts:53-167` — `isKrxTradingDay(iso)` · `nonTradingLabel(iso)` (`"일요일"`·`"토요일"`·`"휴무일"`) · `buildTwoMonthSurroundingSlots(valuationDateIso)` 단일 array(평가기준일 기준 전후 2개월 모든 캘린더 날짜).
- `app/api/kiwoom/valuation-2month/route.ts:74-134` — 응답 `{stockCode, stockName, marketType, valuationDate, slotDates, closingPrices, weekendLabels, tradingDays, sum, average, tradingHalt, adminIssue, cached}`.
- `components/calc/StockValuationForm.tsx:39-135` — `ListedStockEditor` + `KiwoomValuationAutoFetchButton` 통합 완료. 평균가·주식수·종목코드 입력.

### 1-2. 누락된 부분 (신규 필요)

#### (a) 엔진 — §63③ 할증 listed_stock 미적용
`evaluateListedStock`은 단순 평균×주식수만 한다. ⑩·⑰에 들어가는 **할증 1주당 평가액 = 평균 × (1+0.20)** 가 평가액에 실제 영향을 주는데 미구현. 신규로 `max-shareholder-premium.ts` 모듈을 listed_stock에서도 import하여 적용. `EstateItem` 에 `isMaxShareholder?: boolean`·`companySize?: "small"|"medium"|"large"` 신규 필드 추가.

> 이미지 사례 H사 ⑩=⑰=⑨=8,452 = 할증 0%. **`isMaxShareholder=false` 또는 `companySize !== "large"` 또는 §53⑧ 9사유 중 해당** 케이스로 가정. anchor LS-01에서 명시.

#### (b) 갑지 18칸 중 화면·결과뷰 미노출 필드 11종
- 1.평가대상 상장법인: ① 법인명(`companyName`) · ② 대표자(`representative`) · ③ 법인 소재지(`companyAddress`) · **④ 평가기준일**(자산-수준 prop으로 `deathDate`/`giftDate` 이미 주입 중 — `components/calc/inheritance/EstateCommonAttributesSection.tsx` 패턴 그대로 재사용) · ⑤ 평가대상 주식 종류(`stockClass: "common"|"preferred"`) · ⑥ 상장일자(`listingDate`) · ⑦ 증자일자(`capitalIncreaseDate`) · ⑧ 합병일자(`mergerDate`)
- 3.미상장주식 (§63②3호): ⑪ 직전기 배당률(`priorDividendRate` — store는 **decimal 0~1**, UI는 % 표시·`DecimalInput step=0.0001`) · ⑫ 직전기 배당액(**자동 derive**: `Math.floor((faceValuePerShare ?? 0) × (priorDividendRate ?? 0))`) · ⑬ 배당기산일(`dividendBaseDate`) · ⑭ 배당기산일까지 일수(**자동 derive**: `differenceInDays(valuationDate, dividendBaseDate)`, 365 고정 분모) · ⑮ 배당차액(**자동**: `Math.floor(⑫ × ⑭ / 365)` — `lib/tax-engine/property-valuation/dividend-difference-section-63-2-3.ts` 기존 분기와 동일 산식 재사용) · ⑯ 1주당 가액(**자동**: ⑨−⑮) · ⑰ 최대주주 1주당평가액(**자동**: `Math.floor(⑯ × (1 + premiumRate))` — `max-shareholder-premium.ts:111` 동일 산식) · ⑱ 종가평균(**= ⑨ 단일 source**: `besshiData.page2.closingAverage`)
- 액면가(`faceValuePerShare`): 자동 fallback 금지 정책 [[feedback_no_silent_apportion_fallback]]. **§63②3호 분기 활성 시 명시 입력 강제** (validate ⑧). 기본값 단정 금지.

#### (c) 을지 일자별 종가 표 4그룹 구조
이미지 5 재분석:
- **좌측 5열 × 31행**: `NO | 이전1월 월일 | 종가 | 이전2월 월일 | 종가` (평가기준일에서 가까운 날이 NO=1, 멀어질수록 증가)
- **우측 5열 × 31행**: `NO | 이후1월 월일 | 종가 | 이후2월 월일 | 종가`
- 종가 자리에 `"일요일"`/`"토요일"`/`"휴무일"`/`-` 라벨 (영업일이 아닐 때)
- 마지막 4행: **좌측 소계 350,490**·**우측 소계 359,540** → **일수 84**(좌·우 합) → **종가합계 710,030** → **종가평균 8,452**

현재 `twoMonthSurroundingAvg` 응답은 단일 `slotDates: string[]`. 갑·을 표시를 위해 **4그룹 분할 헬퍼 신규**:

```ts
// lib/kiwoom/two-month-grouping.ts (신규)
export interface MonthGroupedSlots {
  beforeM1: SlotRow[];   // 평가기준일 이전 1개월 (NO=1: 평가기준일 자체)
  beforeM2: SlotRow[];   // 평가기준일 이전 2개월
  afterM1: SlotRow[];    // 평가기준일 이후 1개월
  afterM2: SlotRow[];    // 평가기준일 이후 2개월
}
export interface SlotRow {
  no: number;            // 1~31
  date: string;          // "YYYY-MM-DD"
  monthDay: string;      // "07월 06일"
  closing: number | null;
  label: string;         // "" | "일요일" | "토요일" | "휴무일" | "종가 없음" | "상장전"
}
export function splitTwoMonthSurroundingByMonthGroup(
  slotDates: string[],
  closingPrices: (number | null)[],
  weekendLabels: string[],
  valuationDateIso: string,
): MonthGroupedSlots;
```

분할 규칙: 평가기준일 D 기준
- beforeM1: `[D − 31일, D]` (NO 1 = D 평가기준일 자체)
- beforeM2: `[D − 62일, D − 32일]`
- afterM1: `[D, D + 31일]` (NO 1 = D)
- afterM2: `[D + 32일, D + 62일]`
- **D 종가는 좌(beforeM1 NO 1)·우(afterM1 NO 1) 양쪽 모두 표시 + 평균 산식 양쪽 카운트** (이미지 H사 검증: 좌소계 350,490 + 우소계 359,540 = 710,030, ÷ 일수 84 = 8,452.74 → floor 8,452 ✓)
- **소계 = closing 합 (label≠"" 인 행은 0)**, 일수 = 좌·우 closing≠null 행 수의 합

#### (d) 자동 채움 가능성
- `companyName` ← 키움 `ka10001` 응답 `stockName` (확인됨, `lib/kiwoom/types.ts` `KiwoomStockInfo.stockName`)
- `listingDate` ← **확인 필요** (`ka10001` 응답에 `listingDate` 필드 존재 여부 Pre-Do 단계에서 grep 검증. 없다면 사용자 직접 입력)
- `representative`·`companyAddress` ← 키움 API 범위 외 → 사용자 직접 입력

#### (e) 미보호 API 등록
`/api/kiwoom/valuation-2month` 는 이미 `proxy.ts` 미보호 라우트(키움 인프라 공통). Phase 0에서 grep 재확인.

### 1-3. 비상장 별지부표3 재현 패턴 (그대로 적용)
- 화면: `components/calc/inheritance/unlisted-stock-v2/besshi/Page*.tsx` (78~193줄, 6 페이지)
- PDF: `lib/pdf/UnlistedStockBesshiPdfDocument.tsx` (675줄)
- 상수 단일출처: `besshi-form-constants.ts` + `BesshiSharedAtoms.tsx` (NumberCircle·HeaderCell·NumberCell)
- testid 동결, 화면·PDF 공유 상수, react-pdf 4.x `fontFamily` 배열 per-glyph fallback
- Pre-Do anchor로 dual-truth 사전 차단 (별지부표3 후속2~5 사례)

---

## 2. 케이스 매트릭스 (Do 진입 전 행≥1 필수)

| # | 시나리오 | 평가구간(상증령 §52의2②) | 미상장표시 ⑪~⑰ | §63③ 할증 | anchor |
|---|---|---|---|---|---|
| LS-01 | 일반 상장주식 (이미지 H사·개인) | D±2월 | 빈칸 | 0% | 이미지 ⑨=⑱=8,452, ⑩=⑰=8,452 |
| LS-02 | 일반 + 최대주주 + large | D±2월 | 빈칸 | 20% | ⑩=⑨×1.2, 평가액=⑩×주식수 |
| LS-03 | 평가기준일 ≤ 증자일자(D+x ≤ +2월) | **증자일~D+2월** | ⑪~⑰ 채움 | 가능 | 평균기간 단축 |
| LS-04 | 평가기준일 ≤ 합병일자(D+y ≤ +2월) | **합병일~D+2월** | ⑪~⑰ 채움 | 가능 | 동일 |
| LS-05 | ⑬배당기산일 = ⑥상장일자 | D±2월 | ⑮=0 라벨 "배당기산일 동일 — 제외" | − | `dividendBaseDateSameAsListed` 기존 분기 재사용 |
| LS-06 | 휴장일·주말 다수(이미지 H사 다수 휴장일) | D±2월 | − | − | 일수 84, 휴장 라벨 카운트 |
| LS-07 | 상장 후 1개월 미만 IPO 직후 | 사용자 안내·자동 fallback 금지 (§63①1나목 비상장 평가 폴백은 사용자가 명시 전환) | 빈칸 | − | warning UX |
| LS-08 | 우선주 | D±2월 | ⑤="우선주" | 가능 | stockClass 분기 |
| LS-09 | §53⑧ 9사유 중 해당 | D±2월 | − | 0% | premium 배제 라벨 |
| LS-10 | 중소·중견기업 + 최대주주 | D±2월 | − | 0% | companySize 분기 |

> 행 10개 모두 Pre-Do 단계 anchor 파일 골격(RED) 작성 후 디자인 환류 ([[pre-do-anchor-verification]]).

---

## 3. 데이터 모델 확장

### 3-1. `EstateItem` 신규 필드 (`types/inheritance-gift.types.ts`)
```ts
// 갑지 1.평가대상 상장법인
companyName?: string;             // ①
representative?: string;          // ②
companyAddress?: string;          // ③
// ④ 평가기준일 — 자산-수준 prop deathDate/giftDate 재사용 (신규 EstateItem 필드 추가 없음)
stockClass?: "common" | "preferred"; // ⑤
listingDate?: Date | string;      // ⑥
capitalIncreaseDate?: Date | string; // ⑦
mergerDate?: Date | string;        // ⑧

// §63③ 할증 (listed_stock 신규)
isMaxShareholder?: boolean;       // §63③ 적용 토글
companySize?: "small" | "medium" | "large"; // §53④ 배제 판정
maxShareholderPremiumExclusionReason?:
  | "none"
  | "smb_med"      // 중소·중견기업 (§53④)
  | "art53_8_1" | "art53_8_2" | "art53_8_3" | "art53_8_4"
  | "art53_8_5" | "art53_8_6" | "art53_8_7" | "art53_8_8" | "art53_8_9";

// 갑지 3.미상장주식 (§63②3호)
priorDividendRate?: number;       // ⑪ decimal 0~1 (store) / % (UI)
faceValuePerShare?: number;       // 1주당 액면가 (자동 fallback 금지)
dividendBaseDate?: Date | string; // ⑬

// 을지 4그룹 종가표는 EstateItem에 두지 않음 — single source는 result.besshiData.page2
// (R-2/[[mirror-pattern]] 정책: 자동조회 응답을 store EstateItem에 mirror 저장 금지.
//  엔진이 매번 valuation-2month API를 재호출하지 않으므로, 4그룹 분할 결과는
//  자산 추가/자동조회 시점에 lib/calc/listed-stock-besshi.ts 어댑터가 한 번 만들어
//  evaluateListedStock 호출 시 EstateItem.listedStockDailyGroupsInput 으로 전달하고,
//  엔진은 변경 없이 pass-through 하여 result.besshiData.page2 에 echo 한다.)
listedStockDailyGroupsInput?: MonthGroupedSlots; // (a) 자동조회 결과 caching 용도. UI 입력 폼은 보유하지 않음
```

### 3-2. `evaluateListedStock` result echo ([[echo-field-pattern]])
산식·계산 로직 무변경(단, §63③ 할증은 신규 적용 — 이미 평가액에 영향). result에 부표 표시용 echo 필드 추가:

```ts
besshiData?: {
  page1: {
    companyName?: string;
    representative?: string;
    companyAddress?: string;
    valuationDate: string;         // ④
    stockClass: "common"|"preferred";
    listingDate?: string;
    capitalIncreaseDate?: string;
    mergerDate?: string;
    isUnlistedShareSection: boolean; // ⑪~⑰ 활성 (capitalIncrease/merger 입력 시 true)
  };
  page1Values: {
    closingAvg: number;            // ⑨ ⑱
    perShareMajorShareholder: number; // ⑩ = ⑨ × (1 + premium)
    priorDividendRate?: number;    // ⑪
    priorDividendAmount?: number;  // ⑫ = faceValue × ⑪
    dividendBaseDate?: string;     // ⑬
    daysUntilDividendBase?: number; // ⑭
    dividendDifference?: number;   // ⑮ = ⑫ × ⑭ / 365 (floor)
    perShareValue?: number;        // ⑯ = ⑨ − ⑮
    perShareMajorShareholderUnlisted?: number; // ⑰ = ⑯ × (1 + premium)
    majorShareholderRate: 0 | 0.20; // §63③
    premiumExclusionReason?: string; // §53⑧ 1~9호 라벨
  };
  page2: {
    beforeM1: SlotRow[];           // 좌측 첫 2열 (이전 1월)
    beforeM2: SlotRow[];           // 좌측 마지막 2열 (이전 2월)
    afterM1: SlotRow[];            // 우측 첫 2열 (이후 1월)
    afterM2: SlotRow[];            // 우측 마지막 2열 (이후 2월)
    beforeSubtotal: number;        // 좌측 소계 (closing 합)
    afterSubtotal: number;         // 우측 소계
    tradingDays: number;           // 일수 (좌·우 closing 있는 행 합)
    closingSum: number;            // beforeSubtotal + afterSubtotal
    closingAverage: number;        // = closingAvg
  };
};
```

### 3-3. 키움 API 응답 → echo 매핑
- 신규 헬퍼 `lib/kiwoom/two-month-grouping.ts` 의 `splitTwoMonthSurroundingByMonthGroup(slotDates, closingPrices, weekendLabels, valuationDateIso)` 호출
- API route는 변경 없음(이미 `slotDates`·`closingPrices`·`weekendLabels` 모두 응답에 있음). orchestrator(또는 `lib/calc/listed-stock-besshi.ts` 신규)가 `EstateItem` 자동조회 응답을 store에 저장할 때 4그룹 분할 후 `EstateItem.listedStockDailyClosingsEcho` 에 저장 → 엔진은 그대로 result 로 pass-through.

---

## 4. UI 컴포넌트 분해

```
components/calc/inheritance/besshi-shared/
└── BesshiSharedAtoms.tsx           # Phase 0에서 unlisted-stock-v2/besshi/ → 격상 이동 (NumberCircle·HeaderCell)

components/calc/inheritance/listed-stock/besshi/
├── listed-besshi-constants.ts      # 라벨·번호·열 폭 (LS_P1_*, LS_P2_*)
├── Page1CoverSection.tsx           # 갑지 18칸 표 (besshi-shared/BesshiSharedAtoms import)
└── Page2DailyClosingTable.tsx      # 을지 좌5×31 + 우5×31 + 소계4행

components/calc/inheritance/listed-stock/
└── ListedStockBesshiResultView.tsx # 갑·을 묶음 (estateItems 순회 통합 컴포넌트에서 분기 호출)
```

**결과뷰 통합 위치 확정**: `components/calc/inheritance/unlisted-stock-v2/besshi/` 의 통합 패턴 그대로. 상속세·증여세 결과뷰에서 `estateItems.filter(item => item.category === "listed_stock")` 행마다 `<ListedStockBesshiResultView item={item} />` 렌더. 실제 부착 파일은 별지부표3 통합 시 사용한 동일 파일 — Phase 0에서 grep으로 file:line 확정 후 design 문서에 명시.

**입력 UI 확장**:
- `StockValuationForm.tsx ListedStockEditor` (현재 39~135줄) — 종목코드·평균가·주식수 뒤에 **갑지 신규 필드 collapsible**:
  1. 평가대상 상장법인: 법인명/대표자/소재지/주식종류/상장일자
  2. §63③ 할증: 최대주주 토글 + 기업규모 select + 배제 사유 select
  3. §63②3호 미상장 신주: 증자일자/합병일자 (둘 중 하나만 — RadioCardGroup) + 액면가 + 직전기 배당률 + 배당기산일 + dividendBaseDateSameAsListed 토글
- **3-state 토글** ([[three-state-optional-mode-toggle]]): "직접입력" / "자동조회만" / "off" — off일 때 갑지 ②③⑥⑦⑧ 빈칸.
- 키움 자동조회 성공 시 `companyName` ← `ka10001.stockName` 자동 채움. `listingDate` 자동 채움 가능 여부는 Phase 0 grep 확인.
- ⑫ ⑭ ⑮ ⑯ ⑰ ⑱ 은 **engine result echo** — UI 직접 계산 금지([[ui_engine_dual_truth_avoidance]]).

---

## 5. PDF 컴포넌트

```
lib/pdf/ListedStockBesshiPdfDocument.tsx  # 갑(Page) + 을(Page) 2장 (신규 ≤ 600줄 가드)
lib/pdf/besshi-pdf-styles.ts              # 기존 styles import + LS 전용 P2 그리드만 추가
```

별지부표3 후속2~5 정책 그대로:
- 화면·PDF가 `listed-besshi-constants.ts` 공유 (dual-truth 금지 [[ui_engine_dual_truth_avoidance]])
- testid 동결: `p1-①` ~ `p1-⑱` · `p2-before-m1-row-${no}-date|closing` · `p2-before-m2-row-${no}-date|closing` · `p2-after-m1-...` · `p2-after-m2-...` · `p2-subtotal-before`·`p2-subtotal-after`·`p2-tradingDays`·`p2-sum`·`p2-avg`
- react-pdf 4.x `fontFamily: ["NanumGothic", "IBM Plex Sans KR"]` per-glyph fallback
- `print:block`/`print:hidden` CSS-only 토글 [[print-only-css-toggle]]

---

## 6. 14 동기화 지점 (강제)

| # | 지점 | 변경 |
|---|---|---|
| ① | FormData (`calc-wizard-store`) | **13 신규 입력 필드** (companyName·representative·companyAddress·stockClass·listingDate·capitalIncreaseDate·mergerDate·isMaxShareholder·companySize·premiumExclusionReason·priorDividendRate·faceValuePerShare·dividendBaseDate) + **1 캐시 echo** (`listedStockDailyGroupsInput` — 자동조회 channel-fill 전용) |
| ② | initial | optional 기본값 (할증 0%·stockClass="common"·companySize="small") |
| ③ | normalize | trim·Date 변환·decimal 변환 |
| ④ | API 변환 (`lib/calc/inheritance-gift-api.ts`·`gift-tax-api.ts`) | 13 입력 + `listedStockDailyGroupsInput` 캐시 전달 |
| ⑤ | UI 위젯 | `ListedStockEditor` collapsible + 결과뷰 `ListedStockBesshiResultView` |
| ⑥ | 사이드바 합계 | **§63③ 할증 신규 적용 → `evaluateListedStock` 결과 `valuatedAmount` 변화** → `lib/stores/inheritance-summary.ts`·`lib/stores/gift-summary.ts` 의 estate items 합산에 자동 반영. `isMaxShareholder` 미입력은 기본 `false` → 기존 사용처 무변경 (LS-02·LS-04 회귀 anchor) |
| ⑦ | 결과 카드 | 별지 갑·을 + 산출근거 |
| ⑧ | validation | `priorDividendRate ∈ [0,1]`, ⑦/⑧ 입력 시 `faceValuePerShare`·`dividendBaseDate` 필수(자동 fallback 금지), `valuationDate` 필수, `isMaxShareholder && companySize === "large" && !premiumExclusionReason` → 할증 20% |
| ⑨ | Zod enum 메인 | `stockClass`·`companySize`·`premiumExclusionReason` enum |
| ⑩ | Zod enum 컴패니언 | EstateItem 스키마 13 입력 + 1 캐시 |
| ⑪ | acqDate fallback | 무관 |
| ⑫ | **Zod 입력 객체 정의** ★ | EstateItem 객체에 13 입력 + 1 캐시 추가 (없으면 silent strip — TS 미감지) |
| ⑬ | **callTransferTaxAPI/Gift body spread** ★ | EstateItem spread 유지 확인 |
| ⑭ | **Route handler 엔진 input 매핑** ★ | `coerceDates(item, ["listingDate","capitalIncreaseDate","mergerDate","dividendBaseDate"])` 추가 |

> `dailyClosingsEcho` 는 입력 아닌 result echo — Zod 입력 객체에는 포함되지 않음. 입력 14지점은 11 필드만 영향.

### 6-1. 검증 워크플로

1. **Plan 직후 Pre-Do anchor LS-01** — 이미지 H사 (⑨=⑱=8,452, 좌소계=350,490, 우소계=359,540, 일수=84, 종가합=710,030). anchor 입력값: `isMaxShareholder: false` (또는 `companySize: "small"`), `priorDividendRate: undefined`, `capitalIncreaseDate: undefined`, `mergerDate: undefined` → ⑩=⑰=⑨=8,452 자동 검증 + 디자인 환류.
2. **KoreanLaw 검증** — §63③·§53④·§53⑧ 9사유·§52의2 ②(증자·합병 평가기간 단축)·§18② 배당차액 산식 본칙·시행령 끝까지 추적. 종래 `§163⑨` 오기 패턴 [[feedback_kiwoom_law_citation_drift]] 재발 방지.
3. **이미지 라벨 1:1 매핑** — 갑지 18칸 모두 `LS_P1_LABELS: Record<string, string>` 표로 작성 후 화면·PDF 동일 출처. 임의 어구·줄바꿈 변경 금지.
4. **을지 4그룹 충실** — 좌·우 2 묶음 안에 각 1·2월 짝 = 4그룹. 키움 응답 단일 array 그대로 사용 금지. 신규 헬퍼 `splitTwoMonthSurroundingByMonthGroup` 단위 anchor 별도.
5. **listingDate 자동 채움 검증** — `ka10001` 응답에 `listingDate` 또는 유사 필드 존재 여부를 Phase 0(Plan 직후)에 grep으로 확정. 없으면 UI에서 사용자 직접 입력만 허용. ([[korean-law-citation-verify]] 와 동일 정신: 미확인 단정 금지)
6. **atoms 위치 격상** — 현재 `components/calc/inheritance/unlisted-stock-v2/besshi/BesshiSharedAtoms.tsx` 를 `components/calc/inheritance/besshi-shared/BesshiSharedAtoms.tsx` 로 이동 후 listed/unlisted 양쪽이 import. 이동 시 별지부표3 기존 import 경로 일괄 치환 + 회귀 확인.

---

## 7. anchor 테스트 (`__tests__/`)

```
__tests__/tax-engine/listed-stock/
├── valuation-2month-average.test.ts        # LS-01 H사 ⑨=8,452·일수84·소계 좌350,490·우359,540
├── max-shareholder-premium-listed.test.ts  # LS-02 ⑩=⑨×1.2, LS-09/10 배제 0%
├── capital-increase-share.test.ts          # LS-03/04 §63②3호 ⑮·⑯ + §52의2② 평가기간
├── dividend-base-date-same.test.ts         # LS-05 ⑮=0 라벨
└── besshi-echo-shape.test.ts               # echo 4그룹 분할 + 누락 가드

__tests__/lib/kiwoom/
└── two-month-grouping.test.ts              # splitTwoMonthSurroundingByMonthGroup 분할 anchor

__tests__/lib/pdf/
└── listed-stock-besshi-parity.test.tsx     # 화면 testid ↔ PDF testid 1:1

__tests__/components/calc/inheritance/
├── listed-stock-besshi-page1-official-layout.test.tsx  # 18칸 라벨·번호
└── listed-stock-besshi-page2-official-layout.test.tsx  # 좌5×31+우5×31+소계4행
```

원단위 `toBe()` anchor 고정 ([[feedback_pdf_example_test_anchoring]]).

---

## 8. 단계 분할 ([[pdf-case-replica-workflow]])

| Phase | 내용 | 회귀 |
|---|---|---|
| Plan | 본 계획서 + Pre-Do 사실 확인 (ka10001 listingDate·proxy.ts 등록·deathDate/giftDate 필드) | 0 |
| Design | `listed-stock-besshi-form-replica.engine.design.md` + `listed-stock-besshi-form-replica.ui.design.md` + 케이스 10행 | 0 |
| **Pre-Do anchor** | LS-01 H사 ⑨=8,452 anchor RED → 디자인 환류 | 0 |
| Phase 0: atoms 격상 | `unlisted-stock-v2/besshi/BesshiSharedAtoms.tsx` → `besshi-shared/BesshiSharedAtoms.tsx` 이동 + import 일괄 치환 + 비상장 회귀 0 | 0 |
| Phase A: 타입·legal-codes | EstateItem 13 입력 + 1 캐시 + §52의2②·§53⑧·§18② 상수 | 0 |
| Phase B: 엔진 §63③ 적용 + echo | `evaluateListedStock` 에 `calcMaxShareholderPremium` 합성 + besshiData echo | LS-01~LS-10 PASS |
| Phase C: 키움 4그룹 분할 헬퍼 | `lib/kiwoom/two-month-grouping.ts` 단위 anchor | 0 |
| Phase D: 화면 컴포넌트 | besshi/ 4 파일 (constants/atoms/Page1/Page2/ResultView) | 0 |
| Phase E: PDF | ListedStockBesshiPdfDocument.tsx + styles 확장 + font fallback | 0 |
| Phase F: 14지점 동기화 | ④⑧⑨⑩⑫⑬⑭ 일괄 grep 점검 | 0 |
| Phase G: 통합 anchor + E2E | parity + e2e (자산 추가→자동조회→갑·을 표시→PDF) | 0 |

**완료 보고 전 자가 점검**:
- [ ] 케이스 매트릭스 10행 anchor PASS
- [ ] 14지점 grep (⑫⑬⑭ silent strip 가드)
- [ ] `npx tsc --noEmit` 0
- [ ] `npm test` 0 회귀 (5000+ PASS 유지)
- [ ] **Playwright E2E** [[feedback_browser_verify_with_playwright]] — 상장 자산 추가 → 키움 자동조회 → 결과뷰 갑·을 → PDF 다운로드

---

## 9. 후속·리스크

- **상장 후 1개월 미만 IPO** (§165⑤ 별도 시점) — 양도세 `KiwoomPostListingAutoFetchButton` 존재. 본 Phase 범위 외, 자동 fallback 금지.
- **합병비율 조정** (§63②3호 합병 신주) — 본 Phase 범위 내 collapsible auto-open.
- **800줄 정책** — `UnlistedStockBesshiPdfDocument.tsx` 675줄. 본 신규 PDF는 별도 파일 분리.
- **dual-truth 차단** — ⑨·⑱이 동일값. echo source는 단일(`besshiData.page2.closingAverage`).
- **§63③ 할증 신규 적용 회귀** — 기존 listed_stock 사용처(상속·증여 결과)에서 `isMaxShareholder` 미입력은 기본 `false` → 결과 무변경. LS-02 신규 anchor로 변화 검증.
- **§18② 분모 365 — 윤년 분기**: 본 계획은 365 고정. 실무 분쟁 시 `daysUntilDividendBase` echo 노출하여 사용자가 검증.

---

## 10. 참조

- 선행 사례·패턴: `docs/02-design/features/inheritance-unlisted-stock-besshi-2025-revision.engine.design.md` + memory `project_unlisted_stock_besshi_2025_revision`
- 결과뷰 통합: `inheritance-besshi-result-view-integration.ui.design.md` + memory `project_besshi_result_view_integration`
- 키움 자동조회 §63①1가: `app/api/kiwoom/valuation-2month/route.ts` + `lib/kiwoom/averages.ts:165-`
- 비상장 §63③ 할증: `lib/tax-engine/property-valuation/max-shareholder-premium.ts`
- 별지부표3 PDF 글리프 fallback: `lib/pdf/fonts.ts`
- 14 동기화 지점: `CLAUDE.md` Definition of Done
- 정책: [[korean-law-citation-verify]] · [[pre-do-anchor-verification]] · [[feedback_no_silent_apportion_fallback]] · [[echo-field-pattern]] · [[ui_engine_dual_truth_avoidance]] · [[three-state-optional-mode-toggle]]

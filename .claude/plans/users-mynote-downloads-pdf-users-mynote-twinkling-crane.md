# 부담부증여 — 사례 34 양도소득세 구현 계획

## Context

`/Users/mynote/Downloads/부담부 증여.pdf` (2023 양도·상속·증여세 이론 및 계산실무 — 양도코리아 교재 사례 34) + `/Users/mynote/Downloads/양도소득세 계산 사례/부담부 증여.xlsx` 분석 결과, **일반건물(양코빌딩) 부담부증여** 사례를 양도세 엔진에 추가해야 한다.

**부담부증여** = 증여 시 수증자가 증여자의 채무(임대보증금+담보차입금)를 인수하는 조건의 증여 계약. 채무인수분은 유상이전 → **양도소득세**, 나머지는 무상이전 → 증여세. 사용자 결정에 따라 **본 Phase 1은 양도소득세만 구현**하고 증여세 통합은 후속 Phase로 분리한다.

문제·필요: 현 코드베이스는 사례 31(일반건물 환산)·32(신축 단기양도)·33(증축 환산)까지 일반건물 4가지 조합을 지원하지만, **취득원인 `burdened_gift`는 취득세 enum에만 존재**(`lib/tax-engine/types/acquisition.types.ts:85`)하고 양도세 파이프라인에는 미연결. 사용자가 "양도가액 = 채무액", "취득가액 = 취득시 기준시가 × 채무비율" 산식을 입력할 수 없다.

의도한 결과: PDF/Excel 입력값을 그대로 폼에 넣어 **합계 산출세액 740,074,515원·지방소득세 74,007,451원**을 anchor `toBe()`로 정확히 재현. 토지·건물 자산별 양도차익 분리(2,468,955,153 / 93,392,512), 장특공 24년 5월(30%) 768,704,298, 양도소득금액 1,793,643,367 모두 일치.

## 사례 34 핵심 데이터 (요약)

| 항목 | 값 |
|---|---|
| 증여일(=양도일) | 2023-02-19 |
| 취득일 | 1998-09-07 (실거래가 25억, 필요경비 192백만) |
| 자산 | 일반건물(양코빌딩) — 토지 1,279㎡ + 건물 1,341.5㎡ (B1·1~3F) |
| 양도시 평가유형 | 상증법상 기준시가 (보충적평가) |
| 토지 양도시 공시지가 | 2022년 6,215,000원/㎡ → 7,948,985,000 |
| 건물 양도시 보충적평가 | 629,310,360 (B1 132,164,000 / 1F 135,413,550 / 2F 178,857,640 / 3F 182,875,170) |
| 보충적평가 합계 | **8,578,295,360** |
| 담보차입금 | 3,120,000,000 |
| 임대보증금 | 1,000,000,000 |
| 연간 임대료 | 130,000,000 |
| 임대평가 | 1,000,000,000 + 130,000,000/12% = **2,083,333,333** |
| 담보평가 | 채무액(임대보증금+담보차입금) 또는 (근)저당설정액 → 사례에선 **4,120,000,000** |
| 증여재산 평가액 = Max(보충적·담보·임대) | **8,578,295,360** (보충적평가 채택) |
| 채무인수액 (= 양도가액) | **4,120,000,000** |
| 채무비율 | 4,120,000,000 / 8,578,295,360 ≈ 0.48027805 |
| 취득시 보충적평가 (소득세법) | 3,148,742,064 (토지 1,279 × 2,130,000 = 2,724,270,000 / 건물 424,472,064) |

### 양도세 anchor (PDF p.534·537·538 / Excel B21·C24)

| 단계 | 합계 | 토지 | 건물 |
|---|---|---|---|
| 양도가액 | 4,120,000,000 | 3,816,625,253 | 303,374,747 |
| 취득가액 | 1,512,283,821 | 1,308,417,573 | 203,866,248 |
| 필요경비(개산공제 3%) | 45,368,514 | 39,252,527 | 6,115,987 |
| 양도차익 | 2,562,347,665 | 2,468,955,153 | 93,392,512 |
| 장특공 30%(24년) | 768,704,298 | 740,686,545 | 28,017,753 |
| 양도소득금액 | 1,793,643,367 | 1,728,268,608 | 65,374,759 |
| 과세표준(기본공제 250만 차감) | 1,791,143,367 | — | — |
| **산출세액 (45%, 누진공제 6,540만)** | **740,074,515** | — | — |
| **지방소득세 (10%)** | **74,007,451** | — | — |

### 산식 검증
- 자산별 양도가액 = 자산별 상증법 평가액 × (채무액 / 증여재산평가액)
  - 토지: 7,948,985,000 × 0.48027805 = 3,816,625,253.62 ✓
  - 건물: 629,310,360 × 0.48027805 = 303,374,746.38 ✓
- 자산별 취득가액 = 자산별 취득시 기준시가 × 채무비율 (= 양도가액 × 취득시 기준시가/양도시 기준시가, 동치)
- 개산공제(§163⑥, 등기 자산 3%) = 자산별 취득가액 × 3%
- 산출세액: 1,791,143,367 × 0.45 − 65,940,000 = **740,074,515** (§55 누진세율표 자가검증)
- 지방세: 740,074,515 × 10% = **74,007,451** (원 미만 절사)

## 세법 쟁점 — 디자인 doc에 명시할 사항

본 PR 시작 전 `docs/02-design/features/transfer-tax-burdened-gift.engine.design.md`에 아래 조문·논리를 모두 명문화한다. KoreanLaw MCP로 조·항·호 정확 검증 후 인용.

### 쟁점 1: 보유기간 = §95④ **본문 직접 적용** (단서 인용 금지)
- 부담부증여 양도분의 양도자는 **증여자 본인**(§88①1호 후단 "양도" 정의 포함)이므로, **§95④ 본문**("취득일부터 양도일까지")이 직접 적용 → 보유기간 = 증여자 당초 취득일 ~ 증여일.
- ⚠️ **§95④ 단서**("…다만, 제97조의2제1항의 경우에는 증여한 배우자 또는 직계존비속이 해당 자산을 취득한 날부터 기산…")는 **수증자가 양도하는 §97의2 이월과세 케이스 전용**. 결과(증여자 취득일 기산)는 같지만 부담부증여를 단서로 인용하면 후속 개발자가 §97의2와 혼동. 디자인 doc·코드 주석에서 단서 인용 금지.
- 정조문 상수: `HOLDING_PERIOD_95_2_AND_4_MAIN: "소득세법 §95② 표1 + §95④ 본문 — 양도자(=증여자)의 취득일~양도(증여)일"`
- 사례 34: 1998-09-07 ~ 2023-02-19 = 24년 5개월 → §95② 표1 (일반자산) 15년 이상 30%.
- 양도시기는 §162① 9호(증여등기접수일) — 신고기한·과세표준 확정용이며 보유기간 기산과 다른 조문.
- **1세대1주택 부담부증여 가드**: 본 Phase 1은 **일반건물(general_building) 전용**. 1세대1주택은 §95② 표2(보유 10년+거주 10년 = 최대 80%)로 장특공률표가 달라짐 → `apportionByDebtRatio()` / 부담부증여 진입 헬퍼에 `assert propertyType === "general_building"` 가드 박기. Phase 3 1주택 부담부증여에서 표2 분기 도입.

### 쟁점 2: 임대료 환산율 12% — 시행일 명시 상수
- 상증법 시행령 임대보증금·임대료 환산평가 규정(통상 §50④로 알려짐 — **디자인 doc에서 KoreanLaw MCP로 정확 조·항·호 재확인 필수**) 의 환산율 12%는 2009.4.23. 시행. 이전 거래는 18%.
- 사례 34는 평가기준일 2023-02-19 → 12% 적용. 본 Phase 1은 12%만 구현, 18%는 v2 후속.
- 코드 상수: `ANNUAL_RENT_CAPITALIZATION_RATE_AFTER_2009_04_23 = 0.12` (시행일 접미사로 v2 18% 분기 확장 신호). `legal-codes/burdened-gift.ts`에 시행일 상수 함께 정의.

### 쟁점 3: 담보평가 ≠ 채무인수액 (필드 분리)
- 사례 34는 채무액(임대보증금+담보차입금)이 (근)저당 설정액과 동치라 단순화되어 있으나, 실무에서는 **(근)저당 설정액 ≠ 실제 채무잔액**인 경우가 다수 (예: 한도 5억 근저당 + 실제 잔액 3억).
- 상증법 평가에서 담보평가 = "(근)저당권 등 설정 시 그 재산이 담보하는 채권액 + 전세권 설정액" (PDF p.531 ②). 양도가액 산정에 쓰이는 채무인수액과는 개념 분리.
- 타입 분리: `mortgageDebtAmount`(실제 채무인수액, 양도가액으로 매핑) / `mortgageSetAmount?`(근저당 설정액, 담보평가에만 사용). 미입력 시 `mortgageSetAmount = mortgageDebtAmount` fallback. v2 비용 0으로 미리 박아둠.

### 쟁점 4: 개산공제 산식 명시 (§163⑥ × 채무비율)
- 부담부증여 자산별 개산공제 = (취득당시 기준시가 × 채무비율) × 3% (등기, §163⑥ — 일반 자산률).
- 즉 안분된 취득가액 × 3% — 전체 기준시가 × 3%가 아님. 사례 34 anchor: 토지 1,308,417,573 × 3% = 39,252,527 / 건물 203,866,248 × 3% = 6,115,987. 디자인 doc 산식 칸에 풀어쓰기 — "왜 전체 기준시가에 3% 안 곱했지?" 후속 개발자 혼란 차단.

### 쟁점 5: 양도가액 = 채무액 매핑 (소득령 §159)
- 정조문: **소득세법 시행령 §159** ("부담부증여에 있어서의 양도가액 등의 계산"). 양도가액 = 증여재산가액 × (채무액 / 증여재산 평가액) = 자산별 상증법 평가액 × 채무비율.
- UI: `transferPrice` 입력 칸을 **disabled + 회색 prefilled** 로 표시. 자동 계산된 4,120,000,000을 그대로 보여줘 "이게 채무액으로 잡혔구나"를 한눈에 확인. tooltip "부담부증여 양도가액 = 인수 채무액(§159)".

### 쟁점 6: 환산취득가(§114⑦) vs 부담부증여(§159) — 코드 경로 분리
- 두 방식의 결과값이 수학적으로 동치(`debtRatio × stdPriceAtAcq` ≡ `transferPrice × stdPriceAtAcq / stdPriceAtTransfer`)이나, **법적 근거가 다른 조문이므로 코드 경로를 분리**한다.
- 환산취득가 = 소득세법 §114⑦(추계조사 시 양도가·취득가) — 매매계약가 불분명 시.
- 부담부증여 = 소득령 §159 — 양도 자체가 채무인수 행위.
- `useEstimatedAcquisition = false` 유지 + 부담부증여 전용 분기(`burdened-gift-apportionment.ts`)에서 별도 산식. 감사·유지보수 시 조문 추적 가능.

### 쟁점 7: 이월과세(§97의2) 미적용 — **기간 10년** (2025.12.23 개정)
- 소득세법 §97의2(배우자·직계존비속 증여재산에 대한 이월과세)는 **거주자가 양도일부터 소급하여 10년**(§94①3호 자산은 1년 등) 내 증여받은 자산을 양도하는 경우에 적용 (2025.12.23 개정, 2026.4.21 시행 — 종전 5년에서 10년으로 확대).
- 부담부증여의 채무인수 양도분은 **증여자가 양도자**이므로 §97의2 적용 대상 아님 (수증자 양도가 아님).
- ⚠️ Plan v1 표기 "5년 내"는 개정 전 조문 — **10년으로 정정**. 디자인 doc·코드 주석 모두 10년 기준.
- 엔진 분기 진입부 주석: `// 부담부증여 채무인수 양도: 양도자 = 증여자. 소득세법 §97의2(이월과세, 양도일 소급 10년) 미적용.`
- 결과 객체 `carryoverTaxation` 필드는 항상 `null` / 비활성화 — anchor에도 명시.

### 쟁점 8: 납세의무자 = 증여자
- 양도세 = 증여자(갑) / 증여세 = 수증자(장남). 결과 화면에 **"납세의무자: 증여자"** 라벨 명시 — 수증자가 자기 세금으로 오해할 수 있는 영역.
- 결과 객체에 `taxpayer: "donor"` 메타필드 추가 (Phase 2 증여세 통합 시 `taxpayer: "donee"` 와 분기).

### 쟁점 9 (deferred): 신고기한 — Phase 1 범위 밖
- 부담부증여 양도세 신고기한이 일반 양도(§105①1호 = 양도일 속한 달 말일부터 2개월)와 동일한지, 증여세 신고기한(상증법 §68 = 증여일 속한 달 말일부터 3개월)에 맞춘 별도 특례가 있는지 **법령상 확실치 않음**.
- Phase 1에서는 신고기한 UI 표시·anchor 모두 **deferred**. 디자인 doc에 TODO 박스로 남기고 Phase 2 PR에서 KoreanLaw MCP로 §105·§110·상증법 §68 교차 검증 후 결정.

## Phase 2 연결 — assumedDebtAmount export 필수

Phase 2(증여세 통합)에서 무상분 = 증여재산평가액 − 채무액 = 8,578,295,360 − 4,120,000,000 = **4,458,295,360**을 입력받아 증여세를 계산한다. Phase 1 결과 객체에 다음을 export 필드로 노출하여 Phase 2가 재계산 없이 받아갈 수 있도록 한다:

```ts
interface BurdenedGiftBreakdown {
  assumedDebtAmount: number;          // 4,120,000,000 (양도가액 = 채무인수액)
  sangjeungbeopValuation: {
    supplementary: number;            // 8,578,295,360
    mortgage: number;                 // 4,120,000,000
    rental: number;                   // 2,083,333,333
    selectedMode: "supplementary" | "mortgage" | "rental";
    max: number;                      // 8,578,295,360 (= 증여재산 평가액)
  };
  debtRatio: number;                  // 0.480278051...
  gratuitousPortion: number;          // 4,458,295,360 (= max - assumedDebtAmount, Phase 2 입력)
  taxpayer: "donor";                  // 양도세 납세의무자
}
```

`TransferTaxResult`에 `burdenedGiftBreakdown?: BurdenedGiftBreakdown` 옵셔널 필드 추가.

## 사용자 결정 사항 (Phase 1 scope)

1. **구현 범위 = 양도세만** — 증여세 엔진 호출·통합 결과 화면은 후속 Phase. 본 PR은 양도세 계산만 정확.
2. **평가 모드 = 기준시가 + 시가 둘 다** — 라디오 유형 enum: `"sangjeungbeop_standard"`(상증법 기준시가, 사례 34) / `"sangjeungbeop_market"`(시가, 매매사례·감정·보상·경매·공매가). 사례 34 anchor는 기준시가 모드.
3. **상증법 평가 입력 = 3분리 + Max 자동** — `lendingDepositTotal`(임대보증금) / `annualRentTotal`(연간 임대료) / `mortgageDebtAmount`(담보차입금) 3필드 + 상증법 평가액 자동 산출:
   - 임대평가 = 보증금 + 연간임대료 / 12% (2009.4.23. 이후 / 이전 18%는 v2 후속)
   - 담보평가 = 담보차입금 (사례에서는 (근)저당 설정액과 동치 가정 — 별도 `mortgageSetAmount` 필드 v2 후속)
   - 보충적평가 = 자산별 기준시가 합계 (사용자가 기존 LandPriceLookupField + 건물기준시가 입력)
   - 자동 Max 선택 후 `displayedSangjeungbeopValue` 결과 카드에 표시
   - 채무액(인수) = 보증금 + 담보차입금 (연간임대료는 채무 아님)

## 권장 구현 접근

### 핵심 설계 결정

**A. 신규 enum 1개 vs 기존 enum 확장**
- 양도세 `acquisitionCause` enum에 **`"burdened_gift"` 추가**(취득세와 동일 키). 별도 propertyType 신설하지 않고 기존 `"general_building"` 유지 — 사례 31~33과 같은 안분·환산 로직 90% 재사용.

**B. 부담부증여 입력 객체 — sub-form 신설**
- `AssetForm`에 `burdenedGiftInfo?: BurdenedGiftInfo` 옵셔널 서브객체 추가:
  ```ts
  interface BurdenedGiftInfo {
    valuationMode: "sangjeungbeop_standard" | "sangjeungbeop_market";
    // 인수 채무 (양도가액 산정)
    lendingDepositTotal: number;       // 임대보증금 (채무로 인수)
    mortgageDebtAmount: number;        // 담보차입금 (채무로 인수, 실제 채무잔액)
    // 임대 평가 보조 (Max 비교용)
    annualRentTotal: number;           // 연간임대료 (채무 아님 — 환산평가에만 사용)
    // 담보평가 보조 (선택, v2 본격 분기)
    mortgageSetAmount?: number;        // (근)저당 설정액 — 미입력 시 mortgageDebtAmount fallback
    // 평가액 직접 입력 (시가 모드 — Phase 1에서는 sangjeungbeop_market 분기에서만 사용)
    marketValueAtTransfer?: number;
    marketValueAtAcquisition?: number;
  }
  ```
- 14개 동기화 지점 ⑫(Zod 객체 정의)에 `burdenedGiftInfo` 명시 — 침묵 stripping 차단.

**C. 양도가액 = 채무액 매핑 시점 (소득령 §159)**
- 사용자가 입력한 `transferPrice` 무시. **API 변환 헬퍼**(`lib/calc/transfer-tax-api.ts`)에서 `acquisitionCause === "burdened_gift"`이면:
  - `transferPrice = burdenedGiftInfo.lendingDepositTotal + mortgageDebtAmount` (인수 채무액)
  - 자산-수준 `fixedSalePrice`도 자동 안분값으로 override
- UI에서는 양도가액 필드를 **disabled + 회색 prefilled** 로 표시 — 자동 계산된 채무액을 그대로 보여줘 "이게 채무액으로 잡혔구나"를 한눈에 확인. tooltip: "부담부증여 양도가액 = 인수 채무액(소득령 §159)".

**D. 채무비율 안분 — 신규 헬퍼 분리**
- `lib/tax-engine/burdened-gift-apportionment.ts` 신규 파일(예상 ~180줄):
  - `computeSangjeungbeopValue(buildingStdPrices, landStdPrice, lendingDeposit, annualRent, mortgageDebt)` → `{ supplementary, mortgage, rental, max, mode }`
  - `apportionByDebtRatio(transferStdPriceByAsset, debtAmount, sangjeungbeopMax)` → `{ landTransferPrice, buildingTransferPrice, debtRatio }`
  - `convertAcquisitionByDebtRatio(acquisitionStdPriceByAsset, debtRatio)` → `{ landAcq, buildingAcq }`
- 기존 `general-building-valuation.ts` 분기 분리 — 부담부증여 모드에서는 **§166⑥ 양도가 안분 대신 채무비율 안분** 사용.

**E. 취득가액 처리 — 환산(§114⑦)과 코드 경로 분리**
- 사례 31의 환산식은 부담부증여 채무비율 안분과 수학적으로 동치이나 **법적 근거가 다른 조문**(§114⑦ vs §159). 코드 경로를 통일하지 않고 **분리 유지**.
- `useEstimatedAcquisition = false` 그대로 + 부담부증여 전용 분기에서 `acquisitionPrice_byAsset = stdPriceAtAcq_byAsset × debtRatio` 명시 계산. 감사·유지보수 시 조문 추적 가능.
- 필요경비 = 안분된 자산별 취득가액 × 3% (= 취득당시 자산별 기준시가 × 채무비율 × 3%, 등기·§163⑥). 디자인 doc에 산식 풀어쓰기.

**F. 결과 카드 — 평가액 명세 추가**
- `ResultCard`에 "상증법 평가 명세" 섹션 신설: 보충적·담보·임대 3행 + Max(채택) 행 + 채무비율 한 줄. PDF p.531 ㉠~㉢ 산식 1:1.

### 14개 동기화 지점 — 변경 영향

| # | 위치 | 변경 |
|---|---|---|
| ① 폼 상태 타입 | `lib/stores/calc-wizard-asset.ts:149` | `acquisitionCause`에 `"burdened_gift"` 추가 + `burdenedGiftInfo?` 필드 추가 |
| ② initial value | 동 파일 `INITIAL_ASSET_FORM` | `burdenedGiftInfo: undefined` |
| ③ normalize fallback | `lib/stores/calc-wizard-asset-factory.ts:437` | 부담부증여 모드: M-2 분기 건너뛰기 (gbBuildingAcquisitionCause 복사 안 함). 누락 필드 기본값 처리 |
| ④ API 변환 | `lib/calc/transfer-tax-api.ts` `buildAssetPayload` | 채무액 → `transferPrice` override + 안분 헬퍼 호출. body spread에 `burdenedGiftInfo` 명시(⑬) |
| ⑤ UI 입력 위젯 | `components/calc/transfer/GeneralBuildingAcquisitionCards.tsx` 또는 신규 `BurdenedGiftBlock.tsx` | 4번째 라디오 옵션 "부담부증여(채무인수)" 추가 + 조건부 sub-block (평가모드 라디오 2종 + 3채무 필드 + 양도가액 미리보기 카드) |
| ⑥ 사이드바 합계 | `components/calc/transfer/StepSidebar` | 채무액·증여재산평가액 표시 (선택) |
| ⑦ 결과 카드 산식 | `components/calc/results/transfer/ResultCard*` | 상증법 평가 명세 섹션 신설 + 채무비율·자산별 안분 한국어 풀어쓰기 |
| ⑧ validation | `lib/calc/transfer-tax-validate.ts` | 부담부증여 모드 분기: `burdenedGiftInfo` required 검증 + 채무액>0 + 시가 모드일 때 marketValueAtTransfer 필수 |
| ⑨ Zod enum (메인) | `lib/api/transfer-tax-schema.ts:305` | `acquisitionCause` enum에 `"burdened_gift"` 추가 |
| ⑩ Zod enum (컴패니언) | `lib/api/transfer-tax-schema-sub.ts` | `addPropertyRefines` 헬퍼에서 burdened_gift 분기 |
| ⑪ acquisitionDate fallback | route handler | 부담부증여는 별도 등기접수일 없음 — 기존 `acquisitionDate` 그대로 |
| **⑫ Zod 입력 객체 정의** | `lib/api/transfer-tax-schema.ts` (TypeScript 미감지 영역) | `burdenedGiftInfoSchema = z.object({ ... })` 명시 정의 → 침묵 stripping 차단 |
| **⑬ callTransferTaxAPI body spread** | `lib/calc/transfer-tax-api.ts` (TypeScript 미감지 영역) | fetch body에 `burdenedGiftInfo` 포함 grep 자가 점검 |
| **⑭ Route handler 엔진 input 매핑** | `app/api/calc/transfer/route.ts` | Date 변환 없음(서브객체에 Date 필드 없음). `burdenedGiftInfo` 그대로 엔진 input에 spread |

### 엔진 변경 위치

| 파일 | 변경 |
|---|---|
| `lib/tax-engine/types/transfer.types.ts` | `TransferTaxInput`에 `burdenedGiftInfo?: BurdenedGiftInfo` 추가 |
| `lib/tax-engine/transfer-tax.ts` (681줄, 여유 119줄) | STEP 1 전에 부담부증여 분기: 채무액·채무비율 계산 후 단건 자산-수준 양도가액/취득가액 override. **신규 로직은 burdened-gift-apportionment.ts에 격리** |
| `lib/tax-engine/general-building-valuation.ts` (382줄) | `burdenedGiftInfo` 있으면 §166⑥ 안분 우회 → 채무비율 안분 결과 사용 |
| `lib/tax-engine/burdened-gift-apportionment.ts` | **신규 ~180줄**: 상증법 Max·채무비율 안분·취득가액 환산·개산공제 산출 (순수 함수) |
| `lib/tax-engine/legal-codes/transfer.ts` | `TRANSFER.BURDENED_GIFT.SANGJEUNGBEOP_60` 등 조문 상수 추가 |

### anchor 테스트

- 신규 파일: `__tests__/tax-engine/transfer-tax/general-building-case-34-burdened-gift.test.ts` (~280줄)
- anchor 35~40개 `toBe()` 정확 일치 — 상기 anchor 표 13행 모두 + 자산-수준 (토지·건물) 양도가액/취득가액/필요경비/양도차익/장특공/양도소득금액 분리 검증 + 추가 anchor:
  ```ts
  // 채무비율 정밀도
  expect(result.burdenedGiftBreakdown.debtRatio).toBeCloseTo(0.480278051, 8);
  // 상증법 평가 Max 선택
  expect(result.burdenedGiftBreakdown.sangjeungbeopValuation.selectedMode).toBe("supplementary");
  expect(result.burdenedGiftBreakdown.sangjeungbeopValuation.supplementary).toBe(8_578_295_360);
  expect(result.burdenedGiftBreakdown.sangjeungbeopValuation.mortgage).toBe(4_120_000_000);
  expect(result.burdenedGiftBreakdown.sangjeungbeopValuation.rental).toBe(2_083_333_333);
  expect(result.burdenedGiftBreakdown.sangjeungbeopValuation.max).toBe(8_578_295_360);
  // 인수 채무액 export (Phase 2 입력 보호)
  expect(result.burdenedGiftBreakdown.assumedDebtAmount).toBe(4_120_000_000);
  expect(result.burdenedGiftBreakdown.gratuitousPortion).toBe(4_458_295_360);
  // 납세의무자
  expect(result.burdenedGiftBreakdown.taxpayer).toBe("donor");
  // 보유기간·장특공률 (장특공 검증 보조 — 증여자 당초 취득일 기준)
  expect(result.holdingPeriod.years).toBe(24);
  expect(result.longTermDeductionRate).toBe(0.30);
  // 이월과세 미적용 보장
  expect(result.carryoverTaxation).toBeNull();
  ```
- 회귀 가드: 사례 31·32·33 anchor 전수 재실행 (예상 938+ 통과 회귀 0)
- §55 누진세율표 자가검증: `1,791,143,367 × 0.45 − 65,940,000 = 740,074,515.15 → 740,074,515` 정확 계산(외부 자료 추종 금지 — feedback_transfer_year_tax_rate)
- ⚠️ **누진공제 절사 위치 통일**: 곱셈 중간 절사 금지. 실무 표준 = 과세표준 × 세율 → 누진공제 차감 → 마지막 1회 원 미만 절사. 사례 34는 우연히 동일하지만 일반 케이스에서 1원 차이 anchor 실패 위험.
  ```ts
  // 올바른 산식 (마지막 1회 절사)
  const calculated = taxBase * rate - progressiveDeduction;
  const calculatedTax = Math.floor(calculated);  // 740,074,515

  // 금지 패턴
  // const wrong = Math.floor(taxBase * rate) - progressiveDeduction;  // ❌ 곱셈 중간 절사
  ```
  지방세도 동일 정책: `Math.floor(calculatedTax * 0.10)` 마지막 1회 절사.
- **신고기한 anchor 제외** — 쟁점 9(deferred)에 따라 Phase 1에서 검증하지 않음.

### 시가 모드 (확장)

사례 34 외 시가 모드 anchor는 본 Phase 1 범위 밖이지만, 타입·UI·validate는 시가 입력을 받을 수 있도록 사전 준비:
- 시가 모드: `marketValueAtTransfer` / `marketValueAtAcquisition` 직접 입력
- 채무비율은 동일 산식 (채무액 / 시가 평가액)
- 자산 안분: 자산별 시가 평가액 분리 입력 필요 → v2에서 자산-수준 cardly 보강

### 800줄 정책 — 사전 분할 골격

- `transfer-tax.ts` 681줄: +50줄 여유 (부담부증여 분기). 800줄 초과 위험 없음.
- `general-building-valuation.ts` 382줄: +50줄 (조건 분기). 여유.
- 신규 `burdened-gift-apportionment.ts` 180줄 — 별도 모듈로 격리.
- `transfer-tax-validate.ts` 776줄(임계): **+25줄 시 도메인 분할 선행 트리거** (메모리 `feedback_validate_split_signal.md`). 부담부증여 검증은 ~30줄 예상 → **선행 분할 PR 필요**. 본 PR 직전에 분할 PR을 별도로 진행하거나, 본 PR에서 부담부증여 검증만 `transfer-tax-validate-burdened-gift.ts` 신규 모듈로 분리.

### 자가 점검 체크리스트 (PR 직전)

- [ ] 케이스 매트릭스: 평가모드(기준시가/시가) × 자산종류(일반건물 ✓ / 단일주택 ❌ Phase 1 제외) → 매트릭스 표 행 ≥ 모든 분기
- [ ] anchor 30+ 작성 + 사례 31·32·33 회귀 0
- [ ] 14개 동기화 지점 grep 자가 점검 (⑫⑬⑭ TypeScript 미감지 영역)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/` 전체 통과
- [ ] 브라우저 수동: 폼 입력 → Network 탭 request body에 `burdenedGiftInfo` 포함 확인 → 결과 산출세액 740,074,515 일치

## Critical Files

### 수정
- `lib/tax-engine/types/transfer.types.ts` (TransferTaxInput + BurdenedGiftInfo 타입)
- `lib/tax-engine/transfer-tax.ts:681줄` (분기 진입 ~50줄)
- `lib/tax-engine/general-building-valuation.ts` (안분 우회 조건 ~30줄)
- `lib/api/transfer-tax-schema.ts:305` (enum + Zod 객체)
- `lib/api/transfer-tax-schema-sub.ts` (refine)
- `lib/calc/transfer-tax-api.ts` (channels)
- `lib/calc/transfer-tax-validate.ts` (또는 분할 후 `-validate-burdened-gift.ts`)
- `lib/stores/calc-wizard-asset.ts:149` (enum + 필드)
- `lib/stores/calc-wizard-asset-factory.ts:437` (normalize)
- `app/api/calc/transfer/route.ts` (handler input spread)
- `components/calc/transfer/GeneralBuildingAcquisitionCards.tsx` (라디오 옵션)
- `components/calc/results/transfer/ResultCard*` (평가 명세 섹션)

### 신규
- `lib/tax-engine/burdened-gift-apportionment.ts` (~180줄)
- `lib/tax-engine/legal-codes/burdened-gift.ts` (조문 상수)
- `components/calc/transfer/BurdenedGiftBlock.tsx` (sub-form, ~250줄)
- `__tests__/tax-engine/transfer-tax/general-building-case-34-burdened-gift.test.ts` (~250줄)
- `docs/02-design/features/transfer-tax-burdened-gift.engine.design.md` (디자인 doc — 케이스 매트릭스 표 필수)

### 재사용 (변경 없음)
- `lib/tax-engine/bundled-sale-apportionment.ts` (참고만 — 부담부증여는 별도 안분 헬퍼 사용)
- `lib/tax-engine/transfer-tax-helpers.ts` (개산공제 헬퍼 재사용)
- `lib/tax-engine/transfer-tax-finalize.ts` (STEP 7.5~12 통합)
- `components/calc/results/transfer/FilingFormTable.tsx` (자동 컬럼 도출 — 부담부증여 자동 지원)
- `components/inputs/LandPriceLookupField.tsx` (공시지가 입력 — 기존 패턴 그대로)

## Verification

1. **단위 테스트**:
   ```bash
   npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-34-burdened-gift.test.ts
   npx vitest run __tests__/tax-engine/transfer-tax/  # 사례 31·32·33 회귀 0
   ```
2. **타입 체크**: `npm run typecheck`
3. **브라우저 E2E (수동)**:
   - `npm run dev` → `/calc/transfer` 진입
   - 자산종류: 일반건물, 취득원인 라디오: "부담부증여" 선택
   - 사례 34 입력값 그대로 (취득일 1998-09-07, 양도일 2023-02-19, 임대보증금 10억, 담보차입금 31.2억, 연간임대료 1.3억, 토지면적 1,279, 공시지가 6,215,000(2022)/2,130,000(1998), 건물 보충적평가 629,310,360 분할)
   - 평가모드 라디오: "상증법 기준시가"
   - 계산 → 결과 화면 산출세액 **740,074,515** / 지방세 **74,007,451** 확인
   - 결과 카드 "상증법 평가 명세" 섹션: 보충적 8,578,295,360 / 담보 4,120,000,000 / 임대 2,083,333,333 / Max → 보충적 채택 / 채무비율 48.03% 표시 확인
   - Network 탭: POST `/api/calc/transfer` request body에 `burdenedGiftInfo: {...}` 포함 확인
4. **회귀**: `npm run check:pre-pr` (typecheck + lint + test 일괄)
5. **14지점 sync-checker**: `Agent ui-engine-sync-checker` 호출 → 0 누락 확인 (⑫⑬⑭ 강조)
6. **법령 인용 검증**: `npm run verify:legal` (조문 상수 상증법 §60, 시행령 §49·§61 추가 시)

## 후속 PR (Phase 2+)

- **Phase 2**: 증여세 통합 — `gift-tax.ts` 엔진 호출 후 결과 화면에 양도세+증여세 합계 표시. 무상분 = 증여재산평가액 − 채무액. 증여재산공제(직계비속 5천만)·누진세율(50%, 누진공제 4.6억)·신고세액공제(3%) 자동. 사례 34 anchor 자진납부세액 1,691,823,250 검증.
- **Phase 3**: 부담부증여 단독 마법사 / 합산 신고서 (양도세+증여세 통합 PDF).
- **v2 확장**: 2009.4.23. 이전 임대평가 환산률 18%, 담보 (근)저당 설정액 ≠ 채무액 케이스, 시가 모드 자산별 평가액 분리 입력, 일반건물 외 propertyType(단일주택·상업용건물·오피스텔) 부담부증여 지원.

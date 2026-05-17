# 주식 양도소득세(Stock Transfer Tax) — UI 설계

> **출처 엔진 디자인**: `stock-transfer-tax.engine.design.md` (input 60+ 필드, result 25+ 필드)
> **참고 패턴**: 양도세 부동산 마법사 4단계 + 자산-수준 카드 분리

## 사용자 시나리오 (28개 — 케이스 인벤토리 1:1 매핑, 10차 정정)

| # | 시나리오 | 진입 경로 | 결과 강조 (★ 9차 본칙 anchor) |
|---|---|---|---|
| 1 | 사례 48 — 코스닥 대주주, 취득 후 상장, 환산취득가 | 코스닥/대주주/중소기업 + 1년 이상 / 환산 + 취득 후 상장 ON + 3시점 / 개산공제 | ★ 본칙 산출세액 **2,567,760** (PDF 2,372,760은 alternative) |
| 2 | 사례 49 — 비상장 + 부동산·채무·현금 교환 + 장부분실 | 비상장 / 교환 3개 합계 + 액면가 + 평가 보충 + 80% 하한 | ★ 본칙 환산취득가 **468,750,000** (PDF 2,343,750,000 alternative) + 80% 하한 발동 배지 |
| 3 | 코스피 비대주주 장내거래 | 코스피/비대주주/장내 | 비과세 (`isExempt=true`) |
| 4 | 코스피 비대주주 장외거래 | 비대주주/장외 토글 | 비중소 20% 단일 (§94①3 가목 2 + §104①11 나목) |
| 5 | 코스피 대주주 보유 1년 미만 + 비중소기업·중견기업 (공통) | 단기 자동 표시 | 30% 단일 (`단기30%` 배지) |
| 6 | 코스피·코스닥·비상장 대주주 1년 이상 + 과세표준 4억 | 대주주 + 4억 입력 | 누진 산식 분해 (3억×20% + 1억×25% = 8,500만) |
| 7 | 코스닥 대주주 시총 50억 임계 (2024.1.1.~) | 시총 49.9억/50억/50.1억 경계값 | 50억 경계 판정 |
| 8 | 코넥스 대주주 (4% 또는 50억) | 코넥스 + 임계 | §104①11 가목 통합 적용 |
| 9 | K-OTC 거래 + 벤처기업 + 비대주주 | K-OTC ON + 벤처 + 비대주주 | 비과세 (조특법 §14①7호) `KOTC벤처비과세` 배지 |
| 10 | 기타자산 §94①4 다목 — 과점주주 (자산 50% + 지분 50% 초과 + 50% 이상 양도) | 과점주주 체크 | §55 누진 8단계 |
| 11 | 기타자산 §94①4 라목 — 부동산과다보유법인 (자산 80% + 골프장) | 라목 체크 | §55 누진 8단계 |
| 12 | §94② 우선순위 — §94①3 (상장·비상장) + §94①4 다·라목 동시 | 동시 충족 | `§94②우선` 배지 + 기본공제 부동산 그룹 합산 |
| 13 | 비상장 부동산과다보유 (자산 50% — §165⑤ 가중치 반전) | 50% 토글 | 순손익 2/5 + 순자산 3/5 분해 |
| 14 | 순자산 단독 평가 4가지 사유 (§165④3 가/나/다/라) | 사유 라디오 | 순자산만 + `80%하한미적용` 배지 |
| 15 | 80% 하한 발동 (사례 49) | 평가 < 순자산 80% | max(가중평균, 순자산×80%) 분해 |
| 16 | K-OTC + 중소·중견 소액주주 비과세 | K-OTC ON + 중소/중견 + 소액 | 비과세 (§94①3 나목 단서) `KOTC중소중견비과세` 배지 |
| 17 | 사례 9와 동일 (벤처 K-OTC) — 통합 |  — | 9와 통합 |
| 18 | 양도 후 거래정지·관리종목 | tradingHaltAtTransfer 토글 | 비상장 보충 평가 우회 (`거래정지우회` 배지) |
| 19 | 시기별 평가 연혁 5분기 (1998↓·1999~·2001~·2004~·2007.2.28~) | 평가기준일 시기 | 연혁별 산식 |
| 20 | 대주주 임계 시기별 8건 (2017·2018.4.1.·2020.4.1.·2024.1.1. × 2시장) | 양도일 시기 | 시기별 50억/15억/10억 자동 적용 |
| 21 | 외국법인 발행/해외상장 주식 | marketType 5번째 옵션 (disabled) | validate 차단 + 별도 도메인 안내 |
| 22 | 상속 받은 주식 단기 30% — 피상속인 취득일 기산 | acquisitionCause=inheritance + decedentAcquisitionDate | 피상속인 취득일 → 양도일 |
| 23 | 증여 받은 주식 단기 30% — 수증일 기산 (§97의2 미적용) | acquisitionCause=gift | 수증일 → 양도일 |
| 24 | 합병·분할 신주 단기 30% — 종전 주식 취득일 | acquisitionCause=merger_split | 종전 주식일 기산 |
| 25 | 부정행위 과소신고 40% (§47의2②1) | isFraudulent ON | 40% 가산세 |
| 26 | 국제거래 부정 60% (§47의2②1 단서) | isInternationalTransaction ON | 60% 가산세 |
| 27 | 순자산 단독 평가 시 80% 하한 미적용 (14와 분리) | net_asset_only + 미적용 | `80%하한미적용` 배지 |
| 28 | 의제취득일 1986.1.1. (1985.12.31. 이전 취득) | acquisitionDate < 1986-01-01 | `의제취득일적용` 배지 + 자동 1986-01-01 변환 |

## 마법사 구조 (4 step)

```
Step 1 — 자산·시장·대주주
  ├── MarketTypeBlock         (코스피·코스닥·코넥스·비상장·기타자산 + **외국법인/해외상장 5번째 옵션 disabled**)
  ├── VentureToggle           (벤처기업 — 조특법 §14①7호 K-OTC 비대주주 비과세 분기. 6차 정정: 시총 40억은 §157에 없음)
  ├── KOTCToggle              (K-OTC 거래 — §94①3 나목 단서 + 조특법 §14①7호)
  ├── CompanyTypeBlock        (중소기업·중견기업·일반)
  ├── MajorShareholderBlock   (★ 8차 2-step 판정)
  │     ├── PriorYearEndDateInput
  │     ├── selfShareRatio (본인 단독 지분율)
  │     ├── selfMarketCap (본인 단독 시총)
  │     ├── isLargestShareholderGroup 토글 (본인+특수관계인 합산이 최대인지)
  │     ├── combinedShareRatio (합산 지분율 — 토글 ON 시)
  │     ├── combinedMarketCap (합산 시총 — 토글 ON 시)
  │     └── 시기별 임계 helper 카드 (2024.1.1.~ **모든 시장 50억 통일** — 6차 정정 반영)
  ├── OtherAssetBlock         (§94①4 다목·라목 체크 — 자산 50%/80% 안내. 다목 = 과점주주, 라목 = 부동산과다보유)
  ├── AcquisitionCauseBlock   (★ 단기 30% 기산점 분기 — 매매/상속/증여/합병·분할 라디오)
  │     ├── decedentAcquisitionDate (상속 시)
  │     ├── donorAcquisitionDate (증여 시)
  │     └── preMergerAcquisitionDate (합병·분할 시)
  ├── AcquisitionDateField
  ├── TransferDateField
  └── ShareCountField + TotalIssuedSharesField

Step 2 — 양도가액·취득가액
  ├── TransferPriceModeBlock  (실가 / 교환 라디오)
  │     ├── ActualPriceBlock  (per share × shareCount)
  │     └── ExchangePriceBlock (부동산 + 채무면제 + 현금 3입력 + 합계 미리보기)
  ├── AcquisitionModeBlock    (실가·매매사례·감정·환산·액면가 라디오)
  │     ├── ActualAcquisitionBlock
  │     ├── EstimatedListedBlock     (1개월 종가평균)
  │     │     └── PostListingValuationCard (취득 후 상장 토글 + 3시점 평가)
  │     ├── EstimatedUnlistedBlock   (보충 평가 — 순손익·순자산 입력)
  │     │     ├── 부동산과다보유 50% 토글 → 가중치 반전 미리보기
  │     │     ├── 순자산 단독 평가 사유 라디오 (**4가지 — §165④3 가/나/다/라목**)
  │     │     │     · 가: 청산절차 진행 / 사업자 사망 (사업계속 곤란)
  │     │     │     · 나: 사업개시 전 / 1년 미만 / 휴·폐업
  │     │     │     · 다: 자산총액 중 주식가액 80% 이상 (지주회사형)
  │     │     │     · 라: 정관상 잔여 존속기한 3년 이내
  │     │     │     · (해당없음): 가중평균 본칙 적용
  │     │     └── 80% 하한 자동 발동 배지
  │     └── FaceValueBlock     (장부분실 + 액면가)
  └── (취득 모드별 안내 카드 — violet/fuchsia tone)

Step 3 — 필요경비·공제·신고
  ├── ExpenseModeBlock        (실가 / 개산공제 라디오)
  │     ├── ActualExpensesBlock (증권거래세·매매수수료·계약서·공증·인지·소개·명도비 — §163⑤1호 가~라목)
  │     │     └── SecuritiesTransactionTaxCard (★ 시장별 자동 산정 미리보기 — 코스피·코스닥 0.15% / 코넥스 0.10% / 비상장 0.35%)
  │     └── EstimatedDeductionBlock (취득기준시가 × 1% — §163⑥4호)
  ├── BasicDeductionGroupBlock (★ §103② 그룹 — §94② 발동 시 부동산 그룹 합산 입력)
  │     └── realEstateGroupBasicDeductionUsed (같은 해 부동산 양도 시 사용 기본공제, 잔여 250만 한도)
  ├── LossCarryoverBlock      (★ PR-3 disabled placeholder — 다른 주식 자산 양도손실 통산)
  ├── FilingTypeBlock         (예정 / 확정 / 수정 라디오)
  │     └── ★ §105①2호 helper — 양도일 → 반기 말일 + 2개월 자동 (KoreanLaw 9차 확정)
  ├── PenaltyBlock            (★ 가산세 분기 — `isFraudulent`·`isInternationalTransaction` 토글, 10/40/60% 분기)
  └── ElectronicFilingToggle  (전자신고 2만원 공제 — §52의2)

Step 4 — 결과
  ├── StockResultView
  │     ├── 분류 배지 (★ 8차 6종 enum — ①3가1)·①3가2)·①3나_본문·①3나_단서·①4다·①4라)
  │     ├── 비과세 결과 카드 (`isExempt=true` 시 — `exemptReason` 3종: kotc_sme_mid·kotc_venture·non_major_in_market)
  │     ├── 8항목 결과: 양도가액 / 취득가액 / 필요경비 / 양도소득금액 / 기본공제 / 과세표준 / 산출세액 / 지방소득세
  │     ├── 환산 모드 시 산식 분해 카드 (위 §결과 산식 풀어쓰기 4종 예시 적용)
  │     ├── 누진세율 적용 시 분해 (3억 이하 20% + 3억 초과 25% — 누진공제 1,500만)
  │     ├── 절사 단위 표시 (산출세액 10원·지방세 10원·과세표준 1원 — 국고금 §47)
  │     └── appliedRules 12종 안내 배지 (rose/fuchsia/amber/emerald/sky tone 매핑)
  ├── PrRoadmapCard            (★ PR-1·2·3·후속 4단계 진행 상태 + 케이스 매핑)
  └── 다음 단계 버튼 (PDF 출력·새 계산·이력 저장)
```

## 14개 동기화 지점 매핑

| 지점 | 파일·함수 | 핵심 필드 |
|---|---|---|
| ① 폼 상태 | `lib/stores/calc-wizard-asset-stock.ts` `StockAssetForm` | 60+ 필드 (input과 1:1) |
| ② initial | `createStockAssetInitial()` (위 파일 내) | 토글 OFF·라디오 첫 옵션·빈 문자열 기본 |
| ③ normalize | `lib/calc/stock-transfer-tax-api-helpers.ts` `normalizeStockInput()` | 빈 문자열 → undefined / Date 변환 / 통화 정수화 |
| ④ API 변환 | `lib/calc/stock-transfer-tax-api.ts` `callStockTransferTaxAPI()` | body builder (POST `/api/calc/stock-transfer`) |
| ⑤ UI 위젯 | `components/calc/stock-transfer/*.tsx` (위 마법사 구조) | RadioCardGroup·ToggleCard·CurrencyInput·DateInput·DecimalInput |
| ⑥ 사이드바 합계 | `components/calc/StockSidebar.tsx` | 8항목 (양도가·취득가·필요경비·양도소득금액·기본공제·과세표준·산출세액·지방세, 0원 제외) |
| ⑦ 결과 카드 | `components/calc/results/StockTransferTaxResultView.tsx` | 한국어 풀어쓰기 산식 (변수 약어·floor 금지) |
| ⑧ validation | `lib/calc/stock-transfer-tax-validate.ts` | UI/API fallback과 동일 (3중 패턴) |
| ⑨ Zod enum 메인 | `lib/api/stock-transfer-tax-schema.ts` (8차 enum 갱신): `marketType` (10종) / `acquisitionMode` (5종) / `transferPriceMode` / `netAssetOnlyReason` (4종) / `acquisitionCause` (4종) / `filingType` / `exemptReason` (3종) | discriminatedUnion |
| ⑩ Zod 컴패니언 | PR-1·PR-2 생략, **PR-3 다자산 시** `addStockRefines` 추가 | — |
| ⑪ acquisitionDate fallback | `app/api/calc/stock-transfer/route.ts` | `body.acquisitionDate || asset.acquisitionDate` |
| ⑫ Zod 입력 객체 정의 | `stockTransferInputSchema` (모든 필드 명시) | 60+ 필드 |
| ⑬ body spread | `callStockTransferTaxAPI` body builder | 자산-수준 전 필드 spread |
| ⑭ Route handler 엔진 매핑 | `route.ts` `coerceDates(input, [...])` | 모든 Date 필드 변환 |

## 3중 패턴 (mirror-pattern) 적용 필드 — 10차 6차·8차 추가 반영

| UI fallback | API fallback | validate fallback |
|---|---|---|
| `acquisitionMode || "actual"` | 동일 | 동일 (라디오 기본값) |
| `transferPriceMode || "actual"` | 동일 | 동일 |
| `acquisitionCause || "purchase"` | 동일 | 동일 (8차 추가) |
| `filingType || "preliminary"` | 동일 | 동일 |
| `acquiredBeforeListing ?? false` | 동일 | 동일 |
| `tradingHaltAtTransfer ?? false` | 동일 | 동일 |
| `isVentureCompany ?? false` | 동일 | 동일 |
| `isKOTCTrading ?? false` | 동일 | 동일 (6차 추가) |
| `isLargestShareholderGroup ?? false` | 동일 | 동일 (8차 추가) |
| `bookLost ?? false` | 동일 | 동일 |
| `isElectronicFiling ?? false` | 동일 | 동일 |
| `isFraudulent ?? false` | 동일 | 동일 (6차 추가) |
| `isInternationalTransaction ?? false` | 동일 | 동일 (6차 추가) |
| `realEstateGroupBasicDeductionUsed ?? 0` | 동일 | 동일 (6차 추가) |

## Validation 규칙 (8th 지점) — 10차 8차 추가 6건 반영

### 기본 (5차까지)
- `marketType === "other_asset"` → `isQualifyingBlockShareholder` OR `isHeavyRealEstateForRate` 둘 중 하나 true 필수
- `acquisitionMode === "estimated"`:
  - 상장: `transferDatePriceAvg1Month` 필수, 취득 후 상장 토글 ON 시 `listingDatePriceAvg1Month`·`listingDate`·`acquisitionYear*` 모두 필수
  - 비상장: `transferYearNetIncomePerShare`·`transferYearNetAssetPerShare` 필수
- `acquisitionMode === "face_value"` → `bookLost: true` AND `faceValuePerShare` 필수
- `transferPriceMode === "exchange"` → 3개 중 1개 이상 양수
- `isMajorShareholder=true` 인데 `selfShareRatio=0 && selfMarketCap=0 && combinedShareRatio=0 && combinedMarketCap=0` → 오류
- 자동 안분 fallback 금지 (`feedback_no_silent_apportion_fallback`)

### 8차 추가 6건
- `acquisitionMode === "sale_case"` AND `marketType ∈ {kospi, kosdaq, konex}` → 오류 (매매사례가액은 비상장만)
- `marketType === "out_of_scope_foreign"` → 오류 (해외주식은 별도 도메인)
- `acquisitionMode === "face_value"` ↔ `bookLost: true` 둘 중 하나 단독 입력 금지
- `expenseMode === "estimated"` AND `acquisitionMode ∉ {estimated, face_value}` → 경고 (개산공제는 환산·액면가 모드 권장)
- `transferDate < acquisitionDate` → 오류 (음수 보유기간)
- `cumulativeTransferRatio > 1` → 오류 (3년 양도 누적 비율 100% 초과 불가)
- 단기 30% 기산점 분기 검증:
  - `acquisitionCause === "inheritance"` → `decedentAcquisitionDate` 필수
  - `acquisitionCause === "merger_split"` → `preMergerAcquisitionDate` 필수

## 토글·라디오 컴포넌트

- 모든 boolean → `ToggleCard` (OFF도 tone 유지)
- 모든 enum → `RadioCardGroup` (5개 옵션 이상은 가로 grid, 미만은 vertical stack)
- 날짜 → `DateInput` (type="date" 금지 — `feedback_date_input`)
- 통화 → `CurrencyInput` (select-on-focus 내장)
- 면적/주식수/지분율 → `DecimalInput` (parseDecimal)

## 안내 카드 (tone)

| tone | 용도 |
|---|---|
| sky | Step 1 시장·대주주 정보 |
| emerald | Step 2 실가 모드 |
| amber | Step 2 환산 모드 (취득 후 상장 등) |
| violet | 사례 48 취득 후 상장 안내 (환산식 설명 + Pre-Do 산식 미확정 시 placeholder 메시지) |
| fuchsia | 사례 49 비상장 보충 평가 (80% 하한 발동 시 강조) |
| rose | 단기보유 30% / §94② 우선 / 거래정지 우회 등 특수 분기 |

---

## 1차 검증 누락 보강 (UI 디자인)

### 시점별 대주주 임계 자동 적용
- `MajorShareholderBlock` 내부에서 `priorYearEndDate` 입력값으로 시기별 임계 매트릭스 lookup
- 시기 시점 안내 카드: "직전 사업연도 종료일 기준 2024.1.1. 이후 → 시총 50억 / 벤처 40억"
- 시기 변경 시 임계값·판정 결과 useMemo로 자동 재계산 (useEffect 미러링 금지)

### 매매사례·감정가액 모드 UI (Step 2)
- `acquisitionMode = "sale_case"`: 비상장만 활성화 — 상장 선택 시 모드 자체 비활성 + 안내 카드 "상장주식은 매매사례가액 미적용 (PDF 출처)"
- `acquisitionMode = "appraisal"`: PR-2까지 UI 비활성 placeholder
- 두 모드 모두 외부 가격 직접 입력 + 산출 근거 메모 필드(자유 텍스트, 결과 PDF에 출력)

### Step 4 결과 화면 — 신고서 양식 자리표시
- PR-3 다자산 신고서 양식 출력 자리에 sky tone placeholder "PR-3에서 신고서 양식 출력 추가 예정" 카드
- 단건 결과는 부동산 패턴 차용한 `StockFilingFormTable` (`aggregate` prop 단건 모드)

### 모바일 반응형
- Step별 input grid: `grid-cols-1 md:grid-cols-2` (부동산 마법사 동일)
- 사이드바: `lg:` 이상에서만 표시, 모바일은 Step 상단 fixed bar로 합계 표시
- RadioCardGroup: 4개 미만 → 모바일 vertical, 4개 이상 → `grid-cols-2`

### 결과 PDF 다운로드
- `lib/pdf/stock-transfer-pdf.ts` 신설 (PR-2까지) — 부동산 `transfer-tax-pdf.ts` 패턴 차용
- 단건 모드: 사례 48·49 결과 1페이지
- 다자산 모드 (PR-3): 합계 + 종목별 별지

### 환산 모드 미리보기 카드 (Step 2)
- `EstimatedListedBlock` / `EstimatedUnlistedBlock` 입력 직후 violet/fuchsia 카드로 산출 미리보기:
  - 상장: 환산취득가 = 1개월 종가평균 × 주식수 (취득 후 상장 시 비율 보정 산식 분해)
  - 비상장: 1주당 평가 분해 + 80% 하한 발동 여부 표시
- useMemo 순수 함수 — store 미러링 금지

### 자산 수준 카드 분리 (부동산 패턴 차용)
- `StockAssetBlock.tsx` — 자산 1건 입력 일체를 카드로 감쌈 (사례 48 + 사례 49 동시 신고 대비, PR-3 다자산 확장 가능 구조)
- `RedevelopmentBlock`/`GeneralBuildingBlock` 동일 격리 원칙

---

## 6차 검토자 UI 누락 보강 (6건)

### #1 — 증권거래세 시장별 미리보기 카드 (Step 3)
- `ActualExpensesBlock` 내부에 `SecuritiesTransactionTaxCard` 추가
- 시장별 자동 산정: 양도가액 × {코스피 0.15% / 코스닥 0.15% / 코넥스 0.10% / 비상장 0.35%}
- "필요경비 가산 후보" 안내 (실가 모드 시 actualExpenses에 합산 권장)
- useMemo 순수 계산 — store 미러링 금지

### #2 — 이월결손금 입력 placeholder (Step 3)
- `LossCarryoverBlock` 신설 (PR-3까지 disabled)
- "다른 주식 자산 양도손실 통산은 PR-3 다자산 합산신고에서 지원 예정" sky tone 카드
- 단건 마법사에서는 입력 자리만 확보 (UI 비활성)

### #3 — 외화·해외주식 분기 진입로 (Step 1)
- `MarketTypeBlock` 라디오에 "외국법인 발행/해외상장 주식" 5번째 옵션 (disabled)
- 선택 시 안내: "해외주식 양도세는 별도 도메인 (22% 단일 + 250만원 공제, §94①3 다목)" + 별도 도메인 진입 링크 placeholder
- 케이스 #21 (validate 차단)과 연동

### #4 — 대주주 가족 합산 보조 입력 (`MajorShareholderBlock`)
- 시행령 §157①·② "특수관계인 합산" 명시 — **2-step 판정**:
  1. **본인 단독 임계 충족 여부** (지분율·시총)
  2. 본인 미달 시 → **본인이 최대주주(또는 그 합산이 최대) 판정 토글** + **합산 지분율·시총** 입력
- 입력 필드 분리:
  - `selfShareRatio` (본인 지분율)
  - `selfMarketCap` (본인 단독 시총)
  - `isLargestShareholderGroup` (본인+특수관계인 지분 합산이 최대인지 토글)
  - `combinedShareRatio` (합산 지분율 — `isLargestShareholderGroup=true` 일 때만 활성)
  - `combinedMarketCap` (합산 시총 — 동일)
- 미리보기 카드: "본인 X% / 합산 Y% / 시장 임계 Z% — 대주주 판정: ✓/✗ (근거: §157①1 본문 / 단서)"
- 자동 OR 판정 useMemo

### #5 — 신고기한 helper (Step 3 `FilingTypeBlock`) — KoreanLaw §105 정확 확정
- 양도일 입력값 기반 자동 계산:
  - **주식 예정신고**: 양도일 속하는 **반기 말일 + 2개월** (소득세법 §105①2호 — KoreanLaw 정확 인용 확정)
    · 부동산은 §105①1호 "달의 말일 + 2개월"이지만 주식은 반기 단위 (별도 조문)
  - **확정신고**: 양도일 다음해 **5.1 ~ 5.31** (소득세법 §110)
- 안내 카드 산식 분해:
  - "양도일 2023-02-26 → 상반기 (1.1~6.30) → 반기 말일 2023-06-30 → +2개월 = 2023-08-31 예정신고 기한"
- 기한 임박 시 amber tone 경고
- ✅ **§105 조문 KoreanLaw 확정 완료** — 8차 "확인 필요" 표기 제거

### #6 — PR 단계별 게이트 시각화 (Step 4 통합)
- 분산된 PR placeholder 카드를 단일 `PrRoadmapCard`로 통합
- 4단계 진행 상태 표시:
  - PR-1: 상장 대주주·취득 후 상장 (현재)
  - PR-2: 비상장·평가·시기별 연혁
  - PR-3: 다자산·가산세·신고서·증권거래세
  - 후속: §97의2·국외전출세·해외주식
- 각 단계별 케이스 인벤토리 매핑 (#1·#3~9·#12·#18·#20·#22~28 → PR-1 등)

---

## 2차 검증 추가 보강 (메모리 정책 + 결과 화면)

### 결과 화면 안내 배지 (`appliedRules` 표시)
- engine result `appliedRules: Array<...>` enum 6종을 `StockTransferTaxResultView` 상단 배지로 표시
- 발동 시 색상: `§94②우선` rose / `80%하한` fuchsia / `단기30%` rose / `거래정지우회` amber / `KOTC비과세` emerald / `벤처소액비과세` emerald

### 메모리 정책 명시적 적용
| 정책 | UI 적용 |
|---|---|
| `feedback_no_won_suffix` | 결과 화면·사이드바·PDF 숫자 끝 "원" 미사용 |
| `feedback_law_article_link` | `LawArticleModal` + `/api/law/article` — §94·§99·§104·§165 링크 (FieldCard `trailing` 배지) |
| `feedback_zustand_selector` | `useShallow` + atomic selector — 사이드바 8항목 새 객체 생성 시 무한 루프 차단 |
| `feedback_select_on_focus` | 모든 input `onFocus={(e)=>e.target.select()}` (CurrencyInput·DateInput 내장) |
| `feedback_wizard_navigation` | 모든 Step 뒤로+다음 필수, 1단계 뒤로=홈 |
| `feedback_decimal_input` | `shareCount`/`totalIssuedShares`/`shareRatio` → `DecimalInput` + `parseDecimal` |
| `feedback_section_card_numbering` | Step 카드 sky/emerald/amber/violet/rose 5색 + 원형 섹션 번호 |
| `feedback_ui_order_follows_logic` | Step 1=시장→대주주→기타자산, Step 2=양도가→취득가(모드 토글 영향 필드 직전), Step 3=비용→공제→신고 |

### Step 2 — per share × shareCount 표시
- 실가 모드 1주당 양도가 입력 시 즉시 `(perShare × shareCount = total)` 미리보기 카드
- 환산 모드 1주당 평가가액 분해 카드 (위 1차 검증 보강 항목과 연동)

### Step 4 — 결과 산식 한국어 풀어쓰기 (변수 약어·floor 금지)
```
[ 잘못된 예시 - 사용 금지 ]
산출세액 = floor(taxBase × 0.20) = 2,372,760

[ 올바른 예시 ]
산출세액 = 과세표준 11,863,800 × 20% = 2,372,760

[ 누진세율 분해 예시 — 케이스 6 ]
3억원 이하분: 3억 × 20% = 60,000,000
3억원 초과분: (4억 − 3억) × 25% = 25,000,000
산출세액 합계: 85,000,000
(누진공제식: 4억 × 25% − 누진공제 15,000,000 = 85,000,000)

[ 환산취득가 분해 예시 — 사례 48 본칙 ]
상장일 직전 1주당 평가 = 61,570 × 3/5 + 5,352 × 2/5 = 39,083
취득일 직전 1주당 평가 = 44,520 × 3/5 + 4,348 × 2/5 = 28,451
환산비율 = 28,451 / 39,083 = 0.7280
1주당 취득기준시가 = 8,001 × 0.7280 = 5,824
취득가액 = 5,824 × 5,000주 = 29,120,000

[ 80% 하한 분해 예시 — 사례 49 ]
가중평균 1주당 평가 = 30,000 × 3/5 + 200,000 × 2/5 = 98,000
순자산가치 80% = 200,000 × 80% = 160,000
1주당 평가가액 = max(98,000, 160,000) = 160,000 (80% 하한 발동)
양도기준시가 = 160,000 × 8,000주 = 1,280,000,000
```

### LawArticleModal 적용 위치 (FieldCard trailing 배지)
- `MarketTypeBlock` → §94①3 가목/나목
- `OtherAssetBlock` → §94①4 다목/라목 + §94②
- `MajorShareholderBlock` → 시행령 §157
- `EstimatedUnlistedBlock` → 시행령 §165④1 (본칙 단서에 80% 하한 직접 명시 — 상증령 §54④ 준용 아님, 부동산 §176의2와 별개 조문 — 검토자 ② 정정)
- `PostListingValuationCard` → 시행령 §165⑤ 본문 + §165⑨ + 시행규칙 §81④ 월할 가산
- `FaceValueBlock` → §99①4
- 결과 화면 누진세율 분해 → §104①11

---

## UI 14지점 누락 보완 — sync-checker 사전 자가점검 표

| 지점 | 산식 출처 | UI 위치 | 누락 위험 |
|---|---|---|---|
| ⑤ | `MarketTypeBlock` | Step 1 | ⚠ konex row PR-1 시드 추가 시 옵션 누락 위험 |
| ⑤ | `MajorShareholderBlock` 시총 임계 helper | Step 1 | ⚠ 시기별 자동 적용 useMemo 누락 |
| ⑤ | `OtherAssetBlock` §94② 트리거 | Step 1 | ⚠ 비상장+과점 동시 충족 시 강제 전환 안내 누락 |
| ⑥ | 사이드바 8항목 | 전 Step | ⚠ `localIncomeTax` 누락 |
| ⑦ | 환산 분기 산식 분해 | Step 4 | ⚠ 취득 후 상장 분기·80% 하한 발동 산식 분해 카드 누락 |
| ⑦ | 누진세율 분해 | Step 4 | ⚠ `taxBase × 0.25 - 15,000,000` 분해 표시 누락 위험 |
| ⑦ | §94② 발동 배지 | Step 4 | ⚠ 다목·라목 우선 적용 안내 누락 |
| ⑧ | `transferPriceMode === "exchange"` 3개 중 1개 양수 | validate | ⚠ 0+0+0 통과 위험 |
| ⑧ | `acquisitionMode === "face_value"` ↔ `bookLost: true` 동시 강제 | validate | ⚠ 모순 입력 통과 위험 |
| ⑧ | 단기 보유 분기 검증 | validate | ⚠ acquisitionDate > transferDate 시 음수 일수 fallback |

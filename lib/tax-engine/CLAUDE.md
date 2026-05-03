# lib/tax-engine/ — 세금 계산 엔진

Layer 2 (Pure Engine) 구역. DB 직접 호출 없이 순수 함수로 계산.

## 파일 조직 원칙 (2026-04 리팩터링 후)

```
lib/tax-engine/
├── {tax-type}.ts              # Orchestrator — calculate{TaxType}() 메인 함수
├── {tax-type}-helpers.ts      # 내부 헬퍼 + 내부 파싱/결과 타입 (최근 패턴)
├── types/
│   ├── {tax-type}.types.ts    # 공개 타입 (Input·Result·CalculationStep)
│   └── {domain}.types.ts      # 서브엔진 공개 타입 (HouseInfo 등)
├── legal-codes/               # 세목별 조문 상수 (barrel: ../legal-codes.ts)
│   ├── transfer.ts            # NBL, TRANSFER, MULTI_HOUSE
│   ├── acquisition.ts         # ACQUISITION, ACQUISITION_CONST
│   ├── property.ts            # PROPERTY, PROPERTY_CONST, PROPERTY_SEPARATE
│   ├── comprehensive.ts       # COMPREHENSIVE, COMPREHENSIVE_LAND, COMPREHENSIVE_EXCL
│   ├── inheritance-gift.ts    # INH, GIFT, VALUATION, TAX_CREDIT
│   └── common.ts              # PENALTY, PENALTY_CONST (국세기본법 공통)
├── non-business-land/         # 비사업용 토지 판정 v2 (14 서브모듈)
│   ├── engine.ts              # judgeNonBusinessLand() 진입점
│   ├── farmland.ts / forest.ts / pasture.ts / villa-land.ts / ...
│   └── types.ts               # NonBusinessLandInput, 판정 결과 타입
└── schemas/rate-table.schema.ts  # DB jsonb 스키마 (parseProgressiveRate 등)
```

## 파일 분할 규칙

- **Orchestrator**는 매개변수 주입받은 `TaxRatesMap`으로 파싱 → 헬퍼 조립 → 결과 반환에만 집중. 계산 로직 세부는 helpers에 위임.
- **Helpers 파일 분리 기준**: 메인 파일이 800줄 초과 + 내부 헬퍼가 5개 이상이면 `{tax-type}-helpers.ts` 로 분리 (예: `transfer-tax.ts` 1,470→706줄).
- **타입 파일 분리 기준**: 공개 타입이 3개 이상이고 엔진 외부(API·UI·테스트)에서 import되면 `types/` 로 분리. Orchestrator에서는 `export type { X } from "./types/..."` 로 재수출해 하위 호환 유지.
- **legal-codes 세목별 분리**: 공유 상수 파일은 barrel (`legal-codes.ts`가 `export * from "./legal-codes/*"`). 세목 간 병합 충돌 방지.

## 신기능 (새 특례·개정) 추가 워크플로

1. **법령 상수**: `legal-codes/{세목}.ts` 에 조문 근거 추가 (예: `TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION = "조특법 §77"`).
2. **타입 확장**: 새 입력 필드를 `types/{tax-type}.types.ts` 의 `{TaxType}Input` 에 optional로 추가. 결과는 `{TaxType}Result` 에 `*Detail?` optional 필드 추가.
3. **서브엔진 구현**: 독립 로직이면 별도 파일(`{feature}.ts`)로. 순수 함수 + 매개변수로 규칙 데이터 주입받는 시그니처.
4. **Orchestrator 통합**: `calculate{TaxType}()` 파이프라인의 적절한 step에 호출 1줄 추가. 기존 분기에 삽입하지 말고 가능한 끝에 appended step으로.
5. **DB 세율 추가**: 필요 시 `tax_rates` 테이블에 새 카테고리 행 추가 (`parseRatesFromMap` 은 optional 키만 확장).
6. **테스트**: 경계값 + PDF 예시값 고정 테스트. 시나리오별 분할 (`__tests__/tax-engine/{tax-type}/{scenario}.test.ts`).

**체크**: 기능 1건 추가 시 orchestrator 파일 diff가 +50줄 초과면 분리 신호.

## 정수 연산 디테일

`tax-utils.ts` 제공:
- `applyRate(amount, rate)` — `Math.floor(amount * rate)`. 세율×금액은 이거로만.
- `safeMultiply(a, b)` — overflow 시 BigInt fallback (환산취득가 2조×1조 케이스).
- `truncateToThousand(n)` — 천원 미만 절사 (지방소득세·과세표준).
- `truncateToWon(n)` — 원 미만 절사 (결정세액).
- `calculateEstimatedAcquisitionPrice(transfer, stdAtAcq, stdAtTransfer)` — 환산취득가 공식.
- `calculateProgressiveTax(taxBase, brackets)` — 누진세율 적용.
- `calculateHoldingPeriod(from, to)` — 윤년/월 경계 안전 처리 (date-fns 기반).
- `isSurchargeSuspended(rules, date, type)` — 중과 유예 판정.

**절대 금지**: `Math.round()` (세법은 floor), 부동소수 누적 (`0.1+0.2=0.30000000000000004`).

## 감면 중복배제 구현 패턴

조특법 §127 ②: 동일 자산에 복수 감면 해당 시 납세자 유리 1건 선택.

```ts
interface ReductionCandidate { amount: number; type: string; }
const candidates: ReductionCandidate[] = [];

// 각 감면을 독립 계산 후 후보에 푸시
if (rentalResult.isEligible) candidates.push({ amount: rentalResult.reductionAmount, type: "long_term_rental" });
if (newHousingResult.isEligible) candidates.push({ amount: newHousingResult.reductionAmount, type: "new_housing" });
// ...

// 유리한 1건 선택
const best = candidates.reduce((a, b) => a.amount >= b.amount ? a : b, { amount: 0, type: "" });
const reductionAmount = Math.min(best.amount, calculatedTax);
```

참고 구현: `transfer-tax-helpers.ts` 의 `calcReductions()`.

## DB 세율 맵 형식

`TaxRatesMap = Map<TaxRateKey, object>` — `TaxRateKey` 는 `${tax_type}:${category}:${sub_category}` 문자열.

주요 키:
- `transfer:progressive_rate:_default` — 누진세율 8구간
- `transfer:deduction:long_term_holding` / `basic` / `self_farming` / `long_term_rental_v2` / `new_housing_matrix`
- `transfer:surcharge:_default` — 중과세율 (multi_house_2/3plus/non_business_land/unregistered)
- `transfer:special:one_house_exemption` / `house_count_exclusion` / `regulated_areas` / `non_business_land_judgment`

`parseRatesFromMap()` 가 각 키를 검증하여 `ParsedRates` 로 normalize. 필수 키 누락 시 `TaxRateNotFoundError`.

## 서브엔진 의존 규칙

- `comprehensive-tax.ts` → `property-tax.ts` (재산세 결과를 종부세 재산세 비율 안분 공제에 사용). **역방향 금지**.
- `transfer-tax-aggregate.ts` → `transfer-tax.ts` (다건 양도 오케스트레이션은 단건 엔진을 반복 호출).
- `transfer-tax.ts` → `multi-house-surcharge.ts` / `non-business-land/engine.ts` / `rental-housing-reduction.ts` / `new-housing-reduction.ts` / `public-expropriation-reduction.ts` / `transfer-tax-penalty.ts` / `pre-1990-land-valuation.ts` / `multi-parcel-transfer.ts` (서브엔진 fan-out).
- `transfer-tax-mixed-use.ts` → `transfer-tax-mixed-use-helpers.ts` → `transfer-tax-mixed-use-fourpart.ts` (Case A 4부분 안분 어댑터) / `transfer-tax-mixed-use-totals.ts` (조립 헬퍼) / `transfer-tax-pre-housing-disclosure.ts` (PHD §164⑤).

서브엔진은 상위 엔진 import 금지 (순환 금지).

## 검용주택 PHD 4부분 안분 (Case A)

`partialUsageChange.direction === "house_to_commercial"` AND `firstDisclosureDate < usageChangeDate` 조합에서만 활성화. 취득시·최초공시 시점에 건물 전체가 주택이었던 케이스.

- **활성 조건**: PHD 입력에 `commercialBuildingStdPriceAtAcq/AtFirstDisclosure` + `housingLandArea` + `commercialLandArea` + `totalTransferPriceForFourPart` 모두 충족.
- **결과**: `PreHousingDisclosureResult.fourPartApportionment` 에 4부분(주택분토지·주택건물·상가분토지·상가건물) 시점별 기준시가·양도가액·환산취득가·개산공제·양도차익 분리값. 미활성 시 undefined.
- **mixed-use 어댑터**: `buildHousingGainSplitFromFourPart` / `buildCommercialGainSplitFromFourPart` 가 4부분 결과를 HousingGainSplit/CommercialGainSplit 으로 변환. `housingPart.estimatedAcquisitionPrice`는 `fp.housingAcqPriceSum`(D11+E11) 사용 — 전체 환산취득가(C11) 아님.
- **period-split 자동 비활성화**: 4부분 활성 시 `applyUsagePeriodSplit` 건너뜀 (엑셀 단일 LTHD 적용).

## 양도세 자산-수준 통합 (2026-04-25)

취득 정보 13필드가 모두 `AssetForm` 자산-수준에 있음. 폼-전역 `acquisitionMethod`·`appraisalValue`·`isSelfBuilt` deprecated.

- **acquisitionMethod 도출**: `isAppraisalAcquisition` / `useEstimatedAcquisition` 플래그에서 API 변환 시 파생 (`lib/calc/transfer-tax-api.ts`).
- **감정가액 + 개산공제 자동 (§163⑥)**: `acquisitionMethod === "appraisal"` 시 `취득시 기준시가 × 3%` 자동 적용 (`calcTransferGain`).
- **토지/건물 분리 양도차익 (§166⑥)**: `hasSeperateLandAcquisitionDate === true` 시 `transfer-tax-split-gain.ts` 활성. PHD 취득시 참조일은 **`landAcquisitionDate`** (건물 취득일 아님).

## §97② 2호 단서 swap (2026-05-03)

환산취득가액·감정가액 모드에서 **(환산 + 개산공제) < (자본적지출 + 양도비)** 이면 후자를 필요경비로 swap.

- **입력**: `TransferTaxInput.capitalExpenditure?` + `transferExpense?`. 두 필드 모두 undefined이면 swap 비활성 (legacy `expenses` 동작).
- **환산 모드 본문**: `expenses = 개산공제만` (legacy `expenses` 필드 차감 안 함 — 이전 버그 수정됨).
- **swap 비교**: `swapEligible && directSide > estimatedSide` → `expensesApplied = directSide`.
- **결과**: `TransferTaxResult.swapApplied?` + `swapComparison?` 노출.
- **다필지 모드**: `ParcelInput.capitalExpenditure?`/`transferExpense?` — 필지별 독립 swap.
- **토지/건물 분리**: `SplitPartResult.swapApplied?` — 자산 단위 독립 swap (`landDirectExpenses`/`buildingDirectExpenses` 명시 입력 시만).
- **헬퍼**: `calcNecessaryExpense()` (`transfer-tax-helpers.ts`) 내부 — 직접 호출 금지.

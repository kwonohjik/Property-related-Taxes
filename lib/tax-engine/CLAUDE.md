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
├── non-business-land/         # 비사업용 토지 판정 v2 (20+ 서브모듈)
│   ├── engine.ts              # judgeNonBusinessLand() 진입점
│   ├── farmland.ts / forest.ts / pasture.ts / villa-land.ts / ...
│   └── types.ts               # NonBusinessLandInput, 판정 결과 타입
├── transfer-reductions/       # 감면 23개 조문 라우터 (대부분 구현 완료 — metadata.isFullyImplemented 기준)
│   ├── index.ts               # evaluateReduction(input) 단일 진입점 + re-export
│   ├── metadata.ts            # REDUCTION_METADATA (23개 조문 UI라벨·효과·isFullyImplemented)
│   ├── period-check.ts        # checkReductionPeriod(id, ctx) — 일몰 시한 검증 (매매계약일 우선)
│   ├── phd-helper.ts          # §164⑤ 환산 보조 — 신축주택 감면 조문의 "취득시 기준시가" 자동 도출
│   ├── new-99-3.ts            # §99의3 신축주택 과세특례 (완전구현 조문 예시)
│   └── types.ts               # TransferReductionId · ReductionCategory 공개 타입
└── schemas/rate-table.schema.ts  # DB jsonb 스키마 (parseProgressiveRate 등)
```

## 파일 분할 규칙

- **Orchestrator**는 매개변수 주입받은 `TaxRatesMap`으로 파싱 → 헬퍼 조립 → 결과 반환에만 집중. 계산 로직 세부는 helpers에 위임.
- **Helpers 파일 분리 기준**: 메인 파일이 800줄 초과 + 내부 헬퍼가 5개 이상이면 `{tax-type}-helpers.ts` 로 분리 (예: `transfer-tax.ts` 1,470→≈800줄).
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

### 면적 안분 — `area-utils.ts` (전 세목 공통, 강제)

**금액(원)은 floor 절사지만 면적(㎡)은 반올림**이다. 무의존 leaf `area-utils.ts` 제공 (UI `use client`도 직접 import — `tax-utils.ts`는 date-fns 의존이라 면적 유틸을 두지 않음):

- `round2(area)` — 소수 3째 자리에서 반올림해 2자리 확정. 표시(`toFixed(2)`)와 계산값 일치 강제.
- `residualArea(total, ...allocated)` — **마지막 항목 전용** 잔액 흡수 (`전체 − 앞 항목 합`).

안분 항목을 각각 `round2(전체 × 비율)` 하면 합이 전체와 어긋난다 (100㎡ 3등분 → 33.33×3 = 99.99). 마지막 항목은 **반드시** `residualArea()`로 잔액을 흡수시켜 `Σ안분면적 = 전체` 불변식을 지킬 것. 비율로 직접 재계산 금지.

**게이팅 주의**: 일부 항목만 배분 대상인 안분(예: `calcCompositeForYear` 부속시설 — 상증은 공용 조정률 지정 부분만 수령)은 잔액 흡수 기준이 전체가 아니라 **수령분 raw 합**이다. `Σ = 전체` 강제 시 게이팅 의미가 깨진다.

**적용 대상 판별** — "면적 × 비율"이 전부 대상은 아니다. 둘 다 충족할 때만 적용:
1. 전체를 여러 항목으로 **쪼개는 안분**일 것 (마지막 항목·`Σ=전체` 불변식이 성립)
2. 그 면적이 **단가와 곱해져 가액이 되거나** 2자리로 표시될 것

대상 아닌 예(2026-07-15 실측 판별): `co-ownership.ts` 지분율 스케일 다운(안분 아님·세액 무관·`toFixed(1)` 표시) / `inheritance-cohabit-helpers.ts` `limitArea = 정착면적 × 배율`(§154⑦ **법정 한도** — 반올림 근거 없음) / `computeAreaProportioning`(`min/max` 산출 — 비율 곱 없음).

## 감면 중복배제 구현 패턴

조특법 §127⑦: 거주자가 토지등을 양도하여 둘 이상의 양도소득세 감면규정을 동시 적용받는 경우 선택 1건. (취득세·재산세 중복배제는 조특법 아닌 지방세특례제한법 §180)

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

참고 구현: `transfer-tax-reductions-calc.ts` 의 `calcReductions()` (`transfer-tax-rate-calc.ts` 에서 re-export).

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
- `transfer-reductions/index.ts` — 독립 라우터. 각 조문별 모듈(`new-99-3.ts` 등)이 switch 분기로 통합됨. `transfer-tax.ts` STEP 4.6~7.5에서 직접 호출. 신규 조문 추가 시 `calcReductions()` 후보 배열에 push.
- `transfer-tax-mixed-use.ts` → `transfer-tax-mixed-use-helpers.ts` → `transfer-tax-mixed-use-fourpart.ts` (Case A 4부분 안분 어댑터) / `transfer-tax-mixed-use-totals.ts` (조립 헬퍼) / `transfer-tax-pre-housing-disclosure.ts` (PHD §164⑦ — 건물분은 §164⑤ 준용).

서브엔진은 상위 엔진 import 금지 (순환 금지).

## 겸용주택 PHD 4부분 안분 (Case A)

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

## §97② 2호 단서 swap (2026-05-03, 2026-07-03 법령정정)

**환산취득가액 모드 전용**(감정가액·매매사례가액 제외 — 소득세법 §97②2호 단서는 "취득가액을 **환산취득가액**으로 하는 경우"에 한정). 가목(환산취득가액 + 개산공제) < 나목(자본적지출 + 양도비)이면 **나목을 필요경비 '전체'로** 한다(가목·나목 **택일=max**, 합산 아님).

**⚠️ 핵심**: 가목은 "환산취득가액 + 개산공제"이므로 나목 채택 시 **환산취득가액은 필요경비에 포함되지 않는다**. 양도차익 = **양도가액 − 나목(자본+양도비)**. 환산취득가액을 별도 차감하면 이중차감(2026-07-03 코드감사·조세심판원 조심2016서2576·소득세법 §97②2호 원문으로 정정). ⇒ 이전 "acquisitionCost는 estimatedBase 유지, expenses만 swap" 모델은 **법령상 오류였음**.

- **입력**: `TransferTaxInput.capitalExpenditure?` + `transferExpense?`. 두 필드 모두 undefined이면 swap 비활성 (legacy `expenses` 동작).
- **환산 모드 본문(비-swap)**: `expenses = 개산공제만` (legacy `expenses` 필드 차감 안 함). 양도차익 = 양도가 − 환산취득가 − 개산공제.
- **swap 발동**(`useEstimatedAcquisition && directSide > estimatedSide`): `expensesApplied = directSide`, 그리고 **양도차익 계산에서 환산취득가액(acquisitionCostBase) 미차감**(`calcTransferGain`/`calcSplitGain`/`multi-parcel` 모두 `swapApplied` 시 취득가 항 제외). 감정가액 모드는 swap 대상 아님.
- **결과**: `TransferTaxResult.swapApplied?` + `swapComparison?` 노출. 표시 산식·다필지 카드도 swap 시 취득가 항 제외(reconcile).
- **다필지 모드**: `ParcelInput.capitalExpenditure?`/`transferExpense?` — 필지별 독립 swap.
- **토지/건물 분리**: `SplitPartResult.swapApplied?` — 자산 단위 독립 swap (`landDirectExpenses`/`buildingDirectExpenses` 명시 입력 시만).
- **헬퍼**: `calcNecessaryExpense()` (`transfer-tax-helpers.ts`) 내부 — 직접 호출 금지.

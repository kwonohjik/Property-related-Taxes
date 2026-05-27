# 비상장주식 간편평가(V1) 영업권(§59②) 가산 — 엔진 설계

> 계획서: `docs/00-pm/inheritance-unlisted-stock-simple-goodwill.plan.md`
> UI 설계: `inheritance-unlisted-stock-simple-goodwill.ui.design.md`
> 세목: 상속세·증여세 (공유 엔진 `property-valuation-stock.ts`)

## Context

비상장주식 **간편평가(V1)** 는 사용자가 입력한 회사 전체 순자산가치(`netAssetValue`)를 그대로 발행주식수로 나눠 1주당 순자산가치를 산정하고, **영업권(상증법 §55③ + §59②)을 전혀 반영하지 않는다**. 정식평가(V2)는 이미 `unlisted-orchestrator.ts` STEP 6에서 영업권을 가산하므로 V1만 §55③(영업권 가산 강행 규정) 미구현 = **법령 불일치**.

영업권 엔진 `calcGoodwill()`(goodwill.ts)이 이미 존재하고, 영업권 산식 입력(가중평균 순손익·자기자본·법정 10%·§54④ 사유)을 간편평가가 **기존 필드로 모두 보유** → **신규 입력 필드 0건**으로 `calcGoodwill` 재사용. 사용자 첨부 이미지25(PDF 사례 5)가 목표 산식·수치.

이전 한계: V1 사용자는 영업권이 가산되지 않아 정식평가 대비 과소평가. PDF 사례 5처럼 1주당 순자산가치 4,587원이 나와야 하나 현행은 3,000원(60,000,000÷20,000).

---

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

anchor 출처: `goodwill.ts` 주석 PDF 사례 5·6 + 사용자 첨부 이미지25(=사례 5). 테스트 파일: `__tests__/tax-engine/property-valuation-stock-goodwill.test.ts`.

| # | 시나리오 | 법령 근거 | 기대 | anchor 출처 | 상태 |
|---|---------|----------|------|-------------|------|
| V1-GW-1 | 정상법인 영업권 양수 (이미지25/사례5) | §55③·§59② | goodwillFinal 31,747,839 / perShareAssetValue **4,587** (20,000주) | 이미지25 | ☐ |
| V1-GW-2 | 초과이익 음수 → 영업권 0 (사례6) | §59② | goodwillFinal 0 / 순자산 불변 / `excludedByLaw` undefined | goodwill.ts 사례6 | ☐ |
| V1-GW-3 | liquidation 배제 | §55③1호(§54④1호) | goodwillFinal 0 / `excludedByLaw="liquidation"` | 합성 | ☐ |
| V1-GW-4 | lt3y 배제 | §55③2호(§54④2호) | goodwillFinal 0 / `excludedByLaw="lt3y"` | 합성 | ☐ |
| V1-GW-5 | real_estate_80 배제 | §55③1호(§54④3호) | goodwillFinal 0 / `excludedByLaw="real_estate_80"` | 합성 | ☐ |
| V1-GW-6 | 3년 계속결손 도출 (모두 ≤0) | §55③3호 | goodwillFinal 0(가중평균≤0로 이미 0) / **`excludedByLaw="continuous_loss_3y"`** | 합성 | ☐ |
| V1-GW-7 | stock_80 (배제 없음, 영업권 양수) | §55③(5호 배제 외) | goodwillFinal >0 가산 / `excludedByLaw` undefined | 합성 | ☐ |
| V1-GW-8 | remaining_3y (배제 없음, 영업권 양수) | §55③(6호 배제 외) | goodwillFinal >0 가산 / `excludedByLaw` undefined | 합성 | ☐ |
| V1-GW-9 | legacy fallback (Y1~Y3 미입력, weightedNetIncome=28,750,000) | §56① 준용 | goodwillFinal 31,747,839 (GW-1 동일) | 합성 | ☐ |
| V1-GW-10 | 자본잠식 (netAssetValue=−5,000,000, Y1~Y3 양수) → selfCapital 0 | §55① 후단·§59② | 마=0 → 초과이익=나 → goodwillFinal>0 / netAssetWithGoodwill=goodwillFinal | 합성 | ☐ |

**규칙**: 행≥1 충족. V1-GW-1은 **Pre-Do anchor**(현행 RED 우선 확보 후 Do 진입).

---

## 법령 근거

`lib/tax-engine/legal-codes/inheritance-gift.ts` 상수 (기존재 — 신설 없음):
`VALUATION.UNLISTED_GOODWILL_INCLUDE`(§55③) · `GOODWILL_FORMULA`(§59②) · `GOODWILL_NET_INCOME`(§59③) · `GOODWILL_RATE`(상증규 §19①).

```
상증법 §55③: §55① 순자산가액에 §59② 영업권 가액을 가산한다(강행). 단서:
  1호: §54④ 1호(청산·해산·합병) 또는 3호(부동산 80%)
  2호: §54④ 2호(사업개시 3년 미만·휴·폐업) — 무체재산권 현물출자 합산 3년↑ 제외(본 PR 미적용)
  3호: 직전 3개 사업연도 순손익액 모두 0 이하(계속결손법인)
상증령 §59②③: 초과이익 5년 연금현가 환산. 가중평균 순손익은 §56①·② 준용(회사 전체 금액).
상증규 §19①: §59② "재정경제부령이 정하는 율" = 100분의 10.
§54④ 5호(주식80%)·6호(잔여3년)는 §55③ 배제 대상 아님 → 영업권 가산.
```

> Do 단계에서 §55③ 3호 "0 이하" 자구를 KoreanLaw MCP로 재확인([[korean-law-citation-verify]]). 추정 인용 금지.

---

## 엔진 input 타입

**신규 필드 없음.** 기존 `UnlistedStockData`(types/inheritance-gift.types.ts) 그대로:

```ts
interface UnlistedStockData {
  totalShares: number;          // 발행주식총수
  ownedShares: number;          // 피상속인·수증자 보유 주식 수
  weightedNetIncome: number;    // @deprecated legacy fallback
  netIncomeY1?: number;         // 직전1년 순손익 (회사 전체, 음수 허용) — 영업권 가중평균 입력
  netIncomeY2?: number;
  netIncomeY3?: number;
  netAssetValue: number;        // 회사 전체 순자산 (= 영업권 포함 전 자기자본 '다')
  capitalizationRate: number;
  assetValueOnlyReason?: UnlistedAssetValueOnlyReason; // §54④ 사유 → §55③ 1·2호 배제 판정
}
```

> **Zod strip 안전**: `unlistedStockDataSchema = z.object({...})`가 unknown 키를 strip하므로 신규 필드는 위험. 전부 기존 필드 도출 → Zod·normalize·initial·API 변환 변경 0건.

`calcGoodwill`에 전달하는 `GoodwillInput`(기존 타입):
```ts
{ weightedAvg3y, selfCapital, rate?, intangibleDeduction?, netAssetOnlyReason?, isContinuousLossLastThreeYears? }
```
→ V1은 `rate`·`intangibleDeduction` 미전달(기본 0.10 / 0).

## 엔진 result 타입

`calcUnlistedStockPerShareValue` 반환 타입에 echo 2필드 추가 (UI 미리보기가 `ReturnType<…>` 직접 사용 → 자동 전파):

```ts
{
  perShareIncomeValue: number;
  perShareAssetValue: number;    // ★ 이제 영업권 가산 후 순자산 ÷ 발행주식수
  perShareWeightedValue: number;
  perShareMinValue: number;
  perShareFinalValue: number;
  goodwill: UnlistedGoodwillResult;  // 추가 — 산출근거·excludedByLaw echo (기존 타입 재사용)
  netAssetWithGoodwill: number;      // 추가 — 영업권 포함 후 회사 전체 순자산 (㉰)
}
```

`UnlistedGoodwillResult`(기존): `weightedAvg3y·weightedAvgHalf·selfCapital·rate·selfCapitalRate·annualExcessProfit·durationYears·goodwillCalc·intangibleDeduction·goodwillFinal·excludedByLaw?`.

> **import 추가 (DR-A)**: `property-valuation-stock.ts`는 현재 `inheritance-gift.types`만 import. echo를 위해 `import { calcGoodwill } from "./property-valuation/goodwill"` + `import type { UnlistedGoodwillResult } from "./types/unlisted-stock-valuation.types"` 추가 필요.

---

## 계산 알고리즘 (단계별)

`calcUnlistedStockPerShareValue(data, isRealEstateHeavy)` 내부, `perShareAssetValue` 산정 직전 삽입:

1. **가중평균 순손익(가)** = `resolveWeightedNetIncome3yForGoodwill(data)` = `max(0, floor((Y1×3+Y2×2+Y3×1)/6))` (3년치) / legacy `max(0, floor(weightedNetIncome))`.
2. **자기자본(다)** = `max(0, data.netAssetValue)` (§55① 후단 0 가드).
3. **§55③ 배제 판정**:
   - `netAssetOnlyReason` = `mapToNetAssetOnlyReason(data.assetValueOnlyReason)` (stock_80·remaining_3y → undefined).
   - `isContinuousLossLastThreeYears` = `deriveContinuousLoss(data)` (Y1~Y3 모두 ≤0, 미입력 시 false).
4. **영업권** = `calcGoodwill({ weightedAvg3y: 가, selfCapital: 다, netAssetOnlyReason, isContinuousLossLastThreeYears })`.
   - 내부: 나=floor(가×0.5) → 마=floor(다×0.10) → 초과이익=max(0,나−마) → 사=floor(Σ 초과이익/1.1ⁿ, n=1..5) → 자=max(0, 사−아) → 배제 시 0.
5. **영업권 포함 순자산(㉰)** `netAssetWithGoodwill` = `max(0, netAssetValue) + goodwill.goodwillFinal`.
6. **1주당 순자산가치(㉱)** `perShareAssetValue` = `calcPerShareNetAssetValue(netAssetWithGoodwill, totalShares)` = `floor(㉰/발행주식수)`.
7. 이후 기존 흐름(가중평균·80% 하한·§54④ 분기·perShareFinalValue) 그대로 — perShareAssetValue가 영업권 포함값이므로 자동 반영.

> **★ 두 가중평균 분리 (DR-B — 의도된 설계, 통합 금지)**: 같은 3년치 순손익이 **두 산식**에 쓰인다.
> - **영업권용 가중평균(가)** = 회사 전체 `max(0, floor((Y1×3+Y2×2+Y3×1)/6))` (§59③ 준용 §56① — "1주당 아닌 순손익액").
> - **순손익가치용 가중평균** = 1주당 `floor(Yi/주식수)` → `calcWeightedAvg3y` → `÷환원율` (§56① 1주당, has3y 경로 — 기존 로직).
>
> 법적 근거가 달라(회사 전체 vs 1주당) **별도 헬퍼로 분리 유지**. 중복으로 오인해 통합 금지.
>
> **V1 capital adjustment 미반영 (DR-C)**: V2 `companyWeighted3y`는 유상증자·감자 조정(`finalNetIncomes`)을 포함하나, **간편(V1)은 조정 없는 raw `netIncomeY`** 사용 — 자본변동 정밀 조정은 정식평가(V2) 영역. 간편 영업권은 입력 순손익 그대로의 근사.

`evaluateUnlistedStock` breakdown: `goodwillFinal>0` 시 "영업권 (§59②)" 줄 + "1주당 순자산가치 (영업권 포함)" 라벨. lawRef = `GOODWILL_FORMULA`/`UNLISTED_GOODWILL_INCLUDE`.

### §54④ × 영업권 상호작용 (V2 일관성)

| assetValueOnlyReason | §55③ 배제 | goodwillFinal | perShareFinalValue |
|---|---|---|---|
| 미입력 | 없음 | ≥0 | max(가중평균, 순자산×80%) |
| liquidation(1호) | 1호 | 0 | 무조건 순자산 |
| lt3y(2호) | 2호 | 0 | 무조건 순자산 |
| real_estate_80(3호) | 1호 | 0 | 단서: 가중평균<순자산이면 순자산 |
| stock_80(5호) | 없음 | ≥0 | 단서 |
| remaining_3y(6호) | 없음 | ≥0 | 무조건 순자산 |

---

## Silent fallback / 자동 안분 후보 식별

- **`deriveContinuousLoss` 자동 도출** — 빈 값 자동 채움이 아니라 **이미 입력된 3년치(직전 1·2·3 사업연도 그 자체)에서의 deterministic 법령 판정**. 자동 안분 fallback([[feedback_no_silent_apportion_fallback]])과 무관. 일부 미입력 시 false(유보) — 침묵 보정 없음.
- **연금현가 계수**: 엔진 정확 Σ(3.79078676…) 유지. PDF 표 3.7908 하드코딩 금지(V2 공유 goodwill.ts 회귀 위험). 111원 차이는 1주당 floor가 흡수 → PDF 일치([[bigint-round-half-up]] 1원 tolerance 정책).
- **legacy fallback**: `weightedNetIncome` 단일값도 영업권 산입(법령 정합). 기존 저장 이력 valuatedAmount 변동 가능 — 주석 명시.

---

## 테스트 약속

- 케이스 인벤토리 V1-GW-1~10 anchor (`property-valuation-stock-goodwill.test.ts`). PDF 사례 5/6 원단위 `toBe()`.
- 합성 3년치는 동일값 입력으로 목표 가중평균 구성 가능(예 V1-GW-2 사례6: `Y1=Y2=Y3=58,341,511` → 가중평균 58,341,511, `netAssetValue=489,351,700` → 초과이익 음수 → 영업권 0).
- **Pre-Do**: V1-GW-1 우선 작성 → 현행 RED(`goodwill` 필드 부재·perShareAssetValue 3,000) 확보 → 실측 환류 후 Do([[feedback_pre_anchor_verification]]).
- **회귀**: `property-valuation-stock.test.ts` 및 `resolve-estate-item-value` 경유 상속·증여 통합 anchor 중 영업권>0 케이스 전수 재산정([[feedback_anchor_correction_legal_priority]]). 5호·6호도 변동. 1·2·3호 배제·적자(가중평균≤0)는 무변화. 재산정 전 실패 anchor로 변동 실증([[feedback_numeric_impact_verify_before_bug_claim]]).

---

## UI 통합 위임

- UI 명세 = `inheritance-unlisted-stock-simple-goodwill.ui.design.md`.
- 신규 입력 필드 0건 → 8지점 중 **⑤(미리보기)·⑦(결과 breakdown)만 영향**, ⑥(사이드바)은 값 자동 변동(검증만). ①②③④⑧ 무변경.
- 엔진 시니어는 input/result echo(`goodwill`·`netAssetWithGoodwill`) 타입만 확정 → UI 시니어가 이미지25 4줄(㉮㉯㉰㉱) + 산출근거 펼침 + §55③ amber + hint 구현.

> **★ echo 노출 범위 (IC-1)**: echo(`goodwill`·`netAssetWithGoodwill`)는 `calcUnlistedStockPerShareValue` 반환 타입에만 존재 → **입력 미리보기(⑤)** 가 직접 소비. **결과 카드(⑦)** 는 `evaluateUnlistedStock`의 `PropertyValuationResult.breakdown`을 받으므로 echo 미노출 — 영업권은 breakdown 줄("영업권 (§59②)" + "1주당 순자산가치(영업권 포함)")로만 전달. 6줄 산출근거는 미리보기 한정.

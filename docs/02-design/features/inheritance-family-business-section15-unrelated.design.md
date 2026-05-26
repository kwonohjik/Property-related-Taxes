# 가업상속공제 §15⑤2호 사업무관자산 자동차감 통합 (PR4) — 설계

> 상위 계획: `docs/00-pm/inheritance-remaining-credit-deduction-gaps.plan.md` §4 (그룹 ③-b, 권장 PR 4순위)
> 단계: Design · 도메인: 상속세 가업상속공제(§18의2 + 시행령 §15⑤2호)
> KoreanLaw 검증: 시행령 §15⑤2호 산식·가~마 5종·단서 전문 대조 완료 (계획서 §7-2·§4)

## Context

§15⑤2호: 「법인세법」 가업 = 주식가액 × (총자산 − 사업무관자산) / 총자산. 이는 **가업상속공제 대상가액 산정** 조항(§63 일반 평가와 별개).

**갭 (코드 검증 — 계획서 §4 C-1·C-5)**:
- **엔진 본체** `deriveFamilyBusinessValue`(family-business.ts:120): `item.marketValue` 단순합산 → §15⑤2호 차감 **미적용** (주석 line 117 "FB-8 후속 PR로 자동화 예정").
- **공제 제안** `getCorporateAdjustedAmount`(inheritance-deduction-suggest.ts:80): `calcCorporateStockAdjustedValue`로 차감 **적용**.
- → 사용자가 보는 제안값 ≠ 실제 반영 공제값 (불일치).
- **3중 중복**: `calcCorporateStockAdjustedValue`(suggest 사용) / `calcFamilyBusinessStockValuation`(orphan, 테스트만) / `deriveFamilyBusinessValue`(미차감).

## 이중차감 가드 (핵심 — 검증된 설계)

`calcCorporateStockAdjustedValue`·`getCorporateAdjustedAmount`는 **`corporateTotalAssets` 입력 시에만 차감**(property-valuation-corporate.ts:53 `if totalAssets<=0 return 0`, suggest:86 `if !corporateTotalAssets return raw`). FNB-11 anchor가 이 패턴 보장.

→ **`corporateTotalAssets` 입력 여부 = 모드 분기**:
- 입력 O = 자동차감 모드 (marketValue=raw 평가액, 엔진이 사업무관자산 차감)
- 입력 X = 직접입력 모드 (marketValue=사용자가 차감 후 직접 입력)
- **동일 입력에 차감 2회 적용 불가** → 이중차감 원천 차단.

## ★ 케이스 인벤토리

| # | 케이스 | familyBusinessCategory | corporateTotalAssets | deriveFamilyBusinessValue 결과 |
|---|---|---|---|---|
| FB15-1 | 법인주식 + 자동차감 | corporate_stock | 입력 O | `calcCorporateStockAdjustedValue(marketValue, total, nonBusiness).adjustedValue` |
| FB15-2 | 법인주식 + 직접입력 | corporate_stock | 미입력 | `marketValue` (기존 동작 — 회귀 0) |
| FB15-3 | 개인사업 자산 | farmland/building 등 | — | `marketValue` (corporate_stock 아님 — 차감 무관) |
| FB15-4 | 제안↔본체 차감산식 일치 | corporate_stock | 입력 O | 동일 `calcCorporateStockAdjustedValue` 차감산식 적용 (단 raw 평가액: 본체=marketValue, suggest=getValuatedAmount — J-1) |
| FB15-5 | 다종목 혼합 | corporate_stock + 개인자산 | 혼합 | 각 항목 독립 차감/비차감 합산 |

> FB15-2가 회귀 보증(기존 테스트 전부 corporateTotalAssets 미입력 → marketValue 불변, 실증 완료).

## 엔진 변경

1. **`deriveFamilyBusinessValue`(family-business.ts:120)** — §15⑤2호 차감 통합:
   ```ts
   import { calcCorporateStockAdjustedValue } from "../property-valuation-corporate";
   // ...
   .reduce((sum, item) => {
     const raw = item.marketValue ?? 0;
     if (item.familyBusinessCategory === "corporate_stock" && item.corporateTotalAssets) {
       return sum + calcCorporateStockAdjustedValue(raw, item.corporateTotalAssets, item.corporateNonBusinessAssets).adjustedValue;
     }
     return sum + raw;
   }, 0);
   ```
2. **orphan 삭제**: `lib/tax-engine/deductions/family-business-unrelated-assets.ts` + `__tests__/tax-engine/inheritance-family-business-unrelated-assets.test.ts` 제거. `calcCorporateStockAdjustedValue` single-source.
3. **주석 정정**: family-business.ts:117 "FB-8 후속 PR로 자동화 예정" → "§15⑤2호 차감 적용 (corporateTotalAssets 입력 시). single-source = calcCorporateStockAdjustedValue".

## 범위 — 영농 제외 사유

영농상속재산가액은 `input.farmingAssetValue`(단일 사용자 입력, inheritance-deductions.ts:645)로, 자산별 합산 엔진이 없어 자동차감 적용점이 없다. §16⑤2호 준용 차감은 사용자 입력 또는 suggest 제안 단계에서만. PR4는 **가업 자산합산(`deriveFamilyBusinessValue`) 한정**.

## anchor

- FB15-1: `deriveFamilyBusinessValue([corporate_stock, marketValue=10억, total=20억, nonBusiness 합 5억])` → `floor(10억 × (20억−5억)/20억)` = 7.5억.
- FB15-2 (회귀): corporateTotalAssets 미입력 → marketValue 그대로.
- FB15-4: 동일 차감산식(`calcCorporateStockAdjustedValue`)을 본체·suggest가 공유. ⚠️ raw 평가액 통일(getValuatedAmount vs marketValue)은 **별도 트랙** — marketValue만 입력된 케이스에서는 제안값==본체값 일치. 본 PR은 차감산식 single-source만 보장(회귀 0 위해 본체는 marketValue 유지).
- FB15-5: 혼합(법인주식 차감 + 개인자산 비차감) 합산.
- 회귀: `inheritance-family-business.test.ts`·`inheritance-deductions.test.ts` 전수 불변(corporateTotalAssets 미입력 = marketValue).

## 동기화 지점

- 엔진 본체 단일 변경. UI 입력(`CorporateNonBusinessAssetsSection` — corporateTotalAssets·5종)은 **기존 존재** → 신규 입력 없음.
- ⑦ 결과 카드: 가업공제 §15⑤2호 차감 breakdown 노출(선택 — `FamilyBusinessDeductionDetail`에 차감 전/후 가액 표시 고려).
- ①~⑥·⑧~⑭: 입력 불변 → 변경 없음.

## Silent fallback 식별

- corporateTotalAssets 미입력 = 직접입력 모드(자동 추정 아님). marketValue를 그대로 사용 — 사용자가 차감 후 가액 입력 책임. 자동 안분 fallback 없음 ([[feedback_no_silent_apportion_fallback]]).

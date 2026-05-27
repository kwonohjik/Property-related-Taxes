# 주식 상속·증여재산 합계 누락 교정 + 협의분할 귀속 배선 — 엔진 설계

> 계획서: `docs/00-pm/inheritance-unlisted-simple-stock-gross-estate-wiring.plan.md`
> 작성: 2026-05-28 · 상태: Design (Pre-Do anchor 실증 완료)
> UI 측: `stock-gross-estate-wiring.ui.design.md` (별도, 12단계 산출)

## Context

상속세·증여세 마법사는 주식(상장·비상장 간편 V1·정식 V2)을 first-class로 입력받고 사이드바·미리보기에 평가액을 표시한다. 그러나 **엔진(`calcInheritanceTax`·`calcGiftTax`)이 상장·V1 간편 비상장주식을 `grossEstateValue`/`grossGiftValue`에서 누락**한다 (실측 = 0). 결과적으로:

1. 주식만 있는 상속/증여는 과세표준·산출세액이 **0**.
2. 협의분할(`heirAllocations`)을 입력해도 `directEstateAmount`만 채워지고 전체 세액이 0이라 귀속이 무의미.
3. 사이드바 합계(주식 포함)와 결과(주식 0)가 **불일치** → 사용자가 체감하는 모순.

근본 원인은 `evaluateAllEstateItems`(property-valuation.ts)가 V2만 평가에 포함하고 상장·V1을 category로 배제하는 데 있다 (주석상 "호출부 별도 처리" 의도였으나 미구현). 부수적으로 `isRealEstateHeavy` 플래그가 엔진 미도달(폼 local), 비상장 협의분할 합계검증이 validation에서 누락된다.

---

## ★ 케이스 인벤토리 (필수)

> anchor는 magic number 대신 **`computeStockValuation(item)` 기준 자기일관성**으로 설계 (PDF 고정사례 아님). 절대값은 Do의 Pre-Do anchor에서 1회 고정.

| # | 시나리오 | 법령 근거 | anchor 단언 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| C1 | 상속 · V1 단독 · 협의분할 OFF · 상속인 배우자+자녀 | 상증령 §54①·§55①·§56① / 민법 §1009 | **주 단언**: `grossEstateValue === computeStockValuation(stock) > 0` + `Σ perHeir.finalTax === result.finalTax`(자기일관); 보조: perHeir 법정상속분(배우자:자녀=1.5:1=3/5:2/5) 비례 배분 (개별 finalTax 절대값은 공제 의존이라 비단언) | `inheritance/stock-gross-estate-wiring.test.ts` | ☐ TODO |
| C2 | 상속 · V1 단독 · 협의분할 ON 자녀 100% | 민법 §1013 | `perHeir[child].directEstateAmount === stockVal`; child `finalTax > 0`; spouse `directEstateAmount === 0` | 동상 | ☐ |
| C3 | 상속 · V1 + 아파트 혼합 · 주식만 협의분할 ON | §54① / §1009 | 주식=협의분할분, 아파트=법정상속분; `grossEstate === stockVal + aptVal` | 동상 | ☐ |
| C4 | 상속 · V1 부동산과다보유법인 ON | 상증령 §54① 본문 괄호(가중치 2:3) | 순손익가치≠순자산가치인 입력에서 `valuation(heavy:true)` = 순손익×2+순자산×3 ÷5, `valuation(heavy:false)`(=3:2)와 **상이**함을 단언; `grossEstate === valuation(heavy:true)` | 동상 | ☐ |
| C5 | 상속 · listed_stock 단독 | 상증법 §63①1가 | `grossEstate === avgPrice × shares` | 동상 | ☐ |
| C5b | 상속 · listed_stock §63②3호 증자신주(미상장) | §63②3호·상증령 §57③ | `grossEstate === (avg − 배당차액) × shares` (computeStockValuation 위임) | 동상 | ☐ |
| C6 | 상속 · V2 정식 (회귀) | 상증령 §54 | 기존 동작 무변경 (`unlistedStockValuationV2` 경로) | 동상 | ☐ |
| C7 | 증여 · V1·listed | §63①1가·§54① | `grossGiftValue` 포함; **협의분할/heir 배부 없음**(per-donee) | `inheritance-gift/gift-stock-gross-value.test.ts` | ☐ |
| C8a | 상속 · 적자(순손익 음수) V1, 순자산 양수 | §56① 단서 | 순손익가치 0 → 가중평균 = 순자산×2/5(=0.4)·최소값 = 순자산×0.8 → 최소값 적용; `grossEstate === computeStockValuation(item) > 0` | `inheritance/stock-gross-estate-wiring.test.ts` | ☐ |
| C8b | 상속 · 순자산 음수 V1 | §55① 후단 | 자기자본 0 처리(goodwill 가산 시 그만큼만); `grossEstate === computeStockValuation(item)` | 동상 | ☐ |
| C9 | (validation) V1 협의분할 합계 ≠ 평가액 | — | `validateEstateItemAllocations` 오류 문자열 반환 (§4-4 회귀 가드) | `calc/inheritance-validate-stock-alloc.test.ts` | ☐ |

**규칙**: 행≥1 충족. 사용자 신규 케이스 → 먼저 행 추가 → 코드.

---

## 법령 근거

```
상증법 §63 ① 1호 가목  : 상장주식 = 평가기준일 전후 2개월 종가 단순평균
상증법 §63 ② 3호       : 상장법인 증자 신주(평가기준일 현재 미상장) = 가목 − 배당차액
상증령 §54 ①           : 비상장 1주당 = (순손익가치×3 + 순자산가치×2) ÷ 5
                         (부동산과다보유법인 본문 괄호: 순손익×2 + 순자산×3 ÷ 5)
상증령 §55 ① 후단      : 순자산가액 0 이하면 0
상증령 §56 ①           : 순손익가치 = 최근 3년 가중평균 ÷ 환원율, 음수면 0
민법 §1009·§1013       : 법정상속분 / 협의분할
```
`lib/tax-engine/legal-codes/inheritance-gift.ts`: `VALUATION.LISTED_STOCK`(§63①1호, L113) · `VALUATION.UNLISTED_FORMULA`(§54①, L121) 사용. **문자열 리터럴 금지.**

---

## 엔진 input 타입 (변경)

`lib/tax-engine/types/inheritance-gift.types.ts` `UnlistedStockData`(L217)에 1필드 추가:

```ts
export interface UnlistedStockData {
  totalShares: number;
  ownedShares: number;
  // ... (기존)
  netAssetValue: number;
  capitalizationRate: number;
  assetValueOnlyReason?: UnlistedAssetValueOnlyReason;
  /** 부동산과다보유법인 — 가중치 반전(순손익2:순자산3, 상증령 §54① 본문 괄호). 미지정 시 false. */
  isRealEstateHeavy?: boolean;   // ← 신규
}
```

`InheritanceTaxInput`·`GiftTaxInput`·`PropertyValuationResult`·`HeirAllocation` 등 기타 타입 **변경 없음** (estateItems/giftItems 통째 전달).

## 엔진 result 타입

**변경 없음.** 기존 `PropertyValuationResult { estateItemId, method, valuatedAmount, breakdown, warnings }`에 주식 결과가 추가될 뿐. `grossEstateValue`/`grossGiftValue`/`valuatedAmountById`/`heirAllocationResult` 구조 그대로.

---

## 계산 알고리즘 (단계별)

### A. `evaluateAllEstateItems` 주식 평가 포함 (`property-valuation.ts`)

**신규 import 추가** (property-valuation.ts 상단): `import { computeStockValuation } from "./valuation/resolve-estate-item-value";` — `resolve-estate-item-value.ts`는 property-valuation.ts를 import하지 않으므로 **순환 없음**(단방향, 확인 완료).

```ts
// 신규 어댑터
function evaluateStockAsPropertyResult(item: EstateItem): PropertyValuationResult {
  const amount = computeStockValuation(item);          // 단일 진실 (resolve-estate-item-value.ts)
  const isListed = item.category === "listed_stock";
  return {
    estateItemId: item.id,
    method: isListed ? "market_value" : "book_value",
    valuatedAmount: amount,
    breakdown: [{
      label: isListed ? "상장주식 평가액" : "비상장주식 평가액(간편)",
      amount,
      lawRef: isListed ? VALUATION.LISTED_STOCK : VALUATION.UNLISTED_FORMULA,
    }],
    warnings: amount === 0 ? ["주식 평가액 0 — 입력(주식수·시세/순손익·순자산) 확인"] : [],
  };
}
```

`evaluateAllEstateItems` 수정:
1. **필터에서 주식 배제 라인 제거** (전 항목 통과).
2. `.map` 라우팅 (순서 중요):
   - `unlistedStockValuationV2` 있음 → `evaluateUnlistedStockV2AsPropertyResult(i)` (기존, 무변경)
   - `listed_stock` 또는 `unlisted_stock`(V1) → `evaluateStockAsPropertyResult(i)` (신규)
   - 그 외 → `evaluateEstateItem(i)` (기존)
3. ⚠️ `evaluateEstateItem`의 주식 `throw` 분기(L336-341)는 위 라우팅으로 **도달하지 않음** (방어용 유지).

→ `grossEstateValue`(inheritance-tax.ts:82) / `grossGiftValue`(gift-tax.ts:72) 및 `valuatedAmountById`(inheritance-tax.ts:522) 자동 교정.

### B. `isRealEstateHeavy` 배선 (`resolve-estate-item-value.ts:86`)

```ts
// 현재: calcUnlistedStockPerShareValue(d, false)
// 수정: calcUnlistedStockPerShareValue(d, d.isRealEstateHeavy ?? false)
```
이 단일 함수가 sidebar·validation·result·가업/영농 공제로 전파 (단일 진실 — 의도된 개선).

### C. 협의분할 귀속 (변경 없음 — 기존 동작 활용)

`calcHeirAllocation`(inheritance-allocation.ts:212) → `resolveAllocationsByHeir`(L150):
- `heirAllocations` 있음 → 그 합 (이미 동작 — 실측 확인).
- 미입력 → `valuatedAmountById.get(id)`(이제 주식 포함) × 법정상속분.

A 적용으로 `valuatedAmountById`에 주식 id가 들어가므로, **협의분할 미입력 주식도 법정상속분 자동 배분**된다("다른 자산과 마찬가지로" — 사용자 요구 충족).

### D. validation 합계검증 (`inheritance-validate.ts:50-68`)

```ts
// 현재: item.category === "listed_stock" ? computeStockValuation(item) : undefined
// 수정: (item.category === "listed_stock" || item.category === "unlisted_stock") ? computeStockValuation(item) : undefined
```
expectedTotal 후보에 V1 비상장 평가액 포함 → 합계≠평가액 차단 활성 (C9). 엔진·UI·validation 3자 동일 함수원.

### E. Zod 스키마 (`lib/validators/property-valuation-input.ts:11` `unlistedStockDataSchema`)

```ts
// .superRefine 직전 객체에 추가
isRealEstateHeavy: z.boolean().optional(),
```
⚠️ **plain `z.object` → 미정의 키 침묵 제거**. 누락 시 route `safeParse`가 `isRealEstateHeavy` 제거 → 엔진 미도달(TS 미감지). 상속(`inheritanceTaxInputSchema.estateItems`, L649)·증여(`giftTaxInputSchema.giftItems`, L692) **모두 `estateItemSchema → unlistedStockItemSchema → unlistedStockDataSchema` 공용** → 1곳 수정으로 양측 적용 (확인 완료).
- optional이라 마이그레이션 불필요: 증여 `giftTaxResumeInput` 복원·상속 useState 모두 구 데이터에 `isRealEstateHeavy` 없음 → read 시 `?? false`.

---

## Silent fallback / 자동 안분 후보 식별

- **신규 자동 안분 없음.** 법정상속분 fallback(C1·C3)은 민법 §1009 기존 동작 — 협의분할 미입력 자산에 한함.
- `isRealEstateHeavy ?? false`: 미입력은 "일반 법인"이라는 법령상 기본값 (자동 추정 아님 — 토글 OFF = 일반).
- V1 평가 불가(주식수 0 등) → `computeStockValuation` 0 반환 → warning만, 자동 보정 없음.
- 협의분할 합계 ≠ 평가액 → §4-4 validation 차단 (자동 보정 금지).

---

## 테스트 약속

- 케이스 인벤토리 C1~C9 전 행 anchor (RED→GREEN).
- **회귀 영구 가드**: 주식+`grossEstateValue`/`grossGiftValue` 단언이 현재 0건 → 본 anchor가 재발 방지.
- 자기일관성: `grossEstate(주식 1건) === computeStockValuation(item)`.
- 파급 회귀: `npm test` 전체 (V2·debt-allocation·perheir-json-roundtrip·가업/영농 공제·종부세).
- 절대값(예: 표준 V1 케이스 평가액)은 Pre-Do anchor에서 1회 산출 후 `toBe()` 고정.

---

## UI 통합 위임

- UI 명세: `stock-gross-estate-wiring.ui.design.md` (12단계 산출).
- 핵심 UI 변경(엔진 시니어 영역 아님): heavyMap local state → `unlistedStockData.isRealEstateHeavy` store 전환, effectiveValuation/prop threading 갱신. **`StockValuationForm`은 상속·증여 공용**이므로 1회 수정으로 양 폼 적용.
- **자동 반영(추가 UI 작업 불필요, 회귀 확인만)**: (a) 결과 per-heir 협의분할 표 — `directEstateAmount`에 주식이 이제 포함되어 자동 표시 (b) 사이드바·미리보기 — `computeStockValuation` 이미 사용 → 변동 없음 (c) 토글 — effectiveValuation>0이면 자동 활성화.
- 14 동기화 지점: ①타입 ②initial(handleAdd) ③N/A(useState) ④passthrough ⑤rose ToggleCard ⑥사이드바(자동) ⑦결과 breakdown ⑧validation(§D) **⑫Zod(§E 필수)** ⑬⑭무변경.

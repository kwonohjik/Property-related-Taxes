# 주식(상장·비상장 간편) 상속·증여재산 합계 누락 교정 + 협의분할 귀속 배선 계획서

> 부제: 사용자 트리거는 "비상장 간편평가 협의분할 토글 활성화"였으나, 실측 결과 근본 원인이 상장주식·증여세까지 공유하여 범위 확장(§9).
> 작성일: 2026-05-27 (검토 v2: 2026-05-28) · 상태: Plan (Pre-Do anchor 실증 완료 — 상속·증여 양측)
> 트리거: 사용자 보고 — "비상장법인 간편평가 시 '상속인·수유자별 협의분할 입력' 토글이 비활성화. 활성화하면 다른 자산처럼 협의분할 내용대로 해당 상속인에게 귀속되어야 함."

---

## 0. 한 줄 요약

토글 비활성화는 **표면 증상**이고, 근본 결함은 **간편평가(V1) 비상장주식 평가액이 상속세 `grossEstateValue`·증여세 `grossGiftValue`에 전혀 배선되지 않는 것**이다. 그 결과 협의분할을 입력해도 과세표준·산출세액이 0이 되어 귀속이 무의미해진다. 동일 결함이 **상장주식·증여세**에도 존재한다. 부수적으로 (a) `isRealEstateHeavy` 플래그가 엔진 미도달, (b) 비상장 협의분할 합계검증이 validation에서 누락(§4-4)됨도 함께 교정한다.

---

## 1. Pre-Do anchor 실증 결과 (가정 금지 — 실측)

`calcInheritanceTax`·`calcGiftTax`를 직접 호출한 throwaway probe로 확인 (이후 삭제):

**상속세 (`grossEstateValue`)** — 자산 1건, 상속인 배우자+자녀:

| 입력 | `grossEstateValue` | 비고 |
|---|---:|---|
| 아파트 `marketValue` 4,360,000,000 | **4,360,000,000** | 대조군 정상 |
| **listed_stock** (avg 70,000 × 10,000주) | **0** | ❌ 누락 |
| **unlisted_stock V1 간편** (순손익·순자산 입력) | **0** | ❌ 누락 |
| unlisted_stock + `marketValue` 설정 | **0** | ❌ category 필터로 marketValue조차 무시 |

**증여세 (`grossGiftValue`)** — 직계존속 증여, probe 실측 (2026-05-28):

| 입력 | `grossGiftValue` | 비고 |
|---|---:|---|
| 아파트 `marketValue` 1,000,000,000 | **1,000,000,000** | 대조군 정상 |
| **listed_stock** | **0** | ❌ 누락 |
| **unlisted_stock V1 간편** | **0** | ❌ 누락 |

추가 실측:
- 상속세 V1 주식에 `heirAllocations:[{h2, 4.36B}]` 입력 시 → `perHeir["h2"].directEstateAmount = 4,360,000,000` (귀속은 됨) **그러나 `grossEstateValue = 0`** → `taxBase = 0` → 전 상속인 `finalTax = 0`.
- 기존 테스트 전수 조사: `calcInheritanceTax`/`calcGiftTax` × (listed/V1 unlisted) × `grossEstateValue`·`grossGiftValue` 단언 **0건** → 버그가 테스트 공백에 묻혀 있었음 (5,000+ PASS와 무관).

---

## 2. 근본 원인 (file:line)

### 2-1. 평가 필터가 주식을 배제
`lib/tax-engine/property-valuation.ts:363-379` `evaluateAllEstateItems`:

```ts
.filter((i) => {
  if (i.category === "unlisted_stock" && i.unlistedStockValuationV2) return true; // V2만 통과
  return i.category !== "listed_stock" && i.category !== "unlisted_stock";        // listed·V1 전부 배제
})
```

- 주석: *"그 외 listed_stock / legacy 비상장주식(unlistedStockData)은 **호출부에서 별도 처리** 또는 marketValue 사용"* — 그러나 그 "별도 처리"가 오케스트레이터에 **구현되지 않음**.

### 2-2. 오케스트레이터는 이 함수에만 의존
- `lib/tax-engine/inheritance-tax.ts:80` `const valuationResults = evaluateAllEstateItems(input.estateItems);` → `grossEstateValue`(82) + `valuatedAmountById`(522) 둘 다 여기서만 파생. (`evaluateAllEstateItems` 호출처는 이 2곳뿐 — grep 확인, 회귀 반경 작음)
- `lib/tax-engine/gift-tax.ts:71-72` 동일 패턴 (`evaluateAllEstateItems(input.giftItems)` → `grossGiftValue`). **증여세 동일 결함** (필드명은 `grossGiftValue`). 단, 증여세는 per-donee 과세라 **협의분할(heirAllocations)·heir 배부 없음** → 증여세 수정 효과 = **평가 합계 교정만**.
- 폼은 주식을 category 그대로 전달 — marketValue·평가액 주입 없음:
  - 상속세 `InheritanceTaxForm.tsx:254` `[...estateItems,...stockItems].map(resolveActiveUnlistedValuation)` → `estateItems`(297).
  - 증여세 `GiftTaxForm.tsx:611` `[...giftItems,...stockItems].map(resolveActiveUnlistedValuation)` → `giftItems`(629).
  - `app/api/calc/inheritance/route.ts:72`는 `estateItems`를 `calcInheritanceTax`에 그대로 전달.

### 2-3. `isRealEstateHeavy` 데이터-흐름 단절 (부수 결함)
- `UnlistedStockData` 타입(`inheritance-gift.types.ts:217-243`)에 부동산과다보유법인 플래그 **없음**.
- 폼에서는 `StockValuationForm.tsx:506` `heavyMap`(React local state)으로만 보관 → 엔진 미도달.
- `computeStockValuation`(`resolve-estate-item-value.ts:86`)은 V1을 `calcUnlistedStockPerShareValue(d, false)`로 **`false` 하드코딩** → 부동산과다보유법인도 일반 가중치(3:2)로 오평가.

### 2-4. 협의분할 토글 게이트 (표면 증상)
- `HeirAllocationToggleSection.tsx:41` `isDisabled = !canDistribute || effectiveValuation === 0`.
- 스크린샷은 전 항목 미입력 → `effectiveValuation === 0` → "평가액을 먼저 입력하세요"로 비활성. **구조적 잠금이 아님** — 주식수·순손익·순자산 입력 시 UI의 `effectiveValuation`(StockValuationForm.tsx:310-332, `calcUnlistedStockPerShareValue` 독립 계산)이 >0이 되어 **토글은 자동 활성화됨**.
- 즉 토글 자체는 손볼 필요 없음. 단, 활성화 후 귀속이 유의미하려면 §2-1~2-3 엔진 배선이 선행돼야 함.

---

## 3. 영향 범위 (Blast Radius)

| 영역 | 현재 | 수정 후 효과 | 비고 |
|---|---|---|---|
| 상속세 — 상장주식 | grossEstate 누락(=0) | grossEstate 포함 + 협의분할/법정분 귀속 | ❌→✅ |
| 상속세 — 비상장 간편(V1) | grossEstate 누락(=0) | 동상 | ❌→✅ (사용자 보고) |
| 상속세 — 비상장 정식(V2) | 정상 | 무변경 (회귀 보호) | ✅ (`unlistedStockValuationV2` 통과) |
| 증여세 — 상장·V1 | `grossGiftValue` 누락(=0) | grossGiftValue 포함 (**협의분할 무관 — per-donee**) | ❌→✅ (`gift-tax.ts:71-72`) |
| 사이드바/미리보기 합계 | 주식 포함(`computeStockValuation`) | 결과와 일치 | 현재 **결과와 불일치**(사용자가 체감하는 모순) → 해소 |
| 가업·영농 공제 자산합계 | V1 heavy 미반영(`false` 고정) | heavy 가중치 반영 | family-business.ts:132 파급(§4-2) |

---

## 4. 수정 설계

### 4-1. (핵심) `evaluateAllEstateItems` — 모든 주식 평가 포함
`property-valuation.ts`에 주식 → `PropertyValuationResult` 어댑터 추가:

```ts
// 신규: listed + V1 simple unlisted 어댑터 (V2는 기존 evaluateUnlistedStockV2AsPropertyResult 유지)
function evaluateStockAsPropertyResult(item: EstateItem): PropertyValuationResult {
  const amount = computeStockValuation(item); // resolve-estate-item-value.ts (단일 진실)
  const method: ValuationMethod = item.category === "listed_stock" ? "market_value" : "book_value";
  // listed: §63①1가(전후 2개월 평균=시가 간주) / V1 unlisted: 시행령 §54 보충적 평가(장부가 기반)
  return {
    estateItemId: item.id, method, valuatedAmount: amount,
    breakdown: [{
      label: item.category === "listed_stock" ? "상장주식 평가액" : "비상장주식 평가액(간편)",
      amount,
      lawRef: item.category === "listed_stock" ? VALUATION.LISTED_STOCK : VALUATION.UNLISTED_FORMULA, // §63①1호 / 시행령 §54①
    }],
    warnings: amount === 0 ? ["주식 평가액 0 — 입력(주식수·시세/순손익·순자산) 확인"] : [],
  };
}
```

`VALUATION.LISTED_STOCK`("상증법 §63 ① 1호")·`VALUATION.UNLISTED_FORMULA`("상증령 §54 ①")는 `legal-codes/inheritance-gift.ts:113·121`에 실재 확인.

- **`.map` 라우팅 (필수)**: 필터에서 주식 배제 라인 제거 후, `.map` 분기에서 (1) `unlistedStockValuationV2` 있으면 `evaluateUnlistedStockV2AsPropertyResult`, (2) `listed_stock` 또는 V1 unlisted면 `evaluateStockAsPropertyResult`, (3) 그 외 `evaluateEstateItem`. **⚠️ 필터 라인만 제거하면 주식이 `evaluateEstateItem`(property-valuation.ts:336-341)의 `throw` 분기로 빠지므로, `.map` 라우팅을 반드시 함께 추가**.
- 단일 진실: `computeStockValuation`은 listed(§63②3호 증자신주 포함)/V1/V2 전부 이미 처리(`resolve-estate-item-value.ts:51-93`). 엔진↔엔진 import라 역전 없음. [[single-source-engine-helper]]
- `method`·`lawRef`는 실제 enum·`VALUATION.*` 상수 확인 후 사용(추정 금지 — Design에서 확정). `ValuationMethod` = market_value·similar_sales·standard_price·appraisal·acquisition_cost·book_value (확인됨).
- 효과: `grossEstateValue`/`grossGiftValue`·`valuatedAmountById` 동시 교정 → (상속) 법정상속분 fallback(미입력 자산)과 `heirAllocations` 명시 귀속(이미 동작) **둘 다** 올바른 per-heir `finalTax` 산출 / (증여) 평가 합계 교정.

### 4-2. `isRealEstateHeavy` 엔진 배선 (V1 정확도)
- `UnlistedStockData`(`inheritance-gift.types.ts:217`)에 `isRealEstateHeavy?: boolean` 추가.
- `computeStockValuation` V1 분기(`resolve-estate-item-value.ts:86`) → `calcUnlistedStockPerShareValue(d, d.isRealEstateHeavy ?? false)` (현재 `false` 하드코딩).
- 폼 (`StockValuationForm.tsx`, **상속·증여 공용**): `heavyMap` local state(506) + `onUpdateHeavy`(288·301·398·600) + `handleHeavy`(541) + `TotalStockValue` heavyMap 인자(430·433·453·665) **일괄 제거**. 대신 `unlistedStockData.isRealEstateHeavy`에 직접 저장 (`UnlistedStockSimpleFields`의 rose ToggleCard `onChange`에서 `setStock({ isRealEstateHeavy })`) — `useEffect → store` 미러링 금지 [[feedback_useeffect_store_mirror_forbidden]].
- **UI 파생값 갱신**: `UnlistedStockCard.effectiveValuation` useMemo(`StockValuationForm.tsx:310-332`)와 `UnlistedStockSimpleFields`의 `isRealEstateHeavy` prop은 `item.unlistedStockData.isRealEstateHeavy ?? false`에서 읽도록 전환 (prop threading 정리).
- **③ normalize = N/A**: 상속세 폼은 `useState<FormState>(INITIAL_FORM)` 인메모리 — sessionStorage normalize/persist 레이어 없음(`shared.ts` INITIAL_FORM stockItems=[]). 증여세는 `giftTaxResumeInput` hydration 있으나 normalize 없음. 신규 필드는 optional + read 시 `?? false` fallback이라 마이그레이션 불필요.
- **파급 호출처 (단일 진실 = 의도된 개선, 회귀 점검 대상)**: `computeStockValuation`/`resolveEstateItemValue` 변경이 다음에 전파 — ⓐ validation(`inheritance-validate.ts:59`, listed만) ⓑ 사이드바·미리보기(`StockValuationForm:70·438`) ⓒ 결과뷰 자산합계(`InheritanceTaxResultView:82·88` ← `getValuatedAmount`) ⓓ **가업·영농 공제**(`family-business.ts:132`·`inheritance-deduction-suggest.ts`). V1 부동산과다보유 회사가 있는 기존 anchor가 있으면 값 변동 → 전체 `npm test` 필수.
- **⑫ Zod 스키마 = 변경 필수 (silent-strip 함정)**: `unlistedStockDataSchema`(`lib/validators/property-valuation-input.ts:11`)는 `.superRefine()` 붙은 plain `z.object` → **미정의 키 침묵 제거**. `isRealEstateHeavy: z.boolean().optional()` **추가 필수**. 누락 시 route `safeParse`가 제거 → 엔진 미도달(TS 미감지). **상속·증여 공용 스키마**(`estateItemSchema → unlistedStockItemSchema → unlistedStockDataSchema`, gift route도 사용)라 1곳 수정으로 양측 적용. [[feedback_api_zod_schema_sync]]
- 14 동기화 지점: ① 타입 ② initial(`handleAdd` 기본값, StockValuationForm:514-524) ③ ~~normalize~~ N/A(useState 인메모리) ④ API passthrough(estateItems/giftItems 그대로) ⑤ UI 토글 위젯(rose ToggleCard) ⑥ 사이드바(`computeStockValuation` 자동 반영) ⑦ 결과(주식 평가 breakdown) ⑧ validation(§4-4) **⑫ Zod `unlistedStockDataSchema`(필수)**. ⑬⑭(body spread·route 매핑)는 estateItems/giftItems 통째 전달이라 무변경.

### 4-3. 토글
- 비활성 조건 **변경 없음** (`effectiveValuation === 0` 게이트는 올바른 UX). §4-1·4-2 적용 후 입력 시 자동 활성화·귀속 유의미.
- (선택) `disabledReason` 문구를 "주식 수·순손익·순자산가치를 먼저 입력하세요"로 비상장 맥락에 맞게 보강.

### 4-4. (신규 — Round 2 발견) 비상장 협의분할 합계검증 누락 교정 (⑧)
`lib/calc/inheritance-validate.ts:50-68` `validateEstateItemAllocations`의 expectedTotal 후보 배열이 **`listed_stock`만** `computeStockValuation` 위임:
```ts
item.category === "listed_stock" ? computeStockValuation(item) : undefined,  // 현재 — 비상장 누락
```
→ V1 비상장은 marketValue/standardPrice/appraisedValue가 없으면 `candidates=[]` → `return null`(**검증 건너뜀**). 협의분할 합계 ≠ 평가액이어도 차단 안 됨.
- **수정**: `(item.category === "listed_stock" || item.category === "unlisted_stock") ? computeStockValuation(item) : undefined`. 엔진 `valuatedAmountById`·UI `effectiveValuation`과 동일 함수 → 3자 일치 보장 [[single-source-engine-helper]] [[feedback_validation_sync_8th_point]].
- 효과: C9(합계≠평가액) rose 차단 활성. UI 통과↔validate 차단 모순 해소.

---

## 5. 케이스 매트릭스 (Design 단계 확정 — 행 ≥ 1 필수)

| # | 시나리오 | 기대 |
|---|---|---|
| C1 | V1 단독, 협의분할 OFF, 상속인 2인 | grossEstate = 평가액, 법정상속분 fallback 배분, finalTax > 0 |
| C2 | V1 단독, 협의분할 ON 자녀 100% | 자녀 directEstateAmount = 평가액, 자녀 finalTax > 0, 배우자 0 |
| C3 | V1 + 아파트 혼합, 주식만 협의분할 | 주식=협의분할, 아파트=법정상속분 |
| C4 | V1 부동산과다보유법인 ON | 가중치 2:3 반영, grossEstate 정확 |
| C5 | listed_stock 단독 (상속) | grossEstate = avg×주식수 |
| C5b | listed §63②3호 증자신주(미상장) | grossEstate = (avg − 배당차액)×주식수 |
| C6 | V2 정식 (회귀) | 기존 동작 무변경 |
| C7 | 증여세 V1·listed (gift-tax.ts) | `grossGiftValue` 평가 포함. **협의분할/heir 배부 없음**(per-donee) — 평가 합계만 단언 |
| C8a | 적자(순손익 음수) V1, 순자산 양수 | §56① 단서 0 처리, 최소값(순자산 80%) 적용 |
| C8b | 순자산 음수 V1 | §55① 후단 자기자본 0 처리 |
| C9 | V1 + 부동산 혼합, 주식만 협의분할 ON, 합계 ≠ 평가액 | validation rose 경고(⑧, §4-4) — 합계검증 차단 |

> 케이스 ID는 디자인 문서(`stock-gross-estate-wiring.engine.design.md` 케이스 인벤토리)와 1:1 일치.

---

## 6. anchor 계획

- `__tests__/tax-engine/inheritance/stock-gross-estate-wiring.test.ts` — 상속세 C1~C5b·C6·C8a·C8b (grossEstateValue·perHeir.finalTax·directEstateAmount 단언). **회귀 방지 핵심: 주식+grossEstate 단언이 현재 0건이므로 이 anchor가 영구 가드.**
- `__tests__/tax-engine/inheritance-gift/gift-stock-gross-value.test.ts` — 증여세 C7 (grossGiftValue listed·V1 포함, 협의분할 없음).
- `__tests__/calc/inheritance-validate-stock-alloc.test.ts` — C9 (`validateEstateItemAllocations` V1 비상장 합계≠평가액 시 오류 문자열 반환 — §4-4 회귀 가드).
- 자기일관성 anchor: 엔진 `valuatedAmountById`(주식 id) === `computeStockValuation(item)` — UI `effectiveValuation`·validation expectedTotal과 동일 함수원이라 3자 일치.
- heavy anchor (C4): `isRealEstateHeavy:true`(2:3) ≠ false(3:2) 단언.
- 회귀: 기존 V2(C6)·debt-allocation·perheir-json-roundtrip 전수 통과.

---

## 7. 단계 (Do)

에이전트: Plan/Design 병렬 → Do 시퀀셜 (`inheritance-gift-tax-senior` + 서브 `property-valuation-senior` 엔진 선처리 → `inheritance-gift-tax-ui-senior` UI). [[feedback_pdca_session_efficiency]]

1. **엔진(시퀀셜 선처리)**: §4-1 어댑터 + `.map` 라우팅 + 필터 수정 → §4-2 `UnlistedStockData.isRealEstateHeavy` + `computeStockValuation` heavy → §4-4 validation 후보 unlisted 추가 → anchor 전 케이스(C1~C9, C5b·C8a·C8b 포함) RED→GREEN.
2. **UI**: §4-2 폼 heavyMap→store 전환(상속·증여 공용 StockValuationForm), effectiveValuation/prop threading 갱신, 토글 문구(§4-3). 14지점 self-grep(⑫⑬⑭ — 본 건은 신규 enum/입력객체 없음, optional 필드라 Zod 무변경).
3. **Check**: `ui-engine-sync-checker` + `npx tsc --noEmit` + `npx vitest run __tests__/tax-engine/inheritance/ __tests__/tax-engine/inheritance-gift/ __tests__/calc/` + 전체 `npm test` (증여세·종부세·공제 파급 §4-2).
4. **브라우저 확인**: Playwright e2e — V1 입력→토글 자동 활성→자녀 100% 협의분할→결과 per-heir finalTax > 0 + grossEstate에 주식 반영 ([[feedback_browser_verify_with_playwright]]).

---

## 8. 리스크·정책

- **회귀 위험 낮음**: 주식이 0이던 동작에 의존하는 테스트 0건 확인. 단 grossEstate 변화로 기존 "주식 포함 시나리오"가 있었다면 영향 — 전체 `npm test` 필수.
- 법령 정확성: §63①1가(상장)·시행령 §54(비상장 가중)·§55①·§56① — 평가 산식은 `computeStockValuation`/`calcUnlistedStockPerShareValue` 기존 엔진 그대로 (신규 산식 없음). [[feedback_tax_calculation_principle]]
- 자동 안분 fallback 금지 정책과 무관 (법정상속분 fallback은 §1009 기존 동작).
- 800줄: `property-valuation.ts` 현재 449줄 + 어댑터 ~15줄 → ~465줄, 정책 여유.
- **⑫ Zod = 변경 필수(silent-strip)**: `unlistedStockDataSchema`(property-valuation-input.ts:11, plain `z.object` → 미정의 키 제거)에 `isRealEstateHeavy: z.boolean().optional()` 추가. 누락 시 route safeParse가 제거 → 엔진 미도달(TS 미감지). 상속·증여 공용. ⑬⑭(body spread·route 매핑)는 estateItems/giftItems 통째 전달이라 무변경.

---

## 9. 범위 확정 (사용자 승인 2026-05-27)

1. ✅ **근본 원인 전체 교정**: `evaluateAllEstateItems` 단일 함수 수정으로 **상속세 + 증여세 × (상장주식 + V1 간편 비상장)** 모두 `grossEstateValue`·`valuatedAmountById` 배선. (C5·C7 포함)
2. ✅ **`isRealEstateHeavy` 동시 배선**: §4-2 — `UnlistedStockData` 필드 추가 + 폼 `heavyMap` → store 전환. V1 가중치(3:2/2:3) 교정 포함.

→ §4-1·4-2(⑫ Zod 포함)·4-3·4-4 전부 본 PR 범위. §5 케이스 매트릭스 전 행(C1~C9, C5b·C8a·C8b 포함) 전수 anchor.

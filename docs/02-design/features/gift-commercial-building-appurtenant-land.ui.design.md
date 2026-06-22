# 증여세·상속세 상업용 건물 — 부수토지 보충평가 합산 — UI 설계

> v2 정정(2026-06-22): 부수토지 위젯=2번째 StandardPriceInput·단일 총액 필드·면적 dual-truth 해소 반영
>
> Plan: `docs/00-pm/gift-commercial-building-appurtenant-land.plan.md`
> 엔진 설계: `docs/02-design/features/gift-commercial-building-appurtenant-land.engine.design.md`
> 작성일: 2026-06-22
> 담당: inheritance-gift-tax-ui-senior
> 법령 검증: Plan §2·엔진 설계 §법령 근거 (KoreanLaw MCP MST 276123, 상증법 §61, 2026-01-02 시행) 직접 확인.
> 설계 전제(v2 확정): **부수토지 위젯 = 2번째 `StandardPriceInput`(propertyKind="land", area-mode) — `onTotalPriceChange`로 총액 emit → `appurtenantLandStandardPrice` 단일 필드에 저장. 단가·면적 곱셈·반올림은 위젯 내부 처리(면적 dual-truth 원천 제거). v1의 "대안 (A) — 신규 영구 필드 0" 전제는 plan v2(§0 must-fix #1~#4)에서 폐기됨.**

---

## 0. 한 줄 요약

`EstateBodyRealEstate.tsx`의 보충평가 토글(emerald, `supplementaryOpen`) 내부에
`real_estate_building` 카테고리 전용 **§61① 경로 라디오** (`RadioCardGroup`)와
경로 B 선택 시 **부수토지 합산 위젯** (`AppurtenantLandSection`)을 추가한다.

경로 B 부수토지 위젯: **2번째 `StandardPriceInput`(propertyKind="land", area-mode)** — `StandardPriceInput.tsx:77~78`의 `isAreaMode=true`(land/building_non_residential)에 의해 내부에서 `Math.floor(단가×면적)` 총액을 `onTotalPriceChange`로 emit(`:109·122·145`). 총액을 `appurtenantLandStandardPrice`(영구 저장 필드)에 저장. 건물용 `StandardPriceInput`(`:252`)과 동일 계약.

저장 필드: `standardPrice`(건물분) + `appurtenantLandStandardPrice`(부수토지 총액) **2개 필드**.

엔진(`evaluateDetachedHouse`)은 `standard_price` method 시 두 필드를 합산하여 `valuatedAmount` 산출(엔진 설계 §3-2 참조).
Zod(`estate-item-schema.ts buildingItemSchema`)·사이드바(`computeEffectiveValuation`)·validate
(`validateEstateItemAllocations`)는 **⑥ dual-truth 합산 게이트 필요** (plan v2 §4 ⑥ 참조 — 자동 반영 아님).
UI 신규 작업: **⑤ 경로 라디오 + AppurtenantLandSection(2번째 StandardPriceInput)** + **Zod ①·⑥ 동기화** + 선택적 **⑦ 결과 카드 breakdown 2행**.

---

## 1. 법령 근거 (KoreanLaw MST 276123 직접 확인 — 2026-01-02 시행)

### 상증법 §61① 전문 (부동산 보충적 평가)

```
1호  토지: 개별공시지가 (없으면 인근 유사 토지, 배율방법 지역 제외)
2호  건물(3·4호 제외): 매년 1회 이상 국세청장이 산정·고시하는 가액 (건물 기준시가)
3호  오피스텔 및 상업용 건물: "건물에 딸린 토지를 공유(共有)로 하고 건물을 구분소유하는
     것으로서 대통령령으로 정하는 것"에 대해 국세청장이 토지와 건물을 일괄하여 산정·고시한
     가액 ("이들에 딸린 토지를 포함한다")
4호  주택: 개별주택가격 및 공동주택가격
⑤  임대차계약 재산: ①~④ 평가액과 임대료환산가액(상증령 §50⑦) 중 큰 금액
```

### 상증령 §50③ (§61①3호 "대통령령으로 정하는" 범위)

```
국세청장이 해당 건물의 용도·면적 및 구분소유하는 건물의 수 등을 고려하여
지정하는 지역에 소재하는 오피스텔 및 상업용 건물(이들에 부수되는 토지 포함)
```

### 상증령 §50⑧ (임대료환산가액의 토지·건물 안분 — KoreanLaw MST 283637 §50⑧, 2026-02-27 시행 직접 확인)

```
⑧ 제7항의 임대료 등의 환산가액을 적용하여 토지와 건물의 소유현황 등에 따른 가액을
   계산할 때에는 다음 각 호의 방법으로 한다.
1호 토지와 건물의 소유자가 동일한 경우: 임대료환산가액을 법 §61①~④로 평가한 토지와
   건물의 가액(기준시가)으로 나누어 계산한 금액을 각각 토지와 건물의 평가가액으로 한다.
2호 토지와 건물의 소유자가 다른 경우(가·나목)
```

> 임대료환산가액(§61⑤)이 채택되는 경우, 상증령 §50⑧은 그 환산가액을 §61①~④ 토지·건물
> **기준시가로 나누어 각각 토지·건물 평가가액으로 배분**하도록 강제한다. 경로 B(분리)에서 임대료환산가액이
> 합산 standardPrice를 초과하여 채택되면(C-R1), 부담부증여 §159 안분(C-BD-b)의 건물/토지 split이
> standardPrice 기준 split과 또 달라진다 → C-R1 ∩ C-BD-b 교차 케이스(§2) 참조.

### UI 설계에 직결되는 결론

| 경로 | 조문 | 평가 방법 | 부수토지 | UI 분기 |
|------|------|----------|---------|--------|
| A (일괄고시) | §61①3호 | 국세청 일괄 고시 (토지 포함) | **고시 가액에 포함** — 별도 합산 시 이중계상 | 현행 단일 `standardPrice` 입력 유지 |
| B (분리) | §61①2호 + §61①1호 | 건물 기준시가 + 개별공시지가 × 면적 **각각 후 합산** | **별도 합산 필요 — 현재 누락** | 경로 B 합산 위젯 신설 |

> §61⑤ 임대료환산·§66 담보하한은 §61①~④ 평가액 합산 후 비교. `applyCollateralFloor`에 합산된
> `standardPrice`가 전달되므로 엔진 무변경으로 자동 정합 (엔진 설계 §계산 알고리즘 확인).

---

## 2. 케이스 매트릭스 (법령 본문·단서·각호 전수 enumerate)

| # | 시나리오 | category | method | 경로 | 합산 기대값 | 상태 |
|---|---------|----------|--------|------|-----------|------|
| C-A1 | §61①3호 일괄고시 — 경로 A(기본값) | real_estate_building | standard_price | A | `standardPrice` 그대로 (예: 7억) | ☐ TODO |
| C-B1 | §61①2호+1호 분리 — 신규 합산 (갭 해소) | real_estate_building | standard_price | B | 건물 5억 + floor(200만 × 100㎡) = 7억 | ☐ TODO |
| C-B2 | 경로 B — 건물 0 · 부수토지 2억 (건물 0 방어) | real_estate_building | standard_price | B | 2억 | ☐ TODO |
| C-B3 | 경로 B — 건물 5억 · 부수토지 미입력 | real_estate_building | standard_price | B | 5억 (0 처리, 검증 오류 아님) | ☐ TODO |
| C-MV | 시가 입력 — 부수토지 필드 무시 | real_estate_building | market_value | B(무시) | `marketValue` (통합액) | ☐ TODO |
| C-R1 | §61⑤ 임대료환산 MAX — 합산 기준 | real_estate_building | standard_price | B | max(7억, 임대료환산) | ☐ TODO |
| C-F1 | §66 담보하한 — 합산 기준 | real_estate_building | standard_price | B | max(7억, 저당금액) | ☐ TODO |
| C-BD-a | 부담부증여 + 경로 B — §159 분모 자동 반영 | real_estate_building | standard_price | B | 양도가액 분모 = 합산 7억 (`stdAtTransfer=standardPrice`) | ☐ TODO |
| C-BD-b | 부담부증여 + 경로 B — **해결책 (b) 확정**: 엔진 무변경(7억 왜곡 잔존) + 경고 노출 검증. split 5억/2억 기대값 없음 | real_estate_building | standard_price | B | `buildingStdAtTransfer`=합산 7억(왜곡 잔존, `gift-burdened-transfer-api.ts:105-106`) + 경고 텍스트 노출 (split anchor는 별도 과제) | ☐ TODO |
| C-R1 ∩ C-BD-b | **임대료환산가액 채택(§61⑤) + 부담부증여 경로 B 교차** — 상증령 §50⑧ 토지/건물 안분 미반영 | real_estate_building | standard_price | B | 임대료환산 > 7억 채택 시 §159 건물/토지 split이 standardPrice 기준과도 또 달라짐 → 현행 합산 전액 건물분 귀속 왜곡 잔존 + 경고(§7.6 임대료환산 케이스 포함) | ☐ TODO |
| C-S1 | 상속세 동일 EstateItem — 경로 B 분리 보충평가 | real_estate_building | standard_price | B | `valuatedAmount` = 7억 (상속 공유 자동 반영) | ☐ TODO |
| C-SD | 사이드바 dual-truth 없음 확인 | real_estate_building | standard_price | B | `computeEffectiveValuation` = 7억 (standardPrice passthrough) | ☐ TODO |
| C-VD | 협의분할 validate — 합산 기준 통과 | real_estate_building | standard_price | B | `validateEstateItemAllocations` 7억 입력 시 통과 | ☐ TODO |

> C-BD-b: 엔진 설계 §부담부증여 §159 교차 분석 참조. **해결책 (b) 경고 표시로 확정** (a 분리 입력은 별도 과제 이관).
> 이에 따라 **엔진 설계 §케이스 인벤토리 C-BD-b(line 37)·규칙(line 45)의 split 5억/2억 anchor를 명시적으로 폐기**하고
> 현행 왜곡(합산 7억 전액 건물분 귀속, `gift-burdened-transfer-api.ts:105-106`) 잔존 + UI 경고 노출 검증으로 대체 정정 완료.
> 두 문서의 C-BD-b anchor는 'split 검증' 없이 '엔진 무변경 + 경고'로 단일화됨 (cross-doc 정합). 미해결 §7.6·§12 참조.

---

## 3. 14개 동기화 지점 전수 점검

### v2 채택 요약 (plan v2 §0 확정)

부수토지 위젯을 **2번째 `StandardPriceInput`(propertyKind="land")** 으로 변경하고, 총액을
`appurtenantLandStandardPrice` **영구 저장 필드**에 보관. 엔진은 두 필드를 합산하여 `valuatedAmount`를 산출.
⑤ 위젯 구현 + ① 타입 + Zod(⑫) + ⑥ dual-truth 합산 게이트가 핵심 신규 작업.

| # | 지점 | 파일 | 영향 | 상태 |
|---|------|------|------|------|
| ① | 폼 상태 타입 | `lib/tax-engine/types/inheritance-gift-estate.types.ts` (`standardPrice` :55 인접) | **`appurtenantLandStandardPrice?: number`(부수토지 총액 영구 필드) 추가 필수.** `commercialBuildingValuationRoute?` 경로 상태 보존용도 추가(선택). v1의 3표시용 필드(`buildingStdPriceForDisplay?`·`appurtenantLandStdPriceForDisplay?`)는 필요 시 유지 가능하나, 부수토지 총액 필드는 표시용이 아닌 **영구 저장 필드**. | ❌ **신규 필드 추가** |
| ② | initial value | `components/calc/PropertyValuationForm.tsx:131` `newItem` 인라인 리터럴 | `appurtenantLandStandardPrice`는 optional → `undefined` 자동 초기값. 명시 불필요. | ✅ 자동 호환 |
| ③ | normalize fallback | sessionStorage 마이그레이션 | optional → 자동 호환 | ✅ 자동 호환 |
| ④ | API 변환 | `lib/calc/gift-api.ts` (`:43·88` `giftItems: allItems`)·`lib/calc/inheritance-api.ts` (`:71` `estateItems: input.estateItems`) | `resolveActiveUnlistedValuation` spread로 신규 optional 필드 자동 생존. **Zod ⑫ 통과가 진짜 게이트** — Zod 미추가 시 silent strip. | ✅ spread 자동 / 🔎 Zod 게이트 |
| ⑤ | UI 입력 위젯 | `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx:236~` (보충평가 토글 내부) | **신규 구현**: `real_estate_building` 게이트 + `RadioCardGroup`(§61 경로 A/B, tone=emerald, native 금지, 미선택도 배경 유지) + 경로 B 선택 시 `AppurtenantLandSection`(**건물분 `StandardPriceInput`(propertyKind=building_non_residential) + 부수토지 `StandardPriceInput`(propertyKind=land, area-mode) → `onTotalPriceChange`→`appurtenantLandStandardPrice`** + 합산 echo) | ❌ **신규 구현** |
| ⑥ | 사이드바·직접읽기 | `lib/calc/estate-item-valuation.ts computeEffectiveValuation`·`resolveEstateItemValue`·`inheritance-deduction-suggest.ts` 등 `item.standardPrice` 직접 read 지점 | **v1의 "자동 반영" 오판정 정정.** `StandardPriceInput` 2-필드 방식에서는 `standardPrice`(건물분)만 passthrough됨 → 사이드바·deduction-suggest 등 `item.standardPrice` 직접 read 지점에서 부수토지 누락 발생. `method==="standard_price"`일 때 `standardPrice + appurtenantLandStandardPrice` 합산 게이트 추가 필요. 엔진 권위값 위임 헬퍼 통일 권장. | 🔎 **`grep item.standardPrice` 전수 enumerate 후 확정 — silent 실패 위험 최상위** |
| ⑦ | 결과 카드 | `InheritanceTaxResultView.tsx:471~486`(valuationResults 렌더), `GiftTaxValuationFormTable.tsx` | 엔진이 합산 `valuatedAmount`를 반환하면 `vr.valuatedAmount` 자동 표시. 선택적 breakdown 2행(plan v2 §3-2 확인): `buildingStdPriceForDisplay`·`appurtenantLandStdPriceForDisplay` 표시용 필드 추가 시 가능. `GiftTaxValuationFormTable`은 별지 고정컬럼이라 단일 가액만(§8.3). | ✅ 합산 자동 / 🔎 breakdown 선택 |
| ⑧ | validation | **증여**: `components/calc/gift-tax-form-validate.ts`(※`lib/calc/gift-validate.ts`는 **코드베이스에 없음 — 부재 파일**. 증여는 단일 수증자, 협의분할 validate 없음) / **상속**: `lib/calc/inheritance-validate.ts:148~162 validateEstateItemAllocations` | **증여: 신규 차단 없음.** `appurtenantLandStandardPrice`는 optional(미입력=0). 증여 validate에 `lib/calc/gift-validate.ts` 인용 절대 금지(부재). **상속**: `resolveEngineValuatedAmount(item)`(:155) 호출 → ⑥ dual-truth 합산 게이트가 해소되면 `expected = 합산값`으로 자동 정합. **⑥ 해소가 ⑧ 선결 조건** (⑥ 미해소 시 UI 표시 5억·validate expected 5억·협의분할 7억 입력 시 차단 모순 발생). | ✅ 증여 무차단 / 🔎 상속 ⑥ 종속 |
| ⑨ | Zod enum (메인) | `ValuationMethod` enum·category enum | 무변경 | ✅ |
| ⑩ | Zod enum (컴패니언) | 동상 + `addPropertyRefines` | 무변경 | ✅ |
| ⑪ | acqDate fallback | N/A (증여세 EstateItem Date 없음) | 해당 없음 | ✅ |
| ⑫ | Zod 입력객체 | `lib/validators/estate-item-schema.ts:162~164 buildingItemSchema` | **`appurtenantLandStandardPrice: z.number().nonnegative().optional()` 필수 추가.** 누락 시 API 경유 후 silent strip — 부수토지 총액 엔진 미도달. `commercialBuildingValuationRoute` 추가 시 `z.enum(["lump","separated"]).optional()` 동기화. | ❌ **필수 추가** |
| ⑬ | body spread | `lib/calc/gift-api.ts:43 resolveActiveUnlistedValuation` spread | `appurtenantLandStandardPrice` spread 자동 생존(⑫ 통과 전제). | ✅ |
| ⑭ | Route 매핑·Date 변환 | `app/api/calc/inheritance/route.ts`, `app/api/calc/gift/route.ts` | `appurtenantLandStandardPrice: number` — Date 변환 무관 | ✅ |

**핵심 결론(v2)**: ① 타입 필드 추가 + ⑫ Zod 추가 + ⑤ 위젯 구현 + ⑥ dual-truth 합산 게이트가 필수 4대 작업.
증여 ⑧은 신규 차단 없음. 상속 ⑧은 ⑥ 해소 시 자동 정합.

---

## 4. 저장 필드 및 표시용 선택적 필드

### 4.1 영구 저장 필드 (plan v2 §0 확정 — 필수)

```ts
// lib/tax-engine/types/inheritance-gift-estate.types.ts (EstateItem에 추가)
// v2 확정: appurtenantLandStandardPrice는 표시용이 아닌 영구 저장 필드. Zod(⑫) 동기화 필수.

/** 부수토지 개별공시지가 총액(원) — StandardPriceInput(propertyKind="land", area-mode) onTotalPriceChange emit.
 *  경로 B(§61①2호+1호) 선택 시 엔진에서 standardPrice(건물분)와 합산하여 valuatedAmount 산출.
 *  미입력(undefined)은 0으로 처리 — 자동 안분 금지 정책에 따라 차단 없음. */
appurtenantLandStandardPrice?: number;
```

> `StandardPriceInput`의 `onTotalPriceChange`가 `Math.floor(단가×면적)` 총액을 emit(`:109·122·145`)하므로
> 단가·면적 필드를 별도 저장할 필요 없음 — 총액 1필드만. 면적 곱셈·반올림은 위젯 내부 처리(dual-truth 원천 제거).

### 4.2 경로 상태 보존 필드 (선택 — UI 상태 보존용)

```ts
/** §61① 보충평가 경로 선택 (UI 상태 보존용) — "lump" = 경로 A(일괄고시), "separated" = 경로 B(분리).
 *  기본값: "lump". 엔진 계산에 미사용. */
commercialBuildingValuationRoute?: "lump" | "separated";
```

### 4.3 breakdown 표시용 필드 (선택 — 결과 카드 2행 목적)

```ts
/** 경로 B 선택 시 건물 기준시가 별도 표시용 (합산 전 원시값 보존) — 엔진 계산에 미사용 */
buildingStdPriceForDisplay?: number;
/** 경로 B 선택 시 부수토지 개별공시지가 총액 표시용 (appurtenantLandStandardPrice와 동일값 복사) — 엔진 계산에 미사용 */
appurtenantLandStdPriceForDisplay?: number;
```

> 4.3 필드는 §8.2 InheritanceTaxResultView breakdown 2행 표시를 위한 보조 필드.
> `appurtenantLandStandardPrice`(4.1)와 값이 같으므로, Do 시 단일 필드로 통합 구현해도 무방.
>
> **추가 결정 시**: `lib/validators/estate-item-schema.ts buildingItemSchema`에 모든 추가 필드
> `z.number().nonnegative().optional()` / `z.enum(["lump","separated"]).optional()` 추가 필수(⑫).
> **4.1 `appurtenantLandStandardPrice`는 선택이 아닌 필수** — 미추가 시 Zod silent strip으로 엔진 미도달.

---

## 5. Silent Fallback 후보 식별 — 자동 안분 금지 확인

| 필드 | 미입력 처리 | 정책 결정 | 비고 |
|------|-----------|---------|------|
| 건물 기준시가 (경로 B, `standardPrice`) | 0 (엔진 합산: `0 + appurtenantLandStandardPrice`) | **0 처리** — 차단 않음 | C-B2: 건물 없고 부수토지만 있는 케이스 존재 |
| 부수토지 개별공시지가 총액 (`appurtenantLandStandardPrice`) | undefined→0 (엔진 `?? 0` 처리) | **0 처리** — 차단 않음 | C-B3: 부수토지 없는 건물 존재. 단가·면적 곱셈은 StandardPriceInput 내부 처리 — 총액만 emit |
| 경로 A 선택 시 `appurtenantLandStandardPrice` | 엔진에서 **무시** (경로 A는 `standardPrice` 단독 사용) | 이중계상 방지 — 엔진이 경로 A 시 합산 수행 않음(plan v2 §3-2 확인 필요) | 🔎 엔진 경로 A 분기 로직 Do 전 실측 |
| 경로 B에서 시가(`marketValue`) 존재 시 | `appurtenantLandStandardPrice` **무시** (시가 우선 — §60) | UI: 경로 B 라디오를 보충평가 토글 내부에만 노출, 시가 입력 시 자동 비노출 | |

> `feedback_no_silent_apportion_fallback` 정책 적용: 어떤 필드도 자동 채움 금지.
> 부수토지 미입력(`appurtenantLandStandardPrice=undefined`)은 "부수토지가 없는 건물"로 합법적 처리 가능 → 검증 오류 차단 불필요.
> **v2 정정**: v1의 "부수토지 대지면적(㎡)" 별도 저장 행 삭제 — 면적은 StandardPriceInput 내부 state로 관리(`:84`), 별도 저장 불필요.

---

## 6. Cross-field 동기화 — useEffect 금지 선언

> **v2 정정**: v1의 "경로 B 합산 계산" 행은 `useMemo`+`standardPrice` 단일 write로 기술됐으나,
> v2에서는 `standardPrice`(건물분)와 `appurtenantLandStandardPrice`(부수토지 총액)가 **분리 저장**되므로
> 합산 계산은 엔진 레이어에서 수행. UI는 각 필드 `onChange`마다 해당 필드만 store에 write.

| 트리거 | 갱신 대상 | 구현 방법 | useEffect 금지 이유 |
|--------|---------|---------|-----------------|
| 경로 A 선택 (`commercialBuildingValuationRoute = "lump"`) | `appurtenantLandStandardPrice` 초기화(이중계상 방지) | 라디오 `onChange` 내에서 `set({ commercialBuildingValuationRoute: "lump", appurtenantLandStandardPrice: undefined })` | 무한 루프 차단 (`feedback_useeffect_store_mirror_forbidden`) |
| 경로 B 건물 StandardPriceInput 변경 | `standardPrice` 갱신 | `onTotalPriceChange` → `set({ standardPrice: v })` — StandardPriceInput 단방향 onChange | useEffect 불필요 — 위젯 내장 onChange |
| 경로 B 부수토지 StandardPriceInput 변경 | `appurtenantLandStandardPrice` 갱신 | `onTotalPriceChange` → `set({ appurtenantLandStandardPrice: v })` — 면적×단가 곱셈은 위젯 내부 | useEffect 불필요 — 위젯 내장 onChange |
| 보충평가 토글 OFF | 경로 라디오 상태 보존 (비파괴) | 현행 패턴 그대로 (`supplementaryOpen` toggle 상태만 변경) | 기존 정책 준수 |
| 시가·감정가·매매사례가 입력 시 | 경로 B 라디오 미노출 (보충평가 토글 내부) | 보충평가 토글이 내부에 포함되어 자동으로 미표시 | 조건부 렌더링으로 충분 |

---

## 7. UI 위젯 상세 — ⑤ EstateBodyRealEstate.tsx

### 7.1 삽입 위치

`EstateBodyRealEstate.tsx:236~276` 보충평가 토글(`supplementaryOpen`) 내부.

현행 코드 구조:
```tsx
<ToggleCard tone="emerald" title={SUPPLEMENTARY_LABEL[cat]} ...>
  <div className="space-y-2">
    {/* 지번 미입력 경고 */}
    <StandardPriceInput ... onTotalPriceChange={(v) => set({ standardPrice: parseAmount(v) || undefined })} />
    {propertyKind !== "land" && (
      <BuildingStdPriceModalButton ... onApply={(v) => set({ standardPrice: v })} />
    )}
  </div>
</ToggleCard>
```

> ⚠️ `BuildingStdPriceModalButton.onApply`는 **건물분만** 주입 (부수토지 합산 없음).
> 경로 B 선택 시 `BuildingStdPriceModalButton`·`StandardPriceInput.onTotalPriceChange`와
> `AppurtenantLandSection`이 동일 `standardPrice`를 경쟁 write하면 **하나가 소실**.
> 해결: 경로 B에서는 `StandardPriceInput`·`BuildingStdPriceModalButton`을 **숨기고**
> `AppurtenantLandSection`이 합산값을 단일로 write한다.

### 7.2 경로 분기 게이트 조건

```tsx
// EstateBodyRealEstate.tsx — 보충평가 토글 내부에 추가
const isCommercialBuilding = cat === "real_estate_building";
const valRoute = item.commercialBuildingValuationRoute ?? "lump"; // 기본값: 경로 A
```

### 7.3 §61 경로 라디오 — RadioCardGroup

```tsx
{/* ① §61 경로 선택 — real_estate_building 전용, 보충평가 토글 내부 최상단 */}
{isCommercialBuilding && (
  <RadioCardGroup
    name="commercial-building-valuation-route"
    layout="stack"
    value={valRoute}
    onChange={(v) => {
      const route = v as "lump" | "separated";
      set({
        commercialBuildingValuationRoute: route,
        // 경로 전환 시 표시용 필드 초기화 (합산 취소)
        buildingStdPriceForDisplay: undefined,
        appurtenantLandStdPriceForDisplay: undefined,
        // 경로 A로 복귀 시 기존 standardPrice 보존 (비파괴) — 상위 StandardPriceInput이 담당
      });
    }}
    options={[
      {
        value: "lump",
        label: "국세청 일괄고시 기준시가 (§61①3호)",
        description:
          "오피스텔·국세청이 지정한 대규모 상가. 건물에 딸린 토지가 고시 가액에 포함됩니다.",
        tone: "emerald",
      },
      {
        value: "separated",
        label: "건물 기준시가 + 부수토지 개별공시지가 분리 합산 (§61①2호·1호)",
        description:
          "일괄고시 비대상 건물. 건물 기준시가(§61①2호)와 부수토지 개별공시지가(§61①1호)를 각각 입력하면 자동 합산됩니다.",
        tone: "emerald",
      },
    ]}
  />
)}
```

### 7.4 경로 A (일괄고시) — 기존 위젯 그대로

```tsx
{/* ② 경로 A: 기존 StandardPriceInput + BuildingStdPriceModalButton 유지 */}
{(!isCommercialBuilding || valRoute === "lump") && (
  <>
    <StandardPriceInput
      ...
      onTotalPriceChange={(v) => set({ standardPrice: parseAmount(v) || undefined })}
    />
    {propertyKind !== "land" && (
      <BuildingStdPriceModalButton ... onApply={(v) => set({ standardPrice: v })} />
    )}
  </>
)}
```

### 7.5 경로 B (분리) — AppurtenantLandSection (신규 합산 위젯)

> **v2 정정**: v1의 `AppurtenantLandSection`은 `LandPriceLookupField`(단가 입력) + 별도 `DecimalInput`(면적)
> + 외부 `Math.floor` 합산 조합을 사용했다. v2에서는 **2번째 `StandardPriceInput`(propertyKind="land")**
> 으로 단순화 — 위젯 내부가 `Math.floor(단가×면적)` 총액을 `onTotalPriceChange`로 emit하므로
> 면적 state·외부 곱셈·finding 8 중복 곱셈 우려 모두 소거된다(plan v2 §8 must-fix #3·#4 해소).

```tsx
{/* ③ 경로 B: 건물분 StandardPriceInput + 부수토지 StandardPriceInput(2번째) */}
{/* ⚠️ valuationDate는 EstateBodyRealEstate 본체 prop(:123). named function이면 props 필수(TS2304). */}
{isCommercialBuilding && valRoute === "separated" && (
  <AppurtenantLandSection
    item={item}
    set={set}
    valuationDate={valuationDate}
  />
)}
```

#### AppurtenantLandSection 구현 명세 (v2 — StandardPriceInput 2개)

위치: `EstateBodyRealEstate.tsx` 내부 서브 컴포넌트 선언
(800줄 초과 시 `AppurtenantLandSection.tsx` 로 분리 — Do 착수 전 `wc -l EstateBodyRealEstate.tsx` 확인 필요).

```tsx
/**
 * AppurtenantLandSection — §61①2호+1호 분리 합산 위젯 (v2)
 * 경로 B 전용.
 * - 건물: StandardPriceInput(propertyKind="building_non_residential") → onTotalPriceChange → standardPrice
 * - 부수토지: StandardPriceInput(propertyKind="land", area-mode) → onTotalPriceChange → appurtenantLandStandardPrice
 * 단가×면적 곱셈·반올림은 각 위젯 내부 처리(StandardPriceInput.tsx:109·122·145).
 * useEffect 금지 — 각 위젯 onChange 단방향. 합산은 엔진 레이어.
 */
function AppurtenantLandSection({
  item,
  set,
  valuationDate,
}: {
  item: EstateItem;
  set: (patch: Partial<EstateItem>) => void;
  /** EstateBodyRealEstate 본체 prop(:123) — StandardPriceInput referenceDate용. */
  valuationDate?: string;
}) {
  return (
    <div className="space-y-3">
      {/* ① §61①2호 — 건물 기준시가 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">
            1
          </span>
          <p className="text-xs font-semibold text-emerald-700">건물 기준시가 (§61①2호)</p>
        </div>
        {/* 기존 StandardPriceInput(propertyKind="building_non_residential") — EstateBodyRealEstate:252와 동일 계약 */}
        <StandardPriceInput
          propertyKind="building_non_residential"
          valuationDate={valuationDate}
          initialTotalPrice={item.standardPrice}
          onTotalPriceChange={(v) => set({ standardPrice: v > 0 ? v : undefined })}
          hint="국세청이 매년 고시하는 건물 기준시가. 부수토지는 ② 에 별도 입력."
          data-testid="commercial-building-std-price"
        />
        {/* 건물 기준시가 계산 보조 모달 (건물분만 반환 확인됨 — BuildingStdPriceModalButton.tsx:78·83·88) */}
        <div className="flex justify-end">
          <BuildingStdPriceModalButton
            buttonLabel="건물 기준시가 계산"
            lockedTaxType="inheritance_gift"
            onApply={(v) => set({ standardPrice: v > 0 ? v : undefined })}
          />
        </div>
      </div>

      {/* ② §61①1호 — 부수토지 개별공시지가 (2번째 StandardPriceInput, propertyKind="land") */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">
            2
          </span>
          <p className="text-xs font-semibold text-amber-700">부수토지 개별공시지가 (§61①1호)</p>
        </div>
        {/*
         * propertyKind="land" → isAreaMode=true (StandardPriceInput.tsx:77~78)
         * area-mode: 단가(원/㎡) + 면적(㎡) 입력 → Math.floor(단가×면적) 총액 → onTotalPriceChange emit
         * 면적은 위젯 내부 state 관리(`:84`) — 별도 저장 필드 불필요
         * 총액이 appurtenantLandStandardPrice에 직접 저장 → 엔진 합산 입력
         */}
        <StandardPriceInput
          propertyKind="land"
          valuationDate={valuationDate}
          initialTotalPrice={item.appurtenantLandStandardPrice}
          onTotalPriceChange={(v) => set({ appurtenantLandStandardPrice: v > 0 ? v : undefined })}
          hint="부수토지(대지) 개별공시지가. 다필지는 면적 기준 가중평균 단가. 면적 입력 시 총액 자동 계산."
          data-testid="commercial-appurtenant-land-std-price"
        />
      </div>

      {/* 합산 결과 echo — 두 필드 합산 표시 (read-only) */}
      {((item.standardPrice ?? 0) + (item.appurtenantLandStandardPrice ?? 0)) > 0 && (
        <div className="rounded-md border border-emerald-300 bg-emerald-100/60 px-3 py-2 text-sm space-y-1"
             data-testid="appurtenant-land-combined-price">
          <p className="text-xs font-semibold text-emerald-700">보충적 평가 합계 (§61①2호+1호)</p>
          {(item.standardPrice ?? 0) > 0 && (
            <div className="flex justify-between text-xs text-emerald-800">
              <span>건물 기준시가 (§61①2호)</span>
              <span className="font-mono tabular-nums">{(item.standardPrice ?? 0).toLocaleString()}</span>
            </div>
          )}
          {(item.appurtenantLandStandardPrice ?? 0) > 0 && (
            <div className="flex justify-between text-xs text-emerald-800">
              <span>부수토지 개별공시지가 합계 (§61①1호)</span>
              <span className="font-mono tabular-nums">{(item.appurtenantLandStandardPrice ?? 0).toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-semibold text-emerald-900 border-t border-emerald-200 pt-1">
            <span>합계 보충적 평가액</span>
            <span className="font-mono tabular-nums">
              {((item.standardPrice ?? 0) + (item.appurtenantLandStandardPrice ?? 0)).toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
```

> **v2 단순화 요점**: v1의 `LandPriceLookupField`+`DecimalInput`+외부 `handleLandInputChange` 조합 대신
> `StandardPriceInput(propertyKind="land")`(area-mode) 단일 위젯으로 대체. 면적 state·외부 곱셈·finding 8
> 이중 곱셈 이슈 소거. echo 블록은 store 값(`item.standardPrice`·`item.appurtenantLandStandardPrice`)을
> 직접 읽어 표시 — 위젯 내부 local state와 분리된 단방향 표시(useEffect 불필요).
> `addrValue` prop 불필요(LandPriceLookupField 제거로 jibun 조회 불필요). props 시그니처 단순화.

### 7.6 부담부증여 + 경로 B — C-BD-b 경고 표시

경로 B 선택 + `item.burdenedGiftTransferTax !== undefined`(부담부증여 토글 ON) 동시인 경우,
§159 양도가액 안분 분자(`buildingStdAtTransfer`)에 건물분만 귀속되어야 하지만
현행 로직(`isLandType=false → buildingStdAtTransfer = stdAtTransfer = 합산 7억`)으로
부수토지분이 건물분에 포함되어 과대 계산될 수 있음을 결과 화면에 경고로 명시한다.

```tsx
{/* 부담부증여 + 경로 B 교차 경고 */}
{isCommercialBuilding && valRoute === "separated" && item.burdenedGiftTransferTax !== undefined && (
  <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1" data-testid="burdened-b-path-warning">
    부담부증여 양도소득세 계산 시 §159①2호 양도가액 안분은 건물 기준시가(§61①2호)와 부수토지(§61①1호)를
    분리하여 적용해야 합니다. 현재 구현은 합산 기준시가 전액을 건물분으로 처리하므로 토지 비율이 높은 경우
    결과에 차이가 발생할 수 있습니다.
    임대료환산가액(§61⑤)이 채택되는 경우에도 상증령 §50⑧에 따라 건물/토지 기준시가로 분리 안분해야 하나
    현행 구현은 이를 반영하지 않습니다. (추후 분리 입력 지원 예정)
  </p>
)}
```

> **finding 3 (상증령 §50⑧ 누락 보강)**: 경고 텍스트는 'standardPrice 합산' 왜곡뿐 아니라
> **임대료환산가액(§61⑤) 채택 시에도 상증령 §50⑧ 건물/토지 분리 안분 미반영**을 포함한다(§1 §50⑧·§2 C-R1 ∩ C-BD-b 참조).

### 7.7 UI 순서 = 엔진 계산 로직 순서

`evaluateDetachedHouse` → `resolveValuationAmount` → `applyCollateralFloor` 순서:

```
① 경로 A/B 선택 (§61①3호 vs §61①2호+1호)  ← 모드 토글, 영향 필드 직전 배치
② [경로 A] 단일 standardPrice 입력
② [경로 B] 건물 기준시가 (§61①2호)
③ [경로 B] 부수토지 개별공시지가 (§61①1호) — 단가(원/㎡)
④ [경로 B] 부수토지 대지면적 (㎡)
⑤ [경로 B] 합산 결과 echo
⑥ 담보·임대 필드 (CollateralLeaseFields — §66 하한·§61⑤ 임대료환산, 현행 분리 유지)
```

---

## 8. 결과 카드 — ⑦ InheritanceTaxResultView.tsx / GiftTaxValuationFormTable.tsx

### 8.1 현행 렌더 (자동 반영, 추가 작업 없음)

`InheritanceTaxResultView.tsx:471~486`:
```tsx
<div className="flex justify-between font-medium text-sm">
  <span>{assetNameById.get(vr.estateItemId) ?? "재산"}</span>
  <span>{formatKRW(vr.valuatedAmount)}</span>     {/* 합산값 자동 표시 */}
</div>
<p className="text-gray-400">
  평가방법: {{ standard_price: "보충적 평가", ... }[vr.method]}
</p>
```

합산 `standardPrice`가 `vr.valuatedAmount`로 자동 반영 — 현행 UI 무변경으로 충분.

### 8.2 선택적 추가 — breakdown 2행 표시 (InheritanceTaxResultView 자유형 리스트 한정)

> ⚠️ **스코프 주의 (finding 2·6)**: `InheritanceTaxResultView.tsx:471` 의 `result.valuationResults.map((vr, i) => ...)`
> 루프에는 **`vr`만 스코프에 있고 `item`(EstateItem)이 없다** — 이름조차 `assetNameById.get(vr.estateItemId)`로
> 별도 Map에서 조회한다. `GiftTaxValuationFormTable.tsx:214` 와 달리 `const item = itemMap.get(...)` 바인딩이 없으므로
> 아래 스니펫의 `item.*` 참조는 그대로는 `item` 미정의로 **컴파일 불가(TS2304)**.
> `estateItems` prop은 `InheritanceTaxResultView.tsx:65` 에서 이미 수신 중이므로,
> 루프 내부에 EstateItem 해소 코드를 명시한다 (`estateItems`는 optional → `?.find` 가드 필수).
>
> 본 §8.2 스니펫은 **InheritanceTaxResultView(자유형 리스트) 전용**이다.
> 증여세 결과(`GiftTaxValuationFormTable`)는 §8.3 참조 — breakdown 2행을 적용하지 않는다.

`item.buildingStdPriceForDisplay` / `item.appurtenantLandStdPriceForDisplay` 가 존재하는 경우 (InheritanceTaxResultView):

```tsx
{/* §61 경로 B 분리 breakdown (선택적 — 표시용 필드 있을 때만) */}
{(() => {
  // valuationResults.map 루프 내부: vr만 스코프에 있으므로 estateItems에서 EstateItem 해소
  const item = estateItems?.find((e) => e.id === vr.estateItemId);
  return (
    vr.method === "standard_price" && item?.buildingStdPriceForDisplay != null && (
      <div className="text-xs text-gray-500 space-y-0.5 mt-1">
        <div className="flex justify-between">
          <span>건물 기준시가 (§61①2호)</span>
          <span className="font-mono tabular-nums">{formatKRW(item.buildingStdPriceForDisplay)}</span>
        </div>
        {item.appurtenantLandStdPriceForDisplay != null && (
          <div className="flex justify-between">
            <span>부수토지 개별공시지가 (§61①1호)</span>
            <span className="font-mono tabular-nums">{formatKRW(item.appurtenantLandStdPriceForDisplay)}</span>
          </div>
        )}
      </div>
    )
  );
})()}
```

산식 한국어 표기:
```
보충적 평가액 = 건물 기준시가 (§61①2호) 500,000,000
             + 부수토지 개별공시지가 × 대지면적 (§61①1호) 2,000,000 × 100㎡ = 200,000,000
             = 합계 700,000,000
```

### 8.3 증여세 결과 — GiftTaxValuationFormTable (breakdown 미적용)

증여세 결과는 `GiftTaxResultView.tsx:532·554` 가 `GiftTaxValuationFormTable` 을 렌더하며,
이는 **상속세 및 증여세법 시행규칙 [별지 제10호서식 부표 1]** 의 법정 신고서 양식(고정 컬럼)이다.
행당 단일 가액 컬럼(`data-testid="col-amount"`, `GiftTaxValuationFormTable.tsx:245·289`) 구조이므로
건물분/부수토지분 **2행 분리 표시는 부표 양식 컬럼 구조와 충돌**한다.

> **정책 (finding 7 · `besshi-form-replica`)**: 증여세 `GiftTaxValuationFormTable` 은 별지 제10호서식 부표1
> 고정 컬럼 양식이므로 **합산 `standardPrice` 단일 가액만 표시** (breakdown 2행 미적용). 부표 양식의
> 칸 번호·컬럼 구조는 불변. §8.2 breakdown 2행은 **`InheritanceTaxResultView`(자유형 리스트) 한정**이다.
> 따라서 ⑦ 동기화 지점 표가 두 파일을 함께 나열하더라도, breakdown 스펙은 InheritanceTaxResultView에만 적용된다.

---

## 9. Validation — ⑧ 점검

### 9.1 부수토지 자체는 차단 없음

경로 B에서 부수토지 `StandardPriceInput` 미입력 → `appurtenantLandStandardPrice = undefined(→ 0)`.
이는 "건물만 있고 부수토지가 없는" 케이스로 법령상 정상. 차단 없음.
`validateStep`·`validateEstateItemAllocations` 모두 변경 불필요.

### 9.2 증여 validate 파일 확인 — 부재 파일 인용 금지

**증여세 validation 파일**: `components/calc/gift-tax-form-validate.ts` (실재).
`lib/calc/gift-validate.ts`는 **코드베이스에 없음** — 인용 절대 금지.
증여는 단일 수증자라 협의분할 validate 없음 → ⑧ 증여 신규 차단 없음.

### 9.3 협의분할 validate 단일 진실 (C-VD) — 상속 전용

```
// 상속: lib/calc/inheritance-validate.ts:148~162
const expected = resolveEngineValuatedAmount(item);
```

`resolveEngineValuatedAmount`→`resolveEstateItemValue`는 현재 `item.standardPrice`를 직접 반환.
v2에서 엔진이 `standardPrice + appurtenantLandStandardPrice`를 합산하여 `valuatedAmount`를 산출하므로,
`resolveEstateItemValue`(⑥ 지점)도 동일 합산 게이트를 적용해야 `expected = 700,000,000`이 된다.
**⑥ 합산 게이트 해소가 ⑧ 선결 조건** — ⑥ 미해소 시 validate `expected = 500,000,000`이고
협의분할 7억 입력 시 차단(모순). ⑥ 통일 후 자동 정합.

### 9.4 ⑧ 정책 — API/UI fallback ↔ validate 동기화 (feedback_validation_sync_8th_point)

`appurtenantLandStandardPrice`는 optional(undefined=0) → 자동 안분 fallback 아님 → validate 차단 없음.
단, ⑥ 합산 게이트 해소 후 `resolveEngineValuatedAmount` 반환값이 합산값을 가리키는지 roundtrip 확인 필요.

---

## 10. Pre-Do Anchor 기대값

### anchor E-1: 경로 A (일괄고시) — 현행 유지 회귀

```
입력: category="real_estate_building", standardPrice=700_000_000, commercialBuildingValuationRoute="lump"
기대: computeEffectiveValuation(item) = 700_000_000 (자동 passthrough)
     evaluateDetachedHouse(item).valuatedAmount = 700_000_000
```

### anchor E-2: 경로 B (분리) — 엔진 합산 단위 테스트

```
// v2: UI는 standardPrice(건물분)·appurtenantLandStandardPrice(부수토지 총액)를 분리 저장.
// 엔진 evaluateDetachedHouse가 두 필드를 합산하여 valuatedAmount 산출(plan v2 §3-2).
// StandardPriceInput(propertyKind="land")의 onTotalPriceChange가 Math.floor(단가×면적) 총액을 emit.
건물 StandardPriceInput onTotalPriceChange → standardPrice = 500_000_000
부수토지 StandardPriceInput(land, area-mode) onTotalPriceChange → appurtenantLandStandardPrice = 200_000_000
  (위젯 내부: Math.floor(2_000_000 × parseFloat((100.00).toFixed(2))) = 200_000_000)

기대: evaluateDetachedHouse({
        standardPrice: 500_000_000,
        appurtenantLandStandardPrice: 200_000_000,
        valuationMethod: "standard_price"
      }).valuatedAmount = 700_000_000
```

### anchor E-3: 시가 입력 시 부수토지 무시

```
입력: marketValue=800_000_000, standardPrice=700_000_000 (경로 B 합산값)
기대: computeEffectiveValuation(item) = 800_000_000 (시가 우선 §60)
     valuatedAmount = 800_000_000
```

### anchor E-4: §61⑤ 임대료환산 MAX — 합산 기준

```
입력: standardPrice=700_000_000, monthlyRent=6_000_000 (월세 600만)
임대료환산: 6_000_000 × 12 ÷ 0.12 = 600_000_000
기대: max(700_000_000, 600_000_000) = 700_000_000 (합산이 더 크므로 standardPrice 적용)
```

### anchor UI-1: 경로 라디오 미노출 조건

```
입력: category="real_estate_apartment"
기대: RadioCardGroup "commercial-building-valuation-route" 미노출

입력: category="real_estate_land"
기대: RadioCardGroup 미노출

입력: category="real_estate_building", supplementaryOpen=true
기대: RadioCardGroup 노출
```

### anchor UI-2: 경로 B 전환 시 표시용 필드 초기화

```
이전 상태: commercialBuildingValuationRoute="separated", buildingStdPriceForDisplay=500_000_000
경로 A 선택:
기대: set({ commercialBuildingValuationRoute: "lump", buildingStdPriceForDisplay: undefined, ... }) 호출
```

### anchor UI-3: C-BD-b 경고 노출

```
입력: category="real_estate_building", commercialBuildingValuationRoute="separated",
      burdenedGiftTransferTax !== undefined
기대: 경고 텍스트 "§159①2호 양도가액 안분" 포함하는 요소 존재 (data-testid="burdened-b-path-warning")
```

---

## 11. E2E 명세

### 증여세 탭: `e2e/gift-commercial-building-appurtenant-land.spec.ts` (신설)

```
시나리오 1 (경로 B 기본):
  1. 증여세 마법사 진입 → Step 2 자산 추가 → 상업용 건물 (real_estate_building)
  2. 보충평가 토글 ON
  3. 경로 라디오에서 "건물 기준시가 + 부수토지 개별공시지가 분리" 선택
  4. 건물 기준시가 입력: 500,000,000
  5. 부수토지 개별공시지가 단가 입력: 2,000,000 (원/㎡)
  6. 부수토지 대지면적 입력: 100 (㎡)
  7. 합산 결과 echo에 "700,000,000" 표시 확인
  8. 계산 버튼 → API body에 standardPrice=700000000 도달 확인 (Network 탭)
  9. 결과 화면에서 "보충적 평가" 방법·"700,000,000" 표시 확인

시나리오 2 (경로 A — 현행 회귀):
  1. 보충평가 토글 ON
  2. 경로 라디오 기본값 "국세청 일괄고시" 선택 유지
  3. 단일 standardPrice 700,000,000 입력
  4. 계산 → standardPrice=700000000 (이중계상 없음)

E2E 함정:
  - getByLabel 오매칭: RadioCardGroup 옵션 선택은 role="radio" + 정확한 이름으로
  - 부수토지 StandardPriceInput(propertyKind="land") 단가 입력: 위젯 내부 단가 textbox와 면적 textbox가 각각 존재 — getByRole('textbox', {name: ...}) 또는 data-testid 한정
  - 합산 결과 echo는 data-testid="appurtenant-land-combined-price" 로 assert
  - API body 확인: standardPrice(건물분) + appurtenantLandStandardPrice(부수토지 총액) 두 필드 모두 도달 확인
```

### 상속세 탭: 사전존재 stale E2E 6종 주의 (`project_inheritance_stale_e2e_specs`)

상속세 E2E 회귀 시 사전존재 실패 6종(public-trust·sidebar-exempt·section21·casualty·family-business·installment-3)을
회귀로 오인하지 않도록 master 베이스라인 대조 후 판정.

---

## 12. Scope Out (UI 관점)

- **부담부증여 + 경로 B 건물/토지 분리 입력**: `gift-burdened-transfer-api.ts:105-106`의 `isLandType=false → buildingStdAtTransfer=합산전액` 왜곡은 경고 표시(C-BD-b)로 처리하고, 분리 입력 지원은 별도 과제로 이관.
- **평가조서(별지 양식) 2행 분리 표시**: UI 표시용 필드 미추가 시 단일 합계만 표시. 평가조서 별지 양식 별도 영향 확인 필요(상속세 filing-form-helpers.ts — 범위 밖).
- **국세청 일괄고시 기준시가 자동 조회 API 연동**: 수동 입력 합산까지가 본 구현 범위.
- **`evaluateBuilding` dead code 삭제**: 전역 dead code 정리 금지 정책 준수.
- **§61①3호 "대통령령으로 정하는" 건물 목록 자동 판별**: 수동 경로 선택으로 충분.

---

## 13. 법령 상수 추가 (`legal-codes/inheritance-gift.ts`)

현행 `VALUATION.REAL_ESTATE_SUPP = "상증법 §61"` (포괄 인용, line:163).
경로 A/B 구분 상수를 `VALUATION` 객체에 추가한다:

```ts
// lib/tax-engine/legal-codes/inheritance-gift.ts VALUATION 객체에 추가
/** 상증법 §61①3호 — 오피스텔·상업용 건물 일괄고시 기준시가 (토지 포함) */
BUILDING_STD_LUMP:        "상증법 §61①3호",
/** 상증법 §61①2호 — 건물 기준시가 (3·4호 제외) */
BUILDING_STD_SEPARATED:   "상증법 §61①2호",
/** 상증법 §61①1호 — 토지 개별공시지가 (부수토지 합산용) */
LAND_STD_APPURTENANT:     "상증법 §61①1호",
```

이 상수들은 ⑦ 결과 카드 breakdown 라벨·법령 배지 표시에 사용된다.

---

## 14. 3대 핵심 정책 자가 점검

| 정책 | 점검 | 결과 |
|------|------|------|
| useEffect → store 미러링 금지 | `AppurtenantLandSection`의 두 `StandardPriceInput`은 각각 `onTotalPriceChange` onChange 단방향. 합산은 엔진. useEffect 미사용. | ✅ 준수 |
| 자동 안분 fallback 금지 | `appurtenantLandStandardPrice` 미입력 = undefined→0 처리 (법령 정합 — 부수토지 없는 건물 존재). validation 차단 없음. | ✅ 준수 |
| Validation 8번째 동기화 강제 | 증여: `lib/calc/gift-validate.ts` 부재 파일 인용 제거 완료 / 차단 없음. 상속: ⑥ 합산 게이트 해소 후 `resolveEngineValuatedAmount` 자동 정합(⑥ 선결). `appurtenantLandStandardPrice` optional → validate 추가 불필요. | ✅ 준수 (⑥ 종속) |

---

## 15. DoD 체크리스트

### 타입·Zod (① ⑫)
- [ ] ① `appurtenantLandStandardPrice?: number` EstateItem 타입에 추가 (`inheritance-gift-estate.types.ts`)
- [ ] ⑫ `estate-item-schema.ts buildingItemSchema`에 `appurtenantLandStandardPrice: z.number().nonnegative().optional()` 추가 (침묵 strip 방지)
- [ ] ⑫ `commercialBuildingValuationRoute` 추가 시 `z.enum(["lump","separated"]).optional()` 동기화

### UI 위젯 (⑤)
- [ ] ⑤ 경로 라디오 `RadioCardGroup` (name=`commercial-building-valuation-route`, tone=emerald, native 금지, 미선택도 배경 유지) — `real_estate_building` + 보충평가 토글 내부 전용
- [ ] ⑤ 경로 A 선택 시 기존 `StandardPriceInput`·`BuildingStdPriceModalButton` 그대로 유지
- [ ] ⑤ 경로 B 선택 시 `AppurtenantLandSection` 노출, 기존 `StandardPriceInput`·`BuildingStdPriceModalButton` 숨김
- [ ] ⑤ `AppurtenantLandSection` — 건물: `StandardPriceInput(propertyKind="building_non_residential")` → `standardPrice`
- [ ] ⑤ `AppurtenantLandSection` — 부수토지: `StandardPriceInput(propertyKind="land", area-mode)` → `onTotalPriceChange` → `appurtenantLandStandardPrice`
- [ ] ⑤ 합산 결과 echo (data-testid=`appurtenant-land-combined-price`) — store 값 직접 읽기
- [ ] ⑤ C-BD-b 경고: 경로 B + 부담부증여 동시 → 경고 텍스트 노출 (data-testid=`burdened-b-path-warning`)
- [ ] ⑤ 경로 A 선택 시 `appurtenantLandStandardPrice: undefined` 초기화 (이중계상 방지)

### 사이드바·validate (⑥ ⑧)
- [ ] ⑥ `item.standardPrice` 직접 read 지점(`computeEffectiveValuation`·`resolveEstateItemValue`·`inheritance-deduction-suggest.ts`) grep 전수 확인 → `method==="standard_price"` 시 `+ appurtenantLandStandardPrice` 합산 게이트 추가
- [ ] ⑧ 증여 validate: `components/calc/gift-tax-form-validate.ts` 대상. `lib/calc/gift-validate.ts` 인용 금지. 신규 차단 없음.
- [ ] ⑧ 상속 validate: ⑥ 해소 후 `resolveEngineValuatedAmount` 합산값 반환 → C-VD 통과 확인

### 결과 카드 (⑦)
- [ ] ⑦ `vr.valuatedAmount` 자동 반영(엔진 합산값). 선택적 breakdown 2행: `item.buildingStdPriceForDisplay`·`item.appurtenantLandStdPriceForDisplay` 추가 시 표시

### 법령 상수·테스트
- [ ] 법령 상수 `BUILDING_STD_LUMP`·`BUILDING_STD_SEPARATED`·`LAND_STD_APPURTENANT` 추가
- [ ] Pre-Do anchor E-2: `evaluateDetachedHouse({ standardPrice: 500_000_000, appurtenantLandStandardPrice: 200_000_000 }).valuatedAmount === 700_000_000` 현행 실패 확인 후 엔진 수정으로 통과
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/property-valuation/` 통과
- [ ] 증여·상속 전체 vitest 회귀 통과
- [ ] E2E `gift-commercial-building-appurtenant-land.spec.ts` 시나리오 1·2 통과
- [ ] 브라우저 수동 확인: Network body에 `appurtenantLandStandardPrice` 도달 확인 또는 미수행 명시
- [ ] 상속세 stale E2E 6종 사전존재 베이스라인 대조 후 회귀 판정
- [ ] 3대 핵심 정책 위반 없음: useEffect 금지·자동 fallback 금지·validation 8번째 동기화

---

## 16. 미해결 / Do 진입 전 확정 필요

1. **UI 표시용 3필드 추가 여부**: `commercialBuildingValuationRoute`·`buildingStdPriceForDisplay`·`appurtenantLandStdPriceForDisplay` 추가 시 ⑫ Zod 동기화 필수. 미추가 시 결과 카드 단일 합계 표시로 제한.

2. **부담부증여 + 경로 B 해결책 최종 결정**: 본 설계는 경고 표시(b안)로 명세. 분리 입력(a안)은 별도 과제. Do 착수 전 사용자 확인 후 방침 고정.

3. **`valuationDate` prop 전달 (필수)**: v2 `AppurtenantLandSection`은 `LandPriceLookupField`를 제거했으므로 `addrValue`(jibun 조회용)는 불필요. `valuationDate`는 `StandardPriceInput` referenceDate용으로 유지. named function인 경우 props로 전달 필수(TS2304). `addrValue` 제거로 §7.5 props 시그니처가 v1 대비 단순화됨.

4. **경로 A/B 기본값**: 경로 A(일괄고시) 기본 — 오피스텔·대형 상가(일괄고시 대상)가 통계상 다수 가정. Do 착수 전 사용자 확인 권장.

5. **`BuildingStdPriceModalButton` 재사용 확정**: 경로 B의 `AppurtenantLandSection` 내부에서 `BuildingStdPriceModalButton`을 건물분 전용으로 재사용 가능. `onApply` 콜백이 `handleBuildingStdChange`로 연결되면 건물분만 정확히 업데이트됨. 단, 합산값이 아닌 건물분만 반환하는지 Do 착수 전 1건 anchor 실측 확인 필수 (`BuildingStdPriceModalButton.tsx:78·83·88` 실측 확인됨 — 건물분만 반환).

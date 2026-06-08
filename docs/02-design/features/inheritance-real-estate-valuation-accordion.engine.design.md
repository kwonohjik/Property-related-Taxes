# 엔진/데이터 설계 — 부동산 평가 아코디언 + 매매사례가액 + valuationMethod 파생

> 상위 계획: `inheritance-real-estate-valuation-accordion.plan.md` (Part1·2 + D-1~D-5 확정 + §15 dual-truth)
> 본 문서: 엔진·데이터·타입·알고리즘·anchor. UI는 `.ui.design.md` 별도.
> 모든 file:line 실측(13단계 STEP1~4 검증 완료).

## 1. 케이스 인벤토리 (평가액 조합 전수 enumerate)

표기: market=`marketValue`, appr=`appraisedValue`, sim=`similarSalesValue`(신규), std=`standardPrice`, 단위 억.
채택 = `resolveValuationAmount`(D-1: market>appr>sim>std). 감정수수료 = §25①2호 공제(method="appraisal" AND §20의3 요건).

| ID | market | appr | sim | std | 저당 | 채택 method | 평가액 | 감정수수료공제 | 부표2코드 |
|---|---|---|---|---|---|---|---|---|---|
| EV-C1 시가만 | 2 | – | – | – | – | market_value | 2억 | ✗ | 01 |
| EV-C2 감정만 | – | 1.8 | – | – | – | appraisal | 1.8억 | ✅(요건충족) | 02 |
| EV-C3 매매사례만 | – | – | 1.9 | – | – | similar_sales | 1.9억 | ✗ | 05 |
| EV-C4 보충만 | – | – | – | 1 | – | standard_price | 1억 | ✗ | 08 |
| EV-C5 시가+감정 **(D-4)** | 2 | 1.8 | – | – | – | market_value | **2억** | **✗** | 01 |
| EV-C6 감정+매매사례 | – | 1.8 | 1.9 | – | – | appraisal | 1.8억 | ✅ | 02 |
| EV-C7 시가+보충 | 2 | – | – | 1 | – | market_value | 2억 | ✗ | 01 |
| EV-C8 매매사례+보충 | – | – | 1.9 | 1 | – | similar_sales | 1.9억 | ✗ | 05 |
| EV-C9 전부 | 2 | 1.8 | 1.9 | 1 | – | market_value | 2억 | ✗ | 01 |
| EV-C10 §66 담보>평가 | – | – | – | 1 | 2 | standard_price | **max=2억** | ✗ | 08 |
| EV-C11 0-입력(H1/H2 차이) | 0 | 1.8 | – | – | – | H1:appraisal 1.8 / H2:`0`(?? chain) | (anchor 분리) | – | – |
| EV-C12 미입력 | – | – | – | – | – | standard_price(amount=0) | 0 | ✗ | 08 |

§49② 단서 정합: market/appr(해당재산 시가) 존재 시 sim 배제 — if-chain 자연 구현(EV-C9·EV-C6에서 sim 도달 전 return).

## 2. 타입 변경 (EstateItem)

`lib/tax-engine/types/inheritance-gift.types.ts`

```ts
// L86~90 인접에 추가
/** 유사매매사례가액 (상증법 시행령 §49①·④ — "시가로 본다"). market·appraised 있으면 §49② 단서로 배제. */
similarSalesValue?: number;

// L241 valuationMethod — 주석 갱신: "라디오 삭제(2026-06-08). 잔존=하위호환·수동 override.
//   소비처는 item.valuationMethod ?? resolveValuationMethod(item) 패턴."
valuationMethod?: ValuationMethod;  // 필드 유지 (D-5)
```

`ValuationMethod` enum: `similar_sales` 이미 존재(L62). 변경 없음.

## 3. 엔진 알고리즘

### 3-1. `resolveValuationMethod` 신설 + `resolveValuationAmount` 단일화

`property-valuation.ts:52-69`

```ts
export function resolveValuationMethod(item: EstateItem): ValuationMethod {
  if (item.marketValue && item.marketValue > 0) return "market_value";
  if (item.appraisedValue && item.appraisedValue > 0) return "appraisal";
  if (item.similarSalesValue && item.similarSalesValue > 0) return "similar_sales"; // 신규
  if (item.standardPrice && item.standardPrice > 0) return "standard_price";
  return "standard_price";
}

function resolveValuationAmount(item: EstateItem): { amount: number; method: ValuationMethod } {
  const method = resolveValuationMethod(item);
  const amount =
    method === "market_value" ? item.marketValue! :
    method === "appraisal" ? item.appraisedValue! :
    method === "similar_sales" ? item.similarSalesValue! :
    (item.standardPrice ?? 0);
  return { amount, method };
}
```

- 주석 L5-7 갱신: "1순위 시가(매매·감정 동순위, 매매 tie-break) / 2순위 유사매매사례(§49④) / 3순위 보충평가". §49② "가장 가까운 날"은 사용자가 해당 가액을 직접 입력(엔진 날짜계산 불요) — 완결.
- §66 `applyCollateralFloor`(L71~) 무변경 — amount 기준 max라 자동 반영(EV-C10).

### 3-2. dual-truth 4헬퍼 동기화 (계획 §15)

| 헬퍼 | 파일:line | 변경 |
|---|---|---|
| H1 `resolveValuationAmount` | property-valuation.ts:52 | 3-1 (단일화 + similar) |
| H2 `computeEffectiveValuation` | estate-item-valuation.ts | `market ?? appraised ?? similar ?? standard` (?? chain 보존, 0-처리 기존 유지) |
| H3 `EstimatedValuePreview` | property-valuation-preview.tsx:24-32 | similar if 추가(appr 다음 std 전) |
| H4 `TotalEstimatedValue` | property-valuation-preview.tsx:90-95 | 동일 if 추가 |

### 3-3. appraisal 판정 4곳 교체 (도출 method 기반 — D-4)

```ts
// AS-IS: (i) => i.valuationMethod === "appraisal"
// TO-BE: (i) => (i.valuationMethod ?? resolveValuationMethod(i)) === "appraisal"
```

| # | 파일:line | 비고 |
|---|---|---|
| 1 | `inheritance-tax.ts:520` | 감정수수료 공제(§25①2호) |
| 2 | `gift-tax.ts:138` | 증여 감정수수료(§55①·§46의2 준용) |
| 3 | `inheritance/steps.tsx:528` | UI 측 동일 판정 |
| 4 | `gift-tax-form-shared.tsx:505` | gift UI 측 |

→ EV-C5: market+appr 동시 → 도출 "market_value" → 판정 false → 감정수수료 0 ✅(D-4).
→ ⚠️ `single-source-engine-helper`: 4곳 모두 엔진 `resolveValuationMethod` import(재정의 금지).

### 3-4. 부표2 코드 — 무수정 (STEP1 #3·#4)

`inheritance-filing-form-helpers.ts:141 toEstateItemValuationMethodCode(item, vr)`는 `vr.method` 기반, `similar_sales→"05"` 기존 보유(:151). 엔진 method가 "similar_sales" 반환하면 자동. **함수 무변경.**

## 4. 비고 열 라벨 (결과 Table A)

`source-summary-helpers.ts:34 resolveValuationLabel`:
```ts
export function resolveValuationLabel(item: EstateItem): string {
  return VALUATION_METHOD_LABEL[item.valuationMethod ?? resolveValuationMethod(item)];
}
```
`VALUATION_METHOD_LABEL`(constants:52) `similar_sales: "매매사례가액"` 존재 확인. **주식 비고(STEP3 #10)**: 주식은 4필드 미보유→"기준시가" 도출. 기존 수동선택 회귀 여부 anchor VM-STOCK-LABEL.

## 5. 동기화 지점 (14)

| # | 지점 | 위치 | 상태 |
|---|---|---|---|
| ①②③ | 폼/initial/normalize | EstateItem 단일 타입(store 공유) | similar 추가 |
| ④ | API 변환 | `inheritance-api.ts:71` passthrough | **자동**(무수정) |
| ⑤ | UI 위젯 | 아코디언 매매사례가액 헤더 | .ui.design |
| ⑥ | 사이드바 합계 | H2 computeEffectiveValuation | §15 |
| ⑦ | 결과 카드 | 비고열·부표2·H3·H4 | §4·§3-4 |
| ⑧ | validation | `property-valuation-input.ts:58 baseItemSchema` | similar `z.number().nonnegative().optional()` **1곳 추가** — 9멤버 전부 `baseItemSchema.extend({category})`(land:171·apt:175·building:179·listed·unlisted·cash:cash marketValue override·financial·deposit·other) → **자동 전파**(STEP6 #12 실측 확인). discriminatedUnion이나 strip 위험 없음 |
| ⑨⑩ | Zod enum | ValuationMethod 기존 | 무변경 |
| ⑪ | acqDate fallback | N/A | – |
| ⑫ | Zod 입력객체 | baseItemSchema(:62 인접) | similar 추가 |
| ⑬ | body spread | estateItems passthrough | **자동** |
| ⑭ | Route 매핑 | `app/api/calc/{inheritance,gift}/route.ts` coerceDates | similar는 number(Date 무관) |

## 6. Anchor 목록

- **VM-DERIVE-01**: appr만 → method="appraisal" → 감정수수료 공제 적용(현행 동일).
- **VM-DERIVE-02 (D-4)**: market 2억+appr 1.8억 → 평가액 2억·method="market_value"·감정수수료=0.
- **VM-SIM-01**: sim만 → 평가액=sim·method="similar_sales"·부표2="05".
- **VM-SIM-02 (§49② 단서)**: market+sim → sim 배제, method="market_value".
- **VM-DUALTRUTH-01**: sim만 → H1~H4 평가액 일치.
- **VM-66-01 (회귀)**: std+저당 → max 하한 불변(EV-C10).
- **VM-0INPUT (STEP3 #9)**: market=0+appr 1.8 → H1 appraisal / H2 ?? 0-처리 케이스 분리 검증.
- **VM-BUPPYO-01**: 각 method별 부표2 코드(01/02/05/08).
- **VM-STOCK-LABEL (STEP3 #10)**: 주식 카테고리 비고 열 도출 점검.
- **VM-REG-LEGACY**: 기존 valuationMethod 수동저장 데이터 → `??` 우선분기로 라벨·판정 불변.

## 7. 회귀/리스크

- gift `estateItemSchema` 공유 → similar 추가 시 양 세목 동시 반영.
- §49② "가장 가까운 날" — ✅ 완결: 사용자가 평가기준일에 가장 가까운 시가/매매사례가액을 해당 칸에 직접 입력. 엔진은 단일 채택 가액을 받으므로 날짜 비교·평균 불요. market tie-break는 동순위(매매·감정) 단순화로 유지.
- valuationMethod 필드 잔존(D-5) → 기존 데이터 무손실.
- **비대칭 무해(STEP8 #14)**: `similarSalesValue`는 baseItemSchema 공통이라 전 카테고리 Zod 허용. UI 아코디언은 부동산(land/apt/building)만 노출. cash·financial·deposit·주식은 엔진 평가 경로(`evaluateLand` 등 부동산 전용 / `computeStockValuation` / deposit 분기)에서 similar 미참조 → 입력돼도 무시(무해). UI/Zod optional 비대칭 무모순.

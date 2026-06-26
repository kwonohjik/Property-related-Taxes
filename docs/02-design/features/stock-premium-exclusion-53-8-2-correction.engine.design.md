# 엔진/데이터 설계 — 주식 할증평가 §53⑧ 배제사유 정정 + 2호 검증 게이트

> Plan: `docs/00-pm/stock-premium-exclusion-53-8-2-correction.plan.md`
> 법령: 상증법 §63③ · 상증령 §53⑧(1~9호) · 상증령 §49①1호·②1호 (KoreanLaw 검증 2026-06-27, 시행 20260227)
> 범위: 상장 + 비상장 · 공용 enum/라벨/게이트 단일 출처

---

## 0. 설계 원칙

- **단일 출처**: enum·라벨·게이트를 상장/비상장 공용 모듈로 두고 양쪽이 import(`single-source-engine-helper`, dual-truth 차단).
- **순수 함수**: 게이트는 DB·시계 비의존. 평가기준일 D는 매개변수 주입(상장 `valuationDate`/비상장 `evaluationDate` 명칭 격리).
- **정수·날짜**: 할증 = `Math.floor(base × 1.2)`(기존 유지). 기간 = date-fns `addMonths`/`subMonths` 경계 포함.

---

## 1. 케이스 인벤토리

### 1-1. 배제사유 enum (§53⑧ 1~9호) — 공용 `StockPremiumExclusionReason`

| 코드 | 호 | 본문 | 입력/판정 |
|---|---|---|---|
| `none` | — | 배제 없음 | 기본 |
| `continuous_loss_3y` | 1 | 전 3년 계속 결손 | 수동/플래그 |
| `all_sold_within_6m` | 2 | **전부매각(§49①1호 적합)** | **2호 게이트(본 작업)** |
| `calc_gift_profit` | 3 | §28·29·29의2·29의3·30 증여이익 계산 | 수동 |
| `subsidiary_other_max` | 4 | 다른 법인 최대주주 보유주식 평가 | 수동 |
| `all_negative_op_income_3y` | 5 | 3년내 사업개시+영업이익 모두 0이하 | 수동 |
| `liquidation_confirmed` | 6 | 신고기한내 청산 확정 | 수동 |
| `not_max_after_succession` | 7 | 상속·증여로 최대주주 미해당 | 수동 |
| `deemed_gift_nominee` | 8 | §45의2 명의신탁 증여의제 | 수동 |
| `small_medium_enterprise` | 9 | 중소·중견기업 | companySize 자동 |

### 1-2. 2호 게이트 케이스 (평가기준일 D, 매매계약일 S)

| # | allSharesSold | meetsArticle49_1_1 | 구분 | S 위치 | eligible | failReason |
|---|---|---|---|---|---|---|
| 1 | O | O | 상속 | D−6m ≤ S ≤ D+6m | **true** | — |
| 2 | O | O | 증여 | D−6m ≤ S ≤ D+3m | **true** | — |
| 3 | O | O | 증여 | D+3m < S ≤ D+6m | false | `out_of_period` |
| 4 | O | O | 상속/증여 | S < D−6m | false | `out_of_period` |
| 5 | X | O | — | 기간내 | false | `not_all_sold` |
| 6 | O | X | — | 기간내 | false | `not_normal_transaction` |
| 7 | (보조입력 부재) | — | — | — | false | `missing_input` → validate 차단 |

---

## 2. 타입 정의 (신규/변경)

### 2-1. 공용 모듈 `lib/tax-engine/types/stock-premium-exclusion.types.ts` (신규)

```ts
export type StockPremiumExclusionReason =
  | "none"
  | "continuous_loss_3y"        // §53⑧1
  | "all_sold_within_6m"        // §53⑧2
  | "calc_gift_profit"          // §53⑧3
  | "subsidiary_other_max"      // §53⑧4
  | "all_negative_op_income_3y" // §53⑧5
  | "liquidation_confirmed"     // §53⑧6
  | "not_max_after_succession"  // §53⑧7
  | "deemed_gift_nominee"       // §53⑧8
  | "small_medium_enterprise";  // §53⑧9

/** §53⑧2호 전부매각 보조입력 (2호 선택 시에만 존재 — optional 3-state) */
export interface Section53_8_2Input {
  allSharesSold: boolean;       // ⓐ §53⑧2 전부 매각
  meetsArticle49_1_1: boolean;  // ⓑ §49①1호 적합(정상 매매)
  saleContractDate: Date;       // ⓒ §49②1호 매매계약일 = S
  transferType: "inheritance" | "gift"; // ⓓ
}

export type Section53_8_2FailReason =
  | "not_all_sold" | "not_normal_transaction" | "out_of_period" | "missing_input";

export interface Section53_8_2Result {
  eligible: boolean;
  failReason?: Section53_8_2FailReason;
}
```

### 2-2. 라벨 단일 출처 `lib/tax-engine/data/stock-premium-exclusion-labels.ts` (신규)

```ts
export const STOCK_PREMIUM_EXCLUSION_LABELS:
  Record<StockPremiumExclusionReason, string> = { /* §53⑧ 본문 9종 + none */ };
```
> 기존 `listed-premium-exclusion-labels.ts`는 본 파일 re-export로 전환하거나 삭제(import 지점 일괄 교체).

### 2-3. 기존 타입 변경

- `ListedPremiumExclusionReason` → `StockPremiumExclusionReason` alias(하위호환) 후 점진 제거. `EstateItem`에 `section53_8_2?: Section53_8_2Input` optional 추가(EstateItem 정의 파일은 Do 시 grep 확정 — `inheritance-gift.types.ts:82`는 enum import 지점, EstateItem 본체는 estate.types 계열일 수 있음).
- 비상장 `UnlistedPremiumExclusionReason` → 공용 타입 alias. `UnlistedStockValuationInput`에 `premiumExclusionReason?: StockPremiumExclusionReason` + `section53_8_2?: Section53_8_2Input` 신설.

---

## 3. 게이트 알고리즘 (공용 순수 함수)

`lib/tax-engine/property-valuation/section-53-8-2-gate.ts` (신규)

```
function evaluateSection53_8_2(
  input: Section53_8_2Input | undefined,
  valuationDate: Date,   // D — 상장 valuationDate / 비상장 evaluationDate
): Section53_8_2Result {
  if (!input) return { eligible: false, failReason: "missing_input" }
  if (!input.allSharesSold)      return { eligible:false, failReason:"not_all_sold" }
  if (!input.meetsArticle49_1_1) return { eligible:false, failReason:"not_normal_transaction" }

  const S = input.saleContractDate
  const lower = subMonths(valuationDate, 6)                       // D−6m (공통)
  const upper = input.transferType === "gift"
    ? addMonths(valuationDate, 3)                                 // 증여 D+3m
    : addMonths(valuationDate, 6)                                 // 상속 D+6m
  // 경계 포함: lower ≤ S ≤ upper (시분초 절단 — 날짜 비교)
  if (S < lower || S > upper) return { eligible:false, failReason:"out_of_period" }
  return { eligible: true }
}
```
> 경계 비교는 date-only(시각 제거) — `coerceDates`로 들어온 Date 사용. `S > upper` 당일은 포함(케이스 2 vs 3 경계).
> ⚠️ `missing_input`(케이스7)은 **⑧ validate 차단 전제** — 2호 선택+보조입력 미입력은 validate가 막는다. 엔진 단독 호출 시엔 게이트 실패 → 보수적으로 할증(2호 배제 미적용)로 동작(침묵 0% 금지).

### 3-1. failReason → 결과뷰 메시지 (rose tone, 계획 §4-4)

| failReason | 한국어 메시지 |
|---|---|
| `not_all_sold` | §53⑧2호: 최대주주 주식 전부 매각이 아니므로 할증 배제 불가 |
| `not_normal_transaction` | §53⑧2호: §49①1호 정상 매매거래 요건 미충족 → 할증 배제 불가 |
| `out_of_period` | §53⑧2호: 매매계약일이 평가기준일 전후 허용기간(상속 ±6월/증여 전6·후3월) 밖 |
| `missing_input` | §53⑧2호 보조입력 필요 (validate 차단) |

---

## 4. 판정 통합 (할증률 결정)

### 4-1. 상장 `resolveListedPremiumRate`(`property-valuation-stock.ts:85`) 변경

우선순위에 2호 게이트 삽입:
```
if (!isMaxShareholder) → 0
explicit = premiumExclusionReason

// 2호는 게이트 통과해야만 유효한 배제. 실패 시 explicit를 무효화하고 일반 분기로.
exclusionEffective = explicit
if explicit === "all_sold_within_6m":
    gate = evaluateSection53_8_2(item.section53_8_2, valuationDate)
    if !gate.eligible: exclusionEffective = "none"   // 2호 무효 → companySize 평가로

if exclusionEffective && exclusionEffective !== "none" → 0 (1·3~9호 수동 또는 통과한 2호)
elif companySize ∈ {small,medium} → 0 (9호)
elif companySize === "large" → 0.20
else → 0
```
> ⚠️ `resolveListedPremiumRate(item)`이 현재 valuationDate 미수신 → 시그니처에 `valuationDate` 추가(`computeListedBesshiPage1Values`가 이미 `context.valuationDate` 보유, 전달만).

### 4-2. 비상장 `calcMaxShareholderPremium`(`max-shareholder-premium.ts:71`) 변경

`MaxShareholderPremiumInput`에 `section53_8_2?`·`valuationDate?: Date` 추가. 배제 판정은 §4-1과 **동일한 `exclusionEffective` 패턴** 적용:
- `explicitExclusionReason === "all_sold_within_6m"`이고 `valuationDate` 존재 → 게이트 호출. 실패 시 `exclusionEffective="none"`로 무효화 후 기존 companySize(9호)·continuousLoss(1호) 자동 판정으로 진행.
- `valuationDate` 미존재 시 2호 게이트 **skip → 보수적 할증**(validate가 2호 선택 시 `evaluationDate` 필수화).
- 호출부 `unlisted-orchestrator.ts:384`에서 `input.evaluationDate` 주입.

---

## 5. 마이그레이션 normalize (상장 저장값)

`normalizeEstateItem`(또는 store normalize)에서:
```
art53_8_1 → continuous_loss_3y
art53_8_4 → all_sold_within_6m
smb_med   → small_medium_enterprise
art53_8_2|3|5|6|7|8|9 → none  (호 무의미했음, 재선택 유도)
(이미 공용코드면 그대로)
```

---

## 6. 14 동기화 지점 커버리지

| # | 지점 | 상장 | 비상장 |
|---|---|---|---|
| ① 폼/타입 | `EstateItem.section53_8_2`(`inheritance-gift.types.ts`) | `UnlistedStockValuationInput`(신설 필드) |
| ② initial | EstateItem factory | 비상장 input factory |
| ③ normalize | §5 마이그레이션 | 신규 필드 fallback |
| ④ API 변환 | estate-item API 매핑 | unlisted API 매핑 |
| ⑤ UI 위젯 | `ListedStockBesshiAttributesSection.tsx`(select 교체 + 2호 보조입력) | `CorporateInfoSection.tsx`(배제사유+2호 신설) |
| ⑥ 사이드바 | 해당 시 N/A | N/A |
| ⑦ 결과 | `ListedStockBesshiResultView` + `results/ListedStockBesshiResultSection` | `PerShareValuationResultCard` |
| ⑧ validate | 2호 선택 시 보조입력 필수(UI와 동기) | 동일 |
| ⑨⑩ Zod enum | `estate-item-schema.ts` | `unlisted-stock-valuation-v2.schema.ts:162` |
| ⑪ acq fallback | N/A | N/A |
| ⑫ Zod 입력객체 | `estate-item-schema.ts` `section53_8_2` 객체 | `unlisted...schema` 객체 |
| ⑬ body spread | estate-item 전송 | unlisted 전송 |
| ⑭ Route 매핑 | route handler Date 변환(`saleContractDate`) | 동일 |

> ⑫⑬⑭ TypeScript 미감지 → Do 시 grep 자가점검(`feedback_api_zod_schema_sync`).

---

## 7. 영향 없음(불변) 보장

- §22②(금융재산공제 배제) 무관 — 별도 모듈.
- 할증률 산식(×120%, floor)·기존 1호·9호 자동 판정 경로 불변.
- 게이트 미선택(다른 호·none) 시 기존 동작 동일 — 회귀 0 목표.

# 상속세 물납(§73) — 엔진/데이터 설계

> 통합 계획·마스터: `inheritance-payment-in-kind.design.md` (본 문서는 그 §1·§4·§6의 **엔진 구체화** — 충돌 시 통합문서 우선, dual-truth 금지)
> 순수 엔진 함수 `calcPaymentInKindAssessment()` 단일 진실. 결정세액 불변(납부방법 투영).
> 작성 2026-06-06 · KoreanLaw 실측(상증법 §73, 상증령 §73·§74·§71·§70, 조심2016서3563·2024중4490) · 13단계 자가검토 반영(STEP 5)

---

## 1. 책임 범위

| 포함 | 제외 |
|---|---|
| 물납 요건 3개 판정(§73①1~3호) | §73의2 문화유산·미술품 물납(후속) |
| 물납 허용한도 = min(1호 안분, 2호 차감)(상증령 §73①) | 재산 배분 시뮬레이션(어느 재산 얼마 물납) |
| 비상장 별도 캡(§73④) | 물납↔연부연납 병행(§70②) 모델링 |
| 충당순서 6단계 매핑(§74②) | UI 위젯·결과 카드(→ `.ui.design.md`) |
| 경고(관리처분 부적당 §71·§73③, 적합물건 없음 §73②) | 수납가액 재평가(§75) |
| result echo 1필드 `priorGiftToHeirTotal` 추가(계산 불변) | |

---

## 2. 법령 근거 — 분모/한도 확정 (실측)

| 산식 | 값 | 근거 |
|---|---|---|
| **상속세 납부세액** | `finalTax` = 산출세액 − 세액공제 (산출세액 §26 **아님**) | 조심2016서3563 |
| **§73①1호 안분 분모** = "해당 상속재산가액"(채무 차감 前) | `estateBase = grossEstateValue − exemptAmount + priorGiftToHeirTotal` | 본칙 §73①1호 "해당 상속재산가액의 1/2" + 조심2016서3563 표 주석 |
| **§73①1호 한도** | `limit1 = floor(finalTax × eligibleRealSec / estateBase)` | 상증령 §73①1호 |
| **§73①2호 한도** | `limit2 = max(0, finalTax − netFinancial − tradableListed)` | 상증령 §73①2호 |
| **허용한도** | `allowedLimit = max(0, min(limit1, limit2))` | 상증령 §73① |
| **§73④ 비상장 캡** 기준 = "상속세 과세가액"(차감 後, ≠1호 분모) | `max(0, finalTax − (taxableEstateValue − unlisted − heirResidence))` | 상증령 §73④ |

> ⚠️ **1호 분모(`estateBase`, 상속재산가액)와 §73④ 기준(`taxableEstateValue`, 과세가액)은 다름.** 추정상속재산(§15)은 분모 제외(보수적·판례 부재 caveat).

---

## 3. input/result 타입 (`lib/tax-engine/types/inheritance-gift.types.ts`)

```ts
/** 물납 충당재산 가액 — estate 자동도출(buildSummaryCategory) + 관리처분 보정 후. 엔진은 계산만. */
export interface PaymentInKindAssets {
  realEstateValue: number;        // §74①1호 국내소재 부동산
  eligibleSecuritiesValue: number;// §74①2호 충당가능 유가증권(국채·공채·내국법인채권 + 처분제한 상장)
  unlistedStockValue: number;     // §74②5호 비상장주식(§73④ 캡·최후순위)
  tradableListedValue: number;    // §73①2호 차감 — 처분제한 없는 상장 유가증권
  netFinancialValue: number;      // §73⑤ 금융재산 순액(금융회사 채무 차감) ← result.netFinancialAssets ?? 0
  heirResidenceValue: number;     // §73④ 차감 — 상속인 거주 주택·부수토지(담보채무 차감)
  ineligibleManagementValue: number; // §73③·§71 관리처분 부적당 제외(보정 입력)
}

export interface PaymentInKindInput {
  finalTax: number;             // 납부세액 = 산출세액−세액공제 (result.finalTax) — 조심2016서3563
  grossEstateValue: number;     // 본래+간주(비과세 차감 前, result.grossEstateValue tax.ts:117)
  exemptAmount: number;         // 비과세 (result.exemptAmount L1113) — 분모 차감
  priorGiftToHeirTotal: number; // 상속인·수유자 사전증여 §13 (= heirOnlyGifts, ★echo 추가 필요) — 분모 가산
  taxableEstateValue: number;   // 상속세 과세가액 (result.taxableEstateValue L1120) — §73④ 캡 기준
  assets: PaymentInKindAssets;
  requestedAmount?: number;     // 희망 물납액(미입력 시 한도 안내)
}
// 해당 상속재산가액(분모) = grossEstateValue − exemptAmount + priorGiftToHeirTotal

export interface PaymentInKindRequirement {
  realEstateSecuritiesValue: number; // 충당가능 부동산·유가증권(§73③ 제외 반영)
  halfThreshold: number;             // estateBase × 1/2
  meetsOverHalf: boolean;            // 요건1 §73①1호
  taxThreshold: number;              // 20,000,000
  meetsTaxOver20M: boolean;          // 요건2 §73①2호
  financialValue: number;            // 금융재산 순액
  meetsTaxOverFinancial: boolean;    // 요건3 §73①3호
}

export interface FillOrderStep {
  order: number;          // 1..6 (§74②)
  label: string;
  availableValue: number; // 단계별 가용 충당재산 가액
  note?: string;
}

export interface PaymentInKindResult {
  eligible: boolean;                 // 3요건 모두 충족
  requirement: PaymentInKindRequirement;
  estateBase: number;                // 해당 상속재산가액(분모) — echo
  limit1: number;                    // 1호 안분
  limit2: number;                    // 2호 차감
  allowedLimit: number;              // min(1호, 2호)
  unlistedStockCap: number;          // §73④
  fillOrder: FillOrderStep[];        // §74② 6단계
  requestedAmount?: number;
  acceptedRequest?: number;          // min(requested, allowedLimit) — 별지9호 ㊵
  warnings: string[];
}
```

> **result echo 추가**: `InheritanceGiftResult`에 `priorGiftToHeirTotal?: number`(= `heirOnlyGifts`, `inheritance-tax.ts:267·477`) 1필드. 계산·결정세액 불변(`echo-field-pattern`). `PaymentInKindResult`는 엔진 반환(저장 안 함, 투영).

---

## 4. 알고리즘 `calcPaymentInKindAssessment(input): PaymentInKindResult`

```
1. eligibleRealSec = max(0, realEstateValue + eligibleSecuritiesValue − ineligibleManagementValue)
   (비상장주식 원칙 제외 — §74①2호나목 단서로 최후순위, §73④ 캡 별도)
2. estateBase = max(0, grossEstateValue − exemptAmount + priorGiftToHeirTotal)   ← §1.3 확정 분모
3. 요건: meetsOverHalf = eligibleRealSec > estateBase / 2
        meetsTaxOver20M = finalTax > 20_000_000
        meetsTaxOverFinancial = finalTax > netFinancialValue
        eligible = 3개 모두 true
4. 한도(estateBase=0 가드 → limit1=0):
   limit1 = estateBase>0 ? safeMultiplyThenDivide(finalTax, eligibleRealSec, estateBase) : 0   // BigInt round-half-up
   limit2 = max(0, finalTax − netFinancialValue − tradableListedValue)
   allowedLimit = max(0, min(limit1, limit2))
5. 비상장 캡(§73④, 기준=taxableEstateValue):
   unlistedStockCap = max(0, finalTax − (taxableEstateValue − unlistedStockValue − heirResidenceValue))
6. 충당순서(§74②): [국채·공채0, 상장(처분제한), 부동산, 기타유가증권, 비상장(캡·최후순위 note), 거주주택(최후순위 note)]
7. warnings: eligibleRealSec 부족→§73② 초과허가 / 비상장 보유→§74②5호·§71② / ineligibleManagementValue>0→§73③
8. acceptedRequest = requestedAmount!=null ? min(requestedAmount, allowedLimit) : undefined
```

> **정밀도**: `limit1` 안분은 `safeMultiplyThenDivide`(BigInt) — `finalTax × eligibleRealSec`가 2^53 초과 가능(`feedback_safemul_decimal_apportion_precision`·`bigint-round-half-up`).

---

## 5. 데이터 소싱 (엔진 입력 구성 — 결과뷰/헬퍼 책임)

| input | 출처 | 가드 |
|---|---|---|
| `finalTax`·`grossEstateValue`·`exemptAmount`·`taxableEstateValue` | result echo(존재 확인 ✅) | — |
| `priorGiftToHeirTotal` | result echo(★추가) | echo 누락 시 0 |
| `realEstateValue` | `buildSummaryCategory`==="realEstate" 합 | 국내 가정(확인⑤) |
| `unlistedStockValue` | category==="unlisted_stock" **OR** (buildSummaryCategory==="stock" ∧ `unlistedStockData`/`unlistedStockValuationV2` 보유) | ⚠️ buildSummaryCategory는 stock 통합(L22-23) → listed/unlisted **세분 불가**, category+평가데이터로 분리 |
| `tradableListedValue` | category==="listed_stock" **OR** (stock ∧ `listedStockCode`/`listedStockShares`) − 처분제한분 | §73①2호 차감 |
| `eligibleSecuritiesValue` | 처분제한 상장 + 국채·공채(보정 입력 — estate 분류 없음, 확인②) | 기본 0 |
| `netFinancialValue` | estateItems `buildSummaryCategory`==="financial" 합 (⚠️ Do 환류: `netFinancialAssets`는 result 아닌 InheritanceDeductionInput 필드 L864) | 금융채무 차감 보정 후속 |
| `heirResidenceValue`·`ineligibleManagementValue`·`requestedAmount` | 보정/폼 입력 | `parseAmount` NaN 가드 |

> stock 세분: `buildSummaryCategory`는 realEstate/financial **집계용**에만 신뢰. listed/unlisted는 `EstateItem.category`(`listed_stock`/`unlisted_stock`, L73-74) 우선 + 평가데이터(`listedStockCode`·`unlistedStockData`) 보조(category="other"로 마킹된 평가자산 케이스 흡수, asset-category.ts L53-67).

---

## 6. 케이스 인벤토리 (Pre-Do anchor — `__tests__/tax-engine/inheritance/payment-in-kind.test.ts`)

| ID | 시나리오 | 기대 | 검증원 |
|---|---|---|---|
| PIK-01 | finalTax ≤ 2천만 | eligible:false(요건2) | §73①2호 |
| PIK-02 | finalTax = 20,000,000 | 부적격(초과 아님) | §73①2호 |
| PIK-03 | 부동산·유가증권 ≤ estateBase/2 | eligible:false(요건1) | §73①1호 |
| PIK-04 | finalTax ≤ 금융재산 | eligible:false(요건3) | §73①3호 |
| PIK-05 | §4.3 예시(estateBase 20억·finalTax 4억) | limit1=3억, limit2=1.5억, allowed=1.5억 | §73① |
| PIK-06 | 부동산 비중 작음 | allowed=limit1 | §73① |
| PIK-07 | 비상장 비중·다른재산 부족 | unlistedStockCap>0 | §73④ |
| PIK-07b | 다른 재산 충당 가능 | unlistedStockCap=0 | §73④ |
| PIK-08 | 충당순서 | fillOrder 6행, 비상장5·거주주택6 | §74② |
| PIK-09 | ineligibleManagementValue>0 | 분자·요건1 차감 반영 | §73③·§71 |
| PIK-10 | 충당 부동산·유가증권 부족 | §73② 초과허가 warning | §73② |
| PIK-11 | requested>allowed | acceptedRequest=allowed | §73① |
| PIK-12 | 거주자/비거주자 | ⚠️ 엔진 input에 decedentType 없음 → **UI E2E 이관**(PIK-UI) | §70①·§67④ |
| PIK-13 | 상속인 사전증여·비과세 있음 | estateBase=gross−비과세+사전증여, 1/2·limit1 반영 | §1.3·조심2016서3563 |
| PIK-14 | 산출세액≠납부세액 | input에 산출세액 필드 없음 → **PIK-05 통합**(finalTax 기준) | 조심2016서3563 |

> 원단위 `toBe()` anchor 동결(`feedback_pdf_example_test_anchoring`). PIK-13·14는 분모 확정 회귀 lock.

---

## 7. 파일 맵 (엔진)

```
lib/tax-engine/
├── credits/payment-in-kind.ts            # ★ calcPaymentInKindAssessment(input):Result + isPaymentInKindEligible(input):boolean (요건3개·≠installment finalTax단일 L250)
├── legal-codes/inheritance-gift.ts        # PAYMENT_IN_KIND 유지 + §74② 충당순서 라벨 상수
├── inheritance-tax.ts                     # result echo priorGiftToHeirTotal(= heirOnlyGifts) 1필드
└── types/inheritance-gift.types.ts        # PaymentInKind* 타입 + result echo 필드
__tests__/tax-engine/inheritance/payment-in-kind.test.ts  # PIK-01~14
```

---

## 8. 동기화 지점 (엔진 측)

| 지점 | 작업 |
|---|---|
| 순수 함수 | `calcPaymentInKindAssessment` 단일 진실(UI 재구현 금지) |
| result echo | `priorGiftToHeirTotal` 1필드(계산 불변) — §3.1 |
| ④⑨~⑭ API/Zod/Route | ❌ 미경유(투영) |

> UI 측 동기화(①②③⑤⑦⑧)는 `.ui.design.md`.

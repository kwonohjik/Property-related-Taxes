# 상속세 물납(物納) — 구현 계획서

> 상증법 §73 + 시행령 §70·§71·§73·§74 기반. 상속세 마법사 5단계(공제·세액공제) 끝에
> 물납 신청을 받아, 결과 화면에 **물납 요건 충족 여부·물납 허용한도(min 산식)·충당순서**를
> 안내 카드로 출력하고 별지 제9호서식 ㊵ 물납 칸에 신청액을 연결한다.
>
> 작성일 2026-06-06 · KoreanLaw MCP 법령 실측 검증 완료 · 인터뷰 1회(범위 3건) 반영

---

## 0. 범위 확정 사항 (인터뷰 3건, 2026-06-06)

| # | 결정 | 내용 |
|---|---|---|
| 1 | **구현 범위** | **일반 물납(§73)만.** 부동산·유가증권 물납 요건 3개 + 허용한도(min) + 충당순서. **§73의2(문화유산·미술품 물납)는 후속 분리** — 문체부 통보·요청·국고손실 위험 판단 등 별도 절차가 많음. |
| 2 | **충당재산 입력** | **estate 자동도출 + 보정.** 이미 입력한 상속재산을 카테고리별(부동산/상장주식/비상장주식/금융재산)로 자동 합산하고, 사용자는 "관리·처분 부적당 제외" 보정만. **이중입력 없음, 단일 진실(result 측 가액).** |
| 3 | **계산 깊이** | **요건 + 허용한도 + 충당순서 안내.** §73① 3요건 판정, 물납 허용한도 = min(부동산·유가증권 안분세액, 납부세액−순금융−상장) + 비상장 별도캡(§73④), §74② 충당순서 6단계 안내. **재산 배분 시뮬레이션(어느 재산을 얼마 물납)은 미포함 — 후속.** |

> 연부연납(`inheritance-installment-payment.design.md`)과 **동일 아키텍처**: API 미경유, 결과뷰 순수함수 투영, 결정세액 불변. 본 문서는 그 패턴을 차용한다.

---

## 1. 법령 근거 (KoreanLaw MCP 실측 검증)

### 1.1 본칙 — 상증법 (mst 276123, 시행 2026-01-02)

| 조문 | 내용 | 검증 |
|---|---|---|
| **§73①** | 물납 허가 = 다음 **3요건 모두** 충족 + 신청. 단서: 관리·처분 부적당 시 불허 가능 | ✅ |
| **§73①1호** | 상속재산(§13 가산 증여재산 중 **상속인·수유자가 받은 것 포함**) 중 부동산·유가증권(국내소재 등 §74① 충당가능재산 한정) 가액이 **상속재산가액의 1/2 초과** | ✅ |
| **§73①2호** | 상속세 **납부세액 > 2천만원** | ✅ |
| **§73①3호** | 상속세 **납부세액 > 금융재산 가액**(§13 가산 증여재산 제외, §73⑤ 정의) | ✅ |
| **§73②** | 충당재산 범위·관리처분 부적당·물납절차·신청사항 = 대통령령 위임 | ✅ |
| **§73의2** | 문화유산·미술품 물납 (부동산·유가증권 1/2 요건 없음, 문체부 통보·요청·국고손실 판단) | ✅ **본 범위 외(후속)** |

### 1.2 시행령 — 상증령 (mst 283637, 시행 2026-02-27)

| 조문 | 내용 | 검증 |
|---|---|---|
| **§70①** | 물납 신청 = §67①·③ 준용("연부연납"→"물납") → **신청기한 = 상속세 신고기한**(상속개시월 말일 +6개월, 해외 9개월) | ✅ |
| **§70②** | 연부연납 허가자가 **분납세액(첫 회분 / 중소기업 5회분, 가산금 제외)**을 물납 가능 — 분납기한 30일 전 신청 | ✅ (병행 — 본 범위 외 모델링) |
| **§70③** | 허가기한 14일(§70② 신청은 14일), 평가 소요 시 1회 30일 연장, 미발송 시 허가 간주 | ✅ |
| **§70⑤** | 허가일부터 30일 이내 수납일 지정 | ✅ |
| **§70⑦** | 분할 물납 시 가액 감소 안 되는 경우만 허가 | ✅ |
| **§73① (한도)** | 물납 신청 납부세액 = **다음 2호 중 적은 금액** 초과 불가 → **min 산식** | ✅ |
| **§73①1호** | 상속재산 중 §74① 충당가능 **부동산·유가증권 가액에 대한** 상속세 납부세액 (안분) | ✅ |
| **§73①2호** | 상속세 납부세액 − [§73⑤ **금융재산 가액**(금융회사 채무 차감) + **거래소 상장 유가증권**(처분제한 제외) 가액] | ✅ |
| **§73②** | 적합한 가액 물건 없으면 해당 납부세액 **초과분도 물납 허가 가능** | ✅ |
| **§73③** | 상속개시~신청 사이 정당사유 없이 관리처분 부적당 변경 시, **해당 가액 상당 세액은 물납청구액에서 제외** | ✅ |
| **§73④** | **비상장주식 캡**: 비상장주식 물납 세액 ≤ 납부세액 − 상속세 과세가액[비상장주식 + **상속개시일 현재 상속인 거주 주택·부수토지**(담보채무 차감) 차감] | ✅ |
| **§73⑤** | **금융재산** = 금전·예금·적금·부금·계금·출자금·특정금전신탁·보험금·공제금·어음 | ✅ |
| **§74①** | 충당가능 재산: 1호 **국내소재 부동산**, 2호 국채·공채·주권·내국법인 채권/증권+재정경제부령 유가증권. **제외**: 가목 상장(최초상장+처분제한은 예외 가능), 나목 비상장(다른재산 없거나 §2②1~3호로 충당 부족 시만 가능) | ✅ |
| **§74②** | **충당순서** (정당사유 없는 한): ①국채·공채 → ②상장유가증권(처분제한, 1호 제외) → ③국내부동산(6호 제외) → ④유가증권(1·2·5호 제외) → ⑤비상장주식 → ⑥**상속인 거주 주택·부수토지** | ✅ |
| **§71①** | **관리·처분 부적당 재산**: [부동산] 재산권(지상·지역·전세·저당권) 설정 / 토지·건물 소유자 상이 / 묘지 / 유사사유. [유가증권] 발행회사 폐업·사업자등록말소 / 해산·회생 / 결손금(신청 전 2년내) / 외감 감사보고서 미작성 / 유사사유 | ✅ |
| **§75** | 물납 수납가액 = 원칙 **상속재산 평가가액**(재평가 사유 별도) | ✅ (계산 영향 보조) |

### 1.3 §73①1호 안분 산식 — ✅ 분모 확정 (2026-06-06, 조세심판원 결정례 검증)

> 시행령 §73①1호 "물납에 충당할 수 있는 부동산 및 유가증권의 가액에 대한 상속세 납부세액"의 안분 산식:
>
> **`limit1 = 상속세 납부세액 × (충당가능 부동산·유가증권 가액 ÷ 해당 상속재산가액)`**
>
> **분모 = 본칙 §73①1호 "해당 상속재산가액의 1/2"의 분모와 동일** = **상속재산가액(채무·공과금·장례비 차감 前)**. **과세표준·과세가액 아님.**
> - 앱 변수: **`분모 = grossEstateValue − exemptAmount + priorGiftToHeirTotal`**
>   - `grossEstateValue`(본래+간주, 비과세 차감 전, `inheritance-tax.ts:117`) **− 비과세(`exemptAmount`)** **+ 상속인·수유자가 받은 사전증여(`priorGiftToHeirTotal` §13, `inheritance-tax.ts:460`)**
>   - **채무·공과금·장례비·각종 상속공제는 차감하지 않음**(과세가액 아님 — 과세가액 산식은 `inheritance-tax.ts:253`에서 추가로 `−deductedBeforeAggregation` 차감, 분모는 그 前 단계). 추정상속재산(§15 `presumedTotal`)은 실체 없어 **분모 제외**(보수적 — 판례 명시 부재 caveat).
> - **분자** = 충당가능 부동산·유가증권 (상속재산 中 + 사전증여 中 상속인·수유자가 받은 부동산·유가증권, 비과세분 제외). 비상장주식은 원칙 분자 제외(§73④ 캡으로 별도).
> - **"상속세 납부세액" = 산출세액 − 세액공제 = 실제 납부세액 = `finalTax`** — **산출세액(§26) 아님**(조심2016서3563 명시).
>
> **근거**: ① **조심2016서3563**(2016.12.5) — "납부세액은 산출세액에서 세액공제를 차감한 **실제 납부할 금액**", 표 주석 "분모 = 상속재산가액−비과세, 사전증여 포함". ② **조심2024중4490**(2024.12.27) — §73①2호 순금융재산(금융재산−금융회사채무) 구조 확인. ③ 국세청 해석 31건은 충당순서·수납가액 중심으로 **분모 산식 직접 명시 없음**(집행기준 73-73-1은 법제처 API 미수록).

---

## 2. 현행 구현 갭 분석

대상: 물납은 **이름표만 존재, 실기능 0%** (선행 파악 2026-06-06).

| # | 현행 | 문제 | 비고 |
|---|---|---|---|
| P1 | 입력 폼 없음 | 물납 신청 여부·충당재산 보정 입력 UI 부재 | 연부연납은 `InstallmentInputSection` 존재 |
| P2 | 엔진 없음 | 요건 판정·허용한도(min)·충당순서 계산 함수 전무 | `lib/tax-engine/credits/`에 신규 |
| P3 | 결과 카드 없음 | 결과뷰에 물납 안내 없음 | — |
| P4 | 별지9호 ㊵ 미연결 | `filing-form-9-constants.ts:72` `"㊵":"물납"` **라벨만**, `FilingForm9CoverSection.tsx`에서 **㊵ 미사용**(grep 0건). 양식은 `①~⑯ + ㊶(분납)`만 렌더 | ㊵ 칸 자체가 양식에 안 나옴 |
| P5 | 선언만 존재 | `legal-codes/inheritance-gift.ts:275` `PAYMENT_IN_KIND:"상증법 §73"` + `manifest/additions-inheritance.ts:221` `INH.PAYMENT_IN_KIND`(citation·keywords) | 실기능 0 — 메타데이터만 |
| P6 | (오해 주의) | `inheritance-farming.types.ts:212` `corporate_stock_disposal //…(물납 §73)` | **영농 사후관리 주석일 뿐 물납 기능 아님** — 손대지 않음 |

---

## 3. 아키텍처 결정

### 3.1 계산 위치 — 순수 엔진 함수 + 결과 화면 호출 (API 미경유)

물납은 **결정세액(`result.finalTax`)을 확정한 뒤의 납부방법 선택**이며 **결정세액 자체에 영향을 주지 않는다**. 입력값(물납 여부·충당재산 보정)도 백엔드 엔진 계산에 들어가지 않는다. → **연부연납과 동일하게 백엔드 API/Zod/Route(동기화 ⑨~⑭) 미변경.**

1. **순수 엔진 함수 `calcPaymentInKindAssessment()` 신규**(`lib/tax-engine/credits/payment-in-kind.ts`) — 단일 진실. UI 자체 재구현 금지(`feedback_ui_engine_dual_truth_avoidance`).
2. **결과 화면**(`InheritanceTaxResultView`)이 `result` + 폼 입력 props를 받아 `calcPaymentInKindAssessment()` 호출 → `PaymentInKindCard` 렌더.
3. 입력값은 폼 상태(sessionStorage/IndexedDB 자동 persist)에만 저장.
4. **estate 자동도출**: 충당가능 재산 가액은 `result`의 카테고리별 합계 + estate items 분류에서 도출(§5.3). 사용자는 보정(관리처분 부적당 제외)만.

> 근거: 14 동기화 지점은 "엔진 input·result 변경 시" 발동. 본 기능은 엔진 **input·API·Zod 불변**(투영 계산)이되, **result에 echo 필드 `priorGiftToHeirTotal` 1개 추가**(§73①1호 분모 = `grossEstateValue − exemptAmount + heirOnlyGifts` 중 heirOnlyGifts만 result 미echo). echo는 **계산·결정세액 불변**(`echo-field-pattern`). 이력 영속(IndexedDB resultData) 요구 시 추가 확장 — Do 착수 전 재확인(확인 필요 ④).

### 3.2 파일 맵

```
lib/tax-engine/
├── credits/payment-in-kind.ts            # ★신규: calcPaymentInKindAssessment() + isPaymentInKindEligible()
└── legal-codes/inheritance-gift.ts        # PAYMENT_IN_KIND 유지 + §73·§74 충당순서 상수 추가

components/calc/inheritance/
├── shared.ts                              # ①②③ 폼 필드 추가 + ⑧ validateStep
├── PaymentInKindInputSection.tsx          # ★신규: 물납 입력 섹션 (연부연납 섹션과 같은 Step4 끝, sky tone)
│                                          #   또는 InstallmentInputSection에 병합 — §5.1 결정
└── filing-form-9/
    ├── FilingForm9CoverSection.tsx        # ㊵ 물납액 prop 추가 + 칸 렌더(현재 미렌더)
    └── filing-form-9-constants.ts         # "㊵":"물납" 라벨 유지

components/calc/results/
├── payment-in-kind/PaymentInKindCard.tsx  # ★신규: 요건 체크리스트 + 허용한도 산식 + 충당순서 표 (results/ 하위 관례)
└── InheritanceTaxResultView.tsx           # ⑦ PaymentInKindCard 렌더 + props 배선
# InheritanceTaxForm.tsx InheritanceTaxResultView 호출에 물납 폼 props 배선
```

---

## 4. 엔진 설계 — `calcPaymentInKindAssessment()`

### 4.1 입력/출력 타입

```ts
/** 물납 충당재산 가액 — estate 자동도출(§5.3) 후 보정 반영한 값. 엔진은 분류·계산만. */
export interface PaymentInKindAssets {
  /** §74①1호 국내소재 부동산 (해외부동산·관리처분 부적당 제외 후) */
  realEstateValue: number;
  /** §74①2호 충당가능 유가증권 = 국채·공채·주권·내국법인 채권 + 처분제한 상장유가증권 */
  eligibleSecuritiesValue: number;
  /** §74②5호 비상장주식 (§73④ 캡 대상·최후순위) */
  unlistedStockValue: number;
  /** §73①2호 차감 — 처분제한 없는 거래소 상장 유가증권 */
  tradableListedValue: number;
  /** §73⑤ 금융재산 가액 (금융회사 채무 차감 후 순액) */
  netFinancialValue: number;
  /** §73④ 차감 — 상속개시일 현재 상속인 거주 주택·부수토지 (담보채무 차감 후) */
  heirResidenceValue: number;
  /** §73③·§71 관리처분 부적당으로 청구액에서 제외할 부동산·유가증권 가액 (보정 입력) */
  ineligibleManagementValue: number;
}

export interface PaymentInKindInput {
  finalTax: number;            // 상속세 납부세액 = 산출세액−세액공제 (result.finalTax) — 조심2016서3563
  grossEstateValue: number;    // 본래+간주 상속재산 평가액 (result.grossEstateValue, 비과세 차감 前)
  exemptAmount: number;        // 비과세재산 (result) — 분모 차감
  priorGiftToHeirTotal: number;// 상속인·수유자 사전증여 §13 — ⚠️ result 미echo(heirOnlyGifts 내부변수 tax.ts:267·477) → echo 필드 추가 필수(Do). priorGiftAggregated(전체) 아님
  taxableEstateValue: number;        // 상속세 과세가액 (result.taxableEstateValue L1120, tax.ts:251) — §73④ 비상장 캡 기준(채무 차감 後)
  assets: PaymentInKindAssets;
  requestedAmount?: number;    // 사용자 희망 물납액 (미입력 시 허용한도로 안내)
}
// 해당 상속재산가액(1/2 요건·1호 안분 분모) = grossEstateValue − exemptAmount + priorGiftToHeirTotal (§1.3 확정)

export interface PaymentInKindRequirement {
  // 요건1 — §73①1호
  realEstateSecuritiesValue: number;  // 충당가능 부동산·유가증권 합 (§73③ 제외 반영)
  halfThreshold: number;              // grossEstateValue × 1/2
  meetsOverHalf: boolean;             // realEstateSecuritiesValue > halfThreshold
  // 요건2 — §73①2호
  taxThreshold: number;               // 20,000,000
  meetsTaxOver20M: boolean;           // finalTax > 2천만원
  // 요건3 — §73①3호
  financialValue: number;             // 금융재산 (순액)
  meetsTaxOverFinancial: boolean;     // finalTax > 금융재산
}

export interface FillOrderStep {
  order: number;          // 1..6 (§74②)
  label: string;          // "국채·공채" 등
  availableValue: number; // 해당 단계 가용 충당재산 가액 (자동도출분)
  note?: string;          // 비상장 최후순위·관리처분 부적당 등
}

export interface PaymentInKindResult {
  eligible: boolean;                 // 3요건 모두 충족
  requirement: PaymentInKindRequirement;
  estateBase: number;    // 해당 상속재산가액(분모) = gross − 비과세 + 사전증여(상속인) — echo, §1.3
  // 허용한도 (§73①)
  limit1: number;        // 1호: floor(finalTax × 충당가능부동산유가증권 / estateBase)
  limit2: number;        // 2호: finalTax − netFinancial − tradableListed (음수면 0)
  allowedLimit: number;  // min(limit1, limit2) ≥ 0
  // §73④ 비상장 별도 캡
  unlistedStockCap: number;          // §73④ max(0, finalTax − (taxableEstateValue − unlisted − heirResidence)) — 기준=과세가액(≠1호 분모)
  // 충당순서 (§74②)
  fillOrder: FillOrderStep[];
  requestedAmount?: number;
  acceptedRequest?: number;          // min(requestedAmount, allowedLimit) — ㊵ 표시값
  warnings: string[];                // 관리처분 부적당·비상장 최후순위·적합물건 없음(§73②)·해외기한 등
}
```

### 4.2 알고리즘

1. **충당가능 부동산·유가증권 합** (요건1·1호 분자):
   `eligibleRealSec = realEstateValue + eligibleSecuritiesValue − ineligibleManagementValue` (음수 가드 0).
   *(비상장주식은 원칙 분자 제외 — §74①2호나목 단서로 최후순위 충당, §73④ 캡으로 별도 처리.)*
2. **해당 상속재산가액(분모)** = `estateBase = grossEstateValue − exemptAmount + priorGiftToHeirTotal` (§1.3 확정).
3. **요건 판정** (3개 모두 true → `eligible`):
   - 요건1: `eligibleRealSec > estateBase × 1/2`
   - 요건2: `finalTax > 20,000,000`
   - 요건3: `finalTax > netFinancialValue`
4. **허용한도** (§73①):
   - `limit1 = floor(finalTax × eligibleRealSec / estateBase)` *(분모 = estateBase, §1.3·조심2016서3563)*
   - `limit2 = max(0, finalTax − netFinancialValue − tradableListedValue)`
   - `allowedLimit = max(0, min(limit1, limit2))`
5. **비상장 캡** (§73④) — ⚠️ 기준은 **상속세 과세가액**(`taxableEstateValue`, 채무 차감 後), §73①1호 분모(`estateBase`, 차감 前)와 **다름**:
   - `unlistedStockCap = max(0, finalTax − (taxableEstateValue − unlistedStockValue − heirResidenceValue))`
   - 법문 §73④ "상속세 과세가액[비상장주식등과 상속개시일 현재 상속인이 거주하는 주택·부수토지(담보채무 차감)을 차감한 금액]". `taxableEstateValue`=`inheritance-tax.ts:253` 과세가액.
   - 비상장주식으로 물납 가능한 세액은 이 캡 이내 + 충당순서 최후순위(§74②5호).
6. **충당순서 6단계**(§74②) 각 단계 가용 가액 매핑 + note:
   - ①국채·공채(자동도출 한계 — 확인필요②) ②상장유가증권(처분제한) ③국내부동산 ④기타유가증권 ⑤비상장주식(캡·최후순위 note) ⑥상속인 거주 주택·부수토지.
7. **경고**:
   - `eligibleRealSec` 부족(적합 물건 없음) → §73② 초과허가 가능 안내.
   - 비상장주식 보유 시 §74②5호 최후순위·§71② 결손금 등 관리처분 부적당 가능 안내.
   - `ineligibleManagementValue > 0` → §73③ 제외 반영 표기.

> **floor·BigInt 정책**: 안분(limit1)은 `safeMultiplyThenDivide` + round-half-up(`bigint-round-half-up` 스킬). 분자 `finalTax × eligibleRealSec`가 2^53 초과 가능 → BigInt 경로 강제(`feedback_safemul_decimal_apportion_precision`).

### 4.3 예시 (요건·한도 일관 검증)

가정: 상속재산가액 20억, 납부세액 4억, 충당가능 부동산 14억(국내, 관리처분 적당), 상장유가증권 1억(처분제한), 처분제한없는 상장 0.5억, 금융재산 순액 2억, 비상장주식 2억, 상속인 거주주택 1억.

- 요건1: 충당가능 부동산·유가증권 = 14억 + 1억 = **15억 > 10억(20억×1/2)** ✓
- 요건2: 4억 > 2천만 ✓ / 요건3: 4억 > 금융 2억 ✓ → **eligible**
- estateBase = 20억 (사전증여·비과세 0 → grossEstateValue) → limit1 = floor(4억 × 15억 / 20억) = **3억**
- limit2 = 4억 − 2억(순금융) − 0.5억(처분제한없는 상장) = **1.5억**
- **allowedLimit = min(3억, 1.5억) = 1.5억**
- 비상장 캡(§73④, 기준=과세가액 20억[채무 0 가정]) = max(0, 4억 − (20억 − 2억 − 1억)) = max(0, 4억 − 17억) = **0** → 비상장 물납 불가(다른 재산으로 충당 가능)
- 충당순서: 상장유가증권(처분제한 1억) → 국내부동산(14억) 순으로 1.5억 충당 가능 안내.

> 위 수치는 **자기일관 anchor**(PIK-04~07)로 동결. 1호 분모 확정(확인필요①) 시 limit1 재산정.

---

## 5. UI 설계

### 5.1 입력 — Step4(공제·세액공제) 맨 끝 (동기화 ⑤)

**결정 A(권장)**: 연부연납·분납과 **별도 ToggleCard**(sky tone)로 `PaymentInKindInputSection` 신규. 연부연납 섹션 **아래**에 배치(납부방법 그룹).

```
┌ 물납 신청 (상증법 §73)  [ToggleCard sky]  ⊙────   ← 여부 토글
│  ⓘ 부동산·유가증권 가액이 상속재산의 1/2 초과 + 납부세액 2천만원 초과 + 납부세액이
│     금융재산 초과 시 신청 가능. 결과 화면에 요건 충족·허용한도·충당순서가 표시됩니다.
│  (ON 시 펼침 — 충당재산은 입력한 상속재산에서 자동 집계, 아래는 보정만)
│  • [정보 카드] 자동 집계: 부동산 ___ / 상장 ___ / 비상장 ___ / 금융재산 ___  (result 도출)
│  • 관리·처분 부적당 제외액 [CurrencyInput]   ← §71·§73③ (저당권·소유자상이·묘지·결손법인 등)
│     ⓘ 저당권 등 설정 부동산, 폐업·결손 법인 유가증권은 물납이 제한될 수 있습니다.
│  • 희망 물납액 [CurrencyInput] (선택)        ← 미입력 시 허용한도로 안내. ㊵ 칸 = min(희망, 한도)
└
```

> 물납은 **연부연납과 법적으로 병행 가능**(§70② 분납세액 물납)하나, 본 범위는 **일시납 물납만** 모델링 → 분납/연부연납과 **배타 처리하지 않음**(독립 토글). 병행 시 안내 note만(확인 필요 ③).

규칙: ToggleCard(native 금지)·OFF도 sky tone 유지·CurrencyInput `onFocus select`·`hideLabel`+FieldCard 라벨·"원" 접미사 금지·placeholder 숫자 예시 금지(hint 한국어). 자동 집계 정보 카드는 **읽기 전용 표시**(fallback prop, store 미러링 금지 — `mirror-pattern`).

### 5.2 결과 — `PaymentInKindCard` (동기화 ⑦)

sky 카드. **요건 체크리스트 → 허용한도 산식 → 충당순서 표** 3블록.

```
물납 안내 (상증법 §73)
부동산·유가증권 물납 — 요건·허용한도·충당순서
─────────────────────────────────────────────
[요건 충족]  (§73①)
 ✓ 부동산·유가증권 1,500,000,000 > 상속재산 1/2 (1,000,000,000)   (요건1 §73①1호)
 ✓ 납부세액 400,000,000 > 2천만원                                (요건2 §73①2호)
 ✓ 납부세액 400,000,000 > 금융재산 200,000,000                    (요건3 §73①3호)
 → 물납 신청 가능
─────────────────────────────────────────────
[물납 허용한도]  (§73①, 적은 금액)
 ① 부동산·유가증권 안분세액   300,000,000   (납부세액 × 충당가능/상속재산)
 ② 납부세액−순금융−상장        150,000,000   (400,000,000 − 200,000,000 − 50,000,000)
 ▶ 허용한도 = min(①,②)        150,000,000
 · 비상장주식 별도한도(§73④)            0   (다른 재산으로 충당 가능)
─────────────────────────────────────────────
[충당순서]  (§74②, 정당사유 없는 한)
 1 국채·공채            (해당 없음)
 2 상장유가증권(처분제한) 100,000,000
 3 국내 부동산          1,400,000,000
 4 그 밖의 유가증권      (해당 없음)
 5 비상장주식           200,000,000  ※ 최후순위·§73④ 한도·관리처분 부적당 주의
 6 상속인 거주 주택      100,000,000  ※ 최후순위
─────────────────────────────────────────────
※ 물납 신청은 상속세 신고기한까지(상속개시월 말일+6개월, 해외 9개월).
  저당권 등 설정 재산·폐업/결손 법인 유가증권은 관리·처분 부적당으로 불허될 수 있습니다(§71).
  실제 허가·수납가액은 관할 세무서 평가·세무사 확인 권장.
```

- 금액 칸 `text-right font-mono tabular-nums`(`amount-column-align` 스킬). "원" 접미사 금지·한국어 산식(`feedback_result_view_korean_formula`).
- 미충족 요건은 ✗ + rose tone, `eligible:false`면 한도·충당순서 블록 숨기고 미충족 사유만.
- 산출근거 ▼펼침(`formula-display-builder`) — 변수 배지(①②) + fine-print.
- 인쇄 시 자동 펼침 CSS-only(`print-only-css-toggle`), `PrintSection id="payment-in-kind"` 등록(8결과뷰 선택출력 레지스트리, `project_selective_print_6tax_series`).

### 5.3 데이터 소싱 매핑 (estate 자동도출)

| 엔진 입력 | 출처 | 비고 |
|---|---|---|
| `finalTax` | `result.finalTax` | 상속세 납부세액 |
| `grossEstateValue` | `result.grossEstateValue` | 상속재산가액(본래+간주 평가액, `inheritance-tax.ts:305`) |
| `realEstateValue` | `result` 카테고리 합계 `realEstate` (또는 estate items `real_estate_*` 합) | **국내 가정** — 해외 구분 필드 부재(확인필요⑤) |
| `eligibleSecuritiesValue` | 처분제한 상장 + 국채·공채·내국법인채권 | **자동도출 한계** — 국채·공채 별도 카테고리 없음(확인필요②). 1차: 0 + 보정 입력 |
| `unlistedStockValue` | estate `unlisted_stock` 합 / `result` `stock` 중 비상장 | `buildSummaryCategory`로 listed/unlisted 분리 |
| `tradableListedValue` | estate `listed_stock` 합 (처분제한 없는 것) | §73①2호 차감 |
| `netFinancialValue` | `result.netFinancialAsset`(§22 순금융재산) 또는 카테고리 `financial` − 금융채무 | §73⑤ 금융재산 ≈ §22 대상 + 보험금·어음(범위 차이 확인필요⑥) |
| `heirResidenceValue` | estate items 중 상속인 거주 주택·부수토지 (담보채무 차감) | **자동판정 어려움** — 보정/체크 입력 가능성(확인필요⑦) |
| `ineligibleManagementValue` | 신규 폼 필드(보정 입력) | §71·§73③ |
| `requestedAmount` | 신규 폼 필드 `paymentInKindRequestedAmount` | 미입력 시 한도 안내 |

> ⚠️ **`result.summaryTable.categoryTotals`는 optional**(종합사례 PDF 확장서만 채워짐, types L1190) → 물납 자동도출은 **`input.estateItems` 직접 집계**: realEstate/financial은 `buildSummaryCategory`, **상장/비상장은 stock 통합 분류(L22-23)라 `category`(`listed_stock`/`unlisted_stock`)+평가데이터로 세분**(`buildSummaryCategory` 불가). UI 재합산 금지·헬퍼 단일화(`single-source-engine-helper`). `netFinancialValue` ← `result.netFinancialAssets`(optional, `?? 0`). **상세 소싱 → `.engine.design.md` §5.**

---

## 6. 케이스 인벤토리 (Pre-Do anchor — 행 ≥ 1)

| ID | 시나리오 | 입력 | 기대 | 검증원 |
|---|---|---|---|---|
| PIK-01 | 부적격(세액) | finalTax 2천만 이하 | `eligible:false` (요건2 ✗) | §73①2호 |
| PIK-02 | 경계(세액) | finalTax = 20,000,000 | 부적격(초과 아님) | §73①2호 |
| PIK-03 | 부적격(1/2) | 부동산·유가증권 ≤ 상속재산 1/2 | `eligible:false` (요건1 ✗) | §73①1호 |
| PIK-04 | 부적격(금융) | finalTax ≤ 금융재산 | `eligible:false` (요건3 ✗) | §73①3호 |
| PIK-05 | 적격·한도 min | §4.3 예시(20억·4억) | limit1=3억, limit2=1.5억, **allowed=1.5억** | §73① |
| PIK-06 | 1호<2호 | 부동산 비중 작음 | allowed = limit1 | §73① |
| PIK-07 | 비상장 캡 | 비상장 비중 큼·다른재산 부족 | `unlistedStockCap > 0` | §73④ |
| PIK-08 | 충당순서 | 6단계 가용가액 매핑 | fillOrder 6행, 비상장 5위·거주주택 6위 | §74② |
| PIK-09 | 관리처분 제외 | `ineligibleManagementValue > 0` | 분자·요건1에서 차감 반영 | §73③·§71 |
| PIK-10 | 적합물건 없음 | 충당 부동산·유가증권 부족 | §73② 초과허가 가능 warning | §73② |
| PIK-11 | 희망액 캡 | requested > allowed | `acceptedRequest = allowed`, ㊵ = allowed | §73① |
| PIK-12 | 신청기한(UI) | 거주자/비거주자 | **UI E2E 이관**(엔진 input에 decedentType 없음) | §70①·§67④ |
| PIK-13 | 분모 보정 | 상속인 사전증여·비과세 있음 | `estateBase = gross − 비과세 + 사전증여`, 1/2 요건·limit1 분모에 반영 | §1.3·조심2016서3563 |
| PIK-14 | 납부세액 정의 | 산출세액 ≠ 납부세액 | **PIK-05 통합**(`finalTax` 기준, input에 산출세액 필드 없음) | 조심2016서3563 |

> 안분(limit1) 산출값은 분모(`estateBase`, §1.3 확정) 기준 원단위 `toBe()` anchor 동결(`feedback_pdf_example_test_anchoring`·`feedback_anchor_correction_legal_priority`).

---

## 7. 동기화 지점 영향도

**엔진 input·API·Zod 불변(투영)** → 14 지점 중 **클라이언트 ①②③⑤⑦⑧ + 순수 함수 + result echo 1필드(`priorGiftToHeirTotal`, 계산 불변)**. **④⑥⑨~⑭ 미해당**(API 미경유·세액 불변).

| 지점 | 작업 | 해당 |
|---|---|---|
| ① 폼 상태 | `paymentInKindEnabled` / `paymentInKindIneligibleAmount` / `paymentInKindRequestedAmount` | ✅ shared.ts FormState |
| ② initial | INITIAL_FORM 기본값(`false`/`""`/`""`) | ✅ |
| ③ normalize | sessionStorage 호환 fallback | ✅ |
| ④ API 변환 | — | ❌ 미경유 |
| ⑤ UI 위젯 | `PaymentInKindInputSection`(Step4 끝) | ✅ |
| ⑥ 사이드바 합계 | — | ❌ 세액 불변 |
| ⑦ 결과 카드 | `PaymentInKindCard` + 별지9호 ㊵ prop | ✅ |
| ⑧ validation | `paymentInKindIneligibleAmount`·`requestedAmount` ≥ 0, 허용한도 초과 입력 경고(차단 아님) | ✅ 클라이언트 한정 |
| ⑨~⑭ | — | ❌ |

> ⚠️ 3.1(API 미경유)이 뒤집히면(이력 영속 등) ⑨~⑭ 전부 재평가(확인필요④).

---

## 8. 작업 순서 (PDCA Do — 엔진 선행 → UI)

1. **법령코드** `legal-codes/inheritance-gift.ts` — `PAYMENT_IN_KIND`(유지) + §74② 충당순서 라벨 상수 추가.
2. **엔진** `credits/payment-in-kind.ts` — `calcPaymentInKindAssessment(input)` + `isPaymentInKindEligible(input)` 신규(요건 → 한도 min → 비상장캡 → 충당순서 → 경고). safeMul/BigInt 안분. **+ `inheritance-tax.ts` result에 `priorGiftToHeirTotal` echo 1필드 추가**(= `heirOnlyGifts`, 계산 불변) + 타입 `inheritance-gift.types.ts`. (엔진 상세 → `.engine.design.md`)
3. **anchor** `__tests__/tax-engine/inheritance/payment-in-kind.test.ts` PIK-01~12 작성 → **실패 확보**(Pre-Do, `pre-do-anchor-verification`). 분모 가정 검증.
4. **폼** shared.ts ①②③ 필드 + INITIAL_FORM + normalize + validateStep ⑧.
5. **UI 입력** `PaymentInKindInputSection`(Step4 끝, 연부연납 아래) + estate 자동집계 정보 카드(fallback prop).
6. **결과** `PaymentInKindCard` 신규 + `InheritanceTaxResultView` 렌더·props 배선 + `InheritanceTaxForm` 호출부 props. 별지9호 `FilingForm9CoverSection` ㊵ prop·칸 렌더.
7. **Check** `npx tsc --noEmit` 0 → `vitest run __tests__/tax-engine/inheritance/` → e2e(`e2e/inheritance-payment-in-kind.spec.ts` 폼→계산→결과, `feedback_browser_verify_with_playwright`).
8. **회귀** `npm test` 전체(공유 모듈 영향).

---

## 9. 확인 필요 (Do 착수 전 확정)

- **확인 필요 ①** ✅ **해결(2026-06-06)** — §73①1호 안분 **분모 = "해당 상속재산가액"**(채무 차감 前) = `grossEstateValue − exemptAmount + priorGiftToHeirTotal`(§1.3). **과세표준·과세가액 아님.** 납부세액=`finalTax`(산출세액−세액공제). 근거 **조심2016서3563·조심2024중4490**. ※ 단 **§73④ 비상장 캡 기준은 "상속세 과세가액"**(`taxableEstateValue`, 차감 後)로 1호 분모와 다름(§4.2-5). **단순화**: 사전증여·비과세 0인 일반 케이스는 분모=`grossEstateValue`.
- **확인 필요 ⑧** ✅ **실측(2026-06-06)** — `exemptAmount`(types L1113)·`taxableEstateValue`(L1120)는 result echo **존재**. `netFinancialAssets`(L856) optional 존재. **`priorGiftToHeirTotal`은 result 미echo**(tax.ts L460·477은 함수 파라미터·`heirOnlyGifts` 내부변수, types/ grep 0건) → **echo 필드 1개 추가 필수**(Do, `echo-field-pattern`, 계산 불변). `summaryTable.categoryTotals`는 optional(종합사례서만).
- **확인 필요 ②** §74① 충당가능 유가증권 중 **국채·공채**가 estate 카테고리에 별도 분류 없음 — `listed_stock`/`financial`/`other` 중 어디로? 1차: 보정 입력 또는 0 가정.
- **확인 필요 ③** 물납↔연부연납 **병행**(§70② 분납세액 물납) 모델링 범위 — 1차 독립 토글(일시납 물납만), note만.
- **확인 필요 ④** **API 미경유** 채택 — 이력 영속(resultData) 요구 시 result 확장 + ⑨~⑭ 재평가.
- **확인 필요 ⑤** 부동산 **국내/해외 구분** 필드 부재 — §74①1호 "국내소재" 한정. 1차 전부 국내 가정 + 안내.
- **확인 필요 ⑥** §73⑤ **금융재산** 범위(금전·예금·보험금·공제금·어음) ↔ §22 순금융재산 범위 차이(보험금·어음 포함 여부) 정합.
- **확인 필요 ⑦** §73④·§74②6호 **상속인 거주 주택·부수토지** 자동판정 — estate에 "거주 주택" 플래그 부재. 보정/체크 입력 필요성.

---

## 10. 참고 — 검증에 사용한 자료

- **KoreanLaw MCP** (2026-06-06 실측):
  - 상증법 §73·§73의2 (mst 276123)
  - 상증령 §70(신청·허가)·§71(관리처분 부적당)·§73(물납신청 범위=한도)·§74(충당재산 범위·순서)·§75(수납가액) (mst 283637)
  - **조세심판원 조심2016서3563**(2016.12.5, ID 902052) — §73①1호 "납부세액 = 산출세액−세액공제(실제 납부세액)", 표 주석 "분모 = 상속재산가액−비과세, 사전증여 포함"
  - **조세심판원 조심2024중4490**(2024.12.27, ID 2039043) — §73①2호 순금융재산(금융재산−금융회사채무)·§73② 적합물건 없을 때 초과허가·§75 수납가액(평가기준일 가액)
  - 국세청 해석 31건(domain=nts: 충당순서·수납가액·충당재산 범위 — **분모 안분 산식 직접 명시 없음**, 집행기준 73-73-1은 법제처 API 미수록)
- **현행 코드**(실측):
  - `lib/tax-engine/legal-codes/inheritance-gift.ts:274` `PAYMENT_IN_KIND`
  - `lib/legal-verification/manifest/additions-inheritance.ts:221` `INH.PAYMENT_IN_KIND`
  - `components/calc/inheritance/filing-form-9/filing-form-9-constants.ts:72` `"㊵":"물납"` (라벨만, 미렌더)
  - `lib/tax-engine/inheritance-asset-category.ts` `buildSummaryCategory`(카테고리→financial/realEstate/stock/other)
  - result 필드: `inheritance-gift.types.ts` `grossEstateValue`(L1111)·카테고리 breakdown(L1192~1194)·`financialDeduction`(L975)
- **참조 패턴**: `inheritance-installment-payment.design.md`(연부연납 — API 미경유 투영·결과카드·동기화 ⑤⑦⑧)
- **적용 스킬/정책**: `tax-field-add`(8지점)·`amount-column-align`·`formula-display-builder`·`mirror-pattern`·`single-source-engine-helper`·`bigint-round-half-up`·`pre-do-anchor-verification`·`feedback_safemul_decimal_apportion_precision`·`feedback_design_law_cases`·`feedback_ui_engine_dual_truth_avoidance`

# 배우자등 이월과세 + 비교과세 (소득세법 §97조의2) — Plan

> Feature: `transfer-tax-carryover-taxation`
> Tax: 양도소득세 (transfer)
> 작성일: 2026-05-04
> 작성자: kwonohjik
> 상태: Plan (Design 진입 전)

---

## 1. 배경 및 목적

배우자·직계존비속으로부터 **증여받은 부동산을 일정 기간(5년/10년) 이내에 양도**하는 경우, 소득세법 §97조의2에 따라 **취득가액·취득일을 증여자 기준으로 환산**하여 양도소득세를 계산해야 한다(이월과세). 또한 2017.7.1. 이후 양도분부터는 **비교과세**가 적용되어, 이월과세 적용·미적용 세액 중 **큰 금액**으로 신고해야 한다.

현재 엔진은 `acquisitionCause: "gift"` 필드와 `donorAcquisitionDate`(단기보유 판정용)만 부분 지원하며, **이월과세 본격 계산·비교과세·증여세 상당액 필요경비 가산**은 미구현. 본 기능으로 예제 수준의 이월과세 자동 계산을 제공한다.

### 핵심 사용자 가치
- 증여 후 양도 사례에서 **이월과세 적용 여부 자동 판정** + 적용 시 환산 자동
- **비교과세 결과를 양 시나리오 나란히** 표시하여 신고세액 자동 결정
- 증여자 취득가액 미확인 시 **PHD/APD 환산 로직 재사용**으로 입력 부담 최소화

### 비-목표 (v1 제외)
- 주식·파생상품·시설물이용권 등 §94①3호 자산 (v2)
- 가업상속공제 적용 자산의 §97조의2 ④항 (특수 케이스, v2)
- 증여세 상당액 자동 계산 (gift-tax 엔진 연동) — 사용자 직접 입력으로 충분 (v2 검토)

---

## 2. 법령 근거

| 조문 | 내용 |
|---|---|
| 소득세법 §97조의2 ① | 이월과세 본문 — 배우자/직계존비속 증여 자산, 양도일부터 소급 10년(주식 1년) 이내 양도 시 |
| 소득세법 §97조의2 ① 1호 | 취득가액 = 증여자의 취득 당시 §97①1호 금액 |
| 소득세법 §97조의2 ① 2호 (전단) | **증여세 상당액**을 필요경비에 가산 |
| 소득세법 §97조의2 ① 2호 (후단, 2023.12.31. 신설) | **증여자가 보유 중 지출한 자본적지출액(§97①2호)**을 수증자 필요경비에 포함. **시행: 2024.1.1. 이후 양도분부터** |
| 소득세법 §97조의2 ② 1호 | 적용배제 — 사업인정고시일 2년 이전 증여 토지·건물 협의매수·수용 |
| 소득세법 §97조의2 ② 2호 | 적용배제 — 이월과세 적용 시 §89①3호 각 목 주택(**고가주택 포함**) 비과세 해당 |
| 소득세법 §97조의2 ② 3호 | 적용배제 — 이월과세 적용 결정세액 < 미적용 결정세액 (비교과세) |
| 소득세법 §97조의2 ③ | **기간 계산은 등기부에 기재된 소유기간** 기준 — 기산일 = 증여 등기접수일 |
| 소득세법 §97조의2 ④ | **가업상속공제 적용 자산 특례** (별개 조항, v1 미지원) |
| **부칙 (2022.12.31. 법률 제19196호)** | **2023.1.1. 이후 증여분부터 10년**, 이전 증여분은 종전 5년 적용 |
| 소득세법 §95 ④ | 보유기간 기산점 (증여자 취득일) — 단기보유·장기보유특별공제 모두 |
| 소득세법 시행령 §163의2 ① | "그 밖에 대통령령으로 정하는 자산"의 범위 (Design 진입 전 원문 확인 필수 — §6.2 참조) |
| 소득세법 시행령 §163의2 (산식) | 증여세 상당액 계산 = 증여세 × (해당 자산가액 / 증여재산총액) |
| 소득세법 시행령 §163의2 ④ | 적용배제 사유 상세 (사업인정고시일 2년 이전 증여 토지 등) |

**검증 계획**: `lib/tax-engine/legal-codes/transfer.ts` 에 다음 상수 추가
```ts
TRANSFER.CARRYOVER_TAXATION = "소득세법 §97조의2";
TRANSFER.CARRYOVER_DONOR_BASIS = "소득세법 §97조의2 ① 1호";
TRANSFER.CARRYOVER_GIFT_TAX_EXPENSE = "소득세법 §97조의2 ① 2호 (전단)";
TRANSFER.CARRYOVER_DONOR_CAPEX = "소득세법 §97조의2 ① 2호 (후단, 2023.12.31. 신설)";
TRANSFER.CARRYOVER_EXCLUSION = "소득세법 §97조의2 ②";
TRANSFER.CARRYOVER_EXCL_HIGH_PRICE_HOUSE = "소득세법 §97조의2 ② 2호 (고가주택 포함 §89①3호)";
TRANSFER.CARRYOVER_COMPARISON = "소득세법 §97조의2 ② 3호 (비교과세)";
TRANSFER.CARRYOVER_PERIOD_REGISTRY = "소득세법 §97조의2 ③ (등기부 소유기간 기준)";
TRANSFER.CARRYOVER_FAMILY_BUSINESS = "소득세법 §97조의2 ④ (가업상속공제 자산 특례)";
TRANSFER.CARRYOVER_HOLDING_PERIOD = "소득세법 §95 ④";
TRANSFER.CARRYOVER_GIFT_TAX_FORMULA = "소득세법 시행령 §163의2";
```
`npm run verify:legal` 통과 필요.

---

## 3. 적용 요건 매트릭스

### 3.1 증여일 기준 적용기간

| 증여일 | 적용기간 | 근거 |
|---|---|---|
| ~2022.12.31. | **5년** 이내 양도 | 종전 §97조의2 |
| 2023.1.1.~ | **10년** 이내 양도 | 2022.12.31. 개정, 부칙 |

> **기간 계산 (§97조의2 ③ 등기부 소유기간)**:
> - **기산일** = 수증자의 **증여 등기접수일** (UI 라벨도 "증여 등기접수일"로 명확화. "사실상 취득일" / "잔금일" 사용 금지)
> - **종료일** = 양도일(소득세법 §98 — 잔금청산일 또는 등기접수일 중 빠른 날)
> - **계산 라이브러리**: 우리 프로젝트는 `date-fns` 기반 `calculateHoldingPeriod()` 헬퍼 사용. **일수 기반 정밀 비교**로 "10년 + 1일" 케이스가 정확히 미적용으로 분류되도록 구현 (캘린더 연 단위 반올림 금지).
> - **경계 anchor**: C-03·C-04 가 정확히 "5년 1일" / "10년 1일" 시나리오로 검증.

### 3.2 증여자 관계

- **배우자** (양도 당시 혼인관계 소멸 포함, **사망으로 소멸 시 제외**)
- **직계존비속** (양도 당시 사망 시 제외)

### 3.3 자산 범위 (v1)

- §94①1호 부동산 — **토지·건물·주택**
- §94①2호 가목 (부동산을 취득할 수 있는 권리) — **분양권·조합원입주권 포함** (시행령 §163의2 ① 위임 확정)
- §94①4호 나목 (특정시설물 이용권·회원권 등) — **포함** (시행령 §163의2 ① 위임 확정)
- ❌ 주식·파생상품 (§94①3호) — v2

> **시행령 §163의2 ① (개정 2019.2.12, 2024.2.29) 원문 확인 완료**:
> "법 제97조의2제1항 각 호 외의 부분에서 '대통령령으로 정하는 자산'이란 법 제94조제1항제2호가목 및 같은 항 제4호나목의 자산을 말한다."
> → v1 자산 범위 = 부동산(§94①1호) + 부동산취득권리(§94①2호 가목) + 시설물이용권/회원권(§94①4호 나목)

### 3.4 적용배제 (§97조의2 ②)

| 사유 | 근거 | v1 처리 |
|---|---|---|
| 사업인정고시일 2년 이전 증여받은 토지·건물의 협의매수·수용 | §97조의2 ② 1호 | **사용자 체크박스 선언** |
| 이월과세 적용 시 §89①3호 각 목 주택 비과세 해당 (**12억 초과 고가주택 포함**) | §97조의2 ② 2호 | **사용자 체크박스 선언** (UI 라벨에 "고가주택 포함" 명시) |
| 이월과세 적용 결정세액 < 미적용 결정세액 (비교과세) | §97조의2 ② 3호 | **자동** — 엔진이 두 시나리오 결정세액 계산 후 큰 쪽 채택 |
| **가업상속공제 적용 자산** (§97조의2 ④ 별개 조항) | §97조의2 ④ | **차단** — validation에서 "가업상속공제 적용 자산입니까?" 체크박스 ON 시 "v1 미지원, 수동 계산 필요" 안내 후 진행 차단 |

---

## 4. 비교과세 알고리즘

```
Step 1: 이월과세 적용 시나리오 (Scenario A)
  - 취득가액 = 증여자 취득 당시 §97①1호 금액 (확인 불가 시 환산취득가)
  - 취득일 = 증여자 취득일 (보유기간·LTHD 기산)
  - 필요경비 += 증여세 상당액
  - 납세의무자 = 수증자 (양도자)
  → 결정세액 A 계산

Step 2: 미적용 시나리오 (Scenario B)
  - 취득가액 = 증여 당시 평가액 (보충적평가액·시가 등)
  - 취득일 = 수증자 증여 등기접수일
  - 필요경비 = 일반 (취득세 등)
  → 결정세액 B 계산

Step 3: 비교
  - 신고세액 = max(A, B)
  - A ≥ B → "이월과세 적용"
  - A < B → "이월과세 적용배제 (비교과세)" — Scenario B로 신고
```

**중요**: 비교 대상은 **§97조의2 ② 3호 법문 그대로 "양도소득 결정세액"** — 산출세액에서 세액공제·세액감면을 차감한 금액 (농특세·지방소득세 제외). 예제 사례에서도 64,684,518 vs 64,062,800 비교.

**역전 패턴 (C-14 anchor)**: 증여자가 장기보유, 수증자 단기 양도 시 — Scenario A는 증여자 취득일 기산 → 장기보유 + 누진세율, Scenario B는 수증자 취득일 기산 → **단기보유 70%/60% 단일세율**. A < B로 비교과세 적용배제 → 결국 단기세율 적용. 비교과세의 "세금 회피 방지" 의의가 가장 명확하게 드러나는 패턴이므로 anchor 필수.

---

## 5. 케이스 인벤토리 (Design 단계 anchor 후보)

> Design 진입 전 표 행 1개 이상 필수. 아래는 v1 anchor 후보. Design 단계에서 보강.

| ID | 시나리오 | 증여일 | 양도일 | 기간 판정 | 환산 사용 | 비교과세 결과 | 비고 |
|---|---|---|---|---|---|---|---|
| C-01 | **PDF 사례 24** (배우자 이월과세 + 환산) | 2018.06.19 | 2023.02.16 | 5년 룰 (이전 증여) → 적용 | APD (2003년 사용승인) | A 64,684,518 > B 64,062,800 → A 채택 | 예제 캡처 anchor |
| C-02 | 2023.1.1 이후 증여 + 7년차 양도 | 2023.06.01 | 2030.05.31 | 10년 룰 → 적용 | 실거래가 | A vs B 비교 | 신규 10년 룰 anchor |
| C-03 | 5년 경과 양도 (구 룰) | 2018.06.19 | 2024.07.01 | 5년 초과 → 미적용 | — | 일반 양도세 | 기간 경계 |
| C-04 | 10년 경과 양도 (신 룰) | 2023.06.01 | 2033.07.01 | 10년 초과 → 미적용 | — | 일반 양도세 | 기간 경계 |
| C-05 | 비교과세 — A < B | (조건 구성) | — | 적용 가능 | — | 자동 미적용 | §97조의2 ② 3호 |
| C-06 | 1세대1주택 비과세 적용배제 | 사용자 체크 ON | — | 미적용 | — | 일반 양도세 | §97조의2 ② 2호 |
| C-07 | 사업인정고시 2년 이전 증여 토지 수용 | 사용자 체크 ON | — | 미적용 | — | 일반 양도세 | §97조의2 ② 1호 |
| C-08 | 사망으로 혼인관계 소멸 (배우자 사망 후 양도) | — | — | 미적용 (관계 요건) | — | 일반 양도세 | §97조의2 ① 단서 |
| C-09 | 증여자 취득가액 직접 입력 (실거래가) | 2020.01.01 | 2026.06.01 | 적용 | 실거래가 직접 | A vs B 비교 | 환산 미사용 |
| C-10 | 증여자 취득가액 미확인 → APD 환산 | 2018.06.19 | 2023.02.16 | 적용 | APD 환산 | C-01과 동일 흐름 | 환산 통합 검증 |
| C-11 | 직계존속(부) 증여 + 증여세 상당액 가산 | 2020.05.01 | 2025.04.01 | 적용 | — | 필요경비 가산 검증 | §163의2 산식 |
| C-12 | 분양권 증여 후 양도 (시행령 §163의2 ① 위임 확정) | 2024.03.01 | 2026.08.01 | 적용 (10년) | — | 분양권 세율 | **v1 활성화 — 시행령 원문 확정** |
| **C-13** | **증여자 자본적지출(리모델링 5천만) + 수증자 추가 지출 합산** | 2020.06.01 | **2024.06.01** | 적용 | — | 필요경비에 양자 합산 + swap 비교 | **§97조의2 ① 2호 후단 (2023.12.31. 신설, 2024.1.1. 이후 양도분 시행) 검증** |
| **C-13b** | **2023.12.31. 이전 양도 — 증여자 capex 산입 금지** | 2020.06.01 | **2023.12.20** | 적용 | — | 증여자 capex 산입 ❌ | **시행시기 경계 anchor** |
| **C-06b** | **12억 초과 1세대1주택(고가주택) 적용배제** | — | — | 미적용 | — | 일반 양도세 | **§97조의2 ② 2호 괄호 (고가주택 포함)** |
| **C-14** | **장기보유(증여자) → 단기양도(수증자) 비교과세 역전** | 2010.01.01 (증여자 취득) → 2024.06.01 (증여) | 2025.03.01 | 적용 가능하나 A < B | — | B 채택 → 단기 70% 적용 | **비교과세 의의 anchor (회피 방지)** |
| **C-15** | **가업상속공제 적용 자산 입력 차단** | — | — | validation 차단 | — | "v1 미지원" 안내 | **§97조의2 ④ 안전장치** |

---

## 6. 입력·결과 타입 변경 (예비 설계)

### 6.1 `TransferTaxInput` 신규 필드 (모두 optional)

```ts
// types/transfer.types.ts
acquisitionCause?: "purchase" | "inheritance" | "gift" | "carryover_gift";
//                                                       ^^^^^^^^^^^^^^^ 신규: 이월과세(증여)

carryoverTaxation?: {
  /** 증여 등기접수일 — §97조의2 ③ 등기부 소유기간 기산점 */
  giftRegistryDate: Date;
  /** 증여자의 취득일 — 보유기간·LTHD 기산점 (§95 ④) */
  donorAcquisitionDate: Date;
  /** 증여자의 취득가액 — 직접 입력 시 (환산 미사용) */
  donorAcquisitionPrice?: number;
  /** 환산취득가 사용 여부 — true면 PHD/APD 입력으로 자동 환산 */
  useEstimatedAcquisition: boolean;
  /** 증여세 상당액 (사용자 입력) — §163의2 산식으로 사용자가 사전 계산 */
  giftTaxAmount: number;
  /**
   * 증여자가 보유 중 지출한 자본적지출액 (§97조의2 ① 2호 후단, 2023.12.31. 신설)
   * 리모델링·증축·발코니확장 등. 수증자 자본적지출(`capitalExpenditure`)과 합산되어 필요경비 산입.
   */
  donorCapitalExpenditure?: number;
  /** 증여 당시 평가액 (보충적평가액 등) — 비교과세 Scenario B의 취득가액 */
  giftDateValuation: number;
  /** 적용배제 — 사용자 선언 */
  exclusionDeclared?: {
    /** ② 1호 — 사업인정고시일 2년 이전 증여 토지 수용 */
    expropriationWithin2Years?: boolean;
    /** ② 2호 — 1세대1주택 비과세 해당 (12억 초과 고가주택 포함) */
    oneHouseExemptionApplies?: boolean;
    /** ④항 — 가업상속공제 적용 자산 (v1 미지원, validation 차단) */
    isFamilyBusinessInheritedAsset?: boolean;
  };
};
```

### 6.2 `TransferTaxResult` 신규 필드

```ts
carryoverTaxationDetail?: {
  /** 적용 가능 여부 (기간·관계·자산 모두 통과) */
  isEligible: boolean;
  /** 적용기간 (5년 or 10년) */
  applicablePeriodYears: 5 | 10;
  /** 적용배제 사유 (있을 시) */
  exclusionReason?: "expropriation" | "one_house_exemption" | "tax_comparison" | "period_exceeded" | "relation_invalid";
  /** Scenario A — 이월과세 적용 */
  scenarioA: {
    acquisitionPrice: number;
    holdingPeriodYears: number;
    /** 필요경비 가산 — 증여세 상당액 (§97조의2 ① 2호 전단) */
    giftTaxAddedToExpense: number;
    /** 필요경비 가산 — 증여자 자본적지출 (§97조의2 ① 2호 후단, 2023.12.31. 신설) */
    donorCapexAddedToExpense: number;
    transferGain: number;
    determinedTax: number;  // 결정세액 (산출 - 세액공제·세액감면)
  };
  /** Scenario B — 미적용 (비교용) */
  scenarioB: {
    acquisitionPrice: number;
    holdingPeriodYears: number;
    transferGain: number;
    determinedTax: number;
  };
  /** 채택 시나리오 */
  adoptedScenario: "A" | "B";
  /** 비교과세 적용 여부 (B 채택 시 true) */
  comparisonExclusion: boolean;
};
```

### 6.3 8개 동기화 지점 매핑

| # | 위치 | 변경 |
|---|---|---|
| ① 폼 상태 타입 | `lib/stores/calc-wizard-asset-residence.ts` `AssetForm` | `acquisitionCause: "carryover_gift"` 추가 + `carryover` 서브객체 |
| ② initial value | 동일 파일 `defaultAssetForm` | `carryover: { ...defaults }` |
| ③ normalize fallback | 동일 파일 `normalizeAssetForm` | `carryover_gift` 외에는 carryover 객체 stripping |
| ④ API 변환 | `lib/calc/transfer-tax-api.ts` | `asset.acquisitionCause === "carryover_gift"` 분기에서 `carryoverTaxation` 객체 매핑 + `donorAcquisitionDate` 자동 채움 |
| ⑤ UI 입력 위젯 | `components/calc/transfer/CompanionAcqGiftBlock.tsx` 확장 또는 신규 `CarryoverGiftBlock.tsx` | 취득원인 셀렉트 옵션 추가 + 펼침 섹션 |
| ⑥ 사이드바 합계 | `components/calc/transfer/AcquisitionSummary.tsx` (해당 시) | 증여세 상당액 표시 |
| ⑦ 결과 카드 산식 | `components/calc/results/transfer/CarryoverComparisonCard.tsx` (신규) | A·B 나란히 비교 표시 + 채택 ✓ |
| ⑧ validation | `lib/calc/transfer-tax-validate.ts` | (a) `carryover_gift` 선택 시 `giftRegistryDate`·`donorAcquisitionDate`·`giftTaxAmount`·`giftDateValuation` 필수 (b) `isFamilyBusinessInheritedAsset === true` 시 진행 차단 + "v1 미지원" 메시지 (c) `donorCapitalExpenditure` 음수 차단 |

---

## 7. 작업 분담 (병렬 호출)

| 에이전트 | 책임 |
|---|---|
| `transfer-tax-senior` | 엔진 본체 — `carryoverTaxation` 필드 처리, 적용 판정, 비교과세 두 시나리오 계산, `transfer-tax-helpers.ts`에 `calcCarryoverScenarios()` 헬퍼 추가 |
| `transfer-deduction-senior` | LTHD 보유기간 기산점 (증여자 취득일) 검증, `calcLongTermHolding`이 carryover 케이스에서도 정상 동작하는지 |
| `multi-house-surcharge-senior` | 다주택 중과·조정대상지역 판정은 양도자(수증자) 기준 그대로 — 회귀 검증만 |
| `one-house-tax-senior` | 적용배제 ② 2호 (1세대1주택 비과세) 시 carryover 우회 로직 |
| `transfer-tax-ui-senior` | 취득원인 셀렉트 "이월과세(증여)" 옵션 + 증여자 정보 펼침 섹션 + 결과 비교 카드 + 8개 동기화 지점 ①~⑧ |
| `transfer-tax-qa` | C-01 ~ C-12 anchor 테스트 작성, 예제 캡처 정확 재현 (64,684,518 / 64,062,800) |

**Plan/Design 단계는 엔진 시니어 + UI 시니어 동시 병렬 호출** (단일 Agent tool 메시지 내 다중 호출).

---

## 8. PDCA 단계별 산출물

| 단계 | 산출물 |
|---|---|
| **Plan** (현재) | 본 문서 |
| **Design** | `docs/02-design/features/transfer-tax-carryover-taxation.engine.design.md` (엔진 설계 + 케이스 인벤토리 표 확정) + `transfer-tax-carryover-taxation.ui.design.md` (UI 설계 + 8개 동기화 지점) |
| **Do** | 엔진 구현 + UI 구현 + anchor 테스트 12개 |
| **Check** | `ui-engine-sync-checker` + 예제 캡처 재현 검증 + 브라우저 수동 |
| **Act** | 회귀 테스트 + 메모리 정책 추가 (`feedback_carryover_taxation_rules.md`) |

---

## 9. 리스크 & 결정 필요 사항

### 9.1 결정된 사항 (2026-05-04 사용자 확인)

- **자산 범위**: 부동산만 (주식 v2)
- **환산취득가**: PHD/APD 로직 재사용
- **적용기간 분기**: 증여일 기준 자동 (~2022.12.31 = 5년, 2023.1.1~ = 10년)
- **비교과세 UI**: A안 — 두 시나리오 나란히 표시 + 채택 ✓
- **증여세 상당액**: 사용자 직접 입력
- **적용배제**: ②1·2는 사용자 체크박스, ②3은 자동 비교
- **UI 통합**: 취득원인 셀렉트에 "이월과세(증여)" 옵션 추가
- **보유기간**: 증여자 취득일 기산 (LTHD·단기 모두), 거주요건은 수증자 본인 거주만
- **상호작용**: 다주택 중과·조정대상지역은 수증자 기준, 세대생략 무관

### 9.2 Design 단계에서 확정 필요

- **환산취득가 사용 시 비교과세 Scenario B의 취득가액**: 예제는 "증여_보충적평가액"으로 표시. 사용자 입력(`giftDateValuation`)이 곧 B의 취득가액이 되도록 설계. 환산 미사용 분기와 일관성 확인.
- **C-01 anchor 정확값**: 예제 캡처 4건 (Scenario A 환산취득가 356,171,284 / B 취득가 457,000,000 / A 결정세액 64,684,518 / B 결정세액 64,062,800) — 우리 엔진 정수 연산으로 동일 재현 가능성 사전 검증 필요. **불일치 시 Design 단계에서 차이 원인(개산공제·LTHD 계산 등) 명시 후 진행.**
- **증여세 상당액 산식 안내 모달**: §163의2 산식(증여세 × 해당자산가액 / 증여재산총액) 표시 위치 — `LawArticleModal` 패턴 활용.
- **적용배제 ②2호 (1세대1주택)** UI: 단순 체크박스 vs 자동 판정(1세대1주택 비과세 엔진 결과 활용) — 후자 권장이지만 v1은 사용자 선언으로 단순화 검토.
- ~~🔴 시행령 §163의2 ① 원문 확인 (Critical)~~ **확정 (2026-05-04)**: 시행령 §163의2 ① 원문 확인 결과 — 위임 범위 = §94①2호 가목(부동산취득권리·분양권·입주권) + §94①4호 나목(시설물이용권·회원권). v1 자산 범위에 모두 포함.
- ~~§97조의2 ① 2호 후단 시행 시기~~ **확정**: **2024.1.1. 이후 양도분부터** 적용. anchor C-13(양도일 2024.6.1.)·C-13b(양도일 2023.12.20.) 경계 검증.
- **🔴 증여자 자본적지출의 §97②2호 swap 통합 (Design 단계 결정)** — 3개 후보 중 선택:
  - **(A) directSide 합산 통합** (권장): `calcNecessaryExpense()` 호출 전에 `effectiveCapex = capitalExpenditure + donorCapitalExpenditure`로 합산하여 전달. 기존 swap 로직 변경 불필요.
  - **(B) 별도 인자 추가**: 함수 시그니처에 `donorCapitalExpenditure?` 추가, 내부에서 합산 후 결과 객체에 분리 노출.
  - **(C) Scenario A에서만 합산**: 비교과세 두 시나리오 중 A에서만 directSide에 합산, B는 수증자 capex만.
  - **v1 권장 = (A) + (B) 혼합**: 호출부 합산(=구현 단순) + 결과 객체에 `donorCapexAddedToExpense` 분리 노출(=결과 카드 표시용). Scenario B에서는 합산 없음.
  - **swap 발동 예시**: 환산 1.5억 + 개산공제 5백만 = 1.55억 vs 수증자 capex 8천만 + 증여자 capex 1억 + 양도비 2천만 = 2억 → swap 발동, 필요경비 = 2억.
  - **확정 (2026-05-04)**: 이월과세 적용 시(Scenario A) 환산취득가액 모드에서도 §97②2호 swap 정상 작동해야 함. directSide 합산에 증여자 capex 포함이 핵심.
- **시행시기 경계 처리 (C-13 vs C-13b)**: 양도일 < 2024.1.1. 시 `donorCapitalExpenditure` 입력값 무시하고 0으로 처리 + 결과 카드에 "증여자 자본적지출 가산은 2024.1.1. 이후 양도분부터 적용" 안내 표시.

---

## 10. Definition of Done

- [ ] `docs/02-design/features/transfer-tax-carryover-taxation.engine.design.md` 작성 + 케이스 인벤토리 표 12행 확정
- [ ] `docs/02-design/features/transfer-tax-carryover-taxation.ui.design.md` 작성 + 8개 동기화 지점 매핑 확정
- [ ] 엔진: `calcCarryoverScenarios()` 헬퍼 + Orchestrator 분기 + legal-codes 7개 상수
- [ ] UI: 취득원인 셀렉트 옵션 + `CarryoverGiftBlock` + `CarryoverComparisonCard`
- [ ] 8개 동기화 지점 ①~⑧ 모두 반영 (특히 ⑧ validation)
- [ ] anchor 테스트 17개 통과 (C-01 ~ C-15, C-06b, C-13b 포함) (`__tests__/tax-engine/transfer-tax/carryover-*.test.ts`)
- [ ] **엔진 main result promote** — carryover_gift 모드에서 `result.transferGain`·`longTermDeduction`·`taxableGain`·`taxBase`·`calculatedTax`·`determinedTax`·`localIncomeTax`·`holdingPeriodYears`·`acquisitionDate`(보유기간 기산점) 등 main 필드를 채택 시나리오(adoptedScenario) 값으로 promote. 신고서 양식·PDF·이력 등 모든 결과 표시 컴포넌트가 일관된 값을 사용하도록 보장
- [ ] **Scenario B 신고서 양식 표시** — 비교과세 검증을 위해 미적용 시나리오 신고서 양식도 결과 카드에 표시 (나란히 또는 토글 전환)
- [ ] **취득일자 보조 표시** — 신고서 양식의 "취득일자" 라벨에 carryover 모드일 때 "(증여자 취득일)" 보조 표시
- [ ] C-01 예제 캡처 정확 재현 (64,684,518 / 64,062,800)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npm run verify:legal` 통과
- [ ] 브라우저 수동 확인 (취득원인 → 이월과세(증여) 선택 → 입력 → 비교 카드 검증)
- [ ] 메모리 `project_carryover_taxation.md` + `feedback_carryover_validation.md` 추가

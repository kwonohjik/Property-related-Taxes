# 부담부증여 양도소득세 — Phase 2 (메뉴 재설계 + 전 부동산 확장) 엔진 설계

> Phase 1 (사례 34, 일반건물 전용) → Phase 2 (안 B 메뉴 재설계 + 주택·토지·건물 확장)
> 작성일: 2026-05-12
> 모기능: [`transfer-tax-burdened-gift.engine.design.md`](./transfer-tax-burdened-gift.engine.design.md)
> 동반 plan: [`.claude/plans/image-4-flickering-thompson.md`](../../../.claude/plans/image-4-flickering-thompson.md)
> UI 설계: `transfer-tax-burdened-gift-phase2.ui.design.md` (별도 작성 예정)

---

## Context

### 문제 1 — 의미론적 메뉴 오류 (사용자 지적 2026-05-12)

Phase 1은 부담부증여를 **취득원인 라디오**에 끼워넣었다:

```
[취득원인] ○ 매매 ○ 상속 ○ 증여 ○ 이월과세(증여) ○ 부담부증여 ○ 신축(자가건축)
```

그러나 양도세 계산기는 **양도자(=증여자) 관점**이며:

| 라디오 옵션 | 차원 | 의미 |
|---|---|---|
| 매매·상속·증여·신축 | 과거 시점 **취득 사건** | 보유기간 기산점·취득가액 산정 방식 결정 |
| 이월과세(증여) | 과거 취득(증여) + 5년/10년 내 양도 hybrid | §97조의2 분기 (수증자가 양도자) |
| **부담부증여** | **이번 양도 행위 그 자체** | 채무 인수분을 양도로 의제 (소령 §159) |

부담부증여만 차원이 다른데 같은 라디오에 섞여 있어 사용자 멘탈 모델과 충돌. 또한 Phase 1은 증여자의 **당초 취득일·취득원인·취득가액**을 받지 못해 §159①1호 산식의 A(법 §97① 가액)·장특공 보유연수가 불완전했다 — 일반건물에서 `acquisitionDate` 폼-필드로 우회.

### 문제 2 — propertyType 제한

`transfer-tax-validate.ts:522~525`에서 명시적 차단:
```ts
return `${label}: 부담부증여는 일반건물 자산에서만 지원됩니다 (Phase 1).`;
```

주택·토지·건물·상업용 모두 실무 발생하나 차단됨.

### 의도한 결과 (Phase 2)

1. **메뉴 재설계 (안 B)**: "양도 정보" 카드 신설 → `양도 형태 = [일반 양도 / 부담부증여]` 라디오 → 부담부증여 선택 시 채무·평가 입력 펼침. **취득원인 라디오에서 `burdened_gift` 옵션 제거**.
2. **취득 정보 = 증여자 당초 취득 정보**: 매매·상속·증여·신축 등 기존 분기를 그대로 사용하여 §159①1호 A 산정·장특공 보유연수 계산 정확.
3. **propertyType 확장**: 주택(`housing`)·토지(`land`)·건물(`building`)·일반건물(`general_building`) 4종 지원.
4. **사례 34 회귀 보존**: 산출세액 740,074,515 / 지방소득세 74,007,451 100% 일치.
5. **silent fallback 금지 가드**: 초과부담부(B/C > 1) 검출 → validation 차단 + 사이드바 경고 배지 + 엔진 fail-fast.

---

## ★ 케이스 인벤토리 (Phase 2)

| # | 시나리오 | propertyType | 평가모드 | 양도 형태 | 법령 cross-cutting | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|---|---|---|
| 1 | 사례 34 회귀 — 기준시가 모드 | `general_building` | `sangjeungbeop_standard` | 부담부증여 | 소령 §159, 상증법 §61 | 기존 PDF | `general-building-case-34-burdened-gift.test.ts` | ✅ 기존 |
| 2 | 사례 34 합성 — 시가 모드 | `general_building` | `sangjeungbeop_market` | 부담부증여 | 소령 §159, 상증법 §60②~④ | 합성 | 동상 | ✅ 기존 |
| 3 | 메뉴 재설계 회귀: 안 B 변환 후 사례 34 결과 변동 0 | `general_building` | (양 모드) | 부담부증여 | — | 기존 anchor | 동상 | ☐ TODO |
| 4 | 부담부증여 + 주택 (1세대1주택 비과세 미충족, 일반 다주택) | `housing` | `sangjeungbeop_standard` | 부담부증여 | 소령 §159 + §95 표1 | 합성 | `burdened-gift-housing.test.ts` | ☐ TODO |
| 5-a | 부담부증여 + 주택 (1세대1주택 + 12억 초과 + **거주요건 충족**) | `housing` | `sangjeungbeop_standard` | 부담부증여 | 소령 §159 + §89·§95 표2 (★ **12억 비교·안분 분모 = giftValuation C** — 국세청 해석례 ntstDcmId=010000000000028078 등 5건 인용. 쟁점 1 해석 B 확정) | 합성 + 5개 해석례 근거 | 동상 | ☐ TODO (D-0-2 완료, 진행 가능) |
| 5-b | 부담부증여 + 주택 (1세대1주택 + 조정대상지역 + **거주요건 미충족**) | `housing` | `sangjeungbeop_standard` | 부담부증여 | 소령 §159 + §154①(2017.8.3.↑ 2년 거주 필요) → 비과세 불가, 표1 적용 | 합성 | 동상 | ☐ TODO |
| 6 | 부담부증여 + 토지 (사업용) | `land` | `sangjeungbeop_standard` | 부담부증여 | 소령 §159 + §95 표1 + LandPriceLookupField | 합성 | `burdened-gift-land.test.ts` | ☐ TODO |
| 7 | 부담부증여 + 토지 (비사업용 중과) | `land` | `sangjeungbeop_standard` | 부담부증여 | 소령 §159 + §104의3 (+10%p, 장특공 배제) | 합성 | 동상 | ☐ TODO |
| 8 | 부담부증여 + 토지 (1990.8.30. 이전 취득) | `land` | `sangjeungbeop_standard` | 부담부증여 | 소령 §159 + 1990 환산(CAP-1/CAP-2) | 합성 | 동상 | ☐ TODO |
| 9 | 부담부증여 + 건물(토지 외) | `building` | `sangjeungbeop_standard` | 부담부증여 | 소령 §159 + §95 표1 | 합성 | `burdened-gift-building.test.ts` | ☐ TODO |
| 10 | 회귀: 양도 형태 = "일반 양도" → 사례 1~33 결과 변동 0 | (전체) | — | 일반 양도 | — | 기존 anchor | 기존 | ☐ TODO |
| 11 | **초과부담부 (B/C > 1)** — validate 차단 + 엔진 fail-fast | (전체) | (기준시가/시가) | 부담부증여 | 상증법 §47③ 정의 위반 추정 | 검증 anchor | `burdened-gift-overshoot.test.ts` | ☐ TODO |
| 12 | **다주택 중과 cross-cutting** | `housing` | — | 부담부증여 | 소령 §167의3 한시 유예 시점 변동 잦음 | **명시 비스코프** (안내 배너) | (해당 없음) | ⛔ 차단 |

**Phase 2 제외 (후속 PR)**:
- 상업용건물·오피스텔(`commercial_building`)·일반건물단위(`general_building_unit`)
- 부담부증여 + 증여세 통합(무상분 → `gift-tax.ts`) — Phase 3
- 임대료 환산율 18% (2009.4.23. 이전) — v2
- 신고기한 안내 (§105·§110·상증법 §68) UI — 별도 PR
- 다자산(assets[].length ≥ 2) 부담부증여 혼합 — 별도 PR
- `right_to_move_in`·`presale_right` — 적용 케이스 희소, 별도 PR

---

## 법령 근거 (Phase 1 검증 완료 — 재사용 + Phase 2 추가)

### Phase 1 그대로 (전 부동산 공통)

- **소령 §159①1호·2호** — 부담부증여 양도차익 (취득가액·양도가액 비례 안분)
- **소법 §95④ 본문** — 보유기간 = 증여자 취득일 ~ 증여일
- **소령 §163⑥** — 개산공제 3% (등기 토지·건물)
- **소법 §97의2 미적용** — 양도자 = 증여자
- **상증법 §60~§66** — 평가 Max(보충적·담보·임대)
- **상증령 §50⑦** — 임대료 환산 = 보증금 + 임대료/12%

### Phase 2 추가 — propertyType별 cross-cutting

#### 주택 (`housing`)

- **소법 §89①3호 / 소령 §154** — 1세대1주택 비과세 (12억 한도)
- **소령 §154① 단서** — 2017.8.3. 이후 조정대상지역 취득분 2년 거주 필요
- **소법 §95② 표2 / 소령 §159의4** — 장특공 표2 (보유 + 거주 최대 80%)
- **부담부증여 안분 후 양도가액(채무액)을 12억 안분 분모로 사용**: §159 비례 안분 → §89 12억 한도 적용. 비과세분/과세분 분리 후 채무비율 곱셈.
- **장특공 보유연수 = 증여자 취득일 ~ 증여일** (§95④ 본문). 거주연수도 증여자 본인의 거주 사실 기준.

#### 토지 (`land`)

- **소법 §104의3 / 소령 §168의6~14** — 비사업용 토지 (+10%p 중과 + 장특공 배제)
- **1990.8.30. 이전 취득 토지 환산** — `lib/tax-engine/pre1990-land-valuation.ts` CAP-1/CAP-2 그대로 적용
- **부담부증여 토지 기준시가** = 양도시·취득시 **개별공시지가 × 면적** (LandPriceLookupField 자산-수준 필드 활용)

#### 건물(토지 외) (`building`)

- **소법 §95② 표1** 장특공 (최대 30%)
- **부담부증여 건물 기준시가** = 양도시·취득시 **건물기준시가** (housing PHD 패턴 유사)

#### 일반건물 (`general_building`) — Phase 1 그대로

- gb* 필드 (gbTransferLandPrice·gbAcqLandPrice·gbTransferBuildingPrice·gbAcqBuildingPrice)
- 토지·건물 합산 비례 안분 (사례 34 anchor 보존)

#### 초과부담부 검출 (전 부동산)

- **상증법 §47③**: "증여재산에 담보된 채무 등을 수증자가 인수한 부분"이 부담부증여 정의. **채무액 > 증여가액**이면 정의상 성립 불가 (수증자가 부(負)의 자산을 받는 셈).
- 실무: B/C > 1 시 사실상 매매로 의제될 가능성 — 엔진은 자동 보정 없이 **차단 + 사용자 확인 동선** 제공.

---

## 엔진 input 타입 변경

`lib/tax-engine/types/transfer.types.ts`:

```ts
export type TransferTaxInput = {
  propertyType: "housing" | "land" | "building" | "right_to_move_in"
              | "presale_right" | "mixed-use-house" | "commercial_building"
              | "general_building_unit" | "general_building";

  // 신규 — 양도 형태 (양도자 관점)
  transferType?: "regular" | "burdened_gift";    // 미지정 시 "regular"

  // 변경 — acquisitionCause enum에서 "burdened_gift" 제거
  acquisitionCause?: "purchase" | "inheritance" | "gift"
                   | "carryover_gift" | "newConstruction";  // ❌ "burdened_gift" 삭제

  // 기존 — transferType === "burdened_gift" 시에만 채워짐
  burdenedGiftInfo?: BurdenedGiftInfo;
  // ... (기타 기존 필드)
};

// 기존 BurdenedGiftInfo 타입은 그대로 유지
export type BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_standard" | "sangjeungbeop_market";
  lendingDepositTotal: number;
  mortgageDebtAmount: number;
  annualRentTotal: number;
  mortgageSetAmount?: number;
  marketValueAtTransfer?: number;
  marketValueAtAcquisition?: number;
  // 도출값(엔진 내부 계산):
  // assumedDebt = lendingDepositTotal + mortgageDebtAmount
  // giftValuation = Max(rentalEstimate, mortgageEstimate, standardEstimate) — propertyType별
};
```

## 엔진 result 타입 변경

```ts
export type TransferTaxResult = {
  // ... (기존 필드)

  // 신규 — Phase 2
  warnings?: string[];          // 케이스 12(다주택 중과 비스코프) 등 정보성 경고
  burdenedGiftBreakdown?: {     // transferType === "burdened_gift" 시 채워짐
    propertyType: TransferTaxInput["propertyType"];
    assumedDebt: number;        // B (인수 채무액)
    giftValuation: number;      // C (증여가액 = 평가 Max)
    debtRatio: number;          // B / C
    transferPrice: number;      // §159①2호 양도가액 = 평가액 × B/C
    acquisitionCost: number;    // §159①1호 취득가액 = A × B/C
    estimatedDeduction: number; // 개산공제 = 취득가액 × 3%
    valuationBreakdown: {       // 평가 후보 비교
      standard: number;
      mortgage: number;
      rental: number;
      selected: "standard" | "mortgage" | "rental";
    };
    residencyRequirementFailed?: boolean;  // housing + §154① 단서 미충족 (case 5-b)
  };
};
```

---

## 계산 알고리즘 (Phase 2 — propertyType별 분기 통합)

### Step 0 — 양도 형태 판별 (신규 진입점)

```ts
if (input.transferType !== "burdened_gift") {
  return computeRegularTransfer(input);   // 기존 파이프라인 그대로
}
// 이하 부담부증여 분기
```

### Step 1 — 초과부담부 가드 (fail-fast)

```ts
const assumedDebt = bg.lendingDepositTotal + bg.mortgageDebtAmount;
const giftValuation = computeGiftValuation(input);  // propertyType별
if (assumedDebt > giftValuation) {
  throw new TransferTaxError(
    "EXCESS_BURDENED_GIFT",
    "채무액(B)이 증여가액(C)을 초과합니다. 부담부증여로 성립하지 않습니다 (상증법 §47③ 검토 필요)."
  );
}
const debtRatio = assumedDebt / giftValuation;  // B/C ∈ (0, 1]
```

### Step 2 — 증여가액 산정 (propertyType별 평가 Max)

```ts
function computeGiftValuation(input): { value: number; breakdown: {...} } {
  const { propertyType, burdenedGiftInfo: bg } = input;

  // ① 보충적평가 (기준시가) — propertyType별 도출
  let standard: number;
  switch (propertyType) {
    case "general_building":
      // 사례 34 패턴 (토지 + 건물 합산)
      standard = input.gbTransferLandPrice + input.gbTransferBuildingPrice;
      break;
    case "housing":
      // 주택공시가격 (transferStandardPrice — Step1 PHD/공시가 입력)
      standard = input.transferStandardPrice;
      break;
    case "land":
      // 개별공시지가 × 면적 (LandPriceLookupField 결과)
      standard = input.transferLandStandardPrice;  // 자산-수준 사전 계산
      break;
    case "building":
      // 건물기준시가
      standard = input.transferBuildingStandardPrice;
      break;
  }

  // ② 담보평가 (상증법 §66) — 보증금 + 저당설정액
  const mortgageSet = bg.mortgageSetAmount ?? bg.mortgageDebtAmount;
  const mortgage = bg.lendingDepositTotal + mortgageSet;

  // ③ 임대평가 (상증령 §50⑦) — 보증금 + 임대료/12%
  const rental = bg.lendingDepositTotal
               + (bg.annualRentTotal > 0 ? Math.floor(bg.annualRentTotal / 0.12) : 0);

  // 시가 모드 직접 입력
  if (bg.valuationMode === "sangjeungbeop_market") {
    return { value: bg.marketValueAtTransfer, breakdown: { ..., selected: "standard" } };
  }

  // 기준시가 모드: Max
  const value = Math.max(standard, mortgage, rental);
  const selected = value === mortgage ? "mortgage" : value === rental ? "rental" : "standard";
  return { value, breakdown: { standard, mortgage, rental, selected } };
}
```

### Step 2.5 — A (취득시 §97① 가액) 산정 — propertyType별 (★ 1990 환산 포함)

> ⚠️ **순서 중요**: 이전 v1 초안에서는 Step 4에서 `A_acquisition`을 재할당했으나, Step 3의 `acquisitionCost = A × B/C` 결과가 이미 확정되므로 **상류 갱신이 무효**였다(검토 피드백 2026-05-12 반영). A 산정 자체에 1990 환산·환산취득가 등 모든 분기를 포함시키고, Step 3은 순수 곱셈만 수행한다.

```ts
function computeAcquisitionA(input): number {
  const { propertyType, acquisitionDate, acquisitionCause, ... } = input;

  switch (propertyType) {
    case "general_building":
      // Phase 1: 토지·건물 합산 기준시가 (gbAcqLandPrice + gbAcqBuildingPrice)
      return input.gbAcqLandPrice + input.gbAcqBuildingPrice;

    case "housing":
      // 주택 취득시 공시가격 (PHD 환산 시 PHD 결과값)
      return input.acquisitionStandardPrice;

    case "land": {
      // ★ 1990 환산 cross-cutting — A 산정 단계에서 처리
      if (acquisitionDate < new Date("1990-08-30")) {
        return computePre1990LandValuation(input);  // CAP-1/CAP-2
      }
      // 그 외: 취득시 개별공시지가 × 면적
      return input.acquisitionLandStandardPrice;
    }

    case "building":
      // 취득시 건물기준시가
      return input.acquisitionBuildingStandardPrice;
  }
}
```

### Step 3 — §159 비례 안분 (전 부동산 공통, 순수 곱셈)

```ts
// §159①2호 — 양도가액
const transferPrice = Math.floor(giftValuation * debtRatio);

// §159①1호 — 취득가액 (A × B/C). A는 Step 2.5에서 1990·환산 등 모두 반영된 확정값
const A_acquisition = computeAcquisitionA(input);
const acquisitionCost = Math.floor(A_acquisition * debtRatio);

// §163⑥ 개산공제 (등기 자산 3%)
const estimatedDeduction = Math.floor(acquisitionCost * 0.03);
```

### Step 4 — propertyType별 후처리 cross-cutting (세율·공제·비과세만)

> ⚠️ **Step 4는 acquisitionCost를 변경하지 않는다**. 세율 분기·장특공·비과세 판정만 수행. A 산정 분기는 모두 Step 2.5로 이동.

```ts
switch (propertyType) {
  case "housing": {
    // §154 1세대1주택 비과세 판단 (기존 one-house-tax.ts 호출)
    const isExempt = checkOneHouseExemption(input);   // ★ transferPrice 인자 제거 — 후술 12억 분모 논점 참조

    // 5-b: 거주요건 미충족 검출 (§154① 단서)
    const residencyRequirementFailed = isExempt
      && acquisitionDate >= new Date("2017-08-03")
      && input.regulatedAreaAtAcquisition === true
      && (input.residencyYears ?? 0) < 2;
    if (residencyRequirementFailed) {
      // 비과세 박탈 → 표1 일반 과세
      return applyTable1AndTransfer({ ..., note: "거주요건 미충족 §154①" });
    }

    if (isExempt) {
      // ★ 12억 안분 분모 — 후술 "법령 해석 미확정 영역" 참조
      return applyOneHouseHighPriceTax({
        transferPrice,         // §159 안분 후 양도가액 (= 채무 양도가)
        giftValuation,         // 증여가액 C — 일부 해석에서 12억 비교 기준
        acquisitionCost,
        debtRatio,
        ...
      });
    }
    return applyTable1AndTransfer(...);
  }

  case "land": {
    // 비사업용 토지 중과 (1990 환산은 Step 2.5에서 이미 반영됨)
    if (input.nonBusinessLand === true) {
      return applyNonBusinessLandRate(...);  // +10%p, 장특공 배제
    }
    return applyTable1AndTransfer(...);
  }

  case "building":
    return applyTable1AndTransfer(...);

  case "general_building":
    // Phase 1 그대로 (사례 34 회귀 보존)
    return computeGeneralBuildingBurdenedGift(input);
}
```

### Step 5 — 결과 객체 + warnings

```ts
const result: TransferTaxResult = {
  ...,
  burdenedGiftBreakdown: {
    propertyType, assumedDebt, giftValuation, debtRatio,
    transferPrice, acquisitionCost, estimatedDeduction,
    valuationBreakdown,
    residencyRequirementFailed,
  },
  warnings: [],
};

// 케이스 12: 다주택 중과 비스코프 경고
if (propertyType === "housing"
    && input.regulatedAreaAtTransfer === true
    && (input.houseCount ?? 1) >= 2) {
  result.warnings.push(
    "다주택 중과(§167의3)는 Phase 2 비스코프입니다. 결과는 유예 기준으로 산정되었습니다."
  );
}
```

---

## 🔴 법령 해석 미확정 영역 (D-0 착수 전 선결)

### 쟁점 1 — 12억 고가주택 안분 분모 (케이스 5-a 핵심)

**일반(비-부담부증여) 1세대1주택 고가주택 과세 산식**:
```
과세 양도차익 = 전체 양도차익 × (양도가액 − 12억) / 양도가액
```

**부담부증여 시 양도가액 = `transferPrice` (= giftValuation × B/C) 인데, 12억 비교·안분 분모를 무엇으로 할 것인가?**

| 해석 | 분모 | 결과 차이 (B/C = 0.5, giftValuation = 24억 가정) |
|---|---|---|
| **해석 A**: §159 안분 후 양도가액(채무 양도가)을 12억과 비교·분모 | `transferPrice = 12억` | 12억 = 12억 → 안분 미발동 (전액 비과세) |
| **해석 B**: 증여가액 C(전체 평가액)를 12억과 비교·분모, 안분 비율은 그대로 적용 | `giftValuation = 24억` | (24−12)/24 = 50% 과세, 그 위에 §159 B/C = 0.5 곱 |
| **해석 C**: 비교는 C, 분모는 transferPrice | 혼합 | (가장 납세자 불리) |

**문언 근거**:
- 소법 §89①3호 단서: "고가주택…의 양도로 인하여 발생하는 소득"
- 소령 §160(고가주택의 양도): "양도가액이 12억원을 초과하는 주택"
- 소령 §159(부담부증여 양도차익): "양도가액 = 평가액 × B/C"
- → §160의 "양도가액" = §159의 결과값(transferPrice)인지, 본래 평가액(giftValuation)인지 **문언만으로 일의적이지 않음**.

**조치**: 케이스 5-a anchor 확정 전 다음을 디자인 문서에 인용 명기:
- (1차) 국세청 예규 (서면-부동산-2021-XXXX·기재부 양도소득세 집행기준 §89-160-X) 검색·인용
- (2차) 조세심판원 결정례 (조심2020서XXXX류)
- (3차) 법령 문언 + 입법 취지로 합리적 해석 명시 + 그 해석을 anchor 가정으로 표기

**채택안 (해석 B 확정 — 2026-05-12 근거 확보)**: **12억 비교 기준 + 안분 분모 = 증여가액 C (전체 주택평가액)**. §159 비례 안분(B/C)은 비과세/과세 분리 후 적용.

**근거 1 (1차)**: 국세청 해석례 5건 확인 — `https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=` 의 다음 회신:
- `010000000000038712` — 1세대1주택 비과세 요건을 갖춘 고가주택을 부담부 증여한 경우 과세 방법 (2004.09.24)
- `010000000000027439` — 1세대 1주택 비과세의 요건을 갖춘 고가주택을 부담부증여한 경우 양도차익 산정 (2006.05.30)
- `010000000000028078` — 1세대 1주택에 해당하는 고가주택의 부담부증여시 양도차익 계산 등 (2005.11.11)
- `010000000000136005` — 부담부증여에 대한 양도차익의 계산 및 고가주택의 양도차익계산 (2008.12.04)
- `010000000000042478` — 주택의 부담부 증여시 고가주택 판단 (2007.05.16)

**근거 2 (보조)**: 실무 해설 — "수증자가 인수하는 채무액이 12억원 이하에 해당되더라도 **전체의 주택가액이 12억원을 초과하면 고가주택으로 본다**" (`yrtaxsave.co.kr` 부담부증여 고가주택 판단 글, 위 국세청 회신 인용).

**확정 산식**:
```
① 고가주택 판단:  giftValuation (C) > 12억 ?
② 안분 후 과세 양도차익(고가) = 전체 양도차익 × (C − 12억) / C
③ §159 비례 안분 적용:  양도과세 양도차익 = 안분 후 과세 양도차익 × (B / C) — 채무 양도 부분
   비과세 양도차익      = 안분 전 비과세 양도차익 × (B / C) — 채무 양도 부분
```

**구현 노트**:
- `transferPrice = giftValuation × B/C` 는 §159 안분 후 결과로 산식 ③ 적용 분모로 사용 금지
- 12억 비교 시 `giftValuation` 사용 — `transferPrice` 사용 금지
- 코드 주석에 위 5개 해석례 ID 1건 이상 인용 약속

### 쟁점 2 — `mortgageSetAmount` fallback 표현 정정

기존 표현 "법령 명시 동치 가정"은 부정확. 담보 **설정액**과 잔존 **차입금**은 개념상 다름(설정액 ≥ 차입금이 일반적). 정정:

- UI hint: "미입력 시 담보차입금 = 설정액으로 가정합니다 (보수적). 실제 설정액이 차입금보다 클 경우 별도 입력."
- 디자인 문서 표현: "법령 명시" → "보수적 동치 가정" (§50⑦에 등치 규정 없음)

### 쟁점 3 — 초과부담부(B/C > 1) 에러 메시지 보강

실무상 채무인수액이 증여가액을 초과하면 "부담부증여 불성립 + 사실상 매매로 의제" 가능. 사용자(주로 세무사)에게 다음 액션 힌트 제공:

```
"채무액(B)이 증여가액(C)을 초과합니다 (B/C = {ratio}).
 부담부증여로는 성립하지 않습니다 (상증법 §47③).
 다음 중 하나로 재입력하세요:
   ① 양도 형태 = '일반 양도' + 취득원인 = '매매' (사실상 매매 의제)
   ② 평가액(C) 입력값 재확인 (시가 모드 / 임대평가 누락 등)
   ③ 채무액(B) 입력값 재확인 (보증금·차입금 중복 합산 여부)"
```

### 쟁점 4 — 케이스 11 (overshoot) 사례 34 영향 사전 검증

사례 34: assumedDebt = 1,560,000,000 / giftValuation ≈ 2,800,000,000 추정 → B/C ≈ 0.557 (< 1, 안전). Phase 2 진입 전 회귀 anchor 실행으로 **사례 34에서 EXCESS_BURDENED_GIFT throw 미발생** 확정 필요.

### 쟁점 5 — `warnings[]` 표시 동선

- ⑥ 사이드바: `result.warnings` 배열을 `WizardSidebar`의 `warningSlot`에 amber 배지로 렌더
- ⑦ 결과 카드: `BurdenedGiftDetailCard` 상단에 모든 warning을 amber/rose 배너로 노출
- **양쪽 모두 표시 필수** — 사용자가 결과 카드 보기 전에 사이드바에서 사전 인지

---

## 🔴 법령 인용 law.go.kr 대조 (D-0 착수 전 필수)

과거 PR 리뷰에서 §66/§63 혼동 패턴이 자주 깨졌음(검토 피드백 2026-05-12). 다음 조문을 **law.go.kr 원문과 1:1 대조** 후 `lib/tax-engine/legal-codes/burdened-gift.ts`에 반영:

| 조·항·호 | 정확 조명 (법제처 원문 2026-05-12 검증) | 검증 |
|---|---|---|
| 소령 §159①1호·2호 | 소득세법 시행령 제159조(**부담부증여에 대한 양도차익의 계산**) 제1항 | ✅ |
| 소령 §159② | 동조 제2항 (양도과세 + 비과세 자산 동시 부담부증여 채무 안분) | ✅ |
| 소법 §95④ | 소득세법 제95조(**양도소득금액과 장기보유 특별공제액**) 제4항 — 단서 §97의2 분리 | ✅ |
| 소법 §89①3호 | 소득세법 제89조(**비과세 양도소득**) 제1항 | ✅ |
| 소령 §154① | 소득세법 시행령 제154조(**1세대1주택의 범위**) 제1항 — 단서: 2017.8.3.↑ 조정대상지역 2년 거주 | ✅ |
| 소령 §155 | 소득세법 시행령 제155조(**1세대1주택의 특례**) — 일시적 2주택·상속·혼인·합가 | ✅ |
| 소령 §160 | 소득세법 시행령 제160조(**고가주택에 대한 양도차익등의 계산**) — 12억 한도 | ✅ |
| 소법 §95② | 소득세법 제95조 제2항 — 장특공 표1·표2 | ✅ |
| 소령 §159의4 | 소득세법 시행령 제159조의4(**장기보유특별공제**) — 표2 보유+거주 (최대 80%) | ✅ |
| 소법 §104의3 | 소득세법 제104조의3(**비사업용 토지의 범위**) — +10%p 중과 | ✅ |
| 소령 §168의6 | 소득세법 시행령 제168조의6(**비사업용 토지의 기간기준**) ← ★ 디자인 v1 "판단"으로 잘못 표기, "**기간기준**"이 정확 | ✅ |
| 상증법 §47③ | 상속세 및 증여세법 제47조(**증여세 과세가액**) 제3항 — 부담부증여 정의 (채무인수 부분) | ✅ |
| 상증법 §60②~③ | 상속세 및 증여세법 제60조(**평가의 원칙 등**) 제2항·제3항 — 시가 평가 | ✅ |
| 상증법 §61①·⑤ | 상속세 및 증여세법 제61조(**부동산 등의 평가**) 제1항(보충적)·제5항(임대 부동산) | ✅ |
| 상증법 §66 | 상속세 및 증여세법 제66조(**저당권 등이 설정된 재산 평가의 특례**) — 담보평가. ★ §63(유가증권 평가) 혼동 금지 | ✅ |
| 상증령 §50⑦ | 상속세 및 증여세법 시행령 제50조(**부동산의 평가**) 제7항 — 임대료 환산 = 보증금 + 임대료/12% | ✅ |
| 소령 §167의3 | 소득세법 시행령 제167조의3(**1세대 3주택 이상에 해당하는 주택의 범위**) — Phase 2 비스코프 | ✅ |
| 소령 §163⑥ | 소득세법 시행령 제163조(**양도자산의 필요경비**) 제6항 — 개산공제 (등기 자산 3%) | ✅ |

**검증 결과**: 21건 모두 법제처 DB 실존 확인 (`mcp__claude_ai_KoreanLaw__verify_citations` 2026-05-12). §63과 §66 혼동 없음. `lib/tax-engine/legal-codes/burdened-gift.ts` 상수는 위 정확 조명으로 반영.

---

## Silent fallback / 자동 안분 후보 식별

| 위치 | 위험 | 대응 |
|---|---|---|
| 양도가액 = 채무액 자동 도출 | 사용자가 입력한 양도가액과 충돌 가능 | 부담부증여 시 양도가액 입력 필드 read-only + 사이드바에 "부담부증여 양도가액(인수 채무)" 명시 라벨 + 채무 내역 툴팁 |
| B/C > 1 분모 보정 | silent fallback 금지 (납세자 혼란) | validate 차단 + 엔진 fail-fast throw. 분모를 1로 capping하는 silent 보정 금지 |
| `mortgageSetAmount` 미입력 시 `mortgageDebtAmount` fallback | **법령 명시 동치 아님** — 담보 설정액과 잔존 차입금은 개념상 다름(설정액 ≥ 차입금이 일반적). 보수적 가정에 불과 | 그대로 유지하되 UI hint를 "**미입력 시 담보차입금 = 설정액으로 가정(보수적). 실제 설정액이 차입금보다 크면 별도 입력**"으로 정정 |
| 거주요건 자동 판정 | §154① 단서 충족 여부는 정보 부족 시 추정 위험 | `regulatedAreaAtAcquisition`·`residencyYears` 필수 입력. 미입력 시 1세대1주택 비과세 적용 불가 (case 4 fallback) |
| 다주택 중과 자동 적용 | 한시 유예 상태 시점 변동 — silent 적용 시 결과 오류 | 케이스 12 명시 비스코프. UI 배너 + 결과 `warnings` 첨부, 자동 +10%p/+20%p 미적용 |

---

## 테스트 약속

### Phase 2 신규 anchor (행 1개 ≥ 테스트 1개)

| 케이스 | 테스트 파일 | 핵심 anchor |
|---|---|---|
| 3 (메뉴 재설계 회귀) | 사례 34 기존 파일 | 산출세액 740,074,515 / 지방소득세 74,007,451 변동 0 |
| 4 (주택 일반) | `burdened-gift-housing.test.ts` | §159 비례 안분 후 §95 표1 적용 — 자가 §55 검증 |
| 5-a (1세대1주택 12억) | 동상 | 12억 안분 분모 = 채무액 양도가, 장특공 표2 최대 80% |
| 5-b (거주요건 미충족) | 동상 | 비과세 박탈 → 표1 + `residencyRequirementFailed === true` |
| 6 (토지 일반) | `burdened-gift-land.test.ts` | LandPriceLookupField 산출값 사용 — 자가 §55 검증 |
| 7 (토지 비사업용) | 동상 | +10%p + 장특공 배제 — 자가 §104의3 검증 |
| 8 (토지 1990) | 동상 | CAP-1/CAP-2 환산값을 A로 사용 |
| 9 (건물) | `burdened-gift-building.test.ts` | §95 표1 — 자가 §55 검증 |
| 10 (일반 양도 회귀) | 기존 사례 1~33 | 결과 변동 0 (양도 형태 기본값 "regular") |
| 11 (초과부담부) | `burdened-gift-overshoot.test.ts` | `expect(() => calcTransferTax(input)).toThrow("EXCESS_BURDENED_GIFT")` |

### 회귀 가드 (반드시 통과)

- 사례 34 anchor 변동 0 (legacy `acquisitionCause === "burdened_gift"` → `transferType: "burdened_gift"` 자동 마이그레이션 후)
- 사례 1~33 anchor 변동 0 (양도 형태 기본값 "regular")
- 전체 934/935 → 동일 또는 증가

### 외부 자료 추종 금지

- 사례 4·5·6·7·8·9 anchor는 양도일 연도의 법정 누진세율표(§55·§103조의3)로 **직접 계산**. 외부 PDF·엑셀 산출값 추종 금지 (`feedback_transfer_year_tax_rate.md`).
- "산출세액 × 10% 가정" 지방세 anchor 금지.

---

## 마이그레이션 (sessionStorage·DB 호환)

```ts
// lib/stores/calc-wizard-migration.ts:normalizeAsset
if (legacy.acquisitionCause === "burdened_gift") {
  return {
    ...legacy,
    acquisitionCause: "gift",          // 당초 취득은 "증여"로 추정 (보수적 fallback)
    transferType: "burdened_gift",     // 양도 형태로 이전
  };
}
return { ...legacy, transferType: legacy.transferType ?? "regular" };
```

- 사례 34 sessionStorage 데이터가 있던 사용자는 자동 변환 → 결과 동일 (회귀 anchor 보존).
- DB `calculations.payload`에 저장된 legacy 부담부증여 입력은 다음 조회 시 자동 normalize.

---

## 14개 동기화 지점 매트릭스 (요약)

| # | 변경 | 위치 |
|---|---|---|
| ① 폼 상태 | `transferType` 추가, `acquisitionCause` enum 정정 | `lib/stores/calc-wizard-asset.ts` |
| ② initial | `transferType: "regular"` | 동상 |
| ③ normalize | legacy `burdened_gift` 자동 이전 | `calc-wizard-migration.ts` |
| ④ API 변환 | `isBurdenedGift = primary.transferType === "burdened_gift"`. propertyType별 기준시가 분기 | `lib/calc/transfer-tax-api.ts` + `-api-burdened-gift.ts` |
| ⑤ UI 위젯 | `TransferModeBlock.tsx` 신설 | `components/calc/transfer/` |
| ⑥ 사이드바 | 부담부증여 양도가액 명시 라벨 + B/C > 1 경고 배지 + cross-cutting flag 노출 + **`result.warnings[]` 전수 amber 배지로 렌더**(케이스 12 등) | `calc-wizard-store.ts` + `WizardSidebar` (warningSlot) |
| ⑦ 결과 카드 | propertyType 라벨링 + 거주요건 미충족 사유 + 초과부담부 경고 + **`warnings[]` 상단 amber/rose 배너 노출 (⑥와 양쪽 모두 표시)** | `BurdenedGiftDetailCard.tsx` |
| ⑧ Validation | propertyType 4종 허용 + B/C > 1 차단 + 거주요건 경고 | `transfer-tax-validate.ts` |
| ⑨ Zod 메인 | `transferType` enum + `acquisitionCause` 정정 | `transfer-tax-schema.ts` |
| ⑩ Zod 컴패니언 | 동상 + addPropertyRefines | `transfer-tax-schema-sub.ts` |
| ⑪ acquisitionDate fallback | 변경 없음 | route handler |
| ⑫ Zod 객체 | `burdenedGiftInfo` 기존 정의 그대로 | `transfer-tax-schema.ts` |
| ⑬ body spread | `transferType` 패스스루 | `transfer-tax-api.ts` |
| ⑭ Route 매핑 | `transferType` 엔진 input 매핑 | `app/api/calc/transfer/route.ts` |

⑫⑬⑭ TypeScript 미감지 영역 — grep 자가 점검 필수.

---

## 조문 상수 추가 (`lib/tax-engine/legal-codes/burdened-gift.ts` 확장)

```ts
export const BURDENED_GIFT_PHASE2 = {
  // Phase 1 그대로 유지
  ...BURDENED_GIFT,

  // 신규
  HOUSING_ONE_EXEMPT_89: "소득세법 §89①3호 — 1세대1주택 비과세 (12억 한도)",
  HOUSING_RESIDENCY_154_1: "소득세법 시행령 §154① 단서 — 2017.8.3.↑ 조정대상지역 2년 거주",
  HOUSING_LTHD_TABLE2_95_2: "소득세법 §95② 표2 — 장특공 표2 (보유+거주 최대 80%)",
  LAND_NON_BUSINESS_104_3: "소득세법 §104의3 — 비사업용 토지 (+10%p, 장특공 배제)",
  EXCESS_DEFINITION_47_3: "상속세및증여세법 §47③ — 부담부증여 정의 (채무인수 부분)",
  MULTI_HOUSE_SURCHARGE_167_3: "소득세법 시행령 §167의3 — 조정대상지역 다주택 중과 (Phase 2 비스코프)",
} as const;
```

---

## UI 통합 위임

- UI 명세: `transfer-tax-burdened-gift-phase2.ui.design.md` (별도 작성)
- 14개 동기화 지점 ①②③⑤⑥⑦⑧⑬은 UI 시니어(`transfer-tax-ui-senior`) 책임
- 엔진 시니어(`transfer-tax-senior`)는 input/result 타입 + 계산 알고리즘 + 회귀 anchor 책임

---

## 후속 PR / 비스코프

- **Phase 3**: 부담부증여 + 증여세 통합 (무상분 → `gift-tax.ts` 호출)
- **상업용건물(`commercial_building`)·일반건물단위(`general_building_unit`)**: cb*·gbu* 12+ 필드 cross-cutting
- **다주택 중과(§167의3)** 정식 지원 — 한시 유예 종료 시점 확정 후
- **임대료 환산율 18%** (2009.4.23. 이전 임대차) — v2
- **신고기한 안내** (§105·§110·상증법 §68) — UI 표시 별도 PR
- **다자산 부담부증여 혼합** (assets[].length ≥ 2) — 자산별 transferType 분기
- **입주권·분양권** (`right_to_move_in`·`presale_right`) — 적용 케이스 희소

---

## 핵심 정책 준수 체크리스트

### D-0 선결 사항 (코드 작성 전 반드시 완료)

- [ ] **법령 인용 law.go.kr 1:1 대조** — 위 "법령 인용 law.go.kr 대조" 표 15개 조문 모두 verify (§63/§66 혼동 패턴 차단)
- [ ] **Step 4 1990 환산 순서 정정 반영** — A 산정을 Step 2.5로 이동, Step 3은 순수 곱셈만, Step 4는 세율·공제만 (acquisitionCost 재할당 금지)
- [ ] **12억 안분 분모 예규 근거 1건 인용** — 국세청 예규(서면-부동산 류) 또는 조세심판원 결정례. 미확보 시 케이스 5-a anchor 확정 보류
- [ ] **사례 34 B/C 사전 확인** — assumedDebt / giftValuation < 1 confirm (overshoot 가드가 사례 34 회귀를 깨지 않는지)

### Phase 2 진행 일반 정책

- [x] 케이스 인벤토리 행 12개 (Do 진입 게이트 통과)
- [x] 14개 동기화 지점 매트릭스 명시 (⑫⑬⑭ grep 점검 약속)
- [x] silent fallback 금지 — 초과부담부 차단·자동 보정 금지
- [x] useEffect → store 미러링 금지 — UI 명세에서 onChange/useMemo 강제
- [x] 양도연도 세율 우선 — anchor 자가 §55 검증
- [x] 외부 자료 추종 금지 — 예제 PDF 사용 시 §55 검증 통과 후만
- [x] 법령 정확성 최우선 — "양도 형태" 중립 라벨, 납세자 유리/불리 표현 금지
- [x] 자동 안분 fallback 금지 — propertyType별 기준시가는 사용자 명시 입력 (LandPriceLookupField·PHD 등)
- [x] 회귀 보존 약속 — 사례 1~33·34 anchor 변동 0
- [x] `mortgageSetAmount` fallback 표현 정정 ("법령 명시" → "보수적 가정")
- [x] 초과부담부 에러 메시지에 사용자 다음 액션 힌트 3개 제공
- [x] `warnings[]` 사이드바·결과카드 양쪽 표시 동선 명시 (⑥⑦)

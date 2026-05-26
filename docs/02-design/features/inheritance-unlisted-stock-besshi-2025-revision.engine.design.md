# 비상장주식 평가서(별지 부표3) 2025.07.10 개정본 재현 — 설계 문서

> 계획서: `docs/00-pm/inheritance-unlisted-stock-besshi-2025-revision.plan.md`
> 작성일: 2026-05-26
> 법령 검증: §54④·§54①·§56④·§17의2·§53⑤⑦⑧·§55③·§59②③·법 §63③ (KoreanLaw MCP 2026-05-26)
> 적용 스킬: `echo-field-pattern`·`besshi-form-replica`·`pre-do-anchor-verification`·`mirror-pattern`

## 1. 범위·원칙

- **단일 진실(SSOT)**: 2025.07.10 양식 + 현행 상증령/시행규칙
- **계산 산식 변경 최소화**: G-3(제6쪽 echo)은 산식 0 변경. G-2(⑱)만 순자산 부채 소계 부호 1곳 변경
- **데이터 경로**: `EstateItem.unlistedStockValuationV2` → 상속세 API(`as` 캐스팅) → `evaluateUnlistedStockV2`. besshi 인쇄뷰는 클라이언트 직접 호출

## 2. 케이스 인벤토리 (구현 단위 — Do 진입 전 행≥1 필수)

| C-ID | 계획 G | 대상 | 변경 종류 | 부호/값 |
|---|---|---|---|---|
| C-1 | G-1 | `Page2NetAssetTable` ⑮ otherProvision | 표시 부호 | `isSubtract: true→false` (가산) |
| C-2 | G-2 | `net-asset-calc.ts` ⑱ | 계산 부호 | `+deferredTaxAdjustment → −` |
| C-3 | G-2 | `NetAssetCalculationTable` ⑱ sign | 입력 라벨 부호 | `"+" → "−"` |
| C-4 | G-3 | `FiscalYearBreakdown` 타입 | echo 필드 +21 optional | add*/sub* 21개 |
| C-5 | G-3 | `unlisted-orchestrator.ts` | pass-through | 입력 fy 21필드 → 결과 |
| C-6 | G-3·G-4 | `Page6NetIncomeBreakdown` | 21행 전개 | ②~㉒ + 소계 가·나 + ㉓㉔㉕ |
| C-7 | G-5 | `Page1CoverSection` 2번 | 6행 체크박스 | 가·나·다(삭제)·라·마·바 |
| C-8 | G-6 | `UnlistedStockValuationInput` +2 | 신규 입력 | businessRegistrationNumber?·capital? |
| C-9 | G-6 | Page1 1번 입력+표시 | 칸 추가 | 사업자번호·자본금 |
| C-10 | G-7 | `Page1CoverSection` 3번 | 칸번호 정합 | ⑥(㉮㉯)·⑦(㉮㉯) |
| C-11 | G-8 | 라벨 최신화 | 텍스트 | ⑯ 기업업무추진비 등 + 헤더 2025.07.10 |
| C-12 | G-9 | 할증 검증 | anchor | large=20%/small·medium=배제 |
| C-13 | G-10 | `Page5GoodwillTable` §55③ 호 라벨 | 텍스트 | real_estate_80→1호, lt3y→2호 본문 |

## 3. 타입 변경 명세

### 3.1 `FiscalYearBreakdown` (C-4) — echo 21필드 optional 추가
```ts
export interface FiscalYearBreakdown {
  label: string;
  taxableIncome: number;
  addTotal: number;
  subTotal: number;
  adjustedNetIncome: number;
  capitalIncreaseAdjustment: number;
  finalNetIncome: number;
  convertedShares: number;
  perShareNetIncome: number;
  // ── C-4 echo (optional — 기존 result 생성 호환) ──
  addRefundInterest?: number;          // ②
  addLossFromDividend?: number;        // ③
  addCarriedDonation?: number;         // ④
  addCarriedCarPayment?: number;       // ⑤
  addForexValuationGain?: number;      // ⑥
  addOtherByOrdinance?: number;        // ⑦
  subCorporateTax?: number;            // ⑧
  subAdditionalTaxes?: number;         // ⑨
  subFines?: number;                   // ⑩
  subCompulsoryPublicCharges?: number; // ⑪
  subPunitiveDamages?: number;         // ⑫
  subWithholdingPenalty?: number;      // ⑬
  subExcessiveExpenses?: number;       // ⑭
  subDonationExcess?: number;          // ⑮
  subEntertainmentExcess?: number;     // ⑯ 기업업무추진비
  subNonBusinessExpenses?: number;     // ⑰
  subNonBusinessCarExpenses?: number;  // ⑱
  subInterestPayment?: number;         // ⑲
  subDepreciationShortage?: number;    // ⑳
  subForexValuationLoss?: number;      // ㉑
  subOtherByOrdinance?: number;        // ㉒
}
```
> ⚠️ 결과 타입의 echo 필드명은 입력 `FiscalYearAdjustment`와 **동일**하게 두어 orchestrator가 spread로 복사 가능. testid는 칸번호(`p6-②`) 기준 — 필드명과 분리.

### 3.2 `UnlistedStockValuationInput` (C-8) — 신규 입력 2필드
```ts
  /** 제1쪽 1번 사업자등록번호 (표시 전용 — 계산 무관) */
  businessRegistrationNumber?: string;
  /** 제1쪽 1번 자본금 (표시 전용 — 계산 무관) */
  capital?: number;
```
> 둘 다 **계산 비참여**(표시 전용). Date 아님 → `coerceDates` 무관. 직렬화 strip 점검 필요(아래 §6).

## 4. 엔진 변경 명세

### 4.1 C-2 — `net-asset-calc.ts` 부채 소계 (⑱ 부호)
```diff
  const totalLiabilities =
    input.bsTotalLiabilities + input.corporateTaxPayable + input.farmingSurtax +
    input.localIncomeTax + input.dividendPayable + input.retirementProvision +
    input.otherProvision -            // ⑮ 가산 (§17의2 4호 단서가) — 유지
    input.reserveExcluded -           // ⑯ 차감
    input.allowanceExcluded -         // ⑰ 차감
-   input.deferredTaxAdjustment +     // ⑱ 가산 (버그)
+   input.deferredTaxAdjustment -     // ⑱ 차감 (양식 ⑲소계 −⑱)
    (input.insuranceReservePolicy ?? 0) + ... // 보험 3종 가산 유지
```
> 근거: §17의2 본칙 미명시 → **양식 ⑲소계 `−⑱`이 유일 직접 근거**. 정정 커밋 주석에 명시. 보험 3종(나·다목)은 가산 유지(§17의2 4호 단서 나·다).

### 4.2 C-5 — `unlisted-orchestrator.ts` echo pass-through
**`buildBreakdown(input, idx, ...)` 함수**(line 278)에서 `input.fiscalYears[idx]`의 21필드를 결과 객체에 spread 복사. **`calcFiscalYearNetIncome` 산식 무변경**.
```ts
function buildBreakdown(input, idx, adjustedNetIncome, capitalAdj, finalNetIncome, convertedShares, perShareNetIncome): FiscalYearBreakdown {
  const fy = input.fiscalYears[idx];
  return {
    label: fy.fiscalYearLabel, taxableIncome: fy.taxableIncome,
    addTotal, subTotal, adjustedNetIncome, capitalIncreaseAdjustment: capitalAdj,
    finalNetIncome, convertedShares, perShareNetIncome,
    // C-5 echo (21필드)
    addRefundInterest: fy.addRefundInterest, addLossFromDividend: fy.addLossFromDividend,
    /* ... ⑤⑥⑦⑧~㉒ 총 21개 spread ... */ subOtherByOrdinance: fy.subOtherByOrdinance,
  };
}
```

## 5. UI 변경 명세 (besshi 출력 + 입력)

### 5.1 C-6 — `Page6NetIncomeBreakdown` 21행 전개
현재 "가산 합계/차감 합계" 2행 → 양식 구조로:
- **① 각 사업연도 소득금액** (최상단, 유지)
- **소득에 가산할 금액**: ② ~ ⑦ (6행) + **가. 소계 (①+②+…⑦)**
- **소득에서 차감할 금액**: ⑧ ~ ㉒ (15행) + **나. 소계 (⑧+…㉒)**
- 다. 순손익액 / 라. 유상증감자 / 마. 최종 순손익액 / 바. 환산주식수 / **사. 주당순손익액 ㉓㉔㉕**(3년 열) / 아. 가중평균 / 자. 환원율 / 차. 1주당가액
- 3년 열(×3/×2/×1) 유지. testid `p6-②`~`p6-㉒`·`p6-㉓`~`p6-㉕`·`p6-차` 동결
- ⚠️ 800줄 점검 — 항목 정의 배열을 `BesshiPage6Rows.ts` 상수로 분리 가능

### 5.2 C-7 — `Page1CoverSection` 2번 6행 체크박스
```
2. 순자산가치로만 평가하는 경우 [v] (상증령 §54④)
 가. 청산절차 진행            [v] (netAssetOnlyReason==="liquidation")
 나. 사업개시 3년 미만·휴폐업  [v] (==="lt3y")
 다. 3년 연속 결손금 (2018.2.13. 삭제)  [회색·비활성]
 라. 부동산 80% 이상          [v] (==="real_estate_80")
 마. 주식 80% 이상            [v] (==="stock_holding_80")
 바. 잔여 존속기한 3년 이내    [v] (==="remaining_3y")
```
> - 다(삭제)는 정적 회색(`feedback_tailwind_static_tone_mapping`). 선택된 사유만 [v], 나머지 [ ].
> - ⚠️ **`netAssetOnlyReason === undefined`(일반 가중평균 케이스)에도 2번 섹션 6행을 빈 [ ]로 항상 표시**(양식 충실). 현재 코드 `{input.netAssetOnlyReason && (…)}` 조건부 렌더 → **조건 제거**, 6행 상시 렌더로 변경.

### 5.3 C-9 — Page1 1번 사업자번호·자본금
- **출력**: besshi `Page1CoverSection` 1번 표에 사업자등록번호(법인명 행)·자본금(발행주식 행) 칸 추가.
- **입력**: **`CorporateInfoSection.tsx`**(corpName·faceValuePerShare·totalShares 입력 컴포넌트)에 businessRegistrationNumber(text input + onFocus select)·capital(`CurrencyInput`) 추가.

### 5.4 C-10 — Page1 3번 칸번호 정합
양식 구조:
- ⑥ ㉮ = `[{(④×2)+(⑤×3)}÷5]` (부동산과다 `{(④×3)+(⑤×2)}÷5`) → `weightedAvgPerShare`
- ⑥ ㉯ = ④×80% (하한) → `netAssetFloor80`
- ⑥ = max(㉮,㉯) → `finalPerShareValue`
- ⑦ ㉮ = **⑥ × 할증율**(할증분만) → **신규 표시: `premiumPerShare − finalPerShareValue` 또는 `finalPerShareValue × premiumRate`**
- ⑦ ㉯ = **⑥ + ㉮**(합계) → `premiumPerShare`
- 최종 보고가액 → `finalPerShareForReporting`

⚠️ **D2-1**: 현재 구현은 ⑦을 `premiumPerShare`(⑥×1.2=㉯) **1행**만 표시 → 양식대로 **㉮(할증분)·㉯(합계) 2행**으로 분리. 비최대주주(premiumRate=0)는 ⑦ 행 [ ] 또는 "해당없음". **계산값 무변경**, 표시 행 분리만.

### 5.6 C-11 — 라벨·헤더 최신화 (besshi 출력 전반)
- `BesshiForm4Buppyo3PrintView` 헤더 `"(2021.3.4. 개정)"` → **`"(2025.07.10 개정)"`**
- `Page6NetIncomeBreakdown` ⑯ 라벨 "접대비" → **"기업업무추진비"** (이미 타입은 정합, 표시 텍스트만)
- `Page2NetAssetTable` ⑮ 라벨 "기타충당금" → **"기타(충당금 중 평가기준일 현재 비용으로 확정된 것)"** (양식 정밀 문구)

### 5.5 C-13 — `Page5GoodwillTable` §55③ 호 라벨
```diff
- real_estate_80: "§55③ 2호 본문 — 부동산 80% 이상 → 영업권 가산 없음",
+ real_estate_80: "§55③ 1호 — 부동산 80%(§54④3호) → 영업권 가산 없음",
- lt3y: "§55③ 2호 단서 — 사업개시 3년 미만·휴·폐업",
+ lt3y: "§55③ 2호 — 사업개시 3년 미만·휴·폐업(§54④2호)",
```
> testid·로직 무변경. 라벨 텍스트만.

## 6. 동기화 지점 (C-8 신규 입력 strip 점검)

`lib/calc/inheritance-api.ts:71`은 **`estateItems: input.estateItems`로 배열을 통째 전달**(spread·명시매핑 아님) → `unlistedStockValuationV2` 내부 신규 필드(businessRegistrationNumber·capital)도 **자동 포함, strip 위험 낮음**.
- route.ts:72 `as` 캐스팅이라 Zod strip 없음.
- businessRegistrationNumber(string)·capital(number)은 **Date 아님** → route의 `coerceDates`/`toDate` 무관.
- validate(`inheritance-validate.ts`)는 표시 전용 필드라 필수검증 불요.
- ⚠️ 단 Do 단계에서 `inheritance-api.ts`가 estateItem을 **재가공(부분 map)** 하지 않는지 grep 재확인(line 109 `.map`은 prior gifts 경로 — estateItems 무관 확인 필요).

## 7. anchor 명세

| anchor | 내용 | 기대 | C-ID |
|---|---|---|---|
| **AC-1** | ⑱=10,000,000, 그 외 부채 0 | 부채소계 −10,000,000 | C-2 |
| **AC-2** | ⑮=5,000,000 | 부채소계 +5,000,000 (Page2 가산 표시) | C-1 |
| **AC-3** | PDF 사례 1 통합 7 anchor | 회귀 0 (⑱=0 무변동) | C-2 |
| **AC-4** | 21개 add*/sub* 입력 → 결과 echo 일치 | 입력=결과 echo | C-4·C-5 |
| **AC-5** | Σ(②~⑦)=addTotal, Σ(⑧~㉒)=subTotal 자기일관 | 합계 일치 | C-6 |
| **AC-6** | 5사유 각각 → 해당 행만 [v] | 매핑 정확 | C-7 |
| **AC-7** | companySize large→0.20, small·medium→0 | §63③·§53⑧ | C-12 |

## 8. 데이터 흐름

```
[입력 폼: estateItem.unlistedStockValuationV2]
  fiscalYears[3].{taxableIncome, add*×6, sub*×15}  ← 이미 입력받음
  netAssetValueRaw.{①~⑱}                          ← 이미 입력받음
  + businessRegistrationNumber?, capital?           ← C-8 신규
        │ inheritance-api.ts 직렬화 (strip 점검 C-8)
        ▼
[/api/calc/inheritance route.ts:72 `as` 캐스팅]
        ▼
[evaluateAllEstateItems → evaluateUnlistedStockV2]
  net-asset-calc: ⑱ 차감(C-2) / ⑮ 가산(유지)
  fiscal-year-net-income: 21개 합산(무변경)
  orchestrator: 21필드 echo(C-5)
        ▼
[UnlistedStockValuationResult.fiscalYearBreakdowns[3] + echo 21]
        ▼
[besshi: Page2(⑮가산 C-1) · Page5(§55③ C-13) · Page6(21행 C-6)]
```

## 9. 일관성 점검 표

| 항목 | 엔진 | 입력UI | besshi 출력 | 양식 | 정정 후 일치? |
|---|---|---|---|---|---|
| ⑮ otherProvision | 가산 | 가산 | 차감→**가산(C-1)** | 가산 | ✅ |
| ⑱ deferredTax | 가산→**차감(C-2)** | 가산→**차감(C-3)** | 차감 | 차감 | ✅ |
| 제6쪽 21항목 | 합산 | 입력 | 합계→**21행(C-6)** | 21행 | ✅ |
| §55③ 호 라벨 | — | — | 오류→**정정(C-13)** | — | ✅ |

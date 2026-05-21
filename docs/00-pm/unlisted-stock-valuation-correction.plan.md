# 비상장주식 보충적 평가 산식 정정 계획서 (v2)

> **상태**: Plan v2 (재검토 반영)
> **작성일**: 2026-05-21

## v1 → v2 정정 (재검토)

| # | 카테고리 | 정정 |
|---|---|---|
| R-1 | 원인 진단 | 사용자 의심한 "§54① 단서(80% 적용) 오류"는 **존재하지 않음** — 엔진 라인 178-181 시행령 부합. 화면 "최소값 0" 표시의 진짜 원인은 **순자산가치 입력값(25,000원) 자체가 비현실적이라 1주당 환산 시 0**으로 절사. 80% 산식은 정상 작동 |
| R-2 | 우선순위 재분류 | **E-1 이중 floor** P0 → P2 강등 (사용자 사례 정정 전후 모두 0 — 가시적 효과 없음). **U-1 §54④ 순자산가치만 적용** P1 → **P0 승격** (사업개시 3년 미만·결손법인 실무 빈번). **UI 0 값 경고 + 단위 명확화** 신설 **P0** (사용자가 막힌 본질) |
| R-3 | §56① 산식 단순화 명시 | 시행령 §56①·③은 **사업연도별 발행주식 총수**로 각 연도 1주당 순손익 산출 후 가중평균(3:2:1÷6). 엔진은 사용자가 미리 계산한 회사 전체 가중평균을 받아 단일 발행주식수로 나눔 — **단순화 모델임을 §1에 명시** |
| R-4 | §54④ 단서 강조 | 3호·5호(부동산 80%·주식 80%)는 **"가중평균 < 1주당 순자산가치인 경우만"** 순자산가치 적용. 1호·2호·6호는 무조건 순자산가치. U-1 구현 시 분기 표 명시 |
| R-5 | 회귀 안전 검증 | 기존 anchor S17(200M/0.1/100K=20,000)·S21(10B/0.1/100K=1,000,000) **정정 전후 동일** 확인 — E-1 정정 시 회귀 0건 |
> **세목**: 상속세·증여세 — 비상장주식 평가 (상증법 §63 ①1호 다목 + 시행령 §54·§55·§56)
> **유형**: 정확성 정정 + 미구현 분기 추가
> **에이전트**: `inheritance-gift-tax-senior` + `property-valuation-senior` + `inheritance-gift-tax-ui-senior`

---

## 1. 배경 (Why)

사용자가 비상장주식 평가 입력 화면에서 다음 입력 시 모든 1주당 값이 **0**으로 표시되는 현상 보고. 사용자는 "가중평균 < 80% 시 80% 적용" 산식에 오류가 있다고 의심:

| 입력 | 값 |
|---|---|
| 총 발행주식 수 | 41,667 주 |
| 보유 주식 수 | 25,000 주 |
| 최근 3년 가중평균 순손익 (회사 전체) | 300 원 |
| 자본환원율 | 10 % |
| 순자산가치 (회사 전체) | 25,000 원 |

결과 모두 0.

### 1.1 원인 진단 (재검토 R-1 반영)

**§54① 단서 80% 산식은 정상 작동** (엔진 라인 178-181). 화면 "최소값 0"의 진짜 원인:

```
1주당 순자산가치 = floor(25,000 / 41,667) = floor(0.6) = 0
최소값 = floor(0 × 0.80) = 0
가중평균 = floor((0×3 + 0×2) / 5) = 0
최종 = max(0, 0) = 0
```

**입력값이 비현실적으로 작음** (회사 전체 순자산 25,000원은 자본금 미달):
- 정상 사례: 순자산 100억 → 1주당 240,000원 → 최소값 192,000원
- 사용자 사례: 순자산 25,000원 → 1주당 0.6원 → floor 0 → 최소값 0

또는 **단위 혼동** 가능성:
- 사용자가 "1주당 순손익 300원"을 입력했는데 라벨이 "회사 전체"라 엔진이 41,667주로 다시 나눔 → 0.0072원 → 0

### 1.2 본 PR의 실제 목적 (재검토 후)

산식 자체는 시행령 부합. 본 PR은 다음을 해소:
1. **사용자 혼란 차단** — 0 값 경고 + 단위 hint 명확화
2. **법령 빈틈 해소** — §54④ 순자산가치만 적용 6케이스 (실무 빈번)
3. **잠재 정밀도 손실 차단** — 이중 floor → 단일 floor (큰 영향은 없지만 회귀 안전 확인됨)

### 1.3 단순화 모델 명시 (R-3)

시행령 §56①·③: **사업연도별 발행주식 총수**로 각 연도 1주당 순손익 산출 후 가중평균(3:2:1÷6). 본 엔진은 사용자가 미리 계산한 "회사 전체 가중평균"을 단일 발행주식수로 나누는 **단순화 모델**. 평가기준일 이전 3년 이내 증자·감자가 없는 경우 시행령 결과와 동일. 증자·감자 환산은 U-3 후속 PR.

## 2. 법령 검증 (KoreanLaw MCP 2026-05-21)

### 2.1 상증법 시행령 §54 (비상장주식등의 평가)

> ①…1주당 순손익가치와 1주당 순자산가치를 각각 3과 2의 비율[부동산과다보유법인의 경우에는 1주당 순손익가치와 순자산가치의 비율을 각각 2와 3]로 가중평균한 가액으로 한다. **다만, 그 가중평균한 가액이 1주당 순자산가치에 100분의 80을 곱한 금액보다 낮은 경우에는 1주당 순자산가치에 100분의 80을 곱한 금액**을 비상장주식등의 가액으로 한다.

→ ✅ 엔진 라인 178-181 부합 (`Math.max(perShareWeightedValue, perShareMinValue)`).

> ④ 다음 각 호의 어느 하나에 해당하는 경우에는 제1항에도 불구하고 제2항에 따른 **순자산가치에 따른다**.
>   1. 청산절차 진행·사업계속 곤란 법인
>   2. 사업개시 전·사업개시 후 **3년 미만**·휴업·폐업 법인
>   3. 부동산 비율 80% 이상 법인 (가중평균 < 1주당 순자산가치인 경우만)
>   5. 주식등 가액 80% 이상 법인 (3호와 동일 단서)
>   6. 잔여 존속기한 3년 이내 법인

→ ❌ **엔진 미구현** (UI 토글·엔진 분기 모두 없음).

> ③ 발행주식 총수 등 100분의 10 이하 보유 시 취득가액에 의할 수 있음.

→ ❌ 엔진 미구현.

### 2.2 시행령 §55 (순자산가액 계산방법)

> ① 순자산가액 = 자산 평가액(§60~§66) − 부채. **0원 이하이면 0원**. 자산평가액이 장부가액보다 적으면 장부가액 적용 (정당한 사유 있으면 예외).
>
> ③ 영업권평가액(§59②) 자산에 합산 (§54④ 1·3호 또는 결손법인은 제외).

→ ⚠️ 엔진은 `netAssetValue` 단일 입력. 영업권·장부가액 비교 분기 미구현.

### 2.3 시행령 §56 (1주당 최근 3년간의 순손익액)

> ① **1주당 최근 3년간의 순손익액의 가중평균액** = (계산식). 그 가액이 **음수인 경우 영(0)으로 한다**.

→ ✅ 엔진 라인 119 음수 0 처리 부합.

> ③ 각 사업연도 주식 수는 사업연도 종료일 현재 발행주식 총수. 평가기준일 이전 3년 이내 증자·감자 시 환산 (시행규칙 §17의3⑤).

→ ❌ 엔진 미구현 (증자/감자 환산).

> ② 일시·우발적 사건으로 순손익액 증가 시 신용평가전문기관 추정이익 평균가액 사용 가능.

→ ❌ 엔진 미구현.

> ⑤ 평가기준일 이전 3년 이내 유상증자·감자 시 순손익액 보정.

→ ❌ 엔진 미구현.

### 2.4 시행규칙 §17의3 (1주당 순손익액 계산방법)

> ② 사업연도가 1년 미만인 경우 1년으로 계산.

→ ❌ 엔진 미구현.

---

## 3. 발견 사항 분류

### 3.1 오류 (정정 필요)

#### **E-1 이중 floor 절사로 인한 정밀도 손실 (P0 — 우선)**

`lib/tax-engine/property-valuation-stock.ts` 라인 155-160:

```ts
// 회사 전체 가중평균 순손익 → 1주당 순손익 → 1주당 순손익가치
const perShareWeightedNetIncome = Math.floor(data.weightedNetIncome / data.totalShares);  // [F1]
const perShareIncomeValue = calcPerShareNetIncomeValue(
  perShareWeightedNetIncome,
  capRate,
);

// calcPerShareNetIncomeValue 내부 (라인 113-121)
return Math.floor(weightedNetIncome / capitalizationRate);  // [F2]
```

**문제**: F1 + F2 두 단계 모두 `Math.floor` 적용 → 작은 입력값에서 모두 0으로 절사.

**사용자 사례 분석**:
- F1: floor(300 / 41,667) = floor(0.0072) = **0**
- F2: floor(0 / 0.10) = **0**
- 정밀 계산 시: floor(300 / (41,667 × 0.10)) = floor(0.072) = **0**

→ 사용자 입력값(300원·25,000원)이 비현실적으로 작아 어떤 산식으로도 0 발생. **하지만 두 단계 floor는 잠재적 정밀도 손실 위험**.

**법령 정합성**:
- 시행령 §56①은 "1주당 최근 3년간의 **순손익액의 가중평균액**"으로 표현 — 1주당 단위지만 절사 시점 미명시.
- 시행규칙 §17의3② "사업연도 1년 미만은 1년 계산" — 절사 직접 언급 X.
- 국세청 예규 (재산세과-XXX): 1주당 순손익가치는 **원 단위 절사** 일반적.

**권장 정정**:

```ts
// After (단일 floor — 분모 합쳐 정밀도 유지)
const denominator = data.totalShares * capRate;
const perShareIncomeValue = denominator > 0
  ? Math.floor(data.weightedNetIncome / denominator)
  : 0;
```

또는 **입력 라벨 변경**: "1주당 가중평균 순손익액 (원)"으로 직접 입력 받아 회사 전체 → 1주당 변환 자체를 제거 (시행령 §56① 정의 그대로).

#### **E-2 입력 단위 라벨 모호성 (P1)**

화면 라벨 "최근 3년 가중평균 순손익 (회사 전체)"이지만 시행령 §56①은 "1주당"으로 표현. 사용자에게 혼란 — **회사 전체 vs 1주당** 입력 단위 명확화 필요.

**권장**: 두 가지 옵션 토글 또는 라벨 변경.
- Option A (호환): 현행 유지 + hint 추가 "엔진이 자동으로 주식수로 나눠 1주당으로 변환"
- Option B (시행령 §56① 직접 반영): 라벨 "1주당 가중평균 순손익액 (원)"으로 변경

→ Option A 권장 (회귀 영향 최소화).

### 3.2 미구현 (추후 PR 후보)

| # | 항목 | 법령 | 우선순위 |
|---|---|---|---|
| U-1 | 순자산가치만 적용 6개 케이스 (청산·3년 미만·휴폐업·부동산 80%·주식 80%·잔여 3년) | §54④ | P1 |
| U-2 | 보유비율 10% 이하 → 취득가액 옵션 | §54③ | P3 |
| U-3 | 평가기준일 이전 3년 이내 증자·감자 시 발행주식 총수 환산 | §56③ + 시행규칙 §17의3⑤ | P2 |
| U-4 | 유상증자·감자 시 순손익액 보정 | §56⑤ | P2 |
| U-5 | 신용평가전문기관 추정이익 방법 | §56② | P3 |
| U-6 | 사업연도 1년 미만 시 1년 환산 | 시행규칙 §17의3② | P2 |
| U-7 | 영업권평가액 자산 가산 | §55③ + §59② | P2 |
| U-8 | 순자산가액 장부가액 비교 (장부가액 < 평가액일 때 장부가액 적용) | §55① 후단 | P3 |

### 3.3 ✅ 정합 확인

| # | 항목 | 엔진 위치 | 결과 |
|---|---|---|---|
| OK-1 | §54① 가중평균 비율 3:2 (부동산과다 2:3) | 라인 167-175 | ✅ |
| OK-2 | §54① 단서 80% 최소값 적용 | 라인 178-181 | ✅ |
| OK-3 | §56① 가중평균 음수 → 0 처리 | 라인 119 | ✅ |
| OK-4 | §55① 순자산가액 0 이하 → 0 처리 | 라인 131-133 (calcPerShareNetAssetValue) | ⚠️ 부분 (0 처리는 ÷0 방어 한정, 0 이하 명시 미반영) |

---

## 4. 정정 범위 (본 PR — 재검토 R-2 우선순위 재조정)

### 4.1 P0 (필수)

#### P0-A. **UI 0 값 경고 + 단위 명확화** (사용자 막힌 본질)

- "최근 3년 가중평균 순손익" 입력란 hint 보강: "회사 전체 금액 입력 — 엔진이 총 발행주식 수로 자동 나눠 1주당 환산"
- "순자산가치" 입력란 hint 보강: "회사 전체 금액 — 1주당 순자산 X"
- **계산 내역 박스에 입력값 0·비현실적 경고**: 1주당 순자산가치가 1원 미만으로 절사되면 amber 경고 "회사 전체 순자산가치(X원)가 발행주식 수(Y주)에 비해 매우 작아 1주당 가액이 0으로 절사됨. 단위를 다시 확인해 주세요"
- §54① 단서 80% 적용 안내 메시지에 "0이 적용된 경우 입력값 재확인" 추가

#### P0-B. **§54④ 순자산가치만 적용 6케이스** (실무 빈번)

| 호 | 조건 | 단서 | 우선순위 |
|---|---|---|---|
| 1호 | 청산절차 진행·사업계속 곤란 | 무조건 순자산가치 | P0 |
| 2호 | 사업개시 전·**3년 미만**·휴업·폐업 | 무조건 순자산가치 | P0 (스타트업 빈번) |
| 3호 | 부동산 비율 80% 이상 | 가중평균 < 1주당 순자산가치인 경우만 | P0 |
| 5호 | 주식 등 가액 80% 이상 | 가중평균 < 1주당 순자산가치인 경우만 | P0 |
| 6호 | 잔여 존속기한 3년 이내 | 무조건 순자산가치 | P1 |

- UI: UnlistedStockEditor에 ToggleCard "순자산가치만 적용 (§54④)" + 6 옵션 RadioCardGroup
- 엔진: `UnlistedStockData`에 `assetValueOnlyReason?: "liquidation" | "lt3y" | "real_estate_80" | "stock_80" | "remaining_3y"` 필드 추가
- `calcUnlistedStockPerShareValue` 분기: 사유 명시 시 `perShareFinalValue = perShareAssetValue` (1호·2호·6호) 또는 `Math.max(perShareWeightedValue, perShareAssetValue)` (3호·5호 단서)

### 4.2 P1 (본 PR 포함 가능)

#### P1-C. **OK-4 보강 — 순자산가액 0 이하 → 0 처리** (§55①)

`calcPerShareNetAssetValue`에 `Math.max(0, netAssetValue)` 가드 추가.

### 4.3 P2 (본 PR 포함 가능 — 회귀 안전 검증됨)

#### P2-D. **E-1 이중 floor → 단일 floor**

기존 anchor 회귀 안전 확인 (R-5). 정밀도 잠재 손실 차단.

### 4.4 비목표 (별도 PRD)

- U-2 §54③ 10% 이하 보유 시 취득가액 옵션
- U-3 §56③ + 시행규칙 §17의3⑤ 3년 이내 증자·감자 환산
- U-4 §56⑤ 유상증자·감자 순손익액 보정
- U-5 §56② 신용평가전문기관 추정이익
- U-6 시행규칙 §17의3② 사업연도 1년 미만 환산
- U-7 §55③ 영업권 자산 가산 (§54④ 1호·3호·결손법인 제외 단서 포함)
- U-8 §55① 후단 장부가액 비교

---

## 5. 정정 산식 (E-1)

### 5.1 Before

```ts
// lib/tax-engine/property-valuation-stock.ts 라인 155-164
const perShareWeightedNetIncome = Math.floor(data.weightedNetIncome / data.totalShares);
const perShareIncomeValue = calcPerShareNetIncomeValue(
  perShareWeightedNetIncome,
  capRate,
);

// calcPerShareNetIncomeValue
export function calcPerShareNetIncomeValue(
  weightedNetIncome: number,
  capitalizationRate: number,
): number {
  if (capitalizationRate <= 0) return 0;
  if (weightedNetIncome <= 0) return 0;
  return Math.floor(weightedNetIncome / capitalizationRate);
}
```

### 5.2 After

```ts
// 회사 전체 가중평균 순손익 / (총 발행주식수 × 환원율) — 단일 floor로 정밀도 유지
const denominator = data.totalShares * capRate;
const perShareIncomeValue =
  denominator > 0 && data.weightedNetIncome > 0
    ? Math.floor(data.weightedNetIncome / denominator)
    : 0;

// calcPerShareNetIncomeValue는 1주당 가중평균 순손익 입력 받아 환원만 (외부 호환용 유지)
// → calcUnlistedStockPerShareValue에서 직접 분모 합쳐 호출 우회
```

### 5.3 사용자 사례 (정정 후)

- denominator = 41,667 × 0.10 = 4,166.7
- perShareIncomeValue = floor(300 / 4,166.7) = floor(0.072) = 0

→ 입력값 자체가 비현실적이라 여전히 0. 하지만 **잠재적 정밀도 손실 해소**.

### 5.4 정밀도 개선 anchor

```ts
// 의도적으로 정밀도 손실 발생 가능한 값
it("[E1-1] 작은 가중평균 순손익 + 큰 주식수 — 단일 floor 정밀도 유지", () => {
  const data: UnlistedStockData = {
    weightedNetIncome: 500_000_000,  // 5억
    netAssetValue: 50_000_000_000,   // 500억
    totalShares: 1_000_000,           // 100만주
    ownedShares: 100_000,             // 10만주
    capitalizationRate: 0.1,
  };
  const r = calcUnlistedStockPerShareValue(data, false);
  // 정정 전: floor(floor(500_000_000 / 1_000_000) / 0.1) = floor(500 / 0.1) = 5,000
  // 정정 후: floor(500_000_000 / (1_000_000 × 0.1)) = floor(500_000_000 / 100_000) = 5,000
  // 동일 결과 — 큰 값에서는 영향 없음
  expect(r.perShareIncomeValue).toBe(5_000);
});

it("[E1-2] 정수 나눗셈 경계 — 절사 시점 차이로 1원 발생 가능", () => {
  // 가중평균 순손익 1,234,567원 / 총 1,000주 / 환원율 10%
  const data: UnlistedStockData = {
    weightedNetIncome: 1_234_567,
    netAssetValue: 100_000_000,
    totalShares: 1_000,
    ownedShares: 100,
    capitalizationRate: 0.1,
  };
  const r = calcUnlistedStockPerShareValue(data, false);
  // 정정 전: floor(floor(1_234_567/1_000)/0.1) = floor(1234/0.1) = floor(12340) = 12,340
  // 정정 후: floor(1_234_567/(1_000×0.1)) = floor(1_234_567/100) = 12,345
  // → 1주당 5원 차이 (∵ floor 1단계 vs 2단계)
  expect(r.perShareIncomeValue).toBe(12_345);
});
```

---

## 6. PDCA 단계

### Plan (본 문서) ✅

### Design (선택 — 단순 정정이라 생략 가능)

규모가 작아 design 문서 없이 Plan + anchor만으로 진행.

### Do

1. Pre-Do anchor 작성 (E1-2 경계 케이스로 회귀 확인)
2. `calcUnlistedStockPerShareValue` 라인 155-160 정정
3. `calcPerShareNetIncomeValue` 시그니처 유지 (외부 호환)
4. 순자산가액 0 이하 → 0 처리 명시 보강
5. UI hint 추가 (E-2)
6. 기존 anchor 회귀 0 확인
7. anchor E1-1·E1-2 PASS

### Check

- `npx tsc --noEmit` 0
- `npx vitest run __tests__/tax-engine/property-valuation-stock.test.ts` PASS
- 전체 회귀 0건

### Act

- U-1 (§54④ 6케이스) 별도 PR
- U-3·U-4·U-6·U-7 별도 PRD

---

## 7. 변경 파일 (재검토 우선순위 반영)

| 파일 | 변경 | 줄 수 | 우선순위 |
|---|---|---|---|
| `lib/tax-engine/types/inheritance-gift.types.ts` | `UnlistedStockData.assetValueOnlyReason?` enum 필드 추가 | +5 | P0-B |
| `lib/tax-engine/property-valuation-stock.ts` | §54④ 분기 + 단일 floor + §55① 0 이하 가드 | +40 | P0-B / P2-D / P1-C |
| `components/calc/StockValuationForm.tsx` | UI: ToggleCard "순자산가치만 적용" + 6 옵션 + 0 값 amber 경고 + hint 보강 | +60 | P0-A / P0-B |
| `__tests__/tax-engine/property-valuation-stock.test.ts` | anchor S22~S27 — 6 케이스 + 정밀도 + 0 가드 | +120 | 전체 |

> 800줄 정책: StockValuationForm 현재 742줄 → +60 = 802줄 위반 위험. **P0-B UI 분기를 `UnlistedStockSpecialReasonSection.tsx` 신규 파일로 분리** 강제.

---

## 8. 정책 사전 적용 (MEMORY.md)

- [[feedback_korean_law_82_vs_81_2_drift]] ★★★ — KoreanLaw MCP로 시행령 §54·§55·§56 + 시행규칙 §17의3 위임체인 끝까지 검증 ✅
- [[feedback_pre_anchor_verification]] — Pre-Do anchor E1-2 경계 케이스로 회귀 보호 ✅
- [[feedback_tax_calculation_principle]] — 법령 정확성 최우선. 사용자 입력값이 비현실적이어도 산식 자체는 시행령 부합해야 ✅
- [[bigint-round-half-up]] — Number 2^53 미만이라 BigInt 불필요. 단일 floor로 충분 ✅

---

## 9. 리스크

| 항목 | 위험 | 대응 |
|---|---|---|
| 기존 PDF 사례 anchor 회귀 | 1주당 순손익가치 1~수원 차이 가능 | 회귀 anchor 통과 확인 후 진행. 차이 발생 시 시행령 §56① 정의(1주당 가중평균 순손익액)에 정합한 정정으로 판단 |
| `calcPerShareNetIncomeValue` 외부 호출 | export 함수 — 시그니처 유지하지 않으면 회귀 | 시그니처 그대로 두고 `calcUnlistedStockPerShareValue` 내부에서만 우회 |
| 사용자 입력 단위 혼동 | 회사 전체 vs 1주당 | UI hint 명확화로 해소 |

---

## 10. 완료 조건 (DoD — 재조정)

### P0-A (UI 명확화)
- [ ] hint 보강: 가중평균 순손익·순자산가치 입력란 ("회사 전체" 단위 명시)
- [ ] amber 경고: 1주당 가액이 0으로 절사되면 입력 단위 재확인 안내
- [ ] §54① 단서 적용 메시지에 "0이 적용된 경우 입력값 재확인" 보강

### P0-B (§54④ 순자산가치만 적용)
- [ ] `UnlistedStockData.assetValueOnlyReason` enum 5종(liquidation/lt3y/real_estate_80/stock_80/remaining_3y)
- [ ] UI ToggleCard + RadioCardGroup 분기
- [ ] 엔진 분기: 1호·2호·6호 무조건 / 3호·5호 단서 분기
- [ ] anchor S22~S26 — 5케이스 PASS

### P1-C (§55① 0 이하 가드)
- [ ] `calcPerShareNetAssetValue`에 `Math.max(0, netAssetValue)` 가드
- [ ] anchor S27 음수 순자산 → 0 PASS

### P2-D (단일 floor)
- [ ] 이중 floor → 단일 floor 정정
- [ ] 기존 anchor S17·S21 회귀 0 (R-5 검증됨)
- [ ] anchor E1-2 경계값(1,234,567/1,000/10%) = 12,345 PASS

### 공통
- [ ] tsc 0 errors
- [ ] 전체 vitest 4,127 + 신규 ≈ 6건 = 4,133 passed
- [ ] StockValuationForm 800줄 정책 — `UnlistedStockSpecialReasonSection.tsx` 분리

## 11. 후속 (별도 PRD)

- U-2 §54③ 10% 이하 보유 시 취득가액
- U-3 §56③ + 시행규칙 §17의3⑤ 3년 이내 증자·감자 환산
- U-4 §56⑤ 유상증자·감자 순손익액 보정
- U-5 §56② 추정이익 방법
- U-6 시행규칙 §17의3② 사업연도 1년 미만 환산
- U-7 §55③ 영업권 자산 가산 (§54④ 1호·3호·결손법인 제외 단서 포함)
- U-8 §55① 후단 장부가액 비교

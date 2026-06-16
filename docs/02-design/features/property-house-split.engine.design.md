# property-house-split.engine.design — 재산세 §107①2호 산출세액 안분 (엔진 설계)

- 계획서: `docs/00-pm/property-house-split-107-1-2.plan.md`
- 법령: 지방세법 §107①2호(주택 건물·부속토지 소유자 분리) + §4①②(시가표준액). MST 282559 검증 완료.
- 성격: **산출세액 안분** (과세표준·세율 불변). 공유 안분(`distributeCoOwnershipTax`)과 동일 단계.

## 1. 입력 타입

```ts
// PropertyTaxInput.taxpayerInfo 에 추가 (4필드)
isHouseSplit?: boolean;   // §107①2호 — 주택 건물·부속토지 소유자 분리
buildingOwner?: string;   // 건축물 소유자
landOwner?: string;       // 부속토지 소유자
landStdValue?: number;    // 부속토지 시가표준액 (§4① 개별공시지가) — 신규
// 건축물 시가표준액 = 기존 PropertyTaxInput.housingBuildingValue (§146④) 재사용

// PropertyObjectInput 에 추가 (determineTaxpayer Pick·주입 전용)
buildingStdValue?: number;  // calc가 housingBuildingValue 주입
landStdValue?: number;      // calc가 taxpayerInfo.landStdValue 전달
```

`determineTaxpayer` Pick 확장: `isHouseSplit`·`buildingOwner`·`landOwner`·`buildingStdValue`·`landStdValue` 추가.

## 2. 결과 타입

```ts
// PropertyTaxResult — coOwnershipDistribution(:339) 다음에 추가
houseSplitDistribution?: {
  buildingOwner: string; buildingStdValue: number; buildingTaxAmount: number; buildingTotalAmount: number;
  landOwner: string;     landStdValue: number;     landTaxAmount: number;     landTotalAmount: number;
  buildingRatio: number; // 표시용 (0~1)
};
// PropertyTaxpayerType += "building_owner" | "land_owner"
// PropertyTaxResult.taxpayer.type = 시가표준액 큰 쪽
```

## 3. 케이스 인벤토리 (행≥1)

| # | 케이스 | 입력 (hbV=housingBuildingValue) | 대표 type | 안분 (본세 기준) | 결과 |
|---|---|---|---|---|---|
| C1 | 건물>토지 | isHouseSplit, hbV=6억, landStd=4억 | building_owner | 건물 ×0.6, 토지 ×0.4 | houseSplitDistribution |
| C2 | 토지>건물 | hbV=4억, landStd=6억 | land_owner | 건물 ×0.4, 토지 ×0.6 | " |
| C3 | 동률 | hbV=5억, landStd=5억 | building_owner (≥) | 각 0.5 | " |
| C4 | landStd 미입력 | isHouseSplit, landStd 없음 | — | **validate 차단** (안분 불가) | (계산 전 차단) |
| C5 | hbV 미입력 | isHouseSplit, hbV 없음 | — | **validate 차단** | (계산 전) |
| C6 | isHouseSplit=false | (미입력) | — | 안분 없음 | undefined (기존 불변) |
| C7 | floor 잔액 | hbV=1, landStd=2, determinedTax=100,001 | land_owner | building=floor(100001×1/3)=33,333 / land=66,668 (잔액) | 합=100,001 |
| C8 | overflow | hbV=50억, landStd=50억, determinedTax=3천만 | building_owner | safeMultiply 경로 | 합 정확 |

## 4. 알고리즘 (안분 헬퍼 `buildHouseSplitOutcome`)

```
sum = buildingStd + landStd                         // > 0 (validate 보장)
representative = buildingStd >= landStd ? building_owner : land_owner

// 분수 정수 연산 — determinedTax × buildingStd 가 MAX_SAFE 초과 가능(고가주택, ~10^17)
// → BigInt 전체 연산(곱→나눗셈→floor) 후 Number. (feedback_safemul_decimal_apportion_precision)
buildingTax  = Number(BigInt(determinedTax) * BigInt(buildingStd) / BigInt(sum))  // BigInt 나눗셈 = floor(양수)
landTax      = determinedTax - buildingTax           // 잔액 흡수 (feedback_floor_residual_absorption)
buildingTotal= Number(BigInt(totalPayable) * BigInt(buildingStd) / BigInt(sum))
landTotal    = totalPayable - buildingTotal
buildingRatio= buildingStd / sum                     // 표시용 소수
```

- **BigInt 전체 연산 필수 근거**: 고가주택 산출세액(수천만, ~10^7) × 시가표준액(수십억, ~10^10) = ~10^17 > `Number.MAX_SAFE_INTEGER`(9.007×10^15). Number 직접 곱·`safeMultiply`(곱 결과를 number로 반환) 모두 /sum 단계에서 재손실 → 안분 합 ±오차. **`Number(BigInt(a)*BigInt(b)/BigInt(sum))`** 로 곱·나눗셈을 BigInt에서 완결한 뒤 마지막에만 Number 변환.
- floor 후 잔액은 반대편(landTax = determinedTax − buildingTax)이 흡수 → 합 = determinedTax 보장.

## 5. 엔진 통합 (calculatePropertyTax 주택 main return)

```
// Step 0 확장: house_split이면 determineTaxpayer에 buildingStdValue 주입
const taxpayerResult = input.taxpayerInfo
  ? determineTaxpayer({
      ...input.taxpayerInfo,
      buildingStdValue: input.taxpayerInfo.isHouseSplit ? input.housingBuildingValue : undefined,
    })
  : undefined;

// 주택 main return(746)에서만 — buildTaxpayerOutcome(공유)와 배타
// house_split이면 buildHouseSplitOutcome(determinedTax, totalPayable, hbV, landStd), 아니면 기존 buildTaxpayerOutcome
```
- land 경로(별도/분리/종합합산 early-return)에는 house_split 없음 (주택 전용).

## 6. 동기화 지점 (엔진측)
- legal-codes: `TAXPAYER_HOUSE_SPLIT = "지방세법 §107①2호"`.
- PropertyTaxpayerType +2, taxpayerInfo +4, PropertyObjectInput +2(Pick), PropertyTaxResult +houseSplitDistribution.
- determineTaxpayer 분기(②각호 뒤·①본문 앞), buildHouseSplitOutcome 헬퍼.

## 7. anchor (Pre-Do)
- A-1: determineTaxpayer house_split → building_owner(6억>4억).
- A-2: calculatePropertyTax → buildingTax+landTax==determinedTax, buildingTotal+landTotal==totalPayable, buildingRatio==0.6.
- A-3: isHouseSplit 미입력 → houseSplitDistribution undefined + 기존 세액 불변.
- A-4(C8 overflow): hbV=50억·landStd=50억·고가주택 → 안분 합 정확(safeMultiply 검증).

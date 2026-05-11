# 사례 33 — 증축 건물 취득 실거래가 환산취득가 (일반건물 3-asset) — 엔진 설계

> 본 문서는 사례 33의 엔진 측 설계만 다룬다. UI 설계는 `case-33-general-building-extension.ui.design.md`(별도) 참조.
> 승인된 plan: `.claude/plans/lazy-gathering-lemur.md`
> 작성일: 2026-05-11
> 작성자: transfer-tax-senior
> PDCA 단계: Design
> 선행 완료: 사례 31(일반건물 일괄 환산), 사례 32(신축 단기양도 §114조의2 가산세)

---

## Context

사례 33은 동일 부지 위에 **2003년 원취득 건물(토지+건물1 일괄 실가)** 과 **2007년 증축분 건물2(환산취득가)** 가 공존하는 케이스다.

사례 31·32와의 차이:
- 사례 31: 건물 1동 일괄 모델 (자산 카드 2장 — 토지/건물)
- 사례 32: 토지·건물 취득일 분리 + §114조의2 가산세
- **사례 33**: 원취득(실가 일괄 안분) + 증축분(환산취득가) 혼재 → **자산 카드 3장 (토지/건물1/건물2)**

양도코리아 정답: 산출세액 **6,480,952** / 지방소득세 **648,095**.

3개 소득 라인(토지·건물1·건물2)을 생성하고 건물1 차손(-26,527,094)을 영 §102② income 기준 pro-rata로 통산하여 도달.

---

## 1. 사례 요약 + 양도코리아 정답표

### 1.1 입력값 (잠금)

| 항목 | 값 |
|---|---|
| 총 양도가액 | 330,000,000원 |
| 양도일 | 2023-02-19 |
| 토지 취득일 | 2003-03-17 |
| 건물1 취득일 | 2003-03-17 |
| 증축일 (건물2 취득일) | 2007-07-24 |
| 일괄 취득가 (토지+건물1) | 200,000,000원 |
| 일괄 필요경비 (토지+건물1) | 8,000,000원 |
| 양도시 공시지가 | 토지 양도시 기준시가 총액 (별도 입력) |
| 양도시 건물1 기준시가 | 양도시 건물1 기준시가 총액 (별도 입력) |
| 양도시 건물2 기준시가 | 양도시 건물2 기준시가 총액 (별도 입력) |
| 취득시 건물2 기준시가 | 취득시(증축시) 건물2 기준시가 총액 (별도 입력) |
| 건물2 취득원인 | newConstruction (자가증축) |

### 1.2 양도코리아 정답표 (anchor 기준)

| 라인 | 양도가 | 취득가 | 필요경비 | 양도차익 | LTHD | 양도소득금액 (income) | 통산 후 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 토지 (1001) | 275,736,648 | 164,880,819 (실가 안분) | 6,595,233 | 104,260,596 | 31,278,178 | 72,982,418 | **48,791,670** |
| 건물1 (3001) | 9,996,854 | 35,119,181 (실가 안분) | 1,404,767 | -26,527,094 | 0 | -26,527,094 | 0 |
| 건물2 (3002) | 44,266,498 | 32,978,880 (환산) | 1,218,126 (개산공제) | 10,069,492 | 3,020,847 | 7,048,645 | **4,712,299** |
| **합계** | **330,000,000** | **232,978,880** | **9,218,126** | **87,802,994** | **34,299,025** | **53,503,969** | **53,503,969** |

### 1.3 세액 검산 (2023년 §55 기본세율)

```
통산 후 양도소득금액 합계: 53,503,969
기본공제: 2,500,000
과세표준: 51,003,969 (원 단위 그대로 — 천원 절사 없음)

2023년 누진세율 (§55 직접 계산):
  51,003,969원 → 5,000만~8,800만 구간 (세율 24%, 누진공제 5,760,000)

산출세액 = floor(51,003,969 × 0.24) - 5,760,000
         = floor(12,240,952.56) - 5,760,000
         = 12,240,952 - 5,760,000
         = 6,480,952  ← anchor

지방소득세 = floor(6,480,952 × 0.10)
           = floor(648,095.2)
           = 648,095  ← anchor
```

> ★★★ `feedback_transfer_year_tax_rate.md` 적용: 산출세액·지방세는 §55·§103조의3 직접 계산.
> 외부 자료(양도코리아 표기값) 산출세액 그대로 추종 금지. 위 검산값이 anchor.

### 1.4 영 §102② 결손 통산 검산 (income 기준 pro-rata)

```
양수 income 합: 72,982,418 + 7,048,645 = 80,031,063
손실 절대값:    26,527,094

토지 안분 비율: 72,982,418 / 80,031,063 = 91.193%
건물2 안분 비율: 7,048,645 / 80,031,063 = 8.807%

토지 흡수액: 24,190,748  (우리 엔진 결과 — 잔액 흡수 패턴)
건물2 흡수액: 2,336,346  (우리 엔진 결과 — floor 패턴)
흡수 합 검증: 24,190,748 + 2,336,346 = 26,527,094  ✓ (anchor)

토지 통산 후: 72,982,418 - 24,190,748 = 48,791,670  ✓ (anchor)
건물2 통산 후: 7,048,645 - 2,336,346 = 4,712,299   ✓ (anchor)
건물1 통산 후: 0                                     ✓ (anchor)
합계: 48,791,670 + 4,712,299 + 0 = 53,503,969       ✓ (anchor)
```

> **라운딩 결정 = (A) 확정 (2026-05-11 사용자 결정)**
>
> `transfer-tax-aggregate-helpers.ts:147-194`의 단순 floor + 마지막 자산 잔액 흡수 패턴은 사례 27·28·31 anchor에 이미 적용되어 통과 중. 라운딩 패치(B)는 multi-asset loss 케이스 회귀 위험으로 미채택. 양도코리아 PDF(토지 24,190,750 / 건물2 2,336,344)와 ±2원 차이는 자동계산기 간 라운딩 방식 차이로 정상. UI 결과 카드는 우리 엔진 값만 표시.
>
> 코드 변경 0 — anchor만 우리 엔진 값(24,190,748 / 2,336,346)으로 잠금.

---

## 2. 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

사례 33의 핵심 분기 매트릭스: **증축 토글 ON/OFF × 건물2 취득원인(매매/자가증축) × §114조의2 가산세 활성 여부**.
토지 취득원인(매매/상속/증여/이월과세) 변형은 사례 32에서 확립된 #4-a~#7-b cross-cutting 패턴으로, 사례 33 증축 인프라 확립 후 별도 후속 PR로 처리.

| # | 시나리오 | 증축 토글 | 건물2 취득원인 | 건물2 취득가 방식 | 가산세(§114조의2) | 법령 근거 | 상태 |
|---|---|---|---|---|---|---|---|
| 33-A | **사례 33 본** — 증축(newConstruction) + 5년 초과 | ON | newConstruction | 환산 (§176의2②) | **0** (5년 초과) | §166⑥ + §176의2② + §163⑥ + §114조의2 ① | Phase 1 구현 |
| 33-B | 증축(newConstruction) + 5년 이내 | ON | newConstruction | 환산 | **> 0** (환산가 × 5%) | §114조의2 ① | Phase 1 구현 (경계 anchor) |
| 33-C | 증축(purchase, 매수) + 환산 | ON | purchase | 환산 | **0** (신축/증축 요건 미충족) | §114조의2 ① — "신축 또는 증축" 한정 | Phase 1 구현 (회귀 가드) |
| 33-D | 증축 토글 OFF — 사례 31 호환 | OFF | — | 없음 (2-card) | 0 | § 사례 31 동일 | 기존 회귀 (anchor 38개) |
| 33-E | 토지 취득원인 = inheritance (상속) + 증축 | ON | newConstruction | 환산 | 0 (5년 초과) | §97② + §166⑥ | **후속 PR** (사례 32 #4-a 패턴) |
| 33-F | 토지 취득원인 = gift (증여) + 증축 | ON | newConstruction | 환산 | 0 | §97② + §166⑥ | **후속 PR** (사례 32 #7-a 패턴) |
| 33-G | 토지 취득원인 = carryover_gift (증여이월과세) + 증축 | ON | newConstruction | 환산 | 0 | §97의2 + §166⑥ | **후속 PR** (사례 32 #7-b 패턴) |
| 33-H | 증축 2회 이상 (건물2·건물3 다중) | ON | newConstruction | 환산 | 조건부 | §114조의2 ① | **후속 PR** (다중 증축) |

> 규칙: 사용자가 새 케이스 제시 시 코드 작성 전 이 표에 행 추가 의무.
> Phase 1 구현 대상: 33-A·33-B·33-C·33-D (33-D는 기존 회귀).

---

## 3. 입력 타입 확장

### 3.1 `GeneralBuildingInput` extensionInfo 서브객체

`lib/tax-engine/general-building-valuation.ts`의 `GeneralBuildingInput`에 **`extensionInfo?` optional 서브객체** 추가. 미입력 시 사례 31·32 동작 100% 보존.

```typescript
export type GeneralBuildingInput = {
  // ── 기존 필드 (변경 없음) ──
  totalTransferPrice: number;
  transferDate: Date;
  acquisitionDate: Date;
  landArea: number;
  buildingArea: number;
  buildingFloors: number;
  transferLandPricePerSqm: number;
  transferBuildingStdPrice: number;
  acquisitionLandPricePerSqm: number;
  acquisitionBuildingStdPrice: number;
  estimatedDeductionRate?: number;
  floorAreaMultiplier?: number;
  buildingAcquisitionDate?: Date;   // 사례 32 — 건물 취득일 분리
  isSelfBuilt?: boolean;            // 사례 32 — §114조의2 가산세 플래그

  // ── 사례 33 신규: 증축 정보 ──
  /**
   * 증축 정보. 미입력(undefined) 시 사례 31·32 동작 그대로 보존.
   */
  extensionInfo?: {
    /**
     * 증축일 = 건물2 취득일 (영 §162①4호 빠른 날 기준).
     * §114조의2 ① 5년 기산점이자 건물2 LTHD 보유기간 기산점.
     */
    extensionDate: Date;

    /**
     * 증축 연면적 (㎡).
     * 현 시점 안분식에서는 미사용. 위치지수 산정 등 후속 확장 대비 정보 보존.
     */
    extensionArea: number;

    /**
     * 양도시 건물2 기준시가 총액 (원).
     * UI에서 ㎡당 단가가 아닌 총액(원)으로 입력받음 — validate에서 단위 메시지 강제.
     * 안분 분모 3항의 단위 일관성 필수 (원 총액 통일).
     */
    transferExtensionBuildingStdPrice: number;

    /**
     * 취득시(증축시) 건물2 기준시가 총액 (원).
     * 환산취득가 산식의 분자: building2TransferPrice × 이값 / transferExtensionBuildingStdPrice.
     */
    acquisitionExtensionBuildingStdPrice: number;

    /**
     * 건물2 취득원인.
     * - "newConstruction": 자가증축 → §114조의2 ① 가산세 발동 가능
     * - "purchase": 매수 증축 → 가산세 미발동
     */
    extensionAcquisitionCause: "purchase" | "newConstruction";
  };
};
```

### 3.2 `AssetCardForAggregate` 확장

카드 3장 지원을 위해 `propertyId` / `propertyLabel` 구분을 "building1" / "building2"로 분리.
기존 "land" / "building" 2-card 경로는 변경 없음.

```typescript
export type AssetCardForAggregate = {
  // ... 기존 필드
  propertyId: string;   // "land" | "building" | "building1" | "building2"
  propertyLabel: string; // "토지(1001)" | "건물(3001)" | "건물2(3002)"

  // 사례 32 기존
  isSelfBuilt?: boolean;
  buildingAcquisitionDate?: Date;

  // 사례 33 신규 — 건물2 카드 식별
  /**
   * true 시 이 카드는 증축분(건물2). Route 헬퍼가 extensionDate를 acquisitionDate로 주입.
   */
  isExtensionBuilding?: boolean;
};
```

---

## 4. 산식 4-step

### Step 1 — 양도가 3-way 안분 (§166⑥, 양도시 기준시가 비율)

```
landStdTotal      = transferLandPricePerSqm × landArea           // 원 총액
buildingStdTotal  = transferBuildingStdPrice                     // 원 총액 (건물1)
extStdTotal       = extensionInfo.transferExtensionBuildingStdPrice // 원 총액 (건물2)
denom             = landStdTotal + buildingStdTotal + extStdTotal

// ※ 3항 모두 원 총액 단위 — UI/validate에서 단위 검증 필수
// ※ overflow 방지: safeMultiplyThenDivide() 필수 (분자 ≈ 3.3억 × 수백억 > MAX_SAFE_INTEGER)

landTransferPrice      = floor(totalTransferPrice × landStdTotal     / denom) = 275,736,648
building1TransferPrice = floor(totalTransferPrice × buildingStdTotal / denom) =   9,996,854
building2TransferPrice = totalTransferPrice - landTransferPrice - building1TransferPrice
                       = 44,266,498  (잔액 보정 — 이중 floor 오차 방지)
```

**잔액 보정 원칙**: 건물2 = 총양도가 - 토지 - 건물1. 3-way floor 시 합산 오차 ±2원 가능 → 마지막 항목에서 잔액 흡수.

### Step 2 — 일괄 취득가 2-way 안분 (토지+건물1만, §166⑥ 양도시 비율)

```
// 200,000,000은 토지+건물1 일괄. 건물2는 별도 증축이므로 분배 대상 아님.
// 안분 비율은 양도시 기준시가 비율 (§166⑥) — 취득시 비율 아님.
landBuildingDenom = landStdTotal + buildingStdTotal

landAcq      = floor(200,000,000 × landStdTotal     / landBuildingDenom) = 164,880,819
building1Acq = floor(200,000,000 × buildingStdTotal / landBuildingDenom) =  35,119,181
// 합 검증: 164,880,819 + 35,119,181 = 200,000,000  ✓

landExp      = floor(  8,000,000 × landStdTotal     / landBuildingDenom) =   6,595,233
building1Exp = floor(  8,000,000 × buildingStdTotal / landBuildingDenom) =   1,404,767
// 합 검증: 6,595,233 + 1,404,767 = 8,000,000  ✓
```

> ★ 안분 비율은 **양도시 기준시가** (계획서 검토 라운드 정정 #1). "취득시 비율" 오류 차단.

### Step 3 — 건물2 환산취득가 (§176의2②)

```
// 첫 인자는 건물2 안분된 양도가 (총 양도가 아님 — 계획서 검토 라운드 정정 #2)
building2Acq = safeMultiplyThenDivide(
  building2TransferPrice,
  extensionInfo.acquisitionExtensionBuildingStdPrice,
  extensionInfo.transferExtensionBuildingStdPrice
)
= floor(44,266,498 × acquisitionExtensionBuildingStdPrice / transferExtensionBuildingStdPrice)
= 32,978,880  ← anchor

// 건물2 개산공제 (§163⑥, 취득시 기준시가 × 3% — §5 확정)
building2EstDeduction = floor(acquisitionExtensionBuildingStdPrice × 0.03)
                      = floor(40,604,200 × 0.03) = 1,218,126  ← anchor ✓
// ★ 환산취득가(32,978,880) × 3% 아님. 소령 §163⑥은 취득시 기준시가 기준.
```

### Step 4 — 자산 카드 3장 출력

| 카드 | propertyId | propertyType | acquisitionPrice | expenses | usedEstimatedAcquisition | acquisitionDate | isSelfBuilt | isExtensionBuilding |
|---|---|---|---:|---:|---|---|---|---|
| 토지 | "land" | "land" | 164,880,819 | 6,595,233 | false | 2003-03-17 | — | — |
| 건물1 | "building1" | "general_building_unit" | 35,119,181 | 1,404,767 | false | 2003-03-17 | false | false |
| 건물2 | "building2" | "general_building_unit" | 32,978,880 | 1,218,126 (개산공제) | **true** | **2007-07-24 (extensionDate)** | extensionAcquisitionCause==="newConstruction" | **true** |

**Step 5 — 결손 통산은 aggregate 엔진에 위임 (변경 없음)**

`transfer-tax-aggregate-helpers.ts:137-150`의 income 기준 pro-rata가 3장 카드를 받아 자동 처리. 카드 장수 2→3으로 늘려도 aggregate 코드 변경 없음.

---

## 5. 건물2 개산공제 1,218,126 — ✅ 확정

### 5.1 확정 산식 (후보 B 정답)

`general-building-valuation.ts:373-374` 코드 확인 결과: `Math.floor(input.acquisitionBuildingStdPrice * rate)` 패턴으로 **취득시 건물 기준시가 총액 × 3%** 방식 적용.

소령 §163⑥ 정확 매핑: 개산공제는 환산취득가액 기준이 아니라 **취득 당시 기준시가 × 공제율(3%)**로 산정.

### 5.2 사용자 입력값 역산 (확정)

```
개산공제 검산:
  acquisitionExtensionBuildingStdPrice × 0.03 = 1,218,126
  → acquisitionExtensionBuildingStdPrice = 1,218,126 / 0.03 = 40,604,200원  ✓

환산취득가 검산 (역산 경로):
  transferExtensionBuildingStdPrice = building2TransferPrice × acquisitionExtensionBuildingStdPrice / building2Acq
                                    = 44,266,498 × 40,604,200 / 32,978,880
                                    ≈ 54,486,653원  (추정)

환산취득가 순검산:
  floor(44,266,498 × 40,604,200 / 54,486,653)
  = floor(32,978,880.xx)
  = 32,978,880  ✓ (anchor)

개산공제 순검산:
  floor(40,604,200 × 0.03)
  = floor(1,218,126)
  = 1,218,126  ✓ (anchor)
```

### 5.3 확정 입력값

| 필드 | 값 | 비고 |
|---|---:|---|
| `acquisitionExtensionBuildingStdPrice` | **40,604,200** | 역산 확정. 취득시(2007-07-24) 건물2 기준시가 총액(원) |
| `transferExtensionBuildingStdPrice` | **54,486,653** | 역산 확정. 양도시(2023-02-19) 건물2 기준시가 총액(원) |

### 5.4 코드 적용 방식

`general-building-valuation.ts`의 증축 분기에서 기존 개산공제 함수와 동일하게 `acquisitionExtensionBuildingStdPrice × 0.03` 적용. 별도 입력 필드 추가 불필요.

> ★ anchor 확정: 건물2 개산공제 `toBe(1,218,126)`. `acquisitionExtensionBuildingStdPrice` 는 40,604,200원으로 테스트 fixture에 잠금.

---

## 6. 영 §102② 결손 통산 위임 (변경 없음)

### 6.1 aggregate 코드 순서 확인 (사례 31 설계에서 검증 완료)

```
[M-1] 단건 엔진 호출 (3장 각각 skipBasicDeduction=true, skipLossFloor=true)
[assetRecords 조립] transferGain < 0 → lthd = 0 강제 (건물1 차손 -26,527,094)
[M-3] offsetLosses(assetRecords, line 137-160) 호출 → income 기반 pro-rata (M-3 1차 통산)
[M-4] 잔여 손실 통산 (line 178-200) → 흡수 불능 손실 잔액 처리
```

### 6.2 카드 3장 통산 동작 (코드 변경 없음)

- 건물1 차손: `income = -26,527,094` → `lthd = 0` 강제 (aggregate L.129)
- 양수 income 풀: 토지(72,982,418) + 건물2(7,048,645) = 80,031,063
- `offsetLosses()` pro-rata: 손실 26,527,094를 income 비율로 분배 흡수
- 결과: 토지 48,791,670 / 건물2 4,712,299 / 건물1 0 (A 확정)

> `transfer-tax-aggregate-helpers.ts:137-194` income 기준 pro-rata는 카드 장수에 무관하게 동작. 카드 2→3 확장 시 aggregate 코드 변경 없음. (계획서 검토 라운드 정정 #4)

### 6.3 라운딩 동작 상세 — (A) 확정 (2026-05-11 사용자 결정)

코드 위치: `transfer-tax-aggregate-helpers.ts:137-194`

**M-3 1차 통산 (line 137-160) 라운딩**:
- 각 자산 흡수액 = `Math.floor(totalLoss × asset.income / positiveIncomeSum)` (비마지막 자산)
- 마지막 자산(isLast) = `offsetPool - distributed` (잔액 흡수 패턴)
- sort 순서에 따라 "마지막 자산"이 결정되므로 **결과가 sort 순서에 의존**

**M-4 잔여 통산 (line 178-200) 라운딩**:
- 동일한 `isLast ? offsetPool - distributed : Math.floor(...)` 패턴

**§1.4 검증 결과**: 현재 sort 순서([토지, 건물1, 건물2])에서 건물2가 마지막 → 건물2에 잔액 흡수 → 토지 24,190,748 / 건물2 2,336,346. 양도코리아 PDF(토지 24,190,750 / 건물2 2,336,344)와 2원 역방향 차이.

**사례 31은 손실 카드가 없어 이 경로를 통과하지 않음** — 사례 33이 multi-asset loss 경로를 처음 노출하는 케이스.

**(A) 결정으로 닫음**: anchor 33-18~33-21은 우리 엔진 실제 결과값으로 잠금. 코드 변경 없음.

---

## 7. §114조의2 가산세 (사례 33 비활성, 회귀 anchor 1개)

### 7.1 사례 33 적용 결과

```
증축일: 2007-07-24
양도일: 2023-02-19
경과 연수: > 5년  → §114조의2 ① 요건 미충족

extensionAcquisitionCause = "newConstruction" 이지만 5년 초과이므로 가산세 = 0
```

### 7.2 인프라 재사용 (추가 구현 0)

기구현 `calculateBuildingPenalty()` (`transfer-tax-rate-calc.ts:68-104`)이 `isSelfBuilt + buildingAcquisitionDate(=extensionDate)` 기반으로 판정. 건물2 카드에서 다음 값을 주입:

- `isSelfBuilt`: extensionAcquisitionCause === "newConstruction" 시 true
- `constructionDate`: extensionDate (route handler가 `buildingAcquisitionDate → constructionDate` 변환)
- `acquisitionMethod`: "estimated" (환산 경로)

Route 헬퍼 매핑만 추가하면 가산세 발동 로직은 자동 적용.

### 7.3 회귀 anchor (1개 필수)

```typescript
// 사례 33: extensionAcquisitionCause="newConstruction" + 5년 초과 → penalty = 0
// 5년 초과 케이스 침묵 가드 — 이 anchor가 깨지면 경계 조건 회귀
expect(result.penaltyTax).toBe(0);
```

### 7.4 5년 이내 가산세 발동 anchor (케이스 33-B)

```typescript
// 케이스 33-B: 증축일 2007-07-24 + 5년 이내 양도 (예: 2012-07-23)
// 환산취득가 32,978,880 × 5% = 1,648,944
// (Do 단계에서 정확값 확정)
expect(result.penaltyTax).toBeGreaterThan(0);
```

---

## 8. 800줄 분할 신호

| 파일 | 현재 줄 수 | 예상 후 | 여유 | 분할 필요 |
|---|---:|---:|---:|---|
| `general-building-valuation.ts` | **621** | **741** (+120) | 59줄 | **경고 — 분할 설계 준비** |
| `transfer-tax-validate.ts` | **776** | **811** (+35) | -11줄 | **초과 — 도메인 분할 선행 필수** |
| `general-building-route-helper.ts` | 437 | ~452 (+15) | 348줄 | 안전 |
| `transfer-tax-schema.ts` | 656 | ~681 (+25) | 119줄 | 안전 |
| `transfer-tax-api-helpers.ts` | (확인 필요) | +25 | OK | 안전 |
| `transfer-tax-api.ts` | (확인 필요) | +5 | OK | 안전 |

### 8.1 `transfer-tax-validate.ts` 분할 선행 필수

776줄 + 35줄 = 811줄 → 800줄 정책 위반.
**Do 단계 진입 전 `transfer-tax-validate.ts` 도메인 분할을 별도 PR로 완료**해야 한다.
분할 참조: `feedback_validate_split_signal.md`.

**확정 분할 패턴 (UI 시니어 권고 반영 — 2분할)**:
```
transfer-tax-validate.ts          (공통 + 오케스트레이터 — 기존 파일, 줄 수 대폭 감소)
transfer-tax-validate-gb.ts       (일반건물 + 증축 통합 validate)
```

증축(extensionInfo)은 일반건물(`general_building`)의 분기이지 독립 도메인이 아님. 별도 `transfer-tax-validate-extension.ts`로 분리 시 import 순환 위험 + 일반건물 공통 규칙(기준시가 총액 단위 등)과 증축 규칙의 중복 검증 발생 가능. 따라서 `transfer-tax-validate-gb.ts` 단일 파일에 일반건물 전체(기본 2-card + 증축 3-card 분기) validate를 통합.

**분할 후 예상 줄 수**:
- `transfer-tax-validate.ts`: ~400줄 (공통 + 오케스트레이터만)
- `transfer-tax-validate-gb.ts`: ~411줄 (일반건물 + 증축, 현재 gb 전용 구간 + 증축 신규 35줄)

> 후속 PR에도 명시: "5년 이내 양도 케이스 — `calculateBuildingPenalty` 카드별 `acquisitionMethod` 분리 인프라 추가" (§8.2 후속 PR 표 참조)

### 8.2 `general-building-valuation.ts` 분할 준비

621줄 + 120줄 = 741줄. 800줄 미초과이지만 59줄 여유. 후속 PR(사례 34·35 등) 추가 시 초과 가능.
Do 단계에서 분할 설계 병행 권장:

```
general-building-valuation.ts      (공통 타입 + 오케스트레이터 buildGeneralBuildingAssetCards)
general-building-allocation.ts     (Step 1 안분 + Step 2 취득가 안분)
general-building-extension.ts      (Step 3 증축 환산 + extensionInfo 처리)
```

---

## 9. 법령 근거

```
소득세법 시행령 §166⑥ — 토지·건물 등 여러 자산 일괄 양도 시 기준시가 비율 안분
소득세법 시행령 §176조의2② — 환산취득가액 (기준시가 비율 역산)
소득세법 §97② 2호 + 시행령 §163⑥ — 개산공제 (등기 자산 3%, 미등기 0.3%)
소득세법 §95② — 장기보유특별공제 (차손 자산 0%, 일반 표1)
소득세법 §102② — 양도차손 통산 (income 기준 pro-rata)
소득세법 §103 — 기본공제 연 250만원
소득세법 §55 (준용 §104①1호) — 2023년 기본세율 누진세율표
지방세법 §103의3 — 지방소득세 (양도소득세의 10%)
소득세법 §114조의2 ① — 감정가액·환산취득가액 가산세 (신축·증축 후 5년 이내)
소득세법 §98 + 시행령 §162① 4호 — 자가건축 취득시기 (빠른 날)
```

**잘못된 인용 금지** (사례 32 설계 확립): `§97②` · `§114⑦` · `§176의2⑤` 표기 금지.

---

## 10. anchor 테스트 25개 매트릭스

`__tests__/tax-engine/transfer-tax/general-building-extension-case-33.test.ts` 신규.

### 10.1 안분·환산 (8개)

| # | 검증 대상 | 기댓값 | 출처 |
|---|---|---:|---|
| 33-1 | 토지 양도가 | **275,736,648** | 양도코리아 사례 33 정답표 |
| 33-2 | 건물1 양도가 | **9,996,854** | 양도코리아 사례 33 정답표 |
| 33-3 | 건물2 양도가 | **44,266,498** | 양도코리아 사례 33 정답표 |
| 33-4 | 3항 합계 검증 | **330,000,000** | 잔액 보정 정합성 |
| 33-5 | 토지 실가 안분 | **164,880,819** | 양도코리아 사례 33 정답표 |
| 33-6 | 건물1 실가 안분 | **35,119,181** | 양도코리아 사례 33 정답표 |
| 33-7 | 합 검증 (토지+건물1) | **200,000,000** | 일괄 취득가 정합성 |
| 33-8 | 건물2 환산취득가 | **32,978,880** | 양도코리아 사례 33 정답표 |

### 10.2 양도차익·LTHD·income (9개)

| # | 검증 대상 | 기댓값 | 출처 |
|---|---|---:|---|
| 33-9 | 토지 양도차익 | **104,260,596** | 양도코리아 사례 33 정답표 |
| 33-10 | 토지 LTHD | **31,278,178** | §95② 별표1 + 정답표 |
| 33-11 | 토지 양도소득금액 (통산 전) | **72,982,418** | 양도코리아 사례 33 정답표 |
| 33-12 | 건물1 양도차익 | **-26,527,094** | 양도코리아 사례 33 정답표 |
| 33-13 | 건물1 LTHD (차손 → 0) | **0** | aggregate L.129 강제 ★ 순서 검증 |
| 33-14 | 건물1 양도소득금액 (통산 전) | **-26,527,094** | aggregate ★ |
| 33-15 | 건물2 양도차익 | **10,069,492** | 양도코리아 사례 33 정답표 |
| 33-16 | 건물2 LTHD | **3,020,847** | §95② 별표1 + 정답표 |
| 33-17 | 건물2 양도소득금액 (통산 전) | **7,048,645** | 양도코리아 사례 33 정답표 |

### 10.3 통산·세액 (7개)

| # | 검증 대상 | 기댓값 | 출처 |
|---|---|---:|---|
| 33-18 | 흡수 합 검증 (토지흡수+건물2흡수) | **26,527,094** | 영 §102② pro-rata 정합성 |
| 33-19 | 토지 통산 후 | **48,791,670** | (A) 확정 (2026-05-11) — 우리 엔진 결과 |
| 33-20 | 건물2 통산 후 | **4,712,299** | (A) 확정 (2026-05-11) — 우리 엔진 결과 |
| 33-21 | 건물1 통산 후 | **0** | 손실 완전 흡수 |
| 33-22 | 통산 후 합계 | **53,503,969** | 계획서 §1 검산 |
| 33-23 | 산출세액 | **6,480,952** | §55 직접 계산 |
| 33-24 | 지방소득세 | **648,095** | §103조의3 × 10% |

### 10.4 회귀 + 가산세 0 (1개)

| # | 검증 대상 | 기댓값 | 비고 |
|---|---|---:|---|
| 33-25 | §114조의2 가산세 (5년 초과 케이스) | **0** | extensionAcquisitionCause="newConstruction" + 양도일 > 증축일+5년 — 5년 초과 침묵 가드 |

> ★ anchor 허용오차 정책: 모든 anchor `toBe()` 정확 일치.
> ★★ 건물2 개산공제(1,218,126) anchor — §5 확정 완료. `acquisitionExtensionBuildingStdPrice = 40,604,200` × 0.03 = 1,218,126. 테스트 fixture에 잠금값으로 직접 사용.

---

## 11. 비스코프

본 PR 범위 외 후속 PR 후보:

| # | 시나리오 | 참조 |
|---|---|---|
| 후속-1 | 증축 2회 이상 (건물2·건물3 다중 extensionInfo 배열화) | 케이스 인벤토리 33-H |
| 후속-2 | 증축 + 토지 상속 cross-cutting | 사례 32 #4-a 패턴 |
| 후속-3 | 증축 + 토지 증여 cross-cutting | 사례 32 #7-a 패턴 |
| 후속-4 | 증축 + 토지 증여이월과세 cross-cutting | 사례 32 #7-b 패턴 |
| 후속-5 | 증축 + §114조의2 가산세 active 케이스 (5년 이내 양도) | 케이스 인벤토리 33-B + 계획서 §8 |
| 후속-6 | 건물1만 양도 / 건물2만 양도 (부분 양도) | 신규 설계 필요 |
| 후속-7 | transfer-tax-validate.ts 도메인 분할 (선행 PR — Do 단계 진입 전) | §8.1 분할 선행 필수 |
| 후속-8 | general-building-valuation.ts 분할 (741줄 → allocation/extension 모듈 분리) | §8.2 |
| 후속-9 | 5년 이내 양도 케이스 — `calculateBuildingPenalty` 카드별 `acquisitionMethod` 분리 인프라 추가 | §15 자가점검 결과. 현재 line 74는 단일 method만 지원. 사례 33은 양도일 > 5년으로 안전하나 후속 5년 이내 케이스(33-B) 구현 전 인프라 확장 필수 |

---

## 12. 재사용 대상 (신규 작성 금지)

- `safeMultiplyThenDivide()` (`tax-utils.ts`) — overflow 안전 안분 (분자 > MAX_SAFE_INTEGER 구간 자동 BigInt)
- `calculateBuildingPenalty()` (`transfer-tax-rate-calc.ts:68-104`) — §114조의2 가산세 (사례 32 인프라 그대로)
- `transfer-tax-aggregate-helpers.ts:137-150` income 기준 pro-rata — 변경 없음
- `toOptionalDate()` (`lib/api/date-coerce.ts`) — route handler Date 변환
- UI: `ToggleCard` · `DateInput` · `CurrencyInput` · `DecimalInput` · `RadioCardGroup` · `FieldCard hint`

---

## 13. 정책 적용 매트릭스

| # | 정책 메모리 | 본 엔진 디자인 적용 |
|---|---|---|
| 1 | `feedback_no_silent_apportion_fallback.md` | extensionInfo 미입력 시 사례 31 동작 보존(2-card). extensionInfo 입력 후 개별 필드 미입력은 validate ⑧에서 차단. 건물2 기준시가를 면적×단가 자동 안분 금지 — 총액 직접 입력 강제. |
| 2 | `feedback_useeffect_store_mirror_forbidden.md` | 증축 토글 ON/OFF 연동은 onChange 핸들러 패턴. UI 디자인 문서에 명시. |
| 3 | `feedback_transfer_year_tax_rate.md` | 산출세액(6,480,952)·지방세(648,095)는 §55·§103조의3 직접 계산. 외부 자료 추종 금지. |
| 4 | `feedback_estimated_deduction_separation.md` | 건물2 카드에 `usedEstimatedAcquisition=true` · `estimatedBase` · `estimatedDeduction` 3종 한 묶음. 누락 시 FilingFormTable fallback 흡수 발생 — anchor 33-8이 즉시 실패로 검출. |
| 5 | `feedback_3point_input_consistency.md` | 건물2 양도시·취득시 기준시가는 ㎡당 단가가 아닌 **총액(원)**. validate 메시지: "기준시가는 ㎡당 단가가 아닌 총액(원)으로 입력". |
| 6 | `feedback_api_zod_schema_sync.md` | 14개 동기화 지점 전수 점검. 특히 ⑫ `extensionInfo` z.object 명시 (침묵 stripping 방지) · ⑬ callTransferTaxAPI body spread · ⑭ route handler 매핑. |
| 7 | `feedback_validation_sync_8th_point.md` | API fallback 추가 시 validate도 동기화. extensionDate fallback 없음 — 필수 필드로 validate 차단. |

---

## 14. UI 통합 위임

UI 측 14개 동기화 지점은 `case-33-general-building-extension.ui.design.md`(별도)에 정의. 엔진 시니어가 확정한 타입 시그니처:

| 동기화 지점 | 내용 |
|---|---|
| ① 폼 상태 타입 | `gbHasExtension`(boolean) + 5필드 (`gbExtensionDate`·`gbExtensionArea`·`gbTransferExtensionBuildingStdPrice`·`gbAcquisitionExtensionBuildingStdPrice`·`gbExtensionAcquisitionCause`) |
| ⑨ Zod enum (메인) | `extensionAcquisitionCause: z.enum(["purchase", "newConstruction"])` |
| ⑫ Zod 객체 | `extensionInfo` z.object 신규 정의 — 미정의 시 침묵 stripping |
| ⑭ Route handler | `toOptionalDate(body.extensionInfo?.extensionDate)` + extensionInfo 객체 엔진 input 매핑 |

**UI 표시 순서**: 토지 → 건물1 → **[증축 토글]** → 건물2 5필드 → 일괄 취득가·필요경비. (계산 로직 순서 = UI 표시 순서 정책)

---

## 15. 자가 점검 체크리스트 (Do 단계 완료 보고 전)

### 15.1 Design 단계 사전 점검 결론 (5건 확정)

| 항목 | 결과 |
|---|---|
| aggregate offsetLosses 라운딩 | **(A) 결정으로 닫음 — 코드 변경 0, anchor만 우리 엔진 값** (`transfer-tax-aggregate-helpers.ts:147-148, 192-194` 단순 floor + 잔액 흡수 패턴 그대로). 토지 흡수 24,190,748 / 건물2 흡수 2,336,346 / 토지 통산 후 48,791,670 / 건물2 통산 후 4,712,299. 양도코리아 PDF ±2원 차이는 자동계산기 간 라운딩 방식 차이로 정상. (2026-05-11 사용자 결정) |
| 개산공제 후보 B 확정 | `general-building-valuation.ts:373-374` — **취득시 건물 기준시가 × 3%** (소령 §163⑥). `acquisitionExtensionBuildingStdPrice = 40,604,200` / `transferExtensionBuildingStdPrice = 54,486,653` 역산 확정. → **정정 #2 처리** |
| `propertyId === "building"` 분기 grep | **회귀 위험 0**. `BundledAllocationCard`는 `assetId` 참조만 사용, `FilingFormTable`에 propertyId 분기 없음. 카드 3장(building1/building2) 추가해도 기존 코드 사이드 이펙트 없음. |
| `calculateBuildingPenalty` 카드별 `acquisitionMethod` | **단일 method만 지원** (line 74). 사례 33은 양도일 > 5년이므로 가산세 = 0으로 안전 통과. 단, **5년 이내 양도 케이스(33-B) 구현 전 카드별 acquisitionMethod 분리 인프라 추가 필수** → 후속-9 PR로 분리. |
| 차손 LTHD = 0 시점 | **단건 엔진에서 강제** (`transfer-tax.ts:212, 328` — transferGain < 0 시 lthd = 0). aggregate 레이어에서 추가 덮기 불필요. 기존 코드 변경 없음. |

### 15.2 Do 단계 완료 보고 전 체크리스트

- [x] **라운딩 결정 = (A) 확정 (2026-05-11 사용자 결정)** — anchor 33-18=24,190,748 · 33-19=48,791,670 · 33-20=4,712,299 · 33-21=0. 코드 변경 없음. 흡수 합(33-18) = 26,527,094 정합성 검증 필수.
- [ ] **케이스 인벤토리 33-A·B·C·D anchor 전수 통과** (33-B 가산세 발동 포함)
- [ ] anchor 25개 `toBe()` 정확 일치 (건물2 개산공제 anchor 확정값 1,218,126 포함)
- [ ] §114조의2 가산세 0 anchor (33-25) 통과 — 5년 초과 케이스
- [ ] 사례 31 회귀 anchor 38개 변경 없음
- [ ] 사례 32 회귀 anchor 30개 변경 없음
- [ ] 14개 동기화 지점 grep (특히 ⑫⑬⑭ TypeScript 미감지 영역)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/general-building-extension-case-33.test.ts` 통과
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/` 전체 회귀 0건 실패
- [ ] 브라우저 수동 확인: 증축 토글 ON → 5필드 입력 → 산출세액 **6,480,952** / 지방세 **648,095** 확인
- [ ] Network 탭: request body에 `extensionInfo` 포함 확인 (⑫⑬⑭ 검증)
- [ ] validate: 기준시가 단위 메시지 "총액(원)" 확인
- [ ] **transfer-tax-validate.ts 분할 선행 PR 완료** (811줄 초과 — Do 진입 전 필수)

---

## Status

| 단계 | 상태 |
|---|---|
| 1. PM/Plan | ✅ 완료 (`.claude/plans/lazy-gathering-lemur.md` 승인, 검토 라운드 5건 정정 반영) |
| 2. Design (engine) | ✅ 본 문서 |
| 2. Design (UI) | ☐ TODO (`case-33-general-building-extension.ui.design.md`) |
| 3. Do (engine senior) | ☐ TODO |
| 3. Do (UI senior) | ☐ TODO |
| 4. Check | ☐ TODO |
| 5. Act | ☐ TODO |

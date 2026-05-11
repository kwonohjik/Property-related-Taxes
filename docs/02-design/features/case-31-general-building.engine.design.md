# 사례 31 — 일반건물(토지+건물 일괄) 환산취득가 · 자산별 통산 엔진 설계

> **작성일**: 2026-05-08
> **작성자**: transfer-tax-senior
> **PDCA 단계**: Design
> **선행 완료**: 사례 22(PHD 3-시점), 23(공동주택 환산), 27(지분 합산), 28(나대지+신축 일괄), 29(상업용 집합건물)
> **관련 Plan**: `docs/00-pm/case-31-general-building-conversion.plan.md`

---

## Context

예제 사례 31은 서울 동작구 사당동 132-10 근린생활시설 건물(1971년 사용승인)로, 1999년 취득 당시 실거래가 확인 불가 → 환산취득가 적용 사례다.

사례 29(상업용 집합건물 호별고시 전 역환산)와 달리 **일반건물은 토지·건물이 별도 자산으로 존재**하며, 양도가액 안분 → 자산별 환산 → 자산별 개산공제 → 자산별 차익·장특 → §102② 통산의 5단 파이프라인을 거친다. 건물 차손이 발생해 장특 0 → §102② 통산으로 토지에 흡수되는 케이스로, aggregate 통산 순서 보장이 핵심이다.

---

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

Plan §3의 17행을 그대로 이전. 통산 순서 검증용 4개 anchor(★)는 단독으로 깨지면 회귀 검출.

| # | 시나리오 | 법령 근거 | anchor 키 | 기대값 | 상태 |
|---|---------|----------|-----------|--------|------|
| 31-A1 | 양도가 안분 (토지) — 양도일 기준시가 비율 | 시행령 §166⑥ | `case31_allocation_land` | **904,725,192** | ☐ TODO |
| 31-A2 | 양도가 안분 (건물) — 잔액 보정 | 시행령 §166⑥ | `case31_allocation_building` | **20,274,808** | ☐ TODO |
| 31-B1 | 환산취득가 (토지) | 시행령 §176의2④ | `case31_acq_land` | **233,908,636** | ☐ TODO |
| 31-B2 | 환산취득가 (건물) | 시행령 §176의2④ | `case31_acq_building` | **27,660,876** | ☐ TODO |
| 31-C | 개산공제 (토지) | 시행령 §163⑥ | `case31_estimated_deduction_land` | **7,140,000** | ☐ TODO |
| 31-D | 개산공제 (건물) | 시행령 §163⑥ | `case31_estimated_deduction_building` | **844,341** | ☐ TODO |
| 31-E1 | 양도차익 (토지) | 소득세법 §94① | `case31_gain_land` | **663,676,556** | ☐ TODO |
| 31-E2 | 양도차익 (건물) — 차손 발생 | 소득세법 §94① | `case31_gain_building` | **−8,230,409** | ☐ TODO |
| 31-F1 | 보유기간 (만 23년) | 시행령 §159 | `case31_holding_years_floor` | **23** | ☐ TODO |
| 31-F2 | 장특율 (토지 일반 표1, 15년+ 상한 30%) | 소득세법 §95② | `case31_ltsd_rate_land` | **0.30** | ☐ TODO |
| 31-F3 | 장특공제 (토지) | 소득세법 §95② | `case31_ltsd_land` | **199,102,966** | ☐ TODO |
| 31-F4 ★ | 장특공제 (건물) — 차손이므로 0 | 소득세법 §95② | `case31_ltsd_building` | **0** | ☐ TODO |
| 31-G1 ★ | 양도소득금액 (건물, 통산 전) — 차손 그대로 | 소득세법 §102② | `case31_income_building_pre_offset` | **−8,230,409** | ☐ TODO |
| 31-G2 ★ | §102② 흡수액 — 토지가 건물 차손 흡수 | 소득세법 §102② | `case31_offset_amount` | **8,230,409** | ☐ TODO |
| 31-G3 ★ | 양도소득금액 (토지, 통산 후) | 소득세법 §102② | `case31_income_land_post_offset` | **456,343,181** | ☐ TODO |
| 31-H | 통산 후 양도소득금액 합계 | 소득세법 §92 | `case31_total_income` | **456,343,181** | ☐ TODO |
| 31-I | 산출세액 (2023년 §55 기본세율) | 소득세법 §104①1호 | `case31_calc_tax` | **155,597,272** | ☐ TODO |
| 31-J | 지방소득세 (산출세액 × 10%) | 지방세법 §103의3 | `case31_local_tax` | **15,559,727** | ☐ TODO |
| 31-K | 비사업용토지 판정 — 배율 내(사업용) | 시행령 §168의8 | `case31_nbl_within_ratio` | **true** | ☐ TODO |

> **anchor 허용오차 정책** (qa-lead 확정):
> - 모든 anchor: `toBe()` 정확 일치
> - 사용자 BigInt 정밀 검산으로 양도시 건물기준시가 = **20,629,440** 확정 → Plan 원본 17종 anchor 전원 `toBe()` 정확값 복원 (±10원 완화 철회)

---

## A) aggregate 순서 Grep 검증 (★★★ 가장 중요)

### 검증 대상 파일

- `lib/tax-engine/transfer-tax-aggregate.ts`
- `lib/tax-engine/transfer-tax-aggregate-helpers.ts`

### 순서 보장 확인

`transfer-tax-aggregate.ts` 코드 분석 결과:

```
[M-1] 단건 엔진 호출 (skipBasicDeduction=true, skipLossFloor=true)
       → calculateTransferTax() 내부에서 자산별 차익·장특·소득금액 계산

[assetRecords 조립] (L.122~136)
       → transferGain < 0 이면: taxableGain = transferGain, lthd = 0, income = transferGain
       → transferGain >= 0 이면: income = taxableGain - lthd

[M-3] offsetLosses(assetRecords) 호출 (L.139~145)
       → records[i].income 기반 (장특 적용 후 양도소득금액)
```

**핵심 라인 (L.128~135)**:
```typescript
const transferGain = pa.result.transferGain;
if (transferGain < 0) {
  return { ...pa, taxableGain: transferGain, lthd: 0, income: transferGain };
}
const taxableGain = pa.result.taxableGain;
const lthd = pa.result.longTermHoldingDeduction;
const income = taxableGain - lthd;
return { ...pa, taxableGain, lthd, income };
```

**`offsetLosses()` 입력 (L.134)**:
```typescript
const remainingGainByAsset: number[] = records.map(
  (r) => (r.result.isExempt ? 0 : Math.max(0, r.income))
);
```

여기서 `r.income`은 장특 후 양도소득금액. `offsetLosses`는 이 값을 기반으로 통산 수행.

### 검증 결과: 순서 정합 ✓

```
[자산별 차익] → [자산별 장특공제] → [자산별 양도소득금액] → [§102② 통산]
```

순서가 코드로 보장됨. 구체적으로:
1. `transferGain < 0` 시 `lthd = 0` 강제 → **건물 차손(-8,230,409)에 장특 0 보장** (31-F4 anchor)
2. `income = taxableGain - lthd` → 장특 적용 후 소득금액이 `records[i].income`
3. `offsetLosses(assetRecords)` → `records[i].income` 기반 통산 → **장특 후 단계에서 통산** 보장

4개 순서 anchor(31-F4, 31-G1, 31-G2, 31-G3)가 순서 역전 시 독립적으로 깨짐 → 회귀 자동 검출.

**교정 불필요**: 현존 aggregate 코드가 올바른 순서를 구현하고 있으므로 본 작업에서 순서 교정 없이 진입.

---

## B) 산식 정밀 검산표

### 입력값 (잠금)

| 항목 | 값 |
|---|---|
| 총 양도가액 | 925,000,000원 |
| 양도일 | 2023-02-19 |
| 취득일 | 1999-05-24 |
| 토지면적 | 85㎡ |
| 건물 연면적 | 180.96㎡ (2층) |
| 양도시 공시지가 | 10,830,000원/㎡ (2022년) |
| **양도시 건물기준시가** | **20,629,440원** (BigInt 정밀 검산 확정 — Plan §10의 20,623,824에서 수정) |
| 취득시 공시지가 | 2,800,000원/㎡ (1998년) |
| 취득시 건물기준시가 | 28,144,700원 (개산공제 역산: 844,341 ÷ 0.03 = 28,144,700) |
| 개산공제율 | 0.03 (등기 일반건물·토지 공통) |

> **양도시 건물기준시가 확정 경위**:
> Plan §10 잠금값 20,623,824는 근사 역산값. 검토 단계에서 20,627,816으로 한 차례 합의됐으나 BigInt 손계산 오류 — 실제 vitest 검증 결과 **20,629,440**이 정답으로 확정 (2026-05-08 사후 정정, 엔진 시니어 첫 보고가 정답).
> BigInt 정밀 검산 결과:
> - 분모 = 920,550,000 + 20,629,440 = 941,179,440
> - 토지 양도가 = INT(925,000,000 × 920,550,000 / 941,179,440) = **904,725,192** ✓
> - 건물 양도가 = 20,274,808 ✓
> - 토지 환산 = INT(904,725,192 × 238,000,000 / 920,550,000) = **233,908,636** ✓
> - 건물 환산 = INT(20,274,808 × 28,144,700 / 20,629,440) = **27,660,876** ✓ (Plan 원본 그대로)
> → Plan 원본 anchor 17종 전원 `toBe()` 정확값으로 복원 가능.

### 검산표

#### Step A: 양도가 안분 (시행령 §166⑥)

```
토지 기준시가 = 10,830,000 × 85 = 920,550,000
건물 기준시가 = 20,629,440
합계 기준시가 = 941,179,440

토지 양도가 = floor(925,000,000 × 920,550,000 / 941,179,440)   ← BigInt 연산 필수
            = floor(904,725,192.xx)
            = 904,725,192  ✓ (anchor 31-A1)

건물 양도가 = 925,000,000 - 904,725,192 = 20,274,808  ✓ (anchor 31-A2)
```

#### Step B: 환산취득가 (시행령 §176의2④)

```
취득시 토지 기준시가 = 2,800,000 × 85 = 238,000,000

토지 환산 = floor(904,725,192 × 238,000,000 / 920,550,000)   ← BigInt 연산 필수
          = floor(233,908,636.xx)
          = 233,908,636  ✓ (anchor 31-B1)

건물 환산 = floor(20,274,808 × 28,144,700 / 20,629,440)
          = floor(27,660,876.xx)
          = 27,660,876  ✓ (anchor 31-B2, Plan 원본 그대로)
```

> BigInt 정밀 검산 확인값: INT(20,274,808 × 28,144,700 / 20,629,440) = 27,660,876

#### Step C: 개산공제 (시행령 §163⑥)

```
토지 개산공제 = floor(238,000,000 × 0.03) = 7,140,000  ✓ (anchor 31-C)
건물 개산공제 = floor(28,144,700 × 0.03) = 844,341    ✓ (anchor 31-D)
```

> 주의: 개산공제는 **취득시 기준시가** 기준. 토지는 취득시 공시지가 × 면적, 건물은 취득시 건물기준시가 총액.

#### Step D: 양도차익

```
토지 차익 = 904,725,192 - 233,908,636 - 7,140,000 = 663,676,556  ✓ (anchor 31-E1)
건물 차손 = 20,274,808 - 27,660,876 - 844,341 = -8,230,409        ✓ (anchor 31-E2 = -8,230,409, Plan 원본 그대로)
```

#### Step E: 장기보유특별공제 (소득세법 §95②)

```
보유기간 기산: 1999-05-25(취득일 다음날) → 2023-02-19
             만 23년 = 2022-05-25 경과, 2023-02-19는 만 23년 초과
             floor: 23년  ✓ (anchor 31-F1)

장특율 (토지, 표1 일반): 15년 이상 상한 30%  ✓ (anchor 31-F2)
장특 (토지) = floor(663,676,556 × 0.30) = 199,102,966  ✓ (anchor 31-F3)

건물 transferGain < 0 → lthd = 0 (★ aggregate 코드 L.129 강제)  ✓ (anchor 31-F4)
```

#### Step F: 양도소득금액 (통산 전)

```
토지 양도소득금액 = 663,676,556 - 199,102,966 = 464,573,590
건물 양도소득금액 = -8,230,409 (차손 그대로)  ✓ (anchor 31-G1 = -8,230,409, Plan 원본 그대로)
```

#### Step G: §102② 1차 통산

```
흡수액(토지 ← 건물) = 8,230,409  ✓ (anchor 31-G2 = 8,230,409, Plan 원본 그대로)
토지 통산후 = 464,573,590 - 8,230,409 = 456,343,181  ✓ (anchor 31-G3 = 456,343,181, Plan 원본 그대로)
건물 통산후 = 0

합계 = 456,343,181  ✓ (anchor 31-H = 456,343,181, Plan 원본 그대로)
```

#### Step H: 과세표준 및 세액 (2023년 §55 기본세율)

```
기본공제 = 2,500,000원
과세표준 = 456,343,181 - 2,500,000 = 453,843,181원
         ※ 양도소득세 과세표준: 소득세법 §92 — 천원 미만 절사 규정 없음 (원 단위 그대로)
         ※ "과세표준 = 453,843,000" 계산은 오류. 양도소득세는 원 미만 절사만 적용.

2023년 누진세율표 (소득세법 §55, 양도소득세 §104①1호 준용):
  453,843,181원 → 3억~5억 구간 (세율 40%, 누진공제 25,940,000)
  [누계세액 검증: 3억까지 = 6%×1,400만 + 15%×3,600만 + 24%×3,800만 + 35%×6,200만
               + 38%×1억5천만 = 84,000 + 5,400,000 + 9,120,000 + 21,700,000 + 57,000,000
               + 38%×(300,000,000-150,000,000) = 57,000,000 ... 합산: 94,060,000원 @ 300M]

산출세액 = floor(94,060,000 + (453,843,181 - 300,000,000) × 0.40)
         = floor(94,060,000 + 153,843,173 × 0.40)
         = floor(94,060,000 + 61,537,269.2)
         = floor(155,597,272.2)
         = 155,597,272원  ✓ (anchor 31-I = 155,597,272)

지방소득세 = floor(155,597,272 × 0.10) = floor(15,559,727.9) = 15,559,727원  ✓ (anchor 31-J = 15,559,727)
총 납부세액 = 155,597,272 + 15,559,727 = 171,156,995원
```

> ★★★ feedback_transfer_year_tax_rate.md 적용: 산출세액·지방세는 §55·§103조의3 직접 계산.
> "과세표준 × 10%" 단일세율 가정·외부 자료 산출값 추종 금지.
> 이전 보고(155,597,200 / 15,559,720)는 과세표준에 천원 절사를 잘못 적용한 오류값 — 정정.

#### Step I: 비사업용토지 판정

```
건물 층수: 2층
바닥면적 추정 = floor(180.96 / 2) = 90.48㎡ (연면적 ÷ 층수 MVP)
용도지역 배율: 도시지역 주거·상업·공업 = 3배
인정 한도 = 90.48 × 3 = 271.44㎡
실제 부수토지 = 85㎡ < 271.44㎡ → 사업용  ✓ (anchor 31-K = true)
```

---

## C) anchor 확정 근거 (BigInt 정밀 검산)

사용자 BigInt 정밀 검산으로 양도시 건물기준시가 = **20,629,440** 확정.
**Plan 원본 anchor 17종 전원 `toBe()` 정확값으로 복원 가능**.

이전 보고(2026-05-08 1차)에서 20,629,440으로 설정하여 anchor 6종을 ±8원 재조정했으나 이는 오산. 정정값은 다음과 같다:

| anchor | 이전 보고(오산) | 정답 (Plan 원본 = 확정값) | 비고 |
|---|---:|---:|---|
| 31-A1 (토지양도가) | 904,725,192 | **904,725,192** | 동일 |
| 31-A2 (건물양도가) | 20,274,808 | **20,274,808** | 동일 |
| 31-B1 (토지환산) | 233,908,636 | **233,908,636** | 동일 |
| 31-B2 (건물환산) | 27,660,876 | **27,660,876** | +8 정정 |
| 31-E1 (토지차익) | 663,676,556 | **663,676,556** | 동일 |
| 31-E2 (건물차손) | −8,230,409 | **−8,230,409** | −8 정정 |
| 31-G1 (건물소득 통산전) | −8,230,409 | **−8,230,409** | −8 정정 |
| 31-G2 (흡수액) | 8,230,409 | **8,230,409** | +8 정정 |
| 31-G3 (토지 통산후) | 456,343,181 | **456,343,181** | −8 정정 |
| 31-H (합계) | 456,343,181 | **456,343,181** | −8 정정 |
| 31-I (산출세액) | 155,597,200 | **155,597,272** | 과세표준 천원절사 오류 정정 |
| 31-J (지방소득세) | 15,559,720 | **15,559,727** | 동일 오류 정정 |

**산출세액 정정 이유**: 이전 보고는 과세표준에 천원 미만 절사(453,843,000)를 적용했으나, 양도소득세 과세표준은 원 단위 그대로(453,843,181). §55 누진세율 직접 계산 결과 155,597,272원.

---

## 법령 근거

```
소득세법 시행령 §166⑥ — 한 계약으로 토지·건물 등 여러 자산 일괄 양도 시 기준시가 비율 안분
소득세법 시행령 §176조의2④ — 환산취득가액 (기준시가 비율 역산)
소득세법 §97② 2호 + 시행령 §163⑥ — 개산공제 (등기 자산 3%, 미등기 0.3%)
소득세법 §95② — 장기보유특별공제 (차손 자산 0%, 일반 보유 15년+ 30%)
소득세법 §102② + 시행령 §167의2 — 양도차손 통산 (그룹 내 → 타군 pro-rata)
소득세법 §103 — 기본공제 연 250만원
소득세법 §55 (준용 §104①1호) — 2023년 기본세율 누진세율표
지방세법 §103의3 — 지방소득세 (양도소득세의 10%)
소득세법 §104조의3 + 시행령 §168의8 — 비사업용토지 판정 (건물 부수토지 배율)
```

---

## 엔진 input 타입

```typescript
// lib/tax-engine/general-building-valuation.ts

export type GeneralBuildingInput = {
  // 양도 정보
  totalTransferPrice: number;          // 925,000,000 (총 양도가액)
  transferDate: Date;                  // 2023-02-19

  // 취득 정보
  acquisitionDate: Date;               // 1999-05-24

  // 면적
  landArea: number;                    // 85 (㎡, 토지 부수면적)
  buildingArea: number;                // 180.96 (㎡, 건물 연면적)
  buildingFloors: number;              // 2 (층수 — 비사업용토지 판정 바닥면적 추정용)

  // 양도시점 기준시가 (안분 분모)
  transferLandPricePerSqm: number;     // 10,830,000 (원/㎡ — 2022년 공시지가)
  transferBuildingStdPrice: number;    // 20,629,440 (원 — 양도시 건물기준시가 총액, BigInt 검산 확정)

  // 취득시점 기준시가 (환산 분자)
  acquisitionLandPricePerSqm: number;  // 2,800,000 (원/㎡ — 1998년 공시지가)
  acquisitionBuildingStdPrice: number; // 28,144,700 (원 — 취득시 건물기준시가 총액)

  // 선택적
  estimatedDeductionRate?: number;     // 기본 0.03 (ESTIMATED_DEDUCTION_RATE_LAND_BUILDING)
  floorAreaMultiplier?: number;        // 기본 3 (도시지역 주거·상업·공업 배율)
};
```

## 엔진 output 타입

```typescript
export type GeneralBuildingAllocation = {
  land: number;       // 토지 양도가
  building: number;   // 건물 양도가
};

export type GeneralBuildingAcquisition = {
  land: number;       // 토지 환산취득가
  building: number;   // 건물 환산취득가
};

export type GeneralBuildingEstimatedDeduction = {
  land: number;       // 토지 개산공제
  building: number;   // 건물 개산공제
};

export type GeneralBuildingOutput = {
  // 중간 계산값 (테스트·UI 노출용)
  allocation: GeneralBuildingAllocation;
  acquisition: GeneralBuildingAcquisition;
  estimatedDeduction: GeneralBuildingEstimatedDeduction;

  // 비사업용토지 판정 결과
  estimatedFloorArea: number;          // 연면적 ÷ 층수 (바닥면적 추정)
  allowedLandArea: number;             // 인정 한도 = 바닥면적 × 배율
  isWithinNblRatio: boolean;           // true = 사업용 (중과 미발동)

  // aggregate 엔진에 넘길 자산 카드 2장
  assetCards: AssetCardForAggregate[];
};

// aggregate 엔진 TransferTaxItemInput과 호환되는 카드 구조
export type AssetCardForAggregate = {
  propertyId: string;                  // "land" | "building"
  propertyLabel: string;               // "토지(1001)" | "건물(3001)"
  propertyType: "land" | "general_building_unit";
  transferPrice: number;               // 안분된 양도가
  acquisitionPrice: number;            // 환산취득가 (환산모드)
  expenses: number;                    // 개산공제
  usedEstimatedAcquisition: true;
  estimatedBase: number;               // 환산취득가 (=acquisitionPrice)
  estimatedDeduction: number;          // 개산공제
  acquisitionDate: Date;
  transferDate: Date;
  isNonBusinessLand: boolean;          // 비사업용토지 판정 결과
  // 나머지 필드는 호출부에서 주입
};
```

새 Date 필드는 `lib/api/date-coerce.ts` 헬퍼 사용 약속 (라우트 통합 시 `toDate()`).

---

## 계산 알고리즘 (단계별)

### Step 1: 양도가 안분 (시행령 §166⑥)

```typescript
function allocateBundledTransferPrice(input: GeneralBuildingInput): GeneralBuildingAllocation {
  const landStdTotal = Math.floor(input.transferLandPricePerSqm * input.landArea);
  const totalStd = landStdTotal + input.transferBuildingStdPrice;

  const landTransferPrice = Math.floor(input.totalTransferPrice * landStdTotal / totalStd);
  const buildingTransferPrice = input.totalTransferPrice - landTransferPrice; // 잔액 보정

  return { land: landTransferPrice, building: buildingTransferPrice };
}
```

**잔액 보정 원칙**: 건물 = 총양도가 - 토지. 이중 floor 오차 방지.

### Step 2: 환산취득가 (시행령 §176의2④) — **BigInt 확정**

**중간 overflow 분석**:
- 토지 분자 = `allocation.land × acqLandStdTotal` ≈ 904,725,192 × 238,000,000 ≈ **2.15 × 10¹⁷**
- `Number.MAX_SAFE_INTEGER` = 9.007 × 10¹⁵
- → **이미 정밀도 손실 영역**. Number 곱셈 직접 사용 시 anchor 31-B1(233,908,636) 자체가 깨질 위험.

**결정: `tax-utils.ts`의 기존 `safeMultiplyThenDivide()` 재사용** (grep 검증 완료 — `lib/tax-engine/multi-parcel-transfer.ts:298`에서 동일 패턴으로 양도가 안분·환산취득가 산정에 이미 사용 중).

```typescript
import { safeMultiplyThenDivide } from "./tax-utils";

function calculateConvertedAcquisition(
  input: GeneralBuildingInput,
  allocation: GeneralBuildingAllocation
): GeneralBuildingAcquisition {
  const landStdTotal = Math.floor(input.transferLandPricePerSqm * input.landArea);
  const acqLandStdTotal = Math.floor(input.acquisitionLandPricePerSqm * input.landArea);

  // BigInt fallback 자동 적용 — 토지 분자 ≈ 2.15 × 10¹⁷ 안전
  const landAcq = Math.floor(
    safeMultiplyThenDivide(allocation.land, acqLandStdTotal, landStdTotal)
  );
  const buildingAcq = Math.floor(
    safeMultiplyThenDivide(
      allocation.building,
      input.acquisitionBuildingStdPrice,
      input.transferBuildingStdPrice
    )
  );

  return { land: landAcq, building: buildingAcq };
}
```

**Step 1 (양도가 안분)에도 동일 적용**: `토지 안분 = totalTransferPrice × landStdTotal / (landStdTotal + buildingStdTotal)` 분자 ≈ 925,000,000 × 920,550,000 ≈ 8.5 × 10¹⁷ → `safeMultiplyThenDivide()` 필수.

**신규 헬퍼 불필요** — 기존 `tax-utils.ts:87-95` `safeMultiplyThenDivide()` 그대로 사용. anchor 검산도 BigInt 결과 기준으로 작성.

### Step 3: 개산공제 (시행령 §163⑥)

```typescript
function calculateEstimatedDeduction(
  input: GeneralBuildingInput,
  rate: number
): GeneralBuildingEstimatedDeduction {
  const acqLandStdTotal = Math.floor(input.acquisitionLandPricePerSqm * input.landArea);

  const landDed = Math.floor(acqLandStdTotal * rate);
  const buildingDed = Math.floor(input.acquisitionBuildingStdPrice * rate);

  return { land: landDed, building: buildingDed };
}
```

**분모**: 토지 = 취득시 공시지가 × 면적, 건물 = 취득시 건물기준시가 총액.

### Step 4: 자산 카드 2장 생성

```typescript
export function buildGeneralBuildingAssetCards(input: GeneralBuildingInput): GeneralBuildingOutput {
  const rate = input.estimatedDeductionRate ?? ESTIMATED_DEDUCTION_RATE_LAND_BUILDING;
  const allocation = allocateBundledTransferPrice(input);
  const acquisition = calculateConvertedAcquisition(input, allocation);
  const estimatedDeduction = calculateEstimatedDeduction(input, rate);

  // 비사업용토지 판정
  const multiplier = input.floorAreaMultiplier ?? 3;
  const estimatedFloorArea = input.buildingArea / input.buildingFloors;
  const allowedLandArea = estimatedFloorArea * multiplier;
  const isWithinNblRatio = input.landArea <= allowedLandArea;

  const assetCards: AssetCardForAggregate[] = [
    {
      propertyId: "land",
      propertyLabel: "토지(1001)",
      propertyType: "land",
      transferPrice: allocation.land,
      acquisitionPrice: acquisition.land,
      expenses: estimatedDeduction.land,
      usedEstimatedAcquisition: true,
      estimatedBase: acquisition.land,
      estimatedDeduction: estimatedDeduction.land,
      acquisitionDate: input.acquisitionDate,
      transferDate: input.transferDate,
      isNonBusinessLand: !isWithinNblRatio,
    },
    {
      propertyId: "building",
      propertyLabel: "건물(3001)",
      propertyType: "general_building_unit",
      transferPrice: allocation.building,
      acquisitionPrice: acquisition.building,
      expenses: estimatedDeduction.building,
      usedEstimatedAcquisition: true,
      estimatedBase: acquisition.building,
      estimatedDeduction: estimatedDeduction.building,
      acquisitionDate: input.acquisitionDate,
      transferDate: input.transferDate,
      isNonBusinessLand: false,  // 건물 자체는 비사업용토지 판정 해당 없음
    },
  ];

  return { allocation, acquisition, estimatedDeduction, estimatedFloorArea, allowedLandArea, isWithinNblRatio, assetCards };
}
```

### Step 5: aggregate 엔진 위임

`buildGeneralBuildingAssetCards()`가 생성한 카드 2장을 `calculateTransferTaxAggregate()`에 전달. 통산·장특·기본공제·세율 적용은 기존 aggregate 엔진이 처리.

---

## D) 모듈 구조

```
lib/tax-engine/
├── general-building-valuation.ts       (신규, ~250줄 목표)
│   ├── export type GeneralBuildingInput
│   ├── export type GeneralBuildingOutput
│   ├── export type GeneralBuildingAllocation
│   ├── export type GeneralBuildingAcquisition
│   ├── export type GeneralBuildingEstimatedDeduction
│   ├── export type AssetCardForAggregate
│   ├── export function buildGeneralBuildingAssetCards(input): GeneralBuildingOutput
│   ├── internal: allocateBundledTransferPrice()
│   ├── internal: calculateConvertedAcquisition()
│   └── internal: calculateEstimatedDeduction()
│
├── legal-codes/transfer.ts
│   ├── TRANSFER.GENERAL_BUILDING_APPORTIONMENT (신규)
│   ├── TRANSFER.GENERAL_BUILDING_ESTIMATED_ACQ (신규)
│   └── TRANSFER.GENERAL_BUILDING_LUMP_DEDUCTION (신규)
│
└── (상수 추가)
    ESTIMATED_DEDUCTION_RATE_LAND_BUILDING = 0.03

__tests__/tax-engine/transfer/
├── general-building-valuation.test.ts  (단위 — anchor 11종: A1-A2, B1-B2, C-D, E1-E2, K)
└── case31-general-building-bundled.test.ts (E2E aggregate — 통산 순서 anchor 8종: F1-F4, G1-G3, H)
```

### propertyType 라우팅 결정

**결정: 호출부에서 aggregate 직접 구성**

`general-building-valuation.ts`는 순수 함수로 자산 카드 2장만 생성. `transfer-tax.ts` 단건 엔진을 거치지 않고, Route Handler 또는 별도 어댑터가:
1. `buildGeneralBuildingAssetCards(input)` → `GeneralBuildingOutput`
2. `output.assetCards`를 `AggregateTransferInput.properties`로 변환
3. `calculateTransferTaxAggregate()` 직접 호출

이유:
- 단건 `calculateTransferTax()`는 토지+건물 묶음을 단일 자산으로 처리하는 경로 → 맞지 않음
- `calculateTransferTaxAggregate()`가 이미 자산별 차익·장특·통산을 처리 → 재사용 최적
- `propertyType: "general_building"` 분기를 `transfer-tax.ts` 오케스트레이터에 추가하면 800줄 위반 가능성

**Zod 스키마 추가**: `lib/api/transfer-tax-schema.ts`의 `propertyType` enum에 `"general_building"` 추가 필요. (UI 시니어 담당 ⑨⑩ 동기화 지점)

---

## E) 비사업용토지 판정

### MVP 결정 (Plan §7 잠금)

`연면적 ÷ 층수` 자동 추정. 사용자에게 "1층 바닥면적" 입력 필드 별도 노출 없음.

```typescript
const estimatedFloorArea = input.buildingArea / input.buildingFloors;
const allowedLandArea = estimatedFloorArea * (input.floorAreaMultiplier ?? 3);
const isWithinNblRatio = input.landArea <= allowedLandArea;
```

### 현존 NBL 모듈 재사용 vs 신규

**결정: 자체 간이 계산 (신규 인라인)**

현존 `non-business-land/engine.ts`(`judgeNonBusinessLand()`)는 복잡한 3기준(80%/5년3년/3년2년) 종합판정 모듈. 본 사례는 "배율 내 여부" 단순 판정만 필요하므로 `general-building-valuation.ts` 내부에 인라인 구현.

향후 정밀 판정(실제 바닥면적 입력, 용도지역 파라미터화) 필요 시 `judgeNonBusinessLand()` 연동으로 확장.

### MVP 사각지대 (코드 주석 강제)

`연면적 ÷ 층수` 추정은 **균등 층 가정**이다. 다음 케이스에서 추정값이 실제보다 커져 인정한도 과대평가 위험:
- 1층 점포 + 2층 주거 근린생활시설 — 1층 바닥면적이 통상 더 큼 (계단실·필로티로 2층이 좁음)
- 필로티 주차장 + 상층부 — 1층이 매우 좁음
- 1971년 같이 오래된 건물 — 등기부·건축물대장상 층별 면적이 별도 기재되어 있어 정밀 입력 가능

**사례 31 영향 분석**: 사당동 132-10은 양 추정 어느 쪽이든 사업용 (85㎡ ≪ 271㎡ / 210㎡). 다만 **토지 비율이 큰 다른 케이스에서는 비사업용 판정 누락 가능**.

**엔진 코드에 다음 JSDoc 주석 강제**:

```typescript
/**
 * 비사업용토지 판정 (MVP — 연면적÷층수 추정)
 *
 * ⚠️ 사각지대: 실제 1층 바닥면적이 더 작은 케이스(필로티·점포+주거)에서
 *    한도 미달임에도 사업용 판정될 수 있음.
 *    정밀 판정 필요 시 judgeNonBusinessLand() 연동으로 전환.
 *
 * 사례 31은 부수토지 85㎡로 어떤 추정값에서도 사업용 → MVP 충분.
 */
```

---

## F) 상수·법령코드 추가 명세

`lib/tax-engine/legal-codes/transfer.ts`에 다음을 추가:

```typescript
// ── 일반건물(토지+건물 일괄) 환산취득가 ──
/**
 * 소득세법 시행령 §166⑥ — 토지·건물 등 여러 자산 일괄 양도 시 기준시가 비율 안분
 * (기존 BUNDLED_APPORTIONMENT와 동일 조문. 일반건물 컨텍스트 명시용 alias)
 */
GENERAL_BUILDING_APPORTIONMENT: "소득세법 시행령 §166⑥",

/**
 * 소득세법 시행령 §176조의2④ — 환산취득가액 (취득시/양도시 기준시가 비율)
 * 토지: 토지양도가 × (취득시 공시지가 × 면적) / (양도시 공시지가 × 면적)
 * 건물: 건물양도가 × (취득시 건물기준시가) / (양도시 건물기준시가)
 */
GENERAL_BUILDING_ESTIMATED_ACQ: "소득세법 시행령 §176조의2④",

/**
 * 소득세법 §97② 2호 + 시행령 §163⑥ — 개산공제율
 * 등기 자산(토지·건물 모두): 취득시 기준시가 × 3%
 * 미등기 자산: 취득시 기준시가 × 0.3%
 */
GENERAL_BUILDING_LUMP_DEDUCTION: "소득세법 §97② 2호 + 시행령 §163⑥",
```

그리고 상수 (엔진 파일 최상단):

```typescript
/** 등기 자산(토지·일반건물·주택·오피스텔 등) 개산공제율 — 시행령 §163⑥ */
export const ESTIMATED_DEDUCTION_RATE_LAND_BUILDING = 0.03 as const;

/** 미등기 자산 개산공제율 — 시행령 §163⑥ */
export const ESTIMATED_DEDUCTION_RATE_UNREGISTERED = 0.003 as const;
```

### 상수 중복 grep 결과 (Do 단계 분쟁 차단)

```bash
$ grep -rn "ESTIMATED_DEDUCTION_RATE" lib/tax-engine/
(검색 결과 없음)

$ grep -rn "0\.03.*개산\|개산.*0\.03" lib/tax-engine/
lib/tax-engine/commercial-building-valuation.ts:234:
  // 개산공제 총액 = INT(P_A × 0.03)
```

**결과**:
- `ESTIMATED_DEDUCTION_RATE_*` 상수는 **어디에도 정의되지 않음** — barrel 충돌 없음.
- 사례 29(`commercial-building-valuation.ts`)는 `0.03`을 **하드코딩** (line 234 인근). 상수 import 없음.

**결정**:
1. 본 사례 31 작업에서 `ESTIMATED_DEDUCTION_RATE_LAND_BUILDING = 0.03` / `_UNREGISTERED = 0.003`을 `legal-codes/transfer.ts`에 신규 export.
2. `general-building-valuation.ts`에서 import 사용.
3. **사례 29 마이그레이션은 본 작업 scope 외** — `commercial-building-valuation.ts`의 `0.03` 하드코딩 → 신규 상수 import 교체는 후속 PDCA로 분리. 본 작업에서 강행 시 사례 29 회귀 anchor 영향 가능.
4. 후속 PDCA 트리거: "사례 29 개산공제 상수화" — 마이그레이션 + 회귀 anchor 보존만 수행하는 작은 PDCA.

---

## Silent fallback / 자동 안분 후보 식별

| 필드 | 허용 | 근거 |
|---|---|---|
| 토지 양도가 안분 | ✓ 허용 | 시행령 §166⑥ 법령 명시 기준시가 비율 안분 |
| 건물 양도가 잔액 보정 | ✓ 허용 | 이중 floor 오차 방지를 위한 설계 패턴 |
| 바닥면적 = 연면적÷층수 | ✓ 허용 (MVP) | 입력 불가 시 자동 추정 명시 |
| 개산공제율 기본값 0.03 | ✓ 허용 | 시행령 §163⑥ 법정 기본값 |
| 취득시 공시지가 자동 조회 | ✗ 금지 | 사용자 직접 입력 또는 LandPriceLookupField |
| 양도시 건물기준시가 자동 채움 | ✗ 금지 | 미입력 시 validation 차단 |

---

## 테스트 약속

### 파일 구성

```
__tests__/tax-engine/transfer/general-building-valuation.test.ts
  - case31_allocation_land: 904,725,192 (toBe)
  - case31_allocation_building: 20,274,808 (toBe)
  - case31_acq_land: 233,908,636 (toBe)
  - case31_acq_building: 27,660,876 (toBe — BigInt 정밀 검산으로 Plan 원본값 확정)
  - case31_estimated_deduction_land: 7,140,000 (toBe)
  - case31_estimated_deduction_building: 844,341 (toBe)
  - case31_gain_land: 663,676,556 (toBe)
  - case31_gain_building: -8,230,409 (toBe)
  - case31_nbl_within_ratio: true (toBe)
  + 바닥면적 추정 단독 테스트 (floor 90.48 → 단순 나눗셈)

__tests__/tax-engine/transfer/case31-general-building-bundled.test.ts
  - case31_holding_years_floor: 23 (toBe)
  - case31_ltsd_rate_land: 0.30 (toBe)
  - case31_ltsd_land: 199,102,966 (toBe)
  - case31_ltsd_building: 0 (toBe ★ 순서 검증)
  - case31_income_building_pre_offset: -8,230,409 (toBe ★)
  - case31_offset_amount: 8,230,409 (toBe ★)
  - case31_income_land_post_offset: 456,343,181 (toBe ★)
  - case31_total_income: 456,343,181 (toBe)
  - case31_taxable_base: 453,843,181 (toBe — 과세표준 원 단위, 천원절사 없음)
  - case31_calc_tax: 155,597,272 (toBe — §55 직접 계산, 외부 자료 추종 금지)
  - case31_local_tax: 15,559,727 (toBe)
```

**anchor 정확도 정책**:
- 모든 anchor: `toBe()` 정확 일치
- BigInt 정밀 검산으로 양도시 건물기준시가 = 20,629,440 확정 → Plan 원본 17종 + 신규 세액 3종 전원 toBe() 정확값

---

## UI 통합 위임

UI 측 14개 동기화 지점은 UI 시니어 책임. 엔진 시니어가 확정한 타입 시그니처:

- **입력**: `GeneralBuildingInput` (9개 필수 필드 + 2개 선택 필드)
- **출력**: `GeneralBuildingOutput` (allocation·acquisition·estimatedDeduction + assetCards 2장)
- **UI 노출 필드명** (Plan §5.2):
  - `gbTransferLandPricePerSqm` → `transferLandPricePerSqm`
  - `gbTransferBuildingValue` → `transferBuildingStdPrice`
  - `gbAcqLandPricePerSqm` → `acquisitionLandPricePerSqm`
  - `gbAcqBuildingValue` → `acquisitionBuildingStdPrice`
  - `gbLandArea` → `landArea`
  - `gbBuildingArea` → `buildingArea`
  - `gbBuildingFloors` → `buildingFloors` (★ Plan 미기재, 비사업용 판정 필수)
  - `gbAcquisitionDate` → `acquisitionDate`

**Zod 동기화 (⑨~⑭ 지점)**:
- ⑨ `lib/api/transfer-tax-schema.ts`: `propertyType` enum에 `"general_building"` 추가
- ⑩ `transfer-tax-schema-sub.ts`: `generalBuildingFields` 서브스키마 신규 추가
- ⑫ Zod 입력 객체: `GeneralBuildingFields`를 Zod로 명시 (침묵 stripping 방지)
- ⑬ `callTransferTaxAPI` body spread에 `generalBuilding` 객체 포함
- ⑭ Route handler에서 `buildGeneralBuildingAssetCards()` 호출 + `calculateTransferTaxAggregate()` 연결

### ⑭ Route Handler 의사코드 — totalTransferPrice/transferDate/acquisitionDate 주입 패턴

`buildGeneralBuildingValuation()` 헬퍼 + Zod 서브객체 스키마는 `totalTransferPrice / transferDate / acquisitionDate` 3개 필드를 포함하지 않는다. 이 필드는 최상위 필드에서 받아 route handler가 서브객체에 주입한 뒤 엔진을 호출한다 (Zod 스키마 단순 유지, 침묵 stripping 없음):

```typescript
// app/api/calc/transfer/route.ts (⑭)
const generalBuildingInput: GeneralBuildingInput = {
  ...body.generalBuildingValuation,          // Zod 검증된 서브객체 (8개 필드)
  totalTransferPrice: body.transferPrice,    // 최상위 → 서브객체 주입
  transferDate: toDate(body.transferDate, "transferDate"),
  acquisitionDate: toDate(asset.acquisitionDate, "acquisitionDate"),
};
const output = buildGeneralBuildingAssetCards(generalBuildingInput);
const cards = output.assetCards; // 토지·건물 자산카드 2장
// → calculateTransferTaxAggregate({ properties: cards, ... }) 호출
```

**이 패턴의 이유**: UI/Zod 레이어에서 이미 수집된 최상위 필드를 서브객체에서 중복 수집하지 않음. route handler가 파이프라인 조립 책임을 가짐.

---

## 자가 점검 체크리스트 (작업 완료 보고 전)

- [ ] 케이스 인벤토리 19행 모두 anchor 통과 (★ 4개 통산 순서 anchor 포함)
- [ ] aggregate 순서 grep 검증 기록 완료 (이 문서 §A 참조)
- [ ] 양도시 건물기준시가 = **20,629,440** 코드에 반영 (BigInt 정밀 검산 확정값)
- [ ] anchor Plan 원본값 (31-B2=27,660,876 / 31-E2=-8,230,409 / 31-G3=456,343,181 / 31-I=155,597,272 / 31-J=15,559,727) 테스트에 반영
- [ ] `ESTIMATED_DEDUCTION_RATE_LAND_BUILDING` 상수 legal-codes/transfer.ts 추가
- [ ] 14개 동기화 지점 grep 자가점검 (⑫⑬⑭ 특히)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer/` 612+신규 통과
- [ ] 브라우저 수동: 사당동 132-10 입력 → 통산후 합계 **456,343,181** / 산출세액 **155,597,272** 확인
- [ ] 사례 27·28·29 회귀 anchor 보존

# 양도소득세 — 상업용건물·오피스텔 환산취득가 (사례 29) 엔진 설계

> **PDCA Design 단계 — 엔진 시니어 산출물**
> **작성일**: 2026-05-08 / **담당**: transfer-tax-senior
> **참조**: `docs/00-pm/transfer-tax-commercial-building-case-29.plan.md`
> **법령**: 소법 §95②④·§97②2호·§114⑦; 소령 §163⑥·§164①·⑧·§176조의2②2호; 지방세법 §103조의3
> **UI 설계 대응**: `transfer-tax-commercial-building-case-29.ui.design.md` (UI 시니어 병렬 작성)

---

## Context

### 배경

상업용건물(소매점·사무실)과 오피스텔은 국세청이 **2005-01-01부터** 호별 ㎡당 기준시가를 고시한다.
2004년 이전 취득분은 호별 고시가가 없으므로, **최초고시(2005년) 가액을 취득 시점으로 역환산**해야 한다
(소득세법 시행령 §164⑧).

현재 시스템은 `propertyType === "housing"` (주택) 및 `"land"` (토지)의 환산취득가만 지원한다.
상업용건물·오피스텔(`"commercial_building"`) 은 별도 공시 체계(호별 ㎡당 고시가)를 쓰므로
기존 `calculateEstimatedAcquisitionPrice()` 를 그대로 재사용할 수 없고
**전용 계산 모듈**이 필요하다.

### 한계 (기존)

- `propertyType` enum에 `"commercial_building"` 없음 — 14개 동기화 지점 전수 반영 필요.
- 호별 ㎡당 고시가 기반 환산 로직 미구현.
- 3-시점 데이터(취득·최초고시·양도) 입력 구조 미존재.
- `lib/tax-engine/commercial-building-valuation.ts` 모듈 미존재.

---

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

| # | 케이스 | 자산종류 | 취득시점 | 모드 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|--------|----------|----------|------|-----------|-------------|-------------|------|
| C-01 ★ | 상업용건물·호별고시 전 취득 + 환산 | commercial_building | ~2004-12-31 | 환산 | 소령 §164⑧·§176조의2②2호 | 양도코리아 사례 29 PDF p.504 + 엑셀 | `commercial-building-case-29.test.ts` | ☐ TODO |
| C-02 | 상업용건물·호별고시 후 취득 + 환산 | commercial_building | 2005-01-01~ | 환산 | 소령 §176조의2②2호 | (엑셀 유도 anchor — Do 단계 추가) | `commercial-building-case-29.test.ts` | ☐ TODO |
| C-03 | 상업용건물·실가 취득 | commercial_building | 모든 시점 | 실가 | 소법 §97①1호 가목 | (기본 양도차익 계산 흐름 동일) | `commercial-building-case-29.test.ts` | ☐ TODO |
| C-04 | 보유기간 경계 — 14년 11개월 | commercial_building | ~2004 | 환산 | 소법 §95④ (1년 미만 절사) | 경계 계산 직접 도출 | `commercial-building-case-29.test.ts` | ☐ TODO |
| C-05 | 보유기간 경계 — 15년 0개월 | commercial_building | ~2004 | 환산 | 소법 §95② 표1 (MIN(15,n)×2% = 30%) | 경계 계산 직접 도출 | `commercial-building-case-29.test.ts` | ☐ TODO |
| C-06 | 보유기간 경계 — 16년 (상한 유지) | commercial_building | ~2004 | 환산 | 소법 §95② 표1 상한 30% | 경계 계산 직접 도출 | `commercial-building-case-29.test.ts` | ☐ TODO |
| C-07 | validation — 호별고시가 미입력 에러 | commercial_building | ~2004 | 환산(C-01) | — | 에러 문자열 직접 확인 | `commercial-building-case-29.test.ts` | ☐ TODO |
| C-08 | validation — C-01 분기 건물기준시가 3시점 미입력 에러 | commercial_building | ~2004 | 환산(C-01) | — | 에러 문자열 직접 확인 | `commercial-building-case-29.test.ts` | ☐ TODO |

**규칙**: 사용자가 추가 케이스 제시 → 먼저 이 표에 행 추가 → 그 다음 코드.

---

## 법령 근거

### 핵심 조문

```
소득세법 §95 ②    — 장기보유특별공제율 표1 (일반자산, MIN(15,보유연수)×2%, 최대 30%)
소득세법 §95 ④    — 보유기간 계산 (취득일~양도일, 1년 미만 절사)
소득세법 §97 ② 2호 — 개산공제 (환산취득가 또는 감정가액 사용 시 실제경비 대신)
소득세법 §114 ⑦  — 환산취득가액 산식의 법적 근거
소득세법 시행령 §163 ⑥ — 개산공제율: 토지·건물 3%, 지상권·전세권 7%, 부동산취득권리 1%
소득세법 시행령 §164 ① — ㎡당 기준시가합 계산 (개별공시지가×대지면적 + 건물기준시가×연면적)
소득세법 시행령 §164 ⑧ — 호별고시 전 취득 시 환산기준시가 추정
                           취득시 환산기준시가 = INT( 최초고시 호별총액 × 취득시_기준시가합 / 최초고시시_기준시가합 )
소득세법 시행령 §176조의2 ②항 2호 — 환산취득가액 산식
                           환산취득가합계 = INT( 양도가액 × 취득시환산기준시가 / 양도시호별총액 )
지방세법 §103조의3 — 양도소득 개인지방소득세 누진세율표 (양도소득세와 별도 세율 적용)
```

### `lib/tax-engine/legal-codes/transfer.ts` 신규 상수 추가 제안

기존 `TRANSFER` 객체에 아래 상수를 추가해야 한다 (Do 단계에서 실제 추가).

```ts
// ── 상업용건물·오피스텔 환산취득가 ──
/** 소득세법 시행령 §164 ⑧ — 호별고시 전 취득 시 환산기준시가 추정 */
COMMERCIAL_BUILDING_PRE_DISCLOSURE:     "소득세법 시행령 §164 ⑧",
/** 소득세법 시행령 §164 ① — ㎡당 기준시가합 (개별공시지가×대지면적 + 건물기준시가×연면적) */
COMMERCIAL_BUILDING_STD_PRICE_SUM:     "소득세법 시행령 §164 ①",
/** 소득세법 시행령 §176조의2 ②항 2호 — 환산취득가액 (호별총액 비율) */
COMMERCIAL_BUILDING_ESTIMATED_ACQ:     "소득세법 시행령 §176조의2 ②항 2호",
/** 소득세법 §97 ② 2호 + 시행령 §163 ⑥ — 개산공제 3% (토지·건물) */
COMMERCIAL_BUILDING_LUMP_DEDUCTION:    "소득세법 §97 ② 2호 + 시행령 §163 ⑥",
```

---

## 엔진 input 타입

### 신규 서브타입: `CommercialBuildingValuationInput`

> 파일: `lib/tax-engine/types/commercial-building.types.ts` (신규) 또는 `transfer.types.ts` 내 인라인.
> 800줄 정책 고려 시 별도 파일 권장.

```ts
/**
 * 상업용건물·오피스텔 환산취득가 계산 입력
 *
 * 소득세법 시행령 §164⑧ (호별고시 전) + §176조의2②2호 (환산취득가 산식)
 */
export interface CommercialBuildingValuationInput {
  /**
   * 호별고시 전 취득 여부.
   * true  = 취득일 < 2005-01-01 → 소령 §164⑧ 최초고시 역환산 경로 (C-01)
   * false = 취득일 ≥ 2005-01-01 → 단순 호별고시가 비율 경로 (C-02)
   */
  isPreDisclosure: boolean;

  // ── 면적 (공통) ──
  /** 전용면적 (㎡) */
  exclusiveArea: number;
  /** 공유면적 (㎡) — 연면적 = exclusiveArea + commonArea */
  commonArea: number;
  /** 대지면적 (㎡) — 기준시가합 산출에 사용 */
  landArea: number;

  // ── 호별 ㎡당 고시가 ──
  /** 양도시 ㎡당 호별고시가 (원/㎡) */
  unitPriceAtTransfer: number;
  /**
   * 최초고시(2005) ㎡당 호별고시가 (원/㎡).
   * isPreDisclosure === true 일 때 필수.
   */
  unitPriceAtFirstDisclosure?: number;

  // ── 건물 ㎡당 기준시가 (소령 §164①) — 3시점 ──
  /**
   * 취득시 건물 ㎡당 기준시가 (원/㎡).
   * isPreDisclosure === true 일 때 필수.
   */
  buildingStdPriceAtAcquisition?: number;
  /**
   * 최초고시시(2005) 건물 ㎡당 기준시가 (원/㎡).
   * isPreDisclosure === true 일 때 필수.
   */
  buildingStdPriceAtFirstDisclosure?: number;
  /**
   * 양도시 건물 ㎡당 기준시가 (원/㎡).
   * isPreDisclosure === true 일 때 필수. (C-02에서는 불필요 — 호별고시가만 사용)
   */
  buildingStdPriceAtTransfer?: number;

  // ── 개별공시지가 (소령 §164①) — 3시점 ──
  /** 취득시 개별공시지가 (원/㎡). isPreDisclosure === true 일 때 필수. */
  landPriceAtAcquisition?: number;
  /** 최초고시시(2005) 개별공시지가 (원/㎡). isPreDisclosure === true 일 때 필수. */
  landPriceAtFirstDisclosure?: number;
  /** 양도시 개별공시지가 (원/㎡). isPreDisclosure === true 일 때 필수. */
  landPriceAtTransfer?: number;
}
```

### `TransferTaxInput` 확장

기존 `TransferTaxInput` (파일: `lib/tax-engine/types/transfer.types.ts`) 에 아래 필드 추가.

```ts
/**
 * 상업용건물·오피스텔 환산취득가 입력 (선택).
 * propertyType === "commercial_building" + useEstimatedAcquisition === true 일 때 필수.
 * 소득세법 시행령 §164⑧·§176조의2②2호.
 */
commercialBuildingValuation?: CommercialBuildingValuationInput;
```

`propertyType` enum 확장:

```ts
propertyType:
  | "housing"
  | "land"
  | "building"
  | "right_to_move_in"
  | "presale_right"
  | "mixed-use-house"
  | "commercial_building";   // ← 신규
```

---

## 엔진 result 타입

### 신규 서브타입: `CommercialBuildingValuationResult`

> `TransferTaxResult` 에 optional 필드로 추가.

```ts
/**
 * 상업용건물·오피스텔 환산취득가 계산 상세 결과.
 * 결과 카드 산식 표시·신고서 양식 표 재현에 사용.
 */
export interface CommercialBuildingValuationResult {
  // ── 산출 중간값 ──
  /** 연면적 = 전용 + 공유 (㎡) */
  totalFloorArea: number;
  /** 양도시 호별총액 = 양도시 ㎡당 호별고시가 × 연면적 */
  unitTotalAtTransfer: number;
  /**
   * 최초고시 호별총액 = 최초고시 ㎡당 호별고시가 × 연면적.
   * isPreDisclosure === true 일 때만 존재.
   */
  unitTotalAtFirstDisclosure?: number;

  // ── 3시점 기준시가합 (소령 §164①) — isPreDisclosure === true 일 때 존재 ──
  /** 취득시 ㎡당 기준시가합 = 개별공시지가 × 대지면적 + 건물기준시가 × 연면적 */
  stdPriceSumAtAcquisition?: number;
  /** 최초고시시 ㎡당 기준시가합 */
  stdPriceSumAtFirstDisclosure?: number;
  /** 양도시 ㎡당 기준시가합 */
  stdPriceSumAtTransfer?: number;

  /**
   * 취득시 환산기준시가 (소령 §164⑧).
   * = INT( 최초고시 호별총액 × 취득시 기준시가합 / 최초고시시 기준시가합 )
   * isPreDisclosure === true 일 때만 존재.
   */
  estimatedStdPriceAtAcquisition?: number;

  // ── 환산취득가 (소령 §176조의2②2호) ──
  /** 환산취득가 합계 = INT( 양도가액 × 취득시환산기준시가(또는 취득시호별총액) / 양도시호별총액 ) */
  estimatedAcquisitionPriceTotal: number;
  /** 환산취득가 토지분 = INT( 합계 × 취득시토지기준시가 / 취득시기준시가합 ) */
  estimatedAcquisitionPriceLand: number;
  /** 환산취득가 건물분 = 합계 − 토지분 */
  estimatedAcquisitionPriceBuilding: number;

  // ── 개산공제 (§97②2호 + §163⑥) ──
  /** 개산공제 합계 = 환산취득가 합계 × 3% */
  lumpSumDeductionTotal: number;
  /** 개산공제 토지분 = 환산취득가 토지분 × 3% */
  lumpSumDeductionLand: number;
  /** 개산공제 건물분 = 환산취득가 건물분 × 3% */
  lumpSumDeductionBuilding: number;
}
```

`TransferTaxResult` 확장:

```ts
/** 상업용건물·오피스텔 환산취득가 산출 상세 (commercial_building + 환산 모드 시) */
commercialBuildingValuationDetail?: CommercialBuildingValuationResult;
```

---

## 신규 엔진 모듈 설계

### `lib/tax-engine/commercial-building-valuation.ts` (~300줄)

**원칙**: DB 직접 호출 없음. 매개변수로 입력받아 순수 계산만 수행.
**의존 방향**: `transfer-tax.ts` → `commercial-building-valuation.ts` (역방향 금지).

#### 주요 export 함수

```ts
/**
 * 상업용건물·오피스텔 환산취득가 계산 (소령 §164⑧ + §176조의2②2호).
 *
 * @param input  CommercialBuildingValuationInput
 * @param transferPrice  양도가액 (원, 정수)
 * @returns CommercialBuildingValuationResult
 * @throws Error  필수 입력값 누락 시 (isPreDisclosure 별 조건 검사)
 */
export function calculateCommercialBuildingValuation(
  input: CommercialBuildingValuationInput,
  transferPrice: number
): CommercialBuildingValuationResult;

/**
 * ㎡당 기준시가합 = 개별공시지가(원/㎡) × 대지면적(㎡) + 건물기준시가(원/㎡) × 연면적(㎡).
 * 소득세법 시행령 §164 ①.
 * 순수 유틸 — 직접 테스트 가능.
 */
export function calcStdPriceSum(
  landPricePerSqm: number,
  landArea: number,
  buildingStdPricePerSqm: number,
  totalFloorArea: number
): number;

/**
 * 최초고시 역환산으로 취득시 환산기준시가 추정 (소령 §164⑧).
 * = INT( 최초고시호별총액 × 취득시기준시가합 / 최초고시시기준시가합 )
 */
export function calcEstimatedStdPriceAtAcq(
  unitTotalAtFirstDisclosure: number,
  stdPriceSumAtAcq: number,
  stdPriceSumAtFirst: number
): number;

/**
 * 환산취득가 합계 (소령 §176조의2②2호).
 * = INT( 양도가액 × 취득시환산기준시가 / 양도시호별총액 )
 * 주의: 중간 곱셈 오버플로우 → safeMultiply() 사용
 */
export function calcEstimatedAcquisitionTotal(
  transferPrice: number,
  acquisitionStdPrice: number,
  transferStdPrice: number
): number;

/**
 * 환산취득가 토지/건물 분리.
 * 토지분 = INT( 합계 × 취득시토지기준시가 / 취득시기준시가합 )
 * 건물분 = 합계 − 토지분
 */
export function splitEstimatedAcquisitionByLandBuilding(
  totalEstimated: number,
  landStdPriceAtAcq: number,
  stdPriceSumAtAcq: number
): { land: number; building: number };
```

#### 정수 연산 주의사항

- `INT()` = `Math.floor()` — 엑셀과 완전히 동일하게 각 단계에서 즉시 floor 적용.
- 중간 곱셈 위험: `양도가액(540,000,000) × 취득시환산기준시가(135,155,041)` = ~7.3 × 10^16 → `Number.MAX_SAFE_INTEGER`(9.0 × 10^15) 초과 가능성. **`safeMultiply()` (`tax-utils.ts`) 사용 필수**.
- `applyRate()` 는 `Math.floor(a * rate)` 전용이므로 비율 분수 연산에는 사용 불가 — 분자×분모 정수 연산 패턴 직접 적용.

---

## 계산 알고리즘 (단계별)

### 공통 사전 계산

```
연면적 = 전용면적 + 공유면적
       = 36 + 33.52 = 69.52 ㎡

양도시 호별총액 = 양도시 ㎡당 호별고시가 × 연면적
               (예: B33_UNIT_PRICE × 69.52)
```

### C-01 경로: 호별고시 전 취득 (소령 §164⑧)

#### Step 1. 3시점 ㎡당 기준시가합 (소령 §164①)

```
기준시가합 = 개별공시지가(원/㎡) × 대지면적 + 건물기준시가(원/㎡) × 연면적

취득시(2000) Sum_A = 개공지_취득 × 12.57 + 건물기준_취득 × 69.52
최초고시시(2005) Sum_F = 개공지_최초 × 12.57 + 건물기준_최초 × 69.52
양도시(2022) Sum_T = 개공지_양도 × 12.57 + 건물기준_양도 × 69.52
```

#### Step 2. 최초고시 호별총액

```
최초고시 호별총액 = 최초고시 ㎡당 호별고시가 × 연면적
                  = C2005_UNIT × 69.52
```

#### Step 3. 취득시 환산기준시가 (소령 §164⑧)

```
취득시 환산기준시가(P_A) = INT( 최초고시 호별총액 × Sum_A / Sum_F )
```

#### Step 4. 환산취득가 합계 (소령 §176조의2②2호)

```
환산취득가 합계 = INT( 양도가액 × P_A / 양도시호별총액 )
               = INT( 540,000,000 × P_A / 양도시호별총액 )
               ← safeMultiply(540000000, P_A) 후 floor 나눗셈
```

#### Step 5. 토지/건물 분리

```
환산취득가 토지분 = INT( 합계 × (취득시 개공지 × 12.57) / Sum_A )
환산취득가 건물분 = 합계 − 토지분
```

#### Step 6. 개산공제 (§97②2호 + §163⑥)

```
개산공제 = 환산취득가 × 3%
         토지분: applyRate(환산취득가_토지, 0.03)
         건물분: applyRate(환산취득가_건물, 0.03)
         합계: 토지분 + 건물분
```

### C-02 경로: 호별고시 후 취득 (소령 §176조의2②2호)

```
취득시 호별총액 = 취득시 ㎡당 호별고시가 × 연면적   (사용자 직접 입력)
양도시 호별총액 = 양도시 ㎡당 호별고시가 × 연면적

환산취득가 합계 = INT( 양도가액 × 취득시호별총액 / 양도시호별총액 )
```

C-02는 최초고시 역환산 없이 단순 비율 환산. 토지/건물 분리·개산공제 공식은 C-01과 동일.
단, 취득시 기준시가합에 의한 분리가 아닌 단순 비율(취득시 호별고시가 × 면적 분리)만 가능.
→ 토지/건물 분리 비율: 취득시 토지기준시가합 / 취득시기준시가합 (3시점 입력 시)
→ 미입력 시 토지/건물 구분 생략 (합산 양도차익만 계산). **단, validation에서 경고 처리 (에러 금지 — C-02 단순 환산은 합계만으로도 신고 가능)**.

### C-03 경로: 실가 취득

환산 분기 미진입. 기존 `calcTransferGain()` 그대로 사용. `commercialBuildingValuation` 무시.

---

### 기존 `transfer-tax.ts` 파이프라인 통합 지점

```
STEP 0.5 (pre-processing) 내부:
  if (propertyType === "commercial_building" && useEstimatedAcquisition && commercialBuildingValuation) {
    const cbResult = calculateCommercialBuildingValuation(commercialBuildingValuation, transferPrice);
    // 파이프라인 입력에 주입
    acquisitionPrice = cbResult.estimatedAcquisitionPriceTotal;
    expenses = cbResult.lumpSumDeductionTotal;   // 또는 capitalExpenditure/transferExpense swap 비교 후 결정
    // 결과에 상세 저장
    commercialBuildingValuationDetail = cbResult;
  }
```

> **주의**: `expenses` 주입 시 §97② 단서 swap 로직 (Do 단계에서 기존 `calcNecessaryExpense()` 와의 통합 방식 결정 필요).
> 환산 모드 본문: `expenses = 개산공제만` (기존 CLAUDE.md 메모 준수 — `capitalExpenditure`/`transferExpense` 는 swap 비교용).

---

## 사례 29 정답 검증 흐름 (C-01 anchor)

### 입력 fixture (엑셀 역산 추정값 — Do 단계에서 확정)

| 항목 | 시점 | 값 | 출처 |
|------|------|----|------|
| 양도가액 | — | 540,000,000 | 사례 29 |
| 취득일 | — | 2000-12-07 | 사례 29 |
| 양도일 | — | 2022-02-16 | 사례 29 |
| 전용면적 | — | 36 ㎡ | 사례 29 |
| 공유면적 | — | 33.52 ㎡ | 사례 29 |
| 대지면적 | — | 12.57 ㎡ | 사례 29 |
| 최초고시 ㎡당 호별고시가 | 2005 | (엑셀 B33) | Do 단계 확정 |
| 양도시 ㎡당 호별고시가 | 2022 | (엑셀 C33) | Do 단계 확정 |
| 건물 ㎡당 기준시가 | 취득·최초·양도 3시점 | (엑셀 역산) | Do 단계 확정 |
| 개별공시지가 | 취득·최초·양도 3시점 | (엑셀 역산) | Do 단계 확정 |

### 계산 흐름 산식 (엑셀 셀 매핑 — 사례 29 양도코리아)

```
연면적  = 36 + 33.52 = 69.52 ㎡

최초고시 호별총액   = C2005_UNIT × 69.52
취득시 Sum_A       = 개공지_2000 × 12.57 + 건물기준_2000 × 69.52
최초고시 Sum_F     = 개공지_2005 × 12.57 + 건물기준_2005 × 69.52
양도시 호별총액     = C2022_UNIT × 69.52

취득시 환산기준시가 (P_A) = INT( 최초고시호별총액 × Sum_A / Sum_F )
                         = 엑셀 anchor 역산 → 정답 135,155,041 역추적 시작점

환산취득가 합계          = INT( 540,000,000 × P_A / 양도시호별총액 )
                         = 135,155,041  ★ anchor C-01-01

개산공제 합계            = 환산취득가 합계 × 3%
                         = 3,588,219 ★ anchor C-01-02  (floor 적용 확인)

양도차익                 = 540,000,000 - 135,155,041 - 3,588,219
                         = 401,256,740 ★ anchor C-01-03

보유기간: 2000-12-07 ~ 2022-02-16
         만 21년 2개월 09일 → 1년 미만 절사 → 21년
         MIN(15, 21) × 2% = 30%  ★ anchor C-01-04

장특공          = 401,256,740 × 30% = 120,377,022 ★ anchor C-01-05
양도소득금액    = 401,256,740 - 120,377,022 = 280,879,718 ★ anchor C-01-06
기본공제        = 2,500,000
과세표준        = 280,879,718 - 2,500,000 = 278,379,718 ★ anchor C-01-07
              (소법·지방세법에 절사 규정 없음 → 그대로 누진세율표 대입)

산출세액 (★ 양도연도 2022 적용 소법 §55 누진세율 / §104 양도소득세율):
  - 적용 구간: 1.5억~3억, 세율 38%, 누진공제 19,940,000 (2021 개정 시행 표)
  = INT(278,379,718 × 0.38 - 19,940,000)
  = INT(105,784,292.84 - 19,940,000)
  = INT(85,844,292.84)
  = 85,844,292 ★ anchor C-01-08 (핵심)

지방소득세 (지방세법 §103조의3 2022년 양도분 누진세율표 직접 적용):
  = calculateLocalIncomeTaxOnTransfer(과세표준 278,379,718, 양도연도=2022)
  - 적용 구간: 1.5억~3억, 세율 3.8%, 누진공제 1,994,000 (국세 누진공제의 1/10)
  = INT(278,379,718 × 0.038 - 1,994,000)
  = INT(10,578,429.28 - 1,994,000)
  = INT(8,584,429.28)
  = 8,584,429 ★ anchor C-01-09

  ※ 세율 적용 원칙 (절대 준수):
    양도일이 속한 연도의 법정 누진세율표를 사용.
    양도코리아·엑셀 등 외부 산출물의 값을 anchor로 따라가지 않음.
    본 사례 양도일 2022-02-16 → 2021 시행 표(누진공제 19,940,000 / 1,994,000) 적용.

  ※ 입법 설계: §103조의3 세율·누진공제 모두 국세의 1/10 수준이지만
    "산출세액 × 10%" 결과와 **수학적으로 다름** — 중간 INT(절사) 시점 차이로 오차 발생.
    본 사례: 85,844,292 ÷ 10 = 8,584,429.2 → floor 8,584,429 (이번엔 일치하지만 일반화 금지)

  ※ anchor 작성 규칙 (절대 준수):
    - ❌ `expect(localTax).toBe(Math.floor(taxAmount * 0.1))` — 우연 일치만 통과
    - ❌ `expect(localTax).toBe(taxBase * 0.038 - 1_994_000)` — 단일세율 가정 (Number 부동소수 위험)
    - ✅ `expect(calculateLocalIncomeTaxOnTransfer(taxBase, 2022)).toBe(8_584_429)` — §103조의3 누진 직접 호출

총 납부세액    = 85,844,292 + 8,584,429 = 94,428,721 ★ anchor C-01-10
```

> **과세표준 절사 규정 없음**: 소득세법·지방세법에 양도소득 과세표준에 대한
> 천원·백원 단위 절사 규정은 없다. 과세표준 278,379,718을 그대로 누진세율표에 대입.
> anchor 7번 후보값 "278,379,000"은 제거 — **278,379,718 단일값으로 고정**.

> **참고: 양도코리아 PDF / 엑셀 산출값과의 차이**
> - 외부 자료: 산출세액 86,384,292 / 지방세 8,638,429 / 총 납부 95,022,721
> - 차이 원인: 외부 자료가 누진공제 19,400,000(2020년 이전 표)을 적용한 것으로 추정
> - 본 프로젝트는 양도연도(2022) 정확 세율표 사용 — 540,000원 차이 발생 (정상)
> - **anchor는 법령상 정확값(85,844,292 / 8,584,429 / 94,428,721)으로 고정**

---

## Silent fallback / 자동 안분 후보 식별

| 필드 | 위험 | 처리 방침 |
|------|------|-----------|
| 개별공시지가 미입력 | Sum_A/Sum_F = 0으로 나눗셈 오류 | validation에서 필수 에러로 차단 (C-01) |
| 건물기준시가 미입력 | 기준시가합 0이 되어 환산 0원 산출 | validation에서 필수 에러로 차단 (C-01) |
| 공유면적 0 입력 | 전용만으로 연면적 계산 → 환산값 달라짐 | 0 허용 (공유면적 없는 건물 존재). 음수만 차단 |
| 대지면적 0 입력 | Sum 토지 기여분 0 → 토지분 환산 0 | 0 허용 (소유 대지 없는 경우 존재). 분모 0 방지 조건 추가 |
| C-02 토지/건물 분리 미입력 | 합산만 계산 → 신고서 분리 불가 | validation 경고 (에러 아님). 결과에 `landBuilding분리불가` 플래그 |

**절대 금지**: 미입력 값을 자동으로 추정·안분하여 채우는 로직 (`feedback_no_silent_apportion_fallback.md`).

---

## anchor 테스트 목록 (≥ 15개)

파일: `__tests__/tax-engine/transfer-tax/commercial-building-case-29.test.ts`
fixture: `__tests__/tax-engine/transfer-tax/_helpers/case-29-fixtures.ts`

| # | anchor ID | 기댓값 | 검증 대상 | 케이스 |
|---|-----------|--------|-----------|--------|
| 1 | C-01-01 | 135,155,041 | 환산취득가 합계 | C-01 |
| 2 | C-01-02 | 3,588,219 | 개산공제 합계 (환산취득가 × 3%) | C-01 |
| 3 | C-01-03 | 401,256,740 | 양도차익 | C-01 |
| 4 | C-01-04 | 30 (%) | 장특공률 (MIN(15,21)×2% 상한) | C-01 |
| 5 | C-01-05 | 120,377,022 | 장특공 금액 | C-01 |
| 6 | C-01-06 | 280,879,718 | 양도소득금액 | C-01 |
| 7 | C-01-07 | 278,379,718 | 과세표준 (양도소득금액 − 기본공제 2,500,000, 절사 규정 없음) | C-01 |
| 8 | C-01-08 | **85,844,292** | **산출세액 (핵심 anchor — 2022 적용 §55 누진: 38%, 누진공제 19,940,000)** | C-01 |
| 9 | C-01-09 | **8,584,429** | 지방소득세 (지방세법 §103조의3 2022년 양도분 누진세율 직접 호출 — "산출세액 × 10%" 금지) | C-01 |
| 10 | C-01-10 | **94,428,721** | 총 납부세액 (= 산출세액 + 지방소득세) | C-01 |
| 11 | C-01-11 | (엑셀 역산) | 환산취득가 토지분 | C-01 |
| 12 | C-01-12 | (엑셀 역산) | 환산취득가 건물분 (= 합계 − 토지분 검증) | C-01 |
| 13 | C-04 | 보유 14년 → 28% | 14년 11개월 → 절사 14년, MIN(15,14)×2%=28% | C-04 |
| 14 | C-05 | 보유 15년 → 30% | 15년 0개월 = 정확히 15년, MIN(15,15)×2%=30% | C-05 |
| 15 | C-06 | 보유 16년 → 30% (상한 유지) | MIN(15,16)×2%=30% — 16년도 동일 | C-06 |
| 16 | C-07 | ValidationError | 호별고시가 미입력 시 에러 발생 | C-07 |
| 17 | C-08 | ValidationError | C-01 분기에서 건물기준시가 미입력 시 에러 | C-08 |
| 18 | C-01-유닛 | (엑셀 B33값 직접) | calcStdPriceSum() 단위 테스트 | 유닛 |
| 19 | C-01-유닛2 | (엑셀 역산) | calcEstimatedStdPriceAtAcq() 단위 테스트 | 유닛 |
| 20 | C-01-유닛3 | (엑셀 역산) | calcEstimatedAcquisitionTotal() safeMultiply 오버플로 방지 | 유닛 |

**지방소득세 anchor 주의 (재강조)**: §103조의3은 양도소득 **과세표준에 자체 누진세율표**를 적용 (지방세법 §103조의3①).
세율·누진공제 모두 국세의 1/10이라 결과가 거의 같지만 **동일하지 않다** — 중간 floor·소수처리 차이로 ±수십 원 오차.
- ❌ `expect(localTax).toBe(Math.floor(taxAmount * 0.1))` — 우연 일치 시점만 통과
- ✅ `expect(calculateLocalIncomeTaxOnTransfer(taxBase, 2022)).toBe(8_584_429)` — §103조의3 누진 직접 호출 (양도연도 인자 필수)
- "3.8% 단일세율" 가정 anchor도 금지 — 누진 함수의 정확한 산출값으로만 검증

---

## 파일 구조 (Do 단계 예정 신규/변경 파일)

```
lib/tax-engine/
  commercial-building-valuation.ts     ← 신규 (~300줄): 순수 함수 7개
  types/
    transfer.types.ts                  ← 수정: propertyType + commercialBuildingValuation 필드 추가
  legal-codes/
    transfer.ts                        ← 수정: TRANSFER 객체 4개 상수 추가
  transfer-tax.ts                      ← 수정: STEP 0.5에서 C-01/C-02 분기 진입 ~15줄
  transfer-tax-helpers.ts              ← 수정 여부 미정 (calcNecessaryExpense swap 통합 검토)

__tests__/tax-engine/transfer-tax/
  commercial-building-case-29.test.ts  ← 신규 (anchor 20개)
  _helpers/
    case-29-fixtures.ts                ← 신규 (입력 fixture + 중간값 상수)
```

---

## UI 통합 위임

UI 측 명세는 `transfer-tax-commercial-building-case-29.ui.design.md` 참조 (UI 시니어 병렬 작성).

### 엔진 시니어 → UI 시니어 전달 사항

| 항목 | 내용 |
|------|------|
| 신규 propertyType | `"commercial_building"` |
| 신규 input 필드 | `commercialBuildingValuation: CommercialBuildingValuationInput` |
| 신규 result 필드 | `commercialBuildingValuationDetail: CommercialBuildingValuationResult` |
| 결과 카드에서 표시해야 할 중간값 | `unitTotalAtTransfer`, `estimatedStdPriceAtAcquisition`, `estimatedAcquisitionPriceTotal`, `lumpSumDeductionTotal`, 토지/건물 분리값 |
| 산식 표기 규칙 | plan §7-1 준수 — "22년" 금지, "만 21년 2개월 (1년 미만 절사 → 21년)" / "MIN(15, 보유연수) × 2%" 사용 |
| 지방소득세 라벨 | "지방세법 §103조의3 양도소득분 누진세율" — "3.8% 단일세율" 금지 |
| validation 필수 필드 (C-01) | `unitPriceAtFirstDisclosure`, `buildingStdPriceAtAcquisition`, `buildingStdPriceAtFirstDisclosure`, `buildingStdPriceAtTransfer`, `landPriceAtAcquisition`, `landPriceAtFirstDisclosure`, `landPriceAtTransfer` |
| validation 필수 필드 (C-02) | `unitPriceAtTransfer`, `unitPriceAtAcquisition` (C-02 취득시 호별고시가) |
| C-02 토지/건물 분리 | 선택 입력. 미입력 시 validation 경고(에러 아님) + 결과에 분리 불가 플래그 |

---

## 14개 동기화 지점 선점 체크리스트 (Do 단계 자가 점검용)

클라이언트 8개:
- [ ] ① 타입: `transfer.types.ts` — `propertyType` enum + `commercialBuildingValuation?` 필드
- [ ] ② initial: `calc-wizard-asset-factory.ts` — `"commercial_building"` 분기 초기값
- [ ] ③ normalize: `transfer-tax-api-helpers.ts` — 환산 모드 분기에 C-01/C-02 처리
- [ ] ④ API 변환: `transfer-tax-api.ts` — body에 `commercialBuildingValuation` spread
- [ ] ⑤ UI 위젯: 신규 `CommercialBuildingValuationBlock.tsx` 또는 `CompanionAssetCard.tsx` 분기
- [ ] ⑥ 사이드바: 자산 종류 합계 라벨에 `"상업용건물·오피스텔"` 표시
- [ ] ⑦ 결과 카드: `commercialBuildingValuationDetail` 3-시점 표 + 환산취득가·개산공제 산식
- [ ] ⑧ validation: `transfer-tax-validate.ts` — `"commercial_building"` + 환산 모드 시 필수 필드

API/Route 6개:
- [ ] ⑨ Zod enum: `lib/api/transfer-tax-schema.ts` — `propertyType` enum에 `"commercial_building"` 추가
- [ ] ⑩ Zod enum companion: `transfer-tax-schema-sub.ts` — 컴패니언 스키마에도 동일 추가
- [ ] ⑪ acquisitionDate fallback: Route handler에서 `commercialBuildingValuation` 관련 Date 변환
- [ ] ⑫ Zod 객체 정의: `commercialBuildingValuation` 서브객체 Zod 스키마 명시 (미정의 시 침묵 stripping)
- [ ] ⑬ callTransferTaxAPI body spread: `commercialBuildingValuation` 를 fetch body에 포함
- [ ] ⑭ Route handler 엔진 input 매핑: `commercialBuildingValuation` → 엔진 input 전달

---

## Definition of Done 셀프 체크 (Do 종료 전 확인)

- [ ] 케이스 매트릭스 8행 (C-01 ~ C-08) enumerate 완료, 모든 분기 입력 가능 자가 시뮬
- [ ] anchor 20개 (핵심: 산출세액 **85,844,292** / 지방소득세 **8,584,429** / 총 **94,428,721** — 2022 적용 §55 / §103조의3 정확 세율)
- [ ] 14개 동기화 지점 모두 (특히 ⑫⑬⑭ TypeScript 미감지 영역 grep 자가 점검)
- [ ] `safeMultiply()` 오버플로 방지 확인 — `양도가액 × P_A` 중간값 검증
- [ ] 지방소득세 §103조의3 누진 함수 직접 호출 anchor (10% 단순 곱셈 가정 anchor 추가 작성)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/` 612+ 모두 통과
- [ ] 브라우저 수동: 폼 → 계산 → 결과, Network body에 `commercialBuildingValuation` 포함 확인

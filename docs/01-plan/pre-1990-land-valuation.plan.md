# 개별공시지가 고시 전 취득 토지 취득가액 환산 — 작업 계획서

> **Feature ID**: `pre-1990-land-valuation`
> **작성일**: 2026-04-20 (rev.2: 5가지 계산 유형 반영)
> **작성자**: Claude Code (Opus 4.7)
> **기반 자료**:
> - 『2023 양도·상속·증여세 이론 및 계산실무』 제6편 제3장 02 개별공시지가 고시 전 취득한 농지 취득실가 환산 사례 (pp.360–364)
> - 국세청 집행기준 97-176의2 「(4) 1990.8.30. 전 취득토지의 취득 당시 기준시가 산정예시」 — 5가지 유형
> - 소득세법 시행규칙 §80⑥ (비율·분모 capping 규정)

---

## 1. 배경 및 문제 정의

### 1.1 현재 엔진의 한계
- `lib/tax-engine/transfer-tax.ts`는 이미 **환산취득가** 기능을 보유
  - 입력 필드: `useEstimatedAcquisition`, `standardPriceAtAcquisition`, `standardPriceAtTransfer`
  - 공식: `취득가액 = 양도실가 × (취득시 기준시가 / 양도시 기준시가)`
- 그러나 **취득시 기준시가** 자체를 사용자가 직접 입력해야 함
- **1990.8.30 이전 취득 토지**는 개별공시지가가 존재하지 않아 기준시가를 직접 산정할 수 없음 → 현재 기능으로는 계산 불가

### 1.2 법적·실무적 맥락
- 1990년 이전: 토지대장의 **토지등급**(1~365등급) + 등급가액표로 지방세 과세시가표준액 산정
- 1990.8.30: 「지가공시 및 토지 등의 평가에 관한 법률」에 따라 **개별공시지가** 최초 고시
- 1990.8.30 이전 취득 토지의 취득시 기준시가는 **토지등급 환산 공식**으로만 산정 가능
- 관련 근거: 소득세법 §97·§99, 소득세법 시행령 §164·§176의2, 국세청 양도소득세 집행기준 97-176의2-x

### 1.3 계산 공식 (완전판)

```
[외곽] 취득가액 = 양도실가 × (취득기준시가 / 양도기준시가)

■ 양도기준시가 = 양도당시 개별공시지가 × 면적(㎡)
■ 취득기준시가 = ㎡당 가액 × 면적(㎡)
■ ㎡당 가액 = 1990.1.1. 개별공시지가 × 비율(ratio)

[핵심] 비율(ratio) 산정
  분모평균  = (90.8.30. 현재 등급가액 + 90.8.30. 직전 등급가액) / 2
  분모      = min(분모평균, 90.8.30. 현재 등급가액)   ← [CAP-1] 분모 capping
  비율원값  = 취득시 등급가액 / 분모
  비율최종  = min(비율원값, 1.0)  if 취득일 ≥ 1990.1.1.  ← [CAP-2] 비율 100% capping
             else 비율원값         (등급조정기간 상이 시 그대로 적용)
```

- **CAP-1 (분모 capping, 소칙 80⑥)**: 직전 > 현재일 때 평균이 현재를 초과 → 분모를 현재로 강제 (Case ③)
- **CAP-2 (비율 100% capping, 소칙 80⑥)**: 취득일이 1990.1.1. 이후이면 취득시 등급 == 90.8.30. 현재 등급 (동일 조정기간) → 비율이 100% 넘을 수 없음 (Case ④)
- **CAP-2 예외**: 취득일이 1990.1.1. 이전이면 비록 값이 우연히 같아도 조정기간이 다르므로 비율 > 100% 그대로 적용 (Case ⑤)

### 1.4 5가지 산정 유형 (국세청 집행기준 예시)

모든 예시는 1990.1.1. 개별공시지가 = 10,000원/㎡ 가정.

| # | 유형 | 현재 / 직전 / 취득시 | 취득일 | 분모 | 비율 | ㎡당 가액 | 비고 |
|---|------|----------------------|---------|--------|--------|-----------|--------|
| ① | 등급조정이 계속 없었던 경우 | 100,000 / 80,000 / 80,000 | 83.1.1. | 90,000 (평균) | 88.89% | **8,888** | 직전 = 취득시 (조정 없음) |
| ② | 90.1.1. 등급조정이 없는 경우 | 180,000 / 180,000 / 80,000 | 87.8.1. | 180,000 (평균=현재) | 44.44% | **4,444** | 직전 = 현재 (수시조정 동일 간주) |
| ③ | 분모가액이 90.8.30. 현재를 초과 (CAP-1) | 100,000 / 150,000 / 80,000 | 87.8.1. | **100,000** (현재로 cap) | 80% | **8,000** | 직전 > 현재 |
| ④ | 등급조정기간 동일 + 비율 100% 초과 (CAP-2 적용) | 100,000 / 90,000 / 100,000 | **1990.2.** | 95,000 | **100%** (cap) | **10,000** | 취득일 ≥ 90.1.1. |
| ⑤ | 등급조정기간 상이 + 비율 100% 초과 (CAP-2 예외) | 100,000 / 90,000 / 100,000 | 87.8.1. | 95,000 | 105.26% | **10,526** | 취득일 < 90.1.1. |

**CAP-2 트리거 판정 규칙**:
- `acquisitionDate >= 1990-01-01` ⇒ CAP-2 활성 (비율을 1.0으로 capping)
- `acquisitionDate < 1990-01-01` ⇒ CAP-2 비활성 (비율 그대로)
- 근거: 90.1.1. 이후 취득 시 "취득시 등급가액 == 90.8.30. 현재 등급가액"이 성립 (동일 정기조정 주기). 반면 90.1.1. 이전 취득은 다른 조정 주기에 속함.

### 1.5 PDF 사례 (Case ①-type) 재현
| 항목 | 값 |
|------|------|
| 양도일자 | 2023.02.16 |
| 취득일자 | 1988.12.03 (< 90.1.1. → CAP-2 비활성) |
| 양도실가 | 550,000,000원 |
| 면적 | 2,417㎡ |
| 2022.1.1 개별공시지가 | 241,700원/㎡ |
| 1990.1.1 개별공시지가 | 54,000원/㎡ |
| 1990.8.30 현재 토지등급 | 108등급 → 등급가액 **876** |
| 1990.8.30 직전 토지등급 | 103등급 → 등급가액 **689** |
| 취득일 현재 토지등급 | 103등급 → 등급가액 **689** |

**계산 흐름**
- 양도기준시가 = 241,700 × 2,417 = **584,188,900원**
- 분모평균 = (876+689)/2 = 782.5
- 분모 = min(782.5, 876) = **782.5** (CAP-1 미발동)
- 비율원값 = 689 / 782.5 = 88.05% (< 100%, CAP-2 무의미)
- ㎡당 가액 = 54,000 × 689 / 782.5 = **47,547원** (원단위 절사)
- 취득기준시가 = 47,547 × 2,417 = **114,921,099원**
- **취득가액 = 550,000,000 × 114,921,099 / 584,188,900 = 108,195,490원**

---

## 2. 목표 (Scope)

### 2.1 In-Scope
1. 토지등급 → 등급가액 변환 테이블 구축 (1~365등급)
2. 취득시 ㎡당 기준시가 환산 순수 함수 (Pre-1990 Land Valuation Engine)
3. 기존 `transfer-tax.ts`와의 연동 — `standardPriceAtAcquisition`을 자동 산출
4. UI: 양도소득세 마법사에서 토지 + 1990.8.30 이전 취득 시 전용 입력 섹션
5. 테스트: PDF 예제 재현 + 경계값 + 에러 케이스
6. 자주 쓰는 등급 빠른 입력 + 수동 등급가액 직접 입력 옵션

### 2.2 Out-of-Scope (차기 이슈 후보)
- 전국 토지대장 자동 조회 (Vworld/국토정보공사 API 연동) — 수동 입력만 지원
- 역사적 개별공시지가 전국 DB화 (사용자가 부동산공시가격 알리미에서 조회 후 입력)
- 상속세·증여세 재산평가에서의 토지등급 환산 (별도 이슈, Phase 2)
- 토지·건물 복합 양도의 건물 부분 환산 (기존 환산취득가 로직 그대로 사용)

---

## 3. 설계 개요 (2-Layer Pattern)

### 3.1 파일 구조
```
lib/tax-engine/
├── pre-1990-land-valuation.ts     # [NEW] 순수 환산 엔진
├── data/
│   └── land-grade-values.ts       # [NEW] 1~365등급 → 등급가액 테이블
└── transfer-tax.ts                 # [수정] preComputeStandardPrice() 호출

app/api/calc/transfer-tax/route.ts  # [수정] Zod 스키마에 Pre1990 필드 추가

components/calc/inputs/
└── Pre1990LandValuationInput.tsx  # [NEW] 전용 입력 컴포넌트

app/calc/transfer-tax/page.tsx      # [수정] 마법사에 조건부 렌더

__tests__/tax-engine/
├── pre-1990-land-valuation.test.ts # [NEW] 순수 엔진 테스트
└── transfer-tax.test.ts            # [수정] 통합 시나리오 추가
```

### 3.2 Pure Engine 인터페이스 (rev.2 — 5유형 반영)

```ts
// lib/tax-engine/pre-1990-land-valuation.ts

export interface Pre1990LandValuationInput {
  /** 취득일 (1990-08-30 이전이어야 함). CAP-2 트리거 판정에도 사용. */
  acquisitionDate: Date;
  /** 면적 (㎡, 정수 또는 소수 허용) */
  areaSqm: number;
  /** 양도일 (양도시 기준시가 산출용) */
  transferDate: Date;

  /** 1990.1.1. 개별공시지가 (원/㎡) */
  pricePerSqm_1990: number;
  /** 양도당시 개별공시지가 (원/㎡) */
  pricePerSqm_atTransfer: number;

  /** 1990.8.30. 현재 토지등급 (1~365) 또는 등급가액 직접 입력 */
  grade_1990_0830: number | { gradeValue: number };
  /**
   * 1990.8.30. 직전 토지등급.
   * - 1990.1.1. 정기조정이 없었다면 현재 등급과 동일하게 입력 (Case ②)
   * - 1990.1.1. 이전의 마지막 수시조정 값 (Case ①③④⑤)
   */
  gradePrev_1990_0830: number | { gradeValue: number };
  /** 취득시점 유효 토지등급 (취득일 직전에 결정된 등급) */
  gradeAtAcquisition: number | { gradeValue: number };

  /**
   * 선택: CAP-2(비율 100% cap) override.
   * 기본 판정 규칙: acquisitionDate >= 1990-01-01 ⇒ CAP-2 활성.
   * 드문 예외 케이스(수동 제어)에서만 사용.
   */
  forceRatioCap?: boolean;
}

export type CaseType = "case1_no_adjustment"
                     | "case2_no_1990_adjustment"
                     | "case3_denominator_cap"
                     | "case4_ratio_cap"
                     | "case5_ratio_no_cap"
                     | "standard"; // 5가지에 해당 안 되는 표준 경로

export interface Pre1990LandValuationResult {
  /** 취득시 기준시가 (원, 정수) = ㎡당 가액 × 면적 */
  standardPriceAtAcquisition: number;
  /** 양도시 기준시가 (원, 정수) = 양도당시 개별공시지가 × 면적 */
  standardPriceAtTransfer: number;
  /** ㎡당 가액 (원, 정수) */
  pricePerSqmAtAcquisition: number;

  /** 5유형 분류 결과 (UI/설명용) */
  caseType: CaseType;

  breakdown: {
    gradeValueAtAcquisition: number;
    gradeValue_1990_0830: number;
    gradeValuePrev_1990_0830: number;
    averageDenominator: number;       // (현재 + 직전) / 2
    appliedDenominator: number;       // min(평균, 현재)
    denominatorCap1Applied: boolean;  // CAP-1 발동 여부
    rawRatio: number;                 // 취득시 / appliedDenominator
    appliedRatio: number;             // min(rawRatio, 1.0) if CAP-2 else rawRatio
    ratioCap2Triggered: boolean;      // 취득일 >= 1990-01-01
    ratioCap2Applied: boolean;        // CAP-2가 실제로 비율을 낮췄는지
    formula: string;                  // 사람이 읽는 공식 문자열
  };

  /** 입력 경계 경고 (예: 취득일 >= 1990.8.30., 직전 > 현재 비정상 등) */
  warnings: string[];
}

export function calculatePre1990LandValuation(
  input: Pre1990LandValuationInput
): Pre1990LandValuationResult;

/** 1~365등급의 등급가액 조회 (범위 외 시 TaxCalculationError) */
export function getGradeValue(grade: number): number;

/** 5유형 자동 분류기 (breakdown 기반) */
export function classifyCaseType(
  breakdown: Pre1990LandValuationResult["breakdown"],
  acquisitionDate: Date
): CaseType;
```

### 3.3 분류 로직 의사코드

```
if (acquisitionDate >= 1990-01-01 && appliedRatio == 1.0 && rawRatio > 1.0)
  → case4_ratio_cap            (CAP-2 발동)
else if (acquisitionDate < 1990-01-01 && rawRatio > 1.0)
  → case5_ratio_no_cap         (CAP-2 예외)
else if (denominatorCap1Applied)
  → case3_denominator_cap      (CAP-1 발동)
else if (현재 == 직전)
  → case2_no_1990_adjustment
else if (직전 == 취득시)
  → case1_no_adjustment
else
  → standard
```

### 3.4 `transfer-tax.ts` 연동 지점
- `TransferTaxInput`에 선택 필드 추가:
  ```ts
  pre1990Land?: Pre1990LandValuationInput;
  ```
- 엔진 진입부(과세표준 산출 전)에서:
  - `pre1990Land`가 있으면 → `calculatePre1990LandValuation()` 호출
  - 결과의 `standardPriceAtAcquisition` / `standardPriceAtTransfer`를 기존 필드에 주입
  - `useEstimatedAcquisition = true`, `acquisitionPrice = 0`을 강제
- 하위 호환: 기존 사용자가 이 필드를 안 주면 동작 불변

### 3.5 정수 연산 및 절사 규칙
- CLAUDE.md 원칙 준수: **곱셈-후-나눗셈**, **중간 `Math.floor()`**
- ㎡당 가액은 원단위 절사 (PDF 예제 47,547원 재현)
- 면적은 소수 허용 → 곱셈 후 최종 `Math.floor()`
- 분모(평균)는 0.5 단위 가능 → `/ 2` 후 `Number` 유지 후 곱셈, 마지막에 절사
- Overflow 방지: `applyRate()` / `safeMultiply()` 계열 재사용

---

## 4. 데이터: 토지등급 → 등급가액 테이블

### 4.1 출처
- 지방세법 시행규칙 [별표] 토지등급가액표 (1990.8.30 기준 적용)
- 국세청 양도소득세 집행기준 97-176의2-x 부록
- `부동산공시가격 알리미` (부속 자료)

### 4.2 저장 방식
- `lib/tax-engine/data/land-grade-values.ts`에 정적 테이블로 하드코딩
  ```ts
  export const LAND_GRADE_VALUES: Record<number, number> = {
    1: <value>,
    // ...
    103: 689,
    108: 876,
    // ...
    365: <value>,
  };
  ```
- DB 화 여부: **불필요** — 역사적 확정 테이블이므로 변경되지 않음
- `getGradeValue(grade)` 함수로 접근, 존재하지 않는 등급은 `TaxCalculationError`

### 4.3 리스크
- 365등급 전체를 1차 커밋에 다 채우기 어려움
- **완화책**: Phase 1은 실무 빈출 구간(80~150등급) 우선, 수동 등급가액 직접 입력 옵션 제공, Phase 2에서 전체 등급 완성

---

## 5. UI 설계

### 5.1 진입 조건
- 마법사 `부동산 정보` 단계
- `propertyType === "land"` + `acquisitionDate < 1990-08-30` 자동 감지 시
- 안내 배너: "개별공시지가 고시(1990.8.30) 이전 취득 토지입니다. 토지등급 환산으로 취득가액을 산정합니다."
- 토글 버튼으로 일반 환산취득가 입력으로 전환 가능 (예외 케이스)

### 5.2 입력 폼 (`Pre1990LandValuationInput.tsx`)
1. **면적** (㎡, 이미 있으면 prefill)
2. **개별공시지가**
   - 1990.1.1 개별공시지가 (원/㎡)
   - 양도당시 개별공시지가 (원/㎡) — 양도일 5/31 이전이면 전년도 값 자동 안내 문구
3. **토지등급** (선택 UI: 등급번호 입력 → 등급가액 자동 표시 / 등급가액 직접 입력 모드)
   - 1990.8.30 현재 등급 (필수)
   - 1990.8.30 직전 등급 (필수, 기본값 = 현재 등급과 동일)
   - 취득일 현재 등급 (필수)
4. **도움말 링크**: 부동산공시가격 알리미, 토지대장 발급 안내

### 5.3 결과 표시
- PDF 사례와 동일한 수식 블록:
  ```
  취득가액 = 양도실가 × 취득기준시가 / 양도기준시가
           = 550,000,000 × 114,921,099 / 584,188,900
           = 108,195,490원
  ```
- 분모 capping 발생 시 해설 문구: "90.8.30 현재 등급가액(876) 대비 평균(782.5)이 작으므로 평균값이 분모로 사용됨"

### 5.4 UX 규칙 (CLAUDE.md/Global 준수)
- 날짜: `DateInput` 사용 (절대 `<input type="date">` 금지)
- 금액: `CurrencyInput` + `parseAmount()`
- StepWizard 뒤로/다음 버튼 유지
- 포커스 시 전체선택은 `SelectOnFocusProvider`가 전역 적용

---

## 6. API 스키마 변경

### 6.1 `app/api/calc/transfer-tax/route.ts`
- Zod 스키마에 `pre1990Land`(optional) 추가
- 서버에서도 `acquisitionDate < 1990-08-30` + `propertyType === "land"` 유효성 검증
- `preloadTaxRates()` 영향 없음 (등급가액은 정적 상수)

### 6.2 감면 공존
- 조특법 §69 (8년 자경농지 감면) 등 기존 감면 로직과 독립
- PDF 사례도 §69 100% 감면이 함께 적용됨 → 회귀 테스트에 포함

---

## 7. 테스트 전략

### 7.1 단위 테스트 (`pre-1990-land-valuation.test.ts`)

**A. 국세청 5가지 예시 재현 (1.4절 표 기준, 1990.1.1. 공시지가 = 10,000원/㎡)**

| 테스트 | 입력 | 기대 결과 |
|--------|------|-----------|
| Case ① (조정無) | 현재 100k / 직전 80k / 취득시 80k, 취득일 83.1.1. | ㎡당 8,888원, caseType = `case1_no_adjustment` |
| Case ② (90.1.1. 조정無) | 현재 180k / 직전 180k / 취득시 80k, 취득일 87.8.1. | ㎡당 4,444원, caseType = `case2_no_1990_adjustment` |
| Case ③ (CAP-1) | 현재 100k / 직전 150k / 취득시 80k, 취득일 87.8.1. | ㎡당 8,000원, caseType = `case3_denominator_cap`, cap1Applied=true |
| Case ④ (CAP-2 발동) | 현재 100k / 직전 90k / 취득시 100k, 취득일 **1990.2.1.** | ㎡당 10,000원, caseType = `case4_ratio_cap`, appliedRatio=1.0 |
| Case ⑤ (CAP-2 예외) | 현재 100k / 직전 90k / 취득시 100k, 취득일 **1987.8.1.** | ㎡당 10,526원, caseType = `case5_ratio_no_cap`, appliedRatio≈1.0526 |

**B. PDF 실사례 재현 (1.5절)**
- 입력: 현재 876 / 직전 689 / 취득시 689, 취득일 1988.12.3., 1990.1.1. 공시지가 54,000, 면적 2,417㎡
- 기대: ㎡당 가액 = **47,547원**, 취득기준시가 = **114,921,099원**, caseType = `case1_no_adjustment`

**C. 경계값·입력 검증**
1. 취득일 = 1990.1.1. (정확히) → CAP-2 활성
2. 취득일 = 1989.12.31. → CAP-2 비활성
3. 취득일 = 1990.8.29. (한계) → 엔진 정상 동작
4. 취득일 = 1990.8.30. → `warnings`에 "이후는 개별공시지가 직접 사용" 권고
5. 현재 == 직전 (조정 없음) → 분모 = 현재, cap1Applied = false
6. 직전 > 현재 (CAP-1 발동) → 반드시 appliedDenominator = 현재
7. 등급번호 존재하지 않음 (0, -1, 366, 999) → `TaxCalculationError`
8. 등급번호 1, 103, 108, 145, 365 (경계 샘플) → `getGradeValue` 일치
9. `{gradeValue: 876}` 직접 입력 → 번호 조회 생략
10. `forceRatioCap: true/false` override → 기본 판정 무시
11. 면적 0/음수, 공시지가 0/음수 → `TaxCalculationError`
12. 대면적 overflow (100,000㎡ × 1,000,000원/㎡) → BigInt fallback 정상

### 7.2 통합 테스트 (`transfer-tax.test.ts`)
1. `pre1990Land` 제공 시 `standardPriceAtAcquisition`이 자동 주입되어 기존 환산취득가 로직을 통과
2. 8년 자경농지 100% 감면(§69)과 결합한 PDF 사례 재현
3. 필요경비(개산공제) = 취득당시 기준시가 × 3% 확인
4. 지방소득세 4% 동반 확인

### 7.3 회귀 테스트
- `pre1990Land` 미제공 시 기존 339개 테스트 모두 통과

---

## 8. 문서·법령 트레이싱

### 8.1 `legal-codes.ts` 상수 추가
```ts
export const PRE_1990_LAND = {
  SECTION: "소득세법 시행령 §164·§176의2",
  GUIDELINE: "양도소득세 집행기준 97-176의2-X",
  FIRST_PUBLIC_NOTICE: "1990-08-30",
  REFERENCE_PRICE_DATE: "1990-01-01",
} as const;
```

### 8.2 법령 리서치 링크
- `/law` 페이지에서 "양도소득세 집행기준" 검색으로 연동
- `mcp__claude_ai_KoreanLaw__search_decisions` 기반 판례 링크 첨부 선택

---

## 9. 일정 (예상)

| 단계 | 산출물 | 예상 소요 |
|------|---------|----------|
| Design | `docs/02-design/features/pre-1990-land-valuation.design.md` 확정 | 0.5d |
| Do-1: Engine | `pre-1990-land-valuation.ts` + 등급가액 테이블 + 단위 테스트 | 1.0d |
| Do-2: transfer-tax 연동 | `transfer-tax.ts` 수정 + 통합 테스트 | 0.5d |
| Do-3: API | Zod 스키마 + API route 수정 | 0.3d |
| Do-4: UI | 전용 입력 컴포넌트 + 마법사 통합 + 결과 카드 | 1.0d |
| Check | gap-detector + QA (transfer-tax-qa) | 0.5d |
| Act | 회귀 이슈 수정 / 매치레이트 ≥90% 달성 | 0.3d |
| Report | PDCA 완료 보고서 + 메모리 저장 | 0.2d |
| **합계** | | **약 4.3d** |

---

## 10. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| ~~365등급 전체 등급가액 자료 미확보~~ | ~~중~~ | **해소됨** — 사용자 제공 자료로 1~365등급 전량 확보 (103=689, 108=876 PDF 일치 검증 완료) |
| 5가지 유형 분류 로직 오작동 (특히 Case ④ vs ⑤ 경계) | 상 | `classifyCaseType` 단위 테스트 필수 + 국세청 집행기준 예시 5건 전량 재현 고정 |
| CAP-2 트리거 판정 (취득일 ≥ 1990.1.1.) 해석 논란 | 중 | `forceRatioCap` override 제공 + 경계 테스트 (1990.1.1., 1989.12.31.) 고정 |
| 양도당시 개별공시지가 5/31 경계 해석 오류 | 중 | 입력 단계에서 양도일 `<= 05-31` 시 전년도 값 안내, 서버는 사용자 입력값 신뢰 |
| PDF 예제의 ㎡당 가액 47,547원 원단위 절사 규칙 검증 | 저 | 47,547 × 2,417 = 114,921,099 재확인 + 테스트로 고정 |
| 과거 수시조정 이력 (1985.7.1 수정 등) 반영 누락 | 중 | 취득시 등급가액은 사용자가 직접 입력 (토지대장 기반) — 책임 분담 |
| 기존 환산취득가 사용자와의 UI 혼선 | 중 | 조건부 분기(1990.8.30 이전 + land) + 토글로 전환 허용 |
| 200,000,000원 초과 등급 (365+ 외삽) 수요 | 저 | 365등급 = 200,000,000원 상한 안내, 초과 시 수동 입력 권고 (비고 규칙 별도 유틸) |

---

## 11. Approval 체크리스트

- [ ] 기능 범위(Scope) 동의
- [ ] 2-Layer 구조 + 파일 배치 동의
- [x] 토지등급 테이블 1~365등급 전량 확보 (사용자 제공 자료)
- [ ] **CAP-1(분모 capping) + CAP-2(비율 100% capping) 이중 규칙 동의**
- [ ] **CAP-2 트리거 규칙: `취득일 >= 1990-01-01` 단일 조건 동의** (또는 `forceRatioCap` 수동 override 허용)
- [ ] **5유형 자동 분류(`classifyCaseType`) + 국세청 예시 5건 테스트 고정 동의**
- [ ] UI 진입 조건(land + acquisitionDate < 1990-08-30) 동의
- [ ] 일정(약 4.3일) 동의
- [ ] 상속세·증여세 재산평가 확장은 Phase 2로 보류 동의

승인 후 `/pdca design` → `/pdca do` 순으로 진행합니다.

---

**참고**: 본 계획은 『2023 양도·상속·증여세 이론 및 계산실무』 제6편 제3장 사례 02(pp.360–364)의 공식을 기반으로 하며, 납세자 실무는 반드시 세무사·국세청 상담을 병행해야 합니다.

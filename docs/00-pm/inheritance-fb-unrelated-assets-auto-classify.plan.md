# 가업상속공제 사업무관자산 5종 자동 분류 (Plan v2)

> v1 → v2 정정 (2026-05-21 종합 검토):
> - **U1 구문 오류 정정**: `isLessee Employee NotExcluded` (공백) → `isLesseeEmployeeNotExcluded`
> - **U2 식별자 ASCII**: `isLeasedHouseUnderStdPrice6억` → `isLeasedHouseStdPriceUnder6Eok`
> - **U3 줄임표 제거**: `category: "..." | ...` → 5종 enum 전체 명시
> - **U4 cross-cutting 검증 Pre-Do**: non-business-land 엔진(양도세 도메인 — 개인 양도자 기준) vs 법인세법 §55의2(법인 기준) 호환성 본문 확인 강제
> - **U5 마목·라목 mutex 정책 강화**: 라목 분류된 자산은 마목 중복 분류 금지 명시
> - **N3 임직원 정의 cross-cutting 헬퍼 Pre-Do 추가**: `isQualifyingEmployee` (1% 미만 주주·비특수관계인)
> - **N4 가목 토지 일부 처분 분기 정책**: non-business-land 엔진 ratio 사용 시 부분 처분 정책 명시

> 작성일: 2026-05-21
> 대상 법령:
> - **상증령 §15⑤2호 가~마** (mst=283637, 시행 2026-02-27) — 5종 사업무관자산 + 단서 6건
> - **법인세법 §55의2** (비사업용토지)
> - **법인세법 시행령 §49** (업무무관 부동산) · **§61①2호** (업무무관 가지급금)
> - **소득세법 §99①** (기준시가 6억 단서 분기)
> - **주택법 §2 6호** (국민주택규모 정의)
>
> 산식 동결 commit: `d105df5` (사업무관자산 5종 수동 입력 헬퍼)
>
> 정책: `[[korean-law-citation-verify]]` · `[[single-source-engine-helper]]` · `[[pre-do-anchor-verification]]`

## 1. 배경 — 현행 갭

### 1-1. 현재 — 사용자가 5종 합계만 직접 입력

```typescript
calcFamilyBusinessStockValuation({
  rawStockValue, totalAssetValue,
  unrelatedAssets: {
    nonBusinessLand, leasedRealEstate,
    excessiveLoans, excessCash, unrelatedFinancialAssets,
  }
}, lawRef)
```

사용자가 법인세법·시행령 본문을 읽고 어떤 자산이 가~마 어디에 해당하는지 직접 판정 + 단서 6건 적용 후 합계 입력.

**갭 6건**:
1. **자산별 자동 분류 미구현** — EstateItem 단위로 가~마 어느 호인지 판정 불가
2. **단서 자동 적용 미구현** — 6건 (임직원 국민주택·기준시가 6억 단서 등)
3. **과다보유현금 5개년 평균 자동 산정** — §15⑤2호 라목
4. **임대 부동산 5년 무상임대 기간 자동 검증** — §15⑤2호 나목 단서
5. **법인세법 §55의2 cross-cutting** — 비사업용 토지 판정 (기존 non-business-land 엔진 재사용)
6. **임직원 정의 cross-cutting** — §15⑤2호 나목 단서 1)·2) (1% 이상 주주·최대주주 특수관계인 제외)

### 1-2. 법령 정합 (KoreanLaw MCP 2026-05-21 검증 완료 — 본문 본 PR 작성 시 재확인)

**§15⑤2호 가** — 「법인세법」 §55의2 해당 자산 (비사업용 토지)

**§15⑤2호 나** — 법인세법 시행령 §49 자산 + 타인 임대 부동산
- **단서**: 다음 모두 충족 시 제외
  - 해당 법인 소유 주택 + 주택법 §2 6호 국민주택규모 이하 또는 상속개시일 §99① 기준시가 6억 이하
  - 임직원 (1% 이상 주주·최대주주 특수관계인 제외)에게 5년 이상 계속 무상 임대

**§15⑤2호 다** — 법인세법 시행령 §61①2호 자산 (가지급금)
- **단서**: 임직원에게 대여한 다음 자산 제외
  - 본인·자녀 학자금
  - 대여일 당시 §99① 기준시가 6억 이하 주택 전세금 (등기 안 한 임대차보증금 포함)

**§15⑤2호 라** — 과다보유현금
- 상속개시일 직전 **5개 사업연도 말 평균 현금** (요구불예금·만기 3개월 이내 금융상품 포함)
- **100분의 200 초과분**만 사업무관자산

**§15⑤2호 마** — 영업활동 무관 주식·채권·금융상품 (라목 제외)

## 2. 데이터 모델 변경

### 2-1. `EstateItem`에 사업무관자산 분류 필드 (선택적)

```typescript
export interface EstateItem {
  // ... 기존
  /**
   * 사업무관자산 분류 (상증령 §15⑤2호 가~마).
   * familyBusinessCategory === "corporate_stock" + businessType === "corporate" 한정 의미.
   * 단서 적용 후 잔존 가액 (사용자가 단서 판정 결과 반영).
   * 자동 분류 모드: 본 필드 + unrelatedAssetExemption 토글로 자동 판정.
   */
  unrelatedAssetCategory?: "non_business_land" | "leased_real_estate" | "excessive_loans" | "excess_cash" | "unrelated_financial";
  /** 단서 적용 면제 (사용자 명시) */
  unrelatedAssetExempted?: boolean;
  /** 면제 사유 */
  unrelatedAssetExemptionReason?: "employee_kook_min_house" | "employee_loan_education" | "employee_loan_jeonse" | "other";
}
```

### 2-2. 신규 헬퍼 — `lib/tax-engine/deductions/family-business-unrelated-classify.ts`

```typescript
export type UnrelatedAssetCategory =
  | "non_business_land"
  | "leased_real_estate"
  | "excessive_loans"
  | "excess_cash"
  | "unrelated_financial";

export type UnrelatedAssetExemptionReason =
  | "employee_kook_min_house"     // 나목 단서 — 임직원 국민주택 무상임대
  | "employee_loan_education"     // 다목 단서 — 임직원 학자금
  | "employee_loan_jeonse"        // 다목 단서 — 임직원 6억 이하 전세금
  | "other";

export interface CorporateAssetInput {
  /** 자산 ID */
  id: string;
  /** 자산 가액 (상속개시일 기준) */
  value: number;
  /** 자산 유형 */
  assetType: "land" | "building" | "loan" | "cash_equivalent" | "stock_bond" | "other";
  // ─ 가목 — 비사업용 토지 자동 판정 ─
  /**
   * non-business-land 엔진 통합용 — 토지 자산에만 적용.
   * U4 정정: cross-cutting 시 법인세법 §55의2 기준 vs 소득세법 §104의3 기준 호환성 사전 확인.
   * 본 PR 잠정 정책: 토지 자산은 사용자 직접 isNonBusiness boolean 입력 + ratio 입력 (자동 판정은 Pre-Do FB-UA-LAW-1 통과 후 결정).
   */
  isNonBusinessLand?: boolean;
  /** 부분 처분 시 비사업용 비율 (0~1) — N4 보강 */
  nonBusinessLandRatio?: number;
  // ─ 나목 — 임대 부동산 단서 (U1·U2 정정) ─
  isLeasedToThirdParty?: boolean;
  isLeasedHouseUnderNationalSize?: boolean;
  isLeasedHouseStdPriceUnder6Eok?: boolean;  // U2 — ASCII 식별자
  isLesseeEmployeeNotExcluded?: boolean;     // U1 — 공백 제거, 1% 미만 주주·비특수관계인
  leaseFreeYears?: number;                   // 무상임대 기간
  // ─ 다목 — 가지급금 단서 ─
  isEmployeeLoan?: boolean;
  loanPurpose?: "education" | "house_jeonse" | "other";
  loanHouseStdPrice?: number;
  // ─ 라목 — 과다보유현금 5개년 평균 ─
  fiveYearAverageCash?: number;
  // ─ 마목 — 영업무관 금융자산 (라목 mutex — U5 강화) ─
  /** 라목 분류 시 본 자산은 마목에서 자동 제외 (U5) */
  isAlsoExcessCash?: boolean;
}

export interface UnrelatedAssetClassificationResult {
  /** 5종별 합계 (단서 적용 후) */
  breakdown: UnrelatedAssetsBreakdown;
  /** 자산별 분류 명세 — U3 줄임표 제거 */
  perAssetDetail: Array<{
    id: string;
    category: UnrelatedAssetCategory;
    rawValue: number;
    exemptedValue: number;
    finalUnrelatedValue: number;
    exemptionReason?: UnrelatedAssetExemptionReason;
  }>;
  total: number;
}

export function classifyUnrelatedAssets(
  assets: CorporateAssetInput[],
): UnrelatedAssetClassificationResult { ... }

/**
 * N3 보강 — 임직원 자격 판정 cross-cutting 헬퍼.
 * 상증령 §15⑤2호 나목 단서 1·2 — 1% 이상 주주 + 최대주주 특수관계인 제외.
 * 본 헬퍼는 별도 모듈 — 가업상속공제·증여세 등 cross-cutting 가능.
 */
export interface EmployeeQualificationInput {
  employeeShareRatio: number;          // 발행주식 보유 비율 (0~1)
  isMaxShareholderRelative: boolean;   // 상증령 §2의2①1호 관계
}

export function isQualifyingEmployee(input: EmployeeQualificationInput): boolean {
  if (input.employeeShareRatio >= 0.01) return false;  // 1% 이상 주주 제외
  if (input.isMaxShareholderRelative) return false;    // 최대주주 특수관계인 제외
  return true;
}
```

### 2-3. 과다보유현금 라목 산정 헬퍼

```typescript
/**
 * §15⑤2호 라목 과다보유현금 = 현재 현금 보유액 − (5개년 평균 × 2)
 */
export function calcExcessCash(
  currentCash: number,           // 상속개시일 현재 현금 + 요구불예금 + 3개월내 금융상품
  fiveYearAverageCash: number,   // 직전 5개 사업연도 말 평균
): number {
  const threshold = fiveYearAverageCash * 2;
  return Math.max(0, currentCash - threshold);
}
```

## 3. 단서 자동 적용 매트릭스

| 호 | 단서 | 입력 필드 | 자동 판정 조건 |
|----|------|----------|--------------|
| 나목 | 임직원 국민주택 무상임대 | `isLeasedHouseUnderNationalSize ∥ <6억 + isLesseEmployee 1%↓ + ≥5년 무상` | 모두 true → 제외 |
| 다목-1 | 임직원 자녀 학자금 | `isEmployeeLoan + loanPurpose="education"` | true → 제외 |
| 다목-2 | 임직원 6억 이하 주택 전세금 | `loanPurpose="house_jeonse" + loanHouseStdPrice ≤ 6억` | 모두 true → 제외 |
| 라목 | 5개년 평균 × 200% 초과분만 | `currentCash − 5yrAvg × 2` (가드 ≥0) | 자동 산정 |
| 마목 | 라목 중복 제외 | 라목 적용 후 잔여만 마목 | 순차 적용 |

## 4. cross-cutting

### 4-1. non-business-land 엔진 재사용 (§15⑤2호 가목)

기존 `lib/tax-engine/non-business-land/engine.ts` 호출:
```typescript
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
// CorporateAssetInput.assetType === "land" 자산만 호출
// 결과 isNonBusiness=true → 가목 분류
```

### 4-2. 임직원 정의 cross-cutting (§15⑤2호 나목 단서 1·2)

상증령 §2의2①1호 "관계" + 발행주식 1% 이상 주주 제외 — 별도 헬퍼 `isQualifyingEmployee(employee, corp)`.

## 5. Pre-Do anchor

1. **FB-UA-CLASSIFY-1**: 토지 자산 + isNonBusinessLand=true → 가목 분류
2. **FB-UA-CLASSIFY-2**: 임대 부동산 + 국민주택규모 + 5년 무상임대 + 임직원 → 나목 단서 적용 면제
3. **FB-UA-CLASSIFY-3**: 임직원 자녀 학자금 대여 → 다목 단서 면제
4. **FB-UA-CLASSIFY-4**: 6억 이하 주택 전세금 → 다목 단서 면제
5. **FB-UA-CASH-1**: 현재 현금 30억 + 5년 평균 10억 → 라목 = 30 − 20 = 10억
6. **FB-UA-CASH-2**: 현재 현금 15억 + 5년 평균 10억 → 라목 = 0 (200% 미만)
7. **FB-UA-MUTEX-1 ★ U5**: 라목 분류 자산(isAlsoExcessCash=true)은 마목 중복 분류 금지 (§15⑤2호 마 본문 단서)
8. **FB-UA-LAW-1 ★ U4·U6**: KoreanLaw MCP로 §15⑤2호 가~마 본문 + 단서 6건 재확인 + 가목 토지 판정 기준이 법인세법 §55의2(법인 기준) vs 소득세법 §104의3(개인 양도자 기준) 호환성 본문 확인. **PASS 조건**: 본문 매칭 후 cross-cutting 가능 또는 별도 법인 기준 헬퍼 필요 판정
9. **FB-UA-EMPLOYEE-1 ★ N3**: 1% 이상 주주에게 무상임대 → `isQualifyingEmployee=false` → 나목 단서 미적용 (사업무관 산입)
10. **FB-UA-EMPLOYEE-2**: 최대주주 특수관계인 → `isQualifyingEmployee=false`
11. **FB-UA-LEASE-LT5Y-1**: 5년 미만 무상임대 → 나목 단서 미적용
12. **FB-UA-PARTIAL-1 ★ N4**: 가목 토지 부분 처분 — `nonBusinessLandRatio=0.6` → 가액의 60%만 사업무관 산입

## 6. UI 통합

본 PR scope:
- EstateItem 카드에 사업무관자산 분류 select 추가 (corporate_stock 자산 한정 노출)
- 5종 자동 분류 결과 미리보기 카드 (자산별 분류·면제 사유 표시)

본 PR scope 외:
- 단서 자동 판정 UI 위젯 (임직원 정보·국민주택 판정·5년 평균 입력 등)
- 별도 PR로 분리 — UI 시니어 위임

## 7. 14개 동기화 지점

- ① EstateItem에 3필드 추가 (unrelatedAssetCategory·Exempted·ExemptionReason)
- ②③ initial/normalize
- ④ inheritance-api body 자동 carry
- ⑤ EstateItem 카드 select (corporate_stock 한정)
- ⑥ 사이드바 미영향
- ⑦ 결과 카드 — `UnrelatedAssetClassificationResult.perAssetDetail` 표
- ⑧ validate — 분류 vs assetType 정합성 (예: land 자산에 cash 분류 차단)
- ⑨ Zod enum 추가 (unrelatedAssetCategory 5종 + exemptionReason 4종)
- ⑩⑫ Zod schema 확장
- ⑬⑭ API/route 자동 carry

## 8. 위험

| ID | 위험 | 대응 |
|----|------|------|
| R1 | 단서 6건 자동 판정 정확성 | Pre-Do FB-UA-LAW-1 본문 재확인 + 각 단서 anchor 1건씩 |
| R2 | non-business-land 엔진 재사용 시 API 호환 | 결과 ratio 사용 시 토지 일부 처분 분기 명시 |
| R3 | 라목·마목 중복 분류 | FB-UA-MUTEX-1 anchor 강제 |
| R4 | 임직원 정의 cross-cutting 충돌 | 별도 헬퍼 `isQualifyingEmployee` 단일 진실 |
| R5 | 5년 평균 데이터 미가용 | 사용자 직접 입력 + 산정 산식 명시 |

## 9. 후속 PR

- 단서 자동 판정 UI 위젯 (UI 시니어 위임)
- 임직원 정보 입력 모달 (1% 이상 주주·특수관계인 자동 판정)
- 5년 평균 현금 자동 산정 (재무제표 입력 ↔ 자동 계산)

## 10. 작업 분해

1. Plan/Design — `inheritance-gift-tax-senior` 단독 (UI는 후속)
2. Pre-Do — FB-UA-LAW-1 (본문 재확인) + FB-UA-CLASSIFY-1~10 anchor
3. Do — classifyUnrelatedAssets·calcExcessCash 헬퍼 + non-business-land cross-cutting + Zod
4. Check — anchor 10건 + 전체 회귀
5. Act — UI 단서 자동 판정 후속 PR 트리거

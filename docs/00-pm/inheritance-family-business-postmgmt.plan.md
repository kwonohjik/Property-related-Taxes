# 가업상속공제 사후관리 시뮬레이터 — Phase F UI + orchestrator 메타 + 정규직 평균 (Plan v2)

> 작성일: 2026-05-21
> v1 → v2 정정 (종합 검토):
> - **P1 enum 17종 정정** (1호 7건 + 2호 3건 + 3호 7건 = 17, "21종" 오기)
> - **P3 OFZ 활성 carry 보강** — postmgmt input에 `ofzExemptionActive` 명시 + Step1 표시
> - **P4 함수명 통일** — `evaluateEmploymentDrop` → `calcRegularEmployeeAverage` + `isEmploymentDropViolation` 두 헬퍼 직접 호출
> - **P5 cgtCreditAmount 입력 위치** — Step1 (선택 입력, 또는 후속 PR 자동 prefill 대기)
> - **P6 필드명 통일** — `inheritanceFilingDate` → `filingDeadline` 단일화
> - **N1 PHF-EMPLOY-3 anchor 추가** (분할·합병 §15⑱)
> - **N2 자본적지출 분리 보강** (transfer plan 참조 — 본 PR scope 외 명시)
> - **E1 Plan #4 흡수** — orchestrator-tracking (InheritanceTaxResult.familyBusinessPostMgmtMeta) 통합
> - **C1 분담**: transfer-tax 측 산정 → postmgmt 측 수동 입력 (이력 자동 prefill은 후속 PR)
> - **C2 자동 prefill**: 본 PR은 수동 입력만. 자동 연동 후속 PR로 통일
> - **C3 OFZ 면제 양쪽 적용**: 엔진 자동 면제 + UI disable (이중 가드)
>
> 대상 법령 (KoreanLaw MCP 2026-05-21 검증):
> - **상증법 §18의2⑤⑥⑦⑨⑩** (mst=276123) — 5년 사후관리 4호 위반·신고 6개월·양도세 환원
> - **상증법 §67** — 상속세 신고기한 = 사망일이 속하는 달의 말일부터 6개월
> - **상증령 §15⑧⑩⑪⑫⑬⑮⑯⑰⑱㉕** (mst=283637) — 정당사유·자산처분비율·미종사판정·지분감소·정규직·추징·이자·평균·OFZ
>
> 산식 동결 commit: `76f7282` (Phase F 헬퍼) + `bbdabe0` (CGT credit) + `d105df5` (사업무관자산)
>
> 정책: `[[korean-law-citation-verify]]` · `[[single-source-engine-helper]]` · `[[mirror-pattern]]` · `[[pre-do-anchor-verification]]` · `[[feedback_three_state_optional_mode_toggle]]`

## 1. 배경 — 현행 갭

### 1-1. 분리 상태

산식 헬퍼는 동결 (Phase F + CGT + 사업무관자산 anchor 29건 PASS) — 그러나:

**갭 9건**:
1. **InheritanceTaxResult 메타 누락** — 가업상속공제 적용 사례에서 사후관리 시뮬레이터로 넘길 출처 데이터 (appliedDeduction·신고기한·OFZ·자산목록) 미노출
2. **UI 시뮬레이터 부재** — 사용자가 5년 추적 입력할 마법사 페이지 없음
3. **orchestrator 미통합** — 추징 산정 명령이 `calcInheritanceTax` 또는 별도 진입점에 미연결
4. **정규직 평균 산정 미구현** — §15⑬ 정의·§15⑰ 평균 산식·§15⑱ 분할·합병
5. **재차 부과 처리 미구현** — §15⑩ 단서 (종전 처분 자산 제외)
6. **정당사유 자동 면제 미구현** — §15⑧ 1~3호 17종 enum
7. **OFZ 사후관리 면제 미구현** — §15㉕ → §15⑪1호 (대표이사 미종사) + §15⑪2호 (업종 변경) 자동 면제. **§15⑪3호 (1년 휴/폐업)는 면제 대상 아님**
8. **신고기한 산식 오류** — 단순 `addMonths(deathDate, 6)`이 아닌 **`endOfMonth(deathDate) + 6 months`** (상증법 §67)
9. **직접입력 모드 정책 미정** — `usedDirectInput=true` 가업상속공제 사례의 사후관리 적용 방침 (요건 우회 → 사후관리 적용)

### 1-2. 법령 정합 (Phase F 산식 동결 시 + 본 PR 추가 검증)

- 상증법 §18의2⑤ 1~4호 위반 유형 (4호 정규직&총급여 AND)
- 상증법 §18의2⑨ 신고 6개월 (사유 발생일이 속하는 달 말일부터 6개월)
- 상증법 §67 신고기한 (사망일이 속하는 달 말일부터 6개월)
- 상증령 §15⑮ 추징율 100분의 100 일률
- 상증령 §15⑩ 자산처분비율 = disposed / total (재차 부과 시 종전 제외)
- 상증령 §15⑯ 이자상당액 = 결정세액 × 일수 × (국세기본법 §43의3② 이자율 / 365)
- 상증령 §15⑬ 정규직 정의 + §15⑰ 평균 산식 (월 말일 인원 합 / 월수) + §15⑱ 분할·합병
- 상증령 §15⑧ 정당사유 1~3호 **17종** (1호 가~사 7건 / 2호 가~다 3건 / 3호 가~사 7건)
- 상증령 §15㉕ OFZ → §15⑪1호·2호 적용 배제 + 업종 변경 자유 (3호는 면제 대상 아님)
- 소법 §97의2④ + 상증령 §15㉑ — 양도세 환원 공제 (별도 plan transfer-fb-cgt-credit-integration)

## 2. 데이터 모델

### 2-1. InheritanceTaxResult 메타 추가 (Plan #4 흡수)

```typescript
export interface InheritanceTaxResult {
  // ... 기존
  /**
   * 가업상속공제 사후관리 트래킹 메타 (E1 — orchestrator-tracking 흡수).
   * familyBusinessDeduction > 0 시에만 채워짐 (직접입력 모드 포함).
   * UI 사후관리 시뮬레이터의 prefill 소스. 자동 이력 연동은 후속 PR.
   */
  familyBusinessPostMgmtMeta?: FamilyBusinessPostMgmtMeta;
}

export interface FamilyBusinessPostMgmtMeta {
  /** 가업상속공제 적용액 (추징 원금) */
  appliedDeduction: number;
  /** 상속세 신고기한 — 상증법 §67 (사망일이 속하는 달 말일 + 6개월) */
  filingDeadline: string;        // ISO date
  /** OFZ 특례 활성 (§15㉕ → §15⑪1호·2호 사후관리 면제 사전 정보) */
  ofzExemptionActive: boolean;
  /** 직접입력 모드 (usedDirectInput) — 요건 우회 사례도 사후관리 대상 */
  usedDirectInput: boolean;
  /** 가업상속재산 자산 (이력 — 자산처분 비율 산정 기준) */
  inheritedAssets: Array<{ id: string; value: number; type: PostMgmtAssetType }>;
}

/** 사후관리 자산 타입 (EstateItem.category → 매핑) */
export type PostMgmtAssetType = "land" | "building" | "stock" | "other";

/** 매핑 함수 (mapAssetType — T5 정의) */
export function mapEstateItemToPostMgmtType(category: AssetCategory): PostMgmtAssetType {
  switch (category) {
    case "real_estate_land": return "land";
    case "real_estate_building":
    case "real_estate_apartment": return "building";
    case "listed_stock":
    case "unlisted_stock": return "stock";
    default: return "other";
  }
}
```

### 2-2. FamilyBusinessPostMgmtInput

```typescript
export interface FamilyBusinessPostMgmtInput {
  /** 가업상속공제 적용액 */
  appliedDeduction: number;
  /** 상속세 신고기한 (사망일이 속하는 달 말일 + 6개월, 상증법 §67) */
  filingDeadline: string;
  /** OFZ 특례 활성 — §15⑪1호·2호 자동 면제 (P3 보강) */
  ofzExemptionActive: boolean;
  /** 5년 추적 — 위반 시점·유형·정당사유 */
  violations: ViolationEvent[];
  justifiableReasons?: JustifiableReasonEvent[];
  /** 정규직 트래킹 (§15⑬⑰⑱) */
  employmentTracking?: EmploymentTracking;
  /** 양도세 상당액 환원 공제 (§18의2⑩, transfer-tax 측에서 산정) — 수동 입력 */
  cgtCreditAmount?: number;
  /** 국세기본법 §43의3② 이자율 */
  annualInterestRate: number;
}

export interface ViolationEvent {
  date: string;
  /** §18의2⑤ 1~4호 + §15⑪ sub-type */
  type: FamilyBusinessViolationType;
  /**
   * §15⑪ sub-type (type="business_cessation" 한정).
   * OFZ 자동 면제는 ceo_not_serving·industry_change만 적용. business_pause는 면제 대상 아님.
   * (T3 정정 — sub-type 구분)
   */
  cessationSubType?: "ceo_not_serving" | "industry_change" | "business_pause";
  // 1호 자산처분 한정
  disposedAssetValue?: number;
  totalBusinessAssetValue?: number;
  // §15⑩ 단서 — 재차 부과 시 종전 처분 자산 제외
  priorDisposedExcluded?: number;
}

export interface JustifiableReasonEvent {
  violationRef: number;
  reasonCode: JustifiableReasonCode;
}

/**
 * §15⑧ 정당사유 17종 enum (P1 정정 — "21종" → 17종).
 * KoreanLaw MCP 검증 — 1호 가~사 7건 + 2호 가~다 3건 + 3호 가~사 7건.
 */
export type JustifiableReasonCode =
  // §15⑧ 1호 가~사 (자산처분 위반 예외 7건)
  | "expropriation"             // 가. 수용·협의매수·국가지자체 양도·시설개체·사업장이전
  | "state_donation_asset"      // 나. 국가지자체 증여
  | "heir_death"                // 다. 가업상속인 사망
  | "reorganization"            // 라. 합병·분할·통합·법인전환
  | "useful_life"               // 마. 내용연수 도래
  | "industry_change_replace"   // 바. 업종 변경 대체취득
  | "rnd_use"                   // 사. 처분금액 R&D 사용 (조특법 §10)
  // §15⑧ 2호 가~다 (가업 미종사 위반 예외 3건)
  | "heir_death_cessation"      // 가. 가업상속인 사망
  | "state_donation_cessation"  // 나. 국가지자체 증여
  | "military_illness"          // 다. 병역·질병 부득이한 사유
  // §15⑧ 3호 가~사 (지분 감소 위반 예외 7건)
  | "reorg_share_transfer"      // 가. 조직변경 주식 처분
  | "third_party_dilution"      // 나. 특수관계인 외 유상증자 희석
  | "heir_death_succession"     // 다. 상속인 사망 (승계자 종사)
  | "state_donation_share"      // 라. 국가지자체 증여
  | "listing_dilution"          // 마. 상장요건 충족 감자
  | "uniform_capital_decrease"  // 바. 균등 감자
  | "court_decision"            // 사. 법원결정 무상감자·출자전환
  // OFZ 자동 면제
  | "ofz_exemption";            // 본 PR 자동 추가 (§15㉕)

export interface EmploymentTracking {
  fiveYearData: MonthlyEmploymentData[];
  priorTwoYearData: MonthlyEmploymentData[];
  fiveYearTotalSalary: number;
  priorTwoYearTotalSalary: number;
}

export interface MonthlyEmploymentData {
  monthEnd: string;          // YYYY-MM
  regularEmployees: number;
  /** 분할·합병 승계 인원 (§15⑱) */
  spinoffMerged?: number;
}

export interface FamilyBusinessPostMgmtResult {
  totalRecapture: number;
  totalInterest: number;
  cgtCreditApplied: number;
  netRecapture: number;
  perViolationDetail: Array<{
    event: ViolationEvent;
    exempted: boolean;
    exemptionReason?: JustifiableReasonCode;
    recapture: number;
    interest: number;
  }>;
  employmentResult?: {
    fiveYearAvg: number;
    priorTwoYearAvg: number;
    threshold: number;       // priorTwoYearAvg × 0.9
    employmentDrop: boolean;
    salaryDrop: boolean;
    bothViolated: boolean;   // §18의2⑤ 4호 AND
  };
}
```

## 3. 신규 모듈

### 3-1. 정규직 평균 산정 — `family-business-employment.ts` (P4 정정)

```typescript
/** §15⑰ 평균 — 월 말일 인원 합 / 월수 (§15⑱ 분할·합병 승계 인원 포함) */
export function calcRegularEmployeeAverage(
  monthlyData: MonthlyEmploymentData[],
): number {
  if (monthlyData.length === 0) return 0;
  const sum = monthlyData.reduce(
    (s, m) => s + m.regularEmployees + (m.spinoffMerged ?? 0),
    0,
  );
  return sum / monthlyData.length;
}

/** §15⑤ 4호 가목 — 5년 평균 < 직전 2개 평균 × 100분의 90 */
export function isEmploymentDropViolation(
  fiveYearAverage: number,
  priorTwoYearAverage: number,
): boolean {
  return fiveYearAverage < priorTwoYearAverage * 0.9;
}

/** §15⑤ 4호 나목 — 5년 총급여 < 직전 2년 총급여 × 100분의 90 */
export function isSalaryDropViolation(
  fiveYearSalary: number,
  priorTwoYearSalary: number,
): boolean {
  return fiveYearSalary < priorTwoYearSalary * 0.9;
}
```

### 3-2. orchestrator — `family-business-postmgmt-orchestrator.ts`

```typescript
import { calcFamilyBusinessRecapture, calcFamilyBusinessInterest } from "./family-business-postmanagement";
import { calcRegularEmployeeAverage, isEmploymentDropViolation, isSalaryDropViolation } from "./family-business-employment";

export function calcFamilyBusinessPostMgmt(input: FamilyBusinessPostMgmtInput): FamilyBusinessPostMgmtResult {
  // §15⑩ 단서 — 재차 부과 분류 (자산처분 type 한정)
  const priorAssetDisposalSum = input.violations
    .filter(v => v.type === "asset_disposal")
    .reduce((s, v) => s + (v.priorDisposedExcluded ?? 0), 0);

  const perViolationDetail = input.violations.map((v, i) => {
    // 1순위: 사용자 명시 정당사유
    const reason = input.justifiableReasons?.find(j => j.violationRef === i);
    if (reason) {
      return { event: v, exempted: true, exemptionReason: reason.reasonCode, recapture: 0, interest: 0 };
    }

    // 2순위: OFZ 자동 면제 (§15㉕ — §15⑪1호·2호만, 3호 휴/폐업은 제외) — T3 정정
    if (input.ofzExemptionActive
        && v.type === "business_cessation"
        && (v.cessationSubType === "ceo_not_serving" || v.cessationSubType === "industry_change")) {
      return { event: v, exempted: true, exemptionReason: "ofz_exemption", recapture: 0, interest: 0 };
    }

    // 추징 산정
    const recapture = calcFamilyBusinessRecapture({
      appliedDeduction: input.appliedDeduction,
      violationType: v.type,
      assetDisposalRatio: v.type === "asset_disposal"
        ? calcAssetDisposalRatio(
            (v.disposedAssetValue ?? 0) - (v.priorDisposedExcluded ?? 0),
            (v.totalBusinessAssetValue ?? 0) - priorAssetDisposalSum,
          )
        : undefined,
    }, INH.FAMILY_BUSINESS_DEDUCTION);

    // 이자상당액 — 신고기한 다음날 ~ 위반일 일수
    const days = daysBetween(input.filingDeadline, v.date);
    const interest = calcFamilyBusinessInterest({
      determinedTax: recapture.recaptureAmount,
      daysFromFilingDeadlineToViolation: days,
      annualInterestRate: input.annualInterestRate,
    }, INH.FAMILY_BUSINESS_DEDUCTION);

    return { event: v, exempted: false, recapture: recapture.recaptureAmount, interest: interest.interestAmount };
  });

  // 정규직&총급여 4호 AND
  let employmentResult: FamilyBusinessPostMgmtResult["employmentResult"];
  if (input.employmentTracking) {
    const fiveYearAvg = calcRegularEmployeeAverage(input.employmentTracking.fiveYearData);
    const priorTwoYearAvg = calcRegularEmployeeAverage(input.employmentTracking.priorTwoYearData);
    const employmentDrop = isEmploymentDropViolation(fiveYearAvg, priorTwoYearAvg);
    const salaryDrop = isSalaryDropViolation(
      input.employmentTracking.fiveYearTotalSalary,
      input.employmentTracking.priorTwoYearTotalSalary,
    );
    employmentResult = {
      fiveYearAvg, priorTwoYearAvg, threshold: priorTwoYearAvg * 0.9,
      employmentDrop, salaryDrop,
      bothViolated: employmentDrop && salaryDrop,
    };
  }

  // §18의2⑩ 양도세 환원 공제 (transfer-tax 측에서 산정한 cgtCreditAmount 사용)
  const totalRecapture = perViolationDetail.reduce((s, v) => s + v.recapture, 0);
  const totalInterest = perViolationDetail.reduce((s, v) => s + v.interest, 0);
  const cgtCreditApplied = Math.min(totalRecapture, input.cgtCreditAmount ?? 0);
  const netRecapture = Math.max(0, totalRecapture - cgtCreditApplied);

  return { totalRecapture, totalInterest, cgtCreditApplied, netRecapture, perViolationDetail, employmentResult };
}
```

### 3-3. inheritance-tax.ts orchestrator — STEP ⑧ 후 메타 set (E1)

```typescript
import { endOfMonth, addMonths, parseISO, formatISO } from "date-fns";

const deductionResult = calcInheritanceDeductions(...);

// 가업상속공제 적용 시 사후관리 메타 set
if (deductionResult.familyBusinessDeduction > 0 && deductionResult.familyBusinessDetail) {
  const detail = deductionResult.familyBusinessDetail;
  // T1 정정 — 신고기한 = 사망일이 속하는 달의 말일 + 6개월 (상증법 §67)
  // T2 정정 — string → Date 변환 명시
  const deathDateObj = parseISO(input.deathDate);
  const filingDeadlineObj = addMonths(endOfMonth(deathDateObj), 6);
  result.familyBusinessPostMgmtMeta = {
    appliedDeduction: detail.deduction,
    filingDeadline: formatISO(filingDeadlineObj, { representation: "date" }),
    ofzExemptionActive: detail.ofzExemptionActive ?? false,
    usedDirectInput: detail.usedDirectInput,
    inheritedAssets: input.estateItems
      .filter(i => i.familyBusinessCategory !== undefined)
      .map(i => ({
        id: i.id,
        value: i.marketValue ?? 0,
        type: mapEstateItemToPostMgmtType(i.category),
      })),
  };
}
```

## 4. UI 시뮬레이터 — `/calc/inheritance-postmgmt` 4단계 마법사

### 4-1. Step 1 — 기본 정보 (P3·P5·P6 정정)

- `appliedDeduction` CurrencyInput
- `filingDeadline` DateInput (자동 계산 옵션 — deathDate 입력 시 endOfMonth + 6m)
- `ofzExemptionActive` ToggleCard emerald (P3 보강) — meta carry 가능
- `usedDirectInput` ToggleCard violet (직접입력 모드 사례 표시)
- `cgtCreditAmount` CurrencyInput (선택, P5 — transfer-tax 측 결과 수동 입력)
- `annualInterestRate` DecimalInput (예: 0.022)

### 4-2. Step 2 — 위반 시점 입력

- 사건 배열 (반복 추가)
- 각 사건: 날짜 + 위반 유형 RadioCardGroup (4종)
- type="business_cessation" 시 cessationSubType 라디오 추가 (3종)
- type="asset_disposal" 시 disposedAssetValue + totalBusinessAssetValue + priorDisposedExcluded
- 사건마다 정당사유 select (17종 + "사유 없음")
- OFZ 활성 시 cessationSubType ∈ {ceo_not_serving, industry_change} 자동 면제 안내 배지

### 4-3. Step 3 — 정규직·총급여 (간이 vs 정밀 모드)

- ToggleCard "정밀 모드" — 월별 60개월 입력 (5년 + 직전 2년 24개월)
- OFF 시 합계만 입력 (간이): fiveYearAverage·priorTwoYearAverage·fiveYearTotalSalary·priorTwoYearTotalSalary
- §15⑱ 분할·합병 승계 인원 토글 (정밀 모드 한정)

### 4-4. Step 4 — 결과

- 추징세액 + 이자상당액 + 양도세 환원 공제 (§18의2⑩) + netRecapture
- 위반별 표 (정당사유 표시·OFZ 면제 배지·재차 부과 분기)
- 정규직&총급여 4호 AND 판정 (정밀: fiveYearAvg·priorTwoYearAvg·threshold)
- **신고 6개월 카운트다운 배너** (상증법 §18의2⑨)

## 5. Pre-Do anchor (P-anchor)

### 5-1. 메타·orchestrator (Plan #4 흡수)
1. **PHF-META-1**: 가업상속공제 적용 사례 → familyBusinessPostMgmtMeta 자동 set
2. **PHF-META-2**: 가업상속공제 미적용 → meta undefined
3. **PHF-META-3**: T1 정정 — 신고기한 = endOfMonth(deathDate) + 6m (윤년 케이스 포함)
4. **PHF-META-4**: 직접입력 모드 → usedDirectInput=true carry

### 5-2. OFZ 자동 면제 (T3 정정)
5. **PHF-OFZ-1**: ofzExemptionActive=true + cessationSubType="ceo_not_serving" → 면제
6. **PHF-OFZ-2**: ofzExemptionActive=true + cessationSubType="industry_change" → 면제
7. **PHF-OFZ-3 ★**: ofzExemptionActive=true + cessationSubType="business_pause" → **면제 불성립** (§15⑪3호는 §15㉕ 적용 배제 대상 아님)
8. **PHF-OFZ-4**: ofzExemptionActive=true + asset_disposal → 면제 불성립

### 5-3. 정규직·총급여
9. **PHF-EMPLOY-1**: 5년 평균 81명 + 직전 2년 평균 100명 → 위반
10. **PHF-EMPLOY-2**: 5년 평균 95명 + 직전 2년 평균 100명 → 통과
11. **PHF-EMPLOY-3 ★ N1 보강**: §15⑱ 분할·합병 — spinoffMerged 인원 포함 평균 산정
12. **PHF-SALARY-1**: 정규직 위반 + 총급여 통과 → 4호 미위반 (AND)
13. **PHF-SALARY-2**: 양쪽 모두 위반 → bothViolated=true

### 5-4. 정당사유 (P1 정정 17종)
14. **PHF-JUSTIFY-1**: 자산처분 + reasonCode="expropriation" → 면제
15. **PHF-JUSTIFY-2**: §15⑧ 17종 enum 전수 매칭 (KoreanLaw MCP 본문 라벨 정합)

### 5-5. 재차 부과·이자·환원
16. **PHF-MULTI-1**: 자산처분 2회 — §15⑩ 단서 (priorDisposedExcluded 분자·분모 차감)
17. **PHF-CGT-NET-1**: 추징 18억 + 양도세 환원 5억 → netRecapture 13억
18. **PHF-CGT-NET-2**: 추징 5억 + 환원 10억 → netRecapture 0 (음수 가드)
19. **PHF-INTEREST-DAYS-1**: 신고기한 2026-09-30 → 위반 2028-03-15 → 일수 정확

### 5-6. 법령 확정
20. **PHF-LAW-1**: KoreanLaw MCP §15⑧ 17종 정당사유 본문 매칭 + §15㉕ 본문 § 15⑪1호·2호 한정 확인

## 6. 14개 동기화 지점

별도 마법사 페이지 신규 14지점 세트:
- ①~⑧ 마법사 자체 폼·initial·normalize·UI·사이드바·결과·validate
- ⑦ 결과 카드 — InheritanceTaxResultView에 "가업상속공제 사후관리" 안내 카드 + 시뮬레이터 링크 (E1 흡수)
- ⑨⑩⑫ Zod 새 schema (ViolationEvent·JustifiableReasonEvent·MonthlyEmploymentData·EmploymentTracking)
- ⑬⑭ API route 신규 (`/api/calc/inheritance-postmgmt`) + body

## 7. 위험

| ID | 위험 | 대응 |
|----|------|------|
| R1 | 정규직 60개월 입력 부담 | 간이 모드 (합계) + 정밀 모드 토글 |
| R2 | §15⑧ 17종 라벨 정확성 | PHF-LAW-1로 mst 본문 확인 |
| R3 | 재차 부과 §15⑩ 단서 구현 누락 | PHF-MULTI-1 anchor 강제 |
| R4 | 신고 6개월 시한 표시 누락 | Step4 카운트다운 배너 강제 |
| R5 | OFZ 특례 면제 범위 — §15⑪1호·2호만 (3호 제외) — T3 | C3 이중 가드 — 엔진 자동 면제 + UI cessationSubType 입력 시 안내 |
| R6 | 직접입력 모드 사후관리 정책 | 본 PR: 직접입력도 동일 사후관리 적용 (요건 우회 ≠ 사후관리 우회) |
| R7 | 신고기한 윤년·말일 케이스 | endOfMonth + addMonths 사용 (date-fns) + PHF-META-3 anchor |
| R8 | cgtCreditAmount 수동 입력 정확성 | 본 PR 사용자 신뢰 — 자동 연동은 후속 PR |

## 8. 후속 PR

- **이력 자동 prefill** — 가업상속공제 적용 이력 → 사후관리 시뮬레이터 자동 로드 (C2 시점 분리)
- **수정신고 통합** — 추징 산정 → 상속세 수정신고 자동 생성
- **transfer-tax 양도세 환원 자동 연동** — 별도 plan transfer-fb-cgt-credit-integration
- **분할·합병 시나리오 자동** — §15⑱ (현재 수동 입력)
- **영농상속공제 사후관리** — §18의3 동일 패턴 (N5 — 본 PR 가업만, 영농은 별도 PR로 분리)
- **자본적지출 분리** — N2 — transfer-tax plan에서 처리 (피상속인 vs 상속인 분리 입력)

## 9. 작업 분해

1. Plan/Design — `inheritance-gift-tax-senior` + `inheritance-gift-tax-ui-senior` 병렬
2. Pre-Do — PHF-META/OFZ/EMPLOY/SALARY/JUSTIFY/MULTI/CGT/INTEREST/LAW anchor 20건
3. Do 시퀀셜 — 엔진 (employment + orchestrator + InheritanceTaxResult 메타) → API route → UI 마법사 4단계
4. Check — ui-engine-sync-checker (별도 14지점) + inheritance-tax-qa
5. Act — 자동 prefill 후속 PR + 영농 사후관리 PR 트리거

## 10. 정규직 평균 산정 sub-feature (§15⑬⑰⑱)

- §15⑬ 정의: 근로기준법 근로자, 단시간 60시간 미만·1년 미만 계약 제외
- §15⑰ 평균: 매월 말일 인원 합 / 월수
- §15⑱ 분할·합병: 분할 후 승계 인원도 가업 정규직 간주 / 합병 후 승계 인원은 상속개시 전부터 가업 정규직 간주

`calcRegularEmployeeAverage` + `isEmploymentDropViolation` + `isSalaryDropViolation` 세 헬퍼 (P4 정정). anchor PHF-EMPLOY-1~3 + PHF-SALARY-1~2.

## 11. 의존 관계

```
inheritance-family-business-postmgmt (본 PR — Plan #4 흡수)
  ├ E1: InheritanceTaxResult.familyBusinessPostMgmtMeta carry
  ├ C3: OFZ 자동 면제 엔진 + UI disable 이중 가드
  └ 의존:
       ↓ cgtCreditAmount 수동 입력 (이력 자동은 후속 PR)
     transfer-fb-cgt-credit-integration (양도 측 산정)
       ↓
     unrelated-assets-auto-classify (독립)
```

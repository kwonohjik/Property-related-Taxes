# 가업상속공제 사후관리 시뮬레이터 — Phase F UI + orchestrator + 정규직 평균 (Plan v1)

> 작성일: 2026-05-21
> 대상 법령 (KoreanLaw MCP 2026-05-21 검증):
> - **상증법 §18의2⑤⑥⑦⑨** (mst=276123) — 5년 사후관리 4호 위반·신고 6개월
> - **상증령 §15⑧⑩⑪⑫⑬⑮⑯⑰⑱** (mst=283637) — 정당사유·자산처분비율·미종사판정·지분감소·정규직·추징·이자상당액·평균
>
> 산식 동결 commit: `76f7282` (Phase F 헬퍼) + `bbdabe0` (CGT credit) + `d105df5` (사업무관자산)
>
> 정책: `[[korean-law-citation-verify]]` · `[[single-source-engine-helper]]` · `[[mirror-pattern]]` · `[[pre-do-anchor-verification]]` · `[[feedback_three_state_optional_mode_toggle]]`

## 1. 배경 — 현행 갭

### 1-1. 산식 헬퍼 분리 완료, UI/orchestrator 통합 미구현

- `calcFamilyBusinessRecapture`·`calcFamilyBusinessInterest`·`calcAssetDisposalRatio` 동결 (16 anchor PASS)
- 그러나:
  - 사용자가 마법사에서 위반 시점·5년 누적 정규직·총급여를 입력할 UI 없음
  - orchestrator(`inheritance-tax.ts`)가 사후관리 트래킹 명령을 호출하지 않음
  - 정규직 평균(§15⑬·⑰·⑱ 분할·합병) 산정 헬퍼 미구현

**갭 5건**:
1. **UI 시뮬레이터 부재** — 가업상속공제 적용 후 5년간 사용자 시점별 위반 입력 페이지 없음
2. **orchestrator 미통합** — 추징 산정 명령이 `calcInheritanceTax` 파이프라인에 없음 (현재 헬퍼만 수동 호출 가능)
3. **정규직 평균 산정 미구현** — §15⑬ 정의·§15⑰ 평균 산식·§15⑱ 분할·합병 처리 모두 미구현
4. **재차 부과 처리 미구현** — §15⑩ 단서 (종전 처분 자산 제외)
5. **정당사유 자동 면제 미구현** — §15⑧ 1~3호 각 7~11종 (수용·국가증여·내용연수 등)

### 1-2. 법령 정합 (Phase F 산식 동결 시 이미 검증)

- §18의2⑤ 1~4호 위반 enum 4종
- §15⑮ 추징율 100분의 100 일률
- §15⑩ 자산처분비율 = disposed / total
- §15⑯ 이자상당액 = 결정세액 × 일수 × (이자율 / 365)
- §15⑬ 정규직 정의 + §15⑰ 평균 산식 (월 말일 인원 합 / 월수)
- §15⑱ 분할·합병 처리 (승계 인원 가업 법인 정규직 간주)
- §15⑧ 정당사유 1~3호 21종

## 2. 신규 모듈

### 2-1. `lib/tax-engine/credits/family-business-employment.ts` — 정규직 평균 산정

```typescript
export interface MonthlyEmploymentData {
  /** 월 말일 기준 정규직 근로자 수 */
  monthEnd: string;          // YYYY-MM
  regularEmployees: number;
  /** 분할·합병 승계 인원 (§15⑱) */
  spinoffMerged?: number;
}

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

/** §15⑤ 4호 가목 — 5년 평균 < 직전 2개 평균의 100분의 90 위반 판정 */
export function isEmploymentDropViolation(
  fiveYearAverage: number,
  priorTwoYearAverage: number,
): boolean {
  return fiveYearAverage < priorTwoYearAverage * 0.9;
}
```

### 2-2. `lib/tax-engine/credits/family-business-postmgmt-orchestrator.ts` — 통합 트래킹

```typescript
export interface FamilyBusinessPostMgmtInput {
  appliedDeduction: number;          // 가업상속공제 적용액
  inheritanceFilingDate: string;     // 신고기한
  /** 5년 추적 입력 */
  violations: ViolationEvent[];
  /** 정당사유 면제 입력 (§15⑧) */
  justifiableReasons?: JustifiableReasonEvent[];
  /** 정규직 트래킹 (5년 + 직전 2년) */
  employmentTracking?: {
    fiveYearData: MonthlyEmploymentData[];
    priorTwoYearData: MonthlyEmploymentData[];
    fiveYearTotalSalary: number;
    priorTwoYearTotalSalary: number;
  };
  /** 양도세 상당액 (§18의2⑩ 환원 공제) */
  cgtCreditAmount?: number;
  /** 국세기본법 §43의3② 이자율 */
  annualInterestRate: number;
}

export interface ViolationEvent {
  date: string;
  type: FamilyBusinessViolationType;
  // 1호 자산처분 한정
  disposedAssetValue?: number;
  totalBusinessAssetValue?: number;
}

export interface JustifiableReasonEvent {
  violationRef: number;  // ViolationEvent index
  reasonCode: JustifiableReasonCode;  // §15⑧ 1·2·3호 21종 enum
}

export type JustifiableReasonCode =
  | "expropriation" | "state_donation" | "decedent_death" | "reorg" | "useful_life"
  | "industry_change_replacement" | "rnd_use"  // §15⑧ 1호 가~사
  | "heir_death" | "state_donation_asset" | "force_majeure"  // §15⑧ 2호 가~다
  | "reorg_share_transfer" | "third_party_dilution" | "heir_death_succession"
  | "state_donation_share" | "listing_dilution" | "uniform_capital_decrease"
  | "court_decision";  // §15⑧ 3호 가~사

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
    bothViolated: boolean;   // §18의2⑤ 4호 AND 조건
  };
}
```

## 3. UI 구현 — 사후관리 시뮬레이터 마법사

### 3-1. 신규 페이지 — `/calc/inheritance-postmgmt`

가업상속공제 적용 사례를 이력 조회로 prefill → 5년 추적 입력 → 추징 산정.

**4단계 마법사**:
1. **기본 정보** — 가업상속 출처 (이력에서 자동 로드 또는 수동 입력)
   - appliedDeduction · inheritanceFilingDate
2. **위반 시점 입력** — 5년 내 발생한 사건 시점·유형
   - 자산처분 (1호) · 가업미종사 (2호) · 지분감소 (3호)
   - 각 사건마다 정당사유 매핑 가능 (§15⑧)
3. **정규직·총급여 5년 추적** — 4호 AND 위반 판정
   - 월별 정규직 인원 × 60개월 (옵션 직전 24개월)
   - 또는 5년 합계 + 직전 2년 합계 단순 입력 (간이 모드)
4. **결과** — 추징세액 + 이자상당액 + 양도세 상당액 환원 공제 (§18의2⑩) + 신고 6개월 카운트다운

### 3-2. UI 디자인 패턴

- **AlertDialog** — 추징 산정 직전 "이 시점에서 신고 6개월 내 자진납부 필요" 안내
- **타임라인 컴포넌트** — 5년 trace 시각화 (위반 시점·정당사유 적용 표시)
- **간이 vs 정밀 모드 토글** — 정규직 평균을 합계 단순 입력 vs 월별 60개월 입력 선택

## 4. orchestrator 통합

`calcInheritanceTax`는 가업상속공제 적용까지만. 사후관리는 별도 진입점.

**별도 진입 함수**:
```typescript
export function calcFamilyBusinessPostMgmt(
  input: FamilyBusinessPostMgmtInput,
): FamilyBusinessPostMgmtResult { ... }
```

API route: `app/api/calc/inheritance-postmgmt/route.ts` 신규.

## 5. Pre-Do anchor

1. **PHF-EMPLOY-1**: 5년 평균 81명, 직전 2년 평균 100명 → 81 < 90 → 위반
2. **PHF-EMPLOY-2**: 5년 평균 95명, 직전 2년 평균 100명 → 95 ≥ 90 → 통과
3. **PHF-SALARY-1**: 총급여 AND 조건 — 정규직만 위반 + 총급여 통과 → 4호 미위반
4. **PHF-JUSTIFY-1**: 자산처분 발생 + reasonCode="expropriation" → 추징 면제
5. **PHF-MULTI-1**: 자산처분 2회 발생 — §15⑩ 단서 (재차 부과 시 종전 제외) 시뮬
6. **PHF-CGT-CREDIT-1**: 추징 18억 + 양도세 상당액 환원 5억 → netRecapture 13억
7. **PHF-INTEREST-DAYS-1**: 신고기한 2026-09-30 → 위반 2028-03-15 → 일수 정확 계산
8. **PHF-LAW-1**: KoreanLaw §15⑧ 21종 정당사유 enum 본문 매칭

## 6. 14개 동기화 지점

별도 마법사 페이지이므로 신규 14지점 세트:
- ①~⑧ — 마법사 자체 폼·initial·normalize·UI·사이드바·결과·validate
- ⑨⑩⑫ — Zod 새 schema (ViolationEvent·JustifiableReasonEvent·MonthlyEmploymentData)
- ⑬⑭ — API route + body

## 7. 위험

| ID | 위험 | 대응 |
|----|------|------|
| R1 | 정규직 60개월 입력 부담 | 간이 모드 (합계 직접 입력) + 정밀 모드 선택 토글 |
| R2 | §15⑧ 21종 enum 라벨 정확성 | Pre-Do PHF-LAW-1로 mst 본문 확인 후 라벨 동결 |
| R3 | 재차 부과 §15⑩ 단서 구현 누락 | PHF-MULTI-1 anchor로 강제 |
| R4 | 신고 6개월 시한 표시 누락 | 마법사 Step4에 카운트다운 배너 강제 |
| R5 | OFZ 특례 사후관리 면제 (§15㉕) | §15⑪1호·2호 적용 배제 — UI에서 OFZ 활성 시 정규직·업종변경 위반 입력 disable |

## 8. 후속 PR

- **이력 조회 자동 prefill** — 가업상속공제 적용 이력에서 appliedDeduction·신고일 자동 로드
- **수정신고 통합** — 추징 산정 → 상속세 수정신고 자동 생성
- **소득세법 §97의2④ cross-cutting** — 양도 발생 시 양도세 상당액 자동 환원 (별도 plan transfer-fb-cgt-credit-integration.plan.md)
- **분할·합병 시나리오** — §15⑱ 자동 처리 (현재 사용자 수동 입력)

## 9. 작업 분해

1. Plan/Design — `inheritance-gift-tax-senior` + `inheritance-gift-tax-ui-senior` 병렬
2. Pre-Do — PHF-EMPLOY/SALARY/JUSTIFY/MULTI/CGT/INTEREST/LAW anchor 8건
3. Do 시퀀셜 — 엔진(orchestrator+employment) → API route → UI 마법사 4단계
4. Check — ui-engine-sync-checker (별도 14지점) + inheritance-tax-qa
5. Act — 이력 자동 prefill 후속 PR

## 10. 정규직 평균 산정 sub-feature (§15⑬⑰⑱)

별도 모듈로 분리하지만 본 PR scope에 포함.

- §15⑬ 정의: 근로기준법 근로자, 단시간 60시간 미만·1년 미만 계약 제외
- §15⑰ 평균: 매월 말일 인원 합 / 월수
- §15⑱ 분할·합병: 분할 후 승계 인원도 가업 정규직 간주 / 합병 후 승계 인원은 상속개시 전부터 가업 정규직 간주

위 산식을 `calcRegularEmployeeAverage` + `isEmploymentDropViolation` 두 헬퍼로 구현. anchor PHF-EMPLOY-1~2 + 분할·합병 회귀 anchor.

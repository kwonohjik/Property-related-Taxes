# 장기임대주택 보유자의 거주주택 양도 — 엔진 설계

> 적용 시점: **2025.2.28 이후 양도분(현행)** — 횟수 제한 없음
> 관련 plan: `docs/00-pm/rental-housing-residence-exception.plan.md`

## Context

장기임대주택을 보유한 1세대가 자가 거주주택을 양도할 때 임대주택을 주택수에서 제외하여 1세대1주택 비과세를 적용받는 특례(소령 §155⑳). 임대주택을 거주주택으로 전환 후 양도하는 경우(직전거주주택보유주택, PHRP)에는 §161의 기준시가 안분으로 직전거주주택 양도일 이후 양도소득금액만 비과세.

이전에 우리 프로젝트는 1세대1주택 비과세는 구현되어 있으나, 임대주택 주택수 제외 토글과 §161 안분 산식이 누락. 사례문제 PDF#1(예제 2023, 사례 25)의 결과(산출세액 44,699,900원)를 재현할 수 없는 상태.

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 ID | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|---|
| 1 | RH-A1 | 임대주택 N채 + 거주주택 → 거주주택 양도 (12억 이하) | 소령 §155⑳ | (자체 작성 — 양도가 8억 + 임대주택 1채) | `rh-a1-residence-under-12.test.ts` | ✅ 통과 |
| 2 | RH-A2 | RH-A1 + 양도가 12억 초과 (고가주택) | 소령 §155⑳ + §156 + §95② 표2 | (자체 작성 — 양도가 15억) | `rh-a2-residence-high-value.test.ts` | ✅ 통과 |
| 3 | RH-B1 | PHRP 양도 (12억 이하) | 소령 §155⑳ 후단 + §161① + §161④ 표1 | **PDF#1 사례 25** — 311M / 80.86M / 172.605M / 44,699,900 | `rh-b1-prhp-under-12.test.ts` | ✅ 통과 |
| 4 | RH-B2 | PHRP 양도 (12억 초과 = 고가) | 소령 §161②1호·2호 + §161④ 표1·표2 + §161③ 캡 | (자체 작성 — 양도가 15억 검증값 도출 필요) | `rh-b2-prhp-high-value.test.ts` | ✅ 통과 |
| 5 | RH-B1-NoPriorPrice | PHRP 직전 양도일 기준시가 미공시 (3-시점 중 일부 누락) | (실무 쟁점) | (validation 차단 — 자동 안분 금지) | `rh-b1-missing-price.test.ts` | ✅ 통과 |
| 6 | RH-Cap | §161② 합산 결과가 §95①을 초과 → 캡 적용 | 소령 §161③ | (자체 작성 — 기준시가 변동률 큰 경우) | `rh-161-3-cap.test.ts` | ✅ 통과 |
| 7 | RH-Eligibility | 임대주택 의무임대기간 미충족 (2020.7.10 이전 등록·5년 미만) | 소령 §155⑳ 호별 | (validation 차단) | `rh-eligibility-period.test.ts` | ✅ 통과 |

**규칙**: 행≥1 없으면 Do 단계 진입 금지. RH-B2와 RH-B1-NoPriorPrice는 anchor 출처 미발견이므로 Design 단계에서 검증값 도출 또는 validation 차단 정책 확정.

---

## 법령 근거

```
소득세법 시행령 §155⑳ (1세대1주택 특례)
  본문: "장기임대주택 + 거주주택 보유 1세대가 거주주택 양도 시
        장기임대주택은 주택수에서 제외하고 1세대1주택으로 본다"
  후단: "다만 직전거주주택 양도일 이후 양도소득금액만 비과세"
        → §161 적용 (PHRP 케이스)

소득세법 시행령 §161 (PHRP 양도소득금액 계산)
  ① B1·일반: gain95 × (P_prior − P_acq) / (P_transfer − P_acq)
  ② 고가주택: 1호 + 2호
    1호 (이전): gain95 × (P_prior − P_acq) / (P_transfer − P_acq)
    2호 (이후): gain95 × (P_transfer − P_prior) / (P_transfer − P_acq)
                       × (S − 12억) / S
  ③ 초과 캡: ①·② 결과 ≤ §95① 양도소득금액
  ④ 표 매핑: ①·②1호 → §95② 표1 / ②2호 → §95② 표2

소득세법 §95② 표1: 일반 장기보유공제 (보유 × 2%, 최대 30%)
소득세법 §95② 표2: 1세대1주택 (보유×4% + 거주×4%, 최대 80%)
소득세법 §156: 12억 초과분만 과세 (고가주택 정의)
```

**상수화**: `lib/tax-engine/legal-codes/transfer.ts`에 다음 추가
```ts
export const TRANSFER_RENTAL_HOUSING = {
  PIT_RD_155_20: '소득세법 시행령 §155⑳',
  PIT_RD_161_1: '소득세법 시행령 §161①',
  PIT_RD_161_2_1: '소득세법 시행령 §161②1호',
  PIT_RD_161_2_2: '소득세법 시행령 §161②2호',
  PIT_RD_161_3: '소득세법 시행령 §161③',
  PIT_RD_161_4: '소득세법 시행령 §161④',
} as const;
```

---

## 변수 통일표 (구현 전반에 일관 사용)

| 기호 | 의미 | 단위 | 입력 출처 |
|---|---|---|---|
| `S` | 양도가액 | 원(KRW 정수) | 자산-수준 입력 |
| `gain` | 양도차익 (S − 취득가 − 필요경비) | 원 | 기존 transfer-tax 엔진 |
| `gain95(표1)` | §95① 양도소득금액 (표1) = gain − 표1 장기보유공제 | 원 | `ltc-table-split.ts` |
| `gain95(표2)` | §95① 양도소득금액 (표2) = gain − 표2 장기보유공제 | 원 | `ltc-table-split.ts` |
| `P_acq` | PHRP 취득 당시 기준시가 | 원 | 사용자 입력 (자동조회 보조) |
| `P_prior` | 직전거주주택 양도 당시 PHRP 기준시가 | 원 | 사용자 입력 (자동조회 보조) |
| `P_transfer` | PHRP 양도 당시 기준시가 | 원 | 사용자 입력 (자동조회 보조) |
| `D_prior` | 직전거주주택 양도일 | Date | 사용자 입력 |
| `holdYears` | 보유연수 (반올림 정수) | 년 | `transfer-tax/holding-period.ts` |
| `liveYears` | 거주연수 | 년 | 자산-수준 입력 |
| `r161_1` | §161① 비율 = (P_prior − P_acq) / (P_transfer − P_acq) | 소수 | 엔진 계산 |
| `r161_2_2` | §161②2호 비율 = (P_transfer − P_prior) / (P_transfer − P_acq) | 소수 | 엔진 계산 |
| `r_high` | 고가주택 과세비율 = (S − 12억) / S | 소수 | 엔진 계산 |

---

## 엔진 input 타입

```ts
// lib/tax-engine/transfer-tax/rental-housing-exception/types.ts

export type RentalUnitInput = {
  registrationDate: Date;            // 임대사업자 등록(신청)일
  rentalType: 'short-4' | 'short-6' | 'long-8' | 'long-10' | 'pre-2018';
  rentalAcquisitionType: 'purchase' | 'construction';
  isApartment: boolean;
  region: 'seoul-metro' | 'non-metro' | 'regulated-area';
  standardPriceAtRentalStart: number;  // 임대개시일 기준시가
  rentalMonths: number;                // 실제 임대 개월
  rentalAutoTermination: boolean;      // 자동·자진말소 5년 내 양도 (Phase 2)
  requirementsConfirmed: boolean;      // 기타 요건 충족 자기확인 (5%증액 등)
};

export type RentalHousingExceptionInput = {
  applyException: boolean;             // 토글
  scenario: 'A' | 'B';                 // 거주주택 양도 (A) / PHRP 양도 (B)
  rentalUnits: RentalUnitInput[];      // 최소 1호
  // B 시나리오 전용
  priorResidenceTransferDate?: Date;   // D_prior
  standardPriceAtAcquisition?: number; // P_acq
  standardPriceAtPriorTransfer?: number; // P_prior
  standardPriceAtTransfer?: number;    // P_transfer
};
```

## 엔진 result 타입

```ts
export type RentalHousingExceptionResult = {
  applied: boolean;                    // 특례 적용 여부 (요건 미충족 시 false)
  scenarioId: 'RH-A1' | 'RH-A2' | 'RH-B1' | 'RH-B2';
  eligibility: {
    passed: boolean;
    reasons: string[];                 // 미충족 사유
    laws: string[];                    // 인용된 조문 코드
  };
  taxableGain: number;                 // 과세대상 양도소득금액 (§161 안분 결과)
  exemptGain: number;                  // 비과세 양도소득금액 = §95①(표1) − taxableGain
  appliedTable: 'table-1' | 'table-2' | 'mixed';
  // §161 산식 추적용 (결과 카드 표기)
  formulaTrace: {
    gain95Table1: number;
    gain95Table2: number;
    ratio161_1?: number;               // r161_1 (B1·B2-1호)
    ratio161_2_2?: number;             // r161_2_2 (B2-2호)
    ratioHighValue?: number;           // r_high (A2·B2)
    capApplied: boolean;               // §161③ 캡 발동 여부
  };
};
```

---

## 계산 알고리즘 (단계별)

### 진입점: `index.ts`

```ts
function calculateRentalHousingException(input, baseGain, holdYears, liveYears):
  RentalHousingExceptionResult {
  1. eligibility 판정
     - rentalUnits 각 호별 의무임대기간·기준시가·기간 검증
     - 모두 미충족 시 { applied: false, eligibility.passed: false }
     - 거주주택 보유 2년·거주 2년 미충족 시 동일

  2. 시나리오 분기
     - input.scenario === 'A' → A 시나리오 (자가 거주주택)
     - input.scenario === 'B' → B 시나리오 (PHRP)

  3. ltc-table-split.ts에서 gain95(표1), gain95(표2) 동시 산출

  4. 시나리오별 계산:
     A1 (S ≤ 12억):  taxableGain = 0
     A2 (S > 12억):  taxableGain = gain95(표2) × (S − 12억) / S
     B1 (S ≤ 12억):  taxableGain = gain95(표1) × r161_1
     B2 (S > 12억):  taxableGain = part1 + part2
       part1 = gain95(표1) × r161_1                          (§161②1호)
       part2 = gain95(표2) × r161_2_2 × r_high                (§161②2호)

  5. §161③ 캡 적용 (B 시나리오만):
     B1: taxableGain = min(taxableGain, gain95(표1))
     B2: 호별 분리 비교 (Design 결정 (a)) — 1차 구현
       part1 = min(part1, gain95(표1))
       part2 = min(part2, gain95(표2))
       taxableGain = part1 + part2
     anchor 어긋날 시 (b)/(c)로 재시도

  6. exemptGain 계산:
     exemptGain = gain95(표1) − taxableGain  (B 시나리오 보고용 — 표1 기준)
     A 시나리오는 § 95②(표2) 기준이므로 분리 표기

  7. result 반환
}
```

### 모듈: `eligibility.ts`

```ts
function checkEligibility(rentalUnits, residenceHoldYears, residenceLiveYears, transferDate):
  EligibilityResult {
  // 1. 거주주택 요건
  if (residenceHoldYears < 2 || residenceLiveYears < 2) → fail;

  // 2. 임대주택 호별 검증
  for unit of rentalUnits:
    requiredYears = lookupRequiredRentalYears(unit.registrationDate);
      // 2020.7.10 이전: 5년
      // 2020.7.11 ~ 2020.8.17: 8년
      // 2020.8.18 이후: 10년
      // 2025.6.4 이후 단기: 6년
    if (unit.rentalMonths / 12 < requiredYears) → unit.fail;

    // 기준시가 상한 검증
    cap = lookupStandardPriceCap(unit.region, unit.registrationDate, unit.rentalType);
      // 수도권 매입: 6억 (임대개시일 기준), 비수도권 3억 등
    if (unit.standardPriceAtRentalStart > cap) → unit.fail;

    // 단기(2025.6.4) 매입 + 조정대상지역 → fail
    // 아파트 + 2020.7.11 이후 등록 → fail (가목·다목·마목 분기)

    // 기타 요건 (5%증액·등록·임대료 등) — requirementsConfirmed로 자기확인
    if (!unit.requirementsConfirmed) → fail;

  // 1호라도 통과하면 PASS (특례는 1호 이상 임대 시 적용)
  if (any(unit.passed)) → pass;
}
```

### 모듈: `prhp-allocation.ts`

```ts
function calculatePrhpAllocation(scenario, gain95T1, gain95T2, S, P_acq, P_prior, P_transfer):
  AllocationResult {
  validateInputs(P_acq, P_prior, P_transfer);
    // 모두 양수 + P_transfer > P_acq + P_prior ∈ [P_acq, P_transfer]

  r161_1 = (P_prior - P_acq) / (P_transfer - P_acq);
  r161_2_2 = (P_transfer - P_prior) / (P_transfer - P_acq);
  r_high = S > 1_200_000_000 ? (S - 1_200_000_000) / S : 0;

  if (S <= 1_200_000_000):  // B1
    taxable = floor(gain95T1 × r161_1);
    cap = gain95T1;
  else:  // B2
    part1 = floor(gain95T1 × r161_1);
    part2 = floor(gain95T2 × r161_2_2 × r_high);
    // §161③ 캡 — Design 결정 (a) 호별 분리
    part1 = min(part1, gain95T1);
    part2 = min(part2, gain95T2);
    taxable = part1 + part2;

  return { taxable, ratios, capApplied };
}
```

**정수 연산**: `applyRate()` / `safeMultiply()` (`lib/tax-engine/tax-utils.ts`) 사용. 비율 곱셈 직후 `Math.floor()`. `Math.round()` 절대 금지.

### 모듈: `ltc-table-split.ts`

```ts
function calculateGain95BothTables(gain, holdYears, liveYears):
  { gain95T1: number; gain95T2: number } {
  // 기존 transfer-tax/long-term-deduction.ts 재사용
  ltc_T1 = calculateTable1Deduction(gain, holdYears);  // min(holdYears × 2%, 30%) × gain
  ltc_T2 = calculateTable2Deduction(gain, holdYears, liveYears); // min(holdYears×4% + liveYears×4%, 80%) × gain

  return {
    gain95T1: gain - floor(ltc_T1),
    gain95T2: gain - floor(ltc_T2),
  };
}
```

---

## Silent fallback / 자동 안분 후보 식별

| 필드 | 자동 안분 시나리오 | 정책 |
|---|---|---|
| `P_acq`, `P_prior`, `P_transfer` | 미입력 시 ±1년 시점 기준시가로 자동 보정 | **금지** — 미입력 시 validation 오류 |
| `priorResidenceTransferDate` | B 시나리오인데 미입력 | **금지** — validation 차단 |
| `rentalUnits[].standardPriceAtRentalStart` | 등록일 기준 자동 조회 | 자동조회 결과는 **추천 값 표시**만, 사용자 확정 입력 필수 |
| `requirementsConfirmed` | 기본 true | **금지** — 명시 체크 필수 |

법령 명시 자동 안분 없음 (메모리 `feedback_no_silent_apportion_fallback.md` 정책 적용).

---

## 테스트 약속

- 케이스 인벤토리 7행 모두 anchor 테스트 1개 이상.
- **사례문제 PDF#1 (RH-B1) anchor 17개 후보** (원단위 `toBe()`):
  1. `gain` (양도차익) = 311,000,000
  2. `ltc_T1` (장기보유공제 표1·26%) = 80,860,000
  3. `gain95T1` = 230,140,000
  4. `r161_1` 분자 = 150,000,000
  5. `r161_1` 분모 = 200,000,000
  6. `r161_1` = 0.75
  7. `taxableGain` (§161① 결과) = 172,605,000
  8. `exemptGain` = 57,535,000
  9. `appliedTable` = 'table-1'
  10. `scenarioId` = 'RH-B1'
  11. `capApplied` = false
  12. (보유연수) holdYears = 13
  13. P_acq = 300,000,000
  14. P_prior = 450,000,000
  15. P_transfer = 500,000,000
  16. 산출세액(누진세율 38%) = 44,699,900 (지방소득세 별도 4,469,990)
  17. 과세표준 (기본공제 250만원 차감) = 170,105,000

- 회귀 방지: 기존 `__tests__/tax-engine/transfer/one-house-tax/` anchor 영향 없음 검증.
- §161③ 캡 발동 케이스(RH-Cap): 기준시가 비현실적 변동률로 합성 입력.

---

## §161③ 캡 해석 — Design 단계 결정

plan §5.4의 (a)/(b)/(c) 중 **(a) 호별 분리 비교**로 1차 구현:
```
B2: part1 ≤ gain95(표1), part2 ≤ gain95(표2)
```
근거: 조문이 "①·②항에 따라 계산한 양도소득금액"이라 복수형으로 표현 + 호별 산식이 표 분리이므로 호별 비교가 자연스러움.

→ Check 단계에서 anchor 어긋나거나 국세청 예규(서면법규재산 등) 발견 시 (b)/(c)로 재시도.

---

## Check / Act 단계 환류 (2026-05-05)

- **anchor 테스트 결과**: 7파일 / 56 테스트 100% 통과. 사례문제 PDF#1 RH-B1 17개 anchor 원단위 일치 (172,605,000 / 0.75 / 230,140,000 / 80,860,000 / 44,699,900).
- **회귀 영향**: 양도세 38파일 / 487 테스트, 전체 프로젝트 133파일 / 2,249 테스트 통과. 회귀 0건.
- **§161③ 캡**: 사례문제 B1은 캡 미발동 (capApplied = false). (a) 호별 분리 적용 결과 anchor 어긋남 없음 → (b)/(c) 재시도 불필요.
- **ui-engine-sync-checker**: 1차 91% → High(다건 route 누락) + Medium(B2 결과 카드 4필드) + Low(eligibility.laws) 보완 후 **100%**.
- **사례 입력 함정**: 파주시는 경기도 = 수도권. 비수도권 3억 상한 적용 시 사례 입력값(5억)이 차단되므로 region 분기 주의.

---

## UI 통합 위임

UI 측 명세는 `rental-housing-residence-exception.ui.design.md` 참조.
14개 동기화 지점은 UI 시니어 책임 — 엔진 시니어는 `RentalHousingExceptionInput` / `RentalHousingExceptionResult` 타입과 진입점 함수 시그니처만 확정.

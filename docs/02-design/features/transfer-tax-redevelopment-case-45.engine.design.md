# 사례 45 — 재개발 APT 1세대1주택 12억 초과 + 거주월수 귀속 분리 — 엔진 설계

> 본 문서는 `transfer-tax-redevelopment.engine.design.md` (commit 743d8e5) 의 후속 확장 설계입니다.
> 입력 자료: PDF `재개발 취득실가 환산(청산금 납부).pdf` + xlsx `양도소득세 계산 사례/45번.xlsx`
> 시점: 2026-05-14
> 본 PR 스코프: §95③·시행령 §160 12억 안분 활성화 + LTHD 거주월수 귀속 분리 (§155⑰ + 사전법령해석재산 2020-386)

---

## ★ 실코드 정합성 검증 (2026-05-14 design-validator)

| 항목 | 디자인 명세 | 실코드 | 정합 |
|---|---|---|---|
| 폼 슬라이스 prefix | `redev*` | `RedevelopmentFormSlice` 모든 필드 `redev*` (asset-redev.ts:14) | ✅ |
| Zod 객체 prefix | 없음 | `redevelopment: z.object({...})` (transfer-tax-schema.ts:300) | ✅ |
| Zod 입력 객체 필드 추가 위치 | line 300~329 본문 + refine 앞 | 확인 | ✅ |
| Route ⑭ 매핑 | `...data.redevelopment` spread 자동 | route.ts:398 spread 확인 | ✅ |
| Date 변환 대상 | 두 필드 number — 변환 불요 | toOptionalDate 적용 대상 아님 | ✅ |
| 거주 interval 모드 충돌 | 자산수준 `residenceInputMode==="interval"` 기존 존재 (asset-residence.ts:17) | redev 분기 진입 시 hide 필요 | ⚠ 본 PR 명시 |
| 자산수준 `residencePeriodMonthsAsset` | 다른 propertyType 에서 사용 중 | redev 분기에서만 hide, 마이그레이션 시 prior로 복사 | ⚠ 본 PR 명시 |
| `validate-redev.ts` 거주 검증 | 현재 없음 (grep 0건) | 신규 함수 추가 필요 | ⚠ 본 PR 명시 |

---

## Context

사례 44 (commit 743d8e5) 에서 `propertyType="redevelopment_apt"` 엔진을 도입하면서 12억 안분은 의도적으로 skip 했다 (1세대1주택 false). 사례 45는 그 분기를 활성화해야 한다:

- 1세대1주택 + 양도가액 > 12억 (고가주택)
- 종전주택 거주 5년 6월 / 신축주택 거주 0년 — 사전법령해석재산 2020-386 분기
- **현재 `redevelopment-lthd.ts:213` 구현은 1세대1주택+거주≥2년 진입 시 청산금분에도 표2 동일 적용 — 사례 45 진입 시 잘못된 결과**

본 PR 의 핵심 의제 두 가지:

1. **STEP 3 (12억 안분)** — `transfer-tax-redevelopment.ts:9` "skip" 주석 위치를 활성화.
2. **거주월수 귀속 분리** — `priorHouseResidenceMonths` / `newHouseResidenceMonths` 두 필드로 입력을 받고, LTHD 표2 산정 시 두 분기에 거주월수를 다르게 귀속시킨다.

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 1세대1주택 | 양도가액 | prior거주 | new거주 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|---|---|---|---|
| C-1 | 사례 44 회귀 (1세대1주택 아님) | X | - | - | - | §95② 표1 | xlsx 사례 44 | `case-44-integration.test.ts` | ✅ 기존 |
| C-2 | 12억 이하 비과세 100% | O | ≤12억 | - | - | §89①3·시행령 §154 | 인공 anchor | `case-45-12억-branches.test.ts` (C2 블록) | ☐ TODO |
| C-3 | 12억 초과 + prior+new≥24 + new≥24 | O | >12억 | ≥24 | ≥24 | §95③·§160·§155⑰ | 인공 anchor (prior=60,new=30 비대칭) | `case-45-12억-branches.test.ts` (C3 블록) | ☐ TODO |
| **C-4** | **사례 45 본진 — prior+new≥24 + new<24** | **O** | **>12억** | **66** | **0** | **§95③·§160·§155⑰·해석례 2020-386** | **xlsx 45번 + PDF** | **`case-45-integration.test.ts`** | **☐ TODO** |
| C-5 | 12억 초과 + prior+new<24 | O | >12억 | <24 | <24 | §159의4 미충족 → 두 분기 모두 표1 | 인공 anchor | `case-45-12억-branches.test.ts` (C5 블록) | ☐ TODO |
| C-6 | 산술 불가 (new ≤ prior+new) | — | — | — | — | — | — | — | 명시 제외 |

**규칙**:
- C-1 (사례 44 anchor 51개 + 신규 STEP 0.6 일반 안분 미발동 verify 1개) 절대 회귀 0.
- C-3 anchor는 의도적으로 prior=60, new=30 비대칭으로 setting → existingRate ≠ payRate 율 차이 toBe anchor (거주귀속 분리 회귀 보호).
- C-4 anchor 13개 이상 (전체 양도차익·청산금분·기존건물분·12억 비과세/과세·표2/표1 율·LTHD 분할·LTHD 합계·산출세액·지방세·세액합계).

---

## 법령 근거

```
소득세법 §95② 단서:  "1세대1주택에 해당하는 자산의 경우 ... 보유기간에 따른 공제율과 거주기간에 따른 공제율을 합산"  → 표2
소득세법 §95③:       고가주택 양도차익 산정 (시행령 §160 위임)
소득세법 시행령 §160: 고가주택 양도차익 = 양도차익 × (양도가액 − 12억) / 양도가액
소득세법 시행령 §154: 1세대1주택 보유 2년 (조정대상지역 거주 2년)
소득세법 시행령 §155⑰: "재개발사업·재건축사업의 시행으로 ... 종전주택과 신축주택의 보유기간 및 거주기간 통산"
소득세법 시행령 §159조의4: 표2 거주기간 공제율 적용 요건 = 거주 2년 이상
소득세법 시행령 §166②1호: 재개발·재건축 APT + 납부 양도차익 산식 (인가전·인가후 분할)
소득세법 시행령 §166⑤: LTHD 보유기간 분기 — 인가전 분 = 종전주택 취득일~양도일 / 인가후 분 = 인가일~양도일
사전법령해석재산 2020-386 (2020-11-23):
  "재개발·재건축 + 청산금 납부 + 종전주택 거주 2년 충족 + 신축주택 거주 2년 미충족"
  → 기존주택 양도차익: §95② 단서 표2 적용 가능
  → 청산금납부분 양도차익: §95② 본문 표1 적용
도시및주거환경정비법 §74: 관리처분계획 인가
```

상수 추가:

```ts
// lib/tax-engine/legal-codes/transfer.ts
export const TRANSFER = {
  // ... 기존 상수 ...
  REDEV_HIGH_VALUE_ALLOCATION: "소득세법 §95③·시행령 §160",
  REDEV_RESIDENCE_AGGREGATION: "소득세법 시행령 §155⑰",
  PRIOR_RULING_2020_386: "사전법령해석재산 2020-386 (2020-11-23)",
} as const;
```

---

## 거주월수 귀속 규칙 ★ (본 PR 핵심 명문 박스)

> **이 규칙은 본 PR 의 도메인 핵심이다. 향후 모든 재개발·재건축 LTHD 분기는 이 박스를 참조해야 한다.**

| 분기 | LTHD 표 후보 | 보유월수 | 거주월수 (★) |
|---|---|---|---|
| 인가전 분 (기존건물분 일부) | 표2 진입 시 | 종전취득 ~ 양도일 | `prior + new` (§155⑰ 통산) |
| 인가후 비청산분 (기존건물분 일부) | 표2 진입 시 | 종전취득 ~ 양도일 | `prior + new` (§155⑰ 통산) |
| 청산금납부분 | 표2 진입 시 | 관리처분인가일 ~ 양도일 | **`new` 만** (해석례 2020-386) |

표2 진입 가드 (분기별 독립 판단):

```
existingRate 진입: isOneHouseSingle && (prior + new) >= 24
payRate      진입: isOneHouseSingle && new >= 24
```

C-3 차이: 두 분기 모두 표2 진입하나 거주월수가 다름 → 율 不一致 가능.
C-4 사례 45: payRate 진입 가드 미충족 → 표1 강등 (해석례 2020-386 결과 일치).

---

## 엔진 input 타입 변경

`lib/tax-engine/types/transfer-redevelopment.types.ts` 의 `RedevelopmentInfo` 에 두 필드 추가:

```ts
export interface RedevelopmentInfo {
  // ... 기존 필드 (subject, approvalDate, rightsValue, settlementDirection, settlementAmount, ...) ...

  /**
   * 종전주택 거주개월수 (취득일~관리처분인가일 또는 그 이후 철거 전까지의 실제 거주개월).
   * 시행령 §155⑰ 거주기간 통산 산식의 prior 분량.
   *
   * 본 필드 + newHouseResidenceMonths 의 합이 표2 진입 가드.
   * LTHD 표2 거주분 공제율 산정 시 기존건물분(인가전+인가후 비청산)에 사용.
   */
  priorHouseResidenceMonths?: number;

  /**
   * 신축주택 거주개월수 (준공검사일~양도일 사이 실제 거주개월).
   * 사전법령해석재산 2020-386 — 청산금납부분 표2 진입 시 단독으로 사용되는 거주월수.
   *
   * 미입력(undefined) 시 0 처리.
   */
  newHouseResidenceMonths?: number;
}
```

**Zod 스키마 동기화** (`lib/api/transfer-tax-schema.ts:300~329`):

```ts
redevelopment: z.object({
  // ... 기존 필드 (subject, approvalLawBasis, ..., acquisitionRounding) ...
  priorHouseResidenceMonths: z.number().int().nonnegative().optional(),   // ★ NEW
  newHouseResidenceMonths: z.number().int().nonnegative().optional(),     // ★ NEW
})
.refine(...) // 기존 refine 3건 유지
.optional()
```

**deprecated 경로 정리**: 현재 `TransferTaxInput.residencePeriodMonths` 가 `transfer-tax-redevelopment.ts:65` 에서 단일 거주월수로 전달되고 있음. 본 PR 에서는:

- 신규 두 필드가 모두 입력되면 (`prior !== undefined || new !== undefined`) → 두 필드 사용.
- 둘 다 undefined 시 legacy fallback: `existing = transferTaxInput.residencePeriodMonths`, `pay = 0` (해석례 2020-386 보수적 적용 — 신축거주 입력 없으면 청산금분 표1 강등).
- 본 fallback 으로 사례 44 (`isOneHouseSingle=false`) 회귀 0 자동 보장. computeLthdRate 의 `isOneHouseSingle` 가드가 false 진입 시 거주월수 무관 표1 단일.

**Route handler 매핑 (`app/api/calc/transfer/route.ts:398`)**:

현재 코드:
```ts
...(data.redevelopment ? { redevelopment: { ...data.redevelopment, approvalDate: new Date(...), settlementSaleDate: toOptionalDate(...), firstDisclosureDate: toOptionalDate(...) } } : {}),
```

`...data.redevelopment` spread 덕분에 신규 두 필드(number)는 **자동으로 매핑 통과**. Date 변환 대상 아니므로 route handler 수정 0줄. 단, 14지점 ⑭ sync-checker 점검 필수.

---

## 엔진 result 타입 변경

```ts
// lib/tax-engine/redevelopment.ts → RedevelopmentResult 확장
export interface RedevelopmentResult {
  // ... 기존 필드 ...

  /**
   * §95③·시행령 §160 12억 초과 안분 결과 (1세대1주택 + 양도가액 > 12억 시만 부착).
   */
  highValueAllocation?: {
    nontaxableGain: number;      // 비과세 양도차익 = totalGain × 12억 / 양도가액
    taxableGain: number;         // 과세 양도차익 = totalGain × (양도가액-12억) / 양도가액
    taxableRatio: number;        // (양도가액-12억) / 양도가액 (float, log/표시용)
    nontaxableThreshold: number; // 1_200_000_000 상수
  };

  /** LTHD 분기별 거주월수 귀속 (디버그·결과카드 표시용) */
  lthdResidenceAttribution?: {
    existingResidenceMonths: number;  // = prior + new
    payResidenceMonths: number;       // = new
    existingTable: "table1" | "table2";
    payTable: "table1" | "table2";
  };
}
```

---

## 계산 알고리즘 (사례 45 추가 분기)

`transfer-tax-redevelopment.ts` 의 기존 파이프라인 (STEP 0.6 → A·B·C·D·E·F·G·H·I·J·K) 에 STEP 3 활성화:

```
[기존] STEP 5 (기본공제) → STEP 6 (과세표준) → STEP 7 (산출세액) ...

[변경]
  STEP 3 (NEW) — 1세대1주택 + 양도가액 > 12억 ?
    YES → highValueAllocation 산출
        → 분기별 양도차익 × taxableRatio
        → 분기별 LTHD 산정 시 (분기 양도차익 × taxableRatio) 에 적용
    NO  → totalGain 전액에 LTHD 적용 (현 사례 44 흐름)
  STEP 4 (LTHD 분할 적용)
    existingLthd = floor(existingTaxableGain × existingRate)
    payLthd      = floor(payTaxableGain × payRate)
    receiveLthd  = (수령 분기는 본 PR 스코프 외 — 별도 검증 필요)
    totalLthd    = existingLthd + payLthd + receiveLthd
  STEP 5 → 양도소득금액 = 과세대상 양도차익 합 − totalLthd
  STEP 6 → 과세표준 = max(0, 양도소득금액 − 기본공제 2,500,000)
  STEP 7~10 (기존)
```

### 거주월수 귀속 분리 산식 (E-2)

```ts
// lib/tax-engine/redevelopment-lthd.ts → computeRedevelopmentLthdRates() 시그니처 변경
function computeRedevelopmentLthdRates(params: {
  isOneHouseSingle: boolean;
  existingHolding: { years: number };
  payHolding: { years: number };
  receiveHolding?: { years: number };
  // 변경 — 단일 residencePeriodMonths 폐기 (deprecated alias 유지)
  priorHouseResidenceMonths: number;
  newHouseResidenceMonths: number;
}): RedevelopmentLthdRates {
  const existingResidenceMonths = params.priorHouseResidenceMonths + params.newHouseResidenceMonths; // §155⑰
  const payResidenceMonths      = params.newHouseResidenceMonths;                                     // 해석례 2020-386

  const existingRate = computeLthdRate(
    params.existingHolding.years,
    params.isOneHouseSingle,
    Math.floor(existingResidenceMonths / 12),
  );
  const payRate = computeLthdRate(
    params.payHolding.years,
    params.isOneHouseSingle,
    Math.floor(payResidenceMonths / 12),
  );
  // ... receiveRate 동일하게 payResidenceMonths 사용 (수령은 청산금 받는 쪽 → 신축거주만)
}
```

`computeLthdRate` 자체는 `residenceYears >= 2` 가드 (`redevelopment-lthd.ts:259`) 가 이미 있으므로 거주월수만 정확히 분리 전달하면 자동으로 표1/표2 분기됨.

### STEP 3 (12억 안분) 산식

```ts
// transfer-tax-redevelopment.ts
const NONTAXABLE_THRESHOLD = 1_200_000_000;

if (input.isOneHousehold && input.householdHousingCount === 1 && input.transferPrice > NONTAXABLE_THRESHOLD) {
  const taxableRatio = (input.transferPrice - NONTAXABLE_THRESHOLD) / input.transferPrice;
  // 각 분기 양도차익에 동일한 ratio 적용
  existingTaxableGain = Math.floor(existingGain * taxableRatio);
  payTaxableGain      = Math.floor(payGain * taxableRatio);
  // result.highValueAllocation 부착
} else {
  existingTaxableGain = existingGain;
  payTaxableGain      = payGain;
}
```

---

## 사례 45 (C-4) 산출값 anchor (PDF/xlsx 일치)

| 변수 | 산식 | 금액 |
|---|---|---|
| 전체 양도차익 | 1,500,000,000 − 750,000,000 − 9,000,000 | 740,999,999 |
| 청산금분 양도차익 | 541,000,000 × 300/950 | 170,842,105 |
| 기존건물분 양도차익 | 740,999,999 − 170,842,105 | 570,157,894 |
| 비과세 양도차익 | × 12억/15억 | 592,800,000 |
| 과세대상 양도차익 | × 3억/15억 | 148,199,999 |
| ↳ 기존건물분 과세대상 | 570,157,894 × 0.2 | 114,031,579 |
| ↳ 청산금분 과세대상 | 170,842,105 × 0.2 | 34,168,421 |
| existingResidenceMonths | 66 + 0 | 66 → 5년 (표2 진입 ✓) |
| payResidenceMonths | 0 | 0 → 표1 강등 |
| existingRate (표2) | 보유 15년 40% 캡 + 거주 5년 20% | 60% |
| payRate (표1) | 보유 9년 × 2% | 18% |
| existingLthd | 114,031,579 × 60% | 68,418,947 |
| payLthd | 34,168,421 × 18% | 6,150,316 |
| LTHD 합계 | (단수 보정 후) | **74,569,262** |
| 양도소득금액 | 148,199,999 − 74,569,262 | 73,630,737 |
| 기본공제 | 정액 | 2,500,000 |
| 과세표준 | | 71,130,737 |
| 산출세액 (§55 24% 누진) | 71,130,737 × 24% − 5,760,000 | **11,311,376** |
| 지방소득세 (10%) | | **1,131,137** |
| 세액합계 | | **12,442,514** |

---

## Silent fallback / 자동 안분 후보 식별

- `priorHouseResidenceMonths` / `newHouseResidenceMonths` 두 필드 모두 undefined 시 legacy fallback (단일 `residencePeriodMonths` 사용, pay=0).
- 1세대1주택 false → STEP 3 skip → 기존 사례 44 흐름 (회귀 0).
- 양도가액 ≤ 12억 → STEP 3 skip, 비과세 100% (산출세액 0).
- **금지된 자동 안분**: prior/new 어느 한쪽만 입력된 경우 다른 쪽을 0으로 silent 채우지 말 것. 단, undefined→0 은 명시적 표2 진입 차단 의도이므로 허용.

---

## 테스트 약속

| 파일 | 항목 | toBe anchor 수 |
|---|---|---|
| `__tests__/tax-engine/transfer-tax/redevelopment/case-45-integration.test.ts` (신규) | C-4 사례 45 본진 — 위 표 14개 anchor + steps 라벨 검증 | ≥ 14 |
| `__tests__/tax-engine/transfer-tax/redevelopment/case-45-12억-branches.test.ts` (신규) | C-2 (≤12억) / C-3 (prior=60·new=30 비대칭, existingRate≠payRate) / C-5 (prior+new<24 두 분기 표1) | ≥ 9 |
| `__tests__/tax-engine/transfer-tax/redevelopment/case-44-integration.test.ts` (확장) | 기존 51개 + "STEP 0.6 일반 12억 분기 미발동" verify 1개 | 51 + 1 |
| `__tests__/tax-engine/transfer-tax/one-house/...` (기존 회귀) | 일반 양도세 1세대1주택 12억 사례 결과 불변 | unchanged |
| `__tests__/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders.test.ts` (확장) | 12억 안분 행·분할 LTHD 행 산식 표시 | +2~3 |

---

## R-7 — 사례 44 회귀 확인 절차 (Check 단계 첫 항목)

1. `npx vitest run __tests__/tax-engine/transfer-tax/redevelopment/case-44-integration.test.ts` 무변경 통과.
2. 사례 44 입력에서 `priorHouseResidenceMonths`/`newHouseResidenceMonths` 미입력 시 legacy fallback 진입 검증.
3. STEP 0.6 (일반 양도세 12억 안분) 이 `propertyType==="redevelopment_apt"` 에서 미발동 verify anchor 추가.

---

## 800줄 정책

- `redevelopment-lthd.ts` 290 → +50줄 (시그니처 변경) 예상 = 340줄.
- `transfer-tax-redevelopment.ts` 244 → +60~80줄 (STEP 3) 예상 = 320줄.
- `redevelopment.ts` 230 → +30줄 (highValueAllocation 부착) 예상 = 260줄.
- 전부 800줄 안전 영역. 분할 신호 없음.

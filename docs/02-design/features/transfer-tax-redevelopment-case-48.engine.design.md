# 사례 48 — 재개발 승계조합원 준공 후 신축APT 양도 — 엔진 설계

> 본 문서는 `transfer-tax-redevelopment.engine.design.md` 및 사례 44~47 디자인의 후속 확장.
> 입력 자료: PDF `재개발-승계조합원.pdf` (양도코리아 사례집 책 사례 47, p.574~578)
> 시점: 2026-05-14
> 본 PR 스코프: `isSuccessorMember` 분기 신설 + `completionDate` 필드 + LTHD/세율 기산일 통합 헬퍼
> 케이스 번호: **case_48** (책 47 — 코드 case_47은 이미 사례 47 점유)

---

## Context

사례 44~47이 모두 **원조합원** 가정(취득일 < 관리처분 인가일)이었던 데 반해, 본 사례는 **승계조합원** 분기를 본격 도입한다.

| 구분 | 원조합원 (사례 44~47) | 승계조합원 (본 PR) |
|---|---|---|
| 취득일 vs 인가일 | 취득일 < 관리처분 인가일 | 취득일 > 관리처분 인가일 |
| 취득 자산 | 종전 부동산 (주택·토지) | 조합원 입주권 (지위) |
| 신축APT 취득시기 (시행령 §162①4호) | 종전부동산 취득일 | **사용검사필증 교부일(준공일)** |
| 보유기간 기산 | 종전부동산 취득일 | **준공일** |
| 양도차익 산정 | §166① 인가전·인가후 안분 | **§166 안분 우회 — 단순 차감** |
| LTHD 적용 | 표1/표2 적용 | 보유 < 3년이면 0 |
| 비과세 (1세대1주택) | 통산 보유 | 준공일~양도일 보유 (대부분 미해당) |

근거 (★ law.go.kr 2026-05-14 확인):
- **사전-2019-법령해석재산-0649 (2020.02.11.)** ★ 직접 근거 — 승계조합원 신축APT 취득시기 = 사용검사필증 교부일. LTHD/세율 보유기간은 준공일 기산.
- 소법 시행령 §162①4호 (자가건설 의제 해석 — 보조 근거):
  > "**자기가 건설한 건축물**에 있어서는 「건축법」 제22조제2항에 따른 **사용승인서 교부일**.
  > 다만, 사용승인서 교부일 전에 사실상 사용하거나 같은 조 제3항제2호에 따른 **임시사용승인**을 받은 경우에는 그 사실상의 사용일 또는 임시사용승인을 받은 날 중 **빠른 날**"

  ⚠️ §162①4호 본문은 "자기건설" 규정. 조합원이 받는 신축APT를 자기건설 건축물로 의제하는 NTS 해석에 따라 사전-2019-법령해석재산-0649가 적용. 본 PR 코드에서는 "사용검사필증 교부일" 옛 용어와 "사용승인서 교부일" 현행 용어를 동일하게 처리(필드명 `completionDate`).
- 소법 시행령 §162①5호 (입주권 취득시기 — 갑氏 측):
  > "상속 또는 증여에 의하여 취득한 자산에 대하여는 그 **상속이 개시된 날** 또는 증여를 받은 날"
  → 갑氏의 입주권 취득시기 = 2020.4.15. (상속개시일). 신축APT 취득시기와 별개.
- 소법 §95② 단서: 입주권 LTHD = 0 (지위 양도 시) — 신축APT 양도 시 LTHD는 부동산 보유기간 적용

핵심 Pre-Do 발견 (2026-05-14):
- 양도코리아 PDF의 자산종류 = "일반주택(3)" — 재개발 인가전/인가후 안분 산식 미표시
- 양도차익 = 단순 차감(920M − 450M − 150M = 320M) — `§166 안분 우회 경로`

---

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

| # | subject | isSuccessor | direction | receiveOnly | 보유기간 | LTHD | 비과세 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **48-A** | apt | true | none | no | < 1년 (양도 2023) | 0 | 미해당 | 사전-2019-0649 + §162①4호 | PDF 양도코리아 6 anchor | `case-48-successor-member.test.ts` | ☐ **본 PR** |
| 48-B | apt | true | none | no | < 1년 다른 양도가 (양도 2023) | 0 | 미해당 | §104①3호 (주택 70%) | 자가검증 — 산식 회귀 anchor | `case-48-successor-member.test.ts` | ☐ 본 PR |
| 48-C | apt | true | none | no | 2년 이상 (3년+, 양도 2025+) | 표1 적용 | 가능성 있음 | §95②+사전-2019-0649 | (세율표 연도 정합 검증 필요) | (TODO) | **후속 PR** ★ 이동 |
| 48-G | apt | false | — | — | 원조합원 회귀 | 표1/2 | 케이스별 | §166 | 사례 44 회귀 보존 | `case-44-integration.test.ts` | ✅ 기존 |
| 48-D | apt | true | pay | no | — | — | — | §166②1호 + 승계 | (미발견) | (TODO) | **후속 PR** |
| 48-E | apt | true | receive | yes | — | — | — | §166①2호 가목 + 승계 | (미발견) | (TODO) | **후속 PR** |
| 48-F | right | n/a | n/a | n/a | n/a | n/a | n/a | 기존 `isSuccessorRightToMoveIn` 경로 | — | 기존 spec | ✅ 변경 없음 |
| 48-H | apt | true | none | no | < 1년 | 0 | 12억 초과 안분 | 사례 45 + 승계 cross-cutting | (미발견) | (TODO) | **후속 PR** |
| 48-I | apt | true | none | no | < 1년 | — | 다주택 중과 | §104⑦ + 승계 | (미발견) | (TODO) | **후속 PR** |
| 48-J | apt | true | none | no | < 1년 | — | 환산 모드 | §164⑦ + 승계 | (미발견) | (TODO) | **후속 PR** |
| 48-K | apt | true | none | no | — | — | 동일세대 상속 통산 | §154⑧ + 승계 cross-cutting | (미발견) | (TODO) | **후속 PR** (Minor 7) |
| 48-C | apt | true | none | no | 3년+ (양도 2024+) | 표1 6% | 가능성 있음 | §95²+사전-2019-0649 + 양도연도 세율표 정합 | (TODO) | (TODO) | **후속 PR** (Blocker 2 이동) |

**규칙**:
- 48-A: PDF 양도코리아 anchor 6개 (양도차익·과세표준·산출세액·지방세·세액합계·redevelopmentDetail.postApproval.gain) 원단위 `toBe`
- 48-B/C: 자가검증 anchor (양도연도 세율표 + LTHD 표1 직접 적용) — 외부 자료 추종 금지 (`feedback_transfer_year_tax_rate`)
- 48-G: 사례 44 통합 anchor 11개 100% 보존
- 48-D/E: validation 가드로 차단 + `transfer-tax-validate-redev.ts` 안내 메시지

### 48-A 핵심 anchor (원단위 toBe)

| 항목 | 값 | 산식 |
|---|---|---|
| transferGain | 320,000,000 | 920M − 450M − 150M |
| redevelopmentDetail.preApproval.gain | **0** | 안분 우회 강제 |
| redevelopmentDetail.postApproval.gain | 320,000,000 | 단순 차감 |
| longTermHoldingDeduction | 0 | 보유 76일 (< 3년) |
| basicDeduction | 2,500,000 | 기본공제 |
| taxBase | 317,500,000 | 320M − 2.5M |
| calculatedTax | **222,250,000** | 317.5M × 70% (1년 미만) |
| localIncomeTax | **22,225,000** | 222.25M × 10% |
| totalTax | **244,475,000** | 합계 |
| oneHouseExemption.applied | false | 보유 < 2년 |
| lthdStartDate | 2022-12-02 | completionDate |

### 48-B 자가검증 anchor (산식 회귀 보호 — 양도연도 2023년 한정)

48-A 동일 시점·시나리오에서 **양도가만 변형**하여 산식 분기 회귀를 보호:
- 준공일 2022.12.02 → 양도일 2023.06.01 (보유 181일, < 1년 → 70%)
- 양도가 700,000,000, 취득가 450,000,000, 추가분담금 150,000,000
- 양도차익 = 100,000,000
- 양도소득금액 = 100,000,000 (LTHD 0)
- 과세표준 = 97,500,000 (− 기본공제 2,500,000)
- 산출세액 = 97,500,000 × 70% = 68,250,000

→ 단순 차감 산식(`gain = transferPrice − rightsValue − postApprovalExpenses`)이 양도가 변형에도 유지됨을 검증.

⚠️ 양도연도 2023 한정 — 사례 44/47 등 기존 anchor와 동일한 2023년 세율표(`mock-rates` 8단계 6%~45%) 적용 환경 유지.

### 48-C → 후속 PR로 이동 (★ Blocker 2 정정)

**이동 사유**: law.go.kr §104·§55 현행본(2026-05-14 조회) = 7단계 16%~55% 신세율표. 2026.4.21 공포·시행. 양도일 2025.12.20을 anchor 시점으로 가정할 경우 시행일 부칙 정합성 검증이 필요 — `feedback_transfer_year_tax_rate` 정책상 본 PR 범위에서 임의 가정 금지.

후속 PR 진입 조건:
- 2024~2025년 시행일 적용 세율표 별도 검증 (law.go.kr 부칙 + tax_rates 시드 데이터 확장)
- LTHD 표1 3년차 6% 적용 정합성 확인 (`transfer:deduction:long_term_holding` mock-rates 그대로 가능)

후속 PR 표(아래 §9.2)에 48-C 행 추가:

| 48-C | 승계조합원 + 3년 이상 보유 (LTHD 표1 + 기본누진세율) | 양도연도별 §104 세율표 정합 검증 + tax_rates 시드 |

---

## 법령 근거

```
소법 시행령 §162 ① 4호 (★ 취득시기 본 PR 핵심):
  "건축물을 자기가 건설한 경우에는 그 건축물의 사용검사필증을 교부받은 날.
   다만, 사용검사 전에 사실상 사용하거나 사용승인을 얻은 경우에는
   그 사실상의 사용일 또는 사용승인일."
  → 승계조합원이 취득한 신축APT의 취득시기 = 준공일.

★ 사전-2019-법령해석재산-0649 (2020.02.11.):
  관리처분계획인가일 이후 입주권을 승계·취득한 경우,
  승계조합원이 취득하는 아파트의 취득시기는 아파트의 사용검사필증 교부일(준공일).
  1세대1주택 비과세 적용·LTHD 계산·세율 적용에 있어 보유기간 기산일은 모두 준공일.

소법 §104 ① (단기양도 세율):
  1년 미만: 70%
  1년 이상 2년 미만: 60% (주택·입주권은 60%, 그 외 40%)

소법 §95 ② 별표 (LTHD 표1):
  3년 미만: 0
  3년차: 6%
  매년 +2%
  15년 이상: 30% 캡

소법 §89·시행령 §154 (1세대1주택 비과세):
  2년 이상 보유 → 본 사례 미해당 (보유 76일).

소법 §154⑧ (피상속인 보유기간 통산):
  "동일세대원 상속" 한정. 본 사례는 별도세대 상속이므로 통산 배제.

소법 시행령 §166 (재개발 양도차익 산정 — 본 PR에서 우회):
  원조합원 가정 산식. 승계조합원은 적용 대상 외.
  → 본 PR `isSuccessorMember=true` 진입 시 preApprovalGain=0 강제.

소법 §95② 단서 (입주권 LTHD = 0):
  입주권 자체 양도 시 적용. 신축APT 양도 시 LTHD는 부동산 보유기간 적용.
  → 본 PR과 무관 (subject="right" 경로는 변경 없음).
```

법령코드 상수 추가 (`lib/tax-engine/legal-codes/transfer.ts`):
```ts
TRANSFER.SUCCESSOR_MEMBER_ACQUISITION_TIMING = "소법 시행령 §162①4호";
TRANSFER.SUCCESSOR_MEMBER_HOLDING_PERIOD = "사전-2019-법령해석재산-0649";
```

---

## 엔진 input 타입 (변경)

```ts
// lib/tax-engine/types/transfer-redevelopment.types.ts
interface RedevelopmentInfo {
  // ... 기존 필드 ...

  /**
   * 신축APT 사용검사필증 교부일(준공일).
   * 소법 시행령 §162①4호. 사전-2019-법령해석재산-0649.
   * isSuccessorMember=true 시 LTHD·세율 보유기간 기산일.
   */
  completionDate?: Date;

  /**
   * 승계조합원 여부 — 관리처분 후 입주권을 상속·증여·매매로 승계 취득.
   * true 시:
   *  - LTHD/세율 기산일 = completionDate
   *  - §166 인가전·인가후 안분 우회 (preApprovalGain=0 강제)
   *  - 양도차익 = transferPrice − rightsValue − postApprovalExpenses
   */
  isSuccessorMember?: boolean;
}
```

`TransferTaxInput` 자체는 변경 없음 (redevelopment 안에 격리).

---

## 엔진 result 타입 (변경)

`RedevelopmentResult.preApproval` / `postApproval` 기존 필드 재사용. 승계조합원 분기에서 `preApproval.gain = 0`, `postApproval.gain = (transferPrice − rightsValue − postApprovalExpenses)` 로 강제 채움.

`TransferTaxResult.lthdStartDate: Date` (이미 사례 35에서 도입) — 본 PR에서는 승계조합원 시 completionDate 반환.

`RedevelopmentResult.successorMemberDetail?` (선택 신규 — UI 표시용):
```ts
successorMemberDetail?: {
  applied: boolean;
  completionDate: Date;
  holdingDaysFromCompletion: number;
  shortTermRateApplied: boolean;
  rateLabel: "1년 미만 70%" | "1년 이상 2년 미만 60%" | "기본누진세율";
};
```

`RedevelopmentResult.successorMemberApplied?: boolean` (DetailedStatementRedevelopmentBuilders 분기용 — `getBranchLabels()` 신규 분기):
```ts
// components/calc/results/transfer/DetailedStatementRedevelopmentBuilders.ts
const BRANCH_LABEL_SUCCESSOR_MEMBER: Record<RedevBranch, BranchLabelDef> = {
  preApproval: { /* 가려짐, 0원 */ },
  postApprovalExistingHouse: { label: "승계조합원 단순차감", /* ... */ },
  settlement: { /* 가려짐 */ },
};

function getBranchLabels(redev: RedevelopmentResult): Record<RedevBranch, BranchLabelDef> {
  if (redev.successorMemberApplied === true) return BRANCH_LABEL_SUCCESSOR_MEMBER;  // ★ 신규
  if (redev.receiveOnlyMode === true) return BRANCH_LABEL_RECEIVE_ONLY;
  if (redev.settlementExemptionApplied === true) return BRANCH_LABEL_SETTLEMENT_EXEMPTED;
  return BRANCH_LABEL_PAY;
}
```

`RedevBranch` 유니언(`"preApproval" | "postApprovalExistingHouse" | "settlement"`)은 변경 없음 — 본 PR은 기존 3분기 중 `postApprovalExistingHouse`만 활용.

---

## 산식 결정 — 옵션 C (Pre-Do 환류)

### preApprovalGain = 0 강제

```ts
if (input.redevelopment?.isSuccessorMember === true) {
  // §166 인가전·인가후 안분 우회.
  // 양도코리아 PDF 자산종류 "일반주택(3)" 동치 (안분 비표시).
  preApproval = {
    gain: 0,
    lthd: 0,
    taxableIncome: 0,
    apportionedAcquisition: 0,
    apportionedExpenses: 0,
    holdingMonths: 0,
  };
  postApproval = {
    gain: input.transferPrice - rightsValue - postApprovalExpenses,
    lthd: calculateLthdFromCompletion(input),
    holdingMonths: monthsBetween(completionDate, transferDate),
    // ...
  };
}
```

### 추가분담금 입력 매핑 (★ PDF 양도코리아 화면 p.576 1:1)

| PDF 양도코리아 화면 라벨 | 우리 시스템 필드 | 값 | 비고 |
|---|---|---|---|
| 갑氏 취득일자 | `asset.acquisitionDate` | 2020-04-15 | 상속개시일 (시행령 §162①5호) |
| 갑氏 취득원인 ("상속_시가평가액") | `asset.acquisitionCause` | `"inheritance"` | ★ 누락 6 보강 — 상속·증여·매매 명시 매핑 |
| 갑氏 취득가액 | `asset.acquisitionPrice` ★ + redev `rightsValue` | 450,000,000 | 상속세 신고 평가액 — 두 필드 동시 사용 (실가 모드 `actualAcquisitionPrice = acquisitionPrice` 라우팅) |
| 취(등록)세 등 | `asset.expenses` (legacy) | 0 | ★ 누락 7 보강 — 본 사례 0이지만 일반 expenses 처리 정책(아래) 동반 |
| 입주권필요경비 | `redev.postApprovalExpenses` | 150,000,000 | 추가분담금 (필드 의미 라벨 분기는 UI 디자인) |
| (UI 강제) | `redev.preApprovalExpenses` | 0 (강제) | 승계조합원 분기 |
| (UI 강제) | `redev.settlementDirection` | "none" | 본 PR settlement 미지원 |
| (UI 강제) | `redev.settlementAmount` | 0 | 본 PR settlement 미지원 |

### `asset.expenses` 일반 필드 처리 정책 (★ 모순 2 정정)

Pre-Do 발견(2026-05-14)에 따라 **redev path는 `TransferTaxInput.expenses`를 차감하지 않는다**(=원조합원 분기 기존 동작과 동일). successor mode도 동일 정책 유지:

- **승계조합원 모드 시 `asset.expenses` 입력은 silent ignore되지 않도록 validate 차단**:
  ```ts
  if (isSuccessor && parseAmount(asset.expenses) > 0) {
    return `${label}: 승계조합원 모드에서는 일반 "기타 필요경비"가 아닌 "인가후 필요경비" 필드에 입력하세요. (본 모드는 §166 안분 산식을 우회하므로 일반 expenses는 무시됩니다.)`;
  }
  ```
- UI에서는 일반 expenses 필드 자체를 successor mode 시 숨김 (FA 자동 숨김 5건에 추가 — `RedevelopmentBlock` orchestrator 측 처리)

### 1세대1주택 비과세 보유기간 트리거 (★ 누락 4 보강)

`transfer-tax.ts:562` 비과세·1주택 특례 판정 분기:
```ts
const isOneHouseSpecial =
  input.isOneHousehold &&
  input.householdHousingCount === 1 &&
  residenceYearsForStep >= 2 &&
  longTermHoldingDeduction > 0;
```

`residenceYearsForStep = Math.floor(input.residencePeriodMonths / 12)` — **거주개월수 명시 입력 필드 사용**. 보유기간 자체는 `holdingPeriod = calculateHoldingPeriod(acquisitionDate, transferDate)` 로 `acquisitionDate` 직접 사용.

→ ⚠️ 본 PR(보유 < 2년)은 비과세 자동 미해당이라 영향 없으나, **48-H 후속 PR(보유 2년+) 진입 시 `holdingPeriod`도 `lthdStartDate` 기반으로 분기 필요**. 본 PR에서는 `getEffectiveAcquisitionDate(input)`을 `calculateHoldingPeriod`에도 적용하는 헬퍼 일관성 확보 권장 (단, 다른 회귀 위험을 줄이려면 후속 PR로 분리). 본 PR Definition of Done에 다음 추가:

> "1세대1주택 비과세 판정(`transfer-tax.ts:562`)이 본 PR successor mode 보유 < 2년 시나리오에서 `applied: false`로 정상 결정됨을 확인 (회귀 anchor 1건)"

### `redevSubject` 자동 셋팅 (★ 누락 5 보강)

폼 default `redevSubject: ""` + RedevelopmentBlock display fallback `value={asset.redevSubject || "apt"}` (`RedevelopmentBlock.tsx:118`)만 존재. **명시 onChange setup 부재** → API 변환·validate 시 fallback 의존.

본 PR successor mode 진입 시(`redevIsSuccessorMember = "yes"` 셋팅 onChange):
```ts
onChange({
  redevIsSuccessorMember: "yes",
  redevSubject: asset.redevSubject || "apt",  // ★ 명시 셋팅
  redevSettlementDirection: "none",            // 본 PR 강제
  // expenses 차단은 별도 validate
});
```

또는 **assetKind = "redevelopment_apt"** 선택 Step 1 onChange에서 `redevSubject = "apt"` 셋팅 (전역 1회). 이쪽이 더 자연스러우며 본 PR 범위 미초과 (작은 보강).

### valuationMeta.method 유니언 확장 (★ 누락 보강)

`lib/tax-engine/types/transfer-redevelopment.types.ts:247-250` 현재 유니언:
```ts
method: "actual" | "estimated_post_disclosure_decree_166_3" | "estimated_pre_disclosure_decree_164_7";
```

본 PR 추가:
```ts
method: "actual"
  | "estimated_post_disclosure_decree_166_3"
  | "estimated_pre_disclosure_decree_164_7"
  | "successor_member_decree_162_1_4";  // ★ 신규
```

`runSuccessorMember` 반환 시:
```ts
valuationMeta: {
  method: "successor_member_decree_162_1_4",
  numerator: undefined,    // 안분 미적용 — 0이 아닌 undefined (Minor 4 정정)
  denominator: undefined,  // 안분 미적용 — 0/0 false positive 차단
  rationale: "사전-2019-법령해석재산-0649 (승계조합원) + 시행령 §162①4호 (자가건설 의제)"
}
```

⚠️ **Minor 4 정정**: `numerator`/`denominator`를 0으로 두면 0으로 나누기 경계 테스트에서 false positive 위험. `undefined`로 명시. 향후 `RedevelopmentValuationMeta`를 discriminated union으로 좁혀 successor 분기에서는 두 필드가 아예 없도록 정의하는 것이 안전 — 본 PR에서는 호환성 위해 optional 처리 후 후속 PR에서 union narrowing.

→ `numerator: number` / `denominator: number` 타입을 `optional` 또는 `number | undefined`로 완화하는 타입 변경 1건 동반.

### LTHD/세율 기산일 통합

`lib/tax-engine/transfer-tax-finalize.ts`:

```ts
export function resolveLTHDStartDate(input: TransferTaxInput): Date {
  // 사례 48 — 승계조합원 신축APT 양도 (신규, 사례 35보다 먼저 평가)
  if (
    input.propertyType === "redevelopment_apt" &&
    input.redevelopment?.isSuccessorMember === true &&
    input.redevelopment?.completionDate
  ) {
    return input.redevelopment.completionDate;
  }

  // 사례 35 — 주택→상가 용도변경 (기존)
  if (!input.houseToCommercialConversion) return input.acquisitionDate;
  if (!input.wasMultiHouseAtConversion) return input.acquisitionDate;
  return input.conversionDate ?? input.acquisitionDate;
}

// 신규: LTHD + 세율 보유기간 통합 기산일
export function getEffectiveAcquisitionDate(input: TransferTaxInput): Date {
  return resolveLTHDStartDate(input);
}
```

`transfer-tax-rate-calc.ts:285-286` 단기세율 분기에서 `acquisitionDate` 대신 `getEffectiveAcquisitionDate(input)` 사용. 다필지 모드는 그대로 `rawInput.acquisitionDate` 유지 (재개발 분기 무관).

---

## 14 동기화 지점 체크리스트

| # | 위치 | 변경 |
|---|---|---|
| ① | AssetForm 폼 상태 | `redevCompletionDate: string` + `redevIsSuccessorMember: "yes"\|"no"` |
| ② | initial 값 | `""` / `"no"` |
| ③ | normalize | trim |
| ④ | API 변환 (`transfer-tax-api.ts`) | `completionDate: ISO`, `isSuccessorMember: boolean` |
| ⑤ | UI 위젯 (`RedevelopmentBlock.tsx`) | ToggleCard + DateInput + 안내 카드 |
| ⑥ | 사이드바 합계 | 메타 라벨 "재개발 신축APT (승계조합원, 준공일 기산)" |
| ⑦ | 결과 카드 (`RedevelopmentDetailCard`) | `successorMemberDetail` 산식 |
| ⑧ | validation (`transfer-tax-validate-redev.ts`) | 차단 해제 + 5건 신규 검증 |
| ⑨ | Zod enum 메인 | `redevIsSuccessorMember` enum |
| ⑩ | Zod enum 컴패니언 | 동일 |
| ⑪ | acquisitionDate fallback | 변경 없음 (`acquisitionDate` 그대로 입력됨 = 입주권 승계 취득일). **단, 사이드바 라벨은 "입주권 승계취득일"로 변경 + 결과 카드에 준공일(보유기간 기산일) 별도 명시** (Minor 5) |
| ⑫ | Zod 입력 객체 (RedevelopmentInfo) | `completionDate` + `isSuccessorMember` |
| ⑬ | `callTransferTaxAPI` body spread | 명시 spread |
| ⑭ | Route handler 엔진 매핑 | `coerceDates(redev, ["completionDate"])` |

---

## Validation (`transfer-tax-validate-redev.ts`) — 신규/변경

### 변경 — 차단 해제

```ts
// 변경 전 (라인 51-54):
if (acquisitionDate < approvalDate) {
  return `${label}: 인가일은 취득일 이후여야 합니다. (승계조합원 인가 후 취득은 후속 지원 예정)`;
}

// 변경 후:
const isSuccessor = asset.redevIsSuccessorMember === "yes";
if (!isSuccessor && acquisitionDate < approvalDate) {
  return `${label}: 인가일은 취득일 이후여야 합니다. 승계조합원이면 "승계조합원 모드"를 ON 하세요.`;
}
```

### 신규 — 승계 모드 검증 5건

```ts
if (isSuccessor) {
  if (!asset.redevCompletionDate) {
    return `${label}: 승계조합원 모드 — 준공일(사용검사필증 교부일)을 입력하세요. (시행령 §162①4호)`;
  }
  const completionDate = new Date(asset.redevCompletionDate);
  if (completionDate < approvalDate) {
    return `${label}: 준공일은 관리처분 인가일 이후여야 합니다.`;
  }
  if (completionDate > transferDate) {
    return `${label}: 준공일은 양도일 이전이어야 합니다.`;
  }
  if (acquisitionDate < approvalDate) {
    return `${label}: 승계조합원은 관리처분 인가일 이후 취득이어야 합니다. (인가 전 취득은 원조합원)`;
  }
  if (asset.redevSubject && asset.redevSubject !== "apt") {
    return `${label}: 승계조합원 모드는 본 PR에서 "완공 APT 양도"만 지원합니다.`;
  }
  if (asset.redevSettlementDirection && asset.redevSettlementDirection !== "none") {
    return `${label}: 승계조합원 + 청산금 분기는 후속 PR입니다.`;
  }
  if (asset.redevReceiveOnlyMode === "yes") {
    return `${label}: 승계조합원 + 청산금 수령 단독 신고는 후속 PR입니다.`;
  }
  if (asset.useEstimatedAcquisition) {
    return `${label}: 승계조합원 + 환산취득가 모드는 후속 PR입니다. 상속·증여 평가액·매매가를 직접 입력하세요.`;
  }
}
```

---

## 엔진 분기 구조 (`runRedevelopment` 진입 직후)

⚠️ **Minor 3 정정**: 기존 `redevelopment.ts:87 runRedevelopment()`는 분리된 함수가 없고 본문 자체가 원조합원 로직. 본 PR은 **2-step refactor**:

### Step 1: 기존 본문을 `runOriginalMember`로 추출 (★ 커밋 분리 권장)

기존 코드 변경 0(이름만 변경) — 사례 44 회귀 디버깅 시 bisect 추적 깔끔.

```ts
// commit 1: refactor — runRedevelopment 본문을 runOriginalMember로 추출
export function runRedevelopment(input: RedevelopmentOrchestratorInput): RedevelopmentResult {
  return runOriginalMember(input);  // 기존 본문 그대로
}

function runOriginalMember(input: RedevelopmentOrchestratorInput): RedevelopmentResult {
  // ... 기존 redevelopment.ts:87~ 본문 ...
}
```

이 커밋 단독으로 vitest 전체 회귀 0건 확인.

### Step 2: `runSuccessorMember` 추가 + 분기 라우팅

```ts
// commit 2: feat — 사례 48 승계조합원 분기 추가
export function runRedevelopment(input: RedevelopmentOrchestratorInput): RedevelopmentResult {
  if (input.redevelopment.isSuccessorMember === true) {
    return runSuccessorMember(input);  // ★ 신규 (별도 파일 redevelopment-successor.ts)
  }
  return runOriginalMember(input);
}
```

신규 함수 `runSuccessorMember()` 별도 파일 분리 (800줄 정책 — `redevelopment.ts` 현재 322줄 / `transfer-tax-redevelopment.ts` 현재 504줄):

→ `lib/tax-engine/redevelopment-successor.ts` (신규, ~120줄 예상)

⚠️ 분기 진입점은 `lib/tax-engine/redevelopment.ts:87 runRedevelopment()` 함수 본문. `transfer-tax-redevelopment.ts`는 transfer-tax.ts → redevelopment.ts 사이의 어댑터(`transferTaxRedevelopmentBranch()` 호출 측). 분기 라우팅은 `redevelopment.ts:runRedevelopment()` 진입 직후 1줄로 추가.

### `runSuccessorMember` 완전 구현 스케치 (★ 모순 1 정정 — RedevelopmentBranchDetail 3개 필수)

`RedevelopmentResult` 타입은 3분기 모두 `RedevelopmentBranchDetail`을 요구한다 (`redevelopment.ts:151-211` 참조). successor mode에서는 preApproval / settlement = 0으로 강제, postApprovalExistingHouse = primary 값으로 채운다.

```ts
// lib/tax-engine/redevelopment-successor.ts
import type { RedevelopmentBranchDetail, RedevelopmentResult } from "./types/transfer-redevelopment.types";
import type { RedevelopmentOrchestratorInput } from "./redevelopment";
import { calculateHoldingPeriod, applyLthdToGain } from "./tax-utils";

export function runSuccessorMember(input: RedevelopmentOrchestratorInput): RedevelopmentResult {
  const { redevelopment, transferDate } = input;
  const completionDate = redevelopment.completionDate!;       // validate 보장
  const rightsValue = redevelopment.rightsValue;
  const postApprovalExpenses = redevelopment.postApprovalExpenses ?? 0;
  const actualAcquisitionPrice = input.actualAcquisitionPrice ?? rightsValue;
  const transferPrice = redevelopment.transferPrice ?? input.transferPrice;  // 다중 경로 호환

  // 단순 차감 (§166 안분 우회 — 옵션 C)
  const gain = transferPrice - rightsValue - postApprovalExpenses;

  // 보유기간 = 준공일~양도일 (사전-2019-법령해석재산-0649)
  const holdingPeriod = calculateHoldingPeriod(completionDate, transferDate);

  // LTHD 표1 적용 (3년 미만 = 0, 3년차 = 6%, 매년 +2%, 15년+ = 30%)
  const lthdRate = computeTable1Rate(holdingPeriod.years);
  const lthdAmount = applyLthdToGain(gain, lthdRate);

  // 3분기 RedevelopmentBranchDetail 필수 채움
  const preApproval: RedevelopmentBranchDetail = {
    apportionedTransfer: 0,
    apportionedAcquisition: 0,
    gain: 0,
    holdingMonths: 0,
    holdingDays: 0,
    lthd: 0,
    lthdRate: 0,
    branchAcqDate: completionDate,
    branchTransferDate: transferDate,
    expenses: 0,
    lthdHoldingPart: 0,
    lthdResidencePart: 0,
    // ... (사례 44 RedevelopmentBranchDetail 필드 패리티 — 0 fill)
  };

  const postApprovalExistingHouse: RedevelopmentBranchDetail = {
    apportionedTransfer: transferPrice,
    apportionedAcquisition: rightsValue,
    gain,
    holdingMonths: holdingPeriod.months,
    holdingDays: holdingPeriod.days,
    lthd: lthdAmount,
    lthdRate,
    branchAcqDate: completionDate,             // ★ 보유기간 기산일 = 준공일
    branchTransferDate: transferDate,
    expenses: postApprovalExpenses,
    lthdHoldingPart: lthdAmount,               // 거주분 0 (1주택 특례 미해당)
    lthdResidencePart: 0,
  };

  const settlement: RedevelopmentBranchDetail = {
    /* preApproval과 동일 0 fill */ ...preApproval,
  };

  return {
    valuationMeta: {
      method: "successor_member_decree_162_1_4",
      numerator: undefined,
      denominator: undefined,
      rationale: "사전-2019-법령해석재산-0649 (승계조합원) + 시행령 §162①4호 (자가건설 의제)",
    },
    preApproval,
    postApprovalExistingHouse,
    settlement,
    total: {
      gain,
      lthd: lthdAmount,
      taxableIncome: gain - lthdAmount,
    },
    successorMemberApplied: true,             // ★ DetailedStatement 분기용
    successorMemberDetail: {
      applied: true,
      completionDate,
      holdingDaysFromCompletion: holdingPeriod.days,
      shortTermRateApplied: holdingPeriod.months < 24,
      rateLabel: holdingPeriod.months < 12
        ? "1년 미만 70% (§104①3호 주택 본문)"
        : holdingPeriod.months < 24
        ? "1년 이상 2년 미만 60% (§104①2호 주택)"
        : "기본누진세율 (§55·§104①1호)",
    },
    // 청산금 동시신고·12억 안분·환산 metadata는 undefined 명시
    receiveOnlyMode: undefined,
    settlementExemptionApplied: undefined,
  };
}

function computeTable1Rate(years: number): number {
  if (years < 3) return 0;
  if (years >= 15) return 0.30;
  return 0.06 + (years - 3) * 0.02;
}
```

### `buildLthdEmitLines()` 빌더 successor 대응 (★ 누락 3 보강)

`redevelopment.ts:260 buildLthdEmitLines(result)`는 신고서 양식 표용 LTHD 분기 line을 emit. successor mode는 단일 line만 emit:

```ts
export function buildLthdEmitLines(result: RedevelopmentResult): RedevelopmentLthdEmitLine[] {
  // ★ successor 분기 신규
  if (result.successorMemberApplied === true) {
    return [{
      branch: "postApprovalExistingHouse",
      label: "승계조합원 신축APT (준공일 기산)",
      gain: result.postApprovalExistingHouse.gain,
      lthd: result.postApprovalExistingHouse.lthd,
      lthdRate: result.postApprovalExistingHouse.lthdRate,
      holdingMonths: result.postApprovalExistingHouse.holdingMonths,
      holdingDays: result.postApprovalExistingHouse.holdingDays,
    }];
  }

  // 기존 원조합원 3분기 emit (변경 없음)
  return existingOriginalMemberEmit(result);
}
```

---

## 파일 분할 골격

| 파일 | 현재 | 신규 | 후 | 800정책 |
|---|---|---|---|---|
| `lib/tax-engine/types/transfer-redevelopment.types.ts` | 측정 필요 | +10 | — | OK |
| `lib/tax-engine/redevelopment.ts` | 322 | +6 | 328 | OK |
| `lib/tax-engine/redevelopment-successor.ts` | (신규) | +120 | 120 | OK |
| `lib/tax-engine/transfer-tax-redevelopment.ts` | 504 | +5 (분기 라우팅 1줄) | 509 | OK |
| `lib/tax-engine/transfer-tax-finalize.ts` | 233 | +20 | 253 | OK |
| `lib/tax-engine/transfer-tax-rate-calc.ts` | 730 | +10 (헬퍼 치환) | 740 | OK (60줄 여유) |
| `lib/calc/transfer-tax-validate-redev.ts` | 184 | +35 | 219 | OK |
| `components/calc/transfer/RedevelopmentBlock.tsx` | 측정 필요 | +90 | — | 측정 |
| `__tests__/.../case-48-successor-member.test.ts` | (신규) | +250 | 250 | OK |

⚠️ `transfer-tax-rate-calc.ts` 730줄 → +10 후 740줄. 800까지 60줄 여유. Do 단계에서 추가 분기 5줄 이상 발생 시 분할 신호.

---

## 결과 카드 산식 (UI 결과 표시)

```
승계조합원 신축APT 양도 (사례 48)

  · 보유기간 기산일: 2022-12-02 (사용검사필증 교부일)
  · 양도일: 2023-02-16
  · 보유일수: 76일 (1년 미만)

  양도차익 = 양도가 − 상속 시가평가액 − 추가분담금
         = 920,000,000 − 450,000,000 − 150,000,000
         = 320,000,000

  장기보유특별공제 = 0 (보유 1년 미만)
  양도소득금액 = 320,000,000
  기본공제 = 2,500,000
  과세표준 = 317,500,000
  세율 = 70% (1년 미만 단기, 준공일 기산)
  산출세액 = 222,250,000
  지방소득세 = 22,225,000
  세액합계 = 244,475,000

  ※ 시행령 §162①4호 + 사전-2019-법령해석재산-0649
```

신규 라벨 상수: `BRANCH_LABEL_SUCCESSOR_MEMBER = "승계조합원 (준공일 기산)"`

---

## anchor 구체 시나리오 (테스트 파일 골격)

```ts
describe("사례 48 — 승계조합원 준공 후 양도 (PDF 양도코리아 정합)", () => {
  // 48-A — 본 PDF 6 anchor
  describe("48-A: 보유 1년 미만 70%", () => {
    // transferGain·preApproval.gain=0·postApproval.gain·taxBase·calculatedTax·localIncomeTax·totalTax·exemption
  });

  // 48-B — 자가검증 1년 이상 2년 미만 60%
  describe("48-B: 보유 1년 6개월 60%", () => {
    // 산출세액 = 317.5M × 60% = 190,500,000
  });

  // 48-C — 자가검증 3년 이상 LTHD 적용
  describe("48-C: 보유 3년 LTHD 표1 6%", () => {
    // LTHD = 320M × 6% = 19,200,000
    // 산출세액 = 93,414,000
  });

  // 48-G — 사례 44 회귀 (별도 spec 100% 보존)
  // (case-44-integration.test.ts 그대로 유지)
});
```

---

## 9.2 후속 PR 표 (본 PR 명시 제외)

| ID | 시나리오 | 차단 위치 | 후속 PR 진입 조건 |
|---|---|---|---|
| 48-C | 승계조합원 + 3년 이상 보유 (LTHD 표1 + 기본누진세율) | 본 PR 케이스 인벤토리에서 후속 PR로 이동 | **양도연도별 §104·§55 세율표 정합 검증** (2026.4.21 7단계 신세율표 시행일 부칙 확인) + tax_rates 시드 데이터 확장 |
| 48-D | 승계조합원 + 청산금 납부 | validate `settlementDirection !== "none"` 차단 | 청산금 LTHD 분리 산정 설계 + anchor 자료 확보 |
| 48-E | 승계조합원 + 청산금 수령 단독 | validate `receiveOnlyMode === "yes"` 차단 | 사례 46 산식과 승계조합원 분기 결합 |
| 48-H | 승계조합원 + 12억 초과 안분 | 본 PR에서는 isOneHousehold=true + 보유 2년+에서만 trigger. 본 PDF는 보유 < 2년이라 미적용 | 보유 2년 이상 케이스 anchor 자료 확보 |
| 48-I | 승계조합원 + 다주택 중과 | multi-house-surcharge 모듈과 cross-cutting | §104⑦ 조정대상지역 시점 판단 + anchor |
| 48-J | 승계조합원 + 환산취득가 | validate `useEstimatedAcquisition` 차단 | 상속 평가액 부재 케이스 환산 산식 (§164⑦ 본 cross-cutting) |
| 48-K | 승계조합원 + **동일세대 상속** §154⑧ 피상속인 보유기간 통산 | 본 PR은 별도세대 가정. 동일세대 분기 anchor 부재 | `inheritance.sameHouseholdAtInheritance=true` 케이스 anchor 자료 + 통산 산식 정확성 검증 |

---

## Pre-Do 환류 메모 (2026-05-14)

본 디자인은 Pre-Do anchor 실행 결과를 반영했다:
1. **추가분담금 expenses → postApprovalExpenses 정정** (Pre-Do 발견 #10)
2. **§166 안분 우회 옵션 C 채택** (Pre-Do 발견 #11)
3. `runSuccessorMember()` 별도 파일 분리 (800줄 정책 사전 대응)
4. validate 5건 가드로 후속 PR 분리 명시

---

## Self-Audit 정정 이력 (2026-05-14)

본 문서 초안 → 1차 코드 실측 재검토에서 발견·정정한 오류·누락:

| # | 분류 | 초안 | 정정 | 근거 |
|---|---|---|---|---|
| 1 | **오류** | `subject="right_to_move_in"` 경로 표기 | `subject="right"` (실제 유니언) | `transfer-redevelopment.types.ts` + `calc-wizard-asset-redev.ts:24` |
| 2 | **누락** | `valuationMeta.method` 유니언 확장 미언급 | `"successor_member_decree_162_1_4"` 추가 명시 (§ 신규 섹션) | `transfer-redevelopment.types.ts:247-250` |
| 3 | **누락** | `successorMemberApplied?: boolean` + `BRANCH_LABEL_SUCCESSOR_MEMBER` 미언급 | `DetailedStatementRedevelopmentBuilders.getBranchLabels()` 분기 신규 추가 | `DetailedStatementRedevelopmentBuilders.ts:52` 실측 |
| 4 | **오류** | 분기 진입점 `transfer-tax-redevelopment.ts` 가정 | 실제 진입점 = `lib/tax-engine/redevelopment.ts:87 runRedevelopment()` | grep 실측 |
| 5 | **확인** | `isOneHouseSingle` vs `isOneHousehold` | RedevelopmentOrchestratorInput = `isOneHouseSingle?` / TransferTaxInput = `isOneHousehold` — 변환 라인 `redevelopment.ts:46` 실측 (변경 없음) | 차이 명시 |

### 2차 정정 (사용자 코드리뷰 환류 — 2026-05-14 PM)

| # | 분류 | 초안 | 정정 | 근거 |
|---|---|---|---|---|
| B1 | **Blocker** | §162①4호 = "신축APT 취득시기" 직접 근거로 표기 | §162①4호는 "**자기건설 건축물 사용승인서 교부일**" — 자가건설 의제 해석. **직접 근거는 사전-2019-법령해석재산-0649**. §162①5호(상속·증여)는 입주권 측 취득시기 별도 명시 | law.go.kr 시행령 §162 2026.4.23 시행본 조회 |
| B2 | **Blocker** | 48-C 양도일 2025.12.20 가정 + 누진공제 19,940,000 (2023 세율표) | law.go.kr §104·§55 2026.4.21 공포본 = **7단계 16%~55% 신세율표** 발견. 양도연도 정합 미검증. **48-C → 후속 PR로 이동**. 48-B는 양도연도 2023 한정 양도가 변형 anchor로 재설계 | law.go.kr §104 조회 |
| M3 | **Minor** | `runOriginalMember` 기존 함수 가정 | 본 PR은 **2-step refactor** — Step 1(추출 커밋 분리) + Step 2(분기 추가) 명시. bisect 추적 용이 | 기존 코드 본문 미분리 사실 |
| M4 | **Minor** | `valuationMeta.numerator/denominator = 0` | 0 → `undefined` (0/0 false positive 차단). 타입 `number | undefined`로 완화. 후속 PR discriminated union narrowing | 타입 안전성 |
| M5 | **Minor** | 사이드바 ⑪ "변경 없음" 단순 표기 | 사이드바 라벨을 **"입주권 승계취득일"** 명시 + 결과 카드에 준공일(보유기간 기산일) 별도 노출 | 두 날짜 동시 노출 시 사용자 혼란 차단 |
| M6 | **Minor** | 48-B 양도일 2023.12.01·2024.06.01 혼합 표기 모호 | 48-B = **양도 2023.06.01 + 양도가 변형(700M)** 산식 회귀 anchor로 명확화. 양도연도 2023 한정 명시 | 문장 가독성 |
| M7 | **Minor** | 48-K(동일세대 상속) 후속 PR 표 누락 | §154⑧ 피상속인 보유기간 통산 cross-cutting 후속 PR 추가 | 사례 41 계열 정합성 |

### 3차 정정 (모순·UI누락 라운드 — 2026-05-14 PM)

| # | 분류 | 초안 | 정정 | 근거 |
|---|---|---|---|---|
| C1 | **모순** | `runSuccessorMember` 단순 산식만 표시 — `RedevelopmentResult` 3분기 누락 | preApproval/postApprovalExistingHouse/settlement 3개 `RedevelopmentBranchDetail` 모두 필수 채움 + total + valuationMeta + successorMemberApplied + successorMemberDetail 전체 스케치 | `redevelopment.ts:151-211` 실측 |
| C2 | **모순** | `asset.expenses` 일반 expenses 필드 처리 미정의 | successor mode 시 validate 차단 메시지 + UI 숨김 정책 명시 | Pre-Do 발견 후속 처리 |
| D3 | **누락** | `buildLthdEmitLines()` builder 대응 미정의 | successor 단일 line emit 패턴 명시 (`redevelopment.ts:260`) | 신고서 양식 표 정합성 |
| D4 | **누락** | 1세대1주택 비과세 보유기간 트리거 위치 미언급 | `transfer-tax.ts:562` 분기. 본 PR 보유 < 2년 영향 없음 + 48-H 후속 PR 분기 명시 + 회귀 anchor 1건 DoD 추가 | grep 실측 |
| D5 | **누락** | `redevSubject` 자동 셋팅 보장 부재 | 본 PR Step 1 onChange에서 명시 셋팅 + 또는 successor 토글 onChange에서 동반 셋팅 | `RedevelopmentBlock.tsx:118` 실측 (display fallback만 존재) |
| D6 | **누락** | `acquisitionCause` 매핑 명시 부재 | PDF "상속_시가평가액" → `asset.acquisitionCause = "inheritance"` 매핑 표 추가 | `calc-wizard-asset-factory.ts:77` (default "purchase") |
| D7 | **누락** | PDF p.576 "취(등록)세 등" 필드 매핑 누락 | 매핑 표에 `asset.expenses` (0) 추가 + 일반 expenses 처리 정책 동반 | PDF 화면 1:1 정합성 |

---

## Definition of Done (본 PR)

- [ ] case-48-successor-member.test.ts anchor 8개 모두 PASS (48-A 6 + 비과세 미해당 + lthdStartDate)
- [ ] 48-B/C 자가검증 anchor 추가 PASS
- [ ] 사례 44 통합 anchor 11개 100% 보존 (48-G 회귀)
- [ ] 14 동기화 지점 자가 grep (⑫⑬⑭ 포함)
- [ ] validation 가드 5건 동작 확인 (48-D/E/H/I/J 차단 메시지)
- [ ] `npx tsc --noEmit` 0건
- [ ] 전체 vitest 회귀 0건
- [ ] 브라우저 수동 확인 (RedevelopmentBlock ToggleCard + Network 탭 신규 필드 2종)
- [ ] 메모리 등재 (`project_case_48_redev_successor_member.md`)

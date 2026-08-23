# 사례 47 — 재개발 APT 신축APT 양도 + 청산금 수령 동시신고 — 엔진 설계

> 본 문서는 `transfer-tax-redevelopment.engine.design.md` 및 사례 44·45·46 디자인의 후속 확장.
> 입력 자료: PDF 사례수정 2 "재건축(재개발)조합의 최초조합원이 청산금을 지급받은 경우"
> 시점: 2026-05-14
> 본 PR 스코프: settlement 비과세 자동 차감(`applySettlementExemption`) 신설 + 결과 타입 5필드(trace 보존) + `ExemptionAtApprovalCard` 수령 동시신고 모드 노출 + DetailedStatement 3단계 분해
> Pre-Do 실측 (2026-05-14): 현행 엔진 산출세액 = 56,250,000, 본 PR 목표 = 37,630,000 (Diff 18,620,000)

---

## Context

사례 46 (`receiveOnlyMode=true`) 청산금 수령 단독신고에 이은 **신축APT 양도 + 청산금 수령 동시신고** 분기 본격 구현.

현재 `computeAptReceive()` (`redevelopment-split.ts:271-346`)의 `receiveOnlyMode !== true` 분기는 분기 분리(split) 산식까지는 PDF와 일치하지만, 후속 `applyHighValueAllocation`이 settlement 분기까지 모두 12억 안분 합계에 포함하고 비과세 차감을 적용하지 않아 PDF anchor 도달 불가.

PDF 사례수정 2 (2)-1번 주석:
> 청산금 수령액은 기존부동산이 비과세 요건을 갖추었고 관리처분계획인가일 현재 기존부동산 평가액이 12억원 이하이므로 고가주택에 해당하지 않아 비과세된다.

핵심 의제 3가지:

1. **`applySettlementExemption` 신규 함수** — `applyHighValueAllocation` 직후 settlement 분기를 마스킹하여 양도소득금액 합산에서 제외 (서면2016-법령해석재산-2705 비과세 시점 판정 패턴을 사례 46과 공유).
2. **결과 타입 5필드 신설** — `gainAfterAllocation` / `lthdAfterAllocation` (3분기 대칭, 안분 후 trace 보존) + `settlementExemptionApplied` / `exemptedGain` / `exemptedLthd` (비과세 차감 trace).
3. **UI 노출 확장** — `ExemptionAtApprovalCard`를 receive direction 전체 (receiveOnly=yes + receiveOnly=no)에 노출 + DetailedStatement 3단계 분해 (안분 전 / 안분 후 / 비과세 차감).

---

## ★ 케이스 인벤토리 (필수)

| # | propertyType | 청산금방향 | receiveOnlyMode | 1세대1주택 | 인가일 평가액 | 비과세 | LTHD 표 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C-1 | redevelopment_apt | pay | — | TRUE | — | 12억 안분 | 표2 | §166②1호 + §155⑰ | xlsx 사례 44 | `case-44-integration.test.ts` | ✅ 기존 |
| C-2 | redevelopment_apt | pay | — | TRUE | — | 거주·12억 안분 + 거주월수 귀속 | 표2 | §166②1호 + §160 + §155⑰ + 2020-386 | xlsx 사례 45 | `case-45-integration.test.ts` | ✅ 기존 |
| C-3 | redevelopment_apt | receive | yes | TRUE+미충족 | — | 전부 과세 | 표1 | §166①본문 + §166①2호 가목 + 재산-439 + 서면2016-2705 | xlsx 사례 46 | `case-46-integration.test.ts` | ✅ 기존 |
| **C-4 / M1** | **redevelopment_apt** | **receive** | **no** | **TRUE** | **≤ 12억** | **settlement 비과세 차감 + 12억 안분** | **표2 (settlement만 표1 강등)** | **§166②2호 + §166①2호 가목 + §95③·§160 + 서면2016-2705** | **PDF 사례수정 2** | **`case-47-integration.test.ts`** | **☐ 본 PR (anchor 18건)** |
| C-5 / M2 | redevelopment_apt | receive | no | TRUE | ≤ 12억 | + 인가후 필요경비 > 0 | 동상 | + §97① 2호 | (시뮬) | `case-47-postapproval-expenses.test.ts` | ☐ 본 PR (anchor 6~8건) |
| C-6 / M3 | redevelopment_apt | receive | no | TRUE | ≤ 12억 | 거주 미충족 → 비과세 불성립 | 표1 (보유만 40%) | §155⑰ + 거주요건 부족 | (시뮬) | `case-47-no-exemption.test.ts` | ☐ 본 PR (anchor 6~8건) |
| C-7 / M4 | redevelopment_apt | receive | no | TRUE | ≤ 12억 | + 인가후 필요경비 + 거주 미충족 | 표1 | 결합 | (시뮬) | (조합) | ☐ 본 PR |
| C-8 / M5 | redevelopment_apt | receive | no | TRUE | ≤ 12억 | + 환산 모드 | 표2 (settlement만 표1) | + §166③ + §163⑥ | (시뮬) | `case-47-estimated.test.ts` | ☐ 본 PR (anchor 8~10건) |
| C-9 / M6 | redevelopment_apt | receive | no | TRUE | ≤ 12억 | + 환산 + 인가후 경비 | 동상 | 결합 | (시뮬) | (조합) | ☐ 본 PR |
| C-10 / M7 | redevelopment_apt | receive | no | TRUE | ≤ 12억 | + 환산 + 거주 미충족 | 표1 | 결합 | (시뮬) | (조합) | ☐ 본 PR |
| C-11 / M8 | redevelopment_apt | receive | no | TRUE | ≤ 12억 | + 환산 + 경비 + 거주 미충족 | 표1 | 결합 | (시뮬) | (조합) | ☐ 본 PR |
| C-F1 | redevelopment_apt | receive | no | TRUE | **> 12억** | (NTS 해석례 추적 필요) | (미정) | (미정) | (미정) | (TODO) | 후속 PR |
| C-F2 | redevelopment_apt | receive | no | FALSE (다주택) | — | multi-house-surcharge 결합 | 표1 | + 시행령 §167조의3 등 | (미정) | (TODO) | 후속 PR |
| C-F3 | right_to_move_in | receive | no | TRUE/FALSE | — | (입주권 양도 + 청산금 수령) | — | §166①2호 가·나목 (computeRightReceive) | (미정) | (TODO) | 후속 PR |

**규칙**:
- C-1~C-3 회귀 anchor 100% 보존 강제 (사례 44/45/46 무회귀).
- **C-4 anchor 18건** (§4.1 anchor 표 — Pre-Do 검증된 산출세액 37,630,000 포함).
- 본 PR 매트릭스 8개 분기 (M1~M8) — 평가액 ≤ 12억 한정. M1만 PDF anchor 18건, M2~M8은 각 6~10건 시뮬.

### C-4 (M1) 핵심 anchor 18건 (원단위 `toBe`)

| # | Anchor | 기댓값 |
|---|---|---|
| 1 | preApproval.gain (안분 전) | 525,000,000 |
| 2 | postApprovalExistingHouse.gain (안분 전) | 1,400,000,000 |
| 3 | settlement.gain (안분 전) | 175,000,000 |
| 4 | settlement.apportionedAcquisition | 25,000,000 |
| 5 | preApproval.gainAfterAllocation | 210,000,000 |
| 6 | preApproval.lthdAfterAllocation | 168,000,000 |
| 7 | postApprovalExistingHouse.gainAfterAllocation | 560,000,000 |
| 8 | postApprovalExistingHouse.lthdAfterAllocation | 448,000,000 |
| 9 | settlement.gainAfterAllocation | 70,000,000 |
| 10 | settlement.lthdAfterAllocation | 21,000,000 (표1 강등) |
| 11 | settlementExemptionApplied | true |
| 12 | exemptedGain | 70,000,000 |
| 13 | exemptedLthd | 21,000,000 |
| 14 | total.gain (마스킹 후) | 770,000,000 |
| 15 | total.lthd (마스킹 후) | 616,000,000 (= 168M + 448M, settlement.lthd 0) |
| 16 | result.taxableIncome | 154,000,000 |
| 17 | result.taxBase | 151,500,000 |
| 18 | result.calculatedTax | **37,630,000** (옵션 B) |

---

## 법령 근거

```
소법 시행령 §166②2호 (★ 청산금 수령 + 신축양도 산정식 — 미명문이나 §166②1호 준용):
  인가후 양도차익 = 신축APT 양도가 − (평가액 − 청산금) − 인가후 필요경비

소법 시행령 §166①2호 가목 (★ 인가전 분 축소):
  인가전 양도차익 × (평가액 − 청산금) / 평가액

소법 시행령 §163⑥ (★ 환산 모드 결합 시):
  취득당시 기준시가 × 3% 개산공제 자동 적용

소법 §95③ + 시행령 §160 (★ 12억 안분):
  taxableRatio = (transferPrice − 12억) / transferPrice
  분기별 양도차익·LTHD를 taxableRatio 비례 축소

★ 서면2016-법령해석재산-2705 (2016.09.12) [비과세 판정 시점]:
  청산금 수령분 1세대1주택 판정:
    - 보유주택수: 양도일 현재 기준
    - 보유·거주요건: 관리처분계획인가일 현재 기준

★ PDF 사례수정 2 (2)-1번 주석 [본 PR 비과세 차감 트리거 근거]:
  "청산금 수령액은 기존부동산이 비과세 요건을 갖추었고 관리처분계획인가일 현재
   기존부동산 평가액이 12억원 이하이므로 고가주택에 해당하지 않아 비과세된다."

★ 기획재정부 재산-439 (2014.06.09.) [LTHD 보유기간]:
  취득일~양도일 단일 보유기간 적용

소법 §95② 별표 (LTHD 표1·표2):
  표1: 보유 2%/년 (30% 캡)
  표2: 보유 4%/년 (40% 캡) + 거주 4%/년 (40% 캡, 거주2년+ 가드)
```

---

## 설계 — `applySettlementExemption` 신규 함수

### 위치 & 파이프라인 통합

`lib/tax-engine/transfer-tax-redevelopment.ts` — Step A.5 (`applyHighValueAllocation`) **직후**, Step A.6 (신규) 로 삽입. `taxableIncome` 결정 직전.

```ts
// 현행 Step A.5 (line 77~)
const allocated = isHighValueOneHouse
  ? applyHighValueAllocation(redevRaw, input.transferPrice, redevInfo)
  : redevRaw;

// 신규 Step A.6 — 본 PR
const exempted = applySettlementExemption(allocated, redevInfo, isOneHouseSingle);

// 후속 합산: exempted.total.gain / exempted.total.lthd 가 taxableIncome 산정 입력
```

**CalculationStep 추가** (`label`/`formula` 출력):
```ts
if (exempted.settlementExemptionApplied) {
  steps.push({
    label: "청산금 수령분 1세대1주택 비과세 차감",
    formula: `안분 후 양도차익 ${fmt(exempted.exemptedGain)} + LTHD ${fmt(exempted.exemptedLthd)} 합산 제외 ` +
             `(인가일 평가액 ${fmt(redevInfo.rightsValue)} ≤ 12억 + 1세대1주택 비과세 요건 충족 — 서면2016-2705)`,
    amount: -(exempted.exemptedGain - exempted.exemptedLthd),
  });
}
```

### 시그니처
```ts
function applySettlementExemption(
  redev: RedevelopmentResult,
  redevInfo: NonNullable<TransferTaxInput["redevelopment"]>,
  isOneHouseSingle: boolean,
): RedevelopmentResult;
```

### 트리거 조건 (AND)
1. `redevInfo.settlementDirection === "receive"`
2. `redevInfo.exemptionEligibleAtApproval === true` (인가일 기준 1세대1주택 비과세 요건 충족)
3. `redevInfo.rightsValue ≤ HIGH_VALUE_THRESHOLD` (1,200,000,000)
4. `redevInfo.receiveOnlyMode !== true` (사례 46 receiveOnly 단독신고는 별도 분기 — 본 함수 미적용)
5. `isOneHouseSingle === true` (LTHD 표2 진입 가드)

### 동작 (마스킹 + trace 보존)
```ts
if (!triggerConditions(redev, redevInfo, isOneHouseSingle)) {
  return redev; // 조건 미충족 — 변경 없음
}

const settlement = redev.settlement;
const exemptedGain = settlement.gain;          // 안분 후 70M (사례수정 2)
const exemptedLthd = settlement.lthd;          // 안분 후 21M (표1 강등 후)

return {
  ...redev,
  settlement: {
    ...settlement,
    gainAfterAllocation: settlement.gain,      // 보존
    lthdAfterAllocation: settlement.lthd,      // 보존
    gain: 0,                                    // 마스킹 (totalGain 재계산용)
    lthd: 0,                                    // 마스킹
  },
  // 대칭 — preApproval·postApprovalExistingHouse도 안분 후 값 보존
  preApproval: {
    ...redev.preApproval,
    gainAfterAllocation: redev.preApproval.gain,
    lthdAfterAllocation: redev.preApproval.lthd,
  },
  postApprovalExistingHouse: {
    ...redev.postApprovalExistingHouse,
    gainAfterAllocation: redev.postApprovalExistingHouse.gain,
    lthdAfterAllocation: redev.postApprovalExistingHouse.lthd,
  },
  total: {
    gain: redev.preApproval.gain + redev.postApprovalExistingHouse.gain, // 770M
    lthd: redev.preApproval.lthd + redev.postApprovalExistingHouse.lthd, // 616M
  },
  settlementExemptionApplied: true,
  exemptedGain,
  exemptedLthd,
};
```

### 불변식
- `settlement.gainAfterAllocation === exemptedGain + (마스킹 후 settlement.gain)` (마스킹 후 settlement.gain = 0이므로 등식 자명)
- `total.gain (마스킹 후) === preApproval.gain + postApprovalExistingHouse.gain`
- 사례 46 (`receiveOnlyMode === true`)은 본 함수 호출 대상 아님 — preApproval·postApprovalExistingHouse 모두 0이고 settlement만 산정. 사례 46은 별도 LTHD 강등 메커니즘 사용:
  - `redevelopment-lthd.ts:114-122`: `exemptionEligibleAtApproval === false` 시 **모든 분기 LTHD 표1 강등**
  - 사례 47은 `exemptionEligibleAtApproval === true`이므로 이 가드 미발동 → preApproval·postApprovalExistingHouse는 80% 유지
  - settlement 분기는 별도 거주월수 귀속 분리(`redevelopment-lthd.ts:280-291`)로 거주 0개월 → 30% 한도 강등 (사례 45 §155⑰ 패턴)
- **`applyHighValueAllocation` 활성 분기 차이**:
  - 사례 46: `exemptionEligibleAtApproval === false` 가드로 `highValueAllocation` 자체 비활성 (`case-46-integration.test.ts:82` `.toBeUndefined()`)
  - 사례 47: `exemptionEligibleAtApproval === true` + 양도가 > 12억 → `highValueAllocation` 활성. 그 후속에 본 함수 호출

---

## 결과 타입 5필드 신설

`lib/tax-engine/types/transfer-redevelopment.types.ts`:

```ts
export interface RedevelopmentBranchResult {
  apportionedTransfer: number;
  apportionedAcquisition: number;
  gain: number;
  lthd: number;
  lthdRate: number;
  // ... 기존 필드
  // ── 신규 (사례 47) ──
  /** 12억 안분 직후 양도차익 (비과세 차감 전) — DetailedStatement 3단계 분해용 */
  gainAfterAllocation?: number;
  /** 12억 안분 직후 LTHD (비과세 차감 전) — 동상 */
  lthdAfterAllocation?: number;
}

export interface RedevelopmentResult {
  preApproval: RedevelopmentBranchResult;
  postApprovalExistingHouse: RedevelopmentBranchResult;
  settlement: RedevelopmentBranchResult;
  total: { gain: number; lthd: number };
  // ... 기존 필드
  // ── 신규 (사례 47) ──
  /** 사례 47 settlement 분기 비과세 차감 적용 여부 */
  settlementExemptionApplied?: boolean;
  /** 비과세로 차감된 양도차익 (settlement.gainAfterAllocation과 동일) */
  exemptedGain?: number;
  /** 비과세로 차감된 LTHD (settlement.lthdAfterAllocation과 동일) */
  exemptedLthd?: number;
}
```

**Optional 처리 이유**: 사례 44/45/46(C-1~C-3)에서는 미부착 → API JSON 직렬화 graceful. 사례 47에서만 부착.

---

## UI 노출 — `ExemptionAtApprovalCard` 확장

### 현행 (`RedevelopmentBlock.tsx:364~`)
- 노출 조건: `redevReceiveOnlyMode === "yes"` AND `isOneHouseSingle === true` (사례 46)
- 표시 내용: 인가일 기준 보유·거주 자동 산정 + `exemptionEligibleAtApproval` 토글

### 확장 후 (본 PR)
- 노출 조건: `redevSettlementDirection === "receive"` AND `isOneHouseSingle === true` **(전체 receive 케이스)**
  - receiveOnly=yes (사례 46): 기존 동작 유지 (LTHD 표1 강등 + receiveOnly settlement 단독 산정)
  - receiveOnly=no (사례 47): **신규 노출** — settlement 분기 비과세 차감 자동 산정
- 표시 분기:
  - `rightsValue ≤ 12억` + `exemptionEligibleAtApproval=true` → "settlement 비과세 자동 적용" 안내 (rose tone)
  - `rightsValue > 12억` → "고가주택 → settlement 과세 적용 (후속 PR)" 안내 (amber tone, 차단)
  - `exemptionEligibleAtApproval=false` → "비과세 요건 미충족 → settlement 과세" 안내 (gray tone)

---

## DetailedStatement 3단계 분해 시각화

`DetailedStatementFormulaBuilders` 분기 추가 — `settlementDirection === "receive"` + `receiveOnlyMode !== "yes"` + `settlementExemptionApplied === true`:

```
[ 청산금 수령분 (비과세) ]
  ① 양도차익 (안분 전): 175,000,000
     산식: 청산금 200,000,000 − 안분 취득가 25,000,000

  ② 12억 초과분 안분 후: 70,000,000
     산식: 175,000,000 × (양도가 20억 − 12억) / 양도가 20억

  ③ 1세대1주택 비과세 차감: −70,000,000
     사유: 인가일 평가액 8억 ≤ 12억 + 1세대1주택 비과세 요건 충족
     근거: 서면2016-법령해석재산-2705 + PDF 사례수정 2 (2)-1번 주석

  → 양도소득금액 합산 제외
```

---

## 회귀 anchor (필수 보존)

- 사례 44 (`case-44-integration.test.ts`) — `settlementExemptionApplied` 미부착 확인
- 사례 45 (`case-45-integration.test.ts`) — 12억 안분 + 거주월수 귀속 분리 회귀 0
- 사례 46 (`case-46-integration.test.ts`) — receiveOnlyMode 단독 산정 회귀 0 (본 함수 미적용 확인)
- 사례 47 변형 M2~M8 — anchor 6~10건 × 7건

---

## 14지점 동기화 점검

본 PR은 **입력 인터페이스 변경 없음** (Pre-Do grep 결과 `exemptionEligibleAtApproval` 기존 필드 재사용).

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | 변경 없음 |
| ② initial | 변경 없음 |
| ③ normalize | 변경 없음 |
| ④ API 변환 | 변경 없음 (receiveOnlyTransferDate는 receiveOnly=yes 전용 — 동시신고는 transferDate 그대로) |
| ⑤ UI 위젯 | `ExemptionAtApprovalCard` 노출 조건 확장 (receive direction 전체) |
| ⑥ 사이드바 | settlement 비과세 라벨 반영 (선택) |
| ⑦ 결과 카드 | DetailedStatement 3단계 분해 + FilingFormTable settlement 비과세 행 추가 |
| ⑧ validate | settlementSaleDate 차단은 receiveOnly=yes 한정 (동시신고는 transferDate fallback graceful) |
| ⑨~⑭ Zod/Route | 변경 없음 (입력 재사용) |

**결과 타입 5필드 신설**의 클라이언트 노출:
- DetailedStatement·FilingFormTable이 신규 필드 직접 참조 (TypeScript 자동 동기화)
- API JSON 직렬화는 optional 필드로 사례 44/45/46 회귀 안전

---

## PDCA 단계

1. **Plan/Design**: 본 문서 (케이스 인벤토리 13행 — C-1~C-11 + C-F1~C-F3, anchor 표 18건, 5필드 신설 명세, 함수 시그니처)
2. **Pre-Do**: ✅ 완료 (2026-05-14) — M1 anchor 1건 작성·실행 → 실패 확인 (Received 56,250,000, Expected 37,630,000, Diff 18.62M)
3. **Do**:
   - §4.1 anchor 18건 + 회귀 anchor 3건 작성 (`case-47-integration.test.ts`)
   - `applySettlementExemption` 함수 구현 + `transfer-tax-redevelopment.ts` 파이프라인 통합
   - 결과 타입 5필드 신설 (`transfer-redevelopment.types.ts`)
   - `ExemptionAtApprovalCard` 노출 조건 확장 (`RedevelopmentBlock.tsx`)
   - DetailedStatement 3단계 분해 산식 분기
   - FilingFormTable 통합 검증
   - 변형 M2~M8 anchor 작성·통과 (각 6~10건)
4. **Check**: `ui-engine-sync-checker` + 브라우저 수동(폼→계산→결과, Network 탭) + M1~M8 매트릭스 전수 검증
5. **Act**: 회귀 후속 (사례 44/45/46 무회귀) + 디자인 환류 + 메모리 `feedback_pre_anchor_verification` 신설

---

## 후속 PR (본 PR 차단)

- **C-F1** 평가액 > 12억 시 청산금 수령분 고가주택 안분 — PDF 산식 부재, NTS 해석례 추적 필요
- **C-F2** 청산금 수령 + 다주택 중과 (`isOneHouseSingle = false`) — multi-house-surcharge 결합
- **C-F3** 입주권 양도 + 청산금 수령 (`computeRightReceive` 분기) — 신축APT 양도 부재
- 승계조합원 + 청산금 수령 (현행 사례 44/45 승계 미지원 흐름과 동일)
- 인가전 분 필요경비 > 0 + 동시신고 — `redevPreApprovalExpenses` 분리 입력 흐름의 `splitReceive` 산식 적합성 회귀 검증

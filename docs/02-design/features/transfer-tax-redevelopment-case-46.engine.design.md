# 사례 46 — 재개발 APT 1세대1주택자 청산금 수령분 단독 신고 — 엔진 설계

> 본 문서는 `transfer-tax-redevelopment.engine.design.md` 및 사례 44·45 디자인의 후속 확장.
> 입력 자료: PDF `재개발 청산금 수령.pdf` + xlsx `양도소득세 계산 사례/46번.xlsx` (시트 `APT-실가-수령-주택출자`)
> 시점: 2026-05-14
> 본 PR 스코프: `receiveOnlyMode` 분기 신설 + `exemptionEligibleAtApproval` LTHD 표1 강등 가드 + §166①2호 가목 단독 적용

---

## Context

사례 44 (`commit 743d8e5`) 청산금 납부분, 사례 45 (`commit 59f2e7d`) 12억 안분 + 거주월수 귀속에 이은 청산금 **수령** 분기 본격 구현. 현재 `splitReceive()` 산식(`redevelopment-settlement.ts:136`) 자체는 §166①2호 가목과 일치하나, orchestrator `computeAptReceive()`(`redevelopment-split.ts:272`)는 "신축APT 양도 + 청산금 수령" 동시 신고 케이스로 설계되어 사례 46(신축APT 양도 없음)을 산출 불가능.

핵심 의제 3가지:

1. **`receiveOnlyMode` 분기 신설** — `computeAptReceive()` 진입 시 인가전·인가후 분기를 0으로 강제, settlement 단독 산정.
2. **`exemptionEligibleAtApproval` 가드** — 관리처분계획인가일 기준 보유 2년 미충족 시 LTHD 표1 강등 (서면2016-법령해석재산-2705 판정 시점 반영).
3. **`holdingDays` 표시 필드 신설** — 신고서 양식 표 "6년 9월 11일" 일관 표시.

---

## ★ 케이스 인벤토리 (필수)

| # | propertyType | 청산금방향 | 신축APT 동시양도 | 1세대1주택 | 인가일≥2y | 비과세 | LTHD 표 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C-1 | redevelopment_apt | pay | ✅ | TRUE | TRUE | 12억 안분 | 표2 | §166②1호 + §155⑰ | xlsx 사례 44 | `case-44-integration.test.ts` | ✅ 기존 51개 |
| C-2 | redevelopment_apt | pay | ✅ | TRUE+미충족 등 | — | 전부 과세 | 표1 | §166②1호 + 재산-439 | xlsx 사례 45 12 anchor | `case-45-integration.test.ts` | ✅ 기존 |
| **C-3** | **redevelopment_apt** | **receive** | **❌ (settlement 단독)** | **TRUE** | **FALSE** | **전부 과세** | **표1** | **§166①본문 + §166①2호 가목 + 재산-439 + 서면2016-2705** | **xlsx 사례 46 12 anchor** | **`case-46-integration.test.ts`** | **☐ 본 PR** |
| C-4 | redevelopment_apt | receive | ❌ | TRUE | TRUE | 12억 안분 | 표2 | §166① 가목 + §95③·§160 + §155⑰ | (미발견) | `case-4x-receive-exempted.test.ts` | 후속 PR |
| C-5 | redevelopment_apt | receive | ✅ | TRUE/FALSE | — | 케이스별 | 케이스별 | §166②2호 (신축양도 산정식) | (미발견) | (TODO) | 후속 PR |
| C-6 | right_to_move_in | receive | ✅ | — | — | — | 표1 | §166①2호 가·나목 | (미발견) | (TODO) | 후속 PR |

**규칙**:
- C-1·C-2 회귀 anchor (총 63개+) 100% 보존 강제.
- C-3 anchor ≥ 19개 (§5.1 12개 + §5.2 LTHD 표1 강등 2개 + §5.3 양도일 동치성 1개 + §5.5 validation 가드 4개).
- C-3 핵심 anchor 6건 (원단위 `toBe`):
  - apportionedAcquisition = 133,333,333
  - settlement.gain = 366,666,667
  - settlement.lthd = 44,000,000
  - calculatedTax = 102,126,666
  - localIncomeTax = 10,212,666
  - totalTax = 112,339,332

---

## 법령 근거

```
소법 시행령 §166① 본문 + 제1항 제2호 가목 (★ 직접 적용):
  양도가액 − (평가액 − 지급받은 청산금) − 법 §97① 2호·3호에 따른 필요경비

소법 시행령 §166①2호 나목 (미적용 — receiveOnly 모드 = 인가전 잔존분 0 강제):
  인가전양도차익 × (평가액 − 지급받은 청산금) / 평가액

소법 시행령 §166② (미적용 — 신축APT 양도 없음):
  "조합원이 ... 취득한 신축주택 및 그 부수토지를 양도하는 경우"

소법 시행령 §166⑤ (직접 규정 부재):
  "제1항 및 제2항제1호에 따른 양도차익" 대상 → §166①2호 가목은 §166⑤ 직접 규정 대상 아님

★ 기획재정부 재산-439 (2014.06.09.) [LTHD 보유기간 사실상 근거]:
  "LTHD 계산시 취득일~관리처분계획인가일까지가 아닌 취득일부터 양도일까지의
   기간에 대하여 공제한다."

NTS 집행기준 (★ 양도시기):
  청산금 수령분 양도시기 = 소유권이전 고시일의 익일

소법 §89①3호 + 시행령 §154① (★ 비과세 요건):
  1세대1주택 2년 보유 (2017.8.3 이전 취득은 거주요건 불요)

★ 서면2016-법령해석재산-2705 (2016.09.12) [비과세 판정 시점]:
  청산금 수령분 1세대1주택 판정:
    - 보유주택수: 양도일 현재 기준
    - 보유·거주요건: 관리처분계획인가일 현재 기준

소법 §95② 별표 (LTHD 표1·표2):
  표1: 3년 미만 0% / 3년차 6% / 매년 2% 가산 / 15년+ 30% 캡
  표2: 보유 4%/년 (40% 캡) + 거주 4%/년 (40% 캡, 거주2년+ 가드)
```

**상수 추가** (`lib/tax-engine/legal-codes/transfer.ts`):
```ts
export const TRANSFER = {
  // ...
  REDEV_SETTLEMENT_RECEIVE_GAMOK: "소법 시행령 §166①2호 가목",
  REDEV_LTHD_HOLDING_INTERPRETATION: "기획재정부 재산-439 (2014.06.09)",
  REDEV_EXEMPTION_TIMING_RULING: "서면2016-법령해석재산-2705 (2016.09.12)",
} as const;
```

---

## 엔진 input 타입 (확장)

```ts
// types/transfer-redevelopment.types.ts
export interface RedevelopmentInfo {
  // ... 기존 필드 ...

  /**
   * 청산금 수령분 단독 신고 모드 (사례 46).
   *
   * true 시:
   *   - 인가전 양도차익 (preApproval.gain) = 0 강제
   *   - 인가후 기존주택분 (postApprovalExistingHouse.gain) = 0 강제
   *   - settlement 분만 §166①2호 가목 산식으로 계산
   *   - transferPrice 입력은 무시되고 settlementAmount 가 양도가액으로 의제됨
   *
   * 법령 근거:
   *   시행령 §166① 본문 + 제1항 제2호 가목 (§166②·§166①2호 나목 미적용)
   *   LTHD 보유기간 = 기획재정부 재산-439 유권해석
   */
  receiveOnlyMode?: boolean;

  /**
   * 관리처분계획인가일 기준 1세대1주택 비과세 보유·거주 요건 충족 여부.
   *
   * 서면2016-법령해석재산-2705 (2016.09.12):
   *   - 보유주택수: 양도일 현재 기준
   *   - 보유·거주요건: 관리처분계획인가일 현재 기준
   *
   * false 시:
   *   - LTHD 표1 강제 (표2 진입 차단)
   *   - 12억 안분 비활성화 (전부 과세)
   *
   * UI 자동 산정: monthsBetween(acquisitionDate, approvalDate) ≥ 24 → true
   * 사용자 override 허용. 미입력(undefined) 시 legacy isOneHouseSingle 로 fallback.
   *
   * 사례 46: 자동 판정 false (1년 2개월).
   */
  exemptionEligibleAtApproval?: boolean;
}
```

## 엔진 result 타입 (확장)

```ts
export interface RedevelopmentBranchDetail {
  // ... 기존 필드 ...
  holdingMonths: number;
  /**
   * 잔여 일수 (months 외 추가 — DATEDIF "d" 보완).
   * 신고서 양식 표 "X년 Y월 Z일" 일관 표시용. 기존 사례 44·45 anchor 영향 없음 (optional).
   */
  holdingDays?: number;
}
```

---

## 계산 알고리즘 (단계별)

### Step 0: receiveOnly 모드 진입 가드

```ts
// redevelopment-split.ts:272 computeAptReceive() 본문 최상단
if (redevelopment.receiveOnlyMode === true) {
  return computeReceiveOnly(args);  // 신규 분기 — 아래 Step 1~3 적용
}
// ─ 기존 로직 (신축APT 양도 + 청산금 수령 동시) 그대로 ─
```

### Step 1: 안분 취득가액 (§166①2호 가목)

```
안분 취득가액 = 종전 취득가액 × (settlementAmount / rightsValue)
            = INT(400,000,000 × 500,000,000 / 1,500,000,000)
            = 133,333,333
```

`splitReceive(0, oldAcq, rightsValue, settle)` 호출 — 인가전 양도차익 `0` 강제 → `preApprovalGainAdjusted=0` 자동.

### Step 2: 양도차익 (settlement 분 단독)

```
양도차익 = settlementAmount − 안분 취득가액 − 0
       = 500,000,000 − 133,333,333 − 0
       = 366,666,667
```

`preApproval.gain = 0`, `postApprovalExistingHouse.gain = 0` 강제 부착.

### Step 3: LTHD (§95② 표1, 재산-439 보유기간)

```
보유기간 = 종전 acquisitionDate ~ settlementSaleDate (소유권이전 고시일 익일)
       = 2016-05-06 ~ 2023-02-17
       = 6년 9월 11일 (holdingMonths=81, holdingDays=11)

LTHD 율 결정 (effectiveOneHouseSingle 가드):
  if (exemptionEligibleAtApproval === false)
    effectiveOneHouseSingle = false  → 표1 강제
  else
    effectiveOneHouseSingle = isOneHouseSingle ?? false

표1 산식: MIN(15, 6) × 2% = 12%
LTHD = INT(366,666,667 × 12%) = 44,000,000
```

### Step 4: 양도소득금액 → 과세표준 → 산출세액

```
양도소득금액 = 366,666,667 − 44,000,000 = 322,666,667
기본공제   = 2,500,000
과세표준   = 320,166,667
산출세액   = INT(320,166,667 × 40% − 25,940,000) = 102,126,666 (2023년 §55 5단)
지방소득세 = INT(102,126,666 × 10%) = 10,212,666
세액합계   = 112,339,332
```

### Step 5: receiveOnly 모드의 단기양도세율 미진입 보증

자산-수준 `acquisitionDate=2016-05-06` ~ `transferDate=2023-02-17` = 6년+ → §104①2·3호 단기양도세율 분기 미진입. `transfer-tax-helpers.calcShortTermRate()` 회귀 안전.

---

## Silent fallback / 자동 안분 후보 식별

| 필드 | 미입력 시 처리 | 정책 근거 |
|---|---|---|
| `receiveOnlyMode` | undefined → 기존 신축양도+수령 동시 분기 진입 | 후방 호환 |
| `exemptionEligibleAtApproval` | undefined → legacy `isOneHouseSingle` fallback | 사례 44·45 회귀 안전 |
| `settlementSaleDate` | 필수 (기존 Zod refine 그대로) | NTS 집행기준 |
| `transferPrice` | receiveOnly=true 시 settlementAmount 자동 미러 (UI/API 2-layer mirror) | memory `mirror-pattern` 3중 패턴 |
| `capitalExpenditure`·`transferExpense`·`postApprovalExpenses` | receiveOnly=true 시 값 있어도 **경고 + 0 강제** (차단 아님) | §97①2·3호 법문상 슬롯 존재하나 본 PR 미매핑 — 손실 방지 |
| `originalAssetType` | 사례 46 = `"housing"` (주택 출자), 기존 refine 유효 | 기존 |
| `priorHouseResidenceMonths`·`newHouseResidenceMonths` | 사례 46 비과세 미해당 → LTHD 표1, 거주월수 무관 | §155⑰ 미적용 |

**`useEffect → store` 미러링 금지**. cross-field 동기화는 onChange/useMemo.

---

## 테스트 약속

### 본 사례 anchor (12개 — xlsx D 열 원단위 toBe)

```ts
// __tests__/tax-engine/transfer/case-46-integration.test.ts
expect(result.redevelopmentDetail!.settlement.apportionedTransfer).toBe(500_000_000);   // D12
expect(result.redevelopmentDetail!.settlement.apportionedAcquisition).toBe(133_333_333); // D13
expect(result.redevelopmentDetail!.settlement.gain).toBe(366_666_667);                   // D15
expect(result.redevelopmentDetail!.settlement.lthd).toBe(44_000_000);                    // D17
expect(result.redevelopmentDetail!.preApproval.gain).toBe(0);                            // receiveOnly 강제
expect(result.redevelopmentDetail!.postApprovalExistingHouse.gain).toBe(0);              // receiveOnly 강제
expect(result.transferIncome).toBe(322_666_667);                                         // C18
expect(result.taxBase).toBe(320_166_667);                                                // C25
expect(result.calculatedTax).toBe(102_126_666);                                          // C26
expect(result.localIncomeTax).toBe(10_212_666);                                          // C29
expect(result.totalTax).toBe(112_339_332);                                               // C31
expect(result.redevelopmentDetail!.settlement.holdingMonths).toBe(81);                   // 6년 9월
expect(result.redevelopmentDetail!.settlement.holdingDays).toBe(11);                     // 잔여 일수
```

### LTHD 표1 강등 (2개)

```ts
expect(result.redevelopmentDetail!.settlement.lthdRate).toBe(0.12);           // 표1
expect(result.redevelopmentDetail!.settlement.lthdResidencePart).toBe(0);     // 표2 거주분 미적용
```

### 양도일 동치성 (1개)

```ts
const sameDay = calculate({ ...input, transferDate: new Date("2023-02-16"),
  redevelopment: { ...input.redevelopment!, settlementSaleDate: new Date("2023-02-16") } });
expect(sameDay.totalTax).toBe(112_339_332);   // 익일과 동일 (LTHD 연수 6년 불변)
```

### Validation 가드 (4개)

```ts
// 1. receiveOnly=true + direction="pay" → 엄격 차단 (논리 모순)
// 2. receiveOnly=true + settlementSaleDate 미입력 → 차단 (기존 Zod refine)
// 3. receiveOnly=true + capex>0 → 경고 + 0 강제
// 4. receiveOnly=true + transferPrice != settlementAmount → 경고 + 자동 미러
```

### 회귀 anchor (절대 보존)

- 사례 44: 산출세액 56,799,400 / 지방소득세 5,679,940 / 세액합계 62,479,340
- 사례 45: 산출세액 11,311,377 (xlsx C26)
- `__tests__/tax-engine/transfer/` 전체 2,892 pass 보존.

---

## UI 통합 위임

UI 측 명세는 [`transfer-tax-redevelopment-case-46.ui.design.md`](./transfer-tax-redevelopment-case-46.ui.design.md) 참조.

엔진 시니어 책임:
- `RedevelopmentInfo.receiveOnlyMode` / `exemptionEligibleAtApproval` 타입 정의
- `RedevelopmentBranchDetail.holdingDays` optional 신설
- `computeAptReceive()` receiveOnly 분기 + `computeRedevelopmentLthd()` effective 가드
- `legal-codes/transfer.ts` 상수 3종 추가
- anchor 19개 작성

UI 시니어 책임 (14개 동기화 지점):
- AssetForm 2 필드(`redevReceiveOnlyMode`·`redevExemptionEligibleAtApproval`)
- RedevelopmentBlock 토글 2종 + 조건부 숨김 + 자동 산정 미리보기
- WizardSidebar 양도가액 미러 표시
- DetailedStatementFormulaBuilders C-3 산식 분기
- FilingFormTable receiveOnly 모드 분기 (branchAcqDate·branchTransferDate)
- `transfer-tax-validate.ts` 가드 5건
- Zod schema 2 필드 + refine 1건
- `buildRedevelopmentPayload()` 2 필드 spread

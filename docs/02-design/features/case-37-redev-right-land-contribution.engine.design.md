# 사례 37 — 조합원입주권 양도 + 토지 출자 + 청산금 불입 + 취득실거래가 불명 (환산) — 엔진 설계

> PDF 출처: 예제 교재 사례 37 「조합원입주권(청산금 불입): 취득실거래가 확인되지 않는 경우」
>
> **핵심**: `originalAssetType="land"` (토지 출자) + `useEstimatedAcquisition=true` 시
> §166③ **토지 기준시가 단순 2-시점 비율 환산**을 적용한다.
> 기존 주택 출자(housing) 경로의 `managementDisposalHousingPrice` 대신
> `landStdPriceAtApproval` (관리처분 직전 토지 기준시가)를 분모로 사용하는 것이 핵심 차이.

## Context

- 현재 `RedevelopmentBlock.tsx`의 "출자 자산" 토글에서 `land` 옵션이 `disabled`. 본 PR에서 활성화.
- `RedevelopmentInfo.originalAssetType` 필드는 이미 존재(`"land" | "housing"`, types 118번 줄). 그러나 엔진 `computeRedevelopmentValuation`은 `managementDisposalHousingPrice` 기반 주택 라목값 패턴만 처리 — 토지 전용 `landStdPriceAtAcq`/`landStdPriceAtApproval` 필드와 분기 코드가 없음.
- 사례 36 LTHD split (`computeRightLthd`) 은 이미 `subject="right"` 시 인가전 분만 LTHD 처리 → **토지 출자도 동일 함수 재사용 가능** (파라미터 시그니처 동일).

### Plan 0 추가 점검 항목 (Do Step 1 진입 전) — ✅ 2026-05-15 grep 완료

1. ✅ `redevelopment-lthd.ts` `computeRightLthd` **module-private → export 변경 필요**
   - `:164` `function computeRightLthd(...)` — `export` 키워드 없음 (module-private 확정)
   - 외부 호출처 없음 (codebase 전수 grep: 같은 파일 `:137` 단 1건)
   - **Do Step 1에서 `export function computeRightLthd(` 로 변경 필요**. 기존 export와 충돌 없음.

2. ✅ `computeLthdRateSplit` 반환 타입 **공제율 필드명 확정**
   - `:333` `{ holding: number; residence: number; total: number }` — **`holding`** 이 보유분 공제율 필드
   - `holdingOnlyRate` / `table1Rate` / `boldingOnlyRate` 모두 존재하지 않음
   - `RedevelopmentLthdBranch.holdingRate` (`:79`) = 분기 branch에 담긴 보유분 율 — `computeLthdRateSplit().holding` 에서 할당됨
   - **`preApproval.amount` 필드 없음** — `RedevelopmentLthdBranch`에 amount 없음. 실제 LTHD 금액 계산은 호출 측에서 `applyLthdToGain(gain, branch.rate)` 를 별도 호출해야 함 (`:365`).

3. ✅ `REDEVELOPMENT` 상수 § 기호 공백 양식 확정
   - **§ 기호와 숫자 사이 공백 있음**: `"소득세법 시행령 §166 ③"` / `"소득세법 시행령 §166 ⑤"` / `"소득세법 §95 ②"` 등 모두 `§숫자 원문자` 패턴
   - 신규 `LTHD_RIGHT_TABLE1_ANNOTATION` 도 동일 양식: `"소득세법 §95 ② 별표2 [비고] 1호"` 로 기재할 것

---

## ★ 케이스 인벤토리 (Do 단계 진입 차단 게이트)

| # | ID | subject | originalAssetType | settlement | useEst | LTHD 적용 | 본 PR | 상태 |
|---|---|---|---|---|---|---|---|---|
| 1 | L-PAY-EST-37 | right | **land** | pay | true | **인가전만 표1 14% (보유 7년)** | ✅ | 구현 |
| 2 | L-PAY-ACT | right | land | pay | false | 인가전만 표1 | 후속 PR | ☐ |
| 3 | L-RCV-EST | right | land | receive | true | 인가전만 + 청산금 단독 0 | 후속 PR | ☐ |
| 4 | L-RCV-ACT | right | land | receive | false | 인가전만 + 청산금 단독 0 | 후속 PR | ☐ |
| 5 | L-APT-EST | apt | land | pay/receive | true | 표1+표2 거주분 통산 | 후속 PR | ☐ |

> ★ 본 PR 범위: L-PAY-EST-37 1행만. `validate`에서 나머지 4행(L-PAY-ACT/L-RCV-EST/L-RCV-ACT/L-APT-EST)은 차단 메시지 + "후속 PR" 안내.
>
> anchor 출처: 예제 PDF 사례 37 + 소득세법 §55 (2023) 자가검산.

---

## 법령 근거

| 조항 | 내용 |
|---|---|
| 소득세법 §94①2호 가목 | 조합원입주권 양도소득 과세대상 |
| **소득세법 §95② + 별표2 [비고] 1호** | **조합원입주권 LTHD = 관리처분계획 등 인가 전 토지분 또는 건물분의 양도소득에 한정** (인가후 분은 권리 양도이므로 LTHD 배제) |
| **소득세법 시행령 §166⑤ 1호** | **인가전 분 LTHD 보유기간 = 출자 자산 취득일 ~ 관리처분계획 인가일** |
| 소득세법 시행령 §166①1호 | 인가후 양도차익 = 양도가액 − 권리가액 − 청산금 불입액 |
| **소득세법 시행령 §166③** | **취득가액 불명 시 환산**: 권리가액 × (취득당시 토지·건물 기준시가 / 관리처분 직전 기준시가) |
| 소득세법 시행령 §163⑥ | 필요경비 개산공제 — 토지 = 취득당시 기준시가 × 3% |
| 소득세법 §97①2·3호 | 인가전 분 필요경비 = 환산취득가 + 개산공제 |
| **소득세법 §95② 별표2 (표1)** | 보유분 LTHD 공제율 — 7년 = 14% (인가전 분 토지 의제 양도) |
| 소득세법 §55 (2023) | 누진세율 — 1.5억 초과 3억 이하: 38% − 19,940,000 |
| **소득세법 §103①1호** | **양도소득 기본공제 250만원** (자산 그룹별 1회) |
| **지방세법 §103의3** | **개인지방소득세 양도소득분 = 산출세액 × 10%** |

### §166③ 토지 출자 환산 산식

```
환산취득가 = floor(권리가액 × 취득당시 토지 기준시가 / 관리처분 직전 토지 기준시가)
           = floor(300,000,000 × 100,000,000 / 150,000,000)
           = 200,000,000
```

> 기존 주택 출자(housing) 경로의 `managementDisposalHousingPrice` 대신
> `landStdPriceAtApproval`을 분모로, `landStdPriceAtAcq`를 분자로 사용한다.
> 이 외 산식 구조는 §166③ 동일 (곱셈 먼저 후 나눗셈 — 오버플로우 방지 `safeMultiplyThenDivide` 사용).

### §95② + 별표2 [비고] 1호 — LTHD 적용 범위

별표2 [비고] 1호 원문:
> "법 제94조제1항제2호가목에 따른 조합원입주권의 양도소득 중 **관리처분계획 등 인가 전 토지분 또는 건물분의 양도소득에 한정하여** 적용한다."

```
인가전 분 (preApprovalGain): §95② 별표2 (표1) 보유분 LTHD 적용
  - 보유기간 = 취득일(2007-04-09) ~ 관리처분 인가일(2014-10-23) = 만 7년
  - 표1 7년 공제율 = 14%
  - LTHD = 97,000,000 × 14% = 13,580,000

인가후 분 (postApprovalGain): 별표2 [비고] 1호 "인가 전 ... 한정" → LTHD 배제
  - 권리 양도이므로 토지·건물 아님 → postApprovalLTHD = 0
```

> 사례 36(주택 출자)과 동일한 LTHD split 구조 — `computeRightLthd`(redevelopment-lthd.ts) 재사용 가능.

---

## 엔진 input 타입 — 신규 필드 (RedevelopmentInfo 확장)

```ts
// lib/tax-engine/types/transfer-redevelopment.types.ts — RedevelopmentInfo 확장

/**
 * 토지 출자 환산 케이스 (originalAssetType="land" + useEstimatedAcquisition=true 시 필수)
 *
 * 산식 (시행령 §166③ 토지분):
 *   환산취득가 = floor(권리가액 × landStdPriceAtAcq / landStdPriceAtApproval)
 *
 * 주택 출자 환산(managementDisposalHousingPrice/acquisitionHousingPrice)과 별개 필드.
 */

/** 취득당시 토지 기준시가 (원, 총액). originalAssetType="land" + 환산 시 필수. */
landStdPriceAtAcq?: number;

/** 관리처분 직전 토지 기준시가 (원, 총액). originalAssetType="land" + 환산 시 필수. */
landStdPriceAtApproval?: number;
```

---

## 엔진 result 타입 — 신규 (RedevLandContribResult)

```ts
// lib/tax-engine/redevelopment-land-contribution.ts 내부 타입

export interface RedevLandContribResult {
  /** §166③ 환산취득가 (원, 정수) */
  convertedAcquisition: number;
  /** §163⑥ 개산공제 (원, 정수) = landStdPriceAtAcq × 3% */
  estimatedDeduction: number;
  /** 인가전 양도차익 (원, 정수) = 권리가액 − 환산취득가 − 개산공제 */
  preApprovalGain: number;
  /** 인가후 양도차익 (원, 정수) = 양도가액 − 권리가액 − 청산금 불입액 */
  postApprovalGain: number;
  /** 양도차익 합계 */
  totalGain: number;
  /** 인가전 분 LTHD (§95② 별표2 표1 보유분) */
  preApprovalLTHD: number;
  /**
   * 인가후 분 LTHD — 항상 0 (별표2 [비고] 1호 "관리처분 인가 전 토지·건물분에 한정").
   * literal type 0 대신 number — TS 좁힘 회피.
   */
  postApprovalLTHD: number;
  /** LTHD 합계 */
  totalLTHD: number;
  /** LTHD 보유기간 시작일 (= 취득일, 시행령 §166⑤ 1호) */
  lthdHoldingStartDate: Date;
  /** LTHD 보유기간 종료일 (= 관리처분 인가일, 시행령 §166⑤ 1호) */
  lthdHoldingEndDate: Date;
  /** 만 보유 연수 (년, 정수 — 표1 공제율 조회용) */
  lthdHoldingYears: number;
  /** 표1 공제율 (0~0.30) */
  lthdRate: number;
}
```

---

## 신규 모듈 구조 — `lib/tax-engine/redevelopment-land-contribution.ts`

```
목표 줄수: ~200줄 (800줄 정책 엄수)

노출 exports:
  calcRedevLandContribEstimated(input) → RedevLandContribResult
  - 내부: safeMultiplyThenDivide(권리가액 × landStdPriceAtAcq, landStdPriceAtApproval)  ← ✅ tax-utils.ts:87 존재
  - 내부: calculateHoldingPeriod(acquisitionDate, approvalDate)  ← ✅ tax-utils 존재
  - LTHD 계산: ★ **`computeRightLthd(args)` 그대로 재사용** (redevelopment-lthd.ts:164)
    · 시그니처: {acquisitionDate, approvalDate, isSuccessorRightToMoveIn, isOneHouseSingle, residencePeriodMonths}
    · 본 사례는 isSuccessorRightToMoveIn=false, isOneHouseSingle=false, residencePeriodMonths=0 으로 호출
    · 반환: {preApproval, postApprovalExistingHouse, settlement} — 사례 36 mirror 완전 일치
    · 별도 `lookupLthdTable1Rate` 신규 함수 불필요 (computeRightLthd 내부에서 computeLthdRateSplit 호출)
  - 법령 상수: REDEVELOPMENT.CONVERTED_ACQ + REDEVELOPMENT.LTHD_RIGHT_PRE_APPROVAL
               + REDEVELOPMENT.LTHD_RIGHT_TABLE1_ANNOTATION (신규)

import:
  - safeMultiplyThenDivide, calculateHoldingPeriod (tax-utils) ← ✅ 존재 확인됨
  - applyRate (tax-utils) — estimatedDeduction = floor(landStdPriceAtAcq × 0.03)
  - REDEVELOPMENT (legal-codes/transfer)
  - RedevelopmentInfo (types/transfer-redevelopment.types)
  - computeRightLthd 또는 동등 export (redevelopment-lthd.ts — 현재 module-private. **Do Step 1에서 export 추가 필요**)

방어 코드 (Critical 2 a + Improvement 3):
  - 함수 첫줄 guard: `if (landStdPriceAtApproval <= 0) throw new TaxRateNotFoundError("land-contrib: landStdPriceAtApproval must be > 0")`
  - preApprovalExpenses는 본 PR 강제 0 — 함수 시그니처에서 제외 (후속 PR에서 optional 추가)
```

### 핵심 알고리즘 (단계별)

```ts
// Step 1: §166③ 토지분 환산취득가
const convertedAcquisition = safeMultiplyThenDivide(
  rightsValue,           // 300,000,000
  landStdPriceAtAcq,     // 100,000,000
  landStdPriceAtApproval // 150,000,000
);
// = 200,000,000

// Step 2: §163⑥ 개산공제 (토지 3%)
const estimatedDeduction = Math.floor(landStdPriceAtAcq * 0.03);
// = 3,000,000

// Step 3: §166①1호 인가전 양도차익 (preApprovalExpenses 강제 0 — Critical 2 a 결정)
const preApprovalGain = Math.max(
  0,
  rightsValue - convertedAcquisition - estimatedDeduction
);
// = 300,000,000 - 200,000,000 - 3,000,000 = 97,000,000

// Step 4: §166①1호 인가후 양도차익
const postApprovalGain = Math.max(
  0,
  transferPrice - rightsValue - settlementPaid - postApprovalExpenses
);
// = 520,000,000 - 300,000,000 - 100,000,000 - 0 = 120,000,000

// Step 5: LTHD 계산 — computeRightLthd 통째 재사용 (사례 36 mirror)
const lthdResult = computeRightLthd({
  acquisitionDate,
  approvalDate,
  isSuccessorRightToMoveIn: false,   // 본 PR: 원조합원만
  isOneHouseSingle: false,           // 본 PR: 1세대1주택 입주권 분기는 housing에서 처리
  residencePeriodMonths: 0,          // 입주권은 표2 거주분 자체 비대상
});

// Step 6: 결과 추출
// ✅ Plan 0 점검 완료:
//   - lthdResult.preApproval.amount 없음 → applyLthdToGain 별도 호출 필요
//   - 보유분 공제율 필드: lthdResult.preApproval.holdingRate (= computeLthdRateSplit().holding = 0.14)
//   - applyLthdToGain은 redevelopment-lthd.ts:365 export 함수 — import 가능
const preApprovalLTHD = applyLthdToGain(preApprovalGain, lthdResult.preApproval.rate);
//  = applyRate(97,000,000, 0.14) = 13,580,000  (rate = holdingRate 0.14, residenceRate 0)
const postApprovalLTHD = 0;
//  = lthdResult.postApprovalExistingHouse.applicable === false (zeroBranch — 별표2 [비고] 1호)

const holdingYears = Math.floor(lthdResult.preApproval.holdingMonths / 12);  // 7
```

---

## 신규 법령 상수 (`lib/tax-engine/legal-codes/transfer.ts`)

`REDEVELOPMENT` 객체 내 추가:

```ts
/** 소득세법 §95 ② 별표2 [비고] 1호 — 조합원입주권 LTHD = 인가 전 토지·건물분 한정 */
LTHD_RIGHT_TABLE1_ANNOTATION: "소득세법 §95 ② 별표2 [비고] 1호",
```

> **이미 존재하는 상수 재사용 가능** (✅ grep 확인 — 모두 `§숫자 원문자` 공백 패턴):
> - `REDEVELOPMENT.CONVERTED_ACQ` = "소득세법 시행령 §166 ③" (환산취득가)
> - `REDEVELOPMENT.LTHD_PERIOD` = "소득세법 시행령 §166 ⑤"
> - `REDEVELOPMENT.LTHD_RIGHT_PRE_APPROVAL` = "소득세법 시행령 §166 ⑤ 1호"
> - `REDEVELOPMENT.LTHD_RIGHT_PROVISO` = "소득세법 §95 ②" (LTHD 단서)
>
> **신규 추가 필요** (공백 양식 통일 — `§95 ②` 패턴):
> - `REDEVELOPMENT.LTHD_RIGHT_TABLE1_ANNOTATION` = "소득세법 §95 ② 별표2 [비고] 1호"
>
> ~~`LAW.SHIRYORYO_166_3`~~ → 이미 `REDEVELOPMENT.CONVERTED_ACQ` 로 존재 — 중복 추가 금지
> ~~`LAW.SHIRYORYO_166_5`~~ → 이미 `REDEVELOPMENT.LTHD_PERIOD` 로 존재 — 중복 추가 금지

---

## 14개 동기화 지점 매트릭스

### 클라이언트 8지점

| # | 파일 | 변경 내용 |
|---|---|---|
| ① 폼 상태 | `lib/stores/calc-wizard-asset-redev.ts` | `redevLandStdPriceAtAcq?: string` + `redevLandStdPriceAtApproval?: string` 2 필드 추가 |
| ② initial | `lib/stores/calc-wizard-asset-factory.ts` | 신규 2 필드 `""` 기본값 |
| ③ normalize | 동일 factory | `parseAmount(landStdPriceAtAcq)` number 변환 |
| ④ API 변환 | `lib/calc/transfer-tax-api-helpers.ts:buildRedevelopmentPayload()` | `landStdPriceAtAcq`, `landStdPriceAtApproval` 2 필드 RedevelopmentInfo 매핑 추가 |
| ⑤ UI 위젯 | `RedevelopmentBlock.tsx` | `disabled: o.value === "land"` 제거 |
| | `RedevelopmentValuationSection.tsx` | `originalAssetType==="land"` 분기 — 토지 2-시점 입력 노출 |
| ⑥ 사이드바 | (회귀 0 — 메타 변경 없음) | - |
| ⑦ 결과 카드 | `DetailedStatementRedevelopmentBuilders.ts` | `originalAssetType="land"` 분기 — 환산 산식 한국어 표기 + LTHD split 표시 |
| | `FilingFormTableRedevRows.ts` | ColumnMode `redev-right-land-pay` 추가 (인가전/인가후 2열 분기) |
| ⑧ validation | `lib/calc/transfer-tax-validate-redev.ts` | `originalAssetType==="land"` + `useEst=true` 시 두 필드 > 0 강제 |

### API / Route 6지점

| # | 파일 | 변경 내용 |
|---|---|---|
| ⑨ Zod enum 메인 | route Zod | 기존 `z.enum(["land","housing"])` 유지 — 변경 0 |
| ⑩ Zod enum 컴패니언 | route Zod | 동일 — 변경 0 |
| ⑪ acquisitionDate fallback | route handler | 영향 없음 |
| ⑫ Zod 입력 객체 | `lib/api/transfer-tax-schema.ts` L348 다음 | **`landStdPriceAtAcq: z.number().int().nonnegative().optional()` + `landStdPriceAtApproval: z.number().int().nonnegative().optional()` 추가 — 누락 시 침묵 stripping ★** |
| ⑬ callTransferTaxAPI body | `lib/calc/transfer-tax-api.ts:614` | **변경 0 — spread 패턴(`...(redevPayload !== undefined ? { redevelopment: redevPayload } : {})`)으로 ④ 수정 시 자동 충족** |
| ⑭ Route handler 엔진 매핑 | `app/api/calc/transfer/route.ts:401` | **변경 0 — `...data.redevelopment` spread 패턴으로 Zod 통과 후 자동 포함** (number 필드이므로 Date 변환 불필요). 단 ⑫ 추가가 선행 조건 |

### 엔진 Layer 2

| 파일 | 변경 |
|---|---|
| `lib/tax-engine/types/transfer-redevelopment.types.ts` | `RedevelopmentInfo`에 `landStdPriceAtAcq?`, `landStdPriceAtApproval?` 추가 |
| **신규** `lib/tax-engine/redevelopment-land-contribution.ts` | 토지 출자 환산취득가 + LTHD split 순수 함수 (~200줄) |
| `lib/tax-engine/redevelopment-split.ts` | `computeRedevelopmentSplit`에 `originalAssetType==="land"` 분기 라우터 추가 — `calcRedevLandContribEstimated` 호출 |
| `lib/tax-engine/legal-codes/transfer.ts` | `REDEVELOPMENT.LTHD_RIGHT_TABLE1_ANNOTATION` 신규 상수 1개 |

---

## anchor 테스트 표 (L37-1 ~ L37-10)

| anchor ID | 기댓값 | 산식 | 근거 |
|---|---|---|---|
| L37-1 | convertedAcquisition = 200,000,000 | floor(rightsValue[300,000,000] × landStdPriceAtAcq[100,000,000] / landStdPriceAtApproval[150,000,000]) | 시행령 §166③ |
| L37-2 | estimatedDeduction = 3,000,000 | floor(landStdPriceAtAcq[100,000,000] × 3%) | §163⑥ 토지 |
| L37-3 | preApprovalGain = 97,000,000 | rightsValue[300,000,000] − convertedAcquisition[200,000,000] − estimatedDeduction[3,000,000] (preApprovalExpenses 강제 0) | §166①1호 인가전 |
| L37-4 | postApprovalGain = 120,000,000 | transferPrice[520,000,000] − rightsValue[300,000,000] − settlementPaid[100,000,000] − postApprovalExpenses[0] | §166①1호 인가후 |
| L37-5 | totalGain = 217,000,000 | 97,000,000 + 120,000,000 | 합계 |
| L37-6 | preApprovalLTHD = 13,580,000 | floor(97,000,000 × 14%) / 보유 7년 표1 | §95② + 별표2 [비고] 1호 + §166⑤1호 |
| L37-7 | postApprovalLTHD = 0 | 별표2 [비고] 1호 "인가 전 ... 한정" | 권리 양도분 LTHD 배제 |
| L37-8 | taxableIncome = 200,920,000 | 217,000,000 − 13,580,000 − 2,500,000 | 기본공제 §103①1호 |
| L37-9 | calculatedTax = 56,409,600 | 200,920,000 × 38% − 19,940,000 | §55 (2023) 누진 |
| L37-10 | localTax = 5,640,960 | 56,409,600 × 10% | 지방세법 §103의3 |

> **L37-9 검산**: 200,920,000 × 0.38 = 76,349,600 − 19,940,000 = **56,409,600** ✅
> 1.5억 초과 3억 이하 구간 (38% / 누진공제 19,940,000).
>
> **Pre-Do 우선 검증 anchor** (4건): **L37-1·L37-3·L37-6·L37-9** — 인가전·인가후·LTHD·산출세액 각 독립 검증. L37-5(합계)는 L37-3+L37-4 의존이므로 Pre-Do에서 제외하고 본 단계에서 검증. 엔진 함수 미존재 시 import 주석 처리 후 it.skip.

---

## Silent fallback / 자동 안분 후보 식별

| 필드 | 위험 | 대응 |
|---|---|---|
| `landStdPriceAtAcq` 미입력 | 환산취득가 0 → 양도차익 급등 | validate: `originalAssetType==="land" && useEst=true` 시 > 0 강제 차단 |
| `landStdPriceAtApproval` 미입력 | 분모 0 → ZeroDivision | validate: 동일 조건 > 0 강제 차단 |
| `landStdPriceAtApproval === 0` | safeMultiplyThenDivide 내부 ZeroDivision 방지 | 엔진 내 방어 코드 추가 (validate 1차, 엔진 2차) |

> `feedback_no_silent_apportion_fallback` 정책 엄수 — 0 fallback 절대 금지.

---

## UI 통합 위임

UI 시니어 책임 사항 (별도 `case-37-redev-right-land-contribution.ui.design.md` 작성 필요):

- `RedevelopmentBlock.tsx`: `disabled: o.value === "land"` 제거
- `RedevelopmentValuationSection.tsx`: `originalAssetType==="land"` 분기 — 토지 2-시점 입력 + violet 경고 카드 + useMemo 미리보기
- `FilingFormTableRedevRows.ts`: ColumnMode `redev-right-land-pay` (합계/인가전/인가후 3열)
- ⑫⑬⑭ Zod/spread/route handler 신규 2 필드 동기화

---

## 회귀 안전망

- 기존 redevelopment anchor 전체 218건 (housing 분기 변경 없음 — `originalAssetType==="land"` 분기는 신규 진입로)
- 사례 36/44~48 기존 anchor 모두 보존
- `redevOriginalAssetType` 기본값 `"housing"` fallback 유지 (sessionStorage 호환, api-helpers:709)
- `disabled: false` 변경은 land 선택 가능성만 열어줌 — housing 디폴트 회귀 없음
- **명시 회귀 anchor** (테스트 파일에서 import):
  - `__tests__/tax-engine/transfer-tax/redevelopment/case-redev-right-transfer-pay-lthd-split.test.ts` (사례 36 LTHD split 11 anchor)
  - `__tests__/tax-engine/transfer-tax/redevelopment/case-44-*.test.ts` (사례 44 anchor — housing 디폴트)
  - 두 파일 회귀 0건 통과 후 본 PR 머지

---

## 후속 PR 신호

- L-PAY-ACT: 토지 출자 + 실가 취득가액 직접 입력
- L-RCV-EST/ACT: 토지 출자 + 청산금 수령 단독 신고
- L-APT-EST: 완공 APT + 토지 출자 (사례 40~43)
- `computeRightLthd` 시그니처 공통화 리팩토 — module-private 해제 후 명시 export
- `redevPreApprovalExpenses` 입력 노출 (현재 본 PR 강제 0 — 후속 PR에서 land 분기 실비 입력 지원)
- 토지 ㎡당 단가 × 면적 입력 위젯 (LandPriceLookupField 패턴, Vworld 자동 조회 — 본 PR은 총액 직접 입력만 지원)

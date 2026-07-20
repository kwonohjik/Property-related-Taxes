# 계획서 — 동일세대 상속주택 자체 양도: 거주기간 통산(§154⑧3호) 미구현 → 1세대1주택 고가주택 비과세·장특 표2 미반영 버그 수정

- 작성일: 2026-07-20
- 대상 세목: 양도소득세 (transfer)
- 관련 선행: PR#698·#699 (§154⑧3호 **보유** 통산), [[project_transfer_155_2_4_5_exemption]] Tier 2-B
- 상태: **Plan (자가검토 1사이클 완료 — verdict: needs-fix→clean, Critical/High 0 잔존)**

---

## 1. 증상 (사용자 보고 + 실측 재현)

상속으로 취득한 주택이고 **상속개시 당시 피상속인과 동일세대**인데, 세무 교재 사례(첨부 이미지2)의 결과가 계산기에 반영되지 않는다.

### 1.1 입력 시나리오 (이미지3 UI)

| 항목 | 값 |
|---|---|
| 취득원인 | 상속 |
| 상속개시일 (`acquisitionDate`) | 2017-09-15 |
| 피상속인 취득일 (`decedentAcquisitionDate`) | 2010-02-02 |
| 동일세대 토글 (`decedentSameHouseholdBeforeInheritance`) | ON |
| 동일세대 거주·보유 개시일 (`decedentCohabitationHoldingStartDate`) | 2010-02-02 |
| 양도일 (`transferDate`) | 2026-02-16 |
| 양도가액 | 1,300,000,000 (>12억 고가주택) |
| 취득가액(상속세 신고가액) | 400,000,000 |
| 자산구분·1세대1주택 | 주택 · isOneHousehold=true · householdHousingCount=1 |
| 실거주(상속개시일부터) | 0 (거주기간 -) |

### 1.2 실측 재현 (throwaway probe, mock rates)

| 케이스 | isExempt | 과세대상 양도차익 | 장특 | 장특율 | 산출세액 |
|---|---|---|---|---|---|
| **A. 조정지역O·실거주0** ← 이미지4 | false (사유 無) | **900,000,000** | **144,000,000** | **16% (표1)** | **280,530,000** |
| B. 조정지역X·실거주0 | false·고가주택 | 69,230,769 | 11,076,923 | 16% (표1) | 7,596,923 |
| C/D. 실거주24 통산입력 | false·고가주택 | 69,230,769 | 27,692,307 | **40% (표2)** | 4,595,769 |

**케이스 A가 이미지4와 원 단위까지 일치**(과세대상 900,000,000·장특 144,000,000·산출세액 280,530,000). ⇒ 버그 확증.

### 1.3 케이스 정답 (이미지2)

- **비과세**: 1세대1주택 **고가주택 부분과세** — 12억 초과분만 과세.
  - 과세대상 양도차익 = 900,000,000 × (1,300,000,000 − 1,200,000,000) ÷ 1,300,000,000 = **69,230,769**
- **장특**: **표2 적용**, 단 공제율 계산 보유·거주기간은 **상속개시일부터 기산**.
  - 보유 8년 × 4% = 32% + 거주 0년 × 4% = 0% → **32%**
  - 장특 = 69,230,769 × 32% = **22,153,846**
  - 양도소득금액 = 69,230,769 − 22,153,846 = **47,076,923**
  - 과세표준 = 47,076,923 − 기본공제 2,500,000 = 44,576,923 → 산출세액 = floor(44,576,923 × 15%) − 1,260,000 = **5,426,538** (지방소득세 542,650). *현행 버그값 280,530,000 대비 −275,103,462.*
  - 산출세액 반올림식 검증: probe 케이스 B(표1) 산출세액 7,596,923 = floor(55,653,846 × 24%) − 5,760,000 로 엔진 `floor(과표×rate) − 누진공제` 재현 확인 → 위 5,426,538 확정.

---

## 2. 근본 원인 — §154⑧3호 "거주기간" 통산 미구현 (2개 독립 증상, 1개 뿌리)

### 2.1 법령 (KoreanLaw 현행 소득세법 시행령 mst=286211 실측)

- **§154①**: 취득 당시 조정대상지역 주택은 보유 2년 **+ 거주 2년** 이상이어야 1세대1주택 비과세.
- **§154⑧**: 제1항에 따른 **거주기간 또는 보유기간**을 계산할 때 다음 각 호의 기간을 통산한다.
  - **3호**: 상속받은 주택으로서 상속인과 피상속인이 상속개시 당시 동일세대인 경우에는 상속개시 전에 상속인과 피상속인이 동일세대로서 **거주하고 보유한 기간**.
- **§95② 표2**: 1세대1주택 장특공제(보유분 최대 40% + 거주분 최대 40%).
- **사전법령해석재산 2021-202 (2021.08.24., 이미지2 인용)**: 동일세대원 상속 1세대1주택(고가주택)의 **표2 적용 대상 여부 판정** 시 피상속인·상속인 보유·거주기간을 통산. **단, 공제율 계산(보유·거주기간별)은 상속개시일부터 기산.**

⇒ **§154⑧3호는 "거주기간"까지 명시 통산**한다. 현행 엔진은 **보유만 통산**, 거주 통산은 미구현.

### 2.2 현행 구현 상태 (file:line 실측)

**보유 통산은 구현됨** — `lib/tax-engine/transfer-tax-exemption.ts:165-175` `resolveExemptionHoldingStartDate`:
```ts
// inheritance && decedentSameHouseholdBeforeInheritance===true && decedentCohabitationHoldingStartDate < acquisitionDate → backdate
```
`meetsOneHouseHoldingResidence:182`에서 **보유기간만** 이 backdate로 계산.

**거주 통산은 미구현** — 두 곳에서 `residencePeriodMonths`(상속개시일부터 실거주)를 직접 사용:

1. **Bug A — 비과세 거주요건** (`transfer-tax-exemption.ts:137`, `meetsOneHouseResidenceRequirement`):
   ```ts
   const residenceYears = Math.floor(input.residencePeriodMonths / 12);   // 실거주만 — 통산 없음
   ...
   residenceYears >= rule.regulatedAreaMinResidenceYears                  // 조정지역 시 거주 2년 요구
   ```
   실거주 0 + 조정지역이면 거주요건 미충족 → `meetsOneHouseHoldingResidence:184` false → `checkExemption` E-4(`:340`) `{isExempt:false, isPartialExempt:false}` → **고가주택 부분과세조차 안 됨(전액 과세)**. (probe 케이스 A)

2. **Bug B — 장특 표2 대상 판정** (`transfer-tax-helpers.ts:505-520`, `calcLongTermHoldingDeduction`):
   ```ts
   const isOneHouseSingle = input.isOneHousehold && input.householdHousingCount === 1;
   const residenceYears = Math.floor(input.residencePeriodMonths / 12);   // 실거주만
   const rateForYears = (years) => {
     if (years < 3) return 0;
     if (isOneHouseSingle && residenceYears >= 2) {                       // ← 표2 대상 게이트 = 실거주 2년
       return Math.min(years*0.04, 0.40) + Math.min(residenceYears*0.04, 0.40);  // 표2
     }
     return Math.min(years*0.02, 0.30);                                   // 표1
   };
   ```
   실거주 0 → `residenceYears < 2` → 표1(16%). (probe 케이스 B)
   부수토지 경로에도 동일 게이트: `transfer-tax-helpers.ts:470`.

### 2.3 현행 "거주 통산 = residencePeriodMonths에 사용자가 포함" 설계의 결함

선행 PR#698·#699는 거주 통산을 "사용자가 통산분을 `residencePeriodMonths`에 직접 입력"으로 처리(메모리 Tier 2-B, `CompanionAcqInheritanceBlock.tsx:86-87` 힌트 *"거주기간 통산분은 '거주기간'에 포함해 입력하세요"*). **이 설계는 이 사례에서 오답**을 낸다:

- 통산분을 `residencePeriodMonths`에 넣으면(실거주 24) → 표2는 되나 **거주분 공제율이 실거주로 계산되어 40%**(probe C/D). 정답은 32%(거주분 0, 상속개시일부터 실거주).
- 즉 **표2 대상 판정(통산)** 과 **공제율 계산(상속개시일부터 실거주)** 가 하나의 스칼라에 conflate됨 → 분리 불가.

이미지2의 참조 소프트웨어는 이 문제를 "실거주 여부" 드롭다운의 별도 옵션 **"2년미만(동일세대간 상속)"** — *표2 적용 + 보유기간별 공제율만(거주분 0)* — 으로 해결한다. 본 엔진에도 **통산 거주기간과 실거주 개월을 분리**해야 한다.

---

## 3. 설계 — 통산 거주기간 필드 신설 + 대상판정/공제율 분리

### 3.1 핵심 아이디어

`resolveExemptionHoldingStartDate`(보유 통산)와 **대칭**으로, 상속개시 전 동일세대 통산 **거주 개월**을 신규 필드 `decedentCohabitationResidenceMonths`로 받고, 통산 거주 개월 resolver를 도입한다.

- **통산 거주** = 대상 판정용 (비과세 거주요건 + 표2 대상). = 실거주 + 상속개시 전 동일세대 통산 거주.
- **실거주(`residencePeriodMonths`, 상속개시일부터)** = 표2 **거주분 공제율** 계산용 (불변).
- **보유(상속개시일부터, `resolveLTHDStartDate`)** = 표2 **보유분 공제율** 계산용 (불변 — 이미 상속개시일 기산).

> 보유는 date backdate(`decedentCohabitationHoldingStartDate`), 거주는 개월 attest(`decedentCohabitationResidenceMonths`)로 **비대칭**. 이유: 비연속 거주·동일세대 거주 개월은 date-derive 불가(§154⑥ 전입·전출 기준). 현행 보유/거주 비대칭 패턴 계승.

### 3.2 신규 엔진 헬퍼 (`transfer-tax-exemption.ts`, `resolveExemptionHoldingStartDate` 옆)

```ts
/**
 * §154⑧3호 — 상속주택 자체 양도 시 (비과세 거주요건·표2 대상 판정용) 통산 거주 개월.
 * 동일세대 상속이면 상속개시일부터 실거주 + 상속개시 전 동일세대 통산 거주. 그 외에는 실거주만.
 * ⚠️ 대상 판정 전용 — 표2 거주분 공제율은 residencePeriodMonths(상속개시일부터 실거주) 별도 사용.
 */
export function resolveExemptionResidenceMonths(input: ResidenceReqInput): number {
  if (
    input.acquisitionCause === "inheritance" &&
    input.decedentSameHouseholdBeforeInheritance === true
  ) {
    return input.residencePeriodMonths + (input.decedentCohabitationResidenceMonths ?? 0);
  }
  return input.residencePeriodMonths;
}
```

- `ResidenceReqInput`(현 `Pick`, `:32-41`)에 `acquisitionCause`·`decedentSameHouseholdBeforeInheritance`·`decedentCohabitationResidenceMonths` 추가.
- **비상속·별도세대는 실거주 그대로 반환 → 회귀 0 보장.**
- **합산 disjoint(이중계상 아님)**: `residencePeriodMonths`=상속개시일 **이후** 상속인 실거주, `decedentCohabitationResidenceMonths`=상속개시 **이전** 동일세대 거주 — 서로 겹치지 않는 기간이라 단순 합산이 정확(§154⑧3호 통산).
- **시그니처**: `calcLongTermHoldingDeduction`은 full `TransferTaxInput`을 넘기지만, `TransferTaxInput`이 `ResidenceReqInput`의 superset이라 구조적 타이핑상 그대로 인자 전달 가능(별도 어댑터 불요). `residencePeriodMonths`는 이미 `ResidenceReqInput:36`에 존재 → 재사용.
- **게이트 공유(선택적 단순화)**: `resolveExemptionHoldingStartDate`(`:166-171`)와 진입 게이트(`acquisitionCause==="inheritance" && decedentSameHouseholdBeforeInheritance===true`)가 동일 — `isSameHouseholdInheritance(input)` boolean 헬퍼로 추출해 두 곳 공유 가능(단일 소스). 단 보유 resolver는 추가로 `decedentCohabitationHoldingStartDate < acquisitionDate` 조건이 있어 boolean 게이트만 공유하고 backdate 조건은 별도 유지.

### 3.3 Bug A 수정 — 비과세 거주요건 통산 (`meetsOneHouseResidenceRequirement:137`)

```ts
- const residenceYears = Math.floor(input.residencePeriodMonths / 12);
+ const residenceYears = Math.floor(resolveExemptionResidenceMonths(input) / 12);
```
- 통산 거주 ≥ 2년이면 `residenceYears >= regulatedAreaMinResidenceYears` 충족 → 조정지역이어도 거주요건 충족 → E-4 통과 → 고가주택 부분과세(E-2). ✔

### 3.4 Bug B 수정 — 표2 대상판정(통산) / 공제율(실거주) 분리 (`calcLongTermHoldingDeduction:505-520`)

```ts
  const isOneHouseSingle = input.isOneHousehold && input.householdHousingCount === 1;
  const residenceYears = Math.floor(input.residencePeriodMonths / 12);                 // 실거주(공제율)
+ const table2ResidenceYears = Math.floor(resolveExemptionResidenceMonths(input) / 12); // 통산(대상판정)
  const rateForYears = (years: number): number => {
    if (years < 3) return 0;
-   if (isOneHouseSingle && residenceYears >= 2) {
+   if (isOneHouseSingle && table2ResidenceYears >= 2) {          // 대상: 통산
      const holdingPart = Math.min(years * 0.04, 0.40);
      const residencePart = Math.min(residenceYears * 0.04, 0.40); // 공제율: 실거주(상속개시일부터) → 0
      return holdingPart + residencePart;
    }
    return Math.min(years * 0.02, 0.30);
  };
```
- 실거주 0·통산 24 → 표2 O, 보유 8×4=32% + 거주 0×4=0% = **32%**. ✔
- **비상속: table2ResidenceYears === residenceYears → 동작 불변(회귀 0).**
- 부수토지 경로(`transfer-tax-helpers.ts:466-478`)도 동일 게이트 → **같이 수정**(일관성).

### 3.5 표시 정합 (display drift 방지 — `feedback_engine_result_display_drift` ★★★)

실제 공제율과 표시 산식·명세서 sub-step이 어긋나면 안 됨. 아래를 §3.4와 **동일 통산 게이트**로 정렬:

- `transfer-tax.ts:551-555` `isOneHouseSpecial` (장특 산식 표시 게이트) — `residenceYearsForStep >= 2` → 통산 게이트.
- `transfer-tax.ts:556-564` `lthdFormulaRate` — 표2 산식(보유 8년×4% + 거주 0년×4% = 32%) 노출. **거주분 0% 정상 표시** 확인.
- `transfer-tax.ts:579-584` 보유분/거주분 sub-step emit(`isOneHouseSpecial && …`) — 거주분 장특 0 정상 emit.
- `transfer-tax.ts:534-537` §98의2 특칙 게이트 `residencePeriodMonths/12 >= 2` — **선택적 정렬(과범위 주의)**: §98의2는 `unsold_98_2`(미분양) 발동 시만 유효 → 동일세대 상속 사례와 동시발동 불가라 실질 dead. 일관성 위해 통산 게이트로 맞추되 **이 사례 정답에 무영향**(범위 밖으로 분류 가능).

> **정렬 input 단일화**: rate calc(`:528`)가 `exemptionJudgeInput`을 넘기므로, 표시 게이트도 **`exemptionJudgeInput`** 로 `resolveExemptionResidenceMonths`를 `transfer-tax.ts`에서 **1회 계산**해 위 3곳(+선택 §98의2) 공유. `effectiveInput`/`exemptionJudgeInput` 혼용 금지(rate↔display drift 방지). `residenceYearsForStep`(현 `effectiveInput.residencePeriodMonths` 기반, `:550`)도 거주분 표시엔 실거주 유지·대상 게이트만 통산으로 분리.

### 3.6 케이스 매트릭스 (분기 전수)

| # | 취득원인 | 동일세대 | 통산거주 | 실거주 | 조정지역 | 비과세(고가) | 표2 | 거주분율 |
|---|---|---|---|---|---|---|---|---|
| 1 (이미지) | 상속 | ON | 24+ | 0 | O | ✔ 부분과세 | ✔ | 0% |
| 2 | 상속 | ON | 24+ | 12 | O | ✔ | ✔ | 4%(실거주1년) |
| 3 | 상속 | ON | <24 | 0 | O | ✘(거주요건) | ✘ 표1 | — |
| 4 | 상속 | ON | 24+ | 0 | X(비조정) | ✔(거주요건 없음) | ✔ | 0% |
| 5 | 상속 | OFF(별도세대) | — | 0 | O | 현행 불변 | 현행 불변 | — |
| 6 | 매매(비상속) | — | =실거주 | 24 | O | 불변 | 불변(표2 8%) | 불변 |
| 7 | 매매(비상속) | — | =실거주 | 0 | O | 불변 | 불변(표1) | 불변 |

- **1·2·4가 신규 GREEN**, **5·6·7이 회귀 불변**(non-inheritance·별도세대 short-circuit).
- 3은 통산 거주도 2년 미만 → 정당한 과세(경계). *경과규정 backdate 엣지는 §7 Open 참조.*

---

## 4. 14개 동기화 지점 — 신규 필드 `decedentCohabitationResidenceMonths`

기존 `decedentCohabitationHoldingStartDate` 배선(실측 전수)을 **1:1 미러링**. (grep 확인 완료)

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| ① 타입(엔진 input) | `lib/tax-engine/types/transfer.types.ts:235` 옆 | `decedentCohabitationResidenceMonths?: number` |
| ① 타입(AssetForm) | `lib/stores/calc-wizard-asset.ts:322` 옆 | `decedentCohabitationResidenceMonths: string` (개월 문자열) |
| ② initial | `lib/stores/calc-wizard-asset-factory.ts` | `""` |
| ③ normalize | `lib/stores/calc-wizard-asset-migrate.ts` | fallback `""` |
| ④ API 변환(단건) | `lib/calc/transfer-tax-api.ts` · `-api-helpers.ts` | `parseInt` → number, 동일세대 토글 OFF 시 미전달 |
| ④ API 변환(다건) | `lib/calc/multi-transfer-tax-api.ts` | 상동 |
| ⑤ UI 위젯 | `components/calc/transfer/CompanionAcqInheritanceBlock.tsx` | 토글 확장영역에 DecimalInput 추가(§5) |
| ⑥ 사이드바 | (해당 없음 — 합계 무관) | — |
| ⑦ 결과 카드 | (실측) `FilingFormTableRowDefs.ts`·`FilingFormTableHelpers.ts`·`FilingFormTableAggregateHelpers.ts`·`DetailedStatementHelpers.ts` (보유 기간분/거주 기간분 장특 행) | **엔진 sub-step 소비자 — 신규 필드 배선 불요.** 표2 거주분 0 정상 표시만 확인(§3.5 sub-step 수정으로 자동 반영) |
| ⑧ validation | `lib/calc/transfer-tax-validate-asset.ts` | 동일세대 토글 ON·주택 시 통산 거주 입력 안내(차단 아님·§6) |
| ⑫ Zod 입력정의 | `transfer-tax-schema.ts:116-117` 옆 · `-schema-sub.ts:512-513` 옆 | `z.number().optional()` (개월) |
| ⑬ body spread | `transfer-tax-api.ts:369` · `-api-helpers.ts:681` · `multi-transfer-tax-api.ts:141` (기존 `decedentCohabitationHoldingStartDate` 매핑 옆) | 상속·토글 ON 게이트 동일 패턴으로 spread |
| ⑭ Route 매핑 | `app/api/calc/transfer/route.ts:149-150` · `multi/route.ts:135-136` (토글 매핑 옆) | 엔진 input 매핑(숫자, Date 변환 불필요) |
| **④′ 거주요건 안내 single-source (dual-truth 방지·High)** | `lib/calc/transfer-tax-api-residence.ts:12-37` `buildResidenceReqInput` | Bug A로 `meetsOneHouseResidenceRequirement`가 신규 3필드 의존 → 이 빌더(Step4 UI 거주요건 안내가 소비)도 `acquisitionCause`·`decedentSameHouseholdBeforeInheritance`·`decedentCohabitationResidenceMonths` populate 필수. **누락 시 UI 안내(통산 미반영)↔엔진 판정 dual-truth** (`feedback_engine_result_display_drift`) |
| 엔진 소비 | `lib/tax-engine/transfer-tax-exemption.ts`·`-helpers.ts`·`transfer-tax.ts` | §3.3~3.5 |
| **드리프트 정정** | `transfer.types.ts:227-231`(주석) · `inherited-self-transfer-154-8-3.anchor.test.ts:9`(주석) | 구 설계 문구 *"거주기간 통산분은 residencePeriodMonths에 포함(사용자 입력)"* → *"거주 통산분은 decedentCohabitationResidenceMonths, residencePeriodMonths는 상속개시일 이후 실거주"* 로 정정 (`feedback_engine_comment_vs_impl_drift`) |
| 테스트 | `__tests__/tax-engine/transfer/…anchor` · `__tests__/calc/inherited-self-cohabitation-toggle.test.tsx` | §8 |

> ⑧ 규칙: 기존 `validate-asset.ts:607-612`는 **토글 ON+주택+보유개시일 공란**을 이미 차단(§154⑧3호 보유 통산 필수 date). 신규 **거주 개월은 비차단(optional·default 0)** — 미입력=통산 0=안전한 과세측(유리 fallback 아님·`feedback_no_silent_apportion_fallback` 충돌 없음, 피상속인 보유만·거주 안 함이 정당한 0 케이스). 신규 차단 신설 금지, UI 안내로만 유도(§5).

---

## 5. UI 변경 — 통산 거주기간 분리 입력 + 힌트 정정

### 5.1 `CompanionAcqInheritanceBlock.tsx` (동일세대 토글 확장영역, `:78-88`)

- 기존 `동일세대 거주·보유 개시일`(DateInput) **아래**에 신규 `동일세대 통산 거주기간 (개월)` DecimalInput 추가 (`decedentCohabitationResidenceMonths`).
  - `FieldCard` label + hint: *"상속개시 전 피상속인과 동일세대로서 이 주택에 실제 거주한 기간(개월). 표2 장특공제·비과세 거주요건 판정에 통산됩니다."*
- **힌트 정정** (`:86-87`): 현행 *"거주기간 통산분은 '거주기간'에 포함해 입력하세요"* → 삭제. 대체: *"상속개시일 이후 상속인 본인 실거주는 '거주기간'에, 상속개시 전 동일세대 거주는 여기에 각각 입력하세요."*

### 5.2 `ResidencePeriodSection.tsx` 힌트 정정 (`:75`, `:171`)

- *"거주기간은 1세대1주택 비과세·표2 장특공제 판정에 사용"* → *"거주기간(상속개시일부터 상속인 실거주)은 표2 **거주분 공제율** 계산에 사용. 동일세대 상속 통산 거주분은 취득 원인 카드의 '동일세대 통산 거주기간'에 별도 입력."*

### 5.3 표준 준수

- `DecimalInput`(개월·정수)·`FieldCard`·`ToggleCard` tone(violet=거주) 유지. select-on-focus 자동. 임의 px 금지.

---

## 6. Pre-Do 앵커 (Do 진입 전 우선 작성 — `feedback_pre_anchor_verification` ★★★)

신규 `__tests__/tax-engine/transfer/inherited-cohabitation-residence-table2.anchor.test.ts`:

이미지 시나리오(§1.1) + `decedentCohabitationResidenceMonths: 24`, `residencePeriodMonths: 0`, `wasRegulatedAtAcquisition: true`:

```ts
expect(r.taxableGain).toBe(69_230_769);        // 12억 초과분 부분과세
expect(r.longTermHoldingRate).toBeCloseTo(0.32, 5); // 표2 보유8×4% + 거주0
expect(r.longTermHoldingDeduction).toBe(22_153_846); // 69,230,769 × 32%
expect(r.calculatedTax).toBe(5_426_538);       // 과표 44,576,923 → floor(×15%)−126만 (엔진 반올림식 역검증 완료)
```

- **가드 회귀**: 케이스 5(별도세대)·6·7(매매) `isExempt`/`longTermHoldingRate` 현행값 그대로 재확인(불변 증명).
- 실행 → **디자인 환류**: 산출세액·장특 실측이 22,153,846과 어긋나면 설계 재검토(추정 금지).

---

## 7. Phase 계획

| Phase | 내용 | verify |
|---|---|---|
| P0 Pre-Do 앵커 | §6 앵커 작성·RED 확인 | 현행 엔진 RED(과세대상 900M) |
| P1 엔진 | `resolveExemptionResidenceMonths` + Bug A(`:137`) + Bug B(`:512`·`:470`) + 표시정합(§3.5) + `ResidenceReqInput` 확장 | 앵커 GREEN · `npx vitest run __tests__/tax-engine/transfer/` |
| P2 신규 필드 14지점 | §4 (타입~Zod~Route) | `npx tsc --noEmit` 0 |
| P3 UI | §5 (토글 확장·힌트 정정) | RTL(`inherited-self-cohabitation-toggle.test.tsx` 확장) |
| P4 회귀·검증 | 양도세 전체 + 통합 + E2E(add→edit 토글·통산 입력) | `npm test` GREEN·회귀 0 |
| P5 브라우저 수동 | 폼→계산→결과 (Network body 신규 필드 확인) | 이미지2 재현 |

---

## 8. 회귀 안전성

- `resolveExemptionResidenceMonths`는 **비상속·별도세대에서 `residencePeriodMonths` 그대로 반환** → 표2/비과세 판정 불변.
- 부수토지·§98의2·표시 게이트 모두 동일 통산식 사용 → 판정 스큐 없음.
- 신규 필드 optional·default 0/`""` → 마이그레이션 안전(신규 세션).
- **기존 세션 stale 주의(Medium)**: PR#699의 구 힌트(*"거주기간 통산분은 '거주기간'에 포함"*)를 따라 통산분을 `residencePeriodMonths`에 이미 넣어둔 sessionStorage 세션은, fix 후 `decedentCohabitationResidenceMonths` default 0 + `residencePeriodMonths`에 통산값 잔존 → 표2 거주분이 stale 통산값으로 과대 계산(40%, 케이스 C/D). **자동 migration 불가**(스칼라에 통산·실거주 구분정보 부재). 실무상 영향 낮음(sessionStorage·구 힌트 노출 1일) — §5 힌트 정정 + 사용자 재입력으로 해소. `calc-wizard-asset-migrate.ts`에 재배치 로직 신설 안 함(구분 불가 데이터를 추정 이전하면 오히려 오염).

## 9. Open (사용자 결정 필요)

1. **경과규정 backdate 엣지 (케이스 3 변형)**: 피상속인이 2017.8.3 전 조정지역 취득 + 동일세대 상속이나 **통산 거주 < 2년**인 경우, 이미지2 논거상 "거주요건 자체가 없음(경과규정)"으로 비과세 가능. 본 계획의 통산-거주 수정만으로는 미해소(거주요건 부과). 
   - **권장**: 이번 범위 **제외**(Simplicity First — 보고된 사례는 통산 거주 2년 이상이라 §3 수정으로 완결). 필요 시 별도 과제로 `meetsOneHouseResidenceRequirement`의 `isPrePolicy` 판정일을 `resolveExemptionHoldingStartDate`로 backdate.
2. **필드형 vs boolean**: 통산 거주를 개월 number(엔진이 2년 검증 가능)로 확정. boolean attest 대안은 검증 약화로 비권장.
3. **겸용주택·재개발 표2 게이트 (범위 제외 — 실측 정정)**: `calcLongTermHoldingDeduction`을 경유하지 않는 별도 표2 게이트가 존재. **assetKind 실측 결과 두 경로의 도달 메커니즘이 다름**:
   - **겸용주택**: 표2 게이트 `transfer-tax-mixed-use-period-split.ts:194`·`transfer-tax-mixed-use-helpers.ts:711`(`useTable2 = isOneHouseExempt && residenceYears >= 2`). **겸용주택은 `assetKind==="housing"` + `isMixedUseHouse` 플래그**(`MixedUseSection.tsx:6`)라 동일세대 토글이 **렌더되어 `decedentCohabitationResidenceMonths`가 설정됨**. 그러나 mixed-use 표2 엔진은 자체 `residenceYears`(실거주)를 써 **통산 미소비** → 겸용 동일세대 상속 표2는 **미해소(deferred)**. (게이트가 신규 필드를 읽지 않아 표2 산정 자체는 기존 동작 불변.)
   - **재개발입주권**: 표2 게이트 `redevelopment-lthd.ts:336`(`isOneHouseSingle && residenceYears >= 2`; **`transfer-tax-redevelopment.ts:82`는 isHighValue 안분 게이트로 표2 게이트 아님 — fork 오기 정정**). **`assetKind==="redevelopment_apt"`**(distinct)라 동일세대 토글 미렌더 → 필드 미도달.
   - **주의(회귀 검증 이연)**: 겸용은 `assetKind==="housing"`이라 **Bug A(비과세 거주요건)는 공유 `checkExemption` 경유 시 반영될 수 있음** → 겸용 동일세대 상속에서 비과세는 개선되나 표2는 미개선(부분). 따라서 "회귀 0"을 단정하지 않고 **Do P4에서 겸용·재개발 동일세대 상속 회귀 케이스로 실측 확인**(표2 게이트 미소비 + 비과세 경로 영향 여부). 법리상 §154⑧3호는 상속 겸용/재개발에도 적용되나 완전 정합은 별도·저빈도 과제로 **이연(침묵 누락 아님·명시)**.
4. **§154① 단서 각호 거주요건 (Do-deviation: 범위 포함으로 정정 — 코드리뷰 High#1)**: 당초 scope-out했으나, Do 코드리뷰가 **동일세대 상속 + 3호(부득이) + 보유<2년** 조합에서 통산 미반영 시 비과세를 **불리-무근거 거부**함을 실증(`buildResidenceReqInput`가 provisoReason+통산필드 동시 조립 → 도달 가능). §154⑧은 "제1항에 따른 거주기간"을 통산하고 단서 각호 거주도 §154① 거주기간이므로 `resolveExemptionProviso`의 residenceYears도 `resolveExemptionResidenceMonths`로 통산(favorable-only — 거주연수↑, 불리 없음). 1호(임대 5년)는 상속주택에 비현실적 입력이라 무해. anchor "단서 3호(부득이)" 추가. **비상속 회귀 0**(전체 11,057 GREEN).

## 10. 검증 근거 (실측 완료 — 추정 아님)

- 이미지4 재현: probe 케이스 A = 과세대상 900,000,000·장특 144,000,000·산출세액 280,530,000 (원 단위 일치).
- 법령: KoreanLaw 소득세법 시행령 mst=286211 §154⑧3호·§154① 원문 조회 확인.
- file:line: 본문 인용 전부 실제 파일 실측(`transfer-tax-exemption.ts`·`-helpers.ts`·`transfer-tax.ts`·UI·14지점 grep).
- 산출세액 정답 5,426,538: probe 케이스 B(표1)의 `floor(과표 55,653,846 × 24%) − 5,760,000 = 7,596,923` 역검증으로 엔진 `floor(과표×rate)−누진공제` 재현 확인 → 과표 44,576,923(15%·누진공제 1,260,000) 적용 시 5,426,538 확정(§1.3). Do 앵커에서 최종 `toBe()` 고정.
- mock 상수 실측: `regulatedAreaMinResidenceYears:2`·`prePolicyDate:"2017-08-03"`·`prePolicyExemptResidence:true`(`mock-rates.ts:122-124`) → Bug A 수정 로직 재추적 완료(상속개시일 2017-09-15 > prePolicyDate라 isPrePolicy=false, 통산거주 24→`2>=2` 분기로 거주요건 충족).

---

## 11. 자가검토 로그 (plan-design-self-review-loop 1사이클)

- STEP 0 policy-check: `feedback_no_silent_apportion_fallback`(통산 default 0 = 안전측 과세·유리 fallback 아님 → 충돌 없음)·`mirror-pattern`(두 필드 독립 입력·useEffect 미러링 없음)·`feedback_engine_result_display_drift`(§3.5 단일 게이트로 해소)·`feedback_engine_comment_vs_impl_drift`(주석 정정 반영) 적용.
- STEP 1 검토(인라인 6카테고리 + fork 1건[개선·UI누락] 백그라운드): 11건 발견(High 3·Medium 4·Low 4). fork 병렬은 환경 제약("Fork not available in worker")으로 오류·누락·모순·정책은 인라인 실측 fallback.
- STEP 2 정정(외부 자동 반영분): #1(§3.5 input 단일화 `exemptionJudgeInput`)·#2(§4 주석·앵커 드리프트 정정 행)·#3·#4(§3.2 시그니처·disjoint)·#5(§4 결과뷰 파일 실측)·#6(게이트 공유)·#7(§98의2 선택적 강등).
- STEP 2 정정(수동 실측 발견 — 자동 로그 누락분): **F1(High·누락)** `transfer-tax-api-residence.ts:12-37` `buildResidenceReqInput`(UI 거주요건 안내 single-source)가 신규 3필드 미전달 시 UI↔엔진 **dual-truth** → §4 `④′` 행 추가. **F2(Medium·누락)** 겸용주택·재개발 표2 게이트(`mixed-use-period-split.ts:194`·`mixed-use-helpers.ts:711`·`redevelopment-lthd.ts:336`) → §9.3 범위 제외. ★메인 스레드 실측 정정: 겸용은 `assetKind==="housing"`이라 필드 도달(fork의 "commercial/mixed assetKind 미도달"은 오기)·redev 표2 게이트는 `redevelopment.ts:82`(isHighValue 안분) 아닌 `redevelopment-lthd.ts:336` — 회귀 0 단정은 Do P4 실측으로 이연. **F3(Medium·정합)** `validate-asset.ts:607-612` 기존 보유개시일 차단 존재 → §4⑧ 정정(거주개월 비차단 명시).
- STEP 3 blast-radius: 신규 필드·`exemptionJudgeInput` 파급 확인 — Bug A/B rate/display 세 경로 + **거주요건 안내 single-source(F1)** 동일 input 소비·drift 0 확정.
- **verdict: needs-fix → (전건 반영 후) clean** — F1(High)이 자동 로그 "clean"에서 누락됐었으나 실측 발견·§4 반영 완료. Critical/High 0 잔존, mustFix 0. ⚠️ 자동 §11 로그는 F1 누락 = `feedback_subagent_completion_report_scrutiny` 사례(자동 verdict 맹신 금지).
- STEP 5·12(별도 `.engine.design.md`·`.ui.design.md` 생성): 본 계획서가 엔진·UI 설계를 통합 서술 — 사용자 지시(계획서 작성)에 따라 단일 문서 유지. Do 착수 확정 시 필요하면 분리 생성.

---

## 12. Do 코드리뷰 결과 (P5 게이트 — transfer-tax-qa 정적 검토)

전체 회귀 11,057 GREEN·tsc 0·eslint 0 error 상태에서 diff 정적 검토. **테스트가 못 잡는 잠재 결함** 집중.

| # | 심각도 | 발견 | 처리 |
|---|---|---|---|
| 1 | High | `resolveExemptionProviso`(단서 각호 거주요건)가 통산 미반영 → 동일세대 상속+3호+보유<2년 조합 불리-무근거 거부 | **수정**: residenceYears를 `resolveExemptionResidenceMonths`로 통산 + 3호 anchor (§9.4 환류). favorable-only·회귀 0 |
| 2 | Medium | Zod `decedentCohabitationResidenceMonths` 정수·음수 미검증(형제 필드 불일치, `parseInt("-5")||0=-5` 통과) | **수정**: `z.number().int().nonnegative().optional()` (schema.ts·schema-sub.ts) |
| 3 | Medium | §98의2 특칙 게이트 통산 확장 anchor 부재 | **유지**(통산 정합·회귀 통과·§98의2×동일세대 상속 저빈도). isOneHouseSpecial과 동일 게이트 유지가 drift 방지에 오히려 안전 |
| 4~7 | Low/Info | helpers 재수출 패턴(정상)·통산↔개시일 교차검증(기존 컨벤션)·§155⑳ 임대거주(별도 근거·범위 밖)·validate 무검증(형제 필드 동일) | 무조치(확인 완료·기존 컨벤션) |

**확인된 무결성**(리뷰 실측): 비상속/별도세대 회귀 0 · 표2 공제율(실거주)↔게이트(통산) 분리 정확(본채·부수토지 2곳) · transfer-tax.ts 표시게이트 rate-calc와 동일 `exemptionJudgeInput`.

**verdict: clean** — High/Medium 전건 수정, 전체 11,057 GREEN 재확인.

# 동거주택 상속공제(§23의2) 시기구분 정밀화 — 엔진 설계

> 계획서: `docs/00-pm/inheritance-cohabit-deduction-gap-plan.md` (Phase 1 = G1)
> 대상: `lib/tax-engine/deductions/inheritance-deductions.ts`
> 작성: 2026-06-07

## Context

현행 동거주택 상속공제 엔진은 공제율을 2020년 전후 2단계(80%/100%)로만 구분하고 **한도를 6억으로 하드코딩**(`inheritance-deductions.ts:94` `COHABIT_MAX`)한다. 교재(PDF p.351 "Min(㉮,㉯)" 표) 및 §23의2① 개정연혁상 정확한 시기구분은 **40%/5억 → 80%/5억 → 100%/6억** 3단계(+2009 이전 제도 부재)이다.

→ **버그**: 2016.1.1.~2019.12.31. 상속분에서 주택가액 × 80%가 5억을 초과하면 한도를 6억으로 잘못 적용해 공제 과대(최대 1억). 일반 경로(`calcCohabitationDeduction`)와 Phase E 직접입력 경로(`cohabitDirectAmount` `:593-614`) **양쪽** 모두 6억 고정.

본 설계는 **신규 입력 필드 없이**(상속개시일 `deathDate`/`baseDate`는 기존 입력) 율·한도 산출 로직만 시기구분으로 교체한다.

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | 2014 상속, 주택 10억 → 40%=4억 (한도 5억 내) | §23의2① (2009~2015 연혁) | PDF p.351 표 | `inheritance/cohabit-rate-cap.test.ts` (CH-RATE-1) | ☐ TODO |
| 2 | 2014 상속, 주택 20억 → 40%=8억 → 한도 5억 | §23의2① 한도 | PDF p.351 표 | (CH-RATE-2) | ☐ TODO |
| 3 | 2018 상속, 주택 5억 → 80%=4억 (한도 5억 내) | §23의2① (2016~2019 연혁) | PDF p.348 ② | (CH-RATE-3) | ☐ TODO |
| 4 | 2018 상속, 주택 8억 → 80%=6.4억 → **한도 5억** ★현행버그(6억) | §23의2① 한도 | PDF p.351 표 | (CH-RATE-4) | ☐ TODO |
| 5 | 2021 상속, 주택 8억 → 100% → 한도 6억 (회귀) | §23의2① (2020~) | 현 D19 | (CH-RATE-5) | ☐ TODO |
| 6 | 2008-12-31 상속, 주택 5억 → 제도 부재 = 0 | 부칙(2009.1.1. 최초적용) | PDF p.347 의의 | (CH-RATE-6) | ☐ TODO |
| 7 | 2016 상속+저당 → 차감 비적용(2017.1.1. 부칙) / 2017 → 차감 | §23의2① + 부칙(법14388 2016.12.20.) | PDF p.350 + KoreanLaw time_travel(20160101↔20170101) 자수611→725 | (CH-RATE-7a·7b·7경계·7경계b) | ✅ DONE |
| 8 | directAmount 모드 2018, 7억 입력 → 한도 5억 → 5억 ★Phase E 경로 버그 | §23의2① 한도 | 계획 §5-1 | (CH-RATE-8) | ☐ TODO |
| R1 | 회귀: D18(5억,미지정→100%/6억)·D19(8억→6억) | — | `inheritance-deductions.test.ts:333,338` | (기존 유지) | ☐ 보존 |
| R2 | 회귀: CI-2(2024)·CI-2b(2019,80%→4.8억)·CI-2c(차감) | — | `spouse-deduction-fix.test.ts:27-41` | (기존 유지) | ☐ 보존 |

> CH-RATE-4·CH-RATE-8은 **Pre-Do에서 현행 6억 반환으로 RED 확보** 후 수정.

---

## 법령 근거

```
상증법 §23의2① (2019.12.31. 개정, 2020.1.1. 시행):
  "… 담보된 피상속인의 채무액을 뺀 가액"의 100분의 100, 한도 6억원.
연혁 (PDF p.351 "동거주택 상속공제한도액: Min(㉮ 율, ㉯ 한도)"):
  2009.1.1.~2015.12.31. : ㉮ 40%, ㉯ 5억
  2016.1.1.~2019.12.31. : ㉮ 80%, ㉯ 5억
  2020.1.1.~            : ㉮ 100%, ㉯ 6억
적용개시 (PDF p.347 의의): 2009.1.1. 이후 최초 상속개시분부터 적용.
담보채무 차감 (PDF p.350): 2017.1.1. 이후 상속개시분부터 (법률 제14388호, 2016.12.20.).
```
- 법령 상수: `INH.COHABIT_DEDUCTION`(`lib/tax-engine/legal-codes/inheritance-gift.ts`) 기존 사용. 신규 상수 불필요.

---

## 엔진 input/result 타입

**변경 없음.** 신규 입력 필드 없음 — `deathDate`(`InheritanceDeductionInput`)/`baseDate`(상속개시일)는 기존 존재.
`CohabitDeductionDetail`(`inheritance-deduction-detail.types.ts:183~`)의 `rate`·`cap` 필드도 기존 존재 — **값만 시기별 동적**. 타입 시그니처 무변경.

---

## 계산 알고리즘 (단계별)

### A. 시기구분 헬퍼 신설
```ts
function cohabitRateAndCap(deathDate?: string): { rate: number; cap: number } {
  const d = deathDate ?? "9999-12-31";          // string(YYYY-MM-DD) 비교 — Date 변환 금지
  if (d >= "2020-01-01") return { rate: 1.0, cap: 600_000_000 };
  if (d >= "2016-01-01") return { rate: 0.8, cap: 500_000_000 };
  if (d >= "2009-01-01") return { rate: 0.4, cap: 500_000_000 };
  return { rate: 0, cap: 0 };                     // 2009.1.1. 이전 제도 부재
}
```
- `cohabitShareRate`(`:89`) 제거, `COHABIT_MAX`(`:94`) 제거.

### B. 일반 경로 `calcCohabitationDeduction` (`:278-338`)
1. `const { rate, cap } = cohabitRateAndCap(deathDate)`.
1b. **담보채무 차감 시기 게이트** (법14388 부칙2, 2017.1.1.~): `applySecuredDebt = deathDate === undefined || deathDate >= "2017-01-01"`; `effectiveSecuredDebt = applySecuredDebt ? securedDebt : 0`. KoreanLaw time_travel(20160101↔20170101)로 2017 시행본 문구 신설 검증. undefined=차감(legacy) — §16⑤ G3 패턴 일관.
2. `base = max(0, cohabitHouseStdPrice − effectiveSecuredDebt)`. detail.securedDebt·breakdown 채무행도 effectiveSecuredDebt 기준.
3. `rawDeduction = applyRate(base, rate)` (= `floor(base × rate)`, 기존 `applyRate` 사용).
4. `cappedDeduction = min(rawDeduction, cap)`.
5. detail: `{ housingValue, securedDebt, base, rate, rawDeduction, cap, cappedDeduction }` — `cap` = 도출값.
6. breakdown 라벨: `` `동거주택공제 (${Math.round(rate*100)}%, 최대 ${cap/100_000_000}억)` ``.
   - `base<=0` early-return 분기(`:289`)도 `rate`/`cap` 동일 도출값 사용.

### C. Phase E directAmount 경로 `calcInheritanceDeductions` (`:593-614`)
1. `const { cap } = cohabitRateAndCap(baseDate)` (rate 미사용 — 사용자가 최종액 입력).
2. `:594` `capped = min(input.cohabitDirectAmount, cap)` (리터럴 `600_000_000` 교체).
3. `:612` `detail.cap = cap` (`COHABIT_MAX` 교체). detail.rate는 directAmount 모드 의미상 `1.0` 유지(사용자가 율 적용한 최종액).
   - 엣지: pre-2009 상속이면 cap=0 → `min(directAmount, 0)=0` (제도 부재로 공제 0). rate 표시는 1.0이나 금액 0 — 비현실 케이스(2009 이전 상속 직접입력)라 허용.
4. 라벨 `` `동거주택공제 (직접 입력, 한도 ${cap/100_000_000}억)` `` (`:599`).

### D. 정수 연산
- `applyRate`(`floor`) 사용. `Math.round` 금지. 라벨의 `cap/100_000_000`은 표시 전용(5/6 정수 — 5억·6억만 발생).

---

## Silent fallback / 자동 안분 후보 식별

- **신규 fallback 없음.** 상속개시일 미입력 시 현행 두 fallback 경로를 그대로 보존(둘 다 결과 100%/6억):
  - **orchestrator 경로**(일반·directAmount): `baseDate = input.deathDate ?? 오늘날짜`(`:524`). 오늘(2026) ≥ 2020 → 100%/6억.
  - **standalone 함수 직접호출**(단위테스트 D18·D19·CI-2 미입력): `calcCohabitationDeduction` 내부 `deathDate ?? "9999-12-31"` → 100%/6억.
  - `cohabitRateAndCap`도 동일 `d ?? "9999-12-31"`를 쓰며, 오늘·9999 모두 ≥ 2020이라 두 경로 결과 동일 → R1·R2 회귀 보존.
- directAmount cap만 시기별 적용 — 자동 안분 아님(사용자 명시 입력값에 법정 한도 적용).
- 미입력 검증은 기존 validation 유지(신규 필드 없음).

## 비고 (scope-out)

- `:524` `new Date().toISOString().slice(0,10)` 직접 사용은 **기존 코드** (CLAUDE.md date-coerce 정책의 사전 예외). 본 변경 범위 밖 — 수정하지 않음.

---

## 테스트 약속

- 케이스 인벤토리 1~8 → `__tests__/tax-engine/inheritance/cohabit-rate-cap.test.ts` 신규. 모든 금액 원단위 `toBe()`.
- R1·R2 회귀 보존(기존 파일 그대로 PASS 확인).
- Pre-Do: CH-RATE-4·CH-RATE-8 먼저 작성 → RED 확보 → 수정 → GREEN.
- 회귀 순서: `npx vitest run __tests__/tax-engine/inheritance/` → `npm test` 전체.

---

## UI 통합 위임

- UI 명세는 `inheritance-cohabit-deduction.ui.design.md` 참조.
- 본 변경은 **신규 input 필드 0** → 14지점 중 폼/initial/normalize/API/validation/Zod/Route 무영향.
- UI 시니어 책임: **결과 카드 한도·공제율 라벨 동적화** — **단일 카드** `CohabitDeductionDetailCard`(`components/calc/results/deduction-breakdown/CohabitDeductionDetailCard.tsx`)가 일반·directAmount **두 경로의 `cohabitDeductionDetail`을 모두 소비**(`DeductionBreakdownSection.tsx:140`)하므로 **한 곳 수정으로 양 경로 커버**. (⑦ 결과 카드만 해당)
- 정정 대상 하드코딩 3곳 (값은 이미 `detail.cap`/`detail.rate` 동적이나 **라벨이 정적** → 5억 케이스에서 "한도 5억인데 라벨 6억" 모순):
  - `:52` `` `공제율 ${rate}% (2020.1.1. 이후: 100%)` `` → 정적 안내문구 제거 또는 시기 무관 라벨로
  - `:56` `"6억 최고한도"` → `` `${detail.cap/100_000_000}억 최고한도` ``
  - `:61` `` `Min(공시가격 × ${rate}%, 6억)` `` → `` `Min(공시가격 × ${rate}%, ${detail.cap/100_000_000}억)` ``

---

# Phase 2~3 설계 — 동거기간 검증·상속인 범위 확대·부수토지 면적한도

> 계획서 §6 Phase 2 스케치 확장. 법령 검증: KoreanLaw MCP 실측 완료(2026-06-07).
> 작성 기준일: 2026-06-07.
> Phase 1(G1 율·한도 시기구분 + 담보채무 2017 부칙) = ✅ 머지 완료 (`086620e`).

---

## 법령 검증 결과 (KoreanLaw MCP 실측 — 추정 인용 없음)

### §23의2① 현행 조문 (MST 276123, 2026-01-02 시행)

```
① 거주자의 사망으로 상속이 개시되는 경우로서 다음 각 호의 요건을 모두 갖춘 경우에는
   상속주택가액(「소득세법」 §89①3호에 따른 주택부수토지의 가액을 포함하되,
   상속개시일 현재 해당 주택 및 주택부수토지에 담보된 피상속인의 채무액을 뺀 가액)의
   100분의 100에 상당하는 금액을 공제. 한도 6억원.
   1호. 피상속인과 상속인(직계비속 및 민법 §1003②에 따라 상속인이 된 그 직계비속의
        배우자인 경우로 한정)이 상속개시일부터 소급하여 10년 이상(상속인이 미성년자인
        기간은 제외한다) 계속하여 하나의 주택에서 동거할 것
   2호. 피상속인과 상속인이 상속개시일부터 소급하여 10년 이상 계속하여 1세대를 구성
        하면서 대통령령으로 정하는 1세대 1주택에 해당할 것 (무주택 기간 포함)
   3호. 상속개시일 현재 무주택자이거나 피상속인과 공동으로 1세대 1주택을 보유한 자로서
        피상속인과 동거한 상속인이 상속받은 주택일 것
② 피상속인과 상속인이 대통령령으로 정하는 사유로 동거하지 못한 경우 계속 동거로 보되,
   그 기간은 동거기간에 산입하지 아니함.
```

**핵심 확인 사항**:
- 1호 括弧 "직계비속 및 민법 §1003②에 따라 상속인이 된 그 직계비속의 배우자" = **2022.1.1. 시행본 기준** (time_travel 20210101↔20220101: §23의2 자수 755→787, +32 변경 확인).
- **2021.12.31. 이전 시행본**: "직계비속인 경우로 한정" (배우자 제외) — 교재 §1-3 연혁표와 일치.
- **미성년자 제외**: "상속인이 미성년자인 기간은 제외한다" 명문. 기산점: 2016.1.1.~ 개정 추가됨 (교재 §1-2 명시).

### 상증령 §20의2 현행 조문 (MST 283637, 2026-02-27 시행)

부득이한 사유(②항):
1. 징집
2. 취학, 근무상 형편 또는 질병 요양 (재정경제부령이 정하는 사유)
3. 제1·2호와 비슷한 사유 (재정경제부령)

**계속 동거로 보되 해당 기간은 동거기간에 산입 안 함** = 교재 §1-5 일치. 국외 대학원은 재정경제부령 미해당(재조세-434 해석례) — 엔진 산입 불가, UI 안내용.

### 소득세법 §89①3호 + 시행령 §154⑦ (MST 285523/286211)

§89①3호: "건물이 정착된 면적에 지역별로 대통령령으로 정하는 배율을 곱하여 산정한 면적 이내의 토지"

시행령 §154⑦ 배율 (현행):
```
1. 도시지역 내 토지:
   가. 수도권 내 주거·상업·공업지역: 3배
   나. 수도권 내 녹지지역: 5배
   다. 수도권 밖: 5배
2. 그 밖의 토지: 10배
```

**G4 설계 결론 (하기 별도 설계)**: 상증법 §23의2①이 소득세법 §89①3호의 "주택부수토지"를 준용한다. 그러나 **개별/공동주택가격은 이미 부수토지를 포함**한다(§61①4호, `inheritance-cohabit-ancillary-land.plan.md` 검토 완결). 따라서 G4의 면적 한도는 **단독주택 대형토지를 별도 EstateItem으로 분리 입력할 때만** 초과분 차감이 필요한 엣지 케이스다.

---

## ★ Phase 2~3 케이스 인벤토리

| # | 갭 | 시나리오 | 입력 | 기대 결과 | anchor ID | 상태 |
|---|---|---------|------|----------|-----------|------|
| G5-1 | G5 | 2022 이후 상속, 상속인=손자녀(child 아님, legatee로 등록) | deathDate=2023-01-01, isCohabitant=true, 손자녀 | showCohabitant=true (직계비속 포함) | G5-LEGATEE-2022 | TODO |
| G5-2 | G5 | 2022 이후 상속, 대습상속 배우자 | deathDate=2023-01-01, isSubstituteInheritance=true, relation=legatee, isCohabitant=true | showCohabitant=true | G5-SUBST-SPOUSE-2022 | TODO |
| G5-3 | G5 | 2021.12.31. 이전 상속, 대습배우자 | deathDate=2021-06-01, isSubstituteInheritance=true, relation=legatee | showCohabitant=false (2022 이전) | G5-PRE2022-EXCL | TODO |
| G5-4 | G5 | 2021.12.31. 이전 상속, 손자녀(직계비속) | deathDate=2021-06-01, relation=child/lineal_descendant | showCohabitant=true (직계비속은 전기간 허용) | G5-DESC-ALL-PERIOD | TODO |
| G3-1 | G3 | 동거연수 정확히 10년 | deathDate=2023-06-01, cohabitStartDate=2013-06-01, birthDate없음 | cohabitYears=10, meetsRequirement=true | G3-EXACT-10Y | TODO |
| G3-2 | G3 | 동거연수 9년 11개월 → 요건 미달 경고 | deathDate=2023-06-01, cohabitStartDate=2013-07-01, birthDate없음 | cohabitYears=9(절사), meetsRequirement=false, warning | G3-SHORT-WARNING | TODO |
| G3-3 | G3 | 미성년 기간 제외 (2016.1.1.~ 개정 적용) | deathDate=2023-01-01, cohabitStartDate=2005-01-01, birthDate=2004-01-01 | 성인 이후 동거 = 2022.1.1.~2023.1.1. = 1년. meetsRequirement=false | G3-MINOR-DEDUCT | TODO |
| G3-4 | G3 | 부득이 사유 차감 | cohabitYears=11, cohabitExcludedYears=2 → 실 동거 9년 | cohabitYears=9, meetsRequirement=false, warning | G3-EXCLUDED | TODO |
| G3-5 | G3 | cohabitStartDate 미입력 — 검증 없이 통과 | cohabitStartDate=undefined | warning 없음 (미입력은 validation 오류 아님, 토글 신뢰) | G3-NO-INPUT | TODO |
| G4-1 | G4 | 아파트(개별/공동주택가격) — 면적한도 불적용 | category=real_estate_apartment, ancillaryLandArea=undefined | 면적한도 차감 없음 (공시가격에 부수토지 포함) | G4-APARTMENT-NOOP | TODO |
| G4-2 | G4 | 단독주택 대형토지 초과 — 수도권 주거지역 3배 | 건물정착면적=100㎡, 지역=수도권주거, 부수토지면적=400㎡ (한도=300㎡) | 초과 100㎡ 비율만큼 주택가액 차감 | G4-DETACHED-EXCEED | TODO |
| G4-3 | G4 | 단독주택 부수토지 한도 이내 | 건물정착면적=100㎡, 부수토지=250㎡, 수도권주거 3배한도=300㎡ | 차감 없음 | G4-DETACHED-OK | TODO |
| G8-1 | G8 | 신고서 echo 필드 확인 | result에 cohabitYears, meetsRequirement, appliedRate, appliedCap 존재 | 신고서 컴포넌트가 읽을 수 있는 echo 포함 | G8-ECHO | TODO |

---

## G5: 대상 상속인 범위 확대

### 현행 (확인 완료)

`components/calc/HeirComposition.tsx:139`
```ts
const showCohabitant = heir.relation === "child";
```
→ `child` 관계만 `isCohabitant` 토글 노출.

`changeHeirRelation` (`:100`):
```ts
if (newRelation !== "child") next.isCohabitant = undefined;
```
→ `child` 외 관계로 변경 시 `isCohabitant` 제거.

`inheritance-deduction-suggest.ts:534`:
```ts
const hasCohabitantChild = heirs.some(
  (h) => h.relation === "child" && h.isCohabitant === true,
);
```
→ `child` && `isCohabitant`만 hasCohabitantChild 판정.

### 법령 근거 (KoreanLaw 실측)

| 상속개시일 | 대상 상속인 |
|-----------|------------|
| 2009~2013 | 직계비속 + 배우자 |
| 2014~2021 | 직계비속만 |
| 2022.1.1.~ | 직계비속 + 민법 §1003② 대습상속된 직계비속의 배우자 |

**"직계비속"**: §23의2①1호 문언. HeirRelation으로는 `child`(자녀) + 손자녀(현재 `legatee`로 등록, `isGenerationSkipBeneficiary=true`). 상증법 문맥에서 손자녀도 직계비속에 해당.

**"민법 §1003② 대습상속된 직계비속의 배우자"**: Heir에서 `isSubstituteInheritance=true`이며 직계비속의 대습상속자인 경우 — 현행 타입에 `isSubstituteInheritance`가 이미 존재. 대습상속 배우자는 relation이 다를 수 있으나 `isSubstituteInheritance`가 판정 기준.

### 설계 결정: 엔진 vs UI 토글 신뢰

**결정: UI 토글 신뢰 + 엔진 적격성 경고(비차단)**

근거:
1. 현재 동거기간·요건 자동판정도 경고 수준(자동 배제 아님, feedback_no_silent_apportion_fallback 부합). 일관성 유지.
2. 대습상속 배우자의 경우 실무에서 세무사가 사실관계를 확인하므로 엔진이 강제 차단하면 합법적 케이스도 막힘.
3. `isSubstituteInheritance` 플래그 이미 존재하여 판정 근거로 활용 가능.

**결론**: UI는 `showCohabitant` 조건을 `deathDate` 기준으로 확장(직계비속·대습배우자 포함). 엔진은 result에 `eligibleRelations` echo를 제공하되 차단하지 않음. validate는 `isCohabitant=true`인 상속인이 `deathDate` 기준 적격 관계인지 **경고**만 추가(오류 불차단).

### showCohabitant 확장 로직

현행 `HeirComposition.tsx:139`:
```ts
const showCohabitant = heir.relation === "child";
```

변경 후:
```ts
// §23의2①1호 상속인 범위 (deathDate 기반)
function isCohabitDeductionEligibleRelation(
  heir: Heir,
  deathDate: string | undefined,
): boolean {
  const d = deathDate ?? "9999-12-31";
  // 직계비속: child + 손자녀(legatee with isGenerationSkipBeneficiary) — 전 기간 허용
  const isLinealDescendant =
    heir.relation === "child" ||
    (heir.relation === "legatee" && heir.isGenerationSkipBeneficiary === true && heir.isSubstituteInheritance !== true);
  // 대습상속 배우자: 2022.1.1.~ (§23의2①1호 개정)
  const isSubstituteSpouse =
    d >= "2022-01-01" &&
    heir.isSubstituteInheritance === true;
  return isLinealDescendant || isSubstituteSpouse;
}

const showCohabitant = isCohabitDeductionEligibleRelation(heir, deathDate);
```

### changeHeirRelation 정합성

현행 `:100` `if (newRelation !== "child") next.isCohabitant = undefined;`

변경 후: `isCohabitDeductionEligibleRelation` 결과가 false인 관계로 변경 시에만 제거. **deathDate가 changeHeirRelation에 없으므로** 관계 변경 시 `isCohabitant`는 **보존**하고, UI 렌더 시 `showCohabitant=false`로 토글이 감춰지는 방식 채택(3-state 유지 패턴 — feedback_three_state_optional_mode_toggle 부합). 단, `corporate`로 변경 시는 기존대로 제거.

### deriveCohabitHouseStdPrice 동기화

`lib/calc/inheritance-deduction-suggest.ts:534`:
```ts
// 기존
const hasCohabitantChild = heirs.some(
  (h) => h.relation === "child" && h.isCohabitant === true,
);
// 변경 후
const hasCohabitantChild = heirs.some(
  (h) => h.isCohabitant === true,  // 관계 필터는 UI showCohabitant가 담당
);
```

이름도 `hasCohabitantEligibleHeir`로 변경하면 명확하지만 하위 호환을 위해 `hasCohabitantChild` 유지도 가능. Do 단계에서 결정.

---

## G3 + G2 + G7: 동거기간 검증

### 신규 입력 필드

`Heir` 타입에 추가할 optional 필드:

```ts
/**
 * §23의2①1호 동거시작일 (ISO date, YYYY-MM-DD).
 * 미입력 시 동거기간 자동 검증 건너뜀 — 사용자 체크박스(isCohabitant) 신뢰.
 * 입력 시 엔진이 동거연수를 계산하고 10년 미달 여부를 result.warnings에 echo.
 */
cohabitStartDate?: string;

/**
 * 부득이한 사유(상증령 §20의2②)로 동거에서 제외할 연수.
 * 계속 동거로 인정되나 동거기간에는 산입 안 함(§23의2②).
 * 미입력 시 0으로 처리. DecimalInput(소수점 허용).
 */
cohabitExcludedYears?: number;
```

### 엔진 동거연수 계산 알고리즘

**동거연수 계산 함수 (순수)**:

```ts
/**
 * §23의2①1호 동거연수 계산 (미성년 기간 자동 제외, 2016.1.1.~ 부칙 적용).
 *
 * @param cohabitStartDate 동거 시작일 (ISO date)
 * @param deathDate        상속개시일 (ISO date)
 * @param birthDate        상속인 생년월일 (ISO date, optional — 미성년 제외용)
 * @param excludedYears    부득이 사유 제외 연수 (§23의2② + 상증령 §20의2)
 * @returns cohabitYears (floor), meetsRequirement (≥10), minorYearsDeducted
 */
function calcCohabitYears(
  cohabitStartDate: string,
  deathDate: string,
  birthDate: string | undefined,
  excludedYears: number,
): {
  rawYears: number;         // floor(deathDate − cohabitStartDate) 연수 (연도차)
  minorYearsDeducted: number; // 미성년 기간 차감 연수
  effectiveYears: number;   // rawYears − minorYearsDeducted − excludedYears
  meetsRequirement: boolean; // effectiveYears >= 10
}
```

**미성년 기간 제외 로직**:
- §23의2①1호 단서 "상속인이 미성년자인 기간은 제외한다" = 2016.1.1. 이후 시행(교재 §1-2 축자).
- **deathDate가 2016.1.1. 이전인 경우**: 미성년 제외 규정 자체가 없음 → `minorYearsDeducted = 0`.
- deathDate가 2016.1.1. 이후인 경우:
  - 민법 §4에 따라 만 19세 미만이 미성년자.
  - 성인 도달일 = `birthDate + 19년`. 동거 시작일과 성인 도달일 중 늦은 날부터 계산.
  - 구체적으로: `adultDate = birthDate + 19년`. `effectiveStart = max(cohabitStartDate, adultDate)`. `rawYears = floor(deathDate - effectiveStart)` 방식으로 단순화 가능.
  - birthDate 미입력 시: `minorYearsDeducted = 0`으로 처리(자동 추정 금지, 정책 부합).

**정수 연산**:
- `differenceInYears(deathDate, effectiveStart)` (date-fns, 생일 기념일 기반 — 이미 프로젝트에서 사용).
- `Math.floor` 사용(소수 연수 → 연 단위 절사). 개월 단위 부족분은 버림.

**10년 요건**:
- `effectiveYears = floor(rawYears) - excludedYears >= 10` → `meetsRequirement = true`.
- 미만: `meetsRequirement = false` → `warnings` 배열에 경고 추가 (**자동 차단 아님**).
- 경고 메시지 예: `"동거연수 ${effectiveYears}년 — §23의2①1호 10년 요건 미달 가능성. 실제 동거기간을 확인하세요."`.

### 엔진 result echo 필드

`CohabitDeductionDetail` 타입에 추가:

```ts
// Phase 2 — 동거기간 검증 echo
cohabitYears?: {
  rawYears: number;
  minorYearsDeducted: number;
  effectiveYears: number;
  meetsRequirement: boolean;
};
```

`InheritanceTaxResult.warnings[]`에 동거기간 경고 포함.

### G6 주택판정 — 엔진 영향 없음

겸용주택(§154③ 주택면적 > 주택외면적 → 전체 주택)·상시주거 오피스텔·입주권 판정은 **사용자가 standardPrice 입력 시 이미 반영된 값**을 쓰는 구조. 엔진 분기 추가 불필요. UI 토글 hint에 1~2줄 안내로 대응:
- 동거주택 토글 description에: "겸용주택은 주택면적이 주택외면적보다 넓으면 전체를 주택으로 봅니다(재산-89). 상시거주 오피스텔도 적용 가능(법규재산 2013-411)."

---

## G4: 주택부수토지 면적한도

### 전제 재확인

`inheritance-cohabit-ancillary-land.plan.md` 결론: **개별/공동주택가격(apartment·building 표준시가)은 주택+부수토지 일체가격**. 별도 합산 불필요. 이중계상 금지.

### G4가 실질적으로 영향을 주는 케이스

- **단독주택(real_estate_building)에서 EstateItem을 건물과 토지로 분리 입력**하거나,
- 부수토지 면적이 배율 초과인 경우 **초과분 토지가액을 별도 EstateItem으로 입력**한 경우.

이 경우 `cohabitHouseStdPrice`에 초과토지가 포함되면 과대 공제 발생.

### numeric 영향 심각도 평가

대부분의 주택(아파트·빌라)은 개별/공동주택가격 사용 → G4 영향 없음. **단독주택 대형토지 케이스만 해당**이며, 현재 UI에서 동거주택 체크는 `real_estate_apartment`·`real_estate_building`에만 노출됨(`EstateBodyRealEstate.tsx:220`). 초과 토지를 별도 입력하는 사용자는 소수. → **심각도: Low**.

단, 구현 여부는 사용자 결정 사항. 아래 설계는 "구현한다면" 기준.

### 설계 (G4 구현 시)

**신규 입력 필드** (`Heir` 또는 `InheritanceDeductionInput`에 추가):

```ts
// EstateItem 수준 또는 InheritanceDeductionInput 수준에 추가
ancillaryLandArea?: number;        // 부수토지 실제 면적 (㎡) — DecimalInput
buildingFootprintArea?: number;    // 건물 정착 면적 (㎡) — DecimalInput
ancillaryLandRegion?:              // 지역 구분 — RadioCardGroup
  | "metro_residential_commercial_industrial"  // 수도권 주거·상업·공업 → 3배
  | "metro_green"                              // 수도권 녹지 → 5배
  | "non_metro"                                // 수도권 밖 → 5배
  | "other";                                   // 그 밖 → 10배
```

**면적한도 계산**:
```ts
function calcAncillaryLandLimit(
  buildingFootprintArea: number,
  region: AncillaryLandRegion,
): number {
  const ratio = { metro_residential_commercial_industrial: 3, metro_green: 5, non_metro: 5, other: 10 }[region];
  return buildingFootprintArea * ratio; // ㎡ 단위
}
```

**가액 차감**:
- `excessArea = max(0, ancillaryLandArea - limitArea)`.
- `excessRatio = excessArea / ancillaryLandArea`.
- `adjustedHousePrice = cohabitHouseStdPrice × (1 - excessRatio)` (applyRate 사용, floor).
- `calcCohabitationDeduction`에 `adjustedHousePrice`를 전달.

**단, `ancillaryLandArea` 미입력 시 차감 없음** — 자동 안분 fallback 금지 정책 부합. UI에서 "대형 단독주택의 부수토지가 배율 초과인 경우 아래 면적을 입력하세요" 안내.

### G4 Phase 3 스코프 결정

Phase 1(G1) 완료 후 **G4를 Phase 3로 분리 구현**:
- Phase 2: G5 + G3 (동거기간·상속인 범위) — 신규 필드 `cohabitStartDate`·`cohabitExcludedYears` + `showCohabitant` 확장.
- Phase 3: G4(면적한도) + G8(신고서) — 신규 필드 `ancillaryLandArea`·`buildingFootprintArea`·`ancillaryLandRegion`.

---

## G8: 동거주택 상속공제신고서 (Phase 3)

신고서 echo용 `CohabitDeductionDetail` 필드 — UI 시니어 주담당. 엔진이 제공할 값:

| 신고서 항목 | echo 필드 | 비고 |
|-----------|---------|------|
| 동거연수 | `cohabitYears.effectiveYears` | G3 계산값 |
| 동거기간 제외 연수 | `cohabitYears.minorYearsDeducted + excludedYears` | |
| 공제율 | `rate` (기존 field) | cohabitRateAndCap(deathDate).rate |
| 한도액 | `cap` (기존 field) | cohabitRateAndCap(deathDate).cap |
| 담보채무 차감액 | `securedDebt` (기존 field) | effectiveSecuredDebt |
| 면적한도 적용 여부 | `ancillaryLandAdjustApplied?` | G4 구현 시 |
| 면적 초과분 차감 비율 | `ancillaryLandExcessRatio?` | G4 구현 시 |

---

## 14개 동기화 지점 — Phase 2 신규 필드 목록

### 엔진 input 신규 필드 (`Heir` 타입)

| 필드 | 타입 | 추가 위치 | 설명 |
|------|------|----------|------|
| `cohabitStartDate` | `string?` | `Heir` | 동거시작일 (ISO date) |
| `cohabitExcludedYears` | `number?` | `Heir` | 부득이 사유 제외 연수 |

### 엔진 result 신규 필드 (`CohabitDeductionDetail`)

| 필드 | 타입 | 설명 |
|------|------|------|
| `cohabitYears` | `{ rawYears, minorYearsDeducted, effectiveYears, meetsRequirement }?` | G3 계산값 |

### UI 시니어 선처리 대상 (14지점)

| 지점 | 위치 | 변경 내용 |
|------|------|---------|
| ① 폼 상태 | `lib/stores/calc-wizard-store.ts` 또는 `shared.ts` | `Heir` 타입에 `cohabitStartDate`·`cohabitExcludedYears` 추가. initial=undefined |
| ② initial value | 동상 | `cohabitStartDate: undefined, cohabitExcludedYears: undefined` |
| ③ normalize | 동상 | sessionStorage 역직렬화 호환 |
| ④ API 변환 | `lib/calc/inheritance-api.ts` | `Heir` spread → 자동 포함 (spread 패턴 유지 시) |
| ⑤ UI 위젯 | `HeirComposition.tsx` | `showCohabitant` 확장 + `cohabitStartDate` DateInput + `cohabitExcludedYears` DecimalInput |
| ⑥ 사이드바 | 해당 없음 (동거연수는 사이드바 합계에 미표시) | — |
| ⑦ 결과 카드 | `CohabitDeductionDetailCard` | `cohabitYears` echo 표시 + 경고 표시 |
| ⑧ validation | `lib/calc/inheritance-validate.ts` | `isCohabitant=true` 상속인에 대한 관계 적격성 경고 (non-blocking) |
| ⑨ Zod enum 메인 | route handler Zod | `Heir` 스키마에 `cohabitStartDate`·`cohabitExcludedYears` optional 추가 |
| ⑩ Zod enum 컴패니언 | — | — |
| ⑪ acqDate fallback | — | — |
| ⑫ Zod 입력 객체 | route handler `heirSchema` | optional 필드 추가 |
| ⑬ body spread | `callInheritanceTaxAPI` | Heir spread → 자동 포함 |
| ⑭ Route 매핑 | route handler input 매핑 | string 직렬화 무손실 (date-coerce 불필요 — ISO string 그대로) |

**핵심**: `Heir`는 객체 spread 패턴(`{ ...heir }`)으로 전달되므로 ④⑬은 자동 포함 가능. ⑫⑨는 Zod `heirSchema`에 optional 필드 명시 필요.

---

## Pre-Do anchor 설계 (RED 확보 가능 입력/기대값 명시)

### A. G5 연혁 분기 anchor

테스트 파일: `__tests__/tax-engine/inheritance/cohabit-eligible-relation.test.ts`

```
[G5-PRE2022] deathDate=2021-06-01, relation="legatee", isGenerationSkipBeneficiary=true, isSubstituteInheritance=true
  → isCohabitDeductionEligibleRelation() = false
  현행(showCohabitant = relation==="child"): legatee → false ← RED 아님 (이미 false이므로 anchor가 바로 GREEN일 수 있음)
  → 실질 RED 케이스: deathDate=2021-06-01, relation=legatee, isSubstituteInheritance=false → 직계비속 자녀 건너뜀 isGenerationSkipBeneficiary=true
    현행: false (child 아님). 변경 후: true (직계비속 손자녀 2014~2021 허용)
    ★ 이 케이스가 Pre-Do RED 확보 anchor.

[G5-SUBST-2022] deathDate=2022-06-01, relation="legatee", isSubstituteInheritance=true
  현행: false (child 아님). 변경 후: true
  ★ 이 케이스도 Pre-Do RED 확보.
```

### B. G3 동거연수 계산 anchor

테스트 파일: `__tests__/tax-engine/inheritance/cohabit-years.test.ts`

```
[G3-BASIC] cohabitStartDate=2010-01-01, deathDate=2023-01-01, birthDate=undefined, excludedYears=0
  → rawYears=13, minorYearsDeducted=0, effectiveYears=13, meetsRequirement=true
  현행: 함수 자체 없음 → RED (함수 미구현)

[G3-MINOR] cohabitStartDate=2005-01-01, deathDate=2023-01-01, birthDate=2004-01-01, excludedYears=0
  → adultDate=2023-01-01 (만 19세)
  → effectiveStart=max(2005-01-01, 2023-01-01)=2023-01-01
  → rawYears=differenceInYears(2023-01-01, 2023-01-01)=0
  → effectiveYears=0, meetsRequirement=false, warning
  현행: 함수 없음 → RED

[G3-SHORT] cohabitStartDate=2014-07-01, deathDate=2023-06-01, excludedYears=0
  → rawYears=8 (8년 11개월 → floor=8). meetsRequirement=false
  현행: 함수 없음 → RED
```

### C. G4 면적한도 차감 anchor

테스트 파일: `__tests__/tax-engine/inheritance/cohabit-ancillary-land.test.ts`

```
[G4-EXCEED] buildingFootprintArea=100, region="metro_residential_commercial_industrial"(3배)
  → limitArea=300㎡
  ancillaryLandArea=400㎡, cohabitHouseStdPrice=500_000_000
  → excessArea=100, excessRatio=100/400=0.25
  → adjustedHousePrice=floor(500_000_000 × 0.75)=375_000_000
  → calcCohabitationDeduction(375_000_000, 0, "2023-01-01")
  → deduction=min(375_000_000, 600_000_000)=375_000_000
  현행: 조정 없이 500_000_000 사용 → RED (adjustedHousePrice 미구현)

[G4-NOOP] ancillaryLandArea=undefined → 차감 없음 = 기존 동작 → GREEN (회귀 보존)
```

---

## Silent fallback / 자동 안분 후보 식별

- `cohabitStartDate` 미입력: 동거기간 검증 건너뜀 → 자동 fallback 없음 (정책 부합).
- `cohabitExcludedYears` 미입력: `0`으로 처리 — 제외 연수 없음이 기본값, 안전 방향.
- `ancillaryLandArea` 미입력: 면적한도 차감 없음 — 자동 안분 fallback 없음.
- **birthDate 미입력 시 미성년 제외 0처리**: 미성년 기간을 0으로 보면 동거연수가 **과대계상**되는 방향 → 납세자에게 유리할 수 있으나, **법령 정확성 원칙상 경고 표시**. 자동 추정(birthDate로부터 추정되는 미성년 기간 자동 차감)은 이미 `birthDate` 있으면 수행하므로 정책 위반 아님.

---

## 엔진 설계 결정 요약

| 항목 | 결정 | 근거 |
|------|------|------|
| G5 적격성 판정 방식 | **UI 토글 신뢰 + showCohabitant 확장 + 경고(비차단)** | 엔진이 강제 차단 시 합법적 케이스 막힘. 경고로 충분 |
| G3 동거기간 입력 방식 | **`cohabitStartDate` DateInput (동거시작일 직접 입력)** | 사용자 확정 |
| G3 미성년 제외 | **birthDate 있으면 자동, 없으면 0(경고)** | 자동 추정 금지·정책 부합 |
| G3 부득이 사유 | **`cohabitExcludedYears` DecimalInput (직접 차감)** | 사유 판단은 세무사 영역, 엔진은 입력값 그대로 반영 |
| G3 10년 미달 시 | **경고(비차단)** | feedback_no_silent_apportion_fallback |
| G4 면적한도 numeric 영향 | **Low — 아파트 해당 없음, 단독주택 대형토지 엣지** | inheritance-cohabit-ancillary-land.plan.md |
| G4 구현 여부 | **Phase 3로 분리. 미입력 시 차감 없음** | Low 심각도, 입력 복잡도 대비 영향 제한적 |
| G8 신고서 | **엔진이 echo 필드 제공, 렌더는 UI 시니어** | UI 시니어 주담당 명세 준수 |

---

---

## 「데이터 계약 v1 (확정)」— 2026-06-07 충돌 5건 단일 계약

> C1~C5 5개 충돌 항목을 KoreanLaw MCP + 코드 grep 실측으로 검증하여 확정.
> UI 시니어는 이 표를 그대로 따른다. 불일치 발견 시 Do 진입 전 재협의 필수.

### 충돌 결론 요약

| 충돌 | 결정 | 핵심 근거 |
|------|------|----------|
| C1 G5 손자녀 표현 | `HeirRelation`에 `"lineal_descendant"` **추가 금지**. 기존 `legatee + isGenerationSkipBeneficiary=true + isSubstituteInheritance≠true` 재사용 | `HEIR_RELATIONS` 배열이 §3의2② 주주 필터에 직접 사용되어 파급 高. `CohabitantDependent`의 동명 값과 혼선 |
| C2 대습 배우자 표현 | `relation="other" + isSubstituteInheritance=true` 조합. 신규 플래그 불필요 | `"spouse"` 사용 시 배우자공제(§19) 오적용. `isSubstituteInheritance` JSDoc에 "§1003② 배우자 포함" 명시로 충분 |
| C3 echo 필드명 | `cohabitYears` (중첩 객체). UI의 `actualYears` 단일값 **채택 안 함** | 엔진 설계 문서 선행 확정값(`rawYears·minorYearsDeducted·effectiveYears·meetsRequirement`) |
| C4 G4 필드 배치·명명 | `InheritanceDeductionInput` 배치. 엔진 4종 enum 확정. UI 가정 3종 필드명 교체 필요 | 부수토지는 상속인(Heir) 속성 아님. 엔진 진입 경로(`deriveCohabitHouseStdPrice → deductionInput`)와 일치 |
| C5 EN-1~6 | 상기 표 참조 | — |

### Phase 2 신규 input 필드 (`Heir` 타입)

| 필드 | 타입 | default | 설명 | 14지점 |
|------|------|---------|------|--------|
| `cohabitStartDate` | `string?` | `undefined` | §23의2①1호 동거시작일 (YYYY-MM-DD). 입력 시 동거연수 계산·echo. 미입력=검증 생략(사용자 체크박스 신뢰) | ①②③④⑤⑦⑧⑨⑫⑬⑭ |
| `cohabitExcludedYears` | `number?` | `undefined` (= 0) | §23의2② 부득이 사유 제외 연수. 미입력=0 처리. DecimalInput | ①②③④⑤⑦⑧⑨⑫⑬⑭ |

### Phase 2 신규 result 필드 (`CohabitDeductionDetail`)

| 필드 | 타입 | 설명 |
|------|------|------|
| `cohabitYears` | `{ rawYears: number; minorYearsDeducted: number; effectiveYears: number; meetsRequirement: boolean }?` | G3 동거연수 계산 echo. `cohabitStartDate` 미입력 시 `undefined` |

### Phase 3 신규 input 필드 (`InheritanceDeductionInput`)

| 필드 | 타입 | default | 설명 | 14지점 |
|------|------|---------|------|--------|
| `ancillaryLandArea` | `number?` | `undefined` | G4 부수토지 실제 면적 (㎡). 미입력=차감 없음 | ①④⑤⑦⑧⑨⑫⑭ |
| `buildingFootprintArea` | `number?` | `undefined` | G4 건물 정착 면적 (㎡) | ①④⑤⑦⑧⑨⑫⑭ |
| `ancillaryLandRegion` | `AncillaryLandRegion?` | `undefined` | G4 지역구분 4종 enum. 미입력=차감 없음 | ①④⑤⑦⑧⑨⑫⑭ |

```ts
// 신규 type alias — lib/tax-engine/types/inheritance-gift.types.ts 또는 deduction-detail.types.ts
export type AncillaryLandRegion =
  | "metro_residential_commercial_industrial"  // 수도권 주거·상업·공업 → 3배 (소득세시령 §154⑦1호가)
  | "metro_green"                              // 수도권 녹지 → 5배 (§154⑦1호나)
  | "non_metro"                                // 수도권 밖 도시지역 → 5배 (§154⑦1호다)
  | "other";                                   // 그 밖의 토지 → 10배 (§154⑦2호)
```

### Phase 3 신규 result 필드 (`CohabitDeductionDetail`)

| 필드 | 타입 | 설명 |
|------|------|------|
| `ancillaryLandLimitReduction` | `number?` | G4 면적한도 초과 차감액. G4 미적용 시 `undefined` |

### G5 `showCohabitant` 헬퍼 함수 (UI 전용 — HeirRelation 타입 변경 없음)

```ts
// HeirComposition.tsx 내 신규 헬퍼 (또는 별도 파일)
function isCohabitDeductionEligibleRelation(
  heir: Heir,
  deathDate: string | undefined,
): boolean {
  const d = deathDate ?? "9999-12-31";

  // 직계비속: child(자녀) + legatee 세대생략 손자녀 (대습 제외) — 전 기간
  const isLinealDescendant =
    heir.relation === "child" ||
    (heir.relation === "legatee" &&
      heir.isGenerationSkipBeneficiary === true &&
      heir.isSubstituteInheritance !== true);

  // 대습상속 직계비속의 배우자 (§1003② 개정, 2022.1.1.~)
  // → relation="other" + isSubstituteInheritance=true
  const isSubstituteDescendantSpouse =
    d >= "2022-01-01" &&
    heir.relation === "other" &&
    heir.isSubstituteInheritance === true;

  return isLinealDescendant || isSubstituteDescendantSpouse;
}
```

### `changeHeirRelation` 수정 계약 (HeirComposition.tsx)

```ts
// 기존 :100
if (newRelation !== "child") next.isCohabitant = undefined;
if (newRelation !== "legatee") {
  next.isGenerationSkipBeneficiary = undefined;
  next.isMinorOverride = undefined;
  next.isSubstituteInheritance = undefined;
}

// 변경 후
// ① isCohabitant: corporate 분기(:88)에서 이미 제거. 자연인 분기(:100) 제거
//    → showCohabitant 조건이 false면 UI에서 토글 숨김(3-state 유지)
// ② isSubstituteInheritance: "other" 관계도 대습 배우자용으로 보존
if (newRelation !== "legatee" && newRelation !== "other") {
  next.isGenerationSkipBeneficiary = undefined;
  next.isMinorOverride = undefined;
  next.isSubstituteInheritance = undefined;
}
// ③ showBirthDate에 "other" 추가 (대습 배우자 생년월일 보존)
const showBirthDate =
  newRelation === "child" ||
  newRelation === "lineal_ascendant" ||
  newRelation === "sibling" ||
  newRelation === "legatee" ||
  newRelation === "other";  // 대습 배우자
```

### `deriveCohabitHouseStdPrice` 수정 계약 (`lib/calc/inheritance-deduction-suggest.ts`)

```ts
// 기존 :534
const hasCohabitantChild = heirs.some(
  (h) => h.relation === "child" && h.isCohabitant === true,
);
// 변경 후 — 관계 필터는 isCohabitDeductionEligibleRelation 또는 단순화
const hasCohabitantEligibleHeir = heirs.some(
  (h) => h.isCohabitant === true,  // UI showCohabitant가 적격성 담당
);
// 기존 변수명 hasCohabitantChild는 isApplicable 조건에만 사용되므로 교체 가능
// 단, 하위 호환 우선이면 변수명 유지 + 판정 로직만 변경
```

---

## Definition of Done — Phase 2

- [ ] `Heir` 타입에 `cohabitStartDate?`·`cohabitExcludedYears?` 추가 + JSDoc
- [ ] `CohabitDeductionDetail` 타입에 `cohabitYears?` echo 필드 추가
- [ ] `isCohabitDeductionEligibleRelation(heir, deathDate)` 헬퍼 구현 + anchor G5-PRE2022·G5-SUBST-2022 GREEN
- [ ] `calcCohabitYears(cohabitStartDate, deathDate, birthDate, excludedYears)` 구현 + anchor G3-BASIC·G3-MINOR·G3-SHORT GREEN
- [ ] `deriveCohabitHouseStdPrice`의 `hasCohabitantChild` 조건 확장
- [ ] `changeHeirRelation` 정합성 수정 (corporate 외에는 isCohabitant 보존)
- [ ] `showCohabitant` UI 조건 확장 (`HeirComposition.tsx`)
- [ ] `cohabitStartDate` DateInput + `cohabitExcludedYears` DecimalInput UI 위젯
- [ ] 결과 카드 `cohabitYears` echo 표시 + 경고 배지
- [ ] 14지점 ①②③④⑤⑦⑧⑨⑫⑬⑭ 동기화 (⑥ 해당 없음)
- [ ] `npx tsc --noEmit` 0건 / `npm test` 전체 통과

## Definition of Done — Phase 3

- [ ] G4: `ancillaryLandArea`·`buildingFootprintArea`·`ancillaryLandRegion` 입력 필드 + 엔진 면적한도 차감 로직 + anchor G4-EXCEED·G4-NOOP GREEN
- [ ] G8: 신고서 컴포넌트 (UI 시니어 주담당) + 엔진 echo 필드 전부 포함
- [ ] 14지점 전수 동기화
- [ ] `npm test` 전체 통과

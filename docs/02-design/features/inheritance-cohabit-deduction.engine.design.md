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

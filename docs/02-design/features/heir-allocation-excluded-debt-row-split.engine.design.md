# 상속인별 집계표 — 과세제외·채무 행 분리 · 엔진 설계

- 계획서: `docs/01-plan/heir-allocation-excluded-debt-row-split.plan.md`
- 작성일: 2026-06-09
- 단일 소스: `lib/calc/heir-allocation-summary.ts` `buildSummaryTable()` → 화면·PDF 공통 소비

## Context

집계표의 합산 2행(㉠ 과세제외=비과세+불산입 / ㉡ 채무·공과·장례비)을 세목별 개별 행(2+3=5행)으로 분리. **세액 산식 영향 0** — perHeir에 optional echo 필드만 추가하고, 기존 합 필드(`excludedFromTaxation`·`debtShare`)는 보존. `taxableValueShare`(`inheritance-allocation.ts:573`) 불변.

## ★ 케이스 인벤토리 (Do 진입 전 필수)

| ID | 입력 시나리오 | 기대 결과 (분리 행) | anchor |
|---|---|---|---|
| C-1 | 비과세(족보 §12) 1천만 + 불산입(공익법인 §16) 1억 | nonTaxableShare 합=1천만, notIncludedShare 합=1억, `excludedFromTaxation` 합=1.1억 불변 | exemption-treatment-echo 확장 |
| C-2 | 채무 금융 2억 + 사적 1억 + 공과금 5천만 + 장례비(식대 1,200만·봉안 600만) | debtPrincipalShare 합=3억, publicChargeShare 합=5천만, funeralShare 합=1,500만(capped), `debtShare` 합=3.65억 | result-table-reconciliation 확장 |
| C-3 | 비과세·불산입·채무 전부 + 협의분할 2인 | heir별 Σ(nonTaxable+notIncluded)=excludedFromTaxation, heir별 Σ(3채무)=debtShare | exemption-heir-allocation 확장 |
| C-4 | 영리법인 포함 (corp는 사전증여만) | corp의 신규 5필드 undefined → 표 corp 셀 빈칸 (기존 excludedFromTaxation과 동일) | nonprofit-heir-allocation 회귀 |
| C-5 | 비과세 미입력 (`exemptionDetail` undefined) | nonTaxableShare/notIncludedShare 전 heir 0 또는 undefined, ④ 과세가액 불변 | summary-table AN-1 회귀 |
| C-6 | 장례비 한도초과 (식대 1,500만 → capped 1,000만) | funeralShare 합=1,000만(capped), 채무·공과금 행 무영향 | C-2 변형 |

## 법령 근거

- 비과세: 상증법 §11(전사자)·§12(금양임야·묘토·족보·정당유증 등) — `taxTreatment: "non_taxable"`
- 과세가액 불산입: 상증법 §16(공익법인 출연재산)·§17(공익신탁) — `taxTreatment: "not_included"`
- 채무·공과금·장례비: 상증법 §14① 1호(공과금)·2호(장례비, 시행령 §9② 식대 1천만·봉안 5백만 한도)·3호(채무)
- 헬퍼 단일 진실: `exemption-rules.ts:402 getExemptionTreatment(rule)` / `:383 findExemptionRuleById(id)`

## 엔진 input/result 타입 (변경 사항)

### 1. `HeirTaxBreakdown` 확장 — `types/inheritance-allocation-result.types.ts` (Phase B2 echo 블록)

```ts
// 과세제외 분리 echo (㉠ → 2행). excludedFromTaxation(합)은 보존.
/** 비과세(§11·§12) 상속인별 차감 — non_taxable treatment 안분 */
nonTaxableShare?: number;
/** 과세가액 불산입(§16·§17) 상속인별 차감 — not_included treatment 안분 */
notIncludedShare?: number;
// 채무 분리 echo (㉡ → 3행). debtShare(합)은 보존.
/** 채무 §14①3호 (financial+personal category) 상속인별 분담 */
debtPrincipalShare?: number;
/** 공과금 §14①1호 (tax category) 상속인별 분담 */
publicChargeShare?: number;
/** 장례비 §14①2호 (funeral category, 한도 적용 후) 상속인별 분담 */
funeralShare?: number;
```

> 불변식(주석 명시): `(nonTaxableShare ?? 0)+(notIncludedShare ?? 0) === excludedFromTaxation`,
> `(debtPrincipalShare ?? 0)+(publicChargeShare ?? 0)+(funeralShare ?? 0) === debtShare`.

### 2. summaryTable — **변경 없음** (계획 §7-#3: 채무 total은 summary.ts 직접 Σ, 비과세/불산입 total은 `exemptionDetail`)

## 계산 알고리즘 (Phase A 의사코드)

### A-1. `computeExemptByHeir` → 2맵 분기 (`inheritance-allocation.ts:222`)

```ts
function computeExemptByHeir(items, recognizedByRuleId, legalShares):
    { nonTaxableByHeir: Map, notIncludedByHeir: Map } {
  const nonTaxableByHeir = new Map(); const notIncludedByHeir = new Map();
  for (const ex of items) {
    const recognized = recognizedByRuleId.get(ex.ruleId) ?? 0;
    if (recognized <= 0) continue;
    const raw = ex.heirAllocations?.length
      ? new Map(ex.heirAllocations.map(a => [a.heirId, a.amount]))
      : distributeByLegalShares(ex.claimedAmount, legalShares);
    const scaled = scaleMapToTotal(raw, recognized);
    // ★ treatment 판정 — 단일 헬퍼 재사용 (ruleId만으론 모름)
    const rule = findExemptionRuleById(ex.ruleId);
    const target = (rule && getExemptionTreatment(rule) === "not_included")
      ? notIncludedByHeir : nonTaxableByHeir;
    for (const [hid, v] of scaled) target.set(hid, (target.get(hid) ?? 0) + v);
  }
  return { nonTaxableByHeir, notIncludedByHeir };
}
```

호출부(`:393`): `const { nonTaxableByHeir, notIncludedByHeir } = computeExemptByHeir(...)`.
합 맵 재구성: `exemptShare = (nonTaxableByHeir.get(id) ?? 0) + (notIncludedByHeir.get(id) ?? 0)`
→ `taxableValueShare` 산식(`:575`) **불변**. perHeir에 `nonTaxableShare`/`notIncludedShare` echo.

### A-2. `computeDebtByHeirWithFuneralCap` → 3맵 반환 (`inheritance-allocation.ts:249`, 호출부 `:444` 단일)

```ts
// 기존 merged 1맵 → { debtPrincipalByHeir, publicChargeByHeir, funeralByHeir }
//  - debtPrincipalByHeir = resolveAllocationsByHeir(category∈{financial,personal})
//  - publicChargeByHeir  = resolveAllocationsByHeir(category==="tax")
//  - funeralByHeir       = scaleMapToTotal(meal,cappedMeal) + scaleMapToTotal(bongan,cappedBongan)
// debtByHeir(합) = 세 맵 heir별 합산 → debtShare(:570) 불변.
```

각 맵 내부 `scaleMapToTotal` 잔액흡수로 heir별 Σ3분할 == debtShare 보존(메모리 `feedback_floor_residual_absorption`).
perHeir에 `debtPrincipalShare`/`publicChargeShare`/`funeralShare` echo (heir 분기만, corp `:540` 생략).

## Silent fallback / 자동 안분 식별

- **없음** — 분리는 기존 안분 결과(scaleMapToTotal)를 treatment/category로 **분류만** 함. 새 안분·fallback 미도입.
- 협의분할 미입력 시 `distributeByLegalShares`(기존)로 raw 분배 → 신규 분리에도 동일 적용(추가 fallback 0).

## 테스트 약속 (Pre-Do anchor — 기존 확장)

- C-1·C-3·C-5 → `exemption-treatment-echo.test.ts`·`exemption-heir-allocation.test.ts` 확장
- C-2·C-6 → `result-table-reconciliation.test.ts` 확장 (debtShare 3분할 정합·장례비 capped)
- C-4 → `nonprofit-heir-allocation.test.ts` corp 빈칸 회귀
- 회귀: `heir-allocation-summary-table.test.ts:52` AN-1(④ 8,775M) 통과 유지 = 세액영향 0 증명

## 800줄 정책 (STEP 6·8 정정 — 조건부 추출)

- `inheritance-allocation.ts` 현재 **770줄**(실측). 신규 분기 보수 재추정: 2맵(+~5)·3맵(+~6)·합재구성(+~5)·perHeir echo(+~5) ≈ **+20줄 → ~790**. **1차는 in-place**(800 이내 목표).
- ⚠️ 선제 추출은 **과잉·고비용**: `resolveAllocationsByHeir`(`:167`)·`scaleMapToTotal`(`:194`)을 본체 `calcHeirAllocation`(`:340,412`)도 공유 → 두 헬퍼만 떼면 공유 의존 export/util화 부담.
- **조건부 fallback**: Do 후 `wc -l`이 800 초과 시에만 `inheritance-allocation-deductions.ts` 추출(공유 util 동반 이동). 그 전엔 in-place.

## 의존성 (단방향 — STEP 6 정정 #2)

- 현재 `inheritance-allocation.ts`는 exemption 관련 **`ExemptionCheckedItem` 타입만** import(`:47`), rules/evaluator 함수 import **없음**.
- 신규: `findExemptionRuleById`·`getExemptionTreatment`·`ExemptionTreatment`(`exemption-rules.ts:383,402,54`) **신규 import** (순수 상수·헬퍼, 순환 없음).
- 기존 import 출처: `distributeByLegalShares`←`inheritance-legal-share`(`:26`), `resolveAllocationsByHeir`/`scaleMapToTotal`←동일 파일 내부 정의.
- `heir-allocation-summary.ts` → `result.heirAllocationResult.perHeir`(echo) + `result.exemptionDetail`(total).

## 자가 검토 이력 (STEP 6·8)

### STEP 6 (1차) — 정정 3건
1. (오류 High) §800정책 라인수 760→**770 실측** 정정, 분기 추가 시 ~800 경계
2. (오류 Medium) §의존성: 현재 exemption-rules/evaluator 함수 import 없음(타입만) → 신규 import 정확화
3. (긍정) distributeByLegalShares·resolveAllocationsByHeir·scaleMapToTotal·rules 헬퍼 전부 실존 확인

### STEP 8 (2차 — 정정#1 파급) — 정정 2건
1. (과잉 High) 라인 재추정 +20줄≈790 → 선제 추출은 과잉, **조건부 fallback**으로 강등
2. (모순 High) resolveAllocationsByHeir·scaleMapToTotal 본체 공유 → 추출 시 공유 의존 분리 비용, in-place 우선

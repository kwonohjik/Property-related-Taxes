# 상속세 세대생략 할증과세(§27) 자동 도출 — 엔진 설계

> 계획서: `docs/00-pm/inheritance-generation-skip-auto-derivation.plan.md`
> UI 설계: `inheritance-generation-skip-auto-derivation.ui.design.md` (별도)
> 작성: 2026-06-01

## Context

상속인 입력 단계에서 손녀(수유자)를 세대생략 대상(`isGenerationSkipBeneficiary`)으로 지정해도, 산출 엔진 STEP 9(`inheritance-tax.ts:520`)가 **전역 수동 입력**(`input.isGenerationSkip`·`generationSkipAssetAmount`)만 참조하여 할증세액이 0으로 누락된다(dual-truth). 배부 단계(`allocation:480`)는 손녀 플래그를 쓰지만 산출이 0이면 0을 배부한다. 또한 글로벌 합계를 세대생략 수유자 각각에 전액 배부하여 **복수 수유자 시 이중과세** 구조 결함이 잠재한다.

본 설계는 `isGenerationSkipBeneficiary`를 단일 진실로 삼아 산출·배부·요약·결과 표시를 일관 도출하고, per-heir 독립 계산으로 이중과세를 제거한다. 기존 전역 필드는 deprecated + 레거시 fallback으로 하위호환.

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| C-1 | 수유자 1명·사전증여 없음 (이미지) | §27① 본문 | 종합사례 PDF 30,232,198 | `inheritance/generation-skip-auto-derive.test.ts` (A) | ☐ TODO |
| C-2 | 수유자 1명 + §13내 사전증여 | §27① 괄호문 | 합성 anchor | 동상 (C) | ☐ TODO |
| C-3 | 세대생략 수유자 복수 (손자 21억·40% + 손녀 5억·30%) | §27①② | 합성 anchor (이중과세 방지) | 동상 (B) | ☐ TODO |
| C-4 | 미성년 자동판정 + override | §27② / 민법§4 | 합성 anchor | 동상 (D) | ☐ TODO |
| C-5 | 플래그 true·받은 재산 0 | §27① | 분자 0 → 할증 0 | 동상 | ☐ TODO |
| C-6 | 대습상속 (§27 단서) | §27 단서·민법§1001 | — (relation enum 미구분) | **범위 밖** (별도 트랙) | ⛔ 제외 |
| C-7 | 레거시: 전역 입력만(플래그 없음) | 하위호환 | 기존 PRE-3 시그니처 | `comprehensive-case-pre.test.ts` | ☑ 기존 유지 |

규칙: 행≥1 충족. C-6 명시 제외, C-7 회귀 보존.

---

## 법령 근거

```
상증법 §27 (2026-01-02 시행):
  상속인이나 수유자가 피상속인의 자녀를 제외한 직계비속인 경우에는 제26조에 따른
  상속세산출세액에 상속재산(제13조에 따라 가산한 증여재산 중 상속인·수유자가 받은
  증여재산을 포함) 중 그 상속인·수유자가 받았거나 받을 재산이 차지하는 비율을 곱하여
  계산한 금액의 100분의 30(미성년자가 받았거나 받을 상속재산 20억원 초과 시 100분의 40)을 가산.
  다만, 민법 §1001 대습상속의 경우 그러하지 아니하다.

  분자 = (직접 유증·상속분 estateByHeir) + (§13 cutoff내 사전증여 amountByDonee)
  분모 = adjustedDenominator = taxableEstateValue − nonHeirNonLegateeGifts(영리법인 등)
  할증율 = 미성년 && 개인 재산 > 20억 ? 0.40 : 0.30
```

상수: `INH.GENERATION_SKIP` (`lib/tax-engine/legal-codes/inheritance-gift.ts`). 미성년 19세 = 민법 §4. 분모는 기존 정확(anchor PRE-3) — 변경 없음.

---

## 엔진 input 타입

```ts
// Heir 확장 (types/inheritance-gift.types.ts)
interface Heir {
  // ...기존...
  isGenerationSkipBeneficiary?: boolean;   // 기존 — §27 대상 (단일 진실)
  isMinorOverride?: boolean;               // 신규 — 3-state: undefined=자동(birthDate), true/false=수동
  birthDate?: string;                      // 기존 — legatee도 입력 가능하게 UI 확장
}

// InheritanceTaxInput — 전역 3필드 deprecated (optional 유지, 레거시 fallback)
interface InheritanceTaxInput {
  // ...기존...
  /** @deprecated heirs[].isGenerationSkipBeneficiary 자동 도출. 레거시 명시값 우선 */
  isGenerationSkip?: boolean;
  /** @deprecated heirs[].isMinorOverride + birthDate 자동 판정 */
  isMinorHeir?: boolean;
  /** @deprecated per-heir estateByHeir + §13내 사전증여 자동 집계 */
  generationSkipAssetAmount?: number;
}
```

## 엔진 result 타입

```ts
// 신규 — 상속세 전용 (증여세 GenerationSkipSurchargeDetail 재사용 금지)
interface InheritanceGenerationSkipHeirRow {
  heirId: string;
  heirName?: string;        // 표시용 — 내부 id 노출 금지(feedback_no_internal_id_in_result)
  numerator: number;        // 유증·상속분 + §13내 사전증여
  rate: number;             // 0.30 / 0.40
  isMinor: boolean;
  surcharge: number;        // floor 적용 개별 할증액
}
interface InheritanceGenerationSkipDetail {
  denominator: number;      // adjustedDenominator
  computedTax: number;      // 산출세액(할증 전)
  rows: InheritanceGenerationSkipHeirRow[];
  total: number;            // Σ surcharge
}

interface InheritanceTaxResult {
  // ...기존...
  generationSkipSurcharge: number;                          // 기존 — 합계 (유지)
  generationSkipDetail: InheritanceGenerationSkipDetail | null;  // 신규
}
```

---

## 계산 알고리즘 (단계별)

```
STEP 4 (기존): 사전증여 합산 §13 — preGifts 정규화

STEP 4.5 (신규 — cutoff 끌어올림, S2):
  cutoffFilteredGifts = preGifts.filter(g => isWithin13Cutoff(g, deathDate))
  ※ 기존 STEP 13 내부(tax:686)에서 끌어올려 STEP 8.5·9·13 공유

STEP 8 (기존): 산출세액 computedTax = §26 누진

STEP 8.5 (신규 — 분자 Map 선집계, R1·S4·D4):
  if heirs.some(h => h.isGenerationSkipBeneficiary):    // D4 — 플래그 있을 때만 집계 (불필요 연산 회피)
    legalShares   = computeLegalShares(input.heirs)          // self-contained
    estateByHeir  = aggregateEstateByHeir(estateItems, valuatedAmountById, legalShares)   // 분리 export 헬퍼
    amountByDonee = aggregatePriorGiftByDonee(cutoffFilteredGifts)                         // 분리 export 헬퍼
  ※ STEP 13 calcHeirAllocation 도 동일 헬퍼·동일 입력 재사용 → 단일 진실
  ※ valuatedAmountById 는 STEP 1 평가 결과에서 STEP 8.5 이전에 구성(현재 tax:702 와 동일 Map)

STEP 9 (개정 — per-heir, R1·R2·R4·S1):
  adjustedDenominator = taxableEstateValue − nonHeirNonLegateeGifts   // 기존 분모 불변
  isGenSkip = input.isGenerationSkip ?? heirs.some(h => h.isGenerationSkipBeneficiary)

  if heirs.some(isGenerationSkipBeneficiary):   // per-heir 경로
    rows = []
    for heir in heirs where h.isGenerationSkipBeneficiary && h.relation !== "corporate":
      numerator = (estateByHeir.get(id) ?? 0) + (amountByDonee.get(id) ?? 0)
      isMinor   = resolveMinor(heir, deathDate)
      rate      = isMinor && numerator > 2_000_000_000 ? 0.40 : 0.30
      surcharge = floor(computedTax × numerator × rate / adjustedDenominator)  // 개별 단일 floor
      rows.push({heirId, heirName, numerator, rate, isMinor, surcharge})
    perHeirSurcharge = Record<id, surcharge>
    generationSkipSurcharge = Σ surcharge
    generationSkipDetail = {denominator, computedTax, rows, total}
  else:   // 레거시 단일 경로 (C-7 — 전역 입력만, D3)
    {surchargeAmount} = calcGenerationSkipSurcharge(...기존 시그니처...)
    generationSkipSurcharge = surchargeAmount;  perHeirSurcharge = undefined
    generationSkipDetail = surchargeAmount > 0
      ? {denominator: adjustedDenominator, computedTax, total: surchargeAmount,
         rows: [{heirId:"legacy", heirName:"세대생략 상속재산",   // E2 — 카드 라벨 명확화
                 numerator: generationSkipAssetAmount ?? 0,
                 rate: surchargeRate, isMinor: isMinorHeir ?? false, surcharge: surchargeAmount}]}  // 표시 일관 단일 row
      : null

STEP 10~12 (기존): 영리법인 면제 · 세액공제 · 결정세액 = computedTax + generationSkipSurcharge − credit

STEP 13 (개정 — 배부, S1·D2):
  // D2: legatee만 있는 단순 케이스(hasHeirAllocations=false) 대비 — 세대생략 수유자 존재 시도 배부 진입
  hasHeirAllocations = computeLegalShares(heirs).shares.length > 0
                     || preGifts.some(g => g.doneeId)
                     || heirs.some(h => h.isGenerationSkipBeneficiary)   // D2 추가
  calcHeirAllocation({..., generationSkipSurcharge, perHeirSurcharge})   // params에 Map 추가
  allocation:480 → surchargeForHeir = perHeirSurcharge?.[id]
                   ?? (heir.isGenerationSkipBeneficiary ? generationSkipSurcharge : 0)  // 레거시 fallback
  ※ 단, per-heir 표시의 주 출처는 STEP 9 generationSkipDetail (배부표 누락 케이스도 결과 카드 표시 보장)
```

### 헬퍼 시그니처

```ts
// inheritance-allocation.ts — 분리 export (STEP 8.5·13 공유, I1: 기존 내부함수 래핑)
export function aggregateEstateByHeir(estateItems, valuatedAmountById, legalShares): Map<string, number>;
  // = resolveAllocationsByHeir(estateItems, it => valuatedAmountById.get(it.id) ?? 0, legalShares) (allocation:308)
export function aggregatePriorGiftByDonee(cutoffFilteredGifts): Map<string, number>;
  // = sumPriorGiftsByDonee(cutoffFilteredGifts).amountByDonee (allocation:242)

// inheritance-gift-common.ts — 미성년 판정
export function resolveMinorBeneficiary(heir: Heir, deathDate: Date | string): boolean {
  if (heir.isMinorOverride != null) return heir.isMinorOverride;
  if (heir.birthDate) return differenceInYears(toDate(deathDate), toDate(heir.birthDate)) < 19;
  return false;
}

// per-heir 할증 (기존 calcGenerationSkipSurcharge 시그니처 보존, 신규 함수 추가)
export function calcGenerationSkipSurchargePerHeir(
  computedTax, adjustedDenominator, beneficiaries: {heir, numerator, isMinor}[]
): { total: number; perHeir: Record<string, number>; detail: InheritanceGenerationSkipDetail };
```

---

## Silent fallback / 자동 안분 후보 식별

- **분자 자동 집계는 "자동 안분"이 아님**: `isGenerationSkipBeneficiary` 체크는 **사용자 명시 액션**이고, 분자는 협의분할(`heirAllocations`) 입력값 + 법정상속분(법령 명시 §1009)에서 도출 → `feedback_no_silent_apportion_fallback` 위반 아님 (사용자 명시 단발 액션 패턴, `project_estate_card_input_ux_3fix` 선례).
- **미성년 자동판정**: birthDate 미입력 시 자동 false (할증율 30% 보수적). override로 명시 가능. 빈 값 침묵 채움 아님.
- **레거시 fallback**: 전역 `generationSkipAssetAmount` 명시값은 플래그 없을 때만 단일 경로로 사용 — dual 경로 동시 활성 금지(플래그 우선).
- validation: 세대생략 필수 검증 없음(현행 부재 확정 R7). 자동 도출로 모순 제거.

---

## 테스트 약속

| anchor | 케이스 | 기대값 |
|---|---|---|
| A | C-1 | 전역 3필드 제거, 손녀 플래그+heirAllocations 500M → `generationSkipSurcharge === 30_232_198` (현재 0 실증 후 PASS) |
| B | C-3 | 손자(6세,**21억**=20억 초과)+손녀(30세,5억), **denom 충분히 크게(numerator 합 26억 < adjustedDenominator, 예 80억)** → 손자 40%·손녀 30% 각자 분리 floor. 합 = floor(ct×2.1B×0.40/denom)+floor(ct×0.5B×0.30/denom). 글로벌 2배 배부 아님(이중과세 방지). ⚠️ D1: 40%는 개인재산 20억 초과 필요. E3: numerator는 채무 차감 전 평가액(estateByHeir) |
| C | C-2 | 손녀(legatee=비상속인) 유증300M + **사망 5년내** §13 가산 증여100M(doneeId=손녀) → numerator 400M (D5: legatee cutoff 5년) |
| D | C-4 | birthDate 자동 미성년 → 40%(20억 초과 시), isMinorOverride=false → 30% 전환 |
| E | C-5 | 플래그 true·재산 0 → surcharge 0 |
| 회귀 | C-7 | `comprehensive-case-pre.test.ts` PRE-3 기존 시그니처 PASS 유지 |
| 회귀 | 종합 | `comprehensive-case-pdf.test.ts` G-02·I-21·AN-4 — fixture 전역 3필드 제거 후 자동 도출로 30,232,198 동일 |

- PDF 예시값 원단위 `toBe()`. per-heir floor 정책 — 단일 수유자는 단일 floor와 동일.

---

## UI 통합 위임

- UI 명세: `inheritance-generation-skip-auto-derivation.ui.design.md`.
- 8개 동기화 지점은 UI 시니어 책임. 엔진 시니어는 위 input(`isMinorOverride`)/result(`generationSkipDetail`) 타입만 정의.
- 핵심 UI: HeirComposition `legatee` 체크박스+birthDate, 전역 섹션 제거, 결과 per-heir 카드(증여세 카드 패턴 차용·직접 재사용 금지 R3).

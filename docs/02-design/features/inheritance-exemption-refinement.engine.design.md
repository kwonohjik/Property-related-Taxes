# 상속세 비과세·과세가액 불산입 정비 — 엔진/데이터 설계

> 계획서: `inheritance-exemption-refinement.plan.md` · 대상: 엔진 타입·평가기·상속인별 배분 · 작성 2026-06-09
> 본 문서는 4작업 중 **엔진 영향이 있는 작업 1·4**만 다룬다(작업 2·3은 순수 표시 → UI 설계 문서).

## 1. 케이스 인벤토리 (행 = anchor 후보)

| C# | 시나리오 | treatment | 한도 | 협의분할 | 인정액 vs 청구액 | per-heir 차감 | anchor |
|---|---|---|---|---|---|---|---|
| C1 | 공익법인 출연 1억 (단일, 동족주식 정상) | not_included | unlimited | OFF(법정상속분) | 1억 == 1억 | 법정상속분 비율로 1억 안분 | ✓ A1 |
| C2 | 공익법인 출연 1억, 2인 협의분할(6천:4천) | not_included | unlimited | ON | 1억 == 1억 | 6천만/4천만 | ✓ A1 |
| C3 | 금양임야 청구 2억 / 인정 1.5억(면적초과) | non_taxable | area | ON(1.2억:0.8억) | **1.5억 ≠ 2억** | scale → 9천만/6천만 | ✓ A2 |
| C4 | 비과세+불산입 혼재 (족보 1천만 + 공익법인 1억) | 혼재 | fixed+unlimited | 각각 | 각 항목 인정액 | 항목별 안분 후 합산 | ✓ A3 |
| C5 | 사회통념(이재구호) 금액 미입력 | non_taxable | social_norm | — | claimed 0 → 인정 0 | scaleMapToTotal target<=0 → 빈 Map(차감 0) | ✓ |
| C6 | 협의분할 미입력(undefined) 다수 항목 | — | — | OFF | — | 각 항목 법정상속분 분배 | ✓ |
| C7 | 증여세(gift) 비과세 항목 | non_taxable only | — | N/A(증여=수증자1) | — | per-heir 미적용 | ✓ |
| C8 | 비과세 재산 estateItem 귀속=자녀 / exemption 귀속=배우자 (불일치) | — | — | 양쪽 ON 불일치 | — | 후보① 시 배우자 음수 위험 → 6-3 정책 적용 | ✓ A1확장 |

> **불변식**: `Σ_heir exemptByHeir[heir] == Σ_item 인정exemptAmount[item] == totalExcludedFromTaxation(㉠ total)`.

## 2. 타입 변경 (input·result)

### 2-1. `ExemptionCheckedItem` (`types/inheritance-exemption.types.ts:14-33`)
```ts
export interface ExemptionCheckedItem {
  ruleId: string;
  claimedAmount: number;
  // ...기존 6필드...
  /** 협의분할 — 상속인별 분배 (합 = claimedAmount). 미입력=법정상속분 (작업4) */
  heirAllocations?: HeirAllocation[];   // ← 신규
}
```
- `HeirAllocation`은 `inheritance-gift.types.ts:852` 재사용(`{ heirId, amount, areaM2? }`). import 추가.

### 2-2. `ExemptionItemResult` (`:63-73`) — 작업1 (A)
```ts
export interface ExemptionItemResult {
  // ...기존...
  /** 과세상 취급 — UI 결과 구분 표시용 (작업1) */
  treatment?: "non_taxable" | "not_included";   // ← 신규
}
```

### 2-3. `ExemptionResult` (`:52-57`) — 작업1 (A)
```ts
export interface ExemptionResult {
  totalExemptAmount: number;
  /** 비과세(§12·§46) 합계 */
  nonTaxableTotal?: number;       // ← 신규
  /** 과세가액 불산입(§16·§17) 합계 */
  notIncludedTotal?: number;      // ← 신규
  breakdown: CalculationStep[];
  appliedLaws: string[];
}
```
- optional → 하위호환. 증여세(gift)도 `evaluateExemptions` 공용: `notIncludedTotal=0`(불산입 룰 없음, 3-3 무해).

### 2-4. `HeirAllocationParams` (`inheritance-allocation.ts:122-151`) — 작업4
```ts
export interface HeirAllocationParams {
  // ...기존...
  /** 비과세 항목 (협의분할 분배 소스) */
  exemptionItems: ExemptionCheckedItem[];           // ← 신규
  /** ruleId → 인정 비과세액(itemResults[].exemptAmount). per-heir 차감 target */
  recognizedExemptByRuleId: Map<string, number>;    // ← 신규
}
```

## 3. 알고리즘

### 3-1. evaluator treatment echo (`exemption-evaluator.ts`) — ✅ 실측 확정
- `evaluateSingleExemption(item, rule)`이 **rule을 인자로 받음**(`:33`). 호출부 `findExemptionRuleById(item.ruleId)`(`:241`)에서 rule 획득.
- `base` 객체(`:35-39`)에 `treatment: rule.taxTreatment ?? "non_taxable"` echo (또는 `getExemptionTreatment(rule)` import).
- `evaluateExemptions` 집계 시: `nonTaxableTotal = Σ(treatment==non_taxable ? exemptAmount : 0)`, `notIncludedTotal = Σ(not_included)`.

### 3-2. exemptByHeir 2단계 안분 (`inheritance-allocation.ts` 신규 헬퍼)
```
function computeExemptByHeir(items, recognizedById, legalShares): Map<heirId, number> {
  const out = new Map()
  for (const ex of items) {
    const recognized = recognizedById.get(ex.ruleId) ?? 0
    if (recognized <= 0) continue                          // C5: 차감 0
    // 1단계: claimedAmount 분배 비율 raw
    const raw = (ex.heirAllocations?.length)
      ? new Map(ex.heirAllocations.map(a => [a.heirId, a.amount]))   // C2/C3
      : distributeByLegalShares(ex.claimedAmount, legalShares)        // C1/C6
    // 2단계: 인정액으로 scale (잔액흡수 → Σ==recognized)
    const scaled = scaleMapToTotal(raw, recognized)        // :189
    for (const [h, v] of scaled) out.set(h, (out.get(h) ?? 0) + v)
  }
  return out
}
```
- `scaleMapToTotal`(`:189-206`): `target<=0` → 빈 Map(C5 안전). `denom` = raw 합 = claimedAmount(협의분할 시 validate가 강제). 마지막 항목 잔액 흡수.

### 3-3. taxableValueShare 차감 위치 — ✅ anchor A1 확정 (후보②)
**anchor A1 실측 (2026-06-09)**:
| 시나리오 | taxableEstateValue | ΣtaxableValueShare | ΣdirectEstate | exemptAmount |
|---|---|---|---|---|
| A estateItems 포함(11억) | 995M | 1,100M | 1,100M | 100M |
| B estateItems 미포함(10억) | 895M | 1,000M | 1,000M | 100M |
| C 비과세 없음 | 995M | 1,000M | 1,000M | 0 |

- **후보② 확정**: `taxableValueShare`에 **`− exemptShare` 별도 항**. B처럼 비과세 재산을 estateItems에 안 넣으면 `directEstate`에 없어 후보①(estateByHeir 차감) **불가** → 후보②만 A·B 모두 정합.
  ```
  taxableValueShare = directEstateAmount + presumedAmount + giftAmount − debtShare − exemptShare
  ```
- `perHeir[heir.id].excludedFromTaxation = exemptByHeir.get(heir.id) ?? 0` 기입(죽은 필드 활성화 — anchor 확인: 현행 `undefined`).

### 3-4. ✅ 귀속 정합 (6-3 — anchor로 단순화)
- 후보② 채택으로 **exemption 자체 귀속(exemptByHeir)으로만 차감** → estateItem 귀속 추종 불요. 정책 (a)독립경고·(b)추종 **폐기**.
- **(c) 음수 가드만 적용**: `exemptShare > directEstate+presumed+gift−debt` 인 극단(비과세 협의분할이 특정인에 과집중)에서 `max(0, ...)` + 초과분 타 상속인 재분배(`scaleMapToTotal` 잔액 패턴). 실무상 비과세재산 ⊂ 상속재산이라 드묾.

### 3-5. ✅ 불변식 재정의 (anchor A1)
- 절대 일치 `ΣTVS == taxableEstateValue`는 **불성립** — 장례비 기본공제(§14, 최소 500만)가 per-heir `debtShare`에 미반영되어 비과세와 무관한 5M diff 존재(C에서 확인).
- **작업4 정합 검증 = 비과세 기여분 분리**: `ΣTVS(비과세 입력) == ΣTVS(비과세 미입력) − exemptAmount`. (장례비 등 기존 diff와 독립)

## 4. 동기화 지점 (엔진측 ④⑦⑧⑫⑭ 발췌)

| # | 지점 | 변경 |
|---|---|---|
| ④ | `lib/calc/inheritance-api.ts` | `exemptions[].heirAllocations` 전달(spread 누락 grep — `explicit_prop_mapping_strip`) |
| ⑦ | `heir-allocation-summary.ts:210-218` ㉠ 행 | **무변경** — `excludedFromTaxation` 기입으로 자동 표시. + `ExemptionSummaryCard`/요약카드 2행 분리 |
| ⑧ | `inheritance-validate.ts` | `validateExemptionItemAllocations`: `Σamount===claimedAmount`(미입력 통과). `:140` 패턴 복제 |
| ⑫ | Zod (`lib/validators/property-valuation-input.ts`) | `exemptionCheckedItemSchema`(`:381-`)에 `heirAllocations: z.array(heirAllocationSchema).optional()` 추가. **`heirAllocationSchema`(`:52`) 재사용**. `exemptions: z.array(exemptionCheckedItemSchema)`(`:741`·`:771` 2곳)는 무변경 |
| ⑭ | route handler (`app/api/calc/inheritance/route.ts:80`) | `exemptions: parsedData.exemptions` — heirAllocations는 평면 number/string이라 Date 변환 불요. Zod 통과 시 자동 전달 |
| ⑤ | UI 위젯 | **UI 설계 문서(STEP 12)로 이관** — `ExemptionChecklist`에 `heirs` prop 전달(`steps.tsx:216` 1줄)·`HeirAllocationToggleSection` 배치 |

## 5. 회귀·정합 anchor

- **A1**(C1·C8) ✅ 실행완료(2026-06-09): 후보②(별도항 차감) 확정, 정책(c) 음수가드, 불변식=비과세 기여분 분리(§3-3·3-4·3-5). 작업4 정식 anchor: `ΣTVS(비과세) == ΣTVS(미입력) − exemptAmount`.
- **A2**(C3): 한도초과 → 인정액(1.5억) 합계 차감, claimedAmount(2억) 아님.
- **A3**(C4): 혼재 → `nonTaxableTotal`+`notIncludedTotal` == `totalExemptAmount`, 항목별 per-heir 합산.
- 불변식: `Σ_heir excludedFromTaxation == totalExcludedFromTaxation`.
- 기존 회귀: `__tests__/tax-engine/inheritance/` 820건 무변경 통과(신규 필드 optional).

## 6. 미해결 — 전부 해소 ✅ (Do 진입 가능)
1. ~~evaluator rule 조회 방식~~ ✅ 실측(3-1: rule 인자).
2. ~~차감 위치 + 귀속 정합~~ ✅ **anchor A1 확정**: 후보②(별도항)+정책(c)음수가드(3-3·3-4·3-5).
3. ~~Zod 스키마 위치~~ ✅ 실측(⑫: `exemptionCheckedItemSchema:381` + `heirAllocationSchema:52`).

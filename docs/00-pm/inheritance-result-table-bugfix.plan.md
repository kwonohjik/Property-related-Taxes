# 상속세 결과 집계표 버그 수정 계획서 (증상 4 → 근본원인 R1~R4 + 구조결함 N4)

> 작성: 2026-05-29 · 검토 정정: 2026-05-29(§7·7-1·7-2) · 대상: 상속인별 집계표(image18·19·20) 합계열 ↔ 인별열 불일치
> 엔진 설계: [`docs/02-design/features/inheritance-result-table-reconciliation.engine.design.md`](../02-design/features/inheritance-result-table-reconciliation.engine.design.md) · UI 설계: `…reconciliation.ui.design.md`
> 사용자 보고 증상(① 주식 합계 불일치, ② 사전증여 인별 0, ③ 총상속재산 합계 오류, ④ image19 §28 증여세액공제 ⑩/⑫ 0) → 검토 결과 **근본원인**:
> **R1** 평가↔분배 dual-truth(§2-1) · **R2** 사전증여 doneeId 미배부 — ②·⑩·⑫ per-heir 일가족(§2-2) · **R3** 장례비 한도 dual-truth(§2-5, 검토 신규) · **R4** §28 공제 2-레이어 인식(§2-6, image19 — 대부분 R2로 환원).
> 정책: 추정 금지. file:line 인용 실측 확인. 미확정은 **[확인 필요]**.

## 1. 증상 (image18 검산)

| 행 | 합계열 | 인별열 합 | 차이 | 판정 |
|---|---|---|---|---|
| 상속재산 — 주식 | 550,000,000 | 150 + 500 = **650,000,000** | **+100,000,000** | 인별 > 합계 |
| ① 총상속재산(채무공제 전) | 6,580,000,000 | 6,680,000,000 | **+100,000,000** | 주식 초과분 전파 |
| ② 사전증여재산 | 2,260,000,000 | **0** | **−2,260,000,000** | 인별 배부 누락 |
| ㉡ 채무·공과·장례비 | 1,233,000,000 | 1,233,000,000 | 0 | **합계 표시는 uncapped, 엔진 실제공제는 1,215 (R3)** |
| ③ 추정상속재산 | 350,000,000 | 350,000,000 | 0 | 정상(floor 잔차만) |
| ④ 상속세 과세가액 | 7,975,000,000 | 5,797,000,000 | −2,178,000,000 | R1+R2+R3 합성 (아래 정밀 분해) |

**검산 정밀 분해 (verified — 산술 완전 폐합):**

- **per-heir ④ 합 = 5,797,000,000** = grossInheritance(6,680, R1로 +100) − debtShare(1,233, **uncapped**) + presumed(350) + priorGift(**0**, R2). → `taxableValueShare = directEstate + presumed + giftAmount − debtShare` (`inheritance-allocation.ts:387-388`)로 **정확히 폐합**. R1·R2가 per-heir 열을 완전히 설명.
- **④ total = 7,975,000,000** = grossEstate(6,580) + presumed(350) − **deductedBeforeAggregation(1,215, capped)** + priorGift(2,260). → `taxableEstateValue = max(0, grossEstate + presumed − exempt − deductedBeforeAggregation + priorGiftAggregated)` (`inheritance-tax.ts:207-209`). 채무 차감이 **capped 1,215**라 ①−㉠−㉡(표시 1,233)+②+③(=7,957)와 **18M 어긋남** → R3.

검산 결론: **합계열은 "엔진 권위값"이나, 합계와 인별이 서로 다른 기준을 써서 상호 불일치**. 세 독립 근원:
- **R1** 주식 인별 초과(+100) → ① 인별 초과(+100) 전파 (= 버그 1·3 동일 근원)
- **R2** 사전증여 인별 배부 누락(−2,260) (= 버그 2)
- **R3** 장례비 한도: ㉡ 합계·per-heir는 **uncapped**(1,233), ④ total은 **capped**(1,215) → 18M 갭 (신규 발견, §2-5)

## 2. 근본 원인 진단 (verified)

### 2-1. 버그 1·3 — 협의분할 합계 검증의 dual-truth (동일 근원)

집계표 두 열의 출처가 다름:

| 열 | 출처 | 값 |
|---|---|---|
| ① 합계 | 엔진 `summary.categoryTotals.stock` = Σ `evaluateAllEstateItems().valuatedAmount` (`inheritance-tax.ts:570-577`) | 550 (§60 평가) |
| ① 인별 | 엔진 `perHeir[].grossInheritance` = Σ `categoryBreakdown`(조립 `inheritance-allocation.ts:481-488`) = Σ `heirAllocations[].amount`(구성 `:263-270`) | 650 (사용자 분배) |

엔진은 **"heirAllocations 합 == 자산 평가액"** 불변식을 전제로 두 열을 각각 산출한다(`resolveAllocationsByHeir`은 allocations를 검증 없이 그대로 합산 — `inheritance-allocation.ts:162-166`). 이 불변식은 검증으로 강제되어야 한다:

- `validateEstateItemAllocations`(`lib/calc/inheritance-validate.ts:57-69`)가 `합 == resolveEstateItemValue(item)`을 검사 → `handleCalculate`에서 호출됨(`InheritanceTaxForm.tsx:360`).

**그런데 검증과 엔진이 서로 다른 평가 함수를 사용한다 (dual-truth):**

| 경로 | 함수 | 담보채권 하한(§66·§63②) | 주식 분기 |
|---|---|---|---|
| 검증 expected | `resolveEstateItemValue` (`valuation/resolve-estate-item-value.ts:113-135`) | **미적용** | computeStockValuation |
| 엔진 valuatedAmount | `evaluateAllEstateItems` → `evaluateEstateItem` (`property-valuation.ts:372·328`) | **적용** `max(amount, securedClaim)` (`property-valuation.ts:78-81`) | 별도 라우팅(`property-valuation.ts:370`) |

→ 두 함수가 같은 자산에 다른 값을 반환하면, 검증은 한쪽 기준으로 **통과**하고 엔진은 다른 기준으로 평가하여 **합계열≠인별열**이 생긴다. 이것이 memory `feedback_ui_engine_dual_truth_avoidance` 위반 패턴.

> **[확인 필요] T1**: 사용자 실제 레코드(주식 합계 550 / 인별 650)에서 정확히 어느 경로 차이(담보 하한 vs 주식 분기 vs marketValue 입력값)로 100 차이가 났는지 재현 검증. 두 함수 반환값을 동일 item에 대해 출력하는 throwaway probe로 확정.

### 2-2. 버그 2 — 사전증여 인별 배부 누락

- `sumPriorGiftsByDonee`(`inheritance-allocation.ts:181-203`)는 `if (!gift.doneeId) continue` — **doneeId 없는 사전증여는 인별 배부에서 제외**.
- 그러나 ② 합계열은 `priorGiftAggregated` echo로 전체 합산(`heir-allocation-summary.ts:218-229`) → 합계 2,260, 인별 0.
- 이미 **안내 배지**가 존재(`HeirAllocationSummaryTable.tsx:72-96`, `data-testid="prior-gift-donee-missing-badge"`): "수증자가 지정되지 않아 인별 배부가 생략" → 사전증여 입력에서 수증자 선택 유도.
- 사전증여 수증자 select UI는 최근 추가됨(커밋 `41693d9`, "doneeId·isHeir 동시 동기화"). 본 레코드는 그 이전 저장이거나 수증자 미선택 상태.

→ 버그 2의 엔진/표시는 **설계대로 동작**. 문제는 (a) 사용자가 수증자를 선택했는데 저장/복원이 안 됐거나, (b) 수증자 미선택. **[확인 필요] T5**.

**⚠️ R2 범위 확장 (image19 반영)**: `sumPriorGiftsByDonee`(`:181-203`)는 `amountByDonee`·`taxBaseByDonee`·`computedTaxByDonee` **3종 Map을 모두** doneeId로 집계하고 `!doneeId` 시 전부 skip(`:191`). 따라서 doneeId 누락은 ② 사전증여재산뿐 아니라 **사전증여 per-heir 일가족 전체**를 0으로 만든다:
- **②** 사전증여재산 (`priorGiftAmount`)
- **⑩a/b/c** 영리법인 증여세 산출세액·한도·공제 (`priorGiftComputedTax`/`priorGiftCreditLimit`, corporate)
- **⑫a/b/c** §28 사전증여세액공제 (`priorGiftComputedTax`/`priorGiftCreditLimit`/`priorGiftCredit`, 자연인)

image19의 ⑩·⑫ 전부 0은 이 doneeId 게이트의 직접 결과다(§2-6에서 §28 집계 공제와 구분).

### 2-2-A. 전체 행 정합 감사 (33행) — "합계가 전반적으로 안 맞는다"의 구조적 원인

사용자 지적("합계 필드가 전체적으로 각 상속인 데이터를 제대로 합계 못한다")은 **정확**하다. 다만 원인은 "합계 함수 고장"이 아니라, **`buildSummaryTable`(`heir-allocation-summary.ts`)이 행마다 합계열을 도출하는 방식이 3가지로 제각각이고, "합계열 == Σ 인별열" 불변식이 어디에도 강제되지 않기 때문**이다. 33행을 도출 방식별로 분류하면:

| Pattern | 합계열 출처 | 인별열 출처 | 정합성 | 해당 행 |
|---|---|---|---|---|
| **A** (엔진 독립총계 vs 엔진 인별) | 엔진 총계 필드 | 엔진 perHeir 필드 | **인별 데이터 어긋나면 불일치** | 자산4행(금융·부동산·주식·기타), ① 총상속재산, ㉠ 과세제외, ④ 과세가액, *1, *2, ⑥㉢, *3, *4, ⑩b, ⑩c |
| **B** (Σ인별로 합계 산출) | `Σ perHeir` (reduce) | 동일 perHeir | **항상 정합** (구성상) | ㉡ 채무, ③ 추정, ⑥㉠ 직접, ⑥㉡ 간접, ⑪ 배부, ⑩a, ⑫a/b/c, ⑬, ⑭, ⑮ |
| **C** (echo vs 인별) | `result.priorGiftAggregated` echo | perHeir(doneeId 없으면 0) | **doneeId 미지정 시 불일치** | ② 사전증여 |
| **D** (합계 전용) | 엔진 총계 | `headerOnly()`=null | 인별 없음(의도) | ⑤ 상속공제, ⑦ 산출세액, ⑧ 세대생략가산, ⑨ 소계 |

**핵심**: 합계열(Pattern A)은 **엔진의 권위 있는 총계**라 (㉡ 제외) 대체로 정확하다. 어긋남은 인별 셀(R1·R2)과 ㉡ 합계 자체(R3)에서 비롯되며, **세 독립 근원(R1·R2·R3)**이 Pattern A 행 전반으로 **전파**된다:

- **R1 (평가↔분배 dual-truth, §2-1)**: 자산4행·①(`grossInheritance`=Σ categoryBreakdown)을 깨뜨리고 → 병렬 경로 `directEstateAmount`(=`estateByHeir`, `:384`)에서 파생되는 `taxableValueShare`·`taxBaseShare`를 타고 **④·*1·*2·⑥㉢·*3**까지 전파. (grossInheritance와 directEstateAmount는 둘 다 Σ allocations이라 동일 +100 — 주식 +100 → ① +100 → ④ +100…)
- **R2 (사전증여 doneeId, §2-2)**: ②를 깨뜨리고 → `taxableValueShare`가 사전증여 인별분을 0으로 가져가 **④·*1**의 인별합을 사전증여 합계만큼 **부족**하게 만듦. (인별 −2,260)
- **R3 (장례비 한도 dual-truth, §2-5)**: ㉡ 행의 per-heir debtShare(uncapped)가 엔진 실제공제(capped)와 달라 → `taxableValueShare`에서 한도초과분만큼 과다 차감 → **④** total과 18M 어긋남.

즉 사용자가 본 "전반적 불일치"는 **R1·R2·R3 세 근원이 Pattern A 행들로 동시 전파된 결과**이며, 행 자체가 33개 제각각 버그인 것이 아니다.

**⚠️ Pattern B의 위장 (위 표 "항상 정합"은 표 내부 한정)**: Pattern B 행이 "정상"으로 보이는 이유는 합계를 `Σ인별`로 만들어 개별 셀이 틀려도 자기 자신과는 맞기 때문이다. **자기정합 ≠ 엔진권위 정합**. Pattern B 중 엔진 권위 총계가 따로 있는 행은 그 권위값과 어긋날 수 있다:
- **㉡ 채무**: Σ debtShare(1,233) ≠ deductedBeforeAggregation(1,215, capped) — R3.
- **⑥㉡ 간접배부**: Σ인별(3,849M) ≠ indirectNumerator(=taxBase 3,795M) — §2-2-B 과다배부.
- **⑪ 산출세액 배부**: Σ인별(1,458M) ≠ distributableTax(⑦ 1,437.5M) — §2-2-B.
- **⑮ 차감자진납부세액**: Σ인별(1,414M) ≠ aggregate `result.finalTax` — §2-2-B.

즉 위 분류표의 "항상 정합"은 **표 내부 정합일 뿐**이며, 위 4행은 엔진 권위값과 불일치한다. → T3 가드는 Pattern B 행도 (엔진 총계가 존재하면) 그것과 대조해야 한다(아래 T3(c)). 근본 해소는 ㉡=T7, ⑥㉡·⑪·⑮=T2·T7·T10.

**구조적 결함**: 같은 표 안에서 합계 도출 전략이 A/B/C로 혼재하고, "엔진총계 == Σ인별" 불변식이 없다. 사용자는 어느 행이 신뢰 가능한지 구분할 수 없다. → **T3에서 전 Pattern A 행에 정합 불변식 가드**를 두는 것으로 확장(아래 §3 T3 개정).

> **T1+ (검토로 18M 잔차 규명 완료)**: 이전 "①+②만으로 안 닫히던 18M"은 **R3(장례비 한도 dual-truth, §2-5)로 완전 규명**. 현재 image18의 모든 불일치(주식 +100, 사전증여 −2,260, ④ total 18M)는 **R1·R2·R3로 산술 폐합**. 잔여 [확인 필요]는 ㉠ 과세제외가 0이 아닌 케이스(비과세·과세가액불산입 입력 시)에서 안분 정합인지 — 본 레코드는 ㉠=0이라 미검증.

### 2-2-B. ⚠️ 세액 배부 행 총액 비보존 — R1·R3의 실제 세액 영향 (image20 전수검산 신규)

image20 전체 표를 행별 검산한 결과, R1·R3가 **단순 표시 오류를 넘어 per-heir 납부세액 자체를 과다 산출**함을 확인. 세액 배부 행이 **합계를 보존하지 못한다**:

| 행 | 합계(엔진 권위) | Σ 인별 | 초과 | 비율 |
|---|---|---|---|---|
| ⑥㉡ 간접배부 | (정답 taxBase 3,795,000,000) | **3,849,451,443** | +54,451,443 | ×1.01435 |
| ⑥㉢ 과세표준상당액 계 | 3,795,000,000 | **3,849,451,443** | +54,451,443 | ×1.01435 |
| ⑪ 산출세액 배부 | (⑦ 산출세액 1,437,500,000) | **1,458,125,546** | **+20,625,546** | ×1.01435 |
| *5 부담비율 | 1.0000 | **1.0141** | +0.0141 | ×1.01435 |
| ⑮ 차감자진납부세액 | (실제 결정세액 — 註) | **1,414,381,780** | (註) | ×1.01435 |

> 註) ⑮ "실제 결정세액"은 aggregate `result.finalTax`로 확정해야 정밀하다(§28·§69·외국납부 등 공제 조합 의존). 근사 1,394,375,000은 §69(3%)만 가정한 값 — 실제값은 T1에서 `result.finalTax` 직접 확인. 어느 쪽이든 per-heir ⑮ 합(1,414M)이 aggregate보다 ×1.01435 과다인 구조는 동일.

**메커니즘 (verified, 산술 폐합)**:
- 간접배부 = `bigIntRoundDiv(indirectNumerator × (taxableValueShare − giftAmount) / indirectDenominator)` (`inheritance-allocation.ts:393-402`).
- `indirectDenominator = 5,715M`(= `*1` 과세표준 배부대상 = `taxableEstateValue − totalPriorGift`, **올바른 분모 풀**).
- 그러나 **Σ(taxableValueShare) = 5,797M** (per-heir base) ≠ 5,715M. 차이 **+82M = R1(+100, 주식 과다) − R3(−18, 채무 capped 차이)**.
- 따라서 분배 비율 = 5,797/5,715 = **1.01435** → ⑥·⑪·⑬·⑭·⑮·*5 **모든 하류 배부행이 1.435% 과다**. ⑪ 산출세액 배부 합이 실제 산출세액(⑦)보다 20.6M 많고, per-heir 차감자진납부세액 합이 실제 결정세액보다 ~20M 많다.

**N4 — 배부 함수 잔액 흡수 비일관 (verified)**:
- `distributeByLegalShares`(`inheritance-legal-share.ts:93-115`)는 **"최다 분자 상속인 잔액 흡수"** 보유 → ③ 추정상속재산이 정확히 보존(150,000,004+99,999,998+99,999,998 = 350,000,000).
- 그러나 **간접배부·산출세액 배부는 상속인별 독립 `bigIntRoundDiv` floor — 잔액 흡수 없음**(`:396-414`). Σbase==분모라도 floor 잔차가 남고, 현재는 Σbase≠분모(R1/R3)라 체계적 1.435% 과다.

**중대성**: 이는 표시 불일치가 아니라 **세액 과다 산출**(각 상속인 납부세액이 실제보다 ~1.4% 높음). R1·R3 수정 시 Σbase==분모가 되어 비율 1.0으로 복귀하나, **floor 잔차까지 안전하려면 배부 함수에 잔액 흡수(`feedback_floor_residual_absorption`)를 추가**해야 한다 → 신규 **T10**.

> **[확인 필요]**: 결과뷰 headline "총 납부세액"이 aggregate `result.finalTax`(정확, ≈1,394M)를 쓰는지, per-heir 합(과다, 1,414M)을 쓰는지 — 전자면 headline은 맞고 표만 과다(여전히 사용자 혼란), 후자면 headline까지 과다.

### 2-3. "몇 시간 전 수정했는데 왜 안 됐나" — 통합 답 (verified)

**이력 "수정"(편집) 복원 기능이 이번 세션 직전까지 깨져 있었다.**

- `HistoryClient.handleResume`·`HistoryDetailDrawer.handleResume`에서 상속세(`inheritance`)는 `else { router.push() }`로 빠져 **데이터 복원 0건**이었음(증여세는 `giftTaxResumeInput` sessionStorage 경유 복원 존재, 상속세는 누락).
- 따라서 "몇 시간 전" 수정 클릭 시 **빈 폼**이 떴고, 사용자가 주식 분배·사전증여 수증자를 고쳐도 **원본 레코드에 반영되지 않았다**(빈 폼에 적용 → 별도 신규 레코드이거나 소실).
- **본 세션 turn 1에서 복원 로직 추가 완료** (`inheritanceTaxResumeInput` sessionStorage + `InheritanceTaxForm` 마운트 hydration + 두 handleResume에 `inheritance` 분기). 이제 복원이 동작하면서 저장돼 있던 불일치 데이터가 계산 단계에서 드러난 것.
- turn 2에서 고아 상속인 참조(`pruneOrphanHeirReferences`)도 정리 완료. 단, 본 불일치(650≠550)는 고아 참조가 아니라 평가/검증 dual-truth라 별도 수정 필요.

### 2-5. 버그 R3 — 장례비 한도 dual-truth (검토 중 신규 발견)

§1 ④ total의 미설명 18M 잔차를 추적한 결과 **제3의 dual-truth**를 발견:

| 경로 | 장례비 처리 | 값 | 위치 |
|---|---|---|---|
| 엔진 과세가액 차감 | `funeralDeduction = min(식대,1천만) + min(봉안,5백만)` **(capped)** | 1,215 | `inheritance-tax.ts:132·169` (`deductedBeforeAggregation = funeralDeduction + nonFuneralDebts`) |
| 인별 배부(㉡ 행) | `debtByHeir = resolveAllocationsByHeir(debtItems, it => it.amount)` **(uncapped, `it.amount` 원금)** | 1,233 | `inheritance-allocation.ts:280` |

→ ㉡ 행 합계(Σ debtShare=1,233)는 한도 미적용, ④ total의 채무 차감(deductedBeforeAggregation=1,215)은 한도 적용. **18M = 장례비 한도초과분**. per-heir ④도 uncapped debtShare를 빼므로 인별열에 한도초과분이 과다 차감(=과세가액 과소)된다.

→ **수정 방향**: 인별 배부의 장례비도 §14 한도 적용(capped) — `debtByHeir`(또는 그 표시)가 `deductedBeforeAggregation`과 동일 capped 값을 쓰도록 단일화. **신규 T7** (§3).

> **[확인 필요]**: 봉안(`isBongan`)·식대 구분이 debtItems category에 정확히 매핑되어 한도가 항목별로 올바르게 적용되는지 — funeral 한도가 항목 합산 후 1회인지 항목별인지(`inheritance-tax.ts:132`는 식대·봉안 각 1회) 인별 배부와 정합 확인.

### 2-6. 버그 R4 — 사전증여 §28 증여세액공제 미반영 (image19)

image19에서 ⑩a/b/c·⑫a/b/c(증여세 산출세액·공제 한도·사전증여세액공제)가 **전부 0**. §28 증여세액공제는 **2개 레이어**로 나뉘며 의존성이 다르다:

| 레이어 | 함수·위치 | 의존 | 표시 위치 |
|---|---|---|---|
| **집계 §28** (총세액 차감) | `calcGiftTaxCredit` `totalGiftTaxPaid = Σ gift.giftTaxPaid` (`inheritance-gift-tax-credit.ts:59`) — **doneeId 무관** | `giftTaxPaid > 0`만 필요 | 결과뷰 "세액공제 합계" + `TaxCreditBreakdownCard` (`InheritanceTaxResultView.tsx:447·505`) |
| **인별 ⑩/⑫** (배부 표시) | `computedTaxByDonee.get(heir.id)` (`inheritance-allocation.ts:201-204`) — **doneeId 필수** | `giftTaxPaid > 0` **AND** `doneeId` | per-heir 집계표 ⑩/⑫ 행 |

**핵심 구분**:
- 집계 §28이 0이면 → **실제 상속세 과다(이중과세)**. 원인은 `Σ giftTaxPaid = 0` (기납부 증여세 미입력). **doneeId와 무관**.
- 인별 ⑩/⑫만 0이고 집계 §28은 적용됐다면 → **표시 문제(R2 family)**. 세액공제는 총세액에서 이미 차감됨.

**데이터 흐름 검증 (verified — strip 아님)**:
- 폼 `GiftRowEditor`에 "기납부 증여세" 입력 위젯 존재(`:310-317`).
- Zod `priorGiftSchema.giftTaxPaid: z.number().nonnegative()` 정의됨(`property-valuation-input.ts:389`) → strip 안 됨.
- API가 `preGiftsWithin10Years`·`creditInput.priorGifts` 양 경로로 전달.
- 이력 자동조회 auto-fill: 일반 분기 `giftTaxPaid = c.finalTax` 채움(`prior-gift-lookup.ts:325`), **단 `doneeId` 미설정**(`:337` "이력 추론 불가").

→ **결론**: 데이터 흐름은 온전. image19 ⑩/⑫=0의 직접 원인은 **doneeId 누락(R2 family)**이 유력 — 집계 §28은 `giftTaxPaid`만 있으면 적용된다. 단, 사용자가 기납부 증여세를 아예 입력 안 했으면 집계 §28도 0(이중과세) → 아래 [확인 필요].

> **[확인 필요] R4**: 해당 레코드의 (1) `result.totalTaxCredit` 및 `TaxCreditBreakdownCard`에 §28 줄이 **0이 아닌지**(집계 적용 여부), (2) priorGifts의 실제 `giftTaxPaid` 값이 0인지. → (1)이 0이 아니면 image19는 순수 표시 문제(R2 family, T5로 해소). (1)이 0이고 giftTaxPaid도 0이면 사용자 미입력(버그 아님, 단 안내 강화). T1+ 재현으로 확정.

### 2-4. 부차 발견 — source-summary `resolveValuation` 별도 dual-truth

- `EstateAllocationTable`의 합계열은 `resolveValuation`(`source-summary-helpers.ts:21`) = `marketValue ?? appraisedValue ?? standardPrice ?? 0` — **주식 `computeStockValuation` 및 담보 하한 제외**.
- 본 레코드 주식은 marketValue가 있어 550으로 표시되지만, **avg×수량·V2로만 평가되는 주식은 이 표에서 0/과소 표시**된다. 별도로 `resolveEstateItemValue`(또는 엔진 valuatedAmount)로 통일 필요.

## 3. 수정 항목

### T1. 재현·확정 (Pre-Do anchor) — **선행 필수**
- 사용자 레코드(또는 동형 fixture: 주식 1건, marketValue/securedClaim/주식분기 조합)로 `resolveEstateItemValue(item)` vs `evaluateEstateItem(item).valuatedAmount` 차이를 probe 출력.
- `validateEstateItemAllocations`가 650을 통과시키고 엔진이 550으로 평가하는 정확한 경로를 anchor 실패로 확보 → 디자인 환류.
- 정책: memory `feedback_pre_anchor_verification`. "현행 일치 예상" 가정 금지.

### T2. 검증·엔진 평가 단일 진실화 (버그 1·3 본체)
- `validateEstateItemAllocations`의 expected를 **엔진과 동일 평가**(`evaluateAllEstateItems`의 `valuatedAmount`, 담보 하한·주식 분기 포함)로 교체.
  - 현행 `resolveEstateItemValue`는 §66/§63② 하한 미적용 → 엔진과 괴리. 단일 함수로 수렴.
- **⚠️ 구현 hazard (O4)**: `evaluateEstateItem`은 `listed_stock`/`unlisted_stock`에 **throw**(`property-valuation.ts:340-342`). 따라서 검증에서 자산별 단건을 평가할 때 `evaluateEstateItem` 직접 호출 금지 — `evaluateAllEstateItems`(주식 라우팅 포함) 또는 카테고리 분기 단일 헬퍼를 사용. **추천: 엔진 `evaluateAllEstateItems` 결과의 `valuatedAmountById`를 단일 진실로 export**하여 검증·집계·표가 모두 동일 Map 참조.
- **⚠️ 기존 레코드 영향 (O3)**: T2로 검증이 엄격해지면(담보 하한 포함 평가 == 분배 합), 과거 느슨한 기준으로 통과·저장된 이력이 **수정 복원 시 신규 차단**될 수 있다. → 차단 메시지에 **정확한 평가액(엔진값)을 표시**하여 재분배 유도. 일괄 마이그레이션은 불요(수정 시점에 사용자가 교정).
- 영향: `resolveEstateItemValue` 다른 호출처(`inheritance-deduction-suggest.ts getValuatedAmount` 동치 주장 — `resolve-estate-item-value.ts:122`) 전수 점검. 단일화 시 회귀 가능.
- 정책: `feedback_ui_engine_dual_truth_avoidance`, `single-source-engine-helper`.

### T3. 정합 불변식 가드 (방어선) — **전 Pattern A 행으로 확장** (§2-2-A 반영)
- (a) **자산 단위**: `calcHeirAllocation`에서 자산별 `Σ heirAllocations.amount ≠ valuatedAmount`이면 echo 경고(`heirAllocationResult.allocationMismatch[]`) + 결과뷰 rose 배지. **정상 흐름에서는 T2 검증이 먼저 차단**하므로 (a)는 검증 우회 경로(직접 API·검증 갭)용 방어선. **엔진은 의도적으로 allocation을 auto-clamp/scale 하지 않음**(`feedback_no_silent_apportion_fallback` — 침묵 보정 금지, 경고만).
- (b) **표 단위**: `buildSummaryTable` 또는 결과뷰에서 Pattern A 행마다 `합계열 ≠ Σ 인별열`(절대오차 > floor 잔차 허용치)이면 해당 행에 시각 경고(예: 합계 셀 옆 ⚠️ + tooltip "인별 합 X ≠ 합계 Y"). 개발 모드 console.warn 병행.
- (b') **Pattern B·㉡ 함정 (I2·R3 반영)**: Pattern B 행은 합계를 `Σ인별`로 만들어 표 내부는 항상 정합하나 **엔진 권위값과의 정합은 미보장**(㉡ 채무: Σ debtShare=1,233 ≠ 엔진 deductedBeforeAggregation=1,215). → **엔진 총계가 존재하는 행**(㉡=deductedBeforeAggregation, ⑮=`result.finalTax`, ⑥㉢=`result.taxBase` 등)은 그 엔진값과 대조하는 가드 추가. **엔진 총계가 없는 순수 배부 행만 `Σ인별` 유지 허용.**
- (c) **표 구조 일관화 검토 (I2 정정)**: 합계열을 무조건 엔진총계로 단일화하는 것은 불가(⑪·⑫ 등 순수 배부 합계는 엔진 단일 총계가 없을 수 있음). → **원칙**: 엔진 권위 총계가 존재하는 모든 행은 (A) 그 엔진값을 합계열로 쓰고 (B) `Σ인별 == 엔진값` 불변식 가드. 엔진 총계가 없는 행만 `Σ인별`. "Pattern B 전면 지양"이 아니라 **"엔진 총계 있으면 그것과 대조"**가 정확한 원칙.
- (d) **비율 행 (O1)**: *5 부담비율 total은 `1.0` 하드코딩(`heir-allocation-summary.ts:466`). `Σ burdenRatio`가 1.0과 floor 잔차 이상 벌어지면(영리법인 제외·반올림) 미검출 → 가드 범위에 포함(또는 total을 `Σ인별`로 산출).
- 목적: 검증 우회·신규 케이스 어디서도 합계≠인별이 **침묵 통과하지 못하게**. 사용자가 신뢰 가능 행을 구분 못 하는 현 구조 제거.
- **신규 result 필드 (O5)**: `allocationMismatch[]` echo는 `InheritanceTaxResult`(또는 `heirAllocationResult`) 타입 확장 → echo-field-pattern 적용 + 결과뷰 표시 + (해당 시) 14지점 ⑦ 동기화.
- 정책: `feedback_engine_result_display_drift`(자기일관성 anchor 강제), `feedback_ui_engine_dual_truth_avoidance`, `echo-field-pattern`.

### T4. source-summary 합계열 dual-truth 제거 (§2-4 부차 발견)
- `resolveValuation`(`source-summary-helpers.ts:21`)을 `resolveEstateItemValue`(또는 T2 통일 함수)로 교체 — 주식 computeStockValuation·담보 하한 포함.
- `EstateAllocationTable` 합계열·항목 평가금액열(line 56·187) 동시 반영.
- anchor: avg×수량 주식이 표 합계에 정상 반영되는지.

### T5. 버그 2·R4a — 사전증여 doneeId 라운드트립·강제 (②·⑩·⑫ per-heir 일괄 해소)
- turn 1 복원으로 `doneeId`가 저장/복원되는지 e2e 검증(수증자 선택 → 저장 → 수정 복원 → doneeId 유지).
- heirs 존재 + 사전증여 존재인데 doneeId 미지정이면 **검증 경고**(차단 아닌 명시 안내) — 자동 안분 fallback 금지 정책상 차단보다 배지 유지(`feedback_no_silent_apportion_fallback`). 현행 배지(`prior-gift-donee-missing-badge`) 노출 조건 재확인.
- doneeId 설정 시 ②·⑩·⑫ per-heir가 동시 채워짐(`sumPriorGiftsByDonee` 3 Map 공통) — anchor로 ②·⑫ 동시 검증.

### T8. §28 증여세액공제 가시성 (R4 표시 — image19 직접 대응)
- 결과뷰 per-heir 집계표에서 **giftTaxPaid > 0 이지만 doneeId 미지정**이면 ⑩/⑫ 행에 안내: "집계 §28 증여세액공제는 세액공제 합계에 **이미 반영**됨 — 인별 배부는 수증자 지정 필요". (현 `prior-gift-donee-missing-badge`를 ⑫/⑩ 행으로 확장)
- 목적: 인별 ⑫=0이 "증여세 공제 전혀 미반영"으로 **오인되는 것 방지**. 집계 §28(세액공제 합계)과 per-heir 배부를 명확히 분리 표시.
- 집계 §28 = 0 이면서 priorGifts에 `giftTaxPaid` 미입력이면 → 기납부 증여세 입력 유도 배지(이중과세 경고). 단 자동 산출 금지(사용자 입력값).

### T9. 이력 자동조회 doneeId 매핑 + giftTaxPaid 안내 (R4 근원 보강)
- `prior-gift-lookup.ts:337` — 자동조회 import 시 `doneeId` 미설정이 구조적. import 후 **수증자 매핑 단계**(2-B select)를 유도하거나, 단일 상속인 추정 가능 시 제안(자동 확정 금지).
- import된 gift는 `giftTaxPaid = c.finalTax`로 채워지므로(`:325`) 집계 §28은 작동 — doneeId만 보완하면 per-heir까지 정합.
- 수동 입력 gift에 `giftAmount > 0` & `giftTaxPaid = 0`이면 §28 미적용 안내(입력 누락 여부 확인 유도).

### T10. 배부 함수 총액 보존 — 잔액 흡수 (N4·§2-2-B 본체)
- 간접배부(`inheritance-allocation.ts:393-402`)·산출세액 배부(`:408-414`)에 `distributeByLegalShares`식 **잔액 흡수**(최다 분자/마지막 상속인) 적용 → `Σ computedTaxShare == distributableTax`, `Σ indirectTaxBaseShare == indirectNumerator` 정확 보존.
- **전제 (C18 정정)**: **R1·R3(=T2·T7)만** 선수정하면 `Σ(indirectBase) == indirectDenominator` 성립. R2(doneeId/giftAmount)는 **무관** — `indirectBase = taxableValueShare − giftAmount`에서 giftAmount가 **상쇄**(`:388`·`:395`)되고, ⑪ Σ taxBaseShare도 doneeId가 direct↔indirect 비중만 이동시켜 합은 taxBase 불변. (R1/R3 미수정 시 잔액 흡수는 82M을 한 상속인에 몰아줄 뿐 — 반드시 T2·T7 이후)
- anchor: ⑥㉡ Σ인별 == taxBase, ⑪ Σ인별 == ⑦ 산출세액, *5 Σ부담비율 == 1.0 (floor 잔차 0).
- 정책: `feedback_floor_residual_absorption`, `feedback_engine_result_display_drift`.

### T6. 복원 회귀 e2e (turn 1·2 확정)
- `e2e/inheritance-edit-restore.spec.ts`: 상속개시일·상속인·주식·사전증여 입력 → 결과 → 이력 → 수정 → 폼 복원 전 필드 일치 + 재계산 성공.
- 정책: `feedback_browser_verify_with_playwright`.

### T7. 장례비 한도 인별 배부 단일화 (버그 R3 본체 — 검토 신규)
- `debtByHeir`(`inheritance-allocation.ts:280`)의 장례비(category="funeral") 항목이 §14 한도(식대 1천만·봉안 5백만, `inheritance-tax.ts:132`)를 **적용한 capped 금액**으로 인별 배부되도록 수정 → ㉡ 행 합계 = `deductedBeforeAggregation`(1,215)와 일치, per-heir ④도 capped 차감.
- 단일 진실: 엔진 STEP 3의 `funeralDeduction` 산식을 인별 배부와 **공유**(헬퍼 추출) — 한도 로직 중복 정의 금지(`single-source-engine-helper`).
- 한도 적용 후 인별 안분 비율 결정: 항목별 한도 적용 → 남은 capped 총액을 협의분할/법정상속분으로 안분(자동 안분 fallback 금지 — 명시 분배 있으면 비율 환산).
- anchor: 식대 28M(한도 10M)·봉안 0 → ㉡ 합계 = deductedBeforeAggregation = per-heir 합. floor 잔차 1원 이내.
- **[확인 필요]**: 봉안/식대 항목이 debtItems에 `isBongan` 등으로 구분 저장되는지, 한도가 항목 합산 1회인지 — §2-5 확인 필요와 연결.

## 4. Definition of Done

- [ ] T1 probe로 100 차이 경로 확정 후 본 문서 §2-1 환류
- [ ] T2 단일 평가 함수 — `resolveEstateItemValue` 호출처 전수 점검, 회귀 0
- [ ] T3 정합 불변식 — 전 Pattern A 행 자기일관성 anchor(엔진총계==Σ인별, floor 잔차 허용). 자산 단위 + 표 단위 가드
- [ ] T4 source-summary 합계열 — 주식 평가 포함 anchor
- [ ] T5 doneeId 라운드트립 e2e + ②·⑩·⑫ 동시 채움 anchor + 배지 조건 재확인
- [ ] T6 복원 e2e
- [ ] T7 장례비 한도 인별 배부 — ㉡ 합계 == deductedBeforeAggregation == per-heir 합 anchor
- [ ] T8 §28 가시성 — giftTaxPaid>0·doneeId 미지정 시 ⑩/⑫ "집계 반영됨" 안내 (오인 방지)
- [ ] T9 이력 자동조회 doneeId 매핑 유도 + giftTaxPaid=0 안내
- [ ] T10 배부 총액 보존 — ⑥㉡ Σ==taxBase, ⑪ Σ==산출세액, *5 Σ==1.0 anchor (T2·T7 이후)
- [ ] `npx tsc --noEmit` 0건 / `npx vitest run __tests__/tax-engine/inheritance __tests__/calc __tests__/components` 통과
- [ ] **회귀 구분 (중요)**: T7·T10·T2는 per-heir 분배값을 **의도적으로 변경**(과다배부 1.435% 제거·장례비 capped). 따라서 "회귀 0"은 **타 세목·구조 회귀 0**을 뜻하고, **inheritance per-heir anchor는 법령 정합값으로 재계산**해야 한다(`feedback_anchor_correction_legal_priority` — 잘못된 기존 anchor 유지 금지). aggregate(⑦·finalTax)·타 세목은 불변이어야 함.
- [ ] 14지점 점검(평가 함수 변경은 ⑦ 결과·⑧ validation 동기화 핵심, T3 `allocationMismatch[]` 신규 result 필드 echo)

## 5. 우선순위·순서

1. **T1**(재현·R4 집계공제 값·headline 출처 확인) → 2. **T2**(평가 단일화, R1) → 3. **T7**(장례비 한도, R3) → 4. **T10**(배부 총액 보존, N4 — T2·T7 직후 필수: per-heir 세액 과다 1.435% 해소) → 5. **T5**(사전증여 doneeId, R2·R4a — ②·⑩·⑫) → 6. **T8**(§28 가시성, R4 오인 방지) → 7. **T9**(자동조회 보강) → 8. **T3**(정합 불변식 가드) → 9. **T4**(source-summary dual-truth) → 10. **T6**(복원 e2e).

T2·T7가 R1·R3 해소 → **T10이 배부 총액 보존 복구(⑥·⑪·⑬·⑮·*5 과다배부 제거 — per-heir 납부세액 정상화)**. T5가 R2(②·⑩·⑫). R4는 대부분 R2로 환원 → T5+T8. T3는 재발 방지(앞 수정 이후). **T1 선행 없이 T2 진입 금지**(`pre-do-anchor-verification`).

> **⚠️ 세액 영향**: §2-2-B의 ⑥·⑪·⑬·⑮ 과다배부는 **표시가 아니라 실제 per-heir 납부세액 1.435% 과다**. T2·T7·T10 완료 전까지 per-heir 세액 신뢰 불가 — 최우선.

## 6. 미해결·확인 필요 요약

- **[확인 필요]** R1 100 차이 정확 경로(담보 하한 vs 주식 분기 vs 입력값) — T1 probe
- **[확인 필요]** R3 장례비 한도가 봉안/식대 항목별로 debtItems에 구분 저장·적용되는지(`isBongan`) — T7
- **[확인 필요]** ㉠ 과세제외 ≠ 0 케이스(비과세·과세가액불산입)에서 합계↔인별 정합 — 본 레코드 ㉠=0이라 미검증
- **[확인 필요]** 사용자가 사전증여 수증자를 선택했었는지(미선택 vs 복원 소실) — T5 e2e
- **[확인 필요] R4**: `result.totalTaxCredit`·`TaxCreditBreakdownCard`의 §28 줄이 0인지(집계 공제 적용 여부) + priorGifts 실제 `giftTaxPaid` 값 — 0 아니면 image19는 순수 표시(R2 family), 0이면 기납부 증여세 미입력 — T1+ 재현
- **[확인 필요] N4**: 결과뷰 headline "총 납부세액"이 aggregate `result.finalTax`(정확)인지 per-heir 합(과다 1,414M)인지 — headline까지 과다면 심각도 상승. `result.finalTax` 실측으로 ⑮ 註의 근사 1,394M 확정
- 본 사용자 주식 분배(150+500=650)가 의도상 올바른지(평가액 650 입력 누락) vs 평가액 550이 맞는지 — T1에서 자산 평가액 확정 후 판단. 엔진 평가가 정답이면 분배를 평가액에 맞춰 재입력 안내, 검증 메시지가 정확한 평가액을 표시하도록 T2가 보장.

## 7. 검토 정정 이력 (2026-05-29, 본 문서 자체 오류·누락 검토)

| # | 분류 | 내용 | 조치 |
|---|---|---|---|
| 1 | **누락(중대)** | ④ total 미설명 18M 잔차 = **R3 장례비 한도 dual-truth**(debtByHeir uncapped 1,233 vs deductedBeforeAggregation capped 1,215) | §2-5 신설 + §1 정밀분해 + 신규 T7 + 우선순위 재배치 |
| 2 | 정정(정밀화) | §1 ④ "①+②의 하류 합성"(부정확) → per-heir 5,797 = R1+R2 산술 폐합 / total 7,975 = R3 capped로 정밀 분해 | §1 검산 정밀 분해 표 |
| 3 | 정정(인용) | grossInheritance 인용 `:263-270`(categoryBreakdown 구성)만 → 조립 `:481-488` 병기 | §2-1 표 |
| 4 | 누락(구현 hazard) | `evaluateEstateItem`은 stock에 **throw**(`property-valuation.ts:340-342`) → T2 단건 평가 시 직접 호출 불가 | T2 ⚠️ O4 |
| 5 | 누락(영향) | T2 검증 엄격화 시 기존 저장 이력 신규 차단 가능 — 정확 평가액 표시로 교정 유도 | T2 ⚠️ O3 |
| 6 | **모순 정정** | T3(c) "Pattern B 전면 지양"(과일반화) → "엔진 총계 있으면 그것과 대조, 없으면 Σ인별 유지" / ㉡·⑮ 등 엔진총계 존재 행 명시 | T3 (b')(c) |
| 7 | 누락 | *5 부담비율 total=1.0 하드코딩 미검출 위험 | T3(d) |
| 8 | 누락 | T3 `allocationMismatch[]` 신규 result 필드 = echo-field-pattern·타입·14지점 ⑦ | T3 신규 result 필드 + DoD |
| 9 | 정정(모순) | §1 "합계열은 정확" 단정 → "엔진 권위값이나 합계·인별 기준 상이로 상호 불일치"로 정밀화(㉡ 합계조차 엔진 실제공제와 다름) | §1 검산 결론 |
| 10 | **추가 증상(image19)** | ⑩/⑫ §28 증여세액공제 per-heir 전부 0 → §28은 **집계(giftTaxPaid)** vs **인별(doneeId)** 2-레이어. ⑩/⑫=0은 R2 doneeId 게이트(②·⑩·⑫ 공통)의 직접 결과 — 집계 §28은 별도 작동 추정 | §2-6 신설 + R2 범위확장 + T8·T9 + [확인 필요] |
| 11 | 검증(strip 아님) | giftTaxPaid는 폼·Zod(`:389`)·API·auto-fill 모두 보유 → 데이터 흐름 온전. ⑫=0은 strip 아닌 doneeId/미입력 | §2-6 데이터 흐름 검증 |
| 12 | **누락(중대·세액영향, image20)** | ⑥·⑪·⑬·⑮·*5 세액 배부행이 **합계 비보존** — R1(+100)−R3(−18)=+82M로 Σbase(5,797M)≠분모(5,715M) → **전 배부행 ×1.01435 과다** → per-heir 산출세액 배부 +20.6M·부담비율 Σ=1.0141. **표시 아닌 실제 per-heir 납부세액 과다** | §2-2-B 신설 + 우선순위 세액영향 경고 |
| 13 | 누락(구조·N4) | 간접배부·산출세액 배부는 상속인별 독립 floor(`bigIntRoundDiv`)로 **잔액 흡수 없음** — `distributeByLegalShares`(③ 추정에 잔액 흡수 보유)와 비일관 | 신규 T10 (배부 총액 보존) |

### 7-1. 검토 cycle 1 추가 정정 (자체 재검토)

| # | 분류 | 내용 | 조치 |
|---|---|---|---|
| 14 | **모순** | §2-2-A Pattern B "항상 정합" 표가 ⑥㉡·⑪·⑮ 포함하나 §2-2-B는 이들 과다배부 — "자기정합 ≠ 엔진권위 정합" 경고가 ㉡만 언급 | §2-2-A Pattern B 위장 항목에 ⑥㉡·⑪·⑮ 명시 |
| 15 | **모순** | DoD "회귀 0"이 T7·T10·T2의 의도된 per-heir 값 변경과 충돌 | DoD에 "회귀 구분" — 타세목·구조 0, inheritance per-heir anchor는 재계산 |
| 16 | 정정(정밀) | "grossInheritance에서 파생되는 taxableValueShare" 부정확 — taxableValueShare는 `directEstateAmount`(estateByHeir, `:384`)에서 파생(grossInheritance와 병렬) | §2-2-A R1 전파 설명 정정 |
| 17 | 정정(과대주장) | ⑮ "≈1,394M" §28 미적용 가정 근사를 semi-authoritative처럼 사용 | ⑮ 行 註로 강등 + `result.finalTax` 실측 위임 |

### 7-2. 검토 cycle 2 추가 정정

| # | 분류 | 내용 | 조치 |
|---|---|---|---|
| 18 | **correctness** | T10 전제 "R1·R2·R3 선수정" 오류 — `indirectBase = taxableValueShare − giftAmount`로 giftAmount 상쇄(`:388·395`), R2(doneeId)는 ⑥/⑪ 총액 보존에 무관. **R1·R3(T2·T7)만 필요** | T10 전제 정정 |
| 19 | 명확화 | T3(a) 엔진 echo는 검증 우회 경로 전용(정상 흐름은 T2 선차단). 엔진 auto-clamp 안 함 명시 | T3(a) 보강 |

검토 결과 **사용자 증상 → 근본원인 R1·R2(확장: ②·⑩·⑫)·R3·R4(R2 환원)** + **N4(세액 배부 총액 비보존)** 로 재정의. image18 수치는 R1·R2·R3로, image20 세액 배부행(⑥·⑪·⑬·⑮·*5)은 R1·R3가 분배 비율을 ×1.01435 왜곡한 결과로 산술 폐합. **최대 신규 발견: per-heir 납부세액이 실제보다 1.435% 과다(표시 아닌 세액 오류)** — T2·T7·T10으로 해소. image19 ⑩/⑫=0은 R2 doneeId로 환원.

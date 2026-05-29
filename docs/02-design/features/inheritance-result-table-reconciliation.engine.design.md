# 상속세 결과 집계표 정합 수정 — 엔진 설계

> 계획서: [`docs/00-pm/inheritance-result-table-bugfix.plan.md`](../../00-pm/inheritance-result-table-bugfix.plan.md)
> UI 측: `inheritance-result-table-reconciliation.ui.design.md`
> 정책: 추정 금지. file:line 실측. 미확정 [확인 필요].

## Context

상속인별 집계표(`HeirAllocationSummaryTable` / `buildSummaryTable`)에서 **합계열과 인별열이 서로 다른 기준으로 산출**되어, 사용자가 입력한 협의분할·사전증여 데이터가 표 전반에서 불일치로 나타난다(image18·19·20). 검토 결과 4개 근본원인 + 1개 구조 결함으로 확정:

- **R1** 평가↔분배 dual-truth: 검증(`resolveEstateItemValue`)과 엔진(`evaluateAllEstateItems.valuatedAmount`, 담보 하한·주식 분기)이 다른 평가 함수 → 협의분할 합(650)이 엔진 평가(550)와 어긋나도 검증 통과 → 합계열(value)≠인별열(allocation).
- **R2** 사전증여 doneeId 미배부: `sumPriorGiftsByDonee`가 `!doneeId` 시 skip → ②·⑩·⑫ per-heir 일가족 전부 0.
- **R3** 장례비 한도 dual-truth: 인별 배부(`debtByHeir`)는 uncapped(`it.amount`), 엔진 과세가액 차감(`deductedBeforeAggregation`)은 capped(§14 식대 1천만·봉안 5백만) → ㉡ 합계(1,233)≠실제공제(1,215).
- **R4** §28 증여세액공제 2-레이어: 집계(`Σ giftTaxPaid`, doneeId 무관)는 **giftTaxPaid 입력 시** 작동, 인별 ⑩/⑫(doneeId 필수)는 R2로 0 → "공제 전혀 미반영" 오인. (집계 §28도 0이면 giftTaxPaid 미입력 — [확인 필요] T1).
- **N4** 배부 함수 총액 비보존: 간접배부·산출세액 배부가 상속인별 독립 floor(`bigIntRoundDiv`)로 **잔액 흡수 없음** + R1·R3로 Σbase≠분모 → 전 배부행 ×1.01435 과다 → **per-heir 납부세액 1.435% 과다 산출**(표시 아닌 세액 오류).

이전 한계: 검증·집계·표가 평가/한도/배부에 단일 진실을 공유하지 않아, 입력 데이터가 조용히 불일치 결과를 만들었고 검증이 이를 막지 못했다.

---

## ★ 케이스 인벤토리 (필수 — 행≥1, anchor 약속)

| # | 시나리오 | 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|------|-------------|-----------|------|
| 1 | 주식 협의분할 합(650) ≠ 엔진 평가(550) → **검증 차단** (R1·T2) | 상증법 §60·§66·§63② | image18 주식행 550/650 | `inheritance-validate-engine-valuation.test.ts` | ☐ TODO |
| 2 | 담보채권(securedClaim) > §60 평가 자산: 검증 expected = `max(평가, securedClaim)` = 엔진값 (R1·T2) | §66 하한 | probe(T1) | 상동 | ☐ TODO |
| 3 | 비상장 V2/avg×수량 주식: 검증 expected = computeStockValuation (R1·T2, `evaluateEstateItem` throw 회피) | §63 | 동형 fixture | 상동 | ☐ TODO |
| 4 | 장례비 식대 28M(한도 10M)·봉안 0 → ㉡ 합계 = deductedBeforeAggregation = per-heir 합 (R3·T7) | §14 | 계획 §2-5 | `inheritance-funeral-cap-allocation.test.ts` | ☐ TODO |
| 5 | 봉안 8M(한도 5M)+식대 3M → 항목별 한도 후 인별 안분 (R3·T7) | §14 시행령 | [확인 필요] isBongan 매핑 | 상동 | ☐ TODO |
| 6 | 사전증여 doneeId 설정 → ②·⑩·⑫ per-heir 동시 채움 (R2·T5) | §13·§28 | image19 | `inheritance-prior-gift-donee-allocation.test.ts` | ☐ TODO |
| 7 | doneeId 미설정 + giftTaxPaid>0 → 집계 §28 적용(finalTax 감소)·인별 ⑩/⑫=0 (R4·T8) | §28① | image19 | 상동 | ☐ TODO |
| 8 | 배부 총액 보존: ⑥㉡ Σ인별 == taxBase, ⑪ Σ == 산출세액, *5 Σ부담비율 == 1.0 (N4·T10, T2·T7 후) | §3 안분 | image20 검산 | `inheritance-allocation-conservation.test.ts` | ☐ TODO |
| 9 | floor 잔차 흡수: 분배 후 Σ(per-heir) == 총액 (±0원) — 최다분자 상속인 흡수 (N4·T10) | — | `feedback_floor_residual_absorption` | 상동 | ☐ TODO |
| 10 | 정합 불변식 가드: Pattern A 행 합계≠Σ인별 시 echo `allocationMismatch[]` (T3) | — | 자기일관성 | `inheritance-summary-reconciliation-guard.test.ts` | ☐ TODO |
| 11 | source-summary 합계열: avg×수량 주식이 표 합계에 반영 (T4) | §63 | 계획 §2-4 | `source-summary-stock-valuation.test.ts` | ☐ TODO |
| 12 | ㉠ 과세제외 ≠ 0(비과세·과세가액불산입) 케이스 합계↔인별 정합 [확인 필요] | §12 | (미발견) | (TODO) | ☐ |

---

## 법령 근거

`lib/tax-engine/legal-codes/inheritance-gift.ts` 상수 사용 강제.

```
상증법 §60   — 평가 원칙 (시가 → 보충적)
상증법 §63②  — 담보채권 자산 평가 특례
상증법 §66   — 저당권·전세권 설정 재산 평가 하한 (valuatedAmount = max(평가, securedClaim))
상증법 §14   — 채무·공과금·장례비 공제 (식대 1천만·봉안 5백만 한도)
상증법 §13   — 사전증여재산 가산 (10년/5년)
상증법 §28①  — 증여세액공제 (가산 증여재산 과세표준/상속세 과세표준 × 산출세액 안분 한도)
민법 §1009   — 법정상속분 (배부 안분·잔액 흡수 기준)
```

---

## 엔진 input 타입 — 변경 없음

기존 `InheritanceTaxInput` 유지. 본 수정은 **계산/검증/배부 로직과 result echo**만 변경하며 input 스키마는 불변.

## 엔진 result 타입 — `allocationMismatch[]` echo 추가 (T3)

```ts
// HeirAllocationResult (또는 InheritanceTaxResult.heirAllocationResult) 확장
// ⚠️ 엔진은 자산 단위(asset_allocation)만 echo. 표 단위(summary_row) 정합은
//    buildSummaryTable이 합계·Σ인별을 둘 다 가지고 display 레이어에서 로컬 계산
//    (엔진 round-trip 불필요) — kind를 asset_allocation으로 한정.
export interface AllocationMismatch {
  /** 불일치 자산 id */
  assetId: string;
  expected: number;   // 엔진 권위 평가액 valuatedAmountById
  actual: number;     // Σ heirAllocations.amount
  delta: number;      // actual − expected
}

export interface HeirAllocationResult {
  // ... 기존 필드 ...
  /** T3(a) 자산 단위 정합 가드 — 비면 정합. echo-field-pattern (산식 영향 0). */
  allocationMismatch?: AllocationMismatch[];
}
```

> echo-field-pattern: 계산 로직 불변, optional 필드로만 노출. JSON 직렬화 안전(array/Record, Map 금지 — `feedback_engine_result_map_json_loss`).
> 표 단위 가드(T3b)는 result echo 아닌 `buildSummaryTable`의 로컬 reconciliation(`Σ인별 vs 행.total`).

---

## 계산 알고리즘 (단계별 — 변경점 중심)

### T2 — 검증·엔진 평가 단일 진실화 (R1)
1. 엔진 `evaluateAllEstateItems(estateItems)` 결과 `valuatedAmountById: Map<id, number>`를 **단일 진실로 export**.
2. `validateEstateItemAllocations`의 expected를 `resolveEstateItemValue` → **`valuatedAmountById.get(item.id)`** 로 교체(담보 하한 §66·주식 분기 포함).
   - ⚠️ `evaluateEstateItem`은 stock에 throw(`property-valuation.ts:340-342`) → 단건 호출 금지, `evaluateAllEstateItems` 또는 카테고리 분기 헬퍼 경유.
3. **정합 메커니즘 (정밀)**: 인별 `grossInheritance`·`categoryBreakdown`은 **Σ allocations(사용자 협의분할 의도 존중)을 유지**하고, `categoryTotals`는 Σ `valuatedAmount`(엔진 평가)를 유지한다. T2가 바꾸는 것은 **검증 expected 뿐** — 검증이 `Σ allocations == valuatedAmount`를 강제하므로, 그 결과 grossInheritance(Σallocations) == categoryTotals(Σvalue)가 **간접 보장**된다. (allocation 산식을 value로 바꾸지 않음 — 협의분할 의도 보존.)
4. 엔진은 **auto-clamp 안 함** — 불일치는 검증 차단(정상 흐름) + T3 echo(우회 방어).

### T7 — 장례비 한도 인별 배부 단일화 (R3)
1. 엔진 STEP 3 `funeralDeduction = min(식대,1천만)+min(봉안,5백만)` 산식을 **헬퍼로 추출**(`computeFuneralDeduction`), 중복 정의 금지.
2. `debtByHeir`(`inheritance-allocation.ts:280`)의 funeral 항목을 **capped 금액**으로 인별 배부 → ㉡ 합계 = `deductedBeforeAggregation`.
3. 한도 적용 후 capped 총액을 협의분할(명시) 또는 법정상속분으로 안분(자동 안분 fallback 금지).

### T10 — 배부 함수 총액 보존 (N4)
1. 간접배부(`:393-402`)·산출세액 배부(`:408-414`)에 **잔액 흡수**(`distributeByLegalShares` `:93-115` 패턴: 최다 분자/마지막 상속인) 적용.
2. 보장: `Σ indirectTaxBaseShare == indirectNumerator`, `Σ computedTaxShare == distributableTax`, `Σ burdenRatio == 1.0`.
3. **전제: T2·T7 선수정** — R2(doneeId)는 무관(`indirectBase = taxableValueShare − giftAmount`에서 giftAmount 상쇄, Σ taxBaseShare는 doneeId가 direct↔indirect만 이동).

### T3 — 정합 불변식 가드 (방어선)
1. 자산 단위(엔진): `Σ heirAllocations.amount ≠ valuatedAmountById` → `allocationMismatch.push({assetId, expected, actual, delta})`.
2. 표 단위(display, `buildSummaryTable`): Pattern A·엔진총계 보유 Pattern B 행에서 `행.total ≠ Σ인별`(>floor 잔차) → 로컬 플래그(엔진 echo 아님 — 표가 양 값 보유).
3. 결과뷰 rose 배지(UI 위임). 개발 모드 console.warn.

### T4 — source-summary 합계열 (부차)
1. `resolveValuation`(`source-summary-helpers.ts:21`) → `resolveEstateItemValue`(또는 T2 통일 함수)로 교체.

### T5·T8·T9 — 사전증여 doneeId·§28 가시성 (R2·R4, lib/calc + UI)
- T5(엔진/검증): doneeId 설정 시 `sumPriorGiftsByDonee` 3 Map 동시 채움 → ②·⑩·⑫. doneeId 미지정 검증 경고(차단 아님).
- T8(UI): giftTaxPaid>0·doneeId 미지정 시 "집계 §28 반영됨" 안내 — 인별 0 오인 방지.
- T9(lib/calc): `prior-gift-lookup.ts:337` 자동조회 import 후 doneeId 매핑 유도(자동 확정 금지). giftTaxPaid=0+giftAmount>0 시 입력 누락 안내.
- 상세 UI → ui.design.

### T3(d) — *5 부담비율 (계획 §3 T3(d) 정합)
- `heir-allocation-summary.ts:466`의 *5 total `1.0` 하드코딩 → T10 후 `Σ burdenRatio == 1.0` 성립 시 표 단위 가드(T3b)가 잔차 검출. total을 `Σ인별`로 산출하거나 가드 범위 포함.

---

## Silent fallback / 자동 안분 후보 식별

- **장례비 한도 후 인별 안분(T7)**: 명시 협의분할 있으면 비율 환산, 없으면 법정상속분 — 자동 채움 금지.
- **allocation auto-clamp(T2/T3)**: 금지. 불일치는 검증 차단 + echo 경고만(`feedback_no_silent_apportion_fallback`).
- **잔액 흡수(T10)**: 자동 안분이 아니라 floor 잔차의 **결정적 귀속**(최다 분자) — 총액 보존 목적, 새 데이터 생성 아님. 허용.
- **doneeId(T5)**: 미지정 시 자동 추정 금지 — 검증 경고 + 배지로 명시 입력 유도.

---

## 테스트 약속

- 케이스 인벤토리 12행 → anchor. PDF/실측값 원단위 `toBe()`.
- **회귀 구분**: T2·T7·T10은 inheritance per-heir 값을 **의도적으로 변경**(과다배부 제거·capped). per-heir anchor는 법령 정합값으로 **재계산**(`feedback_anchor_correction_legal_priority`). aggregate(⑦·finalTax)·타 세목 anchor는 불변 확인.
- 자기일관성 anchor: 모든 Pattern A 행 `합계 == Σ인별`(T10 후 잔차 0), `Σ burdenRatio == 1.0`.
- Pre-Do(T1): `resolveEstateItemValue` vs `valuatedAmountById` 차이 probe → 실패 anchor 확보 후 디자인 환류.

---

## UI 통합 위임

- UI 명세: `inheritance-result-table-reconciliation.ui.design.md`.
- 엔진 시니어 책임: input(불변)·result(`allocationMismatch[]` echo) 타입 + 검증/배부/한도 로직.
- UI 시니어 책임(14지점 중): ⑦ 결과 카드 — (a) Pattern A·엔진총계 행 `allocationMismatch` rose 배지, (b) §28 가시성 안내(giftTaxPaid>0·doneeId 미지정 시 "집계 반영됨"), (c) doneeId 미지정 안내 배지(②·⑩·⑫), (d) ㉡ 채무 행 capped 값 표시(T7 후), (e) *5 부담비율 합계 표시(T10 후 1.0). ⑧ validation(T2 expected 통일·doneeId 경고). 상세 → ui.design.

---

## 파일 영향·800줄 정책

| 파일 | 현재 | 변경 | 점검 |
|---|---|---|---|
| `lib/tax-engine/inheritance-allocation.ts` | 524줄 | T7(funeral capped 배부)·T10(잔액 흡수)·T3(a) echo | 800줄 근접 시 배부 헬퍼 분리 |
| `lib/tax-engine/inheritance-tax.ts` | — | `computeFuneralDeduction` 헬퍼 추출(T7)·valuatedAmountById export(T2) | 헬퍼는 별 파일 가능 |
| `lib/calc/inheritance-validate.ts` | — | T2 expected 통일·doneeId 경고 | — |
| `lib/calc/heir-allocation-summary.ts` | — | T3(b) 표 단위 로컬 reconciliation·*5 total | — |
| `components/calc/results/source-summary/source-summary-helpers.ts` | — | T4 resolveValuation 교체 | — |
| `types/inheritance-gift.types.ts` | — | `AllocationMismatch`·`allocationMismatch?` | — |

신규 Date 필드 없음 → date-coerce 무관.

## 의존·순서 (계획 §5)

T1 → T2(R1) → T7(R3) → **T10(N4)** → T5(R2) → T8(R4 가시성) → T9 → T3(가드) → T4 → T6(e2e). T1 선행 없이 T2 금지.

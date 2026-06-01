# 상속세 영리법인 ⑩a 「증여세 산출세액」 미표시 버그 수정계획서

- **작성일**: 2026-06-01
- **상태**: Plan (Pre-Do anchor 실증 완료)
- **세목**: 상속세 — 상속인별 배부 표(이미지8) ⑩a/⑩b/⑩c 영리법인 §3의2② 면제 명세
- **법령 근거**: 상증법 §3의2②(영리법인 면제 — **⑩ 그룹**) · §13②(가산 증여재산) · §28①(증여세액공제 안분 한도 — **⑫ 그룹, 자연인**) · 집행기준 28-0-1
  - ⚠️ 본 버그는 **⑩ 그룹(영리법인 §3의2②) 한정**. ⑫ 그룹(자연인 §28)은 무관·무변경.
- **관련 메모리**: `feedback_ui_engine_dual_truth_avoidance.md` ★★★ · `feedback_engine_result_display_drift.md` ★★★ · `feedback_numeric_impact_verify_before_bug_claim.md` ★★★ · `single-source-engine-helper`

---

## §0. 증상 (사용자 보고 — 이미지8)

상속인별 상속세부담액 집계 표(`HeirAllocationSummaryTable`)의 영리법인 §3의2② 면제 명세에서:

| 행 | 라벨 | 합계열 | 영리법인열 | 기대 |
|---|---|---|---|---|
| ⑩a | 증여세 산출세액 | — | **0** | 150,000,000 |
| ⑩b | 공제 한도 | 277,943,123 | 272,874,251 | — |
| ⑩c | 공제할 증여세액 = Min(⑩a, ⑩b) | 150,000,000 | 150,000,000 | — |

**모순**: ⑩c = Min(⑩a, ⑩b)인데 ⑩a=0이면 ⑩c=0이어야 하나 150,000,000이 표시됨. → ⑩a와 ⑩c가 **서로 다른 데이터 소스**를 읽음(dual-source).

> "상속인외" = 영리법인. `GiftRowEditor.tsx:368`의 입력 라벨 "⑩a 상속인외 증여세 산출세액"이 `isCorporate`일 때만 노출되는 것과 정합.

---

## §1. 근본 원인 (코드 실측 + Pre-Do anchor 실증)

### 1-1. dual-source 구조

| 표시값 | 소스 | 코드 위치 | 결과 |
|---|---|---|---|
| **⑩a** `perHeir[corp].priorGiftComputedTax` | **`Heir.corporateGiftComputedTax`** | `inheritance-allocation.ts:485` | **0** |
| ⑩c `corporateExemption.amount` | **`PriorGift.corporateGiftComputedTax`** 합산 | `inheritance-tax.ts:569-572` → `inheritance-corporate-exemption.ts:105` | 150,000,000 |

- 사용자는 `GiftRowEditor`(사전증여 행 편집기)에서 영리법인 증여세 산출세액을 입력 → **`PriorGift.corporateGiftComputedTax`**에 저장(`GiftRowEditor.tsx:147`).
- `Heir.corporateGiftComputedTax`(Heir 객체의 동명 필드)는 **입력 UI가 없음**:
  - `HeirComposition.tsx`는 corporate로 관계 변경 시 이 필드를 `undefined`로 정리(line 109)할 뿐, 입력 위젯 부재. (grep 전수: 79·109 주석·초기화만)
  - `inheritance-api.ts:81`은 `heirs: input.heirs` 통째 spread — PriorGift→Heir 전달 없음.
- → **`Heir.corporateGiftComputedTax`는 항상 `undefined`** → ⑩a 항상 0.
- 타입 주석(`inheritance-allocation-result.types.ts:79-80`)이 "corp: Heir.corporateGiftComputedTax"로 **설계 의도를 명시**하나, 그 필드는 채워지는 경로가 없는 **죽은 필드**.

### 1-2. Pre-Do anchor 실증 결과 (throwaway probe, 정책 `feedback_numeric_impact_verify_before_bug_claim` 준수)

corporate heir + doneeId 매칭 + `PriorGift.corporateGiftComputedTax=150,000,000` 입력 후 `calcInheritanceTax` 실행:

```
⑩a perHeir[corp].priorGiftComputedTax   = 0            ← 버그 재현
⑩b perHeir[corp].priorGiftCreditLimit   = 288,017,324  (산식 정상 작동)
⑩c corporateExemption.amount            = 150,000,000  (정상)
```

→ 이미지와 동일한 모순 실증. **산식·면제계산은 정상이며, ⑩a echo 필드만 잘못된 소스를 읽는 표시 버그**임을 확인.

---

## §2. 케이스 인벤토리

| # | 케이스 | 현행 ⑩a | 수정 후 ⑩a | 비고 |
|---|---|---|---|---|
| C-1 | 단일 영리법인 + doneeId 설정 (이미지8) | 0 ✗ | PriorGift 합산 ✓ | 핵심 대상 |
| C-2 | 다수 영리법인 + 각 doneeId | 0 ✗ | corporate별 doneeId 합산 ✓ | doneeId 분리 |
| C-3a | doneeId 미설정 영리법인 (heirs에 corporate 없음) | (배부 표 행 없음) | (행 없음, 변화 없음) | 면제는 §3의2② 발동·부표5 별도 |
| C-3b | corporate heir + gift doneeId 미설정 | 0 | 0 | **정상 흐름 미발생** — corporate `doneeId`는 validate 필수(`inheritance-validate.ts:128-130`). API 직접 호출 우회 시만 가능하며, Map 키 미생성 → fallback 0으로 무해(매칭 없으면 부표5 행도 미생성) |
| C-4 | 자연인 사전증여(상속인·수유자) | giftTaxPaid 합산 | **무변경** | 회귀 보호 — corporate 분기만 수정 |
| C-5 | §13 도과 영리법인 | 0 | 0 (cutoff 제외 유지) | `cutoffFilteredGifts` 전달로 자동 제외 |

---

## §3. 수정 방안 — 단일 진실(PriorGift)로 통일

**원칙**: ⑩c·면제계산이 이미 단일 진실로 쓰는 `PriorGift.corporateGiftComputedTax`를 ⑩a도 동일하게 읽는다. `Heir.corporateGiftComputedTax`는 레거시 fallback으로만 잔류.

### 변경 1 — `sumPriorGiftsByDonee`에 corporate 산출세액 집계 추가

`lib/tax-engine/inheritance-allocation.ts` (line 242-269)

```ts
function sumPriorGiftsByDonee(priorGifts: PriorGift[]): {
  amountByDonee: Map<string, number>;
  taxBaseByDonee: Map<string, number>;
  computedTaxByDonee: Map<string, number>;
  corporateComputedTaxByDonee: Map<string, number>; // 신규 — ⑩a 단일 진실
} {
  // ... 기존 3개 Map ...
  const corporateComputedTaxByDonee = new Map<string, number>();
  for (const gift of priorGifts) {
    if (!gift.doneeId) continue;
    // ... 기존 합산 ...
    corporateComputedTaxByDonee.set(
      gift.doneeId,
      (corporateComputedTaxByDonee.get(gift.doneeId) ?? 0) +
        (gift.corporateGiftComputedTax ?? 0),
    );
  }
  return { amountByDonee, taxBaseByDonee, computedTaxByDonee, corporateComputedTaxByDonee };
}
```

### 변경 2 — corporate 분기 ⑩a 소스 교체

`lib/tax-engine/inheritance-allocation.ts:485`

```ts
// 변경 전
priorGiftComputedTax: heir.corporateGiftComputedTax ?? 0, // ⑩a

// 변경 후 (PriorGift 우선, 레거시 Heir fallback)
priorGiftComputedTax:
  corporateComputedTaxByDonee.get(heir.id) ??
  (heir.corporateGiftComputedTax || 0), // ⑩a — PriorGift 단일 진실
```

- `??`는 null/undefined만 fallback. Map에 키가 있으면(doneeId 매칭 gift 존재) 그 합산값 사용 — corporate validate가 `corporateGiftComputedTax > 0` 필수(`inheritance-validate.ts:121`)이므로 0 잔재 없음. doneeId 미매칭(C-3b)이면 키 미생성 → undefined → fallback 0.
- `calcHeirAllocation` 본문에서 구조분해(line 418)에 `corporateComputedTaxByDonee` 추가.
- `cutoffFilteredGifts`가 전달되므로(`inheritance-tax.ts:703`) §13 도과분 자동 제외 → 면제계산(STEP10, 동일 cutoff)과 정합(C-5).
- **개선 권장**: `Heir.corporateGiftComputedTax`(타입 line 574)는 입력 경로 없는 죽은 필드 → `@deprecated` 주석 추가(fallback만 유지, 향후 제거 후보).

### 변경 안 함
- 엔진 산식·면제 한도·결정세액·corporateExemption — 무변경 (이미 PriorGift 기반).
- 입력 폼·API·validate — 무변경 (`PriorGift.corporateGiftComputedTax`는 이미 입력·`inheritance-validate.ts:121` 필수 검증).

---

## §4. 영향 범위 (14 동기화 지점)

| 지점 | 변경 | 사유 |
|---|---|---|
| ①②③ 폼/initial/normalize | ✗ | PriorGift 필드 기존 존재 |
| ④ API 변환 | ✗ | PriorGift 그대로 전달 |
| ⑤ UI 입력 위젯 | ✗ | GiftRowEditor 기존 입력 |
| ⑥ 사이드바 | ✗ | 영향 없음 |
| **⑦ 결과 카드** | **✓** | `HeirAllocationSummaryTable` ⑩a 영리법인열 정정(0→150M) **+ ⑩a 합계열도 자동 정정**(현행 `—` → 150,000,000, `buildSummaryTable:388-396` Σ corporate `priorGiftComputedTax`). 엔진 echo 수정으로 자동 반영, **컴포넌트 수정 0** |
| ⑧ validation | ✗ | 기존 corporate 필수 검증 유지 |
| ⑨~⑭ Zod/Route | ✗ | 입력 구조 무변경 |

→ **엔진 echo 1곳(`inheritance-allocation.ts`)만 수정**. UI·API·타입 무변경.

---

## §5. anchor 계획

`__tests__/tax-engine/inheritance/corporate-prior-gift.test.ts`에 추가:

- **ANCHOR-CORP-10A-1** (C-1): corporate heir + doneeId + `corporateGiftComputedTax=150,000,000`
  → `result.heirAllocationResult.perHeir[corp].priorGiftComputedTax === 150_000_000` (현행 0 → 수정 후 150M)
- **ANCHOR-CORP-10A-2** (자기일관성, **단일 영리법인 한정**): `corporateExemption.amount === Math.min(perHeir[corp].priorGiftComputedTax, perHeir[corp].priorGiftCreditLimit)`
  → ⑩c = Min(⑩a, ⑩b) 모순 해소 검증. ※ 다수 영리법인 시 `corporateExemption.amount`는 전체 합 기준 Min이므로 perHeir별 Min과 불일치 — CORP-10A-3에서 별도 검증
- **ANCHOR-CORP-10A-3** (C-2): 영리법인 2개 각 doneeId → 각 corporate별 ⑩a 분리 합산 확인
- **ANCHOR-CORP-10A-4** (C-5 회귀): §13 도과 영리법인 → ⑩a=0 유지(cutoff)

PDF 종합사례(책 1866) 통합 anchor — `comprehensive-case-pdf.test.ts`에 ⑩a=150,000,000 echo 검증 추가 검토.

---

## §6. 회귀 검증

```bash
npx vitest run __tests__/tax-engine/inheritance/        # corporate·allocation·summary 직접
npx vitest run __tests__/lib/calc/                      # heir-allocation-summary 변환
npm test                                                 # 전체 (공유 모듈 영향 확인)
npx tsc --noEmit                                         # 타입 0건
```

기존 `corporate-prior-gift.test.ts` 9개 anchor 전부 GREEN 유지 필수 (C-4 자연인 회귀 포함).

---

## §7. 인접 관찰 (별개 이슈 — 사용자 결정 필요, 본 PR 범위 외)

이미지에서 발견된 추가 불일치. 본 ⑩a 수정과 독립.

### 관찰-1: ⑩b 합계열 ≠ 영리법인열 (할증 포함/미포함 불일치)
- ⑩b **합계열** 277,943,123 = `corporateExemptionLimitDisplay`(`inheritance-tax.ts:721`) = `floor((computedTax + generationSkipSurcharge) × corporateGiftTaxBase / taxBase)` — **세대생략 할증 포함**.
- ⑩b **영리법인열** 272,874,251 = `corpLimit`(`inheritance-allocation.ts:461-464`) = `floor(computedTax × giftTaxBase / taxBase)` — **할증 미포함**.
- PDF 책 1866 정답·`calcCorporateExemption` limit·`ANCHOR-CORP-3`은 모두 **할증 미포함(272,874,251)**.
- 이미지 합계열 277,943,123과 영리법인열 272,874,251의 차이(5,068,872)가 정확히 할증 기여분인지는 **PDF 종합사례 세대생략 할증액으로 확인 필요** (코드 산식 차이 — total은 할증 포함, perHeir는 미포함 — 은 실측 확정).
- → 합계열 산식의 할증 포함이 perHeir·엔진·PDF와 불일치. **합계열을 할증 미포함으로 통일** 검토 권장.

### 관찰-2: 다수 영리법인 시 ⑩c perHeir 중복 표시
- `heir-allocation-summary.ts:419-422`: 모든 corporate 행에 `corporateExemption.amount`(전체 면제액)를 동일하게 표시.
- 영리법인 2개 이상이면 각 행에 전체 면제액이 중복 노출. 단일 영리법인(이미지)은 무해.
- → `perCorporateBreakdown[].exemptionAmount`(corporate별 안분, `inheritance-corporate-exemption.ts:160-164`)를 doneeId 매칭해 표시하도록 수정 검토.

---

## §8. 정책 정합

- `feedback_ui_engine_dual_truth_avoidance.md` ★★★ — UI/echo가 엔진 단일 진실(PriorGift)을 import, 별도 소스(Heir 죽은 필드) 재참조 제거.
- `feedback_engine_result_display_drift.md` ★★★ — 엔진 면제계산(⑩c)과 표시 필드(⑩a) 소스 일관성 회복. 자기일관성 anchor(CORP-10A-2)로 강제.
- `feedback_numeric_impact_verify_before_bug_claim.md` ★★★ — Pre-Do probe로 ⑩a=0 실증 후 단정 (§1-2).
- `single-source-engine-helper` — corporate 산출세액 단일 출처 = `PriorGift.corporateGiftComputedTax`(doneeId 합산).
- `feedback_pdf_example_test_anchoring.md` — PDF 책 1866 150,000,000 원단위 `toBe()` anchor.

---

## §9. 작업 순서 (Do)

1. **Pre-Do anchor 작성** — CORP-10A-1을 먼저 작성·실행하여 RED 확인 (현행 0).
2. 변경 1·2 적용 (`inheritance-allocation.ts`).
3. CORP-10A-1~4 GREEN 확인.
4. `npx vitest run __tests__/tax-engine/inheritance/` + `npm test` 회귀 0.
5. `npx tsc --noEmit` 0건.
6. 브라우저 E2E (`e2e/*.spec.ts`) — 영리법인 사전증여 입력 → 결과 ⑩a=⑩c 입력값 표시 확인 (정책 `feedback_browser_verify_with_playwright`).
7. 인접 관찰(§7)은 별도 후속 PR로 분리 — 사용자 확인 후 착수.

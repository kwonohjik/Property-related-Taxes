# [Engine Design] 영리법인 ⑩a 「증여세 산출세액」 단일 진실(PriorGift) 정정

- **계획서**: `docs/00-pm/inheritance-corporate-besshi-10a-source-fix.plan.md`
- **세목**: 상속세 — 상속인별 배부 표 ⑩ 그룹(영리법인 §3의2② 면제 명세)
- **법령**: 상증법 §3의2②(영리법인 면제) · §13②(가산 증여재산) · 집행기준 28-0-1
- **변경 범위**: `lib/tax-engine/inheritance-allocation.ts` echo 소스 1곳 + anchor. UI·API·타입 구조 무변경.

---

## §1. 문제 정의

배부 표 ⑩a(`perHeir[corp].priorGiftComputedTax`)가 `Heir.corporateGiftComputedTax`(입력 경로 없는 죽은 필드)를 읽어 **항상 0**. 반면 ⑩c·면제계산은 `PriorGift.corporateGiftComputedTax`(GiftRowEditor 입력, doneeId 합산)를 정확히 읽어 150,000,000. → ⑩c=Min(⑩a, ⑩b) 모순.

**Pre-Do anchor 실측**: `⑩a=0 / ⑩b=288,017,324 / ⑩c=150,000,000` (calcInheritanceTax probe).

---

## §2. 케이스 인벤토리 (행 ≥ 1 필수)

| # | 입력 조건 | 현행 ⑩a | 수정 후 ⑩a | 검증 anchor |
|---|---|---|---|---|
| D-1 | 단일 영리법인 + doneeId + `corporateGiftComputedTax=150M` | 0 ✗ | 150,000,000 ✓ | CORP-10A-1 |
| D-2 | 단일 영리법인 자기일관성 ⑩c=Min(⑩a,⑩b) | 깨짐(0 vs 150M) | 일치 | CORP-10A-2 |
| D-3 | 영리법인 2개 각 doneeId(150M·80M) | 0·0 ✗ | 150M·80M ✓ | CORP-10A-3 |
| D-4 | §13 도과(5년+1일) 영리법인 | 0 | 0 (cutoff 제외 유지) | CORP-10A-4 |
| D-5 | 자연인 사전증여(상속인/수유자) | giftTaxPaid 합 | **무변경** | 기존 CORP-1·5·6 회귀 |
| D-6 | corporate doneeId 미설정 | (validate 차단) | (정상 흐름 미발생) | — |

---

## §3. 데이터 흐름

```
[입력]  GiftRowEditor (isCorporate)
          → PriorGift.corporateGiftComputedTax  ← 단일 진실
[검증]  inheritance-validate.ts:121,128 (corporateGiftComputedTax>0 + doneeId 필수)
[전달]  inheritance-api.ts → route → calcInheritanceTax
[필터]  STEP 4.5 cutoffFilteredGifts (§13 도과 제외)
[엔진]  ┌ STEP 10 corporateExemption = Min(Σ corporateGiftComputedTax, limit)   ← ⑩c (정상)
        └ STEP 13 calcHeirAllocation(priorGifts: cutoffFilteredGifts)
              perHeir[corp].priorGiftComputedTax                                ← ⑩a (수정 대상)
[표시]  buildSummaryTable → ⑩a 영리법인열 + ⑩a 합계열(Σ corporate)
          → HeirAllocationSummaryTable
```

수정 핵심: ⑩a echo 소스를 `Heir.corporateGiftComputedTax` → **doneeId 매칭 `PriorGift.corporateGiftComputedTax` 합산**으로 교체. ⑩c와 동일 단일 진실 공유 → 모순 해소.

---

## §4. 구현 상세

### 4-1. `sumPriorGiftsByDonee` 반환 확장 (line 242-269)

```ts
function sumPriorGiftsByDonee(priorGifts: PriorGift[]): {
  amountByDonee: Map<string, number>;
  taxBaseByDonee: Map<string, number>;
  computedTaxByDonee: Map<string, number>;        // 자연인 §28 (gift.giftTaxPaid)
  corporateComputedTaxByDonee: Map<string, number>; // 신규 — 영리법인 ⑩a (gift.corporateGiftComputedTax)
} {
  // ...기존 3 Map...
  const corporateComputedTaxByDonee = new Map<string, number>();
  for (const gift of priorGifts) {
    if (!gift.doneeId) continue;
    // ...기존 합산...
    corporateComputedTaxByDonee.set(
      gift.doneeId,
      (corporateComputedTaxByDonee.get(gift.doneeId) ?? 0) + (gift.corporateGiftComputedTax ?? 0),
    );
  }
  return { amountByDonee, taxBaseByDonee, computedTaxByDonee, corporateComputedTaxByDonee };
}
```

### 4-2. corporate 분기 ⑩a 교체 (line 485)

```ts
// before
priorGiftComputedTax: heir.corporateGiftComputedTax ?? 0,
// after
priorGiftComputedTax:
  corporateComputedTaxByDonee.get(heir.id) ?? (heir.corporateGiftComputedTax || 0),
```

- `calcHeirAllocation` 본문 구조분해(line 418)에 `corporateComputedTaxByDonee` 추가.
- 자연인 분기(line 532·584 `giftTaxPaid`) **무변경**.
- 자연인 gift도 Map 순회 대상이나 `corporateGiftComputedTax`가 undefined(→0)이므로 자연인 doneeId 키 값은 0. corporate 분기에서만 이 Map을 읽으므로 **무해**(자연인 ⑫a는 별도 `computedTaxByDonee` 사용).

### 4-3. 타입 (변경 없음, 주석만)

`Heir.corporateGiftComputedTax`(line 574)에 `@deprecated — 입력 경로 없음. ⑩a는 PriorGift.corporateGiftComputedTax 사용. fallback 잔류.` 주석 추가.

---

## §5. echo 자동 반영 (UI 수정 0)

| 표시 | 소스 | 수정 후 |
|---|---|---|
| ⑩a 영리법인열 | `perHeir[corp].priorGiftComputedTax` | 0 → 150,000,000 |
| ⑩a 합계열 | `buildSummaryTable:388` Σ corporate `priorGiftComputedTax` | `—` → 150,000,000 |
| ⑩c | `corporateExemption.amount` (무변경) | 150,000,000 (이미 정상) |

`buildSummaryTable`·`HeirAllocationSummaryTable`·`HeirAllocationTable` **코드 수정 0** — 엔진 echo가 자동 반영.

> **디자인 검토 결론(UI 누락 점검)**: 본 작업은 순수 엔진 echo 소스 정정으로 UI 컴포넌트 변경이 0이므로 별도 `.ui.design.md` 불요. ⑩a 라벨("증여세 산출세액")·⑩c 산식("= Min(⑩a, ⑩b)")·합계열 `fmt()`가 모두 기존 존재하여 값만 정상 표시됨.

---

## §6. anchor 매트릭스

| anchor | 케이스 | 단언 |
|---|---|---|
| CORP-10A-1 | D-1 | `perHeir.corp1.priorGiftComputedTax === 150_000_000` |
| CORP-10A-2 | D-2 | `corporateExemption.amount === Math.min(⑩a, ⑩b)` (단일 한정) |
| CORP-10A-3 | D-3 | `corp1=150M`, `corp2=80M` 분리 |
| CORP-10A-4 | D-4 | 도과 → `priorGiftComputedTax ?? 0 === 0` |
| 회귀 | D-5 | 기존 `corporate-prior-gift.test.ts` 9건 GREEN |

추가: `comprehensive-case-pdf.test.ts` ⑩a=150,000,000 echo 검증 검토.

---

## §7. 회귀 / 완료 기준

```bash
npx vitest run __tests__/tax-engine/inheritance/
npx vitest run __tests__/lib/calc/heir-allocation-summary.test.ts
npm test
npx tsc --noEmit
```

- [ ] CORP-10A-1~4 GREEN, 기존 corporate anchor 회귀 0
- [ ] tsc 0건
- [ ] e2e: 영리법인 사전증여 입력 → 결과 ⑩a=⑩c 표시 확인

---

## §8. 범위 외 (별도 후속)

- 관찰-1: ⑩b 합계열(할증 포함) ≠ 영리법인열(할증 미포함). PDF는 할증 미포함 정답.
- 관찰-2: 다수 영리법인 시 ⑩c perHeir 전체 면제액 중복 표시.

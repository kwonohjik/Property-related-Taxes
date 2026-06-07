# §53의2 사전증여 입력 (§24③·§19 분자) — UI 설계

> 계획서: `docs/00-pm/inheritance-section24-marriage-birth-deduction.plan.md`
> 엔진 설계: `docs/02-design/features/inheritance-section24-marriage-birth-deduction.engine.design.md`
> 작성일: 2026-06-07 / 13단계 자가검토 STEP 12

## Context

상속세 마법사 **사전증여 입력(Step 3)**의 각 증여 건에 §53의2(혼인·출산 증여재산공제, 직계존속, 통합 1억) 적용액을 입력받아, §24③·§19 분자 자동 도출이 §53의2를 차감하도록 한다. `giftTaxBase` 명시 건은 이미 전체 공제 반영 → §53의2 입력 불요.

위치: `steps.tsx:358` `Step3` → `components/calc/PriorGiftInput.tsx` → `components/calc/prior-gift/GiftRowEditor.tsx`(건별 편집). `PriorGift`는 엔진 타입 import → FormState 자동 반영.

---

## UI 위젯 (지점 ⑤) — GiftRowEditor 내 §53의2 섹션

```
증여일 / 수증자 선택 / 관계 / 증여재산가액(giftAmount)
─── 직계존속(lineal_ascendant_*) AND !giftTaxBase 일 때만 노출 ───
┌─ [sky 섹션카드] §53의2 혼인·출산 증여재산공제 (직계존속 한정) ─┐
│  CurrencyInput "§53의2 적용액 (혼인·출산 합산 최대 1억)"        │
│    value = gift.marriageBirthDeduction                          │
│    hint: "직계존속으로부터 혼인일 전후 2년 / 출생·입양 2년 내    │
│          증여에 적용된 §53의2 공제액. 합산 1억 한도."           │
└────────────────────────────────────────────────────────────────┘
[giftTaxBase 입력된 건] → 위젯 숨김 + "과세표준 직접 입력 시 §53의2 포함 이미 반영" 안내
```

- 게이트: `isMarriageBirthEligibleRelation(gift.doneeRelation)`(`gift-deductions.ts:99`) AND `!gift.giftTaxBase`.
  - ⚠️ **엔진 export 선행 필요**: `isMarriageBirthEligibleRelation`은 현재 미export(`function` only) → 엔진 시니어가 `export` 추가 후 UI import (`single-source-engine-helper` — UI 재정의 금지).
- `CurrencyInput`(원·정수). placeholder 숫자 예시 금지. 단위 hint로.
- 토글 아님 — 관계·giftTaxBase 조건 자동 노출 (sky 섹션카드).

---

## 동기화 지점

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| ① 폼 타입 | `types/inheritance-prior-gift.types.ts` | `marriageBirthDeduction?: number` (엔진 §4.1, UI 자동 반영) |
| ② initial | `components/calc/prior-gift/meta.ts:124` `makeEmptyGift()` | `marriageBirthDeduction: undefined` |
| ③ normalize | `lib/calc/prior-gift-auto-tax.ts:82` `applyCorporateGiftTaxFallback` | spread(`...g`) 보존 확정 — **무변경**(strip 없음) |
| ④ API 변환 | `InheritanceTaxForm.tsx:409~452` `normalizedPriorGifts` spread | spread 자동 — grep 점검 |
| ⑤ UI 위젯 | `prior-gift/GiftRowEditor.tsx` | 위 sky 섹션 (직계존속 AND !giftTaxBase) |
| ⑥ 사이드바 | — | 영향 없음 |
| ⑦ 결과 카드 | `InheritanceTaxResultView` §24 detail | `priorGiftDeductionTotal` echo 자동 반영. "§53의2 포함" 표기(선택) |
| ⑧ validation | `lib/calc/inheritance-validate.ts:197` `validatePriorGift` | (a) `marriageBirthDeduction > 1억` 차단 (b) 비직계존속 입력 차단 (c) `giftTaxBase` 동시 입력 시 §53의2 무시 안내(경고) |
| ⑨⑫ Zod | `lib/validators/property-valuation-input.ts:383` `priorGiftSchema` | `marriageBirthDeduction: z.number().nonnegative().optional()` |
| ⑭ Route | `app/api/calc/inheritance/route.ts` (preGiftsWithin10Years 매핑) | spread 자동 — grep 확인 |

---

## validation 상세 (지점 ⑧)

```
validatePriorGift(gift):
  if gift.marriageBirthDeduction != null:
    1. > 100,000,000 → "§53의2 혼인·출산 증여재산공제는 합산 최대 1억원입니다." (per-gift)
    2. doneeRelation ∉ {lineal_ascendant_adult, lineal_ascendant_minor}
       → "§53의2는 직계존속으로부터 받은 증여에만 적용됩니다."
    3. gift.giftTaxBase != null (동시 입력)
       → 경고(차단 아님): "과세표준이 입력되어 §53의2는 무시됩니다(이미 반영)."
```
> per-donee 합산 1억 캡은 v1 미적용(엔진 per-gift 캡과 동일 정책, 계획 §3).

---

## 범위 밖
- 상속세 모드 `giftTaxBase` 직접 입력 UI (별도 후속)
- 혼인/출산 분리 입력 (총액 단일 필드)
- §53의2 결과 카드 전용 세분 표시 (echo로 충분)

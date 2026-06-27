# 예금·저금·적금 §63④ 평가 — UI 설계문서

> 상위 계획: [`inheritance-deposit-valuation-63-4.design.md`](./inheritance-deposit-valuation-63-4.design.md)
> 엔진: [`inheritance-deposit-valuation-63-4.engine.design.md`](./inheritance-deposit-valuation-63-4.engine.design.md)
> 본 문서: 위젯 트리·testid·바인딩·결과뷰·사이드바.

## 1. 컴포넌트 분리

| 파일 | 변경 | 비고 |
|---|---|---|
| `estate-card/variants/EstateBodyFinancial.tsx` | **신설** | category="financial" 전용 |
| `estate-card/variants/index.ts:36` `pickBodyVariant` | `financial → EstateBodyFinancial` | 기존 `→ EstateBodySimple`에서 변경 |
| `EstateBodySimple.tsx` | financial 키 제거, `cat: "cash"|"other"` | dead code(잘못된 "§62" hint 포함) 제거 |
| `EstateBodyDeposit.tsx` | **변경 없음** | category="deposit"(전세보증금) — 무관 |

## 2. EstateBodyFinancial 위젯 트리 (ASCII)

```
┌─ 예금·저금·적금 평가 ──────────────────────────────────┐
│ [자산명 ___________________]  (select-on-focus)         │
│                                                          │
│ ① 평가방법   RadioCardGroup tone="emerald"               │
│   ( ) 잔액평가        ( ) §63④ 정밀평가                  │
│       testid=savings-mode-balance / -statutory           │
│   ※ "정밀평가" 선택 → savingsValuationMode="auto"(기본).  │
│      store에 "statutory" 저장 안 함(3-state, M-2)         │
│                                                          │
│ ─ balance ─                                              │
│   [예입잔액 ___________] 원   (marketValue)              │
│                                                          │
│ ─ statutory(auto|manual) ─                               │
│   [예입원금 ___________] 원   savingsPrincipal           │
│                                                          │
│   ② 미수이자  RadioCardGroup tone="sky"                  │
│     ( ) 자동계산    ( ) 직접입력                          │
│         testid=savings-accrual-auto / -manual            │
│                                                          │
│   ─ auto ─                                               │
│     [연이자율 __.__] %   savingsAnnualRate (DecimalInput)│
│     [이자기산일 ____-__-__]  savingsStartDate (DateInput) │
│     [원천징수세율 __.__] %  savingsWithholdingRate=14    │
│     ▸ 평가기준일: 2008-05-01 (상속개시일, 자동)  ← echo  │
│     [✓] 지방소득세 포함  ToggleCard tone="sky"           │
│         savingsIncludeLocalTax                            │
│     ┌ 미리보기 (표시전용) ─────────────────┐            │
│     │ 미수이자      41,780,822             │            │
│     │ 원천징수세액   6,434,246             │            │
│     │ 평가액     1,035,346,576             │            │
│     └────────────────────────────────────┘            │
│                                                          │
│   ─ manual ─                                             │
│     [미수이자 ___________] 원  savingsAccruedInterest    │
│     [원천징수세액 _________] 원 savingsWithholdingTax    │
└──────────────────────────────────────────────────────────┘
```

## 3. 바인딩·정책 준수

| 항목 | 적용 |
|---|---|
| 토글 | RadioCardGroup/ToggleCard 필수(native 금지). OFF도 tone 유지 |
| tone | 평가방법 emerald · 미수이자/지방세 sky (Tailwind 정적 — dynamic bg-${} 금지) |
| 날짜 | DateInput(`savingsStartDate`) — `<input type=date>` 금지 |
| 소수 | DecimalInput(율) |
| 포커스 | 전체선택(select-on-focus) |
| placeholder | 숫자 예시 금지 — 형식설명은 FieldCard hint |
| "원" | 결과·산식에 "원" 접미사 금지 (입력 unit 라벨만) |
| 평가기준일 echo | `mode==='inheritance'`→"상속개시일" / `'gift'`→"증여일". `VariantProps.valuationDate`(types.ts:15)·`.mode`(types.ts:18) |
| 미리보기 | `valuationDate` 있을 때 `computeSavingsAccrual` 직접호출(표시전용, submit 경로 아님). EstateBodySuperficies useMemo 동형 |

## 4. 평가기준일 echo 데이터 경로 (실측 확인됨)

```
InheritanceTaxForm/GiftTaxForm
  → Step1Estate.tsx:96 (deathDate)  /  gift-tax-form-shared.tsx:398 (giftDate)
  → VariantBodyProps.valuationDate (types.ts:15)  ← 이미 주입 중
  → EstateBodyFinancial: 읽기전용 표시 + computeSavingsAccrual 인자
```
별도 prop 추가 불요 — 기존 주입 경로 재사용.

## 5. 사이드바 합계 (⑥ — UI#1 Critical)

`computeInheritanceSummary → sumEstateItemsValuation → estimateAssetValue →
computeEffectiveValuation`(`lib/calc/estate-item-valuation.ts:99`) financial 분기 **갱신 필수**:

```typescript
// estate-item-valuation.ts financial 분기 (신규)
if (item.category === "financial") {
  const mode = item.savingsValuationMode ?? "balance";
  if (mode === "balance") return item.marketValue ?? 0;        // 현행
  if (mode === "manual")
    return (item.savingsPrincipal ?? 0) + (item.savingsAccruedInterest ?? 0) - (item.savingsWithholdingTax ?? 0);
  // auto: valuationDate·기산일 모두 있으면 computeSavingsAccrual, 없으면 principal fallback(M-1)
  if (valuationDate && item.savingsStartDate)
    return computeSavingsAccrual({
      principal: item.savingsPrincipal ?? 0,
      annualRate: item.savingsAnnualRate ?? 0,        // 미입력 → 0(미수이자 0), NaN 방지
      startDate: parseISO(item.savingsStartDate),
      valuationDate,
      withholdingRate: item.savingsWithholdingRate ?? 14,
      includeLocalTax: item.savingsIncludeLocalTax ?? true,
    }).valuatedAmount;
  return item.savingsPrincipal ?? 0;
}
```
미갱신 시 mode B에서 `marketValue` null → **사이드바 0원**. 0원·null 미표시 정책 유지(계산가능 항목만).

## 6. 결과뷰 (⑦ — UI#2, 상속/증여 경로 분리)

| 세목 | 컴포넌트 | breakdown 표시 | 작업 |
|---|---|---|---|
| 증여 | `GiftValuationBasisCard`(`GiftTaxResultView.tsx:550`) | ✅ 자동 렌더 | 없음 |
| 상속 | `InheritanceTaxResultView.tsx:467-490` | ❌ valuatedAmount·method만 | **`vr.breakdown` 행 렌더 추가** |

상속 method 라벨맵(`:475-483`)에 `"deposit_statutory" → "예금 보충적 평가(§63④)"` 추가.

### 결과카드 산식 (한국어 풀어쓰기)
```
예금등 평가액 = 예입금액 1,000,000,000 + 미수이자 41,780,822 − 원천징수세액 6,434,246 = 1,035,346,576
  · 미수이자 = 예입금액 × 연 5% × 305일 / 365일
  · 원천징수세액 = 이자소득세(미수이자 × 14%) + 지방소득세(이자소득세 × 10%)
```

## 7. validation (⑧)
- auto: `savingsAnnualRate`·`savingsStartDate` 미입력 → 차단(자동안분 fallback 금지).
- `savingsAnnualRate`·`savingsWithholdingRate`: 0~100% 범위. 0% 허용(미수이자 0). 100% 초과 차단.
- API/UI fallback ↔ validate 동기화: mode별 동일 fallback. UI 통과↔validate 차단 모순 금지.

## 8. testid 동결 (E2E) — ✅ 구현 정렬(드리프트 0)
실제 구현·통과 E2E(`e2e/deposit-savings-valuation-63-4.spec.ts`, 3/3 PASS) 기준:
`savings-valuation-mode-{id}`(평가모드 라디오 그룹)·`savings-accrual-method`(미수이자 산정)·
`savings-market-value-{id}`(잔액)·`savings-principal-{id}`·`savings-annual-rate-{id}`·
`savings-withholding-rate`·`savings-accrued-interest-{id}`·`savings-withholding-tax-{id}`.
> v1 동결값(savings-mode-balance 등)은 구현과 불일치 → 위 구현값으로 갱신(gap-detector deviation #testid 해소).

## 9. 미해결 (계획서 §9)
factory 초기값 위치(UI#8)·normalize savingsStartDate 재수화(코드#5) — Do 전 grep 확정.

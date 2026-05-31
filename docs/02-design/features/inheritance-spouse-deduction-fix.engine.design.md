# 상속공제 4,600m 정합 — 엔진 설계 (6개 수정)

> Plan: docs/00-pm/inheritance-spouse-deduction-consultation-split.plan.md
> 13단계 자가검토 S5(설계 생성)~S13(UI). 6개 수정: 버그①②③ + 자동화④⑤⑥ + 산식 I-1·I-2.

---

## S5. 케이스 인벤토리 (필수 — 행≥1)

| ID | 수정 | 입력 | 현재 | 기대 | 법령 |
|---|---|---|---|---|---|
| CI-1 | 일괄공제 자동 max | 기초200+인적100=300 < 일괄500 | 300 | **500** | §21 |
| CI-2 | 동거 100% (deathDate≥2020-01-01) | 공시가 600, 2024 상속 | 480(80%) | **600** | §23의2① |
| CI-2b | 동거 80% (deathDate<2020-01-01) | 공시가 600, 2019 상속 | — | 480(80%) | §23의2 구법 |
| CI-2c | 동거 담보채무 차감 | 공시가 600 − 담보 100 | 480 | **500**=(600−100)×100% | §23의2① |
| CI-3 | 배우자 사전증여 과세표준 자동 | 배우자 760, giftTaxBase="" | 760 | **160**=760−600(§53) | §19·§53 |
| CI-3b | 사전증여 giftTaxBase 명시 | giftTaxBase=160 입력 | 160 | 160 (존중) | mirror |
| CI-4 | 금융 자동 | 순금융 1,155, netFin="" | 0 | **200** | §22 |
| CI-4b | 금융 명시 0 | netFin="0" | — | **0** (자동 안함) | mirror R4 |
| CI-4c | §22② 최대주주 제외 | 최대주주 주식 500 포함 | — | 순금융서 500 제외 | §22② |
| CI-5 | 상속외자유증 자동 | 수유자 배분 500, legatee="" | 0 | **500** | §24·19-17-1 |
| CI-6 | 배우자 실제상속액 자동 | 협의분할 자산3,300−채무500, spouseActual="" | 법정상속분 | **2,800** | §19·19-17-1 |
| CI-6b | 배우자 실제 명시 | spouseActual=2,800 입력 | — | 2,800 (존중) | mirror |
| CI-7 | **통합 4,600** | 위 전체(사용자 시나리오) | 3,987 | **4,600** | — |
| CI-8 | 회귀 EXAMPLE | 명시 입력 fixture | 4,600 | 4,600 (불변) | — |
| CI-9 | I-2 직계존속 공동상속 | 자녀0+직계존속1+배우자 | childCount=0→ratio 1.0 | 1.5/2.5 | 민법§1009 |

---

## S6~S9. 산식 (설계 검토 ①②·정정 반영)

### 버그① 일괄공제 자동 max
- `INITIAL_FORM.preferLumpSum` 기본값 → **`undefined`(자동 max)**. (현재 false면 버그 — Do 실측)
- `calcInheritanceDeductions:629` `preferLumpSum !== false && LUMP_SUM_DEDUCTION >= itemizedTotal` 로직 유지(정상). 입력 기본값만 정정.

### 버그② 동거 100% + historical + 담보채무
```ts
// inheritance-deductions.ts
function cohabitShareRate(deathDate?: string): number {
  return (deathDate ?? "9999") >= "2020-01-01" ? 1.00 : 0.80; // §23의2 2020.1.1. 개정
}
// calcCohabitationDeduction(stdPrice, securedDebt, deathDate)
const base = Math.max(0, cohabitHouseStdPrice - (securedDebt ?? 0)); // §23의2① 담보채무 차감
const raw = applyRate(base, cohabitShareRate(deathDate));
const deduction = Math.min(raw, COHABIT_MAX); // 6억
```
- ★ S8 검토: cohabitDirectAmount(직접 입력) 모드는 비율·차감 미적용(입력값 그대로, 현행 유지). cohabitHouseStdPrice 모드만 적용.

### 버그③ 배우자 사전증여 과세표준 자동 (single-source)
```ts
// prior-gift-auto-tax.ts — 자동계산 시 taxBase도 반환·저장
export function autoComputeGiftTaxBase(giftAmount: number, doneeRelation?: DonorRelation): number {
  if (giftAmount <= 0) return 0;
  const deduction = doneeRelation ? calcRelationDeduction({donorRelation: doneeRelation, priorUsedDeduction: 0}, giftAmount).relationDeduction : 0;
  return Math.max(0, giftAmount - deduction); // 760 − 600 = 160
}
// inheritance-tax.ts spouseGiftTaxBase: giftTaxBase 명시 우선, 없으면 autoComputeGiftTaxBase (giftAmount fallback 폐기)
const base = g.giftTaxBase ?? autoComputeGiftTaxBase(g.giftAmount, g.doneeRelation);
```
- ★ S8 검토: `?? giftAmount` → `?? autoComputeGiftTaxBase(...)`. computeTaxPatch(GiftRowEditor)에서도 giftTaxBase 자동 저장(상속세 모드).

### 자동화④⑤⑥ — mirror 3중 (R4 빈문자열 구분)
```ts
// buildInput (InheritanceTaxForm) — 빈 문자열일 때만 자동, "0"·명시값 존중
function autoOrManual(raw: string, auto: number): number | undefined {
  return raw === "" ? (auto > 0 ? auto : undefined) : (parseAmount(raw) || undefined);
}
netFinancialAssets: autoOrManual(form.netFinancialAssets, suggestNetFinancialAssets(estateItems, debtItems).value),
legateeAmountNonHeir: autoOrManual(form.legateeAmountNonHeir, suggestLegateeAmountNonHeir(estateItems, heirs).value),
spouseActualAmount: autoOrManual(form.spouseActualAmount, suggestSpouseActualAmount(estateItems, heirs, debtItems).value),
```
- `suggestSpouseActualAmount` 채무차감 추가(§19-17-1): `Σ배우자자산 − Σ배우자담보채무` (사전증여·추정 제외).
- validate: 자동 도출 후 input 검증 → 자동값>0이면 통과 (applyCorporateGiftTaxFallback 패턴).

### I-1·I-2 법정상속분
```ts
// computeSpouseRatio — 공동상속인 전체 (직계비속 우선, 없으면 직계존속)
function computeSpouseRatio(heirs: Heir[]): number {
  const child = heirs.filter(h => h.relation === "child").length;
  const ascendant = heirs.filter(h => h.relation === "lineal_ascendant").length;
  const coheirs = child > 0 ? child : ascendant; // 직계비속 우선
  return 1.5 / (1.5 + coheirs); // 수유자·법인 제외
}
// wantsAutoSpouseLegalShare 조건 제거 → 항상 computedSpouseLegalShare
```

---

## S10~S11. 계획-설계 통합 비교 (정합)

| 계획 §2 | 설계 CI | 정합 |
|---|---|---|
| 버그① preferLumpSum | CI-1 | ✅ |
| 버그② 100%+historical+담보 | CI-2/2b/2c | ✅ (S0 KoreanLaw §23의2①) |
| 버그③ 과세표준 자동 | CI-3/3b | ✅ |
| 자동④ 금융 | CI-4/4b/4c | ✅ (R4 빈문자열) |
| 자동⑤ 유증 | CI-5 | ✅ |
| 자동⑥ 배우자실제 | CI-6/6b | ✅ (채무차감) |
| I-2 비율 | CI-9 | ✅ |
| 통합 | CI-7/8 | ✅ |
- 누락 0. 모순 0.

---

## S12~S13. UI 디자인 (자동값 표시 mirror)

| 지점 | UI |
|---|---|
| Step4 배우자 실제상속액 | 미입력 시 자동값(협의분할 자산−채무) placeholder/회색 표시 + AutoSuggestBadge. 명시 입력 시 우선 |
| Step4 순금융재산 | 동일 — 자산 기반 자동값 표시 |
| Step4 상속외자유증 | 동일 — 수유자 협의분할 자동값 |
| 동거주택 | cohabitHouseStdPrice 모드: 담보채무 차감·100% 결과 표시 |
| 결과 카드 §19 | 배우자공제 산식: 법정상속분(분자×비율−과세표준) + 실제상속액 + Min |
| 결과 카드 §23의2 | "동거주택가액 − 담보채무 × 100% (한도 6억)" |
| 결과 카드 §22 | 순금융재산(최대주주 제외) × 20% |

- ★ S13 검토: 자동값 표시는 **display fallback**(useEffect→store 미러링 금지). `value={form.x || autoX}` 아닌 placeholder/별도 표시(form.x="" 유지). 사용자 입력 시 form.x set.
- ★ R4 UI: 빈칸(미입력)=자동, "0" 입력=명시 0. select-on-focus로 자동값 덮어쓰기 용이.

---

## anchor (Pre-Do)
- CI-1~9 전수 anchor. CI-7(통합 4,600m) 핵심. CI-8(회귀) 필수.
- 현재 RED: CI-1(300)·CI-2(480)·CI-3(760)·CI-4(0)·CI-5(0)·CI-6(법정상속분)·CI-7(3,987).

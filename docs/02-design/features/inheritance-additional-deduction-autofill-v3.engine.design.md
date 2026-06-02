# 상속세 추가공제 estate 자동도출·자동채움 (v3) — 엔진 설계

> 계획서: [`docs/00-pm/inheritance-additional-deduction-autofill-v3.plan.md`](../../00-pm/inheritance-additional-deduction-autofill-v3.plan.md)
> UI 설계: `inheritance-additional-deduction-autofill-v3.ui.design.md` (별도)
> 정책: `[[single-source-engine-helper]]` · `[[mirror-pattern]]` · `[[feedback_no_silent_apportion_fallback]]` · `[[feedback_store_default_vs_ui_display_fallback]]` · `[[korean-law-citation-verify]]`
> KoreanLaw 검증: 2026-06-02 (상증법 mst 276123 §23의2 / 시행령 mst 283637 §20의2)

## Context

Step4 "추가 공제 입력(선택)" 5개 칸이 사용자가 자산 카드에 이미 입력한 데이터에서 도출 가능한데도 별도 수동 입력을 요구한다. §19·§22는 `buildInput`의 `autoOrManual`로 이미 자동주입되나 UI에 안 보이고, §23의2 동거주택·§18의3 영농은 자동도출이 끊겨(`parseAmount||undefined`) 비우면 침묵 공제 0. 가업상속공제(§18의2)가 `deriveFamilyBusinessValue`(family-business.ts:127·use 210-212)로 estate를 자동 합산하는 것과 비대칭.

**목표(엔진측)**: ① EstateItem `isCohabitantHouse` 신규 플래그 + `deriveCohabitHouseStdPrice` 헬퍼로 동거주택 공시가격 자동도출, ② §23의2① 담보채무 엔진 연동(현행 0 하드코딩 해소), ③ §19 mixed-allocation 자동도출 정확화, ④ 영농 autoOrManual 연결. UI 측(가시적 자동채움·체크박스)은 ui.design.md.

---

## ★ 케이스 인벤토리 (행 13 — Do 진입 게이트)

| # | 시나리오 | 법령 근거 | anchor 출처/기대값 | 테스트 파일 | 상태 |
|---|---------|----------|-------------------|-----------|------|
| C-1 | 동거주택 단일·담보 0 (stdPrice 5억) | §23의2① | `derive().value===500_000_000`, securedDebt=0 → 엔진 base 5억·deduction 5억(cap 6억 미달) | `suggest-cohabit-derive.test.ts` | ☐ TODO |
| C-2 | 동거주택+저당 (5억, mortgage 1억) | §23의2① "담보된 채무 뺀 가액" | `derive().value===500_000_000`(**gross**), `securedDebt===100_000_000` → 엔진 base 4억·**deduction 4억** (이중차감 아님) | 〃 (**Anchor A**) | ☐ TODO |
| C-3 | 동거주택 복수 isCohabitantHouse (legacy) | §23의2 1세대1주택 | `.isApplicable===false` (자동도출 포기) | 〃 | ☐ TODO |
| C-4 | 동거주택 override (form 3억, auto 4억) | — | autoOrManual → 300_000_000(사용자 우선) | 〃 | ☐ TODO |
| C-5 | 미체크 (Heir.isCohabitant만) | — | `.isApplicable===false`, auto=0 → 공제 0 | 〃 | ☐ TODO |
| C-6 | 임대보증금만 있음(저당 0, leaseDeposit 2억) | §23의2① **담보된 채무만** | securedDebt=0(임대보증금 제외) → value=stdPrice | 〃 | ☐ TODO |
| F-1 | 영농 단일 (10억, 담보 0) | §18의3①·시행령 §16⑤ | `suggestFarmingAssetValue().value===1_000_000_000` | `suggest-farming-autofill.test.ts` | ☐ TODO |
| F-2 | 영농 복수 합 (3건) | 〃 | 합계 | 〃 | ☐ TODO |
| F-3 | 영농 자격자 분배분 (배분 7억/전체 10억) | 시행령 §16⑤ 본문 | `.value===700_000_000` | 〃 | ☐ TODO |
| F-4 | 어업권 면허제외 (fishingLicenseExcluded) | 시행령 §16⑤마목 단서 | 제외 → autoOrManual undefined | 〃 | ☐ TODO |
| S-1 | §19 전부 협의분할 (3/3건) | §19②·집행 19-17-1 | `suggestSpouseActualAmount().value===배우자 배분 합` | `suggest-spouse-mixed-allocation.test.ts` | ☐ TODO |
| S-2 | §19 일부 협의분할 (1/3건) | §19② | `.isApplicable===false` (현행 버그 → RED) | 〃 (**Anchor B**) | ☐ TODO |
| S-3 | §19 협의분할 전무 | §19② | `.isApplicable===false` → 엔진 법정상속분 | 〃 | ☐ TODO |
| E-1 | 가시적 자동채움 E2E (체크→Step4 표시·override) | — | display fallback 표시 검증 | `e2e/inheritance-cohabit-autofill.spec.ts` (**Anchor C**) | ☐ TODO |

**규칙**: 행≥1 충족. C-2·S-2가 Pre-Do RED 우선(함수 미존재/현행 버그). C-3는 legacy 방어, C-6은 KoreanLaw "담보된 채무만" 실증.

---

## 법령 근거 (KoreanLaw 검증 완료 2026-06-02)

```
상증법 §23의2①(mst 276123, 시행 2026-01-02):
  상속주택가액(소득법 §89①3호 주택부수토지 가액 포함하되, 상속개시일 현재
  「해당 주택 및 주택부수토지에 담보된 피상속인의 채무액을 뺀 가액」)의
  100분의 100, 한도 6억원.
  1호: 10년 이상 계속 동거(미성년 기간 제외)
  2호: 10년 이상 1세대 1주택(무주택 기간 포함)
  3호: 상속개시일 현재 무주택 또는 피상속인과 공동 1세대1주택 보유한 동거 상속인이 상속

시행령 §20의2(mst 283637): 동거주택 인정의 범위 — 1세대1주택 정의 + 일시적 2주택 8호.
  (계획서 추정 "§21의3"은 오류 — §20의2로 정정)

→ 「담보된 채무」 = 저당 등 담보권이 설정된 채무. 일반 임대보증금 반환채무는
  담보된 채무 아님 → securedDebt에서 제외 (전세권 등 담보권 설정은 예외, 본 작업 미구현).
```

- 상수: `INH.COHABIT_DEDUCTION = "상증법 §23의2"` (legal-codes/inheritance-gift.ts:40). §18의3=`INH.FARMING_DEDUCTION`, §19=`INH.SPOUSE_DEDUCTION`, §22=`INH.FINANCIAL_DEDUCTION`.
- ⚠️ **부수토지**: §23의2① base는 주택가액 + **주택부수토지 가액**. `EstateItem.standardPrice`(아파트=공동주택가격, 단독=개별주택가격)는 통상 부수토지(대지권) 포함. 단 건물·토지를 **별도 EstateItem**으로 입력한 경우 부수토지 별도 합산 필요 → **Design 결정**: v3는 단일 주택 EstateItem.standardPrice를 base로 사용(부수토지 포함 공시가 전제), 토지 분리 입력 케이스는 후속(§11-1).

---

## 엔진 input 타입 변경

```ts
// lib/tax-engine/types/inheritance-gift.types.ts

// EstateItem (line 201 isFamilyBusinessAsset 인접 삽입)
export interface EstateItem {
  // ...existing...
  /**
   * §23의2 동거주택 상속공제 — 자산 카드에서 명시 지정한 동거주택(단일).
   * true 시 deriveCohabitHouseStdPrice가 본 자산의 standardPrice − mortgageAmount(담보채무)를
   * cohabitHouseStdPrice·cohabitSecuredDebt로 도출. 복수 지정은 자동도출 포기(isApplicable=false).
   */
  isCohabitantHouse?: boolean;
}

// InheritanceDeductionInput (line 756 cohabitHouseStdPrice 인접)
export interface InheritanceDeductionInput {
  // ...existing: spouseActualAmount·netFinancialAssets·cohabitHouseStdPrice·farmingAssetValue·cohabitDirectAmount...
  /** §23의2① 담보된 피상속인 채무(저당). cohabitHouseStdPrice에서 차감. buildInput이 deriveCohabitHouseStdPrice로 도출 주입. */
  cohabitSecuredDebt?: number;
}
```

## 엔진 result 타입 (변경 없음 — 기존 detail 재사용)

- `CohabitDeductionDetail`(inheritance-deduction-detail.types.ts:191)에 `securedDebt: number` **이미 존재** → ⑦ 결과카드 표시 가능. result 타입 신규 0.

## 신규 헬퍼 시그니처 (lib/calc — 단일 진실)

```ts
// lib/calc/inheritance-deduction-suggest.ts (547줄 → ~600줄)
export function deriveCohabitHouseStdPrice(
  estateItems: EstateItem[],
  heirs: Heir[],
): DeductionSuggestion & { securedDebt: number };
```

---

## 계산 알고리즘 (단계별)

### A. `deriveCohabitHouseStdPrice` (신규)
1. `houses = estateItems.filter(i => i.isCohabitantHouse === true)`.
2. `houses.length !== 1` → `{ value:0, securedDebt:0, isApplicable:false, notes:["동거주택 1건만 지정"] }` (복수 legacy 방어·결정성).
3. `h = houses[0]`. `h.standardPrice` 없거나 ≤0 → `isApplicable:false`.
4. `securedDebt = h.mortgageAmount ?? 0` (§23의2① 담보채무 = 저당만, 임대보증금 제외).
5. ⚠️ **[E-1 이중차감 방지]** `value = h.standardPrice` (**gross 공시가격 — securedDebt 차감 금지**). 차감은 엔진이 `base = stdPrice − securedDebt`(deductions.ts:294)로 **단일 수행**. derive가 또 빼면 이중차감(5억·저당1억→공제 3억, 정답 4억). 필드 라벨 "공시가격"과도 정합.
6. `hasCohabitantChild = heirs.some(h => h.relation==="child" && h.isCohabitant===true)` → false면 notes 경고(요건 미충족 가능).
7. return `{ value: h.standardPrice, securedDebt, isApplicable:true, reason, breakdown }`.

### B. §23의2① securedDebt 엔진 연동 (inheritance-deductions.ts)
- 627행 `calcCohabitationDeduction(input.cohabitHouseStdPrice ?? 0, 0, baseDate)` → `..., input.cohabitSecuredDebt ?? 0, baseDate)`. 엔진 순수성 유지(estate 미호출, buildInput이 도출 주입).
- 내부 산식(284-313 기존, **단일 차감 지점**): `base = max(0, cohabitHouseStdPrice − securedDebt)`(294), `cappedDeduction = min(base × rate(100%/80% by deathDate), 6억)`. → `cohabitHouseStdPrice` = **gross**(derive.value), securedDebt 별도 주입.
- Phase E `cohabitDirectAmount > 0` 분기(603) 우선순위 불변.

### C. §19 mixed-allocation 정확화 (suggestSpouseActualAmount:490-547)
1. `allocated = estateItems.filter(i => i.heirAllocations).length`, `total = estateItems.length`.
2. `0 < allocated < total` → `isApplicable:false` + 경고("일부 자산만 협의분할 — 전체 입력 또는 §19 직접 입력 필요"). (기존 :510 `if(!heirAllocations) continue` → 부분 입력 시 과소 자동값 방지.)
3. `allocated === total` → 기존 로직(배우자 배분 − 승계채무).
4. `allocated === 0` → `isApplicable:false`(기존).
- ⚠️ 엔진 `calcSpouseDeduction:169 ?? legalShareAmount` 불변. isApplicable=false → undefined → **법정상속분 fallback**(실제<법정 시 과대공제, 기존 거동·별도 트랙).

### D. autoOrManual 연결 (buildInput, UI 시니어 — ④)
- `cohabitHouseStdPrice: autoOrManual(form.cohabitHouseStdPrice, cohabit.value)` + `cohabitSecuredDebt: cohabit.securedDebt`.
- `farmingAssetValue: autoOrManual(form.farmingAssetValue, suggestFarmingAssetValue(items, form.farming).value)` (모드 무관 — 엔진 634행이 정밀화/legacy 모두 farmingAssetValue 스칼라 사용).

---

## Silent fallback / 자동 안분 후보 식별

- `deriveCohabitHouseStdPrice`·`suggestFarmingAssetValue` 자동값은 **사용자 명시 체크(isCohabitantHouse)·분류(farmingCategory)** 데이터 도출 → `[[feedback_no_silent_apportion_fallback]]` 위반 아님(빈값 임의 안분 아님).
- ⚠️ §19 부분 협의분할 fallback(법정상속분)은 **기존 엔진 거동**이며 자동 안분 성격 — 본 작업은 잘못된 auto-fill만 방지, legal-share over-deduction은 별도 트랙(미입력 강제 차단 여부 후속 결정).
- `securedDebt` 0 fallback: cohabitSecuredDebt 미주입 시 0(차감 없음) — 보수적(공제 과대 방지 아님, base 과대 가능). 단 isCohabitantHouse 체크 시 항상 deriveCohabitHouseStdPrice가 securedDebt 동시 주입하므로 정합.

---

## 테스트 약속

- 케이스 인벤토리 14행 → anchor. **Pre-Do RED 우선**: C-2(Anchor A — 함수 미존재 TS RED), S-2(Anchor B — 현행 isApplicable=true 버그 RED).
- C-6: KoreanLaw "담보된 채무만" 실증 — leaseDeposit 2억 있어도 securedDebt=0.
- 원단위 `toBe()`(`[[feedback_pdf_example_test_anchoring]]`): 400_000_000·700_000_000 등.
- 회귀: `npm test` 전체(공유 모듈 — 종부세→재산세 의존).

---

## UI 통합 위임

- 가시적 자동채움(display fallback on `value`)·동거주택 체크박스·14 동기화 지점 UI측(①②③④⑤⑥⑦⑧)은 `inheritance-additional-deduction-autofill-v3.ui.design.md`.
- 엔진 시니어 산출물: `EstateItem.isCohabitantHouse`·`InheritanceDeductionInput.cohabitSecuredDebt` 타입, `deriveCohabitHouseStdPrice` 시그니처, `calcCohabitationDeduction` securedDebt 매개변수화, Zod(baseItemSchema:124·inheritanceDeductionInputSchema:683).

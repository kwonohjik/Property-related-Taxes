# 부표3 §14 담보채무 표시 — 데이터 어댑터 설계 (engine/data)

> 계획서: `inheritance-buppyo3-collateral-debt-display.plan.md` · 대상: `lib/calc/deduction-besshi-data.ts`(어댑터) + `InheritanceTaxResultView.tsx`(호출부 merge·게이트). **엔진(`inheritance-tax.ts`) 변경 0** — `result.collateralDebtDetail` echo(`:855`)는 이미 존재.

## 0. 설계 범위 선언

본 작업은 **신규 엔진 계산 없음**. 이미 엔진이 도출·echo한 `collateralDebtDetail`을 표시 어댑터/뷰가 소비하도록 배선하는 **데이터 어댑터 설계**다. 따라서 input 타입 신설·Zod·Route 변경 없음. 변경 단위는 ① 부표3 어댑터 내부 합산 ② 결과뷰 호출부 merge·게이트.

## 1. 데이터 소스 정합 (단일 진실)

| 데이터 | 출처(SSOT) | 타입 | echo 위치 |
|---|---|---|---|
| 자동도출 담보채무 | `EstateItem.mortgageAmount/leaseDeposit` + `deductSecuredClaimAsDebt` | `DerivedCollateralDebt[]` | `inheritance-tax.ts:855` `result.collateralDebtDetail` |
| 수동 협의분할 채무 | 사용자 입력 | `DebtItem[]` | `form.debtItems`(result 외부) |
| 변환 헬퍼 | `inheritance-collateral-debt.ts:94` `toCollateralDebtItems()` | `DerivedCollateralDebt[] → DebtItem[]` | `category: "personal"` 고정(`:99`) |

`DerivedCollateralDebt`(`inheritance-collateral-debt.ts:17` import 타입): `{ estateItemId, creditorName, amount, financialDebtAmount, heirAllocations? }`.
`toCollateralDebtItems` 변환 결과 `DebtItem`: `{ id: "collateral_"+estateItemId, category: "personal", name: creditorName, amount, heirAllocations }`.

> 변환 헬퍼는 엔진이 협의분할 합산(`inheritance-tax.ts:725`)에 쓰는 **동일 함수 재사용** — 표시 경로가 별도 변환을 신설하면 dual-truth. 메모리 `single-source-engine-helper`.

## 2. 케이스 인벤토리 (debtItems × collateralDebtDetail 매트릭스)

| # | debtItems | collateralDebtDetail | 부표3 「가.채무」 | 협의분할 표(3) | ④ 카드 | 현행 버그 |
|---|---|---|---|---|---|---|
| C1 | `[]` | `[]` | 빈 표(legacy 가능) | 미렌더 | 미렌더 | — (정상) |
| C2 | financial 1건 | `[]` | financial 1행 | 렌더 | 렌더(④ 섹션 없음) | — (정상) |
| C3 | `[]` | 담보 1건(5억) | **빈 표** ❌ | **미렌더** ❌ | **미렌더** ❌ | ★ 전면 누락 |
| C4 | tax·funeral만 (이미지) | 담보 1건(5억) | **빈 표** ❌ | 공과금·장례비만(담보 행 없음) ❌ | 렌더 + ④ 섹션 5억 ✓ | ★ 부표3·(3)표 누락 |
| C5 | financial 1건 | 담보 1건(5억) | financial 1행만(담보 누락) ❌ | financial만 | 렌더 + ④ 섹션 | ★ 부표3·(3)표 담보 누락 |
| C6 | legacy(debts 1억) | `[]` | legacy 행 1개 | 미렌더 | 미렌더 | — (회귀 보호 대상) |

**수정 후 기대**: C3·C4·C5에서 부표3 「가.채무」에 담보 행 추가(amount=5억), 협의분할 표(3)에 「개인사채」 그룹 담보 행 추가, C3에서 ④ 카드·(3)표 렌더(게이트 확장). C6 legacy 불변.

## 3. 어댑터 알고리즘 — `buildBuppyo3Data` (3-1)

### 시그니처 (변경 없음)
```ts
buildBuppyo3Data(
  result: InheritanceTaxResult,
  debtItems: DebtItem[] | undefined,
  legacy?: { funeralExpense; funeralIncludesBongan; debts },
): Buppyo3Data
```

### 변경: `:128` 라인 (합산을 `useLegacy` 산정 앞에)
```ts
// AS-IS
const items = debtItems ?? [];
const useLegacy = items.length === 0 && legacy != null;

// TO-BE
const collateralItems = toCollateralDebtItems(result.collateralDebtDetail ?? []);
const items = [...(debtItems ?? []), ...collateralItems];
const useLegacy = items.length === 0 && legacy != null;  // collateral 포함 length로 판정
```
- import 추가: `import { toCollateralDebtItems } from "@/lib/tax-engine/inheritance-collateral-debt";`
- 기존 필터(`:131-132` `category === "financial" || "personal"`)가 collateral(personal)을 「가.채무」 `debtRows`로 흡수.
- `debtTotal`(⑦) = `sumAmount(debtRows)` 자동 합산.
- 「나.공과금」(`:139-141` tax)·「다.장례비」(`:143-150` funeral)는 collateral(personal) 무관 → 영향 없음.

### legacy 정합 (회귀 보호)
- C6: `debtItems=[]` + `collateralDebtDetail=[]` → `collateralItems=[]` → `items=[]` → `useLegacy=true` → 기존 legacy 행. **회귀 0**.
- C3: `debtItems=[]` + 담보 1건 → `items.length=1` → `useLegacy=false` → 담보 행 표시. legacy 미발동(정상).

### 불변식
- `debtTotal === Σ debtRows.amount` (financial+personal, collateral 포함).
- C3에서 `debtTotal === collateralDebtDetail[0].amount`(= mortgageAmount + leaseDeposit).
- PDF 경로(`inheritance-besshi-pages.tsx:77`)는 동일 함수 → 자동 동일 결과(별도 변경 0).

## 4. 호출부 merge·게이트 (3-2·3-3) — `InheritanceTaxResultView.tsx`

### merged 배열 (협의분할 표(3) 전용)
```ts
const debtItemsWithCollateral = useMemo(
  () => [...(debtItems ?? []), ...toCollateralDebtItems(result.collateralDebtDetail ?? [])],
  [debtItems, result.collateralDebtDetail],
);
```
- `:459` SourceDataSummarySection `debtItems={debtItems}` → `debtItems={debtItemsWithCollateral}`.
- **부표3(`:579`)·④카드(`:505`)·DeductionBreakdown(`:525`)에는 원본 `debtItems` 유지**(이중 합산·이중 표시 방지 — §1 표 참조).

### 게이트 단일화 (Do 환류) — `hasDebtOrCollateral` 파생변수
컴포넌트 본문에 파생변수 1개를 두고 ④ 카드 게이트 + **인쇄 선택 등록(`selectedPrintIds`, `availablePrintIds` useMemo 내 `debt-allocation` add)** 양쪽이 공유한다(중복 제거·단일 진실·800줄 정책 대응):
```ts
const hasDebtOrCollateral =
  (debtItems?.length ?? 0) > 0 || (result.collateralDebtDetail?.length ?? 0) > 0;
// availablePrintIds useMemo: if (hasAlloc && hasDebtOrCollateral) s.add("debt-allocation")  // ← Do 중 추가 발견: 인쇄 선택도 debtItems 게이트에 묶여 있었음
// useMemo deps: debtItems 직접참조 제거 → hasDebtOrCollateral로 대체(exhaustive-deps)
```

### ④ 카드 게이트 (`:498-511`)
```ts
// AS-IS
result.heirAllocationResult && debtItems !== undefined && debtItems.length > 0 && heirs?.length > 0
// TO-BE — length를 반드시 > 0 불리언화 (`(a?.length || b?.length)`는 0이 화면에 렌더되는 함정)
result.heirAllocationResult &&
  ((debtItems?.length ?? 0) > 0 || (result.collateralDebtDetail?.length ?? 0) > 0) &&
  heirs?.length > 0
```

## 5. 동기화 지점 (표시 전용 — ⑦만)

| # | 지점 | 파일·라인 | 변경 |
|---|---|---|---|
| ⑦-a | 부표3 어댑터 내부 합산 | `deduction-besshi-data.ts:128` | collateral merge |
| ⑦-a' | import | `deduction-besshi-data.ts` 상단 | `toCollateralDebtItems` |
| ⑦-b | 협의분할 표(3) merge | `InheritanceTaxResultView.tsx:459` | merged 전달 |
| ⑦-b' | import·useMemo | `InheritanceTaxResultView.tsx` | merged 산출 |
| ⑦-c | ④ 카드 게이트 | `InheritanceTaxResultView.tsx:499-500` | `hasDebtOrCollateral` |
| ⑦-c' | ④ 카드 ① 섹션 가드 | `DebtAllocationResultCard.tsx:110` | `totalInput > 0` 조건부 |
| ⑦-d | **인쇄 선택 등록(Do 환류)** | `InheritanceTaxResultView` `availablePrintIds` useMemo | `hasDebtOrCollateral`(담보만 있어도 인쇄 목록 포함) |
| PDF | 자동 | `inheritance-besshi-pages.tsx:77` | (3-1 자동 커버) |

입력측(①②③④⑧⑨~⑭) 변경 없음 — result echo 기존 필드 소비.

## 6. anchor 케이스 (Pre-Do, `__tests__/calc/deduction-besshi-data.test.ts`)

| anchor | 입력 | 수정 전 | 수정 후 |
|---|---|---|---|
| A1(누락재현) | C3: `result.collateralDebtDetail=[{amount:5억,creditorName:"담보된 토지 담보채무"}]`, `debtItems=[]` | `debtRows.length===0`·`debtTotal===0` (실패 확보) | `debtRows[0].kindLabel==="담보된 토지 담보채무"`·`debtTotal===500_000_000` |
| A2(합산) | C5: `debtItems=[은행대출 3억(financial)]` + 담보 5억 | debtRows 1행 | `debtRows.length===2`·`debtTotal===800_000_000`·legacy 비활성 |
| A3(legacy회귀) | C6: `debtItems=[]`·`collateralDebtDetail=[]`·`legacy.debts=1억` | legacy 1행 | legacy 1행 유지(불변) |
| A4(공과금무관) | C4: `debtItems=[재산세 2.5천만(tax)]` + 담보 5억 | utilityRows 1행·debtRows 0 | utilityRows 1행 불변·debtRows 1행(담보) |

> A1은 **수정 전 실패 확보**가 목적(메모리 `pre-do-anchor-verification`). 모든 금액 원단위 `toBe()` anchor(메모리 `feedback_pdf_example_test_anchoring`).

## 7. 결정·미확정 (Do 전)

1. 오픈이슈 ①(협의분할 표(3) 중복 표기) 사용자 결정 — Phase C 진행 여부.
2. ④ 카드 ① 섹션 `totalInput > 0` 가드 + ② 이후 섹션 0원 노출 일괄 점검(Do 시 실측).
3. 부표5(오픈이슈 ②)는 1차 범위 제외.

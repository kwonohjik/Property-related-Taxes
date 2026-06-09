# 별지5호(금융재산공제) §22 담보 저당분 표시 누락 수정 계획서

> 작성일: 2026-06-09 · 대상: 상속세(inheritance) · 영향: `lib/calc/deduction-besshi-data.ts`(부표5 어댑터) + 단일출처 라벨 상수. **엔진 변경 0**. (선행: `inheritance-buppyo3-collateral-debt-display` 오픈이슈 ②)

## 0. 배경 · 증상 (자기일관성 모순)

§14 담보채무 자동도출 중 **저당분**(`DerivedCollateralDebt.financialDebtAmount` = `securedClaimIsFinancialDebt ? mortgageAmount : 0`, 저당만·임대보증금 제외)은 §22 순금융재산 차감 대상(금융회사 채무, 상증법 §22·시행령 §19④)이다. 이 저당분이:
- **③ netFinancial(순금융재산)에는 차감 반영**됨 (클라이언트 `suggestNetFinancialAssets` → `netFinancialAssets` → 엔진 `fdd.netFinancial`).
- **② debtTotal(채무 합계)에는 누락** → 부표5 자기일관성 **① 자산합계 − ② 채무합계 = ③ 순금융재산** 깨짐.

→ 저당분이 0보다 크면 `①−②`가 ③을 저당분만큼(항목별 모드) 또는 2배만큼(legacy 모드) 초과한다.

## 1. 근본 원인 (실측)

엔진은 fdd.rows에 저당분을 별도 행으로 이미 노출하나, 부표5 어댑터가 이를 「채무」로 분류하지 못한다.

| 경로 | 데이터 | 저당분 처리 | 결과 |
|---|---|---|---|
| 엔진 fdd.rows | `inheritance-tax-financial-rows.ts:67-68` `rows.push({ label: "담보 금융저당", amount: collateralFinancialTotal })` | 별도 행 존재 ✓ | — |
| 엔진 ③ netFinancial | `suggestNetFinancialAssets`(`lib/calc/inheritance-deduction-suggest.ts`) 자동채움 → `fdd.netFinancial` | 차감 ✓ | — |
| **부표5 항목별 모드** | `deduction-besshi-data.ts:290-295` `debtRows = (debtItems ?? []).filter(resolveFinancialDebt)` | collateral은 `debtItems` 외부·`category="personal"`→`resolveFinancialDebt` false | ❌ ②에 저당분 누락 → ①−② > ③ |
| **부표5 legacy 모드** | `:299` assetRows=`!isDebtLabel`, `:302` debtRows=`isDebtLabel`. `isDebtLabel`(`:64-65`)은 `"금융채무"`만 | "담보 금융저당" 행이 **assetRows로 오분류** | ❌ ① 과대 + ② 누락 → ①−② = ③ + 2×저당분 |

`resolveFinancialDebt`(`lib/calc/financial-deduction-resolver.ts:66-72`)는 `category !== "financial"` → false. `toCollateralDebtItems`(`inheritance-collateral-debt.ts:99`)는 `category="personal"` 고정(§22 중복차감 방지, `:90-92` 주석). **단순 merge로는 안 잡힘 — 별도 행 주입 필요.**

## 2. 법령 정합

- 상증법 §22·시행령 §19④ — 순금융재산공제 = 금융재산 − **금융회사 채무**(§10①1호). 담보 저당분 중 금융회사 저당(`securedClaimIsFinancialDebt`)은 §22 차감 대상 → 부표5 「채무」 표기 정합.
- 임대보증금은 §22 차감 제외(`financialDebtAmount`에 미포함) → 저당분만 표기 = 법령 정합.
- collateral을 `resolveFinancialDebt` 통과시키면 안 됨(category=personal 의도 — 협의분할 §22 중복차감 방지). **별도 행 주입**이 정답.

## 3. 수정안 (단일출처 라벨 + 두 모드 보강)

### 3-0. 단일출처 라벨 상수
- `inheritance-tax-financial-rows.ts`의 문자열 `"담보 금융저당"`(`:68`)을 `export const COLLATERAL_FINANCIAL_DEBT_ROW_LABEL = "담보 금융저당"`로 상수화하고 `:68`도 이 상수 사용.
- `deduction-besshi-data.ts`에서 import해 재사용(dual-truth 방지, 메모리 `single-source-engine-helper`). 기존 `FINANCIAL_DEBT_ROW_LABEL`(`:62`)과 동일 패턴.

### 3-1. legacy 모드 — `isDebtLabel` 확장
```ts
function isDebtLabel(label: string): boolean {
  return label === FINANCIAL_DEBT_ROW_LABEL || label === COLLATERAL_FINANCIAL_DEBT_ROW_LABEL;
}
```
→ `:299` assetRows에서 "담보 금융저당" 제외 + `:302` debtRows로 분류. legacy 자기일관 자동 복구.

### 3-2. 항목별 모드 — fdd.rows의 "담보 금융저당" 행을 debtRows에 주입 (★단일 진실)
estateItems 재계산 대신 **엔진이 이미 echo한 `fdd.rows`의 "담보 금융저당" 행**을 읽어 debtRows에 추가한다. `buildPhaseDFinancialRows`는 orchestrator가 모드 무관하게 항상 주입(`inheritance-tax.ts:500`)하므로 항목별 모드에서도 접근 가능.
```ts
debtRows = (debtItems ?? []).filter(resolveFinancialDebt).map(...);
const collateralRow = fdd.rows.find((r) => r.label === COLLATERAL_FINANCIAL_DEBT_ROW_LABEL);
if (collateralRow && collateralRow.amount > 0)
  debtRows.push({ kindLabel: COLLATERAL_FINANCIAL_DEBT_ROW_LABEL, amount: collateralRow.amount });
```
→ ② debtTotal에 저당분 포함 → ①−②=③ 복구.

> ★ **fdd.rows 읽기 채택 이유**: ① 엔진 fdd는 §22② 최대주주 제외 적용 **후** 저당분이므로 ③ netFinancial과 정확히 정합(estateItems derive는 §22② 미적용 원본 → 불일치 위험). ② `deriveCollateralDebts`/`sumCollateralFinancialDebt` import 불필요. ③ legacy 모드와 동일 소스(fdd.rows) → 두 모드 일관. → **오픈이슈 1 자동 해소.**

## 4. 동기화 지점 (표시 전용 — ⑦만)

| # | 지점 | 변경 |
|---|---|---|
| ⑦-a | 부표5 항목별 debtRows | collateral 저당분 행 주입 |
| ⑦-b | 부표5 legacy debtRows | `isDebtLabel` 확장 |
| 라벨 | `inheritance-tax-financial-rows.ts` | 상수 export(`:68` 치환) |

입력측·엔진 계산 변경 없음. ③ netFinancial·④ cap·⑤ deduction은 엔진 fdd 단일출처 유지.

## 5. Pre-Do Anchor (`__tests__/calc/deduction-besshi-data.test.ts`)

| anchor | 입력 | 수정 전 | 수정 후 |
|---|---|---|---|
| B5-A1(항목별 자기일관) | estateItems[금융자산 12억 + 토지(deductSecuredClaimAsDebt, mortgage 5천만·securedClaimIsFinancialDebt)] + debtItems[금융채무 1억] + fdd.netFinancial=10.5억 | `①−② = 11억 ≠ ③ 10.5억`(저당분 5천만 누락) | `debtRows`에 "담보 금융저당" 5천만 행, `①−② === ③`(10.5억) |
| B5-A2(legacy 분류) | fdd.rows에 `{label:"담보 금융저당",amount:5천만}` 포함, estateItems·debtItems 미제공 | "담보 금융저당"이 assetRows에 분류(debtRows 누락) | debtRows에 "담보 금융저당", assetRows 제외 |
| B5-A3(회귀) | 저당분 없음(financialDebtAmount=0 또는 estateItems에 담보 없음) | 정상 | debtRows 불변(기존 E-8·R-C1 통과 유지) |

> B5-A1·A2는 수정 전 실패 확보(메모리 `pre-do-anchor-verification`). 자기일관 `assetTotal − debtTotal === netFinancial` 불변식 anchor(기존 E-6 패턴).

## 6. 실행 순서 · 커밋

| Phase | 내용 | 커밋 |
|---|---|---|
| A | anchor B5-A1·A2·A3 (B5-A1·A2 실패 확보) | (B와 합본) |
| B | 라벨 상수화 + `isDebtLabel` 확장 + 항목별 저당분 행 주입 | `fix(inheritance): 부표5 §22 담보 저당분 「채무」 표시 — 자기일관 복구` |

검증: `npx tsc --noEmit` 0건 + `npx vitest run __tests__/calc/deduction-besshi-data.test.ts` + 전체 `npm test`. 표시 어댑터라 E2E는 부표5 렌더 기존 spec 회귀로 충족(신규 E2E 선택).

## 7. 오픈 이슈

1. ✅ **§22② 최대주주 제외 상호작용** — 3-2를 fdd.rows 읽기로 확정하여 해소(엔진 §22② 적용 후 값 사용 → ③과 정합).
2. **항목별 모드 assetRows 저당분 자산 포함 여부**: 담보 설정된 금융자산이 assetRows ①에 그대로 포함되는지(저당분은 자산가치 무관·채무 차감이므로 ① 불변, ② 증가가 정상). E-8 패턴으로 Do 시 확인.

> 모든 file:line 실측 인용. 3-2 fdd.rows 읽기 확정(오픈이슈 1 해소). B5-A1·A2 실패 확보 후 Do.

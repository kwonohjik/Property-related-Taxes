# 담보채무 §14 부채 자동 반영 + 채무 입력 화면 자동 노출 — 작업계획서

> 작성일: 2026-05-26
> 선행: `project_inheritance_collateral_66_max` Phase 1 완료(§66 = MAX 하한 정정). 본 계획 = **Phase 2 자동반영**.
> 관련 메모리: `project_inheritance_collateral_66_max` · `project_inheritance_debt_allocation_activation` · `feedback_useeffect_store_mirror_forbidden` · `feedback_no_silent_apportion_fallback`
> 적용 스킬: `mirror-pattern` · `single-source-engine-helper`(§22 판정 resolver 재사용) · `pre-do-anchor-verification` · `korean-law-citation-verify` · `tax-field-add` · `echo-field-pattern`
>
> **결정 (사용자, 2026-05-26)**: **방안 A — SSOT + 엔진 파생**. 추가 요구 = 담보채무를 **채무 입력 화면(Step 2)에 읽기전용 카드로 자동 노출**하여 "해당 채무가 이미 반영되었음"을 사용자가 인식 → 중복 입력 사전 차단.
>
> **✅ 법령 검증 완료 (2026-05-26, KoreanLaw MCP)**: 법 §14·§66·§22 / 시행령 §63·§19 본문 전수 대조 (법 MST 276123 시행 2026.01.02 / 시행령 MST 283637 시행 2026.02.27).
> - **정정 1**: "§14(채무공제)" → **거주자 §14①3호**(일반 "채무"). "저당권·전세권·임차권으로 담보된 채무" 명시 열거는 **§14②2호(비거주자)** — 본 기능 거주자 기준이므로 §14①3호가 근거.
> - **강조 1**: §66 평가 상향("그 재산이 담보하는 채권액")은 물상보증 포함이나, §14①3호 공제는 **"피상속인의 채무"** 한정 → **§66 평가 ≠ §14 공제** 분리. 물상보증은 평가만 상향, opt-in OFF.
> - **확인**: §66=MAX(§60평가, 담보채권액) / 시행령 §63② 다수채권(전세금+임차보증금) 합계액 / §22 순금융 한도 2억 / **§19④ §10①1호 입증 금융회사 채무만 §22 차감**.

---

## 0. 배경 — 중복 입력 위험의 구조

| 입력 경로 | 필드 | 용도 | 과세가액 영향 (현행) |
|---|---|---|---|
| **재산평가** (자산 카드) | `EstateItem.mortgageAmount` · `leaseDeposit` | §66·시행령 §63 평가액 **하한(MAX)** 판정 | 평가액에서 **차감 안 함** |
| **채무 명세** (Step 2) | `DebtItem` (`debtItems`) | §14 부채 공제 | 과세가액에서 **차감** |

**현행 (Phase 1)**: 담보채권액은 §66 하한 판정에만 쓰이고, §14 공제는 사용자가 `debtItems`에 **수동 재입력**(`COLLATERAL_DEBT_NOTICE` 안내).

**Phase 2 자동반영 시 중복 위험**: 담보채권액을 §14로 자동 공제하면서 사용자가 같은 채무를 `debtItems`에도 입력 → **이중 공제**.

**해결 핵심**: ① 담보채무 입력 위치를 **재산평가 1곳**으로 고정(SSOT) ② 엔진이 §14를 **파생(derive)** 합산만(`debtItems`에 물리적으로 쓰지 않음 — `mirror-pattern` 준수) ③ Step 2에 **자동 반영분을 읽기전용 카드로 노출** + `debtItems` 수동 중복 입력 안내·검출.

**범위 (L-2)**: 본 기능은 **거주자 상속(§14①3호)** 기준. 비거주자(§14②2호 — 담보채무 명시열거)는 현행 앱이 거주자 전제이므로 **범위 외**(후속). 거주자 §14①3호는 "피상속인의 채무"이면 담보 여부 무관하게 공제되므로 본 자동반영이 적용된다.

---

## 1. 현행 코드 흐름 (검증 완료, 2026-05-26)

| 위치 | 내용 |
|---|---|
| `property-valuation.ts:69` `applyCollateralFloor` | `securedClaim = (mortgageAmount ?? 0) + (leaseDeposit ?? 0)`. `valuatedAmount = MAX(평가액, securedClaim)`. 차감 아님 |
| `property-valuation.ts:79` `COLLATERAL_DEBT_NOTICE` | "담보채무는 평가액에서 차감 안 됨 → §14 부채 명세에 입력해야 공제" 수동 안내 |
| `inheritance-tax.ts:112-147` STEP 3 | `debtItems` 있으면 category별 합산(`nonFuneralDebts`/`funeralDeduction`) 우선. 미입력 시 legacy `debts`/`funeralExpense` |
| `inheritance-tax.ts:187` STEP 5 | 과세가액 = 평가액 + 추정상속 − 비과세 − `deductedBeforeAggregation`(채무+장례비) + 사전증여 |
| `inheritance-allocation.ts` `resolveAllocationsByHeir` | `heirAllocations` 입력 자산은 그 합, 미입력은 법정상속분 배분 |
| `lib/calc/financial-deduction-resolver.ts:88` `resolveFinancialDebt` | §22 차감 채무 **적격 판정만**(boolean). `category==="financial"` AND `isFinancialDebtForDeduction` |
| `lib/calc/inheritance-deduction-suggest.ts:109` `suggestNetFinancialAssets` | §22 순금융 **제안값** 집계 = `Σ금융자산 − Σ금융채무(debtItems만)`, clamp 0. **현재 EstateItem 담보채무 미포함** |
| `components/calc/InheritanceTaxForm.tsx:250` · `shared.ts:42` | **엔진 input `netFinancialAssets`는 폼 직접 입력값** — suggest는 AutoSuggestBadge "제안"일 뿐, 사용자가 적용해야 반영 |
| `inheritance-deductions.ts:165` `calcFinancialDeduction` | 엔진은 `input.netFinancialAssets` 그대로 받아 §22 공제 산출 — **담보채무 존재를 모름** |

> **3중 영향 경로 — 메커니즘이 다름** (M-1 정정):
> - **(a) §14 채무공제** → 엔진 `deriveCollateralDebts` **강제 합산** (사용자 개입 불필요, 확실)
> - **(b) 협의분할 분배** → 엔진 `inheritance-allocation.ts`에서 연결 자산 `heirAllocations` 상속
> - **(c) §22 순금융 차감** → `netFinancialAssets`가 **폼 직접입력**이므로 엔진 강제 불가. `suggestNetFinancialAssets` **제안 산식**에 담보채무 차감을 추가 → **사용자가 제안을 적용해야** 반영. §14와 성격이 다름 ★

---

## 2. 설계 — 방안 A (SSOT + 엔진 파생 + 자동 노출)

### 2-1. 데이터 모델 (SSOT = `EstateItem`)

신규 필드 (모두 `EstateItem`에 optional 추가):

| 필드 | 타입 | 의미 | 기본값 정책 |
|---|---|---|---|
| `deductSecuredClaimAsDebt?` | `boolean` | **명시 opt-in** — ON 시 securedClaim을 §14 부채로 자동 공제 | `undefined`=미반영 (자동 침묵 금지 — `feedback_no_silent_apportion_fallback`) |
| `securedClaimIsFinancialDebt?` | `boolean` | **`mortgageAmount`(저당)** 이 §10①1호 입증 금융회사 채무인지 (§22 순금융 차감 여부). **`leaseDeposit`(임대보증금)은 §22 대상 아님 — 항상 제외** (§19④ 금융회사 채무 한정, R-2) | `undefined`=차감 안 함 (보수적). 저당권은 통상 금융기관 → UI 기본 ON 제안 |
| `securedClaimCreditorName?` | `string` | 자동 노출 카드 표시명 (선택) | 미입력 시 "{자산명} 담보채무" |

> `mortgageAmount`·`leaseDeposit`는 **기존 필드 재사용** — 신규 입력란 없음. opt-in 토글만 추가.
> **§14 vs §22 차감 범위 분리 (R-2)**: §14 자동공제 = `mortgageAmount + leaseDeposit`(피상속인 채무 전부). §22 금융채무 차감 = `securedClaimIsFinancialDebt ? mortgageAmount : 0`(저당만, 임대보증금 제외).

### 2-2. 엔진 — 파생 합산 (debtItems에 쓰지 않음)

신규 순수 헬퍼 `lib/tax-engine/inheritance-collateral-debt.ts`:

```ts
// EstateItem[] 중 deductSecuredClaimAsDebt===true 인 항목의 담보채권액을 §14 부채 항목으로 derive
export interface DerivedCollateralDebt {
  estateItemId: string; creditorName: string;
  amount: number;                 // §14 공제액 = mortgageAmount + leaseDeposit (피상속인 채무 전부)
  financialDebtAmount: number;    // §22 금융채무 차감액 = securedClaimIsFinancialDebt ? mortgageAmount : 0
                                  //   (leaseDeposit은 §19④ 금융회사 채무 아니므로 §22 제외, R-2)
  heirAllocations?: HeirAllocation[]; // ← 연결 EstateItem.heirAllocations 상속
}
export function deriveCollateralDebts(items: EstateItem[]): DerivedCollateralDebt[]
```

- **(a) §14 — STEP 3 통합** (`inheritance-tax.ts`, **엔진 강제**): `nonFuneralDebts += Σ deriveCollateralDebts(...).amount`. breakdown에 "담보채무 §14 자동공제 (자산 평가 연동)" 행 별도 표기. opt-in ON이면 사용자 개입 없이 확실 반영.
- **(b) 협의분할 (`inheritance-allocation.ts`)**: 파생 담보채무는 연결 자산 분배를 **비율로 환산하여 상속** → 담보 재산을 받은 상속인이 그 채무도 부담(추가 입력 불필요). **★ E-1 (디자인 §2-3)**: `resolveAllocationsByHeir`는 `heirAllocations.amount`를 **직접 합산**(비율 아님)하므로, 자산 분배(amount 합=평가액)를 그대로 넘기면 채무가 평가액만큼 분배되는 버그. 반드시 `scaleAllocations(assetAllocs, collateralAmount)`로 비율 환산(`floor(채무액 × heirAmount / Σ)` + 마지막 잔액 흡수, `feedback_floor_residual_absorption`).
- **(c) §22 순금융 — `suggestNetFinancialAssets`** (`lib/calc/inheritance-deduction-suggest.ts`, **제안 기반**): 파생 담보채무의 **`financialDebtAmount`(저당분만, 임대보증금 제외)** 를 제안 산식의 `debts` 합에 추가 차감. **단 `netFinancialAssets`는 폼 직접입력값이므로 사용자가 제안(AutoSuggestBadge)을 적용해야 반영** — `financial-deduction-resolver.ts`는 판정만(single-source). breakdown에 "담보채무(금융 저당) 차감 N건" 행. **엔진 `calcFinancialDeduction`은 무변경**.
- **결과 echo** (`echo-field-pattern`): `InheritanceTaxResult.collateralDebtDetail?: DerivedCollateralDebt[]` — 결과 카드·자동 노출 카드 표시용. **계산 산식 불변**. emit 위치 전수(정상 + `buildExemptResult` 등 조기 반환 경로) + UI mock 동기화 (L-3).

### 2-3. 중복 방지 3중 장치

1. **자동 노출 카드 (★ 사용자 핵심 요구)**: Step 2 `DebtAllocationInput` 상단에 **"자산 평가에서 반영된 담보채무"** 읽기전용 섹션 (slate/회색 tone, 잠금 아이콘). 각 행 = 자산명 · 담보채권액 · 금융채무 배지 · 분배(연결 상속인). "이 채무는 이미 §14 자동 공제됩니다. 재산평가 화면에서 수정하세요."
2. **수동 중복 안내·검출**: 사용자가 `debtItems`에 동일 명칭·금액 입력 시 validation `warning` ("자산 평가 담보채무와 중복 의심 — 이중 공제 위험"). 차단이 아닌 경고(명칭 매칭 불확실).
3. **`COLLATERAL_DEBT_NOTICE` 문구 전환**: "수동 입력하세요" → "자산 평가에서 [담보채무 자동공제] 토글 ON 시 §14 자동 반영. 별도 입력 불필요."

### 2-4. 미러링 금지 준수

자동 노출 카드는 `estateItems`(또는 파생 `collateralDebtDetail`)에서 **표시만**(derive). **절대 `debtItems` store에 쓰지 않음** (`useEffect→store` 무한 루프 차단). props로 읽기전용 전달.

---

## 3. 케이스 인벤토리 (Do 진입 전 행≥1 필수)

| ID | 시나리오 | 입력 | 기대 |
|---|---|---|---|
| **CD-1** | opt-in OFF (현행 유지) | `mortgageAmount=1.5억`, `deductSecuredClaimAsDebt=undefined` | §14 자동공제 0. 평가액 하한만(현행 회귀 0) |
| **CD-2** | opt-in ON, 평가액>담보 | `평가액=5억`, `mortgageAmount=1.5억`, ON | 평가액 5억 유지(하한 미발동) + §14 채무 −1.5억 |
| **CD-3** | opt-in ON, 저당=금융채무 (§22 제안) | CD-2 + `securedClaimIsFinancialDebt=true` + **금융자산(예금) 3억** | ① §14 자동 −1.5억(엔진 강제) ② `suggestNetFinancialAssets`: 순금융 3억 → `financialDebtAmount` −1.5억 → **순금융 1.5억** → §22 공제 6천만(한도 전)→3천만으로 **감소**(제안 적용 시) |
| **CD-3b** | CD-3에서 제안 **미적용** | CD-3 + 사용자가 `netFinancialAssets`=3억 직접입력(담보채무 미반영) | §14는 −1.5억(엔진 강제) 유지. §22는 입력 3억대로(담보채무 미차감, 공제 6천만) — **제안 기반 한계 실증** |
| **CD-4** | opt-in ON + 협의분할 (비율 환산) | CD-2 + 자산 `heirAllocations`(배우자 60%·장남 40%, 평가 5억→3억/2억) | 담보채무 1.5억 **비율 환산** → 배우자 9천만·장남 6천만 (Σ=1.5억, E-1) |
| **CD-4b** | 협의분할 floor 잔액 | CD-4 + 1/3·2/3 분배 | 마지막 상속인 잔액 흡수로 Σ=정확히 담보채무액 |
| **CD-5** | opt-in ON + `debtItems` 동일 채무 수동 입력 | CD-2 + `debtItems`에 "근저당 1.5억" | **엔진 거동(Phase A 자동발생): 양쪽 차감(이중, −3억)** + validation **warning**(Phase B). 자동노출 카드로 인지 차단 우선, 사용자가 수동분 삭제 유도 (명칭 매칭 불확실로 자동 차단 불가) |
| **CD-6** | 임대보증금 담보 | `leaseDeposit=2억`, `mortgageAmount=0`, ON | §14 −2억 반영. **§22 차감 0**(`financialDebtAmount = mortgageAmount(0)` — 임대보증금은 §19④ 금융채무 아님, R-2) |
| **CD-7** | 자동 노출 카드 표시 | CD-2 estateItems | Step 2 읽기전용 카드에 자산명·1.5억·분배 노출. `debtItems` store 불변(derive only) |
| **CD-8** | 물상보증 (타인 채무 담보) | `mortgageAmount=1.5억`, opt-in OFF (물상보증) | §14 자동공제 0. 토글 description에 "물상보증 OFF 유지" 안내 (§14①3호 "피상속인 채무" 아님) |

---

## 4. Pre-Do anchor 계획 (`pre-do-anchor-verification`)

Do 전 아래 anchor 우선 작성·실행. "현행 일치 예상" 가정 금지.

| anchor | 입력 | 기대 | 현행 예상 | 용도 |
|---|---|---|---|---|
| **AC-1** | CD-2 (opt-in ON) — 엔진 `calcInheritanceTax` | 과세가액 §14 −1.5억 (엔진 강제) | 현행 미반영(0) → **실패** | §14 자동반영 미구현 실증 |
| **AC-2** | CD-1 (opt-in OFF) — 엔진 | §14 자동공제 0 | 현행 일치(통과 예상) | 회귀 가드 (OFF 무손상) |
| **AC-3** | CD-3 — `suggestNetFinancialAssets(estateItems, debtItems)` | 제안값 `debts`에 담보채무(금융) −1.5억 포함 | 현행 미포함(EstateItem 담보채무 무시) → **실패** | §22 **제안 산식** 경로 실증 (lib/calc, 엔진 아님) |

**AC-1·AC-3 실패 확보 후** 구현 진입. AC-1은 엔진(lib/tax-engine), AC-3은 변환층(lib/calc) — **레이어가 다름**. `feedback_numeric_impact_verify_before_bug_claim`: opt-in OFF(현행 기본)에서는 무변동이 정상 — 트리거 입력(ON)으로 실증.

---

## 5. 작업 분해 (PR 단위 — 엔진→UI 시퀀셜)

### Phase 0 — 법령 검증 (`korean-law-citation-verify`) ✅ 2026-05-26 완료
- **PR-0**: KoreanLaw MCP 전수 대조 완료(상단 배지). 핵심 확정:
  - **§14①3호**(거주자 일반 "채무") = 담보채무 §14 공제 근거. 비거주자 §14②2호(담보채무 명시열거)는 별개.
  - **§66 평가 상향 ≠ §14 공제** 분리 — 물상보증(피상속인 채무 아님)은 §66 평가만 상향, §14 미공제.
  - 시행령 §63②(다수채권 합계) / §19④(§10①1호 입증 금융회사 채무만 §22 차감) 확정.
  - 잔여: legal-codes 상수 키 확인(`INH.DEBT_DEDUCTION`·`VALUATION.COLLATERAL_SPECIAL` 등). (장례비 §9는 본 기능 무관 — 기존 `debt-allocation` 검증 완료, 범위 외)

### Phase A — §14 엔진 자동 반영 (CD-1·CD-2·CD-4·CD-4b·CD-6·CD-8) ★최우선
- **PR-A1**: Pre-Do anchor AC-1 작성 → 실패 확보 (엔진 강제 §14)
- **PR-A2** (타입): `EstateItem`에 `deductSecuredClaimAsDebt?`·`securedClaimIsFinancialDebt?`·`securedClaimCreditorName?` 추가. `InheritanceTaxResult.collateralDebtDetail?` echo 추가 (emit 위치 전수)
- **PR-A3** (엔진): `inheritance-collateral-debt.ts` 신규(`deriveCollateralDebts` + `scaleAllocations` 비율 환산). STEP 3 §14 강제 합산 + breakdown 별도 행. `inheritance-allocation.ts` 협의분할 (환산된 heirAllocations 합산)
- **PR-A4**: AC-2 회귀(OFF 무손상) + CD-1·2·4·4b·6·8 anchor 통과

### Phase A′ — §22 순금융 제안 반영 (CD-3·CD-3b) — lib/calc (엔진 아님)
- **PR-A′1**: Pre-Do anchor AC-3 작성 → 실패 확보 (`suggestNetFinancialAssets` 제안값)
- **PR-A′2**: `suggestNetFinancialAssets(estateItems, debtItems)`에 **파생 담보채무(금융)** 차감 추가 — `resolveFinancialDebt` 판정 재사용(single-source). breakdown "담보채무(금융) 차감 N건" + notes "담보채무가 §22 제안에 반영됨, 적용 버튼 필요". 엔진 무변경. CD-3b(제안 미적용 시 §22 무반영) 한계 anchor

### Phase B — UI 자동 노출 + 중복 방지 (CD-5·CD-7) — `mirror-pattern`
- **PR-B1** (재산평가 UI): `PropertyValuationForm` 담보채무 입력 옆 **[담보채무 §14 자동공제] ToggleCard**(amber) + 금융채무 여부 토글 + 채권자명 + 물상보증 OFF 안내(CD-8). `COLLATERAL_DEBT_NOTICE` 문구 전환
- **PR-B2** (Step 2 자동 노출): `DebtAllocationInput`에 `derivedCollateralDebts` prop 추가 → 상단 **읽기전용 카드 섹션**(slate tone, 잠금). store 불변(derive only)
- **PR-B3** (validation): `debtItems` 수동 중복 의심 시 warning(CD-5). 8지점 ⑧ 동기화

---

## 6. 동기화 지점 매핑 (Definition of Done — `tax-field-add` 8지점)

신규 `EstateItem` 3필드:

| # | 지점 | 위치 | 작업 |
|---|---|---|---|
| ① | 폼 상태 | `components/calc/inheritance/shared.ts` (EstateItem 폼) | 3필드 추가 |
| ② | initial | 동상 | undefined/false 기본 |
| ③ | normalize | 동상 (sessionStorage 마이그레이션) | optional fallback |
| ④ | API 변환 | `lib/calc/inheritance-*.ts` (route 진입 변환) | EstateItem 3필드 매핑 + `suggestNetFinancialAssets` 담보채무 차감(PR-A′2) |
| ⑤ | UI 위젯 | `PropertyValuationForm` 담보채무 토글 + Step 2 자동 노출 카드 | PR-B1·B2 |
| ⑥ | 사이드바 합계 | 채무 합계에 파생 담보채무 **포함** (자동노출 카드와 일관 — 확정) | 표시 정합 |
| ⑦ | 결과 카드 | `InheritanceTaxResultView` — `collateralDebtDetail` 노출. **emit 위치 전수**(정상+조기반환) + UI mock 동기화 | echo 표시 (L-3) |
| ⑧ | Validation | `lib/calc/inheritance-validate*.ts` — 중복 의심 warning + opt-in ON 시 securedClaim(`mortgageAmount`+`leaseDeposit`)>0 검증 | PR-B3 |

> Zod·body spread·route 매핑(⑫⑬⑭) grep 자가점검 — `EstateItem`은 배열 요소이므로 spread 경로 확인.

---

## 7. 위험·정책

| 위험 | 대응 |
|---|---|
| 자동 노출 카드를 `debtItems`에 쓰면 무한 루프 | **derive only** — props 읽기전용 전달. `mirror-pattern` ★★★ |
| opt-in 자동 침묵 반영 | `deductSecuredClaimAsDebt` **명시 ON**일 때만. `feedback_no_silent_apportion_fallback` |
| 수동 중복 입력 검출 불완전 (명칭 불일치) | 자동 노출 카드로 **인지 차단** 우선 + warning 보조. 완전 차단은 명칭 매칭 한계로 미적용 |
| **§22 제안 미적용 시 미반영** ★ | `netFinancialAssets`는 폼 직접입력 → 담보채무가 §22 제안에 반영돼도 **사용자가 적용 안 하면 미반영**(CD-3b). §14(엔진 강제)와 달리 자동 보장 불가 — AutoSuggestBadge notes로 "담보채무 반영됨, 적용 필요" 안내. 완전 자동화는 폼 구조상 불가(설계 한계 명시) |
| §22 금융채무 여부 오판 | `securedClaimIsFinancialDebt` 사용자 명시. 저당권 UI 기본 제안 ON, 임대보증금 OFF (상증령 §19④) |
| 협의분할 분배 불일치 | 연결 자산 `heirAllocations` 상속 — 별도 입력 없음. 자산 미분배 시 법정상속분 fallback |
| **담보채무 = 피상속인 채무 아닐 수 있음 (물상보증)** ★ | **§66 평가 상향은 물상보증 포함이나 §14①3호 공제는 "피상속인의 채무" 한정** (KoreanLaw 검증). opt-in 토글 description에 "타인 채무를 담보한 물상보증은 §14 공제 대상 아님 — OFF 유지" 명시. **자동반영 핵심 가드** |

---

## 8. 완료 기준

- [ ] PR-0 KoreanLaw §14①3호·§66·§22·§63②·§19④ 검증(✅) + legal-codes 상수 키 확인
- [ ] AC-1(엔진 §14)·AC-3(lib/calc §22 제안) Pre-Do anchor 실패 확보 → 구현 후 통과
- [ ] CD-1~CD-8(+CD-3b·CD-4b) anchor 전수 통과 (특히 CD-1 opt-in OFF 회귀 0, CD-4/4b 비율 환산 Σ 정합, CD-8 물상보증 미공제)
- [ ] 자동 노출 카드 표시 + `debtItems` store 불변 anchor (CD-7)
- [ ] §22 순금융 **제안값** 담보채무 차감 (CD-3) + 제안 미적용 한계 확인 (CD-3b)
- [ ] 협의분할 연결 자산 상속 (CD-4)
- [ ] `collateralDebtDetail` emit 위치 전수 + 사이드바 채무 합계 포함 (⑥⑦)
- [ ] 8지점 동기화 (⑫⑬⑭ grep 자가점검)
- [ ] `npx tsc --noEmit` 0건 / `npx vitest run __tests__/tax-engine/inheritance/` 통과
- [ ] 브라우저 수동 확인 (재산평가 토글 ON → Step 2 자동 노출 카드 → 결과 §14 반영)
- [ ] `ui-engine-sync-checker` 호출

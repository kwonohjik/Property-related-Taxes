# 담보채무 §14 자동 반영 + 채무 입력 화면 자동 노출 — 설계 문서

> 작성일: 2026-05-26
> 계획서: `docs/00-pm/inheritance-collateral-debt-auto-deduction.plan.md`
> 법령 검증: ✅ KoreanLaw MCP (법 §14①3호·§66·§22 / 시행령 §63②·§19④, 2026-05-26)
> 적용 스킬: `mirror-pattern` · `single-source-engine-helper` · `echo-field-pattern` · `tax-field-add` · `pre-do-anchor-verification`

---

## §0. 범위·메커니즘 요약

거주자 상속(§14①3호) 기준. 담보채무를 §66 평가 하한 판정 + **§14 자동 공제**로 확장하되, 입력은 재산평가 1곳(SSOT)으로 고정하고 채무 입력 화면(Step 2)에 **읽기전용 자동노출 카드**로 인지시켜 중복 입력을 막는다.

| 경로 | 메커니즘 | 레이어 | 사용자 개입 |
|---|---|---|---|
| **(a) §14 채무공제** | `deriveCollateralDebts` 강제 합산 | 엔진 (lib/tax-engine) | 불필요 (확실) |
| **(b) 협의분할 분배** | 연결 자산 `heirAllocations` 상속 | 엔진 (inheritance-allocation) | 불필요 |
| **(c) §22 순금융 차감** | `suggestNetFinancialAssets` 제안값 차감 | 변환층 (lib/calc) | **제안 적용 필요** (한계) |

---

## §1. 데이터 모델

### 1-1. `EstateItem` 신규 필드 (3종, optional)

```ts
// lib/tax-engine/types/inheritance-gift.types.ts (EstateItem)
deductSecuredClaimAsDebt?: boolean;   // 명시 opt-in — ON 시 §14 자동공제. undefined=미반영
securedClaimIsFinancialDebt?: boolean; // mortgageAmount(저당)이 §19④ 금융회사 채무인지 (§22 차감). leaseDeposit은 항상 §22 제외
securedClaimCreditorName?: string;     // 자동노출 카드 표시명. 미입력 시 "{name} 담보채무"
```

기존 `mortgageAmount`·`leaseDeposit` 재사용 — 신규 입력란 없음.

### 1-2. 파생 타입 `DerivedCollateralDebt`

```ts
// lib/tax-engine/inheritance-collateral-debt.ts (신규)
export interface DerivedCollateralDebt {
  estateItemId: string;
  creditorName: string;
  amount: number;              // §14 = mortgageAmount + leaseDeposit (피상속인 채무 전부)
  financialDebtAmount: number; // §22 = securedClaimIsFinancialDebt ? mortgageAmount : 0
  heirAllocations?: HeirAllocation[]; // 연결 자산 분배 "비율"로 환산한 amount (합=this.amount), E-1
}
```

> **E-1 — 비율 환산 필수**: `inheritance-allocation.ts`의 `resolveAllocationsByHeir`는 `heirAllocations.amount`를 **직접 합산**(비율 아님). 자산 분배(amount 합=평가액)를 담보채무에 그대로 넘기면 채무가 평가액만큼 분배되는 버그. 담보채무 분배는 **자산 비율로 재환산**: `amount_i = floor(collateralAmount × assetAlloc_i.amount / Σ assetAlloc.amount)`, 마지막 상속인이 floor 잔액 흡수(`feedback_floor_residual_absorption`).

### 1-3. 결과 echo

```ts
// InheritanceTaxResult
collateralDebtDetail?: DerivedCollateralDebt[]; // 산식 불변 — 결과 카드·자동노출 카드 표시용
```

emit 위치: 정상 반환 + 조기 반환 경로(`buildExemptResult` 등) **전수** + UI mock 동기화.

---

## §2. 엔진 설계

### 2-1. `deriveCollateralDebts(items: EstateItem[]): DerivedCollateralDebt[]`

```
for item of items:
  if item.deductSecuredClaimAsDebt !== true: continue          # opt-in 가드
  const mortgage = item.mortgageAmount ?? 0
  const lease    = item.leaseDeposit ?? 0
  const amount   = mortgage + lease                            # §14
  if amount <= 0: continue                                     # 0 가드
  push({
    estateItemId: item.id,
    creditorName: item.securedClaimCreditorName || `${item.name} 담보채무`,
    amount,
    financialDebtAmount: item.securedClaimIsFinancialDebt ? mortgage : 0,  # §22(저당만)
    heirAllocations: scaleAllocations(item.heirAllocations, amount),  # E-1 비율 환산
  })

// E-1: 자산 분배를 담보채무액 비율로 환산 (합 = collateralAmount 보장)
function scaleAllocations(assetAllocs, collateralAmount):
  if !assetAllocs or length==0: return undefined         # 미분배 → 법정상속분 fallback
  const denom = Σ assetAllocs.amount                      # = 자산 평가액
  if denom <= 0: return undefined
  let running = 0
  return assetAllocs.map((a, i) =>
    i < last ? { heirId, amount: floor(collateralAmount × a.amount / denom) } (running += amount)
             : { heirId, amount: collateralAmount − running })  # 마지막=잔액 흡수
```

순수 함수. DB·Date 의존 없음.

### 2-2. STEP 3 §14 통합 (`inheritance-tax.ts:112~`)

```
const collateralDebts = deriveCollateralDebts(input.estateItems ?? []);
const collateralTotal = Σ collateralDebts.amount;
nonFuneralDebts += collateralTotal;                            # 기존 합산에 추가
if (collateralTotal > 0)
  allBreakdown.push({ label: "담보채무 §14 자동공제 (자산 평가 연동)",
                      amount: -collateralTotal, lawRef: INH.DEBT_DEDUCTION });
result.collateralDebtDetail = collateralDebts;                 # echo
```

**legacy/debtItems 경로 모두**에 가산 (debtItems 유무 무관 — 담보채무는 별개 출처).

### 2-3. 협의분할 (`inheritance-allocation.ts`)

파생 담보채무는 `heirAllocations`(E-1 비율 환산 완료, 합=`amount`)를 가진 가상 채무로 취급 → `resolveAllocationsByHeir`가 amount 직접 합산으로 상속인별 차감(환산값이라 정합). 미분배(자산 `heirAllocations` 없음 → `scaleAllocations`가 undefined) 시 법정상속분 fallback (기존 동작).

### 2-4. §22 순금융 제안 (`lib/calc/inheritance-deduction-suggest.ts`, 엔진 아님)

```
// suggestNetFinancialAssets(estateItems, debtItems) 내부
const collateralFinancial = Σ deriveCollateralDebts(estateItems).financialDebtAmount;
const debts = Σ eligibleDebts.amount + collateralFinancial;    # 저당분 추가 차감
const value = Math.max(0, assets - debts);
breakdown.push(`담보채무(금융 저당) 차감: ${collateralFinancial}원`);
notes.push("담보채무가 §22 제안에 반영됨 — [적용] 버튼을 눌러야 순금융재산에 반영됩니다");
```

`resolveFinancialDebt` 판정 로직 재사용 (single-source). **엔진 `calcFinancialDeduction` 무변경** (input.netFinancialAssets 그대로).

---

## §3. UI 설계

### 3-1. 재산평가 토글 (`PropertyValuationForm.tsx` ItemEditor) — 지점 ⑤a

**배치 위치 (U-1)**: `ItemEditor`(line 150~) 내 저당권 입력 + 임대보증금 입력(line 334·401) **직후**. **노출 카테고리**: `real_estate_land`·`real_estate_apartment`·`real_estate_building`·`deposit` 한정 (cash·financial·listed/unlisted_stock은 담보 입력 없음 — line 159 주석 근거). 미리보기는 `property-valuation-preview.tsx`(securedClaim MAX 하한 표시)와 같은 영역.

```
[ToggleCard amber] "이 담보채무를 §14 부채로 자동 공제"
  checked = deductSecuredClaimAsDebt
  description(ON):  "재산평가 담보채권액(저당 + 임대보증금)이 §14 채무로 과세가액에서 공제됩니다.
                     채무 명세(Step 2)에 중복 입력하지 마세요."
  description(OFF): "타인 채무를 담보한 물상보증은 OFF 유지 — §14 공제 대상이 아닙니다(§14①3호 '피상속인의 채무')."
  children(ON):
    [ToggleCard rose, size=sm] "저당채무가 금융회사 채무 (§22 순금융 차감)"
       checked = securedClaimIsFinancialDebt
       description: "은행 등 §10①1호 입증 금융회사 저당이면 ON. 임대보증금은 §22 대상 아님(자동 제외)."
       disabled = (mortgageAmount ?? 0) === 0   # 저당 없으면 §22 무관
    [text input] 채권자명 (securedClaimCreditorName, placeholder="채권자·내용")
```

토글은 `mortgageAmount > 0 || leaseDeposit > 0`일 때만 노출 (담보채권액 없으면 무의미).

### 3-2. Step 2 자동노출 카드 (`DebtAllocationInput.tsx`) — 지점 ⑤b ★사용자 핵심 요구

`DebtAllocationInput`에 `derivedCollateralDebts: DerivedCollateralDebt[]` prop 추가. **상단**에 읽기전용 섹션:

```
{derivedCollateralDebts.length > 0 && (
  <div className="rounded-md border border-slate-300 bg-slate-50/60 ...">  // slate=읽기전용
    🔒 자산 평가에서 반영된 담보채무 (§14 자동 공제)
    {각 행}: {creditorName} · {formatKRW(amount)} · [금융채무 배지 if financialDebtAmount>0]
             · 분배: {heirAllocations → 상속인명 or "법정상속분"}
    <p className="text-xs">이 채무는 재산평가에서 자동 §14 공제됩니다. 수정은 재산평가 화면에서.
       아래에 중복 입력하지 마세요 (이중 공제).</p>
  </div>
)}
```

**미러링 금지 (`mirror-pattern`)**: derive only — `derivedCollateralDebts`는 props로 받아 **표시만**. `onChange(debtItems)`로 store에 쓰지 않음.

**호출부 수정 (U-2, `steps.tsx:203` Step2)**:
```tsx
// Step2 컴포넌트 내 (form.estateItems 접근 가능 — shared.ts:21)
const derivedCollateralDebts = useMemo(
  () => deriveCollateralDebts(form.estateItems),
  [form.estateItems],
);
<DebtAllocationInput
  items={form.debtItems ?? []}
  heirs={heirs}
  derivedCollateralDebts={derivedCollateralDebts}   // ← 신규 prop
  onChange={(items) => set({ debtItems: items })}
/>
```

**derive 대상 (U-3)**: `form.estateItems`만. `stockItems`(비상장주식)는 담보채무 입력 없음 → 범위 외 (사이드바 `totalDebts`도 estateItems 파생분만 가산).

정적 tone 매핑 (`feedback_tailwind_static_tone_mapping`): `slate` 클래스 정적 객체.

### 3-3. 결과 카드 (`InheritanceTaxResultView.tsx`) — 지점 ⑦ (U-4)

2경로:
1. **CalculationStep 자동 표시** (별도 작업 0): STEP3에서 push한 "담보채무 §14 자동공제 (자산 평가 연동)" breakdown 행이 기존 산식 목록(`InheritanceTaxResultView` "장례비·채무 차감" line 438 인근)에 자동 노출.
2. **`DebtAllocationResultCard` 확장** (line 31 import·527 렌더): `collateralDebtDetail` 존재 시 "담보채무 §14 자동공제" 행 추가 — 각 자산별 `amount`·금융채무 배지·상속인별 분배(heirAllocations). 산식 한국어 풀어쓰기.

### 3-4. 사이드바 (`InheritanceSidebar.tsx` / `computeInheritanceSummary`) — 지점 ⑥

`totalDebts`에 파생 담보채무(`Σ amount`) **포함** — 자동노출 카드와 일관. `computeInheritanceSummary`가 `form.estateItems`에서 `deriveCollateralDebts` 합산.

### 3-5. Validation (`lib/calc/inheritance-validate.ts`) — 지점 ⑧

- opt-in ON인데 `mortgageAmount + leaseDeposit === 0` → 오류 ("담보채권액을 입력하세요").
- `debtItems`에 자동노출 담보채무와 **금액 일치(±0)** 의심 시 `warning`(차단 아님): "자산 평가 담보채무와 중복 의심 — 이중 공제 위험". (E-2: 명칭은 자유입력이라 매칭 곤란 → **금액 기준**. financial 카테고리 우선 비교)

---

## §4. 8지점 동기화 매핑 (`tax-field-add`)

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| ① | 폼 상태 | `components/calc/inheritance/shared.ts` (EstateItem 폼) | 3필드 |
| ② | initial | 동상 | undefined |
| ③ | normalize | 동상 | optional fallback |
| ④ | API 변환 | `lib/calc/inheritance-*.ts` + `suggestNetFinancialAssets` | 3필드 매핑 + §22 저당 차감 |
| ⑤ | UI 위젯 | ⑤a `PropertyValuationForm` 토글 / ⑤b `DebtAllocationInput` 자동노출 카드 | §3-1·3-2 |
| ⑥ | 사이드바 | `computeInheritanceSummary` totalDebts 포함 | §3-4 |
| ⑦ | 결과 카드 | breakdown 자동(STEP3) + `DebtAllocationResultCard` collateralDebtDetail 행 | §3-3 (U-4 2경로) |
| ⑧ | Validation | `inheritance-validate.ts` opt-in/중복 | §3-5 |

> ⑫⑬⑭(Zod·body·route): `EstateItem`은 배열 요소 → spread 경로 grep 자가점검. 신규 3필드가 Zod EstateItem 스키마·body spread·route 매핑에 누락 없는지.

---

## §5. 케이스 인벤토리 → anchor 매핑

| CD | anchor | 입력 | 기대 (toBe) | 파일 |
|---|---|---|---|---|
| CD-1 | CDA-1 | mortgage=1.5억, opt-in OFF | `collateralDebtDetail` 없음, 과세가액 회귀 0 | inheritance-collateral-debt.test.ts |
| CD-2 | CDA-2 | 평가 5억, mortgage=1.5억, ON | `amount`=1.5억, nonFuneralDebts += 1.5억 | 〃 |
| CD-3 | CDA-3 | CD-2 + isFinancialDebt + 예금 3억 | `financialDebtAmount`=1.5억, suggest 순금융 1.5억 | suggest.test.ts |
| CD-3b | CDA-3b | CD-3 제안 미적용 (netFin=3억 직접) | §14 −1.5억 유지 / §22 공제 6천만(미반영) | inheritance-tax.test.ts |
| CD-4 | CDA-4 | CD-2 + 자산 heirAllocations(배우자 60%·장남 40%, 평가 5억 → 3억/2억) | 담보채무 1.5억 **비율 환산** → 배우자 9천만·장남 6천만 (Σ=1.5억, E-1) | allocation.test.ts |
| CD-4b | CDA-4b | CD-4 + floor 잔액 (예: 1/3·2/3 분배) | 마지막 상속인 잔액 흡수로 Σ=정확히 담보채무액 | 〃 |
| CD-5 | CDA-5 | CD-2 + debtItems "근저당 1.5억" | nonFuneralDebts=3억(이중) + validate warning | validate.test.ts |
| CD-6 | CDA-6 | lease=2억, mortgage=0, ON | `amount`=2억, `financialDebtAmount`=0 | inheritance-collateral-debt.test.ts |
| CD-7 | CDA-7 | CD-2 estateItems | `deriveCollateralDebts` 1건 반환, debtItems 불변 | 〃 + RTL |
| CD-8 | CDA-8 | mortgage=1.5억, 물상보증 OFF | `collateralDebtDetail` 없음 (§14 미공제) | inheritance-collateral-debt.test.ts |

**Pre-Do**: CDA-2(엔진 §14 미반영) + CDA-3(suggest 담보채무 미차감) 먼저 작성 → 실패 확보.

---

## §6. 작업 순서 (계획 §5 대응)

1. Phase A (엔진 §14): CDA-2 실패 → 타입 → `deriveCollateralDebts` → STEP3 → allocation → CDA-1·2·4·6·8
2. Phase A′ (lib/calc §22): CDA-3 실패 → `suggestNetFinancialAssets` 차감 → CDA-3·3b
3. Phase B (UI): ⑤a 토글 → ⑤b 자동노출 카드 → ⑥⑦⑧ → CDA-5·7 + RTL

---

## §7. 엣지 케이스

| 엣지 | 처리 |
|---|---|
| mortgage·lease 둘 다 0인데 opt-in ON | derive에서 `amount<=0` skip + validate 오류 |
| 담보채무 분배 합 ≠ 담보채무액 | `scaleAllocations` 비율 환산 + 마지막 잔액 흡수로 Σ=담보채무액 **보장**(E-1). 자산 `heirAllocations` 자체 합 검증은 기존 `inheritance-validate.ts:79` 재사용 |
| 같은 자산에 mortgage(은행) + lease(임차인) 공존 | §14=합산, §22=mortgage만 (financialDebtAmount) |
| opt-in ON + estateItems에 담보 자산 다수 | 자동노출 카드 다행 렌더, 사이드바 합산 |
| 비거주자 상속 | 범위 외 (§14②2호 후속) |

---

## §8. 계획↔디자인 일관성 점검 (10단계용 사전 표)

| 계획서 | 디자인 | 일치 |
|---|---|---|
| §2-1 EstateItem 3필드 | §1-1 | ✅ |
| §2-2 DerivedCollateralDebt (amount/financialDebtAmount) | §1-2 | ✅ |
| §2-2(b) 협의분할 **비율 환산(E-1)** | §1-2·§2-3 `scaleAllocations` | ✅ (11단계 동기화) |
| §3 CD-1~CD-8 + CD-4b | §5 CDA-1~8 + 3b·4b | ✅ (11단계 동기화) |
| §5 Phase A/A′/B | §6 작업순서 | ✅ |
| §6 8지점 | §4 7지점(+⑫⑬⑭ 주석) | ✅ |
| §7 위험(물상보증·§22 제안 한계) | §3-1 OFF 안내·§2-4 notes·§7 엣지 | ✅ |

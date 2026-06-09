# 부표3 「가. 채무」 §14 담보채무 자동도출분 표시 누락 수정 계획서

> 작성일: 2026-06-09 · 대상 세목: 상속세(inheritance) · 영향 범위: 결과 화면 별지 어댑터(`lib/calc/deduction-besshi-data.ts`) + 협의분할 내역 표 + (검토) 부표5 · PDF 동일 경로

## 0. 배경 · 증상

자산-수준 「§14 담보공제」 토글을 켜고 「저당권 등에 의해 담보된 채권액」(예: 5억)만 입력한 경우, 별지 제9호서식 부표3 「가. 채무」 표가 비어 있고 계(⑦)가 0으로 표시된다. 같은 화면의 「나. 공과금」·「다. 장례비」와 「채무·공과·장례비 공제」 합계는 정상이다.

- 사용자 입력 단서(이미지6): 토지 자산 "담보된 토지"(평가액 2,300,000,000), 「§14 담보공제」 ON, `mortgageAmount = 500,000,000`.
- 즉 §14 자동공제 5억은 **계산에는 반영**(과세가액 §14 차감·협의분할 합산)되지만 부표3 「가. 채무」 표에는 행이 나타나지 않는다.

## 1. 근본 원인 (실측)

§14 담보채무는 두 갈래로 흐른다. **엔진 계산 경로는 자동도출분을 합치지만, 별지/협의분할 표시 경로는 수동 입력만 읽는다.**

| 경로 | 데이터 소스 | 자동도출 5억 |
|---|---|---|
| 엔진 과세가액 §14 차감 | `inheritance-tax.ts:153` `deriveCollateralDebts(input.estateItems)` → `:193-199` 합산(`:194 nonFuneralDebts += collateralTotal`) | ✅ |
| 엔진 협의분할 합산 | `inheritance-tax.ts:725` `[...(input.debtItems ?? []), ...toCollateralDebtItems(collateralDebts)]` | ✅ |
| result echo | `inheritance-tax.ts:855` `collateralDebtDetail: collateralDebts.length > 0 ? … : undefined` | ✅ (필드 `collateralDebtDetail?: DerivedCollateralDebt[]` — `types/inheritance-gift.types.ts:1394`) |
| **부표3 「가. 채무」 표** | `buildBuppyo3Data(result, debtItems)` → `deduction-besshi-data.ts:128` `const items = debtItems ?? []` | ❌ **누락** |
| **협의분할 내역 표 (3)** | `SourceDataSummarySection`(`:452`) → `DebtAllocationTable({ debtItems, … })` (`DebtAllocationTable.tsx:43-47`) | ❌ **누락** |
| **④ 담보채무 결과 카드** | `DebtAllocationResultCard`(`:504`)는 `collateralDebtDetail`을 ④ 섹션에 별도 표시하나, **카드 자체 게이트가 `debtItems.length>0`(`:499-500`)** | ⚠️ **조건부 누락** |

- `buildBuppyo3Data`는 `result`를 인자로 받지만 **`result.collateralDebtDetail`을 전혀 참조하지 않는다**. 행 생성은 오직 `items`(= `debtItems`) 필터(`deduction-besshi-data.ts:131-132`, `category === "financial" || "personal"`).
- 호출부 `DeductionBesshiFormsSection.tsx:59` `buildBuppyo3Data(result, debtItems)` → `InheritanceTaxResultView.tsx:576-579`에서 `debtItems = form.debtItems`(수동 협의분할 입력)만 전달. 부표3 섹션 렌더 게이트는 `:212 result.deductionDetail`이라 **debtItems 없어도 부표3 자체는 렌더**됨(가. 채무 표만 비는 것).
- PDF 경로 `lib/pdf/inheritance-besshi-pages.tsx:77` `buildBuppyo3Data(inhResult, debtItemsArr)`도 동일 함수 → **화면·PDF 동시 누락**.
- 협의분할 내역 표 (3)은 `SourceDataSummarySection`(`InheritanceTaxResultView.tsx:452-461`)이 `debtItems`만 전달하고 `result`/`collateralDebtDetail`을 **미수신**. 더욱이 `SourceDataSummarySection.tsx:49·95`의 `hasAny`·렌더 게이트가 `debtItems.length>0`이라, debtItems가 비고 담보만 있으면 표 자체가 안 뜬다.
- ④ 담보채무 결과 카드(`DebtAllocationResultCard.tsx:258-308`)는 `collateralDebtDetail`을 별도 섹션으로 표시하지만, **카드 전체가 `InheritanceTaxResultView.tsx:499-500`의 `debtItems !== undefined && debtItems.length > 0` 게이트에 묶여** debtItems 없이 담보만 입력하면 ④ 섹션도 안 보인다(동일 증상 확대).

**결론: 매핑 누락 버그 + 게이트 누락.** 담보 토글로만 §14 공제를 잡으면 (가) 부표3 「가. 채무」 표가 비고, (나) debtItems가 전혀 없는 경우 협의분할 표(3)·④ 카드까지 통째로 사라진다. 이미지 케이스는 공과금·장례비가 debtItems에 있어 (3)·④는 떴으나 부표3 「가. 채무」만 빈 상태.

## 2. 법령 정합 확인

- 상증법 §14①3호 — 피상속인의 채무를 과세가액에서 공제. 저당 담보채무·임대보증금은 「피상속인의 채무」로서 **부표3 「가. 채무」**에 표기하는 것이 맞다(공과금·장례비와 구분).
- 엔진이 이미 `toCollateralDebtItems`에서 `category: "personal"` 고정(`inheritance-collateral-debt.ts:99`)으로 협의분할에 합치고 있으며, 부표3 「가. 채무」 필터(`financial || personal`)가 이 값을 통과한다 → 표시 위치도 「가. 채무」가 정확.
- ※ 자동도출분의 §22 순금융 차감 대상(저당분 `financialDebtAmount`)은 별도 경로이며 본 수정의 표시 대상(채무 명세)과 직교. KoreanLaw 재검증 불필요(엔진 분류 그대로 표시).

## 3. 수정안 — 단일 진실 헬퍼 재사용 + 경로별 역할 분리 (메모리 `single-source-engine-helper`)

엔진이 협의분할 합산에 쓰는 동일 헬퍼 `toCollateralDebtItems`(`inheritance-collateral-debt.ts:94`, `category: "personal"` 고정 `:99`)를 표시 경로에서도 재사용해 `result.collateralDebtDetail`을 `DebtItem[]`으로 변환한다. 별도 변환 로직 신설 금지.

### ★ 이중 표시·이중 합산 회피 — 경로별 적용 방식 분리 (Critical)

세 표시 지점은 **데이터 합류 방식이 서로 다르므로 일괄 merge 금지**. 잘못 적용하면 이중 합산/이중 표시가 발생한다.

| 지점 | collateral 합류 위치 | 호출부 debtItems | 이중 위험 |
|---|---|---|---|
| 부표3 「가. 채무」 | `buildBuppyo3Data` **내부** 합산(3-1) | **원본 유지**(merge 금지) | 호출부에서도 merge하면 이중 합산 |
| 협의분할 표 (3) | `SourceDataSummarySection` **호출부**(`:459`) merge(3-2) | merged 전달 | — |
| ④ 담보채무 카드 | `collateralDebtDetail` prop **별도 섹션**(현행) | **원본 유지**(merge 금지) | debtItems에 merge하면 합계표 personal 칸 + ④ 섹션 이중 표시 |

→ 부표3·④카드는 **debtItems 원본 유지**, 협의분할 표(3)만 호출부에서 merge. 부표3는 내부 합산이라 PDF 경로(`inheritance-besshi-pages.tsx:77`)까지 자동 커버.

### 3-1. 부표3 어댑터 (`lib/calc/deduction-besshi-data.ts`) — ★핵심

- `import { toCollateralDebtItems } from "@/lib/tax-engine/inheritance-collateral-debt";` 추가.
- `buildBuppyo3Data`(`:123`) 본문 `:128` 변경(합산을 `useLegacy` 산정 **앞**에 배치):
  ```ts
  const collateralItems = toCollateralDebtItems(result.collateralDebtDetail ?? []);
  const items = [...(debtItems ?? []), ...collateralItems];
  ```
- 이후 기존 필터(`:131-132` `financial || personal`)가 자동도출분(`category: "personal"`)을 「가. 채무」 행으로 흡수 → `debtRows` + `debtTotal`(⑦) 자동 반영. PDF 동일 경로 자동 커버.
- **legacy 분기 정합(`:129` `useLegacy = items.length === 0 && legacy != null`)**: collateral을 합친 뒤의 `items.length`로 판정 → 자동도출분 있으면 `length > 0` → legacy 비활성(정상).
- **호출부(`DeductionBesshiFormsSection.tsx:59`·`InheritanceTaxResultView.tsx:579`)는 무변경** — debtItems 원본 그대로 전달(내부 합산이므로 호출부 merge 금지).

### 3-2. 협의분할 내역 표 (3) — `SourceDataSummarySection` 호출부 merge

`SourceDataSummarySection`(`SourceDataSummarySection.tsx:34`)은 `result`/`collateralDebtDetail`을 **받지 않으며** `hasAny`(`:49`)·렌더 게이트(`:95`)가 `debtItems.length>0`이다. 따라서 호출부에서 merged debtItems를 전달하면 ① 게이트 자동 충족 ② `DebtAllocationTable`의 `personal` 그룹 자동 표시 — 컴포넌트 무변경으로 해결.

- `InheritanceTaxResultView.tsx`에 `import { toCollateralDebtItems } from "@/lib/tax-engine/inheritance-collateral-debt";` 추가.
- merged 배열을 useMemo로 1회 산출(매 렌더 새 배열 방지):
  ```ts
  const debtItemsWithCollateral = useMemo(
    () => [...(debtItems ?? []), ...toCollateralDebtItems(result.collateralDebtDetail ?? [])],
    [debtItems, result.collateralDebtDetail],
  );
  ```
- `:459` `debtItems={debtItems}` → `debtItems={debtItemsWithCollateral}` (협의분할 표(3) 전용).
- **④ 카드(`:505`)·부표3(`:579`)·DeductionBreakdown(`:525`)에는 merged 전달 금지** — 원본 `debtItems` 유지.
- **중복 표시(오픈 이슈 ①)**: ④ 카드 섹션이 collateral을 별도 강조 표시하므로, (3) 표에도 personal 행이 추가되면 같은 화면 2회. (3) 표는 "협의분할 전체 내역"이라 채무 누락이 더 부자연 → **(a) 합산 권장**, ④ 카드와 역할 안내 1줄 검토.

### 3-3. ④ 담보채무 카드 게이트 확장 (`InheritanceTaxResultView.tsx:498-511`) — 신규

- 현행 게이트 `debtItems !== undefined && debtItems.length > 0`(`:499-500`)가 담보만 입력 시 ④ 섹션을 막음.
- 변경: `((debtItems?.length ?? 0) > 0 || (result.collateralDebtDetail?.length ?? 0) > 0)` 면 렌더(heirs 조건 유지). debtItems 비어도 collateral 있으면 카드 표시. ⚠️ `(a?.length || b?.length)` 형태 금지 — React `&&` 렌더에서 `length===0`이 숫자 `0`으로 화면 출력되는 함정. 반드시 `> 0` 불리언화.
- ④ 카드에 넘기는 `debtItems`(`:505`)는 **원본 유지**(merge 금지 — 합계표/④ 섹션 이중 표시 방지).
- **★ ① 카테고리별 합계 섹션 가드(실측 정정)**: `DebtAllocationResultCard.tsx:110-141`의 ① 합계 섹션은 **조건 없이 무조건 렌더**(② 장례비 `:144`·④ collateral `:259`만 조건부). 따라서 `debtItems=[]`로 게이트만 확장하면 **「① 입력 합계 0원」 표가 ④ 담보채무 5억과 동시 노출**되는 모순. → ① 섹션을 `totalInput > 0` 조건부로 감싸(`:110`) debtItems 없으면 ① 숨기고 ④ 섹션만 표시. (heirSums 표 `:74-91`도 debtItems 기반이라 동일 가드 검토 — Do 시 ② 이후 섹션들의 0원 노출 일괄 점검)

### 3-4. 부표5 (`buildBesshi5Data`) — 검토 후 결정

- `buildBesshi5Data`(`:257`)는 `debtItems`를 `resolveFinancialDebt` 필터(`:286-287`)로 §22 금융채무 행만 추림.
- 자동도출분은 `category: "personal"` 고정이라 `resolveFinancialDebt`(financial 판정)를 **통과 못 함** → 단순 merge로 안 잡힘.
- §22 순금융 차감 대상은 `DerivedCollateralDebt.financialDebtAmount`(저당분, `inheritance-collateral-debt.ts:69`)로 별도 존재. 부표5 「채무」 표기 여부는 엔진 §22 차감액과 표시 정합 확인 필요. → **1차 범위 제외**, 오픈 이슈 ②.

## 4. 8(14) 동기화 지점 점검

본 수정은 **신규 입력 필드 추가가 아니라 기존 result echo(`collateralDebtDetail`)의 표시 누락 수정**이므로 입력측(①②③④⑧⑨~⑭) 영향 없음. 표시측(⑦)만 변경.

| # | 지점 | 영향 |
|---|---|---|
| ⑦-a 부표3 어댑터 | `buildBuppyo3Data` 내부 collateral 합산(3-1) | **변경** |
| ⑦-b 협의분할 표(3) | `InheritanceTaxResultView:459` merged debtItems(3-2) | **변경** |
| ⑦-c ④ 카드 게이트 | `InheritanceTaxResultView:499-500` 게이트 확장(3-3) | **변경** |
| PDF | `inheritance-besshi-pages.tsx:77` 동일 함수 경유(3-1) | 자동 반영(별도 수정 불요) |
| 그 외 | 입력 필드 불변 | 없음 |

> ⑦-b·⑦-c는 TypeScript가 누락을 못 잡는 표시 게이트 — anchor/E2E 또는 수동 점검 필요(메모리 `explicit_prop_mapping_strip` 부류).

## 5. Pre-Do Anchor (메모리 `feedback_pre_anchor_verification`)

Do 진입 전 **누락 재현 anchor 1건**을 먼저 작성·실행해 현행 버그를 실증하고, 수정 후 통과로 전환한다. (기존 테스트: `__tests__/calc/deduction-besshi-data.test.ts`)

1. **부표3 collateral 누락 anchor**: `collateralDebtDetail`에 1건(creditorName "담보된 토지 담보채무", amount 500,000,000) echo한 `InheritanceTaxResult` mock + `debtItems = []` → `buildBuppyo3Data(result, [])` 호출.
   - **현행(수정 전)**: `debtRows.length === 0`, `debtTotal === 0` → **실패 확보**(버그 실증).
   - **수정 후**: `debtRows` 1행 kindLabel "담보된 토지 담보채무" amount 500,000,000, `debtTotal === 500,000,000` → 통과.
2. **수동+자동 합산 anchor**: `debtItems`에 financial 1건(예: 은행대출 3억) + `collateralDebtDetail` 5억 → `debtRows.length === 2`, `debtTotal === 800,000,000`. legacy 분기 비활성 확인.
3. **legacy 미오염 anchor**: `debtItems = []`, `collateralDebtDetail = []`, `legacy = { debts: 1억, … }` → legacy 행 1개 유지(기존 동작 회귀 0).

**Phase C(협의분할 표·④ 카드 게이트) 점검** — 컴포넌트 렌더 게이트라 단위 anchor 한계. 다음을 수동 또는 E2E로 점검:
- 게이트 truthy 전환: `debtItems=[]` + `collateralDebtDetail=[1건]` → ④ 카드 렌더됨(현행은 미렌더).
- ① 합계 섹션 0원 모순 부재: 위 케이스에서 「① 입력 합계」 0원 표가 노출되지 않음(`totalInput > 0` 가드 적용 확인).
- 협의분할 표(3) merge: 같은 케이스에서 `SourceDataSummarySection`의 (3) 표가 렌더되고 「개인사채」 그룹에 담보채무 행 표시.

> "현행 일치 예상" 금지 — anchor1 실패 메시지로 누락을 확정한 뒤 수정. Phase C는 표시 게이트라 TS 미감지 → 점검 필수.

## 6. 실행 순서 · 커밋 분할

| Phase | 내용 | 커밋 |
|---|---|---|
| A | Pre-Do anchor 3건 (부표3) — 1번 실패 확보 | (테스트 커밋 또는 B와 합본) |
| B | 부표3 어댑터 수정(`deduction-besshi-data.ts`) — `toCollateralDebtItems` 내부 합산 + legacy 정합. **호출부 무변경** | `fix(inheritance): 부표3 「가. 채무」에 §14 담보채무 자동도출분 표시` |
| C | (오픈이슈 ① 결정 시) 협의분할 표(3) merged 전달(`InheritanceTaxResultView:459`) + ④ 카드 게이트 확장(`:499-500`) | `fix(inheritance): 협의분할 표·담보채무 카드에 §14 자동도출분 반영` |
| D | (오픈이슈 ② 결정 시) 부표5 §22 저당분 표시 | 별도 |

각 Phase: `npx tsc --noEmit` 0건 + `npx vitest run __tests__/calc/deduction-besshi-data.test.ts` 통과. 완료 후 전체 `npm test`. 부표3는 PDF 동일 경로라 별도 spec 불요(단위 anchor로 충족). Phase C(표시 게이트)는 TS 미감지 → E2E 또는 수동 점검.

## 7. 오픈 이슈 / 결정 필요

1. **협의분할 내역 표 (3) 중복 표기(3-2)**: `DebtAllocationResultCard` ④ 섹션이 이미 collateral을 강조 표시 중. (3) 표에도 추가하면 같은 화면 2회 노출. 선택지 —
   - (a) (3) 표에 합산(완전성·일관성 우선, ④ 섹션과 중복 허용)
   - (b) (3) 표는 그대로 두고 부표3만 수정(④ 섹션이 담보채무 전담)
   - **권장: (a)** — (3) 표는 "협의분할 전체 내역"이므로 채무 누락이 더 부자연스러움. 단 ④ 섹션과 시각적 역할 안내 한 줄 추가 검토.
   - ※ ④ 카드 게이트 확장(3-3)은 (a)/(b) 무관하게 **별도 버그**(담보만 입력 시 ④ 섹션 소실)이므로 Phase C에 항상 포함.
2. **부표5 §22 저당분 표시(3-4)**: 자동도출 저당분(`financialDebtAmount`)을 부표5 「채무」에 표기할지. 엔진 §22 순금융 차감액과 표시 정합 확인 후 별도 진행. → **1차 범위 제외.**
3. **수동 입력과의 이중 합산**: 담보채권액 SSOT는 `EstateItem.mortgageAmount/leaseDeposit`이고 수동 `debtItems`와 출처가 분리되어 통상 중복 없음. 다만 사용자가 같은 채무를 수동으로도 입력한 케이스는 사용자 책임(설계상 별도 출처) — 가드 불요.
4. **부표3 내부 합산 vs ④ 카드 debtItems 원본 — 일관성**: 부표3는 내부 merge, ④ 카드는 원본 유지. 표시 의미가 다름(부표3 「가. 채무」는 §14 채무 전부 = 명세서 / ④ 카드는 자동도출 강조 별도 섹션)이라 의도적 분리. Do 시 혼동 방지 주석 필수.

> 이 계획서의 모든 file:line은 실측 인용. 핵심 수정(부표3, Phase B)은 anchor A1(누락 재현)로 확정 후 Do. 오픈 이슈 ①②는 Do 진입 전 사용자 결정 필요.

# 주식양도세 Step3 「기본공제」 두 칸 — **기타자산 그룹 게이트**

**상태**: **구현 완료 ✅** (2026-09-11) — ⑤ Step1·Step3 · ④ API · anchor 22건 · E2E 4건
**성격**: 유령 입력 제거 — 두 칸은 **기타자산 그룹에서만** 엔진이 소비하는데 **전 시장유형에 노출**된다.
**작성** 2026-09-11
**제보** 사용자 — 「이미지12의 두 칸은 이미지11에서 **기타자산**을 선택한 경우에만 나타나야 하는 것 아닌가」

---

## 1. 무엇이 문제인가 — 실측

`app/calc/stock-transfer-tax/steps/Step3.tsx:238-268`의 ② 기본공제 섹션은 **게이트가 없다**.
Step3 자체도 전 시장유형에서 렌더된다(`StockTransferTaxCalculator.tsx:260`).

### V-1 ✅ 엔진 probe — 두 칸은 주식 그룹에서 **완전히 무시**된다

throwaway probe(`calculateStockTransferTax` 직접 호출, 2026-09-11 실측):

| 시장유형 | `basicDeductionGroup` | 「부동산 그룹 기소진 250만」 0 → 250만 | 「비사업용 토지 과세표준」 3억 입력 |
|---|---|---|---|
| 코스피 대주주 | `stock` | 공제 2,500,000 → **2,500,000** · 세액 84,375,000 → **84,375,000** (불변) | `cross1045Adjustment` **undefined** |
| 기타자산(과점주주) | `real_estate_and_other_asset` | 공제 2,500,000 → **0** · 세액 133,060,000 → **134,060,000** | — |
| 기타자산 + nbl **60%** | 〃 | — | 조정액 **29,890,000** 생성 (`other_asset_block_shareholder_nbl`) |
| 기타자산 + nbl **0%** | 〃 | — | **undefined** (9호 미해당) |
| **코스피 + 과점주주 플래그** (§94② 발동) | `real_estate_and_other_asset` | 공제 0 ↔ 2,500,000 **작동** | — |

⇒ 사용자가 코스피·코스닥·코넥스·비상장·해외주식·국외전출세를 고르고 이 칸에 숫자를 넣으면
**아무 일도 일어나지 않는다**. 세액이 틀리는 결함은 아니고 **유령 입력**이다.

### 코드 경로 (file:line 실측)

| 층 | 위치 | 현재 |
|---|---|---|
| ⑤ UI | `Step3.tsx:249-267` | **무게이트** — 두 `CurrencyInput`이 항상 렌더 (Step3는 `currentStep === 2`면 시장유형 무관 렌더 — `StockTransferTaxCalculator.tsx:258-260`) |
| ④ API 변환 | `stock-transfer-tax-api.ts:509` | `realEstateGroupBasicDeductionUsed` **무조건 전송** |
| ④ API 변환 | `stock-transfer-tax-api.ts:511-512` | `crossClause8TaxBase` — `> 0`이면 전송 (그룹 무관) |
| ⑧ validate | `stock-transfer-tax-validate.ts` | 두 필드 관련 규칙 **0건** (grep 확인) |
| 엔진 소비 | `stock-transfer-helpers.ts:112-126` | `basicDeductionGroup === "real_estate_and_other_asset"`에서만 차감 |
| 엔진 소비 | `stock-transfer-tax.ts:464-470` | `NBL_HEAVY_CORP_CATEGORIES.has(taxCategory)`일 때만 조정액 |

---

## 2. 법령 근거 — KoreanLaw 본문 검증 완료 (MST 280405, 시행 20260101)

### 그룹 분리는 **§103①**이다 (§103②가 아니다)

> **§103①** 양도소득이 있는 거주자에 대해서는 다음 각 호의 **소득별로** 해당 과세기간의
> 양도소득금액에서 **각각 연 250만원**을 공제한다.
> 1. 제94조제1항**제1호ㆍ제2호 및 제4호**에 따른 소득 〔단서: 미등기양도자산 제외〕
> 2. 제94조제1항**제3호**에 따른 소득

`§102①`도 같은 묶음이다(1호 = 1·2·4호 / 2호 = 3호). ⇒ **기타자산(§94①4호)은 부동산과 한 그룹**,
**주식(§94①3호)은 별도 그룹**이다. 주식 그룹에는 부동산 소진액이 끼어들 자리가 **없다**.

> **§103②** … 감면소득금액 외의 양도소득금액에서 먼저 공제하고 … **먼저 양도한 자산**의
> 양도소득금액에서부터 순서대로 공제한다.

②는 **공제 순서** 조항이다. ⇒ **Step3.tsx:239의 섹션 제목 `기본공제 (§103②)`는 오인용**이다.

### §104⑤ 후단 — 8호·9호 동일자산 의제

> **§104⑤** … 이 경우 제2호의 금액을 계산할 때 **제1항제8호 및 제9호의 자산은 동일한 자산으로 보고** …
> **§104①9호** 제94조제1항**제4호다목 및 라목**에 따른 자산 중 … 비사업용 토지의 보유 현황을
> 고려하여 대통령령으로 정하는 자산 〔영 §167의7 — 비사업용토지 비율 **50% 이상**〕

⇒ 9호는 **기타자산 다목·라목** 중 **nbl 50% 이상**만이다. 그 밖에는 §104⑤ 후단의 대상이 아니다.

---

## 3. 게이트 술어 — 「기타자산 선택」보다 **한 칸 넓다**

`stock-classification.ts:311, 349-369`:

```
hasSection94_4 = isQualifyingBlockShareholder || isHeavyRealEstateForRate
hasSection94_3 = marketType ∈ {kospi, kosdaq, konex, unlisted}

§94② 발동:  hasSection94_3 && hasSection94_4  → basicDeductionGroup = real_estate_and_other_asset
4호 단독:    marketType === "other_asset"      → 〃
그 외:                                          → "stock"
```

⇒ **코스피를 고른 상태라도 과점주주·부동산과다보유 플래그가 켜지면 그룹이 바뀐다**(V-1 마지막 행).
Step1도 같은 축으로 `OtherAssetBlock`을 조건부 노출한다(`Step1.tsx:346-349`).

### 확정 술어

| 칸 | 술어 |
|---|---|
| **필드 1** 부동산 그룹 기소진 | `marketType === "other_asset" \|\| (marketType ∈ {kospi,kosdaq,konex,unlisted} && (isQualifyingBlockShareholder \|\| isHeavyRealEstateForRate))` |
| **필드 2** 비사업용 토지 과세표준 | 필드 1 술어 **AND** `parseFloat(nblRatioOfCorpAssets) >= 50` |

`nblRatioOfCorpAssets`는 폼에서 **% 문자열**이다(`OtherAssetBlock.tsx:110-124` `unit="%"`,
`stock-transfer-tax-api.ts:181-182`가 `× 0.01`). 엔진 임계는 `>= 0.5`(`stock-classification.ts:327`).

---

## 4. 수정 계획

### 4-1. 신규 leaf — `lib/calc/stock-other-asset-scope.ts`

`lib/calc/*-scope.ts` 확립 패턴(`self-built-scope.ts` 등 11파일)을 따른다.
⑤·④가 **같은 것**을 부른다 (memory `feedback_ui_gate_two_conditions_downstream_one` ·
`feedback_shared_predicate_argument_parity`).

```ts
export function isOtherAssetGroup(form: Pick<StockTransferFormData,
  "marketType" | "isQualifyingBlockShareholder" | "isHeavyRealEstateForRate">): boolean
export function isClause9Applicable(form: … & Pick<…, "nblRatioOfCorpAssets">): boolean
```

**`lib/calc/`에 둔다** — ④(`buildStockTransferApiBody`, `stock-transfer-tax-api.ts:86`)가
써야 하고, 기존 `*-scope.ts` 11파일이 전부 `lib/calc/`에 있다.
(⚠️ 「lib → components import 선례 없음」은 **틀렸다** — 실측 108건이고 `lib/calc/`가
`@/components/calc/inputs/CurrencyInput`의 `parseAmount`를 쓰는 것이 확립된 패턴이다.
배치 근거는 의존 방향이 아니라 **기존 scope 파일과의 일관성**이다.)

### 4-2. ⑤ Step3 — 필드만 게이트, 섹션은 유지

- 두 `CurrencyInput`을 각각의 술어로 감싼다.
- **섹션·안내 카드는 남긴다** — 주식 그룹도 250만원 공제를 받는다(자동). 대신 안내 문구를
  그룹별로 갈라, §94② 문구는 기타자산 갈래에서만 보이게 한다.
- **`SectionTitle n={…}`은 하드코딩**(1·2·3·4·5)이라 섹션을 지우지 않는 한 번호 어긋남이 없다.
- 섹션 제목 `기본공제 (§103②)` → **`기본공제 (§103①)`** (§2 검증).
- 필드 1의 hint `§94② 발동 시 부동산 그룹 합산` → **정정**. 기타자산을 **단독 선택**하면
  `section94_2Applied: false`인데(`stock-classification.ts:363-369`) 그룹은 여전히
  `real_estate_and_other_asset`이다. ⇒ §94②는 **상장·비상장 + 4호 동시충족** 갈래에서만
  붙는 말이다. hint는 「§103①1호 — 부동산·기타자산 공동 그룹」으로 적고, §94② 언급은
  그 갈래에서만 노출한다.

### 4-3. ④ API 변환 — 같은 술어로 게이트

| 필드 | Zod | 게이트 시 |
|---|---|---|
| `realEstateGroupBasicDeductionUsed` | `z.number().min(0)` **required** (`schema:345`) | ⚠️ **빼면 400**. 술어 거짓이면 **0으로 전송** |
| `crossClause8TaxBase` | `.optional()` (`schema:253`) | 술어 거짓이면 **전송하지 않음** |

값은 **폼에서 지우지 않는다**(표시 게이트만 — memory `feedback_ui_gate_removes_sole_input_path` 5항).
기타자산으로 되돌리면 입력값이 함께 복귀해야 한다.

### 4-4. ⑧ validate — 변경 없음

두 필드를 요구하는 규칙이 **0건**이라 dead-end가 생기지 않는다(grep 실측).
**Do 중 재확인**: 규칙을 새로 넣지 않는다.

### 4-5. anchor — 부정형 + 긍정형 **짝** (memory `feedback_negative_anchor_needs_positive_twin`)

`__tests__/components/calc/stock-basic-deduction-gate.anchor.test.tsx` (신규, RTL):

| # | 케이스 | 기대 |
|---|---|---|
| G-1 | 코스피, 플래그 off | 두 칸 **비노출** |
| G-2 | **기타자산** | 필드 1 **노출** |
| G-3 | 코스피 + 과점주주 플래그 (§94② 발동) | 필드 1 **노출** ← 「기타자산 선택만」으로 좁히면 실패 |
| G-4 | 기타자산, nbl 미입력 | 필드 2 **비노출** |
| G-5 | 기타자산, nbl **60** | 필드 2 **노출** |
| G-6 | 해외주식 / 국외전출세 | 두 칸 **비노출** |

`__tests__/components/calc/stock-other-asset-block-gate.anchor.test.tsx` (Q-2 · Step1):

| # | 케이스 | 기대 |
|---|---|---|
| S-1 | 해외주식 + 과점주주 플래그 stale true | `OtherAssetBlock` **비노출** |
| S-2 | 코스피 + 과점주주 플래그 true | `OtherAssetBlock` **노출** ← 게이트를 통째로 지운 것과 구별 |

`__tests__/calc/stock-basic-deduction-gate-api.anchor.test.ts` (④):

| # | 케이스 | 기대 |
|---|---|---|
| A-1 | 코스피 + 폼에 250만 stale | body `realEstateGroupBasicDeductionUsed === 0` |
| A-2 | 기타자산 + 250만 | body `=== 2500000` |
| A-3 | 코스피 + `crossClause8TaxBase` stale | body에 **키 부재** |
| A-4 | 기타자산 + nbl 60 + 3억 | body `crossClause8TaxBase === 300000000` |

**mutation probe**(memory `feedback_pre_change_safety_net_probe`): 술어를 `marketType === "other_asset"`
단독으로 바꿔 **G-3이 실패하는지** 실측한다. 실패하지 않으면 G-3은 구별력 0이다.

### 4-6. E2E — **추가한다** (Q-1 결정: 넣음)

역방향 grep 결과 **기존 spec 중 이 두 라벨을 셀렉터로 쓰는 것은 0건**
(`grep -rn "기본공제\|부동산 그룹\|비사업용 토지" e2e/` — 주식 Step3 히트 없음) ⇒ 회귀 위험 없음.

신규 `e2e/stock-basic-deduction-gate.spec.ts` — RTL이 못 보는 것을 본다:
**Step1에서 고른 값이 Step2를 건너 Step3의 노출을 바꾸는 실제 마법사 흐름**.

| # | 흐름 | 기대 |
|---|---|---|
| E-1 | 코스피 선택 → Step3 | 두 칸 **비노출** |
| E-2 | 기타자산 선택 → Step3 | 필드 1 **노출** · 필드 2 비노출 |
| E-3 | 기타자산 + 과점주주 ON + nbl **60** → Step3 | 두 칸 **모두 노출** |
| E-4 | 기타자산 → 과점주주 ON → **코스피로 되돌림** (§94② 발동) → Step3 | 필드 1 **노출** |

⚠️ ToggleCard는 `setChecked` 헬퍼로 조작한다(memory `feedback_e2e_togglecard_setchecked`).
⚠️ `page.goto("/calc/...")` 상대경로 — 포트 하드코딩 금지.

---

## 5. 검증 순서 (Goal-Driven)

```
1. leaf + anchor 먼저 작성 → verify: G-3·G-5가 현행 코드에서 **실패**(게이트 부재 증명)
2. ⑤ Step3 게이트 적용     → verify: G-1~G-6 전건 통과
3. ④ API 게이트 적용       → verify: A-1~A-4 전건 통과
4. 섹션 제목 §103② → §103① → verify: 같은 파일 내 다른 §103② 인용 없음 재grep
5. ⑤ Step1 게이트 적용 (Q-2) → verify: S-1·S-2 anchor 통과
6. E2E E-1~E-4            → verify: npx playwright test e2e/stock-basic-deduction-gate.spec.ts
7. mutation probe          → verify: 술어를 좁히면 G-3 실패
8. npx vitest run __tests__/tax-engine/stock-transfer/ __tests__/calc/ __tests__/components/  → 전건 통과
9. npx tsc --noEmit 0건 · npm run lint
```

---

## 6. 결정 완료 (사용자, 2026-09-11) — Q-2는 **전제가 틀렸다**

**Q-1 → E2E 넣는다.** §4-6 참조. `e2e/stock-basic-deduction-gate.spec.ts` 4건 통과.

### 🔴 Q-2 정정 — 「해외주식에서 기타자산 블록이 뜬다」는 **실재하지 않았다**

계획서 초안은 `Step1.tsx:346-349`의 인라인 조건만 읽고 「marketType을 보지 않으니 stale 플래그로
블록이 뜬다」고 적었다. **추정이었고 틀렸다.** Step1은 해외주식·국외전출세에서 섹션 조립을
**조기 반환**한다:

```
Step1.tsx:175  if (form.marketType === "foreign_stock") { …; return items; }   // 대주주·기타자산 스킵
Step1.tsx:186  if (form.marketType === "exit_tax")      { …; return items; }
```

⇒ 기타자산 갈래에 **도달조차 하지 않는다**. anchor S-1·S-1b가 **수정 전에 이미 통과**해
구별력 0으로 드러났고, 거기서 원인을 찾아 정정했다
(memory `feedback_early_return_branch_skips_pipeline_stages` · `feedback_open_item_audit_stale_rate`).

### 그럼 무엇을 했는가 — **결함 수정이 아니라 술어 단일화**

안전은 술어가 아니라 **조기 반환이라는 다른 층**이 만들고 있었다
(memory `feedback_safety_attribution_in_compound_gate`). 같은 판정을 두 벌 유지하면 조기 반환이
바뀌는 순간 조용히 어긋나므로, Step1도 `isOtherAssetGroup`을 부르게 했다.

**mutation probe M-3 실측**: 단일화 후 `Step1.tsx`의 조기 반환 2줄을 지워도 **S-1·S-1b가 통과**한다
— 이제 술어가 혼자 막는다. (단일화 전이라면 같은 뮤테이션에서 두 케이스가 깨졌다.)

⚠️ 부수 효과: `marketType === ""`(미선택)도 새 술어에서는 닫힌다. 초기 플래그가 둘 다 `false`이고
플래그를 켜려면 블록이 먼저 떠야 하므로 **도달 불가능한 조합**이다.

## 6-2. mutation probe 실측 (구별력 검증)

| # | 뮤테이션 | 깨진 케이스 | 판정 |
|---|---|---|---|
| **M-1** | `isOtherAssetGroup`을 `marketType === "other_asset"` 단독으로 좁힘 | G-3 · G-3b · A-2b (3건) | §94② 경로를 지킨다 ✅ |
| **M-2** | `isClause9Applicable` 임계를 `true`로 무력화 | G-4 · G-4b · A-3b (3건) | 9호 임계를 지킨다 ✅ |
| **M-3** | Step1 조기 반환 2줄 제거 (단일화 **후**) | **0건** | 술어가 혼자 막는다 ✅ |

## 6-3. 구현 결과

| 층 | 파일 | 변경 |
|---|---|---|
| leaf | `lib/calc/stock-other-asset-scope.ts` (신규) | `isOtherAssetGroup` · `isClause9Applicable` |
| ⑤ | `app/calc/stock-transfer-tax/steps/Step3.tsx` | 두 칸 게이트 · 안내 카드 그룹별 분기 · 제목 §103② → **§103①** · 필드 1 hint 정정 |
| ⑤ | `app/calc/stock-transfer-tax/steps/Step1.tsx` | 인라인 술어 → leaf 호출 |
| ④ | `lib/calc/stock-transfer-tax-api.ts` | 그룹 아니면 `realEstateGroupBasicDeductionUsed: 0` · 9호 아니면 `crossClause8TaxBase` 키 부재 |
| ⑧ | — | **무변경** (요구 규칙 0건 — dead-end 없음) |
| anchor | `stock-basic-deduction-gate.anchor.test.tsx` (11) · `stock-other-asset-block-gate.anchor.test.tsx` (4) · `stock-basic-deduction-gate-api.anchor.test.ts` (7) | 22건 |
| E2E | `e2e/stock-basic-deduction-gate.spec.ts` | 4건 |

**게이트**: `npx tsc --noEmit` 0건 · `npm run lint` 0 errors ·
`npx vitest run __tests__/tax-engine/stock-transfer/ __tests__/calc/ __tests__/components/` **714파일 6554건 전건 통과**.

---

## 7. 범위 밖 — 발견만 기록 (memory 「dead code는 언급만」)

### §103② ↔ §103① 오인용 — 이번 파일 밖 **4곳**

②는 **순서** 조항이므로, **그룹·연 1회 한도**를 뜻하면서 ②를 인용한 곳은 오인용이다:

| 위치 | 문구 | 판정 |
|---|---|---|
| `Cross1045Client.tsx:446` | `legalBasis="소득세법 §103 ②" label="§103②1호"` | 🔴 ②에 **호가 없다** → §103①1호 |
| `Cross1045Client.tsx:212` | 「§103② 기본공제 중복」 | 🔴 한도 의미 → ① |
| `general-building-fractional.ts:24, 214` | 「기본공제(법 §103②)는 **연간 1회**」 | 🔴 한도 의미 → ① |
| `mixed-use-part-cards.ts:7` | 「§103② 기본공제 **1회**」 | 🔴 한도 의미 → ① |

**②가 맞는 곳**(정정 금지): `multi/route.ts:394` · `MultiTransferTaxResultView.tsx:133` ·
`StockAggregateSummaryCard.tsx:131` · `TransferReductionRows.tsx:144` — 전부 **순서** 문맥.
`DetailedStatementFormulaBuilders.ts:285` · `local-income-tax-display.ts`는 **지방세법** §103②(다른 법령).

### 이력 기반 크로스 경로와의 관계

`lib/calc/cross-104-5-allocation.ts:69`가 저장된 이력에서 `realEstateGroupBasicDeductionUsed`를
**프로그램적으로 주입**한다(배분 2안 비교). 이 경로는 폼 입력을 거치지 않으므로 본 게이트의
영향을 받지 않는다. Step3의 수동 입력은 **이력이 없을 때 사용자가 옮겨 적는** 대체 경로다.
두 경로의 통합은 별건.

# 주식 양도소득세 — 이력 합산신고 · 양도차손 배분 계획서 v1

> 작성 2026-09-16 · **기준 commit `54d606cf`** (origin/master)
> 트리거: 사용자 제보 — 이력 화면에서 「합산」 버튼이 **양도소득세에만** 있고 주식 양도세에는 없다
> 모든 현행 인용은 grep·Read·**vitest probe 실측**이다(추정 0). 미검증은 §6 V-n 레지스터에 명시.
> 정책: `feedback_pre_change_safety_net_probe` · `feedback_negative_assertion_needs_mutation_probe` ·
> `feedback_open_item_audit_stale_rate` · `feedback_korean_law_citation_verify` ·
> `feedback_rename_same_name_two_axes` · `feedback_required_field_needs_an_input_path`

---

## 0. 먼저 읽을 것 — 「미구현」이 아니라 **세 갈래**다

제보는 「합산 신고 및 양도차손 배분이 구현되어 있지 않다」였다. 실측하니 **엔진은 완성돼 있고**
빠진 것은 이력 축인데, 그 축이 하나가 아니라 셋이다. 그중 둘은 **요청받지 않은 결함**이다.

### 0.1 이미 구현된 것 — 재작업 금지

한 마법사 세션 안에서 종목을 2건 이상 확정(`savedItems`)하면 합산 경로가 **이미 항상 돈다**.

| 축 | 실측 현황 | 근거 |
|---|---|---|
| 다종목 폼·목록·검증 | `savedItems` + `validateFilingItems` 전수 차단 | `calc-wizard-stock-store.ts:127` · `StockTransferTaxCalculator.tsx:160` |
| §103① 그룹별 기본공제 1회 | 그룹 2개(`stock` / `real_estate_and_other_asset`) · 양도일 오름차순 배분 | `stock-transfer-aggregate.ts` · `-aggregate-deduction.ts` |
| **§102② 양도차손 통산** | 그룹마다 `offsetLossesCore` 별도 호출 | `stock-transfer-aggregate-loss-offset.ts` |
| **차손 배분 echo** | 영 §167의2①**1호(같은 세율 우선)** → **2호(다른 세율 pro-rata)** 종목별 흡수액 | 같은 파일 `:112-118` · `types:1092-1093` |
| 결과 카드·별지84호 | 종목별 열 + 통산 카드 | `StockAggregateSummaryCard.tsx:113` |
| anchor | `loss-offset-102-2.anchor.test.ts` 28건 | `__tests__/tax-engine/stock-transfer/` |

⇒ **「양도차손 배분」 엔진은 2026-09-12에 종결됐다**(`stock-multi-asset-filing-loss-offset.plan.md`
§10.1~10.3). 이 계획서는 그것을 **다시 만들지 않는다.**

### 0.2 빠진 것 — 실측 3건

| # | 갭 | 성격 |
|---|---|---|
| **A** | 이력에서 **여러 신고서를 골라 합산**하는 진입점이 없다 | 제보받은 것 · 기능 신설 |
| **B** | 🔴 다종목 합산 계산의 **이력이 「마지막 종목」만 저장된다** | 제보 안 받음 · **데이터 소실** |
| **C** | 🔴 **§111③ 확정신고 기납부세액 정산 축이 주식에 없다** | 제보 안 받음 · **세액 과대** |

**A만 고치면 안 된다** — A로 만든 합산 결과가 B 때문에 저장되는 순간 다시 깨지고, C가 없으면
A의 주 시나리오(예정신고 2건 → 확정신고 합산)에서 **이미 낸 세금을 또 내는 금액**이 뜬다.

---

## 1. 법령 — 축자 검증 완료 (KoreanLaw MCP, 2026-09-16 조회)

### 1.1 이 기능은 편의가 아니라 **법정 확정신고 의무**의 이행 경로다

**소득세법 시행령 제173조제5항**(법 §110④ 단서의 「대통령령으로 정하는 경우」):

> 1. 당해연도에 누진세율의 적용대상 자산에 대한 예정신고를 **2회 이상** 한 자가 법 제107조제2항의
>    규정에 따라 **이미 신고한 양도소득금액과 합산하여 신고하지 아니한 경우**
> 3. 법 제94조제1항제3호가목 및 나목에 해당하는 **주식등을 2회 이상 양도**한 경우로서
>    **법 제103조제2항을 적용할 경우 당초 신고한 양도소득산출세액이 달라지는 경우**

⇒ 주식을 2회 이상 양도하고 §103②(기본공제 연 250만원 1회·먼저 양도한 자산부터)를 적용하면
산출세액이 달라지므로 **확정신고 의무가 성립한다**. 지금 앱에는 그 경로가 없다.

같은 항 2호·4호가 **기타자산**을 같은 구조로 규정한다(§103②·§104⑤ 축).

### 1.2 기납부세액 — 법 §111③

> ③ 확정신고납부를 하는 경우 **제107조에 따른 예정신고 산출세액** … 이 있을 때에는 이를 **공제하여 납부**한다.

§111은 양도소득 일반 규정이라 주식에도 그대로 적용된다.

### 1.3 🔑 예정신고 대상 — **국외주식은 제외된다**

**법 §105①** 본문: 「제94조제1항 각 호(같은 항 **제3호다목** 및 같은 항 제5호는 **제외**한다)」
- **1호**: §94①1·2·**4호**(기타자산)·6호 → 양도일이 속하는 **달**의 말일부터 2개월
- **2호**: §94①3호**가·나목**(국내 상장·비상장) → 양도일이 속하는 **반기**의 말일부터 2개월

§94①3호다목 = 「외국법인이 발행하였거나 외국에 있는 시장에 상장된 주식등」 = **국외주식**.

⇒ **국외주식은 예정신고 의무가 없다** — 예정신고 산출세액이 존재하지 않으므로 §111③ 차감
대상에서 **원천적으로 빠진다**. 이것은 fallback 추정이 아니라 본문 괄호가 만든 부존재다.

> ✅ 이 판정은 코드에 **이미 정본이 있다** — `lib/calc/stock-filing-type.ts`가 같은 법문 분석을
> 주석으로 들고 있고 `isForeignStockMarket`을 export한다. **새로 만들지 말고 그것을 쓴다.**

### 1.4 기본공제 그룹 — 법 §103①

> 1. 제94조제1항제1호ㆍ제2호 및 **제4호**에 따른 소득 … 연 250만원
> 2. 제94조제1항**제3호**에 따른 소득 … 연 250만원

§103①2호는 **3호 전체(가·나·다목)** 다. 국외주식도 국내주식과 **같은 250만원 그룹**이다.
엔진 union이 정확히 2값(`"stock"` / `"real_estate_and_other_asset"`)인 근거다
(`types/stock-transfer.types.ts:1050`).

**법 §94②**: 「제1항제3호 및 제4호에 모두 해당되는 경우에는 **제4호를 적용**한다」 —
과점주주 주식(§94①4호다목)은 기타자산이다. 이미지의 「과점주주 주식」 이력이 여기다.

---

## 2. 갭 인벤토리 — 실측

### G-A 이력에 「합산」 버튼이 양도소득세에만 있다

`canAggregateFromHistory`(`lib/calc/transfer-aggregate-entry.ts:52`)가 첫 줄에서
`classifyLoadableTransfer(record) !== "single"`을 걸러 **`taxType === "transfer"`만** 통과시킨다.
호출처는 두 곳: `HistoryClient.tsx:581` · `HistoryDetailDrawer.tsx:300`.

주식에는 대응 leaf가 없다(`ls lib/calc/ | grep entry` → `transfer-*` 3종뿐).

**세액 실측** (vitest probe · A 이익 3,000만 / B 차손 1,000만 · 둘 다 코스피 대주주):

```
따로 신고(현행 이력 그대로)   5,500,000   ← 차손 종목 B는 세액 0, 통산 없음
합산 신고                     3,500,000   ← §102② 통산 후
                              ─────────
                              2,000,000  과대   (= 차손 1,000만 × 20%)
```

### G-B 🔴 다종목 합산 계산의 이력이 「마지막 종목」만 저장된다

`StockTransferTaxCalculator.tsx:88`

```ts
useAutoSaveCalculation({
  taxType: "stock_transfer",
  inputData: formData as unknown as Record<string, unknown>,   // ← savedItems 없음
  resultData: isResult ? result : null,                        // ← result = 마지막 종목 per-item
```

`savedItems` **전수 grep 결과 저장 경로 0건** — store·사이드바·검증·결과 prop에만 등장하고
`useAutoSaveCalculation`·`runStockManualSave` 어디에도 실리지 않는다.
`result` 자체가 `:168`에서 `agg.items[agg.items.length - 1]`(마지막 종목)로 설정된다.

**실측**: 위 A·B를 합산 계산한 뒤 이력을 보면
```
저장되는 resultData.finalTax   0          ← 이력 화면 「납부세액: 0」
실제 합산 totalFinalTax        3,500,000
종목 A의 입력                  이력에서 소실
```

`:167` 주석이 「결과 화면·이력이 단건 `result`를 전제하므로」라고 **의도적 이연**을 적어 두었다.
그 이연이 지금 데이터 소실로 나타나고 있다.

### G-C 🔴 businessKey가 단건 record와 충돌해 덮어쓴다

`lib/storage/business-key.ts:74-81` — 주식 키는 `sec:{종목명}|{양도일}`이고 **다건 표지가 없다**.
부동산은 `:51`에서 `__multiTransfer === true ? "|multi" : ""`로 갈라 둔다.

⇒ 다종목 합산 record(마지막 종목 B로 저장됨)와 **종목 B 단건 record가 같은 키**가 되어
`saveOrUpdateByBusinessKey`가 한쪽을 덮어쓴다. PR #1646에서 부동산에 대해 닫은 것과 **같은 축**이
주식에 열려 있다.

### G-D 🔴 §111③ 기납부세액 정산 축이 주식에 없다

주식 엔진의 `priorPaidTax`는 **가산세 base 차감 전용**이다 —
`types/stock-transfer.types.ts:316-318`이 명시한다:

> ⚠️ 이름이 비슷한 `priorPaidTax` 와 **다른 필드**다 — 그쪽은 **가산세 기준금액** 전용이라
> **납부할 세액을 1원도 줄이지 않는다**.

부동산 다건에는 정본이 있다 — `computeAutoPriorPaid`(`lib/calc/multi-prior-filed.ts`, 39줄) →
④ `multi-transfer-tax-api.ts:425` → ⑫ Zod `:314` → 엔진 `transfer-tax-aggregate.ts:459` settlement.

주식에는 이 체인이 **통째로 없다**. `filingType`도 세액에 닿지 않는다(`stock-filing-type.ts` 주석
「엔진이 읽지 않는다 — 실측」).

### G-E 이력 편집이 직전 세션의 `savedItems`를 남긴다

`HistoryClient.tsx:304-310`이 `setState({ currentStep, formData, result, error })`만 부르고
`savedItems`를 **비우지 않는다**. `savedItems`는 `partialize`(`:232`)로 sessionStorage에
영속되므로, 다종목 작업 뒤 이력에서 단건을 편집하면 **직전 종목들이 그대로 합산에 섞인다**.

---

## 3. 안전망 실측 — 바꾸기 전에 재라 (mutation probe, 2026-09-16)

### M-1 — 주식 businessKey를 무력화하면 무엇이 막는가

`business-key.ts:80`의 반환값에 `|MUTATED` 접미 추가 → `__tests__/lib/storage/`·`storage/`·`calc/`
(284파일 2,684건) 실행:

```
Test Files  1 failed | 283 passed
Tests       1 failed | 2683 passed     ← 형식 단언 1건뿐
```

⇒ 키 **형식**은 1건이 지킨다. **충돌 여부**를 보는 것은 0건이다.

### M-2 — 🔴 이력 저장 inputData를 오염시키면 무엇이 막는가

`StockTransferTaxCalculator.tsx:88`의 `inputData`에 `__MUTATED__: true`를 주입 → **전건 실행**:

```
Test Files  2056 passed | 1 skipped
Tests       21549 passed | 13 skipped | 4 todo     ← 실패 0
```

⇒ **안전망 0건.** 주식 이력에 무엇이 저장되는지를 지키는 테스트가 **하나도 없다**.
E2E `stock-multi-item-aggregate.spec.ts`도 이력을 전혀 단언하지 않는다(grep 0건).

**이것이 G-B가 살아남은 이유이고, 고친 뒤를 고정할 신규 anchor를 필수로 만드는 근거다.**

### M-3 — 저장된 record만 보고 「합산 잔재」를 판별할 수 있는가 (Q-3 정확도)

단건 결과와 합산 per-item 결과를 **전 필드 diff**했다:

| 시나리오 | 차이 나는 필드 | 판별 |
|---|---|---|
| 차손 동반 | `lossOffsetFromSameGroup`·`lossOffsetFromOtherGroup` **키 존재**(값 0이어도) | ✅ 가능 |
| 둘 다 이익 · 저장된 쪽이 **기본공제 못 받음** | `basicDeduction` 2,500,000 → **0** | ✅ 가능 |
| 둘 다 이익 · 저장된 쪽이 **기본공제 받음** | **차이 0** (키 53 = 53, diff `{}`) | 🔴 **원리적 불가** |

⇒ 경고 배지는 **완전 탐지가 불가능하다**. 확실히 잡히는 것만 표시하고 한계를 §8에 적는다.
근본 해결은 G-B로 **앞으로를 막는 것**이다.

---

## 4. 설계

### 4.1 G-B — 저장 규약 (부동산 대칭)

부동산 정본: `inputData = { __multiTransfer: true, ...form }`(`MultiTransferTaxCalculator.tsx:151`).

```ts
// StockTransferTaxCalculator
const isMulti = savedItems.length > 0;
const historyInput = isMulti
  ? { __multiStock: true, items: [...savedItems, formData] }
  : (formData as unknown as Record<string, unknown>);
const historyResult = isMulti ? aggregateResult : result;
```

동반 수정 4곳 — **전부 `items[0]` 폴백 한 줄**이다(PR #1646 `extractAddress`와 같은 패턴):

| 지점 | 변경 |
|---|---|
| `title-generator.ts:91` `extractStockSecurityName` | `__multiStock`이면 `items[0].securityName` |
| `title-generator.ts:101` `extractStockTransferDate` | `__multiStock`이면 `items[0]`의 날짜 |
| `title-generator.ts:157` 제목 | `주식 양도세 (다종목) — {대표} 외 N건` |
| `HistoryClient.tsx:163` `extractTotalTax` | `resultData.totalFinalTax` 경로 추가 |

**resume(편집)**: `__multiStock` record → `savedItems = items.slice(0, -1)` · `formData = items.at(-1)`.
**G-E 동반**: 단건 record 편집 시 `savedItems: []`를 **명시적으로** 넣는다.

### 4.2 G-C — businessKey

```ts
case "stock_transfer": {
  const sec = extractStockSecurityName(inputData);   // 4.1로 __multiStock 인식
  if (!sec) return null;
  const date = extractStockTransferDate(inputData);
  const multi = inputData.__multiStock === true ? "|multi" : "";
  return `sec:${sec}|${date ?? ""}${multi}`;
}
```

⚠️ **대표 종목(첫 종목) 기준을 유지한다** — 부동산 다건(`addr:{첫 자산}|multi`)과 같은 규약이다.
종목을 추가하면 같은 record가 갱신된다(= 같은 신고서를 고치는 중). 「전 종목명 join」은 종목을
하나 추가할 때마다 새 record가 쌓여 사용자 기대와 어긋난다. 한계는 §8에 적는다.

### 4.3 G-D — §111③ 기납부세액 정산 (**세액 변경 · L3**)

🔴 **이름 축이 이미 둘이다** — 기존 `priorPaidTax`(가산세 base, 종목 수준)와 섞으면 안 된다
(`feedback_rename_same_name_two_axes`). 신고 단위 축은 **다른 이름**을 쓴다:

```ts
// StockTransferAggregateInput (신고 단위)
preliminaryPaidTax?: number;       // §107 예정신고 산출세액 합 (국세)
preliminaryPaidLocalTax?: number;  // 지방소득세
```

자동 파생 leaf — `lib/calc/stock-prior-filed.ts` 신설(`multi-prior-filed.ts` 39줄 대칭):

```
1. 국외주식(isForeignStockMarket) 제외         ← §105① 본문 괄호 (1.3)
2. 신고일이 가장 늦은 종목보다 빠른 종목 = 기신고분(예정신고)
3. 그 종목들의 이력 결정세액(국세·지방)을 합산
```

⚠️ **신고일 fallback이 부동산과 다르다** — 주식 §105①2호는 **반기** 말일 +2개월,
기타자산은 §105①1호 **달** 말일 +2개월이다. 법정기한 fallback을 쓸 때 두 축을 갈라야 한다.
`stock-filing-type.ts`가 이미 그 판정을 들고 있는지 **Do 착수 전 확인**(V-2).

적용: 부동산과 같이 **엔진 settlement 단계**에서 차감한다(④→⑫→⑭→엔진).

### 4.4 G-A — 이력 합산 진입점

`lib/calc/stock-aggregate-entry.ts` 신설 — `transfer-aggregate-entry.ts`(127줄) 대칭:

```ts
canStockAggregateFromHistory(record)   // stock_transfer && !__multiStock && extractTaxYear !== null
selectStockAggregateCandidates(records, base)   // 같은 clientId · 같은 과세연도(다르면 사유 붙여 비활성)
enterStockAggregate(records, router)   // 양도일 오름차순 → savedItems/formData → /calc/stock-transfer-tax
```

- **편입 순서 = 양도일 오름차순**. §103②가 「먼저 양도한 자산의 양도소득금액에서부터 순서대로
  공제한다」이므로 이 순서가 곧 법정 배분 순서다.
- **마지막 종목이 편집기(`formData`)** — `[...savedItems, formData]` 규약을 그대로 만족시킨다.
- `extractTaxYear`는 **이미 주식을 안다**(`cross-104-5-history.ts:43-46`). 재구현 금지.
- 합산 대상은 **주식 + 기타자산 + 국외주식 전부**(Q-2). 엔진이 §102①1호/2호를 갈라 통산하고
  §103① 그룹도 갈라 준다 — 섞어 담는 것이 §110① 확정신고(과세기간 1건)의 실제 모습이다.
- 버튼은 기존 두 호출처에 `||`로 얹는다(`HistoryClient.tsx:581` · `HistoryDetailDrawer.tsx:300`).

### 4.5 경고 배지 (Q-3)

`lib/calc/stock-legacy-aggregate-suspect.ts` — **확실히 잡히는 것만**:

```ts
"lossOffsetFromSameGroup" in resultData || "lossOffsetFromOtherGroup" in resultData
|| (basicDeductionGroup === "stock" && !isExempt && transferIncome > 0 && basicDeduction === 0)
```

문구: 「합산 결과가 저장되지 않은 이력입니다 — 다시 계산하세요」.
**복구는 하지 않는다**(원본 종목이 애초에 저장된 적이 없다 — §8).

### 4.6 ❌ 채택하지 않는 대안 (재제안 금지)

- **마이그레이션으로 기존 다종목 record 복구** — 불가능. `savedItems`가 IndexedDB에 저장된 적이
  없고 sessionStorage는 세션과 함께 사라진다. 복원할 소스가 물리적으로 없다.
- **종목마다 record N건 저장** — §103① 기본공제가 이력 화면에서 N번 계상돼 보인다. 부동산 다건도
  1 record다.
- **기존 `priorPaidTax`를 §111③ 축으로 재사용** — 가산세 base와 납부세액 차감은 다른 축이다.

---

## 5. Phase · PR 분할 (Q-4 확정: 세액 변경 축만 분리)

| PR | 내용 | 세액 | 깊이 |
|---|---|---|---|
| **PR-1** | G-B 저장 규약 · G-C businessKey · G-E stale savedItems · 경고 배지 | **불변** | L2 |
| **PR-2** | G-D §111③ 기납부 정산 | 🔴 **변경** | L3 |
| **PR-3** | G-A 이력 합산 진입점 + E2E | 불변 | L2 |

순서 고정: **PR-1 → PR-2 → PR-3**. PR-3이 만드는 합산 결과는 PR-1의 저장 규약과 PR-2의 정산 축을
전제한다. 뒤집으면 PR-3이 만든 record가 곧바로 깨진다.

### Phase 0 — Pre-Do anchor (Do 진입 조건)

M-2가 **안전망 0건**을 실측했으므로 anchor는 선택이 아니다. 착수 전 🔴로 작성한다.

| ID | 무엇을 고정하는가 |
|---|---|
| S-1~S-3 | `__multiStock` record의 inputData·resultData·title |
| S-4 | 다종목 record와 단건 record의 businessKey가 **다르다** |
| S-5 | `__multiStock` resume → `savedItems` N-1건 + `formData` 1건 |
| S-6 | 단건 resume → `savedItems`가 **비워진다**(G-E) |
| S-7 | `extractTotalTax`가 합산 총액을 읽는다 |
| P-1~P-3 | 경고 배지 술어 — 양성 2종 + **음성 대조**(단건은 안 붙는다) |
| D-1~D-4 | §111③ — 국외주식 제외 · 신고일 필터 · 차감 적용 · 미차감 대조 |
| E-1~E-3 | 진입점 — 후보 선별 · 과세연도 불일치 비활성 · 양도일 오름차순 |
| E2E-1 | 이력 2건 시드 → 합산 → 통산 반영 세액 + 이력 재저장 |

각 anchor에 **대응 mutation**을 붙여 「정확히 그 anchor만 실패」를 확인한다.

### Phase A — PR-1
1. `title-generator.ts` 추출기 2개 + 제목 → verify: S-1~S-3
2. `business-key.ts` `|multi` → verify: S-4 + M-1의 기존 1건 갱신
3. `StockTransferTaxCalculator.tsx:88` 저장 분기 → verify: S-1~S-3·S-7
4. `HistoryClient.tsx:300-312` resume 분기(+`savedItems` 명시) → verify: S-5·S-6
5. 경고 배지 leaf + 이력 카드 → verify: P-1~P-3

### Phase B — PR-2 (세액 변경)
1. `lib/calc/stock-prior-filed.ts` 신설 → verify: D-1·D-2
2. 엔진 settlement + result 필드 → verify: D-3·D-4
3. ④ `stock-transfer-tax-api.ts` · ⑫ Zod · ⑭ route → verify: 14지점 self-grep
4. ⑦ 결과 카드 + 별지84호 행 → verify: 표시 anchor

### Phase C — PR-3
1. `lib/calc/stock-aggregate-entry.ts` 신설 → verify: E-1~E-3
2. 두 호출처 버튼 + 선택 모달(부동산 모달 재사용 가능성 확인 — V-3)
3. E2E → verify: E2E-1

### Phase D — 게이트 (PR마다)
`npx tsc --noEmit` 0 · `npm run lint` 0 · 해당 범위 vitest · **PR-2·PR-3은 전체 E2E**
(`feedback_blocking_validation_full_e2e_regression` — 저장 규약 변경은 이력 시드 spec을 깬다).

---

## 6. 결정 기록 · 미검증 레지스터

### 6.1 Q-n — 사용자 결정 (2026-09-16, 전건 확정)

| ID | 질문 | 결정 | 근거 |
|---|---|---|---|
| **Q-1** | 작업 범위 | **A+B+C 전부** | A만으로는 B가 결과를 지우고 C가 없으면 세액이 틀린다 |
| **Q-2** | 합산 대상 | **주식 + 기타자산 + 국외주식 전부** | §110① 확정신고는 과세기간 1건 · 엔진이 §102①·§103① 그룹을 이미 가른다 |
| **Q-3** | 기존 record | **의심 record에 경고 배지** | 복구는 불가(§8) · 틀린 세액 신고는 막는다 |
| **Q-4** | PR 분할 | **세액 변경 축만 분리 (3-PR)** | PR-2만 세액이 바뀐다 — 회귀 원인 축을 가르기 위함 |

### 6.2 V-n — ✅ **전건 해소** (2026-09-16, 착수 전 실측)

| ID | 항목 | 판정 | 근거 |
|---|---|---|---|
| **V-1** | 국외주식의 `basicDeductionGroup` | ✅ `"stock"` — §103①2호 정합 | `foreign-stock-aggregate-adapter.ts:109` · `-aggregate-104-5.ts:123` 주석이 같은 사실을 명시 |
| **V-2** | §105① 법정기한 계산 | ✅ **이미 있다 — 신설 불요** | `stock-filing-type.ts:65` `resolvePreliminaryClause`(1호/2호 분기) + `:89` `calcPreliminaryDeadline`. **재사용한다** |
| **V-3** | 부동산 합산 모달 재사용 | ⚠️ **일반화 필요** · 🔴 **착수 중 정정: 3곳 → 7곳** | 초판은 grep 한 문자열 3개만 셌다. 실제 결합 축은 **7개**(라벨·금액 래핑·폐기 판정·문구 4종이 더 있었다) — §10.3 참조. 결론(복제 금지·props 주입)은 유지 |
| **V-4** | 다종목 record의 `taxLawVersion` | ✅ **자동 해소** | `StockTransferTaxCalculator.tsx:90`이 `extractStockTransferDate(formData)`를 쓴다 — §4.1에서 그 추출기가 `__multiStock`을 인식하면 대표 종목 날짜가 자동으로 들어간다 |
| **V-5** | `mergeDomestic`의 혼합 처리 | ✅ Q-2 범위가 엔진에서 성립 | `stock-transfer-aggregate.ts:200-206` — 국내 인덱스만 교체하고 **전체 리스트를 유지**해 국내·국외·기타자산이 섞인 채 `aggregateCore`에 들어간다 |

> **V-3이 유일한 설계 변경이다** — 모달 신설(+1일)이 아니라 기존 246줄의 **props 3개 주입**으로
> 해결된다. 파일 위치(`components/calc/transfer/`)는 **옮기지 않는다** — import 파급이 이득보다
> 크다(Surgical Changes).

---

## 7. 14 동기화 지점 판정

| PR | ①~⑧ 클라이언트 | ⑨~⑭ API/Route |
|---|---|---|
| PR-1 | ①③(저장·복원 규약) · ⑦(이력 표시) | **해당 없음** — 저장 축은 서버를 경유하지 않는다 |
| **PR-2** | ①②③④⑤⑥⑦⑧ **전부** | ⑫Zod · ⑬body spread · ⑭route **전부** |
| PR-3 | ①(store 편입) · ⑤(버튼·모달) | **해당 없음** — 기존 합산 API를 그대로 탄다 |

🔴 **PR-2의 ⑫⑬⑭는 TypeScript가 못 잡는다** — 누락 시 침묵 stripping으로 차감이 **조용히 0**이
된다. 커밋 전 `preliminaryPaidTax` 자가 grep 필수.

---

## 8. 한계 — 고치지 못하는 것

1. **이미 저장된 다종목 이력은 복구되지 않는다.** `savedItems`가 IndexedDB에 저장된 적이 없다.
   경고 배지는 「다시 계산하라」고 알릴 뿐이다.
2. **경고 배지는 전부를 잡지 못한다.** M-3 실측 — 저장된 종목이 기본공제를 온전히 받고 차손 통산도
   없었다면 단건 결과와 **바이트 단위로 동일**해 판별이 원리적으로 불가능하다.
3. **다종목 businessKey는 대표 종목 기준**이다. 같은 대표 종목·같은 양도일로 **종목 구성만 다른**
   두 합산 신고는 여전히 한 record를 공유한다(부동산 다건과 동일한 기지의 한계).
4. **부동산 ↔ 기타자산 크로스 통산**은 여전히 범위 밖이다. 둘 다 §102①1호지만 엔진이 분리돼
   경로가 없다(`cross-engine-104-5-real-estate-other-asset.plan.md` §8).

---

## 9. 비스코프

- 주식 **수정신고·경정청구** 진입점(이미지에서 주식에만 없는 또 다른 버튼) — 별건
- §107② **합산 예정신고**(2회차 예정신고에서 1회차와 합산) — 이 계획은 §110① 확정신고 축만 다룬다
- 파생상품(§94①5호) — 앱 미지원
- 부동산 ↔ 주식 크로스(§104⑤)는 기존 `cross-104-5-*` 경로가 담당

---

## 10. Do 진입 조건 / 완료 기준

**진입 조건**
- [x] V-1 ~ V-5 전건 해소 (§6.2 — 2026-09-16 완료)
- [ ] Phase 0 anchor 전건 🔴 작성 + 실패 확인

**완료 기준 (PR마다)**
- [ ] anchor 전건 통과 + **대응 mutation이 정확히 그 anchor만** 실패
- [ ] `npx tsc --noEmit` 0 · `npm run lint` 0
- [ ] PR-2·PR-3: 전체 E2E 초록 (파이프 금지 — 파일 리다이렉트 후 `EXIT=$?`)
- [ ] PR-2: ⑫⑬⑭ 자가 grep 기록
- [ ] CI 전건 SUCCESS를 **롤업 conclusion + `headRefOid` 일치**로 확인 후 머지
      (`gh pr merge --auto` 호출 금지 — 그 호출 자체가 머지다)

---

## 10.1 PR-1 완료 기록 (2026-09-16) — 세액 불변

### 구현

| 지점 | 파일 | 내용 |
|---|---|---|
| 대표 종목 단일화 | `lib/storage/title-generator.ts` | `stockRepresentative()` 신설 — 종목명·양도일·키·제목이 **한 곳**을 거친다 |
| 제목 | 같은 파일 | `주식 양도세 (다종목) — {대표} 외 N건 (양도 …)` |
| businessKey | `lib/storage/business-key.ts` | `__multiStock`이면 `|multi` 접미 |
| 저장 규약 | `StockTransferTaxCalculator.tsx` | `{ __multiStock, items }` + `aggregateResult` — **자동저장·수동저장 양쪽** |
| 빈 폼 판정 | `components/calc/stock-transfer-save-handler.ts` | `isStockFormEmpty`가 대표 종목을 본다 |
| 복원 | `lib/calc/stock-resume-entry.ts` (신설) | `buildStockResumeState` — `savedItems`를 **항상** 싣는다 |
| 이력 표시 | `app/history/HistoryClient.tsx` | `extractTotalTax`에 `totalFinalTax` · resume leaf 배선 · 경고 배지 |
| 배지 술어 | `lib/calc/stock-legacy-aggregate-suspect.ts` (신설) | 오탐 0 우선 — 확실한 두 신호만 |

### 🔴 계획에 없던 것 — 수동저장도 같은 규약이어야 했다

계획서 §4.1은 자동저장만 지목했다. **불완전했다** — `[저장하기]`(`runStockManualSave`)도 `form: formData`로
같은 결함을 갖고 있었다. 함께 고쳤고, `isStockFormEmpty`가 다종목 형태에서 종목 필드를 못 찾아
**「빈 폼」으로 거부**하는 문제가 딸려 나와 대표 종목 판정을 넣었다.

⇒ **「저장 경로」를 셀 때 자동저장만 세면 안 된다**(`feedback_enumerate_all_write_sites_before_fixing`).

### 뮤테이션 — 전건 과녁 적중

| ID | 무력화 | 실패한 것 |
|---|---|---|
| P-1 | businessKey `|multi` 제거 | S-4 **1건만** |
| P-2 | `stockRepresentative` 분기 제거 | S-1·S-2·S-3 계열 5건 |
| P-3 | resume `savedItems: []` 제거 | S-6 계열 2건 |
| P-4 | 배지 술어 ①(lossOffset) 제거 | P-1 1건 |
| P-5 | 배지 술어 ②(기본공제 0) 제거 | P-2 1건 |
| P-6 | `extractTotalTax` totalFinalTax 제거 | S-7 1건 |

### 🔴 P-7 — vitest는 **배선을 못 본다**. E2E가 유일한 안전망이다

계산기의 저장 배선을 **결함 상태로 원복**하고 PR-1 anchor 전건을 돌렸다:

```
P-7 (vitest)  Test Files 4 passed · Tests 33 passed     ← 결함이 돌아왔는데 전부 초록
P-7 (E2E)     2 failed · 1 passed                       ← SH-1·SH-2가 잡는다
```

anchor는 record 형태를 **직접 주입해** leaf를 검증하므로 「컴포넌트가 그 leaf를 쓰는가」를 보지
못한다(`feedback_library_anchor_does_not_prove_component_uses_it`). PR #1646의 P-8과 같은 구조가
**같은 저장소에서 두 번째로** 재현됐다.

⇒ `e2e/stock-multi-history-record.spec.ts` (SH-1~SH-3) 신설. **이 spec을 지우면 배선은 무방비다.**

### 부수 작업

- `e2e/_helpers/stock-item-fill.ts` 추출 — `stock-multi-item-aggregate.spec.ts`가 들고 있던 입력
  헬퍼를 두 spec이 공유한다(복제하면 마법사 DOM 변경 시 한쪽만 고쳐진다)
- `StockAggregateSummaryCard`에 `data-testid="stock-aggregate-total-final-tax"` — 결과 화면 총액과
  이력 카드 금액을 **같은 축**으로 대조하기 위한 셀렉터
- ⚠️ 결과 화면은 `won()`으로 「원」을 붙이고 이력 카드는 `toLocaleString()`이라 붙이지 않는다.
  E2E는 숫자만 남겨 비교한다 — 표기 차이로 깨지면 결함이 아니라 셀렉터 문제가 된다

### 범위 밖으로 남긴 것

`extractCardSummary`(이력 카드 보조 줄)는 주식 분기가 **원래 없다** — 다종목과 무관하므로 건드리지
않았다(Surgical Changes).

---

## 10.2 PR-2 완료 기록 (2026-09-16) — 🔴 세액 변경

### 구현 — 14 동기화 지점

| 지점 | 파일 | 내용 |
|---|---|---|
| ① 타입 | `calc-wizard-stock-form-types.ts` | `preliminaryPaidTax`·`preliminaryPaidLocalTax` |
| ② 기본값 | `calc-wizard-stock-form.ts` | `"0"` |
| ③ normalize | `calc-wizard-stock-normalize.ts` | 구 세션 가드 |
| 신고 단위 승계 | `calc-wizard-stock-store.ts` `carryFilingFields` | 종목마다 다른 값을 갖는 것이 성립하지 않는다 |
| ④⑬ 전송 | `lib/calc/stock-preliminary-paid.ts` (신설) + `stock-transfer-tax-api.ts` | 세 조건 게이트 |
| ⑤ UI | `steps/Step3.tsx` | 확정신고 + 2종목 + 국내 종목 존재일 때만 |
| ⑦ 결과 | `StockAggregateSummaryCard.tsx` + `StockFilingFormTableHelpers.ts` | 정산 블록 + 별지84호 31-1~31-3 |
| ⑫ Zod | `stock-transfer-tax-schema.ts` | `optional().nonnegative()` |
| ⑭ route | `app/api/calc/stock-transfer/route.ts` | 신고 옵션으로 전달 |
| 엔진 | `stock-transfer-aggregate.ts` | `computeSettlement` 재사용 + `settlement` 조건부 echo |

**⑧ validate는 해당 없음**이다 — 추가할 차단이 실질적으로 없다. 음수는 `CurrencyInput`이
막고, 잘못된 신고유형은 ⑤가 숨기고 ④가 안 보낸다. 보이지 않는 필드를 validate가 차단하면
사용자가 고칠 수 없는 모순이 된다. 없는 검증을 만들지 않았다.

### 이름 축을 갈랐다

기존 `priorPaidTax`는 **가산세 base 차감 전용**이다(`types:316-318`이 「납부할 세액을 1원도
줄이지 않는다」고 명시). 신고 단위 축은 `preliminary*` 접두로 분리했다
(`feedback_rename_same_name_two_axes`).

### 게이트가 «셋»이고, 세 곳에서 같은 술어를 쓴다

계획서가 「확정신고에서만」이라고 적는 것으로는 부족하다 — 제외를 강제하는 가드가 코드에
없으면 stale 폼 값이 축을 조용히 켠다(`feedback_plan_exclusion_decision_needs_a_code_gate`).

| 조건 | 근거 |
|---|---|
| 확정신고 | §111③ 「**확정신고납부를 하는 경우**」 |
| 종목 2건 이상 | 영 §173⑤3호 「주식등을 **2회 이상** 양도한 경우」 |
| 국내 종목 존재 | 법 §105① 본문 괄호 — 국외만이면 예정신고 산출세액이 **존재할 수 없다** |

⑤(화면)와 ④(전송)가 **같은 세 술어**를 쓴다(`feedback_ui_gate_two_conditions_downstream_one`).

### 🔴 실측이 내 주석을 반증했다 — Q-2 구별력 0

정산 base 로 `totalFinalTax`(절사 완료)를 쓰면서 「절사 **전** 값을 쓰면 최대 9원 어긋난다」고
적었다. **추정이었고 틀렸다.**

- 뮤테이션 Q-2(base 를 `determinedTotal + 가산세`로 교체) → anchor **6건 전부 통과**
- 조합 4종(기본·가산세 동반·홀수 단가·전자신고) 실측 → `floorTen` 차이 **전부 0**

상류(`applyStockTaxRate`·`finalizeStockTax`·가산세)가 이미 10원 단위로 내려놓아 이 절사가
**현재는 no-op** 이다. ⇒ 주석을 정정했고, anchor D-5 에 **「현재 구별력 0」을 명시**했다.
`totalFinalTax`를 쓰는 이유는 「어긋나기 때문」이 아니라 화면과 같은 축을 단일 소스로 두기
위함이다(`feedback_mutation_zero_discrimination_is_not_proof`).

### 뮤테이션

| ID | 무력화 | vitest | E2E |
|---|---|---|---|
| Q-1 | 엔진 기납부 차감 | **3건 실패** | — |
| Q-2 | 정산 base 를 절사 전 값으로 | **0건** 🔴 구별력 없음(위 참조) | — |
| Q-3 | 확정신고 게이트 | **2건 실패** | — |
| Q-4 | 단건 게이트 | **1건 실패** | — |
| Q-5 | 국외전용 게이트 | **1건 실패** | — |
| Q-6 | ⑫ Zod 필드(침묵 strip) | **1건 실패** | — |
| **Q-7** | **⑭ route 전달** | **16건 전부 초록** 🔴 | **1건 실패** |
| **Q-8** | **⑤ UI 입력란** | — | **3건 실패** |

### 🔴 Q-7 — 「vitest는 배선을 못 본다」가 **세 번째** 재현이다

PR #1646 P-8 · PR-1 P-7 에 이어 같은 구조가 또 나왔다. route 한 줄을 끊어 정산이 **조용히
사라지는데** anchor 16건이 전부 초록이었다. ⑫⑬⑭는 TypeScript 도 못 잡는 구간이라
`e2e/stock-preliminary-paid-settlement.spec.ts` 의 `postData` 단언이 유일한 안전망이다.

### 범위 밖

단건 경로(종목 1건)의 §111③ 정산. 법 §110④ 본문이 「예정신고를 한 자는 확정신고를 하지
아니할 수 있다」이고, 확정신고 의무를 만드는 영 §173⑤3호의 요건이 「**2회 이상** 양도」라
단건에서는 이 정산이 성립하는 경우가 사실상 없다.

---

## 10.3 PR-3 완료 기록 (2026-09-17) — 세액 불변 · **제보 기능 본체**

### 🔴 초판 판정 정정 — V-3의 「하드코딩 3곳」은 **7곳**이었다

착수 전 V-3 은 모달의 세목 결합을 **3곳**으로 적었다(`selectAggregateCandidates` ·
`enterMultiAggregate` · `.list({taxType:"transfer"})`). **불완전했다** — 특정 문자열을
grep 한 결과였고, 실제로 갈라야 하는 축은 **7개**였다:

| # | 축 |
|---|---|
| 1~3 | 후보 선별 · 진입 · `taxType` 필터 (초판이 센 것) |
| 4 | `transferDateLabel` — 주식은 「종목명 (양도일)」이 먼저다 |
| 5 | `determinedTaxOf` — 부동산 `resultData.result.determinedTax` / 주식 `resultData.finalTax` (래핑이 다르다) |
| 6 | 폐기 확인 판정 — 부동산 `multiStoreHasUserWork` / 주식 `savedItems.length > 0` |
| 7 | 제목·설명·하단 안내·빈 목록 문구 |

⇒ **「형태를 열거해 세면 빠뜨린다」**(`feedback_enumerate_forms_vs_conservative_superset`).
결론(복제 금지·props 주입)은 유지됐지만 어댑터 인터페이스가 3 멤버가 아니라 11 멤버가 됐다.

### 추출은 「바꾸기 전에 안전망을 잰」 뒤에 했다

`HistoryAggregateSelectModal`(246줄)은 **동작하는 부동산 경로**다. 건드리기 전에
`e2e/transfer-history-aggregate-entry.spec.ts` 를 돌려 **기준선 2/2**를 확보하고, 추출 후
같은 spec 으로 **2/2 무변경**을 실측했다.

- `components/calc/shared/HistoryAggregateSelectShell.tsx` — 세목 중립 껍데기(신설)
- `components/calc/transfer/HistoryAggregateSelectModal.tsx` — **부동산 어댑터**로 축소
- `components/calc/stock-transfer/StockHistoryAggregateModal.tsx` — 주식 어댑터(신설)

⚠️ **폐기 확인 제목을 어댑터로 뺐다** — 껍데기에 공통 문구를 두면 부동산의
「입력 중인 다건 작업이 있습니다」가 바뀐다. 표시 문자열 변경은 그 자체로 회귀 표면이라
(`feedback_display_string_change_needs_reverse_grep`) **세목별로 그대로 보존**했다.

### 편입 순서가 세액을 가른다

`buildStockAggregateSession` 은 **양도일 오름차순**으로 편입한다. §103②가 「해당 과세기간에
**먼저 양도한 자산의 양도소득금액에서부터 순서대로** 공제한다」이므로 이 순서가 곧 법정
배분 순서다 — 뒤집으면 어느 종목이 기본공제 250만원을 가져가는지가 달라져 **세액이 바뀐다**
(뮤테이션 R-2 가 2건으로 잡는다).

### 뮤테이션

| ID | 무력화 | vitest | E2E |
|---|---|---|---|
| **R-1** | **이력 카드 버튼 게이트** | **11건 전부 초록** 🔴 | **4건 실패** |
| R-2 | 편입 순서 내림차순(§103② 위반) | **2건 실패** | — |
| R-3 | 다종목 이력 제외 가드(이중 계상) | **1건 실패** | — |
| R-4 | `normalizeStockFormData` 제거 | **1건 실패** | — |

### 🔴 R-1 — 「vitest는 배선을 못 본다」가 **네 번째**다

PR #1646 P-8 · PR-1 P-7 · PR-2 Q-7 에 이어 같은 구조다. 이력 카드의 버튼 술어에서
`canStockAggregateFromHistory` 를 빼 **기능이 통째로 사라졌는데** anchor 11건이 전부 초록이었다.

⇒ 이 저장소에서 **컴포넌트 경계를 넘는 배선은 E2E 외에 안전망이 없다**. 네 번 연속 실측됐다.

### E2E 픽스처 — 제품이 아니라 시드가 틀렸다

SA-4 가 처음에 실패했는데 원인은 시드에 `selfShareRatio`가 없었던 것이다. 화면은
「1번째 종목 「SK하이닉스」: 대주주인 경우 지분율 또는 시가총액을 1개 이상 입력하세요
(시행령 §157)」로 **어느 종목이 문제인지 지목해** 차단했다 — ⑧이 정상 동작한 것이다.
픽스처를 고쳤고, 그 사유를 spec 주석에 남겼다.

### 범위 밖

기납부세액 **자동 파생**(이력의 결정세액에서 §111③ 금액을 추정). 부동산은
`computeAutoPriorPaid`가 하지만, 주식은 예정신고 산출세액(§107②)과 이력의 결정세액이
같다는 보장이 없다 — 합산 모달 하단에 **3단계에서 직접 적으라고 안내**한다.

---

## 10.4 PR-4 완료 기록 (2026-09-17) — 🔴 세액 변경 · **§10.3 「범위 밖」의 정정**

### 🔴 초판 판정 정정 — 「범위 밖」으로 접었던 것을 사용자가 요구했다

§10.3 「범위 밖」은 기납부세액 **자동 파생**을 접었다. 근거는 「주식은 예정신고
산출세액(§107②)과 이력의 결정세액이 같다는 보장이 없다」였다. **그 판정은 유지되지만
결론은 뒤집혔다** — 보장이 없다는 것은 *자동값을 최종값으로 쓸 수 없다*는 뜻이지
*채워 주면 안 된다*는 뜻이 아니다. 사용자 요구는 「마지막 예정 신고서를 제외한 나머지
예정 신고서 산출세액 합계액으로 **자동 채워** 달라」였고, 값은 3단계에서 **편집 가능**하다.
⇒ 「참고값 자동 채움 + 편집 가능」으로 정정. 안내 문구(§10.3에서 「3단계에서 직접
적으라고 안내」)도 자동 채움을 설명하도록 바꿨다.

### Q-8 — 「마지막 제외」 모델링을 사용자 결정으로 확정

구현 중 제기한 우려를 그대로 올렸다: **§111③의 원칙은 「그 과세기간 예정신고 산출세액
*전부*」**다. 마지막을 빼는 것은 「편입한 이력 중 신고일이 가장 늦은 것이 곧 이번에 하는
신고」라는 **모델링**이고, 부동산 다건이 쓰는 규약과 같다. 마지막 종목까지 이미 예정신고를
마쳤다면 그 금액은 사용자가 더해야 한다.

| 선택지 | 결과 |
|---|---|
| **A. 마지막 제외** (채택) | 부동산과 같은 규약 · 아직 신고 안 한 건을 이중공제하지 않음 · 마지막도 신고했으면 **사용자가 가산** |
| B. 전부 합산 | §111③ 문언에 직접적 · 미신고분을 공제해 **과소납부** 위험 |

⇒ 사용자 결정 **A 유지**(「응 그대로 둬」). 자동값은 «참고»로 라벨링하고 편집 가능하게
둔 것이 이 선택의 안전장치다.

### 사용자 제약 — 「부동산은 건드리지 말고 주식만 수정해」

「가장 늦은 신고일 = 이번 신고분」 규약은 부동산이 이미 갖고 있다. 복제하면 dual truth고,
부동산 파일을 고치면 제약 위반이다. ⇒ 세목 중립 leaf `selectPriorFiledIndices(filingDates:
string[])`(`lib/calc/multi-prior-filed.ts`)를 **읽기 전용으로 import**했다. 부동산 경로는
**한 줄도 바뀌지 않았다**(`git diff --stat`에 해당 파일 0건).

### 구현 — 14 동기화 지점

신규 **필드는 없다**. PR-2가 심은 `preliminaryPaidTax`·`preliminaryPaidLocalTax`의
**값을 채우는 경로**만 추가됐으므로 ⑨~⑭는 PR-2 판정을 그대로 승계한다.

| 지점 | 파일 |
|---|---|
| 신규 leaf | `lib/calc/stock-prior-filed.ts` — `computeStockAutoPriorPaid()` |
| 편입(①) | `lib/calc/stock-aggregate-entry.ts` — `filingDateOf` · `paidTaxOf` · `filingPatch` |
| ⑤ | `app/calc/stock-transfer-tax/steps/Step3.tsx` — 「참고값」 caption |
| 안내 | `components/calc/stock-transfer/StockHistoryAggregateModal.tsx` — footnote |

**묶는 단위는 종목이 아니라 신고일이다.** §105①2호가 주식 예정신고 기한을 「양도일이 속하는
**반기**의 말일 + 2개월」로 정하므로 같은 반기 종목들은 한 신고서에 들어간다. 이력에 신고일이
없으면 `calcPreliminaryDeadline`으로 **법정 기한을 채워** 넣는다 — 비워 두면 그 종목이
필터에서 통째로 빠져 기납부가 **과소 집계**된다.

### 🔴 자동값만으로는 no-op 이었다 — `filingType: "final"`이 본체다

⑤ 입력란과 ④ 전송이 **둘 다** `filingType === "final"`을 요구한다. 이력 대부분은
`"preliminary"`이므로 값만 채우면 화면에도 안 뜨고 엔진에도 안 간다
(`feedback_api_trigger_without_input_path_is_noop`). ⇒ 편입이 2건 이상일 때
**확정신고로 전환**한다. 법적으로도 그 상태다 — 영 §173⑤3호(법 §110④ 단서): 주식등을
**2회 이상** 양도하고 §103②를 적용해 산출세액이 달라지면 **확정신고 의무**가 생기는데,
합산 진입 자체가 그 상황이다. 1건이면 요건을 못 채우므로 이력 값을 그대로 둔다(AP-8).

### 뮤테이션

| S-n | 무력화 | 실패한 anchor (실측) |
|---|---|---|
| S-1 | `selectPriorFiledIndices` 제외 규칙 → 전부 포함 | **7건** — AP-1·2·2a·3·4·6·7 |
| S-2 | `filingType: "final"` 제거 | AP-5 · **E2E SA-5·SA-6** |
| S-3 | `filingDateOf`의 법정기한 fallback → `""` | AP-6 |
| S-4 | `patched` 전 종목 → 마지막 종목에만 | AP-5·AP-7 |

무변경 기준선은 **10/10 통과**(실패 0)임을 같은 커맨드로 먼저 확인했다.

⚠️ **초판 기재 정정**: 이 표는 처음에 S-1을 「AP-1·AP-4 실패」로 적었다. 재실측하니
**7건**이었다 — 제외 규칙은 AP-2·2a(반기 묶음)·AP-3(신고서 1개)·AP-6·AP-7까지 함께
떠받치고 있었다. 추정으로 적었던 것을 실행으로 바로잡았다.

🔴 **S-2가 과녁을 둘로 나눈다.** vitest는 AP-5 **1건**만 실패하는데, 그 1건이 없었다면
「값은 채워졌으니 통과」로 초록이 됐을 것이다. 실제로 기능이 죽는 것은 E2E 2건이다 —
「vitest는 배선을 못 본다」의 **다섯 번째** 재현이다(P-7·Q-7·R-1에 이어).

### 검증

- anchor AP-1~AP-8 (10건) · E2E SA-1~SA-6 (6건) 전건 통과
- `npx tsc --noEmit` 0건 · `npm run lint` 0 error · `npx vitest run __tests__/` **21,612 passed**

### 범위 밖 (유지)

단건 이력 1개만으로 하는 §111③ 정산(합산이 아니면 확정신고 의무 요건을 못 채운다) ·
주식 수정신고·경정청구 진입점 · 부동산 ↔ 기타자산 크로스 통산.

---

## 부록 A — 재현 커맨드

```bash
# G-A·G-B 세액 실측 (본문 §2의 두 수치)
#   probe는 일회용이었다 — 재현하려면 __tests__/tax-engine/stock-transfer/
#   case-aggregate-multi-stock.test.ts의 stockInput 팩토리를 복사해
#   A(perShareTransferPrice 400000 / acquisition 100000)
#   B(100000 / 200000, transferDate 2024-09-01)로 두고
#   calculateStockTransferTax 2회 vs calculateStockTransferTaxAggregate 1회를 비교한다.

# M-2 안전망 재측정
#   StockTransferTaxCalculator.tsx:88 inputData에 { __MUTATED__: true, ... } 주입 후
npx vitest run __tests__/ > /tmp/m2.txt 2>&1; echo "EXIT=$?"; tail -8 /tmp/m2.txt
#   복원은 cp (git checkout 금지 — 작업 변경분이 날아간다)
```

## 부록 B — 관련 문서

- `docs/00-pm/stock-multi-asset-filing-loss-offset.plan.md` — §102② 통산 엔진(종결)
- `docs/00-pm/transfer-history-multi-aggregate-entry.plan.md` — 부동산 합산 진입점(정본)
- `docs/00-pm/business-key-property-identity.plan.md` — businessKey 충돌(부동산 축, PR #1646)
- `docs/00-pm/transfer-multi-prepaid-settlement-history-load.plan.md` — 부동산 §111③ 정산

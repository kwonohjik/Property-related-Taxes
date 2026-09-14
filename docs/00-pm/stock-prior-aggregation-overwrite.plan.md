# 과점주주 기신고 합산 — 「양도가액·취득가액·필요경비가 합산되지 않는다」 수정 계획

> **제보(2026-09-14)**: 기타자산(§94①4 다목)에서 기신고건을 선택하면 **기납부세액은 정상 공제**되는데
> **양도가액·취득가액·필요경비는 기신고분이 합산되지 않는다.**
>
> **기준 커밋**: `ebbfcb35` (= `origin/master`, PR #1625 머지 직후). 이 문서의 모든 `file:line`은
> 그 시점 기준이다 — 머지 후 재검토 시 전수 대조할 것([[feedback_merged_plan_citations_drift]]).
>
> **작업 브랜치**: `fix/stock-other-assets-transfer-tax` (워크트리 `.claude/worktrees/fix-stock-other-assets`)

---

## 0. 한 줄 요약

합산이 **「엔진 계산」이 아니라 「폼 칸 덮어쓰기」** 로 구현돼 있다. 당회차분과 기신고분이 **같은 입력칸을
공유**하므로 폼이 그 경계를 기억하지 못하고, 그래서 ⓐ 입력 순서 ⓑ 재적용 ⓒ 다음 회차 이력 재선택
**세 축 모두에서 조용히 틀린 값**이 된다. 제보는 그중 ⓐ다.

---

## 1. 제보 케이스 — 세액 영향 실측

제보 화면은 교재 『2026 양도·상속·증여세 이론 및 계산실무』 **사례 50**(pp.623~629)과 같은 사실관계다
(취득 2003-02-17 · 1차 양도 2023-06-20 30,000주 · 2차 양도 2026-02-20 40,000주 · 발행주식총수 100,000).

| 항목 | 정답(합산) | 제보 화면(미합산) | 차이 |
|---|---:|---:|---:|
| 07. 양도가액 ① | 2,100,000,000 | 1,500,000,000 | −600,000,000 |
| 11. 취득가액 ② | 1,050,000,000 | 600,000,000 | −450,000,000 |
| 14. 필요경비 ③ | 5,000,000 | 3,500,000 | −1,500,000 |
| 18. 양도차익 | 1,045,000,000 | 896,500,000 | |
| 22. 과세표준 | 1,042,500,000 | 894,000,000 | |
| 23. 세율 | **45%** (§55) | **42%** | 구간이 한 칸 내려앉았다 |
| 24-1. 산출세액(차감 전) | 403,185,000 | 339,540,000 | |
| 24-2. §168② 차감 | −29,200,000 | −29,200,000 | **여기만 정상** |
| 29. 결정세액 | 373,985,000 | 310,340,000 | **−63,645,000** |
| 30. 지방소득세 | 37,398,500 | 31,034,000 | **−6,364,500** |
| **31. 총 납부세액** | **411,383,500** | **341,374,000** | **−70,009,500 과소** |

> 🔴 **방향이 과소신고다.** 게다가 세율 구간까지 한 칸 내려가 차이가 단순 비례보다 크다.

---

## 2. 법령 근거 (원문 확보 — KoreanLaw MCP, 현행 시행 2026-07-01)

**소득세법 시행령 §158②** (요건 판정 축)

> 법 제94조제1항제4호다목은 과점주주가 주식등을 과점주주 외의 자에게 **여러 번에 걸쳐 양도하는
> 경우**로서 과점주주 중 1인이 주식등을 양도하는 날부터 **소급해 3년 내에 과점주주가 양도한 주식등을
> 합산해** 해당 법인의 주식등의 100분의 50 이상을 양도하는 경우에도 적용한다. 이 경우 … 그 합산하는
> 기간 중 **최초로 양도하는 날 현재**의 해당 법인의 주식등의 합계액 또는 자산총액을 기준으로 한다.

**소득세법 시행령 §168②** (이중과세 배제 축)

> 법 제104조제1항제1호를 적용할 때 법 제94조제1항제4호다목에 따른 주식등의 **양도소득산출세액에
> 대주주로서 납부하였거나 납부할 세액이 포함되어 있는 경우**에는 이를 차감하여 계산한 금액을
> 양도소득산출세액으로 한다.

⚠️ **인용 정확성 — 「합산」의 근거는 §158② «만»이 아니다.**
§158② 문언의 「합산」은 **다목 해당 여부(50% 이상) 판정**을 위한 것이다. 과세표준을 합산한다고 직접
쓰여 있지 않다. 과세표준 합산의 근거는 **§168②의 전제**다 — 「다목 산출세액에 대주주로서 납부한
세액이 **포함되어 있는**」 상태는 여러 회차를 **하나의 산출세액으로 묶었을 때만** 성립한다. 교재 사례
50도 그렇게 계산한다(403,185,000).

⇒ 코드 주석·UI 문구가 이 합산을 「영 §158② 재계산」이라고만 부르는 곳이 있다
(`lib/calc/stock-prior-transfer-lookup.ts:4`). **틀린 건 아니나 불완전**하므로 이번에 문구를
「§158② 요건 + §168② 전제」로 정정한다([[feedback_law_citation_must_name_statute_and_tier]]).

---

## 3. 실측 — 프로브 3본 (throwaway, 실행 후 삭제)

워크트리 격리 `E2E_PORT=3210`. 픽스처는 B-4와 동일(1차 이력: 양도 600,000,000 · 취득 450,000,000 ·
필요경비 1,500,000 · 산출세액 29,200,000 · `①3나_본문` · 30,000주).

### P-1 — 자연 순서(Step1 → Step2 → Step3)

```
=== 모달 직후 Step1 상태 ===
주식수: 70,000          누적양도비율: 70      기납부세액: 29,200,000
=== Step2 도착 시 «미리 채워진» 값 ===
양도가액합계: 600,000,000   /  1주당취득: 6,429
=== Step3 도착 시 «미리 채워진» 필요경비 === 1,500,000
=== 금액 3칸을 덮어쓴 뒤 배지 잔존 여부: 남아 있음(거짓 표시)
```

### P-2 — 우회 순서(당회차 먼저) + 모달 재적용

```
=== 1회차 합산 ===  (기선택 상태: false)
양도가액 2,100,000,000 / 1주당취득 15,000 / 필요경비 5,000,000 / 주식수 70,000 / 누적 70 / 기납부 29,200,000
=== 2회차 합산 (같은 건을 다시 확인) ===  (기선택 상태: true)
양도가액 2,700,000,000 / 1주당취득 15,000 / 필요경비 6,500,000 / 주식수 100,000 / 누적 100 / 기납부 29,200,000
```

### P-3 — 합산 결과의 이력 저장 형태

```json
{ "transferDate": "2026-02-20", "formShareCount": "70000", "formTransferTotal": "2100000000",
  "r_shareCount": 70000, "r_transferPrice": 2100000000, "r_acquisitionPrice": 1050000000,
  "r_expenses": 5000000, "r_calculatedTax": 373985000, "r_appliedSection94": "①4다" }
```

---

## 4. 결함 목록

| ID | 결함 | 근거 | 상태 |
|---|---|---|---|
| **D-1** | **순서 의존 — 기신고분이 덮어씌워져 사라진다** | P-1 | 🔴 실측 (제보 본체) |
| **D-2** | 1주당 취득가액 **희석** — 6,429원 | P-1 | 🔴 실측 |
| **D-3** | 배지 거짓 — 금액을 덮어써도 「반영됨」 잔존 | P-1 | 🔴 실측 |
| **D-4** | **재적용 이중합산** | P-2 | 🔴 실측 |
| **D-5** | 이력이 **총액**으로 저장 → 3차 양도에서 이중합산 | P-3 | 🔴 실측 |
| **D-6** | 로트 모드·환산 모드에서 취득가액 합산이 **통째로 무시** | 코드 추적 | 🟡 **미실측** |
| **D-7** | 모달이 `transferPriceMode`를 `actual`+`total`로 **강제 전환** | 코드 추적 | 🟡 **미실측** |
| **D-8** | `[StockFilingFormTable] 행 수 이상: 기대 33행, 실제 35행` | P-3 콘솔 | 🟡 **별건** |

### D-1 — 왜 순서가 문제인가 (기계적 원인)

마법사 단계는 `StockTransferTaxCalculator.tsx:37`이 정한다:

```
Step1 자산·시장·대주주 → Step2 양도·취득가액 → Step3 필요경비·신고 → Step4 결과
```

그런데 **기신고 불러오기 런처는 Step1**에 있고(`OtherAssetBlock.tsx:335` 모달 · `:322` 런처),
합산이 채우는 칸 중 **3개는 Step2·Step3**에 있다:

| 칸 | 위치 | 합산이 쓰는 지점 |
|---|---|---|
| 양도 주식수 · 누적비율 · 최초양도일 · 기납부세액 | **Step1** | `OtherAssetBlock.tsx:153~171` |
| 양도가액 합계 `transferTotalPrice` | **Step2** (`Step2.tsx:173`) | 동 `:158` |
| 1주당 취득가액 `perShareAcquisitionPrice` | **Step2** (`Step2.tsx:268`) | 동 `:160` |
| 필요경비 합계 `actualExpenses` | **Step3** (`Step3.tsx:222`) | 동 `:161` |

`applyAggregation`(`OtherAssetBlock.tsx:129~181`)은 **당회차 값을 폼에서 읽어 더한** 뒤 같은 칸에
되쓴다. 자연 순서에서는 그 시점 Step2·Step3가 **비어 있으므로** `curTransfer = 0`·`curAcq = 0`·
`curExpenses = 0`이고, 결과적으로 **기신고분만** 들어간다. 이후 사용자가 Step2·Step3에서 당회차 값을
입력하면 그 칸이 **평범한 `onChange`로 덮어써진다** — 기신고분은 아무 흔적 없이 사라진다.

> 🔑 **기납부세액만 살아남는 이유**: 그 칸은 **Step1에 있어** 이후 단계에서 다시 건드릴 일이 없다.
> 제보의 「기납부세액은 정상인데 3칸만 안 된다」가 정확히 이 구조의 지문이다.

> ⭐ **E2E B-4는 이 결함을 «우회»해서 초록이다.**
> `e2e/stock-block-shareholder-94-1-4-da.spec.ts:343~349`이 `jumpToStep`으로 **Step2·Step3를 먼저
> 채운 뒤 Step1로 되돌아가** 모달을 연다. 주석까지 달려 있다 —
> 「당회차 금액을 먼저 채운다 — 합산은 «기신고 + 당회차»다」.
> **테스트가 결함을 지킨 사례**다([[feedback_fixture_default_masks_gate_defect]] 계열).
> ⇒ 수정과 **함께** B-4를 자연 순서로 바꾸지 않으면 회귀가 다시 숨는다.

### D-2 — 1주당 취득가액 희석

`OtherAssetBlock.tsx:160`

```ts
perShareAcquisitionPrice: totalShares > 0 ? String(Math.round(totalAcq / totalShares)) : "",
```

`totalShares`는 **기신고 + 당회차**(70,000)인데 당회차 취득가액이 비어 있으면 `totalAcq`는
**기신고분만**(450,000,000) → `6,429`. 취득가액이 구조적으로 **축소**된다(= 세액 과대).
D-1과 반대 방향이라 **서로 상쇄되지 않는다** — 두 결함이 각각 다른 칸을 망가뜨린다.

### D-3 — 배지가 거짓말한다

`OtherAssetBlock.tsx:83~90`의 `AGGREGATION_FILLED_KEYS`는 **3개뿐**이다:

```ts
["cumulativeTransferRatio", "aggregationFirstTransferDate", "priorMajorShareholderTax"]
```

합산이 실제로 채우는 칸은 **7개**(위 3개 + `shareCount`·`transferTotalPrice`·
`perShareAcquisitionPrice`·`actualExpenses`). 빠진 4개를 고쳐도 배지가 안 지워진다.
게다가 그 4개 중 3개는 **다른 컴포넌트(Step2·Step3)** 라 `onChangeResettingBadge` 경로 자체가 없다.

⇒ 화면은 「기신고 1건 반영됨」이라 말하는데 금액에는 반영돼 있지 않다. **틀린 값을 맞다고 보증한다.**

### D-4 — 재적용 이중합산

`BlockShareholderPriorTransferModal.tsx:94~99`이 `filterPriorStockTransferCandidates`를 부르면서
`excludeIds`를 **넘기지 않는다**(타입에는 있다 — `stock-prior-transfer-lookup.ts:103`). 그리고
`:106`이 기선택 건을 **미리 체크**한다. 그 상태로 확인을 누르면 `applyAggregation`이 **이미 합산된
폼 값**에 같은 건을 또 더한다(P-2: 2,100,000,000 → 2,700,000,000).

한편 기납부세액만은 **치환**이라(`:163` `String(agg.priorMajorShareholderTax)`) 이중이 되지 않는다.
**5값 중 4개는 누적, 1개는 치환** — 이 비대칭이 D-4의 직접 원인이다.

### D-5 — 이력이 총액으로 저장된다

P-3이 보여주듯 저장된 `resultData.transferPrice`는 **2,100,000,000(합산 총액)** 이다.
3차 양도에서 이 건을 기신고로 고르면 **1차분 600,000,000이 두 번** 들어간다.
`stock-prior-transfer-lookup.ts:250·270`이 `num(result.transferPrice)`를 그대로 읽기 때문이다.

> ⚠️ 기납부세액 축에도 같은 층의 함정이 있다. 저장된 `calculatedTax`는 **§168② 차감 «후»**
> (373,985,000)다. 3차에서 1·2차를 **둘 다** 고르면 29,200,000 + 373,985,000 = 403,185,000으로
> 우연히 맞지만, **2차만 고르면 1차분 29,200,000을 놓친다**. 이건 사용자 선택 축이므로
> **모달 문구로 안내**한다(§7 참조).

### D-6·D-7 — 🟡 미실측 (착수 전 확인)

- **D-6**: 엔진 STEP 3(`stock-transfer-tax.ts:220`)은 로트 모드면 `lotMatchingDetail`,
  환산 모드면 `resolveAcquisitionBasis`가 값을 정한다. 두 경로 모두 `perShareAcquisitionPrice`를
  읽지 않으므로 모달이 그 칸에 써넣은 합산 취득가액이 **통째로 무시**될 것으로 보인다.
- **D-7**: `OtherAssetBlock.tsx:156~157`이 `transferPriceMode: "actual"` + `transferActualInputMode:
  "total"`을 **무조건** 써넣는다. 교환(`exchange`)·매매사례가액 모드였다면 **조용히 전환**된다.

⇒ **Do 진입 전에 프로브로 확정한다**([[feedback_pre_anchor_verification]]). 안 A를 택하면 둘 다
구조적으로 해소되지만, **「해소됐다」를 주장하려면 «전» 상태를 먼저 재야 한다**
([[feedback_pre_change_safety_net_probe]]).

---

## 5. 근본 원인

> **당회차분과 기신고분이 «같은 입력칸»을 공유한다.**

폼은 「이 2,100,000,000 중 어디까지가 기신고분인가」를 **기억할 수단이 없다**. 그래서

- 순서를 바꾸면 경계가 사라지고(D-1),
- 다시 적용하면 경계가 없으니 또 더하고(D-4),
- 결과를 저장하면 총액만 남아 다음 회차가 또 더한다(D-5).

**세 증상이 하나의 뿌리에서 나온다.** 배치를 옮기거나 배지를 고치는 것으로는 D-4·D-5를 못 막는다.

---

## 6. 해결안 비교

### 안 A — 기신고분을 «별도 축»으로 분리하고 **엔진이 합산한다** ✅ 권고

기신고 합산분을 당회차 칸과 **다른 필드**에 담고, 엔진 STEP 4 직후에 더한다.
증여세 **사전증여 §47 합산**(`prior-gift-lookup.ts`)과 같은 형태 — 그쪽은 사전증여를 별도 축으로
두고 엔진이 합산한다. 이 파일 헤더(`stock-prior-transfer-lookup.ts:8~16`)가 스스로 그 선례를
인용하면서 **정작 구현만 폼 덮어쓰기**로 갈라져 있다.

| 결함 | 안 A에서 어떻게 사라지는가 |
|---|---|
| D-1 | 모달이 당회차 칸을 **건드리지 않는다** → 덮어쓸 것이 없다. 순서 무관 |
| D-2 | 주당 환산을 **하지 않는다**(총액으로 엔진에 전달) → 반올림·희석 소멸 |
| D-3 | 배지가 **prior 칸 전용**이 되어 당회차 편집과 무관해진다 |
| D-4 | prior 칸을 **치환**(누적 아님) → 몇 번 눌러도 같은 값 |
| D-5 | 결과에 **당회차분 echo**를 신설 → lookup이 그걸 읽는다 |
| D-6 | 엔진이 STEP 3 **결과에** 더하므로 로트·환산 모드 자동 지원 |
| D-7 | `transferPriceMode`를 건드릴 이유 자체가 사라진다 |

**비용**: 14 동기화 지점 전부 + 엔진 + 결과뷰 + 신고서 서식.

### 안 C — 배치·배지·재적용만 수선 (최소 변경)

런처를 Step3로 옮기고 · `AGGREGATION_FILLED_KEYS`를 7개로 넓히고 · 재적용 시 치환으로 바꾼다.

- 해소: D-1(부분) · D-3 · D-4
- **미해소**: **D-5**(이력 이중합산) · **D-6** · **D-7**, 그리고 사용자가 나중에 Step2로 돌아가
  양도가액을 고치면 **D-1이 그대로 재발**한다(배지는 지워지지만 값은 이미 틀렸다).

### 판단

**안 A를 권고한다.** 근거 셋:

1. D-4·D-5는 「칸 공유」에서 직접 나오므로 **안 C로는 구조적으로 못 막는다**.
2. 이 축은 **세액이 70,009,500 갈린 실적**이 있다. 침묵 오류를 남길 자리가 아니다.
3. ⑦ 결과·신고서가 「합계 = 기신고분 + 당회차분」을 보여줘야 사용자가 **검산**할 수 있다. 지금은
   합계만 보이고 근거가 없다.

> ⚖️ **반대 논거도 적어 둔다**: 안 A는 14지점을 전부 건드리는 **큰 변경**이고, 주식양도세는 다건
> 신고·국외주식·비과세 등 조립 지점이 여럿이라 회귀 면이 넓다. **Simplicity First 원칙과 긴장 관계**에
> 있다. 사용자가 규모를 줄이고 싶다면 **안 C를 먼저 내고 D-5·D-6·D-7을 별건으로 남기는 선택**도
> 합리적이다 — 다만 그때는 **미해소 3건을 계획서에 명시적으로 남겨야** 한다
> ([[feedback_open_item_wording_is_also_unverified]]).

**Q-1 (사용자 결정 필요)**: 안 A(정본 수정) / 안 C(최소 수정 + 별건 이월) 중 어느 쪽으로 갑니까?
아래 §7~§9는 **안 A 기준**으로 작성했다.

---

## 7. 안 A 설계

### 7-1. 신규 폼 필드 (① 폼 상태)

`lib/stores/calc-wizard-stock-form-types.ts` — `priorMajorShareholderTax:142` 바로 아래에 나란히.

| 필드 | 단위 | 의미 |
|---|---|---|
| `priorTransferPrice` | 문자열(원) | 기신고분 양도가액 합계 |
| `priorAcquisitionPrice` | 문자열(원) | 기신고분 취득가액 합계 |
| `priorExpenses` | 문자열(원) | 기신고분 필요경비 합계 |
| `priorShareCount` | 문자열(주) | 기신고분 주식수 합계 (누적 양도비율 분자) |

⚠️ **`shareCount`(당회차)는 건드리지 않는다.** 지금은 모달이 여기에 총합을 써넣어 **양도가액
= 주당단가 × 주식수** 계산까지 오염시킨다. 분리하면 당회차 단가 계산이 정상화된다.

### 7-2. 엔진 (Layer 2)

`lib/tax-engine/stock-transfer/stock-transfer-tax.ts` — **STEP 4 직후 · STEP 5 직전**에 seam 하나.

```
STEP 2 양도가액 → STEP 3 취득가액 → STEP 4 필요경비
  ↓  ★ NEW: §158②/§168② 기신고 합산 seam
STEP 5 양도소득금액 → STEP 6 기본공제 → …
```

- 합산은 **`①4다`로 분류되고 비과세가 아닐 때만** 적용한다 — `§168②` 차감 게이트
  (`stock-transfer-tax.ts:461` `isClause168_2Applicable`)와 **같은 술어를 공유**한다.
  손으로 다시 쓰면 두 축이 갈린다([[feedback_shared_predicate_argument_parity]]).
- 🔴 **환산취득가액·개산공제보다 «뒤»에 둔다.** 환산은 당회차 양도가액 × (취득기준시가/양도기준시가)
  이고, 기신고분은 그 회차에서 이미 자기 방식으로 산정된 값이다. 앞에 두면 기신고분까지 환산에
  말려든다.
- 🔴 **`shareCount`는 합산하지 않는다.** 단가 × 주식수 계산이 이미 STEP 2에서 끝났다.
  `priorShareCount`는 **누적 양도비율 표시·검증 축**으로만 쓴다.

### 7-3. 결과 타입 (⑦ echo)

`types/stock-transfer.types.ts` — `transferPrice`·`acquisitionPrice`·`expenses`는 **합산 후 총액**을
유지한다(신고서 07·11·14행과 하류 전부가 자동 추종). 그 옆에 **당회차분**을 신설한다.

| 필드 | 필수/선택 | 이유 |
|---|---|---|
| `ownTransferPrice` · `ownAcquisitionPrice` · `ownExpenses` | **필수** | PR #1623의 `shareCount`와 같은 판단 — **필수여야 조립 지점 누락을 컴파일러가 잡는다**. 조립 3지점(본체 · `stock-transfer-exempt-result.ts:105` · `foreign-stock-aggregate-adapter.ts:98·148`) |
| `priorAggregation?: { transferPrice, acquisitionPrice, expenses, shareCount, sourceCount }` | 선택 | 합산이 실제로 일어났을 때만. `clause168_2Credit` echo와 같은 규약 |

⇒ `stock-prior-transfer-lookup.ts`의 후보 추출은 **`ownTransferPrice` 우선 → 없으면 `transferPrice`**
2단 소스로 읽는다(구 이력 호환). **D-5 해소.**

### 7-4. 모달·블록 (⑤)

- `applyAggregation`은 **prior 4칸 + 기납부세액 + 최초양도일 + 누적비율 + sourceIds만** 쓴다.
  당회차 칸(`shareCount`·`transferTotalPrice`·`perShareAcquisitionPrice`·`actualExpenses`)과
  `transferPriceMode`는 **손대지 않는다**.
- **전부 치환**(누적 아님) → D-4 해소. `excludeIds`도 함께 넘겨 후보에서 중복 제시를 막는다.
- `AGGREGATION_FILLED_KEYS`를 **prior 4칸 + 기존 3칸 = 7칸**으로 확장.
  모두 Step1 안이라 배지 리셋 경로가 성립한다 → D-3 해소.
- prior 칸은 **화면에 표시한다**(읽기 전용 요약 + 「직접 입력」 토글). 이력이 없는 사용자는 손으로
  넣어야 하므로 입력 경로를 반드시 남긴다([[feedback_ui_gate_removes_sole_input_path]]).
- 모달 안내 문구에 **§168② 선택 주의**를 넣는다(§4 D-5 말미) — 「합산기간 중 앞선 회차를 «빠짐없이»
  고르세요. 하나만 고르면 그 이전 회차의 기납부세액이 빠집니다.」

### 7-5. 14 동기화 지점

`priorMajorShareholderTax`가 이미 14지점을 **온전히** 타고 있다. 그 배선을 그대로 복제한다.

| 지점 | 파일:line (기준 `ebbfcb35`) |
|---|---|
| ① 폼 상태 | `calc-wizard-stock-form-types.ts:142` |
| ② initial | `calc-wizard-stock-form.ts:95` |
| ③ normalize | `calc-wizard-stock-normalize.ts:167` |
| ④ API 변환 | `stock-transfer-tax-api.ts:196~197` |
| ⑤ UI 위젯 | `OtherAssetBlock.tsx:322`(런처) · `:347~`(§168② 카드) |
| ⑥ 사이드바 | `StockSidebar.tsx` — 합계에 기신고분 반영 여부 **판단 필요** |
| ⑦ 결과 카드 | `StockTransferTaxResultView.tsx` + `StockFilingFormTableHelpers.ts:277·326·384` |
| ⑧ validation | `stock-transfer-tax-validate.ts:512~529·567` |
| ⑫ Zod | `stock-transfer-tax-schema.ts:260` |
| ⑬ body spread | `stock-transfer-tax-api.ts` (④와 같은 파일) |
| ⑭ Route 매핑 | `stock-transfer-engine-input.ts:73` |

⑨⑩⑪은 enum·컴패니언 축이라 이번 변경과 무관(신규 enum 없음) — **grep으로 자가 확인**한다.

### 7-6. 신고서 서식 (⑦)

07·11·14행은 **합산 총액 유지**(국세청 서식은 합산 총액을 적는다). 그 **바로 아래 들여쓰기 부기행**을
조건부로 추가한다 — `08~10`(교환 내역)·`12-1/12-2`(환산 분자·분모)가 이미 쓰는 패턴 그대로.

```
07. 양도가액 (①)                        2,100,000,000
  07-1.  기신고분 합산 (영 §158②·§168②)    600,000,000
  07-2.  당회차분                        1,500,000,000
11. 취득가액 (②)                        1,050,000,000
  11-1.  기신고분 합산                      450,000,000
  11-2.  당회차분                          600,000,000
14. 필요경비 합계 (③)                       5,000,000
  14-1.  기신고분 합산                        1,500,000
  14-2.  당회차분                            3,500,000
```

⚠️ **부기행 값은 엔진 echo에서 읽는다 — 화면에서 다시 빼서 만들지 않는다**
([[feedback_aggregate_display_rederives_engine_value]]).
⚠️ 행 수가 늘어나므로 `StockFilingFormTableHelpers.ts:750`의 **행 수 가드 기대값**을 함께 갱신한다.
**D-8(기대 33 / 실제 35)도 이때 함께 재판정**한다 — 지금 이미 어긋나 있다.

---

## 8. 안전망 (Pre-Do anchor 우선)

### 8-1. Pre-Do — 먼저 쓰고 **실패를 확인**한다

| ID | 무엇을 고정하는가 | 층 |
|---|---|---|
| **PA-0** | **D-6·D-7 «전» 상태 측정** — 로트 모드·교환 모드에서 현행 합산이 어떻게 깨지는가 | E2E 프로브 |
| **PA-1** | 엔진: `prior*` 4값 → 양도차익 1,045,000,000 · 산출 403,185,000 · §168② 후 373,985,000 | vitest |
| **PA-2** | 엔진: `prior*`가 0이면 현행과 **원 단위까지 동일**(회귀 0) | vitest |
| **PA-3** | 결과 echo `ownTransferPrice`가 **당회차분**(1,500,000,000)이다 | vitest |

### 8-2. 본 anchor

| ID | 내용 | 층 |
|---|---|---|
| A-1 | `①4다`가 아니면(라목·`①3나`) 합산이 **적용되지 않는다** — §168② 게이트와 같은 술어 | vitest |
| A-2 | 비과세 분기에서 합산 미적용 | vitest |
| A-3 | 환산취득가 모드 + prior → 환산은 **당회차 양도가액만**으로 계산된다 | vitest |
| A-4 | 로트 모드 + prior → 취득가액이 **lot 합계 + prior** (D-6 해소) | vitest |
| A-5 | lookup이 `ownTransferPrice`를 1순위로 읽는다 / 없으면 `transferPrice` fallback | vitest |
| **A-6** | **A-5의 fallback이 1순위 anchor의 구별력을 먹지 않도록 1a/1b/1c 분할** | vitest |
| A-7 | ⑧ validate: prior 4칸이 음수·비수치면 차단 | vitest |
| A-8 | 신고서 부기행 6행 + 행 수 가드 갱신 | vitest |

### 8-3. E2E (⑫⑬⑭·순서 축은 브라우저만 증명한다)

| ID | 내용 |
|---|---|
| **B-4′** | **B-4를 «자연 순서»로 되돌린다** — `jumpToStep` 우회 제거. Step1에서 합산 → Step2·Step3에 당회차 입력 → **373,985,000**. 이게 제보의 정본 회귀 테스트다 |
| B-7 | **재적용 멱등** — 모달을 두 번 확인해도 값이 변하지 않는다 (D-4) |
| B-8 | 당회차 금액을 고쳐도 **기신고분이 살아 있다** (D-1 근본) |
| B-9 | 합산 계산 결과를 이력에 저장 → 3차 계산에서 후보로 뜰 때 **당회차분**이 보인다 (D-5) |
| B-10 | 배지: prior 칸을 고치면 사라지고, **당회차 칸을 고치면 남는다**(역방향도 단언) |

> ⚠️ B-4를 자연 순서로 바꾸는 것은 **선택이 아니라 필수**다. 지금 형태를 남기면 이 결함이
> 다시 숨는다.

### 8-4. 뮤테이션 (안전망을 실측한다)

| ID | 뒤집을 것 | 기대 |
|---|---|---|
| M-1 | 엔진 seam의 `+ priorTransferPrice` 제거 | PA-1 · B-4′ 실패 |
| M-2 | 합산 게이트를 `①4다` → 무조건 적용 | A-1 실패 |
| M-3 | 모달을 **누적**으로 되돌림 | B-7 실패 |
| M-4 | `ownTransferPrice` echo를 `transferPrice`로 바꿔치기 | PA-3 · A-5(1a) 실패 |
| M-5 | seam을 STEP 3 **앞**으로 이동 | A-3 실패 |

> 🔴 **M-4가 A-5 fallback에 먹히는지 반드시 본다** — PR #1623에서 정확히 그 일이 있었다
> ([[feedback_new_guard_absorbs_sibling_anchor_discriminance]]).

> ⚠️ 뮤테이션 프로브에서 `git checkout`으로 되돌리지 말 것 — 커밋 안 된 작업이 날아간다
> ([[feedback_mutation_probe_git_checkout_destroys_wip]]).

---

## 9. 실행 순서

```
0. Q-1 사용자 결정 (안 A / 안 C)                  → verify: 답변 확보
1. PA-0 프로브 — D-6·D-7 «전» 상태 측정           → verify: 깨짐 방식을 수치로 기록
2. PA-1~PA-3 작성 (실패 확인)                     → verify: 기대 메시지로 실패
3. 엔진 seam + 결과 echo 필수화                   → verify: PA-1~3 통과 · tsc 0건
4. ①②③⑧⑫⑬⑭ 배선                                → verify: 14지점 grep 자가점검
5. ⑤ 모달·블록 (치환·excludeIds·배지 7칸)         → verify: B-7 · B-10
6. ⑥⑦ 사이드바·결과뷰·신고서 부기행 + 행 수 가드   → verify: A-8 · D-8 재판정
7. B-4′ 자연 순서 전환 + B-8·B-9                  → verify: E2E 전건
8. 뮤테이션 M-1~M-5                               → verify: 전건 실패(= 안전망 유효)
9. npm run check:pre-pr                           → verify: typecheck·lint·test 전건
10. 브라우저 수동 확인                             → verify: Network 탭 request body에 prior* 4칸
```

---

## 10. 파일 크기 (800줄 정책)

| 파일 | 현재 | 판단 |
|---|---:|---|
| `stock-transfer.types.ts` | 1,289 | **타입 전용 예외** — 분리 가치 낮음 |
| `stock-transfer-tax-validate.ts` | 770 | 🟠 **위험구간(≥750)** — 이번에 열므로 **기회주의적 분리** 검토 |
| `StockFilingFormTableHelpers.ts` | 757 | 🟠 **위험구간** + 부기 6행 추가 예정 → **800 초과 확실** ⇒ **분리 필수** |
| `stock-transfer-tax.ts` | 630 | seam 추가해도 여유 |
| `stock-transfer-tax-api.ts` | 666 | 여유 |
| `OtherAssetBlock.tsx` | 450 | 여유 |

⇒ `StockFilingFormTableHelpers.ts`는 **자연 이음매(섹션 [A]기본 / [B]양도가액 / [C]취득가액 …)** 로
분할하고 ≤700 착지를 목표로 한다([[feedback_800line_split_playbook]]).

---

## 11. 미결·확인 필요 (추정 금지 — 착수 전 실측)

| ID | 항목 | 왜 미결인가 |
|---|---|---|
| **Q-1** | 안 A / 안 C | **사용자 결정**. §6 참조 |
| **V-1** | D-6 (로트·환산 모드 취득가액 무시) | 코드 추적만 — **PA-0에서 실측** |
| **V-2** | D-7 (`transferPriceMode` 강제 전환) | 코드 추적만 — **PA-0에서 실측** |
| **V-3** | ⑥ 사이드바가 기신고분을 합계에 넣어야 하는가 | 「계산 가능한 항목만」 규약과의 정합 미판정 |
| **V-4** | D-8 신고서 행 수 33 vs 35 | **이미 어긋나 있다**. 원인 미규명 — 별건일 수 있다 |
| **V-5** | 다건 신고(여러 종목)에서 prior 축이 **종목-수준**으로 맞는가 | `blockShareholderSourceIds`가 종목 폼에 있으므로 종목-수준으로 보이나 **미확인** |
| **V-6** | 국외주식(`foreign-stock.ts:384`)·비과세 조립 지점의 echo 필수화 파급 | `tsc`로 실측(PR #1623은 3곳이었다) |

> ⚠️ **미결 항목의 「서술」도 미검증 자산이다** — 위 표현이 실제보다 항목을 크게/작게 보이게 할 수
> 있다([[feedback_open_item_wording_is_also_unverified]]).

---

## 12. 참고

- 선행 계획서: `docs/00-pm/stock-block-shareholder-94-1-4-da.plan.md` (다목 게이트·§168② 도입)
- 선행 계획서: `docs/00-pm/stock-prior-filing-lookup-sharecount-gap.plan.md` (PR #1623 — 후보 0건 결함)
- 선례: `lib/calc/prior-gift-lookup.ts` (증여세 사전증여 §47 — **별도 축 + 엔진 합산**)
- 교재: 『2026 양도·상속·증여세 이론 및 계산실무』 사례 50 (pp.623~629)

---

# ✅ 구현 완료 (2026-09-14 · 안 A)

**Q-1 사용자 결정: 안 A.** 아래는 실제로 한 일과 **계획과 달라진 지점**이다.

## 13. 미결 6건 — 전건 종결

| ID | 결론 |
|---|---|
| **Q-1** | ✅ 안 A |
| **V-1** | ✅ **D-6 실측 확정** (PA-0). `perShareAcquisitionPrice` 를 15,000 → 26,250 으로 키웠을 때 — actual **600,000,000 → 1,050,000,000**(따라옴·대조군) / **로트 600,000,000 → 600,000,000**(무시) / **환산 300,000,000 → 300,000,000**(무시). 안 A 로 구조적 해소 |
| **V-2** | ✅ D-7 확정 — `Step2.tsx:98~106` 에 `exchange` 라디오가 **무조건** 있고 종전 `applyAggregation` 이 `transferPriceMode: "actual"` 를 **조건 없이** 썼다. 이제 모달이 그 키를 **건드리지 않는다** |
| **V-3** | ✅ 결정 — 사이드바는 **결과 도착 후 엔진 값**을 쓴다. 겸사 **잠재 모순 1건 해소**: 종전에는 양도가액만 폼 파생이고 취득가액·필요경비는 결과 파생이라, 합산이 붙는 순간 표가 스스로 어긋날 상태였다 |
| **V-4** | ✅ **D-8 원인 규명 + 수정** — `clause168_2Credit` 이 24-1·24-2 **두 행**을 조건부로 넣는데 `expectedRows` 식에 항이 없었다. 별건이 아니라 **같은 계열의 재발**이었다(파일 주석이 2026-08-27 에 한 번 정정한 그 자리) |
| **V-5** | ✅ 종목-수준 확인 — `prior*` 를 `blockShareholderSourceIds` 와 **같은 종목 폼**에 뒀고, 신고서 aggregate 경로도 `items` 별 `priorAggregation` 합으로 구현 |
| **V-6** | ✅ echo 필수화 파급 **4곳**(예상 3곳) — `stock-transfer-exempt-result.ts:107·113·128` · `foreign-stock-aggregate-adapter.ts` · **`StockTransferTaxResultViewHelpers.tsx` 의 `Record<AppliedRule, string>` 라벨맵**. 마지막 한 곳은 `appliedRules` union 에 `§158②기신고합산` 을 더하자 컴파일러가 잡았다 — **`Record` 키 커버리지 가드가 실제로 작동했다** |

## 14. 계획과 달라진 것

| # | 계획 | 실제 | 왜 |
|---|---|---|---|
| 1 | 모달에 `excludeIds` 를 넘긴다 | **넘기지 않았다** | 적용이 **치환**이 되면서 재적용이 이미 멱등이다. `excludeIds` 를 넘기면 **이미 고른 건이 목록에서 사라져** 선택을 해제할 방법이 없어진다 — 넘기는 쪽이 오히려 기능을 깬다 |
| 2 | 신고서 부기 6행 | 그대로 | 07-1/07-2 · 11-1/11-2 · 14-1/14-2, **조건부**(합산 있을 때만) |
| 3 | `StockTransferTaxResultView.tsx` 분리 검토 | **하지 않았다** | 774줄 — **트리거(800) 미달**. 「700~749 에 안정적으로 앉은 파일을 미리 쪼개지 말 것」의 취지에 따라 남긴다 |

## 15. 계획에 없던 발견 — 표시층 2건

1. 🔴 **`TransferPriceFormulaCard` 의 등식이 거짓이 될 뻔했다.** 「1주당 양도가액 × 주식수 = `result.transferPrice`」인데 `transferPrice` 가 합산 총액이 되면 **37,500 × 40,000 = 2,100,000,000** 이라 화면에 적힌다. `ownTransferPrice` 로 등식을 맺고 합산분은 **더하는 줄**로 따로 뒀다.
2. 🔴 **사이드바가 스스로 모순될 상태였다** (V-3) — 위 표 참조.

> 두 건 다 **엔진만 고치고 표시층을 안 봤으면 초록인 채로 틀린 화면**이 됐다
> ([[feedback_fixed_layer_vs_consumed_layer]]).

## 16. 안전망 실측 — 뮤테이션 5건

| M | 뒤집은 것 | 죽은 anchor |
|---|---|---|
| M-1 | seam 의 `+ priorTransferPrice` 제거 | vitest **3**(PA-1·PA-1b·PA-3) + E2E **2**(B-4·B-8) |
| M-2 | 합산 게이트를 `true` 로 | vitest **3**(A-1a·A-1b·A-1c) |
| M-3 | 모달을 **누적**으로 되돌림 | E2E **1**(B-7) — 600,000,000 → **1,200,000,000** |
| M-4 | `ownTransferPrice` 를 총액으로 | vitest **1**(PA-3) + E2E **1**(B-9) |
| M-5 | seam 을 STEP 3 **앞**으로 | vitest **2**(A-3·A-8) |

### 🔴 M-2 는 A-2(비과세)를 **죽이지 못한다** — 구별력 0을 기록해 둔다

합산 술어는 `appliedSection94 === "①4다" && !isExempt` 인데, K-OTC 비과세는
`buildExemptResult` **조기 반환** 경로라 seam 에 **도달조차 하지 않는다**. 즉 `!isExempt`
항이 막는 문은 이 경로로는 **열어 봐도 잠겨 있다** — 그 항이 안전을 만든다고 적으면
거짓 기록이 된다([[feedback_safety_attribution_in_compound_gate]] ·
[[feedback_early_return_branch_skips_pipeline_stages]]).
⇒ A-2 는 「합산 안 함」이 아니라 **비과세 조립 지점이 `own*` 을 빠뜨리지 않았는가**를 지킨다.
anchor 본문에 그 취지를 적어 뒀다.

### 🔴 첫 M-3 은 **no-op 뮤테이션**이었다 — 통과를 「안전」으로 읽을 뻔했다

`priorTransferPrice: String(cur(form.priorTransferPrice) + agg.priorTransferPrice)` 로만
바꿨더니 **B-7 이 통과**했다. `applyAggregation` 의 `useCallback` deps 에
`form.priorTransferPrice` 가 없어 **stale closure 가 항상 0** 이었기 때문이다 — 뮤테이션이
행동을 바꾸지 못한 것이지 anchor 가 지킨 것이 아니다. deps 까지 되돌린 **충실한 뮤테이션**을
넣자 B-7 이 죽었다([[feedback_mutation_zero_discrimination_is_not_proof]]).

## 17. 검증 결과

| 게이트 | 결과 |
|---|---|
| `npx tsc --noEmit` | **0건** |
| `npm run lint` | **0 error** (warning 341건 — 전부 기존) |
| `npm test` (전건) | **2,029 파일 · 21,296 통과 · 0 실패** |
| E2E 전건 | **1,177 통과 · 0 실패** (6.9분) |
| E2E 주식 도메인 | 79 통과 |
| ⑬ 요청 본문 실측 | `priorTransferPrice`·`priorAcquisitionPrice`·`priorExpenses`·`priorShareCount`·`priorAggregationSourceCount` **5키 모두 도달** (프로브로 POST body 확인 — 침묵 strip 없음) |

**브라우저 확인**: Playwright E2E 로 수행했다(B-4 자연 순서 · B-7 멱등 · B-8 사후 수정 ·
B-9 이력 재선택 · B-10 배지) — 이 저장소의 정본 수단이다([[feedback_browser_verify_with_playwright]]).

## 18. 파일 크기

| 파일 | 전 | 후 |
|---|---:|---:|
| `StockFilingFormTableHelpers.ts` | 840 (🔴 초과) | **549** |
| `StockFilingFormAssetCostRows.ts` (신규) | — | **351** |
| `StockTransferTaxResultView.tsx` | 727 | 774 (트리거 미달 — 유지) |
| `stock-transfer.types.ts` | 1,289 | 1,359 (**타입 전용 예외**) |

## 19. 남은 것 — 별건

- 🟡 **`CurrencyInput` 은 프로그램적 `fill()` 재입력에서 값이 «이어 붙는다»** (실측:
  `999,999,999` 에 `fill("1500000000")` → `9,999,999,991,500,000,000`, 그 사이에 `fill("")`
  를 넣어도 같다). 원인은 `handleFocus` 의 `setLocalRaw` 리렌더가 Playwright 이 잡아 둔
  선택 영역을 접기 때문으로 보인다. **실사용자는 `SelectOnFocusProvider` 의 RAF 전체선택이
  리렌더 뒤에 걸려 덮어쓰기가 된다** — 그래서 제품 결함으로 보지 않았고, E2E 헬퍼
  `retypeStep2`(클릭 → 전체선택 → 타이핑)로 **실사용자 경로**를 쓰도록 했다.
  ⚠️ **「실사용자는 괜찮다」는 추론이지 실측이 아니다** — 별도로 재볼 가치가 있다.

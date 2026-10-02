# 주식 양도세 매매사례가액 — ① 양도측 우선 적용 제거 · ② 취득 매매사례 개산공제 배선

> 작성 2026-10-02 · 세목: 주식 양도소득세(비상장) · 상태: **Do 착수 (Q-1=A 확정 · Q-2 = Do 1단계 확인 → 아래 §3·§7)**
> 제보: Step 2 「② 양도 매매사례가액 (선택)」 안내 「입력 시 1주당 양도가액 대신 우선 적용됩니다」(이미지 18) /
> Step 3 「개산공제 자동 적용 — 취득가액 방식 "매매사례가액"」(이미지 19)인데 기준시가 입력 화면이 없음.

---

## 0. 결론 요약

| # | 제보 | 판정 | 세액 영향(실측) |
|---|---|---|---|
| ① | 양도 매매사례가액이 실지양도가액보다 우선 적용됨 | 🔴 **결함 확정** — 안내 문구대로 구현돼 있음 | 실가 2억·사례 1.5억 → 양도가액 **1.5억으로 치환**, 산출세액 18,685,000 → **5,865,000** |
| ② | 취득 매매사례가액 → 개산공제(취득기준시가×1%)가 적용돼야 하는데 기준시가 입력이 없음 | 🔴 **결함 확정** — 화면은 「1% 자동 적용」이라 안내하지만 엔진은 **0원** | 필요경비 0원(개산공제 누락 = 세액 과대) |

②는 「입력 화면이 없다」보다 넓다 — **엔진에도 계산이 없고**, 화면 안내는 적용된다고 말한다(안내↔엔진 불일치).

---

## 1. 법령 근거 (KoreanLaw MCP 조회, 2026-10-02 현행본)

| 조문 | 원문 요지 (verbatim 발췌) | 적용 |
|---|---|---|
| 소득세법 §96① | 「자산의 양도가액은 그 자산의 양도 당시의 양도자와 양수자 간에 **실지거래가액에 따른다**」 | 양도가액 = 실가. 납세자 단계에서 양도가액을 추계로 갈음하는 규정(§97①1호 단서 같은 것)이 **§96에는 없다** |
| 소득세법 §114⑦ | 「대통령령으로 정하는 사유로 … 실지거래가액을 인정 또는 확인할 수 없는 경우에는 … 매매사례가액, 감정가액, 환산취득가액 또는 기준시가 등에 따라 **추계조사하여 결정 또는 경정할 수 있다**」 | 양도가액 추계는 **과세관청의 결정·경정** 축 |
| 소득세법 시행령 §176의2① | 1호 「실지거래가액의 확인을 위하여 필요한 장부ㆍ매매계약서ㆍ영수증 기타 증빙서류가 **없거나** 그 중요한 부분이 미비된 경우」 / 2호 「…거짓임이 명백한 경우」 | 추계 사유. 실가가 있으면 추계 사유가 없다 |
| 소득세법 시행령 §176의2③ | 「다음 각 호의 방법을 **순차적으로** 적용 … 1. … 전후 각 3개월 이내에 해당 자산(**주권상장법인의 주식등은 제외**한다)과 동일성 또는 유사성이 있는 자산의 매매사례가 있는 경우 그 가액」 | 매매사례가액은 추계의 1순위일 뿐 실가보다 앞서지 않는다 |
| 소득세법 §97①1호 | 「취득가액 … 다만, **가목의 실지거래가액을 확인할 수 없는 경우에 한정하여** 나목의 금액을 적용한다. 가. … 실지거래가액 나. 대통령령으로 정하는 매매사례가액, 감정가액 또는 환산취득가액을 순차적으로 적용한 금액」 | 취득측 매매사례가액의 근거 |
| 소득세법 §97②2호 | 「그 밖의 경우의 필요경비는 제1항제1호나목 … 의 금액에 **자산별로 대통령령으로 정하는 금액을 더한 금액**. 다만, 제1항제1호나목에 따라 취득가액을 **환산취득가액으로 하는 경우로서** 가목의 금액이 나목의 금액보다 적은 경우에는 나목의 금액을 필요경비로 할 수 있다」 | 매매사례 취득 → 본문(개산공제) 적용. **단서(실비 swap)는 환산취득가액 한정** |
| 소득세법 시행령 §163⑥4호 | 「제1호 내지 제3호외의 자산　**취득당시의 기준시가×1／100**」 | 주식(§94①3)은 1·2·3호 어디에도 해당하지 않아 4호 |
| 소득세법 시행령 §163⑫ | 「법 제97조제1항제1호나목에서 "대통령령으로 정하는 매매사례가액, 감정가액 또는 환산취득가액"이란 제176조의2제2항부터 제4항까지의 규정에 따른 가액」 | 나목 → §176의2③1호 연결 |
| 소득세법 §99①4호 | 「제94조제1항제3호나목에 따른 주식등 — 「상속세 및 증여세법」 제63조제1항제1호나목을 준용하여 평가한 가액. 이 경우 평가기준시기 및 평가액은 대통령령으로 정하는 바에 따르되…」 | 비상장 주식 취득기준시가 = 영 §165④ 보충적 평가(코드 기존 정본) |

⇒ ① **양도가액에 매매사례가액을 «우선» 적용할 근거는 없다.** 실가가 확인되면 추계 사유(영 §176의2①) 자체가 없다.
⇒ ② **취득가액을 매매사례가액으로 하면 필요경비 = 매매사례 취득가액 + 취득기준시가×1%**(§97②2호 본문 + 영 §163⑥4). 실비(자본적지출·양도비)로 갈아타는 단서는 **환산취득가액 한정**이라 매매사례에는 없다.

---

## 2. 현행 코드 실측

### 2.1 결함 ① — 양도 매매사례가액 절대 우선

| 위치 | 내용 |
|---|---|
| `components/calc/stock-transfer/MarketSampleBlock.tsx:57-60` | 「입력 시 1주당 양도가액 대신 우선 적용됩니다」 |
| `lib/tax-engine/stock-transfer/stock-transfer-tax.ts:213-220` | `transferMarketSamplePrice > 0 && 비상장` → `transferPrice = 사례가 × 주식수` (실가 `perShareTransferPrice`·`transferTotalPrice` 무시) |
| `lib/tax-engine/stock-transfer/types/stock-transfer.types.ts:382` | 주석 「perShareTransferPrice 대신 우선 적용」 |
| `lib/tax-engine/stock-transfer/stock-valuation-market-sample.ts:76` | 주석 「perShareTransferPrice 우선 무시 (사례가 우선)」 |
| `lib/tax-engine/stock-transfer/stock-transfer-pr2-detail.ts:38-41` | 양도측 사례가 있으면 `marketSampleDetail.transferApplied=true` 표시 |
| `lib/calc/stock-transfer-tax-api.ts:378-397` | `sale_case`일 때 `transferMarketSample*` 전송 |

**실측 probe** (비상장·100주·취득 매매사례 1,000,000/주·실지양도 2,000,000/주, 엔진 직접 호출):

| 케이스 | 양도가액 | 취득가액 | 필요경비 | 양도소득금액 | 산출세액 |
|---|---|---|---|---|---|
| A. 양도 사례 없음 | 200,000,000 | 100,000,000 | **0** | 100,000,000 | 18,685,000 |
| B. 양도 사례 1,500,000/주 추가 | **150,000,000** | 100,000,000 | 0 | 50,000,000 | **5,865,000** |

B는 실지양도가액 2억이 입력돼 있는데 1.5억으로 계산됐다.

### 2.2 결함 ② — 매매사례 취득 시 개산공제 0원

| 층 | 위치 | 현행 |
|---|---|---|
| UI ⑤ | `app/calc/stock-transfer-tax/steps/Step2.tsx:540-543` | `sale_case` → `MarketSampleBlock`만 렌더. **취득기준시가 입력 없음** |
| UI 안내 | `app/calc/stock-transfer-tax/steps/Step3.tsx:60-64, 218-232` | `sale_case`를 `expenseLocked`로 묶고 「취득기준시가 × 1%의 개산공제로 자동 적용됩니다」 표시. 실비 입력칸 숨김 |
| API ④ | `lib/calc/stock-transfer-tax-api.ts:507-514` | `sale_case` → `expenseMode: "estimated"` 강제 |
| validate ⑧ | `lib/calc/stock-transfer-tax-validate.ts:128-133` | 같은 도출 |
| 엔진 | `lib/tax-engine/stock-transfer/stock-acquisition-basis.ts:328-339` | `sale_case` 분기가 `estimatedBase`·`usedEstimatedAcquisition`을 **세팅하지 않음** |
| 엔진 | `stock-acquisition-basis.ts:371-373` | 개산공제 = `usedEstimatedAcquisition && estimatedBase > 0`일 때만 → `undefined` |
| 엔진 | `stock-transfer-tax.ts` STEP 4 else 분기 | `expenseMode === "estimated"` → `expenses = estimatedDeduction ?? 0` = **0** |

⇒ 화면: 「1% 자동 적용」 + 실비 입력 차단 / 엔진: 0원. **어느 경로로도 필요경비가 들어가지 않는다.**

> ⚠️ 엔진 직접 호출로 `expenseMode: "actual"`을 주면 `sale_case`에서도 실비가 그대로 필요경비가 된다(`swap-97-2-b2.test.ts` SW-5가 실비 31,000,000으로 이 경로를 탄다 — 단언은 `swapApplied` 뿐). §97②2호 본문상 매매사례 취득에 실비 필요경비는 없으므로 엔진도 `sale_case`에서 `expenseMode`를 따르지 않아야 한다.

### 2.3 결함을 «정답»으로 고정한 기존 테스트 (반전 대상)

| 테스트 | 현재 단언 | 반전 후 |
|---|---|---|
| `__tests__/tax-engine/stock-transfer/pr2-remaining.test.ts:86-88` MS-1-05 | 「estimatedDeduction = 0 (개산공제 미적용 — 실지거래가액 의제)」 `toBeUndefined()` | 취득기준시가×1% 값 |
| 같은 파일 `:199-205` MS-4-01 | 「transferPrice = 250,000,000 (사례가 우선)」 | 실가 200,000,000 |
| `__tests__/calc/stock-api-plumbing-strip.anchor.test.ts` AP-MS-3 | 「sale_case + 비상장이면 종전대로 적용된다」 transferPrice 100,000,000 | Q-1 결정에 따름 |
| 같은 파일 AP-MS-4 | 양도측 단독 적용 시 §176의2·§163 인용 | Q-1 결정에 따름 |
| `swap-97-2-b2.test.ts:116` SW-5 | `swapApplied` falsy만 | + `expenses === 개산공제` (실비 31,000,000 미반영) 단언 추가 |

([[feedback_existing_test_uses_the_defect_as_its_vehicle]] — 반전은 법령 근거 우선 [[feedback_anchor_correction_legal_priority]])

---

## 3. 사용자 결정 필요 (Q)

### Q-1. 양도 매매사례가액 입력을 어떻게 할 것인가 — ✅ **A 확정 (2026-10-02)**

| 안 | 내용 | 근거·장단 |
|---|---|---|
| **A (추천)** | 양도 매매사례가액 입력·엔진 분기 **제거**. 양도가액은 항상 실지거래가액 | §96①은 실가뿐이고, 양도가액 추계는 §114⑦ **과세관청 결정·경정** 축이다. 취득가액은 §97①1호 단서가 납세자 산정 단계에서 매매사례를 허용하지만 **양도가액에는 대응 규정이 없다**. 코드가 가장 줄고 결함 재발 여지가 없다 |
| B | 「양도 당시 실지거래가액 확인 불가(영 §176의2①)」 명시 선언 토글을 두고, ON일 때만 매매사례가를 양도가액으로 쓴다(실가 칸 숨김 + validate 차단) | 법정 순서는 지킨다. 다만 §176의2③ 순차상 매매사례가 없으면 기준시가로 가야 하는데 그 경로가 없어 **반쪽 구현**이 된다. 양도 추계 시 취득 환산 분자(§176의2②1호 「제3항제1호의 매매사례가액」)와의 연동도 새로 열린다 |

> 기각: 「실가 미입력 시 매매사례로 fallback」 — 자동 fallback 금지 원칙([[feedback_no_silent_apportion_fallback]]) 위반. 미입력은 검증 오류로 막는다.

### Q-2. 기타자산(`other_asset`) + 매매사례 취득의 취득기준시가 — ✅ **확인 완료 (Do 1단계)**

> **결론: 비상장과 같은 보충평가다.** 소득세법 시행령 §165⑧1호 — 「법 제94조제1항제4호나목부터 라목까지의 규정에 따른 주식등 → 법 제99조제1항제3호 및 제4호에 따라 평가한 가액. 이 경우 라목에 따른 주식등이 제99조제1항제4호의 주식등에 해당하는 경우에는 이 조 제4항제1호나목의 계산식(순자산가치)에 따라 평가한 가액으로 한다」. 이 앱의 `other_asset`은 §94①4 다·라목(과점주주·부동산과다보유 법인 주식등)이라 `calcAcquisitionStdPerShareSupplementary`(§165④ 가중평균+80% 하한, 순자산 단독 4사유)를 그대로 쓴다. 영업권·시설물이용권(§165⑧2·3호)은 이 앱의 `other_asset` 입력 범위 밖이다. ⚠️ 라목 중 §165④1 해당 시 **순자산가치 단독**이라는 별도 규율이 있어 라목 입력 경로와의 정합은 anchor(P4)로 확인한다.
> 단 `stock-acquisition-basis.ts:213`의 환산 분기는 `marketType === "unlisted"`만 보므로 `other_asset`은 환산에서 어떤 갈래를 타는지가 별도다 — **sale_case 신규 분기는 `unlisted`·`other_asset` 둘 다** 받는다(상장 3종만 차단: 기존 `isMarketSampleAllowedMarket`).

- 비상장(`unlisted`)은 §99①4 → 영 §165④ 보충적 평가로 확정(기존 정본 `calcAcquisitionStdPerShareSupplementary` 재사용 가능).
- 기타자산은 §99①6 「대통령령으로 정하는 방법」인데 **시행령 해당 조항을 아직 조회하지 않았다**. 환산 모드(`estimated`)도 엔진 분기가 `marketType === "unlisted"`(`stock-acquisition-basis.ts:213`)만 보아 기타자산 경로가 불분명하다.
- 제안: Do 1단계에서 시행령 조회 → (a) 비상장과 같은 보충평가면 같이 배선 / (b) 다르면 이번 범위에서 기타자산은 **1주당 취득기준시가 직접 입력** 칸으로 처리. 결정은 조회 결과로.

---

## 4. 수정 설계

### 4.1 결함 ① (Q-1 = A 기준)

| 지점 | 변경 |
|---|---|
| 엔진 `stock-transfer-tax.ts:213-235` | 양도측 매매사례 분기 2개 제거 → `actual`은 `total`/`per_share` 실가만. 상장 경고 분기도 함께 사라짐(입력 자체가 없어짐) |
| 엔진 `stock-transfer-pr2-detail.ts:38-52` · `stock-valuation-market-sample.ts` | 양도측 평가·`transferApplied` 제거 |
| 타입 `stock-transfer.types.ts:382-385` · 결과 `marketSampleDetail.transfer*` | 필드 제거(또는 deprecated) — 표시부 역방향 grep 필수 |
| ⑤ `MarketSampleBlock.tsx:56-83` | 「② 양도 매매사례가액」 카드 제거 |
| ①②③ store `calc-wizard-stock-form*.ts`·`-normalize.ts:213-215` | `transferMarketSample*` 3필드 제거. 저장 이력의 잔존값은 normalize가 버린다 |
| ④ `stock-transfer-tax-api.ts:378-397` | 전송 블록 제거 |
| ⑫ `lib/api/stock-transfer-tax-schema.ts:310-312` · `stock-transfer-date-fields.ts:40` · ⑭ `stock-transfer-engine-input.ts:147-149` | 제거 |
| 결과·PDF | `marketSampleDetail.transferApplied` 렌더 지점 역방향 grep 후 정리 |

> Q-1 = B를 택하면 이 표 대신 「선언 토글」 1필드를 14지점에 추가하는 설계로 바꾼다(별도 개정).

### 4.2 결함 ② — 매매사례 취득 개산공제

**엔진** (`stock-acquisition-basis.ts`)
1. `sale_case` 분기에서 취득기준시가를 산출해 `estimatedBase = 1주당 취득기준시가 × shareCount`.
   - 비상장: `calcAcquisitionStdPerShareSupplementary(input)` 재사용(§165④ 가중평균·80% 하한·순자산 단독 4사유·부동산과다 반전을 그대로 받는다 — [[single-source-engine-helper]]).
   - ⚠️ 이 헬퍼는 `appliedRules`에 **영 §165③(거래정지) 인용을 첫 항목으로 넣는다**(`stock-valuation-unlisted-single-side.ts:148-150`). 매매사례 경로에서 그대로 병합하면 **엉뚱한 조문이 결과에 찍힌다** → 인용을 호출부로 옮기거나 `sale_case` 호출부에서 그 항목만 제외. (Do에서 택1, 기존 C-1 경로 인용 불변을 anchor로 고정)
2. 개산공제 조건(`:371`)을 `usedEstimatedAcquisition || acquisitionMode === "sale_case"`로 확장. **`usedEstimatedAcquisition`은 세팅하지 않는다** — 그 플래그가 §97②2호 단서 swap 게이트(`stock-transfer-tax.ts` STEP 4)라 환산 한정이어야 한다.
3. 부담부증여 B/C 안분은 합류 지점(`:362-369`)에서 이미 `estimatedBase`에 걸리므로 추가 작업 없음 — anchor로 확인.

**엔진** (`stock-transfer-tax.ts` STEP 4)
4. `acquisitionMode === "sale_case"`이면 `expenseMode`와 무관하게 `expenses = estimatedDeduction` (§97②2호 본문 — 매매사례에 실비 대체 단서 없음). SW-5의 실비 31,000,000이 필요경비에서 빠지는 것으로 확인.

**UI ⑤** (`Step2.tsx:540-543`)
5. `MarketSampleBlock` 아래에 「취득 당시 기준시가 — 개산공제 기준 (소령 §163⑥4 · §165④)」 `ToneCard` + `EstimatedUnlistedBlock acquisitionSideOnly` 재사용(취득 C-1 경로가 이미 같은 조합을 씀 — `Step2.tsx:502-510`). 미리보기: 1주당 취득기준시가·× 주식수·× 1% = 개산공제.

**UI 안내** (`Step3.tsx:218-232`)
6. `sale_case`일 때 안내 문구에 실제 개산공제 미리보기 금액 표기(엔진 결과 전엔 입력값 추정 — [[tax-summary-sidebar-pattern]]). 「환산·매매사례·액면가」 일괄 문구는 유지하되 매매사례는 단서 swap 없음 문구가 이미 맞다(`swapEligibleMode` false).

**④ API** (`stock-transfer-tax-api.ts:369-377` `sale_case` 분기)
7. `acquisitionYearNetIncomePerShare`·`acquisitionYearNetAssetPerShare` 전송 추가. `netAssetOnlyReason`(`:502`)·`isHeavyRealEstateForValuation`(`:127`)은 이미 무조건 전송 — 확인만.
   - ⚠️ `:450`에 `acquisitionYearNetIncomePerShare`를 `delete`하는 분기가 있다 — 그 게이트가 `sale_case`를 지우지 않는지 Do에서 확인(확인 필요).

**⑧ validate** (`stock-transfer-tax-validate-step2.ts:569-600`)
8. `sale_case` + 비상장 → `validateAcquisitionSideUnlistedFields` 호출(순자산 단독 사유 시 NI 면제 규칙 그대로). 메시지의 「취득일 거래정지」 문구는 매매사례용으로 분기.

**⑫⑬⑭ Zod·Route** — `acquisitionYear*` 필드는 환산 경로용으로 이미 존재. **`acquisitionMode`별 strip/refine이 있는지** 확인 후 필요 시 허용(확인 필요).

**⑥ 사이드바 · ⑦ 결과 · PDF** — `StockTransferTaxResultViewHelpers.tsx:110-112`, `StockFilingFormAssetCostRows.ts:332-357`이 `estimatedDeduction`을 모드 무관하게 렌더 → 엔진이 값을 채우면 따라온다. 매매사례 라벨(「취득기준시가 × 1%」)이 맞는지 화면 확인.

---

## 5. 14 동기화 지점 매트릭스

| 지점 | ① (Q-1=A) | ② |
|---|---|---|
| ① 폼 타입 / ② initial / ③ normalize | 3필드 제거 | 변경 없음(기존 `acquisitionYear*` 재사용) |
| ④ API 변환 | 전송 제거 | `sale_case` 분기에 `acquisitionYear*` 전송 |
| ⑤ UI | 양도 사례 카드 제거 | 취득기준시가 카드 추가 |
| ⑥ 사이드바 | 영향 확인 | 개산공제 표시 확인 |
| ⑦ 결과 | `transferApplied` 표시 제거 | 개산공제 행 표시 확인 |
| ⑧ validate | — | 취득측 보충평가 필수 |
| ⑨⑩ Zod enum | — | — |
| ⑪ acquisitionDate fallback | — | — |
| ⑫ Zod 입력 객체 | 3필드 제거 | `sale_case`에서 `acquisitionYear*` 통과 확인 |
| ⑬ body spread | 제거 확인 | 통과 확인 |
| ⑭ Route 엔진 매핑 | 3필드 제거 | 기존 매핑 확인 |

---

## 6. anchor 케이스 매트릭스 (Pre-Do 우선: P1·P3)

| ID | 입력 | 기대 |
|---|---|---|
| **P1** | 비상장 100주, 실지양도 2,000,000/주, 취득 사례 1,000,000/주, 취득연도 NI·NA 입력(1주당 기준시가 X) | `expenses = estimatedDeduction = floor(X×100×1%)`, 양도소득금액 = 2억 − 1억 − 개산공제 |
| P2 | P1 + `expenseMode:"actual"`, `actualExpenses: 31,000,000` (엔진 직접) | 필요경비 = 개산공제(실비 미반영), `swapApplied` false |
| **P3** | (Q-1=A) 구 body에 `transferMarketSamplePrice` 잔존 → 풀스택 | Zod가 버림, 양도가액 = 실가 2억 |
| P4 | P1 + 순자산 단독 사유 | NI 없이 통과, 기준시가 = NA |
| P5 | P1 + 부담부증여 B/C | 개산공제 base에 B/C 안분 |
| P6 | P1의 `appliedRules`/`warnings` | 영 §165③(거래정지) 인용 **없음** · §163⑥4 인용 있음 |
| P7 | `estimated` C-1(취득일 거래정지) 기존 케이스 | 인용·세액 불변(형제 경로 회귀 가드) |
| P8 | validate: `sale_case` + 비상장 + 취득연도 NI/NA 미입력 | 오류(field = `acquisitionYear*`) |
| P9 | 상장 + `sale_case` | 종전대로 차단 |

---

## 7. 확인 필요 (V) — 착수 전 해소

| ID | 항목 | 방법 |
|---|---|---|
| V-1 ✅ | 기타자산 기준시가 시행령 조항(§99①6 위임) | **영 §165⑧1호** — 주식등은 §99①3·4호대로 평가(=비상장 보충평가). Q-2 종결 |
| V-2 ✅ | `stock-transfer-tax-api.ts:436-450` delete 분기가 `sale_case`에 걸리는지 | **게이트가 `acquisitionMode === "estimated"`** 라 `sale_case`는 안 걸린다. 반대로 `:454-467` **full 결산서 블록은 `acquisitionMode`를 안 본다**(`marketType===unlisted && unlistedValuationMode==="full"`) → `estimated`에서 full로 만든 뒤 `sale_case`로 바꾸면 **화면에 없는 stale 결산서 값**이 `acquisitionYear*`를 덮는다. ⇒ `sale_case` 블록을 그 뒤에 두어 **simple 값이 이기게** 한다 |
| V-3 ✅ | Zod에 `acquisitionMode`별 `acquisitionYear*` strip/refine 존재 여부 | strip 없음(`schema.ts:338-339` 최상위 optional). 단 **⑫ 2차 필수 게이트**(`stock-transfer-tax-refines.ts:353-371`)가 `estimated`에만 `requiredUnlistedValuationKeys`를 건다 → **`sale_case` + 비조상 `scope:"acquisition"` 추가 필요** |
| V-4 ✅ | `marketSampleDetail.transfer*`·`transferMarketSample*` 전수 | 필드명 grep: 소비처는 **`MarketSampleDetailCard.tsx`(양도 행 + 하단 문구)** 와 `docs/02-design/.../stock-transfer-pr2-remaining.engine.design.md`·테스트 3파일뿐. **e2e/ 0건**, PDF 0건. 🔴 **같은 카드 하단 문구가 이미 틀려 있다**: 「매매사례가액 = 실지거래가액 의제 (법§97②1호) — §163⑥ 개산공제 미적용, §97②2호 swap 비대상」 → 결함 ②의 정답이 반대다. 문구도 정정 대상 |
| V-5 ✅ | 이월과세 `acquisitionStdPriceOverridePerShare`를 `sale_case`에 걸지 | `stock-carryover.ts:262`(증여자 실가 알면 `actual`로 되돌림 → 무관) / `:296-306`(나목, 환산 5분기 입력 치환). 나목에서 `sale_case`는 **취득가액 자체**가 증여자 값으로 치환되지 않는 **기존 한계**라 개산공제 기준시가만 따로 승계하면 짝이 안 맞는다 → **이번 범위 밖, override 미적용**으로 두고 별건 기록 |
| V-6 ✅ | 저장 이력 재계산 시 결과 변화 | 이력은 저장된 `resultData`를 표시(`lib/storage/CLAUDE.md`)하므로 **재계산 경로로 열 때만** 달라진다. 별도 고지 없이 진행 |
| V-7 🆕 | 비과세 echo 경로 `exempt-informational-acquisition.ts:68-83`가 `sale_case`를 `actual`처럼 `actualAcquisitionTotal(input)`로 계산 | 이 경로는 **`acquisitionMarketSamplePrice`를 읽지 않아** 비과세 echo의 취득가액이 어긋날 수 있다(세액 영향 없음 — 실 세액은 0으로 zeroing). **이번 변경이 `estimatedBase`를 `sale_case`에 채우면 이 sibling도 같은 값을 echo해야** 하는지 Do에서 판단(범위 확장 여부는 확인 후) |

---

## 8. 실행 단계

```
1. V-1~V-6 해소, Q-1·Q-2 확정            → verify: 본 문서 §3·§7 갱신
2. Pre-Do anchor P1·P3 작성(실패 확인)   → verify: 현행에서 RED
3. 엔진 ②(basis·STEP 4) + ①(STEP 2 제거) → verify: P1·P2·P4~P7 GREEN, 기존 테스트 반전 5건
4. ④⑧⑫⑬⑭ 배선                            → verify: P3·P8·P9, stock-api-plumbing-strip GREEN
5. ⑤ UI(양도 카드 제거·기준시가 카드 추가)·Step3 안내 → verify: Playwright 폼→계산→결과, request body 확인
6. npx vitest run __tests__/tax-engine/stock-transfer/ __tests__/calc/ (주식 세목 스크립트 없음) + npx tsc --noEmit → verify: 0 fail
```

## 9. 범위 밖

- 감정가액(주식 제외 — 영 §176의2③2호), 상장 매매사례(본문 괄호 제외)는 현행 유지.
- 부동산 양도세 매매사례가액 경로(`transfer-tax-helpers.ts`)는 별개 엔진 — 같은 결함 존재 여부는 별건으로 확인.

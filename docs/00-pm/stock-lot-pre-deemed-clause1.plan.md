# 주식양도세 — 분할·다건 lot 의제취득일 전 매수의 ① 비교 (영 §176의2④1호) 계획서 — 엔진·API·⑧⑫ 섹션 초안

- 작성: 2026-10-06 (Plan) → 같은 날 Do(엔진·API·⑧⑫ + 폼 ①②③④⑧ 배선) 완료 — §11 계약 · §12 구현 결과
- 선행: PR #2006(`c3eaf1cba`) — lot 모드에 ②(영 §176의2④2호)만 적용. ①은 «산정 수단 없음»으로 비교하지 않음
- 모계획서: `docs/00-pm/stock-pre-deemed-acquisition-176-2-4.plan.md`(단건 Z-1)
- 병렬: UI 시니어가 ⑤⑥⑦ 섹션을 별도로 계획 중 — 이 문서는 **엔진·⑧⑫·API(④⑨⑩⑪⑫⑬⑭)** 담당 범위다
- 상태: **엔진·API·⑧⑫ Do 완료(2026-10-06)** — 사용자 결정 반영(§0.1). ⑤⑥⑦ UI는 UI 시니어(`stock-lot-pre-deemed-clause1.ui-notes.md`)

---

## 0. 결론 요약

1. **계산 위치**: ①은 «취득 lot»이 아니라 «(취득 lot × 매도 lot) sub-lot»에서만 정해진다(환산 ①이 매도 lot의 양도가액·양도 당시 기준시가에 의존). 따라서 `applyPreDeemedToLots`처럼 **allocateLots 앞의 전처리로는 불가**하고, 이월과세가 이미 쓰는 seam인 `resolveLotAcquisitionPrice(lot, saleDate)`(sub-lot 생성 지점 3종 + moving_avg 풀 재도출)를 **「매도 lot 전체를 받는 판」**으로 일반화한다. `allocateLots`는 **끝에 optional 7번째 인자**(ctx)만 늘어 호출처 3곳(엔진·미리보기·비과세 echo)은 같은 ctx 빌더를 부른다.
2. **②는 지금 위치에 그대로 둔다**(전처리 — lot 단가가 ②로 바뀜). 전처리가 lot에 «② 적용 표지»(`preDeemedClause2PerShare` 내부 필드, Zod 비노출)를 남기고, sub-lot 단계가 `max(①_매도lot, ②_lot)`을 고른다.
3. **필요경비가 핵심 난제**다. 현행 lot 모드는 필요경비가 «실비 단일 합계»뿐이다(개산공제 개념 자체가 없다 — §2.4). ①이 채택된 sub-lot은 법 §97②2호(개산공제 + 환산이면 단서)라 **실비 귀속 규칙이 새로 필요**하고 그 명문 근거는 없다(확인 필요). 권장안: **양도 주식수 비례 귀속 + 단서는 ① 환산 sub-lot 합계 단위 판정**(§5).
4. **범위 권장**: Phase 1 = 상장 ① 환산 + 비상장·기타자산 ① 매매사례가액. **비상장 ① 환산은 Phase 2**(양도 당시 보충평가가 매도 lot마다 달라 입력 단위가 별개 — §3.3).
5. **anchor는 «단건 ↔ 1lot/1sale 패리티»가 중심**이다(§7) — 이미 단건에서 검증된 ①·②·swap 값을 lot 모드가 퇴화 입력에서 그대로 재현해야 한다.

### 0.1 사용자 확정 결정 (2026-10-06)

| ID | 결정 | 반영 |
|---|---|---|
| Q-1 | Phase 1 = 상장 환산 + 비상장·기타자산 매매사례. **비상장·기타자산 환산은 ⑧⑫ 차단**(안내 문구) | `PRE_DEEMED_LOT_UNLISTED_ESTIMATED_MESSAGE` — ⑧⑫ 공용 · 엔진 직접 호출은 ②만 + 경고 |
| Q-4 | **A안** — 실비를 양도 주식수 비례로 ② 채택분(·의제 아닌 lot)에만 귀속(잔액 흡수), ① 채택분은 개산공제. 귀속 근거(주식수·금액)를 결과 echo에 | `preDeemedLotsDetail.clause1.settlement` (§11.3) |
| Q-6 | 자본조정 + ① 환산 동반 → ⑧⑫ 차단(②는 그대로) | `PRE_DEEMED_LOT_CAPITAL_ADJUSTMENT_MESSAGE` |
| moving_avg | 허용 + 고지(경고 문구) | `이동평균법은 ① 환산이 매도 건마다 달라…` 경고 · `clause1.pooled` |
| Q-2·3·5·7·8·9·10 | 계획서 권장안대로 | Q-2 종목 단위 + 매도 lot별 · Q-3 1주당 floor(개산공제는 총액 1회 floor) · Q-5 종목 합계 단서 · Q-7 미선택 = ②만 · Q-8 perLotGain 미반영 · Q-9 허용+고지 · Q-10 비과세 echo 같은 헬퍼 |
| 별건 | `stock-acquisition-cause.ts` leaf 주석에 「주식배당 주식 취득가액 = 액면금액(사용자 결정 2026-10-06), 무액면주식은 고려하지 않는다」 | 반영 |

> 「②채택분에만 귀속」의 해석: 실비 몫은 **① 채택이 아닌 모든 매도 주식**(② 채택 · 의제 대상 아닌 lot · 이월과세 lot)이 받는다. ① 채택분 몫(`clause1SideActual`)은 **단서(환산) 비교에만** 쓰이고 본문이면 개산공제가 갈음한다 — 계획서 §5 A안 그대로.

---

## 1. 법령 (원문 확인 2026-10-06)

| 조문 | 확인 | 내용(발췌) |
|---|---|---|
| 영 §176의2④ (MST 290841) | 사용자 제시 원문 확인됨(모계획서 §2.1 동일) | 의제취득일 전 취득 자산 — 의제취득일 현재 취득가액 = **많은 것**: 1호 의제취득일 현재 ③1~3호 가액 / 2호 취득 당시 실가 + 생산자물가상승분 |
| 영 §176의2③ | 사용자 제시 | 순차: 1호 매매사례(주권상장법인 주식등 제외) → 2호 감정가액(주식등 제외) → 3호 환산(영 §176의2②1호) |
| **법 §97②1호 나목** (MST 280405, 현행 시행 20260101) | **원문 재확인** | ②(실가+물가)가 채택되면 필요경비 = 그 합산가액 + §97①2호·3호(**실비**) |
| **법 §97②2호** | **원문 재확인** | 그 밖의 경우 = 「①나목 금액(매매사례·감정·환산)에 **자산별로 대통령령으로 정하는 금액**(개산공제)을 더한 금액」. **단서**: 「환산취득가액으로 하는 경우로서 가목(환산 + 개산공제)이 나목(자본적지출+양도비)보다 **적은 경우에는 나목을 필요경비로 할 수 있다**」 |
| 영 §163⑥4 (현행 MST 290841) | **원문 재확인** | 제1~3호 외 자산(주식) — **취득당시의 기준시가 × 1/100** |
| 영 §163⑫ | 원문 재확인 | 법 §97①1호 나목 = 영 §176의2②~④ 가액 |

**⚠️ 확인 필요(미확보)**
- **한 종목에 의제취득일 전(①/②)·후(실가) 취득분이 섞여 일부 양도될 때 필요경비를 어떻게 귀속하는지** — 법령 명문 없음. 해석례·심판례 검색(법제처 해석례 «의제취득일 전후 …개산공제», 조세심판원 «의제취득일 필요경비 개산공제»·«…생산자물가상승률…») **0건**(2026-10-06, KoreanLaw `search_decisions` interpretation/tax_tribunal). 국세청 예규(nts 도메인)는 본 조회로 미확인 — **사용자가 국세청 예규·질의회신을 갖고 있으면 Q-4 전에 대조**.
- 법 §97②2호 단서는 「**할 수 있다**」(임의)다. 단건 엔진은 이를 «비교 후 큰 쪽 자동 채택»으로 구현해 왔다(`stock-transfer-tax.ts:296~316`). lot 판도 같은 규약을 따른다(신규 판단 아님).
- ① 환산 + 자본조정(무상증자·감자) 동반 시 환산 분자(의제취득일 시점 1주당 기준시가)와 분모(양도 시점)의 **주식수 단위가 갈린다**(Q-6). 근거 해석 미확보.

---

## 2. 현행 실측 (origin/master `c3eaf1cba`)

### 2.1 ② 적용 위치와 순서

- `stock-pre-deemed-acquisition.ts:303` `applyPreDeemedToLots(lots, marketType, is94_4)` — 매수 lot 1주당 단가를 `floor(단가 × PPI직전달 ÷ PPI취득월)`로 **치환**(1주당 floor — 총액 floor보다 최대 주식수−1원 작음, 파일 주석 :296).
- 엔진: `stock-transfer-tax.ts:182`(자본조정 희석 `:186~191` **앞**) → `:195` `allocateLots`.
- 미리보기: `lib/calc/stock-split-preview.ts:49~60` 같은 순서(single-source: `buildEngineInput` → ② → 희석 → `allocateLots`).
- 비과세 echo: `stock-transfer-exempt-result.ts:64` `allocateLots(input.acquisitionLots!, …)` — **② 전처리 없이 raw lots**. 세액 0인 정보 echo라 세액 영향 없음. 그러나 ② 미적용 값이 echo돼 불일치(확인 필요 — Q-10).
- `isPreDeemedPurchaseLot`은 모듈 private(`:272`). ① 적용 판정에 export 필요.

### 2.2 lot 엔진의 취득단가 seam

- `resolveLotAcquisitionPrice(lot, saleDate)`(`stock-carryover.ts:86`)가 이미 **매도 시점별로 lot 단가를 갈라 주는 seam**이다(§97의2① 1년 요건). 호출 지점: `lot-allocation.ts:294`(specific) · `:400`(fifo) · `:492`(moving_avg — 매도마다 풀 원가를 lot별 잔여지분으로 재도출. 주석 `:459~470`이 바로 이 용도를 설명).
- `MatchedSubLot`에는 취득 lot id가 없다(`stock-transfer.types.ts:815~832`) ⇒ **사후(post-pass) 재가격 불가** — 특히 moving_avg는 풀 평균이라 사후 분해가 안 된다.
- 합계: `lot-allocation.ts:234` `totalAcquisitionPrice = Σ buyShares × perShareBuyPrice` — sub-lot 단가는 **정수 1주당 값**.
- `perLotGain = (매도단가 − 매수단가) × 주식수`(`:296`·`:402`) — **필요경비 미반영**(실비도 현재 미반영). 세율 안분(단기/장기)과 `totalGain <= 0` 0세액 가드(`lot-allocation-tax.ts` `calcSplitModeTax`)가 이 값으로 돈다.

### 2.3 단건 ① 입력 필드 (재사용 후보)

| 용도 | 단건 필드 | 위치 |
|---|---|---|
| 상장 환산 — 취득측(의제취득일 이전 1개월 종가평균) | `acquisitionDatePriceAvg1Month` | `stock-valuation-listed.ts:78` |
| 상장 환산 — 양도측 | `transferDatePriceAvg1Month` | 동 `:77` |
| 비상장 취득측 §165④ 보충평가 | `acquisitionYearNetIncomePerShare`·`acquisitionYearNetAssetPerShare`·`acquisitionNetAssetOnlyReason`·`isHeavyRealEstateForValuation` | `calcAcquisitionStdPerShareSupplementary(input)` `stock-valuation-unlisted-single-side.ts:127` — **취득측 한쪽만 산출하는 기존 leaf**(양도일 가중치 연혁 `input.transferDate` 사용) |
| 비상장 양도측 §165④ | `transferYearNetIncomePerShare`·`transferYearNetAssetPerShare`·`netAssetOnlyReason` | 양측 경로 `calcUnlistedValuation` |
| 매매사례 | `acquisitionMarketSamplePrice`·`acquisitionMarketSampleDate` | `stock-valuation-market-sample.ts` — 상장 제외(`isMarketSampleAllowedMarket`) |
| ② 기준 실가(환산 모드) | `preDeemedActualPricePerShare` | lot에서는 불필요 — lot 단가가 ②의 실가 |

- 모두 `stockTransferInputSchema`에 이미 optional로 정의돼 있다(⑫ 재사용 가능). lot 모드에서는 폼이 숨기고(④가 `acquisitionMode === "estimated"/"sale_case"` 분기에서만 전송 — `stock-transfer-tax-api.ts:310~382`) 엔진은 lot 모드에서 읽지 않는다(`stock-acquisition-basis.ts:78` lot 합계 우선).

### 2.4 lot 모드 필요경비 — 실비 단일 합계

- ④: `acquisitionMode`가 실가가 아니면 Zod가 분할을 차단(`refines.ts` «분할 모드는 실가 모드만») ⇒ lot 모드의 `expenseMode`는 **항상 `"actual"`**(`stock-transfer-tax-api.ts:536~543`).
- 엔진 STEP 4(`stock-transfer-tax.ts:294~341`): `usedEstimatedAcquisition=false`(`stock-acquisition-basis.ts:78~87` lot 분기) → `expenses = directExpenses = actualExpenses + lotDonorCapex`. **개산공제·단서 swap 경로는 lot 모드에서 한 번도 돌지 않는다.**
- `actualExpenses`는 종목 단위 단일 입력 — lot별·sub-lot별 실비 입력은 없다(이월과세 증여자 자본적지출만 lot별 + 매도 몫 안분 — `stock-carryover.ts` `accrueLotCarryoverExpense`).

---

## 3. 설계 — ① 산정

### 3.1 sub-lot max(①, ②) 정의

의제취득일 전 «매수» lot `i`와 매도 lot `j`가 만나는 sub-lot의 1주당 취득가액:

```
P2_i  = lot i 의 ② (applyPreDeemedToLots 가 이미 단가에 반영 — 전처리 유지)
P1_j  = ① 1주당 — 방식별:
        · estimated(상장 환산): floor( 매도 lot j 1주당 양도가 × 의제취득일 1주당 기준시가 ÷ 매도 lot j 양도 당시 1주당 기준시가 )
        · sale_case(비상장·기타 매매사례): floor(매매사례 1주당)   // j 무관
sub-lot 단가 = max(P1_j, P2_i)   (동액이면 ② — 단건 Z1-7 동일)
```

- **모든 의제취득일 전 lot은 같은 의제취득일**(주식 1986.1.1. / 기타자산 1985.1.1.)이라 ①의 «분자»(의제취득일 현재 기준시가)와 매매사례가는 **종목 단위 값 하나**다. 매도 lot별로 달라지는 것은 환산의 «분모»(양도 당시 기준시가)와 «양도가»뿐이다. ⇒ 입력은 «종목 1 + 매도 lot별 1»로 닫힌다.
- **취득 lot 단위 «많은 것»**이라는 법문 구조(영 §176의2④ — «취득한 자산에 대하여»)와 맞다: 각 취득 lot이 자기 ②와 공통 ①을 비교한다.
- ①이 산정되지 않으면(방식 미선택·입력 누락) 해당 sub-lot은 **②만**(= PR #2006 현행, 단건 Q-6과 동일 규약 — «① 미산정» 경고 유지).
- 의제 대상이 아닌 lot(의제취득일 후 매수·상속·증여·이월과세·합병)은 **전혀 건드리지 않는다** — 술어는 `isPreDeemedPurchaseLot`(export) 하나.

### 3.2 시그니처 변경 범위 (최소)

| 파일 | 변경 | 규모 |
|---|---|---|
| `types/stock-transfer.types.ts` | `AcquisitionLot.preDeemedClause2PerShare?: number`(엔진 내부 표지 — Zod 비노출) · `TransferLot.transferStdPricePerShare?: number` · `StockTransferInput.preDeemedLotClause1?: "estimated" \| "sale_case"` · `MatchedSubLot.preDeemedSelected?: "clause1"\|"clause2"` · `LotMatchingDetail.preDeemedClause1Summary?`(§3.4) | 타입 전용 파일(1525줄 — 타입 전용 예외, 별도 판단) |
| `stock-pre-deemed-acquisition.ts` | `applyPreDeemedToLots`가 ② 적용 lot에 표지 부여 · `isPreDeemedPurchaseLot` export | +~6줄 (331줄) |
| **신규 `stock-pre-deemed-lot-clause1.ts`** | ctx 빌더 `buildPreDeemedLotClause1Context(input, is94_4)` · sub-lot 단가 `resolveSubLotBuyPrice(acq, trn, ctx)` · 필요경비 `resolveLotClause1Expenses(...)` (§5) | ~220줄 |
| `lot-allocation.ts` | `allocateLots`에 **7번째 optional 인자** `preDeemedClause1?: Ctx` · 3개 sub-lot 생성 지점(`:294`·`:400`·moving_avg `:492`+matched push)이 `resolveLotAcquisitionPrice(acq, trn.transferDate)` 대신 래퍼 호출 · `LotMatchingDetail`에 요약 누적 | +~40줄 (553→~595) |
| `stock-carryover.ts` | `resolveLotAcquisitionPrice` **시그니처 불변**(이월과세 로직 격리). 래퍼가 그 위에 얹힌다 | 0 |
| `stock-transfer-tax.ts` | `:182` 직후 ctx 빌드 → `allocateLots` 7번째 인자 · STEP 4(`:294~341`) lot 분기에서 `resolveLotClause1Expenses` 위임 · STEP 4.5 seam(`:423`)에서 부분 swap 제거분 차감 | **+~12줄 (743→~755 — ≥750 위험구간: 위임으로 억제, 초과 시 STEP 4 lot 분기를 leaf로 추출)** |
| `lib/calc/stock-split-preview.ts` | 같은 ctx 빌더·7번째 인자 | +~3줄 |
| `stock-transfer-exempt-result.ts` | (Q-10) 같은 ctx·② 전처리 동일 헬퍼로 통일 | +~4줄 |

호출처는 **3곳**(엔진·미리보기·비과세 echo)이며 전부 **같은 ctx 빌더**를 쓴다 — `single-source-engine-helper`. 7번째 인자가 optional이라 기존 anchor(lot-allocation·이월과세·희석 등)는 **무변경 통과**해야 한다(회귀 게이트 §7.4).

### 3.3 입력 (필드) 설계

**Phase 1 (권장)** — 방식별 최소 입력:

| ① 방식 | 대상 시장 | 종목 단위 입력(재사용) | 매도 lot별 입력(신규) |
|---|---|---|---|
| 환산(상장) | 코스피·코스닥·코넥스 | `acquisitionDatePriceAvg1Month` — **의제취득일 이전 1개월 종가평균**(개산공제 base 겸용) | `TransferLot.transferStdPricePerShare` — 양도일 이전 1개월 종가평균 |
| 매매사례 | 비상장·기타자산(상장은 영 §176의2③1호 괄호로 **불가**) | `acquisitionMarketSamplePrice`·`acquisitionMarketSampleDate` + **개산공제 base용 의제취득일 현재 §165④ 보충평가**: `acquisitionYearNetIncomePerShare`·`acquisitionYearNetAssetPerShare`(+`acquisitionNetAssetOnlyReason`·`isHeavyRealEstateForValuation`) | 없음 |

- ⚠️ **매매사례 ①도 개산공제 base로 의제취득일 기준시가가 필요**하다(영 §163⑥4 — 단건 sale_case 경로가 `calcAcquisitionStdPerShareSupplementary`로 구한다 `stock-acquisition-basis.ts:366`). 그래서 «매매사례만 입력»은 불가 — 비상장 취득측 순손익·순자산 입력이 같이 필요하다. 기존 leaf `calcAcquisitionStdPerShareSupplementary(input)`를 **그대로 재사용**한다(lot 모드의 `input.transferDate`는 ⑪ fallback = 가장 오래된 매도일 — 가중치 연혁(2007.2.28.) 판정에만 쓰임. 매도 lot이 그 경계를 가로지르면 연혁이 하나로 고정되는 한계 — 확인 필요, 실사례 드묾).
- **Phase 2(별건)**: 비상장 ① 환산 — 분모가 «매도 lot별 양도 당시 §165④ 보충평가»라 매도 lot별 순손익·순자산(·사유)이 필요하다. 입력 폭이 커 UI·⑧·⑫를 따로 설계한다. **Phase 1에서는 ⑧·⑫가 «비상장 + estimated» 선택을 차단**(침묵 무시 금지 — `feedback_api_trigger_without_input_path_is_noop`).
- lots-only(단건 양도·다건 취득) 모드는 합성 매도 lot 1건(`stock-transfer-tax-api.ts:277~284`)이므로 ④가 **폼 전역 `transferDatePriceAvg1Month`를 합성 lot에 실어 보낸다**(별도 입력 없음).
- **stale 방지**: 신규·재사용 필드는 «lot 모드 + ① 방식 선택 + 의제 대상 lot 존재»일 때만 body에 싣는다(`stock-transfer-tax-api-pre-deemed.ts` `appendPreDeemedBody` 패턴 — 단건 ②가 이미 같은 이유로 게이트).

### 3.4 결과 echo (UI 시니어 인계용 — 타입만)

```ts
// LotMatchingDetail.preDeemedClause1Summary?  (① 방식이 켜졌고 의제 대상 lot이 매칭된 경우만)
{
  method: "estimated" | "sale_case";
  deemedDate: string;                 // "1986-01-01" | "1985-01-01"
  deemedStdPerShare: number;          // 개산공제·환산 분자 (의제취득일 기준시가)
  clause1Shares: number;              // ① 채택 sub-lot 합 주식수
  clause2Shares: number;              // ② 채택(또는 ① 미산정) 의제 lot sub-lot 합
  clause1Amount: number;              // Σ ① 채택 sub-lot 취득가액
  stdBase: number;                    // Σ 의제일기준시가 × ① 채택 주식수 (개산공제 base — 총액 1회 floor)
  estimatedDeduction: number;         // floor(stdBase × 1%)
  expenseAttribution: { totalActual: number; clause1Side: number; otherSide: number };
  swap?: { estimatedSide: number; directSide: number; chosen: "direct" | "estimated" };
}
// MatchedSubLot.preDeemedSelected?: "clause1" | "clause2"  (의제 lot sub-lot만)
```

- 부분 swap 시 `result.acquisitionPrice`(총액 echo)와 실제 차감 취득가액이 갈린다. 단건 swap도 echo는 총액 그대로 두고 `swapApplied`로 알린다(P5 실측 §7.1) — lot 판도 같은 규약(echo 총액 + `preDeemedClause1Summary.swap`)을 쓰되 ⑦ 산식 카드가 역산하지 않도록 UI 시니어와 합의(`feedback_aggregate_display_rederives_engine_value`).

---

## 4. moving_avg·specific·fifo 정합

| 산정방법 | ① 반영 방식 | 비고 |
|---|---|---|
| fifo | sub-lot 생성 시점 `resolveSubLotBuyPrice(acq, trn, ctx)` | 가장 단순. 매칭(어느 lot이 어느 매도에 걸리나)은 단가와 독립이라 불변 |
| specific | 동일 — 사용자 지정 (acq, trn) 쌍마다 | 동일 |
| moving_avg | 풀 원가 재도출(`:492`) 안에서 lot별 `resolveSubLotBuyPrice(e.lot, trn, ctx)` | **매도마다 풀 평균이 달라진다**(①이 매도 lot별 환산이라). 평균 보존 로직(잔여지분 비례 감소 `:511~513`)은 불변. **P7 실측**: 현행 ② 풀에서 두 매도 모두 31,455(평균 보존). ① 환산이면 매도1·매도2의 `P1_j`가 달라 평균이 갈림 — 이월과세 1년 경계와 같은 구조라 허용 권장(Q-9). 매매사례 ①은 j 무관이라 영향 없음 |

보유기간·단기 30% 판정(`startDate`·`isShortTerm`)은 **불변** — ①은 취득가액 축이고 §104②는 의제취득일 처리(`applyDeemedAcquisitionDate`)가 별도로 한다.

---

## 5. 필요경비 — 대안 비교 (사용자 결정 Q-4·Q-5)

**전제(법)**: 취득가액이 ②면 필요경비 = **실비**(법 §97②1호 나목). ①이면 **개산공제**(법 §97②2호 본문 — 실비 불산입), ① **환산**이면 추가로 **단서**(환산+개산 < 실비 → 실비). 현행 lot 엔진은 실비 단일 합계(§2.4) — ① 채택 sub-lot이 생기면 «같은 종목 안에서 필요경비 기준이 둘로 갈림».

| 대안 | 내용 | 법령 근거 | 복잡도 | 평가 |
|---|---|---|---|---|
| **A (권장)** | `actualExpenses`를 **양도 주식수 비례**로 ① 채택 몫(`s1/sold`)과 나머지 몫(`s0/sold`)에 귀속(잔액 흡수 — `feedback_floor_residual_absorption`). 나머지 몫은 실비(§97②1호), ① 몫은 개산공제 `floor(Σ의제일기준시가×① 주식수 × 1%)`(총액 1회 floor — 단건과 동일 산식). **단서(환산만)** = ① 환산 sub-lot **합계** 단위로 «(Σ환산 + 개산공제) < ① 몫 실비»이면 ① 몫 실비로 대체(그 sub-lot들의 취득가액 차감 제외) | 귀속 규칙 **명문 없음**(확인 필요). 근거는 §97②의 구조(취득가액 방식별 필요경비) + 양도비(§97①3호)가 양도한 주식에 대응한다는 일반 원리. 이월과세 ①2호가 «매도된 몫만 산입»으로 같은 원리를 쓴다(`stock-carryover.ts` `accrueLotCarryoverExpense` 주석) | 중 — leaf 1개 + STEP 4 위임 + STEP 4.5 seam 1줄 | 중립적(실비를 한쪽에 몰지 않음). 자본적지출이 특정 lot 몫이면 부정확할 수 있음 — 입력 단위가 종목 합계라 한계 |
| B | 종목 단위 택일: ① 채택 sub-lot이 하나라도 있으면 **종목 전체**를 §97②2호(개산공제)로, 아니면 실비 | 명문 없음 — 「자산별」(§97②2호)을 종목으로 읽는 해석. 의제 lot 아닌 실가 lot의 취득가액(§97②1호 가목)과 모순 | 낮음 | **기각 권장** — 실가 lot에 개산공제를 씌워 §97②1호와 충돌 |
| C | ① 채택 sub-lot에 **개산공제를 더하되 실비는 전액 유지** | 법 §97②2호 본문은 실비 불산입 → 이중 공제 | 최저 | **기각** — 법 위반(과소 과세) |
| D | lot별 실비 입력 칸 추가(취득 lot별 자본적지출·매도 lot별 양도비) | 귀속이 입력으로 확정 → 명문 없음 문제 해소 | **높음** — 폼·⑧·⑫·결과 전부 신규. 증권거래세·수수료는 매도 lot 단위라 자연스러우나 UI 부담 큼 | Phase 2 후보. A를 먼저 하고 D로 정교화 가능(A의 기본값 = 비례) — 단 «기본값으로 자동 안분»은 `feedback_no_silent_apportion_fallback`과 충돌 소지(Q-4에서 정책 확인) |

**⚠️ 정책 충돌 점검**: A의 비례 귀속은 «빈 값 자동 채움»이 아니라 **사용자가 입력한 합계의 법적 귀속 규칙**이지만, 사용자가 자동 안분 금지를 엄격히 읽는다면 D(명시 입력)만 허용된다 — **Q-4의 핵심 질문**.

**단서 swap 판정 단위(Q-5)**: 단건은 종목 1건이라 «자산» = 종목이다. A는 ① 환산 sub-lot **합계**를 «환산취득가액으로 하는 자산»으로 본다(동일 종목 1양도). sub-lot 단위 판정은 매도 lot마다 환산 단가가 달라 일관되지 않아 비권장.

**perLotGain·세율 안분(Q-8)**: 현재도 실비는 perLotGain에 안 들어간다. 개산공제·단서도 같은 단순화를 유지(Phase 1 — 안분비 영향은 probe 후 확인 필요). 총 세액은 STEP 5(양도소득금액)에서 정확히 반영된다.

**부분 swap의 STEP 5 반영**: `swapApplied`(`:450`)는 «취득가액 전체 제외» 의미라 **재사용 금지**. 부분 swap은 STEP 4.5 seam(`ownAcquisitionPrice = acquisitionPrice`, `:423`)에서 «swap으로 제거된 ① 환산 취득가액»을 차감한다(1줄). 기신고 합산(§158②)과의 상호작용은 별건(① 환산 lot × 과점주주 합산 — 확인 필요).

---

## 6. 14 동기화 지점 영향 목록

> ⑤⑥⑦은 UI 시니어 담당 — 엔진 측이 제공할 계약만 적는다.

| # | 지점 | 변경 (Phase 1) |
|---|---|---|
| ① 폼 타입 | `calc-wizard-stock-form-types.ts`(594줄)·`calc-wizard-stock-types.ts` | `preDeemedLotClause1: "" \| "estimated" \| "sale_case"`(폼 전역) · `TransferLotForm.transferDatePriceAvg1Month?: string`. 재사용 필드(`acquisitionDatePriceAvg1Month`·`acquisitionMarketSample*`·`acquisitionYear*PerShare`)는 신규 없음 |
| ② initial | `calc-wizard-stock-form.ts` | 기본 `""`(= ② 만) — **3중 패턴 기본값 «미선택»을 ④·⑧과 동일하게** |
| ③ normalize | `calc-wizard-stock-normalize.ts`(705줄) | 신규 폼 필드 문자열화·lot 행 복원(`transferLots[]` 내부 신규 필드 포함). stale 가드 — 복원 시 방식이 `estimated`인데 비상장이면 `""`로 |
| ④ API 변환 | `stock-transfer-tax-api.ts`(**752줄 — 직접 추가 금지**) → 형제 `stock-transfer-tax-api-pre-deemed.ts` 확장 `appendPreDeemedLotClause1Body` | 게이트: lot 모드(분할 또는 lots-only) + 방식 선택 + 의제 대상 lot 존재일 때만 전송. 재사용 필드를 이 게이트 안에서만 싣는다. `mapAcquisitionLotToBody`는 변경 없음. 분할 `transferLots` 매핑(`:603~608`)에 lot별 `transferDatePriceAvg1Month` 추가. lots-only 합성 lot(`:277~284`)에 폼 전역 양도 종가평균 이식 |
| ⑤ UI | (UI 시니어) | 계약: ① 방식 라디오는 의제 대상 lot이 있을 때만 · 상장이면 환산만·비상장이면 매매사례만(Phase 1) · 매도 lot 행마다 양도 종가평균 칸 |
| ⑥ 사이드바 | (UI 시니어) | `previewSplitAllocation`이 엔진과 같은 ctx로 `totalAcquisitionPrice` 반환 — 부분 swap 시 «차감 취득가액»과 총액이 갈리는 점 합의 |
| ⑦ 결과 | (UI 시니어) | §3.4 echo 소비 |
| ⑧ validate | `stock-transfer-tax-validate-step1.ts`(610)·`-step2.ts`(608) — **둘 다 600줄대, 신규 로직은 형제 leaf `stock-pre-deemed-lot-clause1-validate.ts`로** | 오류: ①선택 + (상장 환산) 의제취득일 종가평균 ≤0/미입력 · 매도 lot 종가평균 ≤0 · (비상장 매매사례) 사례가 ≤0/보충평가 입력 부재(개산공제 base 0은 «과소 공제» 조용한 누락) · 상장+매매사례 선택 · 비상장+환산 선택(Phase 1 차단) · 자본조정 동반(Q-6 권장안 시). **UI가 막지 않는 조합은 ⑧이 막고(⑫와 같은 술어)** `feedback_ui_gate_removes_sole_input_path` 점검 |
| ⑨ Zod enum 메인 | `stock-transfer-tax-schema.ts` | `preDeemedLotClause1Schema = z.enum(["estimated","sale_case"]).optional()` |
| ⑩ Zod 컴패니언 | `aggregateStockItemSchema`(다종목) + `addStockRefines` | 다종목 item도 같은 필드·refine 상속 — `addStockRefines` 안 lot 분기(`refines.ts:407~427`)에 ① refine 추가(또는 형제 leaf 호출) |
| ⑪ acquisitionDate fallback | `stock-transfer-tax-api.ts:298~304`·`:619~631` | 변경 없음(의제 판정은 lot별 원값). 단 `transferDate` fallback(가장 오래된 매도일)이 §3.3 연혁 한계의 근거 — 문서화 |
| **⑫ Zod 입력 객체** | `stock-transfer-tax-schema.ts:181` `transferLotSchema` | `transferDatePriceAvg1Month: z.number().int().positive().optional()` + 메인 `preDeemedLotClause1`. **TypeScript 미감지 — grep 자가점검**. ⚠️ leaf 직접호출 anchor는 ⑫를 안 거친다(`feedback_leaf_anchor_skips_zod_layer`) → **전 스택 anchor(`runFullStack`) 필수** |
| **⑬ body spread** | `buildStockTransferApiBody`(④와 동일 파일 — 위 sibling) | `callStockTransferTaxAPI`(`stock-transfer-tax-api.ts:658~676`)는 `buildStockTransferApiBody`가 만든 body를 `JSON.stringify`로 통째 직렬화(개별 spread 없음 — grep 확인됨). ⑬의 실질 점검 대상은 body 빌더(④)다 |
| **⑭ Route 매핑** | `stock-transfer-engine-input.ts:148~160` | `preDeemedLotClause1: coerced.preDeemedLotClause1 as …` 추가. `transferLots`는 객체째 통과라 신규 lot 필드 자동 도달(단 `STOCK_DATE_FIELDS`에 날짜 신규 없음 — 변환 불요). `acquisitionDatePriceAvg1Month` 등 재사용 필드는 이미 매핑돼 있음(`:103` `acquisitionDatePriceAvg1Month` · `:116` `acquisitionYearNetIncomePerShare` · `:130` `acquisitionNetAssetOnlyReason` — grep 확인됨) |
| 엔진 | `stock-transfer-tax.ts`·`lot-allocation.ts`·신규 leaf | §3.2 |

**정책 3대 점검**: ① useEffect→store 미러링 금지 — 방식 기본값은 `""`, 폼 간 동기화(방식↔종가평균 칸 가시성)는 `useMemo`/onChange. ② 자동 안분 fallback 금지 — Q-4 · ①이 산정 안 되면 ②로 «조용히» 가지 말고 «① 미산정» 경고(현행 규약 유지, 단건 Q-6과 동일). ③ validate 동기화 — ⑧(step1·step2)·⑫가 **같은 술어**(신규 export 1개)를 공유. 이월과세 lot과 같은 방식으로 `PRE_DEEMED_LOT_*` 문구 상수화.

---

## 7. 케이스 인벤토리 · anchor 계획

### 7.1 probe 실측 (엔진 직접 호출, 2026-10-06, throwaway — 실행 후 삭제함)

공통: 코스피(대주주·비중소), 양도 2025-12-01 200,000/주, 1,000주(P1·P2·P5) 또는 1,500주(P3·P4·P6), 1980-06 매수 단가 10,000.

| ID | 입력 | 실측 |
|---|---|---|
| P1 (단건 ① 채택) | `estimated` · 의제일 종가평균 20,000 · 양도 종가평균 100,000 · 실가 10,000 | 취득가액 **40,000,000** · 개산공제 **200,000** · 필요경비 200,000 · 양도소득금액 159,800,000 · 과세표준 157,300,000 · 산출세액 **31,460,000** · 지방소득세(별도) |
| P2 (lot 1lot/1sale — **현행 ②만**) | 같은 자산을 split 1:1 | 취득가액 **12,910,000**(1주당 floor 12,910 — 단건 총액 floor 12,910,390과 390원 차) · 필요경비 0 · 산출세액 **36,918,000**. **①을 무시한 과대 과세 = 36,918,000 − 31,460,000 = 5,458,000** |
| P3 (혼합 lot 현행) | A 1980-06 600주×10,000 · B 1984-06 400주×30,000 · C 2010-03 1,000주×50,000 · 1,500주 FIFO · 실비 1,000,000 | 취득가액 **44,982,800**(A ② 12,910 · B ② **30,592** · C 500주×50,000) · 필요경비 1,000,000 · 산출세액 **50,303,440** |
| P4 (혼합 lot **목표값 시뮬**) | A·B = ① 40,000/주(= 200,000×20,000÷100,000) · C 그대로 · 필요경비 = 개산공제 200,000(=20,000×1,000주×1%) + 실비 귀속(1,000,000×500/1,500 = 333,334) = **533,334** — 엔진을 날짜 ≥2000년 lot(②·의제 미개입)+해당 단가·실비로 구동해 «파이프라인이 낼 세액»을 독립 산출 | 취득가액 **65,000,000** · 필요경비 533,334 · 양도소득금액 234,466,666 · 과세표준 231,966,666 · 산출세액 **46,393,330** (현행 대비 −3,910,110) |
| P5 (단건 ① + 단서 swap) | 의제일 종가평균 6,500 → ① 13,000,000 · 개산 65,000 · 실비 30,000,000 > 13,065,000 | `swapApplied=true` · `swapComparison {estimatedSide 13,065,000 · directSide 30,000,000 · chosen direct}` · **양도소득금액 170,000,000 = 200,000,000 − 30,000,000(취득가액 차감 제외)** · 산출세액 **33,500,000** · `acquisitionPrice` echo는 13,000,000(총액) |
| P6 (혼합 lot swap **목표값 시뮬**) | A·B 취득가 0(① 제거) + 실비 30,000,000 총액(① 몫 20,000,000 + 나머지 몫 10,000,000 = 총 실비 전액) | 취득가액 25,000,000 · 필요경비 30,000,000 · 양도소득금액 245,000,000 · 산출세액 **48,500,000** |
| P7 (moving_avg 현행) | A 1980 1,000주×10,000 · C 2010 1,000주×50,000 · 매도 500주(2024-05,150,000)+1,000주(2025-12,200,000) | 두 매도 모두 풀 평균 **31,455**(② 12,910 + 50,000의 평균 보존) — ① 환산이면 매도별 `P1_j`가 달라 평균이 갈려야 함(§4) |

> P4·P6은 «구현이 낼 값»의 **독립 산출**이다(같은 세율·기본공제 파이프라인에 목표 취득가·필요경비를 직접 주입). 구현이 이 값과 원 단위로 일치하는지가 anchor다. P6는 swap 시 실비 총액이 전부 공제되는 구조임을 보인다.
> ⚠️ P4·P6은 **Q-4(귀속 규칙) 결정 후에만 유효**하다 — 권장안 A(양도 주식수 비례) 기준값이다.

### 7.2 케이스 매트릭스 (행 ≥ 1 게이트)

| ID | 시장 | ① | 구성 | 기대 |
|---|---|---|---|---|
| LC1-1 | 코스피 | 환산 | 1lot/1sale ① > ② | **단건 P1과 패리티**: 취득 40,000,000 · 필요경비 200,000 · 세액 31,460,000 |
| LC1-2 | 코스피 | 환산 | 1lot/1sale ① < ② | 단건 Z1-3 패리티(② 채택 · 실비) — 취득가액은 per-share floor 한계만큼(≤주식수−1원) 차 |
| LC1-3 | 코스피 | 환산 | 혼합 3lot (P3 입력 + 의제일 20,000/양도 100,000) | P4: 취득 65,000,000 · 필요경비 533,334 · 세액 46,393,330 |
| LC1-4 | 코스피 | 환산 | ① 몫 실비 > 환산+개산 | 단서 swap — P6 값 / 단건 P5 패리티(1lot) |
| LC1-5 | 코스피 | 환산 | 한 lot ①·다른 lot ② (취득월별 ②가 다름) | sub-lot별 max · 합계 정합 |
| LC1-6 | 비상장 | 매매사례 | A ① 매매사례 > ② · 보충평가 입력으로 개산공제 base | 개산공제 = 보충평가 × 주식수 × 1% · **단서 없음**(매매사례는 환산 아님) |
| LC1-7 | 기타자산 | 매매사례 | 의제일 1985.1.1. | 직전 달 1984-12 · 같은 규칙 |
| LC1-8 | 비상장 | 환산 선택 | Phase 1 | ⑧⑫ 차단(⑧ ⇔ ⑫ 격자 일치) |
| LC1-9 | 코스피 | 매매사례 선택 | 상장 | 차단(영 §176의2③1호 괄호) |
| LC1-10 | 코스피 | 환산 | moving_avg 2매도 | 매도별 풀 평균 상이 · 평균 보존 불변식 |
| LC1-11 | 코스피 | 환산 | specific 지정 | 지정 쌍 단가 |
| LC1-12 | 코스피 | 환산 | 분할 2매도 lot(종가평균 각각) | 매도 lot별 `P1_j` |
| LC1-13 | 코스피 | 환산 | lots-only(합성 매도 1건) | 폼 전역 양도 종가평균이 합성 lot에 이식 |
| LC1-14 | 코스피 | 환산 | 의제 lot 아님만(2000년대 lot) + ① 선택 | 변화 0(회귀) · «적용 대상 없음» 안내 |
| LC1-15 | 코스피 | 환산 | 상속·증여·이월과세 lot 혼재 | 해당 lot 불변(① 비대상) |
| LC1-16 | 코스피 | 환산 | ① 선택 + 입력 누락 | ⑧⑫ 차단 / 엔진 직접호출은 ②만 + «① 미산정» 경고 |
| LC1-17 | 코스피 | 환산 | 자본조정 동반 | Q-6 결과(차단 권장) |
| LC1-18 | 코스피 | 없음(미선택) | 현행 | **PR #2006 anchor 전건 불변**(`stock-pre-deemed-lots.anchor` PL-1~6) |
| LC1-19 | 코스피 | 환산 | 동액(① = ②) | ② 채택(단건 Z1-7) · 개산공제 없음 |
| LC1-20 | 코스피 | 환산 | 과세 무상주(bonus_taxed)·유상증자 lot | 매수와 같이 ① 비교(§176의2④ 예외 — `isBonusTaxedEstimationBlocked` 주석) |

### 7.3 Pre-Do anchor (Do 진입 전 — `feedback_pre_anchor_verification`)

1. **LC1-1 RED 먼저**: lot 1:1 입력 + ① 환산 입력 → 현행은 12,910,000/36,918,000(P2) — 기대 40,000,000/31,460,000과 어긋남을 확인.
2. **LC1-3 RED**: 현행 50,303,440 vs 목표 46,393,330.
3. 전 스택(`buildStockTransferApiBody` → `addStockRefines(stockTransferInputSchema)` → `coerceDates` → `buildEngineInput` → 엔진) 전수 — `__tests__/calc/stock-pre-deemed-lots.anchor.test.ts`의 `runFullStack`·`lotsOnlyForm` 패턴 재사용.
4. 단건 ↔ lot **패리티 쌍** anchor: 같은 자산을 단건 모드와 1lot/1sale로 돌려 취득가액·개산공제·필요경비·swap·세액 비교(per-share floor 오차 허용치를 «≤ 주식수−1원»으로 명시 — `feedback_range_assertion_misses_spec_violation`에 따라 오차는 범위가 아니라 **정확한 기대 차이**로 단언).

### 7.4 회귀 게이트·뮤테이션

- `npx vitest run __tests__/tax-engine/stock-transfer/ __tests__/calc/` 전체(lot-allocation·이월과세 lot·희석·PL-1~6·단건 Z1) **불변** — 7번째 인자 optional이므로.
- 뮤테이션: ① max → ② 고정 / ① 고정 · ① 몫 귀속 비율 반전 · 단서 부등호(`<` ↔ `<=`) · ctx 미전달(preview만) · moving_avg 재도출을 `trn.transferDate`로 되돌림 · 개산공제 총액 floor → sub-lot별 floor.
- 부정형 anchor(차단 케이스)에는 긍정 짝 동반(`feedback_negative_anchor_needs_positive_twin`): LC1-8·9에는 LC1-1·6.

---

## 8. 결정 필요 (Q)

| ID | 질문 | 선택지 | 권장 |
|---|---|---|---|
| **Q-1** | ① 산정 범위 | (A) 상장 환산 + 비상장·기타 매매사례(Phase 1) / 비상장 환산은 Phase 2 (B) 비상장 환산까지 한 번에 (C) 매매사례만 | **(A)** — 비상장 환산은 매도 lot별 양도 당시 보충평가(순손익·순자산·사유)가 필요해 입력 폭이 3배. 별건으로 계획서 분리 |
| **Q-2** | 입력 단위 | (a) 의제취득일 기준시가·매매사례 = 종목 단위 + 양도 종가평균 = 매도 lot별 (b) 매도 lot별 양도 «기준시가 직접 입력»(상장·비상장 공용 1필드) | **(a)** — 상장은 종가평균 계산 규칙이 있어 엔진이 검증 가능. (b)는 비상장 값을 엔진이 검증 못 함 |
| **Q-3** | sub-lot 1주당 정수 한계 | (a) 1주당 floor(② 현행과 동일 — 오차 ≤ 주식수−1원/sub-lot) (b) `MatchedSubLot`에 취득가액 «총액» 필드 추가(원단위 일치 · 소비처 6곳: `lot-allocation.ts:234` 합계·`stock-acquisition-basis.ts:86`·`exempt-informational-acquisition.ts:63`·`SplitAllocationPreviewCard`·`LotMatchingDetailCard` 등 수정) | **(a)** — ②가 이미 같은 한계로 머지됨. 개산공제는 별개로 총액 1회 floor(단건과 동일). (b)는 필요 시 후속 |
| **Q-4** | 필요경비 귀속(§5) | (A) 양도 주식수 비례 귀속 (D) lot별 실비 입력(귀속을 입력으로 확정) (B·C 기각) | **(A)** — 단 «자동 안분 금지» 정책을 법적 귀속 규칙까지 포함해 엄격히 읽으면 (D). **명문·해석례 미확보(확인 필요)** — 국세청 예규가 있으면 대조 |
| **Q-5** | 단서 swap 판정 단위 | 종목(① 환산 sub-lot 합계) / sub-lot 단위 | **종목 합계** — 단건과 같은 «자산» 단위, 매도 lot별 환산 단가 불일치 회피 |
| **Q-6** | 자본조정(무상증자·감자) 동반 + ① 환산 | (a) ⑧⑫ 차단 (b) 희석 후 단위로 분자 환산(근거 해석 미확보) | **(a)** — 분자(의제취득일 시점 1주당 기준시가)와 분모·양도가(희석 후)의 주식수 단위가 갈림. 단건도 같은 문제를 표시 전용으로 넘겼음(확인 필요 — 별건) |
| **Q-7** | ① 방식 미선택 시 | 현행 ②만 + «① 미산정» 경고 유지(단건 Q-6과 동일) / ① 필수 | **현행 유지** — 의제일 기준시가 자료가 없는 경우가 대부분 |
| **Q-8** | `perLotGain`(세율 안분 기준)에 개산공제·swap 반영 | Phase 1 미반영(실비와 동일 단순화) / 반영 | **미반영** — 총세액은 STEP 5가 정확, 단기·장기 혼합 안분비만 근사. **probe로 영향 확인 필요**(단기 lot + ① lot 혼재 케이스) |
| **Q-9** | moving_avg + ① 환산의 매도별 풀 평균 변동 | 허용 + 고지 / 차단 | **허용 + 고지** — 이월과세 1년 경계가 같은 구조로 이미 허용됨 |
| **Q-10** | 비과세(K-OTC) echo의 ② 미적용 raw lots(`exempt-result.ts:64`) | 이번에 같은 헬퍼로 통일 / 별건 | **같은 PR에서 통일**(ctx 빌더 호출 3곳 동일 — single-source). 세액 영향 0, echo만 |

---

## 9. 리스크·확인 필요 요약

1. 필요경비 귀속(Q-4) — 법령 명문·해석례 없음. 어떤 안이든 «법 근거 없이 불리 적용 금지»에 걸릴 수 있어 계획서에 근거 한계를 결과 경고 문구로도 남긴다(`feedback_unverified_authority_blocks_tax_change` — **본문 미확인이면 착수 조건**: Q-4 사용자 승인 필요).
2. `stock-transfer-tax.ts`(743줄)·`stock-transfer-tax-api.ts`(752줄) — 직접 증설 금지, 위임·sibling. step1/step2 validate 600줄대도 leaf 분리.
3. `calcAcquisitionStdPerShareSupplementary`는 `input.transferDate`로 가중치 연혁 판정 — lot 모드에서는 ⑪ fallback(가장 오래된 매도일). 매도 lot이 2007.2.28. 경계를 가로지르면 하나로 고정(확인 필요).
4. 과점주주 §158② 기신고 합산(`priorAggregation`) × ① 환산 lot — 환산은 «당회차» 산정인데 합산 seam 이전이라 일단 정합으로 보이나 **미검증**(확인 필요).
5. 다종목 합산(`stock-transfer-aggregate*.ts`)은 `calculateStockTransferTaxInternal`을 종목별 재호출 — ctx가 엔진 내부에서 만들어지므로 자동 상속(확인 필요 — aggregate anchor로 검증).
6. UI 인계: 부분 swap 시 `result.acquisitionPrice`(총액 echo) ≠ 차감 취득가액 — 결과 카드가 역산하지 않도록 `preDeemedClause1Summary` 소비(§3.4).

---

## 10. 실행 단계 (Q 확정 후)

```
1. Q-1~Q-10 확정 + Q-4는 국세청 예규 대조                       → verify: §8 갱신
2. Pre-Do RED: LC1-1·LC1-3 (현행 P2·P3 값 확인)                 → verify: 실패 사유가 §2와 일치
3. 엔진: leaf(ctx·resolveSubLotBuyPrice·expenses) + allocateLots 7번째 인자 + STEP 4/4.5 위임 + preview·exempt 3곳 같은 빌더
                                                                → verify: LC1-1~7·10~13·19·20, PL-1~6·이월과세·희석 anchor 불변
4. ⑨⑫⑭ Zod·engine-input + ⑧ validate leaf(step1·step2·⑫ 같은 술어)  → verify: ⑧↔⑫ 격자 전수 대조(LC1-8·9·16·17)
5. ④⑬ body 게이트(sibling) + 전 스택 anchor                       → verify: runFullStack 패리티 쌍
6. (UI 시니어) ①②③⑤⑥⑦ + 결과 echo                              → verify: Playwright 폼→결과·Network request body
7. 뮤테이션 probe · 전체 vitest(`__tests__/tax-engine/stock-transfer/` `__tests__/calc/`) · tsc · lint · verify:legal(법 §97②·영 §163⑥ manifest 확인)
```

---

## 11. 계약 (UI 시니어 인계 — 확정)

### 11.1 배선 분담

| 지점 | 담당 | 상태 |
|---|---|---|
| 엔진 · ⑨⑩⑪⑫⑭ · ⑧⑫ 공용 검사 | 엔진 시니어 | **완료** |
| ① 폼 타입 · ② initial · ③ normalize · ④ API body · ⑧ validate(step2 연결) | 엔진 시니어(이번에 같이 처리) | **완료** — UI 시니어는 이 필드명을 그대로 쓴다 |
| ⑤ 위젯(카드·라디오·키움·`SplitAllocationPreviewCard` 열) · ⑥ 사이드바(lots-only 갭 포함) · ⑦ 결과 카드·신고서 라벨 | UI 시니어 | 미착수 |

### 11.2 폼 필드 · ③ · ④ (확정 이름)

| 필드 | 위치 | 값 | 비고 |
|---|---|---|---|
| `preDeemedLotClause1Mode` | `StockTransferFormData` (`calc-wizard-stock-form-types.ts`) | `"none" \| "estimated" \| "sale_case"` | factory 기본 `"none"`(`calc-wizard-stock-form.ts`) · ③ 미지값 → `"none"`. **UI는 `|| "none"` 쓰지 말고 값 직접 사용**(3중 패턴) |
| `transferLots[i].transferStdPricePerShare` | `TransferLotForm` (`calc-wizard-stock-types.ts`) — optional string | 양도 당시 1주당 기준시가(상장 = 양도일 이전 1개월 종가평균) | ③ `normalizeTransferLots` 가 보존(명시 나열 — 신규 필드 소거 방지 완료) |
| 재사용 | 폼 전역 | `acquisitionDatePriceAvg1Month`(의제취득일 이전 1개월 종가평균 — estimated) · `transferDatePriceAvg1Month`(**lots-only** 양도 당시 기준시가 — ④가 합성 매도 lot에 이식) · `acquisitionMarketSamplePrice`·`acquisitionMarketSampleDate`(sale_case) · `acquisitionYearNetIncomePerShare`·`acquisitionYearNetAssetPerShare`(sale_case 개산공제 base — **Phase 1은 직접 입력(simple) 값만 전송**, 결산서 full 모드 어댑터는 연결하지 않았다) | |

**④ 전송 게이트** (`appendPreDeemedLotClause1Body` — `stock-transfer-tax-api-pre-deemed.ts`): `isLotsModeForm(form)`(분할 또는 lots-only) ∧ 방식 ≠ none ∧ `preDeemedLotIndexesForm(form).length ≥ 1`. 아니면 어떤 ① 필드도 body에 싣지 않는다(stale 방지). body 키: `preDeemedLotClause1` · (estimated) `acquisitionDatePriceAvg1Month` + `transferLots[i].transferStdPricePerShare` · (sale_case) `acquisitionMarketSamplePrice/Date` + `acquisitionYearNetIncomePerShare`/`NetAssetPerShare`.
**호출 위치**: `buildStockTransferApiBody` 맨 끝(분할 `transferLots` 생성 뒤) 1줄 — 본체는 755줄이라 sibling에 로직을 뒀다.

### 11.3 UI가 쓸 export (single-source — 손으로 재구현 금지)

| 용도 | export | 위치 |
|---|---|---|
| ⑤ 카드 노출 조건 · lot 칩 | `isLotsModeForm(form)` · `preDeemedLotIndexesForm(form)` | `lib/calc/stock-transfer-section94-4-form.ts` |
| ⑤ 허용 조합(상장→환산만 · 비상장·기타→매매사례만) | `isLotClause1MethodAllowed(marketType, method)` → `"ok" \| "unlisted_estimated" \| "listed_sale_case" \| "off"` | `lib/tax-engine/stock-transfer/stock-pre-deemed-lot-clause1.ts` |
| ⑤ 안내·오류 문구 | `PRE_DEEMED_LOT_UNLISTED_ESTIMATED_MESSAGE` · `…LISTED_SALE_CASE_MESSAGE` · `…CAPITAL_ADJUSTMENT_MESSAGE` | 위 파일 |
| ⑤ 어느 매도 lot이 기준시가가 필요한가 | `transferLotsTouchingPreDeemedLots(engineInput, is94_4)` → 입력 순서 인덱스 배열(엔진 `allocateLots` 호출 기록 — 매칭 단일 소스) | `…/stock-pre-deemed-lot-clause1-check.ts` |
| ⑥ 미리보기 | `previewSplitAllocation(form)` — **이미 같은 ctx 빌더 사용**(자동). 반환 `LotMatchingDetail`에 `preDeemedClause1Summary`·`matched[].preDeemedSelected` 포함 | `lib/calc/stock-split-preview.ts` |
| ⑧ 폼 검증 | `validatePreDeemedLotClause1(form)` — step2가 이미 호출(분할은 조기 반환 앞 · lots-only 는 lot 블록). 오류 field: `preDeemedLotClause1` · `acquisitionDatePriceAvg1Month` · `acquisitionMarketSamplePrice` · `acquisitionYearNetAssetPerShare` · `transferLots[i].transferStdPricePerShare` (lots-only 는 `transferDatePriceAvg1Month`) | `lib/calc/stock-transfer-tax-validate-pre-deemed-lots.ts` |

⚠️ **⑧은 Step2 단계 검증이다** — ① 입력 칸은 Step2 카드에 둔다(`validate-step2` 오류가 그 단계에서 입력칸으로 이동).

### 11.4 결과 echo 타입 (`stock-transfer.types.ts`)

- `StockTransferResult.preDeemedLotsDetail?` — 의제 lot(② 적용)이 하나라도 있을 때:
  - `deemedDate` · `lots[]`(`lotIndex`·`lotId`·`acquisitionMonth`·`originalPerShare`·`clause2PerShare`·`ppiAtAcquisition`·`ppiAtDeemedPrev`)
  - `clause1?`(① 방식 ctx가 만들어졌을 때): `method` · `deemedStdPerShare` · `soldShares` · `clause1Shares` · `otherShares` · `clause1Amount` · `unresolvedShares?` · `pooled` · `settlement?`
  - `settlement?`(① 채택 sub-lot ≥ 1): `totalActualExpenses` · **`clause1SideActual`/`otherSideActual`(귀속 근거 — 양도 주식수 비례, 잔액은 otherSide 가 흡수)** · `estimatedBase` · `estimatedDeduction` · `swapApplied` · `swapComparison?` · `swapRemovedAcquisition` · `expenses`
- `MatchedSubLot`(fifo·specific, 의제 lot sub-lot만): `acquisitionLotId` · `transferLotId` · `preDeemedSelected` · `preDeemedClause1PerShare?` · `preDeemedClause2PerShare`. **moving_avg는 sub-lot 선택이 없다**(`clause1.pooled === true` — 카드가 «풀 평균» 문구로 대체).
- `LotMatchingDetail.preDeemedClause1Summary?` — 미리보기·엔진 공통 집계(위 `clause1`의 입력).
- **표시 일치 주의**: 부분 swap이면 `result.acquisitionPrice`는 **swap으로 제거된 ① 환산 취득가액을 뺀 값**(= `transferPrice − acquisitionPrice − expenses = transferIncome` 항등식이 성립하도록)이고, `lotMatchingDetail.totalAcquisitionPrice`(미리보기·사이드바)는 총액이다. 둘의 차 = `settlement.swapRemovedAcquisition`. `result.swapApplied`는 부분 swap에서 **false**(전체 제거 의미라 재사용하지 않음) — 화면은 `settlement.swapApplied`를 본다. 사이드바가 swap 이후 값을 보이려면 `preDeemedClause1Summary` + 정산 값으로 직접 echo(역산 금지).
- 경고(문자열): ① 채택 요약(귀속 기준 «법령상 명문 없음» 문구 포함) · swap · moving_avg 풀 안분 · `unresolvedShares`(기준시가 누락→②) · 엔진 직접 호출 방어(비상장 환산·상장 매매사례·자본조정·입력 누락·의제 lot 없음).
- 신고서 11행: lot 모드는 `usedEstimatedAcquisition=false` 유지(권장 그대로) — 라벨만 UI가 정한다.

---

## 12. 구현 결과 (2026-10-06)

### 12.1 변경 파일

엔진: `stock-pre-deemed-lot-clause1.ts` 🆕(ctx·sub-lot 단가·누적기·정산) · `stock-pre-deemed-lot-clause1-check.ts` 🆕(⑧⑫ 공용 검사·매도 lot 프로브) · `stock-pre-deemed-lots-detail.ts` 🆕(echo·경고 조립) · `stock-transfer-split-prepare.ts` 🆕(split 사전 계산 추출 — `stock-transfer-tax.ts` 743→748줄 유지) · `lot-allocation.ts`(7번째 인자 + 3 매칭 · +~50줄 → ≈ 600줄) · `stock-pre-deemed-acquisition.ts`(표지·details·`isPreDeemedPurchaseLot` export) · `stock-transfer-tax.ts`(STEP 4 정산 위임·STEP 4.5 부분 swap 차감·echo) · `stock-transfer-exempt-result.ts`(Q-10 같은 헬퍼) · `types/stock-transfer.types.ts`(타입 전용).
API: `stock-transfer-tax-schema.ts`(⑨⑫) · `stock-transfer-engine-input.ts`(⑭) · `stock-transfer-tax-refines.ts` + `stock-transfer-tax-refines-lot-clause1.ts` 🆕(⑩⑫ refine).
클라이언트: ①②③ `calc-wizard-stock-form-types.ts`·`calc-wizard-stock-types.ts`·`calc-wizard-stock-form.ts`·`calc-wizard-stock-normalize.ts` · ④ `stock-transfer-tax-api-pre-deemed.ts`(+본체 3줄) · ⑧ `stock-transfer-tax-validate-pre-deemed-lots.ts` 🆕 + `validate-step2.ts`(호출 2곳) · `stock-transfer-section94-4-form.ts`(`isLotsModeForm`·`preDeemedLotIndexesForm`) · `stock-split-preview.ts`.
주석: `lib/calc/stock-acquisition-cause.ts`(주식배당 액면금액).
테스트: `__tests__/tax-engine/stock-transfer/pre-deemed-lots-clause1.anchor.test.ts`(엔진 25건) · `__tests__/calc/stock-pre-deemed-lots-clause1.anchor.test.ts`(전 스택 25건).

### 12.2 anchor (probe 실측 → 구현 일치)

| ID | 값 |
|---|---|
| Pre-Do RED(P2) | 현행 12,910,000 / 36,918,000 — LC1-1 기대 40,000,000 / 31,460,000과 어긋남 확인 후 구현 |
| LC1-1 단건 P1 패리티 | 취득 40,000,000 · 개산공제 200,000 · 양도소득금액 159,800,000 · 세액 31,460,000 |
| LC1-2 | ② 채택 12,910,000 · 세액 36,918,000 |
| LC1-3 혼합 | 취득 65,000,000 · 필요경비 533,334(개산 200,000 + 귀속 실비 333,334) · 세액 46,393,330 |
| LC1-4 swap | 단건 P5 패리티 양도소득금액 170,000,000 · 세액 33,500,000 / 혼합 P6 245,000,000 · 48,500,000 / 경계 13,065,000(동률 본문) · 13,065,001(swap) |
| LC1-5 | A ① · B ② — 취득 73,474,000 · 필요경비 720,000 (B ② = floor(60,000 × 5057 ÷ 4959) = 61,185) |
| LC1-6 매매사례 | 취득 60,000,000 · 개산 1,000,000 · 단건 sale_case와 취득·필요경비·양도소득금액·세액 동일 |
| LC1-10 moving_avg | 매도1 풀평균 40,000 · 매도2 45,000 · 취득 65,000,000 · ① 몫 750주/27,500,000 · 개산 150,000 |
| LC1-11·12 | specific 44,000,000 · 매도 2건(분모 상이) 28,000,000 |
| LC1-15b | 이월과세 lot 혼재 — 증여자 자본적지출 400,000 은 그 외 몫 전액 → 필요경비 520,000 |
| LC1-20 | K-OTC 비과세 echo — ② 12,910,000 / ① 60,000,000 |
| FS 격자 | ⑧ step2 ⇔ ⑫ Zod 16케이스(정상 5 · 차단 11) 메시지 일치 |

### 12.3 mutation (26종 전수 KILLED)

①②③ 선택 로직(동액·항상 ②·항상 ①) · 실비 귀속 · swap 부등호/제거분/단서 매매사례 확대 · 개산 base · moving_avg ctx 무시 · ctx 미전달(엔진 prepare·미리보기·비과세 echo) · 안분 반올림 · STEP 4.5 부분 swap · 증여자 capex 누락 · ⑫ refine 미호출 · ⑧ step2 분할/lots-only 미호출 · ④ 게이트·합성 lot 이식 · ⑫ lot 스키마 strip · ⑭ 매핑 누락 · ③ 미지값/lot 필드 소거 · 프로브(전 매도 필수) · 자본조정 차단 제거. (`/tmp/mutate.py` — 백업 `cp` + sha 검증 복원, `git checkout` 미사용.) 초기 1건(증여자 capex 누락)이 생존해 LC1-15b를 추가한 뒤 KILLED.

### 12.4 남은 확인 필요

1. **실비 귀속(양도 주식수 비례)의 법령·해석례 부재** — 사용자 결정 A안으로 구현했고 결과 경고에 «법령상 명문 없음»을 남겼다. 국세청 예규 대조는 미수행.
2. moving_avg의 ① 몫은 풀 지분 비율(float) 안분이라 정수 한계가 소수 주식수로 나타날 수 있다(anchor는 정수로 떨어지는 사례). 임의 입력에서의 오차 크기는 미측정.
3. `calcAcquisitionStdPerShareSupplementary`의 가중치 연혁이 lot 모드에서는 ⑪ fallback(가장 오래된 매도일) 기준 — 2007.2.28. 경계 가로지르는 매도 lot의 경우.
4. 과점주주 §158② 기신고 합산 × ① 환산 lot 상호작용 — 미검증.
5. 브라우저(Playwright) 폼→계산→결과·Network request body 확인은 UI(⑤) 선행이라 **미수행**.
6. `perLotGain`(세율 안분 기준)에 개산공제·swap 미반영(Q-8) — 단기+① lot 혼재 시 안분비 영향 미측정.

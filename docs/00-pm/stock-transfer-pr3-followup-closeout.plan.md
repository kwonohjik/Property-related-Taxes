# 주식 양도소득세 — PR-3 잔여 종결 + 후속 트랙 잔여 계획서 v1

> 작성일: 2026-08-27 · 기준 commit `e8071a04` (origin/master)
> 작성자: Claude (Opus 5)
> 트리거: 결과화면 로드맵 카드(`PrRoadmapCard`)의 **PR-3 = 현재 / 후속 = 대기** 표시
> **모든 현행 인용은 grep·Read 실측**(추정 0). 미검증은 §4 V-n 레지스터에 명시.

---

## 0. 착수 전 실측이 전제를 뒤집었다 — 먼저 읽을 것

로드맵 카드는 **stale 하드코딩**이다.

```
components/calc/results/StockTransferTaxResultViewHelpers.tsx:312-319
  { label: "PR-3", desc: "다자산·가산세·신고서", status: "current" },
  { label: "후속", desc: "§97의2·국외전출세·해외주식", status: "pending" },
```

`status` 는 계산 결과·구현 현황과 **아무 연결이 없는 리터럴**이다. 실측 결과 PR-3 본체와
「후속」 3개 축은 **이미 구현·머지되어 있다**:

| 카드 라벨 | 실측 현황 | 근거 |
|---|---|---|
| PR-3 「다자산」 | ✅ 구현 — `savedItems` 다종목 폼 + 목록 카드 + 합산 API + 합산 결과 카드 | `lib/stores/calc-wizard-stock-store.ts:120·181-208` · `components/calc/stock-transfer/StockItemListCard.tsx` · `lib/calc/stock-transfer-tax-api.ts:723-745` · `app/calc/stock-transfer-tax/StockTransferTaxCalculator.tsx:145-146·270-289` (PR #1225) |
| PR-3 「가산세」 | ✅ 매트릭스 구현 + UI 라벨·근거조문 정정 완료 | `lib/tax-engine/stock-transfer/stock-transfer-finalize.ts:46-86` · `app/calc/stock-transfer-tax/steps/Step3.tsx:316-384` |
| PR-3 「신고서」 | ✅ 별지84호 다종목 열 + ⑫ 외국납부세액공제 행 | `components/calc/stock-transfer/StockFilingFormTable.tsx` (PR #1228) |
| 후속 「§97의2」 | ✅ 본체 + lot 판 ①2호·①3호 + A/B 비교 카드 | `lib/tax-engine/stock-transfer/stock-carryover.ts` (PR #1209·#1210) |
| 후속 「국외전출세」 | ✅ `exit-tax.ts` + 전용 Zod·route 분기 + `ExitTaxBlock` | `lib/tax-engine/stock-transfer/exit-tax.ts` · `components/calc/stock-transfer/ExitTaxBlock.tsx` |
| 후속 「해외주식」 | ✅ `foreign-stock.ts` + §118의6 A×B/C 한도 + 다종목 편입 | `lib/tax-engine/stock-transfer/foreign-stock.ts` · `foreign-tax-credit-limit.ts` (PR #1221~#1225) |

⇒ **본 계획서는 「PR-3 신규 구현」이 아니라 「PR-3·후속 잔여 갭 종결 + 로드맵 표시 정정」이다.**
구 계획서 `docs/00-pm/stock-transfer-pr3.plan.md`(2026-05-19)의 R-1~R-12 중 **미종결분만** 아래로 승계한다.

### 0.1 구 계획서 R-1~R-12 재측정

| 구 항목 | 판정 | 근거 (실측) |
|---|---|---|
| R-1 다종목 폼 상태 | ✅ 종결(설계와 다른 방식) | `stockItems[]` 분해 대신 **`savedItems: StockTransferFormData[]`** 채택 — 240필드 종목 분해를 포기하고 「편집기 1 + 확정 목록 N」 구조(`calc-wizard-stock-store.ts:109-120`) |
| R-2 다종목 마법사 UI | ✅ 종결 | `StockItemListCard` 1단계·3단계 2회 렌더(`StockTransferTaxCalculator.tsx:218-268`) |
| R-3 API 변환 | ✅ 종결 | `callStockTransferTaxAggregateAPI`(`stock-transfer-tax-api.ts:723`) + `assertNoExitTaxItem`(:752) |
| R-4 다종목 validation | 🔴 **잔여 → A-3** | `stock-transfer-tax-validate.ts` 에 `savedItems` 참조 **0건**. 확정 게이트는 종목명·시장뿐(`StockTransferTaxCalculator.tsx:62-63`) |
| R-5 다자산 결과 카드 | ✅ 종결 | `StockAggregateSummaryCard`(:271-276) + `Step4 aggregate`(:284-288) |
| R-6 다자산 사이드바 | 🔴 **잔여 → A-1** | `StockSidebar.tsx:33-34` 가 `formData`·`result`(**편집 중 1건**)만 읽는다. `savedItems` 참조 0건 |
| R-7 신고서 다자산 anchor | ✅ 종결 | PR #1228 (행수 가드 `32 + 다종목 + 국외` 포함) |
| R-8 케이스 21 UI 차단 | ✅ 종결(범위 소멸) | `foreign_stock` 정식 지원으로 §94①3다목이 과세 경로가 됨. `out_of_scope_foreign` 은 legacy 차단 분기로만 잔존(`stock-classification.ts:363-387`) |
| R-9 가산세 라벨·근거조문 | ✅ 종결 | `Step3.tsx:316-384` 국세기본법 §47조의2·§47조의3 축자 표기 |
| R-10 증권거래세 다자산 | 🔴 **잔여 → A-2** | 엔진은 `totalSecuritiesTransactionTax` 를 **계산**하는데(`stock-transfer-aggregate.ts:412·716`) **UI 참조 0건** — 화면·신고서 어디에도 안 나온다 |
| R-11 로드맵 카드 갱신 | 🔴 **잔여 → A-4** | 위 §0 |
| R-12 가산세 적용 단위 | 🟡 **미결 → A-5·A-6·A-7** | Step3 안내는 「**신고서 1매 단위**」(`Step3.tsx:322`)인데 엔진은 **종목별 계산 후 합산**(`stock-transfer-aggregate.ts:680-682`) |

---

## 1. 잔여 인벤토리

### Track A — PR-3 잔여 (다자산 표시축 + 가산세축)

| # | 항목 | 현행 (실측) | 성격 | 규모 |
|---|---|---|---|---|
| **A-1** | **⑥ 사이드바가 다종목을 못 본다** | `StockSidebar.tsx:33-34` — 확정 종목 N건이 합계에 미반영. 3종목 확정 후에도 사이드바는 편집 중 1건만 표시 | 표시 (오해 유발) | 소~중 |
| **A-2** | **증권거래세 다종목 합계 미표시** | 엔진 `totalSecuritiesTransactionTax` 산출(`stock-transfer-aggregate.ts:412·716`) ↔ **UI 참조 0건**. 단건 카드는 Step3(:200)·결과뷰(:355)에만 | 표시 (dead 필드) | 소 |
| **A-3** | **확정 종목 ⑧ 검증 부재** | 확정 게이트 = 종목명+시장 2개뿐(`StockTransferTaxCalculator.tsx:62-63`, 주석은 「route Zod가 종목별 검증」 위임). 금액 미입력 종목이 목록에 남으면 **계산 시점 400** | UX 차단 품질 | 소~중 |
| **A-4** | **로드맵 카드 stale** | `...ResultViewHelpers.tsx:312-319` 리터럴 | 표시 | 소 |
| **A-5** | **납부지연가산세 §47조의4 미구현** | `stock-transfer-finalize.ts:112` — `latePaymentPenalty = 0` placeholder. 헤더 주석(:9)이 「PR-3 범위 외」로 명시 | **기능 미구현** (세액 과소 가능) | 중 |
| **A-6** | **가산세 과세표준 = 산출세액 전액** | `stock-transfer-finalize.ts:84` `calculatedTax × rate`. 국세기본법 §47조의3①은 「**과소신고납부세액등**」 기준이라 일부만 과소신고한 경우 **과대** 가능. 「과소신고분」 입력축 부재 | **법령 정합** (세액 변경 가능) | 중 |
| **A-7** | **다종목 가산세 단위 불일치** | Step3 안내 「신고서 1매 단위」(:322) ↔ 엔진 종목별 산정 후 합산(`aggregate.ts:680-682`, 종목마다 `floorTen`) | 정합·표시 | 소 |
| **A-8** | **국외주식 종목은 가산세 0** | `aggregate.ts:541-556` — `ForeignStockInput` 에 신고축 필드가 없어 국외 종목 `underReportPenalty: 0` 고정. `foreign-stock-aggregate-adapter.ts:30` 이 「기존 갭」으로 명시 | **세액 과소** (혼합 신고) | 중 |

### Track B — 후속 트랙 잔여

| # | 항목 | 현행 (실측) | 성격 | 규모 |
|---|---|---|---|---|
| **B-1** | **상장 벤처 ATS 거래 축 부재** (KOTC 트랙 R-1) | 조특법 §14①7호 → 증권거래세법 §3조1호나목 → 시행령 §1조의2① → 자본시장법령 **§78(ATS·상장)** 또는 §178①(K-OTC·비상장). 현행은 `isKOTCTrading` 토글 자기선언 | 법령축 정밀화 | 중 |
| **B-2** | **`listed_otc_non_major` ↔ `listed_off_market_non_major` 중복** (KOTC R-2) | 세율 fall-through(`stock-transfer-rate-calc.ts:114-115`), 조문도 동일. union 제거는 **저장 이력 `taxCategory` 호환성** 동반 | 기술부채 | 중 |
| **B-3** | **증권거래세 2021-01-01 이전 세율 연혁 미지원** | `securities-transaction-tax.ts:85·196` — 미만 양도는 현행 구간 fallback + 경고(A-30) | 연혁 데이터 | 중 |
| **B-4** | **이월과세 lot 필드 dead** | `AcquisitionLot.donorCapitalExpenditure`·`donorGiftTaxAmount` 는 **읽는 곳이 없다**(split 필요경비가 종목축 `actualExpenses` 하나) — 타입 주석 🟠 | dead field | 소~중 |
| **B-5** | **국외전출세 잔여 2건** | ① 기준환율 수동 입력(한국은행 API 미연동) ② 보유현황 신고서 자동생성 미제공 — `stock-transfer-exit-tax-foreign-stock.plan.md:516·530` | 기능 (v1 의도적 이연) | 중 |

> **§118의6 B/C 안분 트랙은 잔여 없음** — 계획서 Phase 0b~7 전건 종결(메모리 `project_foreign_stock_118_6_bc_apportionment`).

---

## 2. 우선순위 권고

```
1군 (세액 변경 — 법령 정합)    A-8 → A-6 → A-5
2군 (표시·정합 — 저위험 소규모) A-4 → A-2 → A-1 → A-7 → A-3
3군 (후속 트랙)                B-1 → B-4 → B-3 → B-2 → B-5
```

- **A-8을 1순위로 권고**: 국내+국외 혼합 신고에서 국외 소득분 가산세가 **통째로 빠진다**. 다종목 UI가 열린 뒤(PR #1225) 실제로 도달 가능한 경로가 됐다.
- **A-6은 법령 판정이 선행**한다(§3 P0). 「산출세액 전액 × 40%」가 과대인지 여부가 착수 조건.
- **A-4는 1군과 묶지 말 것**: 로드맵 카드를 「PR-3 완료」로 바꾸는 순간 위 잔여가 **표시상 사라진다**. Q-2 결정(카드 폐기 → 미지원 고지 대체)에 따라 **A-1·A-2·A-3·A-7 종결 후** Phase F 에서 처리한다.

---

## 3. Phase 0 — 착수 전 실측(Do 진입 조건)

`feedback_pre_anchor_verification` · `feedback_pre_change_safety_net_probe` 적용. **안전망을 먼저 재고**, 그 다음 법령.

### 3.1 안전망 실측 (mutation probe — 「회귀 0건」의 의미를 먼저 확정)

| probe | 뮤테이션 | 기대 | 목적 |
|---|---|---|---|
| **P-1** | `aggregate.ts:554` 국외 종목 `underReportPenalty: 0` → `999_999` | 실패 건수 측정 | A-8 안전망 유무. **0건이면 「영향 없음」이 아니라 「아무도 안 보고 있다」** |
| **P-2** | `finalize.ts:84` 가산세율 0.40 → 0.50 | 실패 건수 | A-6 안전망 |
| **P-3** | `aggregate.ts:716` `totalSecuritiesTransactionTax` → 0 | 실패 건수 | A-2 — dead 필드 확증(0건 예상) |
| **P-4** | `StockSidebar` summary 항목 1건 삭제 | 실패 건수 | A-1 안전망 |

### 3.2 현행 동작 고정 anchor (수치 실측 후 확정)

| anchor | 시나리오 | 측정 대상 |
|---|---|---|
| **P-5** | 국내 1종목 + 국외 1종목 + `filingViolation="under_report"` + `isFraudulent=true` | `totalUnderReportPenalty` 가 **국내분만**인지 실측 → A-8 결함 수치 확정 |
| **P-6** | 동일 소득을 ① 1종목 ② 2종목 분할로 신고 + 과소신고 | 가산세 합계 차이(종목별 `floorTen` 반복) 실측 → A-7 규모 확정 |
| **P-7** | 3종목 확정 후 사이드바 표시값 | 편집 중 1건만 나오는지 E2E로 고정 → A-1 |

> ⚠️ **anchor 진입점 주의**(`feedback_leaf_anchor_skips_zod_layer`): A-3·A-8 은 route body 직접 주입이 아니라 **폼 → ④변환 → ⑫Zod → ⑭route** 를 타는 경로로 작성한다. leaf 직접 호출은 그 위 계층을 통째로 건너뛴다.

### 3.3 법령 선행 검증 (KoreanLaw MCP 축자 — 추정 인용 금지)

| # | 확인 대상 | A-n |
|---|---|---|
| **L-1** | 국세기본법 §47조의3① 「과소신고납부세액등」의 정의(§47조의3⑥ 등) — 가산세 base 가 산출세액 전액인지 | A-6 |
| **L-2** | 국세기본법 §47조의4 납부지연 — 일수·이자율(1일 22/100,000 등 현행값)·기산일 | A-5 |
| **L-3** | 국외주식 양도소득이 같은 신고서(별지84호) 과소신고분에 포함되는지 — §118의8 준용 범위 | A-8 |
| **L-4** | 자본시장법 시행령 §78(ATS) 「방법으로 거래」 요건의 판정 가능 여부 | B-1 |

---

## 4. 미검증 레지스터 (V-n) — 착수 전 반드시 해소

| V | 내용 | 해소 방법 |
|---|---|---|
| **V-1** | A-8 의 세액 영향 규모(국외분 가산세 누락액) | P-5 실측 |
| **V-2** | A-6 이 실제로 과대인지 — 법문 base 확인 전에는 **결함이라 단정 금지** | L-1 |
| **V-3** | A-3 에서 불완전 종목이 남았을 때 400 메시지가 **몇 번째 종목인지 지목**하는지 | route 응답 실측 |
| **V-4** | A-2 의 표시 위치 — 다종목 합계를 신고서 표에 넣을지 별도 카드로 낼지 | 별지84호 서식 실측 |
| **V-5** | B-4 dead 필드가 **UI 입력 경로를 갖는지** (경로가 없으면 「배선」이 아니라 「필드 삭제」가 정답일 수 있다) | grep 전수 |
| **V-6** | A-5 납부지연가산세가 **신고 단계 계산기 범위인지** — 납부일 확정 후 산정이라 입력축(납부예정일)이 필요 | Q-1 |

---

## 5. 사용자 결정 (Q-n) — ✅ 확정 (2026-08-27)

| Q | 질문 | **결정** |
|---|---|---|
| **Q-1** | 납부지연가산세(A-5)를 계산에 포함할 것인가 | ~~(b) 고지만~~ → **Phase 0 에서 철회**. §9.4 실측(부동산에 §47조의4 가 이미 구현·배선)으로 전제가 뒤집혀 **Q-4(a) 통일 = 계산 포함**으로 확정 |
| **Q-2** | 로드맵 카드(A-4)의 최종 형태 | **(b) 카드 폐기 → 「현재 미지원 항목」 고지 카드로 대체** — 내부 PR 번호는 사용자에게 의미가 없다. 고지 내용은 실측 미지원분(§47조의4 · 증권거래세 2021-01-01 이전 세율 · 국외전출세 보유현황 신고서 등) |
| **Q-3** | 착수 범위 | **(c) 전건 1~3군** — Track A 8건 + Track B 5건 |

⇒ ~~Q-1·Q-2 결정으로 A-5 와 A-4 가 같은 카드에서 만난다~~ → **Phase 0 에서 무효**. §47조의4 를 계산하므로
미지원 고지 카드(A-4)에는 **§47조의4 항목이 들어가지 않는다**(§7 표에서 삭제 — 아래 반영).

---

## 6. Phase 계획 (Q-3 = 전건)

| Phase | 내용 | 검증(verify) |
|---|---|---|
| **0** | §3 probe P-1~P-7 + 법령 L-1~L-4 | probe 실패 건수 기록(0건이면 그 사실을 기록) · 법문 축자 확보 |
| **A** | **A-8** 국외 종목 가산세 — 신고축 필드를 adapter 로 전파하거나 합산 단계에서 총 산출세액 기준 재산정 (L-3 판정에 종속) | P-5 anchor 수치 전환 · 국내 단독 회귀 0 |
| **B** | **A-6** L-1 결과에 따라 「과소신고분」 입력축 신설 **또는** 현행 유지 + 근거 주석. ⚠️ 과대 판정이 서기 전에는 코드 변경 금지 | 법문 축자 anchor + 세액 anchor |
| **C** | **A-7** 가산세 적용 단위 정합 — 「신고 1매 단위 합산 후 1회 산정」 vs 「안내문을 실동작에 맞춤」 결정 | P-6 수치 anchor |
| **D** | **A-1·A-2** ⑥ 사이드바 다종목 합계 + 증권거래세 합계 표시 | P-3·P-4 뮤테이션이 이제 실패해야 한다(안전망 신설 확인) · E2E |
| **E** | **A-3** 확정 종목 검증 — 확정 시 경고 배지 또는 계산 전 종목별 오류 목록(V-3 실측 결과 반영) | E2E(불완전 종목 확정 → 계산) |
| **F** | **A-4 + A-5** 「현재 미지원 항목」 고지 카드 신설 → `PrRoadmapCard` 폐기(호출부·테스트 동시 정리) | RTL · 카드 문구가 §7 미지원 목록과 1:1 |
| **G** | **B-1** 상장 벤처 ATS(자본시장법령 §78) 축 — L-4 로 판정 가능성 확인 후. **판정 불가면 현행 자기선언 유지 + 안내 강화**(법 근거 없이 불리 적용 금지) | 법령 anchor · 상장/비상장 양방향 anchor |
| **H** | **B-4** 이월과세 lot dead 필드 — V-5 결과에 따라 **배선** 또는 **필드 삭제** | grep 전수 + anchor |
| **I** | **B-3** 증권거래세 2021-01-01 이전 세율 연혁 — 역사 세율 정적 상수화(`feedback_historical_tax_tables`) | 연도별 anchor |
| **J** | **B-2** `listed_otc_non_major` 중복 해소 — **저장 이력 `taxCategory` 마이그레이션 동반** | 이력 로드 anchor(구 값 호환) |
| **K** | **B-5** 국외전출세 ① 기준환율(한국은행 API 또는 수동 유지 판정) ② 보유현황 신고서 | 각 anchor |

> Phase A~F 는 순차(같은 파일군을 건드린다). **G~K 는 서로 독립**이라 병렬 브랜치 가능.
> 각 Phase 는 PR 1건 단위로 끊고, `scripts/ship.sh` 대신 **push → PR → `gh pr checks --watch --fail-fast` → merge** 2단계를 쓴다(`--auto` 는 이 저장소에서 즉시 머지다).

### 6.1 14 동기화 지점

- **A-6** 이 「과소신고분」 입력축을 신설하면 **①~⑭ 전수**. ⑫Zod·⑬body·⑭route 는 TypeScript 가 잡지 않는다 — grep 자가 점검 필수(`feedback_api_zod_schema_sync`).
- **A-8** 은 엔진 내부 전파라 ⑭·⑦ 중심. 단 adapter 경유면 `ForeignStockInput` 타입 확장이 ⑫에 걸린다.
- **A-1·A-2·A-4·A-5·A-7** 은 표시 전용 — ⑥⑦만.
- **B-2** 는 `taxCategory` union 변경이라 **저장 이력(IndexedDB) 호환**이 ⑦ 밖의 추가 지점이다.

### 6.2 Definition of Done

- [ ] Phase 0 probe 결과를 계획서에 **수치로** 기록 (0건이면 그 사실 자체를 기록)
- [ ] 법령 인용은 KoreanLaw 축자 — `verify:legal` manifest 등록 확인
- [ ] `npx tsc --noEmit` 0건 · `npm run lint` 0건
- [ ] `npx vitest run __tests__/tax-engine/stock-transfer/` 통과 + 전건 회귀 0
- [ ] E2E `stock-multi-item-aggregate.spec.ts` 계열 통과
- [ ] 브라우저 수동 확인(다종목 3건 → 사이드바·증권거래세·가산세·고지 카드) — 미수행 시 명시

---

## 7. 「현재 미지원 항목」 고지 카드 초안 (Phase F 입력 — 실측 근거 있는 것만)

| 고지 항목 | 근거 (실측) | 해소되면 삭제할 Phase |
|---|---|---|
| 증권거래세는 2021-01-01 이전 양도의 당시 세율을 지원하지 않습니다(현행 세율로 표시) | `securities-transaction-tax.ts:85·196` | Phase I |
| 국외전출세 기준환율은 직접 입력해야 합니다(한국은행 고시 자동 연동 없음) | `stock-transfer-exit-tax-foreign-stock.plan.md:516` | Phase K |
| 국외전출자 보유현황 신고서는 자동 생성되지 않습니다 | 같은 문서:530 | Phase K |
| 국외 종목만으로 이루어진 신고는 가산세가 계산되지 않습니다 | `ForeignStockInput` 에 신고축 필드 부재(§11.6 잔여-1) | 미정 |

> ⚠️ 카드에 **내부 PR 번호·트랙명을 쓰지 않는다**(Q-2 결정 취지). 문구는 사용자가 판단에 쓸 수 있는 사실만.
> ⚠️ Phase G~K 가 항목을 해소하면 **카드 문구도 같은 PR에서 지운다** — 안 그러면 이 카드가 다음 stale 표시가 된다(`PrRoadmapCard` 가 그렇게 됐다).

---

## 8. 비스코프

- **§47조의3①1호 나목(비부정분 10%)** — 부동산·주식 공통 갭이라 고치면 부동산 세액까지 움직인다. **Track C 별건**(§9.4).

- 다종목 폼을 `stockItems[]` 로 **재분해**하는 것(구 계획서 R-1 원안) — 240필드/38컴포넌트 분해는 PR #1225 에서 **의식적으로 포기**한 결정이다. 재제안 금지.
- §104⑤ 비교과세 주식 그룹 확대 — 기타자산 그룹 전용이 정본(`aggregate.ts` 주석).
- 키움 인프라 변경 · 증권거래세 Phase 3 확장.

---

## 9. Phase 0 실측 결과 (2026-08-27)

> 베이스라인: `npm test` **1594 파일 / 17,317 passed · 0 failed** (exit 0, 177.7초).
> 이후 뮤테이션 실패는 전부 그 뮤테이션에 귀속된다.

### 9.1 법령 축자 (KoreanLaw MCP — 국세기본법 MST 288571 시행 2026-08-11)

**L-1 · 국세기본법 §47조의3① — 과소신고가산세 base**

> 「… 과소신고한 납부세액과 초과신고한 환급세액을 합한 금액(이 법 및 세법에 따른 가산세와 …
> 이자 상당 가산액이 있는 경우 그 금액은 제외하며, 이하 "**과소신고납부세액등**"이라 한다)에
> 다음 각 호의 구분에 따른 산출방법을 적용한 금액을 가산세로 한다.
> 1. 부정행위로 과소신고…한 경우: **다음 각 목의 금액을 합한 금액**
>    가. **부정행위로 인한** 과소신고납부세액등의 100분의 40(역외거래 … 100분의 60)
>    나. **과소신고납부세액등에서 부정행위로 인한 과소신고납부세액등을 뺀 금액**의 100분의 10
> 2. 제1호 외의 경우: 과소신고납부세액등의 100분의 10」

⇒ **V-2 해소 — A-6 은 결함이다.** 어긋나는 축이 **둘**이다:

| 축 | 법문 | 현행 (`stock-transfer-finalize.ts:84`) |
|---|---|---|
| **base** | 과소신고**납부세액등**(과소신고한 부분) | `calculatedTax` = **산출세액 전액** |
| **부정 시 산식** | 가목(부정분×40%) **+ 나목(비부정분×10%)** 합산 | 전액 × 40% 단일 곱 — **나목 없음** |

**L-1b · §47조의2① 무신고** — base 는 「그 신고로 납부하여야 할 세액(가산세·이자상당가산액 제외)
= **무신고납부세액**」, 1호 40%(역외 60%)·2호 20%의 **단일 비율 곱**이다. 무신고는 신고 자체가
없어 base 가 사실상 전액이므로 **현행 구조와 형태가 일치**한다 ⇒ A-6 의 수정 범위는 **과소신고 축**.

**L-2 · §47조의4①1호 + 국기령 §27의4①(MST 283623)**

> 「납부하지 아니한 세액 또는 과소납부분 세액 × 법정납부기한의 다음 날부터 **납부고지일**
> (납부고지일 전에 납부한 경우 그 납부일)의 **전날**까지의 기간 × … 대통령령으로 정하는 이자율」
> 국기령 §27의4① — 「**1일 10만분의 22**의 율」

⇒ 기간 기산에 **납부(고지)일**이 필요하다. Q-1(고지만) 결정과 정합 — 신고 단계 계산기가 확정할 수
없는 값이므로 **입력축 신설 없이 고지**가 맞다. 고지 문구에 이 산식을 그대로 쓴다.

**L-3 · 소득세법 §118의8(MST 280405)**

> 「국외자산의 양도에 대한 양도소득세의 과세에 관하여는 … 제105조부터 제107조까지,
> 제110조부터 제112조까지, 제114조, 제114조의2 및 제115조부터 제118조까지를 준용한다」

⇒ **예정신고(§105)·확정신고(§110)·납부(§106·§111)가 준용**된다. 국외주식 양도소득은 같은 신고
단위에 들어가고, 국세기본법 §47조의2·§47조의3 은 「국세의 과세표준 **신고**」 단위로 걸린다.
⇒ **A-8 은 결함 확정**(국외 소득분이 가산세 base 에서 통째로 빠진다).

**L-4 · 증권거래세법 시행령 §1조의2①(MST 280901)**

> 「법 제3조제1호 나목에서 "대통령령으로 정하는 방법"이란 「자본시장과 금융투자업에 관한 법률
> 시행령」 **제78조 또는 제178조제1항**에 따른 기준에 따라 주권을 매매하는 것을 말한다」

⇒ 조특법 §14①7호 벤처 비과세의 「방법」은 **ATS(자본시장법령 §78) 또는 K-OTC(§178①)** 두 갈래로
**축자 확정**. 판정 가능하므로 **B-1 착수 조건 충족** — 현행 `isKOTCTrading` 단일 토글은 두 갈래 중
하나만 표현한다.

### 9.2 현행 동작 실측 (P-5·P-6 — throwaway probe, 측정 후 삭제)

**P-5 — 국내(kospi 대주주, 과소신고+부정) + 국외 각 양도소득 100,000,000**

| 종목 | 분류 | 양도소득금액 | 과세표준 | 산출세액 | **가산세** |
|---|---|---:|---:|---:|---:|
| 1 | `listed_major` | 100,000,000 | 100,000,000 | 20,000,000 | **8,000,000** |
| 2 | `foreign_stock` | 100,000,000 | 97,500,000 | 19,500,000 | **0** |
| 계 | | | | 39,500,000 | **8,000,000** |

법문대로 신고 단위(39,500,000)에 40%를 적용하면 **15,800,000** ⇒ **현행은 7,800,000 과소**.
(기본공제 2,500,000 은 §103② 「먼저 양도한 자산」 순서로 3월 양도인 **국외 종목**에 갔다 — 정상.)

**P-6 — 같은 소득을 1종목 vs 2종목으로 분할 (과소신고+부정)**

| | 산출세액 | 가산세 | 결정세액 |
|---|---:|---:|---:|
| 1종목(1,000주) | 19,500,000 | 7,800,000 | 27,300,000 |
| 2종목(500주×2) | 19,500,000 | 7,800,000 | 27,300,000 |

⇒ **차이 0원.** 가산세율이 신고축 공통이라 종목별 산정 후 합산해도 총액이 같고, 우려했던
`floorTen` 반복 절사도 이 격자에서는 발생하지 않았다. **A-7 은 세액 문제가 아니라 문구·구조 정합
문제로 축소**한다(다만 A-6·A-8 수정으로 가산세가 신고 단위 1회 산정으로 바뀌면 A-7 은 자연 소멸).

**P-6b — 부정 여부 축**: 부정 40% = 7,800,000 · 일반 10% = 1,950,000 (둘 다 산출세액 19,500,000 ×
단일 비율). ⇒ **§47조의3①1호 나목(비부정분 10%)에 해당하는 항이 존재하지 않는다** — 입력도
`isFraudulent: boolean` 하나뿐이라 「일부만 부정행위」 시나리오는 **표현 자체가 불가능**하다.

### 9.3 안전망 실측 (뮤테이션 probe — 전건 `npm test` 4회, 각 뮤테이션 후 즉시 revert)

| probe | 뮤테이션 | **실패** | 잡은 테스트 | 해석 |
|---|---|---:|---|---|
| **P-1** | `aggregate.ts:554` 국외 종목 `underReportPenalty: 0` → `999999` | **2** | `foreign-aggregate-118-6-bc.anchor.test.ts` FA-1-4 · FA-1-7 | **간접**이다 — 총계 항등식이 흔들려 걸렸을 뿐 「국외 가산세가 0이다」를 **직접 단언하는 테스트는 없다**. A-8 수정 시 이 2건은 재산정 대상이고, 국외 가산세 자체를 고정하는 anchor 를 새로 심어야 한다 |
| **P-2** | `finalize.ts:68` 부정 `penaltyRate` 0.40 → 0.50 | **5** | `case-25-26-penalty.test.ts` C25-10 · C25-12 · C25-E-02 · FV-NR-FRAUD-01 · CR-25-02-01 | 부정 40% 축은 **직접 anchor 5건**이 지킨다. A-6 이 base 를 바꾸면 이 5건은 **법령 정합값으로 재산정**한다(틀린 anchor 유지 금지 — `feedback_anchor_correction_legal_priority`) |
| **P-3** | `aggregate.ts:410·716` `totalSecuritiesTransactionTax` 무력화 | **2** | `securities-transaction-tax-phase2.test.ts` B-01 · B-02 | ⚠️ **예상(0건)이 틀렸다.** 엔진 값은 anchor 2건이 지키고 있다 ⇒ A-2 는 「dead 필드」가 아니라 **표시 누락**이다. 계산은 맞는데 화면에 안 나올 뿐 |
| **P-4** | `StockSidebar.tsx:37` summary 전체 무력화(`return items` 즉시) | **0** | — | **안전망 0건.** `StockSidebar` 를 참조하는 테스트·E2E 가 저장소에 **하나도 없다**(grep 0). 「회귀 0건」이 「영향 없음」이 아니라 **아무도 안 보고 있다**는 뜻이다 ⇒ A-1 은 anchor 선행 필수 |

> 베이스라인 대비 증감으로만 판정했다(베이스라인 0 failed). 4건 모두 실행 후 `git checkout` 으로 되돌렸고 `git status` 로 확인했다.
> ⚠️ **E2E 는 이 측정에 포함되지 않았다**(vitest 전건만). P-4 의 「0건」은 vitest 범위의 사실이다 — 다만 `e2e/` 에도 `StockSidebar` 참조가 0건임을 grep 으로 확인했다.

### 9.4 ⭐ 설계 환류 — 가산세 정본은 **이미 부동산 쪽에 있다**

`feedback_sibling_path_already_implements_rule` 적용. 주식 가산세를 새로 설계하려던 참에 부동산
양도세를 보니 **법문 그대로의 모듈이 이미 있었다**:

`lib/tax-engine/transfer-tax-penalty.ts`

```ts
// :244  — 「과소신고납부세액등」 그 자체
const penaltyBase = Math.max(0,
  input.determinedTax
    - input.priorPaidTax
    - input.originalFiledTax      // 당초 신고한 납부세액
    - input.interestSurcharge     // §47조의3① 괄호 — 이자상당가산액 제외
    + input.excessRefundAmount);  // 초과환급신고 가산
```

- `FilingPenaltyInput`(:35-64) — `determinedTax`·`priorPaidTax`·`originalFiledTax`·`excessRefundAmount`·`interestSurcharge`·`filingType`(none/under/excess_refund/correct)·`penaltyReason`(normal/fraudulent/offshore_fraud)
- `DelayedPaymentInput`(:67-77) — `unpaidTax`·`paymentDeadline`·`actualPaymentDate` ⇒ **§47조의4 이미 구현**. `breakdown: DelayedPaymentRateSegment[]`(:108-115)로 **이자율 개정 시행일 straddle**까지 처리한다.
- 배선도 **끝까지 살아 있다**: 폼 `calc-wizard-store.ts:284-291`(`penaltyReason`·`originalFiledTax`·`paymentDeadline`·`actualPaymentDate`) → ④ `transfer-tax-api-body-blocks.ts:96-109` → ⑫ `lib/api/transfer-tax-schema-sub.ts` → ⑭ `app/api/calc/transfer/engine-input.ts`.

주식 쪽은 같은 자리에 **boolean 3개(`filingViolation`·`isFraudulent`·`isInternationalTransaction`)로 축약된 판**을 따로 갖고 있다(`stock-transfer-finalize.ts`). 결과뷰는 이미 `latePaymentPenalty`를 그릴 준비가 돼 있고(`StockTransferPenaltySection.tsx:37·77-80`) **엔진이 0을 주기 때문에 늘 숨겨질 뿐**이다.

⇒ **A-5·A-6·A-7·A-8 은 각각의 신규 설계가 아니라 「부동산 정본 모듈을 주식이 재사용」 하나로 수렴한다.**
가산세를 **신고 단위 1회**(aggregate 레벨) 산정하면:

| 항목 | 해소 방식 |
|---|---|
| A-6 base | `originalFiledTax` 입력으로 「과소신고납부세액등」이 정확해진다 |
| A-8 국외분 누락 | 신고 단위 base 에 국외 종목 세액이 자연히 포함된다 |
| A-7 단위 불일치 | 종목별 산정이 사라지므로 **자연 소멸** |
| A-5 §47조의4 | `calculateTransferTaxPenalty` 의 delayedPayment 경로 재사용 |

> ⚠️ **Q-1 의 전제가 실측으로 뒤집혔다.** 「납부일 확정이 필요하니 계산기 범위 밖」이라고 봤는데,
> 부동산은 **이미 그 입력을 받아 계산한다**(`paymentDeadline`·`actualPaymentDate`). 주식만 없다.
> ⇒ **Q-1 재확인 필요**(§10 Q-4).

> ⚠️ **§47조의3①1호 나목(비부정분 10%)은 부동산에도 없다** — `calculateFilingPenalty`(:277)도
> `resolveFilingRate` **단일 비율 곱**이다. 즉 이 갭은 주식만의 문제가 아니라 **저장소 전역 공통**이고,
> 고치면 부동산 세액까지 움직인다. ⇒ **본 트랙에서 분리**하고 별건(Track C)으로 승계한다.

---

## 10. Phase 0 산출 — 갱신된 결정·레지스터

### 10.1 V 레지스터 갱신

| V | 상태 | 결과 |
|---|---|---|
| **V-1** | ✅ 해소 | A-8 영향 = **7,800,000 과소**(P-5 격자). 규모는 국외 종목 산출세액 × 가산세율에 비례 |
| **V-2** | ✅ 해소 | A-6 은 결함 확정 — base·부정분 분해 **두 축** (L-1) |
| **V-3** | ⏳ 잔여 | 불완전 종목 400 메시지의 종목 지목 여부 — Phase E 착수 시 실측 |
| **V-4** | ⏳ 잔여 | 증권거래세 다종목 표시 위치 — Phase D 착수 시 별지84호 실측 |
| **V-5** | ⏳ 잔여 | B-4 dead 필드 UI 입력 경로 — Phase H |
| **V-6** | ✅ 해소(방향 반전) | §47조의4 는 **부동산에 이미 구현·배선**돼 있다 ⇒ 「계산기 범위 밖」이 아니다 |

### 10.2 신규 사용자 결정 (Q-4) — ✅ **(a) 통일** 확정 (2026-08-27)

**Q-4 — 가산세 축을 부동산 정본으로 통일할 것인가?** → **(a) 통일**.
이로써 **Q-1(고지만)은 철회**된다 — §47조의4 는 고지가 아니라 **계산**한다.

- **(a) 통일(권장)**: `transfer-tax-penalty.ts` 를 주식이 재사용. `originalFiledTax`·`paymentDeadline`·`actualPaymentDate` 입력 신설(부동산과 같은 UX) → A-5·A-6·A-7·A-8 **일괄 해소**. 14지점 전수 + 기존 가산세 anchor 재산정 필요(세액 변경).
- **(b) 최소 수정**: 현행 주식 판을 유지하되 A-8(국외분 누락)만 고치고, A-6 은 「전액을 과소신고분으로 본다」는 **고지**로 갈음. §47조의4 는 Q-1 대로 고지만.

> ⚠️ (b)는 「법 근거 없이 불리 적용」 쪽이다 — 과소신고분보다 큰 base 에 가산세를 매기는 방향이라
> 납세자에게 **불리**하다. `feedback_no_unfavorable_application_without_legal_basis` 와 충돌한다.

### 10.3 Phase 재편 (Q-4 = (a) 확정)

```
Phase A′  가산세 신고단위 통일 — 부동산 정본 재사용 (A-5·A-6·A-7·A-8 일괄)
Phase D   A-1·A-2 표시축 (독립 — 병렬 가능)
Phase E   A-3 확정 종목 검증
Phase F   A-4 로드맵 카드 폐기 → 미지원 고지 카드
Phase G~K Track B (B-1 착수조건 충족 — L-4 축자 확보)
Track C   §47조의3①1호 나목 — 부동산·주식 공통 별건 (본 트랙 밖)
```

**Phase A′ 착수 전 필수 anchor** (§9.3 실측이 정한 것):

| # | 내용 | 이유 |
|---|---|---|
| **A′-1** | 국외 종목 가산세를 **직접** 단언하는 anchor 신설 | P-1 이 잡은 2건은 총계 항등식의 **간접** 반응이다. 직접 축이 없으면 다음 변경 때 또 조용히 넘어간다 |
| **A′-2** | `case-25-26-penalty.test.ts` 5건을 **법령 정합값으로 재산정** | base 가 「과소신고납부세액등」으로 바뀌면 7,800,000·11,700,000 등이 전부 움직인다. 기존 값 유지 금지 |
| **A′-3** | 단건 ↔ 다종목 **가산세 항등식** anchor (P-6 격자 재사용) | 신고 단위 1회 산정으로 바뀌어도 「같은 소득 = 같은 가산세」가 유지되는지 |
| **A′-4** | 14지점 ⑫⑬⑭ grep 자가 점검 | 신규 입력 3개(`originalFiledTax`·`paymentDeadline`·`actualPaymentDate`)는 TypeScript 가 안 잡는다 |

---

## 11. Phase A′ 구현 결과 (2026-08-27)

브랜치 `stock-penalty-axis-unify` (origin/master `d5895805` 기준).

### 11.1 무엇을 바꿨는가 — 「축약판 폐기, 정본 재사용」

`stock-transfer-finalize.ts` 가 갖고 있던 `calculatedTax × 비율` 축약판을 버리고 부동산 정본
(`lib/tax-engine/transfer-tax-penalty.ts`)의 `calculateFilingPenalty`·`calculateDelayedPaymentPenalty`
를 호출한다. 절사만 주식 규칙(10원, 국고금 관리법 §47①)을 씌운다.

| 항목 | 종전 | 현행 |
|---|---|---|
| **A-6** base | 산출세액 전액 | **결정세액 − 당초신고세액 − 기납부세액 − 이자상당가산액** (§47조의3①) |
| **A-5** §47조의4 | `latePaymentPenalty = 0` placeholder | 미납세액 × 경과일수 × 1일 10만분의 22 (국기령 §27조의4①) |
| **A-8** 국외 종목 | 가산세 0 고정 | 신고 단위 base 에 **포함** (소득세법 §118의8) |
| **A-7** 적용 단위 | 종목별 산정 후 합산 | **신고 1건 1회** — 종목별은 전부 0, 총계에만 |

**세액 실측**: 국내(산출 20,000,000) + 국외(19,500,000) 혼합 · 과소신고 부정 40%
→ 가산세 8,000,000 → **15,800,000** (7,800,000 과소 해소).

### 11.2 신규 입력 6칸 (14지점 전수)

`originalFiledTax` · `priorPaidTax` · `interestSurcharge` · `unpaidTax` · `paymentDeadline` · `actualPaymentDate`

①`calc-wizard-stock-form.ts` ②initial ③`calc-wizard-stock-normalize.ts` ④`stock-transfer-tax-api.ts`
⑤`components/calc/stock-transfer/PenaltyDetailBlock.tsx`(신규) + `steps/Step3.tsx` ⑦`StockTransferPenaltySection`(기준금액 echo)
⑧`stock-transfer-tax-validate.ts` ⑫`stock-transfer-tax-schema.ts` ⑬body ⑭`stock-transfer-engine-input.ts`
(⑥ 사이드바는 가산세 항목이 없어 해당 없음)

### 11.3 ⭐ anchor 가 ⑭ 를 안 태우고 있었다 — 측정으로 발견

배선 anchor 를 심고 뮤테이션으로 재보니 **⑭ 매핑에서 `unpaidTax` 를 지워도 9건 전부 통과**했다.
anchor 가 `coerced` 를 엔진에 **바로** 넘겨 route 의 매핑 계층을 건너뛰고 있었다
(`feedback_leaf_anchor_skips_zod_layer` 의 ⑭ 판).

⇒ 두 가지를 순수 모듈로 분리해 anchor 가 **정본을 통과**하게 했다:
- `lib/api/stock-transfer-date-fields.ts` — Date 강제 목록(복사본을 쓰면 ⑭ 누락이 조용히 통과)
- `lib/api/stock-transfer-engine-input.ts` — `buildEngineInput` (route.ts 464→338줄)

> ⚠️ route handler 를 테스트에서 직접 import 하는 우회는 실패했다 — `STOCK_DATE_FIELDS is not
> iterable`. Next.js route 모듈은 vitest 로드가 불안정하다.

**뮤테이션 재측정 (전부 감지)**: ⑫Zod 필드 제거 1건 실패 · ⑭DATE_FIELDS 제거 1건 · ⑭매핑 제거 1건 ·
④body 미전송 1건 · ④게이트 해제 1건 · ⑤Step3 렌더 제거 2건 · ⑤축 게이트 해제 1건.

### 11.4 기존 anchor 재산정 — 「틀린 값을 고정하고 있던」 3파일

| 파일 | 건수 | 사유 |
|---|---:|---|
| `case-25-26-penalty.test.ts` | 13 | base 가 전자신고 세액공제 반영 후(19,480,000)로 바뀜. **전자신고 OFF 인 C25-E 그룹은 불변** — 교차 검증됨 |
| `kotc-listed-exemption-guard.anchor.test.ts` | 2 | ⭐ 픽스처가 `filingViolation` 을 안 채운 채 `as StockTransferInput` 캐스팅 → 종전 엔진이 `undefined` 를 else 로 흘려 **과소신고 10% 를 조용히 매기고 있었다**. anchor 값 2,997,500 에 근거 없는 272,500 이 섞여 있었다 |
| `carryover-97-2-lot-necessary-expense.anchor.test.ts` | 1 | ⭐⭐ 같은 원인. 주석은 차액 14,925,000 을 「지방소득세」라 적었지만 `appliedTotalTax` 는 지방세를 담지 않는다 — **정체는 가산세였다**. 지방소득세율과 가산세율이 둘 다 10% 라 구분되지 않았다 |

> 🔑 실사용 경로는 Zod 가 `filingViolation` 을 **필수**로 받으므로 이 두 건은 픽스처 결함이다.

### 11.5 파일 크기 정책 대응 (기회주의적 분리)

| 파일 | 전 | 후 |
|---|---:|---:|
| `stock-transfer-aggregate.ts` | 801 | **748** (`stock-transfer-aggregate-penalty.ts` 추출) |
| `stock-transfer-tax-schema.ts` | 803 | **646** (`stock-transfer-foreign-schema.ts` 분리 + re-export 보존) |
| `app/api/calc/stock-transfer/route.ts` | 464 | **338** |

### 11.6 잔여 (본 PR 범위 밖 — 후속 등록)

| # | 내용 |
|---|---|
| **V-7** | 「납부하여야 할 세액」에 **전자신고 세액공제**를 반영할지 — 반영으로 구현했고 근거를 주석에 남겼으나 명문 확인은 못 했다(부동산 정본이 감면을 `determinedTax` 에 반영하는 구조와 정합) |
| **잔여-1** | **전부 국외 종목인 신고**는 가산세가 여전히 0이다 — `ForeignStockInput` 에 신고축 필드가 타입 자체에 없다. 국내 종목이 하나라도 있으면 정상 |
| **잔여-2** | 무신고(`non_report`)인데 전자신고 세액공제가 붙는다 — 신고를 안 했는데 전자신고 공제는 성립할 수 없다. **별건** |
| **Track C** | §47조의3①1호 **나목(비부정분 10%)** — 부동산에도 없어 고치면 부동산 세액까지 움직인다 |
| **별건** | `stock-transfer-aggregate.ts` 의 §104⑤ 기타자산 비교과세 블록 추출(748 → ≤700 착지) |

### 11.7 E2E 검증 — 그리고 **다른 워크트리의 dev 서버를 테스트하고 있었다**

`e2e/stock-penalty-filing-unit.spec.ts` 신설(PE-1~PE-3). PE-3 은 payload(⑬)·API 응답
(`latePaymentPenalty = 68,200`)·결과 카드·별지84호 표까지 한 번에 확인한다.

> 🔴 **첫 실행은 무의미했다.** DOM 스냅샷에 **옛 안내 문구**가 있어 확인해 보니 3000 포트의
> dev 서버가 `/Users/mynote/workspace/PRT-stock-transfer-bugfix` 워크트리 것이었고
> `reuseExistingServer: !CI` 가 그것을 재사용했다. **같은 실행에서 통과한 기존 주식 spec 11건도
> 내 변경을 검증하지 않았다.** ⇒ `E2E_PORT=3200` 격리 후 재실행
> (`feedback_worktree_e2e_port_isolation` 이 정확히 이 경우다 — 워크트리가 아니라 **메인 트리**
> 에서 돌릴 때도 다른 워크트리 서버를 잡을 수 있다).

### 11.8 별건 발견 — 별지84호 행 수 가드가 **상시 발화**하고 있었다

E2E 로그에서 `[StockFilingFormTable] 행 수 이상: 기대 32행, 실제 33행` 이 매 렌더마다 떴다.

- 무조건 행은 **33개**다(`rows.push` 36개 − 조건부 3개). 가드는 32에 멈춰 있었다.
- 원인은 `40d6cc55`(PR #1327)가 무조건 행을 하나 늘리며 기대값을 안 올린 것.
- 조건부 목록에 **`lossOffset`(§102② 통산 행)도 빠져** 있었다.

파일 주석이 스스로 「안 그러면 **진짜 행 누락 신호가 죽는다**」고 경고한 상태가 실제로
벌어져 있었다. ⇒ 기대식을 `33 + lossOffset + isMulti + hasForeignCredit` 로 정정하고,
**console.warn 이 아니라 anchor 가 잡도록** `stock-filing-form-multi-item.anchor.test.ts` 에
RC-1·RC-2 를 심었다(경고는 아무도 안 본다).

---

## 12. Phase D 구현 결과 (2026-08-27) — A-1 사이드바 · A-2 증권거래세 표시

### 12.1 A-1 — 사이드바가 편집 중 1건만 보고 있었다

`StockSidebar.tsx` 가 `formData`·`result` 만 읽어, 3종목을 확정한 사용자도 **편집 중 1건**의
양도가액을 신고 전체로 읽게 돼 있었다. Phase 0 P-4 실측이 이 축의 **안전망 0건**을 확인했으므로
(전건 vitest·E2E·grep 모두 참조 0) anchor 를 먼저 심고 배선했다.

| 상태 | 표시 |
|---|---|
| 확정 종목 0건 | 종전과 동일 (편집 중 1건) |
| 확정 종목 ≥1 · **계산 전** | 「N건 합산」 배지 + **양도가액 합계**만 (단순 덧셈이라 정확) |
| 확정 종목 ≥1 · **계산 후** | 엔진 합계 — 양도소득금액·기본공제·과세표준·산출세액·**가산세**·결정세액·지방소득세 |

> 🔑 **계산 전에는 과세표준·산출세액을 추정하지 않는다.** 종목마다 세율이 갈리고 기본공제는
> 신고 단위 1회(§103①2호)라 종목별 합으로 재현되지 않는다 — 틀린 값을 보이느니 **안 보인다**
> (`feedback_no_silent_apportion_fallback` 과 같은 방향).

부수: 양도가액 산정 로직을 `computeFormTransferPrice(form)` 순수 함수로 추출했다(종전에는
`useMemo` 안에 인라인이라 편집 중 1건에만 적용 가능했다).

### 12.2 A-2 — 계산은 맞는데 화면에 없던 증권거래세

`totalSecuritiesTransactionTax` 는 엔진 anchor 2건이 지키는데(P-3 뮤테이션) **UI 참조가 0건**이었다.
`StockAggregateSummaryCard` 에 합계 카드를 추가했다 — 증권거래세분 · 농어촌특별세 · 합계.

> ⚠️ **납부세액 합계에 더하지 않는다** — 양도소득세와 **별개 세목**이다. 카드 문구가 그 사실을
> 말하고, anchor AS-1-2 가 합계 금액(양도세+지방세)이 변하지 않았음을 고정한다.
> 0원이면 카드를 만들지 않는다(빈 카드로 화면을 늘리지 않는다 — AS-1-3).

같은 카드에 **신고 단위 가산세 내역**(신고불성실·납부지연)도 추가했다. Phase A′ 로 값이 생겼는데
결정세액에 포함만 되고 내역이 안 보여 「왜 이 금액인가」를 알 수 없었다.

### 12.3 검증

- anchor 신설 **13건** — 사이드바 7(`stock-sidebar-multi-item.test.tsx`) · 요약카드 6(`stock-aggregate-summary-card.test.tsx`)
- **뮤테이션 4종 전부 감지**: 사이드바 다종목 분기 무력화 4건 실패 · 양도가액을 편집 중 1건만 1건 · STX 카드 게이트 false 2건 · 가산세 행 제거 1건
- E2E `MI-E2E-4` 확장 — 「2건 합산」 배지 · 「양도소득금액 합계」 · 「증권거래세 합계 (정보성)」 · 「별도로 납부」
- V-4 해소: 표시 위치는 **별지84호 15행이 아니라 합산 요약 카드**다. 서식 15행은 필요경비 이중차감을 막으려 의도적으로 `null` 이다(파일 주석).

---

## 13. Phase E 구현 결과 (2026-08-27) — A-3 확정 종목 검증

### 13.1 ⭐ V-3 실측이 계획을 뒤집었다 — 400 이 아니라 **500**

계획서는 「불완전 종목이 남으면 계산 시점 **400**」이라 적었다. 실측하면 400 이 아니다:

1. 확정 게이트는 **종목명·시장 2개**뿐이다(의도적 설계 — 종목을 오가며 채우는 흐름을 막지 않으려고).
2. `buildStockTransferApiBody` 가 나머지를 기본값으로 채워 **Zod 가 통과한다**(실측 `success: true`).
3. 엔진에서 `input.transferDate.getTime is not a function` 으로 **터진다** → 500.

사용자에게는 그냥 「계산 오류」이고 **어느 종목이 문제인지 알 길이 없다**. 「메시지가 불친절하다」가
아니라 **침묵 통과 후 크래시**였다.

### 13.2 ⭐ 도달 경로가 실재한다 — 사이드바 스텝 점프가 validate 를 우회한다

「방어를 넣기 전에 그 경로가 실재하는지」를 먼저 쟀다(`feedback_blocked_message_is_not_missing_input_path`).

- 「다음」 버튼은 단계별 validate 를 거친다(`handleNext`).
- 그러나 **사이드바 스텝 클릭은 그냥 점프**한다 — `onStepClick={(i) => setStep(i)}`.
- ⇒ 종목명·시장만 넣고 3단계로 점프하면 확정 게이트를 통과해 **금액도 날짜도 빈 종목**이 목록에 쌓인다.

E2E `MI-E2E-5` 가 이 경로를 그대로 재현한다.

### 13.3 두 층으로 막았다

| 층 | 내용 |
|---|---|
| **⑧ 클라이언트** | `validateFilingItems(forms)` — 확정 종목 전수 검증. **순번+종목명으로 지목**하고 종목당 **첫 오류만** 보고(한 종목이 오류 10건을 쏟으면 목록이 안 읽힌다) |
| **⑤ 목록 카드** | 「입력 미완료」 배지 — 계산 차단과 **같은 판정**을 쓴다(단일 소스) |
| **⑫ 서버** | `requiredDateSchema` — 필수 날짜 7칸이 **빈 문자열을 거부**한다. API 직접 호출 경로에는 이것이 유일한 방어다 |

### 13.4 검증

- anchor 10건(⑧ 8 · ⑤ 2) · **뮤테이션 4종 전부 감지**(첫 오류만 보고 · 순번 라벨 · requiredDate · 배지 렌더)
- E2E 5건 통과 (MI-E2E-5 신설)
- 🔴 **`tsc` 가 통과한 코드가 빌드에서 깨졌다** — JSX 표현식 안에 `{/* 주석 */}` 을 넣어
  Turbopack 이 `Expected '</', got 'ident'` 로 거부했다. **typecheck 통과가 빌드 통과를 뜻하지
  않는다** — 이번엔 E2E 가 잡았다(dev 서버가 실제로 빌드하므로).


---

## 14. Phase F 구현 결과 (2026-08-27) — A-4 로드맵 카드 폐기

`PrRoadmapCard` 를 삭제하고 `UnsupportedItemsCard`(현재 지원하지 않는 항목)로 대체했다.

**왜 로드맵이 아니라 미지원 고지인가** — 종전 카드의 `status: "current"` 는 구현 현황과
아무 연결이 없는 리터럴이었고, PR-3 본체와 후속 3축이 전부 머지된 뒤에도 화면은
「PR-3 진행 중」이라 말하고 있었다. 애초에 **내부 PR 번호는 사용자에게 의미가 없다** —
사용자가 알아야 할 것은 「이 계산기가 지금 무엇을 못 하는가」다(Q-2 (b)).

고지 항목 4건은 **전부 실측 근거가 있는 것만** 담았다(§7 표와 1:1):
증권거래세 2021-01-01 이전 세율 · 국외전출세 기준환율 · 보유현황 신고서 ·
국외 종목만인 신고의 가산세.

anchor 5건(`stock-unsupported-items-card.test.tsx`). 그중 둘은 **금지 항목**을 고정한다:
- UN-1-4: 카드 본문에 `PR-\d`·`Phase [A-Z]` 가 **없다**(내부 용어 노출 금지)
- UN-1-5: 이미 구현된 §47조의4 납부지연가산세가 **고지 목록에 없다**
  — 해소된 항목이 남으면 이 카드가 다음 stale 표시가 된다.

---

## 15. Phase G 구현 결과 (2026-08-27) — B-1 상장 벤처 ATS 축

### 15.1 ⭐ 조문을 끝까지 읽으니 **필드가 필요 없었다**

잔여 R-1 은 「상장 벤처의 §78/§178① 방법 축이 없다」였고, 계획은 신규 입력 축(3지선다 또는
`isATSTrading` boolean)이었다. 그런데 축자를 확인하니 **두 갈래가 시장 축과 1:1** 이었다:

| 갈래 | 근거 | 대상 |
|---|---|---|
| **§78 ATS**(다자간매매체결회사) | 자본시장법 **§8조의2⑤** — 「**증권시장에 상장된 주권**, 그 밖에 대통령령으로 정하는 증권」 | **상장 전용** |
| **§178① K-OTC**(협회) | 자본시장법 **§286①5호** — 「**상장되지 아니한 주권**의 장외매매거래」 | **비상장 전용** |

⇒ 「그 방법으로 거래했다」는 **자기선언 하나**(`isKOTCTrading`)면 충분하고, 어느 갈래인지는
`marketType` 이 정한다. **엔진 0줄 · 신규 필드 0개**.

### 15.2 진짜 문제는 라벨이었다

상장 벤처 사용자에게 「K-OTC 거래」라고 물으면 **사실과 다르므로 켜지 않는다** — 그러면 조특법
§14①7호 비과세를 놓친다(**납세자에게 불리**). 게다가 종전 안내는 **켠 뒤에만** 떴다.

- 토글 제목·설명·조문 배지를 시장에 따라 갈랐다 — 상장이면 「ATS(다자간매매체결회사) 거래 /
  조특법 §14①7호」, 비상장이면 「K-OTC 거래 / §94①3 나목 단서」
- 상장이면 **켜기 전에도** 안내를 띄워 「벤처를 ATS 에서 양도했다면 켜라」를 알린다

anchor 4건 · 뮤테이션 2종(라벨 분기 제거 · 안내를 켠 뒤에만) 전부 감지.
엔진 주석에 §8조의2⑤ 축자를 남겨 다음 사람이 다시 조사하지 않게 했다.

> ⚠️ R-1 은 **해소**로 종결한다. 「축이 없다」가 아니라 「라벨이 한 갈래만 말한다」였다.

---

## 16. Phase H (2026-08-27) — B-4 는 **잔여가 아니었다** (코드 변경 0)

잔여 B-4 는 「`AcquisitionLot.donorCapitalExpenditure`·`donorGiftTaxAmount` 는 필드만 있고
**읽는 곳이 없다**」였다. 재측정하니 **둘 다 배선돼 있다** — PR #1210(이월과세 lot 판 ①2호·①3호)이
해소했는데 메모리·계획서의 🟠 표시가 따라오지 않았다.

**실측 (뮤테이션 · 전건 `npm test`)**

| probe | 뮤테이션 | 실패 |
|---|---|---:|
| M-H1 | `stock-carryover.ts:127` lot 축 `donorCapitalExpenditure` → 0 | **6** |
| M-H2 | `:252` 종목 축 `input.donorCapitalExpenditure` → 0 | **4** |

⇒ 두 축 모두 **세액에 도달하고 anchor 가 지킨다**. 근거 조문도 확인했다 —
소득세법 **§97조의2①2호**: 「제97조제1항제2호에 따른 필요경비에는 거주자의 배우자 또는
직계존비속이 해당 자산에 대하여 지출한 같은 호에 따른 금액을 **포함**한다」.

> ⭐ **잔여 목록의 항목도 재측정 대상이다.** 처음 grep 이 `head -8` 로 잘려 `lib/tax-engine`
> 히트를 못 봤고, 그대로였으면 **이미 있는 배선을 다시 만들 뻔했다**.
> (`project_transfer_redev_rights_review_2026_08` 의 「잔여 개수를 믿지 말고 코드를 재측정하라」
> 와 같은 실패 모드.)

---

## 17. 잔여-1 종결 (2026-08-27) — 국외 신고에도 가산세가 붙는다

PR #1331(Phase A′)은 국내+국외 **혼합** 신고의 국외 소득분을 base 에 넣었지만, **국내 종목이
하나도 없는 신고**는 여전히 가산세 0이었다. `ForeignStockInput` 에 신고축이 **타입 자체에 없어**
대표 축을 고를 수 없었고, 국외 **단건** 경로도 가산세를 계산하지 않았다.

근거는 같다 — 소득세법 **§118조의8** 이 §105~§107(예정신고)·§110~§112(확정신고·납부)를 준용하고,
국세기본법 §47조의2·§47조의3 은 「국세의 과세표준 **신고**」 단위로 걸린다. 해외주식만 거래한
납세자라고 가산세를 면할 근거는 없다.

| 축 | 조치 |
|---|---|
| 타입 | `ForeignStockInput` 에 신고축 9칸(전부 optional — 미선언 = 정상신고) · `ForeignStockResult` 에 가산세 3칸 |
| 엔진 | `foreign-stock.ts` STEP 11.5 — base 는 **외국납부세액공제 반영 후** 금액(국내 finalize 와 같은 구조) |
| aggregate | `pickFilingAxisInput` — 국내 우선, 없으면 **신고축을 선언한 국외 종목** |
| 배선 | ④ foreign body · ⑫ `stock-transfer-foreign-schema.ts` · ⑭ `buildForeignEngineInput` + Date 2칸 |
| 표시 | `ForeignStockResultCard` 가산세 2행 + 기준금액 echo + 「+ 가산세」 산식 |

> 🔑 **국외 경로는 스키마·매핑이 국내와 별개 파일이다** — 국내만 고치면 국외는 조용히 strip 된다.
> anchor FP-3 이 폼→④→⑫ 를 통째로 태워 그것을 막는다.

**공용 축 타입**: `FilingAxisFields`(finalize)를 국내·국외가 함께 쓴다. 국내는 Zod 가 3칸을
필수로 강제하고 국외는 optional 이라, 헬퍼는 `?? "none"`·`?? false` 로 읽는다.

anchor 14건 · **뮤테이션 4종 전부 감지**(단건 가산세 · aggregate 축 선택 · ⑫ zod · 결과 카드).

---

## 18. B-2 종결 (2026-08-27) — 상장 비대주주 장외 카테고리 통합

`listed_otc_non_major` 와 `listed_off_market_non_major` 는 **같은 사실**(상장 비대주주가 증권시장
밖에서 양도)을 두 이름으로 부르고 있었다. 실측하면 취급이 완전히 같다:

- 세율: `stock-transfer-rate-calc.ts:114-115` **fall-through** (§104①11호나목)
- 분할 모드: `NON_MAJOR_SINGLE_RATE_CATEGORIES` 에 **둘 다** 포함
- 조문: PR #1327 이 후자를 `①3가2)` 로 교정해 **완전히 겹침**

**K-OTC 쪽 이름을 버린 이유** — 상장주식의 K-OTC 거래는 법문상 성립하지 않는다(자본시장법
§286①5호). 상장 종목에서 그 토글이 뜻하는 것은 **ATS**(§8조의2⑤)이고 그것도 「증권시장 밖
거래」의 한 갈래다(Phase G 에서 확인). ⇒ 사실을 담는 이름은 하나면 된다.

⚠️ **union·라벨은 지우지 않았다** — 저장된 이력에 남아 있다. **새로 만들지 않을 뿐**이고,
`calcSplitModeTax` 의 legacy 세율 취급도 anchor 로 계속 고정한다.

**부수 발견 — 표시가 엔진과 어긋나 있었다**: 결과뷰 라벨이 `listed_off_market_non_major` 를
「§94①3 **가목1) 본문**」이라 적고 있었다. 엔진은 PR #1327 에서 `①3가2)` 로 고쳤는데 라벨이
따라오지 않은 것이다(가목 1)은 **대주주** 조항이라 정반대). ⇒ 라벨 정정.

**stale 주석 2건도 정정**: `on-market-venue.test.ts` OM-7 주석은 「listed_otc_non_major 보존」이라
적었지만 **단언은 처음부터 `unlisted_non_major`** 였다.

anchor 5건(통합·세액 불변·전 조합에서 legacy 미생성·장내 비과세 유지) · 뮤테이션 1종 감지.

---

## 19. B-3 보류 (2026-08-27) — 증권거래세 2021 이전 세율, **도구로 축자 확보 실패**

### 19.1 확보한 것

**증권거래세법 §8①(본법·비상장 세율) 개정 전 축자** — `legal_research(amendment_track · time_travel
20190916↔20210101)` 신구대조:

> [전] 제8조(세율) ① 증권거래세의 세율은 **1천분의 5**로 한다.
> [후] 제8조(세율) ① 증권거래세의 세율은 1만분의 35로 한다. 다만, 2021년 1월 1일부터
>      2022년 12월 31일까지는 1만분의 43으로 한다.

⇒ 2021-01-01 이전 **비상장** 세율 = 1천분의 5 = **50/10000**. (구간 개정 연혁도 확보:
2020.04.01 시행 제16837호 · 2021.01.01 시행 제17655호.)

### 19.2 막힌 것

매트릭스가 필요로 하는 **코스피·코스닥·코넥스 탄력세율은 시행령 §5**에 있는데, 그 **과거 시행본을
도구가 주지 않는다**:

| 시도 | 결과 |
|---|---|
| `get_law_text(mst=280901, jo="제5조", efYd=20200101)` | `EXTERNAL_API_ERROR` (HTML 에러 페이지) |
| `get_law_text(lawId=005028, jo="제5조", efYd=20200601)` | `NOT_FOUND` |
| `legal_research(amendment_track)` — query 를 시행령으로 | **본법** 이력만 반환 |

메모리 `feedback_korean_law_historical_efyd_unavailable` 이 경고한 그대로다.

### 19.3 왜 부분 구현을 하지 않는가

비상장(본법)만 정확해지고 상장 3시장(시행령)은 fallback 이면 **한 화면 안에서 근거가 갈린다** —
경고 문구도 「일부만 지원」이 되어 더 헷갈린다. 무엇보다 **추정 금지**다
(`feedback_historical_tax_tables` · 계획서 §검증 기준).

⇒ **보류**. 다음 시도자를 위해 남긴다:
- 확보된 축자(위 §19.1)는 그대로 쓸 수 있다.
- 남은 것은 **시행령 §5 의 2019~2020 본문** 하나다.
- 경로 후보: 국가법령정보센터 화면 캡처를 **사용자가 제공**(C1-02·R-2 가 그렇게 풀렸다) ·
  `~/taxlaw-offline/` .mhtml 아카이브 · 조세심판원 결정문의 인용
  (`feedback_historical_statute_value_via_tribunal`).
- ⚠️ **현행 동작은 안전하다** — fallback + 미지원 경고(A-30)라 사용자를 오도하지 않고,
  증권거래세는 양도소득세 계산에 들어가지 않는 **정보성 표시**다.

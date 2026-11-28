# 국외주식 외화 환산 4건 정정 — 엔진·API 계획서

> 상태: **Plan 초안 — 사용자 결정(§8 Q-n) 대기** · 작성 2026-11-28 · 기준 트리 master `2e47de6b4`(워크트리 `stock-fx-plan`)
> 짝: [UI 계획서](foreign-stock-fx-fixes.ui.plan.md)(UI 시니어 병렬 작성) · 발단: [국외 부동산 엔진 계획서 §9](transfer-foreign-realestate.engine.plan.md) 별건 발견 ①②③
> 법령 실독: 2026-11-28 KoreanLaw MCP — 소득세법 시행령 MST 290841(시행 2026-10-01) · 소득세법 시행규칙 MST 286379(시행 2026-05-22 본문). 수치는 전부 throwaway probe 실측(스크래치패드, 저장소 무변경).
> **이 문서는 계획이다. 코드·테스트를 바꾸지 않았다.**

---

## §0 요약

| # | 쟁점 | 현재 | 실측 | 판정 |
|---|---|---|---|---|
| 1 | 환산 1원 과소 | `Math.floor(외화×환율)` 부동소수 | 격자 0.002~1.5% 과소, 과대 0건, 최대 1원. 산출세액 영향 20%, 지방세 10원 | **결함 — 수정(PR-1, 결정 불요)**. 공용 leaf 신설 |
| 2 | 필요경비 환율 fallback | 자본적지출·양도비 미입력 → 양도일 환율 | 5,000 USD+200 USD 사례 산출세액 250,400원 차이 | **부분 결정된 설계** — 변경하려면 **사용자 재결정**(Q-2). 외국세 환율 fallback은 이미 ⑧⑫ 차단(엔진 죽은 코드) |
| 3 | FS-09 장기할부 | 수령일별 환율 | 3회 수령 사례 산출세액 1,500,000원 차이(방향은 환율 경로에 의존) | **문언과 상충** — 영 §178의5②는 «양도일 1회». 현행은 ①(비장기할부 분할) 읽기. Q-3 결정 필요 + **별건 결함 F-1(⑧↔⑫ 모순)** |
| 4 | `foreign-options.ts` 라벨 리터럴 | `"세액공제 (§118의6①1호)"` | — | 사소 — UI 계획서로 넘김(§7) |

**착수 순서 권고**: PR-1(#1)은 즉시 가능. PR-2(#2)·PR-3(#3)은 Q-2·Q-3 결정 전 구현 금지(「조용한 변경 금지」). F-1은 브라우저 재현(V-2)이 나오면 Q-3과 무관하게 먼저 고친다.

---

## §1 이슈 1 — 환산 1원 과소

### 1.1 현재 거동 (파일을 읽어 확인)

`lib/tax-engine/stock-transfer/foreign-stock.ts` (510줄):

| 줄 | 식 | 의미 |
|---|---|---|
| :97 | `Math.floor(r.amountForeign * r.exchangeRate)` | 분할 수령 행별 |
| :199 | `Math.floor(totalForeign * input.transferExchangeRate)` | 양도가액 총액 입력 |
| :204 | `Math.floor(perShare * input.shareCount * input.transferExchangeRate)` | 양도가액 1주당 |
| :216-218, :223-225 | `Math.floor(perShareAcq * shareCount * acquisitionExchangeRate)` | 취득가액(실가·시가) |
| :246-247 | `Math.floor(capitalExpenditureForeign * capExRate)` · 양도비 | 필요경비 |
| :257 | `Math.floor(foreignTaxPaidForeign * fxRate)` | 외국납부세액 |

같은 식이 **엔진 밖·엔진 이웃에도** 있다(실측 grep):
- `foreign-stock-carryover.ts:33` `foreignAcquisitionKrw`(이월과세 B열 취득가액) · `:120` 증여자 자본적지출 `Math.floor(외화×환율)`.
- UI 거울: `ForeignStockPriceBlock.tsx:163·166·259` · `ForeignCarryoverBlocks.tsx:76` · `StockSidebar.tsx:207·210` — 화면 미리보기가 엔진과 어긋나는 위치(§7 UI 계획서 몫).
- 범위 밖 별건: `exit-tax.ts:320`(국외전출세 외국납부세액 `Math.floor(외화×환율)`). 같은 도메인 파일의 `exit-tax-fx.ts`는 이미 BigInt 정확 환산(`toKrwExact`)이다.

### 1.2 이미 있는 정확 환산 leaf 3종 (재사용 평가)

| 위치 | 시그니처 | 특성 |
|---|---|---|
| `lib/tax-engine/foreign-realestate/fx.ts:36` `toKrw(amount, rate, path)` · `:58` `tryToKrw` | 외화액·환율 모두 소수 ≤4자리, 외화액 ≤1e11, 환율 ≤1e7, 음수·환율≤0 거부, `TaxCalculationError` | 국외 부동산 PR로 격자 테스트(`a1-fx-krw.anchor.test.ts`)·⑧↔⑫ 패리티 완비. **수량 인자 없음** |
| `lib/tax-engine/stock-transfer/exit-tax-fx.ts:70` `toKrwExact(amount, rate, quantity)` | 환율 ≤4자리, 외화액 ≤10자리, **수량 곱을 BigInt에서 1회** | 국외전출세 전용. 상한·`path` 없음 |

**권고**: 새 순수 leaf `lib/tax-engine/fx-krw.ts`(공통 utils 층 — 도메인 의존 0, 의존은 `tax-utils`·`tax-errors`뿐)를 만들고 `foreign-realestate/fx.ts`는 `export * from "../fx-krw"`로 **얇게 남긴다**(9개 importer·a1 테스트 경로 무변경 — Surgical). 신규 leaf는 `toKrw`에 선택 인자 `quantity = 1`을 추가한다(식 `a.n × r.n × BigInt(quantity) ÷ 10^(ka+kr)`). `exit-tax-fx.toKrwExact` 통합은 **하지 않는다**(상한·자릿수 규약이 달라 국외전출세 anchor를 건드린다 — Q-6).

`toKrw(perShare * shareCount, rate)`로 부르지 않고 **`quantity`를 받는 이유**: `perShare * shareCount`가 이미 부동소수 곱이다(예 `0.1*3`). 실측(§1.3 격자)에서는 불일치 0건이었지만 보장이 아니라 우연이다.

### 1.3 영향 실측 (probe — 결정적 PRNG, 격자당 400,000건)

기준값은 BigInt 정확 곱 floor(독립 구현). «현행» = `Math.floor(...)` 그대로.

| 격자 | 과소 | 과소율 | 과대 | 최대 차 |
|---|---:|---:|---:|---:|
| A 1주당 2자리 × 주수 1~5,000 × 환율 2자리 | 145 | 0.036% | 0 | 1원 |
| B 1주당 2자리 × 주수 × 환율 4자리 | 6 | 0.002% | 0 | 1원 |
| C 총액 2자리 × 환율 2자리 | 29 | 0.007% | 0 | 1원 |
| D 총액 정수 × 환율 2자리 | 737 | 0.184% | 0 | 1원 |
| E 총액 정수 × 환율 4자리 | 23 | 0.006% | 0 | 1원 |
| F 1주당 정수 × 주수 × **환율 1자리** | 6,042 | **1.510%** | 0 | 1원 |

- 과소는 **정확 곱이 정수일 때만** 난다(환율 소수자리가 적고 금액이 «둥글수록» 잘 걸린다 — F가 최대).
- 대조: 기존 `toKrw(a×q, r)`(부동산 leaf)·`toKrwExact`(국외전출세) 모두 6개 격자 **불일치 0건**(`quantity` 인자를 추가한 신규 leaf는 PR-1 A-1-3이 같은 격자로 재확인).
- 알려진 사례: `Math.floor(400000*1300.10)` = 520,039,999 / 정확 520,040,000.
- **세액 영향**(총액 정수 달러 × 환율 2자리 2,000,000건 중 과소 4,192건에 취득가액 무작위 부여): 산출세액이 갈린 것 823건(19.6% — `floor(0.2×과세표준)`의 5배수 경계), **지방소득세가 갈린 것 8건**, 합계 최대 **11원**. 구체 사례(엔진 실측): 총액 400,000 USD × 1,300.10, 취득 96,000,000 → 양도가액 520,039,999 · 산출세액 84,307,999 · 지방세 8,430,790(정확값은 84,308,000 · 8,430,800).
- 결론: 금액은 작지만 **거짓 1원**이다(국외전출세 `exit-tax-fx.ts` 헤더가 5억 경계에서 과세/제외가 바뀐다고 적은 것과 같은 부류 — 국외주식 §104①12호는 경계가 없어 세액 영향은 최대 11원). 부동산이 고쳤으므로 **주식만 남기면 같은 환율·같은 금액이 자산별로 다른 원화가 된다**.

### 1.4 설계

1. `lib/tax-engine/fx-krw.ts` 신설(`toKrw`·`tryToKrw`·`FX_MAX_DECIMALS`, `quantity` 인자). `foreign-realestate/fx.ts`는 re-export.
2. `foreign-stock.ts`의 §1.1 표 8곳 + `foreign-stock-carryover.ts:33·120`을 leaf 호출로 교체. 절사는 **항목별 1회**(FX-4 규약·부동산 V-13과 동일) — 1주당×주수×환율은 `toKrw(perShare, rate, path, shareCount)`.
3. **신규 거부 규칙**(부동산과 동일, Q-5): 외화액·환율 소수 5자리↑·환율≤0·비유한 → `TaxCalculationError(INVALID_INPUT)`. 현재 ⑫는 `z.number().positive()`뿐이라 실측 `capitalExpenditureExchangeRate: 1300.123456`이 **통과**한다(probe4) — leaf가 던지면 route(`handleForeignStock` catch)가 **500**을 내므로 ⑫가 먼저 같은 함수(`tryToKrw`)로 막아야 한다(부동산 `transfer-foreign-refines.ts:69` 선례, 국외전출세 `departureExchangeRate: 1400.12345 → 400` 선례).
4. 이월과세 gate(`foreign-stock-carryover.ts:51-53`)의 `> 0` 술어는 leaf 검증과 같은 값이어야 한다 — 같은 파일에서 환산 호출을 leaf로 바꾸므로 `donorCapitalExpenditureExchangeRate ?? 0` 곱도 leaf로.

### 1.5 14지점 (주식 — ①②③⑤⑥⑦은 UI 계획서)

| 지점 | 파일 | 변경 |
|---|---|---|
| 엔진 | `foreign-stock.ts`·`foreign-stock-carryover.ts` | §1.1 교체 |
| ④ | `lib/calc/stock-transfer-tax-api-foreign-exit.ts` | 변환값은 그대로(문자열→숫자). 소수 5자리 입력은 ⑧이 먼저 막으므로 변경 없음 — **grep으로 확인** |
| ⑧ | `lib/calc/stock-transfer-tax-validate-foreign.ts` | 환율 4곳+외화액 칸에 `tryToKrw` 같은 함수 호출(자릿수·상한). 설치 위치: Step2 양도·취득·필요경비·외국세·이월과세 donor 행 |
| ⑨⑩⑫ | `lib/api/stock-transfer-foreign-schema.ts` (253줄) | `superRefine`에 같은 `tryToKrw` — 분할 수령 배열 행 포함. ⑩ 컴패니언은 주식에 별도 파일 없음(같은 파일 superRefine이 ⑩ 겸임 — 이 점 §1.5 점검 시 명시) |
| ⑬ | `lib/calc/stock-transfer-tax-api.ts:624` `callStockTransferTaxAPI` | 신규 필드 없음 — 무변경 확인 |
| ⑭ | `app/api/calc/stock-transfer/route.ts` `buildForeignEngineInput` | 신규 필드 없음. **catch의 `TaxCalculationError`→400 매핑**은 Q-5 (b)에서만 |

### 1.6 anchor·mutation

Pre-Do anchor(구현 전 작성·RED 확인):
- **A-1-1** 총액 400,000 × 1,300.10 → `transferPriceKrw` = 520,040,000 (현행 520,039,999 RED).
- **A-1-2** 1주당 × 주수 경로·취득가액·자본적지출·양도비·외국세·분할 수령 행 — 각 경로 1건(현행 RED).
- **A-1-3** 격자 전수: 독립 문자열 파싱 기준 구현(`a1-fx-krw.anchor.test.ts`의 `referenceFloor` 방식 재사용)과 **엔진 `calculateForeignStockTax`의 환산값** 일치(leaf 단위가 아니라 엔진 출력으로 — 엔진이 leaf를 안 쓰고 있으면 잡힌다).
- **A-1-4** ⑧↔⑫ 패리티 격자: 소수 5자리·0·음수·1e11 초과를 각 칸에 넣어 둘 다 막는지(UI 통과 ↔ API 차단 모순 금지).
- **A-1-5** 회귀: 환율이 둘 다 정수인 기존 anchor(FX-1~4·fs09 340줄·94-1-3 트랙) 값 불변.

Mutation(1개씩 되돌려 과녁 anchor만 RED인지): M-1 `:204`만 `Math.floor` 복귀 → A-1-2(1주당) · M-2 `:257` 복귀 → 외국세 anchor · M-3 carryover `:33` 복귀 → 이월과세 B열 · M-4 ⑫ superRefine 제거 → A-1-4(API 쪽만) · M-5 ⑧ 제거 → A-1-4(UI 쪽만).

---

## §2 이슈 2 — 필요경비·외국세 환율 fallback

### 2.1 현재 거동 (읽어서 확인)

| 필드 | 엔진 | ⑧ validate | ⑫ Zod | 도달 가능성 |
|---|---|---|---|---|
| `capitalExpenditureExchangeRate` | `:244` `?? transferExchangeRate` | `validate-foreign.ts:321-328` **비움 허용**(넣었는데 ≤0만 차단) | `schema:111` `positive().optional()` | **살아 있는 fallback** |
| `transferCostExchangeRate` | `:245` 동일 | 동일 | 동일 | **살아 있는 fallback** |
| `foreignTaxExchangeRate` | `:256` `?? transferExchangeRate` | `:350-361` **필수** | `schema:215` **필수**(`hasForeignTax`) | API·UI 경유로는 **도달 불가**(엔진 직접 호출·단위 테스트 한정) — 죽은 fallback |

### 2.2 결정 출처 조사 (grep 결과 — 추정 아님)

- **자본적지출·양도비**: 커밋 `9bcd62870`(2026-09-17, 제보 «환율이 없네»에 대한 Claude Opus 설계). 본문 «**미입력이면 양도일 환율로 떨어진다 — 기존 계산 불변(anchor FX-3 · E2E FXE-3)**»은 **하위 호환 선택**으로 적혀 있고 사용자의 fallback 승인 문장은 없다. memory·docs 검색(`FX-3`·`지출일 환율`·`환율 fallback`) 결과 사용자 결정 기록 **0건**. 다만 ⑧ 주석(`validate-foreign.ts:312-316`)·anchor FX-3가 의도적 설계로 고정했다.
- **2026-11-26 사용자 결정**(이월과세 계획 Q-1~Q-12 전부 추천안 승인 — [foreign-stock-carryover-97-2.plan.md:5·§4 Q-4](foreign-stock-carryover-97-2.plan.md)): 신규 **증여자** 지출일 환율은 **차단**(3대 정책 #2), «**기존 수증자 축의 대체 규칙은 건드리지 않는다**». ⇒ 그 PR 범위 한정의 «손대지 않음» 결정이며 fallback을 옳다고 확정한 것이 아니다. 해당 계획서 `engine.plan.md:118`이 같은 사실을 «기존 필요경비 환율은 양도일 fallback이 있으나»로 기록.
- **외국세**: 커밋 `38b18947c`(2026-09-30, B22) — «외국납부세액 납세일 환율 → **양도일 환율로 대신**»을 결함으로 보고 ⑧의 거울로 ⑫를 막음. 사용자 결정 문장은 커밋에 없다(확인 필요).
- 국외 부동산(신규)은 전 항목 **fallback 없음·환율 필수**(`toKrw`가 환율≤0 throw, 부동산 계획 V-12 — 2026-11-28 사용자 승인).

⇒ 분류: **«자본적지출·양도비 fallback = 결정된(그러나 사용자 명시 승인 미확인) 설계 — 변경하려면 사용자 재결정 필요»**. 이 계획은 **조용히 바꾸지 않는다**. 외국세 환율은 B22로 정책이 이미 «차단»이다.

### 2.3 법적 근거 (verbatim — MCP 2026-11-28)

- 소득세법 시행령 §178의5① «법 제118조의4제2항의 규정에 의하여 양도차익을 계산함에 있어서는 양도가액 및 **필요경비를 수령하거나 지출한 날 현재** 「외국환거래법」에 의한 기준환율 또는 재정환율에 의하여 계산한다.» ⇒ 항목마다 **지출일** 환율. 양도일은 양도가액에만 쓴다.
- 소득세법 시행규칙 §60② «외국납부세액의 원화환산은 **외국세액을 납부한 때**의 「외국환거래법」에 의한 기준환율 또는 재정환율에 의한다.» (①이 «양도소득금액»을 명시). 부동산 계획 V-12가 2026-11-28 사용자 승인으로 이 읽기를 채택.
- 어느 조문에도 «지출일 환율을 모르면 양도일 환율로 환산한다»는 규정이 없다. 필요경비의 양도일 환율 환산은 **법이 허용하는 근사가 아니라** 입력 누락의 대용이다.

### 2.4 수치 영향 (엔진 실측, 1,000주 × 150 USD 양도 @1,350 · 취득 80 USD @1,200 기준)

| 사례 | 필요경비 | 산출세액 | 지방세 | 합계 |
|---|---:|---:|---:|---:|
| 자본적지출 5,000 USD + 양도비 200 USD — **환율 미입력**(양도일 1,350으로 대신) | 7,020,000 | 19,396,000 | 1,939,600 | 21,335,600 |
| 같은 금액, **지출일 환율 1,100 / 1,340 입력** | 5,768,000 | 19,646,400 | 1,964,640 | 21,611,040 |
| **차이** | −1,252,000 | **+250,400** | +25,040 | +275,440 |
| 외국세 5,000 USD(credit) — 양도일 1,350 대신 | 공제 6,750,000 | 결정세액 14,050,000 | | |
| 같은 세액 납부일 1,300 | 공제 6,500,000 | 결정세액 14,300,000 | | (공제 차 250,000 — **이 경로는 ⑧⑫가 막아 앱에선 불가**) |

미입력 시 **어떤 환율이 쓰였는지**는 결과 카드·`capitalExpenditureExchangeRateApplied`/`transferCostExchangeRateApplied` echo로 이미 표시된다(`foreign-stock.ts:124-125`). 사용자가 입력 칸을 비우는 빈도는 측정 불가(**확인 필요** — 운영 로그 없음).

### 2.5 선택지 (Q-2)

- **(a) 유지** — 결정된 설계 존중. 결과 `warnings`에 «지출일 환율 미입력 — 양도일 환율 적용(영 §178의5① 불일치 가능)» 상시 고지만 추가(세액 불변). 변경 파일 최소.
- **(b) 금액>0이면 환율 필수(차단)** — ⑧·⑫·엔진 모두. FX-3 anchor 반전. 근거: 영 §178의5①·3대 정책 #2·부동산/이월과세/외국세 B22와 정합. 대가: 기존 입력·저장 이력 재계산 시 새 400, E2E FXE-3 변경, 금액만 넣던 사용자 흐름 변경.
- **(c) (b)+이력 호환 경고** — 새 계산은 차단, 이미 저장된 이력의 재열람은 막지 않음(결과 화면은 저장 resultData 사용 — 재계산 시에만 차단). 구현 범위는 (b)와 같고 UI 안내만 추가.
- 하위 결정 **Q-2-1**(외국세 엔진 죽은 fallback `?? transferExchangeRate` 삭제): 선택지와 무관하게 **삭제 권고** — B22로 정책이 이미 차단이고 앱에서 도달 불가이므로 세액 불변. 엔진 단위 테스트 중 환율 없이 호출하는 케이스 유무 **확인 필요**(구현 PR의 Pre-Do grep).

**권고: (b)**(근거: 영 §178의5①은 지출일 환율을 요구하고 fallback 근거가 없으며, 같은 앱의 신규 3개 축이 전부 차단이라 주식 필요경비만 예외인 상태가 정책 불일치). 단 «결정된 설계»라 **사용자 재결정 후에만** PR-2 착수. (a)를 고르면 PR-2는 경고 문구 1건으로 축소.

### 2.6 (b) 채택 시 14지점·anchor

④ 환율 미입력 키 미송신은 유지(0 송신 금지 규칙 불변) · ⑧ `checkExpenseRate`를 «금액>0이면 필수 + >0»로 · ⑫ superRefine에 `capitalExpenditureForeign>0 && !(rate>0)` · 엔진 `foreign-stock.ts:244-245` fallback 삭제 → leaf throw(환율 미입력 불가) · 조기 반환(`:151-154`)의 echo도 fallback 제거(`undefined` echo) — **echo 타입이 `number`면 optional화 필요**(결과 타입·UI 결과 카드 영향 — 구현 PR에서 grep) · ⑭ 매핑 변경 없음.
anchor: A-2-1 금액>0·환율 없음 → ⑧ 오류·⑫ 400·엔진 throw(셋 같은 술어 — 격자 패리티) · A-2-2 금액=0·환율 없음 → 통과(0원 항목에 환율을 묻지 않는다) · A-2-3 FX-1·2·2b·4 불변 · A-2-4 FX-3 **반전**(통과→차단).
mutation: M-1 ⑧만 제거 → A-2-1(UI) · M-2 ⑫만 제거 → A-2-1(API) · M-3 엔진 fallback 복원 → A-2-1(엔진).

---

## §3 이슈 3 — FS-09 장기할부

### 3.1 법문 (verbatim — MCP 2026-11-28)

- 소득세법 시행령 §178의5② «제1항의 규정을 적용함에 있어서 제162조제1항제3호의 규정에 의한 **장기할부조건의 경우에는 동호의 규정에 의한 양도일 및 취득일을 양도가액 또는 취득가액을 수령하거나 지출한 날로 본다.**» <신설 2001.12.31>
- 같은 영 §162①3호 «**재정경제부령이 정하는 장기할부조건**의 경우에는 소유권이전등기(등록 및 명의개서를 포함한다) 접수일·인도일 또는 사용수익일중 **빠른 날**»(양도·취득 시기).
- 소득세법 시행규칙 §78③ «영 제162조제1항제3호에서 "재정경제부령이 정하는 장기할부 조건"이라 함은 법 제94조제1항 각호에 규정된 자산의 양도로 인하여 해당 자산의 대금을 월부·연부 기타의 부불방법에 따라 수입하는 것중 다음 각호의 요건을 갖춘 것을 말한다. 1. **계약금을 제외한 해당 자산의 양도대금을 2회이상으로 분할하여 수입할 것** 2. 양도하는 자산의 소유권이전등기(등록 및 명의개서를 포함한다) 접수일·인도일 또는 사용수익일중 빠른 날의 다음날부터 **최종 할부금의 지급기일까지의 기간이 1년 이상**인 것»(2026.1.2. 개정 표기).
- ①(비교): 수령한 날 환율 — 장기할부가 **아니면** 분할 수령도 각 수령일 환율이 원칙.

### 3.2 코드 vs 법문

- `foreign-stock.ts:76-84` 주석: ②를 인용하고서 «→ 각 수령일의 기준환율을 개별 적용». `:175-193` `installments` 모드 = 수령일별 `Math.floor(금액×환율)` 합산.
- 법문 대조: **②가 적용되는 «장기할부조건»**이면 양도일 1회 환율(②)이고 수령일별이 아니다. 수령일별 환산은 **①의 비장기할부 분할**에 맞다. 즉 모드가 ①의 결과를 내면서 라벨·주석·UI 안내(`InstallmentReceiptsMatrix.tsx:40` «장기할부조건 양도: 각 수령일의 기준환율», `ForeignStockPriceBlock.tsx:56` hint, `foreign-stock-shared.tsx:34-35`, `ForeignStockResultCard.tsx:123`)는 ②를 걸고 있다 — **인용 조문과 결과가 반대**.
- 취득 쪽: ②의 «취득일»은 취득가액 지출일로 본다 — 현행 취득가액은 단일 취득일 환율이라 ②와 **이미 일치**(변경 불요).
- 근거 이력: FS-09는 커밋 `5e67a7852`(2026-05-19)로 구현. 트랙 계획 [foreign-stock-94-1-3-da-statute-track.plan.md:178](foreign-stock-94-1-3-da-statute-track.plan.md)이 §178의5 원문을 인용한 뒤 «현행 엔진의 FS-09 분할수령 처리는 **근거가 살아 있다**. 변경 없음.» 한 줄로 결론 — 소규 §78③·수령일/양도일 대조 분석은 없다. FS-09에 대한 사용자 Q 결정 기록은 **미발견**(docs grep `FS-09` 결과 기준 — grep 한계가 있어 확인 필요).

### 3.3 수치 영향 (엔진 실측, 150,000 USD = 50,000 × 3회, 취득 96,000,000)

| 시나리오 | 양도가액 | 과세표준 | 산출세액 | 지방세 | 합계 |
|---|---:|---:|---:|---:|---:|
| 현행(수령일별 1,350 / 1,300 / 1,250) | 195,000,000 | 96,500,000 | 19,300,000 | 1,930,000 | 21,230,000 |
| ② 본문(양도일 1,350 × 150,000 1회) | 202,500,000 | 104,000,000 | 20,800,000 | 2,080,000 | 22,880,000 |
| 차이 | +7,500,000 | | **+1,500,000** | +150,000 | **+1,650,000** |
| 환율 상승 경로(1,350 / 1,400 / 1,450): 현행 | 210,000,000 | 111,500,000 | 22,300,000 | 2,230,000 | 24,530,000 |
| ② 본문(동일) | 202,500,000 | | 20,800,000 | | 22,880,000 (현행이 **+1,650,000** 큼) |

방향은 환율 경로에 의존하므로 «불리/유리»로 일반화하지 않는다. 발생 빈도(국외주식 장기할부 양도)는 **확인 필요**(자료 없음).

### 3.4 별건 결함 F-1 — 분할 수령 모드 ⑧↔⑫ 모순 (Q-3과 무관, probe 실측)

- ⑧ `validate-foreign.ts:197` «분할 수령 모드에서는 단일 양도일 기준환율 검증 생략», UI `ForeignStockPriceBlock.tsx:88-135`는 `installments`일 때 **양도일 환율 칸을 숨김**.
- ⑫ `stock-transfer-foreign-schema.ts:92` `transferExchangeRate: z.number().positive()` **필수**.
- probe4: 분할 수령 본문에 `transferExchangeRate`를 빼면 `safeParse` → `["transferExchangeRate","Invalid input: expected number, received undefined"]` **실패**. 화면에서 단일 모드 값이 남아 있지 않은 신규 입력이면 UI 통과 ↔ API 400. **브라우저 재현은 미실시** — V-2.
- 얽힘: 이 모드에서 자본적지출·양도비 환율 fallback(`:244-245`)이 `transferExchangeRate`를 읽으므로 undefined이면 `Math.floor(x*undefined)` = NaN 위험 — ⑫가 현재 막고 있어 도달 불가일 뿐이다. Q-2 (b)가 이 얽힘도 해소한다.

### 3.5 선택지 (Q-3)

- **(a) 라벨·안내만 정정** — 모드를 «분할 수령(수령일별 환율, §178의5①)»로 재명명, ② 해당 시 «양도일 환율 1회 — 이 계산기는 지원하지 않음, 확인 필요» 고지. 세액 불변. 국외 부동산이 택한 «미지원+고지»(부동산 계획 Q-13)와 같은 노선. 문제: 장기할부 요건을 충족하는 사용자는 **조용히 틀린 값**을 받는다(고지가 있어도).
- **(b) 장기할부 판정 후 분기** — 판정 = 소규 §78③ 두 요건: ①계약금 제외 2회 이상 분할 ②양도일(영 §162①3호의 빠른 날) 다음날부터 최종 지급기일까지 ≥1년(`addYears` 등 UTC 달력 — `lib/tax-engine/utc-date`, 민법 기간 계산은 `civil-period.ts` 선례 확인 필요). 충족 → 양도가액 = 외화 합계 × **양도일 환율**(`toKrw`, 1회), 미충족 → 수령일별(①). 요건 ①을 판정하려면 **행별 «계약금» 표시**가 필요하다(없으면 계약금+잔금 2회를 장기할부로 오판). **토글로 선택하게 하지 않는다**(강행규정에 토글 금지 — memory `feedback_toggle_gating_a_mandatory_statute`): 사실(날짜·계약금 여부)을 입력받아 엔진이 판정, 결과에 판정 근거 echo. 대가: 행 필드 1개 신설 → 14지점 전수(§3.6), `ForeignDatedAmountRows` 공용 leaf(부동산 공유) 영향.
- **(c) (b)에서 요건 ①을 건수로만 판정** — 계약금 구분 없이 «수령 ≥2건» + 기간 ≥1년이면 ②. 구현 단순하나 계약금+잔금 사례를 **조용히 오판** — 비권고.

**권고: (b)**. 근거: 인용 조문과 결과가 반대인 상태를 라벨만 고치면(a) 장기할부 해당자의 세액이 조용히 틀린 채 남는다. 단 판정 입력(계약금 표시)·양도일 의미(V-1)가 UI 결정을 요구하므로 **사용자 결정 + UI 계획서와 합의 후** 착수. (a)는 PR 1건(UI 라벨·고지) 즉시 가능한 보수 대안이다.

### 3.6 (b) 채택 시 14지점 (행 필드 `isDownPayment?` + 엔진 판정 echo)

| 지점 | 변경 |
|---|---|
| ①②③ | 폼 행 타입(`InstallmentReceiptRow`)·initial·`normalizeFsInstallmentReceipts`(`normalize.ts:569-`) — UI 계획서 |
| ④⑬ | `stock-transfer-tax-api-foreign-exit.ts:121-136` 행 변환에 `isDownPayment` spread · `transferExchangeRate`는 **장기할부 판정 시에만 필수** → 판정 입력(날짜)이 ④에서 필요 |
| ⑤⑥⑦ | UI 계획서(계약금 표시·판정 결과·양도일 환율 칸 재노출·결과 카드 산식 «양도일 환율 1회») |
| ⑧ | `validate-foreign.ts:143-197` — 판정 함수를 **엔진 leaf에서 import**(복제 금지, single-source-engine-helper) · 판정=장기할부면 양도일 환율 필수·수령일별 환율 칸 불필요 |
| ⑨⑩⑫ | `installmentReceiptSchema`(`schema:57`)에 `isDownPayment: z.boolean().optional()` · superRefine에 같은 판정 leaf · **F-1 해소**: `transferExchangeRate`를 `.optional()`로 낮추고 모드별 조건부 필수(싱글·장기할부=필수) |
| ⑭ | `route.ts` `buildForeignEngineInput`의 `rawReceipts` map(`:222-227`)에 필드 추가 — 누락 시 침묵 stripping(⑫⑬⑭ grep 점검) |
| 엔진 | 판정 leaf 신설(예 `foreign-stock-installment.ts`) · `calcInstallmentTransferPrice` 분기 · `InstallmentReceiptDetail.mode`에 판정 echo(`"installments_decree_2" | "installments_per_receipt"` 류) · 결과 `appliedRules`·`warnings` |
| 법령 상수 | `legal-codes/`에 영 §162①3호·소규 §78③ 추가 + **`lib/legal-verification/manifest/additions-*.ts` 등록**(안 하면 `verify:legal` 대상에서 조용히 빠짐 — CLAUDE.md). 키워드는 위 MCP verbatim(«계약금을 제외한 해당 자산의 양도대금을 2회이상으로 분할하여 수입할 것»·«최종 할부금의 지급기일까지의 기간이 1년 이상»). `additions-transfer-foreign-realestate.ts:9`의 «영 §162①3호 장기할부 문언은 V-10 해소 전 미등록» 주석도 정정 |

### 3.7 anchor·mutation

Pre-Do anchor(실패 메시지로 설계 환류):
- **A-3-1** 위 §3.3 사례(요건 충족: 수령 3회·최종 지급 양도일 +1년 3개월) → 양도가액 202,500,000 · 산출세액 20,800,000(현행 195,000,000 RED).
- **A-3-2** 비충족(최종 지급 양도일 +11개월) → 수령일별 195,000,000 유지(현행 GREEN — **회귀 방지**).
- **A-3-3** 경계: 다음날부터 정확히 1년(민법 기간 — V-4) ±1일 · 계약금+잔금 2회(계약금 제외 1회 → ② 불적용) · 3회 중 1회 계약금(제외 후 2회 → 적용).
- **A-3-4** ⑧↔⑫ 패리티: 장기할부 판정 시 양도일 환율 필수 · 비판정 시 불필요 — 격자.
- **A-3-5** F-1: 분할 수령 + `transferExchangeRate` 없음 + 비판정 → ⑫ 통과(현행 RED).
mutation: M-1 판정 `≥1년` → `>1년` → A-3-3 경계 · M-2 계약금 제외 로직 제거 → A-3-3 · M-3 ⑧ 판정 복제를 다른 술어로 → A-3-4 · M-4 ⑭ receipts map에서 `isDownPayment` 제거 → **엔진 anchor는 통과하고 route-level anchor만 RED**(⑭ 침묵 stripping 전용 API 테스트 신규 필수).

---

## §4 이슈 4 — 라벨 리터럴 (UI 계획서로 이관)

`components/calc/foreign/foreign-options.ts:29` `label: "세액공제 (§118의6①1호)"` · `:34` `"필요경비 산입 (§118의6①2호)"`는 `§…` 문자열 리터럴이다. 이 파일은 주식(`ForeignStockExpenseBlock.tsx`)과 국외 부동산(`ForeignTaxSection.tsx`)이 공유한다. 기존 상수는 법·조 단위(`legal-codes/stock.ts:492-493` «소득세법 §118②·§118의6 (세액공제)», `transfer-foreign-realestate.ts:29` «소득세법 §118의6»)뿐이라 «①1호»·«①2호»를 담는 상수는 **없다**. 새 상수를 만들면 manifest(키워드 verbatim, 소득세법 §118의6① «다음 각 호의 방법 중 하나를 선택하여 적용» — MCP로 본문 확인 후) 등록이 필요하다. 세액 무관 — 엔진 변경 없음. 처리 방식은 UI 계획서가 정한다. (`StockAggregateSummaryCard.tsx:236`·`StockFilingFormTableHelpers.ts:518` 등에도 같은 «§118의6①1호» 리터럴이 있음 — 같은 PR에서 일괄할지 UI 계획서가 판단.)

---

## §5 PR 분할 (소형·순차)

| PR | 내용 | 선행 | 담당 |
|---|---|---|---|
| **PR-1** | 공용 leaf `fx-krw.ts` + 국외 부동산 `fx.ts` re-export + 주식 엔진·이월과세 환산 교체 + ⑧⑫ 패리티 + (Q-5 (b) 시) route 400 매핑 | 없음(결정 불요) | 엔진 → UI(미리보기 3곳 `ForeignStockPriceBlock`·`ForeignCarryoverBlocks`·`StockSidebar`은 leaf 호출) |
| **PR-2** | #2 — Q-2 결과 반영((a) 경고 1건 / (b)(c) 차단 + FX-3 반전 + Q-2-1) | Q-2 | 엔진 → UI |
| **PR-3a** ✅ | F-1 핫픽스(⑫ `transferExchangeRate` 조건부) — **V-2 브라우저 재현 후**. Q-3 (b)를 곧 할 거면 PR-3로 흡수 · 완료: V-2 재현(POST 400 `transferExchangeRate`) → ⑫ 단일만 필수 · 형제 모순(필요경비 금액>0·지출일 환율 없음·양도일 환율 없음 → 엔진 «환율 미입력 불가») ⑧⑫ 공용 leaf `foreignStockExpenseRateIssues` · 결과 카드 `fmtRate(undefined)` 크래시 가드 | V-2 | 엔진/API |
| **PR-3** | #3 — Q-3 결과((a) UI 라벨·고지 / (b) 판정 leaf + 14지점) + 법령 상수·manifest | Q-3 · UI 합의 | 엔진 → UI |
| **PR-4** | #4 라벨 상수 | — | UI |

각 PR: Pre-Do anchor 작성·RED 확인 → 구현 → `npx vitest run __tests__/tax-engine/stock-transfer/ __tests__/tax-engine/foreign-realestate/ __tests__/calc/ __tests__/api/`(국외 부동산 leaf 회귀 포함) → `npx tsc --noEmit` → **브라우저·E2E**(Network 탭 body, 환율 필드). 파일 크기: `foreign-stock.ts` 510줄·`stock-transfer-foreign-schema.ts` 253줄이라 PR-1·2는 800줄 정책 안. PR-3(b)는 판정을 sibling으로 분리해 `foreign-stock.ts`를 늘리지 않는다.

## §6 3대 정책 자가 점검 (계획 단계)

- useEffect 미러링: 해당 없음(엔진·API). UI 계획서에서 판정 결과를 store에 쓰지 말고 파생값(useMemo)로.
- 자동 안분/환율 fallback: #2가 정면 대상 — 사용자 결정(Q-2). 외국세 환율은 B22로 이미 차단.
- ⑧ 동기화: #1(자릿수·상한)·#2(필수)·#3(판정·양도일 환율)·F-1 모두 ⑧⑫가 **같은 leaf**를 부르도록 설계(복제 금지, 격자 패리티 anchor).

## §7 UI 계획서로 넘기는 것

1. 미리보기·사이드바·산식 표시가 엔진 leaf(`tryToKrw`)를 호출(인라인 `Math.floor(외화×환율)` 6곳 제거 — `ForeignStockPriceBlock.tsx:163·166·259`, `ForeignCarryoverBlocks.tsx:76`, `StockSidebar.tsx:207·210`).
2. 환율·외화 입력의 소수 4자리 제한 안내(FieldCard `hint` — placeholder 숫자 예시 금지).
3. Q-2 결과에 따른 필요경비 환율 칸 필수 표시·경고.
4. Q-3 결과에 따른 라벨 정정(«장기할부» 문구 4곳: `InstallmentReceiptsMatrix.tsx:40`·`ForeignStockPriceBlock.tsx:56`·`foreign-stock-shared.tsx:34-35`·`ForeignStockResultCard.tsx:123`)과 (b) 시 행 «계약금» 열·판정 결과 표시·양도일 환율 칸 재노출. `ForeignDatedAmountRows`는 부동산과 공유하므로 영향 범위 확인.
5. 이슈 4 라벨 상수.

## §8 사용자 결정 레지스터 (Q-n)

| Q | 질문 | 선택지 | 권고 |
|---|---|---|---|
| Q-1 | 공용 leaf 위치 | (a) `lib/tax-engine/fx-krw.ts` 신설 + 부동산 `fx.ts` re-export (b) 부동산 `fx.ts`를 주식이 직접 import (c) 주식 전용 복제 | **(a)** — (b)는 도메인 간 의존(도메인 독립 원칙·부동산 파일 이동 시 주식 파손), (c)는 복제 → 갈라짐 |
| Q-2 | 자본적지출·양도비 환율 미입력 시 | (a) 양도일 환율 유지+경고 (b) 금액>0이면 차단 (c) (b)+저장 이력 호환 | **(b)** — 그러나 **사용자 재결정 대상**(결정된 설계: 커밋 `9bcd62870`·이월과세 Q-4 «기존 축 건드리지 않음»). Q-2-1 외국세 죽은 fallback 삭제는 **예** |
| Q-3 | FS-09 장기할부 | (a) 라벨 정정+미지원 고지 (b) 소규 §78③ 판정 후 ② 양도일 1회 적용 (c) 건수로만 판정 | **(b)** (a)는 즉시 가능한 보수안 |
| Q-4 | (b) 선택 시 요건 ① 판정 입력 | 행별 «계약금» 표시 신설 / 입력 없이 건수만(c) | 행별 표시(오판 방지). UI 합의 필요 |
| Q-5 | 소수 자릿수 상한·위반 시 처리 | (a) 외화액·환율 4자리(부동산 K-27 동일) + ⑫ 선차단 + route에서 `TaxCalculationError` 400 매핑 (b) 외화액 10자리(`toKrwExact` 규약)·환율 4자리 | **(a)** — 부동산 패리티 격자·단일 leaf. 5자리 단가는 국내 상장 해외주식에 사실상 없음(**확인 필요** — 센트 미만 호가 시장 존재 여부) |
| Q-6 | `exit-tax-fx.toKrwExact`·`exit-tax.ts:320` 통합 | 이번에 포함 / 별건 | **별건** — 국외전출세 anchor·2027 규칙과 얽힘(Surgical). `exit-tax.ts:320` 1원 과소는 별도 PR로 기록만 |

## §9 미검증 레지스터 (V-n — 「확인 필요」)

| V | 무엇 | 영향 |
|---|---|---|
| V-1 | 폼 `transferDate`가 영 §162①3호 «빠른 날»(명의개서 접수일·인도일·사용수익일 중 빠른 날)인지 대금청산일인지 — 화면 라벨·도움말 실독 안 함 | Q-3 (b) 요건 ② 기간 기산일 |
| V-2 | F-1(분할 수령 + 양도일 환율 없음 → ⑫ 400) 브라우저·Network 재현 — Zod 수준만 실측 | PR-3a 우선순위 |
| V-3 | 장기할부 양도의 외화환산·분할 수령 환율에 대한 국세청 해석례·판례 — **검색 안 함**(문언만 근거) | Q-3 근거 강도 |
| V-4 | 소규 §78③ 2호의 «다음날부터 … 1년 이상» 기간 계산(민법 §157·§159 초일불산입·말일 만료) 확정 — `civil-period.ts` 적용 가능 여부 미확인 | A-3-3 경계 값 |
| V-5 | 소규 §78③·영 §162①3호의 **양도일 시점 시행본**(2020 이후) 대조 — 현행본만 실독 | 연혁 게이트 필요 여부 |
| V-6 | 「기준환율 또는 재정환율」정의 본문(외국환거래법 하위 규정) — 부동산 V-15와 동일 미실독 | 입력 칸 hint 문구 |
| V-7 | 주식 단가 소수 5자리↑ 실사례 | Q-5 |
| V-8 | 환율 fallback·FS-09의 실제 사용 빈도(운영 로그 없음) | 우선순위 판단 |
| V-9 | #2 (b) 시 `foreign-stock.ts:151-154` 조기 반환 echo 타입(`number` → `number\|undefined`)이 결과 카드·aggregate adapter(`foreign-stock-aggregate-adapter.ts:208-210`)·이력 resultData에 미치는 범위 | PR-2 설계 |
| V-10 | 기존 단위 테스트 중 `foreignTaxExchangeRate` 없이 `hasForeignTax: true`로 엔진을 직접 호출하는 케이스 존재 여부 | Q-2-1 영향 |

## §10 이 계획이 건드리지 않는 것

국외 부동산 엔진(re-export 외 무변경) · 국외전출세(`exit-tax*.ts` — Q-6) · 국내 주식 엔진 · 지방소득세 절사 규약 불일치(부동산 V-7, 별건) · 부동산 장기할부(부동산 Q-13 — Q-3 결과가 나오면 재평가) · 취득가액 할부 취득 입력 칸(영 §178의5② 취득 측은 현행 단일 취득일 환율과 일치 — 변경 불요).

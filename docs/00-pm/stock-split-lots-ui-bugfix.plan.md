# 주식 양도세 — 분할 매수·분할 양도 모드 결함 4건 수정 계획

- 작성일: 2026-10-06
- 브랜치·워크트리: `fix/stock-transfer-bugfix` · `../Property-related-Taxes-stk` (base `origin/master` `c4ff99595`)
- 제보: 사용자 화면 캡처 3장(1단계 분할 입력 / 2단계 / 결과 「Validation failed」)

## 0. 재현 사례 (제보 원문 입력)

| 구분 | 일자 | 원인 | 주식수 | 1주당 |
|---|---|---|---|---|
| 매수 #1 | 2024-01-10 | 매매 | 8,000 | 10,000 |
| 매수 #2 | 2025-02-10 | 매매 | 8,000 | 12,000 |
| 매수 #3 | 2025-12-24 | 증여 | 4,000 | 5,000 |
| 매도 #1 | 2026-05-?? | — | 10,000 | 20,000 |

산정방법은 **선입선출법**이다. 총 매수는 20,000주, 매도는 10,000주, 잔량은 10,000주다.

**정답(엔진 실측)**: 아래 값은 probe로 확인했다. 폼 → ④ → Zod → coerceDates → 엔진 경로를 탔고, 시장은 비상장과 코스피 둘 다 돌렸으며, 입력 방식만 `per_share`로 바꿨다.

- 양도가액은 200,000,000이다.
- 취득가액은 **104,000,000**이다. 매수 #1에서 8,000주 × 10,000, 매수 #2에서 2,000주 × 12,000이 매칭된 값이다.
- 양도차익은 96,000,000이다.

## 1. 결함 목록과 원인 (전부 실측 또는 코드 확인)

### D-1. 매수 건 취득원인에 무상증자·유상증자가 없다

- 선택지는 `AcquisitionLotCard.tsx:35` `ACQ_CAUSE_LABEL`에서 온다. 매매·상속·증여·이월과세(증여)·합병·분할의 **5종뿐**이다.
- 엔진 enum도 5종이다. 위치는 `stock-transfer.types.ts:172`(단건)과 `:754`(lot)다. `"merger_split"` 리터럴은 11개 파일에 퍼져 있다.
- 무상증자는 지금 **다른 축**에서만 처리된다.
  - 2단계 「무상증자·무상감자 (자본조정)」 블록(`CapitalAdjustmentsBlock`)이 담당한다. 비율을 입력받아 `lot-capital-adjustments.ts`가 **발생일 이전에 보유한 lot의 단가를 희석**한다. 총원가는 그대로이고 보유기간은 원주에서 이어진다.
  - 이 처리는 **자본준비금 전입분(의제배당 아님)** 에만 해당한다. 이익잉여금 전입 무상증자(`bonus_retained_earnings`)는 「의제배당 — skip」이라, 그 무상주를 **양도할 때의 취득가액·취득일을 넣을 경로가 없다**. 사용자가 「매매」로 넣는 우회만 가능하다.
- 유상증자는 납입 주금이 실지거래가액이다. §104②의 특별 기산점이 없으므로 엔진에서는 「매매」와 같은 의미가 된다(V-2에서 확인 필요).

### D-2. 매도 건의 양도일 칸이 오른쪽으로 밀려 글자가 잘린다

- 매도 lot은 `SplitLotsBlock.tsx:219` `grid md:grid-cols-3`이다. 양도일·주식수(FieldCard 가로형: 라벨 | 입력)와 1주당 단가(CurrencyInput 세로형)가 **3열**로 놓인다.
- FieldCard가 1/3 폭 안에서 라벨 칸을 차지한다. 그래서 DateInput이 오른쪽 끝으로 밀리고 「2026 - 5」까지만 보인다(캡처 2).
- 매수 lot(`AcquisitionLotCard.tsx:83`)은 `md:grid-cols-2`라 정상이다. **같은 블록 안에서 두 행 레이아웃이 갈라져 있다.**

### D-3. 2단계에 양도가액·취득가액이 공란으로 보이고, 사이드바 취득가액은 매수 전체 합계다

- **2단계** `Step2.tsx`
  - 양도 「입력 방식」 라디오의 값은 `form.transferActualInputMode || "total"`이다(`:56`). 분할 모드에서 「합계 직접 입력」 옵션은 `disabled`(`:193`)인데 **선택은 그대로 유지**된다. 그래서 `:226` total 분기의 「양도가액 합계 *」 입력칸이 **활성 상태의 빈 칸**으로 렌더된다(캡처 3).
  - 취득 쪽은 `:328`에서 disabled 「1주당 취득가액 *」를 `form.perShareAcquisitionPrice`(분할 모드에선 빈 값)로 렌더한다. 결국 공란에 필수 표시(*)만 붙는다.
  - 상단 배너는 「1단계 건별 입력에서 자동 산출됩니다」라고 하지만 **산출값을 어디에도 보여주지 않는다**.
- **사이드바** `StockSidebar.tsx:264-270`
  - 결과가 오기 전에 분할 모드에서 `Σ(전 매수 lot 단가 × 수량)`을 「취득가액」으로 표시한다. 계산은 8,000×10,000 + 8,000×12,000 + 4,000×5,000 = **196,000,000**이다(캡처 3·4 일치).
  - 매도 수량과 산정방법을 무시하고 **보유 잔량의 원가까지 더한다**. 정답은 104,000,000이다.

### D-4. 결과 화면 「Validation failed」 — **분할 모드가 새 폼에서는 항상 계산 불가** 🔴

probe 실측 결과다. 폼 초기값에 분할 입력만 넣고 ④ → `addStockRefines(stockTransferInputSchema)`를 거쳤다.

```
transferTotalPrice          총액 직접 입력 시 양도가액 합계는 0보다 커야 합니다
acquisitionActualInputMode  분할 모드에서는 취득가액 합계 직접 입력을 지원하지 않습니다
transferActualInputMode     분할 모드에서는 양도가액 합계 직접 입력을 지원하지 않습니다
```

⑧ `validateStepByIndex` 0·1·2단계는 **모두 0건**이다. **UI는 통과시키고 Zod는 막는 모순**이다.

- 원인은 폼 기본값 변경이다. `calc-wizard-stock-form.ts:108`에서 `transferActualInputMode: "total"`(2026-08-12 `93831e1b9`), `:116`에서 `acquisitionActualInputMode: "total"`(2026-09-17 `3060c5880`)이 되었다.
- 두 변경 모두 분할 모드를 고려하지 않았다. 분할 모드에서 Step2는 취득 입력 방식 라디오를 **아예 마운트하지 않는다**(`:338` `!isSplitMode`). 그래서 사용자가 값을 바꿀 방법도 없다.
- ④ `stock-transfer-tax-api.ts:220·242`는 폼 값을 그대로 body에 싣는다. Zod `stock-transfer-tax-refines.ts:372-390`(분할 방어선)과 `:275`(total 필수)가 이를 거부한다.
- 입력 방식만 `per_share`로 바꾸면 Zod를 통과하고 위 정답이 나온다. **엔진과 매칭 로직은 정상**이다.
- 이 결함을 E2E가 못 잡은 이유: 분할 모드(매도 다건)를 결과까지 몰아가는 spec이 **0건**이다. `stock-transfer-moving-avg.spec.ts`는 lots-only 축이다.
- 부수 결함: `callStockTransferTaxAPI`(`stock-transfer-tax-api.ts:652`, 같은 패턴 `:701`)가 `err.error`만 던진다. 그래서 Zod `issues`의 한국어 사유가 화면에 나오지 않는다. 다른 세목은 issues를 펼쳐 보여준다(`comprehensive-api.ts:575`).

## 2. 수정 설계

### F-4 (D-4) 분할 모드 입력 방식을 파생값으로 고정 — 3중 패턴

분할 모드에서 「합계 직접 입력」은 성립하지 않는다. lot별 단가가 정본이다. 입력 방식을 **폼에 저장된 값이 아니라 `lotsMode`에서 파생**한다.

| 층 | 변경 |
|---|---|
| leaf | `lib/calc/stock-transfer-input-mode.ts`(신규, 또는 기존 leaf에 추가) `effectiveTransferInputMode(form)` / `effectiveAcquisitionInputMode(form)`. split이면 `"per_share"`, 아니면 종전 fallback(`"total"`)을 돌려준다 |
| ④ API | `:220·242·257`의 폼 직접 참조를 leaf로 교체한다. split이면 `transferTotalPrice`·`acquisitionTotalPrice`를 싣지 않는다 |
| ⑤ UI | Step2는 split에서 입력 방식 라디오와 단가·합계 칸을 **렌더하지 않는다**. F-3 요약 카드로 대체한다 |
| ⑧ validate | split에서 total 관련 검증이 돌지 않는지 확인한다(현행 0건이지만 같은 leaf로 게이트) |
| Zod | **방어선은 그대로 둔다**(API 직접 호출 차단) |

- 토글 시점 patch(`handleLotsModeToggle`에서 per_share 저장)는 **채택하지 않는다**. 이미 저장된 이력과 sessionStorage의 `split + total` 조합이 복원되면 여전히 깨지기 때문이다. 파생값 방식은 이 경우도 덮는다.
- 부수 수정: `callStockTransferTaxAPI`가 `issues`가 있으면 첫 사유(또는 전체)를 메시지에 포함하게 한다. 「Validation failed」만 보이는 막다른 오류를 없앤다.

### F-3 (D-3) 분할 모드 미리보기 단일 소스 — 엔진 `allocateLots` 재사용

- 신규 순수 함수 `lib/calc/stock-split-preview.ts` `previewSplitAllocation(form)`.
  - 폼 lot을 엔진 `AcquisitionLot`·`TransferLot`으로 변환한다(날짜는 `toDate`).
  - **분할 모드 자본조정**(`lot-capital-adjustments`)을 엔진과 같은 순서로 먼저 적용한다. 빼면 무상증자가 있는 사례에서 미리보기와 결과가 갈린다.
  - 그다음 `allocateLots(...)`를 호출한다. 단기·세율 게이트 인자는 미리보기 금액에 영향이 없으므로 고정값으로 넘긴다(Do에서 영향 0을 실측 확인).
  - 입력이 불완전하면 `null`을 돌려준다(0원 표시 금지).
  - 정책 근거: single-source-engine-helper. UI가 매칭을 재구현하지 않는다.
- ⑤ Step2는 split이면 「분할 모드 자동 산출」 읽기 전용 카드를 보여준다.
  - 양도가액 합계: Σ 매도 lot.
  - 취득가액: 산정방법 매칭 결과와 매칭 내역(매수 #n · 주식수 · 단가)을 함께 보여준다.
  - 공란 입력칸과 필수 표시(*)는 없앤다.
- ⑥ 사이드바는 split이고 결과가 오기 전이면 `previewSplitAllocation`의 `totalAcquisitionPrice`를 쓴다. 양도가액도 같은 함수 값으로 맞춘다(현행 `:45` lot 합과 동일한지 확인).

### F-2 (D-2) 매도 lot 레이아웃

- `SplitLotsBlock.tsx:219` `md:grid-cols-3`을 매수 lot과 같은 `md:grid-cols-2`로 바꾼다(양도일 | 주식수 / 1주당 단가).
- Playwright 스크린샷으로 1280px·데스크톱 폭에서 날짜 세 칸(연·월·일)이 모두 보이는지 확인한다.

### F-1 (D-1) 취득원인 추가 — **사용자 결정 필요(Q-1·Q-2)**

후보 설계(추천 = A안):

| 원인 | 취득가액 | 보유기간 기산(§104②) | 처리 |
|---|---|---|---|
| **유상증자** | 납입한 1주당 인수가액(실지거래가액) | 신주 취득일 — 정확한 시점은 V-2 | lot enum에 `rights_issue`를 추가한다. 엔진에서는 `purchase`와 같은 분기다(`resolveLotStartDate` default). 라벨과 hint만 다르다 |
| **무상증자 — 의제배당 과세분**(이익잉여금 등 자본전입, 소득세법 §17②2호 본문) | 의제배당으로 과세된 금액(통상 액면가) — V-1 | 무상주 취득일 — V-1 | lot enum에 `bonus_taxed`를 추가해 **독립 lot**으로 둔다. 지금은 입력 경로가 없는 갭을 메운다 |
| **무상증자 — 의제배당 비과세분**(자본준비금 전입, §17②2호 가목) | 별도 원가 없음. 원주 단가를 희석한다 | 원주 취득일에서 이어진다 | **lot으로 만들지 않는다.** 이 선택지를 고르면 「자본조정 블록에서 비율로 입력」 안내와 이동 링크를 띄운다. 기존 `lot-capital-adjustments` 엔진이 정본이다 |

비과세분을 lot으로 만들지 않는 이유가 있다. 원가 0인 lot을 원주 취득일로 넣으면 FIFO가 그 lot을 **원주와 별개 순번**으로 소비한다. 원주보다 먼저 팔린 것으로 처리되거나 단가 0원 매칭이 생긴다. 희석 방식은 원주 lot마다 총원가를 보존한다.

- 영향 범위(14 지점): lot enum(엔진 타입 `:754`·폼 타입 2곳·normalize enum) → ④ `mapAcquisitionLotToBody` → ⑫ Zod `acquisitionCauseSchema` → ⑭ engine-input → 엔진 `resolveLotStartDate`·`stock-transfer-helpers`·`stock-transfer-required-inputs`(원인별 필수 입력) → ⑤ `ACQ_CAUSE_LABEL`·hint → ⑦ 결과 `LotMatchingDetailCard` 라벨 → 신고서 부표의 취득원인 코드 매핑(`StockFilingForm*`. 별지 서식 코드표에 「유상증자·무상증자」 코드가 있는지 V-3).
- 단건 모드 `acquisitionCause`(`AcquisitionInfoBlock`)는 **lot enum과 타입을 공유**한다. 단건에도 넣을지는 Q-2다. 넣지 않으면 lot 전용 enum으로 분리해야 한다.

## 3. 미검증 항목 (V) — 착수 전 확인

| # | 내용 | 방법 |
|---|---|---|
| V-1 | 의제배당 과세 무상주의 취득가액·취득시기, 비과세 무상주의 취득시기(원주 통산)를 확인한다. 국세청 해석 `[141494]` 「의제배당으로 과세되지 않은 무상주의 취득시기 및 취득가액 판단」(2020.02.19), `[184956]` 「주식발행초과금의 자본전입으로 인한 무상주의 취득시기」(2017.08.21) | KoreanLaw MCP는 목록만 주고 본문은 `NOT_SUPPORTED`다. taxlaw.nts.go.kr 본문을 Playwright로 읽는다(memory `feedback_nts_taxlaw_readable_via_playwright`). 소득세법 시행령 §162·§163 본문도 확인한다 |
| V-2 | 유상증자 신주의 취득시기(납입일 vs 납입일 다음날 등)와 저가 인수 시 상증법 §39 증여의제분의 취득가액 가산 여부 | 위와 같다. 저가 인수 가산은 **범위 밖**이며 안내 문구만 둔다 |
| V-3 | 양도소득 신고서 주식 부표의 취득유형 코드표에 유상·무상증자 구분이 있는지 | `besshi-form-replica` 절차 |
| V-4 | `allocateLots`의 세율 게이트 인자가 `totalAcquisitionPrice`에 영향이 없는지 | probe 실측 |

## 4. 사용자 결정 (Q) — 2026-10-06 확정

- **Q-1 → A안**: 과세분은 독립 lot으로 받고, 비과세분은 자본조정 블록으로 안내한다.
- **Q-2 → 단건 모드에도 추가한다**(2026-10-06 PR-2 착수 시 결정). 비과세분은 **선택지로 두고 안내와 함께 진행을 막는다**.
- **Q-3 → PR-1(F-4·F-3·F-2) 먼저**, PR-2(F-1)는 V-1~V-3 확인 후 진행한다.

### PR-1 결과 (2026-10-06)

- F-4: leaf `lib/calc/stock-transfer-input-mode.ts`를 ④ `stock-transfer-tax-api.ts`와 ⑤ Step2가 공유한다. 오류 응답은 `formatStockApiError`가 Zod 사유로 바꾼다.
- F-3: `lib/calc/stock-split-preview.ts` `previewSplitAllocation`(엔진 `allocateLots` 재사용)을 Step2 `SplitAllocationPreviewCard`와 사이드바가 함께 쓴다.
- F-2: 매도 lot을 `md:grid-cols-2`로 바꿨다.
- V-4 해소: SP-1 4개 사례(FIFO·이동평균·개별법·무상증자)에서 미리보기 = 엔진 `transferPrice`·`acquisitionPrice`가 등치였다.
- 안전망 실측(mutation):

| 되돌린 대상 | 실패한 검증 |
|---|---|
| ④ | SL-1~3, E2E SPL-1(400) |
| 자본조정 전처리 | SP-1 무상증자 사례 |
| Step2 | S2-1·S2-2 |
| 사이드바 | SB-1 |
| 3열 레이아웃 | E2E SPL-1(「일」 칸 오른쪽 끝 376 > FieldCard 경계 330) |

### PR-2 결과 (2026-10-06) — 취득원인 유상증자·무상증자

**V 해소 (원문 확인)**

| # | 결론 | 출처 |
|---|---|---|
| V-1 비과세 무상주 | 취득일 = 원주 취득일, 취득가액 = 0 | 국세청 서면-2019-자본거래-1671(2020.2.19) · 서면-2017-법령해석재산-1967 · 서면-2022-자본거래-3177. taxlaw.nts.go.kr 본문을 Playwright로 열람 |
| V-1 과세 무상주 | 취득가액 = 액면가액(의제배당 금액) | 소득세법 시행령 §27①1호 가목(현행 MST 290841 원문) · 서일46014-11217(2002) |
| V-1 과세 무상주 취득시기 | **직접 해석 미확보** | 비과세분만 원주 통산이라는 해석의 반대해석이다. 사용자가 무상주 취득일을 입력하고, 안내 문구는 「이 날부터 보유기간을 셉니다」로 단정을 피했다 |
| V-2 유상증자 | 취득시기 = 납입일(대금청산일 — 소득세법 §98) | 직접 해석은 없고, 같은 논리인 신주인수권 행사 주식 「신주 발행가액 전액 납입일」(국세청 2006.9.15. [246734]) |
| V-3 신고서 부표 | 주식 lot 취득원인을 신고서·결과에 표시하는 경로 없음(grep) | 코드 매핑 불필요 |

**구현** (엔진·Zod enum **불변**)

- leaf `lib/calc/stock-acquisition-cause.ts`
  - `toEngineAcquisitionCause`: 유상증자·과세 무상주 → `purchase`. ④(단건·lot)와 ⑤⑧ 의제취득일 술어가 공유한다.
  - `FORM_ACQUISITION_CAUSES`: ③ 복원 목록.
  - `BONUS_UNTAXED_BLOCK_MESSAGE`
- 폼 enum에 `rights_issue`·`bonus_taxed`·`bonus_untaxed`를 추가했다(단건·lot 공통).
- ⑧ 비과세분 차단 3경로: 단건(단일 모드 한정), 분할 lot, 일자별 다건 lot. ⑫는 enum이 방어선이다.
- 분할 모드에서는 화면에 없는 단건 원인 `bonus_untaxed`를 싣지 않는다(④). 싣으면 보이지 않는 400이 난다.
- ⑤ lot 드롭다운, 단건 라디오, 원인별 날짜·단가 안내, 비과세분 안내 ToneCard. 스크린샷으로 카드 폭 넘침을 확인했고 라벨을 단축했다.

**인용 정정 — 「양도소득세 집행기준 97-163-12」**

- 현행 집행기준 전문(국세청 PDF 7,084줄)에서 이 번호는 「타인 토지에 건물신축을 위한 부지조성비」이고, 무상주 항목은 없다.
- 무상주 1주당 환산 → **소득세법 시행령 §27②**(신·구주식 1주당 장부가액)로, 형식감자 → **집행기준 97-163-10**(무상감자 시 주식 취득가액)으로 바꿨다.
- 범위: 사용자 화면 4곳, 엔진 appliedRules, 주석. manifest에 시행령 §27을 등록했다(`verify:legal` 400/400 통과).
- ~~남은 의심: `SECTION_17_2_2_A_*` 라벨~~ → **PR-3에서 원문 대조 후 정정**(아래).

**검증**

- anchor CI-1~7(15건)과 UI-1~4.
- E2E SPL-2(유상증자 lot → 104,000,000 불변, 비과세분 → 안내와 2단계 진입 차단).
- mutation 5종이 모두 해당 anchor에 잡혔다: 매핑 제거, 분할 잔존값 필터 제거, 의제취득일 술어 원복, lot 복원 목록 원복, step2 lot 차단 제거.
- 범위 밖으로 남긴 것:
  - ~~과세 무상주의 환산·매매사례 모드를 막지 않았다~~ → **PR-3에서 해소**(아래).
  - 1986 이전 유상증자·과세 무상주는 「매수」와 같이 의제취득일 비교(영 §176의2④)를 탄다.

### PR-3 결과 (2026-10-06) — 과세 무상주는 액면가액만

사용자 지시: 「과세분 무상주의 취득가액 산정 방식: 액면가액만 입력할 수 있도록」.

- leaf `isBonusTaxedEstimationBlocked`를 ⑤·⑧·③이 공유한다.
  - ⑤ Step2 「환산취득가」·「매매사례가액」 비활성 + 안내
  - ⑧ validate-step2 차단
  - ③ 추계 모드로 저장된 이력은 실가로 복원(라디오가 막혀 벗어날 수 없으므로 — 증여 §163⑨와 같은 규약)
- 라벨: 단건 「1주당 액면가액」·「액면가액 합계」, lot 카드 「1주당 액면가액」.
- ⚠️ ⑫ Zod는 막지 못한다. ④가 원인을 「매매」로 매핑해 보내므로 서버는 원인을 모른다. ⑧이 실질 관문이다.
- 범위 밖: 의제취득일(1986) 전 과세 무상주의 영 §176의2④ 비교는 그대로다. 이것은 산정 방식 라디오가 아니라 별도 축이다.
- anchor BT-1~3, UI-5·5b·6. mutation 3종(⑤·⑧·③)이 모두 해당 anchor에 잡혔다.
- 브라우저: 비활성 카드가 스크린샷에서 청록색으로 찍히는 것은 헤드리스 렌더링 아티팩트다. 계산된 스타일은 기존 비활성(opacity 0.6, 앰버)과 같다.

### PR-3 추가 — 소득세법 §17②2호 표기 정정 (사용자 지시 2026-10-06)

현행 소득세법 §17 원문(MST 280405, 시행 2026.1.1.)을 대조했다.

- ②2호의 **본문**은 「잉여금의 자본전입으로 취득하는 주식의 가액」(의제배당)이다.
- **단서**는 「다음 각 목의 어느 하나에 해당하는 금액을 자본에 전입하는 경우는 제외한다」이고, 각 목은 다음과 같다.
  - **가목**: 「상법」 §459① 자본준비금으로서 대통령령으로 정하는 것(범위는 소령 §27④)
  - **나목**: 재평가적립금
- 종전 표기는 본문과 가목을 뒤집어 적고 있었다.

| 위치 | 종전 | 정정 |
|---|---|---|
| `SECTION_17_2_2_A_DEEMED_DIVIDEND_BONUS` (미사용) | §17②2호 **가목** = 무상주 의제배당 | `SECTION_17_2_2_DEEMED_DIVIDEND_BONUS` = §17②2호 **본문** |
| `SECTION_17_2_2_A_PROVISO_CAPITAL_RESERVE` (appliedRules) | §17②2호 가목 **단서 (1)** | §17②2호 **가목** — 자본준비금 (의제배당 제외) |
| `SECTION_17_2_2_A_PROVISO_REVALUATION` (미사용) | §17②2호 가목 단서 **(2)** | `SECTION_17_2_2_B_PROVISO_REVALUATION` = §17②2호 **나목** |
| `SECTION_17_2_1` 주석 | 자본감소·**잉여금자본전입** | 감자·소각으로 취득하는 금전 등(잉여금 전입은 2호) |
| 자본조정 블록 화면 5곳 | 「가목 본문」 · 「가목 단서 (1)·(2)」 · 「법§16①2호 가목 본문 자본준비금」 | 「본문」 · 「단서 가목·나목」 · 「「상법」 §459① 자본준비금」 |
| 엔진 사유 문자열·주석 | 「§17②2호 가목 본문」 | 「§17②2호 본문」 |

- 「법§16①2호 가목」(법인세법 측 조문으로 보임)은 개인 양도세 화면의 근거가 아니다. 원문을 확인한 소득세법 §17②2호 가목과 「상법」 §459①으로 바꿨다.
- 테스트 2곳은 법령 정합 우선으로 기대 문자열을 갱신했다(`capital-adjustment-radio-columns` CA-1, `pr2-remaining` CA-1-05 제목).
- `verify:legal` 400/400.
- 범위 밖: 같은 「가목 단서」라는 글자를 쓰지만 다른 조문인 §94①3 가목 단서·상증법 §63①1가목 단서는 건드리지 않았다.

## 5. 검증 계획 (Definition of Done)

1. **Pre-Do anchor**(실패 먼저 확인)
   - `__tests__/calc/stock-split-lots-defaults.anchor.test.ts`: 초기 폼 + 제보 사례 → ④ → Zod 통과 → 엔진 104,000,000 / 200,000,000 / 96,000,000. 현행에서 **실패**하는지 먼저 본다.
   - 저장 이력 복원 축: `split + transferActualInputMode:"total"` 레코드 → normalize → ④ → Zod 통과.
2. F-3: `previewSplitAllocation` 단위 anchor를 둔다. FIFO·이동평균·개별법 각각 엔진 결과의 `acquisitionPrice`와 **등치**인지 확인하고, 자본조정 있는 사례도 1건 넣는다. 사이드바 RTL로 104,000,000이 표시되는지(196,000,000이 아닌지) 확인한다.
3. mutation probe: leaf 파생값을 폼 값 직통으로 되돌리면 1번 anchor가 실패하는지 본다(안전망 실측).
4. **E2E 신규** `e2e/stock-transfer-split-lots.spec.ts`: 제보 사례를 1단계에서 입력해 결과 화면까지 간다.
   - 결과에 취득가액 104,000,000이 나오고 「Validation failed」가 없어야 한다.
   - 2단계 요약 카드에 같은 값이 보여야 한다.
   - 워크트리이므로 `E2E_PORT`를 지정한다.
5. 세목 회귀는 `npm run test:` 주식 스크립트 또는 `npx vitest run __tests__/tax-engine/stock-transfer/ __tests__/calc/`로 돌리고, `npx tsc --noEmit`이 0건이어야 한다.
6. 푸시 전 `FULL_TEST=1 bash .husky/pre-push`를 수동 실행한다. 워크트리에서는 husky 훅이 돌지 않는다.
7. 브라우저 수동 확인(Playwright): 매도 행 날짜 표시, 2단계 요약, 사이드바, 결과.

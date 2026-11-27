# 국외전출세 2027.1.1. 이후 출국분 개정 — UI·클라이언트 계획(①②③⑤⑥⑦ + ⑧ UI 쪽 + ④⑬ 호출 계약)

> 짝 문서: `stock-transfer-exit-tax-2027.engine.plan.md`(엔진·API — 병행 작성 중). **엔진과 맞춰야 하는 이름·계약은 「(가칭)」·「엔진 확인 필요」로 표시**한다. 최종 필드명·result 타입은 엔진 계획서가 우선이고, 통합 색인에서 §10 표를 대조해 맞춘다.
> **범위**: 14개 동기화 지점 중 ①폼 ②initial ③normalize ⑤위젯 ⑥사이드바 ⑦결과 + ⑧validate, 그리고 ④⑬의 호출 계약. ⑨~⑭(Zod·route·Date 변환)은 엔진 파트가 구현하고 이 문서는 UI가 요구하는 계약만 적는다.
> **기준 트리**: 워크트리 `Property-related-Taxes-exit-2027`(master `e18d12f3f` 기준). 아래 file:line은 전부 이 트리에서 열어 읽은 값이다. **코드는 한 줄도 바꾸지 않았다.**
> **표기**: 「코드 읽기」= 파일을 열어 확인 · 「확인 필요」= §12 V-n · 「(가칭)」= 엔진 파트와 맞출 이름 · UQ-n = 사용자 결정(§11).
> **법령 근거**: 소득세법(MST 280405, 시행 2027-01-01 본)·시행령(MST 283631, 시행 2027-01-01 본)을 KoreanLaw MCP로 직접 조회했다. §1.3에 본문 요지를 적는다.

---

## 0. 한 줄 요약

**출국일(`etDepartureDate`)이 2027.1.1. 이후인 경우에만** 보유 종목 카드에 «국외주식» 시장 옵션이 열리고(2026.12.31. 이전 출국은 DOM이 지금과 **바이트 동일**), 국외주식 종목은 외화 단가·기준환율·중소기업 여부·출국일 시가 모드를 받는다. 영 §178의8② 제외(5억 이하 합계·외국인근로자·그 가족)는 **엔진이 판정**하고 화면은 사실(외국인근로자 여부·근로 개시일)만 입력받아 결과에 판정 근거를 보인다. 결과 카드는 `rateRegime`(가칭) echo가 `from2027`일 때 §118의11 1호/2호 가목/2호 나목 **세 구간을 나눠** 보이고, 그 외(echo 없음·`pre2027`)는 현행 카드를 그대로 쓴다.

---

## 1. 실측 — 지금 어디에 무엇이 있나 (코드 읽기)

### 1.1 국외전출세는 주식 마법사 안의 «시장 유형 = exit_tax» 트랙이다

| 구분 | 위치 | 내용 |
|---|---|---|
| 시장 선택 | `components/calc/stock-transfer/MarketTypeBlock.tsx:53` | 옵션 `exit_tax` 「국외전출세 (§118의9)」 — 7번째 라디오 |
| 1단계 | `app/calc/stock-transfer-tax/steps/Step1.tsx:216-222` | `exit_tax`면 `ExitTaxIdentityBlock`만 렌더하고 반환(대주주·기타자산 섹션 스킵) |
| 2단계 | `steps/Step2.tsx:161-162` | `exit_tax`면 `ExitTaxHoldingsBlock`만 반환 |
| 3단계 | `steps/Step3.tsx:133·228-232·305-325·399-` | `isExitTax`: ① `ExitTaxSettlementBlock` · ② 기본공제 §118의10④ 안내 · ③ 신고 §118의15 안내 |
| 4단계 | `steps/Step4.tsx:93·164-200` | `exit_tax`면 인쇄 패널 + `ExitTaxFilingFormSection`(제84호) + `ExitTaxResultCard` + `ExitTaxHoldingReportSection`(제104호) |
| 다종목 | `StockTransferTaxCalculator.tsx:392·420` | `marketType !== "exit_tax"`일 때만 목록·확정 버튼 렌더 → **국외전출세는 단건 전용**(`assertNoExitTaxItem` — `lib/calc/stock-transfer-tax-api.ts:710`) |
| 사이드바 | `StockSidebar.tsx:143-176` | 보유 종목 합계 간주양도가액(인라인 계산) + 결과 후 과세표준·산출세액 등 |

### 1.2 입력 블록과 폼 필드 (현행)

- `ExitTaxIdentityBlock.tsx`(97줄): 섹션 1 거주 연수(rose) → 섹션 2 **출국일**(sky, `DateInput` — E2E `exit-tax-wizard-steps.spec.ts`가 «이 화면의 유일한 DateInput»로 `nth(0)`을 쓴다) → 섹션 3 대주주 `ToggleCard`(violet, «자기 판정하여 입력하세요»). **출국일은 대주주 판정·보유 종목(2단계)보다 앞에 있다** — 요구 1의 «출국일이 종목 입력보다 앞서는가»는 현행 구조로 이미 만족한다.
- `ExitTaxHoldingsMatrix.tsx`(385줄): 종목 카드(`ToneCard amber`) 반복. 시장은 **native `<button>` 4개 그리드**(`:34-39` `MARKET_OPTIONS`, `:197` `grid-cols-4`) — kospi/kosdaq/konex/unlisted뿐. 시가 모드 `RadioCardGroup` 4종(`:42-67`, `:262`). 금액은 `CurrencyInput`(원 정수). **`addHolding()`(`:91-108`)이 빈 행 리터럴을 인라인으로 들고 있어 `createEmptyExitTaxHolding()`(`lib/stores/calc-wizard-stock-types.ts:58`)과 이중 정의**다.
- 간주양도가액 미리보기가 **세 곳에 복제**돼 있다: 매트릭스 합계(`:76-88`)·종목별(`:341-359`)·사이드바(`StockSidebar.tsx:146-158`).
- `ExitTaxHoldingForm`(`calc-wizard-stock-types.ts:14-52`): id·stockName·marketType·shareCount·acquisitionDate·perShareAcquisitionPrice·departureDayValuationMode + 모드별 시가 4칸 + 제104호 표시 전용 3칸(`stockCodeOrBizNumber`·`faceValuePerShare`·`ownershipRatio`, **엔진 미전달**).
- 폼 전역 필드 `et*` 19개: `calc-wizard-stock-form-types.ts:443-495`, 초기값 `calc-wizard-stock-form.ts:241-262`, normalize `calc-wizard-stock-normalize.ts:498-518` + 배열 normalizer `:611-650`.
- **normalizer 함정**: `normalizeExitTaxHoldings`(`:611`)는 허용 시장 목록을 로컬 상수로 들고(`:614`) 반환 객체를 **필드 나열로 새로 만든다**(`:631-645`). 새 필드를 여기 추가하지 않으면 **새로고침(rehydrate)마다 조용히 사라진다**.

### 1.3 법령 본문 대조 (이 화면 문구의 근거 — 2026-11-27 조회)

| 조문(시행 2027-01-01 본) | 확인한 내용 | UI 영향 |
|---|---|---|
| 소득세법 §118의9① | 「제94조제1항제3호가목부터 **다목**까지, 같은 항 제4호다목 및 라목에 해당하는 주식등」 | 보유 종목 입력 대상에 다목 추가 |
| 같은 조 ①2호 | 대주주 판정 소유 주식등에서 「제94조제1항제3호**다목**에 해당하는 주식등은 **제외**한다」 | 대주주 토글 설명문(자기 판정) |
| §118의10①·②·④ | 양도가액 = 출국일 시가 · 필요경비 §97 · 과세표준 = 양도소득금액 − 연 250만원 | 기본공제 1회(호별 배분은 UQ-4) |
| §118의11 | **1호** 가·나목·4호 다·라목 주식등: 3억 이하 20% / 초과 «6천만원 + 3억 초과액×25%» · **2호** 다목 주식등: 가. 중소기업 10% · 나. 그 밖 20% | 결과 세율 3구간 |
| 영 §178의8② | 국외주식등 중 ① 출국 당시 소유 국외주식등의 §118의10① 양도가액 **합계 5억원 이하** ② 외국인 임원·사용인(10년 중 국내 거소·주소 기간의 80% 이상 국내 근로, 일용 제외, 근로 종료 후 6개월 이내 출국)이 소유한 것 ③ 그 배우자·20세 이하 직계비속이 **근로 개시일 전**에 취득한 것 → 국외전출자 주식등에서 제외 | Step2 제외 사유 입력 + 결과 판정 echo |
| 영 §178의9②3호 | 국외주식등 시가 = 영 §178의3에 따라 산정한 시가 (①은 출국일 거래가액 원칙) | 시가 모드 |
| 영 §178의3①·②2호 | §157의3 주식은 외국정부 평가·6개월 실거래·감정·보상가액 **적용 배제**, 유가증권은 상증법 §63 준용(평가기준일 이전·이후 각 2월 → «양도일·취득일 이전 1월») | 시가 모드 = 거래가액 / 이전 1개월 종가평균 2종 |
| 시행령 부칙 <제36129호> §1 | 제178조의8, 제178조의9②3호, 제178조의10, 제178조의11, 별표 3의3 개정규정: **2027.1.1.** 시행 | 시행일 근거 — 엔진 파트가 부칙 적용례(법 부칙 제21221호 §8「2027.1.1. 이후 출국하는 경우부터」)와 함께 확정 |
| 영 §178의10·§178의11 (2027 본) | 신청서·신고서 제출 주체가 «재정경제부령» 서식으로 바뀐 문구 정비 | 별지 서식 개정은 §12 V-7 |

> ⚠️ **본문에 없는 것(= 확인 필요)**: ① 2027 이후 국외주식등의 **외화 → 원화 환산 규정**(영 §178의5는 §118의3·§118의4 국외자산 양도 규정이고, §178의9②3호는 시가만 §178의3으로 보낸다) — V-2 ② 호별 **기본공제·과세표준 배분** — V-3 ③ 「중소기업」 정의 조문 — V-4.

---

## 2. 설계 결정 (D-n)

| ID | 결정 | 근거 |
|---|---|---|
| D-1 | **분기 축은 «출국일» 하나**다. 신설 술어 `isExitTaxForeignStockEra(departureDate)`(가칭 — 엔진 소유 `lib/tax-engine/data/exit-tax-foreign-stock-era.ts`, 상수 `EXIT_TAX_FOREIGN_STOCK_START = "2027-01-01"`)를 ⑤⑥⑧④·Zod·엔진이 **같이 import**한다. 빈 문자열·파싱 불가는 `false` | `foreign-stock-track-era.ts`(`isBeforeForeignStockTrack`)가 이미 같은 패턴 — 「양도일」이 아니라 **출국일** 기준이라는 점만 다르다. 단일 소스(`single-source-engine-helper`) |
| D-2 | 새 화면 요소는 **전부 `era === true`일 때만 마운트**한다(조건부 렌더). `false`면 현행 JSX 경로가 그대로 실행돼 DOM 불변 | 회귀 금지 요구. SSR 마크업 전/후 바이트 동일 검증(U0, 선례: 커밋 `ca90f5535`) |
| D-3 | 국외주식 종목은 **같은 `etHoldings` 배열**에 넣고 시장 값 하나를 더한다(별도 배열 아님) | 시가 모드·취득일·주식수 등 공통 필드 다수, `holdingDetails[]` 결과도 한 배열. 엔진과 `marketType` 값 이름만 맞추면 된다(UQ-1) |
| D-4 | 국외주식 금액은 **외화 전용 필드**로 받는다. 기존 원화 칸(`departureDayMarketPrice` 등)을 «국외면 외화로 읽기»로 **재사용하지 않는다** | 한 칸이 시장에 따라 단위(원/외화)가 바뀌면 시장 전환 시 stale 값이 다른 단위로 해석된다 |
| D-5 | **5억 합계·호별 세율·기본공제 배분은 엔진이 판정**한다. 화면은 임계 숫자 비교·세율 선택을 하지 않는다 | 표시 계층 재유도 금지(`feedback_aggregate_display_rederives_engine_value`) — 사이드바·카드는 엔진 echo만 읽는다 |
| D-6 | 출국일이 바뀌어 era가 `true → false`가 됐는데 국외주식 행이 남아 있으면 **조용히 지우지 않는다**. 매트릭스가 그 행에 rose 안내를 달고, ⑧이 차단하고, ⑫(Zod)·엔진도 거부한다 | 정책 2(자동 fallback 금지) — 행은 숨은 값이 아니라 입력한 종목이다. 지우면 세액이 말없이 바뀐다 |
| D-7 | era 안내·제외 사유 입력 등 **모드 토글성 입력은 영향받는 필드 직전**에 둔다. 출국일(Step1 §2)은 이미 대주주·보유 종목 앞 | 루트 CLAUDE.md 「UI 순서 = 계산 로직 순서」 |
| D-8 | 입력은 `useEffect → store` 없이 **onChange patch 동승**으로만 동기화한다(시장 전환 시 시가 모드·통화 기본값 동시 갱신) | 정책 1 |
| D-9 | 기존 파일 구조는 **더하는 방향**: 신규 `ExitTaxForeignHoldingFields.tsx`·`ExitTaxForeignWorkerBlock.tsx`·`ExitTaxRateGroupsCard.tsx`. 기존 국내 종목 필드 JSX는 이동·추출하지 않는다 | Surgical Changes. 매트릭스 385줄 + 분기 ≈45줄 → ≈430줄(800 정책 안) |

---

## 3. 출국일에 따른 화면 분기 (요구 1)

### 3.1 분기 매트릭스

| 위치 | 2026.12.31. 이전 출국 / 출국일 미입력 | 2027.1.1. 이후 출국 |
|---|---|---|
| Step1 출국일 FieldCard(`ExitTaxIdentityBlock.tsx:56-73`) | 현행 그대로 | 아래에 **sky 안내 카드 1장**: 「2027.1.1. 이후 출국분부터 국외주식등(§94①3호 다목)도 국외전출자 주식등에 포함되고, 세율은 §118의11 호별로 나뉩니다」 |
| Step1 대주주 ToggleCard(`:75-91`) | 현행 그대로 | `description` 끝에 한 문장 추가: 「직전 연도 종료일 현재 소유 주식등을 볼 때 국외주식등(§94①3호 다목)은 제외합니다(§118의9①2호)」. **토글 의미·기본값 불변**(자기 판정) |
| Step2 보유 종목 안내 문단(`ExitTaxHoldingsBlock.tsx:23-27`) | 현행 그대로 | 문단 끝에 「다목 국외주식등은 «국외주식» 시장으로 입력하세요」 |
| Step2 종목 카드 시장 선택(`Matrix:194-210`) | 4버튼 `grid-cols-4` | 5버튼(`grid-cols-5`) — 「국외주식」 추가 |
| Step2 제외 사유 블록 | 없음 | `ExitTaxForeignWorkerBlock`(§4.3) — **국외주식 종목이 1건 이상일 때만** |
| Step3 | 현행 그대로 | 변경 없음(납부유예·실양도·외국납부세액은 국외주식에도 같은 §118의12~§118의16) — 실양도 입력이 «종목 단위»가 아니라 폼 단위라는 한계는 V-9 |
| Step4 결과 카드 | 현행 카드 | `rateRegime === "from2027"`이면 세율·산식 영역을 `ExitTaxRateGroupsCard`로 교체 + 종목 카드에 호·제외 표지 |

### 3.2 era 계산 위치와 3중 일관성

- UI는 **`etDepartureDate` 문자열을 술어에 그대로 넣는다**. 파생 값을 store에 쓰지 않는다(`useMemo`로 컴포넌트 안에서만 계산 — 정책 1).
- display fallback 없음: 출국일이 비어 있으면 era는 `false` → 국외주식 옵션이 **닫힌 상태**다(현행 화면과 동일). 사용자는 출국일을 먼저 넣어야 국외주식을 고를 수 있고, 그 사실을 옵션 자리에 `hint`로 적는다(「출국일을 입력하면 2027.1.1. 이후 출국분에 한해 선택할 수 있습니다」 — 4버튼 그리드 아래 `text-caption`, 현행 화면에는 마운트 안 함).
- ④·⑧·⑫·엔진이 **같은 술어**를 쓴다. ⑧은 era `false`인데 국외주식 행이 있으면 `severity: "error"`(D-6).

---

## 4. 입력 설계 (요구 2·3)

### 4.1 Step1 — 변경은 안내 문구 2곳뿐

새 입력칸 없음. `ExitTaxIdentityBlock`에 era 판정 1줄(`useMemo`)과 조건부 안내 2곳. **새 `DateInput`을 Step1에 추가하지 않는다**(E2E의 `nth(0)` 셀렉터 보호 — 제외 사유의 근로 개시일은 Step2에 둔다).

### 4.2 Step2 — 국외주식 종목 카드 (신규 `ExitTaxForeignHoldingFields`)

시장 «국외주식» 선택 시 종목 카드의 «주식수·취득일·취득단가·시가 모드·시가» 구간을 아래로 바꾼다(종목명·제104호 표시 전용 3칸·삭제 버튼은 공통).

```
┌ 종목 N ─────────────────────────────────────────────────── amber ┐
│ 종목명 *                     [native input — 기존과 동일]
│ ISIN·국가명(신고서 ⑩, 선택)  [stockCodeOrBizNumber 재사용]  액면가(⑫)·지분율(⑬)은 원화/외화 단위 V-6
│ 시장  [코스피][코스닥][코넥스][비상장][국외주식]            ← era일 때만 5번째
│
│ 발행국가 [select — COUNTRY_OPTIONS]    통화 [select — CURRENCY_OPTIONS]
│ ToggleCard(sky) 「중소기업 (§118의11 2호 가목 — 세율 10%)」 설명: 「중소기업」 정의 근거 — V-4
│ 주식수 *   취득일 *   1주당 취득가액(외화) *   취득일 기준환율 *
│ ── 출국일 시가 산정 (§178의9②3호 → 영 §178의3) ─ RadioCardGroup(amber, stack) 2종
│   ◉ 출국일 거래가액      「§178의9① — 출국일 당시 거래가액(외화 1주당)」
│   ○ 출국일 이전 1개월 종가평균 「영 §178의3②2호 → 상증법 §63 준용(양도일 이전 1월)」
│ 시가 1주당(외화) *   출국일 기준환율 *
│ 간주양도가액 참고 칩 — 엔진 환산 leaf 값(외화 × 환율 × 주수, 절사 규약은 엔진)
└─────────────────────────────────────────────────────────────────┘
```

- **위젯**: 통화·국가 native `<select>`는 해외주식 블록의 기존 관행(`ForeignStockIdentityBlock.tsx:99-108`·`ForeignStockPriceBlock.tsx`)을 따른다 — 신규 checkbox/radio/date native 없음. 날짜 `DateInput`, 외화·환율 `DecimalInput`(`CurrencyInput`은 원 정수 전용이라 쓰지 않는다), 토글 `ToggleCard`, 시가 모드 `RadioCardGroup`. 공용 옵션은 `components/calc/foreign/foreign-options.ts`(`COUNTRY_OPTIONS`)·`components/calc/stock-transfer/currency-options.ts`를 **import**(복제 금지).
- **placeholder 숫자 예시 금지**: 형식 설명은 `FieldCard hint`. 환율 hint = 「외국환거래법에 따른 기준환율(없으면 재정환율)입니다 — 대고객 매입률·매도율이 아닙니다」(해외주식 화면 문구 재사용, **환산 근거 조문 확정 전까지 조문 번호를 hint에 쓰지 않는다** — V-2).
- **FieldCard 함정**: `trailing` 배지가 있으면 `unit`이 렌더되지 않는다 — 환율 칸 단위는 hint에 쓴다.
- **시장 전환 동승**(D-8): `updateHolding(id, { marketType: v, departureDayValuationMode: defaultModeFor(v) })`를 **한 번의 onChange**로. 국외주식으로 전환하면 모드 기본값 `foreign_trade_price`(가칭), 국내로 돌아가면 `market_price`. 값(원/외화 칸)은 지우지 않는다 — ④가 시장으로 게이트해 싣고 ⑧이 시장별로 검증한다.
- **시가 모드를 2종으로 제한한 이유**: 영 §178의3①단서가 §157의3 주식에 대해 ②~④호를 배제하고 ②2호가 상증법 §63 준용을 지정한다. **비상장 국외주식의 보충적 평가(순손익·순자산)** 입력은 이번 범위에서 제외한다(UQ-3). 국외 비상장은 «출국일 거래가액»만 받는다.
- **환율 칸 수**: 취득일·출국일 두 칸. 환산 규정 확정(V-2) 전에는 칸 이름을 «적용 환율»이 아니라 위처럼 일자 기준으로 두되, V-2 결과가 «원화 직접 입력»이면 두 칸을 걷어내고 외화 칸을 원화 `CurrencyInput`으로 바꾼다(UQ-2).

### 4.3 Step2 — 제외 사유 블록 (신규 `ExitTaxForeignWorkerBlock`, 국외주식 종목 ≥ 1건일 때만)

위치: **보유 종목 섹션 바로 아래**(제외 판정은 종목 합계에 의존하므로 종목 다음). 3단계 순서(요건 → 종목 → 제외 판정)가 엔진 순서와 같다.

```
┌ 국외주식등 제외 (영 §178의8②) ──────────────────────────────── violet ┐
│ ① 합계 5억원 이하 — 입력 없음. hint: 「출국 당시 소유한 국외주식등의 양도가액 합계가 5억원 이하이면
│    국외전출자 주식등에서 제외됩니다. 판정은 계산 결과에 표시됩니다」 (정적 설명, 숫자 비교 없음)
│ ② ③ 외국인근로자 요건  RadioCardGroup(violet, stack)
│    ◉ 해당 없음
│    ○ 외국인근로자 본인 (§178의8②2호) — 「외국인 임원·사용인으로 출국일 10년 전부터 출국일까지
│       국내 거소·주소 기간의 100분의 80 이상 국내에서 근로를 제공했고(일용근로자 제외), 근로 종료일부터
│       6개월 이내에 출국하는 경우입니다」
│    ○ 외국인근로자의 배우자·20세 이하 직계비속 (§178의8②3호) — 「근로자가 국내에서 근로를 제공하기
│       시작한 날 전에 취득한 국외주식등만 제외됩니다」
│    └ ③일 때만: 외국인근로자의 국내 근로 개시일 [DateInput] *   hint 「종목 취득일이 이 날보다 앞서면 제외 대상」
└────────────────────────────────────────────────────────────────────────┘
```

- **«자기 판정» 구조를 택한 이유**(UQ-5): 대주주 요건이 이미 자기 판정 토글(`ExitTaxIdentityBlock.tsx:76`)이고, ② 요건은 4가지(80%·일용 제외·6개월·임원/사용인)를 정확히 다시 계산하려면 근로 기간 입력이 늘어난다. 모르면 `해당 없음`(기본값)이며, 결과에는 «외국인근로자 제외는 입력자 판정에 따름» 고지 1줄만 붙인다.
- ③은 **근로 개시일(사실)만 받고 종목별 제외는 엔진이 `취득일 < 근로 개시일`로 판정**한다. 종목마다 토글을 두면 사용자 판정이 종목 수만큼 늘고 취득일과 어긋날 수 있다. «20세 이하» 기준일(출국일·취득일·근로 개시일 중 무엇)은 영문에 명시가 없다 — V-5.
- 값은 폼 전역 `etForeignWorkerStatus`·`etWorkerServiceStartDate`(가칭, §6). 국외주식 종목이 0건이거나 era가 `false`면 ④가 싣지 않는다(stale 방지, ⑧도 같은 술어 `hasForeignHolding && era`로 검증 생략).

### 4.4 5억 판정을 화면이 하지 않는 구조 (요구 3)

| 단계 | 누가 | 무엇 |
|---|---|---|
| 입력 | 화면 | 국외주식 종목의 시가·환율·주식수를 **빠짐없이** 받는다(합계를 구하려면 제외 후보 종목도 필수) — 5억 이하여도 입력 생략 불가, ⑧도 같다 |
| 합산·비교 | **엔진** | 국외주식등 간주양도가액 합계 계산 → 임계 비교 → `excluded` 표지. 임계 상수(500,000,000)도 엔진 소유 |
| 표시 | 화면 | `result`의 `foreignAggregate`(가칭)·종목별 `exclusionReason`(가칭)을 **그대로** 보인다 |

- 입력 중 미리보기는 «국외주식 종목별 간주양도가액 참고» 칩까지만(합계·임계 비교 문구 없음).
- 합계가 5억을 **넘으면 전체가 포함**되는지, 2·3호 제외분이 합계에 들어가는지는 법문만으로 확정하기 어렵다 — 엔진 파트 확인 필요(V-8). UI는 어느 쪽이든 echo를 그대로 보이므로 영향이 없다.

---

## 5. 결과·사이드바·인쇄 (요구 4)

### 5.1 결과 카드 — `ExitTaxResultCard`(343줄, 현행)

현행 구조: 납세의무 없음 카드(`:124-`) → 종목별 카드(`HoldingDetailRow` `:86-`) → 메인 산식 카드(`:169-`) 안의 세율 안내 문단(`:188-192`, 정적 문구) → 산출세액·지방소득세·유예·재전입·경정·가산세·총계.

변경(모두 `rateRegime === "from2027"`일 때만. echo가 없거나 `pre2027`이면 현행 렌더 — 이력 복원 시 옛 `resultData`는 이 필드가 없으므로 현행 카드가 그려진다):

1. **종목 카드**(`HoldingDetailRow`)에 뱃지 2개: 적용 호(`1호` · `2호 가목` · `2호 나목`) · 제외 시 `제외 — 사유`. 국외주식은 간주양도가액·취득가액 줄에 `fxFormula`(`components/calc/foreign/fx-formula.ts`) 산식(`외화 × 환율 = 원화`)을 더한다. 제외 종목은 합산 대상이 아님을 줄 하나로 보이고 `합산 양도차익`에서 빠진다.
2. **제외 판정 블록**(신규, 종목 카드 위): 「영 §178의8② 판정」 — 국외주식등 간주양도가액 합계 · 제외 여부 · 사유(합계 이하 / 외국인근로자 / 근로자 가족 취득). 숫자는 `foreignAggregate`(가칭) echo 그대로.
3. **메인 산식 카드**의 세율 안내 문단(`:188-192`)을 `ExitTaxRateGroupsCard`로 교체:

```
양도소득금액   국내 주식등 [A] + 국외주식등(중소기업) [B] + 국외주식등(그 밖) [C] = 합계 [D]   ← 호별 echo
기본공제 (§118의10④)   연 250만 — 호별 배분은 아래 «과세표준» 행에 반영            ← 배분 방식 V-3
과세표준  호별: 1호 [a] · 2호 가목 [b] · 2호 나목 [c] (합계 = 양도소득금액 − 기본공제)
산출세액
  §118의11 1호   과세표준 [a] × 세율(3억 이하 20% · 3억 초과 25%) − 누진공제 [x] = [t1]
  §118의11 2호 가목 (중소기업)  과세표준 [b] × 10% = [t2]
  §118의11 2호 나목 (그 밖)    과세표준 [c] × 20% = [t3]
  산출세액 합계 = [t1] + [t2] + [t3]
```

   - 변수 약어·`floor()` 금지, **숫자 옆 변수명 라벨**, 숫자 끝 「원」 금지, 금액 칸 `font-mono tabular-nums text-right`(`amount-column-align`).
   - 호별 행은 **해당 호에 과세표준이 있는 줄만** 보인다(종목이 국내뿐이면 1호 한 줄 — 현행 카드와 같은 내용).
   - 1호 구간 경계(3억)가 «1호 과세표준 기준»인지 «전체 기준»인지는 엔진이 정한다 — 카드는 `rateGroups[]`(가칭)의 `taxBase`·`appliedRate`·`progressiveDeduction`·`tax`를 그대로 출력(V-3).
4. 지방소득세·결정세액·총 납부세액 행은 `result` 값을 그대로(현행과 같은 행·같은 라벨).
5. **납세의무 없음 카드**(`:124-`): 제외로 전부 빠져 납세의무가 없으면 `ineligibleReason`(엔진 문구)에 더해 제외 판정 블록을 같이 보인다.
6. 면책 고지(`:336-340`)는 불변.
7. **중립 표현**: «제외»·«적용»만 쓰고 유리/불리·절감 표현을 쓰지 않는다.

> 파일 크기: `ExitTaxResultCard.tsx`는 현행 343줄. 신규 `ExitTaxRateGroupsCard.tsx`(≈150줄)·`ExitTaxExclusionNotice.tsx`(≈70줄)로 나눠 카드 본문 증가를 ≈+25줄로 묶는다.

### 5.2 사이드바 합계 (⑥) — `StockSidebar.tsx:143-176`

| 시점 | 항목 | 규칙 |
|---|---|---|
| 입력 중 | `간주양도가액 합계(국내)` | 기존 계산 유지(**국내 종목만** — 기존 인라인 식에 국외주식 행이 섞여 0으로 더해지지 않도록 `marketType !== "foreign_stock"` 가드 필요) |
| 입력 중 (era·국외주식 있음) | `국외주식등 간주양도가액(환산 참고)` | **엔진 환산 leaf import**(인라인 floor 복제 금지 — 선례: `StockSidebar.tsx:189-192` 인라인 floor는 따라 하지 않는다). 외화·환율·주식수가 모두 있을 때만 행 노출, 0이면 제외 |
| 결과 도착 후 | 과세표준 · 산출세액 · 지방소득세 · 납부유예액 · 조정공제 · 외국납부세액공제 · 가산세 · 총 납부세액 | 현행 그대로(`r.totalTax` 단일 소스) |
| 결과 도착 후 (신규) | `제외된 국외주식등 간주양도가액` | `foreignAggregate.excludedValue`(가칭) — 0이면 미표시 |

- 5억 임계 비교·«제외 예상»은 사이드바에 **넣지 않는다**(D-5).
- 신규 순수 함수가 필요하면 `computeExitTaxSummary`(가칭, `lib/stores/`)로 분리 + 호출부 `useMemo`(atomic selector 규약). 현행 사이드바는 인라인이라 이번에는 **분리하지 않고** 가드·행만 더한다(Surgical). 세 곳에 복제된 간주양도가액 식의 단일화는 UQ-8.

### 5.3 신고서 서식·인쇄

| 대상 | 현행 | 이번 영향 |
|---|---|---|
| 별지 제84호(과세표준 신고서) | `ExitTaxFilingFormSection.tsx` → `toStockTransferResultFromExitTax`(`lib/tax-engine/stock-transfer/exit-tax-filing-adapter.ts:34-`)가 **단일** `appliedRate`·`progressiveDeduction`을 옮김(`:76-77`) | 혼합 세율(1호+2호)이면 단일 값으로 표현 불가 → UQ-7. 서식 정본(시행규칙 별지 제84호 2027 개정)은 V-7 |
| 별지 제104호(보유현황 신고서) | `ExitTaxHoldingReportForm.tsx`: 제목·⑩ 라벨에 이미 「(해외주식은 ISIN코드와 국가명)」·«제외되는 국외주식등만 보유한 경우 신고 대상 제외» 각주(`:139·186-187`) | ① 신고 대상 종목 = **엔진이 «국외전출자 주식등»으로 확정한 것만**(제외 종목은 표에서 뺀다) ② 모두 제외면 신고 대상 아님 안내 → `availableIds`에서 `exit-holding-report` 제외 |
| 인쇄 레지스트리 | `lib/print/stock-transfer-print-sections.ts` leaf 6종(`exit-holding-report` 포함) | **leaf 추가 없음**. 단 `Step4.tsx:93`의 `availableIds`가 «보고서 대상 여부» echo(`holdingsReportTarget`, 가칭)를 따르게 한 줄 조건 추가 — 데이터 없는 서식을 고르게 두면 거짓 선택(레지스트리 주석 원칙) |
| 서버 PDF | stock 채널 0종(`:20-24`) | 변경 없음 |

---

## 6. 14개 동기화 지점 — UI 담당 변경 목록 (요구 5)

> 엔진 `ExitTaxInput`(`lib/tax-engine/stock-transfer/types/exit-tax.types.ts`)에 새 입력이 생기면 아래가 **모두** 필요하다. ⑫⑬⑭는 TypeScript가 못 잡는다.

### 6.1 클라이언트 8개

| # | 지점 | 파일 | 변경 | 실측 |
|---|---|---|---|---|
| ① | 폼 상태 | `lib/stores/calc-wizard-stock-types.ts:14` | `ExitTaxHoldingForm`에 `marketType` 유니온 + `"foreign_stock"`(가칭) · `departureDayValuationMode` 유니온 + 국외 2종(가칭 `foreign_trade_price`·`foreign_prior_month_avg`) · 신규 필드(§10 표) | 현행 유니온 `:19`·`:30-33` |
| ① | 폼 전역 | `calc-wizard-stock-form-types.ts:443-495` | `etForeignWorkerStatus`·`etWorkerServiceStartDate`(가칭) | `et*` 블록 `:443` |
| ② | initial | `calc-wizard-stock-types.ts:58`(`createEmptyExitTaxHolding`) · `calc-wizard-stock-form.ts:241-262` | 신규 종목 필드 기본값 · 폼 기본값 | **`Matrix.addHolding()`(`:91-108`)이 인라인 리터럴로 이중 정의** → 이번에 `createEmptyExitTaxHolding()`을 쓰도록 3줄 교체(신규 필수 필드를 인라인에 빠뜨리면 tsc가 막지만, 두 곳이 갈리는 것 자체를 닫는다) |
| ③ | normalize | `calc-wizard-stock-normalize.ts:611-650`·`:498-518` | `validMarkets`(`:614`)에 국외 값 추가 · 반환 객체에 **신규 필드 전부 나열** · `etForeignWorkerStatus` `enumField(["none","worker","family"], defaults…)` · `etWorkerServiceStartDate` `strField` | 구 세션에 필드가 없으면 기본값. 허용 값 밖 모드 문자열은 현행처럼 기본 모드로 정규화 |
| ④ | API 변환 | `lib/calc/stock-transfer-tax-api-foreign-exit.ts:180-` | `holdings.map`(`:185-`)에 시장별 분기: 국외주식이면 외화 필드·통화·국가·환율·중소기업 매핑, 국내면 현행. 폼 전역 2필드는 `era && hasForeignHolding`일 때만 싣는다 | `holdingBody` 객체 `:186-194`, 모드별 시가 `:196-211` |
| ⑤ | 위젯 | `ExitTaxIdentityBlock`(안내 2곳) · `ExitTaxHoldingsMatrix`(시장 옵션·분기) · `ExitTaxForeignHoldingFields`(신규) · `ExitTaxForeignWorkerBlock`(신규) · `ExitTaxHoldingsBlock`(문단·블록 배치) | §3·§4 | — |
| ⑥ | 사이드바 | `StockSidebar.tsx:143-176` | §5.2 | — |
| ⑦ | 결과 | `ExitTaxResultCard.tsx` · `ExitTaxRateGroupsCard`(신규) · `ExitTaxExclusionNotice`(신규) · `ExitTaxHoldingReportSection`(대상 종목 필터) · adapter(UQ-7) | §5 | — |
| ⑧ | validate | `lib/calc/stock-transfer-tax-validate-exit.ts` | §6.3 | `validateStep1ExitTax :49` · `validateStep2ExitTax :118` · `validateStep3ExitTax :198` |

### 6.2 API/Route 6개 — UI가 엔진 파트에 요구하는 계약

| # | 지점 | 파일(현행) | 요구 |
|---|---|---|---|
| ⑨ | Zod enum 메인 | `lib/api/stock-transfer-exit-tax-schema.ts:29-` | 시가 모드 enum에 국외 2종, 호별 enum, 근로자 상태 enum |
| ⑩ | Zod enum 컴패니언·refine | 같은 파일 `exitTaxHoldingSchema` superRefine(`:41-85`) | 국외주식 행의 모드별 필수·외화 필드·**era 외 국외주식 거부**(⑧과 같은 술어) |
| ⑪ | 종목-수준 `acquisitionDate` fallback | `route.ts handleExitTax :335-347` | fallback 없음 — 종목 취득일은 `toDate(h.acquisitionDate,"holdings[].acquisitionDate")` 필수(현행 유지). 국외 행도 동일 |
| ⑫ | Zod 입력 객체 정의 | 같은 파일 `:41-48`(`marketType: z.enum([...4])`)·`:91-` | 종목 신규 필드·폼 전역 `foreignWorkerStatus`·`workerServiceStartDate`. **누락 시 침묵 stripping** |
| ⑬ | body spread | ④ 안 `holdingBody`·`body` | 위 필드명이 ⑫와 1:1 (⑬ 자가 점검 grep 목록 `:174-178` 주석에 신규 필드 추가) |
| ⑭ | Route 엔진 input 매핑 | `route.ts:335-347`(holdings 수동 매핑 — **필드 나열**) | 신규 필드를 **나열에 추가**. 수동 매핑이라 누락 시 Zod는 통과하고 엔진에 undefined 도달. 날짜 `workerServiceStartDate`는 `EXIT_TAX_DATE_FIELDS`(`:301`)에 추가 + `toDate` |

### 6.3 ⑧ 3중 패턴 — fallback 일치표

| 필드 | UI 표시 | ④ 변환 | ⑧ validate | initial / normalize |
|---|---|---|---|---|
| 종목 `marketType` | 버튼 선택(표시 fallback 없음) | `h.marketType \|\| "kospi"`(현행 `:189`) | `holding.marketType \|\| "kospi"`(현행 주석 `:7-13`) | `"kospi"` / 허용 목록 밖 → `"kospi"` |
| 종목 시가 모드 | `RadioCardGroup value={h.departureDayValuationMode}` — **`\|\|` 표시 fallback을 쓰지 않는다**(factory default 직접 사용) | `h.departureDayValuationMode \|\| "market_price"`(현행 `:193`) — **국외 종목은 `\|\| "foreign_trade_price"`** | 시장별 허용 모드 집합 검증(국외 종목에 국내 모드면 **차단** — 조용히 바꾸지 않음) | 시장 전환 시 patch로 함께 변경(D-8) / normalize 허용 밖 → 시장별 기본 모드 |
| `foreignCurrencyCode` | select value 직접 | `\|\| "USD"` | `\|\| "USD"` | `"USD"` / 빈값 → `"USD"` |
| `foreignCountryCode` | select value 직접 | `\|\| "US"` | `\|\| "US"` | `"US"` |
| `isSmallMediumEnterprise`(종목) | ToggleCard `checked` | **국외주식 종목만** 값 전달, 그 외 `false` | 국외주식 종목에서만 의미 | `false` |
| `etForeignWorkerStatus` | RadioCardGroup `value` 직접 | `\|\| "none"`, `era && hasForeignHolding` 아니면 미전송 | `\|\| "none"` | `"none"` |
| `etWorkerServiceStartDate` | DateInput | `status === "family"`일 때만 전송 | `family`면 필수 · 근로 개시일 ≤ 출국일 | `""` |
| **환율·외화 단가·합계** | — | **빈값 → undefined(키 미전송)** | 빈값 **차단**(대체 환율·이전 값 보간 없음) | `""` |

- 정책 2: 환율·시가를 다른 칸이나 이전 입력으로 **대체하지 않는다**. 5억 합계 때문에 입력을 생략해도 되는 경로를 만들지 않는다(§4.4).
- 국외 종목 ⑧ 항목(종목별): 종목명·주식수(≥1)·취득일·외화 취득단가(≥0)·취득일 환율(>0)·시가 모드별 외화 시가(>0)·출국일 환율(>0)·**취득일 ≤ 출국일**. era `false`인 국외 종목은 error(D-6). 시가 문구는 현행 «자동 안분 불가, 직접 입력 필수» 문체를 따른다.
- Step1 경고 문구(`validate-exit.ts:88-95` 대주주 비해당 warning)는 era일 때 «국외주식등은 소유 주식등에서 제외» 괄호만 더한다 — 문구 상수를 UI와 **같은 상수 import**로 공유.

---

## 7. 이력(IndexedDB)·세션 저장 호환 (요구 6)

| 층 | 현행 실측 | 영향·처리 |
|---|---|---|
| sessionStorage | `calc-wizard-stock-store.ts:215-242` — persist 키 `stock-transfer-tax-wizard`, `partialize`는 `formData`·`savedItems`만(`result` 제외 ✓), rehydrate 시 `normalizeStockFormData` 적용(`:236`) | **version 옵션 없음** → 새 필드는 ③ normalize 하나로 닫힌다. 별도 마이그레이션 파일(`calc-wizard-migration.ts`)은 **부동산 양도세 전용**(`assets` 구 스키마)이라 이번에 건드리지 않는다 |
| 이력 복원 | `lib/calc/stock-resume-entry.ts:36-51` — `buildStockResumeState`가 `normalizeStockFormData(input)` 호출 | 이력 `inputData`에 신규 필드가 없으면 normalize가 기본값(`etForeignWorkerStatus:"none"`, 종목 외화 필드 `""`)을 채움 → **옛 2026 이력은 era `false`라 현행 화면 그대로 복원**. 국외 필드를 이력 타입에 따로 추가하지 않는다 |
| `resultData` 복원 | 저장된 옛 결과에는 `rateRegime`·`rateGroups` 없음 | 카드가 **echo 부재 = 현행 렌더**(§5.1). 새 결과는 엔진이 항상 필드를 싣는다 — 이 «부재 = 구버전» 규칙을 엔진 계획서가 보장해야 한다(엔진 확인 필요) |
| 이력 dedup 키 | `lib/storage/business-key.ts:74-85`: 주식은 `sec:{종목명}\|{양도일}` — 양도일은 `extractStockTransferDate`(`title-generator.ts:139`)가 `transferDate`/`transferLots`만 읽음 | 국외전출세는 `transferDate`가 비어 키가 `sec:{케이스명}\|`. **출국일이 달라도(2026 vs 2027 비교 계산) 같은 케이스명이면 같은 키** — 실제 덮어쓰는지는 확인 필요(V-10). 고치려면 `etDepartureDate` 폴백 1줄(U3) |
| 이력 제목 | `title-generator.ts:216-229` | 변경 없음 |

---

## 8. E2E·브라우저 확인 (요구 7)

`e2e/CLAUDE.md` 규약 준수: 날짜는 `fillDateAndVerify`(`_helpers/tax-flow.ts`) 또는 현행 spec처럼 `aria-label` 연/월/일 입력 · 선택지 카드는 `getByRole("radio",{name})` **부분 매칭** · 라벨 입력 `fillByLabel` · hydration 전 클릭 유실 방지로 `getByPlaceholder("종목명을 입력하세요")` 가시성 대기 · 셀렉터는 throwaway probe로 실측 후 확정 · 외부 API 없음.

### 8.1 신규·갱신 시나리오

| # | 시나리오 | 기대 |
|---|---|---|
| X-1 **2026 회귀** | 기존 `exit-tax-filing-form-first.spec.ts` 헬퍼(출국일 2025-06-01)로 **출국일 2026-12-31**도 1회 추가 | 보유 종목 카드 시장 버튼이 **4개**(「국외주식」 `toHaveCount(0)`), 제외 사유 블록 `toHaveCount(0)`, 결과 카드에 현행 세율 문구(「3억 이하 20%, 초과분 25%」)·**호별 세율 줄 없음** |
| X-2 **경계** | 출국일 2027-01-01 → 시장 5개 노출 / 2026-12-31 → 4개 | 경계일 포함 |
| X-3 **2027 국외주식** | 출국일 2027-03-01 · 거주 10 · 대주주 ON · 국외주식 1종목(시가 합계가 임계를 넘는 시료 — 숫자는 구현 때 anchor로 확정) | 결과에 §118의11 2호 나목 줄(20%)·종목 카드 외화 산식 노출 · 요청 body에 국외 필드 존재 |
| X-4 **혼합** | 국내 상장 1 + 국외(중소기업) 1 + 국외(그 밖) 1 | 세율 3줄(1호·2호 가목·2호 나목) · 산출세액 합계 = 세 줄 합 |
| X-5 **5억 이하 제외** | 국외주식 합계가 임계 이하 시료 | 제외 판정 블록에 사유 «합계 이하»·종목이 합산에서 빠짐·제104호 `availableIds`에서 제외 |
| X-6 **era 전환** | 2027 출국으로 국외 종목 입력 → 출국일을 2026으로 수정 | 해당 행 rose 안내·다음 단계 진행 **차단**(⑧)·행은 삭제되지 않음 |
| X-7 이력 | 2027 케이스 계산 → 이력 저장 → 편집 열기 | 시장·외화 필드·근로자 상태 복원 |
| X-8 인쇄 | `foreign-track-print-selection.spec.ts` 방식으로 제104호 leaf 미선택 시 `print:hidden` | 기존 단언 불변 |

단위·anchor(`__tests__/components/calc/stock-transfer/`, `__tests__/calc/`): **EXA-1 🔴 pre-2027 폼의 Step1·Step2·`ExitTaxResultCard` SSR 마크업이 변경 전과 바이트 동일**(양성 짝 — 게이트가 현행을 삼키지 않았는가) · EXA-2 era 경계 술어(빈값·파싱불가 false) · EXA-3 시장 옵션 개수 4/5 · EXA-4 normalize가 신규 필드 누락 구 세션에 기본값을 채우고 **신규 필드를 보존**(§1.2 normalizer 함정) · EXA-5 ⑧이 era `false` + 국외 행을 error로 · EXA-6 ⑧이 국외 행 환율 빈값을 차단(대체 없음) · EXA-7 ④가 국외 종목에서만 외화 필드를 싣고 폼 전역 2필드는 `era && hasForeignHolding`일 때만 · EXA-8 3중 기본값(`USD`·`US`·`none`)이 initial/normalize/④/⑧ 동일 · EXA-9 사이드바 합계가 국내 종목만 더함 · EXA-10 결과 echo 부재 시 현행 카드. 뮤테이션 후보: 술어를 `!era`로 반전 → EXA-1·3 실패 / normalizer 반환 객체에서 신규 필드 한 개 제거 → EXA-4 실패 / ④의 era 게이트 제거 → EXA-7 실패.

### 8.2 브라우저 수동 확인 (Playwright, `feedback_browser_verify_with_playwright`)

① 2026 출국 폼 전 단계 DOM이 변경 전과 같은지(스크린샷 대조) ② 2027 출국 + 국외주식 입력 → Network 탭 **request body**에 신규 필드(종목 외화 필드·`foreignWorkerStatus`·`workerServiceStartDate`) 존재(⑫⑬⑭ 침묵 stripping 탐지 — 응답이 아니라 **엔진 echo가 입력을 반영하는지**까지) ③ 새로고침 후 값 보존(③) ④ 다크 모드·모바일 폭에서 5버튼 그리드·세율 3줄 줄바꿈 ⑤ 인쇄 미리보기(전체 선택 후).

---

## 9. PR 분할과 검증 명령 (요구 8)

엔진이 타입·헬퍼·anchor를 선행하고 UI가 ⑤⑥⑦을 받는다(루트 CLAUDE.md 워크플로). **PR마다 워크트리·`npx husky`·push 전 load 게이트·`.next` 정리** 규약을 지킨다.

| PR | 내용 | 선행 | 검증 |
|---|---|---|---|
| **E1** (엔진 계획서) | 시행일 술어·`ExitTaxInput`·`ExitTaxResult` 확장·법령 상수·`verify:legal` manifest | 없음 | 엔진 계획서 기준 |
| **U0** (무동작 안전망) | **EXA-1 SSR 바이트 동일 하네스** + X-1 E2E(2026 회귀) + `addHolding()`을 `createEmptyExitTaxHolding()`로 교체(동작 불변) | 없음(E1과 병행) | `npx vitest run __tests__/components/calc/stock-transfer/ __tests__/components/exit-tax-*` · `npx playwright test e2e/exit-tax-wizard-steps.spec.ts e2e/exit-tax-filing-form-first.spec.ts` · `npx tsc --noEmit` |
| **E2** (엔진 계획서) | 엔진 계산·Zod ⑨⑩⑫·route ⑭·echo 필드 | E1 | 엔진 계획서 기준 |
| **U1** | ①②③ + ⑧ + ⑤(Step1 안내·시장 옵션·국외 종목 카드·제외 사유 블록) — 계산 버튼은 API 미연결로도 ⑧ 통과까지 | E1 | `npx vitest run __tests__/calc/ __tests__/components/calc/stock-transfer/` · `tsc` · `npm run lint`(`grep ✖`) · pre-push 톤·폰트 게이트(`scripts/check-tone-classes.sh`·`check-font-sizes.sh`) |
| **U2** | ④⑬ + ⑥ 사이드바 + ⑦ 결과 카드(`ExitTaxRateGroupsCard`·제외 판정·종목 카드) + `availableIds` 조건 | E2 | 위 + `npx vitest run __tests__/tax-engine/stock-transfer/` · 브라우저 Network body 확인 |
| **U3** | 별지 제84호 어댑터·제104호 대상 필터(V-7 해소 후) · 이력 dedup 폴백(V-10, 선택) | U2 + V-7 | `npx vitest run __tests__/components/exit-tax-*` · `__tests__/print/` |
| **U4** | E2E X-2~X-8 + 수동 확인 + `ui-engine-sync-checker`(14지점) + `bkit:gap-detector` | U2 | `npx playwright test e2e/exit-tax-*.spec.ts e2e/foreign-track-print-selection.spec.ts` · push 직전 `npm run check:pre-pr` |

- 반복 검증에 `npm test` 전체 실행 금지(루트 CLAUDE.md). pre-push가 변경 경로로 범위를 판정한다.
- `lib/stores/**`·`lib/api/**` 변경은 전체 테스트가 돈다(`scripts/select-test-scope.sh`) — U1·U2 push 시간 예상.
- 파일 크기: `ExitTaxHoldingsMatrix` ≈430줄 · `ExitTaxResultCard` ≈370줄 · `calc-wizard-stock-normalize.ts` **738줄**(현행) — 필드 ≈+12줄이면 ≈750으로 **≥750 위험구간**에 들어간다 → U1에서 종목 normalizer(`:611-650`)를 `calc-wizard-stock-normalize-exit.ts`로 분리하는 안을 같이 검토(`File Size Policy` 기회주의적 분리). `calc-wizard-stock-form-types.ts`는 640줄이라 여유 있음.

---

## 10. 엔진에 요구하는 필드 (가칭 — 엔진 계획서와 통합 색인에서 대조)

### 10.1 입력 (`ExitTaxInput`)

| 필드(가칭) | 위치 | 타입 | 사용자 입력 단위 | 활성 조건 |
|---|---|---|---|---|
| `holdings[].marketType` + `"foreign_stock"` | 종목 | enum | — | era |
| `holdings[].departureDayValuationMode` + `foreign_trade_price`·`foreign_prior_month_avg` | 종목 | enum | — | 국외 종목 |
| `holdings[].currencyCode` | 종목 | string | — | 국외 종목 |
| `holdings[].countryCode` | 종목 | string | — | 국외 종목 |
| `holdings[].isSmallMediumEnterprise` | 종목 | boolean | — | 국외 종목 |
| `holdings[].perShareAcquisitionPriceForeign` | 종목 | number | 외화 1주당 | 국외 종목 |
| `holdings[].acquisitionExchangeRate` | 종목 | number | 원/외화 | 국외 종목 (V-2) |
| `holdings[].departureDayPriceForeign` / `priorMonthAvgPriceForeign` | 종목 | number | 외화 1주당 | 모드별 |
| `holdings[].departureDayExchangeRate` | 종목 | number | 원/외화 | 국외 종목 (V-2) |
| `foreignWorkerStatus` | 폼 전역 | `"none"\|"worker"\|"family"` | — | era + 국외 종목 있음 |
| `workerServiceStartDate` | 폼 전역 | Date | 날짜 | status = family |
| 환산 leaf export | 엔진 | 순수 함수 | — | 사이드바·매트릭스 미리보기가 import (절사 규약 포함) |
| `isExitTaxForeignStockEra` + 상수 | 엔진 data | 술어 | — | ⑤⑥⑧④·Zod 공용 |

### 10.2 결과 (`ExitTaxResult`) — 화면이 echo로만 읽는다

| 필드(가칭) | 쓰는 곳 | 비고 |
|---|---|---|
| `rateRegime: "pre2027"\|"from2027"` | 카드 분기·서식 분기 | **부재 = 구버전 = 현행 렌더** 규칙 |
| `holdingDetails[].rateClause: "1"\|"2a"\|"2b"` | 종목 뱃지 | |
| `holdingDetails[].inScope`·`exclusionReason: "aggregate_under_threshold"\|"foreign_worker"\|"worker_family_pre_service"` | 종목 카드·제외 판정 블록·제104호 필터 | |
| `holdingDetails[]` 국외 echo: `currencyCode`·`valueForeign`·`departureDayExchangeRate`·`acquisitionCostForeign`·`acquisitionExchangeRate` | `fxFormula` 산식 | 외화 금액이 없는 옛 이력은 `fxFormula`가 «—»로 처리(`fx-formula.ts`) |
| `foreignAggregate: { valueKrw, thresholdKrw, excluded }` | 제외 판정 블록·사이드바 | 임계 상수는 엔진 소유 |
| `rateGroups[]: { clause, gain, basicDeductionShare, taxBase, appliedRate, progressiveDeduction, tax }` | `ExitTaxRateGroupsCard` | 배분 방식·구간 경계 기준은 엔진(V-3) |
| `holdingsReportTarget: boolean`(+ 대상 종목 id 목록) | 제104호·`availableIds` | |
| `warnings`에 «외국인근로자 제외는 입력자 판정에 따름» 류 고지 | 주의사항 박스 | 문구는 엔진 상수 |

---

## 11. 사용자 결정 (UQ-n) — 추천안과 근거 (요구 9)

| ID | 질문 | 선택지 | **권고** |
|---|---|---|---|
| UQ-1 | 국외주식 종목의 표현 | (a) `marketType`에 `"foreign_stock"` 값 추가(같은 `etHoldings` 배열) (b) 별도 배열 `etForeignHoldings` | **(a)** — 공통 필드(종목명·주식수·취득일·시가 모드)가 많고 결과 `holdingDetails[]`도 한 배열이다. 폼의 시장 값 이름이 `StockTransferFormData.marketType`의 `"foreign_stock"`과 같아 혼동도 없다. ⑨⑫ enum·③ `validMarkets`·Matrix `MARKET_OPTIONS`·route 매핑 4곳 grep 목록으로 누락을 막는다 |
| UQ-2 | 외화 입력 방식 | (a) 외화 + 일자별 환율(해외주식 트랙과 동일) (b) 원화 직접 입력 | **(a) — 단, V-2(환산 규정)가 «외화 환산 방법 있음»으로 확정될 때만.** 같은 트랙에 외국납부세액이 이미 «외화 + 기준환율»(`ExitTaxSettlementBlock`·`etForeignTaxPaidForeign`)이라 일관된다. 환산 규정이 확인되지 않으면 **(b)** — 화면이 근거 없는 환율 칸을 만들지 않는다. 엔진 계획서의 V-2 결론을 따른다 |
| UQ-3 | 국외 비상장 주식 보충적 평가(순손익·순자산) 입력 | (a) 이번 범위 제외 — 거래가액만 (b) 해외주식 비상장 평가 블록 재사용 | **(a)** — 영 §178의3②2호의 상증법 §63 준용을 외화 재무제표 입력으로 풀면 입력량이 크고 환산 규정(V-2)과 얽힌다. 안내 문구 «비상장 국외주식은 출국일 거래가액으로 입력» 1줄. 요청이 오면 후속 |
| UQ-4 | 기본공제 250만원의 호별 배분 | (a) 엔진이 법문 순서·규칙으로 고정 (b) 사용자가 배분 호를 선택 | **(a)** — 같은 날(간주양도일 = 출국일) 여러 호가 동시에 생기므로 §103② 순서 규칙을 그대로 쓸 수 없다. 법문(§118의10④)은 단일 «과세표준»만 정한다. 엔진 계획서가 근거를 정하고(없으면 «확인 필요» 고지), 화면은 `rateGroups[].basicDeductionShare`를 보인다. (b)는 임의 선택이 세액을 바꾸므로 법 근거가 나오기 전에는 두지 않는다 |
| UQ-5 | 외국인근로자 제외 입력 | (a) 자기 판정 라디오(해당 없음/본인/가족) + 가족은 근로 개시일 (b) 4요건 개별 입력 후 엔진 판정 | **(a)** — 대주주 요건이 이미 자기 판정이고(`ExitTaxIdentityBlock.tsx:76`), (b)는 근로 기간 입력이 늘고 «80%·6개월·일용 제외» 해석 위험이 화면으로 넘어온다. 기본값 «해당 없음»(= 제외 미적용), 결과에 입력자 판정 고지 |
| UQ-6 | 국외주식 시장 선택 UI | (a) 기존 native 버튼 그리드에 5번째 버튼 (b) `RadioCardGroup`으로 교체 | **(a)** — 기존 4버튼은 현행 DOM이고 교체하면 회귀 범위가 커진다(D-2). 신규 native checkbox/radio/date는 만들지 않는다. 교체는 별건 정리로 |
| UQ-7 | 혼합 세율일 때 별지 제84호 표시 | (a) 호별 행을 서식에 추가 (b) 혼합이면 산출세액만 합계로 두고 세율·누진공제 칸에 «호별 결과 카드 참조» | **(b)** — 서식 칸 구조를 임의로 바꾸지 않는다. 2027 개정 서식이 호별 칸을 두는지(V-7) 확인 후, 있으면 (a)로 맞춘다. 단일 세율만 존재하는 경우(국내만·2호 단일)는 현행 칸 그대로 |
| UQ-7 재결정 | (V-7 확인 후, 2026-11-27) | — | **(a) 채택** — 2027 개정 별지 제84호가 ③ 세율구분별 열(코드 1-94 / 2-94 · ⑨ 세율 · ⑩ 산출세액)을 둔다. 구분 ≥2일 때 PR-4의 «표시 보류» 카드를 지우고 구분별 열 표를 그린다. 구분 1개(단일 세율)는 종전 25행 표 그대로(2026 이전 출국은 출력 불변) |
| UQ-8 | 간주양도가액 미리보기 3곳 복제(매트릭스 2곳·사이드바) | (a) 이번에 엔진 leaf 하나로 단일화 (b) 국외 경로만 leaf, 국내는 현행 유지 | **(b)** — 국내 식은 정상 동작 중이므로 건드리지 않는다(Surgical). 국외 환산만 엔진 leaf를 쓰고 국내 합계는 기존 인라인 + 국외 가드. 단일화는 별건 |
| UQ-9 | 출국일이 2027 이전인데 국외주식 행이 남은 경우 | (a) ⑧ 차단 + 행 유지(rose 안내) (b) 자동 삭제 | **(a)** — D-6. 자동 삭제는 입력한 종목을 말없이 지워 세액이 바뀐다 |

---

## 12. 미검증 (V-n — 확인 필요)

| ID | 항목 | 방법 |
|---|---|---|
| V-1 | 시행령 §178의8②·§178의9②3호 시행일(2027.1.1.)과 **법 부칙 제21221호 §8 적용례의 결합**(출국일 기준, 경과 조치 유무) — 법 쪽 부칙은 사용자가 확인했으나 시행령 부칙 §1(제36129호)은 시행일만 확인(적용례 조항은 본문에서 찾지 못함) | 엔진 계획서 + `get_law_text(jo="부칙")` 시행령·법 대조 |
| V-2 | **국외주식등 외화 → 원화 환산 규정**: 영 §178의5는 §118의3·§118의4(국외자산 양도) 규정이고 §178의9②3호는 «시가»만 §178의3으로 보낸다. 출국일 시가·취득가액의 환산일·환율 종류가 명문인지 | KoreanLaw MCP + 엔진 파트. 결과가 UQ-2를 정한다 |
| V-3 | 호별 **과세표준·기본공제 배분**, 1호 3억 구간이 «1호 과세표준 기준» vs «전체» | 법 §118의10④·§118의11 + 해석례 검색(엔진 파트) |
| V-4 | §118의11 2호 가목 「**중소기업**」 정의 조문(영 §157의2①·「중소기업기본법」 §2 — 해외주식 화면은 `isListedForeignCorp:false`일 때만 노출하는 근거를 이 정의에 둔다, `ForeignStockIdentityBlock.tsx:118-126`)과 외국법인 발행 주식(1호)에 적용 가능한지 | 엔진 파트. 결과에 따라 중소기업 토글 노출 조건(국외주식이면 무조건 vs 내국법인 발행분만) 확정 — 노출 조건이 달라지면 ⑤·④·⑧이 같은 술어를 써야 한다 |
| V-5 | 영 §178의8②3호 «20세 이하» 판정 기준일(출국일·취득일·근로 개시일) · ③의 «취득한 것»이 상속·증여 취득도 포함하는지 | 엔진 파트 + 질의회신 검색. UI는 기준일 입력을 받지 않는다 |
| V-6 | 별지 제104호 ⑫ 액면총액·⑬ 지분율의 **국외주식 단위**(외화/원화), ⑩ ISIN·국가명 입력 방식 | **확인됨(2026-11-27)** — `get_annexes(소득세법 시행규칙, 별지 104, knd=2, date=2027-01-01)`(MST 284987, 개정 2026.3.20.). 표 머리 단위 표기 «(주, 원, %)» — ⑪ 보유 주식수(주)·⑫ 보유 주식 액면총액(원)·⑬ 보유 지분율(%). ⑩은 «주식등 종목코드 또는 사업자등록번호(해외주식은 ISIN코드와 국가명)». 통화·환율 칸 **없음**(서식 전체에 외화 칸 없음). **MCP 본문에 뒷면 작성요령이 없다**(조회 결과가 서식 앞면 본문·각주만 반환 — 작성요령이 실제로 없는지 HWP 원문으로는 미확인). ⇒ ⑫는 서식이 «원»으로 못박은 칸이라 외화 액면가를 그대로 옮기지 않는다. 국외주식 액면가의 원화 환산 규정은 서식·MCP에서 찾지 못함 — **확인 필요**(U3은 현행 `faceValuePerShare × 주식수` 표시 유지, 화면 입력 문구는 변경 안 함) |
| V-7 | 시행규칙 별지 제84호·제104호서식 **2027.1.1. 시행 개정**(MST 284987 «시행 2026-07-01·2027-01-01» 예정본) — 호별 세율 칸 유무 | **확인됨(2026-11-27)** — 시행규칙 부칙 <재정경제부령 제22호, 2026.3.20.> 제1조 1호: 별지 제84호서식·부표 2·별지 제104호서식 등 개정규정은 2027.1.1. 시행(`get_law_text(mst=284987, jo=부칙)`). 제2조: 서식 개정은 시행 이후 신고하는 경우부터 적용하되 개정 서식으로 종전 법·영에 따른 신고를 할 수 없으면 종전 서식. **별지 제84호 개정 본문(`get_annexes` date=2027-01-01)**: ① 제목 «양도소득(국외전출자)과세표준 신고 및 납부계산서». ② **③ 세율구분 행이 «코드 / 양도소득세 합계 / 국내분 소계 / 세율구분 열(각 «-» 코드칸) / 국외분 소계»의 열 구조** — 세율구분별 열이 있고 ④~⑳ 모든 행(④ 양도소득금액·⑦ 기본공제·⑧ 과세표준·⑨ 세율·⑩ 산출세액·⑯ 가산세 …)이 그 열마다 반복된다. ③ 뒷면 코드표에 **국내자산 7. 국외전출세 코드 1-94 (세율 20~25%)**, **국외자산 3. 국외전출세 코드 2-94 (세율 «10% 또는 20%»)**. 부표 2: ② «종목코드 또는 사업자등록번호(해외주식은 ISIN코드와 국가명)»·③ 국내/국외 구분(1/2)·⑤ **양도유형 2 = «국외전출 시 주식등을 양도한 것으로 보는 경우»**·작성방법 15(국외전출 시 ④ 종류코드는 34·35·33·44·24·74·45·25·41·23·51·62·61 중 하나, ⑧ 양도일자=출국일, ⑨ 주당양도가액=출국일 1주당 시가, **20~25%(국외주식은 10% 또는 20%) 적용**). 부표 2 ④ 표: 국외주식등 중소기업 62(10%)·중소기업외 61(20%). ⑯ 가산세 작성방법 13: **국외전출자 주식등 보유현황 미신고 가산세(액면금액 또는 출자가액의 2%)는 «기장불성실 등 가산세»란에 기재**. ⑰ 작성방법 14: 국외전출세의 «조정공제세액»은 ⑰란에 기재. **제104호**: 제목 «국외전출자 주식등 보유현황 신고서»(구 «…국내주식등…»)·표 «2. 주식등 보유 현황» 20행·⑩ 해외주식은 ISIN코드와 국가명·각주 «시행령 §178의8②에 따라 제외되는 국외주식등만 보유한 국외전출자는 신고대상에서 제외» — 현행 `ExitTaxHoldingReportForm`이 이미 이 본문이다. **한계**: 현행(2026.7.1.) 84호 본문과의 diff는 하지 않았다(2027 본에 세율구분 열이 있다는 것만 확인). 서식 원문 HWP/PDF는 못 구했고 MCP가 추출한 텍스트(HTML 표 평탄화)로 열 순서를 읽었다 — 열의 정확한 시각 배치(국내분 소계·세율구분 열·국외분 소계 순서)는 «확인 필요»라 U3 구현은 **합계 · 국내분 소계 · 국외분 소계 · 구분별 열**의 값 구조로 재현하고 시각 배치는 참고용 |
| V-8 | 5억 합계에 2·3호 제외분이 포함되는지 · 합계 초과 시 «전체 포함» 해석 | 엔진 파트. UI는 echo만 보이므로 영향 없음 |
| V-9 | 실양도 정보(Step3 `etActualTransferPricePerShare` — **원화 1주당 단가 1칸**, `ExitTaxSettlementBlock.tsx:69-98`)가 **종목 구분 없이 하나**인데 국외주식·국내주식이 섞이면 어느 종목의 실양도인지 모호 | 엔진 계획서의 조정공제 범위(종목 단위 여부)와 함께 확인. 필요 시 U후속 |
| V-10 | 이력 dedup 키가 출국일을 반영하지 않아 2026/2027 비교 계산이 같은 케이스명이면 서로 덮어쓰는지 — `extractStockTransferDate`가 `transferDate`/`transferLots`만 읽는 것까지는 확인(`title-generator.ts:139-147`), 실제 덮어쓰기는 미실측 | throwaway probe(`computeBusinessKey`) |
| V-11 | `RadioCardGroup` inline 라디오의 `description` 미렌더(메모리 «inline 라디오 description 미렌더») — 본 계획은 전부 `stack` 레이아웃이라 해당 없음. 시장 5버튼은 native 버튼이라 해당 없음 | 컴포넌트 확인 불필요 — 자가 점검용 |
| V-12 | `ExitTaxFilingFormSection`(제84호) 서식 25행 중 호별 세율을 담을 수 있는 칸 | **확인됨(2026-11-27)** — `StockFilingFormTable` 25행(합계 1열 + 다종목 시 종목별 열)에는 호별(세율구분별) 열이 **없다**(`StockFilingFormTableHelpers.ts` `deriveColumns`: `total` 또는 `stock{i}` 열뿐, 세율 행은 단일). 공식 개정 서식(V-7)은 세율구분 열을 두므로 U3에서 구분 ≥2일 때 전용 표 `ExitTaxBucketFilingTable`로 재현한다 |
| V-13 | 새 조문 인용(§118의9①·§118의11 2호·영 §178의8②·§178의9②3호) 상수·`additions-transfer*.ts` manifest 등록 — UI는 `TRANSFER.*`/상수만 쓴다 | 엔진 파트 `legal-codes`·`npm run verify:legal` |
| V-14 | 홈·계산기 소개 문구의 국외전출세 지원 범위 표기(2027 개정 반영) | `app/page.tsx`·`MarketTypeBlock` 설명 읽기 |

---

## 13. 자가 점검 (이 문서 기준)

- [x] 14지점 중 UI 담당 ①②③⑤⑥⑦ + ⑧ + ④⑬ 호출 계약 명세, ⑨⑩⑪⑫⑭는 계약만(§6.2)
- [x] 정책 1: `useEffect → store` 없음 — era는 `useMemo` 파생, 시장 전환은 onChange patch 동승(D-8)
- [x] 정책 2: 환율·시가·5억 합계 입력 생략 경로 없음, 국외 종목 era 위반 시 자동 삭제 대신 차단(D-6·UQ-9)
- [x] 정책 3: fallback 일치표(§6.3) — 시장·시가 모드·통화·국가·근로자 상태가 UI·④·⑧·initial/normalize에서 동일
- [x] 2026.12.31. 이전 출국 회귀 금지: 조건부 마운트(D-2) + SSR 바이트 동일 anchor(EXA-1) + E2E X-1
- [x] 공용 컴포넌트·톤·라벨·placeholder 규칙(§4.2) — native checkbox/radio/date 신규 없음, `text-[Npx]` 없음, 숫자 예시 placeholder 없음
- [x] 결과 산식은 한국어 풀어쓰기·숫자 옆 라벨·「원」 미표기·중립 표현(§5.1)
- [x] file:line은 이 트리에서 읽은 값 — 읽지 못한 것은 V-n
- [ ] 브라우저·테스트 미수행(계획 문서 — 코드 변경 0, 커밋 0)

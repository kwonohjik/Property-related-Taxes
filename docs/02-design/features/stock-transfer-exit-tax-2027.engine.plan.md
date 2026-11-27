# 국외전출세(§118의9~§118의18) 2027.1.1. 이후 출국분 개정 — 엔진·API 계획

> 쌍둥이 문서: `stock-transfer-exit-tax-2027.ui.plan.md` (UI ①②③⑤⑥⑦). 이 문서는 **엔진·API·④⑧⑨⑩⑫⑬⑭·법령 상수·매니페스트**를 맡는다.
> 형식 선례: [`transfer-foreign-realestate.engine.plan.md`](./transfer-foreign-realestate.engine.plan.md). 기존 설계: [`stock-transfer-exit-tax.engine.design.md`](./stock-transfer-exit-tax.engine.design.md).
> **계획 전용 — 코드 변경 0.** 조문은 KoreanLaw MCP로 2026-11-27 실독(법 lawId 001565 · 영 lawId 003956 · 지방세법 lawId 001649). 수치는 node 손계산(엔진 미실행)이며, file:line은 이 worktree에서 열어 확인했다. 미확인은 「확인 필요」(V-n).
> 기준선(2026-11-27 실측): `exit-tax*.test.ts` 6개 파일 111 tests 전부 통과 — **2026 출국 분기는 이 값이 그대로 유지돼야 한다.**

---

## §0 요약

1. **개정의 본체**: 부칙 <제21221호, 2025.12.23.> 제1조 2호가 §118의9~§118의18 개정규정을 **2027.1.1.** 시행으로 정하고, 제8조가 「2027년 1월 1일 이후 거주자가 출국하는 경우부터 적용」으로 정한다. **기준일은 출국일**이다(양도일·실제 양도일 아님).
2. **바뀌는 것 3가지**: ① 대상에 **§94①3호 다목(국외주식등)** 추가·용어 「국외전출자 국내주식등」→「국외전출자 주식등」 ② §118의11이 **1호(3호 가·나목, 4호 다·라목: 20%/25% 누진)**와 **2호(3호 다목: 중소기업 10% / 그 밖 20% 단일)**로 갈림 ③ 시행령 §178의8②·§178의9②3호 신설(국외주식등 제외 3가지, 시가는 §178의3).
3. **현행 엔진은 출국일을 전혀 보지 않는다**: `lib/tax-engine/stock-transfer/exit-tax.ts`에 `departureDate` 참조 0건(grep 실측), 종목 `marketType`도 계산에 안 쓰이고, 세율은 `applyExitTaxRate`(`exit-tax.ts:43-70`) 단일 누진표다. 즉 연혁 게이트·세율 분기·국외 종목이 **전부 신규**다.
4. **세액이 갈리는데 법문 근거가 없는 곳**(§9): ① 1호/2호 사이 과세표준·기본공제 250만원 배분(V-1) ② 국외주식 환율 기준(V-2, 예시 16,000,000원 차) ③ 지방소득세(지방세법 §103의3⑧이 호 구분 없는 단일표, V-3, 예시 3,087,500원 차) ④ 5억원 이하 제외 판정 범위(V-4).
5. **정정 사항(요청문 대비)**: 시행령 §178의8②는 **현행(시행 2026.10.1.) 시행본에 없다.** `efYd=20261231` 조회에는 ②가 없고 `efYd=20270101`(MST 283631, 공포 제36129호)에만 있다. MST 290841을 `efYd` 없이 직접 조회하면 시행예정 문언이 섞여 나오므로 **반드시 `efYd`로 종전/개정을 구분해 조회**한다(§1.5).
6. **저장소에는 이미 일부 선반영이 있다**: manifest `TRANSFER_DECREE.EXPATRIATE_MAJOR_SHAREHOLDER`·`EXPATRIATE_DEPARTURE_VALUE`가 `basis: "announced"`(`additions-transfer-decree.ts:631-655`), 보유현황 신고서 UI가 별지 제104호서식 〈개정 2026.3.20.〉 재현(`ExitTaxHoldingReportForm.tsx:3-20, 186`). 엔진·API 쪽은 선반영이 **없다**.
7. **권고 구조(Q-1)**: 같은 route·`marketType: "exit_tax"`·엔진을 **확장**하되, `exit-tax.ts`(645줄)가 800줄 정책 위험구간이므로 **동작 불변 분리 리팩터를 선행 PR**로 한다.

---

## §1 법령 근거 (종전/개정 대조 — 바뀐 문구만)

조회: 법 `get_law_text(lawId="001565", jo, efYd="20261231")`(종전) vs `efYd="20270101"`(개정). 두 호출 모두 헤더 시행일은 20260701로 표기되나 본문은 각각 종전·개정 문언이다(개정본 조문에 `<개정 2025.12.23>` 표시 확인).

### 1.1 소득세법

| 조문 | 종전(~2026.12.31. 출국) | 개정(2027.1.1.~ 출국) | 엔진 영향 |
|---|---|---|---|
| **§118의9①** 본문 | 「제94조제1항제3호**가목 및 나목**, 같은 항 제4호다목 및 라목에 해당하는 주식등을 출국일에 양도한 것으로 보아」 | 「제94조제1항제3호**가목부터 다목까지**, 같은 항 제4호다목 및 라목에 해당하는 주식등(이하 **"국외전출자 주식등"**이라 한다)」 | 국외주식 종목 신규. 대상 판정은 출국일 게이트 |
| 〃 ①2호 | 「…소유하고 있는 주식등의 비율ㆍ시가총액 등을 고려하여 대통령령으로 정하는 대주주」 | 「…소유하고 있는 주식등(**제94조제1항제3호다목에 해당하는 주식등은 제외한다**)의 비율ㆍ시가총액 등을…」 | **대주주 판정에서 국외주식 제외** (§3.6) |
| 〃 ② | 「국외전출자의 범위 및 그 밖에 필요한 사항은 대통령령」 | 「국외전출자의 범위, **국외전출자 주식등의 범위** 및…」 | 영 §178의8②의 위임 근거 |
| **§118의10** 제목·① | 「국외전출자 **국내주식등**」(① 괄호로 정의) | 「국외전출자 **주식등**」 | 용어. ①(출국일 시가)·②(§97)·③④⑤⑥ **문언 동일** |
| **§118의11** | 「…양도소득과세표준에 다음의 계산식에 따라…」 3억 이하 20% / 초과 6천만원+(초과액×25%) 단일표 | 「…다음 **각 호의 세율**을 적용…」 **1호** 3호 가·나목, 4호 다·라목 주식등 = 종전과 같은 표 / **2호** 3호 다목 주식등: **가. 중소기업의 주식등 100분의 10 / 나. 그 밖의 주식등 100분의 20** | 세율 3갈래(§3.3) |
| **§118의12①** 조정공제 | 「국외전출자 국내주식등」… [양도가액 − 실제 양도가액] × 제118조의11에 따른 세율 | 용어만(「국외전출자 주식등」). **산식 문언 동일** | 2호는 세율이 단일(스칼라) → §3.7 |
| **§118의13①②** | 용어 「국내주식등」 | 용어만 변경. 안분식·한도·②1·2호 **동일** | §3.7 |
| **§118의14①** | 〃 | 용어만 | §3.7 · V-14 |
| **§118의15** 제목·①④⑤⑥ | 「국외전출자 국내주식등」(액면금액 가산세 대상 포함) | 용어만. 그러나 ④의 가산세 base인 「국외전출자 주식등의 액면금액」에 **국외주식이 들어온다** | §3.9 · V-15 |
| **§118의16**·**§118의17**·**§118의18** | 〃 | 용어만(「국외전출자 주식등」) | 문구 정리만 |

> §118의15②(신고기한: 출국일이 속하는 달의 말일부터 3개월)·③·§118의16②(5년/10년)·§118의17 환급 요건은 두 시행본이 **동일**함을 실독으로 확인.

### 1.2 시행령 (종전 = `efYd=20261231` MST 290841 · 개정 = `efYd=20270101` MST 283631)

| 조문 | 종전 | 개정 | 시행 |
|---|---|---|---|
| **§178의8** | 제목 「대주주의 범위」, ① 한 문장(§167의8①) | 제목 「대주주의 범위 **등**」. **② 신설**: 「법 제94조제1항제3호다목에 해당하는 주식등(**"국외주식등"**) 중 다음 각 호의 어느 하나에 해당하는 국외주식등은 법 제118조의9제1항에 따른 주식등(이하 "국외전출자 주식등")에서 **제외**한다」 1호 「국외전출자가 출국 당시 소유한 국외주식등의 법 제118조의10제1항에 따른 **양도가액의 합계가 5억원 이하**인 것」 2호 「외국인인 임원 또는 사용인으로서 출국일 10년 전부터 출국일까지의 기간 중 국내에 거소나 주소를 둔 기간의 **100분의 80 이상**의 기간 동안 국내에서 근로를 제공한 사람(일용근로자 제외, **국내에서 근로의 제공이 종료된 날부터 6개월 이내에 출국**하는 외국인으로 한정)이 소유한 것」 3호 「외국인근로자의 **배우자 및 20세 이하**(20세가 되는 날과 그 이전 기간)인 직계비속이 그 외국인근로자가 국내에서 근로를 제공하기 시작한 날 **전에 취득**한 것」 | 2027.1.1. |
| **§178의9②3호** | 1·2호만(상장→§99①3·5·6 기준시가 / 비상장→전후 3개월 매매사례→§99①4~6) | **3호 신설**: 「국외주식등: **제178조의3에 따라 산정한 시가**」 (①은 동일: 출국일 당시 거래가액) | 2027.1.1. |
| **§178의10** | 「…국외전출자 국내주식등을 실제 양도한 날부터 2년 이내에…」 | 용어만(「국외전출자 주식등」) | 2027.1.1. |
| **§178의11** | 제목·①「국외전출자 국내주식등 (…보유현황신고서)」 | 용어만. ②~④ 동일 | 2027.1.1. |
| **§178의12** | 납부유예 요건·이자상당액 산식 | **동일**(두 시행본 본문 일치) | — |
| §157의3 (국외주식 범위, 2027본 실독) | — | 1호 외국법인 발행(증권시장 상장분·§178의2④ 제외) · 2호 내국법인 발행 해외상장(DR 포함). **종전본과의 대조는 미실시**(PR-1에서 `efYd=20261231`로 대조 — V-17) | — |
| §178의3 (국외자산 시가, 2027본) | — | ① 단서가 **주식등에는 ②~④호를 적용하지 않는다**(외국정부 평가가액만) · ②2호 유가증권은 상증법 §63 준용, 「평가기준일 이전ㆍ이후 각 2월」→「양도일ㆍ취득일 이전 1월」 | V-12 |

부칙: 령 <제36129호, 2026.2.27.> 제1조 1호 「제178조의8, 제178조의9제2항제3호, 제178조의10, 제178조의11 및 별표 3의3의 개정규정: **2027년 1월 1일**」. **제2조~제17조(적용례·경과조치) 전수를 읽었으나 국외전출 관련 적용례·경과조치가 없다** → 령 개정규정은 법 부칙 제8조(출국일 기준)에 따라 같은 기준으로 적용한다고 보되 **령 자체의 적용례 부재**는 V-10.

### 1.3 부칙·연관 개정

- 법 <제21221호, 2025.12.23.> 제1조 2호 시행일 2027.1.1. · 제8조 적용례(출국일). **경과조치 규정은 없다**(제14·15조는 배당·원천징수 관련) → 2026.12.31. 이전 출국자의 이후 경정청구·조정공제 등은 **종전 문언**(부칙 제8조 반대해석, V-13).
- 시행규칙 <제22호, 2026.3.20.> 제1조 1호: **별지 제84호서식, 별지 제84호서식 부표 2**, 별지 제104호서식·제105호서식 등 개정규정 **2027.1.1.** 시행 — 서식 구조(호별 과세표준 칸 여부)는 **미대조**(UI 계획·V-11).
- **지방세법 §103의3⑧**(제21308호, 2025.12.31., 시행 2027.1.1.): 종전 「소득세법 제118조의9에 따라 양도소득으로 보는 **국내주식 등**의 평가이익에 대한 세율은 다음 표」 → 개정 「…양도소득으로 보는 **주식 등**의 평가이익…」. **표는 호 구분 없는 단일표**(3억 이하 1천분의 20 / 초과 600만원+(초과액×1천분의 25)) 그대로 → 국외주식(소득세 10%/20%)과 불일치 가능(V-3). ①12호(§94①3다목)는 소득세와 같은 1천분의 10/20.

### 1.4 현행 구현과 개정 규정의 대응 (file:line, 이 worktree 실측)

| 항목 | 현행 | 근거 |
|---|---|---|
| 출국일 사용 | **없음** | `grep departureDate exit-tax.ts` 0건. 스키마 `stock-transfer-exit-tax-schema.ts:97`은 받기만 함 |
| 종목 시장 | `kospi/kosdaq/konex/unlisted`, 계산 무영향 | `exit-tax.types.ts:23` · Zod `exit-tax-schema.ts:44` |
| 세율 | 단일 누진 `STOCK_MAJOR_PROGRESSIVE_BRACKETS` | `exit-tax.ts:31, 43-70` |
| 기본공제 | `min(2,500,000, 합산차익)` 1회 | `exit-tax.ts:364-368` |
| 대주주 | 사용자 입력 boolean | `exit-tax.types.ts:74` · 경고 `validate-exit.ts:89-91` |
| 조정공제 단순화 | 「v1: 전 종목 동일 단가」 | `exit-tax.ts:153, 163-165, 500` |
| 지방소득세 | `floorTen(과세대상세액×0.1)` | `exit-tax.ts:73-75, 569` |
| 날짜 변환 | 평면 `coerceDates` + `holdings[]` 수동 `toDate` | route `stock-transfer/route.ts:301-304, 335-347` |
| 오류 응답 | 일반 `catch` → 500 (`taxCalculationErrorResponse` 미사용) | route `:387-390` |

### 1.5 조회 메모 (재조사 방지)

- `get_law_text(mst="290841", jo="제178조의8")`(efYd 없음)은 **개정 문언(②)을 반환**했다 — 헤더는 「시행 20261001」인데도. 종전/개정 판정은 **`lawId + efYd`** 만 믿는다. 개정본 령은 `efYd=20270101`이면 lawId가 아니라 MST 283631로 폴백된다.
- 법 `efYd=20270101`도 헤더 시행일은 20260701로 찍히지만 본문은 개정문(`<개정 2025.12.23>`). 부칙 조회(`jo="부칙"`)는 출력이 50,000자로 잘리므로 **최근 공포 첫 항목만** 쓴다.
- manifest `verify:legal`은 `basis: "announced"` 규칙만 공포본(MST) 경로를 본다(`verifier.ts:59-64`). 2027.1.1. 이후 첫 영업일에 `announced → enforced` 환원 PR이 필요하다(PR-8).

---

## §2 출국일 연혁 게이트

### 2.1 설계

- 신규 무의존 leaf **`lib/tax-engine/data/exit-tax-2027-era.ts`** (선례 `foreign-stock-track-era.ts`, 클라이언트도 직접 import):
  `EXIT_TAX_2027_START = "2027-01-01"`, `isExitTaxFrom2027(departureDate: Date | string | undefined): boolean`.
  - 비교는 **`parseISO`·`isBefore`(`lib/tax-engine/utc-date.ts:187, 226`)**로 한다. `new Date(x)`·ISO 문자열 비교 금지(루트 규칙). 빈 값·파싱 불가는 false(필수 검증은 별도).
  - 경계: `2026-12-31` → false(종전), `2027-01-01` → true. 시각이 붙은 값도 UTC 달력일 기준.
- ⑧(클라이언트 validate)·⑫(Zod superRefine)·엔진이 **같은 술어**를 import(`single-source-engine-helper`). 한쪽만 막으면 API 직접 호출로 뚫린다.
- **전환 결과 `exitTaxRegime: "pre2027" | "from2027"`을 결과에 echo**(조기 반환 `not_liable`에도).

### 2.2 구간별 동작

| 항목 | pre2027 (~2026.12.31.) | from2027 (2027.1.1.~) |
|---|---|---|
| 국외주식 종목(`marketType: "foreign"`) | **과세 대상 아님** → 종목을 제외(`scope: "excluded"`, `excludedReason: "pre2027_foreign_not_covered"`) + 고지. 차단하지 않는다(Q-2) | §3.5 제외 판정 후 과세 |
| 세율 | 1호 표만 (현행) | 1호 표 / 2호가 10% / 2호나 20% |
| 대주주 판정 안내 | 국외주식 제외 문구 없음 | 「국외주식등 제외」 문구(§3.6) |
| 조정공제·외국납부 등 | 현행(전 종목 동일 단가 단순화 유지) | 1호만 현행 로직, **2호(과세 종목) 있으면 차단**(Q-8) |

> pre2027에서 국외주식을 **조용히 버리지 않는다**: `holdingDetails[].scope`·`excludedReason`·`warnings`로 드러낸다(「침묵 fallback 금지」).

### 2.3 연혁 gate의 음성 시료 (2026 출국 분기 유지)

- 기존 6개 파일 111 tests(§0 기준선) + 교재 갑·을 anchor(PR #3695, 브랜치 `test/exit-tax-textbook-anchor`의 `exit-tax-textbook-departure-2026.anchor.test.ts` — **이 worktree 기준선에는 아직 머지돼 있지 않다**, 머지 상태 확인 필요). 2026.9.1. 출국 갑 41,875,000 · 을 14,500,000.
- **그 교재 사례는 실제 양도일이 2027.3.1.이다**. 그래도 2026 출국이므로 종전 규정이 적용된다(부칙 제8조는 출국일 기준) — **게이트를 `actualTransferDate`로 걸면 이 anchor가 깨진다.** 이것이 게이트 기준일 오류를 잡는 최고의 음성 시료다.

---

## §3 엔진 설계

### 3.1 입력 변경 (이 목록이 ⑫ 정의서 — UI 계획 참조 §A)

**종목 `ExitTaxHolding` 신규/변경**

| 필드 | 타입 | 규칙 |
|---|---|---|
| `marketType` | 기존 + `"foreign"` | 국외주식 §94①3다목. 1호 종목은 현행 필드 그대로 |
| `isListedForeignCorp?` | boolean | **PR-4A `ForeignStockInput`과 같은 이름·의미**(true=영 §157의3 1호 외국법인 발행 / false=2호 내국법인 해외상장). foreign일 때 필수. 3중 패턴 default `true`(PR-4A ④와 동일) |
| `isSmallMediumEnterprise?` | boolean | **`isListedForeignCorp=true`면 무시(false 취급)** — PR-4A와 같은 게이트(`api-foreign-exit.ts:44`)를 ④·⑧·엔진이 같은 술어로 |
| `countryCode?` · `foreignCurrencyCode?` | string | 표시·서식용. 계산 무영향 |
| `departureDayValuationMode` | 기존 4값 + `"foreign_market_price"`(§178의9① 거래가액, 외화) · `"foreign_decree_178_3"`(§178의9②3호, 사용자가 §178의3으로 산정한 시가, 외화) | Q-11 |
| `departureDayPriceForeign?` | number(소수 ≤4자리) | 1주당 외화 출국일 시가. foreign 필수 |
| `departureExchangeRate?` | number(소수 ≤4자리, >0) | **출국일 기준 환율** — V-2. 미입력은 차단(fallback 없음) |
| `perShareAcquisitionPriceForeign?` · `acquisitionExchangeRate?` | number | 취득가액 외화 단가와 **취득일** 기준환율(V-2). foreign 필수 |
| `acquiredBeforeWorkerStartedWork?` | boolean | 영 §178의8②3호. `foreignWorkerStatus="foreign_worker_family"`일 때만 의미 |

> foreign 종목의 기존 원화 필드(`perShareAcquisitionPrice`·`departureDayMarketPrice` 등)는 **받지 않는다**(⑫ refine로 혼용 거부). 환산 결과(원)는 엔진 내부에서 만들어 `departureDayValue`·`acquisitionCost`에 싣는다.

**최상위 `ExitTaxInput` 신규**

| 필드 | 타입 | 규칙 |
|---|---|---|
| `foreignWorkerStatus?` | `"none" \| "foreign_worker" \| "foreign_worker_family"` | 3중 패턴 default `"none"` (영 §178의8②2·3호) |
| `foreignWorkerChecks?` | `{ isOfficerOrEmployee, isNotDailyWorker, domesticWorkRatioAtLeast80, departedWithin6MonthsOfWorkEnd }` 전부 boolean | status≠none일 때 필수. **4개 모두 true여야 제외**(Q-6, V-5) |
| `foreignWorkerFamilyKind?` | `"spouse" \| "child_20_or_under"` | status=`foreign_worker_family`일 때 필수 |
| `basicDeductionAllocation?` | `{ clause1?: number; clause2a?: number; clause2b?: number }` | **과세 종목의 세율 구분이 둘 이상일 때만** 필수(Q-4). 합계 = `min(2,500,000, 합산 양도소득금액)` 정확히 일치, 각 값 ≤ 해당 구분 양도소득금액 |

**유지**: `yearsResidentLast10`·`departureDate`·`isMajorShareholder`(Q-9)·`deferral*`·`actualTransferPricePerShare`(1호 전용 레거시)·`foreignTaxPaid*`·`domesticSourceTaxWithheld`·`hasFiledHoldingsReport`·`totalFaceValue`(원화 합계, V-15)·`reenteredWithin5Years`.

### 3.2 계산 순서

0. `regime = isExitTaxFrom2027(departureDate)`.
1. §118의9① 요건(거주 5년·대주주) — **불변**. 미충족이면 종전처럼 `not_liable` 조기 반환(`regime` echo 추가).
2. 종목 범위: pre2027에서 `foreign` → 제외. from2027에서 `foreign` → 3 이하.
3. **외화 환산**(§3.4): foreign 종목의 출국일 시가(원)·취득가액(원) 산출.
4. **§178의8② 제외 판정**(§3.5) — 아래 합집합이 제외 종목.
5. 과세 종목을 **세율 구분(`rateBucket`)**으로 분류: 국내 1호 종목 → `clause1`; foreign 과세 종목 → `clause2a`(`isSmallMediumEnterprise` && !`isListedForeignCorp`) / `clause2b`.
6. 종목별 양도차익(= 출국일 시가 − 취득가액, 현행 산식). **구분 내 종목은 합산(손실 통산)**, 구분 간 손실은 Q-5.
7. §118의10④ 250만원: 합계 `G = Σ G_b`, `D = G>0 ? min(2,500,000, G) : 0`. 구분이 하나면 `TB = max(0, G − D)`. 둘 이상이면 `basicDeductionAllocation`으로 `TB_b = G_b − alloc_b`(V-1).
8. 구분별 세액: `clause1` = 현행 `applyExitTaxRate`; `clause2a` = `applyRate(TB, 0.10)`; `clause2b` = `applyRate(TB, 0.20)` (`tax-utils.ts:57` — 부동소수 곱 직접 사용 금지).
9. 이후 단계(납부유예·가산세·재전입·경정)는 현행 로직. **과세 종목 집합이 바뀌었으므로 입력 `holdings` 전체가 아니라 `clause1` 과세 종목만** 조정공제 안분 인자로 넘긴다(§3.7, K-18).
10. 지방소득세(§3.8) · 결과 조립.

> **분기 보존**: pre2027 또는 `clause1` 단독 경로는 현행과 **바이트 단위 동일**해야 한다(기존 111 tests + 교재 anchor).

### 3.3 과세표준·기본공제 250만원의 호별 배분 (요청 3번)

법문(실독):
- **§118의10③** 「양도소득금액은 제1항에 따른 양도가액에서 제2항에 따른 필요경비를 공제한 금액」, **④** 「양도소득과세표준은 제3항에 따른 양도소득금액에서 **연 250만원**을 공제한 금액」 — **한 번의 공제, 한 개의 과세표준**. 호별 구분 언급이 없다.
- **§118의11** 「④에 따른 양도소득과세표준에 다음 **각 호의 세율**을 적용」 — 세율만 호별.
- 시행령 §178의8~§178의12·§157의3·§178의3 어디에도 **공제액·과세표준의 호별 배분 규정이 없다**(실독). 시행규칙 별지 제84호서식 개정(2027.1.1.)은 **미대조**.

확정 가능한 것: ① 250만원은 호 구분 없이 **연 1회** ② §118의10⑤에 따라 국내 §103 기본공제·종합소득 과세표준과는 **별도 계산**(현행 유지) ③ 구분 내 종목 간 양도차익은 §118의10③ 문언상 합산(현행 유지).
**확정 불가(근거 없음 → V-1)**: 구분이 둘 이상일 때 ① 250만원을 어느 구분에서 얼마 공제하는지 ② 한 구분이 음수일 때 어디서 상계하는지. **추정으로 구현하지 않는다.**

세액 영향(손계산, K-11·K-12·K-25): 250만원 배분만으로 1호20%·2호25% 구간이면 최대 `2,500,000 × (25%−20%) = 125,000`원, 2호 가·나목 사이는 `2,500,000 × (20%−10%) = 250,000`원 차이. 구분 간 손실 상계 방식은 64,875,000원(K-12)까지 갈린다.

v1 처리(Q-4·Q-5 추천안): ① 구분 1개 → 자동(법문 직접 적용) ② 구분 2개 이상 → **`basicDeductionAllocation` 명시 입력 필수**(미입력은 ⑧⑫ 차단, 자동 안분 fallback 금지), 결과에 「법령에 배분 규정이 없어 입력값 기준」 고지 ③ 구분 간 음수 → ⑧⑫ 차단 + 고지(엔진은 방어적으로 `TaxCalculationError(INVALID_INPUT, {path})`, `lib/tax-engine/tax-errors.ts:36`·`lib/api/tax-error-response.ts:15`가 400 매핑).

### 3.4 국외주식 외화·환율 (요청 4번)

- 입력은 **외화 단가 + 환율**(원/외화). 환율 자동 조회·원화 직접 환산 입력은 하지 않는다(Q-3).
- 환산: `departureDayValue = toKrwExact(departureDayPriceForeign × shareCount, departureExchangeRate)`, `acquisitionCost = toKrwExact(perShareAcquisitionPriceForeign × shareCount, acquisitionExchangeRate)` — **종목당 총액 1회 floor**(선례 `foreign-stock.ts:199-204`와 같은 방식, V-13).
- **부동소수 금지**: `Math.floor(10,000 × 40 × 1,300.10)`은 **520,039,999**(실측), 정확값 520,040,000 → **1원 과소**. 신규 `lib/tax-engine/stock-transfer/exit-tax-fx.ts`에 소수 ≤4자리를 정수 스케일로 복원해 BigInt로 곱하는 `toKrwExact(amount, rate)` (`decimalizeRatio` `tax-utils.ts:95` 방식, `applyRatio` `:131`은 amount가 안전정수·ratio가 비율 전제라 직접 재사용 불가). 소수 5자리↑·비유한·≤0은 `TaxCalculationError`. 기존 `foreign-stock.ts`의 같은 문제는 **별건**(§11).
- 법령 근거 상태(V-2): §118의10②는 필요경비를 「제97조에 따라」 계산하라고만 하고 **외화 환산 위임이 없다**. 환산 기준일은 영 §178의5(§118의4②→PR-4A가 준용하는 국외주식 일반 양도 규정: 양도가액·필요경비를 수령·지출한 날의 기준환율/재정환율)가 **유일한 유사 선례**이나 §118의9~ 체계에는 준용 문언이 없다. 따라서 v1은 **취득가액=취득일 기준환율, 시가=출국일 기준환율**(선례 정합)로 구현하되 결과·화면에 「환산 기준일은 법령상 명시가 없어 확인 필요」를 고지한다. 대안(둘 다 출국일 환율)과의 차이는 K-10(16,000,000원).
- **중소기업 판정**(2호 가목): PR-4A와 같은 입력·게이트. 외국법인 발행(`isListedForeignCorp=true`)은 가목 불가. 판정 시점은 V-16.
- **영 §178의8②1호(5억 이하)** 판정은 환산된 원화 양도가액 합계 기준(§3.5).

### 3.5 §178의8② 제외 판정 (요청 4번 — 판정 순서)

세 호는 문언상 **서로 독립**이다. 엔진은 각 호를 독립 술어로 평가해 합집합을 제외한다(Q-10).

| 호 | 술어 | 제외 범위 |
|---|---|---|
| 1호 | `Σ(출국 당시 소유한 **모든** 국외주식등의 §118의10① 양도가액) ≤ 500,000,000` (이하 → 제외, **초과분만 과세가 아니라 초과 시 전체 과세**) | 국외주식 전부 |
| 2호 | `foreignWorkerStatus="foreign_worker"` && 4개 요건 true | 해당인 소유 국외주식 전부 |
| 3호 | `foreignWorkerStatus="foreign_worker_family"` && 4개 요건 true && `foreignWorkerFamilyKind` 유효 && 종목 `acquiredBeforeWorkerStartedWork` | 해당 종목 |

- **판정 순서 쟁점(V-4)**: 1호의 「소유한 국외주식등」 합계에 2·3호 해당분이 **포함되는가**. 문언 직독은 **포함**(소유 전부) — 이것을 구현한다. 대안(2·3호 제외 후 잔여 합계로 1호 판정)은 K-13에서 19,500,000원 차이.
- 경계: 합계 정확히 500,000,000 → 제외, 500,000,001 → 과세(K-7). 합계는 **원화 환산 후 정수**.
- 1호의 합계는 **1호 종목(국내)을 포함하지 않는다**(「국외주식등」만).
- 3호 20세 기준 시점(취득일/출국일)은 문언에 없다 — 엔진은 판정하지 않고 **사용자 선언(`foreignWorkerChecks`+`foreignWorkerFamilyKind`)**을 받는다(V-5).
- 제외 종목은 `scope:"excluded"` + `excludedReason ∈ {"foreign_total_le_500m","foreign_worker_owned","foreign_worker_family_pre_work","pre2027_foreign_not_covered"}`로 echo, **합계·세액·서식 값에서 제외**.
- 모든 종목이 제외되면 `taxCategory:"not_liable"`, `residencyEligible`/`majorShareholderEligible`은 true, `ineligibleReason`에 호·금액을 싣는다.

### 3.6 대주주 판정에서 국외주식 제외 (요청 6번)

- 법문(§118의9①2호 괄호)상 **직전 연도말 소유 주식 중 국외주식은 대주주 판정 대상이 아니다**. 현행 엔진은 대주주를 **사용자가 판정한 boolean**(`isMajorShareholder`)으로 받으므로 **엔진 계산식은 바뀌지 않는다**(Q-9). 바뀌는 것은 ⑧의 안내 문구와 경고뿐:
  - from2027에서 `isMajorShareholder=false` → 종전처럼 `not_liable`이되, 사유에 「국외주식 보유분은 대주주 판정에서 제외됨」을 덧붙인다.
  - from2027에서 **과세 종목이 국외주식뿐**이고 `isMajorShareholder=true` → **차단하지 않는다**(직전 연도말 국내 대주주였다가 출국 전 국내분을 처분한 경우가 가능). 경고만(「국외주식 보유분은 대주주 판정에 포함되지 않습니다」).
- 대주주 임계 이력(`major-shareholder` 모듈)을 exit 경로에 연결하는 것은 **이번 범위 아님**(§11).

### 3.7 조정공제·외국납부세액공제·비거주자 세액공제 (요청 5번)

법문 정리:
- §118의12①: `[§118의10① 양도가액 − 실제 양도가액] × 「제118조의11에 따른 세율」`. **2호는 세율이 스칼라(10% 또는 20%)** → 조정공제 = 차액 × 그 세율. 1호는 누진표라 현행 엔진의 「출국일 기준 산출세액 − 실양도가 기준 산출세액」(`exit-tax.ts:171-191`)이 맞고, 2호에서는 이 식이 같은 값(스칼라 세율이므로 차분이 곱과 같다 — K-16 검산).
- §118의13①: 「**해당 자산의** 양도소득에 대하여 외국정부에 납부한 세액 × […] ÷ (…)」 — **자산(종목)별 식**이다. 한도는 「산출세액에서 조정공제액을 공제한 금액」(총액).
- §118의14①: 비거주자의 **국내원천소득**으로 과세될 때만. §119 11호 — 가목 내국법인 발행 주식은 포함, 나목 외국법인 발행은 **증권시장 상장분만**(실독) → 2호 종목 중 외국법인 발행분은 대상이 아닐 수 있음(V-14).

현행 한계: `calcAdjustmentDeduction`이 **실제 양도 1주당 단가 하나**를 전 종목 합산 주식수에 곱한다(`exit-tax.ts:153, 163-165`) — 국외주식(통화·단가 수준이 다름)이 섞이면 **의미가 성립하지 않는다**.

**권고(Q-8)**: v1(PR-2~6)은 출국 시 세액까지만 2호를 지원하고, **과세 종목에 2호가 하나라도 있으면 경정청구 입력(`actualTransferDate`·`actualTransferPricePerShare`·`foreignTaxPaid*`·`domesticSourceTaxWithheld`)을 ⑧⑫에서 차단 + 고지**한다(자동 환산·안분 fallback 금지). 일반화 설계(후속 PR-7): 종목별 `actualTransferPrice`(원) 입력, 구분별 `tax_b(TB_b) − tax_b(TB_b − drop_b)`, 외국납부세액 종목별 안분(`computeForeignTaxCreditLimits`류 재사용 여부는 그때 판단), 한도는 총 산출세액 기준.
**동시에 지킬 것**: 2호가 **전부 제외**되고 1호만 과세될 때는 경정청구를 허용하되, 안분 주식수는 `clause1` 과세 종목만 쓴다(K-18). 제외된 국외주식 주식수가 `holdings.reduce`(`exit-tax.ts:164, 500`)에 섞이면 조용히 틀린다.

### 3.8 지방소득세

- 현행: `floorTen(finalTaxAfterAdjustment ?? incomeTax × 0.1)`(`exit-tax.ts:73-75, 569`). **1호만이면 변경 없음** — 1호 표는 소득세 표의 정확히 10%와 같아 지방세법 §103의3⑧ 표와 동일(검산: 3억 이하 20%→2%, 초과 6천만+25% → 600만+2.5%).
- **2호가 들어오면 두 읽기가 갈린다(V-3·Q-7)**: (L1) 소득세 산출세액의 10%(현행 구조, ①12호의 1천분의 10/20과 정합) vs (L2) ⑧의 단일표를 과세표준에 직독. K-5에서 L1=18,350,000 · L2=21,437,500(차 3,087,500), 2호가목(10%)이면 9,175,000 vs 21,437,500.
- 절사 단위(10원)는 현행 유지(`lib/tax-engine/CLAUDE.md`는 「지방소득세 원 미만」이라 적지만 exit·국외주식 선례가 10원 — 별건 §11).

### 3.9 결과 타입 (UI 계획 참조 §B)

신규 echo(기존 필드는 유지·의미 불변):

- `exitTaxRegime: "pre2027" | "from2027"` (조기 반환 포함)
- `holdingDetails[]`에 추가: `scope: "taxed" | "excluded"`, `excludedReason?`, `rateBucket?: "clause1" | "clause2a" | "clause2b"`, `fx?: { currency, departureRate, acquisitionRate, departureForeign, acquisitionForeign }`(foreign만)
- `bucketDetails: Array<{ bucket, transferGain, basicDeductionAllocated, taxBase, appliedRate, progressiveDeduction, calculatedTax }>` — **과세 구분별 분해**
- `foreignExclusion?: { applied: boolean; reason?: string; foreignDepartureValueTotal: number; threshold: 500000000 }`
- `appliedRate`·`progressiveDeduction`(별지 제84호서식 23·24행): **단일 구분이면 현행과 동일**, 구분이 둘 이상이면 `0`으로 두고 서식은 `bucketDetails`를 읽는다(`exit-tax-filing-adapter.ts`의 `appliedRate/progressiveDeduction/calculatedTax` 매핑 수정 — UI 계획과 합의)
- `localIncomeTaxAlternative?: number`(Q-7 (b) 선택 시 L1 병기)
- 합계 계열(`totalTransferGain`·`incomeTax`·어댑터의 `transferPrice`/`acquisitionPrice`)은 **과세(`taxed`) 종목만** 합산한다 — 제외 종목이 서식 값에 새면 안 된다.

---

## §4 케이스 매트릭스 (단순 → 복합)

공통: 거주 10년, 대주주 true, 보유현황 신고 완료, 유예 없음. 금액 원. **전부 node 손계산(엔진 미실행)** — 엔진 도달값은 PR-2 첫 단계에서 실측한다(§7.2).
- **H1**: 코스닥 10,000주, 취득 10,000/주, 출국일 시가 50,000/주 → 시가 500,000,000 · 취득 100,000,000 · 차익 400,000,000.
- **F1**: 미국 상장 외국법인(비중소), 출국일 $1,000,000 × 1,400 = 1,400,000,000 · 취득 $400,000 × 1,200 = 480,000,000 · 차익 920,000,000.

| # | 입력 | 기대 | 지키는 것 |
|---|---|---|---|
| **K-1** | 출국 2026-09-01, H1 | 과세표준 397,500,000 · 산출세액 84,375,000 (교재 갑 anchor) | 2026 분기 유지 |
| **K-2** | 출국 **2026-12-31**, H1 | 84,375,000 · `exitTaxRegime="pre2027"` | 경계(종전) |
| **K-3** | 출국 **2027-01-01**, H1 | 84,375,000 · `regime="from2027"` — 1호 표는 개정 전후 동일 | 경계(개정), 1호 불변 |
| **K-4** | 출국 2026-12-31, H1 + F1 | F1 `scope=excluded`(`pre2027_foreign_not_covered`) · 세액 84,375,000 · 지방소득세 8,437,500 · 합계 92,812,500 | 침묵 아닌 제외 echo |
| **K-5** | 출국 2027-01-01, **F1만**(대주주 true) | G=920,000,000 → TB 917,500,000 → 20% = **183,500,000** · 지방소득세 L1 18,350,000(L2 21,437,500, V-3) · 합계(L1) 201,850,000 | 2호나목 단일 20%, 250만원 |
| **K-6** | K-5 + F1 내국법인 해외상장 **중소기업** | **91,750,000** · 지방소득세 L1 9,175,000 | 2호가목 10% |
| **K-7** | 국외 양도가액 합계 **500,000,000**(취득 300,000,000) / **500,000,001** | 전자: 제외 → 세액 0 · `not_liable`(`foreign_total_le_500m`). 후자: 차익 200,000,001 → TB 197,500,001 → **39,500,000** | 5억 경계(「이하」) |
| **K-8** | H1 + 국외 F2(가액 400,000,000, 취득 200,000,000) | F2 제외, 세액 84,375,000 불변. 1호 종목은 5억 합계에 **안 들어간다** | 호1 합계 범위 |
| **K-9** | 10,000주 × $40 × 환율 1,300.10 | 환산 **520,040,000** (float 520,039,999) | 정수 환산 헬퍼 |
| **K-10** | K-5의 취득도 **출국일 환율**(1,400)로 환산하면 | 차익 840,000,000 → 세액 167,500,000 — K-5와 **16,000,000 차**. **anchor 아님**(V-2 근거 표시용) | 환율 쟁점 |
| **K-11** | H1 + F1 혼합 (V-1) | 배분 규칙별: 1호 먼저 공제 268,375,000 · 2호 먼저 268,500,000 · 양도소득금액 비례(1호 공제 757,575) 268,462,121. **v1: `basicDeductionAllocation` 미입력 시 ⑧⑫ 차단**, 입력 {clause1: 2,500,000, clause2b: 0}이면 **268,375,000**(지방소득세 L1 26,837,500 / L2 31,437,500) | 배분 규칙 부재 |
| **K-12** | H1(차익 400,000,000) + 국외 종목 차익 −300,000,000 (V-1b) | **차단**. 참고: 전체 상계 TB 97,500,000 → 19,500,000 / 구분별 소멸 TB 397,500,000 → 84,375,000 (**64,875,000 차**) | 구분 간 손실 |
| **K-13** | 외국인근로자 가족(배우자): F3 가액 400,000,000(근로 개시 전 취득) + F4 가액 200,000,000·취득 100,000,000(개시 후) | 직독(합계 600,000,000 > 5억 → 1호 비해당): F3만 제외, F4 TB 97,500,000 → **19,500,000**. (대안: 제외 후 합계 200,000,000 ≤ 5억 → 0) | 판정 순서(V-4) |
| **K-14** | 외국인근로자 본인 + 요건 4개 true, 국외주식 가액 1,400,000,000 | 전부 제외 → 0. 요건 하나 false → K-5와 동일 과세 | 영 §178의8②2호 |
| **K-15** | 국외주식만 보유, `isMajorShareholder=false` | `not_liable`(대주주 미해당), 국외주식 제외 문구. `true`면 K-5 | §118의9①2호 |
| **K-16** | F1, 실제 양도 1,200,000,000(출국일 시가 1,400,000,000 미만) — **후속 PR-7 시료** | 조정공제 = 200,000,000 × 20% = **40,000,000** (= 183,500,000 − 143,500,000). 가목(10%)이면 20,000,000. **v1은 2호 과세 시 경정청구 차단(K-17)** | 2호 스칼라 세율 |
| **K-17** | F1 과세 + `actualTransferPricePerShare` 입력 | ⑧⑫ 차단(Q-8) | 단순화 오염 방지 |
| **K-18** | H1 + F2(전부 제외, 5,000주) + 실제 양도 1주당 45,000 | 조정공제 **12,500,000**(교재 갑과 동일) — F2 주식수가 안분에 섞이면 틀림 | 제외 종목 오염 |
| **K-19** | route에 출국일 문자열 `"2027-01-01"` | `coerceDates` 후 `from2027` 정상. 미변환 mutation이면 `Date < string` silent false로 pre2027 선택 → W-1이 **반드시 실패** | ⑭ 직렬화 |
| **K-20** | `isListedForeignCorp=true` + `isSmallMediumEnterprise=true` | 나목 20%(가목 비적용) — ④·⑧·엔진 같은 게이트 | 3중 패턴 |
| **K-21** | F1 + 보유현황 미신고, `totalFaceValue`(원, 국외주식 액면 포함) | 가산세 = `totalFaceValue × 2%`, 지방소득세 base 제외(현행 구조) | §118의15④ 확대 |
| **K-22** | F1 + 납부유예 5년 | `deferredTaxAmount = 183,500,000`(산출세액), 유예 5년 | §118의16 불변 |
| **K-23** | 중소 2호 + 일반 2호 혼합(각 차익 300,000,000, V-1) | 가목 먼저 공제 89,750,000 / 나목 먼저 89,500,000(**250,000 차**) → v1 배분 입력 필수 | 호 내 가·나목 |
| **K-24** | 2026-09-01 출국 + 실제 양도일 2027-03-01 + 갑 조정공제·외국납부 | 41,875,000(교재) 유지 — 게이트가 `actualTransferDate`가 **아님**을 증명 | 게이트 기준일 |
| **K-25** | 2027-01-01 출국, 1호 H1만, 경정청구 입력(조정공제 12,500,000) | K-18과 동일 값 — 2027에서 1호 경로 불변 | 1호 회귀 |

---

## §5 14개 동기화 지점 — 엔진·API 파트 (①②③⑤⑥⑦은 UI 계획)

| # | 지점 | 파일(확인 line) | 변경 |
|---|---|---|---|
| 타입 | `ExitTaxHolding`·`ExitTaxInput`·`ExitTaxResult` | `types/exit-tax.types.ts:14, 62, 163, 184` | §3.1·§3.9 필드. 공개 타입 3개↑ → 이미 `types/` 분리 |
| ④ | API 변환 | `lib/calc/stock-transfer-tax-api-foreign-exit.ts:180-` `buildExitTaxApiBody` — `holdings` map `:185-`, 최상위 body `:214-` | foreign 종목 필드·`foreignWorker*`·`basicDeductionAllocation` spread. **3중 패턴**: `marketType \|\| "kospi"`(`:189`)에 `foreign` 허용, `isListedForeignCorp`·`foreignWorkerStatus \|\| "none"` default를 ④⑧⑫ 동일 |
| ⑧ | validate | `lib/calc/stock-transfer-tax-validate-exit.ts:49, 118, 198` | §5.1 격자. 날짜 판정은 `isExitTaxFrom2027` 공유 |
| ⑨ | Zod enum 메인 | `lib/api/stock-transfer-exit-tax-schema.ts:21`(`departureDayValuationModeSchema`) · `:44`(`marketType` enum) | enum 확장 2곳 + 신규 `foreignWorkerStatusSchema`·`foreignWorkerFamilyKindSchema` |
| ⑩ | enum 컴패니언·refine | 같은 파일 holding `superRefine`(`:55-`)·최상위 `superRefine`(`:136-`) | foreign 종목 필수 필드·원화/외화 혼용 거부·구분 간 손실·배분 합계·경정 차단 (§5.1) |
| ⑪ | 자산-수준 `acquisitionDate` fallback | **N/A 확정** — `exitTaxHoldingSchema.acquisitionDate`는 필수·`??` fallback 없음 | Do 후 `grep "acquisitionDate" schema`로 `??` 0건 확인 |
| ⑫ | Zod 입력 객체 | `exitTaxHoldingSchema`(`:41-`)·`exitTaxInputSchema`(`:91-`) | §3.1 전 필드. **Zod `z.object`는 미지 키를 조용히 제거** — ⑫ 누락=엔진 미도달 |
| ⑬ | body spread | ④ 빌더 키 ↔ ⑫ 키 | **양방향 grep + W-2** |
| ⑭ | Route 매핑 | `app/api/calc/stock-transfer/route.ts:335-347`(holdings 수동 map)·`:350-`(engineInput)·`:301-304`(`EXIT_TAX_DATE_FIELDS`) | holdings map·engineInput에 신규 필드 추가(옵셔널이라 **TS가 누락을 못 잡는다**). `catch`(`:387`)에 `TaxCalculationError` → `taxCalculationErrorResponse` 분기 추가 |
| 어댑터 | 서식 편입 | `exit-tax-filing-adapter.ts` | `taxed` 종목만 합산, 다구분 시 `appliedRate` 처리(§3.9) |

### 5.1 ⑧↔⑫ 격자 패리티 (같은 술어를 양쪽이 import — 한쪽만 막으면 API 직접 호출로 뚫린다)

| 조건 | ⑧ | ⑫ | 비고 |
|---|---|---|---|
| pre2027 출국 + 국외 종목 | **경고만**(제외됨) | 통과 | Q-2 |
| foreign 종목: 외화 단가·환율(출국일·취득일) 미입력/≤0/소수 5자리↑ | O | O | fallback 금지 |
| foreign 종목에 원화 필드 혼용 | O | O | |
| 과세 구분 ≥2 + `basicDeductionAllocation` 없음/합계 불일치/구분 초과 | O | O | Q-4 |
| 구분 간 음수 양도소득금액 | O | O | Q-5 |
| from2027 + 과세 foreign 종목 + 경정청구 필드(`actualTransfer*`·`foreignTaxPaid*`·`domesticSourceTaxWithheld`) | O | O | Q-8 |
| `foreignWorkerStatus≠none` + `foreignWorkerChecks` 없음 / family 인데 `foreignWorkerFamilyKind` 없음 | O | O | |
| 과세 종목이 국외주식뿐 + `isMajorShareholder=true` | 경고만 | 통과 | §3.6 |

---

## §6 법령 상수 · 검증 매니페스트

- **새 파일** `lib/tax-engine/legal-codes/stock-exit-tax-2027.ts`(`stock.ts`가 752줄이라 거기에 **추가하지 않고 분리**). `STOCK_EXIT_TAX_2027`: `SCOPE_118_9_FOREIGN`("소득세법 §118의9"), `MAJOR_EXCLUDES_FOREIGN_118_9_1_2`("소득세법 §118의9①2호"), `RATE_118_11_1`·`RATE_118_11_2_A_SME`·`RATE_118_11_2_B`("소득세법 §118의11"), `DECREE_178_8_2_UNDER_500M`·`_FOREIGN_WORKER`·`_FOREIGN_WORKER_FAMILY`("소득세법 시행령 §178의8"), `DECREE_178_9_2_3_FOREIGN_VALUE`("소득세법 시행령 §178의9"), `DECREE_157_3_FOREIGN_SCOPE`("소득세법 시행령 §157의3"), `DECREE_178_3_FOREIGN_MARKET_VALUE`("소득세법 시행령 §178의3"), `LOCAL_103_3_8`("지방세법 §103의3"). `STOCK_EXIT_TAX_2027_CONSTS`: `FOREIGN_EXCLUSION_THRESHOLD=500_000_000`, `SME_RATE=0.10`, `OTHER_RATE=0.20`, `WORKER_RATIO=0.8`, `WORKER_DEPARTURE_MONTHS=6`, `FAMILY_CHILD_MAX_AGE=20`. 직접 import(`stock-foreign-carryover.ts` 선례); barrel(`legal-codes.ts`) 추가는 선택.
- **괄호 법률번호 금지**: 「(법률 제N호로…)」를 상수에 넣으면 파서가 「법률」 제N조로 읽어 unverifiable 게이트가 실패한다(메모리 `feedback_legal_code_parenthetical_law_number_parse`). 날짜·부칙으로 쓴다.
- **이미 등록**(article 단위): 법 §118의9~§118의17 `additions-transfer.ts:345-390, 651`; 령 §178의8·§178의9 `additions-transfer-decree.ts:631-655`(announced), §157의3 `:336`, §167의8 `:362`, §178의10 `:657-`; 지방세법 §103의3 `additions-local.ts:153`. 기존 8개 법 규칙의 키워드는 종전·개정 문언 **양쪽에서 성립**(예: 「출국일에 양도한 것으로 보아」「양도소득과세표준」「납세관리인」) — 개정으로 깨지는 규칙 없음(대조 완료).
- **신규 등록 필요** — 새 파일 `lib/legal-verification/manifest/additions-transfer-exit-2027.ts`(`additions-transfer.ts` 718줄·`additions-transfer-decree.ts` 865줄이라 새 파일) + `verifier-manifest.ts` import 추가. 모두 `basis: "announced"`:
  1. `TRANSFER.EXIT_TAX_2027_SCOPE` — 소득세법 §118의9: 「국외전출자 주식등」「제94조제1항제3호가목부터 다목까지」「제94조제1항제3호다목에 해당하는 주식등은 제외한다」
  2. `TRANSFER.EXIT_TAX_2027_RATE` — §118의11: 「제94조제1항제3호다목에 따른 주식등」「중소기업의 주식등」「양도소득과세표준의 100분의 10」
  3. 지방세법 §103의3: 「양도소득으로 보는 주식 등의 평가이익」 (종전 「…보는 국내주식 등…」의 부분문자열이 **아니므로** 개정본 구분 가능)
  4. 령 §157의3(2027본 키워드 「해외 증권시장에 상장된 것」)·§178의3(「제157조의3에 따른 주식등」…「제2호부터 제4호까지」)은 인용할 때만
- 키워드는 위 §1 실독문 verbatim(강학 용어 금지). 등록 후 `npm run verify:legal`·`__tests__/lib/legal-verification-coverage-complete.test.ts`.
- 부칙(법 제21221호 제8조, 령 제36129호 제1조 1호)은 manifest가 부칙 검증을 지원하는지 **확인 필요** — 지원 안 하면 era leaf 주석에 부칙 인용문을 verbatim으로 남긴다.

---

## §7 PR 분할 · 검증

### 7.1 순서

| PR | 내용 | 검증 |
|---|---|---|
| **PR-0** | 이 계획 + UI 계획 커밋(문서) | 사용자 Q-1~Q-12 결정 |
| **PR-1** | ① **동작 불변 분리**: `exit-tax.ts`에서 `calcAdjustmentDeduction`·`calcForeignTaxCredit`·`calcDomesticTaxCredit`(`:155-290`)를 `exit-tax-credit.ts`로 이동(645→≈490줄) ② era leaf ③ 법령 상수 ④ manifest 신규 행 | `npx vitest run __tests__/tax-engine/stock-transfer/ __tests__/lib/legal-verification-coverage-complete.test.ts` · `npm run verify:legal` · 6개 exit 파일 111 tests **무변경 통과** |
| **PR-2** | 타입 + `exit-tax-regime.ts`(범위·제외·구분 분류) + 2호 **단일 구분** 계산(K-1~K-8·K-15·K-20·K-24·K-25) | `npx vitest run __tests__/tax-engine/stock-transfer/exit-tax*` + 신규 anchor |
| **PR-3** | `exit-tax-fx.ts`(`toKrwExact`) + foreign 종목 환산(K-9) + `fx` echo | 〃 + 정수 환산 뮤테이션(float로 바꾸면 K-9 실패) |
| **PR-4** | 구분 ≥2: 배분 입력·구분 간 손실 차단·지방소득세(Q-4·5·7 결정 후) (K-11·K-12·K-23) | 〃 · 합계 불변식 `Σ alloc = D` |
| **PR-5** | ⑨⑩⑫⑭ Zod·route·`TaxCalculationError` 응답 | route 테스트 W-1~W-3 |
| **PR-6** | ④⑧⑬ + 어댑터 (UI 계획 ①②③⑤⑥⑦과 한 묶음 순차: 엔진이 타입·헬퍼·anchor 선처리 → UI 후행) | ⑧↔⑫ 격자 패리티(§5.1 전 행) · `ui-engine-sync-checker` · 브라우저 수동 확인(Network 탭 body에 신규 키) |
| **PR-7** | 2호 경정청구(조정공제·외국납부·비거주자) 일반화(K-16) — Q-8 후속 | 〃 |
| **PR-8** | 2027.1.1. 시행 후 `announced → enforced` 환원 + 시행령 §178의8·§178의9 규칙 포함 | `npm run verify:legal` |

각 PR: 변경 파일 ≤ 6개·신규 파일 ≤ 400줄 목표(800줄 정책). 워크플로: 엔진+UI 시니어 병렬 Plan → Do 순차 → Check `ui-engine-sync-checker`(14지점)+`bkit:gap-detector`.

### 7.2 Pre-Do anchor (Do 진입 전 먼저 작성·실행 — 실패 메시지로 설계 환류)

| ID | 무엇 | 왜 먼저 |
|---|---|---|
| **A-0** | 현행 엔진으로 H1(출국 2026-12-31 / 2027-01-01) → 둘 다 84,375,000. 현행이 **출국일을 안 본다**는 사실(§1.4)을 실측 | 게이트 전 기준선 |
| **A-1** | 2호 단일 구분 K-5(183,500,000)·K-6(91,750,000) — 법문 직독 손계산이 엔진 도달값과 일치 | 2호 도입 후 값 |
| **A-2** | K-9 `toKrwExact(…)` = 520,040,000 (float 구현이 520,039,999로 **실패함**을 먼저 보인다) | 환산 헬퍼 존재 이유 |
| W-1 | route에 문자열 출국일 → `coerceDates` 후 `from2027`(미변환 mutation에서 실패해야 함) | ⑭ silent false |
| W-2 | ④ 빌더 키 ↔ ⑫ 키 양방향 파리티 | ⑫⑬ 침묵 stripping |
| W-3 | ⑧ 차단 ⇔ ⑫ 거부 격자(§5.1 전 행) | 정책 3 |
| M-1 | 뮤테이션: 게이트를 `actualTransferDate`로 / 5억 비교를 `<`로 / 2호 세율을 1호 표로 / 제외 종목 주식수를 안분에 포함 → K-24·K-7·K-5·K-18이 **반드시 빨개짐** | 안전망 실측 |

---

## §8 사용자 결정 레지스터 (Q-n — 추천안·근거)

| Q | 질문 | 선택지 | **추천** |
|---|---|---|---|
| Q-1 | 아키텍처 | (a) 기존 route·엔진 확장 + 선행 분리 PR (b) 2027 전용 별도 엔진 (c) 통합 재작성 | **(a)**. 1호 계산·§118의12~17·서식·이력·화면이 같은 `marketType:"exit_tax"`를 공유(dual-truth 방지). 단 `exit-tax.ts` 645줄이라 PR-1에서 동작 불변 분리 |
| Q-2 | 2026 출국 + 국외 종목 입력 | (a) 제외+고지 (b) 입력 차단 | **(a)**. 법적으로 과세 대상이 아닌 것이 정답이고, 막으면 이력 복원(저장된 입력)이 실패한다. 제외를 echo로 드러내 침묵 fallback이 아님 |
| Q-3 | 국외주식 환율 | (a) 취득일·출국일 각 기준환율 직접 입력(+확인 필요 고지) (b) 둘 다 출국일 환율 (c) 원화 환산 직접 입력 | **(a)**. 선례(영 §178의5)와 정합, 근거가 모호함을 고지(V-2). (c)는 환산 근거 소실. 환산은 종목당 총액 1회 floor(V-13) |
| Q-4 | 구분 ≥2일 때 250만원 배분 | (a) 혼합 차단 (b) 배분 직접 입력 필수 (c) 법정순서를 가정해 구현 | **(b)**. 법문 근거가 없어 (c)는 추정, (a)는 「국내 대주주 + 해외주식」이라는 핵심 사용례를 막는다. 사용자 명시 입력은 자동 안분 fallback이 아니며, 결과에 「배분 규정 없음」 고지 |
| Q-5 | 구분 간 음수 양도소득금액 | (a) 차단 (b) 전체 상계 (c) 구분별 소멸 | **(a)**. 64,875,000원까지 갈리는데 근거 없음(K-12). 구분 내 통산은 §118의10③ 문언대로 유지 |
| Q-6 | 외국인근로자 제외 입력 | (a) 요건 4개 개별 체크 (b) 단일 선언 | **(a)**. 요건이 복합이라 선언 한 칸보다 근거가 남고 ⑧ 격자가 명확. 근로 80%·20세 기준 시점의 **엔진 자동 판정은 하지 않음**(V-5) |
| Q-7 | 2호 지방소득세 | (a) 소득세의 10%(L1) (b) §103의3⑧ 표 직독(L2)을 주값 + L1 병기 (c) 확정 전 지방소득세 미산출 | **(b)**. ⑧ 문언이 평가이익 전체에 단일표를 정해 직독에 근거가 있고, 차이가 생기는 2호 케이스만 L1을 `localIncomeTaxAlternative`로 병기. 1호만이면 두 값이 같아 영향 없음 |
| Q-8 | 2호 경정청구(조정공제 등) | (a) v1 차단 + 후속 PR-7 (b) 이번 범위에 일반화 | **(a)**. 현행이 「전 종목 동일 단가」 단순화(`exit-tax.ts:153`)라 통화가 다른 국외주식과 성립하지 않고, 종목별 입력·안분 재설계가 필요. 실제 양도는 출국 후 시점에야 발생. 2호 전부 제외 시 1호 경정은 허용(K-18) |
| Q-9 | 대주주 판정 입력 | (a) 사용자 boolean 유지 + 안내 (b) 엔진이 직전 연도말 보유로 직접 판정 | **(a)**. 현행 설계 유지, 변경은 문구뿐. (b)는 임계 이력 연결·입력 대량 추가라 별건 |
| Q-10 | 5억 합계 범위 | (a) 문언 직독: 소유 국외주식 전체(2·3호 해당분 포함) (b) 2·3호 제외 후 잔여 | **(a)**. 「출국 당시 소유한 국외주식등」 직독. 차이 19,500,000(K-13)을 고지 |
| Q-11 | §178의9②3호 시가 | (a) 사용자가 §178의3으로 산정해 외화 단가 직접 입력(모드 코드만) (b) 엔진이 §63·1개월 평균 자동 산정 | **(a)**. 령 §178의3①단서로 외국정부 평가가액 외 수단이 막혀 있고 자동 산정은 외부 시세·V-12가 선행. 자동 안분 fallback 금지 |
| Q-12 | 배포 시점 | (a) 시행일 전 선배포(출국일 게이트로 안전) (b) 2027.1.1. 이후 | **(a)**. 2027 출국 예정자의 시뮬레이션 수요. manifest는 announced로 선반영, PR-8에서 환원 |

---

## §9 미검증 레지스터 (V-n — 「확인 필요」, 추정 금지)

### 세액이 갈리는 것 (먼저)

| V | 무엇 | 현재 상태 · 영향 |
|---|---|---|
| **V-1** | 구분 ≥2일 때 ① 250만원 배분 ② 구분 간 손실 상계 — **법문(§118의10③④·§118의11)·령 모두 규정 없음**, 별지 제84호서식 개정본 미대조 | 배분만으로 125,000(1호↔2호나) / 250,000(2호가↔나), 손실 상계 64,875,000(K-11·12·23). v1: 입력 필수 + 손실 차단 |
| **V-2** | 국외주식 환산 환율 기준일(취득·출국일) — §118의10②는 §97 위임뿐, 환산 근거 없음. 영 §178의5는 §118의2~ 국외자산 체계 | K-10: 16,000,000 차. v1 선례 정합 + 확인 필요 고지 |
| **V-3** | 지방소득세: 지방세법 §103의3⑧(2027 개정본)이 **호 구분 없는 단일표** → 2호(소득세 10%/20%)와 불일치. 「주식 등」으로 용어만 바뀜 | K-5: L1 18,350,000 / L2 21,437,500(3,087,500 차), 2호가목 12,262,500 차. 혼합 시 ⑧ 과세표준 기준(합계 TB) 자체도 모호. Q-7 |
| **V-4** | §178의8②1호 합계 범위(2·3호 해당분 포함 여부)·합계 산정 기준(환산 후 원) | K-13: 19,500,000. 직독 구현 |
| **V-5** | 영 §178의8②2호 「100분의 80 이상의 기간」의 산정 단위(일/월)·분모(거소·주소 기간), 「국내에서 근로의 제공이 종료된 날부터 6개월」, ③호 「20세 이하」 판정 시점(취득일/출국일) | 제외 여부 전체. 엔진은 사용자 선언을 받는다(Q-6) |
| **V-7** | 조정공제 「제118조의11에 따른 세율」이 2호일 때(스칼라 확정) · **혼합 시 구분별 vs 합산 적용** | K-16(2호 단독은 법문대로). 혼합은 PR-7에서 V-1과 함께 |
| **V-8** | 외국납부세액공제 안분식이 「해당 자산」별이고 한도는 총 산출세액 기준 — 구분 간 한도 귀속 | PR-7 |
| **V-9** | 실제 양도가액(외화)의 원화 환산 환율 근거 | PR-7 |

### 세액이 갈리지 않거나 표시·절차

| V | 무엇 | 비고 |
|---|---|---|
| V-6 | 대주주 판정의 국외주식 제외는 **법문 직독으로 확정**(§118의9①2호 괄호). 국외주식만 보유해도 직전 연도말 국내 대주주면 과세(차단하지 않음). 해석례는 미검색 | 안내문 |
| V-10 | 령 부칙 제36129호에 국외전출 **적용례·경과조치 부재** — 령 개정규정(§178의8② 등)도 법 부칙 제8조의 출국일 기준으로 적용된다고 보는 근거 문언 없음 | 게이트 기준 동일 적용 |
| V-11 | 시행규칙 별지 제84호서식·부표 2(2027.1.1. 시행), 제104호·제105호서식 개정 구조 — 호별 과세표준 칸 여부가 V-1의 근거가 될 수 있음 | UI 계획 |
| V-12 | 령 §178의3 국외주식 시가: ①단서로 ②~④호 배제, ②2호 상증법 §63 준용에서 「양도일·취득일 이전 1월」을 **출국일**에 어떻게 읽는지 | Q-11 직접 입력 |
| V-13 | 2026.12.31. 이전 출국자의 2027 이후 경정청구·조정공제 — 부칙 제8조 반대해석상 종전 문언 | 현행 엔진 유지 |
| V-14 | §118의14 비거주자 세액공제 대상 종목 — §119 11호 가목(내국법인 발행)·나목(외국법인 발행, 증권시장 상장분만) | PR-7 |
| V-15 | §118의15④ 가산세 base 「액면금액」의 외화 환산 환율 근거 | `totalFaceValue`는 원화 직접 입력 유지 |
| V-16 | 2호 가목 「중소기업」 판정 시점·기준(PR-4A는 §157의2③ 직전 사업연도 종료일 현재) | PR-4A 정합 |
| V-17 | 령 §157의3 종전본 대조 미실시 | PR-1 |
| V-18 | 환산 원 미만 처리(법령 무규정): 선례 종목당 총액 floor | 사용자 승인 시 Q 승격 |

---

## §10 UI 계획과 맞출 필드 (이 §가 UI 계획의 참조 대상)

**§A 입력**: 종목 `marketType:"foreign"` · `isListedForeignCorp` · `isSmallMediumEnterprise` · `countryCode` · `foreignCurrencyCode` · `departureDayValuationMode`(+`foreign_market_price`·`foreign_decree_178_3`) · `departureDayPriceForeign` · `departureExchangeRate` · `perShareAcquisitionPriceForeign` · `acquisitionExchangeRate` · `acquiredBeforeWorkerStartedWork` / 최상위 `foreignWorkerStatus` · `foreignWorkerChecks.{isOfficerOrEmployee,isNotDailyWorker,domesticWorkRatioAtLeast80,departedWithin6MonthsOfWorkEnd}` · `foreignWorkerFamilyKind` · `basicDeductionAllocation.{clause1,clause2a,clause2b}`.
**§B 결과**: `exitTaxRegime` · `holdingDetails[].{scope,excludedReason,rateBucket,fx}` · `bucketDetails[]` · `foreignExclusion` · `localIncomeTaxAlternative`.
**§C 화면 요구**: 환율·외화 칸 힌트(「기준환율. 법령상 환산 기준일 명시 없음 — 확인 필요」) · pre2027+국외 종목 제외 표시 · 구분 ≥2 시 250만원 배분 칸 노출 · 경정청구 블록(2호 과세 시 비활성+사유) · 대주주 칸 안내 문구(국외주식 제외).

---

## §11 이 계획이 건드리지 않는 것 / 별건 발견

**건드리지 않음**: 국외전출세 외 도메인(국외주식 일반 양도·국외 부동산)·대주주 임계 이력 연결·이력 저장(IndexedDB)·§118의16 이자상당액 base·납부 재산 평가.

**별건 발견(수정하지 않음, 실측 근거)**:
1. 국외주식 일반 양도 `foreign-stock.ts:199-204, 217`이 `Math.floor(외화×환율)` 부동소수 — K-9 같은 입력에서 1원 과소 위험(미측정 조합 다수).
2. `lib/tax-engine/CLAUDE.md`는 「지방소득세 원 미만 절사」, exit(`exit-tax.ts:73-75`)·국외주식은 10원 미만 — 규약 불일치.
3. 현행 `handleExitTax`가 모든 예외를 500으로 응답(`route.ts:387-390`) — PR-5에서 `TaxCalculationError`만 400 분기.
4. 교재 사례 anchor 파일(`exit-tax-textbook-departure-2026.anchor.test.ts`, PR #3695)이 이 worktree 기준선(`e18d12f3f`)에는 없다.

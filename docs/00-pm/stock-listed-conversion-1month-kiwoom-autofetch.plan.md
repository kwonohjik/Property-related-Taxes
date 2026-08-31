# 상장주식 환산취득가 — 「이전 1개월」 라벨 정정 + 취득일 종가평균 키움 자동조회

- **작성** 2026-08-31 · **대상 화면** `/calc/stock-transfer-tax` Step2 → ② 취득가액 → 환산취득가 (상장)
- **상태** 계획 · **Do 미착수**
- **근거 조문** 소득세법 §99①3 → 시행령 §165③ 준용 → 상증법 §63①1가목 → 상증령 §52의2③④

---

## 0. 사용자 요청 (원문 요지)

1. 「양도일 **직전** 1개월 종가평균」 → 「양도일 **이전** 1개월 종가평균」,
   「취득일 **직전** 1개월 종가평균」 → 「취득일 **이전** 1개월 종가평균」으로 라벨 정정.
2. 키움증권 API로 **1개월 종가평균을 자동 조회·계산**하는 기능 구현.

---

## 1. 착수 전 실측 (추정 없음 — 전부 확인함)

### 1-1. 라벨은 실제로 틀렸다 — 같은 화면 안에서 이미 모순이다

`buildOneMonthBeforeSlots`(`lib/kiwoom/calendar.ts:147-162`)의 주석이 정본이다:

> 법률 용어 정의 (사용자 검증, 2026-05-19):
> - **"이전·이후" = 양도일 포함**
> - "전·후" = 양도일 미포함
>
> 따라서 본 평균 분모 = `[transferDate − 1 month + 1 day, transferDate]` (양도일 **포함**).

구현은 **양도일을 포함**한다(실측 §1-4). 그러므로 화면 라벨의 「직전」은 구현과도, 조문과도 어긋난다.

같은 화면(`Step2.tsx`)에서 **토글 설명문은 이미 「이전」**을 쓴다:

| 위치 | 문구 |
|---|---|
| `Step2.tsx:367` | 「양도일 **이전** 1개월 내 거래정지·관리종목 기간이 포함되면…」 |
| `Step2.tsx:381` | 「취득일 **이전** 1개월 내 거래정지·관리종목 기간이 포함되면…」 |
| `Step2.tsx:398` 🔴 | 「양도시 1주당 기준시가 (양도일 **직전** 1개월 종가평균)」 |
| `Step2.tsx:408` 🔴 | 「취득시 1주당 기준시가 (취득일 **직전** 1개월 종가평균)」 |

⇒ **한 화면에 두 표기가 공존**한다. 라벨 쪽이 틀렸다.

**방증 하나 더** — 같은 §163⑨/§99①3 분모를 다루는 `PostListingValuationCard.tsx`는
**전부 「이전」**을 쓴다(`:112`·`:119`·`:136`·`:141`·`:148`·`:152`).
즉 저장소 안에서 「직전」을 쓰는 쪽이 소수이고, 그 소수가 사용자 화면의 라벨이다.

### 1-2. 「직전」이 남아 있는 사용자 노출 문자열 — 총 17개소 / 6파일

| 파일 | 개소 | 성격 |
|---|---|---|
| `app/calc/stock-transfer-tax/steps/Step2.tsx` | 4 | 🔴 **요청 대상**(label 2 + placeholder 2) |
| `lib/calc/stock-transfer-tax-validate-step2.ts` | 3 | 차단 메시지 |
| `lib/api/stock-transfer-tax-schema.ts` | 3 | Zod refine 메시지 |
| `components/calc/gift/StockBurdenedDebtSection.tsx` | 4 | 부담부증여 라벨 |
| `components/calc/gift-tax-form-validate.ts` | 2 | 부담부증여 차단 메시지 |
| `components/calc/stock-transfer/ExitTaxHoldingsMatrix.tsx` | 1 | 국외전출세(§99①3 동일 준용) |
| `lib/tax-engine/stock-transfer/stock-acquisition-basis.ts` | 1 | 엔진 warning |

주석·타입 JSDoc에도 다수 있으나 사용자에게 보이지 않는다(Q-1에서 제외 결정).

#### 🔴 rename의 테스트 파급 — **7건** (자가검토 신규 발견)

문자열을 **정확 매칭**하는 단언이 있다. 라벨만 고치면 이들이 깨진다.

| 파일 | 줄 | 단언 |
|---|---|---|
| `e2e/stock-transfer-halt-acquisition.spec.ts` | 69 · 74 | `getByText("취득시 1주당 기준시가 (취득일 직전 1개월 종가평균)")` |
| `e2e/stock-transfer-halt-acquisition.spec.ts` | 80 | `getByText("양도시 1주당 기준시가 (양도일 직전 1개월 종가평균)")` |
| `__tests__/calc/gift-burdened-stock-major-and-conversion.anchor.test.ts` | 319 · 324 | validate 메시지 `toContain("… 직전 1개월 종가평균")` |
| `__tests__/calc/gift-burdened-stock-major-and-conversion.anchor.test.ts` | 380 · 388 | 엔진 warning `toContain("… 직전 1개월 종가평균이 0 이하")` |

`e2e/stock-transfer-165-5-floor80.spec.ts:70`에도 같은 문자열이 **주석**으로 있다(셀렉터 주의사항).

⇒ Phase 3은 「라벨 4개소 수정」이 아니라 **라벨 17 + anchor 7 동시 갱신**이다.

#### ⚠️ 국외전출세 1건은 보류 (V-4)

`ExitTaxHoldingsMatrix.tsx:296`의 「출국일 직전 1개월」은 같은 파일 `:55`가 근거를
**§99①3**이라 적고 있으나, 그것은 **코드의 description 문자열**일 뿐이다.
§1-6에서 저지른 것과 **같은 실수**(주석을 근거로 삼기)를 반복하지 않는다.
출국일 평가는 §118의9·시령 §178의9 축이므로 준용 관계를 확인해야 한다 ⇒ **V-4**.
확인 전까지 이 1건은 rename 대상에서 **뺀다**(16개소만 수행).

### 1-3. 자동조회 인프라는 이미 있고, **양도일 쪽만 배선돼 있다**

| 자산 | 위치 | 상태 |
|---|---|---|
| Route `POST /api/kiwoom/transfer-1month` | `app/api/kiwoom/transfer-1month/route.ts` | ✅ 존재 · **날짜 무관**(base_dt 파라미터) |
| 슬롯 산식 `buildOneMonthBeforeSlots(iso)` | `lib/kiwoom/calendar.ts:208` | ✅ 존재 · **날짜 무관** |
| 평균 산식 `oneMonthBeforeTransferAvg` | `lib/kiwoom/averages.ts:46` | ✅ 존재 · **날짜 무관** |
| UI 버튼 `KiwoomAutoFetchButton` | `components/calc/stock-transfer/KiwoomAutoFetchButton.tsx` | ✅ 존재 · 하드코딩된 **양도일 전용** |

**배선 실측** — `KiwoomAutoFetchButton`의 호출부는 **단 1곳**이다:

```
components/calc/stock-transfer/PostListingValuationCard.tsx:159
```

> 🔴 **초판 판정 정정 (자가검토 2026-08-31).** 초판은 여기까지 보고 「버튼을 일반 블록에
> **배선**하면 된다」고 했다. **불완전했다** — 그 호출부가 **이중 게이트 안**에 있다.

```
PostListingValuationCard.tsx:93   <ToggleCard checked={form.acquiredBeforeListing} …>
  └ ToggleCard.tsx:303            {checked && children}     ← 게이트 ①: 「취득 후 상장」 ON
      └ :156                      {form.transferStdInputMode === "daily" && (
          └ :159                    <KiwoomAutoFetchButton …>   ← 게이트 ②: daily 모드
```

- **게이트 ①** — `ToggleCard`는 `checked === true`일 때만 children을 렌더한다(`:303`).
  즉 「취득 후 상장」이 OFF면 버튼도, 입력방식 라디오도, 일자별 표도 **전부 없다**.
- **게이트 ②** — ON이어도 `transferStdInputMode === "daily"`를 골라야 버튼이 나온다.
  기본값은 `"direct"`다.

⇒ **일반 상장 환산 사용자에게는 도달 경로가 없다.** 「취득 후 상장」을 켜는 것은 우회가 아니다 —
   그 토글은 계산 경로 자체를 §165⑤로 바꾼다(§163⑨이 아니다).

⇒ 이 트랙은 「신규 API 구축」도 「단순 배선」도 아니라
   **①버튼을 게이트 밖으로 재배치 + ②취득일 축 신설**이다.

> 🔑 [[feedback_ui_gate_removes_sole_input_path]]의 거울상 — 기능은 있는데 **게이트가 유일
>    진입로를 가두고 있다**. 「호출부 grep 1건」에서 멈추면 이 층을 못 본다
>    ([[feedback_leaf_anchor_skips_zod_layer]]와 같은 구조의 착시).

### 1-4. 키움은 과거 일봉을 준다 — 실측 4건 (dev 서버 + 실 API, `KIWOOM_ENV=prod`)

`POST /api/kiwoom/transfer-1month` · 종목 005930(삼성전자):

| 기준일 | 슬롯 기간 | 거래일 | 평균 | 판정 |
|---|---|---|---|---|
| 2025-06-10 | 2025-05-11 ~ **2025-06-10** | 21 | 59,200… → 56,xxx | ✅ 대조군 · **기준일 포함 확인** |
| 2015-04-20 | 2015-03-21 ~ 2015-04-20 | 21 | 1,455,714 | ✅ 10년 전 조회됨 |
| 2005-04-20 | 2005-03-21 ~ 2005-04-20 | 22 | 502,818 | ✅ **20년 전도 조회됨** |
| 2015-02-19 | 2015-01-20 ~ 2015-02-19 | 21 | 1,372,857 | 🔴 **아래 §1-5** |

⇒ **「과거 취득일은 데이터가 없을 것」이라는 우려는 사실이 아니다.** 2005년까지 확인했다.
   가격은 **수정주가가 아니다**(2015년 삼성전자 1,455,714원 = 2018년 50:1 액면분할 **전** 실제 주가).
   이것이 법령상 옳다 — 취득 당시 기준시가는 그 시점의 실제 종가다.

### 1-5. 🔴 휴장일 fixture가 2020~2026뿐이라 **과거 기준일에서 anchor 시프트가 죽는다**

`isKrxTradingDay`는 fixture 범위 밖에서는 **주말·납회만** 비거래일로 본다
(`calendar.ts:47-60` 주석이 그렇게 명시한다). 그래서 **범위 밖 평일 공휴일이 거래일로 판정**되고,
상증법 §63①1가목 괄호(「평가기준일이 매매가 없는 날이면 **그 전일**을 기준」)의 anchor 시프트가
발동하지 않는다.

**실측 대조** — 2015-02-19은 설날(목요일):

| | 슬롯 기간 | 거래일 | 평균 |
|---|---|---|---|
| 현재 동작 (anchor 미시프트) | 2015-01-20 ~ **2015-02-19** | 21 | **1,372,857** |
| 법령상 정본 (anchor → 2015-02-17) | 2015-01-18 ~ **2015-02-17** | 22 | **1,371,500** |

**차이 1,357원/주.** 분모는 종가 부재로 자동 보정되지만 **기간의 시작일이 이틀 밀려**
1/18·1/19가 빠지고 1/20이 잘못 들어간다.

> ⚠️ **이 결함은 지금은 거의 발화하지 않는다** — 양도일은 대개 최근이라 fixture 안에 있다.
> **취득일 자동조회를 열면 상시 발화한다**(취득일은 대개 수년 전).
> [[feedback_ui_gate_expansion_activates_latent_defect]] 그대로다. **선결 과제다.**

### 1-6. ⚠️ 초판 정정 — Route와 UI는 **이미 같은 기간을 쓴다** (부채는 주석이었다)

> 🔴 **이 절의 초판은 틀렸다.** route 헤더 주석(`route.ts:14`)의
> 「클라이언트 필터 `[transferDate − 1 month, transferDate − 1 day]`」를 읽고
> 「route는 기준일 제외」라고 적었으나, **코드는 그렇지 않다**.

실측:

| 소비처 | 실제 호출 | 결과 |
|---|---|---|
| Route | `buildOneMonthBeforeSlots(transferDate)` (`route.ts:88`) | 기준일 **포함** |
| UI 버튼 | `preTransferAutoFillDates(transferDate)` (`KiwoomAutoFetchButton.tsx:120`) | → 같은 함수에 **위임**(`PostListingClosingPriceTable.tsx:85-87`) |

**같은 함수 · 같은 인자 ⇒ 슬롯 배열이 동일**하다. 평균도 양쪽 다
`Math.floor(sum / tradingDays)`이고 분모 집합이 같으므로 **값이 같다**.
API 실측(2025-06-10)도 슬롯이 `… ~ 2025-06-10`으로 끝나 기준일 포함을 확인했다.

⇒ **기간 산식 이중화(divergence)는 존재하지 않는다.** 실제로 남아 있는 것은 둘뿐이다:

1. **stale 주석 2개** — `route.ts:14`(「− 1 day」)와
   `KiwoomAutoFetchButton.tsx:110`(「★ API slotDates(양도일 미포함)와 UI displayDates … 차이 보정」).
   둘 다 **지금은 사실이 아니다**. 읽는 사람을 잘못 이끈다(내가 실제로 그렇게 이끌렸다).
2. **불필요한 재계산** — 버튼이 route의 `average`를 버리고 같은 값을 다시 구한다.

**Q-3 답변(「route를 `buildOneMonthBeforeSlots`로 통일」) 재해석**: route는 **이미 통일돼 있다**.
사용자가 고른 방향의 실질 내용은 「**한 벌로 만들고 중복을 없애라**」이므로,
Do에서는 (a) stale 주석 2개 정정 (b) 버튼이 route의 `average`·`slotDates`를 **그대로 소비**하도록
재계산 제거로 이행한다. **상속·증여 경로는 다른 builder(`buildTwoMonthSurroundingSlots`)라 무영향** —
초판이 경고한 광범위 회귀는 발생하지 않는다.

> 🔑 [[feedback_engine_comment_vs_impl_drift]] — 주석이 구현보다 오래됐다.
>    계획서 초판이 그 주석을 근거로 존재하지 않는 결함을 적었다.

---

## 2. 범위

### 2-1. 확정 (요청 직결)

| # | 내용 |
|---|---|
| **A-1** | `Step2.tsx` 라벨·placeholder 4개소 「직전」 → 「이전」 |
| **A-2** | 일반 상장 환산 블록에 **양도일** 자동조회 배선 (기존 `KiwoomAutoFetchButton` 재사용) |
| **A-3** | **취득일 이전 1개월** 자동조회 신설 → `acquisitionDatePriceAvg1Month` 채움 |
| **A-4** | fixture 범위 밖 anchor 시프트 결함 해소 (§1-5) — **A-3의 선결 조건** |

### 2-2. 사용자 결정 반영 (2026-08-31 인터뷰 — 확정)

| # | 결정 | 작업 |
|---|---|---|
| **A-5** | Q-1 → **사용자 노출 17개소 전부** | 6파일 「직전 1개월」 → 「이전 1개월」 |
| **A-6** | Q-2 → **차단하지 않되 경고** | 취득일 축은 현재 거래정지로 막지 않고 안내 배너 |
| **A-7** | Q-3 → **한 벌로 통일** | stale 주석 2개 정정 + 버튼의 평균 재계산 제거 (§1-6 정정본) |
| **A-8** | Q-4 → **안내 문구만** | 조회 결과 카드에 자본조정 안내 (자동 보정 없음) |

### 2-3. 범위 밖 (명시)

- 비상장 보충 평가 3시점 · 상장 후 1개월(§165⑤) — 이미 구현·배선됨
- 상속·증여 평가기준일 전후 2개월 — 별도 축
- 세율·과세표준 등 계산 로직 — **본 트랙은 입력 경로와 표기만 건드린다**

---

## 3. 설계

### 3-1. A-4 (선결) — anchor 시프트를 fixture에 의존하지 않게

세 안. **B안 권장.**

| 안 | 방법 | 장점 | 단점 |
|---|---|---|---|
| A | fixture를 2000년까지 확장 | 기존 구조 유지 | 25년치 휴장일 데이터 수집·검증 비용, 이후 매년 유지 |
| **B** | **키움 응답의 실제 거래일로 anchor 보정** | 데이터 출처가 곧 진실 · 유지 0 | route 계약 변경 · 양도일 경로 회귀 위험 |
| C | 범위 밖이면 자동조회 차단 + 수동 입력 안내 | 가장 안전 | 취득일 자동조회가 **2020년 이후 취득에만** 동작 → 기능 대부분 무의미 |

**B안 상세 (자가검토로 범위 축소 — 초판 정정)**

> 🔴 초판은 「fixture는 **표시 라벨 용도로만** 남긴다」고 썼다. **위험한 서술이었다** —
> `isKrxTradingDay`를 전역으로 바꾸는 것으로 읽히고, 그러면 §2-3이 「범위 밖」이라 적은
> 경로들까지 회귀 표면에 들어온다.

`isKrxTradingDay` 소비처 **5곳** (실측):

| 소비처 | 용도 |
|---|---|
| `lib/kiwoom/averages.ts:61` | 양도일 이전 1개월 |
| `lib/kiwoom/averages.ts:132` | **상장일 이후 1개월** (§165⑤) |
| `lib/kiwoom/averages.ts:200` | **평가기준일 전후 2개월** (상속·증여 §63①1가목) |
| `components/calc/stock-transfer/MajorShareholderBlock.tsx:243` | **대주주 판정기준일** 거래일 표시 |
| `app/api/kiwoom/daily-close/route.ts:54` | 단건 조회 `isTradingDay` |

⇒ **`isKrxTradingDay`는 건드리지 않는다.** B안을 **anchor 결정 한 지점**으로 좁힌다:

```
resolveValuationAnchor(iso)                     ← 그대로 둔다 (fixture 기반)
  ↓
buildOneMonthBeforeSlots(iso)                   ← 그대로 둔다
  ↓
route: 응답에 anchor 종가가 없고 fixture 범위 밖이면
       «응답의 직전 거래일»로 anchor를 재결정하고 슬롯을 다시 만든다   ← 여기만 신설
```

부수 효과 두 가지를 명시한다:

1. **양도일 경로도 같은 코드를 탄다** — fixture 안(2020~2026)에서는 anchor가 이미 맞으므로
   재결정이 발동하지 않는다. **무변경임을 anchor로 고정**한다(Phase 1 대조군).
2. **거래정지와 휴장을 구분해야 한다** — anchor에 종가가 없는 이유가 «휴장»이 아니라
   «거래정지»면 anchor를 옮기는 것은 **법령상 틀리다**(상증령 §52의2③은 그 평가 자체를
   배제한다). route는 이미 ka10001로 정지 여부를 알고 있으므로 **정지 종목은 재결정하지 않는다**.
   ⚠️ 이 구분을 빠뜨리면 정지 구간을 조용히 건너뛰어 평균이 만들어진다.

⚠️ 그래도 **양도일 경로 코드를 건드리므로** 회귀 안전망을 **먼저** 심는다(§4 Phase 0).

### 3-2. A-3 — 취득일 축 신설

**route는 신설하지 않는다.** `/api/kiwoom/transfer-1month`이 날짜 무관이므로 재사용한다.
다만 Zod 필드명이 `transferDate`라 의미가 어긋난다 ⇒ **`baseDate` 별칭을 추가**하고
`transferDate`는 하위호환으로 유지(기존 호출부 무변경).

UI는 `KiwoomAutoFetchButton`을 **축 파라미터화**한다:

```
axis: "transfer" | "acquisition"
  · 라벨          — 「양도일」 / 「취득일」
  · 날짜 소스     — form.transferDate / form.acquisitionDate
  · 채우는 필드   — transferDatePriceAvg1Month / acquisitionDatePriceAvg1Month
  · daily 표 mirror — transferPriceDates·transferPriceClosing / (취득일은 daily 모드 없음)
```

> 🔑 취득일에는 `transferStdInputMode: "daily"` 같은 일자별 입력 모드가 **없다**.
>    취득일 축에 daily 표를 새로 만들지 않는다(요청 밖 · Simplicity).

**활성화 조건**: `securityCode` 6자리 + `acquisitionDate` 유효 + `marketType ∈ {kospi,kosdaq,konex}`

**숨김 조건**: `tradingHaltAtAcquisition === true`이면 취득측 입력 자체가 숨겨지므로
(`Step2.tsx:406`) 버튼도 같은 게이트를 따른다.

#### 🔴 F-4 — Q-2「차단 안 함」은 **route 변경**이 필요하다 (초판 누락)

route는 평균을 내기 **전에** ka10001 결과로 409를 던진다(`route.ts:70-84`).
따라서 「취득일 축은 차단하지 않는다」는 결정은 UI만으로 이행되지 않는다.

⇒ 요청에 축을 실어 보내고 route가 분기한다:

```
axis: "transfer"    → 현행 유지 (정지·관리종목이면 409)
axis: "acquisition" → 409 대신 200 + { currentTradingHalt: true } 동봉
                      (상증령 §52의2③이 문제 삼는 것은 «취득일 이전 1개월 구간»의 정지이지
                       조회 시점의 현재 상태가 아니다)
```

⚠️ **양도일 축의 409 동작은 바뀌지 않는다.** 그 무변경을 anchor로 고정한다.

#### 🔴 F-5 — `kiwoomTradingHalt` 공용 플래그 충돌 (초판 누락)

현행 버튼은 응답의 정지 여부를 **폼 전역 boolean** `kiwoomTradingHalt`에 쓴다
(`KiwoomAutoFetchButton.tsx:99·146`). 쓰기 지점은 저장소 전체 **6곳**이다.

Step2는 이 값을 보고 배너를 띄운다:

```
Step2.tsx:359   {form.kiwoomTradingHalt && !form.tradingHaltAtTransfer && (
                  ⚠ 키움 조회에서 거래정지·관리종목이 감지되었습니다 — 해당 시 «아래 토글»을 켜세요
```

여기서 「아래 토글」은 **양도일** 거래정지 토글이다. Q-2 결정대로 취득일 축이 정지 종목에서도
조회를 진행하면, 그 응답이 이 플래그를 true로 만들어 **양도일 토글을 켜라고 안내**한다 — 축 혼선이다.

⇒ **취득일 축은 `kiwoomTradingHalt`를 쓰지 않는다.** 경고는 버튼 자신의 로컬 상태로 표시한다
   (축 전용 필드를 새로 만들면 14 동기화 지점이 열리므로, 폼에 저장하지 않는 쪽을 택한다).

#### F-7 — 취득일 축이 쓰는 필드를 **명시 열거** (초판 모호)

| 필드 | 양도일 축 | 취득일 축 |
|---|---|---|
| `transferDatePriceAvg1Month` | ✅ 씀 | ❌ |
| `acquisitionDatePriceAvg1Month` | ❌ | ✅ **씀** |
| `transferPriceDates` · `transferPriceClosing` | ✅ (daily 표 mirror) | ❌ **daily 표 없음** |
| `kiwoomTradingHalt` | ✅ (현행 유지) | ❌ (F-5) |
| `kiwoomLastFetchedAt` | ✅ | ⚠️ **아래** |

`kiwoomLastFetchedAt`은 결과뷰 출처 배지가 읽는다(`StockTransferTaxResultView.tsx:399`).
두 축이 같은 값을 쓰면 배지가 **어느 조회인지 구분하지 못한다**.
⇒ 취득일 축도 갱신하되, 배지 문구는 축을 특정하지 않는 현행 표현(「키움 자동조회」)을 유지한다.
   (축별 배지가 필요하면 별도 트랙 — 요청 밖)

### 3-3. 14 동기화 지점 영향

**엔진 input·result 타입 변경 없음** ⇒ ⑨~⑭ 무영향.
새 필드를 만들지 않고 **기존 `acquisitionDatePriceAvg1Month`를 채우기만** 한다.

| 지점 | 영향 |
|---|---|
| ①폼 상태 ②initial ③normalize | 무 (기존 필드) |
| ④API 변환 | 무 |
| ⑤UI 위젯 | 🔴 **버튼 2개 추가** |
| ⑥사이드바 | 무 |
| ⑦결과 카드 | 무 |
| ⑧validation | 🔴 메시지 문구만 (Q-1 채택 시) |
| ⑨~⑭ | 무 |

---

## 4. 실행 계획 (Phase — 순서 강제)

```
Phase 0  안전망 선행 — 「바꾸기 전에 잰다」
         · P-0a  buildOneMonthBeforeSlots anchor 시프트 무력화 → 실패하는 테스트 집합 기록
         · P-0b  oneMonthBeforeTransferAvg 분모 산입 조건 무력화 → 동상
         · P-0c  Step2 라벨 문자열 변조 → 실패하는 anchor 집합 기록 (F-2 7건 예상)
         verify: 각 probe가 «구별력»을 갖는지 실측. 0건이면 「안전망 없음」이 아니라
                 «측정 실패»로 보고 겨냥 지점을 다시 잡는다
                 ([[feedback_mutation_masked_by_second_override]])

Phase 1  A-4 — anchor 재결정 (**B′안** — 참조 종목 거래일 달력 · §6 V-3)
         · route에만 신설. isKrxTradingDay·resolveValuationAnchor·builder 전부 «무변경»
         · 참조 종목(005930) 일봉으로 «시장 거래일» 집합을 얻어 휴장/종목정지를 «구분»한다
         verify: ① 2015-02-19 → 슬롯 [2015-01-18 ~ 2015-02-17] · 거래일 22 · 평균 1,371,500
                 ② 2025-06-10 대조군 «불변» (fixture 안이므로 재결정 미발동)
                 ③ anchor가 시장거래일인데 대상 종목만 종가 없음 → 이동 «안 함» + 안내
                    (mutation: 이 분기를 제거하면 실패해야 한다)
                 ④ 참조 종목 조회 실패 시 «이동하지 않는다»(추정 금지)

Phase 2  A-7 — 산식 한 벌로 (§1-6 정정본)
         · route.ts:14 · KiwoomAutoFetchButton.tsx:110 stale 주석 정정
         · 버튼이 route의 average·slotDates를 그대로 소비 (재계산 제거)
         verify: 재계산 제거 전후 채워지는 값이 동일함을 anchor로 고정
                 ⚠️ 「값이 같다」는 부정형 단언이므로 mutation 필수
                    ([[feedback_negative_assertion_needs_mutation_probe]])

Phase 3  A-1 + A-5 — 라벨 **17개소** 정정 (V-4 해소 — 국외전출세도 §99①3이다)
         · 동시에 anchor 7건 갱신 — e2e/stock-transfer-halt-acquisition.spec.ts:69·74·80,
           __tests__/calc/gift-burdened-stock-major-and-conversion.anchor.test.ts:319·324·380·388
         · e2e/stock-transfer-165-5-floor80.spec.ts:70 주석도 함께
         verify: Step2 렌더 anchor(「이전」 4 · 「직전」 0)
                 + 사용자 노출 경로 금지 리터럴 가드 anchor
         ⚠️ 금지 리터럴은 「직전 1개월」로 «좁힌다» — 「직전 사업연도」 등 정당한 「직전」이 있다
            ([[project_transfer_redev_rights_review_2026_08]] 오탐 실측 교훈)

Phase 4  A-2 — 양도일 자동조회를 «게이트 밖으로» (F-1 정정본)
         · 「취득 후 상장」 ToggleCard children + daily 모드 이중 게이트 밖으로 재배치
         · 일반 §163⑨ 블록(Step2.tsx:392-427)에서 direct 모드로도 보이게 한다
         · 기존 「취득 후 상장」 경로의 버튼·일자별 표는 «그대로 둔다»(§165⑤ 축은 별개)
         verify: E2E — acquiredBeforeListing OFF · direct 모드에서 버튼이 «보인다»
                 (현행에서는 보이지 않는다 — 대조군 anchor를 Phase 0에 먼저 심는다)

Phase 5  A-3 + A-6 + A-8 — 취득일 축 신설
         · KiwoomAutoFetchButton 축 파라미터화 (axis: transfer | acquisition)
         · route에 axis + baseDate 추가 (transferDate 하위호환 유지) — F-4
         · 취득일 축은 kiwoomTradingHalt를 쓰지 않는다 — F-5
         · 자본조정 안내 문구 (A-8)
         verify: E2E — 취득일 버튼 → acquisitionDatePriceAvg1Month 채움
                 + 뮤테이션: 날짜 소스를 transferDate로 바꾸면 «실패해야 한다»
                   (두 축이 같은 값을 읽으면 조용히 통과한다)
                 + 뮤테이션: kiwoomTradingHalt 쓰기를 되살리면 «실패해야 한다»
         · V-1 분기: tradingDays === 0 → 「해당 기간에 거래일이 없습니다…」 (자동 보정 없음)
         · V-2 문구: 404 메시지에 「상장폐지 종목일 수 있습니다」 덧붙임

Phase 6  전체 게이트
         verify: tsc 0 · lint 0 error · npm test 전건 · 주식 E2E
```

### 🔴 E2E mock을 먼저 만들어야 한다 (F-6 — 초판 누락)

Phase 4·5의 verify는 「E2E」라고만 적혀 있었으나, **`/api/kiwoom/transfer-1month`를 타는
E2E는 현재 0건**이다. 키움 관련 mock은 `e2e/inheritance-listed-stock-name-typeahead.spec.ts:32`의
`search-by-name` **1건뿐**이다. CI 러너에 키움 키가 있는지도 미확인(**V-5**).

⇒ Phase 4 착수 전에 `page.route("**/api/kiwoom/transfer-1month", …)` **fixture mock**을 만든다.
   이 저장소의 확립된 패턴(법제처 `e2e/_helpers/law-api-mock.ts`)을 따른다.

⚠️ **fixture는 실제 응답 원문이어야 한다** — CLAUDE.md의 법제처 mock 교훈 그대로다.
   손으로 만든 이상적인 JSON을 넣으면 회귀 테스트가 조용히 무의미해진다.
   §1-4에서 실제로 받은 응답(2015-02-19·2025-06-10)을 그대로 fixture로 쓴다.

### ⚠️ 인접 잠재 결함 — 고치지 않고 기록만 (F-10)

`transferStdInputMode` 라디오는 「취득 후 상장」 토글 **안**에만 있는데
(`PostListingValuationCard.tsx:118`), validate는 그 토글과 **무관하게** daily를 검사한다
(`validate-step2.ts:305-317`). 토글 ON → daily 선택 → 토글 OFF 하면
**입력 UI 없이 차단되는 dead-end**가 된다.

이번 트랙 범위 밖이지만 Phase 4가 같은 영역을 건드리므로 **인지하고 진행**한다.
Phase 4에서 direct/daily 라디오를 게이트 밖으로 함께 빼면 부수적으로 해소되나,
그것은 요청 밖 확장이므로 **하지 않는다**(Surgical Changes). 별도 트랙으로 남긴다.

**Phase 0을 건너뛰지 않는다** — [[feedback_pre_change_safety_net_probe]].
Phase 1·2·4가 «기존 양도일 경로»를 건드리므로, 바꾸기 **전에** 안전망을 재고 시작한다.

## 5. 인터뷰 결과 (2026-08-31 — 전건 확정, Do 착수 가능)

| Q | 질문 | 결정 | 비고 |
|---|---|---|---|
| **Q-1** | 「직전 → 이전」 적용 범위 | **사용자 노출 17개소 전부** | 6파일 · 전부 §99①3 같은 기간 |
| **Q-2** | 취득일 축의 현재 거래정지 게이트 | **차단하지 않되 경고 표시** | 상증령 §52의2③이 문제 삼는 것은 «취득일 이전 1개월 구간»의 정지다 |
| **Q-3** | route ↔ UI 기간 산식 | **한 벌로 통일** | §1-6 정정 — 이미 통일돼 있었고 실제 작업은 stale 주석 + 재계산 제거 |
| **Q-4** | 수정주가 아님(자본조정) | **결과 카드 안내 문구만** | 자동 보정 없음 — [[feedback_no_silent_apportion_fallback]] |

## 6. 미검증 레지스터 V-n — **전건 해소** (2026-08-31 실측)

| ID | 항목 | 판정 | 근거 |
|---|---|---|---|
| **V-1** | KONEX 과거 일봉 범위 | ✅ **조회된다** · 상장 전은 「거래일 0」 | 199290(바이오프로테크): 2019-06-10 → 20일·3,598 / 2021 → 22일·2,930 / 2015 → **0일·0** / 2012 → 0일. 에러가 아니라 **200 + tradingDays 0** |
| **V-2** | 상장폐지 종목 | ✅ **조회 불가**(404) | 117930(한진해운, 2017 폐지) → `stock_not_found` · `return_code=0` |
| **V-3** | anchor 종가 부재를 «휴장»과 «거래정지»로 구분 가능한가 | 🔴 **현행 API로는 불가** | `KiwoomStockMeta`(`types.ts:17-29`)는 `tradingHalt`·`adminIssue`가 **ka10001 현재 상태**뿐. 과거 정지 이력 필드 없음 ⇒ **설계 변경** (아래 B′) |
| **V-4** | 국외전출세 「출국일 1개월」이 §99①3인가 | ✅ **맞다** | 시령 §178의9②1호 「주권상장법인의 주식등: **법 제99조제1항제3호**…에 따른 기준시가」 ⇒ rename **17개소 전부** 유효 |
| **V-5** | CI 러너에 키움 키가 있는가 | ✅ **없다** | `.github/workflows/` 전체에 `KIWOOM` 언급 **0건**. 키 없으면 `auth.ts:45-49`가 throw → 503 ⇒ **E2E는 mock 필수** |

### 🔑 V-4 조문 실측 (verbatim — 재조회 불필요)

> **소득세법 §99①3**
> 「제94조제1항제3호가목에 따른 주식등(…)「상속세 및 증여세법」 제63조제1항제1호가목을
> 준용하여 평가한 가액. 이 경우 "평가기준일 **이전ㆍ이후 각 2개월**"은
> "**양도일ㆍ취득일 이전 1개월**"로 본다.」

**법문이 「이전」이다.** 「직전」이 아니다. 그리고 사용자 확정(2026-08-31):
**「이전」은 해당 일자를 포함한다.** 구현(`buildOneMonthBeforeSlots` — 기준일 포함)과 일치한다.

⇒ 화면 라벨의 「직전」은 **법문·구현 양쪽과 어긋난 표기**다. 정정 근거 확정.

### 🔴 V-3이 연 설계 변경 — B안 → **B′안** (참조 종목 거래일 달력)

V-3이 「구분 불가」로 나오면서 B안에 **해소 불가능한 모호성**이 생겼다:
과거 anchor에 종가가 없을 때 그것이 휴장인지 그 종목의 정지인지 알 수 없고,
정지인데 anchor를 옮기면 **정지 구간을 조용히 건너뛴 평균**이 만들어진다(§52의2③ 위반).

**B′ — 시장 거래일을 「참조 종목의 일봉」으로 얻는다.**

```
같은 기간에 대해 참조 종목(005930 삼성전자 — 1975 상장·사실상 무정지)의 일봉을 함께 조회
  → 종가가 있는 날의 집합 = 그 기간의 «시장 거래일»

anchor ∉ 시장거래일   → 휴장   → 직전 시장거래일로 anchor 이동 (정당)
anchor ∈ 시장거래일 인데
  대상 종목 종가 없음  → 그 «종목»의 정지·미상장 → 이동하지 않고 사용자에게 안내
```

| | A안(fixture 확장) | B안(응답 직전 거래일) | **B′안** |
|---|---|---|---|
| 휴장/정지 구분 | ✅ | ❌ **V-3** | ✅ |
| 유지 비용 | 매년 갱신 | 0 | 0 |
| 추가 호출 | 없음 | 없음 | 1회(영구 캐시 — `cache.ts` 일별 종가는 영구) |
| fixture 의존 | 2000~ 확장 필요 | 제거 | **표시 라벨 용도로만 유지** |

⇒ **B′ 채택.** `isKrxTradingDay`는 여전히 **건드리지 않는다**(F-3 유지) — 참조 달력은
   route 안의 anchor 재결정에만 쓰고, 소비처 5곳은 그대로 둔다.

⚠️ **참조 종목이 그 시점에 상장돼 있어야 한다.** 005930은 1975 상장이라 실무 범위를 덮지만,
   그 이전 취득일은 여전히 판정 불가 ⇒ 「거래일 0」 분기(아래)로 흡수한다.

### 🔴 V-1이 요구하는 분기 — 「거래일 0」은 에러가 아니다

상장 전·데이터 없음은 **200 OK + `tradingDays: 0`**으로 돌아온다.
현행 버튼은 `avg > 0 ? String(avg) : ""`이라 **빈 값을 쓴다**(오염은 없다).
그러나 결과 카드는 「평균 = 0 ÷ 0 = 0원」을 출력해 사용자가 원인을 알 수 없다.

⇒ Phase 5에 **명시 분기**를 넣는다:
「해당 기간에 거래일이 없습니다 — 취득일이 상장일 이전이거나 조회 범위 밖입니다. 수동 입력하세요.」
(자동 보정 없음 — [[feedback_no_silent_apportion_fallback]])

### V-2가 요구하는 문구 — 404는 「없는 종목」이 아닐 수 있다

상장폐지 종목도 `stock_not_found`로 온다. 현행 메시지는
「종목을 찾을 수 없습니다 (코드: …)」라 폐지 사실을 가린다.
⇒ 「…(상장폐지 종목일 수 있습니다 — 수동 입력)」을 덧붙인다.

> 실무 영향은 낮다 — 양도 시점에 폐지된 종목은 `marketType`이 비상장이라
> 상장 환산 경로 자체를 타지 않는다. 문구만 정정한다.

## 6-1. 자가검토 findings (2026-08-31 · L3 · 인라인)

| # | 카테고리 | 우선순위 | 위치 | 문제 | 상태 |
|---|---|---|---|---|---|
| F-1 | 오류 | **Critical** | §1-3 | 「단순 배선」 판정 — 실제로는 ToggleCard `{checked && children}` + daily 모드 **이중 게이트** | ✅ 정정 |
| F-2 | 누락 | **Critical** | §4 Phase 3 | rename이 깨뜨리는 **테스트 7건** 미열거 | ✅ 반영 |
| F-3 | 모순 | **Critical** | §3-1 ↔ §2-3 | B안 「fixture는 라벨용으로만」이 `isKrxTradingDay` 소비처 **5곳** 전역 변경을 함의 | ✅ 범위 축소 |
| F-4 | 누락 | High | §2-2 A-6 | Q-2「차단 안 함」에 **route 분기**가 필요한데 계획에 없음 | ✅ 반영 |
| F-5 | 모순 | High | A-6 ↔ 기존 UI | `kiwoomTradingHalt` 공용 플래그가 **양도일 토글**을 켜라고 안내 → 축 혼선 | ✅ 반영 |
| F-6 | 누락 | High | §4 Phase 4·5 | `/api/kiwoom/transfer-1month` E2E **0건** · mock 부재 | ✅ 반영 |
| F-7 | 누락 | Medium | §3-2 | 취득일 축이 쓰는 필드 미열거 (`kiwoomLastFetchedAt` 축 구분 불가) | ✅ 반영 |
| F-8 | 오류 | Medium | §1-2 | 국외전출세 근거를 **코드 주석**으로 단정 (§1-6과 같은 실수) | ✅ V-4로 이관 |
| F-9 | 개선 | Medium | §1-1 | `PostListingValuationCard`가 이미 「이전」을 쓰는 방증 누락 | ✅ 반영 |
| F-10 | 누락 | Medium | — | daily 모드 dead-end 잠재 결함 (범위 밖 · 인지 필요) | ✅ 기록 |

**verdict: `clean`** (2026-08-31) — Critical/High 전건 정정 · **V-1~V-5 전건 해소**.
Do 진입 가능. 진입 전 `pre-do-anchor-verification`(Phase 0)을 먼저 수행한다.

**판정 뒤집힘 3건** (성과 기준 충족):
1. **F-1** 「배선하면 된다」 → ToggleCard + daily 모드 **이중 게이트 재배치**
2. **F-3** B안이 `isKrxTradingDay` **전역 변경**을 함의 → anchor 한 지점으로 축소
3. **V-3** 「휴장/정지 구분 가능」 전제가 깨짐 → **B안 → B′안**(참조 종목 거래일 달력)

**실측으로 뒤집힌 초판 서술 2건**: §1-6(route 기간 divergence — 없었다) · F-8/V-4(국외전출세
근거를 주석으로 단정 → 조문으로 확인하니 **맞았다**. 근거가 없었을 뿐이다).

## 7. 참고

- [[project_stock_transfer_stale_result_2026_08]] — 「이전 1개월」 월말 절단·anchor 시프트 선행 작업
- [[feedback_ui_gate_expansion_activates_latent_defect]] — §1-5가 정확히 이 패턴
- [[feedback_no_silent_apportion_fallback]] — 자동 보정 금지
- `lib/kiwoom/CLAUDE.md` — 검증 UX 표준 패턴 (산식 명시 · 일자별 상세 토글 · 출처 배지)

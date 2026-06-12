# §165⑤ 종가평균 증자·합병 기간 조정 (B-5) 구현 계획서

> 작성: 2026-06-13 · 기준 origin/master `50395f44`(PR #164 머지 후) · 시리즈: `stock-transfer-remaining-followups.plan.md` §1 Track B B-5
> **검증 상태**: §1 법령 인용은 KoreanLaw MCP 축자 확인(2026-06-13, 소득세법 MST 285523·시행령 286211 · 상증령 MST 283637, 현행). §5 코드 인용은 Read/grep 실측. **§3.3 §165⑤ proxy 적용 여부는 확인 필요(formula box 미렌더) — Pre-Do/13단계에서 예규 검증**.

---

## 0. 목적·배경·갭

### 0.1 갭 정의

`PostListingDetailInput.closing`(상장일 이후 1개월 일별 종가 테이블)은 `hasIncrease`(증자·합병) 플래그만 보유하고, `calcMonthlyClosingAverage(dates, closes)`(`stock-valuation-post-listing.ts:69`)는 **입력된 전체 종가의 단순 평균** — 증자·합병 사유에 따른 평균 기간 조정 미적용(`hasIncrease`는 저장만, 미사용 실측).

상장주식 1개월 종가평균은 평가기간 내 증자·합병 발생 시 **사유 발생일 기준으로 한쪽 기간만 평균**해야 한다(상증령 §52의2②). 현행은 증자 전후 종가를 모두 평균해 가격 불연속(증자로 인한 권리락 등)을 미반영 — 평가액 왜곡 가능.

### 0.2 메커니즘 정정 (★ 신호 필드명 오류)

`listingPriceHasIncrease` 필드 주석 "환산주식수 후속 PR 신호"(`store:228`)는 **오해**. 상증령 §52의2②의 증자·합병 처리는 **환산주식수 곱셈이 아니라 평균 산정 기간 절단**이다(축자 §1.2). 환산주식수(주식 수 곱셈)는 §56⑤ **비상장 순손익**(`property-valuation/capital-increase-adjustment.ts`·`converted-shares.ts`) 전용 — 상장 종가평균과 무관. 본 PR은 **기간 절단**으로 구현.

---

## 1. 법령 근거 (KoreanLaw 축자 — 2026-06-13)

### 1.1 적용 체인 (§99①3 → §63①1가목 → §52의2②)

소득세법 §99①3(MST 285523):
> "제94조제1항제3호가목에 따른 주식등 … 「상속세 및 증여세법」 **제63조제1항제1호가목을 준용**하여 평가한 가액. 이 경우 '평가기준일 이전ㆍ이후 각 2개월'은 '양도일ㆍ취득일 이전 1개월'로 본다."

→ 상증법 §63①1가목 본문 "대통령령으로 정하는 바에 따라 계산한 **기간의 평균액**" = 상증령 §52의2②. **즉 증자·합병 기간 조정은 §63①1가목 준용 경로로 양도세 상장주식 기준시가에 도입됨** (§165③은 §52의2③ 거래정지만 별도 참조 — 평균 기간 자체는 §63①1가목 준용).

### 1.2 상증령 §52의2② (기간 조정 — MST 283637)

> "법 제63조제1항제1호가목 본문에서 '대통령령으로 정하는 바에 따라 계산한 기간의 평균액'이란:
> 1. 평가기준일 **이전**에 증자·합병 등 사유 발생: 사유 발생일(2회 이상이면 평가기준일에 가장 가까운 날)의 **다음날부터** 평가기준일 이후 2월까지의 기간
> 2. 평가기준일 **이후**에 사유 발생: 평가기준일 이전 2월부터 사유 발생일의 **전일까지**의 기간
> 3. 평가기준일 **이전·이후 모두**: 이전 사유 발생일 다음날부터 이후 사유 발생일 전일까지의 기간"

→ **핵심: 평가기준일과 같은 연속 가격 구간만 평균**(사유 발생 반대편 종가 제외).

### 1.3 양도세 1개월 준용 적용 (전후 2월 → 이전 1월)

§99①3의 "평가기준일 이전ㆍ이후 각 2개월" → "양도일ㆍ취득일 **이전** 1개월". 따라서 양도세는 **이전 방향 윈도우만** 존재. §52의2② 각 호의 양도세 매핑:

| 윈도우 | 평가기준일 | 증자·합병 발생 위치 | §52의2② 호 | 절단 결과 |
|---|---|---|---|---|
| 양도일·취득일 직전 1개월(§165③) | 양도일/취득일 | 윈도우 내(=평가기준일 이전) | 1호 | 사유 발생일 **다음날부터** 평가기준일까지 (사유 발생일·그 이전 종가 제외) |
| 상장일 이후 1개월(§165⑤ proxy) | 상장일 | 윈도우 내(=평가기준일 이후) | 2호 | 평가기준일(상장일)부터 사유 발생일 **전일까지** (사유 발생일·그 이후 종가 제외) |

### 1.4 인용 드리프트 경계 (memory `feedback_kiwoom_law_citation_drift`)

- §52의2② ≠ §56⑤(비상장 순손익 환산주식수). 본 PR 상수·주석은 **§52의2②(상장 종가평균 기간) + §63①1가목 준용**만 인용.
- §165③은 §52의2③(거래정지)만 참조 — 평균 기간(§52의2②)은 §63①1가목 준용 경로(혼동 금지).

---

## 2. 케이스 매트릭스 (전수)

| # | 윈도우 | hasIncrease | 발생일 입력 | 발생일 위치 | 동작 |
|---|---|---|---|---|---|
| C-1 | 상장일 이후 1개월 | false | — | — | 전체 단순 평균 (현행 — 회귀 0) |
| C-2 | 상장일 이후 1개월 | true | 입력됨 | 윈도우 내(상장일 < 발생일 ≤ 상장일+1월) | **2호 절단**: 상장일 ~ 발생일 전일 종가만 평균 |
| C-3 | 상장일 이후 1개월 | true | 입력됨 | 윈도우 밖(발생일 > 상장일+1월 또는 ≤ 상장일) | 절단 무효 → 전체 평균 + warning "발생일이 윈도우 밖 — 기간 조정 미적용" |
| C-4 | 상장일 이후 1개월 | true | **미입력** | — | validate 차단(자동 fallback 금지) — 엔진 방어: 전체 평균 + warning |
| C-5 | 상장일 이후 1개월 | true | 입력됨 | 절단 후 종가 0건 | "기간 조정 후 종가 없음" warning + 절단 미적용(현행 평균) |
| C-6 | 상장일 이후 1개월 | true | 2회 이상 | — | **비스코프**(단일 발생일만 — 다회는 후속). 단일 입력 가정, 안내 |

- §165③(양도일·취득일 직전 1개월) 적용은 **§4 비스코프**(동일 헬퍼 1호 분기 — 후속 PR). 본 PR은 §165⑤ post-listing forward 윈도우(2호)만.

---

## 3. 산식 설계 (기간 절단)

```
입력: dates[](YYYY-MM-DD), closes[](원), eventDate(증자·합병 발생일), basisDate(상장일), windowEnd(상장일+1개월)

[C-2 절단] (forward 윈도우 — §52의2②2호)
  유효 조건: basisDate < eventDate ≤ windowEnd
  절단: closes 중 date < eventDate 인 셀만 사용 (발생일·이후 제외)
  truncatedAvg = calcMonthlyClosingAverage(filteredDates, filteredCloses).avg

[가드]
  - eventDate ∉ (basisDate, windowEnd] → 절단 무효, 전체 평균 + warning (C-3)
  - 절단 후 거래일 0 → 전체 평균 + warning (C-5)
```

- 신규 헬퍼 `truncateClosingForCapitalEvent(dates, closes, eventDate, side)` (`apply-52-2-2-window.ts` 신규 또는 stock-valuation-post-listing.ts): `side: "before" | "after"` — post-listing은 "before"(발생일 전일까지), §165③은 "after"(발생일 다음날부터, 후속).
- `calcMonthlyClosingAverage`는 무변경(절단된 배열을 받음) — 호출부에서 절단 선처리.
- 정수: 평균 floor 1회(기존 `calcMonthlyClosingAverage` :81 동일).

---

## 4. 적용 지점·엔진 변경

### 4.1 종가평균 호출부 (절단 주입)

`calcMonthlyClosingAverage(closing.dates, closing.closes).avg` 3개 호출부(STEP 3 실측):
- `post-listing-flat-adapter.ts:348`(buildPostListingFromForm) · `:422`(buildPostListingFromDetail)
- `stock-valuation-post-listing.ts:204`(calcPostListingConversion)

→ **신규 래퍼 `calcClosingAvgWithEvent(closing)`** 단일 헬퍼로 3곳 교체(dual-truth 안전). 내부: `closing.hasIncrease && closing.increaseDate` 시 §52의2②2호 절단 후 `calcMonthlyClosingAverage` 호출, 아니면 전체 평균. closing 객체는 `adaptFlatToPostListingDetail:222-227` 단일 지점 구성(`hasIncrease` `:226`) → `increaseDate: form.listingPriceIncreaseDate ?? ""` 추가.

**STEP 6 데이터 흐름 실측**: 엔진 실제 환산값은 `:422`(buildPostListingFromDetail ← synthesizePostListingInput:459 ← stock-transfer-tax.ts:265) 경로. `:204`는 detail echo + `capitalEventTruncation` 주입. `:348`은 api/UI 프리뷰. **★ 비과세(K-OTC) 경로(`exempt-informational-acquisition.ts:106`)도 synthesizePostListingInput 공유 → :422 래퍼가 자동 커버**(C-1 취득일거래정지와 달리 별도 mirror 불필요).

### 4.2 입력 필드

- `PostListingDetailInput.closing`에 `increaseDate?: string`(증자·합병 발생일) 추가 — `hasIncrease === true` 시 필수.
- 결과 echo: `PostListingValuationResult`에 `capitalEventTruncation?: { eventDate, includedDays, excludedDays, truncatedAvg }`.

### 4.3 UI 미리보기

`PostListingClosingPriceTable`(`:123` 미리보기)에 절단 적용 — 발생일 입력 시 제외 종가를 시각적으로 표시(회색 처리) + 절단 평균 미리보기. UI 자체 재계산 금지 → 엔진 헬퍼 import([[feedback_ui_engine_dual_truth_avoidance]]).

---

## 5. 14 동기화 지점

| # | 지점 | 작업 |
|---|---|---|
| ① | FormData | `listingPriceIncreaseDate: string`(`calc-wizard-stock-store.ts` — hasIncrease 인근) |
| ② | initial | factory default `""` |
| ③ | normalize | `strField("listingPriceIncreaseDate")` |
| ④ | api 변환 | `stock-transfer-tax-api.ts` — closing 객체에 increaseDate 매핑(hasIncrease 인근 grep) |
| ⑤ | UI 위젯 | hasIncrease ON 시 `DateInput` 발생일 + PostListingClosingPriceTable 절단 미리보기 |
| ⑥ | 사이드바 | 무변경 |
| ⑦ | 결과 카드 | `capitalEventTruncation` echo — "증자·합병 (발생일 X) — 상장일~전일 종가만 평균(상증령 §52의2②, §63①1가목 준용 해석)" + **"명문·예규 미확인 해석 적용" 1줄 안내** |
| ⑧ | validate | hasIncrease ON + 발생일 미입력 차단 + 윈도우 범위 검증(simple 모드 무관 — closing 테이블은 full/listing_only) |
| ⑨⑫ | Zod | closing 스키마에 `increaseDate` optional (`stock-transfer-tax-schema.ts` postListingDetail 중첩) |
| ⑩⑪ | 컴패니언·자산-수준 | N/A (form-global postListingDetail 중첩) |
| ⑬ | api body | closing 객체 spread 확인 (nested — strip 점검) |
| ⑭ | route 매핑 | closing nested coerce — increaseDate Date 변환(coerceDates 또는 string 유지 후 엔진 파싱) |

★ closing은 nested 객체 — Zod·api·route에서 closing 하위 필드 누락 점검(⑫⑬⑭).

---

## 6. anchor

`__tests__/tax-engine/stock-transfer/section-165-5-capital-event-b5.test.ts`:

| anchor | 검증 |
|---|---|
| B5-ENGINE-1 (C-1) | hasIncrease false → 전체 평균 (회귀 0) |
| B5-ENGINE-2 (C-2) | 발생일 윈도우 내 → 발생일 전일까지 종가만 평균 (절단 검증) |
| B5-ENGINE-3 (C-3) | 발생일 윈도우 밖 → 전체 평균 + warning |
| B5-ENGINE-4 (C-5) | 절단 후 종가 0 → 전체 평균 + warning |
| B5-HELPER-1 | `truncateClosingForCapitalEvent` 경계(발생일 당일 제외·전일 포함) |
| B5-REGRESS-1 | 사례 48 post-listing(hasIncrease 무) 불변 |

- **Pre-Do**: 사례 48 + 기존 post-listing closing anchor 전수 통과 고정. 신규 절단 anchor 1건 실패 확보(현행 전체 평균).
- E2E 1건(포트3200): full 모드 closing 테이블 + 발생일 입력 → 절단 평균 결과.

## 7. 현행 코드 실측 (2026-06-13)

| 위치 | 내용 |
|---|---|
| `stock-valuation-post-listing.ts:69` | `calcMonthlyClosingAverage` — 전체 단순 평균(절단 없음) |
| `stock-valuation-post-listing.ts:204` | calcPostListingConversion 호출부 |
| `post-listing-flat-adapter.ts:348·422` | adapter 호출부 2곳 |
| `types/stock-transfer.types.ts:293`(인근) | `PostListingDetailInput.closing.hasIncrease`(미사용 신호) |
| `calc-wizard-stock-store.ts:228` | `listingPriceHasIncrease`(form, 미사용) |
| `PostListingClosingPriceTable.tsx:123` | UI 미리보기 |

## 8. 비스코프·리스크

- **§165⑤ proxy 적용 — 해석 적용 확정 (사용자 결정 2026-06-13)**: §165⑤ 분자 "상장일 이후 1개월 종가평균"은 엔진 Phase A·PDF 사례48(8,001=21거래일 종가평균)로 확립. 이 분자가 1개월 종가평균이므로 "기간의 평균액"에 §52의2②가 내재한다는 **해석으로 적용**(13단계 STEP 1: formula box 미렌더·예규 4회 검색 미발견 — 명문·예규 미확정. 사용자가 해석 적용 결정). **결과 카드·엔진 주석에 "해석 적용·명문 미확인(formula box 미렌더, 예규 미발견)" 명시**(납세자 오인 방지·향후 예규 발견 시 재검토 anchor). [[feedback_korean_law_citation_verify]] — 미검증 명시 원칙 준수.
- **§165③ 양도일·취득일 직전 1개월(1호)**: 동일 헬퍼 `side="after"` 분기 — 본 PR 비스코프(취득측은 단일 avg 입력이라 daily 절단 불가·양도측 daily만 가능). 후속.
- **2회 이상 증자·합병**(§52의2② "평가기준일에 가장 가까운 날"): 단일 발생일만 — 다회는 후속.
- **권리락 가격 자동 반영 아님**: 본 PR은 기간 절단만. 증자 전 종가를 환산(권리락 조정)해 포함하는 방식은 §52의2②가 요구하지 않음(반대편 기간 제외가 법문).
</content>

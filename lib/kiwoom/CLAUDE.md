# CLAUDE.md — 키움증권 OpenAPI 자동조회 (`lib/kiwoom/`)

주식 시세 자동조회 인프라 — 양도세·상속세·증여세 공용. 환경변수 `KIWOOM_APP_KEY`·`KIWOOM_APP_SECRET`·`KIWOOM_ENV=mock|prod`.

## 시장 커버리지

KOSPI 2,452 + KOSDAQ 1,823 + KONEX 109 = **4,384 종목** (ka10099 `mrkt_tp=0/10/50`).

## 자동조회 4종 시점

| 시점 | 근거 | Route |
|---|---|---|
| 양도일 직전 1개월 | §99①3 | `/api/kiwoom/transfer-1month` |
| 상장 후 1개월 (사례 48) | §165⑤ | `/api/kiwoom/post-listing-1month` |
| 평가기준일 전후 2개월 (상속·증여) | §63①1가목 | `/api/kiwoom/valuation-2month` |
| 단건 (대주주 시총) | §157① | `/api/kiwoom/daily-close` |

종목명 typeahead: `/api/kiwoom/search-by-name` (마스터 4,384 종목 부분 일치).

## 인프라 파일

- `auth.ts` — OAuth2 24h 토큰 캐시
- `client.ts` — token bucket 초당 3건 + 지수 백오프
- `dedup.ts` — in-flight Map
- `cache.ts` — 일별 종가 영구 + 메타 5분 TTL
- `stock-master.ts` — KOSPI+KOSDAQ+KONEX 24h prefetch

## 규칙

- **법률 정확성**: "이전·이후" = **포함** / "전·후" = 미포함 (사용자 검증). `buildOneMonthBeforeSlots`는 양도일 포함, anchor 토·일 시프트 적용.
- **자동 fallback 금지**: 거래정지(상증령 §52의2③)·휴장일(§52의2④)·IPO 미만은 모두 사용자 안내, 자동 보정 0건.
- **검증 UX 표준 패턴**: 자동조회 결과 카드에 (a) 산식 명시 (합계 ÷ 거래일 = 평균) (b) **▼ 일자별 종가 상세 보기 (검증용)** 토글 (c) F-12 출처 라벨 `🔍 키움 자동조회 YYYY-MM-DD HH:MM KST` (`KiwoomFetchSourceBadge`).
- **KONEX 종목코드 영문자 포함** (예: `0070X0`): Zod `^[0-9A-Z]{6}$` + SecurityMetadataBlock `toUpperCase()`.

## 법령 인용 정정 이력 (KoreanLaw MCP 검증)

- 1개월 평균 분모 인용 §163⑨ → **§99①3 · 시행령 §165③ 준용** (D-1)
- 환산취득가 산식 본칙 §163⑨ → **시령 §176의2②1호** (D-2)
- §163⑨은 상속·증여 자산 평가가액 조항으로 무관 — **추정 인용 금지** 정책 강제. (memory `feedback_kiwoom_law_citation_drift`)

## UI 컴포넌트

`KiwoomAutoFetchButton`(양도일) · `KiwoomPostListingAutoFetchButton`(상장 후) · `KiwoomValuationAutoFetchButton`(상속·증여) · `KiwoomMarketCapHelper`(시총) · `KiwoomStockNameAutocomplete`(typeahead) · `KiwoomFetchSourceBadge`(출처).

## 테스트

`__tests__/kiwoom/` (40 anchor) — calendar·averages·market-mapping·dedup·stock-master·daily-close·post-listing·integration.

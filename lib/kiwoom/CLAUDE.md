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

종목명 typeahead: `/api/kiwoom/search-by-name` (마스터 전종목 부분 일치).

## 인프라 파일

- `auth.ts` — OAuth2 24h 토큰 캐시
- `client.ts` — token bucket 초당 3건 + 지수 백오프
- `dedup.ts` — in-flight Map
- `cache.ts` — 일별 종가 영구 + 메타 5분 TTL
- `stock-master.ts` — KOSPI+KOSDAQ+KONEX 24h prefetch
- `fetch-with-timeout.ts` — **클라이언트 fetch의 timeout·abort 단일 소스** (아래 규칙)

## 규칙

- **법률 정확성**: "이전·이후" = **포함** / "전·후" = 미포함 (사용자 검증). `buildOneMonthBeforeSlots`는 양도일 포함, anchor 토·일 시프트 적용.
- **자동 fallback 금지**: 거래정지(상증령 §52의2③)·휴장일(§52의2④)·IPO 미만은 모두 사용자 안내, 자동 보정 0건.
- **검증 UX 표준 패턴**: 자동조회 결과 카드에 (a) 산식 명시 (합계 ÷ 거래일 = 평균) (b) **▼ 일자별 종가 상세 보기 (검증용)** 토글 (c) F-12 출처 라벨 `🔍 키움 자동조회 YYYY-MM-DD HH:MM KST` (`KiwoomFetchSourceBadge`).
- **KONEX 종목코드 영문자 포함** (예: `0070X0`): Zod `^[0-9A-Z]{6}$` + SecurityMetadataBlock `toUpperCase()`.
- 🔴 **신규 클라이언트 fetch는 `fetchKiwoomWithTimeout` 필수** — 맨 `fetch`/`window.fetch` 금지.

  ```ts
  import { fetchKiwoomWithTimeout } from "@/lib/kiwoom/fetch-with-timeout";
  const res = await fetchKiwoomWithTimeout("/api/kiwoom/daily-close", { method: "POST", ... });
  ```

  timeout이 없으면 서버가 죽거나 응답이 지연될 때 Promise가 **영구 pending**이 되어
  `finally { setLoading(false) }`에 도달하지 못하고 **「🔄 조회 중...」이 무한히** 남는다
  (2026-09-01 제보 — 시가총액 자동 산정 버튼). 버튼 15초 / 자동완성 5초.

  ⚠️ **회귀 anchor는 무응답(hang) mock으로 쓴다.** `mockFetchReject()` 같은 **거부** mock은
  catch·finally에 도달해 loading이 풀리므로 **이 증상을 보지 못한다**. 실패 모드가 반대다.
  정본: `__tests__/components/kiwoom-fetch-timeout-spinner.anchor.test.tsx` ·
  `__tests__/lib/kiwoom/fetch-with-timeout.test.ts`.

## 법령 인용 정정 이력 (KoreanLaw MCP 검증)

- 1개월 평균 분모 인용 §163⑨ → **§99①3 · 시행령 §165③ 준용** (D-1)
- 환산취득가 산식 본칙 §163⑨ → **시령 §176의2②1호** (D-2)
- §163⑨은 상속·증여 자산 평가가액 조항으로 무관 — **추정 인용 금지** 정책 강제. (memory `feedback_kiwoom_law_citation_drift`)

## UI 컴포넌트

`KiwoomAutoFetchButton`(양도일) · `KiwoomPostListingAutoFetchButton`(상장 후) · `KiwoomValuationAutoFetchButton`(상속·증여) · `KiwoomMarketCapHelper`(시총) · `KiwoomStockNameAutocomplete`(typeahead) · `KiwoomFetchSourceBadge`(출처).

## 테스트

`__tests__/kiwoom/` — calendar·averages·market-mapping·dedup·stock-master·daily-close·post-listing·integration.

## dev 서버가 자꾸 죽는다면 — Turbopack 캐시 (2026-09-01)

키움 자동조회가 「조회 중…」에서 멈추면 **먼저 dev 서버 생존을 의심한다.** 대개 컴포넌트가
아니라 서버가 죽은 것이고, 죽은 원인은 대개 **Turbopack 영속 캐시 비대**다.

`turbopackFileSystemCacheForDev`는 **v16.1.0부터 기본 활성**이고 **크기 상한·TTL·GC가 없다**
(옵션은 on/off뿐). 이 저장소에서 3주 만에 `.next` 12GB까지 자라 dev 서버가 V8 OOM으로 죽었다.

⚠️ **RSS가 아니라 JS 힙이 문제다.** `--max-old-space-size`는 V8 힙만 제한하고 캐시 자체는
Rust 네이티브/mmap에 있다(12GB 캐시 + `--max-old-space-size=512`로도 정상 기동한다).
캐시가 힙을 먹는 것은 **컴파일·복원 시점**이다 — 동일 10개 calc 페이지 로드 후 `used_heap`이
캐시 238MB에서 **333MB**, 8.8GB에서 **4,097MB**(12배)였다.

⇒ **heap 상한 증액은 해법이 아니다**(컴파일당 소모가 캐시 크기에 비례한다).
⇒ **캐시를 끄는 것도 해법이 아니다** — warm 이점은 작은 캐시에서 이미 다 나온다
   (880MB 캐시로 동일 10페이지 823ms · 힙 358MB). 끄면 이점만 잃는다.
⇒ **가지치기가 정답이다.** `npm run dev:clean` 또는 `scripts/check-next-cache-size.sh`(dev 기동 시
   자동 실행, 4GB 초과 시 경고 — **차단하지 않는다**).

계획서·전체 실측: `docs/00-pm/dev-server-oom-kiwoom-spinner.plan.md`.

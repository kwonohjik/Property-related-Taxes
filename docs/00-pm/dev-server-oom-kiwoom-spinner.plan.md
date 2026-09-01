# dev 서버 OOM 크래시 + 키움 자동조회 무한 「조회 중…」 — 수정 계획

- 작성 2026-09-01 · **개정 2026-09-01(자가검토 1회차 — 판정 뒤집힘 3건)**
- 제보: ① 「시가총액 자동 산정」 버튼이 `🔄 조회 중...`에서 멈춤 ② dev 서버가 자꾸 중단됨
- 검증 깊이: **L2** (여러 파일 · 세액 불변 · 표시·입력 경로만) — 단, R-2 참조
- 상태: **원인 실측 확정 · 구현 미착수**

> ⚠️ **초판 판정 정정 3건이 §2에 있다.** 초판을 읽은 상태에서 이어받는다면 §2를 먼저 볼 것 —
> 인과 기전·방안 선택·호출 지점 수가 모두 바뀌었다.

---

## 1. 두 제보는 같은 사건이다

②가 원인, ①이 그 관측이다.

```
Turbopack 영속 캐시 8.8GB 누적 (.next 전체 12GB)
   → 컴파일·HMR 시 캐시 복원 데이터가 JS 힙에 적재 (§2-1 — 기전 정정)
   → 같은 작업량에서 JS 힙 333MB(냉) vs 4,097MB(온) — 12배
   → 편집이 잦은 세션에서 재컴파일 반복 → 8,384MB 상한 도달 → V8 FATAL abort
   → 진행 중이던 fetch가 응답 없이 끊김
   → 클라이언트에 timeout·abort 없음 → loading=true 영구 고착
   → 「🔄 조회 중...」 무한 표시
```

크래시 스택 최하단이
`next-swc.darwin-arm64.node → napi_get_all_property_names → KeyAccumulator::CollectOwnPropertyNames
→ Factory::Allocate(AllocationType)` 인 것이 이를 뒷받침한다 — SWC(Rust)가 JS로 콜백해
객체 키를 열거하다 **할당에 실패**한 지점이다.

dev 로그 마지막 줄도 일치한다 (`.next/dev/logs/next-development.log`, 390바이트 전문 3줄):

```json
{"timestamp":"00:00:01.293","source":"Server","level":"LOG","message":""}
{"timestamp":"00:00:09.801","source":"Browser","level":"INFO","message":"...React DevTools..."}
{"timestamp":"00:02:17.230","source":"Server","level":"LOG","message":"○ Compiling /api/kiwoom/transfer-1month ..."}
```

**`/api/kiwoom/*` 컴파일 중 죽었고 그 뒤로 로그가 없다.** 그날(2026-09-01) `lib/tax-engine/stock-transfer/`·
`components/calc/results/` 등 소스 20개 이상이 수정돼 캐시가 대량 무효화된 상태였다 — 컴파일 부하가 큰 조건.

---

## 2. ⚠️ 초판 판정 정정 (자가검토 1회차)

### 2-1. 【기전】 「캐시가 힙을 기동 시점에 선점」은 **틀렸다**

초판은 이렇게 적었다:

> idle RSS 3,840MB ⇒ `--max-old-space-size=8192`의 **42%가 기동 시점에 이미 소진**

**불완전했다 — RSS는 V8 힙이 아니다.** `--max-old-space-size`는 **V8 JS 힙**만 제한하고,
Turbopack 영속 캐시는 Rust 쪽 **네이티브/mmap 메모리**에 올라간다. 두 풀은 다르다.

**반증 실측**: 12GB 캐시를 복원하고 **`--max-old-space-size=512`**(실제의 1/16)로 기동 →
**정상 기동(Ready 117ms) · `GET /` 200 · RSS 4,271MB**. 힙 상한이 512MB인데 RSS가 4.2GB다.
⇒ 그 메모리는 JS 힙에 없다. **초판의 「42% 선점」은 성립하지 않는다.**

**그러면 왜 죽었나** — 힙 실측(throwaway probe `app/api/heapprobe`, 측정 후 삭제):

| 캐시 | 시점 | `used_heap` | `heap_size_limit` | RSS |
|---|---|---|---|---|
| **12GB** | 동일 10개 calc 페이지 로드 후 | **4,097 MB** | 8,384 MB | 7,961 MB |
| **238MB** | 기동 직후(idle) | **98 MB** | 8,384 MB | 752 MB |
| **238MB** | **동일** 10개 페이지 로드 후 | **333 MB** | 8,384 MB | 3,194 MB |

**같은 작업량에서 JS 힙이 333MB ↔ 4,097MB, 12배로 갈린다.**

> 측정 방법: 두 조건 모두 **동일한 10개 페이지**(`transfer-tax`·`stock-transfer-tax`·`inheritance-tax`·
> `gift-tax`·`acquisition-tax`·`property-tax`·`comprehensive-tax`·`gift-deemed`·`cross-104-5`·
> `inheritance-postmgmt`)를 순서대로 GET하고, 같은 probe 라우트를 각각 새로 컴파일한 뒤 읽었다.
> 컴파일 대상·순서가 같으므로 차이는 캐시 크기에서만 온다.
캐시는 기동 시점이 아니라 **컴파일·복원 시점에** JS 힙을 먹는다.

⇒ 결론(캐시를 줄여야 한다)은 **유지**. 근거 문장은 **전면 교체**.
`--max-old-space-size` 증액이 무의미하다는 초판의 판단도 유지되지만, 이유가 다르다 —
「캐시가 커지면 상한도 따라 커져야 해서」가 아니라 **「컴파일당 힙 소모가 캐시 크기에 비례해서」** 다.

부수 확인: `NODE_OPTIONS`는 워커에 **실효**한다(`heap_size_limit` 8,384MB = 8192 설정 반영).
실효 값은 `--max-old-space-size=8192 --enable-source-maps` 로, **`--enable-source-maps`는 Next가 자동 주입**한다(package.json에 없다).

### 2-2. 【방안】 B(영속 캐시 비활성)를 「대가가 크다」로 밀어낸 것은 **근거 없이 쓴 문장이었다** — 실측으로 대체

초판은 B를 "cold start 대가가 매번 발생 — dev 체감 저하"로 **측정 없이** 기각했다.

**V-1 해소** — `node_modules/next/dist/docs/.../turbopackFileSystemCache.md` 실측:

- 플래그는 `experimental.turbopackFileSystemCacheForDev` (그리고 `...ForBuild`)
- **`v16.1.0`부터 개발 모드 기본 활성.** 우리는 16.2.3 ⇒ **옵트인한 적 없이 켜져 있다**
- **크기 상한·TTL·GC 옵션은 문서에 없다.** on/off뿐

그리고 A(가지치기)가 실제로 성립하는지를 실측했다 — **880MB 캐시로 재기동 후 동일 10페이지**:

| 캐시 | 10페이지 합계 | 개별 | `used_heap` | RSS |
|---|---|---|---|---|
| 12GB (warm) | — | 60~70ms | 4,097 MB | 7,961 MB |
| **880MB (warm)** | **823 ms** | 36~236ms | **358 MB** | 1,995 MB |

**warm 속도는 880MB에서 이미 다 나온다.** 12GB가 주는 추가 속도 이점은 없고 힙만 11배다.
⇒ **A가 B보다 우월하다** — B는 얻는 것 없이 warm 이점을 버리는 선택이다. **A 확정.**

### 2-3. 【범위】 호출 지점은 4곳이 아니라 **5곳**이다

초판은 timeout 부재 지점을 4곳으로 적었다. **`SecurityMetadataBlock.tsx:212`를 빠뜨렸다** —
초판의 감사 루프에 그 파일을 넣지 않은 단순 누락이다(`api/kiwoom` 문자열 grep 결과에는 있었다).

전수 재열거(`fetch("/api/kiwoom` 정규식, `components/ lib/ app/ hooks/` 전역):

| # | 파일:줄 | 라우트 | abort/timeout | 오류 표시 |
|---|---|---|---|---|
| 1 | `KiwoomMarketCapHelper.tsx:83` ← **제보 버튼** | `daily-close` | ❌ 없음 | free-text `setError` |
| 2 | `KiwoomAutoFetchButton.tsx:99` | `transfer-1month` | ❌ 없음 | free-text |
| 3 | `KiwoomPostListingAutoFetchButton.tsx:76` | `post-listing-1month` | ❌ 없음 | free-text |
| 4 | `useKiwoomValuationFetch.ts:87` | `valuation-2month` | ❌ 없음 | free-text |
| 5 | **`SecurityMetadataBlock.tsx:212`** ← **초판 누락** | `search` | ❌ 없음 | **배지** `KiwoomFetchErrorCode` |
| — | `KiwoomStockNameAutocomplete.tsx:82` | `search-by-name` | ✅ 5,000ms | — |
| — | `InheritanceStockNameAutocomplete.tsx:81` | `search-by-name` | ✅ 5,000ms | — |

> 📌 초판 인용 `KiwoomMarketCapHelper.tsx:76` 도 **틀렸다** — `:76`은 `if (!canFetch) return;`이고
> `await fetch`는 **`:83`** 이다. (memory `feedback_enumerate_all_write_sites_before_fixing`)

---

## 3. 결함 2건

### D-1 (Critical) — Turbopack 영속 캐시 무제한 누적 → 컴파일 시 JS 힙 폭증 → OOM

- 위치: 운영·환경 (`.next/dev/cache/turbopack`, `package.json:dev`)
- `turbopackFileSystemCacheForDev`는 16.1.0부터 **기본 ON**이고 **크기 상한이 없다**.
- 규모: `.next` 12GB / `cache/turbopack` 8.8GB / `.sst` 2,760개(개별 최대 255MB).
  mtime 분포 **2026-08-11 ~ 09-01**(3주). 8-12(707개)·8-26(458개)에 집중.
- **재발한다** — 현재 `.next`를 갈아치워 해소된 상태이나 성장은 계속된다(§V-2 성장 속도 실측).

### D-2 (High) — 키움 자동조회 5곳에 timeout·abort 부재

- `await fetch(...)`에 `AbortSignal`이 없다. 서버가 죽거나 응답이 지연되면 **Promise가 영구 pending**,
  `finally { setLoading(false) }`에 **도달하지 못한다.**
- **D-1을 고쳐도 남는다** — 키움 API 지연·네트워크 단절·서버 재시작에서 동일 재현.

#### sibling 경로에 이미 규칙이 있다

자동완성 2건이 **5초 timeout + abort**를 이미 구현한다(§2-3 표 하단).
⇒ 새 규칙이 아니라 **확립된 패턴의 미적용**이다. (memory `feedback_sibling_path_already_implements_rule`)

#### 🔴 안전망 실측 — 5곳 중 3곳이 테스트 0건

| 파일 | 이를 다루는 테스트 |
|---|---|
| `KiwoomMarketCapHelper` | **0건** ← 제보 버튼 |
| `KiwoomPostListingAutoFetchButton` | **0건** |
| `useKiwoomValuationFetch` | **0건** |
| `KiwoomAutoFetchButton` | 2건 (`stock-listed-conversion-autofetch-gate` · `kiwoom-autofetch-consumes-route-window`) |
| `SecurityMetadataBlock` | 1건 (`stock-security-metadata-order-and-error`) |

⇒ **바꾼 뒤를 고정할 신규 anchor가 필수**다. (memory `feedback_pre_change_safety_net_probe`)

##### 더 나아가 — **timeout 계약 자체는 7곳 전부 커버리지 0**이다

timeout+abort를 **이미 구현한** 자동완성 2곳조차 그 동작을 단언하는 테스트가 없다.
`__tests__/`·`e2e/` 전역에서 `AbortError`·`controller.abort`·타임아웃 문구를 단언하는 건 **0건**이다
(검색 히트 3건은 전부 `{ timeout: 2000 }` 같은 **단언 대기 옵션**이라 계약과 무관하다).

가장 가까운 것은 `__tests__/components/inheritance-stock-name-autocomplete.test.tsx:131` **T-05**인데,
`mockFetchReject()` — **거부(reject)**이지 **멈춤(hang)**이 아니다. 둘은 실패 모드가 반대다:

| | catch 도달 | `finally` 도달 | loading 해제 |
|---|---|---|---|
| reject (T-05가 보는 것) | ✅ | ✅ | ✅ |
| **hang (제보 증상)** | ❌ | ❌ | ❌ 영구 고착 |

⇒ **T-05는 제보 증상을 덮지 않는다.** 신규 anchor는 반드시 **무응답 mock**(resolve/reject 둘 다 안 하는 Promise)을 써야 한다.

---

## 4. 수정 방안

### D-1 — 임계 경고 + 즉시 초기화 명령 (코드 변경 최소)

```
scripts/check-next-cache-size.sh   (신규)
  - .next/dev/cache 크기 측정
  - 임계 초과 시: 경고 + 크기 + `npm run dev:clean` 안내 출력
  - **자동 삭제하지 않는다.** exit 0으로 dev 기동은 그대로 진행 (게이트가 아니라 알림)
  - DEV_CACHE_AUTOCLEAN=1 일 때만 삭제

package.json
  "dev":       "bash scripts/check-next-cache-size.sh; NODE_OPTIONS='--max-old-space-size=8192' next dev --turbopack"
  "dev:clean": "rm -rf .next && npm run dev"
```

> ⚠️ **`&&`가 아니라 `;`** 를 쓴다. `&&`면 스크립트가 비정상 종료할 때 **dev 서버가 아예 안 뜬다** —
> 알림 하나 때문에 개발을 막는 것은 비용/편익이 뒤집힌 설계다.
> (pre-push의 `check-workflow-runner.sh`는 **차단이 목적**이라 `&&`가 맞다 — 층위가 다르다.)

> ⚠️ **자동 삭제를 기본값으로 두지 않는다.** `.next`는 재생성 가능하지만 삭제는 되돌릴 수 없고,
> 개발자가 의도적으로 warm cache를 유지 중일 수 있다.

**임계값**: §V-2 참조 — 초판의 2GB는 성장 속도 실측 전에 정한 숫자였다. **4GB로 상향 제안**.

### D-2 — 공용 헬퍼 추출 후 5곳 적용

sibling 2곳에 `FETCH_TIMEOUT_MS = 5000`이 **이미 2벌 중복**돼 있다. 7곳으로 늘리며 7벌을 만들지 않는다.

```
lib/kiwoom/fetch-with-timeout.ts   (신규 — 단일 소스)
  export const KIWOOM_FETCH_TIMEOUT_MS = 15_000;   // 자동조회 버튼·자동채움
  export class KiwoomTimeoutError extends Error {}
  export async function fetchKiwoomWithTimeout(url, init, timeoutMs): Promise<Response>
    - AbortController + setTimeout(abort, timeoutMs) · finally { clearTimeout }
    - abort 사유를 KiwoomTimeoutError로 변환 (호출부가 network 오류와 구분 가능하게)
```

> 📌 **구현 중 이탈 2건 (환류 · Do 2026-09-01)**
>
> **① `KIWOOM_SUGGEST_TIMEOUT_MS`를 만들지 않았다.** 계획서는 "헬퍼에 상수만 정의해 두고
> 다음에 흡수"라고 적었으나, 자동완성 2곳이 자기 `FETCH_TIMEOUT_MS = 5000`을 그대로
> 갖고 있는 상태에서 상수를 하나 더 만들면 **사본이 2벌 → 3벌로 늘 뿐** 아무것도 dedup 하지
> 않는다. 미사용 export는 추측성 코드다(Simplicity First). ⇒ 사실은 **doc 주석으로** 남겼다
> (「이 값을 자동완성에 쓰지 말 것 · 옮길 때 `timeoutMs` 인자로 5초를 넘겨라」).
> 자동완성 이관 시 그때 상수를 만든다.
>
> **② 사전 abort 처리를 추가했다.** 호출부가 넘긴 `signal`이 **이미** abort돼 있으면
> `"abort"` 이벤트가 다시 발생하지 않아, 리스너만 걸면 그 요청이 취소 의사를 무시하고
> 그대로 나간다. 현재 호출부 5곳 중 signal을 넘기는 곳은 없지만 **공용 헬퍼의 잠재 결함**이라
> 커밋 전 품질 검토에서 고쳤다(`if (external?.aborted) controller.abort();`). anchor T-08·T-09 신설.

- 적용: §2-3 표의 **1~5번**. `await fetch(...)` → `await fetchKiwoomWithTimeout(...)`.
- **자동완성 2곳은 이번 범위 밖**이다 — 이미 동작하고, 상수만 옮기는 것은 요청 범위 밖 리팩터다
  (Surgical Changes). 헬퍼에 상수만 정의해 두고 다음에 그 파일을 열 때 흡수한다.

#### ⚠️ 초판의 「UI 신규 작업 없음」은 5번에서 거짓이다

1~4번은 free-text `setError(string)`이라 그대로 문구만 넣으면 된다. **5번은 배지**를 쓴다:

```ts
// components/calc/KiwoomFetchErrorBadge.tsx:14
export type KiwoomFetchErrorCode =
  | "auth_failed" | "missing_env" | "rate_limited" | "stock_not_found" | "network" | "unknown";
```

`timeout` 코드가 없다. 추가하면 **union + `ERROR_LABELS` + `KIWOOM_ERROR_DETAILS` 3곳** 동기화가 필요하다
(`Record<KiwoomFetchErrorCode, string>`이라 뒤 2개는 tsc가 잡아준다).

⇒ **권고: 신규 코드를 만들지 말고 기존 `network`를 재사용한다.**
타임아웃은 네트워크 계열 실패이고 기존 문구("키움 조회에 실패했습니다 — 네트워크 연결을 확인하세요.")가
그대로 맞다. 3곳 동기화를 피한다. 별도 문구가 꼭 필요해지면 그때 코드를 추가한다.

#### 타임아웃 값 15초 — 근거 교체

초판은 `daily-close 0.55초` 하나만 보고 15초를 정했다. **가장 느린 경로를 안 봤다.**
서버 메모리 캐시(`lib/kiwoom/cache.ts` — `Map`, 재기동 시 소멸)를 비우고 재측정:

| 라우트 | 순수 키움 API 왕복 | 비고 |
|---|---|---|
| **`valuation-2month`** | **3.84 s** | 최악 — D±2개월 다중 TR 호출 |
| `transfer-1month` | 0.31 s | |
| `post-listing-1month` | 0.22 s | |
| `daily-close` | 0.55 s | |
| `search` | 0.05 s | |

추가로 **dev cold compile이 최대 약 4.7초**를 더한다(`valuation-2month` 첫 호출 4.93s − API 0.14s).

⇒ **15초 = 최악 API(3.84s)의 약 4배, cold compile 포함 최악(4.93s)의 약 3배.** 유지하되 근거를 이 표로 교체.
자동완성 5초보다 길게 두는 것도 유지한다(버튼은 의도적 1회 동작, 자동완성은 타이핑 중 반복 호출).

---

## 5. 작업 순서 · 검증 기준

```
1. lib/kiwoom/fetch-with-timeout.ts 신설
   → verify: 유닛 테스트 — 무응답 mock + fake timers로 timeoutMs 경과 시 KiwoomTimeoutError reject,
             정상 응답 시 clearTimeout 호출(타이머 누수 없음)

2. 호출 5곳 치환 (§2-3 표 1~5번) — 5번은 catch에서 code "network"로 배지 세팅
   → verify: npx tsc --noEmit 0건

3. 무한 스피너 회귀 anchor — **RTL + fake timers** (E2E 아님, 아래 근거)
   → 대상: 안전망 0건인 3곳 우선 (MarketCapHelper · PostListingAutoFetch · useKiwoomValuationFetch)
   → **템플릿**: `__tests__/components/inheritance-stock-name-autocomplete.test.tsx`(302줄)이
     fake timers + fetch mock + RTL 기계장치를 이미 갖췄다 — 그대로 차용한다
   → 단언: **무응답** fetch mock(resolve/reject 안 하는 Promise) → 타이머 15초 진행
     → 버튼이 「조회 중...」에서 벗어나고 오류 문구가 뜬다
   → ⚠️ `mockFetchReject()`를 쓰면 **제보 증상을 안 본다**(§D-2 reject vs hang 표)
   → 뮤테이션 실증(필수): 헬퍼의 abort 호출을 제거하면 **이 anchor만** 적색이어야 한다.
     적색이 안 되면 anchor가 잘못된 단계를 보고 있는 것 — 통과를 신뢰하지 말 것
     (memory `feedback_anchor_observes_wrong_stage` · `feedback_negative_assertion_needs_mutation_probe`)

4. scripts/check-next-cache-size.sh + package.json dev·dev:clean
   → verify: 임계 미만 무출력 exit 0 / 초과 시 경고 후 **exit 0** (기동 차단 안 함)
   → verify: DEV_CACHE_AUTOCLEAN=1 일 때만 삭제

5. lib/kiwoom/CLAUDE.md — D-1 재발 조건 + 「새 키움 fetch는 fetchKiwoomWithTimeout 필수」
   → verify: 해당 문장 존재 + §2-3 표 갱신
```

**성공 기준**: 3의 anchor가 뮤테이션 적색·원본 녹색 + `npm test` 회귀 0건 + `tsc` 0건.

### ✅ 실측 결과 (Do 완료 2026-09-01)

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | **0건** |
| `npm run lint` | **0 errors** (경고 317건은 전부 기존) |
| `npm test` 전건 | **1,713 파일 / 18,385 tests 통과 · 실패 0** |
| 신규 anchor | 유닛 9건(`fetch-with-timeout.test.ts`) + 컴포넌트 6건(`kiwoom-fetch-timeout-spinner.anchor.test.tsx`) |

**뮤테이션 실증 3건 — 전부 정확히 과녁만 적색**:

| probe | 무력화 대상 | 실패한 것 |
|---|---|---|
| P-A | 헬퍼의 `controller.abort()` | 유닛 T-01·02·03·04 (4/7 적색) |
| P-B | 동상 — 컴포넌트 축 | **TS-02·03·04·05만** 적색. `__tests__/components/` **267개 다른 파일 전원 녹색** |
| P-C | 사전 abort 처리 제거 | **T-08만** 적색 |

> P-B에서 TS-01(타임아웃 **전** 「조회 중」 유지)과 TS-06(자동 채움 0건)이 녹색으로 남은 것은
> 정상이다 — 둘 다 abort 유무와 무관하게 참인 계약이다. 과녁을 벗어난 것이 아니다.

### ⚠️ E2E가 아니라 RTL을 쓰는 이유

`playwright.config.ts:62` — `timeout: IS_CI ? 60_000 : 30_000`.
15초 대기 spec은 **로컬 예산 30초의 절반**을 먹는다. 초판은 이를 보지 않고 E2E로 설계했다.
fake timers를 쓰면 실시간 대기 0초로 같은 계약을 고정할 수 있다.
(테스트 파일은 컴포넌트를 렌더하므로 **`.test.tsx`** 로 만든다 — `.test.ts`면 `document is not defined`.)

---

## 6. 조사 중 실제로 수행한 변경

| 행위 | 상태 |
|---|---|
| `.next`(12GB)를 `/tmp/next-big` 으로 **이동** | 삭제하지 않음. 되돌릴 이유는 없다(문제의 원인). 회수하려면 `rm -rf /tmp/next-big` |
| 현재 `.next` | 조사 중 새로 생성된 1.2GB. 정상 동작 |
| dev 서버 | 포트 3000에서 기동 중. idle 힙 98MB |
| `app/api/heapprobe/` throwaway probe | 측정 후 **삭제 완료**. `git status` 청결 확인 |

**제품 코드는 한 줄도 변경하지 않았다.** 워킹 트리의 유일한 변경은 이 계획서다.

---

## 7. V-n 레지스터

| ID | 항목 | 검증 | 상태 |
|---|---|---|---|
| **V-1** | Next 16 Turbopack 영속 캐시에 크기 상한 옵션이 있는가 — 있으면 스크립트보다 그쪽이 정본 | `node_modules/next/dist/docs/.../turbopackFileSystemCache.md` 실측: **on/off 플래그뿐, 상한 없음.** 16.1.0부터 dev 기본 ON | ✅ 해소 — 방안 A 확정 |
| **V-2** | 8.8GB가 3주 누적인가 1회 폭증인가 — 임계값 산정에 영향 | 실측: 238MB → **880MB**(10페이지 + 재기동 1회). **세션당 수백 MB 규모로 성장**. 3주 누적이 맞다 | ✅ 해소 — **임계 2GB는 며칠이면 도달해 경고가 소음이 된다 ⇒ 4GB 제안**(880MB에서 힙 358MB, 12GB에서 4,097MB이므로 4GB면 힙 1.5GB 내외 추정) |
| **V-3** | OOM 메시지 원문(`FATAL ERROR: Reached heap limit ...`) 미확보 — 붙여넣기가 상단에서 잘렸다 | 스택 프레임(할당 실패 경로) + 힙 실측 4,097/8,384MB가 OOM을 강하게 지지. **문구 자체는 미확인** | 🟡 **미해소 — 단, 착수를 막지 않는다** |

### V-3이 착수를 막지 않는 이유

설계를 가르지 않기 때문이다. 캐시를 4GB 이하로 묶는 근거는 **크래시 원인과 독립적으로** 실측됐고
(같은 작업에서 힙 12배), D-2는 **서버 크래시가 없어도** 재현되는 별개 결함이다.
⇒ V-3이 무엇으로 밝혀지든 1~5단계는 그대로 옳다. **재발 시 로그 첫 줄을 보존할 것.**

### 미검증으로 남기는 것 (값을 문구·상수로 쓰지 않는다)

- 8.8GB 캐시에서의 **idle** `used_heap`을 직접 재지 않았다(측정 시점에 이미 10페이지를 로드한 뒤였다).
  `--max-old-space-size=512` 기동 성공으로 **512MB 미만**임은 알지만 정확한 값은 모른다.
  ⇒ 「기동 직후 힙 NNN MB」 같은 문장을 쓰지 않는다.
- 크래시 당시 실제 `used_heap`은 알 수 없다. 재현에 성공하지 못했다(12GB 캐시 + 10페이지로도 4,097MB에서 안정).

---

## 8. 기각된 가설 — 실측 배제 (재조사 금지)

| 가설 | 실측 | 결과 |
|---|---|---|
| `.claude/worktrees/` 15개(ts/tsx **57,664개**)가 tsconfig에 포함돼 프로그램 비대 | `tsc --listFiles` 6,327건 중 worktree **0건** — TS `include`의 `**/*`는 **dot 디렉터리를 순회하지 않는다**(`.claude`) | ❌ |
| worktree 소스가 Turbopack 모듈 그래프·캐시에 유입 | 구 캐시 `.sst` 5개 표본 `strings` grep **0건** | ❌ |
| **Next 16.1 업그레이드가 캐시 기본 활성의 계기** | `package.json` 이력 전수: **처음부터 16.2.3**. 업그레이드 이벤트 없음 | ❌ **(개정 시 추가 기각)** |
| **캐시가 V8 힙을 기동 시점에 선점** | `--max-old-space-size=512` + 12GB 캐시로 **정상 기동** | ❌ **(초판 자체 주장 — §2-1)** |
| 디스크 부족 | 631 GiB 여유(29% 사용) | ❌ |
| 키움 API 키 미설정·API 장애 | 캐시 정리 후 `daily-close` **HTTP 200 / 0.55초**, 5개 라우트 전부 정상 | ❌ |
| 특정 대용량 데이터 모듈 static import | `lib/kiwoom/data/` 4KB. 2MB 초과 파일은 `.legal-cache/`(빌드 비대상)뿐 | ❌ |

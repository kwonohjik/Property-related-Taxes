# 키움증권 OpenAPI 연동 — §99①3 양도일 이전 1개월 종가 자동조회 구현 계획 (v4)

> ★ v4 정정 (design v2 반영 + plan↔design 상호 재검토):
> 1. **store 필드 재사용 확정**: `stockCode` 신규 추가 → **기존 `securityCode` 필드 (line 81)** 재활용. ①②③ 변경 영향 3 필드 → 2 필드 (`kiwoomTradingHalt`·`kiwoomLastFetchedAt`)
> 2. **본 PR 자동조회 적용 범위 확정**: 상장 (KOSPI·KOSDAQ·KONEX) 종목만. 비상장(`unlisted`)은 키움 API 미지원 → 자동조회 버튼 disabled + 수동 입력 유지. K-OTC 비상장 시세 출처는 F-14 후속 PR
> 3. **primary anchor 변경**: U-01 = KOSPI 005930 (2024-06-03). 이미지 26 시나리오(비상장)는 U-04 회귀 보호 케이스
> 4. **환경변수 graceful**: `KiwoomConfigError` Route 503 → UI 안내 카드. 자동 fallback 금지 정책 정합
> 5. **클라이언트 필터 책임**: Route Handler에서 1개월 범위 필터링 → averages.ts 순수 함수에 quotes 인자 전달
> 6. **캐시 일자별**: `LRUCache<CacheKey, DailyQuote>` 단일 종가. 과거 거래일 영구·당일 5분 TTL
> 7. **에러 클래스 신규**: `KiwoomConfigError`·`KiwoomAuthError`·`KiwoomRateLimitError`·`KiwoomTradingHaltError`

# (v3 본문 유지)


> **상태**: PDCA — Plan v3 (Do 진입 게이트 4건 중 3건 완료. K-PING-01 모의투자 ping은 Do 첫 단계로 이월).
> **작성자**: kiwoom-api-senior (페르소나) — `.claude/agents/kiwoom-api-senior.md`
> **작성일**: 2026-05-19 (v1 → v2 → v3 동일자)
> **v3 변경 요지**: ★ **법령 인용 정정 — §163⑨ → §99①3** (환원율 §82 오기 패턴 반복 발견) / KoreanLaw MCP 본문 첨부 완료 (§99①3·시행령 §165③·상증령 §52의2) / 거래일 분모 법령 명시 확인 (상증령 §52의2④ 공휴일·토요일 제외) / 거래정지 자동조회 차단 법령 근거 확인 (상증령 §52의2③ 평가 적용 제외) / 마운트 위치 확정 (`PostListingValuationCard.tsx:119` + `transferStdInputMode === "daily"` 분기) / 키움 REST WebFetch 부분 완료 (OAuth2 endpoint 확정·TR 상세는 회원 로그인 후 Do 첫 단계 캡처)
> **연관 PDCA**: `project_stock_transfer_post_listing_pdf_replica.md` (Phase A 완료 — §163⑨ KoreanLaw 검증 완료)
> **관련 컴포넌트**: `components/calc/stock-transfer/TransferDate1MonthClosingPriceTable.tsx`(이미지 26 31-슬롯 표, 기존 구현)
> **관련 메모리 정책**: `feedback_no_silent_apportion_fallback` · `feedback_useeffect_store_mirror_forbidden` · `feedback_korean_law_82_vs_81_2_drift` · `feedback_ui_engine_dual_truth_avoidance` · `feedback_enum_substring_match_forbidden`

---

## 1. 목표·범위

### 1.1 In Scope

비상장 주식 양도세 마법사에서 사용자가 **종목코드 6자리를 직접 입력하고 명시 "자동조회" 버튼을 클릭**하면, 양도일 직전 1개월 31-일자 슬롯(이미지 26)에 거래일 종가를 자동으로 채워 §163⑨ 환산 분모 평균을 자동 산정한다.

- 신규 시세 인프라 도메인 `lib/kiwoom/` (auth · client · TR · cache · calendar · averages · market-mapping · dedup)
- Route Handler `app/api/kiwoom/{search,transfer-1month}/route.ts` — 서버측 secret 보호
- UI 위젯: 기존 `SecurityMetadataBlock.tsx`에 `stockCode` 필드 신규 + `KiwoomAutoFetchButton.tsx` 신규(명시 클릭 트리거) + 기존 `TransferDate1MonthClosingPriceTable.tsx` props 수신 보강
- **신규 store 필드**: `stockCode: string` (필수 신규 — C1 보완)
- 환경변수 추가 `KIWOOM_APP_KEY` · `KIWOOM_APP_SECRET` · `KIWOOM_ENV`
- anchor 7종(아래 §9) + 휴장일 캘린더 fixture(2020~2026 — M5 보완)

### 1.2 Out of Scope (후속 PR로 위임)

- §63①1 평가기준일 전후 2개월 (상속·증여 평가) — inheritance-gift-tax-senior 협업 별도 PDCA (F-01)
- §165⑤ 상장일 이후 1개월 (`PostListingClosingPriceTable.tsx`) — 동일 인프라 재사용 후속 PR (F-02)
- §99①3 양도일 당일 종가 단건 — 후속 PR (F-03)
- 대주주 임계 시총 50억 자동 판정 (`valuation/major-shareholder.ts`) — 후속 PR (F-04)
- **종목명 자동완성**(다건 후보 표시) — 후속 PR (F-10, M2 보완). 본 PR은 6자리 종목코드 직접 입력 + Blur/버튼 시 단일 ka10001 호출
- **Vercel/serverless 분산 token store** (Redis/Supabase `kiwoom_tokens`) — 후속 PR (F-11, M6 보완)
- **자동조회 출처 라벨링** (결과 카드 "키움 자동조회 YYYY-MM-DD") — 후속 PR (F-12, m4 보완)
- 양도소득 산식·세율표·LTHD — stock-transfer-tax-senior 영역(불변)

---

## 2. 법령 근거 (v3 정정 완료)

### 🚨 v3 정정 사항 — `§163⑨` 인용 오류 발견

> **환원율 §82 오기 패턴 반복 발견** (`feedback_korean_law_82_vs_81_2_drift`). 기존 컴포넌트 `PostListingValuationCard.tsx:102` 라벨 "양도일 직전 1개월 종가 평균 (1주당, §163⑨ 분모)" 및 `TransferDate1MonthClosingPriceTable.tsx` 주석의 §163⑨ 인용은 **잘못된 조문**.
>
> KoreanLaw MCP 본문 확인 결과:
> - **소득세법 시행령 §163⑨** = 상속·증여받은 자산의 취득당시 실지거래가액 = 상증법 §60~§66 평가가액 (일봉 평균과 무관)
> - **본 PR 실제 근거** = **소득세법 §99①3** (모법) → 상증법 §63①1가목 본문 준용 + 상증령 §52의2②③④
>
> **본 PR 부수 정정** (D-1 작업): 기존 라벨·주석 §163⑨ → §99①3 정정 (별도 mini-PR 분리 가능).

### 2.1 정확한 위임 체인 (KoreanLaw MCP 본문 검증 완료)

```
모법 ─ 소득세법 §99①1·3 (기준시가의 산정)
       │  본문: "「상속세 및 증여세법」 제63조제1항제1호가목을 준용하여 평가한 가액.
       │        이 경우 '평가기준일 이전·이후 각 2개월'은 '양도일·취득일 이전 1개월'로 본다."
       │
       ▼
시행령 ─ 소득세법 시행령 §165③ (코스닥·코넥스 적용 + 치환)
       │  본문: "법 제99조제1항제3호 전단 및 같은 항 제4호 전단에서 '대통령령으로 정하는
       │        주권상장법인'이란 각각 코스닥시장 또는 코넥스시장에 주권을 상장한 법인을
       │        말하며, ... 상증령 §52의2③에 해당하는 것을 말한다. 이 경우 같은 항 중
       │        '평가기준일 전후 2개월'은 '양도일·취득일 이전 1개월'로 한다."
       │
       ▼ (준용)
준용 ─── 상속세 및 증여세법 §63①1가목 본문 (평균액 산정)
       │
       ▼ (위임)
산정 ─── 상속세 및 증여세법 시행령 §52의2 (1주당 가액 산정·매매거래 정지 제외·휴장일 제외)
          ② "대통령령으로 정하는 바에 따라 계산한 기간의 평균액"의 기간 정의
             (증자·합병 등 사유 발생 시 기간 조정 — 일반 케이스는 단순 평균)
          ③ "매매거래가 정지되거나 관리종목으로 지정된 기간의 일부 또는 전부가 포함되는
             주식등"은 본 평가에서 제외 → 거래정지 자동조회 차단 법령 근거
          ④ "공휴일 등 매매가 없는 날" = (1) 「관공서의 공휴일에 관한 규정」 공휴일 +
             대체공휴일 (2) **토요일** → 평균 분모에서 제외 = **거래일 분모 법령 명시**
```

### 2.2 도출 사실 (Do 진입 전 확정)

| ID | 사실 | 출처 |
|---|---|---|
| L-1 | 평균 분모는 **거래일** (공휴일·대체공휴일·토요일·매매정지일 제외) | 상증령 §52의2④ |
| L-2 | 기간 = "양도일·취득일 이전 1개월" (소령 §99①3 단서 + 시행령 §165③ 단서 — 양도일 미포함은 "이전"의 통상해석. **일요일 명시는 §52의2④에 없음 — 다만 거래소 일요일 미개장으로 사실상 거래일 부재**) | 소법 §99①3 / 시령 §165③ |
| L-3 | 거래정지·관리종목 종목은 본 평가 적용 제외 → 자동조회 차단 + 수동 입력 허용 정책 정합 | 상증령 §52의2③ |
| L-4 | 적용 시장 = 유가증권시장(코스피)·코스닥·코넥스 모두 본 평가 적용 (상장주식 한정 — §99①3은 본 PR 그대로 상장 비상장 §99①4와 별도) | 소법 §99①3 / 시령 §165③ |
| L-5 | 본 PR scope는 **비상장 환산 모드의 분모로 양도일 직전 1개월 평균이 사용되는 경우** (`PostListingValuationCard` 내부 `transferStdInputMode === "daily"`). 정확한 모법은 §165③ 또는 §99①4 (비상장)에서 §99①3 준용 — 기존 엔진 흐름 그대로 |
| L-6 | 증자·합병 등 사유가 1개월 내 발생 시 기간 조정 필요 (상증령 §52의2②) — **본 PR scope 외** (후속 PR F-13으로 분리). 이미지 26 양식은 단순 1개월 평균 케이스만 |

### 2.3 §163⑨ 본문 인용 (정정 근거 보강)

```
소득세법 시행령 §163⑨ 본문 (요약):
"상속 또는 증여(법 §88①호 각목 후단 부담부증여의 채무액 포함, 상증법 §34~§42 증여 제외)
받은 자산에 대하여 법 §97①1가목을 적용할 때에는 상속개시일 또는 증여일 현재 상증법
§60~§66에 따라 평가한 가액을 취득당시의 실지거래가액으로 본다. 다만, ..."

→ 본 조항은 "상속·증여 자산의 취득가액 산정"으로 일봉 1개월 평균과 무관.
```

### 2.4 Do 진입 전 게이트 결과 (m6 완료)

- [x] `mcp__claude_ai_KoreanLaw__get_law_text` 소득세법 §99 본문 캐시 (MST 285523 / 시행일 20260421)
- [x] 소득세법 시행령 §165 본문 캐시 (MST 285631 / 시행일 20260423)
- [x] 상증령 §52의2 본문 캐시 (MST 283637 / 시행일 20260227)
- [x] §163⑨ ≠ 본 PR 근거 확정 — 기존 컴포넌트 인용 정정 필요
- [x] 거래일 분모 법령 명시 확인 (상증령 §52의2④)
- [x] 거래정지 제외 법령 명시 확인 (상증령 §52의2③)
- [ ] (Do 첫 단계) 증자·합병 케이스 본 PR scope 외 명시 — F-13 후속 PR

---

## 3. 키움 OpenAPI 사용 TR

### 3.1 공식 사양 (v3 부분 확정 — C2 완료 70%)

#### 3.1.1 OAuth2 토큰 발급 (WebFetch 확정)

| 항목 | 값 | 출처 |
|---|---|---|
| Endpoint | `POST /oauth2/token` | openapi.kiwoom.com/guide/apiguide |
| 모의투자 도메인 | `https://mockapi.kiwoom.com` (KRX만 지원) | 동상 |
| 실투자 도메인 | `https://api.kiwoom.com` | 동상 |
| Content-Type | `application/json;charset=UTF-8` | 동상 |
| 요청 필드 | `grant_type: "client_credentials"` · `appkey` · `secretkey` | 동상 |
| 응답 필드 | `token` (access token) · `token_type: "bearer"` · `expires_dt` · `return_code` · `return_msg` | 동상 |

> **주의**: 요청 필드명이 `appsecret`이 아니라 **`secretkey`** — Plan v1·v2 추정값(`appsecret`) 정정 완료.

#### 3.1.2 TR 상세 사양 (Do 첫 단계 캡처 — 가이드 페이지 회원 로그인 필요)

`https://openapi.kiwoom.com/guide/apiList` 등 TR 상세 페이지가 비회원 접근 불가(404 또는 미인증). Do 첫 단계에서:
- 사용자 회원 로그인 후 ka10001·ka10081 상세 사양 페이지 캡처
- 응답 필드명(stk_nm·stk_cd·mket_id·tradingHalt 등) 실응답으로 1차 확정
- `lib/kiwoom/types.ts`에 응답 타입 정의 후 fixture로 anchor 고정

#### 3.1.3 Pre-Do ping anchor (K-PING-01)

모의투자 endpoint로 토큰 발급 + ka10001(005930 삼성전자) 1회 실호출 → 응답 JSON 캡처 → `__tests__/kiwoom/fixtures/` 에 anchor 고정 (M1·m3 보완). 사용자 `.env.local`에 키 입력 후 실행 가능.

### 3.2 TR 호출 매트릭스 (v1 추정값 — Do 진입 전 §3.1 게이트로 정정)

| TR ID(추정) | 명칭 | 본 PR 사용 | 시그니처(추정) | 응답 핵심 필드(추정) |
|---|---|---|---|---|
| `ka10001` | 주식기본정보요청 | ✅ 종목코드 확정 + 시장구분 + 거래정지 플래그 | `{ stk_cd: "005930" }` | `stk_nm` · `mket_id` · `tot_stk_amt` · `lstg_stk_amt` · `tradingHalt` |
| `ka10081` | 주식일봉차트조회요청 | ✅ 일별 종가 배열 (200거래일 충분히 받아 클라이언트 필터 — M3 보완) | `{ stk_cd, base_dt, modify_pric_tp: "1" }` (m2 보완: 수정주가 기본) | `dly_chart[]` ← `[{dt, cur_prc, trde_qty, ...}]` |
| `ka10086` | 일별주가요청 | (후속) anchor 교차검증용 | — | — |
| `ka10095` | 관심종목정보요청 | (후속 F-06) 다종목 batch | — | — |
| `ka10099` | 전종목정보요청 | (후속 F-10) 자동완성 marker | — | — |

> **호출 흐름 (M2·M3 보완)**:
> 1. 사용자가 SecurityMetadataBlock의 `stockCode` 필드에 6자리 입력 + Blur(또는 자동조회 버튼 클릭) → `ka10001` 1회 → 종목명·시장·거래정지 확인
> 2. 양도일 확정 후 "🔍 자동조회" 버튼 클릭 → `ka10081` 1회(`base_dt = transferDate`, 응답 200거래일) → 서버에서 `[transferDate − 1 month, transferDate − 1 day]` 클라이언트 필터 → 31-슬롯 매핑
> 3. 자동완성(종목명 다건 후보)은 본 PR 미포함 — F-10 후속 PR

### 3.3 Rate Limit·재시도·Dedup 정책

- token bucket **초당 3건**(공식 5건 추정의 60% 안전치 — m1 보완). `lib/kiwoom/client.ts` 내부 큐.
- 429·5xx → 지수 백오프(250ms·500ms·1s·2s — 최대 4회).
- 4회 실패 시 사용자에게 "키움 시세 서버 일시 응답 지연 — 수동 입력 권장" 안내 카드(자동 fallback 채움 **금지** — 정책 §1).
- **In-flight dedup (M7 보완)**: `lib/kiwoom/dedup.ts` — `Map<string, Promise<T>>` 키 = `{TR}|{stockCode}|{base_dt}`. 중복 클릭/동시 onChange 시 동일 Promise 공유.
- **일별 호출 한도 미상 (사용자 답변)**: 응답 헤더(`X-RateLimit-Remaining` 등 추정) 감시 + 일정 임계 도달 시 콘솔 경고 + 캐시 hit 우선화. capacity는 메모리 LRU 1,000 entry(m7 보완)
- **Token Vercel 분산 환경 주의 (M6 보완)**: dev/local 단일 인스턴스 OK. prod 배포 시 lambda 인스턴스마다 in-memory token 별도 → 재발급 다중. 후속 PR F-11에서 Redis/Supabase `kiwoom_tokens` 영구화. 본 PR `auth.ts` 주석에 `// TODO(F-11): serverless 환경 token store 분리` 명시.

---

## 4. 아키텍처

### 4.1 파일 분할 (800줄 정책)

```
lib/kiwoom/                               # 시세 인프라 도메인 (역방향 의존 금지)
├── auth.ts                               # OAuth2 토큰 발급·갱신·메모리 캐시 + TODO(F-11) (~120줄)
├── client.ts                             # fetch wrapper + rate limit + 재시도 (~180줄)
├── dedup.ts                              # in-flight Map dedup (M7 보완) (~50줄)
├── market-mapping.ts                     # 키움 mket_id(uppercase) ↔ store marketType(lowercase) 단일 변환 (C1 보완) (~60줄)
├── tr/
│   ├── ka10001-stock-info.ts             # 종목기본정보 (~80줄)
│   └── ka10081-daily-chart.ts            # 일봉차트 (~100줄)
├── cache.ts                              # 메모리 LRU(capacity 1,000) — m7 보완 (~120줄)
├── calendar.ts                           # KRX 거래일 판정 헬퍼 (~80줄)
├── data/
│   └── krx-holidays-2020-2026.ts         # 정적 휴장일 fixture (M5 보완: 2020~2026) (~80줄)
├── averages.ts                           # §163⑨ 평균 산식 + KoreanLaw 본문 인용 주석 (~120줄)
└── types.ts                              # 공통 타입 (~60줄)

app/api/kiwoom/
├── search/route.ts                       # ka10001 orchestrator (Zod·rate limit·서버 secret) (~100줄)
└── transfer-1month/route.ts              # ka10081 orchestrator + 클라이언트 필터 (~140줄)

components/calc/stock-transfer/           # 기존 디렉터리 (신규 stock/ 디렉터리 생성하지 않음 — 기존 위치 사용)
├── SecurityMetadataBlock.tsx             # ✏️ stockCode 필드 추가 + Blur 시 ka10001 호출 (기존 + ~40줄)
└── KiwoomAutoFetchButton.tsx             # 신규 — "🔍 자동조회" 명시 버튼 (C3 보완) (~100줄)
```

기존 `TransferDate1MonthClosingPriceTable.tsx`(170줄)는 외부 props(`onAutoFill`)로 자동조회 결과를 수신하여 31-슬롯에 매핑(자체 fetch 금지). 명시 버튼은 상위 마운트 컴포넌트(아래 §4.3 참조)에 위치.

### 4.3 마운트 위치 (M4 완료 — grep 결과 첨부)

#### 4.3.1 현 마운트 위치 (grep 결과)

```
components/calc/stock-transfer/PostListingValuationCard.tsx:27
  → import { TransferDate1MonthClosingPriceTable }
components/calc/stock-transfer/PostListingValuationCard.tsx:119
  → <TransferDate1MonthClosingPriceTable form={form} onChange={onChange} />
    조건: form.transferStdInputMode === "daily"
```

#### 4.3.2 분기 토글 구조 (PostListingValuationCard 내부)

```
PostListingValuationCard
├── RadioCardGroup name="unlistedDetailMode"  (default "simple")
│   ├── "simple"          (단순 환산)
│   ├── "listing_only"    (상장만 환산)
│   └── "full"            (전체 환산 — §165⑤ 사례 48 분기)
│
├── transferStdInputMode 모드 토글  ★ 본 PR 핵심
│   ├── "direct"  → 1주당 평균 직접 입력 (line 100-114, CurrencyInput)
│   └── "daily"   → 31-슬롯 표 자동/수동 입력 (line 117-129)
│                   → ★ 본 PR 자동조회 버튼 부착 위치 ★
│
└── listingDate FieldCard (line 131+, 상장일 — 사례 48 PostListingClosingPriceTable trigger)
```

#### 4.3.3 본 PR 마운트 결정

**`PostListingValuationCard.tsx` 의 `transferStdInputMode === "daily"` 분기 내부, `TransferDate1MonthClosingPriceTable` 직전에 `KiwoomAutoFetchButton` 부착.**

```tsx
{form.transferStdInputMode === "daily" && (
  <>
    {/* ★ 신규 — 자동조회 버튼 */}
    <KiwoomAutoFetchButton
      stockCode={form.stockCode}
      transferDate={form.transferDate}
      marketType={form.marketType}
      tradingHalt={form.kiwoomTradingHalt}  // ka10001 응답에서 mirror
      onFill={({ dates, closings, avg }) => {
        onChange({
          transferPriceDates: dates,
          transferPriceClosing: closings,
          transferDatePriceAvg1Month: avg,
        });
      }}
    />
    <TransferDate1MonthClosingPriceTable form={form} onChange={onChange} />
    {/* ... 기존 emerald 미리보기 카드 ... */}
  </>
)}
```

#### 4.3.4 자동조회 버튼 활성 조건 (UI disabled 처리)

| 조건 | 검증 | 위반 시 disabled 사유 |
|---|---|---|
| `stockCode.length === 6` AND 숫자 | 종목코드 형식 | "종목코드 6자리 입력 필요" |
| `transferDate !== null` | 양도일 입력 | "양도일 입력 필요" |
| `marketType` ∈ {`kospi`, `kosdaq`, `konex`, `unlisted`} | 상장 또는 비상장 모드 | "지원 시장 아님" |
| `kiwoomTradingHalt !== true` | 거래정지 종목 차단 (상증령 §52의2③) | "거래정지 종목 — 수동 입력 권장" |

> **참고**: `marketType === "unlisted"`는 일반적으로 키움 API에서 미상장 → ka10081 조회 불가. 단 K-OTC 등록 비상장은 별도 시세 출처 필요 (본 PR scope 외, F-14 후속).

#### 4.3.5 기존 §163⑨ 인용 정정 작업 (D-1 mini-PR)

다음 파일의 §163⑨ 인용 → §99①3 (시행령 §165③ 준용 + 상증령 §52의2)로 정정:

```
components/calc/stock-transfer/PostListingValuationCard.tsx:102
  "양도일 직전 1개월 종가 평균 (1주당, §163⑨ 분모)"
  → "양도일 직전 1개월 종가 평균 (1주당, §99①3 · 시행령 §165③ 준용)"

components/calc/stock-transfer/PostListingValuationCard.tsx:104,124
  "§163⑨ 환산 분모로 사용" / "§163⑨ 환산 미적용"
  → "§99①3 환산 분모로 사용" / "§99①3 환산 미적용"

components/calc/stock-transfer/TransferDate1MonthClosingPriceTable.tsx
  헤더 라벨 + 주석의 §163⑨ → §99①3 (시행령 §165③ 준용)

lib/tax-engine/stock-transfer/stock-valuation-post-listing.ts
  엔진 헬퍼 주석 §163⑨ → §99①3 정정 (산식 자체는 동일 — 분모 1개월 거래일 평균)
```

본 PR 내 D-1 sub-task로 포함하거나 별도 mini-PR 분리. 산식·anchor 변경 없음 — 주석/라벨만.

### 4.2 의존 방향

- `lib/kiwoom/*` → 외부 의존 없음(서버 fetch만). `lib/tax-engine/` 미참조.
- `lib/calc/stock-transfer-tax-api.ts` → `lib/kiwoom/*` **미참조** (UI에서 fetch → store → API 변환 흐름이므로 도메인 분리).
- UI 위젯(`components/calc/stock/*`) → `app/api/kiwoom/*` (서버 라우트만 호출, 키움 직접 호출 금지 — CORS·secret).

---

## 5. 데이터 흐름 다이어그램

```
[비상장 가지 UI · marketType="unlisted"]
   │
   ▼
SecurityMetadataBlock.stockCode (6자리 input)
   │  사용자 입력: "005930"
   │  onBlur 핸들러(useEffect 금지 — 정책 §1)
   ▼
POST /api/kiwoom/search { stockCode }
   │  → ka10001 호출 → {stk_nm, mket_id, tradingHalt, ...}
   │  → market-mapping.ts: "KOSPI" → "kospi" (C1 변환)
   ▼
onBlur 콜백 onChange({ securityName, marketType, tradingHalt })
   │  (★ useEffect → store 미러링 금지 — 정책 §1)
   │
   ▼ (양도일 + 종목코드 + 거래정지 N 모두 확정 시)
KiwoomAutoFetchButton 활성 (disabled 해제)
   │  사용자 클릭
   ▼
POST /api/kiwoom/transfer-1month
   body: { stockCode, transferDate }
   │  → 서버: dedup 키 확인 → cache lookup → miss 시 ka10081(base_dt=transferDate, 200거래일)
   │  → 클라이언트 필터 [transferDate − 1m, transferDate − 1d] (M3 보완)
   │  → 응답: { quotes: [{date: "2024-05-02", close: 79100}, ...], tradingHalt: false }
   ▼
fetch onSuccess 콜백 (mutation.onSuccess 내)
   │
   ▼
onChange({
  transferPriceDates: [...31일 슬롯, 거래일=YYYY-MM-DD/주말=null],
  transferPriceClosing: [...31일 슬롯, 거래일만 종가, 주말=null],
  transferDatePriceAvg1Month: avg(채워진 거래일 종가)
})
   │
   ▼
TransferDate1MonthClosingPriceTable (props 수신)
   │  → 슬롯 렌더 + "토요일·거래일 제외" 라벨 자동 (calendar.ts)
   │  → 평균 미리보기 카드 (calcMonthlyClosingAverage)
   ▼
[엔진 H-01 분기] stock-valuation-post-listing.ts 평균 분모 사용
```

---

## 6. 케이스 인벤토리 매트릭스 (행 8개)

> Plan/Design 단계 매트릭스 행≥1 필수 — `feedback_pdca_session_efficiency` + `feedback_ui_input_path_enumeration` 준수. 신규 enum/모드 추가 시 모든 분기 enumerate.

| # | 케이스 | 종목코드 | 양도일 | 시장 | 거래정지 | 자동조회 기대 동작 | anchor 후보 |
|---|---|---|---|---|---|---|---|
| K-01 | 정상 (KOSPI, 휴장일 없음) | 005930 | 2024-06-03 | KOSPI | N | 거래일 22일 채움, 평균 = 합/22, 분모 22 | K-01 평균 toBe |
| K-02 | 정상 (KOSDAQ, 휴장일 포함) | 086520 | 2024-05-07 | KOSDAQ | N | 어린이날 5/5 휴장 + 토/일 자동 제외, 분모 = 거래일 수 | K-02 휴장일 제외 |
| K-03 | KONEX 종목 | 217620 | 2024-04-01 | KONEX | N | KONEX 거래일 캘린더 동일 적용 (m8: KRX 공시 통합 휴장일 가정 — Do 진입 전 1회 anchor 검증 필요) | K-03 KONEX 분기 |
| K-04 | 거래정지 종목 | — | — | — | Y | 자동조회 차단 + 안내 카드 "거래정지 — 수동 입력 권장" (자동 fallback 금지 — 정책 §1) | K-04 차단 메시지 |
| K-05 | 1개월 전 미상장 (IPO 후 < 1개월) | (신규상장) | 2024-06-03 | KOSPI | N | 응답 거래일 < 정상 일수 → 분모 부족 경고 카드 (자동 보정 금지) | K-05 분모 부족 경고 |
| K-06 | 양도일 당일 자동조회 시도 | 005930 | TODAY | KOSPI | N | 기간 = [TODAY-1m, TODAY-1d] 정상. 단, end ≥ 오늘이면 ka10081 미반환 일자 빈칸 유지 | K-06 미래일 빈칸 |
| K-07 | 윤년 경계 (2024-03-01) | 005930 | 2024-03-01 | KOSPI | N | 기간 = [2024-02-01, 2024-02-29] 29일 슬롯 (윤년) | K-07 윤년 슬롯 수 |
| K-08 | Rate limit 초과 (동시 다종목) | 005930×N | — | — | N | token bucket 큐잉 → 응답 순차 도착, 사용자 wait spinner | K-08 rate limit anchor |

> 추가 후보(후속 PR): 정리매매·관리종목·액면분할 보정(F-05)·다중 종목 batch(F-06). 사례 48(취득 후 상장 §165⑤)은 본 PR scope 외 — `isPostListing === false` 분기만 처리(m5 보완).

---

## 7. 14개 동기화 지점 — 본 PR 범위

> 본 PR은 시세 입력 인프라 추가. 엔진 input/result 타입 변경 **없음** — 기존 `transferPriceDates`·`transferPriceClosing`·`transferDatePriceAvg1Month` 3 필드를 자동 채움만. 단, **stockCode 신규 필수 필드 추가**로 ①②③ 동기화 발생(C1 보완).

| # | 지점 | 본 PR 변경 여부 | 비고 |
|---|---|---|---|
| ① | 폼 상태 타입 (`calc-wizard-stock-store.ts`) | ✅ **`stockCode: string` 신규 필수 추가** | 기존 store에 `stockCode` 없음 확인 완료(grep). `securityName`·`marketType`은 기존 보존 |
| ② | initial value (`calc-wizard-stock-store.ts:337+`) | ✅ `stockCode: ""` 신규 default | 빈문자 "" 일관 |
| ③ | normalize (`calc-wizard-stock-normalize.ts`) | ✅ `stockCode` 빈문자 처리 + sessionStorage 마이그 호환 | undefined → "" 변환 강제 (`feedback_store_default_vs_ui_display_fallback` 3중 패턴) |
| ④ | API 변환 (`stock-transfer-tax-api.ts`) | ❌ 변경 없음 | `stockCode`는 엔진 미사용 메타 — API body 미전송. 기존 `transferDatePriceAvg1Month`만 송신 |
| ⑤ | UI 위젯 | ✅ `SecurityMetadataBlock` stockCode 필드 + `KiwoomAutoFetchButton` 신규 + `TransferDate1MonthClosingPriceTable` props 수신 | 비상장 가지(grep 게이트 §4.3) |
| ⑥ | 사이드바 합계 | ❌ | 시세 자체는 사이드바 미노출 |
| ⑦ | 결과 카드 | ❌ | 기존 산식 그대로. 자동조회 출처 라벨링은 F-12 후속 PR(m4) |
| ⑧ | Validation (`stock-transfer-tax-validate.ts`) | ✅ stockCode 6자리 숫자 검증(빈문자 허용 — 수동 입력 모드) | UI 통과↔validate 차단 모순 금지 |
| ⑨ | Zod enum 메인 | ❌ | 입력 객체 신규 enum 없음 |
| ⑩ | Zod enum 컴패니언 | ❌ | — |
| ⑪ | acquisitionDate fallback | ❌ | — |
| ⑫ | Zod 입력 객체 정의 | ❌ | stockCode 엔진 미전송 — Zod 미정의 |
| ⑬ | callTransferTaxAPI body spread | ❌ | — |
| ⑭ | Route handler 매핑 | ❌ | — |

**자가 점검**: ①②③ stockCode 신규 필드 추가 시 3중 일관성 강제(`feedback_store_default_vs_ui_display_fallback`). Do 진입 전 grep 자가 점검:
- [ ] `grep -n 'stockCode' lib/stores/calc-wizard-stock-store.ts` — factory default 1건
- [ ] `grep -n 'stockCode' lib/stores/calc-wizard-stock-normalize.ts` — normalize 1건
- [ ] `grep -n 'stockCode' components/calc/stock-transfer/SecurityMetadataBlock.tsx` — UI 직접 사용 (fallback 제거)

---

## 8. 환경변수·보안

### 8.1 `.env.example` 추가

```env
# 키움증권 OpenAPI (https://openapi.kiwoom.com)
KIWOOM_APP_KEY=
KIWOOM_APP_SECRET=
KIWOOM_ENV=mock   # mock | prod
```

### 8.2 보안 규칙

- 실키 절대 커밋 금지. pre-commit hook + `.gitignore` 확인.
- access token: 메모리 캐시만(서버측). localStorage·cookie 금지.
- 클라이언트는 본 프로젝트 `/api/kiwoom/*` Route Handler만 호출. 키움 직접 호출 금지(CORS·secret 노출).
- Rate limit·재시도는 서버에서만. 클라이언트는 단일 요청 후 대기.
- 로깅: `app_key`·`app_secret`·`access_token` 마스킹 후 출력 (`****0930` 등 마지막 4자만).

---

## 9. 테스트 계획

### 9.1 anchor (최소 5건 — Pre-Do 우선 검증 정책 `feedback_pre_anchor_verification`)

| Anchor ID | 대상 | 입력 | 기대 출력 | 우선순위 |
|---|---|---|---|---|
| K-AVG-01 | `averages.oneMonthBeforeTransferAvg()` | 종가 22일 합 1,758,000 + 빈값 9건 | `79,909` (≈ 1,758,000/22, 원 단위 정수) | Pre-Do |
| K-CAL-01 | `calendar.isKrxTradingDay("2024-05-05")` | 어린이날 | `false` | Pre-Do |
| K-CAL-02 | `calendar.isKrxTradingDay("2024-05-04")` | 토요일 | `false` | Pre-Do |
| K-CAL-03 | `calendar.isKrxTradingDay("2020-12-31")` | 2020 임시휴장 (m5 보완 2020 범위) | `false` | Pre-Do |
| K-HALT-01 | `ka10001` 응답 `tradingHalt: "Y"` mock | — | `KiwoomStockMetaError("trading_halted")` throw + 자동조회 차단 | Pre-Do |
| K-RATE-01 | `client.ts` token bucket 초당 6건 시도 | 6 concurrent | **3건 즉시·3건 333ms 후 (3/sec — m1 보완)** | Pre-Do |
| K-DEDUP-01 | 동일 `{TR, stockCode, base_dt}` 2회 동시 호출 (M7 보완) | concurrent | 1회 API + 동일 Promise 공유 | Pre-Do |
| K-MAP-01 | `market-mapping.normalizeMarket("KOSPI")` (C1 보완) | uppercase API 응답 | `"kospi"` store 값 | Pre-Do |
| K-PING-01 | 모의투자 endpoint 실호출 ping (M1 보완 — 환경변수 있을 때만 실행) | ka10001 005930 | `stk_nm === "삼성전자"` + 토큰 발급 OK | Pre-Do (조건부) |
| K-FILTER-01 | ka10081 200거래일 응답 → 클라이언트 필터 (M3 보완) | base_dt=2024-06-03, 응답 200일 | `[2024-05-03, ..., 2024-06-02]` 22거래일 | Pre-Do |
| K-CACHE-01 | 동일 (stockCode, date) 2회 호출 | — | 1회 API + 1회 cache hit | (보강) |
| K-LEAP-01 | 양도일 2024-03-01 슬롯 수 | — | 29 (윤년) | (보강) |

### 9.2 mock 픽스처

- `__tests__/kiwoom/fixtures/ka10001-005930.json` — 삼성전자 응답 샘플
- `__tests__/kiwoom/fixtures/ka10081-005930-2024-05.json` — 일봉 22거래일 응답
- `__tests__/kiwoom/fixtures/ka10001-halted.json` — 거래정지 케이스

### 9.3 회귀 보호

- 전체 `npx vitest run __tests__/tax-engine/stock-transfer/` 3,452 PASS 유지(현재 baseline).
- `npx tsc --noEmit` 0건.

---

## 10. 사전 확인 항목 — 사용자 답변 확정 (Do 진입 가능)

| # | 항목 | 사용자 답변 | 본 PR 반영 |
|---|---|---|---|
| 1 | 앱키 발급 | **완료** | 사용자가 `.env.local`에 직접 입력. `.env.example`만 키 이름 추가 |
| 2 | 환경 선택 | **모의투자** (`KIWOOM_ENV=mock`) | `mockapi.kiwoom.com` 기본. prod 동시 지원은 후속 |
| 3 | 일별 호출 한도 | **모름** | 보수적 초당 3건 + 응답 헤더 감시 + 메모리 LRU 1,000 entry |
| 4 | 종목 자동완성 데이터 소스 | **키움 ka10001** | 6자리 직접 입력 + Blur 시 단일 ka10001 호출(다건 자동완성은 F-10) |
| 5 | 휴장일 fixture 범위 | **2020~2026 정적 + 범위 외 API 응답** | `krx-holidays-2020-2026.ts` (M5 보완) |
| 6 | 거래정지 UX | **안내 후 수동 입력 허용** | amber 안내 카드 + 자동조회 버튼 disabled + 31-슬롯 수동 입력 유지 |
| 7 | 캐시 | **메모리만** (Phase 1) | LRU 1,000 entry. Supabase 영구화는 F-07 |

### 10.1 Do 진입 전 게이트 결과 (v3 정리)

- [x] §3.1 키움 REST 사양 WebFetch 게이트 (C2) — OAuth2 endpoint 확정 / TR 상세는 Do Phase 0으로 이월
- [x] §2 KoreanLaw 본문 인용 (m6) — §99①3·§165③·§52의2 본문 첨부 + ★ §163⑨ 인용 오류 정정
- [x] §4.3 마운트 위치 grep (M4) — `PostListingValuationCard.tsx:119` + `transferStdInputMode === "daily"` 확정

### 10.2 Do Phase 0 게이트 — 잔여 3건 (Do 1번째 sub-task 묶음)

> Do 진입 즉시 본 Phase 0 3건을 일괄 처리 후 Phase 1(`lib/kiwoom/` 구현) 진입. 모두 산식·엔진 무변경.

#### Phase 0.1 — D-1 §163⑨ 인용 정정 mini-PR (선행 가능 / 키 무관)

- **사전 조건**: 없음 (사용자 키 무관)
- **변경 파일** (산식·anchor 변경 0건, 주석·라벨만):
  - `components/calc/stock-transfer/PostListingValuationCard.tsx:102` — "양도일 직전 1개월 종가 평균 (1주당, §163⑨ 분모)" → "(1주당, §99①3 · 시행령 §165③ 준용)"
  - `components/calc/stock-transfer/PostListingValuationCard.tsx:104,124` — "§163⑨ 환산 분모로 사용" / "§163⑨ 환산 미적용" → "§99①3 환산 분모로 사용" / "§99①3 환산 미적용"
  - `components/calc/stock-transfer/TransferDate1MonthClosingPriceTable.tsx` — 헤더 라벨·주석 §163⑨ → §99①3 (시행령 §165③ 준용)
  - `lib/tax-engine/stock-transfer/stock-valuation-post-listing.ts` — 엔진 헬퍼 주석 §163⑨ → §99①3
- **anchor 보호**: 기존 전체 3,452 PASS 유지 회귀 확인 (산식 무변경)
- **선행 PR 분리 가능**: 본 PR과 합치거나 별도 mini-PR로 처리. 어느 쪽이든 Phase 1 시작 전 완료
- **근거 메모리**: `feedback_korean_law_82_vs_81_2_drift` (환원율 §82 오기 정정 패턴 재현)

#### Phase 0.2 — TR 상세 사양 캡처 (사용자 협조 가능 시)

- **사전 조건**: 사용자가 키움 OpenAPI 회원 로그인 페이지 접근 가능
- **목표**: ka10001(주식기본정보)·ka10081(주식일봉차트) REST endpoint·요청 헤더·응답 필드 확정
- **방법 3가지** (실현 가능한 것부터):
  1. **사용자 직접 캡처**: 키움 OpenAPI 회원 로그인 후 `/guide/apiList` 또는 TR 상세 페이지를 사용자가 PDF/HTML 캡처 → `docs/00-pm/kiwoom-tr-spec.cache.md` 에 첨부
  2. **실응답 기반 역추론**: K-PING-01 anchor에서 ka10001 실응답 JSON 캡처 → `__tests__/kiwoom/fixtures/ka10001-005930.json` → 응답 필드명 확정 후 `lib/kiwoom/types.ts` 작성
  3. **공식 SDK 참조**: 키움 OpenAPI Python/Java 공식 SDK가 공개되어 있으면 GitHub WebFetch로 TR 매핑 추출
- **임시 처리** (캡처 지연 시): 추정 필드명(`stk_nm`/`stk_cd`/`mket_id`/`tradingHalt`/`dly_chart`)으로 Phase 1 시작 + Phase 2(테스트) 단계에서 실응답으로 정정
- **산출물**: `lib/kiwoom/types.ts` (응답 타입 정의) + `__tests__/kiwoom/fixtures/*.json`

#### Phase 0.3 — K-PING-01 모의투자 ping anchor (사용자 키 입력 후)

- **사전 조건**: 사용자가 `.env.local`에 다음 키 입력 완료
  ```env
  KIWOOM_APP_KEY=<실키>
  KIWOOM_APP_SECRET=<실키>
  KIWOOM_ENV=mock
  ```
- **실행 절차** (kiwoom-api-senior 자동 수행):
  1. `.env.local` 키 존재 확인 (없으면 anchor skip + 사용자에게 보고)
  2. `lib/kiwoom/auth.ts` 최소 구현으로 `POST https://mockapi.kiwoom.com/oauth2/token` 호출
  3. 응답 `token` 메모리 캐시 + `expires_dt` 확인
  4. `lib/kiwoom/tr/ka10001-stock-info.ts` 최소 구현으로 005930(삼성전자) 1회 호출
  5. 응답 JSON → `__tests__/kiwoom/fixtures/ka10001-005930-mock.json` 저장
  6. 응답 필드명·구조 → `lib/kiwoom/types.ts` 1차 확정
  7. anchor `K-PING-01`: `stk_nm === "삼성전자"` 검증 (또는 모의투자가 미반환 시 응답 본문 그대로 anchor로 고정 후 Plan v4 환류)
- **모의투자 응답 신뢰성 판단** (M1 보완):
  - 정상 응답: Phase 1 진행
  - 응답 구조 추정과 상이: Plan v4 작성 + Phase 1 일시 중단 + 사용자 협의
  - 모의투자 미반환: 실투자 환경 사용 여부 사용자 협의 (`.env.local` `KIWOOM_ENV=prod` 토글)
- **회귀 보호**: K-PING-01은 `.env.local` 키 없는 환경(CI 등)에서 자동 skip되도록 vitest `it.skipIf(!process.env.KIWOOM_APP_KEY)` 패턴 적용

### 10.3 Phase 0 → Phase 1 진입 조건

다음 모두 충족 시 Phase 1(`lib/kiwoom/` 본 구현) 진입:

- [ ] Phase 0.1 D-1 정정 완료 + 회귀 3,452 PASS 유지
- [ ] Phase 0.2 TR 사양 캡처 (방법 1·2·3 중 1개 이상 완료) — 또는 임시 처리 안내
- [ ] Phase 0.3 K-PING-01 PASS — 또는 키 미입력 환경에서 skip 후 사용자 보고

---

## 11. 후속 PR 후보

- **F-01** §63①1 평가기준일 전후 2개월 — 상속·증여 평가 (inheritance-gift-tax-senior 협업)
- **F-02** §165⑤ 상장일 이후 1개월 — 기존 `PostListingClosingPriceTable.tsx` 자동조회 통합 (사례 48)
- **F-03** §99①3 양도일 당일 종가 단건 자동조회
- **F-04** 대주주 임계 시총 50억(2024.1.1.~) 자동 판정 — `valuation/major-shareholder.ts`. `feedback_ui_engine_dual_truth_avoidance` 정책 강제(UI 자체 함수 → 엔진 import).
- **F-05** 액면분할·무상증자 보정(`modify_pric_tp` 파라미터) — 본 PR 기본 "1"(수정주가)로 고정
- **F-06** 다종목 batch (`ka10095` 관심종목정보) — 다종목 양도 시 1회 호출로 일괄
- **F-07** Supabase `stock_quotes` 영구 캐시 + 일별 cron prefetch
- **F-08** 거래일 캘린더 npm package 도입 비교 평가(`holiday-kr` 등)
- **F-09** Playwright e2e — 자동조회 → 31-슬롯 채움 → 결과 화면까지 회귀
- **F-10** 종목명 자동완성 다건 후보 (`ka10099` 전종목정보 prefetch) — M2 보완 분리
- **F-11** Vercel/serverless 분산 token store — Redis 또는 Supabase `kiwoom_tokens` (M6 보완)
- **F-12** 자동조회 출처 라벨링 (결과 카드 "키움 자동조회 YYYY-MM-DD") — 회계 감사 추적성 (m4 보완)
- **F-13** 증자·합병 1개월 내 발생 시 기간 조정 (상증령 §52의2②) — v3 L-6 분리
- **F-14** K-OTC 등록 비상장주식 시세 출처 통합 (`marketType === "unlisted"` 자동조회) — v3 §4.3.4 분리
- **D-1** (mini-PR / 본 PR D-1 sub-task) `§163⑨` 인용 → `§99①3` 정정 — v3 §4.3.5

---

## 12. 완료 보고 전 자가 점검 (Do 종료 시)

- [ ] KoreanLaw MCP §163⑨ + §99①3 위임 체인 본문 캐시 + 인용 주석 정확 (§82 오기 회피)
- [ ] `lib/kiwoom/*` 모든 파일 800줄 이하
- [ ] `.env.example` 추가, 실키 미커밋 (git diff 확인)
- [ ] Rate limit token bucket anchor PASS (K-RATE-01)
- [ ] 거래일 캘린더 anchor PASS (K-CAL-01·K-CAL-02)
- [ ] 평균 산식 anchor PASS (K-AVG-01)
- [ ] 거래정지 자동 차단 anchor PASS (K-HALT-01)
- [ ] useEffect → store 미러링 0건(grep `useEffect.*setForm\|onChange`)
- [ ] 자동 fallback 채움 0건(거래정지·미상장 시 빈칸 유지 + 사용자 안내)
- [ ] enum substring 매칭 0건(`marketType.includes("KOSPI")` 금지 — exact 비교)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/kiwoom/ __tests__/tax-engine/stock-transfer/` 전체 PASS
- [ ] 브라우저 수동 확인 (자동완성 → 자동조회 → 31-슬롯 → 평균) 또는 미수행 명시
- [ ] `ui-engine-sync-checker` 호출 → ①~③ 신규 필드(stockCode·marketType) 동기화 확인

---

## 13. 출처

### 13.1 일반

- 키움증권 OpenAPI 가이드: <https://openapi.kiwoom.com/guide/apiguide> (Do 진입 전 WebFetch 캐시 필수 — C2)
- 본 프로젝트 메모리: `MEMORY.md` 인덱스 stock-transfer 섹션 + `project_stock_transfer_post_listing_pdf_replica.md`
- 기존 컴포넌트: `components/calc/stock-transfer/TransferDate1MonthClosingPriceTable.tsx` (170줄) · `SecurityMetadataBlock.tsx`
- 기존 store: `lib/stores/calc-wizard-stock-store.ts:80,86,337,342` (`securityName`·`marketType` 기존 / `stockCode` 신규)
- 페르소나 정의: `.claude/agents/kiwoom-api-senior.md`

### 13.2 KoreanLaw 본문 인용 (v3 완료 — m6 게이트 통과)

#### 소득세법 §99 (모법 — MST 285523 / 시행일 2026-04-21)

```
제99조(기준시가의 산정)
① 제100조 및 제114조제7항에 따른 기준시가는 다음 각 호에서 정하는 바에 따른다.
  3. 제94조제1항제3호가목에 따른 주식등(대통령령으로 정하는 주권상장법인의 주식등은
     대통령령으로 정하는 것만 해당한다)
     「상속세 및 증여세법」 제63조제1항제1호가목을 준용하여 평가한 가액. 이 경우
     "평가기준일 이전·이후 각 2개월"은 "양도일·취득일 이전 1개월"로 본다.
  4. 제3호에 따른 대통령령으로 정하는 주권상장법인의 주식등 중 제3호에 해당하지
     아니하는 것과 제94조제1항제3호나목에 따른 주식등
     「상속세 및 증여세법」 제63조제1항제1호나목을 준용하여 평가한 가액. ...
```

#### 소득세법 시행령 §165③ (코스닥·코넥스 적용 + 치환 — MST 285631 / 시행일 2026-04-23)

```
제165조(토지·건물외의 자산의 기준시가 산정)
③ 법 제99조제1항제3호 전단 및 같은 항 제4호 전단에서 "대통령령으로 정하는
   주권상장법인"이란 각각 코스닥시장 또는 코넥스시장에 주권을 상장한 법인을 말하며,
   법 제99조제1항제3호에서 "대통령령으로 정하는 것"이란 「상속세 및 증여세법
   시행령」 제52조의2제3항에 해당하는 것을 말한다. 이 경우 같은 항 중
   "평가기준일 전후 2개월"은 "양도일·취득일 이전 1개월"로 한다.
```

#### 상증령 §52의2 (평균액 산정 본칙 — MST 283637 / 시행일 2026-02-27)

```
제52조의2(유가증권시장 및 코스닥시장에서 거래되는 주식등의 평가)
② 법 제63조제1항제1호가목 본문에서 "대통령령으로 정하는 바에 따라 계산한 기간의
   평균액"이란 다음 각 호의 구분에 따라 계산한 기간의 평균액을 말한다.
   1. 평가기준일 이전에 증자·합병 등의 사유가 발생한 경우에는 동 사유가 발생한
      날의 다음날부터 평가기준일 이후 2월이 되는 날까지의 기간
   2. 평가기준일 이후에 증자·합병 등의 사유가 발생한 경우에는 평가기준일 이전
      2월이 되는 날부터 동 사유가 발생한 날의 전일까지의 기간
   3. 평가기준일 이전·이후에 증자·합병 등의 사유가 발생한 경우에는 ...
③ 법 제60조제1항제1호 및 제63조제1항제1호가목 본문에서 "대통령령으로 정하는
   주식등"이란 각각 평가기준일 전후 2개월 이내에 거래소가 정하는 기준에 따라
   매매거래가 정지되거나 관리종목으로 지정된 기간의 일부 또는 전부가 포함되는
   주식등(... 재정경제부령으로 정하는 경우는 제외)을 제외한 주식등을 말한다.
④ 법 제63조제1항제1호가목 본문에서 "공휴일 등 대통령령으로 정하는 매매가 없는
   날"이란 다음 각 호의 날을 말한다.
   1. 「관공서의 공휴일에 관한 규정」에 따른 공휴일 및 대체공휴일
   2. 토요일
```

#### 소득세법 시행령 §163⑨ (참조 — 본 PR 무관 / v3 정정 근거)

```
제163조(양도자산의 필요경비) ⑨ 상속 또는 증여받은 자산에 대하여 법 §97①1가목을
   적용할 때에는 상속개시일 또는 증여일 현재 「상속세 및 증여세법」 §60~§66의
   규정에 따라 평가한 가액을 취득당시의 실지거래가액으로 본다. ...

→ 상속·증여 자산의 취득가액 산정 조항. 일봉 1개월 평균과 무관.
   기존 컴포넌트 인용은 §99①3로 정정 필요 (§4.3.5 D-1 mini-PR).
```

## 15. v3 변경 이력 (게이트 4건 결과 반영)

| 게이트 | 결과 | 반영 위치 |
|---|---|---|
| C2 키움 REST | ✅ OAuth2 endpoint·요청 필드 확정 (`secretkey` 정정) / TR 상세는 Phase 0.2 캡처 | §3.1.1·§3.1.2·§10.2 |
| m6 KoreanLaw | ✅ §99①3·§165③·§52의2 본문 첨부 + **★ §163⑨ 인용 오류 정정** | §2 (전면 재작성)·§13.2 |
| M4 마운트 위치 | ✅ `PostListingValuationCard.tsx:119` + `transferStdInputMode === "daily"` 확정 | §4.3 (신규 4.3.1~4.3.5) |
| M1 ping anchor | ⏭️ Phase 0.3 이월 (사용자 `.env.local` 키 입력 후 자동 실행) | §10.2 |
| **Phase 0 잔여 3건** | ✅ §10.2 신규로 Do Phase 0 게이트 구조화 (D-1 정정 + TR 캡처 + K-PING-01) | §10.2·§10.3 |

**v3 주요 영향**:
- 본 PR 정확한 법령 근거 = **소득세법 §99①3 → 시행령 §165③ → 상증법 §63①1가목 준용 → 상증령 §52의2**
- 거래일 분모·거래정지 제외 정책 **법령 명시** 확인 (자동 fallback 금지 정책 정합 강화)
- 후속 PR 3건 추가 (F-13 증자·합병 / F-14 K-OTC / D-1 §163⑨ 정정)
- §3.1.1 요청 필드명 `appsecret` → `secretkey` 정정 (Plan v2 추정값 오류)

## 14. v2 변경 이력 (검토 18건 반영)

| ID | 우선순위 | 항목 | 반영 위치 |
|---|---|---|---|
| C1 | Critical | stockCode 신규 필수 필드 + marketType uppercase↔lowercase 변환 | §1.1, §4.1, §5, §7 ①②③, §9 K-MAP-01 |
| C2 | Critical | 키움 REST 사양 WebFetch 게이트 | §3.1, §10.1, §13.1 |
| C3 | Critical | useMemo 자동 트리거 → 명시 버튼 클릭 패턴 | §1.1, §4.1, §4.3, §5 |
| M1 | Major | 모의투자 종가 신뢰성 Pre-Do ping anchor | §3.1, §9 K-PING-01, §10.1 |
| M2 | Major | 종목명 자동완성 분리 → F-10 후속 PR | §1.2, §3.2, §11 F-10 |
| M3 | Major | ka10081 200거래일 + 클라이언트 필터 | §3.2, §5, §9 K-FILTER-01 |
| M4 | Major | 마운트 위치 grep 게이트 + 활성 조건 | §4.3 신규 |
| M5 | Medium | 휴장일 fixture 2020~2026 통일 | §1.1, §4.1, §9 K-CAL-03 |
| M6 | Medium | Vercel 분산 token store → F-11 후속 | §1.2, §3.3, §11 F-11 |
| M7 | Medium | In-flight Map dedup | §3.3, §4.1, §9 K-DEDUP-01 |
| m1 | Minor | Rate limit 3건/sec 일관성 | §9 K-RATE-01 |
| m2 | Minor | modify_pric_tp="1" 기본 | §3.2 |
| m3 | Minor | mock fixture 실호출 캡처 절차 | §3.1, §9.2 |
| m4 | Minor | 출처 라벨링 → F-12 후속 | §1.2, §7 ⑦, §11 F-12 |
| m5 | Minor | 사례 48(§165⑤) 분기 격리 | §6 외부 표 주석 |
| m6 | Minor | KoreanLaw 본문 첨부 게이트 | §2.2, §10.1, §13.2 |
| m7 | Minor | LRU capacity 1,000 | §3.3, §4.1 |
| m8 | Minor | KONEX 휴장일 anchor 검증 필요 | §6 K-03 |

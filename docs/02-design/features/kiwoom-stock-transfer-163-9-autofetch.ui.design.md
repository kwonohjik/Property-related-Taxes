# 키움 자동조회 — §99①3 양도일 직전 1개월 종가 UI 디자인 (v2)

**작성일**: 2026-05-19 (v1 → v2 동일자)
**작성자**: kiwoom-api-senior + stock-transfer-tax-ui-senior 협업
**계획서**: `docs/00-pm/kiwoom-stock-transfer-163-9-autofetch.plan.md`
**엔진 설계**: `kiwoom-api-integration.engine.design.md`
**PDCA 단계**: Design

> ★ v2 self-review 정정 (6건):
> 1. **store 필드 재사용**: `securityCode` 신규 추가 → **기존 `securityCode` 필드 활용** (line 81). ①②③ 변경 영향 대폭 축소
> 2. **본 PR 자동조회 적용 범위 명확화**: KOSPI·KOSDAQ·KONEX **상장 종목 한정**. 비상장(`unlisted`)은 키움 API 미지원 → 자동조회 버튼 disabled "비상장 — 자동조회 미지원, 수동 입력 필요" (K-OTC F-14 후속)
> 3. **시연 케이스 정정**: U-01 = 비상장 (자동조회 미지원, 수동 입력 패턴 보존) / U-03 KOSPI 005930 = 본 PR primary anchor
> 4. **§163⑨ 인용 오류**: 정확한 근거는 **소득세법 §99①3 → 시행령 §165③ → 상증법 §63①1가목 준용 → 상증령 §52의2**
> 5. **신규 store 필드 축소**: `kiwoomTradingHalt`·`kiwoomLastFetchedAt` 2개만 (자동조회 메타). securityCode는 기존 필드
> 6. **환경변수 graceful**: `KIWOOM_APP_KEY` 미설정 시 Route Handler 503 + UI "키움 API 미설정 — 수동 입력 모드만 사용 가능" 안내 카드

---

## 1. 사용자 시나리오 (9단계)

이미지 25·26: 비상장 종목 "일반비상장법인" (사용자 식별자: 49번), 양도일 2023-02-16 (양도일 직전 1개월 분모 = 2023-01-17 ~ 2023-02-16).

| 단계 | 사용자 행동 | UI 반응 |
|---|---|---|
| 1 | Step1 → 종목 1 카드 → 시장 토글 **"비상장"** 선택 | `marketType: "unlisted"` |
| 2 | 종목명 "일반비상장법인" 입력 | `securityName` 저장 (기존 필드) |
| 3 | **종목코드 6자리** 입력 (예: "005930") + Blur | `securityCode` 저장 (기존 store 필드 line 81 활용 — 신규 추가 없음). ka10001 1회 호출 → `marketType`·`tradingHalt` mirror. 비상장 종목이면 응답 거부 → "비상장 종목 — 자동조회 미지원, 수동 입력 필요" 안내 |
| 4 | Step3 비상장 환산 분기 → `unlistedDetailMode = "full"` (전체 환산) | PostListingValuationCard 펼침 |
| 5 | `transferStdInputMode` 라디오 → **"일자별 입력"** (`daily`) 선택 | 31-슬롯 표 (`TransferDate1MonthClosingPriceTable`) 표시 + 자동조회 버튼 표시 |
| 6 | 양도일 2023-02-16 확정 | 자동조회 버튼 활성화 조건 검사 (securityCode·transferDate·marketType·tradingHalt) |
| 7 | **"🔍 키움 자동조회"** 버튼 클릭 | API `POST /api/kiwoom/transfer-1month` 호출. 로딩 spinner. dedup Map 키 확인 |
| 8 | 응답 도착 | 31-슬롯 자동 채움 (거래일 종가 + 휴일 라벨). 평균 자동 산정 → `transferDatePriceAvg1Month` mirror |
| 9 | "계산" 실행 → 결과 화면 | 평균값이 §99①3 환산 분모로 사용 |

### 1.1 변형 시나리오

| 분기 | 처리 |
|---|---|
| 상장 종목(KOSPI·KOSDAQ·KONEX) 사용자가 비상장 모드로 입력 | ka10001 응답 mket_id → marketType 자동 정정 + 안내 "상장 종목 — 본 평가는 비상장 환산 분기 전용" |
| 거래정지 종목 | 자동조회 버튼 disabled + amber 안내 카드 "거래정지 종목 — 수동 입력 권장 (상증령 §52의2③)" |
| IPO 후 1개월 미만 | 응답 거래일 수 < 정상 → 자동 채움 + 결과 카드 분모 부족 경고 |
| Rate limit 도달 | 4회 재시도 실패 시 "키움 시세 서버 지연 — 잠시 후 재시도 또는 수동 입력" |

---

## 2. 케이스 인벤토리 표 (v2 정정 — primary anchor 변경)

| # | 케이스 | marketType | securityCode | transferDate | tradingHalt | UI 분기 | 본 작업 |
|---|---|---|---|---|---|---|---|
| U-01 ★ | KOSPI 상장 + per_date + 자동조회 정상 | kospi | "005930" | 2024-06-03 | false | 자동조회 활성 | ★ primary anchor |
| U-02 | KOSDAQ + per_date + 자동조회 + 어린이날 휴장 | kosdaq | "086520" | 2024-05-07 | false | 휴장일 자동 제외 | anchor |
| U-03 | KONEX + per_date + 자동조회 | konex | "217620" | 2024-04-01 | false | 활성화 | anchor |
| U-04 | 비상장 + per_date + 수동 입력 (이미지 26 시나리오) | unlisted | "" or 임의 | 2023-02-16 | — | **자동조회 버튼 disabled "비상장 — 자동조회 미지원"** + 31-슬롯 수동 입력 가능 | 회귀 보호 |
| U-05 | 거래정지 종목 (상증령 §52의2③) | * | 6자리 | * | true | 버튼 disabled + amber 안내 카드 | 차단 anchor |
| U-06 | securityCode 미입력 + 자동조회 시도 | * | "" | * | * | 버튼 disabled "종목코드 6자리 입력 필요" | 차단 anchor |
| U-07 | 양도일 미입력 + 자동조회 시도 | * | "005930" | null | * | 버튼 disabled "양도일 입력 필요" | 차단 anchor |
| U-08 | direct 모드 (1주당 평균 단일 입력) | * | * | * | * | 자동조회 버튼 미노출 (`transferStdInputMode !== "daily"`) + 기존 CurrencyInput만 | 회귀 보호 |
| U-09 | 환경변수 미설정 (KIWOOM_APP_KEY 빈값) | * | * | * | * | 버튼 클릭 시 503 응답 → UI "키움 API 미설정 — 수동 입력 모드만 가능" 안내 | 차단 anchor |
| U-10 | IPO 후 1개월 미만 (분모 부족) | * | 신규상장 | * | false | 자동조회는 가능 but 분모 < 정상 → 결과 카드 경고 (자동 보정 금지) | 분모 부족 anchor |

> **U-01이 Do primary anchor (KOSPI 005930)**. 이미지 26의 "일반비상장법인" 시나리오는 U-04 회귀 보호 (자동조회 미지원, 수동 입력 모드 유지). 비상장 자동 시세 출처는 F-14 후속 PR (K-OTC 등).

---

## 3. 폼 상태 타입 변경 명세 (① 폼 상태 타입) — v2 정정

### 3.1 기존 필드 재사용 + 신규 2 필드만 추가

**위치**: `lib/stores/calc-wizard-stock-store.ts`

```ts
// ── 기존 필드 (변경 없음 — grep 확인 완료) ──
securityName: string;            // line 80 — 종목명 (필수, 빈문자=검증 오류)
securityCode: string;            // line 81 — ★ 종목코드 (기존 "선택" 필드 자동조회 트리거로 재활용)
marketType: "kospi" | "kosdaq" | "konex" | "unlisted" | "other_asset" | "";  // line 86

// ── 신규 추가 2 필드 ──
kiwoomTradingHalt: boolean;      // ka10001 응답 mirror — true 시 자동조회 차단 (상증령 §52의2③)
kiwoomLastFetchedAt: string;     // 마지막 자동조회 ISO 시각 (F-12 후속 라벨링 활용 — 본 PR은 저장만)
```

> **v1 정정**: `securityCode` 신규 추가 → `securityCode` 기존 필드 재활용. ①②③ 변경 영향 대폭 축소 (3 필드 → 2 필드).

### 3.2 initial value (②)

```ts
// lib/stores/calc-wizard-stock-store.ts 내 INITIAL_STOCK_FORM 또는 동등 factory (line 337+)
{
  ...
  securityCode: "",          // 기존 default 그대로 (변경 없음)
  kiwoomTradingHalt: false,  // ★ 신규
  kiwoomLastFetchedAt: "",   // ★ 신규
}
```

### 3.3 normalize (③) — `lib/stores/calc-wizard-stock-normalize.ts`

```ts
// securityCode는 기존 normalize 그대로 (변경 없음)
kiwoomTradingHalt: typeof raw.kiwoomTradingHalt === "boolean" ? raw.kiwoomTradingHalt : false,
kiwoomLastFetchedAt: typeof raw.kiwoomLastFetchedAt === "string" ? raw.kiwoomLastFetchedAt : "",
```

**3중 패턴 강제** (`feedback_store_default_vs_ui_display_fallback`):
- factory default `false` / `""`
- normalize 타입 가드
- UI 직접 사용 (display fallback 없음)

---

## 4. UI 위젯 명세 (⑤)

### 4.1 SecurityMetadataBlock — securityCode 필드 추가

**위치**: `components/calc/stock-transfer/SecurityMetadataBlock.tsx`

```tsx
{/* 종목명 / 종목코드 — 한 행 좌·우 배치 (기존 라인 142 그대로) */}
<FieldCard label="종목명" required>
  <input ... value={form.securityName} ... />
</FieldCard>

<FieldCard
  label="종목코드"
  hint="6자리 숫자. 입력 시 키움 자동조회로 시장구분·거래정지 정보 자동 확인"
  trailing={fetchingMeta && <Spinner />}
>
  <input
    type="text"
    inputMode="numeric"
    maxLength={6}
    pattern="\d{6}"
    value={form.securityCode}
    onChange={(e) => onChange({ securityCode: e.target.value.replace(/\D/g, "") })}
    onBlur={async () => {
      if (form.securityCode.length !== 6) return;
      // ★ useEffect 금지 — onBlur 핸들러 내 직접 호출
      try {
        setFetchingMeta(true);
        const meta = await fetch(`/api/kiwoom/search`, {
          method: "POST",
          body: JSON.stringify({ securityCode: form.securityCode }),
        }).then(r => r.json());
        onChange({
          securityName: meta.stockName,
          marketType: meta.marketType,
          kiwoomTradingHalt: meta.tradingHalt,
        });
      } catch (e) {
        setFetchError(e.message);
      } finally {
        setFetchingMeta(false);
      }
    }}
    placeholder="6자리 종목코드"
  />
</FieldCard>
```

### 4.2 KiwoomAutoFetchButton — 신규 컴포넌트

**위치**: `components/calc/stock-transfer/KiwoomAutoFetchButton.tsx` (신규, ~100줄)

```tsx
type Props = {
  securityCode: string;
  transferDate: Date | null;
  marketType: MarketType;
  tradingHalt: boolean;
  onFill: (result: {
    dates: string[];              // 31-슬롯
    closings: (number | null)[];  // 거래일만 number
    avg: number;
    fetchedAt: string;
  }) => void;
};

// 활성화 조건 (Plan §4.3.4 그대로):
const canFetch =
  /^\d{6}$/.test(securityCode) &&
  transferDate !== null &&
  ["kospi", "kosdaq", "konex", "unlisted"].includes(marketType) &&
  !tradingHalt;

const disabledReason =
  !/^\d{6}$/.test(securityCode) ? "종목코드 6자리 입력 필요" :
  !transferDate ? "양도일 입력 필요" :
  !["kospi", "kosdaq", "konex", "unlisted"].includes(marketType) ? "지원 시장 아님" :
  tradingHalt ? "거래정지 종목 — 수동 입력 권장" :
  null;

// 버튼 + 결과 미리보기 카드 (sky tone, ToggleCard 패턴 차용 안 함 — 액션 버튼)
<button
  type="button"
  disabled={!canFetch || loading}
  onClick={async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kiwoom/transfer-1month`, {
        method: "POST",
        body: JSON.stringify({ securityCode, transferDate: toISOString(transferDate) }),
      }).then(r => r.json());
      onFill({
        dates: res.slots.map(s => s.date),
        closings: res.slots.map(s => s.close),
        avg: res.average,
        fetchedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }}
  className="..."
>
  {loading ? "🔄 자동조회 중..." : "🔍 키움 자동조회"}
</button>
```

### 4.3 마운트 위치 (Plan §4.3 그대로)

**위치**: `components/calc/stock-transfer/PostListingValuationCard.tsx:119`

```tsx
{/* daily 모드 — 일자별 종가표 + 자동 평균 mirror */}
{form.transferStdInputMode === "daily" && (
  <>
    {/* ★ 신규 — Phase 1 자동조회 버튼 */}
    <KiwoomAutoFetchButton
      securityCode={form.securityCode}
      transferDate={form.transferDate}
      marketType={form.marketType}
      tradingHalt={form.kiwoomTradingHalt}
      onFill={({ dates, closings, avg, fetchedAt }) => {
        onChange({
          transferPriceDates: dates,
          transferPriceClosing: closings.map(c => c?.toString() ?? ""),
          transferDatePriceAvg1Month: avg.toString(),
          kiwoomLastFetchedAt: fetchedAt,
        });
      }}
    />
    <TransferDate1MonthClosingPriceTable form={form} onChange={onChange} />
    {form.transferDatePriceAvg1Month && parseAmount(form.transferDatePriceAvg1Month) > 0 && (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 px-4 py-3 text-sm">
        <p className="text-emerald-800">
          자동 산정 평균 = <strong>{parseAmount(form.transferDatePriceAvg1Month).toLocaleString()}</strong>{" "}
          → §99①3 환산 분모로 사용 (소령 §165③ 준용)
          {/* ★ §163⑨ → §99①3 정정 (D-1 mini-PR) */}
        </p>
      </div>
    )}
  </>
)}
```

### 4.4 거래정지 안내 카드 (amber tone)

securityCode Blur → ka10001 응답 `tradingHalt: true` 도착 시 SecurityMetadataBlock 아래 amber 카드 표시:

```tsx
{form.kiwoomTradingHalt && (
  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
    <p className="text-amber-900 font-semibold">⚠️ 거래정지 종목</p>
    <p className="text-amber-800 mt-1">
      상속세 및 증여세법 시행령 §52의2③에 따라 매매거래가 정지된 기간이 포함된
      주식은 본 평가에서 제외됩니다. 31-슬롯 종가를 수동으로 입력해 주세요.
    </p>
  </div>
)}
```

---

## 5. 사이드바 합계 (⑥)

**변경 없음**. 시세 자체는 사이드바 미노출. 평균값(`transferDatePriceAvg1Month`)이 §99①3 환산 분모로 사용된 후 양도가액·취득가액 합계는 기존 selector로 자동 반영.

---

## 6. 결과 카드 (⑦)

**변경 없음**. 기존 PostListingValuationCard 산식 그대로 사용. 출처 라벨 "키움 자동조회 (2024-06-03 09:15)"는 F-12 후속 PR로 분리 (Plan §11 그대로).

단, **D-1 mini-PR 정정** 동반:
- "§163⑨ 환산 분모로 사용" → "§99①3 환산 분모로 사용 (소령 §165③ 준용)"
- 4개 파일 주석·라벨만 정정 — 산식·anchor 변경 0건

---

## 7. Validation (⑧)

**위치**: `lib/calc/stock-transfer-tax-validate.ts`

```ts
// securityCode validation
if (securityCode !== "" && !/^\d{6}$/.test(securityCode)) {
  errors.securityCode = "종목코드는 6자리 숫자여야 합니다.";
}
// 빈문자 허용 — 자동조회 미사용 (수동 입력) 모드 정합
```

**3중 패턴 강제**:
- UI 통과 (빈문자 허용) ↔ validate 통과 (빈문자 허용) ↔ API body 미전송 (engine 미사용) 모두 일치
- `transferDatePriceAvg1Month` 검증은 기존 그대로 (자동조회·수동 입력 결과 동일 필드 사용)

---

## 8. API 변환 (④) 및 Route Handler (⑨~⑭)

| # | 지점 | 본 PR 변경 |
|---|---|---|
| ④ | `lib/calc/stock-transfer-tax-api.ts` | ❌ 변경 없음 (securityCode·kiwoomTradingHalt·kiwoomLastFetchedAt은 엔진 미전송 UI 메타) |
| ⑨⑩⑪⑫⑬⑭ | Zod 스키마·Route handler | ❌ 변경 없음 (엔진 input 동일) |

신규 API: `/api/kiwoom/search` + `/api/kiwoom/transfer-1month` (별도 도메인, 세금 엔진 무관).

---

## 9. 14개 동기화 지점 종합 표

| # | 지점 | 본 PR 변경 |
|---|---|---|
| ① | 폼 상태 타입 | ✅ kiwoomTradingHalt + kiwoomLastFetchedAt **2 필드만** 추가 (securityCode는 기존 line 81 활용) |
| ② | initial value | ✅ "" / false / "" |
| ③ | normalize | ✅ sessionStorage 마이그 호환 |
| ④ | API 변환 | ❌ |
| ⑤ | UI 위젯 | ✅ SecurityMetadataBlock(securityCode) + KiwoomAutoFetchButton 신규 + PostListingValuationCard:119 마운트 |
| ⑥ | 사이드바 합계 | ❌ |
| ⑦ | 결과 카드 | ❌ (D-1 정정만) |
| ⑧ | Validation | ✅ securityCode 6자리 검증 (빈문자 허용) |
| ⑨~⑭ | Zod·Route handler | ❌ |

---

## 10. 메모리 정책 준수 자가 점검

- [x] `feedback_korean_law_82_vs_81_2_drift` — KoreanLaw MCP §99·§165·§52의2 본문 검증 완료. ★ §163⑨ 인용 오류 발견·정정 계획 수립 (D-1 mini-PR)
- [x] `feedback_no_silent_apportion_fallback` — 거래정지·IPO 미만 시 자동 보정 금지, 수동 입력 허용
- [x] `feedback_useeffect_store_mirror_forbidden` — onBlur 핸들러·onClick 핸들러 내 직접 onChange. useEffect → store 미러링 0건
- [x] `feedback_validation_sync_8th_point` — securityCode 빈문자 허용 정책 UI/API/validate 3 layer 일치
- [x] `feedback_store_default_vs_ui_display_fallback` — factory default `""` = normalize 빈문자 처리 = UI 직접 사용 (display fallback 없음)
- [x] `feedback_ui_input_path_enumeration` — 8행 케이스 매트릭스 U-01~U-08 enumerate
- [x] `feedback_pdca_session_efficiency` — D-1 mini-PR 분리, 후속 PR 14건 사전 도출 (Plan §11)
- [x] `feedback_pre_anchor_verification` — Phase 0.3 K-PING-01 + K-MAP-01·K-DEDUP-01·K-FILTER-01 Pre-Do 우선 anchor

---

## 11. Do 진입 게이트 (Plan §10.2 Phase 0 동기)

본 UI 설계는 다음 Phase 0 완료 후 Phase 1 진입:

- [ ] Phase 0.1 D-1 §163⑨ → §99①3 인용 정정 (선행 가능 / 키 무관)
- [ ] Phase 0.2 TR 상세 사양 캡처 (사용자 협조 또는 K-PING-01 실응답 역추론)
- [ ] Phase 0.3 K-PING-01 모의투자 ping anchor PASS (사용자 `.env.local` 키 입력 후)

Phase 1 진입 직후 본 UI 디자인 §3~§7 그대로 구현.

---

## 12. 후속 PR (UI 측면 추가)

- F-10 종목명 자동완성 다건 후보 — `KiwoomStockLookup.tsx` 신규 컴포넌트 (debounce + dropdown)
- F-12 자동조회 출처 라벨링 — 결과 카드에 `kiwoomLastFetchedAt` 표시 ("키움 자동조회 2024-06-03 09:15")
- F-14 K-OTC 비상장 자동조회 — 별도 시세 출처 통합 시 KiwoomAutoFetchButton 분기 추가

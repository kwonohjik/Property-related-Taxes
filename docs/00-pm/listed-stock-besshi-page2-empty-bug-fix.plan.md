# 상장주식 평가조서(을) 빈 표 버그 수정 계획서

> **증상** (이미지 11): 키움 자동조회 성공 + 갑지 ⑨ 평균 61,532 정상 표시 + 자동조회 결과 카드에 일자별 종가 1,124일 모두 정상 표시. 그런데 **평가조서(을) 표는 헤더만 있고 NO/월일/종가 행 0개, 소계 0, 일수 0, 종가합계 0, 종가평균 0**.
>
> **요청**: 버그 수정 계획서 작성.

---

## 1. 원인 분석 — Stale Closure 덮어쓰기

### 1-1. 실측 흐름 (file:line)

`components/calc/KiwoomValuationAutoFetchButton.tsx:104-117`:
```ts
if (onResponse) {
  onResponse({ stockCode, stockName: data.stockName, valuationDate,
    slotDates, closingPrices, weekendLabels, tradingDays, sum, average });
}
onFill(patch);  // ★ onResponse 직후 동기 호출
```

`components/calc/StockValuationForm.tsx ListedStockEditor`:
```ts
const set = (patch: Partial<EstateItem>) => onUpdate({ ...item, ...patch });
// ...
<KiwoomValuationAutoFetchButton
  onResponse={(response) => {
    const adapter = applyKiwoomValuationResponse(response, {...});
    set({
      listedStockAvgPrice: adapter.listedStockAvgPrice,
      listedStockDailyGroupsInput: adapter.listedStockDailyGroupsInput, // ✅ channel-fill
      ...(adapter.companyName ? { companyName: adapter.companyName } : {}),
    });
  }}
  onFill={(patch) => {
    if (!item.listedStockDailyGroupsInput) {
      set({
        listedStockAvgPrice: patch.listedStockAvgPrice,
        ...(patch.stockName ? { name: patch.stockName } : {}),
      });
    }
  }}
/>
```

### 1-2. 버그 시퀀스 (동기 같은 사이클)

1. `onResponse` 콜백 호출
   - `set({ listedStockAvgPrice, listedStockDailyGroupsInput, companyName })`
   - 내부: `onUpdate({ ...item /* 자동조회 전 item */, ...patch })`
   - 부모 상태 갱신은 **다음 렌더에서 props 반영** (React state batching)
2. **같은 동기 콜백 안에서** `onFill(patch)` 호출
   - `if (!item.listedStockDailyGroupsInput)` — `item`은 **현재 렌더 클로저**, 1번에서 패치한 결과가 아직 props로 안 들어옴 → 여전히 undefined → **true 분기**
   - `set({ listedStockAvgPrice, ...(name) })`
   - 내부: `onUpdate({ ...item /* stale, listedStockDailyGroupsInput 없음 */, ...patch })`
3. **결과**: 부모 onUpdate가 2번 호출되어 마지막(2번)이 우선 — `listedStockDailyGroupsInput` 누락 상태로 저장

### 1-3. 갑지 ⑨가 정상이고 을지만 비는 이유

- 1번·2번 모두 `listedStockAvgPrice`를 patch에 포함 → 평균가는 양쪽 set 모두 동일 값을 씀 (덮어쓰기 무해)
- `listedStockDailyGroupsInput`는 1번에만 있음 → 2번에서 stale item으로 머지되며 **사라짐**

`evaluateListedStock`의 `besshiData.page2 = item.listedStockDailyGroupsInput ?? EMPTY_LISTED_STOCK_MONTH_GROUPS` (lib/tax-engine/property-valuation-stock.ts:241) → EMPTY 폴백 → 표 빈 상태.

### 1-4. PreviewCard·결과뷰 모두 동일 증상

`ListedStockBesshiPreviewCard` 와 `ListedStockBesshiResultSection` 둘 다 `evaluateListedStock(item, { valuationDate })` 결과의 `besshiData.page2`를 사용 → 같은 EMPTY 폴백.

---

## 2. 수정 방안 (3 옵션 비교)

| # | 방안 | 변경 범위 | 부수 영향 |
|---|---|---|---|
| A | **KiwoomValuationAutoFetchButton에서 `onResponse` 제공 시 `onFill` 호출 skip** | button 내부 1줄 분기 | 0 (다른 호출자는 onResponse 미전달이므로 기존 동작 유지) |
| B | ListedStockEditor의 `onFill`을 빈 함수로 변경 + `onResponse`가 모든 patch 책임 | StockValuationForm L155-163 | onFill prop이 button에서 required이므로 noop 전달 필요 |
| C | `set`을 functional update로 (`onUpdate((prev) => ({...prev, ...patch}))`) | onUpdate 시그니처 변경 (광범위 — 다수 호출자) | 0 보장 어려움 |

**채택**: **A** — 가장 국소적, 회귀 위험 0, 의미 명확.

### 2-1. 변경 패치 (방안 A)

`components/calc/KiwoomValuationAutoFetchButton.tsx:117`:
```ts
// 기존
onFill(patch);

// 변경 후
if (!onResponse) {
  // onResponse가 있으면 호출자가 모든 patch를 책임 (avgPrice + dailyGroups + companyName).
  // 같은 동기 사이클에서 onResponse·onFill 두 번 호출 시 stale closure 덮어쓰기 발생 →
  // listedStockDailyGroupsInput 등 일부 patch 소실.
  onFill(patch);
}
```

기존 호출자(`onFill`만 전달, `onResponse` 미전달) — 영향 0 (분기 false, onFill 그대로 호출).
새 호출자(`onResponse` 사용) — onFill 호출 skip, onResponse가 단일 진실로 모든 patch 수행.

### 2-2. ListedStockEditor onFill 제거 + button props `onFill` optional

**버튼 호출자 실측**: `grep -rn "KiwoomValuationAutoFetchButton" components app` 결과 **StockValuationForm 1곳뿐** (`StockValuationForm.tsx:109`). 따라서 `onFill`을 optional로 변경해도 다른 회귀 0.

**패치 ① — `KiwoomValuationAutoFetchButton.tsx`**:
```diff
 interface Props {
   stockCode: string;
   valuationDate: string;
-  onFill: (patch: { listedStockAvgPrice: number; stockName?: string }) => void;
+  onFill?: (patch: { listedStockAvgPrice: number; stockName?: string }) => void;
   onResponse?: (response: KiwoomValuation2MonthResponse) => void;
   startOverrideDate?: string;
   syncName?: boolean;
 }
```

```diff
       if (onResponse) {
         onResponse({ stockCode, stockName: data.stockName, valuationDate, ... });
       }
-      onFill(patch);
+      // onResponse가 있으면 호출자가 모든 patch를 책임 — stale closure 덮어쓰기 방지
+      if (onFill && !onResponse) {
+        onFill(patch);
+      }
```

**패치 ② — `StockValuationForm.tsx ListedStockEditor`**: onFill prop 전체 제거. onResponse만 전달.
```diff
       <KiwoomValuationAutoFetchButton
         stockCode={item.listedStockCode}
         valuationDate={valuationDate}
         syncName
         startOverrideDate={resolveStartOverrideDate(item, valuationDate)}
         onResponse={(response) => {
           const adapter = applyKiwoomValuationResponse(response, {...});
           set({
             listedStockAvgPrice: adapter.listedStockAvgPrice,
             listedStockDailyGroupsInput: adapter.listedStockDailyGroupsInput,
             ...(adapter.companyName ? { companyName: adapter.companyName } : {}),
           });
         }}
-        onFill={(patch) => {
-          if (!item.listedStockDailyGroupsInput) {
-            set({ listedStockAvgPrice: patch.listedStockAvgPrice, ...(patch.stockName ? { name: patch.stockName } : {}) });
-          }
-        }}
       />
```

---

## 3. 검증 / anchor

### 3-1. 단위 anchor (신규)
`__tests__/components/calc/KiwoomValuationAutoFetchButton.test.tsx` (신규):
- T-1: `onResponse` 만 전달 → 응답 도착 시 onResponse 1회 호출, onFill은 호출 안 됨 (verify via mock)
- T-2: `onFill` 만 전달 → 기존 동작 유지 (onFill 호출)
- T-3: `onResponse`·`onFill` 동시 전달 → onResponse만 호출, onFill 호출 0건 (회귀 가드)

**mock 패턴** (vitest jsdom):
```ts
import { vi, afterEach } from "vitest";

beforeEach(() => {
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      average: 8452, tradingDays: 84, sum: 710030, stockName: "테스트",
      slotDates: ["2022-07-06"], closingPrices: [8452], weekendLabels: [""],
    }),
  } as Response);
});
afterEach(() => { vi.restoreAllMocks(); cleanup(); });
```
- 버튼 click → `await waitFor(() => expect(onResponseSpy).toHaveBeenCalled())`
- `expect(onFillSpy).not.toHaveBeenCalled()` (T-1·T-3)

### 3-2. 통합 anchor (신규)
`__tests__/components/calc/inheritance/listed-stock-channel-fill.test.tsx` (신규):
- 시나리오: `ListedStockEditor` mount → 키움 자동조회 mock fetch → onResponse 콜백 검증
- mock fetch 응답에 `slotDates`·`closingPrices`·`weekendLabels` 포함
- onUpdate spy 마지막 호출 인자에 `listedStockDailyGroupsInput.beforeM1.length > 0` 확인

### 3-3. E2E anchor 확장 (`e2e/listed-stock-besshi.spec.ts`)
- LS-E2E-2 신규: 자동조회 → 미리보기 토글 펼침 → `ls-besshi-p2-tradingDays.textContent !== "0"` 검증
- **키움 API 의존 분기 정책**:
  - dev server에 `KIWOOM_APP_KEY` + `KIWOOM_APP_SECRET` 환경변수 설정된 경우만 실행
  - 미설정 시 `/api/kiwoom/valuation-2month` 가 503 응답 → button error 표시 → 본 spec `test.skip` 분기
  - spec 시작에서 종목코드 입력 후 자동조회 버튼 클릭 → 응답 503이면 `test.skip("KIWOOM_APP_KEY not configured")`

### 3-4. 회귀 가드
- 기존 `ListedStockBesshiAttributesSection`·`ListedStockBesshiPreviewCard`·`ListedStockBesshiPdfDownloadButton` 무변경
- `applyKiwoomValuationResponse` 어댑터 무변경
- 비상장·다른 `KiwoomValuationAutoFetchButton` 호출자 — `onResponse` 미전달 → 분기 false → 기존 동작 유지

---

## 4. 단계 분할 (1 커밋 — 단일 fix)

| Phase | 내용 |
|---|---|
| Phase 1 | `KiwoomValuationAutoFetchButton` props.onFill optional + onResponse 우선 분기 |
| Phase 2 | `StockValuationForm ListedStockEditor` onFill prop 제거 (onResponse만) |
| Phase 3 | 단위 + 통합 anchor 신규 |
| Phase 4 | tsc·npm test·playwright 회귀 0 확인 |

**완료 게이트**:
- [ ] `npx tsc --noEmit` 0건
- [ ] `npm test` 회귀 0
- [ ] `npx playwright test e2e/listed-stock-besshi.spec.ts` 통과
- [ ] **사용자 시나리오 재현**: 상장주식 자산 추가 → 종목코드 005930 + 평가기준일 → 자동조회 → 미리보기 펼침 → **을지 표 거래일 ≠ 0** 확인

---

## 5. 정책 cross-link

- **stale closure 패턴**: React 컴포넌트에서 같은 동기 콜백 안에서 동일 state setter를 두 번 호출 + 두 번째가 첫 번째의 patch를 무시할 경우, **functional updater 사용** 또는 **두 번째 호출 제거**.
- [[mirror-pattern]] — useEffect store mirror 금지 정책은 본 fix와 무관 (직접 patch 흐름의 stale closure 버그)
- [[feedback_numeric_impact_verify_before_bug_claim]] — 본 버그는 numeric 결과(평가액)에는 영향 없음 (avgPrice 동일하게 덮어씀). 영향은 **을지 표 표시만** — 충실도 vs numeric 정확히 분리.
- [[echo-field-pattern]] — `listedStockDailyGroupsInput`는 자동조회 응답 echo 캐시. 본 fix는 echo 채널의 안전한 channel-fill 보장.

---

## 6. 후속 / 비고

- 사전 검증으로 strip 가능성 사전 배제 (실측 grep 완료):
  - ✅ zustand `partialize` (lib/stores/calc-wizard-store.ts:259) — `formData` 통째로 저장. strip 없음.
  - ✅ Zod `listedStockItemSchema` (lib/validators/property-valuation-input.ts:230) — `listedStockDailyGroupsInput` 등록.
  - ✅ API 변환 — EstateItem spread 패턴 (필드 명시 매핑 없음).
- 만약 본 fix 후에도 표가 비면 추가 조사 항목 (모두 가능성 낮음):
  - **React 19 자동 batching 차이**: 같은 콜백 안 두 setState가 합쳐지지만 patch는 마지막만 우선 — 본 fix는 두 번째 set 자체를 호출 안 하므로 영향 0.
  - **PreviewCard useMemo 의존성**: `[item, valuationDate, canPreview]` — item이 새 reference면 재계산 OK. (확인 끝)
  - **자동조회 응답 형식 차이**: `applyKiwoomValuationResponse` 어댑터가 빈 array 반환할 경우 — 키움 응답 검증 anchor에서 적발 가능.
- 본 fix는 **입력 폼 → store** 흐름의 버그만 해결. **store → API 직렬화** 또는 **history 저장 시 strip** 같은 후속 버그는 별도 조사 (현재 분석에서 강제 strip 위험 없음을 확인).

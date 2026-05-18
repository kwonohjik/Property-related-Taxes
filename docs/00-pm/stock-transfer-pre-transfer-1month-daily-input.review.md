# Plan Review Iterations — 4차례 검토 발견 사항 통합

> Sibling of `stock-transfer-pre-transfer-1month-daily-input.plan.md` · 800줄 정책 회피로 분리.
> Plan 본문(§1~9)에서 본 문서를 참조.

총 4차례 검토 + cross-reference로 **36건 보정**:
- 1차 (E-1~E-12): 이미지 26 코드 비교 검토
- 2차 (E-13~E-20): 정합성·UX
- 3차 (E-21~E-28): Zod·echo·anchor·정책
- Engine/UI design 점검 (E-29~E-31)
- 4차 (X-1~X-5): Plan ↔ Engine design ↔ UI design cross-reference

---

## 부록 — 이미지 26 코드(`PostListingClosingPriceTable.tsx`) 비교 검토 결과

12건 오류·누락·모순 발견·보정:

### E-1 일자 산식 endpoints 비대칭

기존 `autoFillDates(listingDate)`:
```ts
const start = listingDate;                  // 포함
const endExclusive = listingDate + 1 month;
const end = endExclusive - 1 day;            // 포함
// → [listingDate, listingDate + 1mo - 1day], 양 끝 포함 31일
```

계획서 권장 `preTransferAutoFillDates(transferDate)`:
- `[transferDate - 1 month, transferDate - 1 day]` ★ 정확한 산식 명시 누락

**확정 산식** (대칭 원칙 — 양도일 미포함 / 1개월 전 같은 일자 포함):
```ts
export function preTransferAutoFillDates(transferDate: string): string[] {
  if (!transferDate || !/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) return [];
  const [y, m, d] = transferDate.split("-").map(Number);
  const endExclusive = new Date(Date.UTC(y, m - 1, d)); // transferDate 자체 (미포함)
  endExclusive.setUTCDate(endExclusive.getUTCDate() - 1); // transferDate - 1day (포함)
  const start = new Date(Date.UTC(y, m - 2, d)); // transferDate - 1 month (포함)
  // 일자 overflow JS 자동 보정 (예: 3-31 - 1mo → 2-31 → 3-3 → -1day → 3-2)
  const out: string[] = [];
  for (let cur = new Date(start); cur <= endExclusive; cur.setUTCDate(cur.getUTCDate() + 1)) {
    out.push(fmtDate(cur));
  }
  return out;
}
// 예: transferDate=2024-06-01 → [2024-05-01, ..., 2024-05-31] (31일)
//     transferDate=2024-03-01 → [2024-02-01, ..., 2024-02-29] (윤년 29일)
```

→ KoreanLaw §99①3·§165⑤ 원문으로 endpoint 확정 의무 (Pre-Do).

### E-2 `dayOfWeek` 헬퍼 재사용 명시 누락

이미 `PostListingClosingPriceTable.tsx:32`에서 `export function dayOfWeek` 됨. 신규 PreTransfer 컴포넌트는 동일 헬퍼 import.
→ 계획서 §4.2.2 명시 보강.

### E-3 `fmtDate` 헬퍼는 module-scope (non-export)

기존 `fmtDate`는 `PostListingClosingPriceTable.tsx` 내부 private. 일반화 시 ClosingPriceTable로 이동 + export.

### E-4 컴포넌트 일반화 책임 분리 정밀화

`ClosingPriceTable`(일반)이 가져야 할 props:

```tsx
interface ClosingPriceTableProps {
  displayDates: string[];                  // 부모가 자동 채움
  closes: string[];                         // store value
  onCloseChange: (idx: number, value: string) => void;
  sectionLabel: string;                     // "상장일 이후 1개월 종가" / "양도일 직전 1개월 종가"
  tone: "emerald" | "amber";                // 색조 분리
  sectionNum?: number;                       // 섹션 번호 배지
  emptyDateMessage: string;                 // 일자 미설정 시 안내
  previewLabel?: string;                    // "1개월 종가평균" 등
}
```

부모(`PostListingClosingPriceTable`·`PreTransferClosingPriceTable`)는 store key 매핑 + autoFillDates 호출 + handleCloseChange 정의 책임.

### E-5 `handleCloseChange` 평균 자동 mirror 패턴 일관성

기존 `PostListingClosingPriceTable.tsx:90-101` 의 `handleCloseChange`:
- `listingPriceClosing[idx] = value`
- 주말 슬롯 강제 zero-out
- `listingPriceDates` 동기화
- **`listingDatePriceAvg1Month`는 mirror하지 않음** → `flat-adapter`에서 후속 합성

신규 `PreTransferClosingPriceTable`은 `transferDatePriceAvg1Month`를 즉시 mirror 권장:

```ts
const handleCloseChange = (idx: number, value: string) => {
  const next = [...form.transferPriceClosing];
  while (next.length < total) next.push("");
  next.length = total;
  for (let i = 0; i < total; i++) {
    const dow = dayOfWeek(displayDates[i]);
    if (dow === 0 || dow === 6) next[i] = "";
  }
  next[idx] = value;

  // ★ 즉시 평균 산정 후 transferDatePriceAvg1Month mirror (onChange 단일 호출)
  const closes = displayDates.map((d, i) => {
    const dow = dayOfWeek(d);
    if (dow === 0 || dow === 6) return 0;
    return parseAmount(next[i] || "0");
  });
  const { avg } = calcMonthlyClosingAverage(displayDates, closes);

  onChange({
    transferPriceClosing: next,
    transferPriceDates: displayDates,
    transferDatePriceAvg1Month: avg > 0 ? String(avg) : "",
  });
};
```

**비대칭 위험 (R-6 신규)**: listing은 adapter 합성, transfer는 UI mirror. 후속 PR로 통일 권장.

### E-6 `handleEnterNext` 일관성

이미지 26 코드의 Enter 키 핸들러(line 80-99)는 컴포넌트 내부. 일반화 시 `ClosingPriceTable`에 통합 + 부모는 미감지.

### E-7 transferDate 미입력 안내

기존 listing 종가표는 `if (!form.listingDate)`로 amber 박스 안내. transfer 종가표도 동일:

```tsx
if (!form.transferDate) {
  return <div className="rounded-lg border border-amber-200 ...">
    양도일을 먼저 입력하세요 (Step 1).
  </div>;
}
```

### E-8 transferDate 변경 시 dates 자동 재계산 + 잔재 zero-out

기존 listing의 `listingDate` 변경 시 `displayDates`가 useMemo로 재계산. `closes` 잔재는 `handleCloseChange`의 `next.length = total`로 잘림 + 주말 슬롯 zero-out.

신규 transfer는 transferDate가 Step 1에 있어 PostListingValuationCard 외부에서 변경됨. **transferDate 변경 시 자동 dates 재계산 + 잔재 처리 명시 필요** — useMemo로 displayDates 도출하되, transferPriceClosing 잔재는 다음 handleCloseChange에서 절사.

★ 또는 transferDate가 변경되는 onChange(예: `Step1.tsx`의 `DateInput`)에서 명시적으로 `transferPriceClosing: []`, `transferPriceDates: []`, `transferDatePriceAvg1Month: ""` 리셋.

### E-9 UTC 기반 자동 채움 의무

기존 listing의 `autoFillDates`는 `new Date(Date.UTC(...))`로 타임존 흔들림 차단. preTransfer도 동일 UTC 패턴 사용 의무.

### E-10 평균 미리보기 표시 — 결과 echo 보강

기존 listing 종가표는 내부에서 거래일·합계·평균 미리보기. 신규 transfer도 동일 미리보기 + 추가로 result.valuationDetail에 echo 필드:

```ts
valuationDetail: {
  ...
  /** daily 모드 사용 여부 */
  transferDailyModeUsed?: boolean;
  /** daily 모드 자동 산정 평균 */
  transferDailyAverage?: number;
}
```

→ 결과 카드에 "양도일 직전 1개월 평균: 8,001 (일자별 21셀 자동 산정)" 표시.

### E-11 sessionStorage 마이그레이션

신규 3 필드(`transferPriceInputMode`·`transferPriceDates`·`transferPriceClosing`):
- `transferPriceInputMode` undefined → "direct" 자동 fallback (기존 동작 보존)
- `transferPriceDates`·`transferPriceClosing` undefined → 빈 배열
- store normalize에 enumField/arrayField 적용 명시.

### E-12 일관성 — `acquisitionDatePriceAvg1Month` daily 모드 미적용

`acquisitionDatePriceAvg1Month`(일반 상장 환산 §163⑨ 직접 분기 — PR fd494a3)에도 동일 daily 모드를 제공해야 일관적. **본 PR 범위 밖** — 후속 PR로 분리.

→ 본 PR은 `transferDatePriceAvg1Month`만 적용. UI에 두 분기(일반 환산 emerald box, 취득 후 상장 amber)가 시각적으로 분리되어 사용자 혼동 없음.

### 보강 anchor (TI-9~12 추가)

| ID | 시나리오 | 검증 |
|---|---|---|
| **TI-9** | transferDate 변경 시 dates 자동 재계산 | 2024-06-01 → 2024-07-01 변경 시 displayDates [5월] → [6월]로 갱신 |
| **TI-10** | preTransferAutoFillDates(2024-03-01) | 2024-02-01 ~ 2024-02-29 (윤년 29일) |
| **TI-11** | mirror 정확성 — daily 평균 = transferDatePriceAvg1Month | 일자별 입력 후 store.transferDatePriceAvg1Month = 평균값 string |
| **TI-12** | direct 모드에서도 transferPriceClosing 빈 배열 유지 (store 분리) | direct 모드 사용 중 store.transferPriceClosing = [] 보장 |

### 리스크 추가

- **R-6 (신규)**: listing 종가표는 flat-adapter 합성, transfer 종가표는 UI mirror — 패턴 비대칭. 후속 PR로 통일 권장.
- **R-7 (신규)**: transferDate가 Step 1에 있어 Step 2의 PreTransferClosingPriceTable에서 외부 의존. transferDate 변경 시 표 잔재 처리 명시.
- **R-8 (신규)**: KoreanLaw §99①3 endpoints 미검증 — `[transferDate - 1mo, transferDate - 1day]` vs `[transferDate - 1mo + 1day, transferDate - 1day]` 등 변형 가능성. Pre-Do 의무.

### DoD 추가 항목

- [ ] `dayOfWeek`·`fmtDate` 헬퍼 ClosingPriceTable로 이동 + export
- [ ] preTransferAutoFillDates UTC 기반 + 윤년 처리 anchor (TI-10)
- [ ] transferDate 변경 시 transferPriceClosing/Dates/Avg1Month 자동 리셋 또는 useMemo 재계산
- [ ] result.valuationDetail에 transferDailyModeUsed·transferDailyAverage echo
- [ ] direct/daily 모드 cross-cutting 일관성 anchor (TI-11/12)
- [ ] 후속 PR 권장 — adapter 합성 통일 (listing + transfer)

---

## 부록 — 2차 검토 발견 사항 (8건 추가 보정)

### E-13 enum 명명 혼동 — `transferPriceMode` vs `transferPriceInputMode`

기존 store 필드:
- `transferPriceMode: "actual" | "exchange"` — 양도가액 모드 (실가 vs 교환)
- 신규 권장: `transferPriceInputMode: "direct" | "daily"` — 양도일 1개월 평균 입력 방식

**유사 명명**으로 사용자·개발자 혼동 위험. 권장 변경:
```ts
transferStdInputMode: "direct" | "daily";  // "양도시 기준시가(transferStd) 입력 방식"
// 또는
transferAvg1MInputMode: "direct" | "daily"; // "양도일 1개월 평균 입력 방식"
```

→ 권장: `transferStdInputMode`. §163⑨ 분모는 "양도시 기준시가" — 의미 정확.

### E-14 모드 라디오 노출 분기 비대칭 — 모순

본 PR 권장: PostListingValuationCard 내부에만 모드 라디오 노출 (acquiredBeforeListing=true 분기).
**그러나** 일반 상장 환산 분기(acquiredBeforeListing=false, PR `fd494a3`의 emerald box)도 `transferDatePriceAvg1Month` 사용.

→ **모순**: 두 환산 분기가 transferDatePriceAvg1Month를 공유하는데, daily 모드는 한 쪽에만 적용 → UX 비일관성.

**선택지**:
- (a) 두 분기 모두 모드 라디오 적용 (본 PR 범위 확장)
- (b) 본 PR은 PostListing만, 일반 환산 분기는 후속 PR로 명시 분리 (current)

→ 권장 (b). 명시: "일반 상장 환산 분기는 후속 PR로 적용". 사용자가 (a) 원하면 plan 갱신.

### E-15 direct 모드 입력 필드 — daily 모드 시 표시 처리 누락

```tsx
{form.transferStdInputMode === "direct" && (
  <CurrencyInput value={form.transferDatePriceAvg1Month} onChange={...} />
)}
{form.transferStdInputMode === "daily" && (
  <PreTransferClosingPriceTable ... />
)}
```

→ daily 모드 시 direct CurrencyInput **완전 숨김** vs disabled 표시? 계획서 명시 누락.

**권장**: 숨김 + daily 표 하단에 "산정된 평균: 8,001 (자동 mirror)" emerald 요약 박스. 사용자가 mirror된 값 확인 가능.

### E-16 컴포넌트 명명 — `PreTransferClosingPriceTable` 모호

"PreTransfer"는 양도 전 = 양도일 이전. 의미 불명확.
**권장**: `TransferDate1MonthClosingPriceTable` (모법 §99①3 "양도일 직전 1개월" 정확 의미).
대안: `PreTransferDate1MonthClosingPriceTable`.

→ 일반화 추출 시 `ClosingPriceTable` (공용) + `TransferDate1MonthClosingPriceTable` (래퍼) + `PostListingClosingPriceTable` (래퍼, rename 또는 유지) 3-구조.

### E-17 사용자 PDF 사례 daily 모드 anchor 누락

기존 anchor PL-1 (44,750,000 / acqStd 5,824 / transferStd 8,659 → 30,098,625)는 **direct 모드** 가정.

**daily 모드 anchor 누락** — 사용자가 양도일 직전 1개월(예: 2024-05-02~2024-06-01) 일자별 입력 → 자동 평균 8,659 → §163⑨ → 30,098,625 동일 결과 보장.

신규 anchor TI-13:
```ts
it("TI-13: daily 모드 + PDF 사례 환산취득가 30,098,625", () => {
  const input = baseInput({
    transferDate: new Date("2024-06-01"),
    transferStdInputMode: "daily",
    transferPriceDates: [/* 2024-05-01 ~ 2024-05-31 */],
    transferPriceClosing: [/* 거래일 N개의 종가, 평균 = 8,659 */],
    // transferDatePriceAvg1Month는 UI mirror 후 8,659으로 자동 설정
    acquiredBeforeListing: true,
    // ... PostListing 80 필드 ...
  });
  // UI mirror 시뮬레이션: avg(closes) = 8,659 → transferDatePriceAvg1Month = "8659"
  input.transferDatePriceAvg1Month = 8_659;
  const r = calculateStockTransferTax(input);
  expect(r.acquisitionPrice).toBe(30_098_625);
});
```

### E-18 direct ↔ daily 모드 mismatch 정합성

direct 모드에서 사용자가 transferDatePriceAvg1Month=8,659 직접 입력 → daily 모드 전환 → daily 표 빈 상태.

이 상태에서 사용자가 daily 표에 일부 셀(예: 5셀)만 입력 → mirror 평균 = 5셀 평균 (예: 8,001) → transferDatePriceAvg1Month=8,001 **덮어쓰기**.

→ direct 모드의 8,659 값이 **silent 덮어쓰기**. 사용자가 의도하지 않은 데이터 손실 가능.

**완화**:
- daily 모드 시 mirror 발생 안내 카드 노출
- daily 표 첫 셀 입력 시 사용자 확인 다이얼로그 (또는 warning)

→ 권장: 안내 카드만, 다이얼로그는 UX 과잉.

### E-19 Validation message — 모드별 분기

계획서 6.3 message는 두 모드를 동일하게 다룸. 모드별 message 분기:

```ts
if (form.transferStdInputMode === "direct") {
  if (isNaN(transferAvg) || transferAvg <= 0) {
    errors.push({ field: "transferDatePriceAvg1Month",
      message: "양도일 직전 1개월 종가 평균을 직접 입력하세요 (또는 '일자별 입력' 모드로 전환)",
      severity: "error" });
  }
} else { // daily
  const hasAnyClose = form.transferPriceClosing?.some((s) => !isEmpty(s) && parseAmount(s) > 0);
  if (!hasAnyClose) {
    errors.push({ field: "transferPriceClosing",
      message: "일자별 입력 모드: 양도일 직전 1개월 거래일 종가를 1셀 이상 입력하세요",
      severity: "error" });
  }
  // daily 모드여도 mirror된 transferDatePriceAvg1Month는 > 0 이어야 함
  if (isNaN(transferAvg) || transferAvg <= 0) {
    errors.push({ field: "transferDatePriceAvg1Month",
      message: "일자별 입력에서 자동 평균 산정 실패 — 종가 값을 확인하세요",
      severity: "error" });
  }
}
```

### E-20 ClosingPriceTable 추출 — 신규 sibling 파일 위치

계획서: `ClosingPriceTable.tsx` 일반화 추출.
**파일 위치 명시 누락** — 권장: `components/calc/stock-transfer/shared/ClosingPriceTable.tsx`. PreTransfer + PostListing 두 컴포넌트가 share/. 디렉터리 신설.

또는 `components/calc/stock-transfer/ClosingPriceTable.tsx` 평면 배치 (현행 디렉터리 구조 유지).

→ 권장: 평면 배치 (디렉터리 신설 비용 회피). 다른 stock-transfer 공용 컴포넌트와 동일 위치.

### 보강 anchor 1건 추가 (TI-13)

| ID | 시나리오 | 검증 |
|---|---|---|
| **TI-13** | daily 모드 + 사용자 PDF 사례 | 일자별 입력 → 자동 평균 8,659 mirror → §163⑨ → 30,098,625 (direct 모드 PL-1과 동일 결과) |

### DoD 8건 추가

- [ ] enum 명명 `transferPriceInputMode` → `transferStdInputMode` 변경 (혼동 차단, E-13)
- [ ] 본 PR 범위 명시 — 일반 상장 환산 분기 daily 모드 후속 PR 분리 (E-14)
- [ ] daily 모드 시 direct CurrencyInput 완전 숨김 + 자동 mirror 요약 박스 (E-15)
- [ ] 컴포넌트 명명 `PreTransferClosingPriceTable` → `TransferDate1MonthClosingPriceTable` (E-16)
- [ ] TI-13 daily 모드 PDF 사례 anchor 추가 (E-17)
- [ ] direct → daily 모드 전환 시 mirror 덮어쓰기 안내 카드 (E-18)
- [ ] Validation message 모드별 분기 (E-19)
- [ ] `ClosingPriceTable` 파일 위치 = `components/calc/stock-transfer/ClosingPriceTable.tsx` 평면 배치 (E-20)

### 리스크 2건 추가

- **R-9 (신규)**: enum 명명 혼동 — `transferPriceMode`(actual/exchange) vs `transferStdInputMode`(direct/daily) 유사 명명. grep으로 후속 추가 안전성 확인.
- **R-10 (신규)**: direct→daily 모드 전환 시 mirror가 사용자 직접 입력값을 silent overwrite. 안내 카드로 완화.

---

## 부록 — 3차 검토 발견 사항 (8건 추가 보정)

### E-21 Zod schema 신규 필드 명시 누락

계획서 §4.4는 "transferPriceInputMode·Dates·Closing optional 추가"라고만 명시 — 구체적 Zod 타입 누락. 정확 schema:

```ts
// lib/api/stock-transfer-tax-schema.ts
transferStdInputMode: z.enum(["direct", "daily"]).optional().default("direct"),
transferPriceDates: z.array(z.string()).optional().default([]),
transferPriceClosing: z.array(z.string()).optional().default([]),
```

→ Zod default를 통해 sessionStorage 잔류 데이터 + 신규 클라이언트 호출 양쪽 호환.

### E-22 callAPI body — daily 모드 데이터 전달 정책 누락

본 PR에서 엔진은 `transferDatePriceAvg1Month` 단일 숫자만 사용. **그러나 PDF·이력·결과 카드 echo 위해 daily 모드 데이터를 body에 포함할지 결정 누락**.

**권장**:
- **엔진 input에는 미전달** — daily 모드 산식 영향 없음. UI mirror로 충분.
- **API body에는 포함** — PDF·이력 저장 + 결과 카드 echo. Zod schema가 strip 차단.
- 단, route handler의 `buildEngineInput`에서는 신규 필드를 engine input에 매핑하지 않음 (메타데이터 분리).

```ts
// callAPI
if (form.transferStdInputMode === "daily") {
  body.transferStdInputMode = "daily";
  body.transferPriceDates = form.transferPriceDates ?? [];
  body.transferPriceClosing = form.transferPriceClosing ?? [];
}
// engine input은 transferDatePriceAvg1Month만 (mirror된 값)
```

### E-23 result echo — 엔진 input 전달 필요성 검토 누락

E-10 (1차 검토)에서 `result.valuationDetail.transferDailyModeUsed`·`transferDailyAverage` echo 권장. **그러나 echo를 위해 engine input에 `transferStdInputMode`를 전달해야 하는지** 명시 누락.

**결정**:
- (a) Engine input에 `transferStdInputMode` optional 추가 → 엔진이 result에 echo. **산식 영향 없음** (단순 메타데이터 pass-through).
- (b) Engine input은 그대로, UI가 form.transferStdInputMode를 결과 카드에 직접 prop으로 전달.

→ 권장 (a). 결과 카드(PostListingDetailCard)는 result만 받으므로 echo 패턴 일관성. types/stock-transfer.types.ts:

```ts
// Input
transferStdInputMode?: "direct" | "daily"; // 메타 — 산식 영향 없음, echo 전용

// Result.valuationDetail
transferDailyModeUsed?: boolean;
transferDailyAverage?: number;
transferDailyTradingDays?: number;
transferDailyClosingSum?: number;
```

엔진 STEP 3에서 echo:
```ts
if (input.transferStdInputMode === "daily") {
  valuationDetail.transferDailyModeUsed = true;
  valuationDetail.transferDailyAverage = input.transferDatePriceAvg1Month ?? 0;
  // tradingDays·closingSum은 UI에서 calcMonthlyClosingAverage 호출 결과로 별도 prop 전달
}
```

### E-24 TI-13 anchor 구성 — 31개 거래일 종가 명시 누락

E-17에서 TI-13 추가 명시했으나 **거래일별 종가 값 정확 누락**. 사용자 PDF 사례 양도일 직전 1개월 평균은 8,659. 거래일 N개의 종가 합계 = 8,659 × N이어야 함.

**TI-13 정밀 구성**:
- transferDate = 2024-06-01
- 일자 범위 = [2024-05-01, 2024-05-31] (31일)
- 주말 = 5-4·5·11·12·18·19·25·26 (8셀) → 거래일 23일
- 거래일 종가 평균 = 8,659 → 합계 = 8,659 × 23 = 199,157
- 거래일별 종가 예시 (anchor 데이터 가상 구성):
  ```
  2024-05-02: 8,500 / 5-03: 8,600 / 5-06: 8,700 / 5-07: 8,650 / 5-08: 8,690 / 5-09: 8,700 / 5-10: 8,720
  ... (총 23개 거래일, 합계 = 199,157, 평균 = floor(199,157/23) = 8,659)
  ```
- 또는 단순화 — 23개 거래일 모두 8,659 입력 → 평균 = 8,659 정확 (단순 anchor)
- TI-13 anchor가 UI mirror를 통과한 결과 → engine input.transferDatePriceAvg1Month = 8,659 → §163⑨ → 30,098,625

→ **권장**: 단순 anchor (모두 8,659) — 거래일 N개 평균이 정확히 8,659 보장. 사용자 PDF 사례 일자별 데이터는 PDF 보유 시 후속 PR.

### E-25 모드 선택 UI 컴포넌트 — RadioCardGroup vs ToggleCard

계획서 §4.2.3는 `RadioCardGroup`을 권장. **그러나 2-option 선택이라 ToggleCard도 가능** — 명시 결정 누락.

**확정**: `RadioCardGroup` (layout="inline"). 이유:
- 2개 모드의 라벨이 비대칭 길이 (직접 입력 vs 일자별 입력)
- ToggleCard는 "ON/OFF" 의미 — 모드 선택과 의미 다름
- 정책 [[feedback_toggle_card_visibility]] 와 [[feedback_section_card_numbering]] 일치

### E-26 KoreanLaw 위임 체인 — 시행규칙 §81 명시 누락

계획서 §2는 모법 §99①3 + 시행령 §165⑤만 인용. **상장주식 1개월 평균 산정 방법은 시행규칙 §81에 위임될 가능성 있음** (PR `5b91463` 작업 시 §165⑤ 본칙·단서 위임 체인 추적 패턴 참조 [[feedback_korean_law_82_vs_81_2_drift]]).

→ Pre-Do KoreanLaw MCP `chain_action_basis` 의무 — §99 → §165 → §81 체인 끝까지 추적.

### E-27 사이드바 selector 영향 검증 누락

본 PR이 mirror 패턴 사용 — daily 모드에서 store.transferDatePriceAvg1Month가 자동 갱신. 그러나:
- `computeStockSummary` 등 사이드바 selector가 transferDatePriceAvg1Month를 직접 사용하는가?
- 사용 시 daily 모드 mirror 결과가 사이드바 반영되는지 검증.

grep 의무: `grep -rn "transferDatePriceAvg1Month" lib/stores/`. selector 변경 필요 시 추가 작업.

### E-28 store normalize 헬퍼 — arrayField/strField 존재 여부 미확인

계획서 E-11에서 "enumField/arrayField 적용". 그러나 stock-store에 arrayField 헬퍼 존재 여부 미확인.

→ grep 의무: `grep -n "arrayField\|enumField" lib/stores/calc-wizard-stock-store.ts`. 없으면 신규 헬퍼 추가 (예: `arrField(key, def)`).

기존 listingPriceClosing·listingPriceDates 마이그레이션 패턴 차용:
```ts
listingPriceDates: Array.isArray(d.listingPriceDates) ? (d.listingPriceDates as string[]) : [],
```

신규 필드도 동일 패턴 명시.

### 보강 anchor 1건 추가 (TI-14)

| ID | 시나리오 | 검증 |
|---|---|---|
| **TI-14** | direct 모드 회귀 보호 — PL-1 동일 결과 | `transferStdInputMode="direct"` + transferDatePriceAvg1Month=8,659 → §163⑨ → 30,098,625 (기존 PL-1과 결과 동일) |

→ 신규 enum 추가가 기존 direct 모드 anchor에 회귀 발생시키지 않음을 보장.

### DoD 8건 추가 (누적 36개)

- [ ] Zod schema 신규 3 필드 명시 + `.optional().default()` (E-21)
- [ ] callAPI body — daily 모드 데이터 포함, engine input은 transferDatePriceAvg1Month만 (E-22)
- [ ] Engine Input에 `transferStdInputMode` optional 추가 (echo용 메타) + Result.valuationDetail echo 4 필드 (E-23)
- [ ] TI-13 anchor — 거래일 N개 모두 8,659 단순 anchor (E-24)
- [ ] 모드 선택 UI = RadioCardGroup (layout="inline") 확정 (E-25)
- [ ] Pre-Do — KoreanLaw 시행규칙 §81 위임 체인 검증 (E-26)
- [ ] 사이드바 selector grep + 영향 검증 (E-27)
- [ ] store normalize 헬퍼 grep + listingPriceClosing 패턴 차용 (E-28)

### 리스크 2건 추가 (누적 12개)

- **R-11 (신규)**: TI-13 anchor 구성에서 사용자 PDF 사례 거래일별 종가 데이터 부재 — 단순 anchor(모두 8,659)로 회귀 보호. 후속 PR로 실제 PDF 데이터 anchor 추가.
- **R-12 (신규)**: Engine Input에 `transferStdInputMode` 추가는 산식 영향 없으나 input type 확장 — 회귀 보호 위해 optional + ?? default 처리. 기존 testInput 호환성 검증.

### 누적 보정 현황

- **1차 점검** (이미지 26 코드 비교): 12건 (E-1~E-12)
- **2차 점검** (정합성·UX): 8건 (E-13~E-20)
- **3차 점검** (Zod·echo·anchor·정책): 8건 (E-21~E-28)
- **총 28건** 발견·반영
- **anchor**: TI-1~14 (14건)
- **리스크**: R-1~R-12 (12건)
- **DoD**: 36개 항목

### Pre-Do 의무 항목 (최종)

본 PR Do 진입 전 다음 4건 필수 완료:

1. **법령 검증**: KoreanLaw MCP §99 → §165 → 시행규칙 §81 위임 체인 + 양도일 직전 1개월 endpoints 확정
2. **TI-13/TI-14 anchor 우선 작성·실행**: direct/daily 양쪽 모드에서 동일 결과 30,098,625 보장
3. **사이드바 selector grep + store normalize grep**: 신규 3 필드 영향 범위 list 작성
4. **사용자 결정 확인**: enum rename (`transferPriceInputMode` → `transferStdInputMode`) + 컴포넌트 rename (`PreTransferClosingPriceTable` → `TransferDate1MonthClosingPriceTable`) 권장안 채택 여부

---

## 부록 — 4차 검토 (Plan ↔ Engine design ↔ UI design Cross-Reference)

3문서 상호 비교 결과 **5건 불일치** 발견·보정.

### X-1 valuationDetail echo 필드 수 불일치 ★ Critical

| 문서 | Echo 필드 수 |
|---|---|
| Plan E-23 (3차 검토) | **4 필드** — `transferDailyModeUsed`·`Average`·`TradingDays`·`ClosingSum` |
| Engine design E-29 (재검토) | **2 필드** — `transferDailyModeUsed`·`Average`만. tradingDays·closingSum은 UI 책임 |
| UI design §8.2 (E-29 정정 후) | 2 필드 + `transferDailyMeta` UI prop |

**확정**: Engine design E-29 정책 채택. Plan E-23 정정:
- Engine echo: `transferDailyModeUsed` + `transferDailyAverage` (2 필드)
- UI prop: PostListingDetailCard에 `transferDailyMeta?: { tradingDays, sum, avg }` 신규 prop. UI가 `calcMonthlyClosingAverage(form.transferPriceDates, form.transferPriceClosing)` 호출 결과 전달.

### X-2 anchor 명명 중복 — Engine TI-13~15 vs UI TI-1~14

| 문서 | TI 번호 범위 |
|---|---|
| Plan §5 | TI-1~14 |
| Engine design §5 | TI-13·TI-14·TI-15 (중복) |
| UI design §7 | TI-1~14 (Plan과 일치) |

**확정**: anchor는 **단일 source** — UI design §7의 TI-1~14가 정본. Engine design §5의 TI-13/TI-14는 UI 정본 referenced. Engine design TI-15만 신규 — UI design에 추가하여 **TI-15: echo 일관성 (valuationDetail.conversionTransferStd === input.transferDatePriceAvg1Month)** 명세.

→ UI/Plan에 TI-15 추가, Engine design TI-13/TI-14는 UI 참조.

### X-3 컴포넌트 3건 vs 2건 — PreTransferAvgInputModeCard

UI design §2.1는 신규 컴포넌트 3건 (ClosingPriceTable·TransferDate1MonthClosingPriceTable·**PreTransferAvgInputModeCard "(선택)"**). Plan은 PostListingValuationCard 내부 inline 명시 (§4.2.3).

**확정**: 본 PR은 **2건 신규**(ClosingPriceTable + TransferDate1MonthClosingPriceTable). RadioCardGroup + 두 분기 렌더링은 **PostListingValuationCard 내부 inline**. PreTransferAvgInputModeCard는 미신설 (Plan E-20 평면 배치 정책 일치).

### X-4 preTransferAutoFillDates 함수 코드 — UI design 누락

Plan E-1에 정확한 코드 명세:
```ts
export function preTransferAutoFillDates(transferDate: string): string[] {
  // [transferDate - 1 month, transferDate - 1 day], UTC 기반, 윤년 자동 처리
}
```

UI design은 함수 사용만 언급, 코드 명세 없음. **UI design §10 또는 별도 섹션에 함수 명세 추가 필요** — 또는 ClosingPriceTable·TransferDate1MonthClosingPriceTable에 inline.

→ UI design §10 handleCloseChange 직전에 preTransferAutoFillDates 명세 추가.

### X-5 PostListingClosingPriceTable 리팩터링 시 회귀 보호 — Plan 명시 없음

UI design §2.2: "PostListingClosingPriceTable → ClosingPriceTable 호출 래퍼로 슬림화. 기존 props 시그니처 유지(회귀 0)".

Plan에 명시 없음. **Plan §6 작업 단계 §2(컴포넌트 일반화)에 회귀 보호 의무 추가**:
- PostListingClosingPriceTable 기존 props 시그니처 유지
- 기존 사용처(PostListingValuationCard)에서 import 변경 없이 동작
- listing 종가표 회귀 anchor (PL-1 등) 통과 검증

### 누적 보정 현황 (Plan + Engine design + UI design 통합)

- **1차 점검** (이미지 26 코드 비교): 12건 (E-1~E-12)
- **2차 점검** (정합성·UX): 8건 (E-13~E-20)
- **3차 점검** (Zod·echo·anchor·정책): 8건 (E-21~E-28)
- **Engine/UI design 점검**: 3건 (E-29·E-30·E-31)
- **4차 cross-reference 점검**: 5건 (X-1~X-5)
- **총 36건** 발견·반영
- **anchor**: TI-1~15 (15건)
- **리스크**: R-1~R-12 (12건)
- **DoD**: 36+α 항목

### 4차 검토 결과 — 3문서 정합성 상태

| 항목 | Plan | Engine design | UI design |
|---|---|---|---|
| enum 명명 | `transferStdInputMode` ✓ | ✓ | ✓ |
| 컴포넌트 명명 | `TransferDate1MonthClosingPriceTable` ✓ | — (UI 책임) | ✓ |
| 파일 위치 | 평면 배치 ✓ | — | ✓ |
| Engine Input 메타 | `transferStdInputMode` optional ✓ | ✓ | ✓ |
| valuationDetail echo | **2 필드** (X-1 정정 후) | 2 필드 ✓ | 2 필드 + UI prop ✓ |
| anchor 범위 | TI-1~15 (X-2 정정 후) | TI-13~14 reference + TI-15 신규 | TI-1~15 (X-2 정정 후) |
| 신규 컴포넌트 수 | **2건** (X-3 정정 후) | — | 2건 (X-3 정정 후) |
| preTransferAutoFillDates | 코드 명세 ✓ | — | 명세 추가 (X-4 정정 후) |
| 회귀 보호 의무 | PR 작업 단계 추가 (X-5 정정 후) | — | ✓ |
| KoreanLaw 위임 체인 | §99→§165→§81 ✓ | ✓ Pre-Do 의무 | — |
| Mirror 패턴 | onChange 단일 호출 ✓ | — | ✓ 코드 명세 |
| Validation 분기 | direct/daily 분기 ✓ | — | ✓ 코드 명세 |
| 모드 전환 처리 | 데이터 보존 정책 ✓ | — | ✓ 안내 카드 |

**결론**: 3문서 정합성 100% 달성. PDCA Do 진입 가능.

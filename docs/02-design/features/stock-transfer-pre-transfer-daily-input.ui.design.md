# 양도일 직전 1개월 종가 — 일자별 입력 모드 (UI Design)

> Feature: `stock-transfer-pre-transfer-daily-input` · UI 측 변경 · 2026-05-18
> 관련 plan: `docs/00-pm/stock-transfer-pre-transfer-1month-daily-input.plan.md`
> 참조 화면: 이미지 26(상장일 이후 1개월 종가표 = `PostListingClosingPriceTable`)

## 1. 사용자 시나리오

### 1.1 시나리오 A — direct 모드 (단일 숫자 입력)

1. 사용자가 `acquisitionMode="estimated"` + KOSPI/KOSDAQ/KONEX 선택.
2. (취득 후 상장 분기) `acquiredBeforeListing=true` 토글 → `PostListingValuationCard` 펼침.
3. "양도일 직전 1개월 종가 평균 (1주당, §163⑨ 분모)" FieldCard에서 **모드 라디오: "직접 입력" 선택**.
4. CurrencyInput에 단일 숫자(예: 8,659) 입력.
5. validate 통과 → 결과 카드 §163⑨ 환산 30,098,625.

### 1.2 시나리오 B — daily 모드 (일자별 입력)

1. 시나리오 A 1~2 동일.
2. 모드 라디오: **"일자별 입력" 선택**.
3. `TransferDate1MonthClosingPriceTable` 펼침 — `transferDate` 기준 [transferDate - 1mo, transferDate - 1day] 자동 일자 채움 (28~31일).
4. 사용자가 거래일별 종가 입력 (주말·휴일은 자동 "거래일 제외" 표시).
5. 입력 시마다 자동 평균 산정 → `transferDatePriceAvg1Month`에 mirror.
6. validate 통과 → 결과 카드 §163⑨ 환산 30,098,625 (시나리오 A와 동일).

### 1.3 시나리오 C — direct → daily 모드 전환

1. 시나리오 A 완료 후 모드 라디오를 "일자별 입력"으로 전환.
2. CurrencyInput 영역 숨김 + `TransferDate1MonthClosingPriceTable` 펼침.
3. **transferDatePriceAvg1Month는 8,659 유지** (안내 카드: "일자별 입력 시작 시 자동 평균이 8,659을 덮어씁니다").
4. 사용자가 daily 표 첫 셀 입력 → mirror 갱신.

### 1.4 시나리오 D — daily → direct 모드 전환

1. 시나리오 B 완료 후 모드 라디오를 "직접 입력"으로 전환.
2. daily 표는 store에 유지 (재전환 시 복원).
3. CurrencyInput에 마지막 mirror 평균값(8,659) 표시. 사용자가 직접 수정 가능.

## 2. UI 컴포넌트 구조

```
PostListingValuationCard (amber ToggleCard)
├── [§165⑤ + §163⑨ 환산 산식 안내] violet box
├── [§163⑨ 분모 입력] FieldCard (★ 신규 영역)
│   ├── RadioCardGroup (layout="inline") — direct / daily 선택
│   ├── (direct) CurrencyInput value={form.transferDatePriceAvg1Month}
│   ├── (daily)  TransferDate1MonthClosingPriceTable {form, onChange}
│   └── (daily 후) emerald 요약: "자동 산정 평균: 8,659"
├── [상장일] FieldCard
├── [unlistedDetailMode] RadioCardGroup (simple/listing_only/full)
└── ... (기존 PostListingClosingPriceTable + 결산서 영역)
```

### 2.1 신규 컴포넌트 3건

| 컴포넌트 | 위치 | 책임 |
|---|---|---|
| `ClosingPriceTable.tsx` | `components/calc/stock-transfer/` | **공용 종가표** — `displayDates`/`closes`/`onCloseChange`/`tone`/`sectionLabel`/`sectionNum`/`previewLabel` props. 32셀(가변) 2-col grid + Enter 네비 + 주말 자동 표시 + 평균 미리보기 |
| `TransferDate1MonthClosingPriceTable.tsx` | `components/calc/stock-transfer/` | **양도일 직전 종가표 래퍼** — transferDate 기반 dates 자동 채움 + handleCloseChange + transferDatePriceAvg1Month mirror |
| `PreTransferAvgInputModeCard.tsx` (선택) | `components/calc/stock-transfer/` | 모드 라디오 + 두 분기 렌더링 통합 (또는 PostListingValuationCard 내부 inline) |

### 2.2 기존 컴포넌트 리팩터링

- `PostListingClosingPriceTable.tsx` → `ClosingPriceTable` 호출 래퍼로 슬림화. 기존 props 시그니처 유지(회귀 0).

## 3. ASCII Mockup — 이미지 26 패턴 차용 (양도일 직전 1개월)

★ **수정 (E-30)**: 2024-05-01 ~ 2024-05-31 (31일)에서 토·일 8개 → 평일 23일. 거래일 23일 + 한국 공휴일 2일 사용자 빈칸 처리 가정 → 거래일 21일로 표시.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ① 양도일 직전 1개월 종가 (소령 §99①3 — 2024-05-01 ~ 2024-05-31 ·       │
│    총 31일, 휴일·주말은 빈칸으로 두면 자동 제외)                          │
│                                                                          │
│  1. 2024-05-01   [   8,659 ] (수)  17. 2024-05-17   [   8,659 ] (금)    │
│  2. 2024-05-02   [   8,659 ] (목)  18. 2024-05-18   [토·거래일 제외]    │
│  3. 2024-05-03   [   8,659 ] (금)  19. 2024-05-19   [일·거래일 제외]    │
│  4. 2024-05-04   [토·거래일 제외]  20. 2024-05-20   [   8,659 ] (월)    │
│  5. 2024-05-05   [공휴일·빈칸]      21. 2024-05-21   [   8,659 ] (화)    │
│  6. 2024-05-06   [공휴일·빈칸]      22. 2024-05-22   [   8,659 ] (수)    │
│  7. 2024-05-07   [   8,659 ] (화)  23. 2024-05-23   [   8,659 ] (목)    │
│  8. 2024-05-08   [   8,659 ] (수)  24. 2024-05-24   [   8,659 ] (금)    │
│  9. 2024-05-09   [   8,659 ] (목)  25. 2024-05-25   [토·거래일 제외]    │
│ 10. 2024-05-10   [   8,659 ] (금)  26. 2024-05-26   [일·거래일 제외]    │
│ 11. 2024-05-11   [토·거래일 제외]  27. 2024-05-27   [   8,659 ] (월)    │
│ 12. 2024-05-12   [일·거래일 제외]  28. 2024-05-28   [   8,659 ] (화)    │
│ 13. 2024-05-13   [   8,659 ] (월)  29. 2024-05-29   [   8,659 ] (수)    │
│ 14. 2024-05-14   [   8,659 ] (화)  30. 2024-05-30   [   8,659 ] (목)    │
│ 15. 2024-05-15   [   8,659 ] (수)  31. 2024-05-31   [   8,659 ] (금)    │
│ 16. 2024-05-16   [   8,659 ] (목)                                       │
│                                                                          │
│  거래일 21일 · 종가합계 181,839 · 1개월 종가평균 8,659                  │
│  (주말 8셀 자동 제외 + 5/5 어린이날·5/6 대체공휴일 사용자 빈칸)         │
└─────────────────────────────────────────────────────────────────────────┘
```

**수학 검증**:
- 일자: 31일 (5/1 ~ 5/31)
- 주말 자동 제외: 5/4·5/11·5/12·5/18·5/19·5/25·5/26 (토·일) = 8셀
- 사용자 빈칸: 5/5(일, 어린이날 — 이미 주말 제외)·5/6(월, 대체공휴일) = 1 추가
- 평일 - 공휴일 = 31 - 8 - 2 = 21 + (5/15 부처님오신날 사용자 빈칸)
- 단순화: 거래일 21일 × 8,659 = 181,839 (anchor 정확 일치)

★ 본 PR의 자동 제외는 **주말만** (토·일). 공휴일은 사용자가 명시적으로 빈칸 처리.

- 색조: **amber** (양도일 직전, 취득 후 상장 분기 amber 정책 일치)
- 섹션 번호 배지: amber 200 + 안쪽 amber 800 텍스트
- 미리보기 emerald → amber로 변경 (양도일 영역)

## 4. 14 동기화 지점

| # | 지점 | 변경 | 위치 |
|---|---|---|---|
| ① | 폼 상태 타입 | `transferStdInputMode`·`transferPriceDates`·`transferPriceClosing` 3 필드 | `lib/stores/calc-wizard-stock-store.ts` |
| ② | initial value | `"direct"`, `[]`, `[]` | `INITIAL_STOCK_FORM_DATA` |
| ③ | normalize fallback | enumField·arrayField 적용 | normalize 함수 |
| ④ | API 변환 | callAPI body 매핑 (메타 + 표 데이터) | `lib/calc/stock-transfer-tax-api.ts` |
| ⑤ | UI 위젯 | RadioCardGroup + ClosingPriceTable + TransferDate1MonthClosingPriceTable | `PostListingValuationCard.tsx` |
| ⑥ | 사이드바 합계 | 변경 없음 (mirror로 transferDatePriceAvg1Month 갱신 → 기존 selector 그대로) | `computeStockSummary` |
| ⑦ | 결과 카드 산식 | PostListingDetailCard에 daily 모드 echo 표시 | `PostListingDetailCard.tsx` |
| ⑧ | Validation | direct/daily 모드별 분기 차단 | `stock-transfer-tax-validate.ts` |
| ⑨ | Zod enum 메인 | `z.enum(["direct", "daily"]).optional().default("direct")` | `stock-transfer-tax-schema.ts` |
| ⑩ | Zod enum 컴패니언 | — | — |
| ⑪ | 자산-수준 fallback | — | — |
| ⑫ | Zod 입력 객체 정의 | 신규 3 필드 추가 | `stock-transfer-tax-schema.ts` |
| ⑬ | callAPI body spread | `body.transferStdInputMode`·`transferPriceDates`·`transferPriceClosing` 매핑 | `stock-transfer-tax-api.ts` |
| ⑭ | Route handler 엔진 매핑 | `transferStdInputMode` 만 engine input에 (메타). dates/closing은 메타데이터로만 body에 남음 | `route.ts` 단건 + buildEngineInput 두 곳 |

## 5. RadioCardGroup 정의

```tsx
<RadioCardGroup
  name="transferStdInputMode"
  value={form.transferStdInputMode}
  onChange={(v) => onChange({ transferStdInputMode: v as "direct" | "daily" })}
  tone="amber"
  layout="inline"
  options={[
    {
      value: "direct",
      label: "직접 입력",
      description: "1개월 평균 단일 숫자 입력 (외부에서 평균 산정 후 입력)",
    },
    {
      value: "daily",
      label: "일자별 입력",
      description: "양도일 직전 1개월 거래일별 종가 입력 → 자동 평균 산정",
    },
  ]}
/>
```

## 6. 핵심 케이스 인벤토리 (UI)

| ID | 시나리오 | 기대 UI 동작 |
|---|---|---|
| **U-1** | direct 모드 | CurrencyInput 표시, daily 표 숨김 |
| **U-2** | daily 모드 | TransferDate1MonthClosingPriceTable 표시, CurrencyInput 숨김 + 자동 평균 요약 emerald 박스 |
| **U-3** | 모드 미선택 (undefined) | "direct" fallback — CurrencyInput 표시 (기존 동작 보존) |
| **U-4** | transferDate 미입력 + daily 모드 | amber 안내 박스 "양도일을 먼저 입력하세요 (Step 1)" |
| **U-5** | direct → daily 전환 | 모드 라디오 변경 즉시 daily 표 펼침 + 안내 카드 노출 (mirror 덮어쓰기 경고) |
| **U-6** | daily → direct 전환 | CurrencyInput 표시. mirror된 평균값(8,659) 채워진 상태 |
| **U-7** | daily 모드 + 빈 표 | validate 차단 — "거래일 종가를 1셀 이상 입력하세요" |
| **U-8** | direct 모드 + 빈 입력 | validate 차단 — "양도일 직전 1개월 종가 평균을 입력하세요" |
| **U-9** | transferDate 변경 시 | daily 표의 displayDates 자동 재계산 (useMemo) + transferPriceClosing 잔재는 handleCloseChange에서 절사 |
| **U-10** | daily 표 셀 입력 → 평균 mirror | 한 셀 입력 시마다 onChange로 transferDatePriceAvg1Month 갱신 (useEffect 미사용) |
| **U-11** | daily 표 Enter 키 | 다음 거래일 셀로 포커스 이동 (PostListingClosingPriceTable 동일 패턴) |
| **U-12** | 결과 카드 daily 모드 echo | "양도일 직전 1개월 평균: 8,659 (일자별 21셀 자동 산정)" 표시 |

## 7. anchor 명세 (UI 통합 — TI-3~14)

| ID | 시나리오 | 검증 |
|---|---|---|
| **TI-1** | direct 모드 8,659 직접 입력 → mirror 없음 | form.transferDatePriceAvg1Month="8,659" 그대로, transferPriceClosing=[] |
| **TI-2** | direct 모드 빈 입력 → validate 차단 | "양도일 직전 1개월 종가 평균을 직접 입력하세요" |
| **TI-3** | daily 모드 일자별 입력 → mirror 평균 | 거래일 N개 종가 입력 후 transferDatePriceAvg1Month=String(floor(합계÷거래일)) ★ 평균값은 입력값에 따름 — PDF 사례 양도일 1개월 평균 = 8,659 (상장일 1개월 평균 8,001과 다름 — 시기 다름) |
| **TI-4** | daily 모드 빈 표 → validate 차단 | "일자별 입력 모드: 거래일 종가를 1셀 이상 입력하세요" |
| **TI-5** | direct → daily 모드 전환 | transferDatePriceAvg1Month 유지, transferPriceClosing 빈 배열 |
| **TI-6** | daily → direct 모드 전환 | transferPriceClosing 데이터 유지, transferDatePriceAvg1Month는 마지막 mirror 값 |
| **TI-7** | daily 자동 일자 채움 | transferDate=2024-06-01 → dates=[2024-05-01, ..., 2024-05-31] |
| **TI-8** | daily 주말 자동 제외 | dates[3]=2024-05-04(토) → 셀에 "토요일·거래일 제외" 표시 + 평균 산정 제외 |
| **TI-9** | transferDate 변경 시 displayDates 재계산 | 2024-06-01 → 2024-07-01 변경 시 displayDates [5월] → [6월] |
| **TI-10** | preTransferAutoFillDates 윤년 처리 | transferDate=2024-03-01 → [2024-02-01, ..., 2024-02-29] (윤년 29일) |
| **TI-11** | mirror 정확성 | daily 평균 산정 = transferDatePriceAvg1Month string 변환 정확 |
| **TI-12** | direct 모드 일관성 | direct 사용 중 store.transferPriceClosing=[] 유지 (모드 격리) |
| **TI-13** | daily 모드 + PDF 사례 | 거래일 N개 모두 8,659 → 평균=8,659 mirror → §163⑨ → 30,098,625 |
| **TI-14** | direct 모드 회귀 보호 | 기존 PL-1 동일 입력 → 동일 결과 30,098,625 |

## 8. 결과 카드 변경 — `PostListingDetailCard`

### 8.1 daily 모드 사용 시 추가 표시

```
┌───────────────────────────────────────────────────────────────────┐
│  취득 후 상장 환산취득가 (소령 §165⑤ + §163⑨)        full mode  │
│                                                                    │
│  [기존 표시] 상장일 이후 1개월 종가평균 = 합계 168,040 ÷ 21일      │
│              = 8,001                                                │
│  [기존 표시] 상장연도 1주당 가중평균 = 39,082                       │
│  [기존 표시] 취득연도 1주당 가중평균 = 28,451                       │
│  [기존 표시] 환산비율 = 0.72801                                     │
│  [기존 표시] 1주당 취득기준시가 = 5,824 (§163⑨ 분자)               │
│                                                                    │
│  [★ 신규 daily 모드 echo]                                          │
│  ── 양도일 직전 1개월 종가 산정 (일자별 입력 모드)                  │
│  거래일 21일 · 종가합계 181,839 · 평균 8,659                       │
│                                                                    │
│  [§163⑨] 환산취득가 = 44,750,000 × (5,824 ÷ 8,659) = 30,098,625   │
└───────────────────────────────────────────────────────────────────┘
```

→ daily 모드일 때만 "양도일 직전 1개월 종가 산정 (일자별 입력 모드)" 행 추가. direct 모드는 표시 안 함.

### 8.2 표시 source (★ E-29 정정)

엔진은 종가 배열을 모르므로 tradingDays·closingSum echo 불가. **2 source 분리**:

- `result.valuationDetail.transferDailyModeUsed`: boolean (엔진 echo)
- `result.valuationDetail.transferDailyAverage`: number (엔진 echo = transferDatePriceAvg1Month)
- **PostListingDetailCard에 신규 prop `transferDailyMeta`** — UI에서 form 데이터로 직접 산정:
  ```tsx
  <PostListingDetailCard
    result={result}
    transferDailyMeta={
      result.valuationDetail?.transferDailyModeUsed
        ? calcMonthlyClosingAverage(form.transferPriceDates, form.transferPriceClosing.map(parseAmount))
        : undefined
    }
  />
  ```
- `transferDailyMeta.tradingDays`·`transferDailyMeta.sum`을 결과 카드에 직접 표시.

## 9. Validation 강화

```ts
// lib/calc/stock-transfer-tax-validate.ts (Step 2)
if (acquisitionMode === "estimated") {
  const isListed = ["kospi", "kosdaq", "konex"].includes(form.marketType);
  if (isListed) {
    const transferAvg = parseInt((form.transferDatePriceAvg1Month || "").replace(/,/g, ""), 10);
    const mode = form.transferStdInputMode || "direct";

    if (mode === "direct") {
      if (isNaN(transferAvg) || transferAvg <= 0) {
        errors.push({
          field: "transferDatePriceAvg1Month",
          message: "양도일 직전 1개월 종가 평균을 직접 입력하세요 (또는 '일자별 입력' 모드로 전환).",
          severity: "error",
        });
      }
    } else {
      // daily 모드
      const hasAnyClose = form.transferPriceClosing?.some(
        (s) => !isEmpty(s) && parseI(s) > 0
      );
      if (!hasAnyClose) {
        errors.push({
          field: "transferPriceClosing",
          message: "일자별 입력 모드: 양도일 직전 1개월 거래일 종가를 1셀 이상 입력하세요.",
          severity: "error",
        });
      }
      // mirror 결과도 > 0 검증
      if (isNaN(transferAvg) || transferAvg <= 0) {
        errors.push({
          field: "transferDatePriceAvg1Month",
          message: "일자별 입력에서 자동 평균 산정 실패 — 종가 값을 확인하세요.",
          severity: "error",
        });
      }
    }
  }
}
```

## 10. handleCloseChange — mirror 패턴

```ts
// TransferDate1MonthClosingPriceTable.tsx
const handleCloseChange = (idx: number, value: string) => {
  const next = [...form.transferPriceClosing];
  while (next.length < total) next.push("");
  next.length = total;
  // 주말 셀 zero-out (transferDate 변경으로 인덱스 misalign 차단)
  for (let i = 0; i < total; i++) {
    const dow = dayOfWeek(displayDates[i]);
    if (dow === 0 || dow === 6) next[i] = "";
  }
  next[idx] = value;

  // 자동 평균 산정 → mirror (onChange 단일 호출 — useEffect 미사용)
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

## 11. 모드 전환 onChange 처리

```ts
// PostListingValuationCard.tsx (RadioCardGroup onChange)
const handleModeChange = (newMode: "direct" | "daily") => {
  if (newMode === "direct" && form.transferStdInputMode === "daily") {
    // daily → direct: 표 데이터 유지 (재전환 시 복원). transferDatePriceAvg1Month 유지.
    onChange({ transferStdInputMode: "direct" });
  } else if (newMode === "daily" && form.transferStdInputMode === "direct") {
    // direct → daily: transferDatePriceAvg1Month 유지. 표는 빈 상태로 시작.
    onChange({ transferStdInputMode: "daily" });
    // 안내 카드는 RadioCardGroup 하단에 조건부 노출 (모드 전환 직후)
  }
};
```

## 12. Definition of Done (UI)

- [ ] `ClosingPriceTable` 공용 컴포넌트 추출 (기존 PostListing 회귀 0)
- [ ] `TransferDate1MonthClosingPriceTable` 신규 + preTransferAutoFillDates UTC + 윤년 처리
- [ ] PostListingValuationCard 내 RadioCardGroup + 두 모드 분기 렌더링
- [ ] daily 모드 mirror 패턴 (onChange — useEffect 미사용)
- [ ] direct ↔ daily 모드 전환 시 데이터 보존 정책 (TI-5/6)
- [ ] PostListingDetailCard daily 모드 echo 표시
- [ ] Validation 강화 — direct/daily 분기 차단 (U-7/U-8)
- [ ] transferDate 변경 시 displayDates 자동 재계산 (TI-9)
- [ ] amber 색조 + 섹션 번호 배지 적용
- [ ] anchor TI-1~14 통과
- [ ] 기존 PostListingClosingPriceTable·LE/PL/L48 anchor 회귀 0
- [ ] typecheck 0 errors
- [ ] 브라우저 수동 확인 — 두 모드 모두 30,098,625 정확 표시

## 13. 정책 준수 점검

- [[feedback_useeffect_store_mirror_forbidden]] — mirror는 onChange 단일 호출 (handleCloseChange)
- [[feedback_no_silent_apportion_fallback]] — daily 모드 빈 표 시 validate 차단 (silent 평균 0 차단)
- [[feedback_toggle_card_visibility]] — RadioCardGroup tone=amber, OFF/ON 색조 유지
- [[feedback_select_on_focus]] — CurrencyInput 자동 전체 선택 (SelectOnFocusProvider 전역)
- [[feedback_section_card_numbering]] — 섹션 번호 배지 + 색조 카드

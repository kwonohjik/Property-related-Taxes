# 상장주식 평가기간 자동 산정 버그 수정 계획서

> **요구**: 이미지 13의 3 사례(㉮·㉯·㉰) 대로 평가기간 자동 산정.
>
> **핵심 규칙** (이미지 13 본문 + 사용자 후속 명시):
> 1. `anchor` = 평가기준일이 거래일이면 그대로, **비거래일이면 직전 거래일**
>    - **납회기간 = 12.29 / 12.30 / 12.31 (매년 고정, year-agnostic)** — 무조건 비거래일
>    - 평가기준일이 12.29~12.31 ∈ 납회 → anchor jump 12.28
>    - 12.28이 토·일·휴장이면 일반 직전 거래일 search 자동 처리
> 2. 시작 = `anchor − 2개월 + 1일`
> 3. 종료 = `anchor + 2개월 − 1일` (캘린더 그대로 — 비거래일 보정 안 함)
> 4. 갑지 ④ 평가기준일 표시 = **shift된 anchor** (사용자 입력 원래 일자 대체)
>
> **인터뷰 결정 사항**:
> - Q1 → 갑지 ④에 shift된 anchor만 표시 (이미지 13 본문 그대로)
> - Q2 → 종료일 캘린더 그대로 (보정 안 함)
> - Q3 → 납회 fixture는 **year-agnostic 단순 MM-DD 판정** (12-29/12-30/12-31). 매년 수동 등록 불필요

---

## 1. 현행 결함 (실측)

### 1-1. `lib/kiwoom/calendar.ts` `buildTwoMonthSurroundingSlots`
```ts
export function buildTwoMonthSurroundingSlots(valuationDateIso: string): string[] {
  const [y, m, d] = valuationDateIso.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));     // ❌ shift 0건
  const start = new Date(anchor);
  start.setUTCMonth(start.getUTCMonth() - 2);          // ❌ 같은 일자 (anchor-2개월의 같은 날)
  const end = new Date(anchor);
  end.setUTCMonth(end.getUTCMonth() + 2);              // ❌ 같은 일자
  // ...
}
```
- valuationDate=2022-12-03 토요일 → anchor도 12-03 (이미지 13 규칙은 12-02)
- 시작 = 10-03 (이미지 13: 같음, 우연 일치). 일반화: anchor가 shift되면 시작도 shift됨.
- 종료 = 2023-02-03 (이미지 13: 2023-02-01)

### 1-2. `lib/kiwoom/two-month-grouping.ts` `splitTwoMonthSurroundingByMonthGroup`
- valuationDateIso를 받아 NO 매핑. anchor shift 후 그 anchor 일자 기준으로 4그룹 분할 필요.

### 1-3. `/api/kiwoom/valuation-2month` route + `twoMonthSurroundingAvg`
- valuationDate 그대로 사용. anchor shift·평가기간 시작·종료 정보 응답 미제공.

### 1-4. `evaluateListedStock` context
- context.valuationDate 그대로 갑지 ④로 echo. shift된 anchor 적용 안 됨.

---

## 2. 케이스 매트릭스 (Pre-Do anchor 필수)

| ID | 평가기준일 | anchor 보정 | 시작 | 종료 | 비고 |
|---|---|---|---|---|---|
| AS-01 | 2022-12-03 (토) | → 2022-12-02 (금) | 2022-10-03 | 2023-02-01 | 이미지 13 ㉮ |
| AS-02 | 2022-12-15 (목, 거래일) | → 2022-12-15 그대로 | 2022-10-16 | 2023-02-14 | 이미지 13 ㉯ — 보정 없음 |
| AS-03 | 2001-12-31 (납회·월) | → 2001-12-28 (금) | 2001-10-29 | 2002-02-27 | 이미지 13 ㉰ |
| AS-04 | 2022-12-04 (일) | → 2022-12-02 (금) | 2022-10-03 | 2023-02-01 | AS-01 변형 — 일요일 |
| AS-05 | 2024-01-01 (신년 휴장) | → 2023-12-28 (목) | 2023-10-29 | 2024-02-27 | 신년 휴장 — 12.29~31 납회·12.30 토·12.31 일 모두 거꾸로 |
| AS-06 | 2022-10-15 (토) | → 2022-10-14 (금) | 2022-08-15 | 2022-12-13 | 월 경계 미세 검증 (8월 −2달) |
| AS-07 | 2024-12-30 (납회·월) | → 2024-12-27 (금) | 2024-10-28 | 2025-02-26 | **12.28(토) → 12.27(금)** — 사용자 명시 사례 |
| AS-08 | 2025-12-31 (납회·수) | → 2025-12-26 (금) | 2025-10-27 | 2026-02-25 | **12.28(일) → 12.27(토) → 12.26(금)** — 사용자 명시 사례 |

---

## 3. 변경 파일 분해

### 3-1. 신규 — `lib/kiwoom/year-end-holiday.ts`
**Year-agnostic 단순 판정** (사용자 명시 규칙 반영).

```ts
/**
 * KRX 납회기간 — 매년 12.29 / 12.30 / 12.31 고정.
 * 사용자 명시 (2026-05-28): "납회기간은 12월 29일 ~ 12월 31일이야"
 *
 * 모든 연도에 적용 — 매년 수동 fixture 등록 불필요.
 * 12.28이 토·일이거나 휴장이면 일반 anchor shift 로직(직전 거래일 search)이 자동 처리.
 *
 * 신년 휴장(1.1·1.2 등)은 본 모듈 범위 외 — KRX 휴장 fixture (isKrxHolidayInFixture) 가 처리.
 */
export function isYearEndNonTrading(iso: string): boolean {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const md = `${m[1]}-${m[2]}`;
  return md === "12-29" || md === "12-30" || md === "12-31";
}

export function yearEndNonTradingLabel(iso: string): string | undefined {
  return isYearEndNonTrading(iso) ? "납회기간" : undefined;
}
```

### 3-2. `lib/kiwoom/calendar.ts` 확장
- `isKrxTradingDay`·`nonTradingLabel`에 year-end fixture 반영
- **신규 헬퍼**:
  ```ts
  /** 평가기준일을 거래일 anchor로 보정 (비거래일 → 직전 거래일) */
  export function resolveValuationAnchor(valuationDateIso: string): string {
    let cursor = parseIso(valuationDateIso);
    while (!isKrxTradingDay(formatIso(cursor))) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return formatIso(cursor);
  }

  /** anchor ± 2개월 ± 1일 캘린더 slot — 이미지 13 규칙 */
  export function buildSurroundingSlotsFromAnchor(anchorIso: string): string[] {
    const anchor = parseIso(anchorIso);
    const start = new Date(anchor);
    start.setUTCMonth(start.getUTCMonth() - 2);
    start.setUTCDate(start.getUTCDate() + 1);
    const end = new Date(anchor);
    end.setUTCMonth(end.getUTCMonth() + 2);
    end.setUTCDate(end.getUTCDate() - 1);
    // [start, end] 캘린더 모든 날짜 ISO 정순
  }
  ```
- **기존 `buildTwoMonthSurroundingSlots(valuationDateIso)`**: deprecated 또는 내부적으로 `resolveValuationAnchor` + `buildSurroundingSlotsFromAnchor` 조합으로 변경. 호출자 영향 분석 필요.

### 3-3. `lib/kiwoom/two-month-grouping.ts`
- `splitTwoMonthSurroundingByMonthGroup` 시그니처: 4번째 인자가 `valuationDateIso` 였음 → **`anchorIso`로 의미 변경** (변수명 변경 + 호출자 anchor 전달).
- NO 매핑은 anchor 기준 그대로 (이미지 5/H사 정합 유지).

### 3-4. `/api/kiwoom/valuation-2month/route.ts`
- 요청 Zod 동일 (valuationDate 입력)
- 라우트 내부에서:
  1. `anchor = resolveValuationAnchor(valuationDate)`
  2. slots = `buildSurroundingSlotsFromAnchor(anchor)` (또는 startOverrideDate 케이스 분기)
  3. `twoMonthSurroundingAvg`에 anchor 전달
- **응답 신규 필드**:
  ```ts
  {
    ...기존,
    inputValuationDate: "2022-12-03",       // 사용자 입력
    resolvedAnchor: "2022-12-02",           // shift 결과
    anchorShifted: true,                    // 보정 여부
    anchorShiftReason: "토요일",            // 보정 사유 라벨
    valuationPeriodStart: "2022-10-03",
    valuationPeriodEnd: "2023-02-01",
  }
  ```

### 3-5. `lib/kiwoom/averages.ts` `twoMonthSurroundingAvg`
- 시그니처에 `anchorIso` 추가 (또는 valuationDateIso 의미 변경). 산식·휴장 제외 동일.

### 3-6. `lib/calc/listed-stock-besshi.ts` `applyKiwoomValuationResponse`
- 응답에서 `resolvedAnchor`·`valuationPeriodStart`·`valuationPeriodEnd` 추출
- 어댑터 반환에 추가 — EstateItem에 channel-fill할 신규 필드 검토

### 3-7. `lib/tax-engine/types/inheritance-gift.types.ts` EstateItem
- **신규 필드**:
  ```ts
  /** 평가기준일 anchor 보정 결과 (자동조회 echo) */
  resolvedValuationAnchor?: string;        // ISO YYYY-MM-DD
  valuationAnchorShifted?: boolean;
  valuationAnchorShiftReason?: string;
  valuationPeriodStart?: string;
  valuationPeriodEnd?: string;
  ```

### 3-8. `lib/tax-engine/property-valuation-stock.ts` `evaluateListedStock`
- context.valuationDate → **`item.resolvedValuationAnchor ?? context.valuationDate`** 우선순위 (channel-fill 우선)
- `besshiData.page1.valuationDate` = 위 결정값 (shift된 anchor가 갑지 ④에 표시)
- besshiData에 valuationPeriod 추가:
  ```ts
  besshiData.page1.valuationPeriodStart?: string;
  besshiData.page1.valuationPeriodEnd?: string;
  ```

### 3-9. UI
- `KiwoomValuationAutoFetchButton` 응답 결과 카드:
  ```
  🔍 키움 자동조회 ...
  ✓ 종목 ... · 평가기준일 2022-12-03 (토요일) → 직전 거래일 2022-12-02 보정
    평가구간 2022-10-03 ~ 2023-02-01 (84거래일)
  ```
- `Page1CoverSection` (갑지) ④에 shift된 anchor 표시 (이미 echo로 전달됨)
- 시각 안내 — sky 배지 또는 amber 안내 카드 ([[ui_toggle_auto_visibility_policy]] 기조)

### 3-10. `evaluateListedStock` 호출자 (`ListedStockBesshiResultSection`·`PreviewCard`·`PdfDownloadButton`)
- context.valuationDate를 사용자 입력 그대로 넘김 → 엔진이 `item.resolvedValuationAnchor`를 우선 사용
- 호출자 측 변경 없음 (channel-fill 자동 우선순위)

---

## 4. 14 동기화 지점 영향

| # | 지점 | 변경 |
|---|---|---|
| ① | FormData | EstateItem에 5 신규 필드 (resolved anchor·shifted·reason·period start/end) |
| ② | initial | 신규 필드 undefined |
| ③ | normalize | 변경 없음 (string ISO) |
| ④ | API 변환 | EstateItem spread — 자동 전달 |
| ⑤ | UI 위젯 | 자동조회 카드 안내 + 갑지 ④ 표시 (자동 echo) |
| ⑥ | 사이드바 | 평가액 영향 0 (산식 동일) |
| ⑦ | 결과 카드 | 갑지 ④·평가구간 표시 자동 |
| ⑧ | validation | 추가 분기 없음 (자동조회 응답 echo만) |
| ⑨~⑩ | Zod enum | 변경 없음 |
| ⑫ | Zod 입력 객체 | EstateItem schema에 5 신규 optional |
| ⑬ | API body spread | 그대로 |
| ⑭ | coerceDates | string ISO 직접 사용 — Date 변환 불필요 |

---

## 5. anchor 테스트

### 5-1. 단위 anchor
`__tests__/lib/kiwoom/anchor-resolution.test.ts` (신규):
- AS-01·AS-02·AS-03·AS-04·AS-05 케이스 매트릭스 `resolveValuationAnchor` 검증
- `buildSurroundingSlotsFromAnchor` 시작·종료 일자 1일 보정 검증

`__tests__/lib/kiwoom/year-end-holiday.test.ts` (신규):
- 2001·2024 납회·연말 휴장 isYearEndNonTrading 검증

### 5-2. 통합 anchor
`__tests__/api/kiwoom/valuation-2month-anchor.test.ts` (또는 기존 spec 확장):
- 응답에 inputValuationDate·resolvedAnchor·anchorShifted·valuationPeriodStart/End 포함 검증

`__tests__/tax-engine/listed-stock/ls-anchor-shift.test.ts` (신규):
- EstateItem.resolvedValuationAnchor 있는 경우 evaluateListedStock의 besshiData.page1.valuationDate가 shift된 anchor가 됨
- valuationPeriodStart/End가 갑지 표시값으로 echo

### 5-3. E2E 확장
`e2e/listed-stock-besshi.spec.ts` LS-E2E-3 신규:
- 평가기준일을 토요일로 설정 → 자동조회 → 자동조회 카드 안내 "직전 거래일 보정" 텍스트 표시 검증

### 5-4. 회귀 가드
- 기존 LS-01 (이미지 H사) — 평가기준일이 거래일이라 shift 없음. 영향 0.
- 기존 키움 자동조회 흐름 — anchor shift 적용 시 응답 일자가 달라질 수 있음. 본 변경 후 H사 anchor 재검증.

---

## 6. 단계 분할 (4 커밋)

| Phase | 내용 | 회귀 |
|---|---|---|
| Phase 1 | `year-end-holiday.ts` + `calendar.ts` 확장 (`resolveValuationAnchor`·`buildSurroundingSlotsFromAnchor`·납회 fixture) + 단위 anchor | 0 |
| Phase 2 | `two-month-grouping.ts`·`averages.ts`·`route.ts` anchor 기반 시그니처 + 응답 신규 필드 | 0 |
| Phase 3 | `EstateItem` 신규 필드 + `evaluateListedStock` echo + `applyKiwoomValuationResponse` 어댑터 | 0 |
| Phase 4 | UI 안내 카드 + 갑지 ④ shift anchor 표시 + E2E | 0 |

각 Phase:
- `npx tsc --noEmit` 0건
- `npm test` 회귀 0
- 신규 anchor PASS

---

## 7. 후속·리스크

- **AS-04 일요일**: `resolveValuationAnchor`가 cursor를 -1일씩 거꾸로 가면서 거래일 만날 때까지 — 일요일 → 토요일 → 금요일 (3 iteration). 무한 루프 가드: 최대 30일 이전까지 search 후 fallback.
- **AS-05 다중 비거래일 연쇄**: 2024-01-01 → 12.31 납회 → 12.30 토 → 12.29 일 → 12.28(목) 거래일 (4 iteration). cursor decrement loop가 정상 처리.
- **AS-07·AS-08 12.28이 토·일**: 사용자 명시 — 납회 jump 후에도 일반 search 로직이 추가로 거꾸로 진행. 별도 분기 불필요(year-agnostic 단순 fixture + 일반 anchor shift 조합으로 자동).
- **갑지 ④ 표시 변경**: 사용자 입력 12-03 → 갑지 12-02. 사용자 혼란 가능 → 자동조회 카드 안내 메시지로 명확화.
- **기존 H사 (LS-01) 회귀**: valuationDate 2022-07-06 (수) — 거래일이라 shift 없음. 시작 2022-05-07·종료 2022-09-05 (현행 5-06·9-06과 차이). **현행 매트릭스보다 시작·종료 1일씩 단축** 검증 필요. 단 H사 이미지 5의 beforeM2 NO 31 = 05월 07일 표시는 본 정정과 정합 (현행 NO 매핑이 D-61=05-06으로 1일 어긋났음 — 본 정정으로 자동 보정 또는 NO 매핑 동시 조정).
- **무한 루프 가드** (`resolveValuationAnchor`): cursor를 최대 30일 이전까지 search. 그 안에 거래일 없으면 (이론상 불가능 — 30일 안에 무조건 영업일 존재) `TaxCalculationError` 또는 사용자 안내. 정상 경로에서는 6일 이내 종료(AS-05 신년 휴장+납회+주말 최악 케이스).
- **NO 매핑 정합 (LS-01 H사)**: 현재 `splitTwoMonthSurroundingByMonthGroup`의 beforeM1/beforeM2/afterM1/afterM2 NO 매핑이 시작·종료 ±1일 보정 후 1일 어긋날 가능성. anchor·시작·종료를 인자로 받아 [start, end] 범위 안에서 NO를 매기는 방식으로 정정 검토 (Phase 2 anchor 검증 시 결정).

---

## 8. 정책 cross-link

- [[korean-law-citation-verify]] — 이미지 13 본문(상증령 §52의2②) + 서울 46014-10598(2002.5.6.)·서사-1646(2004.10.18.) 인용 KoreanLaw MCP 재검증
- [[echo-field-pattern]] — 어플 응답·EstateItem·besshiData 3층 echo로 dual-truth 차단
- [[ui_engine_dual_truth_avoidance]] — UI는 echo만 표시, 직접 anchor 보정 재계산 금지
- [[pre-do-anchor-verification]] — Phase 1 단위 anchor RED 우선 작성 후 디자인 환류

# §165⑤ 종가평균 증자·합병 기간 조정 — 엔진 설계 (B-5)

> 계획: `docs/00-pm/stock-transfer-165-5-capital-event-b5.plan.md` · 기준 origin/master `50395f44`
> 법령: 상증령 §52의2②(상장 종가평균 기간 조정·기간 절단) + §99①3→§63①1가목 준용. **§165⑤ proxy 적용은 해석(명문·예규 미확인 — 사용자 결정 2026-06-13)**
> 메커니즘: 증자·합병 발생일 기준 평균 윈도우 절단(환산주식수 아님). §52의2②2호 forward 윈도우(상장일~발생일 전일)

## 1. 케이스 인벤토리 (계획 §2 → 엔진 동작)

| # | hasIncrease | 발생일 | 발생일 위치 | 엔진 동작 | anchor |
|---|---|---|---|---|---|
| C-1 | false | — | — | 전체 단순 평균(현행·회귀 0) | B5-ENGINE-1 |
| C-2 | true | 입력 | 상장일 < 발생일 ≤ 상장일+1월 | §52의2②2호 절단: date < 발생일 종가만 평균 | B5-ENGINE-2 |
| C-3 | true | 입력 | 윈도우 밖 | 절단 무효 → 전체 평균 + warning | B5-ENGINE-3 |
| C-4 | true | 미입력 | — | validate ⑧ 차단 · 엔진 방어 전체 평균 + warning | (validate) |
| C-5 | true | 입력 | 절단 후 거래일 0 | 전체 평균 + warning | B5-ENGINE-4 |
| C-6 | true | 2회+ | — | 비스코프(단일 발생일) | — |

## 2. 알고리즘 — `calcClosingAvgWithEvent` (신규 래퍼)

`stock-valuation-post-listing.ts`(또는 sibling) — 기존 `calcMonthlyClosingAverage`를 감싸 절단 선처리:

```ts
export interface ClosingAvgWithEventResult {
  avg: number;
  tradingDays: number;
  truncation?: {            // 절단 발동 시만 (C-2)
    eventDate: string;
    includedDays: number;
    excludedDays: number;
  };
  warning?: string;         // C-3·C-5
}

export function calcClosingAvgWithEvent(closing: {
  dates: string[]; closes: number[]; basisDate: string;
  hasIncrease: boolean; increaseDate?: string;
}): ClosingAvgWithEventResult {
  const base = calcMonthlyClosingAverage(closing.dates, closing.closes);
  if (!closing.hasIncrease || !closing.increaseDate) {
    return { avg: base.avg, tradingDays: base.tradingDays };        // C-1
  }
  const event = closing.increaseDate;
  // §52의2②2호 (forward 윈도우): 상장일 ~ 발생일 전일. date < event 인 셀만.
  const keptDates: string[] = [];
  const keptCloses: number[] = [];
  let excluded = 0;
  for (let i = 0; i < closing.dates.length; i++) {
    const d = closing.dates[i]; const c = closing.closes[i];
    if (!d || typeof c !== "number" || c <= 0) continue;            // 빈 셀
    if (d < event) { keptDates.push(d); keptCloses.push(c); }       // 문자열 YYYY-MM-DD 사전식 = 날짜순
    else excluded++;
  }
  // C-3: 발생일이 윈도우 밖(절단 결과 = 원본과 동일, excluded 0) → 전체 평균 + warning
  if (excluded === 0) {
    return { avg: base.avg, tradingDays: base.tradingDays,
      warning: "증자·합병 발생일이 종가 윈도우(상장일 이후 1개월) 밖이거나 이후 종가가 없어 기간 조정이 적용되지 않았습니다." };
  }
  const trunc = calcMonthlyClosingAverage(keptDates, keptCloses);
  // C-5: 절단 후 거래일 0 → 전체 평균 + warning
  if (trunc.tradingDays <= 0) {
    return { avg: base.avg, tradingDays: base.tradingDays,
      warning: "증자·합병 발생일 이전 종가가 없어 기간 조정이 적용되지 않았습니다." };
  }
  return { avg: trunc.avg, tradingDays: trunc.tradingDays,           // C-2
    truncation: { eventDate: event, includedDays: trunc.tradingDays, excludedDays: excluded } };
}
```

### 2.1 날짜 비교 (정밀도)
- `dates`는 `YYYY-MM-DD` 고정 포맷 → 문자열 사전식 비교 = 날짜순(Date 객체 불요·timezone 함정 회피). `d < event` 안전.
- 발생일 당일 제외(§52의2②2호 "전일까지") = `d < event`(당일 미포함). 경계 anchor B5-HELPER-1.

### 2.2 §52의2②2호 채택 근거 (forward 윈도우)
- §165⑤ 상장일 이후 1개월 = 평가기준일(상장일) **이후** 윈도우. 발생일은 평가기준일 이후 → §52의2②2호 "평가기준일 이전 2월부터 사유 발생일 전일까지" → 양도세 매핑(이전 2월 없음): **상장일 ~ 발생일 전일**.
- §52의2②1호(이전 발생·양도일 직전 윈도우)는 §165③ 직접 케이스 — 비스코프(계획 §8).

## 3. input/result 타입 (`types/stock-transfer.types.ts`)

### 3.1 입력 (PostListingDetailInput.closing — 중첩)
```ts
closing?: {
  dates: string[]; closes: number[]; basisDate: string;
  hasIncrease: boolean;
  increaseDate?: string;   // 신규 — 증자·합병 발생일 YYYY-MM-DD. hasIncrease=true 시 필수(validate)
};
```

### 3.2 결과 (PostListingValuationResult)
```ts
capitalEventTruncation?: {   // 절단 발동 시만(C-2)
  eventDate: string; includedDays: number; excludedDays: number;
};
// warning은 기존 warnings[] 배열에 push(C-3·C-5)
```

신규 입력 1(nested increaseDate) + 결과 1(optional). UI flat 필드 `listingPriceIncreaseDate` 1개.

## 4. 적용 지점 (`calcClosingAvgWithEvent` 교체) — STEP 6 데이터 흐름 실측

데이터 흐름: 엔진 `stock-transfer-tax.ts:265` → `synthesizePostListingInput(input)`(:459) → `buildPostListingFromDetail(detail)`(:463) → **`:422`에서 `listingDatePriceAvg1Month` 합성 = 엔진 실제 환산값**. `:204`는 detail echo 전용. `:348`은 api/UI 프리뷰.

| 위치 | 역할 | 변경 |
|---|---|---|
| `post-listing-flat-adapter.ts:422` | **엔진 실제 환산값**(buildPostListingFromDetail) | `calcClosingAvgWithEvent(detail.closing).avg` |
| `post-listing-flat-adapter.ts:348` | api/UI 프리뷰(buildPostListingFromForm) | 동상 |
| `stock-valuation-post-listing.ts:204` | detail echo | `calcClosingAvgWithEvent(closing)` + truncation → `PostListingValuationResult.capitalEventTruncation` |
| `adaptFlatToPostListingDetail:222-227` | closing 구성 | `increaseDate: form.listingPriceIncreaseDate ?? ""` 추가 |

- truncation echo는 `:204` 경로에서 `capitalEventTruncation`에 주입(orchestrator `stock-transfer-tax.ts:272 postListingDetail = postListingResult` → 결과 카드 `result.postListingDetail.capitalEventTruncation` 읽음).
- **★ 비과세(K-OTC) 경로 자동 커버**: `exempt-informational-acquisition.ts:106`도 `synthesizePostListingInput`(→:422) 공유 → 별도 mirror 불필요(C-1 취득일거래정지와 다름).

## 5. 14 동기화 지점 (계획 §5)

①form `listingPriceIncreaseDate` ②initial "" ③normalize strField ④api closing.increaseDate ⑤UI(hasIncrease ON 시 DateInput+절단 미리보기) ⑥사이드바(무) ⑦결과카드(capitalEventTruncation+해석 미확인 안내) ⑧validate(hasIncrease ON+발생일 필수·full/listing_only) ⑨⑫Zod(closing.increaseDate optional) ⑩⑪N/A(nested) ⑬api closing spread ⑭route closing coerce. 상세 계획 §5·UI 설계.

## 6. 파일 영향

| 파일 | 작업 |
|---|---|
| `stock-valuation-post-listing.ts` | `calcClosingAvgWithEvent` 신규(+~30) + :204 교체 + truncation echo |
| `post-listing-flat-adapter.ts` | :348·:422 헬퍼 교체 + :226 increaseDate + PostListingFlatForm 필드 |
| `types/stock-transfer.types.ts` | closing.increaseDate + PostListingValuationResult.capitalEventTruncation |
| `legal-codes/stock.ts` | `SECTION_52_2_2_CAPITAL_EVENT` 상수("상증령 §52의2② (§63①1가목 준용)") |

## 7. anchor (계획 §6)

`__tests__/tax-engine/stock-transfer/section-165-5-capital-event-b5.test.ts` — B5-ENGINE-1~4·B5-HELPER-1·B5-REGRESS-1(사례48). Pre-Do: 사례48 + 기존 post-listing closing anchor 전수 통과 고정 + 절단 anchor 1건 실패 확보.

E2E 1건(포트3200): full 모드 closing 테이블 + hasIncrease ON + 발생일 → 절단 평균.

## 8. 비스코프 (계획 §8)
- §165③ 직접(§52의2②1호·양도일 직전 윈도우)·2회+ 발생·권리락 가격 환산. §165⑤ proxy 적용은 해석(명문·예규 미확인 — 결과 카드 명시).
</content>

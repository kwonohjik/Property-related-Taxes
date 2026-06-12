# §165⑤ 종가평균 증자·합병 기간 조정 — UI 설계 (B-5)

> 계획: `docs/00-pm/stock-transfer-165-5-capital-event-b5.plan.md` §5 · 엔진: `stock-transfer-165-5-capital-event-b5.engine.design.md`
> 원칙: dual-truth 금지(절단 미리보기는 엔진 헬퍼 `calcClosingAvgWithEvent` import) · 자동 fallback 금지(발생일 미입력=차단) · ToggleCard/DateInput 필수 · 결과 "원" 미표기 · **명문 미확인 해석 안내 필수**

## 0. 현황 (STEP 13 실측)
- `listingPriceHasIncrease`는 PostListingClosingPriceTable 타입 union(`:26`)에만 존재 — **실렌더 위젯 부재**(dead field). 본 PR이 토글·발생일·미리보기 신규.
- 적용 위치: `PostListingValuationCard`(취득 후 상장 환산 카드) 내 closing 테이블(`PostListingClosingPriceTable`) 인근. full/listing_only 모드만(simple은 closing 테이블 없음).

## 1. 증자·합병 ToggleCard (신규 — `PostListingValuationCard` 또는 ClosingPriceTable 하단)

```
<ToggleCard tone="rose"
  title="평가기간 중 증자·합병 발생 (상증령 §52의2②)"
  description="상장일 이후 1개월 종가 산정 기간 중 증자·합병이 있으면 ON — 발생일 이전 종가만 평균합니다(발생일·이후 제외). 권리락 등 가격 불연속 반영."
  checked={form.listingPriceHasIncrease}
  onCheckedChange={(v) => onChange({ listingPriceHasIncrease: v })}>
  <DateInput label="증자·합병 발생일"
    hint="상장일 이후 1개월 윈도우 내. 이 날짜 이전 종가만 평균에 포함됩니다."
    value={form.listingPriceIncreaseDate}
    onChange={(v) => onChange({ listingPriceIncreaseDate: v })} />
  {/* 명문 미확인 해석 안내 */}
  <p className="text-xs text-amber-700">
    ⓘ §165⑤ 환산의 상장일 종가평균에 §52의2② 기간 조정 적용은 해석에 따른 것으로, 명문·예규로 확정되지 않았습니다.
  </p>
</ToggleCard>
```

- full/listing_only 모드에서만 노출(simple은 closing 테이블 부재). `unlistedDetailMode !== "simple"` 게이트.

## 2. 절단 미리보기 (`PostListingClosingPriceTable`)

종가 테이블 하단 평균 미리보기(`:123` `calcMonthlyClosingAverage` 미리보기)를 절단 반영으로 교체:

- `listingPriceHasIncrease && listingPriceIncreaseDate` 시 **엔진 헬퍼 `calcClosingAvgWithEvent` import**(UI 자체 재계산 금지 [[feedback_ui_engine_dual_truth_avoidance]])로 절단 평균 산출.
- 발생일 이상(`date >= 발생일`) 종가 셀은 **회색 처리 + 취소선**(제외 시각화), 발생일 이전만 강조.
- 미리보기 문구: "기간 조정 후 평균 {truncatedAvg} (포함 {includedDays}거래일 · 제외 {excludedDays}일)". 절단 미발동(발생일 윈도우 밖)이면 전체 평균 + "발생일이 윈도우 밖 — 조정 미적용" 회색 안내.

## 3. 결과 카드 (`StockTransferTaxResultViewHelpers` — EstimatedValuationBreakdown post_listing 분기)

`result.postListingDetail.capitalEventTruncation` 존재 시 환산 분해에 행 추가:

```
증자·합병 기간 조정 (상증령 §52의2② · §63①1가목 준용 해석):
  발생일 {eventDate} — 상장일~발생일 전일 종가만 평균 (포함 {includedDays}거래일 · 제외 {excludedDays}일)
  ⓘ 명문·예규 미확정 해석 적용
```

- "원" 미표기. capitalEventTruncation 부재 시 행 없음(C-1·C-3·C-5). C-3·C-5 warning은 결과 warnings 영역(기존).

## 4. 14지점 UI 서브셋

| # | 지점 | 작업 |
|---|---|---|
| ① | FormData | `listingPriceIncreaseDate: string`(store, listingPriceHasIncrease 인근) |
| ② | initial | `""` |
| ③ | normalize | `strField("listingPriceIncreaseDate")` |
| ⑤ | UI 위젯 | §1 ToggleCard+DateInput + §2 절단 미리보기 |
| ⑥ | 사이드바 | 무변경 |
| ⑦ | 결과 카드 | §3 |
| ⑧ | validate | hasIncrease ON + 발생일 미입력 차단(full/listing_only 모드). 윈도우 범위 경고(simple 무관) |

④⑨⑫⑬⑭(api closing.increaseDate·Zod closing nested·route coerce)는 계획 §5. ⑩⑪ N/A(nested postListingDetail).

## 5. E2E (`e2e/stock-transfer-165-5-capital-event.spec.ts`, `E2E_PORT=3200`)

E-1 (full 모드 closing + 증자·합병):
- 취득 후 상장 토글 ON → full 모드 → closing 테이블 종가 입력(발생일 전후 분산) → 증자·합병 토글 ON → 발생일 입력
- §52의2② 안내 노출 단언 + 절단 미리보기 제외 셀 단언
- 계산 → `json.result.postListingDetail.capitalEventTruncation.excludedDays > 0` + truncated avg < 전체 avg(상승 종가 가정)

함정: ToggleCard 제목 exact 클릭("평가기간 중 증자·합병 발생 (상증령 §52의2②)"). closing 테이블 다수 종가 입력은 기존 post-listing E2E 패턴 재사용. full 모드 진입 경로 확인.

## 6. 비스코프
- §165③ 양도일·취득일 직전 1개월(§52의2②1호) UI — 후속. 2회+ 발생일. 권리락 자동 환산.
</content>

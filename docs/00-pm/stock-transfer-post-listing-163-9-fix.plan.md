# 취득 후 상장 §165⑤ 환산취득가 — 시행령 §163⑨ 산식 누락 수정 계획서

> 사용자 보고 — 취득 후 상장(§165⑤) 분기에서 1주당 취득기준시가를 그대로 취득가로 사용 중.
> 시행령 §163⑨ 환산 산식(양도가 × 취득기준 / 양도기준) 미적용.
> 작성일 2026-05-18 · 대상 `lib/tax-engine/stock-transfer/stock-valuation-post-listing.ts`

## 1. 버그 확인

### 1.1 현재 동작

`stock-valuation-post-listing.ts:268-281`:

```ts
// 환산비율 = 취득연도 평가 / 상장연도 평가
const conversionRatio = acquisitionYearPerShareValue / listingYearPerShareValue;
// 1주당 취득기준시가 = 상장일 이후 1개월 종가평균 × 환산비율
const rawPerShare = listingDatePriceAvg1Month * conversionRatio;
const finalPerShareValue = Math.floor(rawPerShare);
const totalAcquisitionPrice = finalPerShareValue * shareCount; // ★ 잘못
```

→ 1주당 취득기준시가(`finalPerShareValue` = 5,824) × shareCount(5,000) = 29,120,000. **시행령 §163⑨ 환산 산식(양도가 × 취득기준/양도기준) 미적용**.

### 1.2 사용자 PDF 사례 산식

| 항목 | 값 |
|---|---|
| 양도가 | 44,750,000 |
| 1주당 양도기준시가 (양도일 직전 1개월 평균) | 8,659 |
| 1주당 취득기준시가 (§165⑤ 보정) | 5,824 |
| 주식수 | 5,000 |
| 양도기준시가 합계 | 8,659 × 5,000 = 43,295,000 |
| 취득기준시가 합계 | 5,824 × 5,000 = 29,120,000 |
| **환산취득가** | 44,750,000 × 29,120,000 / 43,295,000 ≈ **30,098,625** |

### 1.3 §163⑨ 산식 (사용자 산식과 동일)

시행령 §163⑨:
```
환산취득가 = 양도가 × (취득시 기준시가 / 양도시 기준시가)
```

이는 본 PR `fd494a3`에서 일반 상장 환산 경로(§163⑨ 직접 적용)에는 수정되었으나, **취득 후 상장(§165⑤) 분기에는 미적용**. §165⑤는 "1주당 취득기준시가 산정 보정"만 정의 — 그 후 §163⑨ 환산 산식이 추가 적용되어야 한다.

## 2. 법령 근거 (Pre-Do KoreanLaw 검증)

| 조문 | 내용 |
|---|---|
| 시행령 §165⑤ 본문 | 취득 후 상장 — 1주당 취득기준시가 = 상장일 이후 1개월 종가평균 × (취득연도 평가 / 상장연도 평가) |
| 시행령 §163⑨ | 환산취득가 = 양도가 × (취득시 기준시가 / 양도시 기준시가) — **§165⑤ 결과를 §163⑨ 분자(취득기준시가)로 사용** |
| 모법 §99①3 | 양도시 기준시가 = 양도일 직전 1개월 종가평균 |

> ★ Pre-Do: KoreanLaw MCP로 §165⑤ 본문이 §163⑨를 준용하는지 확인. 사용자 산식과 일치 확인.

## 3. 인터뷰

> **사용자가 명확한 산식을 제시 (PDF 사례 30,098,625) → 추가 인터뷰 불필요.** 권장안 4건 확정 진행. 변경 시 즉시 plan 갱신.

| # | 결정 | 권장안 |
|---|---|---|
| Q1 | §165⑤ 분기 안에서 §163⑨ 적용 위치 | **stock-transfer-tax.ts STEP 3 호출자**에서 post-listing 결과(`finalPerShareValue`)를 받은 후 §163⑨ 추가 적용. PostListing 모듈은 "1주당 취득기준시가" 산정만 책임 (단일 책임 원칙) |
| Q2 | 양도기준시가 입력 | **현행 `transferDatePriceAvg1Month`** (양도일 직전 1개월 평균) 재사용. 이미 환산 모드 input에 존재 |
| Q3 | floor 단위 | **총액 단위 floor 1회** — `floor(transferPrice × finalPerShareValue × shareCount / (transferStd × shareCount))` = `floor(transferPrice × finalPerShareValue / transferStd)` |
| Q4 | 개산공제 base 영향 | `acquisitionStdPriceTotal` = `finalPerShareValue × shareCount`는 그대로 유지 (§163⑥4 base). 환산취득가만 §163⑨ 적용 |

## 4. 설계

### 4.1 엔진 로직 변경

**`stock-transfer-tax.ts` STEP 3 — `acquisitionMode === "estimated" && acquiredBeforeListing` 분기**:

```ts
if (input.acquiredBeforeListing) {
  // §165⑤ — 1주당 취득기준시가 산정
  const synthesizedInput = synthesizePostListingInput(input);
  const postListingResult = calcPostListingConversion(synthesizedInput);

  // §165⑤ 본문 산정값 → §163⑨ 환산 분자
  const acqStdPerShare = postListingResult.finalPerShareValue;
  const transferStd = input.transferDatePriceAvg1Month ?? 0;

  if (transferStd > 0 && acqStdPerShare > 0) {
    // §163⑨ 환산: 환산취득가 = 양도가 × (취득기준시가 / 양도기준시가)
    //   1주당 단위 비율 = acqStdPerShare / transferStd
    acquisitionPrice = Math.floor(
      safeMultiply(transferPrice, acqStdPerShare) / transferStd
    );
  } else {
    // transferStd 미입력 — 방어 fallback. validate에서 차단 권장.
    acquisitionPrice = postListingResult.totalAcquisitionPrice;
  }

  // 개산공제 base = §165⑤ 보정 후 1주당 취득기준시가 × shareCount (§163⑥4)
  estimatedBase = acqStdPerShare * shareCount;
  postListingDetail = postListingResult;

  valuationDetail = {
    method: "post_listing_conversion",
    netAssetFloorApplied: false,
    finalPerShareValue: acqStdPerShare, // 1주당 취득기준시가 (환산 전)
  };
  // ... appliedRules push 그대로 ...
}
```

### 4.2 결과 echo — postListingResult 확장 (선택)

`PostListingValuationResult`에 환산 단계 echo 필드 추가:

```ts
export interface PostListingValuationResult {
  // 기존 필드들 ...
  /** §163⑨ 환산 분자 — 1주당 취득기준시가 (§165⑤ 보정 후) */
  perShareAcquisitionStdPrice?: number;
  /** §163⑨ 환산 분모 — 양도시 1주당 기준시가 */
  perShareTransferStdPrice?: number;
  /** 최종 §163⑨ 환산 후 총액 환산취득가 */
  conversionToTotalAcquisitionPrice?: number;
}
```

→ UI 결과 카드(`PostListingDetailCard`)에서 4단계 산식 노출 가능.

### 4.3 UI — `PostListingDetailCard`

산식 표시 갱신 (4단계 → 5단계로):

```
[1] 상장연도 1주당 가중평균 = 순손익×3/5 + 순자산×2/5 = 39,082
[2] 취득연도 1주당 가중평균 = 28,451
[3] 환산비율 = 28,451 / 39,082 = 0.728
[4] 1주당 취득기준시가 = 종가평균 8,001 × 0.728 = 5,824 (§165⑤)
[5] 환산취득가 = 양도가 44,750,000 × (5,824 × 5,000) / (8,659 × 5,000) (§163⑨)
              = 44,750,000 × 5,824 / 8,659 = 30,098,625
```

### 4.4 Validation

`stock-transfer-tax-validate.ts` — acquiredBeforeListing + listed 분기에서 transferDatePriceAvg1Month 이미 필수 (line 395). 본 PR에서 별도 추가 검증 불요.

## 5. 케이스 매트릭스 (anchor)

기본 입력 — 사용자 PDF 사례 (`shareCount=5000`, `acquisitionMode="estimated"`, `acquiredBeforeListing=true`):

| ID | 양도가 | 양도기준 | 1주당 취득기준 (§165⑤) | 환산취득가 (§163⑨) | 개산공제 |
|---|---|---|---|---|---|
| **PL-1** ★ Pre-Do | 44,750,000 | 8,659 | 5,824 | floor(44,750,000 × 5,824 / 8,659) = **30,098,625** | 29,120,000 × 1% = **291,200** |
| **PL-2** | 50,000,000 | 10,000 | 5,000 | 50,000,000 × 5,000 / 10,000 = 25,000,000 | 250,000 |
| **PL-3** | 44,750,000 | 0 (미입력) | 5,824 | fallback = 29,120,000 (기존 동작) + validate 차단 | 291,200 |
| **PL-4** | 44,750,000 | 5,824 (양도=취득) | 5,824 | 환산비율 1.0 → 44,750,000 (양도차익 0) | 291,200 |
| **PL-5** | 비과세 분기 (장내) | 8,659 | 5,824 | 30,098,625 정보용 echo, finalTax=0 | 291,200 |

**PL-1 정밀 계산**:
- 44,750,000 × 5,824 = 260,624,000,000
- 260,624,000,000 / 8,659 = 30,098,625.13...
- floor = **30,098,625**
- 양도차익 = 44,750,000 − 30,098,625 − 291,200 = 14,360,175
- 기본공제 250만 → 과세표준 11,860,175 → floor 11,860,000 (§47② 1원 절사 — 확인 필요)
- × 비중소 20% = 산출세액 약 2,372,000

## 6. 작업 단계

1. **Pre-Do**: KoreanLaw MCP §165⑤ 본문·§163⑨·§99①3 원문 검증 + PL-1 anchor 우선 계산.
2. **엔진**: stock-transfer-tax.ts STEP 3 `acquiredBeforeListing` 분기에 §163⑨ 환산 적용. `exempt-informational-acquisition.ts:113` 분기에도 동일 적용 (비과세 echo).
3. **결과 echo** (선택): `PostListingValuationResult`에 환산 단계 필드 추가.
4. **UI**: `PostListingDetailCard` 산식 5단계로 확장 (§163⑨ 환산 행 추가).
5. **anchor PL-1~5**: 신규 `__tests__/tax-engine/stock-transfer/post-listing-163-9-conversion.test.ts`.
6. **기존 anchor 정정**: `project_stock_transfer_post_listing_pdf_replica` 관련 anchor 36건 중 환산취득가·개산공제·산출세액 anchor 전부 정정.
7. **회귀 통과**: 전체 vitest 0건 회귀.
8. **브라우저 수동 확인**: PDF 사례 입력 → 결과 카드 환산취득가 30,098,625 표시 확인.

## 7. 리스크

- **R-1 기존 PDF 사례 anchor 36건 영향**: `project_stock_transfer_post_listing_pdf_replica` 의 anchor 다수가 `totalAcquisitionPrice=29,120,000`을 기대 → 모두 30,098,625 (또는 PDF 사례별 환산값)으로 정정 필요. 사용자 PDF 사례 재anchor.
- **R-2 양도기준시가 transferDatePriceAvg1Month 입력 강제**: 현재 validate에서 이미 필수 (line 395). 누락 시 fallback으로 환산 미적용. validate 차단으로 보완.
- **R-3 환산비율 1.0 케이스**: 양도기준시가 = 취득기준시가일 때 환산취득가 = 양도가. 양도차익 = -개산공제 (음수). max(0,·) 처리 확인.
- **R-4 비과세 정보용 echo 경로 일관성**: `exempt-informational-acquisition.ts:113`도 동일 갱신 필요. 누락 시 비과세 분기에서 잘못된 취득가 표시.
- **R-5 §163⑨ 환산 결과가 PostListingResult.totalAcquisitionPrice와 다름**: 호출자에서 환산 결과를 사용하므로 PostListingResult.totalAcquisitionPrice는 deprecated 또는 "환산 전 값"으로 의미 명시. UI/PDF에서 어느 값을 쓸지 명확화.
- **R-6 BigInt 안전**: 양도가 5조+ 케이스에서 transferPrice × acqStdPerShare 가 2^53 초과 가능. `safeMultiply` 사용.
- **R-7 fd494a3에서 같은 산식 적용했어야**: PR `fd494a3`는 일반 상장만 수정. §165⑤ 분기 동일 버그 — Pre-Do 누락. cross-cutting anchor로 두 분기 산식 일관성 강제 ([[feedback_engine_comment_vs_impl_drift]]).

## 8. Definition of Done

- [ ] Pre-Do: KoreanLaw §165⑤·§163⑨·§99①3 원문 검증 + PL-1 anchor 우선
- [ ] stock-transfer-tax.ts STEP 3 `acquiredBeforeListing` 분기에 §163⑨ 환산 적용
- [ ] exempt-informational-acquisition.ts 동일 갱신 (비과세 정보용 echo 일관성)
- [ ] (선택) PostListingValuationResult에 환산 단계 echo 필드 추가
- [ ] PostListingDetailCard 산식 5단계 (§163⑨ 행 추가)
- [ ] anchor PL-1~5 신규 + 기존 PDF 사례 anchor 36건 정정
- [ ] `npx tsc --noEmit` 0 errors
- [ ] 전체 회귀 통과 (`npm test` 0건 회귀)
- [ ] 브라우저 수동 확인 (PDF 사례 30,098,625 표시)
- [ ] memory 업데이트 — `project_stock_transfer_post_listing_163_9_fix.md` + feedback (§165⑤ + §163⑨ 합성 산식 정책)

## 9. 후속 PR 후보

- §97² 단서 swap (환산 + 개산공제 < 실비 시 swap) — KoreanLaw 검증 후
- PostListingValuationResult.totalAcquisitionPrice deprecated 처리
- PostListingDetailCard 4단계 → 5단계 UI/PDF 동기화

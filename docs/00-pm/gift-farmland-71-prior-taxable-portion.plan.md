# §71⑥ — 감면농지 prior는 과세부분(㉯)만 §47② 합산 (3차+ 증여)

> 법령: 조특법 §71⑥. 예규: 재산세과-2450·법규재산-2314. 단일 PR.

## 법령
조특법 §71⑥: "증여세를 감면받은 농지등은 §47②에 따라 합산하는 증여재산가액에 포함시키지 아니한다." → 감면받은 농지 **㉮ 합산 제외, 과세부분(㉯)만** 10년 일반증여와 합산.
- 법규재산-2314 원문 재확인(WebFetch): (2) "3차 증여분 중 과세부분은 ... 2차 증여분 중 과세부분(㉯)을 §47② 합산"; (3) "2차 계산 시 1차는 **전액** 합산". **3차 구체 숫자 예시는 원문에 없음**.
- → 라운드별 다름(2차=전액, 3차=㉯). FR-1(재재산-1454)은 2차라 1차 전액(현 구현 정합).

## 설계 — opt-in (FR-1 무회귀)
라운드 구분을 하드코딩하지 않고 **사용자 입력에 위임**: `PriorGift.farmlandTaxablePortion`(㉯) 신규 필드. 설정 시 §47② 합산에 giftAmount 대신 ㉯. 미설정이면 전액(FR-1 2차 불변). 사용자는 결과 화면 ㉯(excessFarmlandValue) 값을 다음 회차 prior 입력으로 사용.

## 구현 (4파일, 14지점)
- `inheritance-prior-gift.types.ts`: PriorGift.farmlandTaxablePortion (①②③ 자동).
- `gift-prior-aggregation.ts`: `priorAggregatedValue(p)` = farmlandReductionApplied && farmlandTaxablePortion!=null ? ㉯ : giftAmount. totalAmount·breakdown 적용.
- `prior-gift-schema.ts`: Zod ⑫.
- `GiftRowEditor.tsx`: §71 prior 토글 children에 ㉯ 입력 (⑤). 토글 OFF 정리.
- API ⑬: gift-api.ts `...rest` spread 자동 보존(strip 없음). ⑭ Zod cast 자동. ⑧ opt-in(하드 요구 없음).

## anchor (farmland-reduction-71-prior-taxable-portion.test.ts)
부친→자녀, 금번 현금 3억, 직전 농지B(감면) ㉯=5억(전액 8.13066억).
- 합산 증여가액 = 3억 + ㉯ 5억 = 8억 (현행 버그: 3억 + 전액 8.13066억 = 11.13066억). aggregatedGiftValue 공제 무관.
- 무회귀 2: ㉯ 미설정 → 전액 11.13066억 / farmlandReductionApplied=false → 전액.

## 검증
- [x] anchor 3/3 + tsc 0 + gift 62
- [ ] 전체 스위트 + code-analyzer
- [ ] 커밋·푸시·머지

## SCOPE_OUT
라운드 자동판정(2차 전액/3차 ㉯ 하드코딩) — 사용자 위임으로 대체. ㉯ 자동 prefill(직전 회차 결과 연동) — 후속.

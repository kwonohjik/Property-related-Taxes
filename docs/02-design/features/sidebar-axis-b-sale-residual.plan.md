# 사이드바 축 B(같은 물건 지분 분할) 양도가액 — 계산 전에 서버의 잔액 흡수가 빠진다 (측정 + 계획)

> 출처: `bundled-axis-b-order-independence`(V-7, #2786) 작업에서 «`computeApportionedSaleMap`이 바닥 잔여가 있으면 null을 돌려준다»를 함수 수준으로만 확인하고 별건으로 남긴 항목. 이번에 폼 → 사이드바(`computeTransferPerAssetSummary`) → route 전 경로로 쟀다.
> 규칙: 추정 금지 — 아래 수치는 모두 throwaway probe 실측이다(probe는 커밋하지 않는다). 측정 기준 코드 = master `f0be0b78a`(#2800 머지 후).

## 0. 결론

| 질문 | 결과 |
|---|---|
| 사이드바가 계산 전에 틀린 값을 보이나 | **보인다.** 축 B(지분 자산 전부, 같은 물건)에서 `floor(총액 × 지분율)`의 합이 총액과 다르면(잔여 ≠ 0) 사이드바는 각 자산을 `floor` 값 그대로 보여 **자산별 양도가액 합 ≠ 계약 총액**이다. 서버는 한 자산이 잔액을 흡수해 합 = 총액이다. 측정한 잔여 있는 셀 12/12(두 모드 × 6시료)가 모두 흡수 자산 1행만 어긋난다(V-2). |
| 얼마나 어긋나나 | 1/3×3 · 10억: 사이드바 합 999,999,999(−1) · 흡수 자산 333,333,333 ↔ 엔진 333,333,334. 60/40 · 7,777,777: 합 7,777,776(−1). 14.29×7(합 100.03%) · 10억: 합 **1,000,300,000(+300,000)** · 마지막 자산 142,900,000 ↔ 엔진 142,600,000(−300,000). 90/5/5.06(합 100.06%): 마지막 자산 50,600,000 ↔ 엔진 50,000,000(V-2·V-4). |
| 계산 후에는 | 정상이다. 사이드바는 `bundledMatch`로 엔진 echo(`allocatedSalePrice`)를 그대로 읽는다 — 12셀 전부 계산 후 값 = 엔진 값(V-2). |
| 세액에 영향이 있나 | **없다.** 계산 전 표시만 다르다. 취득가액·필요경비·라벨(`saleIsApportioned`·pending)은 계산 전후가 같았다 — 어긋나는 칸은 양도가액 한 칸뿐(V-3). |
| 원인 | ① `computeApportionedSaleMap`은 축 B 지분 자산 전부에 `fixedSalePrice = floor(총액 × 지분율)`을 주고 `apportionBundledSale`을 부르는데, 전 자산 고정가에서 Σ고정가 ≠ 총액이면 엔진이 **throw**한다 — 잔여 > 0은 `잔여 양도가액이 있으나 안분 대상 자산이 없습니다`, 잔여 < 0(합 100.03% 등)은 `구분 기재된 양도가액 합이 총 양도가액을 초과합니다` → `catch`가 null (`helpers.ts:149`). ② 서버는 같은 입력에 앞서 «흡수 자산이 잔액을 받는 보정»을 하는데(`bundled-apportionment.ts:188-204`) **사이드바에는 그 보정이 없다.** ③ null이면 `summary.ts:291-293`의 폴백이 `applyRatio(총액, 지분율)`(floor)을 보인다. ④ `canApportion`은 안분 모드(`bundledSaleMode === "apportioned"`)일 때만 맵을 만들어, **실가 모드 축 B는 맵 자체를 건너뛰고 같은 폴백을 탄다**(V-1). 두 모드 계산 전 값은 동일(V-2). |
| 해법 | 서버의 흡수 규칙(확정 가액 > 0 컴패니언 중 assetId 사전순 최대, 컴패니언 없으면 주 자산)을 **공유 순수 함수 한 곳**으로 빼서 서버와 사이드바가 같이 쓴다. 사이드바는 축 B면 모드와 무관하게 이 값을 쓰고, 합이 허용 대역 밖이면(편집 중) 지금처럼 입력값 그대로 둔다. |

## 1. 측정 (V 레지스터)

**V-1 코드 경로(실제 파일)**
- `lib/stores/transfer-per-asset-summary.ts:127` — `apportionedMap = !bundledResult && canApportion(formData) ? computeApportionedSaleMap(formData) : null`
- `lib/stores/transfer-per-asset-summary-helpers.ts:97` `canApportion` — **`bundledSaleMode !== "apportioned"`면 false**(그 아래 `axisB && ownershipRatioOf(a) < 1` 예외는 안분 모드 안에서만 의미).
- 같은 파일 `:132-151` `computeApportionedSaleMap` — 축 B면 지분 자산에 `fixedSalePrice: applyRatio(total, ratio)`(`:143`), 흡수 없음, `catch`에서 null(`:149`).
- 엔진 `lib/tax-engine/bundled-sale-apportionment.ts` — `residualSale < 0`이면 «합이 총액을 초과» throw, `variableIndices.length === 0 && residualSale > 0`(`:106-109`)이면 «안분 대상 자산이 없습니다» throw.
- 서버 `app/api/calc/transfer/bundled-apportionment.ts:188-204` — 축 B이고 전 자산 확정 가액이면 `확정 가액 > 0 컴패니언 중 assetId 사전순 최대`(컴패니언 없으면 주 자산)가 `총액 − 나머지 합`을 흡수(#2786).
- `summary.ts:283-294` — 맵이 있으면 맵 값, 없으면 축 B·단건 지분은 `applyRatio(총액, 지분율)`(`:291-293`).

**V-2 폼 → 사이드바 → route 실측** — 토지 축 B(지분 자산 2~7, assetId `A1`…`A7`), 총액 아래 표. 사이드바 = `computeTransferPerAssetSummary(form, null)`(계산 전) · 엔진 = route 200 응답의 `apportionment.apportioned[].allocatedSalePrice` · 계산 후 = `computeTransferPerAssetSummary(form, route data)`. 실가 모드·안분 모드 두 번씩 쟀고 **계산 전 값은 두 모드가 같다.**

| 시료 | 맵 | 사이드바(계산 전) 자산별 → 합 | 엔진 자산별 → 합 | 계산 후 |
|---|---|---|---|---|
| 50/30/20 · 10억(잔여 0) | 있음 | 5억·3억·2억 → 10억 | 같음 | 같음 |
| 33.33/33.33/33.34 · 10억(잔여 0) | 있음 | 같음 | 같음 | 같음 |
| 33.33×3 · 10억 | **null** | 333,300,000 ×3 → **999,900,000** | …·…·333,400,000 → 10억 | = 엔진 |
| 1/3×3 · 10억 | **null** | 333,333,333 ×3 → **999,999,999** | …·…·333,333,334 → 10억 | = 엔진 |
| 50/50 · 1,000,000,001 | **null** | 5억·5억 → **10억** | 5억·500,000,001 → 1,000,000,001 | = 엔진 |
| 60/40 · 7,777,777 | **null** | 4,666,666·3,111,110 → **7,777,776** | 4,666,666·3,111,111 → 7,777,777 | = 엔진 |
| 14.29×7 · 10억(합 100.03%) | **null** | 142,900,000 ×7 → **1,000,300,000** | …(6개)·142,600,000 → 10억 | = 엔진 |
| 1/3×3 · 1,000,000,001 | **null** | 333,333,333 ×3 → **999,999,999** | …·…·333,333,335 → 1,000,000,001 | = 엔진 |

- 어긋나는 것은 흡수 자산 1행뿐이다. 이 시료들은 흡수 자산이 마지막 행(`A3`·`A7`…)이다.
- 잔여가 0인 시료 2건(50/30/20 · 33.33/33.33/33.34)은 맵이 정상이고 전부 일치한다 — 문제는 «잔여가 생기는 입력»에만 있다.

**V-3 취득가액·필요경비·라벨** — 같은 6셀(실가 모드, 안분 모드도 동일)에서 계산 전후 행을 전 칸 대조했다: `acqPrice`·`expense`·`saleIsApportioned`·`salePending`·`acqPending`·`expensePending`은 **전부 같고 `salePrice`만 다르다.**

**V-4 흡수 규칙이 모두 «행 위치»가 아님** — 서버의 흡수 자산은 확정 가액 > 0 컴패니언 중 assetId 사전순 최대다(#2786). 위 시료는 입력 순서와 사전순이 같아 구분되지 않는다. 사이드바에서 맞추려면 위치가 아니라 이 규칙을 그대로 써야 한다(주 자산은 위치 0으로 제외 — 서버는 `"primary"` 리터럴이라 id가 아니라 위치로 가른다). 사이드바의 `assetId`는 폼 자산 id이고 서버 컴패니언 id도 같은 값이다(계산 후 `bundledMatch`가 `a.assetId`로 찾는 것으로 확인된 규약). **컴패니언 간 사전순 ≠ 입력 순서인 시료는 측정하지 않았다 — 확인 필요**(구현 시 anchor로 쟀다).

**V-5 대역 밖 입력(편집 중)** — 사이드바 계산 전 값(실가 모드):

| 시료 | 맵 | 사이드바 | route |
|---|---|---|---|
| 70/70/70(합 210%) · 10억 | null | 7억 ×3 → 21억 | 400 |
| 50/30/10(합 90%) · 10억 | null | 5억·3억·1억 → 9억 | 400 |
| 50/30/19.9(합 99.9%) · 10억 | null | 5억·3억·1.99억 → 9.99억 | 400 |
| 90/5/5.06(합 100.06% — 허용 경계) · 10억 | null | 9억·5천만·**50,600,000** → 1,000,600,000 | 200 · 엔진 9억·5천만·**50,000,000** |
| 1/3×3 · 총액 0 | null | 0 ×3 | 400 |

대역 밖 입력은 route가 400이라 «엔진 값»이 없다. 사이드바가 입력 지분율을 그대로 보이는 것이 자연스럽다(지분율을 고치게 하는 편이 맞다). 흡수를 이 구간에서도 하면 합 210%는 마지막 자산이 −4억으로 보인다 — **대역 안에서만 흡수해야 한다.**

**V-6 같은 `총액 × 지분율` 계산 전 표시가 있는 다른 곳** — `components/calc/transfer/CompanionSaleModeBlock.tsx:198`의 `FractionalAutoSalePriceCard`(«자동 계산 (총 양도가액 × 지분율)»)는 자산별 floor 값을 «총양도가 × 지분율» 산식과 함께 보인다. 라벨이 산식 그대로라 틀린 설명은 아니나, 흡수 자산에서는 사이드바(수정 후)·엔진 값과 1원~대역 끝 차이가 날 수 있다 — **화면 확인은 하지 않았다(확인 필요)**. 그 외 `applyRatio(총액, …)` 호출(`transfer-tax-api*.ts`)은 ④ 변환이라 서버가 흡수를 맡는 쪽이다.

**V-7 확인 필요(미측정)**
- 일반건물·입주권·겸용 지분 축 B의 사이드바 경로(`gbShareBgCards` 등 전용 분기)는 재지 않았다 — 이번 측정은 토지 축 B.
- 컴패니언 assetId 사전순 ≠ 입력 순서일 때의 사이드바 값(V-4).
- 주택(`housing`) 지분 축 B도 `computeApportionedSaleMap`을 같이 타는 것은 코드로 읽었으나 수치는 토지만 쟀다.

## 2. 결정 요청 (Q 레지스터)

**Q-1 어떻게 맞출까** — a) 그대로 둔다(세액 영향 없음·계산 후는 정상). **b) 서버 흡수 규칙을 공유 순수 함수로 빼 서버와 사이드바가 같이 쓴다(권장).** c) 사이드바에 규칙을 따로 복사한다. d) 흡수 자산 행을 계산 전에 «계산 후 표시»로 둔다.
- b 근거: 같은 규칙이 이미 엔진 `apportionBundledSale` Step 3·5와 서버 블록 두 곳에 있다(#2781·#2786으로 방금 맞춘 것). 세 번째 복사(c)는 다음 변경에서 다시 어긋난다. 서버 블록은 동작 무변경으로 함수 호출로 바꾸고 #2786 anchor(`transfer.route.bundled-axis-b-absorber-order-v7.anchor.test.ts` · `__tests__/tax-engine/bundled-axis-b-absorber.anchor.test.ts`)가 안전망이다.
- d는 정직하지만 사용자가 값을 보지 못하는 후퇴다(계산 후에는 값이 나온다).

**Q-2 대역 밖 입력은** — **a) 지금처럼 입력 지분율대로 보인다(권장)**. b) 보정한다. — 흡수는 `isFractionalRatioSumOutOfTolerance(Σ지분율)`이 false일 때만 하고, 그 밖이면 폴백(floor)을 그대로 쓴다(V-5).

**Q-3 범위** — **a) 토지·주택 등 `computeApportionedSaleMap` 경로 + 실가 모드 축 B 폴백까지. 일반건물·입주권·겸용 축 B 사이드바와 `FractionalAutoSalePriceCard`는 별건으로 남긴다(권장).** b) 전부.

## 3. 구현 계획 (Q-1 b · Q-2 a · Q-3 a 선택 시)

1. 공유 함수 — `lib/tax-engine/bundled-sale-apportionment.ts`(322줄) 옆 새 파일 또는 같은 파일에 `fractionalResidualAbsorberIndex(fixedPrices: number[]): number`(확정 가액 > 0 컴패니언 중 assetId 사전순 최대, 없으면 주 자산, 전부 0이면 전체 — 서버 `:188-204`와 같은 규칙)와 `absorbFractionalResidual(...)`. 서버 블록은 이 함수 호출로 교체한다(동작 무변경 — #2786 anchor·`transfer.route.fractional-bundle-ratio-sum-guard` 유지).
2. 사이드바 — `computeApportionedSaleMap`을 안분 모드와 무관하게 축 B에서 호출하도록 바꾸고(`canApportion` 게이트는 축 B를 통과), 축 B에서는 `fixedSalePrice`에 흡수를 적용한 값을 쓴다. 지분율 합이 대역 밖이면 흡수하지 않는다(폴백 유지). 단건 지분(`isSingle`) 폴백은 그대로.
3. 테스트 먼저 — 폼 → 사이드바 → route 대조 anchor: V-2의 잔여 시료(33.33×3 · 1/3×3 · 50/50 총액 홀수 · 60/40 · 14.29×7 · 1/3×3 총액 홀수)에서 사이드바 계산 전 = 엔진 = 계산 후(합 = 총액), 잔여 0 시료 불변, 대역 밖 시료(70/70/70 · 50/30/10 · 99.9%)는 입력값 그대로, **컴패니언 사전순 ≠ 입력 순서 시료**(V-4)에서 흡수 행이 엔진과 같음, 실가·안분 모드 둘 다. 구현 전 새 테스트가 원본에서 깨지는 것을 확인한다.
4. 뮤테이션 — 흡수 미적용 · 흡수 자산을 마지막 행으로 고정(위치 규칙) · 대역 가드 제거 · 서버만 옛 인라인 · 사이드바만 복사본 · 안분 모드 게이트 복귀 → 전체 회귀 → tsc · eslint.
5. 브라우저(UI 영향 있음 — 사이드바 양도가액 칸·합계): Playwright로 축 B 3지분 33.33×3(실가·안분) 계산 전 사이드바 합 = 계약 총액, 계산 후 값 유지, Network 본문 확인.
6. V-6·V-7은 건드리지 않고 이 계획서에 «별건»으로 남긴다. 800줄: `summary.ts` 611 · `helpers.ts` 198 · `bundled-apportionment.ts` 278 · `bundled-sale-apportionment.ts` 322 — 모두 여유.

## 4. 구현 결과 (Q-1 b · Q-2 a · Q-3 a — 2026-11-01)

| 항목 | 결과 |
|---|---|
| 공유 함수 | `lib/tax-engine/bundled-sale-apportionment.ts`에 `absorbFractionalResidual(assets, total)` 추가(확정 가액 > 0 컴패니언 중 assetId 사전순 최대, 없으면 양수인 주 자산, 전부 0이면 전 자산 사전순 최대 — 서버 규칙 그대로). 입력 배열은 바꾸지 않는다. |
| 서버 | `app/api/calc/transfer/bundled-apportionment.ts`의 인라인 흡수 블록을 이 함수 호출로 교체(동작 무변경 — #2786 anchor 전부 통과). |
| 사이드바 | `computeApportionedSaleMap`이 축 B에서 같은 함수로 흡수한 값을 쓴다. 지분율 합이 허용 대역 밖이면 흡수하지 않는다(`isFractionalRatioSumOutOfTolerance`). `summary.ts`는 안분 모드가 아니어도 축 B(총액 > 0)면 맵을 만든다(실가 모드 폴백 제거). |
| 테스트 먼저 | 새 anchor 2개 — 단위 8건(`fractional-residual-absorber.anchor.test.ts`) · 폼 → 사이드바 → route 25건(`transfer.route.sidebar-axis-b-sale-residual.anchor.test.ts`). **원본 코드에서 22건 실패**(단위 8 + 잔여 12셀 + 사전순 2셀)·11건 통과(잔여 0 4 · 대역 밖 6 · 총액 0 1) — 계획서 V-2·V-5와 일치 — 확인 후 구현. |
| 확인 내용 | 잔여 6시료 × 두 모드: 사이드바(계산 전) = 엔진 = 사이드바(계산 후), 합 = 총액, 라벨(`saleIsApportioned`) 계산 전후 동일. 컴패니언 id가 A9·A2 순서(사전순 ≠ 위치)에서 가운데 행 A9가 잔액 +100,000을 받는다(V-4 해소). 대역 밖(70/70/70 · 50/30/10 · 99.9%)은 입력값 그대로. |
| 뮤테이션 10종 | 사이드바 흡수 제거(14건 실패) · 대역 가드 제거(6) · 가드 반전(20) · 맵 게이트를 안분 모드만(7) · 흡수자 마지막 위치(8) · 사전순 최소(9) · 주 자산 포함(21) · 확정가 0 포함(4) · 서버 흡수 제거(23) · 서버 총액 +1(29) — **전부 KILLED**. 복원은 scratchpad 백업 `cmp` 일치로 확인(백업 4개 존재를 먼저 확인). |
| 전체 회귀 | vitest 3650개 파일 통과 · 1 skipped · 실패 0(44,802 tests). `tsc --noEmit` 0건 · eslint 오류·경고 0. 파일 줄 수: `summary.ts` 616 · `helpers.ts` 212 · `bundled-apportionment.ts` 272 · `bundled-sale-apportionment.ts` 347(800 미만). |
| 브라우저(Playwright, 축 B 토지) | 사이드바 계산 전 — 33.33×3(실가·안분 모드): 양도가액 333,300,000 · 333,300,000 · **333,400,000**, 합계 양도가액 **1,000,000,000** / 14.29×7(두 모드): 142,900,000 ×6 · **142,600,000**, 합계 **1,000,000,000**. 계산 응답 status 4건 모두 **200**. 계산 후에는 결과 화면으로 넘어가 사이드바가 사라져 **계산 후 사이드바 값은 브라우저로 확인하지 못했다**(anchor로 확인). 임시 스펙의 마지막 `screenshot` 단계가 «페이지 닫힘»으로 실패해 Playwright 종료 코드는 실패였으나 측정 줄은 그 앞에서 출력됐다(스펙은 커밋하지 않음). |

### 별건·미측정 (이 PR에서 건드리지 않음)

- V-6: `FractionalAutoSalePriceCard`(자산별 «총 양도가액 × 지분율» 카드) 화면 · 일반건물·입주권·겸용 지분 축 B 사이드바(`gbShareBgCards` 등 전용 분기) — 확인 필요.
- V-7: 주택 지분 축 B 수치(토지만 쟀다).

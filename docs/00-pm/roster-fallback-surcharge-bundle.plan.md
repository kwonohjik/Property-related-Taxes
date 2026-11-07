# 명부 없는 fallback 중과 경로 묶음 (2026-11-07)

> 근거: `docs/reviews/unsold-98-series-review-2026-11.md` 「함께 고칠 묶음」 3번째 — US-38·US-35·US-08·US-30·US-31·US-70·US-19
> 사용자 결정(2026-11-07): US-19 결과 고지 · US-31 확정 해제 + ⑧ 정합 검사(시료까지 이번 PR) · US-35 ⑧ 차단 + 엔진 분리

## 1. 실측 (origin/master `52cf4b231`, 엔진 직접 호출, `makeMockRatesWithHouseEngine`)

과천 주택 · 양도 2026-07-01(한시배제 가목 종료 후) · 9억/3억 · 조정대상지역 · 거주 0. 「명부」 = `houses[]`(양도 주택 행 + 다른 주택 1990 취득), 「fallback」 = `houses` 없음 + `householdHousingCount` 스칼라.

| # | 사실 | 명부 경로 | fallback | 차이 |
|---|---|---|---|---|
| US-08 | 2009-12-01 취득(위기취득 창 안) · 감면 없음 · 2주택 | 236,511,000 (0.42 · 장특 0) | 367,961,000 (0.62) | +131,450,000 |
| US-08 | 같은 · 3주택 | 236,511,000 (0.42) | 433,686,000 (0.72) | +197,175,000 |
| 대조 | 2013-01-02 취득(창 밖) · 2·3주택 | 367,961,000 · 433,686,000 | 같음 | 0 |
| US-38 | §98의3 적격(2010-01-15 취득 · 계약 2009-06-15) · 2주택 | 99,913,000 (0.38 · 장특 1.8억 · 「감면주택 다주택 중과 배제」) | 247,016,000 (0.60 · 장특 0) | +147,103,000 |
| US-38 | 같은 · 3주택 | 99,913,000 | 292,941,000 (0.70) | +193,028,000 |

## 2. 원인

- **엔진 fallback 술어**(`transfer-tax-surcharge-predicate.ts` `resolveSurchargeApplication`)는 `isRegulatedArea && householdHousingCount ≥ 2`만 본다.
  - 정밀 경로가 반영하는 두 사실을 읽지 않는다: 부칙 제9270호 §14① 위기취득 세율 배제(`multi-house-surcharge.ts:540`) · STEP 0.45 감면주택 배제(`transfer-tax-judgment-steps.ts` — `houseSet` 분기 안에서만 주입).
- **화면 도달 경로**(⑧ 이슈 0건으로 fallback에 닿는다)
  - US-30: OH-34 레거시 표식 이력에서 명부 행을 모두 지우면 표식과 ⑧ 면제가 남는다(`household-house-count.ts` `housesPatchWithDerivedCount` · `transfer-tax-validate-step1.ts` 레거시 면제).
  - US-31: 「다른 보유 주택 없음」 확정 뒤 자산 종류를 바꿔 스칼라를 바꾸면 확정과 스칼라가 어긋난 채 남는다.
- **US-35**: 하이브리드 5년 후 양도에서 감면 카드의 양도시 기준시가가 비면 엔진이 `MISSING_STD_PRICE`로 부적격 처리하고, STEP 0.45 선판정도 같은 결과를 읽어 감면주택 중과 배제가 사라진다. ⑧은 취득시·5년 시점만 막는다.
- **US-19**: 5호 자기선언 토글이 엔진 부적격 판정과 OR로 공존한다(정당한 다른 조문 근거 때문에 유지) — 어느 층도 알리지 않는다.
- **US-70**: 판정 메뉴 시뮬레이션은 조특법 감면·특례세율을 반영하지 않는데 고지가 없다.

## 3. 처방

| 항목 | 층 | 바꾸는 것 |
|---|---|---|
| US-08 | 엔진 | `SurchargeApplicationInput.acquisitionDate` 추가. fallback에서 조정대상지역 ∧ `isCrisisAcqExempt(취득일)`이면 **세율 축만** 닫는다(`isSurchargeCase` = 장특 배제는 유지 — 명부 경로와 같다). `rateSurchargeStatutoryExcluded`를 결과에 실어 다건 §104⑤ 그룹이 progressive가 되게 한다. 장특 근거 인용 정정(서울행정법원 2024구단72950 → 2024누55534·2025두33460·2024구단68630) |
| US-38 | 엔진 | STEP 0.45가 적격이고 정밀 판정이 없으면(fallback) 파생 입력에 `surchargeExcludedByReduction`을 싣고 fallback 술어가 두 축을 함께 닫는다. 같은 「감면주택 다주택 중과 배제」 단계를 남긴다 |
| US-35 | ⑧ | `failIfStdPriceMissingOver5Y`가 양도시 기준시가도 본다 — 감면 카드 칸 또는 ④가 엔진에 싣는 값(`engineStdPriceAtTransfer`, §99의3과 같은 leaf). ⑤ hint·prop 주석·M4-3 테스트 주석을 실제 동작에 맞춘다 |
| US-35 | 엔진 | 하이브리드 결과가 `MISSING_STD_PRICE` **하나만**으로 부적격이면(요건 판정은 그 앞에서 끝난다 — `unsold-hybrid.ts` 요건 → `computeHybridEffect`) STEP 0.45 선판정은 「감면되는 주택」으로 본다. 차감은 종전대로 0 + 사유 |
| US-30 | ⑤⑧ | 레거시 폼에서 날짜 있는 명부 행이 없어지면 표식을 끄고 확정을 해제한다. ⑧ 레거시 면제를 「날짜 있는 행이 있을 때」로 좁힌다. HR-4 anchor 재정의 |
| US-31 | ⑤⑧ | 오프셋이 달라지는 자산 종류 전환 · 분양권 주택 수 버튼에서 확정을 해제한다. ⑧: 확정 ∧ 명부 정본 아님 ∧ 비레거시 ∧ 스칼라 ≠ 자기 몫 오프셋이면 막는다(「확인 토글을 다시 켜세요」) |
| US-19 | 엔진 | 양도 주택 행 5호 선언 + §98 계열 감면 입력 부적격 + 자동 배제 없음 + 중과 배제 사유가 그 선언이면 고지한다 |
| US-70 | UI | 판정 메뉴 시뮬레이션 고지에 조특법 감면·특례세율 미반영 한 줄 · 5호·3호 선언 시 세율 영향 카드에 계산기 확인 안내 |

### 3-1. 구현 중 추가로 고친 것 (실측)

- **다건 집계 재계산이 fallback 배제를 되살림** — 그룹 세액은 원 입력으로 `calcTax`를 다시 부른다. 감면주택 배제는 엔진 안에서만 파생 주입되므로
  결과에 `surchargeExcludedByReduction`을 싣고(`transfer-result.types.ts`) 집계가 입력을 교정하며(`transfer-tax-aggregate-asset-records.ts`)
  세율군도 progressive로 분류한다(`classifyRateGroup`). 실측: 컴패니언 겸용 §99의3(매매) 316,604,997 → 284,205,000(세율만) → 242,772,000
  = 겸용 먼저(명부 정밀) 242,772,000. 상속·증여 컴패니언도 겸용 먼저와 같다(208,214,285 · 327,319,142 — 종전 183,219,140 · 413,794,855).
- **US-19 배제 사유 문구** — 자동 판정 「입력한 감면의 요건 판정으로 적용」 · 자기 선언 「「조특법 감면주택」 선언으로 적용」(`taxSpecialExemptionAutoId`).
- **US-31 시료** — 공용 헬퍼 5개·인라인 시료 다수가 「확정 ✓ + 주택 수 2」 모순으로 ⑧을 통과해 왔다. `__tests__/calc/_helpers/roster-for-declared-count.ts`가
  같은 주택 수의 명부(1950 취득 일반 주택 행)로 바꾼다 — `makeMockRates`에는 주택 수 산정 규칙이 없어 계산 경로·기대값은 그대로다(변경 0건).
- **US-31 E2E 시드** — 후보 196 spec 로컬 실행에서 255건(109 spec)이 모두 같은 ⑧ 메시지로 막혔다. sessionStorage 시드 지점에
  `seedWithDeclaredRoster`(`e2e/_helpers/roster-for-declared-count.ts`, vitest 헬퍼와 같은 규칙)를 씌웠다 — 공용 `seedWizard`·`gotoTransferHoldingsStep` 포함.

## 4. 범위 밖 · 확인 필요

- 겸용주택(`transfer-tax-mixed-use.ts`) 자산별 fallback(`asset.surchargeFallback`)의 위기취득·감면 배제 — 미측정. 이번에는 단건·재개발·임대 경로(같은 술어 호출부)만.
- §99·§98의8·§99의3의 `MISSING_STD_PRICE` 선판정(리뷰 US-35 「범위 밖」) — §99의3은 ⑧이 이미 막는다. 엔진 분리는 하이브리드만.
- US-19 「토글에 근거 조문 선택」 대안 — 사용자 결정으로 하지 않는다.
- 상속 컴패니언 겸용 파트 카드의 세율군 표시 — 세액은 정밀 경로와 같지만 결과에 위기취득 표지가 실리지 않아 「중과」 세율군으로 남는다(종전과 같은 표시). 결과 조립 경로 확인 필요.
- 재개발 결과(`transfer-tax-redevelopment.ts`)는 `rateSurchargeStatutoryExcluded`를 싣지 않는다(종전과 같음) — 다건 세율군 분류만 영향, 미측정.
- 🔴 **정밀(명부) 경로 — 이월과세 주택의 한시배제 보유기간(종전부터 · 이번 범위 밖)**. E2E `carryover-gift-debt-purchased-part` CDPP-5 사실
  (서울 강남구 주소 자동 판정 = 조정 · 2주택 · 당초 증여 2025-06-01 · 증여자 취득 2000-06-01 · 양도 2026-03-01)로 origin/master `ed8368716`에서 실측했다.
  fallback은 349,270,000(증여분 0.42)이고, 같은 입력에 명부를 넣으면 623,110,000(증여분 `multi_house_surcharge` 0.62)이다.
  - ④가 싣는 양도 주택 행 `acquisitionDate`는 증여 등기일(2025-06-01)이다.
  - 소령 §167의10①12의2는 「법 제95조제4항에 따른 보유기간」을 쓰고, 소득세법 §95④ 단서는 §97의2① 자산을 증여자 취득일부터 센다
    → 증여분은 한시배제(가목) 대상이다(KoreanLaw MCP 본문 확인).
  - 엔진 어느 줄이 행 취득일로 판정하는지는 확인 필요. E2E 시료는 사례대로 「비조정」을 직접 고른 값(`*Touched`)으로 고정했다.
  - → 후속 수정: `docs/00-pm/carryover-surcharge-suspension-holding.plan.md`(원인 `multi-house-surcharge-exclusion.ts` 12의2 보유 판정 · fallback 보유 2년 요건 누락 함께).
- `transfer-tax.ts`(751줄)·`transfer-tax-rental-housing-step.ts`(762줄)는 변경 전부터 750줄 이상이었다 — 이번에는 분리하지 않고 증가를 1줄 이하로 맞췄다.

## 5. anchor (선작성)

`__tests__/tax-engine/transfer/roster-fallback-surcharge-parity.anchor.test.ts`
- F-1 US-08 2009-12-01 · 2·3주택 — fallback = 명부(236,511,000) · 창 밖 대조 불변
- F-2 US-38 §98의3 적격 · 2·3주택 — fallback = 명부(99,913,000) · 배제 단계 표시
- F-3 US-35 엔진 — 양도시 기준시가 비움 → 중과 배제 유지 · 차감 0 + MISSING_STD_PRICE
- 회귀: 명부 경로 값 불변 · 감면 없는 창 밖 fallback 불변

⑧·⑤ anchor는 `__tests__/calc/`에 둔다(US-30·US-31·US-35 ⑧).

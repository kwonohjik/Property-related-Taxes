# 상속인이 아닌 수유자(유증·사인증여) — 후속 묶음 계획서 v0.1

- 작성일: 2026-10-20 · 기준 커밋: master `60a9b0f3f`(#2297 머지) · 워크트리 `-nhb2` (브랜치 `fix/non-heir-bequest-followups`)
- 출처: `docs/00-pm/nbl-bequest-non-heir.plan.md` §6 «범위 밖» 중 세 건. 사용자 결정(2026-10-20): 세 건을 한 계획서·한 PR로 묶고, 농지 상속·이농 3년은 따로 한다.
- 판정 원칙은 #2297의 결정을 그대로 쓴다 — Q-2 (a) 직접 해석이 없어도 같은 낱말이면 적용하지 않고 «확인 필요» · Q-3 (a) 사인증여 = 유증. 새로 정할 것은 없다(§5의 두 가지는 기본값으로 정하고 밝힌다).

## 1. 법령·해석

| # | 특례 | 문언 | 수유자에 대한 해석 |
|---|---|---|---|
| A | 다주택 중과 배제 — 「소득세법 시행령」 §167의3①7호 | 「**제155조제2항에 해당하는** 상속받은 주택(상속받은 날부터 5년이 경과하지 아니한 경우에 한정한다)」 | §155②를 그대로 끌어온다 ⇒ 부동산거래관리과-307(2011.4.11.) · 조심2013중2654(2013.8.12. 기각 — 「법정 상속인이 아닌 청구인들의 딸이 유증받은 주택을 「소득세법 시행령」 제155조제2항 소정의 상속받은 주택으로 보지 아니하고」) · 수원지방법원 2013구단4853(2014.8.13. — 「상증세법상 상속의 개념에 유증을 포함한다고 하여 … 유증받은 주택을 상속받은 주택에 포함하는 것으로 해석할 수는 없음」) |
| A' | 중과 주택 수 — §167의3②2호 공동상속주택 소수지분 | 「공동상속주택: 상속지분이 가장 큰 상속인의 소유로 하여 주택수를 계산」 | 직접 해석 없음 → 확인 필요 |
| B | 세율 보유기간 — 「소득세법」 §104②1호 | 「상속받은 자산은 피상속인이 그 자산을 취득한 날」 | 서면인터넷방문상담4팀-3304(2006.9.27. — 상속인이 아닌 자의 **사인증여** 취득 자산은 §104②1호 적용 안 됨) · 상속인의 유증은 적용(서면4팀-2691). 비상속인 **유증**은 직접 해석 없음 → 확인 필요 |
| C | 상속 입주권·분양권 — §156의2⑥⑦ · §156의3④⑤ | 「상속받은 조합원입주권」·「상속받은 분양권」 | 직접 해석 없음 → 확인 필요(§155②와 같은 낱말) |

**범위에서 빼는 것(근거 있음)**
- 조특법 §71의2 인구감소지역주택 — 상속·증여로 받은 주택 모두 대상이다(`population-decline-71-2.ts:149` `popDeclineAcquiredFromOther`). 수유자도 피상속인에게서 받은 것이라 결론이 같다. 고치지 않는다.
- 상속 분양권의 정의일 기산(`presale-right-definition-date.ts:38`) — 동일세대 상속이면 피상속인 취득일로 본다(재산세제과-1033). 부동산거래관리과-1345(수유자라도 동일세대면 통산)와 같은 동일세대 통산 논리라 고치지 않는다.

## 2. 현행 구조

- **A** 중과(모두 명부 행 `isInherited`를 읽는다)
  - 7호 `isSurchargeExemptInherited` — `multi-house-surcharge-count.ts:580`
  - 소수지분 주택 수 제외 — `multi-house-surcharge-count.ts:619`
  - §167의10①4호 대리 지표(다른 주택이 상속주택이면 ⑧ 주택 아님) — `multi-house-surcharge-exclusion.ts:606`
  - 양도 주택 행은 ④가 자산의 취득원인으로 만든다 — `transfer-tax-api-houses.ts:151` (`isInherited: primary.acquisitionCause === "inheritance" && !d2`). 자산 토글은 #2297에서 토지에만 띄웠다(`CompanionAcqInheritanceBlock.tsx`).
- **B** 기산일 단일 소스 `resolveRateBasis`(`transfer-rate-holding-basis.ts:63` — `inheritance && decedentAcquisitionDate`). 호출부:
  - 사실 객체를 직접 만드는 곳: `transfer-tax-appurtenant-land.ts:105` · `transfer-split-part-echo.ts:58`
  - 입력을 그대로 넘기는 곳: `transfer-tax-rate-calc.ts:397` · `transfer-tax-aggregate-helpers.ts:64` · `mixed-use-part-cards.ts:352`
  - 피상속인 취득일을 엔진 입력에 싣는 경로: 단건 `transfer-tax-api.ts:523` → `transfer-tax-schema-base-shape.ts:83` → `engine-input.ts:96` / 동반 자산 `transfer-tax-api-companion-payload.ts:528` → `transfer-tax-schema-companion.ts:300` / 다건 `multi-transfer-tax-api.ts:348` → `multi/route.ts:270` / 일반건물 `transfer-tax-api-gb.ts:505·712` → `transfer-tax-building-schemas.ts:287` → `general-building-route-actual.ts:236·582·592` → `general-building-route-cards.ts:240·250` / 겸용 `mixed-use-asset-input.ts:244` · `mixed-use-part-cards.ts:457` / 분할 `bundled-split-helpers.ts:373·598` / `route.ts:569`
- **C** 권리 행 `presaleRights[].isInherited`
  - §156의2⑥⑦·§156의3④⑤ 분류 — `transfer-tax-89-2-exclusion.ts:361·362`
  - 혼인 후 분양권 경로 — `transfer-tax-89-2-merged-household.ts:41`
  - §156의2⑤ 대체주택 양도일 현재 구성 — `one-house/replacement-house.ts:82`
  - 폼 → ④ `presale-rights-payload.ts:115` → ⑫ `transfer-tax-schema-sub.ts`(`presaleRightSchema`) → ⑭ `transfer-route-multi-house.ts:217`

## 3. 실측 (master `60a9b0f3f` · 실제 route · 「수유자라면」은 법령·해석을 적용한 값과 같은 입력으로 잰 값)

| # | 조건 | 현행(상속인처럼) | 수유자라면 | 차이 |
|---|---|---|---|---|
| S1 | A 7호 — 강남(조정) 상속 주택(2024-01-01 상속 · 피상속인 2010) 20억 양도 2026-09-18 + 일반주택 1채 · 프로덕션 fallback 세율 | 767,728,500 (중과 배제 `inherited_house_5years`) | 1,141,178,500 (`multi_house_2`) | 373,450,000 과소 |
| S2 | B — 비조정 상속 주택(2026-03-01 상속 · 피상속인 2010) 8억 양도 2026-09-18(6개월) · 2주택 | 60,621,000 (피상속인 취득일 기산 → 기본세율) | 152,075,000 (단기 70%) | 91,454,000 과소 |
| S3 | C §156의2⑥ — 일반주택(2015) 9억 양도 2024-06-01 + 상속 입주권 1개(2016) · mock 세율 | 비과세 0 | 68,981,000 | 68,981,000 과소 |

- 「수유자라면」 열은 S1 양도 행 `isInherited: false` · S2 피상속인 취득일 = 상속개시일 전날(기산일이 바뀌지 않게) · S3 권리 행 `isInherited: false`로 잰 값이다.

## 4. 수정안

### 4-1. 술어

- 명부 행: #2297의 `isHeirInheritedHouse`(`transfer-inheritance-exclusion.ts`)를 §2-A 세 지점에 쓴다.
- 권리 행: 같은 파일에 `isHeirInheritedRight(r)` = `r.isInherited === true && r.nonHeirBequest !== true`를 두고 §2-C 세 지점에 쓴다.
- 기산일: `RateBasisFacts.nonHeirBequest`를 더하고 1호 조건을 `inheritance && decedentAcquisitionDate && !nonHeirBequest`로 한다.

### 4-2. 입력

- 자산 토글(`nonHeirBequest`)을 **모든 자산 종류**에 띄운다 — 이제 토지(비사업용) 말고도 §104②1호(전 자산)·§167의3①7호(주택)가 읽는다. 설명 문구를 바꾼다.
- 양도 주택 명부 행(`transfer-tax-api-houses.ts:151`)에 자산의 `nonHeirBequest`를 싣는다.
- 권리 행에 토글을 둔다 — 「상속받은 권리」를 켰을 때만 보이고, 끄면 함께 지운다.
- 엔진 입력 `TransferTaxInput.nonHeirBequest`와 §2-B의 경로마다 피상속인 취득일 옆에 함께 싣는다.

### 4-3. 고지

- A: 7호는 직접 근거(§155② 준용)가 있어 근거만 밝힌다. A'(소수지분)은 확인 필요.
- B: 수유자라 피상속인 취득일로 통산하지 않았고 그 때문에 세율 구간이 갈릴 때만 밝힌다(사인증여 = 서면4팀-3304, 유증 = 확인 필요).
- C: §89② 판정 사유에 수유자 권리를 상속 권리로 보지 않았다는 것과 확인 필요를 싣는다.

## 5. 기본값으로 정한 것

- **피상속인 취득일 칸은 수유자에게도 필수로 둔다.** 일반건물 §164 환산·조특법 §69·§77 등 다른 소비처가 아직 읽는다(그 갈래들은 이번 범위가 아니다 — §6).
- **동반 자산·다건·일반건물·겸용·분할 경로까지 모두 싣는다.** 한 경로만 빠지면 그 경로에서 조용히 상속인처럼 계산된다.

## 6. 범위 밖 (확인 필요 · 후속 후보)

- **조특법 §69 자경농지 감면의 피상속인 경작기간 통산**(조특령 §66⑪) — 비상속인 유증 농지에는 통산하지 않는다는 조심2021구1132가 있다.
- **조특법 §77 공익수용 감면의 취득일 소급** — 수유자에 대한 해석 미확인.
- **농지 상속 3년·이농 3년**(§168의8③2·3호) — 엔진 부재. 별건 계획서(사용자 결정).
- 주식 양도세의 상속 취득(`stock-transfer/`) — 별도 세목 경로.

## 7. 검증 계획

1. route anchor — S1·S2·S3를 «토글 끔 = 현행 값» · «토글 켬 = 수유자 값»으로 고정. S2는 단건·동반 자산·다건·일반건물·겸용 경로 각 1건.
2. 배선 anchor — ④⑫⑭ 각 층에서 `nonHeirBequest`가 strip되지 않는다. 권리 행 토글 노출·리셋.
3. 뮤테이션 — 술어 3종 되돌림 · 기산일 게이트 제거 · 경로별 전달 삭제.
4. `npm run check:pre-pr` · 게이트 스크립트 · CI 12/12.

## 8. Do 결과 (2026-10-20)

### 8-1. 실측 — 토글 끔(상속인) / 켬(수유자)

| 경로 | 시료 | 상속인 | 수유자 |
|---|---|---|---|
| 단건 · 다건 (화면 폼 → ④ → route) | A 7호 — §3 S1 | 767,728,500 (`inherited_house_5years`) | 1,141,178,500 (`multi_house_2`) |
| 단건 · 다건 | B §104②1호 — S2와 같은 바닥(화면 폼 · 상속 평가액 3억) | 190,366,000 | 383,075,000 + 단기세율 안내 |
| 단건 | C §156의2⑥ — S3와 같은 바닥(화면 폼) | 비과세 0 | 150,766,000 + 확인 필요 사유 |
| 겸용 단건 | 상속 2023-09 · 피상속인 2000 · 양도 2024-06 | 215,010,000 (누진) | 317,678,570 (70% — 피상속인 취득일이 닿지 않던 종전 값과 같다) |
| 동반 겸용 | 같은 바닥 | 79,849,000 | 93,199,581 (주택 카드 70% · 상가 카드 50%) |
| 일반건물 실가 · 환산 | 토지·건물 상속(피상속인 2000) | 94,061,000 · 108,042,000 | 126,269,000 · 136,757,500 (D3 base 값과 같다) |

### 8-2. 테스트

- route anchor `__tests__/api/transfer.route.non-heir-bequest-followups.anchor.test.ts` 4건 · 엔진 anchor `__tests__/tax-engine/transfer/non-heir-bequest-followups.anchor.test.ts` 6건
- 기존 anchor에 수유자 짝 추가 — 겸용 단건 · 동반 겸용 · 일반건물 D3(실가·환산). #2297 화면 anchor는 토글 노출 규칙 변경(모든 자산)에 맞춰 갱신.
- 뮤테이션 35종 중 31종 KILLED. 살아남은 것:
  - N31 동반 겸용 서브엔진 입력 — 코드 주석대로 서브엔진 `total`을 버려 세액에 닿지 않는다(단건 겸용과 같은 입력을 만들려고만 싣는다). 설계상 생존.
  - N10 혼인 후 분양권 경로(`transfer-tax-89-2-merged-household.ts`) · N26 동반 자산 일반건물 · N27 지분 일반건물 — 고정할 시료가 없다. 같은 술어·같은 인자를 쓴다.
- 브라우저 수동 확인은 하지 않았다(화면은 RTL anchor).

### 8-3. 새로 찾은 결함 (별건 · 이번 PR에서 고치지 않음)

- **동반 자산 일반건물(토지·건물 상속 · 양도가 실가 배분)이 ⑧을 통과한 뒤 route 500**(`계산 결과에 유효하지 않은 숫자(NaN·Infinity)가 58곳` — `aggregated.properties.1.necessaryExpense` 등). 주 자산 = 일반 토지(매매), 동반 자산 = D3 `buildingOnly({ acquisitionCause: "inheritance", decedentAcquisitionDate: "2000-01-01", publishedValueAtInheritance: "200000000", landAcquisitionPrice: "" })`, `bundledSaleMode: "actual"`. 토글을 끈 시료도 같아 master에도 있다. 시료가 완전한지(⑧이 놓친 칸인지 엔진 결함인지)는 확인 필요.

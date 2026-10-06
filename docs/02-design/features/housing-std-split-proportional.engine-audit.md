# S-3 엔진 감사 — 개별주택가격(결합 공시) 토지·건물 분할: 뺄셈 역산 vs 가목:나목 비례 안분

> 작성 2026-10-06 · base `01985b705` · 브랜치 `fix/housing-std-split-proportional` · **소스 수정 없음**(산출물 = 이 문서 + 특성화 anchor 1개).
> 법령·해석례 정당성은 별도 조사(`housing-std-split-proportional.authority.md`·`/private/tmp/.../b1-authority-research.md` N1·N9·N10·N12)가 맡았고, 이 문서는 **코드·수치**만 다룬다.
> 표기: **확인**=실제 파일을 열어 줄 번호까지 본 것 · **실측**=테스트로 실행한 것 · **확인 필요**=못 본 것.

## §0 요약

1. **뺄셈 역산은 코드에 2계열·7행**이다 — (A) 일반 주택 split 3행(A1 `calcDerivedBuildingStdAtAcq` 정의 · A2 호출 `calcAcqStdPair` · A3 양도시 후퇴 fallback — 실질 산식 지점은 A1·A3 2곳), (B) 겸용 주택분 4행(B1 양도시 · B2 취득시 · B3 취득시·건물일 공시지가 · B4 용도변경, B4는 비례이나 B1에 의존). 재개발·상속·증여·부담부증여·이월과세·1990 의제·공익수용·종합 집계에는 **별도 뺄셈이 없다**(결합가를 쪼개지 않고 그대로 쓰거나, 이미 비례 안분이다).
2. **엔진 밖에는 독자 재계산 사본이 없다.** UI·결과뷰·신고서·PDF·사이드바·이력은 엔진 echo 값을 그리고, 「건물분 = 총액 − 토지분」을 서술하는 **문구**만 남아 있다(§5.3).
3. **현행은 한 자산 안에서 척도가 섞여 있다.** 일반 주택 split의 **양도시**는 이미 「양도시 가목 : 양도시 나목(모달 산정)」 비례다(`transfer-tax-split-sale-price.ts:46-60`, 개별주택가격 `standardPriceAtTransfer`는 읽히지 않는다 — 실측). **취득시**만 「결합가 − 토지분」 뺄셈이다. 환산에서는 분자(취득시 건물 = 결합−토지)와 분모(양도시 건물 = 나목)가 **다른 척도**가 되어 건물 환산취득가가 왜곡된다(실측 a2: 205.7M vs 비례 308.6M).
4. **PHD(§164⑦)는 이미 비례 안분**이다(`transfer-tax-pre-housing-disclosure.ts:130-146` — `floor(P × 토지분 / (토지분+건물분))`, 건물은 잔액). Excel 정본 fixture로 고정돼 있고, 같은 입력을 뺄셈으로 계산하면 건물분이 0으로 clamp돼 세액이 **+60,133,976**이 된다(실측 d). 이 fixture에서 개별주택가격 < 가목+나목 괴리는 **+49~58%**다.
5. **나목(국세청 건물 기준시가) 입력**: 별개취득·PHD·재개발 본문은 **있음**. **없는 곳** = 비-별개취득 일반 주택 split(소유자 분리·동일 취득일 등, 취득시) · **겸용 비-PHD 주택분(취득·양도 둘 다)**. 신규 입력 신설이 필요한 곳은 이 둘이다(§2).
6. **영향 측정**(가상 fixture, §3): 총 양도차익은 불변이고 **토지·건물 어디에 얹히느냐**만 달라진다. 세액은 ① 파트별 장기보유공제율이 다를 때(a1 −3.9M) ② 소유자 분리(a3 −22.5M / +21.0M) ③ 환산 척도 불일치(a2 −36.4M, b1 −5.1M) ④ 12억 이하 비과세 + 부수토지 배율 초과분(c2 −6.4M, c4 −7.1M)에서 움직인다. 함께 취득·동일 공제율·초과 없음이면 **세액 불변**(c1·c3·a3 둘 다 소유).
7. **뺄셈이 맞는 곳은 없다.** 다만 「토지·건물로 나누지 않고 결합가를 그대로 쓰는」 경로(§163⑥2호가목 개산공제, 12억 안분, 겸용 주택:상가 안분, 공익수용 총액 트랙, 재개발 라목값)는 **분할 방식이 바뀌어도 건드리지 않는다**(§6).
8. **수정 범위**: 일반 split 2파일(핵심 3줄) + 겸용 1파일 + 입력 신설(일반 비-별개 건물 나목 · 겸용 주택건물 나목 ×2시점)에 따른 14동기화 · validate · 문구 4곳. 기존 테스트 중 뺄셈 값에 민감한 것은 node 프로젝트 기준 일반 split **40건/18파일**, 겸용 **79건/21파일**(§5.4 변형 실측).

## §1 뺄셈 지점 전수

### 1.1 뺄셈 역산 (바꿀 대상)

| ID | file:line (확인) | 연산 | 타는 경로·조건 | 시점 | 값이 쓰이는 곳 |
|---|---|---|---|---|---|
| A1 | `lib/calc/transfer-tax-split-acq-mode.ts:269-272` | `building = max(total − landStd, 0)`, `total ≤ 0`이면 null | 정의(단일 소스). 소비는 A2 하나(`calcDerivedBuildingStdAtAcq` importer: 엔진 1곳 — grep) | 취득 | A2 |
| A2 | `lib/tax-engine/transfer-tax-split-acq-price.ts:64-67` (`calcAcqStdPair`) | `building = A1(input.standardPriceAtAcquisition, landStd)`, `buildingDerived=true` | **일반 주택 split**(`calcSplitGain` — `landAcquisitionDate` 있고 propertyType housing/building)에서 ① 비-별개취득 전부(소유자 분리 `selfOwns≠both`·동일 취득일·상속/증여 취득 포함) ② 별개취득이어도 `buildingStandardPriceAtAcquisition` 미입력(API 직접 입력 한시 후퇴, `:58-60` 우선). UI 별개취득은 총액 전송을 차단(`lib/calc/transfer-tax-api-split.ts:150-157`)하고 나목을 받는다 | 취득 | ① 환산 분자(`calcPartAcquisitionPrice split-acq-price.ts:169-173`, 호출 `:346-347`) ② 개산공제 §163⑥ base(`split-gain.ts:214,224`) ③ 비-별개취득 실가·감정·매매사례 **안분 비율**(`calcApportionRatio :87-98` → `splitPair :127`) ④ 자본적지출 안분(`split-gain.ts:171` `splitPair`) ⑤ echo `stdPriceDerivedFromTotal`(`:121,295` → `SplitGainDetailSection.tsx:127`) |
| A3 | `lib/tax-engine/transfer-tax-split-acq-price.ts:296-299` | `landStdAtTransfer = input.landStandardPriceAtTransfer ?? floor(총액 × **취득시** landRatio)`, `buildingStdAtTransfer = input.buildingStandardPriceAtTransfer ?? max(총액 − landStdAtTransferBase, 0)` | 양도시 토지·건물 칸이 비었을 때만. Zod V7(`lib/api/transfer-tax-schema-required-refines-2a.ts:257-265`)과 ⑧ validate가 둘 다 필수화해 **API 경로에서는 대체로 도달하지 않는다**(직접 엔진 호출만). 취득시 비율로 양도시를 나누는 **시점 혼합** fallback이기도 하다 | 양도 | 환산 분모 |
| B1 | `lib/tax-engine/transfer-tax-mixed-use-housing.ts:129-133` | `transferLandStd = 공시지가(양도시) × 주택부수토지`, `transferBuildingStd = max(개별주택가격(양도시) − transferLandStd, 0)` | **겸용 주택분 전체**(비-PHD). PHD 분기도 §97②2호 단서 처리에서 이 값을 쓴다(`:129` 주석 · `applyHousingProviso`) | 양도 | 주택분 양도가액의 토지·건물 안분 비율(`:307,310-311`), 양도비 안분(`:83,340-348` `apportionTransferPrice`·`resolvePartNecessaryExpense`), 12억 안분 입력 |
| B2 | `lib/tax-engine/transfer-tax-mixed-use-housing.ts:301` | `acqBuildingStd = max(acqHousingTotal − acqLandStd, 0)` | 겸용 비-PHD, 토지·건물 취득일 **동일**(`isBuildingDayLandPriceRequired` false). 상속·증여 취득도 `housingEstimatedAcq`가 별도로 오고 비율만 여기서 나온다 | 취득 | 취득가액 안분 `acqLandRatio`(`:306,315-316`), 개산공제 base(`:323-325`), 실비 안분 `resolvePartNecessaryExpense` |
| B3 | `lib/tax-engine/transfer-tax-mixed-use-housing.ts:296-299` | B2와 같은 뺄셈인데 토지분을 **건물 취득일** 공시지가(`landPricePerSqmAtBuildingAcq`)로 계산 | 겸용 + 토지·건물 취득일 상이(B0, PR #1999). 토지 파트 `acqLandStd`는 토지일 값 그대로(`:274`) → `acqLandRatio = 토지일 L / (토지일 L + (H − 건물일 L))`로 **두 시점 값이 섞인다** | 취득 | B2와 동일 |
| B4 | `lib/tax-engine/transfer-tax-mixed-use-housing.ts:267-271` | `acqLandStd = floor(acqHousingTotal × 양도시 토지비율)`, 건물 = 잔액 | 겸용 + 보유 중 용도변경(상가→주택). **비례+잔액 흡수 방식이지만 양도시 비율이 B1 뺄셈값**에 의존 | 취득 | B2와 동일 |

### 1.2 이미 비례 안분 (바꾸지 않는다 · 기준 모델)

| file:line (확인) | 산식 | 비고 |
|---|---|---|
| `transfer-tax-pre-housing-disclosure.ts:130-146` | `landHousing = floor(P × land/Sum)`, `building = P − landHousing` (Sum = 가목+나목 입력), 취득시·양도시 | **PHD §164⑦ 일반 주택**. Excel 정본 anchor로 1원 고정(`__tests__/tax-engine/transfer-tax/_helpers/pre-housing-disclosure-fixture.ts`). 이월과세(`transfer-tax-carryover.ts:175-190`)·겸용 PHD가 재사용 |
| `transfer-tax-mixed-use-inheritance.ts:220-229` | `landRatio = phd.landHousingAtAcquisition / P_A_est` | 상속 PHD — 비례 결과에서 파생 |
| `general-building-converted-housing.ts:72-82` | 환산주택가격을 취득시 가목:나목 비율로 안분, 잔액은 건물 | 일반건물 전환 |
| `redevelopment-valuation.ts:176-183` | `P_A = floor(A × Sum_A / Sum_F)` | §164⑦ 본문 — **결합→결합**(토지·건물로 나누지 않는다) |
| `transfer-tax-split-sale-price.ts:46-103` · `sale-split-apportion-basis.ts:95-102` | 양도가액을 **양도시 가목:나목**(또는 감정가) 비율로 안분, 건물은 잔액 | **일반 주택 split의 양도가액 축은 이미 나목 비례**다 — 실측: `standardPriceAtTransfer`(개별주택가격)를 600M↔2,400M로 바꿔도 결과 불변 |
| `transfer-tax-mixed-use-helpers.ts:113-132,178-191` | 주택부분:상가부분 안분 — 주택=개별주택가격(결합) vs 상가=가목×면적+나목 | 토지·건물 분할이 아니라 **주택 vs 상가** 분할. 결합가 그대로(§6) |

### 1.3 뺄셈처럼 보이나 기준시가 분할이 아닌 것 (제외)

`total − landIn`류의 **실제 금액 잔액 흡수**(`split-acq-price.ts:115,127` · `sale-split-apportion-basis.ts:102` · `split-sale-price.ts:101-102` · `burdened-gift-apportionment.ts:184,279,305,348` 등) — 기준시가가 아니라 floor 잔액 불변식이다. `redevelopment-settlement.ts` 분양가 `max(0, 권리가액 − 청산금)`·`redev-acquisition-inverse.ts:121` 표시용 역산도 무관(재개발 조사 에이전트 확인).

### 1.4 경로별 판정

| 경로 | 판정 | 근거 |
|---|---|---|
| 일반 주택 split(매매·상속·증여, 소유자 분리) | **A2·A3을 탄다** | 상속개시일 결합가가 `standardPriceAtAcquisition`이 된다(`inheritance-acquisition-helpers.ts:215-221` — 에이전트 확인) |
| 아파트·공동주택 | 동일 함수(propertyType `housing`) | 공동주택가격도 결합 공시. 나목 산정은 앱에 이미 있다(`ApartmentConversionSection.tsx` — 2001 건물기준시가 × 산정기준율) |
| 겸용 주택분(실가·환산·감정/매매사례·상속·증여) | **B1~B4** | `calcHousingGainSplit` 단일 |
| 재개발·재건축·입주권·관리처분 | **뺄셈 0** | 재개발은 `calculateRedevelopmentTax`로 조기 return(`transfer-tax.ts:114-200`)해 일반 split을 우회, 라목값을 결합 그대로 쓴다 |
| PHD §164⑦ | 이미 비례 | §1.2 |
| 부담부증여 | 뺄셈 0 | 결합가를 건물 슬롯에 통째로 넣고 토지 0(`lib/calc/transfer-tax-api-burdened-gift.ts:306-317`) |
| 이월과세 | 뺄셈 0 | 결합 총액, PHD면 비례 |
| 1990 의제취득·pre-deemed | 뺄셈 0 | 토지 단가만 산출, 주택은 하류 A2·B2를 탄다 |
| 공익수용 §164⑨1호 | 신규 뺄셈 0 | 주택 총액 트랙은 결합 분모 min(`expropriation-valuation.ts:410-436`), split 토지분은 A3의 토지 base에만 걸린다(건물분 무변경, `split-acq-price.ts:301-316`) |
| 용도변경 | B4 | 상가→주택 방향 |
| 장기임대·다건·종합 집계 | 자체 뺄셈 0 | 개별 자산이 A2·B를 타고 `splitDetail`만 통과(`transfer-tax-aggregate-group-tax.ts:150`) |

### 1.5 장기보유공제·비과세 면적 초과분 소비 체인 (분할 값이 세액으로 가는 길)

- 파트별 장특: `transfer-tax-lthd.ts:371-402`(토지·건물 `holdingYears`별 율 × `taxableGainAfterProration`) — 파트 양도차익이 바뀌면 율이 다른 파트로 차익이 이동한다.
- 12억 안분 후 파트별 과세 차익: `transfer-tax-appurtenant-land.ts:198-262`(`applyHousingLandExclusions`) · `transfer-tax-taxable-gain.ts:75-78`.
- 배율 초과분 = **토지 양도차익 × 면적비율**(`transfer-tax-appurtenant-land.ts:151-165`, `transfer-tax-rental-housing-step.ts:147-151`; 겸용 `calcExcessLandRatio`). **G-2 게이트는 `isSeparateAcquisition===true` 전용**(`transfer-tax-appurtenant-land.ts:156`) — 일반 주택의 초과분 분리는 UI에서 파트 독립 입력 경로만 탄다.
- 파트별 §104⑤ 세율: `transfer-tax-split-rate.ts`(토지·건물 취득일 상이 비주택), 소유자 분리: `transfer-tax.ts:350-390`(본인 소유 파트 gain만 과세).

## §2 비례 안분에 필요한 입력(나목) — 경로별 유무

| 경로 | 취득시 나목 | 양도시 나목 | 신규 입력 필요 |
|---|---|---|---|
| 일반 주택 split · **별개취득**(UI) | **있음** — 폼 `buildingStandardPriceAtAcq` → 엔진 `buildingStandardPriceAtAcquisition`(`transfer-tax-api-split.ts:147`, Zod `transfer-tax-schema-split.ts:73`, 건물 기준시가 모달 `LandBuildingSplitSection.tsx:176-254`) | **있음** — `buildingStandardPriceAtTransfer`(Zod V7 필수, `TransferStdPriceCards.tsx:107-152`) | 없음 (단 이 경로는 **결합가를 쓰지 않는 파트 독립**이라 비례 안분 대상이 아니다 — 토지 취득일엔 주택이 없다는 §163⑥2호가목 해석, `LandBuildingSplitSection.tsx:369-371`) |
| 일반 주택 split · **비-별개취득**(소유자 분리·동일 취득일·상속/증여) | **없음** — 건물 카드는 `isSeparateAcq`일 때만 렌더(`LandBuildingSplitSection.tsx:361-372` `stdCardBase`), 자산 단위는 총액 `standardPriceAtAcq`만(`CompanionAcqStdPriceSection.tsx:122-175`) | **있음**(필수) | **취득시 건물 나목 신설** — ⑤ 위젯 게이트 확장 + ④ 전송 게이트(`transfer-tax-api-split.ts:145-157`) + ⑧ + ⑫ |
| 일반 주택 · 별개취득 + API 나목 생략(후퇴) | 없음(Zod가 총액으로 대체 허용 `2a.ts:246-249`) | 있음 | 후퇴 폐지 시 필수화 |
| 단건 PHD §164⑦ | **있음** — `phdBuildingStdPriceAtAcq/AtFirst/AtTransfer` | 있음 | 없음 (이미 비례) |
| 겸용 비-PHD 주택분 | **없음** — `MixedUseStandardPrice`가 `housingPrice`·`commercialBuildingPrice`·`landPricePerSqm`뿐(`types/transfer-mixed-use.types.ts:38-45`). 모달은 **상가건물**용(`MixedUseLegacyStdPrice.tsx:187-221`) | **없음** | **주택건물 나목 취득시·양도시 2칸 신설** (+ B0 건물일 공시지가 `landPricePerSqmAtBuildingAcq` 의미 재설계) |
| 겸용 PHD·4부분 | 있음(주택건물 `buildingStdPriceAtAcquisition`) | 있음 | 없음 |
| 겸용 용도변경 상가→주택 | 상가건물 나목 있음(`commercialBuildingPrice`) — 주택 건물 나목 없음 | 없음 | B1과 함께 |
| 재개발 §164⑦ 본문 | 있음(`buildingStdPriceAtAcq`) | 인가일 결합 단일(`managementDisposalHousingPrice`) | 분할 자체가 없다 |
| 상속·증여(일반) | 취득시 결합가만 | 있음 | 비-별개취득 행과 동일 |

⚠️ 아파트(공동주택) 건물 나목: 앱의 `ApartmentConversionSection`이 「2001 건물기준시가 × 산정기준율」로 공동주택의 건물분을 이미 산정한다. 다만 **취득 당시 공동주택의 나목을 국세청이 어떻게 산정하는지**(집합건물 전유부분 기준)는 **확인 필요**.

## §3 영향 측정 (특성화 anchor — `__tests__/tax-engine/transfer/housing-std-split-proportional.s3-characterization.anchor.test.ts`, 26건 통과)

### 3.1 재현 방법과 검증 (엔진 수정 없음)

비례 값 `land' = floor(H × L / (L+N))`, `building' = H − land'`을 **엔진이 이미 받는 입력 칸**에 싣는다.
- 일반 주택: `standardPricePerSqmAtAcquisition = land'`(면적 1㎡) + 총액 `standardPriceAtAcquisition = H` → 엔진의 뺄셈이 `H − land'`를 만든다. 양도시는 `landStandardPriceAtTransfer = land'ᵀ`, `buildingStandardPriceAtTransfer = H_T − land'ᵀ`.
- 겸용: `calcHousingGainSplit`을 `vi.mock`으로 감싸 그 호출의 `landPricePerSqm`만 `land'/면적`으로 교체(상가·주택:상가 안분 무변경).
- **1원 일치 검증**: (i) a1 — 같은 값을 면적만 바꿔 넣은 run이 현행과 동일 (ii) b1 — 건물 나목 칸에 `H−L`을 명시 입력한 파트 독립 경로가 레거시 뺄셈과 동일 (iii) d — PHD 모듈이 만든 비례 토지분을 split 경로에 넣으면 PHD 결과와 **세액 26,100,130까지 동일** (iv) c — 엔진이 비례분을 그대로 소비했는지 `landStdPriceAtAcq=125,000,000`·`landTransferPrice=floor(1,000M×320M/600M)` 단언.
- a1은 손계산 완료(양도 1,200M×560/1,400=480M, 취득 700M×50%=350M, 장특 토지 20년 30%·건물 8년 16%, 과표 399.3M → 399.3M×40%−25.94M = 133.78M).

### 3.2 결과 (원)

가상 fixture: 개별주택가격 H, 가목 L, 나목 N, **L+N = 1.25×H**(괴리 +25%).
일반 주택 — 취득시 H 480M·L 240M·N 360M / 양도시 H 1,120M·L 560M·N 840M, 양도 2026-06-30, 비조정 2주택(중과·비과세 없음). 겸용 — 취득시 H 250M·L 150M·N 150M(+20%) / 양도시 H 600M·L 400M·N 350M(+25%), 함께 취득 2005-03-01, 양도 2,000M.

| 경로 (anchor) | 토지분 현행 → 비례 | 건물분 현행 → 비례 | 산출세액 현행 → 비례 (차) | 총납부 현행 → 비례 |
|---|---|---|---|---|
| **a1** 일반 · 토지 20년/건물 8년 · 총액 실가 안분 (엔진 직접 입력) | 취득가 350,000,000 → 280,000,000 (차익 130M → 200M) | 취득가 350,000,000 → 420,000,000 (차익 370M → 300M) | 133,780,000 → 129,860,000 (**−3,920,000**) | 147,158,000 → 142,846,000 (−4,312,000) |
| **a2** 일반 · 같은 보유 · **환산** | 환산취득가 205,714,285 → 205,714,285(불변), 개산공제 7.2M → 5.76M | 환산취득가 205,714,285 → 308,571,428 (+102,857,143), 개산공제 7.2M → 8.64M | 220,433,040 → 184,060,368 (**−36,372,672**) | 242,476,344 → 202,466,404 (−40,009,940) |
| **a3** 소유자 분리(동일 취득일 · UI 도달) 건물만 | 〃 | 취득가 350M → 420M | 97,380,000 → 74,870,000 (**−22,510,000**) | 107,118,000 → 82,357,000 |
| **a3** 소유자 분리 토지만 | 취득가 350M → 280M | 〃 | 21,905,000 → 42,950,000 (**+21,045,000**) | 24,095,500 → 47,245,000 |
| **a3** 둘 다 소유 · 같은 취득일 | (토지 130M↔200M, 건물 370M↔300M 이동) | | 141,060,000 → 141,060,000 (**0**) | 155,166,000 → 155,166,000 |
| **b1** 고가(20억) 1세대1주택 + 부수토지 배율 초과 25% · 별개취득 + API 나목 생략(후퇴) · 환산 | 환산취득가 342,857,142(불변), 초과분 양도차익 112,485,714 → 112,845,714 (+360,000) | 환산취득가 342,857,142 → 514,285,714 (+171,428,572) | 45,128,160 → 40,001,547 (**−5,126,613**) | 49,640,976 → 44,001,701 (−5,639,275) |
| **c1** 겸용 환산 · 함께 취득 · 초과 없음 | 양도가 666,666,666 → 533,333,333 · 환산취득가 249,999,999 → 208,333,333 · 차익 412,166,667 → 321,250,000 | 환산취득가 166,666,667 → 208,333,333 · 차익 163,666,667 → 254,583,334 | 314,070,500 → 314,070,500 (**0**) | — |
| **c2** 겸용 환산 · **비과세 + 배율 초과 25%** | 초과분(비사업용) 양도차익 103,041,666 → 80,312,500 (−22,729,166) | 〃 | 175,069,750 → 168,657,500 (**−6,412,250**) | 192,576,725 → 185,523,250 (−7,053,475) |
| **c3** 겸용 실가 700M · 함께 취득 · 초과 없음 | 취득가 221,052,631 → 184,210,526 · 차익 445,614,035 → 349,122,807 | 취득가 147,368,421 → 184,210,526 · 차익 185,964,913 → 282,456,141 | 345,210,000 → 345,210,000 (**0**) | — |
| **c4** 겸용 실가 · 비과세 + 배율 초과 | 초과분 양도차익 111,403,508 → 87,280,701 (−24,122,807) | 〃 | 192,278,421 → 185,186,315 (**−7,092,106**) | 211,506,263 → 203,704,946 (−7,801,317) |
| **d** PHD §164⑦ Excel fixture — **현행이 비례** | 취득시 토지분 336,336,292(비례) | 취득시 건물분 148,491,976 | **26,100,130**(PHD) = 재현(비례 값 → split 경로) 26,100,130 | 28,710,143 |
| **d′** 같은 입력을 **뺄셈 경로**로 | 취득시 토지분 500,320,000 > 추정 취득시 개별주택가격 484,828,268 | 건물분 **0**(clamp) → 건물 환산취득가 169,332,955 → 0 | 26,100,130 → 86,234,106 (**+60,133,976**) | 28,710,143 → 94,857,516 |

읽는 법:
- **세액이 움직이는 조건 4가지** — ① 토지·건물 장특공제율이 다름(보유기간 상이, a1) ② 소유자 분리로 한 파트만 과세(a3) ③ 환산에서 분자·분모 척도 불일치(a2·b1 — 아래) ④ 12억 이하 비과세 + 배율 초과분(c2·c4 — 초과분이 토지 차익 × 면적비율이라 토지 비율에 직접 비례). 이 조건이 없으면 합이 보존돼 **세액 0 차이**(c1·c3·a3 both).
- **a2·b1의 큰 차이는 비례 안분 그 자체보다 척도 정리** 효과다. 현행은 환산 분모에 양도시 **나목**(840M)을 쓰면서 분자에는 취득시 **결합−토지**(240M)를 쓴다(건물분 환산율 0.2857 vs 토지 0.4286). 비례는 두 시점 모두 결합가의 가목:나목 분할이라 건물·토지 환산율이 같아진다(0.4286). 엔진이 **현재 쓰는 방식 안에서도** 취득시 건물분을 나목 입력으로 바꾸면 이 불일치는 해소된다(별개취득 UI 경로가 이미 그렇다).
- c1·c3이 0인 것은 가상 fixture가 같은 날 취득이라서다 — **토지·건물 취득일이 다른 겸용(B0)** 의 파트별 장특·§104⑤ 영향은 측정하지 않았다(**확인 필요**, §7).
- 금액 규모는 가상 fixture의 괴리(+25%)와 단가에 비례한다. **방향**(토지 비율이 현행 > 비례면 토지분 취득가·개산공제 base 과대, 건물분 과소)은 `L/H > L/(L+N) ⇔ L+N > H`로 일반적이다.

## §4 두 방식이 같아지는 조건과 괴리 근거

- 뺄셈: `land = L`, `building = H − L` · 비례: `land' = H·L/(L+N)`, `building' = H − land'`. **같아지는 필요충분조건은 `H = L + N`**(그때 `land' = L`, `building' = N`). 아니면 항상 다르고, `L+N > H`이면 뺄셈이 토지를 과대·건물을 과소로 배분한다. `L ≥ H`이면 뺄셈은 건물분 0으로 clamp되어(`calcDerivedBuildingStdAtAcq`) 토지 100%가 된다.
- **실제 데이터의 괴리** — 코드베이스의 Excel 정본 fixture(`pre-housing-disclosure-fixture.ts`, 「주택분(환산취득, 토지 건물 취득 시기 상이).xlsx」 근거, 실사례 구조) 실측: 최초공시 개별주택가격 486,000,000 vs 가목+나목 722,953,560(**+48.8%**) · 양도시 627,000,000 vs 991,903,000(**+58.2%**) · 토지분만 739,032,000이 양도시 개별주택가격을 초과(→ 뺄셈이면 건물 음수→0). 이 fixture 하나가 전부이므로 「흔하다」의 근거는 **1건**이다. 다건 표본·국토부 공시 산식(개별주택가격이 가목+나목과 왜 다른가)은 **확인 필요**.
- 보조 증거: 겸용 fixture 사례14(개별주택가격 872M, 단가 6.1M × 주택부수토지 ≈36.36㎡)는 나목이 없어 괴리를 못 잰다(확인 필요).

## §5 수정 시 영향 범위 (추정 — 실제 수정은 하지 않음)

### 5.1 엔진·`lib/calc` (필수)
- `lib/calc/transfer-tax-split-acq-mode.ts:269-272` — `calcDerivedBuildingStdAtAcq(total, landStd)` → 시그니처에 건물 나목 추가한 비례 helper로 교체(clamp·null 의미 재정의).
- `lib/tax-engine/transfer-tax-split-acq-price.ts` — `calcAcqStdPair :64-67`(레거시 뺄셈 분기), `calcApportionRatio :87-98`(분모 의미: 현행은 `land/(land+derived)`가 곧 `land/H`), A3 `:296-299`(양도시 fallback 삭제 또는 필수화). 환산 분자·개산공제 base·`splitPair` 비율이 같은 쌍을 소비하므로 쌍의 정의만 바꾸면 전파된다.
- `lib/tax-engine/transfer-tax-mixed-use-housing.ts` — B1 `:129-133` · B2 `:301` · B3 `:296-299` · B4 `:267-271`. 입력 타입 `types/transfer-mixed-use.types.ts:38-45`(`MixedUseStandardPrice`에 주택건물 나목 추가).
- 비례 단일 leaf를 1곳에 둔다(PHD `pre-housing-disclosure.ts:130-146`의 산식과 같은 함수 — dual-truth 회피).

### 5.2 14 동기화 (UI 입력 신설이 필요한 경로)

| 지점 | 일반 비-별개취득 취득시 나목 | 겸용 주택건물 나목(취득·양도) |
|---|---|---|
| ① 폼 상태·② initial·③ normalize | `buildingStandardPriceAtAcq`는 있음 → 노출 게이트만 | **신규 필드 2개** + `migrateAsset` stale 가드(`calc-wizard-asset-mixed-use.ts`·`calc-wizard-asset-factory.ts`·migrate) |
| ④ API 변환 | `lib/calc/transfer-tax-api-split.ts:145-157` 게이트(`separateAcquisition` 한정) 확장 | `lib/calc/transfer-tax-api-mixed-use.ts:149-161` |
| ⑤ UI 위젯 | `LandBuildingSplitSection.tsx:361-372` `stdCardBase`(`isSeparateAcq` 한정) · `CompanionAcqStdPriceSection.tsx:122-175` housing 분기 · `NonPurchaseSplitInputsBlock.tsx` | `MixedUseLegacyStdPrice.tsx`·`MixedUseAssetMajorStdPrice.tsx`(주택건물 모달) |
| ⑥ 사이드바 | `transfer-per-asset-summary.ts:624-631,706` 개산공제 미리보기가 총액×율(항등성 의존) — 파트 합 보존 시 변경 불요(**확인 필요**: floor 1원) | 동일 |
| ⑦ 결과 | `SplitGainDetailSection.tsx:127-135` 안내(`stdPriceDerivedFromTotal` → 비례 서술) | `MixedUseCalculationSections.tsx:328-340,503-515` |
| ⑧ validate | `lib/calc/transfer-tax-validate-split.ts`(비-별개 건물 나목 필수 — 「자동 안분 fallback 금지」 정책상 빈 값은 차단) | `transfer-tax-validate-mixed-use-asset.ts` |
| ⑫ Zod | `transfer-tax-schema-required-refines-2a.ts:246-249`(총액 대체 허용 삭제) | `lib/api/transfer-tax-schema-mixed-use.ts:33,53` |
| ⑬ body spread | `transfer-tax-api.ts` 끝 spread·`multi-transfer-tax-api.ts:240-279` | 〃 |
| ⑭ Route 매핑 | `app/api/calc/transfer/engine-input.ts:328,345` · `multi/route.ts:204,219` · `bundled-split-helpers.ts:410-411` | 겸용 route 매핑 |

### 5.3 문구·주석 (코드 사본은 없음)
`NonPurchaseSplitInputsBlock.tsx:65,88`·`CompanionAcqStdPriceSection.tsx:171` hint 「건물분 = 총액 − 토지분」(화면 노출) · `PreHousingDisclosureDetailSection.tsx:190,217` formula 문자열(「추정 취득시 주택가격 − 토지 성분」은 비례 결과의 잔액 서술 — 의미상 맞지만 오독 소지) · `LandBuildingSplitSection.tsx:347-350,459-460`(「주택은 역산이 유일한 경로」 — 이미 `:366-372`와 모순인 **stale 주석**) · `transfer-tax-split-acq-price.ts:27-28`·`transfer-tax-split-acq-mode.ts:259-262`(역산 정본 주석). 법령 인용을 추가하면 `lib/legal-verification/manifest/additions-transfer-*.ts` 등록이 필요하다(vitest 게이트).

### 5.4 깨질 기존 테스트 (뺄셈 값 고정 anchor) — 변형 실측

엔진 소스를 건드리지 않고 vitest 설정의 resolve 플러그인으로 대상 모듈만 바꿔 끼워 실측했다(변형 = 뺄셈 결과 +1000원, `__tests__/**/*.test.ts`만 — node 프로젝트, DOM 프로젝트 `.test.tsx`는 미측정).

| 변형 | 대상 | 실패 테스트 | 실패 파일 |
|---|---|---|---|
| **MUT_A** | `calcDerivedBuildingStdAtAcq` 반환 +1000 (일반 split A1·A2) | **40건** | **18개** |
| **MUT_B** | 겸용 `transferBuildingStd`·`acqBuildingStd` +1000 (B1·B2) | **79건** | **21개** |

(전체 node 프로젝트 24,328건 중. 두 집합은 한 파일(`api/transfer.route.zod-required-2-ex-sp-pd.anchor.test.ts`)만 겹친다 — 합계 119건 / 38파일. 변형이 **±1000원 민감 여부**만 보므로 「뺄셈 값을 단언하는 anchor」의 하한이고, 실제 수정 때 갱신이 필요한 건수는 입력 신설에 따른 fixture 보강까지 더해 이보다 많을 수 있다. 베이스라인(변형 없음) 실패는 **0건**(같은 하네스로 변형 없이 실행 — 실패 없음).)

- MUT_A 파일(실패 건수): `api/transfer.route.zod-required-2-ex-sp-pd.anchor.test.ts`(1), `calc/split-housing-separate-acq-part-std.test.ts`(1), `tax-engine/transfer-tax/acq-cost-swap-split.test.ts`(1), `tax-engine/transfer-tax/fractional-lump-sum-deduction.predo.anchor.test.ts`(1), `tax-engine/transfer-tax/fractional-lump-sum-display-echo.test.ts`(1), `tax-engine/transfer-tax/fractional-lump-sum-per-part.test.ts`(4), `tax-engine/transfer-tax/land-building-mixed-acq-mode.test.ts`(2), `tax-engine/transfer-tax/land-building-split.test.ts`(2), `tax-engine/transfer-tax/self-owns-non-purchase.test.ts`(2), `tax-engine/transfer-tax/split-acq-axis-predo.anchor.test.ts`(3), `tax-engine/transfer-tax/split-acq-per-part-completion.test.ts`(5), `tax-engine/transfer-tax/split-acq-std-gate-case-a.test.ts`(1), `tax-engine/transfer-tax/split-acq-std-part-gating.test.ts`(1), `tax-engine/transfer-tax/split-acq-std-price-independent.test.ts`(5), `tax-engine/transfer-tax/split-gain-residual-symmetry.anchor.test.ts`(2), `tax-engine/transfer-tax/split-gain-salescase.anchor.test.ts`(3), `tax-engine/transfer-tax/unregistered-lump-deduction-rate.test.ts`(2), `tax-engine/transfer/expropriation-split-land.anchor.test.ts`(3)
- MUT_B 파일(실패 건수): `api/mixed-use-fractional-axis-b.anchor.test.ts`(1), `api/mixed-use-high-value-share-denominator.anchor.test.ts`(2), `api/mixed-use-part-cards.equivalence.anchor.test.ts`(2), `api/transfer.route.companion-sec163-9-carriage-cp3.anchor.test.ts`(1), `api/transfer.route.mixed-use-89-2-e7.anchor.test.ts`(3), `api/transfer.route.mixed-use-acq-std-date-mismatch.predo.anchor.test.ts`(9), `api/transfer.route.mixed-use-gb-required-ui.anchor.test.ts`(1), `api/transfer.route.mixed-use-unavoidable-outside-capital.anchor.test.ts`(1), `api/transfer.route.pre-designation-contract.anchor.test.ts`(1), `api/transfer.route.zod-required-2-cb-mu-cp.anchor.test.ts`(3), `api/transfer.route.zod-required-2-ex-sp-pd.anchor.test.ts`(1), `tax-engine/transfer-tax/mixed-use-97-2-proviso.anchor.test.ts`(3), `tax-engine/transfer/mixed-use-104-7-surcharge.anchor.test.ts`(5), `tax-engine/transfer/mixed-use-154-1-holding.anchor.test.ts`(5), `tax-engine/transfer/mixed-use-154-1-residence.anchor.test.ts`(13), `tax-engine/transfer/mixed-use-appurtenant-excess-filing-form-f35.test.ts`(18), `tax-engine/transfer/mixed-use-inheritance-acquisition.anchor.test.ts`(2), `tax-engine/transfer/mixed-use-purchase-actual-acquisition.anchor.test.ts`(1), `tax-engine/transfer/one-house-l10-mixed-use-high-value-whole-building.anchor.test.ts`(2), `tax-engine/transfer/review-2026-08-f18.test.ts`(1), `tax-engine/transfer/review-2026-08-f19.test.ts`(4)

참고(grep, 변형 아님): `calcDerivedBuildingStdAtAcq|calcAcqStdPair|stdPriceDerivedFromTotal|buildingDerived|calcApportionRatio`를 직접 언급하는 테스트 파일 14개(`__tests__/calc` 3 · `__tests__/components` 4 · `__tests__/tax-engine/transfer-tax` 5 · e2e 2), 겸용 `housingPrice`를 쓰는 테스트 파일 44개, `landAcquisitionDate`+`standardPriceAtAcquisition`를 함께 쓰는 파일 30개.

### 5.5 저장 이력
- **저장된 `resultData`**(IndexedDB)는 스냅샷이라 엔진을 바꿔도 갱신되지 않는다. 재표시 화면은 최상위 합계만 읽는다(`HistoryDetailDrawer.tsx:65-150` — 에이전트 확인).
- **「이 조건으로 재계산」**은 `inputData`를 `migrateAsset`으로 복원해 폼에 싣고 사용자가 계산을 다시 누르면 **현행 엔진**이 돈다(`transfer-resume-entry.ts:122-155`). 비-별개 일반 split·겸용 저장분은 신규 나목 필드가 비어 ⑧ validate가 막는다 — 마이그레이션에서 값을 **지어내지 않는다**(자동 안분 fallback 금지). 이월/합산 계산의 「저장값 경로」(`determinedTax`)는 옛 엔진 값이라 재계산과 어긋날 수 있다(**확인 필요**: 해당 UI의 고지).
- `ResultView`가 `record.resultData`를 직접 렌더하는 경로는 grep으로 못 찾았다(**확인 필요**).

## §6 역방향 — 뺄셈이 맞는 곳 / 「분할하지 않고 결합가를 그대로」 쓰는 곳

**뺄셈이 법령상 정본인 경로는 찾지 못했다.** 개별주택가격·공동주택가격은 결합 공시이고 국세청 해석은 일관되게 가목:나목 비례다(authority 조사 N1·N9·N10·N12). 다만 아래는 **분할이 목적이 아니라 결합가를 그대로 소비**하므로 분할 방식 변경과 무관하다 — 수정 때 건드리면 안 된다.

| 지점 | 소비 방식 | 근거 |
|---|---|---|
| 개산공제 §163⑥2호가목 (비분할 단건 주택) | `취득시 라목 가액 × 3%`를 결합가 그대로 | `transfer-tax-helpers.ts:362-392`. split에서는 파트별 독립 floor(`split-gain.ts:205-224` 주석: 잔액 흡수 시도 → Excel anchor 14건 파손 이력) — **뺄셈은 `토지+건물 ≡ 라목` 항등성을 지켰고, 비례도 `land'+building' = H`라 합은 보존**되지만 파트별 floor로 1원 차는 가능 |
| 12억 고가주택 안분 §160① | 양도가액 기준(기준시가 무관) | `transfer-tax-taxable-gain.ts` · `calcOneHouseProration` |
| 겸용 주택:상가 안분 | 주택부분 = 개별주택가격(결합), 상가 = 가목×면적 + 나목 | `transfer-tax-mixed-use-helpers.ts:113-132` — 분할 대상이 아니라 부분 간 안분 |
| 공익수용 §164⑨1호 주택 총액 트랙 | `min(개별주택가격, 보상액, 보상기초)` 총액 | `transfer-tax-expropriation-valuation.ts:410-436` |
| 재개발 §164⑦ 본문·§166③ | 라목값 단일, 결합→결합 | `redevelopment-valuation.ts:176-202` |
| 주택 단위 환산(비분할) | `양도가 × 취득시 결합 / 양도시 결합` | 비-split 단건 |
| 부담부증여 §159 | 결합가를 건물 슬롯에 통째로 | `transfer-tax-api-burdened-gift.ts:306-317` |
| 배율 초과분 | 면적 비율 × 토지 양도차익(토지분은 분할 결과를 소비) | **분할 값을 소비하는 쪽**(§1.5) — 면적 비율 자체는 정본 |

## §7 확인 필요

1. 변형 실측은 node 프로젝트(`.test.ts`)만이다. DOM 프로젝트(`.test.tsx` 220건 — 위젯 게이팅·hint 문구)와 e2e 2 spec(`split-mode-gating`·`transfer-self-owns-filing-form`)은 미측정.
2. **토지·건물 취득일이 다른 겸용(B0)** 의 파트별 장특·§104⑤ 영향: 비례 안분의 취득시 값 정의(토지일 가목 vs 건물일 가목+나목)가 authority 조사 S-2·S-3과 연동돼 있어 이 anchor에서 재현하지 않았다.
3. 개별주택가격·공동주택가격의 실제 가목+나목 괴리 **표본**(다건)과 국토부 산정 방식 — fixture 1건뿐.
4. 공동주택 취득 당시 건물 나목의 국세청 산정 방법(집합건물) — 앱 모달(`ApartmentConversionSection`)은 있으나 법적 정합은 미확인.
5. A3(양도시 후퇴)이 Zod를 우회하는 실제 경로 — 직접 엔진 호출 외 도달성 미확인.
6. 일반 split의 UI 도달 경로: 「취득일이 다르면 항상 `isSeparateAcquisition`」이라 (a1)은 엔진 직접 입력이다. UI 비-별개취득이 어떤 조합(`hasSeperateLandAcquisitionDate` ON + 같은 날 · 소유자 분리 + 모든 취득원인)에서 열리는지의 **입구 전수**는 에이전트·본인 모두 완전히 열거하지 못했다.
7. 사이드바 개산공제 미리보기(`transfer-per-asset-summary.ts:624-631`)가 `land > total` clamp 경우 항등성이 깨져도 총액×율을 쓴다 — 비례 전환 후 1원 차 영향은 미측정.
8. 이력 UI에서 저장 `resultData`의 `splitDetail.stdPriceAtAcq`를 재표시하는 화면 유무.

## §8 산출물·재현

- 특성화 anchor: `__tests__/tax-engine/transfer/housing-std-split-proportional.s3-characterization.anchor.test.ts` (26건, `npx vitest run <path>` 통과 · tsc 오류 없음)
- 변형 실측 하네스(임시, 저장소 밖): `/private/tmp/claude-501/-Users-mynote-workspace-Property-related-Taxes/4469ebcb-4585-444f-b128-92140436196b/scratchpad/mut/` — `MUT=A|B npx vitest run --config <scratchpad>/mut/vitest.mut.config.ts`
- 소스 변경 0건(`git status`로 확인: 신규 파일 2개만).

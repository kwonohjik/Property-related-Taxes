# 남은 4건 측정 · 결정 — 축 B 막다른 길 · PR-3 · 재개발 지분 산정방식 · 실세율/MAX_SAFE

- 측정 2026-11-11 · 기준 master `27baf74fb` · route POST · mock 세율(D-1은 실 DB 세율 포함). 측정 에이전트 4개가 병렬로 쟀고 probe는 지웠다. 수치는 에이전트 실측이며 각 PR 착수 시 anchor로 다시 고정한다.
- 사용자 결정 2026-11-11 「모두 권장안으로 순차 진행」 — **Q-40 ~ Q-51 전부 a**. 순서 A → B → C → D(한 PR씩).

## A. 부담부증여 × 상속 × 의제취득일 이후 — ① 요구 막다른 길 (Q-40 · Q-41 · Q-42)

### A.1 실측
- 축 B 상속 지분 카드뿐 아니라 **단건 · 축 A**도 막힌다. ⑧ `publishedValueAtInheritance` 「상속개시일 평가액(상속세 신고가액)을 입력하세요」 — 그런데 부담부증여 화면은 그 칸을 숨긴다(`components/calc/transfer/CompanionAcqInheritanceBlock.tsx:71 · 171-179 · 207-208` — 「입력란을 표시하지 않습니다」 · 커밋 `b6b8ca5b2`). 포커스가 BODY에 남고 계산 요청이 나가지 않는다(Playwright · 토지).
- 컴패니언은 ⑫도 400 `companionAssets.0.inheritanceValuation`(`lib/api/transfer-tax-schema-companion-refines.ts:254-276` `refineCompanionInheritedValue`). 주 자산에는 같은 refine이 없어 단건은 ⑫ 200.
- 부담부증여 K-4는 ① 대신 실지 칸을 쓴다(Q-24 a) — ①을 비우든 2억 · 9억이든 양도차익이 같다.
- 원인: ⑧ `lib/calc/transfer-tax-validate-clause-a.ts:199-241` `postDeemedClauseARequiredError`에 부담부증여 면제가 없다(형제 `originalMemberClauseARequiredError :260`은 면제). 상가 `transfer-tax-validate-commercial-asset.ts:64-69`도 의제취득일 전만 면제.
- 범위: 주택 · 토지 · 상가 · 건물 × 부담부증여 × 의제취득일 이후. 의제취득일 전 · 일반 양도는 막다른 길 아님.
- 오라클(축 A 단건 합, 시가 10억 · 채무 6억 · 지분 60/40 · 지분 2 상속 실지 2억): 270,000,000 + 192,000,000 = **462,000,000**. 축 B 지분 토글 켬 = 462,000,000 · **토글 끔 = 450,000,000(−12,000,000 — 상속 지분이 자산 1의 매매 실지 2.5억으로 계산)**.

### A.2 결정
- **Q-40 a** ⑧ `postDeemedClauseARequiredError` · 상가 ⑧ · ⑫ `refineCompanionInheritedValue`에서 부담부증여(①을 쓰지 않는 경로)를 면제한다. ①은 부담부증여 필수 게이트(실지 칸)가 대신 요구한다.
- **Q-41 a** 단건 · 축 A · 함께 양도 · 축 B를 한 번에.
- **Q-42 a** 지분 취득원인이 자산 1과 다르면(상속 · 증여) 지분 실지 칸(지분 토글)을 ⑧이 요구한다.

### A.3 구현 (2026-11-11)
- ⑧ `postDeemedClauseARequiredError` · 상가 `validateCommercialInheritanceAsset` · ⑫ `refineCompanionInheritedValue`에서 의제취득일 이후 부담부증여를 면제했다(Q-40 a · Q-41 a — 단건 · 축 A · 함께 양도 · 축 B 모두 같은 함수).
- Q-42 a: `bgShareCauseMismatchMessage`(`lib/calc/bg-share-own-acquisition.ts`) — 축 B 지분이 상속 · 증여이고 자산 1과 원인이 다르며 지분 토글이 꺼져 있으면 ⑧ `bgShareOwnAcquisition`(토글 카드로 이동). **자산 1의 취득 금액을 그대로 쓰는 산정방식만**(K-4 · K-6 · K-7) — 환산(K-5)은 그 지분의 취득시 기준시가, 담보 승은 기준시가 × 채무비율이라 제외(전체 회귀에서 `gb-bg-carryover-bundled-block` 지분 분할 K-5 증여 지분 시료로 발견). 상속 지분 × K-5는 기존 규칙(상속 자산 = 평가액, 환산 불가)이 먼저 막는다.
- anchor `transfer.route.bg-inherited-post-deemed-dead-end.anchor.test.ts` 17건(DE-1 축 B 462,000,000 · DE-2 단건 480,000,000이고 ① 무관 · DE-3 토글 요구 · DE-4 ⑫ 직접 호출 200 · DE-5 일반 양도는 종전대로 ① 요구) · 뮤테이션 5/5 · E2E `bg-inherited-post-deemed-dead-end.spec.ts` DE-E1.

## B. PR-3 — 부담부증여 K-4 × §163⑨ 단서 · 일반건물 · 재개발 · 입주권 (Q-43 ~ Q-46)

### B.1 실측(β 0.5)
| 시료 | 일반 양도 | 부담부증여 지금 | 단서 적용 기대 | 과대 |
|---|---|---|---|---|
| 일반건물 상속 1988 두 파트(① 1억+1천만 · ② 2억+5천만) | 750,000,000 | 445,000,000 | 375,000,000 | +70,000,000 |
| 일반건물 상속 1995 건물만 2호 | 850,000,000 | 445,000,000 | 425,000,000 | +20,000,000 |
| 일반건물 토지 1988 상속 + 건물 2010 매매 | 790,000,000 | 445,000,000 | 395,000,000 | +50,000,000 |
| 입주권 · 재개발 원조합원 토지 출자 1988(② §164④ 4.8억) | 720,000,000 | 450,000,000 | 360,000,000 | +90,000,000 |
| 입주권 · 재개발 원조합원 주택 출자 2000(② §164⑦ 7.2억) | 480,000,000 | 450,000,000 | 240,000,000 | +210,000,000 |

- 일반건물: ② 값(취득시 기준시가)은 부담부증여에서 이미 필수이고 `burdenedGiftInfo.*StdPriceAtAcquisition`으로 엔진에 간다. 비교만 없다 — `general-building-route-actual.ts:287-323`이 `postDeemedAcquisition`을 넘기지 않고, 자산 단위 `postDeemedAcquisition`(`burdened-gift-acquisition.ts:213-225`)은 숫자 하나라 파트별 비교를 담지 못한다.
- 재개발 · 입주권: `bgSec163_9ProvisoKind`가 받지 않아(`lib/calc/bg-163-9-proviso.ts`) ④가 `inheritedAcquisition`을 싣지 않고 ② 칸도 화면에 없다. 엔진 K-4 max는 입주권을 가드로 뺀다(`burdened-gift-acquisition.ts:216` `!isRightToMoveInValuation`).
- 숨은 칸 잔존 전송: 재개발 · 입주권 부담부증여 body에 `pre1990Land` · `inheritedHouseValuation`이 실린다(지금 세액 영향 0).

### B.2 결정
- **Q-43 a** 일반건물: ④가 단서 구간 파트에만 파트별 ②를 따로 싣고 엔진 K-4가 파트별 max(실지 파트 칸, ②) × β. 구간 술어는 일반 양도 `transfer-tax-api-gb-sec163-9.ts`와 공용.
- **Q-44 a** 재개발 원조합원: `bgSec163_9ProvisoKind`에 토지 출자 → `land` · 주택 출자 → `house`(PR-1 경로 재사용). ① 칸 매핑은 원조합원 `bgActualAcquisitionTotal`.
- **Q-45 a** 입주권 원조합원: 연다(엔진 가드를 의제취득일 이후 K-4 max에서 푼다). 의제취득일 전 입주권 범위 밖 결정(§166③ 환산 금지 · `inheritance-pre-deemed-bg-pr7b.plan.md`)은 다른 축이라 유지.
- **Q-46 a** 안내 문구(`gbBgPre1990LandNote("market")` 등)를 함께.
- 착수 전 확인(V): 지분 축소 지점(`scaleBurdenedGiftInfo`) · 재개발 §166 분할 경로에서 STEP 0.45 결과와 1원 일치 · 일반건물 한 파트 1985 전 + 다른 파트 이후 경계.

### B.3 구현 B1 — 재개발 · 입주권 원조합원 (2026-11-11 · Q-44 a · Q-45 a)
- `bgSec163_9ProvisoKind`: 재개발 완공 아파트 · 조합원입주권 원조합원 — 토지 출자 → `land`(§164④) · 단독주택 출자 → `house`(§164⑦). **의제취득일 이후만** — `isBgPreDeemedAsset`이 입주권을 받지 않아 1980 상속 입주권이 열렸다(전체 회귀 `bg-pre-deemed-redev` B-1 · Q-30 범위 밖 유지).
- `bgSec163_9ReportedField(kind, asset)` — 원조합원은 토지 출자도 총액 칸(`bgActualAcquisitionTotal`).
- 엔진 K-4 max의 입주권 가드(`!isRightToMoveInValuation`)를 풀었다.
- 화면: 「부담부증여」 카드의 「종전 부동산 실지취득가액」 칸 아래에 `BgSec163_9ProvisoSection`(PR-1 부품 — 토지 면적은 `redevLandArea`).
- 실측(V-b 해소): §166 경로에서도 기대값과 1원까지 같다 — 토지 출자 360,000,000 · 주택 출자 240,000,000 · ② 비움 450,000,000 · ① 승 200,000,000. anchor `transfer.route.bg-163-9-proviso-redev-rtmi.anchor.test.ts` 8건 · 뮤테이션 4/4 · E2E BR-1.

### B.4 구현 B2 — 일반건물 파트별 (2026-11-11 · Q-43 a · Q-46 a)
- ④ `gbSec1639Acquisition`이 부담부증여 · 시가 · 실지(K-4) · 담보 승 아님 · 이월과세 아님에서 단서 구간 파트(일반 양도와 같은 `landSec164Applies` · `buildingSec164Applies` · 의제취득일 전 파트 제외)에 `landSec163_9Proviso` · `buildingSec163_9Proviso` 표시만 싣는다 — ②는 부담부증여에서 이미 필수인 취득시 기준시가(토지 1990 전이면 등급 환산 · 건물 `gbAcqBuildingValue`)라 값은 싣지 않는다.
- ⑫ `generalBuildingValuation` 두 키(`z.literal(true)`) · ⑭ route → `postDeemedProvisoParts` · 엔진 K-4가 파트 A = max(실지 칸, 취득시 기준시가)(지분 축소 후 같은 비율 — V-a 해소). 파트별 3자 max 경로(한 파트 의제취득일 전)도 사용자 파트는 같은 함수를 지난다.
- 안내: 토지 등급 카드 `gbBgPre1990LandNote("market")` · 건물 취득시 기준시가 `gbBgAcqBuildingHint` market_actual에 「큰 금액」.
- 실측: 두 파트 375,000,000 · 건물만 425,000,000 · 분리(토지 상속 · 건물 매매) 395,000,000 · 증여 375,000,000 · 단서 밖 445,000,000 그대로 · ① 승 320,000,000 · 지분 1/2 187,500,000. anchor `transfer.route.bg-163-9-proviso-gb-parts.anchor.test.ts` 9건 · 뮤테이션 6/6 · E2E BG-1.

## C. 재개발 축 B 지분별 산정방식 · 지분 카드 ⑧ 문구 (Q-47 · Q-48)

### C.1 실측
- 지분마다 산정방식을 고를 화면 경로가 없다 — ④ `mergePrimaryBasicAll`(`transfer-tax-api-helpers.ts:251`)이 자산 1의 `bgAcquisitionMethod`를 병합하고, 재개발 지분 토글은 실지 한 칸만 되돌린다(`lib/calc/bg-share-own-acquisition.ts:43-58`). ⑧ 0 · ⑫ 200인 채 조용히 자산 1 방식.
- 오라클과 차이(지분 1 K-4 + 지분 2 K-5): 원조합원 60/40 −23,485,040 · 30/70 −41,098,820 · 승계 60/40 +90,000,000 · 30/70 +157,500,000. 반대 조합도 수천만 ~ 1억대.
- **엔진은 이미 맞다** — ⑫ 본문에서 지분 2의 산정방식만 바꿔 보내면 8칸 모두 오라클과 1원까지 같다.
- 지분 카드 ⑧ 문구: K-6 · K-7(`transfer-tax-validate-bg.ts:587-588`) · K-5(`:439-454`) · 기준시가(`:595`) · 담보 승(`:579`)이 「② 양도정보」를 가리키는데 지분 카드 칸은 「이 지분의 취득시 기준시가 (물건 전체)」다. 값 영향 없음.

### C.2 결정
- **Q-47 a** 재개발 지분별 산정방식(K-4 ↔ K-5)을 연다 — 클라이언트(④ 되돌림 칸 · 토글 노출 · 라디오 · 지분 카드 ③ 판정값 · ⑧)만.
- **Q-48 a** 지분 카드 분기에서 K-6 · K-7 · K-5 · 기준시가 · 담보 승 문구를 함께 고친다(표시만).

### C.3 구현 (2026-11-11 · Q-47 a · Q-48 a)
- Q-47: `bgShareOwnAcquisitionFields` — 재개발은 `bgAcquisitionMethod` + `bgActualAcquisitionTotal`(입주권은 실지 한 칸 그대로) · 토글 노출은 재개발이면 시가 · 담보 승 아님(산정방식 무관) · 지분 블록에 산정방식 라디오(원조합원은 K-6 · K-7이 `bgPresumedBlock`으로 막힌다). 지분 카드 산정방식이 비면(그 전에 저장된 카드) 자산 1 값을 쓴다(`mergePrimaryBasic` — 화면 · ④ · ⑧ 공통). 엔진 변경 없음.
- 의도한 기존 단언 반전 5곳: `__tests__/lib/bg-share-own-acquisition.test.ts`(재개발 K-5 열림) · RO-4(K-5 칸 · 실지 두 칸 · 지분 산정방식) · E2E ROE-1(라디오 있음 · 출처 안내) · ROE-3(토글 보임 · 꺼짐).
- Q-48: `validateBurdenedGiftAsset` — 축 B 둘째 이후 지분 카드면 K-6 · K-7 · K-5 · 기준시가 · 담보 승 문구가 「이 지분 카드의 「이 지분의 취득시 기준시가 (물건 전체)」 칸」을 가리킨다(K-5 양도시 기준시가는 자산 1의 ②). 칸 키 · 조건 그대로.
- 검증: anchor `transfer.route.bg-axis-b-redev-share-method.anchor.test.ts` 8건(원조합원 60/40 417,816,140 · 30/70 435,429,921 · 승계 360,000,000 · 292,500,000 · 반대 조합 431,251,770 · 397,791,436 · 348,000,000 · 384,000,000 = 측정 오라클) · `transfer.route.bg-axis-b-share-card-wording.anchor.test.ts` 7건 · 뮤테이션 3/3 · E2E ROE-4.

## D. 실세율 · MAX_SAFE (Q-49 · Q-50 · Q-51)

### D.1 실측
- 실세율: 시료 6건(G1 · G7 · PD1 · L1 · H1 · C1)에서 실 DB · 로컬 시드(`lib/tax-engine/data/transfer-rate-seed.ts`) · mock의 결정세액이 원 단위까지 같고 손계산(소득세법 §104 · §55① · §95② 표1 · §103 · 지방세법 §103의3 · §92①)과 차이 0원.
  - 함정: 지방세법 §92① 2023 개정(법률 제19230호 · 2023.3.14. 공포)은 부칙 제2조 단서로 2023.1.1. 이후 성립분부터 — efYd=20230216 조회는 개정 전 표가 나온다.
- MAX_SAFE: 9,007,199,254,740,991원 초과 금액은 ⑧ 통과 · ⑫ 400(Zod 4 `.int()` = safeint). `CurrencyInput`(`components/calc/inputs/CurrencyInput.tsx:91-97 · 118-139`)에 자릿수 상한 없음 · 309자리 이상은 `Infinity` → JSON `null`. 화면 문구 일부가 영문 경로(`inheritedAcquisition.reportedValue` · `burdenedGiftInfo.mortgageDebtAmount` · `totalSalePrice`) · null은 「예상 자료형 number, 입력값 null」. 상한 아래(1조 ~ 9,007조)는 엔진 = BigInt 손계산.

### D.2 결정
- **Q-49 a** 실세율 현행 유지(anchor는 양도차익 단언).
- **Q-50 a** `CurrencyInput` 입력 자릿수 상한(15자리).
- **Q-51 a** `FIELD_LABEL`에 세 경로 라벨 · `received null` 문구 정정.

### D.3 구현 (2026-11-11 · Q-49 a · Q-50 a · Q-51 a)
- Q-49: 변경 없음(실세율 = mock = 시드 · 결정세액 차 0원).
- Q-50: `CurrencyInput` 입력 자릿수 상한 `MAX_AMOUNT_DIGITS = 15`(부호 제외 · 붙여 넣기도 앞 15자리) — 전 세목 금액 칸 한 곳. 코드가 값을 넣는 경로(이력 복원 · 자동조회)와 합계 초과는 막지 못한다(측정상 현실 금액 아님).
- Q-51: `FIELD_LABEL`에 `totalSalePrice` · `inheritedAcquisition.reportedValue` · `burdenedGiftInfo.mortgageDebtAmount` 라벨 · `received null` → 「숫자가 너무 크거나 올바르지 않습니다」.
- 테스트 `__tests__/components/currency-input-digit-cap.test.tsx` 6건 · 뮤테이션 2/2.

## E. 부수 발견 — 기록만(확인 필요)

- ~~승계조합원 재개발 K-5 양도차익에 개산공제가 빠진 것으로 보인다~~ → §F에서 측정 · Q-52 a로 해소.
- ~~토지 K-6 · K-7 취득시 기준시가를 비운 직접 API 호출이 ⑫ 200(개산공제 0)~~ → §G에서 측정 · Q-53 a로 해소(「주택 · 상가 · 건물은 400」은 총액으로 보낼 때만 — §G.1).
- ~~축 B ① = 1원 → 지분 적용 후 0 → ⑫ 400~~ → §H.2 재측정: 재현 안 됨(200 · 지분분 0원 = 1 × 0.4 절사 — 계산은 맞다) · 닫음.
- 의제취득일 전 상속분 장기보유 기산일(PD1 `lthdStartDate` 1983-06-01) — 시행령 §162⑥ 확인 필요(세액 영향 0원).

## F. 승계조합원 완공 APT × 부담부증여 × 환산(K-5)·기준시가 — 필요경비 (2026-11-11)

### F.1 측정 (시가 10억 · 채무 6억 · 취득시 기준시가 4억 · 양도시 기준시가 8억 · 단건)

| 경우 | 종전 양도차익 | 일반 주택 규칙 | 차이 |
|---|---|---|---|
| K-5 · 인가 후 필요경비 비움 | 300,000,000 | 292,800,000 | 개산공제 7,200,000 누락 |
| 기준시가 · 비움 | 300,000,000 | 291,000,000 | 개산공제 9,000,000 누락 |
| K-5 · 5천만 | 270,000,000 | 292,800,000 | −22,800,000 |
| 기준시가 · 5천만 | 262,500,000 | 291,000,000 | −28,500,000 |
| K-5 · 6억 | −60,000,000 | 240,000,000 | −300,000,000 |

- 일반 주택 K-5 · 기준시가 같은 시료는 엔진 실측 292,800,000 · 291,000,000. 실지(K-4)와 원조합원(§166③)은 정상.
- 원인: `transfer-tax-redevelopment-steps.ts`가 부담부증여면 승계 추계 입력을 통째로 뺐다(`burdenedGift ? {} : successorEstimateOf`). 승계 분기(`redevelopment-successor.ts`)는 §159 안분 취득가액을 실지로 보고 인가 후 필요경비(β 축소 실제값)를 함께 뺐다 — §159 명세의 개산공제(`perAsset.*.estimatedDeduction`)는 읽는 곳이 없었다.
- 근거: 소득세법 시행령 §159①은 취득가액·양도가액만 정한다(KoreanLaw 조회 2026-11-11). 필요경비는 엔진 기존 규칙(§97②2호 · 시행령 §163⑥) — 일반 주택 부담부증여(`burdened-gift-acquisition.ts` STEP 5·5.5) · 원조합원 기준시가(`burdenedGiftStdLumpBase`) · 매매 승계 추계(`resolveSuccessorEstimate`)가 이미 따른다.

### F.2 결정
- **Q-52 a** 일반 주택과 같은 규칙: 개산공제 = 취득시 기준시가 × 채무비율 × 율(§159 명세 값). 환산이면 §97②2호 단서 택일(나목 = β로 줄인 인가 후 필요경비), 기준시가는 개산공제만.

### F.3 구현
- `successorBurdenedGiftEstimateOf` (steps) — 승계 × 부담부증여 × 환산·기준시가면 §159 명세의 **택일 전** 취득가액(`convertedAcquisitionBeforeSwap` 우선)·개산공제를 넘긴다. 택일은 승계 분기가 다시 한다(§159 명세의 택일은 재개발 전용 칸을 모른다).
- `redevelopment-successor.ts` — 택일을 `chooseEstimatedOrDirect`로 묶어 매매 승계 추계와 공용. `successorMemberDetail.acquisitionMethod`는 `"actual"` 유지(매매 추계 산식 행 `SuccessorEstimateFormula`를 그리지 않는다 — 부담부증여 카드가 §159 명세를 그린다).
- 테스트: `__tests__/api/transfer.route.redev-successor-bg-k5-estimated.anchor.test.ts` 8건 · 뮤테이션 6/6. 의도된 기대값 갱신 4파일(축 B 지분 RM-1·RM-2 · SC-2 · RD-2 · A-3 — 모두 개산공제만큼 감소).

### F.4 결과 카드 필요경비 줄 (2026-11-11 · 렌더 실측으로 정정)
- ~~부담부증여 카드는 택일 전 §159 명세를, 재개발 카드는 엔진 값을 그린다~~ — 코드만 읽고 쓴 판단이었다. **단건** 카드(`SingleDetailCards`)는 재개발 자산이면 「신고서 필요경비」 줄(`BgRedevFilingExpenseRows` · 엔진 값)을 그려 **값은 엔진과 같았다**(K-5 7,200,000 · 기준시가 9,000,000 · 단서 360,000,000).
- 실제 결함 두 가지:
  1. 단건 — 줄 **이름**이 「인가 후 분 — 자본적지출·양도비 — 소득세법 §97①2·3호」 · 「인가 전 분은 개산공제와 실제 필요경비 중 택일 — 시행령 §166①1호」였다. 승계 × 환산·기준시가의 필요경비는 개산공제(§163⑥) 또는 §97②2호 단서 나목이다(#3199 뒤 개산공제가 「자본적지출·양도비」로 적혔다).
  2. 다건 자산별 아코디언(`PropertyBreakdownAccordion`) — 신고서 필요경비 줄이 없어 §159 명세의 택일(`BgNecessaryExpenseRow`)을 그렸다 → 단서 시 「개산공제 7,200,000」 vs 엔진 360,000,000.
- 구현: 엔진 echo `successorMemberDetail.burdenedGiftExpense`(택일 전 취득가액·개산공제·택일) → 카드 prop `redevSuccessorExpense`가 있으면 `BgRedevSuccessorExpenseRow`(개산공제 산식 또는 단서 설명)를 그리고 `BgNecessaryExpenseRow` · `BgRedevFilingExpenseRows`는 그리지 않는다. 단건 · 다건 두 곳 배선.
- 「명세 단서 · 재개발 본문」 조합은 생기지 않는다(실측) — 재개발 나목(인가 후 필요경비 + 자본적지출 + 양도비) ⊇ 명세 나목(자본적지출 + 양도비).
- 테스트 `__tests__/components/bg-redev-successor-expense-row.anchor.test.tsx` 8건 · 뮤테이션 6/6 · E2E `e2e/bg-redev-successor-expense-row.spec.ts` 2건.

### F.5 남은 것 (확인 필요)
- 「신고서 취득가액 합계」 줄 안내(「시행령 제166조 제1항 제1호에 따라 … 따로 계산」)는 승계조합원(§166 밖)에도 뜬다 — 값은 맞다(K-4 포함 · 종전부터).
- ~~축 B · 함께 양도 카드별 행(`BgBundleCardAcqRows`)의 승계 × 환산 지분 필요경비 줄은 측정하지 않았다~~ → §H.

## G. 부담부증여 K-6 · K-7 × 취득시 기준시가 0 — 직접 API (2026-11-11)

### G.1 측정 (문제 20 토지 A · 감정가액 2.5억 · 채무비율 0.2)
| 시료 | 상태 | 개산공제 | 양도차익 |
|---|---|---|---|
| 취득시 기준시가 1.8억 | 200 | 1,080,000 | 28,920,000 |
| 취득시 기준시가 0 | 200 | 0 | 30,000,000 |

- 감정 · 매매사례 **총액**을 토지 · 건물로 나눌 때만 `burdened-gift-acquisition.ts`(「…토지·건물로 나누려면 취득시 기준시가가 필요합니다」)가 400을 냈다. 토지 단독과 **파트별 금액**(주택 · 건물 포함)은 나눌 일이 없어 개산공제 0원인 채 200이었다 — §E의 「주택 · 상가 · 건물은 400」은 총액으로 보낸 경우다.
- 화면은 ⑧이 먼저 막는다(직접 API만).

### G.2 결정 · 구현
- **Q-53 a** 엔진 400 — K-5와 같은 합계 기준(`landStdPriceAtAcquisition + buildingStdPriceAtAcquisition <= 0`) · 같은 예외(의제취득일 전 3자 max). `transfer-tax-burdened-gift-step.ts`.
- 테스트 `__tests__/api/transfer.route.bg-k67-acq-std-required.anchor.test.ts` 6건 · 뮤테이션 2/2 · 기존 부담부증여 K-6/K-7 120파일 2,751건 변화 없음.

## H. 축 B 승계 × 환산 지분 카드 · ① 1원 (2026-11-11)

### H.1 축 B 승계조합원 지분 2 K-5 카드(RM-1 시료 · 60/40 · 지분 2 취득시 기준시가 5억)
| | 엔진 | 종전 카드 | 수정 후 |
|---|---|---|---|
| 칸 비움 · 필요경비 | 개산공제 3,600,000 | 3,600,000 「인가 후 분 — 자본적지출·양도비 — §97①2·3호」 | 「개산공제 = 취득시 기준시가 × 채무비율 × 3%」 3,600,000 |
| 인가 후 필요경비 9억 · 필요경비 | 단서 나목 216,000,000 | 216,000,000 같은 이름 · 단서 설명 없음 | 단서 설명 · 216,000,000 |
| 같은 경우 · 「취득가액 합계 (세액에 쓰인 값)」 | 90,000,000 | 240,000,000 | 90,000,000 |

- 구현: `withCardAcquisitions`가 카드에 `redevSuccessorExpense`(단건 echo와 같다)를 싣고, 단서 카드는 합계에서 취득가액 0 · 필요경비 나목으로 센다. `BgBundleCardAcqRows`가 그 카드에 `BgRedevSuccessorExpenseRow`(묶음 testid)를 그리고 신고서 필요경비 줄을 그리지 않는다. 승계 카드의 취득가액 줄 이름은 「종전 부동산 취득가(인가 전 분)」 대신 「취득가액」.
- 테스트 `__tests__/components/bg-axis-b-successor-card-expense-row.anchor.test.tsx` 2건 · 뮤테이션 4/4 · E2E `e2e/bg-axis-b-successor-card-expense-row.spec.ts` 2건 · 묶음 카드 관련 104파일 1,383건 변화 없음.

### H.2 ① 1원 × 지분(재측정)
- 축 B 지분 40% · 단건 지분 40% 모두 ⑧ 0건 · ⑫ 200 · 지분분 ① = `applyRatio(1, 0.4)` = 0(①이 3이면 1). §A 측정 당시의 ⑫ 400은 재현되지 않는다. 입력값 × 지분 절사라 계산은 맞다 — ⑧을 「지분 적용 후 0」으로 막으면 맞는 입력을 막는다. 닫음.

### H.3 남은 것 (확인 필요)
- 승계조합원 **K-4**(실지) 카드 · 단건의 §166 문구(「종전 부동산 취득가(인가 전 분)」 · 「시행령 제166조 제1항 제1호에 따라 … 따로 계산」 · 「인가 전 분은 … 택일」) — 승계조합원은 §166 밖이다. 값은 맞다(종전부터).

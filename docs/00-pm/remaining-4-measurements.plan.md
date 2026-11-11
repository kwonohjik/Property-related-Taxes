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

## C. 재개발 축 B 지분별 산정방식 · 지분 카드 ⑧ 문구 (Q-47 · Q-48)

### C.1 실측
- 지분마다 산정방식을 고를 화면 경로가 없다 — ④ `mergePrimaryBasicAll`(`transfer-tax-api-helpers.ts:251`)이 자산 1의 `bgAcquisitionMethod`를 병합하고, 재개발 지분 토글은 실지 한 칸만 되돌린다(`lib/calc/bg-share-own-acquisition.ts:43-58`). ⑧ 0 · ⑫ 200인 채 조용히 자산 1 방식.
- 오라클과 차이(지분 1 K-4 + 지분 2 K-5): 원조합원 60/40 −23,485,040 · 30/70 −41,098,820 · 승계 60/40 +90,000,000 · 30/70 +157,500,000. 반대 조합도 수천만 ~ 1억대.
- **엔진은 이미 맞다** — ⑫ 본문에서 지분 2의 산정방식만 바꿔 보내면 8칸 모두 오라클과 1원까지 같다.
- 지분 카드 ⑧ 문구: K-6 · K-7(`transfer-tax-validate-bg.ts:587-588`) · K-5(`:439-454`) · 기준시가(`:595`) · 담보 승(`:579`)이 「② 양도정보」를 가리키는데 지분 카드 칸은 「이 지분의 취득시 기준시가 (물건 전체)」다. 값 영향 없음.

### C.2 결정
- **Q-47 a** 재개발 지분별 산정방식(K-4 ↔ K-5)을 연다 — 클라이언트(④ 되돌림 칸 · 토글 노출 · 라디오 · 지분 카드 ③ 판정값 · ⑧)만.
- **Q-48 a** 지분 카드 분기에서 K-6 · K-7 · K-5 · 기준시가 · 담보 승 문구를 함께 고친다(표시만).

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

- 승계조합원 재개발 K-5 양도차익에 개산공제가 빠진 것으로 보인다(주택 K-5는 넣는다 · 엔진 주석은 「K-5 개산공제 적용」 `burdened-gift-acquisition.ts:131 · 329`).
- 토지 K-6 · K-7 취득시 기준시가를 비운 직접 API 호출이 ⑫ 200(개산공제 0) — 화면은 ⑧이 막는다. 주택 · 상가 · 건물은 ⑫ 400.
- 축 B ① = 1원 → 지분 적용 후 0 → ⑫ 400.
- 의제취득일 전 상속분 장기보유 기산일(PD1 `lthdStartDate` 1983-06-01) — 시행령 §162⑥ 확인 필요(세액 영향 0원).

# 양도세 — 의제취득일(1985.1.1.) 전 매매 부동산 영 §176조의2④ 공통 적용 계획서

- 출처: `successor-right-carryover-contribution.plan.md` §19 Q-1 **(b)** 「부동산 매매 전 자산 공통 계획서」(사용자 결정 2026-11-01 「권장안으로 진행해」) · 메모리 「매매(유상) pre-deemed PPI = 미구현 신규 기능」 · 주식 계획서 `docs/00-pm/stock-pre-deemed-acquisition-176-2-4.plan.md` §9 Z-2
- 상태: **Do — PR-1(엔진) 진행** · 결정 Q-1~Q-13 전부 권장안(사용자 2026-11-01 「권장안으로」) · 조사: 엔진·UI 시니어 병렬(2026-11-01) + 핵심 수치·file:line 직접 재확인.

## 1. 요약

1985.1.1. 전에 **매수**한 토지·건물의 취득가액은 영 §176조의2④에 따라 「① 의제취득일 현재 매매사례·감정·환산가액」과 「② 취득 당시 실가 + 생산자물가상승분」 중 큰 금액이어야 한다. 저장소는 이 비교를 **주식만** 한다(2026-10 구현). 부동산은 어느 자산·어느 모드에서도 하지 않는다 — 실가 모드는 실가 그대로, 환산 모드는 ①만 쓴다.

그리고 화면은 1985.1.1. 전 매매 취득일을 **blur 시 1985-01-01로 덮어쓴다**(`CompanionAcqDateSection.tsx:81-97`). 그래서 ②의 지수 월(취득월)이 엔진에 닿지 않는다. 이 계획의 첫 결정은 취득월을 어떻게 받을지다(Q-1).

규모(mock 세율): 1984.6. 매수 1억 → ② 101,411,574 → 세액 −375,479 ~ −415,003(시료별) · 1980.1. 매수 1억 → ② 156,471,686 → −16,602,676(재개발 시료). 오래 보유할수록 차이가 커진다.

## 2. 법령 (KoreanLaw 원문 확인 · 시행령 MST 290841)

- 영 §176조의2④: 「법률 제4803호 … 부칙 제8조에서 정하는 날(이하 "의제취득일")전에 취득한 자산(상속 또는 증여받은 자산을 포함한다)에 대하여 제3항제1호부터 제3호까지의 규정을 적용할 때에 의제취득일 현재의 취득가액은 다음 각 호의 가액 중 많은 것으로 한다.
  1. 의제취득일 현재 제3항제1호 내지 제3호의 규정에 의한 가액
  2. 취득 당시 실지거래가액이나 제3항제1호 및 제2호에 따른 가액이 확인되는 경우로서 해당 자산의 실지거래가액이나 제3항제1호 및 제2호에 따른 가액과 그 가액에 취득일부터 의제취득일의 직전일까지의 보유기간동안의 생산자물가상승률을 곱하여 계산한 금액을 합산한가액」
- 「소득세법」 부칙(법률 제4803호) 제8조: 「제94조제1호에 규정하는 자산으로서 1984년 12월 31일이전에 취득한 것은 1985년 1월 1일에 취득한 것으로 보며 …」(본문 확인 기록 `docs/00-pm/transfer-acq-cause-mixed.plan.md:347`).
- 실가 신고에도 max: 국세청 제도46014-12108(2001.7.13. — 「실지거래가액으로 신고하는 경우」) · 대법원 2002두4075·2004두1520(주식 계획서 §2 정리). 2호 산식: 국세청 재산46014-10094 — 취득 실가 × 의제취득일 직전일이 속하는 달 지수 ÷ 취득월 지수.
- 2호는 상속·증여에 부적용(조심2023서0676 · `inheritance-acquisition-price.ts:14`) — 이번 범위는 **매매(유상)만**.
- 재개발: 영 §166③(종전 부동산 「취득가액을 확인할 수 없는 경우」 평가액 × 취득일 기준시가 ÷ 인가일 기준시가)과 §176조의2④의 관계는 문언에 없다(§166④2호는 평가액에만 §176조의2③을 끌어 쓴다). 정면 해석례 0건(국세청·조세심판원·판례 5개 검색어).

## 3. 현행 실측 (master `b5944c07b` · mock 세율 · ⑧ → ④ → route → 엔진)

### 3.1 취득일 덮어쓰기 (선결 문제)

- `CompanionAcqDateSection.tsx:32` `MIN_ACQ_DATE = "1985-01-01"` · `handleAcquisitionDateBlur`(:81-87)·`handleLandAcquisitionDateBlur`(:92-98): 입력 < 1985-01-01이면 1985-01-01로 바꾸고 「1985.1.1. 의제 취득일로 취득일 변경했습니다.」 · 배지 「의제취득(§98)」. 상속·증여 원인(`landCause`·`buildingCause`)은 이미 덮어쓰지 않는다(원값 저장 선례).
- 이 칸은 `CompanionAcqPurchaseBlock`을 쓰는 매매 자산 전부(토지·주택·건물·상가·일반건물·겸용·재개발 원조합원·분양권, 주 자산·컴패니언 공통)가 공유한다. Playwright 실측: 1984-3-5 입력 → blur → 1985-1-1 + 안내.
- 따라서 §19의 「1984·1985·1980 같은 세액」은 덮어쓰기를 타지 않은 직접 입력 시료다. 화면 사용자는 원래 취득월을 남길 수 없다. 결론(비교가 없다)은 같다.
- 이월과세 증여자 취득일(`carryover.donorAcquisitionDate`)은 덮어쓰지 않는다.

### 3.2 자산 × 모드 (1984-06-01 vs 1985-06-01 직접 입력 · 전 행 두 날짜 세액 같음)

| 자산 | 모드 | 현행 취득가액 경로 | ① | 시료 | ② 대입 |
|---|---|---|---|---|---|
| 토지·주택 단건 | 실가 | `transfer-tax-helpers.ts:400` `acquisitionCostBase = input.acquisitionPrice` | 없음 | 양도 5억·취득 1억 85,510,000 | 101,411,574 → 85,134,521(−375,479) |
| 토지·주택 단건 | 환산·감정·매매사례 | 같은 파일 :354·:373·:385 | 입력값(시점은 라벨이 통제) | — | 비교 없음 |
| 주택 PHD §164⑦ | 환산 | `transfer-tax-pre-housing-disclosure.ts:42` | 있음(`phd-eligibility.ts`가 의제일 반영) | 80,252,223 | — |
| 상가 | 실가 | 단건 경로 | 없음 | 양도 10억·취득 6억 85,510,000 | 608,469,449 → 83,257,126(−2,252,874) |
| 상가 | 환산 | `transfer-tax-commercial-step.ts:53·127`(건물 취득연도 계수 ≤1985 → 1985 `acq-base-rate.ts:191`) | 있음 | 100,612,733 | — |
| 일반건물 | 실가 | Layer 1 `general-building-route-actual.ts:369` `apportionByStdPrice` | 없음 | 양도 10억·취득 5억 124,366,000 | 507,057,874 → 122,192,174(−2,173,826) |
| 토지·건물 취득일 분리 | 실가 | `transfer-tax-split-acq-price.ts:351·423` | 없음 | 토지 1984/건물 1995 72,210,000 | 파트별 |
| 겸용주택 | 실가·환산 | `transfer-tax-mixed-use*.ts` · 환산 `transfer-tax-mixed-use-housing-acq.ts:69` | 입력 기준시가 | 실가 5억(양도 30억) | 주택·상가 gain 각각 감소 |
| 재개발 원조합원 | 실가 | `redevelopment-split.ts:121` `oldAcquisitionPrice = input.actualAcquisitionPrice` | 없음 | 입주권 374,610,000(§19) | 101,411,575(§19 시료) → 374,194,997(−415,003) |
| 재개발 원조합원 | 환산 | §166③ `redevelopment-valuation.ts` | §166③ 값 | 340,976,400(§19) | — |
| 함께 양도(컴패니언) | — | `transfer-tax-aggregate-asset-records.ts:140` 자산마다 `calculateTransferTax` | 단건과 같음 | 토지 2건 totalGain 800,000,000 | — |
| 이월과세 증여자 매수 | 실가 | 증여자 취득가액 경로 — 의제취득일 분기 0건 | 없음 | donor 1억 81,330,000 | 80,954,521 |
| 부담부증여(일반) 증여자 매수 | — | `burdened-gift-acquisition.ts` `preDeemed`는 상속·증여만 | 없음 | 35,135,000 / 31,215,000 | — |
| 겸용 부담부증여 증여자 매수 | — | MB-16 차단 `mixed-use-burdened-gift-prepare.ts:224-226` · UI `transfer-tax-validate-mixed-use-bg.ts:28` | — | 차단 | — |

- 의제취득일 분기는 상속·증여 STEP 0.45(`transfer-tax-precalc.ts:136` → `inheritance-acquisition-helpers.ts:82·189·208·311`)뿐이다. `transfer-tax-helpers.ts`에 「1985」 0건(메모리 기록 그대로 맞다).
- 화면: 어느 자산에도 §176조의2④·생산자물가 안내가 없다(Playwright 9시료 · 배지 「의제취득(§98)」뿐).
- 개산공제: 환산·감정·매매사례 = 입력한 취득시 기준시가 × 율(§163⑥) · 실가 = 실비(`calcNecessaryExpense` :248). 「추계 → 실가 경로 전환」 장치가 이미 있다 — `resolveAcquisitionOverride`(`transfer-tax-acquisition-override.ts:88`).

### 3.3 지수와 배율

- 표 `lib/tax-engine/data/producer-price-index.ts`(ECOS 404Y014 · 2020=100 · 1965.01~1985.12). 부동산 의제일 직전 달 = 1984.12(50.29) — 주식 `deemedPrevMonth(true)`와 같다.
- 내림 규약(주식 `mulDivFloor` BigInt 1회 절사): 1984.6. 1억 × 5029 ÷ 4959 = **101,411,574**(나머지 4534). §19의 101,411,575는 반올림 값이었다(§19 정정 줄 추가).
- 배율 < 1인 달: 1984.9.(50.71 → 1억 → 99,171,760) · 1984.10.(50.33). 1984.12. 지수보다 높은 달은 이 둘뿐(Q-5).
- 1965.01 전 취득은 표 밖 — 주식은 사용자 직접 입력 배율(주식 Q-4 a).

## 4. 설계 (권장안 기준 — Q 결정 후 확정)

### 4.1 순수 leaf (엔진)

- `lib/tax-engine/pre-deemed-purchase-176-2-4.ts`(신규): `resolvePreDeemedPurchase({ actualPrice, acquisitionMonth, ppiRatioOverride?, clause1Amount? })` → `{ clause2Amount, clause1Amount?, selected: "clause1" | "clause2", ratio, ratioSource }`. 선택 = 주식 규약(① > ②일 때만 ① · 동액 ② · ① 없으면 ②만, 「① 미산정」 표시).
- 지수 유틸(`ppiMonthlyX100`·`deemedPrevMonth`·`isBeforePpiSeries`·`mulDivFloor`)은 지금 `stock-transfer/stock-pre-deemed-acquisition.ts` 안에 있다 → 중립 위치(`lib/tax-engine/data/ppi-ratio.ts`)로 옮기고 주식이 그것을 import(Q-13). 주식 동작 불변을 anchor로 확인.
- 채택 결과: ② 채택 → 실가 경로(실비 · 개산공제 없음 · 환산이면 `resolveAcquisitionOverride`와 같은 전환) · ① 채택 → 입력 모드 그대로(개산공제 · 환산 swap 유지). `legacy directExpenses` 소실 여부를 전환 anchor로 점검(④ `transfer-tax-api.ts:348`이 추계 모드에서 `expenses`를 0으로 보냄).
- 호출 지점: 단건 `transfer-tax-precalc.ts` STEP 0.46 부근(`transfer-tax.ts` 781줄 — 신규 로직 금지) → 컴패니언·다건도 같은 엔진을 탄다. 2차: 일반건물 Layer 1 안분 전 · 분리 파트 · 재개발 `redevelopment-split.ts:121`.
- echo: `preDeemedPurchaseDetail`(① · ② · 배율 · 지수 월 · 채택 · 필요경비 방식) — 결과 카드·명세서·별지 「취득가액」 행 주석이 읽는다.

### 4.2 입력 (Q-1 B · Q-2 a 기준)

- 취득일 칸 덮어쓰기는 그대로 둔다. 덮어쓸 때 원 입력을 신규 필드 `preDeemedOriginalAcquisitionDate`에 보존한다(빈 값이면 사용자가 카드에서 입력).
- ⑤ 신규 카드 `PreDeemedPurchaseCard`(주식 `PreDeemedAcquisitionCard` 동형 · `ToneCard`): 게이트 = 매매 ∧ 취득일 = 1985-01-01(덮어쓰기 결과) ∧ 1차 범위 자산. 칸: 「실제 취득일」(DateInput) · 환산·감정·매매사례 모드면 「취득 당시 실지거래가액(함께 견줌 · 선택)」 · 1965.01 전이면 「물가상승 배율」(DecimalInput). 실가 모드는 실가 칸이 ②의 기준(새 금액 칸 없음).
- 위치: `CompanionAcqPurchaseBlock.tsx:509`(`CompanionAcqStdPriceSection`) 뒤 — 자산 공통 게이트 안. 카드 코드는 하나(주 자산·컴패니언 모두 `CompanionAssetCard` → `AssetSectionAcquisition`).
- 판정 술어 `isPreDeemedPurchaseAsset(asset)`(`lib/calc/` leaf) — ⑤·⑥·⑧·④·⑫가 공유(3중 패턴).
- 「실제 취득일」 빈칸 → ⑧ 차단(취득일이 실제로 1985.1.1.이면 그 날짜를 넣으면 대상 아님). 1965.01 전 + 배율 빈칸 → ⑧·⑫ 차단(주식 Q-4).

### 4.3 14지점 (1차 범위)

| 지점 | 위치 | 비고 |
|---|---|---|
| ① 폼 | 신규 슬라이스 `lib/stores/calc-wizard-asset-pre-deemed-purchase.ts` → `calc-wizard-asset.ts:71` extends | 3필드: 원 취득일 · 함께 견줄 실가 · 배율 |
| ② initial | `calc-wizard-asset-factory.ts` | `""` |
| ③ normalize | 형제 `calc-wizard-asset-migrate-*.ts`(본 파일 719줄) | 단계 변경 없음 |
| ④ API | 신규 `lib/calc/transfer-tax-api-pre-deemed-purchase.ts`(해당할 때만 전송) → 단건 `transfer-tax-api.ts`(753줄 — 형제 분리) · 컴패니언 `transfer-tax-api-companion-payload.ts`(734줄) | 지분이면 금액 규약(`shareOf`) 확인 |
| ⑤ UI | `PreDeemedPurchaseCard` · 덮어쓰기 핸들러가 원값 보존 | `FieldCard hint` · 숫자 placeholder 금지 |
| ⑥ 사이드바 | `transfer-per-asset-summary.ts:331~` | 계산 전 취득가액·필요경비 「계산 후 확정」(주식 동형) |
| ⑦ 결과 | 신규 `results/transfer/PreDeemedPurchaseAcquisitionCard.tsx`(① · ② 나란히 · 채택 · 필요경비 방식) · 명세서 `DetailedStatementFormulaBuilders.ts:533-560·593-700` · 별지 `FilingFormTableRowDefs.ts:60` 주석 | 한국어 풀어쓰기 |
| ⑧ validate | 신규 `transfer-tax-validate-pre-deemed-purchase.ts` · 호출 `transfer-tax-validate-acquisition.ts` | ⑫와 같은 술어 |
| ⑨⑩ Zod enum | 변경 없음(모드 enum 안 늘림) | |
| ⑪ 날짜 fallback | `preDeemedOriginalAcquisitionDate` — `lib/api/date-coerce.ts` | Date 직렬화 함정 |
| ⑫ Zod 객체 | `transfer-tax-schema-base-shape.ts:298` · `transfer-tax-schema-companion.ts` + refine | 누락 = 침묵 strip |
| ⑬ body spread | ④와 같은 지점 | grep 전수 |
| ⑭ Route | `app/api/calc/transfer/engine-input.ts:338` 이웃 · 컴패니언 `bundled-split-helpers.ts:299-323` | Date 변환 |

법령 상수: 신규 `TRANSFER.PRE_DEEMED_PURCHASE_176_2_4`(기존 `INHERITED_BEFORE_DEEMED`는 상속 전용 주석) + `lib/legal-verification/manifest/additions-transfer-decree.ts` 등록 · `npm run verify:legal`.

### 4.4 PR 분할(권장)

1. PR-1 엔진: 지수 유틸 중립화(주식 무변경 anchor) + leaf + 단건 STEP + echo + 엔진 anchor(①/② 채택 · 동액 · 배율 < 1 · 1965 전 배율 · 전환 시 필요경비).
2. PR-2 UI·14지점(1차 범위: 토지·주택(분리 OFF · PHD 포함)·건물·상가 · 주 자산·컴패니언) + E2E.
3. PR-3 2차 범위(일반건물 · 분리 취득 · 재개발 — Q-4 결정에 따라) .
4. PR-4 범위 밖 자산 안내(Q-12).

## 5. 결정 필요 (Q)

| ID | 쟁점 | 선택지 | 권장 |
|---|---|---|---|
| **Q-1** | 취득월 확보(§3.1) | (A) 덮어쓰기 중단·원값 저장(주식 Y-1 β 동형) — 엔진 `acquisitionDate` 소비 193파일·UI 282파일(grep 파일 수)의 보유기간·세율·장특·비사업용 토지·1세대1주택 판정을 전수 점검 / (B) 덮어쓰기 유지 + 원 취득일 신규 필드(덮어쓸 때 자동 보존 · 카드에서 확인) / (C) 원값 저장 + ④에서 `max(원값, 1985-01-01)`로 정규화해 보내고 원값은 별도 전송 — 엔진 불변, UI 소비처 점검 필요 | **(B)** — 기존 소비처를 하나도 바꾸지 않는다(Surgical). 취득일 칸은 지금처럼 의제취득일을 보여 주고 카드가 실제 취득일을 받는다. 약점: 날짜가 두 칸 · 옛 저장값엔 원값이 없어 다시 입력 |
| **Q-2** | 입력 모델 | (a) 주식 확정안 동형 — 모드 라디오 = ①의 방식 · 실가 모드 = ②만(① 미산정 표시) · 환산·감정·매매사례 모드 = 「함께 견줄 실가(선택)」 칸 / (b) 실가 모드에 「의제일 현재 환산과 견주기」 토글로 환산 칸 병행 | **(a)** — 주식이 (b)를 실측 후 기각(검증 6곳 이상 병렬화 · 주식 계획서 §10) |
| **Q-3** | 1차 범위 | (a) 토지·주택(분리 OFF · PHD 포함)·건물·상가 · 주 자산·컴패니언 / (b) 전 자산 한 번에 | **(a)** — 같은 단건 엔진·같은 카드라 한 PR에 닿는다. 일반건물(Layer 1 안분)·분리 취득(파트별 취득월)·재개발(§166③)은 경로가 따로라 2차 |
| **Q-4** | 재개발 원조합원 | (a) ① = §166③(상속 원조합원 Q-8 a와 같은 규약) · ② = 실가 × 배율 · 2자 max / (b) ① = 일반 환산(§176조의2③3호) — 상속 Q-8 b에서 기각된 경로(R4 회귀) / (c) ②만(실가 모드) + 고지 / (d) 적용 안 함 + 안내 | **(a)** — 재개발 분기가 실제로 쓰는 산식과 비교값이 같다. 정면 해석례 0건은 V-4로 남긴다 |
| **Q-5** | 배율 < 1(1984.9.·10.) | (a) 하한 없음(문언 「상승률을 곱하여 … 합산」 · 주식과 같음) / (b) 실가를 하한으로 | **(a)** — 문언과 주식 구현이 같다. 그 달 취득도 ①과 견주므로 max가 실가보다 작아질 수 있다는 점을 카드에 표시 |
| **Q-6** | 동액·① 미산정 | 주식 규약 그대로(동액 ② · ① 없으면 ②만) / 다른 규약 | **그대로** |
| **Q-7** | 1965.01 전 취득 | 직접 입력 배율 칸(주식 Q-4 a) / 차단 | **배율 칸** |
| **Q-8** | 일반건물 일괄취득(2차) | (a) 안분 전 총액에 배율 1회 / (b) 파트별 | **(a)** — 일괄취득은 취득월이 하나다. 분리 취득(파트별 날짜)은 파트별 |
| **Q-9** | 이월과세 증여자 1985 전 매수 | 이번 포함 / 별건(주식 Q-5 동형 · 법적 쟁점) | **별건** + 안내 |
| **Q-10** | 겸용 부담부증여 MB-16 | 유지 / 해제 | **유지** — 겸용은 4부분 기준시가 모델이라 2차에서도 범위 밖 |
| **Q-11** | 다건 계산기(토지·주택 허용 범위) | (a) 1차에서 다건 ④·⑭에도 연결 / (b) 대상 자산이면 「단건 계산기에서만 지원」 차단 | **(b)** — 다건은 ④(`multi-transfer-tax-api.ts`)·⑭(`multi/route.ts`)가 따로라 1차를 작게 둔다. 지금도 다건은 비교 없이 계산하므로 차단은 조용한 과소 취득가액을 막는 쪽 |
| **Q-12** | 범위 밖 자산(겸용 · 다필지 · 이월과세·부담부증여 증여자 매수 · 2차 전 일반건물·분리·재개발) | (a) ⑤ 안내만(「§176조의2④ 비교는 반영하지 않습니다」) / (b) ⑧ 차단 | **(a)** — 지금 계산되는 자산을 막지 않고, 빠진 비교를 화면에 밝힌다. 2차에서 대상이 되면 안내가 카드로 바뀐다 |
| **Q-13** | 지수 유틸 위치 | (a) 중립 leaf로 옮기고 주식이 import / (b) 부동산이 주식 모듈을 import | **(a)** — 양도세 엔진이 주식 모듈에 기대지 않게 한다. 주식 동작 불변 anchor 필수 |

## 6. 케이스 매트릭스 (PR-1·2 anchor 초안 · 값은 Do 전 Pre-Do anchor로 확정)

| # | 시료 | 기대 |
|---|---|---|
| A1 | 토지 매매 실가 1억 · 실제 취득 1984.6. | ② 101,411,574 채택 · 실비 · 85,134,521 |
| A2 | 같음 · 실제 취득 1984.12. | 배율 1 · ② = 실가 · 85,510,000(현행과 같음) |
| A3 | 같음 · 1984.9. | ② 99,171,760(배율 < 1 · Q-5 a) |
| A4 | 환산 · 함께 견줄 실가 1억 · ① > ② | ① 채택 · 개산공제 · 현행 환산과 같은 세액 |
| A5 | 환산 · ① < ② | ② 채택 · 실가 경로 전환 · 개산공제 없음 |
| A6 | 환산 · 실가 빈칸 | ①만 · 현행과 같음 |
| A7 | 실가 · 실제 취득 1963.5. · 배율 빈칸 | ⑧·⑫ 차단 |
| A8 | 같음 · 배율 입력 | ② = 실가 × 배율 |
| A9 | 실제 취득일 빈칸(옛 저장값) | ⑧ 차단 · 카드 칸 있음(막다른 길 아님) |
| A10 | 상속·증여 1984 | 카드 없음 · 현행 3자 max 그대로 |
| A11 | 매매 1990 | 카드 없음 · 현행과 같음 |
| A12 | 컴패니언 토지 1984 실가 | 주 자산과 같은 규칙 |
| A13 | 상가 실가 6억 1984.6. | 608,469,449 · 83,257,126 |
| A14 | 다건 · 토지 1984 매매 | 차단(Q-11 b) |
| A15 | 주식 회귀 | 지수 유틸 이동 전후 같은 결과 |

## 7. 확인 필요 (V)

- V-1 Q-1에서 (A)·(C)를 고르면: 원값 저장이 보유기간·장특·세율·비사업용 토지·1세대1주택 판정에 주는 영향(미측정). (B)면 해당 없음.
- V-2 다필지 `ParcelListInput`의 1985 전 날짜 처리 — 덮어쓰기·안내 없음만 확인, 세액 영향 미측정.
- V-3 감정·매매사례 모드 입력값이 「취득 당시」인지 「의제취득일 현재」인지 — 현 라벨 「취득일 전후 3개월」(`SalesCaseSection.tsx:98`). ①은 의제취득일 현재, ②의 감정·매매사례 기준(2호 「제3항제1호 및 제2호에 따른 가액」)은 취득 당시라 한 칸으로는 둘을 못 가른다 → 1차는 ② 기준을 실가로 한정(주식과 같음).
- V-4 재개발 §166③ × §176조의2④ 정면 해석례(0건).
- V-5 분양권 1985 전 취득 성립 여부·⑧ 차단 여부.
- V-6 별지 서식 「취득일」 행에 의제취득일·실제 취득일 중 무엇을 적을지.
- V-7 `sec164AcqTimePointLabel`이 덮어쓴 1985-01-01에서 의제취득일 안내를 내지 않는 것(`isDeemedAcquisitionApplied`는 `< 1985-01-01`)을 렌더로 확인 — 등급 시점(1985.1.1.)은 같아 값 영향은 없다고 읽힌다.
- V-8 지분 자산의 함께 견줄 실가 규약(전체 금액 vs 지분 금액 · `shareOf`).

## 8. 범위 밖

- 상속·증여 의제취득일 전(기존 3자 max — 변경 없음) · 주식(구현 완료) · 의제취득일 × 보유기간(별개 축 `transfer-gb-pre1985-163-9.plan.md` §6 (3)) · 2009.3.15. 이전 양도.

## 9. 결정 (사용자 2026-11-01 「권장안으로」)

Q-1 (B) · Q-2 (a) · Q-3 (a) · Q-4 (a) · Q-5 (a) · Q-6 주식 규약 · Q-7 배율 칸 · Q-8 (a) · Q-9 별건 · Q-10 유지 · Q-11 (b) · Q-12 (a) · Q-13 (a).

## 10. PR-1 엔진 결과

- 공용 leaf `lib/tax-engine/producer-price-ratio.ts` — 주식 모듈의 지수 유틸(`isBeforePpiSeries`·`monthKey`·`ppiMonthlyX100`·`mulDivFloor`·`ratioToScaled6`)을 본문 그대로 옮겼다. 주식은 이 파일을 import하고 기존 import 경로용으로 `isBeforePpiSeries`·`ppiMonthlyX100`을 재노출한다(주식 테스트 1,519건 통과 — Q-13 a).
- 입력 `TransferTaxInput.preDeemedPurchase`(`types/transfer-pre-deemed-purchase.types.ts`): `originalAcquisitionDate`(실제 취득일 — 취득일 칸은 의제취득일) · `actualPrice`(환산·감정·매매사례 모드의 함께 견줄 실가 · `acquisitionPrice`와 같은 금액 규약) · `ppiRatio`(1965.01 전). 결과 `preDeemedPurchaseDetail`(① · ② · 지수 · 배율 · 채택 · 필요경비 방식).
- STEP 0.471(`transfer-pre-deemed-purchase.ts` `runPreDeemedPurchaseStep` · 호출 `transfer-tax-precalc.ts` STEP 0.47 뒤): ①은 본 계산과 같은 함수로 구한다(`calcTransferGain().estimatedBase` · 상가 환산은 `runCommercialBuildingStep`). ② 채택이면 `acquisitionPrice = ②` · 추계 모드는 `useEstimatedAcquisition: false`·`acquisitionMethod: "actual"`로 실가 경로(실비 · 개산공제 없음) · 1990.8.30. 전 토지 환산 echo 제거. 범위 밖(취득원인 · 부담부증여 · 상속·증여·이월과세 · 재개발·다필지·겸용 · 자산 종류 · 토지·건물 취득일 분리 · 외부 취득가액 지정)과 1965.01 전 배율 빈칸은 값을 바꾸지 않고 경고만 남긴다.
- 결과 echo는 반환 경로(비과세·차손·다필지·§155⑳·정상)가 다섯 갈래라 `calculateTransferTax`를 얇게 감싼 한 곳에서 싣는다(본체는 `calculateTransferTaxCore`).
- 법령 상수 `TRANSFER.PRE_DEEMED_PURCHASE_MAX`(「소득세법 시행령 §176조의2 ④」)·`PRE_DEEMED_PPI_RATE_RULE`(「소득세법 시행규칙 §85의2」) — 두 인용 모두 manifest에 이미 있다(커버리지 게이트 통과).
- anchor `__tests__/tax-engine/transfer/pre-deemed-purchase-176-2-4.anchor.test.ts` 27건(수정 전 25건 실패): 실가 1984-06 → ② 101,411,574 · 양도차익 398,588,426 · 1984-12 배율 1 · 1984-09 99,171,760 · 1980-01 156,471,686 · 환산 ① 2억 vs ② 101,411,574 → ① · 실가 3억 → ② 304,234,724 · 동액 → ② · 감정·매매사례 ①/② · 1990 전 토지 환산 ② 채택 시 1990 echo 없음 · PHD ① = 분리 경로 값 · 상가 실가 608,469,449 · 상가 환산 ① 4억 / ② 507,057,874 · 1963 배율 빈칸 경고 / 3.5 → 350,000,000 · 범위 밖 3종 · 외부 지정.
- 전체 vitest 44,700건 통과 · tsc 0 · ESLint 오류 0·경고 373(기준선과 같음).
- 뮤테이션 22개 사멸. 살아남은 4개는 결과에 영향이 없는 중복 줄이라 코드에서 지웠다. ② 채택 시 PHD·파트 모드·감정·매매사례 값을 끊는 줄은, 같은 날 토지 취득일이면 분리 경로를 타지 않고 방식이 「실가」면 감정·매매사례 분기에 들어가지 않아 지웠다.

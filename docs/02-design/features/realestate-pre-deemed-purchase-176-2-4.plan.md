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

## 11. PR-2 화면·14지점 결과

- ①②③ 슬라이스 `lib/stores/calc-wizard-asset-pre-deemed-purchase.ts`(`preDeemedOriginalAcquisitionDate`·`preDeemedActualPrice`·`preDeemedPpiRatio`) — AssetForm extends · factory `PRE_DEEMED_PURCHASE_DEFAULTS` · migrate `migratePreDeemedPurchaseFields`.
- 단일 술어 `lib/calc/transfer-pre-deemed-purchase-form.ts`: `isPreDeemedPurchaseAsset`(매매 · 부담부증여 아님 · 취득일 칸 = 1985-01-01 · 토지·주택·건물·상가 · 겸용·다필지 아님 · 토지·건물 취득일 분리는 PHD일 때만) · `preDeemedPurchaseApplies`(실제 취득일 < 1985-01-01) · ④ `buildPreDeemedPurchasePayload`(단건 `ratioed` · 컴패니언 `makeRatioed` — 지분 금액 규약) · ⑧ `preDeemedPurchaseInputError`(실제 취득일 빈칸 · 1985 이후 · 1965.01. 전 배율 빈칸). ⑤·⑥·⑧·④·다건이 같은 술어를 읽는다.
- ⑤ 취득일 칸 덮어쓰기(`CompanionAcqDateSection`)가 원 입력을 `preDeemedOriginalAcquisitionDate`에 보존한다 — 두 키를 한 패치로(연속 패치는 `assetsRef` 옛 스냅샷이 앞 패치를 덮는다). 카드 `PreDeemedPurchaseCard`(실제 취득일 · 추계 모드면 함께 견줄 실가 · 1965.01. 전 배율 · 1984.9.·10. 배율 1 미만 안내)를 `CompanionAcqPurchaseBlock` 기준시가 섹션 뒤에 둔다(주 자산·컴패니언 공통).
- ⑫ `lib/api/transfer-tax-schema-pre-deemed-purchase.ts`(실제 취득일 < 1985-01-01 · 1965.01. 전이면 배율 필수) — 본체 base-shape · 컴패니언 스키마. ⑭ `engine-input.ts` · 컴패니언 `bundled-split-helpers.ts`(Date 변환).
- 다건(Q-11 b): ⑧ `validateMultiSupportedMode` · 서버 `MULTI_REJECT_RULES.preDeemedPurchase` — 같은 문구 `MULTI_PRE_DEEMED_PURCHASE_UNSUPPORTED_MESSAGE`.
- ⑥ 사이드바: 실제 취득일이 1985 전이면 계산 전 취득가액·필요경비 「계산 후 확정」 · ② 채택 결과 후 ② 금액. ⑦ 결과 카드 `PreDeemedPurchaseResultCard` — 단건 결과뷰 · 공용 `ValuationDetailCards`(함께 양도·다건 카드) · `TransferValuationDetailSource`·`pickValuationDetails`에 `preDeemedPurchaseDetail` 추가.
- 클라이언트 번들 함정: 공용 문구를 엔진 본체 파일에 두면 화면 → 엔진 → `transfer-tax-helpers` → DB(`next/headers`)를 끌어와 Build Error — `transfer-pre-deemed-purchase-messages.ts`로 분리했다.
- 명세서 산식(`DetailedStatementFormulaBuilders`)·별지 서식 「취득가액」 행 주석은 이번 PR에서 바꾸지 않았다(결과 카드·계산 단계 줄이 근거를 보인다) — V-6과 함께 후속.
- 검증:
  - anchor `__tests__/components/pre-deemed-purchase-ui.anchor.test.tsx` 37건 · 수정 전 15건 실패.
  - 뮤테이션 24개 전부 사멸.
  - E2E `e2e/pre-deemed-purchase-176-2-4.spec.ts`(PD-E1~E3) 3회 연속 통과 · 수정 전 3건 실패.
  - 관련 E2E 59스펙 330건 통과.
  - vitest 전체: 3건 갱신 후 통과.
    - 리터럴 `÷` 문구 2건 → 「…를 …로 나눈 비율」.
    - 계약 개수 15 → 16.
  - tsc 0 · ESLint 0 / 373.
  - 라이트·다크·375px 스크린샷 가로 스크롤 없음.
- 실측(E2E·mock):
  - 1984-06-01 입력 → 취득일 칸 1985-01-01 · 카드 실제 취득일 1984-06-01 · 요청 `preDeemedPurchase: { originalAcquisitionDate: "1984-06-01" }` · 결과 ② 101,411,574 채택.
  - 환산 + 함께 견줄 실가 3억 → ② 304,234,724(① 200,000,000).
  - 1984-09 → ② 297,515,282(배율 0.9917).
- 1990.8.30. 전 토지는 환산이면 §164④ 칸(1990.1.1. 공시지가·등급)이 ①의 분자를 만든다 — 그 칸 없이 환산을 고르면 기존 ⑧이 막는다(정상).

## 12. PR-3 상세 설계 (2차 범위 · 엔진·UI 시니어 병렬 조사 2026-11-01 · 주요 file:line 직접 재확인)

### 12.1 PR-3a — PR-2 회귀: 일반건물 매매 취득일 덮어쓰기가 날짜 키를 잃음 (수정)

- 원인: PR-2가 덮어쓰기를 `onAssetChange({ acquisitionDate: 1985-01-01, preDeemedOriginalAcquisitionDate })` 한 패치로 바꿨다. 일반건물 매매 카드는 같은 칸에 `landAcquisitionDate`를 넘기고 날짜 핸들러 `setLandAcqDate`가 분리 여부로 키를 고른다(`GeneralBuildingAcquisitionCards.tsx:159-160·372-373·452`).
- 실측(수정 전 · anchor·E2E): 분리 OFF 1984-06-01 → 저장값 `acquisitionDate` 1985-01-01 · `landAcquisitionDate` 1984-06-01(불변식 깨짐 · 칸은 1984 그대로) / 분리 ON 토지 1984-06-01 · 건물 1995-03-01 → **건물 취득일이 1985-01-01로 덮임**(1995 소실).
- 수정: 덮어쓰기 패치를 호출부가 만든다 — `BlockProps.onAcquisitionDateClamp(clamped, original)`. 토지·주택 호출부(`CompanionAcquisitionCauseSection`)는 날짜 패치 + 원값 보존을 한 패치로 쓰고, 일반건물은 넘기지 않아 종전처럼 `setLandAcqDate(1985-01-01)`만 탄다(일반건물은 아직 범위 밖 — 원값 보존은 일반건물 PR에서).
- 검증: anchor `__tests__/components/pre-deemed-clamp-callers.anchor.test.tsx` 3건(실제 호출부 렌더 · 수정 전 2건 실패) · 뮤테이션 3개 사멸 · E2E `e2e/pre-deemed-clamp-general-building.spec.ts` PD-GB1·2 3회 연속 통과 · 수정 전 2건 실패 · 관련 E2E 129건(취득일 칸) + 297건(일반건물) 통과 · 전체 vitest 44,809 통과 · tsc 0 · ESLint 0/373. 화면 모양 변경 없음(스크린샷 생략).

### 12.2 남은 2차 범위 — 경로별 현행과 설계

실측은 mock 세율 · 1984-06-01 매수 · ② = floor(실가 × 5029 ÷ 4959). 「기대」는 STEP 치환과 같은 입력을 수동으로 넣어 돌린 값(구현 후 anchor 기준값).

| 경로 | 현행 | ① 계산 함수(본 계산과 같은 함수) | ② 채택 전환 | 실측 현행 → 기대(결정세액) |
|---|---|---|---|---|
| C 재개발 원조합원(완공 APT·입주권) | `transfer-pre-deemed-purchase.ts:53` 범위 밖 경고 · 실가 `redevelopment-split.ts:121` | `resolveRedevelopment166_3AcquisitionPrice`(`redevelopment-166-3-price.ts` · 상속 3자 max ③과 같은 함수 · Q-4 a) · 실가 모드는 ① 없음 | 실가: `acquisitionPrice = ②` · 환산: `useEstimatedAcquisition: false`(재개발 단계 입력이 STEP 뒤 `effectiveInput`에서 만들어짐 `transfer-tax-redevelopment-steps.ts:85-86`) | APT 실가 1억 67,480,121 → 67,104,643 · 입주권 실가 92,160,000 → 91,784,521 · 환산 ① 141,221,534 vs 함께 견줄 실가 3억 ② 304,234,724 → 55,836,614 → 9,020,106 |
| A 일반건물 일괄(분리 OFF) | `route.ts:288` 일반건물 분기가 STEP 0.471을 안 거쳐 `preDeemedPurchase`를 **말없이 무시**(경고 0 · 화면은 게이트가 안 열어 직접 호출만) | 환산 ① = `buildEstimatedGeneralBuildingCards(...).gbOut.acquisition` 토지+건물(상속 의제 trial 선례 `general-building-route-helper.ts:203`) | 실가: 안분 전 `actualAcquisitionPrice`(`route.ts:293` `bundledAcq`)를 ②로(Q-8 a) · 환산 → 실가 뒤집기 장치 없음(선례 `general-building-pre-deemed.ts`는 실가 → 환산 한 방향) | 실가 5억 110,082,826 → 107,748,757(② 507,057,874 · 취득시 기준시가 비율 안분) |
| B 토지·건물 취득일 분리(주택·건물·상가 · 일반건물 분리 ON) | `:57-59` 범위 밖 · 토지 칸 덮어쓰기는 원값을 버림(`CompanionAcqDateSection.tsx` `handleLandAcquisitionDateBlur`) | 파트 `calcPartAcquisitionPrice`(`transfer-tax-split-acq-price.ts:220-254`) — STEP에서 `calcSplitGain` probe(선례 `transfer-tax-split-carryover.ts:248`) | 실가 파트: `landAcquisitionPrice = ②` · 추계 파트: `landAcqMode = "actual"` + `landAcquisitionPrice = ②`(감정 모드는 같은 칸이라 함께 견줄 실가 칸 별도) | 토지 1984 실가 1억 · 건물 1990: 113,060,000 → 112,664,759 · 토지 환산 ① 1억 vs 실가 1.5억 ② 152,117,362: 112,220,000 → 98,467,138 |

- 입력: C·A는 `PreDeemedPurchaseInput` 그대로(취득월 하나). B는 파트별 취득월이라 토지 파트 3필드가 새로 필요하다(Q-16).
- echo: C는 단건 래퍼(`transfer-tax.ts:90-95`)가 그대로 싣는다 — `clause1Method`에 §166③ 표지 추가(`estimated`로 쓰면 근거가 §176조의2③3호로 잘못 보인다). A는 `generalBuildingValuationDetail`에 싣고 결과는 `GbResultBlocks.tsx:151-153` 옆. B는 파트별(Q-18).
- 화면: C는 PR-2 카드가 `hidesGeneralAcqSection` 안이라 원조합원에 안 그려진다 — `RedevelopmentBlock.tsx` ⑤ 「인가전 분 종전 부동산 취득가액」 안에 같은 카드. ④⑫⑭는 최상위 `preDeemedPurchase` 배관을 그대로 탄다. A는 ⑥ 일반건물 결과가 `mode: "bundled"`라 PR-2 `pdPending` 조건(`transfer-per-asset-summary.ts:331`)을 그대로 열면 계산 뒤에도 「계산 후 확정」에 갇힐 수 있다(코드 추론 · 확인 필요).
- 다건: 일반건물·재개발은 이미 막혀 있다. 분리는 술어를 넓히면 `validateMultiSupportedMode`·`MULTI_REJECT_RULES.preDeemedPurchase`가 그대로 막는다.

### 12.3 PR-2에서 남은 구멍 (B에서 함께 닫음)

- 주택 PHD 분리 갈래(토지·건물 날짜 두 칸): 둘 다 1985-01-01로 덮이면 엔진 범위 판정(같은 날)을 통과하는데, 실제 취득월이 서로 달라도 배율은 건물 원값 하나로 간다(토지 원값은 보존되지 않음). 세액 영향 미측정 — 확인 필요.

### 12.4 결정 필요 (Q-14~)

| ID | 쟁점 | 선택지 | 권장 |
|---|---|---|---|
| Q-14 | 남은 PR 순서 | (a) 경로별 C → A → B(각 PR에 실가·추계 모두) / (b) 모드별(세 경로 실가 ②만 → 추계 ①) | **(a)** — 카드 배치·결과 화면이 경로마다 달라 한 경로씩 닫는 편이 화면을 두 번 건드리지 않는다. C가 가장 작다(배관 재사용 · ① 함수 있음) |
| Q-15 | 일반건물 환산·감정·매매사례에서 ② 채택 | (a) 환산 → 실가 뒤집기 장치 신설(필요경비 파트 축 ↔ 자산 축 역매핑) / (b) 일반건물은 실가 모드만 비교 · 추계 모드는 「비교는 반영하지 않습니다」 안내(Q-12 a) | **(b)** — 뒤집기는 선례가 없고 필요경비 매핑 회귀 위험이 크다. 약점: 일반건물 추계 + 높은 실가는 ②를 못 쓴다(안내로 밝힘) |
| Q-16 | B 입력 모양 | (a) 평면형 토지 파트 3필드 추가(기존 3필드 = 건물 파트) / (b) `parts: { land, building }` 중첩 | **(a)** — 슬라이스·⑫·④ 변경 최소 |
| Q-17 | B ① 획득 | (a) STEP에서 `calcSplitGain` probe / (b) `calcSplitAcquisitionPrice` 안에서 비교 | **(a)** — 분리 엔진 무변경 · 선례 있음 |
| Q-18 | B echo | (a) 한 detail 안 파트 목록 / (b) 파트별 echo 2개 | **(a)** — 결과 카드 1개 유지 |

### 12.5 결정 (사용자 2026-11-01)

Q-14 (a) 경로별 C → A → B · Q-15 (b) 일반건물은 실가 모드만 비교 + 추계 모드 안내. Q-16~18은 구현 수준이라 권장안(a)대로 진행.

### 12.6 PR-3b 경로 C 재개발 원조합원 결과

- 엔진: 범위 판정이 재개발 원조합원(`isRedevelopmentActive` · 승계조합원 아님)을 연다. ① = `resolveRedevelopment166_3AcquisitionPrice`(`clause1Method: "redevelopment166_3"`) · 모드는 환산 플래그 하나(재개발 경로는 감정·매매사례를 읽지 않는다) · §166③ 칸이 비면 ① 미산정.
- 화면: 술어가 입주권·완공 APT 원조합원을 연다(`redevHidesGeneralAcqSection`) · 일반 취득가액 영역이 숨어 카드를 `RedevelopmentBlock` ⑤ 아래에 둔다 · 카드·결과 문구에 §166③. ④⑫⑭는 최상위 `preDeemedPurchase` 그대로.
- ⑥: ②는 인가전 분 기준이라 사이드바 취득가액은 §166 분해 합(시료: ② 101,411,574 + 납부 청산금 1억 = 201,411,574).
- 검증:
  - anchor 23건(엔진 13 · 화면 10) · 수정 전 엔진 7건 실패(그 뒤 추가한 2건은 수정 전 미측정) · 뮤테이션 14개 사멸(처음 살아남은 2개는 테스트 추가 후 사멸).
  - E2E `pre-deemed-purchase-redevelopment.spec.ts` PD-R1~3: 수정 전 3건 실패 · PR-2 스펙과 3회 반복 18건 중 PD-E2 1건 실패(전체 vitest 동시 실행 중 · 1.0분) → 단독 8회 통과(원인 미증명) · 관련 E2E 175건 통과.
  - 전체 vitest 44,868 통과 · tsc 0 · ESLint 0/373 · 라이트·다크·375px 가로 스크롤 없음.
- 실측(mock): 입주권 실가 1억 → ② 101,411,574 · 환산 + 함께 견줄 실가 5억 → ② 507,057,874 채택(① 4억) · 함께 견줄 실가 1억 → ① 4억 채택.
- 남은 확인: V-4 §166③ × §176조의2④ 정면 해석례 0건 그대로 · 함께 양도(컴패니언) 재개발은 같은 ④·엔진을 타지만 이번에 실측하지 않음 — 확인 필요.

### 12.7 PR-3c 경로 A 일반건물 일괄취득 결과

- 범위: 매매 · 분리 OFF · 증축 없음 · 건물도 매수 · 비부담부증여 · 토지·건물 저장값 모두 1985-01-01 · **실가 모드만**(Q-15 b). 추계 모드는 입력 카드 대신 「비교를 반영하지 않습니다」 안내.
- 엔진: `generalBuildingValuation.preDeemedPurchase`(서브객체 — 최상위가 아니다)를 실가 카드 조립(`buildActualGeneralBuildingCards`)의 일괄 안분 분기가 읽는다. 안분 전 총액 = ② · 취득시 기준시가 비율 안분(Q-8 a). ② 산식은 `pre-deemed-purchase-clause2.ts`로 빼 단건 STEP과 공유한다.
- 같은 카드 조립 함수라 단건·함께 양도·지분 분할이 같이 동작한다. 지분 분할은 지분마다 실제 취득일이 달라 자기 배율을 쓴다(50%+50% · 1984.6./1984.9. → 253,528,937 / 247,929,402).
- 덮어쓰기: 분리 OFF만 원값을 보존한다(§12.1의 `onAcquisitionDateClamp`) · 분리 ON은 경로 B에서.
- ⑥: 계산 후 「계산 후 확정」 해제 조건을 `!result`로 일반화(일반건물 결과는 `singleResult`·`bundledProperty`로 못 잡는다 — §12.2의 추론 확인). ⑦: `GbResultBlocks`가 비교 카드를 그린다.
- 최상위 `preDeemedPurchase` + 일반건물 직접 호출은 여전히 무시된다(화면은 보내지 않는다). 서브객체가 정본 — 별도 차단 없음. 확인 필요 시 후속.
- 검증: anchor 22건 · 뮤테이션 20개 사멸(처음 살아남은 echo 2개는 단언 강화 후 사멸) · E2E PD-G1~4 3회 연속 12건 · 수정 전 4건 실패 · 관련 E2E 438건 · 전체 vitest 44,895 · tsc 0 · ESLint 0/372 · 라이트·다크·375px 가로 스크롤 없음.
- 실측(mock): 양도 10억 · 실가 5억 · 1984.6. → ② 507,057,874 · 세액 = ②를 실가로 직접 넣은 결과와 같음.
- §12.6 보충: 함께 양도 재개발도 실측했다 — 컴패니언 요청에 실제 취득일 · 취득가액 201,411,574(② 101,411,574 + 청산금 1억).

### 12.8 PR-3d 경로 B 토지·건물 취득일 분리 결과

- 결정(사용자 2026-11-01): 한 파트만 1985 전이면 그 파트만 비교 · **두 파트 모두 1985 전이면 비교 없이 안내**. 두 칸이 모두 1985-01-01이 되면 `isSeparateAcquisition`이 꺼져 파트 실가·취득월을 받을 곳이 없다. 주택 PHD 두 칸도 실제 취득월이 다르면 비교를 빼고 안내한다(§12.3의 구멍을 닫음 · 토지 원값이 없는 옛 저장값은 판별 불가라 종전처럼 건물 날짜 기준).
- 입력(Q-16 대체): 대상 파트가 하나뿐이라 토지 파트 3필드 대신 `part` 표지 + 토지 원 취득일 1필드(`preDeemedOriginalLandAcquisitionDate`)만 더했다. 함께 견줄 실가·배율은 기존 칸을 쓴다.
- 엔진: `preDeemedPurchase.part` — 실가 파트는 그 파트 실가 × 배율 · 추계 파트는 ① = `calcSplitGain(input)[part].acquisitionPrice`(Q-17 a) vs ②. ② 채택이면 그 파트만 실가 모드(상대 파트 불변). 범위: 주택·건물 · 별개 취득 · 그 파트 날짜 = 의제취득일 · 파트 원인 혼합·소유자 분리 없음. 상가는 분리 경로가 없어 범위 밖.
- 일반건물 분리 ON: 두 파트 모두 실가일 때만 그 파트 실가에 배율(`part_input`) · 파트에 추계가 있으면 안내(Q-15 b). 건물 칸에도 덮어쓰기·원값 보존을 더했다(종전엔 1984가 그대로 남았다).
- echo(Q-18 대체): 비교 대상이 한 파트라 목록이 필요 없다 — `detail.part` 표지 + 결과 카드 제목 「(토지)」·「(건물)」.
- ⑥: 분리 자산은 ②가 한 파트 금액이라 사이드바는 엔진 파트 합을 쓴다(anchor가 입력 합 5억이 남는 결함을 잡아 수정 · 501,411,574).
- 검증:
  - anchor 32건 + 덮어쓰기 5건 · 뮤테이션 27개 전부 사멸(기준선 통과 게이트를 두고 재실행 — 테스트 파일이 실패 중일 때의 첫 재실행은 전부 가짜 사멸이라 버렸다).
  - E2E `pre-deemed-purchase-split.spec.ts` PD-S1~3: 수정 전 3건 실패 · 3회 연속 9건 통과.
  - 관련 E2E 553건 통과(40스펙 단위 재실행). 한 서버 연속 실행은 BV-6 타임아웃 뒤 전건 80~100ms 실패 — 서버 중단으로 보이나 원인 미확인.
  - 전체 vitest: 44,942 통과 · 1건 실패 `law-article-modal-retry` RETRY-1 — 변경과 무관한 파일이고 단독 실행 통과(간헐 여부 미확정 · CI에서 재확인).
  - tsc 0 · ESLint 오류 0 · 경고 376(이번 변경 파일 경고 0 · 증가분 출처는 master 측 — 확인 필요).
- 실측(mock): 주택 토지 1984.6. 실가 1억 · 건물 1990 실가 4억 → ② 101,411,574 · 파트 합 501,411,574 · 세액 = 토지 실가 ② 직접 입력과 같음 · 건물 1984.6. 4억 → 405,646,299 · 토지 환산 + 함께 견줄 실가 3억 → ② 304,234,724.
- 2차 범위 남은 것: 없음. PR-4 범위 밖 안내(겸용·다필지·이월과세·부담부증여 증여자 매수·증축) · V-6 명세서·별지 주석은 미착수.

## 13. PR-4 범위 밖 자산 안내 결과 (Q-12 a · Q-9 · Q-10)

- ⑤ 안내 1개 `PreDeemedPurchaseOutOfScopeNotice`(`pre-deemed-purchase-out-of-scope` · `data-kind`) · 술어 `preDeemedPurchaseOutOfScopeKind`. 다필지·이월과세에는 매매 블록이 없어 취득 섹션 공통 자리(`AssetSectionAcquisition`)에 한 번 둔다. 칸·⑧·④·엔진은 그대로라 세액이 바뀌지 않는다(아래 소유자 분리 정정도 세액 불변).
- 안내 대상: 겸용주택 · 다필지(1985 전 필지 — 환지 익일 필지 제외) · 이월과세 증여자 매수(증여자 취득일 < 1985-01-01 · 받는 칸이 있는 서브폼만) · 부담부증여 증여자 매수 · 일반건물 증축 · 파트 원인 혼합·소유자 분리 · 그 밖의 범위 밖 매수(분양권·상가 분리 등).
- 안내하지 않음: 입력 카드·기존 안내가 뜨는 자산 · 겸용 부담부증여(⑧ MB-16이 막는다 · Q-10) · 상속·증여·신축 파트의 칸.
- 문구는 조건형이다(「1985.1.1. 전에 매수했다면」) — 칸이 1985-01-01이면 덮어쓰기 결과인지 실제 그날인지 구분할 수 없다.
- 정정(결함): 소유자 분리(분리 OFF)는 PR-2부터 입력 카드가 떠서 ⑧이 실제 취득일을 요구했는데 엔진은 「토지·건물 취득일 분리」로 비교하지 않았다(building_only 1984.6./1985.1.1. 세액 94,061,000 같음 · 경고만). 카드를 닫고 안내로 바꿨다.
- V-2 실측(화면 흐름 · ⑧ 통과 · mock 세율): 다필지 1980.1./1984.6./1985.1.1./1985.6. 세액이 같다 — 실가 250,371,000 · 환산 250,273,980 · 2필지 218,031,000 · 양도 2010년 248,160,000. 장특 30% 상한 때문이다. 보유연수는 필지 날짜 원값(46·41·41·40년). 자산 취득일 칸은 ⑧ 필수지만 값은 쓰이지 않는다(④가 필지 최선일로 보낸다).
- 다건 계산기: 변경 없음(`MULTI_REJECT_RULES`는 `isPreDeemedPurchaseAsset`만 막는다).

## 14. V-6 신고서·명세서 표시 · V-4·Q-9 재조사 결과 (사용자 2026-11-01)

- 별지 서식(별지 제84호·부표1·2·2의2·3·제84호의4)에 의제취득일 자산의 기재 지시가 없고, 칸 기재를 다룬 해석례도 0건이다(변환 본문 통독 · 국세청 안내 책자·홈택스 화면은 미확인). 결정: **취득일 칸 1985.1.1. 유지 + 실제 취득일 주석**. 취득가액 칸은 채택값 + ①·② 주석(`pre-deemed-purchase-filing-note.ts`). 주석은 엔진 echo가 있을 때만이다 — 환산에 실가를 비워 비교가 없으면 주석도 없다.
- 이월과세 칸은 증여자 원래 날짜를 그대로 둔다 — 비교를 하지 않고 보유기간 기산(법 §95④ 단서 × 의제) 판단도 없어 값을 바꾸지 않는다.
- 값 결함 정정: 함께 양도 자산이 ② 채택이어도 표시 echo가 치환 전 입력값을 읽어 별지·명세서·사이드바에 1억 + 필요경비 1,411,574가 나왔다(세액은 맞음). `transfer-tax-aggregate-display-echo.ts`.
- 인접 결함 정정(사용자 「V-6 PR에 포함」): 지분 단건 명세서 양도가액이 100% 값 · 함께 양도 명세서 둘째 자산 취득일이 주 자산 날짜.
- **V-4**: 정면 자료 0건(DRF·국세법령정보 재조사 · 쿼리당 상위 100건 한계). ④의 발동 요건은 「제3항제1호부터 제3호까지」이고 §166③은 그 어느 호도 아니라, ① = §166③은 법령이 정한 값이 아니라 설계 선택(Q-4 a)이다. 확인 필요로 유지.
- **Q-9 결정: 안내 유지 + 환산 문구**. 조문은 법 §97의2①1호 → §97①1호 나목 → 영 §163⑫ → §176조의2④로 이어진다. 조심2009부1802(기각)는 증여자 실가 미확인 시 의제일 환산을 처분 전제로 썼고(쟁점 아님), 부동산거래관리과-265(2012.5.9.)는 1980 취득·2009 증여 사안에서 서면4팀-193(의제일 현재 가액)을 참고로 들었다(쟁점은 필요경비). 증여자 실가가 확인될 때의 ② 비교는 정면 자료 0건 — 구현하지 않는다. 실측(mock · 토지 양도 5억): 1984.6. 실가 1억 −375,479 · 1980.1. −15,021,469 · 비교과세 뒤집힘 있음.

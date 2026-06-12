# 주식 양도소득세 잔존 후속 작업 — 로드맵 계획서

> 작성 2026-06-12 · 기준 commit `7498ce41` (PR #150 머지 후 origin/master)
> 모든 현행 인용은 grep/Read 실측 (추정 0). 각 PR은 착수 시 개별 계획서 + 13단계 자가 검토 + Pre-Do anchor를 별도로 수행한다 — 본 문서는 **시리즈 스코프·우선순위·의존 확정**용.
> 검토 이력: 13단계 자가 검토 1·2회차 완료(정정 12건 — B-1 철회·B-5 신설 포함, 2026-06-12). STEP 5~9·12~13(디자인 문서)은 로드맵 산출물이 아니므로 **각 PR 착수 시점의 개별 13단계 사이클에 귀속**(이연 — 생략 아님, §3 규율 1).

## 0. 종결 확인 (재작업 금지)

| 항목 | 종결 PR |
|---|---|
| 리뷰 R1 전 항목 (calcSplitModeTax SME 세액 2배 · items .max() · 7필드 strip · isOnMarketTransaction · "원" 표기 등) | #140 · #146 |
| 소칙 §81④ 월할 가산 | #146 |
| 거래정지·관리종목 §165③ 활성화 (양도일) | #150 |
| **PR-α D-1** stock-transfer-tax.ts 798→584줄 선제 분할 (`stock-transfer-aggregate.ts` 추출·re-export 보존) | 본 시리즈 |
| **PR-β A-1** 취득 다건+양도 단건 개별법(specific) 활성화 (엔진 0줄·UI/api/validate/Zod 차단 해제) | 본 시리즈 |
| **해외주식 §94①3 다목 + §118의2~8** (`foreign-stock.ts`) · **국외전출세 §118의9~16** (`exit-tax.ts`) | PR-4A+FS-09 · PR-4B — UI 선택지(`MarketTypeBlock.tsx:48·53`)·별도 Zod(`foreignStockInputSchema`·`exitTaxInputSchema`)·route 분기(`route.ts:277·372`) 완비 (실측). ※ `MarketTypeBlock.tsx:6-10` 헤더 주석 "본 계산기 미지원"은 PR-3-c(2026-05-19) 시점 **stale** — B-1③에서 정정 |
| 엔진 주석의 `PR-2` (매매사례·자본조정 등) | **이미 완료된 과거 PR-2 지칭** — 미결 아님 |

## 1. 잔존 인벤토리 (실측 근거 포함)

### Track A — 입력 모드 조합 갭 (사용자 가시 — UI에 disabled로 노출 중)

| # | 항목 | 현행 (실측) | 스코프 요약 | 규모 |
|---|---|---|---|---|
| A-1 | **취득 다건 + 양도 단건 모드 개별법(specific)** | `AcquisitionLotsMatrix.tsx:92` 라디오 disabled · `validate-step2.ts:155-161` 차단 · Zod Refine 3(`stock-transfer-tax-schema.ts:387-393`) 차단 · `api.ts:400` "본 모드 미지원" 주석. **엔진은 기지원** — `lot-allocation.ts:178-186 matchSpecific` + 분할 모드 api 배선(`api.ts:586-592`) 완비 | 합성 단건 양도 lot(`__synth_single_transfer__`)에 대한 매수 lot별 주식수 배정 UI(매칭 매트릭스) + api 매핑 + validate·Zod Refine 3 차단 해제(3중 패턴 동시). 엔진 0줄 예상 | 중 (UI 위주) |
| A-2 | **분할 매수 모드 + 자본조정 조합** ✅**완료(PR-γ)** | `applyCapitalAdjustmentsToLots`(신규)·발생일>취득일 lot만 희석·총원가 불변·정밀도 A(floor)·수량검증 엔진위임·결과 lot 희석표. 9 anchor+E2E | 대 (엔진 확장) |

### Track B — 법령 기능 갭 (니치 — B-1③ 제외 각자 KoreanLaw 선행 검증 필수)

| # | 항목 | 현행 (실측) | 스코프 요약 | 규모 |
|---|---|---|---|---|
| B-1 | **해외주식·국외전출세 잔여 하위 갭** (본체는 기구현 — §0 참조) | ① 해외상장 내국법인 DR: `foreign-stock.types.ts:63` `isListedForeignCorp` false 경로 "후속 PR" 명시 ② exit-tax 스코프 외 3건: `exit-tax.ts:19-22` — §94①4다·라 기타자산 / §118의16④ 납부유예 이자상당액 / 납부유예 중 재입국 처리 ③ `MarketTypeBlock.tsx:6-10` stale 헤더 주석(코드-주석 드리프트) | ①②는 각자 KoreanLaw 선판정 후 개별 PR. ③은 차기 아무 PR에 부수 정정(주석 1블록) | ①② 중 / ③ 극소 |
| B-2 | **§97② 단서 swap (주식)** ✅**완료(PR-ε)** | **판정: 적용**(소령 §163⑫→§176의2②1호 주식 환산 명시 축자). STEP 4 swap 비교(가목 환산+개산 vs 나목 자본지출+양도비)·STEP 5 차익 분기·api ④ silent strip 해제·결과 카드. anchor 8+E2E 1. 부수: B-1③ 주석·types 800분리 | 완료 |
| B-3 | **진정 이동평균법** ✅**완료(PR-ζ)** | `matchMovingAvg` 신규 — 단가는 매도 시점별 이동평균(잔고 가중평균)·보유기간(§104②)은 FIFO lot startDate 하이브리드. echo=마지막 매도 적용 단가(단일 매도=총평균, LO-2 불변). 법인세령 §74①1마 표준 참조. 라벨 3곳·"원"·미리보기 dual-truth 정정. anchor 6+E2E 1 | 완료 |
| B-4 | **§165⑨ 본체** (기준시가 방식에서 양도·취득 기준시가 동일 케이스) | grep 결과 구현·참조 0건 (§165⑨은 §81④ 위임 근거로만 인용됨) | KoreanLaw로 적용 요건 축자 확인 후 보정 평가 분기 추가 | 중 |
| B-5 | **§165⑤ 종가평균 증자·합병 환산 보정** | `types/stock-transfer.types.ts:293` `closing.hasIncrease` — "default false, 환산주식수 후속 PR 신호". 신호 필드만 존재, 보정 산식 미구현 | 상장일 이후 1개월 종가평균 산정 시 증자·합병 발생 분 환산주식수 보정 — 준용 산식 KoreanLaw 선판정 필수 | 중 |

### Track C — 거래정지 §165③ 파생 (PR #150 memory 기록분)

| # | 항목 | 현행 (실측) | 스코프 요약 | 규모 |
|---|---|---|---|---|
| C-1 | **취득일 거래정지** ✅**완료(PR-δ)** | `tradingHaltAtAcquisition` + `calcAcquisitionStdPerShareSupplementary` — 혼합 환산(분자=§165④ 보충평가·분모=종가평균). §165⑤ 비적용 판정(예규 4회 미발견). exempt mirror·14지점·anchor 11+E2E 2 | 완료 |
| C-2 | **거래정지 + full(V2)·사례 49 확장** | `EstimatedUnlistedBlock simpleOnly` 고정 — api full/사례49 게이트가 `marketType === "unlisted"` 한정이라 silent 미반영 차단 목적 (engine.design §4 D1-1·2) | api 게이트를 상장+거래정지 조합으로 확장 + simpleOnly 해제 | 중 |
| C-3 | **거래정지 + §165⑤(취득 후 상장) 교차** | validate G-5가 모드 무관 차단 (PL-VALIDATE-7 반전 anchor) | 엔진 분기 우선순위(`stock-transfer-tax.ts:247` post-listing 선행) 재설계 — 법령상 조합 가능성 KoreanLaw 선판정 | 중~대 |

### Track D — 기술 부채

| # | 항목 | 현행 (실측) | 스코프 요약 | 규모 |
|---|---|---|---|---|
| D-1 | **`stock-transfer-tax.ts` 800줄 임박** | **798줄** (정책 위반 아님 — 다음 엔진 추가 시 강제 분할) | 선제 분할: finalize/branch 추출 (transfer-tax 4-파일 분할 전례 — `project_file_split_2026_05_06/08` 패턴). **외부 export 100% re-export** 보존 | 소~중 |
| D-2 | **환원율 미입력 fallback의 고시 이력 검증** | 환원율은 **사용자 입력 가능**(`unlisted-flat-adapter.ts:65` `parseFloat(rateStr) || 10`) — 미입력 시만 `stock-valuation-post-listing.ts:99` default 0.10 (시행규칙 §81② → 상증령 §17 위임) | 기재부 고시 환원율의 연도별 변동 이력을 확인해 default 10%가 전 평가기준일에 타당한지 검증 — 변동 이력 발견 시에만 연도 테이블화 (10%는 역사적으로 안정 — 영향 최하) | 소 |

## 2. 우선순위·의존 순서 (권고)

```
PR-α  D-1 800줄 선제 분할 ──────────┐ ✅완료(본 시리즈) — 798→584줄, aggregate 추출
PR-β  A-1 단건 개별법 (엔진 0줄)    │ ✅완료(본 시리즈) — UI/api/validate/Zod 차단 해제
PR-γ  A-2 분할+자본조정 ←──────────┘ ✅완료(본 시리즈) — applyCapitalAdjustmentsToLots
PR-δ  C-1 취득일 거래정지           ✅완료 — 혼합 환산 + acquisitionSideOnly UI
PR-ε  B-2 §97② swap 판정      ✅완료 — 적용 판정·STEP4 swap 비교·api strip 해제
이후  B-3 ✅완료 → C-2 → B-5 → B-4 → C-3 → B-1①② → D-2 (수요·빈도 낮은 순)
```

- **A-1을 최우선 기능 PR로 권고**: 사용자에게 disabled 라디오로 상시 노출 중 + 엔진 기지원이라 UI·배선만으로 완결(저위험).
- **B-1③(stale 주석 정정)** ✅**완료** — PR-ε(B-2)에 부수로 `MarketTypeBlock.tsx:3-11` 헤더 주석을 현황(foreign-stock·exit-tax 기구현)으로 정정.
- B-1①②(DR·exit-tax 잔여)는 니치 수요 — KoreanLaw 선판정 비용 대비 후순.
- C-3은 C-1·C-2 완료 후에만 의미(교차 조합의 양 끝이 먼저 존재해야 함).

## 3. PR 공통 규율 (전 트랙 강제)

1. 착수 시 개별 계획서(`docs/00-pm/`) → **13단계 자가 검토**(`plan-design-self-review-loop`) → 엔진·UI 디자인 문서 생성.
2. **Pre-Do anchor**: 현행 동작 실측 고정 anchor 선행 (A-TH-1·2 패턴 — 통과 확인이 Do 진입 조건).
3. 신규 입력 필드 발생 시(특히 C-1) **14지점 전수** + ⑫⑬⑭ grep 자가 점검.
4. Track B(B-1③ 주석 정정 제외)는 **KoreanLaw 축자 검증을 계획서 P0**로 — 추정 인용 금지 (`feedback_korean_law_citation_verify`).
5. 분할 모드 엔진 변경(A-2 · B-3)은 기존 분할 anchor(`lot-allocation` 계열) 전수 재확인 — 총평균↔이동평균 수치 변동은 **법령 정합값으로 재산정**(잘못된 anchor 유지 금지).
6. E2E는 worktree 포트 격리(`E2E_PORT=3200`) + ToggleCard 제목 텍스트 클릭 패턴.

## 4. 비스코프 (본 시리즈에서 다루지 않음)

- 증권거래세 추가 확장 (Phase 1+2로 종결 — `project_stock_transfer_securities_tax`)
- 해외주식·국외전출세 **본체** 신규 구현 (기구현 — §0 참조. 본 시리즈는 B-1 잔여 하위 갭만 다룸)
- 키움 자동조회 인프라 변경 (`lib/kiwoom/` 안정)

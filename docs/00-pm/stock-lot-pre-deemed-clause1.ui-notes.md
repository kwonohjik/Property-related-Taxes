# 분할·다건 lot 의제취득일 전 매수 — ① 비교 입력 UI 계획 노트 (Plan 단계 · UI 시니어)

> 상태: **Plan 전용 — 코드 수정 없음.** 엔진 시니어의 계획서와 병렬 작성. 아래 인용은 2026-10-06 워크트리(`plan/lot-pre-deemed-clause1`, HEAD `c3eaf1cba` = PR #2006 머지 직후) 기준 실측이다.
> 미검증 항목은 「확인 필요」로 표시했다.

## 0. 문제 정의 (실측)

- PR #2006의 `applyPreDeemedToLots`(`lib/tax-engine/stock-transfer/stock-pre-deemed-acquisition.ts:303-331`)는 lot마다 ②(실가 + 생산자물가상승분)만 적용한다. ①(의제취득일 현재 매매사례가액·환산취득가액)과의 「많은 것」 비교는 **lot 입력에 수단이 없어** 빠져 있다(같은 파일 :292-302 주석, 계획서 `stock-pre-deemed-acquisition-176-2-4.plan.md:222`·`stock-split-lots-ui-bugfix.plan.md:288`).
- 단건 모드에서 ①을 받는 경로는 **취득가액 모드 라디오(환산·매매사례)** 이다(`Step2.tsx:310-330`). 분할 모드는 `disabled: isSplitMode`(:324-325), lots-only 모드는 `acquisitionMode === "actual"`일 때만 lot 매트릭스가 보인다(:426-452). 즉 **lot 모드에서는 ①을 고를 라디오 자체가 없다.**
- 단건 `PreDeemedAcquisitionCard`는 `isPreDeemedPurchaseForm`이 분할·lots-only를 제외해(`lib/calc/stock-transfer-section94-4-form.ts:121-123`) lot 모드에서 항상 `null`이다(`PreDeemedAcquisitionCard.tsx:37`).

### 0.1 ①이 요구하는 입력 (단건 모드가 받는 것의 실측)

| ① 방식 | 단건 입력 | 근거(file:line) | 필드 |
|---|---|---|---|
| 환산취득가액 · 상장 | 분자 = 취득 당시 기준시가(의제취득일 이전 1개월 종가평균), 분모 = 양도 당시 기준시가(양도일 이전 1개월 종가평균). 분자 기준일 = `resolveStockDeemedDateString(acquisitionDate,is94_4).effectiveDate` | `Step2.tsx:94`, `:521-584`(분자), `TransferStdPriceSection.tsx:73-109`(분모) | `acquisitionDatePriceAvg1Month` · `transferDatePriceAvg1Month` |
| 환산취득가액 · 비상장·기타자산 | 분자·분모 모두 §165④ 보충적 평가(`EstimatedUnlistedBlock`) | `Step2.tsx:621-623` | NI/NA 다수 필드 |
| 매매사례가액 · 비상장·기타자산(상장 불가) | 1주당 사례가액·사례일 + **개산공제 기준시가**(취득측 보충평가 `EstimatedUnlistedBlock acquisitionSideOnly`) | `MarketSampleBlock.tsx:34-48`, `Step2.tsx:626-644`, 필수: `validate-step2.ts:495-518` | `acquisitionMarketSamplePrice/Date` + 취득측 NI/NA |
| ② 기준 실가 | 환산·매매사례 모드에서는 별도 칸(`preDeemedActualPricePerShare`) | `PreDeemedAcquisitionCard.tsx:62-85` | — |

**핵심 관찰 3가지** (lot 모드 설계의 제약이 된다)

1. **의제취득일은 모든 의제 lot에 동일**(주식 1986.1.1. · 기타자산 1985.1.1. — `stock-pre-deemed-acquisition.ts:78-81`)하다. 따라서 **의제취득일 현재 1주당 기준시가(분자) · 매매사례가액은 폼-전역 1개 값**이면 된다 — lot마다 받지 않는다.
2. **환산 ①의 분모(양도 당시 기준시가)는 «매도 lot»마다 다르다**(양도일이 다르면 1개월 종가평균·보충평가 사업연도가 다르다). 따라서 ① 환산은 «매수 lot × 매도 lot» 쌍(= `LotMatchingDetail.matched[]` 한 행, `stock-transfer.types.ts:834-859`)마다 값이 달라지고 ②와의 max도 쌍 단위다. 매매사례 ①은 매도 lot과 무관(lot별 ②와만 비교).
3. **매매사례 ①도 개산공제 기준(의제취득일 현재 1주당 기준시가)이 필요**하다(단건 필수 규칙 `validate-step2.ts:513-517` — 안 받으면 필요경비 0). 그래서 ① 방식을 고르면 «의제취득일 현재 1주당 기준시가»는 두 방식 공통 필수 입력이다.

## 1. 입력 위치 (질문 1·활성 조건)

### 1.1 결론: **Step2 「② 취득가액」 섹션**에 신규 카드 1장 — `PreDeemedLotsClause1Card` (신규 파일)

- 근거 1(UI 순서 = 계산 순서): Step1은 lot 입력(일자·원인·수량·단가), Step2가 취득가액 산정이다. ①은 «평가» 입력이라 Step2가 정위치다. 단건 ①도 Step2에 있다.
- 근거 2(재사용): 키움 자동조회·일자별 표·`MarketSampleBlock` 등 ① 위젯이 전부 Step2 컴포넌트이고 폼-전역 필드를 쓴다.
- 근거 3: Step1 매도 카드에 기준시가 칸을 넣으면 평가 입력이 Step1로 흩어지고 `SplitLotsBlock.tsx`(361줄)가 커진다. 반대로 **매도 lot별 분모 칸은 Step2 카드 안에 «매도 #n 행»으로 둔다**(값은 `transferLots[i]`에 저장 — lot 삭제 cascade가 공짜).
- 배치 슬롯: 분할 = `Step2.tsx:354`(현 `PreDeemedAcquisitionCard` 슬롯, `SplitAllocationPreviewCard` 위 — 입력 → 미리보기 순서). lots-only = `AcquisitionLotsMatrix` **아래**(:438-450 직후). 위에 두면 취득일을 타이핑하는 중 카드가 나타나 입력 위치가 밀린다.
- `Step2.tsx`는 697줄 → 직접 JSX 추가 금지, 카드는 새 파일에 두고 `Step2`는 2줄 호출만(800줄 정책, `CLAUDE.md` File Size Policy).

### 1.2 노출 조건 (단일 leaf — 엔진·⑤⑥⑧⑫ 공용)

`isPreDeemedPurchaseLot`(`stock-pre-deemed-acquisition.ts:272`)은 **모듈 비공개**다. ⑤가 같은 판정을 쓰려면 엔진 쪽에서 export(예: `preDeemedLotIndexes(lots, marketType, is94_4)`)해야 한다 → **엔진 시니어 요청 E1**. 폼 래퍼는 `isPreDeemedPurchaseForm`(`stock-transfer-section94-4-form.ts:114`) 옆에 둔다(원인은 `toEngineAcquisitionCause`로 매핑 — `validate-step1.ts:263`과 같은 방식).

노출 = `(lotsMode==="split" || (acquisitionMode==="actual" && acquisitionActualInputMode==="lots"))` ∧ 시장 ∈ {코스피·코스닥·코넥스·비상장·기타자산}(`PRE_DEEMED_MARKETS` :38) ∧ 의제 lot ≥ 1건. 아니면 `null`(단건은 기존 카드).

### 1.3 카드 내부 구성 (ToneCard amber · 위→아래 = 계산 순서)

1. 안내문: 의제취득일 · 대상 lot 목록(읽기 전용 «매수 #1 1980-06» 칩) · «② 는 자동 계산, ① 은 입력하면 견줍니다».
2. `RadioCardGroup name="preDeemedLotClause1Mode"` tone amber · layout stack · columns 3 — **네이티브 radio 금지**:
   - `none` 「견주지 않음 (② 만)」 — description 「① 미산정 — ② 취득 당시 실가 + 생산자물가상승분을 취득가액으로」
   - `estimated` 「환산취득가액」
   - `sale_case` 「매매사례가액」 — 상장은 `disabled`(영 §176의2③1호 괄호 — `isMarketSampleAllowedMarket`, `stock-valuation-market-sample.ts:37-41`)
   - 기본값 `none` — 계획서 Q-6 결정(① 미입력 허용·«미산정» 고지) 유지. **확정 전 `none`을 «빈 값»으로 두지 않는다**(3중 패턴: factory default = normalize = UI 직접 사용).
3. ① ≠ none: ToneCard emerald §1 「의제취득일 현재 1주당 기준시가」
   - 상장: 단건과 같은 위젯 — `KiwoomAutoFetchButton axis="acquisition"`(기준일 = 의제취득일, `Step2.tsx:556-563`) + 직접 입력 `CurrencyInput`(`acquisitionDatePriceAvg1Month`). hint: 「의제취득일 이전 1개월 종가평균(1주당) — 소득세법 §99①3 · 영 §165③」. 일자별 표(`Pre1MonthClosingPriceTable`)는 1단계 범위 밖(Q-3).
   - 비상장·기타자산: 같은 필드에 **1주당 평가액 직접 입력**(영 §165④ 보충적 평가 결과). 블록 재사용은 Q-1.
4. `estimated`: ToneCard emerald §2 「양도 당시 1주당 기준시가 (매도 건별)」
   - 분할: 매도 lot마다 한 행 — «매도 #n · 양도일 ○○» 읽기 전용 + `CurrencyInput` + 키움 버튼(`axis="transfer"`, `transferDate = lot.transferDate`). 키움 `onFill`은 폼-전역 patch를 돌려주므로(`KiwoomAutoFetchButton.tsx:~120`) **어댑터가 평균값만 lot 필드로 옮긴다**(그 외 키 무시).
   - lots-only: 매도 lot이 합성 1건이라 폼-전역 `transferDatePriceAvg1Month`를 쓴다. `TransferStdPriceSection` 재사용은 `acquisitionStdMode==="halt_transfer"` 잔존값이 있으면 다른 화면이 되므로(`TransferStdPriceSection.tsx:46`) **재사용하지 않고** 같은 행 컴포넌트를 폼-전역 바인딩으로 쓴다(코드 경로 1개).
5. `sale_case`: `MarketSampleBlock` 재사용(`acquisitionMarketSamplePrice/Date`). ⚠️ 이 블록의 hint는 «취득일 전후 3개월 이내»로 고정이라(:35-48) 의제 기준(엔진은 `resolveStockDeemedDate`로 의제취득일 기준 — `stock-transfer-pr2-detail.ts:51-58`)과 어긋난다 — **단건에도 이미 있는 문구 결함**(확인 필요: 단건 의제 매수 + 매매사례에서 실제로 같은 문구가 뜨는지 Playwright). lot 카드에서는 `baseDateLabel` prop을 추가해 「의제취득일 전후 3개월」로 바꾼다.
6. 하단 고지: 「① 채택 시 해당 매수 건의 필요경비는 개산공제(의제취득일 현재 기준시가 × 1%), ② 채택 시 실제 지출액」 — **엔진 의미 확정 후**(Q-6) 문구 확정.

## 2. 위젯·규칙 준수 (질문 3)

- 입력: `CurrencyInput`·`DateInput`·`RadioCardGroup`·`FieldCard`·`ToneCard`만. native checkbox/radio/date 신규 금지. placeholder에 숫자 예시 금지 — 형식은 `hint`로(`components/calc/CLAUDE.md:325-330`). 라벨은 정본 라벨 클래스(임의 `text-[Npx]` 금지 — pre-push 게이트 `:335`).
- tone: amber(취득·평가) 카드 안에 emerald(양도시점) 섹션. 법조문은 `LawArticleModal`(영 §176의2 · 규칙 §85의2) — 단건 카드와 같은 표기.
- 결과·안내 숫자 끝에 「원」 금지(헤더에 단위 1회). 납세자 유불리 표현 금지(「①을 입력하면 비교합니다」 수준의 중립 문구).
- Step2 상단 분할 배너(`Step2.tsx:165-173`)의 「취득가 산정방법은 실가만 지원」은 **그대로 사실**이지만(`validate-step2.ts:117-123`), «의제취득일 전 매수는 ①을 아래 카드에서 견줄 수 있다» 한 줄을 덧붙여야 사용자가 라디오가 막힌 이유와 ① 입력 경로를 함께 안다.
- `SplitAllocationPreviewCard`(`:70-84` 표)에 «산정» 열(「② 물가상승」·「① 환산」·「① 매매사례」·「—」) 1열 추가 — 미리보기 합계가 왜 입력 단가와 다른지 설명.
- **useEffect→store 미러링 금지**: 매도 lot 양도일 변경 시 그 lot의 `transferStdPricePerShare`를 지우는 동작은 `SplitLotsBlock.updateTransferLot`(:123-132)의 patch에 동승(`Step1.tsx:262-296`의 폼-전역 리셋과 같은 패턴). 매수 lot이 의제 대상에서 빠지면(취득일 수정) ① 모드는 **지우지 않고** 카드만 사라지며, ④가 «해당할 때만» 전송한다(`stock-transfer-tax-api-pre-deemed.ts:14`의 stale 방지 규약).
- 자동 안분 fallback 금지: S 미입력 → ⑧⑫ 오류로 차단(자동 0·평균 대체 없음).

## 3. 결과 화면 ⑦ (질문 2)

- 단건 `PreDeemedAcquisitionResultCard`(`components/calc/results/PreDeemedAcquisitionResultCard.tsx:19-95`)는 **단일 `actualBase`·단일 ratio** 구조라 lot별 재사용 불가 — lot마다 카드를 N장 렌더하면 중복 문구가 된다.
- 결과 타입 `preDeemedAcquisitionDetail`(`stock-transfer.types.ts:1072-1094`)도 단일 객체다. lot 모드는 **엔진 echo 신설 필요** → 엔진 시니어 요청 E4: `preDeemedLotsDetail`(매수 lot 인덱스·취득월·② 1주당·지수비·① 방식·① 1주당(쌍별이면 매도 lot 인덱스 포함)·채택·필요경비 방식). 결과에 echo가 없으면 UI가 `LotMatchingDetail`에서 역산하게 되어 «집계·표시가 엔진 산식 재작성»(메모리 `feedback_aggregate_display_rederives_engine_value`) 함정이다.
- 신규 `PreDeemedLotsResultCard`(ToneCard amber, 표 1개): 열 = 매수 #·취득월 · ② 1주당(지수비 산식 `Frac` 표기) · ① 1주당(미산정이면 「미입력」) · 채택 · 필요경비 방식. 환산 ①은 매도 lot 쌍별이므로 행 키 = (매수 lot, 매도 lot). 푸터 문구(`PreDeemedAcquisitionResultCard.tsx:84-92`)는 상수로 추출해 단건·lot이 공유(문구 드리프트 방지).
- 슬롯: `StockTransferTaxResultView.tsx:583-585`(단건 카드 바로 아래, `LotMatchingDetailCard` 위 :588). 파일 654줄이라 +4줄은 안전.
- `LotMatchingDetailCard`(10열, `:64-76`)는 이미 넓다 — 열 추가 대신 위 신규 카드로 분리.
- 경고(`Warnings`): `applyPreDeemedToLots`의 lot별 경고(:316-327)는 «① … 산정하지 않습니다» 문구가 고정이다 — ①을 받게 되면 **문구를 조건부로**(① 없음/있음) 바꿔야 한다(엔진 시니어 소유, 영향 anchor: `stock-pre-deemed-lots.anchor.test.ts` PL-1~6 · E2E SPL-4 `:244`의 정규식은 접두사 `매수 lot #1(1980-06 취득`만 보므로 영향 없음 — 실측).
- 신고서 11행 라벨(`StockFilingFormAssetCostRows.ts:204-209`): lot 모드는 `selected`가 단일값이 아니라 현재 「(②)」로 떨어진다(`preDeemedAcquisitionDetail` undefined). ①·② 혼합 시 12-1·12-2(환산 분자·분모) 행은 **단일 분자·분모로 표현 불가**(분모가 매도 lot별) → 권장: lot 모드는 `usedEstimatedAcquisition=false` 유지 + 11행 라벨만 「취득가액 (영 §176의2④ 많은 것 — 매수 건별 ①·② 채택은 결과 카드 참조)」. 단건도 «비교 행 없음» 결정(계획서 §10.5)과 동일. → Q-5.

## 4. 사이드바·미리보기 (⑥)

- 분할: `StockSidebar.tsx:268`이 `previewSplitAllocation`(`lib/calc/stock-split-preview.ts:41-72`)을 쓴다. 그 함수는 **엔진 split 분기와 같은 함수·같은 순서**를 부르는 것이 설계 원칙이다(:4-9). ①은 매칭 **후** 쌍 단위(환산)라 순서가 달라진다 → 엔진이 «매칭 후 ① 보정» leaf를 export해야 미리보기가 같은 함수를 부른다(E3). 미리보기에서 손으로 재구현 금지(메모리 `single-source-engine-helper`).
- ① 선택했는데 S 입력이 비면 `previewSplitAllocation`은 `null`(= 사이드바 취득가액 행 없음 · Step2 카드 「입력하면 산출됩니다」) — 이 함수의 기존 규약(:12 「덜 채워졌으면 null」)과 같다. 0원·부분 합계를 보여주지 않는다.
- **기존 갭 발견(이번 범위 밖 · 별도 확인 필요)**: lots-only 모드 사이드바(`StockSidebar.tsx:270-286`)는 `previewSplitAllocation`이 아니라 «가중평균 단가 × 양도수량» 근사를 쓴다(`isSplitLotsMode`가 `lotsMode==="split"`만 참 — `stock-transfer-input-mode.ts:21-23`). 따라서 lots-only에서 의제 lot이 있으면 **② 적용 후 결과(엔진)와 사이드바 근사가 갈린다**(PR #2006이 만든 새 어긋남일 가능성 — 확인 필요: lots-only + 1980 lot Playwright로 사이드바 vs 결과 대조). 권장: 의제 lot 존재 시 이 근사 행을 숨기고 결과 도착 후 표시(「입력값으로 계산 가능한 항목만」 원칙).
- 결과 도착 후는 `result.acquisitionPrice`(엔진값)를 그대로 쓰므로 추가 작업 없음(`StockSidebar.tsx:235`).

## 5. 14 동기화 지점 영향 (질문 4)

신규 필드 제안: **폼-전역** `preDeemedLotClause1Mode: "none"|"estimated"|"sale_case"`(기본 none) · **lot 단위(선택 필드)** `TransferLotForm.transferStdPricePerShare?: string`(기존 `AcquisitionLotForm`의 선택 필드 패턴 — 생성처 2곳(`SplitLotsBlock.tsx:115`·`Step1.tsx:120-127`)을 건드리지 않으려 optional). **재사용** `acquisitionDatePriceAvg1Month`(분자/개산공제 기준) · `transferDatePriceAvg1Month`(lots-only 분모) · `acquisitionMarketSamplePrice/Date`. (엔진 body 키 이름은 엔진 시니어 소유 — 여기서는 매핑 경로만 명세.)

> 재사용 필드가 «두 조문 축 겸용»이 되지 않도록 주의(메모리 `feedback_one_field_serving_two_legal_axes`): lot 모드에서는 `acquisitionMode`가 `actual` 고정이라 환산 필드의 다른 용도는 없다(단건 환산은 lot 모드와 배타). 단 sessionStorage에 단건 환산 잔존값이 있으면 카드에 **보이는 값으로** 노출되고(비묵시), ④는 ① ≠ none일 때만 싣는다.

| # | 지점 | 위치(실측) | 변경 |
|---|---|---|---|
| ① | 타입 | `lib/stores/calc-wizard-stock-form-types.ts:197-199`(preDeemed 2필드 옆) · `lib/stores/calc-wizard-stock-types.ts:120-125`(`TransferLotForm`) | `preDeemedLotClause1Mode` · `transferStdPricePerShare?` |
| ② | initial | `lib/stores/calc-wizard-stock-form.ts:120-121` | 기본 `"none"` (lot 필드는 optional — factory 무변경) |
| ③ | normalize | `lib/stores/calc-wizard-stock-normalize.ts:259-260`(strField 패턴) · `:671-687`(`normalizeTransferLots`가 필드를 **명시 나열**해 새 필드는 침묵 소거 — 반드시 추가) | enum 검증(미지값 → `"none"`) · lot 필드 보존. 이력 복원 시 의제 lot이 없으면 값은 보존하되 ④가 안 싣는다(stale 가드, 메모리 `feedback_new_asset_field_stale_sessionstorage_guard`) |
| ④ | API 변환 | `lib/calc/stock-transfer-tax-api-pre-deemed.ts`(확장 — `stock-transfer-tax-api.ts`가 752줄이라 본체에 추가 금지) · 호출처 `stock-transfer-tax-api.ts:264`(lots-only)·`:602-608`(분할) | 해당할 때(① ≠ none ∧ 의제 lot ≥ 1)만 전송 |
| ⑤ | UI | 신규 `components/calc/stock-transfer/PreDeemedLotsClause1Card.tsx` · `Step2.tsx:354`·`:438-450` 직후·`:165-173` 배너 · `SplitAllocationPreviewCard.tsx:70-84` 열 | §1.3 |
| ⑥ | 사이드바·미리보기 | `lib/calc/stock-split-preview.ts:41-72` · `StockSidebar.tsx:268`(+ lots-only :270-285) | §4 |
| ⑦ | 결과 | 신규 `PreDeemedLotsResultCard` · `StockTransferTaxResultView.tsx:583-585` · `StockFilingFormAssetCostRows.ts:204-209` | §3 |
| ⑧ | validate | `validate-step2.ts:116-132`(**분할은 `return errors`로 조기 종료** — 그 앞에 삽입해야 한다. 막다른 «검증 누락») · `:187-195`(lots-only) · 필요 시 신규 `lib/calc/stock-transfer-tax-validate-pre-deemed-lots.ts`(`validate-step2.ts` 608줄) | ① ≠ none: S_d>0 필수 · estimated: 의제 lot과 매칭되는 매도 lot의 S_t>0 필수(미매칭 매도 lot은 불요) · sale_case: 비상장·기타자산만 + 사례가>0 · 상장+sale_case 차단 |
| ⑨ | Zod enum 메인 | `lib/api/stock-transfer-tax-schema.ts:319-320` 인근 | `preDeemedLotClause1Mode` enum |
| ⑩ | refine | `lib/api/stock-transfer-tax-refines.ts:395-420`(의제 lot 루프) | ⑧과 **같은 술어**로 동일 오류(격자 대조 — 메모리 `feedback_fe8_vs_12_parity_grid`) |
| ⑪ | acquisitionDate fallback | `stock-transfer-tax-api.ts:297-303`·`:618-624` | 변경 없음(신규 날짜 필드 없음) — 점검만 |
| ⑫ | Zod 입력 객체 | `stock-transfer-tax-schema.ts:181-186`(`transferLotSchema`) · `:319` | `transferStdPricePerShare: z.number().positive().optional()` — **누락 시 침묵 stripping**(메모리 `feedback_explicit_prop_mapping_strip`) |
| ⑬ | body spread | `stock-transfer-tax-api.ts:603-608`(`transferLots` 명시 매핑 — 신규 필드 누락 시 소실) · `:277-283`(합성 매도 lot에 `transferDatePriceAvg1Month` 실어야 함) | 필드 명시 추가 |
| ⑭ | Route 엔진 input | `lib/api/stock-transfer-engine-input.ts:148-149`(전역 필드) · `:159-160`(lot 배열은 캐스트 통과 — ⑫가 보존하면 도달) | 전역 필드 매핑 추가 · lot 필드는 캐스트 통과 확인(확인 필요: 엔진 `TransferLot` 타입 확장 시 `coerceDates` 대상 아님) |

회귀 필수 확인: `STOCK_DATE_FIELDS`(`lib/api/stock-transfer-date-fields.ts:34-39`)에 신규 날짜 필드는 없다. 다종목 합산(`savedItems`) 스냅샷은 폼 통째 저장이라 신규 필드가 자동 포함되지만 **복원 normalize(③)가 정본**이다.

### 5.1 3중 패턴(UI display ↔ ④ ↔ ⑧) 대응표

| 필드 | UI 표시 | ④ 전송 | ⑧·⑫ |
|---|---|---|---|
| `preDeemedLotClause1Mode` | `|| "none"` 금지 — factory/normalize가 `"none"` 보장, UI는 값 직접 사용 | ① 모드 그대로(none이면 생략) | none이면 어떤 S도 요구 안 함 |
| S_d | 상장=키움·직접, 비상장=직접 | ① ≠ none일 때만 | ① ≠ none ∧ 의제 lot ≥ 1 ⇒ 필수 |
| S_t(lot) | 매도 lot 행 | estimated ∧ 매칭 매도 lot만 | 동일 술어 |

## 6. 테스트 계획 (질문 4)

**RTL** (`__tests__/components/calc/stock-transfer/pre-deemed-lots-clause1-card.anchor.test.tsx` 신규)
- 노출 격자: 분할×의제 lot 유 → 보임 / 의제 lot 없음(2025만) → `null` / 단건 → `null`(단건 카드가 보임) / lots-only → 보임(매트릭스 아래) / kotc·국외·exit → `null` / 기타자산 → 의제일 1985.1.1. 기준.
- 라디오는 **라벨이 아니라 value로** 단언(`components/calc/CLAUDE.md:253` 전역 뮤테이션 실측 — 라벨만 보면 구별력 0). 상장 `sale_case` disabled · ① 모드별 하위 입력 노출 격자.
- 분할: 매도 lot 수 = 분모 행 수 · lot 삭제 시 행·값 동반 소멸 · 양도일 변경 시 그 행만 비움(다른 lot 무변경) · 키움 어댑터가 평균 외 키를 무시.
- `SplitAllocationPreviewCard`: 산정 열 · ① 입력 중 미완이면 pending 문구.
- 결과 카드: ①/② 채택 행 강조 · ① 미입력 고지 · 「원」 미표기 · 푸터 문구가 단건과 동일 상수.

**anchor (계산기-UI 경계)** — `__tests__/calc/stock-pre-deemed-lots-clause1.anchor.test.ts` 신규
- ⑧⇔⑫ 격자(① 모드 × 시장 × S 유무 × 의제 lot 유무) — 기대값은 엔진 정본에서(메모리 `feedback_fe8_vs_12_parity_grid`).
- ④: 비해당(① none · 의제 lot 없음)에서 **미전송**(stale 가드) · 해당에서 body에 모드·S_d·lot별 S_t 포함 · lots-only 합성 매도 lot에 `transferDatePriceAvg1Month` 실림 · ⑫ Zod 통과 후 엔진 input 도달(폼→엔진 관통, 기존 `stock-pre-deemed-gates.anchor.test.ts` 패턴).
- 미리보기 = 엔진: `previewSplitAllocation().totalAcquisitionPrice === calculateStockTransferTax().acquisitionPrice`(① 채택·② 채택·혼합 3경우).
- ③: 신규 필드 없는 구 이력 → 기본값 · `transferLots[].transferStdPricePerShare` 보존.
- 뮤테이션 probe(결과를 실측으로 남길 것): 노출 leaf를 단건 술어로 되돌림 · lot 필드 ④ 매핑 제거 · ⑫ lot 필드 제거 · ⑧ 분할 조기반환 앞 삽입 위치 원복 · 미리보기가 ① 보정 leaf 대신 ② 전용 leaf 호출 · 합성 매도 lot S_t 누락.

**E2E** (`e2e/stock-transfer-split-lots.spec.ts` 확장, `E2E_PORT` 지정 — 워크트리)
- SPL-5(비상장·1980 lot·단일 매도): ① 매매사례가 ②보다 큼 → Step2 카드 입력 → 미리보기 → 결과 취득가액·`preDeemedLotsDetail` 카드·요청 본문에 신규 필드(Network 확인).
- SPL-6(상장·매도 2건·① 환산): 매도 #1·#2 분모 행 각각 입력 → 쌍별 채택이 갈리는 값으로 설계.
- SPL-7(lots-only·1980 lot): 사이드바(근사) vs 결과 대조 — §4 갭 실측 겸용.
- 재사용 셀렉터 주의: 기존 `acqCard`는 `div.border-amber-300` + `hasText: "매수 #n"`(`spec :44-48`)이다. 신규 카드는 ToneCard amber(`border-amber-200` — `tones.ts:55`)라 충돌하지 않지만 «매수 #n» 칩 문구를 새로 넣으므로 Step2 대상 셀렉터는 `data-testid` 기준으로 새로 만든다(메모리 `feedback_new_widget_breaks_uniqueness_selectors`).

## 7. 엔진 시니어에게 요청할 계약 (UI가 의존)

| ID | 요청 | UI 의존 이유 |
|---|---|---|
| E1 | 의제 lot 판정 leaf export(`isPreDeemedPurchaseLot` 또는 인덱스 반환 함수) | ⑤ 노출·⑧·⑫ 술어 일원화 |
| E2 | 입력 계약: ① 모드 · S_d · 매도 lot별 S_t · 사례가 + 비상장 S의 의미(직접 입력 vs 보충평가 산정) | ④⑬⑭ 매핑·⑫ 스키마 |
| E3 | ① 보정 leaf(매칭 후 쌍 단위)를 export하고 `previewSplitAllocation`이 같은 순서로 호출 | ⑥ 미리보기 = 엔진 |
| E4 | 결과 echo `preDeemedLotsDetail`(쌍별 ①·② · 지수비 · 채택 · 필요경비 방식) | ⑦ 카드 — 역산 금지 |
| E5 | 이동평균법(`moving_avg`)에서 ① 의미(평균단가와 쌍별 ①의 비교는 정의 불가?) — 불가면 UI는 ① 선택을 막고 ⑧⑫로 차단 | ⑤ 라디오 disabled 사유·검증 |
| E6 | ① 채택 lot의 필요경비(개산공제) 합산·§97②2호 단서 swap 판정 단위(종목 합계? 쌍별?) · `actualExpenses`는 폼-전역 1개 | Step3 안내 문구(`Step3.tsx:222-262`는 `acquisitionMode` 기준이라 lot 모드는 «실가 → 개산공제 없음»으로 단정) |
| E7 | lot ① 채택 시 신고서 `usedEstimatedAcquisition`·12-x 행 처리 | §3 신고서 라벨 |
| E8 | ②의 1주당 floor(주석 :296-299 「총액 floor보다 최대 주식수−1 작음」)가 ①과의 비교·표시 값에 미치는 영향 | 결과 카드 숫자 정합 |

Step3 안내(`Step3.tsx:222-262`): lot 모드 + ① 채택 가능 시 «취득가액 방식 실가 → 개산공제 없음» 문구가 **① 채택 건에는 거짓**이 된다. E6 확정 후 같은 술어로 문구를 분기해야 한다(UI 소유).

## 8. 사용자 결정이 필요한 UI 질문 (권장안)

| ID | 질문 | 선택지 | 권장 |
|---|---|---|---|
| **Q-1** | 비상장·기타자산의 기준시가(분자·분모) 입력 | (a) 1주당 평가액 **직접 입력**(영 §165④ 보충평가 결과) (b) 분자는 `EstimatedUnlistedBlock acquisitionSideOnly`(NI/NA 산정), 분모는 단일 매도(lots-only)만 `transferSideOnly` 재사용·분할은 직접 입력 (c) 상장 환산·매매사례만 먼저 | **(a)**. 근거: 분모가 매도 lot별이라 폼-전역 NI/NA 블록이 맞지 않고(양도연도가 갈리면 값이 다르다), 의제취득일(1985~86) 자료는 사용자가 따로 산정해 오는 값이다. 엔진에는 이미 취득측 기준시가를 직접 받는 override 경로가 있다(`stock-acquisition-basis.ts:273`·`:362-367`의 `acquisitionStdPriceOverridePerShare`). (b)는 2단계 후속 |
| **Q-2** | ① 방식 라디오 기본값·미견줌 허용 | (a) 기본 `none`(② 만) + 결과에 «① 미산정» 고지 (b) ① 필수 | **(a)** — 계획서 Q-6(2026-10-04) 결정 유지. 단 `none`에서는 현재 결과 경고 문구(① 미산정)가 그대로 나가야 한다 |
| **Q-3** | 환산 분자·분모의 일자별 종가표(`Pre1MonthClosingPriceTable`) | (a) 1단계는 직접 입력 + 키움 자동조회만 (b) 분자(폼-전역)만 일자별 표 포함 (c) 분모 lot별까지 포함 | **(a)**. 표는 폼-전역 배열 필드(`acquisitionPriceDates/Closing`, `transferPriceDates/Closing`)에 묶여 lot별 N개를 새로 만들어야 하고, stale 배열 사고 이력이 있다(`Step1.tsx:262-296` 주석 — 제보 2026-09-01). 의제취득일(1985.12)은 키움 조회가 되는지부터 **확인 필요**(`app/api/kiwoom/transfer-1month/route.ts`는 최소일자 가드가 없어 보이나 데이터 가용성은 미실측) |
| **Q-4** | 이동평균법 + ① | (a) ① 선택 차단(⑧⑫) (b) 엔진 정의에 따라 허용 | 엔진 E5 확정 후. 정의 불가면 **(a)** — 선택지를 `disabled`로 두고 사유를 라디오 description에 표기 |
| **Q-5** | 신고서 11행·12-x | (a) 11행 라벨만 + 건별 비교는 결과 카드 (b) 12-x에 합계 분자·분모 | **(a)** — 분모가 매도 lot별이라 단일 행 불가. 단건의 «비교 행 없음» 결정(계획서 §10.5)과 동일 |
| **Q-6** | ① 채택 건의 필요경비 | 엔진 E6 | 엔진 확정 후 Step3 문구·결과 카드 푸터 확정 |
| **Q-7** | 취득 후 상장·거래정지(`acquisitionStdMode` 4갈래)와 ① | (a) lot ①은 `monthly_avg`(상장)만 지원하고 나머지 상태에서는 «① 미지원 — ② 만» 안내 (b) 4갈래 전부 | **(a)** — lot 모드의 `acquisitionStdMode` 라디오는 화면에 없고(환산 모드 전용 `Step2.tsx:501`) 잔존값이 있을 수 있다. 사용자 확인 필요 |
| **Q-8** | lots-only 사이드바 근사 갭(§4) | (a) 의제 lot 존재 시 근사 행 숨김 (b) `previewSplitAllocation`을 lots-only에도 확대 | **(a)** 최소 변경. (b)는 합성 매도 lot 지원 비용이 큼 — 먼저 갭 실측 |

## 9. 12개 누락 패턴 점검 (에이전트 §7)

해당: ①(입력 수단 부재 — 본 작업 자체) · ②④⑬(lot 필드 명시 매핑 — 침묵 소실 위험, §5) · ③(`normalizeTransferLots` 명시 나열) · ⑦(결과 echo 부재 → E4) · ⑨ 활성 조건 누락(§1.2) · ⑪⑫⑭(Zod·body spread·Route — §5) · ⑫ Store default ↔ UI fallback(§5.1). 비해당: 8(토글 가시성 — RadioCardGroup 사용), 9·10(시장 매트릭스는 §1.2·Q-7로 enumerate, 시점별 임계는 무관).

## 10. 작업 규모 가늠 (Do 단계 참고 — 추정이 아니라 파일 수)

신규 3(`PreDeemedLotsClause1Card.tsx` · `PreDeemedLotsResultCard.tsx` · ⑧ 헬퍼) + 수정 약 13(types 2 · form · normalize · api-pre-deemed · api 본체 2곳 · schema · refines · engine-input · Step2 · preview · sidebar · SplitAllocationPreviewCard · result view · 신고서 라벨 · Step3 문구) + 테스트 신규 3. 엔진 E1~E8 확정 전에는 ④⑬⑭ 필드명을 고정하지 말 것.

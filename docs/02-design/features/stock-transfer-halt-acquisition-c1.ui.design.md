# C-1 취득일 거래정지 — UI 설계 (stock-transfer-halt-acquisition-c1)

> 계획: `docs/00-pm/stock-transfer-halt-acquisition-c1.plan.md` §6 · 엔진: `stock-transfer-halt-acquisition-c1.engine.design.md`
> 원칙: ToggleCard 필수(rose=지정 정보)·placeholder 숫자 금지·결과 "원" 생략·UI 순서=엔진 분기 순서

## 1. Step2 환산-상장 섹션 변경 (`app/calc/stock-transfer-tax/steps/Step2.tsx:357-411`)

엔진 estimated 분기 순서(acquiredBeforeListing → 양도정지 → [unlisted] → ★취득정지 → listed)에 맞춰, 기존 양도일 정지 ToggleCard(`:366-375`) **아래·일반 환산 카드(`:378`) 위**에 신규 ToggleCard 배치.

```
[기존] ⚠ 키움 거래정지 감지 배너 (:361 — 양도일 조회 기준, 변경 없음)
[기존] ToggleCard rose "양도일 거래정지·관리종목 지정 (소령 §165③)"
[신규] ToggleCard rose "취득일 거래정지·관리종목 지정 (소령 §165③)"
         노출: !form.tradingHaltAtTransfer && !form.acquiredBeforeListing
         description: "취득일 이전 1개월 내 거래정지·관리종목 기간이 포함되면 취득시
           기준시가만 비상장 보충 평가로 환산합니다(양도시 기준시가는 1개월 종가평균 유지).
           ※ 관리종목이라도 적정 시가로 정상 매매 중이면(상증령 §52의2③ 단서) 토글을 켜지 마세요."
         children: <EstimatedUnlistedBlock form onChange acquisitionSideOnly />
[기존] 일반 상장 환산 카드 — 분자 입력만 조건부 숨김 (§2)
[기존] PostListingValuationCard (:407) — 노출 조건에 && !form.tradingHaltAtAcquisition 추가
```

- 양도정지 ON 시 취득 토글 숨김(M-2 — 양도정지 블록이 양·취 NI/NA를 이미 수집). 잔존 ON은 엔진 분기 선행으로 무해.
- PostListingValuationCard 노출 조건(`:407` `!form.tradingHaltAtTransfer || form.acquiredBeforeListing`)에 취득정지 신규 진입 시 숨김 추가 — U1-1 패턴(잔존 ON은 유지해 차단 메시지 실행 가능): `(!form.tradingHaltAtTransfer && !form.tradingHaltAtAcquisition) || form.acquiredBeforeListing`

## 2. 일반 환산 카드 분자 조건부 (`Step2.tsx:378-404`)

- 카드 노출 조건 유지: `!form.tradingHaltAtTransfer && !form.acquiredBeforeListing` (취득정지 ON에도 카드 자체는 유지 — **분모는 계속 필요**)
- 분모 입력(`transferDatePriceAvg1Month`, `:383-390`): 항상 렌더
- 분자 입력(`acquisitionDatePriceAvg1Month`, `:391-398`): `!form.tradingHaltAtAcquisition` 시만 렌더. 취득정지 ON 시 대체 안내 1줄: "취득시 기준시가는 위 토글의 비상장 보충 평가로 산정됩니다 (소령 §165③)."
- 개산공제 안내문(`:399-402`): 유지 (취득정지에도 §163⑥4 동일)
- 분자 잔존값: 엔진 미참조(engine.design §4) — silent 무시, 클리어 불요 (3-state 파괴 금지)

## 3. EstimatedUnlistedBlock `acquisitionSideOnly` prop (`components/calc/stock-transfer/EstimatedUnlistedBlock.tsx`)

| 구역 | simpleOnly | acquisitionSideOnly (신규) |
|---|---|---|
| 모드 라디오·사례49 토글 (`:201-253`) | 숨김 | 숨김 |
| 순자산 단독 사유 라디오 (`:256-272`) | 노출 | **노출** (취득측 보충평가 산식 분기) |
| 양도연도 NI/NA (`:283-307`) | 노출 | **숨김** (양도측은 종가평균) |
| 양도기준시가 미리보기 (`:309-331`) | 노출 | **숨김** |
| 취득연도 NI/NA (`:333-358`) | 노출 | 노출 — 라벨 기존 그대로 "1주당 순손익가치 (취득시점)"·"1주당 순자산가치 (취득시점)". **`acqFaceValueOnly` 잔존값 무시하고 무조건 렌더** (`:334`의 `!acqFaceValueOnly` 조건 미적용 — 잔존 true 시 그리드 숨김 ↔ validate 필수 모순 차단) |
| 취득기준시가 미리보기 (`:370-374`) | 노출 | 노출 (NA단독 시 "(순자산 단독 — §165④3)" 첨가는 양도 미리보기 패턴 준용) |

- **mode 강제 simple**: `const mode = simpleOnly || acquisitionSideOnly ? "simple" : ...` (`:66` 패턴 확장) — `unlistedValuationMode: "full"` 잔존 시 full 렌더 차단
- prop 주석에 simpleOnly와의 의미 구분 명시 (simpleOnly = full·사례49만 숨김 / acquisitionSideOnly = 취득측 입력만)
- 부동산과다보유 평가 토글: `OtherAssetBlock.tsx:87-88` 전역 — **작업 없음**
- 미리보기 산식은 기존 `:124-143` 재사용 (80% 하한 없는 취득측 — 엔진 관행 일치, 신규 계산 0)

## 4. 결과 카드 (⑦ — `components/calc/results/`)

`method === "halt_acquisition_conversion"` 신규 분기 카드 (배치: 기존 환산 상세 영역, `ViewHelpers.tsx:72` post_listing 분기 인근):

```
취득일 거래정지 환산 (소령 §165③·§165④)
  취득시 보충평가액 (1주당)        5,600        ← conversionAcqStdPerShare
    = (순손익가치 6,000 × 3 + 순자산가치 5,000 × 2) ÷ 5     ← NA단독 시 "순자산가치 단독 (§165④3)" / 반전 시 가중 2·3 표기
  양도시 1개월 종가평균 (1주당)    10,000       ← conversionTransferStd
  환산취득가 = 양도가액 × 취득시 보충평가액 ÷ 양도시 1개월 종가평균
```

- 산식 한국어 풀어쓰기·floor 미표기·"원" 생략·금액 `text-right font-mono tabular-nums`
- NA단독 시 `weightedAvgPerShare` echo는 가중평균이 아니므로 **"가중평균" 라벨 미사용** — "1주당 평가액"으로 통일 (engine.design STEP 8 전달 사항)
- appliedRules 배지: `RuleBadges`(`ViewHelpers.tsx:154-170`)가 문자열 그대로 렌더 — **`RULE_BADGE` 맵(`:136-152`)에 `"취득일거래정지우회": "bg-amber-100 text-amber-700 border-amber-200"` 엔트리 추가** ("거래정지우회"와 동일 tone — 누락 시 slate fallback)

## 5. 클라이언트 8지점

| # | 지점 | 작업 |
|---|---|---|
| ① | `calc-wizard-stock-store.ts:65` `StockTransferFormData` | `tradingHaltAtAcquisition: boolean` (`:173` tradingHaltAtTransfer 인근) |
| ② | factory (`calc-wizard-stock-store.ts:502` 인근) | `false` |
| ③ | normalize (`calc-wizard-stock-normalize.ts:146` 인근) | `boolField("tradingHaltAtAcquisition", defaults.tradingHaltAtAcquisition)` |
| ④ | `stock-transfer-tax-api.ts:494` 인근 | 무조건 전송 |
| ⑤ | Step2 ToggleCard + EstimatedUnlistedBlock prop + 분자 조건부 (§1~3) | — |
| ⑥ | 사이드바 | boolean — 합계 무영향 (작업 없음) |
| ⑦ | 결과 카드 (§4) | — |
| ⑧ | validate-step2 (engine.design §6) | 분자 면제·취득측 필수·M-4 차단 |

## 6. E2E (`e2e/stock-transfer-halt-acquisition.spec.ts`, `E2E_PORT=3200`)

E-1 (C1-ENGINE-1 동일 입력): Step1 코스닥·양도 1,000주 → Step2 환산 모드 → "취득일 거래정지·관리종목 지정" ToggleCard 클릭(제목 exact 텍스트) → 분모 10,000 입력 → 취득 NI 6,000·NA 5,000 입력 → Step3 → 계산 →
- Network body: `tradingHaltAtAcquisition: true` + `acquisitionYearNetIncomePerShare` 포함 (⑫⑬⑭ strip 부재 증명)
- `json.result.acquisitionPrice === 5_600_000` · `json.result.valuationDetail.method === "halt_acquisition_conversion"`
- 토글 ON 시 분자 입력("취득시 1주당 기준시가") 비노출 단언

함정 메모: ToggleCard 클릭은 `getByText(제목, {exact:true})` — "거래정지" 부분 문자열은 양도일 토글과 중복 매칭(A-2 교훈). 날짜 입력 `aria-label` nth 인덱스는 토글 ON 후 DOM 변화 재확인.

## 7. 비스코프

- 키움 취득일 시점 거래정지 자동 감지·배너 (양도일 조회 기준 기존 배너 유지)
- EstimatedUnlistedBlock full(V2) 모드 연동 (C-2 후속과 통합 검토)

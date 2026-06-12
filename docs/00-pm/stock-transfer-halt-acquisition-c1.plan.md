# C-1 취득일 거래정지·관리종목 — 취득 기준시가 비상장 보충 평가 (PR-δ)

> 작성 2026-06-12 · 기준 origin/master `68ddb510` (PR #156 머지 후)
> 로드맵: `docs/00-pm/stock-transfer-remaining-followups.plan.md` Track C-1 · 선행 D-1(분할) 완료(`stock-transfer-tax.ts` 601줄)
> 모든 인용 file:line은 grep/Read 실측 (추정 0). 법령은 KoreanLaw MCP 축자 검증 완료(§1).

## 0. 목표

양도일 거래정지(`tradingHaltAtTransfer`, PR #150)는 구현되어 있으나, **취득일 이전 1개월에 거래정지·관리종목 기간이 포함된 경우**가 미구현(`tradingHaltAtAcquisition` grep 0건). 이 경우 취득시 기준시가(1개월 종가평균)가 법령상 무효이므로, **취득시 기준시가만 §165④ 비상장 보충 평가로 대체**하고 양도시 기준시가는 정상 1개월 종가평균을 유지하는 혼합 환산을 구현한다.

- 환산취득가 = 양도가액 × (취득시 보충평가액 ÷ 양도시 1개월 종가평균) — 총액 floor 1회, BigInt 안전
- 개산공제(§163⑥4) base = 취득시 보충평가액 × 주식수
- 적용 범위: **단건 + 환산(estimated) 모드 + 상장(kospi/kosdaq/konex)** 전용

## 1. 법령 근거 (KoreanLaw 축자 검증 — 2026-06-12 실측)

### 1.1 검증 완료 (확정)

| 조문 | 축자 내용 (MST 실측) | C-1 함의 |
|---|---|---|
| 소법 §99①3 (MST 285523) | "제94조제1항제3호가목에 따른 주식등(**대통령령으로 정하는 주권상장법인의 주식등은 대통령령으로 정하는 것만 해당**)" — 상증법 §63①1가목 준용, "평가기준일 이전ㆍ이후 각 2개월"→"양도일ㆍ취득일 이전 1개월" | 종가평균 평가의 적용 대상 자체가 §52의2③ 게이트를 통과한 주식으로 한정 |
| 소령 §165③ (MST 286211) | "'대통령령으로 정하는 주권상장법인'이란 코스닥·코넥스 상장 법인, '대통령령으로 정하는 것'이란 상증령 §52의2③에 해당하는 것. **이 경우 같은 항 중 '평가기준일 전후 2개월'은 '양도일ㆍ취득일 이전 1개월'로 한다**" | 거래정지 판정 윈도가 **양도일·취득일 양 시점** 각각의 "이전 1개월"로 명시 — 취득일 거래정지도 동일 규율 |
| 상증령 §52의2③ (MST 283637) | "평가기준일 전후 2개월 이내에 ... **매매거래가 정지되거나 관리종목으로 지정된 기간의 일부 또는 전부가 포함되는 주식등**(적정하게 시가를 반영하여 정상적으로 매매거래가 이루어지는 경우로서 재정경제부령으로 정하는 경우는 제외)**을 제외한** 주식등" | 거래정지 포함 주식은 종가평균 대상에서 제외 (정상매매 예외 단서는 기존 토글 description에 반영됨 — `Step2.tsx:370`) |
| 소법 §99①4 | "제3호에 따른 대통령령으로 정하는 주권상장법인의 주식등 중 **제3호에 해당하지 아니하는 것**과 §94①3나목 주식등" → 상증법 §63①1나목 준용 (비상장 평가) | 거래정지로 §99①3에서 탈락한 주식의 해당 시점 기준시가는 §99①4 → §165④ 보충 평가 |
| 소령 §165④1 | 순손익 3 : 순자산 2 가중평균(부동산과다보유 2:3 반전), "**양도일 또는 취득일**이 속하는 사업연도의 직전 사업연도" 기준, 80% 하한 단서 | 취득시 보충평가는 취득연도 직전 사업연도 NI/NA — 기존 입력 필드(`acquisitionYearNetIncomePerShare`/`acquisitionYearNetAssetPerShare`, types :195-196) 그대로 재사용. **엔진 신규 평가 입력 0개** |

### 1.2 §165⑤ 문리 경합 — 비적용 판정 (검토 시 재확인 대상)

소령 §165⑤ 본문: "양도일 현재에는 제3항에 따른 주식등에 해당되나 그 취득 당시에는 제3항에 따른 주식등에 해당되지 않는 경우 취득 당시의 기준시가는 제4항에도 불구하고 다음 계산식에 따라 계산한 가액". **문리상** 취득일 거래정지(양도일 정상·취득일 §52의2③ 탈락)도 가설에 포섭될 여지가 있다.

**판정: §165⑤ 비적용 → §99①4(§165④) 직접 적용 (옵션 A).** 근거:
1. §165⑤의 계산식·후단(취득일 평가액 = **상장일** 평가액 동일 시 §9항 준용)·⑥(유가증권시장 준용)이 전부 "코스닥·코넥스 **상장일**"을 축으로 구성 — 취득일 < 상장일(취득 후 상장)을 전제한 환산 장치. 취득일 > 상장일인 거래정지 케이스에 적용하면 취득보다 수년 앞선 상장일 시세를 기준으로 삼는 모순.
2. §99①4의 "제3호에 해당하지 아니하는 것" 분류는 평가 시점별로 판정되며, 양도일 거래정지(PR #150)도 동일 논리로 §165④ 보충 평가를 채택했음(`stock-valuation-listed.ts:14` · `stock-transfer-tax.ts:288-310`).
3. **예규·심판례 검색 완료 (2026-06-12)**: KoreanLaw `search_decisions` 4회(조세심판원·국세청 법령해석·해석례, 키워드 조합 변형) **전부 미발견 — 검색 실패**. 옵션 A를 뒤집을 행정해석 부재 확인 → 문리·구조 근거(1·2호)로 옵션 A 확정. 추후 발견 시 재환류.

### 1.3 KOSPI 동등 취급

§99①3 괄호의 §52의2③ 게이트는 문언상 코스닥·코넥스 한정이나, KOSPI도 상증법 §63①1가목 **본문** 준용 경로에서 "대통령령으로 정하는 주식등"(= §52의2③) 요건이 내재. PR #150이 양도일 거래정지에서 kospi/kosdaq/konex 동등 취급을 확정(`Step2.tsx:358` isListed 전체 노출)했으므로 C-1도 동일 — 재론하지 않음.

## 2. 현행 실측 (Pre-Do 기준점)

| 지점 | 실측 |
|---|---|
| 엔진 estimated 분기 순서 | `stock-transfer-tax.ts:260` acquiredBeforeListing → `:288` tradingHaltAtTransfer → `:312` marketType unlisted → `:351` listed 환산. **거래정지 분기는 양·취 모두 보충평가**(`calcUnlistedValuation`이 transferYear·acquisitionYear 양측 평가, `stock-valuation-unlisted.ts:277-444`) |
| 80% 하한 관행 | 양도기준시가(분모)에만 적용, 취득기준시가(분자) 미적용 — `stock-valuation-unlisted.ts:422-423` "80% 하한은 양도기준시가에만" (취득 후 상장 환산비율도 동일: `:23-24`) |
| 가중치 연혁 분기 | `getValuationWeights(transferDate)` (`stock-valuation-unlisted.ts:93`) — 양도일 기준 단일 (양도시점 과세) |
| exempt 정보성 취득가 mirror | `exempt-informational-acquisition.ts:103-153` — 본 엔진 estimated 분기와 동일 구조의 축약 분기 존재 (**C-1 분기 누락 시 비과세 경로 silent 괴리**) |
| split 모드 비교차 | `isSplitMode`(`stock-transfer-tax.ts:55`) = acquisitionLots+transferLots 요건 → 실가 전용. estimated 분기와 상호배타 |
| UI 거래정지 토글 | `Step2.tsx:366-375` ToggleCard(rose) + `EstimatedUnlistedBlock simpleOnly`(양·취 NI/NA 수집). 키움 감지 배너 `:361` |
| 일반 환산 카드 | `Step2.tsx:378-404` — `transferDatePriceAvg1Month`(분모)·`acquisitionDatePriceAvg1Month`(분자) 입력. 노출 조건 `!tradingHaltAtTransfer && !acquiredBeforeListing` |
| validate | `validate-step2.ts:188`(G-6 거래정지 시 분모 면제) · `:219-221`(C-6 보충평가 필수) · `:222-230`(분자 필수) · `:236-243`(G-5 거래정지+취득후상장 차단) |
| Zod ⑫ | `stock-transfer-tax-schema.ts:228` `tradingHaltAtTransfer: z.boolean()` |
| api ④ | `stock-transfer-tax-api.ts:494` `body.tradingHaltAtTransfer = form.tradingHaltAtTransfer` |
| route ⑭ | `route.ts:187` `tradingHaltAtTransfer: coerced.tradingHaltAtTransfer as boolean` |
| store ①② | `calc-wizard-stock-store.ts:173`(타입)·`:502`(factory false) / normalize `calc-wizard-stock-normalize.ts:146` boolField |
| result 타입 | valuationDetail.method 유니온 7종 (`types:493-500`) · appliedRules 유니온에 "거래정지우회" (`types:681`) |
| 파일 줄수 | stock-transfer-tax.ts 601 · validate-step2.ts 411 · schema.ts 681 · Step2.tsx 436 · EstimatedUnlistedBlock.tsx 404 — **800줄 여유 확인** (schema 681 주의) |

## 3. 케이스 매트릭스 (전수 enumerate)

| # | 조합 (estimated 모드 내) | 처리 | 근거 |
|---|---|---|---|
| M-1 | 양도일 정지 OFF + **취득일 정지 ON** + 상장 | ★신규 분기 — 분모=양도 종가평균, 분자=취득 §165④ 보충평가 | §1.1 |
| M-2 | 양도일 정지 ON + 취득일 정지 ON | 기존 `tradingHaltAtTransfer` 분기 (양·취 모두 보충평가 — 의미 동일, 신규 분기 미진입). UI는 양도 정지 ON 시 취득 토글 숨김(잔존 ON 무해) | `:288` 분기 선행 |
| M-3 | 양도일 정지 ON + 취득일 정지 OFF | 현행 유지 (PR #150) — 변경 0 | 종결 확인 |
| M-4 | 취득일 정지 ON + 취득 후 상장(acquiredBeforeListing) ON | **validate 차단** (취득 당시 비상장 → 취득일 거래정지 개념 불성립). G-5 패턴 준용 | `validate-step2.ts:236` 패턴 |
| M-5 | 취득일 정지 ON + marketType unlisted | 엔진 분기 가드로 unlisted 경로 우선(신규 분기를 unlisted 뒤에 배치) — silent 무시. UI 미노출(상장 환산 섹션 내 토글) | §4 분기 순서 |
| M-6 | 취득일 정지 ON + actual/face_value/sale_case 모드 | 필드 미사용(환산 전용) — UI 미노출, 엔진 분기 미도달, validate 무검사 | 분기 구조 |
| M-7 | 취득일 정지 ON + 다건(lots)/분할 모드 | 비교차 — lots는 실가 전용(`isSplitMode` :55), estimated와 상호배타 | §2 실측 |
| M-8 | 취득일 정지 ON + netAssetOnlyReason | 취득 보충평가 = 순자산 단독 (§165④3 — 기존 양측 경로와 동일 규율) | `stock-valuation-unlisted.ts:291` |
| M-9 | 취득일 정지 ON + isHeavyRealEstateForValuation | 가중치 2:3 반전 적용 | `:355-356` |
| M-10 | 취득일 정지 ON + K-OTC 비과세(exempt) | `exempt-informational-acquisition.ts`에 동일 분기 mirror — 정보성 취득가 일치 | §2 실측 |

## 4. 엔진 설계 요약

### 4.1 신규 입력·결과 필드

```ts
// StockTransferInput (types/stock-transfer.types.ts — tradingHaltAtTransfer :188 아래)
/** 취득일 거래정지·관리종목 — 취득시 기준시가만 §165④ 보충 평가 (소령 §165③ 후문 "양도일ㆍ취득일") */
tradingHaltAtAcquisition?: boolean;   // optional — 기존 호출부 보존
```

- `valuationDetail.method` 유니온에 `"halt_acquisition_conversion"` 추가 (types:493-500)
- `appliedRules` 유니온에 `"취득일거래정지우회"` 추가 (types:676-695)
- valuationDetail에 혼합 환산 echo: `conversionAcqStdPerShare`(분자=보충평가)·`conversionTransferStd`(분모=종가평균) **기존 필드 재사용** (types:506-508 — post_listing과 공유), 분자 구성 echo는 `niPerShare`·`naPerShare`·`isHeavyRE`·`netAssetOnlyReason` 기존 필드 재사용 (types:520-526)

### 4.2 신규 헬퍼 — `stock-valuation-unlisted.ts`에 export 추가

```ts
/** 취득시 1주당 보충평가액 단독 산출 (C-1 — 80% 하한 미적용·transferDate 연혁 가중치, 기존 양측 경로와 동일 관행) */
export function calcAcquisitionStdPerShareSupplementary(input: StockTransferInput): {
  perShare: number; appliedRules: string[]; warnings: string[];
}
```

- 내부 `getValuationWeights(transferDate)`·`calcWeightedAvgPerShare` 재사용 — **양측 경로(`:422-430`)와 산식 자기일관** (dual-truth 금지)
- netAssetOnlyReason 시 취득연도 NA 단독 (`:313-314`와 동일)
- 80% 하한 미적용(분자 관행 `:422-423`) — 검토 시 법문 단서(§165④1)와의 긴장 1회 재확인

### 4.3 분기 삽입 (stock-transfer-tax.ts estimated 경로)

```
acquiredBeforeListing (:260) → tradingHaltAtTransfer (:288) → marketType unlisted (:312)
→ ★신규: else if (input.tradingHaltAtAcquisition) { 혼합 환산 } → listed (:351)
```

- unlisted **뒤** 배치 = M-5 가드 (상장만 도달)
- 분모 = `transferDatePriceAvg1Month` (validate가 >0 보장 — G-6 면제 없음, 양도일 정상이므로)
- **division 가드 (API 직접 호출 시 validate 우회 대비)**: 분모 ≤0 또는 분자(취득 보충평가) ≤0 → `acquisitionPrice 0` + warning 방어 반환 — `stock-valuation-listed.ts:70-83` 패턴 mirror
- 환산취득가 = `BigInt(transferPrice) × BigInt(acqStdPerShare) / BigInt(transferStd)` floor — `stock-valuation-unlisted.ts:441-443` 패턴
- `estimatedBase = acqStdPerShare × shareCount`
- appliedRules.push("취득일거래정지우회")
- `acquisitionDatePriceAvg1Month` 잔존값은 신규 분기에서 **미참조** (silent 무시 — UI도 숨김, §6)
- **`exempt-informational-acquisition.ts:125` 앞뒤에 동일 분기 mirror** (M-10)

## 5. 14개 동기화 지점

| # | 지점 | 작업 |
|---|---|---|
| ① | 폼 상태 | `calc-wizard-stock-store.ts:173` 인근 `tradingHaltAtAcquisition: boolean` |
| ② | initial | `:502` 인근 factory `false` |
| ③ | normalize | `calc-wizard-stock-normalize.ts:146` 인근 `boolField` |
| ④ | API 변환 | `stock-transfer-tax-api.ts:494` 인근 무조건 전송 |
| ⑤ | UI 위젯 | Step2 환산-상장 두 번째 ToggleCard (§6) |
| ⑥ | 사이드바 | boolean — 합계 무영향 (작업 없음 명시) |
| ⑦ | 결과 카드 | method 직접 분기는 현재 2곳뿐(`ViewHelpers.tsx:72` post_listing · `ResultView.tsx:476` 사례49) — `halt_acquisition_conversion` **신규 분기 카드 신설**. 한국어 산식 "환산취득가 = 양도가액 × 취득시 보충평가액 ÷ 양도시 1개월 종가평균" + 분자 구성(NI/NA 가중·NA단독·반전 여부) 표시 |
| ⑧ | validation | §7 — UI fallback 없음(순수 토글)이므로 동일 default false 3중 일치 |
| ⑨⑩ | Zod enum | enum 신설 없음 (boolean) — 해당 없음 명시 |
| ⑪ | 자산 acquisitionDate fallback | 무관 — 해당 없음 명시 |
| ⑫ | Zod 입력 객체 | `stock-transfer-tax-schema.ts:228` 인근 `tradingHaltAtAcquisition: z.boolean().optional()` |
| ⑬ | body spread | api.ts 변환이 곧 body — ④와 동일 지점, grep 자가 점검 |
| ⑭ | Route 매핑 | `route.ts:187` 인근 `tradingHaltAtAcquisition: coerced.tradingHaltAtAcquisition as boolean | undefined` |

## 6. UI 설계 요약 (상세는 ui.design.md)

- **Step2 환산-상장 섹션** (`Step2.tsx:358-411`): 기존 양도일 정지 ToggleCard(:366) 아래에 취득일 정지 ToggleCard(rose) 신설. 노출 조건 `!form.tradingHaltAtTransfer && !form.acquiredBeforeListing` (M-2·M-4). title "취득일 거래정지·관리종목 지정 (소령 §165③)" / description에 정상매매 예외 단서(§52의2③) 동일 안내.
- 토글 내부: `EstimatedUnlistedBlock`에 `acquisitionSideOnly` prop 신설 — **렌더 범위 = 순자산 단독 사유 라디오(`:256-272`) + 취득연도 NI/NA 그리드(`:333-358`) + 취득기준시가 미리보기(`:370-374`)만**. 양도연도 섹션(`:283-307`)·양도기준시가 미리보기(`:309-331`)·full/사례49(`:201-253`)는 전부 숨김 (`simpleOnly`보다 좁음 — 의미 구분 주석 필수). 부동산과다보유 평가 토글은 `OtherAssetBlock.tsx:87-88` 전역 기존 위치 그대로 (작업 없음).
- **일반 환산 카드**(`:378-404`): 취득일 정지 ON 시 분자 입력(`acquisitionDatePriceAvg1Month`, `:391-398`)만 숨기고 분모 입력(`:383-390`)은 유지 — 카드 내 조건부 렌더. 분자 잔존값은 엔진 미참조(§4.3)라 silent 무시.
- 키움 감지 배너(`:361`)는 양도일 조회 기준 — 취득일 정지 자동 감지는 **비스코프** (키움 취득일 시점 조회 확장은 후속).
- 결과: ⑦ 산식 카드. "원" 표기 금지·내부 id 노출 금지 준수.

## 7. validation (⑧) 규칙

| 조건 | 규칙 |
|---|---|
| 취득정지 ON + estimated + 상장 + 양도정지 OFF + 취득후상장 OFF | `acquisitionDatePriceAvg1Month` 필수 면제 (G-6 패턴 mirror — `validate-step2.ts:222` 조건에 `&& !form.tradingHaltAtAcquisition` 추가) + 취득연도 NI/NA 필수 (netAssetOnly 시 NA만 — 기존 `validateUnlistedSimpleFields` 취득측 서브셋 신규 헬퍼) |
| 취득정지 ON + 취득후상장 ON | error 차단 (M-4 — G-5 패턴 `:236-243` 준용, 문구 "취득 당시 비상장 주식은 취득일 거래정지 대상이 아닙니다…") |
| 분모(`transferDatePriceAvg1Month`) | 기존 G-6 규칙 그대로 — 취득정지는 면제 사유 아님 |

Zod에도 동일 차단 refine 1건 (취득정지+취득후상장) — validate↔Zod 모순 금지.

## 8. anchor (Pre-Do + 신규)

**Pre-Do anchor (Do 진입 조건)**: 현행 listed 환산 1건 — transfer avg 10,000 · acq avg 8,000 · 양도가 10,000,000 → acquisitionPrice 8,000,000 통과 고정 (필드 추가 후 회귀 0 증명용).

| # | 시나리오 | 기대값 (산식 직접 계산) |
|---|---|---|
| C1-ENGINE-1 | 1,000주 · 양도가 10,000,000 · 분모 avg 10,000 · 취득 NI 6,000/NA 5,000 | 분자 floor((6000×3+5000×2)/5)=5,600 → acquisitionPrice **5,600,000** · estimatedBase 5,600,000 · 개산공제 56,000 · method "halt_acquisition_conversion" · appliedRules "취득일거래정지우회" |
| C1-ENGINE-2 | +netAssetOnlyReason | 분자 NA 단독 5,000 → **5,000,000** · 80%하한 미발동 |
| C1-ENGINE-3 | +isHeavyRE | 분자 floor((6000×2+5000×3)/5)=5,400 → **5,400,000** |
| C1-ENGINE-4 | 양도정지 ON + 취득정지 ON | 기존 tradingHaltAtTransfer 단독 결과와 **전 필드 동일** — appliedRules에 "취득일거래정지우회" **미포함**("거래정지우회"만) 포함 (분기 선행 증명) |
| C1-ENGINE-5 | unlisted + 취득정지 ON | unlisted 단독 결과와 동일 (M-5 분기 가드) |
| C1-ENGINE-6 | 분모 0 (validate 우회 가정 — 엔진 직접 호출) | acquisitionPrice 0 + warning (division 가드) |
| C1-EXEMPT-1 | K-OTC 비과세 + 취득정지 | 정보성 acquisitionPrice = C1-ENGINE-1과 동일 산식 (mirror 증명) |
| C1-VALIDATE-1 | 취득정지 ON → 분자 면제·취득 NI/NA 필수 | 오류 필드 정확 매칭 |
| C1-VALIDATE-2 | 취득정지+취득후상장 | error 1건 |
| C1-ZOD-1 | body에 tradingHaltAtAcquisition 포함 | safeParse success (strip 부재 증명 — ⑫⑬⑭) |

**E2E 1건** (`e2e/stock-transfer-halt-acquisition.spec.ts`, `E2E_PORT=3200`): 환산 모드 → 취득일 정지 토글 ON → NI/NA 입력 → 계산 → Network body `tradingHaltAtAcquisition: true` + `json.result.acquisitionPrice === 5_600_000`.

## 9. PR 구성·규모

단일 PR (`feat/stock-transfer-halt-acquisition-c1`). 엔진 헬퍼 1 + 분기 2(본체·exempt) + UI 토글 1 + validate 3 + 14지점 + anchor 9 + E2E 1. 규모 중 — A-2보다 작음 (자본조정류 lot 연산 없음).

## 10. 리스크·결정 대기

| # | 항목 | 대응 |
|---|---|---|
| R-1 | §165⑤ 문리 경합 (§1.2) | 옵션 A **확정** — 예규·심판례 검색 4회 미발견(2026-06-12) + 문리·구조 근거. 추후 발견 시 재환류 |
| R-2 | 80% 하한 분자 미적용 관행 | 기존 양측 경로 일관 유지 — 검토 1회 재확인 |
| R-3 | schema.ts 681줄 | refine 1건 추가 후 700줄 미만 예상 — 800 초과 시 분리 |
| R-4 | 키움 취득일 정지 자동 감지 | 비스코프 — 후속 (수동 토글로 충분) |

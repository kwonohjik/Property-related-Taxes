# 거래정지·관리종목 §165③ 활성화 (주식 양도세) 구현 계획서

> 작성: 2026-06-12 · 추적 출처: PDF replica 후속 #1 (memory `project_stock_transfer_post_listing_pdf_replica`) · UI 토글 "후속 PR 예정" disabled 상태
>
> **검증 상태**: §2 법령 인용은 KoreanLaw MCP 축자 확인(2026-06-12, 소득세법 시행령 MST 286211 · 상증령 MST 283637). §4 코드 인용은 전부 Read/grep 실측.

---

## 1. 목적·배경 — 갭의 실체 (실측으로 정정)

통념("엔진 미구현")과 달리 **엔진 우회 분기는 이미 구현·anchor 존재**. 실측으로 확정한 실제 갭 4건:

| # | 갭 | 실측 근거 |
|---|---|---|
| G-1 | **UI 토글 dead + 위치 모순** — 토글이 "취득 후 상장" ToggleCard **children 내부**(`PostListingValuationCard.tsx:327-334`, `disabled`)라 `acquiredBeforeListing=ON`에서만 보이는데, 엔진 분기는 `else if`(`stock-transfer-tax.ts:275`)라 **`acquiredBeforeListing=OFF`에서만 도달**. 토글이 보이는 조건에서 엔진 분기 도달 불가 | Read 실측 |
| G-2 | **거래정지 ON 시 비상장 평가 입력 폼 미노출** — 엔진 `calcUnlistedValuation`은 `transferYear`·`acquisitionYear` NI/NA를 요구하나, Step2 상장 분기(`Step2.tsx:352`)에 해당 폼 없음 (`EstimatedUnlistedBlock`은 `!isListed` 분기 전용 `:389-391`) | grep 실측 |
| G-3 | **validate 갭** — 거래정지 ON 시 §163⑨ 분자 면제(`validate-step2.ts:170`)는 있으나 **비상장 평가 필드 요구가 없음** → 미입력 시 엔진 방어 경로(0원) 침묵 | Read 실측 |
| G-4 | **수치 anchor 부재** — 기존 C18-1(`case-12-18-20-22-24.test.ts:150-162`)은 `appliedRules` 포함만 검증, **원단위 수치 anchor 0건** | Read 실측 |

추가 모순 2건:
- **G-5**: `acquiredBeforeListing=ON + 거래정지 ON + simple 모드` 조합은 validate 통과(`:184`는 비simple만 차단)하지만 엔진은 post-listing 분기 우선이라 **거래정지 침묵 무시**.
- **G-6 (13단계 1회차 검토 발견 — Critical)**: validate `:143-159`가 §163⑨ 분모(`transferDatePriceAvg1Month`)를 거래정지 무관 **무조건 필수 요구** — 거래정지 ON이면 법령상 무효·엔진 미사용 값인데 입력 강제. C-2 경로가 무효값 없이 도달 불가.

## 2. 법령 근거 (KoreanLaw 축자 — 2026-06-12)

### 2.1 시행령 §165③ (위임 + 치환)

> "법 제99조제1항제3호 전단 및 같은 항 제4호 전단에서 '대통령령으로 정하는 주권상장법인'이란 각각 코스닥시장 또는 코넥스시장에 주권을 상장한 법인을 말하며, **법 제99조제1항제3호에서 '대통령령으로 정하는 것'이란 「상속세 및 증여세법 시행령」 제52조의2제3항에 해당하는 것**을 말한다. 이 경우 같은 항 중 **'평가기준일 전후 2개월'은 '양도일ㆍ취득일 이전 1개월'로 한다**."

### 2.2 상증령 §52의2③ (준용 본문)

> "…'대통령령으로 정하는 주식등'이란 각각 **평가기준일 전후 2개월 이내에 거래소가 정하는 기준에 따라 매매거래가 정지되거나 관리종목으로 지정된 기간의 일부 또는 전부가 포함되는 주식등**(적정하게 시가를 반영하여 정상적으로 매매거래가 이루어지는 경우로서 재정경제부령으로 정하는 경우는 제외한다)을 **제외한** 주식등을 말한다."

### 2.3 종합 해석 (치환 적용)

- **양도일(취득일) 이전 1개월 이내**에 거래정지·관리종목 지정 기간이 **일부라도 포함**되면 → 그 시점의 §99①3 평가(1개월 종가평균) 대상에서 제외 → **§99①4 비상장 보충 평가 방법으로 평가** (현행 엔진 `calcUnlistedValuation` 우회와 정합).
- **단서**: 관리종목이라도 "적정 시가 반영 + 정상 매매" 시(재정경제부령 — 상증칙) 제외 대상 아님 → 1개월 평균 유지. **확인 필요**: 상증칙 해당 조문 번호 (Pre-Do에서 KoreanLaw 1회 — UI hint 문구에 반영).
- **양도일·취득일 각각 독립 판정**: 법문이 "양도일·취득일 이전 1개월" — 취득일 거래정지는 §163⑨ 환산 분자에도 영향 가능. **본 PR 스코프는 양도일만**(기존 `tradingHaltAtTransfer` 필드 활성화). 취득일 거래정지는 §11 스코프 외 명시.

## 3. 케이스 매트릭스 (전수)

| # | marketType | acquisitionMode | acquiredBeforeListing | 거래정지 ON | 동작 |
|---|---|---|---|---|---|
| C-1 | 상장 | estimated | OFF | OFF | §163⑨ 환산 (현행 불변) |
| C-2 | 상장 | estimated | OFF | **ON** | **비상장 보충 평가 우회 (엔진 기구현 — UI·validate 활성화 대상)** |
| C-3 | 상장 | estimated | ON | ON | **조합 차단으로 통일** (G-5 해소 — 현행 비simple만 차단 → 전 모드 차단. §165⑤ 환산과 거래정지 분모 대체의 교차는 후속) |
| C-4 | 상장 | actual / sale_case / face_value | — | ON | 양도가 실가·취득가 비환산 — 거래정지 무관(엔진 분기 estimated 내부만). 토글은 estimated에서만 노출 |
| C-5 | 비상장 | estimated | — | — | 비상장 본칙 (거래정지 개념 무관 — 토글 미노출, 현행 불변) |
| C-6 | 상장 | estimated | OFF | ON + 평가 필드 미입력 | **validate 차단** (G-3 — 자동 fallback 금지) |
| C-8 | 상장 | estimated | OFF | ON + §163⑨ 분모 미입력 | **통과** (G-6 — 거래정지 시 분모 무효·미사용이므로 면제) |
| C-7 | 키움 조회가 거래정지 감지(`kiwoomTradingHalt=true`) | — | — | — | 안내 배너로 토글 ON 제안 (자동 ON 금지 — 단서 판정은 사용자) |

## 4. 현행 코드 실측 (2026-06-12)

| 항목 | 위치 | 상태 |
|---|---|---|
| 엔진 우회 분기 | `stock-transfer-tax.ts:275-297` — `calcUnlistedValuation` 호출·개산공제 base·80%하한·valuationDetail | **구현 완료** (변경 불요) |
| listed 평가 fallback 신호 | `stock-valuation-listed.ts:52-65` `tradingHaltFallback: true` | 구현 완료 |
| 비과세 정보성 취득가 | `exempt-informational-acquisition.ts:125` 거래정지 분기 | 구현 완료 |
| 14지점 배선 | store `:172`·initial `:501`·normalize `:146`·api `:482`(무조건 포함)·Zod `:228`(required boolean)·route buildEngineInput | **전부 완료** (신규 필드 0) |
| UI 토글 | `PostListingValuationCard.tsx:327-334` | **disabled + 위치 모순(G-1)** |
| 비상장 평가 폼 | `EstimatedUnlistedBlock` — `!isListed` 분기 전용(`Step2.tsx:389`) | 상장+거래정지 미노출(G-2) |
| validate | `:170` §163⑨ 면제 ✓ / 비상장 필드 요구 ✗(G-3) / `:184` 비simple만 차단(G-5) | 부분 |
| anchor | C18-1 `appliedRules` 포함만 | 수치 0건(G-4) |
| 키움 거래정지 감지 | `kiwoomTradingHalt`(store `:71`) — `KiwoomAutoFetchButton:95·142`에서 set | 존재 — `tradingHaltAtTransfer`와 **미연동** |

## 5. 설계

### 5.1 엔진 — 변경 없음 (순수 활성화 PR)

`calcUnlistedValuation` 우회·`tradingHaltFallback`·정보성 취득가 모두 기구현. 신규 input 필드 0. **단, Pre-Do에서 우회 경로 수치 anchor 1건을 먼저 실행해 현행 산식을 실측 고정**(G-4 — `feedback_pre_anchor_verification`).

### 5.2 UI (⑤) — `Step2.tsx` + `PostListingValuationCard.tsx`

1. **토글 이동**: `PostListingValuationCard.tsx:327-334`의 disabled 토글 **삭제** → `Step2.tsx` 상장 환산 분기(`:352` `acquisitionMode === "estimated" && isListed` 내부, §163⑨ 블록·PostListingValuationCard **앞**)에 활성 토글 신설. UI 순서 = 엔진 분기 순서(거래정지 판정이 §163⑨/§165⑤보다 선행 분기).
2. **토글 ON 펼침**: `EstimatedUnlistedBlock` 재사용 렌더(상장+거래정지 조합) + §163⑨ 입력 블록(분모·분자 포함)·PostListingValuationCard **숨김**(C-2: 거래정지 시 1개월 평균 무효 — 사용 안 함). 카드 숨김 조건은 **`!tradingHalt || acquiredBeforeListing`** (UI 검토 U1-1 데드락 방지): 신규 진입(acquiredBeforeListing OFF)만 숨겨 원천 차단하고, C-3 잔존 상태(ON)에서는 카드를 유지해 validate 차단 메시지("취득 후 상장 토글을 해제하세요")를 실행 가능하게 함.
   - **`simpleOnly` prop 신설 (설계 검토 D1-1·D1-2 — Critical)**: Block의 full(V2) 모드 라디오·사례 49 acqFaceValueOnly 토글은 api.ts 게이트(`:506`·`:486`)가 `marketType === "unlisted"` 한정이라 상장+거래정지에서 선택 시 **silent 미반영** → 거래정지 조합은 `simpleOnly`로 simple 전용 고정(라디오·토글 숨김).
3. 토글 description에 단서 안내: "관리종목이라도 적정 시가로 정상 매매 중이면 §52의2③ 단서에 따라 1개월 평균 평가가 유지됩니다(토글 OFF 유지)."
4. **C-7 키움 연동**: `kiwoomTradingHalt === true` && 토글 OFF 시 amber 안내 배너("키움 조회에서 거래정지·관리종목이 감지되었습니다 — 해당 시 아래 토글을 켜세요"). **자동 ON 금지**(단서 판정은 사용자·`feedback_no_silent_apportion_fallback` 정신).
5. 부수 정정: `Step2.tsx:367·375` placeholder `"50,000"`·`"30,000"` 숫자 예시 → 한국어 설명(정책 위반 부수 발견).

### 5.3 validate (⑧) — `stock-transfer-tax-validate-step2.ts`

1. **G-6 분모 면제 (1회차 검토 신규 발견 — Critical)**: `:143-159` 분모(`transferDatePriceAvg1Month` direct/daily 양 모드) 검증이 거래정지 무관 **무조건 필수** — 거래정지 ON이면 법령상 무효·엔진 미사용 값 입력 강제 모순. 분모 검증 블록 전체를 `!form.tradingHaltAtTransfer` 가드로 면제. (acquiredBeforeListing ON은 §163⑨ 합성에 분모 필요 — 면제 아님.)
2. **C-6 차단**: `tradingHaltAtTransfer && !acquiredBeforeListing` 시 비상장 평가 필수 필드 검증 — 기존 비상장 블록(`:216~`)의 simple 모드 검증(transferYear·acquisitionYear NI/NA + `netAssetOnlyReason` 분기)과 **동일 로직**. 중복 회피 위해 해당 검증을 함수로 추출해 양 분기 공유.
3. **G-5 해소**: `:184` 차단 조건을 `form.tradingHaltAtTransfer`(모드 무관)로 확대 — "거래정지 + 취득 후 상장 조합은 지원하지 않습니다. 거래정지 토글을 해제하거나 취득 후 상장 토글을 해제하세요."
4. `:170` §163⑨ 분자 면제 게이트는 현행 유지(이미 정합).

### 5.4 결과 카드 (⑦)

`valuationDetail.method === "weighted_avg"` + `appliedRules` "거래정지우회" 시 기존 비상장 평가 카드가 표시되는지 **Pre-Do에서 확인** — 표시 경로가 이미 있으면 변경 0, 없으면 거래정지 사유 배지 1줄 추가.

## 6. 14 동기화 지점

신규 입력 필드 **0** — `tradingHaltAtTransfer`는 ①~⑭ 전부 기배선(§4 표). 본 PR 작업은 **⑤(UI 재배치·폼 노출)·⑧(검증 2건)·⑦(확인)**만.

## 7. anchor (설계 시 사전 계산)

공통: kosdaq 대주주(중소) · estimated · `acquiredBeforeListing=false` · `tradingHaltAtTransfer=true` · 양도가 50,000,000(50,000×1,000주).

| # | 케이스 | 입력 | 기대값 |
|---|---|---|---|
| A-TH-1 | C-2 우회 수치 (G-4 해소) | transferYear NI 30,000/NA 10,000 · acquisitionYear NI 15,000/NA 5,000 | 양도기준시가 = floor(30,000×3/5+10,000×2/5) = **22,000** (80% 하한 8,000 미발동 — 실측 확인) · 취득기준시가 per-share = **11,000** · 환산취득가 = **floor(양도가 × 취득per-share ÷ 양도per-share)**(BigInt — `stock-valuation-unlisted.ts:433-445` 실측) = floor(50,000,000×11,000/22,000) = **25,000,000** |
| A-TH-2 | 80% 하한 발동 | transferYear NI 5,000/NA 30,000 (가중 15,000 < 하한 24,000) | 양도기준시가 = **24,000** · `netAssetFloorApplied=true` + "80%하한" · 환산 = floor(50,000,000×11,000/24,000) = **22,916,666** |
| A-TH-3 | C-3 차단 | acquiredBeforeListing=true + 거래정지 ON (validate) | error 1건 (모드 무관) |
| A-TH-4 | C-6 차단 | 평가 필드 미입력 (validate) | error ≥ 2건 |
| A-TH-5 | G-6 분모 면제 | 거래정지 ON + 분모 미입력 (validate) | `transferDatePriceAvg1Month` error **0건** |
| 재산정 | PL-VALIDATE-7 | simple+halt+acquiredBeforeListing | **통과 기대 → 차단으로 반전** (G-5 모드 무관 확대 — 실측 확정) |
| 재산정 | PL-VALIDATE-6 | full+halt 문구 체크 | `toContain("후속 PR")` → 신규 차단 문구로 갱신 |
| 회귀 | C18-1 + 사례 48 + 비상장 본칙 | 기존 | 불변 |

## 8. E2E — `e2e/stock-transfer-trading-halt.spec.ts` (신규, 포트 충돌 시 3200)

| # | 시나리오 | 검증 |
|---|---|---|
| E-1 | kosdaq·환산모드 → 거래정지 토글 노출(§163⑨ 블록 앞) | 토글 visible |
| E-2 | 토글 ON → §163⑨ 입력 숨김 + 비상장 평가 폼(EstimatedUnlistedBlock) 노출 | 폼 전환 |
| E-3 | 토글 ON + 평가 입력 + 계산 → 결과 비상장 평가 표시 | 결과 도달 |

※ ToggleCard 클릭은 제목 텍스트 클릭(switch role 이중토글 회피 — §81④ PR 학습).

## 9. 작업 순서

| Phase | 내용 |
|---|---|
| P0 | Pre-Do: A-TH-1 수치 anchor 작성·실행(현행 엔진 실측 고정 — 수정 아닌 고정이므로 "통과 확인") + 상증칙 단서 조문 KoreanLaw 1회 + ⑦ 결과 카드 표시 경로 확인 |
| P1 | validate: C-6 검증 함수 추출·공유 + G-5 차단 확대 (A-TH-3·4) |
| P2 | UI: 토글 이동·활성화 + EstimatedUnlistedBlock 조건 확장 + 키움 배너 + placeholder 정정 |
| P3 | E2E 3건 + 전체 회귀 + 문서·memory + ship |

## 10. 스코프 외 (명시)

- **취득일 거래정지** (§165③ "양도일·**취득일**") — §163⑨ 환산 분자 영향. 신규 필드(`tradingHaltAtAcquisition`) + 14지점 필요 → 후속.
- **취득 후 상장(§165⑤) × 거래정지 교차** — 분모 대체 산식 검토 필요 → 조합 차단으로 통일 후 후속.
- **단서(정상 매매) 자동 판정** — 거래소 데이터 연동 불가, 사용자 판단(hint 안내)으로 유지.
- 키움 자동 ON — 금지 유지(안내만).
- **거래정지 조합의 full(V2) 정식 평가·사례 49 액면가 모드** — api 게이트가 unlisted 한정. simple 전용(`simpleOnly`)으로 고정, 확장은 후속.

## 11. 리스크·확인 필요

| 항목 | 상태 |
|---|---|
| 상증칙 단서("재정경제부령으로 정하는 경우") 조문 번호 | **확인 필요** — P0에서 KoreanLaw 1회. 미확보 시 hint 문구를 법문 직인용으로 |
| ~~A-TH-1 수기 계산값~~ | ✅ **실측 확정** (1회차 검토) — 환산식 = floor(양도가×취득per-share÷양도per-share) BigInt(`:433-445`). 80% 하한 미발동 확인. 25,000,000 확정 |
| ~~EstimatedUnlistedBlock 상장 조합 부작용~~ | ✅ **실측 확정** — `marketType`·`isListed` 참조 0건, 무변경 재사용 안전 |
| ~~기존 validate 테스트 영향~~ | ✅ **실측 확정** — PL-VALIDATE-7 의도 반전(통과→차단)·PL-VALIDATE-6 문구 갱신, 재산정 2건으로 §7 anchor 표에 등재 |
| 결과 카드 weighted_avg 표시 — 상장 marketType 조합의 표시 어색함 여부 | P0에서 확인 (`StockTransferTaxResultViewHelpers.tsx` — 표시 경로 자체는 존재 실측) |

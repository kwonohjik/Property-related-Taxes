# 주식양도세 — Y-1 기타자산 의제취득일(1985.1.1.) · Y-2 「§163⑨ 환산」 오인용 정정 계획서

- 작성: 2026-10-04
- 출처: `docs/00-pm/stock-carryover-sale-case-donor-basis.plan.md` §7.2 별건 Y-1 · Y-2
- 상태: **Do 완료** (2026-10-04) — Q-1 β · Q-2 고려 안 함(옛 저장 자료 없음) · Q-3 (a) · Q-4 한 PR

---

## 1. 요약

| ID | 결함 | 세액 영향 | 실제 영향 |
|---|---|---|---|
| **Y-1** | 기타자산(§94①4호) 의제취득일은 **1985.1.1.**(영 §162⑥1호·⑦1호)인데, UI·엔진·§163⑨ 술어는 주식(3호)의 **1986.1.1.** 하나로 처리한다 | **0원** (§4 probe — 결과의 수치·불리언 필드 31개 전부 동일) | ① 1985년 중 취득한 기타자산의 취득일이 **1986.1.1.로 덮어써진다**(원래 날짜가 사라짐). ② 1984년 이전 취득분이 1985.1.1.이 아니라 1986.1.1.로 의제된다. ③ 1985년 중 증여·상속받은 기타자산에서 §163⑨ 추계 차단이 빠진다. ④ 환산 분자(취득일 이전 1개월 종가)의 조회 기준일이 틀린다. ⑤ 결과 배지가 「§162⑦3호」를 인용한다 |
| **Y-2** | Step 2 검증 메시지 4건이 환산 분자·분모 근거를 「§163⑨」로 인용한다. 정본은 **영 §176의2②1호**다(§163⑨는 상속·증여 평가액 의제 조항이다) | 0원 (문구) | 사용자 화면에 틀린 조문이 뜬다. 같은 저장소의 `stock-valuation-listed.ts:9-10`은 이미 「D-2 정정 §163⑨ → §176의2②1호」를 기록해 두었다 — **자기모순** |

Y-1은 세액을 바꾸지 않는다. 고치는 대상은 **입력 무결성**(사용자가 입력한 날짜가 사라지는 문제), **§163⑨ 차단 경계**, **조회 기준일**, **법령 인용**이다. 규모를 부풀리지 않도록 이 점을 먼저 적어 둔다.

---

## 2. 법령 근거 (KoreanLaw 원문 확인 2026-10-04)

### 2.1 영 §162⑥⑦ — 의제취득일 (현행 MST 290841, 시행 2026.10.1.)

> ⑥ 법률 제4803호 「소득세법개정법률」 부칙 제8조에서 "대통령령이 정하는 자산"이란 다음 각 호의 자산을 말한다.
> 1. **1984년 12월 31일 이전**에 취득한 법 제94조제1항제2호 및 **제4호**의 자산
> 3. **1985년 12월 31일 이전**에 취득한 법 제94조제1항**제3호**의 자산
>
> ⑦ … "대통령령이 정하는 날"이란 다음 각 호의 날을 말한다.
> 1. 법 제94조제1항제2호 및 **제4호**의 자산의 경우에는 **1985년 1월 1일**
> 3. 법 제94조제1항**제3호**의 자산의 경우에는 **1986년 1월 1일**

### 2.2 국세청 해석 — 기타자산 «주식»에도 1985.1.1.이 적용된다

- **사전-2015-법령해석재산-0242**(2015.9.9.): 「**1985.1.1.(이하 "의제취득일"이라 함) 전에 취득한 「소득세법」제94조 제1항 제4호 다목 … 기타자산에 해당하는 비상장 주식**을 양도하는 경우 … 취득가액은 같은 법 시행령 제176조의2 제4항에 따라 계산하는 것이며, 같은 조 제2항에 따른 환산취득가액을 계산할 때 취득당시의 기준시가는 … **의제취득일이 속하는 사업연도의 직전 사업연도 종료일** 현재 …」
  - ⇒ 4호 주식의 의제취득일은 1985.1.1.이다. 환산 분자도 **의제취득일 기준**으로 산정한다(④ 조회 기준일 근거).
- **서일46014-10386**(2002.3.21.): 질의가 「§94①4호 기타자산(주식) … 취득일이 **1985.1.1. 이전**인 경우」다. 회신은 §176의2④(의제취득일 현재 가액과 실가에 생산자물가상승률을 반영한 가액 중 큰 것)이다.
- (원문 열람: taxlaw.nts.go.kr `ntstDcmId=010000000000185450` · `010000000000053239`, Playwright로 확인)

### 2.3 영 §176의2②1호 — 주식·기타자산 환산 산식 (Y-2 정본)

> ② 법 제114조제7항에서 "대통령령으로 정하는 방법에 따라 환산한 가액"이란 …
> 1. 법 제94조제1항**제3호**에 따른 주식등이나 같은 항 **제4호**에 따른 기타자산의 경우에는 다음 산식에 의하여 계산한 가액
> 양도당시의 실지거래가액 … × 취득당시의 기준시가 / 양도당시의 기준시가

영 §163⑨는 「상속 또는 증여받은 자산 … 평가한 가액을 취득당시의 실지거래가액으로 본다」는 조항이다. 환산 산식과는 무관하다.

### 2.4 영 §176의2④ — 의제취득일 전 취득 자산 (상속·증여 포함)

「의제취득일 전에 취득한 자산(**상속 또는 증여받은 자산을 포함한다**)」 ⇒ 의제취득일 **전**의 상속·증여는 §163⑨ 추계 차단의 예외다(선행 PR #1931 술어가 이미 반영). 이 예외의 경계일이 3호 1986.1.1. / 4호 1985.1.1.로 **갈린다**.

---

## 3. 현행 실측 (file:line — 2026-10-04 master `b0bcfe09a`)

### 3.1 Y-1 — 1986.1.1. 단일 처리 지점

| 층 | 위치 | 현행 |
|---|---|---|
| ⑤ UI (파괴적 변환) | `components/calc/stock-transfer/AcquisitionInfoBlock.tsx:40-50` `coerceDeemed` | `value <= "1985-12-31"`이면 **store에 `"1986-01-01"`을 저장**한다. 원래 입력값은 component local state(`:93-96`)에만 남고 새로고침·복원 시 사라진다 |
| ⑤ 적용 필드 4개 | 같은 파일 `:98-140` | `acquisitionDate` · `decedentAcquisitionDate` · `donorAcquisitionDate` · `preMergerAcquisitionDate` |
| ⑤ 안내 문구 | `:150` · `:160-162` · `:208-215` · `:247-249` · `:454-456` | 전부 「1985.12.31. 이전 → 1986.1.1. · §162⑦3호」 |
| 엔진 | `lib/tax-engine/stock-transfer/stock-transfer-helpers.ts:225-243` `applyDeemedAcquisitionDate` | 분류와 무관하게 `<= 1985-12-31 → 1986-01-01`이다. 주석의 「§162①」도 오인용이다(⑦3호) |
| 엔진 소비처 | `stock-transfer-tax.ts:482-494` · `stock-transfer-exempt-result.ts:84-87` | **보유기간(단기 30% 판정)과 `appliedRules` 「의제취득일적용」에만 쓴다** |
| §163⑨ 술어 | `lib/tax-engine/stock-transfer/gift-acquisition-163-9.ts:26` | `Date.UTC(1986,0,1)` 단일 |
| ⑦ 결과 배지 | `components/calc/results/StockTransferTaxResultViewHelpers.tsx:289` | 「의제취득일적용」 → `소득세법 시행령 §162⑦3호` 고정 |
| 조회 기준일 | `app/calc/stock-transfer-tax/steps/Step2.tsx:513` (키움 자동조회) · `components/calc/stock-transfer/Pre1MonthClosingPriceTable.tsx:81` (일자별 표) | `form.acquisitionDate`를 그대로 쓴다. 지금은 저장값이 이미 1986-01-01이라 «우연히» 의제일 기준이다 |
| ±3개월 매매사례 | `lib/tax-engine/stock-transfer/stock-transfer-pr2-detail.ts:46` | `input.acquisitionDate`를 쓴다(위와 같은 사정) |

### 3.2 4호 판정은 «분류 결과»이고, Step 1 순서상 날짜보다 **뒤에** 정해진다

- 엔진의 4호 판정은 `stock-classification.ts:211-216` `SECTION_94_4_CATEGORIES`(분류 결과)다. `marketType === "other_asset"` 직접 선택만이 아니라 **§94②**(3호 + 다목 게이트 통과 또는 라목 → 4호)로도 4호가 된다(`:380-395`).
- Step 1 렌더 순서: `MarketTypeBlock`(`Step1.tsx:187`) → **`AcquisitionInfoBlock`(`:255`)** → `OtherAssetBlock`(`:375`, 라목 `isHeavyRealEstateForRate`·다목 토글).
- ⇒ **날짜 입력 시점의 변환은 §94② 경로의 4호 여부를 알 수 없다.** 비상장 주식에 1985-06-01을 넣으면 1986-01-01로 덮어써지고, 그 뒤에 부동산과다 토글을 켜서 4호가 되어도 원래 날짜는 이미 사라진 뒤다. **파괴적 변환을 유지하는 한 분류 기준으로 고칠 수 없다** — Q-1 권장안의 근거.

### 3.3 부수 발견 — 「의제취득일적용」 배지는 단건 UI 경로에서 발동하지 않는다 (코드 분석)

UI가 `<= 1985-12-31`을 `1986-01-01`로 바꿔 저장하므로, 엔진 조건 `date <= 1985-12-31`은 UI 경로에서 항상 거짓이다. 엔진 직접 호출 테스트(`case-49-unlisted-exchange.test.ts:190-193` · `:267-285`, 원 날짜 투입)만 배지를 본다. ⇒ 비파괴 저장으로 바꾸면 배지가 **처음으로 화면에 뜬다**(Pre-Do에서 브라우저로 현행 미발동 확인 — 「확인 필요」).

### 3.4 Y-2 — 오인용 위치 (선행 계획서의 `:355·364·399·411`은 PR #1931 이후 드리프트)

| 구분 | 위치 | 문구 |
|---|---|---|
| **사용자 노출** | `lib/calc/stock-transfer-tax-validate-step2.ts:193` | 「… (§163⑨ 환산 분모 — '일자별 입력' 모드 사용 가능)」 |
| 사용자 노출 | `:202` | 「… (§163⑨ 환산 분모 자동 산정용)」 |
| 사용자 노출 | `:412` | 「… (시행령 §163⑨ 환산비율 분자 — …)」 |
| 사용자 노출 | `:424` | 「… (§163⑨ 환산 분자 자동 산정용)」 |
| 주석 (주식 도메인) | `lib/stores/calc-wizard-stock-form-types.ts:207-208` · `lib/calc/stock-transfer-tax-api.ts:307` · `lib/api/stock-transfer-tax-schema.ts:322` · `components/calc/stock-transfer/StockFilingFormAssetCostRows.ts:203·234` · `components/calc/stock-transfer/KiwoomAutoFetchButton.tsx:30` · `lib/tax-engine/stock-transfer/types/stock-transfer.types.ts:996` | 「§163⑨ 분모·분자·환산」 |
| 정정 기록(정본) | `lib/tax-engine/stock-transfer/stock-valuation-listed.ts:9-10` · `apply-163-9-conversion.ts:4·16` · `validate-step2.ts:180` | 이미 §176의2②1호로 정정 기록됨. 파일명 `apply-163-9-conversion.ts`는 「historical naming 유지」로 의도적으로 남겼다 |
| 부동산 도메인 (범위 밖 후보) | `lib/tax-engine/legal-codes/transfer.ts:48-49` `ESTIMATED_ACQUISITION` | 「§97①1호 나목, 시행령 §163⑨」 — 부동산 정본은 §176의2②**2호**. **이 상수는 정의 외 사용처가 0건**이다(grep 확인). 주석 `transfer-tax-carryover.ts:183` · `transfer-tax-api-carryover.ts:36`도 같은 오인용이다 |

- 메시지 문자열을 단언하는 테스트·E2E는 **0건**이다(`§163⑨ 환산|환산비율 분자|환산 분자 자동|환산 분모 자동` grep). ⇒ 문구 정정이 기존 테스트를 깨지 않는다. 반대로 **안전망도 없다** → anchor를 새로 둔다.
- `legal-codes/stock.ts`에는 §176의2②1호 상수가 없다(③1호·③2호 단서·③ 단서만 있다, `:157-162`). manifest는 `소득세법 시행령 §176의2`를 조문 단위로 등록했다(`additions-transfer-decree.ts:314`) → 새 상수도 감시 범위 안이다.

---

## 4. 수치 영향 실측 (probe 2026-10-04, 엔진 직접 호출, 실행 후 삭제)

양도 2,000,000/주 × 100주, 실가 취득 100,000/주, 양도일 2025-12-01, 대주주.

| 케이스 | taxCategory | 의제 배지 | 산출세액 |
|---|---|---|---|
| other_asset(라목) 1984-06-01 | other_asset_heavy_re | ✓ | 51,310,000 |
| other_asset(라목) 1985-06-01 | 〃 | ✓ (법상으로는 ✗여야 함) | 51,310,000 |
| other_asset(라목) 1986-01-01 | 〃 | ✗ | 51,310,000 |
| 비상장 3호 1985-06-01 | unlisted_major | ✓ | 37,500,000 |
| 비상장 3호 1986-01-01 | 〃 | ✗ | 37,500,000 |
| 비상장 + 라목(§94②) 1985-06-01 | other_asset_heavy_re | ✓ (법상으로는 ✗) | 51,310,000 |

**같은 분류 안에서는 결과의 수치·불리언 필드 31개가 날짜와 무관하게 전부 동일**하다(§94② 행의 `section94_2Applied` 차이는 입력 경로 차이이지 날짜 때문이 아니다). 날짜는 보유기간에만 쓰이고, 1985년 취득분은 어느 쪽이든 «1년 이상»이기 때문이다. `calcAccrualMonths`(소칙 §81④ 월할, `stock-valuation-unlisted.ts:174` · `stock-valuation-post-listing.ts:533`)는 **동일 사업연도 취득·양도**에서만 발동하므로 1985년 취득분과는 만나지 않는다.

⇒ Y-1은 **세액 결함이 아니다**. 엔진의 의제일 파생 변경이 수치를 바꾸지 않는다는 점을 회귀 anchor(Y1-7)로 고정한다.

---

## 5. 설계

### 5.1 Y-1 — 비파괴 저장 + 분류 기반 의제일 파생 (Q-1 권장안 β)

**원칙**: store에는 **사용자가 입력한 날짜를 그대로** 둔다. 의제취득일은 저장하지 않고, 쓰는 곳에서 «분류 → 의제일»로 **파생**한다(render·엔진 모두 매번 계산 — useEffect 미러링 없음).

#### (a) 단일 소스 leaf — `lib/tax-engine/stock-transfer/stock-deemed-acquisition-date.ts` 🆕

```ts
/** 영 §162⑦ — 3호 1986-01-01 / 4호 1985-01-01 */
export function stockDeemedAcquisitionDate(is94_4: boolean): string
/** 원 날짜가 의제일 «전»이면 의제일, 아니면 원 날짜 */
export function resolveStockDeemedDate(date, is94_4): { effectiveDate; isDeemedApplied }
/** 클라이언트용 4호 판정 — 엔진 분류(`SECTION_94_4_CATEGORIES`)와 같은 답을 내야 한다 */
export function isSection94_4Asset({ marketType, isHeavyRealEstateForRate, blockShareholderGatePassed }): boolean
```

- 엔진은 **분류 결과**(`SECTION_94_4_CATEGORIES.has(taxCategory)`)로 `is94_4`를 정한다. 클라이언트(⑤⑧⑫③)는 `isSection94_4Asset`을 쓰고, 다목 게이트는 이미 클라이언트에서 쓰는 `judgeBlockShareholderGate`(`validate-step1` · `refines`)를 재사용한다.
- 🔑 **술어 공유 ≠ 단일 소스** — 두 판정이 갈리면 화면과 엔진이 다른 의제일을 쓴다. 매트릭스 parity anchor(Y1-3)로 고정한다.

#### (b) 소비처 변경

| 층 | 변경 |
|---|---|
| ⑤ `AcquisitionInfoBlock.tsx` | `coerceDeemed`와 local state 4개를 **삭제**하고 날짜를 원값 그대로 저장한다. 안내 문구는 render 시 `resolveStockDeemedDate(값, is94_4)`로 파생한다 — 「입력하신 취득일은 {1984.12.31.\|1985.12.31.} 이전이므로 의제취득일 **{1985.1.1.\|1986.1.1.}**을 적용합니다 (§162⑦{1\|3}호)」. 헤더 배지(`:150`)도 분류에 따라 바꾼다. ⇒ 날짜 입력 → 부동산과다 토글 순서여도 **다시 렌더하면서 맞게 갱신**된다 |
| 엔진 `stock-transfer-helpers.ts` | `applyDeemedAcquisitionDate(date, is94_4)`. 호출부 `stock-transfer-tax.ts:484` · `stock-transfer-exempt-result.ts:84`에 분류 결과를 넘긴다. 4호이면 `appliedRules`에 **「의제취득일적용(기타자산)」**(신규 키)을 넣는다 — 저장 이력의 기존 키는 그대로 둔다 |
| 엔진 `stock-transfer-pr2-detail.ts:46` | ±3개월 기준일을 `effectiveDate`로 한다(영 §176의2④1호 「의제취득일 현재 제3항제1호」). 증여자 매매사례(A) 경로는 증여자 취득일에도 같은 파생을 적용한다 |
| §163⑨ 술어 `gift-acquisition-163-9.ts` | `isGiftLikeEstimationBlocked(cause, date, mode, is94_4)` — 경계 `> 의제일(분류)`. 호출 5곳(⑧ step2 · ⑫ refines · ③ normalize 마이그레이션 · 엔진 B `stock-carryover.ts` · `Step2.tsx:63`)에 인자를 넘긴다 |
| 조회 기준일 | `Step2.tsx:513` 키움 · `Pre1MonthClosingPriceTable.tsx:81` 일자별 표 → `effectiveDate` |
| ⑦ 배지 | `StockTransferTaxResultViewHelpers.tsx` — 「의제취득일적용(기타자산)」 → `소득세법 시행령 §162⑦1호`, 기존 키는 ⑦3호 유지 |
| 법령 상수 | `legal-codes/stock.ts`에 `ENFORCEMENT_DECREE_162_7_1_DEEMED_OTHER_ASSET` · `_162_7_3_DEEMED_STOCK`를 추가한다(§162는 manifest에 조문 단위 등록 — `additions-transfer-decree.ts:32`) |
| ④⑫⑬⑭ | **변경 없음** — 원 날짜가 그대로 전송된다(필드 추가 없음) |

#### (c) 위험과 대응

| ID | 위험 | 대응 |
|---|---|---|
| R-1 | **종가표 잔재** — 의제 대상 상장주식에서 4호 토글을 바꾸면 `effectiveDate`가 바뀐다(1986.1.1. ↔ 1985.1.1.). 그런데 저장된 1개월 평균·종가 배열은 그대로 남는다. `handleAcqDateChange`(`AcquisitionInfoBlock.tsx:100-120`)가 날짜 변경 때 지우는 것과 **같은 결함**이다 | 4호 판정을 바꾸는 토글(`OtherAssetBlock` 라목·다목, `MarketTypeBlock`)의 onChange에서 **유효 의제일이 바뀌면** 같은 3필드를 함께 비운다(onChange 직접 patch — useEffect 금지). anchor Y1-6 |
| R-2 | **레거시 저장값** — 종전 변환으로 `"1986-01-01"`이 저장된 이력·세션이 있다. 원래 날짜는 복구할 수 없다 | 3호는 종전과 같은 결과다(배지 없음 · §163⑨ 비차단 · 세액 동일). 4호 레거시는 「1986-01-01 실제 취득」으로 읽히는데, §4에 따라 세액은 같다. **다만 §163⑨ 술어가 4호 경계(1985.1.1.)로 바뀌면 이 값이 «차단»으로 뒤집혀** normalize 마이그레이션이 추계 모드를 실가로 **조용히 바꾼다**. 이는 Q-2에서 결정한다 |
| R-3 | §163⑨ 경계를 `>`(엄격)로 유지하면 의제일 «당일»의 실제 증여·상속은 차단되지 않는다 | 1985.1.1. · 1986.1.1.은 둘 다 신정 공휴일이라 명의개서·상속개시가 사실상 없다. 종전 PR #1931과 같은 판단이다 — 그대로 둔다 |

### 5.2 Y-2 — 인용 정정

- 상수 `ENFORCEMENT_DECREE_176_2_2_1_CONVERSION: "소득세법 시행령 §176의2②1호"`를 `legal-codes/stock.ts`에 추가하고, 4개 메시지는 템플릿으로 인용한다(문자열 리터럴 금지 규칙).
- 문구(안) — 「인용 = 법령명 + 법/령 + 조항호」:
  - `:193` 「양도일 이전 1개월 종가 평균을 직접 입력하세요 (환산취득가액 분모 — 소득세법 시행령 §176의2②1호 · '일자별 입력' 모드 사용 가능)」
  - `:202` 「일자별 입력 모드: 양도일 이전 1개월 거래일 종가를 1셀 이상 입력하세요 (환산취득가액 분모 자동 산정용 — 소득세법 시행령 §176의2②1호)」
  - `:412` · `:424` — 「분자」로 대칭
- 주석 7곳(§3.4 표)은 Q-3에 따른다.

---

## 6. 케이스 매트릭스 · anchor

| ID | 입력 | 기대 |
|---|---|---|
| Y1-1 | other_asset 1984-06-01 매매 | 배지 「의제취득일적용(기타자산)」 · 세액은 1986-01-01 입력과 동일 |
| Y1-1b | other_asset **1985-06-01** | 배지 **없음**(의제일 이후) — 현행은 ✓ (RED) |
| Y1-1c | other_asset 1985-01-01 / 1984-12-31 | 없음 / 있음 (경계) |
| Y1-1d | 비상장 3호 1985-06-01 | 배지 「의제취득일적용」(⑦3호) — 현행과 같음 |
| Y1-1e | 비상장 + 라목(§94②) 1985-06-01 | 배지 없음 (RED) |
| Y1-2 | 증여 · other_asset 1985-06-01 · 환산 | §163⑨ **차단**(⑧⑫ 오류) — 현행은 통과 (RED) |
| Y1-2b | 증여 · 비상장 3호 1985-06-01 · 환산 | 차단 안 함 (§176의2④) — 긍정 짝 |
| Y1-2c | 증여 · other_asset 1984-06-01 · 환산 | 차단 안 함 |
| Y1-2d | 레거시 other_asset `"1986-01-01"` · 환산 | Q-2 결정대로 |
| Y1-3 | parity: `marketType`(5) × 라목(2) × 다목 게이트(통과·불통·미선택) | `isSection94_4Asset` == 엔진 `SECTION_94_4_CATEGORIES.has(taxCategory)` 전 칸 |
| Y1-4 | ⑤ RTL: 비상장 1984-06-01 입력 | store 값이 **1984-06-01 그대로** · 안내 「1986.1.1.」 → 라목 켜면 「1985.1.1.」로 바뀜 (순서 독립) |
| Y1-5 | ±3개월: 3호 1985-06-01 · 매매사례일 1986-02-01 | 기준일 1986-01-01 → 31일, 경고 없음 |
| Y1-6 | R-1: 상장 의제 대상 · 종가 입력 후 라목 토글 | 1개월 평균·종가 배열 비워짐 |
| Y1-7 | 회귀: §4 표 6케이스 | 산출세액 불변 |
| Y2-1 | 4개 메시지 | `§163⑨` 미포함 · `§176의2②1호` 포함 |

> Y1-1b·1e·2는 **Pre-Do RED**다 — 현행에서 실패 사유가 §3과 일치하는지 먼저 확인한다(`feedback_pre_anchor_verification`).
> Y1-2는 부정 anchor이므로 긍정 짝 Y1-2b·2c를 함께 둔다(`feedback_negative_anchor_needs_positive_twin`).
> 엔진 술어를 바꾸면 뮤테이션 probe(`resolveStockDeemedDate`의 4호 분기 · 술어 경계)로 anchor가 실제로 잡는지 확인한다. 원본 백업은 cp를 쓰고 git checkout은 쓰지 않는다.

---

## 7. 결정 필요 (Q)

| ID | 질문 | 선택지 | 권장 |
|---|---|---|---|
| **Q-1** | Y-1 접근 | **β** 비파괴 저장 + 분류 기반 파생(§5.1) / **α** 파괴적 변환을 유지하되 `marketType === "other_asset"`일 때만 컷오프를 1984.12.31.로 낮춤 — §94②(비상장·상장 + 라목·다목) 경로는 **고칠 수 없다**(§3.2 순서 문제) / **γ** 코드는 그대로 두고 4호 안내 문구만 추가 | **β** — α는 4호의 한 갈래만 고치고, 날짜를 덮어쓰는 근본 원인을 남긴다 |
| **Q-2** | 레거시 4호 `"1986-01-01"`의 §163⑨ | (a) 4호에서 정확히 `1986-01-01`이면 «종전 변환값일 수 있음»으로 보고 **차단하지 않는다**(이 날 실제 취득은 공휴일이라 사실상 없다) / (b) 법 경계대로 차단(마이그레이션이 추계 → 실가로 전환) | **(a)** — 복원 시 사용자 입력을 조용히 바꾸지 않는다. 술어 주석에 근거를 남긴다 |
| **Q-3** | Y-2 범위 | (a) 사용자 노출 메시지 4건 + 주식 도메인 주석 7곳 / (b) 메시지 4건만 / (c) (a) + 부동산 `TRANSFER.ESTIMATED_ACQUISITION`(미사용 상수 → §176의2②2호) · 주석 2곳 | **(a)** — 오인용은 전역으로 복제된다(`feedback_citation_drift_replicates_across_repo`). 부동산은 사용처가 0건인 상수라 별건으로 기록만 한다. 테스트 파일명·describe·`apply-163-9-conversion.ts` 파일명은 바꾸지 않는다 |
| **Q-4** | PR 구성 | 한 PR / Y-2 먼저 분리 | **한 PR** — 둘 다 `validate-step2.ts`를 건드리고, Y-2는 작다 |

---

### 7.1 결정 (2026-10-04)

| ID | 결정 | 반영 |
|---|---|---|
| Q-1 | **β** | §5.1 그대로 |
| Q-2 | **고려 사항 아님** — 옛 저장 자료가 없다 | R-2 대응 불필요. §163⑨ 경계를 **법문 그대로** 둔다: 의제취득일 «전»(엄격 미만)만 §176의2④ 예외, **의제일 당일부터 차단**(`>=`). R-3의 「엄격 초과 유지」는 레거시 변환값 보호용이었으므로 철회 |
| Q-3 | **(a)** 메시지 4건 + 주식 주석 7곳 | §5.2 |
| Q-4 | **한 PR** | — |

## 8. 실행 단계

```
1. Q-1~Q-4 확정                                         → verify: §7 갱신
2. Pre-Do: 브라우저에서 §3.3(배지 미발동) 확인 · Y1-1b·1e·2 RED  → verify: 실패 사유가 §3과 일치
3. leaf(§5.1a) + 엔진(helpers · tax · exempt-result · pr2-detail) → verify: Y1-1·1d·5·7, case-49 테스트 불변
4. §163⑨ 술어 is94_4 인자 + 호출 5곳(⑧⑫③ · 엔진 B · Step2)  → verify: Y1-2·2b·2c·2d·3, stock-carryover-sale-case-gates 17건 불변
5. ⑤ AcquisitionInfoBlock 비파괴화 · 안내 파생 · R-1 토글 정리 · 조회 기준일 → verify: Y1-4·6, acq-one-month-table anchor 불변
6. ⑦ 배지 · 법령 상수 2+1                                 → verify: legal-verification-coverage-complete
7. Y-2 메시지·주석                                       → verify: Y2-1 + 역방향 grep `163⑨` (주식 도메인 잔존 = 상속·증여 평가 의미만)
8. 전체 vitest · tsc · lint · verify:legal · Playwright(1984 기타자산 입력 → 결과 배지 §162⑦1호)
```

## 9. 범위 밖

- **영 §176의2④ 「많은 것」 산식**(의제일 현재 가액 vs 실가 + 생산자물가상승률) — 주식 엔진에 구현돼 있지 않다(`생산자물가` grep 0건). 서일46014-10386이 4호 주식에도 이 산식을 적용한다. 미구현인 상태가 의도인지 확인이 필요하다 → 별건 **Z-1**로 기록만 한다.
- **분할(lot) 모드**의 의제취득일 — lot 날짜는 원래 비파괴이고, 엔진 lot 경로는 의제일을 적용하지 않는다. 보유기간 외에는 쓰지 않아 수치 영향이 없다(§4와 같은 이유) → 기록만 한다.
- 국외주식(§94①3호 다목)·국외전출세 경로 — 별도 엔진이다.
- 부동산 도메인 `TRANSFER.ESTIMATED_ACQUISITION` 오인용 — Q-3 (c)를 고르지 않으면 별건이다.
- X-1(K-OTC 비과세 + 매매사례 echo 0원) — 별건을 유지한다.

---

## 10. 구현 결과 (2026-10-04)

### 10.1 변경 지점

| 층 | 파일 | 내용 |
|---|---|---|
| leaf 🆕 | `lib/tax-engine/stock-transfer/stock-deemed-acquisition-date.ts` | `stockDeemedAcquisitionDate` · `resolveStockDeemedDate(String)` (의제일 «전»이면 의제일) · `isSection94_4Asset`(분류와 같은 규칙 — 다목은 `judgeBlockShareholderGate` 통과) |
| 엔진 분류 | `stock-classification.ts` | `isSection94_4Category(taxCategory)` export (`SECTION_94_4_CATEGORIES` 래퍼) |
| 엔진 | `stock-transfer-helpers.ts` · `stock-transfer-tax.ts` · `stock-transfer-exempt-result.ts` | `applyDeemedAcquisitionDate(date, is94_4)` — 분류 결과로 판정. 4호면 `appliedRules` 「의제취득일적용(기타자산)」(신규 키) |
| 엔진 ±3개월 | `stock-transfer-pr2-detail.ts` | 매매사례 기준일 = 의제취득일(의제 대상이면), 경고 라벨 「의제취득일」 |
| §163⑨ 술어 | `gift-acquisition-163-9.ts` | `is94_4` **필수 인자** · 경계 `>= 의제일`. 호출 5곳(⑧ step2 · ⑫ refines · ③ normalize · 엔진 B · Step2) |
| 폼 어댑터 🆕 | `lib/calc/stock-transfer-section94-4-form.ts` | `isSection94_4Form`(④와 같은 % → 소수 변환) · `withDeemedBaseReset`(R-1) |
| ⑤ | `AcquisitionInfoBlock.tsx` | `coerceDeemed`·local state 4개 삭제 → 입력값 그대로 저장. 안내는 `DeemedDateNotice`가 render마다 분류로 파생(`data-testid="deemed-acquisition-notice"`) · 헤더 배지 §162⑦1호/3호 |
| ⑤ | `Step1.tsx` | `deemedSafeChange` — 시장 유형·종목 메타·기타자산 블록·양도일 onChange에 R-1 리셋 동승 |
| ⑤ | `Step2.tsx` | 키움 자동조회·일자별 표의 취득 기준일 = 의제취득일 |
| ⑦ | `StockTransferTaxResultViewHelpers.tsx` | 배지 2키 → `STOCK.ENFORCEMENT_DECREE_162_7_3_DEEMED_STOCK` / `_162_7_1_DEEMED_OTHER_ASSET` |
| 법령 상수 | `legal-codes/stock.ts` | §162⑦1호 · §162⑦3호 · §176의2②1호 (manifest 조문 단위 등록 범위 안 — coverage 게이트 통과) |
| Y-2 | `stock-transfer-tax-validate-step2.ts` 메시지 4건 · 주석 7곳 | 「§163⑨ 환산」 → 「환산취득가액 분자·분모 — 소득세법 시행령 §176의2②1호」 |
| ④⑫⑬⑭ | — | 변경 없음(원 날짜 그대로 전송 — E2E에서 요청 본문 `acquisitionDate: "1984-06-01"` 확인) |

### 10.2 검증

| 항목 | 결과 |
|---|---|
| Pre-Do 엔진 anchor `deemed-acquisition-date-94-4.anchor.test.ts` | **7 RED**(실패 사유 §3과 일치) → GREEN 12/12 |
| 게이트 anchor `stock-deemed-date-gates.anchor.test.ts` | Y1-2·2b·2c · Y1-3 parity 30칸 · Y1-6 · Y2-1 — GREEN |
| RTL `deemed-acquisition-notice.anchor.test.tsx` | Y1-4a·4b·4c 7/7 |
| 기존 테스트 | `stock-carryover-sale-case-gates` CO-7(의제일 당일 차단으로 경계 이동 — 종전 «1986-01-01 저장값» 전제 제거) · CO-8(레거시 저장값 → 원 날짜 1985-09-13)만 수정. `case-49-unlisted-exchange` 등 값 변경 0 |
| 뮤테이션 probe 12건 | leaf 분류 무시 · 술어 `>=`→`>` · parity 다목 누락 · ±3개월 원 날짜 · R-1 no-op · ⑧/⑫/③ 인자 false · ⑤ 안내 분류 무시 · 배지 키 · Y-2 문구 원복 · Step2 기준일 원복 — **전건 KILLED** |
| 전체 vitest | 2491 files · **27,475 passed** · 실패 0 |
| tsc · eslint | 0 · 에러 0 (경고 3건은 기존 `stock-transfer-tax-schema.ts` 미사용 import) |
| verify:legal | 392 통과 · 실패 3건은 **부동산** `TRANSFER_DECREE.*`(§155 등 — 2026-10-01 개정 신호, 이번 변경과 무관) |
| 브라우저 E2E `e2e/stock-deemed-date-other-asset.spec.ts` | 비상장 1984-06-01 → 안내 1986.1.1.·입력칸 1984 유지 → 기타자산 전환 → 1985.1.1.·§162⑦1호 → 요청 본문 원 날짜 → 결과 배지 「의제취득일적용(기타자산)」 |
| 주식 E2E 38파일 | **97 passed** |

### 10.3 남은 것 · 관찰

- §3.3(종전 배지 미발동)은 코드 경로 분석으로만 확인했고 종전 코드의 브라우저 재현은 하지 않았다.
- 🔎 관찰 — 단건 UI에서 3호 시장(상장·비상장)의 라목·다목 토글은 `isOtherAssetGroup`(`lib/calc/stock-other-asset-scope.ts:61-65`)이 **플래그가 이미 켜져 있어야** 섹션을 보여 준다. 즉 §94② 경로는 화면에서 새로 켤 방법이 없어 보인다(API·이력 복원으로만 도달). 이번 수정은 그 경로에서도 맞게 동작하도록 분류 기준으로 짰지만, 입력 경로 자체가 의도인지 «확인 필요» — 별건 후보로 기록만 한다.
- §9 범위 밖(Z-1 §176의2④ 「많은 것」 산식 · lot 모드 · 부동산 `ESTIMATED_ACQUISITION`)은 그대로다.
- 엔진 B(`stock-carryover.ts`)의 `is94_4` 인자는 인자 정합용이다 — 이월과세는 2025.1.1. 이후 증여만 대상이라 의제일 경계와 만나지 않는다.

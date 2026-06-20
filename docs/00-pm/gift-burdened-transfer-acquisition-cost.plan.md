# 증여세 마법사 — 부담부증여 양도세 취득가액 실지·환산 모드 이식 계획

> 작성일: 2026-06-20
> 대상: 증여세 마법사(`BurdenedGiftTransferSection`)의 부담부증여 채무인수분 양도소득세 계산에
> 실지취득가액(K-4)·환산취득가액(K-5) 산정 경로 추가.
> 참조 구현: 양도세 마법사(`BurdenedGiftBlock`, PR #313 `c3204754`).

---

## 0. 한 줄 요약

엔진·Zod·transfer API 코어는 **PR #313에서 이미 실지·환산을 완전 지원**한다. 증여세 탭은 그 코어를
호출하는 **증여세 전용 경로(UI + `buildGiftBurdenedTransferBody` 변환 + 폼 타입 + validation + 결과 카드)**만
이식하면 된다. 신규 엔진 계산은 0이다.

---

## 1. 배경·목표

### 1.1 현재 동작 (실측)

증여세 마법사에서 부담부증여 자산의 채무인수분(유상양도)에 대한 양도소득세를 함께 계산한다
(소득세법 §88·소령 §159, [[project_gift_burdened_transfer_tax]]).

- 흐름: `BurdenedGiftTransferSection.tsx`(⑤) → `gift-burdened-transfer-api.ts` `buildGiftBurdenedTransferBody`(④)
  → `POST /api/calc/transfer` → `BurdenedTransferTaxResultCard`(⑦).
- 취득가액 산정: **항상 "취득시 기준시가 × 채무비율"(K-1~K-3) 강제.**
  - `lib/calc/gift-burdened-transfer-api.ts:152` — `valuationMode: "sangjeungbeop_standard"` 고정.
  - 동 파일 `:143` `acquisitionPrice: 0`, `:147` `useEstimatedAcquisition: false`.

### 1.2 목표

증여재산을 **시가(§60②)로 평가**한 부담부증여에서, 취득가액을 다음 중 선택 가능하게 한다(§100① 일치원칙):
- **K-4 실지취득가액**: 증여자의 실제 취득가액 확인 시 → 실지취득가 × 채무비율 (§159①1호 본문, §97①1호가목).
  개산공제(§163⑥ 3%) 미적용, 자본적지출·양도비를 필요경비로 채무비율 안분.
- **K-5 환산취득가액**: 실지취득가 불명 시 → 자산별 양도가액 × (취득기준시가 ÷ 양도기준시가) (소령 §176의2②2호).
  개산공제 3% 적용.

### 1.3 검증 성공 기준

- [ ] 증여재산 시가 평가 + 실지 입력 → K-4 경로로 계산되고 결과 카드에 "실지취득가 × 채무비율" 산식 표시.
- [ ] 증여재산 시가 평가 + 실지 불명 → K-5 환산 산식 표시 + 개산공제 3%.
- [ ] 증여재산 기준시가 평가(현행) → K-1~K-3 그대로(**표준모드 land 미입력 차단 신설분 제외** 회귀 0).
  - ★ 표준모드(K-1~K-3) land 양도차익 안분 분모 0 기존 결함을 본 작업에서 **동시 수정**한다.
    land 양도시 기준시가 위젯 추가 + ⑧ 검사 6 신설로 기존 0 통과 입력이 이제 차단됨.
    이 부분은 회귀가 아닌 의도적 차단 신설이며, 기존 land 양도시 기준시가 미입력 anchor가 있으면
    '이제 차단되어야 함'으로 갱신 필요.
- [ ] 시가 모드 + 산정방식 미선택 / K-4 실지 미입력 → validation 차단(자동 fallback 금지, [[feedback_no_silent_apportion_fallback]]).
- [ ] **표준모드 land 분모 0 기존 결함 동시 수정**: land 양도시 기준시가 미입력 → 시가/기준시가 모드 공통으로 차단.
- [ ] `tsc --noEmit` 0건 + 기존 부담부증여 anchor·E2E 회귀 0 (land 차단 신설분 제외).

---

## 2. 법리 (KoreanLaw 검증 대상 — Do 전 재확인)

> 모든 조문 인용은 Do 착수 전 KoreanLaw MCP로 본칙까지 재검증한다([[feedback_korean_law_citation_verify]]·`korean-law-citation-verify` 스킬).
> 아래는 [[project_burdened_gift_acquisition_cost_plan]](양도세 계획)에서 본문 확인을 거친 결론을 재인용.

| 조문 | 내용 | 적용 |
|---|---|---|
| 소득세법 §88 | 부담부증여 채무인수분 = 유상양도 | 양도가액 B = 채무인수액 |
| 소령 §159①1호 본문 | 양도가액·취득가액을 실지거래가액으로 안분 | K-4 게이트 |
| 소령 §159①1호 **A괄호** | **증여재산을 §61①②⑤·§66 기준시가로 평가하면 취득가액도 기준시가 강제** | **K-1~K-3 ↔ K-4/K-5 분기의 진짜 게이트** |
| 소령 §176의2②2호 | 환산취득가액 = 양도가액 × (취득기준시가 ÷ 양도기준시가) | K-5 산식 |
| 소령 §163⑥ | 개산공제(취득가액 × 3%) | K-1~K-3·K-5 적용 / K-4 미적용 |
| 소득세법 §100① | 양도가액을 시가로 산정하면 취득가액도 실지/환산 | 일치원칙 |
| 소령 §163⑨ 본문 단서 | 상속·증여(**부담부증여 채무액분 포함**, 상증법 §34~§39·§39의2·§39의3·§40·§41의2~§41의5·§42·§42의2·§42의3 증여 제외)받은 자산의 §97①1호가목 적용 시 → 그 상속개시일·증여일 현재 §60~§66 평가액을 **취득당시 실지거래가액으로 의제** | K-4 실지취득가 의제 분기 (의제취득 케이스) |

### 2.1 ★ §163⑨ — 본문 단서 정정 (KoreanLaw 본칙 재검증 완료, MST 286211 시행 20260522)

**★ 정정(high): 기존 '§163⑨ 적용 배제·인용 금지' 단정은 철회한다.** KoreanLaw MCP로 §163⑨ 본칙 본문을 직접 확인한 결과:

> "⑨상속 또는 증여(법 제88조제1호 각 목 외의 부분 후단에 따른 **부담부증여의 채무액에 해당하는 부분도 포함**하되,
> 「상속세 및 증여세법」 제34조부터 제39조까지, 제39조의2, 제39조의3, 제40조, 제41조의2부터 제41조의5까지, 제42조,
> 제42조의2 및 제42조의3에 따른 증여는 제외한다)받은 자산에 대하여 법 제97조제1항제1호가목을 적용할 때에는
> 상속개시일 또는 증여일 현재 ... §60부터 §66까지 ... 평가한 가액 ... 을 취득당시의 실지거래가액으로 본다."

즉 §163⑨은 수증자 재양도 **전용이 아니다**. **부담부증여 채무액분(=증여자 양도)에도 명시적으로 적용**되는 취득가액 의제
규정이며, 단 상증법 §34~§39·§39의2·§39의3·§40·§41의2~§41의5·§42·§42의2·§42의3에 따른 증여는 제외된다.

**의미(K-4 실지취득가 경로)**: 증여자의 당초 취득 자체가 **(위 제외 대상이 아닌) 상속·증여**인 경우, 그 자산의 실지취득가액은
일반 유상취득가가 아니라 **§163⑨에 따라 그 상속개시일·증여일 평가액으로 의제**된다. plan은 이 의제취득 분기를 enumerate하지 않았다.

**본 작업 처리 방침**: 본 작업은 **증여자의 당초 취득이 일반 유상취득(매매)인 경우를 전제**한다.
§163⑨ 의제취득 케이스(당초 취득이 제외 대상 외 상속·증여)는 **이번 범위 SCOPE OUT**(§8에 명문화)으로 두되,
**'§163⑨ 인용 금지'라는 종전 단정은 오류이므로 제거**한다. K-5 환산 제약의 게이트가 §163⑨이 아니라
**§159①1호 A괄호**라는 점은 유효하다(이는 환산 게이트에 관한 별개 논점). 결과 카드/validation에서 §163⑨을 인용해야 할 경우
위 본문 단서를 재확인 후 정확히 인용한다.

---

## 3. 케이스 매트릭스 (분기축 = 증여재산 평가방식)

| 경로 | 증여재산 평가 | acquisitionMethod | 취득가액 산식 | 개산공제 | 비고 |
|---|---|---|---|---|---|
| K-1~K-3 | 기준시가(§61①②⑤·§66) | (없음) | 취득기준시가 × B/C | 3% | **현행 — 회귀 보존** |
| K-4 | 시가(§60②) | `"actual"` | 실지취득가 × B/C | 미적용(+실비) | §159①1호 본문 |
| K-5 | 시가(§60②) | `"converted"` | 양도가액 × 취득기준시가/양도기준시가 | 3% | §176의2②2호 |

- B = 채무인수액(`item.assumedDebtForGift`), C = 증여재산 평가액(분모).
- 엔진은 이 3분기를 이미 구현(`burdened-gift-apportionment.ts:278-334`). 증여세 경로는 enum·평가액만 올바로 넘기면 됨.
- **K-4 실지취득가 필드**: 증여 탭은 모든 부동산 category(land 포함)에서 `actualAcquisitionTotal` 단일 필드.
  `actualLandAcquisitionPrice`/`actualBuildingAcquisitionPrice`는 양도세 스키마 호환 위해 타입 보존, 증여 탭 미사용.
  land는 `buildingStdPriceAtAcquisition=0`이므로 엔진 자동배분 시 토지 전액 배분 성립.

---

## 4. 갭 분석 (양도세 ✅ vs 증여세 ❌)

### 4.1 이미 완비 (재사용, 신규 0) — 양도세 PR #313 산출물

| 레이어 | 위치 | 상태 |
|---|---|---|
| 엔진 분기(K-4/K-5/standard) | `burdened-gift-apportionment.ts:278-351` | ✅ |
| 엔진 input 타입 | `transfer-burdened-gift.types.ts:145-152` (`acquisitionMethod`, `actual*AcquisitionPrice`) | ✅ |
| 엔진 result echo | 동 `:226,272-286` (`acquisitionMethodUsed`, `perAsset.*.actualAcquisition`) | ✅ |
| Zod 입력 | `transfer-tax-burdened-gift-schema.ts:26-45` | ✅ |
| 환산 산식 헬퍼 | `tax-utils.ts calculateEstimatedAcquisitionPrice` | ✅ |

→ **증여세 경로가 transfer body에 `valuationMode: "sangjeungbeop_market"` + `acquisitionMethod` + `actual*` + 자산별 기준시가를 올바로 실으면 엔진이 그대로 계산한다.** (단, K-4 실비 2종은 `burdenedGiftInfo` payload 밖 — body 최상위로 별도 전송, §6④·§7 참조.)

### 4.2 증여세 탭에 추가 필요 (이번 작업 범위)

> ★ 이 표의 파일:줄 번호는 작성 시점 기준이며 실제 코드와 어긋날 수 있다.
> **정확 행번호는 engine 설계 문서(`gift-burdened-transfer-acquisition-cost.engine.design.md`)를
> 단일 진실로 위임**한다. Do 착수 전 해당 파일을 직접 Read하여 현행 줄 번호를 확인할 것.

| # | 동기화 지점 | 파일 | 작업 |
|---|---|---|---|
| ① | 폼 타입 `BurdenedGiftTransferTaxInput` | `lib/tax-engine/types/inheritance-gift-estate.types.ts` (줄 번호: engine 설계 참조) | 평가모드·산정방식·실지가·실비 필드 추가 |
| ② | 초기값 `createEmptyBgt()` | `BurdenedGiftTransferSection.tsx` (줄 번호: engine 설계 참조) | 신규 필드 초기값 |
| ③ | normalize | (증여 자산 normalize 지점 — Do 시 확인) | number 신규 필드 fallback |
| ④ | API 변환 `buildGiftBurdenedTransferBody` | `lib/calc/gift-burdened-transfer-api.ts` (줄 번호: engine 설계 참조) | `valuationMode` 게이트 해제 + 실지·환산 매핑 |
| ⑤ | UI 위젯 | `BurdenedGiftTransferSection.tsx` | 평가모드 토글 + 산정방식 RadioCardGroup + K-4/K-5 박스 |
| ⑧ | validation | `gift-tax-form-shared.tsx` (줄 번호: engine 설계 참조) | 시가모드 산정방식 필수·K-4 실지 미입력 차단 |
| ⑦ | 결과 카드 | `BurdenedTransferTaxResultCard.tsx` | 3경로 산식 분기 표시 |

---

## 5. ★ 핵심 설계 결정 (✅ 확정 — 2026-06-20 사용자 승인)

### 결정 1 ✅ 독립 라디오 (옵션 A 채택)

증여재산 평가모드(시가 ↔ 기준시가) 게이트를 **부담부증여 섹션 내 독립 RadioCardGroup**으로 노출한다
(양도세 `BurdenedGiftBlock.tsx:198` `bgValuationMode` + `bgMarketValueAtTransfer`와 동형).

- `BurdenedGiftTransferSection`에 "증여재산 평가방식" RadioCardGroup(기준시가/시가) 추가.
- 시가 선택 시: 시가 평가액(분모 C) 입력 + "취득가액 산정방식"(K-4 실지/K-5 환산) RadioCardGroup 노출.
- 기준시가 선택(기본) 시: 현행 K-1~K-3 그대로(회귀 보존).
- 분모 C(시가 평가액)는 신규 필드(`marketValueAtTransfer`)로 두되, `item.standardPrice` 양방향 패턴([[mirror-pattern]])과
  충돌하지 않게 분리. Do 시 평가 섹션과의 관계 정밀 설계(시가 평가 자산은 평가 섹션 marketValue와 중복 입력될 수 있음 → 안내).

### 결정 2 ✅ 토지 포함 (옵션 B 채택) — 단위 비대칭 해결 필요

토지(land)도 이번 범위에 포함한다. 단 **현재 토지의 단위 비대칭을 먼저 해소**해야 K-4/K-5가 성립한다(§6.5 참조).

> 결정 3(공통화 강도)만 미해결로 §13에 잔존.

---

## 6. 변경 상세 (옵션 A 기준)

### ① 폼 타입 (`BurdenedGiftTransferTaxInput`, inheritance-gift-estate.types.ts)

추가 필드 (양도세 `bg*` 대응, 증여세 객체 내부이므로 prefix 없이):
- `valuationMode?: "sangjeungbeop_standard" | "sangjeungbeop_market"` (기본 standard = 회귀 보존)
- `marketValueAtTransfer?: number` (시가 모드 분모 C)
- `acquisitionMethod?: "actual" | "converted"`
- `actualAcquisitionTotal?: number` — K-4 실지취득가 단일 필드 (**land 단일 진실 확정**)
  - land·building·apt 모두 이 단일 필드 사용. 엔진이 취득기준시가 비율로 토지/건물 자동 배분.
  - `actualLandAcquisitionPrice?` / `actualBuildingAcquisitionPrice?` — 양도세 스키마 호환 위해 타입 보존;
    증여 탭 변환·validation·UI 미사용. land는 buildingStdPriceAtAcquisition=0이므로 엔진 자동배분 시 토지 전액 배분.
- `capitalExpenditure?` / `transferExpense?: number`
  - ★ 이 두 필드는 폼/`item` 보관은 가능하나, ④ API 변환 시 transfer body **최상위**로 매핑한다(§6④ 정정 참조).
    `burdenedGiftInfo` 객체 안에 넣지 말 것 — 엔진은 top-level(`rawInput.capitalExpenditure`)에서 읽는다.

### ④ API 변환 (`buildGiftBurdenedTransferBody`)

- `gift-burdened-transfer-api.ts:152` 고정값 해제:
  `valuationMode: bgt.valuationMode === "sangjeungbeop_market" ? "sangjeungbeop_market" : "sangjeungbeop_standard"`.
- 시가 모드일 때 `burdenedGiftInfo`에 `acquisitionMethod`·`actual*AcquisitionPrice`·분모 C(`marketValueAtTransfer`) 매핑.
  미입력 시 `undefined`(자동 0 금지).
- **★ 정정(critical): `capitalExpenditure`·`transferExpense`(K-4 실비)는 `burdenedGiftInfo` 객체 안이 아니라 transfer
  body **최상위 키**(`body.capitalExpenditure`/`body.transferExpense`, `gift-burdened-transfer-api.ts:171` `expenses:0` 옆)로
  매핑한다.** 엔진 STEP 0.48(`transfer-tax-burdened-gift-step.ts:40-41`)이 `rawInput.capitalExpenditure`/
  `rawInput.transferExpense` 즉 **top-level**에서 읽고, `burdened-gift-apportionment.ts:342`도 `params.capitalExpenditure`
  (top-level)를 사용한다. 양도세 참조구현도 이 두 필드를 `BurdenedGiftInfoPayload`에 넣지 않고
  body 최상위로 전송한다(`transfer-tax-api.ts:338-348`이 `burdenedGiftInfo`의 형제 `:620`로, Zod `transfer-tax-schema.ts:117,119`도
  top-level 정의). **`burdenedGiftInfo` 안에 넣으면 Zod가 침묵 strip(⑫⑬⑭ TS 미감지)하여 엔진이 K-4 실비를 영원히
  읽지 못해 K-4 결과가 틀린다.** (입력값 보관 위치를 `item`에 두는 것은 설계 권한이나, transfer body 매핑은 반드시 최상위.)
- 양도세 `transfer-tax-api-burdened-gift.ts:67-170 buildBurdenedGiftInfo`와 **`BurdenedGiftInfoPayload` 형상이 동일**(단,
  실비 2종은 payload 밖 — §7 참조)하므로 §7 공통화 검토.

### ⑤ UI (`BurdenedGiftTransferSection`)

`BurdenedGiftBlock.tsx:209-295` 패턴 차용:
- "증여재산 평가방식" RadioCardGroup(기준시가/시가) — emerald/violet tone.
- 시가 선택 시: 시가 평가액 입력 + "취득가액 산정방식" RadioCardGroup(K-4 실지/K-5 환산).
- K-4 박스: assetKind 분기 실지가 입력 + 자본적지출·양도비(amber tone, "개산공제 미적용" 안내).
- K-5 박스: 환산 안내 텍스트(입력 없음, "개산공제 3% 적용").
- `RadioCardGroup`/`ToggleCard` 필수, native 금지(components/calc CLAUDE.md).

### ⑧ validation (`gift-tax-form-shared.tsx`)

양도세 `transfer-tax-validate-bg.ts:59-95` 규칙 이식:
- 시가 모드 + 산정방식 미선택 → 차단.
- K-4 실지 미입력(assetKind별) → 차단.
- K-5 시가 모드 → 양도시·취득시 기준시가 필수.
- **UI 통과 ↔ validate 차단 모순 금지**([[feedback_validation_sync_8th_point]]). API fallback ↔ validate fallback 일치.

### ⑦ 결과 카드 (`BurdenedTransferTaxResultCard`)

**★ 정정(high): '표시만 추가'가 아니다 — 데이터 출처 배선이 필요하다.**
`BurdenedGiftDetailCard`는 prop이 `breakdown: TransferBurdenedGiftBreakdown`(전체 서브엔진 객체, 파일 `:35-51`)인 반면,
증여세 카드 `BurdenedTransferTaxResultCard`는 `transferTaxResults: TransferTaxResult[]`만 받아 현재 flat 필드
(`transferGain`·`taxableGain`·`usedEstimatedAcquisition` 등, `:59-195`)만 읽는다. 그리고 `acquisitionMethodUsed`는
result 최상위가 아니라 **`result.transferBurdenedGiftBreakdown?`**(optional, `transfer.types.ts:784`)에 중첩되어 있고,
현재 카드는 `transferBurdenedGiftBreakdown`을 **전혀 참조하지 않는다(grep 0건)**. 따라서 단순 컴포넌트 복제로는 동작하지 않는다.

**작업**: `result.transferBurdenedGiftBreakdown?`(optional)에서 `acquisitionMethodUsed`를 **undefined 가드와 함께** 새로 읽어
`standard_price`/`actual`/`converted` 3분기 산식을 표시한다. 다음 두 방안 중 택일(Do 시 결정):
- (a) `breakdown`이 있으면 `BurdenedGiftDetailCard`를 `result.transferBurdenedGiftBreakdown`으로 그대로 렌더.
- (b) `BurdenedTransferTaxResultCard` 내부에서 `acquisitionMethodUsed` 분기 행을 직접 추가.

`breakdown` undefined(기준시가 모드 K-1~K-3 / legacy) 시 **fallback 표시**(현행 flat 필드 산식)도 정의한다.

### 6.5 ★ 토지(land) 단위 비대칭 해결 (결정 2 채택에 따른 필수 작업)

**현황(실측)**: 증여세 부담부증여 토지는 취득시 기준시가만 `LandPriceLookupField`로 입력하고
(개별공시지가 원/㎡ + 면적 + 연도 → 토지기준시가 자동 산출 포함, components/calc CLAUDE.md),
**양도시 토지 기준시가는 노출·validate 범위 외**다(`gift-tax-form-shared.tsx:301`에서 land 제외).
K-4/K-5는 자산별 **취득시·양도시 기준시가 총액 둘 다** 필요하므로 양도시 토지 기준시가 입력을 추가해야 한다.

**설계 방향(양도세 land 경로 동형, `transfer-tax-api-burdened-gift.ts:138-155` 참조)**:
- 증여세 토지에 **양도시 토지 기준시가** 입력 추가 — `LandPriceLookupField`(원/㎡ × 면적 → 총액) 또는 면적×단가.
  취득시와 **동일 단위(총액 원)**로 맞춘다.
- **K-4 토지 실지취득가는 `actualAcquisitionTotal` 단일 필드** (land 단일 진실 확정 — `actualLandAcquisitionPrice` 미사용).
- K-5 토지 환산 = 토지 양도가액 × (취득 토지기준시가 ÷ 양도 토지기준시가). ★ 이중 floor 주의([[feedback_floor_residual_absorption]]).
- **단위 통일 범위**: 취득시(`standardPriceAtAcquisition`)·양도시(`landStdPriceAtTransfer`) **양 시점 동시** 통일.
  단일 기준 확정 작업항목: "취득시·양도시 두 `LandPriceLookupField` 위젯에 `area={item.areaSqm}` 동시 전달
  + 타입 주석 '총액' 명시". [[feedback_3point_input_consistency]] 준수.
- validation: land는 **표준모드·K-5 모두** 양도시 토지 기준시가 필수화
  (`gift-tax-form-shared.tsx` land 예외 해제 → 검사 6으로 일원화).
  기존 "기준시가 모드 K-1~K-3는 현행 유지"는 land에도 이제 미입력 차단이 필요하므로 폐기.

**★ Do 전 정밀 확인(anchor로 확정)**:
- `LandPriceLookupField`가 저장하는 값이 **총액(원)인지 단가(원/㎡)인지** — 조사에서 보고가 상충(총액 vs 단가).
  `standardPriceAtAcquisition`(토지)의 실제 단위를 grep + anchor로 확정 후 양도시 필드 단위를 일치시킨다.
- [[feedback_3point_input_consistency]]: 다시점 기준시가는 면적-곱 총액(원) 기준으로 통일, ㎡단가 혼용 금지.

---

## 7. 공통화 전략 (드리프트 방지, [[single-source-engine-helper]])

양도세 `buildBurdenedGiftInfo`(`transfer-tax-api-burdened-gift.ts`)와 증여세 `buildGiftBurdenedTransferBody`의
실지·환산 매핑은 **동일한 `BurdenedGiftInfoPayload`(실비 제외)를 생성**한다. payload 매핑부(acquisitionMethod·actual*)를
**공통 헬퍼로 추출**해 양쪽이 import하면, 향후 한쪽 수정 시 드리프트를 차단한다.

- **★ 정정(high): 실비(`capitalExpenditure`·`transferExpense`)는 `BurdenedGiftInfoPayload`의 멤버가 아니다**
  (`transfer-tax-api-burdened-gift.ts:14-57` 참조 — payload에 두 필드 없음). 양도세는 이 둘을 body 최상위로 전송한다.
  따라서 **공통 헬퍼는 `BurdenedGiftInfoPayload`의 `acquisitionMethod`·`actual*`만 산출**하고,
  **실비 2종은 payload 밖 — body 최상위로 별도 전달**한다. "단일 헬퍼가 payload + 실비를 함께 산출"한다는 전제는 깨지므로 채택 금지.
- 단, 두 입력 소스(양도세 `AssetForm` vs 증여세 `BurdenedGiftTransferTaxInput`)의 필드명이 다르므로,
  공통 헬퍼는 "정규화된 중간 입력"을 받는 형태로 설계. 과설계 주의 — 매핑이 단순하면 복제 후 anchor로 동치 보장도 허용.

---

## 8. SCOPE OUT

- §114의2 환산취득 5% 가산세 (양도세 쪽도 별도 PR로 분리됨).
- **§163⑨ 의제취득 케이스** — 증여자의 당초 취득 자체가 (상증법 §34~§42의3 제외 대상 외) **상속·증여**인 경우,
  K-4 실지취득가 = 그 상속개시일·증여일 §60~§66 평가액으로 의제됨(§2.1 참조). 본 작업은 **일반 유상취득 전제**이므로 이 분기는 제외.
  (종전 '수증자 재양도(§163⑨)' 표현은 §163⑨ 본문 단서 오해로 정정 — §163⑨은 부담부증여 채무액분에도 적용됨.)
- 다자산 부담부증여 양도세(현행 단일 자산 제약 유지, `gift-tax-form-shared.tsx:280`).

---

## 9. Pre-Do anchor 계획 ([[feedback_pre_anchor_verification]] · `pre-do-anchor-verification`)

Do 착수 전, 증여세 경로 전용 anchor 1~2건을 우선 작성·실행해 디자인 환류:
- **A-K4**: 증여재산 시가 평가 + 실지취득가 입력 → `buildGiftBurdenedTransferBody` body 형상 단위 테스트
  (`acquisitionMethod:"actual"` + `actualAcquisitionTotal` 전달 확인) + 엔진 통합 anchor(실지 × 채무비율, 개산공제 0).
- **A-K5**: 시가 평가 + 실지 불명 → 환산취득가(양도가액 × 취득기준시가/양도기준시가) + 개산공제 3%.
  ★ 이중 floor 주의([[feedback_floor_residual_absorption]]·[[feedback_safemul_decimal_apportion_precision]]).
- **A-회귀**: 기준시가 평가(현행) → K-1~K-3 결과 불변(기존 anchor 재실행).
- anchor 위치: `__tests__/tax-engine/transfer-tax/gift-burdened-transfer-*.test.ts` (기존 body 형상 anchor 옆).

---

## 10. 테스트 계획

- **단위(body 형상)**: `gift-burdened-transfer-api.test.ts`에 K-4/K-5/standard 3경로 body 매핑 anchor.
- **엔진 통합**: `calculateTransferTax` 결과 원단위 toBe (실지·환산 각 1건 + 회귀 1건).
- **E2E**: `e2e/gift-burdened-transfer.spec.ts` 확장 — 증여재산 시가 라디오 → 산정방식 라디오 → K-4 입력 / K-5 안내 / 되돌림 시 숨김.
  - ★ E2E 함정([[project_gift_burdened_transfer_tax]]): `setupTransferApiMock`은 Zod 우회 → body 형상 단위 anchor가 회귀 가드.
  - ★ worktree E2E는 `E2E_PORT` 격리([[feedback_e2e_worktree_port_isolation]]).
- **회귀**: 작업 전 `npm test` baseline → 작업 후 대조([[feedback_e2e_preexisting_failures]]).

---

## 11. 리스크·함정 (메모리 정책)

| 리스크 | 정책 | 대응 |
|---|---|---|
| 시가모드/실지 미입력 자동 0 안분 | [[feedback_no_silent_apportion_fallback]] | 미입력 = validation 차단, 자동 fallback 금지 |
| 양방향 standardPrice 미러 무한루프 | [[mirror-pattern]]·[[feedback_useeffect_store_mirror_forbidden]] | display fallback + onChange 직접, useEffect→store 금지 |
| K-5 이중 floor 1원 오차 | [[feedback_floor_residual_absorption]] | landTransferPrice 재floor 금지, 자산별 ±1 허용 anchor |
| 14지점 누락(⑫⑬⑭ TS 미감지) | [[feedback_api_zod_schema_sync]] | Zod·body spread·route 매핑 grep 자가점검 |
| 조문 인용 추정 | [[feedback_korean_law_citation_verify]] | KoreanLaw MCP 본칙 검증. ★§163⑨은 부담부증여 채무액분 포함(인용 금지 단정 철회, §2.1) — 의제취득 케이스만 SCOPE OUT |
| 명시 prop 매핑 신규 optional 누락 | [[feedback_explicit_prop_mapping_strip]] | spread 우선 + grep |
| ★ 표준모드 land 분모 0 기존 결함 수정 — 회귀 오인 위험 | [[feedback_no_silent_apportion_fallback]] | 기존 land 미입력 테스트는 '이제 차단됨'으로 갱신. 이 차단은 의도적 수정이므로 회귀 아님. baseline 대조 시 land 케이스 별도 확인 필요. |

---

## 12. 작업 순서 (PDCA Do — 시퀀셜)

1. Pre-Do anchor(§9) 작성·실행 → 실패 확보 → 디자인 환류. **verify: anchor 빨강.**
2. ① 폼 타입 + ② 초기값 + ③ normalize. **verify: tsc 0.**
3. ④ API 변환(valuationMode 게이트 + 실지·환산 매핑) + §7 공통화 판단. **verify: A-K4/A-K5 body anchor 통과.**
4. ⑧ validation. **verify: 미입력 차단 테스트.**
5. ⑤ UI(평가모드·산정방식·K-4/K-5 박스). **verify: E2E.**
6. ⑦ 결과 카드 3경로. **verify: 표시 anchor.**
7. 전체 `npm test` + tsc + lint + 14지점 grep 자가점검. **verify: 회귀 0.**

---

## 13. 미해결 질문

- ✅ 결정 1(평가모드 게이트): **독립 라디오** 확정.
- ✅ 결정 2(토지 범위): **토지 포함** 확정 (§6.5 단위 비대칭 해결 선행).
- ⬜ **결정 3 (공통화 §7)**: 양도세/증여세 실지·환산 매핑을 공통 헬퍼로 추출 vs 복제+anchor 동치?
  → Do 시 매핑 복잡도 보고 판단 권고(단순하면 복제+anchor, 분기 많으면 헬퍼).

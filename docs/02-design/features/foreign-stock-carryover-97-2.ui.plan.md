# 국외주식 이월과세(§97의2①) — 부록 B — UI·클라이언트(①~⑧)

> 본문: [foreign-stock-carryover-97-2.plan.md](foreign-stock-carryover-97-2.plan.md). **Q·V 번호는 이 부록 안에서만 쓰는 번호다** — 통합 결정 레지스터는 본문 §4를 따른다(본문이 우선).

> **범위**: 14개 동기화 지점 중 클라이언트 8개(①폼 ②initial ③normalize ④API 변환 ⑤위젯 ⑥사이드바 ⑦결과 ⑧validate). ⑨~⑭(Zod·body spread 수신·Route 매핑)와 엔진·타입 필드명은 **엔진·API 파트**가 쓴다 — 여기서는 UI가 엔진 파트에 요구하는 계약만 §9에 적는다.
> **기준 트리**: `/Users/mynote/workspace/Property-related-Taxes-fs-carryover` (HEAD `705aad282dffa9f320238a65f430ec487e7d9d73`). 아래 file:line은 전부 이 트리에서 열어 확인한 값이다.
> **검증 수준 표기**: 「코드 읽기」= 파일을 열어 확인 · 「실행 미확인」= probe·E2E로 돌려 보지 않음 · 「확인 필요」= V-n 레지스터. 이 문서는 코드를 고치지 않았다.
> **필드명 표기**: `(후보)` 는 엔진 파트와 **맞출 것**. 국내 이월과세 필드명을 그대로 재사용하는 것은 `(재사용)`.

---

## 0. 한 줄 요약

국내 이월과세 입력 중 **단위가 같은 것**(증여자 취득일·관계·사망·증여세 3종)은 국내 위젯에서 **공용 leaf 2개로 뽑아** 국외 폼에 그대로 꽂고, **단위가 갈리는 것**(증여자 취득가액·자본적지출)만 국외 고유 필드로 둔다. 입력은 국외 마법사의 기존 원칙(「입력 = 그 단계의 주제」, 계획서 `docs/00-pm/foreign-stock-wizard-step-realign.plan.md` §3)에 맞춰 **Step1(게이트) → Step2(증여자 취득가액) → Step3(자본적지출·증여세)** 로 나눈다. 결과는 기존 A/B 비교 카드를 국외 변형으로 재사용하고, **다건 모드의 「마지막 종목만 카드 표시」 한계**가 혼합 시나리오의 핵심 리스크다(§6.3).

---

## 1. 실측 — 지금 어디에 무엇이 있나 (코드 읽기)

### 1.1 국내 이월과세 UI 지도 (재사용 후보)

| 위치 | 내용 | 국외 재사용성 |
|---|---|---|
| `components/calc/stock-transfer/AcquisitionInfoBlock.tsx:191-194` | 취득원인 라디오의 `carryover_gift` 옵션 | 국외 폼에는 취득원인 라디오가 **없다**(§1.2) — 게이트만 별도 |
| `:243-441` | `cause === "carryover_gift"` nested 카드 전체 | 아래 4분할 |
| `:245-255` 증여자 취득일 `DateInput` + `DeemedDateNotice`(`:53-65`, 의제취득일 1986.1.1. 안내) | 날짜 단위 중립 | ✅ 공용 leaf (`DeemedDateNotice`는 slot으로 분리 — V-8) |
| `:256-262` 안내문(2025.1.1. 개정·1년 요건) | 중립 | ✅ 공용 leaf |
| `:265-285` 관계 `RadioCardGroup` (배우자/직계존비속/그 밖) · `:287-301` 사망 `ToggleCard` | 중립 | ✅ 공용 leaf |
| `:306-387` 증여자 취득가액 산정 방식(실가/매매사례/환산) + 1주당 **원** 입력 + 기준시가 | 원화·국내 기준시가 개념 | ❌ 국외 부적합(§4.3) |
| `:390-399` 증여자 자본적지출 (`CurrencyInput` 원) | 원화 | ❌ 단위 갈림 |
| `:402-431` 증여세 산출세액·양도한 해당 자산가액·증여세 과세가액 (`CurrencyInput` 원) | 증여세는 원화 — 국외도 동일 | ✅ 공용 leaf |
| `:432-439` 한도·②3호 안내문 | 「그때는 **세율 보유기간도** 수증일 기산으로 돌아갑니다」 문장 포함 | ⚠️ 국외는 단일세율(20%·§104①12호)이라 이 문장이 **틀린다** → leaf에 `showHoldingPeriodNote` prop |
| `components/calc/stock-transfer/AcquisitionLotCard.tsx:184-259` | 분할(lot)용 같은 입력의 **복사본**(`CurrencyInput` 원) | 국외는 lot 없음 — 건드리지 않음 |
| `components/calc/stock-transfer/CarryoverDonorConversionSection.tsx:33-103` | Step2에서 환산 **분모** 입력(양도 당시 기준시가) | ❌ 국외는 환산(나목) 경로 없음(§4.3) |
| `components/calc/results/StockCarryoverComparisonCard.tsx:34-141` | A/B 비교 카드(violet ToneCard) | ✅ 재사용하되 variant(§6.2) |
| `components/calc/results/StockTransferTaxResultView.tsx:595-597` | `result.carryoverDetail`이 있으면 카드 렌더 | 국외 단건 경로는 이 뷰를 **타지 않는다**(§1.3) |

단위 분류: 같은 이름·같은 단위(원)인 필드는 `donorAcquisitionDate`·`donorRelation`·`donorDeceased`·`giftTaxAmount`·`transferredAssetValue`·`giftTaxableValue`. 국내 `donorAcquisitionPrice`·`donorCapitalExpenditure`는 **1주당 원 / 총액 원**이라 국외의 「외화 + 환율」과 단위가 다르다.

### 1.2 국외 화면 지도

| 단계 | 파일:줄 | 현재 내용 |
|---|---|---|
| Step1 | `app/calc/stock-transfer-tax/steps/Step1.tsx:206-212` → `ForeignStockIdentityBlock.tsx` | §1 납세의무(`:23-53`) · §2 기본 양도 정보(`:56-127`: **취득일 `:58-63`**·양도일·주식수·발행국가·외국법인 토글·중소기업 토글). `acquisitionCause` 칸 없음, 이후 섹션은 `return items`로 **조기 종료**(`Step1.tsx:212`) |
| Step2 | `Step2.tsx:152-154` → `ForeignStockPriceBlock.tsx` | §1 양도가액(`:38-175`) · §2 취득가액(`:178-264`: 모드·통화·**취득일 기준환율**·1주당 외화 취득가액·원화 환산 미리보기) |
| Step3 | `Step3.tsx:222-227` → `ForeignStockExpenseBlock.tsx` | 필요경비 SectionBox(`:45-107`: 자본적지출 외화 + **지출일 환율**(금액>0일 때만 표시 `:58-76`) · 양도비) · 외국납부세액 ToggleCard(`:110-176`) |
| Step4 | `Step4.tsx:199-226` | 단건 해외주식 → `ForeignStockFilingFormSection` + `ForeignStockResultCard` (**국내 `StockTransferTaxResultView`를 타지 않음**). 다종목(`aggregate`)이면 `:162-163`에서 통합 결과뷰 |

국외 폼은 **국내와 같은 `StockTransferFormData` 한 객체**(평탄)를 쓴다 — 국외 필드 `form-types.ts:480-540`, 국내 donor 필드 `:110-137`. 그래서 `acquisitionCause`·`donor*`·`giftTax*`는 **폼에는 이미 있고** 국외 body·validate·UI가 안 읽을 뿐이다.

### 1.3 결과·다건·API 경로 (코드 읽기)

- 단건 국외: `buildStockTransferApiBody`가 `marketType==="foreign_stock"`이면 `buildForeignStockApiBody`로 분기(`lib/calc/stock-transfer-tax-api.ts:105-109`, 빌더 본체 `stock-transfer-tax-api-foreign-exit.ts:26-150`). 다종목은 `items: forms.map(buildStockTransferApiBody)`(`api.ts:718`) — **단건·다건이 같은 빌더 한 곳**을 거치므로 ④⑬은 `buildForeignStockApiBody` 한 곳 수정으로 두 경로가 모두 닫힌다.
- 다종목에는 이미 국외가 섞인다: `ForeignStockInput`이 `aggregate`에 직접 들어가고 결과는 `toStockTransferResult`(`foreign-stock-aggregate-adapter.ts`)로 `StockTransferResult`로 변환된다. 이월과세 비교는 **국내만** 뽑아 돌린다 — `stock-transfer-aggregate.ts:240-269`의 주석 「국외주식은 이월과세 대상이 아니다 … `ForeignStockInput`에는 그 축이 아예 없다」가 **현재 코드의 전제**이고 이번 작업이 뒤집는다(V-4).
- `calc-wizard-stock-store.ts`: sessionStorage persist `name:"stock-transfer-tax-wizard"`, **version 필드 없음**(persist 옵션 `:~229-248`에 `version` 키 없음), 복원은 `onRehydrateStorage`에서 `normalizeStockFormData` + `savedItems.map(normalize)`(`:233-246`). 이력 복원도 `stock-resume-entry.ts:43,50`이 같은 `normalizeStockFormData`를 쓴다 → 마이그레이션은 ③ 하나로 닫힌다. `lib/stores/calc-wizard-migration.ts`는 `stock` 참조 0건(grep) → **수정 불필요**.
- 종목 확정 시 `carryFilingFields`(`store.ts:~88-100`)는 신고 단위 필드만 이월하고 donor 필드는 `createInitialStockFormData()`로 초기화 → 종목 간 이월과세 입력이 새지 않는다.

---

## 2. 설계 결정 (D-n) — 사용자 결정이 필요한 것은 §10의 Q-n

| ID | 결정 | 근거 |
|---|---|---|
| D-1 | 평행 UI를 새로 짓지 않는다. 증여자 취득일·관계·사망·증여세 3종은 **국내 위젯을 공용 leaf로 추출**해 국내·국외가 함께 쓴다 | 요청의 「평행 UI 신설 금지」, 메모리 `feedback_sibling_path_already_implements_rule` |
| D-2 | 단위가 갈리는 증여자 취득가액·자본적지출은 **국외 전용 필드를 새로 둔다**(국내 `donorAcquisitionPrice`를 외화로 재해석하지 않는다) | 마켓 전환 시 국내 값 30,000(원)이 외화 30,000으로 **조용히 재해석**되는 stale-단위 함정. 숨은 stale 플래그 선례: 메모리 인덱스 「BG 숨은 감정·매매사례 플래그」 계열 |
| D-3 | 입력 배치는 **계산 순서 + 국외 마법사 단계 원칙**을 따른다: 게이트(Step1) → 취득가액류(Step2) → 필요경비류(Step3). 한 카드 몰아넣기는 Q-4 | UI 순서 = 계산 로직 순서(루트 CLAUDE.md), realign 계획서 §3 |
| D-4 | 게이트 판정 술어는 **단일 leaf** `isForeignCarryoverForm(form)`(신설, `lib/calc/stock-foreign-carryover.ts`)로 ④·⑤·⑧이 공유한다. Zod(⑫)는 서버라 `data.acquisitionCause`로 같은 조건을 쓴다 | 3중 패턴(mirror-pattern), `isDonorConversionForm`(`api-carryover.ts:22-29`) 선례 |
| D-5 | ⑥ 사이드바는 **변경 없음** — 국외 분기가 입력 파생값으로 보이는 것은 양도가액 환산 참고뿐이고(`StockSidebar.tsx:179-196`), 승계 취득가액은 ②3호 비교 결과가 나와야 확정이라 「결과 도착 후」 규칙에 해당한다. 결과 후 행 목록도 취득가액 행이 원래 없다(`:199-208`) | 루트·components CLAUDE.md 「사이드바 = 계산 가능한 항목만」 |
| D-6 | store에 쓰는 `useEffect` 없음. 토글 OFF 시 값은 **지우지 않는다**(국내 `AcquisitionInfoBlock`·`ForeignStockExpenseBlock:30-36`과 같은 규약) — ④가 predicate로 막아 숨은 값이 body에 새지 않게 한다 | `feedback_useeffect_store_mirror_forbidden` |
| D-7 | 증여세 3종은 국내 필드를 `(재사용)`. 단위가 같고(원), 영 §163의2② 안분이 자산 종류와 무관 | §1.1 |

---

## 3. 재사용 이음매 — 공용화 목록

### 3.1 추출할 leaf 2개 (신규 파일, 국내 `AcquisitionInfoBlock`에서 **그대로 이동**)

| leaf | 추출 원본 | props (안) | 국내가 넘기는 값 | 국외가 넘기는 값 |
|---|---|---|---|---|
| `components/calc/stock-transfer/CarryoverGateFields.tsx` | `AcquisitionInfoBlock.tsx:245-301` (증여자 취득일 · 관계 · 사망) | `form`(Pick: `donorAcquisitionDate`·`donorRelation`·`donorDeceased`), `onChange`, `dateHint`, `dateNotice?: ReactNode`, `intro?: ReactNode` | 기존 hint 그대로 + `<DeemedDateNotice …/>` + 기존 :256-262 안내문 | 국외용 hint(「증여자 취득가액 환율 기준일」) + notice 없음(V-8) + 같은 안내문 |
| `components/calc/stock-transfer/CarryoverGiftTaxFields.tsx` | `:402-431` + 안내 `:432-439` | `form`(Pick: `giftTaxAmount`·`transferredAssetValue`·`giftTaxableValue`), `onChange`, `showHoldingPeriodNote: boolean` | `true` | `false` — 「세율 보유기간도 수증일 기산」 문장 제거 |

- **동작 보존이 조건**: 라벨·hint·`data-testid`·`RadioCardGroup name="donorRelation"`·`layout="inline"`을 한 글자도 바꾸지 않는다. 가드: `__tests__/components/calc/stock-transfer/donor-relation-radio-inline.anchor.test.tsx`(AcquisitionInfoBlock 직접 렌더), `…/deemed-acquisition-notice.anchor.test.tsx`, E2E `e2e/stock-transfer-carryover-97-2.spec.ts`(라벨 `증여자 취득가액`·`증여자와의 관계` 사용), `e2e/stock-carryover-donor-sale-case.spec.ts`.
- 국내 `AcquisitionInfoBlock`은 현재 461줄 → 추출 후 감소. 신규 파일 각각 <120줄.
- `AcquisitionLotCard.tsx:184-259`(lot 복사본)는 **이번에 건드리지 않는다**. 같은 라벨의 중복이지만 lot은 필드 접두(`lot.donor*`)와 `name` 접두가 달라 추출 범위가 커지고, 국외에는 lot이 없다(Surgical). 중복 존재 사실만 기록.
- 부동산 쪽 `components/calc/transfer/CarryoverGiftExclusionSection.tsx:56-150`에도 같은 관계·사망 위젯이 있으나 props가 `CarryoverTaxationForm`에 묶여 있고 관계 변경 시 `donorDeceased` 리셋·「그 외」 비활성 등 **주식 쪽과 동작이 다르다**(주식은 리셋 안 함) → 합치지 않는다(V-10).

### 3.2 국외 전용 컴포넌트 (신규, 합쳐서 1파일 ≈150줄)

`components/calc/stock-transfer/ForeignCarryoverBlocks.tsx` — 세 개를 export:

1. `ForeignCarryoverGateSection` (Step1 §3): `ToggleCard` + `CarryoverGateFields`.
2. `ForeignCarryoverDonorPriceSection` (Step2 §3): 증여자 취득가액(§4.2 두 안).
3. `ForeignCarryoverExpenseSections` (Step3): 증여자 자본적지출 + `CarryoverGiftTaxFields`.

기존 3개 블록(`ForeignStockIdentityBlock`·`ForeignStockPriceBlock`·`ForeignStockExpenseBlock`)은 각각 위 컴포넌트를 `isForeignCarryoverForm(form) && …`로 끼워 넣는 **호출 1~3줄만** 추가한다(각 130/267/179줄 → 한도 여유).

공용 재사용(변경 없음): `SectionBox`(`stock-section-box.tsx`, ToneCard 래퍼) · `CURRENCY_OPTIONS`(`currency-options.ts`) · `FieldCard` · `DecimalInput`(외화·환율) · `CurrencyInput`(원) · `ToggleCard` · `RadioCardGroup` · `DateInput` · `ToneCard` · `LawArticleModal`. native checkbox/radio/date 신규 없음.

---

## 4. 입력 설계

### 4.1 게이트 — Step1 (`ForeignStockIdentityBlock`) 신규 §3

게이트 필드는 국내와 **같은 `acquisitionCause`** 를 쓴다(Q-1 권고). 국외 화면에는 취득원인 라디오 전체를 노출하지 않고 **ToggleCard 하나**로 `"carryover_gift" ↔ "purchase"`만 토글한다.

```
┌ 2  기본 양도 정보 ───────────────────────────────── sky ┐
│  취득일 ▸ (토글 ON이면 라벨 「수증일」, hint 「증여받은 날 — 2025.1.1. 이후여야 §97의2①이 적용됩니다」)
│  양도일 · 양도 주식수 · 발행국가 · 외국법인 토글 · (중소기업 토글)
└──────────────────────────────────────────────────────────┘
┌ 3  증여받은 주식 — 이월과세 (§97의2①)  [§97의2] ──────── amber ┐
│ ┌ ToggleCard(amber, OFF에도 tone 배경) ─────────────────────┐
│ │ 배우자·직계존비속에게 증여받은 주식입니다 (이월과세)        [ ○ ]│
│ │ 증여받은 날부터 1년 이내 양도(§94①3호 자산)·2025.1.1. 이후     │
│ │ 증여분만 대상입니다. 적용 시 취득가액은 증여자가 취득할 당시의 │
│ │ 금액으로 승계되고 증여세 상당액이 필요경비에 산입됩니다.        │
│ └───────────────────────────────────────────────────────────┘
│   ── ON일 때만 ──
│   증여자 취득일  [연][월][일]   hint 「증여자가 취득한 날 — 2단계 증여자 취득가액의 환율 기준일입니다」
│   증여자와의 관계 ( 배우자 | 직계존비속 | 그 밖의 관계 )    ← 국내와 같은 RadioCardGroup(inline)
│   [ToggleCard] 사망으로 혼인관계가 소멸 / 증여자가 양도 당시 사망
└──────────────────────────────────────────────────────────┘
```

- 3중 패턴: store factory default `acquisitionCause:"purchase"`(`form.ts:~79`) = normalize `enumField(..., defaults.acquisitionCause)`(`normalize.ts:197`) = UI `checked={form.acquisitionCause === "carryover_gift"}`(**`||` display fallback 쓰지 않음**) = ④ predicate = ⑧ predicate.
- ⚠️ **국외 predicate는 raw `form.acquisitionCause`를 읽는다**(`effectiveSingleAcquisitionCause`를 쓰지 않는다). 그 함수는 `lotsMode==="split"`이면 「매매」로 파생하는데(`stock-acquisition-cause.ts:~118-`), 국외는 분할 모드가 없다. 국내에서 split을 쓰다 해외로 시장을 바꾸면 `lotsMode:"split"` 잔존값이 남을 수 있어(Step1 `handleLotsModeToggle`은 국외 분기에서 호출되지 않음) effective 함수를 쓰면 **화면은 ON인데 body는 미전송**이 된다. 국외 predicate는 `marketType==="foreign_stock" && acquisitionCause==="carryover_gift"` 하나(D-4).
- 토글을 OFF로 돌리면 `acquisitionCause:"purchase"`를 쓴다(국내에서 `inheritance` 등을 골라 둔 상태에서 해외로 전환하면 토글은 OFF로 보이고 body는 미전송 — 화면=body 일치).
- 사전 게이트 안내(수증일 <2025-01-01 · 양도일−수증일>1년이면 「이월과세 미적용」 파생 notice)는 **국내도 hint 문구뿐**이라 1차 범위에서 제외(Q-9). 넣는다면 `isStockCarryoverEra`·`isWithinCarryoverPeriod`(`lib/tax-engine/data/carryover-scope-era.ts`)를 import해 render 시 파생(미러링 없음).

### 4.2 증여자 취득가액·자본적지출 — **두 안 모두 와이어프레임** (엔진 결정에 따름 · Q-2)

**안 A — 외화 + 증여자 취득일 환율 (권고, 국외 마법사 일관)**: 기존 §2 「취득가액 — 원화 환산(§178의5)」과 같은 구조.

Step2 `ForeignStockPriceBlock` 신규 §3 (amber, 토글 ON일 때만):
```
┌ 3  증여자 취득가액 — 이월과세 (§97의2①1호 · 영 §178의5)  [§97의2①1호] ── amber ┐
│  ⓘ 위 「취득가액」은 증여일 평가액(영 §163⑨)이며 이월과세가 배제될 때 쓰입니다.
│     이월과세를 적용하면 아래 증여자 취득가액이 취득가액이 됩니다.
│  증여자 취득 통화        [ USD — 미국 달러 ▾ ]                    ← CURRENCY_OPTIONS
│  증여자 취득일 기준환율   [ DecimalInput ]  KRW/USD
│      hint 「1단계에 입력한 증여자 취득일의 대고객 매매기준율 (원/외화)」
│  1주당 증여자 취득가액   [ DecimalInput ]  USD     required
│      hint 「증여자가 취득할 당시의 실지거래가액 (외화 기준)」
│  ▸ 증여자 취득가액(원화 환산 참고): 50,000,000      ← 기존 :251-263 미리보기와 같은 식
└─────────────────────────────────────────────────────────────────────┘
```
Step3 `ForeignStockExpenseBlock` 필요경비 SectionBox 안(양도비 뒤, 토글 ON일 때만):
```
  증여자 자본적지출 (외화)   [ DecimalInput ]  {증여자 취득 통화}    hint 「증여자가 그 주식에 지출한 자본적지출. 양도비는 포함하지 않습니다. 없으면 비워두세요」
  └ (금액>0일 때만) 증여자 자본적지출 지출일 기준환율  [ DecimalInput ]   ← 기존 :58-76 패턴 그대로
```
그 아래 신규 SectionBox 「증여세 상당액 (§97의2①3호 · 영 §163의2②)」 = `CarryoverGiftTaxFields`(원 `CurrencyInput` 3칸, `showHoldingPeriodNote={false}`).

**안 B — 원화 직접 입력**: Step2 §3은 `CurrencyInput` 한 칸으로 줄어든다.
```
┌ 3  증여자 취득가액 — 이월과세 (§97의2①1호) ───────────────────── amber ┐
│  1주당 증여자 취득가액 (원)   [ CurrencyInput ]    required
│      hint 「증여자가 취득할 당시의 실지거래가액을 원화로 환산한 1주당 금액」
└─────────────────────────────────────────────────────────────────────┘
Step3: 증여자 자본적지출 (원) [ CurrencyInput ] — 단일 칸, 환율 칸 없음
```
- 안 B는 **국내 `donorAcquisitionPrice`·`donorCapitalExpenditure`와 단위(원)가 같아 신규 필드 0개**, 위젯도 국내 `FieldCard`+`CurrencyInput` 그대로다. 그러나 외화로 취득한 주식의 환산을 사용자에게 시키고 화면에 환율 근거가 남지 않는다(국외 마법사가 「환산을 사용자에게 시키지 않는다」고 정리한 방향과 반대 — realign 계획서 §2.3). 교재 사례(원화 5,000만)는 안 B로만 **글자 그대로** 재현된다(§8의 안 A 변환 참조).
- 어느 쪽이든 증여세 3종·관계·사망·증여자 취득일은 같다.

### 4.3 국외에서 **열지 않는** 것

- 증여자 취득가액 **산정 방식 라디오**(실가/매매사례/환산)와 증여자 취득 당시 **기준시가**, 환산 분모 섹션(`CarryoverDonorConversionSection`): 국외 엔진은 `acquisitionMode: "actual"|"market_price"`뿐이고 국내식 환산(기준시가 비율)·매매사례가액이 없다(`foreign-stock.types.ts` `acquisitionMode`). 엔진이 나목 경로를 만들면 그때 라디오를 연다(Q-3).
- 분할(lot) 입력: 국외에는 lot 개념이 없다.

### 4.4 각 입력의 활성화 조건

| 입력 | 보이는 조건 | 보이지 않을 때 값 |
|---|---|---|
| 게이트 ToggleCard | 항상(국외 Step1 §3) | — |
| 증여자 취득일·관계·사망 | `isForeignCarryoverForm` | 보존(지우지 않음) |
| 증여자 취득가액류(Step2 §3) | `isForeignCarryoverForm` | 보존, ④ 미전송 |
| 증여자 자본적지출·지출일 환율 | `isForeignCarryoverForm` / (환율은 금액>0) | 보존, ④ 미전송 |
| 증여세 3종 | `isForeignCarryoverForm` | 보존, ④ 미전송 |

---

## 5. 14지점 중 ①~⑧ — 변경 위치와 3중 패턴

필드(안 A 기준, 안 B는 ★ 표기):

| 구분 | 필드 | 타입/단위 | default |
|---|---|---|---|
| (재사용) | `acquisitionCause` | enum, 국외는 `carryover_gift`/`purchase`만 씀 | `"purchase"` |
| (재사용) | `donorAcquisitionDate` · `donorRelation` · `donorDeceased` | string / enum / boolean | `""` / `""` / `false` |
| (재사용) | `giftTaxAmount` · `transferredAssetValue` · `giftTaxableValue` | string(원) | `""` |
| 신규(후보) | `donorPerShareAcquisitionPriceForeign` (★ 안 B는 `donorAcquisitionPrice` 재사용) | string, 외화/주 | `""` |
| 신규(후보) | `donorAcquisitionCurrencyCode` (★ 없음) | string ISO | `"USD"` |
| 신규(후보) | `donorAcquisitionExchangeRate` (★ 없음) | string, 원/외화 | `""` |
| 신규(후보) | `donorCapitalExpenditureForeign` (★ `donorCapitalExpenditure` 재사용) | string, 외화 총액 | `""` |
| 신규(후보) | `donorCapitalExpenditureExchangeRate` (★ 없음) | string, 원/외화 | `""` (비우면? → Q-7) |

| # | 지점 | 변경 위치(현재 삽입점) | 내용 | 3중 패턴 메모 |
|---|---|---|---|---|
| ① | 폼 상태 타입 | `lib/stores/calc-wizard-stock-form-types.ts` — 국외 블록 `:477-540`(FS-09 `:522-` 포함) 말미에 신규 4~5개. 재사용 필드는 타입 변경 없음(`:110-137`) | 신규 필드 + 주석 「국외 이월과세 전용, `marketType==="foreign_stock"`일 때만 의미」 | — |
| ② | initial | `lib/stores/calc-wizard-stock-form.ts` — 국외 초기값 블록 `:255-282`(FS-09 `:278-`) | 문자열 `""`, 통화 `"USD"` | factory default = ③ = UI 직접 사용 = ④ `|| "USD"` = ⑧ — 표시용 `\|\|` fallback만 단독으로 쓰지 않는다(통화 `select`는 `value={form.donorAcquisitionCurrencyCode}`) |
| ③ | normalize | `lib/stores/calc-wizard-stock-normalize.ts` — 국외 `:511-552`(FS-09 `:546-`) 말미 | `strField` 3~4개 + 통화는 기존 `acquisitionCurrencyCode` 패턴(`:528-531`) 복제. 재사용 필드는 이미 정규화됨(`:198-211`) | 구형 sessionStorage·이력(`stock-resume-entry.ts:43,50`)은 새 키가 없다 → 빈 값/`"USD"`로 복원. **별도 마이그레이션 파일 없음**. 파일이 711줄이라 +~12줄 → ~725(800 미만, 분리 불필요) |
| ④ | API 변환 | `lib/calc/stock-transfer-tax-api-carryover.ts`에 `appendForeignCarryoverBody(body, form)` 신설(현재 84줄), `buildForeignStockApiBody`(`api-foreign-exit.ts:26-150`)가 **마지막에 한 줄 호출** | `isForeignCarryoverForm(form)`일 때만 `acquisitionCause`·`donorAcquisitionDate`·`donorRelation`·`donorDeceased`(true일 때만)·증여자 취득가액/통화/환율·자본적지출/환율·증여세 3종을 `parseFloatOrUndef`/`parseIntOrUndef`로 싣는다. 빈값은 **키 자체를 싣지 않는다**(0이 엔진 `??` fallback을 죽이는 기존 선례 `:67-71`) | 「자동 안분 fallback 금지」 — 환율·단가 빈값은 `undefined`로 보내 ⑧·⑫가 막게 한다. 사이드 효과 가드: 국내 `appendCarryoverDonorBody`(`:32-63`)는 **호출하지 않는다**(국내 원화 필드를 국외 body에 섞지 않음). `stock-transfer-tax-api.ts`(755줄)는 건드리지 않는다 |
| ⑤ | UI 위젯 | `ForeignStockIdentityBlock.tsx`(`:56-127` 뒤 §3 추가 + 취득일 라벨/hint `:58-63`), `ForeignStockPriceBlock.tsx`(`:178-264` 뒤 §3), `ForeignStockExpenseBlock.tsx`(`:45-107` 안에 capex 칸 + 별도 증여세 SectionBox) | §4 와이어프레임. 모든 변경은 `onChange(patch)` 직접(useEffect 없음) | tone: 게이트·증여자 가격 = amber(취득), 증여세 = amber(취득 계열 필요경비) 또는 sky(필요경비 박스 안) — Q 아님, 구현 시 기존 SectionBox tone과 맞춤 |
| ⑥ | 사이드바 | `StockSidebar.tsx:179-210` 국외 분기 | **변경 없음**(D-5). 결과 후 `result` 값을 쓰는 행들이 이월과세 값을 자동 반영 | — |
| ⑦ | 결과 | §6 | 단건: `ForeignStockResultCard`에 비교 카드, 다건: 종목별 카드 | 엔진 echo 계약은 §9 |
| ⑧ | validate | `lib/calc/stock-transfer-tax-validate-foreign.ts` — `validateStep1Foreign`(`:44-`) / `validateStep2Foreign`(`:126-`) / `validateStep3Foreign`(`:287-`)에 각각 추가 | §5.1 | ⑫와 같은 leaf를 공유(`missingAcquisitionCauseKeys`) |

### 5.1 ⑧ validate 규칙 (UI 통과 ⇒ ⑫ 통과 보장)

공용 leaf `lib/calc/stock-transfer-required-inputs.ts:90-114` `missingAcquisitionCauseKeys(cause, has)`는 `cause==="carryover_gift"`일 때 `donorAcquisitionDate`·`donorRelation`을 요구하고 `giftTaxAmount`가 있으면 `transferredAssetValue`·`giftTaxableValue`를 요구한다(국내 ⑧ `validate-step1.ts:395-420`과 ⑫가 이미 공유). 국외도 **같은 leaf를 단계별로 쪼개 호출**한다.

| 단계 | 조건 | 규칙 | severity |
|---|---|---|---|
| Step1 | `isForeignCarryoverForm` | `donorRelation` 미선택 | error (§97의2① 본문 — 국내와 같은 문구) |
| Step1 | 〃 | `donorAcquisitionDate` 미입력 | error — **단, 엔진이 이 값을 소비할 때만**(V-3·Q-5). 소비하지 않으면 필드를 만들지 않는다(유령 입력 금지) |
| Step2 | 〃 | 증여자 취득가액·통화·환율 미입력 또는 ≤0 | **error** — 국내는 환산(나목) 경로가 있어 warning(`validate-step1.ts:431-439`)이지만 국외는 환산이 없어 값이 비면 승계 효과가 정의되지 않는다(Q-3). 미입력을 조용히 0으로 두지 않음(정책 2) |
| Step3 | 〃 | `giftTaxAmount>0`인데 `transferredAssetValue`·`giftTaxableValue` 미입력 | error (영 §163의2② 안분 분자·분모) |
| Step3 | 〃 | 증여자 자본적지출 지출일 환율을 **넣었는데** ≤0 | error (기존 `checkExpenseRate` `:314-` 패턴) |
| Step3 | 〃 | 증여자 자본적지출 금액>0인데 환율 미입력 | Q-7 결정에 따름(비워 두면 양도일 환율 fallback = 기존 필요경비와 같은 정책이면 허용) |

- ⑧↔⑫ 격자 정합: Step1·Step2·Step3 ⑧ 규칙의 **합집합 ⊇ ⑫ 규칙**이어야 「UI 통과 → API 400」이 없다. 국내 선례 `__tests__/calc/stock-carryover-97-2-wiring.anchor.test.ts:240-` W-7이 같은 격자를 고정한다 → 국외판 anchor를 같은 형태로 둔다(§8).
- `validateFilingItems`(`stock-transfer-tax-validate.ts:~195-225`)는 종목마다 `validateAllSteps`를 돌려 첫 오류를 순번·종목명으로 지목하므로 다건에서도 추가 배선이 필요 없다.

---

## 6. ⑦ 결과 표시

### 6.1 단건 국외 — `ForeignStockResultCard`(`components/calc/results/ForeignStockResultCard.tsx`, 334줄)

현재 구조: 헤더 → 환율 환산 표(`:110-`) → 양도차익 계산(`:167-`) → 세율(`:216-`) → 경고(`:309-`) → 법령 배지. 추가:

1. **환율 환산 표**에 취득가액 행의 라벨/환율을 이월과세 적용 시 「증여자 취득(이월과세)」·증여자 취득일 환율로 바꿔 보인다(`result`에 적용 환율·통화 echo 필요 — §9). 현재 `:164-169`는 `— × 환율 = 원화` 형태로 외화 금액이 `—`로 가려져 있어 A/B 비교에서 검산이 안 된다 → 이월과세일 때는 외화 단가×주식수도 표기(엔진 echo).
2. **「양도차익 계산」 아래 `필요경비` 행의 sub**에 증여자 자본적지출·증여세 상당액 산입 내역 한 줄(값이 있을 때만, 0 제외).
3. **비교 카드** `StockCarryoverComparisonCard`를 「세율 적용」 카드 뒤·경고 앞에 렌더(`carryoverDetail`이 있을 때만). 카드는 `<ToneCard tone="violet">`라 정본 규칙 준수.

산식 표기: 기존 카드의 `Row` 규약(변수 약어 금지·`floor()` 미표기·**숫자 끝 「원」 없음**)을 따른다. 예) `취득가액 (원화 환산) = 증여자 1주당 취득가액 × 주식수 × 증여자 취득일 기준환율`.

### 6.2 비교 카드 variant (`StockCarryoverComparisonCard.tsx`)

| 현재 | 국외에서 문제 | 변경 |
|---|---|---|
| `:59-61` 「취득가액을 … 승계하고, **세율 보유기간도** 증여자 취득일부터 계산합니다(§104②2호)」 | 국외는 §104②2호·단기세율 없음(§104①12호 단일 20%/10%) → **오기** | 국외 variant에서 해당 문장 제거 |
| `:64-67` 배제 시 「세율 보유기간도 수증일 기산」 | 동일 | 동일 제거 |
| `:86-100` 「1주당 취득가액」 행(`donorAcquisitionPricePerShare`·`giftDateValuationPerShare`가 둘 다 있을 때만) | 국외는 주당 단가가 외화 | 국외는 **「취득가액 (원화 환산)」 행**(적용/미적용 총액)으로 대체 — 엔진이 A/B 총액 echo (§9) |
| `:19` `won()` = `…원` 접미 | `ForeignStockResultCard` 머리 주석(`:6-9`)은 「숫자 끝 원 표기 금지」 | 한 화면에 두 규칙이 공존 — 공용 카드를 **고치지 않고** 기록만(V-7). 정리하려면 별 PR |
| `:127-139` 하단 「전체 결정세액」 안내 | 국외·국내 공통, 그대로 | 유지 |

prop 안: `variant?: "domestic" | "foreign"`(기본 domestic → 국내 출력 불변). 국내 회귀 가드: 기존 카드 렌더 anchor가 있으면 그대로 통과해야 함(확인 필요 — 이 카드 전용 컴포넌트 테스트 존재 여부 미조사, V-11).

### 6.3 다건(국내+국외 혼합) — **핵심 리스크**

- 합산 계산 시 Calculator는 대표 결과로 **마지막 종목**만 둔다: `StockTransferTaxCalculator.tsx:301` `setResult(agg.items[agg.items.length - 1] ?? null)`. `Step4`는 `aggregate`가 있으면 `StockTransferTaxResultView {...resultViewProps} aggregate={aggregate}`(`Step4.tsx:162-163`)로 가고 이 뷰는 `result.carryoverDetail`(마지막 종목 것, `ResultView.tsx:595`)만 카드로 그린다. `aggregate.items`는 신고서 열 구성에만 쓰인다(`StockFilingFormTableHelpers.ts:98-117`).
  ⇒ 이월과세 종목이 **마지막이 아니면 A/B 카드가 아예 안 뜬다**(코드 읽기, **실행 미확인** — V-5). 국내 다건에도 이미 있는 한계인데 국외 이월과세가 섞이면 노출 빈도가 커진다.
- 제안: 결과뷰가 `aggregate.items.filter(i => i.carryoverDetail)`를 **종목 순서대로 모두** 카드로 렌더(제목에 `종목 N (분류)` — `taxCategoryLabel` 재사용). 국내 다건 동작도 바뀌므로 **Q-6**(범위 확대 승인).
- 국외 종목이 `toStockTransferResult` 변환을 거치므로 `carryoverDetail`이 어댑터에서 **누락되지 않게** 해야 한다(엔진 파트 — §9. 어댑터는 `ForeignStockResult`의 필드를 명시 매핑해 나르므로 신규 echo는 침묵 누락 위험, 선례 P-8).
- 사이드바 합계(`StockSidebar.tsx:104-` multi 분기)는 aggregate 값을 그대로 쓰므로 변경 없음.
- 종목 목록 카드(`StockItemListCard.tsx:39-45` `itemSummary`)에 `이월과세` 소배지를 붙이면 혼합 시 어느 종목이 대상인지 한눈에 보인다 — 선택 사항(필수 아님, 포함 시 `acquisitionCause==="carryover_gift"`만 본다).

---

## 7. 다건·이력·마이그레이션 요약

| 항목 | 판단 | 근거 |
|---|---|---|
| zustand sessionStorage | ③ normalize만 | version 필드 없음, `onRehydrateStorage`가 `normalizeStockFormData`(+`savedItems` 각각) — `store.ts:238-246` |
| 이력(IndexedDB) 복원 | ③으로 닫힘 | `stock-resume-entry.ts:43,50`이 같은 normalize |
| 이력의 구형 `resultData` | 신규 echo는 optional이라 카드는 `carryoverDetail &&` 게이트로 안 뜸 | 코드 읽기 |
| `lib/stores/calc-wizard-migration.ts` | 수정 없음 | `stock` 참조 0건(grep) |
| 종목 확정 시 이월 | 불필요 | `carryFilingFields`가 donor 필드를 새 폼으로 초기화 |
| 국내↔국외 시장 전환 | 값 보존 + ④ predicate가 `foreign_stock`일 때만 국외 필드 전송, 국내 `appendCarryoverDonorBody`는 국외에서 호출 안 됨 | D-2·D-6 |

---

## 8. 테스트·anchor·E2E 계획

### 8.1 Pre-Do anchor (착수 전 먼저 실패 확인 — 메모리 `feedback_pre_anchor_verification`)

1. `__tests__/calc/foreign-stock-carryover-wiring.anchor.test.ts`(신설, 국내 `stock-carryover-97-2-wiring.anchor.test.ts` 형태): FW-1 폼→`buildForeignStockApiBody`→`foreignStockInputSchema`→엔진 도달 / FW-2 predicate OFF면 body에 donor 키 없음(**부정 + 긍정 짝**) / FW-3 국내 `carryover_gift` 폼을 `foreign_stock`으로 바꿔도 국내 원화 필드가 body에 섞이지 않음 / FW-4 ⑧⑫ 격자 정합(UI 통과 ⇒ zod 통과) / FW-5 normalize: 구형 폼(신규 키 없음) → 기본값.
2. 컴포넌트: `__tests__/components/calc/stock-transfer/foreign-carryover-gate.anchor.test.tsx` — 토글 OFF엔 증여자 칸 없음 / ON이면 나타남(긍정 짝) / ON 시 취득일 라벨 「수증일」 / 증여세 3종은 `showHoldingPeriodNote=false`에서 보유기간 문장 부재 / 국내 `AcquisitionInfoBlock` 렌더 불변(기존 DR-1~3 그대로 통과).
3. 뮤테이션 probe(메모리 hub_anchor_mutation): ⓐ ④에서 키 하나 삭제 → FW-1 실패 ⓑ ⑫ 키 삭제 → 실패 ⓒ predicate를 `effectiveSingleAcquisitionCause`로 바꿈 → split 잔존 시나리오 FW-6 실패 확인.

### 8.2 E2E 초안 — `e2e/foreign-stock-carryover-97-2.spec.ts` (신설)

헬퍼는 `e2e/foreign-stock-expense-exchange-rate.spec.ts`(`gotoStockTransferTax`·`fillByLabel`·환율 1,000 암산 방식)와 같다. 실행: `E2E_PORT=3210 npx playwright test e2e/foreign-stock-carryover-97-2.spec.ts`.

**사례(교재)**: 배우자 취득 2025-08-01 원화 5,000만 → 증여 2026-01-05 평가 1억(증여세 0) → 양도 2026-12-02 3억.

**안 A 변환(환율 1,000, 1,000주)** — 교재 금액과 **산술 동치**(원화 사례를 외화로 직접 재현할 수 없어 환율 1,000으로 환산해 맞춘다. 직접 재현은 안 B 또는 KRW 통화 도입 시 — V-14):

| 입력 | 값 | 원화 환산 |
|---|---|---|
| 거주 연수 | 10 | §118의2 충족 |
| 수증일(취득일) | 2026-01-05 | |
| 양도일 | 2026-12-02 | 1년 이내 · 2025.1.1. 이후 |
| 주식수 | 1,000 | |
| 증여자 취득일 | 2025-08-01 | |
| 관계 | 배우자 | |
| 증여자 취득 통화·환율·1주당 | USD · 1,000 · 50 | 50,000,000 |
| 수증자 취득(증여일 평가) 환율·1주당 | 1,000 · 100 | 100,000,000 |
| 양도 환율·1주당 | 1,000 · 300 | 300,000,000 |
| 증여세 산출세액 | 비움(0) | |

**기대값(산술 검산 — 엔진 실측 아님, V-12)**:
- A(적용): 300,000,000 − 50,000,000 = 250,000,000 → 기본공제 2,500,000 → 과세표준 247,500,000 × 20% = **49,500,000**.
- B(미적용): 300,000,000 − 100,000,000 = 200,000,000 → 197,500,000 × 20% = 39,500,000.
- A ≥ B ⇒ ②3호 미발동, **A 채택**. 지방소득세 10% = 4,950,000.

**케이스**:
- **FC-1** 토글 ON 시 증여자 칸 출현 / OFF 시 부재(긍정·부정 짝), 취득일 라벨 「수증일」.
- **FC-2** 위 시나리오 → request body에 `acquisitionCause:"carryover_gift"`·증여자 필드가 실렸는지(⑬) → `json.result` 산출세액 49,500,000 → 결과 화면에 비교 카드(「§97의2① 이월과세 — 적용 / 미적용 비교」)와 두 결정세액 표시.
- **FC-3** [회귀] 토글 OFF → body에 donor 키 **없음**, 산출세액 39,500,000(수증자 취득가액 100,000,000 기준).
- **FC-4** 증여자 취득가액을 비우고 「다음」 → Step2에서 차단(⑧ error, Q-3 권고 기준).
- **FC-5** 증여세 산출세액만 입력 → Step3에서 안분 분자·분모 요구로 차단.
- **FC-6** 혼합 다건: 국내 비상장 1건(비이월) 확정 후 국외 이월과세 종목을 마지막이 **아닌** 순서로 두고 계산 → 비교 카드가 뜨는지(Q-6 승인 시) / 마지막일 때 카드가 뜨는지.
- **FC-7** 국내→국외 시장 전환: 국내에서 `carryover_gift`+국내 원화 donor 입력 후 해외주식으로 전환 → 국외 화면 토글이 ON으로 보이고(raw cause), body에 **국내 `donorAcquisitionPrice`가 없는지**.

---

## 9. 엔진·API 파트(⑨~⑭)에 UI가 요구하는 계약 (맞출 것)

1. **필드명**: §5 표의 `(재사용)` 7개 + `(후보)` 5개(안 A). 엔진이 이름을 바꾸면 ①②③④⑧만 따라 바뀐다. 안 A/B는 엔진 결정.
2. **`ForeignStockResult`·어댑터에 echo**(UI가 읽는 것): `carryoverDetail`(`outcome`·`appliedTotalTax`·`excludedTotalTax`·`donorCapexIncluded`·`giftTaxIncluded` + **취득가액 A/B 총액(원화)** + 적용 환율·통화·증여자 취득일). `toStockTransferResult`(`foreign-stock-aggregate-adapter.ts`)가 이를 `StockTransferResult.carryoverDetail`로 **명시 매핑**해야 다건 카드가 뜬다(누락 시 침묵).
3. **⑫ Zod**: `foreignStockInputSchema`는 `z.object({…}).superRefine`이고 `.strict()/.passthrough()`가 없다(`stock-transfer-foreign-schema.ts` — grep 확인) → **신규 키를 등록하지 않으면 조용히 strip**. `acquisitionCause`는 enum 한정(국외는 `"purchase"|"carryover_gift"`로 좁힐지 엔진 결정). 국외 refine은 `missingAcquisitionCauseKeys`를 그대로 호출해 ⑧과 같은 규칙을 쓴다.
4. **⑭ Route**: `FOREIGN_STOCK_DATE_FIELDS`(`route.ts:~159`)에 `donorAcquisitionDate` 등록 + `buildForeignEngineInput`(`:203-`)은 **필드를 하나씩 명시 매핑**하므로(`:218-267`) 신규 필드 추가 누락이 침묵 strip이다 — 국내 P-8 선례. 두 곳(단건 `handleForeignStock`·다건 `handleAggregate` `:137`)이 같은 함수를 공유해 한 곳만 고치면 된다(코드 읽기).
5. **게이트 일치**: 엔진 게이트(`isStockCarryoverEra`·`isWithinCarryoverPeriod`·`isCarryoverRelationExcluded`)는 국내 것을 **그대로 재사용**(leaf import, `single-source-engine-helper`). UI는 새 판정 함수를 만들지 않는다.
6. **②3호 비교 대상 확장**: `stock-transfer-aggregate.ts:261` `resolveStockCarryover`가 국내만 받는다 → 국외 종목을 대상에 포함(혼합 배열 2ⁿ). `MAX_CARRYOVER_ITEMS=10`(`stock-carryover.ts:35`) 초과 시 throw하는 메시지는 ⑧에서 사전 차단할지 엔진과 협의(현재 국내 ⑧에도 사전 차단은 확인하지 못함 — V-13).
7. **stale 주석 정정**: `stock-transfer-aggregate.ts:240-244`·`foreign-stock-aggregate-adapter.ts` 등의 「국외는 이월과세 대상이 아니다/축이 없다」 문장은 이번 변경이 거짓으로 만든다 → 역 grep 후 갱신(V-4, 메모리 `feedback_comment_asserting_absence_is_premise_for_later_pr`).

---

## 10. 결정 필요 사항 (Q-n)

| ID | 질문 | 권고 |
|---|---|---|
| **Q-1** | 국외 이월과세 게이트 필드: 국내 `acquisitionCause`(`carryover_gift`) 재사용 vs 국외 전용 불리언(`fgCarryoverGift`) | **재사용**(엔진 파트 「국내 필드명 재사용」 기준과 일치, 화면 상태=body 상태 일관). 대가: 국내·국외가 한 필드를 공유하므로 predicate를 반드시 raw cause로 통일(§4.1) |
| **Q-2** | 증여자 취득가액 단위: **외화+증여자 취득일 환율(안 A)** vs 원화(안 B) | 엔진 결정에 종속. UI는 A 권고(국외 마법사 일관·환율 근거 노출). B는 신규 필드 0개로 단순하나 사용자가 환산 |
| **Q-3** | 증여자 취득가액을 모를 때: 국외는 환산(나목) 경로가 없다 — **필수 error로 차단** vs 국내처럼 warning | **error**(정책 2·「미입력은 validation 오류」). 엔진이 나목(§178의3 시가 등)을 지원하면 라디오를 열고 재결정 |
| **Q-4** | 입력 배치: 단계 분산(Step1/2/3) vs 1단계 단일 카드(국내와 동형) | **분산**(realign 계획서 §3 원칙·계산 순서). 대가: 증여자 입력이 3단계에 흩어져 「이월과세 입력 한 곳」이 아님 — 토글 설명문에 「2·3단계에도 입력이 있다」 안내 |
| **Q-5** | 증여자 취득일을 국외에서 필수로 받을지 | 엔진이 소비(환율 기준일 echo·게이트)할 때만 필수. 소비하지 않으면 **필드 삭제**(유령 입력 금지) |
| **Q-6** | 다건에서 A/B 카드를 **종목별로 모두** 표시(국내 다건 동작도 변경) vs 현행(마지막 종목만) | **모두 표시**. 국내 다건 결함도 같이 해소되지만 국내 결과뷰 수정이 포함됨 |
| **Q-7** | 증여자 자본적지출 지출일 환율 비움 처리: 양도일 환율 fallback(기존 필요경비 패턴, 근사) vs 필수 | 기존 `ForeignStockExpenseBlock:36-40` 패턴과 일관되게 fallback 허용하되 hint에 명시. 단 증여자 지출은 시점이 더 멀어 근사 오차가 커진다는 점 고지 |
| **Q-8** | 비교 카드 variant를 prop으로 추가(국내 불변) vs 국외 전용 카드 신설 | **prop**(평행 카드 신설 금지). 카드의 「원」 접미 정리는 범위 밖(V-7) |
| **Q-9** | 수증일 <2025-01-01·양도일−수증일>1년이면 입력 중 파생 안내(「이월과세가 적용되지 않습니다」)를 둘지 | 1차 제외(국내도 hint뿐). 요청 시 추가 |

## 11. 미검증 (V-n)

| ID | 항목 | 상태 |
|---|---|---|
| **V-1** | 국외 필요경비 근거: 국외 엔진은 §118② → §118의4 **준용**(`foreign-stock.ts` 머리주석), 국내 계획서(`stock-carryover-97-2-necessary-expense.plan.md` Q-5 `:496-511`·§7.3 `:1059-1085`)는 국외주식 필요경비를 §97·§97의2 트랙으로 본다. 두 서술이 어긋날 수 있어 **UI 문구의 인용 조문**(§97의2① 단독인지 §118의4 병기인지)이 확정되지 않음 | **확인 필요** — 엔진 파트가 KoreanLaw MCP로 위임 체인 검증 후 알려 줄 것 |
| **V-2** | 증여자 취득가액의 **환산 환율 기준일**(영 §178의5① 「취득일」을 증여자 취득일로 읽는가) 및 인용 조문 | 확인 필요 |
| **V-3** | 엔진이 `donorAcquisitionDate`를 실제 소비하는가(국외는 단기세율이 없어 세율 축에는 안 쓰임). 안 쓰면 입력 칸이 계산에 1원도 안 가는 「유령 입력」 | 확인 필요 → Q-5 |
| **V-4** | 「국외주식은 이월과세 대상이 아니다」 단정 주석이 `stock-transfer-aggregate.ts:240-244`에 있고 `resolveStockCarryover` 호출이 국내만(`:261`) — 엔진이 뒤집을 때 주석·분기 역 grep | 코드 읽기 확인, 엔진 파트 작업 |
| **V-5** | 다건 결과뷰가 마지막 종목의 `carryoverDetail`만 그린다(`Calculator.tsx:301`, `ResultView.tsx:595`) | 코드 읽기 확인, **실행 미확인** — Pre-Do에서 국내 2종목 probe/E2E로 재현할 것 |
| **V-6** | 국외 중소기업 10%(`isSmallMediumEnterprise`)·외국납부세액공제 한도(`A×B/C`)가 ②3호 비교(전체 결정세액)에 미치는 상호작용 | 엔진 파트 |
| **V-7** | `StockCarryoverComparisonCard`의 `…원` 접미(`:19`) vs 국외 카드 정책(「숫자 끝 원 금지」, `ForeignStockResultCard:6-9`) — 실제 국내 결과뷰 전반의 관행은 미조사 | 확인 필요 |
| **V-8** | `DeemedDateNotice`(의제취득일 1986.1.1., 영 §162⑦3호)가 국외주식(다목)에도 적용되는지 — 증여자 취득일이 1985.12.31. 이전인 극단 케이스. 안 맞으면 국외 leaf는 notice slot을 비운다(현 계획) | 확인 필요 |
| **V-9** | 파일 크기: `calc-wizard-stock-normalize.ts` 711줄(+~12 → ~725), `calc-wizard-stock-form-types.ts` 602줄, `stock-transfer-tax-api.ts` 755줄(**수정 안 함** — 국외 변환은 별 파일), `Step2.tsx` 711·`Step3.tsx` 700(국외 분기는 블록 호출 그대로라 변경 없음) | 줄 수는 `wc -l` 확인 |
| **V-10** | 국내 위젯은 관계 변경 시 `donorDeceased`를 리셋하지 않는다(부동산 위젯은 리셋). 공용 leaf 추출은 이 동작을 **보존**(별건) | 코드 읽기 확인, 별건 |
| **V-11** | `StockCarryoverComparisonCard`를 직접 렌더하는 기존 컴포넌트 테스트 유무 | 미조사 — variant prop 추가 시 가드 확인 필요 |
| **V-12** | 사례 기대값 49,500,000 · B 39,500,000 · 지방소득세 4,950,000은 **산술 검산**이며 엔진 실측이 아님 | 엔진 구현 후 FC-2로 실측 |
| **V-13** | `MAX_CARRYOVER_ITEMS` 초과(>10건)는 엔진이 throw — 국내 ⑧에 사전 차단이 있는지 미확인 | 확인 필요 |
| **V-14** | 교재 「원화 5,000만」을 국외 폼에서 글자 그대로 재현하려면 안 B 또는 KRW 통화 옵션이 필요. `CURRENCY_OPTIONS`(`currency-options.ts`)는 국외전출세·외국납부세액과 **공용**이라 KRW를 넣으면 그쪽 select에도 노출됨 | 안 A 채택 시 환율 1,000 변환으로 대체(§8.2) |

---

## 12. 착수 순서(제안 — Do는 시퀀셜: 엔진이 타입·헬퍼 선처리)

1. **P0 Pre-Do anchor** — FW-1~FW-6 실패 확인 + V-5 국내 2종목 probe.
2. **P1 국내 추출 PR**(동작 불변): `CarryoverGateFields`·`CarryoverGiftTaxFields` 추출, `AcquisitionInfoBlock` 교체. 기존 anchor 4종 + E2E 2종 전건 통과가 합격선.
3. **P2 클라이언트 필드**: ①②③ + `isForeignCarryoverForm` + ④(`appendForeignCarryoverBody`) + ⑧. (엔진 타입·⑨⑫⑭ 완료 후 — 선행 의존)
4. **P3 위젯**: `ForeignCarryoverBlocks` + 3개 블록 호출 추가.
5. **P4 결과**: 카드 variant + `ForeignStockResultCard` 연결 + (Q-6 승인 시) 다건 카드 반복.
6. **P5 E2E FC-1~7** → `ui-engine-sync-checker`(14지점) → `bkit:gap-detector`.
7. 완료 보고 전 자가 점검: 3대 정책(useEffect 미러링 / 자동 안분 fallback / ⑧ 동기화), ⑫⑬⑭ grep, `npx tsc --noEmit`, `npx vitest run __tests__/tax-engine/stock-transfer/ __tests__/calc/ __tests__/components/calc/stock-transfer/`, 브라우저 수동 확인(Network 탭 body).

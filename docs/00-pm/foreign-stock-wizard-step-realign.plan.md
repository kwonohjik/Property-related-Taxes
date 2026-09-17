# 해외주식 마법사 단계 재배치 — 입력을 「그 단계의 주제」로 되돌린다 (B안)

- 기준 커밋: `8567a7ce` (master, 2026-09-17)
- 검증 깊이: **L2** — 세액이 바뀌지 않는다(입력 «위치»만 옮긴다). 착수 전·후 mutation probe 필수.
- 상태: **계획 · 착수 전**

## 0. 한 줄

해외주식은 양도가액·취득가액·필요경비를 **1단계에서 외화로 다 입력**하는데, 2·3단계가 **국내 전용
입력칸을 그대로 또 내민다**. 그 칸들은 **계산에 1원도 가지 않는다**(실측). 입력을 각 단계의 주제로
옮겨 중복을 없앤다.

## 1. 제보

> 해외 주식은 왜 양도가액 취득가액을 2중으로 입력하는 거야

- 1단계 화면: 「③ 양도가액 — 원화 환산 (§178의5)」에 1주당 양도가액(외화) 1,000 USD · 환율 1,000
  → **양도가액(원화 환산 참고): 10,000,000**, 「④ 취득가액」 3,000 USD → **30,000,000**
- 2단계 화면: 「① 양도가액 · 합계 직접 입력 **10,000,000**」 「② 취득가액 · 합계 직접 입력 **30,000,000**」
  — 같은 금액을 **손으로 옮겨 적은 흔적**이다.

## 2. 실측 — 무엇이 잘못됐나

### 2.1 국외 입력은 1단계에 전부 모여 있다

`ForeignStockBlock`(572줄) 한 덩어리가 6개 섹션을 갖는다:

| 섹션 | 위치 | 내용 |
|---|---|---|
| ① 납세의무 요건 (§118의2) | `ForeignStockBlock.tsx:133` | 국내 거주 연수 |
| ② 기본 양도 정보 | `:166` | 취득일·양도일·주식수·발행국가·외국법인 발행·중소기업 |
| ③ 양도가액 — 원화 환산 (§178의5) | `:240` | 통화·수령방식(단일/장기할부)·환율·입력방식·단가/총액 |
| ④ 취득가액 — 원화 환산 (§178의5) | `:380` | 산정방식(실가/시가 §178의3)·통화·환율·1주당 단가 |
| ⑤ 필요경비 (§118의4) | `:461` | 자본적지출·양도비 (외화) |
| ⑥ 외국납부세액 (§118의6) | `:488` | 납부세액·통화·환율 + 세액공제/필요경비 택일 |

Step1 은 국외를 고르면 이 블록만 붙이고 **나머지 섹션을 건너뛰며 early return** 한다(`Step1.tsx:195-203`).

### 2.2 그런데 2·3단계에는 국외 분기가 **없다**

- `Step2.tsx:98` ① 양도가액 · `:228` ② 취득가액 — `marketType` 을 보지 않는다(파일 전체에 `foreign` 분기 0건)
- `Step3.tsx:194` ① 필요경비 — 같은 방식으로 무조건 렌더

### 2.3 그 칸들은 **죽어 있다** (throwaway probe · 2026-09-17)

| 관측 | 결과 |
|---|---|
| 국외 body 에 실린 국내 금액 키 | **0개** (`stock-transfer-tax-api.ts:92` 가 `buildForeignStockApiBody` 로 분기) |
| 국내 칸을 `999`/`1` 로 바꾼 뒤 body 비교 | **완전 동일** |
| 국내 칸을 **비운 채** `validateStep2` | **오류 0건** — 애초에 요구하지 않는다 |

🔴 그런데 화면은 **`*` 필수 표시**를 달고 있다. 「UI 는 필수라 말하고 validate 는 무관심」한 모순이라
사용자가 1단계 값을 원화로 환산해 손으로 옮겨 적게 된다 — 제보 화면이 정확히 그 상태다.

### 2.4 🔑 검증은 **이미 2·3단계로 나뉘어 있다**

`validateStep2` 는 국외면 `validateStep2Foreign` 으로 라우팅된다(`stock-transfer-tax-validate.ts:647`).
그 함수가 검증하는 필드는 **1단계 화면에 있는 것들**이다:

| validate 함수 | 검증하는 필드 | 현재 화면 위치 |
|---|---|---|
| `validateStep1Foreign` | `yearsResidentInKorea` · `acquisitionDate` · `transferDate` · `shareCount` | 1단계 ①② ✅ 일치 |
| `validateStep2Foreign` | `transferCurrencyCode` · `transferExchangeRate` · `perShareTransferPriceForeign` · `totalTransferPriceForeign` · `fsTransferInstallmentReceipts` · `acquisitionCurrencyCode` · `acquisitionExchangeRate` · `perShareAcquisitionPriceForeign` | **1단계 ③④** ❌ 어긋남 |
| `validateStep3Foreign` | `foreignTaxPaidForeign` · `foreignTaxCurrencyCode` · `foreignTaxExchangeRate` | **1단계 ⑥** ❌ 어긋남 |

⇒ **코드는 이미 B안 배치를 전제한다.** 2단계에서 난 오류가 1단계 필드를 가리키는 현재 상태가 비정상이다.

## 3. 목표 배치

| 단계 | 국외주식 화면 | 출처 |
|---|---|---|
| **Step1** 자산·시장 | ① 납세의무 요건(§118의2) · ② 기본 양도 정보 | 현행 §1·§2 유지 |
| **Step2** 양도·취득가액 | ① 양도가액 — 원화 환산 · ② 취득가액 — 원화 환산 | 현행 §3·§4 **이동** |
| **Step3** 필요경비·신고 | ① 필요경비(§118의4) · ② 외국납부세액(§118의6) · ③ 기본공제 · ④ 신고 유형 · ⑤ 가산세 | §5·§6 **이동** + 기존 국내 공용 섹션 |

**Step3 의 국내 공용 섹션은 국외에도 유효하다 — 실측 근거**:
- 기본공제: 국외는 안내문만 렌더된다(입력칸은 `otherAssetGroup` 일 때만 — `Step3.tsx:282`)
- 신고 유형·가산세: `filingViolation` · `isFraudulent` · `isInternationalTransaction` · `isElectronicFiling` 이
  **국외 body 에 실리고**(`stock-transfer-tax-api-foreign-exit.ts:74-85`) 국외 엔진이 실제로 계산한다
  (`foreign-stock.ts:369` STEP 11.5 가산세)
- 반대로 **필요경비만** 국외 전용이다 — 국외는 `capitalExpenditureForeign`·`transferCostForeign`(외화)로
  body 에 들어가고(`:66-67`), 국내 `expenseMode`·`actualExpenses` 는 실리지 않는다 ⇒ **교체 대상**

## 4. 분할 설계

`ForeignStockBlock.tsx`(572줄)를 **세 블록 + 공용**으로 나눈다. 800줄 정책 분리와 같은 규약으로
**export 는 보존**하고 호출부만 바뀐다([[feedback_800line_split_export_preservation]]).

| 신규 파일 | 담는 것 |
|---|---|
| `ForeignStockIdentityBlock.tsx` | §1 납세의무 요건 · §2 기본 양도 정보 |
| `ForeignStockPriceBlock.tsx` | §3 양도가액 · §4 취득가액 (원화 환산) |
| `ForeignStockExpenseBlock.tsx` | §5 필요경비 · §6 외국납부세액 |
| `foreign-stock-section-box.tsx` | `SectionBox` · `COUNTRY_OPTIONS` · 수령방식 옵션 등 **공용 상수** |

- **섹션 번호는 각 단계 안에서 1부터** 다시 매긴다(Q-1).
- `ForeignStockBlock.tsx` 는 **삭제**한다 — 세 블록을 다 쓰는 곳이 없어지므로 남기면 orphan 이다.
  ⚠️ 단 `__tests__/components/foreign-stock-sme-toggle.anchor.test.tsx:33` 이 이 컴포넌트를 직접 렌더한다 →
  `ForeignStockIdentityBlock` 으로 바꿔 살린다(중소기업 토글은 §2 소속).

호출부:
- `Step1.tsx:195-203` → `ForeignStockIdentityBlock`
- `Step2.tsx` 최상단 → `marketType === "foreign_stock"` 이면 **국내 ①② 대신** `ForeignStockPriceBlock`
- `Step3.tsx` ① 필요경비 → 국외면 `ForeignStockExpenseBlock` 으로 **교체**(기본공제 이하 섹션은 공용 유지)

## 5. 케이스 매트릭스

| # | 상태 | 기대 |
|---|---|---|
| C-1 | 국외 · Step2 | 원화 환산 양도·취득 섹션이 보이고 **국내 「양도가액 합계」 칸이 없다** |
| C-2 | 국외 · Step3 | 외화 필요경비 + 외국납부세액이 보이고 **국내 필요경비 칸이 없다** |
| C-3 | 국외 · Step1 | 거주기간·기본 양도 정보만. 금액 섹션이 **없다** |
| C-4 | **국내** · Step1~3 | 현행과 **완전 동일**(회귀 0) |
| C-5 | 국외전출세 | 현행 유지(범위 밖 — §12) |
| C-6 | 국외 · 다종목 | 3단계에서 종목 확정. 확정된 종목의 값이 보존된다 |

## 6. anchor 계획

| ID | 고정하는 것 | 파일 |
|---|---|---|
| FW-1 | 🔴 국외 Step2 에 **국내 「양도가액 합계」 라벨이 없다** + 「1주당 양도가액 (외화)」가 **있다** | `__tests__/components/calc/stock-transfer/foreign-wizard-step-layout.anchor.test.tsx` |
| FW-2 | 🔴 국외 Step3 에 국내 필요경비 대신 외화 필요경비·외국납부세액이 있다 | 〃 |
| FW-3 | 🔴 국외 Step1 에 금액 섹션이 **없다**(거주기간·주식수는 있다) | 〃 |
| FW-4 | **국내** Step2·Step3 는 현행 그대로(양성 짝 — 게이트가 국내를 삼키지 않았는가) | 〃 |
| FW-5 | 국외 Step2 의 `validateStep2` 오류가 **그 화면의 필드**를 가리킨다(필드명 대조) | `__tests__/calc/foreign-step-validate-alignment.anchor.test.ts` |

> FW-5 는 §2.4 의 어긋남이 해소됐음을 **필드 이름으로** 고정한다 — 화면과 validate 가 다시 갈라지면 잡힌다.

## 7. mutation probe

| ID | 무력화 | 실패해야 할 anchor |
|---|---|---|
| P-1 | Step2 의 국외 분기 제거(국내 ①② 복귀) | FW-1 |
| P-2 | Step3 의 국외 분기 제거 | FW-2 |
| P-3 | Step1 에 Price 블록을 다시 붙임 | FW-3 |
| P-4 | 국외 분기 조건을 `marketType !== "..."` 로 뒤집어 국내까지 삼킴 | FW-4 |

## 8. 영향 범위

| 대상 | 영향 | 조치 |
|---|---|---|
| `e2e/foreign-stock-94-1-3-da-track.spec.ts` | `fillForeignStep1`(`:45-72`)이 1단계에서 섹션 ③④를 채우고, `:80-83` 이 **빈 2단계를 「다음」으로 통과**시킨다 | 헬퍼를 단계별로 쪼개고 내비게이션 갱신 |
| `__tests__/components/foreign-stock-sme-toggle.anchor.test.tsx` | `ForeignStockBlock` 직접 렌더 | `ForeignStockIdentityBlock` 으로 교체 |
| `StockSidebar` | 국외 분기가 **이미 있다**(`:167`) | 무변경 예상 — anchor 로 확인 |
| 14 동기화 지점 | **신규·삭제 필드 0개.** 렌더 «위치»만 옮긴다 ⇒ ①~⑭ 어디도 바뀌지 않는다 | 해당 없음 |
| 세액 | **불변**(입력 필드 동일) | C-4·회귀로 확인 |

## 9. V-n (미검증 레지스터)

| ID | 항목 | 방법 | 상태 |
|---|---|---|---|
| V-1 | 국외에서 Step2 의 「다음」이 무엇을 검증하는가 | `validate.ts:647` 라우팅 + 필드 목록 실측 | ✅ §2.4 |
| V-2 | Step3 국내 공용 섹션(기본공제·신고·가산세)이 국외에도 유효한가 | body 키 + 엔진 STEP 11.5 실측 | ✅ §3 |
| V-3 | 국외전출세(`exit_tax`)도 같은 결함인가 | `ExitTaxBlock` 6섹션이 Step1 에 · `validateStep2ExitTax` 가 보유종목 검증 | ✅ **같은 결함 확인** — 범위 밖(§12) |
| V-4 | 다종목(국내+국외 혼합)에서 단계 이동·종목 확정이 영향을 받는가 | 확정 버튼은 3단계 — **미확인** | ⏳ 착수 전 확인 |

## 10. Q-n (결정 게이트)

- **Q-1** 섹션 번호 — **각 단계에서 1부터 재부여**(권고). 1단계에 ①②만 남는데 2단계가 ③부터 시작하면 어색하다.
- **Q-2** 외국납부세액(§118의6) 위치 — **필요경비 바로 뒤**(권고). 「세액공제 ↔ 필요경비 산입」 택일이
  필요경비와 직결된다(엔진도 STEP 5 에서 필요경비 산입을 먼저 처리한다).
- **Q-3** A안(국내 섹션만 숨기기)을 선행 PR 로 낼 것인가 — **아니오**(권고). B 가 파일 분할을 포함해도
  같은 파일을 두 번 건드리게 된다. PR 1건으로 간다.

## 11. 범위 밖

- **국외전출세(`exit_tax`)의 같은 재배치** — 구조가 같아 그대로 적용되지만 별 PR(V-3).
- 세액 로직·엔진 입력 필드 일체.
- 국외 다종목 UI 확장.

## 12. 착수 전 체크리스트

- [ ] Q-1~Q-3 결정
- [ ] V-4 확인(다종목 혼합에서 단계 이동·확정)
- [ ] Pre-Do: FW-1~FW-5 를 먼저 심어 🔴 실패 확인
- [ ] 분할 → 호출부 교체 → P-1~P-4 과녁 확인
- [ ] 국외 E2E 갱신 · 컴포넌트 테스트 교체
- [ ] vitest 전건 회귀 0 · tsc · lint · 주식 E2E 전건

---

## 13. 구현 기록 (2026-09-17 · 착수 후)

### 13.1 결정 (사용자)

- **Q-1 = 예** 섹션 번호는 각 단계에서 1부터 재부여
- **Q-2 = 필요경비 바로 뒤** 외국납부세액(§118의6)
- **Q-3 = 아니오** A안 선행 없이 B 한 PR

### 13.2 V-4 해소 · 계획서에 없던 발견

- **V-4 ✅** 종목 «확정» 버튼은 `StockTransferTaxCalculator.tsx:348` 의 하단 내비에 있고 Step3 컴포넌트
  «안»이 아니다 ⇒ 블록 이동의 영향을 받지 않는다. 확정 게이트는 `validateStep3`(국외 → `validateStep3Foreign`) 그대로.
- 🔴 **계획서에 없던 중복 1건 — 「섹션 7: 신고일」**. 종전 블록 `:556-569` 가 `form.filingDate` 를 받는데,
  **Step3 신고 유형 섹션(`Step3.tsx:447`)이 같은 필드를 이미 렌더**한다. 즉 신고일도 두 화면에 있었다.
  값은 같은 키라 «유령»은 아니지만 같은 칸을 두 번 보여 준다 ⇒ **이동이 아니라 삭제**했다.

### 13.3 구현

| 파일 | 내용 |
|---|---|
| `foreign-stock-shared.tsx` (신규) | `SectionBox` · 선택지 상수 4종 · `ForeignStockSectionProps` |
| `ForeignStockIdentityBlock.tsx` (신규) | §1 납세의무 요건 · §2 기본 양도 정보 → **Step1** |
| `ForeignStockPriceBlock.tsx` (신규) | 양도가액 · 취득가액(원화 환산) → **Step2** (번호 ①②) |
| `ForeignStockExpenseBlock.tsx` (신규) | 필요경비 · 외국납부세액 → **Step3** (Q-2 순서) |
| `ForeignStockBlock.tsx` | **삭제** (572줄) |
| `Step1.tsx` · `Step2.tsx` · `Step3.tsx` | 호출부 교체 — Step2·Step3 는 `marketType === "foreign_stock"` 분기 |
| `__tests__/components/foreign-stock-sme-toggle.anchor.test.tsx` | 렌더 대상을 IdentityBlock 으로 교체 |
| `e2e/foreign-stock-94-1-3-da-track.spec.ts` | `fillForeignStep1`/`fillForeignStep2` 로 분리 + 내비 갱신 |

### 13.4 검증

- **Pre-Do**: FW-1·FW-1b·FW-2·FW-3 **🔴 4건 실제 실패** 확인 후 구현
- ⚠️ **FW-5(검증↔화면 정렬)는 구현 «후» 추가**했다 — Pre-Do 🔴 가 아니다. 구별력은 P-1·P-2·P-3 로 확인했다.
- **mutation 4건, 과녁만 실패**:

  | ID | 무력화 | 실패한 anchor |
  |---|---|---|
  | P-1 | Step2 국외 분기 제거 | FW-1 · FW-1b · FW-5 |
  | P-2 | Step3 국외 분기 제거 | FW-2 · FW-5c |
  | P-3 | Step1 에 Price 블록 재부착 | FW-3 · FW-5b |
  | P-4 | 국외 조건을 뒤집어 국내까지 삼킴 | FW-4 |

- vitest 전건 **21,703 passed**(종전 21,691 + 신규 12) · 회귀 0 · `tsc` 0
- 국외 E2E **F-1~F-3 통과** — F-1 이 body(`transferExchangeRate: 1000`)와 세액(`incomeTax 19,500,000`)을
  그대로 단언하므로 **세액 불변**이 실측으로 확인된다.

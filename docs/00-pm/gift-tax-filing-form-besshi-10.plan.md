# 증여세 신고서 양식 — 별지 제10호서식 [2020.03.13 개정] 재현 계획서

> **범위 제한**: 본 PDCA는 **증여세 전용**. 양도세·상속세·재산세·종부세·취득세의 신고서 양식·결과 화면은 **수정하지 않는다**.

- 작업 일자: 2026-05-20
- 담당: inheritance-gift-tax-senior (엔진) + inheritance-gift-tax-ui-senior (UI)
- 관련 파일:
  - 엔진: `lib/tax-engine/gift-tax.ts` · `lib/tax-engine/gift-filing-form-rows.ts` (현존) · `lib/tax-engine/gift-tax-filing-form-besshi10.ts` (신규 분리) · `lib/tax-engine/types/inheritance-gift.types.ts`
  - UI: `components/calc/results/GiftTaxFilingFormTable.tsx` · `components/calc/results/GiftTaxResultView.tsx`

---

## 1. 배경 / 현행 상태

현재 증여세 결과 화면의 "증여세 신고서 양식 (12행 / 18행)"는 단일 1열(번호·항목·금액·근거)로 PDF 사례 1·2 핵심 산식만 행으로 나열한다. 엔진 빌더는 `lib/tax-engine/gift-filing-form-rows.ts` (`buildFilingFormRows`)에 존재한다.

**한계**:
- 국세청 공식 별지 제10호서식 [2020.03.13 개정] = **2열 레이아웃 + 좌측 과세가액 산정 + 우측 세액공제·가산세·자진납부 계산**.
- 행 번호가 ⑰부터 시작(서식 헤더의 ①~⑯은 인적사항)인데, 현재 ①~⑫(또는 ⑱)만 출력 → 실제 서식과 행 번호 불일치.
- 비과세재산가액(⑱)·과세가액불산입(⑲⑳㉑)·채무액(㉒)·재해손실공제(㉘)·감정평가수수료(㉙)·신고불성실가산세(㊷)·납부지연가산세(㊸)·연부연납(㊻)·분납(㊼) 등 **실제 서식 행이 미노출**.
- 사용자가 양식을 그대로 출력해 세무서에 제출 시 매핑이 끊김.

---

## 2. 목표 (Definition of Done)

증여세 결과 탭의 신고양식이 **별지 제10호서식 [2020.03.13 개정]** 의 본문(인적사항 헤더 제외, 행 ⑰부터 ㊼ 신고납부까지)을 **2열 격자 표** 그대로 화면·인쇄 출력으로 재현한다.

- 행 번호 ⑰~㊼ + 납부방법 헤더 + 연부연납 ㊻ + 분납 ㊼ + 신고납부 모두 표시(데이터 없는 행은 0 또는 빈칸, 산식 무의미 행은 "—").
- 좌측 컬럼 = 과세가액 산정 흐름(⑰ 증여재산가액 → ㉚ 과세표준 → ㉜ 산출세액 → ㉞ 산출세액계 → ㉟ 이자상당액 → ㊱ 박물관자료 등 징수유예).
- 우측 컬럼 = 세액공제 합계(㊲) → 세부(㊳~㊶) → 가산세(㊷~㊹) → 자진납부할 세액(㊺) → 납부방법(연부연납·분납·신고납부).
- 별지 제10호서식 행 번호와 엔진 변수의 **1:1 매핑 표**를 디자인 문서에 동결(★ memory `feedback_pdf_table_row_one_to_one_mapping` 적용).
- 다른 5개 세목(양도세·상속세·재산세·종부세·취득세)의 신고서 양식 코드는 **diff 0건**.

---

## 3. 영향 범위 (Scope)

### 수정
| 영역 | 파일 | 변경 |
|---|---|---|
| 엔진 타입 | `lib/tax-engine/types/inheritance-gift.types.ts` | `FilingFormRow` 확장(`column?: "left" \| "right"`, `display` 리터럴에 `"header"` 추가) · `GiftTaxResult`에 별지 표시용 13 필드 + `besshi10Rows: FilingFormRow[]` 1 필드 = 총 14 필드 추가 (§4.3 + §빌더 attach) |
| 엔진 빌더 | `lib/tax-engine/gift-tax-filing-form-besshi10.ts` (신규, 800줄 정책상 분리) | `buildBesshi10Rows(input, result)` — ⑰~㊼ + 납부방법 헤더 행 좌·우 컬럼 배치 + 산식·근거조문 부착 |
| 결과 카드 | `components/calc/results/GiftTaxFilingFormTable.tsx` | 단일 표 → **2열 grid 또는 좌우 분할 표** 리렌더. 12행/18행 분기 제거(서식은 동일, 데이터만 다르게 채움) |
| 결과 뷰 | `components/calc/results/GiftTaxResultView.tsx` | 새 양식 컴포넌트로 교체. 인쇄 친화 스타일(`@media print`) |
| 테스트 | `__tests__/tax-engine/gift/filing-form-besshi-10.test.ts` (신규) | 행 번호 ⑰~㊼ 매핑 anchor (PDF 사례 1 값 기준) |

### 영향 없음 (그대로 둠)
- `components/calc/results/transfer/FilingFormTable.tsx` 등 **양도세 양식**.
- `components/calc/results/inheritance/*` (상속세 결과 카드).
- 재산세·종부세·취득세 결과 화면.
- `lib/calc/transfer-tax-api.ts`·`lib/validators/property-valuation-input.ts`의 비-증여세 영역.
- 기존 `buildFilingFormRows` (`gift-filing-form-rows.ts`)는 **즉시 삭제하지 않고 폐기 예정(deprecated)** 표시 후 결과 뷰 분기로 교체. 다음 PR에서 제거.

---

## 4. 별지 제10호서식 행 인벤토리 (★ 변수명 1:1 매핑)

> 이 표가 디자인 문서로 그대로 옮겨가 동결된다. 행 추가/삭제는 PDF 재캡처와 함께만 허용.
> ★ 변수명은 `lib/tax-engine/gift-tax.ts` 실측 기준 (2026-05-20). 신규 표시는 `GiftTaxResult` 미존재 필드만.

### 4.1 좌측 컬럼 (과세가액·과세표준·산출세액)

| 행 | 라벨 | 산식 / 비고 | 엔진 변수 (또는 도출) | 근거 |
|---|---|---|---|---|
| ⑰ | 증여재산가액 | 평가합산 (시가·보충적 평가 적용 후) | `result.grossGiftValue` | §60 |
| ⑱ | 비과세재산가액 | 사회통념·축의금·혼수품·이재구호금품·국가유공자 보훈급여 등 | `result.exemptAmount` (기존) | §46 |
| ⑲ | 공익법인 출연재산가액 (불산입) | | **신규** `result.publicInterestExclusion` (default 0) | §48 |
| ⑳ | 공익신탁 재산가액 (불산입) | | **신규** `result.publicTrustExclusion` (default 0) | §52 |
| ㉑ | 장애인 신탁재산가액 (불산입) | 5억원 한도 | **신규** `result.disabledTrustExclusion` (default 0) | §52의2 |
| ㉒ | 채무액 | 부담부증여 시 채무인수액 — 본 PDCA 범위 외 (display 0) | **신규** `result.debtAssumed` (default 0) | §47 |
| ㉓ | 증여재산가산액 | 동일인 10년 합산 (사전증여 합산분만) | **도출** `result.aggregatedGiftValue − (result.grossGiftValue − result.exemptAmount)` (= 사전증여 합산) → 빌더 내부 계산 후 행 amount 부착 | §47② |
| ㉔ | 증여세과세가액 | ⑰−⑱−⑲−⑳−㉑−㉒+㉓ | **도출** `result.aggregatedGiftValue` (현재 `aggregatedGiftValue = netCurrent + 사전증여`이며 ⑲⑳㉑㉒ 미구현=0이므로 산식 자기일관) | §47 |
| ㉕ | 배우자 공제 | 6억원 한도 | **도출** `donor==="spouse" ? relationDeduction : 0` | §53 |
| ㉖ | 직계존비속 공제 | 5천만원 / 미성년 2천만원 / §53의2 혼인·출산 1억 (직계존속→수증자만) | **도출** 직계존속 그룹(`father`/`mother`/`grandparent`) = `relationDeduction + marriageBirthDeduction` · 직계비속 그룹(`lineal_descendant`) = `relationDeduction` (§53의2 미적용) · 그 외 0 | §53 · §53의2 |
| ㉗ | 그 밖의 친족 공제 | 1천만원 | **도출** `donor in ["sibling","other_relative"] ? relationDeduction : 0` | §53 |
| ㉘ | 재해손실공제 | | **신규** `result.disasterLossDeduction` (default 0) | §54 |
| ㉙ | 감정평가수수료 | 500만원 한도 | **신규** `result.appraisalFeeDeduction` (default 0) | 시행령 §52의2 (Design 진입 전 KoreanLaw MCP 확정) |
| ㉚ | 과세표준 | ㉔−㉕−㉖−㉗−㉘−㉙ | `result.taxBase` (현재 산식: `aggregatedGiftValue − totalDeduction`. ㉘㉙=0 가정 시 자기일관) | §55 |
| ㉛ | 세율 | 누진세율 단계 | **도출** `appliedRateLabel` (helper: `result.taxBase`에서 brackets 조회) · `display="rate"` | §56 |
| ㉜ | 산출세액 | ㉚ × 세율 − 누진공제 | `result.computedTax` | §56 |
| ㉝ | 세대생략가산세 | §57 (직계존속 → 손자녀 등) | `result.generationSkipSurchargeDetail?.surchargeAmount ?? 0` | §57 |
| ㉞ | 산출세액계 | ㉜+㉝ | **도출** `result.computedTax + (generationSkipSurchargeDetail?.surchargeAmount ?? 0)` | — |
| ㉟ | 이자상당액 | 사후관리 위반·연부연납 가산금 등 (별지 양식상 "이자상당액") | **신규** `result.interestEquivalent` (default 0) | 상증법 §41의5·§71⑤ 등 (Design 진입 전 KoreanLaw MCP 확정 — Plan 단계에서 미확정) |
| ㊱ | 박물관자료 등 징수유예세액 | | **신규** `result.museumDeferredTax` (default 0) | §75 |

### 4.2 우측 컬럼 (세액공제·가산세·자진납부)

| 행 | 라벨 | 산식 / 비고 | 엔진 변수 (또는 도출) | 근거 |
|---|---|---|---|---|
| ㊲ | 세액공제 합계 | ㊳+㊴+㊵+㊶ | `result.totalTaxCredit` (= `creditDetail.totalCredit`) | — |
| ㊳ | 기납부세액 (사전증여 §58 안분 한도 후) | | `result.creditDetail.giftTaxCredit` (구조상 필드명은 상속·증여 공통 — 증여세에서는 §58 적용값) | §58 |
| ㊴ | 외국납부세액공제 | | `result.creditDetail.foreignTaxCredit` | §59 |
| ㊵ | 신고세액공제 | 3% (법정기한 내 신고) | `result.creditDetail.filingCredit` | §69 |
| ㊶ | 그 밖의 공제·감면세액 | 창업자금 §30의5·가업승계 §30의6 등 | `result.creditDetail.specialTreatmentCredit` (기존) | 조특법 §30의5·§30의6 |
| ㊷ | 신고불성실가산세 | (자동 계산은 후속 PR — display 0) | **신규** `result.underreportPenalty` (default 0) | 국기법 §47의2~의4 |
| ㊸ | 납부지연가산세 | (자동 계산은 후속 PR — display 0) | **신규** `result.latePaymentPenalty` (default 0) | 국기법 §47의4 |
| ㊹ | 공익법인 등 관련 가산세 | (display 0) | **신규** `result.publicInterestPenalty` (default 0) | §78 |
| ㊺ | 자진납부할 세액(합계액) | ㉞+㉟−㊱−㊲+㊷+㊸+㊹ | `result.finalTax` (현재 산식: `max(0, computedTax + 할증 − totalCredit)`. ㉟㊱㊷㊸㊹=0 가정 시 자기일관) | — |
| (헤더) | 납부방법 | 헤더 행 (column=right, display="header", 금액 없음) | — | — |
| ㊻ | 연부연납 | 6년 분납 (1천만원 초과 시) | **신규** `result.installmentPayment` (default 0) | §71 |
| ㊼ | 현금 분납 | 1천만원 초과 시 2개월 내 | **신규** `result.cashDeferred` (default 0) | §70 |
| (도출) | 신고납부 | ㊺−㊻−㊼ | **도출** `result.finalTax − installmentPayment − cashDeferred` | — |

### 4.3 신규 결과 필드 (엔진 추가)

위 매핑에서 **신규** 표시된 필드 13개를 `GiftTaxResult`에 추가(전부 optional · default 0):

```ts
interface GiftTaxResult {
  // ...기존 필드 유지 (grossGiftValue·exemptAmount·aggregatedGiftValue·taxBase·computedTax·finalTax·deductionDetail·creditDetail 등)

  // ===== 별지 제10호서식 표시 전용 (default 0, 회귀 영향 없음) =====
  publicInterestExclusion?: number;    // ⑲ §48
  publicTrustExclusion?: number;       // ⑳ §52
  disabledTrustExclusion?: number;     // ㉑ §52의2
  debtAssumed?: number;                // ㉒ §47 (부담부증여 — 본 PR 범위 외)
  disasterLossDeduction?: number;      // ㉘ §54
  appraisalFeeDeduction?: number;      // ㉙ §55의2
  interestEquivalent?: number;         // ㉟ §49의2 등
  museumDeferredTax?: number;          // ㊱ §75
  underreportPenalty?: number;         // ㊷ 국기법 §47의2/§47의3
  latePaymentPenalty?: number;         // ㊸ 국기법 §47의4
  publicInterestPenalty?: number;      // ㊹ §78
  installmentPayment?: number;         // ㊻ §71
  cashDeferred?: number;               // ㊼ §70
}
```

- 기존 합산식(`taxableValue` 대신 `aggregatedGiftValue` 사용 / `finalTax` 산식 등)은 **불변** — 추가 필드는 표 렌더 전용. 신규 필드 모두 default 0이라 회귀 0건.
- ⑲⑳㉑㉒㉘㉙㉟㊱㊷㊸㊹㊻㊼ = 13개 행 모두 본 PR에서는 **0 default**. 입력 UI는 후속 PR(범위 §6 참조).
- ㉕㉖㉗ 분리, ㉓ 사전증여 합산분, ㉞ 산출세액계, ㉛ 적용 세율 라벨, 신고납부 = **빌더 내부 도출**(신규 필드 아님).

---

## 5. PDCA 단계

### Plan (현재 단계 — 본 문서)
- 산출물: 본 계획서 + 디자인 문서(`docs/02-design/features/gift-tax-filing-form-besshi-10.engine.design.md` — 본 PDCA Step 5에서 작성).
- **케이스 인벤토리 표**: §4.1 좌측 20행 (⑰~㊱) + §4.2 우측 13행 (㊲~㊺ 9 + 납부방법 헤더 1 + ㊻㊼ 2 + 신고납부 도출 1) = 총 33행 (충족 ≥ 1).

### Design
- 엔진 시니어 + UI 시니어 **단일 메시지 병렬** 호출(Plan 병렬 / Do 시퀀셜 패턴, 사례 36 검증).
- 엔진 디자인: §4 표 그대로 옮긴 PDF 행 번호 ↔ 변수명 매핑 표 + 신규 13 필드 타입 명세 + `buildBesshi10Rows` 시그니처 + 도출 헬퍼(`appliedRateLabel`·㉓ 사전증여합산·㉕㉖㉗ 관계별 분기).
- UI 디자인: 2-column grid 마크업 시안 + 인쇄 스타일(`@media print { font-size: 11px; ... }`) + 행 번호 원형 칩 직접 입력 + 좌측 20행 / 우측 13행 정렬 가이드.

### Do
1. 엔진 시니어 — `gift-tax-filing-form-besshi10.ts` 신규 분리(~250줄 추정)·`GiftTaxResult` 신규 13 필드 optional + `besshi10Rows: FilingFormRow[]` 1 필드 추가·`buildBesshi10Rows` 구현 → `gift-tax.ts`는 결과 객체에 default 0 echo + `besshi10Rows: buildBesshi10Rows(...)` attach. **빌더 호출 위치 = 엔진 attach** (UI 호출 옵션 기각 — `brackets` 매개변수가 엔진 내부 상수이므로). 800줄 정책 준수.
2. UI 시니어 — `GiftTaxFilingFormTable.tsx` 2열 grid 리렌더. 사례 1형 / 사례 2형 분기 제거(서식은 동일, 데이터만 다르게 채움). 인쇄용 CSS 모듈 추가.
3. 14개 동기화 지점 중 증여세 결과 화면 영향분 점검 — 본 변경은 result echo + 표시 전용이라 input/Zod/API/사이드바·validation 영향 없음 (①②③④⑥⑧⑨⑩⑪⑫⑬⑭ N/A, ⑤⑦만 변동).

### Check
- `ui-engine-sync-checker` 호출(증여세 한정).
- 사례 1 (현 12행) · 사례 2 (현 18행) 기존 anchor 100% 보존 (`grossGiftValue`·`aggregatedGiftValue`·`taxBase`·`computedTax`·`finalTax` 값 불변).
- 신규 anchor: 사례 1 PDF 기준 값 있는 행 14건 (⑰ 510M / ㉓ 1,010M / ㉔ 1,520M / ㉖ 50M / ㉚ 1,470M / ㉛ 40% / ㉜ 428M / ㉞ 428M / ㊲ 234M / ㊳ 228M / ㊵ 6M / ㊺ 194M / ㊼ 97M / 신고납부 97M) + 산식 자기일관성 anchor 4건(㉔ = ⑰−⑱+㉓ / ㉚ = ㉔−㉕−㉖−㉗ / ㉞ = ㉜+㉝ / ㊺ = ㉞+㉟−㊱−㊲+㊷+㊸+㊹).
- 브라우저 수동: PDF와 한 화면 나란히 비교 → 행 번호·금액 매칭. 인쇄 미리보기로 A4 1장 또는 2장 안에 들어가는지 확인.

### Act
- 다른 5개 세목의 신고서 양식 표가 변경되지 않았음을 `git diff --stat` 으로 명시 확인.
- 회귀 후속: 사례 1·2 외 추가 PDF 케이스 도입 시 본 표를 그대로 재사용.
- `buildFilingFormRows` (구) 제거 PR (별도, 본 PR 안정화 후).

---

## 6. 비범위 (Out of Scope — 후속 PR)

- 양도소득세 / 상속세 / 재산세 / 종합부동산세 / 취득세 결과 화면·신고서 양식 — **수정 금지**.
- 별지 제10호서식 상단 ①~⑯ 인적사항(수증자·증여자 성명·주민등록번호·주소·전화번호·세무대리인) — 본 PDCA는 본문 ⑰~㊼ 행만 다룬다. 인적사항 UI는 입력 마법사 Step 0에서 이미 수집되며, 인쇄 양식 통합은 후속 PR.
- 부담부증여 채무액(㉒) — 본 PR에서는 0 default. 부담부증여 PDCA Phase 3은 양도세 기준 완료, 증여세 통합은 다른 트랙.
- 공익법인·공익신탁·장애인신탁 출연(⑲⑳㉑) 입력 UI·검증·평가 — 0 default 표시. 신규 EstateItem category 또는 별도 input 필드 도입은 후속.
- 재해손실공제(㉘)·감정평가수수료(㉙) — 0 default. 입력 마법사 추가는 후속.
- 가산세 자동 계산(㊷·㊸·㊹) — 본 PDCA는 행 노출(0 default)까지. 실제 가산세 계산 엔진은 별도 PDCA(국기법 §47의2~의4 통합 모듈).
- 연부연납·분납·신고납부(㊻·㊼) — 행 노출 + 0 default. 입력 UI·검증은 후속.
- 이자상당액·박물관자료 징수유예(㉟·㊱) — 0 default.

---

## 7. 리스크 / 정책 준수

- ★ **PDF 행 번호 ↔ 변수명 1:1 매핑**: §4 표가 단일 진실. 행 추가·삭제 시 PDF 재캡처 첨부 의무 (memory `feedback_pdf_table_row_one_to_one_mapping`).
- ★ **법령 정확성**: KoreanLaw MCP로 ㉟ 이자상당액 (§49의2 후보), ㉝ "세대생략가산세" 라벨, ㊳ 기납부세액 산식 인용을 Design 진입 전 검증(memory `feedback_korean_law_82_vs_81_2_drift`).
- ★ **자동 안분 fallback 금지**: 신규 13 필드는 모두 명시 입력 또는 0 default. UI 미입력을 0으로 silent 채움 OK(과세가액에 영향 없음 — `aggregatedGiftValue`·`finalTax` 산식 불변).
- ★ **다른 세목 무수정**: PR diff에 `components/calc/results/transfer/`·`inheritance/`·`property/`·`comprehensive/`·`acquisition/` 등이 포함되지 않음을 확인 후 push.
- ★ **별지 제10호서식 개정 이력**: PDF 캡션 "[2020.03.13. 개정]" — Design 진입 전 KoreanLaw MCP `chain_law_system` 등으로 최신 개정 여부 확인. 더 최신 양식(예: 2022·2023 개정)이 있으면 그것을 기준으로.
- ⚠ **㉔ ㉚ ㊺ 산식 자기일관성**: 현재 ⑲⑳㉑㉒㉘㉙㉟㊱㊷㊸㊹ 가 모두 0이므로 `aggregatedGiftValue = ㉔`, `taxBase = ㉚`, `finalTax = ㊺` 이 PDF 산식과 일치. 향후 이들 행이 0이 아닌 값을 가지면 엔진 산식 재검토 PDCA 필요.

---

## 8. 산출물 체크리스트

- [x] 본 계획서 (`docs/00-pm/gift-tax-filing-form-besshi-10.plan.md`) — 1차 검토·정정 반영 완료
- [ ] 디자인 문서 (`docs/02-design/features/gift-tax-filing-form-besshi-10.engine.design.md`) — Step 5 작성
- [ ] 엔진 신규 13 필드 + `buildBesshi10Rows` (`lib/tax-engine/gift-tax-filing-form-besshi10.ts`)
- [ ] UI 2열 grid + 인쇄 스타일 (`components/calc/results/GiftTaxFilingFormTable.tsx`)
- [ ] 행 ⑰~㊼ 매핑 + 산식 자기일관성 anchor (`__tests__/tax-engine/gift/filing-form-besshi-10.test.ts`)
- [ ] 다른 5개 세목 영역 diff 0건 확인 (`git diff --stat components/calc/results/{transfer,inheritance,property,comprehensive,acquisition}` → 0)
- [ ] 브라우저 수동 PDF 대조 + 인쇄 미리보기 확인 (A4 1장 또는 2장 안 수렴)
- [ ] **후속 PR**: `lib/tax-engine/gift-filing-form-rows.ts` (`buildFilingFormRows`) + `GiftTaxResult.filingFormRows` 제거 — 본 PR 안정화 후 별도 작업

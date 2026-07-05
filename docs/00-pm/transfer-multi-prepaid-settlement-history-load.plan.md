# 다건 양도세 연간 합산 — 기납부세액 정산 + 이력 불러오기 (계획서)

> 상태: **Plan (self-review 1차 정정 반영)** — plan-design-self-review-loop STEP 1~2 적용(정정 27건).
> 작성일: 2026-07-05
> 세목: 양도소득세 / 연간 합산 과세(다건, `/calc/transfer-tax/multi`)

---

## 0. 한 줄 요약

연간 합산 과세를 **확정신고 정산 수준**으로 완성한다: 이미 구현된 총결정세액·비교과세·§133 감면한도·양도차손 통산 위에 **① 예정신고 기납부세액 차감(→ 추가납부/환급)** 엔진과 **② 이력 불러오기 UX(단건·다건 소스, 기납부 참고 자동채움 + 수동확정)** 를 추가한다.

---

## 1. 배경 · 문제

**실무 흐름**: 같은 과세연도에 1월 양도→3월 예정신고, 5월 양도→7월 예정신고… 처럼 양도가 여러 번 나뉘어 발생하고, 각 건은 예정신고로 세금을 이미 납부한다. 이듬해 5월 **확정신고** 때 전체를 합산해 총세액을 재계산하고 **기납부한 예정신고세액을 공제**한다.

**현재 우리 도구의 공백**:
- 다건 계산기는 자산을 매번 **처음부터 다시 입력**해야 한다(이력 불러오기 없음).
- 집계 엔진이 **기납부세액을 차감하지 않는다** → 산출값이 "연간 총결정세액"일 뿐 "확정신고 시 실제 추가납부/환급액"이 아니다.

두 공백을 함께 메워야 실무 시나리오(누적 양도 → 확정신고 정산)가 완결된다.

---

## 2. 법적 근거 (KoreanLaw 검증 완료, 2026-07-05)

- **소득세법 §111③ (확정신고납부)** — *"확정신고납부를 하는 경우 제107조에 따른 예정신고 산출세액, 제114조에 따라 결정·경정한 세액 또는 제82조·제118조에 따른 수시부과세액이 있을 때에는 이를 공제하여 납부한다."*
  → 확정신고 = **결정세액 − 예정신고 기납부세액 = 추가납부(양수)/환급(음수)**. 본 기능의 직접 근거.
- **소득세법 §111① (확정신고납부)** — 확정신고 세액 = **산출세액 − 감면세액 − 세액공제액**(= 결정세액). ※ 산출세액은 과세표준에서 도출.
- **소득세법 §107② (예정신고 산출세액, 2회 이후 합산)** — 2회 이후 예정신고는 `[(A+B−C)×D] − E` (E = 이미 신고한 예정신고 산출세액)로 **누적 합산**. 즉 **예정신고 자체가 2회차부터 러닝 합산**이다. 단, D는 **단일 세율군**(§104①1호/8·9호/11호가목2/14호)별 누진세율이며 **비교과세(§104⑤)·§133 연간 종합한도의 확정 정산은 예정신고에 미반영**이다(§2-A 주의).
- **조세특례제한법 §133 (감면 종합한도)** — 연간/5년 한도. **이미 집계 엔진에 연결됨**(`aggregate-reduction-limits.ts` → `transfer-tax-aggregate.ts:261-264`).

### §2-A. ⚠️ "예정 basis ≠ 확정 basis" (자동채움 정확도의 한계 — Critical 해소)
우리 다건 엔진의 `AggregateTransferResult.determinedTax`는 **확정신고 basis**다: 비교과세(§104⑤ `MAX(byGroups, byGeneral)`, types:264-270) + §133 연간/5년 capping(aggregate:261-264)이 **반영된** 값. 반면 §107② **예정신고 산출세액**은 단일 세율군 러닝 누진일 뿐 비교과세·§133 확정 정산을 하지 않는다. ⇒ **중과·비교과세·§133 발동 시 `determinedTax ≠ 실제 예정신고 기납부액`**. 따라서 이력에서 끌어온 자동채움은 **정확한 기납부가 아니라 참고 추정값**이며, 사용자가 **실제 예정신고 납부액으로 수동확정**해야 한다(§5-2). "예정신고 산출세액 자체의 재현"은 범위 외(§10).

### §2-B. §107 telescoping (다건 소스가 단건 합보다 나은 이유)
모두 §107② 합산 방식으로 예정신고한 경우:
```
예정신고1 = T1
예정신고2 = T12 − T1        (E=T1,  T12 = (소득1+소득2) 누진 산출세액)
예정신고3 = T123 − T12       (E=T12)
Σ 기납부  = T1 + (T12−T1) + (T123−T12) = T123  ← 마지막 러닝 합산 산출세액
```
반면 각 건을 **단독**으로 예정신고했다면 `Σ기납부 = T1 + T2 + T3`(누진 상향분 누락). **T123 ≠ T1+T2+T3.** ⇒ 3회 이상 양도 시 단건 이력만으로는 러닝 합산을 재현 못 하므로 **다건 결과 불러오기가 필요**(결정 3). 다만 §2-A대로 다건 `determinedTax`도 확정 basis라 **참고 추정**이다.

---

## 3. 현황 실측 — "완전한 통합"의 80%는 이미 구현됨

`transfer-tax-aggregate.ts` / `types/transfer-aggregate.types.ts` 실측 결과(오류 fork 재검증 완료):

| 구성요소 | 상태 | 근거(file:line) |
|---|---|---|
| 연간 총결정세액 | ✅ | `AggregateTransferResult.determinedTax` = max(0, calculatedTax − reductionAmount) (types:283) |
| §133 감면 종합한도(연/5년) 재계산 | ✅ | `applyAnnualLimits`/`applyFiveYearLimits` 연결 (aggregate:261-264) |
| 비교과세(§104⑤) | ✅ | `calculatedTaxByGroups` vs `byGeneral` MAX (types:264-270) |
| 양도차손 통산(§102) | ✅ | M-3 `lossOffsetTable`, `unusedLoss` |
| 기본공제 연1회 250만 | ✅ | M-4, `annualBasicDeductionUsed` 입력 (aggregate:159-180) |
| 자산별 참고 기납부(단독 결정세액) | ✅ | `PerPropertyBreakdown.refDeterminedTax` (types:126-132) — **재사용**(신규 필드 불요) |
| 자산별 가산세(§114의2·신고불성실·납부지연) | ✅ | `penaltyTax`, `properties[].penaltyDetail` |
| 신고서 단위 수정신고·경정청구 | ✅ | `amendment?`→`amendmentDetail?` (§45·§45의2, PR#496) |
| 예정신고 기납부세액 차감 (**엔진**) | ❌ | 엔진 입력·결과 타입에 **필드 없음**(grep 확인) |
| 정산 **표시**(기납부·이번 납부할세액·지방세 기납부·납부할세액) | ⚠️ **이미 존재하나 결함** | `MultiTransferTaxSummaryCard:182-197` 렌더. 단 **(a) UI 자체계산**(dual-truth `:122-129`), **(b) `autoPriorPaid=앞 자산 결정세액(refDeterminedTax) 합`(`:116-119`)** = §107② 위반 단순합·refDeterminedTax 부정확, **(c) caller(`MultiTransferTaxCalculator:597`)가 `priorPaidTax`/`priorPaidLocalTax` 미전달** → 사용자 기납부 입력 경로 없음 |
| 지방소득세 기납부 (**표시**) | ⚠️ 이미 존재 | `priorPaidLocalTax`(SummaryCard:100,127,189) — D5 "후속" 전제 오류 |

**결론(재정의 — STEP 13 발견)**: **greenfield 아님.** 실제 과제 = ① 기존 SummaryCard **UI 자체계산(dual-truth) → 엔진 result 단일진실 이관**, ② 결함 `autoPriorPaid`(단순합) **격하/제거**, ③ 사용자 **기납부(국세+지방) 입력 위젯 + 불러오기 override 공급**, ④ **caller 배선**(`priorPaidTax`/`priorPaidLocalTax` 전달). ⇒ 이하 §5·§7·엔진/UI 설계는 "신규 카드"가 아니라 **기존 결함 UI의 리팩터**로 재해석 필요(approach 결정 D8).

### 재사용 가능한 인프라 (실측)
- **이력 저장**: 다건 결과는 전체 `MultiTransferFormData`(properties[].form 포함)를 IndexedDB에 자동저장(B0). 단건은 `resultData.result.determinedTax` 저장. (`CalculationRecord` = `storage/types.ts:59`)
- **이력→store hydrate 패턴**: `enterMultiAmendment`(`transfer-amendment-entry.ts:128-151`)가 record 전체 폼을 multi store로 주입 + clientId 세팅(:146). **다건 불러오기는 이 골격 재사용**(정정 플래그 없이, priorPaid seed).
- **record 분류·stub 배제**: `classifyAmendableTransfer`(:30)가 single/bundled/multi 판별, stub record(properties[].form 부재) 배제 가드(:49).
- **모달 UI 템플릿**: `PriorGiftHistoryModal.tsx`(414줄) — 이력 조회+선택+자동채움 Dialog 패턴. `history-lookup-modal` 스킬. sourceCalculationId provenance 패턴 참고.

---

## 4. 확정된 결정사항 (사용자, 2026-07-05)

1. **범위**: 엔진(기납부 정산) **+** 불러오기 UX 둘 다.
2. **기납부세액 입력**: 이력 **참고 자동채움 + 수동확정(편집) 필수**.
3. **불러오기 소스**: 단건 이력 **+ 다건 이력** 모두. (§2-B: 3회 이상 양도 시 다건 결과 불러오기 필수.)

---

## 5. 설계 방향

### 5-1. 엔진 — 기납부세액 정산 (v1 = 정상 확정신고 정산)
확정신고 정산은 **신고서(filing) 단위 1건**(§111③: 하나의 확정신고에서 총 예정신고세액 공제).

- **입력**: `AggregateTransferInput.priorPaidTax?: number` — 확정신고 시 공제할 **총 예정신고 기납부세액(양도소득세 국세분)**. 미지정 시 0(기존 동작 불변, 자동 안분·추정 없음). ※ 명칭은 기존 `transfer-tax-penalty.ts:40` `priorPaidTax`(동일 개념)와 일관 — 신조어 아님.
- **입력(지방 포함, D5)**: `priorPaidTax?`(국세) + `priorPaidLocalTax?`(지방) — 기존 SummaryCard `priorPaidLocalTax` 이관.
- **결과 6필드** (명칭 충돌 회피 — `refundTax`는 amendment 도메인 `transfer-tax-amendment.ts:139`. 전부 required number):
  - `priorPaidTax`·`priorPaidLocalTax` — 적용 기납부([echo])
  - `settlementAdditionalPayable` = `max(0, (determinedTax+penaltyTax) − priorPaidTax)` — 국세 이번 납부할세액(기존 카드 `currentTaxDue` 이관, base에 penaltyTax 포함)
  - `settlementRefund` = `max(0, priorPaidTax − (determinedTax+penaltyTax))` — 국세 환급
  - `settlementLocalPayable` = `max(0, localIncomeTax − priorPaidLocalTax)` — 지방 납부할세액
  - `settlementTotalDue` = `settlementAdditionalPayable + settlementLocalPayable` — 최종 납부할세액(기존 카드 `totalDue`)
- **정산 base = `determinedTax`**(가산세 제외). v1은 **정상 확정신고(penalty=0)** 전제. penalty>0(무신고·지연) 시 납부지연가산세 base는 기납부 차감 후 미납분이어야 하므로 **penalty>0 및 amendment×prepaid 동시 적용은 v1 범위 외**(§10, D6).
- **정산 스텝 항상 실행(타입 안전)**: 엔진은 `P = priorPaidTax ?? 0`로 **항상** 정산 필드 산출(스텝 skip 없음 → result 필드 required 안전). amendment×prepaid **상호배타는 validate/UI 가드**(동시 입력 차단)이지 엔진 skip 아님. 순수 헬퍼 `computeSettlement(D,P)`(computeAmendment 미러) 신설 — orchestrator는 `determinedTaxBeforePenalty`(aggregate:338) 직후 `computeAmendment(:344)` 병렬 호출 1줄. (설계 §계산 알고리즘)
- **음수 차단**: `priorPaidTax < 0` 은 validate에서 **차단(필수)**. 과대 입력(> determinedTax는 정상=환급이나 비현실적 초과)은 경고.
- **비과세 자산**: determinedTax 기여 0 → 자동채움 += 0(투명, 각주).

### 5-2. 불러오기 UX — 참고 자동채움 + 수동확정
- **진입점(2곳, D7)**: 다건 자산목록(StepList) + 자산편집 헤더/AssetTabBar 양쪽에 **"이력에서 불러오기"** 버튼. (마운트 useEffect `:366-368`가 신규 진입 시 blank property auto-add + edit 진입 → StepList를 가리므로 edit 모드에서도 진입 가능해야 함.)
- **모달**: `PriorGiftHistoryModal` 패턴 차용. transfer 이력 + **활성 clientId 필터**(세무사 모드 격리). 중복 record 재로드 경고(dedup).
- **경로 2개**:
  - **다건 record 선택** → `loadMultiRecordIntoSession`(enterMultiAmendment 골격 재사용, 정정 플래그 없이). properties[] 전체 **replace** hydrate. priorPaidTax 자동값 = `record.determinedTax`, `priorPaidTaxEdited=false`, `setActiveClientId`.
  - **단건 record 선택** → `appendSingleRecordAsProperty`. `addProperty(form=record.inputData)` + priorPaidTax 자동값 **+= `record.resultData.result.determinedTax`**.
  - 두 경로 모두 property에 `sourceCalculationId` 메타 기록.
- **참고 추정 경고(필수)**: 자동채움 값은 §2-A대로 **확정 basis 추정**이라 실제 예정신고 납부액과 다를 수 있음 → 배너 "자동값은 참고입니다. 실제 예정신고 납부액으로 확인하세요." **소스 혼용(다건+단건) 시 특히** telescoping/단독합 불일치 안내.
- **store 모델(mirror-pattern 준수)**: 단일 `priorPaidTax: string`(폼값, API에서 number 파싱) + `priorPaidTaxEdited: boolean`. **자동값은 불러오기 이벤트 핸들러에서 1회 기록**(`String(record.determinedTax)`, useEffect→store 미러 금지, 무한루프 회피). 사용자 편집 시 `edited=true`. 이후 불러오기는 `edited=true`면 침묵 덮어쓰기 금지 → Dialog 확인(편집값 존중, 결정2). replace(다건 로드) 시 기존 편집값 있으면 폐기 확인(Dialog, native confirm 금지).

### 5-3. 결과 표시 (dual-truth 회피)
- **기존 `MultiTransferTaxSummaryCard` 리팩터(approach A, 신규 카드 아님)**: UI 자체계산(`autoPriorPaid`·`currentTaxDue`·`currentLocalTaxDue`·`totalDue` `:112-129`) **제거** → `result.settlementAdditionalPayable`/`settlementLocalPayable`/`settlementTotalDue` **read**(dual-truth 해소, UI 재계산 금지). 기존 렌더 행(기납부·이번 납부할·지방 기납부·납부할세액 `:182-197`) 레이아웃 유지, 소스만 엔진. 한국어 풀어쓰기(feedback_result_view_korean_formula · feedback_ui_engine_dual_truth_avoidance).
- **실납부 headline ↔ totalTax 정합**: `totalTax`(결정+가산+지방, gross)는 불변 유지하되, **P>0 시 실제 납부액 = `settlementAdditionalPayable`**(환급 시 `settlementRefund`). `AmendmentResultCard`가 `fullTotalTax={result.totalTax}` 사용(`MultiTransferTaxResultView:694`) → prepaid 존재 시 총액↔실납부 불일치 분기(feedback_engine_result_display_drift).
- **신고서 양식 파급**: 다건 결과뷰 `FilingFormTable`(별지 제84호, `:19,507`)에 **기납부세액·납부할세액(=settlementAdditionalPayable) 행 추가**(besshi-form-replica).
- **지방소득세 정산 포함(D5, approach A)**: 국세(`settlementAdditionalPayable`)·지방(`settlementLocalPayable`)·최종(`settlementTotalDue`) 모두 엔진 result read로 표시. 기존 카드가 이미 지방 행을 렌더하므로 별도 문구 아닌 **실제 지방 정산**.
- **환급 방향 명시**: 예정신고 때 감면 미신청 → 확정신고 첫 감면 시 기납부 > 확정결정 → **환급**. 추가납부(§133 초과)·환급 양방향 모두 카드에 반영. 차손통산으로 결정세액 0인데 기납부>0이면 전액환급(케이스 #8).
- **§133 경고 2단 분리**: ① 감면 종합한도 초과 배제 X원(상시, `reductionBreakdown.cappedByLimit`) / ② 그로 인한 정산 추가납부 영향(priorPaidTax 존재 시에만). 사용자 오해("왜 더 내지?") 방지.
- **사이드바**: 추가납부/환급은 **엔진 result 도착 후에만** 표시(result 전 추정 분기에서 재계산 금지 — 2차 dual-truth 회피). 노출 여부는 UI 설계에서 판단.

### 5-4. 미결 → 설계/후속
지방소득세 기납부(D5), penalty>0·amendment 상호작용(D6)은 v1 범위 외(§10).

---

## 6. 핵심 설계 결정 (검토 반영 후 현황)

- **D1. 기납부세액 모델 — filing-level 단일 필드(확정).** `AggregateTransferInput.priorPaidTax` 하나. §111③(신고서 단위 공제) 부합, §2-B telescoping 수용(다건 로드 시 그 determinedTax를 참고값으로), 14지점 배관 최소. per-property 참고값은 **기존 `refDeterminedTax` 재사용**(신규 필드 불요) — 단 집계 컨텍스트서 `skipBasicDeduction=true`로 산출된 **근사**(aggregate:405), 정확 기납부는 사용자 확정.
- **D2. 다건 record 불러오기 = replace 후 이어서 추가.** 기존 properties/편집값 있으면 폐기 확인(Dialog, feedback_dialog_data_discard_confirm).
- **D3. 과세연도 일관성 검증.** 다른 `taxYear` record 불러오기 차단/경고(연간 합산은 동일 과세기간).
- **D4. 기납부 자동채움 = 참고 추정(수동확정 필수).** 단건 append 누적·다건 replace 모두 자동값은 참고. **소스 혼용/§107② 신고 시 불일치 가능**을 배너로 안내, 사용자 수동확정. (Critical 2건 해소.)
- **D5. 지방소득세 기납부 — 이미 UI에 존재(격하 아님).** `priorPaidLocalTax`(SummaryCard:100,127,189)로 지방세 기납부·납부할세액 이미 렌더. ⇒ v1에서 **국세+지방 함께** 입력·정산(기존 "국세만·별도 문구" 방향 폐기). 자동채움 소스: 각 record `resultData.result.localIncomeTax`.
- **D8. approach 결정(STEP 13 발견 — 사용자 판단 필요).** 기존 SummaryCard 정산 UI를 (A) **엔진 단일진실로 이관**(dual-truth 정책 준수, 리팩터 큼) vs (B) **최소 배선**(입력 위젯+불러오기만 붙이고 UI 자체계산 유지, autoPriorPaid만 격하). 정책상 A 권고, 그러나 shipped 카드 리팩터 리스크 존재.
- **D6. penalty>0 · amendment×prepaid 상호작용** — v1 범위 외(§10). 정상 정산 penalty=0 전제.
- **D7. 불러오기 진입점** — StepList + edit 헤더 양쪽(마운트 auto-add로 StepList 가려지는 문제 회피).

---

## 7. 구현 범위 — 다건 파이프라인 동기화 지점 (신규 필드별 14지점 도달 경로)

> 다건 파이프라인: `MultiTransferFormData` → `multi-transfer-tax-api` → **`lib/api/transfer-tax-schema.ts` `multiInputSchema`(Zod)** → route.ts 매핑 → `AggregateTransferInput`. 신규 필드: 입력 `priorPaidTax`(+`priorPaidTaxEdited` UI 전용) · 결과 `priorPaidTax`/`settlementAdditionalPayable`/`settlementRefund`.

**엔진**
1. `types/transfer-aggregate.types.ts` — `AggregateTransferInput.priorPaidTax?` + `AggregateTransferResult.{priorPaidTax, settlementAdditionalPayable, settlementRefund}` (전부 required 원시 number, Record 아님/Map 아님. `priorPaidTax`는 **[echo]** 태그).
2. `transfer-tax-aggregate.ts` — `determinedTaxBeforePenalty`(:338) 직후 순수헬퍼 `computeSettlement(D,P)`(신규 `transfer-tax-settlement.ts`, computeAmendment 미러) 호출, 정산 step append(**항상 실행**, `P = priorPaidTax ?? 0`). 상수 `FINAL_RETURN_SETTLEMENT`(§111③) → `legal-codes/common.ts`.

**클라이언트 8지점**
3. ①폼 타입: `MultiTransferFormData.priorPaidTax: string`("0" 기본 — 금액 폼 **문자열 관례** `annualBasicDeductionUsed:"0"` `multi-transfer-tax-store.ts:62` 일치, CurrencyInput 바인딩) + `priorPaidTaxEdited: boolean`(UI 전용, API 미전송).
4. **②initial**: multi store initial state(`:58-62` 인라인 — named factory 부재)에 `priorPaidTax: "0"`, `priorPaidTaxEdited: false` (`feedback_store_default_vs_ui_display_fallback`).
5. **③normalize**: multi store persist rehydrate/migrate에서 동일 기본값 보장(누락 시 3중 불일치).
6. ④API 변환: `multi-transfer-tax-api.ts` — 폼 문자열 `priorPaidTax` → **number 파싱 후 filing-level**로 spread(⚠️ `callMultiTransferTaxAPI`는 per-property `form.assets?.[0]` 매퍼이므로 properties 루프가 아닌 **최상위 body에** 추가). `priorPaidTaxEdited`는 전송 제외.
7. ⑤UI 위젯: `AggregateSettingsPanel`에 기납부세액 CurrencyInput(select-on-focus 자동, filing-level 배치 정당 — 이미 taxYear·annualBasicDeductionUsed 보유 `:50`) + 자동/편집 배지. **명시 prop 추가 시 spread+grep 자가점검**(feedback_explicit_prop_mapping_strip).
8. ⑥사이드바: 정산액 표시(§5-3, result 후에만).
9. ⑦결과 카드: 정산 카드 + §133 2단 경고(§5-3), 엔진값 read-only.
10. ⑧validate: `multi-transfer-tax-validate.ts` — 음수 **차단(필수)** + 과대 경고. **API fallback(`priorPaidTax ?? 0`)과 동일 fallback**(feedback_validation_sync_8th_point, UI 통과↔validate 차단 모순 금지).

**API/Route 6지점**
11. **⑫ Zod**: `lib/api/transfer-tax-schema.ts` `multiInputSchema`에 `priorPaidTax: z.number().min(0).optional()` 추가 (⚠️ route.ts inline 아님 — 오류 fork 정정. 침묵 strip 지점).
12. **⑬ body spread**: `multi-transfer-tax-api.ts` fetch body(위 6과 동일 지점, filing-level).
13. **⑭ Route 매핑**: `app/api/calc/transfer/multi/route.ts`에서 파싱값 → `AggregateTransferInput.priorPaidTax` 매핑(number, Date 변환 불요).
14. (⑨⑩⑪ 자산-수준 enum·companion·acquisitionDate fallback — 본 필드는 filing-level이라 해당 없음. 명시.)

**불러오기 전용(비-14지점)**
15. `MultiTransferHistoryLoadModal`(신규, PriorGiftHistoryModal 차용) + `loadMultiRecordIntoSession`/`appendSingleRecordAsProperty`(`transfer-amendment-entry.ts` 인접). clientId 필터·sourceCalculationId·dedup·taxYear 검증(D3).

---

## 8. 리스크 · 주의

- **⑫ 위치 함정**: Zod는 `transfer-tax-schema.ts` `multiInputSchema`(route.ts:24 import). route.ts inline 착각 시 침묵 strip(오류 fork).
- **⑫⑬⑭ + ②③ 침묵 strip**: grep 자가점검 필수(feedback_api_zod_schema_sync).
- **불러오기 진입점 도달불가**: mount auto-add(`:366-368`)로 StepList 가림 → D7 양쪽 진입점.
- **자동채움 오해**: 확정 basis ≠ 예정 basis(§2-A). 참고 배너 없으면 사용자가 자동값을 정확값으로 오신 → 정산 오류. 배너 필수.
- **useEffect 미러 무한루프**: 자동값을 useEffect로 store에 쓰면 Maximum update depth. **이벤트 핸들러 1회 기록**(mirror-pattern).
- **dual-truth**: 정산액은 엔진 단일진실. UI/사이드바 재계산 금지.
- **회귀**: priorPaidTax 미지정 다건은 0으로 동작 불변. 기존 다건 테스트 전량 통과 게이트.
- **stub record 배제**: 구 다건 stub(properties[].form 부재)은 불러오기 제외(:49 가드 재사용).

---

## 9. 검증 기준 (Pre-Do anchor 우선)

Do 진입 전 anchor 먼저 작성·실행(pre-do-anchor-verification):

- **A1 (기납부 차감)**: 2자산 determinedTax=D, priorPaidTax=P<D → `settlementAdditionalPayable = D−P`, `settlementRefund=0`. **결과 카드 표시값이 엔진값과 일치**(dual-truth 자기일관).
- **A2 (환급)**: P>D → `settlementRefund = P−D`, `settlementAdditionalPayable=0`.
- **A3 (§133 초과→추가납부)**: 자경농지 감면 2건 합계 > 연 1억 → 확정 감면 capping → 확정결정 > 예정합계 → `settlementAdditionalPayable > 0`. **가장 중요.**
- **A4 (다건 불러오기 hydrate)**: 다건 record 불러오기 → N properties 복원 + priorPaidTax 자동값 = `record.determinedTax` + `priorPaidTaxEdited=false`. (실 UI E2E, 이력→불러오기 실플로우 — feedback_e2e_client_nav_no_reload_vs_sessionstorage_race.)
- **A5 (회귀)**: priorPaidTax 미지정 다건 → **기존 필드 비트 동일** + 신규 3필드(P=0) 추가. 기존 `transfer*aggregate*` 스위트 전량 통과.
- **A6 (telescoping 참고값)**: 다건 record[자산1+2] determinedTax=T12 로드 → 단건[자산3] append → priorPaidTax 자동값 **= T12 + T3(단독합 아닌 누적)** 이고, **참고 배너 노출** 확인. (§2-B 소스혼용 안내 검증.)
- **A7 (음수 차단)**: priorPaidTax<0 → validate 차단, API·UI 동일.
- **A8 (차손통산 전액환급)**: 양도차손 통산으로 determinedTax=0 인데 priorPaidTax=P>0 → `settlementRefund = P`(케이스 #8).
- **A9 (상호배타 가드)**: amendment + priorPaidTax 동시 지정 → validate 차단(v1 UX 가드, 엔진은 항상 P??0 실행).

**게이트**: `npx tsc --noEmit` 0건 · `npx vitest run __tests__/tax-engine/transfer*aggregate*` 통과 · 다건 E2E 통과 · 브라우저 수동 확인(폼→불러오기→계산→정산 카드, Network body에 priorPaidTax filing-level).

---

## 10. 범위 외 (SCOPE OUT)

- 예정신고 산출세액 **자체의 §107② 러닝 합산 재현**(기납부는 *입력*; 예정신고 계산기 별도 미구현). ⇒ 자동채움은 참고 추정.
- **penalty>0(무신고·지연) 정산 순서** + **amendment(§45·§45의2)×prepaid 동시 적용** — v1 분리(정상 확정신고 penalty=0 전제). 무신고 자산 기납부=0, 무신고가산세는 기존 `penaltyTax` 경로.
- 지방소득세 기납부 정산 — D5에서 포함 결정 시에만.
- 부담부증여·겸용주택·general_building 일괄 등 비-일반 다자산 record 불러오기(classifyAmendableTransfer 기존 배제 유지).
- 결정·경정세액(§114)·수시부과(§82) 공제(§111③ 후단) — 예정신고 기납부만 1차 대상.

---

## 11. 후속 판단

self-review STEP 3~13 계속: blast-radius 재검토(STEP 3~4) → 엔진 설계 문서(STEP 5, `.engine.design.md`) → 설계 검토(STEP 6~9) → 통합비교(STEP 10~11) → UI 설계 문서(STEP 12, `.ui.design.md`) → UI 검토(STEP 13) → Pre-Do anchor → Do(엔진 먼저 커밋 → 불러오기 UX 후속, 리스크 격리).

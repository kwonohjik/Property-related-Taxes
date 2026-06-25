# §42의3 재산 취득 후 재산가치 증가에 따른 이익의 증여 — 엔진 설계

> 계획서: `docs/00-pm/gift-value-increase-42-3.plan.md`
> 대상 엔진: `lib/tax-engine/gift-deemed/value-increase.ts` (기존 41줄 — echo 보강)
> 범위: 사유·5년요건 **가시화 echo**(산식 불변, 회귀 0) + 4사례 anchor + 증여세 통합 anchor

## Context

상증법 §42의3 / 시행령 §32의3. 자력 없는 자가 ①각호 사유로 취득한 재산이 5년 내 재산가치증가사유로 증가한 이익을 증여재산가액으로 의제. 산식(이익·기준금액)은 **이미 정확 구현됨**(`calcValueIncreaseGift`). 본 설계는 적용요건(취득사유·가치증가사유·5년)을 **echo 필드로 가시화**하되 산식에는 영향을 주지 않는다.

## ★ 케이스 인벤토리 (필수)

> 입력 단위 원. 증여재산가액 = `currentValue − acquisitionCost − normalIncrease − contribution` (음수 가드 0).
> 기준금액 = `MIN((acqCost+normal+contrib)×30%, 3억)`. `applied = value0 > 0 && value0 ≥ threshold`.

| ID | 사례 | acqCause | reason | currentValue | acqCost | normal | contrib | **deemedGiftValue** | threshold | applied | 증여세 computedTax |
|---|---|---|---|---|---|---|---|---|---|---|---|
| VI-CASE1 | 형질변경 | `gift` | `form_change` | 2,000,000,000 | 100,000,000 | 10,000,000 | 20,000,000 | **1,870,000,000** | 39,000,000 | ✓ | 580,000,000 (미성년) |
| VI-CASE2 | 공유물분할 | (미지정) | `partition` | 7,500,000,000 | 5,000,000,000 | 0 | 0 | **2,500,000,000** | 300,000,000 | ✓ | 832,000,000 (미성년) |
| VI-CASE3 | 비상장주식 상장 | `borrowed_funds` | `similar`¹ | 10,000,000,000 | 1,000,000,000 | 0 | 0 | **9,000,000,000** | 300,000,000 | ✓ | 4,015,000,000 (성년) |
| VI-CASE4 | 사업 인허가 | `borrowed_funds` | `license` | 5,000,000,000 | 100,000,000 | 50,000,000 | 50,000,000 | **4,800,000,000** | 60,000,000 | ✓ | 1,930,000,000 (미성년) |
| VI-FAIL | (기존 회귀) | — | — | 1,350,000,000 | 1,000,000,000 | 100,000,000 | 100,000,000 | **0** | 300,000,000 | ✗ | — |
| VI-5YR | 5년 echo | — | — | (CASE1) +acqDate/eventDate 3년 | | | | (CASE1) | | | withinFiveYears=true |
| VI-5YR-OVER | 5년 초과 | — | — | (CASE1) +6년 | | | | (CASE1) **불변** | | | withinFiveYears=false (applied 불변) |

¹ VI-CASE3: PDF(2004 해설)는 "한국거래소 상장". 현행 영§32의3①4호 단서가 유가증권·코스닥 상장을 §42의3에서 제외(→§41의3). `reason: "similar"`로 재현하고 결과뷰 amber 경계 안내. 산식·anchor는 PDF값(90억) 그대로.

## 법령 근거 (KoreanLaw MCP 검증 완료 — 계획서 §1)

- 상증법 §42의3 (MST 276123, 시행 2026-01-02): ①취득사유 1·2·3호 + 5년 이내 + 기준금액 단서 / ②이익 산정·사유발생일 전 양도 시 양도일 / ③부정한방법 시 비특수관계 + 기간무관.
- 상증령 §32의3 (MST 283637, 시행 2026-02-27): ①가치증가사유(1호 개발·형질변경·공유물분할·지하수개발이용권 등 인가허가 / 2호 K-OTC / 3호 코넥스 / 4호 유사, **유가·코스닥 제외**) / ②기준금액 MIN(③2~4호 합계×30%, 3억) / ③이익 = ①−②−③−④.
- 상수: `GIFT.VALUE_INCREASE = "상증법 §42의3"` (`legal-codes/inheritance-gift.ts:166`, 기존). 교차참조 `GIFT.LISTING_GAIN = "상증법 §41의3"` (`:162`).

## 엔진 input 타입 (`ValueIncreaseInput` — 신규 4 optional, 모두 echo)

```ts
export interface ValueIncreaseInput {
  currentValue: number;        // (기존) 사유발생일 현재 재산가액 (영③1호)
  acquisitionCost: number;     // (기존) 취득가액 (영③2호, 증여재산=증여세 과세가액)
  normalIncrease: number;      // (기존) 통상적 가치상승분 (영③3호)
  contribution: number;        // (기존) 가치상승기여분 (영③4호)
  // ── 신규 echo (산식 미사용 — 결과뷰·요건 표시) ──
  acquisitionCause?: "gift" | "inside_info" | "borrowed_funds";  // §42의3①1·2·3호
  valueIncreaseReason?:
    | "development" | "form_change" | "partition" | "license"     // 영①1호 세분(UI 라벨용)
    | "kotc_registration" | "konex_listing" | "similar";          // 2·3·4호
  acquisitionDate?: string;    // ISO. 취득일
  eventDate?: string;          // ISO. 재산가치증가사유 발생일(§42의3② 전단: 사유발생 전 양도 시 양도일)
}
```

## 엔진 result 타입 (`DeemedGiftResult` echo 보강 — optional)

기존 `DeemedGiftResult`(공통)에 §42의3 전용 optional echo 추가 (다른 type에 영향 0):

```ts
  // §42의3 echo (value-increase 전용 — feedback_engine_result_map_json_loss: plain 값만)
  valueIncreaseDetail?: {
    acquisitionCauseLabel?: string;   // "특수관계인 증여(①1호)" 등 (cause 입력 시)
    reasonLabel?: string;             // "형질변경(영①1호)" 등 (reason 입력 시)
    withinFiveYears?: boolean;        // acqDate·eventDate 둘 다 입력 시만; undefined=미입력
    holdingYears?: number;            // differenceInYears(eventDate, acqDate) echo
    isExchangeListingNotice?: boolean;// reason==="similar" → 결과뷰 §41의3 경계 amber
  };
```

> 기존 `thresholdEcho: { gain, threshold }`·`exclusionReason`·`breakdown`·`applied`·`legalBasis`는 변경 없음.

## 계산 알고리즘 (단계별 — 산식 STEP 1~3 불변)

```
STEP 1 (불변) raw = currentValue − acquisitionCost − normalIncrease − contribution; value0 = max(raw, 0)
STEP 2 (불변) deductSum = max(acquisitionCost + normalIncrease + contribution, 0)   // 기존 `>0?:0` 가드
             threshold = MIN(safeMultiplyThenDivide(deductSum, 30, 100), 300_000_000)
             applied = value0 > 0 && value0 ≥ threshold;  value = applied ? value0 : 0
STEP 3 (불변) breakdown 7행 + thresholdEcho — 기존 그대로
STEP 4 (신규 echo, value/applied에 영향 없음)
  - 날짜 변환: toDate(acqDate)·toDate(eventDate) (date-coerce — `new Date` 직접 호출 금지, CLAUDE.md)
  - hasDetail = !!valueIncreaseReason || !!acquisitionCause || !!(acqDate && eventDate)
  - if (!hasDetail) → valueIncreaseDetail = undefined (기존 동작 바이트 동일)
  - else valueIncreaseDetail = {
      reasonLabel: valueIncreaseReason ? REASON_LABEL[reason] : undefined,
      acquisitionCauseLabel: acquisitionCause ? CAUSE_LABEL[cause] : undefined,
      withinFiveYears: (acqDate && eventDate) ? differenceInYears(eventDate, acqDate) ≤ 5 : undefined,
      holdingYears: (acqDate && eventDate) ? differenceInYears(eventDate, acqDate) : undefined,
      isExchangeListingNotice: valueIncreaseReason === "similar" ? true : undefined,
    }
```

**불변식**: 신규 입력 모두 미제공 시 `hasDetail = false` → `valueIncreaseDetail = undefined`, 나머지 result(deemedGiftValue·applied·breakdown·thresholdEcho)는 기존과 **바이트 동일**. → 기존 VI-1·VI-FAIL 회귀 0.

> **5년요건 차단 안 함**(memory `feedback_no_silent_apportion_fallback` 취지·계획 R3): §42의3①은 5년이 과세요건이나 ③ 부정한방법 예외(기간무관) 존재 → MVP는 echo만. applied는 산식(이익≥기준금액)으로만 결정.

## 증여세 통합 (calcGiftTax 연계 — anchor 전용, 엔진 변경 없음)

- gift-deemed는 증여재산가액만 산출 → `buildGiftWizardPrefill` default 경로(`gift-deemed-api.ts:599`, `marketValue: deemedGiftValue`)로 증여세 마법사 이관. **엔진·prefill 변경 없음**.
- 증여세 anchor 대상 = `GiftTaxResult.computedTax`(산출세액 ⑦, §69 전). **입력 구성 ✅ Pre-Do 실측 확정**: `donor:"father"` · `donorRelation`/`deductionInput.donorRelation` = 부모→미성년자녀 `"lineal_ascendant_minor"`(2천만) / 부모→성년자녀 `"lineal_ascendant_adult"`(5천만) · `giftItems:[{category:"other", marketValue}]` · `isMinorDonee:false`(§57② 세대생략 할증 전용 — **공제와 무관**) · `creditInput:{isFiledOnTime:true}`. 세율 §56. ⚠️ `"lineal_descendant"`는 자녀→부모(역방향) — 사용 금지.

## Silent fallback / 자동 안분 후보 식별

- **없음**. 신규 4필드 전부 optional echo — 미입력 시 자동 채움·안분 0. 5년·사유는 차단 아닌 표시. (memory `feedback_no_silent_apportion_fallback` 준수)
- 프리셋 버튼은 `onClick`으로 `setForm` 직접 호출 — useEffect→store 미러링 아님(`feedback_useeffect_store_mirror_forbidden` 준수).

## 테스트 약속 (계획서 §6 = anchor 단일 진실)

- 엔진 단위: `value-increase-case-anchor.test.ts` — VI-CASE1~4·VI-CASE1-THRESHOLD·VI-REASON-ECHO·VI-5YR·VI-5YR-OVER + 기존 VI-1·VI-FAIL 회귀.
- 증여세 통합: `value-increase-gift-tax.test.ts` — VI-GT-CASE1~4 `computedTax` toBe.

## UI 통합 위임 (→ STEP 12 `.ui.design.md`)

- ⑤ `ValueIncreaseFields`(other-forms.tsx:335): 4금액(기존) + 취득사유 RadioCardGroup + 가치증가사유 RadioCardGroup(`similar` 선택 시 §41의3 amber) + DateInput×2(취득일·사유발생일) + 사례 프리셋 4버튼.
- ⑦ `DeemedGiftResultView`: value_increase 전용 섹션(사유 라벨·5년 ○/판정·사례3 경계 amber).

## 14 동기화 지점 매핑

| # | 지점 | 위치 | 작업 |
|---|---|---|---|
| ① 폼 | `viAcqCause`·`viReason`·`viAcqDate`·`viEventDate` | `deemed-form-state.ts:273` | 신규 |
| ② initial | `INITIAL_DEEMED` (`""`/기본 enum) | `deemed-form-state.ts:465` | 신규 |
| ③ normalize | **N/A** (useState 로컬, persist 없음) | DeemedGiftCalculator.tsx:26 | 점검 |
| ④ API | echo 매핑(date→ISO, enum 전달) | `gift-deemed-api.ts:464` | 수정 |
| ⑤ UI | 라디오·날짜·프리셋 | `other-forms.tsx:335` | 수정 |
| ⑥ 사이드바 | N/A (deemed 사이드바 없음) | — | — |
| ⑦ 결과 | value_increase 전용 섹션 | `DeemedGiftResultView.tsx` | 신규 |
| ⑧ validate | viCurrentValue>0 유지(사유·날짜 차단 안 함) | `gift-deemed-validate.ts:233` | 점검 |
| ⑨~⑭ | gift-deemed는 단일 route+discriminatedUnion → `valueIncreaseSchema`에 흡수 | `gift-deemed-input.ts:313` · `route.ts` | ⑫ 수정(enum·date optional) |

> ⑫ enum 추가 시 침묵 strip 방지: `valueIncreaseSchema`에 `acquisitionCause`·`valueIncreaseReason` z.enum optional + `acquisitionDate`·`eventDate` z.string optional. grep 자가점검(`feedback_api_zod_schema_sync`).

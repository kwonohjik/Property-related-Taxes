# 계획서 — §42의3 재산 취득 후 재산가치 증가에 따른 이익의 증여 (계산사례 1~4 재현·보완)

> 작성 worktree: `.claude/worktrees/gift-value-increase-42-3` (브랜치 `feat/gift-value-increase-42-3`)
> 출처 PDF: 국세청 2004년 개정세법 해설 pp.197~200 「계산사례 1~4」
> 결정(사용자 확정): **(범위) 사유·5년요건 가시화 — 산식 불변 echo** · **(사례3) PDF값 재현 + 현행법 주석**

---

## 0. 목표 (검증 가능한 성공 기준)

1. PDF 계산사례 1~4의 **증여재산가액**을 `calcValueIncreaseGift` 단위 테스트에서 원단위 `toBe()`로 재현.
2. PDF 사례별 **증여세 산출세액**(5.8억·8.3억·40억·19.3억)을 `calcGiftTax` 통합 테스트로 재현(증여재산공제·세율 조건 명시).
3. §42의3 **적용요건**(취득사유 ①1·2·3호 / 가치증가사유 영§32의3①1·2·3·4호 / 5년 이내)을 입력·결과뷰에 **가시화**(echo, 산식 회귀 0).
4. 사례3 비상장주식 거래소 상장의 **현행법 경계**(유가증권·코스닥 상장은 §41의3, §42의3은 K-OTC·코넥스만) 결과뷰·테스트 주석으로 명시.
5. `npx tsc --noEmit` 0건 · `npx vitest run __tests__/tax-engine/gift-deemed/` 통과 · 전체 회귀 0.

---

## 1. 법령 근거 (KoreanLaw MCP 검증 완료 — 추정 없음)

### 상증법 §42의3 (현행, 공포 2025-10-01 / 시행 2026-01-02, MST 276123)

> ① 직업, 연령, 소득 및 재산상태로 보아 **자력(自力)으로 해당 행위를 할 수 없다고 인정되는 자**가 다음 각 호의 사유로 재산을 취득하고 **그 재산을 취득한 날부터 5년 이내**에 개발사업의 시행, 형질변경, 공유물 분할, 사업의 인가·허가 등 대통령령으로 정하는 사유("재산가치증가사유")로 인하여 이익을 얻은 경우에는 그 이익에 상당하는 금액을 그 이익을 얻은 자의 **증여재산가액**으로 한다. 다만, 그 이익에 상당하는 금액이 대통령령으로 정하는 **기준금액 미만인 경우는 제외**한다.
> &nbsp;&nbsp;1. 특수관계인으로부터 재산을 **증여**받은 경우
> &nbsp;&nbsp;2. 특수관계인으로부터 기업 경영 등에 관하여 공표되지 아니한 **내부 정보를 제공받아** 그 정보 관련 재산을 **유상으로 취득**한 경우
> &nbsp;&nbsp;3. 특수관계인으로부터 증여받거나 **차입한 자금** 또는 특수관계인의 재산을 **담보로 차입한 자금**으로 재산을 취득한 경우
> ② 이익 = 재산가치증가사유 발생일 현재 해당 재산가액, 취득가액(증여재산은 **증여세 과세가액**), 통상적인 가치상승분, 가치상승 기여분 등을 고려하여 영으로 계산. **사유발생일 전 양도 시 양도일을 사유발생일로 본다.**
> ③ 거짓·부정한 방법으로 증여세를 감소시킨 것으로 인정되면 **특수관계인이 아닌 자 간에도** 적용. 이 경우 **기간(5년)에 관한 규정은 없는 것으로 본다.**

### 상증령 §32의3 (현행, 시행 2026-02-27, MST 283637)

> ① "대통령령으로 정하는 사유"(재산가치증가사유):
> &nbsp;&nbsp;1. 개발사업 시행, **형질변경**, **공유물 분할**, **지하수개발·이용권 등의 인가·허가** 및 그 밖에 사업의 인가·허가
> &nbsp;&nbsp;2. 비상장주식의 **한국금융투자협회 등록(K-OTC)**
> &nbsp;&nbsp;3. 주식등의 **코넥스시장 상장**
> &nbsp;&nbsp;4. 그 밖에 1~3호 유사 재산가치 증가 사유 **(단, 유가증권시장·코스닥시장 상장은 제외)**
> ② **기준금액** = 다음 중 적은 금액: (1) ③2호~4호 합계액 × 30% (2) **3억원**
> ③ 이익 = **①해당 재산가액** − (**②취득가액** + **③통상적 가치상승분** + **④가치상승기여분**)
> &nbsp;&nbsp;①: 사유발생일 현재 §4장 평가가액 / ②: 실제 취득 지급액(증여재산은 증여세 과세가액) / ③: §31의3⑤ 기업가치 실질증가이익 + 연평균지가·주택가격상승률·물가상승률 등 고려한 보유기간 정상 가치상승분 / ④: 형질변경 등 자본적지출액

**법령 상수**: `GIFT.VALUE_INCREASE = "상증법 §42의3"` (`legal-codes/inheritance-gift.ts:166`) — 이미 존재. 시행령·각호 상수는 필요 시 추가.

---

## 2. 계산사례 매트릭스 (입력 매핑 + 2중 anchor)

> 단위: 억원. 엔진 입력은 원단위 정수. 증여재산가액 = `currentValue − acqCost − normalIncrease − contribution`.
> 기준금액 = `MIN((acqCost + normalIncrease + contribution) × 30%, 3억)`.

| 사례 | 취득사유 ①(`acquisitionCause`) | 가치증가사유 영①(`valueIncreaseReason`) | currentValue | acqCost | normal | contrib | **증여재산가액** | 기준금액 | applied |
|---|---|---|---|---|---|---|---|---|---|
| **1 형질변경** | 1호 증여 (`gift`) | 1호 형질변경 (`form_change`) | 20억 | 1억 | 0.1억 | 0.2억 | **18.7억** | min(1.3억×30%=3,900만, 3억)=3,900만 | ✓ |
| **2 공유물분할** | (미지정 — 가치증가사유가 주)¹ | 1호 공유물분할 (`partition`) | 75억 | 50억² | 0 | 0 | **25억** | min(50억×30%=15억, 3억)=3억 | ✓ |
| **3 비상장주식 상장**³ | 3호 차입자금 (`borrowed_funds`) | 4호 유사(거래소 상장)³ (`similar`) | 100억 | 10억 | 0 | 0 | **90억** | min(10억×30%=3억, 3억)=3억 | ✓ |
| **4 사업 인허가** | 3호 담보차입 (`borrowed_funds`) | 1호 지하수개발이용권 인가 (`license`) | 50억 | 1억 | 0.5억 | 0.5억 | **48억** | min(2억×30%=6,000만, 3억)=6,000만 | ✓ |

¹ 사례2는 父·子 1/2 공유 토지의 분할. §42의3 틀에서 "취득사유"는 당초 子지분 취득(증여 추정)이나 PDF가 명시하지 않음 → `acquisitionCause`는 **optional 미지정**(가치증가사유 `partition`이 주). echo 라벨은 "공유물 분할(영§32의3①1호)"만 표기.
² **공유물분할 입력 매핑**: `acqCost = 분할 전 子 지분가액(50억)`, `currentValue = 분할 후 子 소유 토지가액(75억)`. PDF "분할후 75억 − 분할전 50억 = 25억"의 단순 차액을 §42의3②③ 산식(통상상승·기여분 0)으로 표현. 계획서·결과뷰에 매핑 근거 주석.
³ **사례3 현행법 드리프트**: PDF(2004 해설)는 "한국거래소 상장". **현행 영§32의3①4호 단서는 유가증권·코스닥 상장을 §42의3에서 제외**(→§41의3 상장이익). PDF값(90억)은 재현하되, 결과뷰·테스트에 "현행 §42의3은 K-OTC 등록·코넥스 상장만 / 거래소 상장은 §41의3"을 명시(`GIFT.LISTING_GAIN = "상증법 §41의3"` 교차참조).

### 증여세 산출세액 anchor (§56 세율 + §53 증여재산공제)

> §56 세율: 1억↓10% / ~5억 20%(누진 1천만) / ~10억 30%(6천만) / ~30억 40%(1.6억) / 30억↑ 50%(4.6억).
> §53 공제(직계존속→직계비속, 10년): 성년 5천만 / **미성년 2천만**. 신고세액공제 §69(3%)는 **미적용**(PDF "정도"=산출세액 기준).

| 사례 | 수증자 | 공제 | 과세표준 | 산출세액 | PDF |
|---|---|---|---|---|---|
| 1 | 자녀 5살(미성년) | 2천만 | 18.7억 − 0.2억 = 18.5억 | 18.5억×40% − 1.6억 = **5.8억** | 5.8억 ✓ |
| 2 | 子(미성년 가정)⁴ | 2천만 | 25억 − 0.2억 = 24.8억 | 24.8억×40% − 1.6억 = **8.32억** | 8.3억 ✓ |
| 3 | 갑(거래소 시세차익) | 5천만⁵ | 90억 − 0.5억 = 89.5억 | 89.5억×50% − 4.6억 = **40.15억** | 40억 ✓ |
| 4 | 자녀 10살(미성년) | 2천만 | 48억 − 0.2억 = 47.8억 | 47.8억×50% − 4.6억 = **19.3억** | 19.3억 ✓ |

⁴ 사례2 공제 조건은 PDF "8.3억" 역산으로 **미성년 직계비속(2천만)** 가정. 통합 테스트 주석에 명시. (성년 5천만 시 8.18억으로 PDF와 1천만 단위 어긋남)
⁵ 사례3은 50% 구간이라 공제(2천만/5천만) 영향이 산출세액 반올림에 무의미(40.15억 vs 40.16억). 성년 5천만으로 anchor, "공제 무관 40억" 주석.

> **anchor 분리 원칙** (memory `feedback_pdf_example_test_anchoring`): 증여재산가액은 `calcValueIncreaseGift` 단위 anchor(원단위 `toBe`), 증여세는 `calcGiftTax` 통합 anchor(공제·세율 조건을 입력에 명시). PDF 증여세는 "정도/억 단위 반올림"이므로 1억 미만 차이는 `toBeCloseTo`가 아닌 **명시 조건 하 정확값 `toBe`**로 고정하고 PDF 근사치는 주석.

---

## 3. 현황 — 기존 구현 실측 (14지점)

| 지점 | 현재 상태 | file:line |
|---|---|---|
| 엔진 | `calcValueIncreaseGift` — 이익·기준금액 산식 **정확**(영②③ 일치) | `lib/tax-engine/gift-deemed/value-increase.ts:13` |
| 타입 | `ValueIncreaseInput`(4필드) · `DeemedGiftResult` | `gift-deemed/types.ts:626` |
| ① 폼 | `viCurrentValue`·`viAcqCost`·`viNormalIncrease`·`viContribution` | `deemed-form-state.ts:273` |
| ② initial | 4필드 `""` | `deemed-form-state.ts:465` |
| ④ API | `value_increase` 변환(4필드) | `gift-deemed-api.ts:464` |
| ⑤ UI | `ValueIncreaseFields`(4 CurrencyInput) | `other-forms.tsx:335` |
| ⑦ 결과 | 공통 `DeemedGiftResultView`(breakdown·legalBasis·thresholdEcho·applied·exclusionReason) | `DeemedGiftResultView.tsx` |
| ⑧ validate | `viCurrentValue > 0` | `gift-deemed-validate.ts:233` |
| ⑫ Zod | `valueIncreaseSchema`(4필드) | `gift-deemed-input.ts:313` |
| 증여세 연계 | default prefill(`marketValue: deemedGiftValue`) → 증여세 마법사 | `gift-deemed-api.ts:599` |
| 테스트 | VI-1·VI-FAIL (임의값 — **사례 아님**) | `phase3-other-anchor.test.ts:48` |
| 법령검증 manifest | `INH.GIFT_DEEMED_VALUE_INCREASE` 등록됨 | `additions-inheritance.ts:343` |

**결론**: 산식·14지점 골격은 이미 존재. 보완은 **(A) 4사례 anchor 추가** + **(B) 적용요건 echo 가시화**(산식 무변경) + **(C) 사례3 현행법 주석**.

---

## 4. 보완 설계 — 적용요건 가시화 (산식 불변)

### 4-1. 엔진 입력 확장 (`ValueIncreaseInput`, 모두 optional → 회귀 0)

```ts
export interface ValueIncreaseInput {
  currentValue: number;        // (기존) 사유발생일 현재 재산가액
  acquisitionCost: number;     // (기존) 취득가액(증여재산=증여세 과세가액)
  normalIncrease: number;      // (기존) 통상적 가치상승분
  contribution: number;        // (기존) 가치상승기여분
  // ── 신규 echo (산식 미사용, 결과뷰·요건 표시 전용) ──
  acquisitionCause?: "gift" | "inside_info" | "borrowed_funds";   // §42의3①1·2·3호
  valueIncreaseReason?:                                            // 영§32의3①
    | "development" | "form_change" | "partition" | "license"      // 영①1호 세분(UI 라벨용 — 법령상 모두 동일 1호)
    | "kotc_registration"   // 2호
    | "konex_listing"       // 3호
    | "similar";            // 4호 (유가·코스닥 상장 제외 — 사례3 here + 경계 주석)
  acquisitionDate?: string;    // ISO. 취득일
  eventDate?: string;          // ISO. 재산가치증가사유 발생일(또는 §42의3② 전단 양도일)
}
```

### 4-2. 엔진 출력 echo (`DeemedGiftResult`에 optional 추가 또는 `valueIncreaseDetail?`)

- `withinFiveYears?: boolean` — `eventDate − acquisitionDate ≤ 5년` (date-fns `differenceInYears`, 실측 `tax-utils.ts:1`·`calculateHoldingPeriod` `tax-utils.ts:169` 재사용 검토). acquisitionDate·eventDate 미입력 시 undefined(echo 생략)
- `acquisitionCauseLabel?` / `reasonLabel?` — 결과뷰 한국어 라벨

> **사례3 경계 처리(단순화)**: 별도 **입력** 플래그 불요(`reason="similar"` 하나로 충분). 결과뷰 amber 트리거는 `valueIncreaseDetail.isExchangeListingNotice` **echo**로 판정 — `reasonLabel` 문자열 매칭 금지(memory `feedback_enum_substring_match_forbidden`). 안내문 "현행 §42의3은 K-OTC 등록·코넥스 상장만. 유가증권·코스닥 상장은 §41의3 상장이익" → `GIFT.LISTING_GAIN`(`:162`) 교차참조. 사례3 재현은 `reason: "similar"`.

> **5년 요건의 applied 영향**: §42의3①은 "5년 이내"가 과세요건이나, ③ 부정한 방법 시 기간 무관. **MVP는 5년 판정을 echo로만 표시**(applied 차단 안 함) — 입력 날짜 미제공 시 기존 동작 100% 보존. 차단 도입은 후속(별도 결정).

### 4-3. UI 가시화 (`ValueIncreaseFields` 확장)

- 기존 4 CurrencyInput 위에 **취득사유 RadioCardGroup**(①1·2·3호) + **가치증가사유 RadioCardGroup**(영①1~4호, 사례3=4호 선택 시 amber 경계 안내) 추가 (`RadioCardGroup` 필수, native 금지 — memory `feedback_toggle_card_visibility`).
- 취득일·사유발생일 **DateInput** 2개(optional) — 미입력 시 5년 echo 생략.
- **사례 프리셋 4버튼**(선택적): 클릭 시 사례1~4 입력 일괄 채움 — `onClick`으로 `setForm({...})` 직접 호출(memory `feedback_useeffect_store_mirror_forbidden` 무위반 — useEffect 미러링 아님). **신규 패턴**(기존 deemed에 프리셋 없음) → Simplicity 관점에서 "테스트 anchor 필수, UI 프리셋은 부가". 프리셋은 deemed 폼의 4금액+사유+날짜만 채움.
- **증여자 관계·미성년 입력 위치**: deemed 폼에 `donor`·`isMinorDonee` 필드 **없음**(실측). 증여세 prefill은 default 경로(`marketValue: deemedGiftValue`)만 이관하고, 관계·미성년은 **증여세 마법사에서 입력** — §42의3 작업 범위에 증여자 관계 입력 추가 안 함.
- 색상 카드 + 섹션 번호(memory `feedback_section_card_numbering`): 사유=rose, 금액=기존 rose 유지, 날짜=violet.

### 4-4. 결과뷰 (`DeemedGiftResultView`)

- value_increase 전용 섹션: 취득사유·가치증가사유 라벨, 5년 요건 ○/판정, 사례3 경계 amber 카드, 산식 breakdown(기존)·증여세 prefill 안내.

---

## 5. 14지점 변경 계획 (Definition of Done)

| 지점 | 변경 | 신규/수정 |
|---|---|---|
| 엔진 | `value-increase.ts` echo 3필드 산출(산식 불변) | 수정 |
| 타입 | `ValueIncreaseInput` +4 optional / `DeemedGiftResult` +echo | 수정 |
| ① 폼 | `deemed-form-state.ts` `viAcqCause`·`viReason`·`viAcqDate`·`viEventDate` | 수정 |
| ② initial | 신규 필드 초기값 | 수정 |
| ③ normalize | **N/A** — DeemedGiftCalculator는 `useState(INITIAL_DEEMED)` 로컬 상태(DeemedGiftCalculator.tsx:26), normalize·persist·sessionStorage 마이그레이션 **없음**. ② 초기값 추가로 충분 | 점검 |
| ④ API | `gift-deemed-api.ts:464` echo 필드 매핑(Date→ISO) | 수정 |
| ⑤ UI | `ValueIncreaseFields` 라디오·날짜·프리셋 | 수정 |
| ⑥ 사이드바 | **N/A** — deemed-gift 마법사에 사이드바 합계 없음 | — |
| ⑦ 결과 | `DeemedGiftResultView` value_increase 섹션 | 수정 |
| ⑧ validate | `gift-deemed-validate.ts:233` — 5년/사유 미입력은 **차단 안 함**(echo) | 점검 |
| ⑫ Zod | `gift-deemed-input.ts:313` `valueIncreaseSchema` +optional enum·date | 수정 |
| 증여세 prefill | default 경로 그대로(추가 변경 불필요) | 점검 |
| 법령검증 | manifest 기존 항목 유지, §41의3 교차참조 주석 | 점검 |

> ⑫⑬⑭ grep 자가점검(memory `feedback_api_zod_schema_sync`): gift-deemed는 단일 route(`app/api/calc/gift-deemed/route.ts`)·discriminatedUnion이므로 ⑬⑭는 `valueIncreaseSchema`에 흡수. enum 신규값 침묵 strip 여부 grep 확인.

---

## 6. 테스트 anchor 계획

### 6-1. 엔진 단위 (`__tests__/tax-engine/gift-deemed/value-increase-case-anchor.test.ts` 신규)

```
[VI-CASE1] 형질변경: 20억−1억−0.1억−0.2억 → deemedGiftValue toBe 1,870,000,000
[VI-CASE2] 공유물분할: 75억−50억 → toBe 2,500,000,000
[VI-CASE3] 비상장주식 상장: 100억−10억 → toBe 9,000,000,000 (reason "similar" 경계주석)
[VI-CASE4] 사업인허가: 50억−1억−0.5억−0.5억 → toBe 4,800,000,000
[VI-CASE1-THRESHOLD] 기준금액 3,900만 echo 검증
[VI-REASON-ECHO] 사례1 cause "gift"·reason "form_change" → reasonLabel/acquisitionCauseLabel echo 검증
[VI-5YR] acquisitionDate/eventDate 3년 → withinFiveYears true (사례1)
[VI-5YR-OVER] 6년 → withinFiveYears false (applied 불변 확인 — echo만, 차단 안 함)
```

### 6-2. 증여세 통합 (`__tests__/tax-engine/gift-deemed/value-increase-gift-tax.test.ts` 신규 — calcGiftTax 연계)

> **anchor 대상 필드 = `GiftTaxResult.computedTax`** (산출세액 ⑦, 실측 `types/inheritance-gift.types.ts:650`). PDF "5.8억"은 산출세액(18.5억×40%−1.6억)이며 §69 신고세액공제(3%) 적용 후 `finalTax`(5.63억)가 아님 → **`computedTax`로 anchor**. 세대생략 할증 없음(직계비속).
> **calcGiftTax 입력 구성** (✅ Pre-Do VI-GT-CASE4로 실측 확정 — `gift-tax.ts:74`·`GiftTaxInput` `types:576`·`DonorRelation` `inheritance-gift-deduction.types.ts:247`):
> `{ giftDate, donor: "father", donorRelation: <아래>, isMinorDonee: false, isGenerationSkip: false, giftItems: [{ id, category: "other", name, marketValue: <증여재산가액> }], priorGiftsWithin10Years: [], deductionInput: { donorRelation: <아래 동일> }, creditInput: { isFiledOnTime: true } }`
> - **§53 공제는 `DonorRelation` enum이 결정** (`isMinorDonee` 아님): 부모→**미성년** 자녀 = `"lineal_ascendant_minor"`(2천만) / 부모→**성년** 자녀 = `"lineal_ascendant_adult"`(5천만). ⚠️ `"lineal_descendant"`는 **자녀→부모(역방향)**이라 PDF 사례에 부적합(5천만 오적용 — Pre-Do FAIL로 적발).
> - **`isMinorDonee`는 §57② 세대생략 할증 전용**(공제 무관) → 직계증여 `false`. anchor 대상 = **`computedTax`**(산출세액 ⑦, §69 전).

```
[VI-GT-CASE1] 18.7억 + lineal_ascendant_minor(2천만) → computedTax toBe 580,000,000
[VI-GT-CASE2] 25억 + lineal_ascendant_minor(2천만) → toBe 832,000,000 (PDF 8.3억 — 미성년 가정)
[VI-GT-CASE3] 90억 + lineal_ascendant_adult(5천만) → toBe 4,015,000,000 (PDF 40억)
[VI-GT-CASE4] 48억 + lineal_ascendant_minor(2천만) → toBe 1,930,000,000  ✅ Pre-Do PASS
```

---

## 7. Pre-Do anchor (memory `feedback_pre_anchor_verification` — Do 전 1순위)

**가장 먼저** `value-increase-case-anchor.test.ts`의 **VI-CASE1·VI-CASE4**(현재 4필드 엔진으로 즉시 통과해야 함)를 작성·실행:
- **통과 시**: 산식이 정확함을 실증 → echo·UI 보완에 집중.
- **실패 시**: 산식·기준금액 정의 디자인 환류(예상과 다름).

이어 **VI-GT-CASE4**(48억 → 19.3억) 1건으로 calcGiftTax 연계 시그니처·공제 분기를 실측 확정한 뒤 나머지 anchor 확장. "현행 엔진 일치 예상" 단정 금지.

---

## 8. 작업 순서 (PDCA Do — 시퀀셜)

1. **Pre-Do anchor** (§7) → verify: VI-CASE1·4 통과 / VI-GT-CASE4 calcGiftTax 시그니처 확정
2. **엔진+타입** echo 필드(산식 불변) → verify: VI-CASE1~4·VI-5YR 통과, 기존 VI-1·VI-FAIL 회귀 0
3. **증여세 통합 anchor** VI-GT-CASE1~4 → verify: 4건 toBe 통과
4. **14지점 클라이언트**(①②③④⑧⑫) → verify: `tsc --noEmit` 0
5. **UI**(⑤ 라디오·날짜·프리셋 / ⑦ 결과뷰 사례3 경계) → verify: 폼→계산→결과 E2E(`e2e/`, memory `feedback_browser_verify_with_playwright`)
6. **회귀** `npx vitest run __tests__/tax-engine/gift-deemed/` + 전체 `npm test` → verify: 녹색

---

## 9. 리스크·결정 사항

- **R1 (사례2 매핑)**: 공유물분할의 `acqCost=분할전 지분가액`은 PDF 단순차액의 §42의3 표현. 엄밀히는 "당초 지분 취득가액"이나 PDF가 분할전가액 기준 → 결과뷰 주석으로 매핑 근거 명시. **(채택: PDF 충실 재현)**
- **R2 (사례3 드리프트)**: 확정 — PDF값 재현 + 현행법 주석(§41의3 교차참조). 엔진 산식은 동일(빼기), `isExchangeListingExcluded` echo로 경계 표시.
- **R3 (5년 요건 차단)**: MVP는 echo만(applied 불변). 차단 도입은 ③ 부정한방법 예외와 함께 후속 결정.
- **R4 (증여세 공제 조건)**: PDF는 공제·연령 불명시. 역산으로 사례1·2·4 미성년(2천만)·3 성년(5천만) 가정 — 통합 테스트 주석. calcGiftTax §53 분기 Do 전 실측.
- **R5 (프리셋 신규 패턴)**: 기존 deemed에 없음. 테스트 anchor 필수 / UI 프리셋은 부가(범위 후순위 가능).
- **R6 (§43 중복배제 범위 외)**: §42의3 이익도 §43① 중복배제(`dup-exclusion.ts`) 대상이나, 본 작업은 **단일 의제 재현**(4사례 각각 단건)이라 §43 중복배제·§43② 1년내 합산은 범위 외. 다른 의제와 동시 적용 시나리오는 후속.

---

## 부록 — 참고 메모리·스킬

`pdf-case-replica-workflow` · `feedback_pdf_example_test_anchoring` · `feedback_korean_law_citation_verify` · `feedback_design_law_cases`(본문·단서·각호 전수) · `feedback_pre_anchor_verification` · `feedback_api_zod_schema_sync`(14지점) · `feedback_three_state_optional_mode_toggle`(optional echo) · `plan-design-self-review-loop`(다음 단계 자가검토).

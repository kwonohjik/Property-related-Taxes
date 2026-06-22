# 동시증여 다중 건 세액 계산 (Multi-Gift Simultaneous Calculation) — 계획서

> 같은 날 한 명의 수증자가 여러 증여자로부터 받은 경우, **각 증여 건을 완전 입력받아 각각 세액을 계산**하고 수증자 총 납부세액을 합산한다. 현행은 "동시증여 안분"이 현재 신고 건의 공제 한도 축소에만 쓰이고, 상대방 건의 세액은 계산하지 않는다.

- 작성일: 2026-06-22
- 브랜치: `feat/gift-simultaneous-multi-gift` (base `origin/master` @ `7044aec2`)
- 워크트리: `.claude/worktrees/gift-simultaneous-multi`

---

## 1. 배경 — 현행의 한계

증여세 납세의무자는 **수증자(받은 사람)**다 (상증법 §4의2①). 같은 날 한 수증자가 부모로부터 130,000,000, 조부모로부터 70,000,000을 받았다면, 두 건 **모두 그 수증자가 신고·납부**한다. 따라서 "이번에 받은 것 전체로 얼마를 내야 하나"를 보려면 두 건을 함께 계산해야 한다.

### 현행 동작 (실측)

- 입력 필드 `FormState.simultaneousGifts?: Array<{ donorRelation: DonorRelation; taxableValue: string }>` — `components/calc/gift-tax-form-shared.tsx:83`
- UI: Step3 `GiftCreditChecklist.tsx`의 ToggleCard "같은 날 다른 증여자로부터도 받았나요?" — 관계 select + 과세가액 1칸의 **간이 입력**
- 엔진 소비처: `lib/tax-engine/deductions/gift-deductions.ts` 의 **STEP 4(증여공제)에서만** 2곳
  - `calcRelationDeduction` (§53) `:90` — 같은 관계 동시증여를 안분 **분모**에 합산
  - `calcMarriageBirthDeduction` (§53의2) `:192` — 혼인·출산 1억 한도 안분
- 안분 산식 (`gift-deductions.ts:102~110`): `floor(잔여한도 × 현재과세가액 ÷ (현재과세가액 + 같은관계 동시증여 합))` (BigInt)

**결론: `simultaneousGifts`는 현재 신고 건의 공제 한도 안분에만 사용. 상대방 건(조부모 70M)의 산출세액은 계산되지 않는다.** 분자·분모 모두 현재 신고 건 기준이며, 상대방 건의 세대생략 할증·사전증여·세율 적용 경로가 존재하지 않는다.

---

## 2. 목표 (검증 가능한 성공 기준)

1. Step3에서 동시증여 토글 ON → "1단계 관계부터 입력하세요" 안내 후, **추가 증여 건을 1~4단계 완전 입력**(현재 신고와 동일 폼)으로 받는다. **(A) 카드 반복 방식.**
2. 엔진이 각 건의 `donor` 관계로 **자동 판정**한다:
   - **동일인**(부↔모, 조부↔조모 = `getDonorGroup` 일치) → 현재 건에 **합산**(한 신고서)
   - **같은 공제그룹·다른 동일인**(부모건 + 조부모건 = `deriveDonorRelation` 일치, `getDonorGroup` 불일치) → 직계존속 5천만원 **한도 안분**(별도 신고서)
   - **다른 공제그룹**(직계비속·기타친족 등) → 완전 **별도 계산**
3. 결과: 신고서(건)마다 **별지 제10호서식 ⑰~㊼** 각각 렌더 + **수증자 총 납부세액 합계** 카드.
4. anchor: 부모 130M + 조부모 70M 동시증여 시 두 건의 결정세액·합계가 법령 정합값과 1원 단위 일치.

---

## 3. 법리 정리 (KoreanLaw 검증 대상 — Pre-Do 전 확정)

| 조문 | 내용 | 판정 헬퍼 |
|---|---|---|
| 상증법 §47② | 동일인(직계존속+그 배우자 포함) 10년 합산 | `getDonorGroup` / `isSameDonorGroup` (`gift-prior-aggregation.ts:31~56`) |
| 상증령 §46①2호 | 동시증여 시 공제 한도를 과세가액 비율로 안분 | `calcRelationDeduction` 안분 (`gift-deductions.ts:100~127`) |
| 상증법 §53 | 증여재산공제 (배우자 6억 / 직계존속 5천·미성년 2천 / 직계비속 5천 / 기타친족 1천) | `GIFT_DEDUCTION_LIMIT` (`gift-deductions.ts:35~41`) |
| 상증법 §57 | 세대생략 할증 30%(미성년·20억 초과 40%) — 조부모(그룹 B)만 | `calcGiftGenerationSkipSurchargeWithLimit` (`inheritance-gift-common.ts:260`) |

### 핵심 통찰 — 기존 두 헬퍼로 3분기 전부 판정

```
getDonorGroup:        A(부모) B(조부모) C(배우자) D(직계비속) E(형제) F(기타친족) G(기타)
deriveDonorRelation:  부·모·조부모 → lineal_ascendant_adult|minor  (= 공제그룹)
                      직계비속 → lineal_descendant
                      형제·기타친족 → other_relative

· 동일인 합산  ⟺ getDonorGroup 일치          (부 vs 모 = A=A ✓)
· 공제 안분    ⟺ deriveDonorRelation 일치 ∧ getDonorGroup 불일치  (부 vs 조부모: adult=adult, A≠B ✓)
· 완전 별도    ⟺ deriveDonorRelation 불일치   (부 vs 직계비속: adult≠descendant ✓)
```

→ **새 그룹 판정 헬퍼 불필요.** 기존 `getDonorGroup`·`deriveDonorRelation`을 single-source로 재사용 (memory `single-source-engine-helper`).

> ✅ 실측 확인 (2026-06-22): `deriveDonorRelation`(`lib/calc/prior-gift-donee-derive.ts:101`)이 `father`/`mother`/`grandparent` → `lineal_ascendant_adult`(미성년 시 `_minor`)로 매핑함을 확인. 부모·조부모 같은 공제그룹 확정. 또한 안분 필터(`gift-deductions.ts:88~91`)는 `g.donorRelation === input.donorRelation`으로 **공제그룹(`DonorRelation` 5종) 일치**를 보며, `simultaneousGifts[].donorRelation`도 `DonorRelation` 타입 → 오케스트레이터가 `deriveDonorRelation` 결과를 주입하면 부모건·조부모건이 둘 다 `lineal_ascendant_adult`로 자동 매칭.

---

## 4. 데이터 모델 변경 — 단일 건 → 증여 건 배열

### 현행
`FormState` (단일 증여 건) — `gift-tax-form-shared.tsx:37~147`. donor·giftItems·stockItems·exemptionItems·priorGifts·deductionInput·creditInput 등 단일.

### 신규 모델 (최소 침습안)

기존 `FormState`를 **건 0(현재 신고)으로 유지**하고, 동시증여 추가 건을 별도 배열로 둔다:

```ts
// gift-tax-form-shared.tsx — FormState 확장
simultaneousGiftForms?: GiftSubForm[];   // 기존 simultaneousGifts 대체 (3-state 유지)

// GiftSubForm = 완전 증여 건에 필요한 1~4단계 필드 부분집합
interface GiftSubForm {
  donor: GiftDonorRelation;          // Step0
  isMinorDonee, isSubstituteGift, doneeResidentNumber, giftDate(상속)
  giftItems, stockItems;             // Step1
  exemptionItems, priorGifts;        // Step2
  marriageExemption, birthExemption, priorUsedDeduction, ...;  // Step3 공제·세액공제
}
```

**결정 근거**: 건 0(현재 신고)은 기존 14지점·결과뷰가 모두 단일 `FormState`/`GiftTaxResult`를 가정하므로, 전체를 배열로 바꾸면 회귀 범위가 폭발한다. 추가 건만 sub-form 배열로 분리하면 건 0 경로는 무변경, 추가 건은 신규 경로로 격리된다 (memory `feedback_flat_vs_nested_form_field_decision` 의 Flat+Adapter 사상).

> ⚠️ 미결정 D-1: `GiftSubForm`을 `FormState`와 **동일 타입 재사용**할지(중첩 FormState[]), **부분집합 신규 타입**으로 둘지. Design 단계에서 sub-form이 필요로 하는 필드 전수 enumerate 후 확정. 재사용이 DRY하나 `result`·`step` 등 무관 필드 오염 위험.

---

## 5. 엔진 오케스트레이터 — `calcSimultaneousGifts`

신규 순수 함수 (예: `lib/tax-engine/gift-simultaneous.ts`):

```
calcSimultaneousGifts(gifts: GiftTaxInput[]): GiftTaxResult[]
  gifts[0] = 현재 신고(건 0), gifts[1..] = 동시증여 추가 건

STEP 1. 동일인 합산 (방어적 가드 — D-2로 UI에서 이미 차단)
  D-2 결정: 동일인(같은 getDonorGroup)은 UI에서 한 카드로만 입력 →
    추가 건 배열엔 서로 다른 동일인 그룹만 존재(정상 경로).
  방어적 가드: 만약 같은 getDonorGroup 건이 둘 이상 들어오면(비정상)
    giftItems·stockItems·exemptionItems·priorGifts 병합 → 1건으로 합산
    (creditInput·대납·특례는 D-2로 건당 단일 → 충돌 없음)
  결과: mergedGifts: GiftTaxInput[]  (동일인 그룹 수 = 신고서 수)

STEP 2. 공제그룹 안분
  mergedGifts를 deriveDonorRelation(donor, isMinorDonee)(=공제그룹)별로 묶음
  각 공제그룹 내 건이 2개 이상이면, 각 건에 대해:
    ① deductionInput.donorRelation = deriveDonorRelation(donor, isMinorDonee)  ★필수
       (안분 필터 g.donorRelation === input.donorRelation이 공제그룹 일치를 보므로)
    ② deductionInput.simultaneousGifts = 같은 공제그룹의 "다른 건들"을
       { donorRelation: 그 건의 deriveDonorRelation, taxableValue: 그 건의 netGiftValue }로 주입
       netGiftValue = grossGiftValue − exemptAmount − assumedDebtTotal  (gift-tax.ts:159 동일식)
       ★ 정확값은 2-pass로 산출(설계 §STEP2): PASS1 calcGiftTax가 비과세·채무 차감한 netCurrentGiftValue echo를 사용 — 오케스트레이터 추정 금지(memory feedback_no_silent_apportion_fallback)
  ※ 다른 공제그룹 건을 섞어 넣어도 필터가 걸러내나, 명확성 위해 같은 그룹만 주입.

STEP 3. 각 건 계산
  각 mergedGift에 대해 calcGiftTax(mergedGift) 호출
  → 기존 안분 로직(calcRelationDeduction)이 주입된 simultaneousGifts로 정확 안분
  → 세대생략(§57)·사전증여(§47)는 각 건의 donor·priorGifts로 자동

return GiftTaxResult[]  (+ 합계는 결과뷰에서 Σ finalTax)
```

### 설계 이점

- **엔진 변경 최소화**: 기존 `calcGiftTax`를 N번 호출. 안분은 기존 `simultaneousGifts` 메커니즘을 오케스트레이터가 자동 채워 재사용 → STEP 4 안분 로직 무변경.
- netGiftValue는 공제 **전** 값이므로 안분 전에 선계산 가능 (순환 없음).
- 세대생략·사전증여·세율은 각 건이 완전 `GiftTaxInput`이라 기존 STEP 7·STEP 3·STEP 6이 그대로 처리.

> ✅ 결정 D-2: STEP 1 동일인 합산은 **동일인이면 한 카드로만 입력**한다. 같은 `getDonorGroup` 증여자(부↔모, 조부↔조모)는 추가 건으로 분리 입력하지 않고 하나의 카드(=한 신고서)에 합쳐 입력 → `creditInput`·대납·특례 충돌 원천 차단. UI에서 추가 건의 `donor`가 기존 건과 동일 그룹이면 **차단/경고**(memory `feedback_silent_omission_full_input_enforcement`).
> ⚠️ 미결정 D-3: §53의2 혼인·출산공제는 **수증자 통산 1억**(`priorUsedMarriageBirthDeduction`)이라 건 간 공유. 다건에서 1억을 어떻게 배분할지 — 현행 안분(`calcMarriageBirthDeduction:192`) 메커니즘 확장 가능한지 Design에서 확정.

---

## 6. UI — (A) 카드 반복 방식

### Step3 동시증여 토글
- 토글 ON 시 기존 간이 행(관계+과세가액) 대신 **"1단계 관계부터 입력하세요" 안내 카드** 표시 + "동시증여 추가" 버튼.
- "동시증여 추가" 클릭 → 추가 건 카드 펼침. 각 카드 = 1~4단계 완전 입력 (현재 신고 폼 재사용).

### 재사용 컴포넌트 (실측)
- 증여재산(Step1): `PropertyValuationForm` (`components/calc/PropertyValuationForm.tsx:97`) + `StockValuationForm` — 테이블+모달(`EstateItemTableView`/`EstateItemEditor`)
- 비과세·사전증여(Step2): `ExemptionChecklist` + `PriorGiftInput`
- 공제(Step3): `GiftCreditChecklist`
- 증여자 관계(Step0): `DONOR_OPTIONS` 8종 (`gift-tax-form-shared.tsx:154~188`) — 이미지6과 동일 풀

### 동일인 경고 (검증)
현행 hint "부·모 등 동일인 증여는 현재 신고에 합산하고 여기 넣지 마세요"는 **제거**한다 — 새 모델은 엔진이 자동 합산하므로. 대신 동일인 그룹이 건 0과 같은 추가 건은 결과뷰에서 "건 0과 합산됨" 배지로 표시.

> ✅ 결정 D-4: **(A2) 경량 카드** 채택. 추가 건은 자산 테이블+모달(`EstateItemTableView`/`EstateItemEditor`)·`PropertyValuationForm`·`StockValuationForm`·`ExemptionChecklist`·`PriorGiftInput`·`GiftCreditChecklist`를 **재사용**하되, 추가 건 카드 한 장에 관계+증여재산+비과세/사전증여+공제를 컴팩트하게 배치. "풀 입력"의 취지는 *세액 계산에 필요한 정보를 빠짐없이 받는다*는 것이며, 기존 컴포넌트 재사용으로 충족하면 화면 형태는 경량 카드여도 무방(사용자 확인). 800줄 정책 위해 추가 건 카드는 별도 컴포넌트(`SimultaneousGiftCard`)로 분리.

---

## 7. 결과뷰 — N개 별지서식 + 합계

### 현행 (단일 result 가정 지점 — 실측)
- `GiftTaxResultView({ result: GiftTaxResult })` — 단수 (`GiftTaxResultView.tsx:57`)
- 핵심 결과 카드 `result.finalTax` (`:258~290`)
- 별지서식 `GiftTaxFilingFormTable result={result}` → `result.besshi10Rows` (`:292~296`, `GiftTaxFilingFormTable.tsx:22~67`)
- 선택 출력 `availablePrintIds` useMemo (`:182~223`) — 단수 result 기준
- PDF: `gift-besshi-pages.tsx:58` `want("filing-form-10") && besshi10Rows.length>0`

### 변경 방향
- `GiftTaxResultView` props를 `result: GiftTaxResult` 유지 + `simultaneousResults?: GiftTaxResult[]` 추가(건 0 무변경, 추가 건 배열).
- 각 추가 result마다 `GiftTaxFilingFormTable` 반복 렌더 + 건 헤더("조부모로부터 — 70,000,000").
- **수증자 총 납부세액 합계 카드**: `result.finalTax + Σ simultaneousResults.finalTax`.
- PDF: `gift-besshi-pages.tsx`에서 `besshi10Rows`를 result 배열로 `.map` 렌더 (`:58` 확장).
- 선택 출력: 건별 `filing-form-10` 항목 또는 건 인덱스 suffix로 분리.

> ⚠️ 미결정 D-5: 별지서식이 건별로 N개면 선택 출력 패널(`GIFT_PRINT_SECTIONS`)·PDF 컨테이너 구조를 어떻게 확장할지. 1차는 "동시증여 신고서 전체" 단일 토글로 묶고, 후속에서 건별 분리 검토.

---

## 8. 14지점 동기화 영향 (CLAUDE.md Definition of Done)

| 지점 | 파일 | 변경 |
|---|---|---|
| ① FormState | `gift-tax-form-shared.tsx:37` | `simultaneousGiftForms` 신규 (기존 `simultaneousGifts` 대체/병행) |
| ② INITIAL_FORM | `:119` | `simultaneousGiftForms: undefined` (3-state) |
| ③ normalize | `normalize-restored-form-dates.ts` | sub-form 내 Date 필드(비상장주식) 복원 |
| ④ API 변환 | `lib/calc/gift-api.ts:41` | `buildGiftTaxInput` → 건 배열 변환 `buildSimultaneousGiftInputs` |
| ⑤ UI 위젯 | `gift-tax-form-shared.tsx`, `gift/GiftCreditChecklist.tsx` | 카드 반복 UI |
| ⑥ 사이드바 | — | 증여세 사이드바 합계 미사용 (해당 없음) |
| ⑦ 결과 카드 | `GiftTaxResultView.tsx` | N개 별지 + 합계 |
| ⑧ validation | `gift-tax-form-validate.ts:29` | 각 sub-form 단계 검증 + 동일인/타인 경고 |
| ⑨ Zod 메인 | `lib/validators/property-valuation-input.ts:495` | `giftTaxInputSchema` 배열 또는 동시증여 입력 스키마 |
| ⑩ Zod 보조 | `lib/validators/gift-aux-schemas.ts` | sub-form 스키마 |
| ⑪ Zod 자산 | `lib/validators/estate-item-schema.ts` | 재사용 (변경 없음 예상) |
| ⑫ Route 입력 매핑 | `app/api/calc/gift/route.ts:48` | 배열 입력 parse → `calcSimultaneousGifts` |
| ⑬ 엔진 | `lib/tax-engine/gift-simultaneous.ts` (신규) | 오케스트레이터 |
| ⑭ Route 응답 | `route.ts:71` | `{ result, simultaneousResults }` 반환 |

> ⑫⑬⑭는 TypeScript 미감지 → grep 자가 점검 (memory `feedback_api_zod_schema_sync`).

---

## 9. Phase 분할 (단계적 — 각 Phase anchor 검증 후 진행)

- **Phase 0 (Pre-Do anchor)**: `deriveDonorRelation(grandparent)` 매핑 실측 + 부모130M/조부모70M 2건 anchor를 throwaway로 작성·실패 확보 → 설계 환류 (memory `feedback_pre_anchor_verification`).
- **Phase 1 (엔진)**: `calcSimultaneousGifts` 오케스트레이터 + 동일인 합산 + 공제 안분 자동 주입. anchor: 안분·세대생략·합계 1원 정합.
- **Phase 2 (API/Zod)**: 배열 입력 스키마 ⑨⑩⑫⑭ + route 분기.
- **Phase 3 (UI 입력)**: (A) 카드 반복 + 토글 + ④ 변환 + ⑧ validation.
- **Phase 4 (결과뷰)**: N개 별지서식 + 합계 카드 + PDF/선택출력.
- **Phase 5 (E2E)**: Playwright 동시증여 2건 입력→계산→별지 2개·합계 검증 (E2E_PORT=3101).

> 한 PR 일괄 vs Phase별 PR은 사용자 결정 대기. 권장: Phase 1~2(엔진+API)를 1차, Phase 3~5(UI)를 2차로 분리.

---

## 10. anchor 테스트 계획

- **A-1 안분 (현행 회귀)**: 부모 130M + 조부모 70M → 부모건 공제 `50M×130/200=32,500,000`, 조부모건 `50M×70/200=17,500,000`.
- **A-2 세대생략**: 조부모건 §57 30% 할증이 산출세액에 반영 (현행 간이입력 미반영분).
- **A-3 합계**: 부모건 결정세액 + 조부모건 결정세액 = 수증자 총 납부세액.
- **A-4 동일인 합산**: 부 130M + 모 50M (둘 다 그룹 A) → 1건 180M으로 합산, 별지서식 1개.
- **A-5 완전 별도**: 부모(직계존속) + 직계비속 → 공제그룹 다름, 안분 없이 각각 5천만원·5천만원 공제.
- **A-6 이미지7 재현**: 건0 부(60M) + 건1 조부모(100M) → 건0 공제 `50M×60/160=18,750,000`, 과세표준 41,250,000, 산출세액 4,125,000, 신고세액공제 123,750, 신고납부 4,001,250.
- **A-7 사전증여 합산**: 동시증여 건에 그 동일인의 과거 10년 증여가 있으면 §47 합산(건별 독립 처리). 예: 건1 조부모 70M + 3년 전 조부모 30M → 건1 합산과세가액 100M.

> 교재/이미지 예제는 원단위 `toBe()` anchor (memory `feedback_pdf_example_test_anchoring`).

---

## 11. 미해결·결정 필요 (Design 진입 전)

- ✅ **D-2 (결정)**: 동일인은 **한 카드로만 입력** — UI 차단/경고로 보장, 엔진 STEP 1 동일인 합산은 방어적 가드로 축소.
- ✅ **D-4 (결정)**: **(A2) 경량 카드** — 기존 컴포넌트 재사용, 추가 건은 `SimultaneousGiftCard`로 분리.
- **D-1**: `GiftSubForm` 타입 — `FormState` 재사용 vs 부분집합 신규. (Design에서 sub-form 필드 전수 enumerate 후 확정)
- **D-3**: §53의2 혼인·출산 1억(수증자 통산)의 다건 배분. (Design에서 안 제시)
- **D-5**: 건별 별지서식 N개의 선택 출력·PDF 컨테이너 구조. (Design에서 안 제시)
- **D-6**: 기존 `simultaneousGifts`(간이) 입력의 마이그레이션·하위호환 — 폐기 vs 병행. (Design에서 안 제시)

> D-1·D-3·D-5·D-6은 Design 단계에서 안을 제시·확정한다.

---

## 12. 다음 단계

1. 이 계획서 리뷰 → D-1~D-6 결정.
2. `/plan-self-review` 또는 plan-self-review 워크플로로 엔진·UI 설계 생성 + 13단계 자가검증.
3. Phase 0 Pre-Do anchor 작성 → 설계 환류.
4. Phase 1부터 구현.

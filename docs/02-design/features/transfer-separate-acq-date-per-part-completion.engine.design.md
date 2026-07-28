# 토지·건물 취득시기 상이 — 취득가액 축 재설계 · 엔진 설계 (rev.3)

> 계획서: `transfer-separate-acq-date-per-part-completion.plan.md` (rev.3)
> 대상: `lib/tax-engine/transfer-tax-split-gain.ts` · `types/transfer-split-gain.types.ts` · `types/transfer.types.ts` ·
> `lib/calc/transfer-tax-api.ts` · `lib/calc/transfer-tax-validate-split.ts` · `lib/calc/transfer-tax-split-acq-mode.ts`
> 검증 원칙: file:line·법령은 실측/조문 확인 완료. 미확인은 "확인 필요".
>
> **rev.3 = STEP 1 6-way 자가검토(critical 10·high 13) 전량 반영.** rev.1 대비 폐기·정정된 항목은 §0에 명시.

---

## 0. rev.1 대비 폐기·정정 (자가검토 결과)

| rev.1 항목 | 판정 | 사유 |
|---|---|---|
| 파트별 기준시가 독립 입력 (양 propertyType) | **축 B는 `building` 한정으로 축소** | 주택(라목)은 부수토지 포함 결합 공시 — §163⑥2호가목. 파트 독립 입력 시 개산공제 합계가 법정액 이탈 |
| 신규 필드 `landStandardPriceAtAcquisition` | **폐기** | 기존 `standardPricePerSqmAtAcq × acquisitionArea`와 동일값. 문제는 필드가 아니라 **조회 기준일** |
| 신규 echo `stdPriceAtAcquisition` | **폐기** | `SplitPartResult.stdPriceAtAcq`(`transfer-split-gain.types.ts:39`)·`acqMode`(`:47`)가 **이미 존재** |
| E4 `ratio` nullable 전환 | **폐기 → E4′로 대체** | `SplitGainResult.apportionRatio`가 **non-optional**(`:53`), `split-gain.ts:244` 무조건 구조분해, `:292`·`:397` 소비처 존재 → 컴파일 불가 + 새 silent 오배분 신설 |
| `ratio?.land ?? 0` 안전접근 | **금지** | `:148`(토지 양도시 기준시가)·`:256`(양도 안분)·`:292`(자본적지출)를 0으로 만드는 silent 오배분 |
| 스토어 마이그레이션 물질화 | **폐기** | 필드명 오류(`fixedAcquisitionPrice`·`standardPriceAtAcq`·`standardPricePerSqmAtAcq`) + `calcApportionRatio` 산식 재구현(dual-truth, `split-gain.ts:26` 미export) |
| E1 레거시 후퇴(한쪽만 신규 필드) | **all-or-nothing으로 강화** | 서로 다른 취득시점 값의 혼합 뺄셈은 법적 근거 없음 |
| `?? 0` 반환의 "validate 선차단" 면책 | **null 승격으로 대체** | validate는 클라이언트 전용. Route 직접 호출 시 도달 (Q7 확정) |

---

## 1. Context

`calcSplitGain`의 **취득가액 축(A)**이 자산 전체 총액(`input.acquisitionPrice`)에 종속되어 있다 — 한쪽만 입력하면 `총액 − 입력값`(잔액), 둘 다 미입력이면 `총액 × landRatio`(안분)로 채운다(`split-gain.ts:48-59`, `:170-206`). 별개 취득이면 그 총액은 실재하지 않으므로 §114⑦·§176의2③의 "해당 자산별 추계"와 충돌한다.

**축 B(취득시 기준시가)는 별개 문제**다. `building`(가목 토지 + 나목 건물)은 분리 공시가 있어 파트별 독립 입력이 정본이지만, `housing`(라목)은 부수토지 포함 결합 공시라 현행 역산(`:249`)이 §163⑥ 법정 개산공제를 지키는 장치다(계획서 §2-D).

---

## 2. 케이스 인벤토리 (Do 진입 게이트)

계획서 §6-A(B1~B13)·§6-B(H1~H10)를 정본으로 한다. 엔진 관점 요약:

| 축 | `building` | `housing` |
|---|---|---|
| A. 취득가액 | 파트별 완결 (E2·E3) | **파트별 완결 (E2·E3)** — 동일 |
| B. 취득시 기준시가 | 파트별 독립 (E1) | 라목 결합 + 역산 **유지** |
| 게이트 | E0′ (P1에서 선행 착지) | E0′ 동일 |
| 지분 | E5 `applyRatio` | E5 동일 |

---

## 3. 엔진 input / result 타입

### 3.1 input (`types/transfer.types.ts`)

```ts
/** 건물(나목) 취득 당시 기준시가. 기준일 = acquisitionDate. **propertyType==="building" 전용**. */
buildingStandardPriceAtAcquisition?: number;

/** 별개 취득 판정(계획서 §5.0). API 변환이 단일 헬퍼로 파생해 전달 — 엔진이 재판정하지 않는다. */
isSeparateAcquisition?: boolean;
```

- 신규는 **2개뿐**이다(rev.1의 `landStandardPriceAtAcquisition` 폐기).
- `housing`은 신규 필드 **0개** 사용.
- 분리 모드에서 `input.acquisitionPrice`는 **축 A 계산에 미사용**. API 변환이 파트 합계를 파생해 넣으며 용도는 신고서·표시·legacy 소비처 한정.
- 사용 중지(분리 모드 한정): `appraisalValue`(`transfer.types.ts:306`) · `similarSalesValue`(`split-gain.ts:189`에서 salesCase base로 소비) — E3이 파트 필드만 쓰므로 축 A에서 참조하지 않는다.

### 3.2 result (`types/transfer-split-gain.types.ts`)

**신규 echo는 1개뿐**이다 — 나머지는 기존 필드 재사용.

```ts
// SplitPartResult — 기존 재사용
stdPriceAtAcq?: number;   // :39 — 이미 존재. 파트 취득시 기준시가(개산공제 base·환산 분자)
acqMode?: PartAcqMode;    // :47 — 이미 존재. 파트별 방식 echo

// SplitPartResult — 신규
/** 이 파트의 취득시 기준시가가 결합 총액에서 역산된 값인지(housing 라목 정상 경로 / building 레거시 후퇴). */
stdPriceDerivedFromTotal?: boolean;
```

- **파트별로 각각 판정**한다(자산 1개 값을 두 파트에 부착 금지 — 명시 입력 파트가 "역산됨"으로 오표시된다).
- `housing`에서 이 플래그는 **정상 경로 표식**이지 결함 표식이 아니다 → UI fine-print 문구는 propertyType별로 다르게(ui.design §결과 화면).
- `SplitGainResult.apportionRatio`(`:53`)는 **non-optional 유지** — E4′가 nullable 전환을 폐기했으므로 타입 변경 없음(⑦ 동기화 부담 0).
- 명명 규약: `stdPriceAtAcq`는 부담부증여 안분 result(`BurdenedGiftDetailCard.tsx:143,155`의 `stdPriceAtAcquisition`)와 **다른 이름**이다. split 계열은 `stdPriceAtAcq`로 통일한다(기존 필드 승계).

---

## 4. 알고리즘 (E0′ ~ E5)

### E0′. 게이트 결함 — `calcApportionRatio` null 처리 ✅ **P1에서 선행 착지 (PR #837)**

**rev.1 E4는 폐기.** `ratio`를 nullable로 만드는 대신 **입력 경로를 열어 ratio가 산출되게** 한다.

- UI: 취득시 기준시가 3요소 입력을 `useEstimatedAcquisition || isSplit`에서 노출.
- API: `standardPriceAtAcquisition` 전송 게이트에 `|| isSplitActive` 추가.
- 엔진: **무변경**. `:241-242` `if (!ratio) return null` 유지, `:244` 구조분해 유지, `:148`·`:256`·`:292`·`:397` 소비처 전부 무변경.

> 이 설계로 rev.1이 만들려던 3가지 위험(컴파일 불가 · 새 silent 오배분 · 소비처 4곳 파급)이 **전부 소멸**한다. 엔진을 건드리지 않고 결함이 해소되는 것이 자가검토의 최대 성과다.

**잔여 과제**: ratio 3요소가 여전히 미입력이면 분리는 비활성이다. 이때 **조용히 넘어가지 않도록** validate V0(§5)이 차단한다.

### E1. 축 B 파트별 독립 — `building` 전용

```
if (propertyType === "building" && isSeparateAcquisition) {
  const landStd     = input.standardPricePerSqmAtAcquisition * input.acquisitionArea;  // 토지취득일 조회
  const buildingStd = input.buildingStandardPriceAtAcquisition;
  // all-or-nothing: 둘 다 있으면 신규, 둘 다 없으면 레거시 역산, 한쪽만 → validate V3이 차단
}
else {  // housing 또는 비분리
  landStdAtAcq     = floor(standardPricePerSqmAtAcquisition × acquisitionArea);   // 현행 :248
  buildingStdAtAcq = max(standardPriceAtAcquisition − landStdAtAcq, 0);           // 현행 :249
}
```

- **혼합 역산 금지**: `신규 land + (레거시 총액 − 신규 land)`는 서로 다른 취득시점 값의 뺄셈이라 법적 근거가 없다.
- `housing`은 이 분기에 들어오지 않는다 → `land + building ≡ 라목 총액` 항등성 보존 → 개산공제 합계 = 라목 × 3% (anchor H10).

### E2. 축 A `actual` / `appraisal` — `splitPair` 제거 (**양 propertyType**)

`calcOnePart`(`:170-206`) 해당 분기:

```ts
case "appraisal":
case "actual": {
  const own = isLand ? input.landAcquisitionPrice : input.buildingAcquisitionPrice;
  if (own == null) return null;   // ← 0이 아니라 null 승격 (Q7 확정)
  return own;
}
```

- 잔액(`total − other`)·비율 안분 **양쪽 제거**. 총액 참조 소멸.
- **`?? 0` 금지**: `appraisal` 모드는 취득가액 0 + 개산공제 3%가 남아 "그럴듯한 소액"이 되므로 눈에 띄는 이상값이 아니다. `null` 승격 후 `calcSplitGain`이 상위에서 차단한다 → validate가 클라이언트 전용이어도 Route 직접 호출에서 조용한 오답이 생기지 않는다.
- 감정가액은 `land/buildingAcquisitionPrice` 재사용(Q3) — 파트 모드가 배타적이라 의미 충돌 없음. 현행 `appraisal` 분기도 이미 같은 필드를 읽는다.

### E3. 축 A `salesCase` — 총액 안분 fallback 폐지 (**양 propertyType**, Q1)

```ts
case "salesCase": {
  const own = isLand ? input.landSalesCaseValue : input.buildingSalesCaseValue;
  if (own == null) return null;   // 파트별 필수
  return own;
}
```

근거: §176의2③1호의 매매사례 탐색 창이 **각 파트 취득일 ±3개월**로 다르다. 서로 다른 시점의 사례를 하나의 총액으로 묶어 안분할 법적 근거가 없다.

> ⚠️ **동작 변경 명시**: `split-gain-salescase.anchor.test.ts`의 "파트 미입력 → 총액 안분" 케이스는 **의도적으로 폐기**된다. anchor 기대값 변경 시 위 §176의2③1호 근거를 주석으로 남긴다(`feedback_anchor_correction_legal_priority`).

### E4′. `calcOnePart` null 전파 처리 (신규)

```
const land = calcOnePart(landMode, true, ...);
const building = calcOnePart(buildingMode, false, ...);
if (land == null || building == null) return null;   // 상위에서 "분리 계산 불가"로 처리
```

- 소유 파트만 계산하는 `selfOwns` 경로는 비소유 파트를 null 검사 대상에서 제외한다.
- `calcSplitGain`이 null이면 호출부는 **비분리 단일 경로로 강등하지 않고 오류를 표면화**해야 한다 — 이것이 §3.1 결함의 재발 방지선이다. (호출부 처리 방식은 Do 단계에서 `transfer-tax.ts` 실측 후 확정 — **확인 필요**)

### E5. 지분 모드 — 파트 필드 `applyRatio` (Q5)

`transfer-tax-api.ts`에서 총액은 `applyRatio(fixedAcquisitionPrice, primaryRatio)`(`:250`)인데 파트 필드는 raw(`:355-358`), `appraisalValue`도 raw(`:314`)다. 축 A가 파트 필드만 쓰면 지분 안분이 소실된다.

```
landAcquisitionPrice:     primaryFractional ? applyRatio(parseAmount(...), primaryRatio) : parseAmount(...)
buildingAcquisitionPrice: 동일
land/buildingSalesCaseValue: 동일
```

- 스케일 단일화 지점은 **API 변환 1곳**으로 한정한다(엔진은 이미 안분된 값을 받는다 — 현행 총액과 동일 규약).
- 양도가액 파트 필드(`:348-349`)의 동일 결함은 **선재·범위 밖**(계획서 §14).

---

## 5. validate (`transfer-tax-validate-split.ts`)

**배치가 critical**: 현행 §7.2 게이트는 `:57` early-return(`saleSplitMode !== "actual"`)·`:60-65` `skipTotals`(지분·부담부증여·재개발 제외)보다 **앞**에 있다. V0~V3도 **함수 최상단**에 둔다 — 뒤에 놓이면 해당 경로가 미검증이 되어 E2·E3의 null 승격이 사용자에게 설명 없이 계산 실패로만 보인다.

| ID | 조건 | 메시지 요지 |
|---|---|---|
| **V0** | 분리 모드 + 취득시 기준시가 3요소 중 하나라도 0/미입력 | "토지·건물 분리 계산에는 취득시 기준시가(총액·㎡당 공시지가·면적)가 필요합니다 (§166⑥ 안분 비율)" — §3.1 조용한 비활성 차단 |
| V1 | 파트 모드 `act`/`apr` + 그 파트 취득가액 미입력 | "{토지\|건물} 취득가액을 입력하세요 — 별개 취득 자산은 나머지에서 자동 계산되지 않습니다" |
| V2 | 파트 모드 `sc` + 그 파트 매매사례가액 미입력 | "{토지\|건물} 매매사례가액을 입력하세요 (§176의2③1호 — 각 파트 취득일 전후 3개월)" |
| V3 | `building` + 파트 취득시 기준시가 **한쪽만** 입력 | "토지·건물 취득시 기준시가를 모두 입력하세요 — 한쪽만 입력하면 나머지를 결합 총액에서 역산하게 되어 취득시점이 섞입니다" |
| V4 | 취득 축 `splitPair` overflow 검증 | **제거** — 잔액 규칙 자체가 사라짐. 양도가액·자본적지출 overflow 검증은 **존치**(총액 개념이 유효한 축) |

- 기존 §7.2(양도시 기준시가 필수) 검증은 **유지**.
- V0은 P1(PR #837)에서 입력 경로가 열린 뒤에야 의미가 있다 → **P4에서 착지**.
- `transfer-validate-date-cross-rules.test.ts:192,201`의 split 픽스처에 파트 금액·기준시가가 없다 → V0~V2 도입 시 영향 여부 **확인 필요**(해당 테스트는 `.some(msg 포함)` 단언이라 추가 이슈로는 깨지지 않을 가능성이 높으나, `validateSplitDirectInputs`가 **첫 오류만 반환**하는 구조라 순서에 따라 기존 메시지가 가려질 수 있다 — Do 단계 실측 필수).

---

## 6. 마이그레이션 — **없음**

rev.1의 물질화 마이그레이션은 폐기(§0). 근거:
- `housing`은 축 B 무변경 → 대상 없음.
- `building`은 신규 필드 미입력 시 E1 레거시 역산으로 기존 동작 유지.
- ③ normalize에서는 신규 필드 `undefined` 가드만 추가.

→ `calc-wizard-asset-migrate.ts`에 엔진 산식을 재구현하지 않으므로 dual-truth가 발생하지 않는다.

---

## 7. Silent fallback 판정표

| 위치 | 동작 | 판정 |
|---|---|---|
| E0′ 3요소 미입력 → 분리 비활성 | 종전 조용한 강등 | **차단**으로 전환 (V0) |
| E1 `building` 레거시 역산 (둘 다 미입력) | 결합 총액 역산 | **허용(한시, Q4)** — echo `stdPriceDerivedFromTotal`로 노출 |
| E1 한쪽만 신규 필드 | 혼합 역산 | **차단** (V3) |
| `housing` 라목 역산 | 결합 총액 역산 | **허용 — 법정 정상 경로**(§163⑥2호가목). echo 문구를 결함 표식으로 쓰지 말 것 |
| E2·E3 파트 미입력 | `null` 승격 | **차단** (V1·V2 + 엔진 null) |
| 축 A 잔액 도출·총액 안분 | 폐기 | **차단** |
| 양도 축 안분·잔액 | 유지 | **허용** — §100② 명문 |

---

## 8. 무변경 확정 목록 (회귀 0 대상 · 라인 실측 정정분)

| 항목 | 위치 | 사유 |
|---|---|---|
| 양도가액 분리 `splitPair(totalTransfer, …)` | `split-gain.ts:257-262` | §100② 함께 양도 — 정당 |
| 양도 안분 비율 `calcSaleApportionRatio` | `:254-256` | 부가세령 §64①1호 양도시 기준시가 |
| 개산공제 §163⑥ 파트별 3% | `:301-304` | 파트 모드 기준 — 이미 정당 |
| §97②2호 swap `applyAssetSwap` | `:310-` | 환산 모드 전용 게이트 유지 |
| 자본적지출 파트 처리 | `:280-293` | 총액>0(legacy)만 안분, 신규는 독립 |
| PHD §164⑤ 경로 + 양 파트 est 게이트 | `:230-239` | 무변경 |
| `ratio` 가드·구조분해 | `:241-242`·`:244` | E0′가 nullable 전환을 폐기 → 무변경 |
| `apportionRatio`·`note` result | `:397-398` | 타입·값 무변경 |
| `selfOwns` 파트 제외 | 기존 | 무변경 |
| 비분리·겸용·`selfOwns` 날짜동일 | `calcSplitGain` null | 무변경 |

> rev.1의 인용 오기 정정: `calcOnePart` `:170-206`(종전 170-205) · 개산공제 `:301-304`(종전 303-307) · swap `:310-`(종전 311-) · 자본적지출 `:280-293`(종전 279-294) · 양도가액 `:257-262`(종전 252-262) · PHD `:230-239`(종전 228-237) · validate §7.2 `:45-55`(종전 45-58).

---

## 9. 테스트 약속

- **Pre-Do anchor (P0)**: H1(housing 게이트 재현 — PR #837에서 착지) · B1(building 실가+실가) · B10/H3(파트 미입력 차단).
- **신규 anchor**: B6(`apr`+`apr` — 총액 `appraisalValue` 완전 미사용) · B7·B9(추계 혼합) · B12(지분 `applyRatio`) · **H10(개산공제 합계 = 라목 × 3% 항등성)**.
- **재작성**: `land-building-mixed-acq-mode.test.ts`(building 케이스) · `split-gain-salescase`(E3 동작 변경) · `split-gain-residual-symmetry`(취득 축 케이스 → B10/H3로 대체, 양도 축 존치).
- **수치 불변 회귀**: `land-building-split.test.ts` S1~S5 · `acq-cost-swap-split` · `owner-split-case12` · `expropriation-split-land` · `expropriation-phd-split` · `pre-housing-disclosure.test.ts:172,182`.
- **게이트 회귀**: H7(겸용 제외) · H8(`selfOwns` 날짜동일 제외) · 다건 차단(`multi-transfer-tax-validate.ts:87-89`).
- **⑫⑬⑭ 배관**: `transfer-tax-api-split-gate.test.ts`에 `buildingStandardPriceAtAcquisition`·`isSeparateAcquisition` 전송 케이스.
- **stale 가드**: `burdened-gift-stale-acq-method.anchor.test.ts` 동형 — Q2 숨김 후 `fixedAcquisitionPrice`·`appraisalValue`·`similarSalesValue`가 축 A에 도달하지 않음을 단언(숨김+폼상태 보존 패턴의 과거 실사고 재발 방지).

---

## 10. UI 통합 위임

→ `transfer-separate-acq-date-per-part-completion.ui.design.md` (rev.3)

# 별지 제9호서식 부표 2 — 금액 정합 4버그 수정 계획서

> 2026-06-02 · feature: `inheritance-buppyo-2-4bug-amount-fix`
> 선행: 부표2 1차 재현 `c68bade` + 진행중(미커밋) `inheritance-buppyo-2-image1-parity-page-split`(레이아웃 전용)
> 소관: `inheritance-gift-tax-senior`(검증·anchor) · `inheritance-gift-tax-ui-senior`(어댑터·화면·PDF)
> **근거: 사용자 지적 4건 + 양식 작성방법(engine.design.md §작성방법, KoreanLaw 검증본) + Pre-Do anchor 실측값.**

---

## 0. 배경 — 사용자 지적 4건

사용자 첨부 이미지(부표2 출력 = 양식 공식 예시 데이터: 과세가액 8,775,000,000 · 배우자 3/7)에서 **금액 4건이 틀림**:

| # | 버그 | 현재 출력 | 정답 | 근거 |
|---|---|--:|--:|---|
| **B1** | ⑥ 법정상속재산가액 | 3,760,714,285 | **3,252,857,142** | 작성방법 #3 |
| **B2** | ⑧ 실제상속재산가액 = 명세 합계 (불변식) | ⑧=3,300,000,000 / 명세=4,060,000,000 (불일치) | 양쪽 **4,210,000,000** | 작성방법 #5 + 양식 예시 |
| **B3** | 명세(나) 합계 오류 | 4,060,000,000 (본래+사전증여, 추정 누락) | **4,210,000,000** | B4 해소의 결과 |
| **B4** | 명세에 "추정상속재산" 행 누락 | (행 없음) | 추정 150,000,000 행 추가 | 양식 예시 16행 |

> ⚠️ **진행중 작업과의 관계**: `inheritance-buppyo-2-image1-parity-page-split`(상속인당 2페이지 분리 — 레이아웃 전용, 미커밋)이 동일 파일군을 수정 중. 본 4버그 수정은 **그 위에 얹는 별도 커밋**. 충돌 지점 0 (U6 검증 — 레이아웃 diff와 금액 diff는 라인·함수 비중첩). 단 NaTable 「계 행」은 page-split이 `total` prop만 추가하고 행 렌더는 미구현 → B3에서 완성.

---

## 1. 근본 원인 (Pre-Do anchor 실측 — 엔진 시니어 22 anchor GREEN)

대상: `lib/calc/besshi-buppyo-2-data.ts` `buildBuppyo2Data(result, heirs, estateItems, priorGifts)` (단일 진실 게이트웨이 — 화면·PDF가 이 결과만 소비). **4건 모두 어댑터 표시 산식 오류. 엔진 계산은 정확.**

### B1 — ⑥ 법정상속재산가액 base 오류 (`besshi-buppyo-2-data.ts:173-176`)

```ts
// 현재 (틀림): 과세가액 8,775M × 3/7 = 3,760,714,285
Math.floor((result.taxableEstateValue * numerator) / legal.denominator)
```

- **작성방법 #3**: 법정상속재산가액 = `[(총상속재산가액 + 가산증여) − (상속인외 유증 + 비과세 + 공과금 + 채무)] × 법정지분`
- 이 base는 **엔진이 §19 배우자 법정상속분에서 이미 산출**(`inheritance-tax.ts:332` `numeratorCorrected`) → result에 echo로 노출:
  - **경로**: `result.deductionDetail.spouseDeductionDetail.legalShareTable.numerator`
  - **anchor 실측값 = 7,590,000,000** (= 8,775M − 상속인외유증 500M − 상속인외사전증여 700M + 장례비 15M, 사용자 산식과 동치)
  - `legalShareTable.spouseLegalShareRaw` = **3,252,857,142** (배우자 ⑥ 정답)
  - 직렬화 안전: `SpouseLegalShareTable`(`types/inheritance-deduction-detail.types.ts:48`)은 전부 숫자 필드, Map 없음 → `NextResponse.json` 소실 0
- base는 **heir-독립**(모든 상속인 공유). 각 상속인 ⑥ = `floor(7,590,000,000 × 그 상속인 법정지분)`:
  - 배우자 3/7 → 3,252,857,142 · 자녀 각 2/7 → 2,168,571,428
- 현재값과 차이 = **507,857,143원** (1원 오차 아님 — 구조적 오류. 과세가액에 사전증여·추정 포함되어 분자보다 큼)

> ★ **단일 진실 정책** (`feedback_ui_engine_dual_truth_avoidance` ★★★ · `single-source-engine-helper`): 어댑터가 base를 **재계산하지 않고** 엔진 echo(`legalShareTable.numerator`)를 **읽기만** 한다. (UI 시니어 1차 제안 "어댑터에서 `taxableEstateValue − legatee − corp + funeral` 재계산 + `debtItems` 파라미터 추가"는 §19 산식 이중 구현 = dual-truth 위반 → **기각**.)

### B2 — ⑧ 실제상속재산가액 (`besshi-buppyo-2-data.ts:185`)

```ts
actualShareAmount: grossInheritance  // = Σ categoryBreakdown = 본래상속만 3,300M (틀림)
```

- **작성방법 #5** + 양식 예시: ⑧ = 명세 합계 = 본래(3,300M) + 추정(150M) + 사전증여(760M) = **4,210M**
- anchor 실측: `grossInheritance`=3,300M · `presumedAmount`=150M · `priorGift13`=760M
- 조립 위치: `sectionA`(line 179)가 `itemRows`(line 188~)보다 먼저 조립되나, ⑧ 3성분(grossInheritance·presumedAmount·priorGift13)은 모두 sectionA 시점 가용 → **sectionA 재정렬 불필요**, `priorGift13` 산출 1줄만 sectionA 앞으로 이동(§3-1 B2).

### B3 — 명세(나) 합계 = 4,060M (추정 누락) (`besshi-buppyo-2-data.ts:188-231, 250`)

- itemRows = 본래상속 루프(190-213) + 사전증여 루프(216-231) → **추정상속재산 행 없음** → `itemRowsTotal`(250) = 3,300M + 760M = 4,060M
- **NaTable 「계 행」 자체가 미구현**(`Buppyo2NaTable.tsx` — page-split이 `total` prop만 추가, `<tr>계</tr>` 렌더 없음) → 화면에 합계 행 미표시

### B4 — 추정상속재산 행 누락 (`besshi-buppyo-2-data.ts` 나 섹션)

- anchor 실측 `perHeir.presumedAmount`: 배우자 150M · 장남 100M · 차남 100M · 법인·손녀 0 (§15 추정 합계 350M)
- 추정상속재산은 자산별 line-item 없는 §15 일괄 추정 → **상속인별 단일 행**
- 코드: `EstatePropertyKindCode`에 **`A13`("상속개시 전 처분재산") 존재**(`inheritance-prior-gift.types.ts:111,116`). 단 `inferEstateItemKindCode`는 `A11|A12`만 반환 → A13은 직접 지정.

---

## 2. 발견된 연관 불일치 2건 — **스코프 외 (2026-06-02 사용자 결정으로 제외)**

검증 중 양식 예시·작성방법과 추가 불일치 2건 발견. **사용자 결정: 둘 다 본 수정에서 제외** (C1 ㉘ 제외 · C2 ⑦ 현행 유지). 아래는 근거·결정 기록(향후 재검토 참조용).

### C1 — ㉘ 「계」 합계 (`besshi-buppyo-2-data.ts`) — **포함 (2026-06-02 재지시로 결정 번복)**

```ts
// 수정: ㉘ = ⑰+⑱+㉕ (비과세·불산입 공란, 「계」에 채무 행 없음 → 채무 미차감) = ⑧
total: grossInheritance + presumedAmount + priorGift13  // = 4,210M (구: taxableValueShare 3,695M)
```

- 양식 「계」 섹션에 채무·공과금·장례비 행이 없음 → ㉘ = ⑰+⑱+㉕ (채무 미차감). **⑧=㉘=명세 3자 정합**.
- 초기 결정(2026-06-02): 제외 → **사용자 재지시(이미지5)로 포함 확정.** `taxableValueShare`(3,695M, 채무차감 후) 폐기.
- anchor: B2-3을 `total === ⑰+⑱+㉕ === ⑧`로 갱신 + A-C1(배우자 4,210M) 신규.

### C2 — ⑦ 실제상속지분율 (`Buppyo2GaSection.tsx:19,66` · PDF `:37,119`) — **현행 유지 (사용자 결정)**

- 현재 = `grossInheritance / ΣgrossInheritance` = 49.4% (본래상속 기준, 상속인 합 = 1). 포맷 `pct()` = `"49.4%"`.
- 양식 인쇄 샘플은 `"0.58413"` 소수 표기이나, 이는 사용자 케이스(김마누라)가 아닌 **양식 샘플(갑, 1.5/3.5)** 값이고 작성방법 #4 분모 정의(Σ⑧ vs 부표1 ⑫ 총액)가 모호 → 동일 케이스 검증 불가.
- → **사용자 결정(2026-06-02): 현행 유지.** ⑦ 값·포맷 **무변경**. `Buppyo2GaSection.tsx`·PDF의 ⑦ 코드 무변경.

---

## 3. 수정 항목 (어댑터 중심 — 엔진 변경 0 확정)

### 3-1. 어댑터 `lib/calc/besshi-buppyo-2-data.ts`

| 버그 | 위치 | 수정 |
|---|---|---|
| **B1** | line 173-176 | base = `result.deductionDetail?.spouseDeductionDetail?.legalShareTable?.numerator ?? result.taxableEstateValue` → `Math.floor(base × numerator / denominator)`. 배우자 無 시 `taxableEstateValue` fallback(D-3) |
| **B4** | line 213↔216 사이 (본래 루프 후·사전증여 루프 전) | `if (breakdown && breakdown.presumedAmount > 0)` → A13 단일 행 push (locationOrName `"추정상속재산"`, valuatedAmount=presumedAmount, typeCode·valuationMethodCode는 D-1·D-2) |
| **B3** | line 250 | (자동) itemRows에 추정 행 포함 → itemRowsTotal = 4,210M |
| **B2** | line 185 (+ `priorGift13` 산출 1줄을 sectionA 앞으로 이동) | `actualShareAmount = grossInheritance + presumedAmount + priorGift13`. **sectionA 재정렬 불필요**(3성분 모두 sectionA 시점 가용). 완전입력 시 `=== itemRowsTotal`(A-INV) |
| **C1(㉘)** | line 243 sectionTotal.total | `grossInheritance + presumedAmount + priorGift13`(= ⑰+⑱+㉕ = ⑧). taxableValueShare 폐기 |

> **legatee·corporate ⑥**: `numerator`가 `undefined`(법정상속분 없음, line 170-171) → ⑥ `legalShareAmount = null` **유지**. base 변경(B1) 무관. (`computeLegalShares`가 수유자·법인 제외 — 기존 동작.)

### 3-2. 화면 `Buppyo2NaTable.tsx` — 「계 행」 렌더 추가 (B3 완성)

- **화면 NaTable은 계 행이 미구현**(`total` prop만 수신, `<tr>계</tr>` 없음 — page-split diff에서 prop만 추가됨) → tbody 빈 행 이후 `<tr data-testid="buppyo2-na-total-{idx}">` + `<td colSpan>계</td>` + `<td>{fmt(total)}</td>` 추가 (⑮ 평가가액 열 정렬, `amount-column-align`)
- 추정 행은 itemRows에 포함되어 기존 `NaRow` 매핑으로 자동 렌더 (typeCode 라벨 매핑 — D-1)

### 3-3. PDF `InheritanceBuppyo2PdfDocument.tsx` — 자동 반영 (코드 무변경)

- 동일 `Buppyo2HeirData` 소비 → ⑥(GaBlock)·⑧·명세 추정 행 모두 어댑터 수정만으로 자동 반영.
- **PDF의 NaBlock 계 행은 이미 구현됨**(`:176-180` `total` 표시) → 추정 행 포함 시 itemRowsTotal 자동 합산. 화면(미구현)과 비대칭이나 PDF는 추가 작업 0.
- ㉘(`kyeValue("total")`)·⑦(`pct`)은 **사용자 결정으로 무변경** → KyeSection·GaSection·PDF 코드 손대지 않음.

---

## 4. 확인 필요 항목 (Do 진입 전 결정 — "확인 필요" 명시)

| ID | 항목 | 현황 | 결정/필요 |
|---|---|---|---|
| **D-1** | 추정 행 `재산종류코드`(typeCode) | 양식 뒷면 코드표 미확인(본 양식 KoreanLaw 미사용 지시) | ⚠️ 확인 필요 — 코드표 확인 또는 `"12"(기타재산)` placeholder 합의 |
| **D-2** | 추정 행 `평가기준코드` | 동상 | ⚠️ 확인 필요 — `"08"` 가정 또는 코드표 확인 |
| **D-3** | 배우자 無 케이스 ⑥ base | `legalShareTable` undefined → `taxableEstateValue` fallback(근사) | 근사 허용(본 수정 범위) · 정확화는 후속(엔진 base 무조건 echo) |
| **D-4** | C1(㉘) 포함 여부 | — | ✅ **결정: 포함** (2026-06-02 재지시·이미지5). ㉘ = ⑰+⑱+㉕ = 4,210M |
| **D-5** | C2(⑦) 처리 | — | ✅ **결정: 현행 유지** (2026-06-02). ⑦ 값·포맷 무변경 |
| **D-6** | 추정 행 `kindCode="A13"` ↔ 테스트 `startsWith("A1")` 충돌 | B2-7·B2-8이 본래상속을 `startsWith("A1")`로 식별 → A13(추정)이 오분류 포함 | ✅ **정정: 테스트 필터를 exact `=== "A11"`(또는 `["A11","A12"].includes`)로** (`feedback_enum_substring_match_forbidden` ★★★). 프로덕션은 `startsWith` 미사용 확인됨(grep 전수) → 안전 |

---

## 5. 케이스 매트릭스 (anchor 인벤토리 — 행≥1 필수)

| ID | 케이스 | 검증 포인트 | 기대값 | testid |
|---|---|---|--:|---|
| **A-B1** | 배우자, ⑥ base | legalShareTable.numerator × 3/7 | 3,252,857,142 | `buppyo2-ga-0-legal-value` |
| **A-B1c** | 자녀, ⑥ base 동일 | 7,590M × 2/7 | 2,168,571,428 | `buppyo2-ga-{child}-legal-value` |
| **A-B4** | 배우자, 추정 행 존재 | A13 행 valuatedAmount | 150,000,000 | `buppyo2-na-row-0-presumed` |
| **A-B3** | 배우자, 명세 계 | itemRowsTotal | 4,210,000,000 | `buppyo2-na-total-0` |
| **A-B2** | 배우자, ⑧ | actualShareAmount | 4,210,000,000 | `buppyo2-ga-0-actual-value` |
| **A-INV** | ⑧ = 명세합계 불변식(완전입력) | actualShareAmount === itemRowsTotal | true | (어댑터 단위) |
| **A-FALL** | 협의분할 미입력 | itemRows 본래 0행 + usedLegalShareFallback=true + ⑧≠명세(배지) | (배지) | (V4) |
| **A-CORP** | legatee(손녀)·corporate(법인) | ⑧ = gross+presumed+gift, ⑥=null | 손녀 500M·법인 700M | (회귀 0) |

**기존 anchor 영향 (정밀 — 테스트 파일 실측):**

| 기존 anchor | 영향 | 조치 |
|---|---|---|
| **B2-2** (`:41` `actualShareAmount === grossInheritance`) | ❌ **깨짐** (⑧ 변경) | `grossEstateValue===grossInheritance`만 유지, ⑧===itemRowsTotal은 A-INV 분리 |
| **B2-5** (`:68` ⑥ = `taxableEstateValue`×지분) | ❌ **깨짐** (B1 base 변경) | base=`legalShareTable.numerator`(7,590M)로 갱신 + 절대값 3,252,857,142 |
| **B2-7** (`:81` `filter(startsWith("A1")).length`) | ❌ **깨짐** (A13 추정행 포함) | `startsWith("A1")` → `["A11","A12"].includes`(exact, D-6) |
| **B2-8** (`:91` `startsWith("A1")` → A11) | ❌ **깨짐** (A13 포함) | 동상 exact 비교 |
| **B2-3** (`:48` `total === taxableValueShare`) | ❌ **깨짐** (㉘ 포함) | `total === ⑰+⑱+㉕ === ⑧`로 갱신 + A-C1 신규 |
| **B2-4** (`:55` ⑦ = gross÷Σgross) | ✅ 유지 (⑦ 현행) | 무변경 |
| **B2-15** (`:161` itemRowsTotal===Σ) | ✅ 유지 (자기일관) | 값만 4,060→4,210 |

> **Pre-Do anchor 우선 실행**(`feedback_pre_anchor_verification` ★★★): `legalShareTable.numerator`(===7,590,000,000)·`taxableValueShare`(===3,695,000,000)·`presumedAmount`(배우자 150M) — **엔진 시니어 22 anchor로 GREEN 실측 완료.** 어댑터 수정 후 A-B1·A-B2·A-B3·A-INV·B2-2/7/8 재확인.

---

## 6. 변경 파일 + 14 동기화 지점

| 파일 | 변경 | 14지점 |
|---|---|---|
| `lib/calc/besshi-buppyo-2-data.ts` | B1 ⑥base · B2 ⑧ · B4 추정행 · **C1 ㉘** | **④** |
| ~~`Buppyo2NaTable.tsx`~~ | **무변경** (계 행 기구현 확인 — page-split이 이미 추가) | — |
| `__tests__/calc/besshi-buppyo-2-data.test.ts` | B2-2·B2-3·B2-5·B2-7·B2-8 갱신 + A-B1/B1c/B2/B3/C1/B4/INV/CORP 신규 | — |
| ~~`Buppyo2GaSection.tsx`~~ | **무변경** (⑥⑧은 sectionA 값만 바뀜·⑦ 현행유지) | — |
| ~~`Buppyo2KyeSection.tsx`~~ | **무변경** (㉘ 제외) | — |
| ~~`InheritanceBuppyo2PdfDocument.tsx`~~ | **무변경** (⑥⑧·추정행 자동반영·PDF 계행 기구현·⑦㉘ 제외) | — |

- **엔진·타입·Zod·route·API·사이드바·validate·화면 표시 컴포넌트 무변경** (어댑터 산출값 + NaTable 계행만). 14지점 중 **④(어댑터)·⑤⑦(NaTable 계행)** 해당, ①②③⑥⑧⑨~⑭ N/A (신규 입력 0).
- `buildBuppyo2Data` 시그니처 **불변** (B1은 result echo `legalShareTable.numerator`를 읽으므로 `debtItems` 파라미터 불필요 — 호출 사이트 변경 0).

---

## 7. 커밋 순서 (page-split 위에 얹기 — 충돌 0)

1. **커밋 A** (선행): 미커밋 page-split diff 커밋 (1쪽/2쪽 레이아웃·별첨·KyeSection rowSpan·itemRowsTotal 필드)
2. **커밋 B** (본 계획): 어댑터 3건(B1·B2·B4, ㉘ 제외) + NaTable 계 행(B3) + anchor(B2-2·7·8 갱신 + A-* 신규). 충돌 지점 0 (U6 검증).

> 미커밋 작업이 외부(병렬 세션) 편집일 수 있으므로(`feedback_external_concurrent_edit_stale_read`), 커밋 B 착수 전 대상 라인 Read 재확인 후 진행.

---

## 8. 정책 준수

- **단일 진실** (`feedback_ui_engine_dual_truth_avoidance` ★★★): ⑥ base는 엔진 echo(`legalShareTable.numerator`) 읽기 전용. 어댑터 재계산 금지.
- **추정 금지** (`feedback_pre_anchor_verification`): 핵심 수치(7,590M·3,695M·150M·A13)는 모두 엔진 시니어 anchor 실측. 미확정(D-1·D-2·D-3 코드/fallback)은 "확인 필요" 명시.
- **자동 안분 fallback 금지** (`feedback_no_silent_apportion_fallback`): 추정 행은 엔진 산출 presumedAmount만, 협의분할 미입력 본래상속은 행 생략 유지(A-FALL 배지).
- 금액 칸 `font-mono tabular-nums text-right` (`amount-column-align`) · "원" 미부착 · 800줄 분리 · `afterEach(cleanup)`
- **회귀 전수**: 커밋 전 `npm test` 전체 (B2-2·B2-7·B2-8 갱신 외 회귀 0 확인).

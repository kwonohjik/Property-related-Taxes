# 증여세 PDF 사례 1·2 구현 계획서

> 출처: `/Users/mynote/Downloads/OneDrive_2026-05-20/증여세 계산 사례.pdf` (4쪽, 「증여세과세표준신고서 작성사례」 1·2번)
> 작성일: 2026-05-20 (v2 정정: §57 시행령 인용·누진세율표·산식 박스 추가)
> 대상 화면: 증여세 마법사(`components/calc/GiftTaxForm.tsx`)
> 엔진: `lib/tax-engine/gift-tax.ts` + `inheritance-gift-common.ts` + `inheritance-gift-tax-credit.ts`

---

## 0. §56 누진세율표 (1억/5억/10억/30억 구간) — 검증 기준

| 과세표준 | 세율 | 누진공제 |
|---|---|---|
| 1억원 이하 | 10% | 0 |
| 1억~5억 | 20% | 10,000,000 |
| 5억~10억 | 30% | 60,000,000 |
| 10억~30억 | 40% | 160,000,000 |
| 30억 초과 | 50% | 460,000,000 |

사례 1·2 모두 1,470M / 1,770M 과세표준이 10억~30억 구간 → 40% − 160M.

---

## 1. 사례 요약 + PDF 전 행 anchor 검증

### 사례 1 — 동일인(부모)에 대한 재차증여 합산신고

| 회차 | 증여일 | 증여자 | 수증자 | 재산 | 평가액 |
|---|---|---|---|---|---|
| 1차 | 2021-05-10 | 부(갑) | 장남 병(40세 성년) | 현금 | 350,000,000 |
| 2차 | 2022-07-20 | 모(을) | 장남 병 | 강남구 토지 660㎡ | 기준시가 660,000,000 |
| 3차 | 2023-04-20 | 모(을) | 장남 병 | 성북동 아파트 | 매매사례가액 510,000,000 |

- **§47② 동일인 간주**: 부·모는 직계존속의 배우자 → 동일인 합산.
- **매매사례가액(§60·§61, 상증령 §49①의2)**: 평가기준일(2023-04-20) **전후 가장 가까운 날**의 매매가액(2023-04-30 → **510M**, +10일).
  - PDF 표: 2023-03-15 → 520M(−36일) / 2023-04-01 → 490M(−19일) / **2023-04-30 → 510M(+10일 선택)** / 2023-05-30 → 505M(+40일).

#### 사례 1 PDF 표 전 회차 anchor (단위: 원)

| 행 | 1차 | 2차 | 3차 |
|---|---:|---:|---:|
| ① 증여재산가액 | 350,000,000 | 660,000,000 | 510,000,000 |
| ③ 가산액(누적) | 0 | 350,000,000 | 1,010,000,000 |
| ④ 직계존속 공제 | 50,000,000 | 50,000,000 | 50,000,000 |
| ⑤ 합산과세표준 | 300,000,000 | 960,000,000 | 1,470,000,000 |
| ⑥ 세율 | 20% | 30% | 40% |
| ⑦ 산출세액 | 50,000,000 | 228,000,000 | 428,000,000 |
| ⑧ 가산한 증여재산 산출세액 | — | 50,000,000 | 228,000,000 |
| ⑨ 한도 (⑦×가산과표/합산과표) | — | 71,250,000 | 279,510,204 |
| ⑩ 공제액 Min(⑧,⑨) | — | 50,000,000 | 228,000,000 |
| ⑪ 신고세액공제 (⑦−⑩)×3% | 1,500,000 | 5,340,000 | 6,000,000 |
| ⑫ **차가감자진납부세액 ⑦−⑩−⑪** | **48,500,000** | **172,660,000** | **194,000,000** |

#### 산식 정의
- ⑤ = ① + ③ − ④
- ⑦ = §56 누진세율(⑤)
- ⑧ = 직전 회차의 ⑦ (사전증여 회차들 중 가장 최근 회차 단일값)
- ⑨ = ⑦ × ⑤_{직전회차} / ⑤
- ⑩ = Min(⑧, ⑨)
- ⑪ = (⑦ − ⑩) × 3% (사례 1은 §57 할증 없으므로 산출세액합계=⑦)
- ⑫ = ⑦ − ⑩ − ⑪

### 사례 2 — 직계비속(손자)에 대한 증여의 할증과세

| 회차 | 증여일 | 증여자 | 수증자 | 재산 | 평가액 |
|---|---|---|---|---|---|
| 1차 | 2018-05-02 | 조모(을) | 손자 갑(성년) | 현금 | 300,000,000 |
| 2차 | 2021-05-02 | 조부(병) | 손자 갑 | 현금 | 520,000,000 |
| 3차 | 2023-05-02 | 조모(을) | 손자 갑 | 현금 | 1,000,000,000 |

- 조부·조모 §47② 동일인 합산.
- **§57① 할증율 결정**:
  - 기본 30% (수증자=증여자의 자녀가 아닌 직계비속)
  - **40% 분기**: 미성년자 + 증여재산가액 20억원 초과 시 (사례 2는 성년이고 1,000M < 20억 → 30%)
- **§57 할증과세 한도 공식** (PDF 박스, 시행령 §57 위임 — **KoreanLaw MCP로 정확한 조항 검증 후 인용**):

  ```
  당해 회차 할증세액 = ⑦ × (수증자의 부모를 제외한 직계존속에게 받은 재산가액 / 총증여재산가액) × 할증율
                    − 차감 기할증과세액
  ```

  - 차감 기할증과세액 = Min(누적 ⑫_{prior}, **한도** = ⑦ × ⑤_{직전회차} / ⑤ × 할증율)

#### 사례 2 PDF 표 전 회차 anchor (단위: 원)

| 행 | 1차 | 2차 | 3차 |
|---|---:|---:|---:|
| ① 증여재산가액 | 300,000,000 | 520,000,000 | 1,000,000,000 |
| ③ 가산액 | 0 | 300,000,000 | 820,000,000 |
| ④ 직계존속 공제 | 50,000,000 | 50,000,000 | 50,000,000 |
| ⑤ 합산과세표준 | 250,000,000 | 770,000,000 | 1,770,000,000 |
| ⑥ 세율 | 20% | 30% | 40% |
| ⑦ 산출세액 | 40,000,000 | 171,000,000 | 548,000,000 |
| ⑧ 할증과세 (⑦×30%) | 12,000,000 | 51,300,000 | 164,400,000 |
| ⑨ 누적 기할증과세액 Σ⑫_prior | 0 | 12,000,000 | 51,300,000 |
| ⑩ 공제한도 (⑦×가산과표/합산과표×30%) | — | 16,655,844 | 71,518,644 |
| ⑪ 차감 기할증 Min(⑨,⑩) | 0 | 12,000,000 | 51,300,000 |
| ⑫ 추가 할증세액 (⑧−⑪) | 12,000,000 | 39,300,000 | 113,100,000 |
| ⑬ 산출세액합계 (⑦+⑫) | 52,000,000 | 210,300,000 | 661,100,000 |
| ⑭ 가산 증여재산 산출세액 | — | 40,000,000 | 171,000,000 |
| ⑮ 한도 (⑦×가산과표/합산과표) | — | 55,519,481 | 238,395,480 |
| ⑯ 공제액 Min(⑭,⑮) | 0 | 40,000,000 | 171,000,000 |
| ⑰ 신고세액공제 (⑬−⑯)×3% | 1,560,000 | 5,109,000 | 14,703,000 |
| ⑱ **차가감자진납부세액 ⑬−⑯−⑰** | **50,440,000** | **165,191,000** | **475,397,000** |

#### 산식 정의
- ⑤ = ① + ③ − ④
- ⑦ = §56 누진세율(⑤)
- **1차 ⑩·⑮ "—" 표기 의미**: 사전증여 없음 → ⑨=0 → ⑩ 산식 무의미(차감 대상 없음). ⑮도 마찬가지로 ⑭=0 → 한도 산정 무의미.
- ⑧ = ⑦ × (부모 제외 직계존속 재산가액 / ① + ③) × 할증율
  - 사례 2는 모두 조부모 → 비율=1 → ⑧ = ⑦×30%. 부모+조부모 혼합 시 비율<1.
- ⑨ = Σᵢ ⑫ᵢ (사전증여 회차들의 ⑫ 누계)
- ⑩ = ⑦ × ⑤_{직전회차} / ⑤ × 할증율
- ⑪ = Min(⑨, ⑩)
- ⑫ = ⑧ − ⑪
- ⑬ = ⑦ + ⑫
- ⑭ = 직전 회차의 ⑦ (사례 1의 ⑧과 동일 정의)
- ⑮ = ⑦ × ⑤_{직전회차} / ⑤  ※ 할증율 곱셈 없음 (§58 한도식)
- ⑯ = Min(⑭, ⑮)
- ⑰ = (⑬ − ⑯ − 외국납부공제 등) × 3%
- ⑱ = ⑬ − ⑯ − ⑰ − 기타공제

---

## 2. 현행 엔진 상태와 갭

### 2.1 STEP 3 — 동일인 10년 합산 (§47②)
- ✅ `aggregatePriorGiftsForGift()`로 10년 이내 priorGifts 합산.
- ⚠️ **donor 식별자 부재**: 현재 `PriorGift`는 `doneeRelation` 만 있고 **증여자(donor) 식별자**가 없음. §47② 동일인 그룹화 + §57 한도식의 부모-제외 분자 산정에 donor 필수.
  - **갭 G-1**: `PriorGift.donor: GiftDonorRelation` 추가. 엔진은 input.donor와 priorGifts[i].donor의 동일인 그룹 일치 여부로 합산 대상 필터.
    - **동일인 그룹화 규칙**:
      - 그룹 A (직계존속·부모): `father` ↔ `mother`
      - 그룹 B (직계존속·조부모): `paternal_grandfather` ↔ `paternal_grandmother` ↔ `maternal_grandfather` ↔ `maternal_grandmother`
        - ※ PDF 사례 2는 `paternal_grandparent`/`maternal_grandparent` 구분 없이 "조부모" 통합. 정밀하게는 父系/母系 분리지만 PDF anchor는 통합 처리 → 옵션 A: 단일 `grandparent` enum.
      - 그룹 C: `spouse` (배우자 단일)
      - 그룹 D: `lineal_descendant`, `sibling`, `other_relative`, `other`
    - **부+조부 등 그룹 간 별개**: 1차 父 / 2차 祖父 → 동일인 아님 → priorGifts 합산 대상 아님.

### 2.2 STEP 7 — 세대생략 할증 (§57)
- ✅ `calcGenerationSkipSurcharge()`가 30%/40% 단순 곱셈.
- ⚠️ **할증과세 한도 공식 미구현**:
  - **갭 G-2a**: `PriorGift`에 `additionalGenerationSkipSurcharge?: number` (그 회차의 ⑫) 추가. 엔진은 `priorGifts.sum(p.additionalGenerationSkipSurcharge)` = ⑨ 누적.
  - **갭 G-2b**: `calcGenerationSkipSurcharge` 시그니처에 `priorAddedTaxBase`, `aggregatedTaxBase`, `priorAdditionalSurchargeCumulative`, `nonParentLinealAmount` 추가 (F-2 변수명 통일).
    - 산식:
      ```ts
      const ratio = (nonParentLinealAmount + currentGiftValue) / (currentGiftValue + priorGiftTotal);
      const surchargeRate = isMinor && currentGiftValue > 2_000_000_000 ? 0.40 : 0.30;
      const grossSurcharge = applyRate(computedTax * ratio, surchargeRate);
      const surchargeCreditLimit = applyRate(
        computedTax * (priorAddedTaxBase / aggregatedTaxBase),
        surchargeRate,
      );
      const priorSurchargeCredit = Math.min(priorAdditionalSurchargeCumulative, surchargeCreditLimit);
      const additionalSurcharge = Math.max(0, grossSurcharge - priorSurchargeCredit);
      ```
  - **갭 G-2c**: 결과 타입에 `additionalGenerationSkipSurcharge` + `generationSkipSurchargeDetail`(⑧⑨⑩⑪⑫ 전 행) 추가.

### 2.3 STEP 8 — §58 기납부세액공제
- ✅ `priorGiftTaxPaid`를 산출세액 한도로 차감.
- ⚠️ **§58 안분 한도 미구현**: 현재 `Min(priorGiftTaxPaid, totalComputedTax)`만.
  - **갭 G-3a**: PDF의 ⑧/⑭은 **가장 최근 합산 회차의 ⑦ 단일값**. `PriorGift`에 `computedTax?: number`, `taxBase?: number`(이미 `giftTaxBase` 존재) 추가. 엔진은 합산 대상 priorGifts를 giftDate 내림차순 정렬 후 첫번째의 `computedTax`를 사용.
  - **갭 G-3b**: `calcGiftTaxCredits` 시그니처 추가 매개변수 — `priorGiftComputedTax`(=⑭), `priorGiftAddedTaxBase`(=직전 회차 ⑤), `aggregatedTaxBase`(=금번 ⑤).
    - 산식:
      ```ts
      const limit58 = applyRate(currentComputedTax, priorGiftAddedTaxBase / aggregatedTaxBase);
      const priorPaidCredit = Math.min(priorGiftComputedTax, limit58);
      ```
  - **갭 G-3c — §69 신고세액공제 기준 재배치**:
    - 산식: `신고세액공제 = Math.max(0, (산출세액합계 − §58 공제 − 외국납부세액공제 − 영농자녀세액공제 등)) × 3%`
    - **음수 방지**: 외국납부공제 등 합산이 산출세액합계 초과 시 0으로 clamp.
    - 산출세액합계 = `computedTax + additionalGenerationSkipSurcharge`
    - 사례 1은 추가할증=0 → 산출세액합계=⑦. 사례 2는 산출세액합계=⑬=⑦+⑫.
    - **현행 STEP 7 → STEP 8 순서 유지**: 할증세액 산정 후 세액공제 차감.

### 2.4 평가 — 매매사례가액 (§60·§61)
- **갭 G-4**: `lib/tax-engine/property-valuation.ts`의 **매매사례가액 자동 비교** 기능 존재 여부 확인 필요. 사례 1처럼 N건 입력 시 평가기준일 전후 가장 가까운 날 자동 선택.
  - **확인 작업 (Plan 직후)**: `grep -n "매매사례\|comparableSales\|nearestSale" lib/tax-engine/property-valuation.ts`로 기존 구현 검증.
  - 미구현 시 별도 PR로 분리. 사례 1 anchor용으로는 **수동 입력 510M**으로 단순화 가능 (PDF 자체도 사용자 선택 후 시가로 본다고 명시).

---

## 3. 구현 범위 (Phase 분할)

### Phase A — 엔진 보강 (필수)
1. **타입 확장 + 그룹 매핑 (I-2·I-3 정합화)** (`types/inheritance-gift.types.ts`)
   - `GiftDonorRelation` 신규 enum (8종) — donor 그룹 7분류(A~G) (F-4 정정: 8 enum → 7 그룹):
     ```ts
     export type GiftDonorRelation =
       | "father" | "mother"               // 그룹 A (직계존속·부모)
       | "grandparent"                     // 그룹 B (직계존속·조부모, 父系/母系 통합)
       | "spouse"                          // 그룹 C
       | "lineal_descendant"               // 그룹 D (직계비속)
       | "sibling"                         // 그룹 E (형제자매)
       | "other_relative"                  // 그룹 F (기타친족)
       | "other";                          // 그룹 G (기타·타인)

     export type DonorGroup = "A" | "B" | "C" | "D" | "E" | "F" | "G";
     ```
   - **`GiftTaxInput.isGenerationSkip` 필드 폐지** — donor === "grandparent" 에서 자동 도출. 외부 호출자 일괄 갱신.
   - **donor enum ↔ 한글 라벨 매핑 표** (UI 셀렉트 옵션):

     | enum | 한글 라벨 | 그룹 | §57 적용 |
     |---|---|---|---|
     | `father` | 부 | A | ✗ |
     | `mother` | 모 | A | ✗ |
     | `grandparent` | 조부모 | B | **✓** |
     | `spouse` | 배우자 | C | ✗ |
     | `lineal_descendant` | 직계비속 | D | ✗ |
     | `sibling` | 형제자매 | E | ✗ |
     | `other_relative` | 기타친족 | F | ✗ |
     | `other` | 기타 | G | ✗ |

   - `GiftTaxInput.donor: GiftDonorRelation` 추가 (**필수 필드** — fallback 없음).
   - `PriorGift` 신규 필드:
     - `donor?: GiftDonorRelation`
     - `computedTax?: number` (그 회차의 ⑦)
     - `additionalGenerationSkipSurcharge?: number` (그 회차의 ⑫)
     - `wasGenerationSkip?: boolean`

2. **동일인 합산 그룹화 + §47 누계 헬퍼 신규** (`inheritance-gift-common.ts` 또는 신규 `gift-prior-aggregation.ts`)
   - `getDonorGroup(donor: GiftDonorRelation): "A" | "B" | "C" | "D" | "E" | "F" | "G"`
   - `isSameDonorGroup(a: GiftDonorRelation, b: GiftDonorRelation): boolean` (= getDonorGroup 일치)
   - `aggregatePriorGiftsForGift` 시그니처에 `currentDonor: GiftDonorRelation` 추가.
   - **그룹 간 별개 신고 원칙**:
     - 입력 priorGifts 중 `isSameDonorGroup(p.donor, currentDonor) === false` 인 항목은 자동 필터링.
     - UI는 사용자가 입력한 모든 priorGifts를 표시하되, 엔진은 동일인 그룹만 §47 합산.
     - 다른 그룹 priorGifts는 별개 신고로 안내 (warnings 메시지).
   - 출력 확장: `totalAmount`, `totalTaxPaid`, `totalComputedTax`(가장 최근 합산 회차 ⑦ 단일값), `priorAddedTaxBase`(가장 최근 합산 회차 ⑤), `totalAdditionalSurcharge`(Σ⑫_prior), `nonParentLinealAmount`(부모 제외 직계존속 ① 합 = 그룹 B 합산 시 priorTotal 그대로) (F-2 변수명 통일).

3. **`calcGenerationSkipSurcharge` 보강** — 산식 위 G-2b.

4. **`calcGiftTaxCredits` 보강** — §58 한도식 G-3b + §69 산식 G-3c.

5. **`calcGiftTax` 메인 파이프라인 재배치** (`gift-tax.ts`)
   - STEP 7(할증) → STEP 8(세액공제) 사이에 prior aggregation 결과 전달.
   - 결과 타입 `GiftTaxResult`에 신규 detail (I-4 보강):
     - `donorGroup: DonorGroup` (분기 추적용)
     - `additionalGenerationSkipSurcharge: number`
     - `generationSkipSurchargeDetail: GenerationSkipSurchargeDetail | null` (⑧⑨⑩⑪⑫⑬)
     - `priorGiftCreditDetail: PriorGiftCreditDetail | null` (⑭⑮⑯)
     - `filingFormRows: FilingFormRow[]` (12행 또는 18행 표시용 사전 빌드 — `buildFilingFormRows()` 헬퍼)
     - `warnings: string[]` (다른 그룹 priorGifts 무시 안내 등)

6. **legal-codes 보강 (I-5 정합화)**
   - `legal-codes/inheritance-gift.ts`에 추가 (총 5종):
     - `GIFT.GENERATION_SKIP_LIMIT_FORMULA = "상증법 §57·시행령 §28의2 (검증)"`
     - `GIFT.PRIOR_TAX_CREDIT_LIMIT_FORMULA = "상증법 §58 ①"`
     - `GIFT.AGGREGATION_SAME_PERSON = "상증법 §47 ②"`
     - `GIFT.SURCHARGE_MINOR_OVER_2B = "상증법 §57 ① 단서"`
     - `GIFT.MARKET_PRICE_COMPARABLE = "상증법 §60·§61, 상증령 §49①의2"`
   - **KoreanLaw MCP `get_law_text` 검증**:
     - `상속세 및 증여세법` §57·§58·§47 본문
     - `상속세 및 증여세법 시행령` §28의2·§29 등 위임 조항
     - 인용 정확성 확인 후 상수값 확정.

### Phase B — UI 보강
1. **`GiftTaxForm`**
   - `donor` 셀렉트 (7개 옵션, 라벨: "부·모·조부모·배우자·직계비속·형제자매·기타친족·기타").
   - 미성년자 토글(현존) 옆에 "20억 초과 시 40% 할증" 안내 hint.

2. **`PriorGiftInput`**
   - 행마다 입력 추가:
     - 증여자 (셀렉트, 7개 옵션)
     - 증여 당시 합산과세표준 (⑤)
     - 증여 당시 산출세액 (⑦)
     - 세대생략 할증 토글
     - 그 회차의 추가 할증세액 ⑫ (할증 토글 ON 시만)
   - hint: "PDF 사례 표 ⑤·⑦·⑫" 직접 참조 가능 안내.

3. **결과 카드 — 신고서 양식 표 컴포넌트 신규**
   - `GiftTaxFilingFormTable.tsx` 신규 (예상 ~250줄).
   - **동적 행 수** (F-3 정정 — 디자인 §5.2와 정합): `result.generationSkipSurchargeDetail !== null` → 18행, else 12행.
     - `generationSkipSurchargeDetail`은 `donorGroup === "B"` 일 때만 생성 (디자인 §4.2 참조).
     - 단순 boolean이 아니라 detail 객체 null 검사로 분기.
   - 행 매핑:
     - 사례 1 형식(12행): ①·②(채무)·③·④·⑤·⑥·⑦·⑧·⑨·⑩·⑪·⑫
     - 사례 2 형식(18행): ①·②·③·④·⑤·⑥·⑦·⑧·⑨·⑩·⑪·⑫·⑬·⑭·⑮·⑯·⑰·⑱
   - 단위: 모두 **원** (memory `feedback_no_won_suffix` — 숫자 끝 "원" 생략).

4. **사이드바 합계**: `result.finalTax`(=⑫ 또는 ⑱) 표시.

### Phase C — 테스트
- `__tests__/tax-engine/gift/case-1-redonation-spouse.test.ts`
  - **1차 단독 신고 anchor 6개**: ⑤·⑦·⑪·⑫
  - **2차 단독 신고 anchor 6개**: ⑤·⑦·⑧·⑨·⑩·⑪·⑫
  - **3차 합산 anchor 7개**: ⑤=1,470M / ⑦=428M / ⑧=228M / ⑨=279,510,204 / ⑩=228M / ⑪=6M / ⑫=**194,000,000**
  - 합계 **20 anchor** (회차별 회귀 보호).

- `__tests__/tax-engine/gift/case-2-generation-skip.test.ts`
  - **1차 anchor 6개**: ⑤=250M / ⑦=40M / ⑧=12M / ⑫=12M / ⑬=52M / ⑱=50,440,000
  - **2차 anchor 14개** (I-1 정정 — ⑥ 포함): ⑤·⑥·⑦·⑧·⑨·⑩=16,655,844·⑪·⑫=39.3M·⑬·⑭·⑮=55,519,481·⑯·⑰·⑱=165,191,000
  - **3차 anchor 18개 (PDF 전 행)**: ⑤·⑥·⑦=548M·⑧·⑨·⑩=71,518,644·⑪·⑫·⑬=661.1M·⑭·⑮=238,395,480·⑯·⑰=14,703,000·⑱=**475,397,000**
  - 합계 **38 anchor**.

- `__tests__/tax-engine/gift/donor-group-isolation.test.ts` (회귀 보호, 4 anchor) — 디자인 §8.3 참조.

- **총 anchor 합계**: 사례 1 (20) + 사례 2 (38) + 그룹 분리 (4) = **62 anchor**

- **Pre-Do anchor 우선**: Phase A 착수 전 `case-2-generation-skip.test.ts` 3차 18 anchor를 작성하여 vitest 실행 → 실패 메시지 캡처 → Design 환류 (memory `feedback_pre_anchor_verification`).
  - **실패 진단 예상**:
    - `result.finalTax expected 475,397,000 received <훨씬 큰 값>` — §58 한도식·§57 할증 한도 미적용으로 priorPaidCredit=0
    - `result.computedTax expected 548,000,000 received 548,000,000` (산출세액 자체는 OK)
    - `result.additionalGenerationSkipSurcharge field undefined` — 결과 타입 미확장
    - `result.generationSkipSurcharge expected 113,100,000 received 164,400,000` — 기할증 차감 미구현
    - 이 패턴 → G-2/G-3 매칭 확인 후 Design 진행.

- **회귀 보호**: 양도세·상속세 전체 통과 (≥3,400건) + gift 기존 anchor 0 회귀.

---

## 4. 14개 동기화 지점 매트릭스

| # | 위치 | 신규 필드 |
|---|---|---|
| ① | FormData (calc-wizard) | `priorGifts[].donor`, `.computedTax`, `.additionalGenerationSkipSurcharge`, `.wasGenerationSkip` + 폼-전역 `donor` |
| ② | initial 팩토리 | 기본값 undefined / wasGenerationSkip=false |
| ③ | normalize | 빈문자 → undefined, 숫자 변환 |
| ④ | API 변환 (`lib/calc/gift-tax-api.ts`) | body에 신규 필드 spread + 동일인 그룹 자동 매핑 fallback **금지** (memory `feedback_no_silent_apportion_fallback`) |
| ⑤ | UI 위젯 | `PriorGiftInput` 행 + donor 셀렉트 |
| ⑥ | 사이드바 합계 | `finalTax` 표시 |
| ⑦ | 결과 카드 | `GiftTaxFilingFormTable` |
| ⑧ | validation (`lib/calc/gift-tax-validate.ts`) | donor 필수 + priorGifts 동일인 그룹 일치 시 `computedTax`·`giftTaxBase` 필수 검증 (UI 통과↔validate 차단 모순 금지) |
| ⑨ | Zod enum 메인 (route) | `donor` GiftDonorRelation enum |
| ⑩ | Zod enum 컴패니언 | (해당 없음) |
| ⑪ | 자산-수준 acquisitionDate fallback | (해당 없음) |
| ⑫ | **Zod 입력 객체 정의** | `PriorGiftSchema`에 신규 필드 + `GiftTaxRequestSchema`에 `donor` |
| ⑬ | **callGiftTaxAPI body spread** | `priorGifts: priorGifts.map(p => ({ ..., donor, computedTax, additionalGenerationSkipSurcharge, wasGenerationSkip }))` + `donor: input.donor` |
| ⑭ | **Route handler 엔진 input 매핑** | `priorGiftsWithin10Years` 변환 시 신규 필드 보존 |

⑫⑬⑭는 TypeScript silent stripping — grep 자가점검 강제.

---

## 5. 법령 인용 (KoreanLaw MCP 검증 대상)

| 조문 | 본문 요지 | 사례 | 검증 우선순위 |
|---|---|---|---|
| 상증법 §47② | 직계존속의 배우자는 동일인 | 1·2 | High |
| 상증법 §53① | 직계존속→직계비속 5,000만(성년) | 1·2 | High |
| 상증법 §53①단서 | 미성년 직계비속 2,000만 | (참고) | Med |
| 상증법 §56 (§26 준용) | 누진세율 5단계 | 1·2 | High |
| 상증법 §57① | 세대생략 30%(원칙)·40%(미성년+20억 초과) | 2 | High |
| 상증령 §28의2 (추정) | §57 한도 안분 공식 | 2 | **검증 필수** |
| 상증법 §58① | §58 안분 한도 공식 | 1·2 | High |
| 상증법 §69 | 신고세액공제 3% | 1·2 | High |
| 상증법 §60·§61, 상증령 §49①의2 | 매매사례가액 평가기준일 전후 가까운 날 | 1 | Med |

**KoreanLaw MCP `get_law_text` 호출 항목**:
- `상속세 및 증여세법` §47·§53·§56·§57·§58·§60·§61·§69
- `상속세 및 증여세법 시행령` §28의2·§29·§49 (§57·§58·§60 위임)

**추정 인용 금지** (memory `feedback_korean_law_82_vs_81_2_drift`): 위임 체인을 본칙까지 추적. 본 계획서의 "§28의2" 표기는 임시 추정 — Phase A 착수 전 KoreanLaw MCP로 정정.

---

## 6. 위험 요소 / 의사결정

| ID | 항목 | 결정 |
|---|---|---|
| R-1 | `PriorGift.computedTax` 미입력 시 fallback | **fallback 없음 + validation 차단** (memory `feedback_no_silent_apportion_fallback`). UI에서 동일인 그룹 일치 행에 한해 필수 입력 강제. |
| R-2 | §53 공제 10년 누계 1회 적용 | 현행 엔진 `aggregatedGiftValue` 전체 일괄 공제 — PDF 산식과 정합 (사례 1·2 모두 ⑤=①+③−④). |
| R-3 | §58 한도식 분자 = ⑤_{직전회차} (가장 최근 합산 회차의 합산과세표준) | 사례 1 3차 ⑨ 분자=960M=2차⑤ / 사례 2 3차 ⑮ 분자=770M=2차⑤. 엔진은 priorGifts 합산 대상 중 **가장 최근 회차**의 `giftTaxBase` 단일값 사용. |
| R-4 | §58·§57 한도식의 산출세액 기준 | 모두 **당해 회차 ⑦(할증 전)** 사용. §57 한도식은 추가로 할증율(0.30 또는 0.40) 곱셈. |
| R-5 | 父+母+祖父 혼합 시 합산 그룹 | 父+母 = 동일인 그룹 (그룹 A) / 祖父 별개 그룹 (그룹 B). 그룹 간 합산 안 함 — 각 그룹별 독립 §47 누계. UI는 그룹 매핑을 donor 선택 시 자동 그룹화 표시. |
| R-6 | 父系/母系 조부모 구분 | PDF는 통합 처리 → 옵션 A 채택 (단일 `grandparent` enum). 정밀 분리는 후속 PR. |
| R-7 | §57 ⑧의 비율 분자 (부모 제외 직계존속 재산가액) | **그룹화 단순화**: §47 합산은 동일인 그룹만 처리하므로 단일 그룹 합산 시 비율은 항상 0 또는 1. **donor 그룹=B(조부모) → 비율=1** → ⑧=⑦×할증율. **그룹 A·C·D·E·F·G → §57 미적용** → ⑧=0. 사례 2는 그룹 B → 비율=1. 부모+조부모 혼합은 별개 신고로 분리되므로 단일 엔진 호출 내 혼합 비율 계산 불필요. |
| R-8 | property-valuation 매매사례가액 자동선택 미구현 시 | Phase A 진입 전 grep 확인. 미구현 시 사례 1 anchor는 단일값 510M 입력으로 우회. 자동 선택은 별도 PR. |

---

## 7. 작업 순서

1. **Plan/Design 단계 (현 단계)**
   - 계획서 검토·승인 → 디자인 문서 작성 (engine + UI).
   - `inheritance-gift-tax-senior` + `inheritance-gift-deduction-senior` + `inheritance-gift-tax-credit-senior` + `inheritance-gift-tax-ui-senior` 4개 시니어 병렬 호출.
   - **외부 호출자 통합 grep (I-6·F-6)**:
     ```bash
     grep -rn "calcGiftTax\|GiftTaxInput\|isGenerationSkip\|priorGiftTaxPaid\|PriorGift\b" \
       lib/ app/ components/ __tests__/
     ```
     - 발견된 모든 호출자(테스트·burdened-gift Phase 3 연동·API route)를 본 PR 내 일괄 갱신.
     - **PriorGift.wasGenerationSkip 보존 정책 (F-9)**: donor=조부모이나 그 회차 §57 미적용 예외 케이스(법령 해석례 등)에 대비하여 PriorGift 필드는 유지. 엔진은 donor 기반 자동 도출 + wasGenerationSkip이 명시 입력되면 그 값 우선 (validation 보강).

2. **Pre-Do anchor (1시간)**
   - `case-2-generation-skip.test.ts` 3차 18 anchor 작성.
   - vitest 실행 → 실패 메시지 캡처.
   - 실패 원인이 G-1~G-3 매칭되는지 검증, 매칭 안 되면 Design 환류.

3. **Phase A 엔진 (시퀀셜)**
   - 엔진 시니어가 ①②③④⑧⑨⑫⑭ + 신규 헬퍼 분리 (`gift-prior-aggregation.ts` 신규).
   - 800줄 정책 사전 점검:
     - `gift-tax.ts` 233→예상 300줄 (safe)
     - `inheritance-gift-tax-credit.ts` 386→예상 500줄 (safe)
     - `inheritance-gift-common.ts` 278→예상 360줄 (safe)
   - KoreanLaw MCP 검증 → `legal-codes/inheritance-gift.ts` 상수 확정.

4. **Phase B UI (엔진 결과 받아 이어서)**
   - UI 시니어가 ⑤⑥⑦ 담당 + `GiftTaxFilingFormTable` 신규 (~250줄).

5. **Phase C 검증**
   - `tax-qa-lead` (gift-tax-qa) → 62 anchor 회귀 0건.
   - `ui-engine-sync-checker` → 14지점 read-only.
   - 브라우저 수동: 사례 1·2 입력 → 신고서 양식 표 PDF 행별 일치.

---

## 8. 완료 정의 (Definition of Done)

- [ ] anchor `case-1` 20개 + `case-2` 38개 + 회귀 4개 = **62 anchor toBe 일치**
- [ ] 회귀 0건 (`__tests__/tax-engine/gift/` 기존 + 양도세·상속세 전체 ≥3,400건)
- [ ] 14지점 grep 자가점검 0 누락
- [ ] `npx tsc --noEmit` 0
- [ ] `npx vitest run __tests__/tax-engine/gift/` 통과
- [ ] 브라우저 수동 입력 → 신고서 양식 표 PDF 사례 1 12행·사례 2 18행 일치
- [ ] KoreanLaw MCP로 §57·§58·§47 본칙·시행령 검증 + `legal-codes/inheritance-gift.ts` 상수 갱신
- [ ] memory `project_gift_tax_case_1_2_pdf_replica.md` 작성
- [ ] 결과 카드 단위 "원" 표기 미사용 (memory `feedback_no_won_suffix`)
- [ ] donor·priorGifts 입력 fallback 0건 (memory `feedback_no_silent_apportion_fallback`)

# 상속세 §74 지정문화유산 등 징수유예세액 — 구현 계획서

> PDCA Plan 단계 산출물. 엔진 시니어(`inheritance-gift-tax-senior`) + UI 시니어(`inheritance-gift-tax-ui-senior`) 병렬 설계 통합.
> 모든 법령·코드 인용은 KoreanLaw MCP / 실제 file:line으로 **검증 완료**(✅). 미해소 항목은 **확인 필요**(⚠️)로 명시.
> 작성일: 2026-06-05

---

## 0. 한 줄 요약

상속재산에 지정문화유산·박물관자료·천연기념물 등이 포함되면 그 재산가액에 상응하는 **상속세액의 징수를 유예**하는 상증법 §74를 구현한다. 현재는 별지9호 ㉖ 칸 라벨만 존재하고 **항상 0으로 하드코딩**되어 있어, 산정 로직이 전무하다.

### 범위 확정 (2026-06-05 사용자 결정)

- **핵심만 구현**: §74 징수유예세액 산정(§76①) + 자산 카드 입력 토글(4개호) + 결과 카드 + 별지9호 ㉖ 연결. §74② 즉시징수 시뮬레이터·§74④⑤ 담보 입력 필드는 **범위 외**(안내 배너만 — Q-4·Q-5 확정).
- **§12 경계 별도 PDCA**: 기존 `inh_cultural_property`(§12 문화재 비과세) 규칙의 현행법 정합성 정정은 **별도 작업으로 분리**. 본 PR은 §74 신설 + 이중혜택 방지 경고만 포함(Q-2 확정).

---

## 1. 배경 — 현행 미구현 현황 (✅ 실측)

| 구분 | 위치 | 상태 |
|---|---|---|
| 양식 라벨 | `components/calc/inheritance/filing-form-9/filing-form-9-constants.ts:54` | `"㉖": "문화재등 징수유예세액"` — 라벨만 |
| 합계 공식 | 동 `:69` | `㊳ 납부할세액 = ㉔ + ㉕ − ㉖ − ㉗ + ㉟ + ㊱ + ㊲` (㉖ 차감 항 존재) |
| **어댑터 값** | `lib/calc/filing-form-9-data.ts:120` | `"㉖": 0` — **하드코딩** |
| **어댑터 행** | 동 `:144` | `amtRow("㉖", 0, "left")` — **하드코딩** |
| 엔진 | `lib/tax-engine/inheritance-tax.ts` | 징수유예·문화재 로직 grep **0건** |
| 입력 타입 | `InheritanceTaxInput`(types `:1006~1046`) / `EstateItem`(`:81~`) | 식별 필드 **없음** |
| 결과 타입 | `InheritanceTaxResult`(types `:1049~1142`) | 징수유예 필드 **없음** |

> 인접 혼동 주의: `museumDeferredTax`(증여세 §75 준용, gift-tax.ts:304 `0` 하드코딩) · `cashDeferred`(§70② 현금분납) · `etDeferralRequested`(주식양도세 납부유예) 는 모두 별개 제도.

---

## 2. 법령 근거 (✅ KoreanLaw MCP 검증 — mst 276123 시행 2026-01-02 / 시행령 mst 283637)

### 2-1. 상증법 §74① — 징수유예 대상 4개호

| 호 | 대상 | 비고 |
|---|---|---|
| 1호 | 문화유산자료(문화유산보존법 §2③3호) + 국가등록문화유산(근현대문화유산법 §6①) + 보호구역 토지 | "문화유산자료등" |
| 2호 | 등록 박물관자료/미술관자료로서 박물관·미술관에 **전시·보존 중**인 재산 | "박물관자료등". 사립은 **공익법인등만** |
| 3호 | 국가지정문화유산 + 시·도지정문화유산 + 보호구역 토지 | "국가지정문화유산등" — §74⑤ 담보 면제 가능 |
| 4호 | 천연기념물등(자연유산법) + 보호구역 토지 | "천연기념물등" — §74⑤ 담보 면제 가능 |

### 2-2. 상증령 §76① — 징수유예세액 산식 (핵심)

> **징수유예 상속세액 = 상속세산출세액 × [ §74①각호 해당 재산가액 ÷ 상속재산(법 §13에 따라 가산한 증여재산 포함) ]**

**산정 방식 확정 — "평균 비례 방식"(✅ 조세심판례·예규 검증):**
- 조세심판원 **[940708] 국심1996서3457**(1997.12.31, 기각): 징수유예세액 = 산출세액 × (징수유예 대상 재산가액 ÷ **총 상속재산가액**). 동지 재정경제원 예규 **재산46014-339**(96.10.23)·국세청 예규 **재삼46014-1158**(96.5.9)
- **배척된 방식(차액 방식)**: 청구인이 주장한 "(문화재 포함 산출세액) − (문화재 제외 산출세액)" = 누진세율 최상단 차액 방식은 **명시적으로 배척**됨. 누진 하에서 차액 방식이 더 크나(사례 542,911,544 vs 채택 404,106,180), 법정 방식은 평균 비례. → **엔진은 반드시 §76① 비례 곱셈으로 구현(차액 방식 금지)**

### 2-3. 사후관리·담보 (상증법 §74②~⑧)

- §74②: 상속인·수유자가 **유상양도**하거나 (박물관자료등) **인출** 시 → 즉시 징수유예세액 징수
- §74③: 징수유예 기간 중 상속인 사망으로 재상속 → 부과결정 철회, 재부과 안 함
- §74④: 유예세액 상당 **담보 제공**(§71 준용). §74⑤: 단 **3·4호는 담보 면제 가능**
- §74⑥⑦: 담보 미제공자는 매년 말 보유현황 제출 + 양도 7일 전 신고
- §74⑧: 박물관/미술관 자료를 신고기한까지 전시·보존하는 경우 포함

### 2-4. §12 비과세 경계 — 중요 쟁점 (✅ 검증)

현행 상증법 §12 비과세 항목에 **문화재 없음**(과거 2호 삭제. 현행: 1호 국가유증/3호 제사용재산/4호 정당/5호 사내근로복지기금/6호 이재구호금품/7호 신고기한내 국가증여). 그러나 코드 `lib/tax-engine/exemption-evaluator.ts:60`의 `inh_cultural_property` 규칙이 "국가·시도 지정 문화재 **비과세**"를 §12로 처리 중. → **기존 §12 문화재 비과세 규칙의 현행법 정합성은 별도 검토 쟁점**(§7-2 참조). 본 PR은 §74 징수유예 신설에 집중하되 이중혜택 방지를 설계 단계에서 명시.

---

## 3. 현행 코드 사실 (✅ 실측 file:line)

### 3-1. 엔진 STEP 흐름 (`inheritance-tax.ts`, 820줄)

```
STEP 8   (:532) computedTax = calcInheritanceGiftTax(taxBase, brackets)   ← §26 산출세액
STEP 8.5+9 (:550~) generationSkipSurcharge  (§27 세대생략 할증)
STEP 10  (:571~) corporateExemption          (§3의2② 영리법인 면제)
STEP 11  (:656~) totalTaxCredit              (§28~30·§69 세액공제)
STEP 12  (:676) finalTax = max(0, computedTax + genSkip − corporateExemption − totalTaxCredit)
STEP 13/13.5    상속인별 배부 + §69 reconcile
```

### 3-2. 타입

- `AssetCategory`(types `:69~78`, **8종**): `real_estate_land` · `real_estate_building` · `real_estate_apartment` · `listed_stock` · `unlisted_stock` · `cash` · `financial` · `deposit` · `other`
- `EstateItem`(`:81~`): opt-in 패턴 선례 — `isCohabitantHouse?`(`:223`) · `isFamilyBusinessAsset?`(`:217`) · `farmingCategory?`(`:280`, 시행령 enum)
- `InheritanceTaxResult`(`:1049~`): `grossEstateValue` · `priorGiftAggregated` · `taxableEstateValue` · `computedTax` · `generationSkipSurcharge` · `finalTax`

### 3-3. API/별지9호 흐름

- `lib/calc/inheritance-api.ts:71`: `estateItems: input.estateItems` — 통째 전달
- `app/api/calc/inheritance/route.ts:72`: `estateItems: parsedData.estateItems as ...` — 통째 pass-through(⑭ 명시 매핑 패턴, `:66~92`)
- Zod: `lib/validators/property-valuation-input.ts:283` `estateItemSchema = z.discriminatedUnion("category", [...])` — **9개 variant**(land/apartment/building/listed/unlisted/cash/financial/deposit/other). 신규 필드는 **공통 base 스키마**에 추가해야 strip 방지(⑫)
- 별지9호 `filing-form-9-data.ts`: ㉖=0(`:120`,`:144`), `b43 = result.finalTax`(`:116`)

---

## 4. 설계 방안 — 엔진 (담당: inheritance-gift-tax-senior)

### 4-1. 타입 확장

```typescript
// EstateItem 추가 (farmingCategory enum 패턴 준수 — 4개호 구분은 담보 면제 echo에 필요)
culturalHeritageType?:
  | "heritage_data"      // 1호
  | "museum"             // 2호
  | "designated"         // 3호 ← §74⑤ 담보 면제
  | "natural_monument";  // 4호 ← §74⑤ 담보 면제

// InheritanceTaxResult 추가 (echo — finalTax 불변, 별지9호 ㉖·㊳ 차감 소스)
culturalHeritageDeferredTax?: number;                    // 별지9호 ㉖
culturalHeritageDeferralDetail?: CulturalHeritageDeferralDetail;
```

`CulturalHeritageDeferralDetail`: 분자(`qualifyingAssetValue`)·분모(`totalEstateWithPriorGifts`)·비율·산출세액·자산별 내역(호 구분·담보 면제 여부)·warnings.

### 4-2. 산식 (§76① — 평균 비례 방식)

- **방식 = 비례 곱셈**(차액 방식 금지 — §2-2 재결례 [940708]). `computedTax × 분자 ÷ 분모` 단일 산식
- **분모 = `grossEstateValue + priorGiftAggregated`** (= 총 상속재산 평가액 + §13 사전증여). `grossEstateValue`(inheritance-tax.ts:116)는 **비과세·§14 채무 차감 전** 평가액 합계 — 재결례 "총 상속재산가액"과 정합. `taxableEstateValue`(:249 = 추정·비과세·채무·사전증여 반영 과세가액)는 분모와 불일치 → **사용 금지**
- **§15 추정상속재산(`presumedTotal`, :207) 미포함**: 시행령 §76① 괄호가 §13 가산증여만 명시(✅ Q-1 확정). 분모에서 제외
- **곱셈 대상 = `computedTax`**(§26, §27 할증 전) ← 시행령 "상속세산출세액" + 재결례 "산출세액"과 일치
- **분자 = `Σ valuatedAmountById.get(item.id)`** (culturalHeritageType 설정 자산. Map 키 = `v.estateItemId`(=EstateItem.id), inheritance-tax.ts:545). 복수 문화유산 자산은 분자에서 합산
- **산식 = `calculateProration(computedTax, 분자, 분모)`**(tax-utils.ts:106) — div0 방어 + 비율 1.0 상한(C-02 100% 정확) + floor + BigInt overflow(분자×산출세액 > 2^53) 내장. 입력 3값 모두 원단위 정수 → Number/BigInt 경로 일치(memory `feedback_safemul_decimal_apportion_precision`). 별도 분모0 가드·곱셈순서 명시 불필요

### 4-3. STEP 통합 — finalTax **불변** (시나리오 A, 두 시니어 합의)

**§74는 "징수유예"이지 세액 감면·공제가 아니다.** 결정세액(`finalTax`)은 그대로 확정되고, 그중 징수유예세액만 당장 납부에서 분리된다. 별지9호 ㊳(`= ㉔+㉕−㉖−㉗+...`)이 ㉖을 별도 차감하는 구조와 정합.

→ **`finalTax`(결정세액)는 줄이지 않는다.** `culturalHeritageDeferredTax`는 별도 echo 필드로 반환. **별지9호 ㊳(납부할세액) = `finalTax − 징수유예세액`**으로 유예분 차감(양식 공식 `㉔+㉕−㉖−㉗+...` + 재결례 [940708] "납부세액=유예 공제 후"와 정합). 결정세액 자체는 불변, 납부할세액(㊳)만 유예 차감.

→ 신규 서브엔진 `lib/tax-engine/inheritance-cultural-heritage-deferral.ts`(`calcCulturalHeritageDeferral()` 순수 함수)로 산식 로직 격리. ⚠️ **`inheritance-tax.ts`는 이미 820줄(기존 800줄 정책 초과 상태)** — STEP 12.5는 import + 호출로 **+2~3줄만 추가**(서브엔진 격리), 800줄 환원은 별도 리팩터링 권고. orchestrator는 **STEP 12.5 appended step**(기존 분기 삽입 금지).

### 4-4. 법령 상수

`legal-codes/inheritance-gift.ts`: `INH.CULTURAL_HERITAGE_DEFERRAL = "상증법 §74"`, `INH.CULTURAL_HERITAGE_DEFERRAL_CALC = "상증령 §76①"`.

---

## 5. 설계 방안 — UI (담당: inheritance-gift-tax-ui-senior)

### 5-1. 14개 동기화 지점

| # | 지점 | 작업 | 비고 |
|---|---|---|---|
| ① | 폼 상태 | `EstateItem.culturalHeritageType` (엔진 타입 자동 반영) | FormState 전역 신규 없음 |
| ② | initial | optional — undefined 기본 | 별도 없음 |
| ③ | normalize | optional no-op | 별도 없음 |
| ④ | API 변환 | `inheritance-api.ts:71` estateItems 통째 — **자동** | ⑫ 선행 필수 |
| ⑤ | UI 위젯 | 자산 카드 문화유산 토글+4호 라디오 | §5-2 |
| ⑥ | 사이드바 | 결정세액/징수유예액/납부세액 3단 분리(0원 미표시) | §5-3 |
| ⑦ | 결과 카드 | `CulturalHeritageDeferralCard` 신규 + 별지9호 ㉖ | §5-4·5-5 |
| ⑧ | validation | 미선택=미적용(에러 아님). 별도 규칙 불필요 | ⚠️ 엔진이 필수화하면 추가 |
| ⑨ | Zod enum 메인 | (⑫에 포함) | — |
| ⑩ | Zod 컴패니언 | 해당 없음(discriminatedUnion 감면 아님) | — |
| ⑪ | acqDate fallback | 해당 없음 | — |
| **⑫** | **Zod 입력 객체** | **`property-valuation-input.ts:283` discriminatedUnion 공통 base에 `culturalHeritageType: z.enum([...]).optional()` 추가** | **TS 미감지 — 누락 시 silent strip** |
| ⑬ | body spread | `inheritance-api.ts:71` 통째 — **자동** | — |
| ⑭ | Route 매핑 | `route.ts:72` 통째 — **자동** | ⑫ 통과 전제 |

### 5-2. 입력 위젯 (지점 ⑤)

- **위치**: Step1 "상속재산" 자산 카드 고급 옵션. `ToggleCard`(tone `emerald`, native 금지) + ON 시 `RadioCardGroup`(4개호)
- **visibility**(`resolveAssetToggleVisibility` 규칙 추가, ✅ AssetCategory 정정):
  - `real_estate_land` · `real_estate_building` → `default`(노출 — 한옥·건물·보호구역 토지)
  - `real_estate_apartment` · `other` → `hidden_expandable`(아파트 문화유산·동산 골동품 드묾 — 확장 시 노출)
  - `listed_stock` · `unlisted_stock` · `cash` · `financial` · `deposit` → `hidden_permanent`(§74 대상 아님)
- **3·4호 선택 시** 담보 면제 안내 배너(§74⑤, sky tone)
- OFF에도 emerald tone 유지(`feedback_ui_toggle_auto_visibility_policy`). 단순 optional(3-state 아님 — 토글 OFF=undefined)

### 5-3. 사이드바 (지점 ⑥)

**사이드바 3단 분리**(라벨 정확화): **결정세액**(`result.finalTax`, 불변) → **징수유예액 (§74)**(`culturalHeritageDeferredTax`, 0원/null 미표시) → **납부할세액**(`finalTax − 징수유예액`, 별지9호 ㊳와 동일). 기존 단일 "자진납부세액" 라벨이 finalTax를 가리키면 부정확 — 결정세액/납부할세액 구분 표시.

### 5-4. 결과 카드 (지점 ⑦)

신규 `components/calc/results/inheritance/CulturalHeritageDeferralCard.tsx`. 산식 한국어 풀어쓰기(변수약어·floor 금지):
```
상속세 산출세액  [값]  × 문화유산 등 재산가액 [값]  ÷ 상속재산가액 [값]  = 징수유예세액 [값] (별지9호 ㉖)
결정세액 [값]  − 징수유예세액 [값]  = 납부할세액 [값] (별지9호 ㊳)
```
+ §74② 사후관리 경고 배너(amber, "유상양도·인출 시 즉시 징수"). 자산별 내역 표는 `assetNameById` Map으로 표시(내부 id 노출 금지 `feedback_no_internal_id_in_result`). 금액 우측정렬·"원" 미표기. `INHERITANCE_PRINT_SECTIONS`에 섹션 추가.

### 5-5. 별지9호 ㉖ 연결 (핵심)

`filing-form-9-data.ts`: `const b26 = result.culturalHeritageDeferredTax ?? 0;` → `:120` `"㉖": b26` + `:144` `amtRow("㉖", b26, "left")` 동시 수정. **`b43 = result.finalTax − b26`**(별지9호 ㊳ 공식 `㉔+㉕−㉖−㉗+...` 정합 — 납부할세액은 유예분 차감). `result.finalTax`(결정세액)는 엔진에서 불변 — ㊳만 유예 차감(재결례 [940708]). `FF9_LAW_REFS["㉖"] = "상증법 §74"` 추가.

---

## 6. 케이스 인벤토리 (Do 진입 전 전수 enumerate)

> ※ 아래 **finalTax = 결정세액(불변)**. 별지9호 **납부세액(㊳) = 결정세액 − 징수유예세액**(1-1 정정). 100% 케이스(C-02)는 결정세액 불변이나 ㊳는 산출세액분만큼 0에 수렴.

| # | 케이스 | 입력 | 기대 징수유예세액 | finalTax(결정세액) |
|---|---|---|---|---|
| C-01 | 문화유산 없음 | type 없음 | 0 (㉖ "—") | 불변 |
| C-02 | 1호 단일 100% | 총재산=해당자산 | computedTax 전액 | 불변 |
| C-03 | 3호 부분 | 해당 5억 / 총재산 20억, 사전증여 0 | floor(computedTax×5억/20억) | 불변 |
| C-04 | 4호 + §13 사전증여 | 해당 5억 / grossEstate 20억 + priorGift 5억 | floor(computedTax×5억/25억) | 불변 |
| C-05 | 2호 사립 공익법인 | 요건 충족 | 정상 산출 | 불변 |
| C-06 | 복수(1호+3호) | A 3억 + B 2억 / 총 20억 | floor(computedTax×5억/20억) | 불변 |
| C-07 | 3호 담보면제 echo | designated | `collateralExemptible:true` | 불변 |
| C-08 | 1호 담보 필요 echo | heritage_data | `collateralExemptible:false` | 불변 |
| C-09 | 비율 0% (분자 0) | type 있으나 평가액 0 | 0 | 불변 |
| C-10 | computedTax 0 (과표 0) | 공제>과세가액 | 0 | 0 |
| C-11 | §12 비과세 자산과 동일 EstateItem | type+inh_cultural_property | 분자 산입(차감 전 평가액, Q-3 정리) | 불변 |
| C-12 | 협의분할 배분 자산 | 임의 | 전체 기준 산출(§76①) — 배분 무관 | 불변 |

---

## 7. anchor 케이스 (산식 검증 — 원단위 toBe)

### A-01 (Pre-Do 우선 실행 — memory `feedback_pre_anchor_verification`)

3호 부분 비율. **양도연도 법정 누진세율 직접 계산**(외부 자료 금지 `feedback_transfer_year_tax_rate`):
- grossEstate 20억(일반 15억 + 지정문화유산 5억), 사전증여 0, 일괄공제 5억 가정 → taxBase 15억
- §26: 10억~30억 구간 세율 40%·누진공제 1.6억 → computedTax = floor(15억×0.4) − 1.6억 = **4.4억**
- 분자 5억 / 분모 20억 → 징수유예 = `calculateProration(4.4억, 5억, 20억)` = **110,000,000** ← `toBe(110_000_000)`. 분자×산출세액 2.2×10¹⁷ > MAX_SAFE → BigInt 경로. ⚠️ 비례 방식(§76①) — 차액 방식(산출세액 차감) 아님(재결례 [940708] 배척)

### A-02 (§13 분모 검증, BigInt 경로)

동일 + priorGift 5억 → 분모 25억 → `calculateProration(4.4억, 5억, 25억)` = **88,000,000** ← `toBe(88_000_000)` (BigInt 경로 — 2.2×10¹⁷ ÷ 25억 정확히 나누어떨어짐)

---

## 8. 쟁점 · 확인 필요 (⚠️ 추정 금지 — Do 전 해소)

| # | 쟁점 | 권고/현 판단 | 해소 |
|---|---|---|---|
| Q-1 | 분모에 **추정상속재산 §15** 포함? | ✅ **확정: 미포함** (분모 = grossEstate + priorGift). 근거: 시행령 §76① 괄호가 §13 가산증여만 명시 + 재결례 [940708] "총 상속재산가액"(추정 별도 언급 없음) | 해소 완료 |
| Q-2 | **§12 비과세(inh_cultural_property) vs §74 이중혜택** | ✅ **확정: 별도 PDCA로 규칙 정정 분리** (대상: `exemption-evaluator.ts:60` 룰 + `legal-codes/inheritance-gift.ts:192` 주석 — 둘 다 §12 본문 부재 문화재를 비과세로 오기). 본 PR은 §74 신설 + 이중혜택 경고 | C-11 anchor로 동작 고정 |
| Q-3 | 분자 자산이 §12로 이미 비과세된 경우 분자 산입 여부 | ✅ **정리: 분모(grossEstate=비과세 차감 전)·분자 모두 차감 전 평가액으로 일관 산입**. 현행법상 문화재는 §12 비과세 아님(2호 삭제)이라 정상 충돌 없음 — `inh_cultural_property` 오작동 케이스만 Q-2 별도 처리 | Q-2 분리로 해소 |
| Q-4 | **§74② 즉시징수 시뮬레이터** 본 PR 포함? | ✅ **확정: 범위 외** — 안내 배너만. (`culturalHeritageDeferralRisk` echo 필드도 본 PR 미신설) | — |
| Q-5 | 담보(§74④⑤) **입력 필드** 포함? | ✅ **확정: 범위 외** — 계산 무영향, 안내 배너만 | — |
| Q-6 | 박물관자료(2호) 사립 공익법인 요건 — 엔진 강제 vs UI 체크리스트 | UI 체크리스트로 안내, 엔진은 type 값 신뢰 | Do 설계 |

---

## 9. 작업 분해 (Do — 시퀀셜: 엔진 선처리 → UI)

1. **엔진**(①②④⑬⑭ 선처리): 타입(EstateItem·Result·Detail) + 법령상수 + `inheritance-cultural-heritage-deferral.ts` + STEP 12.5 + **A-01 Pre-Do anchor 우선 실행**(실패 확보 → 디자인 환류) → C-01~C-12 anchor
2. **UI**(⑤⑥⑦⑫): Zod base 필드(⑫) → visibility 규칙 → `CulturalHeritageSection`(토글+라디오) → 결과 카드 → 사이드바 라인 → 별지9호 ㉖ 연결 + `FF9_LAW_REFS`
3. **Check**: `ui-engine-sync-checker`(14지점) → `bkit:gap-detector`(matchRate) → `npx tsc --noEmit` 0건 → `npx vitest run __tests__/tax-engine/inheritance/` → **E2E**(`feedback_browser_verify_with_playwright` — 폼→계산→㉖ 확인)

---

## 10. Definition of Done

- [ ] 케이스 매트릭스(§6) 전 분기 anchor + A-01/A-02 통과
- [ ] 14지점 전부(⑫ grep 자가점검 — discriminatedUnion base)
- [ ] finalTax(결정세액) 불변 + 별지9호 ㉖=result 연결 + **㊳(납부세액)=finalTax−㉖** 정합(양식 공식·재결례 [940708])
- [ ] Q-1·Q-2 쟁점 처리 방침 확정(분모 정의·§12 경계)
- [ ] `npx tsc --noEmit` 0건 / `npm test`(공유모듈 — 전체) 회귀 0
- [ ] E2E spec 통과 (수동 확인 대체)

---

## 11. 파일 변경 요약

**신규**: `lib/tax-engine/inheritance-cultural-heritage-deferral.ts` · `components/calc/inheritance/CulturalHeritageSection.tsx` · `components/calc/results/inheritance/CulturalHeritageDeferralCard.tsx` · `__tests__/tax-engine/inheritance/cultural-heritage-deferral.test.ts`

**수정**: `types/inheritance-gift.types.ts`(EstateItem·Result·Detail) · `legal-codes/inheritance-gift.ts` · `inheritance-tax.ts`(STEP 12.5) · `lib/validators/property-valuation-input.ts`(⑫ base enum) · `lib/calc/asset-toggle-visibility.ts` · `estate-card/EstateItemAdvancedPanel.tsx` · `InheritanceSidebar.tsx` · `InheritanceTaxResultView.tsx` · `lib/calc/filing-form-9-data.ts`(㉖ + ㊳ b43 차감) · `filing-form-9/filing-form-9-constants.ts`(FF9_LAW_REFS["㉖"])

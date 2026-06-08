# 상속세 부동산 평가액 입력 — 아코디언 재구성 + 매매사례가액 신규 필드 계획서

> 작성일 2026-06-08 · 대상 화면: 상속세 마법사 자산 카드(부동산) · 브랜치 미정
> 상태: **Plan (Design·Do 전)**. 본 문서의 모든 file:line은 실측, 법령 우선순위는 일부 "확인 필요" 표기.

## 1. 목표 (사용자 요구 그대로)

1. **안 C(아코디언)** 채택 — 평가방식별 접힘 헤더, 클릭 시 펼침. 스크롤 압박 감소.
2. **헤더 순서**: ① 시가 → ② 감정가액 → ③ **매매사례가액(신규)** → ④ 보충적 평가방법.
3. **라벨 변경**: 기존 "개별공시지가 / 기준시가" → **"보충적 평가방법"** 으로 통일.
4. **보충적 평가방법은 항상 노출 + 다른 평가액과 중복 입력 가능** (아코디언 택1 대상에서 제외, 상시 입력 영역).
5. **저당권·임대보증금은 평가방식과 직교** → 아코디언 밖 별도 상시 영역 유지(§66·§14).

## 2. 현황 실측 (코드 인용)

| 항목 | 현재 상태 | 위치 |
|---|---|---|
| 부동산 카드 본문 | `EstateBodyRealEstate.tsx` | `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx` |
| (A) 보충평가 섹션 | 항상 노출, `standardPrice` 바인딩, Vworld 조회 | 같은 파일 229-255 |
| (B) 시가·감정·담보 토글 | `ToggleCard(amber)`, ON/OFF | 같은 파일 259-481 (`RealEstateAdvancedFields`) |
| 평가 필드 | `marketValue`·`appraisedValue`·`standardPrice`·`leaseDeposit`·`mortgageAmount` | `types/inheritance-gift.types.ts:86·88·90` 등 |
| **매매사례가액 금액 필드** | **❌ 없음** — `valuationMethod` enum에만 `"similar_sales"` 존재 (types:62) | — |
| 엔진 우선순위 | `marketValue > appraisedValue > standardPrice` (3분기) | `property-valuation.ts:52-69` |
| 엔진 주석 | "매매사례가액은 marketValue(시가)에 흡수" | `property-valuation.ts:5-7·412` |
| §66 담보 하한 | `max(평가액, 저당+임대보증금)` — 평가방식과 무관 | `property-valuation.ts:71-75` |
| 표시 라벨 도출 | `valuationMethod` 우선, fallback marketValue→"시가" 등 | `source-summary-helpers.ts:34` |

### 핵심 발견 — 본 작업은 "UI 재배치"가 아니다

매매사례가액은 **금액 입력 필드 자체가 없다.** 별도 칸으로 분리하려면 **신규 필드 `similarSalesValue` 추가**가 필요하고, 이는 14개 동기화 지점 + 엔진 우선순위 변경을 동반한다.

## 3. ⚠️ 선결 설계 결정 (Design 단계에서 확정 — 추정 금지)

### D-1. 매매사례가액의 엔진 우선순위 ✅ 확정 (KoreanLaw 검증 2026-06-08)

**법령 본문 축자 검증 결과** (법 §60②, 시행령 §49 — MST 276123·283637):

| 그룹 | 필드 | 법적 지위 | 근거 조문 |
|---|---|---|---|
| A (동순위) | `marketValue`(매매·수용·경매·공매) · `appraisedValue`(감정) | 해당 재산 직접 **시가** | 시행령 §49①1·2·3호 (호 간 우열 없음) |
| B | `similarSalesValue`(유사매매사례) | "시가로 **본다**" | 시행령 §49④ |
| C | `standardPrice`(보충평가) | 시가 산정 곤란 시만 | 법 §60③·§61 |

- **시행령 §49② 단서**: *"해당 재산의 매매등의 가액이 있는 경우에는 제4항에 따른 가액(유사매매사례가액)을 적용하지 아니한다."* → **해당 재산 매매·감정가액이 있으면 유사매매사례가액 배제.**
- **시행령 §49② 본문**: 시가로 보는 가액이 둘 이상이면 *"평가기준일을 전후하여 가장 가까운 날"* 가액 적용.

**확정 엔진 우선순위** (계획서 §10-1 코드와 동일):
```
marketValue > 0      → "market_value"   // 그룹A
appraisedValue > 0   → "appraisal"      // 그룹A
similarSalesValue > 0 → "similar_sales" // 그룹B (그룹A 있으면 if-chain상 자연 배제 — §49② 단서 충족)
standardPrice > 0    → "standard_price" // 그룹C
```

- ✅ `appraised > similar > standard`: 법령 정합(§49② 단서·§60③).
- ⚠️ **단순화 명시**: `marketValue > appraisedValue`는 법령상 **동순위**(그룹A). 둘 다 입력 시 엔진은 **매매 우선**으로 tie-break(D-4 "무조건 시가" 확정과 일치).
- ✅ **§49② "가장 가까운 날" — 완결(엔진 날짜계산 불요, 사용자 입력 책임)**: 평가기준일에 가장 가까운 날의 시가(매매사례가 포함)는 **사용자가 직접 그 값을 해당 칸에 입력**한다(예: 평가기준일에 가장 가까운 매매사례가액을 `similarSalesValue`/`marketValue`에 입력). 엔진이 여러 날짜의 가액을 비교·평균하는 것이 아니라, 사용자가 채택할 단일 가액을 입력하는 구조 → 날짜 입력 필드·거리 계산 불필요. **본 프로젝트 범위 완결.**
- UI 아코디언 헤더 순서(시가→감정가액→매매사례가액→보충평가)는 이 우선순위와 일치.

### D-2. "보충적 평가방법" 라벨 정확성

- 현재 분기: `real_estate_land`→"개별공시지가", 그 외→"기준시가" (`EstateBodyRealEstate.tsx:231`).
- 사용자 요구는 "보충적 평가방법"으로 통일. **단** 토지=개별공시지가/주택=공동·개별주택가격/건물=기준시가는 §61 법정 용어이므로, **상위 라벨 "보충적 평가방법" + 부제로 물건별 법정 용어 병기** 권장 (예: "보충적 평가방법 (토지: 개별공시지가)"). Design에서 확정.

### D-3. 아코디언 vs 보충평가 상시노출의 시각 구조

- 아코디언 그룹(택1·다중펼침): 시가 / 감정가액 / 매매사례가액 3개.
- 보충적 평가방법: 아코디언 **밖** 상시 노출 (Vworld 조회 UI 포함).
- 저당권·임대보증금: 보충평가와 **별도의** 상시 영역(§66·§14). 평가방식 무관.
- → 한 화면에 "아코디언 3 + 상시 보충평가 + 상시 담보/임대" 3층. Design에서 시각 위계(카드 색조·번호) 확정.

## 4. 변경 설계 (Design 초안 — 확정 전)

### 4-1. 신규 필드

```ts
// types/inheritance-gift.types.ts — EstateItem
/** 유사매매사례가액 (상증법 시행령 §49①5호) — 시가로 본다. */
similarSalesValue?: number;
```

### 4-2. 엔진 (property-valuation.ts:52 resolveValuationAmount)

D-1 확정안에 따라 분기 추가. 예시(안 ㉮ 가정, 확정 전):

```ts
if (item.marketValue > 0) return { amount, method: "market_value" };
if (item.appraisedValue > 0) return { amount, method: "appraisal" };
if (item.similarSalesValue > 0) return { amount, method: "similar_sales" }; // 신규
if (item.standardPrice > 0) return { amount, method: "standard_price" };
```

### 4-3. UI (EstateBodyRealEstate.tsx)

- `RealEstateAdvancedFields` 토글 → 아코디언 3헤더(시가·감정가액·매매사례가액)로 교체.
  - 각 헤더 = 접힘 컴포넌트. 기존 값 있으면 자동 펼침(현행 `hasAdvancedValue` 패턴 계승, 필드별로).
- 보충적 평가방법 섹션 = 상시 노출(현행 229-255 유지, 라벨만 D-2 반영).
- 저당권·임대보증금 = 상시 별도 영역(현행 365-378·347-362 유지, 아코디언 밖으로).
- **native accordion 신규 금지** — `ToggleCard`/`RadioCardGroup` 가시성 원칙 준수. 다중 펼침이므로 `ToggleCard(variant=card)` 3개 또는 동등 패턴.

## 5. 14개 동기화 지점 체크리스트 (DoD)

신규 `similarSalesValue` 필드 기준. ⑫⑬⑭는 TS 미감지 → grep 자가점검 필수.

- [ ] ① 폼 상태 타입 (EstateItem — 이미 단일 타입, store 폼이 동일 타입 사용 여부 확인)
- [ ] ② initial value (자산 카드 생성 factory)
- [ ] ③ normalize fallback (sessionStorage 마이그레이션)
- [ ] ④ API 변환 (`lib/calc/inheritance-*` — 매매사례가 전달 경로)
- [ ] ⑤ UI 위젯 (아코디언 매매사례가액 헤더 + CurrencyInput)
- [ ] ⑥ 사이드바 합계 (평가액 추정에 similarSalesValue 반영)
- [ ] ⑦ 결과 카드 (`source-summary-helpers.ts:34` resolveValuationLabel + 평가내역 표 + 별지 서식)
- [ ] ⑧ validation (`lib/validators/property-valuation-input.ts` — similarSales 인식)
- [ ] ⑨⑩ Zod enum/스키마 (매매사례가 금액 필드 추가)
- [ ] ⑪ acquisitionDate fallback (해당 시)
- [ ] ⑫ Zod 입력 객체 정의 (grep)
- [ ] ⑬ API body spread (grep — 명시 매핑이면 침묵 strip 위험)
- [ ] ⑭ Route handler 엔진 input 매핑 (grep)
- [ ] **평가 우선순위 dual-truth 4헬퍼 전부 동기화** (§15 참조 — High)
- [ ] `VALUATION_METHOD_LABEL`에 `similar_sales: "매매사례가액"` 라벨 확인 (이미 존재 여부 grep — `EstimatedValuePreview:47` methodLabel엔 "유사매매사례" 존재, 라벨 통일 검토)
- [ ] **gift 경로**(STEP1 #6): `gift-tax.ts:138`·`gift-tax-form-shared.tsx:505` appraisal 판정 → 도출 헬퍼 교체, gift `estateItemSchema` 공유 Zod 반영
- [ ] **⑬ 안전 확인**(STEP1 #7): `inheritance-api.ts:71 estateItems` 통째 passthrough → 신규 필드 자동 전달. ⑫ Zod(`property-valuation-input.ts:58 baseItemSchema` / `estateItemSchema:303`)만 누락 주의

## 6. Pre-Do anchor (Design 직후·Do 전 1건 우선 실행)

- **PV-SIM-01**: `similarSalesValue`만 입력(시가·감정가·공시지가 미입력) → 엔진 채택 평가액 = similarSalesValue, method = "similar_sales". (현재는 필드 부재로 0 → **실패 확보**가 디자인 환류 신호)
- **PV-SIM-02 (D-1 검증)**: 시가 + 매매사례가 동시 입력 → 확정된 우선순위대로 채택. 법령 정합값 anchor.
- **PV-66-01 (회귀)**: 보충평가 + 저당권 동시 → §66 max 하한 불변(직교축 보존 확인).

## 7. 리스크 / 정책 점검

- ✅ `useEffect → store` 미러링: 현행 부재(직접 `set` 콜백). 아코디언 전환 시에도 유지.
- ✅ 자동 안분 fallback: 현행 부재. 매매사례가 미입력=빈칸(검증오류 아님, optional 평가액).
- ⚠️ **3-state optional 불요**: similarSalesValue는 `number | undefined` 단일 금액. 배열 토글 아님.
- ⚠️ **법령 정확성(최우선)**: D-1 매매사례가 우선순위는 KoreanLaw 검증 전 코드 단정 금지.
- ⚠️ **결과 별지 서식 영향**: 상속개시자료 요약표·평가내역·별지 부표에 "매매사례가액" 라벨/금액이 새로 노출 → ⑦ 전수 점검(별지 서식 PDF 재현 일치).
- ⚠️ **데이터 보존**: 토글→아코디언 전환 시 기존 `marketValue`·`appraisedValue` 값 보존(비파괴). 마이그레이션 불필요(필드명 동일), 단 UI 펼침 초기상태만 필드별 derive.

---

# Part 2 — 평가방식 라디오 삭제 + `valuationMethod` 파생 전환 (이미지4 중복 제거)

> 사용자 결정(2026-06-08): 아코디언에서 시가·감정가·매매사례가·보충평가를 **금액 칸으로 직접 입력**하게 되면, `EstateValuationMetaSection`의 "평가방식 라디오(자동/시가/매매사례가/기준시가/감정가액)"는 **입력 금액에서 자동 도출 가능 → 중복 → 삭제**. 동시에 "상속개시자료 요약 표시(Table A 비고 열)"도 수정.

## 9. ⚠️ 삭제 시 깨지는 의존성 (실측 — silent break 경고)

`valuationMethod` 사용처 전수 (`grep`):

| # | 파일:line | 역할 | 라디오 삭제 영향 |
|---|---|---|---|
| 1 | `EstateValuationMetaSection.tsx:41·61` | 라디오 입력 위젯 | **삭제 대상** |
| 2 | `source-summary-helpers.ts:35` `resolveValuationLabel` | 비고 열 라벨 (valuationMethod 우선 + 금액 fallback) | ✅ fallback 보유, 자동 동작 |
| 3 | **`inheritance-tax.ts:520`** | `i.valuationMethod === "appraisal"` 판정 | 🔴 **fallback 無 → undefined → false → 감정평가수수료 공제(§25①2호) 침묵 고장** |
| 4 | **`gift-tax.ts:138`** | 동일 appraisal 판정 (증여) | 🔴 동일 |
| 5 | **`steps.tsx:528`** | 동일 appraisal 판정 | 🔴 동일 |
| 6 | **`gift-tax-form-shared.tsx:505`** | 동일 appraisal 판정 | 🔴 동일 |
| 7 | **`besshi-buppyo-2-data.ts:222·239·256`** `toEstateItemValuationMethodCode` | 별지 부표2 평가방법코드(01~08) 도출 | 🔴 valuationMethod 입력 의존 → 코드 도출 깨짐 |
| 8 | `property-valuation-input.ts:66` | Zod validation 필드 | 정리(선택) |
| 9 | `InheritanceBuppyo2PdfDocument.tsx:155` / `Buppyo2NaTable.tsx:99` | 부표2 코드 렌더 (7의 출력) | 7 해결 시 자동 |

**결론**: 단순 삭제 금지. `valuationMethod`를 **수동 입력 → 파생값(derived)** 으로 전환해야 3·4·5·6·7이 보존된다.

## 10. 설계 — `resolveValuationMethod` 단일 헬퍼 (single-source-engine-helper 정책)

### 10-1. 엔진에 도출 헬퍼 신설/노출

`property-valuation.ts`의 `resolveValuationAmount`(52)가 이미 `method`를 반환한다. 이를 단일 진실로:

```ts
// property-valuation.ts — export 추가
export function resolveValuationMethod(item: EstateItem): ValuationMethod {
  // resolveValuationAmount와 동일 우선순위 (D-1 확정안). similarSalesValue 포함.
  if (item.marketValue && item.marketValue > 0) return "market_value";
  if (item.appraisedValue && item.appraisedValue > 0) return "appraisal";
  if (item.similarSalesValue && item.similarSalesValue > 0) return "similar_sales"; // 신규
  if (item.standardPrice && item.standardPrice > 0) return "standard_price";
  return "standard_price";
}
```

→ `resolveValuationAmount`도 이 헬퍼를 재사용하도록 리팩터(중복 제거, 단일 진실).

### 10-2. `valuationMethod` 필드 처리 — **타입 유지, UI만 삭제**

- 필드 `valuationMethod?: ValuationMethod`는 **타입에 잔존**(하위호환·수동 override 여지). 단 **UI 라디오 삭제로 신규 입력 경로 제거** → 사실상 항상 undefined.
- 모든 소비처는 `item.valuationMethod ?? resolveValuationMethod(item)` 패턴(명시값 우선, 없으면 도출)으로 통일. 기존 데이터(수동선택 저장본) 보존.

### 10-3. appraisal 판정 4곳 교체 (3·4·5·6)

```ts
// AS-IS: (i) => i.valuationMethod === "appraisal"
// TO-BE: (i) => (i.valuationMethod ?? resolveValuationMethod(i)) === "appraisal"
```

→ ✅ **D-4 확정(사용자 2026-06-08)**: 시가+감정가 동시 입력 시 평가액은 **무조건 시가**(우선 채택) → 도출 method="market_value" → 감정평가수수료 공제 **미적용**. 법리 정합: 시가 채택 시 감정가는 평가에 미사용 → §25①2호 "감정가액으로 평가한 경우" 비해당. 도출 method 기반 전환이 정확히 이 동작을 구현. (Design에서 KoreanLaw §25①2호 문구로 재확인만 수행, 방향은 확정.)

### 10-4. 별지 부표2 코드 도출 (7) — ✅ 실측 정정 (STEP1 #3·#4)

- **정의 위치 정정**: `toEstateItemValuationMethodCode`의 **정의는 `components/calc/results/inheritance-filing-form-helpers.ts:141`** (계획 초안의 `besshi-buppyo-2-data.ts:222`는 *호출처*).
- **시그니처 실측**: `toEstateItemValuationMethodCode(item: EstateItem, vr: PropertyValuationResult | undefined): string`. 코드는 **`vr?.method`**(엔진 결과의 method)에서 도출 — `item.valuationMethod`를 직접 보지 않음.
- **`similar_sales → "05"` 매핑 이미 존재**(:151-152). placeholder 아님. → **엔진 `resolveValuationAmount`가 `method:"similar_sales"`를 반환하도록만 하면 부표2 코드 "05" 자동 도출**. 이 함수 자체는 **무수정**.
- `cash → "06"`, 그 외 fallback `"08"`. (besshi-buppyo-2-data.ts:239·256의 "08"은 추정상속재산·사전증여 행 전용 — 본 작업 무관.)

### 10-5. 비고 열 라벨 (2)

`resolveValuationLabel`(source-summary-helpers.ts:34)을 `resolveValuationMethod` 기반으로 단일화:

```ts
export function resolveValuationLabel(item: EstateItem): string {
  return VALUATION_METHOD_LABEL[item.valuationMethod ?? resolveValuationMethod(item)];
}
```

`VALUATION_METHOD_LABEL`에 `similar_sales: "매매사례가액"` 존재 확인(constants:52 — 이미 있음). 매매사례가 입력 시 비고 열 자동 "매매사례가액".

## 11. `EstateValuationMetaSection` 수정 (이미지4 섹션)

- **평가방식 라디오 블록 삭제** (`EstateValuationMetaSection.tsx:54-69`, `VALUATION_OPTIONS`·`AutoOrMethod`·`currentMethod` 포함).
- **면적(areaSqm)·수량(quantityCount) 입력은 유지** — Table A "수량(면적)" 열 입력원이므로 존속.
- **섹션 제목 변경**: "평가방식·수량 (상속개시자료 요약 표시용)" → **"수량·면적 (상속개시자료 요약 표시용)"**.
- **빈 섹션 가드**: 라디오 삭제 후 부동산(area)·other(quantity) 외 카테고리(cash·financial·deposit)는 입력 필드가 0개 → **섹션 전체 조건부 숨김**(`showArea || showQuantity`일 때만 렌더). 빈 emerald 카드 방지.
- `EstateItemAdvancedPanel.tsx:101` 호출부는 그대로(내부에서 조건부 처리).

## 12. 추가 동기화·anchor (Part 2)

- [ ] `resolveValuationMethod` export + `resolveValuationAmount` 재사용 리팩터
- [ ] appraisal 판정 4곳 교체 (grep `=== "appraisal"` 전수 — inheritance·gift·steps·gift-form)
- [ ] 부표2 코드 도출 교체 + similar_sales 코드 매핑
- [ ] `resolveValuationLabel` 단일화 + 매매사례가 라벨
- [ ] `EstateValuationMetaSection` 라디오 삭제 + 제목 + 빈 섹션 가드
- [ ] Zod `valuationMethod`(input:66) — optional 유지 or 정리
- **Anchor VM-DERIVE-01**: appraisedValue만 입력 → `resolveValuationMethod`="appraisal" → 감정평가수수료 공제 적용(현행 동일값 유지).
- **Anchor VM-DERIVE-02 (D-4 확정)**: marketValue 2억 + appraisedValue 1.8억 동시 → 평가액=2억(시가) AND method="market_value" AND 감정평가수수료 공제=0. **확정값 anchor**.
- **Anchor VM-BUPPYO-01**: 각 평가액별 부표2 코드 도출 일치(시가·감정·매매사례·보충평가).
- **Anchor VM-LABEL-01**: similarSalesValue 입력 → 비고 열 "매매사례가액".
- **회귀**: 기존 valuationMethod 수동저장 데이터 → `?? ` 우선 분기로 라벨·판정 불변.

## 15. ⚠️ 평가 우선순위 dual-truth 4헬퍼 (STEP1 #1·#2·#8 — High)

`similarSalesValue` 추가 시 평가액·method를 도출하는 **분산된 4곳을 모두** 동기화해야 화면별 평가액이 일치한다. 미동기화 시 매매사례가 입력해도 칩·사이드바·미리보기에서 0/무시.

| # | 헬퍼 | 위치 | 현재 우선순위 | 영향 화면 | 정정 |
|---|---|---|---|---|---|
| H1 | `resolveValuationAmount` | `property-valuation.ts:52-69` | market>appraised>standard | **엔진 평가액·method**(결과·부표2코드·감정수수료판정 전부의 뿌리) | similar 분기 추가 + `resolveValuationMethod` export 단일화 |
| H2 | `computeEffectiveValuation` | `estate-item-valuation.ts` | `market ?? appraised ?? standard` | 칩 라벨·`HeirAllocation`·`TotalEstimatedValue`·사이드바 합계 | similar `??` 추가 (deposit·주식 분기 보존) |
| H3 | `EstimatedValuePreview` | `property-valuation-preview.tsx:24-32` | market>appraised>standard | 자산 카드 "예상 평가액" 미리보기 | similar if 추가 (methodLabel:47 "유사매매사례" 기존) |
| H4 | `TotalEstimatedValue` | `property-valuation-preview.tsx:90-95` | market>appraised>standard | "재산 합계 (예상)" 박스 | similar if 추가 |

- **이상적 단일화**: H2·H3·H4를 H1 도출(`resolveValuationMethod`/`resolveValuationAmount`)로 흡수하면 dual-truth 근절. **단** H3·H4는 §66 담보 MAX 로직과 결합돼 있어 범위 확대 → **본 작업은 4곳 동기 추가로 한정**, 단일화는 후속 메모(`single-source-engine-helper` 차기 적용). Design 케이스표에 4헬퍼 anchor 분리.
- **Anchor VM-DUALTRUTH-01**: similarSalesValue만 입력 → H1~H4 모두 평가액=similarSalesValue, 칩·합계·미리보기 일치.
- **0-처리 차이(STEP3 #9)**: H1은 `>0` 분기, H2는 `?? chain`(0≠undefined). H2 추가는 기존 패턴 보존 `marketValue ?? appraisedValue ?? similarSalesValue ?? standardPrice`. similarSalesValue=0 입력 시 두 헬퍼 동작 차이는 기존 marketValue=0 케이스와 동일 — Design anchor에 0-입력 케이스 분리.
- **라벨 통일(STEP3 #11)**: 신규 UI 라벨 "매매사례가액"으로 통일. `EstimatedValuePreview:47` methodLabel "유사매매사례"도 "매매사례가액"으로 정렬(또는 의도적 유지 시 Design에서 결정).
- **주식 비고 열(STEP3 #10)**: 라디오 삭제로 주식(listed/unlisted) `valuationMethod` 수동지정 경로 소멸. 주식은 market/appraised/similar/standard 미보유 시 `resolveValuationMethod`="standard_price"→비고 "기준시가"이나 실제는 §63 보충평가. **Design 점검 항목**: 주식 카테고리 비고 열 라벨 도출을 별도 검토(기존 수동선택 회귀 여부 anchor).

## 13. 결정 요약 (Design 진입 전)

| ID | 결정 | 상태 |
|---|---|---|
| D-1 | 매매사례가 우선순위 = `market > appraised > similar > standard` (그룹A 동순위·매매 tie-break 단순화, §49② "가장가까운날" 미반영 한계) | ✅ **확정** (KoreanLaw §49②④ 검증) |
| D-2 | "보충적 평가방법" 라벨 + 물건별 법정용어 병기 | Design 확정 |
| D-3 | 아코디언3 + 보충평가 상시 + 담보/임대 상시 3층 위계 | Design 확정 |
| **D-4** | **감정평가수수료 공제 판정을 도출 method 기반 전환 — 동시입력 시 동작 변화** | **KoreanLaw §25①2호 검증 필수** |
| D-5 | `valuationMethod` 필드 잔존(타입) vs 완전제거 | 잔존 권장(하위호환) |
| D-6 | 섹션 순서 = **안 가** (시가·감정·매매 아코디언 위 → 보충평가 → 담보·임대 최하단) | ✅ **확정** (사용자 2026-06-08) |
| D-7 | 주식 카테고리 비고 열 라벨 도출(라디오 삭제 회귀) | Design 점검 (STEP3 #10) |

---

## 14. 다음 단계

1. 본 계획 승인 → `inheritance-gift-tax-senior` + `inheritance-gift-tax-ui-senior` **Plan 단계 병렬 호출**(엔진·UI 동시).
2. Design: D-1·D-2·D-3 확정 + KoreanLaw §60·§49 검증 + 케이스 매트릭스(평가액 조합 enumerate).
3. Pre-Do anchor(§6) 우선 작성·실행 → 디자인 환류.
4. Do(시퀀셜: 엔진 타입·우선순위 → UI 아코디언) → Check(`ui-engine-sync-checker` + `gap-detector`).

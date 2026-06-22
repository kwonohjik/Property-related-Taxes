# 임대보증금 평가특례 — 미임대(공실) 부분 처리 — UI 설계

> 계획서: `docs/00-pm/rental-conversion-vacancy-portion.plan.md`
> 엔진 설계: `docs/02-design/features/rental-conversion-vacancy-portion.engine.design.md`
> 선행 UI 설계: `docs/02-design/features/gift-commercial-building-appurtenant-land.ui.design.md` (경로 B 구조 전제)
> 작성일: 2026-06-22
> 담당: inheritance-gift-tax-ui-senior
> 세목: 상속세 + 증여세 공용 (EstateItem 공유)
> 법령 검증: 엔진 설계 §법령 근거 (KoreanLaw MCP MST 276123·283637·284609) 직접 확인 완료.

---

## 0. 한 줄 요약

`EstateBodySupplementaryValuation.tsx`의 경로 B(separateLandMode) 블록(`:138~161`) 내부에
**미임대(공실) ToggleCard** (tone=sky, §61⑤ 배지)를 추가하고,
`DecimalInput × 2`(전체·미임대 면적) + `CurrencyInput × 1`(미임대분 건물 기준시가) +
**자동계산 박스**(sky tone, 미임대분 토지 기준시가·합계)를 노출한다.

노출 게이트: `cat === "real_estate_building" && separateLandMode`(경로 B).
`monthlyRent > 0`이 아닐 때 hint로 "임대료 미입력 시 §61⑤ 특례 미적용" 안내.

---

## 1. 법령 근거 (KoreanLaw 검증 완료 — 엔진 설계 §법령 근거에서 확인)

### 상증법 §61⑤ (본칙)

```
사실상 임대차계약이 체결되거나 임차권이 등기된 재산의 경우에는
임대료 등을 기준으로 하여 대통령령으로 정하는 바에 따라 평가한 가액과
제1항부터 제4항까지의 규정에 따라 평가한 가액 중 큰 금액을 그 재산의 가액으로 한다.
(KoreanLaw 검증 완료, MST 276123, 시행 2026-01-02)
```

### 상증령 §50⑦ (위임 체인 중간)

```
환산가액 = (연 임대료 ÷ 재정경제부령이 정하는 율) + 임대보증금
(KoreanLaw 검증 완료, MST 283637, 시행 2026-02-27)
```

### 상증칙 §15의2 (위임 체인 최종)

```
"재정경제부령으로 정하는 율"이란 100분의 12를 말한다.
(KoreanLaw 검증 완료, MST 284609, 시행 2026-03-20)
따라서 환산가액 = (월 임대료 × 12) ÷ 12% + 임대보증금
```

### 사전법령해석재산2020- (2021.06.04) — 1동 일부 임대 구분 평가

```
1동 건물 일부만 임대 중인 경우 임대분·미임대분을 구분하여 평가한다.
산식: Max(전체기준시가, 임대분환산가액 + 미임대분기준시가)

⚠️ 확인 필요: KoreanLaw API 검색 결과 없음.
   계획서 교재 산식 ("사전법령해석재산2020-, 2021.06.04")을 채택.
   Do 착수 전 taxlaw.nts.go.kr 직접 검색으로 해석례 본문 1회 확인 강제.
```

### 수학적 등가성 (단일 Max 비교로 충분)

```
전체기준시가 = 임대분기준시가 + 미임대분기준시가
특례액       = 임대분환산    + 미임대분기준시가
Max(전체기준, 특례액) = Max(임대분기준, 임대분환산) + 미임대분기준시가
                     = (교재 임대분 Max) + 미임대분기준시가
∴ 단일 Max 비교 = 교재 2단계 Max와 수학적으로 동일
```

---

## 2. 케이스 매트릭스 (법령 본문·단서·각호 전수 enumerate)

| # | 시나리오 | category | method | separateLandMode | 미임대 입력 | monthlyRent | 기대 valuatedAmount | UI 노출 |
|---|---------|----------|--------|-----------------|------------|-------------|---------------------|--------|
| V-1 | 일부임대 교재 사례(전체기준 651,300,000 / 환산 700,000,000 / 미임대 158,100,000) | real_estate_building | standard_price | B(sep) | 3필드 모두 입력 | 2,000,000 | **858,100,000** | 미임대 ToggleCard ON |
| V-2 | 미임대 미입력 (하위호환 회귀) | real_estate_building | standard_price | B(sep) | 3필드 undefined | 2,000,000 | 700,000,000 | 미임대 ToggleCard OFF |
| V-3 | 임대환산 < 전체기준시가(전체기준 900,000,000 / 환산 700,000,000 / 미임대 158,100,000) | real_estate_building | standard_price | B(sep) | 입력 | 2,000,000 | **900,000,000**(전체기준 채택) | 미임대 ToggleCard ON |
| V-4 | 경로 A(일괄고시) + 미임대 입력 시도 | real_estate_building | standard_price | A(lump) | — | 임의 | 경로 A 단일 standardPrice | 미임대 ToggleCard **숨김**(게이트 차단) |
| V-5 | §66 담보채권 하한 동시(특례액 858,100,000 / 담보 900,000,000) | real_estate_building | standard_price | B(sep) | 입력 | 2,000,000 | **900,000,000**(담보하한 채택) | 미임대 ON |
| V-6 | 시가 우선(market_value) | real_estate_building | market_value | B(sep) | 입력 | 2,000,000 | marketValue(특례 미적용) | 미임대 ON(표시만, 엔진 무시) |
| V-7 | 면적 안분 무한소수(totalArea=720, vacantArea=100, landStd=330,000,000) | real_estate_building | standard_price | B(sep) | 입력 | 2,000,000 | 건물+floor(33MM×100/720)=45,833,333 | 미임대 ON |
| V-8 | 모순: vacantBuildingArea > totalBuildingArea | real_estate_building | standard_price | B(sep) | 면적 역전 | 임의 | **validation 차단(⑧)** | 오류 |
| V-9 | 모순: 한쪽만 입력(totalBuildingArea > 0 + vacantBuildingArea = 0 + vacantBuildingStandardPrice > 0) | real_estate_building | standard_price | B(sep) | 반쪽 | 임의 | **validation 차단(⑧)** | 오류 |
| V-10 | 부수토지 미입력 + 미임대 면적 입력(appurtenantLandStandardPrice = 0) | real_estate_building | standard_price | B(sep) | 면적 입력, 부수토지 0 | 2,000,000 | 건물분만 합산(토지 0) + **UI 경고** | 경고 |
| V-11 | 비상업용 건물(real_estate_apartment·real_estate_land) | apartment/land | — | — | — | — | 미임대 ToggleCard **숨김** | — |
| V-12 | 전부 미임대(monthlyRent = 0) | real_estate_building | standard_price | B(sep) | 입력해도 | 0 | 전체기준시가(§61⑤ 미적용) | hint 안내, 특례 미적용 |

---

## 3. 14개 동기화 지점 전수 점검

신규 필드 3개: `totalBuildingArea?`, `vacantBuildingArea?`, `vacantBuildingStandardPrice?` (모두 optional number)

| # | 지점 | 파일 · 위치 | 변경 내용 | 비고 |
|---|------|------------|----------|------|
| **①** | 폼 상태 타입 | `lib/tax-engine/types/inheritance-gift-estate.types.ts` `:63` 인접 | 3필드 `?: number` + JSDoc(§61⑤ 미임대) 추가 | 엔진 설계 §타입 참조 |
| **Zod** | Zod 스키마(침묵 strip 게이트) | `lib/validators/estate-item-schema.ts` `:32` `baseItemSchema` | `totalBuildingArea: z.number().nonnegative().optional()` 등 3필드 + roundtrip 테스트 갱신 | **누락 시 silent strip** |
| **②** | initial value | `components/calc/PropertyValuationForm.tsx` 초기값 블록 | optional 필드 → 기본값 `undefined` (명시 불필요) | 확인만 |
| **③** | normalize (카테고리 전환) | `lib/calc/category-change-policy.ts` `pickPreservedFields` | cross-group 전환(building→cash 등)은 base 화이트리스트 미포함 → 자동 drop. **그룹 내 전환**(building→apartment)은 carry-over되나 엔진 `real_estate_building` 경로 밖에서 소비되지 않아 무해. Do 시 무해 실증 또는 그룹 내 drop 분기 추가 | 건물 전용 필드 |
| **④** | API 변환 (증여) | `lib/calc/gift-api.ts` `buildGiftTaxInput` giftItems `.map` spread | spread 구조라 신규 optional 자동 생존. **Zod ⑫ 통과가 진짜 게이트** | N/A(spread) |
| **④** | API 변환 (상속) | `lib/calc/inheritance-api.ts` `:60~103` estateItems passthrough | 동상 | N/A(spread) |
| **⑤** | UI 입력 위젯 | `EstateBodySupplementaryValuation.tsx` separateLandMode 블록(`:138~161`) 내부 추가 | 미임대 ToggleCard(tone=sky) + DecimalInput×2(면적) + CurrencyInput×1(건물기준시가) + 자동계산 박스(sky tone). 노출 게이트: `cat==="real_estate_building" && separateLandMode` | **신규 구현** |
| **⑥** | 사이드바·직접읽기 | `lib/calc/estate-item-valuation.ts computeEffectiveValuation` + `property-valuation-preview.tsx` 2함수 | **복제 금지** — 현행 사이드바 3사이트는 §61⑤ 임대료환산 Max 자체가 없음(선존 dual-truth 버그). 결과 도착 전 추정 단계: 기존 보충평가 단순합산 유지 + "추정" 라벨. 결과 도착 후: 엔진 `valuatedAmount` 단일 위임으로 자동 858,100,000 반영 | **복제 금지** |
| **⑦** | 결과 카드 | `lib/tax-engine/property-valuation.ts:extraCollateralRows` + 상속·증여 결과뷰 | breakdown 3~4행 자동(엔진 설계 §STEP 3). 결과뷰는 `vr.breakdown` 렌더 경로로 자동 표시 | 엔진 담당, 결과뷰 렌더 확인 |
| **⑧** | validation | 증여: `components/calc/gift-tax-form-validate.ts` + 상속: `lib/calc/inheritance-validate.ts` | 면적 모순(V-8·V-9) 차단 — `validateVacantPortionInput` per-item 헬퍼(`string \| null` early return, **`errors.push` 배열 패턴 아님**). V-10(토지 분모 0)은 §7.2 UI 인라인 경고로 단일화(validate warnings 채널 부재). **UI 통과 ↔ validate 차단 모순 금지** | 증여·상속 양쪽 |
| **⑨⑩** | Zod enum (Route) | `app/api/calc/gift/route.ts` / `app/api/calc/inheritance/route.ts` | EstateItem 배열 passthrough 자동. Zod 스키마 통과 후 전달 | N/A |
| **⑪** | acqDate fallback | N/A (EstateItem에 신규 Date 필드 없음) | 해당 없음 | N/A |
| **⑫** | Zod 입력객체 정의 | `lib/validators/estate-item-schema.ts` `baseItemSchema` | **3필드 반드시 추가** — 누락 시 API 경유 후 silent strip. roundtrip 테스트 갱신 | **침묵 strip 차단 핵심** |
| **⑬** | API body spread | `lib/calc/gift-api.ts`·`lib/calc/inheritance-api.ts` spread | ⑫ Zod 통과 전제로 자동 생존 | N/A |
| **⑭** | Route handler 엔진 input 매핑 | 상속·증여 route handler | estateItems 배열 passthrough — Date 변환 무관 | N/A |

---

## 4. FormData 타입 — 신규 3필드

엔진 설계 §타입을 그대로 반영. `appurtenantLandStandardPrice`(`:63` — 기존) 바로 아래 삽입.

```ts
// lib/tax-engine/types/inheritance-gift-estate.types.ts 추가

/**
 * 미임대(공실) 건물 전체 연면적(㎡) — §61⑤ 임대보증금 평가특례 일부임대 분리 산식.
 * 미임대분 토지 안분 분모로 사용. DecimalInput 입력.
 * vacantBuildingArea·vacantBuildingStandardPrice와 세트.
 * 경로 B(appurtenantLandStandardPrice > 0)에서만 토지 안분에 의미 있음.
 */
totalBuildingArea?: number;

/**
 * 미임대(공실) 건물 연면적(㎡) — §61⑤ 일부임대 특례 미임대분 면적.
 * 미임대분 토지 기준시가 안분 분자로 사용.
 * 반드시 totalBuildingArea 이하여야 validation 통과.
 */
vacantBuildingArea?: number;

/**
 * 미임대분 건물 기준시가(원) — 층별 위치지수·구조·용도에 따라 비균등.
 * 사용자가 「건물기준시가 계산서」 해당 층 합계를 직접 입력.
 * (토지 기준시가는 지번 동일로 ㎡단가 균일 → 면적 안분 정확 → 자동 파생)
 * CurrencyInput 입력 (정수 원).
 */
vacantBuildingStandardPrice?: number;
```

---

## 5. Initial Value (②)

3필드 모두 `optional` → `undefined` 자동 초기값. `PropertyValuationForm.tsx` `newItem` 초기값에 명시 불필요.

```ts
// PropertyValuationForm.tsx — 명시 불필요 (undefined 자동)
// totalBuildingArea: undefined,
// vacantBuildingArea: undefined,
// vacantBuildingStandardPrice: undefined,
```

---

## 6. Normalize (③) — 카테고리 전환 시 필드 정리

`lib/calc/category-change-policy.ts`의 `pickPreservedFields`는 **보존 화이트리스트** 모델.

- **cross-group 전환** (building → cash·deposit·other 등): base 화이트리스트에 3필드 미포함 → 자동 drop. 추가 작업 불필요.
- **그룹 내 전환** (building → apartment·land): `return { ...item, category }` (:64)로 carry-over됨. 그러나 apartment·land 평가 경로에서는 `calcVacantPortionStandardPrice`가 호출되지 않으므로 carry-over는 **무해(잔존 데이터)**. Do 시 anchor로 실증 확인:
  - `category="real_estate_apartment"` + 3필드 입력 → `evaluateApartment` 호출 시 미임대분 계산 미적용 확인
  - 무해 실증 실패 시 그룹 내 전환에서도 3필드 drop 분기 추가(b안)

---

## 7. UI 위젯 상세 (⑤)

### 7.1 삽입 위치

`EstateBodySupplementaryValuation.tsx`의 경로 B 블록(`:138~161`) 내부 **끝에 추가**.

현행 구조:
```tsx
{/* 경로 B 부수토지 (`:138~161`) */}
{cat === "real_estate_building" && separateLandMode && (
  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2 space-y-1.5 ...">
    <p className="text-xs font-semibold text-emerald-700">부수토지 개별공시지가 (§61①1호)</p>
    <StandardPriceInput ... />
  </div>
)}
```

미임대 ToggleCard를 **이 블록 바로 아래에** 추가:

```tsx
{cat === "real_estate_building" && separateLandMode && (
  <>
    {/* 기존 부수토지 StandardPriceInput 블록 유지 */}
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2 space-y-1.5 ...">
      <p className="text-xs font-semibold text-emerald-700">부수토지 개별공시지가 (§61①1호)</p>
      <StandardPriceInput ... />
    </div>

    {/* ▼ 신규: 미임대(공실) 분리 평가 ToggleCard */}
    <VacantPortionSection item={item} set={set} />
  </>
)}
```

> **위치 확정 이유**: 부수토지(`appurtenantLandStandardPrice`)가 토지 안분 분모이므로
> 부수토지 입력 직후에 미임대 입력이 위치해야 사용자 입력 순서가 명확하다(§3-4 cross-card 순서 결합 해소).
> 같은 separateLandMode 블록 내부이므로 `appurtenantLandStandardPrice` 상태에 동일 스코프로 접근 가능.

### 7.2 VacantPortionSection 컴포넌트

800줄 정책 점검: `EstateBodySupplementaryValuation.tsx`는 현재 165줄. 미임대 섹션 추가 후 약 50~80줄 증가 예상 → 220~245줄. 800줄 이하. 내부 서브 컴포넌트로 충분.

```tsx
/**
 * VacantPortionSection — §61⑤ 임대보증금 평가특례 미임대(공실) 부분 입력.
 *
 * 노출 게이트: cat==="real_estate_building" && separateLandMode (경로 B 전용).
 * monthlyRent가 0이면 §61⑤ 특례 자체가 미적용이므로 hint로 안내(차단 아님 — 미리 입력 허용).
 *
 * 입력:
 *   totalBuildingArea    (㎡) — DecimalInput  — 전체 건물 연면적
 *   vacantBuildingArea   (㎡) — DecimalInput  — 미임대 건물 연면적
 *   vacantBuildingStandardPrice (원) — CurrencyInput — 미임대분 건물 기준시가(직접입력)
 *
 * 자동 파생(read-only 박스):
 *   미임대분 토지 기준시가 = appurtenantLandStandardPrice × vacantBuildingArea / totalBuildingArea (floor)
 *   미임대분 기준시가 합계 = 미임대분 건물 기준시가 + 미임대분 토지 기준시가
 *
 * useEffect 금지: 자동 파생은 아래 useMemo 계산으로 표시만. store 미러링 아님.
 */
function VacantPortionSection({
  item,
  set,
}: {
  item: EstateItem;
  set: (patch: Partial<EstateItem>) => void;
}) {
  const hasMonthlyRent = (item.monthlyRent ?? 0) > 0;

  // ToggleCard는 완전 controlled(checked 필수, 내부 state 없음 — ToggleCard.tsx:135).
  // checked===true일 때만 children 렌더(:303). 데이터에서 checked를 파생하면 3필드가
  // 모두 비어있는 초기 상태에서 토글을 켜도 children이 펼쳐지지 않아 입력 자체가 불가능
  // (chicken-and-egg). 기존 보충평가 토글(EstateBodySupplementaryValuation.tsx:67
  // supplementaryOpen / :72 separateLandMode)과 동일하게 mount 시 1회 derive하는
  // 로컬 useState로 개폐를 관리한다. (memory feedback_three_state_optional_mode_toggle:
  // length>0 derive 금지)
  const [vacantOpen, setVacantOpen] = useState(
    () =>
      (item.totalBuildingArea ?? 0) > 0 ||
      (item.vacantBuildingArea ?? 0) > 0 ||
      (item.vacantBuildingStandardPrice ?? 0) > 0
  );

  // 미임대분 자동 파생 — display only, store 미러링 아님(useEffect 금지)
  const vacantLandStd = useMemo(() => {
    const vacantArea = item.vacantBuildingArea ?? 0;
    const totalArea = item.totalBuildingArea ?? 0;
    const totalLandStd = item.appurtenantLandStandardPrice ?? 0;
    if (vacantArea <= 0 || totalArea <= 0 || totalLandStd <= 0) return 0;
    // safeMultiply + floor — feedback_safemul_decimal_apportion_precision
    return Math.floor((totalLandStd * vacantArea) / totalArea);
  }, [item.vacantBuildingArea, item.totalBuildingArea, item.appurtenantLandStandardPrice]);

  const vacantBuildingStd = item.vacantBuildingStandardPrice ?? 0;
  const vacantTotal = vacantBuildingStd + vacantLandStd;

  const noLandStd = (item.appurtenantLandStandardPrice ?? 0) === 0;

  return (
    <ToggleCard
      tone="sky"
      size="sm"
      title="일부만 임대 중 (미임대 공실 있음)"
      description="§61⑤ 임대분·미임대분 구분 평가 — 미임대분 건물·토지 기준시가 합산"
      checked={vacantOpen}
      onCheckedChange={(open) => {
        setVacantOpen(open);
        if (!open) {
          // 토글 OFF 시 3필드 초기화(이중계상 방지)
          set({
            totalBuildingArea: undefined,
            vacantBuildingArea: undefined,
            vacantBuildingStandardPrice: undefined,
          });
        }
      }}
    >
      {/* 임대료 미입력 안내 */}
      {!hasMonthlyRent && (
        <p className="text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1">
          월 임대료가 입력되지 않으면 §61⑤ 임대료환산 특례가 적용되지 않습니다.
          아래 "담보·임대" 섹션의 월 임대료를 먼저 입력하세요.
        </p>
      )}

      {/* 부수토지 미입력 경고 — 토지 안분 불가 안내 (차단 아님) */}
      {noLandStd && (
        <p className="text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1">
          부수토지 개별공시지가 미입력 — 미임대분 토지 기준시가 안분 불가 (건물 기준시가분만 합산됩니다).
        </p>
      )}

      <div className="space-y-2 mt-1">

        {/* 섹션 1 — 면적 (sky tone) */}
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2 dark:border-sky-800/40 dark:bg-sky-950/20">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">1</span>
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">건물 면적</p>
          </div>
          <FieldCard
            label="전체 건물 연면적"
            unit="㎡"
            hint="1동 전체 건물 연면적(등기부·건축물대장 기재 면적)"
          >
            {/* DecimalInput에는 label/hideLabel prop이 없음(DecimalInput.tsx:18 DecimalInputProps:
                value·onChange·placeholder·disabled·unit·className·thousandSeparator·data-testid만).
                시각 라벨은 FieldCard label이 담당. */}
            <DecimalInput
              value={item.totalBuildingArea != null ? String(item.totalBuildingArea) : ""}
              onChange={(v) => set({ totalBuildingArea: parseDecimal(v) || undefined })}
              data-testid="vacant-total-building-area"
            />
          </FieldCard>
          <FieldCard
            label="미임대 건물 연면적"
            unit="㎡"
            hint="공실(미임대) 층·호의 연면적 합계"
          >
            {/* DecimalInput에 label/hideLabel 없음 — 시각 라벨은 FieldCard label */}
            <DecimalInput
              value={item.vacantBuildingArea != null ? String(item.vacantBuildingArea) : ""}
              onChange={(v) => set({ vacantBuildingArea: parseDecimal(v) || undefined })}
              data-testid="vacant-building-area"
            />
          </FieldCard>
        </div>

        {/* 섹션 2 — 미임대분 건물 기준시가 직접입력 (sky tone) */}
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2 dark:border-sky-800/40 dark:bg-sky-950/20">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">2</span>
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">미임대분 건물 기준시가</p>
          </div>
          <FieldCard
            label="미임대분 건물 기준시가"
            unit="원"
            hint="건물기준시가 계산서의 미임대 층 기준시가 합계를 입력하세요 (층별 위치지수·구조·용도에 따라 면적 단순 안분이 부정확하여 직접 입력)"
          >
            <CurrencyInput
              label="미임대분 건물 기준시가"
              value={item.vacantBuildingStandardPrice != null ? String(item.vacantBuildingStandardPrice) : ""}
              onChange={(v) => set({ vacantBuildingStandardPrice: parseAmount(v) || undefined })}
              hideLabel
              hideUnit
              data-testid="vacant-building-standard-price"
            />
          </FieldCard>
        </div>

        {/* 자동 계산 결과 박스 (vacantTotal > 0일 때만 표시) */}
        {vacantTotal > 0 && (
          <div
            className="rounded-md border border-sky-300 bg-sky-100/60 px-3 py-2 text-sm space-y-1 dark:border-sky-700/40 dark:bg-sky-950/40"
            data-testid="vacant-portion-auto-calc"
          >
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">
              미임대분 기준시가 합계 (자동 계산)
            </p>
            {vacantBuildingStd > 0 && (
              <div className="flex justify-between text-xs text-sky-800 dark:text-sky-200">
                <span>미임대분 건물 기준시가 (직접 입력)</span>
                <span className="font-mono tabular-nums">{vacantBuildingStd.toLocaleString()}</span>
              </div>
            )}
            {vacantLandStd > 0 && (
              <div className="flex justify-between text-xs text-sky-800 dark:text-sky-200">
                <span>미임대분 토지 기준시가 (면적 안분)</span>
                <span className="font-mono tabular-nums">{vacantLandStd.toLocaleString()}</span>
              </div>
            )}
            {noLandStd && vacantBuildingStd > 0 && (
              <p className="text-[10px] text-amber-600">
                ※ 부수토지 미입력으로 토지분 안분 불가 (건물분만 반영됨)
              </p>
            )}
            <div className="flex justify-between text-sm font-semibold text-sky-900 dark:text-sky-100 border-t border-sky-200 dark:border-sky-700 pt-1">
              <span>미임대분 합계</span>
              <span className="font-mono tabular-nums">{vacantTotal.toLocaleString()}</span>
            </div>
            <p className="text-[10px] text-sky-600 dark:text-sky-400">
              ※ 산식: 전체 부수토지 기준시가 {(item.appurtenantLandStandardPrice ?? 0).toLocaleString()} × 미임대 면적 {(item.vacantBuildingArea ?? 0)} ÷ 전체 면적 {(item.totalBuildingArea ?? 0)} = 토지분 {vacantLandStd.toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </ToggleCard>
  );
}
```

### 7.3 UI 순서 = 엔진 계산 로직 순서

엔진 `applyCollateralFloor` → `calcRentalConversionValue` → `calcVacantPortionStandardPrice` 순서:

```
① §61 경로 라디오 (기존 — RadioCardGroup, 경로 A/B)
② [경로 B] 건물 기준시가 (§61①2호) — 기존 StandardPriceInput
③ [경로 B] 부수토지 개별공시지가 (§61①1호) — 기존 StandardPriceInput(land)
④ [경로 B] 미임대 ToggleCard — 신규 (본 구현)
   ④-1 전체 건물 연면적 (㎡) — DecimalInput
   ④-2 미임대 건물 연면적 (㎡) — DecimalInput
   ④-3 미임대분 건물 기준시가 (원) — CurrencyInput
   ④-4 자동 계산 박스 (토지분 + 합계)
⑤ 담보·임대 필드 (CollateralLeaseFields — monthlyRent·leaseDeposit 등, 기존 위치 유지)
```

> 월 임대료(`monthlyRent`)는 `CollateralLeaseFields`(형제 컴포넌트)에 있어 UI 순서와 엔진 순서가 다소 어긋난다.
> 이는 계획서 §3-1에서 "hint로 안내"로 확정된 설계다 — (c)안(월 임대료 이동)은 미채택.
> 미임대 ToggleCard hint에 "월 임대료는 아래 담보·임대 섹션에서 입력" 안내로 보완.

### 7.4 ToggleCard 초기 ON/OFF 결정 — 로컬 useState (controlled)

ToggleCard는 완전 controlled(내부 state 없음)이므로 개폐는 §7.2의 `vacantOpen` 로컬 useState가 관리한다. 초기값은 mount 시 1회 데이터에서 derive(3필드 중 하나라도 입력 시 ON·비파괴). 이후에는 데이터에서 checked를 역산하지 않는다(파생 checked 금지 — chicken-and-egg 방지).

```ts
// §7.2의 useState 초기화 식과 동일 — mount 시 1회만 derive
const [vacantOpen, setVacantOpen] = useState(
  () =>
    (item.totalBuildingArea ?? 0) > 0 ||
    (item.vacantBuildingArea ?? 0) > 0 ||
    (item.vacantBuildingStandardPrice ?? 0) > 0
);
// checked={vacantOpen}
// onCheckedChange={(open) => { setVacantOpen(open); if (!open) set({3필드 undefined}); }}
```

> 기존 보충평가 토글(`EstateBodySupplementaryValuation.tsx:67 supplementaryOpen`·`:72 separateLandMode`)과 동일 패턴. memory `feedback_three_state_optional_mode_toggle`(length>0 derive 금지) 준수.

### 7.5 토글 OFF 시 초기화

사용자가 ToggleCard를 OFF할 때 3필드를 `undefined`로 초기화한다(이중계상 방지·이후 재활성 시 clean state 보장).

```ts
onCheckedChange={(open) => {
  setVacantOpen(open); // 로컬 controlled state 갱신 (§7.4)
  if (!open) {
    set({
      totalBuildingArea: undefined,
      vacantBuildingArea: undefined,
      vacantBuildingStandardPrice: undefined,
    });
  }
}}
```

> **useEffect → store 미러링 금지** (memory `feedback_useeffect_store_mirror_forbidden`):
> ToggleCard OFF 시 초기화는 `onCheckedChange` 내 직접 `set()` 호출. 상태 감시 useEffect 금지.

---

## 8. Silent Fallback 후보 식별 (feedback_no_silent_apportion_fallback)

| 필드 | 미입력 처리 | 정책 결정 | 이유 |
|------|-----------|---------|------|
| `totalBuildingArea` | 0(undefined) → 미임대 토지 0 | **0 처리 — 차단 않음** | 미임대 없으면 3필드 모두 미입력이 정상 |
| `vacantBuildingArea` | 0 | 단독 입력 시 validation 차단(V-9) | 반쪽 입력 = 모순 |
| `vacantBuildingStandardPrice` | 0 | 단독 입력 시 validation 차단(V-9 유사) | 면적 없이 기준시가만 = 모순 |
| 미임대분 토지 기준시가 | `appurtenantLandStandardPrice × vacantArea / totalArea` 자동 파생 | **허용 — 법령 명시 안분** | 교재 이미지5 산식. 사용자가 면적 명시 입력. 토지 ㎡단가 균일(지번 동일). PHD §164⑤ 예외와 동질. silent fallback 아님. |
| `appurtenantLandStandardPrice` = 0 일 때 토지 안분 | 토지분 0, 건물분만 반영 | **안내 표시, 차단 않음** | 경로 A 우회 방어. 엔진 `calcVacantPortionBreakdown`이 0 반환(안전) |

---

## 9. Cross-field 동기화 — useEffect 금지 선언

| 트리거 | 갱신 대상 | 구현 방법 | useEffect 금지 이유 |
|--------|---------|---------|-----------------|
| 미임대 ToggleCard OFF | 3필드 `undefined` 초기화 | `onCheckedChange` 내 `set({...})` 직접 호출 | 무한 루프 차단 |
| `totalBuildingArea`/`vacantBuildingArea`/`appurtenantLandStandardPrice` 변경 | 자동 계산 박스 갱신 | `useMemo` — display only, store 미기록 | useEffect store write 불필요 |
| 미임대분 토지 기준시가 | 사이드바 표시 | 결과 도착 후 엔진 `valuatedAmount` 단일 위임 | UI 재구현 금지 (`feedback_ui_engine_dual_truth_avoidance`) |
| 경로 A 선택(separateLandMode OFF) | 3필드 초기화 | 기존 경로 B 라디오 `onChange` 내 `set({ appurtenantLandStandardPrice: undefined })` — 3필드는 경로 B 진입 시에만 의미 있으므로 경로 A 전환 시도 시 함께 초기화 고려(Do 시 결정) | 미러링 아님 — onChange 직접 처리 |

---

## 10. Validation — ⑧ 동기화

### 10.1 차단 케이스

> **실제 시그니처 정합** (Do 전 확인 완료):
> - 증여 `components/calc/gift-tax-form-validate.ts`의 `validateStep(step, form)`은 `string | null`(첫 오류 단일 문자열)을 **early return**하는 패턴(`:28`). `errors.push(...)` 배열 채널 없음.
> - 상속 `lib/calc/inheritance-validate.ts`의 per-item 검증(`validateFamilyBusinessEstateItem` `:49`·`validateEstateItemAllocations` `:148`)도 모두 `string | null` early return.
>
> 따라서 V-8·V-9 모순 검증은 **per-item 헬퍼**로 작성하고 첫 오류 문자열을 `return`한다. `errors.push`/`warnings.push` 배열 패턴 사용 금지.

**신규 per-item 헬퍼** (증여·상속 공용 — `EstateItem` 단일 인자):

```ts
/**
 * §61⑤ 미임대(공실) 3필드 모순 검증 (V-8·V-9).
 * 첫 오류 문자열 1건 return, 없으면 null.
 */
export function validateVacantPortionInput(item: EstateItem): string | null {
  // V-8: 면적 역전
  if (
    (item.vacantBuildingArea ?? 0) > 0 &&
    (item.totalBuildingArea ?? 0) > 0 &&
    (item.vacantBuildingArea ?? 0) > (item.totalBuildingArea ?? 0)
  ) {
    return "미임대 건물 연면적이 전체 건물 연면적보다 클 수 없습니다.";
  }
  // V-9: 건물 기준시가 입력했는데 면적 미입력
  if (
    (item.vacantBuildingStandardPrice ?? 0) > 0 &&
    ((item.totalBuildingArea ?? 0) <= 0 || (item.vacantBuildingArea ?? 0) <= 0)
  ) {
    return "미임대분 건물 기준시가를 입력한 경우 전체 건물 연면적과 미임대 건물 연면적을 모두 입력해야 합니다.";
  }
  // V-9 변형: 면적 한쪽만 입력
  if ((item.vacantBuildingArea ?? 0) > 0 && (item.totalBuildingArea ?? 0) <= 0) {
    return "미임대 건물 연면적을 입력한 경우 전체 건물 연면적도 입력해야 합니다.";
  }
  if (
    (item.totalBuildingArea ?? 0) > 0 &&
    (item.vacantBuildingArea ?? 0) <= 0 &&
    (item.vacantBuildingStandardPrice ?? 0) > 0
  ) {
    return "전체 건물 연면적을 입력한 경우 미임대 건물 연면적도 입력해야 합니다.";
  }
  return null;
}
```

**호출 지점 연결**:
- 증여: `validateStep`의 `step === 1` 자산 루프(`gift-tax-form-validate.ts:35~` `allItems` 순회)에 추가 —
  ```ts
  for (const it of allItems) {
    const vacantErr = validateVacantPortionInput(it);
    if (vacantErr) return vacantErr;
  }
  ```
- 상속: `validateEstateItemAllocations`(`:148`) 인접에서 신규 헬퍼를 자산 검증 루프에 함께 호출(기존 per-item 호출 지점에 `validateVacantPortionInput(item)` 추가, 첫 오류 return).

### 10.2 경고(차단 아님) — V-10

> **warnings 채널 부재 확인**: 증여 `gift-tax-form-validate.ts`에는 warnings 채널이 전혀 없고(`string | null`만), 상속 `inheritance-validate.ts`의 warnings(채무 중복 등)는 자산 평가 경로와 연결되지 않는다. 따라서 V-10을 validate의 warnings로 띄울 표면이 현행에 존재하지 않는다.

**V-10 경고는 validate가 아니라 §7.2 UI 인라인 경고로 단일화한다.** §7.2의 VacantPortionSection은 `noLandStd`(부수토지 미입력) 시 이미 amber 박스 경고를 표시한다(`:285~289` 토글 내부 안내, `:370~374` 자동계산 박스 내 ※ 안내). V-10은 이 UI 경고로 충족하고, **validate에서는 V-10 경고를 시도하지 않는다**(현행 validate에 warnings 배열이 없음).

### 10.3 ⑧ 정책 — UI/API fallback ↔ validate 동기화 (feedback_validation_sync_8th_point)

3필드 모두 optional → 자동 안분 fallback 없음. validate 차단은 V-8·V-9 모순 차단만 추가(`validateVacantPortionInput`).
V-10 경고는 UI 인라인 경고로만 표시(validate 무차단·무경고) → UI 통과 ↔ validate 차단 모순 없음.

---

## 11. 결과 카드 (⑦) — breakdown 렌더

엔진 `extraCollateralRows` (`property-valuation.ts:127`)가 breakdown에 추가한 행을 결과뷰가 자동 렌더한다.

**상속세 결과뷰** (`InheritanceTaxResultView.tsx`):

현행 `:471~494`의 `vr.warnings.map` 앞에 `vr.breakdown` 렌더 코드가 **없음** (현재 breakdown이 result 뷰에서 렌더되지 않음 → 확인 필요).

```tsx
// InheritanceTaxResultView.tsx 재산 평가 내역 루프 내부
{result.valuationResults.map((vr, i) => (
  <div key={i} className="px-4 py-2.5 space-y-0.5">
    <div className="flex justify-between font-medium text-sm">
      <span>{assetNameById.get(vr.estateItemId) ?? "재산"}</span>
      <span>{formatKRW(vr.valuatedAmount)}</span>
    </div>
    <p className="text-gray-400">평가방법: ...</p>
    {/* breakdown 행 렌더 — §61⑤ 미임대분 분해 */}
    {vr.breakdown.length > 0 && (
      <div className="text-xs text-gray-500 space-y-0.5 mt-1">
        {vr.breakdown.map((step, j) => (
          <div key={j} className="flex justify-between">
            <span>{step.label}</span>
            <span className="font-mono tabular-nums">{formatKRW(step.amount)}</span>
          </div>
        ))}
      </div>
    )}
    {vr.warnings.map((w, j) => (...))}
  </div>
))}
```

> breakdown 행 산식(한국어):
> ```
> §61⑤ 임대료환산가액 (임대분)         700,000,000
> 미임대분 건물 기준시가                  75,600,000
> 미임대분 토지 기준시가 (면적 안분)       82,500,000
> 임대보증금 평가특례 합계 (채택)        858,100,000
> ```
> 변수 약어(`P_F`)·`floor()` 표시 금지 (memory `feedback_result_view_korean_formula`).

**증여세 결과뷰** (`GiftTaxResultView.tsx`):

`GiftTaxValuationFormTable`은 별지 제10호서식 부표1 고정 컬럼 — 단일 `valuatedAmount` 표시. **breakdown 2~4행 미적용** (선행 UI 설계 §8.3 정책 동일).

---

## 12. 사이드바 (⑥) — 단일 위임 확인

사이드바 3사이트 현황 (엔진 설계 §14개 동기화 지점 ⑥ 참조):

| 사이트 | 파일 | §61⑤ 임대료환산 Max | 미임대분 특례 |
|--------|------|-------------------|------------|
| `computeEffectiveValuation` | `lib/calc/estate-item-valuation.ts` | **부재** (선존 버그) | **복제 금지** |
| `resolveEstateItemValue` | `lib/tax-engine/valuation/resolve-estate-item-value.ts` | **부재** | **복제 금지** |
| `EstimatedValuePreview` | `components/calc/property-valuation-preview.tsx` | **부재** | **복제 금지** |
| `TotalEstimatedValue` | 동상 | **부재** | **복제 금지** |

**정책**: 4사이트 모두 미임대분 특례를 직접 재구현하지 않는다.
- 결과 도착 전: 기존 보충평가 단순합산(standardPrice + appurtenantLandStandardPrice) 유지. "추정" 라벨 명시.
- 결과 도착 후: 엔진 `valuatedAmount`(858,100,000) 단일 위임 → 자동 반영.

> 선존 임대료환산 본체 dual-truth 해소는 **Scope Out** (별도 PR) — 본 계획 범위 밖.

---

## 13. Pre-Do Anchor (기대값)

엔진 설계 §테스트 약속에서 발췌. Do 착수 전 V-1-PRE 현행 실패 확보 필수.

### V-1 — 교재 사례 (주요 anchor)

```ts
// 교재 사례 (서대문구 연희동 △빌딩, 2026.02.18 증여)
const item: EstateItem = {
  id: "v1", category: "real_estate_building", name: "△빌딩",
  standardPrice: 321_300_000,
  appurtenantLandStandardPrice: 330_000_000,   // 전체 기준시가 합계: 651,300,000
  monthlyRent: 2_000_000,
  leaseDeposit: 500_000_000,
  totalBuildingArea: 720,
  vacantBuildingArea: 180,
  vacantBuildingStandardPrice: 75_600_000,
};

// 임대분 환산 = floor(2,000,000 × 12 / 0.12) + 500,000,000 = 700,000,000
// 미임대분 토지 = floor(330,000,000 × 180 / 720) = 82,500,000
// 미임대분 합계 = 75,600,000 + 82,500,000 = 158,100,000
// 특례액 = 700,000,000 + 158,100,000 = 858,100,000
// 결과 = Max(651,300,000, 858,100,000) = 858,100,000
expect(evaluateDetachedHouse(item).valuatedAmount).toBe(858_100_000);
```

### UI anchor — 미임대 ToggleCard 노출

```
입력: cat="real_estate_building", separateLandMode=true (경로 B)
기대: VacantPortionSection 렌더됨 (data-testid="vacant-portion-toggle" 등 존재)

입력: cat="real_estate_building", separateLandMode=false (경로 A)
기대: VacantPortionSection 미렌더

입력: cat="real_estate_apartment"
기대: VacantPortionSection 미렌더
```

### UI anchor — 자동 계산 박스

```
입력: appurtenantLandStandardPrice=330,000,000, totalBuildingArea=720, vacantBuildingArea=180,
      vacantBuildingStandardPrice=75,600,000
기대:
  data-testid="vacant-portion-auto-calc" 표시
  "미임대분 토지 기준시가 (면적 안분)" 항목 = 82,500,000
  "미임대분 합계" = 158,100,000
```

### V-7 — 면적 안분 무한소수

```
입력: appurtenantLandStandardPrice=330,000,000, totalBuildingArea=720, vacantBuildingArea=100
기대 자동계산 박스 토지분: floor(330,000,000 × 100 / 720) = 45,833,333
```

---

## 14. E2E 명세

### 증여세: `e2e/rental-conversion-vacancy-portion.spec.ts` (신설)

```
시나리오 1 — 미임대 분리 평가 (V-1 교재 사례):
  1. 증여세 마법사 진입 → Step 2 자산 추가 → 상업용 건물 (real_estate_building)
  2. 보충평가 토글 ON → 경로 B(건물+부수토지 분리) 선택
  3. 건물 기준시가 입력: 321,300,000
  4. 부수토지 개별공시지가 단가+면적 → 총액 330,000,000
  5. 담보·임대 섹션 → 월 임대료: 2,000,000 / 임대보증금: 500,000,000
  6. "일부만 임대 중" ToggleCard ON
  7. 전체 건물 연면적: 720 / 미임대 건물 연면적: 180
  8. 미임대분 건물 기준시가: 75,600,000
  9. 자동 계산 박스 "미임대분 합계: 158,100,000" 확인
  10. 계산 버튼 → Network body에 totalBuildingArea=720 도달 확인
  11. 결과: valuatedAmount = 858,100,000

시나리오 2 — 미임대 미입력 (하위호환 회귀 V-2):
  1~5. 동일 (미임대 ToggleCard OFF)
  6. 결과: valuatedAmount = 700,000,000

시나리오 3 — 경로 A에서 미임대 미노출 (V-4):
  1. 경로 A(일괄고시) 선택 유지
  2. "일부만 임대 중" ToggleCard 없음 확인

시나리오 4 — 면적 모순 validation (V-8):
  1. 경로 B + 미임대 ToggleCard ON
  2. 전체 면적: 100 / 미임대 면적: 200 (역전)
  3. 계산 버튼 비활성 또는 오류 메시지 "미임대 건물 연면적이 전체 건물 연면적보다..." 확인

E2E 함정:
  - DecimalInput data-testid passthrough: "vacant-total-building-area", "vacant-building-area" testid 확인
    (memory: DecimalInput/CurrencyInput testid 미전달 전례 있음 — PR#324 교훈)
  - CollateralLeaseFields는 형제 컴포넌트: 월 임대료 입력 후 미임대 ToggleCard 진입 확인
  - 상속세 stale E2E 6종 사전존재 (`project_inheritance_stale_e2e_specs`) 회귀 오인 금지
```

### 상속세 회귀: 기존 상속세 E2E 실패 없음 확인

EstateItem 공유 → 상속 보충평가에도 자동 반영. 기존 상속 케이스에서 미임대 3필드 undefined → `calcVacantPortionStandardPrice` 0 반환 → 하위호환.

---

## 15. Scope Out (UI 관점)

| 항목 | 이유 |
|------|------|
| 사이드바 임대료환산 본체 dual-truth 해소 | `EstimatedValuePreview`·`TotalEstimatedValue`·`computeEffectiveValuation`·`resolveEstateItemValue` 현행 §61⑤ 환산 Max 미구현. 미임대분만 추가하면 법령 부재값 발생. 별도 PR |
| 층별 테이블 UI (A안) | 신규 아키텍처 필요 |
| 국세청 건물기준시가 자동 계산기 연동 | 수동 입력 범위 |
| 경로 A 일괄고시 미임대 안분 | 토지+건물 미분리 → 안분 분모 부재 |
| §50⑧2호 토지·건물 소유자 상이 케이스 | "세무사 상담 권장" 안내로 처리 |

---

## 16. 3대 핵심 정책 자가 점검

| 정책 | 점검 | 결론 |
|------|------|------|
| useEffect → store 미러링 금지 | 자동 계산 박스는 `useMemo` display only. ToggleCard OFF 초기화는 `onCheckedChange` 직접 호출. 사이드바는 엔진 위임(복제 아님). | 준수 |
| 자동 안분 fallback 금지 | 미임대분 토지 기준시가 파생 = 법령 명시 안분(교재 이미지5). 사용자 명시 면적 입력 + 균일 단가 전제. silent fallback 아님. 3필드 미입력 = undefined(0 처리, 검증 오류 아님). | 준수 |
| Validation 8번째 동기화 강제 | 증여(`gift-tax-form-validate.ts` `validateStep` 자산 루프)·상속(`inheritance-validate.ts` per-item 호출 지점) 양쪽에 `validateVacantPortionInput`(`string \| null` early return) 차단 규칙(V-8·V-9) 추가. V-10은 §7.2 UI 인라인 경고로 단일화(validate warnings 채널 부재). UI 통과 ↔ validate 차단 모순 없음. | 준수 |

---

## 17. DoD 체크리스트 (Do 완료 보고 전)

### 타입·Zod (① ⑫)
- [ ] ① `totalBuildingArea`·`vacantBuildingArea`·`vacantBuildingStandardPrice?: number` EstateItem 타입 추가 + JSDoc
- [ ] ⑫ `estate-item-schema.ts baseItemSchema` 3필드 `z.number().nonnegative().optional()` 추가 (침묵 strip 방지)
- [ ] Zod roundtrip 테스트 갱신

### UI 위젯 (⑤)
- [ ] ⑤ `VacantPortionSection` 컴포넌트 — `EstateBodySupplementaryValuation.tsx` separateLandMode 블록 내부 추가
- [ ] ⑤ ToggleCard tone=sky, 노출 게이트: `cat==="real_estate_building" && separateLandMode`
- [ ] ⑤ `DecimalInput × 2` (totalBuildingArea·vacantBuildingArea) — data-testid passthrough 확인
- [ ] ⑤ `CurrencyInput × 1` (vacantBuildingStandardPrice) — data-testid passthrough 확인
- [ ] ⑤ 자동 계산 박스 (sky tone) — `useMemo` 파생, store 미기록
- [ ] ⑤ ToggleCard OFF 시 3필드 `undefined` 초기화 (`onCheckedChange`)
- [ ] ⑤ 임대료 미입력 안내 (hint)
- [ ] ⑤ 부수토지 미입력 경고 (V-10 안내)
- [ ] ⑤ 경로 A(separateLandMode=false)에서 ToggleCard 미노출 확인
- [ ] ⑤ `data-testid="vacant-portion-auto-calc"` 자동계산 박스

### 사이드바·validation (⑥ ⑧)
- [ ] ⑥ 사이드바 복제 없음 확인 (`computeEffectiveValuation`·`property-valuation-preview.tsx` 미임대분 재구현 grep 0건)
- [ ] ⑧ `validateVacantPortionInput(item)` per-item 헬퍼 신설 (`string | null` early return — `errors.push` 배열 패턴 금지)
- [ ] ⑧ 증여 validate: `validateStep` step===1 자산 루프에서 `validateVacantPortionInput` 호출 (V-8·V-9 차단)
- [ ] ⑧ 상속 validate: per-item 호출 지점(`validateEstateItemAllocations` 인접)에 `validateVacantPortionInput` 호출 (V-8·V-9 차단)
- [ ] ⑧ V-10은 §7.2 UI 인라인 경고로만 표시 (validate warnings 채널 부재 — validate 무차단·무경고)
- [ ] ⑧ UI 통과 ↔ validate 차단 모순 없음

### 결과 카드 (⑦)
- [ ] ⑦ `InheritanceTaxResultView.tsx` 재산 평가 내역 루프에 `vr.breakdown` 행 렌더 추가 (breakdown이 현재 미렌더임을 확인 후)
- [ ] ⑦ 증여 결과: `GiftTaxValuationFormTable` breakdown 미적용 (별지 고정 컬럼 — 단일 valuatedAmount)

### normalize (③)
- [ ] ③ building→apartment 그룹 내 전환 시 carry-over 무해 실증 anchor (또는 drop 분기 추가)

### 테스트
- [ ] Pre-Do anchor V-1-PRE: 현행 실패(700,000,000) 확보 → GREEN 전환(858,100,000)
- [ ] V-2 하위호환 회귀: 미임대 미입력 → 700,000,000 불변
- [ ] V-3 Max 정합: 임대환산 < 전체기준시가 → 전체기준시가 채택
- [ ] V-7 면적 안분 무한소수: floor(330,000,000 × 100 / 720) = 45,833,333
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/property-valuation/` 통과 (기존 AL-B1~AL-C1 6건 회귀 없음)
- [ ] 증여·상속 전체 vitest 회귀 통과
- [ ] E2E `rental-conversion-vacancy-portion.spec.ts` 시나리오 1~4 통과
- [ ] 상속세 stale E2E 6종 사전존재 확인 후 회귀 판정
- [ ] 브라우저 수동 확인: Network body `totalBuildingArea: 720`, `vacantBuildingArea: 180`, `vacantBuildingStandardPrice: 75600000` 도달 확인, 결과 858,100,000 표시

---

## 18. 미해결 / Do 진입 전 확정 필요

1. **사전법령해석재산2020- 해석례 본문 확인**: Do 착수 전 taxlaw.nts.go.kr 직접 검색 필수. 산식 불일치 시 Do 중단.

2. **`vr.breakdown` 렌더 현황**: `InheritanceTaxResultView.tsx:471~494`의 현행 루프에 breakdown 행 렌더 코드가 없음. Do 시 실측 확인 후 추가 필요.

3. **VacantPortionSection 위치 최종 확인**: `EstateBodySupplementaryValuation.tsx` 165줄 + 미임대 섹션 약 80줄 = 245줄. 800줄 이하. 내부 서브 컴포넌트로 충분(별도 파일 불필요).

4. **경로 A 전환 시 3필드 초기화**: 경로 B → A 전환 시 `appurtenantLandStandardPrice: undefined`(기존 처리)에 더해 3필드도 `undefined` 초기화 여부. Do 시 UX 관점에서 결정(권장: 초기화 — 경로 A는 미임대 분리 개념 자체가 없음).

5. **증여 결과뷰 breakdown**: `GiftTaxResultView.tsx`에서 재산 평가 내역이 렌더되는 경로 확인 필요. 증여도 `vr.breakdown` 렌더가 필요한지 Do 전 실측.

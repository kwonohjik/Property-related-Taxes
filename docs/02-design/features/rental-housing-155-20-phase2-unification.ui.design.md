# [UI 설계] §155⑳ Phase 2 — 나목·필드 rename·F6 델타

> 계획: `rental-housing-155-20-phase2-unification.plan.md` · 엔진: `.engine.design.md`.
> Phase 1 UI(`RentalHousingExceptionSection.tsx` `RentalUnitCard` + `.ui.design.md`)의 **델타만** 기술. contingency: D-2 rename·나목은 Q-P2 확정 후.
> 다주택 UI(`HouseEntryRentalTypeSection.tsx`)는 무변경(T2 — HouseInfo 입력 유지).

## 1. 델타 요약

| 항목 | Phase 1 | Phase 2 |
|---|---|---|
| 임대구분 옵션 | 장기일반/단기6년/구법 | **+ 기존사업자(existing_business)** |
| 취득방법 | 자유선택 | existing_business 선택 시 **매입 고정**(disabled) |
| 기준시가 위젯 | 임대개시일 기준시가(단일) | 나목=**취득당시 기준시가 스왑**(별도 CurrencyInput) |
| 조정게이트 필드 | `isRegulatedAreaNewAcq`(ToggleCard) | **rename `isExcluded918Rule` + `hasContractDepositProof`(carve-out ToggleCard)** |
| 국민주택규모 | 없음 | 나목 ToggleCard 노출 |
| 2호 토글 노출 | `isConstruction`만 | **나목(매입)도 노출** |
| 아파트(F6) | 다·바 배지 "제외 유형" | 다·바=아파트 허용(라디오 노출)·아·자만 "제외" |

## 2. 조건부 노출 파생 (Phase 1 §2 확장 — useMemo, store 미러링 금지)

```ts
const showRegion   = article ∈ {가,마,아,구법};          // 나 제외(취득당시·지역무관)
const show918      = article ∈ {마,아};                   // U2 조정취득 918: 마=hard·아=carve-out
const showRegulated= article === "아";                   // 아: isExcluded918Rule + hasContractDepositProof carve-out
const showShortToLong = article ∈ {마,바};               // U1 단기→장기 변경 제외 토글
const showSize     = article ∈ {다,바,자};               // 건설
const showMin2     = article ∈ {나,다,바,자};            // ★나목 추가(P5)
const showNational = article === "나";                   // 국민주택규모
const showAcqPrice = article === "나";                   // 취득당시 기준시가 스왑
const showRentStartPrice = article !== "나";             // 임대개시일 기준시가(나목 숨김)
const showApartment= article ∈ {가,마,다,바,구법};        // ★F6: 다·바 포함(건설장기 아파트 허용)·아·자만 제외안내
const lockAcqPurchase = article === "나";                // 취득방법 매입 고정
```

## 3. 위젯 (RentalUnitCard 추가분)

```
│ 임대구분  (장기일반/단기6년/구법/기존사업자)  RadioCardGroup   testid=rental-category-{i}
│ [existing_business] 취득방법=매입 고정(disabled radio)
│ ▨ 판정 기준 배지 — 나목: "나목 · 의무 5년 · 취득당시 3억(지역무관)"
│ [나목]  취득당시 기준시가   CurrencyInput  testid=rental-acq-official-price-{i}  hint="취득 당시 기준시가 3억 이하"
│ [나목]  □ 국민주택규모 충족  ToggleCard    testid=rental-national-size-{i}
│ [나·다·바·자] □ 2호 이상 임대 충족  ToggleCard
│ [마·아] □ 2018.9.14 이후 조정대상지역 취득(isExcluded918Rule)  ToggleCard  testid=rental-regulated-newacq-{i}   ※마=hard배제·아=carve-out
│ [아목·918 ON시] □ 조정 공고일 이전 취득·계약금 증빙(hasContractDepositProof)  ToggleCard  testid=rental-contract-deposit-{i}
│ [마·바] □ 단기→장기일반 변경 신고 주택(isExcludedShortToLongChange)  ToggleCard  testid=rental-short-to-long-{i}
│ [가·마·다·바·구법] 아파트 여부  RadioCardGroup   ※다·바=허용(F6)
│ [아·자] "아파트 제외 유형" 고정 안내
```
- 나목 선택 시 `standardPriceAtRentalStart` 위젯 숨김·`acquisitionOfficialPrice` 노출(위젯 스왑).
- `hasContractDepositProof` 토글은 `isExcluded918Rule` ON일 때만 노출(carve-out 종속).

## 4. 클라이언트 8 동기화 (Phase 1 §3 확장)

- ① FormData: `acquisitionOfficialPrice`(string)·`isNationalSizeHousing`(bool)·`hasContractDepositProof`(bool)·rentalCategory `existing_business`; `isRegulatedAreaNewAcq`→`isExcluded918Rule` rename.
- ② factory: 신필드 기본값(빈값·false).
- ③ migrate: rename 이전(`isRegulatedAreaNewAcq`→`isExcluded918Rule` 값보존)·신필드 backfill.
- ④ API: 신필드 전송·namerename.
- ⑤ 본 문서 §2·§3.
- ⑦ 결과카드: 나목 perUnitVerdict 배지.
- ⑧ validate: 나목=취득당시 기준시가·국민주택 필수(`deriveRentalArticle` 재사용·3중 패턴).

## 5. E2E (Phase 1 spec 확장)

- 임대구분 "기존사업자" 선택 → 취득방법 매입 고정·취득당시 기준시가 위젯 노출·국민주택 토글·배지 "나목".
- 아목 조정 토글 ON → 계약금증빙 토글 노출(carve-out).
- F6: 건설(바목) 아파트 선택 → 아파트 라디오 노출·"제외" 경고 없음(Phase 1 회귀 정정).
- rename: `rental-regulated-newacq-{i}` testid 유지(내부 필드만 rename).

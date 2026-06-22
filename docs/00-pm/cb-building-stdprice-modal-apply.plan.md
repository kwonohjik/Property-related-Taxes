# 건물 기준시가 모달 — 복합구조 적용 버튼 + 부수토지 자동 전달

> 작성일: 2026-06-22
> 범위: 상속·증여 보충평가 "건물 기준시가 계산" 모달(`BuildingStdPriceModalButton`)
> 성격: UI 수정(엔진 input/result·Zod·API·validate 무변경). 폼 모듈에 순수 헬퍼 1개 추가.

---

## 1. 문제

1. **복합구조 적용 불가 (버그)**: 모달에서 복합구조로 건물 기준시가를 계산하면(예 합계 336,240,000) "이 금액 적용" 버튼이 나타나지 않아 평가액에 반영할 수 없었다.
2. **토지 평가액 중복 입력**: 모달에서 토지면적·㎡당 개별공시지가를 입력(위치지수 산정용)하면 토지기준시가(예 330,000,000)가 계산되는데, 경로 B 하단 부수토지(§61①1호) 필드에 **같은 값을 다시 입력**해야 했다.

## 2. 원인 (검증)

- 적용 버튼은 `result.valuation`/`acquisition`/`transfer`가 있을 때만 렌더 (`BuildingStdPriceModalButton.tsx:77-91`). 복합구조 결과는 `compositeTotal`/`transferComposite.total`/`acquisitionComposite.total`만 채우고 위 3필드는 비어 있음 (`building-standard-price.ts:112-119,172-209`) → 버튼 누락.
- 모달 onApply는 단일 number(건물)만 전달 (`:19`). 토지액 전달 수단 없음. 모달 토지기준시가는 `LandPriceLookupField` UI 미리보기(면적×단가)일 뿐 (`StandardPriceInput`/`LandPriceLookupField`).
- §61①1호 부수토지 = 면적 × 개별공시지가 → 모달이 이미 가진 입력으로 동일 값 산출 가능.

## 3. 수정

1. **복합구조 적용 버튼 추가** (`BuildingStdPriceModalButton.tsx`):
   - 상증 복합: `compositeTotal` → "이 금액 적용".
   - 양도 복합: `acquisitionComposite.total`(≤2000은 `acqBaseConversion.convertedTotal`) → "취득시 적용", `transferComposite.total` → "양도시 적용".
2. **부수토지 자동 전달** (상증 경로 B):
   - `building-std-price-form.ts`: `computeValuationLandTotal(f)` 추가 — 상증 한정, `landParcelMode`면 필지별 합, 아니면 `floor(valLandPrice × landAreaM2)`. 양도/미입력 시 0. 라운딩은 `StandardPriceInput`(단가×면적 floor)과 일치.
   - `BuildingStdPriceForm`: `onResult`에 5번째 인자 `landStandardPrice` 추가, `handleCalc`에서 산출값 전달.
   - `BuildingStdPriceModalButton`: `onApply(standardPrice, landStandardPrice?)`로 확장. 상증 적용 버튼(valuation·compositeTotal)에서 토지액 동반 전달. 양도 호출부(`CommercialBuildingBlock`·`GeneralBuildingBlock`)는 2번째 인자 무시(하위호환).
   - `EstateBodySupplementaryValuation`: `onApply`가 `standardPrice` + (경로 B & land>0이면) `appurtenantLandStandardPrice` 동시 set.

법령 정합: 건물 기준시가(§61①2호)는 토지를 위치지수로만 반영(건물만), 부수토지(§61①1호)는 별도 합산 → 이중계상 없음.

## 4. 검증

- `npx tsc --noEmit` 0건 (전 호출부 하위호환).
- E2E `cb-building-stdprice-modal-apply.spec.ts`: 경로 B 복합구조 계산 → "이 금액 적용" 노출 → 적용 시 건물(compositeTotal 81,360,000) 상단 + 부수토지 330,000,000 하단 자동 채움.
- 회귀 E2E 19건 통과(`building-standard-price`·`commercial-building-appurtenant-land-61`·`rental-vacancy-portion`·`cb-building-stdprice-total-mode`).
- 단위 59건 통과(`building-std-price-form`·`nts-report-adapter`·`building-std-price-locked-prefill`·엔진 anchor·nts-cases).

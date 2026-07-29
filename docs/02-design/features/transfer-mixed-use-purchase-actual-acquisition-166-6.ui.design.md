# UI 설계 — 겸용주택 매매 취득 실거래가 §166⑥ 안분 (R1)

> 엔진설계: `transfer-mixed-use-purchase-actual-acquisition-166-6.engine.design.md`
> 핵심: 신규 폼필드 **불요**(기존 `fixedAcquisitionPrice` 재사용) — UI는 (1)기존 입력칸이 엔진에 반영되도록 배선, (2)안내 문구, (3)결과 라벨 3가지.

## 1. 현행 UI 문제 (실측)

- `CompanionAcqPurchaseBlock.tsx:457` `!useEstimatedAcquisition` 분기가 `isMixedUse`(:516)보다 **먼저** → 겸용 "실거래가" 선택 시 취득가액 CurrencyInput(:476 "취득가액 (원)")이 렌더되나 **엔진이 침묵 폐기**(API 미운반).
- 취득가액 산정 방식 선택기(:309~394)는 겸용(assetKind="housing")에 4옵션(실거래가/환산/감정/매매사례) 노출 — 실거래가 클릭 가능하나 무동작.

## 2. UI 변경 (최소)

### ⑤ 입력 위젯 — 기존 입력칸에 안내 추가
`CompanionAcqPurchaseBlock.tsx:476` 취득가액 CurrencyInput의 `hint`를 겸용 실거래가일 때 추가(기존 입력칸 재사용 — 신규 위젯 없음):
```
겸용주택 실거래가: 취득 당시 실지거래가액(계약서상)을 입력하세요. 엔진이 법 §100②에 따라
취득시 기준시가 비율로 주택분·상가분, 각 토지·건물에 자동 안분합니다.
(위 "겸용주택 분리계산"의 취득시 기준시가가 안분 비율로 사용됩니다.)
```
- **취득시 기준시가(비율용) 필수 유지**: 실가 모드에서도 MixedUseSection의 취득시 개별주택가격·상가건물기준시가·공시지가는 안분 비율 산출에 필수(값 자체가 취득가액이 아님을 hint로 명시). 자동 안분 fallback 금지(`feedback_no_silent_apportion_fallback`).

### ⑦ 결과 카드 — route enum 라벨 분기
`MixedUseResultCard.tsx`: `acquisitionConversionRoute === "section97_actual"`일 때 취득가액 라벨 = **"취득 실거래가(§100② 안분)"**. 기존 분기(`section97_direct`=환산·`inheritance_*`·`gift_*`)에 1행 추가. 산식 한국어 풀어쓰기(`feedback_result_view_korean_formula`): "총 취득 실거래가 → 취득시 기준시가 비율로 주택분/상가분 안분".
- **dual-truth 회피**: 결과 라벨은 route enum 단일 소스(신규 result echo 필드 금지, MixedUseResultCard.tsx:126 주석 강제).

### ⑥ 사이드바 — 자동(신규 코드 불요)
`transfer-per-asset-summary.ts`: 겸용 취득가액을 엔진 result `estimatedAcquisitionPrice` 합으로 읽음 → 실가값 자동 추종. 결과 전 프리뷰는 `directAcqRaw`=`fixedAcquisitionPrice`라 실가 모드 입력값과 일관.

## 3. Validation (⑧)

`transfer-tax-validate-mixed-*`: 겸용 매매 실가 모드(`acquisitionCause==="purchase" && !useEstimatedAcquisition && !isAppraisal && !isSalesCase && isMixedUseHouse`) 시:
- `fixedAcquisitionPrice` 필수 — 미입력 차단("겸용 취득 실거래가를 입력하세요").
- 취득시 기준시가(주택·상가 안분 비율용) 필수 — 기존 겸용 검증 재사용(엔진 commercial.ts:87 throw와 이중).
- UI 통과 ↔ validate 차단 모순 금지(3중 패턴). 실가 모드에서 감정가액·매매사례 미지원 안내.

## 4. 미지원 조합 가드 UI (엔진 X-1·X-2)

- 실가 + 공익수용(§164⑨): 엔진 throw(commercial.ts:66 미러) → validate에서 선차단 + 안내("겸용 실거래가 + 공익수용은 미지원").
- 실가 + 용도변경(house_to_commercial)/Case A: 초기 미지원 → 안내("보유 중 용도변경 겸용은 환산 모드로 입력").

## 5. 정책 준수 체크

- Toggle/RadioCardGroup: 취득가액 산정 방식 선택기는 기존 native 버튼(별건 — 본 PR 범위 밖, 기존 유지).
- placeholder 숫자 예시 금지 → hint 한국어(§2).
- 결과 산식 변수약어·floor 금지 → 한국어 풀어쓰기.
- LandPriceLookupField: 취득시 공시지가는 기존 MixedUseSection 위젯 유지.

## 6. U-검토 노트

- 실가 모드에서 취득시 기준시가가 "취득가액이 아니라 비율 산출용"임을 사용자가 오해하지 않도록 hint 강조(가장 큰 UX 리스크).
- 취득가액 산정 방식 선택기 4옵션 중 겸용에서 감정가액·매매사례는 미지원 — 선택 시 validate 차단 or 옵션 disable(Design 확정, 초기엔 validate 차단).

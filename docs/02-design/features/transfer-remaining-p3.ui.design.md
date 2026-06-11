# P3 — §98의3 + §98의5 + §98의6 UI 설계

> 엔진 설계: `transfer-remaining-p3.engine.design.md` · P2 폼(Unsold987/992InputForm) 패턴 준수

## 1. 폼 3건 (각 별도 파일 — 패널은 렌더 분기만)

### `Unsold983InputForm.tsx`
① sky 주체·시한 — residencyType983 RadioCardGroup(거주자 2009.2.12~ / 국내사업장 없는 비거주자 2009.3.16~) + houseType983 RadioCardGroup(사업주체 취득/자기건설) + 분기 일자(contractDate983 / constructionStartDate983+usageApprovalDate983)
② rose 지역 — isOutsideSeoulNotDesignated983 토글 + isOverconcentration983 ToggleCard(ON children: landAreaSqm983·floorAreaSqm983 DecimalInput, hint 660·149 이내 한정 + 감면율 60%)
③ rose 자격 — isUnsoldConfirmed983·isFirstContract983·isNotOccupiedAtContract983·isNotRecontract983 (+자기건설 시 isNotExcludedSelfBuilt983)
④ amber 기준시가 3종 · emerald 안내(농특세 비과세·장특 표1·기본세율 강제·중과 배제)

### `Unsold985InputForm.tsx`
① sky 계약(~2011.4.30, 2010.2.11 현재 미분양) ② sky 인하율 priceReductionRatePct985 DecimalInput(%) — hint "(최초 공시 분양가 − 실제 매매가) ÷ 최초 공시 분양가 × 100. 10% 이하 60% / 20% 이하 80% / 20% 초과 100%" ③ rose 자격 토글 4종 ④ amber 기준시가 · emerald 안내(농특세 비과세)

### `Unsold986InputForm.tsx`
① sky 유형 hoType986 RadioCardGroup(1호 사업주체등 2년 임대 후 취득 / 2호 취득 후 5년 임대) ② sky 계약(contractDate986) ③ sky 기준시가 합계 stdPriceSumAtBase986(6억 — 주택+부수토지, 1호는 최초 임대개시 당시)+floorAreaSqm986(149) ④ violet 임대 — 1호: sellerRented2Years986 토글 / 2호: rentalContractDate986·rentalStartDate986·rentalEndDate986·inheritedRentalMonths986 (§98의8 폼 동형) ⑤ rose 자격 토글 ⑥ amber 기준시가 3종 · emerald 안내(5년 내 감면은 1호 한정·농특세 과세)

## 2. 결과 카드

`IncomeDeductionDetailCard` kind 3종 추가. rate 표시 (과밀 60%·인하율별·50%) — formulaSteps가 운반. `ruralSurtaxExempt` 시 sky 박스 대신 "농어촌특별세 비과세 (농어촌특별세법 시행령 §4⑦1호)" 배지.

## 3. 동기화 14지점

P2와 동일 메커니즘: ① asset-reduction union 3멤버 ② defaults 3분기 ③ factory 3블록 ④ api-reductions 3분기(houseType·hoType별 일자 strip) ⑤ 폼 3건+패널 ⑥ — ⑦ 카드 ⑧ validate(분기별 필수 일자·과밀 면적·인하율·임대개시) ⑨⑩⑬ 무변경 ⑫ Zod 3블록 ⑭ mapper 3분기 Date 변환.

## 4. E2E

`e2e/transfer-p3-hybrid.spec.ts` — 미분양 그룹 → 3개 라디오 활성 + 폼 렌더 (§98의3 과밀 60% hint / §98의5 인하율 / §98의6 1호·2호 라디오).

## 5. UI 검토

| # | 발견 | 정정 |
|---|---|---|
| 1 | 983 자기건설 분기 시 계약일 입력 잔존 → API에서 houseType별 strip | ④ 적용 |
| 2 | 986 2호 임대 필드는 1호에서 미전달 (hoType별 strip) | ④ 적용 |
| 3 | 면적·인하율은 DecimalInput (CurrencyInput 소수점 버그) | 전 필드 적용 |
| 4 | RadioCardGroup name 고유값 3종 | unsold983-residency·unsold983-house-type·unsold986-ho |

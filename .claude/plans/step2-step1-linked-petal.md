# Step2 해체 & 전(全) 자산별 입력 통합 리팩토링 플랜

## Context

현재 양도소득세 마법사(Step1~Step5)는 자산별로 달라야 하는 입력들이 `TransferFormData` 루트에 단일 필드로 저장되어 **일괄양도(다자산) 시 자산 1번의 값이 전체에 적용되는 왜곡**을 일으키고 있다.

- **Step2(양도정보)** 의 `transferDate/filingDate`는 계약 공통이므로 Step1 최상단이 논리적. 같은 스텝의 `propertyAddress*`(소재지)는 자산별이어야 하는데 루트 단일로 저장됨.
- **Step2의 `parcelMode`(다필지 토글)** 는 "토지 1필지 안의 여러 구필지(환지·합병)"를 다루는 자산 **내부** 개념인데 자산 외부 토글로 잘못 배치되어 일괄양도와 혼동 유발.
- **Step3(취득정보 상세)** 의 환산취득가 공시가격 조회·기준시가 입력이 Step1과 중복이며, 주자산만 조회하는 구조여서 일괄양도 시 자산별 가액 산정에 쓸 수 없음.
- **Step4의 조정대상지역 조회** 도 주자산 주소 1회만 질의. 일괄양도·토지·비주택 자산이 섞인 경우 부정확.
- **Step5(감면·공제)** 는 `form.reductionType` **루트 단일 선택**으로만 받아서, 자산별로 서로 다른 감면(예: 자경 주택 + 장기임대 주택 동시 양도) 적용이 불가. 엔진·Zod 스키마·라우트는 이미 자산별 `reductions` 배열을 받을 수 있도록 설계돼 있으나 UI/Form/클라이언트 변환만 루트 단일.
- **Step5의 복수 감면 허용 공백**: 조특법 §127② 단서에 따라 "자경(§69) + 공익수용(§77)" 등 특정 조합은 중복 적용 가능하나, 현재 엔진 `calcReductions`(`transfer-tax-rate-calc.ts:289`)는 `reduce(max)` 로 1건만 선택. 예외 화이트리스트 미구현.
- **Step5의 인별 5년 합산 한도 공백**: 조특법 §133 "감면세액 5년 누적 한도(2억/3억 등)"가 엔진에 미구현(`aggregate-reduction-limits.ts:15` 주석 "범위 외"). 현재는 연간 한도(1억/2억)만 그룹별 비율 안분으로 적용.
- **자산 입력 UX 혼동**: 현재 Step1의 `CompanionAssetsSection`은 자산 카드를 세로로 연속 펼쳐 렌더링하는 구조(48줄 단순 map). 자산이 많아질수록 스크롤이 길어지고 "지금 어느 자산 입력 중인지" 혼동이 커짐. 프로젝트 전체에 Sheet/Drawer/Accordion 같은 분리 입력 UI가 존재하지 않음.

**목표**: 자산에 귀속되는 모든 입력(주소·공시가격·조정지역·다필지·감면·공제)을 자산별 UI로 이전하되, 자산 입력 자체를 **서브스텝/편집 Sheet**로 격리하여 "자산 1건씩 집중 입력" 흐름 도입. 엔진·한도·복수 감면 로직도 법령 수준까지 보강.

## 목표 구조

### Step1 (자산 목록 + 양도 기본 정보) — 서브스텝/편집 Sheet 패턴
```
[메인 화면]
1. [최상단] 안내문 + ResetButton
2. [NEW] 양도일 · 신고일 (transferDate, filingDate) — 계약 공통
3. 총 양도가액 (contractTotalPrice) — 계약 공통
4. [자산 2개 이상일 때] 일괄양도 모드 토글 (bundledSaleMode)
5. [NEW 구조] 자산 리스트 요약 (CompanionAssetsSection 리팩토링)
   └─ 각 자산 1줄 요약 카드(라벨·종류·주소·양도가액·취득원인) + [편집] [삭제] 버튼
   └─ [+ 자산 추가] 버튼 → 편집 Sheet 신규 진입
6. 자산 리스트 하단 안내문(조특법 §166⑥ 안분)

[자산 편집 화면 — Sheet(=우측 서랍) 또는 서브스텝]
자산 1건을 격리된 공간에서 집중 입력. 다음을 포함:
   ├─ 자산 기본: 라벨·종류(assetKind)·승계조합원(isSuccessorRightToMoveIn)·1세대 주자산 플래그
   ├─ 소재지 검색 (AddressSearch → assets[i].addressRoad/Jibun/Detail/BuildingName/Longitude/Latitude)
   ├─ 실제 양도가액 (assets[i].actualSalePrice)
   ├─ 취득원인 (purchase/inheritance/gift) — 분기 블록
   ├─ 취득 정보 블록 (Purchase/Inheritance/Gift) — standardPriceAtAcq는 공시가격 조회 블록이 담당하므로 제거
   ├─ 공시가격 조회 블록 (자산별 취득·양도 기준시가)
   ├─ [assetKind === "housing"] 조정대상지역 조회 블록 (취득·양도 시점)
   └─ [assetKind === "land"] "취득시기 상이" 토글(구 parcelMode) + 필지 입력(ParcelListInput)

[Sheet 하단]
   ├─ [취소] 임시 변경 폐기
   └─ [저장] assets[i] 커밋 후 리스트 화면으로 복귀
```

### Step2 → 삭제
- 기능 전부 Step1로 이관.
- 향후 스텝 인덱스: **Step3→Step2, Step4→Step3, Step5→Step4**.

### Step3(신 Step2, 고급 취득정보·특례)
```
1. 상단: Step1 자산 카드에서 입력한 취득원인·취득일·취득가·기준시가 읽기전용 요약 (각 자산별 1줄)
2. 취득가 산정 방식 (acquisitionMethod: actual/estimated/appraisal) — 자산별 선택 가능하도록 자산 탭/루프
3. [appraisal] 감정가액 (appraisalValue) — 자산별
4. [토지+pre1990] Pre1990LandValuationInput — 자산별
5. [건물/주택] 신축·증축 가산세 — 자산별
※ 다필지 입력, 공시가격 조회, 조정대상지역 조회는 모두 Step1 자산 카드로 이동했으므로 여기서 제거.
```

### Step4 (구 Step4 유지, 보유상황 + 조정지역 판정 결과 요약)
```
1. 보유상황 관련 기존 입력은 유지(자산별 해당 필드는 이미 AssetForm에 존재).
2. 조정대상지역 조회 UI 제거 → Step1 자산 카드에서 수행됨.
3. 자산별 조정지역 조회 결과(`isRegulatedAreaAtAcq/Transfer`)를 표로 요약 표시.
```

### Step5(자산별 감면·공제 + 인별 5년 한도) — 대폭 재설계
```
[자산 N개에 대한 루프 영역]
각 자산별 블록:
   ├─ 자산 라벨/종류/주소 요약 (읽기전용)
   ├─ 감면 종류 **체크박스(다중 선택 허용)**: self_farming / long_term_rental / new_housing / unsold_housing / public_expropriation (5종)
   │    ※ 라디오가 아닌 체크박스 — 조특법 §127② 단서에 따라 특정 조합(예: 8년 자경 §69 + 공익수용 §77)은 중복 적용 가능.
   ├─ 선택된 감면마다 서브패널(각각 독립):
   │    ├─ self_farming: farmingYears, useSelfFarmingIncorporation, 피상속인 합산, SelfFarmingIncorporationInput
   │    ├─ long_term_rental: rentalYears, rentIncreaseRate, rentalReductionDetails
   │    ├─ new_housing / unsold_housing: reductionRegion 3지선다, newHousingDetails
   │    └─ public_expropriation: cash, bond, bondHoldingYears, approvalDate
   └─ 자산별 실효 감면 프리뷰: 엔진이 combinable 그룹 합산 + 비-combinable max 선택 후 산출한 예상액

[인별 5년 합산 한도 영역 — NEW]
├─ 안내: 조특법 §133 "과거 4개 과세연도 감면세액 누적 + 당해 합산 ≤ 5년 한도"
├─ 과거 감면 이력 입력(priorReductionUsage[]):
│    └─ 연도 / 감면 유형 / 감면액 (여러 건 추가/삭제 가능)
└─ 자동 계산: 당해 감면이 5년 한도에 걸리는지 경고 + 자동 capping

[하단 계약 공통]
├─ annualBasicDeductionUsed (사람 단위 기본공제 연간한도, 루트 유지)
└─ 조특법 §127② / §133 연간·5년 한도 안내 배너

엔진·스키마 대응:
- TransferTaxInput에 priorReductionUsage 필드 신규
- reductions 배열을 "combinable 그룹 단위 sum + 나머지 max" 로직으로 재작성
- aggregate-reduction-limits.ts에 applyFiveYearLimits 함수 신규
```

---

## 변경 파일

### (A) zustand store — 구조 이전 (대규모)
- **`lib/stores/calc-wizard-store.ts`**
  - **AssetForm에 추가할 신규 필드** (자산별 독립 저장):
    - 다필지: `parcelMode?: boolean`, `parcels?: ParcelFormItem[]`
    - 주소 확장: `addressDetail?: string`, `buildingName?: string`, `longitude?: number | null`, `latitude?: number | null`
    - 조정지역 결과: `isRegulatedAreaAtAcq?: boolean | null`, `isRegulatedAreaAtTransfer?: boolean | null` (주택 전용, 비주택은 null 유지)
    - **감면 필드 이관 + 구조 변경** (루트 → AssetForm, 단수→복수):
      - 기존 `reductionType` 단일 문자열 제거. 대신 `reductions: AssetReductionForm[]` **배열** 신설(복수 감면 동시 선택 허용).
      - `AssetReductionForm` 타입: `{ type: "self_farming" | "long_term_rental" | "new_housing" | "unsold_housing" | "public_expropriation"; ...type별 서브필드 }` discriminated union (Zod `reductionSchema`와 1:1 대응).
      - 자경: `farmingYears`, `useSelfFarmingIncorporation`, `selfFarmingIncorporationDate`, `selfFarmingIncorporationZone`, `selfFarmingIncorporationStandardPriceAtIncorporation`, `decedentFarmingYears`
      - 장기임대: `rentalYears`, `rentIncreaseRate`, `rentalReductionDetails`
      - 신축·미분양: `reductionRegion`, `newHousingDetails`
      - 수용: `expropriationCash`, `expropriationBond`, `expropriationBondHoldingYears`, `expropriationApprovalDate`
  - **TransferFormData(루트)에 신규 추가**: 
    - `priorReductionUsage: { year: number; type: ReductionType; amount: number }[]` — 인별 5년 합산 한도 산정용 과거 감면 이력.
    - 이미 존재하는 `standardPriceAtTransfer`, `standardPriceAtTransferLabel` 재사용.
  - **TransferFormData(루트)에서 제거할 필드**:
    - 주소: `propertyAddressRoad/Jibun/BuildingName/Detail/Longitude/Latitude`
    - 다필지: `parcelMode`, `parcels`
    - 감면 18개: 위 AssetForm 이관 대상 동일
    - **계약 공통으로 남는 루트 필드**(제거 금지): `transferDate`, `filingDate`, `contractTotalPrice`, `bundledSaleMode`, `annualBasicDeductionUsed`(§103 기본공제 연간한도, 사람 단위).
  - **legacy 마이그레이션** (기존 L340-341 보강):
    - `primaryAsset.addressRoad/Jibun/Detail/BuildingName/Longitude/Latitude ← legacy.propertyAddress*` 전부 이관.
    - `primaryAsset.reductionType / 관련 감면 필드 ← legacy.reductionType / 관련 필드` 이관 (주자산에만 복원).
  - `makeDefaultAsset`에 위 신규 필드 기본값 추가(모두 `""` / `"0"` / `false` / `null` / `"metropolitan"` 중 적절값).
  - `INITIAL_FORM`에서 이관된 루트 필드들 삭제.

### (B) Step 파일
- **`app/calc/transfer-tax/steps/Step1.tsx`** (현 92줄)
  - 최상단 `transferDate/filingDate` 2열 그리드 블록 추가(Step2 L47-77 이식).
  - `CompanionAssetsSection` 호출은 유지. 자산 카드 내부 구조는 (C) 참조.
- **`app/calc/transfer-tax/steps/Step2.tsx`** → **파일 삭제**.
- **`app/calc/transfer-tax/steps/Step3.tsx`** (568줄 → **대폭 축소**)
  - 이름은 유지하되 컨테이너 컴포넌트에서 "Step2" 위치로 인덱스 조정.
  - 제목 주석을 "고급 취득정보·특례"로 갱신(L10-14).
  - **필지 분기 블록(L276-285) 제거** — 필지 입력은 Step1 자산 카드로 이동.
  - **환산취득가 공시가격 조회 블록(L339-465, 약 127줄) 제거** — 공시가격 조회는 Step1 자산 카드로 이동.
  - 상단에 **Step1 입력값 요약** 영역 추가: 각 자산별로 라벨·취득원인·취득일·취득가·취득시 기준시가·양도시 기준시가·조정지역(주택 한정)을 1~2줄 요약 (읽기전용, 수정은 Step1로 돌아가도록 안내).
  - 잔존 로직: `acquisitionMethod` 라디오, `appraisalValue`, `Pre1990LandValuationInput`, 신축·증축 가산세, `getDefaultPriceYear` (pre1990/신축 관련 UI에서 재사용 여부 확인 후 유지/이동).
  - `form.propertyAddress*` 참조(L124/128/135/166/176/193/250/255/258/263/378/422/441)는 공시가격 조회 블록과 함께 모두 제거되므로 대체 불필요. 남은 참조는 없어야 함.
- **`app/calc/transfer-tax/steps/Step4.tsx`**
  - L32/L82/L110의 조정지역 조회 호출·표시 로직을 **자산 카드로 이관**. Step4에서는 `assets[i].isRegulatedAreaAtAcq / isRegulatedAreaAtTransfer`를 **읽기 전용으로 표시**하고 중과세율 판정에 활용.
  - 일괄양도 시 자산별 조정지역 결과를 표로 요약.
- **`app/calc/transfer-tax/steps/Step5.tsx`** (255줄 → 자산별 루프 + 5년 한도 영역으로 전면 재설계)
  - 기존: `form.reductionType` 루트 **라디오 1개**. 조건부 서브패널 4종(`self_farming`/`long_term_rental`/`public_expropriation`/`new_housing & unsold_housing`) 모두 루트 필드 갱신.
  - 신규 UI 골자:
    1. 자산별 섹션 루프: `form.assets.map((asset, i) => <AssetReductionSection key={asset.assetId} asset={asset} onChange={(patch) => updateAsset(i, patch)} />)`.
    2. 각 자산 섹션 내부에 **체크박스 5종**(self_farming / long_term_rental / new_housing / unsold_housing / public_expropriation) — 라디오 금지. 선택된 감면마다 독립 서브패널 펼침.
    3. 자산 섹션 하단: "유효 감면 프리뷰" — 엔진 §127② 규칙(combinable 그룹 sum + 나머지 max)을 클라이언트에서 재현하여 어느 감면이 실제 반영되는지 표시.
    4. 인별 5년 합산 한도 영역(전역 1회): `priorReductionUsage[]` 다이내믹 리스트 입력 — 연도 / 감면유형 / 감면액 + [추가]/[삭제] 버튼. 상단 안내: "최근 5과세연도 감면합계가 §133 한도를 초과하면 초과분은 당해 감면에서 자동 차감됩니다".
    5. 하단 계약 공통: `annualBasicDeductionUsed`(사람 단위 §103 기본공제) + §127② / §133 안내 배너 + "연간(당해) 한도 / 5년 누적 한도" 2단 표시.
  - 각 서브패널을 자산별 필드에 바인딩: `asset.reductions[k].type` 체크박스, `asset.reductions[k].farmingYears` / `.rentalYears` 등 타입별 서브필드.
  - 선택 해제 시 해당 감면 객체를 `asset.reductions[]` 배열에서 즉시 제거(빈 서브필드 남기지 않음).

### (C) 자산 입력 UI — 리스트+Sheet 패턴 전환 (대규모)
- **`components/ui/sheet.tsx`** (신규) — shadcn Sheet 컴포넌트 추가(`npx shadcn@latest add sheet`). 프로젝트 내 최초 도입.
- **`components/calc/transfer/CompanionAssetsSection.tsx`** (48줄 → 재설계)
  - 기존: 자산 카드 세로 나열.
  - 신규: **자산 리스트 요약 뷰** — 각 자산을 1줄 요약 카드(라벨·종류·주소·양도가액·취득원인 축약) + [편집]/[삭제] 버튼. 하단에 [+ 자산 추가] 버튼.
  - 편집/추가 클릭 시 `AssetEditSheet`(신규) 열고, 임시 state에 자산 1건을 복제 → 저장 시 `assets[i]`에 커밋, 취소 시 폐기.
- **`components/calc/transfer/AssetEditSheet.tsx`** (신규) — 자산 1건 편집 전용 Sheet 컨테이너.
  - 내부에 기존 `CompanionAssetCard`의 입력 블록을 재배치(주소·취득·공시가격·조정지역·다필지 등).
  - Sheet 하단 [취소]/[저장] 버튼으로 커밋 제어. 입력 중 다른 자산을 실수로 건드리지 않도록 격리.
- **`components/calc/transfer/CompanionAssetCard.tsx`** (293줄) — 역할 축소
  - 리스트 요약 카드(Summary Row)와 편집 Sheet 본문(AssetEditBody)으로 **2분할**.
  - `CompanionAssetSummaryRow.tsx` / `CompanionAssetEditBody.tsx` 2개 파일로 쪼개면 800줄 제한 준수 가능.
  - 편집 본문은 아래 블록 파일들을 조합.

- **신규 파일들** (CompanionAcq*Block.tsx 패턴 계승):
  - **`components/calc/transfer/CompanionAddressBlock.tsx`** — `AddressSearch` 래퍼. 자산별 주소 state 바인딩.
  - **`components/calc/transfer/CompanionStandardPriceBlock.tsx`** — 취득시·양도시 기준시가 조회. 
    - 기존 Step3.tsx L339-465(환산취득가 공시가격 조회) 로직을 자산별 props로 이식.
    - 조회 API: `/api/address/standard-price` — `assets[i].addressJibun + addressDetail`를 사용. 취득연도는 `assets[i].acquisitionDate`, 양도연도는 `form.transferDate`.
    - 결과 저장: `assets[i].standardPriceAtAcq / standardPriceAtAcqLabel / standardPriceAtTransfer / standardPriceAtTransferLabel`.
    - `useEstimatedAcquisition` 체크박스와의 통합 처리: 환산취득가 사용 여부는 Step3 `acquisitionMethod` 라디오에서 단일 결정. 자산 카드는 언제든 기준시가를 조회·저장할 수 있고, Step3에서 "환산" 선택 시 그 값을 읽어 씀.
  - **`components/calc/transfer/CompanionRegulatedAreaBlock.tsx`** — `assetKind === "housing"` 전용.
    - 조회 API: `/api/address/regulated-area` — `assets[i].addressRoad || addressJibun`, `acquisitionDate`, `form.transferDate`.
    - 결과 저장: `assets[i].isRegulatedAreaAtAcq / isRegulatedAreaAtTransfer`.
    - Step4 중과 판정에서 이 필드를 읽음.
  - **`components/calc/transfer/CompanionParcelBlock.tsx`** — `assetKind === "land"` 전용. `ParcelListInput`을 자산별 `parcels`에 바인딩한 래퍼.

- **`components/calc/transfer/CompanionAcqPurchaseBlock.tsx`**
  - `standardPriceAtAcq` 입력란 제거(공시가격 조회 블록이 자산 카드에 신설되므로 중복 입력 제거).
  - `useEstimatedAcquisition` 체크박스 제거 — Step3 `acquisitionMethod` 라디오가 단일 진실원.

- **`components/calc/inputs/ParcelListInput.tsx`**
  - props·내부 로직 그대로 재사용. 부모(`CompanionParcelBlock`)에서 `assets[i].parcels`를 props로 전달.

- **신규 감면 컴포넌트 (Step5 자산별 재설계용)**:
  - **`components/calc/transfer/AssetReductionSection.tsx`** (신규) — 자산 1건의 감면 선택 + 서브패널 오케스트레이터.
    - props: `asset: AssetForm`, `onChange: (patch: Partial<AssetForm>) => void`, `isPrimary?: boolean`.
    - 감면 종류 **체크박스(5종, 다중 선택 허용)** + 선택된 감면별 서브블록 렌더.
    - 체크 시 `asset.reductions`에 해당 type의 기본 객체 push, 체크 해제 시 filter 제거.
    - 선택된 감면이 §127② combinable 화이트리스트에 해당하면 "중복 적용 가능" 뱃지 표시, 아니면 "최대 1건 실제 적용" 경고 뱃지 표시(체크는 자유롭게 하되 엔진이 max 선택한다는 안내).
  - **`components/calc/transfer/PriorReductionUsageInput.tsx`** (신규) — 인별 5년 감면 이력 입력.
    - props: `value: { year: number; type: ReductionType; amount: number }[]`, `onChange: (v) => void`.
    - 행별 입력: 연도(최근 5년 드롭다운 또는 NumberInput) / 감면유형(select 5종) / 감면액(CurrencyInput). 행 추가/삭제 가능.
  - **`components/calc/transfer/ReductionSelfFarmingBlock.tsx`** — farmingYears + useSelfFarmingIncorporation + decedentFarmingYears + `SelfFarmingIncorporationInput` 래퍼.
  - **`components/calc/transfer/ReductionLongTermRentalBlock.tsx`** — rentalYears + rentIncreaseRate + rentalReductionDetails.
  - **`components/calc/transfer/ReductionNewHousingBlock.tsx`** — reductionRegion 3지선다 + newHousingDetails(optional). unsold_housing과 공용.
  - **`components/calc/transfer/ReductionPublicExpropriationBlock.tsx`** — cash, bond, bondHoldingYears, approvalDate.
  - `components/calc/inputs/SelfFarmingIncorporationInput.tsx` — 기존 컴포넌트 props 시그니처가 루트 필드를 기대할 가능성 → 자산별 props로 확장(내부 로직은 동일).

### (D) 검증·API·엔진 레이어
- **`lib/calc/transfer-tax-validate.ts`**
  - `form.parcelMode`/`form.parcels` 분기를 **`assets[i].parcelMode`/`assets[i].parcels`** 로 자산별 루프 검증.
  - 기존 `form.reductionType === "public_expropriation"` 단일 검증을 **자산별 루프**로 변경: `form.assets.forEach(asset => asset.reductions.forEach(r => { if (r.type === "public_expropriation") ...cash/bond 필수 검증; if (r.type === "self_farming") ...farmingYears 필수 검증 }))`.
  - `priorReductionUsage[]` 입력 검증(연도 범위, 금액 음수 금지).
- **`lib/calc/transfer-tax-api.ts`** (핵심 변경)
  - `parcelModeActive` 판정을 `form.assets[i].parcelMode` 자산별로 수정.
  - **루트 `form.reductionType` 기반 감면 배열 조립** 로직 완전 제거. `buildAssetPayload`가 자산의 `asset.reductions[]`(복수)를 5종 모두 커버하도록 확장(기존은 self_farming 1종만).
  - discriminatedUnion 타입별 분기 시 `never` 체크로 누락 방지.
  - payload: `body.reductions = primary.reductions.map(toEngine)` + `body.companionAssets[i].reductions = companion[i].reductions.map(toEngine)`.
  - `body.priorReductionUsage = form.priorReductionUsage`(루트 그대로 전달).
- **`lib/calc/multi-transfer-tax-api.ts`**
  - `form.reductionType` 루트 참조 제거, 자산별 `asset.reductions[]`에서 빌드.
  - 기존에 누락된 **public_expropriation 처리 보강** 필수.
- **`lib/api/transfer-tax-schema.ts`**
  - `reductionSchema` 5종 discriminated union 이미 존재, `propertyBaseShape.reductions`/`companionAssetSchema.reductions` 이미 자산별 배열 — 스키마 변경 없음.
  - **신규 추가**: 루트 레벨 `priorReductionUsage: z.array(z.object({ year: z.number().int().min(1990).max(...), type: z.enum([...5종]), amount: z.number().int().nonnegative() })).default([])`.
- **`app/api/calc/transfer/route.ts`**
  - `priorReductionUsage`를 엔진 호출 시 `TransferTaxInput.priorReductionUsage`로 전달.
  - companionAssets reductions Date 변환 경로는 기존대로 유지.

#### 엔진 신규·변경 (법령 정확성)
- **`lib/tax-engine/types/transfer-tax.types.ts`** — `TransferTaxInput`에 신규 필드:
  - `priorReductionUsage?: { year: number; type: TransferReductionType; amount: number }[]` — 지난 4개 과세연도 감면세액 이력.
- **`lib/tax-engine/legal-codes/transfer.ts`** — 상수 추가:
  - `REDUCTION_COMBINABLE_GROUPS`: §127② 단서 허용 조합 그룹. 예) `[["self_farming", "public_expropriation"]]` (8년 자경 §69 + 공익수용 §77). **실제 조합은 법령·판례 재확인 후 확정**(플랜 실행 시 `inheritance-gift-tax-credit-senior` 또는 `transfer-deduction-senior` 에이전트에 검증 요청).
  - `FIVE_YEAR_REDUCTION_LIMITS`: §133 5년 누적 한도 금액(그룹별 2억/3억 등).
- **`lib/tax-engine/transfer-tax-rate-calc.ts`** — `calcReductions` 리팩토링:
  - 현재 `candidates.reduce((a,b) => a.amount >= b.amount ? a : b)` 단일 max 선택 → 
  - 신규: (1) `REDUCTION_COMBINABLE_GROUPS`에 속한 후보들은 **그룹 단위 sum**, (2) 그룹 외 후보는 max 선택, (3) combined 그룹 결과와 비-combined max 를 **최종 비교하여 가장 유리한 한 세트** 반환.
  - 반환값에 어떤 감면이 채택되었는지 메타데이터(`appliedReductions: TransferReductionType[]`) 포함 — UI 프리뷰/안내에 사용.
- **`lib/tax-engine/aggregate-reduction-limits.ts`** — 신규 함수:
  - `applyFiveYearLimits({ currentYearAmountsByType, priorReductionUsage, limits })`:
    1. 각 감면 유형별로 "과거 4개 연도 + 당해" 누적액 계산.
    2. 유형별 5년 한도 대비 초과분 → 당해분에서 비율 차감.
    3. 결과에 "차감 전/후" 및 "연도별 사용 이력"을 포함해 UI 사이드패널 표시용으로 리턴.
  - 기존 `applyAnnualLimits`는 유지. 호출 순서: 계산 엔진이 `applyAnnualLimits` → `applyFiveYearLimits` 순으로 적용.
  - 파일 맨 위 주석 "5년 누적 한도는 호출 측에서..." 제거.
- **테스트 신설 필수**:
  - `combinable-reduction-group.test.ts`: 자경 + 수용 동시 충족 시 sum으로 산출, 자경 + 장기임대(비combinable)는 max 유지 검증.
  - `five-year-cumulative-limit.test.ts`: priorReductionUsage 입력 시 한도 초과분 차감 검증.

### (E) 테스트
- **엔진 테스트 회귀**: 기존 파일(`multi-parcel-transfer.test.ts`, `exchange-land-integration.test.ts`, `pdf-ex08-aggregation-self-farming.test.ts`, `new-housing-reduction.test.ts`, `rental-housing-reduction.test.ts`, `self-farming-reduction.test.ts`, `public-expropriation-reduction.test.ts`, `exemption-rules.test.ts`, `transfer-tax-aggregate.test.ts`, `transfer-tax/reductions-and-exempt.test.ts`) — 단일 자산·단일 감면 케이스는 **기대 결과 불변**.
- **라우트 통합 테스트** (`__tests__/api/transfer.route.bundled.test.ts`): 자산별 `reductions` 배열 payload 회귀 확인.
- **신규 테스트 필수**:
  - `combinable-reduction-group.test.ts` (엔진): 
    - 케이스1: 자경(§69) + 수용(§77) 동시 충족 → 합산 감면 적용.
    - 케이스2: 자경(§69) + 장기임대(§97) → max 선택(비-combinable).
    - 케이스3: 자경 + 수용 + 장기임대 → combinable 그룹 sum vs 장기임대 max 중 유리한 것.
  - `five-year-cumulative-limit.test.ts` (엔진):
    - 케이스1: priorReductionUsage 빈 배열 → 연간 한도만 적용(기존 동작).
    - 케이스2: 과거 4년 누적이 이미 5년 한도의 70% → 당해 감면의 일부만 적용되고 초과분 차감.
    - 케이스3: 5년 한도 전액 소진 → 당해 감면 0 반환 + 경고 메타데이터.
  - `transfer-tax-api.multi-reduction.test.ts` (Form→API): 자산 2개에 각각 다른 감면(자산1 self_farming+public_expropriation, 자산2 long_term_rental) 설정 → `companionAssets[i].reductions`가 올바르게 조립되는지.
  - `calc-wizard-store.migration.test.ts` (스토어): 기존 루트 `reductionType`/`propertyAddress*`를 가진 localStorage payload가 primaryAsset으로 정확히 마이그레이션되는지.
- **기존 테스트 확장**:
  - `pdf-ex08-aggregation-self-farming.test.ts`: 한 명이 수용+자경을 동시에 적용받은 사례가 있다면 combinable 검증으로 확장.

### (F) 컨테이너 / 스텝 제어 / Sheet 상태
- **`app/calc/transfer-tax/TransferTaxCalculator.tsx`**, **`MultiTransferTaxCalculator.tsx`**
  - StepWizard 스텝 배열에서 Step2 엔트리 제거, **1스텝 감소**.
  - 신 스텝 라벨: "① 자산 입력(양도·주소·공시가·조정지역·다필지) → ② 고급 취득정보·특례 → ③ 보유상황 → ④ 감면·공제 → ⑤ 결과".
  - legacy 인덱스 리맵: 기존 URL `?step=2`(구 양도정보)는 신 Step1로, `?step=3→2, 4→3, 5→4`로 매핑.
- **AssetEditSheet 상태 관리** (`CompanionAssetsSection.tsx` 내부):
  - 로컬 React state: `editingIndex: number | null` + `draftAsset: AssetForm | null`(선택된 자산의 깊은 복사본).
  - [편집] 클릭: `draftAsset = structuredClone(assets[index])`, Sheet open.
  - [+ 자산 추가] 클릭: `draftAsset = makeDefaultAsset(...)`, Sheet open, editingIndex = null.
  - Sheet 내부 모든 onChange는 **`setDraftAsset` 로컬 상태만 업데이트** — 글로벌 zustand store는 건드리지 않음.
  - [저장]: editingIndex가 null이면 `assets.push(draft)`, 아니면 `assets[editingIndex] = draft` → onChange(assets) 일괄 커밋 후 Sheet close.
  - [취소] 또는 Sheet 외부 클릭: draftAsset을 변경했는지 확인 후 "저장하지 않은 변경사항이 있습니다. 닫으시겠습니까?" confirm 경고.
  - 모바일 대응: Sheet `side="right"` on desktop, `side="bottom"` on mobile(shadcn Sheet 기본 동작 활용).

---

## 중요 결정사항 (플랜 채택안)

1. **Step 개수**: 5 → 4. Step2 파일 삭제.
2. **주소·조회 전면 자산별 이관**:
   - `form.propertyAddress*` 완전 제거, 주소는 `assets[i].*` 로만 보관.
   - **공시가격 조회(`/api/address/standard-price`)**: 각 자산 카드 내부 블록에서 자산별로 조회·저장. 일괄양도 시 자산마다 독립 조회.
   - **조정대상지역 조회(`/api/address/regulated-area`)**: **주택 자산(`assetKind === "housing"`) 전용**으로 자산 카드 내부에 노출. 토지·건축물·주식 등은 노출하지 않음.
   - 이유: (a) 일괄양도(아파트+상가 등)에서 자산마다 주소·용도가 달라 주자산 한 건으로는 정확성 부족, (b) 조정지역 중과는 주택에만 적용되므로 주택만 조회, (c) API 결과를 자산 state에 저장해 Step3/Step4 계산에서 직접 참조 가능.
3. **다필지 토글 위치**: 각 자산 카드 내부(assetKind==="land"일 때만). 제목은 **"취득시기 상이"**, `parcelMode`/`parcels` 는 `AssetForm`으로 이동.
4. **Step3 중복 제거**: Step1 PurchaseBlock에서 `standardPriceAtAcq` + `useEstimatedAcquisition` 체크박스 제거. `acquisitionMethod` 라디오(Step3)가 단일 진실원. 환산취득가 조회 UI 자체는 Step3에서 Step1 자산 카드로 이전.
5. **Step3 상단 요약**: Step1 입력값(취득·기준시가·조정지역 조회 결과 포함)을 자산별로 읽기전용 요약 블록으로 표시. 수정은 Step1로 돌아가도록 안내.
6. **Step4 재정의**: 조정지역 조회 UI 제거. 자산별 조회 결과를 요약 표시만 하고 중과 판정에 사용.
7. **감면 자산별 이관 + 복수 감면 허용(Step5 재설계)**:
   - `form.reductionType` 루트 단일 선택 → `assets[i].reductions: AssetReductionForm[]` 자산별 **배열**. 5종(self_farming / long_term_rental / new_housing / unsold_housing / public_expropriation) 전부 자산별 **다중 선택** 가능.
   - 서브 필드 18개는 각 감면 객체 내부로 이관(discriminated union).
   - 스키마·라우트는 이미 자산별 `reductions: TransferReduction[]` 배열을 소비 — 스키마 변경 없음. 클라이언트 변환·스토어·UI만 수정.
   - **§127② 중복배제 재설계**: 단일 자산 내 유리한 1건만 선택하는 기존 max 로직 → "combinable 그룹은 sum + 비-combinable은 max" 로직으로 재작성. `REDUCTION_COMBINABLE_GROUPS` 상수가 §127② 단서의 "중복 적용 가능한 조합"을 선언적으로 관리.
   - **§133 한도 2단 적용**: 연간 한도(기존 `applyAnnualLimits`)는 유지, 5년 누적 한도는 `applyFiveYearLimits` 신규 구현. UI에서 `priorReductionUsage` 이력 입력을 받아 엔진으로 전달.
   - **UX**: 자산 카드별 **체크박스 5종 다중 선택**. combinable 조합은 뱃지로 "중복 적용 가능" 표시, 비-combinable 다중 선택은 "유리한 1건만 실제 적용" 경고 — 사용자가 여러 개 체크해도 엔진이 §127②/§133에 따라 자동 처리.
   - `annualBasicDeductionUsed`(사람 단위 §103)는 루트 유지.

8. **자산 입력 격리(Sheet 패턴)**:
   - 자산 카드 연속 나열(스크롤 지옥) 대신 **리스트 요약 + AssetEditSheet** 패턴으로 전환.
   - 한 번에 자산 1건만 집중 편집, 임시 state에 격리되어 [취소] 시 원본 보존.
   - shadcn Sheet를 프로젝트에 최초 도입(`components/ui/sheet.tsx`).

## 재사용 대상 (기존 함수/컴포넌트)

- `AddressSearch` (`components/ui/address-search.tsx`) — 자산 카드로 위치만 이동.
- `DateInput` — Step1 최상단 `transferDate/filingDate`에 재사용.
- `getFilingDeadline`, `isFilingOverdue` (`lib/calc/filing-deadline.ts`) — Step1 최상단에서 그대로 사용.
- `ParcelListInput` — 자산 카드 내부로 이동, props 변경 없음.
- `makeDefaultAsset` (store) — `parcelMode/parcels/address*` 기본값 확장.

## 검증 (Verification)

1. **타입 검증**: `npx tsc --noEmit`
2. **단위 테스트**: `npm test __tests__/tax-engine/multi-parcel-transfer.test.ts __tests__/tax-engine/exchange-land-integration.test.ts`
3. **API 테스트**: `npm test __tests__/api/transfer.route.bundled.test.ts`
4. **전체 회귀**: `npm test` (73파일/1,407 케이스 그린 확인)
5. **개발 서버 수동 체크**:
   - `npm run dev` → `/calc/transfer-tax` 진입.
   - (a) Step1 최상단에 양도일·신고일 표시.
   - (b) 자산 리스트에서 [+ 자산 추가] 클릭 → Sheet 열림, 자산 1건 격리 입력 → [저장] 시 리스트 반영.
   - (c) 자산 Sheet 안에 소재지 검색이 최상단, 주택 자산일 때만 조정대상지역 조회 블록 노출, 비주택(토지·건축물·주식)에는 미노출.
   - (d) 각 자산 Sheet에서 공시가격 조회 버튼 클릭 → 취득시/양도시 기준시가 독립 저장 확인.
   - (e) 토지 자산 Sheet에만 "취득시기 상이" 토글 노출 → ON 시 필지 입력.
   - (f) Sheet 입력 중 [취소] 클릭 → 저장하지 않은 변경 경고, 원본 자산 미변경.
   - (g) 일괄양도(자산 2개 이상) 시 자산별 조회 결과가 서로 독립되는지 확인.
   - (h) 총 4스텝으로 진행.
   - (i) Step2(신)에서 Step1 요약 표시, 취득가 산정 방식·감정가·pre1990·신축 가산세 정상 동작.
   - (j) Step3(신)에서 자산별 조정지역 조회 결과가 중과 판정에 반영.
   - (k) Step4(신) 감면 — 자산별 체크박스 5종 동시 선택 가능.
     - (k-1) 자산1에 self_farming + public_expropriation 동시 체크 → 프리뷰에 "중복 적용 가능" 뱃지와 합산된 감면액 표시.
     - (k-2) 자산2에 self_farming + long_term_rental 동시 체크 → "유리한 1건만 실제 적용" 경고 + 엔진이 max 선택한 값 프리뷰.
   - (l) 인별 5년 합산 한도 영역 — priorReductionUsage에 과거 감면액 입력 → 당해 감면 합계가 5년 한도 초과 시 초과분 차감 경고 표시, 결과 페이지에서 차감된 감면액 반영.
   - (m) 마법사 완주 후 단일 감면만 선택한 케이스는 종전 5스텝 결과와 **동일**. 복수 감면/5년 한도 케이스는 신규 기대값 확인.
   - (n) localStorage에 저장된 구 버전 payload(루트 `reductionType`, `propertyAddress*`) 로드 → 1번 자산으로 마이그레이션되고 UI가 정상 표시.
6. **Supabase 이력**: 로그인 상태에서 계산 저장 → 이력에서 불러오기 시 복원 정상(특히 복수 감면·5년 이력 필드).

## 위험·유의점

- `form.propertyAddress*` 제거 시 **localStorage에 저장된 기존 세션** 호환 깨짐 가능 → store의 `migrate` 함수(L340-341 legacy 마이그레이션 로직)에 **propertyAddress → assets[0].address·addressDetail·buildingName·longitude·latitude** 전부 이관 규칙을 추가.
- `CompanionAssetCard.tsx` 293줄 + 주소·공시가격·조정지역·parcelMode 블록 추가 시 **800줄 정책 초과 거의 확실** → `CompanionAddressBlock`, `CompanionStandardPriceBlock`, `CompanionRegulatedAreaBlock`, `CompanionParcelBlock` 4개 파일 선제 분리 필수.
- 일괄양도 시 **자산별 조회 API 호출 건수 증가**: 자산 N개 × (공시가격 취득·양도 2회 + 주택 시 조정지역 1회) → 최대 3N 호출. 사용자가 "조회" 버튼을 자산별로 누르는 UX(자동 호출 금지)로 방어, rate-limit 초과 방지.
- 조정대상지역 조회는 **주택 전용**. 비주택 자산에 `isRegulatedAreaAtAcq/Transfer`는 `null`로 유지되어 Step4 중과 판정에서 False 처리. Step4 중과 로직의 null 처리 분기 검증 필요.
- 공시가격 조회 결과의 시점 불일치: `acquisitionDate` 변경 시 이전 조회 결과(`standardPriceAtAcq`)를 무효화하는 기존 effect(Step3 L82-100)를 자산 카드 내부로 이식. 양도일 변경 시에도 모든 자산의 `standardPriceAtTransfer` 초기화.
- 기존 사용자가 Step2 URL(예: `?step=2`) 북마크한 경우 인덱스가 밀려 깨짐 → `TransferTaxCalculator`의 step 쿼리 파싱에서 legacy 인덱스 리맵 고려.
- Step4 중과 판정(`isRegulatedArea` 기반 세율 분기)은 기존에 `form.propertyAddress*` 1회 조회로 처리되었으나, 이제 `assets[i].isRegulatedAreaAtAcq/Transfer` 자산별 flag로 전환. 엔진 계산 레이어(`lib/tax-engine/transfer-tax.ts`, `multi-transfer-*.ts`)의 `isRegulatedArea` 입력 경로를 자산별로 바꿔야 함 — 이 플랜 범위에 포함.
- **감면 자산별 이관 위험**:
  - `transfer-tax-api.ts`의 `buildAssetPayload`가 현재 self_farming만 companion에 실어주는 부분을 5종 전부로 확장할 때, discriminatedUnion 타입 분기를 빠짐없이 커버하는지 타입 컴파일로 검증. TS `never` 체크 활용.
  - `multi-transfer-tax-api.ts`에 **public_expropriation 처리가 누락**되어 있음 — 감면 이관과 동시에 보강 필수.
  - 루트 감면 필드를 저장한 기존 localStorage 세션(`form.reductionType === "long_term_rental"` 등)을 불러오면 신 UI에서 찾을 수 없음 → legacy 마이그레이션에서 반드시 `primaryAsset.reductions[0]`로 이관. 서브 필드 18개는 각 감면 type별 객체로 분배.
  - `SelfFarmingIncorporationInput.tsx` 등 기존 감면 서브 컴포넌트가 루트 필드를 직접 수정하는 패턴이면 자산 스코프 props로 확장 필요.

- **§127② combinable 화이트리스트 법령 정확성** (최우선 리스크):
  - 본 플랜은 "자경(§69) + 공익수용(§77)" 조합을 예시로 들었으나, 실제 §127② 단서의 중복 허용 조합은 연도별·특례별로 다르며 조세특례제한법 집행기준·유권해석에 흩어져 있음.
  - `REDUCTION_COMBINABLE_GROUPS` 상수를 구현하기 전에 **반드시** `transfer-deduction-senior` 또는 `inheritance-gift-tax-credit-senior` 에이전트에 최신 조특법 §127② 원문 + 집행기준을 조회하여 정확한 허용 조합 목록을 확보할 것.
  - 테스트에 법령 조문 링크(조문 번호·고시 일자)를 주석으로 남겨 향후 개정 추적 가능하도록.

- **§133 5년 누적 한도 구현 리스크**:
  - 한도 금액·그룹(주택/토지/사업용 등)이 세법 개정으로 변동 → `FIVE_YEAR_REDUCTION_LIMITS`를 DB `tax_rates` 테이블로 빼서 관리할지 검토(본 플랜은 legal-codes 상수로 시작하되 마이그레이션 여지 명시).
  - `priorReductionUsage` 입력을 사용자가 누락/오기재할 가능성 → "선택 입력, 미입력 시 0으로 처리, 초과 위험 시 경고" UX로 완화.
  - 엔진 내부에서 `applyAnnualLimits` → `applyFiveYearLimits` 순서로 적용될 때 이중 차감/순환 계산 주의. 유닛 테스트로 보증.

- **Sheet UX 리스크**:
  - Sheet 외부 클릭·ESC·뒤로가기 시 draftAsset 변경분 유실 → `beforeunload` 또는 confirm 경고로 방어.
  - shadcn Sheet가 프로젝트 최초 도입이라 Tailwind v4·React 19와의 호환성 선검증 필수(`npx shadcn@latest add sheet` 후 타입/렌더 확인).
  - Sheet 내부에 AddressSearch(자동완성 팝오버)·Dialog(공시가격 조회 결과 등) 중첩 포털 충돌 가능 → z-index·portal container 정리.
  - 모바일에서 Sheet가 `side="bottom"` 시 내부 스크롤이 길어짐 → 탭/아코디언으로 섹션 구분 고려.

- **테스트 커버리지 공백**:
  - 자산 2개에 서로 다른 감면을 각각 적용한 E2E 시나리오가 현재 테스트셋에 없음 → 상기 `transfer-tax-api.multi-reduction.test.ts` 신규 + `pdf-ex08-aggregation-self-farming.test.ts` 확장.
  - 체크박스 다중 선택 UI의 Playwright/유저 레벨 E2E는 현재 인프라 부재 — 수동 체크로 대체하되, 스토어·엔진 레벨 유닛 테스트로 최대한 커버.

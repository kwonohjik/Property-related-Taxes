# Design (UI 편): 비사업용 토지 판정 UI

> **Parent Design**: `nbl-ui-completion.design.md`
> **작성일**: 2026-04-24
> **범위**: UI 컴포넌트 구조·props·플로우·결과 카드 개편

---

## 1. 컨테이너 플로우

```
Step4.tsx
└─ NblSectionContainer
   ├─ [토글] "비사업용 토지 상세 판정 활성화"  (nblUseDetailedJudgment)
   │
   └─ (활성화 시)
      ├─ UnconditionalExemptionSection                 ← 최우선 노출
      │   └─ 7종 체크박스 (하나라도 체크되면 아래 섹션 음영 처리)
      │
      ├─ [지목 · 면적 · 용도지역]                        ← 공통 필드
      │
      ├─ ResidenceHistorySection                        ← 농지·임야·목장 공통
      │   └─ 거주이력 배열 + 주민등록 여부
      │
      ├─ (지목별 조건부 렌더링)
      │   ├─ FarmlandDetailSection      (nblLandType === "farmland")
      │   ├─ ForestDetailSection        (nblLandType === "forest")
      │   ├─ PastureDetailSection       (nblLandType === "pasture")
      │   ├─ HousingLandDetailSection   (nblLandType === "housing_site")
      │   ├─ VillaLandDetailSection     (nblLandType === "villa_land")
      │   └─ OtherLandDetailSection     (nblLandType === "other_land")
      │
      ├─ [도시편입일] [수도권 여부]                      ← 공통 지원 필드
      ├─ [공동상속 지분]                                ← 상속 케이스
      ├─ BusinessUsePeriodsInput                        ← 사업용 사용기간
      └─ GracePeriodSection                             ← 부득이한 사유
```

---

## 2. 컴포넌트 props 시그니처

모든 섹션 컴포넌트 공통:

```ts
interface NblSectionProps {
  form: TransferFormData;
  onChange: (patch: Partial<TransferFormData>) => void;
}
```

예외 — `SigunguSelect`:

```ts
interface SigunguSelectProps {
  value: string;
  valueName?: string;
  onChange: (code: string, name: string) => void;
  placeholder?: string;
  className?: string;
}
```

---

## 3. 무조건 면제 섹션

```tsx
<UnconditionalExemptionSection>
  <Title>무조건 사업용 토지 판정 (§168-14③)</Title>
  <Hint>아래 사유 중 하나라도 해당하면 이하 지목별 판정 없이 사업용으로 분류됩니다.</Hint>

  <Checkbox label="2006.12.31. 이전 상속받은 토지" bind="nblExemptInheritBefore2007">
    {checked && <DateInput bind="nblExemptInheritDate" label="상속일" />}
  </Checkbox>
  <Checkbox label="2007년 이전 20년 이상 보유" bind="nblExemptLongOwned20y" />
  <Checkbox label="직계존속 8년 자경 후 상속·증여 (비도시지역)" bind="nblExemptAncestor8YearFarming" />
  <Checkbox label="공익사업으로 수용" bind="nblExemptPublicExpropriation">
    {checked && <DateInput bind="nblExemptPublicNoticeDate" label="사업인정고시일" />}
  </Checkbox>
  <Checkbox label="공장 인접지 (구법 특례)" bind="nblExemptFactoryAdjacent" />
  <Checkbox label="종중 소유 + 2005.12.31. 이전 취득" bind="nblExemptJongjoongOwned">
    {checked && <DateInput bind="nblExemptJongjoongAcqDate" label="취득일" />}
  </Checkbox>
  <Checkbox label="도시지역 농지 종중·상속 5년 이내 양도 특례" bind="nblExemptUrbanFarmlandJongjoong" />

  {anyChecked && <Badge variant="info">엔진이 무조건 사업용으로 판정합니다 (§168-14③).</Badge>}
</UnconditionalExemptionSection>
```

---

## 4. 거주 이력 섹션

```tsx
<ResidenceHistorySection>
  <Title>소유자 거주 이력</Title>
  <Hint>
    농지 자경·임야 재촌 판정에 사용됩니다.
    <strong>임야의 경우 주민등록이 있어야 재촌이 인정됩니다.</strong>
  </Hint>

  {residenceHistories.map((h, idx) => (
    <Row key={idx}>
      <DateInput label="거주 시작일" bind={h.startDate} />
      <DateInput label="거주 종료일" bind={h.endDate} />
      <SigunguSelect label="시군구" code={h.sigunguCode} name={h.sigunguName} />
      <Checkbox label="주민등록 등재" bind={h.hasResidentRegistration} />
      <DeleteButton onClick={() => remove(idx)} />
    </Row>
  ))}
  <AddButton onClick={addResidence}>+ 거주지 추가</AddButton>

  <Hint variant="secondary">
    ⓘ 토지 소재 시군구 또는 인접 시군구와 일치하는 구간이 "재촌 기간"으로 산정됩니다.
  </Hint>
</ResidenceHistorySection>
```

---

## 5. 지목별 세부 섹션 (샘플)

### 5.1 임야

```tsx
<ForestDetailSection>
  <Title>임야 세부 정보</Title>

  <Checkbox label="산림경영계획 인가 (시장·군수)" bind="nblForestHasPlan" />
  <Checkbox label="공익림 (보안림·산림유전자원·시험림 등)" bind="nblForestIsPublicInterest" />
  <Checkbox label="문화재 보호림" bind="nblForestIsProtected" />
  <Checkbox label="임업후계자·독림가" bind="nblForestIsSuccessor" />
  <Checkbox label="상속 3년 이내 양도" bind="nblForestInheritedWithin3Years" />

  <InfoBox>
    ⓘ 임야는 <strong>주민등록 있는 재촌</strong>이 필수입니다. 거주 이력에 주민등록 체크를 확인하세요.
  </InfoBox>
</ForestDetailSection>
```

### 5.2 지목별 필드 체크리스트

#### 농지 (Farmland)
- [x] 직접 자경 (`nblFarmingSelf`)
- [x] 거리 fallback (`nblFarmerResidenceDistance`)
- [ ] 주말농장 (`nblFarmlandIsWeekendFarm`)
- [ ] 전용허가 + 허가일 (`nblFarmlandIsConversionApproved`, `nblFarmlandConversionDate`)
- [ ] 한계농지 (`nblFarmlandIsMarginalFarm`)
- [ ] 간척지 (`nblFarmlandIsReclaimedLand`)
- [ ] 공익사업용 (`nblFarmlandIsPublicProjectUse`)
- [ ] 질병·고령 임대 (`nblFarmlandIsSickElderlyRental`)

#### 임야 (Forest)
- [ ] 산림경영계획 (`nblForestHasPlan`)
- [ ] 공익림 (`nblForestIsPublicInterest`)
- [ ] 보안림·문화재 (`nblForestIsProtected`)
- [ ] 임업후계자 (`nblForestIsSuccessor`)
- [ ] 상속 3년 내 (`nblForestInheritedWithin3Years`)

#### 목장 (Pasture)
- [ ] 축산업 영위 (`nblPastureIsLivestockOperator`)
- [ ] 가축 종류 (`nblPastureLivestockType`)
- [ ] 두수 (`nblPastureLivestockCount`)
- [ ] 사육기간 배열 (`nblPastureLivestockPeriods`)
- [ ] 상속일 (`nblPastureInheritanceDate`)
- [ ] 특수조직 사용 (`nblPastureIsSpecialOrgUse`)

#### 주택 부속토지 (Housing Land)
- [ ] 수도권 여부 (`nblIsMetropolitanArea`)
- [ ] 주택 연면적 (`nblHousingFootprint`)

#### 별장 (Villa)
- [ ] 사용기간 배열 (`nblVillaUsePeriods`)
- [ ] 읍·면 소재 (`nblVillaIsEupMyeon`)
- [ ] 농어촌주택 (`nblVillaIsRuralHousing`)
- [ ] 2015.1.1. 이후 취득 (`nblVillaIsAfter20150101`)

#### 나대지 (Other Land)
- [ ] 재산세 분류 (`nblOtherPropertyTaxType`)
- [ ] 건물가액 (`nblOtherBuildingValue`)
- [ ] 토지가액 (`nblOtherLandValue`)
- [ ] 주택 관련 여부 (`nblOtherIsRelatedToResidence`)

---

## 6. 부득이한 사유 섹션

```tsx
<GracePeriodSection>
  <Title>부득이한 사유 유예기간 (§168-14①)</Title>
  <Hint>해당 기간은 사업용 사용 기간에 가산됩니다.</Hint>

  {gracePeriods.map((p, idx) => (
    <Row key={idx}>
      <Select
        label="사유"
        options={[
          { value: "inheritance", label: "상속으로 인한 부득이" },
          { value: "legal_restriction", label: "법령상 사용 제한" },
          { value: "sale_contract", label: "매매계약 중" },
          { value: "construction", label: "공사 중" },
          { value: "unavoidable", label: "질병·취학·근무상 형편" },
          { value: "preparation", label: "사업 준비 중" },
          { value: "land_replotting", label: "환지처분 대기" },
        ]}
      />
      <DateInput label="시작일" />
      <DateInput label="종료일" />
      <TextInput label="설명" />
    </Row>
  ))}
  <AddButton>+ 유예기간 추가</AddButton>
</GracePeriodSection>
```

---

## 7. 상태 전환 플로우

### 7.1 단순 → 상세 전환

```
[초기 상태]
  isNonBusinessLand: false
  nblUseDetailedJudgment: false

[사용자가 "상세 판정 활성화" 토글 ON]
  nblUseDetailedJudgment: true
  isNonBusinessLand: (기존 값 보존, 엔진에서 무시)
  → NblSectionContainer 펼침

[사용자가 지목 선택]
  nblLandType: "farmland"
  → FarmlandDetailSection 렌더, 다른 지목 섹션 숨김

[무조건 면제 체크]
  nblExemptInheritBefore2007: true
  → 지목별 섹션 음영 처리 (여전히 입력 가능)
  → Badge "사업용 확정 (§168-14③)"

[사용자가 "상세 판정 비활성화" 토글 OFF]
  nblUseDetailedJudgment: false
  → 기존 isNonBusinessLand 플래그로 복귀
  → 상세 필드 값은 폼에 보존 (재활성화 시 복원)
```

### 7.2 충돌 감지

```ts
if (form.nblUseDetailedJudgment && judgmentResult) {
  const engineJudged = judgmentResult.isNonBusinessLand;
  const userFlag = form.isNonBusinessLand;
  if (engineJudged !== userFlag) {
    showWarning("간단 체크박스 값과 엔진 판정이 다릅니다. 엔진 판정이 우선 적용됩니다.");
  }
}
```

---

## 8. 결과 카드 UI 변경

```
NonBusinessLandResultCard
├─ [최상단 요약 배너]
│  "이 토지는 비사업용 토지입니다 (§168-14③)."
│  "기본세율 +10%p 중과, 장기보유특별공제 배제됩니다."
│
├─ [무조건 면제 블록] (해당 시만)
│  Badge "무조건 사업용 — §168-14③1호"
│  Detail "2006.12.31. 이전 상속 (2004-05-15) + 2009.12.31. 이전 양도 조건 충족"
│
├─ [판정 단계 타임라인] (기존 유지)
│  Step 1: 지목 분류 → farmland ✓
│  Step 2: 무조건 면제 → 해당 없음 ✓
│  Step 3: 기간 기준 → ...
│  Step 4: 농지 판정 → ...
│
├─ [지목별 판정 근거] (신규)
│  농지: 총 거주 1,825일 / 자경 1,095일 / 재촌 1,825일
│
├─ [면적 안분] (해당 시 — 주택·목장)
│  [사업용 65% | 비사업용 35%] bar chart
│
├─ [유예기간 내역] (해당 시)
│  상속 유예: 2023-05-15 ~ 2026-05-14 (1,096일)
│
└─ [적용 조문 목록] (기존 유지)
   - 소득세법 §104조의3
   - 시행령 §168조의8
   - 시행령 §168조의14③
```

---

## 9. 마이그레이션 (UI 측)

zustand persist의 `migrate` 함수에 버전 bump:

```ts
persist(
  ...,
  {
    name: "transfer-form",
    version: 4,  // 기존 3 → 4
    migrate: (persistedState: any, version: number) => {
      if (version < 4) {
        return {
          ...persistedState,
          nblUseDetailedJudgment: false,
          nblLandSigunguCode: "",
          nblResidenceHistories: [],
          nblExemptInheritBefore2007: false,
          // ... 모든 신규 필드 기본값
        };
      }
      return persistedState;
    },
  },
)
```

---

## 10. 시군구 자동완성

### 10.1 데이터 소스
- 행안부 "행정표준코드" — 시군구 단위 (약 250개)
- 빌드타임 static 상수 (`lib/korean-law/sigungu-codes.ts`)
- 연 1회 업데이트 스크립트 (manual trigger)

### 10.2 자료 구조
```ts
export interface SigunguCode {
  code: string;       // "11110" (5자리)
  sidoName: string;   // "서울특별시"
  name: string;       // "종로구"
  fullName: string;   // "서울특별시 종로구"
  adjacentCodes: string[];  // 인접 시군구 (GIS 선계산)
}
```

### 10.3 인접 시군구 계산
GIS 전처리로 빌드타임 선계산. 경계 공유(Queen adjacency) + 직선거리 30km 이내. 도서지역(제주·울릉)은 자기 자신만.

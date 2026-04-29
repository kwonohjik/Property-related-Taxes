# Design: 검용주택 양도소득세 — UI 컴포넌트·결과 뷰 (분할)

**Main Doc**: `transfer-tax-mixed-use-house.design.md`
**Engine Doc**: `transfer-tax-mixed-use-house.engine.design.md`
**작성일**: 2026-04-29
**범위**: 입력 마법사 컴포넌트, 결과 뷰 4-카드 + 합산 카드, WizardSidebar 파생값 표시

---

## 1. UI 입력 마법사 (자산-수준)

### 1-A. AssetForm 자산 타입 옵션 추가

```tsx
// components/calc/transfer/AssetForm.tsx (수정)
const ASSET_TYPE_OPTIONS = [
  { value: "house", label: "주택" },
  { value: "commercial", label: "상가·일반건물" },
  { value: "land", label: "토지" },
  { value: "mixed-use-house", label: "검용주택 (주택+상가)" }, // 신규
];
```

자산 타입이 `mixed-use-house`로 변경되면 `MixedUseSection`이 자동 노출.

### 1-B. MixedUseSection (입력 진입점)

```tsx
// components/calc/transfer/MixedUseSection.tsx
export interface MixedUseSectionProps {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  errors?: Record<string, string>;
}

export function MixedUseSection({ asset, onChange, errors }: MixedUseSectionProps) {
  if (asset.assetType !== "mixed-use-house") return null;

  return (
    <SectionHeader title="검용주택 분리계산">
      <FieldCard
        label="검용주택 여부"
        helper="2022.1.1 이후 양도분: 주택 연면적 ≥ 상가 연면적이라도 분리계산"
        trailing={<LawArticleModal article={TRANSFER.MIXED_USE_RULE} />}
      >
        <Switch
          checked={asset.isMixedUseHouse ?? false}
          onCheckedChange={(v) => onChange({ isMixedUseHouse: v })}
        />
      </FieldCard>

      {asset.isMixedUseHouse && (
        <>
          <AreaInputs asset={asset} onChange={onChange} errors={errors} />
          <DateInputs asset={asset} onChange={onChange} errors={errors} />
          <StandardPriceInputs asset={asset} onChange={onChange} errors={errors} />
          <ResidencyInput asset={asset} onChange={onChange} errors={errors} />
        </>
      )}
    </SectionHeader>
  );
}
```

### 1-C. AreaInputs (면적 입력)

```tsx
// components/calc/transfer/mixed-use/AreaInputs.tsx
export function AreaInputs({ asset, onChange }: Props) {
  const total = parseNum(asset.residentialFloorArea) + parseNum(asset.nonResidentialFloorArea);
  const housingRatio = total > 0 ? parseNum(asset.residentialFloorArea) / total : 0;

  return (
    <>
      <FieldCard label="주택 연면적 (㎡)" helper="건축물대장 기준">
        <NumberInput
          value={asset.residentialFloorArea}
          onChange={(v) => onChange({ residentialFloorArea: v })}
          unit="㎡"
        />
      </FieldCard>

      <FieldCard label="상가 연면적 (㎡)" helper="비주택 합계 (근린·사무·주차장)">
        <NumberInput
          value={asset.nonResidentialFloorArea}
          onChange={(v) => onChange({ nonResidentialFloorArea: v })}
          unit="㎡"
        />
      </FieldCard>

      <FieldCard label="건물 정착면적 (㎡)" helper="1층 면적 = 부수토지 안분 기준">
        <NumberInput
          value={asset.buildingFootprintArea}
          onChange={(v) => onChange({ buildingFootprintArea: v })}
          unit="㎡"
        />
      </FieldCard>

      <FieldCard label="전체 토지 면적 (㎡)">
        <NumberInput
          value={asset.totalLandArea}
          onChange={(v) => onChange({ totalLandArea: v })}
          unit="㎡"
        />
      </FieldCard>

      <DerivedDisplay
        label="주택연면적 비율"
        value={`${(housingRatio * 100).toFixed(2)}%`}
      />
    </>
  );
}
```

### 1-D. DateInputs (분리 취득일 + PHD 토글)

```tsx
// components/calc/transfer/mixed-use/DateInputs.tsx
export function DateInputs({ asset, onChange }: Props) {
  return (
    <>
      <FieldCard label="토지 취득일" helper="사례14: 1992-01-01">
        <DateInput
          value={asset.landAcquisitionDate}
          onChange={(v) => onChange({ landAcquisitionDate: v })}
        />
      </FieldCard>

      <FieldCard label="건물 취득일 / 신축일" helper="사례14: 1997-09-12">
        <DateInput
          value={asset.buildingAcquisitionDate}
          onChange={(v) => onChange({ buildingAcquisitionDate: v })}
        />
      </FieldCard>

      <FieldCard
        label="개별주택가격 미공시 환산 (PHD)"
        helper="1992-2005 사이 취득 + 미공시 케이스에서 활성화 권유"
        trailing={<LawArticleModal article={TRANSFER.PHD_RULE} />}
      >
        <Switch
          checked={asset.usePreHousingDisclosure ?? false}
          onCheckedChange={(v) => onChange({ usePreHousingDisclosure: v })}
        />
        {asset.usePreHousingDisclosure && (
          <Notice variant="warning">
            검용주택의 PHD 적용 적합성은 사례별 검토가 필요합니다. 이미지5 사례는 단순 §97 환산 사용.
          </Notice>
        )}
      </FieldCard>
    </>
  );
}
```

### 1-E. StandardPriceInputs (양도시·취득시 기준시가)

```tsx
// components/calc/transfer/mixed-use/StandardPriceInputs.tsx
export function StandardPriceInputs({ asset, onChange }: Props) {
  const commercialLandArea = computeCommercialLandArea(asset);
  const transferCommercialLandPrice =
    parseNum(asset.mixedTransferLandPricePerSqm) * commercialLandArea;
  const transferCommercialTotal =
    transferCommercialLandPrice + parseNum(asset.mixedTransferCommercialBuildingPrice);

  return (
    <>
      <SectionSubheader>양도시 기준시가</SectionSubheader>
      <FieldCard
        label="개별주택공시가격"
        helper="주택건물+주택부수토지 일괄"
        trailing={<VworldButton year={getTransferYear()} type="house" />}
      >
        <CurrencyInput
          value={asset.mixedTransferHousingPrice}
          onChange={(v) => onChange({ mixedTransferHousingPrice: v })}
        />
      </FieldCard>

      <FieldCard label="상가건물 기준시가" helper="토지 제외, 국세청 고시">
        <CurrencyInput
          value={asset.mixedTransferCommercialBuildingPrice}
          onChange={(v) => onChange({ mixedTransferCommercialBuildingPrice: v })}
        />
      </FieldCard>

      <FieldCard
        label="개별공시지가 (원/㎡)"
        helper="상가부수토지 산정용"
        trailing={<VworldButton year={getTransferYear()} type="land" />}
      >
        <CurrencyInput
          value={asset.mixedTransferLandPricePerSqm}
          onChange={(v) => onChange({ mixedTransferLandPricePerSqm: v })}
        />
      </FieldCard>

      <DerivedDisplay
        label="상가부수토지 기준시가 (자동)"
        value={formatKrw(transferCommercialLandPrice)}
        formula="공시지가 × 상가부수토지 면적"
      />
      <DerivedDisplay
        label="상가부분 기준시가 합계 (자동)"
        value={formatKrw(transferCommercialTotal)}
      />

      <SectionSubheader>취득시 기준시가</SectionSubheader>
      <FieldCard
        label="개별주택공시가격"
        helper="PHD 토글 ON 시 자동 환산"
        disabled={asset.usePreHousingDisclosure}
      >
        <CurrencyInput
          value={asset.mixedAcqHousingPrice}
          onChange={(v) => onChange({ mixedAcqHousingPrice: v })}
        />
      </FieldCard>

      <FieldCard label="상가건물 기준시가" helper="신축 시점 (1997)">
        <CurrencyInput
          value={asset.mixedAcqCommercialBuildingPrice}
          onChange={(v) => onChange({ mixedAcqCommercialBuildingPrice: v })}
        />
      </FieldCard>

      <FieldCard label="개별공시지가 (원/㎡)" helper="토지 취득시점 (1992)">
        <CurrencyInput
          value={asset.mixedAcqLandPricePerSqm}
          onChange={(v) => onChange({ mixedAcqLandPricePerSqm: v })}
        />
      </FieldCard>

      <DerivedDisplay
        label="취득시 상가부수토지 기준시가 (자동)"
        value={formatKrw(parseNum(asset.mixedAcqLandPricePerSqm) * commercialLandArea)}
      />
    </>
  );
}
```

### 1-F. ResidencyInput (거주기간)

```tsx
// components/calc/transfer/mixed-use/ResidencyInput.tsx
export function ResidencyInput({ asset, onChange }: Props) {
  const years = parseNum(asset.residencePeriodYears);
  const tableSelected = years >= 2 ? 2 : 1;

  return (
    <FieldCard
      label="거주기간 (년)"
      helper="2년 이상이면 장기보유공제 표2 적용 (최대 80%)"
      trailing={<LawArticleModal article="시행령 §159의4" />}
    >
      <NumberInput
        value={asset.residencePeriodYears}
        onChange={(v) => onChange({ residencePeriodYears: v })}
        unit="년"
      />
      <Notice variant={years >= 2 ? "success" : "info"}>
        장기보유공제 표{tableSelected} 적용
        {years >= 2 ? " (보유 40% + 거주 40% = 최대 80%)" : " (보유만, 최대 30%)"}
      </Notice>
    </FieldCard>
  );
}
```

---

## 2. WizardSidebar 파생값 표시

```tsx
// 검용주택 자산 활성 시 사이드바에 미리 표시 (엔진 호출 전이라도 산출 가능한 항목)
<WizardSidebar>
  <SidebarItem label="주택연면적 비율" value={`${(housingRatio * 100).toFixed(2)}%`} />
  <SidebarItem label="주택부수토지 면적" value={`${residentialLandArea.toFixed(2)} ㎡`} />
  <SidebarItem label="상가부수토지 면적" value={`${commercialLandArea.toFixed(2)} ㎡`} />
  <SidebarItem label="주택 정착면적" value={`${residentialFootprintArea.toFixed(2)} ㎡`} />
  {/* API 결과 도착 후 추가 노출 */}
  {result && (
    <>
      <SidebarItem label="주택 양도가액" value={formatKrw(result.apportionment.housingTransferPrice)} />
      <SidebarItem label="상가 양도가액" value={formatKrw(result.apportionment.commercialTransferPrice)} />
    </>
  )}
</WizardSidebar>
```

원칙 (CLAUDE.md): 사이드바 합계는 **이전 단계에서 입력된 값으로 계산 가능한 항목만**. 환산취득가액 등 엔진 결과 후에야 알 수 있는 값은 결과 도착 후 표시.

---

## 3. 결과 뷰 (4-카드 + 합산)

### 3-A. MixedUseResultCard (컨테이너)

```tsx
// components/calc/transfer/result/MixedUseResultCard.tsx
export function MixedUseResultCard({ breakdown }: { breakdown: MixedUseGainBreakdown }) {
  if (breakdown.splitMode === "pre-2022-rejected") {
    return (
      <Notice variant="error">
        2022.1.1 이전 양도분은 본 엔진 범위 외입니다.
        <br />
        {breakdown.warnings.join(" / ")}
      </Notice>
    );
  }

  return (
    <div className="space-y-4">
      <ApportionmentCard data={breakdown.apportionment} />
      <HousingPartCard data={breakdown.housingPart} apportionment={breakdown.apportionment} />
      <CommercialPartCard data={breakdown.commercialPart} apportionment={breakdown.apportionment} />
      {breakdown.nonBusinessLandPart && (
        <NonBusinessLandPartCard data={breakdown.nonBusinessLandPart} />
      )}
      <TotalSummaryCard data={breakdown.total} />
    </div>
  );
}
```

### 3-B. ApportionmentCard (1번 카드 — 양도가액 안분)

```
┌─ 양도가액 안분 ───────────────────────────────┐
│ ▸ 주택부분 기준시가                          │
│   양도시 개별주택공시가격            XXX원    │
│ ▸ 상가부분 기준시가                          │
│   양도시 상가부수토지 기준시가       XXX원    │
│     (개별공시지가 × 상가부수토지 면적)        │
│   양도시 상가건물 기준시가           XXX원    │
│   상가부분 합계                     XXX원    │
│ ──────────────────────────────             │
│ 주택비율                            %        │
│ 주택 양도가액                       XXX원    │
│ 상가 양도가액                       XXX원    │
└──────────────────────────────────────────┘
```

법조문 모달 트리거: §99(기준시가 안분), 시행령 §164(기준시가 산정)

### 3-C. HousingPartCard (2번 카드 — 주택부분)

```
┌─ 주택부분 ────────────────────────────────┐
│ 주택 환산취득가액         XXX원           │
│ 주택 양도차익             XXX원           │
│ ▸ 토지분                  XXX원           │
│ ▸ 건물분                  XXX원           │
│ 12억 초과 비과세 적용                       │
│   양도가액 < 12억 → 전액비과세              │
│   ≥ 12억 → 안분비율 % 적용                  │
│ 장기보유공제 (표2)        XX% — XXX원      │
│   보유 N년 + 거주 M년 → 최대 80%            │
│ 양도소득금액              XXX원           │
└──────────────────────────────────────────┘
```

법조문 모달: §89 ① 3호 단서(12억 초과), §95 ②(장기보유), 시행령 §159의4(거주공제)

### 3-D. CommercialPartCard (3번 카드 — 상가부분)

```
┌─ 상가부분 ────────────────────────────────┐
│ 상가 환산취득가액         XXX원           │
│ 상가 양도차익             XXX원           │
│ ▸ 토지분                  XXX원           │
│ ▸ 건물분                  XXX원           │
│ 장기보유공제 (표1)        XX% — XXX원      │
│   보유 N년 → 최대 30%                       │
│ 양도소득금액              XXX원           │
└──────────────────────────────────────────┘
```

### 3-E. NonBusinessLandPartCard (4번 카드, 조건부)

```
┌─ 비사업용토지 부분 (배율초과 시) ──────────┐
│ 주택부수토지 정착면적     XX㎡            │
│ 적용 배율 × 정착면적     XX㎡             │
│ 배율초과 면적            XX㎡             │
│   (음수 시 카드 자체 비표시)                │
│ 비사업용 양도차익        XXX원            │
│ 장기보유공제 (표1)       XX% — XXX원       │
│ 양도소득금액             XXX원            │
│ + 10%p 가산세 적용 예정                     │
└──────────────────────────────────────────┘
```

법조문 모달: §104의3, 시행령 §168의12, 시행령 §168의6~14

### 3-F. TotalSummaryCard (합산)

```
┌─ 합산 세액 ──────────────────────────────┐
│ 합산 양도소득금액         XXX원           │
│ 기본공제                  250만원         │
│ 과세표준                  XXX원           │
│ 산출세액 (기본세율)       XXX원           │
│ 비사업용 +10%p 가산세     XXX원           │
│ 양도소득세                XXX원           │
│ 지방소득세 (10%)          XXX원           │
│ 총 납부세액               XXX원           │
└──────────────────────────────────────────┘
```

---

## 4. 결과 뷰 표기 원칙 (CLAUDE.md 준수)

- **한국어 풀어쓰기**: 변수 약어(`P_F`, `Sum_A`)·`floor()` 표기 금지. 법정 용어 우선
- **중간 산술 결과 미표시**: 곱셈 후 내림은 결과값 자체가 floor된 값이므로 산식에 `floor()` 표기 안 함
- **단일 결과값 표기**: 좌측 라벨, 우측 결과값 한 번만
- **법조문 링크**: `LawArticleModal` 팝업 + `/api/law/article` API로 조문 원문 표시. 외부 링크 금지
- **중요도 highlight 차등**: 양도소득금액·납부세액 등 핵심값은 굵게/색상 강조

---

## 5. 컴포넌트 재사용 자산 (수정 없이 활용)

| 컴포넌트 | 위치 | 활용 |
|---|---|---|
| `FieldCard` | `components/ui/field-card.tsx` | 모든 입력 필드 카드화 |
| `SectionHeader` | `components/ui/section-header.tsx` | 섹션 그룹화 |
| `WizardSidebar` | `components/ui/wizard-sidebar.tsx` | 파생값 미리 표시 |
| `CurrencyInput` | `components/ui/currency-input.tsx` | 금액 입력 (포커스 시 전체선택 내장) |
| `NumberInput` | `components/ui/number-input.tsx` | 면적·연수 입력 |
| `DateInput` | `components/ui/date-input.tsx` | 취득일·양도일 (type="date" 금지) |
| `Switch` | shadcn/ui | 토글 |
| `LawArticleModal` | `components/law/law-article-modal.tsx` | 법조문 원문 팝업 |
| `VworldButton` | `components/calc/transfer/vworld-button.tsx` | 공시가격 자동 조회 |
| `Notice` | `components/ui/notice.tsx` | 안내·경고 |
| `DerivedDisplay` | `components/ui/derived-display.tsx` | 자동 계산값 표시 |

---

## 6. 접근성·UX 체크리스트

- [ ] 모든 입력 필드 `onFocus={(e) => e.target.select()}` 적용 (CurrencyInput·NumberInput·DateInput 내장)
- [ ] PHD 토글 변경 시 의존 필드(`mixedAcqHousingPrice`) disabled 동기화
- [ ] 자산 타입을 `mixed-use-house` 외로 변경 시 검용주택 필드 자동 클리어 (사용자 확인 모달)
- [ ] WizardSidebar는 0원 항목 제외 (CLAUDE.md 원칙)
- [ ] 결과 카드 4개는 내비게이션 가능 (anchor 링크 또는 sticky tab)
- [ ] 모바일: 4-카드는 세로 스택, 합산 카드는 sticky bottom
- [ ] 법조문 모달은 키보드(ESC) 닫기 가능
- [ ] `pre-2022-rejected` 케이스는 입력 단계에서 미리 경고 + 진행 차단 옵션

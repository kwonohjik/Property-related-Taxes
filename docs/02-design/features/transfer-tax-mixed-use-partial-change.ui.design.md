# Design: 겸용주택 — 보유 중 일부 용도변경 (UI Components·Result Card)

**Main Doc**: `transfer-tax-mixed-use-partial-change.design.md`
**작성일**: 2026-04-30
**범위**: AssetForm 토글, PartialUsageChangeInputs 신규 컴포넌트, 기준시가/면적 입력 조건 분기, 결과 카드 UX

---

## 0. UI 흐름 (사용자 여정)

```
[자산 카드 — assetKind === "housing"]
  └─ [겸용주택 분리계산 토글] ── ON ──┐
                                  │
  └─ [보유 중 일부 용도변경 토글] ────┴── disabled (겸용주택 OFF 시)
                                  │
                                  └── ON ──┐
                                            │
[MixedUseExpandedPanel] ── 펼침
  ① MixedUseAreaInputs ─────────────────────┘ (취득시 면적 자동 표시)
  1-A PartialUsageChangeInputs ── 신규
       ├─ 방향 Select (취득시 전체 주택 / 취득시 전체 상가)
       ├─ 자동 면적 표시 박스
       └─ "수정하기" chip → DecimalInput 2개 (수동 입력)
  ② MixedUseStandardPriceInputs ── direction별 입력 hidden
       ├─ 양도시 기준시가 (변경 없음)
       └─ 취득시 기준시가
            - house_to_commercial: 상가건물 기준시가/공시지가 hidden
            - commercial_to_house: 개별주택공시가격 hidden, PHD 경고 표시
  ③ MixedUseResidencyInput
  ④ 수도권 토글
                                            │
                                            ▼
                                  [계산 → 결과 화면]
                                  ─────────────────
                                  MixedUseResultCard
                                  ├─ "취득시점 자산 구성" 섹션 (신규)
                                  │    + commercial_to_house 시 "보수 검토 필요" 배지
                                  ├─ STEP 2 양도가액 안분 (기존)
                                  ├─ STEP 5 주택부분 (캡션 분기)
                                  ├─ STEP 7 상가부분 (캡션 분기)
                                  ├─ STEP 6 비사업용토지 (선택)
                                  └─ STEP 9 합산 세액
```

---

## 1. AssetForm 토글 행 — `MixedUseToggleRow` (수정)

**파일**: `components/calc/transfer/MixedUseSection.tsx` (L33~52)

### 변경: 단일 ToggleCard → grid-cols-2

```tsx
export function MixedUseToggleRow({ asset, onChange }: Pick<Props, "asset" | "onChange">) {
  return (
    <div className="mt-4 border-t pt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
      {/* 좌측: 기존 겸용주택 토글 — 변경 없음 */}
      <ToggleCard
        tone="amber"
        title="겸용주택 분리계산"
        description="주택+상가 복합건물 (§160①단서)"
        checked={!!asset.isMixedUseHouse}
        onCheckedChange={(checked) => {
          onChange({
            isMixedUseHouse: checked,
            ...(checked ? { hasSeperateLandAcquisitionDate: true } : {}),
          });
        }}
      />

      {/* 우측: 신규 — 보유 중 일부 용도변경 토글 */}
      <ToggleCard
        tone="amber"
        title="보유 중 일부 용도변경"
        description="취득시 자산 구성이 양도시와 다른 경우 (§166⑥ + 집행기준 99-164-10)"
        checked={!!asset.hasPartialUsageChange}
        disabled={!asset.isMixedUseHouse}
        disabledReason="겸용주택 분리계산 활성화 시 사용 가능"
        onCheckedChange={(checked) => {
          onChange({
            hasPartialUsageChange: checked,
            ...(checked && !asset.partialChangeDirection
              ? { partialChangeDirection: "house_to_commercial" }  // 디폴트
              : {}),
          });
        }}
      />
    </div>
  );
}
```

**디자인 결정**:
- tone amber 통일 (취득·분리계산 모드)
- 모바일(`<sm`)에서는 stack, 데스크톱에서는 2-column
- `disabled={!asset.isMixedUseHouse}` — 겸용주택 토글 OFF 시 비활성. `disabledReason` 으로 사유 안내 (ToggleCard 내장 hover 표시)
- 기본 direction은 `house_to_commercial` (PDF 갑氏 케이스가 더 흔한 시나리오)

---

## 2. 신규 컴포넌트 `PartialUsageChangeInputs.tsx`

**파일**: `components/calc/transfer/mixed-use/PartialUsageChangeInputs.tsx` (신규)

### 2-A. Props 시그니처

```tsx
interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 부모 섹션 번호 ("1-A" 형식 — MixedUseAreaInputs ① 직후) */
  sectionNum?: string | number;
}
```

### 2-B. 컴포넌트 구조

```tsx
export function PartialUsageChangeInputs({ asset, onChange, sectionNum }: Props) {
  // 양도시 합계 (자동 도출 기준)
  const transferRes = parseDecimal(asset.residentialFloorArea) ?? 0;
  const transferComm = parseDecimal(asset.nonResidentialFloorArea) ?? 0;
  const transferTotal = transferRes + transferComm;

  const direction = asset.partialChangeDirection;
  const isHouseToComm = direction === "house_to_commercial";
  const isCommToHouse = direction === "commercial_to_house";

  // 자동 면적 (수정값 우선)
  const acqResAuto = isHouseToComm ? transferTotal : 0;
  const acqCommAuto = isHouseToComm ? 0 : transferTotal;
  const acqResShown = parseDecimal(asset.partialChangeAcqResidentialArea) ?? acqResAuto;
  const acqCommShown = parseDecimal(asset.partialChangeAcqCommercialArea) ?? acqCommAuto;

  const isCustomized = !!asset.partialChangeAcqResidentialArea
    || !!asset.partialChangeAcqCommercialArea;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-3">
      {/* 섹션 헤더 */}
      <div className="flex items-center gap-2">
        {sectionNum !== undefined && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">
            {sectionNum}
          </span>
        )}
        <p className="text-xs font-semibold text-amber-700">
          취득시점 자산 구성 (보유 중 일부 용도변경)
        </p>
      </div>

      {/* 방향 Select */}
      <FieldCard label="취득시 자산 구성" hint="양도시와 다른 경우 선택">
        <Select
          value={direction || "house_to_commercial"}
          onValueChange={(v) => onChange({ partialChangeDirection: v as typeof direction })}
        >
          <SelectTrigger className="h-9 w-full">
            <span className="text-left">
              {direction === "commercial_to_house"
                ? "취득시 전체 상가 (양도시 일부 주택화)"
                : "취득시 전체 주택 (양도시 일부 상가화)"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="house_to_commercial">
              취득시 전체 주택 (양도시 일부 상가화)
            </SelectItem>
            <SelectItem value="commercial_to_house">
              취득시 전체 상가 (양도시 일부 주택화)
            </SelectItem>
          </SelectContent>
        </Select>
      </FieldCard>

      {/* 자동 도출 면적 표시 */}
      <div className="rounded-lg bg-amber-100/60 border border-amber-200 px-3 py-2 text-sm space-y-1">
        <div className="flex justify-between text-xs text-amber-700">
          <span>취득시 주택 연면적 {isCustomized ? "(수정됨)" : "(자동)"}</span>
          <span className="font-mono">{acqResShown.toFixed(2)}㎡</span>
        </div>
        <div className="flex justify-between text-xs text-amber-700">
          <span>취득시 상가 연면적 {isCustomized ? "(수정됨)" : "(자동)"}</span>
          <span className="font-mono">{acqCommShown.toFixed(2)}㎡</span>
        </div>
      </div>

      {/* 안내 (이슈 4 반영 — 항상 노출) */}
      <p className="text-[11px] text-amber-700/80 leading-relaxed">
        ※ 증축·일부 멸실 등으로 취득시 면적이 양도시 합계와 다른 경우 직접 수정하세요.
      </p>

      {/* 수정하기 chip 토글 */}
      <ToggleCard
        variant="chip"
        size="sm"
        tone="amber"
        title="취득시 면적 직접 입력"
        description="자동값 대신 수동 입력"
        checked={isCustomized}
        onCheckedChange={(c) => {
          if (!c) {
            onChange({
              partialChangeAcqResidentialArea: "",
              partialChangeAcqCommercialArea: "",
            });
          }
        }}
      />

      {isCustomized && (
        <div className="space-y-2">
          <FieldCard label="취득시 주택 연면적 (㎡)" hint="비워두면 자동값 사용">
            <DecimalInput
              value={asset.partialChangeAcqResidentialArea}
              onChange={(v) => onChange({ partialChangeAcqResidentialArea: v })}
              placeholder={`자동: ${acqResAuto.toFixed(2)}`}
              unit="㎡"
            />
          </FieldCard>
          <FieldCard label="취득시 상가 연면적 (㎡)" hint="비워두면 자동값 사용">
            <DecimalInput
              value={asset.partialChangeAcqCommercialArea}
              onChange={(v) => onChange({ partialChangeAcqCommercialArea: v })}
              placeholder={`자동: ${acqCommAuto.toFixed(2)}`}
              unit="㎡"
            />
          </FieldCard>
        </div>
      )}

      {/* 용도변경일 (선택, 메모용) */}
      <FieldCard label="용도변경일 (선택)" hint="참고용 메모 — 계산에 사용 안 됨">
        <DateInput
          value={asset.partialChangeDate}
          onChange={(v) => onChange({ partialChangeDate: v })}
        />
      </FieldCard>
    </div>
  );
}
```

### 2-C. 디자인 결정

| 요소 | 결정 | 이유 |
|---|---|---|
| 방향 Select 라벨 | "취득시 전체 주택 (양도시 일부 상가화)" | 양도시점·취득시점 혼동 방지 (이슈 7) |
| 자동 면적 표시 | 항상 표시 (toggle 무관) | 사용자가 자동값 확인 가능 |
| "수정됨" 라벨 | 사용자 입력값 존재 시 동적 표시 | 자동/수동 구분 |
| 증축/멸실 안내 | 항상 표시 | 이슈 4 — 면적 자동값 일반화 위험 환기 |
| ToggleCard chip | "수정하기" 옵션 | 평소엔 자동, 필요 시만 수동 |
| `placeholder={자동값}` | 수동 입력 필드의 placeholder에 자동값 표시 | UX 일관성 |
| 용도변경일 | DateInput 선택 필드 | 메모용. 엔진 계산에는 미사용 |

---

## 3. `MixedUseStandardPriceInputs.tsx` 조건 분기 (수정)

**파일**: `components/calc/transfer/mixed-use/MixedUseStandardPriceInputs.tsx` (L122~204 취득시 카드)

### 3-A. direction별 입력 hidden

```tsx
const direction = asset.hasPartialUsageChange ? asset.partialChangeDirection : "";

return (
  // ... 양도시 카드 (변경 없음, L62~120)

  // 취득시 카드 (L122~204)
  <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
    {/* 섹션 헤더 — 변경 없음 */}

    {/* PHD 토글 — direction === "commercial_to_house" 시 경고만 표시 (이슈 5) */}
    <ToggleCard
      tone="amber"
      size="sm"
      title="취득 당시 개별주택가격 미공시 (§164⑤ 3-시점 환산)"
      description={
        direction === "commercial_to_house"
          ? "⚠ 취득시 상가 자산에 PHD 적용 시 효과 검토 필요"
          : useEstimatedAcquisition
            ? "1996년 최초 고시 이전 취득 시 활성화"
            : "활성화 시 환산취득가 모드로 자동 전환"
      }
      checked={!!asset.usePreHousingDisclosure}
      // 강제 변경 없음 — 사용자 직전 상태 보존 (이슈 5)
      onCheckedChange={(checked) => {
        onChange({
          usePreHousingDisclosure: checked,
          ...(checked ? { useEstimatedAcquisition: true } : {}),
        });
      }}
    >
      <MixedUsePreHousingDisclosureSection ... />
    </ToggleCard>

    {/* 개별주택공시가격 — direction === "commercial_to_house" 시 hidden */}
    {direction !== "commercial_to_house" && !asset.usePreHousingDisclosure && (
      <FieldCard label="개별주택공시가격" hint="미공시 시 비워두세요 — 위 §164⑤ 토글 사용">
        <CurrencyInput
          value={asset.mixedAcqHousingPrice}
          onChange={(v) => onChange({ mixedAcqHousingPrice: v })}
          placeholder="취득시 개별주택공시가격 (미공시 시 빈값)"
        />
      </FieldCard>
    )}

    {/* 상가건물 기준시가 — direction === "house_to_commercial" 시 hidden */}
    {direction !== "house_to_commercial" && (
      <FieldCard label="취득시 상가건물 기준시가">
        <CurrencyInput
          value={asset.mixedAcqCommercialBuildingPrice}
          onChange={(v) => onChange({ mixedAcqCommercialBuildingPrice: v })}
          placeholder="취득시 상가건물 기준시가"
        />
      </FieldCard>
    )}

    {/* 개별공시지가 — direction === "house_to_commercial" 시 hidden */}
    {direction !== "house_to_commercial" && (
      <LandPriceLookupField
        pricePerSqm={asset.mixedAcqLandPricePerSqm}
        onPricePerSqmChange={(v) => onChange({ mixedAcqLandPricePerSqm: v })}
        area={commercialLandArea > 0 ? commercialLandArea : undefined}
        referenceDate={acqReferenceDate}
        jibun={jibun}
        label="취득시 개별공시지가(상가)(원/㎡)"
        placeholder="취득시 개별공시지가 /㎡"
      />
    )}

    {/* direction별 안내 박스 */}
    {direction === "house_to_commercial" && (
      <div className="rounded-lg bg-amber-100/60 border border-amber-200 px-3 py-2 text-xs text-amber-900">
        ℹ 취득시점에 상가가 존재하지 않음 — 상가건물 기준시가·공시지가 입력 불필요. 엔진이 취득시 개별주택공시가격을 양도시 면적비율로 자동 안분합니다 (집행기준 99-164-10).
      </div>
    )}
    {direction === "commercial_to_house" && (
      <div className="rounded-lg bg-amber-100/60 border border-amber-200 px-3 py-2 text-xs text-amber-900">
        ℹ 취득시점에 주택이 존재하지 않음 — 개별주택공시가격 입력 불필요. 엔진이 취득시 상가 기준시가(건물+토지)를 양도시 면적비율로 자동 안분합니다.
      </div>
    )}
  </div>
);
```

### 3-B. 자동 산정 미리보기 (선택)

`amber/100` 박스에 엔진이 산정한 환산 단가를 미리 표시하면 사용자 검증성 향상. (1차 PR에서는 결과 화면에서 확인 가능하므로 후순위)

---

## 4. `MixedUseAreaInputs.tsx` 취득시 면적 표시 (수정)

**파일**: `components/calc/transfer/mixed-use/MixedUseAreaInputs.tsx`

### 변경: 양도시 면적 카드 하단에 "취득시 면적" sub-block 추가

```tsx
// 기존 마지막 div (주택연면적 비율 표시) 다음에 추가
{asset.hasPartialUsageChange && asset.partialChangeDirection && (
  <div className="px-3 py-2 rounded-lg bg-sky-100/40 text-xs border border-sky-200 space-y-1">
    <p className="font-semibold text-sky-800">취득시 면적 (PartialUsageChangeInputs에서 설정)</p>
    {(() => {
      const acqRes = parseDecimal(asset.partialChangeAcqResidentialArea)
        ?? (asset.partialChangeDirection === "house_to_commercial" ? total : 0);
      const acqComm = parseDecimal(asset.partialChangeAcqCommercialArea)
        ?? (asset.partialChangeDirection === "house_to_commercial" ? 0 : total);
      return (
        <>
          <div className="flex justify-between text-sky-700">
            <span>취득시 주택 연면적</span>
            <span className="font-mono">{acqRes.toFixed(2)}㎡</span>
          </div>
          <div className="flex justify-between text-sky-700">
            <span>취득시 상가 연면적</span>
            <span className="font-mono">{acqComm.toFixed(2)}㎡</span>
          </div>
        </>
      );
    })()}
  </div>
)}
```

> 이 sub-block은 `PartialUsageChangeInputs`의 자동 도출 박스와 중복 표시될 수 있음. **단순화**: `MixedUseAreaInputs`에는 추가하지 않고 `PartialUsageChangeInputs` 내부 표시만으로 충분 — 사용자 결정 시 후순위로 결정.

---

## 5. `MixedUseExpandedPanel` — `PartialUsageChangeInputs` 마운트

**파일**: `components/calc/transfer/MixedUseSection.tsx` (L70~125)

### 변경: `MixedUseAreaInputs` 직후 마운트

```tsx
return (
  <div className="mt-4 border-t pt-4 space-y-3">
    {/* 2022.1.1 이전 경고 — 변경 없음 */}
    {/* 4-way 결합 모드 가이드 — 변경 없음 */}

    {/* ① 면적 정보 */}
    <MixedUseAreaInputs asset={asset} onChange={onChange} sectionNum={1} />

    {/* 1-A 보유 중 일부 용도변경 (신규) */}
    {asset.hasPartialUsageChange && (
      <PartialUsageChangeInputs asset={asset} onChange={onChange} sectionNum="1-A" />
    )}

    {/* ② 양도시 기준시가 / ③ 취득시 기준시가 */}
    <MixedUseStandardPriceInputs ... />

    {/* ④ 거주 정보 */}
    <MixedUseResidencyInput ... />

    {/* ⑤ 수도권 여부 */}
    {/* ... */}
  </div>
);
```

**섹션 번호 충돌 방지**: 신규 섹션은 "1-A"로 표기 (① 면적 직후 종속 섹션 의미). 후속 ②~⑤는 그대로 유지.

---

## 6. 결과 카드 — `MixedUseResultCard.tsx` (수정)

**파일**: `components/calc/results/mixed-use/MixedUseResultCard.tsx`

### 6-A. 신규 "취득시점 자산 구성" 섹션 (첫 step 위)

```tsx
{breakdown.partialUsageChange && (
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <CardTitle className="text-base">
          취득시점 자산 구성 (보유 중 일부 용도변경)
        </CardTitle>
        {breakdown.partialUsageChange.direction === "commercial_to_house" && (
          <Badge variant="warning" className="bg-yellow-100 text-yellow-900 border-yellow-300">
            ⚠ 법령 적용에 보수 검토 필요
          </Badge>
        )}
      </div>
    </CardHeader>
    <CardContent className="space-y-2">
      <div className="text-sm">
        <span className="text-muted-foreground">취득시 자산 구성: </span>
        <span className="font-semibold">
          {breakdown.partialUsageChange.direction === "house_to_commercial"
            ? "전체 주택 → 양도시 일부 상가화"
            : "전체 상가 → 양도시 일부 주택화"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md bg-muted/50 p-2">
          <div className="text-xs text-muted-foreground">취득시 주택 연면적</div>
          <div className="font-mono">{breakdown.partialUsageChange.acqResidentialArea.toFixed(2)}㎡</div>
        </div>
        <div className="rounded-md bg-muted/50 p-2">
          <div className="text-xs text-muted-foreground">취득시 상가 연면적</div>
          <div className="font-mono">{breakdown.partialUsageChange.acqCommercialArea.toFixed(2)}㎡</div>
        </div>
      </div>
      {breakdown.partialUsageChange.isAreaCustomized && (
        <p className="text-xs text-muted-foreground">
          ※ 사용자가 취득시 면적을 직접 입력함 (자동값 대신 수동값 사용)
        </p>
      )}
      <p className="text-xs text-amber-800 bg-amber-50/60 border border-amber-200 rounded-md px-2 py-1.5">
        💡 {breakdown.calculationRoute.partialUsageChangeReason}
      </p>
    </CardContent>
  </Card>
)}
```

### 6-B. direction별 캡션 템플릿 (이슈 19)

```tsx
const APPORTION_CAPTIONS = {
  house_to_commercial:
    "취득시점 개별주택공시가격을 양도시 면적비율로 안분 (집행기준 99-164-10)",
  commercial_to_house:
    "취득시점 상가 기준시가(건물+토지)를 양도시 면적비율로 안분 (시행령 §166⑥, 보수 적용)",
} as const;
```

`commercialPart` / `housingPart` 산식 캡션에 direction별 적절한 문구 적용:

```tsx
{breakdown.partialUsageChange && (
  <p className="text-xs text-muted-foreground italic">
    {APPORTION_CAPTIONS[breakdown.partialUsageChange.direction]}
  </p>
)}
```

### 6-C. 사전 정의 reason 템플릿 (이슈 9)

```tsx
const PARTIAL_USAGE_CHANGE_REASONS = {
  house_to_commercial:
    "양도시점에는 겸용주택이나 취득시점에는 전체 주택이었으므로 시행령 §166⑥ 및 양도소득세 집행기준 99-164-10에 따라 환산취득가 산정 시 취득시 개별주택공시가격을 양도시 면적비율로 안분",
  commercial_to_house:
    "양도시점에는 겸용주택이나 취득시점에는 전체 상가였으므로 시행령 §166⑥에 따라 환산취득가 산정 시 취득시 상가 기준시가(건물+토지)를 양도시 면적비율로 안분 — 직접 사례 제한적, 보수 검토 필요",
} as const;
```

엔진 측에서 `breakdown.calculationRoute.partialUsageChangeReason`에 위 템플릿 문자열 주입.

---

## 7. WizardSidebar 표시

**파일**: `components/calc/shared/WizardSidebar.tsx` (양도세 sidebar)

`hasPartialUsageChange === true && partialChangeDirection`일 때 사이드바 합계 영역에 다음 표시:

```
취득시 구성: 전체 주택 → 양도시 일부 상가화
취득시 주택 연면적: 198.30㎡
취득시 상가 연면적: 0.00㎡
```

(자동/수정 면적은 partialUsageChange 토글 ON 후 즉시 사이드바 반영)

---

## 8. UX 인터랙션 매트릭스

| 상태 | 토글 위치 | UI 표시 |
|---|---|---|
| 겸용주택 OFF | 좌측 토글 OFF | 우측 토글 disabled (회색 + reason hover) |
| 겸용주택 ON, 용도변경 OFF | 좌측 ON, 우측 OFF | MixedUseExpandedPanel 노출 (기존), PartialUsageChangeInputs 미노출 |
| 둘 다 ON, direction 미선택 | 좌측 ON, 우측 ON | PartialUsageChangeInputs 노출, 디폴트 direction 적용. API 매핑에서 명시적 throw |
| house_to_commercial 선택 | 우측 ON, Select = "취득시 전체 주택" | 취득시 카드의 상가건물·공시지가 hidden + 안내 박스 |
| commercial_to_house 선택 | 우측 ON, Select = "취득시 전체 상가" | 취득시 카드의 개별주택공시가격 hidden, PHD 경고 + 안내 박스. 결과 카드에 보수 검토 배지 |
| 면적 자동 → 수동 전환 | "수정하기" chip ON | DecimalInput 2개 노출, placeholder에 자동값 표시 |
| 1985 의제취득 + PHD ON | PHD 토글 ON | PartialUsageChangeInputs 노출, MixedUsePreHousingDisclosureSection 노출 (PDF 갑氏 케이스) |

---

## 9. 접근성·반응형

- 모든 신규 토글은 `ToggleCard` 사용 (포커스 시 ring·아리아 라벨 내장)
- Select는 shadcn Select (키보드 네비게이션 지원)
- 모바일(`<sm`): 토글 stack 배치 (grid-cols-1)
- 색상은 amber tone 통일 — light/dark 모드 모두 contrast 4.5+ 확보 (Tailwind 기본 팔레트)
- 면적·금액 입력 필드는 `SelectOnFocusProvider`가 자동 적용 (모든 input 포커스 시 전체 선택)

---

## 10. 누락 UI 보강 — PDF 갑氏 케이스 입력 흐름 검증

### 10-A. 🚨 Critical — 1세대 1주택 비과세 적용 표시 (다주택자)

**문제**: 겸용주택 모듈은 주택분 12억 이하면 자동 비과세. 갑氏(2주택자)는 비과세 미적용이지만 사용자가 어디서 "다주택자" 선택하는지 불명확.

**해결**:
1. **자산 카드의 기존 `isOneHousehold` 토글 활용** — `AssetForm.isOneHousehold: boolean`(L235)이 이미 존재. 양도세 마법사 자산 카드 어딘가에 토글이 있어야 함.
2. **겸용주택 확장 패널 상단에 1세대1주택 충족 여부 안내 박스 추가**:
   ```tsx
   {asset.isMixedUseHouse && (
     <div className={`rounded-md px-3 py-2 text-xs border ${
       asset.isOneHousehold
         ? "bg-emerald-50/60 border-emerald-200 text-emerald-900"
         : "bg-amber-50/60 border-amber-200 text-amber-900"
     }`}>
       {asset.isOneHousehold
         ? "✓ 1세대 1주택 비과세 요건 충족 — 주택분 양도가액 12억 이하 비과세, 거주 2년+ 시 표2 적용"
         : "⚠ 1세대 1주택 비과세 미적용 — 주택분 전액 과세, 표1 장기보유공제 (다주택자·2년 미거주 등)"}
     </div>
   )}
   ```
3. **결과 카드에 "1세대 1주택 적용 여부" 라벨 표시**:
   ```tsx
   <div className="text-sm">
     <span className="text-muted-foreground">1세대 1주택 비과세: </span>
     <span className={asset.isOneHouseExempt ? "text-emerald-700" : "text-amber-700"}>
       {asset.isOneHouseExempt ? "적용 (12억 비과세 + 표2 거주공제)" : "미적용 (전액 과세 + 표1 공제)"}
     </span>
   </div>
   ```

### 10-B. Major 누락 보강

#### 10-B-1. 양도시 상가건물 기준시가 — 조회 안내 (PDF 미명시 데이터)

`MixedUseStandardPriceInputs.tsx` L83~90 양도시 상가건물 기준시가 필드의 hint 보강:

```tsx
<FieldCard
  label="양도시 상가건물 기준시가"
  hint="국세청 홈택스 > 기준시가 조회 > 상업용 건물·오피스텔 (개별주택가격확인서에 미포함된 경우)"
>
  ...
</FieldCard>
```

또한 CardContent 하단에 정보성 안내 추가:
```tsx
<p className="text-[11px] text-emerald-700/80 leading-relaxed">
  💡 PDF·개별주택가격확인서에 상가건물 기준시가가 명시되지 않은 경우{" "}
  <a href="https://teht.hometax.go.kr/" target="_blank" className="underline">국세청 홈택스</a>에서 조회하세요.
</p>
```

#### 10-B-2. PHD 1985 의제취득 — 1990년 공시지가 사용 안내

`MixedUsePreHousingDisclosureSection.tsx` L138 `ThreePointStandardPriceInput` 위에 안내 박스 추가:

```tsx
{(() => {
  const acqDate = asset.landAcquisitionDate || asset.acquisitionDate;
  const isDeemedAcq = acqDate && acqDate <= "1985-01-01";
  return isDeemedAcq && (
    <div className="rounded-md bg-amber-50/60 border border-amber-200 px-3 py-2 text-xs text-amber-900 space-y-1">
      <p className="font-semibold">의제취득(§98) 안내</p>
      <p>
        1985.1.1 이전 취득은 모두 1985.1.1로 의제취득됩니다.
        1985년 시점 공시지가가 없으므로 <strong>1990년(또는 가장 가까운 시점)의 개별공시지가</strong>를 입력하세요.
      </p>
    </div>
  );
})()}
```

#### 10-B-3. 산정면적 vs 전체면적 — 라벨 명확화

`MixedUseAreaInputs.tsx` L32~48 라벨/hint 변경:

```tsx
<FieldCard
  label="주택 연면적 (산정면적, ㎡)"
  hint="개별주택가격확인서의 '산정면적' 또는 건축물대장의 주거용 부분 합계"
>
  <DecimalInput
    value={asset.residentialFloorArea}
    onChange={(v) => onChange({ residentialFloorArea: v })}
    placeholder="예: 37.79 (PDF 갑氏: 양도시 1층 단독주택)"
    unit="㎡"
  />
</FieldCard>

<FieldCard
  label="상가 연면적 (㎡)"
  hint="비주택 합계 — 근린생활시설·사무·주차장 (양도시점 기준)"
>
  <DecimalInput
    value={asset.nonResidentialFloorArea}
    onChange={(v) => onChange({ nonResidentialFloorArea: v })}
    placeholder="예: 80.23 (PDF 갑氏: 양도시 2층 근린)"
    unit="㎡"
  />
</FieldCard>
```

#### 10-B-4. 의제취득일 안내 — 자산 카드 DateInput

자산 카드의 취득일 입력 필드(`acquisitionDate` 또는 `landAcquisitionDate`) hint 보강:

```tsx
<FieldCard
  label="취득일"
  hint="1985.1.1 이전 취득은 모두 1985.1.1로 입력 (의제취득, 소득세법 §98)"
>
  <DateInput value={...} onChange={...} />
</FieldCard>
```

또는 별도의 안내 배지:
```tsx
{asset.acquisitionDate && asset.acquisitionDate <= "1985-01-01" && (
  <Badge variant="outline" className="text-xs">의제취득(§98) 적용</Badge>
)}
```

#### 10-B-5. 토지·건물 취득일 동일 입력 안내

겸용주택 + 의제취득 조합 시 "토지·건물 취득일 다름" 토글이 OFF여야 함을 안내. `CompanionAcqPurchaseBlock.tsx`에 조건 안내 추가:

```tsx
{isDeemedAcq && asset.hasSeperateLandAcquisitionDate && (
  <p className="text-[11px] text-amber-700">
    ⚠ 의제취득(1985.1.1)은 토지·건물이 동일 취득일로 의제됩니다. 분리 토글 비활성화 권장.
  </p>
)}
```

#### 10-B-6. 건물 정착면적 정의 명확화

`MixedUseAreaInputs.tsx` L50~57 라벨 변경:

```tsx
<FieldCard
  label="건물 정착면적 (1층 바닥면적, ㎡)"
  hint="건축물대장의 1층 바닥면적 — 부수토지 배율(3·5·10배) 초과 판정 기준"
>
  <DecimalInput
    value={asset.buildingFootprintArea}
    onChange={(v) => onChange({ buildingFootprintArea: v })}
    placeholder="예: 37.79 (PDF 갑氏: 1층 면적)"
    unit="㎡"
  />
</FieldCard>
```

### 10-C. PDF 갑氏 입력 흐름 매핑표 — UI 가이드용

| PDF 데이터 | UI 입력 위치 | 컴포넌트·필드 |
|---|---|---|
| 양도일 2023.02.16 | Step1 폼-전역 양도일 | `transferDate` |
| 양도가액 1,300,000,000 | Step1 폼-전역 양도가액 | `contractTotalPrice` |
| 1세대 1주택 비과세 미적용 (2주택자) | 자산 카드 — 1세대 1주택 토글 | `asset.isOneHousehold = false` ⚠ Critical |
| 의제취득일 1985.1.1 | 자산 카드 — 취득일 (의제취득 안내) | `asset.acquisitionDate = "1985-01-01"` |
| 겸용주택 활성화 | 자산 카드 토글 | `asset.isMixedUseHouse = true` |
| 보유 중 일부 용도변경 활성화 | 자산 카드 토글 (신규) | `asset.hasPartialUsageChange = true` |
| 방향 = 취득시 전체 주택 | PartialUsageChangeInputs Select | `asset.partialChangeDirection = "house_to_commercial"` |
| 양도시 주택 37.79㎡ | MixedUseAreaInputs | `asset.residentialFloorArea = "37.79"` |
| 양도시 상가 80.23㎡ | MixedUseAreaInputs | `asset.nonResidentialFloorArea = "80.23"` |
| 1층 바닥면적 37.79㎡ | MixedUseAreaInputs | `asset.buildingFootprintArea = "37.79"` |
| 전체 토지 198.3㎡ | MixedUseAreaInputs | `asset.mixedUseTotalLandArea = "198.3"` |
| 양도시 개별주택가격 380,000,000 (2022) | MixedUseStandardPriceInputs (양도시) | `asset.mixedTransferHousingPrice = "380000000"` |
| 양도시 상가건물 기준시가 (PDF 미명시) | MixedUseStandardPriceInputs — 안내 박스 | `asset.mixedTransferCommercialBuildingPrice` (사용자 조회) |
| 양도시 공시지가 3,300,000원/㎡ (2022) | LandPriceLookupField | `asset.mixedTransferLandPricePerSqm = "3300000"` |
| PHD 활성화 | MixedUseStandardPriceInputs PHD 토글 | `asset.usePreHousingDisclosure = true` |
| 최초공시 2005.1.1 | MixedUsePreHousingDisclosureSection | `asset.phdFirstDisclosureDate = "2005-01-01"` |
| 최초공시 개별주택가격 150,000,000 | 동상 | `asset.phdFirstDisclosureHousingPrice = "150000000"` |
| 1990 공시지가 840,000원/㎡ (취득시) | ThreePointStandardPriceInput (취득시) | `asset.phdLandPricePerSqmAtAcq = "840000"` ⚠ 안내 필요 |
| 거주기간 | MixedUseResidencyInput | `asset.mixedUseResidencePeriodYears` |
| 수도권(가평 — 비수도권) | 수도권 토글 OFF | `asset.mixedIsMetropolitanArea = false` |

위 표를 사용자에게 "입력 가이드"로 결과 화면에 표시하면 학습성 향상.

---

## 11. UI 검증 체크리스트

### 11-A. 본 PR 핵심 (보유 중 일부 용도변경)
- [ ] `MixedUseToggleRow` grid-cols-2 — 모바일 stack, 데스크톱 2열
- [ ] 새 토글 disabled 가드 — 겸용주택 OFF 시 회색 + reason hover
- [ ] `PartialUsageChangeInputs` 신규 — Select 라벨 명확 (양도시점 혼동 방지)
- [ ] 자동 면적 표시 + "수정됨" 라벨 동적 갱신
- [ ] 증축/멸실 안내 박스 항상 노출
- [ ] `MixedUseStandardPriceInputs` direction별 입력 hidden + 안내 박스 정확
- [ ] PHD 토글 강제 변경 없음 — 사용자 직전 상태 보존
- [ ] 결과 카드 신규 "취득시점 자산 구성" 섹션 + commercial_to_house 보수 검토 배지
- [ ] direction별 캡션 템플릿 분리 적용
- [ ] WizardSidebar에 취득시 면적 즉시 표시
- [ ] DateInput·DecimalInput·CurrencyInput 사용 규칙 준수 (CLAUDE.md memory 참조)
- [ ] 800줄 정책 — `PartialUsageChangeInputs.tsx` ≤ 200줄, 기타 수정 파일 800줄 이하 유지

### 11-B. 누락 보강 (10절)
- [ ] **Critical** — 1세대 1주택 비과세 안내 박스 (10-A): 겸용주택 패널 상단에 emerald/amber 박스
- [ ] **Critical** — 결과 카드에 "1세대 1주택 비과세 적용 여부" 라벨 표시
- [ ] 양도시 상가건물 기준시가 hint 보강 — "국세청 홈택스" 안내 (10-B-1)
- [ ] PHD 1985 의제취득 — 1990년 공시지가 사용 안내 박스 (10-B-2)
- [ ] 산정면적 vs 전체면적 라벨 명확화 (10-B-3) — placeholder에 PDF 갑氏 예시값
- [ ] 의제취득일 안내 — 자산 카드 DateInput hint + "의제취득(§98) 적용" 배지 (10-B-4)
- [ ] 토지·건물 취득일 동일 입력 안내 — 의제취득 시 분리 토글 OFF 권장 (10-B-5)
- [ ] 건물 정착면적 정의 명확화 — "1층 바닥면적" 라벨 (10-B-6)
- [ ] PDF 갑氏 입력 흐름 매핑표를 마법사 도움말 또는 결과 화면에 노출 (10-C)

### 11-C. 회귀
- [ ] 기존 겸용주택 사례14 (1세대1주택, 12억 비과세) 결과 동일
- [ ] `isOneHousehold = true` (기존 디폴트) 시 기존 동작 유지
- [ ] sessionStorage·DB 영속화 호환 — 기존 이력 로드 시 토글 OFF 기본값

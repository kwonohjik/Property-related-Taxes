# 간주취득 UI 설계 — 동기화 지점 ⑤~⑦ + TaxHelp + 시나리오

**상위 문서**: [acquisition-tax-deemed.ui.design.md](acquisition-tax-deemed.ui.design.md)
**내용**: UI 위젯·사이드바·결과카드·도움말·시나리오 테스트

---

## ⑤ UI 위젯 상세 (Step 1-D 패널 3종)

### 과점주주 패널 (Step 1-D-A)

배경 카드: `rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-3`

```tsx
// 1. 상장법인 여부 (rose ToggleCard)
<ToggleCard
  tone="rose"
  title="상장법인 여부"
  description="유가증권시장·코스닥·코넥스 상장법인은 과세 제외 (§7의2① 단서)"
  checked={form.deemedMajorIsListed ?? false}
  onCheckedChange={(v) => set("deemedMajorIsListed", v)}
  trailing={<TaxHelp title="과점주주 간주취득" ... />}
>
  <div className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-800">
    상장법인의 과점주주는 취득세 과세 대상이 아닙니다.
    계산 없이 비과세로 처리됩니다.
  </div>
</ToggleCard>

// 2. 법인 보유 자산 시가표준액 (CurrencyInput, 비상장 시만 활성)
<CurrencyInput
  label="법인 보유 자산 시가표준액 합계"
  value={form.deemedMajorCorporateAssetValue ?? ""}
  onChange={(v) => set("deemedMajorCorporateAssetValue", v)}
  placeholder="예: 1,000,000,000"
  disabled={form.deemedMajorIsListed}
/>
// hint: "법인이 보유한 토지·건물 등 과세대상 자산의 시가표준액 합계 (§7의2① 본문)"

// 3. 취득 전 지분율 (DecimalInput 0~100)
<DecimalInput
  value={form.deemedMajorPrevShareRatio ?? ""}
  onChange={(v) => set("deemedMajorPrevShareRatio", v)}
  placeholder="0 ~ 100 (신규 진입이면 0)"
  unit="%"
  disabled={form.deemedMajorIsListed}
/>
// hint: "이미 보유 중인 지분 비율. 신규 진입이면 0 입력"

// 4. 취득 후 지분율 (DecimalInput 0~100)
<DecimalInput
  value={form.deemedMajorNewShareRatio ?? ""}
  onChange={(v) => set("deemedMajorNewShareRatio", v)}
  placeholder="50 초과여야 과점주주"
  unit="%"
  disabled={form.deemedMajorIsListed}
/>
// hint: "과점주주 요건: 주주 1인 + 특수관계인 지분 합계 50% 초과 (§7의2①)"

// 5. 과점주주 도달일 (DateInput)
<DateInput
  value={form.deemedMajorShareholderDate ?? ""}
  onChange={(v) => set("deemedMajorShareholderDate", v)}
  disabled={form.deemedMajorIsListed}
/>
// hint: "주식·지분 취득으로 과점주주 기준(50% 초과)에 달한 날"

// 6. 자동 계산 미리보기 (amber 색조, 값 존재 시만 표시)
// 조건: !isListed && corpVal > 0 && newR > prevR
<div className="rounded-md bg-amber-100/60 border border-amber-200 px-3 py-2 text-sm space-y-1">
  <p className="font-medium text-amber-800">과세 미리보기</p>
  <p>과세 지분율 = {prevR}% → {newR}% (증가 {newR - prevR}%p)</p>
  <p>간주취득 과세표준 = {formatKRW(corpVal)} × {newR - prevR}% = {formatKRW(deemedBase)}</p>
  <p className="font-medium">예상 취득세 = {formatKRW(deemedBase)} × 2% = {formatKRW(Math.floor(deemedBase * 0.02))}</p>
  <p className="text-xs text-amber-600">* 농어촌특별세·지방교육세 별도</p>
</div>
```

### 지목변경 패널 (Step 1-D-B)

배경 카드: `rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-3`

```tsx
// 1. 변경 전 지목 (select — LAND_CATEGORY_OPTIONS 28종)
<select className={selectCls}
  value={form.deemedLandPrevCategory ?? ""}
  onChange={(e) => set("deemedLandPrevCategory", e.target.value)}>
  <option value="">선택...</option>
  {LAND_CATEGORY_OPTIONS.map(([v, l]) => (
    <option key={v} value={v}>{l}</option>
  ))}
</select>

// 2. 변경 후 지목 (select — 변경 전과 동일 제외)
<select className={selectCls}
  value={form.deemedLandNewCategory ?? ""}
  onChange={(e) => set("deemedLandNewCategory", e.target.value)}>
  <option value="">선택...</option>
  {LAND_CATEGORY_OPTIONS
    .filter(([v]) => v !== form.deemedLandPrevCategory)
    .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
</select>
// hint: "변경 전 지목과 동일한 지목은 선택 불가"

// 3. 지목변경일 (DateInput)
<DateInput
  value={form.deemedLandChangeDate ?? ""}
  onChange={(v) => set("deemedLandChangeDate", v)}
/>
// hint: "지목 변경 등기 완료일 (신고기한 기산점)"

// 4. 변경 전 시가표준액 (CurrencyInput)
<CurrencyInput label="변경 전 시가표준액"
  value={form.deemedLandPrevStandardValue ?? ""}
  onChange={(v) => set("deemedLandPrevStandardValue", v)}
  placeholder="지목변경 전 토지 공시가격 기준" />

// 5. 변경 후 시가표준액 (CurrencyInput)
<CurrencyInput label="변경 후 시가표준액"
  value={form.deemedLandNewStandardValue ?? ""}
  onChange={(v) => set("deemedLandNewStandardValue", v)}
  placeholder="지목변경 후 토지 공시가격 기준" />

// 6. 자동 계산 미리보기 (sky 색조)
<div className="rounded-md bg-sky-100/60 border border-sky-200 px-3 py-2 text-sm space-y-1">
  <p className="font-medium text-sky-800">과세 미리보기</p>
  {diff > 0 ? (
    <>
      <p>과세표준 = 변경 후 {formatKRW(newSv)} - 변경 전 {formatKRW(prevSv)} = {formatKRW(diff)}</p>
      <p className="font-medium">예상 취득세 = {formatKRW(diff)} × 2% = {formatKRW(Math.floor(diff * 0.02))}</p>
    </>
  ) : (
    <p className="text-amber-700">변경 후 시가표준액이 변경 전 이하 — 과세 대상 없음</p>
  )}
  <p className="text-xs text-sky-600">* 농어촌특별세·지방교육세 별도</p>
</div>
```

### 건물 개수 패널 (Step 1-D-C)

배경 카드: `rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3`

```tsx
// 1. 개수 유형 (RadioCardGroup — amber, stack)
<RadioCardGroup
  tone="amber"
  layout="stack"
  name="deemedRenovationType"
  value={form.deemedRenovationType ?? ""}
  onChange={(v) => set("deemedRenovationType", v as "structural_change" | "use_change" | "major_repair")}
  options={[
    {
      value: "structural_change",
      label: "구조변경",
      description: "건물 구조 변경 — 목조에서 철근콘크리트 구조로 변경 등",
    },
    {
      value: "use_change",
      label: "용도변경",
      description: "건물 용도 변경 — 창고→주택, 주택→상가 등 (건축법 §19 신고·허가)",
    },
    {
      value: "major_repair",
      label: "대수선",
      description: "주요 구조부 대규모 수선 — 건축법 §2①9호 해당 (기둥·보·내력벽·주계단·지붕틀 등)",
    },
  ]}
/>

// 2. 개수 완료일 (DateInput)
<DateInput
  value={form.deemedRenovationDate ?? ""}
  onChange={(v) => set("deemedRenovationDate", v)}
/>
// hint: "구조변경·용도변경·대수선 완료일 (신고기한 기산점)"

// 3. 개수 전 시가표준액 (CurrencyInput)
<CurrencyInput label="개수 전 시가표준액"
  value={form.deemedRenovationPrevStandardValue ?? ""}
  onChange={(v) => set("deemedRenovationPrevStandardValue", v)}
  placeholder="개수 전 건물 시가표준액" />

// 4. 개수 후 시가표준액 (CurrencyInput)
<CurrencyInput label="개수 후 시가표준액"
  value={form.deemedRenovationNewStandardValue ?? ""}
  onChange={(v) => set("deemedRenovationNewStandardValue", v)}
  placeholder="개수 후 건물 시가표준액" />

// 5. 자동 계산 미리보기 (violet 색조)
<div className="rounded-md bg-violet-100/60 border border-violet-200 px-3 py-2 text-sm space-y-1">
  <p className="font-medium text-violet-800">과세 미리보기</p>
  {diff > 0 ? (
    <>
      <p>과세표준 = 개수 후 {formatKRW(newSv)} - 개수 전 {formatKRW(prevSv)} = {formatKRW(diff)}</p>
      <p className="font-medium">예상 취득세 = {formatKRW(diff)} × 2% = {formatKRW(Math.floor(diff * 0.02))}</p>
    </>
  ) : (
    <p className="text-amber-700">개수 후 시가표준액이 개수 전 이하 — 과세 대상 없음</p>
  )}
  <p className="text-xs text-violet-600">* 농어촌특별세·지방교육세 별도</p>
</div>
```

---

## ⑥ 사이드바 (`AcquisitionSidebar.tsx`)

### AcquisitionSummary 인터페이스 추가 필드

```ts
export interface AcquisitionSummary {
  // 기존 필드 ...
  deemedType?: string;          // "과점주주" | "지목변경" | "건물 개수"
  deemedTaxBase?: number | null; // 간주취득 과세표준 미리보기
}
```

### computeAcquisitionSummary 간주취득 분기

기존 취득가액 계산 블록 이전에 추가:

```ts
const isDeemedMajor = form.acquisitionCause === "deemed_major_shareholder";
const isDeemedLand  = form.acquisitionCause === "deemed_land_category";
const isDeemedReno  = form.acquisitionCause === "deemed_renovation";

if (isDeemedMajor) {
  if (form.deemedMajorIsListed) {
    return {
      acquisitionValue: null, standardValue: null, houseCountAfter: null,
      isRegulated: false, isCorporation: false,
      estimatedBaseRate: "비과세 (상장법인)",
      deemedType: "과점주주", deemedTaxBase: null,
    };
  }
  const corpVal = parseAmount(form.deemedMajorCorporateAssetValue ?? "") ?? 0;
  const prevR   = parseFloat(form.deemedMajorPrevShareRatio ?? "0") / 100;
  const newR    = parseFloat(form.deemedMajorNewShareRatio  ?? "0") / 100;
  const taxableRatio = Math.max(0, newR - prevR);
  const deemedBase = corpVal > 0 && taxableRatio > 0
    ? Math.floor(corpVal * taxableRatio)
    : null;
  return {
    acquisitionValue: null, standardValue: null, houseCountAfter: null,
    isRegulated: false, isCorporation: false,
    estimatedBaseRate: deemedBase ? "2% (간주취득)" : null,
    deemedType: "과점주주", deemedTaxBase: deemedBase,
  };
}

if (isDeemedLand) {
  const prevSv = parseAmount(form.deemedLandPrevStandardValue ?? "") ?? 0;
  const newSv  = parseAmount(form.deemedLandNewStandardValue  ?? "") ?? 0;
  const deemedBase = newSv > prevSv ? newSv - prevSv : null;
  return {
    acquisitionValue: null, standardValue: null, houseCountAfter: null,
    isRegulated: false, isCorporation: false,
    estimatedBaseRate: deemedBase ? "2% (간주취득)" : null,
    deemedType: "지목변경", deemedTaxBase: deemedBase,
  };
}

if (isDeemedReno) {
  const prevSv = parseAmount(form.deemedRenovationPrevStandardValue ?? "") ?? 0;
  const newSv  = parseAmount(form.deemedRenovationNewStandardValue  ?? "") ?? 0;
  const deemedBase = newSv > prevSv ? newSv - prevSv : null;
  return {
    acquisitionValue: null, standardValue: null, houseCountAfter: null,
    isRegulated: false, isCorporation: false,
    estimatedBaseRate: deemedBase ? "2% (간주취득)" : null,
    deemedType: "건물 개수", deemedTaxBase: deemedBase,
  };
}
```

### 사이드바 summaryItems 구성 (간주취득 시)

```ts
if (summary.deemedType) {
  summaryItems.push({ label: "간주취득 유형", value: summary.deemedType });

  if (summary.estimatedBaseRate === "비과세 (상장법인)") {
    summaryItems.push({ label: "판정", value: "비과세 (상장법인)", highlight: true });
  } else if (summary.deemedTaxBase !== null && summary.deemedTaxBase !== undefined) {
    summaryItems.push({ label: "과세표준 (차액)", value: summary.deemedTaxBase });
    summaryItems.push({
      label: "예상 취득세 (2%)",
      value: Math.floor(summary.deemedTaxBase * 0.02),
      highlight: true,
    });
  }
}
```

---

## ⑦ 결과 카드 (`DeemedAcquisitionResultCard`)

### 위치

`components/calc/results/AcquisitionTaxResultView.tsx` 내 신설.
컴포넌트가 커지면 `components/calc/results/acquisition/DeemedAcquisitionResultCard.tsx`로 분리.

### 조건부 렌더 (AcquisitionTaxResultView 내)

```tsx
const isDeemedAcquisition = [
  "deemed_major_shareholder", "deemed_land_category", "deemed_renovation",
].includes(result.acquisitionCause);

// 기존 isExempt 분기 이전에 배치
{isDeemedAcquisition && <DeemedAcquisitionResultCard result={result} />}

// 간주취득 시 불필요 컴포넌트 숨김
{!isDeemedAcquisition && <SurchargeFlowDiagram result={result} />}
{!isDeemedAcquisition && <HouseCountVerifier result={result} />}
{!isDeemedAcquisition && <RateScenarioTable ... />}
{!isDeemedAcquisition && <LinearInterpolationGraph ... />}
{!isDeemedAcquisition && <ReductionPossibilityPanel ... />}
```

### DeemedAcquisitionResultCard 산식 표시 (한국어 풀어쓰기)

**과점주주 — 비과세 (상장법인)**:
```
간주취득 유형: 과점주주 (지방세법 §7의2①)

판정: 비과세
사유: 상장법인 주주의 과점주주 간주취득 적용 제외 (§7의2① 단서)
```

**과점주주 — 과세**:
```
간주취득 유형: 과점주주 (지방세법 §7의2①)

취득 전 지분율:          N%
취득 후 지분율:          M%
과세 지분율 (증가분):    M - N = K%p
법인 보유 자산 시가표준액: A원
─────────────────────────────────
간주취득 과세표준:       A × K% = B원
적용 세율:               2% (§11①7가목)
취득세 본세:             B × 2% = C원
+ 농어촌특별세:          D원
+ 지방교육세:            E원
──────────────────────────────────
총 납부세액:             F원
```

**지목변경 — 과세**:
```
간주취득 유형: 지목변경 (지방세법 §7의2②)

변경 전 지목:    {prevCategory}
변경 후 지목:    {newCategory}
변경 전 시가표준액: A원
변경 후 시가표준액: B원
─────────────────────────────────
간주취득 과세표준:  변경 후 B원 - 변경 전 A원 = 차액 C원
적용 세율:         2% (§11①7가목)
취득세 본세:       C × 2% = D원
+ 농어촌특별세:    E원
+ 지방교육세:      F원
──────────────────────────────────
총 납부세액:       G원
```

**지목변경 — 과세 제외 (차액 음수)**:
```
판정: 과세 대상 아님
사유: 변경 후 시가표준액({B}원)이 변경 전({A}원) 이하
```

**건물 개수 — 과세**:
```
간주취득 유형: 건물 개수(改修) (지방세법 §7의2③)

개수 유형:       {renovationType 한국어}
개수 전 시가표준액: A원
개수 후 시가표준액: B원
─────────────────────────────────
간주취득 과세표준:  개수 후 B원 - 개수 전 A원 = 차액 C원
적용 세율:         2% (§11①7가목)
취득세 본세:       C × 2% = D원
+ 농어촌특별세:    E원
+ 지방교육세:      F원
──────────────────────────────────
총 납부세액:       G원
```

**개수 유형 한국어 라벨**:
```ts
const RENOVATION_TYPE_LABELS: Record<string, string> = {
  structural_change: "구조변경",
  use_change: "용도변경",
  major_repair: "대수선",
};
```

**공통 warnings 표시**:
- 과점주주: "신고기한 = 과점주주 도달일로부터 60일"
- 지목변경: "신고기한 = 지목변경 등기일로부터 60일"
- 건물 개수: "신고기한 = 개수 완료일로부터 60일"
- 법인 과점주주 추가: "해당 법인이 다시 다른 법인의 과점주주가 된 경우 간접 취득 추가 과세 가능"

---

## TaxHelp 도움말 명세

### 과점주주

```
title: "과점주주 간주취득 (지방세법 §7의2①)"
summary: "법인 주식·지분을 취득해 과점주주(50% 초과)가 되면, 법인 보유 자산 취득으로 간주 과세"
details:
  개요: 주주 1인 + 특수관계인 지분 합계 50% 초과 → 과점주주
  과세 요건 3가지: ① 과점주주 도달 ② 지분 증가분 과세 ③ 법인이 과세대상 자산 보유
  비과세: 상장법인(§7의2① 단서), 상속·증여로 지분 취득
  과세표준: 법인 보유 자산 시가표준액 × 과세 지분율(증가분)
legalBasis: "지방세법 제7조의2 제1항"
```

### 지목변경

```
title: "지목변경 간주취득 (지방세법 §7의2②)"
summary: "지목 변경으로 시가표준액이 증가하면, 증가분 가치에 해당하는 취득으로 간주 과세"
details:
  개요: 공간정보관리법상 지목 변경 + 시가표준액 증가 시 과세
  비과세·비해당: 시가표준액 동일·감소, 지목변경 등기 없는 사용 목적 변경
  과세표준: 변경 후 시가표준액 - 변경 전 시가표준액 (양수인 경우만)
legalBasis: "지방세법 제7조의2 제2항"
```

### 건물 개수

```
title: "건물 개수 간주취득 (지방세법 §7의2③)"
summary: "구조변경·용도변경·대수선으로 시가표준액이 증가하면 증가분에 취득세 과세"
details:
  개수 3종: 구조변경 / 용도변경(건축법 §19) / 대수선(건축법 §2①9호)
  비해당: 일반 수리·유지보수·인테리어 (대수선 기준 미달), 시가표준액 감소
  과세표준: 개수 후 시가표준액 - 개수 전 시가표준액 (양수인 경우만)
legalBasis: "지방세법 제7조의2 제3항, 건축법 제2조 제1항 제9호"
```

---

## 시나리오 테스트 케이스 (UI anchor)

구현 후 브라우저 수동 확인 또는 `__tests__/tax-engine/acquisition-deemed/` 자동화.

### 과점주주 시나리오

**TC-01 과세: 비상장 법인 40% → 60%**
```
법인 자산: 1,000,000,000원 | 전: 40% | 후: 60% | 상장: N
예상: 과세표준 200,000,000원 | 본세 4,000,000원
```

**TC-02 비과세: 상장법인**
```
상장법인: Y
예상: 비과세, 입력 필드 비활성, 사이드바 "비과세 (상장법인)"
```

**TC-03 신규 진입: 0% → 51%**
```
법인 자산: 500,000,000원 | 전: 0% | 후: 51%
예상: 과세표준 255,000,000원 | 본세 5,100,000원
```

**TC-04 유효성 실패: 취득 후 ≤ 50%**
```
전: 30% | 후: 45%
예상: "취득 후 지분율이 50% 이하이면 과점주주 요건 미충족" 오류
```

**TC-05 유효성 실패: 후 ≤ 전**
```
전: 60% | 후: 55%
예상: "취득 후 지분율은 취득 전보다 커야 합니다" 오류
```

### 지목변경 시나리오

**TC-06 과세: 답 → 대**
```
전: 답 | 후: 대 | 전 시가: 100,000,000원 | 후 시가: 300,000,000원
예상: 과세표준 200,000,000원 | 본세 4,000,000원
```

**TC-07 과세 제외: 차액 음수**
```
전 시가: 200,000,000원 | 후 시가: 180,000,000원
예상: "변경 후 시가표준액이 변경 전 이하 — 과세 대상 없음"
```

**TC-08 유효성: 전·후 지목 동일**
```
전: 대 | 후: 대
예상: "변경 전·후 지목이 동일합니다" 오류
```

### 건물 개수 시나리오

**TC-09 과세: 대수선**
```
유형: 대수선 | 전 시가: 50,000,000원 | 후 시가: 80,000,000원
예상: 과세표준 30,000,000원 | 본세 600,000원
```

**TC-10 과세: 용도변경 (창고→주택)**
```
유형: 용도변경 | 전 시가: 100,000,000원 | 후 시가: 250,000,000원
예상: 과세표준 150,000,000원 | 본세 3,000,000원
```

**TC-11 유효성: 개수 유형 미선택**
```
예상: "개수 유형을 선택하세요" 오류
```

### 마법사 흐름 시나리오

**TC-12 Skip 확인: Step 2~5 자동 skip**
```
간주취득 선택 → Step 1-D 입력 → "취득세 계산" 버튼 표시 확인
→ 클릭 시 Step 2~5 건너뛰고 바로 결과 표시
```

**TC-13 뒤로가기: Step 1-D → Step 0**
```
Step 1-D에서 "이전" 클릭 → Step 0으로 돌아가는지 확인
```

**TC-14 StepIndicator: 2단계만 표시**
```
간주취득 선택 시 상단 StepIndicator가 "취득 정보 / 간주취득 상세" 2단계로 표시
```

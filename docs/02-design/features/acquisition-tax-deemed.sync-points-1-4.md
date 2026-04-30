# 간주취득 UI 설계 — 동기화 지점 ①~④

**상위 문서**: [acquisition-tax-deemed.ui.design.md](acquisition-tax-deemed.ui.design.md)
**내용**: FormState 타입·INITIAL_FORM·normalize·API 변환

---

## ① FormState 추가 필드

`components/calc/acquisition/shared.ts`의 `FormState` 인터페이스에 추가:

```ts
// ─── [간주취득] 과점주주 (5개 필드) ───
/** 상장법인 여부 (true이면 비과세) */
deemedMajorIsListed?: boolean;
/** 법인 보유 과세대상 자산 시가표준액 합계 (원, CurrencyInput string) */
deemedMajorCorporateAssetValue?: string;
/** 취득 전 지분율 (0~100 %, DecimalInput string) */
deemedMajorPrevShareRatio?: string;
/** 취득 후 지분율 (0~100 %, DecimalInput string) */
deemedMajorNewShareRatio?: string;
/** 과점주주 도달일 (YYYY-MM-DD) */
deemedMajorShareholderDate?: string;

// ─── [간주취득] 지목변경 (5개 필드) ───
/** 변경 전 지목 (한국어 코드: "전", "답", "대" 등) */
deemedLandPrevCategory?: string;
/** 변경 후 지목 */
deemedLandNewCategory?: string;
/** 지목변경일 (YYYY-MM-DD) */
deemedLandChangeDate?: string;
/** 변경 전 시가표준액 (원, CurrencyInput string) */
deemedLandPrevStandardValue?: string;
/** 변경 후 시가표준액 (원, CurrencyInput string) */
deemedLandNewStandardValue?: string;

// ─── [간주취득] 건물 개수 (5개 필드) ───
/** 개수 유형 */
deemedRenovationType?: "structural_change" | "use_change" | "major_repair";
/** 개수 완료일 (YYYY-MM-DD) */
deemedRenovationDate?: string;
/** 개수 전 시가표준액 (원, CurrencyInput string) */
deemedRenovationPrevStandardValue?: string;
/** 개수 후 시가표준액 (원, CurrencyInput string) */
deemedRenovationNewStandardValue?: string;
```

**총 15개 필드** (`deemedMajor*` 5개, `deemedLand*` 5개, `deemedRenovation*` 4개 + `deemedRenovationType`).

**네이밍 결정 근거**:
- 기존 `majorShareholderDate` 필드(P5UI)는 Step 4(법인·특수)의 휴면법인 과점주주 도달일 전용. 간주취득 과점주주 도달일은 `deemedMajorShareholderDate`로 명시 분리.
- 금액 필드: UI에서 `string` (CurrencyInput 원시값), API 변환 시 `parseAmount()`로 `number` 변환.
- 지분율: UI에서 0~100 (%), API 변환 시 `/ 100`으로 0~1 변환해 엔진 전달.

---

## ② INITIAL_FORM 초기값

`INITIAL_FORM` 객체에 추가 (모두 `undefined`):

```ts
// 간주취득 — 과점주주
deemedMajorIsListed: undefined,
deemedMajorCorporateAssetValue: undefined,
deemedMajorPrevShareRatio: undefined,
deemedMajorNewShareRatio: undefined,
deemedMajorShareholderDate: undefined,

// 간주취득 — 지목변경
deemedLandPrevCategory: undefined,
deemedLandNewCategory: undefined,
deemedLandChangeDate: undefined,
deemedLandPrevStandardValue: undefined,
deemedLandNewStandardValue: undefined,

// 간주취득 — 건물 개수
deemedRenovationType: undefined,
deemedRenovationDate: undefined,
deemedRenovationPrevStandardValue: undefined,
deemedRenovationNewStandardValue: undefined,
```

---

## ③ normalize.ts fallback

`components/calc/acquisition/normalize.ts`의 `normalizeAcquisitionForm()` 함수에 추가:

```ts
// 간주취득 — 과점주주
deemedMajorIsListed: typeof legacy.deemedMajorIsListed === "boolean"
  ? (legacy.deemedMajorIsListed as boolean)
  : INITIAL_FORM.deemedMajorIsListed,
deemedMajorCorporateAssetValue:
  (legacy.deemedMajorCorporateAssetValue as string) ?? INITIAL_FORM.deemedMajorCorporateAssetValue,
deemedMajorPrevShareRatio:
  (legacy.deemedMajorPrevShareRatio as string) ?? INITIAL_FORM.deemedMajorPrevShareRatio,
deemedMajorNewShareRatio:
  (legacy.deemedMajorNewShareRatio as string) ?? INITIAL_FORM.deemedMajorNewShareRatio,
deemedMajorShareholderDate:
  (legacy.deemedMajorShareholderDate as string) ?? INITIAL_FORM.deemedMajorShareholderDate,

// 간주취득 — 지목변경
deemedLandPrevCategory:
  (legacy.deemedLandPrevCategory as string) ?? INITIAL_FORM.deemedLandPrevCategory,
deemedLandNewCategory:
  (legacy.deemedLandNewCategory as string) ?? INITIAL_FORM.deemedLandNewCategory,
deemedLandChangeDate:
  (legacy.deemedLandChangeDate as string) ?? INITIAL_FORM.deemedLandChangeDate,
deemedLandPrevStandardValue:
  (legacy.deemedLandPrevStandardValue as string) ?? INITIAL_FORM.deemedLandPrevStandardValue,
deemedLandNewStandardValue:
  (legacy.deemedLandNewStandardValue as string) ?? INITIAL_FORM.deemedLandNewStandardValue,

// 간주취득 — 건물 개수
deemedRenovationType:
  (legacy.deemedRenovationType as "structural_change" | "use_change" | "major_repair")
  ?? INITIAL_FORM.deemedRenovationType,
deemedRenovationDate:
  (legacy.deemedRenovationDate as string) ?? INITIAL_FORM.deemedRenovationDate,
deemedRenovationPrevStandardValue:
  (legacy.deemedRenovationPrevStandardValue as string)
  ?? INITIAL_FORM.deemedRenovationPrevStandardValue,
deemedRenovationNewStandardValue:
  (legacy.deemedRenovationNewStandardValue as string)
  ?? INITIAL_FORM.deemedRenovationNewStandardValue,
```

---

## ④ API 변환 (`lib/calc/acquisition-tax-api.ts`)

`buildAcquisitionTaxBody()` 함수 말미에 간주취득 블록 추가.
flat FormState → `deemedInput` 중첩 객체로 조합:

```ts
// ─── 간주취득 ───
const isDeemedMajor = form.acquisitionCause === "deemed_major_shareholder";
const isDeemedLand  = form.acquisitionCause === "deemed_land_category";
const isDeemedReno  = form.acquisitionCause === "deemed_renovation";

if (isDeemedMajor) {
  const corporateAssetValue = parseAmount(form.deemedMajorCorporateAssetValue ?? "");
  const prevRatio = parseFloatOrUndef(form.deemedMajorPrevShareRatio ?? "");
  const newRatio  = parseFloatOrUndef(form.deemedMajorNewShareRatio ?? "");

  body.deemedInput = {
    majorShareholder: {
      corporateAssetValue: corporateAssetValue ?? 0,
      // UI: 0~100 % → 엔진: 0~1
      prevShareRatio: prevRatio !== undefined ? prevRatio / 100 : 0,
      newShareRatio:  newRatio  !== undefined ? newRatio  / 100 : 0,
      isListed: form.deemedMajorIsListed ?? false,
    },
  };

  // 과점주주 도달일 (취득시기 결정용)
  const msd = form.deemedMajorShareholderDate
    ? strOrUndef(form.deemedMajorShareholderDate)
    : undefined;
  if (msd) body.majorShareholderDate = msd;
}

if (isDeemedLand) {
  const prevSv = parseAmount(form.deemedLandPrevStandardValue ?? "");
  const newSv  = parseAmount(form.deemedLandNewStandardValue ?? "");

  body.deemedInput = {
    landCategory: {
      prevCategory:      form.deemedLandPrevCategory ?? "",
      newCategory:       form.deemedLandNewCategory ?? "",
      prevStandardValue: prevSv ?? 0,
      newStandardValue:  newSv  ?? 0,
    },
  };

  // 지목변경일 → balancePaymentDate에 매핑 (취득시기 결정 로직 활용)
  const lcd = form.deemedLandChangeDate
    ? strOrUndef(form.deemedLandChangeDate)
    : undefined;
  if (lcd) body.balancePaymentDate = lcd;
}

if (isDeemedReno) {
  const prevSv = parseAmount(form.deemedRenovationPrevStandardValue ?? "");
  const newSv  = parseAmount(form.deemedRenovationNewStandardValue ?? "");

  body.deemedInput = {
    renovation: {
      renovationType:    form.deemedRenovationType ?? "structural_change",
      prevStandardValue: prevSv ?? 0,
      newStandardValue:  newSv  ?? 0,
    },
  };

  // 개수 완료일 → balancePaymentDate에 매핑
  const rend = form.deemedRenovationDate
    ? strOrUndef(form.deemedRenovationDate)
    : undefined;
  if (rend) body.balancePaymentDate = rend;
}
```

**주의**: 지목변경·건물 개수의 취득시기는 변경일·완료일이다.
기존 엔진 `acquisition-timing.ts`가 `balancePaymentDate`를 취득시기 후보로 사용하므로 해당 필드로 매핑한다.
엔진이 별도 `deemedAcquisitionDate` 필드를 요구하도록 변경되면 변환 로직도 수정.
구현 전 엔진 담당자(`acquisition-tax-senior`) 확인 권장.

---

## ACQUISITION_CAUSE_LABELS 추가 명세

`shared.ts`의 `ACQUISITION_CAUSE_LABELS` 상수에 추가:

```ts
// 간주취득 3종 추가 (기존 항목 이후)
["deemed_major_shareholder", "간주취득 — 과점주주"],
["deemed_land_category",     "간주취득 — 지목변경"],
["deemed_renovation",        "간주취득 — 건물 개수(改修)"],
```

`Step0.tsx`의 `<select>`를 `<optgroup>` 구조로 변경:

```tsx
<select className={selectCls} value={form.acquisitionCause} onChange={...}>
  <optgroup label="유상취득">
    <option value="purchase">매매</option>
    <option value="exchange">교환</option>
    <option value="auction">공매·경매</option>
    <option value="in_kind_investment">현물출자</option>
  </optgroup>
  <optgroup label="무상취득">
    <option value="inheritance">상속</option>
    <option value="inheritance_farmland">농지 상속 (2.3% 특례)</option>
    <option value="gift">증여</option>
    <option value="burdened_gift">부담부증여</option>
    <option value="donation">기부</option>
  </optgroup>
  <optgroup label="원시취득">
    <option value="new_construction">신축</option>
    <option value="extension">증축</option>
    <option value="reconstruction">개축</option>
    <option value="reclamation">공유수면 매립·간척</option>
  </optgroup>
  <optgroup label="간주취득 (지방세법 §7의2)">
    <option value="deemed_major_shareholder">간주취득 — 과점주주</option>
    <option value="deemed_land_category">간주취득 — 지목변경</option>
    <option value="deemed_renovation">간주취득 — 건물 개수(改修)</option>
  </optgroup>
</select>
```

## LAND_CATEGORY_OPTIONS 상수

`shared.ts`에 신설 (지목변경 패널에서 사용):

```ts
export const LAND_CATEGORY_OPTIONS: [string, string][] = [
  ["전", "전 (田) — 밭"],
  ["답", "답 (畓) — 논"],
  ["과", "과수원"],
  ["목", "목장용지"],
  ["임", "임야"],
  ["광", "광천지"],
  ["염", "염전"],
  ["대", "대 (垈) — 주택·건물 부지"],
  ["공장용지", "공장용지"],
  ["학교용지", "학교용지"],
  ["주차장", "주차장"],
  ["주유소용지", "주유소용지"],
  ["창고용지", "창고용지"],
  ["도로", "도로"],
  ["철도용지", "철도용지"],
  ["하천", "하천"],
  ["제방", "제방"],
  ["구거", "구거 (溝渠) — 용수로·배수로"],
  ["유지", "유지 (溜池) — 저수지·연못"],
  ["양어장", "양어장"],
  ["수도용지", "수도용지"],
  ["공원", "공원"],
  ["체육용지", "체육용지"],
  ["유원지", "유원지"],
  ["종교용지", "종교용지"],
  ["사적지", "사적지"],
  ["묘지", "묘지"],
  ["잡종지", "잡종지"],
];
```

## validateStep 추가 (step === 1 분기)

```ts
if (step === 1) {
  if (form.acquisitionCause === "deemed_major_shareholder") {
    if (!form.deemedMajorIsListed) {
      if (!form.deemedMajorCorporateAssetValue)
        return "법인 보유 자산 시가표준액을 입력하세요.";
      const prev = parseFloat(form.deemedMajorPrevShareRatio ?? "");
      const next = parseFloat(form.deemedMajorNewShareRatio ?? "");
      if (isNaN(next)) return "취득 후 지분율을 입력하세요.";
      if (!isNaN(prev) && next <= prev)
        return "취득 후 지분율은 취득 전보다 커야 합니다.";
      if (next <= 50)
        return "취득 후 지분율이 50% 이하이면 과점주주 요건 미충족입니다.";
    }
    // 상장법인 → 검증 없이 통과 (비과세 처리)
  }

  if (form.acquisitionCause === "deemed_land_category") {
    if (!form.deemedLandPrevCategory) return "변경 전 지목을 선택하세요.";
    if (!form.deemedLandNewCategory)  return "변경 후 지목을 선택하세요.";
    if (form.deemedLandPrevCategory === form.deemedLandNewCategory)
      return "변경 전·후 지목이 동일합니다.";
    if (!form.deemedLandPrevStandardValue) return "변경 전 시가표준액을 입력하세요.";
    if (!form.deemedLandNewStandardValue)  return "변경 후 시가표준액을 입력하세요.";
  }

  if (form.acquisitionCause === "deemed_renovation") {
    if (!form.deemedRenovationType)            return "개수 유형을 선택하세요.";
    if (!form.deemedRenovationPrevStandardValue) return "개수 전 시가표준액을 입력하세요.";
    if (!form.deemedRenovationNewStandardValue)  return "개수 후 시가표준액을 입력하세요.";
  }
}
```

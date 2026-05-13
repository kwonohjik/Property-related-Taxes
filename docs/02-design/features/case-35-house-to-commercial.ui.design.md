# 사례 35 — 주택을 상가로 용도변경 UI 디자인

**작성일**: 2026-05-13
**작성자**: transfer-tax-ui-senior
**선행 완료**: 사례 31·32·33 (`propertyType="general_building"`, gb* 18+ 필드)
**Plan 문서**: `docs/00-pm/case-35-house-to-commercial-conversion.plan.md`
**엔진 디자인**: `docs/02-design/features/case-35-house-to-commercial.engine.design.md` (동시 작성 중)

본 문서는 사례 31~33 UI 디자인 위에 **델타(용도변경 분)만** 명세한다. 기존 GeneralBuildingBlock의 ①~⑥ 섹션은 변경 없음.

---

## 1. 사용자 시나리오 — 갑氏 (사례 35 PDF 메인 케이스)

갑氏는 **A주택(2008-05-02 취득) + B주택(2010-02-07 보유) 2주택자**. A주택을 2020-08-07에 상가(근린생활시설)로 용도변경 후 2023-02-19 양도.
양도가 800,000,000 / 취득가 400,000,000 / 필요경비 0. 조정대상지역 + 중과배제기간(2022-05-10 ~ 2024-05-09) 내 양도 → 일반 누진세율 적용. 장특공제 보유기간 기산일 = 용도변경일(2020-08-07), 2020-08-07 ~ 2023-02-19 = **약 2년 6개월 → 3년 미만 → 장특공제 0**.

| 단계 | 사용자 행동 | UI 반응 |
|---|---|---|
| 1 | Step1 → "자산 추가" → 자산종류 **"일반건물(토지+건물 일괄)"** 선택 | `assetKind: "general_building"` 설정 |
| 2 | 취득원인 **"매매"** 선택 (토지 취득원인) | `acquisitionCause: "purchase"` |
| 3 | 건물 취득원인 **"매매"** 선택 | `gbBuildingAcquisitionCause: "purchase"` |
| 4 | 취득일 2008-05-02 / 양도일 2023-02-19 / 양도가 800,000,000 / 취득가 400,000,000 입력 | 기존 자산-수준 필드 |
| 5 | 양도시·취득시 기준시가 입력 (환산 불필요 — 실가 보유) | 기존 gb* 기준시가 필드 |
| **6** | **★ "주택 → 상가 용도변경" ToggleCard ON** | `gbHouseToCommercialConversion: true`. 토글 ON 시 하위 필드 펼침. fuchsia tone 카드 ⑦ 표시. |
| **7** | **★ 용도변경일 입력**: 2020-08-07 [DateInput] | `gbConversionDate: "2020-08-07"`. 범위 검증: `acquisitionDate ≤ gbConversionDate ≤ transferDate`. |
| **8** | **★ "변경 당시 다주택자(중과대상)였습니까?" 라디오**: "예" 선택 | `gbWasMultiHouseAtConversion: true`. 하위 안내 문구 표시: "변경일 이전 보유기간은 장특공제에서 배제됩니다." |
| **9** | ★ 미리보기 카드 자동 표시: "변경일(2020.08.07) ~ 양도일(2023.02.19) = 약 2년 6개월 — **3년 미만: 장특공제 0%**" | useMemo 순수 계산 — useEffect 사용 금지 |
| 10 | "계산" 실행 → 결과 화면 | 장특공제 0, 산출세액 133,060,000, 지방세 13,306,000 표시 |
| 11 | 결과 카드에서 산식 확인: `result.lthdStartDate !== acquisitionDate` → "보유기간 기산일: 용도변경일(2020.08.07) (변경 전 기간 배제 — 사전법규재산 2022-684)" | ⑦ 결과 카드: `lthdStartDate` 비교 기반 override 자가 판정. `lthdStartDateOverrideReason` 문자열 의존 없음. `asset.gbConversionDate`·`asset.gbHouseToCommercialConversion` AssetForm 측 참조 |

---

## 2. 케이스 매트릭스 (3행 — Plan §3 표)

| # | 케이스 | `gbHouseToCommercialConversion` | `gbWasMultiHouseAtConversion` | 중과배제기간 양도? | 장특공제 보유기간 기산 | 결과 |
|---|---|---|---|---|---|---|
| **35-1** | **다주택 + 중과배제기간 (PDF 메인)** | true | true | **예** (2022.5.10~2024.5.9) | **용도변경일(2020-08-07)** — 사전법규재산 2022-684 | 기산일 이후 2년 6개월 → **장특공제 0%**, 일반 누진세율 |
| **35-2** | **1주택 상태에서 용도변경** | true | **false** | — | **당초 취득일(2008-05-02)** | 취득일 이후 보유기간 적용. 14년 → 표1 28% |
| **35-3** | **다주택 + 변경일부터 5년 보유** | true | true | — (중과배제기간 외 양도) | 용도변경일(2015-01-01) ~ 양도일(2020-01-15) = **5년** | 표1 연 2% × 5년 = **10%** |

> 35-3 시나리오: `conversionDate=2015-01-01` / `transferDate=2020-01-15` / 보유기간 5년 → 장특공제 10%. 중과배제기간(2022-05-10~2024-05-09) 미적용 케이스 — 세율 분기(중과 vs 일반)는 기존 multi-house-surcharge 모듈이 처리. 본 UI에서는 `wasMultiHouseAtConversion` 토글만 제공; 중과배제기간 윈도우 판정은 엔진에서 `transferDate` 기준으로 자동.

---

## 3. 14개 동기화 지점 전수 명세

### ① 폼 상태 타입 — AssetForm 신규 필드 3개

**위치**: `lib/stores/calc-wizard-asset.ts` → `AssetForm` 인터페이스
`gbExtensionActualExpenses` 필드 아래, 겸용주택 섹션 앞에 추가.

```typescript
// ── 사례 35: 주택→상가 용도변경 LTHD 기산일 분기 (사전법규재산 2022-684) ──
/**
 * 주택→상가 단일 용도변경 토글 (AssetForm UI 측 필드명 — `gb*` 접두사).
 * true 시 `gbConversionDate`·`gbWasMultiHouseAtConversion` 필드가 의미를 가짐.
 * false(default) 시 두 필드 무시 — 기존 사례 31~33 동작 그대로.
 * ④ API 변환에서 엔진 측 필드명 `houseToCommercialConversion`으로 매핑.
 */
gbHouseToCommercialConversion: boolean;

/**
 * 용도변경일 (YYYY-MM-DD). AssetForm UI 측 필드명 — `gb*` 접두사.
 * 범위: acquisitionDate ≤ gbConversionDate ≤ transferDate.
 * gbHouseToCommercialConversion=true 시 필수.
 * ④ API 변환에서 엔진 측 필드명 `conversionDate`로 매핑.
 */
gbConversionDate: string;

/**
 * 용도변경 당시 다주택자(중과대상) 여부. AssetForm UI 측 필드명 — `gb*` 접두사.
 * true: 변경일 이전 보유기간 장특공제 배제.
 *       중과배제기간(2022-05-10~2024-05-09) 내 양도 시 보유기간 기산 = gbConversionDate.
 *       [근거: 사전법규재산 2022-684·2022-881 / 서울행법 2012구단26961]
 * false: 1주택 상태 용도변경 → 당초 취득일 기산.
 * null: 미선택 — gbHouseToCommercialConversion=true 시 사용자가 반드시 RadioCardGroup으로 명시 선택.
 *       validate⑧에서 null은 오류로 차단. API 변환(④)에서 null 전달 방지.
 * ④ API 변환에서 엔진 측 필드명 `wasMultiHouseAtConversion`으로 매핑.
 */
gbWasMultiHouseAtConversion: boolean | null;
```

**AssetForm(UI 측) ↔ 엔진/Zod/API body(서버 측) 필드명 매핑표**

| AssetForm 필드 (UI 측 — `gb*` 접두사) | API/Zod/엔진 필드 (서버 측 — 접두사 없음) |
|---|---|
| `gbHouseToCommercialConversion` | `houseToCommercialConversion` |
| `gbConversionDate` | `conversionDate` |
| `gbWasMultiHouseAtConversion` | `wasMultiHouseAtConversion` |

> ④ API 변환(`buildGeneralBuildingValuation`)과 ⑭ Route handler에서 매핑이 발생함. ⑩ Zod 스키마·⑫ Zod 입력 객체·⑭ Route handler 우변은 엔진 측 명칭(접두사 없음) 사용.

**placeholder 숫자 예시 금지**: hint prop에 형식 설명만 기재.

---

### ② initial value

**위치**: `lib/stores/calc-wizard-asset.ts` → `INITIAL_ASSET_FORM` (또는 `createInitialAssetForm()`)

```ts
// 사례 35 용도변경 필드 기본값
gbHouseToCommercialConversion: false,
gbConversionDate: "",
gbWasMultiHouseAtConversion: null,    // 미선택 강제 — gbHouseToCommercialConversion=true 시 validate에서 차단
```

---

### ③ normalize fallback

**위치**: `lib/stores/calc-wizard-asset.ts` → `normalizeAsset()` (또는 `migrateAsset()`)

```ts
// 사례 35: 구형 sessionStorage 마이그레이션 — 3필드 누락 보호
asset.gbHouseToCommercialConversion ??= false;
asset.gbConversionDate ??= "";
// gbWasMultiHouseAtConversion: null이 "미선택" 상태 — undefined만 null로 치환, null 유지
if (asset.gbWasMultiHouseAtConversion === undefined) asset.gbWasMultiHouseAtConversion = null;
```

> **중요 (useEffect 미러링 금지 정책)**: `gbHouseToCommercialConversion=false`일 때 `gbConversionDate`·`gbWasMultiHouseAtConversion`을 normalize에서 강제 초기화하지 않는다. 사용자가 토글 OFF 후 재토글 ON 시 입력값이 복원되도록 onChange 핸들러에서 `gbHouseToCommercialConversion` 값만 업데이트. normalize는 undefined 누락 보호 역할에 한정.

---

### ④ API 변환 — `lib/calc/transfer-tax-api-helpers.ts`

`buildGeneralBuildingValuation()` 함수에 신규 3필드 추가.

```ts
// 사례 35: 주택→상가 용도변경 필드 — generalBuildingValuation 객체에 포함
// gbWasMultiHouseAtConversion=null(미선택)은 validate⑧에서 차단되므로 여기에 도달하지 않음
// 좌변(body 키) = 엔진 측 필드명(접두사 없음), 우변 = AssetForm 측 필드(gb* 접두사)
...(asset.gbHouseToCommercialConversion
  ? {
      houseToCommercialConversion: true,
      conversionDate: asset.gbConversionDate || undefined,    // string — ⑭에서 toOptionalDate
      wasMultiHouseAtConversion: asset.gbWasMultiHouseAtConversion ?? false,
    }
  : {}),
```

> `gbHouseToCommercialConversion=false` 시 3필드를 spread에서 제외하여 기존 사례 31~33 경로를 그대로 유지. `gbWasMultiHouseAtConversion=null` 상태로 API 변환에 도달하는 경로는 validate⑧에서 사전 차단.

---

### ⑤ UI 입력 위젯 — GeneralBuildingBlock 신규 섹션 ⑦

#### 5.1 위치 (계산 로직 순서 = UI 표시 순서)

```
GeneralBuildingBlock
└── ToggleCard (환산취득가 사용, tone="violet") [사례 31]
    ├── ① 면적·층수 섹션 (sky 카드) [사례 31]
    ├── ② 양도시 기준시가 섹션 (emerald 카드) [사례 31]
    ├── ③ 취득시 기준시가 섹션 (amber 카드) [사례 31]
    ├── ④ 비사업용토지 판정 섹션 (rose 카드) [사례 31]
    ├── ⑤ 신축 정보 섹션 (amber 카드) [사례 32]
    ├── ⑥ 증축 섹션 (fuchsia 카드) [사례 33]
    └── ⑦ 주택→상가 용도변경 섹션 (fuchsia 카드) ← ★ 사례 35 신규 (후속 PR #4로 ToggleCardTone fuchsia 추가됨)
        ├── ToggleCard "주택→상가 용도변경" (tone="fuchsia")
        └── [ON 시 펼침]
            ├── DateInput (용도변경일)
            ├── RadioCardGroup (변경 당시 다주택자 여부)
            └── 미리보기 카드 (보유기간 + 장특공제 안내)
```

**배치 근거**: 용도변경은 취득 이후 양도 전 이벤트. 장특공제 보유기간 기산일을 결정하는 분기이므로 취득정보(③) 섹션 이후, LTHD 계산 로직 순서에 따라 증축(⑥) 다음에 위치.

#### 5.2 ToggleCard "주택→상가 용도변경"

| 속성 | 값 |
|---|---|
| 컴포넌트 | `ToggleCard` |
| label | "주택→상가 용도변경" |
| description | "주택 전체를 근린생활시설 등 비주택으로 용도변경한 경우 ON. 다주택 상태에서 용도변경 시 변경일 이전 보유기간이 장특공제에서 배제됩니다." |
| tone | **fuchsia** — 취득 후 추가 이벤트 (증축·용도변경 계열). 후속 PR #4(`ToggleCardTone` `fuchsia` 추가)로 정식 등록됨. ⑥ 증축(`tone="fuchsia"`)과 동일 계열로 정합. |
| checked | `asset.gbHouseToCommercialConversion` |
| OFF 상태 | `bg-fuchsia-50/70` 배경 유지 (tone 규칙 — 회색 배경 금지) |
| onChange | `updateAsset(assetId, { gbHouseToCommercialConversion: checked })` — `gbConversionDate`·`gbWasMultiHouseAtConversion`은 건드리지 않음 (재토글 복원 UX) |

#### 5.3 DateInput "용도변경일" (`gbConversionDate`)

| 속성 | 값 |
|---|---|
| 컴포넌트 | `DateInput` (`type="date"` 금지) |
| 라벨 | "용도변경일" |
| hint | "건축물대장 용도변경 처리 완료일. 취득일 이후, 양도일 이전이어야 합니다." |
| trailing | **예규 예외 (디자인 환류 2026-05-13)**: 사전법규재산 2022-684·881은 **국세청 예규**이며 `LawArticleModal` + `/api/law/article` 의 검색 대상 법령(소득세법 등 조문 단위)이 **아니므로** 모달 trailing 배지 미적용. 대신 RadioCardGroup hint 텍스트 "예 선택 시 변경일 이전 보유기간 LTHD 배제 (사전법규재산 2022-684·881 / 서울행법 2012구단26961)" 로 근거를 명시. 결과 카드 ⑦ override 표시도 동일 텍스트 패턴 사용. 후속 PR로 예규 모달(`PrecedentArticleModal` 또는 외부 링크 fallback) 컴포넌트 도입 시 trailing 배지로 환원 검토. |
| 활성화 조건 | `gbHouseToCommercialConversion === true` |
| validate | `acquisitionDate ≤ gbConversionDate ≤ transferDate` (⑧ 참조) |
| placeholder 숫자 예시 | 금지 — hint prop으로 형식 안내 |

#### 5.4 RadioCardGroup "변경 당시 다주택자 여부" (`gbWasMultiHouseAtConversion`)

| 속성 | 값 |
|---|---|
| 컴포넌트 | `RadioCardGroup` |
| 라벨 | "변경 당시 다주택자(중과대상)였습니까?" |
| 옵션 | `{ value: "true", label: "예", description: "변경일 이전 보유기간 장특공제 배제. 기산일 = 용도변경일." }`, `{ value: "false", label: "아니오", description: "1주택 상태에서 용도변경. 기산일 = 당초 취득일." }` |
| 기본값 | `null` — 둘 다 OFF 상태. 사용자가 반드시 명시 선택해야 함. RadioCardGroup `value={asset.gbWasMultiHouseAtConversion === null ? undefined : String(asset.gbWasMultiHouseAtConversion)}` |
| 활성화 조건 | `gbHouseToCommercialConversion === true` |
| 하위 안내 문구 (예 선택 시) | amber 배경: "변경일 이전 보유기간은 장특공제에서 배제됩니다. (서울행법 2012구단26961 / 사전법규재산 2022-684)" |

> **native radio 사용 금지** — `RadioCardGroup` 컴포넌트 필수.

#### 5.5 미리보기 카드 (useMemo 순수)

표시 조건: `gbHouseToCommercialConversion === true && gbConversionDate && transferDate`

```tsx
// useMemo — useEffect 절대 사용 금지 (store 미러링 금지 정책)
const conversionPreview = useMemo(() => {
  if (!asset.gbHouseToCommercialConversion) return null;
  if (!asset.gbConversionDate || !transferDate) return null;

  // gbWasMultiHouseAtConversion=null(미선택) 시 미리보기 표시 불가 — null 반환
  if (asset.gbWasMultiHouseAtConversion === null) return null;

  const startDate = asset.gbWasMultiHouseAtConversion
    ? asset.gbConversionDate
    : asset.acquisitionDate;

  const years = calcYearsBetween(startDate, transferDate);       // 만 년 수
  const isUnder3Years = years < 3;

  return {
    startDate,
    years,
    isUnder3Years,
    label: asset.gbWasMultiHouseAtConversion
      ? `보유기간 기산일 = 용도변경일 (${formatDate(asset.gbConversionDate)})`
      : `보유기간 기산일 = 당초 취득일 (${formatDate(asset.acquisitionDate)})`,
    notice: isUnder3Years
      ? `${years}년 미만 → 장특공제 0% (§95② 표1 연 2%, 3년 미만 미적용)`
      : `${years}년 → 장특공제 ${years * 2}% (§95② 표1 최대 30%)`,
  };
}, [asset.gbHouseToCommercialConversion, asset.gbConversionDate, asset.gbWasMultiHouseAtConversion, asset.acquisitionDate, transferDate]);
```

표시 스타일:
- 3년 미만: amber 배경 배지. 문구: `"[기산일] ~ [양도일] = {N}년 미만 — 장특공제 0%"`
- 3년 이상: emerald 배경 배지. 문구: `"[기산일] ~ [양도일] = {N}년 — 장특공제 {N×2}%"`

---

### ⑥ 사이드바 합계

장특공제 0% 여부는 결과 단계에서만 확정. 사이드바에 수치 변경 없음.
단, `gbHouseToCommercialConversion=true && gbWasMultiHouseAtConversion=true` 시 사이드바에 메타 텍스트 표시 가능:

```
자산명 옆 배지: "용도변경" (fuchsia, 소형)
```

수치 합계 변경 없음 — 합계 계산 로직(`computeTransferSummary`) 수정 불필요.

---

### ⑦ 결과 카드 산식 표시

**위치**: `TransferTaxResultView.tsx` 또는 `BundledAllocationCard.tsx` — 장특공제 섹션

**`result.lthdStartDate` 신규 필드 활용** (엔진 시니어가 `TransferTaxResult`에 `lthdStartDate: Date` 추가).

엔진 결과 타입 변경분 (⑦ 동기화 지점):

```ts
// TransferTaxResult (lib/tax-engine/transfer-tax.ts 또는 타입 파일)
// 엔진 시니어가 추가
lthdStartDate: Date;     // 장특공제 보유기간 기산일. 엔진이 항상 emit 보장 (required).
                         // 취득일과 다른 경우(용도변경 등): conversionDate 값.
                         // 그 외: acquisitionDate 값.
                         // lthdStartDateOverrideReason 필드는 삭제됨.
```

#### override 자가 판정 로직

```tsx
// acquisitionDate와 lthdStartDate를 비교하여 override 여부 결정
// lthdStartDateOverrideReason 문자열 의존 제거 — result.lthdStartDate만 사용
// lthdStartDate는 required(엔진 항상 emit 보장) — null 체크 불필요
const lthdStartDateISO = formatDateISO(result.lthdStartDate);    // "YYYY-MM-DD"

const isLthdStartOverridden =
  lthdStartDateISO !== asset.acquisitionDate;   // 취득일과 다르면 override
```

표시 조건 (override 적용 케이스 — 다주택 용도변경):

```
isLthdStartOverridden === true
```

표시 내용:

```
장기보유특별공제 계산
─────────────────────────────────
보유기간 기산일       용도변경일 (2020.08.07)
                      (변경 전 보유기간 배제 — 사전법규재산 2022-684)
보유기간              용도변경일(2020.08.07) ~ 양도일(2023.02.19) = 2년 6개월
§95② 표1 공제율      3년 미만 → 0%
장기보유특별공제      0
```

> "보유기간 기산일: 용도변경일 YYYY-MM-DD (변경 전 기간 배제) — 근거: 사전법규재산 2022-684" 문장은 `isLthdStartOverridden === true` 조건에만 표시. `lthdStartDateOverrideReason` 문자열 필드는 엔진에서 삭제되어 더 이상 존재하지 않음.

override 미적용 케이스 (`isLthdStartOverridden === false` — 1주택 용도변경 또는 토글 OFF):

```
보유기간 기산일       취득일 (2008.05.02)
보유기간              취득일(2008.05.02) ~ 양도일(2023.02.19) = 14년
§95② 표1 공제율      14년 × 2% = 28%
장기보유특별공제      양도차익 × 28%
```

산식 표기 규칙 (메모리 정책):
- "원" 단위 접미 금지 (`feedback_no_won_suffix.md`)
- 변수 약어(`LTHD_rate` 등) 금지 — 한국어 풀어쓰기 (`feedback_result_view_korean_formula.md`)
- `Math.floor()` 표기 금지 — 묵시 처리
- 법조문 링크: `LawArticleModal` + `/api/law/article` (`feedback_law_article_link.md`)

---

### ⑧ validation — `lib/calc/transfer-tax-validate.ts`

```ts
// 사례 35: 주택→상가 용도변경 validation (AssetForm 측 gb* 접두사 사용)
if (
  asset.assetKind === "general_building" &&
  asset.gbHouseToCommercialConversion === true
) {
  // gbConversionDate 필수
  if (!asset.gbConversionDate) {
    return {
      code: "general_building.house_to_commercial.conversion_date_required",
      message: "주택→상가 용도변경을 선택했습니다. 용도변경일을 입력하세요.",
    };
  }

  // 범위 검증: acquisitionDate ≤ gbConversionDate ≤ transferDate
  if (
    asset.acquisitionDate &&
    asset.gbConversionDate < asset.acquisitionDate
  ) {
    return {
      code: "general_building.house_to_commercial.conversion_date_before_acquisition",
      message: "용도변경일은 취득일 이후여야 합니다.",
    };
  }

  if (
    transferDate &&
    asset.gbConversionDate > formatDateISO(transferDate)
  ) {
    return {
      code: "general_building.house_to_commercial.conversion_date_after_transfer",
      message: "용도변경일은 양도일 이전이어야 합니다.",
    };
  }

  // gbWasMultiHouseAtConversion: null = 미선택 → 명시 선택 강제
  // 초기값이 null이고 RadioCardGroup이 둘 다 OFF 상태이므로 null 도달 가능
  if (asset.gbWasMultiHouseAtConversion === null || asset.gbWasMultiHouseAtConversion === undefined) {
    return {
      code: "general_building.house_to_commercial.multi_house_required",
      message: "변경 당시 다주택자 여부를 선택하세요.",
    };
  }
}
```

**Zod refine 동기화** — Zod 레이어(⑩)에서도 동일 제약을 선언 (서버 측 필드명 접두사 없음):

```ts
// generalBuildingValuationSchema.superRefine 또는 addPropertyRefines 확장
// Zod 측은 엔진 input 필드명(접두사 없음) 사용
.refine(
  (d) => !d.houseToCommercialConversion || typeof d.wasMultiHouseAtConversion === "boolean",
  { message: "변경 당시 다주택자 여부를 선택하세요" }
)
```

> `typeof d.wasMultiHouseAtConversion === "boolean"` 조건: `null`·`undefined` 모두 차단. API body에 `wasMultiHouseAtConversion: null`이 도달하면 Zod가 차단 (validate⑧의 중복 보호 역할). UI 레이어와 서버 레이어가 동일 정책을 가짐 — `feedback_validation_sync_8th_point.md` 준수.

**자동 안분 fallback 금지** (`feedback_no_silent_apportion_fallback.md`): `gbConversionDate` 미입력 시 취득일로 자동 치환하는 코드 경로 **절대 금지**. validate에서 명확한 오류로 차단.

**UI fallback ↔ validate 동기화** (`feedback_validation_sync_8th_point.md`): API 변환(④)에서 `gbHouseToCommercialConversion=false` 시 `gbConversionDate` 미전달 → validate도 `gbHouseToCommercialConversion=false` 시 해당 체크를 수행하지 않음 (동기화 일치). `gbWasMultiHouseAtConversion=null` 차단 정책도 ①②③⑧⑩ 동기화.

---

### ⑨ Zod enum (메인 스키마)

**해당 없음** — 신규 필드 3개 모두 boolean/string(date). 신규 enum 추가 없음.

---

### ⑩ Zod 컴패니언 + `addPropertyRefines`

**위치**: `lib/api/transfer-tax-building-schemas.ts` → `generalBuildingValuationSchema` 내부에 3필드 추가.

```typescript
// generalBuildingValuationSchema 내 추가
/**
 * ⑫ 사례 35: 주택→상가 용도변경 플래그.
 * true 시 `conversionDate`·`wasMultiHouseAtConversion` 의미 있음.
 * false(미전달 포함 — optional) 시 기존 동작 보존.
 */
houseToCommercialConversion: z.boolean().optional(),
/**
 * ⑫ 용도변경일 (YYYY-MM-DD).
 * houseToCommercialConversion=true 시 필수 → addPropertyRefines에서 강제.
 */
conversionDate: z.string().date().optional(),
/**
 * ⑫ 변경 당시 다주택자 여부 (서버 측 필드명 — 접두사 없음).
 * houseToCommercialConversion=true 시 boolean 필수 (.superRefine), 그 외 undefined 가능.
 * null은 UI 레이어에서만 사용 — API 도달 전 validate⑧에서 차단.
 */
wasMultiHouseAtConversion: z.boolean().optional(),
```

`addPropertyRefines` (또는 `generalBuildingValuationSchema.superRefine`):

```typescript
.superRefine((val, ctx) => {
  if (val.houseToCommercialConversion === true && !val.conversionDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["conversionDate"],
      message: "주택→상가 용도변경 시 용도변경일(conversionDate)을 입력하세요.",
    });
  }
})
```

---

### ⑪ acquisitionDate fallback

**변경 없음** — 기존 `acquisitionDate` fallback 로직 그대로. `conversionDate`는 별도 필드이며 acquisitionDate를 대체하지 않음.

---

### ⑫ Zod 입력 객체 정의 ★ (TypeScript 미감지 — 침묵 stripping 방지)

**위치**: `lib/api/transfer-tax-building-schemas.ts` → `generalBuildingValuationSchema`

⑩에서 명시된 3필드가 Zod 객체 정의에 **명시적으로** 포함되어야 함. 미포함 시 Zod가 입력값을 침묵 stripping.

```
grep -n "houseToCommercialConversion" lib/api/transfer-tax-building-schemas.ts
# → generalBuildingValuationSchema 내에 존재해야 함
grep -n "conversionDate" lib/api/transfer-tax-building-schemas.ts
grep -n "wasMultiHouseAtConversion" lib/api/transfer-tax-building-schemas.ts
```

---

### ⑬ `callTransferTaxAPI` body spread ★ (TypeScript 미감지)

**위치**: `lib/calc/transfer-tax-api.ts` → `callTransferTaxAPI()` body 구성부

`buildGeneralBuildingValuation(asset)`이 `houseToCommercialConversion`·`conversionDate`·`wasMultiHouseAtConversion`을 포함한 객체를 반환하면, 기존 `generalBuildingValuation: gbValuation` spread가 자동으로 3필드를 포함.

```
grep -n "generalBuildingValuation" lib/calc/transfer-tax-api.ts
# → gbValuation 객체가 body에 spread되는 위치 확인
# houseToCommercialConversion이 gbValuation에 포함된다면 별도 코드 추가 불필요
```

단, `buildGeneralBuildingValuation()` 내부에서 3필드가 실제로 반환 객체에 포함되는지 확인 필수 (④ 참조).

---

### ⑭ Route handler 엔진 input 매핑 ★ (TypeScript 미감지)

**위치**: `app/api/calc/transfer/general-building-route-helper.ts`

```typescript
// ⑭ 사례 35: 주택→상가 용도변경 Date 변환
const conversionDateCoerced = toOptionalDate(gbRaw.conversionDate);

// 엔진 input 매핑에 추가
...(gbRaw.houseToCommercialConversion
  ? {
      houseToCommercialConversion: true,
      conversionDate: conversionDateCoerced,          // Date | undefined
      wasMultiHouseAtConversion: gbRaw.wasMultiHouseAtConversion ?? false,
    }
  : {}),
```

`toOptionalDate()` 사용 필수 (`lib/api/date-coerce.ts` 정책 — `new Date(x)` 직접 호출 금지).

**grep 자가 점검 (Do 단계 완료 후 필수)**:

```bash
grep -n "houseToCommercialConversion" lib/api/transfer-tax-building-schemas.ts
# → ⑫ Zod 정의에 존재
grep -n "houseToCommercialConversion" lib/calc/transfer-tax-api.ts
# → ⑬ body spread 경로 포함
grep -n "conversionDate" app/api/calc/transfer/general-building-route-helper.ts
# → ⑭ toOptionalDate 변환 등록
grep -n "wasMultiHouseAtConversion" app/api/calc/transfer/general-building-route-helper.ts
# → ⑭ 엔진 input 매핑 존재
```

---

## 4. validation 규칙 상세

| 조건 (AssetForm 측 gb* 접두사) | 오류 코드 | 메시지 |
|---|---|---|
| `gbHouseToCommercialConversion=true` ∧ `gbConversionDate` 없음 | `general_building.house_to_commercial.conversion_date_required` | "주택→상가 용도변경을 선택했습니다. 용도변경일을 입력하세요." |
| `gbConversionDate < acquisitionDate` | `general_building.house_to_commercial.conversion_date_before_acquisition` | "용도변경일은 취득일 이후여야 합니다." |
| `gbConversionDate > transferDate` | `general_building.house_to_commercial.conversion_date_after_transfer` | "용도변경일은 양도일 이전이어야 합니다." |
| `gbHouseToCommercialConversion=true` ∧ `gbWasMultiHouseAtConversion === null` | `general_building.house_to_commercial.multi_house_required` | "변경 당시 다주택자 여부를 선택하세요." |

`gbWasMultiHouseAtConversion` 초기값은 `null` (미선택). `gbHouseToCommercialConversion=true` 토글 ON 이후 RadioCardGroup에서 "예"/"아니오"를 명시 선택해야 validate 통과. boolean default 자동 대입 금지 (`feedback_no_silent_apportion_fallback.md`).

---

## 5. 법령 링크

**환류 결정 (2026-05-13)**: 사전법규재산·서울행법은 **국세청 예규·판례**로 `LawArticleModal` + `/api/law/article` 검색 대상이 아니므로 **모달 trailing 배지 미적용**. 한국어 텍스트로 hint·결과 행에 명시.

| 위치 | 조문 | 표시 방식 |
|---|---|---|
| DateInput "용도변경일" | 사전법규재산 2022-684 | hint 텍스트 (LawArticleModal 미적용 — 예규 예외) |
| RadioCardGroup hint | 사전법규재산 2022-684·881 / 서울행법 2012구단26961 | hint 텍스트 |
| 결과 카드 ⑦ override 행 | 사전법규재산 2022-684 | 행 value 텍스트 "(변경 전 보유기간 배제 — 사전법규재산 2022-684)" |
| 결과 카드 장특공제 | 소득세법 §95② | `LawArticleModal` 사용 가능 (조문 단위) — 본 PR 범위 밖, 후속 통일 PR에서 처리 |

> **후속 PR 트리거**: 예규/판례 전용 모달(`PrecedentArticleModal`) 컴포넌트 또는 외부 링크 fallback 도입 시 trailing 배지로 환원 검토.

---

## 6. 결과 표시 정책

1. "원" 단위 접미 금지 (`feedback_no_won_suffix.md`) — 모든 숫자 뒤 "원" 생략
2. 변수 약어(`LTHD_rate`, `P_F`) 금지 — 한국어 풀어쓰기 (`feedback_result_view_korean_formula.md`)
3. `Math.floor()` 표기 금지 — 산식에 미기재, 묵시 처리
4. 법정 용어 우선: "장기보유특별공제" (LTHD 약어 금지), "용도변경일" (conversion date 금지)
5. 중간 산술 결과(예: "0.00% × 400,000,000") 미표시 — 입·출력 연결 산식만 표시

---

## 7. 회귀 보호

### 7.1 토글 OFF 회귀 (사례 31~33)

`gbHouseToCommercialConversion === false` (또는 undefined) 시:
- API 변환(④)에서 3필드 미전달 (조건부 spread — `asset.gbHouseToCommercialConversion=false` 시 미실행)
- Zod(⑫)에서 optional이므로 통과
- Route handler(⑭)에서 조건부 spread 미실행
- 엔진: `resolveLTHDStartForHouseToCommercial()` 진입 안 함 → 기존 취득일 기산 그대로
- 사례 31·32·33 anchor 전부 회귀 zero 보장

### 7.2 1주택 케이스 회귀 (gbWasMultiHouseAtConversion=false)

```typescript
// 엔진 분기 (Plan §5-2) — 엔진 측 필드명(접두사 없음)
function resolveLTHDStartForHouseToCommercial(asset): Date {
  if (!asset.houseToCommercialConversion) return asset.acquisitionDate;     // 토글 OFF
  if (!asset.wasMultiHouseAtConversion) return asset.acquisitionDate;       // 1주택
  return asset.conversionDate;                                              // 다주택
}
```

1주택 케이스(anchor 35-7): AssetForm `gbWasMultiHouseAtConversion=false` + `gbConversionDate` 입력 → API 변환에서 `wasMultiHouseAtConversion: false`로 전달 → `acquisitionDate` 기산이 보장되어야 함. `gbConversionDate` 입력값이 LTHD에 영향 zero.

---

## 8. tone 매핑 최종

| 컴포넌트 | tone | 이유 |
|---|---|---|
| "환산취득가 사용" ToggleCard | violet | 환산 방식 선택 (사례 31) |
| ① 면적·층수 카드 | sky | 면적·규모 |
| ② 양도시 기준시가 카드 | emerald | 양도시점 |
| ③ 취득시 기준시가 카드 | amber | 취득시점 |
| ④ 비사업용토지 카드 | rose | 지역·용도 |
| ⑤ 신축 정보 카드 | amber | 취득 정보 계열 (사례 32) |
| ⑥ 증축 섹션 ToggleCard | fuchsia | 취득 후 추가 이벤트 — 증축 (사례 33) |
| **⑦ 주택→상가 용도변경 ToggleCard** | **fuchsia** | 취득 후 신분변경 이벤트 — 용도변경 (사례 35). 후속 PR #4로 ToggleCardTone에 fuchsia 추가됨 |

> **tone 결정 사유 (2026-05-13)**: ⑥ 증축과 ⑦ 용도변경 모두 fuchsia 사용 — "취득 완료 후 발생하는 추가 이벤트" 의미 계열. 후속 PR #4(`f848b6d` 이후)에서 `ToggleCardTone`에 `fuchsia` 정식 추가되어 두 섹션 모두 tone API로 통일.

---

## 9. 800줄 정책 — 파일 크기 점검

| 파일 | 현재 줄 수 | 예상 추가 | 예상 후 | 분할 신호 |
|---|---|---|---|---|
| `lib/stores/calc-wizard-asset.ts` | 762 | +~25줄 (3 필드 + 주석) | ~787 | **경계. 주석 간결하게 유지.** |
| `lib/calc/transfer-tax-validate.ts` | 736 | +~25줄 | ~761 | **경계. validate-gb.ts 분리 고려.** |
| `lib/api/transfer-tax-building-schemas.ts` | 184 | +~15줄 | ~199 | OK |
| `lib/calc/transfer-tax-api-helpers.ts` | 645 | +~10줄 | ~655 | OK |
| `app/api/calc/transfer/general-building-route-helper.ts` | 확인 필요 | +~10줄 | — | Do 단계 진입 전 확인 |
| `components/calc/transfer/GeneralBuildingBlock.tsx` | 확인 필요 | +~60줄 | — | Do 단계 진입 전 확인 |

> **Do 단계 진입 전**: `transfer-tax-validate.ts`가 800줄 초과 위험 시 `validate-gb.ts` 도메인 분리 먼저 수행 (메모리 `feedback_validate_split_signal.md` 참조).

---

## 10. 정책 매트릭스

| # | 정책 메모리 | 본 UI 디자인 적용 |
|---|---|---|
| 1 | `feedback_no_silent_apportion_fallback.md` | `gbConversionDate` 미입력 시 취득일 자동 대체 금지. validate⑧에서 명시적 오류로 차단. |
| 2 | `feedback_useeffect_store_mirror_forbidden.md` | ToggleCard onChange에서 `gbHouseToCommercialConversion`만 업데이트. `gbConversionDate`·`gbWasMultiHouseAtConversion` 자동 초기화 금지. 미리보기 카드는 useMemo 순수. |
| 3 | `feedback_validation_sync_8th_point.md` | ④ API fallback(`gbHouseToCommercialConversion=false` 시 미전달) ↔ ⑧ validate(`gbHouseToCommercialConversion=false` 시 체크 skip) — 동기화 일치. |
| 4 | `feedback_transfer_year_tax_rate.md` | anchor 값(133,060,000 / 13,306,000)은 양도일(2023년) 법정 누진세율표 §55로 직접 검산. 외부 자료 추종 금지. |
| 5 | `feedback_result_view_korean_formula.md` | 결과 카드 ⑦에서 변수 약어·floor 금지, 한국어 풀어쓰기, 법정 용어. |
| 6 | `feedback_no_won_suffix.md` | 모든 숫자 뒤 "원" 생략. |
| 7 | `feedback_api_zod_schema_sync.md` | 14지점 전수. 특히 ⑫⑬⑭ TypeScript 미감지 구간 grep 자가 점검 명시. |
| 8 | `feedback_date_input.md` | `DateInput` 컴포넌트 사용. `type="date"` native input 금지. |
| 9 | `feedback_toggle_card_visibility.md` | ToggleCard OFF 상태에도 `bg-fuchsia-50/70` tone 배경 유지. 회색 배경 금지. |

---

## 11. Anchor 테스트 계획 (엔진 시니어 협업)

`__tests__/tax-engine/transfer/case-35-house-to-commercial.anchor.test.ts`

| # | 케이스 | 핵심 검증 포인트 |
|---|---|---|
| 35-1 | **PDF 메인 — 다주택 + 중과배제기간** | `longTermDeduction=0`, `calculatedTax=133,060,000`, `localIncomeTax=13,306,000` |
| 35-2 | 1주택 용도변경 (gbWasMultiHouseAtConversion=false) | 보유기간 기산 = 취득일(2008-05-02). 14년 → 표1 28% |
| 35-3 | **다주택 + 변경일부터 5년 보유** (`gbConversionDate=2015-01-01`, `transferDate=2020-01-15`) | 보유기간 5년 → 표1 연 2% × 5년 = **10%** |
| 35-4a | validate 차단 — gbConversionDate 누락 | `code: "general_building.house_to_commercial.conversion_date_required"` |
| 35-4b | validate 차단 — gbWasMultiHouseAtConversion 미선택(null) | `code: "general_building.house_to_commercial.multi_house_required"`. RadioCardGroup 둘 다 OFF(null) 상태에서 계산 시도 → 오류 |
| 35-5 | **경계값 ★ — 변경일 기준 정확히 3년 0일** | 표1 6% (3년 미만 → 0% / 3년 이상 → 진입) 경계 회귀 보호 |
| 35-6 | **.skip** — 다주택 + 중과배제기간 직전 양도 (2022-05-09) | 후속 PR 트리거 주석 — 중과세율 분기 범위 밖 |
| 35-7 | 1주택 케이스 + gbConversionDate 입력 | `gbWasMultiHouseAtConversion=false` → 취득일 기산 보장, gbConversionDate 영향 zero |

---

## 12. DoD 자가 점검 체크리스트

- [ ] **디자인 문서 14지점 전수 enumerate** (본 문서 §3) ✅
- [ ] ⑫⑬⑭ TypeScript 미감지 항목 grep 명시 ✅
- [ ] 케이스 매트릭스 3행 이상 (§2) ✅
- [ ] 사용자 시나리오 ≥ 1 (§1) ✅
- [ ] 자동 안분 fallback 금지 (⑧, §10 정책 #1) ✅
- [ ] useEffect 미러링 금지 (⑤, §10 정책 #2) ✅
- [ ] validate ↔ API fallback 동기화 (⑧, §10 정책 #3) ✅
- [ ] 엔진 시니어 필드 타입과 일치 (`engine.design.md` 참조 — 동시 작성 중)
- [ ] [ ] Do 단계: `npx tsc --noEmit` 0건
- [ ] [ ] Do 단계: `npx vitest run __tests__/tax-engine/transfer/` 통과
- [ ] [ ] Do 단계: 브라우저 수동 확인 (Network 탭 request body에 `houseToCommercialConversion`·`conversionDate`·`wasMultiHouseAtConversion` 확인 — AssetForm `gbHouseToCommercialConversion`·`gbConversionDate`·`gbWasMultiHouseAtConversion` → API body로 매핑됨)
- [ ] [ ] Do 단계: `ui-engine-sync-checker` 0 누락

---

## 13. Status

| 단계 | 상태 |
|---|---|
| 1. PM/Plan | ✅ 완료 (`case-35-house-to-commercial-conversion.plan.md`) |
| 2. Design (engine) | 작성 중 (transfer-tax-senior 동시 진행) |
| 2. Design (UI) | ✅ **본 문서** |
| 3. Do (engine senior) | ☐ TODO |
| 3. Do (UI senior) | ☐ TODO |
| 4. Check | ☐ TODO |
| 5. Act | ☐ TODO |

다음 단계는 **3단계 Do** — 엔진 디자인 문서 완성 후 `transfer-tax-senior`·`transfer-tax-ui-senior` 동시 병렬 호출.

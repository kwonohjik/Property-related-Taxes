# 사례 32 — 신축 건물 단기양도 §114조의2 5% 가산세 (일반건물 환산취득가) — UI 디자인

**작성일**: 2026-05-10
**작성자**: PDCA Phase 2 (transfer-tax-ui-senior 위임 예정)
**선행 완료**: 사례 31 (`case-31-general-building.ui.design.md`, propertyType "general_building", gb* 8필드)
**엔진 디자인**: `case-32-general-building-short-term.engine.design.md`
**승인된 plan**: `.claude/plans/image-1-image-2-logical-lollipop.md`

본 문서는 사례 31 UI 디자인 위에 **델타(추가 분)만** 명세한다. 기존 GeneralBuildingBlock의 ①~④ 섹션은 변경 없음.

---

## 1. 사용자 시나리오 (사례 32 — 11단계)

예제 PDF #32: 갑씨가 서울 성북구 석관동 248-3 토지 2008.3.17 취득 → 2018.3.31 2층 근린생활시설(소매점) **자가신축 완공** → 2023.2.19 1,620,000,000원 양도.

| 단계 | 사용자 행동 | UI 반응 |
|---|---|---|
| 1 | Step1 → "자산 추가" → 자산종류 **"일반건물(토지+건물 일괄)"** 선택 | `assetKind: "general_building"` |
| 2 | 취득원인 **"매매"** 선택 (토지) | `acquisitionCause: "purchase"` |
| 3 | "환산취득가 사용" ToggleCard ON | `gbUseEstimatedAcquisition: true`. GeneralBuildingBlock 펼침. |
| 4 | 면적 입력: 토지면적 205㎡ / 건물 연면적 271.28㎡ / 수평투영면적 ≈135.64㎡(2층 균등 가정) | DecimalInput × 3 |
| 5 | 양도시 기준시가: 공시지가(원/㎡) **5,514,000** [LandPriceLookupField, 2022년] / 건물기준시가 총액 [국세청 조회] | emerald 카드 |
| 6 | 취득시 기준시가: 공시지가(원/㎡) **3,920,000** [LandPriceLookupField, 2007년] / 건물기준시가 총액 [국세청 조회] | amber 카드 |
| **7** | **★ 신축 정보 ToggleCard "자가건축(신축취득)" ON** | `gbIsSelfBuilt: true`. 신축 정보 섹션 펼침. amber 카드 ⑤ 신규. |
| **8** | **★ 건물 취득일 입력 2018-03-31** [DateInput, hint: "사용승인서 교부일·사실상 사용일·임시사용승인일 중 빠른 날 (영 §162①4호)"] | `gbBuildingAcquisitionDate: "2018-03-31"`. 양도일−건물취득일 < 5년 자동 계산 → 안내 배지 표시. |
| 9 | 양도가액 1,620,000,000 / 토지 취득일 2008-03-17 / 양도일 2023-02-19 | 기존 자산-수준 필드 |
| 10 | 비사업용토지 정보(용도지역·수도권) — 본 사례는 사업용 가정으로 통과 | ④ 섹션 |
| 11 | "계산" → 결과 화면 | 양도소득금액 합계 **283,833,151** + **§114조의2 가산세 13,300,202** 라인 표시 |

---

## 2. 케이스 인벤토리 표 (사례 31 G-* 표 확장)

| # | 케이스 | assetKind | gbUseEstimated | **gbIsSelfBuilt** | **buildingAcq vs landAcq** | 본 작업 |
|---|---|---|---|---|---|---|
| G-01 | 사례 31 본 — 토지·건물 동일 취득일 | general_building | true | undefined | 동일(fallback) | ☑ 기존 |
| G-02 | 일반건물·일괄·실가 | general_building | false | — | — | 기구현(`actualPriceMode`) |
| G-03 | 일반건물·각각 별도 양도 | general_building | — | — | — | 후속 PDCA |
| **G-04 ★** | **사례 32 — 자가신축 + 단기 5년 이내** | **general_building** | **true** | **true** | **다름** | **★ 본 작업** |
| G-05 | 자가신축 + 5년 이상 | general_building | true | true | 다름 | 후속(경계 가드만 본 작업) |
| G-06 | 매입 + 토지·건물 다른 취득일 | general_building | true | false | 다름 | 후속 PDCA (가산세 미적용) |

**★ 본 작업 DoD = G-04 + G-05·G-06 경계 가드 회귀 anchor만**.

---

## 3. 14개 동기화 지점 매트릭스 (사례 31 위에 델타)

| # | 지점 | 사례 31 상태 | 사례 32 델타 | 위치 |
|---|---|---|---|---|
| ① | 폼 상태 타입 | `gbUseEstimatedAcquisition`, `gb*` 8필드 | **추가**: `gbIsSelfBuilt: boolean`, `gbBuildingAcquisitionDate: string` | `lib/stores/calc-wizard-asset.ts` `AssetForm` |
| ② | initial value | gb* 8필드 default | **추가**: `gbIsSelfBuilt: false`, `gbBuildingAcquisitionDate: ""` | `lib/stores/calc-wizard-asset.ts` `INITIAL_ASSET_FORM` (또는 동등) |
| ③ | normalize fallback | gb* 8필드 normalize | **추가**: 둘 다 위 default | `lib/stores/calc-wizard-asset.ts` `normalizeAsset` |
| ④ | API 변환 | `buildGeneralBuildingValuation()` gb* 8필드 수집 | **추가 2줄**: `buildingAcquisitionDate: asset.gbBuildingAcquisitionDate \|\| undefined`, `isSelfBuilt: asset.gbIsSelfBuilt ?? false` | `lib/calc/transfer-tax-api-helpers.ts:165~` |
| ⑤ | UI 입력 위젯 | GeneralBuildingBlock ①~④ 섹션 | **추가**: ⑤ 신축 정보 섹션 (ToggleCard + DateInput + 안내 배지) | `components/calc/transfer/GeneralBuildingBlock.tsx` |
| ⑥ | 사이드바 합계 | 변경 없음 | **변경 없음** (가산세는 결과 단계) | — |
| ⑦ | 결과 카드 산식 | 1차 통산 결과 표시 | **추가 라인**: "환산취득가액 가산세 (소득세법 §114조의2 ①)" — 산식 `건물 환산취득가 266,004,044 × 5% = 13,300,202` | `components/calc/transfer/result/BundledAllocationCard.tsx` (또는 결과 카드 파일) |
| ⑧ | validation | gbUseEstimated=true 시 gb* 필수 | **추가**: `gbIsSelfBuilt === true` AND 환산 모드 → `gbBuildingAcquisitionDate` 필수 + `gbBuildingAcquisitionDate >= acquisitionDate(토지)` | `lib/calc/transfer-tax-validate.ts` |
| ⑨ | Zod enum (메인) | 변경 없음 | **변경 없음** (boolean·date만 추가) | — |
| ⑩ | Zod enum (companion) | 변경 없음 | **변경 없음** | — |
| ⑪ | 자산-수준 acquisitionDate fallback | gbUseEstimated 모드만 | **신규**: building 별도 acquisitionDate 처리 자체 | 본 작업 |
| ⑫ | **Zod 입력 객체 정의 ★** | `generalBuildingValuationSchema` 8필드 | **추가 2필드**: `buildingAcquisitionDate: z.string().date().optional()`, `isSelfBuilt: z.boolean().optional()` | `lib/api/transfer-tax-schema.ts:50-75` |
| ⑬ | callTransferTaxAPI body spread | `gbValuation` 객체 spread | **자동** (객체 자체에 새 필드 포함되므로 spread 자동) | `lib/calc/transfer-tax-api.ts:540` 부근 |
| ⑭ | **Route handler 엔진 매핑 ★** | `coerceDates(["transferDate", "acquisitionDate"])` | **추가**: `coerceDates(["generalBuildingValuation.buildingAcquisitionDate"])` | `app/api/calc/transfer/route.ts` |

**TypeScript 미감지 영역(⑫⑬⑭) grep 자가 점검**:
- `grep -n "buildingAcquisitionDate" lib/api/transfer-tax-schema.ts` — Zod 정의 확인
- `grep -n "buildingAcquisitionDate" app/api/calc/transfer/route.ts` — coerceDates 등록 확인
- `grep -n "generalBuildingValuation" lib/calc/transfer-tax-api.ts` — body spread 경로 확인

---

## 4. ⑤ 신축 정보 섹션 UI 명세 (신규)

### 4.1 위치

GeneralBuildingBlock ④ 비사업용토지 판정 섹션 **직전**(즉 ③ 취득시 기준시가와 ④ 사이). amber 톤 (취득 정보 계열과 통일).

### 4.2 마크업 (제안)

```tsx
<SectionCard tone="amber" number={5} title="신축 정보">
  <ToggleCard
    label="자가건축(신축취득)"
    description="건물을 직접 신축하여 취득한 경우 ON. 5년 이내 양도 시 환산취득가액 가산세(소득세법 §114조의2 ①)."
    checked={asset.gbIsSelfBuilt ?? false}
    onChange={(checked) => {
      onAssetChange({
        gbIsSelfBuilt: checked,
        // 정책 #2: useEffect 미러링 금지 — onChange에서 직접 클리어
        ...(!checked ? { gbBuildingAcquisitionDate: "" } : {}),
      });
    }}
  />

  {asset.gbIsSelfBuilt && (
    <FieldCard
      label="건물 취득일"
      hint="사용승인서 교부일·사실상 사용일·임시사용승인일 중 빠른 날 (소득세법 시행령 §162① 4호)"
      trailing={
        <LawArticleBadge
          law="소득세법 시행령"
          article="제162조 제1항 4호"
        />
      }
    >
      <DateInput
        value={asset.gbBuildingAcquisitionDate ?? ""}
        onChange={(value) => onAssetChange({ gbBuildingAcquisitionDate: value })}
      />
    </FieldCard>
  )}

  {asset.gbIsSelfBuilt && asset.gbBuildingAcquisitionDate && transferDate && (
    <SurtaxNoticeBadge
      visible={isWithin5Years(asset.gbBuildingAcquisitionDate, transferDate)}
    >
      환산취득가액 가산세 적용 — 건물 환산취득가액의 5% (소득세법 §114조의2 ①)
    </SurtaxNoticeBadge>
  )}
</SectionCard>
```

### 4.3 필드별 사양

| 필드 | 컴포넌트 | 타입 | 라벨 | 검증 |
|---|---|---|---|---|
| `gbIsSelfBuilt` | `ToggleCard` | boolean | "자가건축(신축취득)" | — |
| `gbBuildingAcquisitionDate` | `DateInput` | YYYY-MM-DD | "건물 취득일" | gbIsSelfBuilt=true 시 필수, ≥ 토지 acquisitionDate |

### 4.4 안내 배지 (양도일 − 건물취득일 < 5년 시 자동 표시)

- 색상: amber-500 강조
- 문구: **"환산취득가액 가산세 적용 — 건물 환산취득가액의 5% (소득세법 §114조의2 ①)"**
- 표시 조건: `asset.gbBuildingAcquisitionDate && transferDate && (transferDate − gbBuildingAcquisitionDate) < 5년`
- useMemo로 파생 계산 (정책 #2 — useEffect 사용 금지)

---

## 5. 결과 카드 ⑦ — 가산세 라인 명세

### 5.1 위치

`BundledAllocationCard` 또는 `GeneralBuildingResultCard` 하단, **결정세액 라인 직후, 지방소득세 라인 직전**.

### 5.2 표시 조건

`result.penaltyTax > 0 && result.penaltyBase > 0` (사례 31에서는 false → 미표시)

### 5.3 마크업

```tsx
{result.penaltyTax > 0 && (
  <ResultRow
    label="환산취득가액 가산세 (소득세법 §114조의2 ①)"
    formula={`건물 환산취득가 ${result.penaltyBase.toLocaleString()} × 5%`}
    amount={result.penaltyTax}
    legalBasis="소득세법 §114조의2"
  />
)}
```

### 5.4 산식 표시 규칙 (정책 — 메모리)

- "원" 단위 접미 금지 (`feedback_no_won_suffix.md`)
- 변수 약어·`floor()` 금지 (`feedback_result_view_korean_formula.md`) — 한국어 풀어쓰기
- 법조문 링크: `LawArticleModal` + `/api/law/article` (`feedback_law_article_link.md`)

---

## 6. validate ⑧ — 차단 메시지 명세

### 6.1 차단 조건

```ts
if (
  asset.assetKind === "general_building"
  && asset.gbUseEstimatedAcquisition === true
  && asset.gbIsSelfBuilt === true
  && !asset.gbBuildingAcquisitionDate
) {
  return {
    code: "general_building.self_built.acquisition_date_required",
    message: "자가건축(신축취득)을 선택했습니다. 건물 취득일(영 §162①4호 빠른 날)을 입력하세요.",
  };
}

if (
  /* 위 조건 + */ asset.gbBuildingAcquisitionDate
  && asset.acquisitionDate
  && asset.gbBuildingAcquisitionDate < asset.acquisitionDate
) {
  return {
    code: "general_building.self_built.acquisition_date_before_land",
    message: "건물 취득일은 토지 취득일 이후여야 합니다.",
  };
}
```

### 6.2 자동 안분 fallback 금지 (정책 #1)

- gbBuildingAcquisitionDate 미입력 시 면적·시점 비율로 자동 채우기 **금지**
- placeholder 문구 "(필수)" 또는 "사용승인일 직접 입력"
- 검증 메시지에 "어디서 값을 가져와야 하는지" 안내 (영 §162① 4호 빠른 날)

---

## 7. UI 컴포넌트 차원 분할 점검 (800줄 정책)

| 파일 | 현재 | 예상 후 | 분할 신호 |
|---|---|---|---|
| `GeneralBuildingBlock.tsx` | 247 | ~290 | OK (여유 510줄) |
| `BundledAllocationCard.tsx` (또는 결과 카드) | 확인 필요 | +5~10줄 | 확인 후 결정 |
| `lib/stores/calc-wizard-asset.ts` | 확인 필요 | +2 필드 | 확인 후 결정 |
| `lib/calc/transfer-tax-api-helpers.ts` | 확인 필요 | +2줄 | 확인 후 결정 |
| `lib/calc/transfer-tax-validate.ts` | 확인 필요 | +10~20줄 | 확인 후 결정 |

**Do 단계 진입 전 UI 시니어가 위 5개 파일 줄 수 확인 필수**.

---

## 8. 정책 적용 매트릭스 (1단계 PM 점검 결과 반영)

| # | 정책 메모리 | 본 UI 디자인 적용 |
|---|---|---|
| 1 | `feedback_no_silent_apportion_fallback.md` | ⑧ validation 차단 메시지 + 자동 fallback 코드 경로 없음. placeholder "(필수)". |
| 2 | `feedback_useeffect_store_mirror_forbidden.md` | ⑤ 섹션 ToggleCard onChange 핸들러에서 직접 처리. useEffect 사용 금지 코드 패턴 §4.2에 명시. |
| 3 | `feedback_transfer_year_tax_rate.md` | UI는 anchor 직접 다루지 않음 — 결과 표시만. |
| 4 | `feedback_estimated_deduction_separation.md` | 결과 카드 ⑦에서 환산취득가·개산공제 분리 표시 (사례 31 패턴 그대로). 가산세 라인은 별도. |
| 5 | `feedback_3point_input_consistency.md` | 본 사례 신규 필드는 가격 아님 → 무관. |

추가 공통 UI 정책:
- `feedback_date_input.md` — `DateInput` 사용 (type="date" 금지)
- `feedback_select_on_focus.md` — `SelectOnFocusProvider` 자동 적용
- `feedback_section_card_numbering.md` — amber tone + ⑤ 번호 원형
- `feedback_toggle_card_visibility.md` — ToggleCard, OFF 상태에도 tone 배경 유지
- `feedback_law_article_link.md` — `LawArticleModal` + `/api/law/article`

---

## 9. Status

| 단계 | 상태 |
|---|---|
| 1. PM/Plan | ✅ 완료 |
| 2. Design (engine) | ✅ `case-32-general-building-short-term.engine.design.md` |
| 2. Design (UI) | ✅ 본 문서 |
| 3. Do (engine senior) | ☐ TODO |
| 3. Do (UI senior) | ☐ TODO |
| 4. Check | ☐ TODO |
| 5. Act | ☐ TODO |

다음 단계는 **3단계 Do** — 엔진 시니어와 UI 시니어 동시 병렬 호출 (단일 Agent 메시지 권장).

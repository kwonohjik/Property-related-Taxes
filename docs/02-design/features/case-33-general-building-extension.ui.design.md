# 사례 33 — 증축 건물 환산취득가 (일반건물 확장) — UI 디자인

**작성일**: 2026-05-11
**작성자**: transfer-tax-ui-senior
**선행 완료**: 사례 31 (`case-31-general-building.ui.design.md`, gb* 8필드) + 사례 32 (`case-32-general-building-short-term.ui.design.md`, gbIsSelfBuilt / gbBuildingAcquisitionDate)
**승인된 plan**: `.claude/plans/lazy-gathering-lemur.md`
**엔진 디자인**: 별도 `.engine.design.md` (transfer-tax-senior 동시 작성)

본 문서는 사례 31·32 UI 디자인 위에 **델타(증축 분)만** 명세한다. 기존 GeneralBuildingBlock의 ①~⑤ 섹션은 변경 없음. 결과 카드는 2-way(토지/건물) → 3-way(토지/건물1/건물2) 분기를 신규 추가한다.

---

## 1. 사용자 시나리오 (9단계)

양도코리아 사례 33: 갑씨가 서울 동작구 사당동 132-10 일반건물(상가)을 2003-03-17 취득가액 200,000,000원(토지+건물 일괄), 필요경비 8,000,000원으로 취득. 2007-07-24 건물 증축(실가 입증 불가). 2023-02-19 330,000,000원으로 양도. 증축분(건물2) 취득가액을 환산취득가로 계산 → 산출세액 **6,480,952** / 지방세 **648,095**.

| 단계 | 사용자 행동 | UI 반응 |
|---|---|---|
| 1 | Step1 → "자산 추가" → 자산종류 **"일반건물(토지+건물 일괄)"** 선택 | `assetKind: "general_building"` 설정. 기본 취득원인 라디오 표시. |
| 2 | 취득원인 **"매매"** 선택 (토지+건물1 모두 실거래가로 취득) | `acquisitionCause: "purchase"` (gbLandAcquisitionCause · gbBuildingAcquisitionCause 기존 필드) |
| 3 | "환산취득가 사용" ToggleCard ON | `gbUseEstimatedAcquisition: true`. GeneralBuildingBlock 펼침. |
| 4 | 기존 ①~③ 섹션: 면적·기준시가 입력. 토지면적·건물 연면적·층수 + 양도시·취득시 기준시가(토지 공시지가·건물1 기준시가 총액) | 사례 31·32와 동일 경로. |
| **5** | **★ "증축 있음" ToggleCard ON** | `gbHasExtension: true`. 증축 6필드 섹션 펼침. tone="fuchsia" 섹션 카드 ⑥. |
| **6** | **★ 증축일 입력**: 2007-07-24 [DateInput] | `gbExtensionDate: "2007-07-24"`. 토지취득일(2003-03-17) ∈ 날짜 범위 검증 준비. |
| **7** | **★ 증축 면적 입력**: 83.72㎡ [DecimalInput] | `gbExtensionArea: "83.72"`. 정보용 필드 — 안분식 미사용, 위치지수 확장 대비. |
| **8** | **★ 양도시 건물2 기준시가 총액·취득시(증축시) 건물2 기준시가 총액 입력** [CurrencyInput × 2] | `gbTransferExtensionBuildingStdPrice` / `gbAcquisitionExtensionBuildingStdPrice`. hint: "㎡당 단가가 아닌 총액(원) 입력". |
| **9** | **★ 증축 취득원인 선택**: 자가증축 (RadioCardGroup) | `gbExtensionAcquisitionCause: "newConstruction"`. |
| 10 | 일괄 취득가 200,000,000 / 필요경비 8,000,000 입력 | 기존 자산-수준 필드 경로. |
| 11 | "계산" 실행 → 결과 화면 | 3-way 안분표(토지/건물1/건물2) + 통산 후 양도소득금액 53,503,969 + 산출세액 **6,480,952** 확인. |

---

## 2. 케이스 인벤토리 표 (사례 31·32 G-* 확장)

| # | 케이스 | assetKind | gbUseEstimated | gbHasExtension | gbExtensionAcquisitionCause | 본 작업 |
|---|---|---|---|---|---|---|
| G-01 | 사례 31 — 토지·건물 동일 취득일·환산 | general_building | true | false(default) | — | ☑ 기존 |
| G-02 | 일반건물·일괄·실가 | general_building | false | false | — | ☑ 기존 |
| G-03 | 일반건물·각각 별도 양도 | general_building | — | — | — | 후속 PDCA |
| G-04 | 사례 32 — 자가신축 + 단기양도 | general_building | true | false | — | ☑ 기존 |
| G-05 | 자가신축 + 5년 이상(경계 가드) | general_building | true | false | — | ☑ 기존 |
| **G-06 ★** | **사례 33 — 증축 없음·실가(G-01 회귀 확인)** | general_building | true | **false** | — | **회귀 가드만** |
| **G-07 ★** | **사례 33 — 증축·자가증축 (primary anchor)** | general_building | true | **true** | **newConstruction** | **★ 본 작업** |
| **G-08 ★** | **증축·매매취득** | general_building | true | **true** | **purchase** | **★ 본 작업 — 매매 분기 검증** |
| **G-09 ★** | **증축 + 토지 취득일 이전 날짜 (validate 차단)** | general_building | true | **true** | — | **★ 본 작업 — validate** |
| **G-10 ★** | **증축 + 양도일 이후 날짜 (validate 차단)** | general_building | true | **true** | — | **★ 본 작업 — validate** |
| **G-11 ★** | **증축 + 기준시가 0 (validate 차단)** | general_building | true | **true** | — | **★ 본 작업 — validate** |
| **G-12 ★** | **증축 + gbHasExtension=false 정리** | general_building | true | **false** (OFF) | — | **★ normalize 가드** |
| G-13 | 증축 + 토지 상속(landAcquisitionCause=inheritance) | general_building | true | true | newConstruction | 후속 PDCA (cross-cutting) |
| G-14 | 증축 2회 이상 (건물3) | general_building | true | true×2 | — | 후속 PDCA |

**★ 본 작업 DoD = G-07·G-08·G-09·G-10·G-11·G-12 + G-01 회귀 회귀 가드(G-06). G-13·G-14는 후속 PDCA.**

---

## 3. 14개 동기화 지점 매트릭스 (사례 31·32 위에 델타)

| # | 지점 | 사례 31·32 상태 | 사례 33 델타 | 위치 |
|---|---|---|---|---|
| ① | 폼 상태 타입 | gb* 10필드(31+32) | **추가 6필드**: `gbHasExtension: boolean`, `gbExtensionDate: string`, `gbExtensionArea: string`, `gbTransferExtensionBuildingStdPrice: string`, `gbAcquisitionExtensionBuildingStdPrice: string`, `gbExtensionAcquisitionCause: "purchase" \| "newConstruction"` | `lib/stores/calc-wizard-asset.ts` `AssetForm` |
| ② | initial value | gb* 10필드 default | **추가**: `gbHasExtension: false`, `gbExtensionDate: ""`, `gbExtensionArea: ""`, `gbTransferExtensionBuildingStdPrice: ""`, `gbAcquisitionExtensionBuildingStdPrice: ""`, `gbExtensionAcquisitionCause: "newConstruction"` | `lib/stores/calc-wizard-asset.ts` `INITIAL_ASSET_FORM` (또는 createInitialAssetForm) |
| ③ | normalize fallback | gb* 10필드 normalize | **추가**: 6필드 `??=` 기본값. `gbHasExtension=false`일 때 나머지 5필드 폐기(`gbExtensionDate=""` 등 정리) — legacy sessionStorage 호환 | `lib/stores/calc-wizard-asset.ts` `normalizeAsset` |
| ④ | API 변환 | `buildGeneralBuildingValuation()` 10필드 수집 | **추가**: `gbHasExtension=true` 시 `extensionInfo` 객체 빌드 → `GeneralBuildingInput` spread. `gbHasExtension=false` 시 undefined — 미전달 | `lib/calc/transfer-tax-api-helpers.ts` |
| ⑤ | UI 입력 위젯 | GeneralBuildingBlock ①~⑤ 섹션 | **추가**: ⑥ 증축 섹션 ToggleCard + DateInput + DecimalInput + CurrencyInput×2 + RadioCardGroup | `components/calc/transfer/GeneralBuildingBlock.tsx` |
| ⑥ | 사이드바 합계 | 변경 없음(사례 31·32) | **변경 없음** — 증축 환산취득가는 API 결과 후 확정, 사이드바 미표시 | — |
| ⑦ | 결과 카드 산식 | 2-way(토지/건물) 안분표 | **추가**: `extensionInfo` 반환 시 3-way(토지/건물1/건물2/합계) 4열 표 분기 + 건물2 "(환산)" 배지 + 영 §102② 통산 후 양도소득금액 행 | `components/calc/results/BundledAllocationCard.tsx` (또는 `GeneralBuildingValuationDetailCard.tsx`) |
| ⑧ | validation | gbUseEstimated·isSelfBuilt 차단 | **추가**: `gbHasExtension=true` 시 5필드 필수 + 증축일 ∈ (토지취득일, 양도일) + 면적 > 0 + 두 기준시가 > 0 + 단위 오인 차단 메시지 | `lib/calc/transfer-tax-validate.ts` |
| ⑨ | Zod enum (메인) | 변경 없음 | **추가**: `extensionAcquisitionCause: z.enum(["purchase", "newConstruction"])` — extensionInfo 서브객체 안에 포함 | `lib/api/transfer-tax-schema.ts` |
| ⑩ | Zod enum (companion) | 변경 없음 | **추가**: extensionAcquisitionCause enum re-export 확인 + `addPropertyRefines` 헬퍼 타입 반영 | `lib/api/transfer-tax-schema-sub.ts` |
| ⑪ | acquisitionDate fallback | 건물2 카드 extensionDate 사용 | **신규**: 건물2 카드의 acquisitionDate = extensionDate (route handler 주입 시 단일 진실) | `app/api/calc/transfer/general-building-route-helper.ts` |
| ⑫ | **Zod 입력 객체 정의 ★** | `generalBuildingValuationSchema` 12필드 | **추가 서브객체**: `extensionInfoSchema = z.object({extensionDate, extensionArea, transferExtensionBuildingStdPrice, acquisitionExtensionBuildingStdPrice, extensionAcquisitionCause})` 신규 정의. `generalBuildingValuationSchema`에 `extensionInfo: extensionInfoSchema.optional()` 추가 — **누락 시 침묵 stripping** | `lib/api/transfer-tax-schema.ts` |
| ⑬ | **callTransferTaxAPI body spread ★** | `gbValuation` 객체 spread | **자동**: `buildGeneralBuildingValuation()`이 `extensionInfo` 포함 객체를 반환하면 spread 자동. grep 자가 점검 필수 | `lib/calc/transfer-tax-api.ts` |
| ⑭ | **Route handler 엔진 매핑 ★** | `coerceDates(["generalBuildingValuation.buildingAcquisitionDate"])` | **추가**: `toOptionalDate(body.generalBuildingValuation?.extensionInfo?.extensionDate)` Date 변환 후 엔진 input 매핑 | `app/api/calc/transfer/general-building-route-helper.ts` |

**TypeScript 미감지 영역(⑫⑬⑭) grep 자가 점검**:
- `grep -n "extensionInfo" lib/api/transfer-tax-schema.ts` — Zod 정의 확인
- `grep -n "extensionAcquisitionCause" lib/api/transfer-tax-schema.ts` — enum 정의 확인
- `grep -n "extensionInfo" lib/calc/transfer-tax-api.ts` — body spread 경로 확인
- `grep -n "extensionDate" app/api/calc/transfer/general-building-route-helper.ts` — Date 변환 등록 확인

---

## 4. ① 폼 상태 타입 — 신규 gb* 필드 6개 (AssetForm 확장)

**위치**: `lib/stores/calc-wizard-asset.ts` → `AssetForm` 인터페이스, gbBuildingAcquisitionDate 필드 아래에 추가

```typescript
// ── 사례 33: 증축 건물 환산취득가 (소득세법 시행령 §176의2②, §166⑥) ──
/**
 * 증축 유무 ToggleCard.
 * true 시 extensionInfo 서브객체를 빌드하여 API에 전달.
 * false(default) 시 나머지 5필드 무시 — normalize에서 폐기.
 */
gbHasExtension: boolean;

/**
 * 증축일 (건물2 취득일, YYYY-MM-DD).
 * 영 §162①4호 기준: 사용승인서 교부일·사실상 사용일·임시사용승인일 중 빠른 날.
 * 범위: 토지 취득일(exclusive) ~ 양도일(exclusive).
 */
gbExtensionDate: string;

/**
 * 증축 면적 (㎡, 정보용 — 산식 미사용).
 * 현 시점 안분식에 미사용. 위치지수 산정 등 후속 확장 대비.
 * 선택 필드: 모르는 경우 비워도 계산에 영향 없음.
 */
gbExtensionArea: string;

/**
 * 양도시 건물2(증축분) 기준시가 총액 (원).
 * ⚠ 면적 × 단가가 아닌 총액 직접 입력. 안분 분모 3항의 건물2 성분.
 */
gbTransferExtensionBuildingStdPrice: string;

/**
 * 취득시(증축시) 건물2 기준시가 총액 (원).
 * ⚠ 면적 × 단가가 아닌 총액 직접 입력. 환산 비율 분자: 취득시 총액 / 양도시 총액.
 */
gbAcquisitionExtensionBuildingStdPrice: string;

/**
 * 증축 취득원인.
 * "newConstruction": 자가증축 (default). §114조의2 가산세 대상.
 * "purchase": 증축부 매수. §114조의2 적용 여부는 엔진 판단.
 */
gbExtensionAcquisitionCause: "purchase" | "newConstruction";
```

**총 신규 필드 수**: 6개 (gbHasExtension 포함)

---

## 5. ② initial value 명세

**위치**: `lib/stores/calc-wizard-asset.ts` → `INITIAL_ASSET_FORM` (또는 `createInitialAssetForm()`)

```typescript
// 사례 33 증축 필드 기본값
gbHasExtension: false,
gbExtensionDate: "",
gbExtensionArea: "",
gbTransferExtensionBuildingStdPrice: "",
gbAcquisitionExtensionBuildingStdPrice: "",
gbExtensionAcquisitionCause: "newConstruction",
```

---

## 6. ③ normalize fallback 명세

**위치**: `lib/stores/calc-wizard-asset.ts` → `normalizeAsset()` (또는 `migrateAsset()`)

normalize는 **두 가지 역할을 명확히 구분**한다. 혼동 방지를 위해 별도 항목으로 분리.

#### 6.1 저장→로드 마이그레이션 (normalizeAsset 책임)

sessionStorage에 저장된 구형 데이터(사례 33 필드 미포함)를 로드할 때 신규 필드 초기값을 주입.

```typescript
// 6필드 누락 보호 (기존 sessionStorage 마이그레이션 호환)
asset.gbHasExtension ??= false;
asset.gbExtensionDate ??= "";
asset.gbExtensionArea ??= "";
asset.gbTransferExtensionBuildingStdPrice ??= "";
asset.gbAcquisitionExtensionBuildingStdPrice ??= "";
asset.gbExtensionAcquisitionCause ??= "newConstruction";

// gbHasExtension=false 인 legacy 데이터에 나머지 5필드가 잘못 저장된 경우 정리.
// (신규 데이터에서는 발생하지 않으나 구형 마이그레이션 방어)
if (asset.gbHasExtension === false) {
  asset.gbExtensionDate = "";
  asset.gbExtensionArea = "";
  asset.gbTransferExtensionBuildingStdPrice = "";
  asset.gbAcquisitionExtensionBuildingStdPrice = "";
  asset.gbExtensionAcquisitionCause = "newConstruction";
}
```

#### 6.2 런타임 토글 OFF (onChange 핸들러 책임 — normalizeAsset 아님)

사용자가 "증축 있음" ToggleCard를 OFF로 전환하는 순간은 **폼 상태를 유지**한다. 재토글 ON 시 입력값이 복원되어 UX가 개선된다. 이 동작은 normalizeAsset이 아닌 onChange 핸들러에서 처리.

```typescript
// GeneralBuildingBlock.tsx — "증축 있음" ToggleCard onChange 핸들러
// OFF 시 gbHasExtension만 false로 전환. 나머지 5필드는 보존 (재토글 ON 시 복원).
onChange={(checked) => {
  updateAsset(assetId, { gbHasExtension: checked });
  // ※ 5필드 초기화 안 함 — 재토글 ON 시 복원
}}
```

> **정책 근거**: useEffect로 5필드를 자동 초기화하면 store 미러링 금지 정책(`feedback_useeffect_store_mirror_forbidden.md`) 위반. onChange 단일 핸들러에서 gbHasExtension만 업데이트.

---

## 7. ④ API 변환 명세 — `buildExtensionInfo` 헬퍼 (신규)

**위치**: `lib/calc/transfer-tax-api-helpers.ts` → `buildGeneralBuildingValuation()` 내부

### 7.1 `buildExtensionInfo` 신규 헬퍼

```typescript
/**
 * AssetForm gbExtension* 필드 → extensionInfo 서브객체 변환.
 * gbHasExtension=false 시 undefined 반환.
 * gbHasExtension=true 시 필수 필드 누락은 validate 단계에서 이미 차단됨.
 * → 이 함수에서 undefined 폴백 대신 fail-fast throw (silent 회귀 차단).
 *
 * defensive 아닌 fail-fast — 이 throw에 도달하면 validate 우회 버그.
 * 사례 31 동작으로 silent 회귀하는 경로를 조기에 발각.
 */
export function buildExtensionInfo(
  asset: AssetForm
): ExtensionInfo | undefined {
  if (!asset.gbHasExtension) return undefined;

  const extensionDate = asset.gbExtensionDate || undefined;
  const extensionArea = parseDecimal(asset.gbExtensionArea);  // 선택 필드 — undefined 가능
  const transferExtStdPrice = parseAmount(asset.gbTransferExtensionBuildingStdPrice);
  const acqExtStdPrice = parseAmount(asset.gbAcquisitionExtensionBuildingStdPrice);
  const extensionCause = asset.gbExtensionAcquisitionCause;

  // gbHasExtension=true일 때 필수 4필드 누락 → validate 우회 — fail-fast
  if (!extensionDate || !transferExtStdPrice || !acqExtStdPrice || !extensionCause) {
    throw new Error(
      `[buildExtensionInfo] gbHasExtension=true이지만 필드 누락 — validate 단계에서 차단되어야 함 (asset.id=${asset.id})`
    );
  }

  return {
    extensionDate,                          // string — route handler에서 toOptionalDate 변환 (⑭)
    extensionArea: extensionArea ?? 0,      // 선택 필드: 미입력 시 0 (정보용, 산식 미사용)
    transferExtensionBuildingStdPrice: transferExtStdPrice,
    acquisitionExtensionBuildingStdPrice: acqExtStdPrice,
    extensionAcquisitionCause: extensionCause,
  };
}
```

### 7.2 `buildGeneralBuildingValuation` 수정 (기존 함수에 extensionInfo 추가)

```typescript
export function buildGeneralBuildingValuation(
  asset: AssetForm
): GeneralBuildingValuationInput | undefined {
  // ... 기존 8필드 수집 (사례 31) + 2필드 (사례 32) ...

  return {
    // ... 기존 필드들 ...
    buildingAcquisitionDate: asset.gbBuildingAcquisitionDate || undefined,
    isSelfBuilt: asset.gbIsSelfBuilt ?? false,
    extensionInfo: buildExtensionInfo(asset),   // ★ 사례 33 추가
  };
}
```

> **⑬ 중요**: `buildGeneralBuildingValuation()`이 `extensionInfo`를 포함한 객체를 반환하면, 기존 `...(gbValuation !== undefined ? { generalBuildingValuation: gbValuation } : {})` spread가 자동으로 `extensionInfo`를 포함하여 전달. 별도 body spread 코드 추가 불필요. grep 자가 점검: `grep -n "generalBuildingValuation" lib/calc/transfer-tax-api.ts`

---

## 8. ⑤ UI 입력 위젯 명세 — 증축 섹션 (GeneralBuildingBlock 추가)

### 8.0 사례 33 확정 입력값 (정정 #2 — 미해결 종결)

아래 두 필드는 설계 초안의 "미해결 §6.3" 항목이 닫혔습니다. 역산 근거 포함.

| 필드명 | 확정값 | 역산 근거 |
|---|---:|---|
| `gbAcquisitionExtensionBuildingStdPrice` | **40,604,200** | 개산공제 1,218,126 ÷ 0.03 (소령 §163⑥). 검산: floor(40,604,200 × 0.03) = 1,218,126 ✓ |
| `gbTransferExtensionBuildingStdPrice` | **54,486,653** | 환산취득가 역산: 44,266,498 × 40,604,200 ÷ 32,978,880. 검산: floor(44,266,498 × 40,604,200 ÷ 54,486,653) = 32,978,880 ✓ |

두 필드 모두 "(원/㎡이 아닌 총액)" hint와 함께 CurrencyInput으로 입력. 브라우저 수동 확인 시 위 값으로 입력하면 산출세액 6,480,952가 재현되어야 합니다.

### 8.1 위치 (계산 로직 순서 = UI 표시 순서)

```
GeneralBuildingBlock
└── ToggleCard (환산취득가 사용, tone="violet") [사례 31]
    ├── ① 면적·층수 섹션 (sky 카드) [사례 31]
    ├── ② 양도시 기준시가 섹션 (emerald 카드) [사례 31]
    ├── ③ 취득시 기준시가 섹션 (amber 카드) [사례 31]
    ├── ④ 비사업용토지 판정 섹션 [사례 31]
    ├── ⑤ 신축 정보 섹션 (amber 카드) [사례 32]
    └── ⑥ 증축 섹션 (fuchsia 카드) ← ★ 사례 33 신규
        ├── ToggleCard "증축 있음" (tone="fuchsia")
        └── [ON 시 펼침]
            ├── DateInput (증축일)
            ├── DecimalInput (증축 면적)
            ├── CurrencyInput (양도시 건물2 기준시가 총액)
            ├── CurrencyInput (취득시(증축시) 건물2 기준시가 총액)
            └── RadioCardGroup (증축 취득원인)
```

**배치 근거**: 증축은 취득 시점 이후 이벤트이므로 취득 관련 섹션(③④) 다음, 신축 정보(⑤) 다음에 배치. 엔진 Step 1 안분 → Step 3 환산 순서와 일치.

### 8.2 증축 ToggleCard

| 속성 | 값 |
|---|---|
| 컴포넌트 | `ToggleCard` |
| label | "증축 있음" |
| description | "건물 취득 후 면적을 증축한 경우 ON. 증축분(건물2) 취득가액을 환산취득가로 별도 산정합니다." |
| tone | **fuchsia** — 취득 후 추가 이벤트(증축). rose(④ 비사업용토지)와 구별. |
| checked | `asset.gbHasExtension` |
| OFF 상태 | bg-fuchsia-50/70 배경 유지 (tone 규칙) |

### 8.3 증축 6필드 상세 명세

#### 필드 1 — 증축일 (`gbExtensionDate`)

| 속성 | 값 |
|---|---|
| 컴포넌트 | `DateInput` |
| 라벨 | "증축일" |
| hint | "사용승인서 교부일·사실상 사용일·임시사용승인일 중 빠른 날 (소득세법 시행령 §162① 4호). 토지 취득일 이후, 양도일 이전이어야 합니다." |
| 활성화 조건 | `gbHasExtension === true` |
| validate | 토지 취득일(exclusive) < 증축일 < 양도일(exclusive) |
| placeholder 숫자 예시 | 금지 — hint prop 사용 |

#### 필드 2 — 증축 면적 (`gbExtensionArea`) — **선택 필드**

| 속성 | 값 |
|---|---|
| 컴포넌트 | `DecimalInput` + `parseDecimal` |
| 라벨 | "증축 면적 (선택)" |
| 단위 표시 | "㎡" |
| hint | "증축된 부분의 연면적(㎡). 현재 안분 계산에 직접 사용되지 않으므로 모르는 경우 비워두세요." |
| 활성화 조건 | `gbHasExtension === true` |
| validate | **필수 아님 — 입력 시 0 이상 허용 (0.0㎡ 포함), 미입력 허용** |

#### 필드 3 — 양도시 건물2 기준시가 총액 (`gbTransferExtensionBuildingStdPrice`)

| 속성 | 값 |
|---|---|
| 컴포넌트 | `CurrencyInput` |
| 라벨 | "양도시 건물2(증축분) 기준시가 총액" |
| hint | "국세청 홈택스 기준시가 조회 → 증축 건물분 기준시가 총액(원). 안분 분모 3항 중 건물2 성분. ⚠ ㎡당 단가가 아닌 총액을 입력하세요." |
| trailing | LawArticleModal "소득세법 시행령 §166⑥" |
| 활성화 조건 | `gbHasExtension === true` |
| validate | > 0 |
| 단위 오인 차단 | validate 메시지: "기준시가는 ㎡당 단가가 아닌 총액(원)을 입력하세요" |
| **사례 33 확정값 (정정 #2)** | **54,486,653** — 역산: 44,266,498 × 40,604,200 ÷ 32,978,880. 브라우저 수동 확인 시 이 값으로 입력. |

#### 필드 4 — 취득시(증축시) 건물2 기준시가 총액 (`gbAcquisitionExtensionBuildingStdPrice`)

| 속성 | 값 |
|---|---|
| 컴포넌트 | `CurrencyInput` |
| 라벨 | "취득시(증축시) 건물2 기준시가 총액" |
| hint | "증축 당시 기준시가 총액(원). 환산 비율 분자: 취득시 건물2 기준시가 총액 ÷ 양도시 건물2 기준시가 총액 × 양도시 건물2 안분 양도가. ⚠ ㎡당 단가가 아닌 총액을 입력하세요." |
| trailing | LawArticleModal "소득세법 시행령 §176의2②" |
| 활성화 조건 | `gbHasExtension === true` |
| validate | > 0 |
| 단위 오인 차단 | validate 메시지: "기준시가는 ㎡당 단가가 아닌 총액(원)을 입력하세요" |
| **사례 33 확정값 (정정 #2)** | **40,604,200** — 역산: 1,218,126 ÷ 0.03 (소령 §163⑥ 개산공제 검산). 브라우저 수동 확인 시 이 값으로 입력. |

#### 필드 5 — 증축 취득원인 (`gbExtensionAcquisitionCause`)

| 속성 | 값 |
|---|---|
| 컴포넌트 | `RadioCardGroup` |
| 라벨 | "증축 취득원인" |
| 옵션 | `{ value: "newConstruction", label: "자가증축", description: "직접 증축(신축)한 경우. §114조의2 가산세 대상." }`, `{ value: "purchase", label: "매매", description: "증축 완공 건물을 매수한 경우." }` |
| default | "newConstruction" |
| 활성화 조건 | `gbHasExtension === true` |
| 정렬 | 자가증축 먼저 (양도코리아 정렬 준용 — 자가신축이 사례 33 primary) |

#### 정보 표시 — 안내 안내 배지 (자가증축 + 5년 이내 시)

```
gbHasExtension === true
&& gbExtensionAcquisitionCause === "newConstruction"
&& gbExtensionDate
&& transferDate
&& (transferDate - gbExtensionDate) < 5년
```
→ amber 배지: "환산취득가액 가산세 주의 — 증축일로부터 5년 이내 양도 시 건물2 환산취득가의 5% 가산세 적용 가능 (소득세법 §114조의2 ①)"

단, 사례 33 본 케이스는 2007-07-24 증축 + 2023-02-19 양도 = 15년 초과 → 가산세 미발동(배지 미표시). 5년 이내 케이스는 후속 anchor 대상.

### 8.4 tone 매핑 최종

| 컴포넌트 | tone | 이유 |
|---|---|---|
| "환산취득가 사용" ToggleCard | violet | 환산 방식 선택 (사례 31 기존) |
| ① 면적·층수 카드 | sky | 면적·규모 |
| ② 양도시 기준시가 카드 | emerald | 양도시점 |
| ③ 취득시 기준시가 카드 | amber | 취득시점 |
| ④ 비사업용토지 카드 | rose | 지역·용도 |
| ⑤ 신축 정보 카드 | amber | 취득 정보 계열 (사례 32 기존) |
| **⑥ 증축 섹션 ToggleCard** | **fuchsia** | 취득 후 추가 이벤트(증축). rose(④)와 명확히 구별. |

> **충돌 점검 (정정 #6)**: 초안에서 ④ 비사업용토지 카드(rose)와 ⑥ 증축 ToggleCard(rose)가 중복되어 같은 카테고리로 오인될 수 있었음. ⑥을 **fuchsia**로 변경하여 차별화. fuchsia는 "취득 완료 후 발생하는 추가 이벤트(증축)"를 의미하는 독립 tone으로 사용. 색약 사용자 안전성: fuchsia(보라-핑크)와 rose(붉은-핑크)는 채도·명도 차이로 구별 가능하며, 현재 토글 상태 텍스트 라벨이 함께 표시되므로 색상만으로 판단하지 않아도 됨.

### 8.5 FieldCard hint 문구 (placeholder 숫자 예시 금지)

| 필드 | hint 문구 |
|---|---|
| 증축일 | "사용승인서 교부일·사실상 사용일·임시사용승인일 중 빠른 날 (소득세법 시행령 §162① 4호). 반드시 토지 취득일 이후, 양도일 이전 날짜여야 합니다." |
| 증축 면적 | "증축된 부분의 연면적 (㎡). 현재 안분 산식에 직접 사용되지 않습니다. 모르는 경우 비워두세요." |
| 양도시 건물2 기준시가 총액 | "국세청 홈택스 기준시가 → 양도일 기준 증축분 건물 기준시가 총액(원). ⚠ 면적×㎡단가가 아닌 총액을 입력하세요." |
| 취득시(증축시) 건물2 기준시가 총액 | "증축 당시 기준시가 총액(원). 이 값을 분자, 양도시 총액을 분모로 환산 비율 산정. ⚠ 총액(원) 입력." |
| 증축 취득원인 | (RadioCardGroup 각 카드의 description으로 표시 — FieldCard hint 미사용) |

---

## 파트 2 링크 (§9~20)

결과 카드 산식(⑦), Validation(⑧), Zod 스키마(⑨⑩⑫), Route Handler(⑭), 수동 테스트·DoD·비스코프·Status는 파일 크기 정책(800줄)에 따라 별도 파일로 분리:

**[case-33-general-building-extension.ui.design-part2.md](./case-33-general-building-extension.ui.design-part2.md)**

포함 섹션: §9 결과 카드 3-way 분기 / §10 Validation 규칙 / §11 Zod 스키마 / §12 Route Handler / §13 사이드바 / §14 양도코리아 매핑 / §15 정책 매트릭스 / §16 800줄 실측 목록 / §17 수동 테스트 / §18 DoD 체크리스트 / §19 비스코프 / §20 Status / 부록(무효 판정 2건)

# 사례 33 — 증축 건물 환산취득가 UI 디자인 (파트 2: 결과·검증·Zod·Route·DoD)

**파트 1 링크**: [`case-33-general-building-extension.ui.design.md`](./case-33-general-building-extension.ui.design.md) (§1~8: 시나리오·케이스·동기화 지점·타입·initial·normalize·API·UI 위젯)

본 파트는 §9 이후를 담당한다: 결과 카드 산식 명세(⑦), Validation 규칙(⑧), Zod 스키마(⑨⑩⑫), Route Handler(⑭), 수동 테스트·DoD·비스코프·Status.

---

## 9. ⑦ 결과 카드 — `BundledAllocationCard` 3-way 분기 명세

### 9.1 분기 조건

```
extensionInfo 있음 → 3-way 모드 (토지·건물1·건물2·합계 4열)
extensionInfo 없음 → 기존 2-way 모드 (토지·건물·합계 3열)  [사례 31·32 기존]
```

분기 판단 기준: `result.generalBuildingDetail?.extensionInfo !== undefined` (엔진 echo 필드)

### 9.2 안분표 — 3-way 4열 표 명세

| 행 | 토지 | 건물1 (원건물) | 건물2 (증축분) | 합계 |
|---|---|---|---|---|
| 양도가 (안분) | 275,736,648 | 9,996,854 | 44,266,498 | 330,000,000 |
| 취득가 | 164,880,819 (실가 안분) | 35,119,181 (실가 안분) | 32,978,880 **(환산)** | 232,978,880 |
| 필요경비 | 6,595,232 | 1,404,768 | 1,218,126 (개산공제) | 9,218,126 |
| 양도차익 | **104,260,597** | **-26,527,095** | 10,069,492 | 87,802,994 |
| 장기보유특별공제 | **31,278,179** | 0 | 3,020,847 | 34,299,025 |
| 양도소득금액 (income) | 72,982,418 | **-26,527,095** | 7,048,645 | **53,503,968** |
| 영 §102② 통산 흡수 | **-24,190,751** | +26,527,095 (결손) | **-2,336,344** | 0 |
| **통산 후 양도소득금액** | **48,791,667** | **0** | **4,712,301** | **53,503,968** |

> **라운딩 결정 = (A-2) 확정 (Task #10 anchor 실측 재잠금 2026-05-11)**: 우리 엔진 실측값(토지 흡수 24,190,751 / 건물2 흡수 2,336,344)을 anchor로 잠금. 예제 PDF(24,190,750 / 2,336,344)와 토지 1원 차이는 자동계산기 간 잔액 흡수 순서 차이로 정상. **UI 결과 카드는 우리 엔진 값만 표시.** 통산 후 합계 53,503,968, 산출세액 6,480,952·지방세 648,095는 예제와 1원 단위 완전 일치. **(A-2) 결정으로 우리 엔진 값을 anchor로 잠금**

> **통산 전후 시각적 보조 (정정 #7)**: 양도소득금액 합계(53,503,968)는 통산 전후 동일하지만, **자산별 분포가 변경**됩니다. 건물1 결손 -26,527,095가 토지·건물2 양수에 흡수되어 세율 적용 기준 양도소득금액이 자산 단위로 재분배됩니다 (영 §102②). 통산 전: 토지 72,982,418 · 건물1 -26,527,095 · 건물2 7,048,645 → 통산 후: 토지 48,791,667 · 건물1 0 · 건물2 4,712,301. 이 안내 단락은 결과 카드 "통산 후 양도소득금액" 행 아래에 작은 회색 텍스트(`text-xs text-muted-foreground`)로 표시하여 합계가 같아 보여도 통산이 필요한 이유를 사용자가 파악할 수 있도록 한다.

**배지 표시 규칙**:
- 건물2 취득가 셀: "(환산)" 배지 — `usedEstimatedAcquisition === true` 인 카드
- 건물1 취득가 셀: "(실가 안분)" 배지 — 실가를 양도시 기준시가 비율로 안분
- 토지 취득가 셀: "(실가 안분)" 배지 — 동일

### 9.3 산식 표시 규칙

**안분 산식 (양도시 기준시가 비율, 소령 §166⑥)**:
```
건물2 양도가 = 전체 양도가 330,000,000
              × 양도시 건물2 기준시가 총액 [사용자 입력]
              ÷ (양도시 토지 기준시가 + 양도시 건물1 기준시가 총액 + 양도시 건물2 기준시가 총액)
```
- 숫자 옆 한국어 라벨: "전체 양도가 330,000,000 × 건물2 기준시가 총액 [X] ÷ 분모 합계 [Y]"
- 변수 약어(`P_ext`, `denom`) 금지 — 한국어 풀어쓰기
- `Math.floor()` 표기 금지

**환산취득가 산식 (소령 §176의2②)**:
```
건물2 환산취득가 = 건물2 안분 양도가 44,266,498
                  × 취득시(증축시) 건물2 기준시가 총액 [사용자 입력]
                  ÷ 양도시 건물2 기준시가 총액 [사용자 입력]
```

**개산공제 (소령 §163⑥)**:
```
건물2 개산공제 = 취득시(증축시) 건물2 기준시가 총액 × 3%
              = 40,604,200 × 3% = 1,218,126
```
> **종결 (정정 #2)**: 개산공제는 환산취득가(32,978,880)에 3%가 아니라 **취득시 기준시가 총액(40,604,200)에 3%**. `calcEstimatedDeductionForGB()` 실제 산식과 일치. anchor값 1,218,126 확정.

**영 §102② 통산 산식**:
```
흡수 풀 = min(양수 income 합계, 결손 income 절대값) = min(80,031,063, 26,527,095) = 26,527,095
건물2 흡수 = floor(26,527,095 × 건물2 income 7,048,645 / 양수 합계 80,031,063) → 우리 엔진: 2,336,344
토지 흡수 = 잔액(26,527,095 - 2,336,344) → 우리 엔진: 24,190,751
```
- "원" 단위 접미 금지 (`feedback_no_won_suffix.md`)
- 법조문 링크: LawArticleModal "소득세법 시행령 §102②"
- **라운딩 결정 = (A-2) 확정 (Task #10 anchor 실측 재잠금 2026-05-11)**: 엔진 실측값(24,190,751 / 2,336,344)을 anchor로 잠금. 예제 PDF(24,190,750 / 2,336,344)와 토지 1원 차이는 엔진 §1.4에 명시된 잔액 흡수 순서 차이. UI는 우리 엔진 값만 표시. 산출세액 6,480,952·지방세 648,095는 1원 단위 완전 일치. 코드 변경 0.

### 9.4 결과 카드 최종 세액 라인

| 항목 | 표시 |
|---|---|
| 통산 후 양도소득금액 | **53,503,968** |
| 기본공제 | -2,500,000 |
| 과세표준 | **51,003,968** |
| 산출세액 (2023년 §55 24% 구간) | 6,480,952 |
| 지방소득세 (10%) | 648,095 |
| §114조의2 가산세 | 0 (사례 33 본 케이스 — 5년 초과) |

---

## 10. ⑧ Validation 규칙 명세

**위치**: `lib/calc/transfer-tax-validate.ts` → `validateStep()` 내 `assetKind === "general_building"` 블록 확장

**validate 분할 패턴 확정 (정정 #1)**:
- `transfer-tax-validate.ts` (공통, 776줄 → ~500줄로 축소) + **`transfer-tax-validate-gb.ts` (일반건물 전담, ~311줄)** 2분할.
- 증축은 일반건물의 분기이지 별개 도메인이 아니므로, 별도 `general-building-validate.ts` 신규 파일이 아닌 **gb 통합 모듈**로 분리.
- `transfer-tax-validate-gb.ts`는 사례 31·32 기존 gb* 검증 + 사례 33 extensionInfo 분기(+35줄)를 모두 처리.
- 분할 근거: 별개 도메인 분할 시 import 순환·중복 검증 위험. gb validate는 common validate에서 단일 import로 호출.
- 분할 후 줄수 예상: `transfer-tax-validate.ts` 약 500줄 / `transfer-tax-validate-gb.ts` 약 311줄(기존 gb* + 증축 35줄).
- **Do 단계 첫 작업 (validate 분할)**: 분할 후 기존 사례 31·32 gb* 검증이 `transfer-tax-validate-gb.ts`에 이관됐는지 확인 후 extensionInfo 분기 추가. 라운딩 결정은 (A) 확정으로 닫힘 — 별도 작업 불필요.

### 10.1 gbHasExtension=true 시 차단 조건

```typescript
if (asset.assetKind === "general_building"
    && asset.gbUseEstimatedAcquisition === true
    && asset.gbHasExtension === true) {

  const label = `자산 ${assetIndex + 1}`;

  // 필드 1: 증축일 필수
  if (!asset.gbExtensionDate) {
    return `${label}: 증축일을 입력하세요.`;
  }

  // 필드 2: 증축일 범위 검증 (정정 #8)
  // 사례 32에서 gbBuildingAcquisitionDate(건물1 별도 취득일)가 토지 취득일보다 늦을 수 있음.
  // 건물이 존재해야 증축이 가능하므로 토지·건물1 취득일 중 늦은 날 기준.
  const landAcqDate = asset.acquisitionDate;
  const buildingAcqDate = asset.gbBuildingAcquisitionDate ?? landAcqDate;
  const minAcqDate = (landAcqDate && buildingAcqDate && landAcqDate > buildingAcqDate)
    ? landAcqDate
    : (buildingAcqDate ?? landAcqDate);
  const transDate = formData.transferDate;
  if (minAcqDate && asset.gbExtensionDate <= minAcqDate) {
    return `${label}: 증축일은 토지·건물1 취득일 중 늦은 날(${minAcqDate}) 이후여야 합니다.`;
  }
  if (transDate && asset.gbExtensionDate >= transDate) {
    return `${label}: 증축일은 양도일(${transDate}) 이전이어야 합니다.`;
  }

  // 필드 3: 증축 면적 — 선택 필드 (산식 미사용, 정보용)
  // validate 강제 없음. 입력 시 nonnegative 권장이나 차단하지 않음.
  // UI 필드: optional, hint에 "모르는 경우 비워두세요" 안내.

  // 필드 4: 양도시 건물2 기준시가 총액 필수 + 양수
  const transferExtStd = parseAmount(asset.gbTransferExtensionBuildingStdPrice);
  if (!transferExtStd || transferExtStd <= 0) {
    return `${label}: 양도시 건물2(증축분) 기준시가 총액을 입력하세요. 기준시가는 ㎡당 단가가 아닌 총액(원)을 입력하세요.`;
  }

  // 필드 5: 취득시 건물2 기준시가 총액 필수 + 양수
  const acqExtStd = parseAmount(asset.gbAcquisitionExtensionBuildingStdPrice);
  if (!acqExtStd || acqExtStd <= 0) {
    return `${label}: 취득시(증축시) 건물2 기준시가 총액을 입력하세요. 기준시가는 ㎡당 단가가 아닌 총액(원)을 입력하세요.`;
  }

  // 필드 6: gbExtensionAcquisitionCause — RadioCardGroup default 있으므로 별도 필수 검증 불필요
}
```

### 10.2 자동 안분 fallback 금지 정책 적용

- 5필드 미입력 시 자동 계산 **절대 금지** (정책 `feedback_no_silent_apportion_fallback.md`)
- 각 필드 미입력 → 검증 오류로 명확히 차단
- 단위 오인 차단 메시지: "기준시가는 ㎡당 단가가 아닌 총액(원)을 입력하세요" — 분모 3항이 원 단위로 통일되어야 하므로 UI 단계에서 사전 차단 필수 (계획서 §1 정정 사항 3번)

### 10.3 API 헬퍼 ↔ validate 동기화 (⑧ 규칙)

`buildExtensionInfo()`가 throw 또는 undefined를 반환하는 조건 = validate가 차단하는 조건으로 완전 일치해야 함 (정정 #9 fail-fast 패턴 적용 후).

| 조건 | buildExtensionInfo() 동작 | validate 동작 |
|---|---|---|
| gbHasExtension=false | undefined 반환 | 통과 (증축 필드 검사 skip) |
| gbHasExtension=true + 필수 4필드 모두 입력 | ExtensionInfo 객체 반환 | 통과 |
| gbHasExtension=true + 1개 이상 미입력 | **throw Error (fail-fast)** | **차단** — 명확 오류 메시지 |

validate를 통과한 요청은 buildExtensionInfo()에서 절대 throw에 도달하지 않는다. throw는 validate 우회 버그 조기 발각용.

---

## 11. ⑨⑩⑫ Zod 스키마 명세

### 11.1 extensionInfoSchema 신규 정의 (⑫)

**위치**: `lib/api/transfer-tax-schema.ts` — **누락 시 침묵 stripping 발생, TypeScript 미감지**

```typescript
/**
 * ⑫ 증축 정보 서브객체 Zod 스키마.
 * generalBuildingValuationSchema.extensionInfo 에 optional로 추가.
 * 미정의 시 request body의 extensionInfo 필드가 침묵 stripping됨.
 */
export const extensionInfoSchema = z.object({
  /** 증축일 (YYYY-MM-DD 문자열 — route handler에서 toOptionalDate 변환) */
  extensionDate: z.string().date(),
  /** 증축 면적 (㎡, 정보용 — 산식 미사용). 선택 필드, 0 이상 허용. */
  extensionArea: z.number().nonnegative().optional(),
  /** 양도시 건물2 기준시가 총액 (원). ⚠ 총액, 단가 아님 */
  transferExtensionBuildingStdPrice: z.number().int().positive(),
  /** 취득시(증축시) 건물2 기준시가 총액 (원). ⚠ 총액, 단가 아님 */
  acquisitionExtensionBuildingStdPrice: z.number().int().positive(),
  /** 증축 취득원인 */
  extensionAcquisitionCause: z.enum(["purchase", "newConstruction"]),
});
```

**`generalBuildingValuationSchema`에 추가**:

```typescript
export const generalBuildingValuationSchema = z.object({
  // ... 기존 12필드 (사례 31·32) ...
  /** ⑫ 증축 정보 서브객체 (미정의 시 침묵 stripping 차단 목적 — 반드시 명시) */
  extensionInfo: extensionInfoSchema.optional(),
});
```

### 11.2 extensionAcquisitionCause enum (⑨)

```typescript
// extensionInfoSchema 내부 z.enum(["purchase", "newConstruction"]) 로 정의됨.
// propertyType enum과 별개 — transfer-tax-schema.ts 확장 불필요.
```

### 11.3 companion 스키마 (⑩)

**위치**: `lib/api/transfer-tax-schema-sub.ts` → `addPropertyRefines` 헬퍼

```typescript
// generalBuildingValuation 검증 블록에 추가:
if (data.generalBuildingValuation?.extensionInfo) {
  const ext = data.generalBuildingValuation.extensionInfo;
  // 단위 총액 교차 검증: 분모 합계 > 0 (0 나누기 방지)
  // transferExtensionBuildingStdPrice는 base 스키마에서 positive() 이미 보장.
  // 향후 교차 검증(증축 기준시가 > 건물1 기준시가 이상) 필요 시 여기에 추가.
  void ext;
}
```

---

## 12. ⑭ Route Handler 엔진 매핑

**위치**: `app/api/calc/transfer/general-building-route-helper.ts`

```typescript
// ⑪ 건물2 카드의 acquisitionDate = extensionDate (단일 진실)
// route handler가 extensionDate를 Date로 변환 후 BuildingCard(건물2) acquisitionDate에 주입

// ⑭ extensionInfo Date 변환
const extensionInfoParsed = body.generalBuildingValuation?.extensionInfo
  ? {
      ...body.generalBuildingValuation.extensionInfo,
      extensionDate: toOptionalDate(
        body.generalBuildingValuation.extensionInfo.extensionDate
      ),
    }
  : undefined;

// 엔진 input에 전달:
generalBuildingValuation: body.generalBuildingValuation
  ? {
      ...body.generalBuildingValuation,
      extensionInfo: extensionInfoParsed,
      // 기존: totalTransferPrice, transferDate, acquisitionDate 주입 (사례 31 패턴)
      totalTransferPrice: body.transferPrice,
      transferDate: toDate(body.transferDate, "transferDate"),
      acquisitionDate: toDate(asset.acquisitionDate, "acquisitionDate"),
    }
  : undefined,
```

---

## 13. ⑥ 사이드바 합계 영향 없음

증축 환산취득가(건물2 취득가)는 API 결과 후 확정되므로 사이드바 실시간 합계에 미포함. 기존 2-way 사이드바 표시 그대로 (사례 31 §9.2 패턴).

신규 사이드바 행 추가 없음.

---

## 14. 예제 화면 매핑

| 예제 화면 요소 | 본 UI 컴포넌트 매핑 |
|---|---|
| 안분계산 다이얼로그 — 토지/건물1/건물2 3-way 분리 | `BundledAllocationCard` 3-way 분기 (4열 표) |
| 건물기준시가 입력 — 건물2 양도시/취득시 총액 2칸 | GeneralBuildingBlock ⑥ 섹션 `CurrencyInput` × 2 |
| 증축 연도/면적 입력 | GeneralBuildingBlock ⑥ `DateInput` + `DecimalInput` |
| 증축 취득원인(자가증축/매매) 선택 | GeneralBuildingBlock ⑥ `RadioCardGroup` |
| 양도계산명세서 결과 — 건물2 환산취득가 라인 | 결과 카드 환산취득가 산식 행 + "(환산)" 배지 |
| 양도계산명세서 결과 — §102② 통산 | 결과 카드 "통산 후 양도소득금액" 행 |
| 양도계산명세서 결과 — 건물2 개산공제 | 결과 카드 "개산공제" 행. floor(40,604,200 × 0.03) = 1,218,126 (정정 #2 종결) |
| 최종 세액 합계 | 기존 결과 카드 세액 라인 (변경 없음) |

---

## 15. 정책 적용 매트릭스

| # | 정책 메모리 | 본 UI 디자인 적용 |
|---|---|---|
| 1 | `feedback_no_silent_apportion_fallback.md` | ⑧ validation 5필드 필수 + 단위 오인 차단 메시지. 자동 채우기 경로 없음. |
| 2 | `feedback_useeffect_store_mirror_forbidden.md` | ⑥ 섹션 ToggleCard `onChange`에서 직접 처리. `useEffect` 사용 금지 (§6.2). |
| 3 | `feedback_3point_input_consistency.md` | 건물2 기준시가는 ㎡당 단가 아닌 총액. hint + validate 메시지로 강제. |
| 4 | `feedback_transfer_year_tax_rate.md` | UI는 결과 표시만. anchor는 엔진 테스트에서 2023년 §55 누진세율 직접 계산. |
| 5 | `feedback_estimated_deduction_separation.md` | 건물2 개산공제는 환산취득가와 분리 표시. 취득가 합산 금지. |
| 6 | `feedback_result_view_korean_formula.md` | 산식 한국어 풀어쓰기. 변수 약어·floor() 금지. |
| 7 | `feedback_no_won_suffix.md` | 결과 표·산식 숫자 끝 "원" 생략. |
| 8 | `feedback_ui_input_path_enumeration.md` | 케이스 매트릭스 G-06~G-12 전수 enumerate (파트1 §2). |
| 9 | `feedback_api_zod_schema_sync.md` | ⑫ extensionInfoSchema 명시 + ⑬ body spread grep + ⑭ route Date 변환 (§12). |
| 10 | `feedback_validation_sync_8th_point.md` | ⑧ validate 차단 조건 = ④ API 헬퍼 fail-fast 조건 완전 일치 (§10.3 표). |
| 11 | `feedback_toggle_card_visibility.md` | ToggleCard OFF 상태에도 fuchsia tone 배경 유지. native checkbox 금지. |
| 12 | `feedback_date_input.md` | type="date" 금지, `DateInput` 사용 (증축일 필드). |
| 13 | `feedback_decimal_input.md` | 면적은 `DecimalInput` + `parseDecimal`. `CurrencyInput` 사용 금지. |
| 14 | `feedback_pdca_session_efficiency.md` | 800줄 분할 신호: validate.ts 776줄 → Do 진입 전 확인 필수. 본 디자인 문서도 805줄 초과로 파트 분할 실시. |

---

## 16. 800줄 정책 — Do 단계 진입 전 실측 확인 목록 (정정 #11)

**Do 진입 전 `wc -l` 실측 → 마진 계산 → 분할 선행 PR 결정** 순서로 진행.

| 파일 | 현재 예상 줄 수 | 사례 33 추가 | 예상 후 | 마진 | 분할 필요 |
|---|---|---|---|---|---|
| `lib/calc/transfer-tax-validate.ts` | **776줄** | gb* 이관 후 **-276줄** | **~500줄** | +300 | ✅ 2분할 (정정 #1) |
| `lib/calc/transfer-tax-validate-gb.ts` | **신규 0줄** | gb* 기존 276줄 + 증축 35줄 | **~311줄** | +489 | OK |
| `components/calc/transfer/GeneralBuildingBlock.tsx` | ~290줄 | +80줄 | ~370줄 | +430 | OK |
| `lib/stores/calc-wizard-asset.ts` | **wc -l 실측 필수** | +20줄 (6필드) | 실측+20 | 실측 후 판단 | 실측 선행 |
| `lib/calc/transfer-tax-api-helpers.ts` | **wc -l 실측 필수** | +25줄 (buildExtensionInfo) | 실측+25 | 실측 후 판단 | 실측 선행 |
| `lib/api/transfer-tax-schema.ts` | **wc -l 실측 필수** | +25줄 (extensionInfoSchema) | 실측+25 | 실측 후 판단 | 실측 선행 |
| `app/api/calc/transfer/general-building-route-helper.ts` | **wc -l 실측 필수** | +15줄 | 실측+15 | 실측 후 판단 | 실측 선행 |
| `components/calc/results/BundledAllocationCard.tsx` | **wc -l 실측 필수** | **+60~80줄** (8행×4열 표 + 통산 행 + 배지 + §9.2 안내 단락) | 실측+80 | 실측 후 판단 | **초과 위험 높음** |

**BundledAllocationCard.tsx 분할 기준 (정정 #11)**:
- 실측 결과 800줄 초과 예상 시: `BundledAllocationCard-extension.tsx` 분리 또는 3-way 행 렌더링 헬퍼 `renderThreeWayRows()` 추출.
- 분할 선행 PR 완료 후 사례 33 Do PR 착수.
- **Do 단계 첫 번째 명령어**: `wc -l components/calc/results/BundledAllocationCard.tsx lib/stores/calc-wizard-asset.ts lib/calc/transfer-tax-api-helpers.ts lib/api/transfer-tax-schema.ts app/api/calc/transfer/general-building-route-helper.ts`

**`transfer-tax-validate.ts` 분할 패턴 (정정 #1 확정)**:
- 분할 방식: `transfer-tax-validate.ts` (공통) + `transfer-tax-validate-gb.ts` (일반건물 전담) 2분할.
- 증축은 gb 도메인의 분기이므로 `transfer-tax-validate-gb.ts` 하나로 통합. 별도 `general-building-validate.ts` 생성 금지 (import 순환 위험).
- `transfer-tax-validate.ts`에서 `validateGeneralBuilding(asset, formData)` 단일 함수 호출로 gb 검증 위임.
- Do 단계 첫 작업: 기존 사례 31·32 gb* 검증 로직을 `transfer-tax-validate-gb.ts`로 이관 → extensionInfo 분기 추가 → 회귀 통과 확인.

---

## 17. 수동 테스트 계획 (Do 단계 완료 후)

```bash
# 1. 단위 테스트
npx vitest run __tests__/tax-engine/transfer-tax/general-building-extension-case-33.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-31.test.ts   # 회귀
npx vitest run __tests__/tax-engine/transfer-tax/                                     # 전체

# 2. 타입·린트
npm run typecheck   # 0건
npm run lint

# 3. 브라우저 수동 (필수)
npm run dev
# /calc/transfer → 자산 추가 → "일반건물(토지+건물 일괄)" 선택
# → "환산취득가 사용" ON → 기존 필드 입력
# → "증축 있음" ON → 6필드 입력 (정정 #2 확정값 사용)
#   증축일: 2007-07-24
#   증축 면적: 83.72 (또는 빈칸 — 선택 필드, 정정 #4)
#   양도시 건물2 기준시가 총액: 54,486,653  ← 확정값 (역산: 44,266,498 × 40,604,200 ÷ 32,978,880)
#   취득시(증축시) 건물2 기준시가 총액: 40,604,200  ← 확정값 (역산: 1,218,126 ÷ 0.03)
#   증축 취득원인: 자가증축
# → 일괄 취득가 200,000,000 / 필요경비 8,000,000
# → 양도일 2023-02-19 / 취득일 2003-03-17
# → 계산 실행
# → 결과: 산출세액 6,480,952 / 지방세 648,095 확인 (1원 단위 일치)
# → 통산 흡수 확인: 토지 24,190,751 / 건물2 2,336,344 (우리 엔진 값 — Task #10 실측)
#    ※ 예제 PDF(24,190,750 / 2,336,344)와 토지 1원 차이 — 정상(§1.4 확정)
# → Network 탭: request body에 generalBuildingValuation.extensionInfo 포함 확인 (⑫⑬⑭)
# → 단위 오인 테스트: 총액 대신 ㎡당 단가로 입력 → validate 메시지 "총액(원) 단위" 확인
# → "증축 있음" OFF → 5필드 보존(재토글 ON 복원) → 사례 31 동작 회귀 확인

# G-09 — 증축일이 토지·건물1 취득일 중 늦은 날 이전 (validate 차단, 정정 #10)
# → 증축일 = 2002-01-01 입력
# → 오류 메시지: "토지·건물1 취득일 중 늦은 날(YYYY-MM-DD) 이후여야 합니다" + 다음 버튼 비활성

# G-10 — 증축일이 양도일 이후 (validate 차단, 정정 #10)
# → 증축일 = 2024-01-01 입력
# → 오류 메시지: "양도일(2023-02-19) 이전이어야 합니다"

# G-11 — 양도시 건물2 기준시가 = 0 (validate 차단, 정정 #10)
# → 양도시 건물2 기준시가 총액 = 0 입력
# → 오류 메시지: "기준시가는 ㎡당 단가가 아닌 총액(원)을 입력하세요"
```

---

## 18. DoD 체크리스트 (Do 단계 완료 보고 전)

- [ ] 케이스 매트릭스 G-06~G-12 모든 분기 UI 입력 가능 자가 시뮬 완료
- [ ] anchor 25개 `toBe()` 원단위 정확 통과 — **(A-2) 결정에 따라 T-18 흡수 합=26,527,095 · 건물2 흡수=2,336,344 · T-20 토지 통산 후=48,791,667 · T-21 건물2 통산 후=4,712,301 · T-22=53,503,968 적용** (Task #10 실측 재잠금 2026-05-11)
- [ ] 사례 31 회귀 anchor 38개 0건 실패
- [ ] §114조의2 가산세 0 anchor (extensionAcquisitionCause="newConstruction" + 5년 초과)
- [ ] 14개 동기화 지점 전수 반영 — ⑫⑬⑭ grep 자가 점검 4개 명령어 실행
- [ ] `buildExtensionInfo()` fail-fast throw = validate 차단 조건 완전 일치 확인 (⑧ 동기화, 정정 #9)
- [ ] 자동 안분 fallback 코드 경로 없음 확인
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/` 전체 통과
- [ ] 브라우저 수동 확인 — 입력값 gbAcquisitionExtensionBuildingStdPrice=40,604,200 / gbTransferExtensionBuildingStdPrice=54,486,653 (정정 #2) → 산출세액 6,480,952 + Network 탭 extensionInfo 포함 확인
- [ ] 브라우저 결과 카드: 통산 흡수 토지 24,190,751 / 건물2 2,336,344 표시(우리 엔진 값 — Task #10 실측) 확인. 예제 PDF(24,190,750 / 2,336,344)와 토지 1원 차이 정상.
- [ ] 단위 오인 validate 메시지 브라우저 확인
- [ ] **G-09·G-10·G-11 validate 차단 브라우저 확인** (정정 #10 — 증축일 취득일 이전·양도일 이후·기준시가 0)
- [ ] **validate 2분할 완료**: `transfer-tax-validate-gb.ts` 신규 + `transfer-tax-validate.ts` gb* 이관 + 기존 사례 31·32 회귀 통과 (정정 #1, Do 단계 첫 작업)
- [ ] **Do 진입 전 5개 파일 wc -l 실측 완료** — BundledAllocationCard 800줄 초과 시 분할 선행 PR (정정 #11)
- [ ] extensionArea 미입력(빈칸)으로도 계산 성공 확인 (정정 #4 — 선택 필드)

---

## 19. 비스코프 (후속 PR 후보)

| 항목 | 우선순위 |
|---|---|
| 증축 + 2007-07-24 → 2012-07-23 이내 양도 시뮬레이션 (§114조의2 가산세 active) | 높음 |
| 증축 + 토지 상속·증여 cross-cutting (G-13, #4-a~#7-b 패턴 결합) | 중간 |
| 증축 2회 이상 (건물3, G-14) | 낮음 |
| ~~건물2 개산공제 산식 확인 후 1,218,126 anchor 추가 (계획서 §6.3 미해결)~~ | **종결(정정 #2)** — 확정값: gbAcquisitionExtensionBuildingStdPrice=40,604,200 → 개산공제=floor(40,604,200×0.03)=1,218,126 ✓ |

---

## 20. Status

| 단계 | 상태 |
|---|---|
| 1. PM/Plan | ✅ `.claude/plans/lazy-gathering-lemur.md` |
| 2. Design (UI) | ✅ 본 문서 (파트1 + 파트2) |
| 2. Design (engine) | ☐ 별도 `.engine.design.md` (transfer-tax-senior) |
| 3. Do (engine senior) | ☐ TODO |
| 3. Do (UI senior) | ☐ TODO |
| 4. Check | ☐ TODO |
| 5. Act | ☐ TODO |

다음 단계는 **3단계 Do** — 엔진 시니어(엔진 변경·anchor 테스트)와 UI 시니어(14개 동기화 지점 구현) 동시 병렬 호출.

---

## 부록 — 무효 판정 2건 (정정 안 함, 검토자 회신용)

검토자가 제기했으나 **무효**로 판정된 2건:

1. **§9.2 통산 흡수액** — Task #10 이후 §9.3에 우리 엔진 실측값(토지 흡수 24,190,751 / 건물2 흡수 2,336,344) + 라운딩 주석으로 재잠금 완료. 예제 PDF(24,190,750 / 2,336,344)와 토지 1원 차이는 설계 문서 §1.4에 명시된 잔액 흡수 순서 차이. 별도 수정 불필요.

2. **§9.2 개산공제 1,218,126** — 파트1 §8.0·파트2 §9.2·§9.3·§9.4에 "확정 (정정 #2)" 표시 완료. 취득시 기준시가 총액(40,604,200) × 3% = 1,218,126으로 확정. 별도 수정 불필요.

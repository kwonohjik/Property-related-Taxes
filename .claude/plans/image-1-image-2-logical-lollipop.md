# 사례 32 — 신축 건물 단기양도 §114조의2 5% 가산세 구현 계획

## Context

**사례 32 (예제 PDF #32)**: 갑씨가 2008.3.17 토지 취득 → 2018.3.31 2층 근린생활시설(소매점) **신축 완공** → 2023.2.19 양도(1,620,000,000원). 신축비용 입증 불가로 환산취득가액 적용. **건물 신축 후 5년 이내 양도**이므로 **소득세법 §114조의2 ① "감정가액 또는 환산취득가액 적용에 따른 가산세"**에 따라 **건물 환산취득가액 × 5%**를 양도소득 결정세액에 가산.

**법령 정확성 메모 (KoreanLaw MCP 검증 완료)**:
- **모법은 「소득세법 §114조의2(감정가액 또는 환산취득가액 적용에 따른 가산세)」** — 시행령 위임 없이 모법에 산식·요건 직접 명시:
  > "거주자가 건물을 신축 또는 증축(증축의 경우 바닥면적 합계가 85제곱미터를 초과하는 경우에 한정한다)하고 **그 건물의 취득일 또는 증축일부터 5년 이내**에 해당 건물을 양도하는 경우로서 **§97①1호 나목**에 따른 감정가액 또는 환산취득가액을 그 취득가액으로 하는 경우에는 해당 건물의 감정가액 또는 환산취득가액의 **100분의 5**에 해당하는 금액을 **양도소득 결정세액에 더한다**." (§114조의2 ①)
  > "제1항은 양도소득 산출세액이 없는 경우에도 적용한다." (§114조의2 ②)
- **잘못된 인용 정정**: 사전 협의 단계에서 제시된 "§114⑦ 위임 + 시행령 §176의2 ⑤"은 부정확. 실제로 §114⑦은 추계결정 위임 조항, 시행령 §176의2 ⑤는 국세청장 감정 자문 규정으로 가산세와 무관. 시행령 §176의2 ②는 환산취득가액 산식(양도시 기준시가 분의 취득시 기준시가)만 규정. **가산세 자체의 모법은 §114조의2** 단일 조문.
- **5년 기산점** = "건물의 취득일 또는 증축일"(§114조의2 ① 본문). 자가신축 건물의 "취득일"은 §98 + 시행령 §162① 4호: **사용승인서 교부일·사실상 사용일·임시사용승인일 중 빠른 날**. 본 사례는 사용승인일 2018.3.31을 빠른 날로 가정. UI/주석/결과 카드에서 "사용승인일"로 단정하지 말고 "건물 취득일(영 §162①4호 빠른 날)"로 표기.
- **라벨 통일**: 결과 카드 / 테스트 주석 / 법령배지는 모두 **"감정가액·환산취득가액 가산세 (소득세법 §114조의2)"** 로 통일. `§97②`·`§114⑦`·`§176의2⑤` 표기는 plan·코드 어디서도 금지.
- **§114조의2 ② 단서**: 산출세액이 0인 경우(비과세·감면 100%)에도 가산세 발동. 본 사례에는 무관하나 회귀 가드 시 유의.

**기구현(사례 31)과 차이 2가지**:
1. **토지·건물 취득일 분리** — 토지 2008.3.17 / 건물 2018.3.31 (영 §162①4호 빠른 날). 사례 31은 두 자산이 동일 `acquisitionDate`를 공유했음.
2. **§114조의2 ① 신축 5년 이내 가산세** — 건물 환산취득가액의 5%(266,004,044 × 5% = **13,300,202원**).

**핵심 anchor (Image 4 양도소득금액 계산명세서)**:
- 토지 양도가액 1,317,938,332 / 건물 양도가액 302,061,668
- 토지 환산취득가 936,945,640 / 건물 환산취득가 266,004,044
- 토지 LTHD(14년·28%) 99,927,713 / 건물 LTHD(4년·8%) 2,337,058
- 양도소득금액 합계 283,833,151
- §114조의2 가산세 13,300,202

## 기존 인프라 활용 가능

기구현된 다음 모듈을 그대로 재사용:
- **`calculateBuildingPenalty()`** at `lib/tax-engine/transfer-tax-rate-calc.ts:67-100` — `isSelfBuilt + acquisitionMethod="estimated" + constructionDate` 충족 + 보유 5년 미만 시 `applyRate(penaltyBase, 0.05)` 반환.
- **finalize.ts STEP 10.5** at `lib/tax-engine/transfer-tax-finalize.ts:154-160` — penalty 합산 위치 그대로.
- **`buildGeneralBuildingAssetCards()`** at `lib/tax-engine/general-building-valuation.ts:297` — 5단 파이프라인(§166⑥/§176의2/§163⑥/NBL/카드 생성) 그대로. **유일 변경점**: 건물 카드의 `acquisitionDate`를 별도 필드로 분리.

> ⚠️ **별도 이슈 (본 plan 범위 밖, 메모만)**: 기존 `general-building-valuation.ts`의 주석·법령배지에서 환산취득가액 산식의 근거를 **「시행령 §176의2 ④」**로 인용하나, KoreanLaw MCP 확인 결과 환산취득가액 산식은 **「시행령 §176의2 ②」** 본문이고 ④는 의제취득일 전 자산의 생산자물가상승률 합산 규정. 본 사례 32 작업과 무관하므로 정정은 별도 PR로 분리(`legal-codes/transfer.ts` `TRANSFER.GENERAL_BUILDING_ESTIMATED_ACQ` 문자열 변경 + 회귀 테스트만 영향).
- **`dispatchGeneralBuilding()` route 헬퍼** at `app/api/calc/transfer/general-building-route-helper.ts:148` — 환산 모드 분기 그대로. **유일 변경점**: `buildProperties()` 가 건물 카드에만 `useEstimatedAcquisition/acquisitionMethod/isSelfBuilt/constructionDate` 패스스루.

## 변경 파일 (총 9개)

### 1. 엔진: `lib/tax-engine/general-building-valuation.ts` (478줄→~500줄)

**`GeneralBuildingInput` 타입 확장** (line 39 부근):
```ts
/** 건물 취득일 (사용승인일). 미입력 시 acquisitionDate fallback (사례 31 호환). */
buildingAcquisitionDate?: Date;
/** 신축취득 여부. true 시 건물 카드에 §114조의2 5% 가산세 발동 정보 노출. */
isSelfBuilt?: boolean;
```

**`AssetCardForAggregate` 확장** (line 115 부근) — **변수 단일화: `buildingAcquisitionDate` 1개만**, `constructionDate` 별도 필드 추가하지 않음:
```ts
/** 건물 카드만 set. 라우트가 TransferTaxItemInput 매핑 시 사용. */
isSelfBuilt?: boolean;
/**
 * 건물 카드만 set. 영 §162①4호 기준 "빠른 날"(사용승인서 교부일·사실상 사용일·임시사용승인일 중).
 * 환산취득가액 가산세(소득세법 §114조의2 ①)의 5년 기산점이자 건물 LTHD 보유기간 기산점.
 */
buildingAcquisitionDate?: Date;
```

**`buildGeneralBuildingAssetCards()` 수정** (line 380, 395, 411, 428):
- 토지 카드 3개 위치(`acquisitionDate: input.acquisitionDate`)는 그대로 = 토지 취득일(2008.3.17).
- 건물 카드(line 428): `acquisitionDate: input.buildingAcquisitionDate ?? input.acquisitionDate`(2018.3.31, 미입력 시 fallback = 토지 취득일 ← 사례 31 호환).
- 건물 카드에 추가: `isSelfBuilt: input.isSelfBuilt ?? false`, `buildingAcquisitionDate: input.buildingAcquisitionDate ?? input.acquisitionDate`.

**라우트 헬퍼 매핑 시점**(아래 #2)에서 `card.buildingAcquisitionDate` → `TransferTaxInput.constructionDate`로 변환. 즉 기존 `calculateBuildingPenalty(input)`이 읽는 `input.constructionDate`는 시그니처 그대로 유지되지만, 그 값의 **원천 단일 필드는 `buildingAcquisitionDate`**. UI·스키마·자산 카드 어디에도 `constructionDate` 변수명 노출 금지.

### 2. 라우트 헬퍼: `app/api/calc/transfer/general-building-route-helper.ts:72-98`

**`buildProperties()` 수정** — 건물 카드(`propertyType === "general_building_unit"`)에만 환산취득가액 가산세 발동 4개 필드 매핑. **`buildingAcquisitionDate` → 엔진 input의 `constructionDate`로 변환은 이 시점에서만 발생**:
```ts
return cards.map((card) => {
  const isBuilding = card.propertyType === "general_building_unit";
  return {
    // ... 기존 필드
    useEstimatedAcquisition: isBuilding && card.usedEstimatedAcquisition,
    acquisitionMethod: isBuilding && card.usedEstimatedAcquisition ? "estimated" : "actual",
    isSelfBuilt: isBuilding ? (card.isSelfBuilt ?? false) : false,
    constructionDate: isBuilding ? card.buildingAcquisitionDate : undefined, // 단일 원천에서 매핑
    // ...
  } as unknown as TransferTaxItemInput;
});
```
**주의**: 토지 카드의 `useEstimatedAcquisition`·`isSelfBuilt`는 false 유지 — 소득세법 §114조의2 ①은 "건물"에만 적용(토지 환산취득가에는 가산세 없음).

### 3. Zod 스키마: `lib/api/transfer-tax-schema.ts:50-75`

`generalBuildingValuationSchema`에 2필드 추가:
```ts
/** 건물 취득일 — 영 §162①4호 빠른 날(사용승인서 교부일·사실상 사용일·임시사용승인일 중). isSelfBuilt=true 시 필수. */
buildingAcquisitionDate: z.string().date().optional(),
/** 신축취득 여부. 5년 이내 양도 시 소득세법 §114조의2 ① 5% 가산세 발동. */
isSelfBuilt: z.boolean().optional(),
```

`addPropertyRefines` (있다면): `gbValuation.isSelfBuilt === true` AND 건물 보유 5년 미만이면 `buildingAcquisitionDate` 필수 검증.

### 4. 라우트: `app/api/calc/transfer/route.ts`

`generalBuildingValuation` payload → `dispatchGeneralBuilding` 호출 시 `coerceDates`로 `buildingAcquisitionDate` Date 변환 (`lib/api/date-coerce.ts` 사용).

### 5. API 변환: `lib/calc/transfer-tax-api-helpers.ts:144-167`

`buildGeneralBuildingValuation()` 환산 모드 블록(line 165~)에 다음 2개 수집 추가:
```ts
buildingAcquisitionDate: asset.gbBuildingAcquisitionDate || undefined,
isSelfBuilt: asset.gbIsSelfBuilt ?? false,
```

### 6. UI: `components/calc/transfer/GeneralBuildingBlock.tsx` (247줄→~290줄)

**⑤ 신축 정보 섹션 (amber tone) 신규** — ④ 비사업용토지 판정 직전에 배치:
- `RadioCardGroup`(또는 `ToggleCard`) `gbIsSelfBuilt`: "신축취득(자가건축)" / "일반취득" — Image 2의 "취득원인 1단계 선택"과 동일.
- ON 시: `DateInput` `gbBuildingAcquisitionDate` 노출. 라벨: **"건물 취득일"**, hint: "사용승인서 교부일·사실상 사용일·임시사용승인일 중 빠른 날 (소득세법 시행령 §162①4호)".
- ON + 양도일 - 건물취득일 < 5년: 안내 배지 **"환산취득가액 가산세 적용 — 건물 환산취득가액의 5% (소득세법 §114조의2 ①)"**.

**FormData 타입 확장** (form 정의 파일):
```ts
gbIsSelfBuilt?: boolean;
gbBuildingAcquisitionDate?: string;  // YYYY-MM-DD
```

### 7. validate: `lib/calc/transfer-tax-validate.ts`

`general_building` + `gbIsSelfBuilt === true` 시 `gbBuildingAcquisitionDate` 필수 + `gbBuildingAcquisitionDate >= acquisitionDate(토지)` 검증.

### 8. 결과 화면

`BundledAllocationCard` 또는 `GeneralBuildingResultCard`(존재 시)에 가산세 라인 추가:
- 라벨: **"환산취득가액 가산세 (소득세법 §114조의2 ①)"**
- 산식: `건물 환산취득가 {266,004,044} × 5% = {13,300,202}` (한국어 풀어쓰기, "원" 접미 금지)
- 표시 조건: `result.penaltyTax > 0 && result.penaltyBase > 0`
- 배치: 결정세액 라인 직후, 지방소득세 라인 직전

### 9. 테스트: `__tests__/tax-engine/transfer-tax/general-building-case-32.test.ts` (신규)

PDF #32 anchor **17개 toBe() + 5년 경계 가드 3개 = 총 20개**:

**본 사례 anchor (17개)**:
- 양도가 안분 2개: 1,317,938,332 / 302,061,668
- 환산취득가 2개: 936,945,640 / 266,004,044
- 개산공제 2개: 24,108,000 / 6,844,394 (= 입력 `acquisitionLandPricePerSqm × landArea × 3%`, `acquisitionBuildingStdPrice × 3%` 기반 — 영 §163⑥)
- 양도차익 2개: 356,884,692 / 29,213,230
- LTHD 2개: 99,927,713 (토지 14년 28%) / 2,337,058 (건물 4년 8%)
- 양도소득금액 합계 1개: 283,833,151
- **환산취득가액 가산세 1개: 13,300,202** (= 266,004,044 × 5%, applyRate floor; 라벨 "소득세법 §114조의2")
- 토지 카드 가산세 0 검증 1개 (소득세법 §114조의2 ①은 건물 한정)
- `gbIsSelfBuilt === false` 시 가산세 0 검증 1개
- `gbIsSelfBuilt === true + buildingAcquisitionDate` 미입력 → validate 차단 검증 1개
- **개산공제 분리 회귀 가드 (정책 #4)**: 토지·건물 카드 모두 `usedEstimatedAcquisition === true` 명시 anchor 2개 추가 — `feedback_estimated_deduction_separation.md` 정책 강제. FilingFormTable fallback 분기로 떨어져 합산 흡수되는 회귀 차단.
- 회귀: 사례 31 38개 anchor 별도 파일에서 변경 없음 확인 (`general-building-case-31.test.ts` / `-bundled.test.ts`)

**5년 기산점 경계 가드 (3개)** — `calculateBuildingPenalty` 비교 연산자(`yearsHeld < 5`) 검증:
- **만 5년 -1일**: buildingAcquisitionDate=2018.3.31, transferDate=2023.3.30 → 가산세 적용(< 5년)
- **만 5년 당일**: buildingAcquisitionDate=2018.3.31, transferDate=2023.3.31 → **가산세 미적용**(`>= 5년`은 면제, 소득세법 §114조의2 ① "5년 이내" 해석)
- **만 5년 +1일**: buildingAcquisitionDate=2018.3.31, transferDate=2023.4.1 → 가산세 미적용

(현행 `calculateBuildingPenalty:91`은 `yearsHeld >= 5 → return null`. msPerYear = 365.25×24×60×60×1000 윤년 보정. 경계 테스트로 회귀 보호.)

테스트는 `calculateGeneralBuildingTransfer()` 직접 호출 패턴 — 기존 `general-building-route-helper.test.ts:1-…` 동일 mock pattern.

## 14개 동기화 지점 매트릭스

| # | 지점 | 변경 |
|---|---|---|
| ① | FormData 타입 | `gbIsSelfBuilt`, `gbBuildingAcquisitionDate` 추가 |
| ② | initial value | 둘 다 `undefined` |
| ③ | normalize fallback | `gbIsSelfBuilt: false`, `gbBuildingAcquisitionDate: ""` |
| ④ | API 변환 (`transfer-tax-api-helpers.ts`) | `buildGeneralBuildingValuation()` 2필드 수집 |
| ⑤ | UI 입력 위젯 | RadioCardGroup + DateInput 신규 섹션 |
| ⑥ | 사이드바 합계 | 해당 없음(가산세는 결과 단계) |
| ⑦ | 결과 카드 산식 | "감정가액·환산취득가액 가산세 (§114조의2)" 라인 |
| ⑧ | validation (`transfer-tax-validate.ts`) | isSelfBuilt=true → buildingAcquisitionDate 필수 |
| ⑨ | Zod enum (메인) | 변경 없음 (boolean·date만 추가) |
| ⑩ | Zod enum (companion) | 변경 없음 |
| ⑪ | 자산-수준 acquisitionDate fallback | building 별도 처리(이 작업 자체) |
| ⑫ | **Zod 입력 객체 정의** | `generalBuildingValuationSchema` 2필드 추가 ★ |
| ⑬ | callTransferTaxAPI body spread | `gbValuation` 객체 자체에 포함 — spread 자동 |
| ⑭ | **Route handler 엔진 매핑** | `coerceDates(["generalBuildingValuation.buildingAcquisitionDate"])` ★ |

## 정책 사전 적용 (메모리 인덱스 기반)

- **자동 안분 fallback 금지** — `gbIsSelfBuilt=true` + `gbBuildingAcquisitionDate` 미입력 시 자동 채우지 않고 ⑧에서 차단.
- **useEffect → store 미러링 금지** — `gbIsSelfBuilt` 토글 OFF 시 `gbBuildingAcquisitionDate` 클리어는 onChange 핸들러에서 직접 처리. UI 시니어는 다음 패턴 강제(`feedback_useeffect_store_mirror_forbidden.md` 인용):
  ```tsx
  // ✅ 권장 — 사용자 이벤트 핸들러에서만 store 업데이트
  onChange={(checked) => {
    onAssetChange({
      gbIsSelfBuilt: checked,
      ...(!checked ? { gbBuildingAcquisitionDate: undefined } : {})
    });
  }}
  // ❌ 금지 — useEffect로 store에 미러링 (Maximum update depth exceeded)
  useEffect(() => { if (!gbIsSelfBuilt) onAssetChange({ gbBuildingAcquisitionDate: undefined }); }, [gbIsSelfBuilt]);
  ```
- **양도연도 세율 우선** — anchor 산출세액 검증 시 2023년 §55 누진세율표 직접 계산(외부 자료 추종 금지). 본 PDF는 양도소득금액까지만 anchor → 산출세액·총납부세액은 회귀 가드만.
- **개산공제 분리** — 환산 모드 신규 분기에서 `usedEstimatedAcquisition`·`estimatedBase`·`estimatedDeduction` 3종 누락 없이 묶음 유지(이미 `buildGeneralBuildingAssetCards`가 처리 — 회귀만 확인).
- **3시점 입력 일관성** — 본 사례는 2시점(취득시·양도시)이므로 별도 영향 없음.
- **포커스 시 전체 선택**, **DateInput 사용**, **숫자 단위 "원" 미표기** 모두 기존 GeneralBuildingBlock 패턴 그대로.

## 검증 (Verification)

```bash
# 1. 신규 anchor 17개
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-32.test.ts

# 2. 사례 31 회귀 (38 anchor 보존)
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-31.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-31-bundled.test.ts

# 3. 전체 회귀
npx tsc --noEmit
npx vitest run __tests__/tax-engine/transfer-tax/

# 4. 브라우저 수동 확인
npm run dev
# → /calc/transfer 마법사 → 일반건물 선택 → 환산 모드 → 신축취득 토글 ON
# → 건물 취득일 2018-03-31 입력 → 결과 화면 §114조의2 가산세 라인 확인
# → Network 탭 request body에 generalBuildingValuation.{buildingAcquisitionDate, isSelfBuilt} 포함 확인
```

## 파일 사이즈 정책

- `general-building-valuation.ts`: 478줄 → ~500줄 (여유 300줄)
- `general-building-route-helper.ts`: 346줄 → ~360줄 (여유 440줄)
- `transfer-tax-api.ts`: 794줄 (변경 없음 — 헬퍼 파일에서만 작업)
- `GeneralBuildingBlock.tsx`: 247줄 → ~290줄 (여유 510줄)

모두 800줄 미만 유지.

## 작업 순서

1. **PM 단계**: 본 plan 승인 → MEMORY 정책 점검 (위 5개) ✓
2. **Design 단계**: `docs/02-design/features/_template.engine.design.md` 복사로 케이스 매트릭스 작성. **교차 분기 enumerate 시 다음 한 줄 명시**:
   > "환산취득가액 가산세(소득세법 §114조의2 ①)는 §99의3 고가주택 12억 안분과 무관하게 **건물 환산취득가액 전체 × 5%** 로 결정세액에 가산. 비사업용토지 중과세율(§104①)과도 별개 — 중과세율은 산출세액 단계, 가산세는 결정세액 단계에서 합산. 미래 사례(§99의3 신축주택 + 단기 / NBL 토지+신축건물 일괄 등)에서 산식 충돌 가능성 사전 차단."
3. **Do — 엔진 시니어** (`transfer-tax-senior`): #1, #2, #3, #4, #9 (anchor 테스트 동시 작성)
4. **Do — UI 시니어** (`transfer-tax-ui-senior`): #5, #6, #7, #8 (#5는 800줄 분할 호출, #6~#8은 별도 호출)
5. **Check**: `ui-engine-sync-checker` + `transfer-tax-qa` + 브라우저 수동 확인
6. **Act**: 회귀 가드 추가, 메모리 `project_general_building_case_32.md` 작성

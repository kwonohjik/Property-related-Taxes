# 일반건물 4가지 조합 확장 — 쌍방+쌍방·일방+쌍방·일방+일방

## Context

**왜 이 변경이 필요한가**
- 예제는 일반건물 양도세 계산을 **4가지 조합**으로 지원: 쌍방+쌍방·쌍방+일방·일방+쌍방·일방+일방 (이미지 ②, ③의 "계산유형" 메뉴).
- 현재 본 프로젝트 지원 현황:
  - 사례 31: 일방 (증축 없음, 토지+건물 환산) ✅
  - 사례 33: 쌍방+일방 (원건물 실가 + 증축분 환산) ✅
  - 쌍방+쌍방·일방+쌍방·일방+일방: ❌
- 사용자 질문 — "원취득 환산 + 증축 실가" 같은 반대 케이스 계산 가능한지. 현 엔진은 한 방향만 지원 → 4가지 조합 모두 지원하도록 확장 필요.

**의도된 결과**: `extensionInfo`에 `acquisitionMode: "actual" | "estimated"` enum + 증축 실가 필드 2개 추가. UI는 (B) 현 라디오 4옵션 유지 + 증축 토글 내부에 "증축분 취득방식" 서브 라디오 2옵션 (실가/환산). 4가지 조합 모두 단일 카드 3장 출력 + 차손 통산 자동 작동. anchor는 사례 33 입력값 파생 합성으로 검증.

## 4가지 조합 매트릭스

| 조합 | 원건물(토지+건물1) | 증축(건물2) | 원건물 모드 (라디오 1·2) | gbHasExt | 증축 서브 라디오 |
|---|---|---|---|---|---|
| **쌍방+쌍방** | 실가 일괄 | 실가 별도 | 실거래가 | ✅ | 실거래가 |
| **쌍방+일방** (사례 33) | 실가 일괄 | 환산 | 실거래가 | ✅ | 환산취득가 |
| **일방+쌍방** | 환산 (사례 31식) | 실가 별도 | 환산취득가 | ✅ | 실거래가 |
| **일방+일방** | 환산 (사례 31식) | 환산 | 환산취득가 | ✅ | 환산취득가 |
| 사례 31 (참고) | 환산 | — | 환산취득가 | ❌ | n/a |
| 사례 31 변형 (참고) | 실가 | — | 실거래가 | ❌ | n/a |

**핵심**: 원건물·증축이 각각 독립 모드. 4가지 조합 = 2 × 2 매트릭스.

## 핵심 설계 결정 — `extensionInfo.acquisitionMode` enum 도입

**현재 사례 33 의미 매핑 정정**:
- 사례 33 UX 개선 PR에서 4번째 라디오 옵션이 `useEst=true + gbHasExt=true` 설정 — 의미적으로는 "일방+일방"에 해당
- 본 PR에서 의미 재정렬:
  - 4번째 라디오 "쌍방+일방" → `useEst=false + gbHasExt=true + extensionInfo.acquisitionMode="estimated"` (사례 33 정확 매핑)
  - 4번째 라디오는 **쇼트컷 보조** — 사용자가 한 번에 사례 33 진입
- 일반 흐름: 라디오 1(실거래가) 또는 2(환산취득가) + 증축 토글 ON + 서브 라디오로 모드 선택

### 신규 필드 — `GeneralBuildingInput.extensionInfo`

```ts
extensionInfo?: {
  // 기존 (유지)
  extensionDate: Date;
  extensionArea?: number;
  extensionAcquisitionCause: "purchase" | "newConstruction";  // §114조의2 가산세 분기

  // 기존 (환산 시 사용 — acquisitionMode === "estimated")
  transferExtensionBuildingStdPrice?: number;     // optional로 완화
  acquisitionExtensionBuildingStdPrice?: number;  // optional로 완화

  // 신규 (실가 시 사용 — acquisitionMode === "actual")
  /** 증축 모드 — "actual"(실가) | "estimated"(환산). default "estimated" */
  acquisitionMode: "actual" | "estimated";
  /** 증축 실거래가 (acquisitionMode === "actual" 시 필수) */
  actualAcquisitionPrice?: number;
  /** 증축 시 발생한 필요경비 (acquisitionMode === "actual" 시) */
  actualExpenses?: number;

  // 기존 (유지) — 원건물 실가 시
  actualBundledAcquisitionPrice?: number;  // optional로 완화 (원건물 환산 시 미사용)
  actualBundledExpenses?: number;
};
```

**원건물 모드는 별도 필드 없이 `acquisitionMethod`(엔진 API 변환 단계의 "actual"/"estimated") + `gbHasExtension` 조합으로 판단**. 원건물 환산 시(`acquisitionMethod === "estimated"`) Step 2 분기에서 사례 31식 토지·건물1 환산 산식으로 분기.

## 엔진 변경 — `general-building-extension.ts` (299줄 → 예상 +60줄)

### Step 1 — 양도가 3-way 안분 (변경 없음)
양도시 기준시가 비율(§166⑥) 그대로 — 4가지 조합 모두 동일.

### Step 2 — 원건물(토지+건물1) 취득가 산정 (★ 신규 분기)

```
if (acquisitionMethod === "actual") {
  // 쌍방+* (원건물 실가) — 일괄 실가 안분 (현재 사례 33 산식 유지)
  landAcq    = floor(actualBundledAcquisitionPrice × acqLandStd / denom2)
  building1Acq = actualBundledAcquisitionPrice - landAcq
  landExp / building1Exp 동일 비율 안분
} else {
  // 일방+* (원건물 환산) — 사례 31 산식 적용
  landAcq    = floor(landTransferPrice × acqLandStd / landStd)        // 양도가 안분 × 취득시/양도시 비율
  building1Acq = floor(building1TransferPrice × acqBuildingStd / transferBuildingStd)
  // 개산공제 자동 (§163⑥): floor(취득시 기준시가 × 3%)
  landDed     = floor(acqLandStd × 0.03)
  building1Ded = floor(acqBuildingStd × 0.03)
  // expenses는 environmental에서 처리 (실가 모드와 다른 경로)
}
```

### Step 3 — 증축분(건물2) 취득가 산정 (★ 신규 분기)

```
if (extensionInfo.acquisitionMode === "actual") {
  // *+쌍방 (증축 실가) — 사용자 입력값 그대로
  building2Acq = extensionInfo.actualAcquisitionPrice
  building2Exp = extensionInfo.actualExpenses ?? 0
  building2EstDeduction = 0  // 실가 모드는 개산공제 없음
} else {
  // *+일방 (증축 환산) — 현재 사례 33 산식
  building2Acq = floor(building2TransferPrice × acqExtStd / transferExtStd)
  building2EstDeduction = floor(acqExtStd × 0.03)
}
```

### Step 4 — AssetCardForAggregate 3장 출력 (변경 없음)
토지/건물1/건물2 카드 구조 동일. 단 카드별 `usedEstimatedAcquisition` 플래그가 모드별로 분기:
- 원건물 환산 시 토지·건물1 카드: `usedEstimatedAcquisition=true`
- 증축 환산 시 건물2 카드: `usedEstimatedAcquisition=true`
- 그 외 false

## UI 변경 — 라디오 4옵션 유지 + 증축 토글 서브 라디오 2옵션

### #1 `CompanionAcqPurchaseBlock.tsx` — 4번째 라디오 onClick 정정

기존 (사례 33 UX PR에서 추가):
```tsx
onClick={() => {
  props.onUseEstimatedChange(true);   // ← 의미 오류 (일방+일방 매핑)
  props.onIsAppraisalAcquisitionChange?.(false);
  props.onGbHasExtensionChange?.(true);
}}
```

정정 (쌍방+일방 정확 매핑):
```tsx
onClick={() => {
  props.onUseEstimatedChange(false);  // ★ 원건물 실가
  props.onIsAppraisalAcquisitionChange?.(false);
  props.onGbHasExtensionChange?.(true);
  props.onGbExtensionAcquisitionModeChange?.("estimated");  // 증축 환산
}}
```

description 텍스트도 유지: "원취득 실가 + 증축분 환산취득가".

**isMixedExtension 파생값 정정**:
```tsx
const isMixedExtension =
  props.assetKind === "general_building" &&
  props.useEstimatedAcquisition === false &&  // ★ false로 정정
  props.isAppraisalAcquisition !== true &&
  props.gbHasExtension === true &&
  props.gbExtensionAcquisitionMode === "estimated";
```

### #2 `GeneralBuildingBlock.tsx` — 증축 ToggleCard 내부 서브 라디오 신규

기존 5필드 위에 신규 라디오 1개 추가 (line 309 근처 — 증축 취득원인 라디오 직전):

```tsx
<FieldCard label="증축분 취득 방식" hint="원취득과 무관하게 증축분의 취득가액 산정 방식을 별도로 선택합니다.">
  <RadioCardGroup
    name="gbExtensionAcquisitionMode"
    layout="inline"
    value={asset.gbExtensionAcquisitionMode ?? "estimated"}
    onChange={(v) => onChange({ gbExtensionAcquisitionMode: v as "actual" | "estimated" })}
    options={[
      { value: "estimated", label: "환산취득가 (기본)" },
      { value: "actual",    label: "실거래가 (별도 입력)" },
    ]}
  />
</FieldCard>
```

### #3 `GeneralBuildingBlock.tsx` — 서브 라디오 모드별 필드 분기

증축 환산 모드 (`gbExtensionAcquisitionMode === "estimated"`):
- 양도시 건물2 기준시가 총액 (`gbTransferExtensionBuildingStdPrice`) — 기존
- 취득시 건물2 기준시가 총액 (`gbAcquisitionExtensionBuildingStdPrice`) — 기존

증축 실가 모드 (`gbExtensionAcquisitionMode === "actual"`):
- 증축 실거래가 (`gbExtensionActualAcquisitionPrice`) — **신규 CurrencyInput**
- 증축 실제 필요경비 (`gbExtensionActualExpenses`) — **신규 CurrencyInput**

기존 5필드 그룹의 표시 조건을 분기 (mode별 다른 필드 노출).

### #4 시나리오 가이드 카드 업데이트

기존 3시나리오 → 5시나리오로 확장 (or 단순화):

```tsx
<ul>
  <li>• <b>실거래가</b>: 토지·건물 일괄 취득가 입증 가능</li>
  <li>• <b>환산취득가</b>: 토지+건물 전체 입증 불가, 모두 환산</li>
  <li>• <b>쌍방+일방 (증축 있음)</b>: 원취득은 실가, 증축분만 환산</li>
  <li className="text-blue-600">• 그 외 조합 (쌍방+쌍방·일방+쌍방·일방+일방): 라디오 1/2 선택 후 증축 토글 ON, 서브 라디오로 모드 선택</li>
</ul>
```

### #5 안분 미리보기 카드 4분기 확장

기존 useMemo는 `acquisitionMode === "estimated"` 전제로 환산 계산만 함. 모드별로 4가지 분기 추가:
- 원건물 실가 → Step 2 일괄 실가 안분
- 원건물 환산 → Step 2 사례 31식 환산
- 증축 실가 → Step 3 실가 그대로
- 증축 환산 → Step 3 환산식

## 변경 대상 파일

| 파일 | 변경 | 예상 +줄 |
|---|---|---:|
| `lib/tax-engine/general-building-extension.ts` (299줄) | Step 2·3 모드 분기 + 카드 출력 분기 | +80 (379, 800 마진 충분) |
| `lib/tax-engine/general-building-valuation.ts` (669줄) | `extensionInfo` 타입에 `acquisitionMode` enum + 신규 2필드 + tsdoc | +25 (694) |
| `lib/stores/calc-wizard-asset.ts` (711줄) | AssetForm에 `gbExtensionAcquisitionMode`·`gbExtensionActualAcquisitionPrice`·`gbExtensionActualExpenses` 3필드 | +20 (731) |
| `lib/stores/calc-wizard-asset-factory.ts` (484줄) | initial value 3필드 + normalize 분기 (mode==="estimated" 시 신규 2필드 reset, vice versa) | +20 |
| `lib/calc/transfer-tax-api-helpers.ts` (598줄) | `buildExtensionInfo()` 모드 분기 + 실가 시 acquisition/expenses 매핑 + acquisitionMethod=actual 시 actualBundled* 보존 | +25 (623) |
| `lib/calc/transfer-tax-validate-gb.ts` (139줄) | 모드별 필수 필드 분기 (실가 모드: actualAcquisitionPrice > 0 / 환산 모드: 2 stdPrice > 0) | +15 (154) |
| `lib/api/transfer-tax-schema.ts` (749줄) | `extensionInfoSchema`에 acquisitionMode enum + 2 신규 필드 optional + refine으로 모드별 필수 강제 | +20 (769) |
| `app/api/calc/transfer/general-building-route-helper.ts` (459줄) | `coercedExtInfo`에 신규 3필드 spread | +10 (469) |
| `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` (691줄) | 4번째 라디오 onClick 정정 + isMixedExtension 파생 정정 + `onGbExtensionAcquisitionModeChange` props 추가 | +15 (706) |
| `components/calc/transfer/GeneralBuildingBlock.tsx` (416줄) | 증축 서브 라디오 + 모드별 필드 분기 + 미리보기 4분기 + 가이드 5시나리오 | +60 (476) |
| `components/calc/transfer/GeneralBuildingAcquisitionCards.tsx` (306줄) | 신규 props 전파 | +5 (311) |
| `__tests__/tax-engine/transfer-tax/general-building-extension-case-33.test.ts` | 사례 33 회귀 보존 (acquisitionMode 신규 필드 추가 입력) | +5 |
| `__tests__/tax-engine/transfer-tax/general-building-four-combinations.test.ts` | **신규** — 3조합 anchor 60개 (조합당 20) | 신규 |

**800줄 정책**: 모든 파일 마진 충분. 800 초과 위험 0.

## 합성 anchor 전략 — 사례 33 입력 파생

사용자 결정: 예제 PDF 추가 사례 미보유 → 사례 33 입력값을 변형하여 4가지 조합 anchor 합성.

### 공통 입력 (사례 33 기반)
- 양도일: 2023-02-19, 양도가: 330,000,000
- 원취득일: 2003-03-17, 일괄 실가 200,000,000, 일괄 필요경비 8,000,000
- 증축일: 2007-07-24
- 양도시 기준시가: 토지 5,956,000원/㎡ × 57㎡ + 건물1 12,308,310 + 건물2 54,501,720
- 취득시 기준시가: 토지 1,400,000원/㎡ × 57㎡ + 건물1 16,997,190 + 건물2 40,604,200
- 면적: 토지 57㎡, 건물1 83.73㎡, 건물2 83.72㎡

### 조합별 변형
- **쌍방+쌍방**: 위 입력 + 증축 실가 50,000,000 + 증축 필요경비 2,000,000 (가정)
- **쌍방+일방** (사례 33 유지): 기존 anchor 39개 그대로
- **일방+쌍방**: `useEstimatedAcquisition=true` (원건물 환산) + 증축 실가 50,000,000
- **일방+일방**: `useEstimatedAcquisition=true` + 증축 환산 (사례 33 동일 산식)

### anchor 산식 (조합당 ~20개)
각 조합별:
- Step 1 양도가 3-way: 토지/건물1/건물2 양도가 + 합계
- Step 2 취득가: 토지/건물1 (모드별 다름)
- Step 3 증축: 건물2 취득가 + 개산공제 (실가 모드는 개산공제 0)
- 양도차익·LTHD·통산 후·산출세액·지방세

**핵심 검증**: 각 조합의 산출세액이 양도소득세법 §55 누진세율표(2023년) 직접 계산과 일치. 예제 PDF 없이도 법령 정합성으로 anchor 자가검증.

## 14지점 동기화 평가

| # | 영향 | 라인 예상 |
|---|---|---:|
| ① 폼 타입 | 3필드 추가 | +20 |
| ② initial | 3필드 default | +5 |
| ③ normalize | 모드 분기 reset | +10 |
| ④ API 변환 | buildExtensionInfo 모드 분기 | +25 |
| ⑤ UI 위젯 | 서브 라디오 + 필드 분기 + 미리보기 | +60 |
| ⑥ 사이드바 | 영향 없음 | 0 |
| ⑦ 결과 카드 | `BundledAllocationCard` 3-way 표는 기존 유지 (carded 환산 여부 배지 분기만) | +5 |
| ⑧ validate | 모드별 필수 분기 | +15 |
| ⑨⑩ Zod enum | acquisitionMode enum | +5 |
| ⑪ acquisitionDate fallback | 변경 없음 | 0 |
| ⑫ Zod 객체 정의 | 2 신규 필드 + refine | +15 |
| ⑬ callTransferTaxAPI body | 자동 (buildExtensionInfo 통해) | 0 |
| ⑭ Route handler | spread 신규 3필드 | +10 |

→ **실질 변경 8지점, 누락 위험 영역 ⑫⑬⑭에 집중 점검 필요**.

## 재사용 (신규 작성 금지)

- 사례 31 토지·건물 환산 산식 — `general-building-valuation.ts:322-417` Step 1·2·3 그대로 호출 또는 헬퍼 추출
- `safeMultiplyThenDivide()` — BigInt 안전 곱셈/나눗셈
- `calculateConvertedAcquisition()` — 환산취득가 공식 헬퍼 (있다면)
- `RadioCardGroup` — 증축 모드 서브 라디오
- 사례 33 anchor 입력 팩토리 `CASE_33_INPUT` — 변형 베이스로 재사용

## 검증 방법

```bash
# 1. 타입·린트
npm run typecheck
npm run lint

# 2. anchor — 신규 + 회귀
npx vitest run __tests__/tax-engine/transfer-tax/general-building-four-combinations.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/general-building-extension-case-33.test.ts  # 사례 33 회귀
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-31.test.ts            # 사례 31 회귀
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-32.test.ts            # 사례 32 회귀

# 3. 브라우저 수동 — 4가지 조합 진입 흐름
npm run dev
# /calc/transfer → 일반건물 → 4가지 시나리오 각각:
#  1. 라디오 "실거래가" + 증축 토글 ON + 서브 라디오 "실거래가" → 쌍방+쌍방
#  2. 라디오 4번째 "쌍방+일방" 클릭 → 쌍방+일방 (사례 33, 산출세액 6,480,952 유지 확인)
#  3. 라디오 "환산취득가" + 증축 토글 ON + 서브 라디오 "실거래가" → 일방+쌍방
#  4. 라디오 "환산취득가" + 증축 토글 ON + 서브 라디오 "환산취득가" → 일방+일방
# 각 시나리오에서 안분 미리보기 카드 표시 + 산출세액 확인

# 4. ui-engine-sync-checker — 14지점 누락 점검 (특히 ⑫⑬⑭)
```

## DoD 자가 점검

- [ ] `extensionInfo.acquisitionMode` enum 추가 + 신규 2필드(actualAcquisitionPrice·actualExpenses)
- [ ] Step 2 분기 — `acquisitionMethod === "actual"` 시 일괄 실가 안분, `"estimated"` 시 사례 31식 환산
- [ ] Step 3 분기 — `extensionInfo.acquisitionMode === "actual"` 시 실가 그대로, `"estimated"` 시 환산식
- [ ] 4번째 라디오 onClick 정정 (`useEst=false` + extensionAcquisitionMode="estimated")
- [ ] 증축 토글 내부 서브 라디오 2옵션 (실가/환산) + 모드별 필드 분기
- [ ] 안분 미리보기 카드 4분기
- [ ] 시나리오 가이드 카드 — 4가지 조합 안내 추가
- [ ] anchor — 3조합 신규 60개 + 사례 33 회귀 39개
- [ ] `typecheck` 0건
- [ ] 사례 31·32·33 회귀 0
- [ ] 브라우저 수동 4시나리오 모두 검증
- [ ] sync-checker 14지점 누락 0
- [ ] 800줄 정책 모든 파일 준수

## 비스코프 (후속 PR)

1. **예제 PDF 실제 사례 anchor 보강** — 사용자가 4가지 조합 PDF 확보 시 합성 anchor를 정확 PDF anchor로 교체
2. **acquisitionMethod 전체 RadioCardGroup 통일** — button 기반 → 컴포넌트 통일
3. **사례 31의 "실거래가 (증축 없음)" 시나리오 명시** — 현 라디오 "실거래가"는 사례 31 변형으로 자동 동작하나 안내 부족
4. **결과 화면 4-way 분포 카드** — 4가지 조합별 자산 카드 비교 UI (선택사항)

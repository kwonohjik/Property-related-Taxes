# components/calc/transfer/ — 양도세 마법사 UI

공통 UI 규칙은 [../CLAUDE.md](../CLAUDE.md). 여기는 양도세에만 해당하는 구조·진입점.

## 마법사 구성 — 파일명 vs UI 인덱스

`app/calc/transfer-tax/TransferTaxCalculator.tsx`(오케스트레이터 + 사이드바 레이아웃) + `steps/`:

```
Step1.tsx  # 자산 목록 + 양도일·신고일 + 취득 상세 (자산 카드 내부에 환산·1990·감정가액·신축 통합) — UI 인덱스 0
Step4.tsx  # 보유 상황 (NBL·다주택·합가) — UI 인덱스 1
Step5.tsx  # 감면·공제 (자산별 체크박스) — UI 인덱스 2
Step6.tsx  # 가산세 (단건 모드 전용) — UI 인덱스 3
# (Step3.tsx 폐지: 2026-04-25 Step1↔Step3 통합으로 취득 정보가 자산 카드 안으로)
```

파일명은 historical naming을 유지하지만 마법사 UI는 0~3 인덱스. `STEPS_SINGLE = ["자산 목록", "보유 상황", "감면·공제", "가산세"]`. `stepComponentsAll`이 매핑. `validateStep()`도 4단계: 0=자산 / 1=보유 / 2=감면 / 3=가산세.

## 자산-수준 통합 원칙 (2026-04-25 Step1↔Step3 통합 이후)

**자산-수준 필드는 `AssetForm`에 추가한다**(폼-전역 `TransferFormData` 아님). 취득 정보 13필드가 폼-전역에서 자산-수준으로 이전됐다:

- `acquisitionMethod` 폼 필드 폐지 → 자산-수준 `useEstimatedAcquisition` (boolean) + `isAppraisalAcquisition` (boolean) 두 플래그로 표현
- `appraisalValue` 폐지 → 감정가액 모드에서는 `fixedAcquisitionPrice`에 그대로 입력 (실가 입력 루틴과 단일화)
- `isSelfBuilt`/`buildingType`/`constructionDate`/`extensionFloorArea` 4필드 → `AssetForm`에 자산별 저장
- `pre1990*` 7필드 → `AssetForm`에 자산별 저장 (이미 자산-수준에 존재)

**API 변환 (`lib/calc/transfer-tax-api.ts`)**: 엔진 입력의 `acquisitionMethod` 키는 자산 플래그에서 도출:
```typescript
const isAppraisal = primary.isAppraisalAcquisition === true;
const isEstimated = !isAppraisal && primary.useEstimatedAcquisition;
acquisitionMethod: isAppraisal ? "appraisal" : isEstimated ? "estimated" : "actual"
```

**감정가액 + 개산공제 자동 적용**: 엔진 `calcTransferGain`(`transfer-tax-helpers.ts`)이 `acquisitionMethod === "appraisal"` 시 자동으로 `취득시 기준시가 × 3%` 개산공제 적용 (소득세법 시행령 §163⑥).

**sessionStorage 마이그레이션**: `lib/stores/calc-wizard-migration.ts`의 `migrateLegacyForm`이 legacy 폼-전역 13필드 → assets[0]로 자동 이전.

## 1990 환산 표시 조건

`acquisitionDate < "1990-08-30"`인 **모든 토지 성분**에 적용된다 — `assetKind === "land"`(환산취득가 모드) · 겸용주택 PHD · 일반 주택 PHD(§164⑦) · 상속주택 평가 · 상가건물(§164⑥) · 일반건물.

> 🔴 **「법령상 토지 전용」은 오독이었다** (2026-09-05 정정). 영 §164④는 「1990년 8월 30일 개별공시지가가 고시되기 전에 취득한 **토지의 취득당시의 기준시가**」를 정하는 규정, 즉 법 §99①1호 **가목의 가액**을 정의한다 — 자산 종류 제한이 아니다. 주택의 §164⑦ 산식 분자가 「취득당시의 법 §99①1호 **가목**의 가액과 나목의 가액의 합계액」을 요구하므로, 1990.8.30. 이전 취득 주택의 부수토지에도 §164④가 그 자리를 채운다. 상위 위임도 둘을 한 호에서 묶는다 — 법 §99③2호 「…공시되기 전에 취득한 **토지 및 주택**의 취득 당시의 기준시가」.
>
> 파생은 `lib/calc/transfer-pre1990-phd-bridge.ts` 단일 소스를 ④·⑤·⑧이 공유한다(3중 패턴). 컴포넌트에서 `useEffect → store`로 미러링하지 말 것 — display fallback으로만 전달한다.

## 양도세 전용 입력 컴포넌트

| 용도 | 컴포넌트 | 비고 |
|---|---|---|
| 3-시점 기준시가 | `ThreePointStandardPriceInput.tsx` | 취득·최초공시·양도 3시점 토지·건물 기준시가. `splitHousingCommercialForAcqAndFirst` prop 활성 시 모든 시점에서 주택분/상가분 같은 행 4부분 표시 (Case A 전용). |
| 신축·증축 | `SelfBuiltSection.tsx` | 자산-수준 4필드 (isSelfBuilt·buildingType·constructionDate·extensionFloorArea). `acquisitionCause === "purchase"` + housing/building 자산 전용. |
| 감면 통합 패널 | `UnifiedReductionPanel.tsx` | 5카테고리 통합 UI. standalone(자경·공익)=체크박스, 그룹(장기임대·신축·미분양)=펼침 헤더+라디오. 시한 외/미구현 항목 자동 disabled. |
| 감면 조문 PHD 환산 | `ReductionPhdInput.tsx` | 신축주택 감면 조문(§99의3 등)용 소득세법 시행령 §164⑦ 환산 위젯. 자산-수준 PHD와 별도 — 활성화는 수동 토글이며, 취득일 < 최초공시일이면 「환산 권장」 안내만 표시. |

## 사이드바 요약 — 자산별 행이 정본

사이드바가 렌더하는 것은 **자산별 행**이다 — `computeTransferPerAssetSummary(formData, result)`
(`lib/stores/transfer-per-asset-summary.ts`, 렌더러 `app/calc/transfer-tax/TransferSidebarSummary.tsx`).
계산 전에는 엔진 leaf로 미리 산출하고(개산공제율 `estimatedDeductionRate` · 일반건물·상가 전용 프리뷰),
계산 후에는 엔진이 실제 차감한 값을 읽는다.

```typescript
// hook으로 직접 호출 금지 — useSyncExternalStore 무한 루프 발생. useMemo로 래핑:
const perAssetSummary = useMemo(() => computeTransferPerAssetSummary(formData, result), [formData, result]);
```

`computeTransferSummary(formData, result)`(`lib/stores/calc-wizard-store.ts`)는 #487 이후 **화면 소비처가 없다**.
필요경비 합계는 자산별 행의 합으로만 계산한다(F-14) — 합계에 따로 산식을 두면 표시값과 갈린다.

## 같은 의미 폼 필드의 양방향 read/write 통합 (2026-05-03 이후)

겸용주택 Case A 4부분 안분에서 "취득시 상가건물 기준시가"·"양도시 상가건물 기준시가"가 메인 섹션과 PHD 섹션 두 곳에서 입력되는 문제를 해결한 패턴.

**원칙**: 별도 폼 필드 신설 금지. **단일 폼 필드를 두 위치에서 양방향 read/write**.

- 같은 폼 필드 (예: `mixedAcqCommercialBuildingPrice`, `mixedTransferCommercialBuildingPrice`)를 두 컴포넌트에서 직접 read/write
- `useEffect → store` 미러링 정책 위반 없음 (직접 동일 필드 수정 — 자동 동기화)
- API/Validation은 fallback 패턴으로 양쪽 인식 (`phdField || mixedField`) — CLAUDE.md ⑧ 정책 준수
- 사용자가 어디서 입력하든 자동 동기화, 데이터 중복 방지

**적용 예**: `MixedUsePreHousingDisclosureSection.tsx` 의 `commercialBuildingStdPriceAtAcq/AtTransfer` props가 메인 섹션의 동일 필드를 직접 수정.

## 양도세 자산 종류 특수 분기 진입점

`components/calc/transfer/CompanionAcqPurchaseBlock.tsx` — 상단 일반 "취득가액 산정 방식·취득가액" 영역을 `assetKind`(redevelopment_apt·general_building·commercial_building 등)/`transferType`(burdened_gift)별로 조건부 숨김. 특수 분기 추가 시 violet/fuchsia 안내 카드 패턴 차용(안내 카드 3종은 `CompanionAcqSpecialAssetNotices.tsx`, 취득시·양도시 기준시가 블록은 `CompanionAcqStdPriceSection.tsx`로 분리 — 2026-10-02, 부모 798→521줄). 자산-수준 입력은 해당 자산 전용 Block(`RedevelopmentBlock`/`GeneralBuildingBlock`/`CommercialBuildingBlock`)에 격리.

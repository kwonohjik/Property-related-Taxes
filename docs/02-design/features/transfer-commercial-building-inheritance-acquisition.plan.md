# 상업용건물(commercial_building) 상속 취득가액 엔진정합 수정 계획서

> 방향: **엔진정합(§163⑨)**. 겸용주택 PR#710·일반건물 PR#713과 **동일 클래스** 버그.
> 상속인데 취득가액을 상속개시일 평가액이 아니라 **환산(§176조의2②2호) + 개산공제(§163⑥)**로 산정.
> 작성 2026-07-20. 감사 출처: [[project_transfer_special_engine_inheritance_acquisition_bugs]].

## §0 요약 · 버그 실측 확정 (probe)

**버그**: 상가건물을 **상속**으로 취득 후 양도할 때, "환산취득가 사용"(useEstimatedAcquisition) 토글이 ON이면
STEP 0.35(`applyCommercialBuildingStep`)가 STEP 0.45(상속 취득가액 의제)의 결과를 **덮어써** 환산+개산공제를 강제 적용.

**probe 실측** (엔진 직접 호출, throwaway, 삭제 완료):
- 입력: 상가 양도가 540M, 상속(post-deemed, reportedValue=상속개시일 평가액 300,000,000), 환산 ON(case-29 fixture).
- 관측: `inheritedAcquisitionDetail.acquisitionPrice = 300,000,000` (STEP 0.45 **실제 발동됨**) ↔
  `commercialBuildingValuationDetail.estimatedAcquisitionTotal = 135,155,041`·개산공제 `3,588,219` (STEP 0.35가 **덮어씀**).
- **transferGain = 401,256,740** (= 540M − 환산 135,155,041 − 개산 3,588,219). **정합값 240,000,000** (= 540M − 상속평가액 300M − 0) 대비 **과대과세**.
- 추가 결함: 결과가 `inheritedAcquisitionDetail=300M`을 표시하면서 실제 계산은 환산으로 수행 → **표시-계산 드리프트**.

> ⚠️ 감사 메모리 정정: 관측 13402 "상가 상속 시 STEP 0.45 미발동"은 **부정확**. STEP 0.45는 발동하나(inheritedAcquisitionDetail=300M) STEP 0.35가 이후에 덮어쓴다.

**도달성 = LIVE(단건 계산기)**: `AssetSectionAcquisition.tsx:262`가 `assetKind==="commercial_building"`만 게이트 → 상속 선택 후에도 환산 토글 노출·ON 가능. GB의 V2 상당 차단 **없음**(`transfer-tax-validate-asset.ts:102`는 `useEstimatedAcquisition`만 검사하고 조기 return). (다건 계산기는 상가 자체 차단 — `multi-transfer-tax-validate.ts:63`.)

## §1 법령 근거 (KoreanLaw 검증 완료)

- **소득세법 시행령 §163⑨** (MST 286211, 시행 20260701, get_law_text 원문): "상속 또는 증여(…§34~§45의5 증여의제 제외)받은 **자산**에 대하여 법 §97①1가목을 적용할 때에는 **상속개시일 현재 상증법 §60~66에 따라 평가한 가액**(§76 세무서장 결정·경정 가액 있으면 그 가액)을 **취득당시의 실지거래가액으로 본다.**" → **자산유형 무제한**(상가건물=상속받은 자산, 포함). 상가건물의 상증법 평가액도 여기에 해당.
- **§163⑨ 단서 1·2호**: 1호=1990.8.30. 개별공시지가 고시 전 상속 토지, 2호=건물 기준시가 고시 전 상속 건물 → max(상증법 평가액, §164). **post-disclosure 상가는 단서 미해당** → 본문(단일 상증법 평가액) 적용. (pre-disclosure 상가 = Phase 2, §4.4.)
- **§163⑥ 개산공제**: "법 §97②2호 각 목 외의 부분 본문"(=**환산취득가액 나목**) 전용. 상속은 §163⑨로 실지거래가액 의제(가목) → **개산공제 미적용**. (겸용·GB와 동일 논거.)
- **§166⑥ 안분**: "가액의 구분이 불분명한 때" 토지·건물 안분. 상가 상속은 상속개시일 상증법 평가액이 **단일 총액**(토지+건물 합산 §60~66)으로 존재 → 안분 대상 아님. 상가는 실가 경로에서도 단일 acquisitionPrice(환산 override가 단일값으로 collapse) → **분리 불요**. (GB와 차이: GB는 토지·건물 취득일 분리 존재.)

## §2 케이스 매트릭스

| # | 상가 취득원인 | 환산 토글 | 상속개시일 | 현행 | 정합(수정 후) |
|---|---|---|---|---|---|
| **A1 ★Phase1** | 상속 | (숨김·무시) | ≥ 건물기준시가 고시 후(post-disclosure) | 🔴환산+개산공제 override | 상속개시일 상증법 평가액 **단일 직접**, 개산 0 |
| A2 | 상속 | (숨김·무시) | pre-disclosure(고시 전) | 🔴환산 | **Phase 2** — max(상증법, §164⑤~⑦). Phase1은 상증법 평가액(보수적, §164 max 생략) |
| B | 매매/증여/신축 | ON | — | ✅환산(정상) | **불변** (기존 상가 환산 경로 전건 유지) |
| C | 매매 등 | OFF(실가) | — | ✅실가(정상) | **불변** |

Phase 1 = **A1**. A2는 Phase 2(pre-disclosure 상가 §163⑨2호), B·C 완전 불변.

## §3 근본 원인 (실측 file:line)

1. **STEP 0.45**(`transfer-tax.ts:126` → `inheritance-acquisition-helpers.ts:33`): `rawInput.inheritedAcquisition` 있으면 상속 취득가액 의제 계산 → `input.acquisitionPrice = 상속개시일 평가액`. 상가도 `inheritanceAssetKind` default "land"(factory:68)로 payload 빌드됨(`transfer-tax-api-inheritance.ts:23` 게이트가 assetKind 무검사) → **발동함**.
2. **STEP 0.35**(`transfer-tax.ts:325` → `transfer-tax-helpers.ts:779` `applyCommercialBuildingStep`): 게이트 = `propertyType==="commercial_building" && useEstimatedAcquisition`(`:783`). **acquisitionCause 무검사**. 발동 시 `acquisitionPrice=환산·expenses=개산공제·useEstimatedAcquisition:false`로 교체(`:788-796`) → STEP 0.45 결과 **파괴**.
3. **API 이중 전송**(`transfer-tax-api.ts`): `cbValuation`(:103·:595 환산) + `buildInheritedAcquisitionPayload`(:646 상속) **동시 송신**. 어느 것도 상호배제 안 함.

## §4 수정 설계 — 4계층 mirror(acquisitionCause) + 엔진 안전망

핵심: **상가 취득원인이 상속이면 환산(STEP 0.35)을 건너뛴다.** STEP 0.45가 산정한 상속개시일 평가액(단일값)이 그대로 취득가액으로 서고, 개산공제=0.

### 4.1 엔진 (authoritative 안전망) — `transfer-tax-helpers.ts`
- `applyCommercialBuildingStep`(:783) 게이트(early-return 후, `runCommercialBuildingStep` 호출 前)에 상속 분기 추가:
  ```ts
  if (input.acquisitionCause === "inheritance") {
    // §163⑨: 상속 취득가액 = STEP 0.45 상속개시일 평가액(직접). 환산·개산공제 미적용.
    return { effectiveInput: { ...input, useEstimatedAcquisition: false }, cbStep: undefined };
  }
  ```
  - ⚠️ **핵심**: 단순 `cbStep: undefined` 반환으로 STEP 0.35만 건너뛰면, `effectiveInput.useEstimatedAcquisition`이 여전히 true → `calcTransferGain`이 generic 환산식(`transferPrice × stdAtAcq/stdAtTransfer`)으로 빠져 STEP 0.45의 상속평가액(acquisitionPrice)을 **무시**. 따라서 **`useEstimatedAcquisition: false`로 명시 해제** 필수 → 실가 경로에서 `input.acquisitionPrice`(=STEP 0.45가 세팅한 상속평가액) 직접 차감, expenses는 사용자 입력(자본적지출·양도비) 그대로, 개산공제 0.
- `runCommercialBuildingStep`(:718) 직접 가드 **불요**: 전수 grep 결과 `applyCommercialBuildingStep`(:786)에서만 호출됨(`expropriation-scope.ts`는 주석 참조뿐). outer 1곳 가드로 충분(Simplicity First — 불가능 시나리오 방어 금지). 필요 시 runCommercialBuildingStep에 "가드는 상위에서" 주석만.
- 근거 주석 §163⑨. (`TransferTaxInput.acquisitionCause` 존재 — `types/transfer.types.ts:212`.)
- `calcTransferGain` 검증 완료: `:318` `if (useEstimatedAcquisition)` → `input.acquisitionPrice` 무시하고 `standardPriceAtAcquisition` 기반 환산. `:351-353` else → `acquisitionCostBase = input.acquisitionPrice` 직접. ∴ 상속평가액을 쓰려면 useEstimatedAcquisition=false 필수(fork 자가검토 정정 실측 확증).
- STEP 0.45(:126)가 STEP 0.35(:325)보다 **먼저** 실행되어 acquisitionPrice=상속평가액을 이미 세팅함(순서 확인 완료).

### 4.2 API (mirror) — `lib/calc/transfer-tax-api.ts`
- `:103` `cbValuation` 빌드 게이트에 **`&& primary.acquisitionCause !== "inheritance"`** 추가 → 상속 시 환산 payload 미빌드(결과 카드 미표시 정합).
- `:257` `useEstimatedAcquisition` 송신 삼항식: 현행 `: isCommercialBuilding ? primary.useEstimatedAcquisition` → **`: isCommercialBuilding ? (primary.acquisitionCause === "inheritance" ? false : primary.useEstimatedAcquisition)`**. 상가+상속이면 false 송신 → STEP 0.35 게이트(`useEstimatedAcquisition`) 무력화(엔진 안전망과 이중). (전체: `hasPre1990||parcelModeActive||isMixed||isSalesCase ? false : isCommercialBuilding ? (…상속 분기…) : isGeneralBuilding ? … : isCarryoverGeneral ? true : isEstimated`.)
- (상속 취득가액은 기존 `buildInheritedAcquisitionPayload`(:646) 경로 그대로 — 변경 없음. inheritanceAssetKind default "land" + publishedValueAtInheritance → post-deemed reportedValue 직접, reportedMethod 강제 "supplementary".)

### 4.3 Validation (⑧) — `lib/calc/transfer-tax-validate-asset.ts`
⚠️ **자가검토 High 정정 (인라인)**: generic 상속 분기(:521)는 상위 `if (!isEstimated && !hasPre1990)`(:504)로 게이트되고 `isEstimated = !isSalesCase && !isAppraisal && asset.useEstimatedAcquisition === true`(:392)이므로, **stale `useEstimatedAcquisition=true`면 상속 검증 자체가 skip**된다(원안 ":521에 상가 필수 추가"는 stale flag 케이스 미도달 → 취득가 0 침묵 통과). 원안 폐기.
- **정정안**: 상가 환산 블록(:102) **직전**에 상가+상속 **전용 검증 블록** 신설(isEstimated 게이트 무관 항상 실행 — GB 전용 dispatch 패턴 mirror):
  ```ts
  // 상가 + 상속(§163⑨): 상속개시일 평가액을 취득당시 실지거래가액으로 의제 — 환산 미적용(환산 토글 무관).
  if (asset.assetKind === "commercial_building" && asset.acquisitionCause === "inheritance") {
    if (!asset.decedentAcquisitionDate) return `${label}: 피상속인 취득일을 입력하세요.`;
    if (!parseAmount(asset.publishedValueAtInheritance) || parseAmount(asset.publishedValueAtInheritance) <= 0)
      return `${label}: 상속개시일 평가액(상속세 신고가액)을 입력하세요.`;
    return null; // 상가 상속 검증 완료 — 환산(:102)·generic(:504) 블록 미도달
  }
  ```
- early return이므로 **:102 조건 수정 불요**(상속은 :102 전에 처리). generic housing/land의 :530 "미필수(엔진 0)" 정책과의 차이 = 상가 상속은 환산 제거 후 **유일 취득원** → 필수(취득가 0 침묵 방지). 주석 명시.
- **모순 부재**: API `buildInheritedAcquisitionPayload`(:60)가 publishedValueAtInheritance<=0이면 {} 반환 → validate 필수와 정합(UI 통과 ↔ validate 차단 모순 없음).

### 4.4 UI (⑤) — `components/calc/transfer/asset-sections/AssetSectionAcquisition.tsx`
- `:262` `CommercialBuildingBlock` 렌더 조건에 **`&& asset.acquisitionCause !== "inheritance"`** 추가 → 상속 선택 시 환산 토글 미노출(useEstimatedAcquisition 신규 ON 불가). 상속 취득가액 입력은 기존 `CompanionAcqInheritanceBlock`(취득원인 상속 시 자동 렌더, `CompanionAcquisitionCauseSection:215`)의 "상속세 신고가액"(`PostDeemedInputs:177`)이 담당 — **신규 위젯 불요**.
- 안내(선택): 상가+상속 시 "상속 취득은 상속개시일 상증법 평가액을 취득가액으로 봅니다(§163⑨)" ToneCard. (GB violet 패턴 차용, 과잉이면 생략.)
- stale flag 처리: 환산 ON→상속 전환 시 store `useEstimatedAcquisition` true 잔존 가능하나 **§4.2(cbValuation 미빌드·false 송신) + §4.3(전용 블록이 isEstimated 무관하게 상속 평가액 필수화) + §4.1(엔진 가드)로 전면 무력화**. 환산 검증 미요구·상속 평가액 필수·엔진 도달 불가. (useEffect→store 미러링 금지 정책 준수 — 자동 reset 미사용.) **사이드바 실측**: `canPreviewEstimated`(transfer-per-asset-summary.ts:149)는 `assetKind ∈ {land, housing}`만 허용 → commercial 제외 → stale flag여도 개산공제 프리뷰 미발동. 유일 잔여 = 필요경비 `expensePending` "계산 후 표시" placeholder(:248, 계산 후 0 해소·무해). 또한 취득가액은 `inheritanceMode==="post-deemed"` 분기(:195)가 먼저 잡혀 이미 상속 평가액 표시 → **본 수정이 엔진을 사이드바에 정렬(기존 사이드바-엔진 드리프트 해소)**.

### 4.5 결과 카드 (⑦) — 신규 분기 불요
- 환산 미빌드 → `commercialBuildingValuationDetail=undefined` → `CommercialBuildingValuationDetailCard` 미렌더(`TransferTaxResultView:550`).
- `inheritedAcquisitionDetail=상속평가액` → `InheritedAcquisitionDetailCard` 자동 렌더(`ReductionDetailCards:76`). **분기 추가 없음.**

## §5 14 동기화 지점 커버리지

신규 엔진 input/result **타입 없음**(acquisitionCause·publishedValueAtInheritance·useEstimatedAcquisition 모두 기존). ⑫⑬⑭ 신규 배선 불요 — 침묵 strip 위험 없음.

| 지점 | 변경 | 위치 |
|---|---|---|
| ①폼상태 | 없음(기존 필드) | — |
| ②initial ③normalize | 없음 | — |
| ④API 변환 | cbValuation 게이트·useEstimatedAcquisition 송신 | `transfer-tax-api.ts:103·257` |
| ⑤UI 위젯 | 환산 토글 상속 시 숨김 | `AssetSectionAcquisition.tsx:262` |
| ⑥사이드바 | 없음(상속 취득가액은 기존 집계) | — |
| ⑦결과 카드 | 없음(자동 전환) | `ReductionDetailCards:76`(기존) |
| ⑧validation | 상가+상속 **전용 블록**(:102 직전, 상속 평가액 필수·early return, isEstimated 무관) | `transfer-tax-validate-asset.ts:~101` |
| ⑨⑩⑪⑫⑬⑭ | **없음**(신규 필드 無) | — |
| 엔진 | STEP 0.35 상속 가드 (`applyCommercialBuildingStep`, useEstimatedAcquisition:false) | **`transfer-tax-commercial-step.ts`** (800줄 정책상 helpers에서 추출·re-export, Do deviation) |

## §6 Anchor 계획

`__tests__/tax-engine/transfer-tax/commercial-building-inheritance-acquisition.anchor.test.ts` 신규:
1. **A1 정합**: case-29 fixture + acquisitionCause=inheritance + inheritedAcquisition(post-deemed, reportedValue=300M) + 환산 ON payload. 기대: `transferGain=240,000,000`, `commercialBuildingValuationDetail=undefined`, `inheritedAcquisitionDetail.acquisitionPrice=300,000,000`, 개산공제 미적용. **엔진 가드가 환산 무시** 검증.
2. **버그 baseline 대조**: 엔진 가드 없을 때(=acquisitionCause≠inheritance) 환산 135,155,041 유지 확인 → 가드가 상속에만 작동, B/C 불변 증명.
3. **B 회귀**: 매매 상가 환산(case-29 원본) `calculatedTax=85,844,292` 불변.
4. **개산공제 0**: 상속 경로 expenses=0(개산공제 미적용) 확인.

## §7 스코프 · Phase 경계

- **Phase 1(본 PR)**: A1 = 상가 + 상속 + (post-disclosure). 4계층 가드 + 상속 평가액 단일 직접 산정.
- **Phase 2(후속)**: A2 pre-disclosure 상가 §163⑨2호 max(상증법, §164⑤~⑦) / InheritanceAssetKind "commercial" 정식 라벨(현행 "land"로 라벨링, 기능 정합·표시 경미) / 부담부증여×상속 상가.
- **불변 보장**: B(매매·증여·신축 환산)·C(실가) 완전 불변. 다건 상가는 애초 차단(불영향).

## §8 리스크 · 회귀

- 회귀 표면: 기존 상가 환산 테스트(`commercial-building-case-29.test.ts` 전건), 부담부증여 상가(`burdened-gift-commercial.test.ts`), 사례35(house_to_commercial). 모두 acquisitionCause≠inheritance → 가드 미발동 → 불변 예상(anchor로 확증).
- pre-disclosure 상가 상속(A2): Phase 1 후 환산 대신 상증법 평가액 사용 → §164 max 생략이나, 현행(환산이 상증법 평가액 무시)보다 **덜 틀림**. Phase 2에서 정식화. 문서화.
- UI stale flag: §4.4대로 전면 무력화. 별도 리스크 없음.

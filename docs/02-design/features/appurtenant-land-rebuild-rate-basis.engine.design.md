# 구주택 멸실·신축 통산 — 주택 부수토지 세율 보유기간 엔진 설계 (해석 (5))

작성: 2026-10-19 · 범위: **엔진 + ⑫⑭(API)**. UI(①~⑧)는 다음 에이전트 — 5절에 지점별 명세.
계획서: `docs/00-pm/appurtenant-land-rebuild-rate-basis.plan.md` (§9 사용자 결정 = 확정, 재론 금지).

## 1. 무엇을 바꾸나 / 바꾸지 않나

같은 토지 위 **본인 소유 구주택을 멸실하고 주택을 신축해 양도**한 경우, 토지 파트의 §104② 세율 보유기간을
「구주택 부수토지 기간 + 신축주택 부수토지 기간」 합산으로 판정한다.

| 근거 | 내용 |
|---|---|
| 서면법규과-1222 (2014.11.19.) | 주택 부수토지의 보유기간은 구주택과 신축주택의 부수토지 **기간을 합하여** 본다 |
| 사전-2023-법규재산-0097 (2023.6.15.) | 통산 **2년 이상**이면 §104①1호 세율. 전제: 신축 취득일 = 영 §162①4호, **정착면적 미증가** |

- **세율 축만** 바뀐다. 건물 파트·장기보유특별공제(토지 전체 보유 — 사전-2025-법규재산-0289)·배율 초과분(비사업용 토지)·비과세는 불변.
- 입력이 없으면 현행 `max(토지 법정 기산일, 주택 취득일)` 그대로다. 나대지·상가 철거 후 신축((7) 계열 — 기재부 재산세제과-1354·사전-2021-법규재산-1232·사전-2023-법규재산-0389·조심 2024인3140)은 구주택이 없으므로 입력 자체가 없다.
- 사전-2025-법규재산-0289(토지 먼저·주택 나중, 2025.6.4.)는 `max` 규칙의 **직접 근거**다 → `transfer-tax-appurtenant-land.ts` 주석 갱신(토지를 나중에 취득한 방향만 간접).

## 2. 엔진

### 2.1 입력 (`TransferTaxInput.landRebuildPriorHouse`)

```ts
interface LandRebuildPriorHouse {
  startMode: "since_land" | "later";   // 구주택이 토지 취득 때부터 있었는가
  priorHouseStartDate?: Date;          // later일 때만(필수). since_land에서는 거부
  demolitionDate: Date;                // 구주택 멸실일 = seg1 끝
  footprintUnchanged: boolean;         // true가 아니면 계산 거부(0097 전제)
}
```

- 이름 결정: 계획서 §4.1의 5필드(`priorHouseRebuilt` 토글 + `priorHouseAcquisitionDate` …)는 **객체 하나**로 접었다. 객체의 존재가 곧 토글 ON이다(미선택 = 통산 없음 = 현행). `StartMode`가 「토지 취득 때부터」 예/아니오(Q-4)이고, `later`의 날짜는 자동으로 채우지 않는다.
- 구주택 시작일(seg1 시작) = `since_land` → 토지 §104② 법정 기산일(`resolveLandRateBasis().date`), `later` → `max(법정 기산일, priorHouseStartDate)` (부수토지 기간은 토지 보유기간을 넘을 수 없다 — 입력일이 앞서면 법정 기산일부터이고 echo `startRule: "land_basis"`).
- ④가 시작일 날짜를 계산하지 않는다(상속·이월과세 법정 기산일 재구현 금지) — 엔진이 `resolveLandRateBasis`(단일 소스)로 정한다.

### 2.2 호스트와 검증 leaf — `lib/tax-engine/transfer-land-rebuild-rate.ts`

엔진 진입(`calcSplitGain`)·⑫(`refineLandRebuild`)·⑧(UI 단계)이 **`collectLandRebuildIssues(facts)` 한 함수**를 공유한다(⑫≡⑧≡엔진). 입력이 없으면 빈 배열(회귀 0).

**호스트 두 곳(2026-10-19 사용자 결정 — 계획서 §9.2)**: ① 건물 `newConstruction` ② 건물 `purchase` + 토지 취득일 분리(= 「매수한 토지 + 그 위에 신축한 주택」의 관례 입력 경로, 서면법규과-1222의 사실관계). 「토지 취득일 분리 존재」는 이미 모든 호스트의 공통 사실(`hasLandAcquisitionDate`)이라 건물 원인 `purchase`는 같은 leaf가 그대로 받는다. 이때 건물 취득일이 곧 신축 건물의 취득일이다(자기가 건설한 건축물 — 영 §162①4호). 매매 호스트는 **토지 상속·증여 overlay가 없어야** 한다(건물을 산 것이지 신축이 아니다) — `LandRebuildFacts.landAcquisitionCause`가 그 사실이며 ⑫·엔진이 `input.landAcquisitionCause`를, ⑧이 유효 overlay(`effectiveLandAcquisitionCause`)를 넣는다. `landRebuildApplies`(통산이 실제로 도는 입력)도 같은 규칙이다. `transfer-tax-appurtenant-land.ts`는 변경하지 않았다(711줄 유지).

| 규칙 | field | 문구 상수 |
|---|---|---|
| 컴패니언·겸용 자리 | `landRebuildPriorHouse` | `LAND_REBUILD_COMPANION_MESSAGE` |
| 주택이 아님 | 〃 | `LAND_REBUILD_HOST_MESSAGE` |
| 건물 취득원인 ∉ {`newConstruction`, `purchase`} (상속·증여·이월과세·부담부증여) | 〃 | `LAND_REBUILD_BUILDING_CAUSE_MESSAGE` |
| 건물 취득원인 `purchase` + 토지 상속·증여 overlay(`landAcquisitionCause` ∉ {없음, `purchase`}) | 〃 | `LAND_REBUILD_PURCHASE_LAND_CAUSE_MESSAGE` |
| 소유자 분리·부담부증여 | 〃 | `LAND_REBUILD_OWNER_BURDENED_MESSAGE` |
| 토지 취득일 없음 | `landAcquisitionDate` | `LAND_REBUILD_LAND_DATE_REQUIRED_MESSAGE` |
| `footprintUnchanged !== true` | `….footprintUnchanged` | `LAND_REBUILD_FOOTPRINT_MESSAGE` |
| `startMode` 없음/오값 | `….startMode` | `LAND_REBUILD_START_MODE_MESSAGE` |
| `later`인데 날짜 없음 / `since_land`인데 날짜 있음 | `….priorHouseStartDate` | `…_START_DATE_REQUIRED_/STRAY_MESSAGE` |
| 멸실일 없음 | `….demolitionDate` | `LAND_REBUILD_DEMOLITION_REQUIRED_MESSAGE` |
| 순서 위반: 시작일 > 멸실일 / 멸실일 < 토지 취득일 / 멸실일 ≥ 신축 취득일 | `….demolitionDate` | `LAND_REBUILD_ORDER_MESSAGE` |

엔진 입력 → 사실: `landRebuildFactsOfInput(input)` (날짜 문자열도 받는다). 다른 propertyType(토지 등)에 입력이 실려도 `calcSplitGain`이 일찍 null을 내므로 엔진은 무시하고 **⑫가 막는다**(파트 이월과세 stray와 같은 분업).

### 2.3 산식 (`aggregateLandRebuildPeriods`, 순수)

```
seg1 = [구주택 부수토지 시작일, 멸실일]     months1 = calculateHoldingPeriod → years*12+months
seg2 = [건물(신축) 취득일, 양도일]          months2 = 〃
M    = months1 + months2                    ← 일수 버림(Q-2), 멸실~신축 취득일 공백 불산입(Q-1)
E    = 양도일 다음날 − M개월 (UTC 달력, 해당일 없으면 말일, E ≤ 양도일)   → 반환
```

- `resolveAppurtenantLandRateBasisDate`가 `E`를 돌려주면 `buildLandRateInput`(acquisitionDate=E, cause=purchase) → `calcTax`의 `holdingMonthsTotal`이 정확히 M → 하류 배관 변경 0 (게이트 7 「세율 동일 시 병합」·§104⑤ 비교과세 무영향).
- 격자 검증: 양도일 6,000일 × M 0~150 = 906,000건 불일치 0(UTC·Asia/Seoul). 단 `calculateHoldingPeriod` 자체가 TZ 의존(America/Los_Angeles에서 date-fns `subMonths` 변형 9,945건 불일치)이라 ±3일 보정 확인 루프를 두고 실패하면 throw(침묵 오차 금지). anchor `RB-C6`이 회귀 가드.
- M=0(두 구간 합 1개월 미만)이면 E=양도일(양도일 이후 기산일 없음).

### 2.4 토지 취득원인과의 결합 (seg1 시작 = 토지 법정 기산일 규칙)

| 토지 취득원인 | 법정 기산일(`resolveLandRateBasis`) | `since_land` seg1 시작 | anchor |
|---|---|---|---|
| 없음/매매 | 토지 취득일 | 토지 취득일 | RB-B1~B4 |
| 상속 | 피상속인 취득일(§104②1호) | 피상속인 취득일 | RB-D1, D2 |
| 이월과세 `carryover_gift` | 증여자 취득일(§104②2호) | 증여자 취득일 | RB-D3 |
| 단순 증여 `gift` | 증여일(통산 없음) | 증여일 | RB-D4 |

- 파트 이월과세 해결자(`calcSplitCarryoverScenarios`)가 시나리오 입력을 `...raw`로 만들므로 `landRebuildPriorHouse`는 그대로 전달되고, 시나리오 A(토지 증여자 값)/B(증여일)의 법정 기산일이 각자 적용된다 — 검증 leaf의 「멸실일 ≥ 토지 취득일」은 시나리오 A에서 증여자 취득일이 더 이르므로 안전.
- 건물이 `newConstruction` 또는 `purchase`(토지 overlay 없음)여야 하므로 건물 상속·증여(D2 계열)와는 겹치지 않는다.

### 2.5 echo·고지·표시

- `SplitPartResult.rateHoldingAggregation`(토지 파트만): `priorHouse{from,to,months}`, `newHouse{…}`, `totalMonths`, `equivalentBasisDate`, `startRule`. 이때 `appliedRateBasisDate`는 **E(환산 기산일)** 이다 → 표시가 실제 취득일로 오독하지 않게 `splitRateBasisNote`가 구간·합산 개월 문구로 대체한다(`transfer-tax-split-display.ts`).
- 고지(`landRebuildRateNotice`, 세액 불변): 두 구간·합산 개월 / 공백 제외·일수 버림은 해석례가 직접 정한 바 아님 / 합산 24개월 미만이면 「0097은 2년 이상만 직접 판단」 확장 적용 / 비과세 보유·거주(영 §154⑧)·장특 통산 미반영 — 확인 필요.
- 비과세·고가주택 판정·장특·건물 파트는 입력 유무와 같다(anchor RB-B4, F1, F2).

## 3. API (⑫⑬⑭)

| 지점 | 구현 |
|---|---|
| ⑫ Zod | `lib/api/transfer-tax-schema-land-rebuild.ts` — `landRebuildShape`(leaf)를 `propertyBaseShape`(단건·다건)와 `splitAcquisitionShape`(컴패니언이 spread)에 둔다. 컴패니언은 키를 **받아서 명시 거부**(strip 금지) |
| ⑫ 값 검사 | `refineLandRebuild` — 주 자산은 `refineRequiredInputs2a`에서, 컴패니언은 `transfer-tax-schema.ts` 루프에서 `host.supported:false`로. 엔진 진입과 같은 leaf라 path가 `landRebuildPriorHouse.<필드>` |
| ⑬ body spread | ④ 단계 — UI 다음 에이전트(`callTransferTaxAPI`의 payload가 `landRebuildPriorHouse`를 싣는 순간 자동 spread) |
| ⑭ 단건 | `engine-input.ts` — `toEngineLandRebuild(data.landRebuildPriorHouse)` (Date 변환은 `date-coerce`) |
| ⑭ 다건 | `multi/route.ts`가 같은 변환기로 옮긴다(**지원** — 합산 엔진은 자산마다 단건 엔진을 그대로 호출하므로 세율 시드가 같다). `transfer.route.multi-key-coverage-f12`의 「매핑」 분류 |
| ⑭ 컴패니언 | 매핑하지 않는다. `bundled-split-helpers.ts`의 컴파일 타임 키 커버리지 가드 `CompanionContextOnlyKeys`에 근거와 함께 추가 |

다건 결정: 지원. 컴패니언·겸용 결정: 거부(Q-3). 거부는 ⑫ 400이며 ⑧도 같은 문구로 막아야 한다(5절).

## 4. 케이스 매트릭스 ↔ anchor

| 계획서 | 사실 | anchor |
|---|---|---|
| (회귀) | 입력 없음 = 362,250,000 / 토지 70% | RB-A1, A3 |
| C4 (7) | 나대지 취득 → 신축 (입력 없음) 현행 불변 | RB-A2 |
| C1 | 합산 ≥24 → 토지 기본세율 (S1 195,309,999) | RB-B1 |
| C2 | 합산 12~24 → 60% (S2 315,249,999) | RB-B2 |
| C3 | 합산 <12 → 70% (S3 362,250,000) | RB-B3 |
| Q-1 | 공백 제외 (6+9=15 → 60%, 포함 시 ≥24) | RB-C1 |
| Q-2 | 일수 버림 (11+12=23, 일수 합 49일) · M 경계 12/24 | RB-C2~C4 |
| C12 | 윤년 2/28~2/29 | RB-C5 |
| 등가 기산일 | 4,000일×12개 M 격자 | RB-C6 |
| C6 | 구주택이 토지 취득 뒤 (`later`) | RB-B2, D2 |
| C9 | 상속 | RB-D1, D2 |
| C10 | 이월과세 · 단순 증여 | RB-D3, D4 |
| C8 | 정착면적 증가 → 거부 | RB-E1 |
| C13 | 비과세 판정 불변 | RB-F1, F2 |
| C15 | 컴패니언·겸용 → 거부 | RB-E5, RR-6 |
| 비주택 | 거부(무시 아님) | RB-E5, RR-5 |
| ⑫⑭ | 와이어 도달·다건·거부 | RR-1~RR-9 |
| 표시 | 환산 기산일 오독 방지 | RB-G1 |

미커버(의도): C5(근생 건물 멸실 → 주택 신축)는 입력을 만들지 않는 것이 현행 불변이다(UI 문구로 안내). C7(타인 소유 기간)은 입력 자체가 본인 소유로 한정되므로 엔진 판정 대상이 아니다.

## 5. UI 다음 단계 — 지점별 명세

> ✅ UI 구현 완료 — 실측으로 보정한 최종 명세는 `appurtenant-land-rebuild-rate-basis.ui.design.md` §1(R-1 호스트 술어에 「토지는 다른 원인으로 취득」 유효 추가 · R-3 파트 요약 echo 누락 정정 · R-4). 아래 표는 엔진 단계의 초안이다.

공통 술어(단일 소스, **신규 `lib/calc/transfer-land-rebuild.ts`**):

```ts
landRebuildApplicable(asset: AssetForm, opts?: { isNonPrimary?: boolean }): boolean
  // ✅ 최종형은 UI 설계 §2 `landRebuildHost`(newConstruction | purchase | null) — 매매 호스트(R-5)가 추가됐다.
  // assetKind === "housing" && !isMixedUseHouse && acquisitionCause === "newConstruction"
  //   && hasSeperateLandAcquisitionDate && effectiveSelfOwns === "both"
  //   && transferType !== "burdened_gift" && !opts?.isNonPrimary
effectiveLandRebuild(asset, opts): WireLandRebuild | undefined
  // 위 술어가 거짓이면 undefined(stale 제거) — ④ 전송·⑧·⑤ 렌더가 모두 이 함수를 읽는다
landRebuildFactsOfAsset(asset, opts): LandRebuildFacts
  // ④가 실제로 보낼 값(effective)으로 조립 — 엔진 leaf `collectLandRebuildIssues`에 그대로 넣는다
```

| # | 지점 | 파일 | 내용 |
|---|---|---|---|
| ① | 폼 상태 | `lib/stores/calc-wizard-asset-split-acq.ts` (`SplitAcquisitionFormSlice`) | `landRebuildEnabled: boolean` · `landRebuildStartMode: "" \| "since_land" \| "later"` · `landRebuildPriorHouseStartDate: string` · `landRebuildDemolitionDate: string` · `landRebuildFootprintUnchanged: boolean` |
| ② | initial | `calc-wizard-asset-factory.ts` | `false` · `""` · `""` · `""` · `false` (미선택 = 통산 없음; **모름 = 혜택 불성립 + 확인 필요**) |
| ③ | normalize/migrate | `calc-wizard-asset-migrate*.ts` | 구 세션 복원 시 5필드 기본값 보강. 호스트가 닫힌 자산(신축이 아니게 바뀜·분리 토글 OFF)의 잔재는 `effectiveLandRebuild`가 `undefined`로 읽는다 — 저장값을 지우는 `useEffect` 미러링 금지 |
| ④ | API 변환 | `lib/calc/transfer-tax-api-split.ts` `buildSplitPayload` | `effectiveLandRebuild(asset)`가 있을 때만 `landRebuildPriorHouse: { startMode, priorHouseStartDate(later일 때만), demolitionDate, footprintUnchanged }` 전송. 컴패니언(`isNonPrimary`)은 절대 전송하지 않는다. 다건 ④(`callMultiTransferTaxAPI`)도 같은 함수 |
| ⑤ | 위젯 | 신규 `RebuiltHouseLandBlock.tsx`, `CompanionAcquisitionCauseSection.tsx:183` `LandPartCauseBlock` 옆(주 자산·신축 호스트에서만 렌더) | `ToggleCard`(「같은 토지 위 구주택을 멸실하고 신축했다」) → `RadioCardGroup`(구주택이 토지 취득 때부터 있었는가 예/아니오) → 아니오면 `DateInput`(구주택 취득일) → `DateInput`(멸실일) → 정착면적 미증가 확인. 안내 `ToneCard`: **본인 소유 구주택 기간만 통산**(서면법규과-944), 나대지 기간은 제외, 정착면적이 늘었으면 이 계산기로 계산하지 않음, 비과세·장특 통산은 별도 판정. 라벨·톤은 `components/calc/CLAUDE.md` 규약 |
| ⑥ | 사이드바 | — | 합계 항목 없음(세율 축) |
| ⑦ | 결과 카드 | `SplitGainDetailSection.tsx`, `split-acq-text.ts`, `FilingFormTableHelpers.ts`, `ResultPdfTransferSections.tsx` | `rateHoldingAggregation`이 있으면 「세율 기산일」 칸을 **구간 2개·합산 개월·환산 기산일**로 표기(`splitRateBasisNote`가 이미 문구를 낸다 — 날짜 칸이 `appliedRateBasisDate`=E를 실제 취득일처럼 보이지 않게 확인). 고지(warnings)가 결과 화면에 노출되는지 확인 |
| ⑧ | validation | `lib/calc/transfer-tax-validate-split.ts` (신축 분기는 `validateLandPartCause`처럼 `transfer-tax-validate-acquisition.ts`에서도 직접 호출) | `collectLandRebuildIssues(landRebuildFactsOfAsset(asset, opts))`의 **첫 위반**을 칸에 붙인다 — 필드 매핑: `….footprintUnchanged`→확인 체크, `….startMode`→라디오, `….priorHouseStartDate`→구주택 취득일, `….demolitionDate`→멸실일, `landAcquisitionDate`→토지 취득일. ⑫와 **같은 leaf**라 문구가 같다. 토글 ON인데 `effectiveLandRebuild`가 `undefined`(호스트 불성립)인 경우는 토글이 닫히므로 도달하지 않는다. 컴패니언은 위젯이 없으므로 도달 불가 — 방어로 `isNonPrimary`면 `hostSupported:false` |
| ⑨⑩ | Zod enum | — | `startMode` enum은 ⑫ 객체 안(메인·컴패니언 공용 shape). 컴패니언은 거부이므로 `addPropertyRefines` 변경 없음 |
| ⑪ | 자산-수준 acquisitionDate fallback | — | 해당 없음 — 신축 취득일은 기존 `acquisitionDate`(사용승인일, 영 §162①4호)이며 별도 fallback이 없다 |
| ⑫⑬⑭ | Zod·body·Route | ✅ 이번 단계 완료 | |

정책 점검: ① `useEffect` 미러링 없음(블록은 `landRebuildApplicable` 술어 파생 렌더) ② 자동 안분 없음(정착면적 증가는 차단, 구주택 시작일 자동 채움 없음) ③ ⑧이 ④와 같은 `effectiveLandRebuild`로 leaf를 호출 — UI 통과 ↔ 400 모순 방지.

주의: `landRebuildEnabled`가 ON인데 `landRebuildStartMode`가 `""`이면 ④는 전송하지 않고 ⑧이 막는다(「선택하세요」) — 엔진·⑫도 `startMode` 부재를 거부하므로 같은 결론이다.

## 6. 남은 확인 필요

1. 0097은 통산 **2년 이상**만 직접 답했다 — 1~2년·1년 미만 확장 적용(Q-8, 확정)은 결과 고지로만 남는다.
2. 나대지 기간 제외(Q-1)·일수 버림(Q-2)을 해석례가 직접 정한 바는 없다(1222 질의서의 구분·(7)·조심 2012중0184 간접).
3. 동일 세대원이 소유하던 구주택(서면법규과-944 인접)은 해석 미확보 — 입력을 본인 소유로 한정.
4. 비과세 보유·거주기간(영 §154⑧1호, 부동산거래관리과-211)·장특 표2(조심 2012중0184·2013중0919) 통산은 별건(Q-6).
5. 컴패니언 토지 카드(`resolveCompanionLandRate`)가 토지 취득일을 보지 않아 split 경로의 `max`와 갈릴 수 있는 기존 불일치(계획서 §2.2-3)는 미실측 — 별건.
6. `calculateHoldingPeriod`의 TZ 의존(America/Los_Angeles에서 906,000건 중 397건 보정 필요 사례)은 기존 속성이다. 운영·CI는 UTC·KST라 영향이 없다.

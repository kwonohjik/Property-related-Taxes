# 일반건물 취득가액 — 감정가액·매매사례가액 개방 (Phase A) UI 설계

> 🔀 **두 설계서의 충돌 해소는 계획서 `docs/00-pm/transfer-split-acq-per-part-method.plan.md` §4 「A-통합」이 정본이다(2026-10-06).** 이 문서의 해당 항목과 다르면 그쪽을 따른다.

- 브랜치: `feat/transfer-land-bldg-split-acq`
- 계획서: `docs/00-pm/transfer-split-acq-per-part-method.plan.md` (§2.2 일반건물, §4 Phase A)
- 엔진 설계(짝 문서): `docs/02-design/features/gb-part-appraisal-salescase.engine.design.md`
- 상태: UI Design (Phase A2) — 2026-10-06 · 작성 UI 시니어 · 소스 미수정
- 선행 조건: **A1(엔진 — 실가 경로가 파트 모드·개산공제를 소비) 머지 후** UI를 연다(memory `feedback_ui_gate_expansion_activates_latent_defect`). 아래 ⑦의 「카드 acqMode echo」도 A1에 포함시킬 것.

## ⚠️ 계약 변경 제안

**필드 계약(§1)은 변경하지 않는다.** 엔진 설계(`gb-part-appraisal-salescase.engine.design.md`)도 「계약 변경 제안: 없음」으로 일치한다. 계약 밖에서 엔진 시니어에게 **확인·요청**할 것(상세 §12):

| # | 요청 | 이유(요지) | 엔진 설계 반영 상태 |
|---|---|---|---|
| **E-1** | 일반건물 카드 결과(`AssetCardForAggregate`, `general-building.types.ts:468` 근처)에 **`acquisitionMode: "actual"\|"estimated"\|"appraisal"\|"salesCase"` echo** | 결과·상세명세서가 boolean `usedEstimatedAcquisition`만 본다 — 감정·매매사례 파트가 `false`=실거래가로 읽혀 **「실지거래가액 파트라 §163⑥ 개산공제를 적용하지 않습니다」가 개산공제가 적용된 파트에 붙는다**(`DetailedStatementGbFormulas.ts:463-470`, §9) | 엔진 §7 엔진 표가 같은 이름으로 계획(§114의2 판정용). **UI도 이 필드를 소비하므로 A1에 포함 확정 필요** |
| **E-2** | ⑫ `generalBuildingValuationSchema`에 `landSalesCaseValue`·`buildingSalesCaseValue`(+타입·⑭) | 없으면 침묵 strip(F-1) | 엔진 §7 ⑫ 행에 이미 있음 — 일치 |
| **E-3** | 분리 ON에서 ④가 **최상위 `acquisitionMethod`·`appraisalValue`**를 레거시 플래그로 싣는 문제(`transfer-tax-api.ts:392-399` → ⑩ refine 400 = G-3 실체) | UI는 §3.9의 ON 전환 patch·복원 정규화로 stale 도달을 막지만 **방어선은 ④에도 필요**(3중) | 엔진 §7 ⑩ 행은 「변경 없음」 — **재검토 요청** |
| **E-4** | `transfer-tax-building-penalty.ts`에 leaf `buildingPenaltyMethodApplies(method, transferDate)`(환산 ≥2018-01-01 · 감정 ≥2020-01-01) export | UI 가산세 배지(`GeneralBuildingAcquisitionCards.tsx:126-150`)가 날짜 게이트를 하드코딩 복제 중 — 감정 개방으로 두 게이트가 갈리는 순간 dual-truth(§3.11) | 엔진 설계에 없음 — **신규 요청** |

## §0 요약
**목표**: 일반건물(`assetKind="general_building"`)의 취득가액 산정방식을 **자산 단위(분리 OFF)·파트 단위(분리 ON) 모두 4종**(실거래가·환산취득가·감정가액·매매사례가액)으로 연다. 근거: 「소득세법 시행령」 §176의2③(매매사례가액→감정가액→환산취득가액 순차) — 종전 「§176의2②는 환산취득가만 규정」 주석은 오독.

**핵심 설계 결정 (13)**

1. **차용 원본 = 주택 split**(`LandBuildingSplitSection.tsx`). 파트 라디오 옵션 4종·라벨·금액칸 hint 문구 체계를 **그대로** 쓴다(§3.2). 일반건물 고유로 다른 것은 ① 별개 취득 외에 분리 ON·동일일자도 파트 라디오가 열리는 점, ② 개산공제 base 입력이 파트 카드가 아니라 `GeneralBuildingBlock`(① 토지 공시지가·② 건물 기준시가)에 있는 점뿐이다.
2. **필드 계약 변경 0** — `landAcqMode`/`buildingAcqMode`·`landAcquisitionPrice`(감정가액 겸용)·`land/buildingSalesCaseValue`·`isAppraisalAcquisition`/`isSalesCaseAcquisition`+`fixedAcquisitionPrice`/`similarSalesValue` 전부 기존 필드(§1). **신규 폼 필드 0건** → ①②③ 변경 없음(§7).
3. **자산 단위 라디오**(`CompanionAcqPurchaseBlock.tsx:133-156`) 일반건물 분기를 삭제해 **비-GB와 같은 4종**으로 통일. 단 매매사례 옵션은 `onIsSalesCaseAcquisitionChange` 콜백이 있어야 뜨므로 **GB 호출부(`GeneralBuildingAcquisitionCards.tsx:363` 부근)에 `isSalesCaseAcquisition`·`onIsSalesCaseAcquisitionChange`를 새로 배선**한다(현재 미배선 — 이게 빠지면 옵션이 안 뜨고, stale `isSalesCaseAcquisition`을 GB에서 끌 수단도 없다).
4. **자산 단위 금액칸은 일반건물에서 비-GB와 다르게 렌더**: 감정가액 = `fixedAcquisitionPrice`(일괄 감정가액, 취득시 기준시가 비율 안분), 매매사례 = `similarSalesValue`. 단 **`SalesCaseSection`의 RTMS 아파트 자동조회와 단일 `standardPriceAtAcq` 칸은 일반건물에서 숨긴다**(§3.4) — 일반건물의 개산공제 base는 토지·건물 **두 칸**(`gbAcqLandPricePerSqm`·`gbAcqBuildingValue`)이라 단일 칸이 있으면 두 칸이 같은 것을 다투는 dual-truth가 된다.
5. **개산공제 base 입력칸 노출 게이트 확장**: `GeneralBuildingBlock.tsx:242-247` `showAcqStdPrice`가 「환산 파트 또는 §100② 안분 필요」일 때만 열려, 감정·매매사례 파트에서는 **개산공제 base를 입력할 칸이 없어 ⑧ 신규 규칙이 막다른 오류**가 된다(`feedback_ui_gate_removes_sole_input_path`). 단일 leaf `partNeedsOwnAcqStd(mode)`(= `mode !== "actual"`, `requiresAcqStdPricePart` 1절을 뽑은 것)를 ⑤·④·⑧이 공유한다(§3.5 — 엔진이 요청한 `requiresAcqStdPricePart` **전체** 공유와는 일반건물 OFF 실가 케이스 때문에 조정, §12 C-1).
6. **상속·증여 파트는 선택지를 실거래가 1종으로 필터**(현행 「환산취득가」가 보이고 고르면 ⑧ 차단 = G-5)하고, **원인 전환 시 같은 patch에서 파트 모드를 명시값 `"actual"`로 설정**(§3.6). `""`로 비우지 않는다 — 비우면 `effectivePartAcqMode`가 stale 레거시 플래그로 되돌아간다.
7. **부담부증여는 현행 유지**(파트 라디오·자산 단위 라디오 모두 숨김, `GeneralBuildingAcquisitionCardsParts.tsx:110`·`CompanionAcqPurchaseBlock.tsx:310`) — §159가 취득가액을 정한다.
8. **이월과세(`carryover_gift`) 파트는 엔진 결정대로 모드 라디오를 숨기고 감정·매매사례를 ⑧에서 차단**(§3.6 — 이월과세 카드가 취득가액을 시나리오 A/B로 교체). 단 **유효 모드가 actual이 아니면 단일 옵션 라디오를 보여** 막다른 길을 막는다 → **현행 「환산취득가」 선택 경로가 사라지는 동작 변경**이므로 사용자 확인 필요(§12 Q-A·C-2).
9. **Q-5(G-3) 결정 = 「승계」** — 자산 종류 전환 patch(`AssetSectionBasic.tsx:156-165`)에서 플래그를 비우지 않는다. Phase A 후 일반건물도 감정·매매사례가 유효값이라 잔존이 아니라 승계다. **막다른 길의 진짜 원인(분리 ON에서 레거시 플래그를 끌 수단이 없고 ④가 레거시 플래그로 최상위 `acquisitionMethod`를 정함)은 ① 분리 ON 전환 patch `gbSeparateOnPatch`(레거시→명시 파트 모드 승격+두 플래그 소거) ② 복원 정규화 ③ 엔진 E-3 로 닫는다(§3.9·§6).** 분리 OFF 전환 시에는 엔진 요청 1대로 파트 모드·금액을 한 덩어리 patch로 비운다.
10. **⑧ validate는 주택 경로(`validateSeparateAcqParts`)가 검증하는 만큼만** — 파트 금액 필수(감정=price, 매매사례=salesCase 값)·개산공제 base(파트 기준시가). 감정평가기준일 등 **새 규칙은 만들지 않는다**(주택 경로에 취득 감정평가기준일 입력·검증이 **없음**을 확인 — §4 머리말).
11. **사이드바(⑥)**: `separateAcqPartsSum`은 이미 감정(price)·매매사례(salesCase값)를 처리 → 변경 불필요. 단 **일반건물 파트 모드가 비실가이면 계산 전 필요경비를 「계산 후 표시」(pending)로** 보이게 `transfer-per-asset-summary.ts` 행 계산에 갈래 1건 추가(§8.2 — `dedicatedPreview` 뒤).
12. **결과(⑦)**: 파트 라벨에 감정·매매사례 표기 + 거짓 문구 차단은 **E-1(`acquisitionMode` echo)** 선행 필요. Phase C(상세명세서 산식 소제목 오기)와 구분 — 본 건은 Phase A 도달 경로의 거짓 표시라 A에 포함(§9).

13. **안내·표시**: 감정·매매사례 파트는 개산공제만 인정(자본적지출·양도비 불산입) — ToneCard(`GbDeductionOnlyNotice`, §3.7). §114의2 가산세 배지는 **감정도 대상(≥2020-01-01), 매매사례는 비대상**(§3.11).

**깨질 기존 E2E**: 라디오 `value`·`name`(`acqBasisMode`·`gbUnifiedAcquisitionCause-`)·`FieldCard` 앵커 유지로 **구조적 파손은 없음**. 점검 대상 6건 + 갱신 필요 vitest anchor 1건(§10.2) — **전부 코드 추적 예측, 미실행**.

## §1 필드 계약
**결론: 주택 split 규약을 그대로 쓴다. 폼 필드·엔진 입력 필드 신설 없음.** 단, 매매사례가액 파트 값이 GB ⑫에 없는 것(E-2)과 지분 스케일 목록(§5)은 계약 이행 누락이므로 별도 표기.

### 1.1 확인한 현행 사실 (file:line — 전부 직접 열람)

| 사실 | 근거 |
|---|---|
| 파트 모드 필드는 주택·GB **공용**, 4종 | `lib/stores/calc-wizard-asset.ts:591-593` `landAcqMode`/`buildingAcqMode` `"" \| actual \| estimated \| appraisal \| salesCase` |
| 매매사례 파트 값 필드도 공용 | 같은 파일 `:638·640` `landSalesCaseValue`·`buildingSalesCaseValue`, factory `calc-wizard-asset-factory.ts:199-208` 초기값 `""`, normalize `calc-wizard-asset-migrate-rental-split.ts:360-363` |
| 모드 미선택(`""`)은 **레거시 3플래그**에서 파생 | `transfer-tax-split-acq-mode.ts:59-64`(`deriveLegacyPartAcqMode` 우선순위 매매사례>감정>환산>실가)·`:118-123`(`effectivePartAcqMode = explicit \|\| derive`) |
| 주택 ④: 감정 파트 = `landAcquisitionPrice`(actual과 같은 필드), 매매사례 파트 = `landSalesCaseValue`(해당 모드일 때만 전송 = stale 가드) | `transfer-tax-api-split.ts:95-98·188·201-204` |
| 주택 ④ 직접입력 게이트 = `actual \|\| appraisal` | 같은 파일 `:95-98`(`landAcqDirectActive`) |
| GB ④는 파트 모드를 `landAcqMode/buildingAcqMode`로 싣되 **파트 가격은 `landAcquisitionPrice`만**(매매사례 값 미전송) | `transfer-tax-api-gb.ts:387-408`(`landPartPrice`·`partModePayload`) |
| GB ⑫ 스키마엔 모드 enum 4종만 있고 **매매사례 값 필드가 없다** | `lib/api/transfer-tax-building-schemas.ts:187-188`; 값 필드는 주택 `transfer-tax-schema-base-shape.ts:283-285`·`schema-split.ts:49`에만 |
| 자산 단위: 감정 = `isAppraisalAcquisition` + `fixedAcquisitionPrice`, 매매사례 = `isSalesCaseAcquisition` + `similarSalesValue` | 주택 ④ `transfer-tax-api.ts:392-401`; 사이드바 `transfer-per-asset-summary.ts:115-117`(`isLumpSumMode`)·`transfer-tax-api.ts:392-399` |
| 우선순위: `isSalesCase` > `isAppraisal` > `isEstimated` | `transfer-tax-api-primary-context.ts:59-63` |

### 1.2 일반건물에 적용하는 계약

| 축 | 필드 | 비고 |
|---|---|---|
| 파트 모드(분리 ON) | `landAcqMode`·`buildingAcqMode` | **라디오가 항상 명시값을 쓴다**(`""`로 두지 않는다 — 아래 규칙 R-1) |
| 감정 파트 금액 | `landAcquisitionPrice`·`buildingAcquisitionPrice` | actual과 같은 필드(주택과 동일). 라벨만 「감정가액」 |
| 매매사례 파트 금액 | `landSalesCaseValue`·`buildingSalesCaseValue` | 주택과 동일 필드. **GB ④가 새로 전송**, GB ⑫에 **신설 요청(E-2)** |
| 자산 단위(분리 OFF) | `isAppraisalAcquisition`+`fixedAcquisitionPrice`(감정), `isSalesCaseAcquisition`+`similarSalesValue`(매매사례) | 기존 필드. 두 플래그는 상호배타(라디오가 보장) |
| 개산공제 base(감정·매매사례·환산 공통) | 토지 `gbAcqLandPricePerSqm`×`gbLandArea`, 건물 `gbAcqBuildingValue` | **GB 전용 기존 필드** — `standardPriceAtAcq`(단일)는 일반건물에서 쓰지 않는다 |

**규칙**
- **R-1 파트 모드는 항상 명시값.** 파트 라디오 `onChange`는 이미 명시값을 쓴다(`PartAcqModeField` `onChange`). 신규로 **원인 전환 patch가 `"actual"`을 명시**해야 한다(§3.6). `""`는 「미선택」이며 레거시 플래그로 후퇴하므로, 레거시 플래그가 stale일 때 **화면(무선택)↔전송값(감정)이 어긋난다** — G-3의 근본 원인.
- **R-2 stale 값 전송 가드.** `landSalesCaseValue`는 `landMode==="salesCase"`일 때만, `landAcquisitionPrice`는 `landMode ∈ {actual, appraisal}`일 때만 전송(주택 ④ `transfer-tax-api-split.ts:95-98·188·201-204`와 같은 조건). 환산·타 모드로 되돌린 뒤 남은 값이 엔진에 닿지 않게 한다.
- **R-3 지분 스케일.** 신규 전송 필드는 100% 기준 입력이므로 `applyShareScale`(`transfer-tax-api-gb-shares.ts:123-137`) 목록에 포함(§5).

> **계약 변경 제안: 없음.** (E-1~E-3은 계약이 아니라 이행 요청 — 문서 상단 표.)

## §2 화면 구조 (ASCII 목업)
### 2.1 분리 OFF — 자산 단위 (「토지·건물 취득일 다름」 OFF, 취득원인 매매)

> 위치: `GeneralBuildingAcquisitionCards` 「🧾 취득 (토지·건물 공통)」 카드 → `CompanionAcqPurchaseBlock`. 일괄 감정가액·일괄 매매사례가액은 **취득시 기준시가 비율로 토지·건물에 안분**(주택 non-separate와 같은 규약 — `transfer-tax-split-acq-price.ts:175-196` `calcPartAcquisitionPrice`가 `isSeparate=false`면 `appraisalValue ?? acquisitionPrice`를 `splitPair`로 안분). 안분 실제 분기는 엔진 설계 §3 결정에 따른다.

```
┌ 🧾 취득 (토지·건물 공통) ─────────────────────────────────────────────┐
│ 취득원인  (●매매)(○상속)(○증여)(○이월과세)(○건물 신축)                      │
│                                                                        │
│ 취득가액 산정 방식                          ← RadioCardGroup columns=4, tone=amber │
│ ┌────────┐┌────────┐┌────────┐┌──────────┐                           │
│ │●실거래가││○환산취득가││○감정가액 ││○매매사례가액│   ← 신규 2종(현재 2종)    │
│ │계약서상 ││양도가×기준││개산공제  ││§176의2③1호│                           │
│ │실거래가 ││시가 비율 ││자동 적용 ││추계       │                           │
│ └────────┘└────────┘└────────┘└──────────┘                           │
│                                                                        │
│ [감정가액 선택 시]                                                       │
│  감정가액 (원) *      [____________]   hint: 공인감정기관의 감정가액(토지·건물 일괄). │
│                                              토지·건물로는 취득시 기준시가 비율로 안분합니다 (소령 §166⑥). │
│  → (취득시 기준시가 단일 칸 「개산공제 기준액」은 일반건물에서 숨김)             │
│                                                                        │
│ [매매사례가액 선택 시]                                                    │
│  매매사례가액 (원) *  [____________]   hint: 취득일 전후 3개월 내 매매사례 확인 가격(토지·건물 일괄). │
│  → RTMS 자동조회·취득 당시 면적·단일 취득시 기준시가 칸은 일반건물에서 숨김      │
└────────────────────────────────────────────────────────────────────────┘
┌ ①토지 공시지가 / ②건물 기준시가 (GeneralBuildingBlock) ─────────────────┐
│ [감정·매매사례·환산 선택 시 열림 — §3.5 gbPartNeedsAcqStd]                  │
│  취득시 토지 공시지가 [____]  /  취득시 건물기준시가 [____]  (=개산공제 base) │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2 분리 ON — 파트 카드 (토지·건물 취득일 다름 ON)

> 위치: 「📌 토지 취득」 카드(`PartAcqModeField part="land"` — `GeneralBuildingAcquisitionCards.tsx:439`)·「🏗 건물 취득」 카드(`part="building"` — `GeneralBuildingAcquisitionCards.tsx:681`). 자산 단위 라디오·금액칸은 `hideAssetAcqAxis`로 숨은 상태(현행).

```
┌ 📌 토지 취득 (sky) ───────────────────────────────────────────────────┐
│ 취득원인 (●매매)(○상속)(○증여)(○이월과세)                                 │
│ 토지 취득가액 산정 방식  [FieldCard field="landAcqMode"]                 │
│   data-testid="gb-part-acq-mode-land"                                  │
│   (●실거래가)(○환산취득가)(○감정가액)(○매매사례가액)   ← layout=inline 4종    │
│                                                                        │
│  actual     → 토지 취득가액 *  [gb-land-acq-price]                        │
│  appraisal  → 토지 감정가액 *  [gb-land-appraisal-value]                  │
│  salesCase  → 토지 매매사례가액 * [gb-land-salescase-value]               │
│  estimated  → (입력칸 없음 — ①토지 공시지가 칸이 분자)                      │
│  토지 자본적지출 [land direct expenses]  hint=capexHint(토지, 모드)         │
└────────────────────────────────────────────────────────────────────────┘
┌ 🏗 건물 취득 (amber) ─────────────────────────────────────────────────┐
│ 취득원인 (●매매)(○상속)(○증여)(○이월과세)(○신축(자가건축))                 │
│ 건물 취득가액 산정 방식   data-testid="gb-part-acq-mode-building"         │
│   (●실거래가)(○환산취득가)(○감정가액)(○매매사례가액)                          │
│  actual/appraisal/salesCase → gb-building-acq-price / -appraisal-value / -salescase-value │
└────────────────────────────────────────────────────────────────────────┘
┌ ①토지 공시지가 / ②건물 기준시가 (GeneralBuildingBlock) ────────────────┐
│ 취득시 토지 공시지가 : 토지 파트가 비실가이면 열림                          │
│ 취득시 건물기준시가 : 건물 파트가 비실가이면 열림                          │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.3 상속·증여 파트 (필터 후)

```
 토지 취득가액 산정 방식  (●실거래가)         ← 단일 옵션. 안내 hint(현행 §163⑨ 문구) 유지
   hint: 상속으로 취득한 토지는 상속개시일 평가액이 취득당시 실지거래가액입니다 (소득세법 시행령 §163⑨). …
```
(`FieldCard field="landAcqMode"` 앵커는 **항상 렌더** — ⑧ 필드 점프 E2E가 이 앵커를 쓴다, §10.)

## §3 ⑤ 위젯 명세·testid
> **엔진 설계(`gb-part-appraisal-salescase.engine.design.md`)와 정합**: D-1=(b) — 파트 모드 중 하나라도 비-actual이면 환산 경로. ⑤는 그 결과 **「비-actual 파트 = 취득시 기준시가 필요」**(§3.5)를 노출한다.

### 3.1 파일별 변경 요약 (줄 수·증가분 §11)

| 파일 | 변경 |
|---|---|
| `GeneralBuildingAcquisitionCardsParts.tsx` | ① `PART_MODE_OPTIONS` 4종화+원인별 필터 ② 금액칸 3종(actual/apr/sc) 분기·testid ③ 안내 ToneCard(§3.7) ④ 이월과세 파트 라디오 숨김(§3.6) |
| `GeneralBuildingAcquisitionCards.tsx` | ① `showPenaltyBadge`를 모드 인지형으로(§3.11) ② 취득원인 라디오 2곳에 `gbPartCauseModePatch` ③ `setSeparate(true/false)` patch(§3.9) ④ `CompanionAcqPurchaseBlock` 호출에 `isSalesCaseAcquisition`·`onIsSalesCaseAcquisitionChange` 배선(`:362-363` 부근 — **현재 미배선**, 감정 쪽 2개는 이미 배선) ⑤ 증축 토글 `onCheckedChange`는 변경 없음(차단은 옵션 disabled + ⑧) |
| `CompanionAcqPurchaseBlock.tsx` | `acqBasisOptions`(`:133-156`)의 일반건물 분기 삭제 → 4종 통일, 증축 ON이면 감정·매매사례 `disabled`(§3.8) |
| `CompanionAcqAmountSection.tsx` | 일반건물 분기: 매매사례는 단순 금액칸(RTMS·단일 기준시가 숨김), 감정은 단일 「취득시 기준시가」 칸 숨김, 일반건물 안내 ToneCard(§3.4) |
| `GeneralBuildingBlock.tsx` | `showAcqStdPrice`(`:242-247`)에 비-actual 파트 술어 추가(§3.5) — 4줄 |
| `asset-sections/AssetSectionExpense.tsx` | 일반건물·비-actual 시 「감정·매매사례는 개산공제만」 ToneCard(§3.7) |
| `lib/calc/transfer-tax-split-acq-mode.ts` | 신규 leaf 4개: `partNeedsOwnAcqStd`·`gbPartCauseModePatch`·`gbSeparateOffPartClearPatch`·`gbSeparateOnPatch`(§3.5·§3.6·§3.9, 상세 §7.2) |

### 3.2 파트 라디오 (분리 ON) — 주택 문구 체계 차용

`PART_MODE_OPTIONS`(`GeneralBuildingAcquisitionCardsParts.tsx:56-59`)를 주택 `ACQ_MODE_OPTIONS`(`LandBuildingSplitSection.tsx:41-46`)와 **라벨 4종 동일**로 맞춘다. **description은 달지 않는다**(주택 파트 라디오가 라벨만 쓰고 `layout="inline"` 4칸이라 설명이 단어 중간에서 끊긴다 — 카드가 좁아져 설명이 단어 중간에서 끊긴 실측이 `CompanionAcqPurchaseBlock.tsx:344-346` 주석에 있다). 종전 description 두 줄(「계약서상 실지거래가액」·「양도가 × 기준시가 비율」)의 정보는 아래 금액칸 hint가 대신한다.

| value | label | 그 파트 입력 |
|---|---|---|
| `actual` | 실거래가 | 금액칸 `취득가액` |
| `estimated` | 환산취득가 | 금액칸 없음(①②의 취득시·양도시 기준시가가 분자·분모) |
| `appraisal` | 감정가액 | 금액칸 `감정가액` + 취득시 기준시가(개산공제 base) |
| `salesCase` | 매매사례가액 | 금액칸 `매매사례가액` + 취득시 기준시가(개산공제 base) |

**금액칸 (`PartAcqModeField` 내부, `{label}` = 토지|건물)**

| 모드 | FieldCard `field` | 라벨 | hint | testid | 필수 |
|---|---|---|---|---|---|
| actual | `{land\|building}AcquisitionPrice` | `{label} 취득가액` | (현행 유지) `{label}에 귀속되는 실지거래가액 (소득세법 §97①1호). 별개 취득이라 총액에서 자동 계산되지 않습니다.` | `gb-{land\|building}-act-price` | ✅ |
| appraisal | 동 | `{label} 감정가액` | `취득시기가 다르므로 나머지 금액에서 자동 계산되지 않습니다 (소득세법 §97①1호·§114⑦)` ← **주택 `LandBuildingSplitSection.tsx:269-275` 문구 그대로** | `gb-{land\|building}-apr-price` | ✅ |
| salesCase | `{land\|building}SalesCaseValue` | `{label} 매매사례가액` | `매매사례 탐색 기간이 파트별 취득일 전후 3개월로 서로 달라 총액을 안분할 수 없습니다 (소득령 §176의2③1호)` ← **주택 `:294-298` 문구 그대로** | `gb-{land\|building}-sc-value` | ✅ |

- 입력은 `CurrencyInput`(`hideUnit`, 현행 actual 칸과 같은 형태). **placeholder 숫자 예시 금지**(components/calc/CLAUDE.md) — 형식 설명은 hint.
- **testid 규약**: `gb-{part}-{act|apr|sc}-…`. 주택의 `split-{part}-acq-price`·`-appraisal-value`·`-salescase-value`와 충돌하지 않는다(주택 E2E `split-mode-gating.spec.ts`가 `part-acq-mode-land` 등을 쓰므로 **같은 testid를 재사용하지 않는다**).
- 그룹 래퍼: RadioCardGroup 루트 `data-testid="gb-part-acq-mode-{land|building}"`(`RadioCardGroupProps["data-testid"]` 지원 — `RadioCardGroup.tsx:121-128`), 옵션별 `testId`: `gb-{part}-acq-mode-{actual|estimated|appraisal|salescase}`.
- 기존 `FieldCard field="landAcqMode"`·`buildingAcqMode` 앵커는 **항상 렌더**(⑧ 필드 점프 `e2e/_helpers/validation-field-jump-cases-gb.ts:129·133·160`이 사용).
- 자본적지출 칸: 현행 유지(`capexHint`가 이미 appraisal·salesCase 문구를 가진다 — `capexHint.ts:17-19`). 단 **입력해도 세액이 안 변한다**는 점은 hint 한 줄로 부족하므로 §3.7 ToneCard가 보완.
- `showPartCapex`(`GeneralBuildingAcquisitionCards.tsx:183`) 규칙 현행 유지: 「두 파트 모두 환산」만 제외. 감정·매매사례 파트도 파트 칸을 띄운다(⑧ V-8이 자산 단위 칸을 막고 파트 칸으로 안내하기 때문 — `validate-gb.ts:376-378`).

### 3.3 자산 단위 라디오 (분리 OFF)

- `CompanionAcqPurchaseBlock.tsx:133-156`의 `props.assetKind === "general_building" ? [2종] : [4종]`에서 **일반건물 2종 분기를 삭제**하고 비-GB 4종을 쓴다. 단 `actual` 옵션만 일반건물 한정 description을 유지(`계약서상 실거래가 (증축 시 토지·원건물 일괄)`) — 증축 안내가 이 칸에 있고, 위 E2E 4건(`transfer-amendment` 등)의 `name: "실거래가 계약서상 실거래가"` 부분 매칭도 그대로 통과한다.
- 매매사례 옵션은 `props.onIsSalesCaseAcquisitionChange` 존재 시에만 렌더(`:146-155`) → GB 호출부에 두 prop 배선(§3.1). **미배선이면 옵션이 안 뜨고, 더 나쁘게는 `handleAcqBasisChange`의 `props.onIsSalesCaseAcquisitionChange?.(false)`가 no-op이라 stale `isSalesCaseAcquisition`을 GB에서 끌 수단이 없다** — `effectivePartAcqMode`는 그 플래그를 `salesCase`로 파생한다(`transfer-tax-split-acq-mode.ts:59-64`).
- `columns={Math.min(acqBasisOptions.length, 4)}`(`:344-347`)는 4가 되어 한 줄 4열. 라디오 root testid 추가: `data-testid="gb-asset-acq-mode"`(기존 `name="acqBasisMode"`·`data-field="useEstimatedAcquisition"` 유지 — E2E `transfer-dead-end-defects.spec.ts:206·592`가 `name^="acqBasisMode"][value=…]`로 클릭). 옵션 `value`(`actual|estimated|appraisal|sales_case`)·name **변경 금지**.
- `handleAcqBasisChange`(`:102-127`)는 세 콜백을 개별 호출한다 — 각 콜백이 **단일 키 patch**(`onChange({ useEstimatedAcquisition: v })` 등)라 stale spread는 없다(GB 호출부 `GeneralBuildingAcquisitionCards.tsx:361-363` 확인). 새로 배선하는 `onIsSalesCaseAcquisitionChange`도 **단일 키 patch**(`onChange({ isSalesCaseAcquisition: v })`)로 쓴다.

### 3.4 자산 단위 금액칸 — 일반건물 분기 (`CompanionAcqAmountSection.tsx`)

| 모드 | 렌더 | testid | 비고 |
|---|---|---|---|
| 감정 | 라벨 `감정가액 (원)`(현행), hint 일반건물용으로 교체: `공인감정기관의 감정가액(토지·건물 일괄). 토지·건물로는 취득시 기준시가 비율로 안분합니다 (소령 §166⑥·§176의2③2호).` | `fixed-acquisition-price`(현행 유지 — 공용 컴포넌트) | **단일 「취득시 기준시가 (원) — 개산공제 기준액」(`:165-175`, `data-field="standardPriceAtAcq"`)은 일반건물에서 숨긴다** — base는 ①②의 두 칸(§3.5) |
| 매매사례 | **`SalesCaseSection`을 쓰지 않는다**(RTMS 아파트 자동조회·취득 당시 면적·단일 기준시가 칸 — `SalesCaseSection.tsx:58-61·99-110·128-137` — 은 집합건물 전용 의미). 단순 `CurrencyInput`: 라벨 `매매사례가액 (원)`, `data-field="similarSalesValue"`, hint `「소득세법 시행령」 §176의2③1호: 취득일 전후 3개월 내 유사 면적·용도 매매사례 확인 가격(토지·건물 일괄). 토지·건물로는 취득시 기준시가 비율로 안분합니다.` | `gb-asset-sc-value` | 자동조회를 일반건물에 열지 않는다(기존 RTMS는 `aptName`·전용면적 기준 — 일반건물에 의미 있는지는 확인 필요 Q-C) |

- 두 모드 공통: 필수 표시(`required`), `data-field`로 ⑧ 필드 점프(`fixedAcquisitionPrice`·`similarSalesValue`).
- **분기 조건은 `isGeneralBuilding`(이미 호출부가 주입 — `CompanionAcqPurchaseBlock.tsx:405-420`)** — 재파생 금지.
- 일부 양도(`areaScenario === "partial"`)의 「양도분 취득가액 구분」 계산기(`PartialAcqApportionSection`)는 `!props.isAppraisalAcquisition`일 때만 뜨는 현행 유지(감정·매매사례는 §V-9 대상 아님 — `validate-gb.ts:533-561`이 `!isAppraisal && !isSalesCase`일 때만 요구).

### 3.5 개산공제 base 입력칸 노출 — 단일 술어

**왜**: 엔진 D-1(b)에서 비-actual 파트는 개산공제(§163⑥1호 토지 `gbAcqLandPricePerSqm × gbLandArea`, 2호 건물 `gbAcqBuildingValue`)의 base로 그 파트의 **취득시 기준시가가 필수**다(F-4). 그런데 `GeneralBuildingBlock.tsx:242-247`의 `showAcqStdPrice`는 환산·증축·부담부증여·`needsGbActualAcqStdPrice`일 때만 열린다 → 감정·매매사례만 고른 사용자는 ⑧(V-5 확장)이 요구하는 칸이 **화면에 없다 = 막다른 길**(`feedback_ui_gate_removes_sole_input_path`).

**술어 (신규 leaf, `transfer-tax-split-acq-mode.ts`)**

```ts
/** 그 파트가 **자기** 취득시 기준시가를 개산공제·환산 base로 쓰는가 — 모드가 actual이 아니면 참.
 *  `requiresAcqStdPricePart` 1절(`:425` `mode !== "actual"`)과 같은 식 — 그쪽도 이 leaf를 부르게 해 단일 소스로 둔다. */
export function partNeedsOwnAcqStd(mode: PartAcqMode): boolean { return mode !== "actual"; }
```

**⑤(`GeneralBuildingBlock`)**: `showAcqStdPrice = partNeedsOwnAcqStd(landAcqModeEff) || partNeedsOwnAcqStd(buildingAcqModeEff) || asset.gbHasExtension || isBurdenedGift || needsGbActualAcqStdPrice(asset)` — `landAcqModeEff === "estimated" || buildingAcqModeEff === "estimated"`를 대체. 두 카드(① 토지 공시지가·② 건물 기준시가)가 함께 열리는 현행 동작 유지(한 파트만 비-actual이어도 둘 다 열림 — `general-building-separate-acquisition.spec.ts` T2가 그 동작을 검증).
**④·⑧·⑫**: `needLandStd`/`needBuildingStd` = `partNeedsOwnAcqStd(mode) || ext`(엔진 §7 ⑫·④ 행과 같은 술어 — 엔진 시니어가 import).

> ⚠️ **엔진 설계 §1.3-2와의 조정(C-1)**: 엔진은 `requiresAcqStdPricePart(part, flags, ctx)`를 공유하라고 했다. 그 함수는 `mode === "actual"`일 때 `needsApportionRatio`(`:385-413` — 「비-별개취득 + 파트 가격 둘 다 빔」)까지 본다. 일반건물 분리 OFF·실가·일괄 총액 경로에서 이 절이 참이 되면 `showAcqStdPrice`가 **항상 열려** 시점별 「건물 기준시가 계산」 런처가 숨는다(`GeneralBuildingBlock.tsx:228-233` 주석이 기록한 CI 회귀 — E2E `building-stdprice-apply-timepoint`·`building-stdprice-modal-prefill` 파손 — 과 같은 모양이다. **이번 설계에서 재현은 하지 않았다(확인 필요)**). 일반건물 actual 안분 필요는 이미 전용 술어 `needsGbActualAcqStdPrice`가 정본이다. ⇒ 1절만 leaf로 뽑아 공유하고(`partNeedsOwnAcqStd`) `requiresAcqStdPricePart`가 그 leaf를 부르도록 리팩터하면 「`mode !== "actual"`」 식은 한 곳이다. 엔진·⑫가 `requiresAcqStdPricePart` 전체를 쓰려면 일반건물 분리 OFF 일괄 케이스의 거동 차이를 anchor로 먼저 확인할 것.

### 3.6 취득원인별 선택지 필터 + 원인 전환 patch

| 파트 원인 | 파트 라디오 | 금액칸 | 이유 |
|---|---|---|---|
| purchase | 4종 | 모드별 | — |
| newConstruction (건물) | 4종 | 모드별 | ⑧이 막지 않는다. 신축 자가건축의 매매사례 실재 여부는 확인 필요(Q-D) — 주택 신축 경로(`NewConstructionLandAcqBlock`)도 필터하지 않으므로 대칭 유지 |
| **inheritance / gift** | **실거래가 1종**(`FieldCard field` 앵커·§163⑨ hint 유지) | 상속: 없음(평가액 칸이 정본, 현행) / 증여: 증여 신고가액 | ⑧ `blockEstimation`이 비-actual 전부 차단(`validate-gb.ts:143-157` — 감정·매매사례 포함 — 문구 「환산취득가·감정가액·매매사례가액으로 산정할 수 없습니다」, 기존 anchor `gb-inheritance-gift-part-axis.anchor.test.ts:97`가 감정 차단을 검증). **UI 선택지 = ⑧ 허용 집합** |
| **carryover_gift** | **라디오 숨김**(엔진 §5: 이월과세 카드가 취득가액을 시나리오 A/B로 통째로 교체) — 단 **유효 모드가 actual이 아닐 때는 단일 옵션 라디오를 보여 준다**(복원·구 세션의 막다른 길 방지) | 없음 | ⑧이 비-actual을 차단하면 그 값을 고칠 칸이 있어야 한다. 환산 선택지 제거는 **현행 동작 변경**(§12 C-2에 기록) |
| burdened_gift | 라디오 숨김(현행 `GeneralBuildingAcquisitionCardsParts.tsx:110` 유지) | 없음 | §159가 정함 |

**원인 전환 patch** (`transfer-tax-split-acq-mode.ts` 신규 leaf):

```ts
/** 파트 취득원인이 상속·증여·이월과세로 바뀔 때 그 파트 모드를 명시 actual로 고정한다.
 *  ⚠️ ""(미선택)이 아니다 — ""는 effectivePartAcqMode가 레거시 3플래그로 되돌려
 *  stale 감정 플래그가 있으면 화면(무선택)↔전송값(감정)이 갈린다(G-3 근본 원인). */
export function gbPartCauseModePatch(part: "land"|"building", cause: string|undefined):
  { landAcqMode?: "actual" } | { buildingAcqMode?: "actual" } {
  if (cause !== "inheritance" && cause !== "gift" && cause !== "carryover_gift") return {};
  return part === "land" ? { landAcqMode: "actual" } : { buildingAcqMode: "actual" };
}
```
- **호출 위치(한 덩어리 patch)**: 토지 원인 라디오 `onChange`(`GeneralBuildingAcquisitionCards.tsx:335-339` 분리 ON 분기 `onChange({ acquisitionCause: v })`) → `onChange({ acquisitionCause: v, ...gbPartCauseModePatch("land", v) })`; 건물 원인 라디오(`:581-582`) 같은 방식. 두 키를 **같은 patch**에 넣는다(나눠 부르면 뒤 호출이 앞을 덮는다).
- **복원 정규화는 추가하지 않는다**: 구 세션에서 「상속 + landAcqMode=estimated」를 복원 시 `actual`로 바꾸면 ⑧ 필드 점프 E2E가 시드로 쓰는 값이 사라져 오류 자체가 안 뜬다(`e2e/_helpers/validation-field-jump-cases-gb.ts:129-134·160-162`, memory `feedback_e2e_seed_erased_by_restore_normalization`). 대신 **라디오(단일 옵션) 앵커가 남아 사용자가 한 번 눌러 해소**한다.
- 분리 OFF의 상속·증여는 현행 `gbUnifiedSec1639ClearPatch`(`:80-95`)가 이미 추계 3플래그+파트 모드를 비운다 — 감정·매매사례도 같은 3플래그라 **수정 불필요**.

### 3.7 「개산공제만 인정」 안내 (입력해도 세액 그대로 방지)

엔진 §4.1: 감정가액·매매사례가액 파트는 필요경비가 **개산공제만**이고 자본적지출·양도비는 산입되지 않는다(「소득세법」 §97②2호 **본문** — 단서의 택일은 환산취득가액에 한정). 입력 칸을 막지 않고(주택 split과 같은 형태 — `LandBuildingSplitSection.tsx:541-548`) **안내 ToneCard**로 알린다.

- **신규 컴포넌트 `components/calc/transfer/GbDeductionOnlyNotice.tsx`**(≈25줄, 단일 문구 소스) — 두 곳이 같은 문구를 쓴다.
  - `<ToneCard tone="amber" noDark>`(tone 매핑: amber = 취득·분리계산)
  - 문구: `감정가액·매매사례가액은 추계 취득가액이라 필요경비는 개산공제(취득시 기준시가 × 율 — 3%, 미등기양도자산 0.3%; 「소득세법 시행령」 §163⑥)만 인정됩니다. 자본적지출·양도비는 필요경비에 산입되지 않으므로 입력해도 세액이 바뀌지 않습니다 (「소득세법」 §97②2호 본문).`
  - testid `gb-deduction-only-notice`.
- **노출 위치 ①** `PartAcqModeField`: 그 파트 모드가 `appraisal | salesCase`이고 상속·증여·이월과세 파트가 아닐 때, 파트 금액칸 **바로 아래**(자본적지출 칸 위).
- **노출 위치 ②** `AssetSectionExpense.tsx`: `assetKind === "general_building"` ∧ 분리 OFF ∧ `deriveLegacyPartAcqMode(asset) ∈ {appraisal, salesCase}`일 때 자본적지출·양도비 칸 **위**. (분리 ON의 자산 단위 칸은 ⑧ V-8이 이미 파트 칸으로 안내·차단 — `validate-gb.ts:376-378`.)
- 「납세자 유리·불리·절감」 표현을 쓰지 않는다(법령 정확성 원칙).

### 3.8 증축 × 자산 단위 감정·매매사례 — 차단 (엔진 F-6·Q-A3)

3-way 경로가 자산 단위 추계 총액 안분을 모른다(엔진 §5). UI는:
- `CompanionAcqPurchaseBlock`의 일반건물 라디오에서 `props.gbHasExtension === true`이면 **감정가액·매매사례가액 옵션을 `disabled`**(`RadioCardOption.disabled` — `RadioCardGroup.tsx:99`; 숨기지 않는다 — 숨기면 이미 고른 값이 무선택으로 보여 G-3 모양이 된다) + 옵션 `hint`: `증축분이 있으면 원건물을 감정가액·매매사례가액으로 산정할 수 없습니다 (토지·원건물·증축분 3파트 안분 미지원).`
- ⑧(`validate-gb.ts`)이 같은 조건을 차단(필드 `useEstimatedAcquisition`, §4 표). ⑫ refine은 엔진 몫.
- **분리 ON × 증축은 차단하지 않는다**(엔진 §5: Step 2.5가 이미 처리) — 파트 라디오는 증축과 무관하게 4종.
- 건물2(증축분) 취득방식은 현행 2종(actual·estimated) 유지 — `GeneralBuildingExtensionSection`·⑫ `acquisitionMode`(`building-schemas.ts:247`) 변경 없음.

### 3.9 분리 토글 전환 patch (엔진 요청 1 · F-5)

**OFF 전환**(`setSeparate(false)`, `GeneralBuildingAcquisitionCards.tsx:215-226`) — 파트 값이 stale로 남아 ④가 환산 경로로 보낸다(엔진 실측 S1·S2). **한 덩어리 patch**에 파트 값을 함께 비운다:

```ts
// transfer-tax-split-acq-mode.ts (신규 leaf)
export function gbSeparateOffPartClearPatch() {
  return { landAcqMode: "", buildingAcqMode: "",
           landAcquisitionPrice: "", buildingAcquisitionPrice: "",
           landSalesCaseValue: "", buildingSalesCaseValue: "",
           landDirectExpenses: "", buildingDirectExpenses: "" } as const;
}
// setSeparate(false): { hasSeperateLandAcquisitionDate:false, landAcquisitionDate: …, gbBuildingAcquisitionCause: …,
//                       ...gbUnifiedSec1639ClearPatch(cause), ...gbSeparateOffPartClearPatch() }
```
- `gbUnifiedSec1639ClearPatch`도 `landAcqMode:""`·`buildingAcqMode:""`를 반환하지만 같은 값이라 충돌이 없다(스프레드 순서 무관).
- 비우는 값은 화면에서 사라지는 칸이다(분리 OFF 카드엔 파트 라디오·금액칸이 없다). **재ON 시 복원되지 않는다** — 취득일은 별도로 보존(현행). 이 손실은 엔진 요청 1이 전제하는 것이다.
- 분리 OFF의 모드는 이제 **레거시 3플래그만**이 정한다 — 자산 단위 라디오(§3.3)가 그 값을 쓰므로 화면=전송이 같아진다(엔진 Q-A2 「전면」 권장과 정합).

**ON 전환**(`setSeparate(true)`, 현행 `{ hasSeperateLandAcquisitionDate: true }`만) — 자산 단위에서 고른 감정·매매사례가 파트 라디오의 **「레거시 파생값」**으로만 이어지고 레거시 플래그는 stale로 남아, ④ 최상위 `acquisitionMethod`/`appraisalValue`가 계속 감정을 말한다(`transfer-tax-api.ts:392-399`) — ⑩ refine(`transfer-tax-schema-refines.ts:257·266`)이 `appraisalValue`가 0이면 400 = **G-3의 실체**.

```ts
export function gbSeparateOnPatch(a: Pick<AssetForm,"landAcqMode"|"buildingAcqMode"|"isAppraisalAcquisition"|"isSalesCaseAcquisition"|"useEstimatedAcquisition">) {
  return { hasSeperateLandAcquisitionDate: true,
           landAcqMode: effectivePartAcqMode(a.landAcqMode, a),          // 명시값으로 승격(표시=전송)
           buildingAcqMode: effectivePartAcqMode(a.buildingAcqMode, a),
           isAppraisalAcquisition: false, isSalesCaseAcquisition: false }; // 숨은 레거시 플래그 소거
}
```
- `useEstimatedAcquisition`은 **건드리지 않는다** — GB에서 별도 소비처가 많다(`GeneralBuildingBlock.tsx:108` 연면적 게이트, ⑧ `validate-gb.ts:437`, ④ `transfer-tax-api.ts:346`).
- 파트 **금액**은 옮기지 않는다(자산 단위 총액을 토지·건물로 자동 분할하지 않는다 — 자동 안분 fallback 금지). 파트 칸이 비어 있으면 ⑧ V-7이 입력을 요구한다.
- **복원(저장값) 정규화**: 위와 같은 상태가 이미 저장된 세션(분리 ON + `isAppraisalAcquisition`/`isSalesCaseAcquisition` true인 일반건물 — `building`→일반건물 전환 후 ON 경로)을 복원할 때 `gbSeparateOnPatch`와 같은 patch를 적용한다 — `calc-wizard-asset-migrate.ts:570-574` G3 블록 옆(§7). E2E에서 이 두 플래그를 `true`로 **시드**하는 곳을 전수 grep(`isAppraisalAcquisition: true`·`isSalesCaseAcquisition: true`)한 결과 일반건물 시드는 없다 — 주택(`transfer-estimate-mode-lump-sum-deduction`·`transfer-sales-case-rtms`)·기본 자산(`validation-field-jump-cases-acq`의 `withPrimary` 기본)·입주권뿐이다. 시드 소거 위험 낮음.

### 3.10 부담부증여 — 현행 유지

파트 라디오(`GeneralBuildingAcquisitionCardsParts.tsx:110` `transferType === "burdened_gift" → null`)·자산 단위 라디오(`CompanionAcqPurchaseBlock.tsx:310` 게이트) 모두 숨김 유지. **UI는 숨기는 것으로 끝이 아니다** — stale 비-actual 플래그가 부담부증여로 새면 환산 경로가 `burdenedGiftInfo`를 소비하지 않아 §159가 소실된다(엔진 §3 함정·V-15). 막는 곳은 ④ 라우팅 가드(`burdened_gift ⇒ 실가 경로`, 엔진 §3.1)이며 UI 몫은 없다.

### 3.11 §114조의2 가산세 배지 — 모드 인지 (엔진 F-3·요청 7)

`showPenaltyBadge`(`GeneralBuildingAcquisitionCards.tsx:126-150`)는 현재 **환산만** 본다(`effectivePartAcqMode(asset.buildingAcqMode, asset) !== "estimated"` → false, 양도일 ≥ 2018-01-01). 엔진은 §114의2①이 「**감정가액 또는 환산취득가액**」이므로 감정도 대상으로 확정했다(`building-penalty.ts:27-29`): 환산 = 양도일 ≥ 2018-01-01, **감정 = 양도일 ≥ 2020-01-01**, 매매사례 = 비대상.

- 건물 파트 모드 `m`: `m==="estimated"`(≥2018-01-01) 또는 `m==="appraisal"`(≥2020-01-01)이고 신축·5년 이내일 때 배지. 문구는 모드별: 환산 `환산취득가액 가산세 적용 대상 — 건물 환산취득가액의 5% (소득세법 §114조의2 ①)`(현행) / 감정 `감정가액 가산세 적용 대상 — 건물 감정가액의 5% (소득세법 §114조의2 ①)`.
- **날짜 게이트를 UI에서 재기술하지 않는다**: 엔진 `transfer-tax-building-penalty.ts`에 leaf `buildingPenaltyMethodApplies(method, transferDate): boolean`(위 두 게이트)을 export해 `calculateBuildingPenalty`와 배지가 **같은 함수**를 부르게 한다(엔진 시니어 요청 **E-4**). 현행 배지의 `new Date("2018-01-01")` 하드코딩이 그 중복 사본이다.
- 「잠정 안내 — 정확한 가산세 발동 여부는 계산 결과에서 확인」 보조문은 유지.

## §4 ⑧ validate 대조표
> 원칙: **주택 경로(`lib/calc/transfer-tax-validate-split.ts`)가 검증하는 만큼만** + 엔진 설계가 요구한 차단 2건(증축×자산 단위, 이월과세 파트). 새 규칙 발명 금지. 감정평가기준일·감정기관 수 검증은 **하지 않는다** — 주택 경로가 하지 않는다(엔진 D-2 확정; 취득 감정에는 `appraisalDate*` 입력 자체가 없고 `appraisalDateAtTransfer`는 양도가액 안분 축).

### 4.1 규칙별 대조 (현행 → Phase A)

| # | 규칙 | 주택 `validate-split.ts` | 일반건물 `validate-gb.ts` 현행 | Phase A 변경 |
|---|---|---|---|---|
| R1 | 파트 금액 필수 — actual·appraisal | `:84-90`(`p.mode === "actual" \|\| "appraisal"` → `opt(price)==null` → 「`{토지\|건물}` 감정가액/취득가액을 입력하세요 — … 자동 계산되지 않습니다(소득세법 §97①1호·§114⑦)」) | V-7 `:415-421`(토지)·`:422-428`(건물): `landMode !== "estimated" && !landAcquisitionPrice` → **salesCase에도 `landAcquisitionPrice`를 요구**(UI에 없는 칸 — 엔진 F-1) | 조건을 `landMode === "actual" \|\| "appraisal"`로 좁힌다(감정이면 문구 「감정가액」으로 분기 — `partPriceError`의 `byGift` 옆에 `isAppraisal` 인자) |
| R2 | 파트 금액 필수 — salesCase | `:91-97`(`p.mode === "salesCase"` → `opt(p.salesCase)==null` → 「…매매사례가액을 입력하세요 — 매매사례 탐색 기간이 파트별 취득일 전후 3개월로 서로 달라 총액을 안분할 수 없습니다(소득령 §176의2③1호)」, field `landSalesCaseValue`) | 없음 | **신설** — 위 주택 문구·필드 그대로. 상속 파트는 V2가 먼저 막으므로(`:163-164`) 이 분기에 오지 않는다 |
| R3 | 개산공제 base(취득시 기준시가) 필수 | V3 `:177-205`·V6 `:207-230`: `requiresAcqStdPricePart(part, …)`가 `mode !== "actual"`에 참 → 감정·매매사례도 요구 | V-5 `:446-451`: `needLandStd = landMode === "estimated" \|\| ext` — **환산만** · 그 게이트 블록 `:435`도 `landMode === "estimated" \|\| buildingMode === "estimated" \|\| ext` | `needLandStd = partNeedsOwnAcqStd(landMode) \|\| ext` 및 외곽 게이트 `:435`를 「어느 파트든 비-actual \|\| ext」로(§3.5 술어 공유). 외곽 게이트가 넓어지면 같은 블록의 **건물 취득원인 필수·신축 취득일** 검사(`:466-490`)도 감정·매매사례에서 돈다 — D-1(b)가 환산 경로(풀세트 payload)로 보내므로 정합 |
| R4 | 자산 단위(분리 OFF) 감정 금액 | 일반 자산 `transfer-tax-validate-acquisition.ts:373-374`·`:391~`(감정 `fixedAcquisitionPrice`) | I3′ `validate-gb-required.ts:68-72`: `fixedAcquisitionPrice > 0` 요구, 문구는 이미 `isAppraisalAcquisition ? "감정가액" : "취득가액"` — 감정 통과 OK | 변경 없음(감정) |
| R5 | 자산 단위 매매사례 금액 | `transfer-tax-validate-acquisition.ts:384-390`(`similarSalesValue>0`, field `similarSalesValue`) | I3′: **`fixedAcquisitionPrice`만 본다**(엔진 §1.2) → 매매사례는 다른 칸인데 이 칸을 요구하는 dead-end | I3′에 분기: `asset.isSalesCaseAcquisition` → `similarSalesValue`(field·문구 「매매사례가액을 입력하세요」) |
| R6 | 자산 단위 개산공제 base | 일반 자산 `:389-390`: `lumpSumBaseRequired` → **단일** `standardPriceAtAcq` 필수 | (환산·V-5로 일부) | **포팅하지 않는다.** 일반건물은 ①②의 두 칸(`gbAcqLandPricePerSqm`·`gbAcqBuildingValue`)이 base이고 R3(V-5)가 이미 요구한다. 단일 `standardPriceAtAcq`를 요구하면 §3.4에서 숨긴 칸을 요구하는 dead-end(거짓 요구) |
| R7 | 상속·증여 파트 비-actual 차단 | — (주택은 상속 파트 개념이 다르다) | V2 `:163-164`·V2′ `:259-260` — `landMode !== "actual"` 전부 차단(감정·매매사례 포함, 문구 「환산취득가·감정가액·매매사례가액으로 산정할 수 없습니다」) | **변경 없음.** UI 필터(§3.6)가 같은 집합이다. anchor `gb-inheritance-gift-part-axis.anchor.test.ts:97`(감정 파트 차단)이 계속 통과 |
| R8 | 이월과세 파트 × 감정·매매사례 차단 | — | 없음(`blockEstimation`은 상속·증여만) | **신설(엔진 §5·Q-A4 요구)** — 조건: 토지 `acquisitionCause==="carryover_gift"`·건물 `gbBuildingAcquisitionCause==="carryover_gift"`이고 그 파트 모드 ∈ {appraisal, salesCase}. field `landAcqMode`/`buildingAcqMode`(앵커는 §3.6대로 항상 렌더). 문구: `{label}: 이월과세로 취득한 {토지는\|건물은} 취득가액을 감정가액·매매사례가액으로 산정할 수 없습니다. 이월과세는 증여자의 취득가액을 승계합니다 (소득세법 §97의2①). 「실거래가」를 선택하세요.` |
| R9 | 증축 × 자산 단위 감정·매매사례 차단 | — | 없음 | **신설(엔진 F-6·Q-A3 요구)** — 조건: `!isSeparate && asset.gbHasExtension && legacy 모드 ∈ {appraisal, salesCase}`. field `useEstimatedAcquisition`(자산 단위 라디오 앵커 `data-field`). 문구: `{label}: 증축분이 있으면 원건물 취득가액을 감정가액·매매사례가액으로 산정할 수 없습니다. 「실거래가」 또는 「환산취득가」를 선택하세요 (토지·원건물·증축분 3파트 안분 미지원).` 위치: I3′ 호출(`:308`) 직전 |
| R10 | 자본적지출 자산 단위 칸 | — | V-8 `:376-378`: 「두 파트가 모두 환산」이 아니면 `capitalExpenditure` 차단 | **변경 없음**(감정·매매사례 파트에서도 파트 칸으로 안내 — 이미 같은 규칙) |
| R11 | §114의2 가산세 관련 | — | 없음(안내 배지만 ⑤) | 변경 없음 — 엔진이 처리, 배지만 §3.11 |

### 4.2 ④⑤⑧ 동기화 — 같은 술어를 쓰는 5곳 (정책 #3)

| 술어 | ⑤ UI | ④ API | ⑧ validate | ⑫ Zod 거울(엔진) |
|---|---|---|---|---|
| 파트 유효 모드 | `effectivePartAcqMode`(`GeneralBuildingAcquisitionCardsParts.tsx:75`·`GeneralBuildingAcquisitionCards.tsx:142·184-185`) | `transfer-tax-api-gb.ts:341-342` | `validate-gb.ts:128-129` | `building-schemas.ts:459-460`(`?? "estimated"` 기본) |
| 비-actual ⇒ 자기 취득시 기준시가 | `showAcqStdPrice`(§3.5) | `api-gb.ts:423-426` | V-5 `:446-451` | `:459-466` |
| salesCase ⇒ `*SalesCaseValue` | 금액칸 `gb-*-sc-value` | `partModePayload`(§5) | R2 | E-2 신설 필드·I2 |
| 자산 단위 매매사례 ⇒ `similarSalesValue` | `gb-asset-sc-value` | 엔진 §7 ④(`bundledAcquisitionPrice`) | R5 | I3(`required-refines-gb.ts:121-138`) |

> ⚠️ **분리 OFF 유효 모드 정의가 ④와 ⑤·⑧에서 갈릴 수 있다.** 엔진 Q-A2(권장)는 ④가 분리 OFF에서 **explicit를 무시하고 레거시 파생값으로 통일**한다. ⑤(`showAcqStdPrice`·`showPartCapex`·배지)·⑧은 지금 `effectivePartAcqMode(explicit, asset)`이라 **구 세션에 OFF + explicit stale**이 있으면 ⑤·⑧은 explicit를, ④는 레거시를 본다 = UI 통과 ↔ 전송값 모순. ⇒ Q-A2가 확정되면 **leaf `gbPartModes(asset): { land, building }`**(`transfer-tax-split-acq-mode.ts`: 분리 ON이면 `effectivePartAcqMode`, OFF이면 레거시 파생 양쪽 동일)를 신설해 ⑤·④·⑧이 **모두** 그것을 부른다. Q-A2가 「한정(감정·매매사례만)」으로 정해지면 이 leaf는 불필요(현행 `effectivePartAcqMode` 유지). **결정 전에는 구현하지 않는다**(§12 Q-B).

## §5 ④ 전송 명세
> 경로 분기는 **엔진 설계 D-1=(b)를 따른다**(`engine.design.md` §3·§3.1·§7). 아래는 `lib/calc/transfer-tax-api-gb.ts`의 UI 쪽 변환 계약이며 구현·테스트 책임은 엔진 시니어와 겹치므로, 같은 파일을 두 시니어가 동시에 고치지 않도록 **엔진 §7 ④ 행을 정본**으로 두고 여기서는 UI 입력 기준의 조건만 명세한다.

### 5.1 전송 규칙

| # | 규칙 | 현행(file:line) | Phase A |
|---|---|---|---|
| T1 | 파트 모드 | `:341-342`(`effectivePartAcqMode`), `:343` `anyEstimated` | 분리 ON: `effectivePartAcqMode`. 분리 OFF: **레거시 파생 통일**(엔진 Q-A2 — 미결, §12 Q-B). 라우팅 `anyEstimated` → `anyNonActual`(엔진 §3.1), **부담부증여 ⇒ 실가 경로** 가드 |
| T2 | 파트 감정가액 | `:387-400`(`landPartPrice`)가 **모드 무관**으로 `landAcquisitionPrice`를 싣는다 | 감정 파트도 같은 슬롯(변경 없음). **R-2 가드 권고**: 주택 ④(`transfer-tax-api-split.ts:95-98·188`)처럼 `actual\|appraisal` 모드일 때만 싣는다 — 필수 변경은 아니다(엔진은 모드별로 읽는 필드만 소비) — 비-필수이며 모드가 `estimated`/`salesCase`인 stale 값의 무해성은 엔진 §4.1 분기로 확인됨 |
| T3 | 파트 매매사례가액 | **전송 안 함**(F-1) | `landSalesCaseValue`/`buildingSalesCaseValue`를 `separate && mode === "salesCase"`일 때만 `parseAmount`로 싣는다(0이면 미전송 — 엔진 §7). **⑫ 필드 신설(E-2) 선행** |
| T4 | 분리 OFF 파트 값 | 파트 4종(`landAcquisitionPrice` 등) 그대로 전송(S2) | **전송하지 않는다**(엔진 §6 마지막 줄 — 총액·파트 값이 같이 오면 엔진이 throw) |
| T5 | 자산 단위 총액 | GB payload에 없음(F-2·S3) | 분리 OFF·`!gbHasExtension`: `bundledAcquisitionPrice` = 감정이면 `fixedAcquisitionPrice`, 매매사례면 `similarSalesValue`(엔진 §1.2). `gbHasExtension`이면 기존 증축 spread(`:471`)와 키가 겹치므로 **게이트 분리**(엔진 §7 ④ 증축 행). 지분 스케일은 `applyShareScale`이 이미 `bundledAcquisitionPrice`를 포함(`transfer-tax-api-gb-shares.ts:123-137`) |
| T6 | 취득시 기준시가 | `:423-426` `needLandStd = landMode === "estimated" \|\| ext` | `partNeedsOwnAcqStd(mode) \|\| ext`(§3.5) — **validate R3·⑤ `showAcqStdPrice`와 같은 술어**. 미충족이면 payload를 통째로 `undefined`로 돌려주는 현행 거동 때문에 ⑧이 같은 조건을 반드시 먼저 막아야 한다(validate 통과 ↔ API 침묵 drop 방지 — `:421-426` 주석이 같은 사고를 기록) |
| T7 | 지분 스케일 | `applyShareScale` 목록 `:123-137` | `landSalesCaseValue`·`buildingSalesCaseValue` **추가**(F-7 — 100% 기준 입력 × 지분율). 기준시가·면적은 **스케일 금지**(같은 파일 `:108-111` 주석) |
| T8 | 최상위 `acquisitionMethod`/`appraisalValue` | `transfer-tax-api.ts:392-399`(레거시 플래그만 본다) | **엔진 §7 ⑩ 행은 「변경 없음」이다.** 그러나 UI 변환(§3.9의 `gbSeparateOnPatch`·복원 정규화)이 레거시 두 플래그를 분리 ON에서 비워 **stale이 도달하지 않게 한다**. 그래도 도달 가능한 경로가 남으면(미지의 복원 경로) ⑩ refine이 `appraisalValue===0`을 400으로 막는다 → **E-3: GB 분리 ON에서 ④가 최상위 모드를 `"actual"`로 고정할 것을 엔진 시니어가 판단**(UI는 어느 쪽이어도 동작) |

### 5.2 지분·컴패니언
- 지분(`api-gb-shares.ts`)·컴패니언(`bundled-split-helpers.ts`)은 **같은 `generalBuildingValuation`** 을 소비하므로 T3·T5·T6·T7이 자동 적용된다(엔진 §5). UI 신규 입력은 100% 기준이며 안내문(「모든 금액을 100% 기준으로 입력하세요」)을 새 칸에서도 유지.
- 지분 카드(2번째 이후, `shareAcquisitionOnly`)의 파트 라디오·금액칸은 현행대로 **취득측이라 병합되지 않는 지분 고유값**(`api-gb-shares.ts:92-96`) — Phase A도 병합 규칙을 바꾸지 않는다.

### 5.3 14지점 점검 (UI 시니어 몫 표시)
| 지점 | 상태 |
|---|---|
| ① 타입 | **변경 없음**(§7) |
| ② initial | 변경 없음 |
| ③ normalize | **추가 1건**(§7.3 — 분리 ON + 레거시 플래그 stale → 승격·소거) |
| ④ API 변환 | T1~T8(엔진 시니어와 같은 파일 — 분담은 §12 Q-E) |
| ⑤ UI | §3 |
| ⑥ 사이드바 | §8 |
| ⑦ 결과 | §9 |
| ⑧ validate | §4 |
| ⑨~⑭ | 엔진 시니어(⑫ `*SalesCaseValue` 신설·⑫ refine·⑭ 변경 없음). UI 관점 grep 점검: ⑬ `callTransferTaxAPI` 서브객체 통째 전송(변경 없음 — 엔진 §7 인용, **UI는 직접 열람하지 않았다: 확인 필요 V-U1**) |

## §6 G-3·Q-5 — 자산 종류 전환 시 플래그 잔존
### 6.1 전환 patch 위치 (확인)

`components/calc/transfer/asset-sections/AssetSectionBasic.tsx:156-165` — 자산 종류 버튼 `onClick`이 `onChange({ assetKind, ...areaResetPatchForAssetKind(asset, kind), ...redevSubjectPatchForAssetKind(kind), ...housingFlagResetPatchForAssetKind(kind) })` 한 덩어리 patch를 보낸다(직접 확인). 이 patch 체인은 **`isAppraisalAcquisition`·`isSalesCaseAcquisition`·`useEstimatedAcquisition`·`landAcqMode`·`buildingAcqMode`를 건드리지 않는다**(`housing-flag-reset.ts` 전체 열람 — 주택 전용 플래그·PHD·임대특례만 다룬다). 다른 정리 지점은 저장값 복원 `calc-wizard-asset-migrate.ts`(입주권 `:397-406`뿐)와 `gbUnifiedSec1639ClearPatch` 호출(`:570-574` — 분리 OFF + 일반건물 + 상속·증여만)이다.

### 6.2 G-3의 실제 경로 (코드 추적)

1. 「건물(토지 제외)」(`building`)에서 자산 단위 「감정가액」 선택 → `isAppraisalAcquisition=true`, `fixedAcquisitionPrice`에 금액.
2. 「일반건물」로 전환 → 위 patch 체인이 플래그를 남긴다.
3. 일반건물 **분리 ON**에서는 자산 단위 라디오가 숨는다(`hideAssetAcqAxis`). 파트 라디오의 값은 `effectivePartAcqMode(explicit "", asset)` = 레거시 파생 `appraisal` → `PART_MODE_OPTIONS`(2종)에 없는 값 → **무선택**. 사용자가 「실거래가」를 눌러도 파트 모드만 `actual`이 되고 레거시 플래그는 그대로.
4. ④가 최상위 `acquisitionMethod: "appraisal"`·`appraisalValue: ratioed(fixedAcquisitionPrice) ?? 0`을 싣는다(`transfer-tax-api.ts:392-399`) → 금액이 비면 ⑩ refine(`transfer-tax-schema-refines.ts:257`) 400.

(V-4 「금액 미입력 시 V-7이 숨은 칸을 요구하는가」는 코드 추적상 **요구하지 않는다** — V-7은 파트 칸만 요구하고 파트 칸은 보인다. 막힘은 ⑧이 아니라 서버 ⑩이다 — 화면 실측은 하지 않았다. 확인 필요 V-U2.)

### 6.3 Q-5 결정 — **승계** (플래그를 비우지 않는다)

| 안 | 내용 | 판정 |
|---|---|---|
| 초기화 | 전환 patch에서 플래그·모드를 `building`→GB 시 비운다 | **기각** — Phase A 후 일반건물도 감정·매매사례가 **유효 입력**이다. 비우면 사용자가 고른 산정방식과 금액이 전환만으로 사라지는 데이터 손실이고(자산종류를 잘못 눌러 되돌리는 흔한 조작), 「`building`·`housing`·GB가 같은 4방식 축」이라는 이 작업의 전제와 어긋난다. 반대 방향(GB→`building`)도 같은 값이 그대로 유효 |
| **승계** | 비우지 않는다. 대신 **막다른 길의 진짜 원인**(분리 ON에서 레거시 플래그를 끌 수단이 없음 + ④가 레거시로 `acquisitionMethod`를 정함)을 닫는다 | **채택** — §3.9 `gbSeparateOnPatch`(ON 전환 시 레거시→명시 파트 모드 승격 + 숨은 두 플래그 소거)·복원 정규화·§3.3의 `onIsSalesCaseAcquisitionChange` 배선(끌 수단 복원)·E-3 |

**파트 모드 정합 규칙(요약)**
1. 분리 ON의 파트 모드는 **항상 명시값**(`""` 금지) — 라디오·원인 전환 patch(§3.6)·ON 전환 patch(§3.9)가 보장한다.
2. 분리 OFF의 파트 모드는 **레거시 3플래그가 단독 정본**이다 — OFF 전환 patch(§3.9)가 파트 모드·값을 비운다.
3. 레거시 감정·매매사례 플래그는 **분리 OFF에서만 의미가 있다** — ON 전환 시 소거. 그래서 「화면에 없는 값이 payload를 가르는」 경우가 없다(U-5 교훈 — `GeneralBuildingAcquisitionCards.tsx:205-213` 주석).
4. `building`→GB 전환으로 넘어온 감정가액의 **개산공제 base**는 `standardPriceAtAcq`(단일)가 아니라 GB 두 칸이다. 단일 칸의 잔존값은 GB 경로에서 소비되지 않는다(GB는 ⑧ 일반 검사 `transfer-tax-validate-acquisition.ts:189-190`에서 조기 위임되고 payload는 서브객체만 본다 — 엔진 §6 3단계). 칸이 새로 열리므로(`showAcqStdPrice`) ⑧ V-5가 요구해도 **입력 칸이 있다**.

## §7 ①②③ 폼 필드·clear patch·stale sessionStorage
### 7.1 ① 타입 · ② initial — **변경 없음**

신규 폼 필드가 없다. 필요한 필드는 전부 `AssetForm`에 이미 있다: `landAcqMode`·`buildingAcqMode`(`calc-wizard-asset.ts:591-593`), `landSalesCaseValue`·`buildingSalesCaseValue`(`:638·640`), `landAcquisitionPrice`·`buildingAcquisitionPrice`, `isAppraisalAcquisition`·`isSalesCaseAcquisition`, `fixedAcquisitionPrice`, `similarSalesValue`, 개산공제 base `gbAcqLandPricePerSqm`·`gbAcqBuildingValue`·`gbLandArea`. 초기값은 factory `calc-wizard-asset-factory.ts:199-208`에 이미 `""`.

### 7.2 clear patch 정리 — 현행 함수의 취급

| 함수(`lib/calc/transfer-tax-split-acq-mode.ts`) | 감정·매매사례에 대한 현행 동작 | 변경 |
|---|---|---|
| `gbUnifiedSec1639ClearPatch(cause)` `:80-95` | 상속·증여면 `useEstimatedAcquisition`·**`isAppraisalAcquisition`·`isSalesCaseAcquisition`** 3플래그를 `false`, 파트 모드를 `""`로 비운다 → 감정·매매사례도 **이미 포함** | **수정 불필요.** 분리 OFF + 상속·증여에서 감정·매매사례가 남아 막다른 길이 되는 일이 없다(분리 OFF의 상속·증여 카드에는 라디오가 없다). 호출 지점도 그대로(`setUnifiedCause`·`setSeparate(false)`·migrate `:570-574`) |
| `giftEstimationClearPatch(cause)` `:108-113` | 일반건물이 **아니라** 표준·상가용 | 무관 |
| `effectivePartAcqMode` `:118-123`·`deriveLegacyPartAcqMode` `:59-64` | 감정·매매사례 파생 이미 지원(우선순위 매매사례>감정>환산>실가) | 변경 없음 |
| `separateAcqPartsSum` `:174-205` | 감정(price)·매매사례(`salesCase` 값) 이미 분기(`:199`) | 변경 없음(§8) |

**신규 leaf (같은 파일, 순수 함수 — `useEffect` 미러링 없음, 전부 `onChange` 한 번의 patch)**

| 함수 | 용도 | 호출 |
|---|---|---|
| `partNeedsOwnAcqStd(mode)` | 비-actual ⇒ 자기 취득시 기준시가(§3.5) | ⑤ `showAcqStdPrice` · ④ `needLandStd` · ⑧ V-5 · `requiresAcqStdPricePart`(리팩터) |
| `gbPartCauseModePatch(part, cause)` | 파트 원인이 상속·증여·이월과세가 되면 그 파트 모드를 명시 `"actual"`(§3.6) | 원인 라디오 2곳(분리 ON) |
| `gbSeparateOffPartClearPatch()` | 분리 OFF 전환 시 파트 모드·금액·`*SalesCaseValue`·`*DirectExpenses` 비움(§3.9, 엔진 요청 1) | `setSeparate(false)` |
| `gbSeparateOnPatch(asset)` | 분리 ON 전환 시 레거시→명시 파트 모드 승격 + 레거시 감정·매매사례 두 플래그 소거(§3.9) | `setSeparate(true)` · 복원 normalize |
| (조건부) `gbPartModes(asset)` | Q-A2 「전면」 확정 시 분리 OFF 모드를 레거시로 통일해 ④·⑤·⑧이 공유(§4.2) | 결정 후 |

### 7.3 ③ normalize — 추가 1건

- **`calc-wizard-asset-migrate.ts:570-574`(G3 블록) 바로 뒤**에 `gbSeparateOnPatch`의 복원판 1줄: `a.assetKind === "general_building" && a.hasSeperateLandAcquisitionDate && (a.isAppraisalAcquisition || a.isSalesCaseAcquisition)`이면 patch 적용(조건은 함수 안에서 검사). **G3 블록과 같은 위치·같은 이유**(전환을 거치지 않는 저장값 복원은 화면 patch를 못 탄다 — `housing-flag-reset.ts` 머리말 「stale sessionStorage·이력 복원분은 전환을 거치지 않는다」). 파일 731줄 → +3~4줄(§11).
- `normalizeRentalAndSplitFields`(`calc-wizard-asset-migrate-rental-split.ts:357-363`)는 `landAcqMode`·`buildingAcqMode`·`*SalesCaseValue`를 이미 `""` 기본으로 보정한다 — **변경 없음**(신규 필드가 없으므로 stale 가드 신설 불필요 — `feedback_new_asset_field_stale_sessionstorage_guard`는 적용 대상 필드가 없다).
- **추가하지 않는 것(근거 명시)**
  - 분리 **OFF** + explicit 파트 모드 stale의 복원 정규화: 방어선은 ④(엔진 Q-A2)에 있다. OFF 시드(`validation-field-jump-cases-gb.ts`의 `fd` 등 `landAcqMode:"estimated"` + `useEstimatedAcquisition:true`)는 explicit와 레거시가 일치하는 정상 상태라 정규화해도 값이 안 바뀌지만, 바뀌는 입력이 생기면 시드 소거 위험이 있다(memory `feedback_e2e_seed_erased_by_restore_normalization`).
  - 분리 ON + 상속·증여 파트 + 비-actual 모드의 복원 정규화: ⑧ 필드 점프 E2E(`:129-134·160-162`)가 이 상태를 시드로 쓴다 — 지우면 오류가 안 뜬다. 단일 옵션 라디오가 해소 수단(§3.6).

### 7.4 stale 조합 점검표

| 저장 상태 | 화면 | ④ 전송 | ⑧ | 결과 |
|---|---|---|---|---|
| GB·OFF·`isAppraisalAcquisition`(building→GB) | 자산 단위 라디오 「감정가액」 선택됨(§3.3 이후) | `bundledAcquisitionPrice`=감정(엔진 T5) | I3′ 통과/요구 | 정상 |
| GB·**ON**·`isAppraisalAcquisition`(G-3 원 경로) | 파트 라디오: explicit `""`이면 레거시 파생값 `appraisal`이 **선택됨**(§3.2 이후 4종) | (정규화 후) 레거시 소거 | V-7 파트 칸 요구 | 정규화 전: 최상위 `acquisitionMethod:"appraisal"`·`appraisalValue` 0 → ⑩ 400 → **복원 정규화가 닫는다** |
| GB·OFF·explicit `landAcqMode:"appraisal"`(과거 ON→OFF) | 자산 단위 라디오가 레거시를 보여줌(실가) | 엔진 Q-A2: 레거시 통일 | ⑧: **현행 `effectivePartAcqMode`는 explicit를 본다** → 모순(§4.2 경고) | Q-B 결정 필요 |
| GB·ON·상속 토지 + `landAcqMode:"estimated"` | 단일 옵션 라디오(무선택) + ⑧ 오류 | — | V2 차단(`:163`) | 한 번 눌러 해소 |

## §8 ⑥ 사이드바
> 근거: `lib/stores/calc-wizard-store.ts` `computeTransferSummary`(`:337-`)·`lib/stores/transfer-per-asset-summary.ts` — 직접 열람. 원칙(CLAUDE.md): 입력값으로 계산 가능한 항목만 노출, 0원·null 제외, 부분합을 총액으로 오독하게 하지 않는다.

### 8.1 취득가액 합계

| 경우 | 소스 | 감정·매매사례 처리 | 변경 |
|---|---|---|---|
| 별개 취득(일자 다름) 일반건물 | `separateAcqPartsSum`(`transfer-tax-split-acq-mode.ts:174-205`) — `calc-wizard-store.ts:362`·`transfer-per-asset-summary.ts:225·235` | 감정 = `price`(`landAcquisitionPrice`), 매매사례 = `salesCase`(`landSalesCaseValue`) **이미 분기**(`:199`). 환산 파트나 미입력 파트가 있으면 `pending`(부분합 비표시) | **변경 없음** |
| 분리 OFF 자산 단위 | `calc-wizard-store.ts:363-376`(`isSalesCaseAcquisition ? similarSalesValue : useEstimated ? 환산 : fixedAcquisitionPrice`)·`transfer-per-asset-summary.ts` `directAcqRaw` ④⑤(`:229-237`) | 감정 = `fixedAcquisitionPrice`, 매매사례 = `similarSalesValue` | **변경 없음** |
| 분리 ON + **같은 취득일**(일반건물에서 허용 — V-1은 일자 상이를 요구하지 않는다) | `isSeparateAcquisition`(`:224`)이 false → 자산 단위 갈래로 후퇴. `directAcqRaw` ⑤가 「자산 전체 값이 비면 파트 **금액** 합」으로 보정(`:234-237`) | 파트 `*AcquisitionPrice`만 본다 — **매매사례 파트 값(`*SalesCaseValue`)을 안 본다** | ⑤ 보정 조건을 `landSalesCaseValue`·`buildingSalesCaseValue` 양수까지 확장(1줄 — **확인 필요 V-U3**: 이 조합이 실제 도달 가능한 입력인지 화면 실측 안 함). `computeTransferSummary`(`calc-wizard-store.ts:362`)는 `isSeparateAcquisition`만 보고 같은 후퇴를 하지만 **합계는 자산별 행의 합이어야 하므로** Do에서 두 곳이 같은 값을 내는지 anchor로 대조 |

### 8.2 필요경비 (개산공제) — 계산 전 표시

`transfer-per-asset-summary.ts`의 일반건물 계산 전 경로: `dedicatedPreview`(`:429`)는 `a.useEstimatedAcquisition`일 때만 `previewGeneralBuildingEstimated`를 부르고, 공통 개산공제 프리뷰는 `isPlainLumpSumAsset`(`:128-140`)이 **일반건물을 제외**한다. 그리고 필요경비 pending은 `if (expense === 0 && !result && isLumpSumMode(a)) expensePending = true`(`:685`)로 `isLumpSumMode`(`:115-117`)가 **레거시 3플래그만** 본다.

⇒ 일반건물 **파트 모드**가 비-actual이면(레거시 플래그는 false) pending이 서지 않고, `directExpenseRaw`가 파트 자본적지출(`landDirectExpenses`+`buildingDirectExpenses`, `:262-263`)을 필요경비로 **부분합 표시**한다 — 엔진은 감정·매매사례 파트의 자본적지출을 **산입하지 않고 개산공제만** 쓰므로(엔진 §4.1) 사이드바가 계산에 쓰이지 않는 금액을 보여 준다(`feedback_engine_result_display_drift`). *(이 서술은 코드 추적이며 화면 실측은 하지 않았다 — 확인 필요 V-U4.)*

**변경**: `transfer-per-asset-summary.ts` 행 계산에 한 갈래(≈8줄) — 계산 전(`!result`)·일반건물·**어느 파트든 비-actual**이면 `expense = 0`·`expensePending = true`(「계산 후 표시」). 판정은 §3.5의 `partNeedsOwnAcqStd`를 **같은 모드 값**(분리 ON: `effectivePartAcqMode`, 분리 OFF: 레거시 파생)에 적용 — 새 술어를 만들지 않는다. 계산 후에는 기존 `bundledCards.exp`(카드별 필요경비 합 — 개산공제 포함, 엔진 확정값)가 이미 정본이라 **변경 없음**.

### 8.3 변경 없음
`computeTransferSummary`의 `totalSalePrice`·`estimatedTax`·겸용 갈래, 지분 ratio 적용, 양도가액 안분(`computeApportionedSaleMap`) — 이 작업과 무관.

## §9 ⑦ 결과·신고서
### 9.1 양도세 결과뷰 4개 전수 (memory `feedback_transfer_result_view_is_not_one`)

| 결과뷰 | 일반건물 도달? | 근거 | 이번 변경 |
|---|---|---|---|
| `TransferTaxResultView`(단건, `mode:"single"`) | **도달 안 함** | `route.ts:528`이 일반건물 payload를 `mode:"bundled"`(`:622`)로 종결. `TransferTaxResultView.tsx:610` 주석이 「일반건물 일괄은 `BundledAllocationCard`가 종착지」라 명시 | 없음 |
| **`BundledAllocationCard`**(일반건물 일괄, `mode:"bundled"`) + 그 안의 상세명세서·신고서 서식 | **종착지** | 위 `route.ts`; 카드 내부 `GeneralBuilding3WayTable` 마운트(`BundledAllocationCard.tsx:466`) | **아래 9.2** |
| `MultiTransferTaxResultView`(다건) | 일반건물 미지원(엔진 §5 「다건 — GB 미지원」) | — | 없음 |
| `MixedUseResultCard`(겸용) | 무관 | — | 없음 |

⇒ 실제로 고칠 곳은 **`BundledAllocationCard` 계통 한 곳**이다. 화면 실측은 하지 않았다(코드 추적).

### 9.2 거짓 표시를 막는 최소 변경 — Phase A에 포함 (엔진 E-1 선행)

현재 카드는 「환산인가 아닌가」 boolean `usedEstimatedAcquisition`만 안다(`general-building.types.ts:468`). 감정·매매사례 파트는 환산이 아니므로 `false` = 「실거래가」로 읽힌다. Phase A가 그 파트를 만들어 내므로 **A에서 거짓이 새로 도달 가능**해진다:

| # | 위치 | 현행 동작 | 감정·매매사례 파트에서의 거짓 | 조치 |
|---|---|---|---|---|
| D1 | `DetailedStatementGbFormulas.ts:463-470` `isActualPart = partCard?.usedEstimatedAcquisition === false` → `actualPartFormula()` | `displayExp>0`이면 「자산별 양도비 = X (§97① 나목) ※ 실지거래가액 파트라 §163⑥ 개산공제를 적용하지 않습니다.」 | 감정 파트는 **개산공제를 적용**한다(엔진 §4.1) — 개산공제 금액 X를 두고 「적용하지 않는다」고 쓴다 | `isActualPart`를 **`partCard?.acquisitionMode === "actual"`**로. 감정·매매사례는 아래 줄(`:472-482`)의 「취득시 토지기준시가 × 율 = …」 산식으로 떨어진다 — 그 산식은 `gb.estimatedDeduction.landBase ?? gb.acqLandStdTotal`(`:476`)을 쓰는데 비-환산 파트도 취득시 기준시가가 필수 입력(§3.5)이므로 `acqLandStdTotal`이 채워진다 |
| D2 | `GeneralBuilding3WayTable.tsx:38-46` `acqBadge(estimated: boolean)` → `"(환산)" \| "(실거래가)"` | 증축 3-way에서 파트 배지 | 감정·매매사례 파트가 「(실거래가)」로 찍힌다 | 배지 입력을 `acquisitionMode`로: `actual`→「(실거래가)」 · `estimated`→「(환산)」 · `appraisal`→「(감정가액)」 · `salesCase`→「(매매사례가액)」. 카드를 못 찾으면 배지 없음(현행 「거짓 표시 금지」 유지). 건물2 배지는 현행 2종(증축분 모드는 actual·estimated뿐) |
| D3 | `DetailedStatementGbFormulas.ts:337-347`(「사례 31 환산취득가」 분기) | 비-실가 일괄 경로가 아닌 모든 파트의 취득가액 산식을 **「양도가액 × 취득시 기준시가 ÷ 양도시 기준시가」**로 그린다 | 감정·매매사례 파트의 취득가액은 그 곱이 **아니다**(감정가액·매매사례가액 직접값) → 적힌 산식이 적힌 값을 못 만드는 **거짓 등식**(같은 파일 `:233-240` 이월과세 A가 이미 겪은 문제) | 그 분기 앞에 `acquisitionMode ∈ {appraisal, salesCase}` 가드: 산식 대신 `자산별 취득가액 = {값} (감정가액 — 소득세법 §97①1호 나목·영 §176의2③2호)` / `(매매사례가액 — … ③1호)` 한 줄. **혼합 환산(토지 실가 + 건물 환산)의 실가 파트도 같은 거짓 등식이 이미 있는지는 코드 추적상 그렇지만 화면 실측 안 함 — 확인 필요 V-U5.** 실가 파트 가드는 같은 함수에 `actual`도 넣으면 닫힌다 — **엔진 E-1·UI 합의 후 범위 결정**(§12 Q-F) |

- **echo 필드명**: 엔진 설계 §7 엔진 표는 카드에 **`acquisitionMode`** echo(`AssetCardForAggregate`, `general-building.types.ts:468` 근처, 건물 카드 필수·토지 카드도 같은 규약이 일관) 신설을 계획했다 — 본 문서도 같은 이름을 쓴다(E-1). **옛 이력(저장 결과)에는 필드가 없다** → D1~D3 모두 `acquisitionMode === undefined`이면 **현행 동작 유지**(기존 주석 `DetailedStatementGbFormulas.ts:458-461`의 「echo 이전에 저장된 옛 이력」 취급과 같은 규칙 — 표시 회귀 없음).
- **Phase C로 남기는 것(언급만)**: 환산 포함 조합에서 aggregated에 없는 `usedEstimatedAcquisition`으로 분기해 「자산별 실제 거래가액 합계」·「자산별 양도비 합계 — §97① 나목」 소제목이 붙는 문제(`DetailedStatementFormulaBuilders.ts:446-448·573-575`, 계획서 G-4·H-1) — 감정·매매사례 개방과 독립이며 파일도 다르다.

### 9.3 신고서 서식(`FilingFormTableHelpers.ts`)
`estimatedDisplay`(`:386-392`)는 `usedEstimatedAcquisition && estimatedBase !== undefined`일 때만 환산 표시를 쓰고 아니면 **실가 분기(역산)**로 떨어진다. 감정·매매사례 카드는 `usedEstimatedAcquisition:false`이므로 실가 분기를 탄다 — 취득가액은 `양도가액 − 양도차익 − 필요경비` 역산이라 **자기정합은 유지**되지만, 필요경비 칸에 개산공제가 포함된 값이 들어가 「자본적지출·양도비」 행에 개산공제가 섞여 보일 수 있다. **화면·인쇄 실측은 하지 않았다 — 확인 필요 V-U5.** 엔진이 감정·매매사례 카드에 `estimatedBase`/`estimatedDeduction`을 채울지(환산 분기 재사용)가 갈림길이라 엔진 E-1 설계 시 함께 정한다.

### 9.4 파트 「취득가액 산정 방식」 라벨
- 라벨이 **실재하는 곳은 3-way 표 배지 한 곳**(D2)뿐이다. 2-way 일반건물 결과에는 산정방식 라벨이 애초에 없다(`BundledAllocationCard.tsx` 열람 — 상속 평가액 주석 `:281-282`·swap 요약 `:390-394`만). 따라서 **2-way에 라벨을 신설하지 않는다**(범위 밖 기능). 필요하면 별건(§12 Q-G).
- 「입력한 감정가액이 어디에 반영됐나」의 검증 경로: 파트 `취득가액` 숫자(안분 표)와 개산공제 산식(D1 후)이 그것이다.

## §10 E2E
> **전부 코드 추적 기반 예측이다 — Playwright 실행은 하지 않았다**(이 작업은 설계만). Do 후 아래 목록을 `E2E_PORT=<워크트리 포트> npx playwright test <spec>`으로 실행해 확정할 것. 역방향 grep은 필드명·testid·라벨로 했고 `head`로 자르지 않았다.

### 10.1 신규 spec 1건 — `e2e/general-building-part-appraisal.spec.ts`

시드: `general-building-separate-acquisition.spec.ts`의 `seedForm()` 형태(분리 ON·토지 1999-05-24·건물 2015-03-01·양도 20억)를 그대로 쓰고 모드만 바꾼다. 양도가액은 **자산 필드 `actualSalePrice`**에 둔다(그 spec 주석 「단일 모드 양도가액 진실은 자산 필드」).

| T | 내용 | 단언 |
|---|---|---|
| **T1** | 토지 **실가** + 건물 **감정** — 건물 감정가액 입력 후 계산 | `page.waitForRequest(url includes "/api/calc/transfer")`의 `postDataJSON().generalBuildingValuation`: `landAcqMode==="actual"` · `buildingAcqMode==="appraisal"` · `landAcquisitionPrice===300000000` · `buildingAcquisitionPrice===<입력값>` · **`landSalesCaseValue`·`buildingSalesCaseValue` 미존재**(stale 가드 R-2) · `acquisitionBuildingStdPrice===<gbAcqBuildingValue>`. + 결과 「신고서 양식」 렌더, 「…입력하세요」 오류 0건 |
| T2 | 라디오 구성 | `gb-part-acq-mode-land` 안 `radio` 4개, 이름 부분일치 `실거래가·환산취득가·감정가액·매매사례가액`. 토지 원인 「상속」 선택 → 같은 그룹 `radio` 1개(실거래가) + `gb-deduction-only-notice` 없음 |
| T3 | 개산공제 base 칸 | 건물 「감정가액」 선택 시 `[data-gb-stdprice="acq"]` 노출(§3.5 dead-end 방지) — 기존 T2(`separate-acquisition.spec.ts`)와 같은 셀렉터 |
| T4 | 분리 OFF 자산 단위 감정 | 취득 카드 라디오(`name^="acqBasisMode"][value="appraisal"]`) → `fixed-acquisition-price` 입력 → body `generalBuildingValuation.bundledAcquisitionPrice === fixedAcquisitionPrice`(엔진 T5, A1 머지 후 유효). 증축 토글 ON → 감정·매매사례 옵션 `disabled` |
| T5 | OFF 전환 정리 | ON에서 파트 값 입력 → 토글 OFF → 재ON: 파트 금액·모드가 비어 있음(`gbSeparateOffPartClearPatch`) |

### 10.2 깨질 가능성이 있는 기존 테스트 (역방향 grep 결과)

| # | 대상 | 위험 | 판단 |
|---|---|---|---|
| 1 | `e2e/transfer-expropriation-general-building.spec.ts:32·58` `getByRole("radio",{name:"매매"}).first()` | 신규 「매매사례가액」 radio가 이름에 부분 일치. `.first()`라 DOM상 앞선 취득원인 「매매」가 잡히면 통과 | **통과 예상 — 확인 필요 V-U6.** 안전하게 하려면 `exact: true`로 교체 권장(같은 유형 `transfer-gb-designated-purchase-route.spec.ts:44`는 이미 `exact`) |
| 2 | `e2e/_helpers/validation-field-jump-cases-gb.ts:129·133·160·224` (필드 `landAcqMode`·`buildingAcqMode` — 상속·증여·신축 환산 차단) | 앵커 `FieldCard field="landAcqMode"`가 사라지면 점프 실패 | **§3.2·§3.6 「앵커 항상 렌더」 규칙으로 보존.** 이 시드를 지우는 복원 정규화를 **추가하지 않는다**(§7.3) |
| 3 | `e2e/transfer-dead-end-defects.spec.ts` GB G3 케이스(`:195-215` — `acqBasisMode`·`gbUnifiedAcquisitionCause-`) | radio `name`·`value` 변경 시 파손 | **`name="acqBasisMode"`·`value=actual\|estimated\|appraisal\|sales_case`·`gbUnifiedAcquisitionCause-` 유지**(§3.3) → 통과 예상. 「상속 카드에 산정방식 라디오가 없다」(`toHaveCount(0)`) 전제도 불변 |
| 4 | `e2e/general-building-separate-acquisition.spec.ts` T1(`:91-100` 「취득가액 산정 방식」 exact 0건)·T2(`[data-gb-stdprice="acq"]`)·T3 | 라벨 exact 매칭·섹션 게이트 | 통과 예상. `showAcqStdPrice`는 환산/증축/부담부/`needsGbActualAcqStdPrice`를 **유지하고 비-actual 파트를 추가**하는 확장이라 기존 `true`는 그대로 `true` |
| 5 | `e2e/general-building-extension-4mode.spec.ts:101·163-164` | `getByText("환산취득가").first()`·파트 라벨 | 통과 예상 |
| 6 | `e2e/transfer-sidebar-asset-kind-amounts.spec.ts:26-29`·`transfer-sidebar-estimated-preview.spec.ts:31-34`(일반건물 + `useEstimatedAcquisition:true`, 계산 **전** 프리뷰 `not.toContain("계산 후 표시")`) | §8.2 신규 pending 갈래가 환산 프리뷰를 가로채면 파손 | **갈래를 `dedicatedPreview` 분기 뒤에 둔다**(체인 순서: 프리뷰가 이기면 프리뷰, 못 만들면 pending) — 환산 전체 시드는 `dedicatedPreview`가 값을 만든다. 순서 오류가 곧 파손이므로 Do에서 두 spec을 **반드시 실행** |
| 7 | vitest `__tests__/calc/gb-separate-validate.anchor.test.ts:185-195` A-5 | UI 술어 `showAcqStdPrice`를 **테스트 안에 복제**(`=== "estimated"` 식) — 술어가 바뀌어도 이 복제가 통과해 **가드가 거짓**이 된다 | **갱신 필요**: 복제를 `partNeedsOwnAcqStd` import로 교체하고 감정·매매사례 행 추가 |
| 8 | vitest `gb-inheritance-gift-part-axis.anchor.test.ts:97`(감정 상속 파트 차단) 등 V2 anchor | validate 변경 | **변경 없음**(R7) — 통과 유지가 회귀 가드 |
| 9 | `e2e/split-mode-gating.spec.ts`(주택 `part-acq-mode-land` testid) | testid 충돌 | GB는 `gb-part-acq-mode-*` — 충돌 없음 |
| 10 | 입주권 `right-to-move-in-asset-kind-axis.spec.ts:181-182` `getByText("매매사례가액",{exact:true}).toHaveCount(0)` | 같은 페이지에 일반건물 자산이 있으면 오탐 | 해당 spec은 일반건물 자산 없음(시드 `right_to_move_in` 단일) — 영향 없음 |

### 10.3 vitest 추가 (UI 쪽 순수 leaf — 엔진 anchor와 별개)
- `partNeedsOwnAcqStd` · `gbPartCauseModePatch` · `gbSeparateOffPartClearPatch` · `gbSeparateOnPatch`(레거시 → 명시 승격 + 플래그 소거, `useEstimatedAcquisition` 불변) 단위.
- ⑧ R1·R2·R3·R5·R8·R9 대조 — **지정값(문구 prefix·필드명) ±0**, 범위 단언 금지. 부정형(통과해야 하는 조합)에는 긍정 짝(`feedback_negative_anchor_needs_positive_twin`): 예 R8은 「이월과세 + 실거래가 → null」 짝.
- ⑧ ↔ ④ 술어 대조: 같은 asset으로 `needLandStd`(④)와 V-5(⑧)가 같은 결론인지 표 기반 테스트(`gb-separate-validate` A-5 갱신과 통합).
- `separateAcqPartsSum` 감정/매매사례 합(이미 있는 로직의 회귀 고정 — 변경 없음 확인용).

## §11 800줄 정책
정책: 트리거 **800** · 착지 목표 **≤700**(루트 CLAUDE.md). 줄 수는 이 워크트리에서 `wc -l`로 직접 측정했다(2026-10-06). 증가분은 **설계 기준 추정**이며 구현 후 재측정한다.

| 파일 | 현재 | 예상 증가 | 예상 | 판단 |
|---|---|---|---|---|
| `components/calc/transfer/GeneralBuildingAcquisitionCardsParts.tsx` | 248 | +55~70 | ~310 | 여유 |
| `components/calc/transfer/GeneralBuildingAcquisitionCards.tsx` | 693 | +25~35 | **~723** | 트리거 안(<750). ≥700 착지 목표는 이미 초과 상태라 이번 증가로 **750 근접 시** `showPenaltyBadge` useMemo(`:126-150`)와 원인 patch 조립을 `…Parts.tsx`로 이동(순수 함수·훅 아님 — `static-components` 규칙 무관, 모듈 스코프 함수) |
| `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` | 521 | +0~10(일반건물 분기 −16·`disabled` 로직 +10) | ~520 | 여유 |
| `components/calc/transfer/CompanionAcqAmountSection.tsx` | 177 | +35~45 | ~220 | 여유 |
| `components/calc/transfer/GeneralBuildingBlock.tsx` | 710 | +4 | ~714 | 이미 ≥700. 이번은 4줄이라 분리 보류, **다음 기능 건에서 ≥750 도달 시 기회주의적 분리** |
| `components/calc/transfer/asset-sections/AssetSectionExpense.tsx` | 135 | +12~15 | ~150 | 여유 |
| `components/calc/transfer/GbDeductionOnlyNotice.tsx` | (신규) | ~30 | 30 | 신규 |
| `lib/calc/transfer-tax-split-acq-mode.ts` | 521 | +60~80(leaf 5개·JSDoc) | ~595 | 여유 |
| `lib/calc/transfer-tax-validate-gb.ts` | 707 | +35~40(엔진 설계는 +28 추정 → 735) | **~745** | ⚠️ **위험구간 근접 — 분리 계획 확정**: 신규 R2·R8·R9를 `lib/calc/transfer-tax-validate-gb-required.ts`(현재 **92줄**, 이미 I3′·D1 같은 gb 요구 규칙 함수를 둔 파일 — 같은 자연 이음매)의 새 함수 `validateGbPartAcqModes(asset, label, landMode, buildingMode)`(~45줄)로 두고 `validate-gb.ts`는 호출 1~2줄만 늘린다 → ~715 |
| `lib/calc/transfer-tax-api-gb.ts` | 681 | +20~30(엔진 추정 +29 → ~710) | ~706 | 엔진 시니어 편집분. ≥700이지만 <750 |
| `lib/stores/transfer-per-asset-summary.ts` | 721 | +8~12 | ~733 | <750. 이미 ≥700 — 다음 건에서 분리 검토 |
| `lib/stores/calc-wizard-asset-migrate.ts` | 731 | +3~4 | ~735 | <750 |
| `components/calc/results/transfer/DetailedStatementGbFormulas.ts` | 494 | +15~25 | ~519 | 여유 |
| `components/calc/results/transfer/GeneralBuilding3WayTable.tsx` | 224 | +8~12 | ~236 | 여유 |
| `lib/api/transfer-tax-building-schemas.ts` | 696 | 엔진 시니어 +24 | ~720 | 엔진 몫 |

- **이번 변경으로 800 트리거를 넘는 파일은 없다.** ≥750 도달 가능 파일은 `validate-gb.ts` 1건이고 위 분리 계획이 선확정이다(「기회주의적 분리: 이미 연 파일이 ≥750 위험구간이면 그 김에」).
- 분리 시 `export` 보존: `validate-gb.ts` 쪽에서 이동 함수를 **재export하지 않는다**(외부 import 사이트가 없는 내부 함수 — `feedback_800line_split_export_preservation`. 이동 전 grep으로 호출처 확인할 것).

## §12 미결·확인 필요
### 12.1 엔진 설계와 조정 (엔진 결정을 따르되 차이가 있는 곳)

| # | 엔진 설계 | 본 UI 설계 | 사유 |
|---|---|---|---|
| **C-1** | 비-actual 파트의 취득시 기준시가 노출·요구 술어로 **`requiresAcqStdPricePart(part, flags, ctx)`** 공유(엔진 §1.3-2) | **leaf `partNeedsOwnAcqStd(mode)`**(= 그 함수 1절 `mode !== "actual"`)를 뽑아 ⑤·④·⑧·⑫와 `requiresAcqStdPricePart` 자신이 공유 | `requiresAcqStdPricePart`는 actual일 때 `needsApportionRatio`(`transfer-tax-split-acq-mode.ts:385-413`)까지 본다 — 일반건물 분리 OFF 실가 일괄 경로에서 참이 되면 `showAcqStdPrice`가 항상 열려 시점별 런처가 숨는다(`GeneralBuildingBlock.tsx:228-233` 주석의 CI 회귀와 같은 모양, **재현 미실측**). 일반건물 actual 안분 필요는 `needsGbActualAcqStdPrice`가 정본. `mode !== "actual"` 식이 한 곳에 있다는 점은 동일 |
| **C-2** | 이월과세 파트: UI **모드 라디오 숨김**, ⑧ 감정·매매사례 차단(엔진 §5) | 숨기되 **유효 모드가 actual이 아니면 단일 옵션(실거래가) 라디오 표시**, ⑧ R8 차단은 엔진안 그대로 | 차단한 값을 고칠 칸이 없으면 막다른 길(`feedback_ui_gate_removes_sole_input_path`). 또한 현행에서 이월과세 파트도 「환산취득가」를 고를 수 있었고 ⑧이 막지 않는다 — 숨김은 **그 선택 경로를 제거하는 동작 변경**이다(엔진 §5의 「파트 모드가 무의미」 판단에 근거, V-14 미확인) → **사용자 확인 Q-A** |
| **C-3** | 요청 1: 분리 OFF 전환 시 파트 값 정리 | 그대로 + **ON 전환 patch(`gbSeparateOnPatch`)·복원 정규화 추가**(§3.9·§7.3) | 엔진 요청은 OFF 방향만 다룬다. G-3의 실체(분리 ON에서 레거시 감정·매매사례 플래그를 끌 수단 없음 → ④ 최상위 `acquisitionMethod:"appraisal"` → ⑩ 400)는 ON 방향이다 |
| **C-4** | 증축 × 자산 단위 감정·매매사례 **차단**(⑧+⑫ refine) | 차단 + UI는 해당 옵션 **`disabled`**(숨김 아님, §3.8) | 숨기면 이미 고른 값이 무선택으로 보이는 G-3 모양 |
| **C-5** | 카드 `acquisitionMode` echo는 §114의2 판정 목적으로 계획 | UI도 같은 echo를 소비(D1·D2·D3, §9.2) — **A1 포함 확정 요청**(E-1) | echo 없이는 결과·상세명세서가 감정 파트를 실거래가로 표시 |
| **C-6** | ④ `partModePayload`는 파트 가격을 모드 무관 전송 | R-2 게이트 **권고**(필수 아님) | 주택 ④와 대칭이 아니지만 엔진이 모드별로 읽는 필드만 소비 — 위험 낮음 |
| C-7 | 엔진 §7 ⑧ 참고 목록(V-5 게이트·V-7·I3′·증축 차단·이월과세 차단) | §4 R1·R2·R3·R5·R8·R9로 모두 반영 | 일치 |

### 12.2 사용자 결정 필요 (Q)

| # | 질문 | 비고 |
|---|---|---|
| **Q-A** | 이월과세 파트에서 「환산취득가」 선택 경로를 제거해도 되는가(C-2) | 엔진 V-14(개산공제 잔존 여부) 확인 전에는 보수적으로 현행 유지 가능 — 그 경우 이월과세 옵션 = {actual, estimated}로 남기고 감정·매매사례만 비노출 |
| **Q-B** | 엔진 Q-A2(분리 OFF에서 ④가 explicit 무시·레거시 통일, 「전면」 vs 「한정」)가 확정되면 `gbPartModes(asset)` leaf를 도입해 ⑤·④·⑧이 공유(§4.2) | 「전면」이면 도입, 「한정」이면 불필요. **결정 전 구현 금지** — ⑤·⑧이 explicit를 보고 ④만 레거시를 보면 UI 통과↔전송 모순 |
| **Q-C** | 일반건물 자산 단위 매매사례에 RTMS 자동조회를 열 것인가 | 현재 `SalesCaseSection`의 RTMS는 `aptName`·전용면적 기준(집합건물). 일반건물(토지+건물) 의미 불확실 → **숨김**으로 설계 |
| **Q-D** | 「건물 신축(자가건축)」 파트에 매매사례가액 옵션을 노출할 것인가 | 신축 자가건축물은 매매사례가 성립하기 어렵지만 ⑧이 막지 않고 주택 신축 경로도 필터하지 않아 대칭 유지로 설계. 필터하려면 ⑧ 규칙 신설이 필요 — 「새 규칙 발명 금지」와 충돌하므로 결정 요청 |
| **Q-E** | `transfer-tax-api-gb.ts` 공동 수정 분담 | 같은 파일을 엔진·UI 시니어가 동시에 고치면 충돌 — 엔진 §7 ④ 행을 **정본**으로 두고 UI는 §5 T1~T8을 엔진 시니어 PR에 위임하는 것을 제안 |
| **Q-F** | D3(취득가액 산식 거짓 등식) 가드 범위: 감정·매매사례만 vs **실가 파트 포함**(혼합 환산의 기존 거짓 등식도 닫음 — 계획서 Phase C와 겹침) | Phase C 흡수 여부 |
| **Q-G** | 2-way 일반건물 결과에 산정방식 라벨을 신설할 것인가 | 현재 3-way 표 배지만 있다. 요청 범위 밖 → 별건 |
| **Q-H** | 분리 OFF 전환 시 파트 값 소거(`gbSeparateOffPartClearPatch`)에 확인 대화상자를 둘 것인가 | 입력 손실이 있다(memory `feedback_dialog_data_discard_confirm`). 설계 기본값은 **즉시 소거**(엔진 요청 그대로) — 토글만 눌러 되돌리는 흔한 조작이라 대화상자는 과하다는 판단이나 사용자 확인 |

### 12.3 확인 필요 (V-U — 미검증, 추정으로 단정하지 않음)

| # | 내용 |
|---|---|
| V-U1 | ⑬ `callTransferTaxAPI`가 `generalBuildingValuation` 서브객체를 통째로 싣는다는 점(엔진 §7 ⑬ 행 「변경 없음」)을 UI는 직접 열람하지 않았다 — Do에서 Network 탭 body로 확인 |
| V-U2 | G-3 막힘이 서버 ⑩ refine인지 화면 실측 안 함(코드 추적만) — Do 전 기준선으로 `building`(감정)→일반건물(분리 ON)→계산 1회 재현 권장 |
| V-U3 | 분리 ON + **같은 취득일** 일반건물이 실제 입력으로 도달 가능한지, 그때 사이드바가 매매사례 파트 합을 놓치는지(§8.1) |
| V-U4 | 사이드바가 감정 파트의 자본적지출을 필요경비로 부분합 표시하는지(§8.2 코드 추적) |
| V-U5 | 상세명세서·신고서 서식에서 감정·매매사례 파트의 취득가액 산식·필요경비 칸 실제 표시(§9.2 D3·§9.3) — 혼합 환산(실가+환산) 실가 파트의 기존 표시 포함 |
| V-U6 | `transfer-expropriation-general-building.spec.ts:32·58`의 `getByRole("radio",{name:"매매"}).first()`가 신규 「매매사례가액」 라디오 때문에 흔들리는지(§10.2 #1) |
| V-U7 | **형제 경로**: 주택 split(분리 ON)에도 같은 stale 레거시 감정 플래그 → ④ 최상위 `acquisitionMethod` 문제가 있는지 — 본 작업 범위 밖, 발견만 기록 |
| V-U8 | 일반건물 자산 단위에서 `standardPriceAtAcq`(단일) 잔존값이 ④ 최상위 `standardPriceAtAcquisition`(`transfer-tax-api.ts:349-376`)으로 GB 경로에 소비되는지 — 엔진 §6 3단계 서술로는 소비되지 않으나 미실측 |
| V-U9 | `calc-wizard-store.ts:362`(합계)와 `transfer-per-asset-summary.ts`(행)가 일반건물 감정·매매사례에서 같은 값을 내는지 anchor 대조(§8.1) |
| V-U10 | 엔진 V-13(용도변경×최초공시 전 취득×감정 개산공제 base)·V-14(이월과세 개산공제 잔존)·V-15(부담부증여 stale 플래그)·V-17(저장 이력)은 엔진 설계서 §9 소관 — UI는 해당 조합에서 새 입력칸을 만들지 않았다 |
| V-U11 | 감정가액 요건(영 §176의2③2호: 감정평가법인등 2곳 이상·기준일 3개월 이내, 기준시가 10억 이하는 1곳)·매매사례 요건(1호)은 **주택 경로도 검증하지 않는다**(엔진 D-2 확정) — 따라서 hint는 요건 서술이 아니라 「조문 인용」만 한다. 요건 안내문을 추가할지는 별건 |

### 12.4 자가 점검 (3대 정책 + DoD)

| 정책 | 결과 |
|---|---|
| ① `useEffect → store` 미러링 금지 | **준수** — 모든 동기화는 `onChange` 한 번의 patch(§3.6·§3.9). 새 `useEffect` 없음. 기존 `CompanionAcqPurchaseBlock`의 래치 effect 2건(`:177`·`:192`, 의도적 예외로 주석 명시)은 건드리지 않는다 |
| ② 자동 안분 fallback 금지 | **준수** — 분리 ON 전환 시 자산 단위 총액을 파트로 **옮기지 않는다**(§3.9). 분리 OFF의 일괄 감정·매매사례 총액 안분은 엔진 법정 안분(§100② 본문, 사용자가 명시 입력)이며 PHD 예외 아님. 미입력은 ⑧이 차단(R1·R2·R5) |
| ③ validation 8번째 동기화 | **준수(설계)** — §4.2 표: ⑤·④·⑧·⑫가 같은 leaf(`partNeedsOwnAcqStd`)·같은 모드 파생을 쓴다. **분리 OFF 유효 모드는 Q-B 결정 전까지 미확정 위험으로 명시** |

| 14지점 | 담당 | 상태 |
|---|---|---|
| ① 타입 · ② initial | UI | 변경 없음(§7.1) |
| ③ normalize | UI | 추가 1건(§7.3) |
| ④ API 변환 | 엔진(+UI 요구 T1~T8) | §5 |
| ⑤ UI | UI | §3 |
| ⑥ 사이드바 | UI | §8 |
| ⑦ 결과 | UI(+엔진 E-1) | §9 |
| ⑧ validate | UI | §4 |
| ⑨~⑭ | 엔진 | E-2(⑫ 필드)·E-3(⑩ 재검토)·⑭ 변경 없음 |

**수동 확인(브라우저)·Playwright·vitest·tsc는 이 작업에서 수행하지 않았다**(설계 문서만 작성, 소스 미수정).

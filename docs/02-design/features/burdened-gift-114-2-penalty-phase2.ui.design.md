# §114조의2 Phase 2 — 증축 + general_building · UI 설계

> Plan 참조: `docs/00-pm/burdened-gift-114-2-penalty-phase2.plan.md`
> 엔진 설계: `docs/02-design/features/burdened-gift-114-2-penalty-phase2.engine.design.md`
> Phase 1 UI 설계: `docs/02-design/features/burdened-gift-114-2-penalty.ui.design.md`
> 작성일: 2026-06-21
> 담당: inheritance-gift-tax-ui-senior (증여세 ⑤⑦) + transfer-tax-ui-senior (양도세 ⑤⑦)
> 법령 검증: KoreanLaw MCP MST 285523 (소득세법 2026-04-21 시행) §114조의2 직접 확인
>            KoreanLaw MCP MST 286211 (소득세법 시행령 2026-05-22 시행) §176의2②2호 직접 확인

---

## 0. 한 줄 요약

**Feature A — 증축**: 증여 탭 `BurdenedGiftValuationModeSection.tsx`의 extension RadioCard에서
`disabled:true` 제거 + `extensionFloorArea` DecimalInput + `extensionStdPriceAtAcquisition`
CurrencyInput 추가. 양도세 탭 `SelfBuiltSection.tsx`에도 동일 1필드 CurrencyInput 추가.
결과 카드 라벨을 신축/증축 분기로 표시(엔진 echo 또는 중립 통일, 아래 §7 참조).

**Feature B — general_building 증축 케이스 33 게이트 보완**: UI 추가 없음.
`GeneralBuildingBlock.tsx`의 증축 섹션에 **`extensionFloorArea85`**(§114조의2 85㎡ 게이트 전용
바닥면적) DecimalInput 추가. 기존 `extensionArea`(연면적 정보용)와 명시 구분.
부담부증여 시 증축 정보 섹션을 숨기던 `!isBurdenedGift` 게이트를 §114조의2 발동 가능
자가증축(newConstruction) 증축 케이스에 한해 재노출.

---

## 1. 법령 근거 (KoreanLaw MCP 직접 확인 — 추정 없음)

### 소득세법 §114조의2 (MST 285523, 2026-04-21 시행)

```
① 거주자가 건물을 신축 또는 증축(증축의 경우 바닥면적 합계가 85제곱미터를 초과하는
  경우에 한정한다)하고 그 건물의 취득일 또는 증축일부터 5년 이내에 해당 건물을 양도하는
  경우로서 제97조제1항제1호나목에 따른 감정가액 또는 환산취득가액을 그 취득가액으로 하는
  경우에는 해당 건물의 감정가액(증축의 경우 증축한 부분에 한정한다) 또는 환산취득가액
  (증축의 경우 증축한 부분에 한정한다)의 100분의 5에 해당하는 금액을
  제92조제3항제2호에 따른 양도소득 결정세액에 더한다.
② 제1항은 제92조제3항제1호에 따른 양도소득 산출세액이 없는 경우에도 적용한다.
```

### UI 설계에 직결되는 법문 확정 사항

| 항목 | 판정 | UI 영향 |
|---|---|---|
| 신축 = 건물 전체 환산취득가 × 5% | 확정 | Phase 1 기존 — 변경 없음 |
| 증축 = **증축한 부분에 한정**한 환산취득가 × 5% | 확정 (법문 괄호 직접 명시) | 증축부분 기준시가 별도 입력 위젯 필요 |
| 증축 게이트: 바닥면적 합계 **85㎡ 초과** | 확정 (법문 괄호 직접 명시) | `extensionFloorArea85` DecimalInput 필수 |
| 증축 기산일: **증축일**부터 5년 | 확정 (법문 "취득일 또는 증축일") | 기존 `constructionDate` = 증축일 겸용 — 신규 아님 |
| 대상: **감정가액·환산취득가액**만 (§97①1호나목) | 확정 | K-4 실지 시 위젯 미노출 유지 (Phase 1 동일) |
| ② 산출세액 0이어도 부과 | 확정 | 결과 Row는 `penaltyTax > 0` 시 항상 표시 |
| 증축 2020-01-01 시행일 게이트 | **현행 구현 `rate-calc.ts:68` 값 신뢰** — 연혁 API 부칙 조회 미응답. "확인 필요" | UI 직접 영향 없음. 엔진 게이트 자동 처리 |

---

## 2. Phase 2 UI 신규 작업 범위

### Feature A — 증축(extension) · 양 탭

| 지점 | 탭 | 파일 | 작업 |
|---|---|---|---|
| ⑤ UI 위젯 | 증여세 | `BurdenedGiftValuationModeSection.tsx` | extension RadioCard `disabled:true` 제거 + 증축 조건부 입력 2위젯 추가 |
| ⑤ UI 위젯 | 양도세 | `SelfBuiltSection.tsx` | extension 시 `extensionStdPriceAtAcquisition` CurrencyInput 추가 (1필드) |
| ① 타입 | 증여세 | `inheritance-gift-estate.types.ts` | `extensionStdPriceAtAcquisition?: number` 추가 |
| ① 타입 | 양도세 | `calc-wizard-asset.ts` | `extensionStdPriceAtAcquisition: string` 추가 |
| ② initial | 양도세 | `calc-wizard-asset-factory.ts` · `calc-wizard-store.ts` (2곳) | `extensionStdPriceAtAcquisition: ''` |
| ② hasData | 증여세 | `BurdenedGiftTransferSection.tsx` | extensionFloorArea·extensionStdPriceAtAcquisition OR 추가 |
| ③ normalize | 양도세 | `calc-wizard-migration.ts` | `extensionStdPriceAtAcquisition: form.extensionStdPriceAtAcquisition ?? ''` |
| ④⑬ API | 증여세 | `gift-burdened-transfer-api.ts` | extension 게이트 시 2필드 명시 전송 |
| ④⑬ API | 양도세 | `transfer-tax-api.ts` | extension 게이트 시 `parseAmount(extensionStdPriceAtAcquisition)` 전송 |
| ⑦ 결과 카드 | 양 탭 공용 | `BurdenedTransferTaxResultCard.tsx:139` | 라벨 분기 (신축/증축) — §7 참조 |
| ⑧ validate | 증여세 | `gift-tax-form-shared.tsx:342` | extension + isSelfBuilt 시 두 필드 필수 차단 |
| ⑧ validate | 양도세 | `transfer-tax-validate-asset.ts:623-631` (기존 "6) 신축·증축" 블록) | 기존 블록에 `extensionStdPriceAtAcquisition > 0` 필수 차단 **1줄 추가**(부담부증여 게이트 §16 결정 연동, §8.2 참조). ※ `transfer-tax-validate.ts` 아님 |
| ⑨⑫ Zod | 양 탭 공유 | `transfer-tax-schema.ts:178` 옆 | `extensionStdPriceAtAcquisition: z.number().nonnegative().optional()` |
| ⑭ Route | 양 탭 공유 | `app/api/calc/transfer/route.ts:271` 직후 | `extensionStdPriceAtAcquisition: data.extensionStdPriceAtAcquisition` 명시 추가 |

**엔진 측 A-2·A-3(burdened-gift-apportionment.ts · transfer-tax-burdened-gift-step.ts) 작업은 엔진 시니어 담당.**

### Feature B — general_building 증축 케이스 33 · 양도세 탭

| 지점 | 파일 | 작업 |
|---|---|---|
| ⑤ UI 위젯 추가 | `GeneralBuildingBlock.tsx:402` | **게이트 경로 §16 결정 연동(§5.4 모순 박스)**: (b)권장=비-부담부 case 33 경로 — 기존 증축 섹션(`!isBurdenedGift`) 내 자가증축(`gbExtensionAcquisitionCause==="newConstruction"`) 분기에 `gbExtensionFloorArea85` DecimalInput 신설. ~~`isBurdenedGift` 게이트~~는 데이터 도달 불가(토글·라디오 자체가 부담부증여서 숨김) |
| ① AssetForm | `calc-wizard-asset.ts` | `gbExtensionFloorArea85: string` 추가 |
| ② initial | `calc-wizard-asset-factory.ts` · `calc-wizard-store.ts` (2곳) | `gbExtensionFloorArea85: ''` |
| ③ normalize | `calc-wizard-migration.ts` | `gbExtensionFloorArea85: form.gbExtensionFloorArea85 ?? ''` |
| ④⑬ API | `transfer-tax-api-helpers.ts` `buildExtensionInfo` | base 객체에 `...(extensionFloorArea85 ? { extensionFloorArea85 } : {})` 추가 |
| ⑧ validate | `transfer-tax-validate.ts` | general_building 증축 + `extensionAcquisitionCause==="newConstruction"` 시 `gbExtensionFloorArea85>0` 안내 |
| 엔진 B-2(1) | 타입 추가 | `general-building-valuation.ts` `extensionInfo` 인라인 타입 + `AssetCardForAggregate` | **엔진 시니어 담당** |
| 엔진 B-2(2) | route helper | `general-building-route-helper.ts:124-127` card→item 매핑 | **엔진 시니어 담당** |
| 엔진 B-2(3) | 건물2 카드 | `general-building-extension.ts:344-361` | **엔진 시니어 담당** — 아래 명칭 매핑 박스 참조 |

> **★ 명칭 매핑(critical) — `extensionFloorArea85`(UI/API명) → `card.extensionFloorArea`(엔진 penalty 읽는 필드명)**:
> 실측 확인 결과 가산세 함수 `calculateBuildingPenalty`(`transfer-tax-rate-calc.ts:67-69`)는
> card의 `input.buildingType === "extension"`과 `input.extensionFloorArea`를 읽는다. 그러나 현행
> `general-building-extension.ts:344-361`의 건물2 카드 push는 `isSelfBuilt`·`buildingAcquisitionCause`만
> 설정하고 **`buildingType:"extension"`도 `extensionFloorArea`도 설정하지 않는다** → `buildingType` undefined로
> 신축 분기 처리되어 85㎡ 게이트(`:67-69`) 미진입 → 모든 증축 면적이 가산세 오발동(C-B2).
> **fix 책임·단일 매핑 지점**: 건물2 카드 push(`general-building-extension.ts:344`)에서
> `buildingType: "extension"`과 `extensionFloorArea: <extensionInfo.extensionFloorArea85에서 온 값>`을
> **동시 설정**한다. `extensionFloorArea85`(API명) → `card.extensionFloorArea`(엔진명) 매핑은
> 이 단일 지점에서 일어난다(route helper에서 extensionInfo를 받아 카드로 매핑하는 경로 확인 필요 —
> §4 Feature B ⑭ 행). 누락 시 fix 후에도 85㎡ 게이트 미동작.
> **grep 자가점검 추가 대상**: 건물2 카드 push 블록에 `buildingType`·`extensionFloorArea` **동시 존재** 확인.

**증여세 탭 general_building 카테고리 신설(Plan D-1)**: 대규모(14지점 + enum 신설 + UI variant) → 별도 PR·설계 문서. 본 Phase 2 SCOPE OUT.

---

## 3. 케이스 매트릭스 (법령 본문·단서·각호 전수)

### Feature A — 증축 케이스 (양 탭)

| # | 시나리오 | 탭 | 취득방식 | 신축/증축 | UI 노출 | 발동 | base |
|---|---|---|---|---|---|---|---|
| C-A1 | K-5 + 증축 + extensionFloorArea>85 + 5년 이내 | 양 탭 (부담부K-5) | K-5 환산 | 증축 | **위젯 노출·활성** | **발동** | 증축부분 환산취득가 × 5% |
| C-A2 | K-5 + 증축 + extensionFloorArea=85 (경계값) | 양 탭 | K-5 환산 | 증축 | 위젯 노출 | **미발동** | — (85 ≤ 85 게이트) |
| C-A3 | K-5 + 증축 + extensionFloorArea>85 + 5년 초과 | 양 탭 | K-5 환산 | 증축 | 위젯 노출 | **미발동** | — (5년 게이트) |
| C-A4 | K-5 + 증축 + transferDate < 2020-01-01 | 양 탭 | K-5 환산 | 증축 | 위젯 노출 | **미발동** | — (2020 게이트) |
| C-A5 | K-5 + 신축 회귀 (Phase 1) | 양 탭 | K-5 환산 | 신축 | 위젯 노출(Phase 1 기존) | **발동(회귀)** | 건물 전체 환산취득가 × 5% |
| C-A6 | K-4 실지 + 증축 | 양 탭 | K-4 실지 | 증축 | **위젯 미노출** (isConverted=false) | **미발동** | — (§97①가목) |
| C-A7 | 증여세 탭 + 증축 + isSelfBuilt 미입력(OFF) | 증여세 | K-5 환산 | 증축 | disabled 해제·토글 OFF | 미발동 | — |
| C-A8 | 증여세/양도세 탭 + 증축 + extensionStdPriceAtAcquisition 미입력 | 양 탭 | K-5 환산 | 증축 | 위젯 노출 | **validate 차단** | — (⑧ 필수) |

> **C-A1 "양 탭" 주의**: 엔진 설계의 정정 반영 — Feature A 엔진 수정은 **부담부증여 K-5 경로
> (`runBurdenedGiftStep`)에만 적용**된다. 양도세 단독(비-부담부) 자가건축 증축의 K-5 경로에서
> 증축부분 base 분리 여부는 본 Phase 2 SCOPE OUT으로 결정되지 않는 한 과대 부과 잔존. 결정 필요.
> UI는 양도세 탭의 SelfBuiltSection에 `extensionStdPriceAtAcquisition` 입력 위젯을 추가하되,
> 비-부담부 경로에서 해당 값이 엔진에 도달하더라도 SCOPE OUT 상태이면 numeric 영향이 없음 — 과대 부과 잔존.
> "확인 필요": 비-부담부 경로 포함 여부를 Do 전 확정.

### Feature B — general_building 케이스 33 (양도세 탭)

| # | 시나리오 | extensionFloorArea85 | transferDate | 발동(fix 후) |
|---|---|---|---|---|
| C-B1 | general_building 증축 자가건축 + extensionFloorArea85>85 + 5년 이내 | >85 | >=2020-01-01 | **발동** |
| C-B2 | general_building 증축 자가건축 + extensionFloorArea85=80 | 80 | >=2020-01-01 | **미발동** (85㎡ 게이트 fix) |
| C-B3 | general_building 증축 자가건축 + extensionFloorArea85 미입력 | 미입력 | — | **validate 안내/차단** |
| C-B4 | general_building 증축 매매취득(purchase) | — | — | **미발동** (isSelfBuilt=false) |
| C-B5 | general_building 신축(buildingAcquisitionCause=newConstruction) 회귀 | — | >=2018-01-01 | **발동(회귀)** |
| C-B6 | general_building K-5 부담부증여 신축 회귀 (Phase 1 완료) | — | >=2018-01-01 | **발동(회귀)** |

> **C-B2 fix 포인트**: Phase 2 이전에는 건물2 카드에 `buildingType` 미설정 → 신축 분기 진입 →
> 85㎡ 게이트 미동작 → 모든 증축 면적이 가산세 오발동. fix 후 `buildingType:"extension"` +
> `extensionFloorArea` 전달 → 80㎡ 시 정상 차단.

---

## 4. 14개 동기화 지점 전수 점검

### Feature A — 증여세 측 `extensionStdPriceAtAcquisition`

| # | 지점 | 파일 | 변경 | 상태 |
|---|---|---|---|---|
| ① | 타입 `BurdenedGiftTransferTaxInput` | `lib/tax-engine/types/inheritance-gift-estate.types.ts:706` 직후 | `extensionStdPriceAtAcquisition?: number` 추가 | ❌ 추가 |
| ② | createEmpty / hasData | `BurdenedGiftTransferSection.tsx:56-` | `undefined` 초기값; hasData OR 조건: `(bgt.extensionFloorArea ?? 0) > 0 || bgt.extensionStdPriceAtAcquisition != null` | ❌ 추가 |
| ③ | normalize | `normalize-restored-form-dates.ts` | 금액 필드(number) — Date 아님. spread 확인만. `extensionStdPriceAtAcquisition: bgt.extensionStdPriceAtAcquisition` | ❌ 확인 |
| ④⑬ | API 변환·body | `lib/calc/gift-burdened-transfer-api.ts:219-234` **§114조의2 최상위 블록** | **최상위 단일 경로로 통일**(아래 박스). `buildingType==="extension"` 게이트 시 `extensionStdPriceAtAcquisition` **최상위 body에** 추가 전송(기존 4필드와 동일 경로). `burdenedGiftInfoMarket` 서브객체 경유 금지 | ❌ 추가 |
| ⑤ | UI 위젯 | `BurdenedGiftValuationModeSection.tsx` | extension RadioCard `disabled:true` 제거 + 증축 조건부 위젯 추가 (§5.2 참조) | ❌ 추가 |
| ⑥ | 사이드바 합계 | 증여세 사이드바는 본세만 | N/A | — |
| ⑦ | 결과 카드 라벨 | `BurdenedTransferTaxResultCard.tsx:139` | **(b) 중립 라벨 확정** — "감정가액 또는 환산취득가액 적용 가산세 (§114조의2①)"로 통일. echo 필드 추가 없음 | ❌ 수정 |
| ⑧ | validate | `gift-tax-form-shared.tsx:342` (TODO 위치) | `buildingType==="extension"` + `isSelfBuilt` 시: `extensionFloorArea > 0` 필수 차단 + `extensionStdPriceAtAcquisition > 0` 필수 차단 | ❌ 추가 |
| ⑨ | Zod enum | `lib/api/transfer-tax-schema.ts:175-178` **propertyBaseShape (최상위)** | 기존 4필드와 동일 schema 블록에 `extensionStdPriceAtAcquisition: z.number().nonnegative().optional()` 추가. ~~burdenedGiftInfoSchema 경유 금지~~ — 최상위 경로 채택 | ❌ 추가 |
| ⑩ | Zod 컴패니언 | 동상 | 신규 enum 없음 | ✅ 기존 |
| ⑪ | acqDate fallback | N/A | — | — |
| ⑫ | Zod 입력 객체 | `lib/api/transfer-tax-schema.ts:175-178` **propertyBaseShape (최상위)** | ⑨와 동일 위치 — 기존 4필드 동일 schema. ~~`transfer-tax-burdened-gift-schema.ts` burdenedGiftInfoSchema 아님~~ | ❌ 추가 |
| ⑬ | body spread | `gift-burdened-transfer-api.ts:219-234` §114조의2 최상위 블록 | ④와 동일 위치 — 명시 매핑 (침묵 strip 방지) | ❌ 추가 |
| ⑭ | Route 매핑 | `app/api/calc/transfer/route.ts:271` 직후 | `extensionStdPriceAtAcquisition: data.extensionStdPriceAtAcquisition` 명시 추가 | ❌ 추가 |

**증여세 측 실제 신규 작업: ①②③④⑤⑦⑧⑨⑫⑬⑭ (11지점). ⑥⑩⑪ 해당없음/0건.**

> **★ 정정(critical) — 증여세 신규 필드는 기존 4필드와 동일한 최상위 경로**:
> 기존 `isSelfBuilt`·`buildingType`·`constructionDate`·`extensionFloorArea` 4필드는 모두
> `gift-burdened-transfer-api.ts:226-232`에서 gift body 최상위로 전송되고 엔진은
> `rawInput.buildingType`·`rawInput.extensionFloorArea`(최상위)로 읽는다(실측).
> 신규 `extensionStdPriceAtAcquisition`도 **동일하게 최상위 body**에 전송하고
> 엔진은 `rawInput.extensionStdPriceAtAcquisition`(최상위)로 읽는다.
>
> 타입 추가 대상은 2개로 분리:
> - **(a) 폼 입력 타입**: `BurdenedGiftTransferTaxInput`(`inheritance-gift-estate.types.ts:706`) — `extensionStdPriceAtAcquisition?: number` 추가.
> - **(b) 엔진 입력 타입**: `BurdenedGiftInfo`(`lib/tax-engine/types/transfer-burdened-gift.types.ts:31`) — **추가 없음** (최상위 rawInput으로 읽음, burdenedGiftInfo 서브객체 경유 없음).
> - **Zod**: `transfer-tax-schema.ts propertyBaseShape`(최상위) — 기존 4필드와 동일 위치에 추가.
>   ~~`transfer-tax-burdened-gift-schema.ts` `burdenedGiftInfoSchema` 아님~~.

**⑬ grep 자가점검**:
```bash
grep -n "isSelfBuilt\|buildingType\|constructionDate\|extensionFloorArea\|extensionStdPriceAtAcquisition" \
  lib/calc/gift-burdened-transfer-api.ts
# 최상위 경로 통일 확인:
grep -n "extensionStdPriceAtAcquisition" \
  lib/tax-engine/types/inheritance-gift-estate.types.ts \
  lib/api/transfer-tax-schema.ts
```
`gift-burdened-transfer-api.ts`에 5필드 모두 존재 + 폼 타입·`transfer-tax-schema.ts` propertyBaseShape 모두 존재해야 완료. `transfer-tax-burdened-gift-schema.ts`·`inheritance-gift-estate.types.ts` BurdenedGiftInfo에 없어야 정상.

### Feature A — 양도세 측 `extensionStdPriceAtAcquisition`

| # | 지점 | 파일 | 변경 | 상태 |
|---|---|---|---|---|
| ① | `AssetForm` 폼 상태 | `lib/stores/calc-wizard-asset.ts` (isSelfBuilt~extensionFloorArea 옆) | `extensionStdPriceAtAcquisition: string` 추가 | ❌ 추가 |
| ② | 초기값 | `calc-wizard-asset-factory.ts`·`calc-wizard-store.ts` (2곳 모두) | `extensionStdPriceAtAcquisition: ''` | ❌ 추가 |
| ③ | normalize | `calc-wizard-migration.ts` | `extensionStdPriceAtAcquisition: form.extensionStdPriceAtAcquisition ?? ''` | ❌ 추가 |
| ④⑬ | API 변환·body | `lib/calc/transfer-tax-api.ts:384-387` (extension 게이트 옆) | `buildingType==="extension"` 시 `extensionStdPriceAtAcquisition: parseAmount(primary.extensionStdPriceAtAcquisition)` | ❌ 추가 |
| ⑤ | UI 위젯 | `SelfBuiltSection.tsx` | extension 시 `extensionStdPriceAtAcquisition` CurrencyInput 추가 (§5.3 참조) | ❌ 추가 |
| ⑥ | 사이드바 | 해당 없음 | N/A | — |
| ⑦ | 결과 카드 | `BurdenedTransferTaxResultCard.tsx:139` + `TransferTaxResultView.tsx:421` | 신축/증축 분기 라벨 또는 중립 통일 (§7 참조) | ❌ 수정 |
| ⑧ | validate | `lib/calc/transfer-tax-validate-asset.ts:623-631` (기존 "6) 신축·증축" 블록) | 기존 블록에 `buildingType==="extension"` 시 `extensionStdPriceAtAcquisition > 0` 필수 차단 **1줄 추가**(기존 `extensionFloorArea` 검증 재작성 금지·부담부증여 게이트 §16 연동, §8.2). ※ `transfer-tax-validate.ts` 아님 | ❌ 추가 |
| ⑨ | Zod enum | `lib/api/transfer-tax-schema.ts:178` 옆 | ④와 동일 위치 — 증여·양도 공유 Zod | ❌ 추가 |
| ⑫ | Zod 입력 객체 | `transfer-tax-schema.ts` propertyBaseShape | ⑨와 동일 | ❌ 추가 |
| ⑭ | Route 매핑 | `app/api/calc/transfer/route.ts:271` 직후 | `extensionStdPriceAtAcquisition: data.extensionStdPriceAtAcquisition` 명시 추가. 현행 route.ts는 명시 필드-별 매핑 → **명시 추가 안 하면 침묵 strip** | ❌ 추가 |

**양도세 측 실제 신규 작업: ①②③④⑤⑦⑧⑨⑫⑬⑭ (11지점). ⑥⑩⑪ 해당없음/0건.**

**⑫⑬⑭ grep 자가점검**:
```bash
grep -n "extensionStdPriceAtAcquisition" \
  lib/api/transfer-tax-schema.ts \
  lib/calc/transfer-tax-api.ts \
  app/api/calc/transfer/route.ts
```
3파일 모두 존재해야 완료.

### Feature B — general_building `gbExtensionFloorArea85`

| # | 지점 | 파일 | 변경 | 상태 |
|---|---|---|---|---|
| ① | `AssetForm` 폼 상태 | `lib/stores/calc-wizard-asset.ts` (gbExtension* 필드 옆) | `gbExtensionFloorArea85: string` 추가 | ❌ 추가 |
| ② | 초기값 | `calc-wizard-asset-factory.ts`·`calc-wizard-store.ts` (2곳) | `gbExtensionFloorArea85: ''` | ❌ 추가 |
| ③ | normalize | `calc-wizard-migration.ts` | `gbExtensionFloorArea85: form.gbExtensionFloorArea85 ?? ''` | ❌ 추가 |
| ④⑬ | API 변환·body | `lib/calc/transfer-tax-api-helpers.ts` `buildExtensionInfo` base 객체 | `...(extensionFloorArea85 ? { extensionFloorArea85 } : {})` 추가 (`parseDecimal(asset.gbExtensionFloorArea85)` 사용) | ❌ 추가 |
| ⑫ | Zod 입력 객체 | `lib/api/transfer-tax-building-schemas.ts:93` `extensionInfo` `z.object()` | **★ critical 누락 — `extensionFloorArea85: z.number().nonnegative().optional()` 추가.** 실측: 이 스키마는 `.passthrough()` 없는 plain `z.object()`라 알 수 없는 키 `extensionFloorArea85`를 **기본 strip** → 구현해도 엔진 미도달. R-4가 경고한 동일 침묵 strip이 Feature B에서 누락됨 | ❌ 추가 |
| ⑤ | UI 위젯 | `GeneralBuildingBlock.tsx` extensionInfo 섹션 | 증축 자가건축 조건부 `extensionFloorArea85` DecimalInput 추가 (§5.4 참조) | ❌ 추가 |
| ⑦ | 결과 카드 | `BurdenedTransferTaxResultCard.tsx` / `TransferTaxResultView.tsx` | 신규 0건 — Feature A 라벨 분기와 통합 | ✅ Feature A와 동일 |
| ⑧ | validate | `lib/calc/transfer-tax-validate.ts` | `gbHasExtension=true + gbExtensionAcquisitionCause==="newConstruction"` 시 `gbExtensionFloorArea85 > 0` 입력 안내 (🔍 차단 vs 경고 결정 필요 — §8 참조) | ❌ 추가 |
| ⑭ | Route(extensionInfo Zod+payload) | `general-building-route-helper.ts` extensionInfo 스키마/디스패처 | `extensionFloorArea85` passthrough 결선. **명시 추가 필요** (엔진 시니어 담당 여부 확인 필요 — route handler 계층) | 🔍 담당 분담 확인 |

**엔진 타입(extensionInfo inline타입·AssetCardForAggregate) + route helper card→item 매핑 + 건물2 카드 push는 엔진 시니어 담당.**

**Feature B grep 자가점검**:
```bash
grep -n "extensionFloorArea85\|buildingType\|extensionFloorArea" \
  lib/calc/transfer-tax-api-helpers.ts \
  lib/api/transfer-tax-building-schemas.ts \
  lib/tax-engine/general-building-extension.ts \
  app/api/calc/transfer/general-building-route-helper.ts
```
4파일 모두 `extensionFloorArea85` 존재 + `general-building-extension.ts` 건물2 카드 push에
`buildingType`·`extensionFloorArea` **동시 존재**해야 완료. (`transfer-tax-building-schemas.ts`는
⑫ Zod strip 방지 — 누락 시 침묵 strip으로 엔진 미도달.)

---

## 5. UI 위젯 상세

### 5.1 엔진 계산 순서 → UI 순서 매핑

`calculateBuildingPenalty`(`transfer-tax-rate-calc.ts:51-87`) 게이트 순서:

1. `isSelfBuilt === true` (`:55`)
2. `transferDate < 2020-01-01` — 증축 시행일 게이트 (`:68`) → 시스템 자동
3. `buildingType === "extension"` (`:67`)
4. `(extensionFloorArea ?? 0) <= 85` — 85㎡ 게이트 (`:69`)
5. `addYears(constructionDate(=증축일), 5) >= transferDate` (`:72·:77`)
6. base = `extensionEstimatedBase` (증축부분 환산취득가)
7. `applyRate(base, 0.05)` = 가산세

UI 순서 (§114조의2 엔진 게이트 순서와 동일):
```
① 신축·증축 여부 토글 (isSelfBuilt)
② 신축/증축 구분 RadioCard (buildingType)
③ 증축 바닥면적 (extensionFloorArea — ≤85 시 발동 안 됨)   ← Phase 2 신규 활성화
④ 증축일(취득일) DateInput (constructionDate)               ← Phase 1 기존
⑤ 증축부분 취득시 기준시가 CurrencyInput (extensionStdPriceAtAcquisition) ← Phase 2 신규
```

### 5.2 증여세 탭 — BurdenedGiftValuationModeSection.tsx 수정

**현행 (Phase 1)**:
- extension RadioCard `disabled:true` + hint: "증축(85㎡ 초과·증축부분 한정) 가산세는 Phase 2에서 지원합니다."
- `constructionDate` DateInput만 있음 (신축 전용)

**Phase 2 수정**:

(1) extension RadioCard `disabled:true` 제거:
```tsx
{
  value: "extension",
  label: "증축",
  description: "바닥면적 합계 85㎡ 초과·증축부분 한정 환산취득가 × 5%",
  testId: "bg-building-type-extension",
  // disabled: true ← 제거
},
```

(2) `bgt.buildingType === "extension"` 조건부 블록 추가 (constructionDate 라벨 변경 포함):

```tsx
{/* ③ 증축 바닥면적 — extension 전용 */}
{bgt.isSelfBuilt && bgt.buildingType === "extension" && (
  <FieldCard
    label="증축부분 바닥면적 합계"
    unit="㎡"
    required
    hint="§114조의2① 게이트: 바닥면적 합계 85㎡ 초과 시에만 가산세 적용. 85㎡ 이하이면 발동하지 않습니다."
  >
    <DecimalInput
      value={
        bgt.extensionFloorArea != null
          ? String(bgt.extensionFloorArea)
          : ""
      }
      onChange={(v) =>
        set({ extensionFloorArea: v != null ? parseDecimal(v) : undefined })
      }
      data-testid="bg-extension-floor-area"
    />
  </FieldCard>
)}

{/* ④ 신축일(신축) / 증축일(증축) — 5년 기산 */}
{bgt.isSelfBuilt && (
  <FieldCard
    label={bgt.buildingType === "extension" ? "증축일" : "신축일(취득일)"}
    required
    hint={
      bgt.buildingType === "extension"
        ? "증축일부터 양도일까지 5년 이내일 때 가산세 적용 (§114조의2① '취득일 또는 증축일')."
        : "신축일(취득일)부터 5년 이내 양도 시 가산세 발동."
    }
  >
    <DateInput
      value={dateToStr(bgt.constructionDate)}
      onChange={(v) => set({ constructionDate: toOptionalDate(v) })}
      data-testid="bg-construction-date"
    />
  </FieldCard>
)}

{/* ⑤ 증축부분 기준시가 — extension 전용, §176의2②2호 환산 분자 */}
{bgt.isSelfBuilt && bgt.buildingType === "extension" && (
  <FieldCard
    label="증축부분 취득시(증축완공시) 기준시가 총액"
    unit="원"
    required
    hint="증축완공 시점의 증축부분 기준시가 총액(원). 국세청 홈택스 → 기준시가 조회. §114조의2① 증축부분 한정 환산취득가 산출에 사용됩니다."
  >
    <CurrencyInput
      label="증축부분 취득시 기준시가 총액"
      hideUnit
      value={
        bgt.extensionStdPriceAtAcquisition != null
          ? String(bgt.extensionStdPriceAtAcquisition)
          : ""
      }
      onChange={(v) => {
        const n = parseAmount(v);
        set({ extensionStdPriceAtAcquisition: n > 0 ? n : undefined });
      }}
      data-testid="bg-extension-std-price-at-acq"
    />
  </FieldCard>
)}
```

(3) ToggleCard OFF 시 초기화 보강 (기존 `:77-82·:274-283`): `extensionFloorArea: undefined`·`extensionStdPriceAtAcquisition: undefined` 2필드를 OFF 분기에 추가.

(4) buildingType 전환 시 초기화 (기존 `:148-154`): `extensionFloorArea: undefined`·`extensionStdPriceAtAcquisition: undefined` 신축↔증축 전환 시 리셋.

**useEffect 금지**: 모든 cross-field 초기화는 onChange 콜백 내부에서 직접 set(). useEffect 미사용.

**SelectOnFocusProvider**: 전역 등록됨 — CurrencyInput·DecimalInput에 `onFocus` 개별 추가 불요.

### 5.3 양도세 탭 — SelfBuiltSection.tsx 수정

현행 `SelfBuiltSection.tsx`(실측 확인):
- `buildingType === "extension"` 시 `extensionFloorArea` DecimalInput 이미 존재 (`:86-101`)
- 신규 1필드 `extensionStdPriceAtAcquisition` CurrencyInput만 추가

**삽입 위치**: extensionFloorArea input(`:86-101`) 다음.

```tsx
{/* ★ Phase 2 신규: 증축부분 취득시 기준시가 — §114조의2 증축부분 한정 base 산출 */}
{buildingType === "extension" && (
  <FieldCard
    label="증축부분 취득시(증축완공시) 기준시가 총액"
    unit="원"
    required
    hint="증축완공 시점의 증축부분 기준시가 총액(원). §114조의2① 증축부분 한정 환산취득가 산출. 총액(원) — ㎡ 단가 아님."
  >
    <CurrencyInput
      label="증축부분 취득시 기준시가 총액"
      hideUnit
      value={extensionStdPriceAtAcquisition}
      onChange={onExtensionStdPriceAtAcquisitionChange}
    />
  </FieldCard>
)}
```

Props 추가:
```ts
interface SelfBuiltSectionProps {
  // ... 기존 props ...
  extensionStdPriceAtAcquisition: string;
  onExtensionStdPriceAtAcquisitionChange: (v: string) => void;
}
```

**★ prop-threading 4지점(전부 명시 — 명시 prop 매핑 누락 침묵 strip 방지 `feedback_explicit_prop_mapping_strip`)**:
실측 확인 결과 SelfBuiltSection은 `CompanionAcqPurchaseBlock` 한 곳이 아니라 **3계층**으로 prop이 흐른다.
`SelfBuiltSection`(leaf) ← `CompanionAcqPurchaseBlock`(props 통과, 타입은 별도 파일) ← **두 부모**
(`CompanionAcquisitionCauseSection.tsx` 및 `GeneralBuildingAcquisitionCards.tsx`, 둘 다
`asset.extensionFloorArea`→onChange 와이어링). 다음 4지점을 모두 추가/연결한다:

1. **타입**: `CompanionAcqPurchaseBlock.types.ts`에
   `extensionStdPriceAtAcquisition?: string`·`onExtensionStdPriceAtAcquisitionChange?: (v: string) => void` 추가
   (※ Props 타입은 `.tsx`가 아니라 이 `.types.ts`에 정의됨).
2. **통과**: `CompanionAcqPurchaseBlock.tsx`에서 SelfBuiltSection 렌더 위치(`:673-689`)에 두 prop 통과:
   ```tsx
   extensionStdPriceAtAcquisition={extensionStdPriceAtAcquisition}
   onExtensionStdPriceAtAcquisitionChange={onExtensionStdPriceAtAcquisitionChange}
   ```
3. **부모 1**: `CompanionAcquisitionCauseSection.tsx:168-169` `extensionFloorArea` 와이어링 옆에
   `extensionStdPriceAtAcquisition={asset.extensionStdPriceAtAcquisition}`·
   `onExtensionStdPriceAtAcquisitionChange={(v) => onChange({ extensionStdPriceAtAcquisition: v })}` 추가.
4. **부모 2**: `GeneralBuildingAcquisitionCards.tsx:146-147` 동일 와이어링 추가.

**⑤ grep 자가점검(두 부모 파일 포함)**:
```bash
grep -n "extensionStdPriceAtAcquisition" \
  components/calc/transfer/SelfBuiltSection.tsx \
  components/calc/transfer/CompanionAcqPurchaseBlock.types.ts \
  components/calc/transfer/CompanionAcqPurchaseBlock.tsx \
  components/calc/transfer/CompanionAcquisitionCauseSection.tsx \
  components/calc/transfer/GeneralBuildingAcquisitionCards.tsx
```
5파일 모두 존재해야 완료(파일 경로는 실측 확인 후 보정).

### 5.4 양도세 탭 — GeneralBuildingBlock.tsx 수정 (Feature B)

**현행(실측 확인 `GeneralBuildingBlock.tsx:402`)**: 증축 섹션 전체가
`!isBurdenedGift && (isEstimated || asset.gbHasExtension)` 게이트 하에 표시된다. 즉 `gbHasExtension`
ToggleCard(`:408`)와 `gbExtensionAcquisitionCause` 라디오(`:533`)를 포함한 **증축 정보 섹션 전체가
부담부증여 모드(`isBurdenedGift`)에서 완전히 숨겨진다**.

> **★ 모순(critical+high) — 위젯 게이트가 데이터 도달 불가능 + Plan과 경로 어긋남**:
> - 본 §5.4 초안의 위젯 게이트 `isBurdenedGift && asset.gbHasExtension && newConstruction`는
>   **결코 충족될 수 없다**. `:402`에서 부담부증여 모드는 `gbHasExtension` 토글·`gbExtensionAcquisitionCause`
>   라디오 자체를 숨기므로, 부담부증여에서 `gbHasExtension=true`·`newConstruction`을 설정할 UI 경로가 없다.
>   anchor UI-B1이 이 셋을 true로 가정하나 실제 입력 경로가 없음.
> - 또한 Plan(`lines 84·130-132`)이 가리키는 실제 case 33 갭은 **비-부담부 일반양도 환산 경로**
>   (`general-building-extension.ts`)에서 발생한다. 결함 발생 경로(비-부담부)와 위젯 노출 경로(부담부)가
>   어긋나, case 33 fix(C-B2: 80㎡ 정상 차단)를 위한 면적 입력이 실제 case 33 흐름에서 노출되지 않는다.
>
> **Do 전 결정 필요 — 두 옵션 중 택1(§16 표 연동)**:
> - **(b) 권장 — 비-부담부 case 33 경로로 정정**: Plan과 일치. 위젯 게이트를
>   `!isBurdenedGift && asset.gbHasExtension && asset.gbExtensionAcquisitionCause === "newConstruction"`로
>   바꾸고, 신규 `gbExtensionFloorArea85` DecimalInput을 기존 증축 정보 섹션(`:402` 내부, 자가증축 라디오
>   선택 시)에 삽입한다. 부담부증여 general_building까지의 확장은 Plan D-1(SCOPE OUT).
> - **(a) 부담부증여까지 확장**: 부담부증여 모드에서도 `gbHasExtension` 토글·`gbExtensionAcquisitionCause`
>   라디오·`gbExtensionFloorArea85`를 함께 재노출하는 최소 블록을 신설(현행 초안은 floorArea85 단일
>   필드만 노출하여 토글·라디오 미노출 → 게이트 충족 불가). 이는 §16 SCOPE OUT(비-부담부 미확정)과도
>   충돌하므로 §16 결정과 함께 확정.
>
> 어느 쪽이든 **anchor UI-B1 입력 전제를 실제 UI 경로와 일치**시켜야 한다. 아래 코드 블록은 (b) 기준
> 예시이며, (a) 채택 시 토글·라디오 재노출 블록을 함께 추가한다.

삽입 위치((b) 기준): 기존 증축 정보 섹션(`:402` 내부) 자가증축 라디오 선택 분기.

```tsx
{/* ★ Phase 2 신규 (b)안): 비-부담부 자가증축 증축 §114조의2 85㎡ 게이트 입력
    게이트는 기존 증축 섹션(:402, !isBurdenedGift)에 종속 + 자가증축 한정 */}
{asset.gbHasExtension && asset.gbExtensionAcquisitionCause === "newConstruction" && (
  <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">
        §
      </span>
      <p className="text-xs font-semibold text-amber-700">
        자가증축 §114조의2 가산세 판정 정보
      </p>
    </div>
    <FieldCard
      label="증축부분 바닥면적 합계"
      unit="㎡"
      hint="§114조의2① 85㎡ 초과 판정 전용. 연면적(gbBuildingArea)과 다를 수 있습니다. 모르는 경우 0으로 두면 가산세 미발동 처리됩니다."
    >
      <DecimalInput
        value={asset.gbExtensionFloorArea85}
        onChange={(v) => onChange({ gbExtensionFloorArea85: v })}
        data-testid="gb-extension-floor-area-85"
      />
    </FieldCard>
  </div>
)}
```

> **⑤ `extensionArea`(연면적) vs `gbExtensionFloorArea85`(85㎡ 게이트 바닥면적) 구분 안내**:
> 기존 `extensionArea`는 환산취득가 참고용 연면적이며 §114조의2 85㎡ 판정과 다를 수 있다(법문 "바닥면적 합계").
> 신규 필드는 별도 라벨·별도 testId로 명확히 분리하여 사용자 혼동을 방지한다.
> 🔍 통합 여부는 UI 시니어가 실제 케이스 확인 후 결정 가능하나, 현행 설계는 분리를 권장.

---

## 6. 사이드바 합계 — ⑥

penalty는 API 결과 후 산정 → 사이드바 미표시. 양 탭 모두 N/A.

---

## 7. 결과 카드 — ⑦ 라벨 분기 결정

### 현황 (실측)

`BurdenedTransferTaxResultCard.tsx:137-142`:
```tsx
{result.penaltyTax > 0 && (
  <Row
    label="신축·증축 가산세 (§114조의2 · 건물 환산취득가 × 5%)"
    ...
  />
)}
```

현행 라벨 "건물 환산취득가 × 5%"는 신축에는 정확하나 증축에는 법문 불일치
(§114조의2① "증축한 부분에 한정" → "증축부분 환산취득가 × 5%").

### 옵션 분석

`TransferTaxResult`에 `buildingType` echo 필드가 **현재 없음** (실측 확인 — `penaltyTax`·`penaltyBase`·`penaltyDetail`만 존재).
결과 카드가 `result`만 prop으로 받으므로, result-only로 신축/증축 구분 불가.

**(a) echo 필드 추가 (`penaltyBuildingType?: "new" | "extension"`)**:
- 엔진 result 타입 1필드 추가 필요 → 엔진 시니어 담당
- 라벨 분기: `result.penaltyBuildingType === "extension" ? "증축부분 환산취득가 × 5%" : "건물 환산취득가 × 5%"`
- 법문 정확성 최대 보장

**(b) 중립 라벨 통일 (`환산취득가액 × 5%`)**:
- 엔진 수정 없음
- 신축·증축 모두 정확 (§114조의2① "환산취득가액의 100분의 5" 법문 준수)
- FieldCard 라벨: `"환산가액적용가산세 (§114조의2①)"`
- 산식: `"환산취득가액 × 5% = {penaltyTax}"` (신축: 건물전체, 증축: 증축부분 — 구분 없이 "환산취득가액"으로 통일)

**채택**: **(b) 중립 라벨 확정** — Simplicity First. 엔진 result 타입 변경 없음(echo 필드 추가 0).
§114조의2①은 감정가액(appraisal)에도 적용되므로, 라벨 표제를 법문 §114조의2①에 따라
**"감정가액 또는 환산취득가액 적용 가산세 (§114조의2①)"**로 통일.
증여세 탭은 appraisal enum 부재라 항상 환산취득가액이며 표제가 정확.
양도세 단독 탭은 감정가액 발동 케이스도 있어 "감정가액 또는 환산취득가액" 통일 표제가 정합.
상세 펼침 산식은 `penaltyBase` 금액으로 표시 (buildingType echo 불필요).

### 수정 코드 (BurdenedTransferTaxResultCard.tsx:137-142)

```tsx
{result.penaltyTax > 0 && (
  <Row
    label="감정가액 또는 환산취득가액 적용 가산세 (§114조의2①)"
    value={formatKRW(result.penaltyTax)}
    sub
  />
)}
```

지방소득세 라벨(현행 `:144-152`): Phase 1 구현 기준으로 이미 penalty 포함 시 `(결정세액+가산세) × 10%` 표시 → **변경 없음**.

### 상세 펼침 산식 추가 (현행 `:160~`)

기존 산식 영역 다음에:
```tsx
{result.penaltyTax > 0 && (
  <p className="mt-1 text-amber-700 dark:text-amber-300">
    ※ 감정가액 또는 환산취득가액 적용 가산세 (§114조의2①):
    취득가액 {formatKRW(result.penaltyBase)} × 5%
    = {formatKRW(result.penaltyTax)}
  </p>
)}
```

> **법적 표기 원칙**: 납세자 유불리 표현 금지. 사실 표기만. `penaltyBase`가 신축이면 건물전체,
> 증축이면 증축부분이므로 "취득가액"으로 표시해도 법문에 부합.
> §114조의2①은 감정가액(appraisal)에도 적용되므로(rate-calc.ts:63 appraisal 통과),
> "(b) 중립 라벨"은 "신축·증축(환산취득가액·감정가액 경로) 정확"이 정확한 한정.

`TransferTaxResultView.tsx:420-421`의 양도세 단독 Row(`환산가액적용가산세 (§114조의2)`)도 동일하게 "감정가액 또는 환산취득가액 적용 가산세 (§114조의2①)"로 라벨 정리.

---

## 8. Validation — ⑧

### 8.1 증여세 측 (`gift-tax-form-shared.tsx:342` — TODO 위치)

기존 early-return 패턴 유지:

```ts
// Phase 2 증축 필드 필수 차단 (buildingType==="extension" 추가)
if (
  bgt.acquisitionMethod === "converted" &&
  !isLandType &&
  bgt.isSelfBuilt === true &&
  bgt.buildingType === "extension"
) {
  if (!bgt.extensionFloorArea || bgt.extensionFloorArea <= 0) {
    return `${itemLabel}: 증축부분 바닥면적 합계를 입력해 주세요. §114조의2① 85㎡ 초과 판정에 필요합니다.`;
  }
  if (!bgt.extensionStdPriceAtAcquisition || bgt.extensionStdPriceAtAcquisition <= 0) {
    return `${itemLabel}: 증축부분 취득시 기준시가를 입력해 주세요. §114조의2① 증축부분 한정 환산취득가 산출에 필요합니다.`;
  }
}
// 기존 Phase 1 신축 차단 (buildingType 미선택 + constructionDate 미입력)은 유지
```

**⑧ validation-API fallback 동기화**: 신규 필드에 자동 안분·자동 fallback 없음.
`extensionFloorArea` 미입력 시 엔진에서 `(undefined ?? 0) <= 85` → 가산세 미발동(침묵 비표시).
`extensionStdPriceAtAcquisition` 미입력 시 `extensionEstimatedBase=undefined` → step override에서 전체 base로 fallback.
두 경우 모두 validate 차단으로 해결.

### 8.2 양도세 측 (`lib/calc/transfer-tax-validate-asset.ts` 기존 신축·증축 블록)

**정정(실측 확인)**: 양도세 자산-수준 신축·증축 검증은 `transfer-tax-validate.ts`가 **아니라**
`lib/calc/transfer-tax-validate-asset.ts`의 `validateAssetEntry` 내 "6) 신축·증축" 블록
(`:623-631`)에 **이미 존재**한다. 현행:

```ts
// 6) 신축·증축 (매매 + housing/building 전용)
if (asset.isSelfBuilt && asset.acquisitionCause === "purchase") {
  if (!asset.buildingType) return `${label}: 신축·증축 구분을 선택하세요.`;
  if (!asset.constructionDate) return `${label}: 신축·증축 완공일을 입력하세요.`;
  if (formTransferDate && asset.constructionDate > formTransferDate)
    return `${label}: 신축·증축 완공일이 양도일(${formTransferDate}) 이후입니다. 날짜를 확인하세요.`;
  if (asset.buildingType === "extension" && (!asset.extensionFloorArea || parseFloat(asset.extensionFloorArea) <= 0))
    return `${label}: 증축 부분 바닥면적을 입력하세요.`;
}
```

**수정 방침(Surgical Changes)**: 기존 `extensionFloorArea>0` 검증은 재작성하지 말고, 같은 블록의
`buildingType === "extension"` 분기에 `extensionStdPriceAtAcquisition>0` 필수 차단 **1줄만 추가**한다.

```ts
  // ★ Phase 2 신규 1줄 추가 — 기존 extensionFloorArea 검증 줄 다음
  if (asset.buildingType === "extension" && (!asset.extensionStdPriceAtAcquisition || parseAmount(asset.extensionStdPriceAtAcquisition) <= 0))
    return `${label}: 증축부분 취득시 기준시가를 입력해 주세요.`;
```

> **모순 해소 — 부담부증여 게이트 검토 필요(§16 결정 연동)**:
> 실측 확인 결과 `extensionStdPriceAtAcquisition`는 **현행 엔진 어디에도 참조되지 않으며**(grep 0건,
> `lib/tax-engine/`), 비-부담부 경로의 base는 `transfer-tax.ts:341·388-389` `calcTransferGain`이
> 산출하는 **건물 전체 환산취득가**다. 즉 §16에서 비-부담부 K-5 증축이 SCOPE OUT으로 유지되면,
> 비-부담부 사용자는 이 validate 때문에 증축부분 기준시가를 **필수 입력**하지만 엔진은 그 값을 무시하고
> 여전히 건물 전체 base × 5%(과대)로 계산한다 → CLAUDE.md ⑧ 규칙('UI 통과↔validate 차단 모순 금지',
> 'API/UI fallback 있는 필드는 validate도 동일 fallback') 위배.
>
> **결정 분기(§16 표 연동)**:
> - (a) §16에서 **비-부담부 K-5 증축 포함** 결정 시 → 엔진 base 변환(증축부분 분리)을 함께 추가하고,
>   위 validate를 전 경로(부담부·비-부담부)에 그대로 적용.
> - (b) §16에서 **비-부담부 SCOPE OUT** 결정 시 → validate 차단을 **부담부증여 경로에만** 적용한다.
>   즉 차단 조건에 부담부증여 게이트를 추가:
>   ```ts
>   if (asset.transferType === "burdened_gift" && asset.buildingType === "extension" && (...))
>   ```
>   비-부담부에서는 차단하지 않는다(엔진이 값을 소비하지 않으므로).
>
> 현재처럼 '비-부담부=미확정'이면서 validate는 전 경로 차단인 상태는 **금지**. Do 전 §16 결정 확정 후
> 위 두 분기 중 하나로 일치시킨다.

### 8.3 general_building 측 (`transfer-tax-validate.ts` — Feature B)

```ts
// general_building 증축 자가건축 + §114조의2 85㎡ 게이트 입력 안내
if (
  asset.assetKind === "general_building" &&
  asset.gbHasExtension &&
  (asset.gbExtensionAcquisitionCause ?? "newConstruction") === "newConstruction"
) {
  const floorArea85 = parseDecimal(asset.gbExtensionFloorArea85);
  // 🔍 미입력 처리: (a) 차단 — 85㎡ 초과 여부를 확정할 수 없음
  //                (b) 경고 후 통과 — `(undefined ?? 0) <= 85` → 가산세 미발동(침묵)
  // 본 설계 기본안: 경고(warning) 후 통과. 미입력=0이면 85㎡ 이하 처리로 가산세 미발동.
  // 차단으로 변경 시 사용자 부담 증가(기존 사례 33 케이스 영향). 결정 필요.
  if (floorArea85 <= 0) {
    // warnings.push(...)  ← 차단 아닌 경고 패턴
  }
}
```

> 🔍 결정 필요: `gbExtensionFloorArea85` 미입력 시 **차단 vs 경고**. 현재 결정이 없으므로 "확인 필요"로 표기.
> 차단 채택 시 기존 사례 33 `general-building-extension-case-33.test.ts` E2E에 영향 가능 — 전수 확인 필요.

### 8.4 UI ↔ validate 동기화 점검표

| 조건 | UI 표시 | validate 차단 |
|---|---|---|
| `buildingType==="extension"` + `extensionFloorArea<=0` | DecimalInput 노출 | 차단 (`>0` 필수) |
| `buildingType==="extension"` + `extensionStdPriceAtAcquisition<=0` | CurrencyInput 노출 | 차단 (`>0` 필수) |
| `buildingType==="new"` | extensionFloorArea·extensionStdPriceAtAcquisition 미노출 | skip (extension 게이트 미진입) |
| `isLandType=true` | 위젯 전체 미노출 (`!isLandType` 게이트) | skip |
| `acquisitionMethod !== "converted"` (K-4) | 위젯 미노출 | skip |
| `gbExtensionFloorArea85` 미입력 (Feature B) | 위젯 노출 | 경고 또는 차단 (결정 필요) |

---

## 9. Cross-field 동기화 — useEffect 금지 선언

| 트리거 필드 | 갱신 대상 | 구현 | useEffect 금지 이유 |
|---|---|---|---|
| `isSelfBuilt` OFF | `buildingType`·`constructionDate`·`extensionFloorArea`·`extensionStdPriceAtAcquisition` clear | ToggleCard `onChange` 내 `set({...})` | 무한 루프 차단 |
| `buildingType` 신축↔증축 전환 | `extensionFloorArea`·`extensionStdPriceAtAcquisition` clear | RadioCardGroup `onChange` 내 `set({...})` | 무한 루프 차단 |
| K-5 모드 OFF (`isConverted=false`) | 신축·증축 위젯 미노출 | `isMarketMode && isConverted` 상위 게이트 | 상위 조건으로 자동 처리 |
| `gbHasExtension` OFF | `gbExtensionFloorArea85` 초기화 | `onCheckedChange` 내 `onChange({ gbExtensionFloorArea85: '' })` | 무한 루프 차단 |

---

## 10. Silent Fallback 식별 — 자동 안분 금지 확인

| 필드 | 위험 | 처리 |
|---|---|---|
| `extensionFloorArea` 미입력 | `(undefined??0)<=85` → 85㎡ 게이트 → penalty=0 침묵 | ⑧ validate 차단: extension + isSelfBuilt 시 필수 |
| `extensionStdPriceAtAcquisition` 미입력 | `extensionEstimatedBase=undefined` → step override에서 건물전체 base로 fallback (과대 부과 위험) | ⑧ validate 차단: extension + isSelfBuilt 시 `>0` 필수 |
| `gbExtensionFloorArea85` 미입력 | `(undefined??0)<=85` → 가산세 미발동 침묵 | ⑧ 경고 또는 차단 (결정 필요) |
| 증축부분 `extensionStdPriceAtAcquisition=0` 명시 입력 | `extensionEstimatedBase=0` → penalty=0 | ⑧ validate: `>0` 필수 |
| **면적비율 자동 안분 금지** | §114조의2 증축부분 base를 면적비율로 자동 안분 | **절대 금지** (정책 `feedback_no_silent_apportion_fallback`) |

---

## 11. Anchor 기대값 (UI 검증용)

### anchor UI-A1: 증여세 증축 위젯 노출 조건

```
입력: valuationMode="sangjeungbeop_market", acquisitionMethod="converted", isLandType=false
      isSelfBuilt=true, buildingType="extension"
기대: extensionFloorArea DecimalInput 노출 (data-testid="bg-extension-floor-area")
      constructionDate DateInput 라벨 = "증축일"
      extensionStdPriceAtAcquisition CurrencyInput 노출 (data-testid="bg-extension-std-price-at-acq")

입력: 동일, buildingType="new"
기대: extensionFloorArea DecimalInput 미노출
      extensionStdPriceAtAcquisition CurrencyInput 미노출
      constructionDate DateInput 라벨 = "신축일(취득일)"
```

### anchor UI-A2: 증여세 증축 validate 차단 (early-return — 1개씩)

```
입력: isSelfBuilt=true, buildingType="extension", extensionFloorArea=0, extensionStdPriceAtAcquisition=설정
기대: 반환 문자열에 "증축부분 바닥면적" 포함

입력: isSelfBuilt=true, buildingType="extension", extensionFloorArea=100, extensionStdPriceAtAcquisition=undefined
기대: 반환 문자열에 "증축부분 취득시 기준시가" 포함

입력: isSelfBuilt=true, buildingType="extension", extensionFloorArea=100, extensionStdPriceAtAcquisition=36_000_000
기대: 증축 관련 차단 없음 (완전 입력 시 통과)
```

### anchor UI-A3: 결과 카드 — 중립 라벨 표시

```
result.penaltyTax = 1_350_000 (엔진 설계 P2-1 기댓값 — 증축부분 27,000,000 × 5%)
result.penaltyBase = 27_000_000

기대: "환산가액적용가산세 (§114조의2①)" Row 표시
      formatKRW(1_350_000) = "1,350,000" 표시
      상세 펼침: "환산취득가액 27,000,000 × 5% = 1,350,000" 표시
      (※ 27M은 증축부분 한정 base — 건물전체 base와 다름)
```

### anchor UI-B1: general_building `extensionFloorArea85` 위젯 노출

> **★ 정정(§5.4 모순 박스 연동)**: 게이트가 `isBurdenedGift=true`면 `:402`에서 증축 토글·라디오 자체가
> 숨겨져 입력 경로가 없다. (b)권장안(비-부담부 case 33 경로) 기준으로 anchor 입력 전제를 정정한다.
> (a)안 채택 시 anchor를 부담부증여 토글·라디오 재노출 블록 기준으로 재작성.

```
입력 ((b)안): assetKind="general_building", isBurdenedGift=false,
      (isEstimated=true 또는 gbHasExtension=true로 증축 섹션 노출),
      gbHasExtension=true, gbExtensionAcquisitionCause="newConstruction"
기대: "증축부분 바닥면적 합계" DecimalInput 노출 (data-testid="gb-extension-floor-area-85")

입력: 동일, gbExtensionAcquisitionCause="purchase"
기대: 미노출 (isSelfBuilt=false → §114조의2 비적용)
```

---

## 12. E2E 명세

### 증여세 탭 — `e2e/gift-burdened-transfer.spec.ts` P2 시리즈 추가

```
E2E-P2-1: 증축 RadioCard 활성화 확인
  - bg-building-type-extension testId → disabled 속성 없음 assert
  - click → extensionFloorArea DecimalInput 노출 assert

E2E-P2-2: 증축 완전 입력 → body 검증
  1. K-5 환산 선택
  2. isSelfBuilt ToggleCard ON
  3. buildingType: extension 선택 (testId="bg-building-type-extension")
  4. extensionFloorArea: 100 입력 (data-testid="bg-extension-floor-area")
  5. constructionDate: 증축일 (4년 이내 날짜)
  6. extensionStdPriceAtAcquisition: 36,000,000 입력 (data-testid="bg-extension-std-price-at-acq")
  7. 계산 실행
  8. request body assert: buildingType:"extension" · extensionFloorArea:100 · extensionStdPriceAtAcquisition:36000000
  9. result: "환산가액적용가산세 (§114조의2①)" Row 존재 assert

E2E 함정 (Phase 1 재적용):
  - RadioCardGroup testId 셀렉터 (`bg-building-type-extension`)
  - transferResponse 명시 대기 (증여 API 후 양도 API 순서)
  - getByLabel 오매칭 방지: textbox role 한정
  - DateInput: 연/월/일 3개 input — getByTestId 사용
```

### 양도세 탭 — `e2e/transfer-self-built-extension.spec.ts` 신설

```
E2E-P2-3: SelfBuiltSection 증축 + extensionStdPriceAtAcquisition 입력
  1. 자산 추가 → buildingType → housing 또는 building
  2. 취득가액 방식: 환산(K-5)
  3. isSelfBuilt ToggleCard ON
  4. buildingType: extension 선택
  5. extensionFloorArea: 100 입력
  6. extensionStdPriceAtAcquisition: 36,000,000 입력 (신규 CurrencyInput)
  7. 계산 → request body에 extensionStdPriceAtAcquisition:36000000 assert

worktree: E2E_PORT=3101
```

---

## 13. SCOPE OUT (Phase 2 UI)

- **증여세 탭 general_building 카테고리 신설(D-1)**: 별도 PR·설계 문서
- **양도세 단독(비-부담부) 자가건축 증축 K-5 증축부분 base**: 결정 필요 (Plan §9 참조)
- **`ExtTransferStd`(증축부분 양도기준시가) 별도 입력**: 수학 상쇄로 1필드 방식 확정 — 입력 불요
- **부칙 시행일 2020-01-01 공식 검증**: 연혁 API 미응답. 현행 구현값 유지
- **감정가액(appraisal) 증축 경로**: 증여세 부담부증여에 appraisal enum 부재. 별도 검토 대상
- **사이드바 합계 가산세 노출**: penalty는 API 결과 후 — 미표시
- **이력 저장·PDF 별지 서식**: penalty 결과 칸 반영 후속

---

## 14. 리스크·함정

| # | 리스크 | 관련 정책 | 대응 |
|---|---|---|---|
| R-1 | ⑦ 결과 카드 라벨: 기존 하드코딩 "건물 환산취득가 × 5%" 증축 불일치 | 결과 산식 한국어 정확성 | (b) 중립 라벨 "환산취득가액 × 5%"로 통일 채택 (§7) |
| R-2 | extensionFloorArea 미입력 → 85㎡ 게이트 → 가산세 침묵 미발동 | `feedback_no_silent_apportion_fallback` | ⑧ validate 차단: extension 시 `>0` 필수 |
| R-3 | extensionStdPriceAtAcquisition 미입력 → 전체 base fallback → 과대 부과 | `feedback_no_silent_apportion_fallback` | ⑧ validate 차단: extension + isSelfBuilt 시 필수 |
| R-4 | ⑫⑬⑭ 침묵 strip (`extensionStdPriceAtAcquisition` 누락) | `feedback_explicit_prop_mapping_strip` | grep 자가점검 (§4 명시) |
| R-5 | SelfBuiltSection Props 추가 시 `CompanionAcqPurchaseBlock.tsx` 연결 누락 | `feedback_explicit_prop_mapping_strip` | Props 추가 후 렌더 위치(`:673-689`) 연결 확인 |
| R-6 | useEffect store 미러링 | `feedback_useeffect_store_mirror_forbidden` | ToggleCard·RadioCardGroup onChange 내 직접 set(). useEffect 미사용 |
| R-7 | buildingType 전환 시 extensionFloorArea·extensionStdPriceAtAcquisition 초기화 누락 | `feedback_useeffect_store_mirror_forbidden` | onChange 내 동시 초기화 (§5.2 (4) 참조) |
| R-8 | `gbExtensionFloorArea85` vs `extensionArea` 혼동 | Simplicity First | 별도 필드·별도 라벨·별도 hint로 명시 구분 (§5.4 참조) |
| R-9 | Feature B route helper card→item 매핑 누락 → P2-7 fix 후에도 오발동 | `feedback_explicit_prop_mapping_strip` | 엔진 시니어 B-2(2) 이행 + grep `general-building-route-helper.ts` 확인 |
| R-10 | Feature B 위젯 게이트 `isBurdenedGift` 채택 시 **데이터 도달 불가** — `:402`에서 증축 토글·라디오 자체가 부담부증여서 숨겨져 gbHasExtension·newConstruction 설정 경로 없음. Plan case 33은 비-부담부 경로 | `feedback_ui_input_path_enumeration` | (b)권장: 비-부담부 case 33 경로(`!isBurdenedGift` + 자가증축)에 노출. §5.4 모순 박스·§16 결정 연동 |

---

## 15. Definition of Done — 자가 점검 체크리스트

### Feature A — 증축

- [ ] 증여세 ① 타입(폼): `BurdenedGiftTransferTaxInput`(`inheritance-gift-estate.types.ts:706`)에 `extensionStdPriceAtAcquisition?: number` 추가
- [ ] 증여세 ① 타입(엔진): `BurdenedGiftInfo`(`lib/tax-engine/types/transfer-burdened-gift.types.ts:31`) — **추가 없음** (최상위 경로 채택)
- [ ] 증여세 ⑨⑫ Zod: `transfer-tax-schema.ts` **propertyBaseShape (최상위)** — 기존 4필드와 동일 블록에 `extensionStdPriceAtAcquisition: z.number().nonnegative().optional()` 추가. ~~`burdenedGiftInfoSchema` 아님~~
- [ ] 증여세 ② hasData: `extensionFloorArea` · `extensionStdPriceAtAcquisition` OR 조건 추가
- [ ] 증여세 ③ normalize: spread 확인 (`extensionStdPriceAtAcquisition` number 필드 통과)
- [ ] 증여세 ④⑬ grep: `gift-burdened-transfer-api.ts` **§114조의2 최상위 블록**에 5필드 존재 (isSelfBuilt·buildingType·constructionDate·extensionFloorArea·extensionStdPriceAtAcquisition) — 모두 body 최상위 (`burdenedGiftInfoMarket` 내부 아님)
- [ ] 증여세 ⑤: extension RadioCard `disabled:true` 제거 · 증축 조건부 2위젯 추가
- [ ] 증여세 ⑧: extension + isSelfBuilt 시 extensionFloorArea>0 + extensionStdPriceAtAcquisition>0 차단
- [ ] 양도세 ① AssetForm: `extensionStdPriceAtAcquisition: string` 추가
- [ ] 양도세 ② initial 2곳: `extensionStdPriceAtAcquisition: ''`
- [ ] 양도세 ③ normalize: `extensionStdPriceAtAcquisition ?? ''`
- [ ] 양도세 ④⑬: `transfer-tax-api.ts` extension 게이트 `parseAmount(extensionStdPriceAtAcquisition)`
- [ ] 양도세 ⑤ SelfBuiltSection: extension 시 `extensionStdPriceAtAcquisition` CurrencyInput + `CompanionAcqPurchaseBlock` 연결
- [ ] 양도세 ⑧: extension + isSelfBuilt 시 `extensionStdPriceAtAcquisition>0` 차단
- [ ] ⑦ 결과 카드: 중립 라벨 "환산가액적용가산세 (§114조의2①)" + 상세 펼침 산식 "환산취득가액 × 5%"
- [ ] 양도세 ⑨⑫ Zod (양도세 단독 경로): `transfer-tax-schema.ts`에 `extensionStdPriceAtAcquisition: z.number().nonnegative().optional()` 추가 (증여세는 burdenedGiftInfoSchema 별도 — 위 항목)
- [ ] 양도세 ⑭ Route: `extensionStdPriceAtAcquisition: data.extensionStdPriceAtAcquisition` 명시 추가
- [ ] ⑫⑬⑭ grep 자가점검 3파일 모두 확인

### Feature B — general_building extensionFloorArea85

- [ ] ① AssetForm: `gbExtensionFloorArea85: string` 추가
- [ ] ② initial 2곳: `gbExtensionFloorArea85: ''`
- [ ] ③ normalize: `gbExtensionFloorArea85 ?? ''`
- [ ] ④⑬ API helpers `buildExtensionInfo`: `extensionFloorArea85` 추가
- [ ] ⑫ Zod: `transfer-tax-building-schemas.ts:93` `extensionInfo` `z.object()`에 `extensionFloorArea85: z.number().nonnegative().optional()` 추가 (passthrough 없음 → 누락 시 침묵 strip)
- [ ] 엔진 건물2 카드 push(`general-building-extension.ts:344`): `buildingType:"extension"` + `extensionFloorArea`(=extensionFloorArea85) 동시 설정
- [ ] ⑤ GeneralBuildingBlock: 자가증축 조건부 `gbExtensionFloorArea85` DecimalInput 노출 (게이트 경로 §5.4·§16 결정 연동)
- [ ] ⑧ validate: `newConstruction` 시 `gbExtensionFloorArea85` 경고/차단 (결정 필요)
- [ ] 엔진 B-2(1)(2)(3) 이행 확인 (엔진 시니어 담당)

### 공통

- [ ] UI ↔ validate 모순 없음 (§8.4 점검표)
- [ ] useEffect 사용 없음 — 모든 cross-field는 onChange 직접 set
- [ ] 자동 안분 fallback 없음 — 미입력은 validate 차단
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/` 통과
- [ ] P2-1~P2-9 anchor 전수 원단위 `toBe()` 통과 (파일: `__tests__/tax-engine/transfer-tax/burdened-gift-114-2-penalty-phase2.test.ts`)
- [ ] 3대 핵심 정책(useEffect 금지·자동 fallback 금지·validation 8번째 동기화) 위반 없음
- [ ] E2E: `e2e/gift-burdened-transfer.spec.ts` P2 시리즈 통과 (worktree E2E_PORT=3101)
- [ ] E2E: `e2e/transfer-self-built-extension.spec.ts` 통과
- [ ] 브라우저 수동 확인 미수행 → E2E로 대체 (명시)

---

## 16. Do 전 확정 필요 미해소 결정 (UI 관점)

| 결정 항목 | 옵션 | 현 상태 |
|---|---|---|
| 양도세 단독(비-부담부) 자가건축 증축 K-5 포함 여부 | (a) 포함 — 공용 헬퍼 `calcExtensionEstimatedBase` 추출 후 통상 converted 경로·부담부 양쪽 호출 / (b) SCOPE OUT | ✅ **(a) 확정** — 공용 헬퍼 단일진실. §8.2 validate는 **전 경로 차단** (부담부·비-부담부 모두 엔진이 값을 소비). anchor P2-1b 추가. |
| Feature B `gbExtensionFloorArea85` 위젯 노출 경로 | (a) 부담부증여 확장(토글·라디오 재노출) / **(b) 비-부담부 case 33 경로(`!isBurdenedGift`+자가증축) — 권장(Plan 일치)** | 🔍 **결정 필요** — Do 전 확정. §5.4 모순 박스 참조. 현행 초안 `isBurdenedGift` 게이트는 데이터 도달 불가(토글·라디오 자체가 부담부에서 숨김). 본 reconcile 범위 밖. |
| `gbExtensionFloorArea85` 미입력 시 차단 vs 경고 | (a) 차단(>0 필수) / (b) 경고 후 통과 (가산세 침묵 미발동) | 🔍 **결정 필요** — Do 전 확정 |
| 엔진 result `penaltyBuildingType` echo 필드 vs 중립 라벨 | (a) echo 추가 (엔진 수정) / **(b) 중립 라벨 통일** | ✅ **(b) 확정** — "감정가액 또는 환산취득가액 적용 가산세 (§114조의2①)". 엔진 result 타입 변경 0. |

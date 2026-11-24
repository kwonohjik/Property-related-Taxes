# 「비사업용 토지 판정」 메뉴 — 화면·클라이언트(①~⑧) 계획서

> 상태: **Plan v1 (UI 시니어 · 2026-11-25)** · 사용자 결정 D1~D6 확정(재오픈 금지) · 이 문서가 새로 올리는 사용자 결정은 §14 UQ-1~UQ-4뿐이다.
> 범위: 양도세 계산기 Step4 「판정 도움」 입력 위젯을 **그대로 재사용**하는 별도 메뉴(토지 단독 1필지). 판정 결과는 이력(IndexedDB)에 저장하고, 결과 화면에서 **사실만** 양도세 계산기로 넘긴다(계산기가 같은 엔진으로 다시 판정).
> 짝 문서: `nbl-judgment-menu.engine.plan.md`(엔진 시니어 — 새 API route가 양도세 NBL Zod 스키마·서버 매퍼를 단일 소스로 재사용). 이 문서를 쓰는 도중 짝 문서가 워크트리에 올라와 **요청·응답·파일명·엔진 Q-1/Q-2를 대조했다(§13 — 어긋난 곳은 §13.2에 표로)**. **남은 어긋남은 메인 세션이 합친다.** 번호 충돌을 피해 이 문서의 결정·미검증은 **UD-n / UQ-n / UV-n**이다(엔진 문서는 D-E·Q·V).
> 모든 file:line은 워크트리 `Property-related-Taxes-nbl-menu`(origin/master `0cbca41ef`) 실측. probe 4건(`/private/tmp/claude-501/-Users-mynote-workspace-Property-related-Taxes/982ffdcd-e9b2-4f9e-8072-de56dbed7cc0/scratchpad/nbl-menu-ui/probe{1,2,3,4}.ts`, `npx tsx --tsconfig tsconfig.json`)으로 배관을 실행해 확인했다. **tsc·vitest 전체·브라우저 확인은 이 세션에서 하지 않았다**(§15 UV-1).

---


## 사용자 결정 2차 (2026-11-25 · 메인 세션 기록 — 이 절이 본문 Q/UQ 추천보다 우선)

| 번호 | 결정 | 본문 추천과의 차이 |
|---|---|---|
| Q-1 = UQ-1 | **(c) 이월과세(`carryover_gift`)를 받고 A·B 둘 다 판정** | 추천 (b) 제외 → **번복** |
| Q-2 = UQ-2 | 세율 숫자 없이 안내만 — 결과 카드 `judgmentOnly`로 「+10%p」 단정 2곳을 「세율·장특 적용은 양도세 계산기에서」로 | 추천 그대로 |
| Q-3 | 6지목 전부(주택부수토지·별장 포함) | 추천 그대로 |
| UQ-4 | 기타토지 연접 다필지 입력 노출 | 추천 그대로 |
| UQ-3 | 계산기 출처 줄 v1 제외(사용자에게 묻지 않은 기본값 — 메인 세션 판단) | 추천 그대로 |

### Q-1 (c) 설계 골자 — Do에서 확정·실측
- **엔진/API**: 시나리오 B 입력은 기존 단일 소스 `buildNblEngineInputGiftBasis(raw, giftRegistryDate)`(`lib/calc/non-business-land-request.ts:101`)를 그대로 쓴다 — 계산기 ⑭도 같은 함수를 부른다(`app/api/calc/transfer/engine-input.ts:278`). 요청에 증여 등기접수일(`carryoverGiftRegistryDate`)을 더하고, 이월과세이면 응답에 `judgmentIfCarryoverExcluded`(B)를 함께 싣는다. A = 원 raw(증여자 취득일 기산), B = 수증일 기산.
- **parity**: A는 계산기 시나리오 A의 `nonBusinessLandJudgmentDetail`, B는 시나리오 B의 그것과 각각 일치해야 한다(앵커 추가).
- **어느 쪽이 적용되는가는 메뉴가 단정하지 않는다**: §97의2②(1호 수용 2년 이전 증여·2호 1세대1주택·3호 세액 비교)와 ①의 10년 기간(③ 등기부 소유기간으로 셈)으로 갈리므로, 결과 화면은 A·B를 나란히 보이고 「적용 여부는 양도세 계산기에서 세액 비교로 정해집니다」를 고지한다.
- **UI ①**: 취득원인에 「이월과세(배우자·직계존비속 증여)」 추가 — 증여자 취득일(`carryover.donorAcquisitionDate`)·증여 등기접수일(`carryover.giftRegistryDate`) 칸. 계산기의 기존 칸·⑧ 규칙(`lib/calc/transfer-tax-api-carryover.ts:99` 등)을 재사용하고 새 규칙을 만들지 않는다.
- **넘기기**: 이월과세 칸도 그대로 계산기 폼에 쓴다(계산기가 A/B 세액 비교로 확정).

## 0. 한눈에

| 항목 | 내용 |
|---|---|
| 메뉴 | 홈 「비사업용 토지 판정」(`/calc/non-business-land?new=1`) — 「다주택 중과 판정」 바로 뒤(D4) |
| 단계 | ① 토지 기본 → ② 사업용 의제·지목 → ③ 부득이한 사유·도시편입일·양도일 의제 → ④ 판정 결과 (D2) |
| **Store 결정** | **`TransferFormData` 그대로**(별칭 `NblJudgmentFormData`)를 새 store `useNblJudgmentStore`에 둔다 — 토지 1건은 `assets[0]`(`assetKind:"land"`, `isNonBusinessLand:true`, `nblUseDetailedJudgment:true` 고정). 위젯은 `asset={assets[0]}` `onAssetChange={patch=>updateAsset(patch)}` `transferDate={formData.transferDate}`만 받으면 **수정 없이** 붙는다(§3) |
| 컨테이너 분할 | `NblSectionContainer`에 **선택 prop `part?: "judge" \| "grace"`** 하나를 더한다. 미지정이면 DOM 한 글자도 안 바뀐다. 블록을 새 컴포넌트로 옮기지 않는다(§4) |
| ④ 변환·⑧ | 계산기의 `buildNonBusinessLandRaw`·`validateNblDetailedJudgment`를 **그대로** 부른다(menu는 ①의 몇 칸만 따로 검증) |
| 결과 | `NonBusinessLandResultCard` 재사용 — 세율 문구 2곳만 끄는 **선택 prop `judgmentOnly`**(≈8줄, 미지정이면 현행 그대로) + 메뉴 전용 머리(결론 배지·판정 전제 요약)·입력 반영 현황(엔진 `inputEffects`)·계산기 넘기기 카드(§6) |
| 이력 | 새 `LocalTaxType` `non_business_land_judgment` — 등록 지점 12곳·8파일(§8) |
| 넘기기 | `lib/calc/nbl-judgment-handoff.ts` 단일 헬퍼 `openTransferWithNblFacts` — 사실(`TransferFormData` 통째)만 쓰고 `setStep(0)` + `router.push("/calc/transfer-tax")`; 계산기는 `isNonBusinessLand && nblUseDetailedJudgment`가 이미 켜져 「판정 도움 필요」로 열린다(§7) |
| 신규 파일 | 약 22개(§12) · 기존 NBL 파일 수정은 **2개**(`NblSectionContainer.tsx` `part` +≈12줄 · `NonBusinessLandResultCard.tsx` `judgmentOnly` +≈8줄 — 둘 다 선택 prop 삽입, PR-1 한 묶음) + 이력 등록 8파일·홈 메뉴 1곳(NBL 아님) |
| 사용자 결정 | UQ-1(이월과세 — 엔진 Q-1과 **같은 질문**) · UQ-2(결과의 세율 문구 — 엔진 Q-2와 **같은 질문**) · UQ-3(계산기 출처 줄) · UQ-4(연접 다필지 입력 노출) |

---

## 1. 현행 사실 (실측)

### 1.1 위젯은 전부 `{asset, onAssetChange, transferDate?}` 규격이다

| 위젯 | props | 비-NBL 입력 의존(① 화면이 채워야 하는 것) | 네트워크 |
|---|---|---|---|
| `NblSectionContainer`(`components/calc/transfer/nbl/NblSectionContainer.tsx:69-85`) | `asset, onAssetChange, transferDate?` | `asset.reductions`의 자경 편입일 fallback(`:87-94`) · `addressJibun/addressRoad`(`:103`) · `acquisitionSigunguCode`(`lib/calc/nbl-land-sigungu.ts` `nblLandSigunguCodeOf`) · 의제 판정(`evaluateUnconditionalExemption(asset, transferDate)` `:80`) | — |
| `UnconditionalExemptionSection`(`:17-21`) | `asset, onAssetChange, status` | `acquisitionCause`·`nonHeirBequest`·`acquisitionDate`(`:77-89`) · `expropriationNoticeDate`(`:143`) | — |
| `ResidenceHistorySection` | `asset, onAssetChange, landType?` | — | `AddressSearch`(거주지 — `:9,100`) |
| `Farmland/Forest/PastureDetailSection` | `asset, onAssetChange` | `InheritanceWithin3YearsNotice`가 `acquisitionCause`·`nonHeirBequest`·`acquisitionDate`를 읽는다(`shared/InheritanceWithin3YearsNotice.tsx:26-39`) | — |
| `HousingLand/VillaLand/OtherLandDetailSection` | `+ transferDate?` | `OtherLandDetailSection.tsx:376-378`·`RevenuePeriodSection.tsx:79,109-114`: `addressJibun`·`acquisitionArea`·지분(`getOwnershipRatio(asset)`) | `lookupLandPrice`(공시지가) |
| `GracePeriodSection`(NBL — `components/calc/transfer/nbl/GracePeriodSection.tsx:52-61`) | `asset, onAssetChange, transferDate?` | — | — |
| `DeemedTransferSection`(`:32-37`) | `asset, onAssetChange` | — | — |
| `NblUrbanZoneCheckButton`(`NblLandAutoFetch.tsx:112`) | `jibun, transferDate` | `addressJibun` | `lookupLandPrice` |

- **store·router 의존 위젯은 없다** — `components/calc/transfer/nbl` 전체에서 `Store`/`useRouter` grep은 `NblScreeningToggle`의 변수명뿐이다.
- ⚠️ 이름 충돌: `GracePeriodSection`이 둘이다 — NBL 부득이한 사유(`components/calc/transfer/nbl/GracePeriodSection.tsx`)와 다주택 중과 한시 유예(`app/calc/transfer-tax/steps/step4-sections/GracePeriodSection.tsx`). 메뉴는 **앞의 것만** 쓴다(「같은 라벨 카드≠같은 컴포넌트」).
- `NblScreeningToggle`(「비사업용 토지 여부 검토」 토글 + 판정 상태 라디오 + 지정지역 질문 — `NblScreeningToggle.tsx:28-88`)은 계산기 전용이라 **메뉴에 쓰지 않는다**(메뉴는 항상 정밀 판정). 지정지역 질문(8호 세율 유예 요건)은 UQ-2와 묶인다.

### 1.2 컨테이너의 구조 (D2 분할의 근거)

`NblSectionContainer.tsx` 본문: 접힘 분기 `:105-123`(`!nblUseDetailedJudgment`) → 머리·「접기」 `:124-132`(접기 onClick `:128`이 `nblUseDetailedJudgment:false`를 쓴다) → 이월과세 안내 `:136` → ① 무조건 면제 `:139` → 래퍼 `data-testid="nbl-per-category"` `:145-152`(`inert={exemptionStatus.isExempt ? true : undefined}` `:151`) 안에 ② 지목·용도지역 → ③ 소재지·재촌(`:194~`) → ④ 지목별 세부 `:263` → ⑤ 도시편입일 `:275` → ⑥ 부득이한 사유 `:295` → ⑦ 양도일 의제 `:300`.
- **의제 성립 시 ②~⑦ 전체가 한 래퍼에서 비활성**이다. D2 「②에서 의제가 지목별 입력을 비활성으로 만드는 현행 유지」는 래퍼가 ②(지목 ~ 세부)를 감싸고 ③(⑤~⑦)도 같은 래퍼 아래 있어야 성립한다.
- 이 컨테이너는 계산기에서 **두 곳**에 마운트된다 — `SpecialSituationSection.tsx:140`(주 자산)·`asset-sections/AssetSectionExtras.tsx:73`(함께 양도 컴패니언). 둘 다 `part`를 넘기지 않는다.
- **소스 문자열 anchor가 컨테이너를 고정한다**: `__tests__/components/ui-review-batch3.anchor.test.tsx:230-231`이 `s.contains("inert={exemptionStatus.isExempt")`를 읽는다 → 래퍼를 다른 컴포넌트로 옮기는 분할은 이 anchor를 깬다. 그리고 컨테이너를 **렌더하는** anchor 5개 파일(`nbl2611-b1-input-scope`·`nbl2611-b2-input-screens`·`nbl-expropriation-prefill-gate`·`nbl-ownership-ratio-resort-gate`·`ui-review-batch2`)이 calc DOM의 회귀 안전망이다.

### 1.3 ④ 변환·⑧ 검증은 메뉴 전용 폼에서도 그대로 돈다 (probe 실측)

- probe1: `createDefaultTransferFormData()`(자산 1건 — `lib/stores/calc-wizard-store.ts:206-211`)의 `assets[0]`을 `{assetKind:"land", isNonBusinessLand:true, nblUseDetailedJudgment:true, acquisitionDate, acquisitionArea, nblLandType:"farmland", nblZoneType:"agriculture_forest", addressJibun}`로만 채우면 `buildNonBusinessLandRaw(asset, transferDate)`가 **정의된 raw(147키)** 를 돌려주고 `validateNblDetailedJudgment(...)`는 `null`이다. 지목을 비우면 raw는 `undefined`이고 ⑧은 「지목을 선택하세요」다(`non-business-land-request.ts:185-198`의 게이트와 `transfer-tax-validate-nbl.ts:114-115`가 같은 조건 — 3중 패턴 유지).
- `buildNonBusinessLandRaw`가 읽는 비-`nbl*` 자산 필드: `assetKind`·`acquisitionArea`·`nblAcquisitionDateOf(asset)`(= 취득일, 이월과세는 증여자 취득일 — `nbl-unconditional-exemption-status.ts:185-187`)·`transferCause`·`expropriationNoticeDate`·`acquisitionCause`·`decedentAcquisitionDate`·`nonHeirBequest`·`latitude/longitude`·`ownershipNumerator/Denominator`·`acquisitionSigunguCode`(`non-business-land-request.ts:212-267`). **이 목록이 ① 화면이 채워야 할 필드의 상한이다.**
- 양도세 ⑧이 NBL 검증을 **취득원인 분기보다 앞에서** 한 번 부른다(`transfer-tax-validate-acquisition.ts:369-372`) — 메뉴 ⑧도 같은 함수를 부르면 동일 규칙이다.

### 1.4 판정 → 계산기 넘기기 선례(1주택)와 우리가 닮는 점·다른 점

- 선례 헬퍼 `lib/calc/one-house-judgment-handoff.ts`: 쓰기(`applyOneHouseFactsToTransferForm` `:209-221`)와 이동(`openTransferWithOneHouseFacts` `:230-247`)을 분리하고 `clearResult()` → `updateFormData(patch)` → `setStep(0)` → `router.push("/calc/transfer-tax")` 순서. 이전 물건의 계산기 전용 선택을 `undefined`로 비운다(`:165-173` · anchor `__tests__/calc/handoff-patch-keys-s11-7.anchor.test.ts`).
- 선례는 판정 폼이 `TransferFormData`의 **슈퍼셋**이라 키 정리 작업이 있다(`one-house-judgment-handoff.ts:86-110`). 우리 폼은 **슈퍼셋이 아니라 동일 타입**이라 그 정리가 필요 없다 — 대신 «계산기 쪽 stale 키»(`sourceJudgment*`·`importedOneHouseFacts`·`assetSplitMode`·`regionCode`·`sellingHouseExclusion`·`gracePeriod`)를 `undefined`로 덮는 것만 한다(§7).
- 출처 줄(`sourceJudgmentId/Menu` + `OneHouseJudgmentProvenanceLine` 등 6파일)은 1주택·중과 두 메뉴 전용이다(`lib/stores/calc-wizard-form.types.ts:522` `sourceJudgmentMenu: "one_house" | "surcharge"` · `OpenSourceJudgmentLink.tsx:34` `rec.taxType !== "one_house_exemption"`) → **v1 제외**(UQ-3).

### 1.5 이력 등록 지점은 12곳·8파일이다 (1주택·증여이익 선례 실측)

`lib/storage/types.ts:11-27`(`LOCAL_TAX_TYPES`) · `tax-type-routes.ts:18-30`(`Record<LocalTaxType,string>` — 누락 시 tsc 오류) · `title-generator.ts:16-21`(`TAX_LABEL` Record — 누락 시 tsc 오류)+`:196-212`(제목) · `business-key.ts:85-95`(dedup 키) · `lib/calc/history-resume-entry.ts:116-141` · `app/history/HistoryClient.tsx:38-49`(필터 — 가드 R-5) `:97-104`(카드 요약) `:544-551`(「판정:」 줄) · `components/history/HistoryDetailDrawer.tsx:84-118`(요약 항목) `:262-272`(머리 값) · `supabase/migrations/20260928000001_add_gift_deemed_tax_type.sql`(CHECK 제약 재작성 선례 — 런타임 영향 없음, LocalTaxType과 같은 값 유지). 가드: `__tests__/lib/storage/local-tax-type-registration.guard.test.ts` R-1~R-8, `calc-route-autosave-reach.guard.test.ts` AR-1(page→import 그래프가 `useAutoSaveCalculation(` 호출에 닿아야 통과).

### 1.6 홈

`app/page.tsx:82-88`이 「다주택 중과 판정」 — 14개 메뉴(`grep -c "^    href:"`=14), lg 4열이라 15번째도 **4행**(`e2e/home-menu-layout.spec.ts`가 1280×720 한 화면 fit을 단언). 완화하지 않는다.

---

## 2. 화면 구성 (4단계)

`app/calc/non-business-land/` — 오케스트레이터 `NblJudgmentCalculator.tsx` + `steps/StepLand.tsx`(①)·`StepJudge.tsx`(②)·`StepGrace.tsx`(③)·`StepResult.tsx`(④). 1주택 메뉴는 파일명≠화면 순서라 혼동 사고를 냈다(`OneHouseJudgmentCalculator.tsx:47-59`) — **이 메뉴는 파일명이 의미를 말한다**(`StepResult` 선례: `app/calc/multi-house-surcharge/steps/StepResult.tsx`). 단계 라벨 정본은 `lib/calc/nbl-judgment-steps.ts` 한 곳(`NBL_JUDGMENT_STEPS`) — 1주택은 오케스트레이터·사이드바에 같은 배열이 두 벌이라 «한쪽만 고치면 갈린다» 주석이 붙어 있다(`OneHouseJudgmentSidebar.tsx:19`).

**네비게이션**(`components/calc/CLAUDE.md` 「네비게이션 규칙」 · 1주택 오케스트레이터 `OneHouseJudgmentCalculator.tsx:305-327,413-437`): 머리 = 제목·`HomeButton`·(2단계부터) `NavButton 이전`·`ResetButton`(확인 다이얼로그 내장) · 하단 = `WizardBackNav`(1단계 뒤로가기 = 홈) + ①②는 `NavButton 다음`, ③은 `CtaButton` 「판정 결과 보기」(`data-testid="nbl-judgment-judge-cta"`) · 결과의 「입력 수정」은 **마지막 입력 단계(③)** 로 복귀(첫 화면 아님). ②·③ 머리에는 각각 `SectionHeader`(「② 사업용 의제·지목」·「③ 부득이한 사유·편입·의제일」)를 둔다 — 컨테이너 머리(「비사업용 토지 정밀 판정」)는 `part` 지정 시 숨기므로 메뉴가 자기 머리를 가진다.

### ① 토지 기본 — `StepLand` (ToneCard 3장, 섹션 번호 1-A~1-C — 3개 이상 연속이라 색상 카드 패턴 강제)

| 카드 | tone | 위젯 | 필드(`AssetForm`) | 비고 |
|---|---|---|---|---|
| 1-A 물건 | sky(면적·규모) | `AddressSearch disableUnits`(`address-search.tsx:74-84` — NBL 재촌용 경량 모드) · `DecimalInput` 면적(㎡) · `OwnershipRatioBlock`(`transfer/OwnershipRatioInput.tsx:125`) | `addressRoad/Jibun/buildingName/addressDetail/latitude/longitude/acquisitionSigunguCode` · `acquisitionArea`+`transferArea` · `ownershipNumerator/Denominator/ownershipRemainderThirdParty` | 소재지 필수(§9 UD-2). 면적은 `{acquisitionArea:v, transferArea:v}` 동시 기록 — `AssetAreaSection.tsx:401-403`의 `same` 시나리오와 같다(일부 양도 `partial`·환지는 이 메뉴가 받지 않는다 — 안내문 1줄) |
| 1-B 취득 | amber(취득) | `RadioCardGroup`(매매·상속·증여 — `acquisitionCause`) → `DateInput` 취득일 → (상속) `DateInput` 피상속인 취득일 + `ToggleCard` 「상속인이 아닌 사람이 유증·사인증여로 받음」 | `acquisitionCause` · `acquisitionDate`(날짜 patch는 `buildingDatePatch(cause, v)` — 상속이면 3키 동시 기록, `transfer-land-part-cause.ts:279-284`) · `decedentAcquisitionDate` · `nonHeirBequest` | **UI 순서 = 계산 순서**: 취득원인(분기) → 취득일(라벨이 원인에 따라 「취득일」/「취득일 (상속개시일)」/「취득일 (증여 등기접수일)」) → 상속 전용 칸. 라벨에 「취득일」을 남기는 이유: `InheritanceWithin3YearsNotice`·`UnconditionalExemptionSection:89`가 「취득일 칸」을 가리킨다. 이월과세·신축·부담부증여는 선택지에 없다(UQ-1) |
| 1-C 양도 | emerald(양도시점) | `DateInput` 양도일 | `transferDate`(폼-전역) | 라벨 「양도일 (양도 예정일 포함)」 |

- 번호 배지 부모 주입: `<ToneCard tone sectionNum="1-A" title=...>`(`components/calc/CLAUDE.md` 「다-섹션」 규칙). 안내·조문 배지는 `LawArticleModal`/`LAW_BADGE_CLASS`.
- 소재지 `onChange`(주소 선택 후 PNU/좌표 → 시·군·구 10자리)는 `AssetSectionBasic.tsx:289-404`에 인라인이다. 같은 계산을 **새 leaf `lib/calc/nbl-judgment-address-patch.ts`**(`addressValueToAssetPatch(v, asset)` — 도로명·지번·건물·상세·좌표·`acquisitionSigunguCode`만, 비동기 `resolveSigunguCode` 포함)로 두고 메뉴만 쓴다. `AssetSectionBasic`/1주택 Step3의 두 복제는 건드리지 않는다(Surgical — 정리는 §15 UV-8).
  - 이 파생이 **빠지면** 컨테이너의 «양도 물건 소재지 자동 입력됨»(`NblSectionContainer.tsx:102-103`·표시) · ④의 `nblLandSigunguCodeOf` fallback · ⑧이 모두 빈 코드로 돌아 농지·임야에서 사용자가 시·군·구를 손으로 골라야 한다(`nbl-land-sigungu.ts` 머리 주석).

### ② 사업용 의제·지목 — `StepJudge`

`<NblSectionContainer part="judge" asset onAssetChange transferDate />` — 이월과세 안내(`:136`) → ① 무조건 면제(`:139`) → 래퍼(`nbl-per-category`) 안의 지목·용도지역·소재지 행정구역·재촌·지목별 세부(`:145-272`). 의제 성립 시 래퍼가 `inert`+`opacity-50`으로 비활성 — **계산기와 같은 화면 안에서 같은 동작**(D2).

### ③ 부득이한 사유·도시편입일·양도일 의제 — `StepGrace`

`<NblSectionContainer part="grace" .../>` — 래퍼 안의 ⑤ 도시편입일(`consumesUrbanIncorporationDate` 지목만 `:275-294`) · ⑥ 부득이한 사유(`:295-299`) · ⑦ 양도일 의제(`isDeemedTransferApplicable` 지목만 `:300-306`). 의제가 성립해 있으면 **같은 래퍼가 ③ 전체를 비활성**으로 만들므로, 위에 메뉴 전용 안내 `ToneCard`(표시 전용 — `evaluateUnconditionalExemption`을 컨테이너와 같은 인자로 부른다)를 한 장 둔다: 「무조건 사업용 의제가 성립해 이 단계의 입력은 판정에 쓰이지 않습니다」. 지목을 아직 고르지 않았으면 ⑤·⑦은 게이트로 숨고 ⑥만 보인다(컨테이너의 현행 동작 그대로).

### ④ 판정 결과 — `StepResult` (§6)

---

## 3. Store 설계 — 질문 1의 답

**결정: 새 타입을 만들지 않는다.** `NblJudgmentFormData = TransferFormData`(별칭). 근거:

1. 위젯이 `AssetForm`에 묶여 있고(§1.1) ④·⑧ leaf도 `AssetForm`을 받는다(`buildNonBusinessLandRaw(asset, transferDate)`·`validateNblDetailedJudgment(asset, label, transferDate, …)`). 새 모양을 만들면 어댑터가 필요하고 그 어댑터가 dual truth다.
2. 이력 제목·dedup 키·카드 요약이 이미 `inputData.assets[0]` + `inputData.transferDate`를 읽는다(`title-generator.ts` `extractAddress`/`extractTransferDate`, `business-key.ts:85-95` — 1주택 메뉴가 같은 이유로 슈퍼셋을 택했다 `one-house-judgment-form.types.ts:1-31`). probe2: 메뉴형 폼에서 `extractAddress`·`extractTransferDate`·`extractBusinessKey("one_house_exemption", f)`가 `addr:서울 강남구 테스트동 1-1|2026.06.01`을 돌려준다.
3. 넘기기가 «같은 타입을 계산기 store에 쓰는 일»이 된다(§7).
4. 정규화는 계산기의 `migrateAsset`(`lib/stores/calc-wizard-asset-migrate.ts:52`)을 그대로 쓴다 — 그 leaf를 빠뜨려 결함을 낸 전례가 있다(`one-house-judgment-form.types.ts:166-174`).

대가: 폼에 이 메뉴가 안 읽는 키가 많다 — probe5 실측: 초기 폼 최상위 141키 + 자산 1건 569키, `JSON.stringify` 약 23KB. sessionStorage·이력 record가 그만큼이다 — 1주택 메뉴(= 같은 폼 + 추가 필드)와 같은 규모(§15 UV-7). 작게 쪼개는 `Pick<…>`는 TS2740으로 성립하지 않는 것을 1주택이 실측했다(`one-house-judgment-form.types.ts:12-14`).

**① 타입 · ② initial · ③ normalize** — `lib/stores/nbl-judgment-form.types.ts`:
- `createInitialNblJudgmentForm()` = `{ ...createDefaultTransferFormData(), assets: [forceNblFacts(base.assets[0])] }`(기본 폼이 이미 자산 1건을 갖는다 — probe1). `forceNblFacts(asset)` = `{...asset, assetKind:"land", isNonBusinessLand:true, nblUseDetailedJudgment:true}`. 초기 `acquisitionCause`는 기본 `"purchase"`(`calc-wizard-asset-factory.ts:172`).
- `normalizeNblJudgmentForm(raw)` = `{...initial, ...raw, assets: [forceNblFacts(migrateAsset(raw.assets?.[0]))]}` — **초기값 위에 덮어쓰기만**(구 스키마 판별 금지 — 계산기 store가 키 화이트리스트 판별로 «F5마다 자산 전부 소실»을 낸 전례 `one-house-judgment-store.ts:173-177`). 자산은 **1건으로 자른다**(D5 — 이력·세션에 2건이 들어와도 첫 건만).
- **3중 고정**: initial · normalize · store 액션 `updateAsset(patch)`가 모두 `forceNblFacts`를 거친다 → 접기·토글로 정밀 판정이 꺼지는 경로가 구조적으로 없다(컨테이너 `접기`는 `part` 지정 시 숨김 — §4).

**store** `lib/stores/nbl-judgment-store.ts`(1주택 `one-house-judgment-store.ts:97-191` 패턴, 단 슬롯 하나): `{ currentStep, formData, result, resultClientId, error, isLoading }` + `setStep · updateFormData · updateAsset · setResult(result, clientId) · setError · setLoading · reset`. persist key `nbl-judgment-wizard`(sessionStorage) · `partialize: {formData}` · `onRehydrateStorage`에서 `currentStep=0·result=null`과 `normalizeNblJudgmentForm`. `updateFormData`/`updateAsset`은 **같은 `set`에서 `result:null, resultClientId:null`**(입력이 바뀌면 결과 무효화 — `one-house-judgment-store.ts:109-121`). 의뢰인(세무사 모드) 변경 시 결과 폐기 구독(`:201-207`)을 그대로 둔다. 모듈 최상위 `useProfessionalStore.subscribe`는 store 이벤트이지 `useEffect` 미러링이 아니다.

selector는 atomic(`useNblJudgmentStore(s => s.formData)`) — 새 객체를 반환하는 selector 금지.

---

## 4. `NblSectionContainer` 분할 — 질문 2의 답

**결정: 선택 prop `part?: "judge" | "grace"` 하나를 컨테이너에 더한다.** 미지정(= 계산기 두 호출처)은 현행과 **바이트 동일한 DOM**이다.

기계적 변경(≈12줄 삽입, 이동·재들여쓰기 없음):

```tsx
// props: part?: "judge" | "grace"   — "judge"=② 의제·지목·세부 / "grace"=③ 도시편입일·부득이·양도일 의제
const showJudge = part === undefined || part === "judge";
const showGrace = part === undefined || part === "grace";
if (!asset.nblUseDetailedJudgment && part === undefined) { …접힘 분기 그대로… }
{part === undefined && ( …머리+접기 그대로… )}
{showJudge && ( <> 이월과세 안내 + UnconditionalExemptionSection </> )}
<div data-testid="nbl-per-category" inert=… className=…>          // 래퍼는 그대로 한 번만
  {showJudge && ( <> 2 공통 · 3 소재지·재촌 · 4 지목별 세부 </> )}
  {showGrace && ( <> 5 도시편입일 · 6 부득이한 사유 · 7 양도일 의제 </> )}
</div>
```

- 왜 «블록을 새 컴포넌트로 추출»이 아닌가: ① `inert={exemptionStatus.isExempt` 소스 anchor(`ui-review-batch3.anchor.test.tsx:230-231`)가 래퍼 위치를 고정한다 ② `exemptionStatus`·`sfIncorporationDate`·`nblIncorpDateIsValid`·`acqSigungu5/Name`(`:80-103`)을 블록마다 다시 만들거나 prop으로 나르게 된다 ③ 이동 diff가 크고 **다른 세션이 NBL 파일을 만지는 중**이라 충돌 확률이 높다. 삽입형은 충돌해도 3-way가 쉽다.
- 의제 비활성(`exemptionStatus.isExempt`)은 컨테이너가 두 단계에서 **각자 같은 `useMemo`로** 계산한다 — 표시 일관성은 같은 leaf(`evaluateUnconditionalExemption`)가 보장한다.
- `part` 지정 시: 머리·「접기」·접힘 분기를 건너뛴다(메뉴는 항상 펼침 — 접기가 `nblUseDetailedJudgment:false`를 쓰면 정밀 판정이 꺼진다 `:128`).
- 계산기 회귀 안전망: 기존 anchor 5파일 + 신규 `nbl-section-container-part.anchor.test.tsx`(§11 U-1)가 `part` 미지정의 DOM 동등성과 `judge ∪ grace = 전체`, `judge ∩ grace = ∅`를 단언한다.
- 선택 정리(별 1줄, PR-1에 함께): `UnconditionalExemptionSection.tsx:148`의 힌트 「①양도정보(공익수용)의 사업인정고시일에서 자동 반영」은 메뉴에서는 «양도정보»가 없어 거짓이다. 「양도 정보에서 공익수용을 입력한 경우 그 사업인정고시일이 자동 반영 · 다르면 직접 수정」으로 바꾸면 양쪽에서 참이다(문구 1줄 — 이 문구를 단언하는 테스트·E2E는 `grep "①양도정보"` 0건 확인 후 실행, §15 UV-9).

---

## 5. ① 필드 ↔ 엔진 필요 필드 — 질문 3의 답

| 필드 | 엔진·판정에서의 용도(근거) | 위젯 | 3중(표시·④·⑧) |
|---|---|---|---|
| `addressJibun/Road` | 이력 dedup·제목 키(`business-key.ts:85-95`) · `NblUrbanZoneCheckButton`·공시지가 조회 입력 | `AddressSearch disableUnits` | ⑧ 소재지 필수(UD-2) |
| `acquisitionSigunguCode`·`latitude/longitude` | 재촌 시·군·구 fallback·30km 직선거리(`non-business-land-request.ts:250-253`) | 주소 선택 patch(위 leaf) | 표시 `NblSectionContainer:102`·④·⑧ 모두 `nblLandSigunguCodeOf` |
| `acquisitionArea` | 면적 안분·기준면적(`form-mapper.ts` `landArea`) | `DecimalInput`(+`transferArea` 동시) | ⑧ `validateNblDetailedJudgment`의 면적 > 0(`transfer-tax-validate-nbl.ts:118-119` — 단, 그 함수는 지목·용도지역 검사(`:114-117`)가 앞서므로 ①에서 같은 문구로 먼저 막는다 §9) |
| `ownershipNumerator/Denominator`·`ownershipRemainderThirdParty` | 공동소유 지분(`deriveOwnershipRatio` `non-business-land-request.ts:44-49`) | `OwnershipRatioBlock` | ⑧ 단건·지분<100%면 「나머지 지분은 타인 소유」 선언 필수(`transfer-tax-validate-asset.ts:385` — probe3 D 실측: 선언 없으면 계산기가 막는다) |
| `acquisitionCause`(+`nonHeirBequest`·`decedentAcquisitionDate`) | 상속 특례·3년·③3호 나목 소급(`form-mapper-helpers.ts:150-185`) | `RadioCardGroup` + 상속 전용 칸 | ⑧ 상속이면 피상속인 취득일 필수(계산기 정합 — probe3 E: 계산기 ⑧이 `decedentAcquisitionDate`를 막는다) |
| `acquisitionDate` | 소유기간 기산(`nblAcquisitionDateOf`) | `DateInput` | ⑧ 필수·양도일 이전(`getAssetDateOrderIssue` — `transfer-tax-validate-asset.ts:86`) |
| `transferDate` | 소유기간 종료·의제·연혁 | `DateInput` | ⑧ 필수 |
| `transferCause`·`expropriationNoticeDate` | 공익수용 의제 단독 트리거 | **받지 않는다** — 기본 `general`/`""`. 공익수용은 ②의 `nblExemptPublicExpropriation` 토글이 자기 고시일을 가진다(`UnconditionalExemptionSection.tsx:131-149`). 계산기 도착 후 양도 정보에서 입력할 수도 있다 | — |

- `reductions`(자경 편입일 fallback)·`isDesignatedArea`·`landNature`는 메뉴가 받지 않는다. 컨테이너의 자경 편입일 안내(`:87-94`)는 `reductions`가 비어 조용히 사라진다(오류 아님).
- **공시지가 자동조회**: 컨테이너 안 `NblLandValueAutoFetchButton`(기타토지 수입금액)·`NblUrbanZoneCheckButton`이 ①의 주소·면적·지분·양도일만으로 동작한다(§1.1). `LandPriceLookupField`(기준시가 칸)는 NBL 위젯이 쓰지 않고(`grep` 0건) 메뉴 ①도 기준시가를 묻지 않으므로 **쓰지 않는다**.
- 받지 않는 것(D5): 함께 양도 컴패니언·축 B 지분 분할·겸용·일반건물·상업용·입주권·감면·양도가액·취득가액·필요경비. 안내문 한 줄로 계산기 이동을 알린다.

---

## 6. ④ 결과 화면 — 질문 4의 답

`components/calc/results/NblJudgmentResultView.tsx`(신규) — 구성:

1. **결론 머리**(`data-testid="nbl-judgment-verdict"`): 배지 「사업용」 / 「비사업용」 / 「일부 비사업용 (면적 안분 N%)」 — 판정 술어는 `lib/calc/nbl-judgment-verdict.ts`(`nblVerdictOf(judgmentLike)` + `nblVerdictFromResult(resultData)` + `nblVerdictLabel`)가 **단일 소스**이고 이력 카드·드로어·결과 머리가 모두 그것을 거친다(1주택 `one-house-judgment-verdict.ts:118-140`와 같은 이유). 읽는 값은 엔진이 낸 `judgment.isNonBusinessLand`·`areaProportioning.nonBusinessRatio`뿐 — 요건을 다시 따지지 않는다. 「일부 비사업용」 의미(`isNonBusinessLand=true`이면서 `0<ratio<1`)는 §15 UV-5로 실측 확정 후 단언한다.
2. **판정 전제 요약**(한 줄 칩): 소재지·지목·취득일(원인)·양도일·면적·지분. 폼에서 읽는 **표시 전용**.
3. **`NonBusinessLandResultCard` 재사용** — `components/calc/NonBusinessLandResultCard.tsx:64`. 이미 다음을 렌더한다: ① 자연어 배너(`:79-97`) · 무조건 의제 강조(`:99-107`) · 양도일 의제(`:109-117`) · 수입금액비율(`:119-207`) · 재산세 분류 근거(`:209-238`) · 기간 분석 3갈래(`:240-299`) · 건축물 이력/업종 영위 표(`:260-271,302`) · 면적 안분 바와 연접 다필지 귀속(`:304-357`) · 재촌 인정 근거(`:358-365`) · 판정 단계 타임라인(`:366-377`) · 「주의사항」 = 엔진 warnings(= **확인 필요**, `:378-391`) · 「적용 법령」 배지(`:392-405`). → 사업용/비사업용 · 기간기준 · 근거 조문 배지 · 의제/유예 반영 · 부분 면적비율 · 확인 필요가 **전부 이미 있다**. 계산기 결과뷰가 쓰는 같은 컴포넌트(`TransferTaxResultView.tsx:531-535`·`ValuationDetailCards.tsx:113-119`).
   - **세율을 말하는 문장은 두 곳뿐이다**(grep `중과|세율|장기보유|+10` — 카드 전체): 배너 `:88-92`(「비사업용 토지 — 기본세율 +10%p 중과 (…장기보유특별공제…)」·「사업용 토지 — 일반세율이 적용됩니다.」)와 면적 안분 안내 `:347-352`(「…중과세(+10%p)가 적용됩니다」). 엔진 계획서가 `judgment.surcharge.additionalRate`는 항상 0.10을 싣고 위기취득(취득 2009.3.16.~2012.12.31.) 토지에서는 틀린 효과를 말하게 된다고 짚었다(엔진 계획서 §8.2 Q-2 근거 · `transfer-tax-rate-calc.ts:78-81` — 중과 배제는 세율 계산 결과인 `nblSurchargeExcluded`가 정한다). 판정 메뉴는 그 값을 갖지 못한다 → **선택 prop `judgmentOnly?: boolean`**(기본 false = 현행 바이트 동일)을 더해 이 두 문장만 판정 중심으로 바꾼다: 배너 「비사업용 토지에 해당합니다.」/「사업용 토지에 해당합니다.」 · 안내 「비사업용 면적분(전체의 N%)이 비사업용으로 판정됩니다. (면적 안분 근거: …)」. 카드의 나머지는 손대지 않는다(UQ-2 추천 (B) · 대안 (A)는 §14).
   - 날짜 필드는 JSON 경유로 string이 된다 — 카드가 이미 안전 처리한다(`:32-35` `formatDeemedDate`; 엔진 계획서 §4.4도 «Date는 이미 문자열»). 다른 표 컴포넌트는 계산기 결과(역시 JSON 경유)에서 쓰이는 경로와 같다는 점만 확인(UV-2).
4. **입력 반영 현황 `ToneCard`**(`data-testid="nbl-judgment-input-effects"`) — 엔진 응답의 `inputEffects`(엔진 계획서 §4.3: `gracePeriods`·`deemedTransfer`·`urbanIncorporation` 각각 `applied | ignored_by_category | overridden_by_unconditional | not_declared`)를 **그대로 읽어** 「입력했지만 판정에 쓰이지 않은 칸」만 한국어로 푼다(`applied`·`not_declared`는 줄을 만들지 않는다 — 0건이면 카드 자체를 숨김). 문구 표는 새 leaf `lib/calc/nbl-judgment-input-effects-text.ts`(표시 전용 — 지목 표를 다시 부르지 않는다 = 이중 진실 금지). 예: `gracePeriods = ignored_by_category` → 「부득이한 사유를 입력했지만 이 지목의 판정에서는 읽지 않아 반영되지 않았습니다 — 확인 필요」 · `overridden_by_unconditional` → 「무조건 사업용 의제가 성립해 판정에 쓰이지 않았습니다」.
5. **세율 한정 안내 한 줄**(`judgmentOnly`가 켜진 결과 아래, `data-testid="nbl-judgment-qualifier-note"`): 「이 판정은 사업용·비사업용 여부만 답합니다. 세율·장기보유특별공제·중과 유예·배제는 양도소득세 계산기에서 정해집니다.」(엔진 계획서 Q-2 (a)와 같은 취지 — 숫자 없음)
6. **계산기 넘기기 카드**(`ToneCard tone="emerald"`): 설명 + `data-testid="nbl-judgment-to-calculator-remaining"` 「계산기에서 더 입력할 값: 양도가액 · 취득가액(상속이면 상속개시일 평가액)」(probe3 A·B·E·F 실측 — §7) + 지분<100% 선언 안내 + 자경 감면 고지 한 줄(엔진 계획서 V-10: 계산기에서 §66 자경 편입 부분감면을 켜면 비워 둔 도시편입일이 감면의 편입일로 채워질 수 있다 — `non-business-land-request.ts:131-140`) + `CtaButton data-testid="nbl-judgment-to-calculator"` 「양도세 계산하기」.
7. `DisclaimerBanner body={JUDGMENT_DISCLAIMER}`(`DisclaimerBanner.tsx:6-7` — 1주택 결과뷰도 같은 것 `OneHouseJudgmentResultView.tsx:527`). `LoginPromptBanner`는 달지 않는다(`components/calc/CLAUDE.md`).

`StepResult`(`steps/StepResult.tsx`)는 1주택 `Step4`(`:28-76`)를 따른다: 마운트 시 1회 가드(`triggered` ref)로 `onJudge()` → 로딩 → 오류(재시도 버튼 「다시 판정하기」) → 결과. 이 effect는 **fetch를 시작할 뿐 store를 미러링하지 않는다**(결과는 비동기 핸들러가 `setResult`) — 선례 따름(UV-10).

---

## 7. 계산기로 넘기기 — 질문 5의 답

**단일 헬퍼 `lib/calc/nbl-judgment-handoff.ts`**:

```ts
export function toTransferFormPatchFromNbl(form: NblJudgmentFormData): Partial<TransferFormData>
export async function openTransferWithNblFacts(form: NblJudgmentFormData, router: AppRouter): Promise<void>
```
1주택의 «쓰기 전용» 짝(`applyOneHouseFactsToTransferForm` — 다건 편집 화면용)은 만들지 않는다 — 호출처가 없다(D6 «판정 불러오기» 없음). 엔진 계획서 §7 E3은 «store 쓰기 + 이동 두 함수 분리»를 선례대로 권했지만 그 분리의 이유(편집 화면에서 이동 함수를 부르면 튕긴다 — `one-house-judgment-handoff.ts:12-21`)는 D6로 사라진다. **patch 빌더(`toTransferFormPatchFromNbl`)를 export**해 anchor가 직접 검증하고, 호출처가 생기면 그때 쓰기-only를 더한다(Simplicity).

`openTransferWithNblFacts` = 선례 `openTransferWithOneHouseFacts`(`:230-247`)와 같은 순서: `await import("@/lib/stores/calc-wizard-store")`(순환 방지) → `clearResult()`(D-16 이전 물건의 결과를 비운다 — `:243`) → `updateFormData(patch)` → `setStep(0)` → `router.push("/calc/transfer-tax")`. **「판정 불러오기」는 만들지 않는다**(D6).

**patch 내용**: `{ ...form }`(= `TransferFormData` 전 키 — 양도일·자산 1건·기본 폼 값) **+ 계산기 stale 키 무효화**: `assetSplitMode, sourceJudgmentId, sourceJudgmentInputHash, sourceJudgmentMenu, importedOneHouseFacts, regionCode, sellingHouseExclusion, gracePeriod`를 `undefined`로 덮는다 — store가 얕은 병합이라 이전 물건의 값이 남기 때문(`handoff-patch-keys-s11-7.anchor.test.ts`가 고정한 규율). 키 목록은 1주택 patch가 `undefined`로 두는 키의 **상위집합**이어야 하고 anchor(§11 U-5 H-2)가 1주택 `toTransferFormPatch(createInitialOneHouseJudgmentForm())`에서 `undefined`인 키를 읽어 대조한다(손 복제 드리프트 방지 — 1주택 파일은 수정하지 않는다).

**계산기가 「판정 도움」으로 열리는 이유(실측)**: `SpecialSituationSection.tsx:138-146`이 `primaryKind === "land" && primary?.isNonBusinessLand && primary?.nblUseDetailedJudgment`면 `NblSectionContainer`를 그린다. patch의 `assets[0]`이 이미 `assetKind:"land"`·두 플래그 true라 **별도 조작이 없다**. 토글·라디오는 `NblScreeningToggle`이 같은 두 값에서 그린다(`NblScreeningToggle.tsx:29,61`: 판정 상태 라디오 value = `nblUseDetailedJudgment ? "detailed" : "completed"`). 취득원인·날짜·지목 등은 계산기 ①~⑤에 그대로 보인다.

**계산기에서 더 넣어야 할 값(probe3 실측)**: 계산기 ⑧(`validateStepDetailed`)에 메뉴 폼을 그대로 넣었을 때 — 매매: ① 「총 양도가액」(`contractTotalPrice`) → ② 「취득가액」(`fixedAcquisitionPrice`), 둘을 채우면 0~3단계 전부 OK. 상속: 위 둘 + 「상속개시일 평가액」(`publishedValueAtInheritance`), 피상속인 취득일은 메뉴가 이미 받는다(probe3 E: 없으면 계산기가 막음 → 메뉴가 필수로 요구하는 근거). 증여: probe3 G — 양도가·취득가 외 추가 요구 없음(다른 취득가액 방식은 미확인 — UV-6). 목록은 `lib/calc/nbl-judgment-handoff-remaining.ts`(`nblHandoffRemainingInputs(form)`)에 두고 anchor가 «이 목록대로 채우면 계산기 ⑧ 0건»을 단언한다(1주택 `judgment-handoff-remaining.ts:1-10`의 I-15와 같은 규율).

**`router.push` 뒤 마운트된 Step1 상태**: 1주택은 다건 편집 화면 때문에 쓰기/이동을 갈랐다(`:12-21`). 이 메뉴는 이동 경로 하나뿐이라 갈림이 없다.

---

## 8. 이력 — 질문 6의 답

| 지점 | 변경 |
|---|---|
| record type | `LOCAL_TAX_TYPES`에 `"non_business_land_judgment"` 추가(`lib/storage/types.ts:11-27`) — `LocalTaxType`·`backup-validate`의 `z.enum`이 파생이라 자동 추종(`backup-validate.ts:47`) |
| 경로 | `TAX_TYPE_ROUTES.non_business_land_judgment = "/calc/non-business-land"`(`tax-type-routes.ts:18-30`) |
| 라벨 | `TAX_LABEL.non_business_land_judgment = "비사업용 토지 판정"`(`title-generator.ts:16-21` — Record라 tsc가 누락을 막는다) · 제목 `비사업용 토지 판정 — {주소} (양도 {날짜})`(`:196-212` 1주택 분기를 본뜸 — 양도 «예정»이라 「양도예정」 문구 규약은 1주택과 같게) |
| dedup 키 | `business-key.ts:85-95` 분기 추가: `addr:{주소}|{양도일}`(세목별 후보 조회가 `[userId+taxType+createdAt]`로 갈려 `addr:` 접두 충돌 없음 — `:87-88` 주석). 주소 없으면 null(content 폴백) |
| 목록 카드 | `HistoryClient.tsx` ① `FILTER_OPTIONS`에 「비사업용 토지 판정」(가드 R-5) ② `extractCardSummary`(`:97-104`)에 주소·「양도예정」 날짜 분기(1주택과 같은 읽기) ③ 금액 자리(`:544-551`)에 「판정: **사업용|비사업용|일부 비사업용**」 — `nblVerdictLabel(record.resultData)` |
| 드로어 | `HistoryDetailDrawer.tsx` ① 머리 라벨 「판정」·값 `nblVerdictLabel`(`:262-272`) ② `extractResultSummaryItems`(`:84-118`)에 1주택식 분기: 판정 · 지목 · 소유기간 일수(엔진 echo가 있을 때만) — 세액 분기보다 **앞**에서 가른다(`:78-83` 주석) |
| 재개 | `history-resume-entry.ts:116-141` 분기: `useNblJudgmentStore.setState({currentStep:0, formData: normalizeNblJudgmentForm(record.inputData), result:null, resultClientId:null, error:null, isLoading:false})` → `router.push(route)`. **결과는 되살리지 않는다**(법령·세율 기준일 의존 — 1주택 `history-resume-entry.ts:117-123` 주석과 같은 이유; ④에서 재판정) |
| DB 제약 | `supabase/migrations/20261125000001_add_non_business_land_judgment_tax_type.sql` — `chk_calculations_tax_type` DROP/ADD(`20260928000001_add_gift_deemed_tax_type.sql` 복제 + 새 값, COMMENT 갱신). 런타임 영향 없음(이력은 IndexedDB) — 값 동기 유지용(선례 `20260921000001`) |
| 가드 | `calc-route-autosave-reach.guard.test.ts` AR-1은 `app/calc/non-business-land/page.tsx`가 `useAutoSaveCalculation(` 호출에 닿으면 자동 통과(예외 목록에 **넣지 않는다**) · `local-tax-type-registration.guard.test.ts`는 전 세목을 순회(R-2·R-3·R-5·R-6)하므로 등록만 하면 통과 + R-4식 단언 1줄 추가 |

저장 호출은 오케스트레이터가 한다(1주택 `OneHouseJudgmentCalculator.tsx:267-275`):
`useAutoSaveCalculation({ taxType:"non_business_land_judgment", inputData: formData, resultData, taxLawVersion: formData.transferDate || today, clientId })` — `resultData`는 **판정이 나온 뒤에만**(`isResult && result !== resultAtMount ? result : null`, `:96`·`:267-268`의 «열기 전부터 있던 결과는 저장 안 함» 가드까지 그대로). 의뢰인 귀속 가드(`:88`)와 응답-폼 귀속 가드(`handleJudge`의 `isCurrent()` `:198-201`)도 같은 형태로 옮긴다.

---

## 9. ⑧ 검증 · ⑥ 사이드바 · 홈 · `?new=1` — 질문 7의 답

### 9.1 계획서가 정하는 결정 (UD-n — 반대하면 알려 달라)

| ID | 결정 | 근거 |
|---|---|---|
| UD-1 | ⑧은 **필드→단계 매핑**으로 단계에 귀속한다. `validateNblDetailedJudgment`를 한 번 돌려(`collectWithFields`로 `field`를 얻는다 — `transfer-tax-validate-field.ts:34-50`) 오류의 `field`가 `nblUrbanIncorporationDate`·`nblDeemedTransferDate`·`nblGracePeriods.*`이면 ③, 그 밖은 ② | 그 함수는 첫 오류만 반환한다(`transfer-tax-validate-nbl.ts:104~`). ③ 소유 필드 3종은 실측(`fieldError` grep): `nblUrbanIncorporationDate`(`:253`)·`nblDeemedTransferDate`(`:261,267`)·`nblGracePeriods.${gi}.*`(`:371-373`, `graceRowIssue`). 매핑에 없는 field는 ② 기본. **probe4 실측**: 의제 불성립 + 부득이 행 미완 → `토지: … 유예기간 — 개시일을 입력하세요.` / field `nblGracePeriods.0.anchorDate`(③ 귀속) · 같은 입력이라도 의제 성립(상속개시 2005·양도 2009-06-01·농지)이면 `null`(③ 규칙이 막지 않음) |
| UD-2 | 소재지 **필수** | 계산기 ⑧이 필수(`transfer-tax-validate-asset.ts:191-192`) · 이력 dedup 키가 주소(`business-key.ts:85-95`) · 시·군·구 fallback·공시지가 조회가 주소에 걸린다. 「입력한 주소 그대로 사용」 경로가 있어 부담이 작다 |
| UD-3 | 상속이면 피상속인 취득일 **필수** | 계산기 ⑧이 필수(`transfer-tax-validate-acquisition.ts:139-140` · probe3 E). 안 받으면 «메뉴 통과 → 계산기에서 막힘» |
| UD-4 | 지분<100%이면 「나머지 지분은 타인 소유」 선언 **필수** | 같은 이유(`transfer-tax-validate-asset.ts:385` · probe3 D) + 축 B(나머지도 내 것·취득일 다름)에서는 판정 자체가 지분별로 갈린다(별 계획서 `docs/00-pm/axis-b-land-share-nbl-detailed-judgment.plan.md` — **읽지 않음**, UV-4) |
| UD-5 | 경고(`severity:"warning"`) 계층은 v1에 **두지 않는다** | 메뉴 입력 자체에 «진행은 되지만 확인이 필요한» 사실이 없다(확인 필요는 엔진 warnings가 결과 카드에 싣는다 — §6 3). `ValidationWarnings`·사이드바 `warning` 상태 생략(Simplicity). 생기면 그때 `Errors` 타입에 `severity`를 더한다 |
| UD-6 | 결과 단계 진입은 **막는 관문**을 1주택과 똑같이 둔다 | 「다음」·단계 클릭·`handleJudge` 3곳이 같은 `blockOnFirstInvalidStep`(`OneHouseJudgmentCalculator.tsx:148-161,163-172,187`) — 점프로 ⑧을 건너뛰는 경로 차단(F-2) |

### 9.2 `lib/calc/non-business-land-judgment-validate.ts` (⑧ — 엔진 계획서 §5.2와 **같은 파일**)

`Errors = {field, message}[]`(전부 error).
- `validateStepLand(form)`(0): ① `transferDate` 비면 「양도일을 입력하세요.」 ② 소재지(`addressRoad`·`addressJibun` 둘 다 비면, 문구는 `:192`와 같되 이 메뉴 맥락) ③ 면적 ≤ 0 「비사업용 토지 판정을 위해 토지 면적(㎡)을 입력하세요.」(문구 = `transfer-tax-validate-nbl.ts` 면적 오류와 동일 — 단일 소스화는 UV-8) ④ `getAssetDateOrderIssue(asset, transferDate)`(`:86` — 취득일<양도일·피상속인<상속개시일) ⑤ 취득일 필수(상속은 라벨이 다름) ⑥ 상속: 피상속인 취득일(UD-3) ⑦ 미래 취득일 차단(`todayLocalISO` `:64`) ⑧ `ownershipRatioError`(`transfer-tax-api-asset-basics.ts:115`) + UD-4.
- `validateStepJudge(form)`(1) · `validateStepGrace(form)`(2): `collectWithFields(() => validateNblDetailedJudgment(asset, "토지", transferDate, { floorDate: stateHistoryFloorDate(form, asset) }))`의 첫 오류를 UD-1로 단계에 귀속. `label`이 `"토지"`라 메시지가 「토지: …」로 시작한다(자산 1건이라 번호 없음).
- `validateStepByIndex(form, step)`·`getStepErrorCount`·`validateAllSteps` — 1주택 `one-house-exemption-validate.ts:567-598`과 같은 모양.
- **⑧↔UI parity(정책 3)**: ①의 각 규칙에 대응하는 화면 칸이 보인다(`data-field` 앵커: `transferDate`·`addressJibun`·`acquisitionArea`·`acquisitionCause`·`acquisitionDate`·`decedentAcquisitionDate`·`ownershipNumerator`). ②·③은 계산기 위젯의 기존 앵커를 쓴다(`FieldCard field=…`; 동적 키 `nblGracePeriods.N.*`는 기존 E2E 케이스가 유일 안전망 — `e2e/_helpers/validation-field-jump-cases-nbl.ts` 머리 주석). 오류 클릭 → `jumpToIssueField({field, message})`(`components/calc/transfer/validation-jump.ts:59`)로 이동한다 — `ValidationIssue` 구조적 호환(`field`만 읽음, 확인 필요 UV-11).
- fallback이 있는 곳: **시·군·구 자동 연동**(표시·④·⑧ 3층이 같은 leaf `nblLandSigunguCodeOf`) — 새 fallback을 메뉴가 만들지 않는다. 자동 안분 fallback 0건(면적·지분은 사용자 입력 그대로).

### 9.3 사이드바 `components/calc/nbl-judgment/NblJudgmentSidebar.tsx` + `lib/calc/nbl-judgment-summary.ts`

`WizardSidebar`(`shared/WizardSidebar.tsx:6-40`)를 직접 부르는 세목 래퍼(1주택 `OneHouseJudgmentSidebar.tsx:19-70` 패턴). 단계 상태: 현재=`active` · 오류 있음=`attention` · 이전=`done` · 그 밖=`todo`(`warning` 없음 UD-5). 요약은 **순수 함수** `computeNblJudgmentSummary(form)` + 호출부 `useMemo`. 입력으로 계산 가능한 항목만, 빈 값 제외:

| 항목 | 값 | 출처 |
|---|---|---|
| 소재지 | `addressRoad || addressJibun` 앞부분 | 폼 |
| 취득일(원인별 라벨)·양도일 | 날짜 | 폼 |
| 면적 · 공유 지분(<100%일 때만) | `n ㎡` · `x%` | 폼 |
| 지목 · 용도지역 | 한국어 라벨 | 폼(옵션 표는 컨테이너 상수와 같은 값 — 중복 정의 대신 컨테이너 `LAND_TYPE_OPTIONS`가 비공개라 **라벨 표를 새 leaf로 두고 컨테이너는 건드리지 않는다**, UV-12) |
| 무조건 사업용 의제 | 「성립(엔진 판정)」 | `evaluateUnconditionalExemption(asset, transferDate).isExempt` — 입력 선언만 보고 단정하지 않는다(`nbl-unconditional-exemption-status.ts` 머리) |
| 부득이한 사유 | `n건` | `nblGracePeriods.length` |
| 도시편입일 · 양도일 의제 | 값 | 폼 |

세액·금액 합계가 없는 화면이라 0원 제외 규칙은 «빈 값 제외»로 읽는다. 결과 도착 후에도 사이드바는 입력 요약만 보인다(판정은 결과 화면이 말한다).

### 9.4 홈 · `?new=1`

- 홈: `app/page.tsx:82-88` 다음에 `{ href:"/calc/non-business-land?new=1", title:"비사업용 토지 판정", subtitle:"지목·보유기간 입력으로 사업용·비사업용 판정", icon:"🌾", tone:"amber" }`. `e2e/home-menu-layout.spec.ts`의 `titles`에 「비사업용 토지 판정」을 더하고 주석을 «15번째 · lg 4열 4행 그대로»로 고친다. **한 화면 단언은 완화하지 않는다**(15칸은 4행이라 높이 불변 — UV-13이 E2E로 실측).
- `?new=1`: 오케스트레이터가 `useResetOnNewParam(reset)`(`lib/hooks/use-reset-on-new-param.ts` — mount 1회 `reset()` 후 `?new=1` 제거; 새로고침은 입력 보존). 1주택은 홈 카드가 `?new=1`이고 두 판정 메뉴 간 교차 링크만 `?new=1` 없이 입력을 이어받는다(`OneHouseJudgmentCalculator.tsx:329-338`) — 이 메뉴는 **store가 독립**이라 교차 링크가 없다.
- `HomeButton confirmMessage`: 「홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다.」 계열 문구 + `onBeforeNavigate`로 결과 단계 이탈 시 `setResult(null); setStep(0)`(`:305-313` 패턴).
- 페이지: `app/calc/non-business-land/page.tsx` = `<ProfessionalClientGate><NblJudgmentCalculator /></ProfessionalClientGate>` + `metadata`(`one-house-exemption/page.tsx:5-27`). AI 추출 같은 서버 게이트는 없다(v1 제외).

---

## 10. UI ↔ 14지점 동기화 매핑 (Definition of Done)

| # | 지점 | 이 기능에서의 위치 | 상태 |
|---|---|---|---|
| ① 폼 타입 | `lib/stores/nbl-judgment-form.types.ts`(`NblJudgmentFormData = TransferFormData`) | 신규 필드 **없음** — 기존 `AssetForm` 키만 쓴다 |
| ② initial | `createInitialNblJudgmentForm`(`forceNblFacts` 포함) | 신규 |
| ③ normalize | `normalizeNblJudgmentForm`(`migrateAsset` + 1건 절단 + 강제 플래그) · persist `onRehydrateStorage` · 이력 재개 | 신규 |
| ④ API 변환 | `lib/calc/non-business-land-judgment-api.ts`(**엔진 계획서 §5.1이 정한 이름·시그니처**) `buildNblJudgmentApiBody(asset, transferDate)` = `raw ? { nonBusinessLandRaw: raw } : undefined`(계산기와 **같은 leaf** `buildNonBusinessLandRaw`) + UI 쪽 `callNblJudgmentAPI(form)`(같은 파일) | 신규(래퍼만) |
| ⑤ 위젯 | §2 | 신규 + 기존 위젯 재사용 |
| ⑥ 사이드바 | §9.3 | 신규 |
| ⑦ 결과 | §6 | 신규 머리 + 카드 재사용 |
| ⑧ validation | §9.2 | 신규(NBL leaf 호출) |
| ⑨~⑭ | **엔진 계획서 소관** — UI가 확인할 점: ⑫′ Zod가 ⑧을 통과한 본문을 **거부하지 않는다**(⑧↔⑫′ 거울 — §11 U-4) · ⑬ `callNblJudgmentAPI`는 body를 spread로 새게 하지 않고 `{nonBusinessLandRaw}` 한 키만 보낸다 · ⑭ route가 Date를 `toDate/toOptionalDate`로 변환(계산기와 같은 `buildNblEngineInput` 재사용 — `non-business-land-request.ts:60-72`) | 확인 |

신규 엔진 input/result 필드는 **0건**이다 — `nonBusinessLandRawSchema`와 `NonBusinessLandJudgment`를 그대로 재사용하므로 ⑨~⑪·⑫의 입력 정의 변경이 없다(엔진 계획서와 대조 필요 — UV-3).

---

## 11. 테스트·E2E 계획

### 11.1 vitest anchor (파일명은 제안)

| ID | 파일 | 단언 |
|---|---|---|
| U-1 | `__tests__/components/nbl-section-container-part.anchor.test.tsx` | `part` 미지정 = 7개 블록 전부(기존 testid·라벨) / `judge` = 의제+지목+세부, 부득이·편입·의제일 없음 / `grace` = 그 반대 / 두 부분 합집합 = 전체·교집합 = ∅ / `grace`·`judge`에서도 `data-testid="nbl-per-category"`가 1개 · `isExempt`면 `inert` · `part` 지정 시 「접기」·「+ 상세 판정 시작」 없음 · 소스 문자열 `inert={exemptionStatus.isExempt` 유지. **뮤테이션 프로브**: `part` 분기를 지우면 실패하는지 실측 |
| U-2 | `__tests__/calc/nbl-judgment-store.anchor.test.ts` | initial/normalize/`updateAsset`이 세 플래그를 강제 · `nblUseDetailedJudgment:false`가 섞인 record를 복원해도 true · `assets` 2건 → 1건 · 구 record(필드 누락)가 `migrateAsset`로 채워짐 · `updateAsset`이 같은 `set`에서 result 무효화 · 의뢰인 변경 시 결과 폐기 |
| U-3 | `__tests__/calc/non-business-land-judgment-validate.anchor.test.ts`(엔진 계획서 A-3과 **같은 파일** — 엔진은 «⑧ 통과 ⇒ 메뉴 route 200» 격자, UI는 아래 단계 귀속·규칙표를 더한다) | ①의 규칙 표(§9.2) 전 케이스 · UD-1 매핑: **계산기 NBL 필드 점프 케이스 전부**(`e2e/_helpers/validation-field-jump-cases-nbl.ts`의 patch를 폼에 적용)가 ②/③ 중 정확히 하나로 귀속되고 어느 쪽에도 안 속하는 field가 없음 · ⑧ 통과 폼이 `buildNonBusinessLandRaw` 정의(③ 3중) · 의제 성립 시 ③ 규칙이 막지 않음(`validateNblDetailedJudgment`의 `nblExempt` 조기 반환 `:153`) |
| U-4 | `__tests__/calc/non-business-land-judgment-api.anchor.test.ts` | `buildNblJudgmentApiBody`가 `{nonBusinessLandRaw}`뿐(`undefined` 입력 → `undefined`) · 메뉴 폼(`createInitialNblJudgmentForm` 변형 격자)에서 만든 raw가 엔진 계획서 A-1 하니스(`captureBody`·`postTransfer`)의 계산기 raw와 **키·값 동일** — 엔진 A-1·A-5가 같은 격자를 쓰므로 UI는 «메뉴 폼이 그 격자의 한 점이다»만 더한다(폼 → raw 단계) |
| U-5 | `__tests__/calc/nbl-judgment-handoff.anchor.test.ts` | H-1 `openTransferWithNblFacts` 뒤 계산기 store `assets[0]`이 `isNonBusinessLand && nblUseDetailedJudgment`이고 `buildNonBusinessLandRaw(계산기 asset, 계산기 양도일)`이 메뉴 raw와 deep-equal · H-2 stale 키 목록 ⊇ 1주택 patch의 `undefined` 키 · H-3 `nblHandoffRemainingInputs` 목록을 채우면 계산기 `validateStepDetailed` 0~3 전부 OK(probe3 재현) · H-4 이동 전 `clearResult` 호출 · H-5 router.push 대상 `/calc/transfer-tax` |
| U-6 | `__tests__/lib/storage/nbl-judgment-history.anchor.test.tsx` | 제목·dedup 키·카드 요약·드로어 머리·재개 시 formData 복원+result null·백업 round-trip(`gift-deemed-history.anchor.test.tsx` 선례) · 가드 R-1~R-8 통과 · AR-1 통과 |
| U-7 | `__tests__/components/nbl-judgment-result-view.test.tsx` | 판정 3갈래 fixture(사업용·비사업용·부분·의제) + **JSON 왕복 fixture**(Date→string)로 카드 렌더 무오류 · `judgmentOnly`에서 «+10%p»·«중과»·«일반세율» 문자열이 **없고**(미지정이면 현행 문구 그대로 — 기준 마크업 fixture) · `inputEffects` 3상태별 문구(0건이면 카드 숨김) · 한정 안내 존재 · 계산기 CTA가 `onCalculateTax` 호출 · `nblVerdictOf` 라벨·톤 |
| U-9 | `__tests__/components/nbl-result-card-judgment-only.anchor.test.tsx` | `judgmentOnly` 미지정 = 현행 마크업(PR-1 첫 작업으로 master에서 뜬 fixture 5종 — 사업용·비사업용·부분 면적·의제·재촌)과 동일 · `judgmentOnly` = 배너·면적 안분 문장만 바뀌고 나머지 블록 동일 · 소스 anchor: 두 문장 외 `중과|세율` 신규 등장 0 |
| U-8 | `__tests__/calc/nbl-judgment-summary.anchor.test.ts` | 빈 폼=요약 없음 · 값이 있는 항목만 · 의제 항목은 엔진 판정(선언만 켠 미충족 케이스는 안 보임) |

실행은 `npx vitest run __tests__/calc/ __tests__/components/ __tests__/lib/storage/ __tests__/tax-engine/non-business-land/` 범위로 — 전체 `npm test`는 반복 검증에 쓰지 않는다.

### 11.2 Pre-Do anchor (구현 전에 먼저 돌릴 것 — 「Pre-Do anchor 우선」)

1. U-1의 «`part` 미지정 DOM 동등성»: **현행 master에서 먼저 기준 마크업을 떠 둔다**(렌더 → `container.innerHTML`을 fixture로) → 변경 후 동일해야 한다. 추정 금지.
2. U-5 H-3: probe3를 anchor로 승격(상속·증여 + 지분 격자 포함).
3. U-3의 «필드→단계 귀속 누락 field 0건» — 구현 설계가 틀어지면 가장 먼저 드러난다.

### 11.3 E2E (신규 `e2e/nbl-judgment-menu.spec.ts` — 문구는 소스 grep 후 단언)

단언에 쓰는 **기존 소스 문구**(grep 확인): 「비사업용 토지 정밀 판정」(컨테이너 머리 — 메뉴에서는 **없어야** 함, `NblSectionContainer.tsx:125`) · 「엔진이 무조건 사업용으로 판정합니다」(`UnconditionalExemptionSection.tsx:60`) · 「사업용 토지 — 일반세율이 적용됩니다.」(`NonBusinessLandResultCard.tsx:92`) · 「판정 도움 필요」·「비사업용 토지 여부 검토」(`NblScreeningToggle.tsx:72,37`) · `data-testid="nbl-per-category"` · `data-testid="nbl-expr-notice-date"`. **신규 testid·문구는 구현 때 만들고 그때 소스 grep으로 단언을 맞춘다**(아래 `nbl-judgment-*`·「양도세 계산하기」·「판정 결과 보기」·「토지 기본」 등은 이 계획서가 정하는 값).

| ID | 시나리오 | 핵심 단언 |
|---|---|---|
| NJM-1 | 홈 카드 → 메뉴 진입 | `/calc/non-business-land` 도달 · 1280×720 홈 한 화면 fit(`home-menu-layout.spec.ts` 갱신분) |
| NJM-2 | 농지(자경) 풀플로우 ①→④ | 소재지(`setupAddress` 헬퍼 — Vworld mock) · 날짜(`fillDateAndVerify`) · 지목·용도지역(`chooseFromSelect` 패턴) · `waitForResponse`가 `res.ok()` · `nbl-judgment-verdict` 텍스트 · 카드에 「판정 과정」 |
| NJM-3 | 의제 성립(상속 · 상속개시 2005 · 피상속인 취득일 입력 · 양도 2009-06-01 · ②에서 지목 「농지」 선택 — 영 §168의14③1호 자동 판정, `UnconditionalExemptionSection.tsx:77-92`의 안내문) | ②에서 배너 + `nbl-per-category`의 `inert` 속성 · ③ 안내 카드 + ③ 입력 비활성 · ④ 「무조건 사업용」 강조(`NonBusinessLandResultCard.tsx:99-107`) |
| NJM-4 | ⑧ 차단 | ① 필수 미입력 → 오류 배너 · 단계 점프(StepIndicator 3번째 클릭) 차단되고 그 단계로 복귀(`one-house-judgment-step-jump-gate.spec.ts` 선례) · 오류 클릭 시 `data-field` 이동 |
| NJM-5 | 이력 왕복 | `waitForCalculationSaved(page,"non_business_land_judgment")` → `/history` 카드 「판정:」·필터 버튼 → 「편집」으로 메뉴 복귀·① 값 복원·결과는 재판정 |
| NJM-6 | 계산기 넘기기 | CTA → URL `/calc/transfer-tax` · 「보유 상황」 단계에서 「비사업용 토지 여부 검토」 ON·「판정 도움 필요」 라디오 선택 상태(`aria-checked`) · 지목 Select에 메뉴 값 · **양도가액·취득가액이 비어 있음**(남은 입력 목록과 일치) · 채우면 계산 결과의 비사업용 카드가 메뉴 판정과 같은 결론 |
| NJM-7 | `?new=1` 초기화 | 입력 후 `/calc/non-business-land?new=1` 재진입 → 빈 폼 · 새로고침(param 없음)은 입력 보존 |
| NJM-8 | 계산기 회귀 | 기존 `e2e/transfer-nbl-unconditional-exemption.spec.ts`·`transfer-nbl-ptax-basis.spec.ts` 등 `transfer-nbl-*` 전부 초록(컨테이너 DOM 불변 증명) |

셀렉터 규칙: `e2e/CLAUDE.md` §1(날짜 헬퍼)·§6(hydration — `transfer-nbl-ptax-basis.spec.ts`의 `waitForHydration`·`chooseFromSelect`)·§5(외부 API `page.route` mock).

---

## 12. 파일 목록 · PR 분할

### 12.1 신규 (≤700줄/파일 — 각 파일 100~300줄 예상)

`app/calc/non-business-land/{page.tsx, NblJudgmentCalculator.tsx, steps/{StepLand,StepJudge,StepGrace,StepResult}.tsx}` · `components/calc/nbl-judgment/{NblJudgmentSidebar.tsx, LandAcquisitionFields.tsx}` · `components/calc/results/NblJudgmentResultView.tsx` · `lib/stores/{nbl-judgment-store.ts, nbl-judgment-form.types.ts}` · `lib/calc/{non-business-land-judgment-api.ts, non-business-land-judgment-validate.ts}`(엔진 계획서 §7과 같은 두 파일 — 클라이언트 ④⑧ leaf는 UI/엔진 중 먼저 들어가는 PR이 만든다, 내용은 §5.1·§9.2) · `lib/calc/{nbl-judgment-summary.ts, nbl-judgment-handoff.ts, nbl-judgment-handoff-remaining.ts, nbl-judgment-verdict.ts, nbl-judgment-steps.ts, nbl-judgment-address-patch.ts, nbl-judgment-labels.ts, nbl-judgment-input-effects-text.ts}` · `supabase/migrations/20261125000001_add_non_business_land_judgment_tax_type.sql` · 테스트 8 + E2E 1.

### 12.2 수정 (기존)

| 파일 | 변경 | NBL? |
|---|---|---|
| `components/calc/transfer/nbl/NblSectionContainer.tsx` | `part` prop +≈12줄 삽입 | **예(첫째)** |
| `components/calc/NonBusinessLandResultCard.tsx:88-92,347-352` | 선택 prop `judgmentOnly`(기본 false) — 세율 문장 2곳 분기 +≈8줄 | **예(둘째)** |
| `components/calc/transfer/nbl/UnconditionalExemptionSection.tsx:148` | 힌트 문구 1줄(선택) | 예 |
| `lib/storage/{types,tax-type-routes,title-generator,business-key}.ts` | 등록 | 아니오 |
| `lib/calc/history-resume-entry.ts` · `app/history/HistoryClient.tsx` · `components/history/HistoryDetailDrawer.tsx` | 분기 추가 | 아니오 |
| `app/page.tsx` · `e2e/home-menu-layout.spec.ts` | 메뉴·단언 | 아니오 |
| `__tests__/lib/storage/local-tax-type-registration.guard.test.ts` | R-4식 1줄 | 아니오 |

수정하지 **않는** 것: `NblScreeningToggle`·`SpecialSituationSection`·`AssetSectionBasic`·1주택 handoff·`OneHouse*`.

### 12.3 PR 순서 (Do는 시퀀셜 — 엔진이 route·타입 선처리)

1. (엔진) route·Zod 재사용·응답 타입 — **UI 시작 전 선행**(§13 계약 확정).
2. **PR-1 (UI, 최소·기계적)** `NblSectionContainer` `part` + `NonBusinessLandResultCard` `judgmentOnly` + 힌트 1줄 + U-1·U-9 — 다른 NBL 세션과의 충돌 창을 줄이려 **가장 먼저** 머지(둘 다 선택 prop 삽입이라 rebase 한 번이면 충분한 크기). **이 PR만 NBL 파일을 만진다.**
3. **PR-2** 이력 등록 12곳·8파일 + 판정 술어(`nbl-judgment-verdict.ts`) + migration + 가드/ U-6.
4. **PR-3** store·form types·validate·api·summary·labels + U-2·U-3·U-4·U-8(화면 없이 단위 안전망 먼저).
5. **PR-4** 화면(page·오케스트레이터·4 Step·사이드바·결과뷰·address-patch) + U-7.
6. **PR-5** handoff·remaining·홈 등록 + U-5 + E2E NJM-1~8.
각 PR 후 `ui-engine-sync-checker`(14지점) · 완료 보고에 3대 정책 자가 점검(미러링 금지·자동 안분 금지·⑧ 8번째 동기화).

---

## 13. 엔진 계획서와의 대조 (2026-11-25 — 짝 문서 `nbl-judgment-menu.engine.plan.md` 열람)

### 13.1 일치 (재확인 완료)

| 항목 | 엔진 계획서 | 이 문서 |
|---|---|---|
| route | `app/api/calc/non-business-land-judgment/route.ts` POST(§3.1) | `callNblJudgmentAPI`가 이 경로를 **한 곳**에서만 쓴다 |
| 요청 | `{ nonBusinessLandRaw }` 한 키 · `propertySchema` 재사용 안 함(§3.3 D-E1) | `buildNblJudgmentApiBody`가 계산기 ④ `buildNonBusinessLandRaw` 결과를 그대로 싣는다(§10 ④) |
| 응답 | `{ data: { judgment, inputEffects } }`(§3.1 단계 7·§4.1) | `StepResult`가 `data`를 읽는다 · `judgment` → 카드, `inputEffects` → §6-4 카드, 이력 `resultData` = `data` 전체(§4.4) |
| 폼 모양 | 메뉴 토지 상태는 **`AssetForm` 호환**이어야 한다(§5.1 · 엔진 V-1 **차단 항목**) | **충족** — `assets[0]`이 곧 `AssetForm`이다(§3). 엔진 V-1 해소 |
| ⑧ 재사용 | `validateNblDetailedJudgment(asset, label, transferDate, { floorDate })` + 상속 피상속인 취득일 · 소재지(§5.2) | 같은 함수를 부른다(§9.2) · 소재지 필수(UD-2)·피상속인 필수(UD-3)도 같다 |
| 파일명 | `lib/calc/non-business-land-judgment-{api,validate}.ts`(§7) | 두 파일은 엔진 이름을 따른다(§12.1) |
| 이월과세 | 엔진 Q-1 추천 (b) 제외 | UQ-1 추천 (b) — **같은 질문**, 한 번만 결정 |
| 6지목 전부 | 엔진 Q-3 추천 (a) | 동의 — 컨테이너가 이미 6지목을 모두 보인다(`NblSectionContainer.tsx:37-44 LAND_TYPE_OPTIONS`) |

### 13.2 어긋남·UI가 따르는 쪽 (메인 세션이 확정할 것)

| # | 어긋남 | 이 문서의 입장 |
|---|---|---|
| X-1 | 엔진 §5.2 ⑧ 파일(~80줄)은 ① 규칙 몇 개 + ②③ 호출만 말한다. UI는 **단계 귀속(UD-1 — 필드→단계)·단계 인덱스 래퍼·오류 개수**까지 필요하다 | 같은 파일에 UI가 더한다(예상 ~150줄). 엔진이 만드는 `inheritedDecedentDateError` export 1단어(`transfer-tax-validate-acquisition.ts:138`)를 UI도 쓴다 — 중복 복제 안 함 |
| X-2 | 엔진 §7 E3: 핸드오프를 store 쓰기 + 이동 두 함수로 분리 | D6로 쓰기-only 호출처가 없다 → patch 빌더 export + 이동 1함수(§7). 엔진 A-5가 검증하는 «raw 동치»는 patch 빌더로 그대로 가능 |
| X-3 | 엔진 Q-2 (a) «세율 숫자 없이» ↔ 재사용 카드가 «+10%p 중과» 문장을 싣는다(`:88-92`·`:347-352`) | 카드 prop `judgmentOnly` 2곳(§6-3) — UQ-2 (B). 엔진 Q-2 (a)가 채택되면 이 prop이 **필수**다(카드 무수정이면 (a)를 어긴다) |
| X-4 | 엔진 V-10: 계산기에서 자경 감면을 켜면 비워 둔 도시편입일이 채워진다 → 핸드오프 후 고지 요청 | §6-6 계산기 넘기기 카드에 한 줄(수용) |
| X-5 | 엔진 V-3: 비-`nbl*` 칸 목록의 완전성(구조분해로 읽는 칸 누락 가능) | UI 폼이 **전체 `AssetForm`**이라 목록 누락이 UI 쪽 입력 누락으로 이어지지 않는다(① 화면이 받는 칸 외는 기본값). 누락 가능성은 «① 화면이 받아야 할 칸을 못 받는» 방향 — §5의 목록 + 엔진 V-3 실측(칸을 하나씩 비워 raw 변화)을 PR-3 U-3에 반영 |

### 13.3 엔진 계획서에 추가로 요구하는 것 (최소)

1. 응답 `inputEffects` 타입(`NblInputEffects`)을 **export**해 UI가 문구 표(`Record<NblInputEffect, …>`)를 `satisfies`로 묶을 수 있게 한다(키 누락 컴파일 차단).
2. 오류 응답은 계산기 관례 `{ error: { message, fieldErrors? } }`(`one-house-exemption-api.ts:381-401` 파서가 의존 — `[object Object]` 사고 선례 `:373-380`).
3. rate limit 규약은 계산기 route와 동일(`shouldBypassRateLimit`) — E2E가 연타해도 429가 나지 않아야 한다.

---

## 14. 사용자 결정 UQ-n (D1~D6 밖의 제품 선택만 — 엔진 문서의 Q와 같은 질문은 «=»로 표시)

| ID | 질문 | 선택지 | **추천** | 근거 |
|---|---|---|---|---|
| UQ-1 (= 엔진 Q-1) | 취득원인에 **이월과세(증여, §97의2)** 를 넣을까 | (a) 포함 — 증여자 취득일 기산 + 증여 등기접수일 칸 (b) **제외 + 고지**: 매매·상속·증여 3종, 「이월과세는 계산기 판정 도움에서」 | **(b)** | 이월과세 자산의 비사업용 판정은 **A(증여자 취득일 기산)/B(배제 시 수증일 기산)** 가 갈린다 — B는 ②1호 선언·②3호 **세액 비교**·기간 경과로 정해져(`non-business-land-request.ts:93-100`) 판정 메뉴가 세액 계산 없이 결정할 수 없다. 그리고 계산기 ⑧이 이월과세 사건 머리(증여 등기접수일 등)를 따로 막는다. 메뉴가 한쪽만 단정하면 틀린 결론을 낸다. 엔진 문서도 같은 결론(엔진 Q-1) |
| UQ-2 (= 엔진 Q-2) | 결과 화면에서 **세율 문구(+10%p·유예·배제)** 를 어디까지 보일까 | (A) 카드 무수정 + 한정 안내 문구(카드의 «+10%p 중과» 문장은 그대로 보임) (B) **카드에 `judgmentOnly` prop** — 세율 문장 2곳만 판정 중심으로(≈8줄, 기본 false = 현행 동일) (C) 지정지역 질문을 ①에 넣고 8호 유예까지 판정(엔진 API 확장·세율 단계 사실 요구) | **(B)** | 카드의 «기본세율 +10%p 중과» 문장(`NonBusinessLandResultCard.tsx:88-92`·면적 안분 안내 `:347-352`)은 중과 배제 정보(`nblSurchargeExcluded` — 세율 계산 결과, `transfer-tax-rate-calc.ts:78-81`)가 있을 때만 정확하다(위기취득 토지 등). 엔진 문서도 «숫자 없이»(엔진 Q-2 (a))를 추천하고 `additionalRate`를 화면이 믿지 말라고 짚었다. (A)는 틀릴 수 있는 문장을 화면에 두고 안내로 덮는 것이라 엔진 (a)와 모순. (B)의 비용은 다른 세션이 만지는 NBL 결과 컴포넌트에 선택 prop 8줄 — 충돌은 PR-1을 가장 먼저 머지해 줄인다 |
| UQ-3 | 계산기에 도착했을 때 「이 판정에서 넘어옴」 **출처 줄**(재판정 시 변경 감지·원본 열기)을 둘까 | (a) v1 제외 (b) 1주택식 출처 줄 확장(`sourceJudgmentMenu`에 값 추가 + provenance·링크·안내 카드 6파일) | **(a)** | 출처 줄은 두 판정 메뉴 전용 타입에 묶여 있다(`calc-wizard-form.types.ts:522`·`OpenSourceJudgmentLink.tsx:34`). NBL은 «사실만 전달, 계산기가 다시 판정»(D1)이라 화면이 이미 입력 그대로 보여 준다. 필요해지면 별 PR |
| UQ-4 | 기타토지의 **「연접 다필지」 입력(§168의11⑤ — `OtherLandParcelSection`)** 은 D5 「단독 1필지」와 충돌하는가 | (a) **유지**(숨기지 않음) (b) 메뉴에서 숨김(컨테이너에 prop 추가) | **(a)** | D5의 «1필지»는 자산 수준(`assets.length === 1`)이다. 연접 다필지 행은 한 판정 안의 입력이고 같은 위젯 재사용(D1)이라 숨기려면 NBL 파일에 prop이 더 늘어난다 |

---

## 15. 미검증 UV-n

| ID | 내용 | 처리 |
|---|---|---|
| UV-1 | `part` 분기 후 계산기 DOM 불변 · 기존 anchor 5파일 초록 · tsc 0건 · 브라우저 확인 | **이 세션 미실행**. §11.2-1이 PR-1 첫 작업(현행 마크업 기준선 먼저) |
| UV-2 | `NblStateHistoryPeriodTable`·`NblRevenuePeriodTable`·`NblVacantLotPeriodNote`이 JSON 왕복 결과(Date→string)에서 안전한가 — 카드 본체의 `formatDeemedDate`(`:32-35`)만 읽음 | 확인 필요 → U-7 JSON fixture |
| UV-3 | 엔진 계획서의 route·요청/응답·파일명과 대조 | **§13.1에서 일치 확인**(엔진 계획서 열람). 남은 것은 §13.2 X-1~X-5 — 메인 세션이 합친다 |
| UV-4 | 축 B(지분 분할) 계획서가 «나머지 지분 선언 필수»(UD-4)를 뒷받침하는지 | `axis-b-land-share-nbl-detailed-judgment.plan.md` **미열람** — PR-3 전 확인 |
| UV-5 | `judgment.areaProportioning.nonBusinessRatio`가 「일부 비사업용」 라벨의 판정 근거로 충분한가(`isNonBusinessLand`와의 관계) | 엔진 probe로 주택부수·기타토지 격자 실측 후 `nblVerdictOf` 확정 |
| UV-6 | 증여 취득의 계산기 ⑧ 남은 입력 — probe3 G는 `fixedAcquisitionPrice` 경로만 통과를 확인. **다른 취득가액 방식**(환산·추계)의 요구 입력은 미확인 | H-3 격자에 취득가액 방식 추가 |
| UV-7 | 이력 record·sessionStorage 크기 — probe5: 초기 폼 약 23KB(141+569키) | 1주택 메뉴 폼이 이것의 상위집합이라 새 부담은 아님. 이력 record 총량·Dexie 한도는 **실측 안 함** |
| UV-8 | 소재지 patch 로직 3번째 복제 방지 대신 새 leaf만 추가 → `AssetSectionBasic`·1주택 Step3와 중복. 면적 오류 **문구**도 `validateNblDetailedJudgment`와 두 벌 | 후속 정리 후보(이 기능에선 안 건드림). 문구 동일성은 U-3이 상호 대조 |
| UV-9 | 힌트 문구 `①양도정보…`(`UnconditionalExemptionSection.tsx:148`)를 단언하는 테스트·E2E | PR-1 전 `grep "①양도정보"`로 0건 확인(이 세션에서 소스 1곳 확인, 테스트 grep 미실시) |
| UV-10 | 결과 단계 effect가 판정을 호출하는 방식이 정책 1(useEffect→store 미러링 금지)에 저촉되는지 해석 | 선례(`Step4.tsx:31-35`)와 같다 — effect는 fetch만 시작하고 store 쓰기는 비동기 핸들러. 대안(CTA에서만 호출)은 단계 점프 경로에서 결과가 비어 보임. 선례 유지 |
| UV-11 | `jumpToIssueField`가 요구하는 `ValidationIssue`의 필수 필드(`field` 외) | 타입 확인 필요(`candidates`는 `issue.field`·`issue.assetIndex`만 읽음 — `validation-jump.ts:23-31`) |
| UV-12 | 지목·용도지역 한국어 라벨 표가 컨테이너 안 비공개 상수(`LAND_TYPE_OPTIONS`·`ZONE_TYPE_OPTIONS`) | 사이드바용 사본(`nbl-judgment-labels.ts`)을 두거나 컨테이너에서 export로 바꾸는 선택 — 후자는 NBL 파일 추가 수정이라 **사본**을 기본으로 하되 U-8이 컨테이너 옵션 value 집합과 대조(`satisfies`로 키 누락 가드) |
| UV-13 | 홈 15번째 메뉴가 1280×720 한 화면에 들어가는지·모바일 레이아웃 | E2E NJM-1로 실측 |
| UV-14 | Vworld 주소 선택 후 PNU→`acquisitionSigunguCode` 파생(`disableUnits` 모드에서도 PNU가 오는지) | 외부 API라 probe 불가 — 로컬 브라우저 확인 + E2E는 mock로 patch 계약만 검증 |
| UV-15 | `CarryoverOwnershipPeriodNotice`·`NblScreeningToggle`·지정지역 질문은 메뉴에 없다 → 계산기 도착 후 양도일이 2009.3.16.~2015.12.31.이면 지정지역 질문이 새로 뜬다(UQ-2 (B)의 한정 안내가 «세율은 계산기»라고 알린다) | 설계상 수용 |
| UV-16 | UI 문구가 새 법조문을 인용하면 `lib/legal-verification/manifest/additions-*` 등록 + `npm run verify:legal`(엔진 계획서 V-9와 같은 항목) | 이 계획서의 신규 문구(§2·§6)는 조문 인용이 없는 것을 의도했다(기존 위젯·카드의 배지는 그대로) — 구현 시 grep으로 재확인 |

---

## 16. 기결정·정책 준수 확인

- D1~D6 재오픈 없음. 메뉴는 «판정 도움» 모드를 그대로 두고(`SpecialSituationSection.tsx:140` 무수정) 같은 입력 위젯을 쓴다.
- **useEffect→store 미러링 0건**: store 쓰기는 이벤트 핸들러·비동기 핸들러·store 구독(의뢰인 변경)뿐. `useResetOnNewParam`은 mount 1회 reset(기존 훅).
- **자동 안분 fallback 0건**: 면적·지분은 사용자 입력 그대로. 시·군·구 자동 연동은 기존 3층 fallback을 새로 만들지 않고 재사용(표시·④·⑧이 같은 leaf).
- **⑧ 8번째 동기화**: ⑤에 보이는 각 칸 ↔ ⑧ 규칙 ↔ ④ 게이트가 같은 leaf(`validateNblDetailedJudgment`·`buildNonBusinessLandRaw`)이고 새 fallback이 없다 — U-3·U-4가 격자로 지킨다.
- UI 규칙: `ToneCard`·`ToggleCard`·`RadioCardGroup`·`DateInput`·`DecimalInput`·`FieldCard`·`SectionHeader`·`CtaButton`/`NavButton` 재사용, 임의 px 라벨·native checkbox/radio/date 신규 0, placeholder 숫자 예시 0(형식은 `hint`), 결과 한국어 풀어쓰기.
- 파일 크기: 신규 전부 ≤700줄 예상(단일 책임으로 분할 — Step/Fields/Sidebar/ResultView).

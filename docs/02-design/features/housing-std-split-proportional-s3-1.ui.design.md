# S3-1 일반 주택 비-별개 취득시 기준시가 분할 (뺄셈 → 비례 안분) — UI 설계

> 상태: **Design 완료 (2026-10-06, transfer-tax-ui-senior)**. 소스 수정 없음.
> 짝 문서: `housing-std-split-proportional-s3-1.engine.design.md`(엔진 시니어 — 작성 중이라 본 문서 §9 E-n이 **엔진이 확정해 줘야 할 것**). 계획서 `docs/00-pm/housing-std-split-proportional.plan.md` §6(Q-1~Q-4 확정) · 조사 `…engine-audit.md` · `…authority.md`.
> 표기: **확인** = 파일을 열어 줄 번호까지 본 것 · **화면 실측** = dev 서버(포트 3118)에서 Playwright로 연 화면 · **확인 필요** = 못 본 것.
> 실측 방법: 워크트리 HEAD `10acb8e40`, 주택 자산에 취득원인·토글을 눌러 자산 카드 안에 **보이는** `data-testid`·`data-field`·라벨을 덤프(스크래치 스크립트, 저장소 밖). 스크린샷으로 (b) 레이아웃 확인.

## §0 요약

1. **바꾸는 UI는 한 칸이다** — 「취득시 건물 기준시가(나목)」 입력칸 1개를, 비-별개 취득의 **소유자 분리** 경로(매매·비-매매)에 신설한다. 폼 필드는 이미 있다(`AssetForm.buildingStandardPriceAtAcq` — ①②③ 완비, ⑫⑬⑭도 무조건 통과 — §4). 칸이 없던 것이 문제였다.
2. **UI 입구 전수 결과**(§1): 일반 주택에서 「비-별개인데 분할이 일어나는」 화면 경로는 **2갈래 + 1 비입구**다. (a) 매매 + 소유자 분리 + 취득일 같음/토지 취득일 미입력, (b) 비-매매(상속·증여 등) + 소유자 분리. (c) 「토지·건물 취득일 다름」만 켜고 같은 날짜는 **분할이 열리지 않는다**(토지 단가 입력칸이 없어 엔진이 분리를 포기 — 화면 실측). 그 밖의 입구는 찾지 못했다(근거: 소유자 분리 외에 비-별개 분할을 여는 쓰기 지점이 없다 — §1.3).
3. **노출 조건 = ⑧ V8의 조건 그대로**(`selfOwns≠both ∧ ¬별개취득 ∧ requiresAcqStdPrice`)에 **주택·겸용 아님·부담부증여 아님·PHD 양쪽 환산 아님**을 더한 leaf **하나**(`ownerSplitHousingNeedsBuildingStd`, §2.3)를 ⑤ 노출·④ 전송·⑧ 필수가 같이 쓴다. 거짓 요구 방지: 분할 값이 세액에 안 닿으면(본인 파트 취득가액 직접 입력 등) 칸도 요구도 없다.
4. **Q-4 결정(Design)**: 입력 방식 = **계산 모달 재사용 + 직접 입력 허용**(양도시 건물 나목 칸과 같은 형태 — `TransferStdPriceCards.tsx:89-91`이 「계산기 결과를 덮어쓸 수 있어야 하므로 편집 가능 칸 유지」를 이미 정함). 근거 §2.4.
5. **문구**(§3): 화면에 보이는 stale 문구 **4곳**(hint 3 + 결과 안내 1), stale 주석 **6곳**. 모두 비례 안분 서술로 교체. 「건물분 = 총액 − 토지분」 화면 문구의 전수 grep 결과는 §3.1.
6. **⑥ 사이드바는 변경 없음**(확인: 대상 자산은 `isPlainLumpSumAsset`이 제외 — §6.1). **⑦ 결과**는 엔진 echo를 읽기만 하고 뺄셈 재계산 사본은 **없다**(§6.2). 비례 산식 표시를 위한 **엔진 echo 1건 요청**(E-2).
7. **엔진과 맞출 가장 큰 것(E-1)**: 환산취득가의 **분모**(양도시)가 지금은 가목·나목 raw 값(`transfer-tax-split-acq-price.ts:296-306`)이다. 분자만 비례로 바꾸면 척도가 여전히 갈린다 — 분모도 비례로 가면 **양도시 개별주택가격 입력칸**이 필요해져 이 설계 범위가 커진다(§2.9, §9). 엔진 설계서도 같은 쟁점을 D-1로 올렸다(ⓐ 취득시만 / ⓑ 양도시 분모 비례 포함).
8. **엔진 §3.2와 어긋나는 막다른 길 후보(E-4)**: 엔진 필수 술어가 `selfOwns≠both`를 안 보면 (c) 계열에서 칸 없는 throw가 생긴다 — 제안은 모든 층에 `selfOwns≠both` 포함.

## §1 UI 입구 전수

### 1.1 판정 기준

「비-별개 분할」 = 엔진 `calcSplitGain`에 들어가고(`landAcquisitionDate` 있음 · `propertyType` housing/building — `transfer-tax-split-gain.ts:46-47`) `isSeparateAcquisition !== true`인 상태. API는 `isSplitPayloadActive`(`hasSeperateLandAcquisitionDate === true || effectiveSelfOwns ≠ both`, `transfer-tax-api-split.ts:36-52`)가 참일 때만 분할 필드를 보내고, 별개 취득은 `isSeparateAcquisition()`(`transfer-tax-split-acq-mode.ts:295-301`: 「취득일 다름」 ON ∧ 두 날짜 모두 있음 ∧ **서로 다름** ∧ 겸용 아님)이다. 따라서 비-별개 분할 = **분할 활성 ∧ 두 날짜 같음(또는 토지일 미입력)**.

### 1.2 입구 표 (화면 실측 + 코드 확인)

| # | 경로 | 취득원인 | 진입 조작(쓰기 지점) | 비-별개가 되는 조건 | 엔진 분할 진입 | 현재 보이는 취득시 칸 | 건물 나목 칸(취득시) | 건물 나목 칸(양도시) | 판정 |
|---|---|---|---|---|---|---|---|---|---|
| **a** | 소유자 분리 · 매매 | 매매 | 「토지·건물 소유자 다름」 ON — `AssetOwnershipSplitSection.tsx:52-66`이 `selfOwns` 설정 + `hasSeperateLandAcquisitionDate:true`를 **함께** 켬(매매만) | 토지 취득일 = 건물 취득일, 또는 토지 취득일 미입력(전송 시 `acquisitionDate`로 후퇴 — `transfer-tax-api-split.ts:131-137`) | ○ (`selfOwns≠both`면 `landAcquisitionDate` 후퇴로 항상 진입) | `취득시 기준시가 (원) *` 총액 + `취득시 토지 공시지가`(원/㎡) (`CompanionAcqStdPriceSection.tsx:176-190`, **소유자 분리 + 주택일 때만**) + ①의 「토지 면적」(`acquisitionArea`) — **화면 실측**: fields에 `standardPriceAtAcq`·`standardPricePerSqmAtAcq`·`acquisitionArea` | **없음** — 화면 실측 testids에 `split-building-std-acq*` 없음 | `split-sale-std-card` 안 `split-building-std-transfer`(+ 「양도시 건물 기준시가 계산」) — 항상 축 A(`saleStdPlacement()` 불변) | **입구 ①** |
| **b** | 소유자 분리 · 비-매매 | 상속·증여·신축 등 `≠purchase` | 같은 토글. **`hasSeperateLandAcquisitionDate`는 켜지 않음**(`AssetOwnershipSplitSection.tsx:52-62` 주석) — 취득원인 전환 시 stale도 false로 정리(`CompanionAcquisitionCauseSection.tsx:99`) | **항상** (두 날짜가 하나 — 상속개시일·증여일) | ○ (`selfOwns≠both` 후퇴) | `NonPurchaseSplitInputsBlock`(`data-testid="non-purchase-split-inputs"`): 총액 + 토지 공시지가 + 토지 면적 + 축 A — **화면 실측**(상속) | **없음** | 같음(축 A) | **입구 ②** |
| **c** | 「취득일 다름」만 ON, 날짜 같음 | 매매 | `CompanionAcqDateSection.tsx:97-115` 토글 | 두 날짜 같음 | **△ 사실상 불가** — 화면에 토지 단가(`standardPricePerSqmAtAcq`) 입력칸이 **없다**(소유자 분리일 때만 그 칸이 열림). **화면 실측**: fields에 `standardPricePerSqmAtAcq` 없음, 총액 칸만 `*`로 노출. 단가 없으면 `calcAcqStdPair`가 null → 비-별개는 `calcSplitGain`이 `null` 반환(`split-gain.ts:99`, 별개만 throw) → 분할 포기(단건 경로) | 없음(총액만) | 같음 | **비입구** — 단 stale 단가가 남은 세션이면 엔진이 분할을 돈다(§1.4 주의) |
| d | 겸용주택 | — | 겸용 토글 | `isSeparateAcquisition`이 겸용 제외 | 겸용 엔진(별 경로) | — | — | — | **범위 밖**(S3-2) |
| e | 부담부증여 | 증여 | — | `isSplitPayloadActive`가 부담부증여 제외 | ✕ | — | — | — | 제외 |
| f | PHD §164⑤(양쪽 환산) | — | PHD 토글 | `calcSplitGainPreDisclosure`로 early-return(이미 비례) | 비입구 | — | — | — | 제외(`isPhdBothEstimated`) |
| g | 신축 + 토지 상속·증여 | 신축 | `NewConstructionLandAcqBlock.tsx:90-91`이 `hasSeperate…:true` 설정 | 토지·건물 날짜가 **같을 때만** 비-별개 | ○ | 별개 경로 UI(파트 카드)가 열림 — 같은 날짜면 `isSeparateAcq` false라 파트 카드 미노출 | 없음 | 같음 | **입구 ③(희소)** — 토지(상속·증여)와 건물(신축)이 같은 날 취득되는 경우. 소유자 분리가 같이 켜졌을 때만 a/b의 N 칸이 열린다(아래 leaf가 `selfOwns≠both` 요구). selfOwns both면 (c)와 같은 비입구 |
| h | 일반건물·상가·재개발·입주권 | — | — | `isLandBuildingSplitable`이 housing·building만 | ✕ | — | — | — | 제외 |
| i | assetKind **building**(건물·토지 제외) 소유자 분리 | 전 취득원인 | 같은 토글 | a/b와 같음 | ○ | 총액(단가×면적 모드) | 없음 | 같음 | **S3-1 UI 범위 밖 — E-3 결정 대기**(§9) |

### 1.3 「그 밖」 입구를 못 찾은 근거

- 비-별개 분할을 **켜는** 쓰기 지점 = `AssetOwnershipSplitSection`(selfOwns) · `CompanionAcqDateSection`(hasSeperate 토글) · `MixedUseSection`(겸용 강제) · `NewConstructionLandAcqBlock`(hasSeperate 강제). 그중 겸용은 제외, hasSeperate 토글은 (c)·(g)로 환원, selfOwns는 (a)(b).
- 확인 방법: `grep -rl "hasSeperateLandAcquisitionDate" components` 로 쓰기 지점 열거(15개 파일) → `onChange({…hasSeperate…})` 호출은 위 4곳(+ 취득원인 전환 정리 `CompanionAcquisitionCauseSection.tsx:99`)뿐.
- 엔진 감사 §7-6의 「a1(일반 · 토지 20년/건물 8년 · 총액 실가)은 엔진 직접 입력」 결론과 일치 — a1은 날짜가 다르면 별개 취득이고, 같으면 (c)라 화면에서 분할이 안 열린다. **UI로 도달 가능한 비-별개 분할은 소유자 분리뿐**(a·b)이고, 그 경로의 세액 영향이 감사 §3의 a3(−22.5M / +21.0M)다.

### 1.4 관찰된 기존 결함 (S3-1이 만든 것 아님 — 기록만)

1. **(c)에서 파트 안내가 없는 카드를 가리킨다** — 화면 실측: 「취득일 다름」ON + 건물 환산취득가 선택 시 `split-building-estimated-note`가 「위 「건물 취득시 기준시가」 카드」를 가리키는데 그 카드는 별개 취득(`stdCardBase`)에서만 렌더(`LandBuildingSplitSection.tsx:361-372`)라 **없다**(`LandBuildingSplitSection.tsx:314-330`). S3-1의 N 칸은 (a)(b)에서만 열리므로 (c)는 그대로 남는다. → §9 Q-U4.
2. **(c) + stale 토지 단가**: 소유자 분리로 단가를 입력했다가 소유자 분리를 끄면 `hasSeperate…`는 유지(`AssetOwnershipSplitSection.tsx:63-66`)되고 `buildLandStdAtAcquisitionPayload`(`transfer-tax-api-split.ts:232-240`)는 단가·면적을 **분할 여부와 무관하게** 보낸다 → 화면에 단가칸이 없는데 엔진이 분할을 돌 수 있다. S3-1 후에는 N이 숨겨져 **④가 N을 안 보내므로** 엔진이 쌍을 못 만들어 분할을 포기한다(종전: 뺄셈으로 계산) — **동작이 달라지는 지점**이라 §9 E-4로 엔진 시니어에 명시.
3. `AssetForm.buildingStandardPriceAtAcq` 필드 주석(`calc-wizard-asset.ts:734-739`)이 「building 전용·미입력 시 총액 역산 후퇴」로 낡았다(주택 별개취득이 이미 같은 필드 사용, 후퇴는 S3-1에서 폐지).

## §2 ⑤ 취득시 건물 기준시가(나목) 입력칸

### 2.1 원칙

- **같은 폼 필드**: `AssetForm.buildingStandardPriceAtAcq`(별개 취득 파트 카드가 이미 쓰는 필드). 시점 의미도 같다 — 건물 취득일 직전 고시분(§164③). 비-별개에서는 건물 취득일 = 토지 취득일이므로 별개 경로와 값이 충돌하지 않는다(별개↔비-별개 전환 시 값 보존).
- **같은 모달 런처**: `BuildingStdPriceModalButton`(`LandBuildingSplitSection.tsx:208-246`의 non-`both` 분기와 **같은 props**: `lockedTaxType="transfer"`, `applyTimePoint="acquisition"`, `snapshotKey=bsp-{assetId}-split-acq`, prefill = 토지면적·건물 연면적·취득일·취득시 토지 단가). 런처 자체가 `<Button variant="modalLauncher">`(`BuildingStdPriceModalButton.tsx:216`)이므로 규약 충족.
- **한 곳에 정의**: 새 컴포넌트 `components/calc/transfer/AcqBuildingStdField.tsx`(약 90줄) — FieldCard + CurrencyInput + 런처. 비-별개 두 사이트((a) `CompanionAcqStdPriceSection`, (b) `NonPurchaseSplitInputsBlock`)가 호출. 별개 경로 `PartAcqStdPrice`의 non-`both` 분기도 이 컴포넌트로 위임(런처 prefill 사본 3중화 방지 — `feedback_ui_engine_dual_truth_avoidance`). `both` 분기(2시점 통합)는 `saleStdPlacement` 불변으로 **도달 불가**(`transfer-tax-split-acq-mode.ts:344-361` 주석)라 건드리지 않는다.

### 2.2 위치 (UI 순서 = 계산 로직 순서)

계산 순서: **총액 H(개별주택가격) → 토지 L(㎡당 공시지가 × 면적) → 건물 N → (분할) → 양도시 L_T·N_T(축 A)**. 따라서 N은 **L 바로 아래**다.

| 경로 | 삽입 지점 | 근거 |
|---|---|---|
| (a) 매매 | `CompanionAcqStdPriceSection.tsx:176-190` 「소유자 분리 + 주택」 `LandPriceLookupField` **직후**, 같은 조건 블록 안 | L과 같은 게이트(소유자 분리 ∧ `house_individual`) 안이라 두 칸이 함께 열리고 닫힌다 |
| (b) 비-매매 | `NonPurchaseSplitInputsBlock.tsx:99-125` 호박색 박스(`rounded-md border border-amber-200 bg-amber-50/40`) 안 「토지 면적」 FieldCard **직후** | 화면 실측(스크린샷): 총액 → [호박색 박스: 토지 공시지가·기준시가·면적] → 축 A. N은 그 박스 마지막 칸 |

### 2.3 노출 leaf — ⑤·④·⑧이 공유

```ts
// lib/calc/transfer-tax-split-acq-mode.ts (신규 export, 약 +35줄)
export function ownerSplitHousingNeedsBuildingStd(asset: AssetForm): boolean
```

`true` ⇔ 아래 전부:

| 항 | 조건 | 근거(확인) |
|---|---|---|
| 1 | `asset.assetKind === "housing"` | E-3(building은 범위 밖) |
| 2 | `!asset.isMixedUseHouse` | `selfOwnsSplitApplicable`(`self-owns-scope.ts:25-27`) |
| 3 | `asset.transferType !== "burdened_gift"` | `isSplitPayloadActive`(`transfer-tax-api-split.ts:36-52`) |
| 4 | `(effectiveSelfOwns(asset) ?? "both") !== "both"` | V8의 `selfOwnsSplit`(`transfer-tax-validate-split.ts:115`) · ⑫ V8(`required-refines-2a.ts:202-203,214`) |
| 5 | `!isSeparateAcquisition(asset)` | 같은 leaf(`split-acq-mode.ts:295`) |
| 6 | `!(asset.usePreHousingDisclosure && 두 파트 모드 모두 "estimated")` | 엔진 PHD early-return(`transfer-tax-split-gain.ts:67-69`) · 화면의 `isPhdBothEstimated`(`CompanionAcqPurchaseBlock.tsx:498-502`) |
| 7 | `requiresAcqStdPrice(withExpenses(asset), {landMode: effectivePartAcqMode(asset.landAcqMode, asset), buildingMode: …, isSeparate: false})` | V8과 **같은 호출**(`validate-split.ts:147-155`) |

⚠️ 6항은 **현행 V8에는 없다**(V8은 PHD를 보지 않는다 — 확인 필요: PHD 양쪽 환산 + 소유자 분리에서 V8이 단가·면적·총액을 요구하는데 엔진은 그 값을 안 씀 → 기존 과잉 요구일 수 있음). leaf에 6항을 넣으면 N만 6항을 따르고 기존 3종은 V8 현행 유지라 **세 필드와 N의 조건이 달라질 수 있다**. → 6항 포함 여부는 E-n로 엔진 §3과 한 번에 정한다(권장: 6항을 leaf에 넣고 V8의 3종에도 같은 leaf를 쓰도록 **V8 전체를 leaf로 교체** — 같은 술어 한 곳, 기존 과잉 요구도 함께 해소). 이 경우 기존 anchor 영향은 §7.3에 반영.

**⑤ 호출부**: 두 사이트 모두 `props.asset`으로 leaf를 부른다(자산 전체 술어 재파생 금지 — `CompanionAcqPurchaseBlock`이 이미 계산한 `acqStdPriceRequired`는 `isSeparate` 인자가 `isSeparateAcq`라 의미가 같으나, 7항의 `effectivePartAcqMode(props.asset?.…, props)` 인자와 asset 기반 호출이 같은 값을 내는지 **패리티 테스트**(§7.3 #U-1)로 고정).

### 2.4 Q-4 결정 — 직접 입력 허용 (확정 요청 Q-U1)

| 선택지 | 판정 | 근거 |
|---|---|---|
| 모달 전용(입력칸 읽기 전용) | ✕ | 양도시 칸(`TransferBuildingStdFields`)은 「계산기 결과를 덮어쓸 수 있어야」(`TransferStdPriceCards.tsx:89-91`)로 편집 칸을 유지 — 같은 값을 시점만 다르게 받는 칸이 한쪽만 잠기면 불일치 |
| **모달 + 직접 입력 허용** | ✅ | 국세청 건물 기준시가는 모달 산정 외에도 홈택스·세무사 산정서로 얻는다. 모달은 건축물대장 연면적(재산세제과-802·조심2016중0801)·구조·용도·경과연수 입력이 필요해 그 값을 이미 가진 사용자에게 강요할 이유가 없다. 별개 취득 취득시 칸(`LandBuildingSplitSection.tsx:176-195`)도 같은 형태 |
| 직접 입력 + 모달 고지만 | ✕ | 런처가 이미 존재(재사용이 Q-4 결정) |

미입력 = **차단**(Q-3, ⑧ §5). 모달 「적용」 → `onApply(v) → onChange({buildingStandardPriceAtAcq: String(v)})`.

### 2.5 라벨·hint·testid

| 요소 | 값 |
|---|---|
| 카드 래퍼 `data-testid` | `acq-building-std-card` — **별개 경로의 `split-building-std-acq-card`와 분리**한다. 기존 DOM 테스트가 비-별개 케이스에서 그 testid를 `toHaveLength(0)`으로 단언(`split-input-flow-reorder.test.tsx:195` · `split-acq-std-asset-block-hidden.test.tsx:190` · `split-part-std-card-gating.test.tsx:176,189`)하므로 같은 testid를 쓰면 「별개 전용」 의미가 흐려진다(`feedback_new_widget_breaks_uniqueness_selectors`) |
| 입력 `data-testid` | `acq-building-std` |
| FieldCard `field` | `buildingStandardPriceAtAcq` (⑧ `fieldError` 앵커 = 별개 경로와 **같은 키** — 둘이 동시에 렌더되지 않음: 5항 `!isSeparateAcquisition`) |
| 라벨 | 「취득시 건물 기준시가」 + `required`(`*`) · 단위 「원」 |
| hint | 「국세청 건물 기준시가 산정 방법(건축물대장 연면적 기준)으로 구한 취득일 직전 고시분입니다. 개별주택가격(부수토지 포함)을 토지 기준시가 : 건물 기준시가 비율로 나누는 데 씁니다.」 — **조문·사건번호는 UI에 쓰지 않는다**(사실 설명만; 출처는 코드 주석: 재산세제과-802 · 조심2016중0801 · 집행기준 99-164-9, `authority.md` §2) |
| 런처 | `buttonLabel="취득시 건물 기준시가 계산"`(별개 non-both와 동일) |
| tone | 호박색 박스 안(취득 = amber) — 별도 ToneCard 신설 없음(박스가 이미 amber). (a)는 박스가 없으므로 L 카드와 같은 시각 층위의 `ToneCard tone="amber" noDark`로 L·N을 묶지 않는다(기존 L 카드 형태 유지, 변경 최소) |
| placeholder | 없음(숫자 예시 금지 — CLAUDE.md) |
| 포커스 전체선택 | `CurrencyInput` 내장(`SelectOnFocusProvider`) |

### 2.6 ASCII 목업

**(a) 매매 + 소유자 분리 — ③ 취득정보**
```
 취득시 기준시가 (원) *
 ┌────────────────────────────────────────────────┐
 │ [2026 ▾] [공시가격 조회]   공시가격 [   금액 입력  ] 원 │   ← 총액 H (개별주택가격)
 └────────────────────────────────────────────────┘
  개별주택가격(부수토지 포함)을 아래 토지·건물 기준시가 비율로 토지분·건물분에 나눕니다 (§166⑥).
  토지 기준시가 = ㎡당 공시지가 × 면적                          ← §3 문구 교체
 ┌ 취득시 토지 공시지가 [      원/㎡] [공시지가 조회] 토지기준시가 [자동] 원 ┐   ← L (기존)
 └──────────────────────────────────────────────────┘
 ┌ 취득시 건물 기준시가 *                          [   금액 입력  ] 원 ┐   ← N (신규 · data-field=buildingStandardPriceAtAcq)
 │  국세청 건물 기준시가 산정 방법(건축물대장 연면적 기준)으로 구한  │
 │  취득일 직전 고시분입니다. 개별주택가격을 토지 기준시가 :      │
 │  건물 기준시가 비율로 나누는 데 씁니다.                       │
 │                                   [취득시 건물 기준시가 계산] │   ← modalLauncher
 └──────────────────────────────────────────────────┘
```
**(b) 상속·증여 + 소유자 분리** — 같은 3칸이 `non-purchase-split-inputs` 안 호박색 박스에 들어간다: `총액` → [`취득시 토지 공시지가`·`토지기준시가` / `토지 면적` / **`취득시 건물 기준시가`(신규)**] → 축 A(양도시 기준시가 카드).

**N이 숨는 경우**(leaf false): 칸·요구 모두 없음. 예) 본인 파트 취득가액을 직접 입력한 소유자 분리(분할이 비율을 안 씀) / 소유자 분리가 아닌 경우 전부.

### 2.7 활성화 시나리오 매트릭스

| 시나리오 | N 칸 | ⑧ 요구 | ④ 전송 |
|---|---|---|---|
| a 매매 · 소유자 분리 · 두 파트 취득가액 비움(비율 안분) | ● | ● | ● |
| a 같음 · 환산취득가 | ● | ● | ● |
| a 같음 · 토지 파트 실가 입력(소유자=토지) | ○ | ○ | ○ (비율 불요) |
| a 같음 · PHD + 양쪽 환산 | ○(6항 채택 시) | ○ | ○ |
| b 상속·증여 · 소유자 분리 (파트 취득가액 입력 경로 없음 → 항상 비율) | ● | ● | ● |
| 별개 취득(날짜 다름) · 소유자 분리 | 별개 파트 카드가 N을 받음(기존) | 기존 V6 | 기존 |
| (c) 소유자 분리 아님 | ○ | ○ | ○ |
| 부담부증여·겸용·building | ○ | ○ | ○ |

### 2.8 불변식 (구현 시 테스트로 고정 — §7.3)

- `acq-building-std-card` 노출 ⇔ leaf true ⇔ ⑧이 N을 요구 ⇔ ④가 N 전송 ⇔ ⑫가 N을 요구(엔진). 격자 전수 패리티 테스트(`feedback_fe8_vs_12_parity_grid`).
- `split-building-std-acq-card`(별개)와 `acq-building-std-card`(비-별개)가 **동시에 0 또는 1**이며 둘 합 ≤ 1.

### 2.9 조건부 — 양도시 분모 척도 (E-1 의존)

현행 환산 분모는 `landStandardPriceAtTransfer`·`buildingStandardPriceAtTransfer` **raw**(UI: 축 A 카드의 토지 단가×면적, 건물 나목 모달)이고 양도시 개별주택가격 `standardPriceAtTransfer`는 **fallback에만** 쓰인다(`transfer-tax-split-acq-price.ts:296-306`, 엔진 감사 §1.2 실측 「`standardPriceAtTransfer`를 바꿔도 결과 불변」). 분자(취득시)가 비례(H 몫)로 바뀌면 분모(raw)와 척도가 갈린다 — 감사 §3의 a2 anchor는 **분모도 비례 몫**으로 넣은 값이다.
- **엔진이 분모를 raw로 둔다** → UI 추가 입력 없음(본 설계 그대로). 단 환산율이 분자·분모 척도 불일치임을 §9에 명시.
- **엔진이 분모도 `H_T × L_T/(L_T+N_T)`로 간다** → UI에 **양도시 개별주택가격(결합) 입력칸**이 비-별개 소유자 분리 경로에 필요하다. 현재 그 칸은 매매 경로 「양도시 기준시가 (원)」(`CompanionAcqStdPriceSection.tsx:206-232`, `useEstimatedAcquisition`일 때만)에만 있고 (b)·분리 모드에는 없다. 그 경우 `TransferStdPriceCard`(축 A, emerald)에 3번째 칸을 추가하고 ⑧ V7·⑫ V7·④(`standardPriceAtTransfer` 전송)를 같이 열어야 한다 — **본 설계에 포함하지 않았고**, E-1 결정 뒤 §2 개정으로 넣는다.

## §3 문구 정정

### 3.1 역방향 grep (전수 — `components app lib`, `총액 ?[−-] ?토지|결합 총액에서|총액에서 토지|결합 공시액에서|역산`)

**화면에 보이는 문구(교체 대상 4건 + 선택 1건)**

| # | 위치 | 현재 | 교체 |
|---|---|---|---|
| T1 | `CompanionAcqStdPriceSection.tsx:171` (hint) | 「토지·건물 안분 비율 산정 기준 (§166⑥). 토지분 = ㎡당 공시지가 × 면적, 건물분 = 총액 − 토지분」 | **주택**(`propertyKind === "house_individual"`): leaf true → 「개별주택가격(부수토지 포함)을 아래 토지·건물 기준시가 비율로 토지분·건물분에 나눕니다 (§166⑥). 토지 기준시가 = ㎡당 공시지가 × 면적」 / leaf false → 「토지·건물 안분 비율 산정 기준 (§166⑥)」(뺄셈 절 삭제). **주택 외**: 현행 유지(E-3 결정 전까지 엔진이 building 뺄셈을 유지하므로 서술이 사실) |
| T2 | `CompanionAcqStdPriceSection.tsx:187` (L 필드 hint) | 「취득일 직전 고시 개별공시지가 (원/㎡) — 위 총액에서 토지분을 가르는 근거 (§99①1호 가목)」 | 「… — 토지 기준시가(개별주택가격을 나누는 비율의 토지 몫) 산정 근거 (§99①1호 가목)」 |
| T3 | `NonPurchaseSplitInputsBlock.tsx:88` (hint) | T1과 같은 문구 | T1 주택 분기와 같은 문구(이 블록은 소유자 분리 전용 → leaf true일 때 비례 문구, false면 짧은 문구) |
| T4 | `NonPurchaseSplitInputsBlock.tsx:120` (L 필드 hint) | 「… — 위 총액에서 토지분을 가르는 유일한 근거 (§99①1호 가목)」 | T2와 같은 문구(「유일한」 삭제 — 나목이 추가됨) |
| T5 | `SplitGainDetailSection.tsx:127-135` (결과 안내, 주택 분기) | 「개별주택가격(부수토지 포함)에서 토지분을 분리한 값입니다 (소득세법 시행령 §163⑥2호가목).」 | §6.2 — 비례 안분 블록으로 교체. 단 저장 이력의 구 resultData(뺄셈)는 이 문구 그대로가 사실이라 **echo 없는 결과는 현행 문구 유지** |
| (선택) T6 | `LandBuildingSplitSection.tsx:182` (별개 N hint) | 「…결합 공시액에서 역산하면 건물분에 토지 취득시점이 섞인다.」 | 「…결합 공시액을 나눠 쓰면 건물분에 토지 취득시점이 섞인다.」 — 역산 용어가 S3-1 후 코드에서 사라지므로 오독 방지(별개 취득의 요지는 불변). 사건 의존 e2e 없음(`/^자산: 건물분 취득시 기준시가를 입력하세요/`는 ⑧ 메시지 접두) |
| (선택) T7 | `LandBuildingSplitSection.tsx:472` (`notOwnedReason`) · `transfer-tax-validate-split.ts:223` 메시지 | 「건물분 취득시 기준시가를 결합 공시액에서 도출하려면 토지분이 필요합니다」 / 「…결합 총액에서 역산하면…」 | T7a: 「토지는 타인 소유이나, 토지분 기준시가는 환산취득가·개산공제 계산에 필요합니다 (§99①1호 가목)」(별개 경로 ①'의 근거가 이미 낡음 — 같은 파일 주석 :369-371이 「주택은 파트 독립」으로 스스로 정정). T7b 메시지: 「결합 총액에서 건물분을 도출하면…」 — 접두 `^자산: 건물분 취득시 기준시가를 입력하세요` 유지(`validation-field-jump-cases-leaf.ts:302` 정규식) |

**보이지 않는 stale 주석(교체 대상)**

| # | 위치 | 비고 |
|---|---|---|
| C1 | `LandBuildingSplitSection.tsx:105-110` (`PartAcqStdPrice` 헤더) · `:347-350` · `:459-460` | 「주택은 `결합 총액 − 토지분` 역산만 허용/유일 경로」 — **`:366-372`(같은 파일)와 이미 모순**인 stale. 사용자 요청 대상(:347-350·459-460) + :105-110 |
| C2 | `TransferStdPriceCards.tsx:34-36` · `:94` | 「취득시 축의 역산은 개산공제 합계를 법정액에 맞추기 위한 것」 — S3-1 후 취득시도 비례 |
| C3 | `transfer-tax-api-split.ts:88` · `:150` | 「건물분을 역산하는 유일 경로」 · 「legacy 역산(calcAcqStdPair :58-61)」 |
| C4 | `lib/stores/calc-wizard-asset.ts:734-739` | `buildingStandardPriceAtAcq` 필드 doc — 「building 전용·미입력 시 총액 역산으로 후퇴(한시)」 → 「주택·건물 공용, 미입력은 ⑧ 차단」(✱ 이 파일은 929줄 — 주석 교체만 ±0줄, §8) |
| C5 | `CompanionAcqStdPriceSection.tsx:108-113`(「읽기 전용 3열 파생 패널 폐지」 서술은 사실 — 유지) · `NonPurchaseSplitInputsBlock.tsx:62-69` 주석 「건물분 = 총액 − 토지분」 | 후자는 교체 |
| C6 | `lib/calc/transfer-tax-split-acq-mode.ts:259-262` · `lib/tax-engine/transfer-tax-split-acq-price.ts:27-28` | **엔진 영역**(엔진 시니어가 함수 교체 시 함께 — 「역산이 정본」 삭제) |

**그대로 두는 것(비해당 확인)**: `PreHousingDisclosureSection`·`CarryoverEstimationSection`·`MixedUse*`의 「역산」은 §164⑤ 3시점 환산(다른 개념). `PreHousingDisclosureDetailSection.tsx:190,217`의 「추정 취득시 주택가격 − 토지 성분」은 PHD 결과의 잔액 서술(엔진 감사 §5.3 — 의미상 맞음). `FilingFormTableHelpers`·`exempt-gross-gain` 등 「역산」은 취득가액 표시용(무관).

## §4 ①②③④

| 지점 | 판정 | 내용 |
|---|---|---|
| ① 타입 | **변경 없음** | `AssetForm.buildingStandardPriceAtAcq: string`(`calc-wizard-asset.ts:740`) 재사용. 주석만 C4 |
| ② initial | **변경 없음** | `calc-wizard-asset-factory.ts:242` `""` |
| ③ normalize | **변경 없음** | `calc-wizard-asset-migrate.ts:80` `undefined → ""`. 필드가 새로 생기는 것이 아니므로 stale 가드 신설 없음. 값 의미가 넓어지는 점(별개 전용 → 비-별개 겸용)은 아래 stale 논의 |
| ④ API 변환 | **변경 1곳** | `transfer-tax-api-split.ts:145-157`: 현재 `...(separateAcquisition ? { buildingStandardPriceAtAcquisition, standardPriceAtAcquisition: undefined } : {})` **한 블록**. 두 효과를 분리한다: ① N 전송 = `separateAcquisition ∥ ownerSplitHousingNeedsBuildingStd(primary)` ② `standardPriceAtAcquisition: undefined` 덮어쓰기 = **별개 취득 전용 유지**(비-별개는 총액 H가 비례의 입력이므로 보내야 한다). 총액 H는 본체(`transfer-tax-api.ts`)가 이미 송신 |
| ④ 다건·컴패니언 | **자동** | `buildSplitPayload` 호출 3곳(단건 `transfer-tax-api.ts:418` · 다건 `multi-transfer-tax-api.ts:282` · 컴패니언 `transfer-tax-api-companion-payload.ts:179`)이 같은 함수 — 한 곳 수정으로 전파 |
| ⑬ spread | **변경 없음** | 필드 이미 전송 경로 존재(`transfer-tax-api-split.ts:147`이 body에 spread됨) |
| ⑫ Zod | **엔진 시니어** | `buildingStandardPriceAtAcquisition: z.number().int().positive().optional()`(`transfer-tax-schema-split.ts:73`) — 스키마 변경 불필요. **필수 refine**은 `required-refines-2a.ts:214-219`(V8 ⑫)에 N 추가 + `:243-249` 총액 대체 허용 삭제 = 엔진 §4 |
| ⑭ Route | **변경 없음** | `engine-input.ts:328` · `multi/route.ts:204` · `bundled-split-helpers.ts:410-411`이 무조건 전달 |
| stale sessionStorage | **새 위험 1** | 별개 취득 중 입력한 N이 비-별개 전환 후에도 남는다. **N은 건물 취득일 직전 고시분이고 비-별개에서 건물 취득일 = 취득일이므로 의미는 유효**하다. 다만 **취득일을 바꾼 뒤** 남은 N이 stale이 되는 것은 모든 취득시 기준시가 칸이 공유하는 일반 위험(별도 해소 대상 아님). ④가 leaf false에서 N을 **안 보내므로** 숨은 값이 계산에 쓰이지 않는다 |

## §5 ⑧ validation

대상: `lib/calc/transfer-tax-validate-split.ts` V8 블록(`:136-171`). 현행은 `selfOwnsSplit ∧ ¬separate ∧ requiresAcqStdPrice`일 때 단가→면적→총액 순으로 첫 빈 칸을 `fieldError`로 반환.

| 항목 | 설계 |
|---|---|
| 요구 추가 | 총액 다음에 **`buildingStandardPriceAtAcq` 비었으면** `fieldError("buildingStandardPriceAtAcq", msg)`. 순서 = 화면 순서(단가 → 면적 → 총액 → 건물 나목) |
| 조건 | 기존 V8 조건 + 주택·겸용 아님·부담부 아님(+PHD 6항은 E-5). **leaf 하나로 교체** 권장(§2.3) — V8·⑤·④·⑫가 같은 술어 |
| 메시지 | `${label}: 토지·건물 소유자가 다르면 본인 소유분만 과세하므로 개별주택가격을 토지·건물 기준시가 비율로 나눠야 합니다 — 취득시 건물 기준시가를 계산기로 산정하거나 직접 입력하세요 (소득세법 §99①1호 나목·시행령 §166⑥).` — **접두는 기존 `^자산: 토지·건물 소유자가 다르면 본인 소유분만 과세`와 같게** 둬서 검증 이동 케이스 정규식(`validation-field-jump-cases-leaf.ts:280-296`)이 한 접두로 유지되게 한다 |
| 앵커 렌더 보장 | 필드 키 `buildingStandardPriceAtAcq` = 새 FieldCard `field` → 이동 가능. **leaf true인 모든 상태에서 칸이 렌더되고, leaf false에서는 요구도 없다** = 막다른 오류 없음. 검증이 `②·③` 섹션이 접힌 상태에서도 이동하는 기존 메커니즘 재사용(단가·면적·총액과 같은 섹션 ③) |
| 3중 패턴 | fallback 없음(자동 안분 금지 정책 준수) — display fallback 미사용, 값이 비면 칸이 비어 있고 ⑧이 막는다. `useEffect → store` 없음 |
| 검증 이동 케이스 신규 | `validation-field-jump-cases-leaf.ts`에 **2건**: 「leaf: split 소유자 분리 — 건물 취득시 기준시가 (매매 실거래가)」·「(상속)」 — 기존 `owner()` 헬퍼에 `standardPricePerSqmAtAcq`·`acquisitionArea`·`standardPriceAtAcq`를 채워 N만 비게. 기존 「기준시가 총액」 케이스(`:293-296`)는 N이 총액 **뒤**라 영향 없음 |
| 영향받는 기존 단언 | `owner-split-acq-std-gate-b2.anchor.test.ts:48-52` 「3종을 채우면 통과」→ N 추가 필요 · `transfer-dead-end-defects.spec.ts` 별건 B2 (나): 3칸 채우고 통과 기대(`:626-632`) → N 칸 채우기 추가 · `transfer-tax-validate-split.test.ts`의 V8 케이스 |

## §6 ⑥⑦

### 6.1 ⑥ 사이드바 — 변경 없음 (확인)

- 대상 자산은 `isPlainLumpSumAsset`(`transfer-per-asset-summary.ts:139-152`)이 **제외**한다(`hasSeperateLandAcquisitionDate` · `effectiveSelfOwns≠both` 둘 다 배제). 따라서 계산 전 개산공제 미리보기(`:695-706` `총액 × 율`)에 안 걸리고 `expensePending`(`:708`)으로 표시되며, 계산 후에는 `singleResult.expenses`(엔진 값)를 읽는다(`:690-694`).
- 개산공제 항등성(`토지분 + 건물분 ≡ 총액`)은 비례도 `land' + building' = H`(잔액 흡수)라 유지되지만 파트별 floor 1원은 가능 — 그러나 사이드바가 이 경로에서 총액×율을 쓰지 않으므로 **영향 없음**. 감사 §7-7의 「확인 필요」를 이 설계에서 해소.

### 6.2 ⑦ 결과·신고서·PDF — 엔진 echo를 읽기만 한다

확인: 결과 소비 지점 4곳 — `SplitGainDetailSection.tsx`(`splitDetail.land/building.stdPriceAtAcq`·`lumpDeductionBase`·`acquisitionPrice`) · `lib/pdf/ResultPdfTransferSections.tsx:88-120`(`acquisitionPrice`·`appraisalDeduction`) · `FilingFormTableColumns.ts:108`·`FilingFormTableHelpers.ts:322`(컬럼 구성·값은 echo) · `ValuationDetailCards.tsx:148`(통과). `stdPriceAtAcq`/`lumpDeductionBase`를 찾는 grep 전수 결과 **뺄셈(총액 − 토지)을 UI에서 다시 계산하는 사본은 없다** — 문구만 남았다(§3). `feedback_aggregate_display_rederives_engine_value` 해당 없음.

**신규 표시(E-2 echo 필요)** — `SplitGainDetailSection`의 개산공제 행 아래(T5 자리), 엔진이 `splitDetail.stdSplit`을 싣는 경우에만 렌더:

```
 개별주택가격 분할 (취득시)
 토지분 기준시가 = 개별주택가격 480,000,000 × 토지 기준시가 240,000,000 ÷ (토지 기준시가 240,000,000 + 건물 기준시가 360,000,000)  = 192,000,000
 건물분 기준시가 = 개별주택가격 480,000,000 − 토지분 192,000,000                                                      = 288,000,000
```
- 변수 약어 금지·한국어 풀어쓰기·각 숫자 옆 라벨. `Math.floor` 묵시(산식에 표기 안 함 — 토지분 값은 echo 그대로). 건물분은 잔액 흡수가 엔진 규약이면 「개별주택가격 − 토지분」 정확 정수식(엔진 §2와 맞출 것, E-2).
- 렌더 컴포넌트: `FLine`/`Frac` 표준(`components/calc/results/shared/FormulaParts`). 위 예시 숫자는 감사 §3 a2 가상 fixture(취득시 H 480M · L 240M · N 360M)에서 가져온 **설명용**이고 값은 echo에서 온다.
- 요청 echo: `splitDetail.stdSplit?: { housingTotal: number; landBasis: number; buildingBasis: number }`(옵션 — 별개·구 resultData·building 비례 미적용 경로에서는 없음). `stdPriceDerivedFromTotal` 플래그는 의미가 「뺄셈 도출」→「결합가에서 분할」로 바뀌므로 엔진이 명명을 정하되 UI는 `stdSplit` 유무로 분기(플래그 의미 변경에 UI가 의존하지 않게).
- 이월·합산(저장값 경로)·이력: 저장 `resultData`는 구 스냅샷(뺄셈) — `stdSplit` 없음 → T5의 구 문구 유지가 사실. 「이 조건으로 재계산」은 N이 비어 ⑧이 막는다(값을 지어내지 않는다 — Q-3).

## §7 E2E · 테스트

### 7.1 신규 spec — `e2e/transfer-housing-acq-building-std-nonseparate.spec.ts`

| # | 시나리오 | 단언 |
|---|---|---|
| E1 | (a) 매매 + 소유자 다름 ON (날짜 미입력, 실가) | `acq-building-std-card` **보임** · `toHaveCount(1)` · DOM 순서상 `[data-field=standardPricePerSqmAtAcq]` **뒤**·`split-sale-std-card` **앞** · `split-building-std-acq-card` **0**(별개와 배타) · 긍정 짝: 같은 상태에서 「건물만 본인」 ↔ 「토지만 본인」 전환에도 유지 |
| E2 | (b) 상속 + 소유자 다름 ON | `non-purchase-split-inputs` 안에 `acq-building-std-card` |
| E3 | 노출 해제 부정 짝 | (a)에서 본인 파트 취득가액 입력 → N 칸 **0**(leaf false) · 소유자 다름 OFF → 0 · (c) 「취득일 다름」만 ON → 0 |
| E4 | 별개 전환 배타 | (a)에서 토지 취득일을 다르게 입력 → `acq-building-std-card` 0, `split-building-std-acq-card` 1 |
| E5 | ⑧ 차단 + 입력칸 이동 | 시드(`seedFormAndOpen` + 기존 `withPrimary`·`ownerSplit`, `transfer-dead-end-defects.spec.ts:612-640` 방식) — 단가·면적·총액만 채움 → 「다음」 → 패널의 N 오류 클릭 → `focusIn("buildingStandardPriceAtAcq")` → 채움 → 오류 소멸 → 「보유 상황」 진입(`aria-current=step`) |
| E6 | 모달 적용 | 런처 클릭 → 모달에서 연면적 등 입력 → 「취득시 적용」 → 칸이 값으로 채워짐 · `applyTimePoint="acquisition"`이라 양도시 적용 버튼 없음 |
| E7 | request body | `page.waitForRequest(/api\/calc\/transfer$/)` — 계산 클릭 후 body JSON에 **`buildingStandardPriceAtAcquisition` 있음 ∧ `standardPriceAtAcquisition` 있음**(별개 취득의 총액 undefined 덮어쓰기와 달리). 별개 전환 시 `standardPriceAtAcquisition` 없음(회귀 0) |
| E8 | 결과 | 계산 후 결과에 「개별주택가격 분할」 블록(E-2 echo 반영 시) — 입력값이 산식 숫자에 반영(`splitDetail.stdSplit` 숫자 = 입력) |

⚠️ `ready()`의 hydration 대기·`nextjs-portal` 숨김 등 `transfer-dead-end-defects.spec.ts:16-24` 선례를 따른다. 새 spec이 아니라 기존 jump 케이스 2건(§5)이 오류 이동을 이미 덮으므로 E5는 jump 케이스와 중복되지 않게 「채우면 통과」 쪽만 둘 수 있다.

### 7.2 역방향 grep — 영향받을 기존 e2e/spec (필드명·testid, 자르지 않음)

| 파일 | 영향 | 조치 |
|---|---|---|
| `e2e/transfer-dead-end-defects.spec.ts:612-640` (별건 B2 (나)) | **깨짐** — 단가·총액만 채우고 통과 기대 | N 채우기 추가. (가)는 leaf false라 무영향 |
| `e2e/_helpers/validation-field-jump-cases-leaf.ts:263-296` | 기존 owner 케이스 5건은 N이 **마지막 순서**라 무영향. 총액 케이스(:293)는 총액 이전이라 무영향 | 신규 2건 추가 |
| `e2e/transfer-self-owns-filing-form.spec.ts:20-80` | `assetKind: "building"` + building_only + 같은 날 + 환산 — 비-별개 building. **E-3이 building을 비례로 안 바꾸면 무영향**, 바꾸면 N 시드 추가 | E-3 결정 후 |
| `e2e/split-mode-gating.spec.ts:626-700` | 「소유자 다름 ON」 가시성만 — N 칸 추가는 `non-purchase-split-inputs`·`acq-date-land` 단언에 영향 없음. 단 `:208,396,578`의 `split-building-std-acq` 단언은 **별개 취득**이라 무영향(testid 분리의 이유) | 없음 |
| `e2e/transfer-sidebar-estimated-preview.spec.ts` · `transfer-estimate-mode-lump-sum-deduction.spec.ts` | `standardPriceAtAcq` 사용(grep) — 비-split 환산 경로 추정(확인 필요: selfOwns 없음) | 실행으로 확인 |

### 7.3 vitest 영향 (역방향 grep — `selfOwns: "building_only"|"land_only"` 22파일 중 UI 층)

- **계산·검증 층**: `__tests__/calc/owner-split-acq-std-gate-b2.anchor.test.ts`(:48-52 「3종 채우면 통과」→ N 추가 · 긍정 짝 보강) · `transfer-tax-validate-split.test.ts`(V8 케이스) · `split-owned-part-payload-gate-review-2026-08-f24.test.ts`(④ 게이트 — N 전송 조건 추가 케이스) · `zod-required-2-oh-m2-payload.anchor.test.ts` · `split-sale-std-part-gate.test.ts` · `multi-transfer-api-sync.test.ts`(다건 ④ 동기).
- **DOM 층**: `split-part-std-card-gating.test.tsx`(G14~G17 building_only — 하니스가 별개 날짜면 무영향, 비-별개 날짜면 N 카드 추가 확인) · `split-acq-std-asset-block-hidden.test.tsx`·`split-std-price-colocation.test.tsx`·`split-input-flow-reorder.test.tsx`(하니스에 selfOwns 전달 — `split-building-std-acq-card` 0 단언은 testid 분리로 유지) · `filing-form-self-owns-split.test.tsx`(신고서 — 무영향 예상).
- **신규**: #U-1 `__tests__/calc/owner-split-building-std-leaf-parity.test.ts` — `ownerSplitHousingNeedsBuildingStd` ↔ V8 요구 ↔ ④ 전송 ↔ (엔진 쪽) ⑫ 요구의 **격자 전수**(selfOwns 3 × assetKind 3 × 취득원인 2 × 별개 여부 2 × 파트 모드 조합 × PHD 2 × 부담부 2) · #U-2 `__tests__/components/acq-building-std-field.test.tsx`(노출 ⇔ leaf, 런처 props 중 `applyTimePoint="acquisition"`·`snapshotKey` 형식, 별개 `PartAcqStdPrice` 위임 후 DOM 불변) · #U-3 `__tests__/components/split-gain-std-split-display.test.tsx`(echo 있음/없음 두 갈래 문구).
- **vitest 환경**: DOM을 렌더하는 테스트는 `.test.tsx`(CLAUDE.md `DOM_TS` 함정).
- 엔진 쪽 anchor(MUT_A 40건/18파일)는 엔진 시니어 §6 소관.

## §8 800줄

| 파일 | 현재 | 예상 증감 | 착지 | 판정 |
|---|---|---|---|---|
| `components/calc/transfer/AcqBuildingStdField.tsx` (신규) | — | +~90 | ~90 | OK |
| `LandBuildingSplitSection.tsx` | 553 | −~25(non-both 분기 위임) · 주석 정리 ±0 | ~530 | OK |
| `CompanionAcqStdPriceSection.tsx` | 236 | +~14 | ~250 | OK |
| `NonPurchaseSplitInputsBlock.tsx` | 149 | +~14 | ~165 | OK |
| `CompanionAcqPurchaseBlock.tsx` | 537 | 0(필요 시 prop 1개) | 537 | OK |
| `transfer-tax-api-split.ts` | 256 | +~8(+주석 교체) | ~265 | OK |
| `transfer-tax-validate-split.ts` | 500 | +~16 | ~516 | OK |
| `transfer-tax-split-acq-mode.ts` | 583 | +~35 | ~618 | OK(≤700) |
| `SplitGainDetailSection.tsx` | 199 | +~25 | ~225 | OK |
| `lib/stores/calc-wizard-asset.ts` | **929(이미 초과)** | 주석 교체만 ±0 | 929 | ⚠️ 기존 초과 — 편집 시 hook 경고. **분리는 별건**(범위 밖, 줄 수 증가 없음) |

## §9 미결·확인 필요

### 엔진 시니어와 맞출 것 (E-n)

| # | 항목 | UI 영향 |
|---|---|---|
| **E-1** | **환산취득가 분모 척도** — 분자는 비례 몫, 분모(양도시)는 raw 가목·나목(`split-acq-price.ts:296-306`). 분모도 `H_T × L_T/(L_T+N_T)`로 갈지 | 가면 §2.9 — 비-별개 소유자 분리 경로에 **양도시 개별주택가격 칸** + ⑧ V7·⑫ V7·④ 전송 개방. 안 가면 환산율 척도 불일치를 §9에 명시(감사 §3 a2의 큰 차이가 척도 정리 효과 포함이었음) |
| **E-2** | 결과 echo `splitDetail.stdSplit {housingTotal, landBasis, buildingBasis}` 신설 · 건물분 규약(잔액 흡수 `H − 토지분` vs 독립 floor) | §6.2 표시. echo 없이는 비례 산식을 화면에 못 낸다(UI가 재계산하면 dual-truth) |
| **E-3** | `assetKind==="building"`(건물·토지 제외) 비-별개: A2가 housing·building 공용(`calcAcqStdPair`는 propertyType 구분 없음) — 이번에 비례로 가는가 | UI leaf 1항을 `housing`으로 한정했다. building도 가면 leaf 1항·T1 문구·e2e `transfer-self-owns-filing-form` 시드 변경. **building 비-별개의 총액이 단가×면적 모드(`StandardPriceInput` `isAreaMode`)라 총액 = 토지분과 같아 뺄셈이 건물분 0을 만드는지 확인 필요**(미검증) |
| **E-4** | 🔴 **엔진 설계 §3.2(2026-10-06 작성분)와 어긋나는 지점** — 엔진 leaf `requiresHousingBuildingStdAtAcq`는 `housing ∧ ¬별개 ∧ requiresAcqStdPrice`이고 **`selfOwns≠both`를 보지 않으며**, 「L>0 ∧ H>0인데 N만 없으면 **비-별개에서도 throw**」다. 그러면 (c) 같은 소유자 비분리 상태에서 **막다른 길**이 생긴다: 소유자 분리 ON → 토지 단가 입력 → 소유자 분리 OFF(`hasSeperate…`는 유지 — `AssetOwnershipSplitSection.tsx:63-66`) → 단가·면적이 남아 있고(④ `buildLandStdAtAcquisitionPayload`는 분할 여부 무관 전송 `:232-240`) 환산 파트면 L>0∧H>0 → 엔진 throw. 그런데 화면에는 단가칸·N칸이 **없고**(§1.2 c) ⑧ V8은 `selfOwnsSplit` 게이트라 요구하지 않는다 → **입력 칸 없는 계산 실패**. (코드 대조 결과 — 이 순서를 화면에서 실행해 보지는 않았다.) **제안: 엔진 throw·⑫·⑧·UI 노출·④ 전송 전부에 `selfOwns≠both`(= V8·⑫ V8이 이미 쓰는 게이트)를 포함**한다. 그러면 (c)-stale은 종전처럼 쌍이 안 만들어져 `null`(분할 포기) — 현행(뺄셈으로 분할 실행)과 **결과가 달라지는 지점**이므로 엔진 §9 사용자 영향 항목 ⑤와 묶어 확인 | N 칸 노출 = 이 leaf. 엔진이 selfOwns를 안 보면 UI도 (c)에서 N·L을 열어야 해 Q-U2가 뒤집힌다 |
| **E-5** | V8·⑫·leaf의 PHD 양쪽 환산 처리(현행 V8은 PHD를 안 봄 — 확인 필요) | leaf 6항 포함 여부 — V8 전체를 leaf로 교체 권장 |
| **E-6** | N의 지분 스케일 | N은 물건 전체 속성값이라 `ratioed` 미적용(단가·총액과 동일, `transfer-tax-api-split.ts:28-35` 주석). 엔진이 `lumpDeductionBase`에서 지분 적용하는지 확인 |
| E-7 | 일부양도(`areaScenario partial`)·§164⑨ 공익수용에서 H 분할 | 토지 면적은 `acquisitionArea`/`transferArea`가 시나리오별로 갈린다(`usesTransferAreaForAcqStdPrice`). N의 연면적은 건물 전체 — 일부 양도에서 N의 적용 범위는 엔진 §7 불변 경로 표에서 확인 |
| **E-8** | (i) **술어 인자 형태**: 엔진 leaf는 `(g:{isHousing,isSeparate}, flags, ctx)` — UI의 `ownerSplitHousingNeedsBuildingStd(asset)`는 이를 감싸는 **얇은 AssetForm 어댑터**로 두고 selfOwns·겸용·부담부·PHD 게이트를 어댑터가 더한다(엔진 leaf 안에 폼 전용 플래그를 넣지 않는다). (ii) **④ 전송 게이트**: 엔진 §4는 `isSplitActive ∧ housing ∧ !isMixedUseHouse ∧ !usesPhd`로 넓게 보내는데, UI는 **노출 leaf와 같은 조건에서만** 보낸다(숨은 stale N이 비례에 쓰이는 것 방지 — `feedback_ui_gate_removes_sole_input_path`·3중 패턴). 두 조건이 다르면 ⑤·④·⑧ 격자 테스트가 깨지므로 하나로 확정 필요. (iii) **⑤ 호스트 위치**: 엔진 §8-2는 N 카드를 `LandBuildingSplitSection`의 `PartAcqStdPrice`(`stdCardBase` 확장)에 열라고 하나, 비-별개에서는 그 섹션에 **토지 단가 칸이 없고** 총액·단가·면적이 `CompanionAcqStdPriceSection`/`NonPurchaseSplitInputsBlock`에 있다. UI 순서 = 계산 로직 순서(총액→토지→건물)를 위해 **N은 토지 단가 바로 아래**(§2.2)에 둔다 — `stdCardBase` 확장 안 함(그 확장은 별개 전용 단언 다수를 건드린다, §2.5). (iv) 엔진 §8-1 「a1(취득일 다름 + 비-별개)은 UI에서 만들 수 없다」는 부정확 — 「취득일 다름」ON + 같은 날짜는 **만들 수 있으나** 토지 단가 입력칸이 없어 분할이 실질 불가(§1.2 c, 화면 실측). (v) 엔진 §8-7: `standardPriceAtTransfer`(H_T)는 `useEstimatedAcquisition`일 때만 전송 — 이는 E-1 ⓑ를 택할 때 UI 노출뿐 아니라 ④ 게이트도 열어야 함을 뜻한다 |

### 사용자 결정·확인 필요 (Q-U)

| # | 질문 | 제안 |
|---|---|---|
| **Q-U1** | N 입력 = 모달 + **직접 입력 허용** (§2.4) | 허용(양도시 칸과 같은 형태). 이견 없으면 확정 |
| **Q-U2** | (c)(취득일 다름만 + 같은 날)에서 N·L을 열지 | **열지 않음**(S3-1 범위 밖). (c)는 현재도 분할이 실질 불가이고 파트 안내가 없는 카드를 가리키는 결함(§1.4-1)이 있다 — 별건 후보. 열려면 L 입력칸·⑧·안내 문구를 함께 설계해야 해 규모가 다르다 |
| Q-U3 | 1985.1.1 이전 의제취득(상속 pre-deemed)·취득일 ≤2000의 N 산정 | 모달의 ≤2000 트랙(`pickAcqLocationIndexLandPrice`)이 준비돼 있으나 **의제취득일 기준 N**을 같은 모달이 내는지 확인 필요. 직접 입력으로 우회 가능 |
| Q-U4 | 이월과세·합산(저장값 `determinedTax`) 경로 고지 | 감사 §5.5 — 구 엔진 값과 재계산이 어긋날 수 있음. 해당 UI에 고지가 있는지 확인 필요 |
| Q-U5 | 공동주택(아파트) 취득시 N의 국세청 산정(집합건물 전유부분) | 앱의 `ApartmentConversionSection`(2001 건물기준시가 × 산정기준율)이 있으나 모달 단독으로 취득시 아파트 N을 내는지 **확인 필요**. 직접 입력 허용이 우회로 |

### 이 설계가 확인하지 못한 것

- 모달(`BuildingStdPriceModalButton`)을 비-별개 경로(다른 `snapshotKey`·토지 prefill 소스)에서 실제로 열어 값 적용까지 해 본 **화면 실측은 하지 않았다**(이 설계는 입구 가시성·testid·field 앵커 실측까지). Do 단계 E6에서 확인.
- 공시 전 취득·PHD 혼합(한쪽만 환산) 상태에서 leaf 6항·`isPhdBothEstimated` 일치 여부는 코드 대조만(실행 안 함).
- `CompanionAcqPurchaseBlock`이 이미 계산한 `acqStdPriceRequired`와 asset 기반 leaf 7항이 모든 격자에서 같은 값을 내는지는 §7.3 #U-1이 증명할 일이다(미실행).

## §10 Do 환류 (2026-10-06)

구현 결과는 계획서 §9 참조. UI 설계와 달라진 지점: (1) 노출 leaf `ownerSplitHousingNeedsBuildingStd`가 PHD **켜짐 전체**를 제외(§2.3 6항 「양쪽 환산」보다 넓다 — ④가 PHD에서 총액을 안 보냄) (2) D-1 ⓑ로 §2.9가 §2로 승격 — 축 A 카드에 양도시 개별주택가격 칸(`TransferHousingTotalField`, testid `split-housing-std-transfer-card`, `data-field=standardPriceAtTransfer`), 매매 + 자산 환산 토글 ON이면 취득 블록의 기존 칸이 정본이라 중복 노출하지 않음 (3) 별개 취득 `PartAcqStdPrice`의 non-both 분기는 `AcqBuildingStdField variant="separate"`로 위임(DOM의 의미 없는 빈 wrapper `<div>` 1개 제거, testid·입력 testid 불변) (4) 결과 카드 echo는 `stdSplit {housingTotal, landStd, buildingStd, landBasis, buildingBasis}`(요청안의 3값보다 풍부 — 한국어 산식이 가목·나목 원값을 그대로 표시) (5) E2E는 `e2e/transfer-housing-acq-building-std-nonseparate.spec.ts` 13건(E1~E9·E-4).

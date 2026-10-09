# 토지·건물 취득원인 혼합 — Phase D1-4 「1990.8.30. 전 상속·증여 토지 파트: max(평가액, 영 §164④ 가액)」 · UI·클라이언트 설계

- 계획서: `docs/00-pm/transfer-acq-cause-mixed.plan.md` §6 Q-7 · §10.1 U-1(후속 D1-4) · §10.2 T-5·T-6·T-8 · §10.3 · D1-1~D1-3 구현 기록
- 선행 UI 설계: `docs/02-design/features/transfer-acq-cause-mixed-d1.ui.design.md` (D1) — **이 문서는 그 위에 얹는다**
- 짝(엔진): `docs/02-design/features/transfer-acq-cause-mixed-d1-4.engine.design.md` — transfer-tax-senior가 같은 시각에 작성 중이라 **이 문서는 읽지 않았다**. 엔진 시니어의 Pre-Do anchor(`__tests__/api/transfer.route.split-land-part-cause.d1-4.predo.anchor.test.ts`)에서 `landSec164Value`·`acquisitionBasis{reported,sec164,adopted}` 이름만 확인했다. 어긋나는 항목은 §9 「엔진 설계와 맞출 지점」에 모았다.
- Pre-Do 테스트: `__tests__/calc/transfer-land-part-cause.d1-4.predo.test.ts` — 활성 **23 passed** · todo **14** (§10)
- 상태: **UI Design — 제품 코드 수정 0.** 워크트리 `Property-related-Taxes-d14` · 브랜치 `feat/transfer-acq-cause-mixed-d1-4` · base master `a50ad594c`
- 표기: 「코드 확인」 = 읽기만 · 「실측」 = 이 워크트리에서 vitest 실행값 · 「확인 필요」 = 미검증. 화면은 **Playwright를 띄우지 않았다**(코드 추적 + 클라이언트 probe) — §11.

---

## 0. 결론 표

| # | 결정 | 근거(절) | 권장 |
|---|---|---|---|
| 1 | **위젯**: 토지 취득일 < 1990-08-30 이면 **평가액 칸 바로 아래**에 §164④ 비교 카드를 연다. 신축 호스트 = `LandPartCauseBlock`의 평가액·취득일 그리드 아래, 매매 호스트 = `LandBuildingSplitSection` ① 토지 파트의 `PartAcqInputs` 아래. 카드 본체는 호스트 공용 신규 `LandSec164Card`(~110줄) 1개. 안의 입력은 **기존 `Pre1990LandValuationInput`을 `alwaysOpen`으로 재사용**(수정 0) | §2 | 신규 카드 1 + 재사용 |
| 2 | **필드**: **신규 `AssetForm` 키 0.** 등급 3·1990 공시지가·등급 모드·`acquisitionArea`를 재사용해도 안전하다 — 이 상태(주택·건물 + 신축/매매 호스트 + 토지 원인 유효)에서 그 값을 읽는 다른 경로는 없고(§3 실측), 환산 래치 `pre1990Enabled`는 **읽지도 쓰지도 않는다** | §3 | 키 0, ①②③ 무변경 |
| 3 | **게이트 신설 1개**: `landSec164Applies(asset)` = 유효 토지 원인 ∧ 토지 취득일 < 1990-08-30. 일반건물 `isGbLandPre1990Sec163_9`·토지 `hasPre1990LandEstimation`·주택 `sec164HouseStatus`는 모두 이 상태에서 **거짓/null**이라 재사용 불가(§3.2 실측) | §3·§5 | 신규 leaf |
| 4 | **⑧**: 기존 「1990 전 = 무조건 차단」을 **「§164④ 입력 완결 요구」**로 바꾼다. 칸별 앵커(면적 → 현재등급 → 직전등급 → 취득시등급 → 1990 공시지가 → 계산 불가)로 이동. 비교는 **법이 정한 계산이라 opt-in이 아니라 필수**(일부 입력 = 차단) | §6 | 필수 |
| 5 | **엔진 안별 UI 차이는 ④·⑦뿐**(⑤⑥⑧ 동일): V1 `landSec164Value`(②총액을 ④가 곱해 보냄) / V2 `landSec164PricePerSqm`(㎡당만 보냄, 엔진이 면적을 곱함) / V3 등급 payload. **UI 권장 = V2** — ② 곱셈이 엔진 1곳, 결과에 「㎡당 × 면적」이 echo로 남아 검증 가능 | §4 | V2 |
| 6 | **④-max(일반건물식, 엔진이 모르고 ④가 max)는 비권장**: 결과가 채택 근거를 모르므로 D1-3 파트 태그 「토지(상속개시일 평가액)」가 **§164④ 가액에 거짓 라벨**이 되고, ⑫가 비교 수행 여부를 검증할 수 없다 | §4 | 기각 |
| 7 | **⑥ 사이드바**: 1990 전 토지 원인이면 `separateAcqPartsSum`이 `pending: true` — 비교 결과가 나오기 전엔 **평가액만의 부분합을 총액으로 오독**시키지 않는다 | §7 | pending |
| 8 | **⑦ 결과**: 엔진 echo(`acquisitionBasis`)를 `summarizeSplitGain` 한 곳이 받아 4뷰(카드·상세명세서·신고서·PDF)가 같은 「평가액 vs §164④ → 채택」을 보인다. 구 이력·비교 미적용은 종전 화면 | §8 | echo 기반 |
| 9 | **PR 순서**: D1-4a(엔진 — ⑫가 ② 수용·echo, ⑧은 그대로 막아 화면 변화 0) → D1-4b(UI — ⑤⑥⑧④⑦). 엔진이 먼저여야 ⑧ 완화와 ⑫ 완화가 같은 PR에서 짝을 이룬다 | §9 | 2 PR |

---

## 1. 현행 (코드 확인 · 실측)

| 층 | 위치 | 현행 |
|---|---|---|
| 엔진 leaf | `lib/tax-engine/transfer-split-part-cause.ts:123-124` | `mixed ∧ 토지 취득일 < SEC_163_9_LAND_FIRST_DISCLOSURE(:62)` → `LAND_CAUSE_PRE_1990_MESSAGE`(:87, 「…이 비교는 지원하지 않습니다」). 당일(1990-08-30)은 통과 |
| ⑧ | `lib/calc/transfer-tax-validate-split.ts:117-155` `validateLandPartCause` | 같은 leaf에 ④가 보내는 값을 공급. 첫 issue를 `fieldError(issue.field, …)`로 칸에 붙인다 |
| ⑤ 안내 | `lib/calc/transfer-land-part-cause.ts:73-80` `landPartCauseDateNotice` | 같은 날(Q-4) → 1990 전(Q-7) 순으로 amber caption. 호출부: `LandPartCauseBlock.tsx:200`(신축) · `CompanionAcqDateSection.tsx:216-218`(매매) |
| ⑥ | `lib/calc/transfer-tax-split-acq-mode.ts:226-` `separateAcqPartsSum` | 평가액 + 건물가 합 — 1990 전이어도 확정값. 소비: `calc-wizard-store.ts:371` · `transfer-per-asset-direct.ts:122·138` |
| ④ | `lib/calc/transfer-tax-api-split.ts:261` `buildLandPartCausePayload` | 원인(+상속이면 피상속인 취득일)만 싣는다. 호출 3곳: 단건 `transfer-tax-api.ts:499` · 다건 `multi-transfer-tax-api.ts:292` · 컴패니언 `transfer-tax-api-companion-payload.ts:205`(`splitActive ?`) |
| 선례(일반건물) | `GeneralBuildingAcquisitionCards.tsx:468-499`, `transfer-pre1990-gb-bridge.ts`, `transfer-tax-api-gb.ts:293-312`(④가 max 후 한 값만 전송), `transfer-tax-validate-gb.ts:236-247` | 게이트·파생·effective 3중 패턴. 단 **GB는 래치 `pre1990Enabled`를 요구**(`bridge:71`)하고 `alwaysOpen` 없이 토글 안에 칸을 둔다 |
| 면적 | `AssetAreaSection.tsx:380·405` `data-field="acquisitionArea"` | 주택·건물의 「토지 면적」. 시나리오 `same`/`partial`(`:84-92`) |
| 이미 있는 재료 | `Pre1990LandValuationInput.tsx:53·296` | `alwaysOpen` prop — 토글 없이 칸을 연다(상속·증여 §163⑨1호 비교 맥락 전용, `transfer-163-9-base-date.ts:sec164LandFieldsAlwaysOpen`). `onCalculatedPrice`를 안 주면 store 쓰기 effect가 돌지 않는다 |

**핵심 사실**: 사용자가 §164④ 5칸을 다 채워도 지금은 풀리지 않는다 — Pre-Do A1(신축·매매 × 상속, 입력 완비/미비 모두 ⑧ 차단·칸 `landAcquisitionDate`) · A2(증여 1988-12-31) · A4(⑫ 400) 실측.

---

## 2. ⑤ 위젯 배치 (계산 로직 순서 = UI 순서)

### 2.1 순서

```
취득 원인 → [소유자 다름] → [토지는 다른 원인으로 취득 ▣]   ← 원인(상속|증여) · 피상속인 취득일
  토지 {상속개시일|증여일} ____                           ← 1990-08-30 전이면 아래 카드가 열린다
  ① 토지 {상속개시일 평가액|증여 신고가액} ____             ← 기존 칸 (신축: 블록 그리드 / 매매: 취득가액 산정 방식 ① 토지)
  ┌ ② 영 §164④ 가액 (1990.8.30. 이전 취득 토지) ───────────  ★ 신규 카드
  │  안내: ①과 ② 중 많은 금액이 토지 취득가액 (소득세법 시행령 §163⑨ 단서 1호)
  │  [Pre1990LandValuationInput alwaysOpen]  1990.8.30. 개별공시지가 · 등급(현재/직전/취득시)
  │  읽기 전용: ㎡당 가액 ____ × 토지 면적 ____㎡ = 영 §164④ 가액 ____   (계산 가능할 때만)
  └──
  (건물 파트 · 자본적지출 · 양도가액 구분 ... 기존)
```

① 평가액이 ② 카드 **위**에 오는 이유: 비교의 좌항이 ①, 우항이 ②이고(법문 「평가액과 …의 가액 중 많은 금액」), 사용자는 신고서에서 ①을 이미 갖고 온다.

### 2.2 호스트별 배치

| | 신축 호스트 | 매매 호스트 (D1-2 X안) |
|---|---|---|
| 카드 위치 | `LandPartCauseBlock.tsx` 그리드(날짜·평가액·피상속인, `:221-245`) 아래, 기존 `dateNotice` 위 | `LandBuildingSplitSection.tsx` ① 토지 파트 `PartAcqInputs`(`:383`) 바로 아래 — 이 컴포넌트가 이미 `asset`·`onAssetChange`·`transferDate`·`landCause`를 받는다(`:47`) |
| 면적 | 기본 정보의 「토지 면적」(`acquisitionArea`) 읽기 전용 표시 + 「토지 면적은 기본 정보에서 입력합니다」 | 동일 |
| 기존 1990 안내 | `landPartCauseDateNotice`의 Q-7 분기 **삭제**(차단 문구 → 카드 도입 문구로 대체). Q-4 분기는 유지 | 동일 (`CompanionAcqDateSection.tsx:216`은 Q-4만 낸다) |

### 2.3 `Pre1990LandValuationInput` 재사용 가능성 (코드 확인)

- 재사용 **가능**: `form`은 `Pre1990FormSlice`(7키, `AssetForm`이 구조적으로 만족) · `acquisitionArea`·`jibun`·`acquisitionDate`(= `landAcquisitionDate`)·`transferDate`를 prop으로 받는다. 1985.1.1. 전이면 라벨이 「의제취득일(1985.1.1.)」로 바뀌고(`:271`·`:280`) 등급 안내가 붙는다 — T-6으로 원 날짜를 보존하므로 그대로 맞다.
- 쓰는 모양: `<Pre1990LandValuationInput form={asset} onChange={onChange} acquisitionArea={asset.acquisitionArea} jibun={asset.addressJibun || undefined} acquisitionDate={asset.landAcquisitionDate} transferDate={transferDate} alwaysOpen />` — **`onCalculatedPrice`를 주지 않는다**(주면 파생값을 store에 쓰는 effect가 켜진다 = 미러링 금지 위반).
- `alwaysOpen`인 이유: ①과 ②의 비교는 법이 정한 계산이라 켜고 끄는 선택이 아니다(`:294-295` 주석, 별건 B3 — 칸을 토글 뒤에 숨기면 안 보이는 값이 취득가액을 바꾼다). GB가 토글 안에 둔 것은 이 규약 이전의 모양이며 D1-4는 따르지 않는다.
- 래치 `pre1990Enabled`: `alwaysOpen` 맥락은 토글이 없으므로 **게이트·파생·⑧ 어디서도 읽지 않는다**(Pre-Do C3: GB 파생은 래치가 꺼지면 null).

### 2.4 신규 컴포넌트 `LandSec164Card` (~110줄)

`components/calc/transfer/LandSec164Card.tsx`. props `{ asset, onChange, transferDate }`. 내용 = 도입 문단 + `Pre1990LandValuationInput`(alwaysOpen) + 읽기 전용 파생 줄. 파생 줄은 `landSec164Value`가 계산 가능할 때만(⑧과 같은 leaf), 아니면 `sec164LandPartStatus`의 `missing` 목록을 「입력할 칸: …」으로 보인다(⑧ 메시지와 같은 소스 → 칸 없는 차단 방지).

- 입력 쪽 미리보기는 **㎡당 가액·면적·②총액까지만** 보이고 **채택값(max)은 입력 화면에 보이지 않는다** — 채택은 엔진 몫이고 결과 화면이 echo로 보인다(memory `feedback_aggregate_display_rederives_engine_value`). 입력 미리보기 ↔ 엔진 echo 일치는 anchor D14가 잠근다.
- tone `amber`(= 취득·분리계산), 카드 안 문구는 한국어 풀어쓰기·변수 약어 없음·placeholder 숫자 예시 없음. testid: `land-sec164-card` · `land-sec164-derived`.
- 도입 문구(초안): 「토지를 {상속개시일|증여일}에 {상속|증여}받았는데 그때는 개별공시지가가 고시되기 전(1990.8.30. 이전)이라 토지등급으로 환산한 영 §164④ 가액을 구합니다. 이 가액과 {valueLabel} 중 **많은 금액**이 토지 취득가액입니다 (소득세법 시행령 §163조 제9항 단서 1호).」

### 2.5 ToggleCard/RadioCardGroup 규약

신규 토글·라디오 **0**(카드는 상시 노출). 기존 등급 모드 라디오(`pre1990GradeMode`)는 재사용 컴포넌트 내부의 `RadioCardGroup`. native checkbox/radio/date 신규 0. 포커스 전체 선택은 `SelectOnFocusProvider`가 자동.

---

## 3. 필드 충돌 — 같은 키를 재사용해도 안전한가 (실측)

### 3.1 재사용 대상

`pre1990Grade_current` · `pre1990Grade_prev` · `pre1990Grade_atAcq` · `pre1990PricePerSqm_1990` · `pre1990GradeMode` · `acquisitionArea` (+ 기존 `landAcquisitionPrice`가 ①). `pre1990Enabled`(래치)·`pre1990PricePerSqm_atTransfer`는 **쓰지 않는다**.

### 3.2 읽는 쪽 전수 (이 상태 = 주택·건물 + 신축/매매 호스트 + 유효 토지 원인)

| 읽는 쪽 | 게이트 | 이 상태 | 근거 |
|---|---|---|---|
| 토지 §164④ 환산(`buildPre1990LandPayload` · `hasPre1990LandEstimation`) | `assetKind === "land"` + 래치 | **거짓** | `transfer-pre1990-land-gate.ts:57-62` · Pre-Do B2 |
| 주택 §163⑨2호 §164⑤~⑦(`buildInheritedHouseValuationPayload` · `sec164HouseStatus`) | **건물** 취득원인 ∈ {상속, 증여} | **null** (호스트가 신축/매매) | `sec164-required-fields.ts:111-117` · B2 · B1′ 긍정 짝(건물 상속이면 non-null) |
| 일반건물 브리지(`isGbLandPre1990Sec163_9`) | `general_building` | 거짓 | `bridge:50-56` · B2 |
| PHD 평문 주택 브리지(`derivePre1990PlainHousePhd…`) | PHD 유효 ∧ 래치 | **PHD 무시**(D1-2 T-3 `phdFlagEffective`) | `phd-toggle-scope.ts` · B3 |
| 증여 §164 섹션 `GiftLandStdPriceSection`(증여 ∧ `land`) · `GiftHouseStdPriceSection`(증여 ∧ 주택) — `CompanionAcquisitionCauseSection.tsx:302·306`에서 **무조건 마운트**되지만 자체 게이트로 null | 자산 **취득원인** = 증여 | **null** (호스트 취득원인이 신축/매매) | 코드 확인(`GiftLandStdPriceSection.tsx:43-49` · `GiftHouseStdPriceSection.tsx:41-47`) |
| 상속 블록(`InheritedAcquisitionDeemedSection` → `PreDeemedInputs` · `PostDeemedInputs` · `HouseValuationSection`) · 겸용 PHD(`MixedUsePreHousingDisclosureSection`) | 자산 취득원인 = 상속 / 겸용 | 마운트 안 됨 (호스트 신축/매매, 겸용 제외) | 코드 확인(`CompanionAcqInheritanceBlock.tsx:210` 상속 블록 안) |

실측: §164④ 5칸·면적·래치·PHD 플래그·취득시 기준시가를 **전부 켠** 신축/매매 자산도 ④ body에 `pre1990Land`·`inheritedHouseValuation`·`preHousingDisclosure`가 없고(Pre-Do B1), 토글 OFF 후엔 원인도 안 실린다(B4). 긍정 짝(B1′)으로 키 이름이 공허하지 않음을 확인했다 — 토지 원인이 없으면 PHD가, 토지 자산이면 `pre1990Land`가 실제로 실린다. mutation: `phdFlagEffective`가 토지 원인을 무시하게 바꾸면 B1·B3가 **4건 KILLED**(되돌림 확인).

### 3.3 의미 일치

PHD 브리지·상가 브리지·GB 브리지가 읽는 5칸은 모두 **「이 토지의 1990.8.30. 등급·공시지가·취득시 등급」**이다 — 취득 원인이 아니라 **토지**의 속성이고, 같은 호스트 안에서 한 자산은 토지가 하나다. 그래서 키를 나눌 이유가 없다. 호스트/원인 전환 때의 stale은 D0 G-6 방식(**읽는 쪽 파생**): 값은 남고 `landSec164Applies`가 「없음」으로 읽는다.

### 3.4 남는 잔여 위험 (수용 · 안내)

1. **자산 종류 전환 잔재**: 토지(매매 환산)로 채운 5칸이 `assetKind`를 주택으로 바꾼 뒤에도 남는다 — D1-4 카드가 그 값을 **보이는 칸에 채운 채** 연다(비가시 stale 아님). 다른 물건의 값이면 사용자가 칸에서 고친다. 기존 전 자산 공통 현상이며 D1-4가 새로 만들지 않는다.
2. **토지 취득일을 바꾼 뒤 남은 「취득시 등급」**: 등급이 그 날짜 기준이라 날짜를 바꾸면 사용자가 다시 확인해야 한다 — 기존 3개 브리지 공통. 카드 안내에 「취득일을 바꾸면 취득시 등급을 다시 확인하세요」 1줄.
3. **PHD 자동 ON 플래그 ↔ 래치**: PHD가 유효로 돌아오면(토지 원인 OFF) PHD 브리지는 자기 래치를 요구하므로 D1-4 입력이 PHD 계산에 **자동 합류하지 않는다**(칸은 PHD 카드에도 보이고 값은 같은 토지의 것이라 모순 없음). 막다른 길 아님.

---

## 4. 엔진 안별 UI 차이 (엔진 설계 미정 — 두 경우를 모두 적는다)

엔진 시니어 anchor가 시사하는 방향 = **엔진이 max를 하고 echo를 남긴다**(`landSec164Value`·`acquisitionBasis{reported,sec164,adopted}`). 이를 V1로 두고 UI가 선호하는 V2·대안 V3·비권장 A와 비교한다.

| | **A. ④-max** (GB식) | **V1 `landSec164Value`** | **V2 `landSec164PricePerSqm`** (UI 권장) | **V3 등급 payload** |
|---|---|---|---|---|
| ④가 보내는 것 | max된 `landAcquisitionPrice` 1개 | ② **총액** (클라이언트가 ㎡당 × 면적) | ② **㎡당 가액** (면적은 이미 가는 `acquisitionArea`) | 등급 3·1990가·모드·면적 |
| ② 곱셈 위치 | ④ | ④ (엔진과 곱셈 규약이 갈릴 위험) | **엔진 1곳** | 엔진(하위 엔진) |
| ⑫가 비교를 강제 | 불가(마커뿐) | ② 필수 → 400 | ② 필수 → 400 | 5필드 필수 → 400 |
| 결과 echo | **없음** → 파트 태그 거짓 라벨 | `{reported, sec164, adopted}` | `{reported, pricePerSqm, areaSqm, sec164, adopted}` | `Pre1990LandValuationResult` 전체 → 기존 `Pre1990LandValuationDetailCard` 재사용 |
| ⑥ | 확정 가능 | pending | pending | pending |
| ⑦ 검증 가능성 | 낮음 | 중(㎡당·면적 안 보임) | **높음**(㎡당 × 면적 = ②) | 가장 높음(등급 분모·비율까지) |
| ⑫ Zod 표면 | 0 | 키 1 × (주 자산·컴패니언·다건) | 키 1 × 3 | 키 6+ × 3 |
| ④ 변경 | `buildLandPartCausePayload`에 max | 〃 + 곱셈 | 〃 + 파생만 | 〃 + payload |

**UI 관점 차이를 한 줄로**: ⑤⑥⑧은 모든 안에서 같다(입력 5칸 + 면적 완결을 요구하고 pending). 갈리는 것은 **④가 무엇을 싣느냐**와 **⑦이 무엇을 보일 수 있느냐**뿐이다.

- **A를 기각하는 이유**: ① D1-3 `partTag`(`split-acq-text.ts:40-42`)는 mixedCause이면 항상 `토지(상속개시일 평가액)`를 붙인다 — A에서 채택값이 ②이면 이 라벨이 **거짓**이다(echo가 채택 근거를 모름). ② ⑫가 「비교를 했는가」를 검증하지 못해 Q-7 3중 가드가 사실상 해제된다. ③ GB가 이미 이 한계를 안고 있다(결과에 채택 근거 표시 없음 — 코드 확인: GB 결과 경로에 비교 echo 없음).
- **V2를 UI가 선호하는 이유**: 곱셈이 엔진 1곳(`multiplyByArea`, 단가×면적 float 과소 함정 — memory `feedback_unit_price_area_float_undercount`)이고, 결과가 「㎡당 × 면적」을 echo로 갖는다. V3의 등급 payload는 ⑫ 표면이 커서 이득 대비 비싸다(분모·비율 breakdown은 후속).
- V1이라면: ④는 `calculatePre1990LandValuation().standardPriceAtAcquisition`(하위 엔진 총액, `safeMultiply`+floor)을 **그대로** 보내야 한다 — 클라이언트에서 `a*b`를 다시 쓰지 않는다. 엔진이 다른 곱셈 규약(`multiplyByArea`)을 쓰면 1원 차이가 나므로 §9에서 맞춘다.

---

## 5. 14 동기화 지점

| 지점 | D1-4 영향 | 내용 |
|---|---|---|
| ① 폼 상태 | **없음** | 신규 키 0 (Pre-Do B6: 7키·`acquisitionArea` 이미 존재) |
| ② initial | **없음** | `pre1990*` 기본값 이미 있음 |
| ③ normalize | **없음** | 키 부재 구 세션 문제 없음(기존 키). 토글·호스트 태그는 D1-2 그대로 |
| ④ API 변환 | **있음** | `buildLandPartCausePayload`(3경로 공용 1곳)가 `landSec164Applies ∧ 완결`일 때만 ②를 싣는다(V1/V2/V3 선택은 엔진 확정 후). 파생 함수가 양도일을 요구하므로(`calculatePre1990LandValuation`이 날짜 유효성만 검사하고 ㎡당 가액은 `Math.floor(1990가 × 비율)`로 양도일과 무관) 시그니처에 `transferDate`를 더해 3 호출부(`transfer-tax-api.ts:499` · `multi-transfer-tax-api.ts:292` · `…companion-payload.ts:205`)가 같은 인자를 넘긴다 |
| ⑤ UI | **있음** | §2 + `AssetAreaSection`의 면적 방식 Select에 `data-field="areaScenario"` 1속성(§6 M3 앵커) |
| ⑥ 사이드바 | **있음** | `separateAcqPartsSum`에 `landSec164Applies` 시 `pending: true`(§7). `SeparatePartAmounts`에 `landAcquisitionDate`·`landCauseHost` 전달(호출부는 자산 전체를 넘긴다) |
| ⑦ 결과 | **있음** | §8 (엔진 echo 필요 — 엔진 PR 선행) |
| ⑧ validation | **있음** | §6 — `validateLandPartCause` 안에서 엔진 leaf 호출 **앞**에 상세 완결 검사. 신축 분기·매매 분기 모두 `validateLandPartCause`를 이미 경유(`validate-acquisition.ts:372·378`) → 호출 위치 변경 0 |
| ⑨ Zod enum 메인 | 엔진 설계 | 신규 enum 없음(숫자 1개) |
| ⑩ Zod enum 컴패니언 + refine | 엔진 설계 | `refineSplitPartCause`(`required-refines-2a.ts:358`)가 주 자산·컴패니언에 같은 사실 공급 |
| ⑪ 자산-수준 `acquisitionDate` fallback | 무영향 | 날짜 키 신규 0 |
| ⑫ Zod 입력 객체 | 엔진 설계 | `transfer-tax-schema-base-shape.ts:280`·`-split.ts:32` 옆에 신규 키(주 자산 + 컴패니언) |
| ⑬ body spread | UI | `callTransferTaxAPI`는 `…buildLandPartCausePayload(primary)`(`transfer-tax-api.ts:499`) 한 줄이라 ④ 변경이 자동 반영. 다건 `buildPropertyPayload`·컴패니언 `buildAssetPayload`도 같은 leaf. **Pre-Do B5**가 3경로 동일 키를 잠근다 |
| ⑭ Route 매핑 | 엔진 설계 | 신규 키가 `engine-input.ts:331` · `bundled-split-helpers.ts:389` · `multi/route.ts:199`(세 곳 모두 `landDecedentAcquisitionDate`가 있는 지점) 3곳에 모두 있어야 한다 — **한 곳이라도 빠지면 침묵 strip** |
| (보조) ⑫ 오류 라벨 맵 | UI | `transfer-tax-error-format.ts:45-47` 근처에 신규 키 라벨(「토지 영 §164④ 가액」). 빠지면 ⑫ 400이 영문 키로 표시 |

3중 패턴(mirror-pattern): 게이트(`landSec164Applies`) · 완결(`sec164LandPartStatus`) · 파생(②)을 **leaf 1개**(`lib/calc/transfer-pre1990-housing-land-bridge.ts` — D1-4a가 게이트 `landSec164Applies`·파생 `deriveHousingLandSec164PerSqm/Total`·`isPartialAreaScenario`를 구현했다. 완결 상태 `sec164LandPartStatus`는 D1-4b가 같은 파일에 추가 — GB 브리지와 같은 3단 구조 + 상태)에 두고 ⑤(카드 표시·안내)·④(전송)·⑧(검증)·⑥(pending)이 같은 함수를 읽는다. `useEffect → store` 미러링 **0**.

---

## 6. ⑧ 규칙 — 입력 미완 시 칸·메시지, 「⑧ 통과 ↔ ⑫ 400」 방지

### 6.1 게이트와 순서

`landSec164Applies(asset)` = `effectiveLandAcquisitionCause(asset)` ∧ `landAcquisitionDate < "1990-08-30"`(상수는 엔진 leaf `SEC_163_9_LAND_FIRST_DISCLOSURE` — T-5). 1985 하한은 **두지 않는다**(일반건물이 2026-08-07 제거한 근거 — 「§163⑨에 의제취득일 조건 없음」, `transfer-tax-api-gb.ts` 주석. 이 문서에서 법문 재조회는 하지 않았다 → §11).

순서(UI 순서 = 계산 순서): 구조 규칙(R-X1~X5) → G-12 토지일 → G-1 → **D1-4 입력 완결(아래)** → G-2 → G-3. 완결 검사는 엔진 leaf 호출 **앞**에서 하고, 통과한 뒤에야 leaf를 부른다(leaf의 신규 R-Q7′ 발동 사실 = 「②를 보낸다」가 이 시점 참이라 ⑧ 통과 ⇒ ⑫ 통과).

### 6.2 메시지·이동 칸 (`${label}:` 접두 규약)

| # | 조건 | 메시지(초안) | field(`IssueField`) |
|---|---|---|---|
| M0 | `areaScenario === "partial"` | 「토지 일부만 양도하는 경우(면적 입력 방식 『일부 양도』)는 1990.8.30. 이전 상속·증여 토지의 영 §164④ 비교를 지원하지 않습니다 — 면적 입력 방식을 확인하세요」 | `areaScenario` (앵커 신설) |
| M1 | `acquisitionArea` 비어 있음/0 | 「토지 면적을 입력하세요 — 1990.8.30. 이전 상속·증여 토지는 영 §164④ 가액(㎡당 가액 × 토지 면적)과 평가액 중 많은 금액이 취득가액입니다 (소득세법 시행령 §163조 제9항 단서 1호)」 | `acquisitionArea` (기존 앵커 `AssetAreaSection:380`) |
| M2 | 현재등급·직전등급·취득시등급·1990 공시지가 중 첫 미입력(`sec164LandPartStatus.missingFields[0]`) | 「{missing[0]}을 입력하세요 — …(M1과 같은 꼬리)」 | `pre1990Grade_current` → `pre1990Grade_prev` → `pre1990Grade_atAcq` → `pre1990PricePerSqm_1990` (기존 `GradeField data-field`) |
| M3 | 5칸·면적 모두 있으나 파생 불가(등급 범위 밖 등, `Pre1990LandValuationInput`의 「등급 범위 밖이거나 올바르지 않은 값」과 같은 판정) | 「토지등급으로 영 §164④ 가액을 계산할 수 없습니다 — 등급번호(1~365) 또는 등급가액을 확인하세요」 | 첫 불량 등급 칸 |

M1~M3은 평가액 비움(`landAcquisitionPrice` → 기존 V1 `validateSeparateAcqParts`)보다 **뒤**, 즉 ①을 먼저 요구하고 ②를 요구한다(좌항 → 우항).

- **opt-in이 아니라 필수 (형제 선례가 갈린다 — Q-D14-UI7)**: 토지·주택 자산 단위의 증여 섹션은 opt-in이다(`GiftLandStdPriceSection.tsx:63-66` 「전부 비워두면 증여 신고가액만 사용하고, 일부만 입력하면 오류」, `isPartiallyFilled` `sec164-required-fields.ts:209`). 반면 일반건물은 **필수**다(`validate-gb.ts:236-247` V-6 — 비교값이 없으면 차단, 실측 86,265,000원 과대과세 근거). D1-4는 **필수**를 권장한다: ① 현행 Q-7이 1990 전을 전부 막고 있어 필수로 가면 기존 사용자가 새로 막히지 않고(opt-in은 비어 있어도 통과하는 새 경로를 연다), ② 「모름 = 혜택 불성립 + 확인 필요」 정책(memory `feedback_unknown_fact_applies_unfavorably`) — ②를 비운 채 ①만 쓰면 ①이 더 작을 때 법이 정한 max를 건너뛰는 유리한 적용이 된다.
- 상태 leaf: `sec164LandStatus`는 `assetKind === "land"` 전용이라 **같은 5필드 명세를 재사용하는 `sec164LandPartStatus(asset)`을 `sec164-required-fields.ts`에 추가**(216줄 → ~235줄). `tally`·`amountField`를 export하지 않고 같은 파일 안에 둔다.

### 6.3 ⑧↔⑫ 격자 (Do 단계 anchor로 전수 실행)

축: 호스트{신축, 매매} × 원인{상속, 증여} × 토지일{1990-08-29, 1990-08-30, 1991} × 입력{완결, 면적 비움, 등급 1칸 비움, 1990가 비움, 불량 등급, 일부양도} × ④ 전송 여부.

| 셀 | ⑧ | ④ | ⑫ (엔진 안 B 기준) | 판정 |
|---|---|---|---|---|
| 1990 전 · 완결 | 통과 | ② 전송 | 200 | 정상 |
| 1990 전 · 미완결(M1~M3) | 차단(칸) | 전송 안 함 | (화면은 도달 불가) API 직접: 400 | 짝 |
| 1990 전 · 일부양도 | 차단(M0) | — | API 직접: 200일 수 있음 | **⑧만 더 엄격**(T-4 선례 — 막다른 길 아님: 칸으로 이동해 해소 가능) |
| 1990-08-30 당일 · 1991 | 통과 | ② **전송 안 함**(stale 5칸 누수 0) | 200 | 정상 |
| 토글 OFF/호스트 이탈 · 1990 전 | 해당 없음 | ② 전송 안 함 | 해당 없음 | 정상 |

**V2/V1의 ④ 전송 조건 = ⑧ 통과 조건**을 같은 leaf(`landSec164Status` 완결 ∧ 파생 성공)로 맞춘다. ④가 파생 실패(null)를 0으로 보내면 ⑫ 400이므로 **보내지 않고**, 그 상태는 ⑧이 이미 막았다.

### 6.4 3중 패턴 점검 (memory `feedback_validation_sync_8th_point`)

표시 fallback이 있는 필드는 **없다**(파생 ②는 읽기 전용 표시이고 store에 쓰지 않는다. 직접 입력 override 칸도 두지 않는다 — 1990.8.30. 전에는 개별공시지가가 고시된 적이 없어 직접 입력할 값이 없다, `sec164-required-fields.ts:133-150` 주석). ⑤ 표시 ↔ ④ 전송 ↔ ⑧ 검증이 `landSec164Applies`·`landSec164Value` 같은 leaf를 읽는다.

---

## 7. ⑥ 사이드바

`separateAcqPartsSum(asset)`: `landSec164Applies(asset)`이면 토지 파트를 `pending = true`로 둔다(환산 파트와 같은 처리, `transfer-tax-split-acq-mode.ts:248`). 이유: ①만 합산하면 ②가 더 클 때 **작은 값을 총액으로 오독**시킨다(`feedback_engine_result_display_drift`). 소비처 3곳(`calc-wizard-store.ts:371` · `transfer-per-asset-direct.ts:122·138`)이 모두 `pending ? 0 : sum`으로 숨긴다 → 사이드바는 결과 도착 후에야 취득가액을 보인다(환산 모드와 같은 규칙). `SeparatePartAmounts`에 `landAcquisitionDate?: string` 추가, 호출부 변경 0(자산 전체 전달).

대안(클라이언트가 max를 계산해 즉시 표시)은 기각: 엔진 echo와 이중 진실이 된다(§4 A와 같은 문제). Pre-Do A6가 현행 확정값(650,000,000 / 700,000,000)을 잠그고 D9가 pending 전환 todo.

---

## 8. ⑦ 결과 표시

전제: 엔진 echo `acquisitionBasis`(이름 엔진 확정 — §9). 표시는 값을 새로 계산하지 않고 echo를 읽는다. 정본은 `summarizeSplitGain`(`lib/tax-engine/transfer-tax-split-display.ts`, 391줄) 한 곳 — 거기에 채택 근거를 얹어 **4뷰가 한 leaf를 읽는다**(memory `feedback_transfer_result_view_is_not_one`).

| 뷰 | 위치 | 변경 |
|---|---|---|
| 단건 결과 카드 | `SplitGainDetailSection.tsx`(279줄) 토지 파트 취득가액 행 아래 | 비교 행 3개 — 「상속개시일 평가액 {reported}」 · 「영 §164④ 가액 (㎡당 {pricePerSqm} × 토지 면적 {areaSqm}㎡) {sec164}」 · 「취득가액 — 많은 금액: {adopted 라벨}」. V3면 기존 `Pre1990LandValuationDetailCard` 재사용. 비교 미적용(echo 없음/구 이력)은 종전 화면 |
| 상세명세서 | `split-acq-text.ts:40-42` `partTag` | 채택이 ②이면 `토지(영 §164④ 가액)`, ①이면 종전 `토지(상속개시일 평가액)`. 동점은 ①(GB 규약, `transfer-tax-api-gb.ts` 주석). 한 줄 산식: `토지 취득가액 = 많은 금액(상속개시일 평가액 300,000,000, 영 §164④ 가액 16,000,000) = 300,000,000` (숫자 옆 한국어 라벨, `floor`·변수 약어 없음) |
| 신고서 | `FilingFormTableHelpers.ts`(678줄) split-2col | 취득가액 칸은 이미 파트 `acquisitionPrice`(= 채택값)라 값 변경 0. 각주(`setRoseNote`)에 「영 §163⑨ 단서 1호: 평가액 {reported} · §164④ 가액 {sec164} 중 많은 금액」 1줄 |
| PDF | `lib/pdf/ResultPdfTransferSections.tsx`(372줄) | 카드와 같은 행(공유 leaf) |
| 다건 | `ValuationDetailCards.tsx:152` → 같은 `SplitGainDetailSection` | 자동. 건별 신고서 어댑터는 `splitDetail`을 싣지 않는 기존 한계(D1-3 「남긴 것」)를 그대로 상속 — Low |

문구는 법정 용어(「상속개시일 평가액」·「영 §164④ 가액」·「많은 금액」), 「원」 접미 없음, 금액 칸은 고정폭 우측 정렬. 위치 세부(특히 `FilingFormTableHelpers` 각주 위치)는 Do 단계에서 코드로 확정(확인 필요).

---

## 9. 엔진 시니어와 맞출 지점 (미정 → 합의 필요)

| # | 항목 | UI가 필요로 하는 것 | 선택지 |
|---|---|---|---|
| E-1 | ④ 전송 키 | §4 V1/V2/V3 | UI 권장 V2 |
| E-2 | ② 곱셈 규약 | 한 곳 | V1이면 클라이언트가 `calculatePre1990LandValuation().standardPriceAtAcquisition`(`safeMultiply`+floor)을 그대로 보냄 / 엔진 `multiplyByArea`와 1원 차가 나면 V2 |
| E-3 | echo 이름·구조 | `acquisitionBasis{reported, sec164, adopted}` + (V2) `pricePerSqm`·`areaSqm` | 구 이력 optional, echo 없으면 비교 행 미렌더 |
| E-4 | 면적 소스 | `areaScenario === "partial"`의 평가액(취득 전체? 양도분?)과 곱할 면적 | UI 잠정: M0으로 차단(⑧만 더 엄격). 엔진이 정책을 정하면 완화 |
| E-5 | 1985.1.1. 전 상속·증여 | 일반건물은 하한 없음(max 그대로). 주택 split 엔진이 영 §176의2④ 의제취득 분기를 따로 갖는지 | 엔진 확인 필요 |
| E-6 | ⑫ 오류 field | `landSec164Value`(이름 확정) — 화면 도달 불가이므로 라벨 맵만 | UI가 `transfer-tax-error-format.ts` 라벨 추가 |
| E-7 | `SplitPartCauseField` | 신규 field 값 추가 시 ⑧ 매핑(`validate-split.ts:150-153`)이 `fieldError`에 못 넘김 — ⑧이 상세 검사를 앞서 처리하므로 leaf issue는 방어선(도달 불가) | 엔진 leaf R-Q7′는 `hasLandSec164Value` 사실로 판정 |
| E-8 | `LAND_CAUSE_PRE_1990_MESSAGE` | 화면에서 더는 쓰지 않음 | 엔진은 방어선 문구로 유지(문구 「이 비교는 지원하지 않습니다」 수정 필요 — 이제 지원) |

---

## 10. 검증 계획

### 10.1 Pre-Do (이 문서와 함께 실행됨)

`__tests__/calc/transfer-land-part-cause.d1-4.predo.test.ts` — **활성 23 passed · todo 14**.

- **A (현행 Q-7 pin, `[D1-4에서 뒤집힘]`)**: A1 신축·매매 × 상속 1984 → ⑧ 차단 `landAcquisitionDate` — §164④ 5칸·면적을 채워도 차단 · A2 증여 1988-12-31 · A3 경계 1990-08-29 차단 / 1990-08-30 통과(D1-4 후에도 유지) · A4 ⑫ 400 · A5 `landPartCauseDateNotice` 차단 문구 · A6 `separateAcqPartsSum` 확정값(650,000,000 / 700,000,000).
- **B (공유 키 재사용의 전제, D1-4 후에도 유지)**: B1·B1′ ④ body 누수 0 + 긍정 짝 · B2 환산 게이트 5종 거짓/null · B3 PHD 무시 · B4 토글 OFF 후 미전송 · B5 ④ 3경로 동일 · B6 신규 폼 키 0.
- **C (앵커 수치)**: C1 평가액 3억 vs ② 16,000,000 → 평가액 · C2 ② 400,000,000 → ② · C3 GB 파생과 같은 ㎡당 가액 2,000,000(+ 래치 OFF면 null — D1-4는 래치를 읽으면 안 된다).
- **D (todo 14)**: 게이트 · 래치 비의존 · ⑧ 순서 · ⑧↔④ 짝 · 면적 정책 · 결합 제외 순서 · ④ 3경로 · ⑫ 직접 호출 · ⑥ pending · echo · 파트 태그 · 신고서 · 신축 회귀 · e2e 수치.
- **mutation**: `phdFlagEffective`에서 토지 원인 항 제거 → B1·B3 4건 KILLED (원복 확인, `git status` 클린).

### 10.2 Do 단계 추가

- 신규 leaf 단위 테스트 + **⑧↔⑫ 격자 40셀 전수 실행**(§6.3 축; 기대값은 엔진 정본에서 뽑는다 — memory `feedback_fe8_vs_12_parity_grid`).
- mutation: 게이트 날짜 비교(`<` ↔ `<=`) · 래치 비의존(`pre1990Enabled` 읽기 삽입) · ④ 전송 조건 · pending · `partTag` 채택 분기 · M1~M3 순서 각 1건 이상.
- **E2E**(`e2e/transfer-acq-cause-mixed-d1-4.spec.ts`, 신규): ① 신축 + 토지 상속 1984 → 카드 노출 → 5칸 입력 → 계산 → 결과 카드 「평가액 vs §164④ → 채택」 ② 매매 호스트 동일 ③ `page.route`로 `/api/calc/transfer` body 캡처 → ② 키 확인(Network 탭 확인 대체) ④ 면적 비움 → 계산 시도 → `acquisitionArea` 칸 이동 ⑤ 1991 날짜로 바꾸면 카드 소멸·② 미전송. E2E 시드는 매매 + 원인에 `landCauseHost:"purchase"`를 **함께** 넣는다(normalize가 지운다 — D1 §3.4).
- 기존 E2E 회귀: `transfer-acq-cause-mixed-d1*.spec.ts` · `split-mode-gating.spec.ts` 중 1990 전 안내 문구를 단언하는 것은 **역방향 grep으로 전수**(memory `feedback_display_string_change_needs_reverse_grep`) — `land-cause-date-notice` testid와 문구 「이 비교는 지원하지 않습니다」 단언이 있으면 새 동작으로 교체.
- Check: `ui-engine-sync-checker`(14지점, 특히 ⑭ 3곳) + `acquisition-cost-review`(§163⑨ 단서 1호·§164④).

---

## 11. 확인 필요 · 한계

- **화면 미실측**: Playwright 미수행. 카드 위치(`LandBuildingSplitSection` ① 토지 파트 아래)·면적 칸 가시성(`AssetAreaSection:380` — 코드 확인)·1985 전 라벨은 코드 추적만. E2E에서 검증.
- **다건 화면이 이 블록에 닿는지**(D1 V-UI-1 미해소): `CompanionAcquisitionCauseSection` import 1곳(`asset-sections/AssetSectionAcquisition.tsx:27`)까지만 확인. 다건 ⑤ 별도 마운트 필요 여부 확인 필요.
- **법령 재조회 없음**: 조문 인용은 계획서 §1(KoreanLaw 2026-10-08 조회)·저장소 GB 주석(MST 286211 본문 직독)에 기댔다. 증여 포함·1985 하한 없음·동점 규약은 **저장소 선례**이고 이 문서에서 재확인하지 않았다. 신규 인용은 이미 manifest에 있는 §163⑨ 단서 1호·§164④뿐이라 `additions-*.ts` 등록 추가는 없다(Do 전에 `legal-verification-coverage-complete` 통과 확인).
- **일부양도(`partial`)**: 평가액의 기준 면적이 취득 전체인지 양도분인지 정면 확인 못 함 → M0 잠정 차단(E-4).
- **GB `Pre1990LandValuationInput`가 `pre1990Enabled` 토글 안에 있고 D1-4는 `alwaysOpen`**: 두 방식이 같은 컴포넌트에서 갈린다. D1-4 PR에서 GB를 건드리지 않는다(Surgical) — 후속으로 GB도 `alwaysOpen`으로 맞출지는 별건.
- 파일 줄 수: `transfer-tax-validate-acquisition.ts` 728(변경 0 — 규칙은 `validate-split.ts`·신규 leaf에) · `transfer-tax-validate-split.ts` 587(+~15) · `LandBuildingSplitSection.tsx` 488(+~8) · `LandPartCauseBlock.tsx` 281(+~10, Q-7 분기 제거와 상쇄) · `FilingFormTableHelpers.ts` 678(+~12). 모두 800 미만.

---

## 12. 사용자 결정 질문

| # | 질문 | 권장안 | 근거 |
|---|---|---|---|
| **Q-D14-UI1** | ④가 무엇을 싣는가(엔진 안) | **V2** — ㎡당 가액만 보내고 엔진이 면적을 곱해 max·echo | §4 — 곱셈 1곳, 결과에 ㎡당 × 면적이 남아 검증 가능, ⑫ 표면 최소. (엔진 시니어가 V1을 택하면 UI는 하위 엔진 총액을 그대로 전송) |
| **Q-D14-UI2** | ④-max(일반건물 방식) 채택 여부 | **채택하지 않음** | §4 — 채택 근거 echo가 없어 파트 태그가 거짓 라벨이 되고 ⑫가 비교를 검증 못 한다 |
| **Q-D14-UI3** | 면적 방식이 「일부 양도」일 때 | **D1-4에서는 ⑧ 차단**(M0), 후속에서 정책 확정 시 완화 | 평가액이 취득 전체/양도분 어느 쪽인지 미확정. 자동 안분 금지 정책과 일치(없는 값을 지어내지 않는다) |
| **Q-D14-UI4** | 사이드바 취득가액 | **결과 도착 전 숨김(pending)** | §7 — 부분합 오독 방지, 환산 모드와 같은 규칙 |
| **Q-D14-UI5** | 입력 카드의 노출 방식 | **토글 없이 상시(`alwaysOpen`)** | §2.3 — 법이 정한 비교라 선택 대상이 아니다. GB(토글 안)와 달라지는 점은 수용 |
| **Q-D14-UI6** | PR 분할 | **D1-4a 엔진(⑫ 수용·echo, 화면 변화 0) → D1-4b UI** | §0-9 — ⑧·⑫ 완화가 한 쌍으로 이동 |
| **Q-D14-UI7** | ② 비교값을 **필수**로 요구할지(일반건물 선례) opt-in(토지·주택 자산 단위 증여 섹션 선례 — 전부 비면 ① 단독)으로 둘지 | **필수** | §6.2 — 현행 Q-7이 이미 전부 막고 있어 새로 막히는 사용자 없음, 비교 생략 = 유리 적용. opt-in은 ②를 비운 채 통과하는 새 경로를 연다 |

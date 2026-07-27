# 양도세 지분 모드 UI 정제 — 구현 계획서

> 대상: `components/calc/transfer/` 양도세 자산 카드 지분(fractional) 모드.
> 사용자 지적 4건(① 지분율 최상단 · ② "취득 지분율" 명칭 · ③ 자산2도 동일 · ④ 자산2 기본정보 숨김) 전부 구현.
> 작성 2026-07-27. 규모 판정: **중**(여러 파일 UI 재배치 + API 변환/validate 조정, **신규 엔진 input/result 필드 없음**).

## 0. 배경·현행 (실측 확인 완료)

| 항목 | 현행 | 근거 file:line |
|---|---|---|
| 토글 B "같은 물건을 지분(%)별로 나눠…" | ③ 취득정보 최상단, `isFirst`(자산1)만 | `AssetSectionAcquisition.tsx:68` |
| 취득원인·취득일 | 토글 B 다음 | `AssetSectionAcquisition.tsx:120` (`CompanionAcquisitionCauseSection`) |
| 지분율 값 입력(`OwnershipRatioInput`) | 취득원인·취득일 **뒤(맨 아래)**, **전 모드 항상 노출** | `AssetSectionAcquisition.tsx:129` · 주석 L127 |
| 지분율 라벨 | `"공유 지분율"` 하드코딩 | `OwnershipRatioInput.tsx:46` |
| 지분 모드 판정 | `isFractionalRatioStr(num, den)` (분자<분모) | `transfer-tax-api-helpers` |
| 자산2 기본정보(① 자산종류·소재지·면적·토지성격) | 전 자산 카드에 동일 렌더 | `CompanionAssetCard.tsx:255`·`AssetSectionBasic.tsx` |
| 지분 추가 시 신규 자산 | `makeDefaultAsset(2)` **빈 기본정보** + ownership 빈칸 | `Step1.tsx:90-94` |
| companion 자산 payload 빌드 | `form.assets.slice(1).map(a => buildAssetPayload(a, …, form.assets[0], …))` | `transfer-tax-api.ts:637-639` |

**핵심 성질**: 지분 모드는 "한 사람이 **같은 물건**을 60% 상속 + 40% 매매로 나눠 취득"하는 케이스(공유 아님). 따라서
- **자산 간 동일**: 자산종류·소재지·면적·토지성격(① 기본정보), 양도가액 총액(② 양도) → primary 단일 소스.
- **자산 간 상이**: 취득 지분율·취득원인·취득일·취득가액·취득 관련 필요경비(③④ 취득측).

## 1. 목표(성공 기준)

- **G1(①③)**: 지분 모드일 때 지분율 값 입력이 ③ 취득정보의 **첫 항목**(토글 B 바로 아래·취득원인 위)으로 이동. 자산2+도 동일. **비-지분 모드는 현 위치(맨 아래) 유지.**
- **G2(②)**: 라벨을 문맥별 분기 — **지분 모드 = "취득 지분율" / 그 외 = "공유 지분율"**. 일괄 rename 금지(단독 부분소유 케이스 오표기 방지).
- **G3(④)**: 지분 모드에서 자산2+ 카드의 **① 기본정보 섹션 숨김**. 엔진에는 primary의 basic 정보가 자산2+ payload에 **주입**되어 도달. UI 통과 ↔ validate 차단 모순 없음.
- **검증**: 아래 §6 anchor + E2E GREEN, `tsc --noEmit` 0건, 브라우저 수동 확인.

## 2. 케이스 매트릭스 (분기 전수)

| # | 모드 | 자산 index | 지분율 위치 | 라벨 | ① 기본정보 | 비고 |
|---|---|---|---|---|---|---|
| C1 | none(단독 100%) | 0 | 맨 아래(현행) | 공유 지분율 | 노출 | 회귀 방지 — 변화 0 |
| C2 | none(단독 부분소유 예: 1/2) | 0 | 맨 아래(현행) | **공유 지분율** | 노출 | 실제 공유 → 명칭 유지 |
| C3 | companion(다른 물건 함께양도) | 0·1+ | 맨 아래(현행) | 공유 지분율 | 노출 | 서로 다른 물건 → basic 상이, 숨김 안 함 |
| C4 | fractional | 0(primary) | **최상단** | **취득 지분율** | 노출(단일 소스) | |
| C5 | fractional | 1+(companion) | **최상단** | **취득 지분율** | **숨김** | basic은 primary에서 주입 |
| C6 | **fractional + 겸용주택** | 0·1+ | — | — | — | **이번 범위 제외 — validate 차단**(아래 M4 결정) |

**경계 케이스 방어**:
- **B1(혼합)**: companion 모드인데 일부 자산이 우연히 분자<분모(부분소유) → C3 규칙 우선(모드 = companion). 지분율 **위치·라벨**은 `splitMode==="fractional"`로 게이트(개별 자산 ratio 아님). 단 **배지·안내카드는 ratio 게이트 유지**(§3② 축 분리 참조).
- **B2**: 지분 모드 자산2의 assetKind가 primary와 다르게 저장돼 있던 stale 데이터 → 주입이 primary로 **덮어씀**(같은 물건이므로 정합). 단, 덮어쓰기 대상 필드 명세를 §4에 고정.
- **B3(겸용×지분 — M4 결정)**: `primary.isMixedUseHouse === true && splitMode === "fractional"` 조합은 **이번 범위에서 제외**. 겸용은 주택분/상가분 4부분 안분(`mixed*` 필드군, `calc-wizard-asset-mixed-use.ts:46-62`)을 요구하는데, 이를 지분별(per-share)로 나눠 입력받는 것은 별도 대규모 설계다(Surgical — 범위 최소화). **validate에서 차단**("겸용주택은 지분 분할 취득과 함께 계산할 수 없습니다") + 지분 모드 ON 시 겸용 토글 disable(또는 반대). 정상 지분 케이스에서 `isMixedUseHouse`는 항상 false이므로 §4 병합은 무해(false 전달).
- **B4(특수 자산종류×지분 — Do-time 발견, M4와 동일 패턴)**: assetKind 선택기는 ① 기본정보에만 존재 → ①을 숨기면 companion의 특수 종류 ③ 블록(`CommercialBuildingBlock`·`GeneralBuildingBlock`·`RedevelopmentBlock`, `AssetSectionAcquisition.tsx:265·277·286`)이 companion 고유 assetKind(기본 housing)로 렌더 불가. 병합은 엔진 payload assetKind만 고치지 ③ 렌더는 못 고침. → `primary.assetKind ∈ {commercial_building, general_building, redevelopment_apt} && isFullFractionalBundle`은 **범위 제외 + validate 차단**("해당 자산 종류는 지분 분할 취득 계산을 지원하지 않습니다"). 표준 종류(housing·land·building·right_to_move_in·presale_right)는 특수 ③ 블록이 없어 병합만으로 완결 → effectiveAssetKind 배선 불요. (사용자 케이스인 상속 주택·토지는 표준 종류라 정상 지원.)

## 3. 구현 항목별 상세

### ①③ 지분율 위치 (지분 모드 최상단)
- `AssetSectionAcquisition.tsx`: 지분율 위젯 + 지분 모드 안내카드(L143)를 **단일 프래그먼트 `ratioBlock`으로 추출**(M8) 후 위치만 조건 선택 — JSX 4분기(상단 유/무 × 하단 유/무) 방지:
  ```tsx
  const ratioBlock = (<>{/* <OwnershipRatioInput label={…}/> + 지분 모드 안내카드 */}</>);
  // 토글 B 직후:  {splitMode === "fractional" ? ratioBlock : null}
  // 취득원인 뒤:  {splitMode !== "fractional" ? ratioBlock : null}
  ```
  - `splitMode === "fractional"`: 토글 B(L68) 직후·`CompanionAcquisitionCauseSection`(L120) **앞**.
  - 그 외: 현 위치(L129) 유지. (컴포넌트 인스턴스는 1경로만 실행)

### ② 라벨 문맥 분기 + 배지/안내 축 분리 (M3)
- **두 개의 직교 축 — dual-truth 아님**:
  - **ⓐ 라벨**(소유 의미 축): `splitMode`가 진실. `OwnershipRatioInput.tsx`에 optional prop `label?: string`(기본 `"공유 지분율"`) 추가, 호출부에서 `label={splitMode === "fractional" ? "취득 지분율" : "공유 지분율"}`. 위젯 내부 `isFractionalRatioStr`로 **라벨 결정 금지**(모드 아님).
  - **ⓑ 배지·안내카드**(계산 방식 축): 개별 ratio(`isFractionalRatioStr`)가 진실 — **부분소유(C2, none·1/2)도 100% 기준 입력이 맞음**(`buildAssetPayload`가 ratio 적용, Fork A 실측 확인). 이 게이트는 **유지**.
  - 같은 값의 이중 결정이 아니라 서로 다른 의미의 두 신호 → 정합.
- **배지 문구 정정**: `OwnershipRatioInput.tsx:49` 배지 `"지분 모드"` → **`"100% 기준 입력"`**(또는 `"100% 환산"`). "모드" 표현이 splitMode를 연상시켜 C2에서 라벨과 충돌하는 오해 제거. (**test-safe 실측**: E2E `transfer-fractional-bundled.spec.ts`는 "지분 모드"를 comment/describe에만 사용, 배지 getByText 셀렉터 없음. validate의 `/지분 모드/` 매칭은 단건 차단 메시지로 배지와 별개 소스 — 배지 변경 무영향.)
- 위젯 파일 주석(L4 "공유 지분율 입력 위젯")도 문맥 반영해 갱신.

### ④ 자산2+ 기본정보 숨김 + primary 주입
**UI(숨김)** — `CompanionAssetCard.tsx`:
- 신규 파생 플래그 `hideBasicSection = splitMode === "fractional" && index > 0`.
- `hideBasicSection`일 때 ① 기본정보 `AssetSection`(L255-277) **미렌더** + 대신 안내 배너 표시.
  - **안내배너 규격(M7)**: `<ToneCard tone="sky">`(인라인 톤 하드코딩 금지·`tones.ts` 단일 소스) + `data-testid="fractional-basic-inherited-notice"`. 문구 "자산종류·소재지·면적은 자산 1과 동일하게 적용됩니다". 라벨 타이포 정본 클래스(`text-xs` 등, 임의 px 금지). (기존 `AssetSectionBasic.tsx:123`의 "양도일…공통입니다" `bg-muted/30 p` 패턴이 유사하나, 신규 카드는 ToneCard 규칙 우선.)
- **칩바 게이트 정정(M1)**: 숨김 시 ① 칩 제외는 `summaryByNum`(색만 결정)이 아니라 **`SECTION_CHIPS.map` 내부 return-null 게이트**(L235 `if (chip.num === 5 && !sec) return null` 패턴 확장)에 `if (chip.num === 1 && hideBasicSection) return null` 추가. (미적용 시 ① 칩 잔존→`jumpToSection(1)`이 미렌더 `[data-asset-section="1"]` 탐색 no-op = 죽은 칩.)
- **open/forceOpen 파급 근거(M2)**: index>0은 `showFormDates=false`(`CompanionAssetsSection.tsx:90`)라 `open` 초기값 `{1:true}` 자동펼침·양도일 위젯이 **애초에 없음** → ① 숨김과 무충돌. `forceOpenAll`(검증오류 시, L263)은 미렌더 ①에 무해. `handleBasicChange`(L153 assetKind 자동 ③펼침)는 ① 미렌더로 **호출 경로 소멸**(companion basic 변경 UI 없음) — `onChange` 직접 전달만 유지.
- ② 양도정보: 지분 모드는 양도가액이 이미 `총액 × 지분율` 자동 산출(`CompanionSaleModeBlock`)이므로 자산2+에서도 유지(양도가 자동표시). **양도정보 섹션 자체는 숨기지 않음**(자동계산 결과 확인 필요) — 범위 최소화.
- **섹션 번호(M10)**: ① 숨김 후 ②③④⑤ 번호 **유지**(재번호는 `num` prop·`data-asset-section` testid·`SECTION_CHIPS` 전반 파급이 커 비권장). "① 부재"는 안내배너가 대체 설명.

**데이터(병합)** — API·validate **양층 동일 헬퍼**(M6, 재설계):
- **실측 근거(anchor 준비 중 발견)**: `buildAssetPayload`(companion)는 basic 중 **`assetKind`(L441 항상)·`landNature`(L549, 토지)·`acquisitionArea`(L383·397 `inheritanceValuation.landAreaM2`로만)** 만 emit. **`regionCode`·주소·`acquisitionSigunguCode`·`longitude/latitude`·`transferArea`(수용 적격 외)는 companion payload에 emit 안 됨** → 이들 주입은 dead(엔진 미도달). 조정지역 중과는 top-level(primary) regionCode를 전 자산 공용 → 같은 물건이라 정합.
- **정정 아키텍처**: "API 주입 + validate skip"(2원) → **`mergePrimaryBasic`를 API·validate 양쪽에 적용**(1 헬퍼). validate는 form-state를 검사하므로, 병합 후 검사하면 (a) 올바른 assetKind로 분기, (b) basic 미입력 spurious block 소멸, (c) 취득측(미병합)은 companion 고유값 검사 유지.
  ```ts
  // transfer-tax-api-helpers.ts — validate·api 공용 (단일 소스)
  export function mergePrimaryBasic(a: AssetForm, primary: AssetForm): AssetForm {
    return { ...a,
      assetKind: primary.assetKind,
      acquisitionArea: primary.acquisitionArea, transferArea: primary.transferArea,
      areaScenario: primary.areaScenario, landNature: primary.landNature };
  }
  // 병합 게이트 = "진짜 지분 모드"(전 자산 fractional) — route.ts:423 isFullFractionalBundle와 동일 기준.
  // B1(companion 모드 + 우연한 1/2 부분소유) 배제: 그 경우 primary가 100/100이라 every=false → 미병합.
  export function isFullFractionalBundle(assets: AssetForm[]): boolean {
    return assets.length > 1 && assets.every(a => isFractionalRatioStr(a.ownershipNumerator, a.ownershipDenominator));
  }
  // transfer-tax-api.ts: const merge = isFullFractionalBundle(form.assets);
  //   companionAssets = form.assets.slice(1).map(a => buildAssetPayload(merge ? mergePrimaryBasic(a, primary) : a, …))
  // transfer-tax-validate.ts collectStepIssues 루프(i>0):
  //   validateAssetEntry(merge ? mergePrimaryBasic(form.assets[i], primary) : form.assets[i], i, form)
  ```
  - **게이트 헬퍼 단일 소스**: `isFullFractionalBundle`를 `transfer-tax-api-helpers.ts`에 export해 api·validate 공용(route.ts의 인라인 계산과 개념 일치 — route는 Surgical상 이번에 미변경). 블랭크 ownership 입력 중에는 every=false → 미병합이나 L75-82 ownership 미입력 차단이 우선 노출되므로 UX 정합.
  - **병합 필드는 5개로 한정**(assetKind·acquisitionArea·transferArea·areaScenario·landNature) — buildAssetPayload가 읽는 것 + validate가 basic으로 검사하는 것의 합집합. 소재지·좌표·sigungu·buildingName은 **양쪽 다 미사용** → 병합 제외(Simplicity).
  - **isMixedUseHouse 제외**: 겸용×지분은 M4로 차단 → 정상 fractional에서 primary.isMixedUseHouse는 항상 false, 병합 불요.
  - **취득측 필드(취득원인·취득일·취득가액·지분율·필요경비)는 병합 안 함**(자산별 상이 — validate가 companion 고유값 검사·엔진이 per-share 계산).
- primary는 이미 `form.assets[0]`로 L639 전달됨. buildAssetPayload는 ownership ratio를 `getOwnershipRatio`/`applyRatio`로 이미 적용 → 지분율 미병합 정합(중복 없음, Fork A 확인).

**Validation(⑧)** — `lib/calc/transfer-tax-validate.ts`·`-validate-asset.ts`:
- **실측 확인**: `validateAssetEntry(form.assets[i], i, form)`가 **전 자산 루프**로 실행(`transfer-tax-validate.ts:69`)되고, 토지 자산은 면적 필수(`-validate-asset.ts:70-73·351-362`), assetKind별 basic 검사가 있음 → 자산2 basic을 UI에서 숨기면 **validate가 차단** = UI 통과↔validate 차단 모순 실재(⑧ 정책 위반).
- **정정 방안(병합, skip 아님)**: `collectStepIssues` 루프(`transfer-tax-validate.ts:69`)에서 fractional companion(`splitMode==="fractional" && i>0`)이면 `validateAssetEntry(mergePrimaryBasic(form.assets[i], primary), i, form)`로 **병합 후 검사**. 병합으로 assetKind·면적이 primary값을 가지므로 basic 검사가 정상 통과하고, assetKind-분기 취득측 검사도 올바른 kind로 실행. (skip 플래그보다 DRY — 동일 헬퍼 재사용, `validateAssetEntry` 시그니처 무변경.)
- 취득측 필드(지분율·취득원인·취득일·취득가액)는 병합 대상 아님 → companion 고유값으로 검사 유지. **지분율 미입력 차단** 보존(handleFractionalToggle이 ownership 빈칸 추가 → `Step1.tsx:79-80` 정책).
- **겸용×지분 차단(M4)**: `primary.isMixedUseHouse === true && isFullFractionalBundle`이면 validate 오류("겸용주택은 지분 분할 취득과 함께 계산할 수 없습니다"). UI에서도 지분 모드 ON 시 겸용 토글 disable(또는 반대).
- **특수 자산종류×지분 차단(B4)**: `primary.assetKind ∈ {commercial_building, general_building, redevelopment_apt} && isFullFractionalBundle`이면 validate 오류("해당 자산 종류는 지분 분할 취득 계산을 지원하지 않습니다"). 토글 B가 특수 종류일 때 이미 켜져 있으면 진입 차단.
- **주의**: `validateAssetEntry` 시그니처 변경 시 호출부는 `transfer-tax-validate.ts:69` **단 1곳**(Fork A 실측), 정의 `-validate-asset.ts:541`. 변경 시 이 두 지점만 동기화.

## 4. 주입 필드 명세 (④ — 확정, 침묵 strip 방지)

> **병합 필드는 buildAssetPayload가 companion에서 실제 emit하는 것 + validate가 basic으로 검사하는 것의 합집합**으로만 한정(실측). 소재지·좌표·sigungu·주소는 companion payload 미emit·validate 미검사 → 병합 제외(dead injection 방지).

| 필드 | 병합? | 사유 |
|---|---|---|
| assetKind | ✅ | buildAssetPayload L441 emit + validate 분기 근거. per-share 세율·장특 정합 |
| acquisitionArea | ✅ | `inheritanceValuation.landAreaM2`(L383·397) emit + validate 토지 면적 검사 |
| transferArea / areaScenario | ✅ | validate 토지 면적·환지 시나리오 검사 통과용(payload emit은 수용 적격만) |
| landNature | ✅ | buildAssetPayload L549 emit(토지) |
| ownershipNumerator/Denominator | ❌ | **지분별 상이** — validate가 companion 고유값으로 미입력 차단 |
| acquisitionCause / acquisitionDate / 취득가액·필요경비·상속평가·환산 | ❌ | 지분별 상이 |
| regionCode / addressPnu / 주소(Road·Jibun·Dong·Ho·Detail·building) / acquisitionSigunguCode / longitude / latitude | ❌ | **companion payload 미emit·validate 미검사** — 조정지역은 top-level primary 공용 |
| isMixedUseHouse / mixed*(겸용 안분) | ❌ (M4) | 겸용×지분 차단 → primary 항상 false, 병합 불요 |

> **단일 소스(M6)**: 위 ✅ 5필드는 `mergePrimaryBasic()` 헬퍼(§3 ④) 1곳 정의, API·validate 양층 참조. 이 표는 헬퍼의 문서 미러 — 필드 추가 시 **헬퍼가 정본**.

## 5. 영향받는 14 동기화 지점 (신규 필드 0 — 기존 필드 재배선만)

신규 엔진 input/result 필드가 **없으므로** 신규 도달경로는 불필요. 변경은 **기존 필드의 UI 위치·라벨·주입**에 국한:

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | 변화 없음 |
| ② initial | 변화 없음 |
| ③ normalize | 변화 없음 |
| ④ API 변환 | **`mergePrimaryBasic` 병합**(`transfer-tax-api.ts` companion map) |
| ⑤ UI 위젯 | 지분율 위치·라벨(`AssetSectionAcquisition`·`OwnershipRatioInput`)·① 숨김(`CompanionAssetCard`) |
| ⑥ 사이드바 | 변화 없음(M9: `computeTransferSummary`는 **formData의 금액 필드만** 사용 — basic 공란과 무관) |
| ⑦ 결과 카드 | 변화 없음 |
| ⑧ validation | **fractional companion은 `mergePrimaryBasic` 병합 후 검사 + 겸용×지분 차단** |
| ⑨~⑭ API/Route | 변화 없음(신규 Zod 필드 없음) |

## 6. Pre-Do Anchor (검증 우선)

1. **A1(④ 병합·API)**: 지분 모드 2자산 — primary=`land`(60% 상속, basic 입력), companion=makeDefaultAsset(기본 `housing`)·**basic 공란**(40% 매매). `callTransferTaxAPI` fetch mock으로 body 캡처 → `companionAssets[0].assetKind === "land"`(병합 전=housing이면 RED, 병합 후=land GREEN). 패턴: `bundled-companion-one-household.anchor.test.ts`의 `captureBody`.
2. **A2(⑧ validate 병합)**: 위 form을 `collectStepIssues(0, form)`(또는 `validateStep`) → companion land basic 공란이어도 **차단 안 됨**(병합 후 primary 면적 사용) + companion 지분율 공란은 **여전히 차단**.
3. (UI는 E2E) **E2E**: 토글 B ON → 지분율이 ③ 최상단 + 라벨 "취득 지분율" + 배지 "100% 기준 입력" + 자산2 카드 ① 기본정보 미노출·안내배너(testid).

## 7. 리스크·정책 준수

- **mirror-pattern(memory)**: ④를 `useEffect → store` 미러링으로 구현 **금지** → 변환·validate 시점 `mergePrimaryBasic` 병합(순수 함수, store write 없음). (Step1 `handleFractionalToggle`에서 신규 sibling에 basic 복사하는 대안은 primary 후속 변경 시 stale → 채택 안 함.)
- **dual-truth 회피(M3)**: 라벨은 `splitMode`(소유 의미 축), 배지·안내카드는 개별 ratio(계산 방식 축) — 서로 다른 의미의 두 신호이므로 정합. 배지 문구는 "100% 기준 입력"으로 정정해 축 혼동 제거.
- **회귀**: C1·C2·C3(비-지분)은 위치·라벨·기본정보 **변화 0**이어야 함 — 조건 게이트 `splitMode === "fractional"`로 엄격 격리. (C2 부분소유: 라벨 "공유 지분율" 유지 + 배지 "100% 기준 입력"은 정상 노출.)
- **겸용×지분 제외(M4)**: 이번 범위에서 조합 차단. 향후 겸용 per-share 안분 요구 시 별도 계획.
- **Surgical**: ② 양도정보 섹션 숨김은 이번 범위 제외(양도가 자동표시 확인 필요) — 요청 범위(기본정보) 밖 확장 금지.
- **read-only 대안(M10, Low)**: 안내배너에 상속되는 자산종류·소재지 축약 표시를 넣는 방안 존재 — 완전 숨김+배너로 진행하되 사용자 확인 시 확장 가능(결정 이력).

## 8. 작업 순서

1. A1·A2 anchor 선작성·실행(실패 확인) → 설계 환류.
2. `OwnershipRatioInput.tsx` label prop + 배지 문구 정정.
3. `AssetSectionAcquisition.tsx` `ratioBlock` 프래그먼트 2위치 분기 + 라벨 주입.
4. `CompanionAssetCard.tsx` ① 숨김 + `SECTION_CHIPS.map` 칩 게이트 + ToneCard 안내배너(testid).
5. `transfer-tax-api-helpers.ts` `mergePrimaryBasic` 헬퍼 → `transfer-tax-api.ts` companion map 병합.
6. `transfer-tax-validate.ts` `collectStepIssues` fractional-companion 병합 후 검사 + 겸용×지분 차단.
7. anchor GREEN → E2E → tsc → 브라우저 확인.

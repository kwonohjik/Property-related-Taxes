# 겸용주택 Case A — 주택/상가 섹션별 건물 기준시가 계산기 분리 배치 계획서

- 작성일: 2026-07-22 (self-review v1 정정 반영)
- 대상 화면: 겸용주택(주택+상가) 양도세 마법사 › 개별주택가격 미공시(§164⑦) 3시점 환산 › **Case A**(최초공시일 < 용도변경일) 자산-우선 레이아웃
- 성격: **UI 재배치 (엔진 무변경)**. 신규 엔진 필드 없음 → 14 동기화 지점 대부분 N/A.
- 관련 메모리: `project_transfer_mixed_use_asset_major_stdprice` · `project_building_std_lookup_year_gate_and_collective_unit` · `feedback_no_silent_apportion_fallback` · `single-source-engine-helper` · `mirror-pattern`
- **자가검토 상태(2026-07-22)**: fork 3-way 검토 완료. §5 스냅샷·§3 일관성 High 반영 완료. **설계 확정 = D1(결합 계산 유지 + 2런처)** — 사용자 확정(2026-07-22). verdict **clean**(Do 진입 가능).

---

## 1. 배경 — 현재 상태 (실측)

스크린샷 화면(주택/상가 × 취득·최초공시·양도 각 "건물 기준시가" 6칸)은 다음 체인이 렌더한다:

```
MixedUsePreHousingDisclosureSection (:201 ThreePointStandardPriceInput, :203 enableBatchCalc, :225 layout="asset-major")
  └ ThreePointStandardPriceInput (:693 PhdBuildingStdPriceModalButton, :698 layout==="asset-major" 분기)
      └ ThreePointAssetMajorRender (:161 주택 AssetSection, :162 상가 AssetSection — 스크린샷 영역)
```

- **계산기는 이미 존재한다.** `ThreePointStandardPriceInput.tsx:693-697`에 **단일 배치 버튼** `PhdBuildingStdPriceModalButton`이 레이아웃 분기 **위**(스크린샷 크롭 상단 바깥)에 `justify-end`로 렌더된다. Case A에서 `enableBatchCalc`가 항상 켜져 항상 표시.
- 이 버튼은 국세청 「건물 기준시가 계산방법」 고시 산식(`lib/tax-engine/building-standard-price.ts`)으로 계산하고, `applyBatch`(`:660-684`)가 **주택 3 + 상가 3 = 6개 값을 모두 자동 입력**한다.
- 스크린샷의 6개 `FieldCard`(`ThreePointAssetMajorRender.tsx:64`)는 계산기 버튼 없이 `CurrencyInput`만 노출 → 사용자에게는 수동 입력처럼 보인다.
- **즉 기능 결손이 아니라 배치·발견성(UX) 문제.** 6값 산출은 이미 정상 동작.

### 6개 대상 필드 (엔진 도달 경로) — 인용 실측 일치

| 자산 | 시점 | 폼 필드 | onApply 콜백 prop |
|---|---|---|---|
| 주택건물 | 취득 | `phdBuildingStdPriceAtAcq` | `onBuildingStdPriceAtAcqChange` |
| 주택건물 | 최초공시 | `phdBuildingStdPriceAtFirst` | `onBuildingStdPriceAtFirstChange` |
| 주택건물 | 양도 | `phdBuildingStdPriceAtTransfer` | `onBuildingStdPriceAtTransferChange` |
| 상가건물 | 취득 | `mixedAcqCommercialBuildingPrice` | `onCommercialBuildingStdPriceAtAcqChange` |
| 상가건물 | 최초공시 | `phdCommercialBuildingStdPriceAtFirst` | `onCommercialBuildingStdPriceAtFirstChange` |
| 상가건물 | 양도 | `mixedTransferCommercialBuildingPrice` | `onCommercialBuildingStdPriceAtTransferChange` |

모든 콜백 prop은 `MixedUsePreHousingDisclosureSection`(`:237-252`, `:269-297`)에서 배선되어 `...props`로 흐른다. **신규 폼 필드 불필요.**

---

## 2. 요구사항 (사용자 확인 완료)

1. 상단 단일 배치 버튼 위치를, **"주택 기준시가" 섹션 헤더 우측 = 주택 기준시가 계산기**, **"상가 기준시가" 섹션 헤더 우측 = 상가 기준시가 계산기**로 분리 배치.
2. 각 계산기는 **기본 활성화(항상 노출·enabled)**.
3. 주택 계산기는 주택건물 3시점, 상가 계산기는 상가건물 3시점을 채운다(각 섹션 스코프).

---

## 3. 핵심 설계 결정 ⚠️ (사용자 확정 필요 — self-review High)

### 3-0. 문제의 본질 (fork 검토가 드러낸 것)

사용자의 모델("주택 계산기·상가 계산기 완전 분리, 각자 자기 것만")은 **Case A의 법적 구조와 마찰**한다:

- Case A = 최초공시일 < 용도변경일 → **취득·최초공시 시점에는 건물 전체가 아직 주택**. 상가분 건물기준시가를 그 시점에 산출하면 **당시 실제 용도(주택)의 구조·용도지수 + 상가 면적**으로 계산(재일46014-2396, 기존 엔진 승계 가정 — 예규라 KoreanLaw 위임체인 검증 대상 아님·**법적 정확성 별도 확인 필요**).
- 현행 결합 모달은 주택 부분의 취득·최초공시 구조·용도를 상가에 **자동 주입**(`PhdBuildingStdPriceModalButton.tsx:189-199`)해, **취득·최초공시 상가건물 기준시가를 주택과 동일 지수로 "구성적으로(by construction)" 보장**한다.
- 상가 계산기를 **완전 독립**시키면 이 주입원(주택 부분)이 없어져, 상가 취득/최초공시를 (a) 별도 재입력받거나 (b) 주택값에서 파생해야 한다.

또한 스냅샷/계산서 재유도(§5)도 단일 `bsp-{id}-phd` prefix 원자 교체를 전제로 설계돼 있어, 버튼을 둘로 나누면 재구성 로직이 서로를 덮어쓴다.

### 3-1. 3가지 설계안 (비용·정합 비교)

| 안 | 설명 | 일관성 | 스냅샷/계산서 | UX(사용자 모델) | 회귀 표면 |
|---|---|---|---|---|---|
| **D1** 결합 유지 + 2 런처 | 주택/상가 헤더에 버튼 2개, **둘 다 기존 결합 모달**(주택+상가 6값)을 연다. 라벨만 다름. | by construction ✅ | 무변경(단일 prefix·`applyBatch` 그대로) ✅ | "각 섹션에 버튼"은 충족하나 각 버튼이 **6값 전부** 채움(자기 것만 X) △ | 최소 ✅ |
| **D2** 주택 독립 + 상가 파생 | 주택 버튼=주택 3시점 독립 산출. 상가 버튼=양도 상가는 엔진 산출, **취득·최초공시 상가 = 주택 해당시점값 × (상가면적/주택면적)** 자동 파생(적용 시점 계산). | 선형성으로 exact(±1원 floor) ✅ | 파생값은 산출근거 스냅샷 부재 → 취득/최초공시 상가 **계산서 재유도 불가**(문제) ✗ | 사용자 모델 부합 ✅ (단 상가 취득/최초공시는 주택 선(先)산출 의존) | 중 |
| **D3** 완전 독립(구 S1) | 상가 버튼이 취득·최초공시 "당시 주택 구조·용도"를 **재입력**받아 독립 산출. | user-discipline로 격하(주택 모달과 다르게 입력 시 지수 불일치) ✗ | prefix 분리 필요·계산서 리더 정합 작업 多 | 사용자 모델 부합 ✅ | 대 |

- **정책 참고(fork 확인)**: D2의 면적비 파생은 `feedback_no_silent_apportion_fallback`의 **PHD 예외 조항**(2026-05-01: PHD 토글 명시 선택 + 사용자 직접 입력값 + §166⑥ 면적비 안분 허용)에 해당 → **정책 위반 아님**. Case A는 이미 PHD 명시 경로. 단, 파생은 useEffect 미러링이 아니라 **모달 "모두 적용"(사용자 액션) 시점 1회 계산**이어야 함(`mirror-pattern` 준수).
- **D3 기각 근거(High)**: 현행 "구성적 일관성"을 "사용자 규율 의존"으로 격하 = 회귀. 취득 주택건물·상가건물의 지수 기준이 어긋나면 취득가액 토지/건물 안분 오염.

### 3-2. 권고

- **1순위 D1**(최소 회귀·일관성·스냅샷 무변경). 사용자 모델과의 갭(버튼이 6값 전부 채움)은 **각 모달을 "해당 섹션 강조"로 라벨링**해 완화. 실제로 Case A 상가는 주택과 한 몸으로 계산되는 것이 법적으로 정확하므로, "완전 분리"보다 "결합 계산·2 진입점"이 도메인에 부합.
- **2순위 D2**(사용자 모델 최우선 시). 단 **상가 취득/최초공시 계산서 재유도 불가**를 수용하거나, 파생값도 스냅샷 재구성하는 별도 작업을 추가해야 함(비용↑).
- **D3 채택 금지.**

→ **✅ 사용자 확정 = D1**(2026-07-22). 결합 계산 유지·2런처. 엔진·모달·스냅샷 무변경, UI 재배치만. D2 분기는 미채택.

---

## 4. 구현 방안 (D1 기준 — 확정 시 D2 분기 별첨)

> 아래는 **D1 확정 가정** 상세. D2 선택 시 §4-A는 categoryScope 분리 + 상가 파생 로직으로 대체(별도 개정).

### 4-A. `ThreePointAssetMajorRender` — 섹션 헤더에 런처 2개 배치

`AssetSection`(`:42-82`) 헤더(`:55` `{label} 기준시가`)를 flex화하고 우측에 런처 슬롯 추가:
```
<div className="flex items-center justify-between gap-2">
  <p className="text-xs font-semibold text-slate-700">{label} 기준시가</p>  // 기존 클래스 보존
  {calcButton}                                                              // 부모에서 주입
</div>
```
- **버튼 JSX 소유권**: `ThreePointAssetMajorRender`가 `PhdBuildingStdPriceModalButton`을 **직접 import**해 조립하고, 부모(`ThreePointStandardPriceInput`)는 `points`(batchPoints)·`applyBatch`·`snapshotPrefix`·`housingFloorAreaPrefill` 등 **데이터/콜백만** prop으로 내려준다(엘리먼트 prop 지양 — 응집도·memo 관리 유리. fork 개선#3).
- 주택 런처: `label="주택건물 기준시가 계산"`, `size="xs"`(헤더 제목 12px 대비 정합·기존 `:267` 동일), `variant="modalLauncher"`(기본값), `data-testid="phd-housing-stdprice-calc"`.
- 상가 런처: `label="상가건물 기준시가 계산"`, 동일 size/variant, `data-testid="phd-commercial-stdprice-calc"`.
- **D1에서는 두 런처가 같은 결합 모달을 연다**(둘 다 `enableCommercial commercialAcqFirstMode`, 동일 `points`·`applyBatch`·`snapshotPrefix`). 라벨만 섹션 강조. → categoryScope prop 신설 **불필요**(D1). 버튼은 `handleOpen`이 무조건 열려 **항상 enabled**(jibun 미주입은 모달 내 Vworld 조회만 비활성 — 요구 "기본 활성화" 충족).
- **모바일 폭**: 헤더 제목 + 9자 라벨을 한 행에 넣으면 `sm` 미만 겹침 우려 → 라벨을 `"기준시가 계산"`으로 축약하거나 헤더를 `flex-wrap`. Do에서 실측 후 결정.
- 톤: 버튼은 `modalLauncher`(녹색 고정) — `tones.ts` 대상 아님. 헤더 제목 클래스는 기존값 보존.

### 4-B. `ThreePointStandardPriceInput` — asset-major일 때 상단 버튼 숨김

- `props.enableBatchCalc && props.layout !== "asset-major"`일 때만 상단 단일 버튼 렌더(`:693`). asset-major는 상단 버튼 제거(섹션 헤더로 이동).
- `applyBatch`·`batchPoints`·landPrice 되돌려쓰기(`:670-683`, ≤2000 2001트랙 `isAcq2001LocationIndexTrack` 게이팅 포함)는 **그대로 유지**하고 `ThreePointAssetMajorRender`에 prop으로 전달(D1은 결합 모달이라 로직 이관 불필요 — fork 개선#2 회귀 표면 최소).
- **800줄 주의**: 현 782줄. 버튼 조립을 자식(`ThreePointAssetMajorRender`)이 소유하면 부모 증가분 최소. 그래도 초과 시 조립 헬퍼 분리를 **기본 전제**로.

### 4-C. `PhdBuildingStdPriceModalButton`

- **D1: 변경 없음**(기존 props로 두 위치에서 재사용). ← 최소안의 핵심 이점.
- (D2 선택 시에만) `categoryScope` prop 신설 + 상가 파생 로직 추가.

---

## 5. 스냅샷 / 「건물 기준시가 계산서」 (실측 정정 — fork High)

**정정**: v1의 "주택/상가 다른 prefix(`-phd-housing`/`-commercial`) 부여" 제안은 **오류 — 계산서 리더를 깨뜨린다.**

- 리더 정규식 고정 세그먼트(실측): `phdTimepointLabel`(`building-std-snapshot-keys.ts:28`) `/-phd-(acq|first|transfer)(-commercial)?$/` · `idOfSnapshotKey`(`:20`) `-(?:gb|cb|phd)-(?:acq|first|transfer)(?:-commercial)?$`. → `-phd-housing`은 **매칭 실패·계산서/이력필터 소실**. **prefix를 바꾸지 말 것.**
- 키 규약 유지: 주택 = `bsp-{id}-phd-{acq|first|transfer}`, 상가 = 동일 + `-commercial` 접미(리더 이미 지원).
- 기존 `bsp-{id}-mx-commercial`(용도변경 **없는** asset-major 상가 2시점 통합 모달, `keys.ts:6-8`)와는 별개 — Case A는 3시점이라 `phd-*-commercial`이 맞다. 이원 구조·리더 공유 유지.

**D1에서는 스냅샷 문제 자체가 없음**: 결합 모달 1개가 종전대로 `replaceSnapshotsByPrefix(bsp-{id}-phd, …)`로 6값을 원자 재구성. **§5는 D1 채택 시 무변경.**

**D2 선택 시에만** 충돌 발생 → 해법(택1):
- (a) 신규 store 액션 `replaceSnapshotsByPrefixForCategory` — housing=비-commercial 키만/commercial=`*-commercial`만 교체(`replaceSnapshotsByPrefix`가 `startsWith(prefix-)` 전부 삭제하는 문제 회피, `store.ts:35-41` 실측).
- (b) 분리 버튼은 `saveSnapshot`(per-key 비파괴, `store.ts:33`)로 자기 3키만 갱신.
- 단 D2 상가 취득/최초공시 **파생값**은 산출근거 입력이 없어 스냅샷 재구성 불가(§3-1 D2 단점) — 계산서에서 해당 2행 미유도 감수 or 별도 작업.

---

## 6. 14 동기화 지점 점검

신규 엔진 input/result 필드 **없음** → ⑤(UI 위젯)만 실질 변경. 나머지 무변경. `ui-engine-sync-checker`는 참고, 주 검증은 E2E·anchor.

---

## 7. 회귀 표면 (실측 정정 — fork 오류#4)

`ThreePointStandardPriceInput`의 **layout 게이트 변경**(상단 버튼 숨김)이 영향 주는 실제 경로는 **2곳뿐**:
- `MixedUsePreHousingDisclosureSection.tsx:201` (겸용 Case A — 대상).
- `PreHousingDisclosureSection.tsx:155` (**일반 자산 PHD, 비겸용** — `enableBatchCalc` 전달·`layout` 미전달 → `layout !== "asset-major"`로 **상단 버튼 유지**되어야 함. E2E 회귀 확인 대상).
- ⚠️ 상속 `HouseValuationSection.tsx:314`는 `PhdBuildingStdPriceModalButton`을 **직접** 사용(ThreePointStandardPriceInput 미경유) → **layout 게이트 무관·무영향**. (D1은 모달 자체 무변경이라 완전 안전. D2의 categoryScope는 옵셔널·additive라 미지정 시 무영향.)

---

## 8. 테스트 계획

### Pre-Do anchor
1. **A1(D2 채택 시만)** — 상가 취득/최초공시 면적비 파생 exact성: `std(commercial area) == floor(std(housing)·commercial/housing)` ±1원 검증(1원 tolerance 정책).
2. **A2** — (D1) 결합 모달 상단→섹션 이동 후에도 `applyBatch` 6값·스냅샷 6키 재구성 불변. (D2) 스냅샷 카테고리별 교체가 상대 카테고리 보존.

### 컴포넌트/E2E (`feedback_browser_verify_with_playwright`)
- Case A 진입 → 주택 헤더 `data-testid=phd-housing-stdprice-calc` 클릭 → 모달 → 모두 적용 → 주택 3칸(D1은 6칸) 채움.
- 상가 헤더 `phd-commercial-stdprice-calc` 클릭 동작.
- asset-major에서 상단 단일 버튼 **미노출**.
- **회귀**: `PreHousingDisclosureSection.tsx:155`(비겸용 PHD)에서 상단 버튼 **유지** 확인.
- E2E 함정: `playwright test | tail` exit code 가림 — 파이프 없이. ToggleCard `setChecked`·모달 셀렉터 메모리 참조.

---

## 9. 리스크 & 완화

| 리스크 | 완화 |
|---|---|
| (D2) 상가 취득/최초공시 계산서 미유도 | §3-1 명시·사용자 수용 확인 or 별도 작업 |
| (D2) 사용자가 주택 미산출 상태로 상가 버튼 → 취득/최초공시 파생 0 | 모달에 "주택 계산기 먼저 실행" 안내 |
| 상단 버튼 제거로 비겸용 PHD 회귀 | layout 게이트로 2경로만 영향·§7 E2E 회귀 명시 |
| 헤더 flex 모바일 오버플로 | 라벨 축약/flex-wrap(§4-A) |
| 800줄 초과 | 조립 헬퍼 분리 기본 전제 |

---

## 10. 파일별 변경 요약 (D1 surgical)

1. `components/calc/transfer/ThreePointAssetMajorRender.tsx` — `AssetSection` 헤더 flex화 + 우측 런처(직접 import·testid·size xs) 2개.
2. `components/calc/transfer/ThreePointStandardPriceInput.tsx` — asset-major일 때 상단 버튼 숨김(`layout !== "asset-major"` 게이트) + `points`/`applyBatch`/prefill을 자식에 prop 전달.
3. `PhdBuildingStdPriceModalButton.tsx` — **D1 무변경** / D2 선택 시만 categoryScope·파생.
4. 스냅샷 — **D1 무변경** / D2 선택 시만 §5 (a)/(b).
5. 테스트: A2 anchor + 컴포넌트 + E2E(회귀 포함).

---

## 11. 확정/확인 필요 (Do 전)

- [x] **§3 설계 방향 사용자 확정 = D1** (2026-07-22).
- [x] 상가 연면적 prefill 소스 = `asset.nonResidentialFloorArea`(`calc-wizard-asset-gb.ts:165`, `MixedUseAreaInputs` 파생). 주택 `residentialFloorArea`와 대칭. (fork 확정)
- [x] 스냅샷 prefix 유지(§5) — `-phd-` 세그먼트 불변. (fork 실측)
- [x] (Do 실측 2026-07-22) Case A에서 `MixedUseAssetMajorStdPrice` 상가 섹션 **동시 렌더 안 됨** 확인 — `MixedUseStandardPriceInputs.tsx:44` `hasPartialUsageChange === true`(Case A 전제)면 `MixedUseLegacyStdPrice` 분기로만 렌더. AssetMajor 분기(:61)는 용도변경 없음 전용.
- [x] 재일46014-2396 법적 정확성 확인(2026-07-22 재검증). ① 실존 확정: 법제처 nts API — "겸용주택의 용도 변경시 양도 차익 계산 방법", 국세청, 1994.9.7(taxlaw ntstDcmId=010000000000093100. 본문은 SPA라 API 재조회 불가 — 요지 원문은 2026-07-07 사용자 제공 본문으로 phase2-1 계획서 §2에 인용 보존: "용도구분=사실상 사용 용도"·"취득시 기준시가는 취득일 현재 기준 용도 판정"). ② 교차 근거 실측: 국심1996전1741(1996.8.26) 재결요지 원문 확보 — 용도지수는 건물의 **실제 용도**(의원·교육연구시설)로 적용 · 서일46014-10014(2002.1.7) 실존 확정 — "취득일 이후 지목 변경된 토지의 취득당시 기준시가"(취득일 현재 현황 원칙). ③ 엔진 정합: `PhdBuildingStdPriceModalButton.tsx:191-202` commercialAcqFirstMode 시 상가 부분의 취득·최초공시 구조·용도 = 주된 주택 행 주입(당시 실제 용도=주택) — 예규 요지와 일치. `phd-building-std-batch.ts:42-44` 주석 동일 근거 명시.

---

## 12. 진행 방식

1. 사용자 §3 설계 확정(D1 권장).
2. Pre-Do anchor(A2, D2면 A1도) → 환류.
3. Do: §10 순서 단일 응답 완주.
4. Check: §7 E2E 회귀 + `ui-engine-sync-checker`(⑤).

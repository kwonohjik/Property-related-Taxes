# 비사업용 토지 상태 이력 E3-③ 「주택부수토지(배율 이내) 소유기간 중 주택 신축·멸실 이력」 — 화면·클라이언트(①~⑧) 계획서

> 상태: **Plan v2 (2026-11-24 — 사용자 결정 반영 · 코드 변경 0)** · v1(2026-11-23)은 A만 다뤘고 UQ-1~UQ-11을 추천으로 올렸다. 엔진 계획서 v4(671줄 — Q-1 (나) A+B · Q-7 (나) · Q-10 (가) · Q-11 (나) · Q-12 (가))에 맞춰 B 경로·정착면적 숫자 입력으로 갱신했다. **남은 미결 UQ 없음 — UQ-12 (가) 건너뜀 결정(사용자 결정 2026-11-24)**(§12)
> 범위: 통합 계획서 E3 후속 목록 ③ — **두 경로**(사용자 결정 Q-1 (나), 2026-11-23·24). **A** = 엔진 케이스 **M15**(주택부수토지 카드 · 양도일 현재 주택 있음 · 신축 직후 · 배율 이내, `nbl-other-land-state-history.engine.plan.md:409`) · **B** = 주택을 철거하고 **나대지로 양도**(기타토지 카드의 철거 행 — 엔진 E3d-2). 통합 계획 Q-1 (나)(`:524`)를 입력받아 판정에 쓰는 화면. 기존 UQ-7(`nbl-other-land-state-history.ui.plan.md:476` «노출 지목 (가) 기타토지만»)이 닫아 둔 «주택부수토지 미노출»을 A에서 열고, 기타토지 철거 행의 «주택 아님 전제»를 B에서 연다.
> **범위 밖(재제안 금지)**: V5-G2 · Q-8 (가) 겸용 상가분 부수토지(**겸용주택 철거를 B에서 «주택»으로 고르지 않는다 — 안내만**, 엔진 D-5) · **주택 배율 초과분 방침 Q-3a (나)**(**양도일 현재 초과분**은 유예만 반영 — 변경 금지. 과거 주택 구간의 «초과» 접기(Q-5 (나))는 이 방침 대상이 아니다 — 엔진 §3.5) · 과세기준일(6.1.) 접기(V-1 일 단위 확정) · 자동 안분 fallback · `useEffect → store` 미러링 · 별장 농어촌주택(Q-1 (다) — 선택되지 않음) · 일반건물·상업용 건물·건물(비주택) 부수토지 · 주택 양도 시 부수토지 초과분 **자동 비사업용 카드**(`__excess`, §1.1) · native 토글/라디오 · placeholder 숫자 예시.
> 엔진 쪽은 `nbl-state-history-e3-3-house-appurtenant.engine.plan.md`(v4 · 671줄)가 정본이다 — 이 문서는 그것을 읽고 정합한다(§17). **엔진 모델명·필드명·함수명은 엔진 계획서가 정본이고 이 문서의 이름은 «제안»**이다. 엔진 결정을 UI가 새로 짓지 않는다.
> 정본: `nbl-other-land-state-history.{plan,ui.plan,engine.plan}.md` · E3-①·E3-1b·E3-② UI·엔진 계획서(결정·구현 기록).
> 모든 file:line = 워크트리 `Property-related-Taxes-nbl-e3-3-plan`(master d17b8b68a) grep·Read 실측. **vitest probe 실측 = §1.3 표에만 있다(A 현행 3종 · «소비표 확장 가정» 모의 6종 · 의제 2종 · **B 현행 2종**). 나머지 동작 주장은 코드 정독이며 «확인 필요»를 병기했다.**

### 결정 반영 요약 (v1 → v2)

| 결정(2026-11-23·24) | UI 계획서 반영 |
|---|---|
| **Q-1 (나)** A + B 두 경로 | §4.4 B 위젯 신설 · §6 14지점 B 열 · §9 B 교차 조합 · §11 E2E B행 · §14 PR을 **UI-A / UI-B 두 단계**로 분리 |
| **Q-2 (가)** 일 단위 합산 + `NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE` | UV-12 해소 · §8 고지 행 · 위젯 하단 고지 |
| **Q-5 (나)** 배율 초과면 그 구간 비사업용 + 고지 | 철거 행 정착면적 칸 하단 미리보기(허용 면적 vs 토지 면적 → 이내/초과)와 고지 · UV-13 해소 |
| **Q-7 (나)** B는 철거 전 정착면적 + 카드 단위 수도권 → 엔진이 배율 판정 | B 철거 행 «철거된 건축물 종류»·«철거 직전 정착면적(㎡)» · 조건부 수도권 칸(§4.4 · 술어 `housePriorNeedsMetropolitan`) |
| **Q-8 (가)** 9호 유예 유지 + 0792 고지 | 하단 고지 목록에 `HOUSE_EXCEEDED_GRACE_NOTICE` |
| **Q-9** PR 분리 E3d-0 → E3d-1(A) → E3d-2(B) | §14 UI-A(E3d-1 뒤) · UI-B(E3d-2 뒤) |
| **Q-10 (가)** 정착면적 빈칸·0·음수·비수치·정착>토지 **전부 ⑧ 차단**(A·B 공통) · 직접 API는 접힘(400 없음) | §7 H9 · parity 격자에서 **⑧ 단독 차단 / ⑫ 접힘(200)** 구분 · 탈출구 = 이력 질문 «모름»(안내 문구에 반영) |
| **Q-11 (나)** A도 `houseFootprintBefore` 숫자 입력, **`houseWithinLimitBefore` 3지선다 폐기** | **v1 UQ-11 대체** — 철거 행 «철거 직전 주택 정착면적(㎡)» `DecimalInput`. ①③④⑫ 칸 이름 교체 |
| **Q-12 (가)** 종류 «그 밖» 우회 현행 유지 + `NBL_STATE_HISTORY_BUILDING_KIND_HINT_NOTICE` | B 철거 행 종류 카드 하단 안내(§4.4) |
| **Q-3 (가) · Q-6 필수(⑧만) · UQ-1~UQ-10** 추천안 승인 | §12에 «결정» 현황 표 |

---

## 0. 한눈에

| 항목 | 내용 |
|---|---|
| 문제 | **(A)** 주택부수토지(`nblLandType = "housing_site"`) 카드에는 **소유기간 중 주택이 없던 기간(나대지)을 받는 칸이 없다.** 배율 이내면 엔진이 소유기간 전체를 사업용으로 본다(`housing-land.ts:111-141` `effectiveBusinessDays = totalOwnershipDays` · `periodEvaluation.basis = "not_judged"` `:35`). 그래서 «나대지로 오래 보유하다 양도 직전 주택을 지은» 토지가 현행 사업용이다(§1.3 probe A: 취득 2014-01-01 · 양도 2024-06-30 · 배율 이내 → **세액 198,210,000 · 사업용 3,832/3,832 · `not_judged`** — 엔진 계획서 M15 «현행 198,210,000»과 일치). **(B)** 주택을 **철거하고 나대지로 양도**하면 기타토지 카드의 철거 행은 «철거 직전 재산세 **토지** 구분»만 받는데 주택은 그 구분이 아니라 모름·종합합산이면 과대(N 253,960,000 — §1.3 B probe 실측), 별도합산 등으로 **위장해야만** 사업용이 된다(엔진 §2.2·B19). 기타토지는 같은 사실을 이력 질문으로 받는다(U1~E3-①·1b) |
| **UI 추천 모델** | **(H1) 기타토지 «소유기간 중 건축물 이력» 섹션을 `variant`로 재사용한다.** **A**: 주택부수토지 카드 맨 아래(정착면적·배율 안내 다음)에 `variant="housing"` — 필수 3지선다 → `changed`이면 사건 행(**주택 신축 · 주택 멸실·철거·붕괴 2종**), **철거 행에 «철거 직전 주택 정착면적(㎡)»**(Q-11 (나)). **B**: 기타토지 카드의 기존 이력 섹션 철거 행에 «철거된 건축물 종류(주택/그 밖)» + 주택이면 «철거 직전 주택 정착면적(㎡)» + 조건부 «수도권 여부»(주·상·공일 때만) — 「철거 직전 재산세 구분」은 «그 밖»일 때만 |
| 추천 근거 3줄 | ① 같은 «사건 → 일 단위 구간» 모델(통합 v3 · V-1)이라 입력 개념이 새로 늘지 않는다 — 기타토지 사용자가 이미 아는 질문이다 ② 기타토지 키(`nblOtherStateHistoryMode`·`nblOtherStateEvents`)를 **그대로 재사용**하면 최상위 키의 ①②③⑫ 변경 0(새 중첩 칸 1개만 추가) · 침묵 strip 위험 최소(UQ-8) — 단 «지목이 다른데 술어가 어긋나는» 위험이 새로 생겨 **④⑤⑧이 같은 단일 술어를 부르게 한다**(§5) ③ 「미입력 ≠ 미해당」 — 현행(`not_judged`)은 나대지 기간을 사업용으로 보는 쪽이라 질문을 비워 두면 조용히 한쪽 방향이다(UQ-1 필수 질문) |
| 새 입력 칸 | **중첩 칸 2개** — 철거 행의 `houseFootprintBefore`(A·B 공용 — 철거 직전 주택 정착면적 ㎡) · `buildingKindBefore`(B 전용 — `"house"` / `""`·부재 = 그 밖 = 현행). **최상위 칸 0**(수도권은 기존 `nblIsMetropolitanArea` — B에서 조건부 노출). v1의 `houseWithinLimitBefore`(3지선다)는 **폐기**(Q-11 (나)). 새 칸이 **중첩 칸(사건 행 안)** 이라 ⑫ 행 스키마에서 빠지면 침묵 strip(TS 미감지 — §1.3 B probe: 현행 Zod에 이 키를 보내도 200 + 효과 0) |
| 가장 큰 위험 | ① **엔진 계획서가 소비표 기존 열(`housing.stateHistory = true`)을 넓히는 안이라 이 위험은 가정이 아니라 일정이다** — ④⑫⑭는 `consumesStateHistory`로 자동으로 넓어지는데 ⑧은 `validateNblOtherLand` 안(`other_land` 한정)이라 안 넓어진다. §1.3 flip probe: ⑧ 통과 · ⑫ 400(「changed + 사건 0건」 · 「빈 행」 2행). E3-②에서 «⑧이 엔진 술어를 직접 부르지 않아 의제 조합에서 ⑧ 통과 → 엔진 수입 0 판정»이 났던 것과 같은 족속의 결함 ② **기존 술어 `nblOtherStateHistoryApplies`는 `!nblOtherUseParcels`(기타토지 전용 칸)를 읽는다**(probe D5 실측) ③ **새 중첩 칸 `houseFootprintBefore`·`buildingKindBefore`가 ⑫ 행 스키마·③ 정규화·④ 와이어 어디서든 빠지면 침묵 소실** — 정착면적이 엔진에 안 닿으면 «모름»으로 접혀 과거 주택 구간이 비사업용이 된다 ④ **B의 수도권 값이 other_land에서 ④(`non-business-land-request.ts:165`)·⑭(`form-mapper.ts:155`)에서 침묵으로 버려진다**(§1.3 B probe: 현행 ④가 other_land의 `nblIsMetropolitanArea: "no"`를 `""`로 비운다 — 엔진 T-7) → 수도권 밖 사용자가 보수적 3배로 계산돼 «초과»로 접힌다 ⑤ 주택이 아닌 건축물(상가 등)이 있던 기간은 A 질문이 표현할 수 없다(UQ-5) ⑥ 배율 초과 **양도일 현재** 토지는 이력을 반영하지 않는다(통합 Q-8 (가) — UQ-7) |
| ⑥ | **변경 없음 — 이번 세션 실측**: `git grep -n -i "nbl\|NonBusiness" lib/stores/calc-wizard-store.ts lib/stores/transfer-per-asset-summary-helpers.ts components/calc/shared/WizardSidebar.tsx` = 타입 import 2줄(`NblBusinessUsePeriod`·`NblGracePeriodInput`)뿐 |
| ⑫ | **행 스키마 `nblStateEventRawSchema`(`transfer-tax-schema-nbl.ts:57-65`)에 `buildingKindBefore`(enum `["house"]` + `""`) · `houseFootprintBefore`(string) 추가 필수**(엔진 §5 ⑫ — 빠지면 중첩 칸 침묵 strip) + refine: 소비표 게이트 확장 · 주택 전용 `housingStateEventIssue`(D-1·D-2) · B 구조 `houseKindEventIssue`(D-8) — ⑧과 같은 leaf·같은 문구. **정착면적·수도권 규칙은 ⑧만 가진다**(⑫는 거울 없음 — 직접 API는 400 없이 엔진이 `unconfirmed`로 접음 — 엔진 D-16). 최상위 칸 신설 없음 |
| 반전(예상) | 필수 질문 모델(추천)이면 ⑧ 경유 housing 테스트 6파일 12참조(grep — §10)가 후보. **vitest 미실측**(UV-1). 소비표를 넓히면 `nbl-state-history-leaf.test.ts:511-513`·`nbl-state-history-leaf-unreachable.test.ts:95-107`(WIRE-3·4)이 의도된 반전. **`nbl-state-history-gates.anchor.test.ts:36-38`은 UI 술어를 «기타토지 전용»으로 고정하면 불변**(§17 ①). **B는 기존 기타토지 철거 행의 바이트 동일**(`buildingKindBefore` 부재·`""` — 엔진 B8)이라 기타토지 e2e·단위 반전 0 예상 — 단 ④ 수도권 게이트 술어 확장은 `consumesMetropolitanArea` 사용처 anchor를 건드릴 수 있다(§10) |
| 사용자 결정 | **UQ-1~UQ-10 추천안 승인(2026-11-23)** · UQ-11(v1 «배율 이내 3지선다») **Q-11 (나)로 대체** · 엔진 Q-1 (나)·Q-2 (가)·Q-5 (나)·Q-7 (나)·Q-8 (가)·Q-9·Q-10 (가)·Q-12 (가) 결정. **UQ-12 (가) 건너뜀 결정(사용자 결정 2026-11-24) — 남은 미결 없음** |

### 엔진 계획서와 정합한 계약 A-n (엔진 계획서 §번호 = `…e3-3-house-appurtenant.engine.plan.md`)

| # | 계약 | 엔진 계획서 | 상태 | 이 문서가 쓰는 곳 |
|---|---|---|---|---|
| A-1 | 소비표: 엔진은 **기존 열 `housing.stateHistory = true`로 넓히고** `consumesHousingStateHistory(landType)`(= 그룹 housing)를 추가한다 | §5 소비표 · T-3 · V-11 | ⚠ UI 초안은 «새 열»을 요청했으나 **엔진안을 받는다.** 대신 UI의 `nblOtherStateHistoryApplies`를 **기타토지 전용으로 고정**(`consumesStateHistory ∧ ¬consumesHousingStateHistory ∧ ¬nblOtherUseParcels`)해 소비표가 넓어져도 이 술어와 그 진리표 테스트가 변하지 않게 한다 | §5 · §10 |
| A-2 | 입력 키 `nblOtherStateHistoryMode`·`nblOtherStateEvents` 재사용 · 주택 구간 = 사업용(`buildingKind = "house"` — 재산세 구분 미사용 D-3) · 나대지 구간 = E3-1b 선언 재사용(Q-3 (가)) · 마지막 구간(꼬리) = 주택 있음 | §3.2 · §4.2 · D-3 | ✅ | §4 · §8 |
| A-3 | 주택 카드에서 `tax_type_changed` 사건 **차단 — ⑧·⑫ 둘 다**(`housingStateEventIssue` leaf — ⑧과 같은 함수·같은 문구) | D-2 · §5 ⑫′ | ✅ (초안의 «400 또는 무시» 미정이 해소됨) | §7 H4 |
| A-4 | **scope 술어(배율 포함)는 엔진에 없다.** 지목 축만 `consumesHousingStateHistory`가 정하고, 배율 이내 여부는 `judgeHousingLand`의 **런타임 분기**다(초과 → 후처리 미적용 + `changed`일 때 PARTIAL 고지 · Anchor 3) | §4.1 · §6 S1 | ⚠ 초안의 `housingHistoryScope`(배율 포함) 요청 **철회** → ④⑧은 지목 축 술어만, 배율은 표시 전용(UQ-7 (다)) | §5 |
| A-5 | **마지막 건축물 사건 = 신축**이어야 한다(철거로 끝나면 ⑧·⑫ 차단 + «지목을 나대지·잡종지로 바꿔 입력하세요» 안내) | D-1 · §6 X1 | ✅ | §7 H5 |
| A-6 | 사건 검증 문구의 «건축물»→«주택» 변형 | 엔진 D-9: `subject: "building"\|"house"`(기본 `building` = 바이트 동일) · `stateEventSubjectOf(landType)` · `STATE_EVENT_KIND_LABEL_HOUSE` | ✅ (R-3 해소) | §4 · §7 |
| A-7 | echo: 구간 optional 필드 `buildingKind`·`houseOutcome("within"\|"unconfirmed"\|"exceeded")`·**`houseCheck { footprint, multiplier, multiplierDetail, allowedArea, landArea, excessArea }`**(주택 구간만 — 허용 면적 echo). 기타토지 구간은 키 부재 | 엔진 §4.3 7 · §5 타입 행 | ✅ — 결과 표 variant = `intervals.some(iv => iv.buildingKind === "house")`, 허용 면적은 `houseCheck`를 그대로 읽는다(재계산 금지) | §8 |
| A-8 | 고지(§4.5): `…DAYWISE_NO_RULING_NOTICE`(Q-2 — A·B 주택 구간 이력 적용) · `…HOUSING_APPLIED_NOTICE`(A — `NBL_STATE_AT_TRANSFER_APPLIED_NOTICE`를 대체) · `…HOUSE_BEFORE_NOTICE`(A 철거 행·B 공용 — 기존 APPLIED에 **추가**) · `…HOUSE_WITHIN_UNCONFIRMED_NOTICE`(직접 API 접힘) · `…HOUSE_EXCEEDED_NOTICE`(Q-5 (나)) · `…HOUSE_EXCEEDED_GRACE_NOTICE`(Q-8 (가)) · `…HOUSING_NON_HOUSE_BUILDING_NOTICE`(R-6 해소 — A 질문 hint와 같은 상수) · `…BUILDING_KIND_HINT_NOTICE`(Q-12 (가) — B 종류 칸) · `unknown`은 기존 `…UNKNOWN_NOTICE` · 초과 + `changed`는 기존 PARTIAL. 기존 문구 바이트 불변 | 엔진 §4.5 | ✅ | §8 |
| A-9 | 배율 초과 = 현행 판정·세액·echo 그대로 + PARTIAL 고지(`changed`일 때) | §4.3 · Anchor 3 · S1 | ✅ | UQ-7 · X12 |
| A-10 | housing + `""`·`unchanged` = 결과 객체 바이트 동일(Anchor 2) / `unknown` = 고지 1줄 | §0 하위호환 · Anchor 2 | ✅ | §7.1 B3·B4 |
| A-11 | **새 중첩 칸**(철거 행): `houseFootprintBefore`(문자열 ㎡ — **A·B 공용**) · `buildingKindBefore`(B — `"house"`/`""`). `houseWithinLimitBefore` **폐기**(Q-11 (나)). ⑫ 행 스키마 · ⑭ 운반(주택 구간을 닫는 철거 행 `eventClosesHouseInterval`에서만 — 숨은 stale 미운반 · **그 행의 `propertyTaxTypeBefore`는 운반하지 않는다**) | 엔진 §3.4 · §5 ⑫⑭ · T-5 | ✅ | §4 · §6 · §7 |
| A-12 | ⑭: 주택이면 `tailHasBuilding = true`(주택 카드에 «건축물 있음» 토글이 없다) · UI ④가 `nblOtherHasBuilding`을 `true`로 덮어 싣는 것과 같은 값 | T-4 · Y-9 | ✅ | §5 · §6 ④ |
| **A-13** | **B 술어·leaf**(UI가 ④⑤⑧에서 **직접 호출** — 자체 조건 금지): `housePriorNeedsMetropolitan(landType, zoneType, events)`(기타토지 ∧ `buildingKindBefore = house` 철거 행 ∧ 주·상·공 — 소비표 `other_land.metropolitanArea`는 false 유지) · `eventClosesHouseInterval(events, index, tailKind)`(주택 구간을 닫는 철거 행) · `houseFootprintIssue(...)`(⑧ 공용 — 비수치·0·음수·정착>토지) · `houseKindEventIssue`(B 구조) · 배율 helper `judgeHousingLimit`(`housing-limit.ts` — 표시 전용 미리보기도 이 함수) | 엔진 §3.4 D-12·D-13 · §5 leaf 행 | ✅ — UI 술어는 **`stateHistoryWireFields`가 만든 wire events를 인자로** 넘긴다(모드가 `changed`가 아니면 events `[]` → 술어 거짓 — §5 · §9 X27) | §5 · §7 |
| **A-14** | **⑧만 가진 규칙 vs ⑫ 접힘**: 정착면적(빈칸·0·음수·비수치·정착>토지) · 수도권(`housePriorNeedsMetropolitan` 참인데 미선택·«미확인»)은 ⑧이 차단하고 ⑫에는 거울이 없다 → 직접 API는 400 없이 엔진이 `unconfirmed` 접힘 + 보수적 수도권 3배 기본값 + 기존 경고(엔진 D-16) | 엔진 §5 ⑫′ · D-16 | ✅ — **UI 통과 ↔ API 400 모순 없음**(⑫가 ⑧보다 엄격하지 않다 — §7 격자 «⑫ 상태» 열) | §7 |

---

## 1. 현행 사실 (실측)

### 1.1 입력 칸 지도 — 주택부수토지가 지금 받는 것

| 위치 | 내용 | 비고 |
|---|---|---|
| `NblSectionContainer.tsx:156-172` | 지목 선택(`LAND_TYPE_OPTIONS`, 값 `housing_site` = «주택 부수 토지» `:41`) | 기타토지(`other_land`)와 같은 지목 선택 |
| `NblSectionContainer.tsx:269` | `HousingLandDetailSection` 마운트(`asset.nblLandType === "housing_site"`) | 지목별 세부 블록 |
| `HousingLandDetailSection.tsx:38` | `MetropolitanAreaField`(수도권 여부) | ⑧ 필수 `transfer-tax-validate-nbl.ts:198-204` |
| `HousingLandDetailSection.tsx:40-50` | **주택 정착면적**(㎡) | ⑧ 필수 `transfer-tax-validate-nbl.ts:206-216`(엔진 `housing-land.ts:49-70` «정착면적 미입력» 전량 비사업용) |
| `HousingLandDetailSection.tsx:52-60` | 배율 안내 배지(양도일 2022.1.1. 전후 분기) | 표시 전용 |
| `NblSectionContainer.tsx:295-298` | 부득이한 사유 유예 섹션(`GracePeriodSection` — 주택도 `consumesGracePeriods` true) | 초과분에 반영(NBL2611-D1) |
| `NblSectionContainer.tsx:300-305` | 양도일 의제 섹션 — `isDeemedTransferApplicable(housing)` = false라 **주택에서는 안 뜬다** | `land-category.ts:120` `deemedTransfer: false` |

**주택부수토지에는 이력 질문이 없다**(`nblOtherStateHistoryApplies`는 `consumesStateHistory(landType)`가 true인 지목만 — `nbl-other-state-history-scope.ts:29-31`, 소비표 `land-category.ts:116-125`에서 housing = `stateHistory: false`). 기타토지는 `OtherLandDetailSection.tsx:166`이 같은 술어로 `OtherLandStateHistorySection`(355줄)을 맨 위에 마운트한다.

**이 계획이 다루지 않는 «주택 부수토지» 경로 하나(혼동 주의)**: 주택을 양도하면서 부수토지가 배율을 넘으면 엔진이 **초과분을 자동으로 비사업용 토지 카드(`__excess`)** 로 만든다(`AssetSectionExtras.tsx:68-92` — 사용자가 정밀판정을 켜지 않고 `landNature: "appurtenant"`; 엔진 `lib/tax-engine/appurtenant-excess-deeming.ts:86-95` `housingExcessGraceOutcome` — 빈 사업기간 `[]` + 유예만). 그 경로에는 이력 입력이 없고 이번 범위도 아니다. M15의 현행값(198,210,000 = 정밀판정 `housing_site` 토지 카드, §1.3 probe A와 일치)은 **정밀판정을 켠 토지 카드**를 가리킨다.

### 1.2 ④⑤⑧⑫⑭ 현행 지도 — housing에 대해 어디가 열려 있고 어디가 닫혀 있나

| 층 | 현행 | 근거 |
|---|---|---|
| ③ 정규화 | `migrateNblStateHistory`가 모드·행을 지목과 무관하게 정리 — **housing 자산의 값도 정상 복원** | `calc-wizard-asset-migrate-nbl.ts:47-72` |
| ① ② 키 | `nblOtherHasBuilding`(false) · `nblOtherStateHistoryMode`(`""`) · `nblOtherStateEvents`(`[]`) — **지목 구분 없는 평면 키** | `calc-wizard-asset-nbl-other.ts:98-105` · `calc-wizard-asset-factory.ts:378-380` · `calc-wizard-asset-nbl.ts:179-181` |
| ④ 전송 | `buildNonBusinessLandRaw`가 `nbl*` prefix-pick 후 `...stateHistoryWireFields(asset)`로 덮어쓴다. **술어가 거짓이면 `""`·`[]`** — housing은 지금 항상 거짓이라 **housing의 stale 이력은 매번 비워서 보낸다**(probe B) | `non-business-land-request.ts:159,176-177` · `nbl-other-state-history-scope.ts:88-99` |
| ⑤ 화면 | housing 이력 칸 없음 | `HousingLandDetailSection.tsx`(63줄) |
| ⑧ 검증 | 이력 검증은 `validateNblOtherLand`(= `asset.nblLandType !== "other_land"`이면 즉시 null) **안에서만** 호출된다 → housing 이력 규칙 0 | `transfer-tax-validate-nbl-other.ts:23-29` · 호출 `transfer-tax-validate-nbl.ts:260-264` · 정의 `transfer-tax-validate-nbl-state-history.ts:46-62` |
| ⑫ Zod refine | 이력 행 검증이 `consumesStateHistory(landType) && mode === "changed"`로 게이트 — housing은 지금 false라 **직접 API에 `changed`+사건이 와도 무시**(probe C: 200) | `transfer-tax-schema-nbl-refines.ts:108-112` |
| ⑭ 매퍼 | `buildLandStateHistory`가 `consumesStateHistory(landType)`이 아니면 `undefined` | `form-mapper-helpers.ts:311-312` · `form-mapper.ts:174,197` |
| 엔진 | `judgeHousingLand`는 `landStateHistory`를 읽지 않는다 | `housing-land.ts:37-184` |

### 1.3 vitest probe 실측 (이 세션 · throwaway — 파일은 삭제함)

공통 시료: 토지 1,000㎡ · 취득 2014-01-01 · 양도 2024-06-30 · 취득가 3억 · 양도가 10억 · 일반주거 · 수도권 · 정착면적 400㎡(3배 = 1,200㎡ ≥ 1,000㎡ → 배율 이내) · 정밀판정 ON. 경로: 폼 → ⑧ 전 단계 → ④ 본문 → 실제 route POST(⑫⑭) → 엔진.

| # | 입력 | ⑧ 이슈 | ④ 와이어(mode · 사건 수) | 상태 | 판정 |
|---|---|---|---|---|---|
| A | housing · 질문 `""`(현행 기본) | 없음 | `""` · 0 | 200 | 비사업용 **아님** · 3,832/3,832일 · `periodEvaluation.basis = "not_judged"` · **세액 198,210,000** |
| B | housing + 폼에 stale `changed` + 신축 2023-06-01 | 없음 | **`""` · 0**(④가 비움) | 200 | A와 같음 |
| C | housing + **직접 API**에 `changed` + 신축 2023-06-01 | — | `changed` · 1 | 200 | A와 같음(⑫가 안 막고 엔진이 안 읽는다) |

**소비표 확장 가정 모의**(`consumesStateHistory`가 `housing_site`에서 true라고 `vi.mock`으로 가정 — 제품 코드는 건드리지 않았다. 이 모의는 «엔진이 열 하나만 켜면 UI가 어떻게 되는가»를 보이는 것이며 구현 후 재측정한다 — UV-3):

| # | 입력 | `nblOtherStateHistoryApplies` | ⑧ 이슈 | ④ 와이어 | ⑫ 상태 |
|---|---|---|---|---|---|
| D1 | 질문 `""` | true | 없음(**질문 필수 규칙이 housing에 없다**) | `""` · 0 | 200 |
| D2 | `changed` + 사건 0건 | true | **없음** | `changed` · 0 | **400** `nblOtherStateEvents`(«…사건이 없습니다») |
| D3 | `changed` + 빈 행(종류·날짜 없음) | true | **없음** | `changed` · 1 | **400** `nblOtherStateEvents.0.kind` |
| D4 | `changed` + **멸실만**(양도일 현재 주택 없음 모순) | true | 없음 | `changed` · 1 · `nblOtherHasBuilding: false` | 200(엔진은 이력을 아직 안 읽는다) |
| D5 | **stale 연접 다필지 ON**(기타토지 칸) + `changed` + 신축 | **false** | 없음 | **`""` · 0(④가 비움)** | 200 |
| D6 | `changed` + 신축(정상) | true | 없음 | `changed` · 1 · `nblOtherHasBuilding: true` | 200 |

→ D2·D3: **⑧ 통과 ↔ ⑫ 400**(UI 통과 → API 거절 모순). D5: 기타토지 전용 칸(`nblOtherUseParcels`)이 주택 질문의 존재 여부를 바꾼다. D4: 마지막 사건이 멸실이어도 아무 층도 막지 않는다. **세 층(④⑧⑫)이 같은 «적용 술어»를 직접 부르지 않으면 이 어긋남이 그대로 구현된다.**

**의제 교차**(housing + stale 양도일 의제 사유 `auction` · 2023-01-01):

| 입력 | `isDeemedTransferApplicable(housing)` | ⑧ | ④ 와이어 `nblDeemedTransferReason` | 판정·세액 |
|---|---|---|---|---|
| 의제 없음 | false | 없음 | `none` | 3,832/3,832 · 198,210,000 |
| stale 의제 | false(사유는 `hasDeemedTransferReason` true) | 없음 | **`none`**(④가 덮는다) | **같음** |

→ 주택은 의제(§168의14②)를 읽지 않고 ④가 stale 사유를 이미 무력화한다. **이력 술어에 «의제» 분기를 두지 않는다**(E3-②의 `deemed` scope는 기타토지 전용 — 주택에 복사 금지).

**B 경로 현행 실측**(v2 추가 — 기타토지 1,000㎡ · 일반주거 · 취득 2014-01-01 · 양도 2024-01-01 · 정밀판정 ON · 재산세 구분 종합합산 · 질문 `changed` + 사건 `신축 2014-01-02 → 철거 2021-01-01`(철거 직전 구분 «모름») · 폼에 `nblIsMetropolitanArea: "no"`):

| # | 입력 | ④ 와이어 | 상태 | 판정 |
|---|---|---|---|---|
| BP1 | 위 입력 그대로(현행 B 위장 없음) | **`nblIsMetropolitanArea: ""`**(폼 `"no"`를 ④가 비움 — `non-business-land-request.ts:165` `metro: consumesMetropolitanArea(other_land) = false`) · 철거 행 `{kind, date, propertyTaxTypeBefore: ""}` | 200 | **비사업용 · eff 0 · 세액 253,960,000** — 엔진 계획서 B0·B1 «현행 N»과 일치 |
| BP2 | **직접 API**로 철거 행에 `buildingKindBefore: "house"` · `houseFootprintBefore: "200"` 추가(현행 Zod) | 위 키가 body에 실림 | **200**(Zod가 조용히 strip) | BP1과 같음 — **중첩 칸이 ⑫에 없으면 아무 일도 일어나지 않는다**(침묵 strip 실측) |

→ BP1: B 수도권 값은 **현행 ④에서 이미 비워진다**(엔진 T-7의 UI 쪽 입구 — `housePriorNeedsMetropolitan` 없이는 B 입력이 서버에 닿지 않는다). BP2: 새 중첩 칸의 ⑫ 행 스키마 추가를 빠뜨리면 anchor 없이는 잡히지 않는다.

### 1.4 법령·엔진 전제 — 이 계획이 단정하지 않는 것

- 주택 구간을 «사업용»으로, 나대지 구간을 «비사업용 판정 대상»으로 보는 법적 구조(법 §104의3①4호 나대지 기간 → ①5호 배율 이내)는 **엔진 계획서의 몫**이다(M15 행 `법 §104의3①4호 → ①5호`). UI는 문구를 새로 짓지 않고 엔진 상수(고지)·leaf 라벨을 읽는다. 법령 본문은 이 세션에 조회하지 않았다 — **확인 필요**(UV-6).
- 「사용승인일(준공일)」과 «주택으로 보는 첫날»이 다를 수 있다는 한정은 기타토지 `BUILT_DATE_HINT`(`OtherLandStateHistorySection.tsx:73-74`)가 이미 같은 형태로 갖고 있다 — 주택에서도 단정하지 않고 «확인 필요»로 남긴다(UV-7).

### 1.5 현행의 한계 (이 계획의 제약)

| 한계 | 근거 | 영향 |
|---|---|---|
| 상태 이력 소비표 열이 other_land 전용(현행) | `land-category.ts:116-125,143-145` | **엔진 계획서는 이 열을 housing까지 넓히는 안**(엔진 §5 소비표) → §1.3 D2·D3·D5가 현실이 된다. UI는 «기타토지 전용» 술어를 따로 고정(§5 · A-1) |
| 사건 leaf 문구가 «건축물» 고정 | `nbl-validation-messages.ts`(`stateEvent*Message` — 같은 leaf를 ⑧·⑫가 공유) | 행 카드 제목을 «주택 사건»으로 바꾸면 오류 문구(«건축물 사건 N번째 행»)와 어긋난다(UQ-4 · A-6) |
| `nblOtherHasBuilding`은 기타토지 토글값 | `calc-wizard-asset-nbl-other.ts:98` · `stateEventWireRow(events, i, asset.nblOtherHasBuilding)`(`nbl-other-state-history-scope.ts:72-85`) · 미리보기 `nbl-other-state-history-preview.ts:70-73` | housing에서 이 값을 «양도일 현재 주택 있음»으로 읽으면 안 된다(기본 false · 기타토지 stale) — 주택은 **항상 true**(A-5) |
| 구간표·미리보기 열 이름이 건축물·재산세 구분 | `NblStateHistoryPeriodTable.tsx` · `OtherLandStateHistorySection.tsx:309-337` | 주택용 열 라벨 variant 필요(UQ-9 · A-7) |

---

## 2. 사용자 시나리오 — 무엇을 알고 무엇을 모르는가

### 2.1 시나리오

| # | 상황 | 사용자가 아는 것 | 입력(추천) | 결과 방향(엔진 계획서 시료 인용 — **이 세션 재측정 아님**) |
|---|---|---|---|---|
| H1 | **M15** — 나대지로 보유하다 양도 직전 주택 신축(준공 2023-06-01 · 배율 이내) | 준공(사용승인)일 | 질문 «바뀐 적 있음» → 사건 1행 `주택 신축 2023-06-01` | 현행 사업용 198,210,000(§1.3 probe A 실측) → 엔진 계획서 «M6과 같은 판정» = 비사업용 쪽(세액은 엔진 케이스 표 따름 — UV-4) |
| H2 | 오래된 주택을 철거(나대지 기간)하고 신주택 신축 | 철거일·신축일 · 철거 전 주택 정착면적 | 사건 2행 `주택 멸실·철거 …`(+ «철거 직전 주택 정착면적(㎡)») → `주택 신축 …` | 엔진 케이스 H3c·H3e(철거 행 선언 이내·모름) 따름 |
| H3 | 취득 때부터 주택이 있었고 지금도 있다 | — | 질문 «바뀐 적 없음» | 현행과 byte-identical + `unchanged` 와이어 |
| H4 | 이력을 모른다 | — | 질문 «모름» | 현행 + 확인 필요 고지(엔진 상수) |
| H5 | 배율을 초과하는 면적이 있다 | 정착면적·용도지역 | UQ-7 (다) 추천: 질문은 그대로 + 안내 1줄 «초과면 이력은 반영하지 않습니다» | 방침 Q-3a (나)·통합 Q-8 (가) 유지 — 초과분은 유예만 반영 |
| H6 | 취득 때 **상가 건물**이 있었고 철거 후 주택을 지었다(주택 아닌 건축물 구간) | 철거일·신축일 | **이 질문으로 표현 불가**(UQ-5) — «모름» 또는 사건 입력 후 고지 | 엔진이 «주택 없는 구간 = 나대지»로 읽으면 과대 방향 → 고지 필수 |
| H7 | 같은 땅을 지분으로 나눠 취득(축 B) | 지분별 취득일 | 첫 카드에만 질문(둘째 이후 카드는 첫 카드 상속) | 엔진이 지분별 소유기간으로 사건 replay(기타토지와 같음 — 확인 필요) |
| H8 | 이월과세 증여로 취득 | 증여자 취득일 | 질문의 하한 = 증여자 취득일(`nblAcquisitionDateOf`) | 기타토지와 같음 |
| H9 | 기타토지에서 입력하던 이력이 남은 채 지목을 «주택 부수 토지»로 바꿨다 | — | 질문 칸에 이전 값이 그대로 보인다. 주택에 허용되지 않는 행(재산세 구분 변경)은 ⑧이 행 단위로 막는다 | 침묵 소실 금지 — 화면에 보이는 행이 ⑧ 대상(§9 H9) |
| **H10** | **(B) 주택을 철거하고 나대지로 양도** — 주택 2014-01-02 ~ 철거 2021-01-01 · 철거 전 정착면적 200㎡ · 지금은 나대지 | 철거일 · 철거된 건축물이 주택이었다는 사실 · 철거 직전 정착면적(건축물대장 말소본) | **기타토지 카드**의 이력 질문 «바뀐 적 있음» → 사건 `신축` → `철거`(종류 «주택» · 정착면적 200) → 수도권 여부(주·상·공일 때만) | 현행 N 253,960,000(§1.3 BP1) → 엔진 오라클 B1 **사업용 198,210,000**(주택 구간 사업용 · 비사업 1,095 — 엔진 §6.2 B1, 이 세션 재측정 아님) |
| H11 | (B) 철거 전 정착면적을 **모른다** | — | 이력 질문 **«모름»**(현행 판정 + 확인 필요 — 엔진 D-17). «철거된 건축물 종류 = 그 밖»으로 ⑧을 피하는 길은 안내로 막지 않는다(Q-12 (가)) | 현행 |
| H12 | (B) 겸용주택(주택 + 상가 1동)을 철거 | — | **«주택»을 고르지 않는다**(안내 — 엔진 D-5 · V-17). «그 밖»으로 입력 | 현행(겸용 안분은 범위 밖) |
| H13 | (B) 철거 전 정착면적이 배율을 **초과**(허용 면적 < 토지 면적) | 정착면적·용도지역·수도권 | 입력 그대로 — 미리보기가 «초과 — 그 구간을 비사업용으로 봅니다»를 보인다(Q-5 (나)) | 엔진 B7: N(모름과 같은 수 — «초과»가 «모름»보다 유리하지 않다) |

### 2.2 알고 모르는 것 → 칸 설계 원칙

- **아는 것**: 준공(사용승인)일·철거일(건축물대장, 철거 후 멸실신고).
- **모르거나 틀리기 쉬운 것**: ① 사용승인일 vs 재산세·주택으로 보는 첫날(UV-7) ② **주택이 아닌 건축물이 있던 기간**을 «주택 없음»으로 입력하는 실수(UQ-5 — 나대지로 계산돼 과대 방향) ③ 증축·일부 철거·정착면적 변동은 이 질문이 다루지 않는다(통합 V-5 — 기타토지와 같은 한정) ④ 배율 초과분은 이력 반영 대상이 아니다(UQ-7).
- **입력 부담**: 질문 1개 + 사건 행당 종류·날짜 2칸. 일수·구간·비율은 입력받지 않고 미리보기가 보인다(기타토지와 동일).
- 모르는 것은 **막지 않고 «모름»으로 두게** 한다(현행 + 확인 필요 — 통합 Q-6 재사용, 재질문 아님).

---

## 3. 입력 모델 후보 비교 (UQ-1 · UQ-3 · UQ-8)

| 후보 | 내용 |
|---|---|
| **(H1) 추천** | 기타토지 이력 섹션을 `variant="housing"`으로 재사용 — 필수 3지선다 + 사건 행(2종), 기타토지 키 재사용 |
| (H2) | ToggleCard 기본 OFF(E3-② 방식) — OFF = 현행 byte-identical |
| (H3) | 질문 없이 «주택 신축일» 날짜 1칸만(M15만 표현) |
| (H4) | 새 컴포넌트 `HousingStateHistorySection.tsx`를 복제해 쓴다 |

| 비교 | (H1) 필수 질문·섹션 재사용 | (H2) 토글 OFF | (H3) 날짜 1칸 | (H4) 복제 |
|---|---|---|---|---|
| 재산세 구분·철거 후 신축(H2 시나리오) 표현 | ✅ 사건 2종 | ✅ | ❌ 신축 1건뿐 | ✅ |
| 「미입력 ≠ 미해당」 | ✅ 미선택 ⑧ 차단 | ❌ OFF 기본 = 조용히 현행(사업용 쪽) — 기타토지에서 이미 «미선택 차단»을 승인(`nbl-other-land-state-history.ui.plan.md:470` UQ-1 승인) | ❌ | 질문 방식 따름 |
| 기존 세션·테스트 반전 | housing 경유 ⑧ 테스트 일부(UV-1) | 0 | 0~소 | (H1) 같음 |
| 입력 개념 | 기타토지와 동일(학습 비용 0) | 다름(토글) | 다름 | 동일 |
| 코드 중복 | 섹션 355줄에 variant 분기 ≈ +50줄 | 새 위젯 | 새 위젯 | **355줄 복제** — 두 곳 수정 필요 |
| ⑧ 규칙 | 질문 필수 + 사건 leaf + 주택 전용 2규칙 | 토글 ON 때만 | 날짜 1규칙 | (H1) 같음 |

**UI 관점 추천 = (H1)**, 근거: (H2)는 기타토지에서 «토글은 모델이 아니라 선택 입력일 때»만 쓰였다 — E3-②는 영위 기간(추가 사실)이라 토글이 맞았고, 이번 질문은 U1과 **같은 사실 질문**(건축물 유무가 바뀐 적 있는가)이라 같은 3지선다가 맞다. (H4)는 800줄 정책보다 «두 곳 동기 수정» 위험이 크다(`OtherLandBareIntervalFields` 선례처럼 하위 조각만 공유하는 (다) 안은 UQ-3).

---

## 4. 화면 스펙 ⑤ (추천 (H1))

### 4.1 레이아웃 — A (주택 부속토지 카드 — 변경 부분)

```
┌ 주택 부속토지 세부 정보 ───────────────────── [§168의12 배율] ┐   ← 기존 SectionHeader(불변)
│ 수도권 여부 …                                                   │   ← 기존 MetropolitanAreaField(불변 — 철거 행 판정도 이 값을 쓴다)
│ 주택 정착면적 [   ] ㎡   (hint — 불변)                          │   ← 기존
│ ┌ blue 배율 안내(불변) ─────────────────────────────────────┐   │
│ └────────────────────────────────────────────────────────────┘   │
│ ★ 소유기간 중 주택 신축·멸실 이력                (신규 — amber)    │   ← 이력 섹션(variant="housing")
│ ┌ 소유기간 중 이 토지 위에 주택이 새로 지어지거나 없어진 적이 있습니까? [필수] ┐
│ │ ( ) 바뀐 적 없습니다 ( ) 바뀐 적 있습니다 ( ) 모름                         │   ← RadioCardGroup amber
│ └──────────────────────────────────────────────────────────────┘
│ [바뀐 적 있음] ① 주택 사건  종류 (•)주택 신축 ( )주택 멸실·철거·붕괴  [삭제] │   ← ToneCard amber ①②…
│                 사건일 [____]                                              │
│   (신축 행) 신축 직전 나대지 기간의 재산세 구분·근거 …(UQ-6 — E3-1b 카드 재사용)   │
│   (멸실 행) 철거 직전 주택 정착면적 [____] ㎡   hint(정착면적 정의 + «모르면 위 질문의 «모름»») │  ← 신규 DecimalInput(Q-11 (나))
│             허용 면적 N㎡(정착면적 × M배) · 토지 면적 L㎡ → 이내 / 초과(그 구간 비사업용)  │  ← 표시 전용 미리보기
│               [+ 사건 추가]                                                │
│               양도일 현재 주택: 있음 (주택 부속토지 — 지목에서 정함)          │   ← 읽기 전용 한 줄
│               ┌ sky: 이 이력으로 나뉜 소유기간 ─────────────────┐          │
│               │ 구간 | 일수 | 주택 | 토지 구분 | 사업용 토지 요건 │          │
│               └──────────────────────────────────────────────┘          │
│               ┌ amber 고지(엔진 상수) ─────────────────────────┐          │
│ (이어서 NblSectionContainer) 부득이한 사유 유예기간 …               │   ← 기존(불변)
└───────────────────────────────────────────────────────────────────┘
```

### 4.2 위젯 상세 (A)

| 항목 | 내용 |
|---|---|
| 마운트 | `NblSectionContainer.tsx:269`의 `HousingLandDetailSection`이 내부에서 이력 섹션을 그린다(배율 안내 `:52-60` 뒤). 마운트 조건 = §5 지목 축 단일 술어(`nblStateHistoryApplies`)가 housing. **배율 이내 여부는 마운트 조건이 아니다**(런타임 분기 — UQ-7) |
| 위치 근거 | 계산 순서: ① 정착면적·수도권·용도지역 → 배율·인정면적(엔진 `housing-land.ts:94-109`) → ② **기간(이력)** → ③ 유예(`NblSectionContainer.tsx:295`). 질문은 정착면적·배율 뒤·유예 앞이다(기타토지는 맨 위인 이유가 «아래 모든 건축물 칸을 지배»하기 때문이라 주택과 다르다 — UQ-2). 철거 행 정착면적은 **그 행 안**(철거 행 영향 칸 직전 = 종류·날짜 직후) |
| 재사용 | `OtherLandStateHistorySection`에 `variant: "other" \| "housing"` prop(기본 `other` = 현행 byte-identical). housing에서 바뀌는 것: ① 질문 문구·`MODE_OPTIONS` description(건축물→주택) ② `KIND_OPTIONS` 2종(`tax_type_changed` 제외 — 엔진 D-2) ③ 행 카드 제목 «주택 사건»(`title`) ④ 날짜 hint 2종 ⑤ **철거 행: «철거 직전 재산세 구분» 카드(`carriesBefore` `:239-268`)를 그리지 않고 «철거 직전 주택 정착면적(㎡)» 카드로 대체**(Q-11 (나)) ⑥ **신축 행: 나대지 선언 카드(`OtherLandBareIntervalFields`)는 기타토지와 같게 노출**(Q-3 (가) — UQ-6) ⑦ 미리보기 열 라벨 ⑧ 양도일 현재 줄(`:299-305`)은 «주택: 있음(지목에서 정함)»으로 고정 ⑨ 의제 안내(`:172-176`)는 **그리지 않는다**(주택은 의제 비적용 — §1.3) ⑩ 고지: 엔진 주택용 상수(A-8) ⑪ 질문 아래 **배율 안내 한 줄**(UQ-7 (다)) |
| 철거 행 «정착면적» 카드 | `FieldCard`(label «철거 직전 주택 정착면적» · unit `㎡`) + `DecimalInput`(`value={ev.houseFootprintBefore ?? ""}`) — 표시 fallback 없음(빈칸은 빈칸 · ⑧이 차단). hint: 기존 `FOOTPRINT_DEFINITION`(`lib/calc/footprint-definition-copy.ts:17`) + «**모르면 위 질문에서 「모름」을 선택하세요**»(엔진 D-17 — 탈출구 안내, Q-10) · placeholder 없음. 칸 아래 **표시 전용 미리보기**: 엔진 helper `judgeHousingLimit`(`housing-limit.ts` — `getHousingMultiplier`·`areaTimes`·`judgeAreaLimit`)를 직접 호출해 «허용 면적 N㎡(정착면적 × M배) · 토지 면적 L㎡ → 이내 / **초과 — 이 구간 전체를 비사업용으로 봅니다**»(Q-5 (나) — 엔진 `HOUSE_EXCEEDED_NOTICE`와 같은 뜻을 고지 상수로 읽는다). 정착면적 > 토지 면적이면 «토지 면적보다 큽니다» 오류 표시(⑧ H9와 같은 leaf 문구). 입력이 비면 미리보기 없음 |
| 안 바뀌는 것 | `RadioCardGroup`·`ToneCard`·`FieldCard`·`DateInput`·테스트 id(기타토지와 지목이 동시에 두 개 뜰 수 없다) · `changeMode`/`patchEvent`/`addEvent`/`removeEvent` 핸들러(이벤트 시점 쓰기) · 종류 전환 시 행 재생성(`OtherLandStateHistorySection.tsx:214`)으로 `houseFootprintBefore`·선언 키를 함께 리셋 |
| 파일 크기 | 355 → ≈ 420줄(A) → B까지 ≈ 480줄 예상(미측정). **B 추가로 variant 분기가 3곳을 넘으면 행 카드 조각을 `OtherLandStateEventRow.tsx`로 추출**(UQ-3 (가)→(다) 전환 조건 — UI-B에서 판단) |
| 포커스·접근성 | 질문 라디오 `data-field="nblOtherStateHistoryMode"` · 사건 행 `data-field="nblOtherStateEvents.{i}.kind|date"` · **정착면적 칸 `data-field="nblOtherStateEvents.{i}.houseFootprintBefore"`**(⑧ H9 점프 앵커 — `transfer-tax-validate-nbl-state-history.ts:60-61`과 같은 리터럴 접두) |
| 색상 | amber(취득·분리계산 tone) 그대로 — 기존 `ToneCard tone="amber"` · 미리보기 sky · 초과·오류 안내는 기존 amber/red 토큰. 라이트/다크 쌍은 기존 토큰이라 새 클래스 0. 새 `text-[Npx]` 0 |
| hint 문구(안) | 질문: «소유기간 중 이 토지 위에 주택이 새로 지어지거나 없어진 적이 있습니까?» / 신축일: «주택이 있는 것으로 보는 첫날입니다. 사용승인일(준공일)과 주택으로 보는 첫날이 다를 수 있습니다 — 확인 필요.» / 첫 행: «취득 당시 주택이 있었다면 «주택 멸실·철거·붕괴»부터, 없었다면 «주택 신축»부터 입력합니다. **주택이 아닌 건축물(상가·창고 등)이 있던 기간은 이 질문으로 입력할 수 없습니다 — «모름»을 선택하면 현행 판정 + 확인 필요로 표시합니다.**»(엔진 상수 `HOUSING_NON_HOUSE_BUILDING_NOTICE`와 같은 문구를 읽는다) / 철거 행 정착면적: 위 표. hint 150자 정책 — 길면 ToneCard 본문으로 |
| placeholder | 날짜·정착면적 입력 모두 placeholder 없음 · 숫자 예시 0 |

### 4.3 기존 칸과의 관계

- **`nblOtherHasBuilding`(«건축물 있음» 토글)**: housing에서는 **그리지 않고 읽지도 않는다**(양도일 현재 주택 = 지목이 정함 — A-5). 기타토지 쪽 stale 값이 housing 전송·미리보기에 새지 않게 ④·⑤가 housing 분기에서 `true`를 고정으로 쓴다(§6 ④). 지목을 다시 기타토지로 되돌리면 저장된 토글값이 복원된다.
- **유예 섹션(9호 철거·5호 건설 착공)**: 사건이 유예를 자동 생성하지 않는다(통합 Q-10 (가)) — 같은 상수 `NBL_STATE_HISTORY_GRACE_ROW_NOTICE`(`nbl-confirm-notices.ts:115-117`)를 이력 섹션 하단에 그대로 보인다. 초과 구간 뒤 9호 행이 있으면 엔진 `HOUSE_EXCEEDED_GRACE_NOTICE`가 결과에 붙는다(Q-8 (가) — 입력 화면에서는 유예 행과 정착면적 초과 미리보기가 동시에 보일 때 같은 상수를 한 줄로 보인다).
- **양도일 현재 배율 초과(UQ-7)**: 질문 아래 «배율을 초과하는 면적이 있으면 이 이력은 판정에 반영하지 않습니다(초과분은 유예만 반영)» 안내 한 줄 — 엔진 Q-3a (나) 서술이며 새 방침이 아니다. **과거 구간의 초과(철거 행 미리보기)와 구별한다**(과거 구간은 반영하되 그 구간을 비사업용으로 접는다 — Q-5 (나)).
- **탈출구 = 질문 «모름»**: 정착면적을 모르면(Q-10 (가)로 ⑧이 막는다) 위 질문의 «모름»(현행 판정 + 확인 필요, 이득·불이익 없음)이 정상 경로다 — ⑧ H9 오류 문구에 같은 안내를 붙인다.

### 4.4 B 위젯 — 기타토지 카드 철거 행 (UI-B · 엔진 E3d-2 뒤)

기타토지 카드의 `OtherLandStateHistorySection`(variant `other`)은 **그대로 두고 철거 행에만 칸을 더한다.** 신규 칸은 모두 `building_removed` 행에서만 보인다.

```
[기타토지 카드 · 이력 «바뀐 적 있음»]
 ③ 사건  종류 ( )건축물 신축 (•)건축물 멸실·철거·붕괴 ( )재산세 과세 구분 변경   [삭제]
          사건일 [2021-01-01]
   ┌ 철거된 건축물 종류 ─────────────────────────────────────────────┐   ← 신규 FieldCard(RadioCardGroup amber inline)
   │ (•) 주택   ( ) 그 밖의 건축물(상가·공장 등)                       │      저장 `"house"` / `""`(그 밖 = 현행)
   │ hint: 주택은 재산세 토지 구분(별도합산·분리과세·비과세)이 없습니다.  │      ← `BUILDING_KIND_HINT_NOTICE`(Q-12 (가))
   │       주택이었다면 「주택」을 고르세요. 겸용주택은 「주택」으로 고르지 않습니다. │
   └────────────────────────────────────────────────────────────────┘
   [주택일 때]  철거 직전 주택 정착면적 [____] ㎡  + 허용 면적 미리보기(A와 같은 칸·같은 helper)
   [그 밖일 때] 철거 직전 그 토지의 재산세 구분 …(기존 카드 — 불변)
 ┌ 수도권 여부 ────────────────────────────────────────────────────┐   ← 기존 MetropolitanAreaField — **조건부**(`housePriorNeedsMetropolitan`)
 │ 철거 전 주택 구간의 배율 판정(주·상·공 3배/5배)에 쓰입니다.       │      카드 단위 1개(철거 행마다 아님) · 위치 = 사건 행 목록 아래
 └────────────────────────────────────────────────────────────────┘
```

| 항목 | 내용 |
|---|---|
| 노출 술어 | **엔진 `housePriorNeedsMetropolitan(landType, zoneType, events)` 직접 호출**(A-13) — 인자 `events`는 **`stateHistoryWireFields(asset).nblOtherStateEvents`**(모드가 `changed`가 아니거나 질문이 안 적용이면 `[]` → 술어 거짓). 폼 저장 events를 직접 넘기면 `unchanged` + stale 주택 철거 행에서 «화면엔 없는 수도권 필수»가 생겨 막다른 길(§9 X27) |
| 라벨 | 종류: «철거된 건축물 종류» — 선택지 «주택» / «그 밖의 건축물(상가·공장 등)». 기본 표시 «그 밖»(= 저장 `""` = 현행 byte-identical, Q-12 (가) — 가정값 채움이 아니라 현행의 문서화된 뜻) · 수도권: 기존 `MetropolitanAreaField`(데이터 필드 `nblIsMetropolitanArea` 공유 — ⑧ 기존 문구 재사용) |
| «그 밖» 선택 시 | 기존 «철거 직전 재산세 구분»(`carriesBefore`) 카드 그대로 · 종류 카드 hint에 `BUILDING_KIND_HINT_NOTICE`(Q-12 (가)). 종류를 «주택»→«그 밖»으로 되돌려도 **저장 `houseFootprintBefore`는 지우지 않고 ④가 보내지 않는다**(이력 복원 보존 · stale 미전송) |
| «주택» 선택 시 | 정착면적 필수(H9) · 철거 직전 재산세 구분 카드는 숨김(엔진이 주택 구간의 `propertyTaxTypeBefore`를 읽지 않는다 D-3 — ④ 미전송) · 신축 행의 나대지 선언은 그대로 |
| 막는 것 | `buildingKindBefore`는 철거 행에서만 — 종류 전환 시 행 재생성이 신축·구분 변경 행에 stale을 남기지 않는다(⑧·⑫ H11은 직접 API 방어) |
| 수용(§168의12 후단) | 주택 구간이 있으면 엔진이 `expropriationZoneBaseDateNotice`를 낸다(V-18) — 위젯은 별도 문구를 짓지 않는다 |
| 파일 | `OtherLandStateHistorySection.tsx`에 철거 행 분기 추가(≈ +40줄) 또는 행 카드 추출 — UI-B에서 크기 보고 확정 |

---

## 5. 적용 술어 단일 소스 — 이번 세션 교훈의 직접 반영 (④⑤⑧ 같은 함수)

E3-②에서 ⑧이 엔진 술어(`revenueHistoryScope`)를 직접 부르지 않아 «양도일 의제» 조합에서 ⑧ 통과 → 엔진 수입 0 판정이 났다(`nbl-state-history-e3-2-business-period.ui.plan.md` 「추가 정정」). 같은 구조가 housing에서 **세 갈래**로 가능하다(§1.3 D2·D3·D5). 엔진 계획서에는 «scope 술어»가 없고 지목 축은 소비표 술어 `consumesHousingStateHistory`(A-1·A-4)뿐이므로, **UI의 ④⑤⑧은 이 소비표 술어를 직접 부르는 한 함수 `nblStateHistoryApplies`를 공유**한다(자체 지목 조건 금지).

**설계(제안 — 이름은 구현 PR이 확정)**

| 함수 | 위치 | 정의 | 호출처 |
|---|---|---|---|
| `nblOtherStateHistoryApplies(asset)` | `lib/calc/nbl-other-state-history-scope.ts`(기존) | **기타토지 전용으로 고정** — `!!nblUseDetailedJudgment && consumesStateHistory(landType) && !consumesHousingStateHistory(landType) && !nblOtherUseParcels`. 소비표 기존 열이 housing으로 넓어져도 진리표(`nbl-state-history-gates.anchor.test.ts:36-38`)가 변하지 않는다 | 디스패처만 |
| `nblHousingStateHistoryApplies(asset)` | 같은 파일(≈ +45줄 → 145줄) | `!!nblUseDetailedJudgment && consumesHousingStateHistory(landType)` — **`nblOtherUseParcels`·`nblOtherHasBuilding` 등 기타토지 전용 칸을 읽지 않는다**(D5). 무조건 의제(`nblExempt`)·의제 사유는 읽지 않는다(⑧ 조기 return·⑫ return이 이미 앞선다 · 주택은 의제 비적용 — §1.3) | 디스패처만 |
| **`nblStateHistoryApplies(asset)`** | 같은 파일 | `nblOtherStateHistoryApplies(asset) \|\| nblHousingStateHistoryApplies(asset)` — **지목 축은 이 함수 하나** | `stateHistoryWireFields`(④) · `validateNblStateHistory` 게이트(⑧) · 섹션 마운트(⑤) |
| `housingAreaLimitState(asset, transferDate)` | 같은 파일 | **표시 전용**(④⑧이 읽지 않는다 — **양도일 현재** 배율 초과 안내 한 줄용): 엔진 helper `judgeHousingLimit`(`housing-limit.ts` — `housing-land.ts:84-101`을 추출·공유, 엔진 D-12)로 `"within" \| "exceeded" \| "unknown"`. 입력이 비거나 수도권 미확인이면 `"unknown"`(안내를 띄우지 않는다). 존 문자열 → `ZoneType` 변환은 ⑭(`form-mapper.ts:81` `asString(nblZoneType) \|\| "undesignated"`)와 같은 규칙 | ⑤ 안내 한 줄만 |
| **`housePriorNeedsMetropolitanOf(asset)`** | 같은 파일 | **엔진 `housePriorNeedsMetropolitan(landType, zoneType, events)`(A-13)를 직접 호출** — `events`는 **`stateHistoryWireFields(asset).nblOtherStateEvents`**(모드·적용 술어를 이미 반영한 wire 사건). 기타토지 ∧ `buildingKindBefore = house` 철거 행 ∧ 주·상·공일 때만 참. 자체 지목·용도지역 조건 **금지**(E3-② 결함 유형) | ④ `metro` 게이트(`non-business-land-request.ts:165` — `consumesMetropolitanArea(landType) \|\| 이 함수`) · ⑤ 수도권 칸 노출 · ⑧ 수도권 필수 |
| `housePriorFootprintIssueOf(asset, i)` | 같은 파일 | **엔진 `houseFootprintIssue`(A-13 — 비수치·0·음수·정착>토지)를 직접 호출** + 주택 구간을 닫는 행 판정은 엔진 `eventClosesHouseInterval`. A(housing)는 모든 철거 행, B는 `buildingKindBefore = house` 철거 행 | ⑧ H9 · ⑤ 칸 오류 표시 |

**왜 배율을 ④⑧ 게이트에 넣지 않는가**: 배율 이내 여부는 엔진 안에서 `judgeHousingLand`가 런타임에 가르는 분기(초과면 후처리 미적용 + `changed`일 때 PARTIAL 고지 — 엔진 Anchor 3)이고 ⑫′도 그 분기를 모른 채 사건 행을 검증한다(`consumesHousingStateHistory` 한 축). ④⑧만 배율로 게이트하면 ⑫와 어긋난다(직접 API는 400/200이 갈림). 기타토지 부분 면적 경로도 같은 규약이다(⑧·⑫가 면적을 모르는 채 사건을 검증하고 엔진이 고지). 따라서 **게이트는 지목 축 한 곳**이고 배율은 안내(UQ-7 (다)).

**④⑤⑧ 3중 패턴 표 — 이 문서의 모든 필드**

| 필드 | ⑤ 표시 | ④ 전송 | ⑧ | ⑫ | 엔진 |
|---|---|---|---|---|---|
| `nblOtherStateHistoryMode` | 질문 노출 = `nblStateHistoryApplies`. 미선택(`""`)은 «선택 안 됨»(표시 fallback 없음 — 가정값 채움 금지) | 술어 거짓 → `""` · 참이면 저장값 | 적용이면 `""` 차단(기타토지와 같은 문구 — 접두만 «주택 부수토지 —») | enum optional(변경 0) | `""`·`unchanged` = 현행 · `unknown` = 현행 + 고지 · `changed` = 이력(이내일 때) |
| `nblOtherStateEvents` | `changed`일 때만 행 | 술어 거짓/`changed` 아님 → `[]` · 참이면 사건 전송(주택 허용 종류 밖 행은 ⑧이 막아 닿지 않음) | ⑫와 같은 leaf + `housingStateEventIssue`(H4·H5) | 행 스키마 + 주택 refine | 이력 구간 |
| `…[i].houseFootprintBefore` | **주택 구간을 닫는 철거 행에서만**(A: 모든 철거 행 · B: `buildingKindBefore = house` 철거 행) `DecimalInput`. 저장 `""` = 빈 입력(표시 fallback 없음 — 가정값 채움 금지) | 위 행에서만 싣는다(키는 값이 있을 때만) — 신축·구분 변경 행·«그 밖» 철거 행·기타토지 비주택 행은 키 없음(숨은 stale 미전송) | **H9**: 빈칸·0·음수·비수치·정착>토지 차단(Q-10 (가)) | **거울 없음**(`houseFootprintBefore: z.string().optional()` — 행 스키마에 **추가 필수**) | 양수 + 배율 이내 → 사업용 구간 / 초과·빈칸·비양수·비수치·정착>토지 → `unconfirmed`/`exceeded` 접힘 + 고지(직접 API 400 없음) |
| `…[i].buildingKindBefore`(B) | **기타토지 철거 행에서만** 2지선다. 저장 `"house"` / `""`. 화면 «그 밖» = 저장 `""`(현행 — 가정값이 아니라 문서화된 뜻) | `"house"`일 때만 키를 싣는다(`""`·부재는 종전 철거 행과 바이트 동일) | 규칙 없음(선택 칸). 구조 오류(신축·구분 변경 행에 `house`·주택 구간 안 `tax_type_changed`)는 H11 | **`buildingKindBefore: z.enum(["house"]).or(z.literal("")).optional()` 행 스키마에 추가 필수** + refine `houseKindEventIssue` 거울 | `house` → 주택 구간 · `""` = 종전 사슬 |
| `nblIsMetropolitanArea`(B 조건부) | `housePriorNeedsMetropolitanOf(asset)` 참일 때만 `MetropolitanAreaField` | 참일 때만 전송(`non-business-land-request.ts:165` 게이트 확장) — 거짓이면 `""` | **H10**: 참인데 미선택·«미확인» 차단(기존 문구 `transfer-tax-validate-nbl.ts:198-204`와 같은 규칙의 조건부 확장) | **거울 없음**(`nblIsMetropolitanArea: z.string().optional()`는 이미 있다 `transfer-tax-schema-nbl.ts:128` — strip 위험 없음, **⑭ 게이트가 값을 버리는 침묵**이 위험 — 엔진 T-7) | 직접 API 미제공 → 보수적 수도권 3배 + 기존 경고 |
| 「양도일 현재 주택」 | «있음(지목에서 정함)» 읽기 전용 줄 | `nblOtherHasBuilding`을 **항상 `true`로 덮어 싣는다**(housing) — 엔진 ⑭ `tailHasBuilding = true`와 같은 값(A-12) | 읽지 않음(마지막 사건 규칙만 H5) | — | 지목이 정함 |

`useEffect → store` 미러링 0 · 자동 안분 fallback 0 · 모드·종류 전환 시 파생 값 쓰기는 이벤트 핸들러(`changeMode`/종류 `onChange`)에서만(종류 전환 시 `houseFootprintBefore`·`buildingKindBefore`·선언 키를 행 재생성으로 함께 리셋 — 기존 `OtherLandStateHistorySection.tsx:214` 방식).

---

## 6. 클라이언트 14지점 (①~⑧ + ⑨~⑭ 확인점)

**기타토지 키 재사용(UQ-8 승인) + 새 중첩 칸 2개(`houseFootprintBefore` · `buildingKindBefore` — A-11)** 기준. UI는 **UI-A(E3d-1 뒤)** 와 **UI-B(E3d-2 뒤)** 두 단계로 연다(§14) — 열 «단계»가 어느 PR에서 닿는지 가른다. 우측 열은 최상위 키를 새로 두는 대안(UQ-8 (나))에서 더 늘어나는 일.

| 지점 | 변경 | 단계 | 근거 | 대안(UQ-8 (나))일 때 |
|---|---|---|---|---|
| ① 타입 | `NblOtherStateEventInput`에 **`houseFootprintBefore?: string`**(UI-A — `areaWithinLimitBefore`와 같은 optional 모양: 키 부재 = 종전) · **`buildingKindBefore?: "" \| "house"`**(UI-B). 모드·사건·`nblOtherHasBuilding` 주석에 «주택부수토지에도 쓴다» 명시. **`nblIsMetropolitanArea`는 기존 키**(`calc-wizard-asset-nbl-judgment.ts:55`) | A·B | `calc-wizard-asset-nbl-other.ts:48-54,98-105` | 최상위 키 3개 추가 |
| ② initial | **변경 없음** — 새 칸은 행 안 optional(새 행은 키 없음: `addEvent` `OtherLandStateHistorySection.tsx:126` 불변) | — | `calc-wizard-asset-factory.ts:378-380` · `calc-wizard-asset-nbl.ts:179-181` | 두 곳에 추가(호출마다 새 배열) |
| ③ normalize | `migrateNblStateHistory`(`calc-wizard-asset-migrate-nbl.ts:47-72`)에 두 줄: ① `houseFootprintBefore` — **문자열일 때만 보존**(철거 행에서만, 키가 없던 행에는 만들지 않음 — 구 스냅샷 byte-identical) ② `buildingKindBefore` — `"house"`만 허용·철거 행에서만 보존. **`tax_type_changed` 행·나대지 선언 키·`propertyTaxTypeBefore`는 ③에서 지우지 않는다**(침묵 소실 금지 — 보이는 행을 ⑧이 막고 ④가 미전송) | A·B | 같은 파일 | 형제 `migrateNblHousingHistory` + 가드 확장 |
| ④ API 변환 | ① `stateHistoryWireFields`를 `nblStateHistoryApplies`로 게이트(§5) ② housing이면 `nblOtherHasBuilding: true` 고정(A-12) ③ `stateEventWireRow(events, i, tailHasBuilding)`에 지목 구분 인자를 더해 housing이면 `tailHasBuilding = true` · **엔진 `eventClosesHouseInterval`이 참인 철거 행에서만 `houseFootprintBefore`(·B는 `buildingKindBefore:"house"`)를 싣고**(키는 값이 있을 때만) 그 행의 `propertyTaxTypeBefore`·나대지 선언 키는 `""`/미전송 · 신축 행은 기존 나대지 선언 규칙 그대로 ④ **(UI-B) `metro: consumesMetropolitanArea(landType) \|\| housePriorNeedsMetropolitanOf(asset)`**(`non-business-land-request.ts:165` — 안 바꾸면 B 수도권 값이 서버에 안 닿는다: §1.3 BP1) | A: ①②③ · B: ③④ | `non-business-land-request.ts:159,165,176-177` · `nbl-other-state-history-scope.ts:72-99` | 신규 키 wire 함수 |
| ⑤ UI | §4(A) · §4.4(B) | A·B | `HousingLandDetailSection.tsx` · `OtherLandStateHistorySection.tsx` · `MetropolitanAreaField` 재사용 | — |
| ⑥ 사이드바 | **변경 없음(실측)** — `git grep`이 타입 import 2줄뿐 | — | §0 | 같음 |
| ⑦ 결과 | §8 | A·B | `NblStateHistoryPeriodTable.tsx` · `NonBusinessLandResultCard.tsx:257-266` | 같음 |
| ⑧ validation | `validateNblDetailedJudgment`에서 **정착면적 규칙(`transfer-tax-validate-nbl.ts:206-216`) 바로 뒤**에 `validateNblStateHistory`를 housing에도 호출(화면 순서와 같게) + **새 규칙 H9(정착면적)·H10(B 수도권)·H11(B 구조)** — 게이트 §5 `nblStateHistoryApplies`, 규칙 §7. 기타토지 B 규칙은 `validateNblOtherLand`의 기존 `validateNblStateHistory` 호출(`transfer-tax-validate-nbl-other.ts:28`) 안에서 같은 leaf로 | A·B | `transfer-tax-validate-nbl.ts:260-264` · `transfer-tax-validate-acquisition.ts:369-373` | 같음 |
| ⑨⑩ | 해당 없음(`StateEventKind`를 늘리지 않는다 A-3) — `NBL_STATE_BUILDING_KIND_VALUES`(`["house"]`)는 엔진 신규 열거(엔진 §5 ⑫) | — | — | — |
| ⑪ | 해당 없음 | — | — | — |
| **⑫ Zod** | **행 스키마 `nblStateEventRawSchema`에 `buildingKindBefore: z.enum(NBL_STATE_BUILDING_KIND_VALUES).or(z.literal("")).optional()` · `houseFootprintBefore: z.string().optional()` 추가 — 빠지면 중첩 칸 침묵 strip**(`transfer-tax-schema-nbl.ts:57-65`, 엔진 §5 ⑫ · §1.3 BP2 실측: 현행 strip). refine: 게이트를 소비표 넓힘에 맞추고 `housingStateEventIssue`(D-1·D-2)·`houseKindEventIssue`(D-8)를 ⑧과 같은 함수로 호출(`transfer-tax-schema-nbl-refines.ts:108-112` 뒤). **정착면적·수도권 거울 없음**(A-14) | A: `houseFootprintBefore` · B: `buildingKindBefore` | `transfer-tax-schema-nbl.ts:57,194-195` · refines | 최상위 키 + 행 스키마 모두 추가 |
| ⑬ | `nbl*` prefix-pick 자동 운반(최상위 키 재사용 → 변경 0). 새 중첩 칸은 **④ 와이어 행에 실리는지**가 관건 — **body 도달 E2E**로 확인(`git grep -n "houseFootprintBefore\|buildingKindBefore\|housePriorNeedsMetropolitan"`이 ①③④⑫⑭ + 엔진 leaf에서 모두 나와야 함 — 엔진 §5 완료 점검) | A·B | `non-business-land-request.ts:159` | 같음 + 신규 키 prefix 확인 |
| ⑭ | 엔진 소관: `buildLandStateHistory` 지목 게이트 확장 · 주택 구간을 닫는 철거 행의 `houseFootprintBefore`·`buildingKindBefore` 운반(그 행의 `propertyTaxTypeBefore` 미운반) · `tailHasBuilding = true`(주택) · **`form-mapper.ts:155` `metroRaw` 게이트의 조건부 개방**(UI-B 입구). UI 미리보기도 같은 빌더/leaf를 쓴다 | A·B | `form-mapper-helpers.ts:311-312,322` · `form-mapper.ts:155,174,197` | 같음 |

**3중 패턴 요약**: ① 질문 «미선택» = 값 없음(화면·전송·⑧·⑫·엔진 모두 `""` = 미입력 — ⑧만 차단). ② `houseFootprintBefore` = **빈칸은 빈칸**(표시 fallback·가정값 0) — 화면 빈 `DecimalInput` = 저장 `""` = 전송 키 없음 또는 `""` = ⑧ H9 차단 = ⑫ 거울 없음 = 엔진 `unconfirmed` 접힘(직접 API) — **⑧만 더 엄격한 허용된 비대칭**(§7 격자 ⑫ 상태 열). ③ `buildingKindBefore` 화면 «그 밖» = 저장 `""` = 전송 키 없음 = ⑫ `""` 허용 = 엔진 현행(바이트 동일 — 엔진 B8). ④ «양도일 현재 주택 있음»은 파생이지 입력이 아니라 화면 줄(읽기)·④ 고정값·⑭ `tailHasBuilding`·엔진 지목 판단이 같은 뜻(`true`)을 읽는다. ⑤ 수도권(B) = 술어가 참일 때만 화면·전송·⑧·⑭가 읽고, 거짓이면 모두 «읽지 않음»(`""`).

---

## 7. ⑧ 검증 규칙과 ⑧ ↔ ⑫ parity 격자

게이트: `nblStateHistoryApplies(asset)`(§5 — 지목 축 한 곳, 배율은 게이트가 아니다). 호출 위치: **A** = `validateNblDetailedJudgment` 안, 정착면적 규칙 직후(화면 순서 = 질문이 정착면적 뒤 — 엔진 V-10 해소: 정착면적 필수 규칙 `transfer-tax-validate-nbl.ts:209-216`이 이력 규칙보다 앞서 먼저 막는다) · **B** = 기존 `validateNblOtherLand`의 `validateNblStateHistory` 호출(`transfer-tax-validate-nbl-other.ts:28`). 축 B 둘째 이후 지분 카드는 `ctx.skip`(`transfer-tax-validate-acquisition.ts:369-373`). 메시지 접두 = `${label}: 주택 부수토지 — `(A) / `${label}: 기타토지 — `(B — 기존). 정착면적·수도권·종류 규칙은 엔진 leaf(`houseFootprintIssue`·`houseKindEventIssue`·`housingStateEventIssue`)를 **직접 호출** — 자체 비교 금지.

| # | 조건 | 가리키는 칸(점프 앵커) | ⑫ | 단계 | 비고 |
|---|---|---|---|---|---|
| H1 | 질문 미선택(`""`) | `nblOtherStateHistoryMode` | 거울 없음 | A | 필수 질문(UQ-1). **배율 초과여도 요구**(게이트는 지목 축 — UQ-7 (다)) |
| H2 | `changed` + 사건 0건 | `nblOtherStateEvents` | ✅ 400 | A | 기존 leaf `STATE_EVENTS_REQUIRED_MESSAGE`(`subject` 인자 — 엔진 D-9) |
| H3 | 행 단위: 종류 미선택·날짜 빈 칸/해석 불가·역순·같은 날·같은 종류 연속·양도일 이후 | `nblOtherStateEvents.{i}.kind\|date` | ✅ 400 | A | `stateEventSequenceIssue` 재사용 |
| H3b | 사건일 ≤ 소유 시작(하한) | `nblOtherStateEvents.{i}.date` | **거울 없음**(축 B 늦은 지분 400 방지 `transfer-tax-validate-nbl-state-history.ts:5-8`) | A·B | 하한 = `stateHistoryFloorDate`(`:38-43`) — 이월과세는 증여자 취득일 |
| **H4** | 행 종류 = `tax_type_changed`(주택 카드 — 엔진 D-2) | `nblOtherStateEvents.{i}.kind` | **✅ 400**(`housingStateEventIssue`) | A | 기타토지에서 입력하다 지목을 바꾼 stale 행도 같다 — **보이는 행을 ⑧이 막는다**(종류 라디오는 선택지에 없어 «선택 안 됨» → 삭제·재선택), ④·③에서 몰래 지우지 않는다 |
| **H5** | 마지막 «건축물 사건»이 `building_removed`(= 양도일 현재 주택 없음 — 엔진 D-1) | `nblOtherStateEvents.{i}.kind`(마지막 건축물 행) | **✅ 400** | A | 안내(엔진 leaf): «양도일 전에 주택이 철거됐다면 지목을 「나대지·잡종지」로 바꿔 입력하세요» — **이제 B가 그 경로다**(기타토지 카드 + 철거 행 «주택») |
| H6 | 지목 housing 아님·정밀판정 OFF·무조건 의제 성립(`nblExempt`) | — | — | A·B | 전체 건너뜀(⑤ 비노출·⑫ 기존 return과 같은 술어) |
| H7 | 모름·바뀐 적 없음 | — | — | A·B | 막지 않음. `unchanged`+stale 사건은 ④가 비워 보낸다(§5) |
| H8 | 신축 행의 나대지 선언 칸(UQ-6 (가)) | 기타토지 E3-1b와 같은 leaf | 기타토지와 같음 | A | 선택 칸 — `""` = 모름 · 규칙 없음 |
| **H9** | **철거 행 정착면적** — 주택 구간을 닫는 철거 행(A: 모든 철거 행 · B: `buildingKindBefore = house` 철거 행)에서 **빈칸 · 0 · 음수 · 비수치 · 정착면적 > 토지 면적(`acquisitionArea`)**(Q-10 (가)) | `nblOtherStateEvents.{i}.houseFootprintBefore` | **거울 없음 — 직접 API는 400이 아니라 엔진 `unconfirmed` 접힘 + `HOUSE_WITHIN_UNCONFIRMED_NOTICE`**(200) | A·B | 엔진 leaf `houseFootprintIssue`(⑧ 공용). 문구 끝에 «정착면적을 모르면 위 질문에서 「모름」을 선택하세요»(엔진 D-17 — 탈출구). **정착면적 > 토지 면적은 «이내»가 아니라 차단**(엔진 Y-31) |
| **H10** | **B 수도권 필수** — `housePriorNeedsMetropolitanOf(asset)` 참인데 `nblIsMetropolitanArea`가 비었거나 «미확인» | `nblIsMetropolitanArea` | **거울 없음 — 직접 API는 보수적 수도권(3배) 기본값 + 기존 경고**(200) | B | 기존 문구·조건(`transfer-tax-validate-nbl.ts:198-204`)의 조건부 확장 — 술어가 거짓이면 요구하지 않는다(기타토지 기존 입력 변화 0) |
| **H11** | **B 구조** — `buildingKindBefore = house`가 신축·구분 변경 행에 있음 / 주택 구간 안(주택 철거 행이 닫는 건축물 구간)에 `tax_type_changed` 행이 있음(엔진 D-8) | `nblOtherStateEvents.{i}.kind` | **✅ 400**(`houseKindEventIssue`) | B | UI는 종류 칸이 철거 행에만 있고 종류 전환 시 행이 재생성돼 첫째는 직접 API 방어. 둘째(주택 구간 안 구분 변경)는 화면에서 만들 수 있어 ⑧이 막는다 |
| H12 | **의제 사유 선택(기타토지 — B)** | — | 거울 없음 | B | **UQ-12 (가) 결정 2026-11-24 — 의제 선택 시 H9·H10 건너뜀** — 엔진은 의제 선택 시 이력을 읽지 않고 고지만 낸다(엔진 B12). H9·H10을 그때도 요구할지 |

**⑧ ↔ ⑫ parity 격자**(신규 `nbl-housing-state-history-validate-parity.anchor.test.ts`(A) · `nbl-house-prior-validate-parity.anchor.test.ts`(B) — 선례 `nbl-state-history-u1-validate-parity.anchor.test.ts:100` 불변식 «⑫ 400이면 ⑧도 막는다»; **v2는 ⑧ 열과 ⑫ 열을 따로 단언한다** — «⑫ 접힘(200)»은 400이 아니다):

| 행 | 입력 | ⑧ | ⑫ 상태 | 엔진(직접 API) |
|---|---|---|---|---|
| P1 | A `changed` + 사건 0건 | 차단(H2) | **400** | — |
| P2 | A `changed` + 빈 행 | 차단(H3) | **400** | — |
| P3 | A 마지막 철거(D-1) | 차단(H5) | **400** | — |
| P4 | A `tax_type_changed`(D-2) | 차단(H4) | **400** | — |
| P5 | A 질문 `""` | 차단(H1) | 200 | 현행 |
| P6 | **A 철거 행 정착면적 빈칸** | **차단(H9)** | **200** | 엔진 `unconfirmed` 접힘 + 고지(엔진 H3e) |
| P7 | **A 정착면적 `0` · `-5` · `abc`** | **차단(H9)** | **200** | 접힘 |
| P8 | **A 정착면적 > 토지 면적** | **차단(H9)** | **200** | 접힘(**이내로 읽지 않는다** — 엔진 Y-31) |
| P9 | A 정착면적 정상 · 초과 계산 결과 | 통과 | 200 | 그 구간 접힘 + `HOUSE_EXCEEDED_NOTICE`(엔진 H3f) |
| P10 | B `buildingKindBefore = house` + 정착면적 빈칸 | **차단(H9)** | **200** | 접힘(엔진 B6) |
| P11 | B 주택 + 주·상·공 + 수도권 «미확인»/빈 | **차단(H10)** | **200** | 보수적 3배 + 경고(엔진 B16) |
| P12 | B 주택 + 녹지/도시지역 밖 + 수도권 빈 | **통과**(술어 거짓 — 요구 없음) | 200 | 수도권 무관(엔진 B17) |
| P13 | B `house`가 신축 행 / 구분 변경 행 | 차단(H11) | **400** | — |
| P14 | B 주택 구간 안 `tax_type_changed` | 차단(H11) | **400** | — |
| P15 | B `buildingKindBefore = ""` + `separate` 위장(기존 경로) | 통과 | 200 | 현행 B 198,210,000(엔진 B8·B19 — **바이트 동일**) |
| P16 | **stale**: 모드 `unchanged` + 주택 철거 행 + 수도권 빈 | **통과**(wire events `[]` → 술어 거짓) | 200 | 이력 미적용 |
| P17 | **stale**: `nblOtherUseParcels` true(기타토지) + 주택 철거 행 | 통과(`nblOtherStateHistoryApplies` 거짓 — 기존) | 200 | 이력 미전송 |
| P18 | housing 외 지목(농지·임야·목장·별장) + 주택 키 stale | 통과 | 200 | 소비표 거짓 — 무시 |
| P19 | 정밀판정 OFF · 무조건 의제 성립 + 위 입력 | 통과(H6) | 200 | — |
| P20 | 의제 사유 선택 + B 주택 철거 행 + 정착면적 빈칸 | **통과(UQ-12 (가) 결정 2026-11-24)** | 200 | 엔진 B12: 이력 미적용 + 고지 |

**불변식**: (a) ⑫ 400인 행은 모두 ⑧이 차단(P1~P4·P13·P14) (b) **⑧ 단독 차단 행 = H1·H3b·H9·H10**이며 ⑫는 그 행에서 **200**(접힘/경고) — «UI 통과 ↔ API 400» 모순 0 (c) ⑧ 통과 ⇒ ④ 와이어 사건 집합 = 폼 사건 집합 중 주택 구간 행의 `houseFootprintBefore` 포함(침묵 drop 0) (d) 술어(`nblStateHistoryApplies`·`housePriorNeedsMetropolitanOf`)가 거짓인 행은 ④·⑤·⑧이 **같은 결과**.

### 7.1 byte-identical·stale 전송 방지 보장

주택은 질문이 **필수**라 «OFF»가 없다 — 현행과 같은 결과를 내는 답은 `unchanged`(`""`은 ⑧이 차단)다. 보장 범위를 이렇게 정한다(각 행이 anchor 1건).

| # | 보장 | 방법 | 상태 |
|---|---|---|---|
| B1 | **housing 외 모든 지목**(농지·임야·목장·별장·건물 부수·기타토지·미선택)의 와이어(`nblOtherStateHistoryMode`·`nblOtherStateEvents`·`nblOtherHasBuilding`)·⑧·판정이 변하지 않는다 | `nblStateHistoryApplies`의 housing 항만 추가 · `nblOtherStateHistoryApplies`는 housing 제외를 **명시**해 소비표가 넓어져도 진리표 불변 · 기존 진리표 `nbl-state-history-gates.anchor.test.ts:36-38` 유지 | 코드 |
| B2 | **기타토지 변형 위젯**(`variant` 기본값)의 DOM·라벨·testid가 변하지 않는다 | variant 분기가 housing에만 닿는다 — 라벨·testid 단언 anchor | 확인 필요 |
| B3 | housing + `unchanged`의 **판정·세액·echo 키·경고**가 현행과 같다(와이어 mode만 `""` → `unchanged`) | 엔진 계약 A-10: `unchanged`는 housing 결과 객체에 새 키·새 고지를 더하지 않는다(기타토지 `applyStateHistory`가 `unchanged`에서 `applied:false, notices:[]` — `other-land-state-history-apply.ts:108`과 같은 규약) | probe A 값(198,210,000 · `not_judged`)을 anchor로 고정 |
| B4 | housing + `unknown` = 현행 판정 + **기존 `NBL_STATE_HISTORY_UNKNOWN_NOTICE` 1건**(경고 +1은 의도된 변화 — 엔진 Q 계약 A-8) | 위젯 고지와 같은 상수 | 확인 필요 |
| B5 | **stale 값이 와이어에 닿지 않는다**: 술어 거짓(지목 아님·정밀판정 OFF)이면 `""`·`[]`, 참이어도 `unchanged`·`unknown`이면 사건 `[]`, `changed`일 때 **주택 구간을 닫는 철거 행에서만** `houseFootprintBefore`·`buildingKindBefore`를 싣고 그 밖의 행·«그 밖» 철거 행의 두 키·주택 철거 행의 `propertyTaxTypeBefore`는 미전송, housing이 허용하지 않는 행(H4)은 **전송 대신 ⑧ 차단**(침묵 drop 0) | `stateHistoryWireFields`·`stateEventWireRow` 한 곳 · mutation ①⑨⑬ | 코드(§1.3 B가 현행 닫힘의 실측) |
| **B7** | **B: 기존 기타토지 철거 행 바이트 동일** — `buildingKindBefore` 부재·`""`인 철거 행의 와이어·⑧·⑫·판정이 종전과 같다(엔진 B8·B19 — «별도합산 위장» 입력의 결과도 불변) | `stateEventWireRow`가 `eventClosesHouseInterval` 참일 때만 새 키를 싣는다 · 새 ⑧ 규칙(H9·H10·H11)은 주택 구간이 있을 때만 | 기존 기타토지 이력 anchor 전부 + 신규 B7 anchor |
| **B8** | **B: 수도권 칸 노출·요구는 술어가 참일 때만** — 기타토지 기존 입력(철거 행 없음·«그 밖» 철거 행·녹지·도시지역 밖)은 수도권 칸 변화 0 · ⑧ 변화 0 | `housePriorNeedsMetropolitanOf`(엔진 술어 직접 호출 · wire events 인자) · 엔진 소비표 `other_land.metropolitanArea`는 false 유지(D-13) | P12·P16 |
| B6 | 지목 왕복(기타토지 ↔ 주택 부수 토지)에서 저장값이 지워지지 않는다 · 숨은 쪽 값은 보내지 않는다 | `onChange` 지목 변경에 리셋 패치를 **넣지 않는다**(이력 복원 보존 — 기존 `nblLandType` 변경과 동일) | 코드 |

**필드 점프**: ⑧ 규칙이 가리키는 키는 기존 `nblOtherStateHistoryMode`·`nblOtherStateEvents.{i}.kind|date`·`nblIsMetropolitanArea`에 **`nblOtherStateEvents.{i}.houseFootprintBefore`(H9)** 가 더해진다 — 정적 게이트(`transfer-validation-field-anchor-coverage`)는 `${…}`를 `*`로 정규화해 읽으므로 `fieldError(`nblOtherStateEvents.${issue.index}.houseFootprintBefore`, …)` 리터럴 접두(`nblOtherStateEvents.${issue.index}.houseFootprintBefore`)로 쓴다. `e2e/_helpers/validation-field-jump-cases-nbl.ts`에 케이스 ≈ 7행 추가(H1·H3·H4·H5·**H9(A·B)**·**H10**) — 기존 housing 행 `:64,68`·기타토지 이력 행 `:79-90` 불변. `buildingKindBefore`는 ⑧ 규칙의 가리킴이 없어 앵커 불요(칸에는 `data-field`만).

---

## 8. 결과 카드 ⑦ · 사이드바 ⑥ · 고지

| 화면 | 현행 | E3-③ (추천) |
|---|---|---|
| 입력 미리보기 | 기타토지만(`buildStateHistoryPreview` — `nblOtherHasBuilding`·`nblOtherPropertyTaxType` 읽음 `nbl-other-state-history-preview.ts:70-73`) | A·B 주택 변형: 초기 건축물·꼬리(A) = **주택 있음 고정**, 주택 구간 열 라벨 «주택(부속토지)». 구간은 엔진 leaf가 만든다(A-2) — **B는 꼬리가 나대지**(기타토지 카드)라 꼬리 규칙은 기존 그대로, 철거 행이 닫는 구간만 주택. ⑤ 미리보기 = 결과에서 판정한 구간 |
| 결과 구간표 | `periodEval.basis === "state_history"`이면 `NblStateHistoryPeriodTable`(`NonBusinessLandResultCard.tsx:257-266`) — 열 «건축물»·«재산세 구분» | **구간 echo의 optional `buildingKind = "house"`(A-7 — 기타토지 일반 구간은 키 부재 = byte-identical)** 가 있는 구간 행만 «주택(부속토지)»로 표기하고 «재산세 구분» 칸에 **`houseCheck`를 그대로**(«정착면적 {footprint}㎡ × {multiplierDetail} = 허용 {allowedArea}㎡ · 토지 {landArea}㎡ → 이내 / 초과 {excessArea}㎡») — 숫자 옆 한국어 변수명 라벨 · 재계산 금지(엔진이 근거를 echo — Q-7 (나) 이득). A는 표 전체가 주택 변형, **B는 기타토지 표 안에서 주택 구간 행만 변형**(`intervals.some(buildingKind==="house")` 행 단위). 소유기간 버킷·가·나·다목 기준 행은 **불변** |
| 면적 안분 블록 | `area` echo — 배율 이내면 전량 사업용 | **A**: 이력이 비사업용으로 뒤집으면 엔진이 `areaProportioning = undefined`(전량 — 엔진 T-1)로 내므로 블록이 사라진다 — 카드는 엔진 echo만 읽는다. 배율 초과(양도일 현재) + `changed`면 현행 echo + 엔진 PARTIAL 고지. **B**: 기타토지 core라 해당 없음 |
| 고지 | 엔진 `warnings`가 카드 「주의사항」에 싣는다 | 엔진 상수만 추가(A-8 — 엔진 §4.5): ① `NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE`(Q-2 — 주택 구간이 있는 이력 적용 시 «일 단위 합산 — 직접 해석례 없음 · 확인 필요») ② `…HOUSING_APPLIED_NOTICE`(A — «양도일 현재 상태 적용» 고지를 **대체**) ③ `…HOUSE_BEFORE_NOTICE`(A·B — 입력한 정착면적·취득 당시 토지 면적·양도일 시행 배율로 판정) ④ `…HOUSE_EXCEEDED_NOTICE`(초과 → 구간 전체 비사업용 — «배이내분까지» 문구) ⑤ `…HOUSE_EXCEEDED_GRACE_NOTICE`(초과 구간 + 9호 행) ⑥ `…HOUSE_WITHIN_UNCONFIRMED_NOTICE`(직접 API 접힘 — UI는 ⑧이 차단) ⑦ `…HOUSING_NON_HOUSE_BUILDING_NOTICE`(A 질문 hint와 같은 상수) ⑧ `…BUILDING_KIND_HINT_NOTICE`(B 종류 칸 · 종류 «그 밖» + 비종합합산 선언 결과) ⑨ 모름 = 기존 `…UNKNOWN_NOTICE` ⑩ 양도일 현재 초과 + `changed` = 기존 PARTIAL. 위젯과 결과 카드가 **같은 상수**를 읽는다. 기존 문구는 바이트 동일. **상수 길이가 hint 정책(150자)을 넘으면 ToneCard 본문으로**(UV-17) |
| 사이드바 ⑥ | 영향 없음(실측) | 변경 없음 |
| 인쇄·PDF | 기타토지 구간표가 이미 출력 경로에 있음(`print:overflow-visible`) | 같은 컴포넌트라 추가 작업 없음 — 확인 필요(UV-9: 주택 변형 열이 인쇄 폭에 들어가는가) |

표시 주의: 구간 «사업용 여부»는 **주택/나대지 구분만** 본 것이다 — 배율·유예는 계산 결과에서 확정(기타토지 구간표와 같은 한정 문구).

---

## 9. 교차 조합 케이스 전수 (④⑤⑧ 술어 직접 호출 — 각 행은 anchor 1건 · A·B)

상태: **실측** = §1.3 probe · **코드** = 파일 정독 · **확인 필요** = 구현 후 anchor로 고정.

| # | 조합 | 기대 | 근거·상태 |
|---|---|---|---|
| X1 | housing · 질문 `""` | ⑤ 질문 노출(미선택) · ⑧ H1 차단 · ④ `""`/`[]` | 코드(H1 신설) |
| X2 | housing · `unchanged` | 현행 byte-identical(판정·세액 198,210,000 · `not_judged`) · ④ `unchanged`/`[]` | probe A와 같은 입력은 실측 |
| X3 | housing · `unknown` | 현행 + 모름 고지 | 확인 필요 |
| X4 | housing · `changed` 신축 1행 | ④ 와이어 `changed`·1행 · `nblOtherHasBuilding: true` 고정 | 확인 필요(D6 모의는 실측) |
| X5 | housing · `changed` 멸실→신축 | 2행 · 구간 3개 | 확인 필요 |
| X6 | **housing · stale 연접 다필지 ON(기타토지 칸)** | housing 술어는 이 칸을 **읽지 않는다** → 질문 노출 · ④ 전송. 기타토지 술어는 housing을 제외해 소비표가 넓어져도 이 칸이 주택에 영향 0 | **실측(D5가 소비표만 넓힌 현행 술어의 결함을 보임)** → `nblStateHistoryApplies` 분리로 해소 |
| X7 | housing · stale `nblOtherHasBuilding` true/false | ⑤ 줄·⑧·④ 모두 «주택 있음» 고정 | 코드 |
| X8 | housing · stale `tax_type_changed` 행(기타토지에서 입력) | ⑧ H4 차단(⑫도 400 — 엔진 D-2) · 행은 화면에 보임 · 삭제 후 통과 | 확인 필요 |
| X9 | housing · stale E3-1b 선언 키(`propertyTaxBasisBefore`·`areaWithinLimitBefore`) · 철거 행의 stale `propertyTaxTypeBefore` | **신축 행**(나대지를 닫음)은 선언 카드가 보이고 값이 전송된다(UQ-6 (가)). **주택 구간을 닫는 철거 행**(A 모든 철거 행 · B 주택 철거 행)의 `propertyTaxTypeBefore`·선언 키는 ④가 비워 보낸다(엔진 T-5·Y-16) — `stateEventWireRow` 지목·종류 분기 | 코드 |
| X10 | **양도일 의제(§168의14②) 사유 stale** | 영향 0 — 주택은 의제 비적용, ④가 `none`으로 덮음. **이력 술어에 의제 분기 없음** | **실측(의제 교차 표)** |
| X11 | 무조건 사업용 의제(§168의14③) 성립 | `nbl-per-category`가 `inert`(`NblSectionContainer.tsx:146-154`) · ⑧ 조기 return · ⑫ return | 코드(기타토지와 같음) |
| X12 | 배율 초과(정착면적 × 배율 < 토지면적) | 질문은 그대로 필수 · ⑧ H1 요구 · ④ 사건 전송 · 질문 아래 안내 1줄(UQ-7 (다)) · 엔진은 현행 판정 + `changed`일 때 PARTIAL 고지(Anchor 3) | 확인 필요 — 안내 계산은 `housingAreaLimitState`(표시 전용) |
| X13 | 배율 초과 + 유예 충족으로 초과분 0 | 엔진이 후처리를 건너뛸지(초과 분기) 적용할지 — **엔진 §4.1은 초과 분기 전체를 «무변경»으로 둔다**(유예 충족 후에도 이력 미반영). 안내 문구가 «초과면 반영 안 함»으로 일치 | 코드(엔진 계획서 정독) |
| X14 | 배율 판정 불가(정착면적·용도지역·수도권 미입력) | 앞선 ⑧ 규칙(수도권·정착면적)이 먼저 막는다 → 질문은 노출되고 `housingAreaLimitState = "unknown"`이라 안내를 띄우지 않는다(깜빡임 방지) | 코드(규칙 순서) |
| X15 | 축 B 지분 N장 | 질문은 첫 카드에만 · 둘째 이후 카드 ⑧ `skip` · companion body에 첫 카드 이력이 실린다(`buildFractionalShareNblRecord` = primary + 지분 취득 사실) · 지분별 소유기간은 엔진이 replay | 코드(`non-business-land-request.ts:252-269`) · 확인 필요(housing 지분) |
| X16 | 이월과세 취득 | 하한 = 증여자 취득일 · `CarryoverOwnershipPeriodNotice` 맨 위 불변 | 코드 |
| X17 | 취득일 > 사건일(소유 시작 전) | ⑧ H3b 차단 · ⑫ 안 막음(비대칭 표 명시) | 코드 |
| X18 | 별장(`villa_land`) → 주택 재분류(REDIRECT) | 질문 없음(별장은 소비표 false — 엔진 T-2·P1) · 엔진 재분류 경로는 이력 미입력으로 현행 | 코드(`engine.ts:171-186`) · 엔진 P1 anchor |
| X19 | 기타토지 → housing → 기타토지 지목 왕복 | 값 보존 · 기타토지 질문·토글·연접 다필지 복원 · 주택 일시 입력은 같은 키라 기타토지로 돌아가도 남는다(UQ-8의 대가) | 코드 |
| X20 | 다건(자산 N장, 각 housing) — 함께 양도 토지 카드(자산 2+ · 비지분) | 자산별 독립 질문·사건. 비지분 컴패니언은 자기 카드의 NBL 섹션에 같은 질문이 뜨고(`AssetSectionExtras.tsx:69-74`) ④는 자기 카드 raw를 싣는다(`transfer-tax-api-bundled.ts:96-97` 비지분 분기 `buildNonBusinessLandRaw(a, …)`). 축 B 비첫 카드만 `skip` | 코드 |
| X21 | 주택 양도 + 부수토지 초과분 `__excess` 자동 카드 | **영향 없음**(이력 입력 경로 없음 — §1.1) | 코드 |
| X22 | sessionStorage 구 세션(housing · 모드 `""`) | 복원 후 ⑧ H1이 질문을 요구 — 막다른 길 아님(질문이 화면에 보임) | 코드 |
| X23 | 직접 API: A `changed` + 마지막 멸실 / `tax_type_changed` · B `buildingKindBefore = house`가 신축 행 / 주택 구간 안 구분 변경 | **400**(엔진 D-1·D-2·D-8 — ⑫′ `housingStateEventIssue`·`houseKindEventIssue`) · ⑧ 같은 문구. **정착면적·수도권은 400이 아니다**(P6~P11 — 접힘/보수 기본값 + 고지) | 확인 필요(구현 후 parity 격자) |
| X24 | 이력(`changed`) + 유예 9호/5호 행 병행 | 사건이 유예를 자동 생성하지 않음(고지 상수) · 경계는 사용자가 맞춘다 | 코드(`NBL_STATE_HISTORY_GRACE_ROW_NOTICE`) |
| X25 | **(B) 주택을 철거하고 나대지로 양도**(양도일 현재 주택 없음) | **이번 범위**(Q-1 (나)) — **기타토지 카드**의 철거 행 «철거된 건축물 종류 = 주택» + 정착면적(+ 조건부 수도권). A 카드의 H5 차단(마지막 철거) 안내가 이 경로로 보낸다 | 엔진 B1~B19 인용 · 현행 한계는 §1.3 BP1 |
| **X26** | **B 축 B 지분 카드 × 철거 행 정착면적·토지 면적(엔진 V-19)** | 질문·사건·정착면적은 **첫 카드에만**(둘째 이후 카드 ⑧ `skip`), companion body는 `buildFractionalShareNblRecord`(primary 스프레드 + 지분 취득 사실)로 첫 카드의 이력·`acquisitionArea`를 싣는다. **⑧ 정착면적 > 토지 면적은 «그 카드의 `acquisitionArea`»(첫 카드)로 비교**하고 ⑭ `landArea`도 같은 값이다. 지분 카드의 취득 면적이 지분 면적인지 전체 면적인지는 **확인 필요**(엔진 B13) — 어긋나면 배율 비교가 어긋난다. UI는 새 «철거 당시 토지 면적» 칸을 만들지 않는다(엔진 D-15) | 코드(`non-business-land-request.ts:252-269`) · **확인 필요(UV-14)** |
| **X27** | **stale 주택 철거 행 + 모드 `unchanged`/`unknown`**(B) | ④ wire events `[]` → `housePriorNeedsMetropolitanOf` 거짓 → 수도권 칸·⑧ H10 없음 · ④ 수도권 미전송. **술어에 폼 저장 events를 넘기면 «화면엔 없는 칸 요구» 막다른 길** → wire events 인자 고정 | 코드 · P16 anchor |
| **X28** | **B + 양도일 의제(§168의14②)** — 기타토지는 의제 적용 지목이라 **이력이 판정에서 빠진다**(엔진 B12 — 이력 미적용 + DEEMED 고지) | 위젯은 기존 `deemedBlocks` 안내(`OtherLandStateHistorySection.tsx:172-176`)를 그대로. 새 ⑧ H9·H10을 그때도 요구할지는 **UQ-12((가) 건너뜀 결정 2026-11-24 — 추천 (가) 건너뜀)**. A는 의제 비적용이라 해당 없음(§1.3 의제 교차 실측) | 코드 · UQ-12 |
| **X29** | **B + 연접 다필지 ON**(기타토지 칸 `nblOtherUseParcels`) | `nblOtherStateHistoryApplies` 거짓 → 질문·행·정착면적·수도권 칸 모두 비노출 · ④ 이력 `""`/`[]`·수도권 미전송 — 필지별 `hasBuilding`이 이미 있어 배타(기존 통합 Q-13). stale 주택 철거 행은 화면에 없고 전송·⑧ 모두 없음 | 코드(P17) |
| **X30** | B + 건축물 있는 꼬리(주택 철거 → 다른 건축물 신축 → 양도) · B + 철거 2건(주택 → 철거 → 주택 → 철거) | 주택 구간마다 철거 행에 정착면적 1칸 — 주택 구간을 닫는 철거 행 각각(`eventClosesHouseInterval`) · 꼬리 건축물은 기존 토글/사건이 정함 | 확인 필요(엔진 B14) |
| **X31** | B + 9호 철거 후 유예 행 | 사용자 입력 그대로(자동 생성 안 함). 철거 전 구간이 초과면 엔진 `HOUSE_EXCEEDED_GRACE_NOTICE` | 코드 |
| **X32** | B + 이월과세·축 B 지분별 취득일 | 하한 = `stateHistoryFloorDate`(증여자 취득일·번들 최이른) · 정착면적 비교는 토지 면적(첫 카드) | 코드 |
| **X33** | B + 수용(영 §168의12 후단) | 주택 구간이 있으면 엔진이 `expropriationZoneBaseDateNotice`를 낸다(V-18) — 위젯은 문구를 짓지 않는다 | 엔진 인용 |
| **X34** | B + 용도지역 `undesignated`(미지정) | 엔진이 10배(도시지역 밖)로 읽는다(엔진 D-14·V-20 — 기존 주택부수토지와 같다). UI 칸 변화 없음 — 수도권 칸도 안 뜬다(주·상·공 아님) | 엔진 인용 |

---

## 10. 기존 테스트 반전 규모 — grep 실측 (vitest 미실행 · UV-1)

**규모 측정 방법**: `grep -rl housing_site __tests__ e2e` = 35파일 · 52참조(e2e 1파일 2참조 — 점프 케이스 헬퍼). 이 중 ⑧ 경유 후보는 6파일 12참조 — 질문 필수 모델에서 **«⑧ 통과(null)»를 단언하는 곳만** 반전한다(음성 단언 `expect(err ?? "").not.toContain(...)`은 유지). 어느 행이 실제로 반전하는지는 grep으로 못 가려 **구현 시 vitest로 확정**한다.

| 대상 | 판정 |
|---|---|
| `__tests__/calc/nbl2611-b1-validation.anchor.test.ts:284` · `…d1-pipeline.anchor.test.ts:94` · `…nbl-stale-period-rows.anchor.test.ts:64,92` · `__tests__/lib/calc/nbl-pr1-gates.anchor.test.ts:150,288` · `__tests__/calc/ui-review-batch2.anchor.test.ts:95-105` · `__tests__/lib/calc/nbl-housing-land-metropolitan-validate-b6.test.ts` | ⑧ 경유 후보 — 픽스처에 `nblOtherStateHistoryMode: "unchanged"` 추가로 해소(기타토지 U1이 83건급 반전을 겪은 방식 — 이번은 주택이라 소규모 예상) |
| `__tests__/lib/calc/nbl-state-history-gates.anchor.test.ts:36-38` | **불변** — UI의 `nblOtherStateHistoryApplies`를 «기타토지 전용»으로 고정(§5)하므로 `housing_site` = false 진리표가 소비표 확장과 무관하다. **엔진 Anchor 7(이 파일을 «기타토지·주택부수토지 true»로 반전)과 어긋남** → 합칠 때 이 파일은 그대로 두고 `nblStateHistoryApplies` 디스패처 진리표(housing true)를 신설한다(§17 ①) |
| `__tests__/tax-engine/non-business-land/nbl-state-history-leaf.test.ts:511-513` | 엔진이 소비표 **기존 열**을 넓히므로(엔진 §5 소비표) **의도된 반전**(housing_site → true) — 엔진 PR 소관 |
| `__tests__/lib/nbl-state-history-leaf-unreachable.test.ts:95-98`(WIRE-3 허용 목록) · `:100-107`(WIRE-4 고지 상수 사용처) | 새 소비표 술어·새 UI 호출처·새 고지 상수를 **허용 목록에 추가**(의도된 갱신 — `NEXT_PR_HINT`) |
| `e2e/_helpers/validation-field-jump-cases-nbl.ts:64,68`(housing 수도권·정착면적) | 불변 — 질문 규칙이 뒤라서 앞 규칙이 먼저 나온다(코드 순서) |
| 기타토지 이력 e2e 5파일(`transfer-nbl-other-state-history{,-u3,-result,-e3-1,-e3-1b}.spec.ts`) · `OtherLandStateHistorySection` 렌더 테스트 | variant 기본 `other` = 현행 byte-identical → **반전 0**(라벨·testid 불변) |
| 결과 구간표 `nbl-state-history-interval-*` testid(기타토지) | 구간 echo의 `buildingKind` 부재 = 현행과 동일 → 불변 |
| **B**: `__tests__/tax-engine/non-business-land/nbl2611-b1-consumption.anchor.test.ts:8,43`(`consumesMetropolitanArea` 진리표) | **불변** — 엔진이 소비표 `other_land.metropolitanArea`를 false로 두고 조건부 술어를 따로 둔다(엔진 D-13). 대신 `housePriorNeedsMetropolitan` 진리표 anchor 신설 |
| **B**: `nblIsMetropolitanArea`를 쓰는 테스트·e2e **10파일**(`grep -rln nblIsMetropolitanArea __tests__ e2e`) | 기타토지 입력에는 술어가 거짓이라 **반전 0 예상**(④ 게이트 확장은 «참일 때만 추가»). 구현 시 vitest로 확정(UV-1) |
| **B**: 기존 기타토지 철거 행 이력 anchor(`buildingKindBefore` 부재) | **바이트 동일**(엔진 B8 · §7.1 B7) → 반전 0 |

---

## 11. 테스트·E2E·mutation 계획 (Do — 이 세션 미실행)

### 11.1 vitest (UI-A = E3d-1 뒤 · UI-B = E3d-2 뒤)

| 층 | 파일(신규) | 케이스 | 단계 |
|---|---|---|---|
| 술어 | `nbl-housing-state-history-scope.test.ts` | `nblHousingStateHistoryApplies` 진리표(지목 7 × 정밀판정 × stale 연접 다필지·stale 의제) · 디스패처 `nblStateHistoryApplies` = other ∨ housing · **`nblOtherStateHistoryApplies`가 소비표 확장 후에도 housing = false**(소비표 모의 주입) · `housingAreaLimitState`(이내/초과/경계 정수 비교 — 엔진 `judgeHousingLimit`과 동치 격자, 표시 전용) · **`housePriorNeedsMetropolitanOf` 진리표**(기타토지 ∧ 주택 철거 행 ∧ 주·상·공 · 녹지·도시지역 밖·«그 밖» 철거 행·모드 `unchanged`+stale·연접 다필지 stale = 거짓) | A·B |
| ④ | `nbl-housing-state-history-wire.anchor.test.ts` | 술어 거짓 → `""`/`[]` · housing 참 → 저장값 · `nblOtherHasBuilding` 고정 true · **`houseFootprintBefore`·`buildingKindBefore`는 주택 구간을 닫는 철거 행에서만 전송**(신축 행·«그 밖» 철거 행·기타토지 비주택 행은 키 없음) · 주택 철거 행의 stale `propertyTaxTypeBefore`·선언 키 미전송 · 지목 왕복(other↔housing) 와이어 불변 · **B 수도권 게이트: 술어 참일 때만 `nblIsMetropolitanArea` 전송**(§1.3 BP1의 «비움»이 «참일 때 전송»으로 바뀜 + 거짓일 때는 종전과 동일) | A·B |
| ⑧ ↔ ⑫ | `nbl-housing-state-history-validate-parity.anchor.test.ts`(A) · `nbl-house-prior-validate-parity.anchor.test.ts`(B) | §7 격자 P1~P20 전수 — **⑧ 열·⑫ 상태 열(400/200)을 각각 단언**. ⑧ 단독 차단 행(H1·H3b·H9·H10)의 ⑫ = 200 · 엔진 직접 호출 결과(접힘·경고) 병행 | A·B |
| ⑤ 위젯 | `nbl-housing-state-history-section-render.test.tsx`(A) · `nbl-house-prior-section-render.test.tsx`(B) | A: 질문 노출 위치(정착면적 뒤·유예 앞) · variant housing: 종류 2종 · **철거 행에 «철거 직전 주택 정착면적(㎡)» 입력·미리보기(이내/초과/토지 초과 오류)** · «철거 직전 재산세 구분» 카드 없음 · 신축 행에 나대지 선언 카드(UQ-6) · 토글 없음 · 의제 안내 없음 · 양도일 현재 초과 안내 1줄 · `other` variant 불변. B: 철거 행에 종류 카드(기본 «그 밖») · «주택» 선택 시 정착면적 칸·재산세 구분 카드 숨김 · 종류 hint(`BUILDING_KIND_HINT_NOTICE`) · 수도권 칸 노출 조건(술어) · 겸용주택 안내 · 종류 전환 시 행 재생성 | A·B |
| ⑦ | `nbl-housing-state-history-result-card.anchor.test.tsx` | 엔진 echo(구간 `buildingKind: "house"` + `houseCheck`) → 열 라벨·허용 면적 행 · A 표 전체 변형 / B 행 단위 변형 · `buildingKind` 부재(기타토지 일반) → 현행 라벨 · JSON 왕복 · 뒤집힌 판정에서 면적 안분 블록 부재(엔진 T-1) | A·B |
| route 관통 | `__tests__/api/nbl-housing-state-history-client.anchor.test.ts`(A) · `…nbl-house-prior-client.anchor.test.ts`(B) | A: M15·H3c·H8·S1 · B: B1·B1b·B1c·B3·B6~B8·B16·B19 폼 상태 → ⑧ → ④ → ⑫ → 엔진 → 세액(엔진 케이스 표와 **같은 표**) · **`houseFootprintBefore`·`buildingKindBefore`가 ⑫를 지나 엔진 input에 도달**(침묵 strip 가드 — 정착면적 200 vs 199.99로 B1 vs B1b 세액이 갈린다 · 정착면적 제거 시 B6과 같아진다) · **B 수도권 값이 ④·⑭를 지나 도달**(수도권 `yes`/`no`에서 B1c 경계가 갈린다 — 엔진 T-7) · 입력→전송 사건 집합 동일(침묵 drop 0) | A·B |
| 침묵 소실 grep 게이트 | `nbl-housing-state-history-wire-guard.test.ts` | `git grep "houseFootprintBefore\|buildingKindBefore\|housePriorNeedsMetropolitan"`가 ①③④⑫⑭ + 엔진 leaf + 위젯·⑧에서 모두 나온다 · ④⑤⑧이 **단일 술어 `nblStateHistoryApplies` 하나**와 **엔진 `housePriorNeedsMetropolitan` 직접 호출**만 쓴다(소스 grep) · ④⑤⑧이 자체 지목·용도지역 조건(`=== "housing_site"` · `isUrbanResidentialCommercialIndustrial` 직접 호출 등)을 쓰지 않는다 · WIRE-3·4 허용 목록 갱신 | A·B |

### 11.2 E2E — `e2e/transfer-nbl-house-state-history.spec.ts`(UI-A) · `e2e/transfer-nbl-house-prior-demolished.spec.ts`(UI-B) (sessionStorage 시드 · 선례 `e2e/transfer-nbl-revenue-period.spec.ts:1-80`의 `seed`·`landAsset`·`waitHydrated`)

**A 공통 시료**: 엔진 케이스 표 시료(주택부수토지 500㎡ · 정착면적 100㎡ · 수도권 밖 일반주거 5배 = 허용 500㎡ → 이내 · 취득 2014-01-01 · 양도 2024-01-01 · M15 준공 2023-06-01) · 정밀판정 ON · 질문 `unchanged`가 기본. 이 세션 probe(1,000㎡ · 정착 400㎡ · 수도권 · 양도 2024-06-30)도 현행 **198,210,000 · `not_judged`**(§1.3 A). **B 공통 시료**: 기타토지(잡종지) 1,000㎡ · 일반주거 · 수도권 밖(`nblIsMetropolitanArea = no` → 5배) · 2014-01-01 → 2024-01-01 · 꼬리 나대지 + 종합합산 · 사건 `신축 2014-01-02 → 철거 2021-01-01(종류 주택 · 정착면적 200㎡)`. 변경 후 세액·구간 단언은 **엔진 케이스 표 오라클**(A: M15 N 253,960,000 · B1 B 198,210,000)을 따르고 구현 PR이 실측으로 확정한다.

| # | 시나리오 | 확인 | 단계 |
|---|---|---|---|
| E1 | **M15**: 질문 «바뀐 적 있음» → 사건 `주택 신축 2023-06-01` → 계산 | **body**에 `nblOtherStateHistoryMode: "changed"`·사건 1행·`nblOtherHasBuilding: true` 도달 · 구간표 2구간(나대지·주택) + 주택 변형 라벨 · 판정이 현행(사업용 198,210,000)에서 비사업용으로(엔진 오라클 253,960,000) · `DAYWISE_NO_RULING` 고지 | A |
| E2 | `unchanged` 기본 byte-identical | body mode `unchanged`·사건 `[]` · 구간표 없음 · 세액 198,210,000 · 기존 라벨 | A |
| E3 | 질문 미선택 → 계산 차단 | 오류 목록 «자산: 주택 부수토지 — …» · 필드 점프가 질문으로 | A |
| E4 | `unknown` | 현행 세액 + 기존 모름 고지 | A |
| E5 | 양도일 현재 배율 초과(정착면적 40㎡ → 한도 200㎡ < 500㎡) | 질문 필수 유지 · 안내 1줄 · body 사건 도달 · 판정·세액 현행 + PARTIAL 고지(엔진 S1) | A |
| E6 | 기타토지 stale → 주택 전환(`tax_type_changed` 행 + 연접 다필지 ON 시드) | 질문 노출 · 행 보임 · H4 차단 · 삭제 후 통과 | A |
| E7 | 마지막 사건 = 멸실 | ⑧ H5 차단 · 점프 · 안내가 «지목을 나대지·잡종지로» | A |
| E7b | **H3c**: 구주택 철거 2016-01-01(정착면적 100㎡ — 이내) → 신축 2023-01-01 | body 철거 행에 `houseFootprintBefore: "100"` 도달 · 구간 3개 · 비사업용(엔진 H3c) · 정착면적을 50㎡로 바꾸면(H3f 초과) 미리보기 «초과» + 같은 N · 정착면적 제거 시 ⑧ 차단 | A |
| E7c | **H9 차단 격자**: 철거 행 정착면적 빈칸 / `0` / `-5` / `abc` / 600(> 토지 500㎡) | 각각 ⑧ 차단 문구 + «정착면적을 모르면 위 질문의 「모름」…» · 점프 `nblOtherStateEvents.{i}.houseFootprintBefore` · 질문을 «모름»으로 바꾸면 통과 + 현행 세액 | A |
| E8 | 사건 역순·같은 날 | ⑧ 차단(기타토지와 같은 leaf 문구) · 점프 | A |
| E9 | 축 B(지분 2장) A | 첫 카드에서 이력 입력 → companion body에도 이력 · 같은 판정 | A |
| E10 | 유예 9호 병행 | 하단 `GRACE_ROW_NOTICE` · 사건이 유예 자동 생성 안 함 · 초과 구간 + 9호면 `HOUSE_EXCEEDED_GRACE_NOTICE` | A |
| E11 | 지목 왕복 housing → other_land | 기타토지 질문·토글·행 복원 · 기타토지 body 불변 | A |
| **EB1** | **B1**: 기타토지 · 이력 `changed` · 철거 행 종류 «주택» + 정착면적 200 | **body**에 `buildingKindBefore:"house"`·`houseFootprintBefore:"200"` · **`nblIsMetropolitanArea` 수도권 밖** 도달(**수도권 값이 ④에서 비워지지 않는다 — §1.3 BP1과 대비**) · 판정 사업용 B 198,210,000(오라클 — 현행 N 253,960,000 → **−55,750,000**) · 구간표 주택 행 + `houseCheck`(허용 1,000㎡ · 토지 1,000㎡ → 이내) | B |
| EB2 | **B1b 경계**: 정착면적 199.99(허용 999.95 → 초과 0.05㎡) / 200.00 | 미리보기가 «초과 0.05㎡ — 그 구간 전체 비사업용»/«이내» · 판정 N / B(절벽 — 엔진 V-16·V-21) · `HOUSE_EXCEEDED_NOTICE` | B |
| EB3 | **B1c**: 수도권 · 정착 333.34 / 333.33 | 주·상·공 + 수도권 칸 노출 · 이내 / 초과 · 수도권을 «비수도권»으로 바꾸면 같은 정착면적이 5배 기준으로 | B |
| EB4 | **수도권 칸 조건부 노출**: 용도지역 녹지/관리지역 · «그 밖» 철거 행 · 철거 행 없음 | 수도권 칸 **없음**(기타토지 기존 입력 변화 0) · 주·상·공 + 주택 철거 행이면 노출 + 미선택 시 ⑧ H10 차단 + 점프 `nblIsMetropolitanArea` | B |
| EB5 | **Q-12 우회 안내**: 종류 «그 밖» + 철거 직전 재산세 구분 «별도합산» | 종류 카드 hint `BUILDING_KIND_HINT_NOTICE` · **차단하지 않는다**(바이트 동일 B 198,210,000 — 엔진 B8·B19) | B |
| EB6 | **H11**: 주택 구간 안에 `tax_type_changed` | ⑧ 차단 문구 · 행 삭제 후 통과 | B |
| EB7 | **stale**: 철거 행을 «주택»→«그 밖»으로 전환(정착면적 저장 잔존) · 모드 `unchanged` + 주택 행 · 연접 다필지 ON | 전환 시 body에 `houseFootprintBefore` 없음 · `unchanged`면 수도권 칸·H10 없음 · 연접 다필지면 질문 자체 없음 | B |
| EB8 | 9호 유예 + 초과 구간 / 겸용주택 안내 | `HOUSE_EXCEEDED_GRACE_NOTICE` · 종류 카드 겸용 안내 문구 | B |
| EB9 | 축 B(지분 3장) × B | 첫 카드 이력·정착면적 → 지분별 판정(엔진 B13) — **지분 카드 토지 면적 V-19 확인 필요**를 시료로 노출 | B |
| EB10 | 의제 사유 선택 + 주택 철거 행 | UQ-12 (가) 결정: 기존 의제 안내 · 판정 이력 미적용 | B |
| E12 | 시각 | 라이트·다크 글자 대비 4.5(`e2e/_helpers/dark-contrast.ts`) · **375px** 입력 영역·결과 카드 가로 스크롤 없음(`e2e/_helpers/no-page-hscroll.ts`) · 새 `text-[Npx]` 0 · ToneCard·RadioCardGroup 토큰만 | A·B |

외부 API mock 없음(공시지가 조회 칸 없음). 「화면 노출 확인」은 선택자 기반(`getByTestId`).

### 11.3 mutation 계획 (제품 코드 1줄 → 대응 anchor 실패 → 원복)

**A**: ① ④ housing 술어를 `nblOtherStateHistoryApplies`로 되돌림(D5 재현) ② ⑧ housing 호출 제거(D2·D3 재현 — parity 격자가 잡아야) ③ ⑫ 행 스키마에서 `houseFootprintBefore` 삭제(침묵 strip — route 관통 B1/B1b가 잡아야) ④ ⑤ housing에서 `tax_type_changed` 선택지 노출 ⑤ ⑧ H5(마지막 멸실) 제거 ⑥ ④ housing `nblOtherHasBuilding` 고정 true 제거 ⑦ ⑧ H4 제거 ⑧ `nblOtherStateHistoryApplies`의 housing 제외 삭제(gates anchor가 잡아야) ⑨ ④ 주택 철거 행의 stale `propertyTaxTypeBefore` 전송 허용 ⑩ ⑦ 표 `buildingKind` 라벨 분기 제거 ⑪ 의제 분기를 housing 술어에 추가(X10 anchor) ⑫ ④⑤⑧ 중 한 곳이 자체 `=== "housing_site"` 조건 사용(grep 게이트) ⑬ ④ 신축 행에 `houseFootprintBefore` 전송 허용 ⑭ ⑧ H9에서 «정착면적 > 토지 면적» 비교 제거(P8 — 엔진이 접어도 UI가 막아야 한다) ⑮ ⑧ H9를 `parseFloat` 후 `NaN`/음수 통과 허용(P7).

**B**: ⑯ `housePriorNeedsMetropolitanOf`가 폼 저장 events를 읽음(wire events 대신 — X27/P16) ⑰ ④ `metro` 게이트에서 `housePriorNeedsMetropolitanOf` 제거(BP1 재현 — EB1·B1c가 잡아야) ⑱ ⑧ H10 제거(P11) ⑲ ⑧ H10이 술어와 무관하게 항상 요구(P12 — 기타토지 기존 입력이 막다른 길) ⑳ ⑫ 행 스키마에서 `buildingKindBefore` 삭제(route 관통 B1) ㉑ ④ «그 밖» 철거 행에도 `houseFootprintBefore` 전송(B8) ㉒ 종류 전환 시 행 재생성 제거(stale 잔존 — EB7) ㉓ ⑧ H11 둘째 규칙(주택 구간 안 구분 변경) 제거 ㉔ 종류 hint 상수 제거(EB5). **침묵 소실 grep 게이트**: 새 칸·술어가 ①③④⑫⑭ 전부에서 나오고 ④⑤⑧이 단일 술어로만 게이트됨.

---

## 12. 사용자 결정 UQ-n

### 결정 현황 (2026-11-23·24)

| UQ | 상태 | 비고 |
|---|---|---|
| UQ-1 질문 방식 (가) 필수 3지선다 | ✅ **결정(추천안 승인)** | Q-6 «필수(⑧만)»와 같다 — ⑫·엔진은 `""`·미전송 = 현행(400 아님) |
| UQ-2 위치 (가) | ✅ 결정 | |
| UQ-3 재사용 (가) variant | ✅ 결정 — **B 추가로 분기가 3곳을 넘으면 (다)(행 카드 추출)로 전환** | UI-B에서 판단 |
| UQ-4 사건 종류·라벨 (가) «주택» 2종 | ✅ 결정 — R-3 엔진 D-9 `subject` 인자로 해소 | |
| UQ-5 주택 아닌 건축물 구간 (가) 안내 + 고지 | ✅ 결정 — 엔진 R-6 해소(`HOUSING_NON_HOUSE_BUILDING_NOTICE`). **B의 종류 «그 밖»·겸용 안내와 짝**(§4.4) | |
| UQ-6 나대지 선언 허용 (가) | ✅ 결정 = 엔진 Q-3 (가) | |
| UQ-7 배율 초과 (다) 안내 1줄 | ✅ 결정 — 대상은 **양도일 현재** 초과(A). 과거 구간 초과는 Q-5 (나) 접기(미리보기·고지) | |
| UQ-8 키 재사용 | ✅ 결정 | |
| UQ-9 결과 표 변형 | ✅ 결정 — 엔진 echo `buildingKind`·`houseCheck` | |
| UQ-10 PR 분할 | ✅ 결정 — 엔진 Q-9로 **UI-A / UI-B 두 단계**(§14) | |
| ~~UQ-11 철거 행 3지선다~~ | **대체됨** — 엔진 Q-11 (나): 정착면적 `houseFootprintBefore`(㎡) 숫자 입력(A·B 공용). 3지선다 폐기 | |
| **UQ-12 의제 사유 선택 시 새 ⑧ 규칙(H9·H10)** | ✅ **(가) 건너뜀 — 사용자 결정 2026-11-24** | §12 말미 |


| # | 질문 | 선택지 | **추천** | 근거 |
|---|---|---|---|---|
| UQ-1 | 질문 방식 | **(가) 필수 3지선다 — 미선택 ⑧ 차단(기타토지 U1과 동일)** / (나) ToggleCard 기본 OFF(E3-②식) / (다) 질문 없이 사건 목록만 | **(가)** | 같은 사실 질문이다. 비워 두면 현행(`not_judged` — 나대지 기간을 사업용으로 봄 · M15 현행 198,210,000)이 조용히 적용된다 — 「미입력 ≠ 미해당」(기타토지 UQ-1 승인 `nbl-other-land-state-history.ui.plan.md:470`). (나)는 반전 0이지만 «모름»과 «안 물음»이 구분되지 않는다. **엔진 Q-6 의견(«주택부수토지 카드 대다수는 이력이 없는 상시 입력이라 필수화의 마찰·픽스처 비용이 크다 — 엔진은 어느 쪽이든 동일»)에 대한 UI 측정**: 픽스처 비용은 ⑧ 경유 6파일 12참조(grep — 기타토지 U1의 12파일 83건 대비 소규모), 마찰은 정밀판정을 켠 housing 카드당 클릭 1회(질문 기본값을 `unchanged`로 채우는 것은 가정값 채움이라 금지). 사용자가 마찰을 더 크게 보면 (나) — 그때는 «꺼짐 = `""` = 현행»이고 H1 규칙이 없어진다 |
| UQ-2 | 질문 위치 | **(가) 주택 카드 맨 아래 — 정착면적·배율 안내 뒤, 유예 섹션 앞** / (나) 카드 맨 위(기타토지처럼) / (다) 유예 섹션 안 | **(가)** | 계산 순서(배율·인정면적 → 기간 → 유예)와 «영향받는 칸 직전». 기타토지가 맨 위인 이유(아래 모든 건축물 칸을 지배)가 주택에는 없다. (나)는 배율 입력 전에 UQ-7 안내를 줄 수 없다 |
| UQ-3 | 재사용 방식 | **(가) 기존 섹션에 `variant` prop** / (나) 새 컴포넌트 복제 / (다) 행 카드 등 하위 조각을 추출해 두 섹션이 공유 | **(가)** (분기가 3곳 넘게 퍼지면 (다)로 전환) | (나)는 355줄 복제 — 두 곳 동기 수정이 E3-① 이래 반복 누락 원인. (다)는 추출 비용이 크고 이번 variant 차이가 작다(종류 2종·라벨·카드 1개 비노출). 800줄 정책 안(≈ 410줄 예상) |
| UQ-4 | 사건 종류·라벨 | **(가) 2종 — «주택 신축»·«주택 멸실·철거·붕괴»(행 카드 제목 «주택 사건»), 오류 문구도 «주택»으로(엔진 leaf 라벨 인자 A-6)** / (나) 기타토지 3종 라벨 그대로(«건축물 …») / (다) 2종이되 라벨은 «건축물» 유지 | **(가)** | 화면 단어와 오류 단어가 같아야 한다(제목 «주택 사건» ↔ 오류 «건축물 사건 N번째 행»은 어긋남 — §1.5). `tax_type_changed`는 주택 구간에서 의미 없음(주택 부수토지는 재산세 구분을 입력하지 않는다). 엔진이 라벨 인자를 못 받으면 (다) |
| UQ-5 | 주택 아닌 건축물이 있던 기간 | **(가) 질문으로 표현하지 않고 안내(질문 hint) + 고지(엔진 상수) — 쓸 수 없으면 «모름»** / (나) 신축·멸실 행에 «건축물 종류(주택/그 밖)» 선택 + 비주택 구간은 기타토지식 재산세 구분 선언 | **(가)** | (나)는 건축물 종류·구분·배율 이력이 모두 필요한 새 모델(통합 V-5 «면적·구분 변동 미반영» 한정과 충돌, Q-8 (가) 겸용·건물 부수토지 영역에 닿는다). 이번 범위(M15 «신축·철거 전후»)는 주택 한정. 한계는 고지로 밝힌다(법 근거 없는 불리 적용이 아니라 입력 경로를 안 연 한계) |
| UQ-6 | 나대지 구간 재산세 구분 선언(E3-1b 카드) 허용 | **(가) 허용 — 신축 행에 `OtherLandBareIntervalFields` 재사용(«신축 직전 나대지 기간의 구분 + 근거»)** / (나) 불허 — 나대지는 종합합산 고정 + 고지 | **(가)** — **엔진 Q-3 (가)와 같은 결정**(같은 `resolveBareDeclaration` leaf — 엔진 비용 0). 엔진이 (나)를 택하면 (나) | E3-1b가 닫은 «공지상태 별도합산 나대지 → 과대 과세 방향 제약(T9c/T9o)»이 주택 앞 나대지에도 똑같이 걸린다. UI 비용은 기존 컴포넌트 재사용이라 낮다 |
| UQ-7 | 배율 초과(부분 면적) 시 | (가) 아무 안내 없이 질문·검증, 엔진이 결과에 고지(기타토지 선례) / (나) 초과 확정이면 질문을 숨기고 ④ 비움 + ⑧ 건너뜀(배율을 게이트에 넣음) / **(다) 질문·검증은 그대로 두고 초과 확정이면 질문 아래 안내 1줄만(표시 전용 계산)** | **(다)** | 엔진은 배율을 런타임 분기로만 가르고(엔진 §4.1 · A-4) ⑫′도 배율을 모른 채 사건 행을 검증한다 — ④⑧만 배율로 게이트하는 (나)는 직접 API와 어긋나고 ⑭가 쓰는 존 변환·수도권 fallback을 UI가 재구현해야 한다(**«UI가 엔진 술어를 따로 쓰다 갈라지는» E3-② 결함 유형**). (다)는 게이트가 지목 축 한 곳이라 ④⑤⑧이 갈라질 틈이 없고, 입력해도 반영되지 않는다는 사실만 안내한다(통합 Q-8 (가)·방침 Q-3a (나) 서술). 대가: 초과 확정 입력에서도 질문을 요구한다(입력 1회) |
| UQ-8 | 입력 키 | **(가) 기타토지 키 재사용(`nblOtherStateHistoryMode`·`nblOtherStateEvents`)** / (나) 신규 `nblHousingStateHistory*` | **(가)** | 최상위 키의 ①②③⑫ 변경 0 · ⑬ 자동 · 침묵 strip 위험 최소(새 중첩 칸만 ⑫ 행 스키마에 추가). 대가: 이름이 `Other`라 혼란 + 지목 왕복 시 같은 값이 보인다(§9 X19) — ⑧이 보이는 행을 막으므로 막다른 길은 없음. (나)는 14지점이 모두 늘고 stale 복제 경로가 새로 생긴다 |
| UQ-9 | 결과 표 표현 | **(가) 기존 구간표에 주택 변형(열 라벨 «주택»·«토지 구분») — 구간 echo의 `buildingKind = "house"`가 가른다** / (나) 별도 표 / (다) 기존 «건축물»·«재산세 구분» 열 그대로 | **(가)** | (다)는 주택 구간의 «재산세 구분»에 의미 없는 값이 섞인다(엔진 D-3 — 주택 구간은 재산세 구분을 판정에 쓰지 않는다). (나)는 가·나·다목 기준 행 중복. echo 키(`buildingKind`)가 없으면(기타토지) 현행 byte-identical |
| UQ-10 | PR 분할 | **(가) 엔진 E3d-0(테스트만) → E3d-1(A: leaf·소비표·⑫·⑭·echo·고지 — 판정까지 한 PR) → E3d-2(B) 시퀀셜, UI는 각 엔진 PR 뒤 UI-A·UI-B** / (나) 엔진·UI 한 PR | **(가) ✅ 결정** | 「화면에 있는데 판정에 안 쓰이는 칸 금지」(E3-② 선례) — 엔진 Q-9 결정과 합쳤다. **엔진 Q-2(법적 읽기)는 (가)로 결정됨**(2026-11-23)이라 착수 차단은 해소. B(E3d-2)만 Q-12 확정 뒤 — Q-12 (가) 결정됨 |
| ~~UQ-11~~ | **(v1) 철거 행 «철거 직전 배율 이내 여부» 3지선다** — **엔진 Q-11 (나)(2026-11-24)로 대체**: 철거 행 `houseFootprintBefore`(㎡) 숫자 입력(A·B 공용)을 받고 엔진이 배율을 판정한다(Q-7 (나)·Q-10 (가)) | — | — | v1 근거(3지선다는 사용자가 «계산해서 답하는» 방식이라 오선언 위험·엔진이 근거를 echo할 수 없음 — 엔진 §3.4 대안 비교 (가) 기각)가 채택됨. UI 비용은 칸 1개(DecimalInput)·미리보기·⑧ H9·③④⑫ 한 줄로 바뀐다 |
| **UQ-12** | **의제 사유(§168의14②)가 선택된 기타토지에서 B 철거 행의 새 ⑧ 규칙(H9 정착면적 · H10 수도권)을 요구할지** — 엔진은 의제 선택 시 이력을 읽지 않고 고지만 낸다(엔진 B12). 기존 사건 행(종류·날짜) 규칙은 의제여도 ⑧·⑫가 요구한다(U1 선례) | **(가) 건너뜀** — 의제 선택(`isDeemedTransferApplicable(landType) ∧ hasDeemedTransferReason(asset)` — ④·⑭ 매퍼와 같은 조건)이면 H9·H10을 요구하지 않는다(엔진이 안 읽는 칸의 영구 차단 방지 — E3-② 교정과 같은 방향). 기존 행 규칙은 그대로 / (나) 요구(U1 선례 — 의제와 무관하게 행 필수 칸을 요구) / (다) 의제 선택 시 이력 질문 자체를 숨김 | **(가)** | E3-②에서 «⑧이 엔진이 읽지 않는 칸을 요구하거나 읽는 칸을 건너뛰는» 결함이 났다. 엔진은 의제 선택 시 정착면적·수도권을 **읽지 않으므로** 요구하면 사용자가 지울 수 없는 의제 칸 뒤에서 숫자를 채워야 하는 dead input이다. ⑫에 거울이 없는 규칙이라 (가)가 «UI 통과 ↔ API 400» 모순을 만들지 않는다. 대가: 의제를 풀면 H9·H10이 다시 요구된다(칸은 값을 보존). (다)는 U1 결정(질문 그대로 보임)을 뒤집는다 · **→ (가) 건너뜀 결정 — 사용자 결정 2026-11-24** |

---

## 13. 미검증 UV-n

| ID | 항목 | 상태 | 영향 |
|---|---|---|---|
| UV-1 | 질문 필수 모델의 ⑧ 경유 housing 테스트 실제 반전 수 | **grep 6파일 12참조까지만** — vitest 미실측(제품 코드를 건드리지 않기 위해). 구현 첫 커밋에서 측정 | UQ-1 비용 |
| UV-2 | 엔진 계획서와의 모델·이름 정합 | **정합함**(엔진 계획서 v4 671줄 정독) — 일치·어긋남은 §0 A-n·§17. 남은 합칠 일: A-1(소비표 넓힘 ↔ UI 술어 고정 · 엔진 Anchor 7 정정) · §17 ⑬(엔진 §5 ⑫′ «⑧만 가진 규칙» 목록에 H10 포함 확인) | 전체 |
| UV-3 | §1.3 D1~D6은 `consumesStateHistory`를 모의(mock)로 켠 결과 — 제품 변경이 아니다. **엔진 계획서가 실제로 그 열을 넓히는 안이라 이 모의가 곧 예고편이다.** BP1은 현행 실측이고 BP2는 «현행 Zod에 새 키를 보내면 무시» 실측이다 | 구현 후 실제 소비표 변경으로 재측정(⑧↔⑫ 격자가 대신 고정) | §5 근거 강도 |
| UV-4 | M15 변경 후 세액·구간 일수 | **이 세션 미측정**(현행 198,210,000만 실측). 엔진 계획서 M15 오라클 = 비사업용 N 253,960,000(사업 214/3,651 — 엔진 시료: 500㎡·정착 100㎡·양도 2024-01-01)이며 엔진도 «기대 열은 전부 오라클 — 구현 후 같은 표로 대조»라고 밝혔다. E2E는 엔진 표를 인용 | §11.2 E1 |
| UV-5 | 배율 초과 + 유예 충족으로 초과분이 0이 되는 경우 | **엔진 §4.1이 초과 분기 전체를 «무변경»(후처리 미적용)으로 둔다** — 유예 충족 후에도 이력 미반영. UI 안내 문구와 일치(X13). 엔진이 후일 바꾸면 재확인 | UQ-7 · X13 |
| UV-6 | 주택 구간 «사업용» 판정의 법령 근거(법 §104의3①5호 배율 이내 vs ①4호 나대지 기간) | 이 세션 법령 본문 미조회 — 엔진 계획서 근거를 인용하되 UI 문구는 상수만 읽는다 | 고지 문구 |
| UV-7 | «사용승인일 = 주택으로 보는 첫날»의 정의·해석례 | 단정하지 않고 hint «확인 필요»(기타토지 `BUILT_DATE_HINT` 선례) | hint |
| UV-8 | 표시 전용 `housingAreaLimitState`가 엔진과 같은 존 변환·배율 fallback을 쓰는가 | `getHousingMultiplier`·`areaTimes`·`judgeAreaLimit`는 엔진이 이미 export한 leaf(`housing-land.ts:94-101`) — **존 문자열 → `ZoneType` 변환은 ⑭(`form-mapper`)에 있어** 클라이언트 번들 import 가능 여부·`isMetropolitanArea` 미지정 → 수도권 fallback(`housing-land.ts:83-92`) 재사용 방식 **확인 필요**. 표시 전용이라 어긋나도 판정은 안 바뀐다(안내만) | §5 |
| UV-9 | 인쇄 시 주택 변형 열의 폭 · 375px 입력 카드 | 구현 후 E2E·수동 확인 | §8 · §11.2 E12 |
| UV-10 | 별장 → 주택 재분류 경로에서 이력이 어떻게 읽히는가(X18) | 코드상 별장은 소비표 false라 입력 자체가 없다 — 재분류 후 `landStateHistory` 부재가 현행과 같은지 anchor로 고정 | X18 |
| UV-12 | ~~엔진 Q-2 착수 차단~~ | ✅ **해소** — Q-2 (가) 결정(2026-11-23). 남은 것: 직접 해석례 0건(엔진 V-1) → 고지 `DAYWISE_NO_RULING_NOTICE`가 결과·위젯에 항상 뜬다 | UQ-10 |
| UV-13 | ~~`exceeded` 처리(엔진 Q-5)~~ | ✅ **해소** — Q-5 (나): 초과 구간 전체 비사업용 + `HOUSE_EXCEEDED_NOTICE`(이내분까지 접은 과대 근사 — 엔진 V-16·V-21 절벽: 정착면적 0.05㎡ 차이가 −55,750,000 ↔ 0). 입력 화면 미리보기가 같은 사실을 보인다 | UQ-11 대체 |
| UV-14 | **축 B 지분 카드의 토지 면적(엔진 V-19)** — ⑧ H9 «정착면적 > 토지 면적»과 ⑭ `landArea`는 카드의 `acquisitionArea`(= `buildFractionalShareNblRecord`가 primary를 스프레드한 값)를 쓴다. 지분 카드·primary의 `acquisitionArea`가 지분 면적인지 전체 면적인지 **확인 필요** — 어긋나면 배율 비교가 어긋난다(엔진 B13) | ⏳ 확인 필요(구현 시 E2E EB9로 시료 노출) | X26 |
| UV-15 | `undesignated`(미지정) 용도지역은 엔진이 10배(도시지역 밖)로 읽는다(엔진 D-14·V-20) — 실제 도시지역을 «미지정»으로 고르면 과다 인정. UI는 기존 주택부수토지와 같은 처리라 변경하지 않는다 | ⏳ 기존 동작 | X34 |
| UV-16 | **정착면적 > 토지 면적 차단(H9)이 분할로 토지 면적이 줄어든 정당한 입력도 막는다**(엔진 V-24) — 탈출구는 이력 질문 «모름»이고 «철거 당시 토지 면적» 칸은 만들지 않았다(엔진 D-15). H9 오류 문구에 같은 안내 | ⏳ 안내 문구 | H9 |
| UV-17 | 엔진 고지 상수(`…BUILDING_KIND_HINT_NOTICE`·`…HOUSING_NON_HOUSE_BUILDING_NOTICE` 등)의 길이가 hint 정책(150자)을 넘는지 — 넘으면 FieldCard `hint` 대신 ToneCard 본문으로(위젯 구조만 달라진다) | ⏳ 상수 확정 후 | §4 |
| UV-18 | ⑧ H9·H10과 **양도일 현재 정착면적**(`nblHousingFootprint`)의 비교: 현행 ⑧은 «정착면적 > 0»만 요구하고 «정착면적 > 토지 면적»은 막지 않는다(`transfer-tax-validate-nbl.ts:209-216`). 엔진 Q-10 (가)의 범위는 `houseFootprintBefore`(철거 행)로 읽혀 **양도일 현재 정착면적에는 새 규칙을 더하지 않는다** — 엔진 계획서 확인 필요(범위가 현재 정착면적까지면 ⑧ 규칙 1개 추가) | ⏳ 엔진 확인 필요 | H9 |
| UV-19 | `housePriorNeedsMetropolitan`의 조건(주·상·공만 수도권이 배율을 가른다)이 영 개정 시 어긋나는 문제(엔진 V-22) — UI는 술어를 직접 호출하므로 자동 추종, 단 E2E EB3·EB4가 표 변화를 감시 | ⏳ 엔진 V-22 | §5 |
| UV-20 | UQ-12 (가) 채택 시 의제 선택 조건을 ④·⑭ 매퍼와 **같은 함수**로 읽는지(`isDeemedTransferApplicable ∧ hasDeemedTransferReason` — `OtherLandStateHistorySection.tsx:109`·E3-② `revenuePeriodScope` 선례) 확인 필요 — 엔진에 의제 scope 술어를 요청할지 | ⏳ UQ-12 결정 후 | H12 |
| UV-11 | 브라우저 수동 확인 | **미수행**(계획서 단계 — 구현 후 `npm run dev` Network 탭 body 확인 + Playwright) | DoD |

---

## 14. PR 분할·파일 크기 (Do — 엔진 선행 → UI 시퀀셜, A·B 분리)

엔진 Q-9(E3d-0 → E3d-1(A) → E3d-2(B))에 맞춰 **UI도 두 단계**로 연다. 각 UI 단계는 **대응 엔진 PR이 머지된 뒤** 시작한다(화면에 있는데 판정에 안 쓰이는 칸 금지).

| 순 | 내용 | 파일(예상) |
|---|---|---|
| 0 | **엔진**: E3d-0(테스트만 — A·B 표·Anchor 1·2·3·4(skip)·7·12) → **E3d-1(A)**: 소비표 열 · `consumesHousingStateHistory` · 주택 구간 leaf · `housing-limit.ts` · `housingStateEventIssue` · `houseFootprintIssue` · ⑫ 행 스키마 `houseFootprintBefore` · ⑭ 주택 분기 · echo(`houseCheck`) · 고지 | 엔진 소관 |
| **UI-A-1** (E3d-1 뒤) | **④⑧ 술어·와이어·검증·parity 격자(A)** — `nblStateHistoryApplies` 디스패처 · `nblOtherStateHistoryApplies` housing 제외 고정 · `stateEventWireRow` 주택 철거 행 `houseFootprintBefore` · ⑧ H1~H5·H9(A) · ③ 정규화 · ① 타입 한 줄. **⑧ H1을 여는 커밋은 ⑤ 위젯과 같은 푸시여야 한다 — 질문이 없는데 ⑧이 요구하면 막다른 길** | `nbl-other-state-history-scope.ts`(100 → ≈ 150) · `non-business-land-request.ts`(270, +≈ 6) · `transfer-tax-validate-nbl-state-history.ts`(62 → ≈ 110) · `transfer-tax-validate-nbl.ts`(371, +≈ 6) · `calc-wizard-asset-migrate-nbl.ts`(93, +≈ 4) |
| **UI-A-2** | ⑤ 위젯 A(variant housing · 철거 행 정착면적 카드·미리보기) · 미리보기 데이터 · ⑦ 결과 표 variant(A) | `OtherLandStateHistorySection.tsx`(355 → ≈ 420) · `HousingLandDetailSection.tsx`(63 → ≈ 85) · `nbl-other-state-history-preview.ts`(96 → ≈ 125) · `NblStateHistoryPeriodTable.tsx`(191 → ≈ 225) |
| UI-A-3 | E2E A(E1~E11 · E12) · 반전 보정(§10) · mutation ①~⑮ | `e2e/transfer-nbl-house-state-history.spec.ts`(≈ 220) |
| 0′ | **엔진 E3d-2(B)**: `buildingKindBefore` · `housePriorNeedsMetropolitan` · `houseKindEventIssue` · ⑫ 행 스키마 `buildingKindBefore` · ⑭ `metroRaw` 게이트 조건부 개방 · 기타토지 apply 주택 구간 · 고지(§4.5 B분 · Q-12 상수) | 엔진 소관 |
| **UI-B-1** (E3d-2 뒤) | **④ 수도권 게이트 확장**(`housePriorNeedsMetropolitanOf` 호출 — 안 열면 BP1 그대로) · `stateEventWireRow`의 `buildingKindBefore` · ⑧ H10·H11 · ③ `buildingKindBefore` 정규화 · UQ-12 결정 반영 | `non-business-land-request.ts`(+≈ 4) · `nbl-other-state-history-scope.ts`(≈ 150 → ≈ 185) · `transfer-tax-validate-nbl-state-history.ts`(≈ 110 → ≈ 140) |
| **UI-B-2** | ⑤ 위젯 B(철거 행 종류 카드 · 정착면적 · 조건부 `MetropolitanAreaField` · Q-12 hint) · ⑦ 표 B 행 변형 — **분기가 3곳을 넘으면 행 카드 추출**(UQ-3) | `OtherLandStateHistorySection.tsx`(≈ 420 → ≈ 480) 또는 `OtherLandStateEventRow.tsx`(신규 ≈ 200) |
| UI-B-3 | E2E B(EB1~EB10) · 반전 보정 · mutation ⑯~㉔ | `e2e/transfer-nbl-house-prior-demolished.spec.ts`(≈ 220) |

**주의(순서)**: ① UI-A-1을 위젯보다 먼저 머지하면 ⑧이 질문을 요구하는데 화면에 질문이 없는 «막다른 길» — A-1·A-2는 같은 브랜치·같은 푸시. ② **UI-B-1(④ 수도권 게이트)을 열기 전에 B 칸을 화면에 두면** 수도권 값이 비워져 보수적 3배로 계산돼 «초과» 접힘(§1.3 BP1) — B 위젯과 게이트는 같은 푸시. ③ 엔진 E3d-2가 Q-12 확정을 기다리는 동안 UI-A는 막지 않는다(엔진 §7.4). 800줄 근접 파일 0건(최대 `transfer-tax-validate-nbl.ts` 371).

---

## 15. 재제안 금지·기결정 준수

- ⛔ V5-G2 · Q-8 (가) 겸용 상가분 부수토지 — 이 문서에 없다(겸용주택 철거는 B에서 «주택»으로 고르지 않는다는 **안내만** — 엔진 D-5·V-17) · 과세기준일(6.1.) 접기 — 구간은 일 단위.
- **Q-3a (나)** 주택 배율 초과분 방침: **양도일 현재** 초과 경로는 현행 유지(UQ-7·X12). **과거** 주택 구간의 초과 접기(Q-5 (나))는 이 방침 대상이 아니다(엔진 §3.5) — 이 문서는 후자를 «그 구간 비사업용 + 고지»로 보이기만 한다.
- 「모름」 = 현행 + 확인 필요(통합 Q-6) 재사용 — 정착면적 모름의 탈출구는 **이력 질문 «모름»**(엔진 D-17).
- 자동 안분 fallback 0(정착면적 빈칸 = 빈칸 — 가정값 채움 0 · 「양도일 현재 주택 있음」은 지목 파생) · `useEffect → store` 0 · native 토글/라디오 0 · placeholder 숫자 0 · 정착면적 «모름» 기본값 0.
- 사건이 유예기간을 자동 생성하지 않는다(통합 Q-10 (가)) 재사용 · 철거 후 9호 유예 유지(엔진 Q-8 (가)).
- 주택 양도 시 부수토지 초과분 자동 카드(`__excess`) 비접촉(§1.1).
- 법 근거는 엔진 계획서의 몫(Q-2 (가) 결정 · 직접 해석례 0건) — UI는 고지 상수만 읽고 단정하지 않는다. 납세자 유리·불리 표현 금지(결과 문구는 엔진 상수 — «과대 근사»·«절벽»은 계획서 내부 표현).

---

## 16. 자가 검토 (plan-design-self-review-loop · v2 갱신)

| # | 점검 | 결과 |
|---|---|---|
| S1 | **④⑤⑧이 같은 술어인가** | §5: 지목 축 `nblStateHistoryApplies` 1개(소비표 술어 직접 호출) + **B 수도권 `housePriorNeedsMetropolitanOf`(엔진 술어 직접 호출 · wire events 인자)**. 배율은 게이트에서 제외(UQ-7 (다)). 소스 grep 게이트(§11.1)와 mutation ⑫⑯가 강제 |
| S2 | 교차 조합 전수 | §9 34행(X1~X34). A·B × 의제·축 B 지분(V-19)·다필지·배율 초과·무조건 의제·별장 REDIRECT·appurtenant·이월과세·모름·stale(연접 다필지·모드 `unchanged`·`tax_type_changed`·선언 키·종류 전환)·수용·미지정 |
| S3 | 실측 vs 추정 | probe 실측은 §1.3(A 현행 3 · flip 모의 6 · 의제 2 · **B 현행 2**)에만. 오라클 수치는 엔진 계획서 인용(이 세션 재측정 아님 — UV-4). 법령은 단정 안 함 |
| S4 | 14지점 | §6: 중첩 칸 2개의 ①③④⑫⑭ + 수도권 게이트 ④⑭ + ⑧ H9~H11. **⑧만 가진 규칙(H1·H3b·H9·H10)과 ⑫ 접힘(200)을 §7 격자에서 열을 나눠 단언** — «UI 통과 ↔ API 400» 모순 0 확인 |
| S5 | 반전 | grep 후보까지만(UV-1). B는 기존 기타토지 철거 행 바이트 동일(§7.1 B7) |
| S6 | 정책 3종 | useEffect 미러링 0 · 자동 안분 0(정착면적·종류 가정값 0) · ⑧ 동기화(H1~H12 + parity 격자 P1~P20) |
| S7 | 엔진 결정을 UI가 짓지 않았는가 | A-1~A-14 + §17. v1의 `housingHistoryScope`·`subject`·`houseWithinLimitBefore` 요청은 철회·폐기 |
| S8 | 자가 정정 이력 | v1: ① `nblOtherStateHistoryApplies` 확장 결함(D5) → 기타토지 전용 고정 ② 철거 행 칸 누락 → 이후 Q-11로 **3지선다 → 정착면적 숫자**로 교체 ③ UQ-7을 (다)로 변경. **v2**: ④ **B 수도권 술어에 폼 저장 events를 넘기면 `unchanged` stale에서 막다른 길**(X27) → wire events 인자 고정 ⑤ **UQ-12(의제 × 새 ⑧ 규칙)를 새로 발견**(엔진이 의제에서 이력을 읽지 않음) ⑥ 정착면적 > 토지 면적 «이내 오독»은 엔진 Y-31이 막고 UI H9가 이중 차단 |

---

## 부록. 엔진 계획서에 요청 사항 (R-n — v2)

| # | 요청 | 상태 |
|---|---|---|
| R-1 | 소비표 새 열 | **철회** — 엔진은 기존 열 확장 + `consumesHousingStateHistory`. UI가 기타토지 술어에서 housing 제외로 대응(A-1) |
| R-2 | 배율 포함 scope 술어 | **철회** — UQ-7 (다) |
| R-3 | 검증 문구 «주택» 변형 | ✅ **해소** — 엔진 D-9 |
| R-4 | 주택 `tax_type_changed`·마지막 철거 | ✅ **해소** — 엔진 D-1·D-2 |
| R-5 | echo `subject` | **철회** — `buildingKind`·`houseCheck` echo(A-7) |
| R-6 | UQ-5 안내 상수 | ✅ **해소** — `HOUSING_NON_HOUSE_BUILDING_NOTICE`(엔진 §4.5) |
| R-7 | 케이스 표 공유 | **유지** — 엔진 `_helpers/nbl-state-history-e3-3-table.ts`(Anchor 1)를 E2E·route anchor가 인용(A·B 행) |
| R-8 | 초과 + 유예 충족 시 scope | ✅ 해소 — 엔진 §4.1 |
| R-9 | 정착면적 > 토지 면적 `houseFootprintIssue` ⑧ 공용 leaf(엔진 §5 leaf 행) 이름·시그니처를 UI가 직접 호출할 수 있게 export | **유지**(확인) — ⑧ H9·⑤ 칸 오류 표시가 같은 함수 |
| **R-10** | **의제 선택 시 이력이 읽히지 않는 조건의 엔진 술어 export**(예 `stateHistoryDeemedBlocks({ landType, deemedReason })`) — UI `deemedBlocks`(`OtherLandStateHistorySection.tsx:109`)·UQ-12 (가) ⑧ 건너뜀이 같은 함수를 읽게 | 신규 — UQ-12 (가) 채택 시 |
| **R-11** | `housePriorNeedsMetropolitan`의 `events` 인자 타입이 **wire 사건(`buildingKindBefore` 포함)** 을 그대로 받는지(폼 타입이 아니라) · `NBL_STATE_BUILDING_KIND_VALUES`·`StateEvent` 타입 export | 신규 — 확인 |
| R-12 | **양도일 현재 정착면적**(`nblHousingFootprint`) > 토지 면적에 대한 ⑧ 규칙 범위(엔진 Q-10 (가) «A·B 공통»이 `houseFootprintBefore`만인지) | 신규 — UV-18 |

---

## 17. 엔진 계획서 정합 기록 (v4 · 2026-11-24)

| # | 엔진 계획서 v4 | UI 계획서(이 문서) | 일치/어긋남 · 처리 |
|---|---|---|---|
| ① | Anchor 7: `nbl-state-history-gates.anchor.test.ts`의 «housing_site: 기타토지만 true»를 반전(§7.2). 엔진 §5 소비표 행은 «UI가 `nblOtherStateHistoryApplies`를 기타토지 전용으로 고정하므로 gates 진리표 테스트는 불변»이라고도 적었다 | UI는 기타토지 전용 고정 → 이 파일 **불변**, `nblStateHistoryApplies` 디스패처 진리표 신설 | ⚠ **엔진 계획서 내부가 두 문장으로 갈린다**(§7.2 Anchor 7 vs §5 소비표 행) — 합칠 때 «반전 대상 = `nbl-state-history-leaf.test.ts:511-513` 소비표 진리표 · gates 테스트 불변»으로 정정 |
| ② | 소비표 기존 열 확장 + `consumesHousingStateHistory` | A-1 | 합의 |
| ③ | 새 중첩 칸: `buildingKindBefore`·`houseFootprintBefore`(`houseWithinLimitBefore` 폐기 — Q-11 (나)) | ①③④⑫ · UQ-11 대체 | 일치(v2에서 교체) |
| ④ | D-1·D-2·D-8(⑧·⑫ 차단 — 구조) | H4·H5·H11 ✅ 400 | 일치 |
| ⑤ | **정착면적·수도권 규칙은 ⑧만 가진다**(⑫′에 거울 없음 — D-16) | H9·H10 «⑫ 거울 없음 · 직접 API 200 접힘/경고» · parity 격자 «⑫ 상태» 열 | 일치 |
| ⑥ | T-4 `tailHasBuilding = true`(⑭) | ④ `nblOtherHasBuilding` true 고정 | 일치(같은 값) |
| ⑦ | 배율 초과(양도일 현재) = 무변경 + PARTIAL(`changed`일 때) | UQ-7 (다) 안내 1줄 | 일치 |
| ⑧ | echo `buildingKind`·`houseOutcome`·`houseCheck` | ⑦ 표 variant · 허용 면적 echo 그대로 | 일치 |
| ⑨ | Q-6 필수(⑧만) · UQ-1~UQ-11 승인 | UQ-1 (가) | 일치 |
| ⑩ | Q-3 (가) | UQ-6 (가) | 일치 |
| ⑪ | Q-7 (나) 정착면적 + 카드 단위 수도권(`housePriorNeedsMetropolitan` 조건부 — 소비표 false 유지) | §4.4 · §5 · H10 · ④ 게이트 확장 | 일치 — UI가 술어를 **wire events 인자로** 호출 |
| ⑫ | V-10 정착면적 0 + `changed` ⑧ | 해소: 정착면적 필수 규칙이 이력 규칙 앞 + H9가 `houseFootprintBefore` 담당 | UI 측에서 닫음 |
| ⑬ | 엔진 §5 ⑫′: 정착면적·수도권 «⑧만 가진 규칙» 서술 | H9·H10 + UQ-12 의제 건너뜀(엔진 B12는 의제 시 이력 미적용) | ⚠ 엔진 §5의 «⑧만 가진 규칙» 목록에 UQ-12(의제 시 건너뜀) 결정이 필요 — UQ-12 (가) 채택 시 R-10 |
| ⑭ | V-19 축 B 지분 토지 면적 «확인 필요» | UV-14 · X26 · EB9 | 일치(둘 다 미확인) |
| ⑮ | Q-12 (가) 종류 `""` 우회 현행 유지 + `BUILDING_KIND_HINT_NOTICE` | §4.4 hint · EB5 · B7 | 일치 |
| ⑯ | 현행 M15 198,210,000 `not_judged`(500㎡·정착 100㎡·→2024-01-01) | §1.3 probe A(1,000㎡·정착 400㎡·→2024-06-30)도 198,210,000 · B probe BP1 N 253,960,000(엔진 B0·B1 현행 일치) | 일치(시료 다름) |

---

## 18. UI-A 구현 기록 (2026-11-24 — UI-A-1/2/3 · B 경로는 범위 밖)

계획서 §5·§6·§7·§11을 그대로 구현했다. 계획과 달라진 점·덧붙인 점만 적는다.

| # | 구현에서 확정한 것 |
|---|---|
| 1 | 디스패처 `nblStateHistoryApplies` = `nblOtherStateHistoryApplies ∨ nblHousingStateHistoryApplies`(`lib/calc/nbl-other-state-history-scope.ts`). 사건 사용 중 판정은 `nblStateEventsInUse`(기타토지 토글 파생용 `nblOtherStateEventsInUse`는 기타토지 전용으로 그대로). ④ `stateHistoryWireFields`·⑧ `validateNblStateHistory`·⑤ 주택 카드 마운트가 디스패처를 읽는다 |
| 2 | ⑧ 철거 행 정착면적(H9) = 엔진 leaf `houseFootprintIssue`를 `housePriorFootprintIssueOf(asset, i)`가 부르고(⑧ 규칙 · ⑤ 칸 오류 표시 공용), 주택 구간 판정은 엔진 `eventClosesHouseInterval`. **⑤ 칸 오류는 빈칸을 띄우지 않는다**(입력 전 소음 방지 — 빈칸은 ⑧이 막는다) |
| 3 | 주택 카드 ⑧ 호출 위치는 `validateNblDetailedJudgment` 안, 정착면적 필수 규칙 **바로 뒤**(V-10). 기타토지는 기존 `validateNblOtherLand` 호출 그대로 — 같은 함수 `validateNblStateHistory`가 접두(«주택 부수토지 —»/«기타토지 —»)와 사건 주체(`stateEventSubjectOf`)만 지목으로 가른다 |
| 4 | 양도일 현재 배율 초과 안내(UQ-7 (다))는 `housingAreaLimitState`(표시 전용 — 엔진 `judgeHousingLimit` 직접 호출). **수도권 미선택이면 수도권·비수도권 두 결과가 같을 때만 확정**하고 갈리면 안내를 띄우지 않는다. 문구는 새로 짓지 않고 엔진 `NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE`를 읽는다 |
| 5 | 주택 `unchanged`에는 새 고지가 없다 — 엔진 A-10(바이트 동일)이고 기타토지 `UNCHANGED` 문구는 «업종·호별 용도·재산세 분류»를 말해 주택에 맞지 않는다 |
| 6 | 기타토지에서 입력하다 지목을 바꾼 stale `tax_type_changed` 행은 화면에 남고(종류 «선택 안 됨») 구분·선언 카드를 그리지 않으며, 엔진 `houseTaxTypeChangedMessage`를 그 행 안에 보인다. ⑧ H4가 막고 행 삭제로 통과(E6) |
| 7 | 철거 행 허용 면적 미리보기와 결과 구간표가 **같은 문구 함수**(`lib/calc/nbl-house-interval-text.ts` — 엔진 echo `houseCheck`만 읽고 재계산하지 않는다)를 쓴다. 미리보기는 정착면적이 ⑧ 결함이면 표 자체를 그리지 않는다(판정과 어긋난 표 금지) |
| 8 | 정적 게이트 갱신: `nbl-state-history-leaf-unreachable.test.ts` WIRE-4b(고지 상수 사용처 + 위젯) · WIRE-9(배율 leaf 사용처 + ⑤ 미리보기) · `nbl-state-history-e3-1-wire.test.ts`(초기 건축물 상태 인자 = 기타토지 토글 · 주택 `true`). 신규 `nbl-housing-state-history-wire-guard.test.ts`가 ④⑤⑧ 자체 지목 조건 금지·침묵 소실 grep을 고정 |
| 9 | 반전 보정: `nbl-housing-land-metropolitan-validate-b6.test.ts` 픽스처에 질문 «바뀐 적 없음» 추가(UV-1 실측 — 1파일 4건) · 엔진 route anchor T-4의 `nblOtherHasBuilding` 단언을 «토글 stale» → «④가 true로 고정»으로 정정 |
| 10 | 미해결(엔진 소관): ⑧ H1 문구는 엔진 상수 `STATE_HISTORY_MODE_REQUIRED_MESSAGE`가 «건축물»이라 주택 카드에서도 «이 토지 위 건축물이…»로 나온다(접두 «주택 부수토지 —»는 붙는다). 주택 변형 문구가 필요하면 엔진 `subject` 인자 확장 요청 |

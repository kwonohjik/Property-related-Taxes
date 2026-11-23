# 기타토지 상태 이력 E3-③ 「주택부수토지(법 §104의3①5호) 신축·철거 이력」 — 엔진·판정·API(⑨~⑭) 측 계획

> 상태: **Plan v4 (2026-11-24 · 사용자 결정 반영)** — v3에 2026-11-24 추가 사용자 결정(**Q-10 (가)** 정착면적 빈칸·0·음수·비수치·정착>토지 전부 ⑧ 차단 · **Q-11 (나)** A도 `houseFootprintBefore`로 통일하고 `houseWithinLimitBefore` 폐기 — Q-4 (가)/UI UQ-11 대체)을 반영했다. 직전 v3는 v2(2026-11-23)에 2026-11-24 사용자 결정(**Q-7 (나)** B는 철거 전 정착면적(행별) + 카드 단위 수도권 여부를 입력받아 엔진이 배율 판정 · Q-8 (가) · Q-9 분리)을 반영해 **B 설계를 다시 썼다**(§3.4 · §4.3 · §5 · §6.2 · §7). 2026-11-23 결정(Q-1 (나) A+B · Q-2 (가) · Q-3 (가) · Q-4 (가) · Q-5 (나) · Q-6 필수 · UI UQ-1~11 승인)과 UI 시니어 정합 사항(Anchor 7 범위 · R-3 · R-6 · T-1)은 그대로 유지한다. 코드 변경 0(계획서만) — throwaway probe(격리 사본)와 mutation 12건은 실측 후 사본째 삭제했고 워크트리 `git status`에 이 문서·UI 계획서 외 변경이 없음을 확인했다.
> base: `master` d17b8b68a · 브랜치 `docs/nbl-e3-3-house-appurtenant-plan` · 짝 문서: `nbl-state-history-e3-3-house-appurtenant.ui.plan.md`(UI 시니어 — 이 문서는 건드리지 않는다)
> 선행 정본: `nbl-other-land-state-history.{plan,engine.plan}.md`(§2.2 · §6 M15 · §7.4 E3 행 · §8.1 Q-1 (나) · Q-4 (가) 부분 면적) · `nbl-state-history-e3-1*.md`(사건 배열 + Before 사슬 · 각 목 합집합) · `nbl-state-history-e3-1b-bare-land-tax-type.engine.plan.md`(나대지 구간 선언) · `nbl-state-history-e3-2-business-period.engine.plan.md`(형식 · 결정 레지스터)
> **번호 규칙**: 이 문서는 `Q-n`(사용자 결정) · `V-n`(미검증) · `D-n`(설계 확정 — 사용자 결정 불필요) · `T-n`(함정). 합칠 때 `E3d-Q-n`·`E3d-V-n`으로 재번호한다(UI 문서는 `UQ-n`·`UV-n`).
> **검증 표기**: 「확인」= 이 세션에서 파일·KoreanLaw MCP 본문을 직접 읽음 / 「실측」= throwaway probe 수치 / 「오라클」= 제안 모델의 사업용 구간을 `meetsPeriodCriteria`에 직접 넣은 값 — **제안 모델은 미구현이라 «기대» 열은 전부 오라클**이고 구현 PR이 같은 표로 대조한다(측정값이 다르면 표를 맞추지 말고 원인을 먼저 본다) / 「위장 실측」= B 방향을 **현행 엔진에 «철거 직전 재산세 구분 = 별도합산»으로 입력해 얻은 실제 엔진 값**(주택 구간을 사업용으로 세는 모델과 구간 구조가 같아 구현 후 «배율 이내 판정된 주택 구간»이 낸 값과 같아야 한다) / 「확인 필요」= 읽지 못했거나 근거가 없음.
> 약칭: 법 = 「소득세법」, 영 = 「소득세법 시행령」, 규칙 = 「소득세법 시행규칙」. **금액은 `makeMockRates`(`__tests__/tax-engine/_helpers/mock-rates`) 기준이라 차이의 유무·방향·규모만 유효**하다. 공통 거래: 양도가 10억 · 취득가 3억. 같은 거래의 전량 사업용 B · 전량 비사업용 N(실측, `calculateTransferTax`): 2014-01-01 → 2024-01-01 **B 198,210,000 · N 253,960,000**(차 55,750,000) · 2014-01-01 → 2024-06-30 B 198,210,000 · N 253,960,000 · 2022-07-01 → 2024-06-30 B 257,010,000 · N 326,760,000(차 69,750,000) · 2022-07-01 → 2023-12-31 B 279,000,000 · N 326,760,000(차 47,760,000).

### 변경 요약 (v1 → v2 → v3)

| 항목 | v1 | v2 (2026-11-23) | **v3 (2026-11-24)** |
|---|---|---|---|
| 범위(Q-1) | A만 | A + B(B = 종류 칸 + 배율 이내 3지선다) | A + B — **B는 철거 전 정착면적 수치 입력으로 재설계** |
| B 배율 판정(Q-7) | — | 사용자 3지선다 선언(추천 (가)) | **(나) 결정 — 철거 행 `houseFootprintBefore`(㎡) + 카드 단위 수도권 여부 → 엔진이 `getHousingMultiplier`·`areaTimes`·`judgeAreaLimit`로 판정**(단일 소스 `housing-limit.ts` 추출 — §3.4 · D-12) |
| 9호 유예 + `exceeded`(Q-8) | — | (가) 추천 | **(가) 결정**(유예 유지 + 0792 고지) |
| PR 분할(Q-9) | — | 분리 추천 | **분리 결정**(E3d-0 → E3d-1 A → E3d-2 B) |
| 새 Q | — | Q-7·Q-8·Q-9 | **Q-10 (가) · Q-11 (나) 결정**(v4) · **Q-12 (가) 결정**(종류 `""` 우회 — 현행 유지 + 안내) |
| 배율 연혁(V-5) | 미확인 | 미확인 | **해소(법령 구조)** — 영 부칙 제30395호 제2조②·제39조: **양도일 기준**(D-11) |
| mutation | 5건 | 8건 | 12건(P-9~P-12: 배율 표·면적 한도 경계·수도권 전송 게이트·⑧ 수도권 규칙) |

**v4(2026-11-24 추가 결정) 요약**: **Q-10 (가)** — 정착면적 빈칸·0·음수·비수치·정착면적 > 토지 면적 **전부 ⑧ 차단**(현존 housing E1-03 정합). 직접 API(⑫·엔진)는 기존 정책대로 **400 없이 `unconfirmed` 접힘**(정착면적 > 토지 면적도 접힘 — 자동 «이내» 방지). **Q-11 (나)** — A도 `houseFootprintBefore`로 통일, **`houseWithinLimitBefore` 폐기**(⑫ 칸 1개·enum 1개 감소). **Q-12 (가) 결정(2026-11-24 — 현행 유지 + `NBL_STATE_HISTORY_BUILDING_KIND_HINT_NOTICE` 안내)** — 정착면적을 모를 때 «건축물 종류 = 그 밖(`""`)»으로 ⑧을 우회하는 경로 — 실측 §2.2). 정착면적을 모르는 사용자의 정상 탈출구는 **이력 질문 «모름»(`unknown`) = 현행 판정 + 고지**다.

---

## 0. 한눈에

> ### ✅ 사용자 결정
> | Q | 결정 | 일자 |
> |---|---|---|
> | Q-1 | **(나) 두 경로 모두** — A 주택부수토지 카드(양도일 현재 주택) + B 주택 철거 후 나대지 양도(기타토지 카드) | 2026-11-23 |
> | Q-2 | **(가) 일 단위 합산** + 결과 고지 «직접 해석례 없음 — 확인 필요» 상수 | 2026-11-23 |
> | Q-3 (가) · Q-4 (가) | 신축 앞 나대지 구간 E3-1b 선언 재사용 · A 철거 행 과거 주택 구간 선언(`houseWithinLimitBefore` 3지선다) — **Q-4 (가) · UI UQ-11은 2026-11-24 Q-11 (나)로 대체됨**(`houseFootprintBefore`) | 2026-11-23 |
> | Q-5 | **(나) 그 구간 비사업용 + 고지**(«초과»가 «모름»보다 유리해지는 역전 방지) | 2026-11-23 |
> | Q-6 | **필수(⑧만)** — ⑫·엔진은 `""`·미전송 = 현행(400 아님) · UI UQ-1~UQ-11 추천안 전부 승인 | 2026-11-23 |
> | **Q-7** | **(나) 종류 + 철거 전 정착면적(철거 행마다) + 카드 단위 수도권 여부 입력 → 엔진이 배율 판정** (v2 추천 (가) 3지선다가 아님) | **2026-11-24** |
> | **Q-8** | **(가) 9호 유예 유지 + 부동산거래관리과-0792 고지** | **2026-11-24** |
> | **Q-9** | **분리** — E3d-0 → E3d-1(A) → E3d-2(B) | **2026-11-24** |
> | **Q-10** | **(가) 전부 ⑧ 필수 차단** — 정착면적 빈칸·0·음수·비수치·정착면적 > 토지 면적(housing E1-03 정합). 직접 API는 기존 정책대로 400 없이 `unconfirmed` 접힘 | **2026-11-24** |
> | **Q-11** | **(나) A도 `houseFootprintBefore`로 통일**(`houseWithinLimitBefore` 폐기) — Q-4 (가)·UI UQ-11 **대체**. A의 정착면적 오입력도 Q-10 (가)와 같이 ⑧ 차단 | **2026-11-24** |
> | **Q-12** | **(가) 현행 유지 + 안내** — 종류 `""` = 주택 아닌 건축물(바이트 동일 유지) · `NBL_STATE_HISTORY_BUILDING_KIND_HINT_NOTICE` 신설(§4.5 — B 철거 행 종류 칸 hint · 종류 `""` + 비종합합산 구분 선언인 이력 적용 결과 고지) | **2026-11-24** |
>
> **착수 가능성**: **E3d-0 · E3d-1(A) · E3d-2(B) 모두 즉시 착수 가능**하다(Q-1~Q-12 결정 완료 — E3d-2 착수 게이트 **결정 완료**).

| 항목 | 결론 |
|---|---|
| 문제 | 주택부수토지 판정(`judgeHousingLand`)은 **양도일 현재 상태(정착면적 × 배율 ≥ 토지면적)로 소유기간 전체를 사업용 처리**하고 기간기준을 보지 않는다(`not_judged`). ① **A — 신축 직후 양도(M15)**: 주택이 없던 오랜 나대지 기간이 통째로 사라진다(과소 +55,750,000). 이력 칸은 소비표(`INPUT_CONSUMPTION.housing.stateHistory = false`)에서 막혀 있다. ② **B — 주택 철거 후 나대지 양도**: 기타토지 카드의 철거 사건은 «철거 직전 재산세 **토지** 구분»만 받는데 주택은 그 구분이 아니라(지방세법 §106②) **주택 구간을 «별도합산»으로 위장해야만** 사업용이 된다. 위장하지 않으면(모름·종합합산) 과대(−55,750,000). |
| 실측(현행) | **A (M15)** — 주택부수토지 500㎡ · 정착면적 100㎡(수도권 밖 일반주거 5배 = 허용 500㎡ → 배율 이내) · 2014-01-01 → 2024-01-01 · 준공 2023-06-01: **현행 사업용 198,210,000 · `not_judged`**(이력 입력해도 같은 값). 오라클 **비사업용 N 253,960,000**(사업 214/3,651 · 직전5년 비사업 1,612>730 · 직전3년 881>365 · 총 3,437>1,460). **B** — 철거 2019-01-01 + 9호 유예 731일, 이력 없음: **현행 N 253,960,000** · 주택 구간을 사업용으로 세면 **B 198,210,000**(eff 2,556 · 유예 731 — 위장 실측 = E2 M3). |
| 법적 구조 | 법 §104의3①5호는 「**지방세법 제106조제2항에 따른 주택부속토지 중** 주택이 정착된 면적에 … 배율을 곱하여 산정한 면적을 **초과하는 토지**」다 → **배율 이내 주택부속토지는 5호에 해당하지 않고 비사업용 토지가 아니다**(부동산거래관리과-1273 · 조심 2018서0295 — 법문은 4호가 주택부속토지를 명시 제외하지 않으므로 이 결론은 해석례에 기댄다, V-14). 주택이 없는 날의 토지는 주택부속토지가 아니므로 5호가 아니라 4호(나대지)로 따진다(**법문 구조 추론** — 직접 해석례 0건, V-1). 소유기간 중 지목이 바뀌면 «지목별 비사업용 해당 기간을 합산»한다(서면인터넷방문상담4팀-2211). → 일 단위 구간 합산이 법 구조(Q-2 (가) 결정). |
| 추천 모델 | **(A) 기타토지 사건 모델 확장** — 같은 사건 배열 · 같은 leaf에 **주택 구간 종류(`buildingKind = "house"`)** 를 더한다. **A**: 주택부수토지 카드는 `tail.buildingKind = "house"` + `judgeHousingLand` **배율 이내 분기에 후처리 1개**(`applyHousingStateHistory`). **B**: 기타토지 카드의 철거 행에 `buildingKindBefore = "house"` + **`houseFootprintBefore`(㎡)** — 엔진이 **카드의 토지 면적(`acquisitionArea`)·용도지역(`nblZoneType`)·수도권 여부 + 양도일**로 영 §168의12 배율을 계산해 이내/초과를 가린다. 배율·한도 계산은 `judgeHousingLand`가 쓰는 함수(`getHousingMultiplier` · `areaTimes` · `judgeAreaLimit`)를 **같은 helper(`housing-limit.ts`)로 추출해 공유**한다(단일 소스). 판정은 **기존 `applyStateHistory`가 그대로**(과거 구간 술어만 확장). |
| **초과분(Q-3a (나)) 경계** | **양도일 현재 상태의 배율 초과 경로(`judgeHousingLand` 초과 분기 · D1 유예만)는 한 줄도 건드리지 않는다** — 이력 미반영 + `PARTIAL_AREA` 고지. B는 `judgeHousingLand`를 호출하지 않고 helper(순수 계산)만 공유한다. **과거** 주택 구간이 정착면적으로 «초과» 판정되면 그 구간 비사업용 접기 + 고지(Q-5 (나)). |
| 고지(Q-2) | 이력 적용 결과에 `NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE`(§4.5). |
| 🔴 T-1(실측) | A: 이내 분기 결과를 비사업용으로 뒤집을 때 `areaProportioning`(비율 0)을 그대로 두면 `nonBusinessAreaRatio = 0` → **판정은 비사업용인데 세액은 사업용 198,210,000**(`engine.ts:385`). 뒤집힐 때 `areaProportioning = undefined`. B는 기타토지 core라 해당 없음. |
| 하위호환 | `""`·`unchanged`·미전송 = 현행 바이트 동일. `buildingKindBefore` 미전송·`""` = 종전 철거 행과 바이트 동일(수도권 칸 게이트도 종전과 같다 — D-13). `unknown`만 고지 한 줄. |
| 14지점 | ⑫ 중첩 칸(`buildingKindBefore` · `houseFootprintBefore` — A·B 공용 정착면적, `houseWithinLimitBefore` 폐기) · ⑫′ 종류·시퀀스 규칙 · ⑭ 주택·B 운반 + **수도권 게이트 조건부 개방** · ④ 와이어 게이트 · ⑧ 규칙(UI — 정착면적 빈칸·0·음수·비수치·정착>토지 전부 차단, Q-10 (가)). 새 최상위 칸 없음(`nblIsMetropolitanArea`는 ⑫에 이미 있다). |
| PR | **E3d-0**(테스트만 · A·B 표) → **E3d-1(A)** → **E3d-2(B)** → UI → E2E(Q-9 결정). |

---

## 1. 법령 근거와 해석례 (KoreanLaw MCP 본문 확인 · 2026-11-23)

### 1.1 법령 본문

| 대상 | MST·시행 | 확인한 것 |
|---|---|---|
| 법 §104의3 | 280405 (2026.1.1.) | ① 각 호 외의 부분 「해당 토지를 **소유하는 기간 중** 대통령령으로 정하는 기간 동안 **다음 각 호의 어느 하나에 해당하는 토지**」 · ①4호 「농지, 임야 및 목장용지 외의 토지 중 다음 각 목을 제외한 토지」(가 재산세 비과세·면제 · 나 지방세법 §106①2호·3호 별도합산·분리과세 · 다 대통령령) · **①5호 「「지방세법」 제106조제2항에 따른 주택부속토지 중 주택이 정착된 면적에 지역별로 대통령령으로 정하는 배율을 곱하여 산정한 면적을 초과하는 토지」** · ② 부득이한 사유 |
| 영 §168의6 | 290841 (2026.10.1.) | 「**이 경우 기간의 계산은 일수로 한다**」 · 1~3호 «비사업용 기간 = 가·나·다 **모두** 해당하는 기간» — 지목·호로 가르지 않는다(법 §104의3① **각 호 외의 부분**의 기간기준) |
| 영 §168의12 | 290841 | 주택부속토지 배율: 도시지역 내 — 수도권 주·상·공 3배 · 수도권 녹지 5배 · 수도권 밖 5배 / 그 밖 10배. 후단 수용 양도는 사업인정 고시일 전날 용도지역 |
| 영 §168의14 | 290841 | ① 「**해당 각 호에서 규정한 기간동안** 법 §104의3①의 각 호의 어느 하나에 해당하지 않는 토지로 보아」 판정(유예 = 의제 → 합집합) · ③3호 공익사업 수용 무조건 의제 |
| 규칙 §83의5 | 286379 (2026.5.22.) | ①5호 「지상에 건축물이 정착되어 있지 아니한 토지를 취득하여 사업용으로 사용하기 위하여 건설에 착공(…)한 토지: 취득일부터 2년 및 착공일 이후 건설이 진행 중인 기간」 · **①9호 「건축물이 멸실ㆍ철거되거나 무너진 토지: … 날부터 5년」**(개정 규칙 부칙 제4조 — 양도하는 경우부터 적용, 현행 구현 `demolitionGraceYears`) |
| 지방세법 §106 | 282559 (2026.1.1.) | ① 토지 3분(종합합산·별도합산(다목 «철거ㆍ멸실된 건축물 또는 **주택**의 부속토지»)·분리과세) · **② «주택 부속토지의 범위 산정»** — 주택 부속토지는 토지 3분이 아니라 주택 쪽 구분이다 |

### 1.2 해석례·재결례 (본문 열람)

| 건 | 요지 | 쓰임 |
|---|---|---|
| **서면인터넷방문상담4팀-2211(2007.07.19.)** 회신 2 | 「토지 소유기간 중 **지목이 변경된 경우, 지목별로** 법 §104의3①각호에 해당하는지 판단하며 … 영 §168의6의 기간을 계산함에 있어서는 **‘지목별 비사업용토지 해당’ 기간을 합산**하는 것」 | **Q-2의 직접 근거(유추)** — 호가 다른 기간의 합산. 사안은 지목 변경(농지 → 건축 착공)이지 «나대지 → 주택»이 아니다 → 유추(V-1) |
| 부동산거래관리과-1273(2010.10.21.) | 질의: 주택 보유 21년 2개월 + 멸실 후 2년 = 사업용 기간 합산이 소유기간의 82.7%. 회신: 「주택부속토지 중 … **배율을 곱하여 산정한 면적 이내의 토지는 비사업용 토지에 해당하지 않는 것**이며, 건축물이 멸실된 토지는 **멸실된 날로부터 2년 동안**은 규칙 §83의5①9호에 따라 비사업용 토지에 해당하지 않는 것」 | **배율 이내 = 5호 불해당** 확인 · 주택 구간 + 철거 후 유예의 «기간 합산» 구조를 질의가 전제하고 회신이 부정하지 않음(회신은 합산 결론을 직접 말하지 않는다) |
| 서면인터넷방문상담4팀-2637(2006.08.02.) · 5팀-593(2007.02.15.) · 4팀-3290(2007.11.14.) · 5팀-818(2008.04.15.) | 주택과 그 부수토지를 소유하던 자의 주택이 멸실된 토지는 멸실일부터 2년 사업용 기간으로 본다(규칙 §83의5①9호) | **주택도 «건축물»** — 9호 유예 대상(2년은 개정 전 값 — 현행 5년 · 2025.3.21. 전 양도 2년은 `demolitionGraceYears`가 구현) |
| 서면4팀-3290 · 서면5팀-2323(2007.08.16.) | 「**무허가주택은 적용되지 아니하는 것**」 | 허가·사용승인 없는 주택의 철거 유예 부인 가능 — **현행 규칙 본문에는 허가 요건 문언이 없다** → V-4(유예 행은 사용자 입력이라 안내만) |
| 부동산거래관리과-0792(2011.09.09.) | 철거 후 N년 제외 규정에는 「주택부속토지 중 … **배율을 초과하는 부분은 포함되지 않음**」 | 철거 전 초과분 면적은 철거 후 유예도 못 받는다 → 면적 × 기간 → **이 계획 B(§3.4)에서 Q-5 (나) 접기 + Q-8 (가) 고지로 다룬다**(V-8 — 면적별 부인은 지원하지 않음) |
| 서면5팀-2238(2007.08.03.) · 4팀-2211 회신 4 | 건축물이 없는 토지를 취득해 건설에 착공한 토지는 취득일부터 2년 + 착공 이후 진행 기간을 사업용 기간으로 본다(주택 신축 질의, «사업용으로 사용하기 위하여 건설에 착공»인지는 사실판단 · **농지전용허가 농지는 제외**) | 신축 공사 기간은 **5호 유예 행**(`construction`)으로 입력 — 자동 생성하지 않는다(통합 Q-10 정책) |
| 조심 2018서0295(2018.06.29.) | 쟁점토지가 재산세상 종합합산과세됐더라도 **실질이 주택 부수토지(배율 이내)이면 비사업용에서 제외**. 판단 서술이 단층주택 부수 기간(1974~1991) → 신축건물 부수 기간(1991~양도)으로 **기간을 가르며** 진행 | ① 주택 구간의 사업용 판정은 **재산세 구분(`propertyTaxType`)과 독립**이다(구간 술어가 `propertyTaxType`을 보지 않는 이유) ② 기간별 판단의 선례(신축 앞 나대지 기간에 대한 판단은 아님) |
| **검색 0건** | «주택 신축 전 나대지 기간 비사업용»(국세청 — 4개 키워드 조합 NOT_FOUND) · 조세심판 «주택부수토지 나대지 기간기준» NOT_FOUND | **신축 앞 나대지 기간을 4호 기간으로 센다는 직접 회신은 확인하지 못했다**(V-1) |

> 해석례 본문은 국세법령정보시스템 공개 페이지(법제처 OPEN API 아님 — 인용 전 원문 대조 권장 표기가 붙어 있다). 2006~2011년 해석례의 규칙 §83의5①9호 «2년»·영 §168의12 «5배/10배»·다목 «100분의 20»은 개정 전 값이다 — 이 계획은 해석례를 **구조(기간별 판단·합산·배율 이내 불해당)** 의 근거로만 인용하고 값은 현행 본문을 따른다.

### 1.3 법 구조에서 나오는 판정 규칙 (요약)

| 날의 상태 | 해당 호 | 그 날은 |
|---|---|---|
| 주택 있음 + 토지가 배율 이내 | 5호 불해당(이내분). 4호로 다시 따지지 않는다는 점은 **해석례 결론**(법문은 4호가 주택부속토지를 명시 제외하지 않는다 — V-14) | **사업용 기간** — 근거: 법 §104의3①5호 문언 + 부동산거래관리과-1273(「배율 … 이내의 토지는 비사업용 토지에 해당하지 않는 것」) · 조심 2018서0295(종합합산과세여도 실질 주택부수토지 이내면 제외) |
| 주택 있음 + 배율 초과 | 5호 해당(초과분) | 초과 면적만 비사업용 — **부분 면적**(이 계획 범위 밖: 이력 미반영 · 고지) |
| 주택 없음(나대지) | 4호 — 주택부속토지가 아니므로 5호가 아니다(**법문 구조 추론 · V-1**). 재산세 구분에 따라 가·나목 제외 가능(E3-1b 나대지 선언) | 종합합산이면 **비사업용 기간** · 비종합합산 선언 + 근거면 사업용 |
| 철거 후 유예(규칙 §83의5①9호)·건설 착공(5호) 등 | 영 §168의14① 의제 | 유예 행(사용자 입력)이 **합집합**으로 사업용 |

---

## 2. 현행 사실 (file:line 확인)

| 위치 | 사실 |
|---|---|
| `lib/tax-engine/non-business-land/housing-land.ts:35` | `HOUSING_PERIOD_EVALUATION = { basis: "not_judged", … }` — 이내 분기가 쓰는 echo. 주석(`:31-33`): 배율 초과는 «양도일 현재 상태를 소유기간 전체에 적용»(V2-C2)하고 **유예만** 초과분에 반영(D1 · Q-3a (나)). 사용기간 입력·양도일 의제는 받지 않는다 |
| 같은 파일 `:48-70` | 정착면적 ≤ 0이면 «정착면적 미입력» **전량 비사업용**으로 조기 반환(고지 없음) |
| 같은 파일 `:73` | `warnings.push(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE)` — 판정이 도는 경로에만 싣는 «양도일 현재 상태 적용» 고지 |
| 같은 파일 `:94-101` | `getHousingMultiplier(zoneType, isMetropolitan, transferDate)`(양도일 기준 경과조치) · `judgeAreaLimit(landArea, allowed)` — 정수 정확 비교 |
| 같은 파일 `:111-141` | **이내 분기**: `isBusiness: true` · `areaProportioning{businessArea: 전체, nonBusinessRatio: 0, buildingMultiplier}` · `effectiveBusinessDays = totalOwnershipDays`(전 기간 사업용 표시값) · `periodEvaluation = not_judged` |
| 같은 파일 `:143-183` | **초과 분기**: `applyGraceToNonBusinessRemainder(…, "housing")`로 유예만 반영 — 충족하면 전량 사업용 · `periodEvaluation.basis = "state_at_transfer"` |
| `engine.ts:162-163` | `case "housing": judgeHousingLand(engineInput, rules)` · `:84` Step 2 무조건 사업용 의제(수용 등)가 지목별 judge **앞**에서 끝낸다 → 의제 성립 시 이력 무관 |
| `engine.ts:169-198` | 별장(`villa`) `REDIRECT_TO_CATEGORY`면 `judgeHousingLand({...engineInput, landType: "housing_site"})`로 **재분류** — 별장 카드는 `consumesStateHistory`가 false라 `landStateHistory`가 없다(T-2) |
| `engine.ts:385` | `nonBusinessAreaRatio: isNonBusinessLand ? (areaProportioning?.nonBusinessRatio ?? 1) : 0` — **T-1의 근원** |
| `land-category.ts:120` · `:143` | `INPUT_CONSUMPTION.housing = { gracePeriods: true, deemedTransfer: false, metropolitanArea: true, stateHistory: false, revenueHistory: false }` · `consumesStateHistory(landType)` — ④⑤⑧ 같은 술어 |
| `form-mapper.ts:174` · `:214-216` | `buildLandStateHistory(asset, landType, parseDate)`는 모든 지목에 호출되고 소비 지목이 아니면 `undefined` · `housingFootprint`는 `housing_site`·`villa_land`에서만 |
| `form-mapper-helpers.ts:310-322` | `buildLandStateHistory`의 소비 가드(`:311`) · `tailHasBuilding = asBool(a.nblOtherHasBuilding)`(`:322`) — **주택 카드에는 이 토글이 없다**(T-4) |
| `lib/api/transfer-tax-schema-nbl-refines.ts:108` | ⑫′ `consumesStateHistory(landType) && mode === "changed"` → 공용 leaf `stateEventSequenceIssue` — 소비표가 열리면 주택 카드도 자동으로 이 검사에 들어간다 |
| `other-land-state-history.ts:296` `deriveOtherLandStateIntervals` · `:366` `isStateIntervalBusiness` · `:392` `stateHistoryBusinessIntervals` | 사건 → 일 단위 구간 · 이전 구간 사업용 술어(`hasBuilding ∧ propertyTaxType ∈ {exempt, special_sum, separate}` 또는 나대지 선언 `accepted`) · 사업용 구간 조립 — 주택 구간(`buildingKind`)은 **아직 모른다** |
| `other-land-state-history-apply.ts:100` `applyStateHistory` | 기타토지 전용(`input.otherLand!` · `daMokAndNaMok` core probe) — 주택 카드에는 `otherLand`가 없다 |
| `appurtenant-excess-deeming.ts:78-` · `housing-excess-split.ts` | **주택 자산 양도**(주택 + 부수토지) 경로의 배율 초과분 유예·수용 판정 — NBL 토지 카드(`housing_site`)와 **다른 경로**다(이 계획은 건드리지 않는다 — V-9) |
| 파일 크기 | `housing-land.ts` 184 · `other-land-state-history.ts` 403 · `other-land-state-history-apply.ts` 192 · `land-usage.types.ts` 411 · `nbl-confirm-notices.ts` 259 · `form-mapper-helpers.ts` 560 · `transfer-tax-schema-nbl-refines.ts` 224 — 전부 ≤ 700 목표 안(§5) |

### 2.1 현행 동작 실측 (throwaway probe — 격리 사본 `git archive HEAD` · 삭제)

공통 입력: `landType: "housing_site"` · 500㎡ · 일반주거 · 정착면적 100㎡ · `isMetropolitanArea=false`(5배 → 허용 500㎡ = **배율 이내**) · 취득 2014-01-01 · 양도 2024-01-01(소유 3,651일) · `makeMockRates`. 오라클 = 사업용 구간을 `meetsPeriodCriteria`에 직접 넣은 값.

| # | 시나리오 | **현행(실측)** | 오라클(사업용 구간) | 판정 변화 |
|---|---|---|---|---|
| **H1 (M15)** | 신축 준공 2023-06-01(이력 없음 / 신축 사건 입력) | **사업용 B 198,210,000** · `not_judged` · eff 3,651(표시값) — **이력을 넣어도 동일**(엔진이 읽지 않음) | 사업 `[2023-06-01, 양도일)` 214일: 5y 비사업 1,612(>730) · 3y 881(>365) · 총 3,437(>1,460) → **비사업용 N 253,960,000** | **+55,750,000**(과소) |
| H1g | + 5호 유예(취득 후 2년 `2014-01-02~2016-01-02`) | 사업용(유예를 읽지 않음 — 이내 분기) | eff 944(유예 730) · 총 비사업 2,707(>1,460) → 비사업용 | +55,750,000 |
| H1m7 | + 5호 유예 2건(취득 후 2년 · 착공 2022-06-01~준공) 유예 1,095 | 사업용 B | eff 1,309 · 5y 1,247 · 3y 516 · 총 2,342 → 비사업용 | +55,750,000 |
| 경계쌍 | 신축 2022-01-01 / 2022-01-02 / 2022-06-01 | B / B / B | 사업 730·3y 365 → **사업용** / 729·366 → **비사업용** / 579 → 비사업용 | 0 / + / + (기타토지 M8a·M8b·G1과 **같은 값**) |
| H3 | 철거 2018-01-01 → 재신축 2020-01-01(갭 730일) | B (이력 읽지 않음) | 비사업 총 730(5y 365 ≤ 730) → 사업용 | 0 |
| H3b | 갭 2021-01-01 ~ 2023-06-01(881일) | B | 5y 881>730 · 3y 881>365 · 총 881 ≤ 1,460(다목 미충족) → 사업용 | 0 |
| **H3c** | **철거 2016-01-01 → 재신축 2023-01-01(갭 2,557일)** | B | eff 1,094 · 5y 1,461>730 · 3y 730>365 · 총 2,557>1,460 → **비사업용** | **+55,750,000** |
| H3d | H3c + 9호 유예 2016-01-01~2018-01-01(731) | B | eff 1,825 · 총 1,826 > 1,460 → 비사업용 | +55,750,000 |
| H5 | 토지 1,000㎡(허용 500 → **초과 500㎡**) | **비율 0.5 · 산출 199,720,000** · `not_judged` · 이력 입력해도 동일 | — (부분 면적: 이력 미반영) | 0 |
| H5g / H5h | 초과 + 전 기간 유예 / 2014~2022 유예 | 유예 3,651 → 사업용 B / 유예 2,921 → 사업용 | — (D1 경로 그대로) | 0 |
| H6 | 이내 + 5호 유예 입력 | B(유예 무시) | — | 0(이력 없으면 불변) |
| H7 | 정착면적 0 | N 253,960,000(고지 0건) | — | 0 |
| **H8** | 취득 2022-07-01 · 양도 2024-06-30(소유 729) · 신축 2023-10-01 / 2022-09-01 | B 257,010,000 / B | 3호(소유 2년 미만 — 가목 미적용): 사업 273 · 총 비사업 456 > floor(729×40/100)=291 → **비사업용**(N 326,760,000, +69,750,000) / 사업 668 · 비사업 61 → 사업용 | + / 0 |
| H9 | 취득 2022-07-01 · 양도 2023-12-31(소유 547) · 신축 2023-10-01 | B 279,000,000 | 사업 91 · 총 456 > floor(547×40/100)=218 → 비사업용(N 326,760,000, +47,760,000) | + |

**읽는 법**
- H1·H3c·H8·H9는 **현행 과소**(사업용 → 비사업용)이고, 이 모델은 «주택이 없던 기간이 있다»는 사실을 입력할 때만 발동한다(미입력 = 현행).
- 경계쌍·M8·M13 동형은 **기타토지 E2 신축 행과 일 단위 값이 같다**(주택 구간 = 사업용 · 나대지 구간 = 비사업용이라 구간 구조가 같다) → Anchor 1에서 E2 표를 그대로 재사용한다.
- **B 방향(주택 철거 후 나대지 양도)** 현행 실측(기타토지 카드, 같은 거래): 이력 없음 N 253,960,000 · 철거 2021-01-01 사건(철거 직전 재산세 구분 «모름»/«종합합산») **N 253,960,000** · 같은 사건에 `separate`를 고르면 B 198,210,000 — **주택 구간을 «별도합산»으로 위장해야만** 사업용이 된다. 철거 2019-01-01 + 9호 유예 731일(이력 없음) 현행 **N**인데 주택 구간을 사업용으로 세면 **B**(−55,750,000, 위장 실측 = E2 M3: eff 2,556 · 유예 731). **Q-1 (나) 결정으로 B를 이 계획 범위에 넣었고, 철거 전 정착면적 입력(Q-7 (나))으로 설계했다**(§3.4 · §4.3 · §6.2).

### 2.2 종류 `""` 우회 실측 (Q-12 · 현행 엔진 — 격리 사본 probe, 삭제)

Q-10 (가)로 정착면적이 ⑧ 필수가 되면, 모르는 사용자가 «건축물 종류 = 그 밖(`""`)»을 골라 **종전 철거 행 경로**(철거 직전 재산세 구분 `propertyTaxTypeBefore`)로 가는 길이 남는다. 기타토지 1,000㎡ · 2014-01-01 → 2024-01-01 · 철거 2021-01-01 · 꼬리 나대지 + 종합합산 · `makeMockRates` · 현행 엔진 값:

| 철거 직전 재산세 구분 | 판정 | eff | 산출세액 |
|---|---|---|---|
| 모름(`""`) | **비사업용** | 0 | 253,960,000 |
| 종합합산 | **비사업용** | 0 | 253,960,000 |
| 비과세·면제 | 사업용 | 2,556 | 198,210,000 |
| 분리과세 | 사업용 | 2,556 | 198,210,000 |
| 별도합산 | 사업용 | 2,556 | 198,210,000 |

→ **혜택이 되는 우회는 «주택에 존재하지 않는 비종합합산 구분»을 허위로 선언할 때뿐**이다(지방세법 §106② — 주택은 토지 3분 구분이 아니다). «모름»·종합합산으로 가는 우회는 N(혜택 없음). 이 경로는 E3-① 기존 동작이며 이 계획이 새로 여는 것이 아니다(B19 · B1′ · B8 회귀 가드). 정착면적을 모르는 정직한 사용자의 정상 탈출구는 **이력 질문 «모름»**(D-17). 막을지는 **Q-12**.

---

## 3. 모델안과 추천

### 3.1 공통 전제

- 구간은 `[start, end)` 반열린 · **사건일 = 새 상태의 첫날**(규칙 §83의5①9호 «날부터» — E3-①과 같다). 주택 «신축일» 라벨은 UV-3 확정 문구(«건축물이 있는 것으로 보는 첫날 — 사용승인일(준공일)과 다를 수 있음 · 확인 필요»)를 그대로 쓴다(사용승인일 단정 금지).
- 날짜는 `lib/tax-engine/utc-date`·⑭ 주입 `parseDate`(`toOptionalDate`)만. 신규 `new Date(x)` 금지. 금액·일수 정수.
- 주택부수토지 카드의 **양도일 현재 상태는 «주택 있음»**이다(§168의7 사실현황 — 정착면적 입력이 곧 주택 존재). 양도일 전에 주택이 철거됐다면 그 토지는 «나대지»이고 지목을 기타토지로 고르는 것이 현행 규약이다 → 주택부수토지 카드 이력의 **마지막 건축물 사건은 반드시 신축**(D-1) · 철거 후 양도는 **B(기타토지 카드)** 가 받는다(§3.4).

### 3.2 (A) 기타토지 사건 모델을 주택부수토지 카드로 확장 — **추천**

| 요소 | 내용 |
|---|---|
| 입력(와이어) | 기존 `nblOtherStateHistoryMode` · `nblOtherStateEvents` **재사용**(⑫ 최상위 칸 신설 없음). 사건 종류는 `building_built`·`building_removed`만(주택 카드에서 `tax_type_changed`는 차단 — D-2). 철거 행에 **`houseFootprintBefore`(㎡)** — Q-4 (가) 3지선다 `houseWithinLimitBefore`는 **Q-11 (나)(2026-11-24)로 폐기·대체**, B와 공용 |
| 엔진 입력 | `NonBusinessLandInput.landStateHistory`(기존 필드) — 주택 카드도 같은 타입 |
| 구간 변환 | `deriveOtherLandStateIntervals(events, ownershipStart, endDate, tail)` — `StateTail`에 `buildingKind?: "house"` 추가. 건축물 구간(철거 행이 닫는 구간)은 `{ hasBuilding: true, buildingKind: "house", houseOutcome }` · 나대지 구간(신축 행이 닫는 구간)은 **기존 `resolveBareDeclaration`**(E3-1b) 그대로 |
| 사업용 술어 | `isStateIntervalBusiness`: `buildingKind === "house"`이면 `houseOutcome === "within"`(재산세 구분을 보지 않는다 — 조심 2018서0295) · 그 밖은 기존 |
| 꼬리 | 주택 있음 — core(`judgeHousingLand` 이내 분기)가 사업용이면 꼬리 전체 사업용 |
| 판정 | `applyHousingStateHistory`(신규 leaf 파일 `housing-state-history.ts`) — `judgeHousingLand`의 **이내 분기 반환 직전**에 후처리 1개. 기간기준은 `meetsPeriodCriteria(사업용 구간, 취득일, 양도일, "housing", rules, input.gracePeriods)` **한 번**(유예는 합집합) |

장점: 구간 변환·사건 검증·나대지 선언·클립(축 B 지분 · 이월과세 시나리오 B)을 **같은 leaf·같은 문구**로 재사용(3중 패턴) · 기타토지 anchor 표(E2 신축 행)와 값이 같아 오라클이 이미 검증돼 있다. 단점: `LandStateInterval`에 optional 필드 2개(`buildingKind`·`houseOutcome`)가 늘고 echo·UI 구간표가 주택 구간 표기를 알아야 한다.

### 3.3 (B) 주택 보유 구간 배열 직접 입력 · (C) 주택부수토지 카드 미지원(안내만)

| 안 | 내용 | 판단 |
|---|---|---|
| (B) | 주택부수토지 카드에 «주택이 있던 기간» `[시작, 끝)` 목록을 입력 | 기각 — 취득일·양도일 중복 입력 · 구간 겹침·공백 검증 8종(E3 본 계획 §3.2와 같은 단점) · 사건 모델과 두 벌 |
| (C) | 주택부수토지 카드에는 이력을 받지 않고 «나대지로 시작했다면 기타토지 카드로…» 안내 | 불가 — 양도일 현재 주택이 있는 토지는 기타토지 카드로 판정할 수 없다(주택 부수 배율을 안 본다). M15 같은 정상 입력의 과소가 영구히 남는다 |

### 3.4 B — 주택 철거 후 나대지 양도(기타토지 카드 + 주택 구간) 설계 (Q-1 (나) · **Q-7 (나) 정착면적 입력**)

**무엇이 비어 있나.** 기타토지 카드의 `building_removed` 사건 Before(`propertyTaxTypeBefore`)는 **토지 재산세 구분**(exempt/separate/special_sum/comprehensive)이고 주택은 이 중 어느 것도 아니다(지방세법 §106② — 주택 구분). 그래서 현행은 §2.1 B 실측처럼 «모름·종합합산 → N(과대)» 아니면 «`separate` 위장 → B»뿐이다.

**입력 모델 — 철거 행에 «철거된 건축물 종류» + 주택이면 «철거 직전 정착면적»(㎡), 카드 단위 수도권 여부 (D-7).**

| 칸 | 값 | 뜻 · 재사용 |
|---|---|---|
| `buildingKindBefore`(철거 행 전용 · 신규) | `"house"` / `""`·미전송 | `house` = 이 철거 행이 닫는 건축물 구간이 **주택**. `""` = 주택 아닌 건축물(현행 — `propertyTaxTypeBefore` 사슬). **미전송·`""`은 종전 철거 행과 바이트 동일** |
| `houseFootprintBefore`(철거 행 · 신규 · 문자열 ㎡) | 양수 수치(㎡) · **A·B 공용** | 철거 직전 주택 정착면적. 엔진이 `정착면적 × 배율`(허용 면적)과 **토지 면적**을 비교한다. **⑧은 빈칸·0·음수·비수치·정착면적 > 토지 면적을 전부 차단**한다(Q-10 (가) — housing E1-03 정합). 직접 API(⑫·엔진)는 400 없이 **`unconfirmed` 접힘**(빈칸·비양수·비수치·정착 > 토지 — D-16) |
| `propertyTaxTypeBefore`(주택 구간) | **받지 않는다·운반하지 않는다** | 주택 구간은 토지 재산세 구분이 판정에 쓰이지 않는다(조심 2018서0295). `house`로 바꾼 뒤 남은 숨은 stale 값은 ⑭가 싣지 않는다(§7.4 규약 — Y-16) |
| **토지 면적** | 카드 기존 칸 재사용 — `asset.acquisitionArea` → `input.landArea`(`form-mapper.ts:82`) | **취득 면적**이다(양도 면적 `transferArea`가 아니다) → 분할 전 면적에 가깝다. 분할·합필·지분(공유 지분은 ⑭가 별도 안분)로 철거 당시 면적과 다르면 판정이 어긋난다 — 고지(V-2 · V-19). **새 칸을 만들지 않는다**(D-15) |
| **용도지역** | 카드 기존 칸 재사용 — `asset.nblZoneType` → `input.zoneType` | **⑧이 이미 모든 정밀판정에서 필수**로 요구한다(`transfer-tax-validate-nbl.ts:114-115`) — 기타토지 카드도 값이 있다. 영 §168의12 본문 확인(§1.1): 도시지역 내(수도권 주·상·공 3배 · 수도권 녹지 5배 · 수도권 밖 5배) · 그 밖 10배. `getHousingMultiplier`가 이 표를 이미 구현한다(`urban-area.ts:106-132`) |
| **수도권 여부** | **기존 `asset.nblIsMetropolitanArea`**("yes"/"no"/"unknown") — **조건부 개방**(D-13) | 소비표 `INPUT_CONSUMPTION.other_land.metropolitanArea`는 **false 그대로 둔다**(기타토지 전 입력의 ⑧·④·⑭ 파급 방지). 대신 **새 술어 `housePriorNeedsMetropolitan(landType, zoneType, events)`** — 「기타토지 ∧ `buildingKindBefore = house` 철거 행이 있음 ∧ 용도지역이 주·상·공」 — 이 참일 때만 ⑤ 렌더·④ 와이어 게이트(`non-business-land-request.ts:165`)·⑭ 게이트(`form-mapper.ts:155`)·⑧ 필수(`transfer-tax-validate-nbl.ts:199` 규칙과 같은 문구)가 읽는다. 수도권 값이 3배/5배를 가르는 조합은 **주·상·공뿐**이다(`urban-area.ts:122-131` — 녹지·그 밖 도시는 수도권 안팎 모두 5배, 도시지역 밖 10배) |

**배율 판정 — 단일 소스 `housing-limit.ts`(신규 ≈45줄)로 추출 (D-12).** `judgeHousingLand`는 이미 `getHousingMultiplier(zoneType, isMetropolitan, transferDate)`(`housing-land.ts:94-98`) → `areaTimes(footprint, multiplier)`(`:100`) → `judgeAreaLimit(landArea, allowedArea)`(`:101`)를 쓴다(수도권 미제공 시 보수적 수도권 기본값 + 경고 `:84-92`). 이 `:84-101`을 `judgeHousingLimit({ zoneType, isMetropolitanArea, transferDate, footprint, landArea })` → `{ multiplier, multiplierDetail, allowedArea, limit, metroDefaulted }`로 **이동만** 하고(`judgeHousingLand`는 호출, 경고 문구·steps 바이트 동일), 과거 주택 구간 판정(`resolveHouseInterval`)도 같은 함수를 부른다. 새 배율표·새 면적 비교를 만들지 않는다. 경계(실측 — 일반주거 · 토지 1,000㎡): 수도권 밖 5배 정착면적 **200.00㎡ → 허용 1,000.00 이내 / 199.99㎡ → 허용 999.95 초과(0.05㎡)** · 수도권 3배 **333.34㎡ → 1,000.02 이내 / 333.33㎡ → 999.99 초과(0.01㎡)** · 양도 **2021-12-31 수도권 주거 5배(종전) / 2022-01-01 3배**.

**배율 연혁 — 양도일 기준으로 확정 (D-11 · V-5 해소).** KoreanLaw MCP로 영 §168의12 연혁을 열람했다: 2010.1.1.·2021.7.1.·2020.2.11. 시행본 모두 «도시지역 내 5배 · 그 밖 10배», 2022.1.1. 시행본(제32104호, 2020.2.11. 개정 반영)부터 «수도권 주·상·공 3배 · 수도권 녹지 5배 · 수도권 밖 5배 · 그 밖 10배»(확인). 개정령(제30395호, 2020.2.11.) 부칙 **제1조 3호**(「제168조의12제1호의 개정규정: 2022년 1월 1일」) · **제2조②**(「양도소득세에 관한 개정규정은 이 영 시행 이후 양도하는 분부터 적용」) · **제39조**(「**2022년 1월 1일 전에 양도한 자산**에 대해서는 … 제168조의12제1호의 개정규정에도 불구하고 종전의 규정에 따른다」) — **양도일이 배율을 정한다**. 소유기간 중 과거 구간에 «그 구간 당시 법령»을 적용하라는 규정은 열람 본문에 **없다**. → 과거 주택 구간도 `getHousingMultiplier(zone, metro, 양도일)` 그대로(A 이내 판정과 같은 인자). 영향: 양도일이 2022.1.1. 이후이고 철거가 그 이전이며 수도권 주·상·공이면 **당시 일률 5배가 아니라 현행 3배**를 적용한다(더 엄격). 이 선택은 부칙 문언에 근거하나 **직접 해석례는 확인하지 못했다**(V-5 잔여) — 결과 고지 `HOUSE_BEFORE_NOTICE`가 «양도일 시행 배율 적용»을 밝힌다. 사용자 결정이 필요한 갈림이 아니라고 판단해 Q로 올리지 않았다(반대 읽기는 부칙에 근거가 없다).

**주택 구간의 사업용 술어(A·B 공통)**: `isStateIntervalBusiness`에 `buildingKind === "house" → houseOutcome === "within"`을 먼저 둔다. `houseOutcome`은 leaf `resolveHouseInterval(ev, ctx)`가 정한다 — **정착면적이 있고 양수이고 배율 이내**면 `within`, **정착면적이 있고 초과**면 `exceeded`, **빈칸·비양수·비수치**는 `unconfirmed`(모름 — 접힘). `exceeded`·`unconfirmed`는 둘 다 그 구간 비사업용(Q-5 (나) · 「모름」 = 혜택 불성립 — «초과»가 «모름»보다 유리하지 않다). 나머지 판정(`stateHistoryBusinessIntervals` · `meetsPeriodCriteria` · 유예 합집합 · 꼬리 core)은 **기타토지 `applyStateHistory`가 그대로** 한다 — B는 새 apply가 없다.

**대안 비교 (Q-7 결정 기록).**

| 안 | 내용 | 판단 |
|---|---|---|
| (가) 종류 + 3지선다 선언(v2 추천) | `houseWithinLimitBefore` | **사용자가 채택하지 않았다** — 배율 이내 여부를 사용자가 «계산해서 답하는» 방식이라 오선언 위험이 있고, 엔진이 면적·배율 근거를 echo할 수 없다 |
| **(나) 종류 + 정착면적(행별) + 수도권 여부 → 엔진 판정** | 위 표 | **결정(2026-11-24)**. 비용: 기타토지 카드에 «철거 행 정착면적» 칸 + 조건부 수도권 칸 + ⑧ 규칙 + 구 이력 복원 기본값. 이득: 선언이 아니라 **재계산 가능한 사실 입력**이라 근거가 echo되고(허용 면적·배율·초과 면적) 후속 부분 면적(면적 × 기간)을 열 수 있다 |
| (다) `houseWithinLimitBefore`만(종류 칸 없이) | 새 칸 0개 | 기각 — 「모름」과 «주택 아님»을 구분할 수 없다 |
| (라) `propertyTaxTypeBefore`에 `"house"` 리터럴 추가 | 기존 칸 재사용 | 기각 — `NBL_PROPERTY_TAX_TYPE_VALUES`는 양도일 현재 구분과 **공용 enum**이라 최상위 입력에 «주택»이 새는 구멍이 생긴다 |

**이어지는 규칙**

1. **종류는 철거 행에서만**: `buildingKindBefore = house`는 `building_removed`에서만 허용한다. 신축·구분 변경 행의 값은 ⑧·⑫ 차단(D-8).
2. **주택 구간 안에는 재산세 구분 변경이 없다**: 주택 구간에 `tax_type_changed`가 있으면 ⑧·⑫ 차단(D-8). 이미 구분 변경으로 쪼개진 건축물 구간은 «주택 아닌 건축물»이다.
3. **겸용주택·주택 아닌 건축물**: 상가·공장 등은 `""`(기존 사슬). 겸용주택(주택 + 상가 1동)의 철거는 «주택»을 고르지 않는다(안내) — 겸용 부수토지 안분은 Q-8 (가) 재제안 금지 경계다(D-5).
4. **A와의 관계**: A(주택부수토지 카드)에서는 모든 건축물이 주택이라 `buildingKindBefore`를 받지 않고 `building_removed` 전부가 주택 구간을 닫는다(`tail.buildingKind = "house"`). A의 과거 주택 구간도 **같은 `houseFootprintBefore`**로 받는다(Q-11 (나) 결정 2026-11-24 — 카드의 수도권·용도지역·토지 면적 칸을 이미 갖고 있어 정착면적 1칸만 늘어난다). A에는 종류 칸이 없어 «종류 `""` 우회»(Q-12)가 없다. 같은 `eventClosesHouseInterval(events, index, tailKind)` 술어 한 개가 ⑭·④ 와이어·⑤ 미리보기를 정한다(운반 규약).
5. **철거 후 유예**: 9호 행(규칙 §83의5①9호)은 지금처럼 **사용자가 입력**한다(자동 생성 안 함). 철거 전 구간이 `within`이면 유예는 철거일부터 그대로 합집합이다.
6. **초과 판정 + 0792**: 정착면적으로 계산한 결과가 **초과**이면 Q-5 (나)에 따라 **그 구간 전체가 비사업용**이다(이내분까지 — 고지에 허용 면적·초과 면적 echo). 철거 후 9호 유예는 **Q-8 (가) 결정**: 유예 행 그대로 합집합 + `HOUSE_EXCEEDED_GRACE_NOTICE` — 철거 전 초과분은 철거 후 유예를 받지 못한다는 회신(부동산거래관리과-0792, 2011)이 있으나 면적별로 쪼개지 않는다(자동 안분 금지 — 구간은 이내분까지 비사업용으로 보고 유예는 전체에 적용 → 서로 반대 방향의 근사라 치우친 침묵 과소·과대를 만들지 않는다).
7. **수용(영 §168의12 후단)**: 수용 양도의 배율 용도지역은 사업인정 고시일 전날 용도지역이다. 카드 `nblZoneType`은 현재 값이므로 주택 구간(A·B)에서도 `housing-land.ts:74-81`과 같은 고지(`expropriationZoneBaseDateNotice`)를 낸다(V-18) — 새 판정 규칙을 만들지 않는다.

### 3.5 Q-3a (나) 경계를 겹치지 않는 방법

| 경로 | 무엇을 판정 | 이 계획의 처리 |
|---|---|---|
| 양도일 현재 주택 + 배율 **초과**(A 카드 tail) | 초과분 면적(5호) × 전 기간 + 유예만(D1 · Q-3a (나)) | **무변경 + 이력 미반영 고지** — tail 초과에 이력을 반영하려면 «초과분 면적 × 기간» 판정이 필요하고 이는 Q-3a (나) 자체를 바꾸는 일이다 |
| 양도일 현재 주택 + 배율 **이내**(A 카드 tail) | 이내 → 사업용(`not_judged`) | 이력 `changed`일 때만 후처리(§4.1) |
| **과거** 주택 구간 «초과» 판정(A 철거 행 · B 철거 행) | 과거 구간의 배율 이내 여부 | **양도일 현재 상태가 아니므로 Q-3a (나) 대상이 아니다** — 그 구간 비사업용 접기 + 고지(Q-5 (나)). 배율 계산은 `judgeHousingLand`가 아니라 **순수 helper**(`housing-limit.ts`)만 공유한다 — `judgeHousingLand`의 초과 분기·D1 유예 호출은 한 줄도 바뀌지 않는다 |
| B 카드 tail(양도일 현재 나대지) | 기타토지 core | `judgeHousingLand`를 부르지 않는다 — 코드·입력 모두 분리 |

---

## 4. 판정 산식

### 4.1 흐름

```
judgeNonBusinessLand
 ├─ Step 2 무조건 사업용 의제(수용 등 §168의14③)  → 성립하면 즉시 사업용 — 이력 무관(기존 순서)
 ├─ Step 3 case "housing": judgeHousingLand                                  ← A
 │    ├─ 정착면적 ≤ 0           → 전량 비사업용 조기 반환(무변경 — 이력을 보지 않는다)
 │    ├─ 배율 초과(부분 면적)   → 초과분 + 유예만(D1 · Q-3a (나) — 무변경)
 │    │                           · `changed`일 때만 warnings에 NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE를 **더한다**(이력 미반영 고지)
 │    └─ 배율 이내(core = 전량 사업용) → applyHousingStateHistory(core, input, rules)      ← 신규 후처리 1개
 │         · mode ∈ {미전송, "", unchanged} → core 그대로(바이트 동일)
 │         · mode = unknown               → core + NBL_STATE_HISTORY_UNKNOWN_NOTICE 한 줄
 │         · mode = changed → §4.2
 └─ Step 3 case "other_land": judgeOtherLand → applyStateHistory (기존)        ← B
      · 철거 행 `buildingKindBefore = house` + 정착면적 → 엔진이 배율 판정 → 과거 구간이 주택 구간(`buildingKind = "house"`) → §4.3
      · 그 밖(주택 구간 없음)은 종전과 바이트 동일
```

양도일 의제(§168의14②)는 주택 카드가 받지 않는다(`INPUT_CONSUMPTION.housing.deemedTransfer = false`)라 A에는 «의제 동시 입력» 분기가 없다. B(기타토지)는 종전대로 의제 동시 시 이력 미적용 + 고지.

### 4.2 A 산식 (일 단위 · V-1 일 단위 결정 준수 — 과세기준일 접기는 재제안 금지)

입력: 사건 → 일 단위 구간 `intervals`(마지막 원소 = 꼬리) · 유예 `input.gracePeriods` · core(이내 → 사업용).

1. `pastBusiness` = `intervals`(꼬리 제외) 중 `isStateIntervalBusiness`인 것:
   - **주택 구간**(철거 행이 닫는 구간 — A에서는 모든 건축물 구간): `houseOutcome === "within"`일 때만 사업용(`houseFootprintBefore`로 `resolveHouseInterval`이 판정 — §4.3 · A·B 공용, Q-11 (나)). **`exceeded`·`unconfirmed`(직접 API의 빈칸·비양수·정착 > 토지)는 모두 그 구간 비사업용으로 접고 고지한다(Q-5 (나) · 「모름」 = 혜택 불성립)** — «초과» 선언이 «모름»보다 유리해지는 역전이 없다(E3-1b `area_exceeded`와 같은 정책).
   - **나대지 구간**(`hasBuilding = false`): 나대지 선언(E3-1b `resolveBareDeclaration`)이 `accepted`일 때만 사업용, 선언이 없거나 접히면 비사업용.
2. 꼬리 = 사업용(core 이내). 즉 `businessIntervals = pastBusiness ∪ {[꼬리.start, 꼬리.end)}`.
3. `r = meetsPeriodCriteria(businessIntervals, 취득일, 양도일, "housing", rules, input.gracePeriods)` — 유예는 **합집합**(`period-criteria.ts` — 이중 계상 없음).
4. `r.meets` → 사업용(변화 없음 — 이력 echo만), 아니면 **전량 비사업용**: `isBusiness = false` · `areaProportioning = undefined`(**T-1**) · `reason` = «소유기간 중 주택 신축·철거 이력(일 단위 구간)을 반영하면 기간기준 미충족 — 비사업용» · `criteria`·`effectiveBusinessDays`·`gracePeriodDays`·`businessUseRatio`는 `r`의 실제 값(전 기간 사업용 표시값을 쓰지 않는다).
5. `periodEvaluation = { basis: "state_history", stateHistory: { intervals, criteria } }` — echo 조립은 기타토지 apply의 `intervalEcho`·`criteriaEcho`를 **공용 helper로 추출**해 두 apply가 같이 쓴다(D-4 — 이동만, 로직 변경 없음).
6. 고지: `NBL_STATE_AT_TRANSFER_APPLIED_NOTICE`를 `NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE`로 **대체** + §4.5의 구간별 고지(Q-2 · Q-5 · R-6) **추가**.

### 4.3 B 산식 (기타토지 `applyStateHistory` — 변경은 술어와 고지뿐 · Q-7 (나))

기타토지 core(꼬리 = 나대지 등 양도일 현재 상태)·`daMokAndNaMok`(다목 자체 구간·나목 꼬리)·Q-15 (가′) 조립은 **무변경**이다. 달라지는 것은 이전 구간 중 «주택 구간»의 사업용 판정뿐이다.

1. **구간 변환(leaf `deriveOtherLandStateIntervals`)**: 철거 행이 닫는 건축물 구간이 «주택»이면(`buildingKindBefore = house` · A는 모든 건축물 구간) `{ hasBuilding: true, buildingKind: "house", propertyTaxType: "unknown", houseOutcome, houseCheck }`를 만든다. `houseOutcome`·`houseCheck`는 `resolveHouseInterval(ev, ctx)`가 정하고 `ctx = { zoneType, isMetropolitan, landArea, transferDate }`는 호출자(apply · ⑤ 미리보기 · ⑧)가 같은 값으로 넘긴다(3중 패턴).
2. **`resolveHouseInterval`**: 정착면적(㎡)이 양수로 읽히면 `judgeHousingLimit`(= `housing-limit.ts` — `getHousingMultiplier` → `areaTimes` → `judgeAreaLimit`)로 허용 면적과 토지 면적을 비교한다 → **이내 = `within`(사업용)** · **초과 = `exceeded`(접힘)**. 빈칸·0·음수·비수치, **그리고 정착면적 > 토지 면적** → **`unconfirmed`(접힘)** + 고지. **UI 경로에서는 ⑧이 이 다섯 경우를 전부 먼저 차단한다**(Q-10 (가)) — 엔진은 **직접 API 안전망**이라 던지지 않고(400 없음, 기존 housing 정책) 접는다. **정착면적 > 토지 면적을 엔진이 «이내»로 읽지 않는 것이 핵심**이다(허용 면적 ≥ 토지 면적이라 자동으로 이내가 되어 오입력이 사업용을 만든다 — Y-31).
3. **사업용 술어**: `pastBusiness` 중 `buildingKind === "house"` 구간은 `houseOutcome === "within"`일 때만 사업용 — `propertyTaxType`은 읽지 않는다(D-3). `exceeded`·`unconfirmed`는 **같은 접힘**이다(Q-5 (나) — «초과»가 «모름»보다 유리해지는 역전 없음).
4. `unknownClosers`(철거 직전 재산세 구분 «모름» 고지)에서 주택 구간을 **제외**한다(T-6 — 한 줄 필터 `buildingKind !== "house"`).
5. **수도권 미제공 직접 API**: `isMetropolitanArea`가 없으면 `housing-land.ts:84-92`와 같은 **보수적 수도권 기본값 + 같은 경고 문구**(helper `metroDefaulted`) — ⑧이 UI에서는 차단한다(`transfer-tax-validate-nbl.ts:199-203` 규칙의 조건부 확장 — D-13). 이는 기존 housing 정책을 그대로 재사용하는 것이지 새 fallback이 아니다.
6. 고지: 주택 구간이 하나라도 있으면 `HOUSE_BEFORE_NOTICE`(입력한 정착면적·**취득 당시 토지 면적**·양도일 시행 배율로 판정 — 분할·합필·증개축으로 철거 당시와 다르면 확인 필요) + `DAYWISE_NO_RULING_NOTICE`(Q-2)를 **추가**한다. 구간별 접힘 고지(§4.5)를 더한다. 기존 `NBL_STATE_HISTORY_APPLIED_NOTICE`는 바이트 동일 유지(대체하지 않는다).
7. echo: `StateHistoryIntervalEcho`의 optional `buildingKind`·`houseOutcome`·`houseCheck { footprint, multiplier, multiplierDetail, allowedArea, landArea, excessArea }`(주택 구간만) — 결과 구간표가 «정착면적 × 배율 = 허용 면적 vs 토지 면적»을 그대로 보여 준다(선언이 아니라 재계산 가능한 근거).
8. 부분 면적(`isPartialArea(core)`)·양도일 의제 동시 → 종전대로 이력 미적용 + 고지.

### 4.4 기존 로직과의 관계

| 기존 | 이력 `changed` | 이력 없음·`unchanged`·`unknown` |
|---|---|---|
| A: 정착면적 ≤ 0 조기 반환 | **무변경** — 정착면적이 없으면 이내 여부를 모르므로 이력을 쓰지 않는다(⑧이 `changed`에서 정착면적 필수를 이미 요구 — 확인 필요 V-10) | 현행 |
| A: 배율 초과(부분 면적) | **무변경 + PARTIAL_AREA 고지 추가**(Q-3a (나) 보존 · Anchor 3) | 현행 |
| A: 이내 분기 | 후처리 1개(§4.2) | 현행(`not_judged` echo · AT_TRANSFER 고지) |
| 유예 `gracePeriods` | A 이내 경로에서 **처음으로** 판정에 쓰인다(`meetsPeriodCriteria` 합집합). 이력 없는 이내 경로는 계속 읽지 않는다(H6 — 불변). B는 종전대로 합집합 | 현행(초과분에만) |
| 수용 의제(Step 2) · 별장 REDIRECT | 앞서 끝나거나(Step 2) `landStateHistory`가 없다(T-2) | 현행 |
| 이월과세 시나리오 B(`buildNblEngineInputGiftBasis`) · 축 B 지분 | 같은 raw를 다른 `acquisitionDate`로 다시 매핑 → leaf 클립이 자동 처리(기타토지 E2와 같다) | 현행 |
| B: `propertyTaxTypeBefore`·`tax_type_changed` | 주택 구간에서는 읽지 않는다(D-3 · D-8) | 현행 |

### 4.5 고지 상수 설계 (`nbl-confirm-notices.ts` 단일 소스 — 위젯·결과 카드·엔진 `warnings`가 같은 문구를 읽는다)

기존 상수 문구는 **바이트 불변**이다. 아래는 전부 신규이고 기존 `NBL.*` 법령 상수(`NBL.MAIN`·`NBL.CRITERIA`·`NBL.HOUSING_MULTIPLIER`·`NBL.UNAVOIDABLE_PERIOD`)만 조립한다 — **새 조문 인용 없음 → manifest 등록·`verify:legal` 불필요**(해석례 번호는 고지에 쓰지 않는다).

| 상수 | 언제 | 문구(요지) |
|---|---|---|
| **`NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE`**(Q-2) | A 이력 적용 · B 주택 구간이 있는 이력 적용 | 「주택이 없던 기간(나대지)과 주택이 있던 기간을 **일 단위로 합산**해 비사업용 토지 기간기준을 판정했습니다. 이 합산을 직접 다룬 해석례는 **확인하지 못했습니다 — 확인 필요** ({NBL.MAIN} ① 각 호 외의 부분 · {NBL.CRITERIA})」 |
| `NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE`(A) | A 이력 적용 — `NBL_STATE_AT_TRANSFER_APPLIED_NOTICE`를 **대체** | 주택 신축·멸실 사건과 나대지 구간 선언만 기간별로 판정 · 과거 주택 구간은 **입력한 정착면적 · 취득 당시 토지 면적 · 양도일 시행 배율**로 판정 · 현재 정착면적·토지면적·수도권 여부는 양도일 현재 값 · 신축 공사 기간은 5호 유예 행·철거는 9호 유예 행에서 입력 — 확인 필요 |
| `NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE`(A 철거 행·B 공용) | 주택 구간 있음 — 기존 APPLIED 고지에 **추가** | 철거 전 주택 구간은 입력한 **정착면적 · 취득 당시 토지 면적 · 양도일 시행 배율**({NBL.HOUSING_MULTIPLIER})로 판정했습니다. 분할·합필·증개축으로 철거 당시와 다르면 결과가 달라질 수 있습니다 — 확인 필요 |
| `NBL_STATE_HISTORY_HOUSE_WITHIN_UNCONFIRMED_NOTICE`(A·B) | 직접 API의 정착면적 빈칸·비양수·비수치·**정착 > 토지** → 접힘(UI는 ⑧이 차단) | 철거 전 주택의 정착면적을 확인하지 못했거나 토지 면적보다 커 배율 이내 여부를 판정할 수 없어 그 구간을 비사업용으로 보았습니다(모름 = 혜택 불성립) — 확인 필요 |
| **`NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE`**(Q-5 (나)) | 계산 결과 초과 → 접힘 | 「철거 전 주택 구간이 정착면적 × 배율({NBL.HOUSING_MULTIPLIER}) 허용 면적을 **초과**해 그 구간 **전체를 비사업용으로** 보았습니다. 주택부속토지는 배율을 초과하는 면적만 비사업용 대상이므로 **배율 이내분까지 비사업용으로 본 것**입니다. 면적별 판정은 지원하지 않습니다 — **부분 면적 확인 필요**」 |
| `NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE`(Q-8 (가)) | 초과 구간 + 9호(`demolition`) 유예 행이 있음 | 초과 구간 뒤 철거 후 유예는 초과 부분에는 적용되지 않는다는 회신이 있으나 면적별로 나누지 않고 유예를 그대로 합집합했습니다 — 확인 필요({NBL.UNAVOIDABLE_PERIOD}) |
| `NBL_STATE_HISTORY_HOUSING_NON_HOUSE_BUILDING_NOTICE`(**R-6**) | A 이력 적용(UI 질문 hint와 같은 상수) | 이 질문은 **주택**이 있던 기간만 표현합니다. 주택이 아닌 건축물이 있던 기간은 «주택 없음(나대지)»으로 계산되어 결과가 높게 나올 수 있습니다 — 모르면 「모름」을 고르고 확인하세요 |
| **`NBL_STATE_HISTORY_BUILDING_KIND_HINT_NOTICE`**(**Q-12 (가) 결정 2026-11-24**) | B 철거 행 종류 칸 hint · 종류 `""` + 재산세 구분 비종합합산 선언인 이력 적용 결과 | 주택은 재산세 **토지** 구분(별도합산·분리과세·비과세)이 없습니다. 철거된 건축물이 주택이었다면 「주택」을 고르고 정착면적을 입력하세요 — 주택을 별도합산 등으로 입력하면 사실과 다른 판정이 됩니다 — 확인 필요 |
| (R-3) 검증 문구 «주택» 변형 | ⑧·⑫ | D-9 — 상수가 아니라 문구 함수의 `subject` 인자 |

기존 재사용: `unknown` → `NBL_STATE_HISTORY_UNKNOWN_NOTICE`(바이트 동일) · A 초과 + `changed` → `NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE`(바이트 동일) · 수도권 미제공 보수 기본값 경고(`housing-land.ts:86-88` 문구 그대로 — helper `metroDefaulted`).

---

## 5. 14지점 중 엔진·API 측 (⑨~⑭) 영향

> 클라이언트 ①~⑧은 UI 계획서 소관. 새 와이어 칸은 **중첩**뿐이다(`buildingKindBefore` · `houseFootprintBefore` — A·B 공용 정착면적. **`houseWithinLimitBefore`는 Q-11 (나)로 폐기**) — 기존 `nblOtherStateHistoryMode`·`nblOtherStateEvents`를 주택 카드가 재사용하고, 수도권 여부는 **기존 `nblIsMetropolitanArea`**(⑫ `transfer-tax-schema-nbl.ts:128`에 이미 있다)를 쓴다 → **새 최상위 칸 없음**.

| 지점 | 영향 | 근거 · 비고 |
|---|---|---|
| ⑨ Zod enum 메인 | 해당 없음 | 새 칸이 `nonBusinessLandRaw` 안 |
| ⑩ 컴패니언 + `addPropertyRefines` | 해당 없음 | 컴패니언이 `nonBusinessLandRawSchema`를 재사용(E3-1b 계획서 §6 확인) → ⑫ 한 곳 |
| ⑪ 자산-수준 `acquisitionDate` fallback | 해당 없음 | 소유기간 시작은 기존 경로 |
| **⑫ Zod 입력 객체** | **수정 — 중첩 칸** | `transfer-tax-schema-nbl.ts` `nblStateEventRawSchema`(`:57-`)에 ① `buildingKindBefore: z.enum(NBL_STATE_BUILDING_KIND_VALUES).or(z.literal("")).optional()`(B — `["house"]`, 신규 열거 `nbl-enum-values.ts`) ② `houseFootprintBefore: z.string().optional()`(**A·B 공용** — 숫자 문자열. 빈칸은 UI에서 ⑧이 차단하고 직접 API에서는 엔진이 접는다). **`houseWithinLimitBefore`·`NBL_AREA_WITHIN_LIMIT_VALUES` 재사용은 없다**(폐기). **누락 시 중첩 칸이 침묵 strip**(`nblOtherStateEvents` 안이라 TS 미감지) → route 관통 anchor가 고정(P-8 실측: 같은 형태의 `propertyTaxTypeBefore` 삭제는 71건·5파일이 잡는다). 수도권 `nblIsMetropolitanArea`는 ⑫에 **이미 있어 strip 위험이 없다** — 대신 **⑭ 게이트가 other_land 값을 버리는 침묵**이 위험이다(T-7 · Y-24) |
| **⑫′ refine 거울** | **수정(구조 규칙만)** | `transfer-tax-schema-nbl-refines.ts:108` — 소비표가 주택을 열면 주택 카드도 `stateEventSequenceIssue`에 들어간다(`subject` 인자 — D-9). 그 위에 **주택 전용 검사**(leaf `housingStateEventIssue` — ⑧과 같은 함수·같은 문구): ① 건축물 사건 ≥ 1 ② **마지막 건축물 사건 = 신축**(D-1) ③ `tax_type_changed` 금지(D-2). **B 구조 검사**(`houseKindEventIssue` — 같은 leaf): ④ `buildingKindBefore = house`는 `building_removed`에서만 ⑤ 주택 구간 안에 `tax_type_changed` 없음(D-8). **정착면적(빈칸·0·음수·비수치·정착>토지 — Q-10 (가))·수도권 규칙은 ⑧만 가진다** — 기존 housing의 정착면적·수도권 규칙(`transfer-tax-validate-nbl.ts:199-216`)도 ⑫′에 거울이 없고 엔진이 방어한다(빈칸·비양수 → `unconfirmed` 접힘, 수도권 미제공 → 보수 기본값 + 경고) — 같은 정책을 따른다(UI 통과 ↔ API 400 모순 방지: ⑫가 ⑧보다 엄격하지 않다). `""`·`unchanged`·`unknown`은 막지 않는다(현행) |
| ⑬ `callTransferTaxAPI` body spread | 무변경 | `nonBusinessLandRaw` 통째 운반 · ④ prefix-pick(`nbl*`) — 단 ④ 와이어 정규화가 새 중첩 칸을 싣는지는 **UI 계획서 소관**(E3-① P-E3-12와 같은 grep 게이트) |
| **④ 와이어 게이트(참고 — UI 소관이나 엔진 술어를 읽는다)** | **수정** | `lib/calc/non-business-land-request.ts:165` `metro: consumesMetropolitanArea(asset.nblLandType)` → `\|\| housePriorNeedsMetropolitan(...)`. 안 바꾸면 B 입력의 수도권 값이 서버에 닿지 않는다(T-7) |
| **⑭ Route 매핑** | **수정(매퍼 안 4곳)** | 입구 5곳(`engine-input.ts` · `multi/route-property-input.ts` · `bundled-split-helpers.ts` + `…IfCarryoverExcluded`)은 전부 `buildNblEngineInput`/`…GiftBasis` 한 함수라 **무변경**. 수정: ① `form-mapper-helpers.ts:311` 가드는 `consumesStateHistory`(기타토지·주택) 유지하되 **주택이면 `tailHasBuilding = true`**(T-4) ② 주택 구간을 닫는 철거 행(`eventClosesHouseInterval`)에서 `houseFootprintBefore`(·`buildingKindBefore`) 운반 · **그 행의 `propertyTaxTypeBefore`는 운반하지 않는다**(숨은 stale — Y-16) ③ **`form-mapper.ts:155` `metroRaw` 게이트**: `consumesMetropolitanArea(landType) \|\| housePriorNeedsMetropolitan(landType, zoneType, 사건 raw)`일 때만 `nblIsMetropolitanArea`를 읽는다(D-13) ④ 정착면적 문자열 → `parseNumber`(`input` 단위 ㎡ — 빈칸·비양수는 엔진이 `unconfirmed`로 접으므로 매퍼는 변환만). `buildOtherLand`는 주택 지목에서 `undefined`라 무변경 |
| date-coerce | 영향 없음 | 날짜는 ⑭ 주입 `parseDate` |
| 엔진 leaf | `other-land-state-history.ts`(403 → ≈500) | `StateTail.buildingKind` · `StateTail.houseCtx`(zone · metro · landArea · transferDate) · 구간 `buildingKind`·`houseOutcome`·`houseCheck` · `isStateIntervalBusiness` 분기 · `eventClosesHouseInterval` · `resolveHouseInterval` · `housingStateEventIssue` · `houseKindEventIssue` · `housePriorNeedsMetropolitan` · `houseFootprintIssue`(⑧ 공용 — 비수치·0·음수·정착>토지) · `StateEventSubject`(D-9). **500줄이 넘으면 `house-state-history.ts`로 분리**(≤700 목표 · D-4와 같은 기회주의적 분리) |
| **신규 파일** | `housing-limit.ts`(≈45 — A·B 공용 배율 helper) · `housing-state-history.ts`(≈150 — A apply) | `housing-land.ts`(184 → ≈175)는 `:84-101` 이동 + 호출(바이트 동일 경고)·이내/초과 반환 직전 호출 2줄 |
| B 기타토지 apply | `other-land-state-history-apply.ts`(192 → ≈220) | `unknownClosers` 필터 1줄(T-6) · 주택 구간 고지 · `ctx` 전달. 사업용 구간 조립은 무변경 |
| echo 공용화 | `other-land-state-history-apply.ts` → `state-history-echo.ts`(신규 ≈50)로 `intervalEcho`·`criteriaEcho` 이동 | D-4 — 기존 apply는 import로 바뀔 뿐 **출력 바이트 동일** |
| 소비표 | `land-category.ts:120` | `housing.stateHistory = true` + `consumesHousingStateHistory(landType)`. **`other_land.metropolitanArea`는 false 유지**(D-13). **UI는 `nblOtherStateHistoryApplies`를 기타토지 전용으로 고정**(UI 계획서 A-1)하므로 `gates` 진리표 테스트는 불변 |
| 타입 | `land-usage.types.ts`(411 → ≈445) | `StateBuildingKind = "house"` · `LandStateInterval.buildingKind?`·`houseOutcome?: "within" \| "unconfirmed" \| "exceeded"`·`houseCheck?` · `StateEvent.buildingKindBefore?`·`houseFootprintBefore?` · `StateHistoryIntervalEcho` 같은 optional 필드 |
| 고지·문구 | `nbl-confirm-notices.ts`(259 → ≈315) · `nbl-validation-messages.ts`(122 → ≈155) | §4.5 신규 상수 8종 · `subject` 인자(D-9) · 정착면적 검증 문구(⑧ 공용). 기존 문구 **바이트 불변** |
| 법령 상수·manifest | **새 조문 인용 없음** | `NBL.HOUSING_MULTIPLIER`·`NBL.MAIN`·`NBL.CRITERIA`·`NBL.UNAVOIDABLE_PERIOD` 재사용. 고지에 지방세법 §106②·규칙 §83의5①5호/9호를 **새로** 인용하면 상수 + `lib/legal-verification/manifest/additions-*.ts` 등록 + `npm run verify:legal`(CLAUDE.md) |
| 구 이력 복원 | `calc-wizard-asset-migrate-nbl.ts` | 중첩 칸 기본값 `""`(E3-1b `areaWithinLimitBefore` 처리와 같은 모양) — UI 소관 |

**5단 파이프라인 전수**: 폼(①②③ UI) → 변환(④ prefix-pick + **수도권 게이트** · ⑬ 무변경) → body → Zod(⑫ 중첩 칸 + ⑫′ 구조 규칙) → Route(⑭ `buildLandStateHistory` 주택·종류·정착면적 + `metroRaw` 게이트) → 엔진 `landStateHistory` + `isMetropolitanArea`. 완료 점검: `git grep -n "buildingKindBefore\|houseFootprintBefore\|housePriorNeedsMetropolitan"`가 ⑫·⑭·④·엔진 leaf·store(UI)·validate(UI)·와이어(UI)에서 모두 나와야 한다(침묵 strip·게이트 누락 방지).

### 5.1 D-n — 설계 확정 (사용자 결정 불필요 · 근거 있음)

| # | 확정 | 근거 |
|---|---|---|
| **D-1** | 주택부수토지 카드의 이력은 **마지막 건축물 사건이 신축**이어야 한다. 철거로 끝나는 입력은 ⑧·⑫가 차단하고 «양도일 전에 주택이 철거됐다면 지목을 「나대지·잡종지」로 바꿔 입력하세요»를 안내한다(→ B 경로) | 카드의 양도일 현재 상태 = 주택 있음(§3.1). 자동 지목 전환은 사용자가 고른 지목 무시 → 기각 |
| **D-2** | 주택 카드에서 `tax_type_changed` 사건은 차단 | 주택 구간에는 토지 재산세 구분이 없고(지방세법 §106②) 나대지 구간 구분 변경은 신축 행의 나대지 선언(E3-1b)으로 이미 말할 수 있다 |
| **D-3** | 주택 구간의 `propertyTaxType`은 판정에 쓰지 않는다 — `buildingKind = "house"`가 먼저 읽힌다. **값은 `"unknown"` 고정**이고 `unknownClosers`에서 `buildingKind === "house"` 구간을 제외하는 한 줄 필터를 둔다(T-6). UI는 `buildingKind`를 먼저 읽어 «주택(부속토지)»로 표기한다 | 조심 2018서0295 |
| **D-4** | 구간·기준 echo 조립은 공용 helper로 이동 | 두 apply가 한 표를 읽어 «입력 화면에서 본 표 = 판정한 표»(UI R1) |
| **D-5** | 겸용주택은 **범위 밖**(A·B 모두) | 주택부수토지 카드는 토지 단독 양도의 주택 부속토지다. 겸용주택 부수토지는 양도세 겸용주택 경로(`transfer-tax-mixed-use-nbl-rate.ts` — NBL2611-V4-HS01)가 따로 안분하고 상가분은 Q-8 (가) **재제안 금지** 경계다. B에서 겸용주택 철거는 «주택»을 고르지 않는다는 안내만 둔다 |
| **D-6** | 주택 **자산**(주택 + 부수토지 일괄 양도) 경로의 배율 초과분(`appurtenant-excess-deeming.ts` · `housing-excess-split.ts`)은 건드리지 않는다 | NBL 토지 카드와 다른 입구(V-9) |
| **D-7** | B의 철거 행은 **종류 칸(`buildingKindBefore`) + 철거 전 정착면적(`houseFootprintBefore`)** 으로 받고 엔진이 배율을 판정한다(**Q-7 (나) 사용자 결정 2026-11-24**) | §3.4 |
| **D-8** | B 규칙: `buildingKindBefore = house`는 철거 행에서만 · 주택 구간 안에 `tax_type_changed` 금지 | 주택에는 토지 구분이 없다(D-2와 같은 이유) |
| **D-9** | **R-3 — 검증 문구 «건축물»→«주택» 변형**: `nbl-validation-messages.ts`의 `stateEvent*Message`·`eventRowPrefix`·`STATE_EVENTS_REQUIRED_MESSAGE`가 `subject: "building" \| "house"`(기본 `"building"` → **바이트 동일**)를 받고, leaf `stateEventRowIssue(row, index, subject?)`·`stateEventSequenceIssue(events, { transferDate, floorDate?, subject? })`가 그 인자를 넘긴다. 호출처는 지목 그룹으로 `stateEventSubjectOf(landType)`(= 주택부수토지 → `house`)를 얻어 ⑧·⑫가 **같은 값**을 쓴다. 변형은 접두(«주택 사건 N번째 행»)·종류 라벨(«주택 신축» / «주택 멸실·철거·붕괴» — `STATE_EVENT_KIND_LABEL_HOUSE`)·상태 라벨(«주택 있음»/«주택 없음»)·0건 문구. 기타토지 카드의 B 철거 행은 기타토지 카드이므로 «건축물» 문구 유지 | UI UQ-4 (가) |
| **D-10** | **R-6 — 주택 아닌 건축물 구간 안내 상수**: `NBL_STATE_HISTORY_HOUSING_NON_HOUSE_BUILDING_NOTICE`(§4.5) 단일 소스 | UI UQ-5 (가) |
| **D-11** | **배율 연혁 = 양도일 기준**: 과거 주택 구간(A·B)도 `getHousingMultiplier(zone, metro, 양도일)`로 판정한다 — 구간 당시 배율을 쓰지 않는다 | 영 부칙(제30395호, 2020.2.11.) 제1조 3호 · 제2조② · **제39조**(본문 확인 — §3.4). 현행 코드도 양도일 기준(`urban-area.ts:79-90` 주석 · `housing-land.ts:94-98`) |
| **D-12** | **배율·한도 계산은 단일 소스 `housing-limit.ts`**: `judgeHousingLand`의 `:84-101`을 추출해 `judgeHousingLand`·A·B 과거 구간이 같은 함수를 부른다. 이동은 **바이트 동일**(경고·steps) — P-2·P-3·P-9·P-11의 기존 anchor가 지킨다 | CLAUDE.md «단일 소스» · 정수 연산(`areaTimes`·`judgeAreaLimit` — 부동소수 곱 금지) |
| **D-13** | **수도권 여부 개방 범위 = 조건부(소비표 열은 그대로 false)**: `housePriorNeedsMetropolitan(landType, zoneType, events)` 한 술어가 ⑤·④·⑧·⑭를 정한다 | 소비표 `other_land.metropolitanArea = true`로 열면 기타토지 모든 입력에 수도권 칸이 보이고 ⑧이 필수로 막아 **무관한 기존 입력이 막다른 길**이 된다. 게이트의 안전망이 얇아(P-10 3건 · P-12 5건) 넓게 열면 파급을 못 잡으므로 **좁은 조건부 술어 + 새 anchor**로 연다. 수도권이 판정을 가르는 조합은 주·상·공뿐이라 조건도 거기까지 |
| **D-14** | 용도지역은 카드 기존 `nblZoneType` 재사용 — ⑧이 이미 필수(`transfer-tax-validate-nbl.ts:114-115`). `undesignated`(미지정)는 `isUrbanForHousing` false → **10배**(기존 주택부수토지와 동일 — V-20) | 단일 소스 |
| **D-15** | 토지 면적은 카드 기존 칸 `acquisitionArea`(→ `input.landArea`) 재사용 — **취득 면적**이라 철거 당시와 같다고 가정한다(새 «철거 당시 토지 면적» 칸을 만들지 않는다 · V-19) | 칸 최소 · 기존 주택부수토지와 같은 입력 |
| **D-16** | **엔진 안전망(직접 API) = 400 없이 접힘**: 정착면적 빈칸·0·음수·비수치·**정착면적 > 토지 면적**은 `unconfirmed`(비사업용 접힘 + `HOUSE_WITHIN_UNCONFIRMED_NOTICE`). UI는 ⑧이 전부 차단(Q-10 (가) — A·B 공통, `houseFootprintIssue` 단일 leaf). ⑫′에 거울을 두지 않는다. 의제 사유(§168의14②) 선택 시 ⑧은 H9 정착면적·H10 수도권도 건너뛴다(UI UQ-12 (가) — 사용자 결정 2026-11-24 · 엔진은 의제면 이력을 읽지 않음 · 의제 판정은 ④·⑭ 매퍼와 같은 함수 — R-10) | 기존 housing 정착면적·수도권 규칙(`transfer-tax-validate-nbl.ts:199-216`)이 ⑧만 가지고 엔진이 방어하는 정책 · UI 통과 ↔ API 400 모순 방지 |
| **D-17** | **정착면적을 모르는 사용자의 정상 탈출구는 이력 질문 «모름»(`unknown`)** — 현행 판정 + `NBL_STATE_HISTORY_UNKNOWN_NOTICE`(바이트 동일, 이득·불이익 없음). A(종류 칸 없음)에는 이 길뿐이고, B에는 «종류 `""` 우회»가 추가로 있다(Q-12) | §2.2 |

### 5.2 T-n — 함정 (구현자가 반드시 닫을 것)

| # | 함정 | 실측·근거 | 가드 |
|---|---|---|---|
| **T-1** | A: 이내 core를 비사업용으로 뒤집으며 `areaProportioning`(`nonBusinessRatio: 0`)을 유지 → 판정 비사업용 · `nonBusinessAreaRatio 0` · **세액 198,210,000(사업용 세액)** | 격리 사본에서 이내 분기 `isBusiness`만 `false`로 바꿔 실측: ratio 0 · `calculatedTax` 198,210,000. `engine.ts:385`의 `?? 1`은 `undefined`일 때만 작동 | 뒤집을 때 `areaProportioning = undefined` · Anchor 4 · Y-1 |
| **T-2** | 별장 `REDIRECT`가 `judgeHousingLand({...engineInput, landType: "housing_site"})`로 재분류(`engine.ts:181`) — 후처리가 `landStateHistory`를 읽으면 별장 입력에 이력이 도달할 수 있다 | 별장 카드는 `consumesStateHistory`가 false라 `landStateHistory`가 없다 | 소비표 게이트 유지 · P1 · Y-4 |
| **T-3** | 소비표를 열면 ④⑤⑧ 기타토지 전용 술어(`nblOtherHasBuilding` 토글 파생 등)가 주택 카드에서 오동작 | V-11 | UI가 술어를 기타토지 전용으로 고정(UI A-1) |
| **T-4** | `buildLandStateHistory`의 `tailHasBuilding = asBool(a.nblOtherHasBuilding)`(`:322`) — 주택 카드는 이 토글이 없어 항상 false | 코드 판독 | ⑭ 주택이면 `true` · Y-9 |
| **T-5** | B: 철거 행을 `house`로 바꾼 뒤에도 이전에 고른 `propertyTaxTypeBefore`(별도합산 등)가 와이어에 남아 엔진이 읽거나 «별도합산 위장»이 같이 실린다 | 코드 판독(운반 규약) | ⑭ 주택 구간 철거 행은 `propertyTaxTypeBefore` 미운반 · 엔진 술어는 `buildingKind`를 먼저 읽는다 · Y-16 |
| **T-6** | 주택 구간 `propertyTaxType = "unknown"`을 기타토지 apply `unknownClosers`가 «철거 직전 재산세 구분 모름»으로 읽어 오고지 | 코드 판독(`other-land-state-history-apply.ts:160`) | 필터 1줄 · Y-17 |
| **T-7** | **수도권 값이 other_land에서 3군데에서 침묵으로 버려진다**: ④ `non-business-land-request.ts:165` `metro: consumesMetropolitanArea(...)` · ⑭ `form-mapper.ts:155` `metroRaw` · (⑧ `:199`은 필수 요구) — 하나라도 `housePriorNeedsMetropolitan`을 모르면 엔진 `isMetropolitanArea`가 `undefined` → **보수적 수도권 3배 기본값**으로 계산되어 수도권 밖 사용자의 구간이 «초과»로 접힌다(과대) | 코드 판독 + P-10 실측: `metroRaw` 게이트를 지워도 실패는 **3건·2파일**뿐(§7.1) | 술어 단일 소스 · Anchor 10(수도권 값이 other_land 입력까지 관통) · Y-24·Y-25 |
| **T-8** | 정착면적 문자열 파싱: 빈칸·`"0"`·`"-5"`·`"1e2"`·쉼표(`"1,000"`) — `parseNumber`가 어떻게 읽는지에 따라 «모름»이 0으로 읽혀 `unconfirmed`가 아니라 입력 오류 경로로 가거나 반대로 `NaN`이 `judgeAreaLimit`에 들어간다 | 코드 판독(`parseNumber`는 ⑭ 주입) | 엔진은 `Number.isFinite && > 0`만 계산하고 그 밖은 `unconfirmed` · 엔진 단위 테스트에 문자열 변형 격자 |

---

## 6. 케이스 매트릭스 (단순 → 복잡)

### 6.1 A — 주택부수토지 카드(양도일 현재 주택 있음)

공통: §2.1 입력(주택부수토지 500㎡ · 정착 100㎡ · 5배 이내). 「현행」= 실측, 「기대」= 오라클(모델 §4.2 산식대로 `meetsPeriodCriteria`에 사업용 구간을 직접 넣음). 구현 후 leaf → 엔진 → route가 같은 표를 대조한다.

| # | 시나리오 | 현행 | 기대(오라클) | 세액 변동 |
|---|---|---|---|---|
| **M15** | 신축 직후: 준공 2023-06-01(나대지 → 주택) | 사업용 B 198,210,000 | **비사업용 N 253,960,000** — 사업 214/3,651 · 5y 1,612>730 · 3y 881>365 · 총 3,437>1,460 | **+55,750,000** |
| M15b | 준공 2023-06-02 | 사업용 | 비사업용 — 사업 213 | + |
| M15c | M15 + 5호 유예(취득 후 2년 + 착공 2022-06-01~준공, 합 1,095일) | 사업용(유예 안 읽음) | 비사업용 — eff 1,309 · 총 비사업 2,342 | + |
| M15d | M15 + 취득 후 2년 유예만(730) | 사업용 | 비사업용 — eff 944 · 총 2,707 | + |
| M8a | 경계: 준공 2022-01-01 | 사업용 | **사업용** — 사업 730 · 3y 비사업 365(나목 미충족) | 0 |
| M8b | 경계: 준공 2022-01-02 | 사업용 | **비사업용** — 사업 729 · 3y 366 | + |
| G1 | v2 폐기 가드: 준공 2022-06-01(6.1. 당일) | 사업용 | 비사업용 — 사업 579 | +(6.1.은 특별하지 않다) |
| M8c | 윤일 낀 창: 양도 2024-03-01 · 취득 2014-01-01 · 준공 2022-03-01(꼬리 731) / 2022-03-02(730) | 사업용 | 731 → 사업용 · 730 → 비사업용(기타토지 M8c와 같은 표) | 0 / + |
| H3 | 철거 2018-01-01 → 재신축 2020-01-01(갭 730) · 구옥 정착면적 **100㎡**(허용 500 이내 — 별도 표기가 없으면 6.1의 구옥 정착면적 = 100㎡) | 사업용 | 사업용 — 총 비사업 730 | 0 |
| H3b | 갭 881일(2021-01-01 ~ 2023-06-01) | 사업용 | 사업용 — 총 881 ≤ 1,460 | 0 |
| **H3c** | 철거 2016-01-01 → 재신축 2023-01-01(갭 2,557) · within | 사업용 | **비사업용** — eff 1,094 · 5y 1,461 · 3y 730 · 총 2,557 | **+55,750,000** |
| H3d | H3c + 9호 유예 2016-01-01~2018-01-01(731) | 사업용 | 비사업용 — eff 1,825 · 총 1,826 | + |
| H3e | H3c에서 구옥 정착면적 **빈칸**(UI는 ⑧ 차단 — **직접 API만** 접힘) | 사업용 | 비사업용(철거 전 주택 구간도 접힘) — 사업 `[재신축~양도일)` 365만 | + |
| H3f | H3c에서 구옥 정착면적 **50㎡**(허용 250 < 토지 500 → 초과 250㎡ — 엔진 계산) | 사업용 | **Q-5 (나)**: 그 구간 접힘 → H3e와 같은 값 — 비사업용(사업 `[재신축~양도일)` 365만 · `HOUSE_EXCEEDED_NOTICE`) | + (H3e와 같은 N) |
| H8 | 취득 2022-07-01 · 양도 2024-06-30(소유 729) · 신축 2023-10-01 | B 257,010,000 | 비사업용 — 3호 단서(가목 미적용) 다목: 총 비사업 456 > 291 | +69,750,000 |
| H8b | 같은 거래 · 신축 2022-09-01 | 사업용 | 사업용 — 비사업 61 | 0 |
| H9 | 취득 2022-07-01 · 양도 2023-12-31(소유 547) · 신축 2023-10-01 | B 279,000,000 | 비사업용 — 총 456 > 218 | +47,760,000 |
| **S1** | 배율 **초과**(1,000㎡ · 허용 500) + 신축 앞 나대지 | 비율 0.5 · 199,720,000 | **이력 미반영**(양도일 현재 상태의 초과 — Q-3a (나) 경계) — 현행과 같은 판정·세액 + `PARTIAL_AREA` 고지 | 0 |
| S2 | 초과 + 전 기간 유예(D1) | 사업용 | 현행과 같음(HG-1 보존) | 0 |
| S3 | 정착면적 0 + 이력 | N 253,960,000 | 현행과 같음(이력 미사용 — V-10 확인 필요) | 0 |
| P1 | 별장 `REDIRECT` → 주택 재분류(`villa_land` + 농어촌주택) + 이력 입력 | 현행 | 현행과 같음 — 별장 카드는 이력을 싣지 않는다(T-2) | 0 |
| P2 | 축 B 지분 3개: 같은 이력(신축 2023-06-01), 지분 취득일 2014-01-01 / 2020-01-01 / 2023-12-31 | 전부 사업용 | 지분1 비사업용(214/3,651) · 지분2 비사업용(214/1,460 — 2호: 가 1,246>365 · 나 881>365 · 다 1,246>584) · 지분3 소유 0일 → 비사업용(0일 안전 처리) — 사건은 지분 소유 첫날에서 클립(기타토지 M14와 같은 구조) | 지분별 B→N |
| P3 | 이월과세 시나리오 B(취득일 = 수증일 2023-12-01) + 신축 2023-06-01(수증일 앞) | 사업용 | 앞 구간 클립 → 소유 30일 전부 주택 → 사업용(30/30) | 0 |
| P4 | 소유 0일(취득 2023-12-31 · 양도 2024-01-01) | N(0일 안전 처리) | 이력과 무관 — 비사업용 | 0 |
| P5 | 양도차손(양도 2억 < 취득 3억) + 이력 | 세액 0 | 판정·고지만 바뀌고 세액 0 | 0 |
| X1 | 마지막 건축물 사건 = 철거(주택 카드) | — | **⑧·⑫ 차단**(D-1) + 지목 변경 안내 | — |
| X2 | `tax_type_changed` 사건(주택 카드) | — | **⑧·⑫ 차단**(D-2) | — |
| X3 | 같은 날 2건 · 역순 · 양도일 이후 · `changed` + 0건(주택 카드) | — | 기타토지와 **같은 leaf·같은 문구**로 차단(`stateEventSequenceIssue`) | — |
| **T-1** | M15 입력에서 뒤집힘 + `areaProportioning` 유지(결함 재현) | — | `nonBusinessAreaRatio = 0` · **세액 198,210,000**(실측) ↔ 정상 구현은 ratio 1 · 253,960,000 | 가드 |

**한눈에(A)**: 이력이 판정(=세액)을 바꾸는 시나리오 — M15·M15b·M15c·M15d·M8b·G1·H3c·H3d·H3e·H3f·H8·H9(과소 해소 +) · 변동 0: M8a·H3·H3b·H8b·S1~S3·P1~P5.

### 6.2 B — 주택 철거 후 나대지 양도(기타토지 카드 · 철거 행 `buildingKindBefore = house` + `houseFootprintBefore`)

공통: 기타토지(잡종지) **1,000㎡**(`acquisitionArea`) · 일반주거(`general_residential`) · **수도권 밖**(`nblIsMetropolitanArea = no` → 5배) · 양도 10억 · 취득 3억 · 2014-01-01 → 2024-01-01(소유 3,651일) · 꼬리 = 나대지 + 종합합산. 철거 행의 정착면적은 별도 표기가 없으면 **200㎡**(허용 1,000㎡ → 이내). 「현행」= 이력 없음(또는 «모름·종합합산» 사슬) 실측 · 「위장 실측」= 같은 구간 구조를 현행 엔진에 `propertyTaxTypeBefore = separate`로 넣은 실제 엔진 값(= `E2_ROWS` 단언 — 이내 판정된 주택 구간은 이 값을 그대로 내야 한다) · 「기대」= 오라클 · **배율 경계 수치는 실측**(`getHousingMultiplier` → `areaTimes` → `judgeAreaLimit` 직접 호출).

**배율 판정 경계(실측)**

| 입력(토지 1,000㎡) | 배율 | 허용 면적 | 판정 |
|---|---|---|---|
| 일반주거 · 수도권 밖 · 양도 2024-01-01 · 정착면적 **200.00** | 5배 | 1,000.00 | **이내** |
| 같은 조건 · 정착면적 **199.99** | 5배 | 999.95 | **초과 0.05㎡** |
| 일반주거 · 수도권 · 양도 2024-01-01 · 정착면적 **333.34** | 3배 | 1,000.02 | **이내** |
| 같은 조건 · 정착면적 **333.33** | 3배 | 999.99 | **초과 0.01㎡** |
| 일반주거 · 수도권 · 양도 **2021-12-31** · 정착면적 200 | 5배(종전 — 부칙 제39조) | 1,000 | 이내 |
| 같은 조건 · 양도 **2022-01-01** · 정착면적 200 | 3배 | 600 | **초과 400㎡** |
| 녹지 · 수도권 · 정착면적 200 | 5배 | 1,000 | 이내 |
| 관리지역(도시지역 밖) · 정착면적 100 | 10배 | 1,000 | 이내 |
| 미지정(`undesignated`) · 정착면적 100 | 10배 | 1,000 | 이내(기존 주택부수토지와 같은 처리 — V-20) |

| # | 시나리오 | 현행 | 기대(오라클 = 위장 실측) | 세액 변동 |
|---|---|---|---|---|
| B0 | 이력 없음(철거를 입력하지 않음) | N 253,960,000 | 변동 없음(이력 `""`·`unchanged`) | 0 |
| **B1** | 주택 2014-01-02 ~ 철거 2021-01-01(정착 200 → **이내**) → 나대지 | N 253,960,000(철거 사건 Before 모름·종합합산 — 실측) | **사업용** B 198,210,000 — 사업 2,556/3,651 · 비사업 1,095(가 1,095>730 · 나 1,095>365 충족 · 다 1,095 ≤ 1,460 미충족) — 위장 실측 = E2 M1 | **−55,750,000**(과대 해소) |
| **B1b** | B1에서 정착면적 **199.99**(허용 999.95 → **초과 0.05㎡**) | N | **N — 구간 접힘**(Q-5 (나) · `HOUSE_EXCEEDED_NOTICE` · echo 허용 999.95/토지 1,000/초과 0.05) — **0.05㎡ 차이가 −55,750,000 ↔ 0을 가른다**(절벽 — Q-5 (나) 결정의 귀결 · V-16) | 0 |
| B1c | 수도권 3배: 정착 333.34 → 이내 / 333.33 → 초과(수도권 = `yes`, 주·상·공) | N | 사업용(B1과 같은 수) / N(접힘) | −55,750,000 / 0 |
| B1d | **배율 연혁 쌍**: 수도권 일반주거 · 정착 200 · 양도 **2021-12-31**(5배 → 이내) / **2022-01-01**(3배 → 초과 400㎡) | — | **양도일로 갈린다**(D-11 — 과거 구간 당시 배율이 아니다). 판정만 단언(세액은 양도일마다 B/N 재측정) | 입력별 |
| B1′ | 같은 구간 구조를 현행에서 `separate`로 위장 | B 198,210,000 | 변동 없음 — 위장 입력은 그대로 같은 값(회귀 가드: B 도입이 기존 위장 입력의 결과를 바꾸지 않는다) | 0 |
| B2 | B1 + 9호 유예 2년(철거일 2021-01-01~2023-01-01) | B 198,210,000(유예 단독 730 — 직전 3년 비사업 365 ≤ 365) | 사업용 — eff 3,286 · 유예 730 — E2 M2 | 0 |
| **B3** | 철거 2019-01-01 + 9호 유예 731일, 이력 없음 | **N 253,960,000**(유예 단독 731 · 실측) | **사업용** B — eff 2,556 · 유예 731 — E2 M3 | **−55,750,000** |
| B4 | 철거 2022-06-01 | N | 사업용 — eff 3,072 · 비사업 579(가 미충족) — E2 M4 | −55,750,000 |
| Z-1462 / 1461 / 1460 | 철거 2019-12-31 / 2020-01-01 / 2020-01-02(다목 40% 쌍) | N / N / N | **비사업용**(eff 2,189 · 비사업 1,462) / **비사업용**(2,190 · 1,461) / **사업용**(2,191 · 1,460) — E2 Z | 0 / 0 / −55,750,000 |
| GA | 주택 2019-01-01 신축 ~ 철거 2022-01-01 / 2021-12-31(가목 쌍) | N / N | **사업용**(eff 1,096 · 직전 5년 비사업 730) / **비사업용**(1,095 · 731) — E2 GA | −55,750,000 / 0 |
| B5 | 주택 → 철거 2024-02-01 → 양도 2024-03-15(꼬리 43일) | N | 사업용 — eff 3,682/3,725 — E2 P2 | −55,750,000 |
| **B6** | 정착면적 **빈칸**(UI는 ⑧ 차단 — **직접 API만**) | N | N — **접힘**(비사업) + `HOUSE_WITHIN_UNCONFIRMED_NOTICE` — E2 R3와 같은 수(eff 0) | 0 |
| **B7** | 정착면적 **100**(허용 500 → 초과 500㎡) | N | N — 그 구간 접힘(Q-5 (나)) + `HOUSE_EXCEEDED_NOTICE` · **B6(모름)과 같은 수 — «초과»가 «모름»보다 유리하지 않다** | 0 |
| B7g | B7 + 9호 유예(철거일 앵커) | N(유예 단독) | 유예 그대로 합집합 + `HOUSE_EXCEEDED_GRACE_NOTICE`(Q-8 (가) · 0792) | 유예만큼 |
| B8 | 주택 아닌 건축물(`buildingKindBefore = ""`) + `propertyTaxTypeBefore = separate` | B 198,210,000 | **바이트 동일**(주택 모델 도입 전후 같음) | 0 |
| B9 | 주택 구간 안에 `tax_type_changed`(철거 행 `house`) | — | **⑧·⑫ 차단**(D-8) | — |
| B10 | `buildingKindBefore = house`를 신축 행·구분 변경 행에 입력 | — | **⑧·⑫ 차단**(D-8) | — |
| B11 | 숨은 stale: 철거 행을 `house`로 바꾼 뒤 이전 `propertyTaxTypeBefore = separate` 잔존 | — | 엔진·⑭가 읽지 않는다 — 철거 행 `house` + 정착면적 빈칸이면 B6과 같은 N(위장 값이 새지 않는다) | 0 |
| B12 | 부분 면적(`isPartialArea(core)`)·의제 양도일 동시 | 종전 | 종전대로 **이력 미적용 + 고지**(기타토지 apply 무변경) | 0 |
| B13 | 축 B 지분 3개(취득 2014-01-01 / 2020-01-01 / 2021-06-01) · 같은 이력(주택 ~ 철거 2021-01-01) | 셋 모두 N | 지분1 B(2,556/3,651) · 지분2 비사업용(2호) · 지분3 비사업용(3호) — 기타토지 M14와 **같은 구조**. **지분 카드의 `acquisitionArea`가 지분 면적이면 배율 비교가 어긋난다 → 확인 필요(V-19)** | 지분별 |
| B14 | 주택 → 철거 → **주택 아닌 건축물(별도합산) 신축** → 양도(꼬리 건축물) | — | 주택 구간 + 건물 구간(core 꼬리 사업용) + 나대지 갭 — 기타토지 합성 규칙 그대로 | 입력별 |
| **B15** | 정착면적 **0 · −5 · `abc` · 정착 > 토지(1,200㎡ > 1,000㎡)** | — | **⑧ 차단**(Q-10 (가) — A·B 공통). 직접 API(⑫ 400 없음)는 엔진이 `unconfirmed`로 접어 B6과 같은 수 + 고지(T-8) — **정착 > 토지는 접힘이지 «이내»가 아니다**(D-16 · Y-31) | — / 0 |
| **B16** | **수도권 «모름»·미선택**(주·상·공 · 정착면적 입력됨) | — | **⑧ 차단**(`transfer-tax-validate-nbl.ts:199-203` 규칙의 조건부 확장). 직접 API는 보수적 수도권(3배) 기본값 + 기존 경고 문구 | — |
| **B19** | **종류 `""` 우회(Q-12)** — 정착면적을 모르는 사용자가 «건축물 종류 = 그 밖», 철거 직전 재산세 구분을 **모름 / 종합합산 / 비과세·면제 / 분리과세 / 별도합산**으로 입력(철거 2021-01-01 · 이력 외 입력 동일) | — | **현행 엔진 실측**: 모름 → **N 253,960,000** · 종합합산 → **N** · 비과세·면제 → **B 198,210,000(eff 2,556)** · 분리과세 → **B** · 별도합산 → **B**. 즉 **혜택은 허위 비종합합산 구분 선언일 때만** 생기고 «모름»·종합합산 우회는 N(혜택 없음). B 도입 전후 같은 값(B1′·B8 회귀 가드). Q-12 | 0 |
| B17 | 수도권 여부가 판정을 가르지 않는 조합(녹지 · 도시지역 밖 · 철거 행 `house` 없음) | — | **수도권 칸을 묻지 않는다**(조건부 술어 거짓 — 기타토지 기존 입력은 칸 변화 0) | 0 |
| B18 | 수용 양도 + 주택 구간 | — | `housing-land.ts:74-81`과 같은 «사업인정 고시일 전날 용도지역» 고지(V-18) | — |

**한눈에(B)**: 과대 해소(−55,750,000) — B1·B1c(333.34)·B3·B4·B5·GA(2022-01-01)·Z-1460 / 변동 0 — B0·B1b·B1′·B2·B6·B7·B8·B12·Z-1462·Z-1461·GA(2021-12-31).

---

## 7. Pre-Do anchor · mutation · PR 분할

### 7.1 착수 전 mutation 실측 (격리 사본 `git archive HEAD` → 1줄 무력화 → 실패 anchor 확인 → 사본 삭제)

A 경로(주택 이내 분기·소비표·매퍼 가드·초과 유예) = P-1~P-5 · B 경로(Before → 사업용 사슬·운반·⑫ strip) = P-6~P-8 · **B 정착면적 판정(Q-7 (나) — 배율 표·한도 경계·수도권 게이트·⑧ 수도권 규칙) = P-9~P-12**(2026-11-24 추가 · 로드 1~2).

| P | 무력화 대상 | 변경 | 실패(변이 고유) | 해석 |
|---|---|---|---|---|
| P-1 | 소비표 열 열기 — `land-category.ts:120` `housing.stateHistory: false → true` | 전체 범위 | **2건** — `__tests__/lib/calc/nbl-state-history-gates.anchor.test.ts:38`(«지목 housing_site: 기타토지만 true») · `__tests__/tax-engine/non-business-land/nbl-state-history-leaf.test.ts:512`(«그 밖의 지목 housing_site → false») | 계약 실재. **정정(UI 시니어 정합)**: `gates` 실패는 **현행 UI 술어 `nblOtherStateHistoryApplies`가 `consumesStateHistory`를 그대로 읽기 때문**이다. UI 계획서(A-1)가 이 술어를 «기타토지 전용»(`consumesStateHistory ∧ ¬consumesHousingStateHistory ∧ ¬nblOtherUseParcels`)으로 고정하므로 **`gates` 단언은 불변이고 반전 대상이 아니다**. 의도적으로 뒤집을 것은 `leaf.test.ts:511-513`(+ `leaf-unreachable` WIRE-3·4, §7.2 Anchor 7)뿐이다. 골든 격자 G19(주택부수토지 초과)·E0 compat은 깨지지 않는다 — 엔진이 이 열을 아직 읽지 않아 «열기만 하고 판정을 연결하지 않은 상태»는 도달 불가로 안전하다(E1 선례) |
| P-2 | 이내 분기 이전의 «양도일 현재 상태» 고지 제거 — `housing-land.ts:73` | 전체 범위 | **2건** — `nbl2611-b2-echo.anchor`(«주택부수토지: 양도일 현재 상태 일괄 적용 고지») · `nbl-state-history-compat.anchor`(G19) | 🔴 **얇음** — 이 계획이 이 줄 옆(이내 반환 직전)에 «이력 있으면 한정 고지로 대체» 분기를 넣는다. E0 골든 격자의 주택부수토지 행은 **초과(G19) 1행뿐이고 이내 행이 0개**다 → Anchor 2에 주택 이내 행 필수 |
| P-3 | 이내 분기 echo `periodEvaluation.basis` `not_judged` → `state_at_transfer` | 전체 범위 | **2건** — `nbl2611-b2-echo.anchor`(«주택부수토지(배율 이내): not_judged» · «별장 농어촌주택 … 재분류 경로: not_judged») | 🔴 **얇음** — 이력 없음 = `not_judged` echo(바이트 동일)를 지키는 단언이 2건뿐 |
| P-4 | ⑭ `buildLandStateHistory`의 소비 가드 제거 — `form-mapper-helpers.ts:311` | 축소 범위 | **1건** — `nbl-state-history-e2.anchor`(«이력을 쓰지 않는 지목(농지)은 이력 칸이 와도 싣지 않는다») | 🔴 **얇음** — 주택·별장 등 다른 지목의 «이력 칸 미운반»을 지키는 단언이 **농지 1건뿐**이다 → 주택·별장 행 추가(T-2 · Anchor 2) |
| P-5 | 초과분 유예 반영 제거(D1 · Q-3a (나)) — `housing-land.ts:174` `if (!graceJudged) return excessResult` → 항상 `return excessResult` | 축소 범위 | **5건** — `nbl2611-d1-period-followup.anchor` HG-1 · HG-3 · HG-4 · HG-6 · HG-8 | 계약 실재 — 이 계획은 **초과 경로를 바꾸지 않으므로 HG-1~8은 그대로 green이어야 한다**(Anchor 3 · Y-2) |
| **P-6** | B가 올라타는 «Before → 사업용» 사슬 — `other-land-state-history.ts:353` `BUSINESS_PROPERTY_TAX_TYPES`에서 `"separate"` 제거 | `non-business-land/ lib/ calc/nbl* api/nbl-state-history*`(379파일) | **163건·14파일** — leaf 26 · e2-route 26 · e2 anchor 25 · e3-1 anchor 16 · e3-1b anchor 14 · e3-1b-route 13 · e3-1-route 13 · e3-1-leaf 10 · e3-1b-leaf 10 · 그 밖 5파일 | 계약 **두텁다** — B는 이 술어에 `buildingKind === "house"` 분기를 **앞에** 얹으므로 이 163건이 «기타토지 철거 행(주택 아님) 바이트 동일» 회귀를 이미 지킨다(B8) |
| **P-7** | B 운반 규약 — `eventCarriesTaxTypeBefore`(`:83`)를 항상 `false` | 같음 | **131건·20파일** — e2 anchor 27 · e2-route 26 · e3-1 anchor 19 · e3-1-route 15 · e3-1-client 10 · section-render(DOM) 10 · … | 계약 두텁다 — B는 이 술어를 건드리지 않고 `eventClosesHouseInterval`을 **추가**한다(주택 구간 철거 행은 운반 제외). 기존 운반 anchor가 «주택 아닌 철거 행은 그대로 운반»을 지킨다 |
| **P-8** | ⑫ strip — `transfer-tax-schema-nbl.ts:60` `nblStateEventRawSchema.propertyTaxTypeBefore` 삭제 | 같음 | **71건·5파일** — e2-route 27 · e3-1b-route 25 · e3-1-route 17 · e3-2-route 1 · `leaf-unreachable` WIRE-5 1 | 계약 두텁다 — B의 새 중첩 칸 2개(`houseWithinLimitBefore`·`buildingKindBefore`)가 같은 형태의 strip 위험이고, **route 관통 anchor를 같은 표로 추가하면 같은 수준으로 잡힌다**(Y-8 · Y-18) |
| **P-9** | 배율 표 — `urban-area.ts:125` 수도권 주·상·공 `3` → `5` | `non-business-land/ lib/ calc/nbl* calc/transfer-tax-validate api/nbl`(384파일) | **20건·8파일** — `nbl2611-c5-mixed-use-facts.anchor` 6 · `building-site-multiplier.anchor` 5 · `qa-land-type-flow` 2 · `nbl2611-b5-area-precision.anchor` 2 · `housing-land.test` 2 · `urban-area.test` 1 · `engine.test` 1 · `transfer-validation-field-jump-cases` 1 | 계약 **두텁다** — B·A 과거 구간은 이 표를 `judgeHousingLimit`로 **그대로 재사용**하므로 배율 값 오류는 기존 20건이 잡는다(새 배율표를 만들지 않는 이유 — D-12) |
| **P-10** | 수도권 전송 게이트 — `form-mapper.ts:155` `metroRaw`를 항상 `""`로 | 같음 | **3건·2파일** — `nbl2611-b1-consumption.anchor` 2 · `calc/nbl2611-d1-pipeline.anchor` 1 | 🔴 **얇음** — B가 이 줄을 `\|\| housePriorNeedsMetropolitan(...)`로 넓힌다. 기타토지에서 수도권 값이 **실리지 않는다**는 단언(b1-consumption)은 있지만 **B 조건에서 실린다**는 단언은 0건 → Anchor 10 필수(T-7 · Y-24) |
| **P-11** | 면적 한도 경계 — `area-limit.ts:101` `within: land <= limit` → `<` | 같음 | **108건·15파일** — `nbl-state-history-e2-route.anchor` 19 · `e2.anchor` 18 · `e3-1b-route` 15 · `e3-1b.anchor` 14 · `e3-1.anchor` 11 · `e3-1-route` 10 · `nbl2611-b5-area-precision.anchor` 6 · `housing-land.test` 4 · … | 계약 **두텁다** — «이내 = 같음 포함» 경계(정착 200.00 → 허용 1,000.00 이내)를 이미 지킨다. B 경계쌍(200.00/199.99 · 333.34/333.33)은 같은 함수를 통과한다 |
| **P-12** | ⑧ 수도권 규칙 — `transfer-tax-validate-nbl.ts:201` `(!nblIsMetropolitanArea \|\| === "unknown")` → `false` | 같음 | **5건·3파일** — `nbl-pr1-gates.anchor` 2 · `nbl-housing-land-metropolitan-validate-b6.test` 2 · `transfer-validation-field-jump-cases` 1 | 🔴 **얇음** — B가 이 규칙을 조건부로 넓힌다(D-13). 현 단언은 주택부수토지·별장만 지킨다 → ⑧ 조건부 확장 anchor 필수(UI 계획서와 같은 표 — Anchor 11) |

**해석**: P-1~P-3은 `non-business-land/ calc/ lib/ api/` 전체 범위(기준선 **1,943 파일 · 27,651 통과(304 todo) · 실패 0**, 172초), P-4·P-5는 부하(55~68) 때문에 축소 범위(`non-business-land/ lib/` + `nbl-state-history-route`·`-e2-route` 2파일)로 실행했다 — 후자는 **하한**이다. **P-1~P-3 실행 모두에서 공통으로 나온 route·ruling 계열 22~30건(`gb-bg-carryover-total-transfer-expense` · `gb-legacy-direct-expense-non-purchase` · `one-house-rulings` · `menu-calc-parity-transfer` 등)은 `Test timed out in 5000ms`(로드 55~68)이다 — 무변이 사본에서 같은 경로 12파일 1,609건이 전건 통과함을 재실행으로 확인한 부하 시간초과 노이즈**라 표에서 제외했다. P-6~P-8은 로드 0.9~16에서 상태 이력 계열 379파일만 돌렸고 실패는 전부 `nbl-state-history*` 계열이다(노이즈 없음). **A 경로(P-2~P-4)는 안전망이 사실상 2건 이하로 얇고, B의 Before 사슬(P-6~P-8)·배율 표·한도 경계(P-9·P-11)는 두텁다. 그러나 B가 새로 여는 두 입구 — 수도권 값의 전송 게이트(P-10 3건)와 ⑧ 수도권 규칙(P-12 5건) — 는 얇다** → A는 Anchor 2·3, B는 Anchor 10·11(수도권 관통·⑧ 조건부 규칙)이 필수다.

### 7.2 Pre-Do anchor (E3d-0 — 테스트만, 지금 코드로 green이거나 의도된 skip)

| Anchor | 내용 | 지금 |
|---|---|---|
| **1 일 단위 정답표** | §6.1 행을 `meetsPeriodCriteria`에 사업용 구간을 직접 넣어 일수·판정 고정(공용 표 `_helpers/nbl-state-history-e3-3-table.ts` — UI R-7이 E2E에서 같은 표를 인용) + **기타토지 E2 신축 행(M6·M7·M8a/b·M8c·G1·P3·M13)과 같은 일수라는 parity** + 현행 열(§2.1 실측)을 «이 표가 왜 필요한가»로 고정 | green |
| **2 하위호환 골든** | E0 골든 격자에 **주택부수토지 행 추가**(이내 · 초과 · 정착면적 0 · 유예 유/무 · 수도권 미입력 · 별장 REDIRECT · 축 B 지분 · 이월과세 B) × 모드 4종(미전송·`""`·`unchanged`·`unknown`) — `judgeNonBusinessLand` 결과 객체 전체 + 세액. `unknown`만 고지 한 줄이 늘고 나머지는 바이트 동일 | green(현행 스냅샷) |
| **3 Q-3a (나) 보존** | 초과분 + 이력 `changed` → **판정·세액·echo가 현행과 같고** `PARTIAL_AREA` 고지만 추가 · HG-1~HG-8(`nbl2611-d1-period-followup.anchor`) green 유지 | green |
| **4 T-1 함정** | 뒤집힘 결과의 `nonBusinessAreaRatio === 1` · 세액 = N(253,960,000) — 구현 전에는 «현행 코드에서 이내 core를 비사업용으로 뒤집으면 ratio 0·세액 B»를 재현하는 조사 테스트를 skip으로 둔다 | skip→활성 |
| **5 ⑧↔⑫ parity** | 주택 카드 사건 격자(종류 × 순서·같은 날·양도일·교대 · D-1 마지막 철거 · D-2 구분 변경)와 B 종류 규칙(D-8)에서 leaf 결과(**문구 포함 — `subject` 인자 D-9**)가 ⑧·⑫ 호출에서 같다 | E3d-1·2 |
| **6 route 관통** | raw(`nblOtherStateHistoryMode`·`nblOtherStateEvents[].houseFootprintBefore`·`.buildingKindBefore`) → ⑫ → ⑭ → 엔진: M15·H3c·H8·S1(A) · B1·B3·B6·B7(B) 판정·세액 — **⑫ 중첩 칸 strip 가드** | E3d-1·2 |
| **7 소비표 가드(정정)** | **반전은 `nbl-state-history-leaf.test.ts:511-513`만**: 「기타토지 계열 → true」 목록(`:508-510`)에 `housing_site`를 넣고 「그 밖의 지목 → false」 목록(`:511`)에서 `housing_site`를 뺀다(농·임·목·별장·건물부수·`other`·`""`는 false 유지). 함께 `__tests__/lib/nbl-state-history-leaf-unreachable.test.ts:95-107`의 WIRE-3(`consumesStateHistory` 사용처 허용 목록 — 새 사용자가 생긴다)·WIRE-4(고지 상수 사용처 허용 목록 — 신규 상수가 생긴다)를 의도적으로 갱신한다. **`nbl-state-history-gates.anchor.test.ts:36-38`은 불변**(UI가 `nblOtherStateHistoryApplies`를 기타토지 전용으로 고정 — UI 계획서 A-1·§17). 위 `:511-513`·`:95-107` 줄 번호는 이 세션에서 파일을 읽어 확인했다 | E3d-1 |
| **8 B ↔ 위장 parity** | E2 철거 행(M1 · M2 · M3 · M4 · Z-1462/1461/1460 · GA · R1a/b · R2 · P2 · S1)을 «`propertyTaxTypeBefore = separate`»에서 «`buildingKindBefore = house` + **정착면적 200(이내)**»으로 바꾼 입력이 **같은 eff·판정·세액**을 낸다(`E2_ROWS`를 그대로 재사용) + R3(모름)·B6(빈칸)·B7(초과)이 같은 N | E3d-2 |
| **9 B 하위호환** | `buildingKindBefore` 미전송·`""` 철거 행: E0 골든 + E3-① · E3-1b · E3-② 스냅샷이 **바이트 동일**(P-6·P-7·P-8이 지키는 기존 anchor 전부 green) | E3d-2 |
| **10 수도권 관통(T-7)** | raw(`nblZoneType = general_residential` · 철거 행 `house` + 정착면적 · `nblIsMetropolitanArea = yes`/`no`) → ④ 와이어 → ⑫ → ⑭ → 엔진 `isMetropolitanArea`: 같은 정착면적 333.34가 **수도권 yes → 3배 이내 / no → 5배 이내(허용 1,666.7)**, 정착 200 · 양도 2024-01-01이 **yes → 초과(3배 600) / no → 이내(5배 1,000)** 로 갈린다 — 값이 엔진에 닿는지 판정으로 단언. **조건 밖**(녹지 · 도시지역 밖 · `house` 철거 행 없음)에서는 수도권 값이 **실리지 않는다**(기존 b1-consumption 단언 유지) | E3d-2 |
| **11 ⑧↔엔진 정착면적·수도권 격자** | 정착면적 {빈칸 · 0 · −5 · `abc` · 200 · 199.99 · 1,200(> 토지)} × 수도권 {yes · no · unknown · 칸 없음} × 용도지역 {주거 · 녹지 · 관리 · 미지정}: ⑧ 차단 여부(Q-10 (가) — 빈칸·0·음수·비수치·정착>토지 **전부 차단**)와 엔진 `houseOutcome`(`within`/`exceeded`/`unconfirmed`)이 **같은 표**에서 일관(⑧ 통과 ⇒ 엔진이 계산, ⑧ 차단 ⇒ 엔진은 접힘 — 직접 API 안전망. **정착 > 토지는 엔진도 접힘**) · A 카드 철거 행에도 같은 격자를 적용(Q-11 (나)). UI 계획서의 ⑧ 격자와 같은 표를 공유 | E3d-2 |
| **12 배율 helper 추출 parity** | `housing-limit.ts` 추출 전후 `judgeHousingLand` 결과 객체(steps·warnings·echo)가 **바이트 동일** — 이내·초과·수도권 미제공(보수 기본값 경고)·양도 2021-12-31/2022-01-01·녹지·관리·미지정 격자(P-2·P-3·P-9·P-11 기존 anchor 포함) | E3d-1(또는 E3d-2 — Q-11 결정에 따라 추출 시점) |

### 7.3 구현 후 mutation 계획 (구현 PR이 «정확히 그 anchor만 실패» 확인)

| P | 무력화 | 실패해야 할 anchor |
|---|---|---|
| Y-1 | 뒤집힐 때 `areaProportioning`을 core 값으로 유지(T-1) | Anchor 4 · M15 세액 |
| Y-2 | `applyHousingStateHistory`가 **초과(부분 면적)** 에도 적용(Q-3a (나) 침범) | S1 · Anchor 3 · HG-1~8 |
| Y-3 | 정착면적 0 조기 반환 뒤에서도 이력 적용 | S3 |
| Y-4 | 소비표 게이트 제거 — 별장 REDIRECT 입력에 이력 도달 | P1 |
| Y-5 | 유예를 합집합 대신 산술 가산 | M15c(1,095일이 이중 계상되는 입력) |
| Y-6 | 과거 주택 구간 «모름»(정착면적 빈칸·비양수)을 사업용으로 읽음(혜택) | H3e · B6 · B15 |
| **Y-7** | **`exceeded`를 사업용으로 읽거나 «이력 전체 미반영»으로 바꿈(Q-5 (나) 뒤집기)** — `exceeded`가 «모름»보다 유리해지는 역전 | H3f · B7(B6과 같은 수여야 한다) |
| Y-8 | ⑫ Zod에서 `houseFootprintBefore`(A·B 공용) 삭제(침묵 strip) | route 관통 H3c·H3e·B1·B6 |
| Y-9 | ⑭ `tailHasBuilding`을 `nblOtherHasBuilding` 토글로 되돌림(T-4) | 철거 먼저 입력 · M15 · H3c |
| Y-10 | D-1 차단 제거(마지막 철거 허용) | X1 |
| Y-11 | D-2 차단 제거(주택 카드 `tax_type_changed` 허용) | X2 |
| Y-12 | 이력 없음 경로의 `NBL_STATE_AT_TRANSFER_APPLIED_NOTICE` 제거(`housing-land.ts:73`) | Anchor 2 · 고지 anchor |
| Y-13 | 주택 구간 술어가 `propertyTaxType`을 읽음(조심 2018서0295 반대) | M15 변형 — 주택 구간 구분 모름 · B11 |
| Y-14 | 모드 `""`·`unchanged` 조기 반환 제거 | Anchor 2 |
| Y-15 | echo helper 추출이 기타토지 echo를 바꿈 | E3-1b·E3-② anchor(echo 바이트) |
| Y-16 | ⑭가 주택 구간 철거 행의 `propertyTaxTypeBefore`도 운반(T-5) | B11 |
| Y-17 | `unknownClosers` 필터 제거(T-6) | B1 변형 — 주택 구간 + 모름 고지 |
| Y-18 | ⑫ Zod에서 `buildingKindBefore` 삭제 | route 관통 B1·B3 |
| Y-19 | `buildingKindBefore` 종류 규칙(D-8) 제거 | B9 · B10 |
| Y-20 | 주택 구간 + `tax_type_changed` 허용(D-8) | B9 |
| Y-21 | `buildingKindBefore = house` 행에서 정착면적을 읽지 않고 항상 사업용 | B6 · B7 · B1b |
| Y-22 | `DAYWISE_NO_RULING` 고지 제거(Q-2) | 고지 anchor(A·B 주택 구간 있는 이력) |
| Y-23 | R-3: `subject` 기본값이 바이트를 바꿈 | 기타토지 ⑧↔⑫ parity(기존 문구 anchor) |
| Y-24 | ⑭ `metroRaw` 게이트가 `housePriorNeedsMetropolitan`을 모름(`form-mapper.ts:155` 원형) | Anchor 10 · B1c · B1d |
| Y-25 | ④ 와이어 `metro` 게이트(`non-business-land-request.ts:165`)가 술어를 모름 | Anchor 10(route 관통) |
| Y-26 | `housePriorNeedsMetropolitan`을 `other_land` 전체로 넓힘(소비표 열 개방과 같은 효과 — D-13 위반) | B17 · b1-consumption 단언 |
| Y-27 | 배율 helper를 `judgeHousingLand`와 따로 복제(단일 소스 위반) — 복제본의 수도권 3배를 5배로 | Anchor 12 · B1c |
| Y-28 | 정착면적 비교를 `<`로(경계 200.00 → 초과) | B1 · 경계쌍(200.00/199.99 · 333.34/333.33) |
| Y-29 | 과거 구간 배율을 구간 당시 법령으로(양도일 기준 D-11 반대) | B1d(2021-12-31 vs 2022-01-01) |
| Y-30 | `houseFootprintBefore` 문자열 파싱에서 빈칸을 0으로 읽어 입력 오류 경로로 보냄(T-8) | B6 · B15 |
| Y-31 | 정착 > 토지를 엔진이 «이내»로 읽음(허용 면적 ≥ 토지 면적이라 자동 사업용) 또는 자동 보정 | B15 |
| Y-32 | A 카드 철거 행이 `houseFootprintBefore`를 읽지 않고 3지선다 잔재(`houseWithinLimitBefore`)를 읽음 · 또는 그 칸이 남아 있음(Q-11 (나) 폐기 위반) | A route 관통 H3c·H3e·H3f · `git grep houseWithinLimitBefore` 0건 게이트 |
| Y-33 | ⑧이 정착면적 빈칸 한 경우만 차단(0·음수·정착>토지 누락 — Q-10 (가) 위반) | Anchor 11 격자(UI ⑧) |

### 7.4 PR 분할 (Q-9 결정 — A·B 분리)

| PR | 범위 | 선행 |
|---|---|---|
| **E3d-0** | Anchor 1·2·3·4(skip)·7(현행 단언 유지)·12(현행 `judgeHousingLand` 스냅샷) + 공용 표(A·B 행 · 배율 경계 수치 포함) · **코드 변경 0** | 즉시 착수 가능 |
| **E3d-1 (A)** | 타입 · leaf 확장(`StateTail.buildingKind` · `resolveHouseInterval` · `eventClosesHouseInterval` · `housingStateEventIssue` · 술어 · `StateEventSubject`/R-3) · `housing-state-history.ts` · echo helper 추출 · `judgeHousingLand` 호출 2줄 · 소비표 · 고지(§4.5 A분 · R-6) · ⑫ 중첩 칸 + ⑫′ 주택 규칙 · ⑭ 주택 분기 · 구 이력 복원 기본값 · Anchor 5(A)·6(A)·7 활성. **`housing-limit.ts` 추출이 여기에 들어온다**(A 과거 주택 구간도 정착면적으로 판정 — Q-11 (나) · Anchor 12 활성). A 철거 행 ⑧ 정착면적 차단(Q-10 (가))도 이 PR. **한 PR로 판정까지 연결**(⑫가 칸을 받으면 즉시 도달) | E3d-0 |
| **E3d-2 (B)** | `buildingKindBefore`·`houseFootprintBefore` 칸 · leaf(`houseKindEventIssue` · `housePriorNeedsMetropolitan` · `houseFootprintIssue` · 철거 행 종류·판정) · ⑫ + ⑫′ 구조 규칙(D-8) · ⑭ 운반 + **`metroRaw` 게이트 조건부 개방** · ④ 와이어 게이트(UI와 같은 술어) · 기타토지 apply(`unknownClosers` 필터 · 주택 구간 고지 · ctx) · B 고지 · Anchor 5(B)·6(B)·8·9·10·11 활성 | E3d-1 · Q-12 결정 완료 |
| (UI) | UI 계획서 PR — A·B 각각 E3d-1·E3d-2 뒤(UI UQ-10과 합침). **Q-11 (나) 결정으로 UQ-11(철거 행 «배율 이내 여부» 3지선다)이 «정착면적 입력(㎡)»으로 대체된다 — UI 계획서 갱신 필요** | E3d-1/2 |
| E2E | UI 계획서 소관(M15 · H3c · S1 / B1 · B1b · B3 · B7 · B16) | UI |

**분리 이유(Q-9)**: ① A는 새 지목 진입(소비표·신규 apply·`judgeHousingLand` 호출·T-1)이고 B는 기존 apply의 술어·고지 확장 + **새 입구 2개(정착면적 칸 · 조건부 수도권 게이트)** 라 회귀 표면이 다르다(A = P-2~P-4가 얇은 영역 · B = P-6~P-9·P-11은 두텁고 P-10·P-12는 얇다) ② `houseOutcome`·`buildingKind`·`resolveHouseInterval`은 E3d-1이 도입하고 B가 재사용한다 ③ B는 Q-10 확정을 기다리는 동안 A를 막지 않는다 ④ ⑫ 중첩 칸 strip 위험을 PR마다 route anchor로 닫는다.

### 7.5 위험

| 위험 | 내용 | 완화 |
|---|---|---|
| 세액 방향 | A는 거의 비사업용 쪽(M15·H3c·H8·H9 +) · B는 과대 해소(B1·B3 −)다. 이력은 사용자가 입력할 때만 발동 | 이력을 넣을 때만 발동(하위호환) · 결과에 구간표(+ B는 허용 면적 echo) · **법 근거(법 §104의3①각 호 외의 부분 · 영 §168의6)** 를 고지에 명시. **납세자 유리/불리 표현 금지**(CLAUDE.md) |
| 직접 해석례 부재 | 신축 앞 나대지 기간을 4호 기간으로 세는 직접 회신 0건(V-1) | Q-2 (가) 결정 · **`DAYWISE_NO_RULING` 고지** · Y-22 |
| **B 절벽** | 정착면적 0.05㎡(199.99 vs 200.00) 차이가 주택 구간 전체를 사업용 ↔ 비사업용으로 가른다(Q-5 (나) 접기 — 이내분까지 비사업용) | 고지 `HOUSE_EXCEEDED_NOTICE`가 허용 면적·초과 면적을 echo · B1b·B1c anchor가 경계를 고정 · 면적 × 기간(부분 면적)은 후속(V-16) |
| B 입력 신뢰 | 철거된 주택의 정착면적·취득 면적·분할 이력은 사용자 입력(증빙 = 건축물대장 말소본·토지대장) — 거짓 정착면적이면 사업용을 과다 인정 | `within`만 사업용 · 빈칸·초과 접힘(역전 없음 — Y-7) · `HOUSE_BEFORE_NOTICE`(V-2 · V-19) |
| **수도권 게이트 침묵** | other_land에서 수도권 값이 ④·⑭에서 버려지면 보수적 3배 기본값으로 계산된다(T-7) | 술어 단일 소스 · Anchor 10 · Y-24·Y-25 |
| T-1 | 뒤집힘 + `areaProportioning` 유지 → ratio 0 → **판정 비사업용·세액 사업용**(침묵 과소) | Anchor 4 · Y-1 |
| 소비표 열림의 파급 | `consumesStateHistory`가 주택에도 true가 되면 ④⑤⑧⑫⑭와 UI의 기타토지 전용 가정이 주택 카드에서 오동작할 수 있다 | `consumesHousingStateHistory` 별도 술어 + D-1 + Y-9 · UI가 술어를 기타토지 전용으로 고정(A-1) |
| 800줄 | `other-land-state-history.ts` 403 → ≈500(넘으면 `house-state-history.ts` 분리) · `housing-land.ts` ≈175 · 신규 파일 3개 | 전부 ≤ 700 · 기존 큰 파일(`other-land.ts` 665 · `types.ts` 675)은 건드리지 않는다 |
| 재제안 금지 침범 | V5-G2 · Q-8 (가) 겸용 상가분 · 주택 배율 초과분 방침(Q-3a (나)) · 과세기준일 접기 · 자동 안분 fallback | 이 계획은 전부 건드리지 않는다(§9) |

---

## 8. 사용자 결정 Q-n · 미검증 V-n

### 8.1 Q-n (결정 레지스터)

| # | 질문 | 선택지 | 추천(당시) | **사용자 결정** · 근거 |
|---|---|---|---|---|
| **Q-1** | 범위 | (가) 주택부수토지 카드만(A) · B는 후속 / **(나) A + B 두 경로 모두** / (다) B만 | (가) | **(나) 결정 — 사용자 결정 2026-11-23** — A(주택부수토지 카드) + B(주택 철거 후 나대지 양도 — 기타토지 카드). B 설계는 §3.4 |
| **Q-2** | 법적 읽기 — 신축 앞 나대지(4호)와 주택(이내 = 사업용)을 일 단위 합산해 영 §168의6 한 번 | **(가)** 합산 / (나) 현행 유지 | (가) | **(가) 결정 — 사용자 결정 2026-11-23** — 직접 해석례 0건(V-1)이라 **결과 고지에 «직접 해석례 없음 — 확인 필요» 상수**(`NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE` — §4.5 · Y-22) |
| Q-3 | 신축 앞 나대지 구간에 E3-1b 선언(구분·근거·면적한도) 재사용 | **(가)** 받는다 / (나) 종합합산 고정 | (가) | **(가) 결정 — 2026-11-23** |
| Q-4 | A 과거 주택 구간의 배율 이내 여부 | **(가)** 철거 행 `houseWithinLimitBefore`(3지선다) / (나) 이내 전제 + 고지 | (가) | **(가) 결정 — 2026-11-23** → **2026-11-24 Q-11 (나)로 대체됨**(`houseFootprintBefore` 정착면적 입력 · `houseWithinLimitBefore` 폐기 · UI UQ-11 대체) |
| **Q-5** | `exceeded` 처리(모름 = 접힘 고정) | (가) 이력 전체 미반영 + `PARTIAL_AREA` 고지 / **(나)** 그 구간 비사업용 접기 + 고지 | (가) | **(나) 결정 — 사용자 결정 2026-11-23** — (가)는 «초과» 선언이 «모름»(접힘 = 비사업용)보다 유리해지는 **역전**(E3-1b가 같은 이유로 기각한 구조). 고지: «배율 이내분까지 비사업용으로 보았음 — 부분 면적 확인 필요». **Q-7 (나)에서는 «초과»가 선언이 아니라 엔진 계산 결과**이고 같은 접힘이다. 적용 범위는 **과거 구간**(양도일 현재 초과 경로 = Q-3a (나)는 무변경 — §3.5) |
| Q-6 | 질문 필수 여부(주택부수토지 카드) | 필수(⑧만) / 선택 | UI와 합침 | **필수(⑧만) 결정 — 2026-11-23** — ⑫·엔진은 `""`·미전송 = 현행(400 아님). UI UQ-1~UQ-11 추천안 전부 승인 |
| **Q-7** | **B의 «철거된 건축물 = 주택» 입력 방식 — 철거 전 배율 이내 판정 근거** | (가) 종류 + 3지선다(정착면적·수도권 안 받음) / **(나) 종류 + 철거 전 정착면적(행별) + 카드 단위 수도권 여부 → 엔진 판정** / (다) 3지선다만 | (가) | **(나) 결정 — 사용자 결정 2026-11-24**(v2 추천 (가)가 아님). 설계 §3.4 · D-7 · D-11~D-15. 비용: 기타토지 카드 정착면적 칸·조건부 수도권 칸·⑧ 규칙·복원 기본값. 이득: 재계산 가능한 근거 echo |
| **Q-8** | `exceeded` 구간 뒤 **철거 후 9호 유예**(부동산거래관리과-0792) | **(가)** 유예 유지 + `HOUSE_EXCEEDED_GRACE_NOTICE` / (나) 앵커된 9호 제외 + 고지 | (가) | **(가) 결정 — 사용자 결정 2026-11-24** |
| **Q-9** | PR 분할 | **분리**(E3d-1 A · E3d-2 B) / 한 PR | 분리 | **분리 결정 — 사용자 결정 2026-11-24**(E3d-0 → E3d-1 A → E3d-2 B) |
| **Q-10** | 철거 행 **정착면적 빈칸 · 0 · 음수/비수치 · 토지 면적 초과** 처리(모름 = 혜택 불성립 · 자동 안분 금지) | **(가) 전부 ⑧ 필수 차단**(housing E1-03 `transfer-tax-validate-nbl.ts:208-216` 정합) / (나) 빈칸 = «모름» 접힘 · 나머지 ⑧ 차단 / (다) 전부 접힘 | (나) | **(가) 결정 — 사용자 결정 2026-11-24**(v3 추천 (나)가 아님). **A·B 공통**(Q-11 (나)). 직접 API(⑫·엔진)는 기존 정책대로 **400 없이 `unconfirmed` 접힘** 유지 — 정착면적 > 토지 면적도 접힘(D-16). 탈출구: 이력 질문 «모름»(`unknown`, D-17) |
| **Q-11** | **A의 과거 주택 구간(철거 행)도 같은 정착면적 입력으로 통일**할지 | (가) A는 3지선다 유지(A·B가 갈라짐) / **(나) A도 `houseFootprintBefore`로 통일(`houseWithinLimitBefore` 폐기)** / (다) 둘 다 받음 | (나) | **(나) 결정 — 사용자 결정 2026-11-24**. **Q-4 (가)·UI UQ-11은 이 결정으로 대체됨**. A·B가 같은 leaf `resolveHouseInterval`·`houseFootprintIssue`(⑧)·⑫ 칸·mutation·케이스 표(H 계열 철거 행)를 쓴다. A의 정착면적 오입력도 Q-10 (가)와 같이 ⑧ 차단 |
| **Q-12** | 정착면적을 모를 때 «건축물 종류 = 그 밖(`""`)»으로 ⑧을 **우회**하는 경로를 막을지 — 실측(§2.2 · B19): 혜택은 **허위 비종합합산 구분 선언일 때만**(모름·종합합산은 N) · E3-① 기존 경로 | **(가) 현행 유지 + 안내·고지 강화** / (나) 종류 3지선다 «주택/그 밖/모름» + 철거 행 종류 ⑧ 필수 / (다) 비종합합산 구분 선언에 «주택 아님» 확인 체크 | (가) | **(가) 결정 — 사용자 결정 2026-11-24** — `""` = 주택 아닌 건축물(바이트 동일 유지) · `NBL_STATE_HISTORY_BUILDING_KIND_HINT_NOTICE` 신설(철거 행 종류 hint · 종류 `""` + 비종합합산 선언 이력 적용 결과 고지). (나)(다)는 기존 입력·픽스처를 깨고 의도적 허위를 못 막아 채택하지 않음 |

착수 가능성: **E3d-0 즉시** · **E3d-1(A) 즉시**(Q-11 (나) 결정) · **E3d-2(B)도 즉시**(Q-12 (가) 결정 — 착수 게이트 **결정 완료**). Q-1~Q-12 모두 결정됐다.

### 8.2 V-n (착수 차단 여부)

| # | 항목 | 상태 | 차단 |
|---|---|---|---|
| **V-1** | **신축 앞 나대지 기간을 4호 비사업용 기간으로 세는 직접 규정·해석례 부재** — 서면4팀-2211(지목 변경 합산)은 유추. 국세청 4조합 검색 0건 · 조세심판 검색 0건(조심 2018서0295는 주택 기간별 판단 사례일 뿐 신축 앞 나대지는 다루지 않음) | ✅ **Q-2 (가)로 사용자가 해석 선택을 결정**(2026-11-23) — **미해소 사실은 고지로 남긴다**(`DAYWISE_NO_RULING_NOTICE`) | 해당 없음(결정됨) |
| V-2 | 과거 주택 구간의 **정착면적은 사용자 입력**(A·B 공통 — Q-11 (나))이고 **토지 면적은 카드의 취득 면적**을 쓴다 — 철거 당시 토지 면적·정착면적의 증빙은 건축물대장 말소본·토지대장 등 사용자 몫 | ⏳ 고지(`HOUSE_BEFORE_NOTICE`) | 비차단 |
| V-3 | «신축» 날짜의 법령상 의미(사용승인일 vs 건축물로 보는 첫날) | ✅ UV-3 라벨 재사용(단정 문구 없음) | 비차단 |
| V-4 | **무허가·사용승인 없는 주택의 철거 유예**(서면4팀-3290·5팀-2323 2007 «무허가주택은 적용되지 아니함») — 현행 규칙 본문에 허가 요건 문언이 없다. 9호 유예 행은 사용자 입력이라 이 계획은 안내만 | ⏳ 확인 필요(현행 회신 미확인) | 비차단 |
| V-5 | 과거 주택 구간의 **배율을 양도일 법령으로** 판정한다는 전제(영 §168의12 수도권 3·5배 · 2022.1.1.) | ✅ **법령 구조로 해소(2026-11-24)** — 영 부칙(제30395호, 2020.2.11.) 제1조 3호 · 제2조② · **제39조**(본문 확인): «2022.1.1. 전에 양도한 자산에 대해서는 종전의 규정» → **양도일 기준**(D-11). 구간 당시 법령을 쓰라는 규정은 열람 본문에 없다. **잔여**: 이를 직접 확인한 해석례는 찾지 못했다 — 양도일 2022.1.1. 이후·철거 이전·수도권 주·상·공이면 당시 5배가 아닌 현행 3배가 적용된다(고지) | 해당 없음(잔여는 고지) |
| V-6 | `isMetropolitanArea` 미입력 → 수도권(3배) 보수 처리 → 초과 → 부분 면적 → **A 이력 미반영**: 사용자가 수도권 여부를 고쳐야 이력이 반영된다(고지에 이유 포함) | ⏳ UI 도움말 | 비차단 |
| V-7 | 규칙 §83의5①9호 5년(2025.3.21. 개정 · 부칙 제4조 «양도하는 경우부터») — 구현은 `demolitionGraceYears`(양도일 연혁). 해석례의 «2년»은 개정 전 값 | ✅ 기존 구현 — 인용만 | 해당 없음 |
| V-8 | 철거 전 **초과분**의 철거 후 유예 부인(부동산거래관리과-0792) — **Q-5 (나) 접기 + Q-8 (가) 결정(유예 유지 + 고지)** 으로 처리(면적별 부인은 지원하지 않음) | ✅ 결정됨 · 면적별 판정은 후속(부분 면적) | 비차단 |
| V-9 | 주택 **자산** 양도(`appurtenant-excess-deeming.ts`)에서 신축 앞 나대지 기간이 이내분에 영향을 주는지 — 이 계획은 건드리지 않는다(D-6) | ⏳ 별건 확인 필요 | 비차단 |
| V-10 | 정착면적 0 + `changed`의 ⑧ 차단 여부 — 현행 ⑧이 `housing_site`에서 정착면적 필수를 요구하는지(`transfer-tax-validate-nbl.ts:206-216`로 UI 계획서가 확인) — 엔진은 이력을 쓰지 않는다(S3) | ✅ UI 계획서 확인 | 비차단 |
| V-11 | 소비표를 열면 기타토지 전용 UI 술어가 주택 카드에서 어떻게 읽히는지 | ✅ UI가 술어를 기타토지 전용으로 고정(A-1) | 비차단 |
| V-12 | DB 실세율 금액 · 브라우저 · E2E · `npm run verify:legal` | **전부 미수행**(계획 단계 · 새 조문 인용 없음) | 비차단 |
| V-13 | `__tests__/components`·`e2e/`·`__tests__/lib/stores`의 `housing_site` 입력 픽스처가 `stateHistory` 열 변경에 반응하는지 — 이번 실측 범위 밖 | ⏳ E3d-1 범위 실행(UI 계획서 §10: 필수 질문 모델이면 ⑧ 경유 housing 테스트 6파일 12참조 후보) | 비차단 |
| V-14 | 법 §104의3①4호(농지·임야·목장용지 외의 토지)는 주택부속토지를 **명시 제외하는 문언이 없다** — 이내분이 비사업용이 아니라는 결론은 해석례(부동산거래관리과-1273 · 조심 2018서0295)와 5호의 구조(배율 초과분만 열거)에 기댄다. 현행 코드도 같은 결론이라 새 위험은 아니나 인용 시 «해석례»임을 밝힌다 | ✅ 현행 코드와 일관 · 인용 표기만 | 해당 없음 |
| V-15 | B의 빈도(주택 철거 후 토지 양도)는 측정하지 않았다 — Q-1 (나) 결정의 근거는 법 구조와 현행 과대·위장 실측이다 | ⏳ 확인 필요 | 비차단 |
| V-16 | Q-5 (나) 접기는 법 문언상 이내분까지 비사업용으로 보는 **과대 근사**다 — 고지로 알리고 면적 × 기간(부분 면적)은 후속이다. 후속 부분 면적을 열려면 Q-3a (나) 경계를 다시 물어야 한다(이 계획은 제안하지 않는다) | ⏳ 고지 | 비차단 |
| V-17 | 겸용주택(주택 + 상가 1동) 철거를 B에서 «주택»으로 고를 수 있는지 — D-5에 따라 안내만 하고 판정하지 않는다. 겸용 부수토지 안분은 Q-8 (가) 재제안 금지 경계 | ⏳ UI 안내 문구 | 비차단 |
| V-18 | **수용(영 §168의12 후단)** — 수용 양도의 배율 용도지역은 사업인정 고시일 전날 용도지역이다. 카드 `nblZoneType`은 현재 값이라 주택 구간(A·B)에서도 `expropriationZoneBaseDateNotice`로 고지만 한다 | ⏳ 고지(새 판정 규칙 없음) | 비차단 |
| V-19 | **토지 면적 = 카드 `acquisitionArea`(취득 면적)** — 철거 당시 면적과 같다고 가정(분할·합필 시 어긋남). 축 B 지분 카드의 `acquisitionArea`가 지분 면적인지·전체 면적인지 미확인(`buildFractionalShareNblRecord`가 primary를 스프레드) | ⏳ 확인 필요(B13 행) · 새 «철거 당시 토지 면적» 칸은 만들지 않음(D-15) | 비차단 |
| V-20 | `undesignated`(미지정)·`unplanned`의 배율: `isUrbanForHousing`이 `undesignated`를 도시지역 밖(10배)으로 읽는다 — 기존 주택부수토지와 같은 처리(단일 소스 재사용). 사용자가 실제 도시지역을 «미지정»으로 고르면 과다 인정 | ⏳ 기존 동작 — 변경하지 않음 | 비차단 |
| V-21 | Q-5 (나) 절벽(정착면적 0.05㎡ 차이가 구간 전체를 가름)의 법 문언 대비 과대 근사 — V-16과 같은 항목의 B 수치 입력판 | ⏳ 고지(허용·초과 면적 echo) | 비차단 |
| V-22 | `housePriorNeedsMetropolitan`의 조건(주·상·공만 수도권이 배율을 가름)이 `getHousingMultiplier` 표 변경(향후 영 개정) 시 어긋날 수 있다 | ⏳ 술어를 `getHousingMultiplier` 두 호출(수도권 yes/no 값이 다른가)로 **파생**해 표와 자동 일치시키는 안을 E3d-2에서 확인 | 비차단 |
| V-23 | **종류 `""` 우회 + 허위 비종합합산 구분 선언**(B19 · Q-12)은 현행 E3-① 경로 그대로 열려 있다 — 엔진이 주택 여부를 알 수 없다 | ✅ Q-12 (가) 결정(2026-11-24): 안내·고지만(새 차단 없음) | 비차단 |
| V-24 | 정착면적 > 토지 면적을 ⑧이 차단하면 **분할로 토지 면적이 줄어든 정당한 입력**(철거 당시 대지가 더 컸음)도 막힌다 — 탈출구는 이력 질문 «모름»(D-17)이고 «철거 당시 토지 면적» 칸은 만들지 않았다(D-15) | ⏳ 안내 문구 | 비차단 |

---

## 9. 재제안 금지·기결정 준수 확인

- ⛔ **V5-G2** · ⛔ **Q-8 (가) 겸용 상가분 부수토지** — 건드리지 않는다(D-5 · V-17). 겸용주택은 범위 밖(A·B 모두).
- ⛔ **주택 배율 초과분 방침 Q-3a (나)(2026-11-19)** — 양도일 현재 초과 경로는 코드 한 줄도 바꾸지 않고 `PARTIAL_AREA` 고지만 `changed`일 때 더한다(Anchor 3 · Y-2). B는 `judgeHousingLand`를 호출하지 않고 **순수 helper(`housing-limit.ts`)만 공유**한다(helper 추출은 바이트 동일 이동 — Anchor 12). 과거 구간의 «초과» 접기(Q-5 (나))는 그 방침의 대상이 아니다(§3.5). 이 계획은 초과분 방침을 **변경하자고 제안하지 않는다**.
- ⛔ **과세기준일(6.1.) 단위 접기** — 일 단위(V-1 v3). 6.1. 이웃 쌍 anchor(G1·G2)를 주택 표에도 둔다.
- ⛔ **자동 안분 fallback 금지** — 부분 면적 × 기간은 지원하지 않는다(S1 · Q-5 (나) 접기 · V-16·V-21). 빈 구간·빈 정착면적·미선언은 엔진이 채우지 않는다(모름 → 접힘 + 확인 필요 · Y-30·Y-31). 수도권 미제공의 «보수적 기본값»은 기존 housing 정책의 재사용이며 B에서는 ⑧이 UI 경로를 차단한다.
- 「모름 = 혜택 불성립 + 확인 필요」 · 「법 근거 없이 불리 적용 금지」: Q-2 · Q-5 · Q-8 · Q-10 · Q-12에서 점검(Q-12 (가) 결정). 이력 미입력 = 현행.
- 기존 E3 계획 결정(E3-① Q-8 «철거 → 9호 유예 자동 생성 안 함» · 통합 Q-10)을 그대로 따른다 — 주택 철거·신축 공사 기간의 유예 행은 사용자가 입력한다.

---

## 10. 자가 검토

| # | 구분 | 발견 | 처리 |
|---|---|---|---|
| 1 | 오류 방지 | **T-1** — 이내 core를 비사업용으로 뒤집을 때 `areaProportioning`(ratio 0)을 유지하면 판정 비사업용 · 세액 198,210,000(B) | 실측(격리 사본에서 이내 분기 `isBusiness=false`만 바꿔 ratio 0 · 세액 B 확인) → §4.2 4 · Anchor 4 · Y-1 |
| 2 | 누락 | 주택부수토지 카드에는 `nblOtherHasBuilding` 토글이 없어 `tailHasBuilding`이 항상 false → 철거 먼저 입력 시 초기 주택 구간 판정이 틀림 | T-4 · Y-9 |
| 3 | 모순 | 사용자 지시문은 M15 «기대 사업용 198,210,000 `not_judged`»로 읽히나 그것은 **현행 실측**이고 계획 기대는 비사업용 253,960,000 | §2.1에서 분리 표기 |
| 4 | 정합(v2) | v1 Anchor 7은 `gates.anchor.test.ts`를 반전시키자고 적었으나 UI가 술어를 기타토지 전용으로 고정하면 불변 | `leaf.test.ts:511-513`만 반전 + `leaf-unreachable.test.ts:95-107` 갱신(§7.2 Anchor 7) |
| 5 | 함정 | `exceeded`를 «이력 전체 미반영»으로 두면 «초과»가 «모름»보다 유리 | Q-5 (나) 접기 — B6·B7이 같은 수(Y-7) |
| 6 | **누락(v3)** | **수도권 값이 other_land에서 3군데(④ `:165` · ⑭ `:155` · ⑧ `:199`)의 `consumesMetropolitanArea` 게이트에 막힌다** — 소비표를 통째로 열면 기타토지 전 입력이 막다른 길, 안 열면 B 값이 침묵으로 버려진다 | D-13 조건부 술어 단일 소스 · T-7 · Anchor 10 · P-10·P-12 실측(안전망 3·5건으로 얇음) |
| 7 | **누락(v3)** | 배율 판정을 새로 구현하면 `judgeHousingLand`와 갈라진다(수도권 3배·양도일 경과·`areaTimes` 정수 연산) | D-12 `housing-limit.ts` 추출(바이트 동일 이동) · P-9·P-11이 표·경계를 이미 두텁게 지킴 · Anchor 12 |
| 8 | **조사(v3)** | 배율 연혁: 영 §168의12는 2010~2021 «도시 5/밖 10»이고 2022.1.1.부터 3/5/5. 과거 구간에 구간 당시 법령을 쓸 근거는 부칙에 없고 양도일 기준 근거(제39조)는 있다 | D-11 · V-5 해소(잔여: 직접 해석례 미확인) |
| 9 | 한계 | 기대 열이 오라클(미구현)이다. B 이내 행은 **위장 실측**(현행 엔진 값)이 보강하고 배율 경계는 직접 호출 실측이다 | 머리말 명시 · Anchor 8 |
| 10 | 한계 | 직접 해석례 부재(V-1) | Q-2 (가) 결정 + 고지 상수 |
| 11 | **조사(v4)** | Q-10 (가)로 B의 정착면적 필수 차단이 생기면 «모름» 사용자가 종류 `""`로 우회할 수 있다 — 그 우회가 혜택인지 | **실측(현행 엔진, 철거 2021-01-01)**: 구분 모름·종합합산 → N 253,960,000 · 비과세·면제·분리과세·별도합산 → B 198,210,000 — 이득은 허위 비종합합산 선언뿐(E3-① 기존 경로) → Q-12 · B19 · D-17 |
| 12 | 검증 | file:line을 직접 읽은 파일로 대조(`housing-land.ts` 35·48·73·74-81·84-101·111·143·174 · `urban-area.ts` 79-132 · `area-limit.ts` 52·96-101 · `engine.ts` 84·162·169·385 · `land-category.ts` 120·143·153 · `form-mapper.ts` 82·155·174·214 · `form-mapper-helpers.ts` 310·322 · `non-business-land-request.ts` 165 · `transfer-tax-validate-nbl.ts` 114-115·199-216 · refines 108 · leaf 83·296·353·366·392 · `other-land-state-history-apply.ts` 160 · `leaf.test.ts:508-513` · `leaf-unreachable.test.ts:95-107` · `gates.anchor.test.ts:36-38`) | ✅ |

**Verdict: 승인 가능(PASS-with-conditions)** — 모델(A 후처리 1개 · B는 술어 확장 + 정착면적 판정)·leaf 재사용·`housing-limit.ts` 단일 소스·T-1/T-6/T-7 방지는 법령 본문(영 §168의12 연혁·부칙 제39조)과 현행 코드·실측으로 일관된다. **E3d-0 · E3d-1(A) · E3d-2(B) 모두 즉시 착수 가능**(Q-1~Q-12 결정 완료). 비차단 V는 anchor·고지·UI 도움말로 처리한다. 코드·커밋·push 0.

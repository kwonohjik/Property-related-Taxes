# 비사업용 토지 상태 이력 E3-⑤ 「철거 후 재산세 한시 지위(지방세법 시행령 §103의2)」 — 화면·클라이언트(①~⑧) 계획서

> 상태: **Plan v2 (2026-11-24 — 코드 변경 0 · 사용자 결정 반영 · 엔진 계획서 v4(450줄 — Q-11 (나) · UQ-8 (가) 일관 게이트 · Q-12 (가) · D-2~D-6 수용) 정합 완료)** — v1(UI 시니어 초안: 현행 실측 + 모델 M0~M3 대비)에 2026-11-24 사용자 결정(엔진 Q-1 (다) · Q-2 (가) · Q-3 · Q-4 (가) · Q-5 ⑧·⑫ 모두 필수 · Q-6 (가) · Q-7 4칸 분리 · Q-8 (나) · Q-9 · Q-10 + UI UQ-2·3·5·6·7 승인)을 반영해 **단계별(E3f-1a / 1b / 2) 화면 설계로 다시 썼다.** 엔진 v4를 읽고 §3·§4.3·§5·§7·§9·§12·§16을 맞췄다 — **§16.2 D-1~D-6은 v4에서 해소(✅)**, 남은 차이는 §16.2 말미.
> 범위: 통합 계획서 E3 후속 목록 ⑤(`nbl-other-land-state-history.plan.md:81`) · UI 통합 계획서 UV-11(`nbl-other-land-state-history.ui.plan.md:499`). 엔진 정본: `nbl-state-history-e3-5-demolition-temp-status.engine.plan.md`(**이 문서는 엔진 결정을 새로 짓지 않는다** — 엔진 leaf·필드·상수명은 그쪽이 정본이고 이 문서가 «요청»이라 쓴 것은 엔진에 요구하는 인터페이스다).
> **범위 밖(재제안 금지)**: 과세기준일(6.1.) 단위 «접기»(사용자 기각 — 대안으로도 올리지 않는다 · 엔진 Q-4 «존재 검사»·꼬리 «충분조건»은 상태 구간을 접지 않는 요건 검사로 사용자가 결정했다) · V5-G2 · Q-8 (가)(겸용 상가분 — 엔진 Q-8과 이름만 같다) · Q-3a (나) 변경 · 자동 안분 fallback · `useEffect → store` 미러링 · native checkbox/radio/date · placeholder 숫자 예시 · 13호(E3-④)·업종(E3-②)·주택부수토지(E3-③) 판정 변경.
> 정본: `nbl-state-history-e3-1b-bare-land-tax-type.{engine,ui}.plan.md` · `nbl-state-history-e3-3-house-appurtenant.{engine,ui}.plan.md` · `nbl-state-history-e3-4-ho13-bare-land.ui.plan.md`(⑧ 게이트 = 엔진이 읽을 때만 — 선례).
> 모든 file:line = 워크트리 `Property-related-Taxes-nbl-e3-5-plan`(master fb35f6bc7) grep·Read 실측. **동작 주장은 §1.2 probe 표(엔진 직접 23종 + 렌더 3종 — 파일은 삭제함)와 엔진 계획서 §3·§7 오라클에만 근거를 둔다. 정독만으로 쓴 곳은 «정독», 미실측은 «확인 필요».** 법령 본문(지방세법 시행령 §103의2 MST 290815 · 소득세법 시행규칙 §83의5①9호 MST 286379)은 이 세션에서 직접 조회했고 연혁 6건은 엔진 계획서 §1.2가 열람 기록이다.

---

## 0. 한눈에

### 0.1 사용자 결정과 화면 반영

| 결정 | 내용 | 이 문서의 반영 |
|---|---|---|
| 엔진 Q-1 **(다)** | 나대지 구간 선언(E3-1b)에 근거 «철거ㆍ멸실» + 사실 칸 — **철거 행 뒤 나대지 구간에서만**(`eventOffersDemolished`) | §4.3 · E3f-2. E3-1b의 «`demolished` 제외 + 유예로 입력» 안내(`OtherLandBareIntervalFields.tsx:113` · `NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE`)는 **번복** — 안전망 7파일 단언 의도된 반전(엔진 Q-10) |
| 엔진 Q-2 (가) | 고지 연혁화(2026.6.1. 전 6개월 · 빈집 3년 2024.6.1.~) + 빈집 셀 고지 + 상수 항 번호 정정 | §4.1 E3f-1a — UI는 **엔진 상수·함수만 읽는다**(문구를 UI가 짓지 않는다) |
| 엔진 Q-3 | 철거일을 알면 한도 적용 — 꼬리 철거일 = 이력 마지막 철거 행, **없을 때만** 새 칸 `nblOtherDemolishedOn` · 한시가 확실히 지났으면 엔진이 `unconfirmed`로 접음 | §4.2 E3f-1b · UQ-5 (가)와 같다(v1의 `nblOtherDemolishedDate`는 엔진 이름 `nblOtherDemolishedOn`으로 정정) |
| 엔진 Q-4 (가) | 창 안 과세기준일 «존재 검사»(창은 일 단위) | UI는 판정하지 않는다 — 접힘 사유 문구만 표시(§4.4) |
| 엔진 Q-5 | **⑧·⑫ 모두 필수** — `demolished` 근거 선택 시 철거일·철거 전 바닥면적(·시행본별 사실 칸) 빈칸은 ⑧ 차단 + ⑫ 400. ⑧과 ⑫는 **같은 술어**(«철거 행이 날짜를 대면 칸 불요» 포함). 구 저장 세션은 ⑧이 칸을 요구·안내(③이 채우지 않음). 엔진 v3는 «수치·날짜만 필수»로 해석해 Q-11을 열어 뒀으나 **사용자 결정 2026-11-24로 UQ-11 (나) 확정 — 3지선다 미선택도 ⑧ 차단 + ⑫ 400(명시 «모름»은 허용)**. UQ-8 (가): 바닥면적은 엔진이 읽을 때만 | §7 parity 격자 (v4: «엔진이 읽을 때만» 게이트 — 꼬리 철거일은 구조 술어만) |
| 엔진 Q-6 (가) | 꼬리는 충분조건 접기만(사실 칸 없음 — 철거일 + 기존 바닥면적) | §4.2 |
| 엔진 Q-7 | 사실 칸 4개 분리 — 허가·사용승인(≥2019-06-01) · 건축 외 용도(≥2024-06-01) · 빈집정비(주택 철거 행 ∧ ≥2024-06-01) · 철거 전 바닥면적(비주택 건축물 행) — 각 칸은 해당 시행본에서만 노출 | §4.3 위젯 4개 |
| 엔진 Q-8 **(나)** | 일반 주택 철거 뒤 구간도 인정(일반 기간, 빈집정비 «예»면 3년) | §4.3 — 주택 철거 행 뒤에는 바닥면적 칸이 없고 빈집정비 칸은 «예» 아니면 일반 기간 |
| 엔진 Q-9 | 배율 초과 = 구간 전체 접기 + 고지(안분 없음) | §4.4 표시만 |
| 엔진 Q-10 | PR E3f-0 → E3f-1a → E3f-1b → E3f-2, 엔진 PR마다 UI PR | §14 |
| UI UQ-2·3·6·7 | 승인 — 9호 부재 시 철거 행 카드 안 조건부 amber 안내 · 꼬리 근거 hint 정정 · «바뀐 적 없음» + 철거 근거는 막지 않고 안내만 · PR 분할 | §4.1 · §7 |
| UI UQ-4 | **Q-1 (다)·Q-7로 대체** — 사실 칸을 받는다 | §4.3 |
| 엔진 Q-11 **(나)** · UQ-8 **(가)** · Q-12 **(가)** (사용자 결정 2026-11-24 추가) | 3지선다 사실 칸 미선택도 ⑧ 차단 + ⑫ 400(명시 «모름» 허용) · **사실 칸 4개 전부 «엔진이 읽을 때만» 노출·요구**(의제 ∨ core 부분 면적이면 칸을 그리지 않고 요구하지 않음) · **주택부수토지 카드도 연다**(사실 3칸 — 바닥면적 칸 없음) | §4.3 · §7.2 · §9 X-5·6·10 · §11 E5-8 |

### 0.2 문제와 실측 한 줄 (v1 유지 — §1.2)

- 같은 사실(«철거 후 1년 별도합산»)을 화면 두 곳이 **반대로** 말한다: 꼬리 근거 라디오는 «철거ㆍ멸실»을 받고(`OtherLandPropertyTaxBasisField.tsx:35·:50`) 사건 행 나대지 구간 근거는 받지 않는다(`OtherLandBareIntervalFields.tsx:113`). 꼬리 근거는 **시간 한도가 없다** — 2018-01-01 철거·2024-01-01 양도(철거 후 6년)에서 근거만 고르면 꼬리 2,191일이 전부 사업용 198,210,000(S18), 근거 없이 9호 유예 2년만이면 비사업용 253,960,000(S20) — 스윙 55,750,000. 철거 행만 넣고 9호를 빠뜨리면 같은 거래가 246,680,000 ↔ 192,330,000(S23 vs S22, 2025-06-01 양도).
- 효과가 나는 지점은 엔진 계획서 §3.6이 정리했다: 나대지 구간 근거(Q-1)는 **9호 미입력자의 구간 인정 + 빈집 3년 셀**, 꼬리 한도(Q-3)는 **확실히 지난 모순 입력의 과다 인정 해소**.

### 0.3 단계별 UI 한눈에

| 단계 | UI 내용 | 새 입력 | ⑧ 규칙 | 엔진 선행 |
|---|---|---|---|---|
| **E3f-1a** UI-N | N-1 꼬리 근거 hint 정정(연혁화 문구) · N-2 철거 행 + 9호 부재 조건부 안내 · N-3 두 칸 모순 문구 정합(임시 문구) | 0 | 0 | 고지 연혁화 상수(입력 0 · 세액 불변) |
| **E3f-1b** UI-T | 꼬리 «철거일» — 철거 행이 날짜를 대면 읽기 전용 한 줄, 아니면 DateInput 1칸 + 한도 경과 안내 줄 | 1(`nblOtherDemolishedOn`) | DD-T1·T2 | leaf + 꼬리 한도 + 새 칸 ⑫⑭ |
| **E3f-2** UI-B | 나대지 구간 근거 «철거ㆍ멸실»(철거 행 뒤 구간만) + 사실 칸 4개(게이트) + 인정 창·접힘 미리보기 | 사건 행 4칸 | DD-B1~B4 | `eventOffersDemolished` · 사실 4칸 ⑫⑭④③ |

⑥ 사이드바: 변경 없음(E3-1b UI §0 실측 인용 — 이 세션 재측정 안 함, UV-8).

---

## 1. 현행 사실 (실측)

### 1.1 입력 칸 지도

| 위치 | 사실 |
|---|---|
| `OtherLandDetailSection.tsx:166` · `:180` · `:205` | 화면 순서 = 이력 섹션 → 재산세 과세 분류(양도일 현재) → **근거**(`OtherLandPropertyTaxBasisField`). 유예기간은 상위 `NblSectionContainer.tsx:297`의 별도 섹션으로 맨 아래 |
| `OtherLandPropertyTaxBasisField.tsx:35` · `:50-57` · `:68-80` | 꼬리 근거 선택지 = `propertyTaxBasisOptions` — **별도합산 + 건축물 없음 = 공지상태 · 철거ㆍ멸실 · 모름**. «철거ㆍ멸실» 라디오 설명 = 조문 인용뿐(`property-tax-basis.ts:50`). 고르면 «철거ㆍ멸실 전 건축물 바닥면적»(㎡) 칸 + hint 끝 «철거일(1년·빈집 3년 한시 지위)은 판정하지 않습니다 — 확인 필요.» |
| `other-land.ts:162-163` · `:273-275` · `property-tax-basis.ts:101-122` | 꼬리 `demolished`는 `basisKept` — **철거일을 읽지 않는다**(입력 4개: 구분·건축물 유무·근거·바닥면적). 엔진 v2는 `resolvePropertyTaxBasis`에 철거일·한도(`isTailDemolishedClearlyExpired`)를 더한다(엔진 §5.3) |
| `OtherLandBareIntervalFields.tsx:60-125` · `other-land-state-history.ts:143-145` | 나대지 구간 근거 선택지 = `eventBasisOptions`(= V1-A 선택지에서 `demolished` 제외). `:113` hint가 «철거 후 한시 별도합산·건축 중 기간은 근거로 받지 않고 「부득이한 사유 유예기간」으로 입력». **E3f-2가 철거 행 뒤 구간에서 이 안내를 번복한다.** 건축 중 기간은 계속 유예(5호) |
| `OtherLandStateHistorySection.tsx:279-283` · `:351-360` · `:540` | `eventClosesBareInterval`(신축 행 · 직전 건축물이 없는 구분 변경 행)이 «나대지 선언» 카드(`OtherLandBareIntervalFields`)를 정한다. `:540` = `NBL_STATE_HISTORY_GRACE_ROW_NOTICE` **상시 한 줄**(`nbl-confirm-notices.ts:122-124`) |
| `OtherLandBuildingKindField.tsx:44-67` | 철거 행의 «철거된 건축물 종류»(주택 / 그 밖) — `buildingKindBefore:"house"` 또는 키 부재. **E3f-2의 사실 칸 종류(바닥면적 칸 vs 빈집정비 칸)를 정하는 사실**이다 |
| `nbl-other-state-history-scope.ts:120-146` `stateEventWireRow` · `non-business-land-request.ts:150-175` | ④: 사건 행의 숨은 stale 값은 싣지 않는다(키는 값이 있을 때만). 최상위 `nbl*` 칸은 **prefix-pick**(`:193-196`)이라 새 칸 `nblOtherDemolishedOn`은 ⑬을 자동 통과하지만 **저장된 stale 값도 그대로 실린다** → ④가 13호 행 선례(`householdHouseWireFields` `:150-160`)처럼 덮어써야 한다 |
| `transfer-tax-validate-nbl-other.ts:50-60` · `transfer-tax-schema-nbl-refines.ts:228-237` | 꼬리 철거 근거 ⑧·⑫ **이미 대칭**(`demolishedBasisIssue` — 바닥면적·용도지역) — 철거일 규칙도 같은 함수 확장으로 같은 자리에 둘 수 있다(§7) |
| `transfer-tax-validate-nbl-state-history.ts:60-107` · `nbl-other-state-history-read.ts` | ⑧의 «엔진이 읽지 않는 칸은 요구하지 않는다» 게이트(`housePriorHistoryIgnoredOf` = 의제 사유 ∨ core 부분 면적 — ④ raw → ⑭ 매퍼 → 엔진 `otherLandAreaIsPartial` 실측). **⑫에는 이 거울이 없다**(E3-③ Q-10 (가)) — 이번 Q-5 «⑧·⑫ 모두 필수»는 이 비대칭을 닫아야 한다(UQ-8) |
| 법령 | 지령 §103의2 현행(**확인**): «과세기준일 현재 … 사실상 철거ㆍ멸실된 날부터 1년이 지나지 않은 … 부속토지(건축 용도 외 사용 제외 · 바닥면적 × §101② 배율)» · 빈집정비사업 등 **3년** · 허가ㆍ사용승인 없는 건축물 제외. 규칙 §83의5①9호 «멸실ㆍ철거 … 날부터 5년» **확인**(MST 286379 — ⑤항 신청서는 11호만 요구). manifest 기존 등록(`additions-local-decree.ts:201-212`) — 새 조문 인용은 엔진 PR이 상수를 더할 때 등록 |

### 1.2 probe 실측 (엔진 직접 경로 — 이 세션, 파일 삭제함)

방법: 이력 raw → `buildNblEngineInput` → `judgeNonBusinessLand` → `calculateTransferTax`(E3-1b predo anchor와 같은 경로 · ⑫ Zod 미경유 — UV-1). 공통: 취득 2014-01-01 · 기타토지 1,000㎡ · 일반주거 · 철거 전 건축물 구간 별도합산 · 꼬리 나대지 · «근거»열 = 꼬리 근거 «철거ㆍ멸실» + 바닥면적 400㎡. 세액은 같은 줄 안 비교용.

| # | 양도일 | 철거일(행) | 꼬리 | 9호 | 소유기간 사업용/전체 | 판정 · 세액 |
|---|---|---|---|---|---|---|
| S2 | 2024-01-01 | 2023-06-01 | 근거 | 없음 | 3,651/3,651 | 사업용 198,210,000 (종합합산이어도 S1 = 3,437/3,651 사업용 — 철거 후 짧으면 판정 불변) |
| S5 / S6 / S7 | 〃 | 2020-01-01 | 종합 / **근거** / 종합+9호 | 없음/없음/2년 | 2,190 / 3,651 / 2,921 | **N 253,960,000** / B 198,210,000 / B 198,210,000 |
| S19 / S20 / **S18** | 〃 | 2018-01-01 | 종합 / 종합+9호 / **근거** | 없음/2년/없음 | 1,460 / 2,190 / **3,651** | N / **N 253,960,000** / **B 198,210,000** — 철거 6년 뒤도 한도 없이 인정 |
| S23 / S22 / S21 | 2025-06-01 | 2018-01-01 | 종합 / 종합+9호 5년 / 근거 | 없음/5년/없음 | 1,460 / 3,286 / 4,168 (전체 4,168) | **N 246,680,000** / **B 192,330,000** / B 192,330,000 |
| S4·S15 | 2024-01-01 | 2023-06-01 | 근거 + 9호 | | 유예 가산 **0일** | 근거가 이미 사업용 |
| S9·S10 | 〃 | (행 없음) | 이력 `""`·`unchanged` + 근거 | | 3,651/3,651 | 사업용 — 근거만으로 전 기간 적용(`basis=state_at_transfer`) |
| S11 | 〃 | 2023-06-01 | 근거 + 바닥면적 100㎡(초과) | | 이력 접힘 | N 205,990,000 + 부분 면적 안내 |
| S12 | 〃 | 2023-06-01 | 근거 + 바닥면적 미입력 | | 3,437/3,651 | 종합합산 + 확인 필요로 접힘 |

렌더 3종: ⑧ `validateNblOtherLand`는 철거 후 4~6년이든 `unchanged`·미응답이든 **null(통과)**. 꼬리 근거 블록의 «1년·한시» 언급은 바닥면적 hint 끝 한 문장뿐. 9호 행 미리보기는 «이 날부터 5년까지 가산»(hint `GracePeriodSection.tsx:183`)과 «가산 기간 … 2년»(`:208`)이 양도 2025-03-21. 전에는 어긋남(기존 동작 — 이 계획 밖, M-8). 결과 카드는 echo + `NBL_PTAX_DEMOLISHED_STATUS_NOTICE`로 «철거일 판정하지 않았다 — 확인 필요»를 말하지만 **입력 시점에는 안 보인다**.

엔진 계획서 §3·§7 오라클(인용 — UI 재측정 안 함): 6개월·1년 한시는 9호에 포함돼 판정 효과 0, **빈집 3년 × 양도 2024-06-01~2025-03-20**이 판정을 뒤집는 유일한 셀(K-7: 비사업용 1,096/2,283 → 사업용 1,462), 꼬리 접힘은 +55,750,000(K-12, 9호 있으면 불변).

### 1.3 사용자가 오해하는 지점 (M-n — 결정 후 상태)

| # | 오해 | 해소 단계 |
|---|---|---|
| M-1 | 같은 사실을 두 칸이 반대로 안내(꼬리 = 받음 / 나대지 구간 = 받지 않음·유예) | N-3(임시) → E3f-2에서 구간도 받음 |
| M-2 | 꼬리 «철거ㆍ멸실»에 한도가 없다(S18) | N-1(안내) → E3f-1b(한도 + 입력 시점 안내 줄) |
| M-3 | 근거를 고르면 9호가 불필요해 보인다 | N-2 · N-1 |
| M-4 | 철거 행만 넣고 9호를 빠뜨린다(S23 vs S22 54,350,000) | N-2(조건부 안내) |
| M-5 | 이력 «바뀐 적 없음»인데 철거 근거 — 취득 전 철거는 정당 | UQ-6 (가): 막지 않음 → E3f-1b 새 칸이 철거일을 받는다 |
| M-6 | 바닥면적 초과 → 이력 접힘(기존 안내) | 변경 없음 |
| M-7 | §103의2 사실 요건(허가·건축 외 용도·빈집)을 입력할 칸이 없다 | **E3f-2 사실 칸**(나대지 구간) — 꼬리는 Q-6 (가)로 사실 칸 없음 |
| M-8 | (기록만) 9호 hint 연수 vs 미리보기 연수 불일치 | 이 계획 밖 |
| **M-9** | (새로) 나대지 구간에서 «철거ㆍ멸실»을 골랐는데 사실 칸을 «모름»으로 두면 구간이 종합합산으로 접힌다 — 사용자는 «선언했는데 왜 안 되는가» | §4.4 접힘 사유 한 줄(엔진 사유 표) |
| **M-10** | (새로) 9호와 구간 근거를 같이 넣으면 이중 계산이라 오해(엔진은 합집합 — 이중 없음, K-8) | §4.3 보조 안내 |

---

## 2. 사용자 시나리오 — 무엇을 알고 무엇을 모르는가

| # | 상황 | 사용자가 아는 것 | 입력(결정 후) |
|---|---|---|---|
| W-1 | 취득 후 철거 → **1년 안에** 양도 | 철거일 · 고지서 별도합산 | 철거 행 + 꼬리 별도합산 + 근거 «철거ㆍ멸실» + 바닥면적 → 철거일은 행이 대므로 **새 칸 없음** |
| W-2 | 취득 후 철거 → 몇 년 뒤 양도(나대지) | 철거일 · 현재 고지서 종합합산 | 철거 행 + 꼬리 종합합산 + **9호 유예**(N-2 안내) |
| W-3 | **취득 전** 철거 토지를 취득 → 1년 안에 양도 | 전 소유자 철거일(건축물대장·등기) | 이력 «바뀐 적 없음» + 근거 «철거ㆍ멸실» + 바닥면적 + **새 칸 철거일** |
| W-4 | 철거 후 몇 년 지났는데 근거를 고름 | 안내를 읽고 오해 | 꼬리 근거 → 엔진이 확실히 지남이면 접음 + 입력 시점 안내 줄(E3f-1b) |
| W-5 | 철거 → **신축 전 나대지 기간에 별도합산(1년 안)** — 9호를 안 넣었거나 넣고 싶지 않음 | 철거일 · 고지서 · 허가·사용승인 · 철거 후 용도 | 철거 행 + 신축 행(닫는 행) 근거 «철거ㆍ멸실» + 사실 칸(E3f-2) |
| W-6 | **주택** 철거 → 빈집정비사업(3년) · 일반 주택(6개월·1년) | 사업 시행 사실 · 철거일 | 철거 행(종류 «주택» + 정착면적) + 뒤 나대지 구간 근거 «철거ㆍ멸실» + 허가·건축 외 용도 + **빈집정비 예/아니오/모름** (Q-8 (나)) |
| W-7 | 철거 → 구분 변경 → 구분 변경(나대지 구간 2개) | 같은 철거일 | 두 구간 모두 «철거ㆍ멸실» 선언 가능 — 같은 철거일 창과의 교집합만 인정(엔진 K-10c) |
| W-8 | 철거된 건축물이 비주택 + 배율 초과 | 건축물대장 바닥면적 | 사실 칸 바닥면적 → 초과면 그 구간 전체 접힘 + 허용·초과 면적 고지 |
| W-9 | **취득 전 철거 + 첫 구간이 나대지**(철거 행 없음) 인데 구간 선언으로 한시를 주장 | 전 소유자 철거일 | **받지 않음**(엔진 V-15 v1 제외) — 9호 안내(UQ-9) |

알고 모르는 것: 사용자는 **철거일·고지서 과세구분**을 안다. 허가·사용승인·건축 외 용도·빈집정비는 «모를 수 있다» → 각 칸에 «모름» 선택지를 두고 **«모름» = 혜택 불성립 + 확인 필요**(엔진 Q-7; `feedback_unknown_fact_applies_unfavorably`). 사실마다 **한 곳에서만** 받는다(철거일: 철거 행 ↔ 새 칸 상호배타).

---

## 3. 엔진 계획서(v3)와의 계약 (A-n)

| # | 계약(엔진 계획서 §) | UI가 쓰는 곳 |
|---|---|---|
| A-1 | leaf `demolished-temp-status.ts`(§5.1): `demolishedRequiredFacts(r, end, kind)` · `demolishedStatusWindow({...})` → `holds`\|`never`\|`unconfirmed` · `isTailDemolishedClearlyExpired(r, T)` · `demolishedStatusNotice(transferDate)` + **v3 §6.1 거울 술어** `demolishedOnRequired` · `demolishedOnIssue` · `demolishedRowFloorAreaRequired(index)` · 확장 함수 `demolishedInputIssue`(= 기존 `demolishedBasisIssue` 확장 — `part:"demolishedOn"` 추가) | ⑤ 칸 노출·미리보기·고지 · ④ 운반 게이트 · ⑧⑫ 요구 게이트 — **한 술어** |
| A-2 | 나대지 구간 근거 허용 = `eventOffersDemolished(events, index, tailHasBuilding)` = `eventClosesBareInterval` ∧ 직전 건축물 사건이 철거 행(사이 신축 없음)(§5.2-1) | ⑤ 근거 선택지 · ④ `stateEventWireRow` · ⑧ · ⑫′ · 미리보기 |
| A-3 | 사실 4칸 와이어 `demolishedPermitBefore` · `demolishedOtherUseBefore` · `demolishedVacantHouseBefore` · `demolishedFloorAreaBefore`(㎡) — `yes\|no\|unknown\|""` 3칸 + 숫자 문자열 1칸(§5.4 · §6 ①~⑭) | ① 사건 행 optional 키 · ⑫ 행 스키마 |
| A-4 | 꼬리 새 칸 `nblOtherDemolishedOn`(§5.3 · §6) — 철거 행이 철거일을 대면 숨김 · stray 무시(K-17) | ① 최상위 · ④ 덮어쓰기 · ⑫ |
| A-5 | 접힘 사유 `demolished_never_period` · `_permit` · `_other_use` · `_area_missing` · `_area_exceeded` · `_period_elapsed` · `_date_missing`(§5.8-3 — v3에서 `_house_not_vacant` 삭제됨). **접힘이 아닌 고지** `NBL_STATE_HISTORY_BARE_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE`(주택 행 빈집정비 «아니오·모름·미선택» = 일반 기간 + 3년 연장 불인정 확인 필요 — Q-8 (나)) | ⑦ 결과 표 · ⑤ 미리보기 문구(엔진 `Record<…>` 표) · ④a 곁 보조 줄 |
| A-6 | 인정 고지 `NBL_STATE_HISTORY_BARE_DEMOLISHED_ACCEPTED_NOTICE` · 빈집 셀 고지 · 연혁화 고지(§5.8) | ⑤ 안내 · ⑦ |
| A-7 | `LandStateInterval.temporaryStatusWindow?: {start,end}` echo(§5.2-2) | ⑦ 구간표 · ⑤ 미리보기 |

**엔진 계획서 v3와 어긋나는 곳**은 §16.2.

---

## 4. 화면 스펙 ⑤

### 4.1 E3f-1a — UI-N (새 입력 0 · 안내·고지만)

| # | 변경 | 위치 | 활성 조건 | 문구 |
|---|---|---|---|---|
| N-1 | 꼬리 근거 «철거ㆍ멸실» **라디오 설명 + 바닥면적 hint 교체** | `OtherLandPropertyTaxBasisField.tsx:50-57` · `:68-80` (+ 부모 `OtherLandDetailSection`이 `transferDate`를 prop으로 넘김 — 현재 이 필드는 양도일을 받지 않는다) | 현행과 동일(별도합산 + 나대지 + 해당 근거) | 엔진 `demolishedStatusNotice(transferDate)`(연혁화 — 양도일 시행본별 6개월·1년·빈집 3년·허가 요건·건축 외 용도 문언 선택) + 방향: «이 기간이 지났다면 이 근거 대신 「부득이한 사유 유예기간」(9호)으로 입력»(E3f-1b 이후 «지나면 인정하지 않고 접습니다»로 엔진이 교체). 양도일 미입력은 연혁 미선택 문구(엔진이 정의 — 요청 R-5) |
| N-2 | **철거 행 + 9호 유예 부재** 조건부 amber 안내 | `OtherLandStateHistorySection.tsx` 철거 행 카드 안(직전 구분/정착면적 카드 뒤 · `nbl-other-state-event-{i}-grace-nudge`) | `ev.kind === "building_removed"` ∧ `consumesGracePeriods(asset.nblLandType)`(`GracePeriodSection.tsx:66`과 같은 술어) ∧ `nblGracePeriods`에 `reasonCode === "demolition"` 행 **없음** ∧ `!deemedBlocks`(`:171`) ∧ `!historyIgnored`(`:182` — 엔진이 이력을 읽을 때만) | 방향: «이 철거에 9호 유예기간을 입력하지 않으면 철거 후 구간은 유예 없이 판정합니다. 해당하면 「부득이한 사유 유예기간」에 이 철거일을 기산일로 입력하세요(근거 «철거ㆍ멸실»과 같이 입력해도 겹치는 날은 한 번만 셉니다).» — 기산일 불일치는 판정하지 않는다(UV-9). 상시 `GRACE_ROW_NOTICE`(`:540`)는 **바이트 동일 유지** |
| N-3 | 나대지 구간 근거 hint(`OtherLandBareIntervalFields.tsx:113`)와 꼬리 근거 안내의 **임시 정합**(E3f-1a~E3f-2 사이 — 구간은 아직 받지 않음) | 해당 두 곳 | 현행과 동일 | «양도일 현재(꼬리) 칸의 「철거ㆍ멸실」 근거와 달리 이 나대지 구간에서는 아직 받지 않습니다 — 9호 유예기간으로 입력»(엔진 상수 · 접두 동일 + 한 문장 추가 — `NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE` 직접 import 단언 자동 추종). **E3f-2가 이 문장을 폐기** |

판정·날짜 계산은 UI가 하지 않는다 — N-2의 조건은 저장값 존재 여부 + 엔진 게이트 술어뿐이다. 순수 파생 렌더 · `useEffect → store` 없음. «철거일 기산 9호 빠른 추가» 버튼은 stale 사본 · «유예 자동 생성 안 함» 정책(`nbl-confirm-notices.ts:122`)과 충돌해 **기각**(UQ-2 (다)).

### 4.2 E3f-1b — UI-T (꼬리 철거일 · 새 입력 1)

`OtherLandPropertyTaxBasisField.tsx`의 «철거ㆍ멸실» 블록(`requiresDemolishedFloorArea` 참일 때, `:68`)에 **바닥면적 칸 앞**(UI 순서 = 계산 순서: 근거 → 철거일 → 바닥면적)에 철거일을 둔다. 출처·요구 술어는 엔진 v3 §6.1의 `demolishedOnRequired`(«철거 행이 날짜를 대지 않음» 항을 포함 — **칸이 보이는 조건 = ⑧ 요구 조건 = ⑫ 400 조건이 정확히 같다**). 읽기 전용 줄에 쓸 «철거 행 날짜» getter는 엔진 §5.2 `removalDateFor` 계열을 export해 달라고 요청한다(R-2′).

| 출처 상태(`demolishedOnRequired`) | 화면 |
|---|---|
| 거짓 — 이력 `changed` ∧ 꼬리 건축물 없음 ∧ 마지막 건축물 사건 = 철거 행(날짜 유효) | **새 칸 없음.** 읽기 전용 한 줄 `data-testid="nbl-other-demolished-on-source"`: «철거일(위 «건축물 멸실·철거·붕괴» 행): YYYY-MM-DD» (표시 전용). 숨은 새 칸 저장값은 지우지 않고 **전송하지 않는다**(stray 무시 — 엔진 K-17 · 이력 복원값 보존) |
| 참 — 그 밖(이력 없음·`unchanged`·`unknown`·철거 행 없음·취득 전 철거) | **새 칸** FieldCard `field="nblOtherDemolishedOn"` · label 「철거ㆍ멸실일」 · `required` · DateInput(공용) · hint «건축물대장·등기부로 확인한 사실상 철거ㆍ멸실일입니다(취득 전에 철거됐어도 입력합니다). 사실상 철거일을 알 수 없으면 공부상 철거ㆍ멸실일을 입력하세요.» — 빈칸은 빈칸(표시 fallback·가정값 없음) |

- 근거가 «철거ㆍ멸실»이 아니면 칸 전체 숨김 · 전송 안 함.
- **입력 시점 피드백**(M-2 해소): 엔진 `isTailDemolishedClearlyExpired(r, T)` 참이면 amber ToneCard `data-testid="nbl-other-demolished-expired-notice"` — 문구는 엔진 상수(방향: «철거일부터 한시 기간이 확실히 지나 이 근거는 인정하지 않고 종합합산으로 판정합니다 — 9호 유예기간이 있으면 그대로 반영됩니다 — 확인 필요»). 계산은 한 줄도 UI가 하지 않는다. 철거일 또는 양도일 해석 불가면 안내 없음.
- 바닥면적 hint 끝의 «철거일(…)은 판정하지 않습니다» 문장은 엔진이 상수를 교체(R-3).
- 구 저장 세션(근거 «철거ㆍ멸실» + 철거 행 없음 + 날짜 없음): ③이 새 칸을 채우지 않아 칸이 `required`로 보이고 ⑧이 계산 직전 막는다(Q-5 · UV-3의 안내문은 ⑧ 문구가 맡는다).

### 4.3 E3f-2 — UI-B (나대지 구간 근거 «철거ㆍ멸실» + 사실 칸)

**노출 조건** = 엔진 `eventOffersDemolished(events, i, tailHasBuilding)`(신축 행이든 구분 변경 행이든 **철거 행 뒤** 나대지 구간 — 사이에 신축이 있으면 아님) **∧ 엔진이 이력을 읽음**(엔진 v4 §6.2 D-2 `nblStateHistoryIsRead(raw)` — 의제 사유·core 부분 면적이면 근거 «철거ㆍ멸실» 선택지의 **사실 칸 블록 전체를 그리지 않고** 기존 `partial-area-notice`/의제 안내만 보인다 — 값은 보존). 첫 구간이 취득 전 철거로 나대지인 경우는 철거일 출처가 없어 제외(W-9 · UQ-9 — 선택지에 «철거ㆍ멸실»이 뜨지 않고, 닫는 행 근거 hint에 9호 안내 한 줄). **주택부수토지 카드(variant housing · Q-12 (가))도 같다** — 모든 철거 행이 주택이므로 사실 칸은 ②허가 ③건축 외 용도 ④a빈집정비 3개뿐이고 ④b 바닥면적 칸은 없다(철거 구간 판정 정착면적 × 배율과 서로 입력을 읽지 않음 · «읽음»은 주택 카드 분기 — 엔진 V-26 정독 대기). 읽기 전용 줄 ①의 철거일은 엔진 `removalDateFor(events, i)`(D-3), 꼬리는 `tailRemovalDateOf(events, tailHasBuilding)`를 쓴다.

`OtherLandBareIntervalFields.tsx`(161줄) 변경 + **신규 컴포넌트** `OtherLandDemolishedFactsField.tsx`(사실 칸 블록 · `OtherLandBareIntervalFields`가 포함 — 800줄 정책: 기존 파일을 키우지 않는다).

**근거 라디오**: `eventBasisOptions(before)`가 «철거ㆍ멸실» 포함 선택지(엔진 단일 소스 — 호출자가 `offersDemolished` 인자를 넘긴다). 설명 줄 = N-1과 같은 엔진 연혁 문구. hint(`:113`)는 철거 행 뒤 구간이면 «철거ㆍ멸실» 안내로, 철거 행 앞 구간(신축 앞 나대지 등)이면 종전 «건축 중 기간은 유예로»만 남긴다.

**사실 칸 블록**(근거 = «철거ㆍ멸실»일 때) — ToneCard `tone="amber"` title 「철거 후 한시 별도합산 사실 확인」, 순서 = 계산 로직 순서:

| 순 | 위젯 | 노출(엔진 `demolishedRequiredFacts(r, end, kind)` — 같은 술어) | 라벨 · 선택지 · hint(placeholder 숫자 없음) | 저장·전송 |
|---|---|---|---|---|
| ① | 읽기 전용 줄 `…-demolished-removed-on` | 항상 | «철거일: YYYY-MM-DD(「건축물 멸실·철거·붕괴」 행) · 이 나대지 구간: A ~ B» | — |
| ② | RadioCardGroup inline `…-demolished-permit-{yes\|no\|unknown}` | 성립 후보 과세기준일 ≥ 2019-06-01 | 「철거된 건축물(주택)이 건축 관계 법령상 허가·사용승인을 받은 것이었습니까?」 예 / 아니오 / 모름. hint: 허가 등을 받아야 하는데 받지 않았거나 사용승인(임시사용승인 포함)을 받아야 하는데 받지 않은 건축물의 부속토지는 제외됩니다. 건축물대장·허가대장으로 확인하세요 — 모름은 인정하지 않고 확인 필요로 표시합니다 | `demolishedPermitBefore` `yes\|no\|unknown\|""`(미응답 = `""` → ⑧ 차단) |
| ③ | RadioCardGroup inline `…-demolished-otheruse-…` | 후보 과세기준일 ≥ 2024-06-01 | 「철거 후 그 토지를 건축을 위한 용도 외의 다른 용도로 사용했습니까?」 아니오 / 예 / 모름. hint: 건축 용도 외로 사용한 부속토지는 제외됩니다(그 용도가 무엇인지는 묻지 않습니다) | `demolishedOtherUseBefore` |
| ④a | RadioCardGroup inline `…-demolished-vacanthouse-…` | **철거 행 종류 «주택»** ∧ 후보 과세기준일 ≥ 2024-06-01 | 「철거된 주택이 「빈집 및 소규모주택 정비에 관한 특례법」 빈집정비사업(또는 「농어촌정비법」 생활환경정비사업 중 빈집 정비)으로 철거된 빈집이었습니까?」 예 / 아니오 / 모름. hint: 예이면 철거일부터 3년까지 인정하고, 아니오·모름은 일반 한시 기간(6개월·1년)만 인정합니다 — 3년 연장은 확인 필요로 표시합니다(**Q-8 (나)** · 접히지 않습니다) | `demolishedVacantHouseBefore` |
| ④b | DecimalInput `…-demolished-floorarea` · FieldCard label 「철거 전 건축물 바닥면적」 단위 ㎡ | **철거 행 종류 «그 밖의 건축물»(비주택 — 기타토지 카드만 · 주택부수토지 카드는 칸 없음)** | hint: 건축물 외 시설은 수평투영면적. 이 면적에 용도지역별 적용배율을 곱한 범위가 인정되고 부속토지가 그보다 넓으면 **그 구간 전체를 종합합산으로 보고 안분하지 않습니다**(Q-9). 용도지역은 위 토지 정보의 값을 씁니다 | `demolishedFloorAreaBefore` 숫자 문자열 |
| ⑤ | 주택 행 보조 한 줄(④a 곁) | 철거 행 «주택» | 엔진 고지(지령 §105 — 부속토지 경계가 명백하지 않으면 바닥면적 10배): 확인 필요 | — |
| ⑥ | 인정 창·접힘 미리보기 `…-demolished-window` | 사실 칸이 모두 답해진 뒤(엔진 leaf 결과가 있을 때) | `holds`: «한시 지위 인정 기간: YYYY-MM-DD ~ YYYY-MM-DD(N일)» · 접힘: 엔진 사유 문구(`foldReason` 표 — §4.4) | **표시 전용 — 저장·전송 없음 · UI 계산 0** |

- 선택지 값은 `""`을 «미선택»으로 둔다. «아니오가 기본» 같은 가정값을 두지 않는다(RadioCardGroup 미선택 상태).
- 사실 칸 노출은 철거일·닫는 행 날짜가 해석돼야 정해진다 — 날짜가 비면 블록 대신 한 줄 «사건일을 입력하면 필요한 사실 칸이 표시됩니다»(순서 규칙: ⑧은 날짜 결함을 먼저 막는다).
- 닫는 행의 «구분»을 바꾸면 근거·면적한도와 함께 **사실 4칸도 리셋**(onChange 핸들러에서 행을 다시 만든다 — 현행 `:90-97` 패턴 확장). 근거만 바뀌면 사실 칸은 지우지 않고(④가 보내지 않는다 — 이력 복원 보존) 숨는다.
- ToneCard(톤 하드코딩 금지 — `tones.ts` 소스). 1블록이라 번호 배지는 쓰지 않는다.

### 4.4 접힘·인정 표시(엔진 사유 표를 그대로 읽는다)

| 상태 | 표시 위치 | 문구 |
|---|---|---|
| 인정(`holds`) | ⑤ 미리보기(⑥) · ⑦ 구간표 `temporaryStatusWindow` · 경고 `NBL_STATE_HISTORY_BARE_DEMOLISHED_ACCEPTED_NOTICE` | 엔진 상수(과세기준일 현재 지위를 일 단위 창으로 근사한 상한 — 확인 필요) |
| 접힘 | 구간 행 «재산세 구분»열(`bareIntervalTaxTypeText`가 읽는 echo) · ⑤ 미리보기 · 닫는 행 amber 카드 | 사유별 한국어(엔진 `UNCONFIRMED_REASON_TEXT` 계열 — `demolished_never_period` «철거일 이후 한시 기간 안에 과세기준일이 없어» · `_permit` · `_other_use` · `_area_missing` · `_area_exceeded`(허용·초과 면적) · `_period_elapsed`(꼬리) · `_date_missing`(꼬리)). 어떤 접힘이든 **종합합산으로 보아 판정하고 확인 필요** |
| 일반 주택 + 빈집 «아니오·모름·(미선택)» | 인정(일반 기간)·**접히지 않는다**(Q-8 (나) — 엔진 v3 §5.7: 제1호는 빈집 요건이 없다) | 고지 `NBL_STATE_HISTORY_BARE_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE`(엔진 상수 — ④a 곁 한 줄 · 결과 경고). 일반 기간 안에 과세기준일이 없으면 `demolished_never_period`로 접힘(예: 철거 2021-06-02 — 빈집 «예»만 2024-06-01 3년 시행본으로 성립) |

---

## 5. 적용 술어 단일 소스

| 술어 | 소유 | 읽는 곳 |
|---|---|---|
| 철거 행 뒤 나대지 구간인가 | 엔진 `eventOffersDemolished` | ⑤ 선택지 · ④ `stateEventWireRow` · ⑧ · ⑫′ · ⑭ · 미리보기 |
| 어떤 사실 칸이 필요한가 | 엔진 `demolishedRequiredFacts(r, end, kind)` | ⑤ 노출 · ④ 운반 · ⑧ · ⑫′ · ⑭ — **UI 자체 «≥2019-06-01» 비교 금지** |
| 인정 창·접힘 | 엔진 `demolishedStatusWindow` | ⑤ 미리보기 · ⑦ |
| 꼬리 철거일 출처·요구·결함 | 엔진 v3 `demolishedOnRequired` · `demolishedOnIssue`(`demolishedInputIssue`) · 한도 `isTailDemolishedClearlyExpired` | ⑤ · ④ · ⑧ · ⑫ · ⑭ |
| 연혁 고지 | 엔진 `demolishedStatusNotice(transferDate)` | ⑤(N-1) · ⑦ |
| 엔진이 사건 행을 읽는가 (**사실 칸 4개 전부의 노출·요구 게이트** — 꼬리 철거일은 해당 없음: 구조 술어 `demolishedOnRequired`만) | 엔진 v4 export `otherLandStateHistoryIsRead(input, rules)` · `nblStateHistoryIsRead(raw)`(`nbl-other-state-history-read.ts` — 주택 카드는 `applyHousingStateHistory` 무시 조건 분기, V-26) | ⑤ 노출·필수 표시 · ⑧ · ⑫ · ④ 운반(읽지 않으면 사실 칸을 싣지 않는다) |
| 이 지목이 유예를 읽는가 | `consumesGracePeriods` | N-2 · `GracePeriodSection.tsx:66` |

---

## 6. 클라이언트 14지점 — 단계별

### 6.1 E3f-1a (UI-N)

| 지점 | 변경 |
|---|---|
| ①②③④⑥⑧⑨~⑭ | **없음** |
| ⑤ | `OtherLandPropertyTaxBasisField.tsx`(N-1 + `transferDate` prop) · `OtherLandStateHistorySection.tsx`(N-2) · `OtherLandBareIntervalFields.tsx`(N-3) — 문구는 엔진 상수 |
| ⑦ | 결과 카드 코드 변경 없음(경고는 엔진 상수 — 문구 교체 자동 반영 · 기존 단언 확인 §10) |

### 6.2 E3f-1b (UI-T) — 새 필드 `nblOtherDemolishedOn`

| 지점 | 위치 | 내용 |
|---|---|---|
| ① 타입 | `calc-wizard-asset-nbl-other.ts`(`nblOtherDemolishedFloorArea` `:114` 옆) | `nblOtherDemolishedOn: string` |
| ② initial | `calc-wizard-asset-factory.ts:373` · `calc-wizard-asset-nbl.ts:176` 옆 | `""` |
| ③ normalize | `calc-wizard-asset-migrate-nbl.ts:28-29` 옆 | 부재 → `""`(**채우지 않는다** — 구 세션은 ⑧이 요구·안내) |
| ④ API 변환 | `non-business-land-request.ts` — `nbl*` prefix-pick(`:193-196`)이 stale 값을 싣는다 → **`householdHouseWireFields`(`:150-160`) 선례처럼 base 뒤에서 덮어쓴다**: `demolishedOnRequired` 참일 때만 값, 아니면 `""`/키 생략 | |
| ⑤ UI | §4.2 | |
| ⑥ 사이드바 | 없음 | |
| ⑦ 결과 | `NonBusinessLandResultCard` `nbl-property-tax-basis-echo`에 철거일·접힘 사유(엔진 echo R-6) | |
| ⑧ validate | `transfer-tax-validate-nbl-other.ts:50-60` — `demolishedInputIssue`(= `demolishedBasisIssue` 확장 — 엔진 v3 §6.1) 호출(§7) | `IssueField` = `keyof AssetForm`이라 새 필드명 자동 포함 · 필드 점프 앵커 `data-field="nblOtherDemolishedOn"` |
| ⑨⑩ | 해당 없음(enum 아님) | |
| ⑪ | 해당 없음 | |
| ⑫ | `transfer-tax-schema-nbl.ts:203` 옆 `nblOtherDemolishedOn: z.string().optional()` + refine `transfer-tax-schema-nbl-refines.ts:72-73`(타입) · `:228-237`(같은 `demolishedBasisIssue`) | 새 키 누락 = 침묵 strip → route 관통 anchor |
| ⑬ | `nbl*` prefix-pick로 **자동 통과**(엔진 V-17 해소 — grep 확인, E2E body 확인으로 고정) | |
| ⑭ | `form-mapper-helpers.ts:384-392` — `otherLand.demolishedOn`(Date 변환 `lib/api/date-coerce.ts`) | 엔진 소관 |

### 6.3 E3f-2 (UI-B) — 사건 행 4칸

| 지점 | 위치 | 내용 |
|---|---|---|
| ① | `NblOtherStateEventInput`(`calc-wizard-asset-nbl-other.ts:50-76`) | optional 4키 `demolishedPermitBefore?` · `demolishedOtherUseBefore?` · `demolishedVacantHouseBefore?`(`"" \| "yes"\|"no"\|"unknown"`) · `demolishedFloorAreaBefore?`(string) — 키 부재 = 종전 행과 byte-identical |
| ② | 행 생성부 | 새 행은 키 없이 시작(`addEvent` `OtherLandStateHistorySection.tsx:200`) |
| ③ | `calc-wizard-asset-migrate-nbl.ts` | **키를 새로 만들지 않는다**(복원 byte-identical) |
| ④ | `stateEventWireRow`(`nbl-other-state-history-scope.ts:120-146`) | `eventOffersDemolished` ∧ `basis==="demolished"` ∧ `demolishedRequiredFacts`가 요구하는 칸만 싣는다(**+ `nblStateHistoryIsRead` 거짓이면 사실 칸 4개 모두 비전송** — 주택 카드는 `tailKind:"house"` 분기로 바닥면적 제외)(키는 값이 있을 때만 — 숨은 stale 비전송, E3-1b 선례) |
| ⑤ | §4.3 — **기타토지 카드 + 주택부수토지 카드(Q-12)** 모두 `OtherLandBareIntervalFields`가 닫는 행에 사실 블록을 그린다(housing은 ④b 바닥면적 없음) · 노출은 `eventOffersDemolished` ∧ `nblStateHistoryIsRead` | |
| ⑥ | 없음 | |
| ⑦ | `NblStateHistoryPeriodTable.tsx`(구간 행에 근거 «철거ㆍ멸실» · 인정 창 · 접힘 사유 — `:108-110`이 읽는 echo 확장) · `bareIntervalTaxTypeText`(`other-land-state-history.ts`) | |
| ⑧ | `transfer-tax-validate-nbl-state-history.ts`(새 함수 호출 1곳 — 시퀀스 결함 뒤 · 바닥면적/수도권 규칙과 같은 자리) | §7 |
| ⑨⑩ | `transfer-tax-schema-nbl.ts` enum 3개(메인 + 컴패니언 `transfer-tax-schema-companion.ts` + `addPropertyRefines`) | enum 누락 = 400 오작동 · 침묵 strip |
| ⑪ | 해당 없음 | |
| ⑫ | `transfer-tax-schema-nbl.ts:56-70` 행 스키마 + ⑫′ refine | §7 |
| ⑬ | 사건 배열 통째 전송 — 새 키 자동 통과(확인 필요 — route 관통) | |
| ⑭ | `form-mapper-helpers.ts` `buildLandStateHistory`(`:318-347`) | 엔진 소관 |

**파일 크기(실측 줄 수)**: `OtherLandStateHistorySection.tsx` 547 + N-2 ≈ 25 → ≈ 575 · `OtherLandBareIntervalFields.tsx` 161 + ≈ 25 → < 200 · 신규 `OtherLandDemolishedFactsField.tsx` ≈ 150 · `nbl-other-state-history-scope.ts` 172 + ≈ 25 · `OtherLandPropertyTaxBasisField.tsx` 90 + ≈ 35. 전부 700 이하 — 분리 트리거(800) 접근 없음. 엔진·스키마 쪽 파일 줄 수(`form-mapper-helpers.ts` 592 · `transfer-tax-schema-nbl.ts` 332)는 엔진 계획서 V-19 소관.

---

## 7. ⑧ 검증 규칙 · ⑧ ↔ ⑫ parity 격자 (Q-5 — ⑧·⑫ 모두 필수)

원칙: **칸이 화면에 없으면(숨김) ⑧도 ⑫도 요구하지 않는다.** ⑧·⑫는 같은 엔진 leaf를 부르고, 같은 게이트(요구 조건)를 쓴다. «빈칸 = 미입력(`""`)» ≠ «모름»: **모름은 답이다 → 통과(접힘 + 확인 필요)**.

### 7.1 꼬리 철거일 (E3f-1b — ⑧ `validateNblOtherLand` = ⑫ `refineNonBusinessLandRaw` 같은 `demolishedBasisIssue` 확장)

| 규칙 | 조건(엔진 단일 술어) | 차단 | 문구 |
|---|---|---|---|
| DD-T1 | `demolishedOnRequired` ∧ 칸 빈칸(엔진 v3 K-16) | ⑧ 차단 + ⑫ 400(`["nblOtherDemolishedOn"]`) | 엔진 leaf 문구(자동 가정 금지 — «한시 지위 판정에 필요합니다») |
| DD-T2 | `demolishedOnRequired` ∧ 값이 해석 불가·**양도일 이후(≥, 엔진 V-22)**(취득일 이전은 허용 — W-3 · K-16b) | 〃 | 〃 |
| — | `demolishedOnRequired` 거짓(철거 행이 날짜를 댐 — K-16c·K-17) | 새 칸 값은 **어떤 층도 읽지 않는다**(stray 형식 불량이어도 통과) | — |

격자(꼬리):

| # | 근거 | 출처 | 새 칸 | ⑤ 칸 | ⑧ | ⑫ | ⑭ 전송 |
|---|---|---|---|---|---|---|---|
| T1 | demolished | 철거 행 | 빈칸 | 숨김 + 읽기 전용 줄 | 통과 | 통과 | 철거 행 날짜 |
| T2 | demolished | 철거 행 | stray 형식 불량 | 숨김 | 통과 | 통과 | stray 무시 |
| T3 | demolished | 없음 | 빈칸 | **보임·필수** | **차단** | **400** | — |
| T4 | demolished | 없음 | 양도일 이후 | 보임 | 차단 | 400 | — |
| T5 | demolished | 없음 | 취득일 이전 | 보임 | 통과 | 통과 | 새 칸 |
| T6 | vacant_state·unknown·미선택 | — | stale 있음 | 숨김 | 통과 | 통과 | `""` |
| T7 | 근거 칸 자체 없음(종합합산·건축물 있음) | — | stale 있음 | 숨김 | 통과 | 통과 | `""` |
| T8 | demolished + `unchanged`·`""`·`unknown` | 없음 | — | W-3 = T3~T5 | | | |
| T9 | 축 B 둘째 이후 지분 카드(이력은 첫 카드에만) | 철거 행 없음 → **그 카드 자신의 새 칸**(엔진 v4 K-28 — 첫 카드 철거 행 날짜를 복사·미러링하지 않는다) | 빈칸 | 보임·필수 | **차단**(카드별) | **400**(카드별 raw) | 새 칸 |

꼬리는 **partial-area 게이트가 없다** — core가 꼬리 근거를 먼저 읽고(철거일 한도 → 접힘) 면적 초과 시 이력을 접으므로 철거일은 항상 읽힌다(⑧·⑫ 같은 조건).

### 7.2 구간 선언 사실 칸 (E3f-2)

| 규칙 | 조건 | 차단 |
|---|---|---|
| **DD-B4** | `demolishedRowFloorAreaRequired(i)`(= `eventOffersDemolished` ∧ `basis==="demolished"` ∧ 비주택 철거 행 ∧ `demolishedRequiredFacts`가 면적 요구) ∧ 바닥면적 빈칸·비수치·비양수 · **용도지역이 배율표에 없음**(기존 `demolishedZoneUnmappedMessage` — 엔진 v3 K-10e) | ⑧ 차단 + ⑫ 400 `["nblOtherStateEvents", i, "demolishedFloorAreaBefore"]` — 단 **엔진이 읽을 때만**(UQ-8 (가) 결정) |
| DD-B1 | `eventOffersDemolished` ∧ `basis==="demolished"` ∧ `demolishedRequiredFacts`에 ② 허가 포함 ∧ 값 `""`(미선택) | ⑧ 차단 + ⑫ 400 `["nblOtherStateEvents", i, "demolishedPermitBefore"]` — **사용자 결정 UQ-11 (나)**(미선택만 차단, 명시 «모름»은 통과 → 접힘 `_permit`) |
| DD-B2 | 같은 조건 ∧ ③ 건축 외 용도 ∧ `""` | 〃 `demolishedOtherUseBefore` |
| DD-B3 | 같은 조건 ∧ ④a 빈집정비 ∧ `""` (주택 철거 행) | 〃 `demolishedVacantHouseBefore`(단 «모름»·«아니오»는 **접힘이 아니라 일반 기간 + 고지**) |
| — | «모름»·«아니오»·«예» | 통과(접힘·고지는 엔진) |

**UQ-11 사용자 결정 2026-11-24 = (나)**: 노출된 3지선다의 미선택(`""`)은 ⑧ 차단 + ⑫ 400, 명시 «모름»은 허용(혜택 불성립 + 확인 필요). 엔진 v3의 Q-11 (가) 해석은 이 결정으로 대체된다(D-1 해소).

게이트(⑧·⑫ 공통 — 사실 칸 **4개 전부**): 이력 `changed` ∧ 시퀀스 결함 없음(`stateEventSequenceIssue` — 날짜·종류 결함이 먼저) ∧ 질문 적용(`nblStateHistoryApplies`) ∧ 축 B 둘째 이후 지분 카드 아님(이력 질문이 첫 카드에만) ∧ **`nblStateHistoryIsRead`(엔진이 이력을 읽음 — 의제 사유 ∨ core 부분 면적이면 거짓)**. ⑧은 `buildNonBusinessLandRaw(asset)`로 raw를 만들어 같은 함수를 부르고, ⑫′는 raw를 그대로 넘긴다(엔진 v4 D-2). **꼬리 철거일은 이 게이트를 쓰지 않는다**(core가 꼬리 근거를 먼저 읽으므로 구조 술어 `demolishedOnRequired`만 — §7.1).

**UQ-8 사용자 결정 2026-11-24 = (가) → 엔진 v4 §0.1이 게이트 범위를 «바닥면적 + 3지선다 사실 칸 4개 전부»로 확장**: 엔진이 사건 행을 읽지 않으면(의제 ∨ `isPartialArea`) 칸을 **노출하지도 요구하지도 않는다** — 정량 칸(모름 선택지 없음)에 지어낸 값을 강요하지 않기 위해서다(E3-③ 후속 #3636). 이전 UI v2의 «칸은 보이되 요구만 skip»은 **«칸을 그리지 않음»으로 바뀐다**. 공용 함수 = 엔진 export `otherLandStateHistoryIsRead` → `nblStateHistoryIsRead(raw)`(⑧·⑫ 공유 · try/catch 폴백 = «읽는다»).

격자(구간 선언 — 철거 행 + 닫는 행 + 근거 demolished 기준):

| # | 상태 | ⑤ 사실 칸 | ⑧ | ⑫ | ⑭ 전송 |
|---|---|---|---|---|---|
| B1 | 후보 ≥ 2024-06-01 · 비주택 · 필요한 3칸(허가·용도 외·바닥면적) 모두 답함 | 보임 | 통과 | 통과 | 3칸 |
| B2 | 같은 + 허가 `""`(미선택) | 보임·필수 | **차단** | **400** | — |
| B3 | 같은 + 허가 «모름» | 보임 | 통과(접힘 `_permit`) | 통과 | `unknown` |
| B3b | **바닥면적** 빈칸(비주택 철거 행) | 보임·필수 | **차단** | **400** | — |
| B4 | 후보 ≥ 2019-06-01 < 2024-06-01 | 허가(+면적) | 허가·면적 요구 · 용도 외는 **요구·전송 안 함** | 같음 | 허가·면적 |
| B5 | 후보 < 2019-06-01 | 면적만 | 면적만 | 같음 | 면적 |
| B6 | 주택 철거 행 | ④a 보임 · ④b 숨김 | 빈집 `""` 차단 · «아니오·모름» = **일반 기간 + 고지**(접힘 아님) | 400(`""`만) | 허가·용도 외·빈집(바닥면적 stray 미전송 — 엔진 K-26) |
| B7 | 철거 행 «주택» ↔ «그 밖» 전환 후 stale | 숨은 칸 보존 | 읽지 않음 | 읽지 않음 | 게이트된 칸만 |
| B8 | 근거가 `vacant_state`·`separate_taxation` 등 | 숨김 | 통과 | 통과 | 전송 안 함 |
| B9 | 이력 `unchanged`·`unknown`·`""` + stale 사실 칸 | 이력 블록 자체 숨김 | skip | **skip**(mode ≠ changed) | `[]` |
| B10 | 양도일 의제 사유(§168의14②) | **사실 칸 블록 숨김** + 기존 의제 안내 | skip(앞단 return · 읽지 않음) | skip | — |
| B11 | core 부분 면적(꼬리 근거 바닥면적 초과 등) | **사실 칸 4개 전부 숨김** + 기존 `partial-area-notice` | skip(`nblStateHistoryIsRead` 거짓) | skip(같은 함수) | `[]`(읽지 않으면 사실 칸을 싣지 않음) |
| B12 | 축 B 둘째 이후 지분 카드 | 이력 질문이 첫 카드에만 → 구간 사실 칸 없음(꼬리 철거일은 T9 — 자기 새 칸) | skip | skip | — |
| B13 | 닫는 행 날짜 비어 있음/시퀀스 결함 | 안내 한 줄 | 시퀀스 오류가 먼저 | 시퀀스 400이 먼저(엔진 K-16d 계열 — 중복 안내 없음) | — |
| B14 | `eventOffersDemolished` 거짓(철거 앞 구간·신축 사이)인데 직접 API가 `demolished` 전송 | — | — | 400 아님 — 엔진이 접음(`demolished_unsupported` 유지 — 엔진 V-7) | — |

⑧↔⑫ parity 불변식(엔진 v3 §6.1 원칙 3과 같다): **⑧ ≡ ⑫** — 같은 입력에서 둘 다 통과하거나 같은 필드·같은 문구로 막힌다. 최소한 **⑫가 400을 내는 모든 입력은 ⑧도 막는다**(B3b·T3·T4가 대표 — UQ-11 (나) 채택 시 B2·B6 포함). «⑫ 400인데 ⑧ 통과»인 격자 칸이 0임을 Do 단계 anchor가 전수 단언한다(엔진 V-20: 모드 4 × 사건 3 × 토글 2 × 근거 3 × 행 날짜 2 × 칸 4 = 576행 순수 함수 — 비용 낮음 · `feedback_fe8_vs_12_parity_grid`).

---

## 8. 결과 카드 ⑦ · 사이드바 ⑥ · 고지

- ⑥ 변경 없음.
- E3f-1a: 결과 카드 코드 변경 없음(경고 상수 교체 자동 반영).
- E3f-1b: `nbl-property-tax-basis-echo`에 철거일 · 접힘 사유(`demolished_period_elapsed`·`_date_missing`) 한 줄. 철거일이 철거 행에서 왔는지 새 칸에서 왔는지는 표시하지 않는다.
- E3f-2: `NblStateHistoryPeriodTable` 구간 행 — 근거 «철거ㆍ멸실» · **인정 창(시작~끝 · N일)** · 접힘 사유 · 사실 칸 요약(예/아니오/모름 한 줄). 구간 수는 늘지 않는다(엔진: 창은 echo 필드 — 구간을 쪼개지 않음). 결과 «사업용 일수»는 엔진 `intervalEcho` 겹침 값을 그대로 읽는다. 주택 행의 «3년 연장 불인정» 고지는 결과 경고에 엔진 상수로 나온다.
- 인쇄·PDF: 같은 echo를 읽으므로 별도 분기 없음(확인 필요 — UV-7 인쇄 E2E).

---

## 9. 교차 조합 케이스 전수 (각 행 = anchor 1건)

| # | 조합 | 기대 |
|---|---|---|
| X-1 | 철거 행 + 9호 없음 | N-2 보임 |
| X-2 | 철거 행 + 9호 있음(기산일 무관) | N-2 숨음 |
| X-3 | 철거 행 2건 + 9호 없음 | 행마다 N-2 |
| X-4 | 지목 → 건물(비주택) 등 유예를 안 읽는 지목 | N-2 없음 |
| X-5 | **의제 사유 + 이력 `changed`** | N-2 숨음 · 사실 칸 숨김 · ⑧·⑫ skip(B10) |
| X-6 | **core 부분 면적**(꼬리 바닥면적 초과 등) | N-2 숨음 · **사실 칸 4개 숨김** · ⑧·⑫ skip(엔진 v4 K-10f·K-10g — 사유 해소 시 칸이 다시 나타나고 빈칸이면 차단) |
| X-7 | 철거 행 «주택»(기타토지 카드, E3-③ B) + 뒤 나대지 구간 근거 «철거ㆍ멸실» | 사실 칸 허가·용도 외·빈집정비 · 바닥면적 숨김 · 빈집 «아니오·모름»도 **일반 기간 인정 + 고지**(Q-8 (나) — 엔진 K-24·K-25) |
| X-8 | 철거 행 «그 밖» + 뒤 구간 | 허가·용도 외·바닥면적 · 빈집정비 숨김 |
| X-9 | 철거 행 종류를 «그 밖» → «주택»으로 전환 | 숨은 바닥면적 보존 · 전송 안 함(K-26) · 필요한 칸 재계산(④a 노출 시작) |
| X-10 | **주택부수토지 카드**(variant housing · **Q-12 (가) 결정**) 철거 행 뒤 나대지 구간(신축 행이 닫는 행) | 근거 «철거ㆍ멸실» + 사실 3칸(허가·건축 외 용도·빈집정비) · **바닥면적 칸 없음** · «읽음»은 주택 카드 분기(V-26) · 꼬리는 항상 주택(근거 칸 없음) · 엔진 K-27 |
| X-11 | 지분 카드(축 B) — 이력은 첫 카드 | 둘째 이후 카드의 꼬리 근거 «철거ㆍ멸실»은 **자기 새 철거일 칸 필수**(복사 없음 — 엔진 K-28 · T9) |
| X-12 | **지목 왕복**(기타토지 → 임야 → 기타토지) | 사건 행·사실 칸 값 보존 · `nblStateHistoryApplies` 거짓 동안 ④ 비전송 · ⑧ skip · 복귀 시 재노출 |
| X-13 | **이력 모드 stale**: 사실 칸 입력 후 모드 `unchanged`/`unknown`/`""` | ④ `[]` · ⑧ skip · ⑫ skip · 값 보존 |
| X-14 | **E3-④ 13호** + 나대지 구간 근거 «철거ㆍ멸실» | 병렬 사유 → 합집합(엔진 Q-15 (가′)) · 13호 한정 고지 변형과 새 인정 고지가 함께 나올 수 있음(UV-12) · 새 입력 영향 없음 |
| X-15 | 근거 «철거ㆍ멸실» + 9호 동시 | 합집합 — 이중 계산 없음(K-8) · 보조 안내 M-10 |
| X-16 | 구 저장 세션: 사건 행 키 부재 | 종전과 byte-identical(③ 키 미생성) · 근거 demolished 선택 시에만 사실 칸 요구 |
| X-17 | 구 저장 세션: 꼬리 근거 demolished + 철거 행 없음 + 날짜 없음 | ⑧이 DD-T1로 막고 칸이 `required`로 보임(③이 채우지 않음 — 엔진 K-16f) |
| X-18 | 철거 행 날짜를 고쳐 사실 요건 세트가 바뀜(후보 과세기준일 경계 이동) | 요구 칸 재계산 · 숨은 값 보존 · 새로 요구되는 칸이 `""`이면 ⑧ 차단(UQ-11 (나) / 바닥면적은 항상) |

---

## 10. 기존 테스트 반전 규모 — grep 실측(전체 vitest 미실행 — UV-10)

| 단계 | 변경 | 영향(grep) | 반전 |
|---|---|---|---|
| E3f-1a | N-1 설명·hint 교체 · N-3 상수 뒤 한 문장 | `__tests__/components/nbl2611-d2-ptax-basis.anchor.test.tsx`(철거 근거 단언) · `…e3-1b-section-render.test.tsx` · `nbl-state-history-notices.test.ts`(고지 상수 직접 import — 자동 추종) · `nbl2611-d2-ptax-basis.anchor.test.ts` | 접두 일치 단언이면 0, 전문 단언이면 반전 — **Do 첫 단계에서 확정(확인 필요)** |
| E3f-1a | N-2 신규 | 추가만 · `nbl-state-history-section-render.test.tsx:71`(상시 고지 바이트) 보호 | 0 |
| E3f-1b | 꼬리 철거일 요구 + 직접 API 400 반전(엔진 v3 §6.1 목록) | `__tests__/calc/nbl2611-d2-ptax-basis-validate.anchor.test.ts` · `__tests__/api/nbl2611-d2-ptax-basis-route.anchor.test.ts` · `__tests__/components/nbl2611-d2-ptax-basis.anchor.test.tsx` · `nbl-state-history-gates.anchor` · `…-readers-render.test.tsx` · `e2-route.anchor:287` · `e2e/_helpers/validation-field-jump-cases-nbl.ts:180-181`(철거 근거 점프 시료 — **새 DD-T1이 먼저 터지면 점프 필드가 바뀐다 → 시료에 철거일/철거 행 보정**) · `e2e/transfer-nbl-house-prior-demolished.spec.ts` | 시료 보정 다수 — 엔진 V-6 |
| E3f-2 | `demolished` 제외 단언 반전(엔진 Q-10) | E3-1b 안전망 7개 파일(`nbl-state-history-e3-1b*.test.*` · `…leaf.test.ts` · `_helpers/nbl-state-history-e3-1b-table.ts` · `nbl-state-history-leaf.test.ts` · `nbl-state-history-e3-1b-client.anchor.test.ts` · `…-section-render.test.tsx` · `e2e/transfer-nbl-other-state-history-e3-1b.spec.ts:144`(«철거ㆍ멸실 근거는 나대지 구간에서 받지 않는다» toHaveCount(0) — **철거 행 뒤 구간만 반전, 철거 행 앞·신축 앞 구간은 유지**)) | **의도된 반전** — 공유 단언 반전 시 형제 안전망 소실 주의(`feedback_shared_assertion_reversal_erases_sibling_net`): 반전은 «철거 행 뒤 구간»에 한정하고 «철거 행 앞 구간 거부»를 새 단언으로 승계한다. `__tests__/lib`·`api`·`calc`·`components`·e2e 전수 필요 |

---

## 11. 테스트·E2E·mutation 계획 (Do — 이 세션 미실행)

### 11.1 vitest

- **E3f-1a**: N-2 렌더 격자(X-1~X-6) · N-1 연혁 문구(양도일 경계 4쌍: 2016-05-31/06-01 · 2019-05-31/06-01 · 2024-05-31/06-01 · 2026-05-31/06-01 — 문구가 엔진 `demolishedStatusNotice`와 `toBe`) · anchor: S22/S23 쌍을 `calculateTransferTax`로 고정(안내의 존재 이유 — 9호 유무가 세액을 가름).
- **E3f-1b**: 꼬리 칸 렌더(T1~T7) · ⑧ DD-T1·T2 · **⑫ route 관통**(`nblOtherDemolishedOn` 침묵 strip 방지 — 새 키가 엔진까지) · parity 격자(§7.1 전 행에서 ⑧ ≡ ⑫ 단언 — 엔진 K-16g) · ④ 덮어쓰기(stale 비전송).
- **E3f-2**: 사실 칸 노출 격자(B1~B14 — 후보 과세기준일 경계 ±1일: 철거일×닫는 행 날짜로 2019-06-01 · 2024-06-01 · 2026-06-01 걸침) · ④ `stateEventWireRow` 게이트(숨은 stale 비전송) · ⑧↔⑫ parity 전수 · route 관통(사실 4칸 침묵 strip 방지 — 엔진 K-1·K-2a/b·K-4·K-7·K-9·K-24·K-25 시료 재사용).

### 11.2 E2E — `e2e/transfer-nbl-other-state-history-e3-5.spec.ts` (sessionStorage 시드 + 화면 입력 — 선례 `transfer-nbl-other-state-history-e3-1b.spec.ts`)

| id | 단계 | 시나리오 | 확인 |
|---|---|---|---|
| E5-1 | 1a | 철거 행 입력 → `nbl-other-state-event-0-grace-nudge` 보임 → 「유예기간 추가」 9호 + 기산일 → 안내 숨음 → 계산 | 결과 카드 비사업용 → 사업용(S23 → S22 시료) |
| E5-2 | 1a | 근거 «철거ㆍ멸실» 선택 — 양도일 2026-05-31 vs 2026-06-01 | 설명 문구가 6개월 ↔ 1년으로 바뀐다 |
| E5-3 | 1b | 이력 `unchanged` + 근거 «철거ㆍ멸실» + 바닥면적 → 새 칸 보임 → 비우고 계산 → ⑧ 오류 + **필드 점프** → 날짜 입력 → 계산 → 철거 행으로 전환하면 새 칸 숨고 읽기 전용 줄 | **요청 body**: `waitForRequest`로 `nonBusinessLandRaw.nblOtherDemolishedOn` 보일 때 있음 · 숨김 때 없음(⑬·④ 덮어쓰기) |
| E5-4 | 1b | 철거 6년 전 + 근거(S18 시료 — 엔진 K-11a·K-12 계열) | 입력 시점 `nbl-other-demolished-expired-notice` · 결과 비사업용 + 접힘 사유 · 9호 추가 시 세액 불변(K-12) |
| E5-5 | 2 | 엔진 K-1 시료: 건물 → 철거 → 신축(닫는 행) 근거 «철거ㆍ멸실» + 허가 예 · 건축 외 아니오 · 바닥면적 → 미리보기 구간표 → 계산 | 요청 body `nblOtherStateEvents[1].demolishedPermitBefore` 도달 · 결과 사업용(K-1) · 사실 «모름»으로 바꾸면 비사업용 + 접힘 사유(K-4) |
| E5-6 | 2 | 엔진 K-7(주택 철거 행 + 구분 변경 행, 빈집 «예») · K-24 변형(빈집 «아니오» = 일반 기간 + 고지) | 사업용 · 일반 기간 · 고지 문구 = 엔진 상수 |
| E5-7 | 2 | ⑧ 차단 격자를 **화면 입력으로** 재현: 바닥면적 빈칸 · 허가·건축 외 용도·빈집정비 미선택(UQ-11 (나) 확정) — + 필드 점프(`nblOtherStateEvents.{i}.demolishedFloorAreaBefore` 등 앵커) | 오류 문구 = 엔진 leaf 문구 |
| E5-8 | 2 | **주택부수토지 카드**(Q-12): 주택 철거 → 신축(닫는 행) 근거 «철거ㆍ멸실» + 사실 3칸(바닥면적 칸 없음) → 계산 · 축 B 둘째 지분 카드 꼬리 «철거ㆍ멸실» → 자기 새 철거일 칸 필수(첫 카드 날짜 비복사) | 엔진 K-27·K-28 시료 · 요청 body 도달 확인 |

기존 필드 점프 격자(`validation-field-jump-cases-nbl.ts`)는 시드 폼으로 점프만 본다 — 위 E5-7은 **화면 입력으로 오류를 만들고 고치는 흐름**이라 중복이 아니다.

### 11.3 mutation 계획 (제품 코드 1줄 → 대응 anchor 실패 → 원복)

| # | 변이 | 잡는 anchor |
|---|---|---|
| MU-1 | N-2에서 `reasonCode === "demolition"` 부정 제거 | X-2 |
| MU-2 | N-2에서 `consumesGracePeriods` 게이트 제거 | X-4 |
| MU-3 | N-2에서 `historyIgnored`/`deemedBlocks` 게이트 제거 | X-5·X-6 |
| MU-4 | 꼬리 새 칸 노출 술어를 항상 true | T1 |
| MU-5 | ④ 덮어쓰기 제거(stale 전송) | E5-3 body · route anchor |
| MU-6 | DD-T1 제거 | T3 |
| MU-7 | ⑫ 요구에서 «철거 행이 날짜를 대면 불요» 조건 제거 | T1·T2(⑫ 400이 ⑧ 통과 입력에서 발생 — parity 불변식 위반) |
| MU-8 | `stateEventWireRow` 사실 칸 게이트 제거 | B7·B8 |
| MU-9 | 필요 칸 노출을 «항상 4칸»으로 | B4·B5·B6 |
| MU-10 | `nblStateHistoryIsRead` 게이트 제거(⑧ 또는 ⑫ 한쪽 · 또는 칸 노출) — 사실 4칸 전부 | B10·B11 · 엔진 K-10f·K-10g |
| MU-13 | 주택부수토지 카드에서 바닥면적 칸을 노출 | X-10 |
| MU-11 | 구분 변경 시 사실 칸 리셋 제거 | 렌더 anchor |
| MU-12 | 주택 행 빈집 «모름»을 접힘으로(Q-8 (나) 반전) | X-7 · 엔진 K-25 |

---

## 12. 사용자 결정 UQ-n — **전부 결정됨(2026-11-24) · 남은 미결 없음**

| UQ | 질문 | 결정 / 선택지 | 추천 | 상태 |
|---|---|---|---|---|
| UQ-1 | 엔진 모델 분기 | **사용자 결정 2026-11-24** = 엔진 Q-1 (다) + Q-3**(v1 추천 (나)는 Q-3로 흡수 · 구간 선언 근거 추가는 사용자가 더한 안) | — | ✅ |
| UQ-2 | 9호 부재 안내 | **(가) 조건부 amber 안내** 승인 | — | ✅ E3f-1a |
| UQ-3 | 꼬리 근거 hint 정정 | **(가)** 승인 | — | ✅ E3f-1a |
| UQ-4 | §103의2 사실 칸 | **Q-1 (다)·Q-7로 대체** — 사실 칸을 받는다(구간 선언 4칸 · 꼬리는 철거일만) | — | ✅ 대체 |
| UQ-5 | 취득 전 철거일 | **(가)** = 엔진 Q-3 (b) `nblOtherDemolishedOn` | — | ✅ E3f-1b |
| UQ-6 | 이력 «바뀐 적 없음» + 철거 근거 | **(가) 막지 않음 + 안내** 승인(철거일 새 칸이 사실을 받는다) | — | ✅ |
| UQ-7 | PR 분할 | **엔진 Q-10 (가)**로 승인 | — | ✅ §14 |
| **UQ-8** | **core 부분 면적일 때 바닥면적(구간 선언) 필수 요구** — 엔진이 사건 행을 읽지 않는데 ⑧·⑫가 숫자 칸을 막는 막다른 길(의제는 앞단 return이라 무관) | (가) **⑧·⑫ 모두 «읽음» 게이트를 건다** — ⑧은 `housePriorHistoryIgnoredOf` 선례 그대로, ⑫는 `buildNblEngineInput(raw)` + `otherLandAreaIsPartial`(try/catch — 실패·불가는 «읽는다»로 접음 = `non-business-land-request.ts:166-176` 선례 폴백) / (나) 엔진 v3 그대로 — 읽지 않아도 필수(칸 안내로 «이 경우 판정에 쓰이지 않음» 한 줄) / (다) 부분 면적일 때 ⑧만 면제하고 ⑫는 필수(비대칭 — parity 위반이라 비추천) | **(가)** | 「엔진이 안 읽는 칸 요구 금지」(E3-② 의제 결함 · E3-③ 후속 #3636) — 바닥면적은 «모름» 선택지가 없는 정량 칸이라 (나)는 지어낸 값을 강요한다. 비용: ⑫ 위치에서 엔진 core를 도는 서버측 동치 함수(엔진 요청 R-7) · 순환 import는 엔진 시니어가 판정. (가)가 어려우면 (나) + 안내 한 줄 | ✅ **사용자 결정 2026-11-24 = (가)**(바닥면적은 엔진이 읽을 때만 ⑧·⑫ 필수 → **엔진 v4가 게이트를 사실 칸 4개 전부로 확장 · 공용 함수 `nblStateHistoryIsRead(raw)` 명세 완료, D-2 ✅**) |
| **UQ-9** | 취득 전 철거로 **첫 구간이 나대지**인 구간 선언(철거 행 없음 — 엔진 V-15 v1 제외) | (가) **받지 않음 + 근거 hint에 «취득 전 철거는 9호 유예기간 또는 양도일 현재 칸의 철거일 입력» 안내** / (나) 닫는 행에 철거일 칸 추가 | **(가)** | 엔진 V-15와 정합(v1 제외) · W-9는 9호(기산일 = 철거일)로 같은 구간이 덮이고 새 칸은 ⑫ 필드 +1·출처 술어 확대 — 효과 대비 비용 큼. 엔진이 후속에서 열면 UI는 `eventOffersDemolished` 확장만 따라간다 | ✅ **사용자 결정 2026-11-24 = (가)** |
| **UQ-10** | 근거 «철거ㆍ멸실» 선택 시 **인정 창·접힘 미리보기 줄**(§4.3 ⑥)을 ⑤에 보일지 | (가) **보임**(엔진 leaf 결과 표시 전용) / (나) 결과 카드만 | **(가)** | 입력 시점 피드백이 M-9(선언했는데 접힘) 해소 · UI 계산 0이라 판정 중복 없음 · 결과 카드 echo와 같은 상수를 읽는다 | ✅ **사용자 결정 2026-11-24 = (가)** |
| **UQ-11** | **3지선다 사실 칸(허가 · 건축 외 용도 · 빈집정비)의 «미선택(`""`)»을 ⑧·⑫로 막을지**(엔진 v3 Q-11과 같은 질문 — 사용자 결정 문언 «시행본별 사실 칸 빈칸은 ⑧ 차단 + ⑫ 400»과 엔진 v3 해석이 갈린다) | (가) 차단 없음 — 미선택 = 모름 = 접힘 + 확인 필요(엔진 v3 추천 · 빈집정비는 일반 기간으로) / (나) **노출된 3지선다 미선택은 ⑧ 차단 + ⑫ 400**(사용자 결정 문언) | **(나)** | 프로젝트 규칙 «미입력은 검증 단계에서 명확한 오류로 차단»(루트 CLAUDE.md)과 사용자 결정 문언에 부합. «모름» 선택지가 화면에 명시돼 있어 막다른 길이 아니고(고르면 통과), 미선택이 조용히 «혜택 불성립»이 되는 것보다 «답을 요구»하는 편이 M-9(선언했는데 접힘 이유를 모름)를 줄인다. 비용: ⑫ 격자 3칸 증가·구 세션 더 많이 막힘(엔진 §6.1 지적). UI 설계는 두 경우 모두 격자를 갖는다(§7.2) — **엔진 v3의 Q-11 (가)와 어긋나므로 사용자 확인 필요** | ✅ **사용자 결정 2026-11-24 = (나)**(3지선다 미선택도 ⑧ 차단 + ⑫ 400 · 명시 «모름»은 허용 — 혜택 불성립 + 확인 필요) → D-1 해소 |
| **UQ-12** | 주택부수토지 카드(variant housing)에서도 근거 «철거ㆍ멸실»·사실 칸을 열 것인가(= 엔진 Q-12) | (가) **연다**(사실 3칸 — 바닥면적 칸 없음) / (나) 기타토지 카드에서만 | **(가)** | 같은 `eventClosesBareInterval` 술어가 이미 주택 카드에서 참 · 빈집 3년 셀의 본거지가 주택 철거 뒤 구간 | ✅ **사용자 결정 2026-11-24 = (가)** |

---

## 13. 미검증 UV-n

| UV | 항목 | 상태 |
|---|---|---|
| UV-1 | §1.2는 엔진 직접 경로(Zod·route 미경유) — 직접 API가 같은 결과인지 | 확인 필요(E3f-1b·2 route 관통 anchor가 고정) |
| UV-2 | 법 «과세기준일 현재 지위» ↔ 일 단위 창은 **납세자 유리 상한 근사**(엔진 V-14) · 경계 정의는 엔진 소관 · 6.1. 접기 아님 | 엔진 소관 |
| UV-3 | 구 저장 세션이 계산 직전 ⑧에 걸려도 사용자가 원인을 알 수 있는 문구(DD-T1·B2)가 충분한가 | E3f-1b Do 단계 화면 확인 |
| UV-4 | 이력 `changed` + 철거 행 없음(구분 변경 행만) + 꼬리 근거 «철거ㆍ멸실» | 미실측 — 확인 필요(`demolishedOnRequired` 참 → 새 칸일 것 — 엔진 v3 K-16d 계열) |
| UV-5 | 철거 행 «주택» 종류와 `eventOffersDemolished`의 상호작용(E3-③ B `closesHouse`) 렌더 | 미실측 — 확인 필요 |
| UV-6 | 빈집 3년의 고유 효과(2024-06-01~2025-03-20 셀) | 엔진 §3.3 오라클 인용 — 재측정 안 함 |
| UV-7 | 결과 카드·인쇄 echo(인정 창) 렌더 | 미렌더 — E2E에서 확인 |
| UV-8 | ⑥ `computeTransferSummary`에 NBL 참조 없음 | E3-1b UI §0 인용 · 재확인 안 함 |
| UV-9 | N-2는 9호 행 기산일이 철거일과 다른 경우를 못 잡는다(부재 여부만) | 허용 한계인지 확인 필요 |
| UV-10 | vitest 전체 회귀·tsc·E2E 미실행(코드 변경 0) | 미수행 |
| UV-11 | 법령 본문 | ✅ 지령 §103의2(MST 290815 시행 2026-10-01) · 규칙 §83의5①9호(MST 286379) 조회 · 연혁 6건은 엔진 §1.2 |
| UV-12 | 13호(E3-④) + 나대지 구간 «철거ㆍ멸실» 동시 선택 시 고지 조합(13호 한정 변형 + 새 인정 고지) 렌더 | 미실측 — 확인 필요 |
| UV-13 | 축 B 둘째 이후 지분 카드의 꼬리 철거일 출처 | ✅ **해소 — 자기 새 철거일 칸 필수·복사 없음**(엔진 v4 D-6·K-28). 카드별 raw 판정 |
| UV-14 | 주택부수토지 카드에 같은 선택지가 열리는가 | ✅ **해소 — Q-12 (가) 연다**(엔진 v4 K-27). 남은 확인: 주택 카드의 «읽음» 분기(`applyHousingStateHistory` 무시 조건 — 엔진 V-26 정독 대기) |
| UV-15 | 엔진 §5.2-1 «취득 전 철거 첫 구간 제외»가 철거 행 앞 모든 구간에서 `eventOffersDemolished` 거짓인지(철거 행 전에 신축이 있는 이력 포함) | 엔진 leaf 단위 anchor 필요 |

---

## 14. PR 분할 (엔진 PR마다 UI PR — 엔진 Q-10 (가))

| 엔진 PR | UI PR | UI 범위 | 파일 |
|---|---|---|---|
| E3f-0 (테스트만) | — | UI 반전 예고만(§10) | — |
| E3f-1a (고지 연혁화 · 입력 0) | **U-1** | N-1 · N-2 · N-3(임시) · E5-1·2 · 렌더 anchor | `OtherLandPropertyTaxBasisField.tsx` · `OtherLandStateHistorySection.tsx` · `OtherLandBareIntervalFields.tsx` · `OtherLandDetailSection.tsx`(prop 1) |
| E3f-1b (leaf + 꼬리 한도 + 새 칸) | **U-2** | §4.2 · ①②③④⑧ · E5-3·4 · parity 격자(꼬리) | store 3 · `non-business-land-request.ts` · validate 1 · 근거 필드 |
| E3f-2 (나대지 구간 근거 + 사실 4칸) | **U-3** | §4.3 · ①③④⑦⑧ · 반전 7파일 · E5-5~7 · parity 격자(구간) · UQ-8 결정 반영 | `OtherLandBareIntervalFields.tsx` · 신규 `OtherLandDemolishedFactsField.tsx` · scope · `NblStateHistoryPeriodTable.tsx` · state-history validate |

UI PR은 엔진 PR 머지 직후(엔진 → UI 시퀀셜). 공유 단언 반전(E3f-2)은 «철거 행 앞 구간 거부» 신규 단언을 먼저 추가한 뒤 반전한다.

---

## 15. 재제안 금지·기결정 준수

과세기준일(6.1.) 접기 — 어떤 형태로도 올리지 않음(§7·§4는 엔진의 «존재 검사»·«충분조건»을 표시만 한다) · V5-G2 · Q-8 (가)(겸용 상가분) · Q-3a (나) · 자동 안분(Q-9 접기, UQ-9 (나) 철거일 취득일 간주 기각) · `useEffect → store` 미러링(모든 파생은 렌더 계산 · 쓰기는 onChange — 구분 변경 시 사실 칸 리셋도 핸들러) · native 토글(사실 칸 = RadioCardGroup · 철거일 = 공용 DateInput · 바닥면적 = DecimalInput) · placeholder 숫자 예시(hint는 형식 설명) · 부분 면적 이력 접힘(확정 결정) · E3-1b Q-2 «분리»는 사용자 결정으로 **번복**(Q-1 (다)) — 이 문서는 번복 이후만 서술.

---

## 16. 엔진 계획서 정합 기록 (v3 정합 · 2026-11-24)

### 16.1 UI가 엔진에 요청하는 인터페이스 — v3에서 해소된 것 / 남은 것

| # | 요청 | v3 상태 |
|---|---|---|
| R-1 | `eventOffersDemolished` · `demolishedRequiredFacts` · `demolishedStatusWindow` · 접힘 사유 한국어 표 · 인정 고지 상수 | ✅ 엔진 §5.1~5.8이 정의(UI는 읽기만) |
| R-2 | 꼬리 철거일 출처·요구 술어 | ✅ `demolishedOnRequired`(구조 술어) · R-2′ ✅ **`removalDateFor`·`tailRemovalDateOf` export**(v4 D-3) |
| R-3 | ⑧·⑫ 공용 결함 함수 확장 + 상태 고지 문구 교체 | ✅ **`demolishedInputIssue`**(= `demolishedBasisIssue` 확장, `part:"demolishedOn"`, 같은 문구) · `NBL_PTAX_DEMOLISHED_STATUS_NOTICE` → `demolishedStatusNotice(transferDate)` |
| R-4 | 구간 사실 칸 요구 leaf | ✅ 바닥면적은 **`demolishedRowFloorAreaRequired(index)`**(§6.1) · 3지선다는 `demolishedRequiredFacts`가 노출을 정함 — 미선택 차단은 **UQ-11 (나) 결정**으로 엔진 v4가 반영 예정 |
| R-5 | `demolishedStatusNotice(undefined)` 처리 | ✅ v4 D-5 — «시행본 연혁» 한 줄 변형(K-30 · 단일 시행본 단정 없음) |
| R-6 | 결과 echo(꼬리 철거일·한도 결과 · 구간 `temporaryStatusWindow` · 사유) | ✅ §6 ⑦(꼬리 echo 필드명은 구현 PR) |
| R-7 | ⑫ 서버측 «엔진이 사건 행을 읽는가» 술어 | ✅ v4 D-2 — `otherLandStateHistoryIsRead(input, rules)` export + `nblStateHistoryIsRead(raw)`(⑧·⑫ 공유) |
| R-8 | 축 B 번들 꼬리 철거일 | ✅ v4 D-6 — 둘째 카드는 자기 칸(K-28) |
| R-9 | 주택부수토지 카드 적용 | ✅ v4 Q-12 (가) — 연다(K-27) · 남은 확인 V-26 |

### 16.2 엔진 계획서 v3와 어긋나는 곳 (엔진 v4·메인 세션이 합칠 것)

| # | 엔진 v3 | UI v2 | 영향 · 요청 |
|---|---|---|---|
| D-1 ✅ | Q-11 (가) 추천 | **사용자 결정 UQ-11 (나)** | **해소 — 엔진 v4가 Q-11 (나)로 반영**(§0.1 · K-10d) |
| D-2 ✅ | 부분 면적 게이트 부재 | UQ-8 (가) | **해소 — v4 §6.2 D-2: `otherLandStateHistoryIsRead`/`nblStateHistoryIsRead(raw)` · 게이트는 사실 칸 4개 전부로 확장(UI §7.2·B10·B11 반영)** |
| D-3 ✅ | 철거 행 날짜 getter export 없음 | | **해소 — v4 `removalDateFor`·`tailRemovalDateOf`** |
| D-4 ✅ | 엔진 V-17(⑬ prefix-pick 확인 필요) | **해소** — `non-business-land-request.ts:193-196`이 `nbl*` prefix-pick → 새 칸 자동 통과. 단 **저장된 stale 값도 실린다** → ④가 `householdHouseWireFields`(`:150-160`) 선례처럼 덮어써야 한다(§6.2 ④) | **해소 — v4 D-4: ④ 덮어쓰기 + ⑭ 술어 무시(K-29)** |
| D-5 ✅ | `demolishedStatusNotice(undefined)` 미정의 | | **해소 — v4 연혁 한 줄 변형** |
| D-6 ✅ | 주택부수토지 카드·축 B 미서술 | | **해소 — v4 Q-12 (가)(사실 3칸) + 축 B 둘째 카드 자기 칸(K-28)** · 남은 확인 V-26 |
| D-7 | 엔진 K-7·K-24·K-25 시료는 «주택 철거 행» — E2E에서 재사용하려면 **정착면적·수도권 칸까지 입력해야 한다**(E3-③ B `housePriorFootprintIssue` · `housePriorNeedsMetropolitan`) | E5-6 시드에 정착면적·수도권 포함 | UI E2E 설계에 반영(엔진 문서에는 영향 없음) |
| D-8 | 꼬리 새 칸 이름 | UI v1 `nblOtherDemolishedDate` → **엔진 `nblOtherDemolishedOn`으로 정정**(이 문서 전체) | 없음 |

사용자 결정(Q-1 (다) · Q-2~Q-12 · UI UQ-2·3·5·6·7·8·9·10·11·12 · UQ-4 대체)과 엔진 v4 사이에 **미해소 차이는 없다**(D-1~D-6 ✅ — D-4 확인·D-7 UI E2E 시드·D-8 이름 정정은 UI 쪽 정리). **남은 확인 2건**: 엔진 V-26(주택 카드 «읽음» 분기 정독)·V-27(기본 규칙으로 도는 한계) — 구현 PR에서 확정.

### 16.3 자가 검토 (1회)

| # | 점검 | 결과 |
|---|---|---|
| 1 | UI 자체 법 판정 금지 | N-2는 저장값 존재 + 엔진 게이트, 사실 칸 노출은 `demolishedRequiredFacts`, 접힘은 엔진 사유 표 — UI 비교식 0 |
| 2 | ⑧↔⑫ parity | §7 격자 — ⑧ ≡ ⑫ · UQ-8·UQ-11 사용자 결정 반영(미결 없음) |
| 3 | 3대 정책 | `useEffect→store` 0 · 자동 안분 0(바닥면적 초과 = 접기 · 철거일 취득일 간주 기각) · 3중 패턴(⑤ 표시 = ④ 전송 = ⑧⑫ 요구 = ⑭ 매핑이 같은 엔진 술어) |
| 4 | 6.1. 접기 재제안 | 없음 — 엔진 Q-4/Q-6의 요건 검사를 표시만 |
| 5 | placeholder 숫자 | 없음(법정 기간 «1년·3년·6개월»은 법문 사실로만) |
| 6 | 파일 800줄 | §6.3 말미 — 전부 ≤ 700 |
| 7 | 편집 사고 | 문서 갱신 중 중간 구간(§7.2 끝~§12 UQ-7)을 잘못된 문자열 매칭으로 삭제했다가 원문 재삽입으로 복구 — §8~§12는 복원본이므로 번호·교차 참조를 재독 확인 |

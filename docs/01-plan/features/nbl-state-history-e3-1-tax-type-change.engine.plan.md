# 기타토지 상태 이력 E3-① 「재산세 구분 변경 사건」 — 엔진·판정·API(⑨~⑭) 측 계획

> 상태: **Plan v1 (2026-11-23) · 코드 변경 0(계획서만)** — probe 파일은 실측 후 삭제했고 `git status` 클린을 확인했다.
> base: `origin/master` 84657955e · 워크트리 `Property-related-Taxes-nbl-e3-1` · 정본 계획서: `nbl-other-land-state-history.plan.md`(통합 v3.2 §4 E3 ①·Q-4·Q-9) · `…engine.plan.md`(§2.1 · §3.5 · §3.6 · §6 M12 · V-6 · §8.2)
> 짝 문서: `nbl-state-history-e3-1-tax-type-change.ui.plan.md`(UI 시니어 — 이 문서는 건드리지 않는다)
> **번호 규칙**: 이 문서의 사용자 결정은 `Q-n`, 미검증은 `V-n`(E3-① 로컬 번호 — 합칠 때 `E3-Q-n`·`E3-V-n`으로 재번호). UI 문서는 `UQ-n`·`UV-n`.
> **검증 표기**: 「확인」= 이 세션에서 파일·MCP 본문을 직접 읽음 / 「실측」= throwaway probe(삭제) 수치 / 「확인 필요」= 읽지 못함.
> 약칭: 법 = 「소득세법」, 영 = 「소득세법 시행령」, 지법 = 「지방세법」, 지령 = 「지방세법 시행령」. 금액은 `makeMockRates` · 잡종지 1,000㎡ · 양도 10억 · 취득 3억 · 2014-01-01→2024-01-01(소유 3,651일) 기준이라 **차이의 유무·방향·규모만 유효**하다.

---

## 0. 한눈에

| 항목 | 결론 |
|---|---|
| 문제 | 건축물 유무가 **그대로**인데 재산세 구분이 소유기간 중 바뀐 토지(별도합산 → 종합합산, 종합합산 → 별도합산 등)는, 판정이 «양도일 현재 구분»을 소유기간 전체에 적용해 **한쪽으로 틀린다**. 실측: 별도합산 → 종합합산 2022-06-01 = 현행 비사업용 253,960,000 → 구간 판정 사업용 198,210,000(−55,750,000) / 종합합산 → 별도합산 2023-06-01 = 현행 사업용 198,210,000 → 비사업용 253,960,000(+55,750,000). 철거 사건의 `propertyTaxTypeBefore` 한 칸으로는 **철거와 무관한 변경을 말할 수 없다**. |
| 법 근거 | 법 §104의3①4호 가·나목 «재산세가 … 비과세·면제되는 토지 / 별도합산·분리과세대상이 되는 토지» + 영 §168의6 «기간의 계산은 일수로» → 날마다 구분이 다르면 날마다 판정(§1). 국세청 «별도합산 또는 분리과세대상인 기간동안은 제외»(서면4팀-3604 · 재산세과-4159 · 부동산거래관리과-476) + «양도당시만이 아니라 소유기간 중»(사전-2023-법규법인-0817, 법인세법 사안). |
| 추천 모델 | **(A) 새 사건 종류 `tax_type_changed`를 같은 사건 배열에 추가** — 의미는 기존 철거 사건과 같은 «**Before 사슬**»: 사건 행의 `propertyTaxTypeBefore` = **그 사건이 닫는 구간의 재산세 구분**, 양도일 현재(꼬리) 구분은 기존 입력. ⑫ Zod 변경 0 · ⑬ 무변경 · ⑭ 운반 조건 1곳 · leaf 3함수 수정 · 이력 없음·기존 저장 사건은 **바이트 동일**(§3). |
| V-6 | **열지 않는다(추천)** — 건축물 없는 구간에는 구분 변경 사건을 둘 수 없게 ⑧·⑫가 차단한다. 열려면 구간별 «근거»(공지상태 영 §101③ 17종·호별 면적한도)가 필요해 V1-A 규칙과 충돌하고 다목(영 §168의11 호별) 축과 겹친다 → E3 ②(업종·호별)와 묶어 결정(§4 · Q-2). |
| 세액 | 변하는 경로 = `changed` + 구분 변경 사건 + 양도일 의제 없음 + 전량 사업용/비사업용. 매트릭스(§5) 실측: 과대 해소 −55,750,000(T1·T4a·T5·T6) · 과소 해소 +55,750,000(T2·T3b·T12b·T15) · 단기보유 −47,760,000(T10) · 축 B 지분 −64,150,000(T11). |
| 착수 차단 | **V-1**(tax-only 이력의 초기 건축물 상태 = UI 토글 노출·⑧⑫ `tailHasBuilding` 인자 — UI 계획서와 합의) · Q-1~Q-6 결정(§8). |
| PR | **E3-0** Pre-Do anchor(테스트만) → **E3-1a** 엔진·⑫·⑭·고지 → (UI U-E3-1 시퀀셜) → E2E. |

---

## 1. 법령 근거와 «건축물 유무 불변인데 재산세 구분이 바뀌는» 사유

### 1.1 확인한 본문 (KoreanLaw MCP, 2026-11-23 조회 · 현행)

| 대상 | MST | 확인한 것 |
|---|---|---|
| 법 §104의3 | 280405 | ① 각 호 외의 부분 «해당 토지를 소유하는 기간 중 대통령령으로 정하는 기간 동안» · ①4호 «농지, 임야 및 목장용지 외의 토지 중 다음 각 목을 제외한 토지» 가목 «「지방세법」 또는 관계 법률에 따라 재산세가 비과세되거나 면제되는 토지» · 나목 «「지방세법」 제106조제1항제2호 및 제3호에 따른 재산세 별도합산과세대상 또는 분리과세대상이 되는 토지» · 다목(대통령령) |
| 영 §168의6 | 290841 | «이 경우 기간의 계산은 일수로 한다» · 1~3호 소유기간 버킷별 가·나·다 AND |
| 지법 §106① | 282559 | 1호 종합합산 «과세기준일 현재 … 별도합산과세대상 또는 분리과세대상이 되는 토지를 제외한 토지» · 2호 별도합산(가 건축물 부속토지 · 나 공지상태 · 다 철거·멸실 부속토지) · 3호 분리과세(가 공장용지·전·답·과수원·목장용지 … 아 그 밖) — **전부 «과세기준일 현재»**. §106③ 사실상 현황 원칙(+ 공부상 등재현황 예외) |
| 지령 §101 | 290815 | ① 건축물 부속토지 — **단서: 허가 등을 받아야 할 건축물로서 허가 등을 받지 아니한 건축물 · 사용승인(임시사용승인 포함)을 받지 아니하고 사용 중인 건축물의 부속토지는 제외** · 1호 공장용(시지역 등·공장입지기준면적×배율) · 2호나목 건축물 시가표준액이 부속토지 시가표준액의 100분의 2 미달 → 바닥면적 제외분 · ② 배율표 · ③ 공지상태 17종 |
| 지령 §102 | 같음 | ① 분리과세 1호 공장용지(읍·면·산업단지·공업지역) · 2호 전·답·과수원 · 3호 목장용지 · ③ 고급오락장 · ⑤~⑧ 개발사업·기반시설·특정목적 사업용(⑦ «취득일로부터 5년이 지난 토지로서 … 착공하지 않은 토지는 제외» 등 **기간이 걸린 요건**) |
| 지령 §103 | 같음 | ① 건축물 범위에 건축허가 후 착공 제한(2호) · 건축허가·신고 후 공사 착수(3호) 포함, **«과세기준일 현재 정당한 사유 없이 6개월 이상 공사가 중단된 경우는 제외»** |
| 지령 §103의2 | 같음 | 철거·멸실된 날부터 **1년**이 지나지 않은 부속토지(건축 외 용도 제외) — 철거 후 한시 지위(E3 ⑤, 이 계획 범위 밖) |
| 영 §168의11 | 290841 | 다목 호별(1~14호)·②③ 수입금액비율 — **이번 세션 재열람 안 함, 기존 계획서(engine.plan §1.2) 확인분 인용** |

### 1.2 해석례·재결례 (본문 열람)

| 건 | 요지 | 이 계획에서의 쓰임 |
|---|---|---|
| 서면인터넷방문상담4팀-3604(2007.12.21.) | «별도합산 또는 분리과세대상인 **기간동안은** 비사업용토지에서 제외»(차고지 별도합산) — 구 지방세법 §182 시대 번호 | 기간별 판정의 직접 근거(별도합산 → 구분 변경 후 기간은 따로 센다) |
| 재산세과-4159(2008.12.9.) | 공장용지의 소유기간 중 **분리과세대상에 해당하는 기간동안은 사업에 사용한 토지로 보아** 영 §168의6 기간기준 적용. 부속 인용: 건축물 부속토지 별도합산 기간은 사업 사용 기간이나 **종합합산 토지는 그러하지 아니함** | 분리과세 → 종합합산 전환(T5)의 근거 |
| 부동산거래관리과-476(2010.3.26.) | 별도합산·분리과세대상 토지의 사용기간은 사업에 사용된 토지의 보유기간 | 같음 |
| 서면인터넷방문상담4팀-2235(2007.7.23.) | 재산세 **종합합산**되는 무허가건물 공장용지는 비사업용(별도합산에서 제외되는 무허가 건축물 부속토지) · 해당 여부는 사실판단 | 사유 R1(허가·사용승인 전후) |
| 사전-2023-법규법인-0817(2023.12.13.) | 비사업용 판정은 «양도 당시의 현황만이 아니라 소유기간 중 … 기간 동안»(사실관계: 2021·2022 별도합산, 2023 종합합산). **법인세법 §55의2②4호·영 §92의3 사안 — 소득세법 직접 해석이 아니라 같은 구조의 준용 근거** | M12(T1)의 «양도당시 구분이 종합합산이어도 소유기간 중 별도합산 기간은 센다» — 본문은 요지·회신만 열람(중략본) |

> 6.1. 단위·일 단위 어느 쪽도 이 건들이 직접 말하지 않는다 — V-1(통합 v3 일 단위 재결정)을 따른다. 변경일을 «사유 발생일»로 볼지 «다음 과세기준일»로 볼지는 **해석례 미확보**(V-2).

### 1.3 사유 열거와 이 모델로의 표현 가능성

| # | 건축물 유무 불변인 구분 변경 사유 | 근거 | 구분 변경 | 표현 |
|---|---|---|---|---|
| R1 | 건축물 허가·사용승인(임시사용승인 포함) 취득 전후 — 무허가·미승인 건축물의 부속토지는 별도합산 제외 | 지령 §101①단서 · 서면4팀-2235 | 종합합산 ↔ 별도합산 | **가능**(T2) |
| R2 | 공장용 건축물 → 일반 건축물(용도 변경)·그 반대, 공장 소재지 분류(읍·면·산업단지·공업지역 vs 시지역) 변경 | 지령 §101①1호 · §102①1호 | 분리과세 ↔ 별도합산·종합합산 | **가능**(T5). 공장입지기준면적 초과분은 면적 안분 → 부분 면적 경로(Q-8) |
| R3 | 분리과세 요건 상실 — 개발사업용 토지의 기간 경과(취득 5년 후 미착공 · 산업단지 준공인가 후 5년 등), 골프장·고급오락장 해당·해제 | 지령 §102③·⑤~⑧ | 분리과세 ↔ 종합합산 | **가능**(T5) |
| R4 | 비과세·면제 요건 변동 — 공공용 사용 등으로 비과세 → 사용 변경 | 법 §104의3①4호가목 · 지법 §109(확인 필요 — 이번 세션 §109 본문 미열람) | 비과세·면제 ↔ 그 밖 | **가능**. 「면제」에 지방세특례제한법 감면이 드는지는 **확인 필요**(V-3) |
| R5 | 정당한 사유 없는 6개월 이상 공사 중단 — 건축물에서 제외(과세기준일 현재) | 지령 §103①3호 단서 | 별도합산 → 종합합산 | **가능**(변경일 정의가 «과세기준일 현재» 판정이라 V-2 민감) |
| R6 | 건축물 시가표준액이 부속토지 시가표준액의 2% 미달·회복 | 지령 §101②2호나목 | 면적 일부 종합합산 | **불가** — 면적 안분이라 부분 면적 경로(통합 Q-8 · 이력 미반영 + 고지) |
| R7 | 증축·일부 철거로 바닥면적·배율 초과분 변동, 용도지역 변경으로 배율 변동 | 지령 §101②·§103의2 | 면적 일부 | **불가**(R6과 같음) |
| R8 | 공지상태 별도합산(차고용·보세창고·체육시설 등 지령 §101③ 17종)의 요건 개시·상실 | 지령 §101③ | 별도합산 ↔ 종합합산 | **건축물 없는 구간이면 불가**(V-6 — §4) · 건축물 있는 구간이면 다목 호별 축(E3 ②) |
| R9 | 철거 후 1년 경과로 별도합산 → 종합합산 | 지령 §103의2①1호 | 별도합산 → 종합합산 | **불가**(건축물 없는 구간 — E3 ⑤ 한시 지위. 규칙 §83의5①9호 유예 행이 대부분을 이미 덮는다) |

R1·R2·R3·R4·R5가 이 PR 범위다. R6·R7은 부분 면적(통합 Q-8), R8·R9는 건축물 없는 구간(§4)이라 범위 밖이며 **고지로 한계를 알린다**.

---

## 2. 현행 사실 (file:line 확인)

| 위치 | 사실 |
|---|---|
| `lib/tax-engine/non-business-land/land-usage.types.ts:308` | `StateEventKind = "building_built" \| "building_removed"` · `:317-321` `StateEvent { kind; date; propertyTaxTypeBefore? }` · `:327-332` `LandStateInterval { start; end; hasBuilding; propertyTaxType }` |
| `other-land-state-history.ts:41-62` | 라벨 표 `STATE_EVENT_KIND_LABEL`(`satisfies Record<StateEventKind,string>`) · `isEventKind` |
| 같은 파일 `:108-132` | `stateEventSequenceIssue` — 0건·행 결함·**앞 사건 대비** 역순·같은 날·하한일·양도일·**앞 사건과 같은 종류 연속**(`:125-129`) |
| 같은 파일 `:137-148` | `hasBuildingAtTransfer` = **마지막 사건**이 `building_built`인가 · `effectiveOtherHasBuilding` = `changed`이면 그 값, 사건 없으면 `?? raw` |
| 같은 파일 `:175-215` | `deriveOtherLandStateIntervals` — `:197-202` 사건마다 구간: 신축으로 닫히는 구간 = 나대지·**`"comprehensive"` 고정**(V-6 닫힘) / 철거로 닫히는 구간 = 건축물 있음 + 그 사건의 `propertyTaxTypeBefore`(`""`→`"unknown"`) · `:202` 꼬리 = `hasBuildingAtTransfer(events) ?? tail.hasBuilding` + 입력 구분 |
| 같은 파일 `:231-233` | `isStateIntervalBusiness` = `hasBuilding ∧ type ∈ {exempt, special_sum, separate}` — **E3-① 무변경으로 충분**(건축물 있는 구간의 구분이 사건으로 더 나뉠 뿐) |
| `other-land-state-history-apply.ts:117-120` | `applyStateHistory`가 같은 leaf를 부름 → leaf만 확장하면 판정·echo가 자동으로 따라온다 · `:148` 「모름」 구간 고지 |
| `lib/tax-engine/non-business-land/form-mapper-helpers.ts:305-318` | ⑭ `buildLandStateHistory` — `:315` **`kind === "building_removed"`일 때만** `propertyTaxTypeBefore` 운반 |
| `lib/api/transfer-tax-schema-nbl.ts:56-60` | ⑫ 사건 행 `{ kind: z.string(), date: z.string(), propertyTaxTypeBefore: enum \| "" optional }` — **이미 모든 종류 행에 Before 허용** · `:180-181` 모드·사건 optional |
| `lib/api/transfer-tax-schema-nbl-refines.ts:104-107` · `:204` | ⑫ refine이 `stateEventSequenceIssue`를 하한 없이 호출 · `effectiveOtherHasBuilding` 같은 함수 |
| `lib/api/transfer-tax-schema-companion.ts:283` | 컴패니언도 `nonBusinessLandRawSchema` 재사용 → ⑫ 한 곳 |
| `kind === "building_removed"` 분기 **4곳** | `form-mapper-helpers.ts:315` · `lib/calc/nbl-other-state-history-preview.ts:57` · `lib/calc/nbl-other-state-history-scope.ts:63`(④ 와이어 정규화) · `lib/stores/calc-wizard-asset-migrate-nbl.ts:49`(복원 정규화) — **새 종류의 Before를 침묵 `""`로 지우는 4곳**(§6 grep 게이트) |

---

## 3. 모델 설계안 3(+1)개 비교와 추천

### 3.1 공통 의미론 — «Before 사슬»

사건 목록은 날짜 엄격 증가 순이고, **각 사건은 직전 사건(또는 소유 첫날)부터 그 사건까지의 구간을 닫는다.** 그 구간의 재산세 구분은 **그 구간을 닫는 사건이 말한다**(`propertyTaxTypeBefore`). 마지막 구간(꼬리)은 사건이 아니라 기존 입력(`nblOtherPropertyTaxType`)이 말한다. 철거 사건이 이미 이렇게 동작한다(`:197-202`).

→ 꼬리 구분을 사건에 **다시 적지 않는다**(중복 입력·꼬리와 마지막 사건의 After가 어긋나는 모순 구조가 없다). 신축 사건으로 닫히는 구간(= 나대지)은 Before 칸이 없다(V-6 닫힘).

### 3.2 안 비교

| 기준 | **(A) 새 사건 종류 `tax_type_changed`(추천)** | (A2) 같은 의미의 **별도 배열** `nblOtherTaxTypeChanges[{date, propertyTaxTypeBefore}]` | (B) 기존 사건 행에 «이후 구분» 필드 | (C) 재산세 구분 **구간 직접 입력** `[{start,end,type}]` |
|---|---|---|---|---|
| 표현력(M12: 건축물 사건 0건) | ✔ | ✔ | ✘ — 건축물 사건이 없으면 붙일 행이 없다. 신축·철거 시점에 구분이 같이 바뀌는 경우만 | ✔ |
| ⑫ Zod | **무변경**(`kind: z.string()` · Before enum 이미 있음 `:56-60`) | **신규 필드**(침묵 strip 위험 — 주석 `:208-211` 계열) | 행 필드 추가 | 신규 배열 + 겹침·공백 검증 8종 |
| ⑫ refine · ⑧ | `stateEventSequenceIssue` 규칙 확장(§3.4) — 같은 leaf | 별도 leaf + 두 배열의 교차 규칙 | 행 규칙 | 구간 8종 + 취득·양도일 재입력 |
| ⑭ 매퍼 | Before 운반 조건 `:315` 1곳 | 신규 변환 + 병합 | 조건 변경 | 신규 변환 |
| leaf 파생 | `derive` 한 번(사건 타임라인이 이미 병합) | 두 배열 병합 정렬(같은 날 교차 충돌 규칙 추가) | derive 수정 | derive 대신 구간 겹침 해소 |
| 순서 규칙 | 날짜 엄격 증가 **전 종류 공통**(기존) · 교대는 **건축물 사건끼리만** | 배열마다 따로 + 교차 | 기존 | 구간끼리 |
| `hasBuildingAtTransfer` | **마지막 «건축물 사건»**으로 한정(§3.5) — 사건 없으면 `undefined` → raw | 무변경 | 무변경 | 무변경 |
| 하위호환(저장된 구 이력) | 건축물 사건만 있는 목록은 **바이트 동일**(§3.6) | 무변경(새 필드 없으면 같다) | 새 필드 없으면 같다 | 같다 |
| 축 B 지분 replay | 사건 클립 규칙 그대로(구분 사건도 소유 첫날 상태로 접힘) | 같음 + 병합 | 같음 | 구간별 클립 규칙 신규 |
| echo | 변경 없음(`StateHistoryIntervalEcho` 필드 그대로) | 같음 | 같음 | 같음 |
| 입력 부담 | 행 1줄(종류·날짜·바뀌기 직전 구분) | 같음(별 목록) | 행에 칸 1개 | 구간 3칸 + 중복 입력 |
| UI 친화 | 한 표(사건 목록) — 사건 구간표와 1:1 | 질문이 둘(건축물 / 재산세 구분) — **질문 분리는 자연스럽다** | 가장 간단하나 표현력 부족 | 가장 무겁다 |

**추천 (A)**: ⑫ Zod가 이미 허용하는 칸으로 새 종류를 얹고, 사건 타임라인이 하나라 같은 날·순서 규칙이 하나다. **(A2)는 UI가 «질문 분리»를 강하게 원할 때의 대안**이다(엔진 비용 = ⑫ 필드 1 · ⑭ 변환 1 · 병합 leaf · 같은 날 교차 규칙) — Q-1. (B)는 M12를 못 담아 기각, (C)는 취득·양도일 재입력과 겹침 검증이 엔진 계획서 §3.2에서 이미 기각한 구조다.

### 3.3 타입·데이터

```ts
// land-usage.types.ts — 유니온 확장(기존 값 불변)
type StateEventKind = "building_built" | "building_removed" | "tax_type_changed";
// StateEvent { kind; date; propertyTaxTypeBefore? } — 변경 없음. Before의 뜻:
//   building_removed  : 철거 직전(건축물 있던) 구간의 구분                  (기존)
//   tax_type_changed  : 이 날 바뀌기 직전(건축물 있는) 구간의 구분            (신규)
//   building_built    : 뜻 없음(신축 앞 나대지는 종합합산 고정 — V-6 닫힘)    (기존)
// LandStateInterval — 변경 없음.
```

종류별 Before 운반 여부는 leaf 술어 **`eventCarriesTaxTypeBefore(kind)`**(= `kind !== "building_built"`) **한 곳**에 두고, 위 «4곳»(⑭·미리보기·④ 와이어·복원)이 모두 이 술어를 읽는다(3중 패턴 — 한 곳만 고치면 Before가 침묵 소실).

### 3.4 순서·검증 규칙 (⑧·⑫ 공용 leaf `stateEventSequenceIssue`)

| 규칙 | 현행 | E3-① |
|---|---|---|
| 0건 · 행 결함(종류·날짜) | 차단 | 동일(`isEventKind`이 새 종류 포함) |
| 역순 · 같은 날 | 앞 사건 대비 차단 | **동일 — 종류와 무관한 전 사건 기준**. 건축물 사건과 구분 변경 사건이 같은 날이면 같은 구간을 두 사건이 닫는 모순이라 차단(Q-6) |
| 하한일(⑧만) · 양도일 | 차단 | 동일 |
| 교대(신축 → 멸실 → …) | **앞 사건과** 같은 종류 연속 차단 | **앞 «건축물» 사건과** 같은 종류 연속 차단. `tax_type_changed`는 교대에 참여하지 않는다 |
| **신규** 건축물 없는 구간의 구분 변경 | — | 사건 직전 상태(replay)가 «건축물 없음»이면 **차단**(V-6 닫힘 — 새 문구 1개) |
| **신규** 초기 건축물 상태 | — | 첫 **건축물 사건**이 신축이면 «없음», 멸실이면 «있음». 건축물 사건이 **하나도 없으면** 옵션 `tailHasBuilding`(= 입력 토글 `nblOtherHasBuilding`)이 초기 상태 — ⑧은 `asset.nblOtherHasBuilding`, ⑫는 `raw.nblOtherHasBuilding`. 값이 `false`인데 구분 변경만 있으면 위 규칙으로 차단 |

«구분이 같은 사건» (Before = 바로 뒤 구간 구분)은 **차단하지 않는다**(무해한 분할 — 구간표에 같은 구분 두 줄). 막으면 꼬리 구분·`""` 비교가 ⑧⑫ 인자에 더 필요해진다(Simplicity — Q-6).

### 3.5 `derive` · `hasBuildingAtTransfer` 변경 (의사코드)

```ts
// hasBuildingAtTransfer: 건축물 사건만 본다 → tax-only 이력은 undefined(→ raw 토글)
const b = events.filter(e => e.kind !== "tax_type_changed");
return b.length === 0 ? undefined : b[b.length-1].kind === "building_built";

// derive: 상태 replay + 사건별 구간 닫기
let hasB = (첫 건축물 사건이 removed) ?? (건축물 사건 없음 ? tail.hasBuilding : false);
for ev of events:
  type = ev.kind === "building_built" ? "comprehensive"             // 신축 앞 = 나대지
       : (ev.propertyTaxTypeBefore || "unknown")                    // 철거·구분 변경 직전 구간
  if (ev.kind === "tax_type_changed" && !hasB) throw INVALID_INPUT   // ⑧⑫가 먼저 막는다 — 마지막 안전망
  push {start: cursor, end: ev.date, hasBuilding: hasB, propertyTaxType: type}   // 소유 시작 전이면 0일이라 버림(클립)
  if (ev.kind === "building_built") hasB = true; if (ev.kind === "building_removed") hasB = false
꼬리: {cursor→양도일, hasBuilding: hasBuildingAtTransfer(events) ?? tail.hasBuilding, 입력 구분}
```

`stateHistoryBusinessIntervals`·`isStateIntervalBusiness`·`applyStateHistory`는 **무변경** — 건축물 있는 이전 구간의 구분이 사건으로 더 잘게 나뉠 뿐이라, 사업용 구간 = 이전 구간 중 «건축물 ∧ {비과세·분리·별도}» ∪ 꼬리(Q-15 (가′))가 그대로 성립한다(실측 §5: 현행 판정 산식 그대로 `meetsPeriodCriteria`에 구간을 넣어 계산).

### 3.6 하위호환 (바이트 동일)

- 건축물 사건만 있는 기존 목록: 상태 replay 결과가 현행(`:197-202`)과 같고, `hasBuildingAtTransfer`도 건축물 사건 = 전체 사건이라 같다. **E2 표(`_helpers/nbl-state-history-e2-table.ts`) 전 행 · leaf 단위 테스트 · E0 골든이 코드 수정 없이 전부 green**(현재 `nbl-state-history` 16파일 677건 — §7.1 기준선)이어야 한다(게이트 §7 Anchor G).
- `mode ""`·`unchanged`·`unknown`·미전송: 경로 불변(이 PR은 `changed` 안쪽만 만진다).
- 고지: 기존 `NBL_STATE_HISTORY_APPLIED_NOTICE`·`…_REMOVED_TAX_TYPE_UNKNOWN_NOTICE` **문구를 한 글자도 바꾸지 않는다**(E2 anchor가 정확 일치로 고정). 구분 변경 사건이 있을 때만 쓰는 **새 변형 고지 2종**을 추가한다(§3.7).
- echo `periodEvaluation.stateHistory`: 필드 추가 없음. 사건이 늘면 `intervals`의 행 수가 늘 뿐이다(Σ days = 소유일수 불변식 유지).

### 3.7 고지 (`nbl-confirm-notices.ts`)

| 상수(신규) | 조건 | 내용 |
|---|---|---|
| `NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE` | 사건에 `tax_type_changed` ≥ 1건 | 기존 한정 고지의 확장판 — «건축물 유무·재산세 구분의 변경을 입력한 대로 기간별로 판정했고, 구분이 바뀐 구간의 배율·2% 요건(지령 §101②)과 면적 변동(증축·일부 철거·용도지역)은 반영하지 않았다 — 확인 필요». 이 경우 기존 APPLIED 고지를 **대체**(두 문구가 동시에 뜨지 않는다 — 통합 Q-7 선례) |
| `NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE` | `tax_type_changed`가 닫은 구간의 Before가 `""`(모름) | «구분 변경 전 구간을 종합합산으로 보아 판정했다 — 재산세 납세고지서(과세구분)로 확인 필요». 철거의 모름 고지(기존)와 같은 정책(「모름」 = 혜택 불성립) |

인용 상수는 신규가 필요 없다: `NBL.OTHER_LAND_PROPERTY_TAX_EXCLUSION`(`transfer-nbl.ts:118`) · `NBL.BUILDING_SITE_SEPARATE_AGG_PROVISO`(`:171` — 영 §101①단서) 재사용. 새 조문을 인용하게 되면 `additions-*.ts` 등록 + `npm run verify:legal`(CLAUDE.md).

---

## 4. V-6 — `building_built` 앞 나대지 구간의 비종합합산 주장

**질문**: 신축 전 나대지 구간을 공지상태 별도합산(지령 §101③) 등으로 선언할 수 있게 열 수 있는가 / 열어야 하는가.

| 사실 | 근거 |
|---|---|
| 현행 모델은 신축으로 닫히는 구간을 종합합산 고정으로 접는다 | `other-land-state-history.ts:198-199` |
| 근거 모델 V1-A: 건축물 **없는** 토지의 비종합합산 선언은 «근거»(비과세 근거·분리과세 근거·**공지상태**·철거·멸실+종전 바닥면적)가 확인돼야 존중, 아니면 **종합합산 + 확인 필요** | `property-tax-basis.ts:12-27`(표) · `resolvePropertyTaxBasis` |
| 건축물 **있는** 구간은 근거를 묻지 않는다(비과세·분리과세는 선택, 별도합산은 건축물 부속토지 규칙) | 같은 파일 표 마지막 두 줄 |
| 공지상태 별도합산은 지령 §101③ 17종 열거 + 각 호의 면적한도(최저차고면적 1.5배·최대보관면적 1.2배 등)가 걸려 있다 | 지령 §101③ 본문(확인) · V1-A 표 «호별 면적 한도 확인 필요» |
| 그 17종 다수는 영 §168의11 호별(다목) 축과 겹친다 — 이력 모델이 호별 용도를 «구간마다 기준면적이 달라 모델 폭증»으로 제외했다 | engine.plan §2.1 · UI UQ-9 |

**열 수는 있다** — 신축 사건에 `propertyTaxTypeBefore`를 허용(운반 조건만 풀면 ⑫는 이미 enum 보유)하고 구간별 «근거»(`propertyTaxBasisBefore`)를 더하면 된다. 그러나 **근거 없이는 열면 안 된다**(V1-A의 «근거 없는 비종합합산 = 종합합산 접기»가 정확히 이 경우다 — 선언만 믿으면 PR#291이 막으려던 역버그).

**실측(§5 T9c·T9o)**: 신축 2023-06-01 + 앞 나대지 공지상태 별도합산 선언 시 사업용 3,651/3,651(198,210,000) vs 닫힘 비사업용 214/3,651(253,960,000) — **스윙 55,750,000.** 즉 V-6을 닫아 두면 «실제로 공지상태 별도합산이던 사실»을 가진 납세자는 과대 과세 방향의 기능 제약을 받는다.

**추천(Q-2 (가)): E3-①에서 열지 않는다.**
1. 열려면 «근거 + 호별 면적한도»가 구간마다 필요하다 → 입력 폭증 + 다목 축과 중복.
2. 닫아도 **침묵이 아니다** — ⑧·⑫가 «건축물 없는 구간에 구분 변경을 둘 수 없다» 차단 문구를 주고(§3.4), 구분 변경 사건이 있는 이력에는 새 한정 고지가 나대지 구간 한계를 밝힌다(§3.7).
3. 신축 사건 앞 구간 한계는 **기존(E2) 이력에서도 같은 구조적 한계**인데 이미 확정·구현된 상태다(통합 Q-3·V-6). 이 PR이 새로 만드는 불리 경로가 아니다.
4. E3 ②(업종·호별)와 같은 «구간별 사용 사실» 축이라 같이 결정하는 편이 구조 재작업이 적다.

기존 built-first 이력(E2)에 «앞 나대지 구간은 종합합산으로 판정» 고지를 **추가**할지는 별도 질문(Q-4) — 세액 불변이나 `warnings` 바이트가 바뀐다.

---

## 5. 케이스 매트릭스 (일 단위 · probe 실측)

**방법**: throwaway probe가 모델 (A)의 derive를 프로토타입으로 구현해(사건 → Before 사슬 구간) `stateHistoryBusinessIntervals` 산식(이전 구간 중 «건축물 ∧ {비과세·분리·별도}» ∪ core가 사업용이면 꼬리)대로 `meetsPeriodCriteria`에 넣고, 같은 거래를 전량 사업용/비사업용으로 강제한 입력의 `calculateTransferTax` 산출세액을 기대 세액으로 썼다. «현행» = 같은 입력에서 이력 칸만 뺀 `judgeNonBusinessLand`·산출세액. 공통: 잡종지 · 일반주거 · 기본 취득 2014-01-01 → 양도 2024-01-01(소유 3,651일). `B`=198,210,000 · `N`=253,960,000(M13 계열 거래는 아래 표기).
꼬리 = 건축물 있음 + 표기 구분(바닥면적 250㎡ ≤ 배율 한도 1,000㎡). `tax_type_changed(날짜, 바뀌기 직전)` 표기.

| # | 시나리오 | 현행(이력 없음 = 꼬리 구분을 전 기간에) | **E3-① 기대(일 단위 정본)** | 변동 |
|---|---|---|---|---|
| T1 | **M12**: 별도합산 → 종합합산 `2022-06-01`(꼬리 종합합산 · 건축물 유지) | 비사업용 N 253,960,000 | **사업용** 사업 3,072/3,651(비사업 579 — 가목 미충족, M4 동형) → B 198,210,000 | −55,750,000 |
| T1b | 같은 변경 `2022-06-02` | 비사업용 | 사업용 3,073 | −55,750,000 |
| T2 | 종합합산 → 별도합산 `2023-06-01`(사용승인 후 · 꼬리 별도합산) | **사업용** B 198,210,000 | **비사업용** 사업 214/3,651 → N 253,960,000 (M6 동형) | +55,750,000 |
| T3a | 임계선 쌍 ①: 종합 → 별도 `2022-01-01`(직전 3년 비사업 365) | 사업용 | 사업용 730/3,651(나목 «1년 초과» 미충족) | 0 |
| T3b | 임계선 쌍 ②: `2022-01-02`(비사업 366) | 사업용 | **비사업용** 729/3,651 | +55,750,000 |
| T4a | 임계선 쌍(다목 40%): 별도 → 종합 `2020-01-02`(비사업 1,460 ≤ floor(3,651×0.4)=1,460) | 비사업용 | **사업용** 2,191 | −55,750,000 |
| T4b | `2020-01-01`(비사업 1,461) | 비사업용 | 비사업용 2,190 | 0 |
| T5 | 분리과세 → 종합합산 `2021-07-01`(공장 용도 폐지 등) | 비사업용 | 사업용 2,737/3,651 | −55,750,000 |
| T6 | 3단: 비과세 `2016-01-01` → 분리 `2018-01-01` → 별도 `2021-01-01` → 종합(꼬리) | 비사업용 | 사업용 2,556/3,651(구간 3개가 모두 사업용으로 이어짐 — 비과세·분리·별도 합집합) | −55,750,000 |
| T7 | **구분 변경 + 철거**: 별도→종합 `2019-01-01` · 철거 `2021-01-01`(철거 직전 종합) · 꼬리 나대지 종합 | 비사업용(전 기간 나대지·종합합산) | **비사업용** 1,825/3,651 → N | 0 (일수만 다름) |
| T7' | 같은 사실을 **현행 모델로** 근사: 철거 `2021-01-01` Before=별도합산 | — | 사업용 2,556 → B(**2019-01-01~2021-01-01 종합합산 2년을 사업용으로 오계상 — 과소**) | 사실을 말할 칸이 없다 |
| T7'' | 현행 모델로 근사: 철거 Before=종합합산 | — | 비사업용 0/3,651(별도합산이던 2019년까지의 5년을 놓침 — 이 시료는 판정이 같으나 일수가 틀림) | |
| T8 | **복합**: 신축 `2019-01-01`(앞 나대지) + 별도→종합 `2022-06-01` · 꼬리 종합 | 비사업용 | 사업용 1,247/3,651(앞 나대지 1,826일은 비사업용 — 다목은 충족하나 가목 «직전 5년 중 2년 초과» 미충족: 직전 5년 비사업 579) | −55,750,000 |
| T9c | **V-6 닫힘**: 신축 `2023-06-01` · 앞 나대지는 종합합산 접힘 · 꼬리 별도합산 | 사업용 | 비사업용 214/3,651 (= 기존 E2 M6) | +55,750,000 |
| T9o | V-6을 **열었다면**(신축 행에 앞 나대지 구분=별도합산 선언) | 사업용 | 사업용 3,651/3,651 | 닫힘 대비 −55,750,000 |
| T10 | 단기 보유 취득 `2022-07-01`(소유 548일 · 3호 버킷) · 별도→종합 `2023-10-01` | 비사업용 326,760,000 | 사업용 456/548 → 279,000,000 | −47,760,000 |
| T11 | **축 B 지분**(취득 `2020-01-01`, 소유 1,460일) · 별도→종합 `2022-06-01` | 비사업용 297,640,000 | 사업용 881/1,460 → 233,490,000 | −64,150,000 |
| T11b | 지분 취득 `2022-09-01` · 사건 `2022-06-01`(소유 전) → **클립** | 비사업용 | 비사업용 0/486(첫 구간 0일 버림 — 구분 변경이 소유 첫날 상태로 접힘) | 0 |
| T12a | **윤일 낀 창**: 양도 `2024-03-01` · 종합 → 별도 `2022-03-01`(꼬리 731일) | 사업용 | 사업용 731/3,711 | 0 |
| T12b | 같은 거래 `2022-03-02`(꼬리 730일) | 사업용 | **비사업용** 730/3,711 | +55,750,000 |
| T13 | **소유 1일**(취득 `2023-12-30`) · 변경 `2023-12-31` = 소유 첫날 → 앞 구간 0일 버림 | 사업용 | 사업용 1/1(꼬리만) · 348,750,000 | 0 |
| T14 | **양도차손**(양도 2억 < 취득 3억) · T1과 같은 변경 | 비사업용 · 세액 0 | 사업용 3,072 · **세액 0** | 판정만 바뀜 |
| T15 | 「모름」: 별도합산 → ? `2022-06-01`(Before `""`) · 꼬리 별도합산 | 사업용 | **비사업용** 579/3,651 → N(철거의 모름 R3와 같은 «혜택 불성립») | +55,750,000 |

**읽는 법**
- 임계선 쌍 3개(T3a/b 나목 730/729 · T4a/b 다목 1,460/1,461 · T12a/b 윤일 731/730)가 E2 표(M8a/b · Z-1460/1461 · M8c)와 **일수·판정이 같다** — 구분 변경도 같은 `meetsPeriodCriteria`로 들어가므로 당연하다(회귀 가드).
- T7 vs T7'/T7'': 현행 모델은 «구분 변경 후 철거» 이력을 **어느 쪽으로도 올바르게** 말할 수 없다(별도합산을 고르면 과소, 종합합산을 고르면 일수 누락). 이것이 E3-①의 존재 이유다.
- T15: 모름은 «혜택 불성립» — 철거 모름(R3)·V1-A와 같은 방향이다(통합 §5 Q-6 «모름 = 현행 + 고지»는 **이력 전체 모름**에만 해당 — 이력은 알지만 한 구간의 구분만 모르는 경우는 R3 정책).
- 판정이 현행과 **같은 행**(T3a·T4b·T7·T11b·T12a·T13)도 일수·echo는 달라지므로 anchor에 넣는다.

---

## 6. 14지점 영향표 (⑨~⑭ 상세 · ①~⑧은 UI 계획서 참조)

| 지점 | 영향 | 변경 내용 · 근거 |
|---|---|---|
| ⑨ Zod enum 메인 | 해당 없음 | 새 칸이 `nonBusinessLandRaw` 안 |
| ⑩ 컴패니언 + `addPropertyRefines` | 해당 없음 | `transfer-tax-schema-companion.ts:283`이 ⑫ 스키마 재사용 |
| ⑪ `acquisitionDate` fallback | 해당 없음 | 사건은 날짜만 — 소유 시작은 기존 경로 |
| **⑫ Zod 입력 객체** | **(A) 무변경** · (A2) 신규 필드 | `transfer-tax-schema-nbl.ts:56-60` `kind: z.string()` · Before enum 이미 허용 → 새 종류가 strip되지 않는다. **그래도 route anchor로 «tax 사건이 엔진에 도달한다»를 관통 확인**(P-E3-6) |
| **⑫′ refine 거울** | **수정** | `transfer-tax-schema-nbl-refines.ts:104-107` — `stateEventSequenceIssue`에 `tailHasBuilding: !!raw.nblOtherHasBuilding` 전달(⑧과 같은 인자·같은 문구 — 격자 parity anchor) · `NblRawRefineInput.nblOtherStateEvents` 타입 `{kind; date}[]` 유지(Before는 refine이 안 읽음) · `:204`는 `effectiveOtherHasBuilding` 같은 함수라 무변경 |
| ⑬ `callTransferTaxAPI` body spread | 무변경 | `nonBusinessLandRaw` 통째 운반 |
| **⑭ Route 매핑(`mapAssetToNblInput`)** | **수정 1곳** | `form-mapper-helpers.ts:315` 운반 조건 `kind === "building_removed"` → `eventCarriesTaxTypeBefore(kind)` · `isEventKind`(`:313`)가 새 종류 통과. 라우트 입구 5곳은 무변경 |
| 엔진 leaf | **수정** | `land-usage.types.ts:308`(kind 유니온) · `other-land-state-history.ts` — `isEventKind`·라벨 표(`STATE_EVENT_KIND_LABEL` 컴파일러 강제)·`stateEventSequenceIssue`·`hasBuildingAtTransfer`·`deriveOtherLandStateIntervals`·신규 `eventCarriesTaxTypeBefore` · 문구 `nbl-validation-messages.ts` 신규 1 + 같은 종류 연속 문구가 «건축물 사건» 기준임을 반영(**기존 문구 바이트 유지**) · 고지 2종(§3.7) |
| 판정 `applyStateHistory` | **무변경** | `:117-120`이 leaf를 호출 · 고지 분기만 추가(`:146-148` 주변: `tax_type_changed` 존재 시 APPLIED → TAX_CHANGE_APPLIED로 대체 · 모름 구간 고지 종류 선택) |
| date-coerce | 영향 없음 | 사건 날짜는 기존대로 매퍼 `parseDate` |
| 파일 크기 | 안전 | `other-land-state-history.ts` 268 → 약 330 · `form-mapper-helpers.ts` 517 · `nbl-confirm-notices.ts` 184 · 모두 ≤ 700 |

**UI 계획서 참조(①~⑧)와의 접점 — 침묵 소실 방지 grep 게이트**: `git grep -n 'kind === "building_removed"' lib components app`가 **0건**이 되도록(위 4곳 → `eventCarriesTaxTypeBefore`). 그리고 `git grep -n 'nblOtherStateEvents'`에서 ⑫·⑫′·매퍼·store·validate가 모두 나오는지(기존 E2 점검과 같다).
**5단 파이프라인**: 폼(①②③) → 변환(④ `stateHistoryWireFields` — Before 정규화 지점 주의 · ⑬) → body → Zod(⑫) → Route(⑭) → 엔진 `landStateHistory.events[kind=tax_type_changed]`.

---

## 7. Pre-Do anchor · mutation probe · PR 분할

### 7.1 착수 전 mutation 실측 (이 계획이 만지는 leaf 4곳 — 현재 안전망, 범위 `npx vitest run nbl-state-history` 16파일 · 677건 · 기준선 전부 통과)

| # | 무력화(제품 코드 1줄 → 원복, `git status` 클린 확인) | 실패 | 해석 |
|---|---|---|---|
| M1 | 신축으로 닫히는 나대지 구간 구분 `comprehensive` → `separate`(V-6 역버그) | **2/677** | V-6 닫힘 가드는 얇다 → Anchor 4(§7.2)로 보강 |
| M2 | 같은 종류 연속 차단 삭제 | **5/677** | 교대 규칙 안전망 있음(새 규칙은 «건축물 사건끼리»로 바뀌므로 격자 anchor 필요) |
| M3 | `hasBuildingAtTransfer`가 마지막 대신 첫 사건을 봄 | **5/677** | 마지막 사건 의미론 안전망 있음 |
| M4 | `effectiveOtherHasBuilding`의 `?? raw` → `?? false` | **0/677** | 🔴 **무방비** — 지금은 `changed`면 사건이 항상 ≥1건이라 `undefined` 경로가 도달 불가였다. E3-①(tax-only 이력)이 이 경로를 **도달 가능**하게 만든다 → Anchor 3 필수 |

### 7.2 Pre-Do anchor (E3-0 — 테스트만, 지금 코드에서 green이거나 의도된 red)

| Anchor | 내용 | 지금 |
|---|---|---|
| **1 일 단위 정답표** | §5의 T1~T15를 `meetsPeriodCriteria`에 «이전 구간 ∪ 꼬리» 구간을 직접 넣어 일수·판정 고정(공용 표 `_helpers/nbl-state-history-e3-1-day-table.ts` — E3-1a leaf 테스트가 같은 표로 대조). 임계선 쌍 3개 포함 | green |
| **2 하위호환(G)** | E2 표 전 행 · E0 골든 · leaf 단위(= `nbl-state-history` 16파일 677건) **무수정 green** 게이트(E3-1a PR의 «기존 테스트 diff 0» 확인) | green |
| **3 `?? raw` 경로** | tax-only 이력(모드 changed · 건축물 사건 0건)에서 `effectiveOtherHasBuilding`·⑭ `buildOtherLand`가 **raw 토글**을 쓰는지(M4 mutation이 잡도록). 지금은 `stateEventSequenceIssue`가 tax 종류를 거부해 도달 불가라 **E3-1a에서 red→green** | 의도된 skip(E3-1a 활성) |
| **4 V-6 닫힘 가드** | 신축 앞 구간·철거 후 구간 위의 구분 변경 사건 → ⑧·⑫ 차단 + 엔진 throw · 신축 행의 Before는 무시(운반돼도 derive가 `comprehensive`) | E3-1a |
| **5 ⑧↔⑫ parity 격자** | 사건 목록 격자(건축물 사건 × 구분 변경 × 순서·같은 날·초기 상태 `tailHasBuilding` × 하한 유무)에서 `stateEventSequenceIssue` 결과(문구 포함)가 ⑧ 호출·⑫ 호출에서 같다(하한 규칙만 ⑫ 제외) | E3-1a |
| **6 route 관통** | raw(`nblOtherStateEvents`에 `tax_type_changed`) → ⑫ → ⑭ → 엔진: T1·T2·T15 판정·세액이 §5 값 | E3-1a |
| **7 Q-15 교차** | DM-01·3호 자체 사업기간 × 구분 변경 — 자체 구간 `∩ 소유기간`이 구분 변경 사건에 영향받지 않는다(기존 V21 표 + 1행) | E3-1a |

### 7.3 구현 후 mutation (정확히 그 anchor만 실패해야 한다)

| P | 무력화 | 실패해야 할 anchor |
|---|---|---|
| P-E3-1 | derive가 `tax_type_changed`를 무시(구간 안 나눔 → 꼬리 구분을 전 기간) | T1·T2·T5·T6·T10·T11·T15 |
| P-E3-2 | Before 사슬을 After 의미로 한 칸 밀기 | T1·T2·T7 |
| P-E3-3 | `hasBuildingAtTransfer`가 tax 사건도 «마지막 사건»으로 셈 | Anchor 3 + T1(꼬리 건축물 오판) |
| P-E3-4 | 교대 검사를 «앞 사건(종류 불문)» 기준으로 | 격자(건축물 사이에 구분 변경 낀 행) |
| P-E3-5 | 건축물 없는 구간 위 구분 변경 차단 삭제 | Anchor 4 |
| P-E3-6 | ⑭ Before 운반 조건을 `removed`만으로 되돌림 | route(T1: Before 소실 → 꼬리 구분 적용) |
| P-E3-7 | ⑫ refine에 하한 규칙 추가(N-6 계열) | 컴패니언 지분 parity |
| P-E3-8 | `isEventKind`에서 새 종류 제외 | route 400 |
| P-E3-9 | 모름(`""`) → 별도합산으로 접음 | T15 |
| P-E3-10 | 새 고지 미탑재 / 기존 APPLIED와 동시 탑재 | 고지 anchor |
| P-E3-11 | 같은 날 건축물 + 구분 변경 허용 | parity 격자(Q-6) |
| P-E3-12 | 4곳 Before 정규화 중 1곳을 `removed`만 유지 | UI 계획서의 render/wire anchor(그 문서 소관 — 이 계획의 grep 게이트와 짝) |

### 7.4 PR 분할

| PR | 범위 | 선행 |
|---|---|---|
| **E3-0** | Anchor 1·2 활성 + Anchor 3~7은 `it.todo`/skip 자리 + 공용 표. 코드 변경 0 | Q-1·Q-2 결정 |
| **E3-1a** | 타입·leaf(§3) · 문구 · 고지 2종 · ⑫′ refine · ⑭ 운반 조건 · 단위·route anchor 활성 · 소비표 변경 없음. **한 PR로 판정까지 연결**(⑫ Zod가 이미 허용해 leaf 확장 즉시 도달 가능 — E1/E2처럼 «도달 불가 단계»를 따로 두지 않는다. 대신 UI가 열리기 전까지 외부 입력은 직접 API뿐) | E3-0 · **V-1 해소** |
| (UI) | UI 계획서 PR — store·④ 4곳 정규화·⑤ 행·⑦ 구간표·⑧ | E3-1a |
| E2E | UI 계획서 소관(T1·T2·T3a/b 최소) | UI |

---

## 8. 사용자 결정 Q-n · 미검증 V-n

### 8.1 Q-n

| # | 질문 | 선택지 | 추천 | 무엇이 달라지나 · 근거 |
|---|---|---|---|---|
| Q-1 | 모델 | (A) 사건 배열에 새 종류 / (A2) 별도 배열 / (B)·(C) 기각 | **(A)** | (A): ⑫ Zod 무변경, 순서 규칙 1벌, 화면은 «사건 표» 하나. (A2): UI에서 질문 분리가 쉬우나 ⑫ 신규 필드(strip 위험)·⑭ 병합·같은 날 교차 규칙 추가. §3.2 |
| Q-2 | V-6(건축물 없는 구간의 비종합합산 선언) | (가) **열지 않음** — 차단 + 고지 / (나) 신축 행 Before + 구간별 «근거»·면적한도 입력(E3-1b) / (다) 근거 없이 선언만 존중 | **(가)** | (나)는 V1-A 근거 모델을 구간 단위로 복제(근거 + 지령 §101③ 호별 면적한도)해 다목 축과 겹침 → E3 ②와 묶어 결정. (다)는 V1-A가 막은 역버그라 **기각**. §4 · 실측 스윙 55,750,000 |
| Q-3 | 구분 변경일의 의미 | (가) **사유가 발생해 새 구분이 되는 날**(사용승인일·용도 폐지일·분리과세 요건 상실일 등 — 건축물 사건·V-1 일 단위와 같은 «새 상태의 첫날») / (나) 새 구분이 처음 과세되는 **과세기준일(6.1.)** | **(가)** | 통합 V-1(일 단위, 6.1. 접기 ⛔)과 일관. 단 임계선 쌍(T3·T12)이 있어 **날짜 선택이 판정을 바꿀 수 있다** → 입력 도움말 필수·V-2 |
| Q-4 | 고지 정책 | (가) 구분 변경 사건이 있을 때만 새 변형 고지 2종(기존 문구 바이트 유지) / (나) (가) + 기존 built-first(E2) 이력에도 «앞 나대지는 종합합산으로 판정» 고지 추가 | **(가)**, (나)는 별건 | (나)는 세액 불변이나 E2 anchor의 `warnings` 정확 일치를 바꾼다 — 사용자 결정 후 별 PR |
| Q-5 | tax-only 이력(건축물 사건 0건)의 허용 | (가) **허용** — 초기 건축물 상태 = 입력 토글, UI는 이 경우 토글 노출 유지 / (나) 건축물 사건 ≥ 1건 요구(M12를 못 담음) / (다) tax-only 시 건축물 있음으로 간주(토글 무시) | **(가)** | (나)는 M12(T1·T2)를 막는다. (다)는 «근거 없는 간주» — 건축물 없는 토지에 구분 변경을 허용하게 돼 V-6 닫힘이 샌다. 현재 UI는 `changed`이면 토글을 숨긴다(`OtherLandStateHistorySection`) → **UI 계획서 합의 필요(V-1)** |
| Q-6 | 순서·무변경 사건 | (가) 같은 날 금지(전 종류) · 구분이 같은 사건 **허용** / (나) 같은 날 건축물+구분 허용 / (다) 구분이 같은 사건 차단 | **(가)** | (나): 한 날에 같은 구간을 두 사건이 닫아 Before가 모호. (다): 꼬리·모름 비교용 인자 추가 비용 대비 효과 없음(무해한 분할) |

### 8.2 V-n

| # | 항목 | 상태 | 영향 |
|---|---|---|---|
| **V-1** | tax-only 이력에서 초기 건축물 상태 = 입력 토글(`tailHasBuilding`) — 화면이 `changed`일 때 토글을 숨기는 현행 UI와 충돌 | ⏳ **착수 차단** — UI 계획서와 합의(Q-5 (가) 전제) | ⑧·⑫ 인자 · 토글 노출 규칙 · 와이어 `nblOtherHasBuilding` 전송 |
| V-2 | 구분 변경일을 사유 발생일로 센다는 해석례·재결례 직접 근거 — **미확보**. 열람한 건은 «기간동안»(3604·4159·476·0817)만 말하고 변경일 단위는 침묵. 재산세 구분이 «과세기준일 현재»(지법 §106①)라 사유 발생일과 다음 6.1. 사이 일수가 판정을 바꿀 수 있음(T3·T12 임계선) | ⏳ 비차단(V-1 일 단위 결정 준수) · **입력 도움말·고지 필수** | Q-3 · 문구 |
| V-3 | 법 §104의3①4호가목 «면제»에 지방세특례제한법 감면(경감 포함)이 드는지 · 지법 §109 본문 | ⏳ 비차단(`exempt` 구분 선택 자체는 기존 값) | R4 고지 문구 |
| V-4 | 영 §168의11 본문 · 지법 §109 이번 세션 미재열람(기존 계획서 인용) | ⏳ 착수 시 인용 상수를 새로 만들면 KoreanLaw 재확인 + manifest | 새 조문 인용 시 |
| V-5 | 구분 변경 구간의 배율·2% 요건(지령 §101②) 재판정 불가 — 면적 변동(R6·R7)과 함께 오는 구분 변경을 «전체 면적 구분 변경»으로 입력하면 과대·과소 | 알려진 한계(통합 V-5와 같음) — 고지 | 새 고지 문구 |
| V-6 | 과거 연혁(구 지법 §182 · 구 영 §131의2 — 3604·4159는 이 시대 번호)의 구분 기준 차이 — 소유기간이 과거에 걸치면 사용자 선언에 의존 | 기존 V-16과 동일 | 고지 |
| V-7 | 사전-2023-법규법인-0817은 **법인세법 사안**·본문 중략본 | 준용 근거로만 인용(소득세법 직접 해석 아님) | 인용 표기 |

---

## 9. 자가 검토 (plan-design-self-review-loop 1회)

| # | 구분 | 발견 | 처리 |
|---|---|---|---|
| 1 | 오류 | 첫 probe가 V-6 열림 시료(T9)를 «신축 앞 구간에 Before를 줄 슬롯이 없는 형태»로 짜 결과가 닫힘과 같게 나옴 | 신축 행 Before 슬롯을 명시하고 T9c/T9o로 재측정 — §4 스윙 55,750,000 확정 |
| 2 | 누락 | `kind === "building_removed"` 분기가 ⑭ 한 곳이 아니라 **4곳**(미리보기·④ 와이어·복원 정규화 포함) — 놓치면 Before 침묵 소실 | §2·§6 grep 게이트 + `eventCarriesTaxTypeBefore` 단일 술어 + P-E3-12 |
| 3 | 누락 | `effectiveOtherHasBuilding`의 `?? raw` 경로가 mutation 0건 — 지금까지 도달 불가여서 무방비 | §7.1 M4 → Anchor 3 필수 |
| 4 | 모순 | 「⑫ 무변경」이라 쓰면 안전해 보이나, ⑭ 운반 조건이 막으면 Zod 통과 후 엔진에서 소실 | P-E3-6 route 관통 anchor를 ⑫ 행에 명시 |
| 5 | 정책 위반 위험 | 기존 `NBL_STATE_HISTORY_APPLIED_NOTICE`·모름 고지의 문구를 일반화하면 E2 anchor(정확 일치)가 깨지고 byte-identical 약속 위반 | 새 변형 고지 2종 + 기존 바이트 유지(§3.6·§3.7) |
| 6 | 정책 위반 위험 | 사전-2023-법규법인-0817을 소득세법 해석으로 읽으면 인용 오귀속 | §1.2·V-7 «법인세법 준용 근거» 표기 |
| 7 | 누락 | 구분 변경 후 구간의 면적 요건(R6·R7)이 모델 밖인데 사건으로 «근사 입력»할 위험 | 고지 문구에 면적 변동 비반영 명시 + V-5 |
| 8 | 개선 | echo에 «이 구간을 연 사건 종류»가 없어 UI 구간표가 분할 원인을 못 보임 | echo 불변 유지(바이트 동일) — UI가 사건 목록(미리보기 leaf)과 함께 그린다. 필요하면 UI 계획서에서 optional 필드 요청(비파괴) |
| 9 | 검증 | 매트릭스 일수가 E2 표와 겹치는 행(T3·T4·T12)은 E2 값과 일치하는지 재대조 | T3a 730 · T3b 729 · T4a 2,191 · T4b 2,190 · T12a 731 · T12b 730 — E2 표 M8a/M8b/Z-1460/Z-1461/M8c와 **일치** |
| 10 | 한계 | 해석례 본문은 요지·회신 위주(3604·476 전문, 4159·0817 중략). 영 §168의11·지법 §109 미재열람 | V-3·V-4·V-7로 표시 — 착수 차단 아님 |

**Verdict: 조건부 승인(PASS-with-conditions)** — 모델 (A)·Before 사슬·V-6 닫힘 방향은 법령 본문과 현행 코드·실측으로 일관된다. 설계를 가르는 미검증은 **V-1 한 건**(UI 토글 노출 합의 — Q-5)이며 **착수 차단**이다. Q-1~Q-6 사용자 결정 후 E3-0(테스트만)부터 착수할 수 있다. 코드·커밋·push 0.

## 결정 기록 (2026-11-23 사용자)

- **모두 추천안 승인**: 엔진 Q-1 (A) 사건 배열에 새 종류 `tax_type_changed` · UI UQ-1 (A) · UQ-2 (가) 기존 3지선다 문구를 «건축물 또는 재산세 과세 구분»으로 확장(새 필수 칸 없음) · 엔진 Q-5 (가) 건축물 사건 0건이면 «건축물 있음» 토글을 초기 상태로 사용(UI: 토글은 건축물 사건이 1건 이상일 때만 숨김 — 엔진 V-1 해소) · UQ-3·엔진 Q-6 (가) 변경 전후 구분이 같으면 차단하지 않고 비차단 안내 · 같은 날 사건 2건은 종류 무관 금지 · 엔진 Q-4·UI R-5 (가) 새 고지는 구분 변경 사건이 있을 때만(기존 고지 문구 불변) · UQ-5 (가) 행 메시지 접두는 종류별(건축물 행 byte-identical).
- **변경일 = 사유 발생일(일 단위)** — 기존 결정 V-1(일 단위)을 따른다. 엔진 Q-3 (나) «다음 과세기준일»은 과세기준일 접기와 같은 구조라 선택지에서 제외(재제안 금지 사항).
- **V-6(신축 앞 나대지 구간의 비종합합산 주장) = 이번 E3-①에서는 닫음(⑧·⑫ 차단 + 고지), 별도 후속 E3-1b로 연다** — E3-1b는 구간별 «근거»(공지상태 등 영 §101③ 호별)·면적한도 입력을 갖춘 모델로 따로 계획한다(실측 효과: 신축 2023-06-01 시료 열림 198,210,000 / 닫힘 253,960,000).
- 착수 순서: E3-0(테스트만 — Anchor 3 `?? raw` 무방비 포함) → E3-1a(엔진·⑫′ refine·⑭·고지 2종) → U4(UI) → E2E. 침묵 소실 grep 게이트(`kind === "building_removed"` 4곳 → 단일 술어 `eventCarriesTaxTypeBefore`)는 E3-1a·U4 공통 완료 조건.

## 구현 기록 (2026-11-23 · E3-0 + E3-1a — 엔진 측 · 커밋만, push·PR 없음 — U4가 같은 브랜치에서 이어 한 PR)

브랜치 `feat/nbl-e3-1-tax-type-change` · base origin/master 00e5b80b8. 검증 표기는 위와 같다(실측 = 이 세션에서 실행).

### 커밋

| 커밋 | 내용 |
|---|---|
| E3-0 `53907a041` | 테스트만. 공용 표 `_helpers/nbl-state-history-e3-1-table.ts`(§5 21행 + 참고 3행) · Anchor 1(`meetsPeriodCriteria`에 구간 직접 입력) · Anchor 3(`?? raw`). 제품 코드 0 |
| E3-1a `6e16baf59` | 엔진 leaf · 메시지 · 고지 2종 · ⑫′ · ⑧ 인자 · ⑭ · 테스트 5파일 |

### 변경 요약

- `land-usage.types.ts`: `StateEventKind` += `tax_type_changed`.
- `other-land-state-history.ts`(268 → 327줄): `STATE_EVENT_KIND_LABEL`(+ «재산세 과세 구분 변경») · `BuildingEventKind`·`isBuildingEventKind` · 단일 술어 `eventCarriesTaxTypeBefore(kind)`(= 허용 종류 ∧ 신축 아님) · `StateEventSequenceOptions.tailHasBuilding?` · `stateEventSequenceIssue`(같은 종류 연속 = 직전 «건축물» 사건과만 · 건축물 없는 구간의 구분 변경 차단 · 초기 상태 = 첫 건축물 사건 또는 `tailHasBuilding`) · `hasBuildingAtTransfer`(마지막 건축물 사건 · 0건 undefined) · `deriveOtherLandStateIntervals`(건축물 상태 replay + Before 사슬 · 신축 행 Before 무시). `STATE_AFTER_EVENT_LABEL`은 `Record<BuildingEventKind,…>`.
- `nbl-validation-messages.ts`: 행 접두 종류별(`eventRowPrefix` — 건축물 행 바이트 동일) · 신규 `stateEventTaxChangeWithoutBuildingMessage`. 기존 함수는 끝에 선택 인자 `kind?`만 추가.
- `nbl-confirm-notices.ts`: `NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE`(구분 변경 사건이 있을 때 `…APPLIED_NOTICE`를 **대체**) · `NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE`. 인용은 기존 `NBL.BUILDING_SITE_MULTIPLIER`·`NBL.OTHER_LAND_FOOTPRINT_CARVEOUT`·`NBL.MAIN`·`NBL.CRITERIA`뿐 → **manifest·verify:legal 변경 없음**.
- `other-land-state-history-apply.ts`: 고지 분기(+ 모름 구간은 그 구간을 닫은 사건 종류별로 고지 — 구간 끝 날짜 = 닫은 사건일). 판정 산식 무변경.
- ⑫′ `transfer-tax-schema-nbl-refines.ts`: `tailHasBuilding: !!raw.nblOtherHasBuilding` · ⑧ `transfer-tax-validate-nbl-state-history.ts`: `tailHasBuilding: asset.nblOtherHasBuilding`(같은 값 — 3중 패턴) · ⑭ `form-mapper-helpers.ts`: Before 운반을 단일 술어로.
- ⑫ Zod · ⑬ 무변경(계획대로). ⑨⑩⑪ 해당 없음.

### 케이스 매트릭스 실측 (계획 대비)

**21행 전부 계획서 수치와 일치.** 표를 계획서 값으로 먼저 쓰고 구현 후 돌렸다 — 차이 0건(일수·판정·버킷은 E0 단계에서 `meetsPeriodCriteria`로, 판정·일수·세액은 엔진 단위·route 관통에서 확인).
T1 3,072/3,651 B 198,210,000 · T1b 3,073 · T2 214 N 253,960,000 · T3a 730 B / T3b 729 N · T4a 2,191 B / T4b 2,190 N · T5 2,737 B · T6 2,556 B · T7 1,825 N · T8 1,247 B · T9c·T9o 214 N · T10 456/548 279,000,000 · T11 881/1,460 233,490,000 · T11b 0/486 · T12a 731 / T12b 730 (3,711일) · T13 1/1 348,750,000 · T14 3,072 세액 0 · T15 579 N. 임계선 쌍 3개(T3·T4·T12)는 E2 표(M8a/b · Z-1460/1461 · M8c)와 일수·판정이 같다.
참고: 21행 = 계획서 23행(T7'·T7'' 제외) — T9o는 «신축 행에 Before를 실어 보내도 무시(V-6 닫힘 가드)» 형태로 실행하고, «V-6을 열었다면» 수치(3,651/3,651)는 참고 행(`E3_REFERENCE_ROWS`)으로 E0 Anchor 1에만 둔다.

### mutation 실측 (제품 코드 1줄 무력화 → 해당 파일 vitest `nbl-state-history` 22파일 → 원복 → `git status` 클린)

기준선: E3-0 시점 17파일 712건 → E3-1a 시점 22파일 853건 + 2 todo(전부 green). 아래 «실패»는 실패한 테스트 수.

| P | 무력화 | 실패 | 잡은 anchor |
|---|---|---|---|
| M4(계획 §7.1) | `?? raw` → `?? false` | 종전 **0** → **2** | Anchor 3(leaf 직접 · ⑭ 매퍼) |
| P-E3-1 | derive가 구분 변경을 무시 | 71 | T1·T1b·T2·T3a/b·T4a/b·T5·T6·T7·T8·T10·T11·T12a/b·T14·T15 (leaf·엔진·route) — T9c·T9o·T11b·T13은 구분 변경이 결과를 못 바꾸는 행이라 정상적으로 안 잡힌다 |
| P-E3-2 | Before를 After 의미로 한 칸 밀기 | 69 | 위와 같은 행(T1·T2·T7 포함) |
| P-E3-3 | `hasBuildingAtTransfer`가 구분 변경도 «마지막 사건»으로 | 68 | Anchor 3(leaf) + T1·T2·T5·T6·T10·T11·T11b·T13·T14·T15 + ⑧↔⑫ parity 7행 |
| P-E3-4 | 교대 검사를 «앞 사건(종류 불문)» 기준으로 | 3 | leaf 1 · route 1 · parity «신축 → 구분 변경 → 신축» 1 |
| P-E3-5 | 건축물 없는 구간 위 구분 변경 차단 삭제(sequence) | 9 | leaf 3 · route 2 · parity 4(철거 뒤·신축 앞·tax-only 토글 off·철거→신축→철거 뒤) |
| P-E3-5b | 같은 차단 삭제(derive 안전망) | 2 | leaf 1 · 엔진 1 |
| P-E3-6 | ⑭ Before 운반을 철거만으로 | 35 | 엔진 19 · route 15 · wire 게이트 1 (T1·T1b·T4a/b·T5·T6·T7·T8·T10·T11·T14) |
| P-E3-7 | ⑫ refine에 하한 규칙 추가 | 11 | route 2(T11b) · parity 2(하한 행) · 기존 E2 route 4 · U1 parity 2 · leaf-unreachable WIRE-8 1 |
| P-E3-8 | `isEventKind`에서 새 종류 제외 | 94 | 전 층 |
| P-E3-9 | 모름(`""`) → 별도합산으로 접음 | 10 | **T15만**(leaf 2 · 엔진 6 · route 2) |
| P-E3-10a | 새 고지 미탑재 | 20 | 엔진 1 · route 19 |
| P-E3-10b | 새 고지를 기존과 동시 탑재 | 20 | 엔진 1 · route 19 |
| P-E3-10c | 모름 고지 종류 뒤바꿈 | 1 | 엔진 고지 anchor |
| P-E3-10d | 구분 변경 모름 고지 삭제 | 3 | 엔진 2 · route 1 |
| P-E3-11 | 같은 날 구분 변경 허용 | 4 | leaf 1 · parity 3 |
| P-E3-12 | UI 4곳 중 ④ 와이어만 술어로(U4식 부분 교체) | 3 | E3 wire 게이트 1 · 기존 wire anchor 1 · E2 route 1 (UI 쪽 anchor는 U4 소관 — 이 PR의 grep 게이트가 «목록 갱신» 신호로 대신 막는다) |
| N-1 | ⑧이 `tailHasBuilding`을 안 넘김 | 6 | parity 5 · wire 1 |
| N-2 | ⑫가 `tailHasBuilding`을 안 넘김 | 35 | route 27 · parity 7 · wire 1 |
| N-3 | sequence의 초기 상태가 첫 건축물 사건을 무시 | 13 | leaf 4 · 엔진 4 · route 2 · parity 3 |
| N-4 | 행 접두를 종류별로 안 가름 | 8 | leaf 3 · route 2 · parity 3 |
| N-5 | `eventCarriesTaxTypeBefore`가 신축에도 true | 3 | leaf · 엔진(T9o) · E2 |
| N-6 | derive의 초기 상태가 tail만 | 9 | leaf 3 · 엔진 4 · route 1 · parity 1 |
| N-7 | 차단 필드 `kind` → `date` | 7 | leaf 3 · parity 4 |
| N-8 | `hasBuildingAtTransfer`가 첫 건축물 사건 | 6 | 기존 E2·leaf 5 + E3 leaf 1 |
| N-9 | 신축 앞 나대지 구분을 Before로(V-6 열림 역버그) | 1 | **leaf 1건뿐** — ⑭가 신축 Before를 안 싣는 한 엔진·route로는 도달 불가라 단위 한 겹만 잡는다(이중 방어의 안쪽) |
| N-10 | 클립 제거(0일 구간 push) | 6 | 기존 E2·leaf 4 + E3 leaf·엔진 각 1 |

전부 ≥ 1건이 잡았고 원복 후 `git status` 클린을 매번 확인했다(스크립트가 해시 검증).

### 계획서 대비 편차·결정 (사용자 확인 필요 아님 — 근거 명시)

1. **UI R-8(`stateEventKindRequiredMessage` 괄호 3종 나열) 미적용.** 기존 E2 route anchor(`nbl-state-history-e2-route.anchor.test.ts:214`)가 «종류(건축물 신축 / 건축물 멸실·철거·붕괴)를 선택하세요» 전문을 `toContain`으로 고정하고, 결정 기록이 «건축물 행 byte-identical»이다. 미선택 행은 종류를 몰라 건축물 접두를 쓰므로 문구가 두 종류만 나열한다(라디오는 3종을 보여 준다). 바꾸려면 그 단언 1줄을 U4가 함께 갱신한다.
2. **UI R-5(기존 고지 덧붙이기)와 엔진 Q-4(대체)의 차이:** 결정 기록(엔진 Q-4·UI R-5 (가) «새 고지는 구분 변경 사건이 있을 때만 · 기존 고지 문구 불변»)대로 **대체**다. `NBL_STATE_HISTORY_UNCHANGED_NOTICE`는 건드리지 않았다 — `unchanged`의 의미가 «재산세 구분도 불변»으로 넓어지는 문구는 UI 질문 문구 확장(UQ-2)과 함께 U4가 다룬다(엔진 판정은 byte-identical).
3. **`tailHasBuilding`은 선택 옵션**(생략 = 건축물 없음 = 안전 쪽 차단). 필수로 하면 기존 leaf 테스트 호출부가 컴파일 오류가 나 «기존 테스트 diff 0»이 깨진다. 대신 ⑧·⑫가 같은 값을 넘기는지를 정적 게이트(`nbl-state-history-e3-1-wire.test.ts`)와 ⑧↔⑫ parity 격자 «정상 tax-only 행»이 고정한다.
4. **기존 테스트 1건 갱신:** `nbl-state-history-notices.test.ts`는 `NBL_STATE_HISTORY_*` 상수를 «8종»으로 열거하는 게이트라 새 상수 2종을 열거에 추가했다(문구 단언 불변). 그 밖의 기존 테스트 diff 0.
5. **⑧ 한 줄 수정은 엔진 PR에 포함**(`lib/calc/transfer-tax-validate-nbl-state-history.ts`) — 빠지면 ⑧이 정상 tax-only 이력을 영구 차단하는 막다른 길이라 parity 격자가 성립하지 않는다.
6. 판정 step `detail` 문구는 구분 변경 사건이 있을 때만 «건축물·재산세 구분 사건 N건»으로 바뀐다(없으면 바이트 동일).
7. 계획서 §9 오기 정정 없음. `kind === "building_removed"` 잔존 UI 리터럴은 계획서가 센 3곳이 아니라 **4곳**이다 — `OtherLandStateHistorySection.tsx:149`(직전 구분 칸 노출 술어, UI 계획서 S4)가 더 있다.

### U4가 이어받을 것

- 교체해야 할 UI 리터럴(`kind === "building_removed"` → `eventCarriesTaxTypeBefore(kind)`): `lib/calc/nbl-other-state-history-preview.ts:57` · `lib/calc/nbl-other-state-history-scope.ts:63` · `lib/stores/calc-wizard-asset-migrate-nbl.ts:49` · `components/calc/transfer/nbl/OtherLandStateHistorySection.tsx:149`. 교체 후 `__tests__/lib/nbl-state-history-e3-1-wire.test.ts`의 `UI_PENDING_REMOVED_LITERAL`을 `[]`로 비운다(삭제 금지 — 영구 0건 게이트가 된다).
- ⑤ 미리보기(`nbl-other-state-history-preview.ts:52`)의 `stateEventSequenceIssue` 호출에 `tailHasBuilding: asset.nblOtherHasBuilding` 추가(지금은 생략 = 건축물 없음이라 tax-only 이력의 미리보기가 null).
- 새 export: leaf `eventCarriesTaxTypeBefore(kind)` · `isBuildingEventKind(kind)` · 타입 `BuildingEventKind` · `STATE_EVENT_KIND_LABEL.tax_type_changed`(«재산세 과세 구분 변경») · `StateEventSequenceOptions.tailHasBuilding`.
- ⑧이 부르는 시그니처: `stateEventSequenceIssue(events, { transferDate, floorDate?, tailHasBuilding })` — 반환 `{ index, field: "events"|"kind"|"date", message }`. 건축물 없는 구간의 구분 변경은 `field: "kind"`(앵커 `nblOtherStateEvents.${i}.kind` — 기존 앵커 재사용).
- 문구·고지 상수: `stateEventTaxChangeWithoutBuildingMessage(index)`(메시지 모듈 · leaf가 이미 사용) · `NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE`(행 아래 «모름» 안내용 — 철거 행의 `…REMOVED_TAX_TYPE_UNKNOWN_NOTICE`와 같은 자리) · `NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE`(결과 경고 — 엔진이 싣는다).
- 위젯 쪽 `addEvent`·`lastKind`·`dateHint`·토글 노출(S1~S5·S13)은 UI 계획서 §4.2·§5 그대로. 엔진은 `hasBuildingAtTransfer`/`effectiveOtherHasBuilding`이 건축물 사건 0건이면 raw 토글을 쓰도록 바뀌었으므로 토글은 «건축물 사건 ≥ 1건일 때만 숨김».
- `it.todo` 2건(wire 게이트): U4 완료 조건 — grep 0건 · 미리보기 `tailHasBuilding`. route anchor는 폼 경로가 아니라 **직접 API raw**(④ 와이어 정규화가 아직 tax 행의 Before를 `""`로 지우므로 body 캡처 뒤 이력 칸을 덮어쓴다) — 폼 경로 행은 U4의 E2E가 확장한다.

### 남은 확인 필요

- 엔진 계획서의 V-2(변경일 단위의 직접 해석례 미확보)·V-3(법 §104의3①4호가목 «면제»의 감면 포함 여부)·V-5(구분 변경 구간의 배율·2% 재판정 불가 — 고지로 알림)·V-7(0817은 법인세법 사안 — 준용 근거)은 그대로다. 새 고지 문구는 «변경일은 입력한 날로 세었다 · 배율·2% 요건·면적 변동 미반영 · 확인 필요»까지만 말한다.
- 브라우저 수동 확인·E2E는 UI(U4) 이후 — 이 PR(엔진 측)은 화면 경로가 없다.
- `npm run verify:legal`은 새 조문 인용이 없어 실행하지 않았다(기존 `NBL.*` 상수만 재사용).

# 비사업용 토지(NBL) 잔여 갭 구현 계획서 (마스터)

> 작성 2026-06-16 · 브랜치 `feat/nbl-gaps` · 코드 구현 전 계획 문서 (구현 금지 상태에서 작성)
> 근거: ① `nbl-gap-recheck` 검증 워크플로(17 에이전트, KoreanLaw 본문 적대적 대조) ② `nbl-gaps-plan` 계획 워크플로(갭별 planner, 실제 코드 정독) ③ 메인 루프 직접 코드 검증(`period-criteria.ts`·`unconditional-exemption.ts` 등).
> **검증 원칙**: 모든 file:line은 Read 실측, 법령은 KoreanLaw `get_law_text` 본문, "확인 필요"는 명시. 추정 금지.

## 0. 배경

NBL 엔진은 5지목 3-test + 누진 +10%p 중과까지 성숙(✅PR#223 입력 4단 체인·#224 §168의14① 유예기간·#226 §168의11② 수입금액). 본 계획서는 재검증으로 확정된 **잔여 미구현 갭 6건**을 우선순위 순으로 구현하기 위한 것이다. 갭별 상세는 [`nbl-gaps/`](nbl-gaps/) 디렉터리의 6개 문서에 있다.

## 1. 갭 요약 (우선순위 순)

| 우선 | 갭 | 성격 | 영향 | 복잡도 | 상세 |
|---|---|---|---|---|---|
| 1 | **재촌 시군구 매칭 결선** | wired-but-disconnected | **numeric(결과플립 실증)** — 도시지역 밖 농지/임야 거주이력 입력해도 `landLocation` 미매핑 → 비사업 과대판정·부당 +10%p | M | [gap-1](nbl-gaps/gap-1.plan.md) |
| 2 | **이농 DEAD 복구 (§83의5④2호)** + isFactoryAdjacent legalBasis | wired-but-disconnected | numeric(2009 이전 양도 한정·희소)+충실도 | S | [gap-2](nbl-gaps/gap-2.plan.md) |
| 3a | **§168의11① 면적기준 호별 판정** | 미구현(단일 boolean 붕괴) | numeric 양방향 — 기타토지 자기신고 우회/과대 | XL | [gap-3a](nbl-gaps/gap-3a.plan.md) |
| 3b | **§83의5① 부득이 사유 12종 기간 자동산정** | 미구현 | numeric(오입력 양방향) | XL | [gap-3b](nbl-gaps/gap-3b.plan.md) |
| 3c | **목장 별표 1의3 인용정정 + per-head 정합** | E-1 충실도(즉시) / E-2 numeric(정본 blocker) | E-1 표시정확 / E-2 임계 경계 | S(E-1) | [gap-3c](nbl-gaps/gap-3c.plan.md) |
| 3d | **§168의6 소유기간 버킷별 판정** | 미구현(OR 단순화) | 경계 off-by-one(low·측정0) + 단기버킷 2·3호(medium·fuzz 28/15985 genuine) | L | [gap-3d](nbl-gaps/gap-3d.plan.md) |

## 2. 공유 파일 충돌 매트릭스

여러 갭이 **같은 파일**을 수정한다. 신규 필드는 distinct하나 동일 파일 동시 편집은 머지 충돌을 부른다 → §3 순차 머지로 회피.

| 파일 | 관련 갭 | 충돌 위험 | 비고 |
|---|---|---|---|
| `lib/tax-engine/non-business-land/types.ts` | 3a(OtherLandUsage+enum)·3b(GraceReasonCode/GracePeriod 재작성)·3d(optional echo) | **중** | 3a=기타토지 블록, 3b=유예기간 블록 — 다른 영역이나 같은 파일 |
| `lib/tax-engine/non-business-land/form-mapper.ts` | 1(landLocation)·3b(grace resolveGraceIntervals) | **중** | 1=반환객체 spread, 3b=grace 블록(line 72-80) — 인접 가능 |
| `lib/tax-engine/non-business-land/form-mapper-helpers.ts` | 2(buildUnconditionalExemption)·3a(buildOtherLand) | 하 | 다른 함수 |
| `lib/tax-engine/non-business-land/pasture.ts` | 3c(warning 문자열)·3a(`computeAreaProportioning` utils 추출) | **중** | 3a가 pasture의 헬퍼를 utils로 이동 → 3c 머지 후 3a rebase 권장 |
| `lib/api/transfer-tax-schema-sub.ts` | 2(nblExemptInong)·3a(nblOther*)·3b(grace+dealer) | **중** | 모두 `nonBusinessLandRawSchema`에 필드 추가 — 순차 |
| `lib/stores/calc-wizard-asset.ts` · `-factory.ts` · `-nbl.ts` | 2·3a·3b | **중** | 모두 nbl* 필드 추가 — 순차 머지+rebase |
| `lib/calc/transfer-tax-validate-asset.ts` | 3a(면적)·3b(grace)·2(이농일) | 하 | 다른 블록 |
| `lib/tax-engine/legal-codes/transfer.ts` | 3a(OTHER_LAND_AREA_*)·3b(UNAVOIDABLE_PERIOD)·2(선택) | 하 | append |
| `components/calc/NonBusinessLandResultCard.tsx` | 3b(grace legalBasis)·3c(warnings 자동)·3a/3d(무변경) | 하 | 대부분 데이터-드리븐 |
| `app/api/calc/transfer/route.ts` · `multi/route.ts` | 1(adjacentSigunguCodes) | 없음 | 갭 1 단독 |
| `lib/tax-engine/non-business-land/period-criteria.ts` | 3d 단독 | 없음 | 5지목 공용 — 회귀 범위 큼 |
| `lib/tax-engine/non-business-land/unconditional-exemption.ts` | 2 단독 | 없음 | legalBasis 정정 |

## 3. PR 순서 · 게이트

각 PR은 독립 머지 후 다음 브랜치를 master rebase. 순서는 (a) 충돌 최소화 (b) 가치/비용 비율 (c) 회귀 범위로 결정.

1. **PR-A (갭 1, 재촌 시군구)** — 가장 시급(유일한 조용한 numeric 버그). `form-mapper.ts`(3b와 공유)를 먼저 선점.
2. **PR-B (갭 2, 이농)** — 최소비용. store/Zod(3a·3b 공유) 선점.
3. **PR-E1 (갭 3c E-1, 인용정정)** — 즉시 가능·회귀 0. `pasture.ts`를 3a보다 먼저 정정해 3a가 정정본에서 `computeAreaProportioning` 추출.
4. **PR-F (갭 3d, 버킷판정)** — `period-criteria.ts` 단독·5지목 공용 회귀 범위 큼 → 독립 윈도우에서 단독 ship(다른 갭과 절대 묶지 않음).
5. **PR-C (갭 3a, 면적한도)** — 대형. types/store/Zod/pasture(추출) 의존 → A·B·E1 이후. 3c E-1 머지 후 rebase.
6. **PR-D (갭 3b, 사유별기간)** — 대형. types/form-mapper(1과 공유) 의존 → A·C 이후 마지막. types.ts·form-mapper.ts rebase.

**각 PR 게이트(강제)**: Pre-Do anchor 우선 FAIL 확보 → 구현 → `npx tsc --noEmit` 0 → `npx vitest run __tests__/tax-engine/non-business-land/ __tests__/lib/calc/nbl-*` → 전체 `npm test` → E2E(worktree `E2E_PORT=3101`). [[feedback_pre_anchor_verification]]·[[feedback_api_zod_schema_sync]].

## 4. 자가 검토 결과 (통합 적대적 재검토)

> 워크플로 integration 단계가 KoreanLaw 429로 미완 → 메인 루프가 6개 plan을 직접 재검토.

| # | 갭 | 발견 | 심각도 | 조치 |
|---|---|---|---|---|
| SR-1 | 3a·3c | 둘 다 `pasture.ts` 수정(3a=`computeAreaProportioning` utils 추출, 3c=warning 문자열). 동시 작업 시 충돌 | 중 | **3c(E1) 먼저 머지 → 3a rebase**. 또는 3a가 추출 시 3c 정정 라인 보존 |
| SR-2 | 1·3b | 둘 다 `form-mapper.ts` `mapAssetToNblInput` 수정(1=landLocation spread, 3b=grace 블록). 인접 라인 | 중 | A 먼저 머지 → D rebase. 영역 분리(반환부 vs grace 블록) 명시 |
| SR-3 | 2·3a·3b | 셋 다 store 3종 + Zod에 nbl* 필드 추가. ⑫ Zod는 **TS 미감지 침묵 strip** | 중 | 각 PR `grep -n "신규필드" transfer-tax-schema-sub.ts` 자가점검 강제. 순차 머지+rebase |
| SR-4 | 3a | `areaProportioning` 산출해도 STEP 0.6 boolean-only 소비로 **실제 면적안분 중과 미반영**(5지목 공통). 결과카드만 표시 → 사용자 혼선 | 중 | 결과카드에 "면적 초과분 안분 중과는 후속" hint 명시 + scope out 문서화. all-or-nothing 한계 별도 후속 PR |
| SR-5 | 3b | 5호 "건설진행종료일" 미입력 시 양도일 fallback이 [[feedback_no_silent_apportion_fallback]] 위반 우려 | 중 | "건설 진행 중=양도시점까지"는 법정 해석(자동 안분 아님)으로 허용하되, Do 진입 anchor로 입력 강제 여부 **확인 필요** 명시 |
| SR-6 | 3d | 기존 통과 테스트(period-criteria.test.ts:29-41 등)를 flip. 무지성 수정 시 회귀 위장 | 높 | 각 케이스 §168의6 가·나·다로 **재계산 후** toBe 수정 + describe "법령정합 재정렬" 표기 [[feedback_anchor_correction_legal_priority]] |
| SR-7 | 3d | 1호 경계 off-by-one은 측정0(low). **2·3호 단기버킷이 genuine**(fuzz 28/15985) → 갭의 실가치는 단기버킷 | — | severity medium 유지, 1호 off-by-one은 부수 정정 |
| SR-8 | 2 | isFactoryAdjacent legalBasis "공익사업법 연계"→§83의5④1호 정정 시 본문 요건("요구 매수" vs "취득") 미확인 | 하 | KoreanLaw §83의5④ 본문 1건 재확인 후 정정 [[feedback_korean_law_citation_verify]] |
| SR-9 | 3c | per-head 수치 정합(E-2)은 별표 1의3 정본 **미확보 blocker** — E-1(인용정정)만 즉시, E-2 분리 | — | E-1/E-2 PR 분리. numeric 무변경 동결(LIVESTOCK 값 불변 anchor) |
| SR-10 | 1 | 연접 매트릭스 빈 상태(`MATRIX_VERSION 0000-00-00`) → 연접 분기 비활성, **same-district만 동작** | 하 | numeric flip은 same-district로 충족. 연접은 데이터 주입(별건) 후 활성 — 주입 경로만 미리 배선 |

## 5. 테스트 전략

- **Pre-Do anchor 우선(전 갭 강제)**: 각 갭 상세 문서의 isPreDo anchor를 Do 진입 전 먼저 작성·실행 → 현행 엔진이 틀린 값(비사업 과대판정·areaProportioning undefined·grace 0·meets 오판) 내는 것을 FAIL로 고정 → 디자인 환류.
- **갭별 신규 anchor 파일**: `nbl-area-limits`·`grace-reason-period`·`bucket-criteria`·`pasture`(인용)·`nbl-detailed-cases`(재촌·이농).
- **회귀 핵심 — `period-criteria.ts`(갭 3d)**: meetsPeriodCriteria 호출자 5종 = farmland·forest·pasture·other-land·**villa-land**(`:64,:101`). **housing-land는 호출 0건(period-criteria 비의존, 회귀 0)** — R1 정정. `qa-land-type-flow`·`integration`·각 `{지목}.test.ts`·`villa-land.test.ts`·`grace-wiring`·`qa-period-criteria`(QA-001/004/006) 전수 재실행. partial period(농지 real·임야 재촌미달·villa nonVilla)만 영향, fullPeriod 경로는 회귀 0 예상이나 전수 확인.
- **prefix-pick 침묵 strip 방지**: 갭 2·3a·3b는 ⑫ Zod 누락 시 TS 미감지 → 각 PR `grep` 자가점검(⑫⑭ 신규 필드 3파일 hit).
- **전체 회귀**: 커밋/PR 전 `npm test` 전체(세법 회귀 허용치 0). 사전존재 실패 ~23건은 [[feedback_e2e_preexisting_failures]] 기준 회귀 판정에서 제외(기능 spec 단독+baseline 대조).
- **E2E(worktree)**: `E2E_PORT=3101 npx playwright test`. 재촌 시군구 입력·이농 toggle·면적한도 선택·유예사유 12종을 신규 spec으로.

## 6. 전체 리스크 · 확인 필요 항목

- **KoreanLaw 429 rate limit**: 본 계획 워크플로에서 갭 2 planner가 throttle됨. Do 단계에서 별표 정본·본문 재확인 시 **순차 호출+재시도** 필요(동시 다발 호출 회피).
- **별표 1의3 정본 미확보(3c E-2 blocker)**: `get_annexes` 도구가 별표 1의3 표 추출 불가(별지서식만 반환) → 법제처 정본 HWP/PDF 직접 확보 필요. E-2 착수 전제.
- **별표3·4·5·6(3a)**: `get_annexes(별표3)` 성공 확인 — 단 표 구조 복잡(종목별 행+비고 가산). 1차는 `standardAreaLimit` 직접입력, 별표 자동산출은 후속.
- **§168의6 일수 환산(3d)**: "소유기간−3년/−2년", "5년/3년 버킷 경계"의 달력 N년 vs N×365 환산 — 현행 divergence는 두 모델 동일 결론이라 진행 가능하나, 집행기준/판례 1건 **확인 필요**.
- **§83의5④1호 요건(갭 2)**: 공장 인접 "요구 매수" vs "취득" 본문 **확인 필요**.
- **§83의5①5호 건설진행종료일(3b)**: 입력 강제 vs 양도일 fallback **확인 필요**(Do anchor로 확정).
- **STEP 0.6 boolean-only 한계(3a)**: 면적 부분 안분 중과는 5지목 공통 별도 과제 — 본 시리즈 scope 밖, 후속 추적 필요.

## 7. 참조

- 검증 메모리: `project_transfer_nbl_gaps`(MEMORY 인덱스) — 재검증 결과 반영됨.
- 정책: [[feedback_pre_anchor_verification]]·[[feedback_api_zod_schema_sync]]·[[feedback_numeric_impact_verify_before_bug_claim]]·[[feedback_korean_law_citation_verify]]·[[feedback_no_silent_apportion_fallback]]·[[feedback_anchor_correction_legal_priority]].
- CLAUDE.md: 14 동기화 지점 Definition of Done, 새 기능 워크플로(엔진+UI 시니어 병렬 Plan → 시퀀셜 Do).

---

## 🔍 R1 자가검토 정정 (2026-06-16, plan-design-self-review-loop · 실측 검증, 결함 55건)

> 7-에이전트 검토(인용 grep/Read 실측). 본 절이 본문과 충돌 시 우선. 갭별 상세는 각 `gap-*.plan.md` R1 절 참조.

### 충돌 매트릭스 정정 (§2)
| 파일 | 정정 |
|---|---|
| `components/calc/transfer/nbl/NblSectionContainer.tsx` | **신규 행 추가**: 갭 1(토지소재지 SigunguSelect, 거주이력 게이트 영역)·갭 2(**anyExempt:53-60에 nblExemptInong**)·갭 3b(단서 ToggleCard, 공통지원필드). 위험 **중** — A→B→D 순차 머지·rebase |
| `lib/tax-engine/non-business-land/form-mapper-helpers.ts` | 갭 3b 추가: **GracePeriodInput 정의 :39** 존재(엔진측). 단 R1 결정상 **변형 대신 신규 `NblGracePeriodInput` 도입** → 공유 위험 **하**로 하향(기존 타입 불변) |
| `lib/stores/calc-wizard-asset-nbl.ts` | 갭 3b: GracePeriodInput[]을 **pasture(:182)·villa(:186)·grace(:209) 3곳 공유** — grace만 신규 타입으로 분리(pasture/villa 불변) |

### 테스트 전략 정정 (§5)
- **"5지목" 정정**: period-criteria.ts 호출자는 farmland·forest·pasture·other-land·**villa-land**(`:64,:101`) 5종. **housing-land는 호출 0건**(period-criteria 비의존, 회귀 0). §5·gap-3d 회귀목록의 `housing-land`→`villa-land`.

### 자가검토 테이블 보강 (§4)
| # | 갭 | 발견 | 심각도 |
|---|---|---|---|
| SR-11 | 2 | **anyExempt 이중 집계** — NblSectionContainer.tsx:53-60(opacity 게이트) + UnconditionalExemptionSection.tsx:14-21 **둘 다** nblExemptInong 합류 필수. 한 곳 누락 시 의제 활성인데 폼 dimming 안 됨 | **Critical** |
| SR-12 | 3b | **GracePeriodInput 변형 금지** — store(:26)·helpers(:39) 2정의 + store형은 pasture/villa/grace 3사용. 12-union 변형 시 pasture/villa 오염 → 신규 `NblGracePeriodInput` 도입 | **Critical** |
| SR-1 정정 | 3a·3c | 3a가 computeAreaProportioning을 `utils/`로 추출 → **3c(E1) 먼저 머지 → 3a rebase** (pasture.ts 공유) | 중 |

### 확인 필요 보강 (§6)
- **연접 데이터 이중 소스**: `administrative-district-adjacency.json`=빈 `{}` vs `sigungu-codes.ts SIGUNGU_CODES[].adjacentCodes`=충전됨. 갭 1 route 주입을 SIGUNGU_CODES 기반으로 가져갈지 + `getAdjacentSigunguCodes` 자리수(5/10) 정합 결정.
- **gap-3a anchor**: AreaProportioning에 `buildingMultiplier:1` 포함, `toBe`→`toEqual`.
- **SR-8 해소**: 공장인접 §83의5④1호 본문(취득·인접토지 구조) 본 검토로 확정 — Do 재확인 불요.

### PR 순서 영향
- 변동 없음(A→B→E1→F→C→D). 단 NblSectionContainer.tsx를 A·B·D가 공유 → A·B 머지 후 D rebase 시 해당 파일도 확인.

# 작업 계획서 — 도움말 간소화 4세목 확장 (양도·취득·재산·종부세)

> 상태: Plan (Do 미착수)
> 작성일: 2026-06-25
> 부모 계획: [inheritance-gift-help-declutter.plan.md](./inheritance-gift-help-declutter.plan.md) · [inheritance-gift-help-declutter-phase1b-3.plan.md](./inheritance-gift-help-declutter-phase1b-3.plan.md)
> 선행: 상속·증여 파일럿 ✅ PR #347 (Phase 1·1b·2 머지, Phase 3 rose는 Do-time 실측으로 SCOPE_OUT)
> 범위: **양도·취득·재산·종부세 4개 세목 입력 마법사**. 파일럿과 **동일한 4-Phase 패턴**을 세목별 worst-offender에 적용.
> 접근(확정): 분량 감축은 부차, **수치 가시성(Phase 2) + 의도적 접기(Phase 1)가 본체**. 가드레일 5종(GR-1~5)을 그대로 강제.

---

## 1. 배경 · 파일럿 교훈

상속·증여 파일럿에서 확인된 핵심 교훈 3가지 + **4세목 실측으로 추가된 교훈 1가지**를 이번 확장의 설계 전제로 삼는다.

1. **"분량이 많다"보다 "위계가 없다 + 항상 노출"이 문제**다 — 큰 덩어리(항상 펼친 설명 블록)는 Phase 1에서 처리하고, 잔여 가치는 **수치 가시성(Phase 2)**과 **색 의미 명료화(Phase 3)**에 있다.
2. **Phase 2(hint 수치 → 라벨 승격)가 가장 가치 큰 작업**이었다 — "중요 수치가 회색 `FieldCard hint=`에 묻힌다"는 원 불만에 직접 대응.
3. **Phase 3(rose 색 표준화)는 대체로 SCOPE_OUT**으로 귀결됐다 — 실제 코드의 rose 사용은 이미 의미상 정당(손실·차단·파괴)한 경우가 대부분. 일괄 치환은 churn·오분류.
4. ⚠️ **4세목 실측 추가 교훈 — Phase 2의 전제("hint에 묻힘")가 4세목엔 거의 성립하지 않는다**. 파일럿(상속·증여)은 한도가 실제 회색 `FieldCard hint=`에 묻혀 있었으나, 4세목은 수치 대부분이 이미 `ToggleCard.description`·`<p>` 본문·`RadioCardGroup` 옵션 description에 **인라인 노출**돼 있다(실측: 양도 3%·85㎡=hint 문장 명시 / 660㎡·200㎡·120%=RadioCard 옵션 description / 재산 9억=ToggleCard description·+5%=`<p>` 본문 / 종부 전년도세액=hint에 "세부담상한 계산용" 명시 / 취득=TaxHelp·description). → **4세목의 진짜 본체는 Phase 1(의도적 접기)**이며, Phase 2는 "묻힘 해소"가 아니라 **법령 §번호 배지 보강 + 진짜 묻힌 소수 케이스 한정**으로 축소된다. 파일럿보다 declutter 여지 자체가 작다.

→ 따라서 4세목 확장은 **Phase 1(의도적 접기)에 집중**하고, Phase 2는 **소수 유효 후보(취득 자경농지 20,000㎡ 등) + 법령 §번호 보강에 한정**한다. Phase 3은 후보만 식별 후 케이스별 판정(대체로 유지 예상).

---

## 2. 실측 인벤토리 종합 (4세목)

> 출처: 2026-06-25 병렬 인벤토리 조사(Explore ×4). 모든 수치는 grep/Read file:line 실측.

| 세목 | 색상 안내 카드 | FieldCard `hint=` | 섹션 설명문 `<p>` | rose 배경 | 기존 접기 인프라 |
|---|---|---|---|---|---|
| **양도(transfer)** | ~277 | ~206 | ~1 | ~41 | 0건(`ExpandToggleButton` 2건은 결과카드 전용) |
| **취득(acquisition)** | ~36 | 1 | ~5 | ~9 | 0건(`TaxHelp` 팝업 30+개로 대체) |
| **재산(property)** | ~7 | ~12 | ~14 | ~1 | 0건(`ExpandToggleButton`만) |
| **종부(comprehensive)** | ~15 | ~5 | ~10+ | ~2 | `ExpandToggleButton`(PropertyCardEditor), `CollapsibleHintCard` 미사용 |

**세목별 진단**:
- **양도**: 압도적 규모(카드 277·hint 206). 그러나 worst-offender 대부분이 `ToggleCard`/`RadioCardGroup` **계산 분기축** → 접기 부적합. Phase 2 후보 수치(3%·85㎡·660㎡ 등)도 실측 결과 **이미 hint 문장·RadioCard 옵션 description에 노출** → 승격 가치 작음. **실효 작업은 접기 적합 2섹션 + 법령 §번호 보강뿐.**
- **취득**: `TaxHelp` 팝업(이미 접힘 메커니즘)으로 도움말을 광범위하게 흡수 중. 항상-펼친 안내 소수. **declutter 여지 최소 → 경량 Phase 1 2건 + Phase 2 자경농지 20,000㎡ 1건.**
- **재산**: Step0에 도움말 65% 집중(hint 12 중 12, 카드 22/34). **접기 후보 명확.** 단 Phase 2 후보(9억·+5%)는 이미 description·`<p>`에 노출 → 라벨 격상은 선택적.
- **종부**: `Step1Basic.tsx`가 worst. `YearLawHintCard`(연도별 세법 요약·49줄 순수 참고)가 접기 1순위. **본 세목이 4세목 중 Phase 1 가치 최대.**

---

## 3. 목표 · 성공 기준 (측정 가능 — 부모 G1~G6 계승)

| # | 성공 기준 | 측정 방법 |
|---|---|---|
| G1 | **빈 폼 신규 진입 시** 세목별 always-on 안내 카드/설명문이 식별된 접기 대상 범위에서 감축 | before/after: 각 세목 대상 Step 빈 폼 초기 렌더 카운트 |
| G2 | **검증 오류·차단 경고 100% 항상 가시** (접힌 섹션에 들어가도 강제 펼침) | E2E: 필수 미입력 → 오류가 화면에 보임(접힘 무관) |
| G3 | **실효 Phase 2 후보**(종부 `LandParcelSection:221` hint 명료화·종부 §10 배지·취득 자경농지 20,000㎡)만 처리 — 나머지는 이미 노출(SCOPE_OUT) | grep: 해당 텍스트가 라벨/hint에 존재. SCOPE_OUT 항목은 변경 0 확인 |
| G4 | rose 색 = 검증 오류·차단·무효 전용 (후보 식별 후 케이스별 판정) | grep: rose 사용처가 오류/차단/무효/카테고리 의미에 한정 |
| G5 | 기존 동작·계산 **회귀 0** (tsc 0건·전체 vitest·세목 E2E) | `npm run check:pre-pr` + 세목 E2E |
| G6 | 데이터/필수/오류 섹션은 **자동 펼침**(클릭수 가드) | E2E: 값 있는 상태로 재진입 시 해당 섹션 펼쳐짐 |

---

## 4. 설계 원칙 + 가드레일 (부모 GR-1~5 그대로 강제)

분량 감축은 **숨김**이므로 5가지 가드레일을 동시 적용한다(부모 계획 §4와 동일).

- **GR-1 (법적 정보 숨김 방지)**: 접히는 것은 *서술형 설명·요건 해설·중복 안내*뿐. **법정 한도 수치·검증 오류·차단 경고는 접기 대상 아님**. 수치는 hint→라벨/배지 승격.
- **GR-2 (오류 절대 비은닉 — render-derive)**: 접힌 섹션이 오류/차단을 포함하면 자동 펼침. `open = userToggled ?? (hasError ‖ hasData ‖ required)`, 오류 시 `open ‖ hasError` 강제 펼침. `useEffect→state` set 금지(GR-4).
- **GR-3 (클릭수 가드)**: 기본 접힘이되 ① 데이터 있는 섹션, ② 단계 필수/대표 섹션, ③ 오류 포함 섹션은 초기 펼침.
- **GR-4 (인쇄·미러링·무한루프 안전)**: 인쇄 CSS-only 자동 펼침(`hidden print:block` — `print-only-css-toggle`). 펼침 상태 `useEffect→store` 미러링 금지(`feedback_useeffect_store_mirror_forbidden`). tone은 정적 Record(`feedback_tailwind_static_tone_mapping`).
- **GR-5 (접힌 본문 unmount 금지)**: CSS hidden 토글만(본문 DOM 유지). unmount 시 입력값·포커스·교차필드 검증 소실·validation 우회 위험.

**추가 가드 (4세목 특화)**:
- **GR-6 (ToggleCard 축 불변 — 핵심)**: 4세목 worst-offender의 다수가 `ToggleCard`/`RadioCardGroup`이며, 이들은 **적용여부/계산 분기축**(ON/OFF·선택이 계산 포함을 결정)이다. **절대 Collapsible로 교체 금지**(`feedback_three_state_optional_mode_toggle` — 의미 파괴·은닉 위험). 접는 것은 *그 안의 긴 서술 본문*뿐.
- **GR-7 (TaxHelp 중복 금지 — 취득세 특화)**: 취득세는 `TaxHelp` 팝업이 이미 상세 안내를 담당(접힘 상태). 동일 내용을 `CollapsibleHintCard`로 이중 제공하지 않는다 — 항상-펼친 안내만 대상.

---

## 5. 작업 분해 — 세목별 Phase

> 우선순위: **재산 → 종부 → 양도(수치 승격 한정) → 취득(경량)**. 작은·명확한 것부터 패턴 검증 후 큰 것으로.
> 4세목은 **표시층만 변경**(엔진·validation 불변)이라 한 PR 또는 세목별 PR 분리 모두 가능. 세목별 E2E 회귀 단위로 **세목당 1 PR 권장**.

### 5-A. 재산세 (property) — 접기 후보 명확

**Phase 1 (접기)** — ⚠️ Do-time 실측으로 후보 대폭 축소. 실효 = **골프장 경고 1건**:
- ~~`Step0.tsx:251-264` 도시지역 토글~~ → **SCOPE_OUT**: `ToggleCard`(rose) 축(GR-6). 기본 펼침 아님.
- ~~`Step0.tsx` 소유 형태 `OwnershipSection`~~ → **SCOPE_OUT**: `OwnershipSection` 자체가 이미 `ToggleCard` 접이식(`Step0.tsx:332`, `open` state)이라 기본 화면 미노출. 내부 amber 카드(`:526`·`:553`)는 서술 안내가 아니라 **데이터 입력 그룹 헤더**(GR-5 unmount 위험) → 손대지 않음.
- ✅ `Step2Separated.tsx:56-63` 고급 골프장 경고 카드(amber) — 순수 안내 → `CollapsibleHintCard` 강등. **재산세 유일 실효 접기.**
- ~~`Step2SeparateAggregate.tsx` 공장/철거~~ → **SCOPE_OUT**: `ToggleCard` 축(GR-6).

**Phase 2 (수치 승격 — 선택적, 低가치)**: ⚠️ 실측 결과 두 수치 모두 **이미 노출** — "묻힘 해소"가 아니라 라벨 격상(중복 강조). 우선순위 Low, 시간 여유 시만.

| 위치(실측) | 현재 상태(실측) | 선택적 격상안 |
|---|---|---|
| `Step0.tsx:197` 1세대1주택 토글 | description에 **이미** "공시가격 9억 이하 시 적용" 노출 | (선택) 토글 라벨로 "(공시 9억 이하)" 승격 — 중복이므로 보류 가능 |
| `Step0.tsx:155-157` 직전연도 공시가격 | `<p>` 본문에 **이미** "직전연도 과세표준 + 5% (§110③)" 노출 | (선택) 라벨에 "(상한 +5%)" 배지 — `<p>`가 이미 명확하므로 Low |

**Phase 3 (rose)**: 후보 1건(`UrbanAreaLookup` 판정 결과 카드) — 판정 결과 색이므로 **유지 예상**.

---

### 5-B. 종합부동산세 (comprehensive) — YearLawHintCard 1순위

**Phase 1 (접기)**:
- ✅ `Step1Basic.tsx:88-136` `YearLawHintCard`(amber, 49줄) — 과세연도별 기본공제/세율/세부담상한 **순수 참고**(계산 무영향) → `CollapsibleHintCard` **1순위·4세목 최대 가치**.
- ~~`Step1Basic.tsx:288-314` 법인 §9② 도출 배지~~ → **SCOPE_OUT**(Do-time 실측): 법인 선택 + corpReqKey 조건부로만 노출(항상 노출 아님). amber 배지는 "요건 충족 여부를 선택하면…" **액션 유도 안내**(GR-2: 접기 부적합). 도출 결과 미리보기를 접으면 응답 직후 피드백 은닉.
- `Step1Basic.tsx:319-361` 1세대1주택자 세액공제·`:365-424` 부부공동명의 특례 — **ToggleCard 축**(GR-6 유지). 손대지 않음.

**Phase 2 (수치 승격 — 진짜 묻힌 1건 + 법령 보강)**: ⚠️ `page.tsx:327` hint는 이미 "세부담 상한 계산용" 명시. 진짜 가치는 `LandParcelSection.tsx:221` 범위 명료화.

| 위치(실측) | 현재 상태(실측) | 처리안 |
|---|---|---|
| `LandParcelSection.tsx:221` 직전연도 총세액 hint | 합산 범위 모호(농특세 포함 여부 불명) | **hint 명료화** → "직전연도 재산세+종부세 합계 (농특세·지역자원시설세 제외)" — ⭐ 진짜 가치 |
| `page.tsx:327` 전년도 세액 hint | **이미** "종합합산 토지 세부담 상한 계산용" 노출 | hint에 "(§15①)" 보강. ✅ **KoreanLaw 실측 확정: 종부세 토지분 세부담상한 = §15①**(주택분 §10과 구분). 종합합산 토지이므로 §15① |
| `Step1Basic.tsx:105-107` 기본공제(YearLawHintCard 내) | 9억/12억 — **이미 정확** | 변경 불필요(접기 대상이므로 Phase 1에서 처리) |

**Phase 3 (rose)**: 후보 2건(`page.tsx:117` 1세대1주택 불일치 경고·`LandParcelSection.tsx:160` 필지 삭제 버튼) — 각각 차단 경고·파괴 액션 → **유지**.

**연동 안내 점검**: 재산세 고지서 참조 안내(`page.tsx:304,316`)는 입력 정확도 직결 → 유지/강조.

---

### 5-C. 양도소득세 (transfer) — 접기 2섹션 한정 (Phase 2 = SCOPE_OUT)

> 양도세는 worst-offender 대부분이 계산 분기축(ToggleCard/RadioCardGroup)이라 **Phase 1 접기 후보가 2섹션뿐**이고, Phase 2 수치 승격은 실측 결과 전부 이미 노출(SCOPE_OUT). **실효 작업 = 접기 2섹션.** 규모 277카드·206hint에 비해 실제 손댈 곳은 매우 적다.

**Phase 1 (접기 — 제한적)**:
- `RedevelopmentBlock.tsx:369-392` 인가전 분 취득가(sky) — 실가 모드 조건부 섹션. 순수 입력 → `CollapsibleHintCard` 헤더 축약 검토(이미 조건부 렌더이므로 중복 제거 수준).
- `GeneralBuildingBlock.tsx:368-392` 취득시 기준시가(amber, ③) — `useEstimatedAcquisition` 조건부. 헤더만 남기고 접기.
- **나머지 worst-offender 전부 GR-6 유지**: `ReceiveOnlyToggleCard`(L488-519)·RadioCardGroup·`OtherLandDetailSection` 호별 분기 — 접기 절대 금지.

**Phase 2 (수치 승격 — 실측 결과 대부분 SCOPE_OUT)**: ⚠️ 당초 "高가치·본체" 판정은 **오인**이었다. 실측 결과 후보 수치가 전부 이미 노출돼 있었다.

| 위치(실측) | 현재 상태(실측) | 판정 |
|---|---|---|
| `GeneralBuildingBlock.tsx:371` | hint에 **이미** "이 금액의 3%가 건물 개산공제액 (§163⑥)" 노출 | **SCOPE_OUT** — 이미 명확. 라벨 격상 불요 |
| `GeneralBuildingBlock.tsx:550` | hint에 **이미** "§114조의2① … 85㎡ 초과 시 가산세 적용" 노출 | **SCOPE_OUT** — 이미 명확 |
| `OtherLandDetailSection.tsx` 660㎡·200㎡·120% | `FieldCard hint`가 **아니라** `RadioCardGroup` 옵션 description("660㎡ 이내까지 사업용 (고정)" 등). 선택지 아래 **이미 인라인 노출** | **SCOPE_OUT** — RadioCard 옵션 description은 인라인이라 승격 대상 아님 |

> **결론**: 양도세 Phase 2는 실효 작업 없음(SCOPE_OUT). 수치 가시성이 이미 충족됨. 양도세의 실효 작업은 **Phase 1 접기 2섹션뿐**.

**Phase 3 (rose)**: 41건 중 대부분 중과·차단·무효 의미. **후보 식별만**, 일괄 치환 금지.

---

### 5-D. 취득세 (acquisition) — 경량 (TaxHelp 이미 정돈)

> 취득세는 `TaxHelp` 팝업 30+개로 도움말을 이미 흡수. **항상-펼친 안내가 소수**라 최소 작업. GR-7(TaxHelp 중복 금지) 강제.

**Phase 1 (접기 — 소수)**:
- `Step0.tsx:207` 간주취득 안내 배너(violet) — 정보성 → `CollapsibleHintCard`(간주취득 선택 시만 노출).
- `Step2.tsx:286-291` 법인 안내 배너(blue `infoBannerCls`) — 정보성 → `CollapsibleHintCard`(법인 선택 시만).
- `InstallmentPaymentsSection.tsx:119-128` 2년 미만/이상 경고·성공 배너 — **계산 검증 경고이므로 유지**(GR-1·GR-2).

**Phase 2 (수치 승격 — 대부분 이미 노출)**:
- 대부분 `ToggleCard.description`·`TaxHelp`에 이미 명시(생애최초 200/300만·수도권 1억/비수도권 2억·사치성 9억·농특세 100㎡). **추가 승격 거의 불필요.**
- 유일 후보: `Step5.tsx` 자경농지 ToggleCard description에 **20,000㎡**(현재 TaxHelp에만) 추가 검토.

**Phase 3 (rose)**: 9건 — 중과·차단·금지 사유 의미. **유지 예상.**

---

## 6. 리스크 · 정책 정합

| 리스크 | 대응 |
|---|---|
| **ToggleCard/RadioCard 축 파괴**(4세목 다수) | GR-6: 적용여부·계산 분기축은 Collapsible 전환 절대 금지. 내부 서술만 접기 |
| 법적 정보 숨김 | GR-1: 한도·오류·차단 접기 제외. 수치 라벨/배지 승격 |
| **종부세 세부담상한 §15 인용** | `page.tsx:327`(종합합산 토지)은 토지분 §15①. 주택분 §10과 구분. ✅ KoreanLaw 본문 대조 완료(§15 토지분·§10 주택분) |
| 취득세 TaxHelp 이중 제공 | GR-7: 항상-펼친 안내만 대상, TaxHelp 내용 중복 금지 |
| `useEffect→store` 미러링 무한루프 | GR-2 render-derive·display fallback |
| 접힘 시 폼 상태 소실·validation 우회 | GR-5: CSS hidden만, unmount 금지 |
| **차단 validation E2E 광범위 영향** | 표시층만 변경(계산·validation 불변). 세목별 전 경로 E2E 회귀(`feedback_blocking_validation_full_e2e_regression`) |
| 펼침토글 grep 거짓 0건 | 경로 직접 나열·BSD `▼|▲`(`feedback_result_expand_toggle_standard`) |
| stale E2E 오판 | 세목별 baseline 대조(`feedback_e2e_preexisting_failures`) |
| 섹션번호 정책 충돌 | 번호·색상을 접힌 헤더에 유지 → 위반 아님(`feedback_section_card_numbering`) |

---

## 7. 검증 계획 (Definition of Done)

세목별로 반복:
- [ ] Phase 0 감사표 재확인 — 본 계획 §2 실측을 Do 직전 file:line 재검증(드리프트 주의)
- [ ] Phase 1-0 ToggleCard/RadioCard 축 분류 — 접기 대상이 순수 서술인지 확정(GR-6)
- [ ] **Pre-Do anchor**: 각 세목 첫 접기 섹션 1건 E2E 우선 작성(접힘/펼침/오류 강제펼침)으로 패턴 검증 후 확장(`pre-do-anchor-verification`)
- [ ] 접힘 본문 unmount 안 함(GR-5) — 접었다 펴도 입력값·포커스 보존 E2E
- [ ] Phase 2 (해당 세목만): 격상/명료화 수치가 라벨·hint 텍스트에 grep 존재 + 중복 제거
- [x] **종부 §15 인용**: 종합합산 토지 전년도 세액 = 토지분 §15①(주택분 §10과 구분). ✅ KoreanLaw 본문 대조 완료
- [ ] **양도 Phase 2 = SCOPE_OUT** 확인(수치 이미 노출, 신규 승격 작업 없음)
- [ ] 세목별 전체 E2E 회귀(baseline 대조 — stale spec 주의)
- [ ] `npx tsc --noEmit` 0건 · 전체 `npm test`
- [ ] rose/hint grep 자가점검(경로 직접 나열)
- [ ] 인쇄 자동 펼침 **E2E** 확인(수동 금지 — `feedback_browser_verify_with_playwright`)
- [ ] code-analyzer 변경 diff High/Medium 0

---

## 8. 순서·규모 권장

1. **재산세 먼저**(접기 후보 명확·소규모) → 패턴 검증
2. **종부세**(YearLawHintCard 1순위 — 4세목 중 Phase 1 가치 최대·중규모, + §10 hint 보강)
3. **양도세**(Phase 2 = SCOPE_OUT 확정 → **접기 2섹션만**: RedevelopmentBlock ⑤·GeneralBuildingBlock ③)
4. **취득세 마지막**(경량 — Phase 1 2건 + Phase 2 자경농지 20,000㎡ 1건)

> ⚠️ **규모 재평가(실측 후)**: 당초 양도세를 "高가치 본체"로 봤으나, 실측 결과 4세목 전체 실효 작업은 **주로 Phase 1 접기 + 종부 hint 보강 1건 + 취득 자경농지 1건**으로 축소. 파일럿(상속·증여)보다 작은 작업이다. 가치 대비 비용을 고려해 **재산·종부 2세목 먼저 1 PR로 처리 후, 양도·취득은 효과 확인 뒤 진행** 권장(과투자 방지).

> 🔴 **양도·취득 Do-time 실측 결론(2026-06-25) — 보류 권장**: 재산·종부 완료(✅ 커밋 `59554e0f`) 후 양도·취득 후보를 실측한 결과, **후보 섹션이 전부 이미 조건부 렌더**(특정 모드/선택 시에만 노출)라 "항상 노출 제거"라는 declutter 목적에 해당하지 않음:
> - 양도 `RedevelopmentBlock ⑤`: `{!useEstimatedAcquisition && redevIsSuccessorMember !== "yes"}` 조건부. 내부 sky 안내는 "실거래가 확인되면 입력, 아니면 환산 토글 ON" **사용자 액션 가이드**(GR-2 접기 부적합).
> - 양도 `GeneralBuildingBlock ③`: 취득가액 입력 필수 영역(조건부). violet 개산공제 산식 안내만 접기 가능하나 가치 미미.
> - 취득 `Step0` 간주취득 배너(`{isDeemed}`)·`Step2` 법인 배너(`{isCorporation}`): 둘 다 이미 조건부 + 2~3줄 짧은 안내 → 접기 가치 미미.
> - 취득 `Step5` 자경농지 20,000㎡: TaxHelp 팝업에 이미 상세, ToggleCard description은 핵심 요건만(적정). 추가 시 길어짐.
>
> → **양도·취득 declutter는 과투자로 판정. 보류.** declutter 실효 가치는 재산·종부(특히 종부 YearLawHintCard)에 집중됐고, 양도·취득의 압도적 카드·hint 수(277·206 / 36)는 대부분 계산 분기축이거나 이미 조건부라 손댈 여지가 없다.

**PR 전략**: 재산·종부 1 PR(`59554e0f`)로 declutter 4세목 확장은 **사실상 종결**. 양도·취득은 별 PR 미진행(보류).

---

## 9. 비범위 (Out of Scope)

- 계산 엔진·validation 로직 변경 (표시층만)
- 법조문 배지·`TaxHelp` 팝업 **삭제** (제거 아님 — 클릭=모달/팝업 유지)
- 색 팔레트 전면 리디자인 (Phase 3은 후보 식별 + 케이스별 판정만, 대체로 유지)
- 양도세 `OtherLandDetailSection` 호별 분기를 Tabs/Accordion으로 **재구조화**(접기와 별개의 큰 UX 작업 — 별도 과제)
- 모바일 전용 요약 바 레이아웃 변경(반응형 접기는 범위 내, 비용 0)
- 결과 화면(이미 펼침토글 표준 적용 완료)

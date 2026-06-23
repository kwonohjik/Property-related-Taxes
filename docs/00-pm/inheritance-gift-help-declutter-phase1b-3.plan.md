# 작업 계획서 — 상속·증여 안내문 정리 후속 (Phase 1b · 2 · 3)

> 상태: Plan (Do 미착수)
> 작성일: 2026-06-23
> 부모 계획: [inheritance-gift-help-declutter.plan.md](./inheritance-gift-help-declutter.plan.md)
> 선행: Phase 1(설명 블록 5건 기본 접기) ✅ PR #347
> 범위: Phase 1 후 잔여. **모든 대상 file:line 실측 완료**(아래 표).

---

## 0. 실측 요약 (Phase 1 이후 잔여 진단)

| Phase | 대상 | 실측 규모 | 성격 |
|---|---|---|---|
| **1b** | Farming·GiftChecklist 잔여 설명 | **작음** | Farming 설명 대부분이 (B)검증·미리보기 연동 → 접기 부적합. 실제 접기 가능분 소수 |
| **2** | hint에 묻힌 법정 수치 승격 | **중간(핵심)** | 15건 검출, 高우선 5건. 가장 가치 큰 잔여 작업 |
| **3** | rose 색 의미 표준화 | **작음** | 68건 중 일반경고 5건만 amber 재배정. 30여 건은 의미 색=유지 |

**핵심 판단**: 부모 계획의 "분량 감축"은 Phase 1으로 큰 덩어리(항상 펼친 설명 블록)를 이미 처리했다. 잔여는 **"수치 가시성(Phase 2)"과 "색 의미 명료화(Phase 3)"** 가 본체이며, 둘 다 "중요 메시지가 묻힌다"는 원 불만에 직접 대응한다. Phase 1b는 작아서 Phase 2에 부수 처리.

---

## Phase 1b — Farming·GiftChecklist 잔여 설명 (소규모, 신중)

### 1b-1. FarmingEligibilitySection.tsx — 대부분 접기 부적합 (실측)
설명 블록 14~18개 중 **(B) 검증·미리보기 연동이 다수** — 접으면 중요 메시지 은닉(GR-1/GR-2 위반):
- 자격 충족/미충족 결과 카드 (`:502-507`, `:673-689`)
- 자동 거주지 검증 미리보기 (`:606-610`, `:663-665` `ResidenceCheckPreviewCard`)
- 토글 ON/OFF 입력방식 전환 설명 (`:447`, `:525-537`)

→ **이들은 접지 않는다.** (A)순수 설명은 대부분 `ToggleCard`의 `description`(인라인, 별도 접기 불가). **결론: Farming은 신규 접기 대상 거의 없음 → SCOPE_OUT.** 대신 Phase 3에서 `:382` rose→amber 1건만 처리.

### 1b-2. GiftCreditChecklist.tsx — 항상노출 안내 `<p>` 소수만
접기 후보(순수 UI 안내, 항상 노출):
- `:127-128` "공제 항목을 입력하면 납부세액이 줄어듭니다."
- `:137-138` "해당되는 공제·세액공제 항목을 체크하면 …(없으면 건너뛰기)"

→ 이 2건을 부모 패턴(`CollapsibleHintCard`)으로 접기. 나머지는 `ToggleCard.description`(인라인)이라 대상 아님.
- **verify**: 증여 마법사 진입 시 두 안내가 접힘, 토글은 그대로.

---

## Phase 2 — hint에 묻힌 법정 수치 승격 (핵심)

**원칙(GR-1·G3)**: 법정 한도·제약 수치는 회색 hint에 묻지 말고 **필드 라벨로 승격**. hint에는 "방법론(왜·어떻게)"만 남긴다. 수치는 접기 대상 아님.

### 2-1. 高우선 5건 (실측 — 라벨 승격)

| hint 라인 | 현재 라벨(실측) | 승격 후 라벨(안) | hint 잔여 |
|---|---|---|---|
| `Step4Deductions.tsx:249` | `:246` "배우자 실제 상속액 (§19)" | 배우자 실제 상속액 **(최소 5억·최대 30억)** | "협의분할 시 자동 도출, 법정상속분보다 적을 때만 직접 입력" |
| `Step4Deductions.tsx:285` | `:282` "동거주택 공시가격 (§23의2)" | 동거주택 공시가격 **(공제 최대 6억)** | "동거주택 체크 시 자동 도출, 공시가 100%/이전80%·담보채무 차감" |
| `Step4Deductions.tsx:317` | `:314` "영농상속재산가액 (§18의3)" | 영농상속재산가액 **(공제 최대 30억)** | "농지·초지·어선 분류 시 자동 도출(시령§16⑤)" |
| `steps.tsx:250` | `:247` "① 일반 장례비(식대·제수 등)" | ① 일반 장례비 **(500만~1,000만)** | "500만 미만이면 500만 인정, 1,000만 초과분 공제 불가" |
| `GiftCreditChecklist.tsx:432` | "부모 가업 영위기간 (§30의6①)" (FieldCard+DecimalInput) | 부모 가업 영위기간 **(10년↑300억·20년↑400억·30년↑600억)** | "부모가 계속 경영한 기간(년). 비워두면 10년 적용" |

> ✅ **R2 — Do-time 실측 정정**: 당초 "다중 라벨 사이트" 우려는 **부분 오인**이었다. `:256`·`:293`·`:324`는 사용자 필드 라벨이 아니라 **`AutoSuggestBadge`의 `label` prop**(추천값 배지 텍스트)이므로 한도를 넣으면 안 된다. 실제 승격 대상 = 필드의 `CurrencyInput.label` 1곳씩:
> - 배우자 `:246` · 동거주택 `:282` + 동거 직접입력 `:297`(별도 필드, "Phase E"→"한도 6억"으로 함께 정리) · 영농 `:314` · 장례비 `steps.tsx:247`
> - **가업(`GiftCreditChecklist.tsx:432`)은 라벨 승격 제외** — 10/20/30년→300/400/600억 다단계 표는 라벨에 부적합, hint 유지가 옳음.

### 2-2. 中우선 (선택 — 동일 패턴)
`Step4Deductions.tsx:267`(금융 2억)·`:351`(가업 600억)·`:424`(증여공제표 6억·5천만)·`steps.tsx:257`(봉안 500만)·`InstallmentInputSection.tsx:82`(1~10년) 등.

- **방법**: 라벨에 `(한도 …)` 직인. 수치 길면 라벨 옆 `trailing` 배지 또는 `DeductionLimitNoticeCard` 재사용 검토.
- **verify**: 승격 수치가 라벨 텍스트에 grep 존재. hint에서 중복 수치 제거(혹은 hint는 방법론만).
- **주의**: 라벨은 항상 노출이므로 수치가 길면 모바일 줄바꿈 확인.

---

## Phase 3 — rose 색 의미 표준화 (소규모·신중)

### 3-0. severity 토큰 기준 (확정)
| 색 | 의미 | 적용 |
|---|---|---|
| 🔴 rose | **검증 오류·차단·무효·데이터 폐기** | 오직 이것만 |
| 🟡 amber | 주의·비차단 경고 | 일반 경고 |
| 🔵 sky | 중립 정보 | 정보 안내 |
| ⚪ 회색 | 보조 설명(hint) | — |
| (카테고리 색) | 의미 색(채무 financial 등) | **변경 금지** |

> ✅ **Do-time 실측 결론: Phase 3 색 재배정 = SCOPE_OUT**. 후보 5건을 코드로 직접 검사한 결과 **전부 rose가 의미상 정당**했다 — CasualtyLoss `:97`(손실 섹션 색), ShortTermReinherit `:143`(삭제 버튼=파괴), CohabitAncillaryLand `:180`("계산 요청이 차단됩니다"=차단 경고), CohabitRequirement `:177`(검증 결과 emerald/rose 쌍), Farming `:383`(rose ToggleCard와 한 쌍인 "배제 사유"). 코드의 rose 사용은 이미 잘 통제돼 있어 amber 일괄 치환은 churn·오분류. → **변경 없음.** (오류 요약 배너 3-3은 별건으로 잔존)

### 3-1. amber 재배정 후보 5건 (실측 결과 전부 rose 유지 — 참고용 기록)

| 파일:라인 | 맥락 | 판정 |
|---|---|---|
| `FarmingEligibilitySection.tsx:383` | "배제 사유" 섹션 헤더 rose-800 | amber (경고성) |
| `CohabitAncillaryLandBlock.tsx:180` | 거주요건 보조설명 카드 | amber 또는 sky (정보성) |
| `CohabitRequirementBlock.tsx:177-186` | 거주 조건 미충족 시 | **검토**: 미충족=경고면 amber, 차단이면 rose 유지 |
| `CasualtyLossSection.tsx:97-121` | 재해손실 입력 카드 | **검토**: rose=손실 의미면 유지, 단순 경고면 amber |
| `ShortTermReinheritSection.tsx:143` | 단기재상속 차감 버튼 | **검토**: 계산조정이면 중립/amber |

⚠️ **케이스별 확정 후 변경** — "손실/무효 의미의 rose"는 유지, "단순 경고의 rose"만 amber. 일괄 치환 금지.

### 3-2. rose 유지 (변경 금지)
- 데이터 폐기 버튼 `bg-rose-600` 2건(`steps.tsx:297`·`FarmingEligibilitySection.tsx:718`)
- 검증 실패/자격 미충족 5건(`FamilyBusiness:544-548` 등)
- 카테고리 의미 색 30여 건(`debt-category-meta.ts` financial 등) — `feedback_tailwind_static_tone_mapping` 매핑 객체 포함

### 3-3. (Phase 4 통합) 중요 메시지 강조 — 오류 요약 배너
색 표준화의 짝: Step 상단에 **검증 오류 요약 배너**(오류 있을 때만, rose). 부모 계획 GR-2 render-derive로 구현(`useEffect→store` 금지). 접힌 섹션의 오류도 여기 한 번 더 노출.

---

## 검증 계획 (DoD)
- [ ] Phase 1b: GiftChecklist 2 안내 접힘 E2E
- [ ] Phase 2: 승격 수치 라벨이 **각 필드 분기 수만큼** grep 존재(R2) + hint 중복 제거. before/after 라벨 캡처
- [ ] Phase 3: rose 사용처 grep → 잔존 rose가 전부 오류/차단/무효/폐기/카테고리 의미인지 1:1 확인
- [ ] 오류 요약 배너 E2E(필수 미입력 → 배너 노출)
- [ ] `npx tsc --noEmit` 0건 · 전체 `npm test`
- [ ] code-analyzer 변경 diff High/Medium 0
- [ ] 상속·증여 E2E 회귀(baseline 대조 — `project_inheritance_stale_e2e_specs`)

## 순서·규모 권장
1. **Phase 2 먼저**(가치 최대·독립) → 2. Phase 3(색·배너) → 3. Phase 1b(소규모 마무리). 한 PR로 묶기 가능(표시층, 엔진 무변경).

## 비범위
- 계산 엔진·validation 로직 변경
- Farming 설명 접기(검증 연동 다수 — SCOPE_OUT)
- 카테고리 의미 색 변경
- 색 팔레트 전면 리디자인

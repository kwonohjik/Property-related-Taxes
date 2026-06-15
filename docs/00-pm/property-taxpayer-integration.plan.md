# 재산세 납세의무자(§107) 판정 통합 작업 계획서

- 작성일: 2026-06-16
- 브랜치: `feat/property-taxpayer` (worktree: `.claude/worktrees/property-taxpayer`, slot 1 · DEV 3001 / E2E 3101)
- 베이스: master `0f594d76`
- 근거 메모리: `project_property_taxpayer_verification` · `project_property_tax_review_r1`
- 법령 검증: 지방세법 §107 현행본 (KoreanLaw MST 282559, 공포 2025-12-31 / 시행 2026-04-24) 본문 직접 대조 완료

---

## 1. 배경 — 검증된 사실 (실측 완료, 추정 아님)

### 1-1. 판정 모듈은 완성됐으나 메인 계산 흐름에 미연결 (orphaned)

| 모듈/필드 | 위치 | 상태 |
|---|---|---|
| `determineTaxpayer()` | `lib/tax-engine/property-taxpayer.ts:64` | 구현 완료 |
| `distributeCoOwnershipTax()` | `lib/tax-engine/property-taxpayer.ts:173` | 구현 완료 · **호출처 0건** |
| `determinePropertyTaxObject()` | `lib/tax-engine/property-object.ts:92` | 구현 완료 (내부에서 `determineTaxpayer` 호출, `property-object.ts:116`) · **호출처 0건** |
| `PropertyObjectResult.taxpayer` | `types/property-object.types.ts:207~266` | `{ type, name, legalBasis }` 필드 존재 |

- `calculatePropertyTax()` (`property-tax.ts:416~759`)는 Step 1~6 전체에서 위 함수를 **호출하지 않음** (grep 0건 확인).
- `PropertyTaxInput` (`types/property.types.ts:67~161`)에 납세의무자 입력 필드 **전무**. `registeredOwner`·`actualOwner`·`isTrust`·`heirs`·`coOwnershipShares` 없음. (단 `separateTaxationItem.ownerType`은 분리과세 세율 판정용 별개 필드 — 납세의무자와 무관.)
- `PropertyTaxResult` (`types/property.types.ts:204~261`)에 납세의무자 출력 **전무**.
- 결과 화면 `PropertyTaxResultView.tsx`에 납세의무자 표시 **없음**.

→ **사용자가 재산세를 계산해도 납세의무자가 판정·표시되지 않는다.**

### 1-2. 모듈 자체 법령 드리프트 (§107 현행 본문 대조)

§107 현행 구조 (검증 완료):

| 조항 | 납세의무자 |
|---|---|
| §107① 본문 | 과세기준일 현재 **사실상 소유자** (원칙) |
| §107①1호 | 공유재산 → **지분권자** |
| §107①2호 | 주택 건물·부속토지 소유자 분리 → 시가표준액 비율 **안분**, 각 소유자 |
| §107②1호 | 매매 미신고로 사실상소유자 불명 → **공부상 소유자** |
| §107②2호 | 상속 미등기 + 미신고 → 행안부령 **주된 상속자** |
| §107②3호 | 종중재산 미신고 → 공부상 소유자 |
| §107②4호 | 연부 매매 + 무상 사용권 → **매수계약자** |
| §107②5호 | 신탁재산 → **위탁자** (수탁자 명의 등기여도) |
| §107②6호 | 환지 체비지·보류지 → **사업시행자** |
| §107②7호 | 외국인 항공기·선박 임차 수입 → **수입자** |
| §107②8호 | 파산재단 → 공부상 소유자 |
| §107③ | 소유권 귀속 불명 → **사용자** |

발견된 오류 (모듈 연결 시 반드시 정정):

| # | 위치 | 현재 | 정정 | 심각도 |
|---|---|---|---|---|
| E-1 | `property-taxpayer.ts:84~89` | 신탁 → `type:"trustee"`, `name: actualOwner`(수탁자) | **위탁자**(§107②5호, 2020.12.29 개정) | 🔴 명백 오류 (연결 무관) |
| E-2 | `legal-codes/property.ts:117` `TAXPAYER_CO_OWNER` | `"§107③"` | **`§107①1호`** (§107③은 사용자) | 🔴 인용 오류 |
| E-3 | `property-taxpayer.ts:150~156` 기본 fallback | `name: registeredOwner` + `TAXPAYER_PRINCIPLE("§107①")` | 의미 정리 필요: §107① 본문=사실상소유자. 공부상소유자 fallback은 §107②1호 | 🟡 의미·인용 |
| E-4 | `property-taxpayer.ts:12` 주석 | "사실상 소유자 → §107① **단서**" | §107① **본문**(원칙) | 🟡 주석 |
| E-5 | `property-taxpayer.ts:115` 상속 `heirs[0]` | 첫 번째를 주된 상속인 | §107②2호 "행안부령 주된 상속자"(지분 최대→연장자). TODO(M-03) 인지됨 | 🟡 (이번 범위 결정) |

> 참고: `TAXPAYER_TRUSTEE`(`legal-codes/property.ts:118~119`)는 라벨·주석이 이미 "§107②5호 / 현행은 위탁자"로 정정돼 있음 — **상수는 맞고 모듈 로직(E-1)만 틀림**.

### 1-3. 과세기준일(6/1) default 부정확

- `property-tax.ts:422~424`: `input.targetDate ?? new Date().toISOString().slice(0,10)` → 미입력 시 **오늘**.
- `route.ts:87`: `toOptionalDate(input.targetDate) ?? new Date()`.
- §114는 "매년 6월 1일". `taxYear`만 연도로 쓰므로 FMR 등 연도기반 로직은 대체로 무해하나, 정확값은 `${taxYear}-06-01`.

### 1-4. 미구현 분기

§107①2호(주택 건물·토지 분리 안분), ②3호(종중), ②4호(연부 매수계약자), ②6호(체비지 사업시행자), ②7호(외국인 수입자), ②8호(파산재단), ③(사용자) — 현재 모듈에 없음.

---

## 2. 작업 범위 (제안)

납세의무자 판정을 **사용자 계산 경로에 실제 연결**하는 것이 목표. 단계적으로 나눈다.

### Phase A — 법령 핫픽스 (연결 무관, 즉시·독립)
- E-1 신탁 수탁자→위탁자, E-2 공유재산 인용, E-3/E-4 의미·주석 정정.
- `PropertyTaxpayerType`에 위탁자 의미 반영 (아래 §3-4 결정).
- 기존 `property-taxpayer.test.ts` anchor 갱신 (법령 정합 우선 — `feedback_anchor_correction_legal_priority`).

### Phase B — 엔진 통합 (메인 흐름 연결)
- `PropertyTaxInput`에 납세의무자 입력(nested) 추가.
- `calculatePropertyTax()`에 **Step 0: 납세의무자 판정** 추가 → `determineTaxpayer()` 호출.
- 공유재산이면 `distributeCoOwnershipTax()` 호출하여 지분별 안분 결과 산출.
- `PropertyTaxResult.taxpayer`(+`coOwnershipDistribution?`) 출력 추가.

### Phase C — API/UI 통합 (14지점)
- Zod 스키마·route 매핑·폼 상태·UI 위젯·결과 카드·validation 동기화.

### Phase D — 6/1 default 고정 (선택, 저위험)
- default를 `${taxYear}-06-01`로. 단 route/엔진 양쪽 + Date 직렬화 함정(`lib/api/date-coerce.ts`) 점검.

### 범위 외 (후속 PR 후보 — 이번엔 명시 보류)
- §107①2호 주택 건물·토지 분리 안분 (과세표준 안분 로직과 결합 — 복잡, 별도 설계 필요).
- §107②3호·4호·6호·7호·8호, §107③ 추가 분기.

---

## 3. 설계 결정 사항 (검토 필요)

### 3-1. 입력 구조 — nested vs flat
- **권고: nested `taxpayerInfo?` sub-object.**
  ```ts
  // PropertyTaxInput에 추가
  taxpayerInfo?: {
    registeredOwner: string;
    actualOwner?: string;
    isTrust?: boolean;
    trustType?: "self" | "other";
    isInheritanceUnregistered?: boolean;
    heirs?: string[];
    coOwnershipShares?: { ownerId: string; shareRatio: number }[];
  };
  ```
- 이유: `determineTaxpayer`가 이미 `Pick<PropertyObjectInput, ...>`를 받으므로 형태가 맞고, `PropertyTaxInput`의 기존 평면 필드(과세표준·세율용)와 개념이 분리돼 혼동이 없음.
- **ownerType 충돌 주의**: `PropertyObjectInput.ownerType`은 4종(individual/corporation/government/nonprofit, 납세의무자 모듈용)인데 `separateTaxationItem.ownerType`은 2종(individual/corporation, 분리과세 세율용). 둘은 **별개**. `taxpayerInfo`에 ownerType을 넣을지 여부는 결정 필요(현 `determineTaxpayer` 로직은 ownerType을 분기에 쓰지 않음 → **넣지 않아도 무방**).

### 3-2. 입력은 optional — 미입력 시 동작
- `taxpayerInfo` 미입력 시 **납세의무자 판정 스킵**(결과에 `taxpayer` 미포함). 기존 계산(과세표준·세율·세액)은 100% 불변.
- 정책 정합: 자동 안분 fallback 금지(`feedback_no_silent_apportion_fallback`) — 미입력을 임의값으로 채우지 않음. 단 이 필드는 optional 부가정보이므로 "미입력=검증오류 차단"이 아니라 "미입력=판정 생략"이 자연스러움. (validation은 입력했을 때만 일관성 검증.)

### 3-3. 공유재산 안분 결과 표시
- 공유재산(`coOwnershipShares.length > 1`) 입력 시 `distributeCoOwnershipTax(determinedTax, shares)` 호출 → `PropertyTaxResult.coOwnershipDistribution?`에 공유자별 세액 노출.
- **[확정]** 안분 기준 세액 **두 가지 동시 제공**: `determinedTax`(본세, 세부담상한 후) + `totalPayable`(부가세 포함 고지액). `coOwnershipDistribution.distributions[]`에 공유자별 `taxAmount`(본세 안분)와 `totalAmount`(고지액 안분)를 모두 노출. 각각 floor 잔액을 마지막 공유자에 흡수.

### 3-4. `PropertyTaxpayerType`의 신탁 의미
- 현재 enum: `trustee`(수탁자). 현행법은 위탁자.
- **권고: enum에 `truster`(위탁자) 추가**, 신탁 분기 반환을 `truster`로 변경. `trustee`/`beneficiary`는 enum에 남기되(역사적·예외) 사용 안 함. 결과 표시 라벨은 "위탁자".
- 결과 화면 내부 id 노출 금지(`feedback_no_internal_id_in_result`) — `name.trim()` 또는 유형 라벨 표시.

### 3-5. UI 입력 위치
- 재산세 마법사 단계: 주택/비주택 2단계, 토지 3~4단계 (`PropertyTaxForm.tsx:66~86`).
- **권고: Step0(기본정보)에 접이식 "소유 형태(선택)" 섹션** 추가 — 공부상/사실상 소유자, 신탁 여부, 공유 지분, 상속 미등기 토글. 미입력 시 계산 영향 0이므로 "선택" 영역으로.
- 토글/라디오는 `ToggleCard`/`RadioCardGroup` 필수, native 금지. 3-state 모드 토글 정책(`feedback_three_state_optional_mode_toggle`) 적용 — 공유 지분 배열은 `undefined`(OFF)/`[]`(ON 빈)/`[...]`(데이터).

---

## 4. 14개 동기화 지점 매핑 (Definition of Done)

### 클라이언트 8개

| # | 지점 | 파일:라인 | 조치 |
|---|---|---|---|
| ① | 폼 상태 | `components/calc/property/shared.ts:68` `FormState` | 소유형태 필드 추가 (registeredOwner·actualOwner·isTrust·trustType·isInheritanceUnregistered·heirs·coOwnershipShares 대응 폼 필드) |
| ② | initial | `shared.ts:96` `INITIAL_FORM` | 신규 필드 초기값 (factory=normalize=UI display 3중 일치 — `feedback_store_default_vs_ui_display_fallback`) |
| ③ | normalize | (재산세 전용 normalize 부재) | sessionStorage 마이그레이션 필요 시 추가, 아니면 N/A 명시 |
| ④ | API 변환 | `shared.ts:176` `buildPropertyTaxRequestBody` | 폼 → `body.taxpayerInfo` 매핑 (입력 있을 때만 전송) |
| ⑤ | UI 위젯 | `components/calc/property/Step0.tsx` | 접이식 소유형태 섹션 (§3-5) |
| ⑥ | 사이드바 합계 | (재산세 전용 summary 부재) | 납세의무자는 금액 아님 → 합계 영향 없음. N/A (공유 안분 시 사이드바 표기는 선택) |
| ⑦ | 결과 카드 | `components/calc/results/PropertyTaxResultView.tsx:73` | 납세의무자 섹션 + 공유 안분 표 추가 |
| ⑧ | validation | `shared.ts:125` `validateStep` | 입력 시 일관성 검증 (공유 지분합 ≤ 1, 신탁 시 위탁자 정보 등). UI 통과↔validate 차단 모순 금지(`feedback_validation_sync_8th_point`) |

### API/Route 6개

| # | 지점 | 파일:라인 | 조치 |
|---|---|---|---|
| ⑨ | Zod 입력 객체 | `lib/validators/property-input.ts:19` `propertyTaxInputSchema` | `taxpayerInfo` z.object optional 추가 (⑫에 해당 — TS 미감지 strip 주의) |
| ⑩ | 엔진 input 타입 | `types/property.types.ts:67` `PropertyTaxInput` | `taxpayerInfo?` 추가 (§3-1) |
| ⑪ | route 엔진 매핑 | `app/api/calc/property/route.ts:78` `parsed.data as PropertyTaxInput` | 캐스팅만 — Date 변환 필요 필드 없으면 무변경. `taxpayerInfo` 통과 확인 |
| ⑫ | 결과 타입 | `types/property.types.ts:204` `PropertyTaxResult` | `taxpayer?: TaxpayerResult` + `coOwnershipDistribution?` 추가. **Map 금지 → Record/배열**(`feedback_engine_result_map_json_loss`) |
| ⑬ | 엔진 파이프라인 | `property-tax.ts:416` `calculatePropertyTax` | Step 0 납세의무자 판정 호출 + 결과 조립(`property-tax.ts:734`)에 필드 추가 |
| ⑭ | DB 이력 저장 | `route.ts:124` `saveCalculation` | input/result 캐스팅 자동 포함 — 무변경 확인 |

> ⑨⑩⑪⑫⑬⑭는 grep 자가 점검 필수. ⑨(Zod)·⑫⑬(타입/스프레드)는 TS가 누락을 못 잡음 → 5단 파이프라인 전수 점검.

---

## 5. Pre-Do anchor (Do 진입 전 우선 작성·실행)

정책 `feedback_pre_anchor_verification` · `pre-do-anchor-verification`: "현행 일치 예상" 금지. 아래 anchor를 **먼저 작성→실패 확보→설계 환류**.

1. **A-1 (Phase A 핫픽스 검증)**: 신탁재산 입력 → `determineTaxpayer`가 `type: truster`(위탁자), `name`=위탁자 반환. 현재는 수탁자 반환하므로 **실패해야 정상** → 수정 후 통과.
2. **A-2 (Phase B 통합 검증)**: `calculatePropertyTax({ objectType:"housing", publishedPrice, taxpayerInfo:{ coOwnershipShares:[A 0.6, B 0.4] } })` → `result.taxpayer.type==="co_owner"` && `result.coOwnershipDistribution.distributions` 합 == `determinedTax` (floor 잔액 흡수 — `feedback_floor_residual_absorption`). 현재는 `taxpayer` 자체가 결과에 없어 **타입 에러/undefined로 실패** → 통합 후 통과.
3. **A-3 (회귀 무영향)**: `taxpayerInfo` 미입력 시 기존 anchor(세액·과세표준)들이 **전부 불변**임을 기존 테스트 재실행으로 확인.

---

## 6. 작업 순서 (Do — 시퀀셜, 단일 응답 완주)

`single-response-do-execution` 계약 적용. TODO.md 체크박스로 추적.

1. **법령 상수** — `legal-codes/property.ts` E-2 정정 (+필요 시 §107①2호 등 상수 추가).
2. **타입** — `PropertyTaxInput.taxpayerInfo?`, `PropertyTaxResult.taxpayer?`+`coOwnershipDistribution?`, `PropertyTaxpayerType`에 `truster`.
3. **엔진 핫픽스(Phase A)** — `property-taxpayer.ts` E-1/E-3/E-4 + anchor A-1.
4. **엔진 통합(Phase B)** — `calculatePropertyTax` Step 0 + 결과 조립 + anchor A-2/A-3.
5. **Zod**(⑨) → **route**(⑪⑭) → **API 변환**(④).
6. **UI**(①②⑤⑦⑧) — Step0 소유형태 섹션 + 결과 카드.
7. **테스트** — `__tests__/tax-engine/property/` anchor + 전체 `npm test`.
8. **E2E** — `e2e/` 재산세 spec(소유형태 입력→계산→결과 표시). worktree 포트 `E2E_PORT=3101`.

> 신규 기능 워크플로(CLAUDE.md): Plan 단계 `property-tax-senior`(엔진) + `property-tax-ui-senior`(UI) 병렬 호출 → Do 시퀀셜(엔진 선처리 → UI) → Check `ui-engine-sync-checker`(14지점) + `bkit:gap-detector`(matchRate).

---

## 7. 테스트 계획

- **anchor**: A-1(신탁 위탁자), A-2(공유 안분 합 일치), A-3(회귀 불변). 추가: 사실상소유자, 상속 미등기, 기본(사실상소유자 원칙).
- **법령 정합 우선**: anchor 기댓값은 §107 본문 기준으로 산정(잘못된 기존값 유지 금지 — `feedback_anchor_correction_legal_priority`).
- **floor 잔액**: 공유 안분 합이 `determinedTax`와 1원도 어긋나지 않게(마지막 공유자 raw−Σfloor).
- **회귀**: `npm run test:property` 개발용 → 커밋/PR 전 전체 `npm test`(`feedback_per_tax_test_scripts`).
- **E2E baseline**: 차단 validation 추가 없음(부가 입력) → 전체 세목 회귀 영향 낮음. 단 재산세 spec 신규.

---

## 8. 리스크 / 함정

| 리스크 | 대응 |
|---|---|
| 결과 타입에 Map 사용 시 JSON 소실 | `coOwnershipDistribution`은 **배열/Record**로 정의 (`feedback_engine_result_map_json_loss`) |
| ⑨⑫⑬ TS 미감지 침묵 strip | grep 자가 점검 + 5단 파이프라인 전수 |
| display fallback ↔ store '' 침묵 | factory=normalize=UI 3중 일치 (`feedback_store_default_vs_ui_display_fallback`) |
| useEffect store 미러링 무한루프 | cross-field는 onChange/useMemo (`feedback_useeffect_store_mirror_forbidden`) |
| 외부 동시 세션 git index 경합 | 격리 worktree에서만 commit (이미 적용). reset 전 `git rev-parse HEAD` 재확인 |
| §107①2호 안분을 범위에 넣으면 과세표준 로직 결합 | 범위 외로 명시 보류, 별도 설계 |

---

## 9. 결정 확정 (2026-06-16 사용자 승인)

1. **범위**: ✅ **Phase A+B+C 전체 통합**. Phase D(6/1 default)는 **제외**. §107①2호·②3·4·6·7·8호·③는 **후속 보류**.
2. **신탁 enum**: ✅ `PropertyTaxpayerType`에 **`truster` 추가**, 신탁 분기는 `truster` 반환, 표시 라벨 **"위탁자"**. `trustee`/`beneficiary`는 미사용으로 enum 잔존.
3. **UI 입력 위치**: ✅ **Step0 접이식 "소유 형태(선택)" 섹션**. 별도 단계 신설 안 함. 미입력 시 계산 영향 0.
4. **공유 안분 기준**: ✅ **`determinedTax`(본세) + `totalPayable`(부가세 포함)** 두 기준 동시 제공. `coOwnershipDistribution`에 두 안분값 모두 노출.

---

## 부록 — 관련 메모리

- `project_property_taxpayer_verification` (본 검증 출처)
- `project_property_tax_review_r1` (재산세 R1 리뷰)
- `feedback_korean_law_citation_verify` / `korean-law-citation-verify` (인용 검증)
- `feedback_engine_result_map_json_loss` (Record 정의)
- `feedback_floor_residual_absorption` (안분 잔액)
- `feedback_three_state_optional_mode_toggle` (공유 지분 3-state)
- `feedback_api_zod_schema_sync` (14지점)

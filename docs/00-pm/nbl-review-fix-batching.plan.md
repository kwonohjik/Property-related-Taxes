# NBL 리뷰 수정 — PR 그룹핑 계획 (CI 최소화)

> 2026-09-02 · 근거 문서 [`docs/reviews/nbl-code-review-2026-09.md`](../reviews/nbl-code-review-2026-09.md)
> 목표: **CI 실행 횟수 최소화**. CI 1회 = PR 1건 = push 1회 = pre-push 전체 테스트 1회(≈152초) + 호스팅 CI 1회(≈8분 벽시계).

## 그룹핑 원칙

1. **같은 파일을 만지는 발견은 무조건 같은 PR** — 쪼개면 순차 머지 + rebase 비용이 CI 절감분을 넘는다.
2. **회귀 축이 다른 것만 분리** — 다주택·§104⑤·상속세를 함께 건드리는 수정은 실패 시 원인 격리가 안 되므로 격리.
3. **의존 쌍은 같은 PR 안에서 커밋 순서로 해결** — 별도 PR로 나누면 순서 강제 비용이 생긴다.
4. **한 브랜치에 커밋을 쌓고 마지막에 1회 push** — 중간 push마다 pre-push 전체 테스트가 돌므로 반드시 몰아서.

## PR 6건 (CI 6회 ≈ 50분 벽시계)

| PR | 이름 | 발견 수 | 실측 세액 해소 | 분리 이유 |
|---|---|---|---|---|
| **1** | ⑧ 검증 게이트 + lib/calc 배선 (**엔진 무변경**) | 23 | **4건** (76,725,000 / 65,550,000 / 74,661,400 / ±57,150,000) | 엔진을 안 건드려 회귀 반경 최소. 가장 값싸고 효과 최대 → 최우선 |
| **2** | 지목 판정 엔진 + 대응 UI | 46 | **1건** (76,548,532) | `form-mapper-helpers.ts`·`unconditional-exemption.ts`가 목장·임야·기타토지 3축에 모두 걸려 쪼갤 수 없음 |
| **3** | 양도세 공통 축 — §95② 연혁 + 합산 | 15 | **2건** (44,000,000 / 11,683,750) | 다주택 축(`lthd-start`)·§104⑤ 축(`aggregate`) 공유 → 전체 회귀, 격리 필요 |
| **4** | 재촌 일반구 — 양도세 + 상속세 동시 | 4 | 판정 flip | 상속세(영농상속공제)를 함께 건드림 → 회귀 축이 다름 |
| **5** | E2-01 도시지역 지역열거 (신규 입력 축) | 1 | 판정 flip | 14 동기화 지점 전부를 타는 **신규 필드 추가** — 성격이 버그픽스가 아님 |
| **6** | 안전망 보강 | COV-1·2·3 외 | — | PR 1~3 머지 후에야 의미 있는 anchor를 쓸 수 있음 |

---

## PR-1 · ⑧ 검증 게이트 + lib/calc 배선 (엔진 무변경)

**파일**: `lib/calc/transfer-tax-validate-nbl.ts` · `-nbl-other.ts` · `transfer-tax-validate-asset.ts` · `nbl-unconditional-exemption-status.ts` · `non-business-land-request.ts` · `transfer-tax-api-helpers.ts` · `multi-transfer-tax-api.ts` · `transfer-tax-validate.ts` · `TransferModeBlock.tsx` · `AssetSectionExtras.tsx`

| 커밋 | 발견 | 내용 |
|---|---|---|
| c1 | **A3-01 · V9-a · V9-c · V9-d** | ⑧ `validateNblDetailedJudgment` 호출을 `:352` → `:219`(carryover_gift) **앞**으로 이동. 주석의 취지("모드 분기 이전에 검사")를 실제로 지키게 함 |
| c2 | **A1-01** | `other_land` 분기에 `nblOtherPropertyTaxType` 공란 차단 (매퍼 `\|\| "comprehensive"` 폴백은 유지) |
| c3 | **E3-01 · A2-02** | 수도권 게이트를 `!x \|\| x === "unknown"`으로 확장. 「미확인」 선택지 존치 여부 결정 |
| c4 | **V2-b · A1-02** | 기간 배열 4종(`nblBusinessUsePeriods`·`nblPastureLivestockPeriods`·`nblVillaUsePeriods`·`nblResidenceHistories`) 행 단위 공란 차단 — `nblGracePeriods`(`:76-90`)의 기존 형태를 그대로 복제 |
| c5 | **V5-b · E1-03 · U2-04** | 편입일·정착면적·연접다필지 차단 정합 |
| c6 | **E5-02 · A3-02 · A1-03 · A2-03 · A3-03** | 무조건의제 어댑터를 raw 빌더와 **같은 레코드 조립 헬퍼**로 통일(5건이 1수정으로 해소) |
| c7 | **V10-a · V10-f · E6-05** | `buildAssetPayload`에 `isNonBusinessLand` 추가(1줄) + `mergePrimaryBasic` 승계 목록 추가 + 다건 assetKind 게이트 |
| c8 | **A2-01 · U3-01 · V10-e** | 공익수용 프리필 게이트 정합(프리필에 `isNonBusinessLand` 동반 또는 렌더 게이트 단일화) |

> 🔴 **유일한 위험**: 차단이 늘어나면 **기존 E2E가 계산 진행을 못 해 전건 실패**할 수 있다(`feedback_blocking_validation_full_e2e_regression`). push 전에 워크트리에서 E2E를 **로컬 1회** 돌릴 것 — `E2E_PORT=3101 npx playwright test e2e/transfer-*`. 이걸 건너뛰면 CI 재시도가 발생해 절감 효과가 사라진다.

## PR-2 · 지목 판정 엔진 + 대응 UI

**파일**: `lib/tax-engine/non-business-land/**` 전체 + `components/calc/transfer/nbl/**` + `legal-codes/transfer-nbl.ts`

| 커밋 | 발견 | 축 |
|---|---|---|
| c1 | **V7-b** → **E5-04 · V7-c** | 목장 §104의3①3호 단서. ⚠️ **이 순서 고정** — 뒤집으면 종중 목장 회귀 |
| c2 | **E5-01 · V4-b · E5-05 · U3-05** | §168의14③4호 요건 3건(가목 날짜·나목 상속 5년·본문 도시지역) + legalBasis |
| c3 | **E3-03** → **E3-02 · U1-01 · E3-04 · E1-04 · V5-a · V5-g · E3-05 · COV-4** | 임야. E3-03(제외사유 게이트)이 먼저여야 나머지 반경이 좁아짐 |
| c4 | **E2-03 · E2-04 · E2-06 · U1-05 · E2-07 · E2-08 · E2-09 · V4-a · V2-a** | 목장·농지 잔여 |
| c5 | **E4-01 · E4-02 · E4-03 · E4-04 · E4-05 · E4-06 · V6-a · V6-b · U2-01 · U2-02 · U2-03** | 기타토지 §168의11. V6-a는 「타입을 넓힐지 / UI 칩에서 실내를 뺄지」를 **먼저 결정** |
| c6 | **E1-02 · V1-a · V1-b** | 별장 REDIRECT — 정착면적 입력을 열거나, 열지 않으면 매퍼에 지목 gate |
| c7 | **E1-01 · E1-05 · V5-f** | `period-criteria.ts`(5지목 공용) — 상수·경계 3줄. anchor 필수 |
| c8 | **E2-05 · U1-04 · E5-03 · E5-06 · U1-03 · U3-02 · U3-06 · A1-04** | 배관·표시 잔여 |

> ⚠️ **PR-1 머지 후 rebase**: `validate-nbl.ts`의 V5-b anchor는 E3-03(c3)이 들어가면 재현 조합이 좁아진다 — PR-2에서 anchor를 갱신할 것.
> ⚠️ **E2-01은 여기에 넣지 말 것** — `urban-area.ts` leaf 시그니처를 바꾸면 `unconditional-exemption.ts:73`(§168의14③1의2호, 지역 열거 없는 조문)이 조용히 틀어진다. PR-5로 분리한 이유다.

## PR-3 · 양도세 공통 축 — §95② 연혁 + 합산 중과

**파일**: `transfer-tax-lthd.ts` · `transfer-tax-lthd-start.ts` · `legal-codes/transfer-house.ts` · 신규 `data/nbl-lthd-exclusion-era.ts` · `transfer-tax-aggregate*.ts` · `transfer-tax-split-rate.ts` · `data/transfer-rate-seed.ts`

| 커밋 | 발견 |
|---|---|
| c1 | **H-1 · H-2 · H-3** — NBL 연혁 leaf 신설 + `calcLongTermHoldingDeduction`에 L-0b 분기 + `LthdExclusionReason` union·라벨 추가 |
| c2 | **E6-04 · U3-03 · D-1 · D-2 · COV-7** — `longTermDeductionExcluded` echo를 현행 §95②에 맞추고 시드 dead `exclusions`·릴리스 문서 정정 |
| c3 | **E6-01 · V8-a · V8-b** — STEP 0.62 파생값 echo + `nblOverride` 소스 확대 + `properties[]` echo 정합 + stale 주석·테스트 축 정정 |
| c4 | **E6-02 · E6-03** + 2차 extra(`appliedRate + surchargeRate` 이중 계상) — 안분 정수연산·dead rules 인자 |

> 🔴 다주택 축(`lthd-start`)과 §104⑤ 축(`aggregate`)을 공유하므로 **회귀 반경이 이 계획에서 가장 크다**. 실패 시 원인 격리를 위해 커밋을 반드시 위 4개로 분리할 것.

## PR-4 · 재촌 일반구 — 양도세 + 상속세 동시

**파일**: `non-business-land/residence.ts` · `lib/calc/farming-residence-check.ts` · 신규 일반구→시 정규화 leaf · `FarmingEligibilitySection.tsx`
**발견**: E2-02 · V3-c · V3-b · V3-d

`residence.ts:64` 주석이 `farming-residence-check.ts`와 「알고리즘 미러」임을 명시하고, 2차 검증에서 그 미러가 **법령상 정당**함이 확정됐다(V3-a 기각). **한쪽만 고치면 두 세목이 갈리므로 반드시 동시.** 5자리계에서 `code[3:5] !== "00"`이면 일반구 → 상위 시로 접고, 연접 매트릭스도 시 단위로 union.

## PR-5 · E2-01 도시지역 지역열거 (신규 입력 축)

법 §104의3①1호나목·3호가목의 지역 열거(광역시의 군 · 특별자치시·제주행정시·도농복합시의 읍·면 제외)를 판정에 반영. **엔진 input에 소재지 구분 축을 새로 추가**해야 하므로 14 동기화 지점 전부를 탄다 — 버그픽스가 아니라 신규 기능이다. `isUrbanForFarmland` leaf는 건드리지 말고 `farmland.ts:217`·`pasture.ts:197` **호출부에서만** 판정.

## PR-6 · 안전망 보강

**COV-2** 시드에서 `surcharge.non_business_land`가 사라지면 +10%p가 조용히 증발하는 것을 잡는 테스트 · **COV-1** `rate-table.schema.ts:337` optional 그룹 누락(2015.2.2 이전 레거시 임계가 프로덕션 미적용) · **COV-3** NBL E2E 8건 중 중과세액 단언 0건 → `transfer-nbl-academy-land.spec.ts`의 주석 기대값을 실제 단언으로 승격 · **COV-5** `NBL_DEFAULTS` 이중진실 · **COV-6** 이력 복원 stale-record.

PR 1~3이 머지된 뒤라야 의미 있는 기대값을 쓸 수 있으므로 마지막.

---

## 실행 순서와 근거

```
PR-1 → PR-2 → PR-3 → PR-4 → PR-5 → PR-6
```

- **PR-1이 먼저**인 이유: 엔진 무변경이라 실패 위험이 가장 낮고, 실측 4건을 즉시 해소한다. 또 잘못된 입력이 차단되기 시작하므로 PR-2의 anchor 작성이 쉬워진다.
- **PR-3을 PR-2 뒤로** 둔 이유: 지목 판정이 안정된 뒤라야 합산·장특 축의 회귀 원인을 가릴 수 있다.
- **PR-5·PR-6는 마지막** — 신규 기능과 안전망은 버그 수정이 다 들어간 상태를 전제로 한다.

## 더 줄이려면 (CI 6회 → 4회)

PR-4·PR-5·PR-6를 PR-2에 흡수하면 **3 PR**까지 줄일 수 있으나 권장하지 않는다 — PR-4는 상속세, PR-5는 14지점 신규 필드로 **회귀 축이 다르고**, 합치면 CI가 빨개졌을 때 원인이 지목 엔진인지 상속세인지 가릴 수 없다. 그 진단 비용이 CI 2회(≈16분)보다 크다.

절감 여지가 실제로 있는 곳은 CI가 아니라 **push 횟수**다. 한 PR 안에서 커밋을 쌓는 동안 절대 push하지 말고 마지막에 1회만 할 것 — 중간 push 1회마다 pre-push 전체 테스트 152초가 그대로 붙는다.

## 각 PR 공통 게이트

```
Pre-Do anchor 우선 FAIL 확보 → 구현 → npx tsc --noEmit 0
→ npx vitest run __tests__/tax-engine/non-business-land/ __tests__/lib/calc/nbl-*
→ npm test (전체)  → PR-1만 추가로 E2E_PORT=3101 npx playwright test e2e/transfer-*
→ 커밋 쌓기 → 마지막 1회 push → PR → gh pr checks <n> --watch --fail-fast → 머지
```

⚠️ `gh pr merge --auto`를 호출하지 말 것 — 이 저장소는 브랜치 보호가 없어 그 호출 자체가 즉시 머지다.

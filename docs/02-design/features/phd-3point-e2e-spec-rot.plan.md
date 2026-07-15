# PHD 3시점 일괄계산 E2E spec rot 수정 (T4·T5·T7·T9) — 계획서

- 작성일: 2026-07-15
- 규모: **소** (단일 E2E 파일 4개 테스트 셀렉터·단언 정정. 제품 코드 무변경) → 디자인 문서 N/A
- 대상: `e2e/transfer-phd-building-stdprice-calculator.spec.ts`
- 발단: PR #608(건물기준시가 spec rot) 회귀 실행 중 발견 → **master 재현 확인**(6 passed / 4 failed)
- 선행: [`building-stdprice-e2e-spec-rot.plan.md`](./building-stdprice-e2e-spec-rot.plan.md) §6 "후속 1순위"
- 정책: `e2e/CLAUDE.md` · `feedback_e2e_preexisting_failures` · `feedback_anchor_correction_legal_priority`

---

## 0. 판정 — **4건 모두 spec rot. 제품 버그 0.**

세 건의 **의도적 제품 변경**이 원인이며, 셋 다 **유닛 anchor는 갱신하면서 E2E만 놓쳤다**.
계산 로직·엔진 무변경, 사용자 영향 0. 기능 손실 없음(§3-1 참조).

> ⚠️ **T9는 폐기된 법령 해석을 고정하고 있다.** 지금 T9을 "통과시키려" 제품을 고치면 **§166⑥ 위반으로 회귀**한다.
> anchor가 법령 정정과 충돌하면 **anchor를 고친다**(`feedback_anchor_correction_legal_priority`).

---

## 1. 원인 (커밋·실측 확정)

| 실패 | 깨뜨린 커밋 | 성격 | 대체 커버리지 |
|---|---|---|---|
| **T4·T5** | `d34c4b62` (2026-07-14) *Case B를 주택 전용 버튼으로 정정* | 의도적 **기능 축소** | ✅ `__tests__/components/phd-mixed-use-button-housing-only.test.tsx` **2건 통과**(실행 확인) |
| **T7** | `f03f9ad0` (2026-07-10) *PHD 3시점 계산기 도움말 정리* | 의도적 **UI 정리** | 도움말 문구라 불요 |
| **T9** | `10aa63d6` (2026-07-14) *취득 부수토지 공시지가 연도를 토지 취득일 기준으로 정정* | **법령 해석 정정(§166⑥)** | ✅ `__tests__/calc/phd-acquisition-date-building.test.tsx` **2건 통과** — **E2E와 정반대를 단언** |

### 1-A. T4·T5 — `enableCommercial`이 Case A 전용으로 축소

`ThreePointStandardPriceInput.tsx:669` (`git log -L`로 라인 이력 실측):

```diff
- const enableCommercial = splitMode || props.onCommercialBuildingStdPriceAtTransferChange != null;
+ const enableCommercial = splitMode;      // d34c4b62
```

`PhdBuildingStdPriceModalButton.tsx:150` — 라벨이 이 플래그로 갈린다:
```ts
enableCommercial ? "3시점 주택·상가 건물기준시가 일괄 계산" : "3시점 건물기준시가 일괄 계산"
```

⇒ 겸용 **Case B**(용도변경 없음)는 이제 **주택 전용** 버튼. T4·T5는 구 라벨(`주택·상가`)을 찾다 **0개**로 실패.
커밋 의도: *"겸용 상가 기준시가는 전용 ③ 상가 섹션(MixedUseAssetMajorStdPrice/Legacy)이 전담하므로 … 주택 전용이어야 한다"* — **상가 UI 중복 노출 해소**.

### 1-B. T7 — 삭제된 도움말 문구를 단언

`:534` `getByText(/당시 실제 용도\(주택\)로 자동 산출/)` — `f03f9ad0`이 *"연면적 아래 상가분 자동산출 안내 amber 블록 제거"*로 삭제. **이 1줄만** 죽었고 나머지(6필드 산출·적용)는 유효하다.

### 1-C. T9 — §166⑥ 정정 + **위양성 단언** (probe로 발견)

`10aa63d6`이 취득 부수토지 공시지가 추천연도를 **토지 취득일**로 정정했다(`PreHousingDisclosureSection.tsx:163-165` `acqLandReferenceDate` 분리). 건물 std·batch·신축연도는 **건물 취득일 유지**(결합 분리).

**probe 실측** (T9 시나리오: 건물 취득 2014-09-14 / 토지 취득 2013-06-01 / 최초공시 2015-04-30 / 양도 2026-09-01):

| PHD 시점 블록 | 표시 연도 | 근거 |
|---|---|---|
| ① 취득시 | **2013년 (자동)** | **토지** 취득일 — §166⑥ (정정된 동작) |
| ② 최초공시일 | **2014년 (자동)** | 최초공시일 2015-04-30이 공시일(6.1) **이전** → 전년도 공시(`feedback_standard_price_year_164_3_prior`) |
| ③ 양도시 | 2026년 (자동) | |
| 일괄 모달 취득시 | **`취득시 (2014년)`** (2013년은 0개) | **건물** 취득일 — 건물 std는 건물일 유지 |

⇒ **T9의 두 단언이 각각 다른 이유로 잘못됐다**:

```ts
// :674 — ❌ 위양성. "취득=건물일 2014"를 증명한다고 주장하나,
//        실제로 매칭된 건 ② 최초공시일의 2014년이다. 취득 필드는 2013을 보여준다.
await expect(phd.getByText(/2014년 \(자동\)/).first()).toBeVisible();   // 통과하지만 무의미

// :675 — ❌ 폐기된 규칙. 정정 후 2013은 **나와야 한다**.
await expect(phd.getByText("2013년 (자동)")).toHaveCount(0);            // 실제 실패 지점
```

> 스코프 없는 `getByText`가 **다른 시점의 값을 잡아 통과**한 사례 — PR #608의 `nth()` 서수 rot과 같은 병(범위 미한정)이다.

---

## 2. 수정안 (probe 실측 기반 — 제품 코드 무변경)

### 2-1. T4·T5 — 현행 정본(Case B = 주택 전용)으로 재작성

- 버튼 라벨 `"3시점 주택·상가 건물기준시가 일괄 계산"` → **`"3시점 건물기준시가 일괄 계산"`**
- **부정 단언 추가**: `"주택·상가"` 라벨이 **없음**을 함께 단언 → 중복 UI 재발 가드(unit anchor의 E2E 대응물)
- **T4 제목·주석 갱신**: "일괄 모달 주택/상가 UI 렌더" → 현행과 모순. Case B는 주택 전용.
- **T5 상가 단언 처리**: 제목의 "양도 상가 산출·적용"은 Case B에서 **더 이상 이 모달의 책임이 아니다**.
  → 해당 단언 제거 + 주석으로 이관처 명시(③ 상가 섹션 `MixedUseAssetMajorStdPrice`, E2E는 `mixed-use-asset-major-commercial-modal.spec.ts`가 이미 커버 — **PR #607·#608에서 통과 확인**).

### 2-2. T7 — 죽은 도움말 단언 1줄 제거

`:533-534` 삭제. 나머지(Case A 6필드 산출·적용)는 존치 — 이 테스트의 본체다.

### 2-3. T9 — 반전 + 시점 블록 스코프 (§166⑥ 가드로 승격)

**스코프 방법 실측**: PHD 패널 내 시점 블록은 라벨 접두로 각 **정확히 1개** 매칭되고, 내부 연도도 1:1로 확인됨(probe):

```ts
const block = (lbl: string) => phd.locator("div").filter({ hasText: new RegExp("^" + lbl) }).first();
// 실측: block("① 취득시") → "2013년 (자동)" / block("② 최초공시일") → "2014년 (자동)" / block("③ 양도시") → "2026년 (자동)"
```

```ts
// ① 취득 부수토지 공시지가 = 토지 취득일(2013) — §166⑥ (10aa63d6 정정)
await expect(block("① 취득시").getByText("2013년 (자동)")).toBeVisible();
await expect(block("① 취득시").getByText("2014년 (자동)")).toHaveCount(0);   // 건물일 아님

// ② 최초공시일 2015-04-30 → 공시일(6.1) 이전이라 전년도 2014 (별개 규칙 — 취득의 2014가 아님)
await expect(block("② 최초공시일").getByText("2014년 (자동)")).toBeVisible();

// 일괄 모달 취득시 = 건물 취득일(2014) — 건물 std는 건물일 유지(결합 분리)
await expect(modal.getByText(/취득시 \(2014년\)/)).toBeVisible();
await expect(modal.getByText(/취득시 \(2013년\)/)).toHaveCount(0);
```

- **제목 갱신**: "PHD 취득 시점은 건물 취득일(2014) 기준(2013 아님)" → **"토지·건물 취득일 분리 — 부수토지 공시지가=토지일(2013) / 건물 std=건물일(2014)"**
- 이 테스트가 §166⑥ 분리를 **E2E 수준에서 지키는 유일한 가드**가 된다(유닛은 `phd-acquisition-date-building.test.tsx`가 담당).

> **testid 추가는 하지 않는다** — PR #608은 placeholder 충돌로 스코프 수단이 없어 `SectionCard testId`가 불가피했으나, 여기는 **라벨 접두 스코프가 실측으로 동작**한다. 제품 코드를 건드릴 이유가 없다(Simplicity First·Surgical).

---

## 3. 범위 밖 / 확인 필요

| 항목 | 판정 |
|---|---|
| **기능 손실 여부** | **없음** — 겸용 Case B 상가 기준시가는 ③ 상가 섹션이 전담(`d34c4b62` 의도). 그 경로는 `mixed-use-asset-major-commercial-modal.spec.ts`가 커버하며 PR #607·#608에서 **통과 확인** |
| 제품 코드 | **무변경** — 4건 전부 스펙 측 문제 |
| `enableCommercial` 축소의 타당성 | **재검토 안 함** — `d34c4b62`가 anchor 2건과 함께 의도적으로 결정. 본 계획은 스펙을 현행 정본에 맞출 뿐 |
| T9 §166⑥ 해석 자체 | **재검토 안 함** — `10aa63d6`이 근거(부수토지 기준시가 = 공시지가 × 면적의 land value)와 함께 정정. 유닛 anchor가 정본 |
| PR #607·#608과의 관계 | **무관** — master 재현 확인. 파일 충돌 없음(이 스펙은 두 PR 모두 미수정) |

---

## 4. 작업 순서

```
1. 브랜치 fix/phd-3point-e2e-spec-rot (master 기준)
2. T7 — 죽은 도움말 단언 1줄 제거          → verify: T7 통과
3. T4 — 라벨 정정 + '주택·상가' 부재 단언   → verify: T4 통과
4. T5 — 라벨 정정 + 상가 단언 이관 주석     → verify: T5 통과
5. T9 — 반전 + 블록 스코프 + 제목 갱신      → verify: T9 통과 (probe 값 그대로)
6. 스펙 전체 10개 테스트 실행               → verify: 10 passed / 0 failed
7. 유닛 anchor 2종 재확인                   → verify: E2E와 단언 방향 일치(모순 0)
8. 커밋 + PR
```

**성공 기준**: 10개 테스트 전부 통과 · 제품 코드 diff 0 · E2E ↔ 유닛 anchor 단언 모순 0.

---

## 5. 근본 원인 (선행 계획서 §6과 동일 — 누적 증거)

세 커밋 모두 **유닛 anchor는 갱신하고 E2E는 놓쳤다**. `d34c4b62`는 anchor 2건 추가, `10aa63d6`은 "anchor 반전" 명시 — 그런데 같은 규칙의 E2E는 **정반대로 남았다**.

원인은 하나다: **E2E가 pre-push 게이트(tsc + vitest) 밖**이라 깨져도 아무도 모른다.
- 선행 조사(PR #608): rot 3건
- 본 건: rot 4건
- **누적 7건** — 전부 "제품 개선 → E2E 미동기". 방치 비용의 실측치다.

⇒ **별건 제안**: E2E를 CI(비차단이라도)에 넣어 rot을 가시화하거나, 최소한 모달·기준시가 계열 스펙만이라도 주기 실행. 본 계획 범위 밖.

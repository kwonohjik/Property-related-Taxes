# L-1 — §164⑦ 트리거가 꺼진 뒤에도 남는 `-redev-phd` 계산서 차단

- 작성일: 2026-08-24
- 유입: PR #1267 코드 리뷰 Low 지적(`docs/00-pm/redev-phd-stdprice-section-regroup.plan.md` §9 L-1)
- 성격: **표시 결함**(세액 무관). 계산서가 적용되지 않은 조문으로 출력된다.

---

## 1. 재현 (probe 실측)

```
스냅샷: bsp-asset-r-redev-phd (취득 2003 · 최초공시 2005)
inputData: assets[0] = { assetId: "asset-r", acquisitionDate: "2010-03-01",
                         redevFirstDisclosureDate: "2005-04-30" }   ← 취득일 정정 후
결과: hasBuildingStdReport = true / 렌더된 계산서 수 = 2
```

취득일을 2003 → 2010으로 **정정**하면 §164⑦ 본문 블록은 화면에서 사라지고 산식도 그 필드를
쓰지 않는데, 결과탭은 「취득시/최초공시일 (재개발 환산 §164⑦)」 계산서 2장을 계속 찍는다.

## 2. 왜 남는가

소속 판정이 `idOfSnapshotKey(key)` + `JSON.stringify(inputData).includes(id)` **뿐**이다.
자산이 존재하기만 하면 통과한다 — 그 스냅샷을 만든 **조건이 아직 성립하는지**는 아무도 안 본다.

같은 패턴을 쓰는 소비처는 2곳이고, 세 번째(PDF)는 그 결과를 물려받는다:

| # | 위치 | 역할 |
|---|---|---|
| S-1 | `lib/storage/use-auto-save-calculation.ts:26-27` | 이력 저장 시 동봉할 스냅샷 추출 |
| S-2 | `components/calc/results/BuildingStdPriceReportSection.tsx:63-64` | 결과탭 렌더 |
| S-3 | `lib/calc/building-std-pdf-data.ts` | S-1이 추린 것만 받는다 → **S-1을 고치면 따라온다** |

## 3. 해법 — 표시 시점 게이트 (store 삭제 아님)

**채택**: 순수 술어로 「이 스냅샷이 지금도 유효한가」를 판정해 S-1·S-2에서 거른다.

**기각한 대안**: 트리거가 꺼질 때 store에서 삭제.
- 삭제 API가 `replaceSnapshotsByPrefix` 하나뿐이고, 트리거는 **날짜 비교라는 파생 조건**이라
  변화를 감지하려면 `useEffect → store` 미러링이 필요하다 — **금지 정책**과 정면 충돌.
- 날짜를 되돌리면(오타 정정 등) 계산서가 그냥 돌아와야 하는데, 삭제는 재계산을 강요한다.
  게이트 방식은 입력이 조건을 다시 만족하는 순간 자동 복귀한다.

### 3-1. 술어 2개 (신규)

```ts
// lib/calc/redev-phd-trigger.ts
/** 재개발 환산의 §164⑦ 본문 발동 여부 — UI·validate·계산서 게이트 단일 소스 */
export function isRedevPhdTriggered(a: {
  useEstimatedAcquisition?: boolean;
  acquisitionDate?: string;
  redevFirstDisclosureDate?: string;
}): boolean
```

```ts
// lib/calc/building-std-snapshot-applicability.ts
/** 스냅샷이 현재 폼 상태에서도 유효한가. 판정 대상이 아닌 키는 항상 true(현행 유지). */
export function isBuildingStdSnapshotApplicable(
  key: string,
  inputData: Record<string, unknown>,
): boolean
```

`-redev-phd` 키만 판정한다. **다른 키로 넓히지 않는다** — 각 키의 성립 조건이 다르고
(gb 증축 토글·cb 분리취득·phd 배치…) 한꺼번에 걸면 회귀 위험이 크다. 필요해지면 같은
술어 파일에 케이스를 **하나씩** 추가한다.

### 3-2. dual-truth 정리

§164⑦ 트리거 판정이 지금 **3곳에 복제**되어 있다:

| 위치 | 조건 |
|---|---|
| `RedevelopmentValuationSection.tsx:38-41` (useMemo `provisionTriggered`) | 날짜 2개 비교 |
| `RedevelopmentValuationSection.tsx:158-161` (`isPreDisclosureTriggered`) | 날짜 2개 비교 |
| `lib/calc/transfer-tax-validate-redev.ts:248-253` | `useEstimatedAcquisition` + 날짜 2개 + `isHousingRightReceiveEstimated` 배제 |

계산서 게이트가 **네 번째 복제**가 되면 드리프트가 확정된다. UI 2곳과 신규 게이트가 같은
술어를 쓰게 한다.

> ⚠️ **validate는 이번에 건드리지 않는다.** 그쪽 조건에는 `isHousingRightReceiveEstimated`
> (housing+right+receive+estimated → §164⑤ 별도 산식) 배제가 더 붙어 있는데, 그 플래그는
> validate 내부에서 계산된다. 술어를 그 인자까지 받도록 넓히면 UI·게이트 호출부가 쓰지도 않는
> 인자를 나르게 된다. **조건이 진짜로 같은 3곳(UI 2 + 게이트)만** 통합하고, validate는
> 별건으로 남긴다 — 다만 술어 파일에 그 차이를 명시해 다음 사람이 모르고 합치지 않게 한다.

## 4. 범위 밖

- **`-red-phd`(감면 PHD)** — 같은 실패 모드지만 게이트가 명시 토글(`phdMode`)이라 사용자가
  의도적으로 끄는 동작이고, 조건이 감면 조문별 폼에 흩어져 있다. 별건.
- **다른 키**(gb/cb/split/mx/phd 배치) — 3-1 참조.
- **`isPhdEligible`과의 통합** — `lib/calc/phd-eligibility.ts`가 §164⑦ 게이트 「단일 소스」를
  자처하는데 **의제취득일(1985-01-01) 보정**이 있고 재개발 인라인 판정에는 없다.
  최초공시일이 2005/2006인 실무 입력에서는 두 판정 결과가 **같다**(보정이 결과를 바꾸려면
  최초공시일 ≤ 1985여야 한다). 지금 합치면 재개발 트리거 의미가 조용히 바뀔 수 있으므로
  이번엔 손대지 않고 **관측 사실만 기록**한다.

## 5. 검증 계획

| # | 항목 | verify |
|---|---|---|
| V-1 | probe를 anchor로 승격 | 트리거 OFF inputData + `-redev-phd` 스냅샷 → 계산서 **0장**. 게이트 적용 전 실패(=2장) 확인 |
| V-2 | 트리거 ON은 그대로 | 취득 2003 < 최초공시 2005 → 계산서 **2장** 유지(과잉 차단 방지) |
| V-3 | 실가 모드 복귀 | `useEstimatedAcquisition: false` → 0장 |
| V-4 | 판정 불능은 통과 | 날짜 미입력·assets 부재·다른 키(`-gb-acq` 등) → 현행 유지(true) |
| V-5 | 저장 경로(S-1) | `extractRelevantBuildingStdSnapshots`가 stale `-redev-phd`를 제외 → PDF·이력 복원 자동 해결 |
| V-6 | 술어 통합 회귀 | UI 2곳 치환 후 `redev-phd-stdprice-regroup` 6건 + E2E 3건 통과 |
| V-7 | 게이트 | tsc·lint·전체 vitest |

## 6. 작업 순서

1. probe → anchor 승격(V-1) 실패 확인
2. `lib/calc/redev-phd-trigger.ts` 술어 + 단위 테스트
3. `lib/calc/building-std-snapshot-applicability.ts` + 단위 테스트(V-4)
4. S-2(화면)·S-1(저장) 게이트 적용 → V-1·V-2·V-3·V-5 통과
5. UI 2곳 인라인 → 술어 치환(V-6)
6. 전체 회귀·품질 검토·커밋

---

## 7. 착수 후 실측 · 설계 변경 (2026-08-24)

### 🔑 계획에 없던 가드 1건 — 구버전 저장분 방어

게이트를 적용하자 **PR #1267의 기존 테스트가 깨졌다**. 그 fixture가 `{ assetId: "asset-r" }`
최소 형태라 트리거 필드가 없어 `isRedevPhdTriggered`가 false를 돌려준 것이다.

fixture만 고치면 끝날 문제가 아니었다 — **실제 이력 복원분에도 같은 일이 난다.**
`-redev-phd` 스냅샷이 있다는 것은 §164⑦ 계산을 했다는 뜻인데, 그 시절 `input_data`에
`redevFirstDisclosureDate` 키 자체가 없으면 **이미 저장된 이력의 계산서가 조용히 사라진다**
— 「계산했는데 계산서가 없다」는 **반대 방향 결함**이다.

⇒ `if (!("redevFirstDisclosureDate" in asset)) return true;` 를 넣었다.
**빈 문자열과 키 부재를 구분**해야 하므로 `in` 연산자여야 한다 — 사용자가 최초공시일을
지우면 값은 `""`로 남고 키는 존재하므로 그건 정상 차단 대상이다. anchor 2건으로 고정.

### UI 인라인 치환의 안전성 — 실측 확인

`RedevelopmentValuationSection`은 `RedevelopmentBlock.tsx:395`의 삼항
(`!asset.useEstimatedAcquisition ? 실가 : …`) 안에서만 렌더된다 ⇒ 술어의
`useEstimatedAcquisition` 조건은 그 문맥에서 항상 충족된다. **치환이 동작을 바꾸지 않는다.**

### validate와 실효 조건이 같다는 관측

`transfer-tax-validate-redev.ts`가 배제하는 `isHousingRightReceiveEstimated`는
UI에서 `isHousingContribEstimatedBranch`(`AssetAreaRedevelopment.tsx:112`)로 표현되어
**상위 컴포넌트 분기**가 담당한다. 즉 UI와 validate의 실효 조건은 같고 표현만 다르다.
계획 §3-2에서 「조건이 달라 보인다」고 적은 것은 표현 차이였다 — 다만 통합하려면 그 술어를
`components/` → `lib/`로 옮겨야 해서 이번 범위 밖으로 둔다(§8 참조).

## 8. 후속 별건 (기록)

- ~~**B-1**: 승계조합원·단독주택 출자 분기 전환 시 stale 잔존~~ → **코드 리뷰 Medium 지적으로
  이번에 해소**(§10 M-2). 「빈도가 낮아 제외」라는 이번 판단이 틀렸다 — 게이트의 목적이
  「적용되지 않은 조문의 계산서를 안 찍는 것」인데 트리거만 보면 **절반만 막는다**.
- **B-2**: `-red-phd`(감면 PHD)도 같은 실패 모드. 게이트가 명시 토글(`phdMode`)이고 조건이
  감면 조문별 폼에 흩어져 있다.
- **B-3**: `phd-eligibility.ts`의 `isPhdEligible`과 재개발 트리거 통합 — 의제취득일
  (1985-01-01) 보정 유무 차이. 실무 입력에서는 결과가 같다(§4 참조).

## 9. 검증 결과

| # | 항목 | 결과 |
|---|---|---|
| V-1 | 트리거 OFF → 0장 | ✅ 게이트 적용 전 실패(2장) 확인 후 통과 |
| V-2 | 트리거 ON → 2장 유지 | ✅ 과잉 차단 없음 |
| V-3 | 실가 모드 복귀 → 0장 | ✅ |
| V-4 | 판정 불능·비대상 키 통과 | ✅ 8건(구버전 방어·빈문자열 구분 포함) |
| V-5 | 저장 경로 제외 → PDF 자동 해결 | ✅ 3건 |
| V-6 | 술어 통합 회귀 | ✅ vitest 216파일 2,100건 · E2E 재개발 6건 |
| V-7 | 게이트 | ✅ tsc 0 · lint 0 errors |

**mutation probe**: 술어를 항상 false로 바꾸자 3개 파일 9건이 실패했다 — 게이트·UI 치환
모두 실제로 이 술어를 탄다(구별력 확인).

## 10. 코드 품질 게이트 결과 (`/code-review high`, 2026-08-24)

리뷰어가 tsc·vitest(171파일 1,787건)를 돌리고, UI 인라인 치환이 동작 보존인지
(`RedevelopmentBlock.tsx:395`가 유일 호출부·환산 모드 전용)와 엔진 트리거
(`lib/tax-engine/redevelopment-valuation.ts:159`)가 **같은 strict `<`** 를 쓰는지까지 확인했다
— 표시 게이트와 계산이 일치한다.

### 🔴 Medium 2건 — 둘 다 수정

**M-1. 다건 양도에서 저장 게이트가 no-op이었다.**
`findAsset`이 `inputData.assets`만 읽는데, 다건은
`{ __multiTransfer: true, ...MultiTransferFormData }`이고 자산이 `properties[].form.assets`에 있다
(`MultiTransferTaxCalculator.tsx:330`). ⇒ 게이트가 무조건 true를 반환했다.
**화면(`MultiTransferTaxResultView`)은 계산서를 숨기는데 IndexedDB·서버 PDF에는 stale이 남는**
바로 그 어긋남 — S-1 행이 막으려던 것을 다건에서만 놓치고 있었다. 계획서에 다건 경로 언급이
아예 없었던 것이 원인이다. ⇒ `findAsset`이 두 폼 모양을 모두 탐색. anchor 4건.

**M-2. 게이트가 트리거만 보고 섹션 가시성은 보지 않았다.**
`-redev-phd` 스냅샷의 생산자인 ⑤ 섹션은 **5중 게이트**를 통과해야 렌더된다
(자산종류 · 승계조합원 입주권 · 승계조합원 완공APT · 환산 모드 · §164⑤ 분기).
승계조합원을 「예」로 바꾸면 섹션이 통째로 사라지는데 날짜·모드가 그대로라 게이트는
계속 true였다. ⇒ `isRedevPhdSectionActive`로 5중 게이트 전부 반영.

> 저쪽 술어(`shouldShowRedevValuationSection`·`isSuccessorRightTransfer`)는 `AssetForm` 전체를
> 받아 저장 `input_data`에는 못 쓴다 ⇒ 조건을 직접 표현하되 **동기화를 anchor로 고정**했다
> (`redev-phd-trigger.test.ts` 「가시성 술어 동기화」). 저쪽이 바뀌면 그 anchor가 먼저 빨개진다.
> **미확인 필드는 차단하지 않는다** — 구버전·부분 input_data에서 과잉 차단을 피한다.

### Low 1건 — 주석·테스트 설명 정정

**L-3. `"redevFirstDisclosureDate" in asset` 가드는 실제 복원 경로에서 발화하지 않는다.**
마이그레이션(`calc-wizard-asset-migrate.ts:622`)·팩토리(`:469`)가 모든 자산에 `""`를 백필하고
결과뷰 `formData`는 전부 그 스토어를 거치기 때문이다. 즉 §7에 적은 「구버전 이력 방어」는
**그 경로에서는 존재하지 않는 안전망**이었다. 가드 자체는 스토어를 거치지 않는 경로
(서버 PDF·외부 주입 input_data)에 의미가 있으므로 남기되, 주석과 테스트 설명을
사실에 맞게 고쳤다 — 테스트가 「앱이 만들 수 없는 객체」를 쓴다는 점을 명시.

### 검증 (수정 후)

vitest 367파일 **3,337건** · E2E **전건 1,096건** · tsc 0 · lint 0 errors.
**mutation probe**: `properties` 탐색 제거 + 게이트 무력화 → 15건 중 8건 실패(구별력 확인).

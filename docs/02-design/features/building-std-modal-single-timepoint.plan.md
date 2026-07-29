# 건물 기준시가 계산 모달 — 단일 시점 모드

> 작성 2026-07-29 · 세목: 양도소득세(공용 계산기) · 규모: 중(7파일 + 테스트)
> 사용자 보고: "양도시 건물 기준시가 계산" 모달에서 취득 시점 입력이 불필요한데 강제된다.
> 재검토 지적: "취득·양도 모두 입력해도 최종 결과에서 양도시 적용만 사용된다."

---

## §1 문제 (실측)

`BuildingStdPriceModalButton`은 `applyTimePoint`로 **적용 버튼만** 한 시점으로 좁히고
(`BuildingStdPriceModalButton.tsx:214·219`), 입력·계산은 여전히 2시점 전부를 요구한다.

호출부 실측 — `applyTimePoint`가 지정된 5곳은 전부 단일 시점만 소비한다:

| 호출부 | applyTimePoint | 스냅샷 키 | 낭비되는 입력 |
|---|---|---|---|
| `LandBuildingSaleSplitSection.tsx:151` | `transfer` | `bsp-{id}-split-transfer` | 취득 4필드 |
| `GeneralBuildingBlock.tsx:342` | `transfer` | `bsp-{id}-gb-transfer` | 취득 4필드 |
| `GeneralBuildingBlock.tsx:370` | `acquisition` | `bsp-{id}-gb-acq` | 양도 3필드 |
| `LandBuildingSplitSection.tsx:173` | `acquisition` | `bsp-{id}-split-acq` | 양도 3필드 |
| `CommercialInheritanceStdPriceSection.tsx:115` | `acquisition` | `bsp-{id}-cbinh-acq` | 양도 3필드 |

2시점이 실제로 필요한 호출부(**본 계획 범위 밖 — 무변경**):

- `MixedUseAssetMajorStdPrice` — `onApplyBoth`(겸용 상가, 한 번 계산으로 두 시점 적용)
- `ThreePointStandardPriceInput.tsx:518·545·570` — `applyTimePoint` 미지정(시점 자유 선택)
- `ReductionPhdInput.tsx:221·249` — PHD 2시점(`transferSectionLabel` override)

### 낭비되는 입력이 강제되는 지점

| 계층 | 위치 | 현행 |
|---|---|---|
| 폼 렌더 | `BuildingStdPriceForm.tsx:420`(취득) · `:522`(양도) | `taxType === "transfer"`면 무조건 2섹션 |
| 검증 | `building-std-price-form.ts:597·598` | 취득연도·양도연도 둘 다 필수 |
| 검증 | 같은 파일 `:617~619` | 취득당시 구조·용도·공시지가 필수 |
| 검증 | 같은 파일 `:611~613` | 양도당시 구조·용도·공시지가 필수(비-sameYear) |
| 엔진 | `building-standard-price.ts:327` | `transferYear`·`acquisitionYear` 둘 다 필수 |
| 엔진 | 같은 파일 `:349` | `validatePoint(input.acquisition, "취득시")` 무조건 |
| 엔진 | 같은 파일 `:424` | `validatePoint(input.transfer, "양도시")` (비-sameYear) |

---

## §2 §164⑧ — 유일한 진짜 의존

취득연도 == 양도연도이면 **양도당시 기준시가를 취득시 기준시가에서 환산**한다
(`building-standard-price.ts:369~420`, 소득령 §164⑧ 제1·제2산식). 이 경우 양도당시
구조·용도·공시지가는 아예 쓰지 않는다(`:423` 주석).

⇒ **`transfer` 단독 모드에서 취득 입력이 필요한 조건은 `sameYear` 하나뿐**이고,
그 판정에는 취득연도만 있으면 된다(`BuildingStdPriceForm.tsx:256`).

`acquisition` 단독 모드에는 대응 의존이 **없다** — 취득시 breakdown은 `calcPointBreakdown(acquisitionYear, …)`로
취득연도만 쓴다(`:352~355`). 양도 섹션을 완전히 숨겨도 안전.

---

## §3 설계 결정

### D1. 플래그는 **폼 상태 필드**로 둔다 (prop 아님) — 강제

`BuildingStdPriceReportSection.tsx:59`와 `building-std-pdf-data.ts:23`이 저장된 스냅샷으로
`calcBuildingStandardPrice(toEngineInput(snap))`를 **재계산**해 「건물 기준시가 계산서」 서식을 만든다.
스냅샷 실체는 `BuildingStdPriceFormState`이므로, 모드가 폼 상태에 없으면 재계산 때 복원되지 않아
`catch`로 서식이 **통째로 사라진다**(graceful 생략).

```ts
// lib/calc/building-std-price-form.ts — BuildingStdPriceFormState (:136 "// 양도" 블록)
/**
 * 단일 시점 모드(양도 전용) — 지정 시 그 시점 입력·결과만 산출한다.
 * 스냅샷 재계산(계산서 서식·PDF)에서 재현되어야 하므로 **prop이 아닌 폼 상태**다.
 * undefined = 종전 2시점(하위호환 — 기존 저장 스냅샷 동작 불변).
 */
singleTimePoint?: "acquisition" | "transfer";
```

### D2. `transfer` 단독은 **취득연도 셀렉트를 남긴다**

두 안을 비교한 결과 안 1 채택.

| 안 | 내용 | 판정 |
|---|---|---|
| **안 1(채택)** | 취득 섹션을 "취득연도" 1칸으로 축약. `sameYear`이면 섹션 전체 복원 + §164⑧ 안내 | §164⑧ 보존. 화면은 4필드 → 1필드로 정리 |
| 안 2(기각) | 취득 섹션 완전 숨김. 상위 폼 취득일 prefill로만 `sameYear` 판정 | 상위 취득일 미입력 + 실제 동일연도이면 **일반 산식으로 틀린 양도값이 조용히 산출**된다(세액 오류). 기각 |

`prefill.acquisitionDate`는 대상 5곳 모두 전달하므로 통상 취득연도는 자동으로 채워진다
(예: `LandBuildingSaleSplitSection.tsx:168`, `GeneralBuildingBlock.tsx:342`). 안 1의 남는 1칸은
prefill 실패 시의 안전망이다.

### D3. `acquisition` 단독은 양도 섹션 완전 숨김

§2에 따라 의존 없음. 양도연도 필수 검증(`:598`)만 건너뛴다.

### D4. 결과 카드는 무변경

`BuildingStdPriceResultCard.tsx:109·112`가 이미 `acquisition &&` / `transfer &&` optional 렌더다.
엔진이 한쪽만 반환하면 그 카드만 나온다. `BuildingStandardPriceResult`의 두 필드 모두 optional
(`building-standard-price.ts:328·330`).

### D5. 계산서 서식 시점 필터에 신규 키 편입 (별개 결함 동반 수정)

`BuildingStdPriceReportSection.tsx:67·69`의 시점 필터 정규식이 `gb|cb`만 커버해 **3개 키가
매칭되지 않는다**. node로 전수 실행 확인:

| 스냅샷 키 | acq 필터 | transfer 필터 | 현행 출력 |
|---|---|---|---|
| `bsp-{id}-gb-acq` | ✅ true | false | 취득 1벌 (정상) |
| `bsp-{id}-cb-acq` | ✅ true | false | 취득 1벌 (정상) |
| `bsp-{id}-gb-transfer` | false | ✅ true | 양도 1벌 (정상) |
| `bsp-{id}-split-acq` | ❌ false | false | **취득·양도 2벌** |
| `bsp-{id}-split-transfer` | ❌ false | ❌ false | **취득·양도 2벌** |
| `bsp-{id}-cbinh-acq` | ❌ false | false | **취득·양도 2벌** |

단일 시점 모드가 들어가면 엔진이 애초에 1벌만 반환하므로 신규 스냅샷은 자동 해소되지만,
**기존 저장 스냅샷**(`singleTimePoint` undefined)은 그대로 2벌이 남는다 → 정규식에 키를 추가한다.

```ts
// 현행
if (/-(phd|gb|cb)-acq(-commercial)?$/.test(key)) …
else if (/-(gb|cb)-transfer$/.test(key)) …
// 변경 — split·cbinh 편입
if (/-(phd|gb|cb|cbinh|split)-acq(-commercial)?$/.test(key)) …
else if (/-(gb|cb|split)-transfer$/.test(key)) …
```

---

## §4 변경 지점 (7파일)

| # | 파일 | 변경 |
|---|---|---|
| 1 | `lib/calc/building-std-price-form.ts` | `BuildingStdPriceFormState`에 `singleTimePoint?` 추가(:136 블록) |
| 2 | 〃 | `initialBuildingStdPriceForm`(:194) — 미지정(undefined) |
| 3 | 〃 | `validateBuildingStdPriceForm`(:596~632) — 모드별 분기 |
| 4 | 〃 | `toEngineInput`(:403~456) — 단일 시점이면 반대 시점 point 미구성 + `singleTimePoint` 전달 |
| 5 | `lib/tax-engine/types/building-standard-price.types.ts` | `BuildingStandardPriceInput.singleTimePoint?` 추가 |
| 6 | `lib/tax-engine/building-standard-price.ts` | `:327` 연도 게이트 완화 · `:349`/`:424` `validatePoint` 조건부 · 반환에서 미사용 시점 제외 |
| 7 | `components/calc/building-std-price/BuildingStdPriceForm.tsx` | 섹션 렌더 게이트(`:420`·`:522`) + §164⑧ 안내 |
| 8 | `components/calc/building-std-price/BuildingStdPriceModalButton.tsx` | `applyTimePoint` → `prefillForm.singleTimePoint` 주입(:112~128) |
| 9 | `components/calc/results/BuildingStdPriceReportSection.tsx` | 시점 필터 정규식 2곳(D5) |

호출부 5곳은 **무변경**(이미 `applyTimePoint`를 넘기고 있음).

### 엔진 분기 스케치

```ts
// building-standard-price.ts :326~
const single = input.singleTimePoint;
if (input.transferYear === undefined && single !== "acquisition") {
  throw new BuildingStdPriceError("양도: 양도연도 필수");
}
if (input.acquisitionYear === undefined && single !== "transfer") {
  throw new BuildingStdPriceError("양도: 취득연도 필수");
}
// sameYear 판정에 취득연도가 필요하므로, single === "transfer"에서도 취득연도가 있으면 그대로 쓴다.
const sameYear =
  input.acquisitionYear !== undefined && input.acquisitionYear === input.transferYear;

// single === "transfer" && !sameYear  → acquisition 계산·검증 건너뛰고 { transfer } 만 반환
// single === "acquisition"            → transfer  계산·검증 건너뛰고 { acquisition } 만 반환
// single === "transfer" && sameYear   → 현행 §164⑧ 경로 그대로(취득 필수)
```

**단일 소스 유지**: `sameYear` 판정식은 엔진(`:340`·`:369`)과 폼(`:256`)이 각각 갖고 있다. 본 작업에서
새 판정을 추가하지 않고 기존 식을 그대로 재사용한다(dual-truth 신설 금지).

---

## §5 케이스 매트릭스

| # | `singleTimePoint` | 취득연도 | 양도연도 | 폼 노출 | 엔진 결과 | 적용 버튼 |
|---|---|---|---|---|---|---|
| C1 | `transfer` | 2025 | 2026 | 양도 전체 + 취득연도 1칸 | `{ transfer }` | 양도시 적용 |
| C2 | `transfer` | 2026 | 2026 | 양도 전체 + **취득 전체** + §164⑧ 안내 + 동일연도 환산 섹션 | `{ acquisition, transfer, sameYearAdjusted }` | 양도시 적용 |
| C3 | `transfer` | 미입력 | 2026 | 양도 전체 + 취득연도 1칸 | `{ transfer }` | 양도시 적용 |
| C4 | `acquisition` | 2015 | (숨김) | 취득 전체만 | `{ acquisition }` | 취득시 적용 |
| C5 | `acquisition` | ≤2000 | (숨김) | 취득 전체 + 2001.1.1 위치지수 안내 | `{ acquisition, acqBaseConversion }` | 취득시 적용 |
| C6 | undefined (기존 스냅샷·3시점·PHD) | 2015 | 2026 | 2시점 전부 | `{ acquisition, transfer }` | 현행 그대로 |
| C7 | `transfer` + 복합구조 | 2015 | 2026 | 양도 + 복합 부분별 | 복합 경로(`:339`) — **범위 밖, 현행 유지** | 현행 |
| C8 | `transfer` + 공동주택 환산 | 2015 | — | 환산 경로(`:317`) — **범위 밖, 현행 유지** | 현행 |

**C7·C8 판단**: 복합구조·공동주택 환산은 별도 반환 경로라 단일 시점화 이득이 작고 분기가 곱해진다.
`singleTimePoint`가 지정돼도 이 두 모드가 켜지면 종전 2시점 동작을 유지한다(폼에서도 섹션 복원).

---

## §6 테스트 계획

### 신규 anchor

| ID | 파일 | 검증 |
|---|---|---|
| S1 | `__tests__/tax-engine/building-standard-price/single-timepoint.test.ts` | C1 — `singleTimePoint:"transfer"` + 취득 point 없음 → throw 없이 `{ transfer }`, `acquisition === undefined` |
| S2 | 〃 | C4 — `"acquisition"` + `transferYear` 없음 → `{ acquisition }` |
| S3 | 〃 | C2 — `"transfer"` + 동일연도 → §164⑧ 경로 유지(`sameYearAdjusted === true`), 취득 미입력이면 종전대로 throw |
| S4 | 〃 | C6 — `singleTimePoint` undefined이면 결과가 현행과 동일(회귀 가드) |
| S5 | `__tests__/calc/building-std-price-form.test.ts`(증설) | `validateBuildingStdPriceForm` — C1에서 취득 구조·용도·공시지가 미입력이 **오류 아님** / C2에서는 오류 |
| S6 | 〃 | `toEngineInput` — C1이 `input.acquisition`을 만들지 않음(빈 point 전달 금지) |
| S7 | `__tests__/components/building-std-single-timepoint-gating.test.tsx` | C1에서 "취득당시 구조" 미렌더 · "취득연도" 렌더 / C2에서 둘 다 렌더 |
| S8 | 〃 | C4에서 "양도당시 구조"·"양도연도" 미렌더 |
| S9 | `__tests__/calc/building-std-report-phd-section.test.tsx`(증설) | D5 — `split-transfer`는 양도 1벌, `split-acq`·`cbinh-acq`는 취득 1벌만 렌더 |

### 기존 회귀 — **파손 예상 1건 (사전 인지)**

`e2e/building-stdprice-apply-timepoint.spec.ts`는 **양도시 섹션 모달에서 취득·양도 2시점을 모두 입력**해
"취득시 적용" 버튼이 안 뜨는 것을 검증한다(`computeBothTimePoints`, 헤더 주석 참조).
단일 시점화 후에는 취득 섹션이 축약되어 이 헬퍼가 실패한다.

→ 스펙의 취지("반대 시점 버튼 미노출")는 **단일 시점 모드에서 자동 충족**되므로,
2시점 입력 대신 C1 시나리오(양도만 입력 → 양도시 적용 버튼만)로 스펙을 갱신한다. 삭제하지 않는다.

### 회귀 실행 범위

```bash
npx vitest run __tests__/tax-engine/building-standard-price/ __tests__/calc/ __tests__/components/
npx playwright test e2e/building-stdprice-apply-timepoint.spec.ts \
  e2e/building-stdprice-modal-prefill.spec.ts e2e/cb-building-stdprice-modal-apply.spec.ts \
  e2e/building-std-2023-mixed-transfer-report.spec.ts \
  e2e/transfer-phd-building-stdprice-calculator.spec.ts --workers=1
```

E2E는 **순차 실행**(`--workers=1`) — 병렬 시 사전존재 flaky 3건이 재현된 이력.

---

## §7 리스크

| # | 리스크 | 대응 |
|---|---|---|
| R1 | 기존 저장 스냅샷의 계산서 서식이 깨짐 | `singleTimePoint` undefined = 현행 경로. S4 회귀 가드 |
| R2 | 상위 취득일 미입력 + 동일연도인데 §164⑧을 놓쳐 **틀린 양도값** | D2 안 1 — 취득연도 칸 상시 노출. 안 2를 채택하지 않는 이유 |
| R3 | 폼·엔진이 `sameYear`를 각자 판정(dual-truth) | 신규 판정 추가 금지, 기존 두 식 그대로 사용. 통합은 별건 |
| R4 | C7·C8(복합·공동주택 환산) 분기 폭증 | 범위 밖 — 두 모드 활성 시 종전 2시점 유지 |
| R5 | PDF 경로(`building-std-pdf-data.ts`)에서 재계산 실패 | D1로 해소(폼 상태 저장). S9와 별도로 PDF 경로는 동일 `toEngineInput` 사용이라 자동 커버 |

---

## §8 작업 순서

```
PR ① 엔진 + 변환 (사용자 가시 변화 없음)
  1. types에 singleTimePoint? 추가              → verify: tsc 0건
  2. 엔진 분기(§4 스케치) + S1~S4 anchor        → verify: npx vitest run __tests__/tax-engine/building-standard-price/
  3. validate·toEngineInput 분기 + S5·S6        → verify: npx vitest run __tests__/calc/

PR ② 폼 UI (사용자 가시)
  4. 폼 상태 필드 + initial + 섹션 게이트 + §164⑧ 안내
  5. 모달이 applyTimePoint를 폼에 주입
  6. S7·S8 anchor                                → verify: npx vitest run __tests__/components/
  7. e2e/building-stdprice-apply-timepoint.spec.ts 갱신 → verify: playwright --workers=1

PR ③ 계산서 필터 (D5 — 독립)
  8. 시점 필터 정규식 2곳 + S9                   → verify: npx vitest run __tests__/calc/building-std-report-phd-section.test.tsx
```

PR ①은 `singleTimePoint`를 아무도 넘기지 않는 상태라 동작 변화 0 — 안전하게 선행 가능.
PR ③은 ①②와 독립이라 순서 무관(먼저 머지해도 됨).

**완료 기준**: C1~C8 전 케이스 anchor 통과 · `npm run check:pre-pr` 통과 ·
Playwright로 이미지3 경로(양도시 모달) 화면 확인.

---

## §9 선행 전례 — 동일 설계가 2026-07-26에 구현·제거된 이력

`git log -S "acquisitionOnly"` 실측:

| 커밋 | 내용 |
|---|---|
| `b6847a58` | PHD 감면 모달용 **단일시점 모드 신설** — 엔진 `acquisitionOnly` 분기 + 폼 `singleTimePoint: boolean` + validate/toEngineInput 분기. anchor 8건, 회귀 259건 통과 |
| `e6b29592` | PHD 요구가 "취득+최초고시 **2시점 동시**"로 바뀌어 그 인프라를 **불용으로 제거** |

**제거 사유는 설계 결함·회귀가 아니라 요구 변경이다.** 즉 본 계획의 설계(폼 상태 플래그 +
엔진 단일 시점 분기)는 이미 한 번 회귀 통과한 전례가 있다. 계획서 `phd-building-std-modal-single-timepoint.plan.md`
와 위 diff를 구현 참고로 쓴다.

본 계획이 그때와 다른 점:

- 방향이 **양방향**(`"acquisition" | "transfer"`)이다 — 그때는 취득 전용 boolean
- 결과를 `valuation`이 아니라 `acquisition`/`transfer`로 반환한다 — 모달의 기존 시점별 적용 버튼과
  계산서 서식 `markCell` 판정을 그대로 쓰기 위함
- **§164⑧ 예외**를 둔다 — 그때는 취득 전용이라 이 문제가 없었다

## §10 범위 밖 (명시)

- `ThreePointStandardPriceInput`(3곳)·`ReductionPhdInput`(2곳)·`MixedUseAssetMajorStdPrice` — 2시점이 실제로 필요
- 독립 페이지(`app/tools/building-standard-price`, `lockedTaxType` 미지정) — 2시점 유지
- 상속·증여 1시점 경로 — 무관
- 복합구조·공동주택 환산 모드(C7·C8)
- `sameYear` 판정식 단일화(R3) — 별건

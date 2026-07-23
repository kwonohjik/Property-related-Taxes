# PHD 3시점 일괄계산 — 최초공시(≤2000) 건물기준시가 미산출 버그 수정 계획서

작성: 2026-07-23 · 상태: **Do 완료** (rev.3 — anchor F1~F5 GREEN·회귀 901·tsc 0·E2E T11 추가 11/11·acquisition-cost-review 게이트 실행) · rev.2 (1회 자가검토 반영 — E1~E3·M1~M2)

## 1. 증상

3시점 건물기준시가 일괄 계산 모달(§164⑦)에서 **취득시(1992)·양도시(2026)는 산출되지만 최초공시일(1993)은 미산출**.

- 재현 입력: 신축 1992 · 철근콘크리트조 · 단독주택·아파트(지수 100) · 연면적 263.45㎡ · 취득시(2001 기준) 공시지가 820,000 · 최초공시일 1993 공시지가 600,000
- 표시: `최초공시일 건물 기준시가 —` + 경고 "1993년은 국세청 건물기준시가 고시(2001년~) 이전 — 직접 입력 필요"
- 그러나 **같은 조건의 취득 1992는 산정기준율(0.942) 경로로 정상 산출**(81,399,727 — 홈택스 실측 일치)

## 2. 원인 (실측 확정)

`lib/calc/phd-building-std-batch.ts:201~207` `computeCategory`:

```ts
if (point.year >= BUILDING_STD_FIRST_YEAR) {        // ≥2001 → valuation
  v = valuationStdPrice(resolved, builtYear, point);
} else if (isAcquisition) {                          // ≤2000 → 취득만 산정기준율 허용
  v = acqBaseStdPrice(resolved, builtYear, point);
} else {
  push(preGosiReason(point.year));                   // ← 최초공시 ≤2000은 무조건 unsupported
}
```

- `isAcquisition`은 `key === "acquisition"`(:241)에만 true → **최초공시 시점은 ≤2000이면 산정기준율(§B) 경로 자체가 차단**.
- 엔진·데이터는 이미 지원함 (probe 실측 2026-07-23):
  - `ACQ_BASE_RATE` 표: builtYear 1992 행에 1993 열 = **0.927** 수록 (`lib/tax-engine/data/building-standard-price/acq-base-rate.ts:28`)
  - `calcBuildingStandardPrice`(transfer, acquisitionYear=1993, builtYear=1992, rc/용도1, 공시지가 820,000, 면적 263.45) → **80,103,553** (rate 0.927 · perM2 328,000) 정상 산출

## 3. 법령·선례 근거

- 소령 §164⑦ 환산식의 분모는 **최초고시 당시** 토지+건물 기준시가. 건물분은 §164⑤ 준용(국세청 「건물 기준시가 계산방법」 고시) — 고시 전(≤2000) 연도는 고시 §8 산정기준율로 2001년 기준시가에서 환산.
- **엔진 내부 선례**: `calcApartmentConversion` (`lib/tax-engine/building-standard-price-helpers.ts:516·524`)이 이미 최초고시 시점을 `base2001 × resolveAcqBaseRate(group, builtYear, firstNoticeYear)`로 환산 — `firstNoticeBuildingValue = Math.floor(base2001 * firstNoticeAcqBaseRate)`. 본 수정은 이 확립된 산식을 3시점 배치에 동일 적용하는 것.
- **엔진 레벨 특성화 anchor 기존재**: `__tests__/tax-engine/building-standard-price/phd-3point-batch.anchor.test.ts:64` A3 `"공동주택 최초고시 1993(≤2000) — transfer.acquisition은 acqBase 값"`이 엔진 경로를 이미 검증 중 → **엔진 레벨 신규 anchor 불필요**, RED는 배치 게이트에서만 발생.
- 위치지수·지수표는 **2001년 체계** 사용(취득 ≤2000과 동일) — 모달 UI도 이미 최초공시 ≤2000이면 "2001년 체계"로 옵션을 제시 중(`PhdBuildingStdPriceModalButton.tsx:152` `schemeYear`). 즉 **구조·용도 입력은 이미 수집되고 있고 산출만 막혀 있음**.

## 4. 설계 결정

### D1. 최초공시 ≤2000 → 산정기준율(§B) 경로 허용

`computeCategory`의 게이트를 `isAcquisition` → **`key !== "transfer"`**(취득·최초공시 공통)로 확장. 양도시 ≤2000은 §164⑦ 성립 불가(양도는 항상 현재)이므로 기존 unsupported 유지.

### D2. base2001 위치지수용 공시지가 = 2001년 기준 공시지가 (명시 입력)

산정기준율 경로의 `pricePerM2`는 **2001년 지수표**로 계산하므로 위치지수도 **2001.1.1 기준 공시지가**를 써야 한다(취득 경로에서 UI가 공시지가 연도를 "2001년 (기준)"으로 고정하는 이유와 동일 — 선례 `calcApartmentConversion`의 단일 `building2001LandPrice`).

- **최초공시일 연도(예: 1993) 공시지가 필드값을 건물 산출에 쓰지 않는다** (1993 공시지가는 §164⑦ 토지분·외부 되돌려쓰기 용도로 존치).
- `PhdBatchInput`에 **`landPrice2001PerM2?: number` 명시 필드 추가**. 모달이 취득시(2001 기준) 공시지가 입력값을 전달. **firstDisclosure ≤2000 경로 전용** — 취득 ≤2000 경로는 기존 `acquisition.landPricePerM2` 그대로 **무변경**(Surgical Changes — fallback 체인 `?? ` 이중 소스 금지, rev.2 E3 정정).
- **가드(자동 fallback 금지 정책 준수)**: 최초공시 ≤2000인데 `landPrice2001PerM2` 부재 시 unsupported 기록 — 사유: "최초공시 {year}년(고시 전) 건물 환산에는 2001년 기준 공시지가가 필요합니다 — 취득시(2001년 기준) 공시지가를 입력하세요."
- **모달 `pt()` 게이팅 존치(rev.2 M1)**: `PhdBuildingStdPriceModalButton.tsx:222~224`는 최초공시일 연도 공시지가(예: 1993년 600,000) > 0이어야 firstDisclosure point를 구성한다. 수정 후 건물 산출에는 이 값이 쓰이지 않지만, §164⑦ 토지분·외부 3시점 섹션 되돌려쓰기에 필요하므로 **입력 요구를 존치**한다(의도적 결정 — 완화하지 않음).

### D3. 스냅샷 재구성 동기화

`lib/calc/phd-batch-snapshots.ts:158~159`가 현재 "취득 ≤2000 acqBase transfer 스냅샷 — 취득 시점만(최초공시<2001은 생략)" — **최초공시 ≤2000도 동일한 transfer-모드 acqBase 스냅샷 생성**으로 확장 (suffix 기존 `first` 유지, acquisitionYear=최초공시연도, 공시지가=`landPrice2001PerM2`). 미확장 시 "모두 적용" 후 결과탭 「건물 기준시가 계산서」에서 최초공시 행만 근거 누락.

### D4. UI 문구

- 미산출 경고(현행 `preGosiReason`) 제거 대상: 최초공시 시점. 취득·최초공시 외 잔여 사용처(양도 ≤2000)는 유지.
- 최초공시일 공시지가 필드 hint 보강: "고시 전(≤2000) 최초공시일의 건물분은 2001년 기준시가 × 산정기준율로 환산 — 이 공시지가는 토지분에 사용" (문구는 Do 단계에서 확정).

### D5. 범위 제외 (별건)

- **연면적 round2 미적용**(263.452 그대로 곱셈 — 홈택스 263.45와 938원 차이): 2026-07-23 오전 분석 별건. 본 계획의 anchor는 엔진 레벨 263.45로 고정하여 독립성 확보.
- `ReductionPhdInput` dual-truth(의제취득일 미반영): PR #752 잔여 별건.

## 5. 케이스 매트릭스

| # | 시점 | 연도 | 카테고리 | 현행 | 수정 후 |
|---|---|---|---|---|---|
| C1 | 최초공시 | ≤2000 (1993) | housing 단일 | unsupported | **산정기준율 산출** (base2001 × 0.927) |
| C2 | 최초공시 | ≤2000 | housing 다부분(복합) | unsupported | 산정기준율 복합 (`acqBaseConversion.convertedTotal`) |
| C3 | 최초공시 | ≤2000 | commercial (Case A 주택용도 주입) | unsupported | 산정기준율 산출 (주입 구조·용도) |
| C4 | 최초공시 | ≤2000 · `landPrice2001PerM2` 부재 | — | unsupported | unsupported (사유 교체 — D2 가드) |
| C5 | 최초공시 | ≥2001 | 전체 | valuation 산출 | 변화 없음 (회귀) |
| C6 | 취득 | ≤2000 | 전체 | 산정기준율 산출 | 변화 없음 (회귀 — 81,399,727 유지) |
| C7 | 양도 | ≤2000 | 전체 | unsupported | 변화 없음 |
| C8 | 최초공시 | ≤2000 · 산정기준율표 미수록 구조(신공법) | — | unsupported | unsupported (엔진 throw → catch 기록, 기존 메커니즘) |

## 6. Anchor (Pre-Do — RED 확인 후 Do)

**대상 파일: `__tests__/calc/phd-building-std-batch-mixed.test.ts`** (배치 레벨 — `computePhdThreePointStdPrice` 대상. rev.2 E1 정정: `phd-3point-batch.anchor.test.ts`는 엔진 특성화 파일로 자체 A1~A3 기존재 → 라벨 충돌·계층 오배치 회피. 라벨은 **F1~F5** 사용):

- **F1 (C1)**: builtYear 1992 · rc/용도1 · 263.45㎡ · firstDisclosure {year:1993, landPricePerM2:600,000} · landPrice2001PerM2 820,000 → `firstDisclosure.housing === 80_103_553` (probe 실측 2026-07-23: perM2 328,000 × 263.45 × 0.927 floor). 현행 RED(unsupported).
- **F2 (C4)**: 동일 입력에서 landPrice2001PerM2 미지정 → `unsupported`에 firstDisclosure 항목 + 사유 문자열.
- **F3 (C6 회귀)**: acquisition {year:1992, landPricePerM2:820,000} → `acquisition.housing === 81_399_727` (홈택스 실측 일치값).
- **F4 (C3)**: Case A commercial 행 + 주입 → firstDisclosure.commercial 산출 (값은 Do 단계 probe로 확정 후 고정).
- **F5 (D3)**: `phdBatchToSnapshots` — firstDisclosure ≤2000 입력 시 최초공시 시점 스냅샷 생성 + acquisitionYear·공시지가(2001 기준) 필드 검증. 스냅샷 키 suffix(현행 map `firstDisclosure: "first"` — `phd-batch-snapshots.ts:142`)의 실제 키 형식은 **Do 단계에서 확인 필요**(rev.2 M2 — 단정 금지).

## 7. 수정 파일 (예상)

| 파일 | 변경 |
|---|---|
| `lib/calc/phd-building-std-batch.ts` | `PhdBatchInput.landPrice2001PerM2?` 추가 · `computeCategory` 게이트 확장(취득+최초공시) · `acqBaseStdPrice` 공시지가 소스 파라미터화 · unsupported 사유 정비 |
| `lib/calc/phd-batch-snapshots.ts` | 최초공시 ≤2000 acqBase 스냅샷 생성 |
| `components/calc/building-std-price/PhdBuildingStdPriceModalButton.tsx` | `landPrice2001PerM2` 전달(취득시 공시지가 필드 시드) · hint 문구 |
| anchor 테스트 2개 파일 | §6 |

**14지점 해당 여부**: 양도세 엔진 input/result·API·Zod 무변경 (모달 내부 배치 + 적용값은 기존 3시점 필드로 유입) → ⑫⑬⑭ 비해당. 변경 표면은 위 4파일로 한정.

## 8. 검증 계획

0. E2E 경고 문구 의존 없음 실측 확인됨(rev.2 — `e2e/` grep "미산출·직접 입력 필요" 0건 → 문구 변경 시 E2E 회귀 없음)
1. anchor F1~F5 RED → 구현 → GREEN
2. 회귀: `npx vitest run __tests__/tax-engine/building-standard-price/ __tests__/calc/phd-building-std-batch-mixed.test.ts` 전건 통과
3. `acquisition-cost-review` 게이트 (§164⑤·⑦ 체인 — 기준시가가 환산취득가 분모·분자에 유입)
4. `npx tsc --noEmit` 0건
5. 브라우저(Playwright) 확인: 재현 입력 → 최초공시일 건물 기준시가 산출 + 경고 카드 소멸 + "모두 적용 (3개)"

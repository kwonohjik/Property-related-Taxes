# 재개발 §164⑦ PHD 환산 — 기준시가 입력 **항목축 재편** + 건물 기준시가 계산기 배선

- 작성일: 2026-08-24
- 대상 화면: 재개발·재건축 자산 ⑤ 「인가전 분 종전 부동산 취득가액」 → 환산취득가액 → ⑤ 「환산 기준시가」
- 대상 파일(주): `components/calc/transfer/RedevelopmentValuationSection.tsx`
- 요청: ① 토지 기준시가(취득시·최초공시시)를 **한 섹션**으로, 건물 기준시가(취득시·최초공시시)를 **한 섹션**으로 묶는다.
        ② 건물 기준시가를 **수동 입력에서 계산기 연동**으로 바꾼다(이미 구현된 기능 재사용).

---

## 1. 현행 실측 (file:line)

`RedevelopmentValuationSection.tsx:225-278` — `isPreDisclosureTriggered`(취득일 < 최초공시일)일 때
§164⑦ 본문 박스가 열리고, 그 안이 **시점축**으로 2분되어 있다:

| 현행 박스 | 내용 | 위치 |
|---|---|---|
| 「취득시 (Sum_A 산정)」 | `LandPriceLookupField`(취득시 개별공시지가) + `CurrencyInput`(취득시 건물 기준시가, **수동 입력**) | `:240-259` |
| 「최초공시 당시 (Sum_F 산정)」 | `LandPriceLookupField`(최초공시 당시 개별공시지가) + `CurrencyInput`(최초공시 당시 건물 기준시가, **수동 입력**) | `:260-279` |

두 건물 칸의 hint가 모두 `"국세청 건물 기준시가 (총액, 원) — 수동 입력"`이다(`:250`·`:270`).
즉 **이 자산에는 건물 기준시가 계산기 진입점이 없다** — 사용자가 값을 밖에서 구해와야 한다.

산식은 `:56-66`의 `useMemo`가 담당한다:

```
Sum_A = floor(취득시 개별공시지가 × 면적) + 취득시 건물기준시가
Sum_F = floor(최초공시 개별공시지가 × 면적) + 최초공시 건물기준시가
P_A   = floor(A × Sum_A / Sum_F)                      … §164⑦ 본문
환산취득가 = floor(권리가액 × P_A / D)                  … §166③
```

## 2. 재사용할 기존 기능 — **동형 선례가 이미 있다**

`components/calc/transfer/ReductionPhdInput.tsx:213-265` (감면 조문 PHD 환산, §164⑤)이
**취득시 + 최초공시시 2시점**을 한 모달에서 계산해 두 필드에 동시 주입한다. 재개발 PHD와 구조가 같다.

- 컴포넌트: `components/calc/building-std-price/BuildingStdPriceModalButton.tsx`
- 2시점 동시 적용: `onApplyBoth?: (acquisition: number, transfer: number) => void` (`:31`)
  → 지정 시 결과 카드에 「취득·양도 모두 적용」 **단일 버튼만** 노출(오적용 방지)
- 둘째 시점 라벨 override: `transferSectionLabel` (`:80`) → `"최초공시 시점"`
- prefill: `landAreaM2` · `acquisitionDate` · `transferDate` · `acqLandPricePerSqm` · `transferLandPricePerSqm`

⇒ **신규 컴포넌트를 만들지 않는다.** 배선만 한다.

## 3. 변경 설계

### 3-1. 항목축 재편 (`RedevelopmentValuationSection.tsx:239-279` 치환)

```
§164⑦ 본문 발동 박스
├─ A. 최초공시 주택가격                       (변경 없음, :225-233)
├─ [토지 기준시가]        ← 신규 그룹
│   ├─ 취득시 개별공시지가 (원/㎡) + 토지기준시가   (LandPriceLookupField, referenceDate=취득일)
│   └─ 최초공시 당시 개별공시지가 (원/㎡) + 토지기준시가 (LandPriceLookupField, referenceDate=최초공시일)
└─ [건물 기준시가]        ← 신규 그룹
    ├─ [건물 기준시가 계산] 런처 1개 (2시점 동시 산출·주입)
    ├─ 취득시 건물 기준시가        (CurrencyInput — 계산기 주입 후 수정 가능)
    └─ 최초공시 당시 건물 기준시가  (CurrencyInput — 동일)
```

- 위젯·prop·필드명은 **그대로 옮긴다**(`redevLandPricePerSqmAtAcq` 등 4필드 무변경).
- 「Sum_A 산정」·「Sum_F 산정」 라벨은 시점축 헤더였으므로 사라진다.
  두 합계는 미리보기 박스(`:288-296`)가 이미 `Sum_A (취득시 합계)` / `Sum_F (최초공시 당시 합계)`로
  값과 함께 표시하므로 정보 손실이 없다. 각 입력 hint에 시점만 유지한다.
- 런처 버튼은 `<Button variant="modalLauncher">` 규약을 쓰는 `BuildingStdPriceModalButton`이
  이미 만족한다(native 런처 신설 금지 — `components/calc/CLAUDE.md`).

### 3-2. 계산기 배선

```tsx
<BuildingStdPriceModalButton
  buttonLabel="건물 기준시가 계산"
  transferSectionLabel="최초공시 시점"
  initialAddress={stdPriceAddressOf(asset)}
  snapshotKey={`bsp-${asset.assetId}-redev-phd`}
  prefill={{
    landAreaM2: asset.redevLandArea || undefined,
    acquisitionDate: asset.acquisitionDate,
    transferDate: asset.redevFirstDisclosureDate,
    acqLandPricePerSqm: prefillAcqLandPrice(asset.acquisitionDate, asset.redevLandPricePerSqmAtAcq),
    transferLandPricePerSqm: asset.redevLandPricePerSqmAtFirst || undefined,
  }}
  onApplyBoth={(acq, first) =>
    onChange({
      redevBuildingStdPriceAtAcq: String(acq),
      redevBuildingStdPriceAtFirst: String(first),
    })
  }
/>
```

결정 사항 3건:

- **`hideFloorAreaInput`은 켜지 않는다.** 재개발 자산 폼에는 연면적 필드가 없다
  (① 기본정보 축 A는 `redevLandArea`만 — `AssetAreaRedevelopment.tsx:136`).
  켜면 모달이 유일한 연면적 입력 경로인데 칸이 사라져 **dead-end**가 된다
  (`BuildingStdPriceModalButton.tsx:82-84`의 명시적 경고).
- **`lockedTaxType`은 지정하지 않는다** — 선례(`ReductionPhdInput`)와 동일.
- **소재지**는 `stdPriceAddressOf(asset)`(`components/calc/transfer/asset-std-price-address.ts`)를 쓴다.
  현재 이 섹션은 `asset.addressJibun`만 참조하지만, 모달 prefill은 `AddressValue` 전체를 받는다.

### 3-3. 헬퍼 위치 — `prefillAcqLandPrice`

현재 `ReductionPhdInput.tsx:41`에 **UI 컴포넌트 파일에서 export**되어 있다.
UI→UI import를 피하려고 `lib/calc/phd-acq-land-price-track.ts`(이미 `pickAcqLocationIndexLandPrice`가
사는 단일 출처 파일)로 **이동**하고 `ReductionPhdInput`은 import로 전환한다. 순수 이동, 로직 무변경.

> ⚠️ **취득 ≤2000 트랙 주의.** `prefillAcqLandPrice`는 취득연도 < 2001이면 `undefined`를 돌려준다 —
> 그 경우 위치지수는 **2001.1.1 현재 공시지가**를 써야 하는데(§164⑤·고시 §6①) 재개발 폼에는
> 그 값을 담는 필드가 없기 때문이다(`redevLandPricePerSqmAtAcq2001` 부재).
> 재개발 PHD는 취득일 < 최초공시일(단독 2005-04-30 / 공동 2006-04-28)일 때만 발동하므로
> **≤2000 취득이 오히려 흔하다.** 이때는 모달 안 `LandPriceLookupField`로 사용자가 직접 조회한다
> — 입력 경로가 있으므로 dead-end가 아니다. 잘못된 값을 자동 주입하는 것보다 안전한 쪽이다.
> (2001 전용 필드 신설은 이 작업 범위 밖 — 필요해지면 별건.)

### 3-4. 스냅샷 키 규약 등재 — **누락하면 계산서가 조용히 사라진다**

신규 키 `bsp-${assetId}-redev-phd`는 3곳에 등재해야 한다. `lib/calc/building-std-snapshot-keys.ts`가
단일 출처이고, 미등재 시 `idOfSnapshotKey`가 id를 환원하지 못해 결과탭 계산서가 **조용히 미출력**된다
(그 파일 `:20-23`의 실측 경고 — split·cbinh 3종이 그 상태였다).

| # | 파일 | 변경 |
|---|---|---|
| K-1 | `lib/calc/building-std-snapshot-keys.ts` `idOfSnapshotKey` | `.replace(/-redev-phd$/, "")`를 **`-red-phd`보다 앞**에 추가 |
| K-2 | 같은 파일 `snapshotKeyTimepoint` | **추가하지 않는다** — 2시점 통합 모달이라 시점 필터를 걸면 한쪽 인스턴스가 사라진다(`-red-phd`·`-split-both`와 동일 취급) |
| K-3 | `components/calc/results/BuildingStdPriceReportSection.tsx:89` | `/-red-phd$/` → `/-(?:red\|redev)-phd$/`로 확장하고 `titleOverride`를 키별로 분기(재개발은 §164⑦) |

`snapshotKindLabel`은 null 유지(제목이 이미 시점·조문을 밝힌다).

K-3의 제목:

| 인스턴스 | 감면 PHD (기존) | 재개발 PHD (신규) |
|---|---|---|
| 취득 측 | `취득시 (감면 PHD 환산 §164⑤)` | `취득시 (재개발 환산 §164⑦)` |
| 둘째 시점 | `최초공시일 (감면 PHD 환산 §164⑤)` | `최초공시일 (재개발 환산 §164⑦)` |

`markCellOverride` 규칙은 그대로 재사용한다(두 시점 모두 **취득 시점 측** 기준시가이므로 양도당시 칸이
아닌 취득당시 칸에 마킹 — 취득시는 연도별 `acq2000`/`acq2001`, 최초공시일은 `acq2001`).

## 4. 범위 밖 (명시)

- **계산 로직·엔진 무변경.** `useMemo` 산식(`:56-66`)·`lib/tax-engine/**`·`lib/calc/transfer-tax-api-redev.ts`
  ·`transfer-tax-validate-redev.ts`는 건드리지 않는다. 세액은 변하지 않아야 한다.
- **14 동기화 지점 해당 없음** — 신규 폼 필드가 없다(기존 `redevBuildingStdPriceAtAcq`/`AtFirst` 재사용).
  ⑤ UI 위젯만 바뀐다. (①②③④⑥⑦⑧⑨~⑭ 무변경 — 커밋 전 grep 자가 점검으로 확인)
- **토지 출자 분기(`isLand`)** — §166③ 단독 경로로 §164⑦ PHD를 쓰지 않는다. 무변경.
- 2001.1.1 공시지가 전용 필드 신설.

## 5. 검증 계획 (성공 기준)

| # | 단계 | verify |
|---|---|---|
| V-1 | **Pre-Do anchor** — 재편 **전에** 스냅샷 키 anchor를 먼저 작성·실행 | `__tests__/calc/building-std-snapshot-keys.test.ts`에 `bsp-a1-redev-phd` 케이스 추가 → **먼저 실패**하는 것을 확인(`idOfSnapshotKey`가 `a1-redev-phd`를 반환) → K-1 적용 후 통과 |
| V-2 | K-2 회귀 | `snapshotKeyTimepoint("bsp-a1-redev-phd") === null` 단언 추가 |
| V-3 | 결과탭 계산서 2장 분리 | `__tests__/calc/building-std-report-phd-section.test.tsx`에 redev-phd 케이스 추가 — 제목 2장(취득시/최초공시일 §164⑦), `markCell` 취득 측 |
| V-4 | UI 재편 렌더 | 신규 `__tests__/calc/redev-phd-stdprice-regroup.test.tsx` — 토지 그룹에 공시지가 2칸, 건물 그룹에 건물 2칸 + 계산 런처 1개. `onApplyBoth` 호출 시 두 필드 동시 patch(**단일 배치 patch** — 다중키 stale spread 금지) |
| V-5 | 세액 불변 | `npx vitest run __tests__/tax-engine/transfer-tax/redevelopment/ __tests__/calc/` |
| V-6 | E2E 회귀 | `npx playwright test e2e/redevelopment-acquisition-mode-radio.spec.ts e2e/redev-receive-only-filing-total.spec.ts` |
| V-7 | 브라우저 수동 확인 | 재개발 자산 → 환산취득가액 → 취득일<2005 입력 → 두 그룹 렌더 확인 → 계산기 실행 → 두 필드 동시 주입 → 결과탭 계산서 2장 확인 |
| V-8 | 게이트 | `npm run check:pre-pr` |

> V-1을 **먼저** 도는 이유: 키 규약 미등재는 타입 오류를 내지 않고 계산서만 조용히 사라진다.
> anchor가 먼저 빨개지는 것을 봐야 그 사각지대가 실재함을 확인할 수 있다
> (memory `feedback_pre_anchor_verification` · `feedback_negative_assertion_needs_mutation_probe`).

## 6. 작업 순서

1. V-1·V-2 anchor 작성 → 실패 확인 → K-1·K-2 적용 → 통과
2. K-3(결과탭 분기 확장) + V-3 anchor
3. `prefillAcqLandPrice` → `lib/calc/phd-acq-land-price-track.ts` 이동, `ReductionPhdInput` import 전환
4. `RedevelopmentValuationSection.tsx:239-279` 항목축 재편 + 계산기 배선
5. V-4 UI 테스트
6. V-5~V-8 회귀·수동 확인
7. `scripts/ship.sh`

## 7. 착수 후 실측 — 미확인 3건 전부 해소 (2026-08-24)

- **U-1 해결**: `RedevelopmentValuationSection.tsx` 재편 후 **505줄**(전 461줄, +44).
  800줄 트리거 미달 — 분리 불필요.
- **U-2 해결**: `stdPriceAddressOf`(`components/calc/transfer/asset-std-price-address.ts`)는
  road·jibun·building·detail·lng·lat·**pnu·dong·ho** 9필드를 넘긴다(빈 동/호는 undefined로 접음).
  `ReductionPhdInput`이 쓰는 `{jibun만}` 리터럴보다 낫다 — `pnu` 없이는 건축물대장 조회가
  비활성이었다는 실측 사고가 그 파일 주석에 남아 있다(`0bb6d345`/PR #1054). ⇒ 채택.
- **U-3 해결**: 결과탭은 `inputData={{ assets: formData?.assets }}`를 넘기고
  (`TransferTaxResultView.tsx:530`) `AssetForm.assetId`(`calc-wizard-asset.ts:65`)가 그 안에 실린다
  ⇒ `inputStr.includes(id)` 소속 판정 통과. 양도 결과뷰 **4곳 전부** 같은 배선이다
  (`TransferTaxResultView`·`MultiTransferTaxResultView`·`BundledAllocationCard`·`MixedUseResultCard`)
  — 재개발 자산이 가는 단건·다자산 두 경로 모두 포함.

### 추가로 정리한 것 (계획에 없던 소소한 발견)

- `ReductionPhdInput.tsx`가 `BUILDING_STD_FIRST_YEAR = 2001`을 **로컬 재선언**하고 있었다
  (`lib/calc/phd-building-std-batch.ts:19`에 이미 export되어 있는데 dual-truth).
  `prefillAcqLandPrice`를 lib으로 옮기면서 그 상수도 lib 것을 import하도록 통합했다.
- `prefillAcqLandPrice`를 import하던 테스트 1건
  (`__tests__/components/calc/reduction-phd-building-stdprice.test.tsx:10`)의 경로를 갱신했다.

## 8. 검증 결과

| # | 항목 | 결과 |
|---|---|---|
| V-1 | 키 규약 anchor **먼저 실패** 확인 | ✅ `expected 'a1-redev-phd' to be 'a1'` → K-1 적용 후 통과 |
| V-2 | `snapshotKeyTimepoint` null | ✅ |
| V-3 | 결과탭 2장 분리 + 조문 라벨 분기 | ✅ mutation probe로 구별력 확인(redev 분기 무력화 → 실패) |
| V-4 | UI 재편 + 단일 배치 patch | ✅ 6건. patch를 2회로 쪼개는 mutation → 실패 확인 |
| V-5 | 회귀 | ✅ 241파일 2,500테스트 전건 통과 |
| V-6 | E2E 재개발 spec | ✅ 3건 통과 |
| V-7 | tsc | ✅ 0건 |

**세액 무변경**: 엔진·`useMemo` 산식·`transfer-tax-api-redev.ts`·`transfer-tax-validate-redev.ts`
미변경. 재개발 엔진 테스트 전건 통과가 이를 뒷받침한다.

## 9. 코드 품질 게이트 결과 (`/code-review high`, 2026-08-24)

리뷰어가 tsc·eslint·vitest(360파일 3,286건)를 직접 돌리고, 신규 키를 키 규약 소비처 4곳
(`idOfSnapshotKey`·`snapshotKeyTimepoint`·`snapshotKindLabel`·`phdTimepointLabel`)과
`use-auto-save-calculation`·PDF 경로·`replaceSnapshotsByPrefix` 호출부까지 추적했다.
`redevLandArea`→`landAreaM2` 매핑(연면적 아님)·헬퍼 이동의 순환 부재도 확인됐다.

### 🔴 Medium 1건 — 수정 완료

**`lockedTaxType` 미전달**(`RedevelopmentValuationSection.tsx`). 없으면 모달에 세목 라디오가
뜨고(`BuildingStdPriceForm.tsx:281`), 사용자가 「상속·증여(1시점)」로 바꾸면 결과 카드가
`onApply`를 부르는 「이 금액 적용」 버튼을 낸다. 이 호출부는 `onApplyBoth`만 배선했으므로
**두 필드 중 아무것도 채워지지 않는 침묵 no-op**인데, `saveSnapshot`은 실행되어 결과탭에
「취득시 (재개발 환산 §164⑦)」 라벨을 단 상증 계산서가 한 장 뜬다.

⇒ `lockedTaxType="transfer"` 추가. E2E P-2에 세목 라디오 부재 단언을 넣고 **mutation probe로
구별력을 실측**했다(prop 제거 → P-2 실패).

> 선례 `ReductionPhdInput`에도 같은 구멍이 있다. 기존 코드라 이번 diff에서는 건드리지 않는다
> (Surgical) — **별건 후보**로 남긴다.

### Low 2건

- **L-1 (기록만, 후속 별건)**: `-redev-phd` 스냅샷이 **§164⑦ 트리거가 꺼질 때 무효화되지 않는다.**
  블록 게이트는 `acquisitionDate < redevFirstDisclosureDate`라는 **파생 조건**인데
  `building-std-snapshot-store`에는 `replaceSnapshotsByPrefix` 외에 삭제 API가 없다.
  시나리오: 취득일 2003 입력 → 계산기 사용(스냅샷 저장) → 취득일을 2010으로 **정정** →
  §164⑦ 블록은 사라지고 산식도 그 필드를 안 쓰는데, 결과탭·PDF는 계산서 2장을 계속 찍는다.
  `-red-phd`는 명시 토글(`phdMode`)이 게이트라 덜 흔하지만, 여기는 **날짜 정정**이라 일상적으로 뒤집힌다.
  ⛔ useEffect로 트리거 변화를 감지해 삭제하는 방식은 **store 미러링 금지 정책**과 충돌한다 —
  해법 설계가 필요하므로 이번 범위 밖으로 둔다.
- **L-2 (수정 완료)**: `BuildingStdPriceReportSection`의 신규 주석이 존재하지 않는 변수
  `isRedev`를 언급했다(실제 코드는 `phdConversionKind`). 주석↔구현 드리프트라 즉시 정정.

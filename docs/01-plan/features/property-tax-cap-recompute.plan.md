# A-3 §118 정밀 재산정 — 전체 calc 연도화 (역사 세율표) 계획서

> worktree `feat/property-tax-cap-recompute` (slot 2 → dev 3002 / e2e 3102, base origin/master ae9e318c)
> 선행: `property-vessel-fire-heir-cap.plan.md` A-3 절 · engine.design.md §4 (A-1·A-2 worktree)
> 방침 확정(2026-06-16 사용자): **전체 calc 연도화** (비주택 5종 세율 함수 연도 파라미터화 + 역사 세율표)
> 상태: Plan (Do 미착수)

## 0. 배경 · 조사 결과 (실측)

세부담상한(§122)은 비주택만, "직전 연도 재산세액 상당액"의 150%. 시행령 §118 본문 = 직전연도 법령·과세표준으로 세액상당액 재산정. 현행 UI는 §118 단서(직접입력)만 지원(`Step3.tsx`). 본문(재산정) 모드를 추가하되, **직전연도 세율을 역사 세율표에서 조회**해 정밀 산출한다.

### 조사 확정 (file:line)
| 항목 | 사실 | 근거 |
|---|---|---|
| §111 비주택 세율 개정 | 최근 개정(20251231)은 취득세·담배소비세만, 재산세 §111 세율 **무변경** | KoreanLaw amendment_track (지방세법 MST 282559) |
| 건축물 세율 | general `BUILDING_GENERAL_RATE`(0.25%)·luxury `BUILDING_LUXURY_RATE`(4%)·**factory 리터럴 `0.005`**(0.5%, 상수 아님) | `property-tax.ts:303-331`(`:321` factory 리터럴), `legal-codes/property.ts:55-59`(general·luxury) |
| 선박·항공기 | 리터럴 `0.003` (고급선박 5% 미구현 — 별도 갭) | `property-tax.ts:692-693` |
| 토지 종합합산 세율 | `calculateComprehensiveAggregateTax(taxBase)` 누진 | `property-tax-comprehensive-aggregate.ts:406` |
| 토지 별도합산 세율 | `calculateSeparateAggregateTax(...)` 누진 | `separate-aggregate-land.ts:416` |
| 토지 분리 세율 | `calculateSeparateTaxationTax(...)`·`calculateSeparateTax(...)` (0.07%/0.2%/4%) | `separate-taxation.ts:396·468` |
| **세부담상한 4지점·3함수** (검토 #1 정정) | 별도합산→`calculateSeparateAggregateTax` 내부(prevTax `:502`) / 분리→`applyTaxCap`(`:581`,prevTax `:584`) / 종합합산→**`applyBurdenCap`**(호출 `:638`,prevTax `:640`) / 메인 건축물·선박·항공기→`applyTaxCap`(`:707`,prevTax `:710`). 주택은 §122 단서 미적용 | `property-tax.ts:581·707` / `comprehensive-aggregate.ts:436` / `separate-aggregate-land.ts` |
| applyTaxCap 시그니처 | `(calculatedTax, objectType, previousYearTax?)` | `property-tax.ts:346-349` |
| 종부세 영향 | 재산세 applyTaxCap과 별개(`comprehensive-tax-helpers.ts:206` 자체 함수) | (A-1·A-2 검토 #10 확정) |

→ **세율 불변** 확인 → 역사 세율표는 현재 단일 엔트리(기준연도부터 현행, 개정 이력 없음). "전체 calc 연도화"의 실익 = **미래 개정 자동 추종 구조 + §118 본문 정밀 재산정**.

## 1. 목표 아키텍처

```
lib/tax-engine/data/property-rate-history.ts (신규)
  PROPERTY_RATE_HISTORY: { [fromYear: number]: PropertyRateSet }
    PropertyRateSet = { building{general,luxury,factory}, vesselAircraft, vesselLuxury?,
                        landComprehensive: Bracket[], landSeparateAggregate: Bracket[],
                        landSeparated{low,general,high} }
  getPropertyRateSet(year): PropertyRateSet   // year 이하 최대 fromYear 엔트리. 현재 단일.

calc 함수 연도화 (rateSet 주입):
  calcBuildingTax(taxBase, buildingType, rateSet)
  선박·항공기 (rateSet.vesselAircraft)
  comprehensive-aggregate / separate-aggregate-land / separate-taxation (rateSet.land*)
  → 기존 호출부: rateSet = getPropertyRateSet(현행연도) 기본 → 기존 동작 100% 보존(회귀 0)

recompute (§118 본문):
  recomputePriorYearTax(objectType, priorTaxBase, priorYear, opts)
    = getPropertyRateSet(priorYear) 세율로 objectType별 세액 산출 (연도화된 calc 재사용)
  calculatePropertyTax 본문 Step 2.5: taxCapMode==="recompute" → basisTax = recompute(...)
    → 세부담상한 4지점(applyTaxCap 2·applyBurdenCap 1·별도합산 내부 1)의 previousYearTax 자리에 basisTax 주입
    (각 cap 함수 시그니처 불변 — direct 모드는 input.previousYearTax 그대로)
```

## 2. Phase 분할 (회귀 보존 우선)

| Phase | 범위 | 회귀 가드 |
|---|---|---|
| **P1** | 역사 세율표 데이터 `property-rate-history.ts` + `getPropertyRateSet` + 현행값 추출 anchor | 데이터만, 코드 무변경 |
| **P2** | 건축물·선박·항공기 calc 연도화 (rateSet 주입, 기본=현행) | 기존 anchor 전수 통과 |
| **P3** | 토지 연도화 — **종합합산·별도합산만**(분리는 classify 3함수 분산 + recompute 무관 → 후속, Do 환류). + 역사표 누진공제 보강(종합 D3 엔진 주석 오기 → 실제 250,000 정정) | 종부세 직접 import 없음 확인 → 회귀 0 |
| **P4** | `recomputePriorYearTax`(건축물·선박·종합합산만) + 본문 Step 2.5 + basisTax 주입(applyTaxCap `:707`·applyBurdenCap `:638`). 분리(`:581`)·별도(`:502`)는 **direct only** | recompute anchor C-2(건축물)·C-5(선박)·C-6(종합합산) + direct C-1·분리·별도 회귀 |
| **P5** | UI 모드 토글(RadioCardGroup) + `previousYearTaxBase`·`taxCapMode` 14지점 | direct 현행 회귀·validate 동기화(⑧) |
| **P6** | 통합 anchor + 전체 vitest 회귀 + 결과뷰 재산정 산식 | 전체 8000+ test |

**각 Phase 독립 커밋. P1→P6 순서 강제(P2~P4 엔진이 P5 UI 선행).**

## 3. 핵심 리스크 · 보존 전략

1. **회귀 (최대 리스크)**: calc 함수 시그니처 변경이 모든 호출부(종부세 연동 포함) 영향. **기본 인자 = `getPropertyRateSet(현행연도)`**로 기존 호출 동작 불변. 각 Phase마다 해당 test 디렉터리 + comprehensive 회귀 필수.
2. **역사값 정확성**: 현행 세율 추출 시 PROPERTY_CONST·토지 brackets와 **원단위 일치 anchor**(P1). 추정 금지.
3. **종부세 연동**: 토지 calc 연도화(P3)가 `comprehensive-land-*` 호출 영향 가능 → `comprehensive-*.test.ts` 전수.
4. **800줄 정책**: `property-rate-history.ts` 단일 책임. recompute는 신규 헬퍼 분리.
5. **A-1·A-2 미머지**: 본 worktree는 origin/master 분기(A-1·A-2 없음) — 독립 PR. 파일 충돌 없음(applyTaxCap·calc vs surtax·taxpayer).

## 4. 14지점 (P5)

엔진: `PropertyTaxInput`에 `previousYearTaxBase?`·`taxCapMode?` / `applyTaxCap` 시그니처 불변(basisTax 본문 주입) / recompute 헬퍼.
클라이언트: ①폼 `taxCapMode`·`previousYearTaxBase` ②initial(direct) ③normalize 불요(useState) ④API 변환(비주택+recompute 시 base 전송) ⑤Step3 RadioCardGroup 모드 토글 ⑥사이드바 무관 ⑦결과뷰 재산정 산식 ⑧validate(recompute 시 base>0, 미입력 경고).

## 5. anchor 전략 (Pre-Do 우선)

- P1: `getPropertyRateSet(2026).building.general === 0.0025` 등 현행값 일치(추출 검증)
- P2/P3: 연도화 후 기존 calc anchor 불변(회귀)
- P4: 세부담상한 4지점은 direct 전수 + **recompute는 3종만**(설계 §4 정합) —
  · 메인 건축물·선박 `applyTaxCap`(`:707`): recompute(직전 과표→직전 세율 재산정→min(당해,×150%)) + direct
  · 종합합산 `applyBurdenCap`(`:638`): recompute + direct
  · 분리 `applyTaxCap`(`:581`)·별도합산(`:502`): **direct only** — 면적·classify 구조라 recompute 후속(설계 §5 C-6x)
  · C-1 direct 회귀 / C-3 주택 미적용(§122 단서)
- P6: calculatePropertyTax 통합(recompute 모드 determinedTax) — 4분류 전수

## 6. Definition of Done

- [ ] P1~P6 각 Phase 독립 커밋, 순서 준수
- [ ] 역사 세율표 현행값 일치 anchor
- [ ] recompute anchor (C-2·C-6) + direct/주택 회귀
- [ ] calc 연도화 후 기존 anchor 전수 통과 (회귀 0)
- [ ] `tsc --noEmit` 0 / 전체 vitest 통과 (종부세 연동 포함)
- [ ] UI 모드 토글 + 14지점 + 브라우저/E2E 확인

## 7. 범위 외

- 고급선박 5%(§111①4호 가목) 미구현 — 별도 갭(본 작업과 무관, recompute는 현행 엔진 세율 추종)
- §118 1호 나·다·라목·2호 나·다·라목·4호(분할·합병·신축·용도변경·정비사업·9억 전환) — v1 제외(직전 현황 재구성 필요)

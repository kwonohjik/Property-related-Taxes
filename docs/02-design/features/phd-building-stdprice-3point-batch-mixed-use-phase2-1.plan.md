# PHD 3시점 건물기준시가 일괄 계산 — Phase 2.1: Case A 취득·최초공시 상가건물 완전 자동화(Option A)

> 선행: `phd-building-stdprice-3point-batch-mixed-use.plan.md`(Phase 2, Option B, PR#522 배포 완료).
> 트리거: Phase 2에서 F8(세법 미확정)으로 수동 유지한 **Case A 취득·최초공시 상가건물** 2필드를 자동 산출로 승격.
> 법령: 소득세법 시행령 §164⑤·⑦(미공시 취득당시 기준시가 환산) + §166⑥ + **국세청 회신 재일46014-2396(1994.9.7) — 취득시 기준시가 용도 판정 = 취득일 현재 실제 용도**.
>
> ## ✅ P0 확정 (2026-07-07): **후보 H — 당시(취득·최초공시) 실제 용도 = 주택**
> 근거: 재일46014-2396 "건축물 용도구분은 사실상 사용 용도, 취득시 기준시가는 **취득일 현재 기준으로 용도 판정**" + 조세심판 국심1996전1741(용도지수=건물 실제 용도). → Case A 취득·최초공시 상가건물 = **주택 용도지수**로 평가(구조·면적은 상가부분값 유지). 후보 C(양도시 상가 용도 고정) 기각. **Phase 2.1 착수 가능**.

---

## 0. 문제 정의 — Phase 2가 남긴 것

Phase 2(Option B)는 배치가 **주택분 3시점 + 양도시 상가분**만 산출하고, **Case A(용도변경 house_to_commercial + 최초공시<용도변경)의 취득·최초공시 상가건물 기준시가**는 배치 미산출·수동 유지(필드별 홈택스 버튼 존치, F9)했다.

이유(F8, Phase 2 §C4): Case A에서 **취득·최초공시 당시 그 면적은 주택**이었다(용도변경 전). 배치가 상가 부분을 **양도시 상가 용도지수**로 평가하면 틀린 값이 될 수 있다 — 당시 실제 용도로 평가해야 하는데 그 규칙이 **세법상 미확정**이었다.

Phase 2.1 = 이 2필드를 자동 산출로 완성한다. **선행 게이트(세법 규칙)는 §2에서 확정됨(후보 H)** → 착수 가능.

---

## 1. 검증된 사실 (file:line·법령 실측 — 2026-07-07)

| # | 사실 | 근거 |
|---|---|---|
| V1 | 엔진은 취득시 **주택건물·상가건물을 별도 portion 값으로 직접 합산**(안분·용도 재판정 없음). `housingBuildingStdAtAcq = buildingStdPriceAtAcquisition`(주택건물), `commercialBuildingStdAtAcq = commercialBuildingStdPriceAtAcq!`(상가건물), `sumAtAcq4 = housingLand+housingBuilding+commercialLand+commercialBuilding`. → **배치가 각 portion 최종값을 정확히 산출해야** 함. | `transfer-tax-pre-housing-disclosure.ts:160-161,175` |
| V2 | §164⑤(건물)·§164⑦(개별·공동주택가격 미공시 주택)은 **취득당시 기준시가 환산 산식**을 규정하나, **겸용 용도변경 시 상가 portion의 용도지수**는 조문에 **없음**(별표 산식 + 집행기준 99-164-10 영역). | 소득세법 시행령 §164 [현행 MST 286211] |
| V3 | `commercialBuildingStdPriceAtAcq`·`AtFirstDisclosure`는 API·validate에서 이미 소비·검증(4부분 게이트). 필드·배선은 존재 — **신규 필드 불요**. | `transfer-tax-api.ts:210-223`, `validate-asset.ts:344-360` |
| V4 | Phase 2 배치 헬퍼는 commercial을 **양도시에만** 산출(`computeCategory` transfer만 호출). acq/first commercial은 미호출. | `lib/calc/phd-building-std-batch.ts:170-176` |
| V5 | Case A split UI 힌트: "양도시 상가 부분 면적의 **당시** 건물 기준시가". "당시"=취득/최초공시 시점(그때는 주택). | `ThreePointStandardPriceInput.tsx:488,514` |

> **결론**: 엔진·필드·배선은 준비됨(V1·V3). 세법 규칙은 §2에서 **후보 H 확정**(재일46014-2396). 남은 것은 (b) 배치가 acq/first commercial을 주택 용도지수로 산출, (c) 라우팅·게이팅 승격. **엔진 변경 0** 예상.

---

## 2. ✅ Phase 0 (완료) — 세법 규칙 확정 = 후보 H

**질문**: Case A에서 취득·최초공시 시점의 "상가건물 기준시가"(= 양도시 상가면적에 해당하는 부분의 당시 건물기준시가)는 어느 **용도지수**로 평가하는가?

**확정: 후보 H (당시 실제 용도 = 주택), 확신도 상.** 취득·최초공시 당시 그 면적은 사실상 주택 → **주택 용도지수**로 평가(구조·면적은 상가부분값 유지). 후보 C(양도시 상가 용도 고정) 기각.

**근거 (KoreanLaw 실측 조회)**:
- **국세청 회신 재일46014-2396(1994.9.7, "겸용주택 용도변경시 양도차익 계산 방법", 소득세법 §23)** — 직접 유권해석:
  1. "건축물의 용도구분은 **사실상 사용하는 용도**에 의하는 것이며 사실상의 용도가 불분명한 경우에는 공부상 용도에 의한다."
  2. "건물 **취득시의 기준시가를 계산하는 경우에는 취득일 현재를 기준으로** 위 1.에 따른 **용도를 판정**하여 해당 건물과세시가표준액을 적용한다." → 취득시 용도 = 취득일 현재 실제 용도.
- **조세심판 국심1996전1741(1996.8.26)** — 건물기준시가 용도지수는 건물의 **실제 용도**(의원·교육연구시설)로 적용. 원칙 보강.
- 동 원칙(평가시점 실제 용도)은 §164⑤/⑦ 3시점 중 **최초공시일 시점**에도 동일 적용(그 당시도 주택).

**보강 근거 (tax-senior 독립 조회 — 후보 H 수렴)**:
- **서일46014-10014(2002.1.7)**: 취득당시 적용 기준시가는 **취득일 현재 공시된 값**(용도·지목 사후 변경 무관) — 현황평가 원칙. **✅ 본문 확보(2026-07-22 사용자 제공 스크린샷)** — 회신: "취득 후 형질변경공사로 지목이 변경된 토지를 양도함에 있어 취득당시 적용할 기준시가는 **취득일 현재 고시되어 있는 개별공시지가**를 적용한다"(질의자의 변경 후 지목 소급 요청 기각). 사후 변경 소급 배제 원문 확정.
- **법규과-5613(2006.12.28)·부동산거래관리과-1062(2010.8.16)**: §164⑦ 환산 = 최초공시 주택가격 × (취득당시 토지+**건물 기준시가**)/(최초공시당시 토지+건물). 최초공시일<용도변경일이면 취득·최초공시 시점 전부 주택 → 산식 출발값이 **주택평가** → 상가 용도지수(후보 C)는 **메커니즘상 성립 불가**.
- **집행기준 99-164-10**(제목 확정): "주택을 상가로 용도변경하여 양도한 경우 환산취득가액 계산시 취득당시/양도당시 기준시가 산정방법" — **시점별 현황**으로 나눠 산정 전제.
- **조심2010서3472·조심2011중3378**: 각 시점 현황으로 기준시가 산정 후 §166⑥ 안분.
> 미확보(추정 배제): 법규과-5613·부동산거래관리과-1062·집행기준 99-164-10·조심 2건의 회신 **본문**은 NTS 세션 필요로 미조회(제목·존재·일자만 확정). **재일46014-2396·서일46014-10014는 요지·회신 본문 확보**(2026-07-22 사용자 제공 스크린샷 — 재일 질의 사실관계는 "겸용주택 2층 주택→점포 용도변경 후 양도"로 본건과 동일 유형). 다수 자료가 후보 H로 수렴하고 후보 C는 §164⑦ 메커니즘과 배치 → 확신도 상.

**설계 반영**: acq/first 상가 부분 = 주택 용도지수(§3.1). Case B(취득 당시 겸용)는 취득 당시 실제 용도=상가라 상가 용도(별개, Phase 2.1 비대상 유지).

> 참고: 배치 산출을 Case A splitMode 수동 입력 정의(`ThreePointStandardPriceInput.tsx:488,514` "양도시 상가 부분 면적의 **당시** 건물 기준시가" = portion)와 일치시킨다.

---

## 3. 설계 (후보 H 확정 기준 — §2)

> **⚠ 범위 = Case A(splitMode) 전용(F-a)**: Phase 2.1의 acq/first 상가 산출·라우팅은 **`splitHousingCommercialForAcqAndFirst===true`(용도변경 house_to_commercial + 최초공시<용도변경)에서만**. **Case B(항상 겸용)는 취득 당시도 상가 용도(재일46014-2396 "취득일 현재 실제 용도") → 주택 용도 치환이 틀림 → Phase 2 동작 불변**(취득 상가 = `MixedUseStandardPriceInputs` 수동, 배치 미산출). 배치 헬퍼는 순수(Case 모름)이므로 **caller(`ThreePointStandardPriceInput`, splitMode 보유)가 판별해 요청**한다.

### 3.1 배치 헬퍼 — Case A acq/first 상가 = 당시 주택 용도 (`phd-building-std-batch.ts`)

- **caller가 acq/first commercial 산출을 요청할 때만**(Case A) 계산. 요청 시 commercial 부분의 **acq/first 용도지수를 주택 용도로 치환**(구조·면적은 부분값 유지). 양도시는 부분의 상가 용도 유지.
- 구현(F-r2): `PhdBatchPart`에 optional `acqFirstUsageNo?`(당시 주택 용도번호) 추가 — caller가 Case A 상가 부분에 주택 대표 usageNo를 주입. **acq/first commercial 산출은 상가 부분에 `acqFirstUsageNo`가 있을 때만 활성**(미주입=Case B·단독 = Phase 2 불변, acq/first commercial undefined). 산출 시 `valuationStdPrice`가 각 상가 부분의 `usageNo`를 **`acqFirstUsageNo`로 매핑**한 뒤 valuation(구조·면적 유지). 양도시는 매핑 없이 부분 `usageNo`(상가) 그대로.
- **≥2001만**(Phase 2 제약 승계). acq ≤2000 다부분은 여전히 unsupported(C1).
- housing 산출·Case B·단독은 Phase 2와 **완전 불변**.

### 3.2 모달 UI (`PhdBuildingStdPriceModalButton.tsx`)

- **신규 prop `commercialAcqFirstMode?: boolean`**(= caller의 splitMode). caller(`ThreePointStandardPriceInput`)가 Case A일 때 true 전달.
- true일 때: 상가 부분의 `acqFirstUsageNo` = **첫(주된) 주택 행의 usageNo**로 자동 도출(주용도 원칙, R2 해소) → `computePhdThreePointStdPrice`에 주입해 acq/first commercial 산출 활성. Phase 2의 "취득·최초공시 상가 제외" 안내문 **제거**, "당시 주택 용도로 평가" 안내로 교체.
- **엣지(F-r3)**: 주택 행이 하나도 없으면 `acqFirstUsageNo` 도출 불가 → 상가에 미주입 → acq/first commercial 미산출(안전). Case A는 겸용이라 주택 부분이 정상 존재 전제이나, 방어적으로 미산출 처리(오류 아님).
- false(Case B·단독): Phase 2 동작 불변(acq/first commercial 미산출).
- 결과 표시: Case A는 취득·최초공시에도 상가분 줄 노출(산출값). 산출 count에 반영.

### 3.3 라우팅·게이팅 승격 (`ThreePointStandardPriceInput.tsx`)

- `applyBatch`: **acq/first commercial 라우팅 추가** — `v.acquisition?.commercial`·`v.firstDisclosure?.commercial` 산출 시 `onCommercialBuildingStdPriceAtAcqChange?.(...)`·`onCommercialBuildingStdPriceAtFirstChange?.(...)`. (Phase 2에서 미라우팅이던 것 해제. Case A에서만 값이 있으므로 자연히 Case A 국한.)
- caller가 모달에 `commercialAcqFirstMode={splitMode}` 전달(§3.2) → 모달이 상가 부분 `acqFirstUsageNo` 도출·주입. (caller는 splitMode만 넘기고 usageNo 도출은 모달 담당.)
- **게이팅(F9 역전)**: Phase 2는 line 525에서 commercial 버튼을 **무조건 노출**(`{onCommercialBuildingStdPriceChange && (...)}`). Phase 2.1은 배치가 채우므로 **`!hideBuildingCalcButton &&`를 다시 추가**해 acq/first 상가건물 버튼을 숨긴다. line 525는 **splitMode 블록 내부**라 이 변경은 **Case A에만 영향**(Case B·단독은 상가건물 필드 자체가 위젯에 없음). ≤2000 등 배치 unsupported 시에도 **필드는 직접 편집 가능**(계산 helper만 사라짐).

### 3.4 미변경

엔진(V1)·API·validate(V3)·14 동기화 지점 — 신규 없음.

---

## 4. 케이스 매트릭스 (Phase 2 대비 변화분만)

| 케이스 | Phase 2(Option B) | Phase 2.1(Option A) |
|---|---|---|
| 겸용 Case A 취득·최초공시 상가건물 | 배치 미산출·수동(버튼 존치) | **배치 산출**(당시 주택 용도, 후보 H)·버튼 숨김 |
| 겸용 Case A 그 외 | 불변(housing 3 + 양도 commercial 자동) | 불변 |
| 단독·Case B | 불변 | 불변 |

---

## 5. Phase 분해 (Do 순서)

```
P0.  ✅ 완료 — 세법 규칙 = 후보 H 확정(재일46014-2396 등, §2)
P1.  배치 헬퍼: Case A commercial acq/first 산출(acqFirstUsageNo 용도 치환) + anchor → verify: anchor green, tsc 0
P2.  모달: 상가 부분 당시 용도 안내·결과 3시점 노출 → verify: tsc 0
P3.  applyBatch acq/first commercial 라우팅 + 게이팅 승격(line 525 버튼 숨김) → verify: tsc 0
P4.  회귀 vitest 전체 + tsc·lint 0
P5.  E2E — T6 갱신(count 2→0, F-r1) + T7 신규(Case A 6필드 자동·적용). Phase 2 T4·T5 불변
P6.  코드 품질 게이트 → 커밋
```

> **⚠ 800줄 주의**: `ThreePointStandardPriceInput.tsx`는 Phase 2 후 ~746줄. P3에서 줄 수 확인, 800 초과 시 `applyBatch`/`enableCommercial` wiring을 sibling 헬퍼로 추출([[feedback_800line_split_export_preservation]]). `PhdBuildingStdPriceModalButton.tsx`도 확인(부분 목록 UI 추가로 증가분).

## 6. 테스트

- **anchor A5**(`phd-building-std-batch-mixed.test.ts` 확장): `acqFirstUsageNo` 주입 시 Case A commercial acq/first가 **주택 용도지수**로 산출됨을 엔진 등가로 검증(commercial 부분을 주택 용도로 valuation 호출한 값과 일치). 양도시는 상가 용도.
- **anchor A6(회귀)**: `acqFirstUsageNo` 미주입(Case B·단독) 시 acq/first commercial **여전히 undefined**(Phase 2 불변, F-a). Phase 2 A1~A4 전부 green 유지.
- **E2E T6 갱신(F-r1, 필수)**: Phase 2 T6은 `"건물 기준시가 계산" count=2`(상가 버튼 존치, F9)를 검증했다. Phase 2.1 게이팅 승격으로 **count 0**이 되므로 T6 단언을 `toHaveCount(0)`로 **갱신**(또는 T7로 흡수). 미갱신 시 T6이 깨진 채 회귀 오인 → **반드시 처리**.
- **E2E T7(신규)**: Phase 2 T6 진입(Case A) → 3시점 공시지가 전부 입력 → 모달에서 주택+상가 부분 입력 → "모두 적용" → **취득·최초공시 상가건물 필드까지 채워짐**(빈값 아님) + `"건물 기준시가 계산"` 버튼 count 0. Phase 2 T4·T5(Case B) 불변 green.

## 7. Definition of Done

- [x] P0 세법 규칙 문서화 = 후보 H 확정(재일46014-2396·국심1996전1741·법규과-5613 등, §2)
- [ ] anchor A5(Case A 용도지수 규칙) green + A6(Case B·단독 미산출 불변) green
- [ ] Phase 2 회귀 0(housing·양도 commercial·**Case B acq 상가 수동 유지**·단독 불변) — Phase 2 A1~A4·T4·T5 green
- [ ] tsc·lint 0 · vitest 전체 green
- [ ] E2E T6 갱신(count 0) + T7 green(6필드 자동 + 상가 버튼 승격) · Phase 2 T4·T5 불변
- [ ] 코드 품질 High/Medium 0
- [ ] 14 동기화 지점 신규 없음(grep 자가확인)

---

## 8. 리스크·비범위

- ~~**R1**: P0 세법 미확정~~ → **해소**: 후보 H 확정(§2, 재일46014-2396 등). Phase 2.1 착수 가능.
- **R2(해소)**: 용도지수는 **면적별이 아니라 그 시점 그 건물(동)의 실제 용도(주용도 원칙)**로 적용(tax-senior 확인). 취득시 건물 전체가 주택이면 그 **주택 주용도** 용도지수 1개. → `acqFirstUsageNo` = 주택 행의 대표(주용도) usageNo. 주택부분이 다구조여도 용도지수는 주용도 단일 — 모달이 첫(주된) 주택 행 usageNo 사용으로 충분.
- **NON-GOAL**: ≤2000 취득 다부분(C1 승계), 부속시설 안분, 다필지 위치지수 — Phase 2와 동일 비대상.

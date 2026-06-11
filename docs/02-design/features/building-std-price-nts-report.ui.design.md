# 국세청 「건물 기준시가 계산서」 재현 — UI 설계

> 계획: [building-std-price-nts-report.plan.md](../../00-pm/building-std-price-nts-report.plan.md) · 엔진: [building-std-price-nts-report.engine.design.md](./building-std-price-nts-report.engine.design.md)
> 작성일: 2026-06-11 · 상태: Design. 독립 도구(`/tools/building-standard-price`) — API route 없음, 동기화 지점은 클라이언트 8개(⑨~⑭ 해당 없음).

## 사용자 시나리오 (작성례 3건 = E2E 시나리오)

1. **(1) 양도 복합**: 양도 모드 → 복합구조 토글 ON(신규 노출) → 부분 3개(라벨·구조·**양도시 용도·취득시 용도**·면적) → 부속시설(주차 60·보일러 30) → 시점별 연도·공시지가 → 계산 → 계산서에 Ⅲ 3행·Ⅳ 4행·Ⅴ·Ⅵ ⑪217,230,000.
2. **(2) 취득 ≤2000 복합**: 위에서 취득연도 2000 선택 → 2001 지수표 부분 용도(#27 등) → ※표에 154,960,000×1.016=157,439,360.
3. **(3) 상속 복합+조정률 번호**: 상증 모드 → 상속/증여 구분(신규) → 부분별 조정률 번호(9·20) + 공용 조정률 번호(9·24/24) → ⑪200,540,000.

---

## 1. 폼 상태 확장 (`lib/calc/building-std-price-form.ts`) — 동기화 ①②③

| 필드 | 타입 | initial | normalize | 비고 |
|---|---|---|---|---|
| `inheritanceGiftKind` | `"inheritance" \| "gift"` | `"inheritance"` | fallback `"inheritance"` | Ⅰ ○ 위치 표시 전용 — 엔진 미전달 |
| `eventDate` | `string`(YYYY-MM-DD) | `""` | `""` | Ⅰ 일자 — **선택 입력**(서식 표기 전용). `DateInput`. 입력 onChange에서 해당 연도 필드 동기 set(동일 이벤트 내 — 미러링 아님). 모드별 의미: 양도=양도일 / 상증=상속·증여일 |
| `acquisitionEventDate` | `string` | `""` | `""` | Ⅰ 취득당시 일자(양도 모드 전용, 선택) — onChange 시 `acquisitionYear` 동기 |
| `floorsAbove` / `floorsBelow` | `string` | `""` | `""` | Ⅱ 건물전체 층수 — 표시 전용. `DecimalInput`(정수) |
| `ancillaryFacilities` | `Record<AncillaryFacilityKind, string>` | 전부 `""` | **마이그레이션**: 기존 `sharedFacilityArea` 값 존재 시 `other`로 이전 후 **기존 폼 필드 제거**(단일 출처 — normalize가 old shape 흡수, sessionStorage 호환) | Ⅳ·Ⅴ. 6칸 면적 입력 |
| `CompositePartForm.acqUsageNo` | `string` | `""` | `""` | 양도 복합 전용 — 취득시 용도(연도별 옵션, 취득 ≤2000 = 2001표) |
| `CompositePartForm.adjustmentNos` | `string[]` | `[]` | `[]` | 상증 — Ⅲ 조정률 번호 최대 3. `adjustmentRate` 입력과 **배타**(UI에서 모드 토글) |
| `CompositePartForm.sharedAdjustmentNos` | `string[]` | `[]` | `[]` | 상증 — Ⅳ 조정률 번호 최대 3. `sharedAdjustmentRate`와 배타 |
| `compositeMode` 게이트 확장 | — | — | — | 기존 `taxType==="inheritance_gift" && compositeMode`(`BuildingStdPriceForm.tsx:158`) → **모드 무관** `f.compositeMode`. 양도 복합 활성 |

**D-2 갱신(계획 환류)**: 일자는 연도 Select를 **대체하지 않는다** — 연도 Select 유지(기존 E2E·`changeYearWithGuard` 보존), 일자는 선택 입력으로 추가하고 입력 시 연도를 동기 set. 일자 미입력 시 Ⅰ 일자 칸은 `{연도}년` 표기. 일자-연도 불일치는 onChange 동기화로 구조상 불가.

## 2. API 변환 — 동기화 ④ (`toEngineInput`)

- `ancillaryFacilities`: 값>0 칸만 `[{kind, areaM2}]` 배열로. 전부 빈값이면 미전달. 기존 `sharedFacilityArea` 엔진 필드는 **전달 중단**(폼이 마이그레이션 후 단일 출처 — 엔진 deprecated 경로는 이력 데이터용).
- 양도 복합: `compositeParts[].acqUsageNo` 정수 변환, `usageNo`(양도시)와 병행. `acquisition`/`transfer` point는 `landPricePerM2`만 채움(structureKey·usageNo는 `""`·0 — 엔진이 복합 분기에서 미참조, 엔진설계 §input 비변경 항목).
- 조정률 번호: `adjustmentNos.map(Number)` — 번호 모드일 때만. % 모드면 기존 `adjustmentRate`.
- 표시 전용 필드(`inheritanceGiftKind`·`eventDate`·층수)는 엔진 미전달 — 서식 어댑터가 폼에서 직접 읽음.

## 3. 입력 UI — 동기화 ⑤ (계산 로직 순서 = 표시 순서)

```
[세목 RadioCardGroup(기존)] → 상증 선택 시: [상속 ◯ 증여 ◯] chip RadioCardGroup(신규, violet)
[① 건물 기본] 신축연도 · 연면적 · 토지면적 · 층수(지상/지하 2칸 한 행, 신규) · (상증)리모델링
[② 취득/평가 시점] 연도 Select(기존) + 일자 DateInput(신규, 선택 — "서식 표기용") + 구조·용도·공시지가
[복합구조 ToggleCard] ← 양도 모드에도 노출(게이트 확장). description에 양도 시 시점별 용도 안내
  └ CompositePartsSection 확장:
      부분 카드: 명칭 · 구조 · [양도] 양도시 용도 + 취득시 용도(2 Select, 취득≤2000이면 2001표) /
                 [상증] 용도 1개 · 면적
      [상증만] 조정률: RadioCardGroup(번호 선택 | % 직접) → 번호 모드 = AdjustmentNoPicker(신규,
                최대 3 chip, resolveAdjustmentRateByNo로 지수 미리보기. hint: "같은 구분(I~VII) 내
                중복 선택 주의 — 적용요령은 고시 기준") / % 모드 = 기존 DecimalInput
      [양도] 조정률 영역 미렌더(엔진 검증과 동기)
  └ AncillaryFacilitiesSection(신규): 6칸 면적(주차장·기계실·보일러실·대피소·옥탑·기타) grid 2열
      + [상증만] 부분별 공용 조정률(번호|% 배타) — 기존 sharedAdjustmentRate UI 위치 계승
[③ 양도 시점](양도) 연도 + 일자(신규) + (비복합·비동일연도) 구조·용도·공시지가(기존)
[조정률 섹션](상증·비복합) 기존 유지
```

- 위젯 강제: `DateInput`·`DecimalInput`·`RadioCardGroup`·`ToggleCard`·`LandPriceLookupField`(공시지가 전부)·placeholder 숫자 예시 금지.
- 양도 복합 + 동일연도(취득연도=양도연도): 복합 토글에 `disabled + disabledReason`("동일연도 §164⑧ 환산은 복합 미지원") — 엔진 차단(케이스 8)과 3중 동기(⑧ validate 포함).

## 4. 결과·서식 — 동기화 ⑥⑦

⑥ 사이드바: 해당 없음(독립 도구 — 기존 구조 유지).

⑦ 결과 = 계산서. **서식 어댑터**(순수 함수, `lib/calc/nts-report-adapter.ts` — 테스트 `__tests__/calc/nts-report-adapter.test.ts`):

```ts
buildNtsReportModel(form: BuildingStdPriceFormState, result: BuildingStandardPriceResult): NtsReportModel
// 산출: Ⅰ ○위치(계획 §2 파생 규칙)·일자, Ⅱ(⑤=Σfloor(③×④)·평균지가·층수·내용연수 "{durableYears}년"+
//   era 그룹 목록(2001~02=Ⅰ.Ⅱ.Ⅲ/2003~=Ⅰ.Ⅱ.Ⅲ.Ⅳ)+residualGroup 강조), Ⅲ행(ancillaryKind 없는
//   breakdown)·Ⅳ행(ancillaryKind 있는 행, "용도(귀속)" 라벨 = attributedTo), Ⅴ(ancillaryApportionment →
//   행 슬롯 배치), Ⅵ(⑪ 모드 분기 — 계획 §5), ※(acqBaseConversion || 단일 acqBaseRate breakdown)
// 양도 복합 = 서식 2벌(양도당시 / 취득당시) — 작성례 (1)+(2) 세트 재현
```

**Ⅴ 행 슬롯 배치 규칙(동결)**: 부분을 용도지수 내림차순(동률 시 면적 내림차순) 정렬 → 슬롯 가이드(1~8행: 140·130·120·110·100·100·60·40)에서 지수 일치하는 첫 빈 행에 배치, 일치 행 없으면 지수 순서를 보존하는 위치 행에 기재값으로 덮어쓰기(작성례 2: 90 → 행6). 미사용 행은 가이드 값 그대로 출력. 9행="제외" 고정. 부분 8개 초과 = warnings(서식 행 부족).

**컴포넌트 분할(800줄 사전 분할 — `components/calc/building-std-price/nts-report/`)**:

| 파일 | 책임 |
|---|---|
| `NtsBuildingStdPriceReport.tsx` | 어댑터 호출 + 서식 1~2벌 조립 + 화면 접힘 카드(▼) + `print:block` |
| `ReportSection1Category.tsx` | Ⅰ 5열 매트릭스(○·텍스트·일자) |
| `ReportSection2Overview.tsx` | Ⅱ 기본현황(③ 3행·평균지가·내용연수 그룹) |
| `ReportEvalTable.tsx` | Ⅲ·Ⅳ 공용 11열 표 — `variant:"main"(9행)\|"ancillary"(7행)`, 빈 조정률 `( )`, 합계 행 |
| `ReportSection5Apportion.tsx` | Ⅴ 10열 안분표(계(t)+슬롯 1~9) |
| `ReportSection6Total.tsx` | Ⅵ 3칸 + ※ 5칸(항상 출력 — 미해당 시 빈 표) |

**양식 표기 규칙**: 지수 소수 2자리(116→1.16)·잔가율 0.586·조정률 칸 `0.9(9)` / IV 동시해당 `0.6(20·24)`(`adjustmentItems.nos.join("·")`), 금액 `text-right font-mono tabular-nums`, **"원" 접미사 금지**, 면적 `100㎡`, 흑백(neutral 계열)·다크모드 흰 배경 강제, 내부 id 미노출.

**채널 교체(D-1)**: `BuildingStdPricePrintView`·`BuildingStdPricePrintTable` 삭제 → page 결과 영역에서 `NtsBuildingStdPriceReport`로 대체. 화면에서는 접힘 카드(▼ 토글)로 노출하고 인쇄 시 자동 펼침 — `print-only-css-toggle` 패턴 그대로: 본문 `className={open ? "block" : "hidden print:block"}` + 토글 버튼 `print:hidden`. 인쇄 버튼(`bsp-print`) 유지.

## 5. Validation — 동기화 ⑧ (`validateBuildingStdPriceForm`)

| 규칙 | 메시지 |
|---|---|
| 양도 복합: 부분별 `acqUsageNo` 미선택 | "복합 부분 N: 취득시 용도를 선택하세요." |
| 양도 복합: `acquisition`·`transfer` 공시지가 > 0 | 기존 메시지 재사용 |
| 양도 복합 + 동일연도 | "동일연도 양도는 복합구조를 지원하지 않습니다." (UI disabled와 3중) |
| `ancillaryFacilities` 합 > 0 + [상증] 수령 부분 0 | 기존 "1개 이상 부분에 공용 조정률" 메시지 계승 |
| 번호·% 동시 입력 | UI 배타 토글로 구조상 차단 + validate 방어 1줄 |
| 조정률 번호 1~36 외 | "조정률 번호가 올바르지 않습니다." (37 비대상 — 화재·멸실은 기존 비율 입력 유지) |
| `eventDate` 연도 ≠ 해당 연도 Select | onChange 동기화로 구조상 불가 — validate 방어 생략 |

## 6. testid 동결 (대표 — Do에서 전수 고정)

`nts-bsp-1-{transfer|acq2001|acq2000|inh|gift}-{mark|text|date}` · `nts-bsp-2-no{3|4|5|6|7}` · `nts-bsp-2-avg` · `nts-bsp-{3|4}-row{i}-{a|no1|no2|no6|no7|adj|no8|no9|no10}` · `nts-bsp-{3|4}-sum-{no9|no10}` · `nts-bsp-5-row{t|1..9}-{idx|ai|bi|ci|di|ei|fi|gi|hi}` · `nts-bsp-6-{no11|no5|total}` · `nts-bsp-x-{1|2|3|4|sum}`

## 7. E2E (`e2e/building-standard-price.spec.ts` 추가 — `E2E_PORT=3100`)

| spec | 단언 |
|---|---|
| 작성례(1)+(2) 세트 — 양도 복합·취득 2000.2.1 | 양도당시 서식: Ⅲ합 167,100,000 · Ⅳ합 50,130,000 · ⑪ 217,230,000 · Ⅴ행 40/20 / 취득당시(2001) 서식: ⑪ 154,960,000 / **※표: 1.016 · 157,439,360** |
| 작성례(3) 상속 복합+번호 | 지상1 ⑧ 601,000 · 조정률 칸 "0.9(9)" · ⑪ 200,540,000 |
| 인쇄 채널 | `emulateMedia(print)` 서식 렌더 — 기존 "결과 인쇄/PDF 서식" spec **재작성**(D-1) |
| 기존 12 spec | 회귀(간이 서식 단언 교체 외 불변) |

## 8. 자가 점검 (Do 완료 게이트) — ✅ 완료(2026-06-11)

- [x] ①~⑧ 전부 + 마이그레이션(③ `sharedFacilityArea`→`ancillaryFacilities`) — 폼 lib 22건
- [x] 어댑터 순수 함수 anchor — `nts-report-adapter.test.ts` 3건(상증 1벌·양도 2벌·단일)
- [x] 6 컴포넌트(Ⅰ~Ⅵ+※) + 어댑터 + 폼 UI(양도 복합 토글·부속 6종·조정률 번호·상속증여·일자·층수)
- [x] 간이 인쇄 서식 교체(D-1) — `BuildingStdPricePrintView`·`PrintTable` 삭제, `NtsBuildingStdPriceReport` 대체
- [x] tsc 0 · lint 0 · npm test 7,149건 · E2E 13건(상속복합 ⑪ 200,540,000·양도 2벌 90,000,000/82,200,000·조정률 "0.9(9)")
- [x] 800줄 정책 준수(최대 BuildingStdPriceForm 646줄)

**Do deviation**: Ⅴ표 행 슬롯 배치는 어댑터가 부분별 행을 그대로 출력(슬롯 가이드 1~9 고정값 매핑은 후속). 양도 복합 numeric은 폼+어댑터 단위 테스트로 커버(E2E는 상속복합·양도 2벌 렌더 중심).

# transfer-nbl-academy-land.spec.ts — spec rot 복구 계획

> 상태: Plan
> 발견 경위: 비사업용 토지(NBL) 토지가액 자동조회 기능 작업(`feat/nbl-judgment`) 중 회귀 검증에서 발견.
> 결론: 이 spec은 **현 master에서 이미 실패**하며, 원인은 본 작업과 무관한 **transfer 취득 흐름 UI 변경에 spec 셀렉터가 미추종한 사전존재 rot**.

## 1. 배경

`e2e/transfer-nbl-academy-land.spec.ts`(인천 중구 내동 6-20 학원용 토지 환산취득가액 단독 양도)는
환산취득가 모드 + 장기보유 + 사업용 토지 계산을 끝까지 입력→계산→결과 캡처하는 E2E이다.

NBL 자동조회 작업의 회귀 baseline으로 실행한 결과, **변경 전(stash baseline)·rebase 후 최신 master(`30a6f19a`) 양쪽에서 동일하게 실패**했다. 즉 본 기능 변경과 무관한 기존 결함이다.

이 spec은 라인 107~108에서 **비사업용 토지 토글을 OFF로 유지**하므로 NBL 상세판정/수입금액비율 섹션(자동조회 버튼 위치)에는 진입하지 않는다. 따라서 NBL 자동조회 기능 검증은 RTL 컴포넌트 테스트(`__tests__/components/nbl-land-autofetch.test.tsx`)로 대체했고, 본 계획서는 **spec 자체 복구**만 다룬다.

## 2. 근본 원인 (probe 실측)

진단 probe(spec 흐름을 단계별로 따라가며 각 셀렉터 count 측정)로 확인한 사실:

| 단계 | 셀렉터 | 측정값 | 판정 |
|---|---|---|---|
| 토지·농지 / 독립 나대지 / 면적 입력 / 양도가액 (원) / 매매 | 각 1 | — | 정상 |
| 환산취득가 (라인 83) | `getByRole("button",{name:"환산취득가",exact:true})` | **0** (loose=1) | ❌ |
| 취득일 (라인 86~88) | `getByLabel("일").nth(2)` | "일" label **8개** | ❌ |
| 공시지가 단가 (라인 93·98) | `getByPlaceholder("공시지가 단가")` | 2 | ⚠️ 순서 미확정 |
| 자본적 지출액 (원) (라인 104) | label | 1 | 정상 |
| 결과 단계 (라인 120~) | — | 미도달 | ⚠️ 미검증 |

### 결함 A — 환산취득가 버튼 accessible name 변경 (라인 83)
`components/calc/transfer/CompanionAcqPurchaseBlock.tsx`의 취득가액 산정방식 버튼은 현재
`<button><div>환산취득가</div><div>양도가 × 기준시가 비율</div></button>` 구조다.
설명 div가 추가되면서 버튼의 accessible name이 **`"환산취득가양도가 × 기준시가 비율"`**로 합쳐졌다.
probe 실측: `exact:true "환산취득가"` = 0개, 부분매칭 = 1개.

### 결함 B — `getByLabel("일")` substring 매칭으로 인덱스 어긋남 (라인 86~88)
`getByLabel`은 부분(substring) 매칭이다. 라벨에 "일"을 포함하는 컨트롤이 페이지에 **8개** 존재한다
(양도일·신고일·취득일의 DateInput "일" 3개 + 토지 성격/기타 라벨에 "일"을 포함하는 radio·필드 다수).
probe 실측: 취득일 단계에서 `getByLabel("일").nth(2)`가 **취득일 DateInput이 아닌 `landNature`(value=appurtenant) radio**로 해석됨 → `radio cannot be filled` 오류.
- 양도일(nth 0)·신고일(nth 1)은 페이지 상단에 위치해 우연히 맞았으나, 같은 substring 취약성을 공유한다(향후 상단에 "일" 라벨 추가 시 동일 붕괴).

## 3. 복구 방안

원칙: **UI testid 추가는 최소화**하고 spec 셀렉터를 견고하게 만드는 것을 1순위로 한다(surgical). spec만으로 안정 셀렉터를 만들 수 없을 때만 UI에 `data-testid`를 추가한다.

### A. 환산취득가 버튼 (라인 83)
- 1순위: 제목 div를 직접 타겟 — `page.getByText("환산취득가", { exact: true })` 또는
  버튼 스코프 후 제목 매칭. 단 클릭 대상은 `<button>`이므로 제목 텍스트의 상위 button을 클릭(`...locator("xpath=ancestor::button")` 또는 `filter`).
- 2순위(권장 가능): `CompanionAcqPurchaseBlock`의 3개 산정방식 버튼(실거래가·환산취득가·감정가액)에
  `data-testid="acq-method-{actual|estimated|appraisal}"` 부여 → spec은 testid로 클릭. 다른 transfer spec과 공유 자산이라 횡전 이득.

### B. 취득일 DateInput (라인 86~88)
- DateInput "연도/월/일"을 **취득일 그룹으로 스코핑**한 뒤 그 안에서 선택.
  예: 취득일 카드/필드를 감싸는 컨테이너(`FieldCard "취득일"` 등)를 locator로 잡고 그 하위의 연/월/일 입력.
- 스코핑이 어려우면 DateInput 그룹에 `data-testid="acq-date"` 부여 후 `getByTestId("acq-date").getByLabel("일")`.
- 양도일·신고일도 같은 방식으로 스코핑해 substring 취약성 제거(권장, 동일 spec 내).

### C. 공시지가 단가 순서 (라인 93·98) — Do에서 확정
- 환산취득가 모드에서 "공시지가 단가" 입력이 2개(취득시·양도시) 렌더됨을 확인.
- `.first()`=취득시 / `.nth(1)`=양도시 매핑이 현재 DOM 순서와 일치하는지 **Do 단계에서 probe로 재검증**(추정 금지). 어긋나면 ThreePointStandardPriceInput/StandardPriceInput 영역 스코핑으로 교정.

### D. 결과 단계 (라인 120~186) — Do에서 확정
- A·B·C 수정으로 계산 도달 후, `getRowValue`/`getInputByLabel` 등 결과 셀렉터와
  `details`(parcel) 펼침이 현재 결과 화면 구조와 맞는지 재검증.

### E. 기대값 재검증 (라인 17~26)
- spec 주석의 기대값(총 납부세액 145,256,079 등)이 **현행 엔진 결과와 일치하는지 미확인**(환산 단계 미도달로 결과 캡처 불가했음).
- 복구 후 실제 엔진 출력과 대조. 불일치 시: ① spec이 단순 캡처/비공백 검증(현재 라인 184~186은 비공백만 단언)이므로 기대값은 주석 참고치로 갱신, ② 또는 엔진 회귀라면 별도 이슈로 분리. **엔진 정확성 판단은 법령·anchor 기준**으로(납세자 유불리 표현 금지).

## 4. 작업 단계 (verify 포함)

```
1. 셀렉터 진단 재확認 → verify: probe로 A·B·C 각 셀렉터 count·해석 확정
2. 결함 A 수정(환산취득가) → verify: 환산취득가 클릭 성공
3. 결함 B 수정(취득일 스코핑) → verify: 취득일 1997-02-03 입력 성공
4. C·D 셀렉터 재검증·교정 → verify: 계산 실행→"총 납부세액" 렌더
5. 기대값 대조(E) → verify: 결과값 캡처, 기대값 일치 또는 주석 갱신/이슈 분리
6. 전체 spec 통과 → verify: npx playwright test transfer-nbl-academy-land (2 retries 내 pass)
```

## 5. 범위·리스크

- **횡전 리스크**: `getByLabel("일")` / 버튼 accessible name substring 패턴은 다른 transfer E2E spec에도 있을 수 있다. 세션 시작 시 `e2e/transfer-regulated-auto.spec.ts`가 메인에서 수정 중(M)이었던 점도 동일 rot 정황. **복구 후 `grep -rn 'getByLabel("일")\|getByLabel("월")\|getByLabel("연도")' e2e/`로 동일 취약 spec 목록화** 권장(별도 후속).
- **UI 변경 동반 시**: B/2순위로 `data-testid` 추가하면 `CompanionAcqPurchaseBlock`·DateInput 등 공용 컴포넌트 수정 → 다른 spec에 영향 없음(추가만). 단 800줄 정책·기존 testid 충돌 확인.
- **본 계획서 위치**: 현재 `feat/nbl-judgment` 워크트리에 작성됨. spec rot 복구는 NBL 자동조회와 **별개 작업**이므로, 실제 수정은 별도 브랜치 권장(이 계획서만 별도 커밋하거나 복구 브랜치로 이동).

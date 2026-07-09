# PHD 3-시점 환산 패널 — 외부 조회 안내(구버전) 삭제 계획

## 1. 배경 · 문제

`PreHousingDisclosureSection.tsx`(주택공시가격 미공시 취득 시 3-시점 환산 패널)
하단에 외부 수동조회를 안내하는 도움말 2행이 남아 있다. 이는 프로젝트가
**자체 조회·계산 기능을 이미 제공**하므로 현행 UI와 모순된다.

대상 문구 (실측 — `PreHousingDisclosureSection.tsx:198~214`):

```
[1행] 주택공시가격은 부동산공시가격알리미(realtyprice.kr)에서 조회하실 수 있습니다.
[2행] 건물기준시가(원)는 국세청 홈택스 > 기준시가 조회에서 연도별 값을 직접 확인 후 입력하세요.
      └ (조건부) 공동주택(아파트)의 경우 … 1993.2.1 또는 1990.4.30이 최초고시일에 해당합니다.
```

### 모순 근거 (실측)

| 안내 문구 | 이미 제공되는 자체 기능 | 코드 위치 |
|---|---|---|
| 1행 주택공시가격 realtyprice 조회 | `StandardPriceInput`(`house_individual`/`house_apart`) **자동조회** | `PreHousingDisclosureSection.tsx:120·131` |
| 2행 건물기준시가 홈택스 직접입력 | `ThreePointStandardPriceInput` + `enableBatchCalc` → **공시지가 조회 버튼 + 3시점 건물기준시가 일괄 계산기** | `PreHousingDisclosureSection.tsx:149·154` |

### 파리티 근거

병렬 컴포넌트인 겸용주택용 `MixedUsePreHousingDisclosureSection.tsx`는
**PR #550(b519a9d6)에서 동일한 realtyprice/홈택스 안내를 이미 제거**했다
(현재 grep 결과 잔존 0건). 본 작업은 단독주택용 패널에 같은 정정을 적용하는
**파리티 맞춤**이다.

## 2. 변경 범위 (Surgical)

**파일 1개, 블록 1개만 수정** — `components/calc/transfer/PreHousingDisclosureSection.tsx:197~214`

- 1행(realtyprice 조회 안내) `<p>` **삭제**
- 2행(홈택스 직접입력 안내) 문장 **삭제**

### 결정 필요 — 아파트 최초고시일 조건부 안내 (line 208~212)

> "공동주택(아파트)의 경우 최초고시 이전 취득 시 1993.2.1 또는 1990.4.30이
> 최초고시일에 해당합니다."

이 문구는 **조회 모순이 아니라 법정 최초고시일 사실 정보**로, `최초 고시일` 입력
필드를 채우는 데 유효한 안내다. 겸용 버전에는 애초에 없다.

- **권장(A)**: **보존**. 조회 모순이 아니므로 삭제하면 정보 손실. 삭제되는
  2행 `<p>`에서 떼어내 독립 조건부 요소(`housingType === "apartment"`)로 재배치.
  가급적 `최초 고시일` 입력 필드(line 110~115) 아래로 이동해 맥락 강화.
- 대안(B): 겸용 버전과 완전 파리티를 위해 함께 삭제. → 정보 손실 발생.

→ **확정: 권장안 A (보존·재배치)** — 사용자 확인 완료(2026-07-10).

## 3. 구현 (권장안 A 기준)

`{/* 안내 문구 */}` 블록(line 197~214)을 다음으로 교체:

- realtyprice 1행 삭제
- 홈택스 2행 삭제
- 아파트 조건부 안내만 독립 `<div>`로 유지 (또는 `최초 고시일` FieldCard 하단 이동)

블록 전체가 아파트 안내만 남으면, `housingType === "individual"`일 때는
아무것도 렌더되지 않으므로 wrapper `<div>`도 조건부로 정리.

## 4. 검증 (verify)

1. `npx tsc --noEmit` → 0건. (문구 삭제 + 조건부 JSX 정리)
2. 미사용 심볼 점검: 안내 문구 전용 import·변수 없음 확인. `housingType`은
   RadioCardGroup·StandardPriceInput 분기에서 계속 사용되므로 유지.
3. 브라우저 수동 확인 (Playwright 임시 스펙 또는 dev 서버):
   - 자산 = 주택, PHD 3-시점 환산 활성 조건 진입 → 패널 하단에
     realtyprice/홈택스 2행이 **더 이상 노출 안 됨**.
   - 주택유형 = 공동주택(아파트) 선택 시 최초고시일 안내(권장안 A)는 유지.
4. 회귀: 입력 필드·폼 state·API 페이로드 변경 없음(도움말은 순수 표시 요소,
   `housingType`은 UI 로컬 상태로 폼·payload 미포함 — line 59~60). 엔진·14지점
   동기화 영향 **없음**.

## 5. 범위 밖 (이번 작업 아님)

grep 상 다른 컴포넌트의 `국세청 홈택스 > 기준시가 조회` 힌트(예:
`GeneralBuildingBlock`·`CommercialBuildingBlock`·`ThreePointAssetMajorRender`)는
해당 필드에 자체 자동조회가 없어 **여전히 유효한 안내**이므로 건드리지 않는다.
본 작업은 자체 조회 기능이 바로 위에 존재해 모순이 되는 PHD 패널 footer로 한정.

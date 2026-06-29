# E2E 셀렉터 견고성 점검·예방 계획

> 상태: Plan
> 발견 경위: `transfer-nbl-academy-land.spec.ts` spec rot 복구(PR #417) 중 식별된 셀렉터 안티패턴의 횡전 여부 점검.
> 핵심 결론: **전수 정적 진단 결과 실질 위험은 매우 적다.** 대규모 일괄 리팩터는 불필요하며, 예방(공용 헬퍼·가이드) + 실위험 1건 검증으로 한정한다.

## 1. 배경

PR #417에서 복구한 academy spec의 rot 원인은 세 가지 셀렉터 안티패턴이었다:
- **A** `getByLabel("일")` substring 매칭 → "일" 포함 라벨 다수와 매칭, `nth(2)`가 엉뚱한 radio로 해석
- **B** 버튼 `getByRole("button",{name:"환산취득가",exact:true})` → 버튼 내 설명 div로 accessible name이 합쳐져 exact 불일치
- **C** `p:has-text("총 납부세액")` → 결과 화면에 같은 라벨 2곳(요약 hidden + 납부카드 visible)으로 strict mode 위반

본 계획은 이 세 패턴이 다른 spec에 얼마나 퍼져 있고 실제로 깨지는지를 정적 진단한 결과에 기반한다.

## 2. 정적 진단 결과 (실측, base `b97ae230`)

전체 E2E spec 244개 대상.

### 패턴 A — `getByLabel("연도/월/일")` substring
- exact 없이 사용: **119 spec**
- 날짜 `getByLabel`의 `.nth()` 인덱스 분포(전체): `nth(0)` 1건 · `nth(1)` 34건 · `nth(2)` 3건
- `nth(2)` 3건은 **academy 복구본(`exact:true` 사용)뿐**이다. exact 적용으로 라벨은 정확매칭(DateInput 3개만)되어 substring 오매칭은 차단되나, **순서 인덱스 의존은 잔존**(상단에 DateInput 추가 시 시프트). exact 없는 `nth(2+)`는 **0개**.
- 의미 — 두 위험을 구분해야 한다:
  - **substring 오매칭**(academy의 직접 원인): exact 없는 `nth(2+)`에서만 실현 → **현재 0개**(academy 복구로 해소).
  - **인덱스 시프트**: `nth(1)`·`nth(2)` 사용처(37곳 = nth(1) 34 + nth(2) 3, occurrence 기준)에 잠재. exact 여부와 무관하게 페이지 상단 날짜 필드 추가/순서 변경 시 깨질 수 있다(현재는 깨지지 않음).
- 공용 헬퍼 `e2e/_helpers/tax-flow.ts`의 날짜 입력은 `root.getByLabel("연도").first()` 형태로 **root 스코프 + .first()** 사용 → 헬퍼 경유 spec은 인덱스 의존이 없어 안전.

### 패턴 B — 버튼 `name + exact:true` + 설명 div
- 산정방식 버튼(실거래가·환산취득가·감정가액) `exact:true` 사용: **academy 외 0건**
- 의미: 추가 위험 없음.

### 패턴 C — 결과 라벨 strict (`총 납부세액` 등)
- `총 납부세액` 매칭 spec 11개 중, `.first()`/`.last()` 없이 단언:
  - `property-house-split.spec.ts:109`, `property-taxpayer-coownership.spec.ts:183` → `toHaveCount(0)`(부재 단언) → strict 무관, **안전**
  - `gift-simultaneous.spec.ts:139` → "수증자 총 납부세액 합계 (…)" 고유 문구 → 단일 매칭, **안전**
  - `gift-burdened-transfer.spec.ts:258` → `expect(page.getByText("총 납부세액")).toBeVisible()` → **실행 검증 완료(본 작업): 10/10 통과, strict 위반 없음 — 증여세 결과뷰엔 "총 납부세액" 라벨 1개. 셀렉터 수정 불필요.**

## 3. 결론 — 범위 한정

academy 복구로 대부분 해소됐다. 남은 작업은 다음으로 **한정**한다(과대 작업 방지, simplicity):

1. **실위험 1건 검증·수정** (필수, 소): `gift-burdened-transfer.spec.ts:258`을 실행해 strict 위반 여부 확인 → 위반 시 `.first()`/고유 스코프로 1줄 수정. 미위반이면 변경 없음.
2. **예방 — 공용 셀렉터 헬퍼 강화** (권장, 중): `e2e/_helpers/`에 안티패턴을 막는 헬퍼 제공·정착.
   - 날짜: 기존 `fillDate(root, …)`를 신규 spec의 표준으로 — root 스코프 강제로 nth 시프트 차단.
   - 결과 금액: `getPayableTotal(page)` 등 결과 화면 금액 추출 공용 헬퍼(요약 hidden/납부카드 visible 차이를 헬퍼 내부에서 흡수).
3. **가이드 문서화** (권장, 소): `e2e/` 셀렉터 규칙을 짧게 명문화(헬퍼 주석 또는 `e2e/CLAUDE.md`):
   - `getByLabel`은 짧은 라벨("일"·"월")에 substring 위험 → 정확값은 `{exact:true}` 또는 root 스코프
   - 깊은 인덱스 `nth(2+)` 금지 → 컨테이너 스코핑
   - 결과 라벨이 요약·명세에 중복될 수 있음 → 결과 헬퍼 경유

### 비범위 (명시적 제외)
- **119 spec의 `getByLabel` 일괄 `exact:true` 리팩터**: substring 오매칭 위험은 현재 0건(nth(2+) 미사용)이라 효과가 낮고 회귀 리스크가 크다.
- **인덱스 의존(`nth(1)`·`nth(2)`, 37곳) 일괄 헬퍼 전환**: 현재 깨지지 않으며(시프트 미발생), 일괄 전환은 대량 변경. 신규/수정 spec에 헬퍼·가이드를 적용하는 **점진 전환**으로 충분.
- **일반 `getByText("...").toBeVisible()` strict 위험 전수 점검**: 다수 spec이 사용하나 대부분 **고유 라벨**이라 실위험이 낮다. 라벨 중복이 실제 확인된 건만 대응한다(현재 `gift-burdened-transfer` 1건). 결과뷰 라벨 중복은 결과 헬퍼(작업 2)로 점진 흡수.

## 4. 작업 단계 (verify 포함)

```
1. gift-burdened-transfer 실행 진단 → verify: :258 strict 위반 재현 여부 확정
2. (위반 시) 셀렉터 1줄 수정 → verify: 해당 spec pass
3. 공용 헬퍼 추가(getPayableTotal 등) → verify: academy/대표 spec 1개를 헬퍼로 치환해 pass
4. 가이드 문서화 → verify: e2e/CLAUDE.md(또는 헬퍼 주석) 반영
5. 회귀 → verify: 변경한 spec만 재실행 pass (전수 실행 불필요 — 변경 국소)
```

## 5. 리스크·메모

- **정적 진단의 한계**: 패턴 C는 결과뷰 구조에 의존 → grep만으로 깨짐 확정 불가. 단계 1에서 실행으로 확정(추정 금지).
- **헬퍼 정착의 점진성**: 기존 119 spec을 강제 전환하지 않으므로 효과는 신규 작성분부터. 안티패턴 재발 방지가 목적이지 기존 일괄 교정이 아님.
- **base**: 본 계획은 `b97ae230`(PR #416 NBL + #417 spec rot 복구 포함) 기준 진단.

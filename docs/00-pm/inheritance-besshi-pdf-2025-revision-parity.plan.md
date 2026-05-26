# 비상장주식 평가서 PDF — 2025.07.10 공식 양식 동기화 수정 계획서

> 작성일: 2026-05-26
> 목표: **PDF 출력(`lib/pdf/UnlistedStockBesshiPdfDocument.tsx`)** 제1쪽을 공식 「비상장주식 등 평가서」 별지 제4호 서식 부표3 **2025.07.10 개정본**(첨부 이미지16)과 동일하게 만든다. 화면 컴포넌트(`Page1CoverSection.tsx`)가 이미 갖춘 2025.07.10 레이아웃과 PDF를 **동일 기준으로 정합**한다.
> 관련 메모리: `project_unlisted_stock_besshi_2025_revision`(화면 갱신 `bcfe80d`) · `project_besshi_result_view_integration`(`f31ca47`)
> 스킬: `besshi-form-replica` · `korean-law-citation-verify` · `pre-do-anchor-verification`

---

## 1. 문제 진단

### 1.1 두 평행 구현체

| 구현체 | 파일 | 양식 버전 | 상태 |
|---|---|---|---|
| **화면(HTML)** | `components/calc/inheritance/unlisted-stock-v2/besshi/Page1CoverSection.tsx` (+ Page2~6) | **2025.07.10** | ✅ 갱신 완료(`bcfe80d`) — 이미지16과 일치 |
| **PDF** | `lib/pdf/UnlistedStockBesshiPdfDocument.tsx`의 `Page1Cover` | **2021.3.4** | ❌ 구판 stale — 이미지17 |

**근본 원인**: 2025.07.10 개정 작업이 화면 컴포넌트에만 적용되고 react-pdf 문서는 동기화되지 않았다. PDF는 별도 파일에 표 구조·셀 번호·라벨을 **중복 하드코딩**한 평행 구현체라 화면 변경이 자동 전파되지 않는다.

### 1.2 이미지17(현 PDF) vs 이미지16(공식 2025.07.10) 차이 인벤토리

| # | 항목 | 현 PDF (이미지17) | 공식 2025.07.10 (이미지16 / 화면) | 조치 |
|---|---|---|---|---|
| D-1 | 부제 | `(2021.3.4. 개정)` | `(2025.07.10. 개정)` | 문자열 교체 |
| D-2 | 1번 섹션 — 사업자등록번호 | 없음 | `사업자등록번호` 칸 존재 | 행 추가 (`input.businessRegistrationNumber`) |
| D-3 | 1번 섹션 — 자본금 | 없음 | `자본금` 칸 존재 | 행 추가 (`input.capital`) |
| D-4 | 1번 섹션 — 대표자 라벨 | `대표자` | `대표자 성명` | 라벨 정합 |
| D-5 | 2번 섹션 | `netAssetOnlyReason` 있을 때만 단일 badge | **가~바 6행 표 상시 표시**(다=2018.2.13. 삭제 회색, 선택 사유에 `[v]`) | 6행 표로 재구성 |
| D-6 | 3번 ④ 라벨 | `(③ ÷ 발행주식총수)` | `(③ ÷ ①)` | 라벨 정합 |
| D-7 | 3번 ⑤ 라벨 | `1주당 순손익가치 (최근 3년 가중평균 ÷ 환원율)` | `(제6쪽 7.차)` (공식 전문 라벨) | 라벨 정합 |
| D-8 | 3번 ⑥ 가중평균 마커 | `⑥-㉠` | `⑥㉮` | 마커 `㉠→㉮`, `㉡→㉯` 정합 |
| D-9 | 3번 ⑥ 80% 마커 | `⑥-㉡` | `⑥㉯` | 동상 |
| D-10 | 3번 ⑦ 최대주주 | `⑦ 비최대주주 1주당 평가액` 단일행 / 할증 시 `⑧` 단일행 | 할증 시 **⑦㉮(할증분) + ⑦㉯(⑥+㉮)** 2행, 비해당 시 `⑦ 해당 없음` | 화면과 동일 분기 |
| D-11 | 글리프 깨짐 | `③④⑤⑥㉮㉯` → `b c d e …`(저바이트 절단) | 정상 렌더 | **폰트 교체/임베드** (§3) |

### 1.3 글리프 깨짐(D-11) 메커니즘 — 검증 완료, PDF 전 페이지 영향

**원인 확정(추측 아님)**: NanumGothic CDN TTF에 enclosed-alphanumerics 글리프가 없을 때, react-pdf(fontkit) 폴백이 **코드포인트를 저바이트(`codePoint & 0xFF`)로 절단**하여 라틴 문자로 렌더한다. 이미지17의 모든 글리프가 이 공식과 정확히 일치한다:

| 마커 | 코드포인트 | `& 0xFF` | 렌더 결과 | 이미지17 |
|---|---|---|---|---|
| ③ | U+2462 | 0x62 | `b` | ✅ b |
| ④ | U+2463 | 0x63 | `c` | ✅ c |
| ⑤ | U+2464 | 0x64 | `d` | ✅ d |
| ⑥ | U+2465 | 0x65 | `e` | ✅ e |
| ⑦ | U+2466 | 0x66 | `f` | ✅ f |
| ⑨ | U+2468 | 0x68 | `h` | ✅ h |
| ⑥-㉠ | U+2465·U+3260 | 0x65·0x60 | `e` + `` ` `` | ✅ e˙ |
| ⑥-㉡ | U+2465·U+3261 | 0x65·0x61 | `e`+`a` | ✅ ea |

→ **폰트에 글리프가 존재하기만 하면 정상 렌더**된다. cmap 미스인덱스가 아니라 **글리프 부재 시 저바이트 폴백**이 핵심 — 따라서 enclosed 블록을 포함한 폰트로 교체하면 확실히 해결된다(§3).

**영향 범위는 PDF 전체**: 제1쪽뿐 아니라 제2쪽 `①~⑲`, 제5·6쪽 `①②③·㉠㉡` 등 모든 페이지가 동일 증상. 화면은 시스템 폰트라 정상이라 그동안 드러나지 않았다. (즉 본 작업은 1쪽 레이아웃 정합 + **문서 전역 폰트 수정** 두 축이다.)

### 1.4 ⚠️ 타겟 결정 — "화면 미러" vs "공식 템플릿 엄밀 재현"

**중요**: 화면 `Page1CoverSection`은 2025.07.10 팀 채택 재현본이지만, 공식 템플릿(이미지16)과 **완전히 동일하지는 않다**. 아래 차이를 인지하고 PDF 타겟을 명시적으로 결정해야 한다.

| 항목 | 공식 이미지16 | 화면 현재 | 결정 필요 |
|---|---|---|---|
| 3번 ⑥ 순서 | `⑥`(헤더) → `㉮`(가중평균) → `㉯`(80%) | `⑥㉮` → `⑥㉯` → `⑥`(max) | 헤더 위치 반전 — 화면 따를지/공식 따를지 |
| ⑤ 라벨 | 장문("최근 3년간 순손익액의 가중평균액…2 이상의 신용평가전문기관(회계법인 포함)…1주당 추정이익의 평균액") | 단축 "(제6쪽 7.차)" | 공식 장문이 더 충실 |
| ⑨ 보충적 평가가액·총 상속재산가액 행 | **없음**(공식 1쪽 3번은 ⑦㉯에서 종료) | 추가 행 존재 | 앱 편의 행 — 유지 권장(실무 가치) |
| ㉮ 산식 부동산과다 변형 | `[{(④×2)+(⑤×3)}÷5]` + `*부동산과다 [{(④×3)+(⑤×2)}÷5]` 병기 | 첫 식만 표시 | `isRealEstateHeavy` 시 병기 권장 |
| 우측 cross-reference 열 | 별도 열(`제2쪽 4.마`·`제6쪽 7.차`) | 라벨에 흡수 | 라벨 흡수 유지(§2.3) |

**✅ 확정 결정 (2026-05-26, 사용자 = 옵션 2 "공식 엄밀 재현")**: **공식 이미지16에 엄밀히** 맞춘다. PDF와 **화면 `Page1CoverSection`을 동시에** 공식 구조로 정정한다.

- ⑥ 순서를 공식대로 `⑥`(헤더) → `㉮`(가중평균) → `㉯`(80%)로 정정 (현행 화면의 후보→헤더 순서 반전).
- ⑦ 도 공식대로 `⑦`(헤더 `최대주주등에 해당하는 경우 1주당 평가액`) → `㉮`(⑥ × 할증율) → `㉯`(⑥ + ㉮).
- ⑤ 는 공식 **장문 라벨** 채택.
- ㉮ 산식에 `isRealEstateHeavy` 시 부동산과다보유법인 변형 `* [{(④×3)+(⑤×2)}÷5]` **병기**.
- ⑨ 보충적 평가가액·총 상속재산가액 행은 **공식엔 없는 앱 편의 행이나 실무 가치로 유지**(공식 ⑦㉯ 아래에 구분선과 함께 부가). → 유일한 의도적 공식 초과 항목, 양쪽(화면·PDF) 동일 유지.
- 우측 cross-reference는 라벨 흡수 방식 유지(§2.3).

→ **차선(현행 화면 순서 그대로 따르기)은 폐기.** 화면·PDF 모두 공식 순서로 통일하며, 기존 testid(`p1-⑥`·`p1-⑥-㉮`·`p1-⑦-㉮` 등)는 **DOM 순서만 바뀌고 testid 문자열은 보존**한다(렌더 순서 변경 → 해당 anchor 기대 순서 갱신 필요).

---

## 2. 레이아웃 정합 (D-1 ~ D-10)

### 2.1 권장 접근 — PDF `Page1Cover`를 화면 `Page1CoverSection`과 1:1 미러

`Page1Cover`(react-pdf `View/Text`)를 화면 `Page1CoverSection`(HTML `table`)과 **동일한 셀 번호·라벨·분기**로 재작성한다. 두 구현체의 라벨·마커는 단일 상수로 공유해 재드리프트를 방지한다. **단 §1.4 타겟 결정에 따라 ⑥ 순서·⑤ 라벨·㉮ 부동산과다 병기는 화면·PDF를 동시에 공식 쪽으로 보강할 수 있다** — 이 경우 화면 `Page1CoverSection`도 같은 커밋에서 갱신해 정합을 유지한다.

- **공유 상수 추출**: 2번 섹션 6행 정의(`NET_ASSET_REASON_ROWS`)는 현재 `Page1CoverSection.tsx` 내부에 있다. `besshi/besshi-form-constants.ts`(신규) 또는 `BesshiSharedAtoms`로 끌어올려 **화면·PDF 양쪽이 import**하도록 한다. 향후 양식 개정 시 한 곳만 수정.
- 셀 번호·라벨 문자열도 가능하면 공유. 최소한 6행 표 정의는 단일 출처화한다(single-source-engine-helper 정책 준용).

### 2.2 구체 변경 — `Page1Cover` (`UnlistedStockBesshiPdfDocument.tsx` L198~264)

1. **부제**(L202): `(2021.3.4. 개정)` → `평가심의위원회 운영규정 별지 제4호 서식 부표3 (2025.07.10. 개정)`.
2. **1번 섹션 표**(L205~224): 화면과 동일하게 3행 6열 구조로 확장.
   - 1행: `법인명` / 값 / `사업자등록번호` / 값 / `대표자 성명` / 값
   - 2행: `① 발행주식총수` / 값 / `1주당 액면가` / 값 / `자본금` / 값(`input.capital ? fmt+원 : "-"`)
   - 3행: `평가기준일` / 값 / `② 부동산과다보유법인` / 값(colSpan)
   - 날짜 가드는 화면과 동일: `evaluationDate instanceof Date && !isNaN(getTime()) ? slice(0,10) : "-"`.
3. **2번 섹션**(L226~231): 단일 badge 제거 → **가~바 6행 표 상시 렌더**. `NET_ASSET_REASON_ROWS` 공유 상수 map. 다(삭제)는 회색 + `—`, 선택 사유는 `[v]`, 그 외 `[ ]`.
4. **3번 섹션**(L235~259): 마커 `㉠→㉮`·`㉡→㉯` 정합. 라벨·순서는 §1.4 결정 반영(아래는 **권장안 = 공식 순서**).
   - `③`: `순자산가액 (제2쪽 4.마)`
   - `④`: `1주당 순자산가액 (③ ÷ ①)`
   - `⑤`: 공식 장문 라벨 `최근 3년간 순손익액의 가중평균액에 의한 1주당가액 또는 2 이상의 신용평가전문기관(회계법인 포함)이 산출한 1주당 추정이익의 평균액 (제6쪽 7.차)` (장문 폭 고려)
   - `⑥`(헤더): `1주당 평가액 (㉮·㉯ 중 많은 금액)` (emphasized) — **㉮·㉯보다 위**(공식 순서)
   - `⑥㉮`: `[{(④×2)+(⑤×3)}÷5]` (+ `isRealEstateHeavy` 시 `* 부동산과다보유법인 [{(④×3)+(⑤×2)}÷5]` 병기)
   - `⑥㉯`: `1주당 순자산가액(④)의 80%`
   - 최대주주 분기: `premiumRate > 0` → `⑦`(헤더 `최대주주등에 해당하는 경우 1주당 평가액`) + `⑦㉮ 최대주주등의 1주당 평가액 (⑥ × 할증율)` + `⑦㉯ (⑥ + ㉮)`(emphasized); else `⑦ 최대주주 해당 없음 (⑥ 적용)`
   - `⑨ 보충적 평가가액`(emphasized) / `총 상속재산가액 (⑨ × 보유주식수 N주)`(emphasized) — 공식 초과 앱 편의 행, 구분선 후 부가, 양쪽 유지
   - ⚠️ **(확정 결정 2)** 헤더-후-후보 순서이므로 화면 `Page1CoverSection`(현재 후보-후-헤더)을 **동시 갱신**. testid 문자열은 보존, **렌더 순서가 바뀌므로 해당 anchor의 기대 순서를 갱신**한다.
5. `ResultRow`에 2행 분기가 필요하면 화면 `ResultTableRow`의 컬럼 구성과 정합. (현 `ResultRow`는 단일 라벨+금액 — 마커가 라벨 앞 `cellNum`에 들어가므로 구조 변경 최소)

### 2.3 (선택) 공식 템플릿 2단 참조열 미재현

이미지16 우측의 `제2쪽 4.순자산가액 "마"`·`제6쪽 7. 순손익액 "차"` 같은 cross-reference 보조열은 화면이 라벨 안에 흡수(`순자산가액 (제2쪽 4.마)`)하는 방식을 채택했다. PDF도 **화면과 동일하게 라벨 흡수 방식**으로 통일(별도 우측열 신설하지 않음). 완전 2단 셀 재현은 범위 외 후속.

---

## 3. 글리프 깨짐 해결 (D-11) — PDF 전체

> ⚠️ 레이아웃만 고치면 `③④⑤`가 여전히 `b/c/d`로 보인다. 폰트가 본질 원인.

### 3.1 원인 확정 (검증 완료 — §1.3 표 참조)

메커니즘은 **저바이트 절단 폴백으로 이미 규명**됨(이미지17 글리프 = `codePoint & 0xFF` 정확 일치, §1.3). 즉 **글리프 부재 시 폴백**이므로 해당 블록을 포함한 폰트로 교체하면 해결된다. 남은 확인은 교체 후보 폰트가 실제로 enclosed 블록을 렌더하는지뿐:
1. 교체 후보 폰트(Noto Sans KR 등) TTF에 U+2460(`①`)·U+3260(`㉠`)·U+326E(`㉮`) 글리프 존재 확인(fontkit `hasGlyphForCodePoint` 또는 글리프 덤프).
2. react-pdf 서브셋/임베드 후에도 정상 렌더되는지 실제 PDF 생성으로 확인(일부 폰트는 codepoint 보유해도 서브셋 단계에서 누락 가능 → PDF 바이너리 텍스트 추출 검증).

### 3.2 ✅ 확정 해결안 — 폰트 스택 fallback (C1 검증 후 변경)

> **C1 발견**: @react-pdf/renderer **4.5.1은 폰트 스택 per-glyph fallback을 네이티브 지원**한다. `node_modules/@react-pdf/textkit/lib/textkit.js`의 `fontSubstitution` → `pickFontFromFontStack(codePoint, run.attributes.font, lastFont)` 주석 *"If the default font does not have a glyph and the fallback font does, we use it"*. `run.attributes.font`는 **배열(스택)**.

**채택 = 폰트 스택 fallback (구 안 C 승격)**:
- `fonts.ts`에 enclosed 블록 전용 보조 폰트를 **별도 family**(예: `"BesshiEnclosed"`)로 등록.
- PDF 페이지 스타일 `fontFamily`를 **배열** `["NanumGothic", "BesshiEnclosed"]`로 설정.
- 효과: 한글·라틴·숫자는 **NanumGothic 그대로(시각 변화 0)**, `①~⑲·㉠㉡·㉮㉯`만 글자 단위로 보조 폰트 치환. **Korean 라벨 내 인라인 마커(`(③ ÷ ①)`)도 자동 치환** — 전면 교체(구 안 A) 불필요.
- 폐기: 구 안 A(전면 교체 — 시각 변화 발생) / 구 안 B(텍스트 치환 — 공식과 시각 차이).

### 3.3 보조 폰트 서브셋 (용량 최소화)

보조 폰트는 **enclosed 블록만 필요**(한글·라틴 불필요 — 그쪽은 NanumGothic 담당). 따라서:
- enclosed 글리프 보유 폰트(IBM Plex Sans KR·Noto Sans KR 등) → `fonttools pyftsubset --unicodes=U+2460-24FF,U+3200-32FF` 로 **enclosed 블록만 추출** → 수~수십 KB 경량 TTF.
- `public/fonts/`에 동봉(로컬 `/fonts/...` URL) → CDN 의존·PDF 생성 지연 제거.
- ⚠️ react-pdf `fontFamily` 배열 + 로컬 폰트 등록이 **PDFDownloadLink(클라이언트, ssr:false)** 경로에서 정상 동작하는지 C5 실제 다운로드로 검증.

---

## 4. 영향 범위 / 비범위

**수정 대상** (확정 결정 2 — 화면·PDF 동시 공식 정합)
- `lib/pdf/UnlistedStockBesshiPdfDocument.tsx` — `Page1Cover` 전면 재작성 + `fontFamily` 교체(§3 안 A)
- `lib/pdf/fonts.ts` — enclosed 블록 포함 폰트 등록(서브셋 동봉)
- `components/calc/inheritance/unlisted-stock-v2/besshi/Page1CoverSection.tsx` — **3번 섹션 ⑥/⑦ 헤더-후-후보 순서로 정정 + ⑤ 장문 라벨 + ㉮ 부동산과다 병기** (공식 정합)
- 신규 `besshi/besshi-form-constants.ts` — 6행 사유 정의·셀 라벨 단일 출처(화면·PDF 공유)
- `__tests__/` — Page1CoverSection RTL anchor의 **렌더 순서 기대 갱신** + PDF 신규 anchor
- 안 B(차선) 채택 시에만 PDF Page2~6 마커도 치환 — 단 안 A 우선이므로 통상 불필요

**비범위**
- 엔진(`evaluateUnlistedStockV2`)·타입·API·validate **변경 0** (출력 전용).
- PDF Page2~6 **레이아웃**(폰트 교체로 글리프만 정상화, 표 구조 무변경).
- 공식 템플릿 2단 참조열 완전 재현(§2.3 — 라벨 흡수 유지).

---

## 5. 검증 계획

### 5.1 Pre-Do anchor (정책 강제 — Do 진입 전 1건 선실행)
- **AN-1 (글리프)**: 메커니즘은 §1.3에서 확정(저바이트 절단). 검증 초점은 **교체 후보 폰트가 enclosed 블록을 렌더하는지** — `hasGlyphForCodePoint(0x2462/0x3260/0x326E)` 확인 + 교체 후 실제 PDF 텍스트 추출로 `③㉠㉮` 정상 확인.

### 5.2 회귀·정합 anchor
- **AN-2**: 이미지17 입력값(법인명 "주식회사", 발행 180,000주, 액면 5,000, 평가기준일 2022-06-30, 비부동산과다, 보유 80,000주)으로 `evaluateUnlistedStockV2` 호출 → ④=10,000 / ⑤=7,150 / ⑥㉮=8,290 / ⑥㉯=8,000 / ⑥=8,290 / ⑨=8,290 / 총=663,200,000 (이미지17 수치 그대로). PDF 텍스트 노드에 동일 라벨·값 존재 검증.
- **AN-3**: 2번 섹션 6행 모두 렌더 + 선택 사유 행만 `[v]` + 다 행 회색·`—`.
- **AN-4**: `premiumRate > 0` 케이스에서 ⑦㉮·⑦㉯ 2행, `= 0`에서 ⑦ 단일행 분기.
- **AN-5 (화면-PDF 정합)**: 동일 input으로 `Page1CoverSection`(RTL)와 PDF 텍스트가 동일 라벨/마커 문자열 노출(공유 상수 단일 출처 검증).

### 5.3 수동 확인 (`feedback_browser_verify_with_playwright`)
- 실제 PDF 다운로드 → 뷰어에서 `③④⑤㉮㉯` 정상 렌더 + 사업자번호·자본금·6행 표 표시 육안 확인. (글리프는 자동 anchor가 잡기 어려우므로 PDF 바이너리 텍스트 추출 또는 수동 캡처 병행.)
- 가능 시 `e2e/*.spec.ts`로 다운로드 버튼 클릭 → 파일 생성 검증.

### 5.4 게이트
- `npx tsc --noEmit` 0건 / `npx vitest run __tests__/tax-engine/inheritance/` 및 besshi 관련 전체 통과 / 커밋 전 `npm test` 전량.

---

## 6. 작업 순서 (제안 커밋 분할)

1. **C1 — Pre-Do anchor**: 교체 후보 폰트 글리프 실측(AN-1) + AN-2 현행 수치 anchor 작성·실행 → §3 폰트안 확정, 본 계획 환류.
2. **C2 — 공유 상수 추출**: `besshi-form-constants.ts` 신설 — `NET_ASSET_REASON_ROWS`·3번 섹션 셀 라벨 단일 출처화(화면 import 사이트 무변경 보장).
3. **C3 — 화면 `Page1CoverSection` 공식 정합**: 3번 섹션 ⑥/⑦ 헤더-후-후보 순서 정정 + ⑤ 장문 + ㉮ 부동산과다 병기. **RTL anchor 렌더 순서 기대 갱신**(testid 보존).
4. **C4 — PDF `Page1Cover` 정합**: C2·C3 결과를 그대로 미러(D-1~D-10) + AN-2~5 통과.
5. **C5 — 글리프 폰트 해결**: §3 안 A 적용(`fonts.ts` 폰트 교체·서브셋 동봉) + PDF 텍스트 추출로 `③㉠㉮` 정상 검증.
6. **C6 — 통합 검증·회귀**: 전체 `npm test` + 수동/E2E PDF 확인(육안 글리프·사업자번호·자본금·6행 표) + 메모리 환류(`project_unlisted_stock_besshi_2025_revision`에 "PDF 동기화 + 공식 순서 정합 완료" 추가).

---

## 6.2 C2~C6 완료 (2026-05-26)

- **C2 ✅** `components/calc/inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts` 신설 — `NET_ASSET_REASON_ROWS`(2번 6행) + `BESSHI_P1_SECTION3`(3번 셀 라벨·할증/총 빌더) 단일 출처. 화면·PDF 공유.
- **C3 ✅** 화면 `Page1CoverSection` 공식 정합 — 상수 import, 3번 섹션 공식 순서(`⑥`헤더→`⑥㉮`→`⑥㉯`, `⑦`헤더→`⑦㉮`→`⑦㉯`), `⑤` 장문 라벨, `isRealEstateHeavy` 시 `㉮`에 부동산과다 병기. testid 전부 보존. 화면 anchor 37/37 통과.
- **C4 ✅** PDF `Page1Cover` 재작성 — 부제 2025.07.10, 1번 3행6셀(사업자번호·자본금 추가), 2번 6행 상시 표시, 3번 공식 순서. `AN-3` 5/5 RED→GREEN.
- **C5 ✅** 폰트 스택 fallback — `fonts.ts`에 `BesshiEnclosed`(IBM Plex Sans KR) 등록 + `BESSHI_FONT_STACK = ["NanumGothic","BesshiEnclosed"]`, PDF 페이지 `fontFamily` 배열 적용. **실측**: `renderToBuffer` → 출력 85KB에 `IBMPlexSansKR-Regular` 서브셋 임베드 확인(enclosed 글리프가 fallback으로 라우팅 = 저바이트 폴백 제거 입증). 본문 NanumGothic 유지(시각 변화 0).
- **C6 ✅** 전체 회귀 `npm test` **5083 passed · 0 failed**(14 skip·1 todo). lint 0건. tsc 0건. 변경 파일: `besshi-form-constants.ts`(신규)·`Page1CoverSection.tsx`·`UnlistedStockBesshiPdfDocument.tsx`·`fonts.ts`·`besshi-pdf-2025-parity.test.tsx`(신규). 엔진·타입·API·validate 변경 0.
- **잔여(후속)**: 보조 폰트 CDN→로컬 서브셋 동봉(용량 최적화, 현 패턴은 NanumGothic도 CDN이라 회귀 아님) · 실브라우저 PDFDownloadLink E2E(현재 renderToBuffer로 서버 경로 입증).

---

## 6.1 C1 결과 (환류 — 2026-05-26)

**AN-1 (폰트 진단, 확정)**: fontkit로 실측.
- 현 PDF 폰트 **NanumGothic-Regular**: `① ③ ④ ⑤ ⑥ ⑦ ⑨ ㉠ ㉡ ㉮ ㉯` **전부 `hasGlyph=false`(glyphId=0=.notdef)**, 한글 `가`만 보유(glyphId=495). → §1.3 저바이트 절단 폴백 원인 폰트 레벨 입증.
- enclosed 글리프 보유 후보(✅): IBM Plex Sans KR (2.67MB) · NotoSansKR (9.93MB) · NanumGothicCoding (2.21MB) · GowunDodum (6.89MB) — 어느 것에서든 enclosed 블록만 서브셋 추출 가능.
- **추가 발견 → 해결안 변경**: react-pdf 4.5.1 **폰트 스택 fallback 네이티브 지원 확인**(§3.2). 전면 교체 불필요 → **NanumGothic 유지 + enclosed 전용 보조 폰트 fallback**으로 확정. 시각 변화 0. 보조 폰트는 enclosed 블록만 서브셋(수십 KB). 소스 폰트(IBM Plex/Noto 중)는 C5 구현 시 택1(서브셋 후 동일하므로 시각 영향 미미).

**AN-2 (엔진 수치, GREEN 9/9)**: `__tests__/lib/pdf/besshi-pdf-2025-parity.test.tsx`. 이미지17 재현 입력(180,000주·보유 80,000주·비최대주주·capRate 0.10·각 연도 과세소득 128,700,000·순자산 1,800,000,000) → ③1,800,000,000 ④10,000 ⑤7,150 ⑥㉮8,290 ⑥㉯8,000 ⑥8,290 ⑨8,290 총663,200,000 (영업권 0: 마 180,000,000 > 나 64,350,000). **이미지17 수치 전부 정확 일치** → C3~C5는 값 무변경 보장.

**AN-3 (PDF 구조 gap, 의도된 RED 5/5)**: PDF 트리 텍스트 추출(함수형 컴포넌트 실행 walker)로 현 PDF가 `(2021.3.4. 개정)`·사업자등록번호·자본금 부재·`(③ ÷ 발행주식총수)`·`⑥-㉠/㉡`·2번 섹션 부재임을 노출. **C4 정합 후 GREEN 전환** 트래커. (※ 구현 완료 전까지 suite에 RED 5건 존재 — 의도된 Pre-Do 상태.)

---

## 7. 리스크 / 주의

- **800줄 정책**: `UnlistedStockBesshiPdfDocument.tsx`는 현재 645줄. Page1Cover 확장 + 6행 표로 증가 가능 → 800줄 근접 시 `Page1Cover`/`Page2NetAsset` 등을 `lib/pdf/besshi/` sub-module로 분리(export 보존).
- **폰트 용량 vs 로딩 실패**: §3.3 서브셋 동봉으로 완화. CDN 단독 의존 유지 시 PDF 생성 타임아웃 회귀 가능.
- **재드리프트 방지**: 공유 상수화(C2)를 생략하면 다음 양식 개정에서 동일 문제 재발. 가능한 범위에서 단일 출처화 필수.
- **법령 인용**: 2번 섹션 사유(1·2·3·5·6호) 라벨은 상증령 §54④ 본칙을 `korean-law-citation-verify`로 재확인 후 화면과 동일 문구 사용. 추정 인용 금지.

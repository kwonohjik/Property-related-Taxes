/**
 * 양도소득세 계산기 단계별 유효성 검사 (Step1·Step3 통합 후 4단계)
 *
 * step 0: 자산 목록 (취득상세·환산취득가·1990·신축증축 모두 포함)
 * step 1: 보유 상황
 * step 2: 감면·공제
 * step 3: 가산세 (선택)
 *
 * 구조 (2026-06-12 오류 일괄 수집 도입):
 * - collectStepIssues: 한 단계의 모든 차단 오류를 일괄 수집 (두더지잡기식 1건 노출 제거).
 *   자산 내부는 첫 오류 1건, 자산 간·폼 수준은 전부 수집.
 * - validateStep / validateStepDetailed: collectStepIssues의 첫 항목 위임 —
 *   검증 규칙 단일 진실 유지 (기존 호출처·테스트 호환).
 * - 자산-수준 검증은 transfer-tax-validate-asset.ts로 분리 (800줄 정책).
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { validateAssetEntry, todayLocalISO } from "./transfer-tax-validate-asset";
import { validateStep2Reductions } from "./transfer-tax-validate-reductions";
import { isMultiHouseSurchargeSuppressed, provisoGate, effectiveProvisoReason, isFullFractionalBundle, mergePrimaryBasic } from "./transfer-tax-api-helpers";
import { mergeGbPropertyLevel } from "./transfer-tax-api-gb-shares";
import { getOwnershipRatio } from "./transfer-tax-api-helpers";
import { buildBurdenedGiftInfo } from "./transfer-tax-api-burdened-gift";
import { companionBurdenedGiftValuations } from "./transfer-tax-api-burdened-gift";

/**
 * 검증 실패 정보 — 메시지 + 단계 + (자산 단위 오류 시) 자산 인덱스.
 * assetIndex가 있으면 UI에서 해당 자산 카드로 자동 스크롤 + 인라인 에러 배너 표시.
 */
export interface ValidationIssue {
  message: string;
  step: number;
  /** 자산-수준 오류일 때 0-based 자산 인덱스 (스크롤·인라인 표시 대상) */
  assetIndex?: number;
}

/**
 * 한 단계에서 발견되는 모든 차단 오류를 수집한다(첫 오류에서 멈추지 않음).
 *
 * - handleNext: 진행 차단 + 오류 전부를 한 번에 표시.
 * - stepStatuses: 각 단계 완료/주의 배지 산정 — 오류 0건이면 "complete".
 *
 * push 순서는 기존 validateStepDetailed의 검사 순서와 동일하게 유지 —
 * [0]이 기존 첫 오류와 동치 (anchor: transfer-validate-detailed.test.ts).
 */
export function collectStepIssues(step: number, form: TransferFormData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // step 0: 자산 목록 (취득 정보 통합)
  if (step === 0) {
    if (!form.assets || form.assets.length === 0) {
      // 자산이 없으면 자산-수준 후속 검증이 무의미 — 단독 반환
      issues.push({ step, message: "자산을 최소 1건 입력하세요." });
      return issues;
    }
    // 양도일·신고일 위젯이 주 자산 카드 ① 안으로 이동 — assetIndex 0으로 해당 카드 스크롤·인라인 유도
    // (step은 유지 — 스크롤 게이트가 assetIndex != null AND step === 0 동시 충족 필요)
    if (!form.transferDate) issues.push({ step, assetIndex: 0, message: "양도일을 선택하세요." });
    // 신고일 < 양도일 모순 — 예정신고는 양도 후에만 가능 (법 §105①: 양도일이 속하는 달의 말일부터 2개월).
    // 양도 당일 신고는 허용, 미만만 차단. 기한 초과는 가산세 자동 적용 경고로 별도 처리(차단 아님).
    if (form.filingDate && form.transferDate && form.filingDate < form.transferDate)
      issues.push({ step, assetIndex: 0, message: `신고(예정)일(${form.filingDate})이 양도일(${form.transferDate})보다 빠릅니다. 예정신고는 양도 후에만 가능합니다.` });
    // 부담부증여(소령 §159) 모드는 양도가액 = 인수채무액으로 엔진 자동 산정이므로 contractTotalPrice 검증 면제.
    const allBurdenedGift = form.assets.every((a) => a.transferType === "burdened_gift");
    if (!allBurdenedGift) {
      if (!form.contractTotalPrice || parseAmount(form.contractTotalPrice) <= 0)
        issues.push({ step, message: "총 양도가액을 입력하세요." });
    }

    // 지분 모드(같은 물건 분할취득) 여부 — companion ① 기본정보 UI 숨김 대응.
    const fullFractional = isFullFractionalBundle(form.assets);
    const primaryAsset = form.assets[0];
    // 일반건물 × 지분 분할 — ④가 `generalBuildingShares` 전용 배열을 보내고 `companionAssets`를
    // 아예 만들지 않는 경로(`transfer-tax-api.ts:672`). companion 축 가드·병합 양쪽이 이 술어를 쓴다.
    const isGbFractional = fullFractional && primaryAsset?.assetKind === "general_building";

    // 지분 모드 미지원 조합 차단 — 지분별 안분 UI 부재 또는 양도가액 모델 비양립.
    if (fullFractional && primaryAsset) {
      /**
       * 🔄 **겸용주택은 이 목록에서 나갔다 (2026-09-04).** 종전 사유는 「지분별 안분 UI 부재
       *    또는 양도가액 모델 비양립」이었는데, 실측하면 **배관은 이미 통했다**
       *    (파트 카드 5장 × 지분 수). 막고 있던 것은 **절대금액 성분에 지분 스케일이 없다**는
       *    것이었다 — 취득가액·자본적지출·양도비가 카드마다 **100% 값 그대로**여서
       *    2배 계상됐다. `buildMixedUsePayload`가 그 성분만 스케일하게 고쳐 해소했다
       *    (기준시가·면적은 물건 전체 유지 — `MixedUseAssetInput.ownershipRatio` 계약).
       *    실측: 축 B 60/40 합계 **152,203,211 = 단건 100%와 완전 일치**.
       */
      /**
       * 🔑 **목록이 비었다 (2026-09-04).** 지분 분할 취득(축 B)을 막던 자산 종류가 전건 열렸다:
       *
       * | 자산 | 열린 날 | 막고 있던 진짜 원인 |
       * |---|---|---|
       * | `general_building` | 2026-08-10 | 전용 경로 부재 → `general-building-fractional.ts` |
       * | `commercial_building` | 2026-09-03 | 「경로 부재」가 아니라 **⑩ enum 3종** |
       * | 겸용주택 | 2026-09-04 | 「모델 비양립」이 아니라 **절대금액 미스케일** |
       * | `redevelopment_apt` | 2026-09-04 | 「§166 서브객체 부재 + 절대금액 스케일 필요」 — **둘 다 이미 있었다**. 컴패니언에 `ownershipRatio`를 **안 넘기고 있었을 뿐**이다 |
       *
       * ⚠️ 재개발 차단 사유는 **stale 기재**였다. `buildRedevelopmentPayload`는 `rightsValue`·
       *    `preApprovalExpenses`·`postApprovalExpenses` 스케일을 **이미 갖고 있었고**
       *    (청산금은 「납부한 사실」이라 스케일 X — UI가 지분 납부분을 직접 받는다),
       *    ⑫ `redevelopment` 서브객체도 2026-09-03에 등록됐다.
       *    실측: 축 B 60/40 합계 **453,700,500 = 단건 100%와 완전 일치**.
       *
       * ⚠️ **목록이 비었으므로 「이 가드가 살아 있음」 대조군은 성립하지 않는다.**
       *    지분 축의 살아 있는 게이트는 `transfer-tax-validate-asset.ts`의
       *    「지분 모드 자산은 단독으로 계산할 수 없습니다」(Gate-A)다.
       *
       * 구조는 유지한다 — 새 자산 종류가 생기면 여기 한 줄이 정본이고, 위 표가 그 판단 이력이다.
       */
      void primaryAsset;
      /**
       * ✅ **부담부증여·공익수용 차단은 2026-09-03에 모두 해제됐다.**
       *
       * 종전 사유는 「지분 분할 양도가액 = 총양도가 × 지분율이라 부담부증여(§159 채무액
       * 기반)·공익수용(보상가액)과 비양립」이었다. **둘 다 전제가 틀렸다**:
       *
       * - **부담부증여**: §159는 총양도가를 쓰지 않고 `양도가액 = A × B/C`로 자체 산정한다.
       *   축 B는 채무도 지분 안분해 B/C를 보존한다(`buildBurdenedGiftInfo`의 `debtScaleRatio`).
       *   실측: 60%+40% 합계 = 단건 100% (64,600,360).
       *
       * - **공익수용**: 양도가액은 **총계약가를 그대로 쓴다**(`transfer-tax-api.ts`의
       *   `transferPrice` 삼항에 수용 분기가 없다). 보상 관련 필드는 §164⑨1호 **환산 분모**
       *   전용이고 `min(㎡당 3종) × 면적`·총액 트랙 모두 **환산 비율의 분모**로만 쓰여
       *   분자(취득시 기준시가)와 **약분**된다 ⇒ 지분 스케일이 애초에 불필요하다.
       *   실측: per-sqm(토지·건물)·총액(주택)·§77·§77의2 **6케이스 전부 단건과 완전 일치**.
       *
       * ⚠️ **§77의3(개발제한)은 판별력 없는 픽스처로만 확인됐다**(감면 0). 일치는 했으나
       *    감면이 발동하지 않아 그 축을 증명하지 못한다 — anchor 주석에 명시돼 있다.
       */
    }

    // 특수 계산 경로 × 함께양도(일괄) 차단 — **침묵 오산 방지**.
    //
    // `app/api/calc/transfer/route.ts`는 **순서 있는 if-체인**이고 일괄 분기가 맨 앞이다:
    //   5-a 일괄(:446, return :555) → 5-a-2 겸용(:568) → 5-a-3 일반건물(:611) → 5-b 단건(:660)
    // 따라서 companion이 하나라도 있으면 **뒤쪽 특수 분기는 실행조차 되지 않는다**.
    //
    // 라우트 하네스 실측(단건 ↔ 함께양도 대조, 2026-07-28) — **메커니즘이 둘로 갈린다**:
    //   겸용   : mode=mixed-use·housingPart 有 → 일괄에서 **분기 미실행**(primary가 assetKind=land로 강등)
    //   재개발 : redevelopment 산출물 有 → **분기 미실행**
    //   일반건물: 토지·건물 분리 안분 有 → **분기 미실행**. 단건이면 500으로 막히는 필수 검증
    //            (zoneType)조차 일괄에서는 타지 않고 200이 나온다 — 미실행의 결정적 증거
    //   부담부증여: ✅ **2026-09-03 해제**. 종전 기재(「route가 transferPrice를 안분값으로
    //            덮어써 §159 기준 gain과 스케일 충돌 → 표시 필요경비 음수」)는 **틀렸다** —
    //            엔진 STEP 0.48(`transfer-tax-burdened-gift-step.ts`)이 transferPrice·
    //            acquisitionPrice·expenses를 **모두 §159 산정값으로 다시 덮어써서** route의
    //            안분값은 그대로 버려진다. 충돌 자체가 없다.
    //            진짜 결함은 ④가 카드마다 그 물건 채무 전액을 실어 **자산 수만큼 곱해진** 것이고
    //            (실측 2배), 신고 단위 채무 재배분으로 해소했다
    //            (`apportionCompanionBurdenedGiftDebt`). 계획서:
    //            `docs/02-design/features/transfer-companion-burdened-gift.plan.md`
    //            ⚠️ 표시 축(`properties[].transferPrice`가 §159값이 아니라 route 안분값)은
    //               **축 B에도 이미 있는 별건**이다(실측). 차익·세액은 정확하다.
    //
    // 화면에는 특수 입력이 그대로 보이는데 계산이 어긋나므로 사용자가 알 수 없다.
    // 다물건 계산기는 이미 같은 이유로 전부 차단한다(`multi-transfer-tax-validate.ts:54~65`
    // — "침묵 오산보다 명시 차단이 안전하다"). 함께양도 경로에도 같은 가드를 둔다.
    //
    // `some()`인 이유: 라우트는 primary만 보지만 companion의 특수 입력도 `buildAssetPayload`가
    // 담지 않아 함께 소실된다. 토글·자산추가 순서에 따라 어느 쪽에든 남을 수 있다.
    //
    // ⚠️ `commercial_building`은 **차단하지 않는다** — 전용 분기가 없어 엔진 내부에서 처리된다.
    //
    // 🔴 **종전 근거는 무효였다** (V8-b, 2026-09-02 코드리뷰). 「실측 결과 양도차익이 단건과
    //    동일하니 표시 갭일 뿐」이라고 적혀 있었는데, 그 실측은 `commercialAppurtenantLand`가
    //    **없는** 상가로 한 것이다. 부수토지 초과분(STEP 0.62)이 붙는 순간 갈리는 것은
    //    양도차익이 아니라 **세율**이라 gain 대조로는 구조적으로 잡히지 않는다 —
    //    지목된 회귀 방어 테스트(`transfer.route.bundled-swallows-special.test.ts`)도 같은 축을 본다.
    //    실제로 그 경로에서 §104①8호 +10%p가 통째로 사라지고 있었다(E6-01, 실측 11,683,750원 과소).
    //
    //    ⇒ 결함은 `transfer-tax-aggregate.ts`의 `nblOverride`가 STEP 0.62 파생 판정을 소스로
    //      삼지 않은 것이었고 거기서 고쳤다(엔진과 같은 leaf로 재판정).
    //      차단하지 않는다는 결론 자체는 유지되나, **근거는 「세액이 같다」가 아니라
    //      「집계가 같은 판정을 복원한다」**이다. 세율 축 anchor:
    //      `__tests__/tax-engine/transfer/aggregate-commercial-appurtenant-nbl.anchor.test.ts`
    //
    // 🔴 **이 가드는 「함께 양도」(서로 다른 물건) 전용이다** — 2026-08-10 E2E 실측으로 정정.
    //    「같은 물건의 지분 분할」은 route 5-0(`general-building-fractional.ts`)이 5-a보다
    //    **앞에서** 가로채므로 삼킴이 일어나지 않는다. 그런데 이 가드는 `assets.length > 1`만
    //    보고 걸려서 지분 분할 일반건물이 **계산 자체를 못 하는** 상태였다
    //    (vitest anchor는 payload를 손으로 만들어 route만 봤기 때문에 못 잡았다).
    if (form.assets.length > 1) {
      /**
       * 🔑 **목록이 비었다 (2026-09-04).** 자산종류별 「함께양도 불가」 축은 **전건 개방**됐다 —
       *    분양권·입주권·재개발APT·일반건물·부담부증여(2026-09-03) · 겸용주택(2026-09-04).
       *
       * `e2e/known-failures.ts`가 0건이 된 뒤에도 배열을 남겨 둔 것과 같은 이유로 **구조를
       * 유지한다**: 새 축이 생기면 여기에 한 줄 추가하는 것이 정본이고, 그때 각 항목이 왜
       * 막혔는지의 이력이 아래 주석에 그대로 있다.
       *
       * ⚠️ **이 목록이 비었으므로 「가드가 살아 있음」을 보는 대조군은 이제 성립하지 않는다.**
       *    `gb-fractional-validate.predo` GBF-21이 그 역할을 **겸용 × 지분 분할 차단**
       *    (`:81` — 별개 블록)으로 옮겼다.
       */
      const SINGLE_ONLY: Array<[(a: AssetForm, i: number) => boolean, string]> = [
        /**
         * 🔄 **컴패니언 겸용은 이 목록에서 나갔다 (2026-09-04).** 종전 사유는
         *    「`MixedUseGainBreakdown`이 세액까지 자체 완결해 aggregate 합류 경로가 없다」였는데,
         *    실측 결과 **파트 카드로 되먹이면 단건과 세액이 완전히 일치**한다(5케이스 —
         *    설계문서 `transfer-bundled-subengine-hosting.design.md` §10). ⑩ enum +
         *    ⑫ `mixedUse` 서브객체 + ⑬ 자산별 `buildMixedUsePayload` + ⑭ 파트 확장으로 열었다.
         *
         * ⚠️ **primary 겸용은 계속 막는다** — 5-a의 primary는 `{...engineInput}` 스프레드라
         *    (`route.ts`) 겸용이어도 **평범한 주택 item**이 된다. 여기를 함께 열면
         *    「⑧ 통과 ↔ route 침묵 오산」이 된다. primary 개방은 그 스프레드 지점에 같은 확장을
         *    다는 별건이다.
         */

        /**
         * 🔴 **조합원입주권·분양권 — 2026-08-25 추가.** 종전에는 이 목록에 없어 **침묵 오산**했다.
         *
         * · **입주권**: 2026-07-28 `5591e0b9`가 이 목록을 만들 당시 입주권 양도는
         *   `assetKind="redevelopment_apt" + redevSubject="right"`로 모델링돼 있어 **위 줄이 함께 막았다**.
         *   2026-08-13 `52c1180d`(#1245)가 축을 자산 종류로 일원화해 입주권을 `right_to_move_in`으로
         *   옮기면서 그 차단이 통째로 비켜갔다. 실측: 컴패니언 입주권의 응답 JSON이
         *   「§166 필드를 하나도 넣지 않은 순수 주택」과 **바이트 단위로 동일**했다 —
         *   관리처분 인가일·권리가액·청산금·인가전 취득가액이 화면에는 입력된 채 계산에 한 필드도 닿지 않는다.
         *   (`buildRedevelopmentPayload`는 `transfer-tax-api.ts`에서 **primary 전용** 호출뿐이고
         *    컴패니언 Zod `companionAssetSchema`에는 `redevelopment` 키 자체가 없다.)
         *
         * · **분양권**: `toEngineAssetKind`(`transfer-tax-api-helpers.ts`)가 `presale_right`를
         *   `"housing"`으로 접어 보낸다. 그러면 §104①1호 60% 단일세율·§95② 장기보유특별공제 배제·
         *   시행령 §163⑥4호 개산공제 1%가 전부 사라지고 일반 주택으로 계산된다(실측 111,485,000원 과소).
         *   컴패니언 Zod enum이 `["housing","land","building"]` 3종뿐이라 축을 열려면 ⑩⑭까지 함께
         *   확장해야 하고, 그렇게 해도 입주권은 §166 서브객체가 없어 여전히 오산이다.
         *
         * ⇒ 도메인 오너 결정(2026-08-25): **명시 차단**. 「침묵 오산보다 명시 차단이 안전하다」는
         *   `multi-transfer-tax-validate.ts:57-71`이 이미 택한 방향이고, 다물건 계산기는
         *   2026-08-23에 같은 이유로 입주권을 이미 차단했다 — 함께양도 경로만 빠져 있었다.
         *
         * ⚠️ 축을 정식으로 열려면(컴패니언 분양권 지원) ⑩ `companionAssetSchema.assetKind` enum +
         *   ⑭ `bundled-split-helpers.ts` 매핑 + `toEngineAssetKind` fold 제거가 **함께** 가야 한다.
         *   한 곳만 열면 다시 침묵 오산이 된다.
         */
        /**
         * 🔄 **입주권·재개발APT는 이 목록에서 나갔다 (2026-09-03).** 두 자산의 장벽이 서로
         *    달랐다 — 입주권은 ④ fold(200이면서 §166 없이 주택 계산), 재개발APT는 ⑩ enum(400).
         *    ⑩ enum + ⑫ `redevelopment` 서브객체 + ⑬ 자산별 `buildRedevelopmentPayload` +
         *    ⑭ `propertyType` 매핑으로 함께 열었다. 컴패니언은 각 자산이 자기 물건의 100%라
         *    축 A(공유지분)의 절대금액 스케일이 필요 없다.
         *    실측: 컴패니언 결과에 `redevelopmentDetail`이 실린다(anchor RD-4).
         */
        /**
         * 🔄 **분양권은 이 목록에서 나갔다 (2026-09-03).** 장벽은 ⑩ enum이 아니라 **④ fold**였고
         *    (`toEngineAssetKind`), 그것을 걷어내니 §104①1호 60% 단일세율·§95② 장기보유특별공제
         *    배제·개산공제 §163⑥4호가 전부 엔진의 `propertyType` 판정으로 살아난다.
         *    **서브객체가 없어** 입주권·재개발과 달리 배관만으로 정합이 성립한다.
         *    실측: 컴패니언 분양권이 60% 단일세율군으로 분리(anchor PR-3).
         */
        /**
         * 지분 분할(전 자산 fractional)은 전용 경로가 있으므로 제외한다 — **일반건물 전용**.
         * route 5-0(`general-building-fractional.ts`)이 5-a보다 앞에서 가로챈다.
         *
         * 🔄 **부담부증여는 이 목록에서 나갔다**(2026-09-03). 축 B(지분 분할)는 2026-09-03에,
         *    컴패니언(다른 물건)은 신고 단위 채무 재배분으로 함께 열렸다 — 두 축을 가르던
         *    `fullFractional` 조건이 더는 필요 없다. 대신 아래 「상증법 평가 승자」 게이트가
         *    합산 증여세를 낼 수 없는 조합만 좁게 막는다.
         */
        /**
         * 🔄 **일반건물은 이 목록에서 나갔다 (2026-09-03).** 종전 사유는 「일괄(5-a)이 일반건물
         *    분기를 삼킨다」였는데, 정확히는 **5-a가 `return`해 5-a-3이 도달조차 하지 않는다**였다
         *    (설계문서 `transfer-bundled-subengine-hosting.design.md` §1). ⑭가
         *    `buildGbPartCards`로 파트 카드를 만들어 aggregate에 합류시켜 해소했다 —
         *    축 B(지분 분할)와 **같은 leaf**를 쓴다.
         *
         * ⚠️ 겸용주택은 위에서 **계속 차단**한다. `MixedUseGainBreakdown`이 세액까지 자체
         *    완결해 aggregate 합류 경로가 없다(설계문서 §2 · 미검증 V-2~V-4).
         */
      ];
      /**
       * 🔄 **겸용주택 차단은 전부 없어졌다 (2026-09-04).**
       *
       * 컴패니언은 파트 카드 되먹임으로 먼저 열렸고(#1466), **주 자산 겸용**도 5-a의
       * primary 조립부(`route.ts`)에 같은 확장을 달아 열었다 — 종전에는 그 자리가
       * `{...engineInput}` 스프레드라 겸용이 평범한 주택 item이 됐다.
       *
       * ⚠️ **겸용 × 지분 분할은 위(`:81`)에서 여전히 차단**이다 —
       *    `totalPropertyTransferPrice`가 「물건 전체 양도가액」과 「주택분 합계」 두 의미로
       *    충돌한다. 그 차단이 이 축과 지분 축이 만나지 않게 지킨다.
       */

      for (const [match, label] of SINGLE_ONLY) {
        if (form.assets.some((a, i) => match(a, i))) {
          issues.push({
            step,
            assetIndex: 0,
            message: `${label}은(는) 함께 양도와 같이 계산할 수 없습니다. 함께 양도 토글을 끄고 단건으로 계산하세요.`,
          });
        }
      }

      /**
       * 컴패니언(다른 물건) 함께 부담부증여 — **상증법 평가 승자 게이트**.
       *
       * 증여세는 증여계약 전체로 **1회** 계산해야 한다(카드별로 쪼개면 증여재산공제가 N번
       * 차감되고 누진이 갈라진다 — 축 B에서 −19,400,000원 실측). ④는 그것을 자산별 info의
       * **성분 단순 합**(`buildCompanionBurdenedGiftWholeInfo`)으로 만든다.
       *
       * 🔑 그 합이 ΣAᵢ와 일치하는 것은 **모든 자산의 Max 승자가 보충적평가일 때뿐**이다 —
       *    Σmax ≠ max(Σ성분)이기 때문이다. 담보평가(상증법 §66)·임대평가(§61⑤)가 max인
       *    자산이 섞이면 합산 증여가액이 ΣAᵢ와 어긋나 **증여세가 조용히 틀린다**.
       *
       * ⇒ 「침묵 오산보다 명시 차단」(`multi-transfer-tax-validate.ts:57-71`)과 같은 층위로
       *   그 조합만 좁게 막는다. 양도세 자체는 카드별 Aᵢ로 정확하므로, 이 게이트를 넓히면
       *   지원되는 조합까지 막힌다.
       *
       * 축 B(지분 분할)는 대상이 아니다 — 물건이 하나라 `burdenedGiftWholeInfo`가 primary의
       * 미안분 info 그대로이고 합산이 없다.
       */
      if (!fullFractional && form.assets.some((a) => a.transferType === "burdened_gift")) {
        const ratios = form.assets.map((a) => getOwnershipRatio(a));
        const valuations = companionBurdenedGiftValuations(
          form.assets.map((a) => buildBurdenedGiftInfo(a)),
          ratios,
        );
        valuations.forEach((v, i) => {
          if (v.selectedMode === "supplementary") return;
          const kind = v.selectedMode === "mortgage" ? "담보평가(상증법 §66)" : "임대평가(상증법 §61⑤)";
          issues.push({
            step,
            assetIndex: i,
            message: `자산 ${i + 1}: 증여재산 평가액이 ${kind}으로 결정되는 자산은 함께 양도와 같이 계산할 수 없습니다. 여러 물건을 함께 부담부증여하면 증여세를 증여계약 전체로 1회 계산해야 하는데, 이 경우 합산 증여가액이 자산별 평가액 합계와 어긋납니다. 함께 양도 토글을 끄고 단건으로 계산하세요.`,
          });
        });
      }

      /**
       * 컴패니언 **매매사례가액 추계**(소득세법 시행령 제176조의2 제3항 제1호) 차단 —
       * ⑧↔⑩ 모순 해소 (2026-08 코드리뷰 F41).
       *
       * ⑩ `companionAssetSchema`(`transfer-tax-schema-sub.ts:286~`)에는 `acquisitionMethod`·
       * `similarSalesValue`가 **없다**. 그래서 ④ `buildAssetPayload`도 그 값을 담지 않고,
       * companion superRefine(`transfer-tax-schema.ts:600~626`)이 매매(실가)로 보아
       * `fixedAcquisitionPrice`를 요구한다 — 실측 400:
       *   {"companionAssets.0.fixedAcquisitionPrice":["매매(실가) 시 취득가액 필수"]}
       * 그런데 ⑧(`transfer-tax-validate-asset.ts:331~333`)은 `similarSalesValue`만 있으면
       * 통과시킨다. 사용자는 **화면에 없는 「취득가액」**을 요구받은 채 계산을 끝낼 수 없다.
       * 다물건 계산기와 같은 「침묵 오산보다 명시 차단」 정책을 여기에도 둔다.
       *
       * ⚠️ 술어는 **컴패니언(`i > 0`)만** 본다. primary의 매매사례가액은 `transfer-tax-api.ts:361`이
       *    정상 배관하고(`__tests__/lib/calc/transfer-sales-case-wiring.test.ts`) Zod도 통과한다(실측)
       *    — `some()`으로 전 자산을 보면 **지원되는 조합까지** 막힌다.
       *
       * ⚠️ 일반건물 지분 분할은 제외한다 — ④가 `companionAssets`를 아예 만들지 않아 위 400이
       *    나지 않고(실측 parse ok), 일반건물의 추계 축은 파트별 `landAcqMode`/`buildingAcqMode`라
       *    자산-수준 플래그와 축 자체가 다르다.
       */
      if (!isGbFractional) {
        for (let i = 1; i < form.assets.length; i++) {
          if (form.assets[i].isSalesCaseAcquisition !== true) continue;
          issues.push({
            step,
            assetIndex: i,
            message: `자산 ${i + 1}: 매매사례가액 추계(소득세법 시행령 제176조의2 제3항 제1호)는 첫 번째 자산에서만 계산할 수 있습니다. 함께 양도 토글을 끄고 단건으로 계산하거나, 이 자산의 취득가액 산정 방식을 실지거래가액·환산·감정가액 중에서 선택하세요.`,
          });
        }
      }
    }

    // 자산별 검증 — 자산당 첫 오류 1건씩 일괄 수집.
    // 지분 모드 companion(i>0)은 ① 기본정보를 숨기므로 primary basic을 병합해 검사
    // (자산종류·면적이 primary값 → basic 미입력 spurious 차단 방지, 취득측은 companion 고유값 유지).
    //
    // 🔴 **일반건물은 GB 물건-수준까지 병합한다** — 2026-08-10 E2E 실측으로 추가.
    //    지분 카드는 면적·양도시 기준시가·용도지역을 **UI에서 숨기므로**(`shareAcquisitionOnly`)
    //    `mergePrimaryBasic`의 7키만으로는 「자산 2: 토지면적을 입력하세요」가 뜬다 —
    //    화면에 칸이 없는데 입력하라는 **UI 통과 ↔ validate 차단 모순**이다(CLAUDE.md ⑧).
    //    ④ API 변환과 **같은 함수**를 쓴다(단일 소스 — 목록이 갈리면 한쪽만 통과한다).
    for (let i = 0; i < form.assets.length; i++) {
      const entry =
        fullFractional && i > 0 && primaryAsset
          ? isGbFractional
            ? mergeGbPropertyLevel(form.assets[i], primaryAsset)
            : mergePrimaryBasic(form.assets[i], primaryAsset)
          : form.assets[i];
      const message = validateAssetEntry(entry, i, form);
      if (message) issues.push({ step, assetIndex: i, message });
    }

    // 지분 분할 모드(토글 B) 미입력 차단 — ownership 분자/분모 빈칸 = "지분율 미입력" 신호.
    // 함께양도는 100/100 비빈칸이라 미해당. UI 토글 상태 없이 form만으로 판정 (옵션 c).
    for (let i = 0; i < form.assets.length; i++) {
      const a = form.assets[i];
      const numEmpty = !a.ownershipNumerator || a.ownershipNumerator.trim() === "";
      const denEmpty = !a.ownershipDenominator || a.ownershipDenominator.trim() === "";
      if (numEmpty || denEmpty)
        issues.push({
          step,
          assetIndex: i,
          message: "지분 분할 취득: 공유 지분율(%)을 입력하세요.",
        });
    }

    // 지분 분할 취득 — 전 지분율 합계 = 100% 검증. 미달/초과 시 양도가액(총양도가×지분율) 합이
    // 총액과 달라져 과소/과대과세. (0.005 = 0.5%p 허용 — 33.33×3=99.99 등 2자리 반올림 흡수.)
    if (fullFractional) {
      const sumRatio = form.assets.reduce((s, a) => {
        const n = parseFloat(a.ownershipNumerator);
        const d = parseFloat(a.ownershipDenominator);
        return s + (isFinite(n) && isFinite(d) && d > 0 ? n / d : 0);
      }, 0);
      if (Math.abs(sumRatio - 1) > 0.005) {
        issues.push({
          step,
          message: `지분 분할 취득: 전체 지분율 합계가 100%가 되어야 합니다 (현재 ${(sumRatio * 100).toFixed(2)}%).`,
        });
      }
    }

    // actual 모드 합계 검증 — 지분 모드 자산이 하나라도 있으면 ratio 자동 적용으로 합계 검증 생략.
    // 동일 물건 지분 단계취득은 ratio 합 = 100% 가정으로 시스템이 자동 분배.
    const anyFractional = form.assets.some((a) => {
      const n = parseFloat(a.ownershipNumerator || "100");
      const d = parseFloat(a.ownershipDenominator || "100");
      return isFinite(n) && isFinite(d) && d > 0 && n > 0 && n < d;
    });
    if (form.assets.length > 1 && form.bundledSaleMode === "actual" && !anyFractional) {
      const sumActual = form.assets.reduce(
        (s, a) => s + parseAmount(a.actualSalePrice),
        0,
      );
      if (sumActual !== parseAmount(form.contractTotalPrice))
        issues.push({ step, message: "구분 기재된 양도가액 합이 총 양도가액과 일치하지 않습니다." });
    }
  }

  // step 1: 보유 상황 (구 step 3)
  if (step === 1) {
    if (!form.householdHousingCount)
      issues.push({ step, message: "세대 보유 주택 수를 선택하세요." });

    /**
     * P5 모드 2 (⑧): 보유 감면주택 행 — 조문·취득일 필수 (확인 토글은 낙관 — 엔진 불적용 사유)
     *
     * 🔴 D4-03 — 종전에는 `surchargeSuppressed`면 이 검증을 **건너뛰었다**. 그런데
     * `transfer-tax-api.ts`는 값을 그대로 전송하므로, 창 밖에서 입력한 뒤 양도일을 창
     * 안으로 옮기면 **무검증 통과**가 됐다(비대칭). 지금은 한시배제 기간에도 ⑤ 입력
     * 경로가 열려 있으므로(§89①3호 비과세는 §104⑦ 중과와 무관) skip을 제거한다.
     * 「보이지 않는 필드 차단 방지」라는 원래 취지도 더는 성립하지 않는다.
     */
    const she = form.specialHouseExclusions ?? [];
    for (let i = 0; i < she.length; i++) {
      if (!she[i].article) {
        issues.push({ step, message: `보유 감면주택 ${i + 1}: 적용 조문을 선택하세요.` });
        continue; // 행 내부는 첫 오류 1건
      }
      if (!she[i].houseAcquisitionDate && !she[i].houseContractDate)
        issues.push({ step, message: `보유 감면주택 ${i + 1}: 감면주택의 취득일(또는 매매계약일)을 입력하세요.` });
    }

    /**
     * ⑧ 세대 보유 주택 목록 — 행별 첫 오류 1건씩 (자동 안분 fallback 금지: 미입력=차단)
     *
     * 🔴 종전에는 `surchargeSuppressed`면 이 검증을 **건너뛰었다**. `specialHouseExclusions`가
     * D4-03에서 같은 이유로 skip을 걷어낸 것과 동일한 비대칭이 남아 있었다 —
     * `transfer-tax-api.ts:582`는 `housesPayload`를 억제 없이 전송하므로, 창 밖에서 입력한 뒤
     * 양도일을 창 안으로 옮기면 **무검증 통과**가 된다.
     *
     * 「보이지 않는 필드 차단 방지」라는 원래 취지도 더는 성립하지 않는다 — 한시배제 기간에도
     * ⑤ `HousesListSection` 입력 경로가 열려 있다(§155②③ 상속주택·§89② 분양권은 §89①3호
     * **비과세** 축이라 §104⑦ 중과 한시배제와 무관하다).
     */
    const houses = form.houses ?? [];
    for (let i = 0; i < houses.length; i++) {
      const h = houses[i];
      const label = `보유 주택 ${i + 1}`;
      const firstError = (() => {
        if (!h.acquisitionDate) return `${label}: 취득일을 입력하세요.`;
        if (!h.officialPrice || parseAmount(h.officialPrice) <= 0)
          return `${label}: 기준시가(공시가격)를 입력하세요.`;
        // 상속주택 5년 배제는 상속개시일이 있어야 기산 (소령 §167의3①7호) — 미입력 시 배제 미발동 → 차단
        if (h.isInherited && !h.inheritedDate)
          return `${label}: 상속주택이면 상속개시일을 입력하세요. (상속 5년 중과배제 판정 기준)`;
        // 장기임대 등록 경로: 등록사업자 선택 시 등록일 2종·임대기간 필수
        if (h.isLongTermRental && h.isRegisteredRental) {
          if (!h.rentalRegistrationDate) return `${label}: 임대사업자 등록일을 입력하세요.`;
          if (!h.businessRegistrationDate) return `${label}: 사업자 등록일을 입력하세요.`;
          if (!h.rentalPeriodYears || parseFloat(h.rentalPeriodYears) <= 0)
            return `${label}: 임대기간(년)을 입력하세요.`;
        }
        // 장기임대 9유형: 유형별 필수 입력값(가액·면적·날짜) — 미입력 시 엔진 오판정
        // (특히 면적 미입력 → 엔진 0 간주 → 298㎡ 이하 통과 → 과대 적용). exact 비교(.includes(t)=정확매칭).
        if (h.isLongTermRental && h.rentalType) {
          const t = h.rentalType;
          if (["A", "C", "E", "F", "H", "I"].includes(t) && !h.rentalStartOfficialPrice)
            return `${label}: 임대개시 당시 공시가격을 입력하세요.`;
          if (["B", "D"].includes(t) && !h.acquisitionOfficialPrice)
            return `${label}: 취득 당시 공시가격을 입력하세요.`;
          if (["C", "D", "F", "I"].includes(t) && (!h.rentalLandArea || !h.rentalTotalFloorArea))
            return `${label}: 대지면적·연면적(㎡)을 입력하세요.`;
          if (t === "D" && !h.firstSaleContractDate)
            return `${label}: 최초 분양계약일을 입력하세요.`;
          if (t === "G") {
            if (!h.rentalCancellationDate)
              return `${label}: 자진·자동 말소일을 입력하세요.`;
            // 사목 base 목(가·다·라·마) + 그 목의 "해당 목의 다른 요건"(임대기간요건 외) — 엔진 SAMOK_BASE_REQUIRED·base 게이트와 동기화
            const base = h.saMokBaseArticle;
            if (!base) return `${label}: 사목 — 말소 전 base 목(가·다·라·마)을 선택하세요.`;
            if ((base === "가" || base === "다" || base === "마") && !h.rentalStartOfficialPrice)
              return `${label}: 사목 base 목의 임대개시 당시 공시가격을 입력하세요.`;
            if (base === "라" && !h.acquisitionOfficialPrice)
              return `${label}: 사목 base 라목의 취득 당시 공시가격을 입력하세요.`;
            if ((base === "다" || base === "라") && (!h.rentalLandArea || !h.rentalTotalFloorArea))
              return `${label}: 사목 base 목의 대지면적·연면적(㎡)을 입력하세요.`;
            if (base === "라" && !h.firstSaleContractDate)
              return `${label}: 사목 base 라목의 최초 분양계약일을 입력하세요.`;
          }
        }
        // P2 부득이한 사유: 거주기간(년) 필수 (엔진 ≥1년 판정 — 미입력 시 0 간주로 배제 미발동)
        if (h.isUnavoidableReason && (!h.unavoidableResidenceYears || parseFloat(h.unavoidableResidenceYears) <= 0))
          return `${label}: 부득이한 사유 주택의 거주기간(년)을 입력하세요.`;
        return null;
      })();
      if (firstError) issues.push({ step, message: firstError });
    }

    // ⑧ 양도 주택 3주택+ 전용 배제 특례 — 사원주택/어린이집 선택 시 기간(년) 필수
    const se = form.sellingHouseExclusion;
    if (se?.isEmployeeHousing && (!se.freeProvisionYears || parseFloat(se.freeProvisionYears) <= 0))
      issues.push({ step, message: "양도 주택 사원용 주택: 무상 제공 기간(년)을 입력하세요." });
    if (se?.isDayCareCenter && (!se.dayCareOperationYears || parseFloat(se.dayCareOperationYears) <= 0))
      issues.push({ step, message: "양도 주택 어린이집: 운영 기간(년)을 입력하세요." });

    // ⑧ 세대 보유 분양권·입주권 — 각 행 취득일 필수 (자동 안분 fallback 금지)
    // 위 houses와 같은 이유로 한시배제 skip을 두지 않는다 — §89②는 비과세 축이고 ⑤도 열려 있다.
    const presaleRights = form.presaleRights ?? [];
    for (let i = 0; i < presaleRights.length; i++) {
      if (!presaleRights[i].acquisitionDate)
        issues.push({ step, message: `분양권·입주권 ${i + 1}: 취득일을 입력하세요.` });
    }

    /**
     * ⑧ 다주택 중과 한시 유예(§167의3①12의2 나·다목) — 입력(ON) 시 목별 필수 입력.
     * houses 0건이면 엔진이 gracePeriod를 소비하지 않고 위젯도 숨김 → 검증도 houses>0 게이트(보이지 않는 필드 차단 방지).
     * 허가·계약금 증빙 미확인은 silent 차단이 아닌 "경과조치 부적용으로 계산 진행"(원문 "모두 갖춘" 요건 —
     * 엔진 checkGracePeriodExemption이 미충족 시 자동으로 suspended:false 처리·차단 대상 아님).
     *
     * ⚠️ **한시배제 창 안에서는 건너뛴다** — 위 houses·presaleRights와 달리 이 축만은 여전히
     * 중과 전용이고 창 안에서 **증명 가능한 no-op**이다(`checkGracePeriodExemption`의 가목 우선
     * 게이트가 `gracePeriod` 내용과 무관하게 `suspended: true`를 낸다). ⑤도 같은 조건으로
     * `HousesListSection hideGracePeriod`가 위젯을 닫으므로 짝이 맞는다.
     */
    const graceHidden = isMultiHouseSurchargeSuppressed(
      form.transferDate,
      form.assets?.[0]?.acquisitionDate,
    );
    if (!graceHidden && houses.length > 0 && form.gracePeriod) {
      if (!form.gracePeriod.contractDate)
        issues.push({ step, message: "중과 한시 유예: 매매계약 체결일을 입력하세요." });
      if (form.gracePeriod.isLandPermitTarget === true && !form.gracePeriod.permitApplicationDate)
        issues.push({ step, message: "중과 한시 유예(나목): 토지거래허가 신청일을 입력하세요." });
    }

    // ⑧ §156의2⑤ 대체주택 특례 — 토글 ON 시 4필드 필수 (자동 안분 fallback 금지)
    if (form.replacementHouseSpecial) {
      if (!form.replBusinessApprovalDate)
        issues.push({ step, message: "대체주택 특례: 사업시행계획인가일을 입력하세요." });
      if (!form.replCompletionDate)
        issues.push({ step, message: "대체주택 특례: 신축주택 준공일을 입력하세요." });
      if (!form.replResidenceMonths || parseInt(form.replResidenceMonths, 10) <= 0)
        issues.push({ step, message: "대체주택 특례: 대체주택 거주개월수를 1개월 이상 입력하세요." });
      if (!form.replWillResideNewHouse)
        issues.push({ step, message: "대체주택 특례: 신축주택 1년 이상 거주 예정에 동의해야 비과세를 적용할 수 있습니다." });
    }

    /**
     * ⑧ §89② 3년 초과 예외 — 갈래를 고르면 그 갈래의 **필수값**이 있어야 한다.
     *
     * ④ 변환은 필수값이 비면 payload 키 자체를 만들지 않는다(입력 중인 상태이지 선언이 아니다).
     * 여기서 막지 않으면 「화면에서는 골랐는데 계산에는 반영되지 않는」 침묵 불일치가 된다.
     *
     * ⚠️ 미선택(`""`)은 막지 않는다 — 판정 불가로 남아 종전대로 계산되고 결과에 안내가 붙는다.
     *    여기서 차단하면 3년 초과 세대 전체가 계산 자체를 못 하게 된다.
     */
    if (form.rightThreeYearExceptionKind === "new_house" && !form.rightNewHouseCompletionDate) {
      issues.push({
        step,
        message: "3년 초과 예외(시행령 §156의2④): 신축주택 완성일을 입력하세요.",
      });
    }
    if (form.rightThreeYearExceptionKind === "delay" && !form.rightDisposalDelayReason) {
      issues.push({
        step,
        message: "3년 초과 예외(시행규칙 §75①): 3년이 되는 날 현재의 사유를 선택하세요.",
      });
    }

    // ⑧ §154① 단서 — 사유별 필수 입력. effectiveProvisoReason로 정규화
    // (카드 숨김·temp-two-house 무효 reason(나·다목·5호)은 검증 skip — Part B/D mirror·데드락 차단)
    const provisoMode = provisoGate({
      isOneHousehold: form.isOneHousehold,
      isHousing: form.assets?.[0]?.assetKind === "housing",
      householdHousingCount: form.householdHousingCount,
      temporaryTwoHouseSpecial: form.temporaryTwoHouseSpecial,
    }).mode;
    // ⑧ 일시적 2주택 특례 — 입력존재만 차단. 요건 미달(1년 미경과·3년 초과)은 정상 통과(특례만 미적용).
    if (provisoMode === "temporary_two_house") {
      if (!form.assets?.[0]?.acquisitionDate)
        issues.push({ step, message: "일시적 2주택: 양도 자산의 취득일을 1단계에서 입력하세요." });
      if (!form.newHouseAcquisitionDate)
        issues.push({ step, message: "일시적 2주택: 신규 주택 취득일을 입력하세요." });
    }

    const provisoReasonEff = effectiveProvisoReason(provisoMode, form.provisoReason);
    if (
      (provisoReasonEff === "overseas_migration" || provisoReasonEff === "overseas_residence") &&
      !form.provisoDepartureDate
    )
      issues.push({
        step,
        message: "§154① 단서(해외이주·국외거주): 출국일을 입력하세요. (출국일부터 2년 내 양도 판정)",
      });
    if (provisoReasonEff === "pre_designation_contract" && !form.provisoPreContractNoHouse)
      issues.push({
        step,
        message: "§154① 단서(조정 공고 전 계약): 계약금 지급일 현재 무주택 여부를 확인하세요.",
      });

    // 1세대1주택 + housing 자산 + interval 모드 거주 구간 검증 — 구간별 첫 오류 1건씩
    const primary = form.assets?.[0];
    if (form.isOneHousehold && primary && primary.assetKind === "housing"
        && primary.residenceInputMode === "interval") {
      const periods = primary.residencePeriods ?? [];
      for (let i = 0; i < periods.length; i++) {
        const p = periods[i];
        const label = `거주 구간 #${i + 1}`;
        const firstError = (() => {
          if (!p.moveInDate) return `${label}: 입주일을 입력하세요.`;
          if (!p.moveOutDate)
            return `${label}: 퇴거일을 입력하세요. (양도일까지 거주한 경우 양도일을 퇴거일로 입력)`;
          if (p.moveOutDate < p.moveInDate)
            return `${label}: 퇴거일은 입주일보다 이후여야 합니다.`;
          // 거주기간은 보유기간(취득일~양도일) 중 거주만 산입 (소령 §154①·법 §95⑤2호)
          // — 취득 전 임차 거주 구간을 산입하면 거주요건·표2 공제가 과대 계산됨
          if (primary.acquisitionDate && p.moveInDate < primary.acquisitionDate)
            return `${label}: 입주일이 취득일(${primary.acquisitionDate})보다 빠릅니다. 거주기간은 보유기간 중 거주만 산입됩니다 (소령 §154①·법 §95⑤). 취득 전 임차 거주는 제외하고 입력하세요.`;
          if (form.transferDate && p.moveInDate > form.transferDate)
            return `${label}: 입주일은 양도일 이전이어야 합니다.`;
          if (form.transferDate && p.moveOutDate && p.moveOutDate > form.transferDate)
            return `${label}: 퇴거일은 양도일 이전이어야 합니다.`;
          return null;
        })();
        if (firstError) issues.push({ step, assetIndex: 0, message: firstError });
      }

      // 구간 간 겹침 차단 — sumResidenceMonths는 단순 합산이므로 겹침 시 거주개월 이중 계산
      // (입주일 정렬 후 인접 비교. 퇴거일 = 다음 입주일(이사 당일)은 겹침 아님 — 초과만 차단)
      const complete = periods
        .map((p, idx) => ({ ...p, idx }))
        .filter((p) => p.moveInDate && p.moveOutDate)
        .sort((a, b) => (a.moveInDate < b.moveInDate ? -1 : a.moveInDate > b.moveInDate ? 1 : 0));
      for (let i = 1; i < complete.length; i++) {
        const prev = complete[i - 1];
        const cur = complete[i];
        if (prev.moveOutDate > cur.moveInDate) {
          issues.push({
            step,
            assetIndex: 0,
            message: `거주 구간 #${prev.idx + 1}(퇴거 ${prev.moveOutDate})과 #${cur.idx + 1}(입주 ${cur.moveInDate})이 겹칩니다. 구간이 겹치면 거주기간이 이중 계산되므로 구간을 분리하거나 합쳐서 입력하세요.`,
          });
        }
      }
    }
  }

  // step 2: 감면·공제 (구 step 4) — transfer-tax-validate-reductions.ts로 분리 (800줄 정책, 2026-06-11)
  // 모듈이 첫 오류 1건 반환 구조 — 단계 내 첫 오류만 수집 (후속 확장 여지)
  if (step === 2) {
    const issue = validateStep2Reductions(step, form);
    if (issue) issues.push(issue);
  }

  // step 3: 가산세 / 수정신고
  if (step === 3 && form.amendmentMode) {
    if (parseAmount(form.originalDeterminedTax) <= 0)
      issues.push({ step, message: "당초 결정세액을 입력하세요." });
    // [F5] 경정청구 후발적 사유 → 사유 안 날 필수 (§45의2② 3개월 기산)
    if (
      form.correctionKind === "refund_claim" &&
      form.claimReasonType === "posterior" &&
      !form.posteriorEventDate
    )
      issues.push({ step, message: "후발적 사유를 안 날을 입력하세요." });
    if (form.applyUnderReportingPenalty && form.underReductionMode === "auto_48_2") {
      if (!form.statutoryFilingDeadline)
        issues.push({ step, message: "§48② 자동감면 산정을 위해 법정신고기한을 입력하세요." });
      if (!form.amendedFilingDate)
        issues.push({ step, message: "§48② 자동감면 산정을 위해 수정신고일을 입력하세요." });
    }
    if (form.applyLatePaymentPenalty) {
      if (!form.statutoryFilingDeadline)
        issues.push({ step, message: "납부지연가산세 산정을 위해 법정신고기한을 입력하세요." });
      if (!form.amendedPaymentDate)
        issues.push({ step, message: "납부지연가산세 산정을 위해 수정신고 납부(예정)일을 입력하세요." });
    }
  }

  return issues;
}

/**
 * 기존 string 반환 API 보존 — 호출처·테스트 호환.
 * 위치 정보가 필요한 UI는 validateStepDetailed를 사용한다.
 */
export function validateStep(step: number, form: TransferFormData): string | null {
  return validateStepDetailed(step, form)?.message ?? null;
}

/** 첫 번째 차단 오류 1건 — collectStepIssues 위임 (검증 규칙 단일 진실) */
export function validateStepDetailed(step: number, form: TransferFormData): ValidationIssue | null {
  return collectStepIssues(step, form)[0] ?? null;
}

/**
 * 비차단 경고 수집 — 진행은 허용하되 주의를 요하는 입력.
 * collectStepIssues(차단)와 독립 채널. UI는 amber 배너로 표시하되 handleNext/handleSubmit를 막지 않음.
 *
 * - 미래 양도일: 미래 시점 가정 계산(시뮬레이션) 허용 — 입력 확인용 경고만.
 *   (취득일 미래는 입력 오류로 collectStepIssues에서 차단 — validateAssetEntry)
 */
export function collectStepWarnings(step: number, form: TransferFormData): ValidationIssue[] {
  const warnings: ValidationIssue[] = [];
  if (step === 0) {
    if (form.transferDate && form.transferDate > todayLocalISO()) {
      warnings.push({
        step,
        message: `양도일(${form.transferDate})이 오늘 이후입니다. 미래 시점 가정 계산입니다 — 입력값을 확인하세요.`,
      });
    }
  }
  return warnings;
}

"use client";

/**
 * 특수 자산의 「취득가액 — 자동 산정」 안내 카드 3종 (부담부증여 · 재개발/재건축 APT · 조합원입주권).
 *
 * `CompanionAcqPurchaseBlock`에서 분리(2026-10-02, 800줄 정책 — 798줄). `asset`만 읽는 순수 표시
 * 덩어리라 이음매가 가장 깨끗하다. 세 카드는 상단 일반 「취득가액 산정 방식·취득가액」 입력을
 * 숨기는 게이트(부모의 `transferType`·`assetKind` 조건)와 **짝**이다 — 게이트를 바꾸면 여기 문구도 같이 본다.
 */

import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function CompanionAcqSpecialAssetNotices({ asset }: { asset?: AssetForm }) {
  return (
    <>
      {/* 부담부증여 모드 — 취득가액 산정 방식·실거래가 입력 숨김 (§159 자동 산정).
          폼 상태(useEstimatedAcquisition·fixedAcquisitionPrice 등)는 보존하여
          양도 형태를 "일반 양도"로 되돌리면 입력값 복원 가능. */}
      {asset?.transferType === "burdened_gift" && (
        <div className="rounded-lg border border-fuchsia-300 bg-fuchsia-50/60 p-3 space-y-1.5">
          <p className="text-sm font-semibold text-fuchsia-900">
            취득가액 — 부담부증여 §159 자동 산정
          </p>
          <p className="text-xs text-fuchsia-800">
            부담부증여(소득세법 시행령 §159)는 취득가액을 <b>증여재산 평가방식</b>에 따라 엔진이 자동 산정합니다
            — 기준시가 평가 시 취득기준시가 × 채무비율, 시가 평가 시 실지취득가액 또는 환산취득가액(위
            &lsquo;부담부증여&rsquo; 카드의 <b>취득가액 산정방식</b>에서 선택). 따라서 일반 취득가액 산정 방식·실거래가
            입력은 여기서 표시하지 않습니다.
          </p>
          {/*
            🔴 **자산별로 문구가 갈린다** (2026-08-12 — O-1 결함 수정).

            종전에는 자산 구분 없이 「취득시 기준시가는 … **자동 도출**됩니다」라고 안내했는데,
            그것이 참인 것은 `general_building` 뿐이다(gb* 전용 입력이 있다). 나머지 자산은
            도출할 소스가 없어 **0으로 계산**됐고(취득가액 0 → 과대과세), 이 문구가 그 결함을
            가려 왔다. 이제 ② 양도정보에 입력칸이 있으므로 그리로 안내한다.

            설계: docs/02-design/features/burdened-gift-acq-std-price-input-path.plan.md §5 Q-3
          */}
          <p className="text-caption text-fuchsia-700">
            {asset?.assetKind === "general_building" ? (
              <>
                ※ 산식에 필요한 <b>취득시 기준시가</b>는 아래 일반건물 취득 정보의 토지 공시지가·건물
                기준시가 입력에서 자동 도출됩니다.
              </>
            ) : (
              <>
                ※ 기준시가 평가 시 산식에 필요한 <b>취득시 기준시가</b>는 위 <b>② 양도정보</b>의
                &lsquo;취득시 기준시가&rsquo; 카드에서 입력하세요(양도시 기준시가 바로 아래).
              </>
            )}{" "}
            보유기간·기산점 산정에 필요한 <b>취득일·취득원인</b>은 위 라디오에서 그대로 입력하세요.
          </p>
        </div>
      )}
      {/* 재개발/재건축 APT 모드 — 상단의 일반 "취득가액 산정 방식"·"취득가액" 입력 영역 숨김.
          §166②1호 인가후 분의 분양가(= 권리가액 ± 청산금)는 결정론적으로 도출되므로
          사용자 직접 입력이 불필요. 인가전 분의 환산취득가/감정가액은 아래 §166 섹션 내부에서 처리. */}
      {asset?.assetKind === "redevelopment_apt" &&
        // 🔴 승계조합원(§162①4호)은 제외한다 (2026-08-25 — E2-01).
        //    아래 §166 ⑤ 섹션이 승계 모드에서 숨겨지므로, 이 카드가 「아래에서 입력한다」고
        //    안내하면 **두 카드가 서로를 가리키는 순환**이 된다. 실제로 그 상태에서 매매 취득의
        //    취득가액 입력 칸이 화면 어디에도 없어 0이 엔진에 도달했다.
        asset?.redevIsSuccessorMember !== "yes" && (
        <div className="rounded-lg border border-violet-300 bg-violet-50/60 p-3 space-y-1.5">
          <p className="text-sm font-semibold text-violet-900">
            취득가액 — 재개발 §166②1호 자동 산정
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <LawArticleModal legalBasis="소득세법 시행령 §166 ② 1호" label="시행령 §166②1호" />
            <LawArticleModal legalBasis="소득세법 시행령 §166 ③" label="시행령 §166③" />
          </div>
          <p className="text-xs text-violet-800">
            재개발/재건축 양도에서 인가후 분의 분양가(= 권리가액 + 청산금 납부액 또는 권리가액 − 청산금 수령액)는
            아래 <b>§166②1호 재개발 일정·금액</b> 섹션의 입력값에서 엔진이 자동 산정합니다.
            따라서 상단 일반 &ldquo;취득가액 산정 방식·취득가액&rdquo; 입력은 표시하지 않습니다.
          </p>
          <p className="text-caption text-violet-700">
            ※ 인가전 분의 <b>환산취득가</b>(시행령 §166③ + §164⑦ 본문)는 아래 §166 섹션 내 환산취득가 토글에서 입력합니다.
          </p>
        </div>
      )}
      {/* 조합원입주권 모드 — 상단 축 A 숨김. 문구는 **조합원 유형에 따라 갈린다** (2026-08-23).
          종전에는 이 게이트에 `right_to_move_in`이 빠져 있어 상단 축 A가 그대로 보였는데,
          그 값은 실거래가 모드에서 **무시**되고(§166 섹션의 전용 필드가 정본) 감정·매매사례를
          고르면 취득가액이 **0**이 되어 오류 없이 과대과세됐다(계획서 §2.1 실측). */}
      {asset?.assetKind === "right_to_move_in" && (
        <div className="rounded-lg border border-violet-300 bg-violet-50/60 p-3 space-y-1.5">
          {asset?.isSuccessorRightToMoveIn ? (
            <>
              <p className="text-sm font-semibold text-violet-900">
                취득가액 — 승계취득 §97①1호 가목
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <LawArticleModal legalBasis="소득세법 §97 ① 1호" label="§97①1호" />
                <LawArticleModal legalBasis="소득세법 §95 ②" label="§95②" />
              </div>
              <p className="text-xs text-violet-800">
                시행령 §166①은 <b>조합에 기존건물과 그 부수토지를 제공하고 취득한</b> 조합원에게 적용됩니다.
                승계조합원은 제공한 사실이 없어 §166① 안분(인가전·인가후) 대상이 아니며, 취득가액은
                아래 <b>조합원입주권 승계취득 정보</b>에서 실지거래가액으로 입력합니다.
              </p>
              <p className="text-caption text-violet-700">
                ※ 장기보유특별공제는 적용되지 않습니다 (§95② — 조합원으로부터 취득한 것은 제외).
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-violet-900">
                취득가액 — 재개발 §166①1호 인가전 분에서 차감
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <LawArticleModal legalBasis="소득세법 시행령 §166 ① 1호" label="시행령 §166①1호" />
                <LawArticleModal legalBasis="소득세법 시행령 §166 ③" label="시행령 §166③" />
              </div>
              <p className="text-xs text-violet-800">
                조합원입주권 양도차익은 인가전 분(권리가액 − 종전 부동산 취득가액)과 인가후 분으로 나누어
                계산합니다. 종전 부동산의 취득가액은 아래 <b>⑤ 인가전 분 종전 부동산 취득가액</b>에서
                입력하므로, 상단 일반 &ldquo;취득가액 산정 방식·취득가액&rdquo; 입력은 표시하지 않습니다.
              </p>
              <p className="text-caption text-violet-700">
                ※ 취득가액을 확인할 수 없는 경우의 대체수단은 §166③ <b>환산</b>입니다(감정가액·매매사례가액 아님).
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}

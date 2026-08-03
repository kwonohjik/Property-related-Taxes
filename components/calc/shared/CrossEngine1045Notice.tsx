"use client";

/**
 * CrossEngine1045Notice — §104⑤ 비교과세가 **부동산 ↔ 기타자산**을 아우르지 못한다는 고지.
 *
 * 계획서: `docs/00-pm/cross-engine-104-5-real-estate-other-asset.plan.md` **C-1**
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────
 * 「소득세법」 §104⑤ 본문은 「해당 과세기간에 §94①**1호ㆍ2호 및 제4호**에서 규정한 자산을
 * **둘 이상 양도**하는 경우 … 다음 각 호의 금액 중 **큰 것**」이라 **부동산과 기타자산을
 * 원래 한 덩어리로** 본다. 그런데 이 앱은 부동산 엔진(`transfer-tax-aggregate`)과
 * 주식 엔진(`stock-transfer-aggregate`)이 분리돼 있어 **각자 자기 것만** 비교과세한다.
 *
 * | 조합 | §104⑤ |
 * |---|---|
 * | 부동산 2건 이상 | ✅ 적용 |
 * | 기타자산 2건 이상 | ✅ 적용 |
 * | **부동산 + 기타자산** | ❌ **미적용** |
 *
 * 실측(계획서 §3): 비사업용 토지 1건 + 비사업용 토지 과다소유법인 주식 1건에서
 * 두 계산기 결과를 단순히 더하면 **25,680,000원 과소**다.
 *
 * ⚠️ **이 컴포넌트는 세액을 고치지 않는다** — 고치는 것은 C-2(조정 레이어)다.
 *   여기서는 **오답을 오답으로 알리는 것**이 목적이다.
 *
 * 📌 노출은 **좁게** 한다(계획서 R-5 — 오탐이 사용자를 불필요하게 불안하게 한다):
 *   부동산 결과는 **비사업용 토지가 있을 때만**, 주식 결과는 **기타자산일 때만**.
 *   다만 §104⑤ 자체는 비사업용 토지가 아니어도 걸리므로 **본문에 그 사실을 적는다**
 *   (노출은 좁게, 정보는 정확하게).
 */

import Link from "next/link";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Button } from "@/components/ui/button";
import { LawArticleModal } from "@/components/ui/law-article-modal";

export function CrossEngine1045Notice({
  /** 어느 계산기에서 띄우는가 — 문구의 「반대편」이 달라진다 */
  from,
}: {
  from: "real_estate" | "other_asset";
}) {
  const counterpart =
    from === "real_estate"
      ? "기타자산(과점주주·부동산과다보유법인 주식 등)"
      : "부동산·부동산에 관한 권리";

  return (
    <ToneCard
      tone="amber"
      title="같은 과세기간에 다른 자산도 양도하셨다면 확인이 필요합니다"
      titleExtra={<LawArticleModal legalBasis="소득세법 §104 ⑤" label="§104⑤" />}
      className="print:hidden"
    >
      <p className="text-sm">
        <LawArticleModal legalBasis="소득세법 §104 ⑤" label="§104⑤" /> 비교과세는 같은 과세기간에
        <strong> 부동산·부동산에 관한 권리·기타자산</strong>을 둘 이상 양도하면 이를{" "}
        <strong>모두 합쳐</strong> 「과세표준 합계액에 기본세율을 적용한 세액」과 「호별로 합산한
        세액의 합계」 중 <strong>큰 금액</strong>을 산출세액으로 하도록 정하고 있습니다.
      </p>
      <p className="text-sm">
        이 계산기는 <strong>{counterpart}</strong>의 양도를 함께 계산하지 못합니다. 같은 과세기간에
        그 자산도 양도하셨다면 <strong>이 결과만으로는 세액이 과소</strong>할 수 있으니 세무대리인의
        확인을 받으시기 바랍니다.
      </p>
      <p className="text-caption text-muted-foreground">
        특히 <strong>비사업용 토지</strong>와 <strong>비사업용 토지 과다소유법인 주식</strong>은
        §104⑤ 본문 후단이 <strong>「동일한 자산으로 보아」</strong> 계산하도록 정하고 있어 차이가
        커집니다. 비사업용 토지가 아니더라도 부동산과 기타자산을 함께 양도했다면 §104⑤ 합산
        대상입니다.
      </p>
      {/*
        C-3c 진입점 — 종전에는 이 카드가 「과소일 수 있다」까지만 말하고 **막다른 길**이었다.
        합산 화면은 **저장된 이력**에서 반대편 계산을 골라 §104⑤을 낸다(숫자 입력 0칸).
      */}
      <div className="pt-1">
        <Link href="/calc/cross-104-5">
          <Button variant="outline" size="sm">
            §104⑤ 합산 계산하기
          </Button>
        </Link>
      </div>
    </ToneCard>
  );
}

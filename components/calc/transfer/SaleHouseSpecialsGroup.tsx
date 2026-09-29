import type { ReactNode } from "react";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";

/**
 * 판정 메뉴 ③ — **양도 대상 주택에 적용할 특례** 소제목 묶음.
 *
 * §154① 단서 · §155⑱ · §156의2⑤는 모두 양도하는 주택에 붙는 특례지만 ② 양도 대상 화면으로
 * 옮기지 않는다 — 셋 다 노출 여부나 선택지가 **③ 명부에서 파생**되기 때문이다
 * (`Step2.tsx`의 §154① 단서 주석). 위치는 ③에 두고, 무엇에 적용되는지만 소제목으로 밝힌다.
 *
 * 🔑 일시적 2주택 섹션 안(2주택 이상)과 밖(1주택)의 두 곳이 쓴다 — 두 곳의 문구가 갈리지 않게 한 벌.
 */
export function SaleHouseSpecialsGroup({ children }: { children: ReactNode }) {
  return (
    <div data-testid="sale-house-specials" className="space-y-3">
      <SectionHeader
        title="양도 대상 주택에 적용할 특례"
        description="② 단계에서 입력한 양도 대상 주택에 적용됩니다. 보유 주택 목록에 따라 적용 여부가 달라져 이 화면에서 입력합니다."
      />
      {children}
    </div>
  );
}

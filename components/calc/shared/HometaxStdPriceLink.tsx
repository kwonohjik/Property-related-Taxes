"use client";

/**
 * 국세청 홈택스 "기준시가 > 오피스텔 및 상업용 건물" 조회 화면 새 탭 링크.
 *
 * 자동조회(호별 고시가)가 막히거나 아예 없는 입력 지점에서 사용자가 직접 고시가를
 * 확인할 수 있게 하는 보조 경로. 값을 자동으로 채우지 않는다(수기 입력 유지).
 *
 * ⚠️ 이 기준시가는 **국세인 양도·상속·증여세** 과세기준이다 — 지방세(취득세·재산세)
 * 화면에는 붙이지 않는다(홈택스 안내문 명시).
 */

import { buttonVariants } from "@/components/ui/button";

/**
 * 홈택스는 WebSquare SPA라 **메뉴 트리 파라미터(tmIdx·tm2lIdx·tm3lIdx)만** 딥링크로 복원된다.
 * 주소창에서 복사한 `menuCd=search&searchInfo<숫자>` 형태는 세션마다 발급되는 검색결과 토큰이라
 * 다른 브라우저에서 열면 메인(menuCd=index3)으로 떨어진다 — 붙여넣지 말 것.
 * 아래 값은 "상담·불복·고충·제보·기타 > 기준시가 조회 > 오피스텔 및 상업용 건물" 경로.
 */
export const HOMETAX_STD_PRICE_URL =
  "https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&tmIdx=47&tm2lIdx=4712090000&tm3lIdx=4712090300";

export function HometaxStdPriceLink({ className }: { className?: string }) {
  return (
    <a
      href={HOMETAX_STD_PRICE_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="국세청 홈택스 기준시가(오피스텔·상업용 건물) 조회 페이지를 새 탭에서 엽니다"
      data-testid="hometax-stdprice-link"
      className={buttonVariants({ variant: "outline", size: "xs", className })}
    >
      홈택스에서 조회 ↗
    </a>
  );
}

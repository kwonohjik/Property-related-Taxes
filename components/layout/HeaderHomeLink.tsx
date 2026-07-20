"use client";

import { usePathname } from "next/navigation";
import { HomeButton } from "@/components/calc/shared/HomeButton";

/**
 * 헤더용 홈으로 링크 — 계산 이력(/history) 페이지에서만 의뢰인 배너 왼쪽에 표시.
 * 마법사 계산기 페이지는 자체 홈 버튼(HomeButton)이 있어 헤더에는 노출하지 않는다.
 */
export function HeaderHomeLink() {
  const pathname = usePathname();
  if (pathname !== "/history") return null;
  return <HomeButton />;
}

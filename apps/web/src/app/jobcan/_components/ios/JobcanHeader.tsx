"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { JOBCAN_TABS, type JobcanTab } from "@management/shift-management/ui";
import { IOS, iosType } from "../../_lib/tokens";
import { IosIcon, type IosIconName } from "./IosIcon";

const TAB_ICON: Record<JobcanTab["key"], IosIconName> = {
  home: "home",
  import: "import",
  staff: "staff",
};

/** パスから現在タブを判定(/jobcan/home→home, /jobcan/staff→staff, /jobcan→import)。 */
function activeKey(pathname: string): JobcanTab["key"] {
  if (pathname.startsWith("/jobcan/home")) return "home";
  if (pathname.startsWith("/jobcan/staff")) return "staff";
  return "import";
}

/**
 * 3 画面共通の上部ヘッダ + タブ(ホーム/取込/名簿)。回遊の要。
 * sticky・現在地ハイライト。タブは既存 3 ルートへの next/link(ルーティング不変)。
 * ?code= 等の deep link は各ページ側で処理され、ここは触らない。
 */
export function JobcanHeader() {
  const pathname = usePathname() ?? "/jobcan";
  const current = activeKey(pathname);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(255,255,255,0.82)",
        backdropFilter: "saturate(180%) blur(18px)",
        WebkitBackdropFilter: "saturate(180%) blur(18px)",
        borderBottom: `0.5px solid ${IOS.color.separator}`,
      }}
    >
      <div style={{ maxWidth: IOS.metrics.maxWidth, margin: "0 auto", padding: "10px 16px 0" }}>
        <div style={{ ...iosType("subhead"), fontWeight: 700, letterSpacing: "-0.2px" }}>
          ジョブカン連携<span style={{ color: IOS.color.blue }}>.</span>
        </div>
        <nav style={{ display: "flex", gap: 4, marginTop: 8 }}>
          {JOBCAN_TABS.map((tab) => {
            const isActive = tab.key === current;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  ...iosType("footnote"),
                  padding: "8px 4px 10px",
                  textDecoration: "none",
                  fontWeight: 600,
                  color: isActive ? IOS.color.blue : IOS.color.secondaryLabel,
                  borderBottom: `2px solid ${isActive ? IOS.color.blue : "transparent"}`,
                }}
              >
                <IosIcon name={TAB_ICON[tab.key]} size={22} />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

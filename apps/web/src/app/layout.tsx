import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "web",
  description: "management monorepo — web app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

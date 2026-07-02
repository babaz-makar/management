import { FeatureA } from "@management/feature-a";
import { FeatureB } from "@management/feature-b";
import { FeatureC } from "@management/feature-c";
import { FeatureD } from "@management/feature-d";

export default function Home() {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "3rem 1.5rem",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <h1 style={{ marginBottom: ".25rem" }}>management</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        4機能のプレビュー用ホスト。各機能は <code>packages/feature-*</code> に自己完結しており、
        本アプリへはフォルダごとコピーして結合できます。
      </p>
      <div style={{ display: "grid", gap: "1rem", marginTop: "2rem" }}>
        <FeatureA />
        <FeatureB />
        <FeatureC />
        <FeatureD />
      </div>
    </main>
  );
}

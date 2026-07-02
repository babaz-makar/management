export type FeatureCProps = {
  title?: string;
};

/**
 * Feature C — 本アプリへ移植する単位。
 * 外部依存は react のみ。src/ をそのまま本アプリの src/features/feature-c/ にコピーして結合できます。
 */
export function FeatureC({ title = "Feature C" }: FeatureCProps) {
  return (
    <section
      style={{
        border: "1px solid #e2e2e2",
        borderRadius: 12,
        padding: "1.25rem 1.5rem",
      }}
    >
      <h2 style={{ margin: "0 0 .5rem", fontSize: "1.1rem" }}>{title}</h2>
      <p style={{ margin: 0, color: "#666" }}>
        <code>@management/feature-c</code> の中身をここに実装します。
      </p>
    </section>
  );
}

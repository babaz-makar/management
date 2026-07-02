export type FeatureBProps = {
  title?: string;
};

/**
 * Feature B — 本アプリへ移植する単位。
 * 外部依存は react のみ。src/ をそのまま本アプリの src/features/feature-b/ にコピーして結合できます。
 */
export function FeatureB({ title = "Feature B" }: FeatureBProps) {
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
        <code>@management/feature-b</code> の中身をここに実装します。
      </p>
    </section>
  );
}

export type ToolTemplateProps = {
  title?: string;
};

/**
 * ツールのお手本コンポーネント。
 * 新しいツールを作るときは packages/_template をコピーして packages/{ツール名} にリネームし、
 * この中身を実装してください。外部依存は react のみに抑えます。
 */
export function ToolTemplate({ title = "Tool Template" }: ToolTemplateProps) {
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
        ここにツールの中身を実装します。
      </p>
    </section>
  );
}

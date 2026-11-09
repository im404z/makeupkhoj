export default function Loading() {
  return (
    <div className="route-loader" role="status">
      <p><span className="route-loader__spinner" aria-hidden="true" />Loading page…</p>
    </div>
  );
}

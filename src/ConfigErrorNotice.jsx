function ConfigErrorNotice({ message }) {
  return (
    <div className="config-error">
      <div className="config-error-card">
        <h1>Configuration required</h1>
        <p className="helper-text">{message}</p>
        <p className="helper-text">
          Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your
          <code>.env</code> file (see <code>README.md</code>), then restart the dev server.
        </p>
      </div>
    </div>
  );
}

export default ConfigErrorNotice;

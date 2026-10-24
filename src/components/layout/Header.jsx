export default function Header({ stalkedUser, onReset }) {
  return (
    <header className="header">
      <div className="logo" onClick={onReset} role="button" tabIndex={0}>
        Reddit Stalker <span>Dashboard</span>
      </div>
      {stalkedUser && (
        <button className="header-reset-btn" onClick={onReset}>
          ← Search Another
        </button>
      )}
    </header>
  );
}

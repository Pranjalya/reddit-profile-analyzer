export default function InteractionsTab({
  stalkedUser,
  onSelectUser,
}) {
  const interactions = stalkedUser.interactions || [];
  const validUsers = interactions.filter((u) => u && u.author !== '[deleted]');

  const handleSnoopNewTab = (e, author) => {
    e.stopPropagation();
    const url = new URL(window.location.href);
    url.searchParams.set('user', author);
    window.open(url.toString(), '_blank');
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      <h3 className="tab-title">Stalking Connections</h3>
      <p className="tab-subtitle">
        Lists Reddit users they have engaged with most. Click a card to view interaction comments, or click &quot;Snoop in new tab&quot; to analyze that target!
      </p>

      <div className="interactions-list" style={{ marginTop: '1.5rem' }}>
        {validUsers.map((user) => (
          <div
            key={user.author}
            className="glass-panel interaction-card"
            onClick={() => onSelectUser(user.author)}
          >
            <div>
              <span className="interaction-username">u/{user.author}</span>
              <p className="rabbit-hole-prompt" style={{ marginBottom: '0.4rem' }}>
                View interaction comments →
              </p>
              <button
                className="snoop-new-tab-btn"
                onClick={(e) => handleSnoopNewTab(e, user.author)}
                title={`Open u/${user.author} profile in a new tab`}
              >
                Snoop this user in new tab ↗
              </button>
            </div>
            <div className="interaction-details">
              <span className="interaction-count">{user.count}</span>
              <span className="interaction-lbl">interactions</span>
            </div>
          </div>
        ))}
        {validUsers.length === 0 && (
          <div
            style={{
              gridColumn: '1/-1',
              textAlign: 'center',
              padding: '3rem',
              color: 'var(--text-secondary)',
            }}
          >
            No interaction partners indexed for this user.
          </div>
        )}
      </div>
    </div>
  );
}

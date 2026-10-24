export default function Sidebar({
  stalkedUser,
  activeTab,
  setActiveTab,
  feedCount = 0,
}) {
  const avatarFallback = 'https://www.redditstatic.com/avatars/defaults/v2/avatar_default_0.png';

  return (
    <div className="sidebar">
      <div className="glass-panel profile-card">
        <div className="profile-avatar-wrapper">
          <img
            src={stalkedUser.profileImg || avatarFallback}
            alt={`${stalkedUser.username} Avatar`}
            className="profile-avatar"
            onError={(e) => { e.target.src = avatarFallback; }}
          />
        </div>
        <h2 className="profile-name">u/{stalkedUser.username}</h2>
        {stalkedUser.fullname && <p className="profile-id">ID: {stalkedUser.fullname}</p>}

        <div className="profile-stats-row">
          <div className="stat-item">
            <span className="stat-val">{stalkedUser.stats?.totalComments ?? 0}</span>
            <span className="stat-lbl">Comments</span>
          </div>
          <div className="stat-item">
            <span className="stat-val">{stalkedUser.stats?.totalPosts ?? 0}</span>
            <span className="stat-lbl">Posts</span>
          </div>
        </div>
      </div>

      <nav className="dashboard-nav">
        <button
          className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview & Schedule
        </button>
        <button
          className={`nav-tab ${activeTab === 'feed' ? 'active' : ''}`}
          onClick={() => setActiveTab('feed')}
        >
          🕵️ Stalker Snooper Feed ({feedCount})
        </button>
        <button
          className={`nav-tab ${activeTab === 'subreddits' ? 'active' : ''}`}
          onClick={() => setActiveTab('subreddits')}
        >
          📍 Subreddits & Flairs ({stalkedUser.subreddits?.length ?? 0})
        </button>
        <button
          className={`nav-tab ${activeTab === 'interactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('interactions')}
        >
          🤝 Social Network ({stalkedUser.interactions?.length ?? 0})
        </button>
      </nav>
    </div>
  );
}

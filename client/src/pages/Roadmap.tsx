export default function Roadmap() {
  return (
    <div className="roadmap-page">
      <div className="roadmap-content">
        <div className="roadmap-section">
          <h3>Get Involved</h3>
          <p>
            Penny's Arcade is built in the open and welcomes contributions from
            developers, designers, and gamers who want to help shape the experience.
          </p>
          <p>
            Check out the project on GitHub to report bugs, suggest features, or submit
            pull requests.
          </p>
          <a
            href="https://github.com/pennys-arcade"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            View on GitHub
          </a>
        </div>

        <div className="roadmap-section">
          <h3>Planned Features</h3>

          <div className="roadmap-category">
            <h4>Profiles & Customization</h4>
            <ul className="roadmap-list">
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Custom avatar uploads
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Profile badges and achievements
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Player statistics dashboard
              </li>
            </ul>
          </div>

          <div className="roadmap-category">
            <h4>Social Features</h4>
            <ul className="roadmap-list">
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Direct messages between players
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Friends list
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Trophies and awards system
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Challenge friends to beat your score
              </li>
            </ul>
          </div>

          <div className="roadmap-category">
            <h4>Games & Content</h4>
            <ul className="roadmap-list">
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                More arcade games
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Weekly challenges
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Tournaments and events
              </li>
            </ul>
          </div>

          <div className="roadmap-category">
            <h4>Platform</h4>
            <ul className="roadmap-list">
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Mobile-friendly layout
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Notification system
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Dark/light theme toggle
              </li>
            </ul>
          </div>
        </div>

        <div className="roadmap-section">
          <h3>Want to Contribute?</h3>
          <p>
            Whether you're a developer who wants to add features, an artist who can
            create game assets, or just someone with great ideas - we'd love your help!
          </p>
          <p>
            Fork the repo, submit a pull request, and help make Penny's Arcade even better.
          </p>
        </div>
      </div>
    </div>
  )
}

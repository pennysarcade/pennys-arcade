export default function About() {
  return (
    <div className="about-page">
      <div className="about-content">
        <section className="about-section">
          <h2>The Vision</h2>
          <p>
            The social spaces of the early internet were bound by shared obsessions.
            Communities formed because they wanted to, and in those spaces a kind of
            self-policing, anarchic freedom prevailed. They were chaotic, but they
            felt real and alive. By comparison, today's internet is stale; it's been
            sanitised, consolidated and siloed.
          </p>

          <p>
            Penny's Arcade is my attempt to build a third place optimised for fun
            and connection. This is a place to hang out, make friends and mash buttons.
            To the extent that anything here is monetised, it's to keep the lights on,
            not to hollow out the fundamentals in pursuit of infinite growth.
          </p>

          <p>
            The ultimate ambition is for Penny's Arcade to become a platform where
            anyone can publish and distribute their web games — a social network
            built around play. A place where indie developers can share their
            creations and players can discover something new.
          </p>

          <div className="manifesto-signature">
            <span className="signature-dash">—</span>
            <span className="signature-name">Penny xox</span>
          </div>
        </section>

        <section className="about-section">
          <h2>Get Involved</h2>
          <p>
            Penny's Arcade is built in the open and welcomes contributions from
            developers, designers, and gamers who want to help shape the experience.
          </p>
          <p>
            Check out the project on GitHub to report bugs, suggest features, or submit
            pull requests.
          </p>
          <a
            href="https://github.com/dan057/pennys-arcade"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            View on GitHub
          </a>
        </section>

        <section className="about-section">
          <h2>What's Next</h2>

          <div className="roadmap-category">
            <h3>Social Features</h3>
            <ul className="roadmap-list">
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Friends list and direct messages
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Profile badges and achievements
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Challenge friends to beat your score
              </li>
            </ul>
          </div>

          <div className="roadmap-category">
            <h3>Games & Content</h3>
            <ul className="roadmap-list">
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                More arcade games
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Weekly challenges and tournaments
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                User-submitted games
              </li>
            </ul>
          </div>

          <div className="roadmap-category">
            <h3>Platform</h3>
            <ul className="roadmap-list">
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Mobile-friendly layout
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Game developer tools and SDK
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}

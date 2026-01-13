export default function About() {
  return (
    <div className="about-page">
      <div className="about-content">
        <section className="about-section">
          <p className="about-welcome">Welcome to Penny's Arcade.</p>

          <p>
            This is a solo project, built on evenings and weekends. The aim is to
            recreate a sense of what the internet used to be like, and to inspire
            others to nudge it in that direction again.
          </p>

          <p>
            The social spaces of the early internet formed around shared passions,
            and in those spaces a kind of self-policing, anarchic freedom prevailed.
            They were chaotic, but they felt real.
          </p>

          <p>
            The platforms that dominate today are designed to hold your attention
            for as long as possible, and they'll enrage or stupefy you until they
            succeed. The communities that form on them feel transient and disposable.
            I'm hoping to build something more durable (complete with regulars, and
            inside jokes that develop over months) and give a few people a place
            they feel like they belong.
          </p>

          <p>
            Penny's Arcade is my attempt to build something different: a third place
            optimised for play. A space to hang out, make friends, and mash buttons.
            To the extent that anything here is ever monetised, it's to keep the
            lights on, not to hollow out the fundamentals in pursuit of infinite
            growth.
          </p>

          <p>
            Right now, it's a chat window and a couple of arcade games. But the
            ambition is larger: for this to become a platform where anyone can
            publish and distribute their web games. A social network built around
            having fun and sharing it. A place where indie developers can release
            their creations and players can discover something new.
          </p>

          <p>We're not there yet. But we're building toward it.</p>

          <p>If you want to know more or just say hello, you can find me in the chat.</p>

          <div className="manifesto-signature">
            <span className="signature-dash">–</span>
            <span className="signature-name">Penny</span>
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
            href="https://github.com/pennysarcade/pennys-arcade"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            View on GitHub
          </a>
        </section>

        <section className="about-section">
          <h2>Roadmap</h2>

          <div className="roadmap-category">
            <h3>Games</h3>
            <ul className="roadmap-list">
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                More arcade games
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Multiplayer options
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                User-submitted games
              </li>
            </ul>
          </div>

          <div className="roadmap-category">
            <h3>Social Features</h3>
            <ul className="roadmap-list">
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Add friends
              </li>
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Private messaging
              </li>
            </ul>
          </div>

          <div className="roadmap-category">
            <h3>Platform</h3>
            <ul className="roadmap-list">
              <li className="roadmap-item">
                <span className="roadmap-status planned">Planned</span>
                Currency system
                <p className="roadmap-description">
                  Earn coins by playing games and spend them on upgrades, cosmetics,
                  and other rewards across the platform.
                </p>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}

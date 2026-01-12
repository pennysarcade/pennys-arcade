export default function Privacy() {
  return (
    <div className="privacy-page">
      <h1>Privacy Policy</h1>
      <p className="privacy-updated">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>

      <section>
        <h2>What We Collect</h2>
        <p>When you create an account, we collect:</p>
        <ul>
          <li><strong>Email address</strong> - for account verification and recovery</li>
          <li><strong>Username</strong> - your display name on the site</li>
          <li><strong>Password</strong> - stored securely using one-way encryption (bcrypt)</li>
        </ul>
        <p>When you use the site, we collect:</p>
        <ul>
          <li><strong>Game scores and statistics</strong> - to display on leaderboards</li>
          <li><strong>Chat messages</strong> - messages you send in public chat</li>
          <li><strong>Server logs</strong> - IP addresses and access times for security purposes</li>
        </ul>
      </section>

      <section>
        <h2>Why We Collect It</h2>
        <ul>
          <li>To create and manage your account</li>
          <li>To verify your email address</li>
          <li>To display your scores on leaderboards</li>
          <li>To enable chat functionality</li>
          <li>To prevent abuse and maintain security</li>
        </ul>
      </section>

      <section>
        <h2>How We Store It</h2>
        <p>Your data is stored on secure servers provided by Railway (railway.app). Passwords are encrypted and cannot be viewed by anyone, including us.</p>
      </section>

      <section>
        <h2>What We Don't Do</h2>
        <ul>
          <li>We don't sell your data to anyone</li>
          <li>We don't share your data with third parties for marketing</li>
          <li>We don't use cookies or tracking scripts</li>
          <li>We don't send promotional emails</li>
        </ul>
      </section>

      <section>
        <h2>Third-Party Services</h2>
        <ul>
          <li><strong>Discord</strong> - if you log in with Discord, we receive your Discord username and ID</li>
          <li><strong>Resend</strong> - we use Resend to send verification emails</li>
        </ul>
      </section>

      <section>
        <h2>Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Request a copy of your data</li>
          <li>Request deletion of your account and data</li>
          <li>Update or correct your information</li>
        </ul>
        <p>To exercise these rights, contact us at admin [at] pennysarcade [dot] games</p>
      </section>

      <section>
        <h2>Age Requirement</h2>
        <p>You must be at least 13 years old to create an account.</p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Questions about this policy? Email admin [at] pennysarcade [dot] games</p>
      </section>
    </div>
  )
}

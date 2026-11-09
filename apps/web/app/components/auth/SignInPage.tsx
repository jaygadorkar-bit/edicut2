import { Link } from "react-router";

export function SignInPage({ error }: { error?: string | null }) {
  return (
    <main className="auth-page">
      <div className="auth-layout">
        <section className="auth-card" aria-labelledby="signin-heading">
          <div className="auth-topbar">
            <Link to="/" className="auth-brand" aria-label="EdiCut home">
              <img src="/icons/edicut-logo.svg" alt="EdiCut" />
            </Link>
            <Link to="/" className="auth-home-link">Back to EdiCut</Link>
          </div>

          <div className="auth-heading">
            <h1 id="signin-heading">Welcome back</h1>
            <p>Sign in to pick up where your next great video begins.</p>
          </div>

          <form method="post" action="/auth/google" className="auth-google-form">
            <input type="hidden" name="returnTo" value="/dashboard" />
            <button type="submit" className="auth-button auth-button--primary">
              <img src="/icons/google-g.png" alt="" className="auth-google-icon" />
              <span>Continue with Google</span>
            </button>
          </form>
          {error ? <p className="auth-alert auth-alert--error" role="alert">{error}</p> : null}
          <p className="auth-legal">
            By continuing, you agree to EdiCut’s <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}

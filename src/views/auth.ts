// Sign in, create account, reset password, and choosing a new password from the reset email.
import { supabase } from '../cloud';
import { go, render, state, type AuthMode, type Handlers, type Screen } from '../core';
import { esc } from '../html';
import { header, icon } from '../ui';

type AuthScreen = Extract<Screen, { name: 'auth' }>;

const appUrl = () => location.origin + location.pathname;

export function authView(s: AuthScreen): string {
  const tab = (m: AuthMode, label: string) => `<button data-act="auth-mode" data-mode="${m}" class="${s.mode === m ? 'on' : ''}">${label}</button>`;
  const reset = s.mode === 'reset';
  return `${header('Fit Diary')}<main>
    <div class="brand">${icon('food')}<p>Track food, exercise and weight.<br>Reach your goal.</p></div>
    ${reset ? '' : `<div class="seg">${tab('signin', 'Sign in')}${tab('signup', 'Create account')}</div>`}
    <section class="card">
      ${reset ? '<h2>Reset password</h2><p class="muted">We will email you a link to choose a new password.</p>' : ''}
      <form data-form="auth" class="stack">
        <label>Email<input name="email" type="email" autocomplete="email" required></label>
        ${reset ? '' : `<label>Password<input name="password" type="password" minlength="6" required
          autocomplete="${s.mode === 'signup' ? 'new-password' : 'current-password'}"></label>`}
        <button class="primary" ${s.busy ? 'disabled' : ''}>${{ signin: 'Sign in', signup: 'Create account', reset: 'Send reset email' }[s.mode]}</button>
      </form>
      ${s.message ? `<p class="notice" role="status">${esc(s.message)}</p>` : ''}
      ${reset
        ? '<button class="link" data-act="auth-mode" data-mode="signin">Back to sign in</button>'
        : '<button class="link" data-act="auth-mode" data-mode="reset">Forgot password?</button>'}
    </section>
    <p class="muted center">Your diary is private to your account.</p>
  </main>`;
}

export function newPassView(s: Extract<Screen, { name: 'newpass' }>): string {
  return `${header('Choose a new password')}<main><section class="card">
    <form data-form="newpass" class="stack">
      <label>New password<input name="password" type="password" minlength="6" autocomplete="new-password" required></label>
      <label>Repeat it<input name="again" type="password" minlength="6" autocomplete="new-password" required></label>
      <button class="primary">Save password</button>
    </form>
    ${s.message ? `<p class="notice" role="status">${esc(s.message)}</p>` : ''}
  </section></main>`;
}

async function submitAuth(s: AuthScreen, email: string, password: string): Promise<void> {
  s.busy = true;
  render();
  let message = '';
  if (s.mode === 'signin') {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) message = error.message;
  } else if (s.mode === 'signup') {
    const { data: r, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } });
    if (error) message = error.message;
    else if (!r.session) {
      s.mode = 'signin';
      message = `We sent a confirmation link to ${email}. Tap it, then sign in here.`;
    }
  } else {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
    message = error ? error.message : 'If that email has an account, a reset link is on its way.';
  }
  s.busy = false;
  s.message = message;
  if (state.screen === s) render();
}

export const handlers: Handlers = {
  actions: {
    'auth-mode': (el) => {
      if (state.screen.name === 'auth') Object.assign(state.screen, { mode: el.dataset.mode as AuthMode, message: '' });
      render();
    },
  },
  forms: {
    auth: (fd) => {
      const s = state.screen;
      if (s.name !== 'auth' || s.busy) return;
      submitAuth(s, String(fd.get('email')).trim(), String(fd.get('password') ?? ''));
    },
    newpass: (fd) => {
      const s = state.screen;
      if (s.name !== 'newpass') return;
      if (fd.get('password') !== fd.get('again')) {
        s.message = 'The two passwords are different.';
        return render();
      }
      supabase.auth.updateUser({ password: String(fd.get('password')) }).then(({ error }) => {
        if (error) {
          s.message = error.message;
          if (state.screen === s) render();
        } else {
          state.notice = 'Password changed.';
          go({ name: 'home' });
        }
      });
    },
  },
};

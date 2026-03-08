/**
 * LoginFormController — manages the real HTML login form overlay
 * so that browser password managers can detect, autofill, and save credentials.
 *
 * Supports two modes:
 *   "login" — validate via CP_LOGIN (proxy intercepts and checks realm controller)
 *   "register" — POST /api/auth/register, then proceed to login
 */

import { NetrekConnection } from './net';
import { GameState } from './state';

type FormMode = 'login' | 'register';

export class LoginFormController {
  private form: HTMLFormElement;
  private nameInput: HTMLInputElement;
  private emailInput: HTMLInputElement;
  private passwordInput: HTMLInputElement;
  private submitBtn: HTMLButtonElement;
  private toggleBtn: HTMLButtonElement;
  private statusEl: HTMLElement;
  private net: NetrekConnection;
  private state: GameState;
  private onSubmit: () => void;
  private _visible = false;
  private mode: FormMode = 'login';

  constructor(net: NetrekConnection, state: GameState, onSubmit: () => void) {
    this.net = net;
    this.state = state;
    this.onSubmit = onSubmit;

    this.form = document.getElementById('login-form') as HTMLFormElement;
    this.nameInput = document.getElementById('login-name') as HTMLInputElement;
    this.emailInput = document.getElementById('login-email') as HTMLInputElement;
    this.passwordInput = document.getElementById('login-password') as HTMLInputElement;
    this.submitBtn = document.getElementById('login-submit-btn') as HTMLButtonElement;
    this.toggleBtn = document.getElementById('login-toggle') as HTMLButtonElement;
    this.statusEl = document.getElementById('login-status') as HTMLElement;

    // Prevent game keyboard handler from intercepting typing in form inputs
    for (const el of [this.nameInput, this.emailInput, this.passwordInput]) {
      el.addEventListener('keydown', (e) => e.stopPropagation());
      el.addEventListener('keyup', (e) => e.stopPropagation());
    }

    // Toggle between login and register modes
    this.toggleBtn.addEventListener('click', () => {
      this.setMode(this.mode === 'login' ? 'register' : 'login');
    });

    // Let the form submit natively to a hidden iframe (triggers password manager save)
    // then handle the login via WebSocket
    this.form.addEventListener('submit', (e) => {
      if (this.mode === 'register') {
        e.preventDefault(); // Prevent native submit for registration
        this.handleRegister();
      } else {
        this.handleLogin();
        // Do NOT preventDefault — native submit to hidden iframe triggers password save
      }
    });
  }

  get isVisible(): boolean {
    return this._visible;
  }

  show() {
    this.form.classList.add('login-visible');
    this._visible = true;
    this.clearStatus();
    // Defer focus to next frame so the Enter keypress that triggered show()
    // doesn't propagate to the input and auto-submit the form
    requestAnimationFrame(() => {
      if (this.nameInput.value) {
        this.passwordInput.focus();
      } else {
        this.nameInput.focus();
      }
    });
  }

  hide() {
    this.form.classList.remove('login-visible');
    this._visible = false;
  }

  reset() {
    this.nameInput.value = '';
    this.emailInput.value = '';
    this.passwordInput.value = '';
    this.clearStatus();
    this.setMode('login');
  }

  /** Clear password only (for login retry — keep username) */
  clearPassword() {
    this.passwordInput.value = '';
  }

  /** Re-show the form with an error message (called on login rejection) */
  showError(msg: string) {
    this.form.classList.add('login-visible');
    this._visible = true;
    this.showStatus(msg);
    this.passwordInput.value = '';
    requestAnimationFrame(() => this.passwordInput.focus());
  }

  private setMode(mode: FormMode) {
    this.mode = mode;
    if (mode === 'register') {
      this.form.classList.add('login-register');
      this.submitBtn.textContent = 'Register';
      this.toggleBtn.textContent = 'Have an account? Login';
      this.passwordInput.autocomplete = 'new-password';
    } else {
      this.form.classList.remove('login-register');
      this.submitBtn.textContent = 'Login';
      this.toggleBtn.textContent = 'New player? Register';
      this.passwordInput.autocomplete = 'current-password';
    }
    this.clearStatus();
  }

  private showStatus(msg: string, isError = true) {
    this.statusEl.textContent = msg;
    this.statusEl.style.color = isError ? '#f44' : '#0f0';
  }

  private clearStatus() {
    this.statusEl.textContent = '';
  }

  private async handleRegister() {
    const name = this.nameInput.value.trim();
    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;

    if (!name || name.length < 2) {
      this.showStatus('Name must be at least 2 characters');
      return;
    }
    if (!password) {
      this.showStatus('Password is required');
      return;
    }

    this.showStatus('Registering...', false);
    this.submitBtn.disabled = true;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: email || undefined, password }),
      });
      const data = await res.json();

      if (!data.ok) {
        this.showStatus(data.error || 'Registration failed');
        this.submitBtn.disabled = false;
        return;
      }

      // Success — switch to login mode and auto-login
      this.setMode('login');
      this.showStatus('Registered! Logging in...', false);
      this.nameInput.value = name;
      this.passwordInput.value = password;

      // Proceed with normal login flow
      setTimeout(() => {
        this.submitBtn.disabled = false;
        this.handleLogin();
      }, 300);
    } catch {
      this.showStatus('Network error — try again');
      this.submitBtn.disabled = false;
    }
  }

  private handleLogin() {
    const name = this.nameInput.value.trim() || 'guest';
    const password = this.passwordInput.value;

    this.net.sendLogin(name, password, name);
    this.net.sendUpdates(50000);
    this.state.warningText = `Logging in as ${name}...`;
    this.state.warningTime = Date.now();

    // Use PasswordCredential API if available to explicitly trigger password save
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    if (password && typeof win.PasswordCredential === 'function') {
      const Ctor = win.PasswordCredential as new (opts: {
        id: string; password: string; name: string;
      }) => Credential;
      const cred = new Ctor({ id: name, password, name });
      navigator.credentials.store(cred).catch(() => {});
    }

    this.onSubmit();

    // Longer delay before hiding so password managers can capture the submission
    setTimeout(() => this.hide(), 600);
  }
}

/**
 * LoginFormController — manages the real HTML login form overlay
 * so that browser password managers can detect, autofill, and save credentials.
 */

import { NetrekConnection } from './net';
import { GameState } from './state';

export class LoginFormController {
  private form: HTMLFormElement;
  private nameInput: HTMLInputElement;
  private passwordInput: HTMLInputElement;
  private net: NetrekConnection;
  private state: GameState;
  private onSubmit: () => void;
  private _visible = false;

  constructor(net: NetrekConnection, state: GameState, onSubmit: () => void) {
    this.net = net;
    this.state = state;
    this.onSubmit = onSubmit;

    this.form = document.getElementById('login-form') as HTMLFormElement;
    this.nameInput = document.getElementById('login-name') as HTMLInputElement;
    this.passwordInput = document.getElementById('login-password') as HTMLInputElement;

    // Prevent game keyboard handler from intercepting typing in form inputs
    for (const el of [this.nameInput, this.passwordInput]) {
      el.addEventListener('keydown', (e) => e.stopPropagation());
      el.addEventListener('keyup', (e) => e.stopPropagation());
    }

    // Let the form submit natively to a hidden iframe (triggers password manager save)
    // then handle the login via WebSocket
    this.form.addEventListener('submit', () => {
      this.handleSubmit();
      // Do NOT preventDefault — native submit to hidden iframe triggers password save
    });
  }

  get isVisible(): boolean {
    return this._visible;
  }

  show() {
    this.form.classList.add('login-visible');
    this._visible = true;
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
    this.passwordInput.value = '';
  }

  /** Clear password only (for login retry — keep username) */
  clearPassword() {
    this.passwordInput.value = '';
  }

  private handleSubmit() {
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

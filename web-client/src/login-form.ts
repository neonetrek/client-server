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

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });
  }

  get isVisible(): boolean {
    return this._visible;
  }

  show() {
    this.form.style.display = 'flex';
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
    this.form.style.display = 'none';
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

    this.onSubmit();

    // Brief delay before hiding so password managers can capture the submission
    setTimeout(() => this.hide(), 100);
  }
}

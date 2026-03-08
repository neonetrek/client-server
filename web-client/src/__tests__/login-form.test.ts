/**
 * Unit tests for LoginFormController (login-form.ts)
 *
 * Covers: mode toggling, registration validation, fetch calls,
 * error display, auto-login after register, login flow, and reset.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoginFormController } from '../login-form';
import { createGameState, GameState } from '../state';

// ============================================================
// DOM setup — create the form elements LoginFormController expects
// ============================================================

function createDOM() {
  document.body.innerHTML = `
    <form id="login-form" class="login-overlay">
      <div class="login-row">
        <input id="login-name" type="text" name="username" maxlength="15" />
      </div>
      <div class="login-row login-email-row">
        <input id="login-email" type="email" name="email" />
      </div>
      <div class="login-row">
        <input id="login-password" type="password" name="password" maxlength="15" />
      </div>
      <div id="login-status" class="login-status"></div>
      <div class="login-bottom-row">
        <button type="button" id="login-toggle" class="login-toggle">New player? Register</button>
        <button type="submit" id="login-submit-btn" class="login-submit">Login</button>
      </div>
    </form>
  `;
}

// ============================================================
// Mock NetrekConnection
// ============================================================

function createMockNet() {
  return {
    sendLogin: vi.fn(),
    sendUpdates: vi.fn(),
  } as any;
}

// ============================================================
// Helpers
// ============================================================

function getForm() { return document.getElementById('login-form')!; }
function getNameInput() { return document.getElementById('login-name') as HTMLInputElement; }
function getEmailInput() { return document.getElementById('login-email') as HTMLInputElement; }
function getPasswordInput() { return document.getElementById('login-password') as HTMLInputElement; }
function getSubmitBtn() { return document.getElementById('login-submit-btn') as HTMLButtonElement; }
function getToggleBtn() { return document.getElementById('login-toggle') as HTMLButtonElement; }
function getStatus() { return document.getElementById('login-status')!; }

// ============================================================
// Tests
// ============================================================

let state: GameState;
let net: ReturnType<typeof createMockNet>;
let onSubmit: ReturnType<typeof vi.fn>;
let controller: LoginFormController;

describe('LoginFormController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createDOM();
    state = createGameState();
    net = createMockNet();
    onSubmit = vi.fn();
    controller = new LoginFormController(net, state, onSubmit);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  // ============================================================
  // Visibility
  // ============================================================
  describe('visibility', () => {
    it('starts hidden', () => {
      expect(controller.isVisible).toBe(false);
      expect(getForm().classList.contains('login-visible')).toBe(false);
    });

    it('show() makes it visible', () => {
      controller.show();
      expect(controller.isVisible).toBe(true);
      expect(getForm().classList.contains('login-visible')).toBe(true);
    });

    it('hide() makes it hidden', () => {
      controller.show();
      controller.hide();
      expect(controller.isVisible).toBe(false);
      expect(getForm().classList.contains('login-visible')).toBe(false);
    });
  });

  // ============================================================
  // Mode toggling
  // ============================================================
  describe('mode toggle', () => {
    it('starts in login mode', () => {
      expect(getSubmitBtn().textContent).toBe('Login');
      expect(getToggleBtn().textContent).toBe('New player? Register');
      expect(getForm().classList.contains('login-register')).toBe(false);
    });

    it('toggles to register mode', () => {
      getToggleBtn().click();
      expect(getSubmitBtn().textContent).toBe('Register');
      expect(getToggleBtn().textContent).toBe('Have an account? Login');
      expect(getForm().classList.contains('login-register')).toBe(true);
    });

    it('toggles back to login mode', () => {
      getToggleBtn().click(); // → register
      getToggleBtn().click(); // → login
      expect(getSubmitBtn().textContent).toBe('Login');
      expect(getToggleBtn().textContent).toBe('New player? Register');
      expect(getForm().classList.contains('login-register')).toBe(false);
    });

    it('changes password autocomplete attribute', () => {
      const pwd = getPasswordInput();
      // jsdom doesn't reflect the HTML autocomplete attribute as a property,
      // so we test the toggle behavior rather than the initial value
      getToggleBtn().click();
      expect(pwd.autocomplete).toBe('new-password');
      getToggleBtn().click();
      expect(pwd.autocomplete).toBe('current-password');
    });

    it('clears status message on toggle', () => {
      getStatus().textContent = 'some error';
      getToggleBtn().click();
      expect(getStatus().textContent).toBe('');
    });
  });

  // ============================================================
  // Registration validation
  // ============================================================
  describe('registration validation', () => {
    beforeEach(() => {
      getToggleBtn().click(); // switch to register mode
    });

    it('rejects empty name', async () => {
      getNameInput().value = '';
      getPasswordInput().value = 'secret';

      getForm().dispatchEvent(new Event('submit'));
      await vi.advanceTimersByTimeAsync(0);

      expect(getStatus().textContent).toContain('2 characters');
    });

    it('rejects single-char name', async () => {
      getNameInput().value = 'A';
      getPasswordInput().value = 'secret';

      getForm().dispatchEvent(new Event('submit'));
      await vi.advanceTimersByTimeAsync(0);

      expect(getStatus().textContent).toContain('2 characters');
    });

    it('rejects empty password', async () => {
      getNameInput().value = 'ValidName';
      getPasswordInput().value = '';

      getForm().dispatchEvent(new Event('submit'));
      await vi.advanceTimersByTimeAsync(0);

      expect(getStatus().textContent).toContain('Password is required');
    });

    it('does not call fetch when validation fails', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      getNameInput().value = '';
      getPasswordInput().value = 'secret';

      getForm().dispatchEvent(new Event('submit'));
      await vi.advanceTimersByTimeAsync(0);

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Registration fetch
  // ============================================================
  describe('registration fetch', () => {
    beforeEach(() => {
      getToggleBtn().click(); // register mode
    });

    it('sends correct POST request on register', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );

      getNameInput().value = 'Picard';
      getEmailInput().value = 'picard@test.com';
      getPasswordInput().value = 'engage';

      getForm().dispatchEvent(new Event('submit'));
      await vi.advanceTimersByTimeAsync(0);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe('/api/auth/register');
      expect(opts!.method).toBe('POST');
      const body = JSON.parse(opts!.body as string);
      expect(body.name).toBe('Picard');
      expect(body.email).toBe('picard@test.com');
      expect(body.password).toBe('engage');
    });

    it('omits email when empty', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );

      getNameInput().value = 'Riker';
      getEmailInput().value = '';
      getPasswordInput().value = 'number1';

      getForm().dispatchEvent(new Event('submit'));
      await vi.advanceTimersByTimeAsync(0);

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.email).toBeUndefined();
    });

    it('shows success message and auto-logins', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );

      getNameInput().value = 'Worf';
      getPasswordInput().value = 'honor';

      getForm().dispatchEvent(new Event('submit'));
      await vi.advanceTimersByTimeAsync(0);

      // Should show success status
      expect(getStatus().textContent).toContain('Logging in');

      // After 300ms, auto-login fires
      await vi.advanceTimersByTimeAsync(300);
      expect(net.sendLogin).toHaveBeenCalledWith('Worf', 'honor', 'Worf');
      expect(net.sendUpdates).toHaveBeenCalled();
      expect(onSubmit).toHaveBeenCalled();
    });

    it('shows error on duplicate name', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: 'Name already taken' }), { status: 200 })
      );

      getNameInput().value = 'Picard';
      getPasswordInput().value = 'engage';

      getForm().dispatchEvent(new Event('submit'));
      await vi.advanceTimersByTimeAsync(0);

      expect(getStatus().textContent).toBe('Name already taken');
      expect(getSubmitBtn().disabled).toBe(false);
    });

    it('shows network error on fetch failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'));

      getNameInput().value = 'Data';
      getPasswordInput().value = 'positronic';

      getForm().dispatchEvent(new Event('submit'));
      await vi.advanceTimersByTimeAsync(0);

      expect(getStatus().textContent).toContain('Network error');
      expect(getSubmitBtn().disabled).toBe(false);
    });

    it('disables submit button during registration', async () => {
      let resolvePromise: (v: Response) => void;
      const fetchPromise = new Promise<Response>(r => { resolvePromise = r; });
      vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(fetchPromise);

      getNameInput().value = 'Troi';
      getPasswordInput().value = 'empathy';

      getForm().dispatchEvent(new Event('submit'));
      await vi.advanceTimersByTimeAsync(0);

      expect(getSubmitBtn().disabled).toBe(true);

      // Resolve the fetch
      resolvePromise!(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  // ============================================================
  // Login mode
  // ============================================================
  describe('login mode', () => {
    it('sends CP_LOGIN on form submit', () => {
      getNameInput().value = 'Picard';
      getPasswordInput().value = 'engage';

      getForm().dispatchEvent(new Event('submit'));

      expect(net.sendLogin).toHaveBeenCalledWith('Picard', 'engage', 'Picard');
      expect(net.sendUpdates).toHaveBeenCalledWith(50000);
    });

    it('defaults to guest when name is empty', () => {
      getNameInput().value = '';
      getPasswordInput().value = '';

      getForm().dispatchEvent(new Event('submit'));

      expect(net.sendLogin).toHaveBeenCalledWith('guest', '', 'guest');
    });

    it('sets warningText during login', () => {
      getNameInput().value = 'Kirk';
      getPasswordInput().value = 'beam';

      getForm().dispatchEvent(new Event('submit'));

      expect(state.warningText).toContain('Kirk');
    });

    it('calls onSubmit callback', () => {
      getForm().dispatchEvent(new Event('submit'));
      expect(onSubmit).toHaveBeenCalledOnce();
    });

    it('hides form after delay', () => {
      controller.show();
      getForm().dispatchEvent(new Event('submit'));
      expect(controller.isVisible).toBe(true); // not yet

      vi.advanceTimersByTime(600);
      expect(controller.isVisible).toBe(false);
    });

    it('does not call fetch in login mode', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      getNameInput().value = 'Picard';
      getPasswordInput().value = 'engage';

      getForm().dispatchEvent(new Event('submit'));

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Reset
  // ============================================================
  describe('reset', () => {
    it('clears all inputs', () => {
      getNameInput().value = 'test';
      getEmailInput().value = 'a@b.com';
      getPasswordInput().value = 'secret';

      controller.reset();

      expect(getNameInput().value).toBe('');
      expect(getEmailInput().value).toBe('');
      expect(getPasswordInput().value).toBe('');
    });

    it('clears status message', () => {
      getStatus().textContent = 'some error';
      controller.reset();
      expect(getStatus().textContent).toBe('');
    });

    it('resets to login mode', () => {
      getToggleBtn().click(); // switch to register
      controller.reset();
      expect(getSubmitBtn().textContent).toBe('Login');
      expect(getForm().classList.contains('login-register')).toBe(false);
    });
  });

  // ============================================================
  // clearPassword
  // ============================================================
  describe('clearPassword', () => {
    it('clears only password input', () => {
      getNameInput().value = 'Picard';
      getPasswordInput().value = 'secret';

      controller.clearPassword();

      expect(getNameInput().value).toBe('Picard');
      expect(getPasswordInput().value).toBe('');
    });
  });

  // ============================================================
  // Input isolation
  // ============================================================
  describe('input isolation', () => {
    it('stops keydown propagation on name input', () => {
      const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
      const stopSpy = vi.spyOn(event, 'stopPropagation');
      getNameInput().dispatchEvent(event);
      expect(stopSpy).toHaveBeenCalled();
    });

    it('stops keydown propagation on email input', () => {
      const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
      const stopSpy = vi.spyOn(event, 'stopPropagation');
      getEmailInput().dispatchEvent(event);
      expect(stopSpy).toHaveBeenCalled();
    });

    it('stops keydown propagation on password input', () => {
      const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
      const stopSpy = vi.spyOn(event, 'stopPropagation');
      getPasswordInput().dispatchEvent(event);
      expect(stopSpy).toHaveBeenCalled();
    });

    it('stops keyup propagation on all inputs', () => {
      for (const el of [getNameInput(), getEmailInput(), getPasswordInput()]) {
        const event = new KeyboardEvent('keyup', { key: 'a', bubbles: true });
        const stopSpy = vi.spyOn(event, 'stopPropagation');
        el.dispatchEvent(event);
        expect(stopSpy).toHaveBeenCalled();
      }
    });
  });
});

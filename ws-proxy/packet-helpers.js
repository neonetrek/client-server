/**
 * Netrek packet helper functions for the WebSocket proxy.
 *
 * Handles building server packets (SP_WARNING, SP_LOGIN) and
 * manipulating client packets (CP_LOGIN password rewriting).
 */

// Build an SP_WARNING packet (type=10, 84 bytes): { type(1), pad1(1), pad2(1), pad3(1), mesg(80) }
function buildSPWarning(message) {
  const buf = Buffer.alloc(84);
  buf[0] = 10; // SP_WARNING
  buf.write(message.substring(0, 79), 4, 'ascii');
  return buf;
}

// Build an SP_LOGIN packet (type=17, 104 bytes): { type(1), accept(1), pad2(1), pad3(1), flags(4), keymap(96) }
function buildSPLoginReject() {
  const buf = Buffer.alloc(104);
  buf[0] = 17; // SP_LOGIN
  buf[1] = 0;  // accept = 0 (reject)
  return buf;
}

// Overwrite the password field in a CP_LOGIN packet with the proxy secret
// CP_LOGIN: { type(1), query(1), pad(2), name(16), password(16), login(16) } = 52 bytes
// Password is at bytes 20-35 (16 bytes, null-padded)
function rewritePassword(buf, secret) {
  buf.fill(0, 20, 36);
  buf.write(secret.substring(0, 15), 20, 'ascii');
}

// Extract null-terminated ASCII string from buffer region
function extractString(buf, start, len) {
  return buf.toString('ascii', start, start + len).replace(/\0.*/, '');
}

// Detect if a buffer is a CP_LOGIN packet
// CP_LOGIN: type=8, 52 bytes total
function isCPLogin(buf) {
  return buf[0] === 8 && buf.length === 52;
}

// Check if a CP_LOGIN is a guest login (name is empty or "guest")
function isGuestLogin(buf) {
  const name = extractString(buf, 4, 16);
  return name === '' || name.toLowerCase() === 'guest';
}

// Check if a CP_LOGIN is a query (stats request, not actual login)
function isQueryLogin(buf) {
  return buf[1] !== 0;
}

// Extract name and password from a CP_LOGIN packet
function extractLoginCredentials(buf) {
  return {
    name: extractString(buf, 4, 16),
    password: extractString(buf, 20, 16),
    login: extractString(buf, 36, 16),
  };
}

// Build a CP_LOGIN packet (for testing)
function buildCPLogin(query, name, password, login) {
  const buf = Buffer.alloc(52);
  buf[0] = 8;  // CP_LOGIN type
  buf[1] = query;
  // bytes 2-3: pad
  buf.write(name.substring(0, 15), 4, 'ascii');
  buf.write(password.substring(0, 15), 20, 'ascii');
  buf.write((login || name).substring(0, 15), 36, 'ascii');
  return buf;
}

module.exports = {
  buildSPWarning,
  buildSPLoginReject,
  rewritePassword,
  extractString,
  isCPLogin,
  isGuestLogin,
  isQueryLogin,
  extractLoginCredentials,
  buildCPLogin,
};

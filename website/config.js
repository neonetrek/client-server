/**
 * NeoNetrek Website Configuration
 *
 * Server hosts: edit these values to customize the website for your server.
 * Rename this file or edit in place — it's loaded by the website automatically.
 */
window.NEONETREK_CONFIG = {
  // Server connection details
  serverHost: "",              // e.g. "netrek.example.com:2592"
  wsProxy: "",                 // e.g. "wss://netrek.example.com:1820"
  webClientUrl: "../web-client/", // Path to the web client

  // Host information (displayed in the Server Info section)
  adminName: "",               // e.g. "YourName"
  adminContact: "",            // e.g. "admin@example.com"
  serverLocation: "",          // e.g. "US East"

  // Welcome message (supports HTML)
  motd: "",

  // Server rules (array of strings)
  rules: [],

  // Leaderboard API endpoint (optional — set to fetch player stats from server)
  // If empty, leaderboard shows sample data
  leaderboardUrl: "",
};

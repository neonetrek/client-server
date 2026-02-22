/**
 * NeoNetrek Community Server Directory — Local Fallback
 *
 * The server list is now fetched at runtime from https://neonetrek.com/servers.json.
 * This file provides an empty fallback array so the portal still works if the
 * fetch fails (e.g. offline development, network issues).
 *
 * To add your server to the directory, open a PR to neonetrek/neonetrek.github.io
 * adding your entry to servers.json.
 */
window.NEONETREK_SERVERS = [];

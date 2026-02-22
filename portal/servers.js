/**
 * NeoNetrek Community Server Directory
 *
 * This file is the canonical list of public NeoNetrek servers.
 *
 * To add your server:
 *   1. Fork the client-server repo
 *   2. Add your server entry below
 *   3. Open a pull request
 *
 * See HOSTING.md for full deployment and listing instructions.
 *
 * Entry format:
 *   name         – Short display name (e.g. "US East Bronco")
 *   url          – Public HTTPS URL where your portal is reachable
 *   location     – City/region, Country (e.g. "New York, US")
 *   description  – One-line summary of the server
 *   history      – Optional. Background, story, or lore behind this server
 *   admin        – Display name of the server operator
 *   established  – Year or date the server was launched (e.g. "2024")
 *   features     – Array of short tags (e.g. ["Beginner friendly", "Clue games"])
 */
window.NEONETREK_SERVERS = [
  {
    name: "London",
    url: "https://neonetrek-lhr.fly.dev",
    location: "London, UK",
    description: "The first NeoNetrek server.",
    history: "Born from memories of the Sun Lab at UUJ Jordanstown, class of '94\u2013'98. The original deployment that brought Netrek back to the browser.",
    admin: "NeoNetrek Team",
    established: "2024",
    features: ["Original server", "Beginner friendly"],
  },
];

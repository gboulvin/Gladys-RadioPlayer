# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainer for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
Radio Browser, the radio streams, and the speakers the integration talks to.

## Security model

What the integration does, so a reviewer knows what to look at:

- **Sandbox.** It runs in the Gladys integration container: read-only root
  filesystem, unprivileged `node` user, a single writable volume `/data`
  holding `radioplayer.json` (favorites, recent stations — no secret).
- **No credentials.** The integration has no account, password, token or API
  key of its own; it never logs the Gladys integration token.
- **Network.** Outbound only:
  - HTTPS to the Radio Browser API (`*.api.radio-browser.info`): station
    search and the play counter;
  - HTTP to the station logos, for the dashboard widgets — downloaded with a
    timeout, at most 300 KB, served only when they are PNG, JPEG or WebP;
  - HTTP(S) to the stream servers of the stations, to find the MP3 version
    of a station: only the response headers are read (the body is cancelled,
    3 s timeout), and a guessed URL always stays on the host of the original
    stream;
  - unicast to the speakers of the LAN: UPnP SOAP over HTTP, Google Cast over
    TLS on port 8009.
- **Discovery** goes through the Gladys core (`network_discovery` in the
  manifest: one mDNS service, two SSDP search targets). An SSDP answer is only
  followed when its `LOCATION` points to the device that answered, so a
  forged answer cannot make the integration fetch another host.
- **Google Cast TLS.** Cast devices present a self-signed certificate, so the
  connection is encrypted but the device is not authenticated, like every
  Cast sender. Only the stream URL, its title and the volume are sent.
- **Untrusted input.** Radio Browser data, SSDP/mDNS answers, UPnP
  descriptions and Cast messages are parsed defensively: XML values are
  escaped in the SOAP and DIDL documents, Cast messages above 64 KB close the
  connection, widget and music texts are bounded.

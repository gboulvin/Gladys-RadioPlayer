# RadioPlayer

Hören Sie die Webradios Ihres Landes auf den Lautsprechern im Haus — Google
Cast, Sonos und UPnP/DLNA — direkt aus Gladys: Dashboard, Musik-Panel,
Widgets und Szenen.

Die Sender stammen aus [Radio Browser](https://www.radio-browser.info), einem
freien, offenen Community-Verzeichnis mit über 50.000 Webradios. Der Katalog
ist der des **gewählten Landes**: seine meistgehörten Sender, seine Genres und
seine Suche.

## Voraussetzungen

- Gladys Assistant **5.3.0** oder neuer.
- **Internetzugang** für Gladys (Katalog) und für die Lautsprecher (sie laden
  den Stream selbst).
- Lautsprecher im **selben lokalen Netzwerk** wie Gladys.

Kein Konto, kein API-Schlüssel. **Kein Ton läuft über Gladys**: Die
Integration sagt dem Lautsprecher, welchen Stream er spielen soll.

## Wo es funktioniert

Der Katalog von 20 Ländern in 6 Zonen. Die Integration lässt sich überall
installieren, der Gladys-Katalog zeigt sie in diesen Ländern an.

| Zone          | Länder (Sender im Katalog, November 2026)                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Westeuropa    | Frankreich (3.500+), Belgien (590+), Luxemburg (35), Niederlande (1.450+), Vereinigtes Königreich (2.300+), Irland (230+) |
| Mitteleuropa  | Deutschland (6.300+), Schweiz (650+), Österreich (360+)                                                                   |
| Südeuropa     | Spanien (1.450+), Portugal (380+), Italien (1.800+)                                                                       |
| Nordamerika   | Kanada (1.550+), Vereinigte Staaten (7.800+)                                                                              |
| Lateinamerika | Mexiko (2.800+), Argentinien (1.150+), Chile (590+), Kolumbien (740+), Peru (310+)                                        |
| Ozeanien      | Australien (1.800+)                                                                                                       |

Konfiguration, Dokumentation und Meldungen gibt es auf **Deutsch, Englisch,
Französisch und Spanisch**.

## In 3 Schritten starten

1. Tab **Konfiguration**: **Katalogland** wählen und speichern.
2. Tab **Erkennung** der Integration: Ihre Lautsprecher stehen dort — fügen
   Sie die gewünschten hinzu. Die Liste ist leer? Zurück zur Konfiguration
   und **Lautsprecher suchen** drücken: Die Suche läuft erneut und zeigt, was
   jeder Kanal (Google Cast, Sonos/DLNA) geantwortet hat.
3. **Hören**: **Jetzt einen Sender abspielen** in der Konfiguration
   (Lautsprecher wählen, Sendernamen eingeben), oder die **Musik**-Box des
   Dashboards, die RadioPlayer-Widgets oder Szenen.

## Unterstützte Lautsprecher

| Familie     | Beispiele                                                                                                                       | Gefunden über |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Google Cast | Chromecast, Chromecast Audio, Google Home / Nest, Android TV, Lautsprecher mit Chromecast built-in (JBL, Sony, Bose, Marshall…) | mDNS          |
| Sonos       | Alle Sonos-Lautsprecher (S1 und S2)                                                                                             | SSDP          |
| UPnP / DLNA | Netzwerk-Receiver (Denon, Marantz, Yamaha, Onkyo, Pioneer), Smart-TVs, Kodi, BubbleUPnP…                                        | SSDP          |

Ein Lautsprecher, den die Suche nicht sieht (anderes Subnetz, Router filtert
Multicast), kann manuell hinzugefügt werden, siehe unten.

## Konfiguration

1. Öffnen Sie den Tab **Konfiguration** der Integration.
2. Wählen Sie das **Katalogland**.
3. Optional:
   - **Startlautstärke** — beim Start eines Senders gesetzte Lautstärke (0
     behält die des Lautsprechers);
   - **MP3-Streams bevorzugen** (standardmäßig an) — spielt die MP3-Version
     eines Senders, wenn es sie gibt: Android TV lehnt reine AAC-Streams ab
     („Inkompatibles Dateiformat“), ältere DLNA-Renderer AAC oder Ogg. Der
     Original-Stream bleibt der Ersatz; bricht ein Lautsprecher einen Stream
     ab, wird automatisch der nächste versucht;
   - **HLS-Streams ausblenden** — viele DLNA-Lautsprecher spielen keine
     HLS-Streams (`.m3u8`): aktiviert lassen, außer alle Lautsprecher sind
     Google Cast;
   - **Google-Cast-Lautsprecher** / **Sonos- und UPnP/DLNA-Lautsprecher** —
     eine nicht genutzte Familie abschalten;
   - **Manuell hinzugefügte Lautsprecher** — die IP-Adresse eines
     Google-Cast-Geräts (z. B. `192.168.1.20`) oder die URL einer
     UPnP-Beschreibung (z. B.
     `http://192.168.1.30:1400/xml/device_description.xml` für Sonos), mit
     Kommas getrennt.
4. Speichern, Tab **Erkennung** öffnen und die Lautsprecher hinzufügen.

## Buttons der Konfiguration

- **Lautsprecher suchen** — durchsucht jetzt das Netzwerk und zeigt das
  Ergebnis.
- **Jetzt einen Sender abspielen** — spielt einen Sender auf einem Ihrer
  Lautsprecher.
- **Radiokatalog testen** — Anzahl der Sender und die fünf meistgehörten
  Ihres Landes.
- **Lautsprecher testen** — prüft, ob ein Lautsprecher antwortet, und seine
  Lautstärke.
- **Favorit hinzufügen / entfernen / anzeigen**.

## Die eingebauten Lautsprecher-Integrationen von Gladys

Gladys bringt auch eigene Sonos-, Google-Cast- und AirPlay-Integrationen
mit. Sie spielen nur Sprachansagen (Text-to-Speech), und Gladys erlaubt
einer anderen Integration nicht, ihre Geräte zu steuern. RadioPlayer findet
und steuert die Lautsprecher daher selbst; ein Lautsprecher kann zugleich
ein eingebautes und ein RadioPlayer-Gerät sein. RadioPlayer-Geräte sind
Gladys-**Musik-Player**: Sie nutzen die eingebaute **Musik**-Box des
Dashboards (läuft gerade, Durchsuchen, Suche) und die eingebaute
Szenenaktion „Medien abspielen“.

## Hören

Jeder Lautsprecher ist ein **Musik-Player** in Gladys:

- das **Musik-Panel** des Dashboards durchsucht den Katalog: _Favoriten_,
  _Top-Sender_ Ihres Landes, _Genres_ (Nachrichten, Talk, Pop, Rock, Oldies,
  Jazz, Klassik, Elektronisch, Hip-Hop, Sport, Kinder) und _Zuletzt gehört_,
  dazu die Suche nach Sendernamen;
- die Gerätekarte bietet Wiedergabe / Pause / Stopp, Lautstärke,
  Stummschaltung und **nächster / vorheriger Sender**: Sie wechseln zwischen
  Ihren Favoriten (ab zwei Favoriten), sonst zwischen den Top-Sendern;
- die Auswahl **Radiosender** des Geräts listet Ihre Favoriten (oder die
  Top-Sender) zum Starten per Fingertipp.

## Favoriten

Bis zu 30 Favoriten, gemeinsam für alle Lautsprecher:

- der Button ☆ **Favorit** des Widgets _Radio – läuft gerade_ fügt den
  laufenden Sender hinzu;
- die Buttons **Favorit hinzufügen**, **Favorit entfernen** und **Favoriten
  anzeigen** der Konfiguration nehmen einen Sendernamen.

## Dashboard-Widgets

- **Radio – läuft gerade** — der Sender eines Lautsprechers, sein Logo,
  Genres und Streamqualität, mit _Zurück_, _Stopp_ / _Abspielen_, _Weiter_
  und _Favorit_.
- **Radio-Presets** — bis zu drei in den Widget-Einstellungen eingetragene
  Sender, per Fingertipp auf einem Lautsprecher gestartet, plus _Stopp_.
- **Top-Radiosender** — die meistgehörten Sender des Landes (oder eines
  Genres) als Raster mit Link zur Website.

## Szenen

**Auslöser** (Kategorie _Integrationen_ des Szeneneditors). Optional den
Lautsprecher wählen; leer passt jeder Lautsprecher.

| Auslöser                      | Wann                                                      | Variablen                           |
| ----------------------------- | --------------------------------------------------------- | ----------------------------------- |
| Radio gestartet               | ein Lautsprecher beginnt zu spielen (Gladys, App, Tasten) | `player`, `station`, `station_uuid` |
| Radio gestoppt                | ein Lautsprecher stoppt oder der Stream bricht ab         | `player`, `station`, `station_uuid` |
| Lautsprecher nicht erreichbar | ein Lautsprecher antwortet nicht mehr im Netzwerk         | `player`                            |

In den folgenden Aktionen mit `{{triggerEvent.data.station}}` lesbar. Ein
Start oder Stopp durch eine RadioPlayer-Szenenaktion löst nichts aus: Eine
Szene kann sich nie selbst in einer Schleife aufrufen.

**Aktionen**

| Aktion                | Parameter                                       | Ausgaben                                  |
| --------------------- | ----------------------------------------------- | ----------------------------------------- |
| Radiosender abspielen | Lautsprecher, Sendername, Lautstärke            | `started`, `station_name`, `station_uuid` |
| Favorit abspielen     | Lautsprecher, Position (1 = erster), Lautstärke | `started`, `station_name`, `station_uuid` |
| Nächster Sender       | Lautsprecher                                    | `started`, `station_name`, `station_uuid` |
| Radio stoppen         | Lautsprecher                                    | `stopped`                                 |

Ein nicht gefundener Sender ist kein Fehler: `started` ist `false`, nutzen
Sie es in einer Bedingung. Das Senderfeld akzeptiert Szenenvariablen.

Beispiel — ein Radiowecker: _Jeden Werktag um 7:00_ → _Radiosender
abspielen_ „Deutschlandfunk“ im Schlafzimmer mit 20 % → _1 Stunde warten_ →
_Radio stoppen_.

## Grenzen

- **Sonos**: auf dem Koordinator einer Gruppe abspielen.
- **Formate**: Ein Sender, der nur in AAC oder Ogg ohne MP3-Version
  sendet, spielt eventuell nicht auf Android TV oder älteren DLNA-Renderern:
  Die Logs nennen den abgelehnten Stream. Wählen Sie einen anderen Sender
  oder einen anderen Eintrag desselben Radios im Katalog.
- **Ältere DLNA-Renderer** lehnen eventuell `https`-Streams oder AAC ab:
  einen anderen Sender oder Stream wählen.
- **HLS**-Streams (`.m3u8`) spielen nur auf Google Cast; sie sind
  ausgeblendet, solange _HLS-Streams ausblenden_ aktiv ist.
- Der Titel des laufenden Songs wird nicht angezeigt, wohl aber Sendername,
  Genres und Streamqualität.

## Fehlerbehebung

- **Kein Lautsprecher in Erkennung**: **Lautsprecher suchen** in der
  Konfiguration drücken und den Bericht lesen. `0 Antwort(en)` auf einem
  Kanal heißt, dass die Lautsprecher nicht auf die Netzwerksuche geantwortet
  haben: Sind sie eingeschaltet und im selben Netzwerk wie Gladys (kein
  Gast-WLAN, kein separates VLAN)? Sonst per IP unter **Manuell hinzugefügte
  Lautsprecher** eintragen. Ein `Fehler` nennt die Ursache.
- **„Der Radiokatalog ist nicht erreichbar“**: Gladys hat kein Internet, oder
  Radio Browser ist gestört (die Integration probiert alle Server).
- **Ein Sender startet nicht**: **Lautsprecher testen** nutzen und einen
  anderen Sender probieren; der Stream ist vielleicht offline.
- Die Integration protokolliert alles: Logs in Gladys öffnen
  (`LOG_LEVEL=debug` für alle Details).

## Datenschutz

Die Integration sendet Radio Browser die Suchen und gespielten Sender
(anonym, ohne Konto). Favoriten und zuletzt gehörte Sender bleiben im
Datenvolume der Integration auf Ihrem Gladys. Sonst verlässt nichts Ihr
Netzwerk.

RadioPlayer ist ein unabhängiges Projekt, ohne Verbindung zu Radio Browser,
Google, Sonos oder Radioplayer Worldwide.

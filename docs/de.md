# OVHcloud DynHost

## Überblick

Diese Integration macht Gladys zum **DynDNS-Client** deiner **OVHcloud-Domain**. Dein Internetanbieter kann die öffentliche Adresse deines Zuhauses jederzeit ändern; mit **DynHost** zeigt ein Name deiner Domain (`zuhause.beispiel.de`) immer auf sie, damit du dein Zuhause, ein NAS oder ein VPN über den Namen erreichst. Gladys prüft die öffentliche Adresse standardmäßig alle 5 Minuten und bittet OVHcloud nur dann um eine Aktualisierung, wenn sie sich geändert hat.

Bis zu **drei Namen**, jeder folgt der **IPv4**-Adresse (A-Eintrag), der **IPv6**-Adresse (AAAA-Eintrag) oder beiden. Jeder Name wird ein Gerät mit seinen Adressen, seinem Status und der Zahl der Änderungen; Szenen können reagieren, wenn sich die öffentliche Adresse ändert oder eine Aktualisierung fehlschlägt, und ein Dashboard-Widget zeigt alles auf einen Blick.

Sie nutzt den offiziellen **DynHost**-Endpunkt von OVHcloud mit einer DynHost-Kennung, derselben, die Router und ddclient verwenden. Es ist eine **Cloud**-Integration: Die öffentliche Adresse wird bei Echo-Diensten gelesen (ipify, icanhazip, ident.me), und OVHcloud wird nur kontaktiert, wenn sich ein Eintrag ändern muss.

## Voraussetzungen

- Gladys Assistant 5.3.0 oder neuer.
- Eine Domain bei OVHcloud, deren DNS-Zone von OVHcloud verwaltet wird.
- Im OVHcloud-Kundencenter deine Domain → Tab **DynHost**:
  1. **Zugänge verwalten** → **Kennung erstellen**: ein Suffix (die Kennung wird `beispiel.de-suffix`), die Subdomain, die sie aktualisieren darf (`zuhause`, oder `*` für alle Namen der Domain), und ein Passwort.
  2. **DynHost hinzufügen**: die Subdomain (`zuhause`, leer für die Domain selbst) und die aktuelle Adresse. Ein A- oder AAAA-Eintrag mit demselben Namen darf noch nicht existieren: Lösche ihn zuerst.
  3. Für IPv6 füge einen zweiten DynHost vom Typ AAAA für denselben Namen hinzu.

## Konfiguration

| Feld                             | Was einzugeben ist                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| DynHost-Name                     | Der vollständige Name: `zuhause.beispiel.de`, oder `beispiel.de` für die Domain selbst.                 |
| DynHost-Kennung                  | Die Kennung aus **Zugänge verwalten** (`beispiel.de-zuhause`). Leer für den 2. und 3. Namen: die des 1. |
| Passwort                         | Das Passwort dieser Kennung (nicht das deines OVHcloud-Kontos).                                         |
| Zu aktualisierende Einträge      | IPv4 (A, Standard), IPv6 (AAAA) oder beide.                                                             |
| Prüfung der öffentlichen Adresse | Jede Minute, alle 5 Minuten (Standard), 15 oder 30 Minuten.                                             |
| Sprache der Texte                | Gerätenamen, Status und Szenen-Zusammenfassungen. Automatisch folgt deinem Dashboard.                   |

Drücke **Verbindung testen**: Jeder Eintrag wird sofort an OVHcloud gesendet, und die Antwort zeigt pro Name „bereits 203.0.113.7“ (die Kennung funktioniert), die neue Adresse oder den Fehler. **Diagnose** schreibt, was die Integration weiß, in den Tab Protokolle, Passwörter verborgen.

## Verwendung

### Geräte

Erstelle unter **Geräteerkennung** ein Gerät pro Name:

| Funktion                    | Inhalt                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| IPv4-Adresse (A-Eintrag)    | Die von OVHcloud für den Namen bestätigte Adresse.                                       |
| IPv6-Adresse (AAAA-Eintrag) | Dasselbe für IPv6, wenn der Name ihr folgt.                                              |
| DynHost-Status              | „Aktuell“, „Wartet auf die erste Prüfung“ oder der letzte Fehler, in Worten.             |
| Adressänderungen            | Die Zahl der von OVHcloud übernommenen Updates; ihr Verlauf zeigt, wann sie stattfanden. |

### Dashboard-Widget

**DynHost** zeigt die öffentliche IPv4 (und IPv6), dann jeden Eintrag mit seinem Status, die Uhrzeit der letzten Prüfung und einen Knopf **Jetzt aktualisieren**.

![Das DynHost-Widget, alle Einträge aktuell, dann eine abgelehnte Kennung (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-ovhcloud-dynhost/main/docs/assets/widgets.de.png)

### Szenen

Auslöser:

- **Öffentliche Adresse geändert**: mit der vorherigen und der neuen Adresse; Filter: IPv4 oder IPv6.
- **Eintrag aktualisiert**: OVHcloud hat einen Namen auf eine neue Adresse gerichtet; Filter: Name, IPv4 oder IPv6.
- **Aktualisierung fehlgeschlagen**: einmal pro Fehler, nicht bei jeder Prüfung; Filter: Name, Fehler (Kennung abgelehnt, unbekannter Name, gesperrt, OVHcloud nicht erreichbar, öffentliche Adresse unbekannt…).

Aktionen:

- **Jetzt aktualisieren**: ein Name oder alle, auf Wunsch auch wenn schon aktuell (höchstens einmal pro Minute und Eintrag); liefert die Zahlen und eine Zusammenfassung. Sie löst nie einen Auslöser aus.
- **Öffentliche Adresse lesen**: die öffentliche IPv4 und IPv6, für eine Nachricht.

Beispiele:

- „Öffentliche Adresse geändert“ → „Neue Adresse: {{triggerEvent.data.ip}}“ an dein Telefon senden.
- „Aktualisierung fehlgeschlagen“, Fehler „Kennung abgelehnt“ → dich daran erinnern, das DynHost-Passwort zu prüfen.
- Jeden Morgen → „öffentliche Adresse lesen“ → in eine Nachricht schreiben.

### Transport

Nur Cloud: Die öffentliche Adresse wird bei `api.ipify.org`, `ipv4.icanhazip.com` und `v4.ident.me` gelesen (der nächste, wenn einer ausfällt; ihre IPv6-Gegenstücke für IPv6), und die Einträge werden per HTTPS mit deiner DynHost-Kennung an `dns.eu.ovhapis.com` gesendet. Diese Dienste sehen nur die Adresse deines Zuhauses. Sonst verlässt nichts dein Netzwerk.

## Fehlerbehebung

- **Kennung oder Passwort abgelehnt**: Die Kennung lautet `domain-suffix` (`beispiel.de-zuhause`), das Passwort ist das dieser Kennung. Nach einer Ablehnung bleibt die Integration nicht hartnäckig (OVHcloud sperrt hartnäckige Clients): Korrigiere die Konfiguration, sie versucht es sofort erneut.
- **Kein DynHost-Eintrag für diesen Namen**: Der DynHost existiert nicht, oder die Kennung deckt nur eine andere Subdomain ab. Erstelle den DynHost im Tab, oder eine Kennung mit der Subdomain `*`.
- **Gesperrt: zu viele Updates**: OVHcloud hat zu häufige Updates abgelehnt. Warte, und vermeide, dass ein anderer Client (Router, ddclient) denselben Namen aktualisiert.
- **Öffentliche IPv6 unbekannt**: Das Docker von Gladys hat keinen IPv6-Zugang zum Internet. Behalte für diesen Namen nur IPv4.
- **Der Name zeigt auf die richtige Adresse, aber das Zuhause ist nicht erreichbar**: Dein Anbieter teilt vielleicht eine IPv4 zwischen mehreren Haushalten (CGNAT); frage nach einer vollen IPv4, oder nutze IPv6.
- Um ein Problem zu melden, gib die Versionen von Gladys und der Integration und die Zeilen des Knopfs **Diagnose** an.

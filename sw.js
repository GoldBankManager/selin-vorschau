/*
 * Service Worker — macht aus der Seite eine App, die auch ohne Netz startet.
 *
 * Zwei Strategien, weil zwei Arten von Dateien unterwegs sind:
 *
 * 1. **Seitenaufrufe: Netz zuerst.** Das Dokument enthält die Namen der
 *    aktuellen Bündel, und die ändern sich bei jedem Bau. Käme es aus dem
 *    Cache, würde die App auf Dateinamen zeigen, die es nicht mehr gibt.
 *    Nur wenn das Netz ausfällt, kommt die letzte gespeicherte Fassung —
 *    dann startet die App eben offline.
 *
 * 2. **Alles andere: Cache zuerst.** Bündel, Bilder und Schriften tragen
 *    einen Inhalts-Hash im Namen und ändern sich nie. Was einmal geladen
 *    wurde, kann dauerhaft aus dem Cache kommen; das ist der Grund, warum
 *    sich der zweite Start anfühlt wie eine installierte App.
 *
 * Der Cachename trägt eine Versionsnummer. Wird sie erhöht, räumt
 * `activate` alle älteren Stände weg.
 */

const CACHE = "selin-v1";

self.addEventListener("install", () => {
  // Sofort übernehmen statt auf das Schließen aller Tabs zu warten.
  self.skipWaiting();
});

self.addEventListener("activate", (ereignis) => {
  ereignis.waitUntil(
    (async () => {
      const namen = await caches.keys();
      await Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (ereignis) => {
  const anfrage = ereignis.request;

  if (anfrage.method !== "GET") return;

  // Fremde Herkunft nicht anfassen — die Schriften liegen bei Bunny Fonts
  // und werden vom Browser ohnehin eigenständig zwischengespeichert.
  const adresse = new URL(anfrage.url);
  if (adresse.origin !== self.location.origin) return;

  if (anfrage.mode === "navigate") {
    ereignis.respondWith(
      (async () => {
        try {
          const antwort = await fetch(anfrage);
          const speicher = await caches.open(CACHE);
          speicher.put("./index.html", antwort.clone());
          return antwort;
        } catch {
          const speicher = await caches.open(CACHE);
          const gespeichert = await speicher.match("./index.html");
          return gespeichert ?? Response.error();
        }
      })(),
    );
    return;
  }

  ereignis.respondWith(
    (async () => {
      const speicher = await caches.open(CACHE);
      const treffer = await speicher.match(anfrage);
      if (treffer) return treffer;

      const antwort = await fetch(anfrage);
      // Nur vollständige Antworten behalten. Teilantworten (206) lassen sich
      // nicht sinnvoll wiederverwenden und werfen beim Ablegen einen Fehler.
      if (antwort.ok && antwort.status === 200) {
        speicher.put(anfrage, antwort.clone());
      }
      return antwort;
    })(),
  );
});

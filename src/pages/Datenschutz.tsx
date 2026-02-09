import './LegalPage.css';

export const Datenschutz = () => {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1>Datenschutzerklärung</h1>
        
        <section>
          <h2>1. Datenschutz auf einen Blick</h2>
          
          <h3>Allgemeine Hinweise</h3>
          <p>
            Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren 
            personenbezogenen Daten passiert, wenn Sie diese Website besuchen. Personenbezogene 
            Daten sind alle Daten, mit denen Sie persönlich identifiziert werden können.
          </p>

          <h3>Datenerfassung auf dieser Website</h3>
          <p>
            <strong>Wer ist verantwortlich für die Datenerfassung auf dieser Website?</strong><br />
            Die Datenverarbeitung auf dieser Website erfolgt durch den Websitebetreiber. 
            Dessen Kontaktdaten können Sie dem Impressum dieser Website entnehmen.
          </p>
        </section>

        <section>
          <h2>2. Hosting und Content Delivery Networks (CDN)</h2>
          
          <h3>Vercel</h3>
          <p>
            Diese Website wird auf Servern von Vercel Inc. gehostet. Anbieter ist die 
            Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA.
          </p>
          <p>
            Vercel erhebt folgende Daten: IP-Adresse, Browserinformationen, Betriebssystem, 
            Zugriffszeitpunkt. Diese Daten werden zur Bereitstellung und Verbesserung des 
            Dienstes verwendet.
          </p>
          <p>
            Weitere Informationen finden Sie in der Datenschutzerklärung von Vercel: 
            <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">
              https://vercel.com/legal/privacy-policy
            </a>
          </p>
        </section>

        <section>
          <h2>3. Allgemeine Hinweise und Pflichtinformationen</h2>
          
          <h3>Datenschutz</h3>
          <p>
            Wir nehmen den Schutz Ihrer persönlichen Daten sehr ernst. Wir behandeln Ihre 
            personenbezogenen Daten vertraulich und entsprechend der gesetzlichen 
            Datenschutzvorschriften sowie dieser Datenschutzerklärung.
          </p>

          <h3>Hinweis zur verantwortlichen Stelle</h3>
          <p>
            Die verantwortliche Stelle für die Datenverarbeitung auf dieser Website ist:<br />
            [Adresse]<br />
            Telefon: [Telefonnummer]<br />
            E-Mail: [E-Mail-Adresse]
          </p>
        </section>

        <section>
          <h2>4. Datenerfassung beim Buchungsvorgang</h2>
          
          <h3>Buchung von Sprechterminen</h3>
          <p>
            Bei der Buchung eines Eltern- und Ausbildersprechtags erheben wir folgende Daten:
          </p>
          <ul>
            <li>Name der erziehungsberechtigten Person</li>
            <li>Name der Schüler*in</li>
            <li>Klasse</li>
            <li>Gewählter Termin und Lehrkraft</li>
          </ul>
          <p>
            <strong>Rechtsgrundlage:</strong> Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. e DSGVO 
            (Wahrnehmung einer Aufgabe im öffentlichen Interesse) in Verbindung mit den schulrechtlichen Bestimmungen.
          </p>
          <p>
            <strong>Speicherdauer:</strong> Die Daten werden nach Abschluss des Eltern- und Ausbildersprechtags und erfolgter 
            Dokumentation gelöscht, spätestens jedoch nach [X Monaten].
          </p>
        </section>

        <section>
          <h2>5. Ihre Rechte</h2>
          <p>Sie haben folgende Rechte:</p>
          <ul>
            <li>Recht auf Auskunft über Ihre gespeicherten Daten (Art. 15 DSGVO)</li>
            <li>Recht auf Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
            <li>Recht auf Löschung (Art. 17 DSGVO)</li>
            <li>Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
            <li>Recht auf Datenübertragbarkeit (Art. 20 DSGVO)</li>
            <li>Widerspruchsrecht (Art. 21 DSGVO)</li>
            <li>Recht auf Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO)</li>
          </ul>
        </section>

        <section>
          <h2>6. Cookies</h2>
          <p>
            Diese Website verwendet Session-Cookies für den Admin-Bereich. Diese Cookies sind 
            technisch notwendig und werden nach Beendigung Ihrer Browser-Sitzung automatisch gelöscht.
          </p>
          <p>
            <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der 
            Funktionsfähigkeit der Website).
          </p>
        </section>

        <section>
          <h2>7. Server-Log-Dateien</h2>
          <p>
            Der Provider der Seiten erhebt und speichert automatisch Informationen in sogenannten 
            Server-Log-Dateien, die Ihr Browser automatisch übermittelt:
          </p>
          <ul>
            <li>Browsertyp und Browserversion</li>
            <li>Verwendetes Betriebssystem</li>
            <li>Referrer URL</li>
            <li>Hostname des zugreifenden Rechners</li>
            <li>Uhrzeit der Serveranfrage</li>
            <li>IP-Adresse</li>
          </ul>
          <p>
            Diese Daten werden nicht mit anderen Datenquellen zusammengeführt und dienen 
            ausschließlich statistischen Zwecken.
          </p>
        </section>

        <a href="/" className="back-link">← Zurück zur Startseite</a>
      </div>
    </div>
  );
};

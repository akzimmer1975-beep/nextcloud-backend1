const BACKEND_URL = "https://nextcloud-backend1.onrender.com/upload";

function log(msg) {
    const d = new Date().toLocaleTimeString();
    document.getElementById("log").innerText += `${d} – ${msg}\n`;
}

async function uploadFile(file, name) {
    if (!file) {
        log(`${name}: keine Datei ausgewählt`);
        return;
    }

    log(`${name}: Upload gestartet`);

    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch(BACKEND_URL, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            log(`${name}: Fehler – ${response.statusText}`);
            return;
        }

        log(`${name}: erfolgreich hochgeladen`);

    } catch (err) {
        log(`${name}: Fehler – ${err.message}`);
    }
}

function uploadAll() {
    uploadFile(document.getElementById("wahlausschreiben").files[0], "wahlausschreiben");
    uploadFile(document.getElementById("wahlvorschlag").files[0], "wahlvorschlag");
    uploadFile(document.getElementById("niederschrift").files[0], "niederschrift");
}


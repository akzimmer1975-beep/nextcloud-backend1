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
    formData.append("bezirk", document.getElementById("bezirk").value);
    formData.append("bkz", document.getElementById("bkz").value);
    formData.append("code", document.getElementById("code").value);
    formData.append("datei1", file); // Backend erwartet datei1, datei2, datei3

    try {
        const response = await fetch(BACKEND_URL, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            log(`${name}: Fehler – ${response.statusText}`);
            return;
        }

        const data = await response.json();
        if(data.ok){
            log(`${name}: erfolgreich hochgeladen`);
        } else {
            log(`${name}: Fehler – ${data.error}`);
        }

    } catch (err) {
        log(`${name}: Fehler – ${err.message}`);
    }
}

function uploadAll() {
    uploadFile(document.getElementById("wahlausschreiben").files[0], "Wahlausschreiben");
    uploadFile(document.getElementById("wahlvorschlag").files[0], "Wahlvorschlag");
    uploadFile(document.getElementById("niederschrift").files[0], "Niederschrift");
}

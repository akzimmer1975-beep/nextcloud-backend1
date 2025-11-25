const BACKEND_URL = "https://nextcloud-backend1.onrender.com/upload";

function log(msg) {
    const d = new Date().toLocaleTimeString();
    document.getElementById("debug").textContent += `${d} – ${msg}\n`;
}

const containers = ["wahlausschreiben","wahlvorschlag","niederschrift"];
const files = {}; // speichern ausgewählter Dateien

containers.forEach(type=>{
    const container = document.getElementById(`drop-${type}`);
    const input = container.querySelector("input[type=file]");
    const status = document.getElementById(`status-${type}`);

    container.addEventListener("click", ()=> input.click());

    container.addEventListener("dragover", e=>{
        e.preventDefault();
        container.classList.add("dragover");
    });

    container.addEventListener("dragleave", e=>{
        e.preventDefault();
        container.classList.remove("dragover");
    });

    container.addEventListener("drop", e=>{
        e.preventDefault();
        container.classList.remove("dragover");
        if(e.dataTransfer.files.length>0){
            input.files = e.dataTransfer.files;
            files[type] = e.dataTransfer.files[0];
            status.textContent = `${files[type].name} ausgewählt`;
            status.style.color="blue";
        }
    });
});

document.getElementById("upload-btn").addEventListener("click", async ()=>{
    const bezirk = document.getElementById("bezirk").value;
    const bkz = document.getElementById("bkz").value;
    const code = document.getElementById("code").value;

    if(!bezirk || !bkz){
        alert("Bitte Bezirk und BKZ ausfüllen!");
        return;
    }

    for(const type of containers){
        const status = document.getElementById(`status-${type}`);
        if(!files[type]){
            status.textContent="Keine Datei ausgewählt";
            status.style.color="gray";
        } else {
            status.textContent="Hochladen...";
            status.style.color="orange";
        }
    }

    const formData = new FormData();
    formData.append("bezirk", bezirk);
    formData.append("bkz", bkz);
    formData.append("code", code);

    containers.forEach((type,i)=>{
        if(files[type]) formData.append(`datei${i+1}`, files[type]);
    });

    try{
        const res = await fetch(BACKEND_URL, { method:"POST", body:formData });
        const data = await res.json();
        log("Serverantwort:");
        log(JSON.stringify(data,null,2));

        containers.forEach((type,i)=>{
            const status = document.getElementById(`status-${type}`);
            if(files[type]){
                if(data.ok){
                    status.textContent = `✔ ${files[type].name} hochgeladen`;
                    status.style.color="green";
                } else {
                    status.textContent = `✖ Fehler: ${data.error}`;
                    status.style.color="red";
                }
            }
        });

    } catch(err){
        log(`Fehler beim Upload: ${err.message}`);
        containers.forEach(type=>{
            const status = document.getElementById(`status-${type}`);
            if(files[type]) {
                status.textContent = "✖ Upload fehlgeschlagen";
                status.style.color="red";
            }
        });
    }
});

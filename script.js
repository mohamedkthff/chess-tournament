const STORAGE_KEY = "chessClubTournamentV2";
let sauvegardeEnCours = Promise.resolve();
const SUPABASE_URL = "https://eujzenilacevkqarezhk.supabase.co";
const SUPABASE_KEY = "sb_publishable_i39UVlqNRnUD7F6bX6EPTA_nC1x3OcN";

const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

let joueurs = [];
let rondes = [];

async function chargerDonnees() {
    try {
        const { data, error } = await supabase
            .from("tournament")
            .select("data")
            .eq("id", 1)
            .single();

        if (error) throw error;

        if (data && data.data) {
            joueurs = data.data.joueurs || [];
            rondes = data.data.rondes || [];
        }
    } catch (erreur) {
        console.error("Erreur de chargement :", erreur.message);

        const local = JSON.parse(
            localStorage.getItem(STORAGE_KEY) || "{}"
        );

        joueurs = local.joueurs || [];
        rondes = local.rondes || [];
    }
}

function sauvegarder() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        joueurs,
        rondes
    }));

    sauvegardeEnCours = sauvegardeEnCours.then(async () => {
        const { error } = await supabase
            .from("tournament")
            .update({
                data: { joueurs, rondes },
                updated_at: new Date().toISOString()
            })
            .eq("id", 1);

        if (error) {
            console.error("Erreur Supabase :", error.message);
        }
    });
}

function echapper(texte) {
    return String(texte).replace(/[&<>"']/g, caractere => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[caractere]);
}

function trouverJoueur(id) {
    return joueurs.find(joueur => joueur.id === id);
}

function calculerPoints(joueurId) {
    let points = 0;

    rondes.forEach(ronde => {
        ronde.matchs.forEach(match => {
            if (match.resultat === "en-attente") return;

            if (match.resultat === "bye" &&
                match.blancId === joueurId) {
                points += 1;
                return;
            }

            if (match.blancId === joueurId) {
                if (match.resultat === "blanc") points += 1;
                if (match.resultat === "nul") points += 0.5;
            }

            if (match.noirId === joueurId) {
                if (match.resultat === "noir") points += 1;
                if (match.resultat === "nul") points += 0.5;
            }
        });
    });

    return points;
}

function calculerStatistiques(joueurId) {
    let joues = 0;
    let victoires = 0;
    let adversaires = [];

    rondes.forEach(ronde => {
        ronde.matchs.forEach(match => {
            if (match.resultat === "en-attente" ||
                match.resultat === "bye") return;

            const estBlanc = match.blancId === joueurId;
            const estNoir = match.noirId === joueurId;

            if (!estBlanc && !estNoir) return;

            joues++;
            adversaires.push(estBlanc ? match.noirId : match.blancId);

            if ((estBlanc && match.resultat === "blanc") ||
                (estNoir && match.resultat === "noir")) {
                victoires++;
            }
        });
    });

    const buchholz = adversaires.reduce((total, adversaireId) => {
        return total + calculerPoints(adversaireId);
    }, 0);

    return { joues, victoires, buchholz };
}

function classementTrie() {
    return [...joueurs].sort((a, b) => {
        const difference = calculerPoints(b.id) - calculerPoints(a.id);
        if (difference !== 0) return difference;

        const buchholzA = calculerStatistiques(a.id).buchholz;
        const buchholzB = calculerStatistiques(b.id).buchholz;

        if (buchholzB !== buchholzA) return buchholzB - buchholzA;

        return a.nom.localeCompare(b.nom, "fr");
    });
}

function ajouterJoueur(nom) {
    nom = nom.trim();

    if (!nom) {
        alert("Entrez le nom du joueur.");
        return;
    }

    if (joueurs.some(j => j.nom.toLowerCase() === nom.toLowerCase())) {
        alert("Ce joueur est déjà inscrit.");
        return;
    }

    if (rondes.length > 0) {
        alert("Pour ajouter un joueur, terminez la préparation avant la première ronde.");
        return;
    }

    joueurs.push({
        id: (Date.now().toString(36) +
            Math.random().toString(36).slice(2, 8)),
        nom
    });

    sauvegarder();
    afficherTout();

    document.getElementById("nomJoueur").value = "";
    document.getElementById("nomJoueur").focus();
}

function supprimerJoueur(id) {
    if (rondes.length > 0) {
        alert("Impossible de supprimer un joueur après la création des rondes.");
        return;
    }

    const joueur = trouverJoueur(id);
    if (!joueur) return;

    if (!confirm("Supprimer " + joueur.nom + " ?")) return;

    joueurs = joueurs.filter(j => j.id !== id);

    sauvegarder();
    afficherTout();
}

function dejaRencontres(id1, id2) {
    return rondes.some(ronde =>
        ronde.matchs.some(match =>
            (match.blancId === id1 && match.noirId === id2) ||
            (match.blancId === id2 && match.noirId === id1)
        )
    );
}

function aDejaEuBye(id) {
    return rondes.some(ronde =>
        ronde.matchs.some(match =>
            match.resultat === "bye" && match.blancId === id
        )
    );
}

function creerRonde() {
    if (joueurs.length < 2) {
        alert("Ajoutez au moins deux joueurs.");
        return;
    }

    if (rondes.some(ronde =>
        ronde.matchs.some(match => match.resultat === "en-attente"))) {
        alert("Enregistrez tous les résultats de la ronde actuelle avant de continuer.");
        return;
    }

    const ordre = classementTrie();
    const nonApparies = [...ordre];
    const matchs = [];

    // Si le nombre de joueurs est impair, attribuer un bye
    // de préférence à un joueur qui n'en a pas encore eu.
    if (nonApparies.length % 2 !== 0) {
        let indexBye = -1;

        for (let i = nonApparies.length - 1; i >= 0; i--) {
            if (!aDejaEuBye(nonApparies[i].id)) {
                indexBye = i;
                break;
            }
        }

        if (indexBye === -1) indexBye = nonApparies.length - 1;

        const joueurBye = nonApparies.splice(indexBye, 1)[0];

        matchs.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            blancId: joueurBye.id,
            noirId: null,
            resultat: "bye"
        });
    }

    // Appariement simple : essayer d'éviter les revanches.
    while (nonApparies.length >= 2) {
        const blanc = nonApparies.shift();

        let indexAdversaire = nonApparies.findIndex(joueur =>
            !dejaRencontres(blanc.id, joueur.id)
        );

        // Si aucune combinaison sans revanche n'est possible,
        // prendre le premier adversaire disponible.
        if (indexAdversaire === -1) indexAdversaire = 0;

        const noir = nonApparies.splice(indexAdversaire, 1)[0];

        matchs.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            blancId: blanc.id,
            noirId: noir.id,
            resultat: "en-attente"
        });
    }

    rondes.push({
        numero: rondes.length + 1,
        matchs
    });

    sauvegarder();
    afficherTout();
}

function enregistrerResultat(rondeNumero, matchId, resultat) {
    const ronde = rondes.find(r => r.numero === rondeNumero);
    if (!ronde) return;

    const match = ronde.matchs.find(m => m.id === matchId);
    if (!match || match.resultat === "bye") return;

    if (!["en-attente", "blanc", "nul", "noir"].includes(resultat)) {
        return;
    }

    match.resultat = resultat;

    sauvegarder();
    afficherTout();
}

function afficherJoueurs() {
    const liste = document.getElementById("listeJoueurs");
    const recherche = document.getElementById("recherche").value
        .trim().toLowerCase();

    liste.innerHTML = "";

    const joueursAffiches = classementTrie().filter(joueur =>
        joueur.nom.toLowerCase().includes(recherche)
    );

    joueursAffiches.forEach((joueur, index) => {
        const ligne = document.createElement("tr");
        const rang = classementTrie().findIndex(j => j.id === joueur.id) + 1;
        const points = calculerPoints(joueur.id);

        ligne.innerHTML = `
            <td>${rang}</td>
            <td><strong>${echapper(joueur.nom)}</strong></td>
            <td>${points.toFixed(1)}</td>
            <td>
                <button class="btn btn-danger btn-small"
                    data-supprimer="${echapper(joueur.id)}"
                    ${rondes.length ? "disabled title='Rondes déjà créées'" : ""}>
                    Supprimer
                </button>
            </td>
        `;

        liste.appendChild(ligne);
    });

    if (joueursAffiches.length === 0) {
        liste.innerHTML = `
            <tr><td colspan="4">Aucun joueur trouvé.</td></tr>
        `;
    }

    document.getElementById("compteurJoueurs").textContent =
        joueurs.length + (joueurs.length > 1 ? " joueurs" : " joueur");

    liste.querySelectorAll("[data-supprimer]").forEach(bouton => {
        bouton.addEventListener("click", () => {
            supprimerJoueur(bouton.dataset.supprimer);
        });
    });
}

function afficherClassement() {
    const tableau = document.getElementById("tableClassement");
    tableau.innerHTML = "";

    const classement = classementTrie();

    classement.forEach((joueur, index) => {
        const stats = calculerStatistiques(joueur.id);
        const ligne = document.createElement("tr");

        let medaille = index === 0 ? "🏆 " :
                       index === 1 ? "🥈 " :
                       index === 2 ? "🥉 " : "";

        ligne.innerHTML = `
            <td><strong>${medaille}${index + 1}</strong></td>
            <td>${echapper(joueur.nom)}</td>
            <td><strong>${calculerPoints(joueur.id).toFixed(1)}</strong></td>
            <td>${stats.joues}</td>
            <td>${stats.victoires}</td>
            <td>${stats.buchholz.toFixed(1)}</td>
        `;

        tableau.appendChild(ligne);
    });

    if (classement.length === 0) {
        tableau.innerHTML = `
            <tr><td colspan="6">Le classement apparaîtra ici.</td></tr>
        `;
    }
}

function afficherRondes() {
    const conteneur = document.getElementById("listeRondes");
    conteneur.innerHTML = "";

    if (rondes.length === 0) {
        conteneur.innerHTML = `
            <div class="empty-state">
                <span>♟</span>
                <p>Aucune ronde pour le moment.</p>
                <small>Ajoutez au moins deux joueurs pour commencer.</small>
            </div>
        `;
        return;
    }

    rondes.forEach(ronde => {
        const carte = document.createElement("div");
        carte.className = "round-card";

        const termines = ronde.matchs.filter(match =>
            match.resultat !== "en-attente"
        ).length;

        carte.innerHTML = `
            <div class="round-header">
                <h3>Ronde ${ronde.numero}</h3>
                <span>${termines} / ${ronde.matchs.length} terminés</span>
            </div>
        `;

        ronde.matchs.forEach((match, index) => {
            const blanc = trouverJoueur(match.blancId);

            if (!blanc) return;

            if (match.resultat === "bye") {
                const ligneBye = document.createElement("div");
                ligneBye.className = "bye";
                ligneBye.textContent =
                    blanc.nom + " — exempt : 1 point attribué.";
                carte.appendChild(ligneBye);
                return;
            }

            const noir = trouverJoueur(match.noirId);
            if (!noir) return;

            const ligne = document.createElement("div");
            ligne.className = "match-row";

            const select = document.createElement("select");
            select.setAttribute("aria-label", "Résultat du match");

            const options = [
                ["en-attente", "Résultat à saisir"],
                ["blanc", "Victoire des Blancs"],
                ["nul", "Match nul"],
                ["noir", "Victoire des Noirs"]
            ];

            options.forEach(([valeur, texte]) => {
                const option = document.createElement("option");
                option.value = valeur;
                option.textContent = texte;
                select.appendChild(option);
            });

            select.value = match.resultat;
            select.disabled = rondes
                .slice(ronde.numero)
                .some(r => r.matchs.some(m =>
                    m.blancId === match.blancId ||
                    m.noirId === match.blancId ||
                    m.blancId === match.noirId ||
                    m.noirId === match.noirId
                ));

            select.addEventListener("change", () => {
                enregistrerResultat(ronde.numero, match.id, select.value);
            });

            const resultatTexte = {
                "en-attente": "En attente",
                "blanc": "Victoire des Blancs",
                "nul": "Match nul",
                "noir": "Victoire des Noirs"
            }[match.resultat];

            ligne.innerHTML = `
                <div class="match-player">♙ ${echapper(blanc.nom)}</div>
                <div class="vs">VS</div>
                <div class="match-player">♟ ${echapper(noir.nom)}</div>
            `;

            const controles = document.createElement("div");
            controles.className = "match-controls";

            const etiquette = document.createElement("span");
            etiquette.className = "result-label";
            etiquette.textContent = resultatTexte;

            controles.appendChild(select);
            controles.appendChild(etiquette);
            ligne.appendChild(controles);
            carte.appendChild(ligne);
        });

        conteneur.appendChild(carte);
    });
}

function afficherStatistiques() {
    document.getElementById("totalJoueurs").textContent = joueurs.length;
    document.getElementById("totalRondes").textContent = rondes.length;

    const totalMatchs = rondes.reduce((total, ronde) =>
        total + ronde.matchs.filter(match =>
            match.resultat !== "en-attente"
        ).length, 0
    );

    document.getElementById("totalMatchs").textContent = totalMatchs;

    const classement = classementTrie();
    const leader = classement.length ? classement[0] : null;

    document.getElementById("leader").textContent = leader
        ? leader.nom
        : "—";

    document.getElementById("btnRonde").disabled =
        joueurs.length < 2 ||
        rondes.some(ronde =>
            ronde.matchs.some(match => match.resultat === "en-attente")
        );
}

function exporterCSV() {
    const lignes = [
        ["Rang", "Joueur", "Points", "Matchs joués", "Victoires", "Buchholz"]
    ];

    classementTrie().forEach((joueur, index) => {
        const stats = calculerStatistiques(joueur.id);

        lignes.push([
            index + 1,
            joueur.nom,
            calculerPoints(joueur.id),
            stats.joues,
            stats.victoires,
            stats.buchholz
        ]);
    });

    const csv = "\uFEFF" + lignes.map(ligne =>
        ligne.map(valeur =>
            '"' + String(valeur).replace(/"/g, '""') + '"'
        ).join(";")
    ).join("\r\n");

    const fichier = new Blob([csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(fichier);
    const lien = document.createElement("a");

    lien.href = url;
    lien.download = "classement-tournoi-echecs.csv";
    lien.click();

    URL.revokeObjectURL(url);
}

function reinitialiserTournoi() {
    if (!confirm(
        "Attention : supprimer tous les joueurs, rondes et résultats ? Cette action est irréversible."
    )) return;

    joueurs = [];
    rondes = [];

    sauvegarder();
    afficherTout();
}

async function mettreAJourAccesProf() {
    const { data } = await supabase.auth.getSession();
    const connecte = !!data.session;

    document.getElementById("formJoueur").hidden = !connecte;
    document.getElementById("btnRonde").disabled = !connecte;
    document.getElementById("btnReset").disabled = !connecte;

    document.getElementById("btnExport").disabled = false;

    document.getElementById("loginForm").hidden = connecte;
    document.getElementById("logoutBtn").hidden = !connecte;
}
function afficherTout() {
    afficherJoueurs();
    afficherClassement();
    afficherRondes();
    afficherStatistiques();

    mettreAJourAccesProf();
}

document.getElementById("formJoueur").addEventListener("submit", evenement => {
    evenement.preventDefault();
    ajouterJoueur(document.getElementById("nomJoueur").value);
});

document.getElementById("recherche").addEventListener("input", afficherJoueurs);

document.getElementById("btnRonde").addEventListener("click", creerRonde);

document.getElementById("btnExport").addEventListener("click", exporterCSV);

document.getElementById("btnReset").addEventListener("click", reinitialiserTournoi);

const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");
const loginMessage = document.getElementById("loginMessage");

loginForm.addEventListener("submit", async (evenement) => {
    evenement.preventDefault();

    const email = document.getElementById("emailProf").value;
    const password = document.getElementById("passwordProf").value;

    loginMessage.textContent = "Connexion en cours...";

    const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
});

if (error) {
    loginMessage.textContent = "Erreur : " + error.message;
    console.error(error);
    return;
}

loginMessage.textContent = "Connexion réussie !";
loginForm.hidden = true;
logoutBtn.hidden = false;

await mettreAJourAccesProf();

});

logoutBtn.addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
        loginMessage.textContent = "Erreur lors de la déconnexion.";
        return;
    }

    loginForm.hidden = false;
    logoutBtn.hidden = true;
    loginMessage.textContent = "Déconnecté.";
    await mettreAJourAccesProf();
});
chargerDonnees().then(() => {
    afficherTout();
});
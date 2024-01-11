const bcrypt = require("bcrypt");
const saltRounds = 10; // Le coût du hachage, généralement recommandé entre 10 et 12.
const fs = require("fs");
const CryptoJS = require("crypto-js");
const dotenv = require("dotenv");

async function hashPassword(password) {
    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        return hashedPassword;
    } catch (error) {
        throw error;
    }
}

const getFileSizeInMegabytes = (filePath) => {
    const stats = fs.statSync(filePath);
    const fileSizeInBytes = stats.size;
    const fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024);
    return fileSizeInMegabytes;
};

async function comparePassword(plainPassword, hashedPassword) {
    try {
        const match = await bcrypt.compare(plainPassword, hashedPassword);
        return match;
    } catch (error) {
        throw error;
    }
}

const encryptionKey =
    "es(;0|_V)s*Dn8Gfe.crH{9Rw{5^?K@l%[}7j)(7#G#*3(vyqrF<BVxbIAnAP>8";

function readAdmins() {
    try {
        // Lire le fichier chiffré
        const encryptedData = fs.readFileSync("./adminsSecured.json", "utf8");

        // Déchiffrer les données JSON
        const decryptedData = CryptoJS.AES.decrypt(
            encryptedData,
            encryptionKey
        ).toString(CryptoJS.enc.Utf8);

        // Parser les données JSON en tant qu'objet JavaScript
        const adminsData = JSON.parse(decryptedData);

        // Retourner le tableau contenu dans admins.json
        return adminsData;
    } catch (error) {
        console.error(
            "Une erreur s'est produite lors de la lecture et du déchiffrement du fichier :",
            error
        );
        return null;
    }
}

function chiffrerFichierJSON() {
    try {
        // Lire le contenu du fichier JSON
        const jsonData = fs.readFileSync("./admins.json", "utf8");

        const encryptedData = CryptoJS.AES.encrypt(
            jsonData,
            encryptionKey
        ).toString();

        // Écrire les données chiffrées dans un fichier
        fs.writeFileSync("adminsSecured.json", encryptedData);

        console.log("Fichier JSON chiffré avec succès.");
    } catch (error) {
        console.error(
            "Une erreur s'est produite lors du chiffrement du fichier JSON :",
            error
        );
    }
}

module.exports = {
    hashPassword,
    comparePassword,
    readAdmins,
    getFileSizeInMegabytes,
};

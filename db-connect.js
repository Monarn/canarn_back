const { MongoClient } = require("mongodb");

const uri = "mongodb://127.0.0.1:27017";

const connectMusicDB = async () => {
    try {
        const musicDBName = "canarn";
        const client = new MongoClient(uri);
        await client.connect();

        const canarnDB = client.db(musicDBName);

        return { client, canarnDB };
    } catch (error) {
        console.log("Connexion à la base de données impossible");
    }
};

module.exports = { connectMusicDB };

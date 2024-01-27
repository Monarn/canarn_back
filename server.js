const express = require("express");
const fs = require("fs");
const cors = require("cors");
const https = require("https");
const cookieParser = require("cookie-parser");

const bodyParser = require("body-parser");

const {
  addUser,
  loginUser,
  verifyAuthToken,
  verifyAccount,
  setTokenResetPassword,
  resetPassword,
  disconnectUser,
} = require("./accounts");

const {
  uploadMusic,
  fetchMusic,
  likeMusic,
  fetchQueue,
  deleteMusic,
  getMusic,
} = require("./musics");

const app = express();
const port = 4000;

app.use(cookieParser());

const httpsOptions = {
  key: fs.readFileSync("./certs/canarn.fr/privkey.pem"), // Chemin vers votre clé privée
  cert: fs.readFileSync("./certs/canarn.fr/fullchain.pem"), // Chemin vers votre certificat
};

const server = https.createServer(httpsOptions, app);

const corsOptions = {
  origin: [
    "https://canarn.fr",
    "http://localhost:3000",
    "http://192.168.1.29",
  ],
  methods: "GET,POST",
  allowedHeaders: "Content-Type,Authorization",
  credentials: true,
};

app.use(cors(corsOptions));

app.use(bodyParser.json());

app.post("/accounts/setTokenResetPassword", setTokenResetPassword);

app.get("/accounts/resetPassword", resetPassword);

app.get("/accounts/verifyAccount", verifyAccount);

app.post("/accounts/verifyTokens", verifyAuthToken);

app.post("/accounts/addUser", addUser);

app.post("/accounts/loginUser", loginUser);

app.get("/accounts/disconnectUser", disconnectUser);

app.post("/music/uploadMusic", uploadMusic);

app.get("/music/fetchMusic", fetchMusic);

app.get("/music/likeMusic", likeMusic);

app.get("/music/fetchQueue", fetchQueue);

app.get("/music/deleteMusic", deleteMusic);

app.get("/music/getMusic", getMusic);

server.listen(port, () => {
  console.log(`Serveur Express en cours d'exécution sur le port ${port}`);
});

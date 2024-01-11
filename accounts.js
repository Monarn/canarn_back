const crypto = require("crypto");
const dbconnect = require("./db-connect");
const he = require("he");
const functions = require("./functions");
const jwt = require("jsonwebtoken");
const { sendMail } = require("./sendMail");
const { tokenKey } = require("./keys");

// SYSTEME DE REFRESHTOKEN A REVOIR (EXPIRE PREMATUREMENT)

const secretKey = tokenKey;

const setTokenResetPassword = async (req, res) => {
    try {
        const email = req.body.email;

        if (!email) {
            return res.status(401).json({
                success: false,
                message: "Veuillez entrer une adresse mail",
            });
        }

        const { client, canarnDB } = await dbconnect.connectMusicDB();
        const users = canarnDB.collection("users");

        const userToPsw = await users.findOne({ email });

        if (userToPsw) {
            payload = { userUID: userToPsw.userUID };
            const tokenPsw = jwt.sign(payload, secretKey, { expiresIn: "1h" });

            await users.updateOne(
                { _id: userToPsw._id },
                { $set: { resetPasswordToken: tokenPsw } }
            );

            sendPasswordMail(email, userToPsw.pseudo, tokenPsw);
        }

        client.close();

        res.status(200).json({
            success: true,
            message: `Un email a été envoyé à ${email}`,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "An error occured : " + error,
        });
    }
};

const sendPasswordMail = async (dest, pseudo, passwordToken) => {
    const subject = "Canarn : Nouveau mot de passe";

    const body = `Salut ${pseudo} ! 
    \nTu as oublié ton mot de passe ? Appuie sur le lien (valide une heure) :
    https://canarn.fr/resetPassword/${passwordToken}
    
    Ce n'est pas toi ? Ne clique pas sur le lien et supprime cet email`;

    sendMail(dest, subject, body);
};

const resetPassword = async (req, res) => {
    try {
        const { password, confirmPassword, token } = req.body;

        const user = jwt.verify(token, secretKey);

        if (password !== confirmPassword) {
            return res.status(401).json({
                success: false,
                message: "Les mots de passes ne correspondent pas",
            });
        }

        if (password.length < 8 || password.length >= 25) {
            return res.status(401).json({
                success: false,
                message: "Le mot de passe doit avoir entre 8 et 25 caractères",
            });
        }

        const { client, canarnDB } = await dbconnect.connectMusicDB();
        const users = canarnDB.collection("users");

        const changePswUser = await users.findOne({ userUID: user.userUID });

        if (!changePswUser) {
            return res.status(401).json({
                success: false,
                message: "Une erreur s'est produite, veuillez réessayer",
            });
        }

        await users.updateOne(
            { userUID: changePswUser.userUID },
            { $set: { password: await functions.hashPassword(password) } }
        );

        res.status(200).json({
            success: true,
            message: "Mot de passe changé avec succès",
        });

        client.close();
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Une erreur est arrivée ou la demande n'est plus active",
        });
    }
};

// Verify user account with the verificationToken

const verifyAccount = async (req, res) => {
    try {
        const verificationToken = req.query.token;

        const { client, canarnDB } = await dbconnect.connectMusicDB();
        const users = canarnDB.collection("users");

        const userToVerify = await users.findOne({ verificationToken });

        if (!userToVerify) {
            return res.status(401).json({
                success: false,
                message: "Invalid token",
            });
        }

        await users.updateOne(
            { _id: userToVerify._id },
            { $set: { verificationToken: null } }
        );

        res.redirect(200, "https://canarn.fr/connect");

        client.close();
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "An error occured : " + error,
        });
    }
};

// Wrapper to sendMail : used to verify a user email

const sendVerificationMail = async (dest, pseudo, verificationToken) => {
    const subject = "Canarn : Vérification de compte";

    const body = `Salut ${pseudo} ! Bienvenue sur Canarn !
    \nVérifie ton compte en cliquant sur ce lien :
    https://canarn.fr:4000/accounts/verifyAccount?token=${verificationToken}`;

    sendMail(dest, subject, body);
};

// Verify if user token is valid

const disconnectUser = async (req, res) => {
    try {
        res.clearCookie("refreshToken");
        res.status(200).json({
            success: true,
            message: "Utilisateur déconnecté",
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: "Une erreur s'est produite " + error,
        });
    }
};

const verifyAuthToken = async (req, res) => {
    const { accessToken } = req.body;

    try {
        const refreshToken = req.cookies.refreshToken;
        const rTVerif = jwt.verify(refreshToken, secretKey);

        try {
            const aTVerif = jwt.verify(accessToken, secretKey);
            res.status(200).json({
                success: true,
                message: "Tokens OK",
                payload: aTVerif,
            });
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                const { exp, ...payloadWithoutExp } = rTVerif;
                const newToken = jwt.sign(payloadWithoutExp, secretKey, {
                    expiresIn: "3h",
                });
                const newPayload = jwt.verify(newToken, secretKey);

                return res.status(200).json({
                    success: "refresh",
                    message: "Refreshed access token",
                    payload: newPayload,
                    token: newToken,
                });
            } else {
                res.status(401).json({
                    success: false,
                    message: "Access token not valid: " + error,
                });
            }
        }
    } catch (error) {
        res.status(401).json({
            success: false,
            message: "Refresh token not valid: " + error,
        });
    }
};

const loginUser = async (req, res) => {
    try {
        const { client, canarnDB } = await dbconnect.connectMusicDB();
        const users = canarnDB.collection("users");

        const { email, password } = req.body;

        const existingUser = await users.findOne({ email });

        const pswCheck = existingUser
            ? await functions.comparePassword(password, existingUser.password)
            : false;

        if (existingUser && existingUser.lastFailedAttempt) {
            const cooldownDuration = 5 * 1000; // Délai de cooldown de 5 minutes
            const currentTime = Date.now();

            if (
                currentTime - existingUser.lastFailedAttempt <
                cooldownDuration
            ) {
                return res.status(429).json({
                    success: false,
                    message: "Veuillez attendre avant de réessayer.",
                });
            }
        }

        if (!existingUser || !pswCheck) {
            if (existingUser) {
                await users.updateOne(
                    { _id: existingUser._id },
                    { $set: { lastFailedAttempt: new Date() } }
                );
            }
            return res.status(401).json({
                success: false,
                message:
                    "L'utilisateur n'existe pas ou le mot de passe est mauvais",
            });
        }

        if (existingUser.verificationToken !== null) {
            return res.status(401).json({
                success: false,
                message: "Veuillez vérifier votre compte",
            });
        }

        await users.updateOne(
            { _id: existingUser._id },
            { $set: { lastConnection: new Date() } }
        );

        const admins = functions.readAdmins();

        const payload = {
            userUID: existingUser.userUID,
            pseudo: existingUser.pseudo,
            email: existingUser.email,
            lastConnection: existingUser.lastConnection,
            admin: admins.includes(existingUser.userUID),
        };

        const accessToken = jwt.sign(payload, secretKey, { expiresIn: "3h" });
        const refreshToken = jwt.sign(payload, secretKey, { expiresIn: "14d" });

        res.cookie("refreshToken", refreshToken, {
            httpOnly: false,
            secure: false,
            maxAge: 24 * 60 * 60 * 1000 * 14,
        });

        res.status(200).json({
            success: true,
            token: accessToken,
        });

        client.close();
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Impossible d'effectuer la requête " + error,
        });
    }
};

const addUser = async (req, res) => {
    try {
        const { client, canarnDB } = await dbconnect.connectMusicDB();
        const users = canarnDB.collection("users");

        const { pseudo, email, password, confirmPassword } = req.body;

        if (password.length < 8 || password.length >= 25) {
            client.close();
            return res.status(400).json({
                success: false,
                message: "Le mot de passe doit avoir entre 8 et 25 caractères",
            });
        }

        if (pseudo.length < 4 || pseudo.length >= 25) {
            client.close();
            return res.status(400).json({
                success: false,
                message: "Le pseudo doit avoir entre 4 et 25 caractères",
            });
        }

        if (password !== confirmPassword) {
            client.close();
            return res.status(400).json({
                success: false,
                message: "Les mots de passes ne sont pas similaires",
            });
        }

        const currentDate = new Date();

        const userUID = crypto.randomBytes(30).toString("hex");
        const verificationToken = crypto.randomBytes(30).toString("hex");

        const hashedPassword = await functions.hashPassword(password);

        // USER SCHEME
        const newUser = {
            pseudo: he.encode(pseudo),
            email: he.encode(email),
            password: hashedPassword,
            creationDate: currentDate,
            lastConnection: false,
            userUID: userUID,
            verificationToken: verificationToken,
            lastFailedAttempt: null,
            resetPasswordToken: null,
        };

        await users.insertOne(newUser);

        await sendVerificationMail(email, pseudo, verificationToken);

        client.close();

        res.status(200).json({
            success: true,
            message: `L'utilisateur est créé.\nConfirmez votre compte en cliquant sur le lien envoyé à ${email}`,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Impossible d'effectuer la requête",
        });
    }
};

module.exports = {
    addUser,
    loginUser,
    verifyAuthToken,
    verifyAccount,
    setTokenResetPassword,
    resetPassword,
    disconnectUser,
};
